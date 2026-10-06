// Enemy gunships you can board.
//
// A gunship flies in, then HUNTS: her captain flies a ring round our ship (ahead, above, below, behind -
// see config GUNSHIP.NODES), stopping at firing spots to fire broadsides from her gun ports (they glow
// first) and, from high spots, dropping paratroopers who parachute onto our catwalk. She is solid: her
// outline is tested against rock every step and she is pushed out (clang, damage, bounce), and her
// helmsman looks ahead for rock and picks free spots. The crew can:
//   - shoot her gun ports out (each has hp) or shoot her down (slow - she's armoured), or
//   - fire the hookshot from the very front of the main deck: a grapple rope ties her to our bow
//     (only if she's within range). Press Action at our bow to swing across (landing with a stomp
//     that knocks her crew back), fight her crew, and hold Action at her boiler to plant a charge.
//     Then swing back before it blows! Anyone still aboard falls, and comes round in the medical
//     bay. Blowing her up brings supplies aboard.
// Once her guns are all down (or her gunners are dead) she LATCHES ON: she closes in, fires her own
// grapple at our bow and sends her guards across the rope to board us. Hold Action at our bow to cut it.
// Her crew run her systems, and each one matters:
//   gunners  - man the gun ports; no gunners = no broadsides (each gunner adds a shot)
//   stoker   - feeds her boiler; without one her guns reload at half speed
//   helmsman - flies her; without one she can't steer or hold station and just drifts
//   guards   - fight boarders, cut the line, patch her hull, and refill empty posts
// If nobody deals with it, it leaves after a while.
//
// She has her OWN physics: engines + gas lift of her own (g.wvx / g.wvy are her speeds through the
// world) and a helmsman's controller that tries to hold station, lagging and overshooting. Her
// position is stored as an offset from our ship (g.dx, g.dy, in ship coordinates; dy is down).
// Everything on her (crew, posts, boarders) lives in her own "home frame" (x = GS.x0..GS.x1,
// y = GS.deckY) and is shifted by (g.dx, g.dy) to reach ship coordinates - see deckAt().
// The rope only pulls when taut: a gentle tug on us, a hard one on her; it snaps if stretched too far.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { inRock, scrollSpeed } from './course.js';
import { platformBelow } from './nav.js';
import { pop } from './popups.js';

const G = config.GUNSHIP;
const P = SHIP_LAYOUT.platforms;
const MAIN = P.findIndex((p) => p.id === 'main');
const CAT = P.findIndex((p) => p.id === 'catwalk');
export const MAIN_X1 = P[MAIN].x1; // the bow end of our main deck
export const GS = { x0: 2050, x1: 3150, deckY: P[MAIN].y, boilerX: 2950 };
// Where each job stands on her deck (gunners stack up by the gun ports).
export const POSTS = { gunner: [GS.x0 + 60, GS.x0 + 150], helm: [GS.x0 + 560], stoker: [GS.boilerX - 110] };
const ROLES = ['gunner', 'helm', 'stoker', 'guard', 'gunner', 'guard', 'guard', 'guard'];
export const ANCHOR = { x: GS.x0 - 170, y: GS.deckY - 330 }; // her yardarm in her home frame, where the rope is caught
export const BOW = { x: MAIN_X1 + 10, y: P[MAIN].y - 50 }; // where our end of the rope is tied (ship coords)
const LAND_X = GS.x0 + 40; // where a swing lands on her deck (home frame)
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Her outline in her home frame: points around the gasbag ellipse (every ~2.5 degrees), the hull box (every ~55px) and a few across the middle,
// grown by m pixels. (Map squares are 200px; the look-ahead and spot-finding versions use fewer points.)
function outline(m, n = 144, hn = 24) {
  const cx = (GS.x0 + GS.x1) / 2;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * (660 + m), 380 + Math.sin(a) * (160 + m)]);
  }
  const hx0 = GS.x0 - 60 - m;
  const hx1 = GS.x1 + 90 + m;
  const hy0 = GS.deckY - 80 - m;
  const hy1 = GS.deckY + 120 + m;
  for (let k = 0; k <= hn; k++) {
    const x = hx0 + ((hx1 - hx0) * k) / hn;
    pts.push([x, hy0], [x, hy1]);
  }
  pts.push([hx0, (hy0 + hy1) / 2], [hx1, (hy0 + hy1) / 2]);
  for (const x of [GS.x0 + 100, cx, GS.x1 - 100]) pts.push([x, 470], [x, (hy0 + hy1) / 2]);
  pts.push([cx, 380]);
  return pts;
}
const PTS = outline(4); // collision (4px of slop covers rock corners that poke between the sample points)
const PTS_LOOK = outline(30, 48, 10); // the helmsman's look-ahead
const PTS_SPOT = outline(G.ROCK_MARGIN, 48, 10); // choosing somewhere to sit
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const NODE_NAMES = Object.keys(G.NODES);

// Hunting or latched on (the phases in which she can be boarded, and her crew fights back).
const engaged = (g) => g.phase === 'hunt' || g.phase === 'latch';

// Where a player/point standing on her deck is, in ship coordinates (null if she isn't there).
export function deckAt(g, x = 0, y = GS.deckY) {
  return g ? { x: x + g.dx, y: y + g.dy } : null;
}
// Her yardarm (where the rope hooks on), in ship coordinates.
export const anchorAt = (g) => ({ x: ANCHOR.x + g.dx, y: ANCHOR.y + g.dy });

export function createGunship({ state, puff, impact, credit, dropOne, pickType }) {
  state.gunship = null;
  state.paras = []; // paratroopers in the air (world coordinates, like shells)
  const S = (state.gsStats = { spawned: 0, dropped: 0, shot: 0, landed: 0, latches: 0, cut: 0, sent: 0, portsDown: 0, contacts: 0, collisions: 0, reverts: 0, maxDepth: 0, breakoffs: 0, shots: 0 });
  let timer = G.FIRST_AFTER;
  const warn = (text, secs = 3.5) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const lap = () => (state.course ? state.course.lap : 1);

  // Is any of this outline (at offset dx, dy from our ship) inside rock?
  const hits = (dx, dy, pts) => {
    const alt = state.ship.alt;
    for (const [x, y] of pts) if (inRock(state, x + dx, y + dy - alt)) return true;
    return false;
  };
  const freeAt = (dx, dy) => !hits(dx, dy, PTS_SPOT); // room to sit here, with a margin round her?

  // Distance from our bow to her yardarm, and whether she's within reach of hook / swing.
  const gap = (g) => {
    const a = anchorAt(g);
    return Math.hypot(a.x - BOW.x, a.y - BOW.y);
  };

  // Someone leaves her deck without a rope to stand on: they fall from where they are now.
  const dropOff = (p) => {
    const g = state.gunship;
    if (p.onGunship) {
      p.x += g ? g.dx : 0;
      p.y += g ? g.dy : 0;
    }
    p.onGunship = false;
    p.fall = true;
    p.lock = null;
    p.conn = null;
    p.air = false;
    p.jz = 0;
  };
  const dropAll = () => {
    for (const p of Object.values(state.players)) if (p.onGunship) dropOff(p);
  };

  const setRope = (on) => {
    const g = state.gunship;
    if (!g) return;
    g.rope = on;
    if (!on) g.herRope = false;
    g.ropeLen = on ? Math.max(G.BOARD_LEN, gap(g)) : 0;
    g.ropeT = 0;
    g.tension = 0;
  };
  const snap = (text = 'THE ROPE SNAPS!') => {
    const g = state.gunship;
    if (!g || !g.rope) return;
    const a = anchorAt(g);
    setRope(false);
    if (g.phase === 'latch') g.latchCd = G.LATCH_RETRY; // she'll try again
    puff((a.x + BOW.x) / 2, (a.y + BOW.y) / 2 - state.ship.alt, '#d8c79a', 10);
    state.sfxQ && state.sfxQ.push(['hit']);
    warn(text, 2.5);
  };

  // Somewhere to appear: a spot off our bow that is clear of rock (null if every try is inside rock).
  const spawnDy = () => {
    for (let k = 0; k < 6; k++) {
      const dy = rand(-G.START_DY, G.START_DY);
      if (!hits(G.START_DX, dy, PTS)) return dy;
    }
    return null;
  };
  const spawn = () => {
    const n = Math.min(ROLES.length, G.CREW + Math.floor(lap() / 2));
    const sdy = spawnDy();
    if (sdy === null) return false;
    S.spawned++;
    state.gunship = {
      phase: 'approach',
      dx: G.START_DX, // her offset from our ship (ship coords; dy is down)
      dy: sdy,
      okW: null, // last rock-free position (world coordinates), for emergencies
      side: -1, // which end her guns point out of (toward us)
      ports: [0, 1, 2].map(() => ({ hp: G.PORT_HP, dead: false })),
      free: {}, // which ring spots are clear of rock right now
      node: null, // the ring spot she is heading for
      route: [], // ring spots still to pass on the way
      temp: null, // a free spot found by searching when the ring is blocked
      planT: 0,
      stayT: 0,
      noRoom: false,
      herRope: false,
      latchCd: 0,
      sendT: 0,
      extra: G.LATCH_EXTRA,
      paraT: G.PARA_FIRST,
      paraDue: false,
      cutObj: { x: BOW.x - 110, d: MAIN, prog: 0 }, // what the crew hold Action on to cut her line
      scrapeCd: 0,
      wvx: scrollSpeed(state), // her own speeds through the world (wvy is up)
      wvy: state.ship.vy || 0,
      seenVx: scrollSpeed(state), // what her helmsman has noticed of OUR speeds (he reacts slowly)
      seenVy: state.ship.vy || 0,
      prevAlt: state.ship.alt,
      t: rand(0, 6),
      hp: G.HP + (lap() - 1) * 6,
      max: G.HP + (lap() - 1) * 6,
      rope: false,
      ropeLen: 0,
      tension: 0,
      fireCd: G.FIRE_EVERY,
      docked: 0,
      charge: null,
      hit: 0,
      adrift: 0,
      refill: 0,
      crew: [],
    };
    for (const role of ROLES.slice(0, n)) {
      const post = postFor(role);
      state.gunship.crew.push({ role, post, x: post, y: GS.deckY, d: MAIN, hp: G.CREW_HP, cd: rand(0.5, 1.5), face: -1, wind: 0, cutT: 0 });
    }
    warn('ENEMY GUNSHIP! SHOOT OUT HER GUNS - OR HOOK AND BOARD HER!', 4);
    return true;
  };

  // Where a crew member taking this job should stand (the first free spot).
  const postFor = (role) => {
    const g = state.gunship;
    const used = g ? g.crew.filter((c) => c.role === role).map((c) => c.post) : [];
    const list = POSTS[role] || [GS.x0 + 330, GS.x0 + 470, GS.x0 + 760, GS.x0 + 860, GS.x0 + 400];
    return list.find((x) => !used.includes(x)) ?? list[0];
  };
  const atPost = (role) => (state.gunship ? state.gunship.crew.filter((c) => c.role === role && Math.abs(c.x - c.post) < 25 && !c.wind) : []);

  // ---- Her flight: engines, gas lift, helmsman, and the rope ----
  // mode: 'hold' (keep station), 'leave' (run for it), 'dead' (no control: shot down / blown up)
  const fly = (g, dt, mode, tgt = { dx: G.HOLD_DX, dy: G.HOLD_DY }) => {
    g.t += dt;
    const ourVx = scrollSpeed(state);
    const ourVy = state.ship.vy || 0;
    const dAlt = state.ship.alt - g.prevAlt; // however OUR altitude changed (lift, rock bumps...), she is that much lower/higher on screen
    g.prevAlt = state.ship.alt;
    const react = Math.min(1, dt / G.REACT);
    g.seenVx += (ourVx - g.seenVx) * react;
    g.seenVy += (ourVy - g.seenVy) * react;
    const helm = mode !== 'dead' && g.crew.some((c) => c.role === 'helm');
    g.helmOk = helm;
    // Horizontal: ask for a speed that closes the gap to her station, and her engines follow slowly.
    let wantVx = 0;
    let accX = 0;
    // Her helmsman looks ahead along her own motion (in the world) for rock, and brakes / turns away.
    const L = G.LOOKAHEAD;
    const blockedX = helm && hits(g.dx + g.wvx * L, g.dy, PTS_LOOK);
    const blockedY = helm && hits(g.dx, g.dy - g.wvy * L, PTS_LOOK);
    if (helm) {
      let tx = tgt.dx + Math.sin(g.t * 0.5) * G.WOBBLE_X;
      if (mode === 'leave') tx = 6000;
      const close = clamp(G.KX * (tx - g.dx), -G.MAX_CLOSE, G.MAX_CLOSE);
      wantVx = clamp(g.seenVx + close, -G.MAX_BACK, G.MAX_SPEED);
      if (tgt.hold || blockedX) wantVx = 0; // nowhere to go: sit still in the world
      accX = clamp((wantVx - g.wvx) * G.ENGINE_GAIN, -G.ACCEL_X, G.ACCEL_X);
    } else accX = -g.wvx * G.DRAG_X; // engines idle: she coasts and slows
    g.wvx += accX * dt;
    // Vertical: gas lift. The helmsman trims her level with our deck (and away from rock).
    let accY = 0;
    if (helm) {
      let ty = tgt.dy + Math.sin(g.t * 0.7 + 1) * G.WOBBLE_Y;
      if (mode === 'leave') ty -= 300;
      let wantVy = clamp(g.seenVy + G.KY * (g.dy - ty), -G.MAX_VY, G.MAX_VY); // she is below (dy > ty): climb
      if (tgt.hold) wantVy = 0;
      if (blockedY) wantVy = g.wvy > 0 ? -60 : 60; // rock above: dive a little; rock below: climb
      accY = clamp((wantVy - g.wvy) * G.LIFT_GAIN, -G.ACCEL_Y, G.ACCEL_Y);
    } else accY = -G.SAG - g.wvy * G.DRAG_Y; // nobody trimming: she sags and wallows
    g.wvy += accY * dt;
    // The rope: only pulls when taut.
    g.tension = 0;
    if (g.rope) {
      const a = anchorAt(g);
      const rx = a.x - BOW.x;
      const ry = a.y - BOW.y;
      const dist = Math.hypot(rx, ry) || 1;
      const nx = rx / dist;
      const ny = ry / dist;
      g.ropeLen = Math.max(G.BOARD_LEN, g.ropeLen - G.REEL_SPEED * dt); // reeling her in
      if (dist > G.SNAP_LEN) snap();
      else if (dist > g.ropeLen) {
        const stretch = dist - g.ropeLen;
        g.tension = stretch / (G.SNAP_LEN - g.ropeLen);
        const sep = (g.wvx - ourVx) * nx + (ourVy - g.wvy) * ny; // how fast the ships are moving apart along the rope
        const acc = clamp(G.ROPE_K * stretch + G.ROPE_DAMP * Math.max(0, sep), 0, G.ROPE_MAX_ACC);
        g.wvx -= nx * acc * dt;
        g.wvy += ny * acc * dt; // (her climb is up, ny is down)
        // A gentle tug on our own ship too (the helm stays in control).
        const pull = Math.min(stretch, G.TUG_CAP);
        state.ship.vy = (state.ship.vy || 0) - ny * G.TUG_VY * pull * dt;
        state.ship.speed = clamp(state.ship.speed + nx * G.TUG_SPEED * pull * dt, -0.4, 1);
      }
    }
    g.wvx = clamp(g.wvx, -G.MAX_SPEED_ANY, G.MAX_SPEED_ANY); // (a rope yank can't throw her faster than this)
    g.wvy = clamp(g.wvy, -G.MAX_SPEED_ANY, G.MAX_SPEED_ANY);
    // Move: relative to us she gains/loses ground by the difference in speeds.
    g.dx += (g.wvx - ourVx) * dt;
    g.dy += dAlt - g.wvy * dt;
    // Our ship is solid too: if she overlaps its box she is nudged out the short way.
    const R = G.SHIP_RECT;
    const l = GS.x0 - 60 + g.dx;
    const r = GS.x1 + 90 + g.dx;
    const top = 220 + g.dy;
    const bot = GS.deckY + 120 + g.dy;
    if (r > R.x0 && l < R.x1 && bot > R.y0 && top < R.y1) {
      const ox = Math.min(r - R.x0, R.x1 - l);
      const oy = Math.min(bot - R.y0, R.y1 - top);
      const k = 400 * dt;
      if (ox < oy) g.dx += Math.min(ox, k) * ((l + r) / 2 > (R.x0 + R.x1) / 2 ? 1 : -1);
      else g.dy += Math.min(oy, k) * ((top + bot) / 2 > (R.y0 + R.y1) / 2 ? 1 : -1);
    }
  };

  // ---- Her captain: which spot on the ring round our ship to fly to ----
  const nodeDist = (g, n) => Math.hypot(g.dx - n.dx, g.dy - n.dy);
  const refreshFree = (g) => {
    for (const name of NODE_NAMES) g.free[name] = freeAt(G.NODES[name].dx, G.NODES[name].dy);
  };
  const nearestFree = (g) => {
    let best = null;
    for (const name of NODE_NAMES) if (g.free[name] && (!best || nodeDist(g, G.NODES[name]) < nodeDist(g, G.NODES[best]))) best = name;
    return best;
  };
  // Shortest way along the ring (through free spots only) from one spot to another.
  const bfs = (g, from, to) => {
    if (from === to) return [];
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const nb of NODE_NAMES.filter((n) => G.NODES[n].links.includes(cur) || G.NODES[cur].links.includes(n))) {
        if (!g.free[nb] || nb in prev) continue;
        prev[nb] = cur;
        queue.push(nb);
      }
    }
    if (!(to in prev)) return null;
    const path = [];
    for (let n = to; n !== from; n = prev[n]) path.unshift(n);
    return path;
  };
  // The nearest rock-free spot to our bow (searching a grid round the ship), for when the ring is blocked.
  const findSpot = (g) => {
    let best = null;
    for (let dx = 1200; dx >= -4200; dx -= 300) {
      for (let dy = -1200; dy <= 1200; dy += 300) {
        if (!freeAt(dx, dy)) continue;
        const cost = Math.hypot(dx, dy * 1.5) + Math.hypot(dx - g.dx, dy - g.dy) * 0.3;
        if (!best || cost < best.cost) best = { dx, dy, cost };
      }
    }
    return best;
  };
  // Choose where to go next. `need` = 'bow' when she must be alongside (approach, latching, roped).
  const pick = (g, need) => {
    g.temp = null;
    g.route = [];
    g.arrived = false;
    const start = nearestFree(g);
    let want = null;
    if (start && need) want = g.free.bow ? 'bow' : null;
    else if (start) {
      const options = NODE_NAMES.filter((n) => g.free[n] && n !== g.node && (g.paraDue ? G.NODES[n].drop : G.NODES[n].fire) && bfs(g, start, n));
      let r = Math.random() * options.reduce((s, n) => s + G.NODES[n].w, 0);
      for (const n of options) if ((r -= G.NODES[n].w) <= 0) { want = n; break; }
      if (!want && options.length) want = options[0];
      if (!want && g.node && g.free[g.node] && !g.paraDue) want = g.node; // nowhere better: stay put
    }
    if (want) {
      g.node = want;
      g.route = bfs(g, start, want) || [];
      g.noRoom = false;
      g.stayT = rand(G.STAY_MIN, G.STAY_MAX);
      return;
    }
    g.node = null;
    const s = findSpot(g);
    g.noRoom = !s;
    if (s) {
      g.temp = { dx: s.dx, dy: s.dy };
      g.tempT = g.t;
    }
  };
  // Each step: re-check the ring now and then, and return the point she should fly to now.
  const plan = (g, dt) => {
    const need = g.phase === 'approach' || g.phase === 'latch' || g.rope ? 'bow' : null;
    if ((g.planT -= dt) <= 0) {
      g.planT = G.PLAN_EVERY;
      refreshFree(g);
      const stale = g.temp ? !freeAt(g.temp.dx, g.temp.dy) || g.t - g.tempT > 2 : g.node ? !g.free[g.node] || g.route.some((n) => !g.free[n]) : true;
      const wrongSpot = need && g.node !== 'bow' && !(g.temp && g.free.bow === false);
      const moveOn = g.arrived && g.stayT <= 0;
      const dropNow = g.paraDue && g.node && !G.NODES[g.node].drop && g.arrived && g.t - g.arrT > 2;
      if (stale || wrongSpot || moveOn || dropNow) pick(g, need);
    }
    if (g.noRoom) return { dx: g.dx, dy: g.dy, hold: true, dist: 0 };
    let n = g.temp;
    if (!n && g.node) {
      while (g.route.length > 1 && nodeDist(g, G.NODES[g.route[0]]) < G.NODE_PASS) g.route.shift();
      n = G.NODES[g.route.length ? g.route[0] : g.node];
    }
    if (!n) return { dx: g.dx, dy: g.dy, hold: true, dist: 0 };
    const dist = Math.hypot(g.dx - n.dx, g.dy - n.dy);
    const last = g.temp || g.route.length <= 1; // heading for the final spot
    if (last && dist < G.NODE_ARRIVE * 1.5 && !g.arrived) {
      g.arrived = true;
      g.arrT = g.t;
      g.route = [];
    }
    if (g.arrived) g.stayT -= dt;
    return { dx: n.dx, dy: n.dy, hold: false, dist };
  };

  // ---- Terrain: she is solid. Test her outline against rock and push her out the shortest way ----
  const collide = (g, dt) => {
    const alt = state.ship.alt;
    const dist = state.course ? state.course.dist : 0;
    g.scrapeCd = Math.max(0, g.scrapeCd - dt);
    let first = null;
    let buried = false;
    for (let it = 0; it < 8 && !buried; it++) {
      let up = 0;
      let down = 0;
      let back = 0;
      let fwd = 0;
      let deep = null;
      for (const [px, py] of PTS) {
        const mx = px + g.dx;
        const my = py + g.dy - alt;
        if (!inRock(state, mx, my)) continue;
        let best = null;
        for (const [ddx, ddy] of DIRS) {
          for (let k = 1; k <= 14; k++) {
            if (!inRock(state, mx + ddx * k * G.PUSH_STEP, my + ddy * k * G.PUSH_STEP)) {
              if (!best || k * G.PUSH_STEP < best.d) best = { ddx, ddy, d: k * G.PUSH_STEP };
              break;
            }
          }
        }
        if (!best) {
          buried = true; // deep inside solid rock (or off the map): no sensible way out, see below
          break;
        }
        if (best.ddy < 0) up = Math.max(up, best.d);
        else if (best.ddy > 0) down = Math.max(down, best.d);
        else if (best.ddx < 0) back = Math.max(back, best.d);
        else fwd = Math.max(fwd, best.d);
        if (!deep || best.d > deep.d) deep = { x: px + g.dx, y: py + g.dy, d: best.d };
      }
      if (!deep) break;
      if (!first) first = { up, down, back, fwd, deep };
      g.dx += fwd - back;
      g.dy += down - up;
    }
    if (buried && !first) first = { up: 0, down: 0, back: 0, fwd: 0, deep: { x: GS.x0 + g.dx, y: GS.deckY + g.dy } };
    if (!first) {
      // Clear: remember where (in the world) she was last fine.
      g.okW = { x: g.dx + dist, y: g.dy - alt };
      return false;
    }
    // Still inside rock after all that (squeezed between walls)? Go back to the last clear spot.
    if (buried || hits(g.dx, g.dy, PTS)) {
      if (g.okW && Math.abs(g.okW.x - dist - g.dx) < 1500 && Math.abs(g.okW.y + alt - g.dy) < 1500) {
        g.dx = g.okW.x - dist;
        g.dy = g.okW.y + alt;
        g.wvx = 0;
        g.wvy = 0;
        S.reverts++;
      } else g.rockT = 99; // (nowhere safe to go back to: she breaks off at the next check)
    }
    S.contacts++;
    const depth = Math.max(first.up, first.down, first.back, first.fwd);
    S.maxDepth = Math.max(S.maxDepth, depth);
    // Kill her speed into the wall, with a small bounce.
    let vin = 0;
    if (first.back > first.fwd && g.wvx > 0) {
      vin = Math.max(vin, g.wvx);
      g.wvx = -g.wvx * G.ROCK_BOUNCE;
    } else if (first.fwd > first.back && g.wvx < 0) {
      vin = Math.max(vin, -g.wvx);
      g.wvx = -g.wvx * G.ROCK_BOUNCE;
    }
    if (first.up > first.down && g.wvy < 0) {
      vin = Math.max(vin, -g.wvy);
      g.wvy = -g.wvy * G.ROCK_BOUNCE;
    } else if (first.down > first.up && g.wvy > 0) {
      vin = Math.max(vin, g.wvy);
      g.wvy = -g.wvy * G.ROCK_BOUNCE;
    }
    if (g.scrapeCd <= 0 && (vin > 30 || depth > 40)) {
      g.scrapeCd = G.SCRAPE_CD;
      S.collisions++;
      g.hp = Math.max(1, g.hp - G.ROCK_DAMAGE * clamp(vin / 200, 0.25, 3));
      g.hit = 0.15;
      state.sfxQ && state.sfxQ.push(['hit']);
      puff(first.deep.x, first.deep.y - alt, '#a89c8a', 8);
      puff(first.deep.x, first.deep.y - alt, '#555', 4);
      // Everyone on her deck staggers (but stays aboard: away from the ends).
      const dir = first.back > first.fwd ? 1 : first.fwd > first.back ? -1 : Math.random() < 0.5 ? -1 : 1;
      for (const p of Object.values(state.players)) {
        if (!p.onGunship || p.fall || p.swing) continue;
        let d = dir;
        if (p.x < GS.x0 + 140) d = 1;
        else if (p.x > GS.x1 - 140) d = -1;
        p.vx = (p.vx || 0) + d * G.SCRAPE_SHOVE;
      }
    }
    return true;
  };

  // ---- Paratroopers ----
  const dropParas = (g) => {
    const crew = Object.keys(state.players).length;
    const n = clamp(1 + Math.floor(crew / 6) + (lap() >= 3 ? 1 : 0), 1, 3);
    const alt = state.ship.alt;
    const sx = GS.x0 + 80 + g.dx;
    const sy = GS.deckY + g.dy - 110;
    const fall = (P[CAT].y - sy) / G.PARA_FALL; // seconds to come down to our catwalk
    const aim = clamp(sx, P[CAT].x0 + 80, P[CAT].x1 - 80);
    if (fall < 1.5 || Math.abs(sx - aim) > G.PARA_STEER * fall * 0.7) return false; // can't reach us from here
    for (let i = 0; i < n; i++) {
      state.paras.push({ x: sx + i * 50, y: sy - alt, vx: sx > aim ? -120 : 120, vy: 0, hp: G.PARA_HP, t: -i * 0.35, tx: clamp(aim + rand(-200, 200), P[CAT].x0 + 40, P[CAT].x1 - 40), type: pickType ? pickType() : 'grunt' });
      S.dropped++;
    }
    puff(sx, sy - alt, '#eee6d2', 8);
    warn('PARATROOPERS! SHOOT THEM DOWN!', 2.5);
    return true;
  };
  const updateParas = (dt) => {
    const alt = state.ship.alt;
    for (const p of state.paras) {
      p.t += dt;
      if (p.t < 0) continue; // (still stepping out the door)
      const open = p.t > 0.5;
      p.vy += ((open ? G.PARA_FALL : 320) - p.vy) * Math.min(1, dt * 2);
      if (open) p.vx += (clamp((p.tx - p.x) * 1.2, -G.PARA_STEER, G.PARA_STEER) - p.vx) * Math.min(1, dt * 1.5);
      const prevY = p.y + alt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      for (const sh of state.shells) {
        if (sh.life <= 0 || Math.hypot(sh.x - p.x, sh.y - p.y) > 42) continue;
        sh.life = 0;
        p.hp -= config.GUNS.DAMAGE;
        puff(sh.x, sh.y, '#ffcf40', 6);
        if (p.hp <= 0) {
          p.dead = true;
          S.shot++;
          state.kills += 1;
          credit?.(sh);
          pop(state, p.x, p.y - 40, 'kill', '#ffd23f', 0.8);
          puff(p.x, p.y, '#ff5a1f', 10);
        }
        break;
      }
      if (p.dead) continue;
      const shipY = p.y + alt;
      const d = platformBelow(p.x, prevY);
      if (d !== null && shipY >= P[d].y) {
        p.dead = true;
        S.landed++;
        dropOne && dropOne(p.x, P[d].y - 4, p.type);
        puff(p.x, P[d].y - alt - 10, '#eee6d2', 8);
      } else if (shipY > 1700 || p.t > 60 || inRock(state, p.x, p.y)) p.dead = true; // missed us and fell away
    }
    state.paras = state.paras.filter((p) => !p.dead);
  };

  // ---- Boarding: swinging across on the rope (and back) ----
  const inSwingRange = (g) => g.rope && gap(g) <= G.SWING_RANGE;
  const swing = (player) => {
    const g = state.gunship;
    if (!g || !g.rope || player.swing || !inSwingRange(g)) return;
    const out = !player.onGunship;
    // The swing path (a dip between the decks) must be clear of rock.
    const a = out ? { x: player.x, y: player.y } : { x: player.x + g.dx, y: player.y + g.dy };
    const b = out ? { x: LAND_X + g.dx, y: GS.deckY + g.dy } : { x: MAIN_X1 - 30, y: P[MAIN].y };
    for (let k = 1; k < 10; k++) {
      const u = k / 10;
      if (inRock(state, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + G.SWING_DIP * Math.sin(Math.PI * u) - state.ship.alt)) {
        warn('Rock in the way!', 1.5);
        return;
      }
    }
    if (!out) {
      // Leaving her deck: carry on from where she is now, in ship coordinates.
      player.x += g.dx;
      player.y += g.dy;
      player.onGunship = false;
    }
    player.swing = { t: 0, out, from: { x: player.x, y: player.y } };
    player.lock = null;
    player.vx = 0;
    state.sfxQ && state.sfxQ.push(['swing']);
  };
  const swingStep = (p, dt) => {
    const s = p.swing;
    const g = state.gunship;
    if (!g || !g.rope || g.phase === 'sinking') {
      // The line was cut or snapped (or she broke off) mid-swing.
      p.swing = null;
      p.onGunship = false;
      p.fall = true;
      return;
    }
    s.t += dt / G.SWING_TIME;
    const k = Math.min(1, s.t);
    const e = k * k * (3 - 2 * k);
    // The far end follows her as she moves.
    const end = s.out ? { x: LAND_X + g.dx, y: GS.deckY + g.dy } : { x: MAIN_X1 - 30, y: P[MAIN].y };
    p.x = s.from.x + (end.x - s.from.x) * e;
    p.y = s.from.y + (end.y - s.from.y) * e + G.SWING_DIP * Math.sin(Math.PI * k) - 40 * Math.sin(Math.PI * Math.min(1, k * 4)); // a hop off, then the dip
    p.face = end.x > s.from.x ? 1 : -1;
    p.moving = false;
    if (k >= 1) {
      p.swing = null;
      if (s.out) {
        p.onGunship = true;
        p.x = LAND_X;
        p.y = GS.deckY;
        p.d = MAIN;
        stomp(p);
      } else {
        p.x = MAIN_X1 - 30;
        p.y = P[MAIN].y;
        p.d = MAIN;
      }
    }
  };
  // Walking about on her deck (called by the simulation instead of the ship's walker). Same feel
  // as nav.js moveWalker: momentum, no ladders. Walking off either end = falling.
  const walk = (p, jx, jy, dt, speed) => {
    if (!state.gunship) return dropOff(p);
    p.conn = null;
    p.climb = false;
    const want = jx * speed;
    const v = p.vx || 0;
    const speedingUp = Math.abs(want) > Math.abs(v) && Math.sign(want) === Math.sign(v || want);
    const rate = (speedingUp ? config.MOVE.ACCEL : config.MOVE.BRAKE) * dt;
    p.vx = v + clamp(want - v, -rate, rate);
    p.x += p.vx * dt;
    p.y = GS.deckY;
    if (Math.abs(jx) > 0.15) p.face = jx < 0 ? -1 : 1;
    if (p.x < GS.x0 - 40 || p.x > GS.x1 + 60) {
      dropOff(p);
      warn('OFF HER DECK! SHE\'S GONE BY - YOU FALL!', 1.5);
    }
  };
  // A player in free flight (jumped or thrown) lands on her deck: from then on she carries them.
  const land = (p) => {
    const g = state.gunship;
    if (!g) return;
    p.onGunship = true;
    p.d = MAIN;
    p.x -= g.dx;
    p.y = GS.deckY;
    p.air = false;
    p.fly = false;
    p.jz = 0;
    p.vx = 0;
    stomp(p);
  };
  // Landing on her deck knocks the nearby crew flying.
  const stomp = (p) => {
    const g = state.gunship;
    puff(p.x + g.dx, p.y + g.dy - 10 - state.ship.alt, '#ffffff', 12);
    state.rings && state.rings.push({ x: p.x + g.dx, y: p.y + g.dy - 20 - state.ship.alt, t: 0.3, max: 0.3, r: G.STOMP_RANGE, color: '#ffffff' });
    state.sfxQ && state.sfxQ.push(['hit', true]);
    for (const c of [...g.crew]) {
      if (Math.abs(c.x - p.x) > G.STOMP_RANGE) continue;
      c.wind = 0;
      c.cd = 1.2;
      c.x += 150;
      hurt(c, 1);
    }
  };
  const hurt = (c, dmg) => {
    const g = state.gunship;
    c.hp -= dmg;
    puff(c.x + g.dx, c.y + g.dy - 50 - state.ship.alt, '#ffffff', 6);
    if (c.hp > 0) return;
    g.crew.splice(g.crew.indexOf(c), 1);
    state.kills += 1;
    pop(state, c.x + g.dx, c.y + g.dy - 140 - state.ship.alt, 'raider', '#ffd23f', 1);
    puff(c.x + g.dx, c.y + g.dy + 60 - state.ship.alt, '#c0392b', 10);
    const lastGunner = c.role === 'gunner' && !g.crew.some((q) => q.role === 'gunner');
    const what = { gunner: lastGunner ? 'GUNNERS DOWN - HER GUNS ARE SILENT!' : '', stoker: 'STOKER DOWN - HER GUNS RELOAD SLOWLY', helm: 'HELMSMAN DOWN - SHE CAN\'T STEER OR HOLD STATION' }[c.role];
    if (what) warn(what, 2.5);
  };

  // The charge is set: run!
  const plant = (player) => {
    const g = state.gunship;
    if (!g || g.charge) return;
    g.charge = { t: G.FUSE, by: player && player.id };
    warn('CHARGE SET! GET BACK TO THE SHIP!', 3);
  };

  const explode = (byCrew) => {
    const g = state.gunship;
    if (!g) return;
    g.phase = 'sinking';
    g.sink = 0;
    setRope(false);
    dropAll();
    for (let k = 0; k < 8; k++) puff(rand(GS.x0, GS.x1) + g.dx, rand(300, 760) + g.dy - state.ship.alt, k % 2 ? '#ff5a1f' : '#555', 24);
    pop(state, (GS.x0 + GS.x1) / 2 + g.dx, 300 + g.dy - state.ship.alt, 'boss', '#ff5a1f', 1.6);
    state.ship.shake = Math.max(state.ship.shake, 0.5);
    state.kills += 1 + g.crew.length;
    if (byCrew) {
      // Spoils: patch the hull, fill the firebox, top up guns and bombs.
      state.ship.hull = Math.min(100, state.ship.hull + G.REWARD_HULL);
      state.ship.fuel = Math.min(config.BOILER.FUEL_MAX, state.ship.fuel + G.REWARD_COAL);
      for (const gun of Object.values(state.GUNS)) gun.ammo = Math.min(gun.max, gun.ammo + 8);
      state.bombBay.bombs = Math.min(config.BOMBS.MAX, state.bombBay.bombs + 2);
      warn('GUNSHIP DESTROYED! SUPPLIES ABOARD: HULL, COAL AND AMMO', 4);
    } else warn('GUNSHIP SHOT DOWN!', 3);
    g.crew.length = 0;
  };

  // She breaks off: the rope goes, anyone still on her falls.
  const leave = (text, secs) => {
    const g = state.gunship;
    if (g.rope) setRope(false);
    dropAll();
    g.phase = 'leaving';
    warn(text, secs);
  };

  const update = (dt) => {
    updateParas(dt);
    let g = state.gunship;
    if (!g) {
      for (const p of Object.values(state.players)) if (p.onGunship) dropOff(p); // (nothing to stand on)
      if (state.phase !== 'flying' || state.ship.down || state.boss || !Object.keys(state.players).length) return;
      if ((timer -= dt * (state.tempo && state.tempo.phase === 'calm' ? 0 : state.tempo && state.tempo.phase === 'peak' ? 1.7 : 1)) > 0) return;
      if (!spawn()) {
        timer = 3; // no clear sky off our bow right now: try again shortly
        return;
      }
      timer = rand(G.EVERY_MIN, G.EVERY_MAX);
      g = state.gunship;
    }
    g.hit = Math.max(0, g.hit - dt);
    if (g.phase === 'sinking') {
      g.sink += dt;
      fly(g, dt, 'dead');
      collide(g, dt);
      if (g.sink > 4) state.gunship = null;
      return;
    }
    if (g.phase === 'leaving') {
      fly(g, dt, 'leave');
      collide(g, dt);
      if (Math.abs(g.dx) > G.GONE_DIST || Math.abs(g.dy) > G.GONE_DIST) state.gunship = null;
      return;
    }
    // Her captain picks where to go (ring spots / free space), her helmsman flies there, rock pushes her out.
    const tgt = plan(g, dt);
    fly(g, dt, 'hold', tgt);
    const touched = collide(g, dt);
    g.gap = gap(g);
    // No room to manoeuvre for a long while (or grinding along rock)? She breaks off.
    g.rockT = g.noRoom ? (g.rockT || 0) + dt : touched ? (g.rockT || 0) + dt * 0.5 : Math.max(0, (g.rockT || 0) - dt * 0.5);
    if (g.rockT > G.ROCK_BREAKOFF) {
      S.breakoffs++;
      leave('THE GUNSHIP BREAKS OFF!', 2);
      return;
    }
    // Lost her (or left her far behind)?
    if (Math.abs(g.dx) > G.GONE_DIST || Math.abs(g.dy) > G.GONE_DIST) {
      if (g.rope) setRope(false);
      dropAll();
      state.gunship = null;
      return;
    }
    // Her gun side faces us (and the barrels track our hull).
    const herCx = (GS.x0 + GS.x1) / 2 + g.dx;
    if (Math.abs(800 - herCx) > 150) g.side = 800 < herCx ? -1 : 1;
    const gpx = (g.side < 0 ? GS.x0 - 30 : GS.x1 + 30) + g.dx;
    g.aim = Math.atan2(640 - (GS.deckY + g.dy), 800 - gpx);
    g.dist = Math.hypot(gpx - 800, GS.deckY + g.dy - 640); // from her guns to our hull
    if (g.phase === 'approach') {
      // Engaged once she is close to where she is heading.
      if (!tgt.hold && Math.abs(g.dx - tgt.dx) < G.DOCK_DX && Math.abs(g.dy - tgt.dy) < G.DOCK_DY) g.phase = 'hunt';
      // Can't get in (rock, or she's stuck behind us)? She gives up rather than hanging there forever.
      else if ((g.approachT = (g.approachT || 0) + dt) > G.APPROACH_GIVEUP) leave('THE GUNSHIP GIVES UP THE CHASE', 2);
      return;
    }
    const inPos = !tgt.hold && tgt.dist < 450 && (g.temp || (g.node && G.NODES[g.node].fire));
    g.inPos = inPos;
    g.docked += dt;
    if (g.docked > G.STAY && !g.charge) {
      leave('THE GUNSHIP PULLS AWAY', 2);
      return;
    }
    // Her systems: who's at their post?
    const gunners = atPost('gunner').length;
    const steam = atPost('stoker').length > 0;
    const helm = g.crew.some((c) => c.role === 'helm');
    g.posts = { guns: gunners, steam, helm };
    // No helmsman: once nobody's aboard her, she drifts off.
    const aboard = Object.values(state.players).some((p) => p.onGunship && !p.fall);
    g.adrift = helm ? 0 : aboard ? g.adrift : g.adrift + dt;
    if (g.adrift > G.DRIFT_TIME && !g.charge) {
      leave('NOBODY AT HER HELM - THE GUNSHIP DRIFTS AWAY', 2.5);
      return;
    }
    // Broadsides at our hull (with a glow first) - only while her gunners are at the guns. They
    // aim from wherever she is now, so if you pull away from her (above, below, far off) more miss.
    const alive = g.ports.map((pt, k) => k).filter((k) => !g.ports[k].dead);
    // Her gunners fire from the gun ports that face us, when she is on a firing spot, in range, with a clear line.
    let canFire = g.phase === 'hunt' && gunners > 0 && alive.length > 0 && !g.charge && !state.ship.down && inPos && g.dist < G.FIRE_RANGE;
    if (canFire) {
      const px = gpx;
      const py = GS.deckY - 40 + 70 + g.dy;
      for (let s = 1; s <= 8 && canFire; s++) if (inRock(state, px + ((800 - px) * s) / 9, py + ((640 - py) * s) / 9 - state.ship.alt)) canFire = false; // rock in the way
    }
    if (canFire && (g.fireCd -= dt * (steam ? 1 : 0.5)) <= 0) {
      g.fireCd = G.FIRE_EVERY * rand(0.85, 1.2);
      const missChance = clamp(G.MISS_BASE + Math.max(0, g.dist - 1500) / G.MISS_DX, 0, G.MISS_MAX);
      for (let i = 0; i < Math.min(G.SHOTS, gunners + 1, alive.length); i++) {
        const fx = gpx;
        const fy = GS.deckY - 40 + alive[i] * 70 + g.dy - state.ship.alt;
        const tx = rand(700, 1500);
        const ty = rand(480, 820) - state.ship.alt;
        const d = Math.hypot(tx - fx, ty - fy) || 1;
        state.bullets.push({ x: fx, y: fy, vx: ((tx - fx) / d) * 620, vy: ((ty - fy) / d) * 620, life: 3, miss: Math.random() < missChance });
        state.flashes && state.flashes.push({ x: fx, y: fy, ang: Math.atan2(ty - fy, tx - fx), t: 0.12, color: '#ffcf80', size: 1.6 });
        S.shots++;
      }
      state.sfxQ && state.sfxQ.push(['cannon']);
    }
    if (!canFire) g.fireCd = Math.max(g.fireCd, 1.5); // a fresh gunner / a new spot needs a moment
    g.warnFire = canFire && g.fireCd < 1;
    // Dead gun ports smoke.
    g.ports.forEach((pt, k) => {
      if (pt.dead && Math.random() < dt * 5) puff(gpx + (Math.random() - 0.5) * 30, GS.deckY - 40 + k * 70 + g.dy - state.ship.alt, '#555', 1);
    });
    // Guns all down, or no gunners left: she gives up the broadside duel and latches on.
    if (g.phase === 'hunt' && (!alive.length || !g.crew.some((c) => c.role === 'gunner'))) {
      g.phase = 'latch';
      g.latchCd = 1;
      g.paraDue = false;
      g.node = null; // (plan() will now send her alongside)
      warn('HER GUNS ARE DOWN! SHE\'S COMING IN TO LATCH ON!', 3.5);
    }
    // Paratroopers: now and then, from a high spot, raiders jump from her deck and parachute down onto us.
    if (g.phase === 'hunt' && !g.rope && (g.paraT -= dt) <= 0) {
      g.paraDue = true;
      const high = g.arrived && g.node && G.NODES[g.node].drop;
      if (high) {
        if (state.paras.length >= G.PARA_MAX_AIR || state.boarders.length >= G.PARA_MAX_BOARDERS || state.ship.down) g.paraT = 3;
        else if (dropParas(g)) {
          g.paraDue = false;
          g.paraT = rand(G.PARA_EVERY_MIN, G.PARA_EVERY_MAX);
          g.stayT = Math.min(g.stayT, 3);
        } else g.paraT = 2;
      }
    }
    // Latching on: close in alongside and fire her own grapple at our bow...
    if (g.phase === 'latch') {
      g.latchCd = Math.max(0, g.latchCd - dt);
      if (!g.rope && g.latchCd <= 0 && g.gap <= G.LATCH_RANGE) {
        setRope(true);
        g.herRope = true;
        S.latches++;
        state.sfxQ && state.sfxQ.push(['swing']);
        warn('SHE FIRES HER GRAPPLE! CUT THE LINE AT THE BOW - OR BOARD HER!', 3.5);
      }
      // ...then her guards (and deckhands) cross the rope to board us.
      if (g.rope && (g.sendT += dt) >= G.LATCH_SEND_EVERY) {
        g.sendT = 0;
        const guard = g.crew.find((c) => c.role === 'guard');
        if (guard || g.extra > 0) {
          if (guard) g.crew.splice(g.crew.indexOf(guard), 1);
          else g.extra--;
          S.sent++;
          dropOne && dropOne(BOW.x - 70 + rand(-40, 40), P[MAIN].y - 70, pickType ? pickType() : 'grunt');
          puff(BOW.x - 40, BOW.y - 40 - state.ship.alt, '#d8c79a', 8);
          warn('RAIDERS CROSSING HER ROPE!', 2);
        }
      }
    }
    // The fuse.
    if (g.charge && (g.charge.t -= dt) <= 0) return explode(true);
    // Crew: defend the deck, and cut the rope if nobody's coming.
    g.ropeT = g.rope ? (g.ropeT || 0) + dt : 0;
    const boarders = Object.values(state.players).filter((p) => p.onGunship && !p.fall && !p.swing && !(p.ko > 0));
    // With nobody aboard, a guard takes over an empty post after a few seconds.
    const guards = g.crew.filter((c) => c.role === 'guard');
    const empty = ['helm', 'gunner', 'stoker'].find((r) => !g.crew.some((c) => c.role === r));
    g.refill = empty && guards.length && !boarders.length ? g.refill + dt : 0;
    if (g.refill > G.REFILL_TIME) {
      g.refill = 0;
      const c = guards[0];
      c.role = empty;
      c.post = postFor(empty);
      guards.shift();
    }
    // Guards patch her hull while nobody's aboard.
    if (!boarders.length && guards.length && g.hp < g.max) g.hp = Math.min(g.max, g.hp + G.REPAIR_RATE * guards.length * dt);
    for (const c of g.crew) {
      c.cd = Math.max(0, c.cd - dt);
      const foe = boarders.sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      // Guards chase boarders anywhere; the others only fight back when someone's right on them.
      if (foe && Math.abs(foe.x - c.x) < (c.role === 'guard' ? 700 : 200)) {
        c.face = foe.x < c.x ? -1 : 1;
        if (Math.abs(foe.x - c.x) > 60) c.x += c.face * G.CREW_SPEED * dt;
        else if (c.cd <= 0 && !c.wind) c.wind = 0.5; // wind up (a readable tell)
        if (c.wind && (c.wind -= dt) <= 0) {
          c.wind = 0;
          c.cd = 1.2;
          if (Math.abs(foe.x - c.x) < 80) {
            foe.ko = config.RAIDERS.KO_TIME * 0.5;
            foe.x += c.face * 120;
            if (foe.x < GS.x0 - 20) dropOff(foe); // knocked off her deck!
            puff(foe.x + g.dx, foe.y + g.dy - 60 - state.ship.alt, '#ffffff', 8);
            pop(state, foe.x + g.dx, foe.y + g.dy - 150 - state.ship.alt, 'raider', '#ff5a5a', 0.9);
          }
        }
      } else if (c === guards[0] && g.rope && g.phase === 'hunt' && !boarders.length && g.ropeT > 3) {
        // Head for the rope and hack at it.
        c.face = -1;
        if (c.x > GS.x0 + 30) c.x -= G.CREW_SPEED * dt;
        else if ((c.cutT += dt) > G.CUT_TIME) {
          c.cutT = 0;
          snap('THEY CUT THE ROPE!');
        }
      } else {
        // Back to their post.
        const d = c.post - c.x;
        c.face = Math.abs(d) > 5 ? Math.sign(d) : c.role === 'gunner' ? -1 : c.face;
        c.x += Math.sign(d) * Math.min(Math.abs(d), G.CREW_SPEED * dt);
      }
      c.x = Math.max(GS.x0 + 20, Math.min(GS.x1 - 20, c.x));
    }
    // Crew shells hit her hull and gasbag.
    for (const sh of state.shells) {
      if (sh.life <= 0) continue;
      const sy = sh.y + state.ship.alt - g.dy;
      const sx = sh.x - g.dx;
      // A hit on a gun port wrecks the port (not the hull).
      const portX = g.side < 0 ? GS.x0 - 30 : GS.x1 + 30;
      const k = g.ports.findIndex((pt, i) => !pt.dead && Math.hypot(sx - portX, sy - (GS.deckY - 40 + i * 70)) < G.PORT_RADIUS);
      if (k >= 0) {
        sh.life = 0;
        g.hit = 0.1;
        const pt = g.ports[k];
        pt.hp -= config.GUNS.DAMAGE;
        puff(sh.x, sh.y, '#ffcf40', 8);
        if (pt.hp <= 0) {
          pt.dead = true;
          S.portsDown++;
          puff(portX + g.dx, GS.deckY - 40 + k * 70 + g.dy - state.ship.alt, '#ff5a1f', 16);
          pop(state, portX + g.dx, GS.deckY - 90 + k * 70 + g.dy - state.ship.alt, 'kill', '#ffd23f', 1);
          const left = g.ports.filter((q) => !q.dead).length;
          if (left) warn('GUN PORT DOWN!', 2);
        }
        continue;
      }
      const inHull = sx > GS.x0 - 60 && sx < GS.x1 + 80 && sy > 560 && sy < 780;
      const inBag = Math.hypot((sx - (GS.x0 + GS.x1) / 2) / 660, (sy - 380) / 160) < 1;
      if (!inHull && !inBag) continue;
      sh.life = 0;
      g.hp -= config.GUNS.DAMAGE;
      g.hit = 0.15;
      if (g.hp <= 0) {
        credit?.(sh);
        explode(false);
        return;
      }
    }
  };

  // A crew member's sword (or shove) against the gunship's crew.
  const hitCrew = (player, sword, range) => {
    const g = state.gunship;
    if (!g || !engaged(g) || !player.onGunship) return false;
    const c = g.crew.filter((q) => Math.abs(q.x - player.x) < range).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    if (!c) return false;
    c.wind = 0;
    c.x += (c.x > player.x ? 1 : -1) * (sword ? 90 : 60);
    hurt(c, sword ? 2 : 1);
    return true;
  };

  // The crew hacked through her grapple line.
  const cutLine = () => {
    const g = state.gunship;
    if (!g || !g.rope) return;
    S.cut++;
    snap('YOU CUT HER GRAPPLE LINE!');
  };

  // What a player standing here could do with the gunship.
  const interaction = (player) => {
    const g = state.gunship;
    if (!g || !engaged(g) || player.d !== MAIN) return null;
    if (player.onGunship) {
      if (g.rope && inSwingRange(g) && player.x < GS.x0 + 110) return { type: 'swing', label: 'Swing back!' };
      if (!g.charge && Math.abs(player.x - GS.boilerX) < 70) return { type: 'sabotage', obj: g, hold: true, time: G.PLANT_TIME, label: 'Plant charge!' };
      return null;
    }
    if (player.x > MAIN_X1 - 45) {
      if (!g.rope) return { type: 'hook', label: gap(g) <= G.HOOK_RANGE ? 'Fire hookshot!' : 'Too far to hook!' };
      if (inSwingRange(g)) return { type: 'swing', label: 'Swing across!' };
    }
    // Her grapple is on our bow: hack through the line (just behind the swing spot).
    if (g.phase === 'latch' && g.rope && player.x > MAIN_X1 - 175) return { type: 'cutline', obj: g.cutObj, hold: true, time: G.CUT_HOLD, label: 'Cut her grapple line!' };
    return null;
  };

  // Fire the grapple: it only catches while she's within range. Returns whether it caught.
  const fireHook = () => {
    const g = state.gunship;
    if (!g || g.rope || gap(g) > G.HOOK_RANGE) return false;
    setRope(true);
    state.sfxQ && state.sfxQ.push(['swing']);
    return true;
  };

  const reset = () => {
    if (state.gunship) setRope(false);
    dropAll();
    state.gunship = null;
    state.paras.length = 0;
    timer = G.FIRST_AFTER;
  };

  // Called again after the course has moved this step (rock slid past her): push her out once more so
  // she is never drawn inside rock.
  const settle = (dt) => {
    const g = state.gunship;
    if (!g) return;
    if (state.course && state.course.justStarted) return reset(); // a new map has begun (our altitude jumped): she is gone
    g.dy += state.ship.alt - g.prevAlt; // our altitude changed since her helmsman last looked (bumps, gusts): she stays put in the world
    g.prevAlt = state.ship.alt;
    collide(g, dt);
  };

  return { update, settle, reset, cutLine, interaction, fireHook, plant, hitCrew, swing, swingStep, walk, land, deckAt: (p) => deckAt(state.gunship, p.x, p.y), inSwingRange: () => !!state.gunship && inSwingRange(state.gunship), inHookRange: () => !!state.gunship && gap(state.gunship) <= G.HOOK_RANGE, spawn: () => !state.gunship && spawn() };
}
