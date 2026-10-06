// Enemy gunships you can board.
//
// A gunship flies in off the bow and tries to hold a broadside position there, firing at the hull
// (it glows before each one). The crew can:
//   - shoot it down (slow - it's armoured), or
//   - fire the hookshot from the very front of the main deck: a grapple rope ties her to our bow
//     (only if she's within range). Press Action at our bow to swing across (landing with a stomp
//     that knocks her crew back), fight her crew, and hold Action at her boiler to plant a charge.
//     Then swing back before it blows! Anyone still aboard falls, and comes round in the medical
//     bay. Blowing her up brings supplies aboard.
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
import { pop } from './popups.js';

const G = config.GUNSHIP;
const P = SHIP_LAYOUT.platforms;
const MAIN = P.findIndex((p) => p.id === 'main');
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

// Where a player/point standing on her deck is, in ship coordinates (null if she isn't there).
export function deckAt(g, x = 0, y = GS.deckY) {
  return g ? { x: x + g.dx, y: y + g.dy } : null;
}
// Her yardarm (where the rope hooks on), in ship coordinates.
export const anchorAt = (g) => ({ x: ANCHOR.x + g.dx, y: ANCHOR.y + g.dy });

export function createGunship({ state, puff, impact, credit }) {
  state.gunship = null;
  let timer = G.FIRST_AFTER;
  const warn = (text, secs = 3.5) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const lap = () => (state.course ? state.course.lap : 1);

  // Is there open sky for a gunship at this offset from us (ship coords x 1900..3400)?
  const roomAlongside = (dx = 0, dy = 0) => {
    for (let x = 1900; x <= 3400; x += 150) {
      for (const y of [260, 420, 600, 760]) if (inRock(state, x + dx, y + dy - state.ship.alt)) return false;
    }
    return true;
  };

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
    g.ropeLen = on ? Math.max(G.BOARD_LEN, gap(g)) : 0;
    g.ropeT = 0;
    g.tension = 0;
  };
  const snap = (text = 'THE ROPE SNAPS!') => {
    const g = state.gunship;
    if (!g || !g.rope) return;
    const a = anchorAt(g);
    setRope(false);
    puff((a.x + BOW.x) / 2, (a.y + BOW.y) / 2 - state.ship.alt, '#d8c79a', 10);
    state.sfxQ && state.sfxQ.push(['hit']);
    warn(text, 2.5);
  };

  const spawn = () => {
    const n = Math.min(ROLES.length, G.CREW + Math.floor(lap() / 2));
    state.gunship = {
      phase: 'approach',
      dx: G.START_DX, // her offset from our ship (ship coords; dy is down)
      dy: rand(-G.START_DY, G.START_DY),
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
    warn('ENEMY GUNSHIP! HOOKSHOT AT THE BOW - BOARD HER!', 4);
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
  const fly = (g, dt, mode) => {
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
    if (helm) {
      let tx = G.HOLD_DX + Math.sin(g.t * 0.5) * G.WOBBLE_X;
      if (mode === 'leave') tx = 6000;
      const close = clamp(G.KX * (tx - g.dx), -G.MAX_CLOSE, G.MAX_CLOSE);
      wantVx = clamp(g.seenVx + close, -G.MAX_BACK, G.MAX_SPEED);
      accX = clamp((wantVx - g.wvx) * G.ENGINE_GAIN, -G.ACCEL_X, G.ACCEL_X);
    } else accX = -g.wvx * G.DRAG_X; // engines idle: she coasts and slows
    g.wvx += accX * dt;
    // Vertical: gas lift. The helmsman trims her level with our deck (and away from rock).
    let accY = 0;
    if (helm) {
      let ty = G.HOLD_DY + Math.sin(g.t * 0.7 + 1) * G.WOBBLE_Y;
      if (mode === 'leave') ty -= 300;
      const cx = GS.x0 + 550 + g.dx;
      if (inRock(state, cx, GS.deckY - 420 + g.dy - state.ship.alt)) ty += G.ROCK_AVOID; // rock above: dive
      if (inRock(state, cx, GS.deckY + 220 + g.dy - state.ship.alt)) ty -= G.ROCK_AVOID; // rock below: climb
      const wantVy = clamp(g.seenVy + G.KY * (g.dy - ty), -G.MAX_VY, G.MAX_VY); // she is below (dy > ty): climb
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
    // Move: relative to us she gains/loses ground by the difference in speeds.
    g.dx += (g.wvx - ourVx) * dt;
    g.dy += dAlt - g.wvy * dt;
  };

  // ---- Boarding: swinging across on the rope (and back) ----
  const inSwingRange = (g) => g.rope && gap(g) <= G.SWING_RANGE;
  const swing = (player) => {
    const g = state.gunship;
    if (!g || !g.rope || player.swing || !inSwingRange(g)) return;
    const out = !player.onGunship;
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
    let g = state.gunship;
    if (!g) {
      for (const p of Object.values(state.players)) if (p.onGunship) dropOff(p); // (nothing to stand on)
      if (state.phase !== 'flying' || state.ship.down || state.boss || !Object.keys(state.players).length) return;
      if ((timer -= dt * (state.tempo && state.tempo.phase === 'calm' ? 0 : state.tempo && state.tempo.phase === 'peak' ? 1.7 : 1)) > 0) return;
      if (!roomAlongside()) {
        timer = 6;
        return;
      }
      timer = rand(G.EVERY_MIN, G.EVERY_MAX);
      spawn();
      g = state.gunship;
    }
    g.hit = Math.max(0, g.hit - dt);
    if (g.phase === 'sinking') {
      g.sink += dt;
      fly(g, dt, 'dead');
      if (g.sink > 4) state.gunship = null;
      return;
    }
    if (g.phase === 'leaving') {
      fly(g, dt, 'leave');
      if (Math.abs(g.dx) > G.GONE_DIST || Math.abs(g.dy) > G.GONE_DIST) state.gunship = null;
      return;
    }
    // Rock in her way for a moment? She breaks off.
    g.rockT = roomAlongside(g.dx, g.dy) ? 0 : (g.rockT || 0) + dt;
    if (g.rockT > 1.5) {
      leave('THE GUNSHIP BREAKS OFF!', 2);
      return;
    }
    fly(g, dt, 'hold');
    // Lost her (or left her far behind)?
    if (Math.abs(g.dx) > G.GONE_DIST || Math.abs(g.dy) > G.GONE_DIST) {
      if (g.rope) setRope(false);
      dropAll();
      state.gunship = null;
      return;
    }
    if (g.phase === 'approach') {
      // On station once she's close and roughly level.
      if (Math.abs(g.dx - G.HOLD_DX) < G.DOCK_DX && Math.abs(g.dy - G.HOLD_DY) < G.DOCK_DY) g.phase = 'docked';
      return;
    }
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
    if (gunners && !g.charge && !state.ship.down && (g.fireCd -= dt * (steam ? 1 : 0.5)) <= 0) {
      g.fireCd = G.FIRE_EVERY * rand(0.85, 1.2);
      const missChance = clamp(G.MISS_BASE + Math.abs(g.dy - G.HOLD_DY) / G.MISS_DY + Math.max(0, Math.abs(g.dx - G.HOLD_DX) - G.MISS_FREE_DX) / G.MISS_DX, 0, G.MISS_MAX);
      for (let k = 0; k < Math.min(G.SHOTS, gunners + 1); k++) {
        const fx = GS.x0 - 40 + g.dx;
        const fy = 560 + k * 70 + g.dy - state.ship.alt;
        const tx = rand(700, 1500);
        const ty = rand(480, 820) - state.ship.alt;
        const d = Math.hypot(tx - fx, ty - fy) || 1;
        state.bullets.push({ x: fx, y: fy, vx: ((tx - fx) / d) * 620, vy: ((ty - fy) / d) * 620, life: 3, miss: Math.random() < missChance });
        state.flashes && state.flashes.push({ x: fx, y: fy, ang: Math.PI, t: 0.12, color: '#ffcf80', size: 1.6 });
      }
      state.sfxQ && state.sfxQ.push(['cannon']);
    }
    if (!gunners) g.fireCd = Math.max(g.fireCd, 1.5); // a fresh gunner needs a moment to fire
    g.warnFire = !!gunners && !g.charge && g.fireCd < 1;
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
      } else if (c === guards[0] && g.rope && !boarders.length && g.ropeT > 3) {
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
    if (!g || g.phase !== 'docked' || !player.onGunship) return false;
    const c = g.crew.filter((q) => Math.abs(q.x - player.x) < range).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    if (!c) return false;
    c.wind = 0;
    c.x += (c.x > player.x ? 1 : -1) * (sword ? 90 : 60);
    hurt(c, sword ? 2 : 1);
    return true;
  };

  // What a player standing here could do with the gunship.
  const interaction = (player) => {
    const g = state.gunship;
    if (!g || g.phase !== 'docked' || player.d !== MAIN) return null;
    if (player.onGunship) {
      if (g.rope && inSwingRange(g) && player.x < GS.x0 + 110) return { type: 'swing', label: 'Swing back!' };
      if (!g.charge && Math.abs(player.x - GS.boilerX) < 70) return { type: 'sabotage', obj: g, hold: true, time: G.PLANT_TIME, label: 'Plant charge!' };
      return null;
    }
    if (player.x > MAIN_X1 - 45) {
      if (!g.rope) return { type: 'hook', label: gap(g) <= G.HOOK_RANGE ? 'Fire hookshot!' : 'Too far to hook!' };
      if (inSwingRange(g)) return { type: 'swing', label: 'Swing across!' };
    }
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
    timer = G.FIRST_AFTER;
  };

  return { update, reset, interaction, fireHook, plant, hitCrew, swing, swingStep, walk, land, deckAt: (p) => deckAt(state.gunship, p.x, p.y), inSwingRange: () => !!state.gunship && inSwingRange(state.gunship), inHookRange: () => !!state.gunship && gap(state.gunship) <= G.HOOK_RANGE, spawn: () => !state.gunship && spawn() };
}
