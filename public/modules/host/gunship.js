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
// She is a whole airship, with the same systems as ours (g.wvx / g.wvy are her speeds through the world):
//   GASBAG   g.gas (0..1, 0.5 = neutral): lift = (gas - 0.5) x LIFT_ACC with drag, so she rises and sinks
//            only as her crew fill or vent it. The helmsman sets the target; the pump speed depends on steam.
//   BOILER   g.steam: her stoker feeds it; engines and the gas pump draw on it. Cold boiler = weak engines.
//   ENGINES  g.eng[2] (health) and g.thr (throttle along her nose). Propellers spin with the throttle,
//            sputter and smoke when damaged. She can only push along her nose, so to go the other way she
//            TURNS ROUND (g.turn: a ~1.5 s squash through the middle; the whole ship, crew, ports, yardarm and
//            boiler are mirrored at the midpoint - g.m = +1 nose right / stern, guns and yardarm at her left end,
//            -1 the mirror image). She only turns when nobody is aboard and no rope is on.
//   HELM     the helmsman steers all this; no helmsman = engines idle, bag leaks, she wallows.
// Her captain (decide / plan) scores what to do - hold a firing spot, STRAFE past us, climb above us for
// paratroopers, RETREAT to patch her hull, FLEE, latch on - and shows it on a pennant on her mast (g.intent).
// Her stern guns only bear on us when her stern faces us (g.bears).
// Her position is stored as an offset from our ship (g.dx, g.dy, in ship coordinates; dy is down).
// Everything on her (crew, posts, boarders) lives in her own "home frame" (x = g.bp.x0..g.bp.x1, y = the deck
// heights in g.bp.decks) and is shifted by (g.dx, g.dy) to reach ship coordinates - see deckAt().
// No two gunships are alike: gunshipBlueprint.js generates each one's hull, decks, guns, special, crew and captain.
// The rope only pulls when taut: a gentle tug on us, a hard one on her; it snaps if stretched too far.
import { crewMul } from './crewscale.js';
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { inRock, scrollSpeed } from './course.js';
import { platformBelow } from './nav.js';
import { pop } from './popups.js';
import { generateBlueprint, X0, mx, decksOf, segAt, deckYAt, landX, landSeg, landY, boilerX, boilerSeg, boilerY, portPos, firstCannon, anchorPt, surfaces as bpSurfaces, routeStep } from './gunshipBlueprint.js';

export { mx, landX, landSeg, landY, boilerX, boilerSeg, boilerY, portPos, routeStep, decksOf, segAt, deckYAt };
const G = config.GUNSHIP;
const GP = config.GUNSHIP_PARTS;
const P = SHIP_LAYOUT.platforms;
const MAIN = P.findIndex((p) => p.id === 'main');
const CAT = P.findIndex((p) => p.id === 'catwalk');
export const MAIN_X1 = P[MAIN].x1; // the bow end of our main deck
// Legacy numbers (her stern end is always X0; her nose end and decks depend on the blueprint: g.bp).
export const GS = { x0: X0, x1: X0 + 1100, deckY: P[MAIN].y };
const ROLES = ['gunner', 'helm', 'stoker', 'guard', 'gunner', 'guard', 'guard', 'guard'];
export const BOW = { x: MAIN_X1 + 10, y: P[MAIN].y - 50 }; // where our end of the rope is tied (ship coords)
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
const NODE_NAMES = Object.keys(G.NODES);

// Hunting or latched on (the phases in which she can be boarded, and her crew fights back).
const engaged = (g) => g.phase === 'hunt' || g.phase === 'latch';

// Where a player/point standing on her deck is, in ship coordinates (null if she isn't there).
export function deckAt(g, x = 0, y = 0) {
  return g ? { x: x + g.dx, y: y + g.dy } : null;
}
// Her yardarm (where the rope hooks on), in ship coordinates.
export const anchorAt = (g) => {
  const a = anchorPt(g);
  return { x: a.x + g.dx, y: a.y + g.dy };
};
// Her outer ends (the same canonical or mirrored).
const leftEnd = (g) => g.bp.x0;
const rightEnd = (g) => g.bp.x1;
// Does a weapon of this kind live on the gunship? (cannon ports are the broadside)
const isCannon = (g, k) => g.bp.weapons[k].kind === 'cannon';

export function createGunship({ state, puff, impact, credit, dropOne, pickType, spawnBats }) {
  state.gunship = null;
  state.paras = []; // paratroopers in the air (world coordinates, like shells)
  const S = (state.gsStats = { spawned: 0, dropped: 0, shot: 0, landed: 0, latches: 0, cut: 0, sent: 0, portsDown: 0, contacts: 0, collisions: 0, reverts: 0, maxDepth: 0, breakoffs: 0, shots: 0, turns: 0, strafes: 0, retreats: 0, aborts: 0, flees: 0, climbs: 0, mortars: 0, flaks: 0, turretShots: 0, bats: 0, harpoons: 0, ladders: 0 });
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
  const freeAt = (g, dx, dy) => !hits(dx, dy, g.bp.pts.spot); // room to sit here, with a margin round her?

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

  // Somewhere to appear: far off our bow, clear of rock, with a clear flight path in to our station
  // (tries the full distance first, then nearer). Returns { dx, dy } or null.
  const spawnPos = (bp) => {
    for (const dx of [G.START_DX, 3400, 2600]) {
      for (let k = 0; k < 6; k++) {
        const dy = rand(-G.START_DY, G.START_DY);
        if (hits(dx, dy, bp.pts.col)) continue;
        let clear = true;
        for (let x = dx - 500; x > 0 && clear; x -= 500) if (hits(x, dy, bp.pts.look)) clear = false;
        if (clear) return { dx, dy };
      }
    }
    return null;
  };
  const portHp = (kind) => (kind === 'turret' ? GP.TURRET_GUN.HP : kind === 'mortar' ? GP.MORTAR_GUN.HP : kind === 'flak' ? GP.FLAK_GUN.HP : G.PORT_HP);
  // opt: a seed number, or { seed, hull, layout, special, personality, mission } to force parts (tests).
  const spawn = (opt) => {
    const o = opt && typeof opt === 'object' ? opt : {};
    const seed = typeof opt === 'number' ? opt : o.seed != null ? o.seed : (Math.random() * 0x7fffffff) | 0;
    const bp = generateBlueprint(seed, { mission: lap(), difficulty: state.difficulty, ...o });
    const at = spawnPos(bp);
    if (!at) return false;
    S.spawned++;
    const hp = Math.round((G.HP + (lap() - 1) * 6) * bp.hpMul * (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).gunHp * crewMul(state, 'hp'));
    const parasMul = bp.special === 'paras' ? GP.PARAS.EVERY_MUL : 1;
    state.gunship = {
      bp,
      cap: bp.cap, // her captain's personality settings
      phase: 'approach',
      mode: 'station', // what her captain is doing: 'station' (ring spots), 'strafe' or 'retreat' (waypoint runs)
      intent: 'approach', // shown on her mast pennant
      wp: [], // waypoints of a run (offsets from our ship)
      m: -1, // +1: nose right, stern (guns, yardarm, landing spot) at her left end. -1: the mirror image (she arrives flying toward us)
      side: 1, // which end her guns point out of (= -m)
      turn: null, // turning round: { t }
      turnCd: 0,
      wantM: -1,
      dx: at.dx, // her offset from our ship (ship coords; dy is down)
      dy: at.dy,
      okW: null, // last rock-free position (world coordinates), for emergencies
      ports: bp.weapons.map((w) => ({ kind: w.kind, hp: portHp(w.kind), dead: false, cd: rand(2, 5) })),
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
      extra: Math.round(G.LATCH_EXTRA * (bp.hull === 'cutter' ? 0.6 : bp.hull === 'dreadnought' ? 1.4 : 1)),
      paraT: G.PARA_FIRST * parasMul,
      paraDue: false,
      cutObj: { x: BOW.x - 110, d: MAIN, prog: 0 }, // what the crew hold Action on to cut her line
      scrapeCd: 0,
      huntT: 0, // seconds spent hunting (a boarder captain latches on after a while)
      harpT: GP.HARPOON.FIRST, // harpoon gun: seconds until she may fire it
      harpFlash: 0,
      hangarT: GP.HANGAR.FIRST, // bat hangar: seconds until the next launch
      hangarOpen: 0, // hangar door open (drawing)
      ramp: 0, // boarding ramp extension 0..1 (drawing)
      // systems
      gas: 0.55, // gasbag fill (0..1; 0.5 neutral)
      steam: 0.8, // boiler pressure (0..1)
      thr: 0.7, // engine throttle along her nose (-REVERSE..1)
      eng: bp.engines.map(() => ({ hp: 1 })), // engine health, one per pod
      props: bp.engines.map(() => rand(0, 6)), // propeller angles (drawing)
      sput: 0, // sputtering engines (seconds left)
      pitch: 0, // nose up (+) / down (-), radians
      wheel: 0, // helm wheel angle (drawing)
      wvx: G.START_VX, // her own speeds through the world (wvy is up)
      wvy: state.ship.vy || 0,
      seenVx: scrollSpeed(state), // what her helmsman has noticed of OUR speeds (he reacts slowly)
      seenVy: state.ship.vy || 0,
      prevAlt: state.ship.alt,
      t: rand(0, 6),
      lastStrafe: 0,
      retreats: 0,
      repT: 0,
      hammerT: 0,
      hp,
      max: hp,
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
    const g = state.gunship;
    for (const role of ROLES.slice(0, bp.crew)) {
      const post = postFor(role);
      g.crew.push({ role, post, x: post, y: deckYAt(g, post), d: MAIN, hp: G.CREW_HP, cd: rand(0.5, 1.5), face: g.m, wind: 0, cutT: 0, hammer: 0 });
    }
    warn(bp.title + ' APPROACHES - SHOOT OUT HER GUNS OR BOARD HER!', 4);
    return true;
  };

  // Where a crew member taking this job should stand (the first free spot).
  const postFor = (role) => {
    const g = state.gunship;
    const used = g ? g.crew.filter((c) => c.role === role).map((c) => c.post) : [];
    const list = (g.bp.posts[role] || g.bp.posts.guard).map((x) => mx(g, x));
    return list.find((x) => !used.includes(x)) ?? list[0];
  };
  const atPost = (role) => (state.gunship ? state.gunship.crew.filter((c) => c.role === role && Math.abs(c.x - c.post) < 25 && !c.wind) : []);

  // ---- Turning round ----
  // She only pushes along her nose, so to go the other way (or to swing her stern guns toward us) she turns:
  // a squash through the middle over TURN_TIME. At the midpoint everything on her is mirrored.
  const aboardAny = () => Object.values(state.players).some((p) => p.onGunship || p.swing);
  const canTurn = (g) => !g.turn && g.turnCd <= 0 && !g.rope && !g.charge && g.helmOk && g.phase !== 'sinking' && !aboardAny();
  const flip = (g) => {
    g.m = -g.m;
    g.side = -g.m;
    const sum = g.bp.x0 + g.bp.x1;
    const nDecks = decksOf(g).length;
    for (const c of g.crew) {
      c.x = sum - c.x;
      c.post = sum - c.post;
      c.face = -c.face;
    }
    for (const p of Object.values(state.players)) {
      if (!p.onGunship) continue; // (only if someone dropped in mid-turn)
      p.x = sum - p.x;
      p.gd = nDecks - 1 - (p.gd || 0); // (the decks are listed left to right: they reverse)
      p.vx = -(p.vx || 0);
      p.face = -(p.face || 1);
    }
    state.sfxQ && state.sfxQ.push(['swing']);
  };
  // Does her stern (where her guns are) face our ship?
  const bearsOn = (g) => (800 - (g.bp.cx + g.dx)) * -g.m > -120;

  // ---- Her flight: gasbag, boiler, engines, helmsman, and the rope ----
  // mode: 'hold' (fly the captain's course), 'leave' (run for it), 'dead' (no control: shot down / blown up)
  const fly = (g, dt, mode, tgt = { dx: G.HOLD_DX, dy: G.HOLD_DY }) => {
    g.t += dt;
    const ourVx = scrollSpeed(state);
    const ourVy = state.ship.vy || 0;
    const dAlt = state.ship.alt - g.prevAlt; // however OUR altitude changed (lift, rock bumps...), she is that much lower/higher on screen
    g.prevAlt = state.ship.alt;
    const react = Math.min(1, dt / G.REACT);
    g.seenVx += (ourVx - g.seenVx) * react;
    g.seenVy += (ourVy - g.seenVy) * react;
    const dead = mode === 'dead';
    const helm = !dead && g.crew.some((c) => c.role === 'helm');
    g.helmOk = helm;
    g.bears = bearsOn(g);
    const hpF = clamp(g.hp / g.max, 0, 1);
    // Boiler: her stoker feeds it; engines draw on it. A cold boiler = weak engines and a slow gas pump.
    const stoker = !dead && atPost('stoker').length > 0;
    g.steam = clamp(g.steam + ((stoker ? G.STEAM_FEED : -G.STEAM_LOSS) - Math.abs(g.thr) * G.STEAM_USE) * dt, 0, 1);
    const sf = G.STEAM_MIN + (1 - G.STEAM_MIN) * clamp(g.steam / 0.5, 0, 1);
    g.engF = g.eng.reduce((a, e) => a + e.hp, 0) / g.eng.length;
    g.sput = Math.max(0, g.sput - dt);
    if (!dead && g.sput <= 0 && (g.engF < 0.55 || g.steam < 0.12) && Math.random() < dt * 1.2) g.sput = rand(0.3, 0.7); // engines cough
    const power = sf * (0.25 + 0.75 * g.engF) * (g.sput > 0 ? 0.35 : 1) * g.bp.enginePower;
    // Her helmsman looks ahead along her own motion (in the world) for rock, and brakes / turns away.
    const L = G.LOOKAHEAD;
    const blockedX = helm && hits(g.dx + g.wvx * L, g.dy, g.bp.pts.look);
    const blockedY = helm && hits(g.dx, g.dy - g.wvy * L, g.bp.pts.look);
    let wantVx = 0;
    let thrWant = 0;
    let wantM = g.m;
    let gasT = null;
    let steer = 0;
    if (helm) {
      // Horizontal: ask for a speed that closes the gap to her station, and set the throttle for it.
      let tx = tgt.dx + Math.sin(g.t * 0.5) * G.WOBBLE_X;
      if (mode === 'leave') tx = g.dx < -600 ? -6000 : 6000;
      const closeMax = mode === 'leave' ? G.CLOSE_PASS : tgt.close || G.MAX_CLOSE;
      // (still pointing the wrong way for her station? ease off so she has room to swing round)
      const kx = tgt.station && g.seenVx > G.TURN_MIN_SPEED && g.m !== 1 ? G.KX * 0.5 : G.KX;
      const close = clamp(kx * (tx - g.dx), -closeMax, closeMax);
      wantVx = clamp(g.seenVx + close, -G.MAX_SPEED, G.MAX_SPEED);
      if (tgt.hold || blockedX) wantVx = 0; // nowhere to go: sit still in the world
      const need = (wantVx - g.wvx) * G.ENGINE_GAIN + wantVx * G.DRAG_X; // acceleration asked of the engines
      thrWant = clamp((need * g.m) / G.ENGINE_ACC, -G.REVERSE, 1); // (they push along her nose)
      // Which way should her nose point? Along her wanted travel; near a station, the way we are flying.
      if (tgt.station && Math.abs(tgt.dx - g.dx) < G.TURN_AHEAD && g.seenVx > G.TURN_MIN_SPEED) wantM = 1;
      else if (Math.abs(wantVx) > G.TURN_MIN_SPEED) wantM = wantVx > 0 ? 1 : -1;
      // On a firing spot with her stern facing away from us? Swing round so the guns bear.
      if (tgt.fire && tgt.dist < 450 && !g.bears) wantM = g.bp.cx + g.dx > 800 ? 1 : -1;
      // Vertical: the helmsman sets the gas so she climbs or sinks toward her station (and away from rock).
      let ty = tgt.dy + Math.sin(g.t * 0.7 + 1) * G.WOBBLE_Y;
      if (mode === 'leave') ty -= 300;
      let wantVy = clamp(g.seenVy + G.KY * (g.dy - ty), -G.MAX_VY, G.MAX_VY); // she is below (dy > ty): climb
      if (tgt.hold) wantVy = 0;
      if (blockedY) wantVy = g.wvy > 0 ? -60 : 60; // rock above: dive a little; rock below: climb
      gasT = clamp(0.5 + (wantVy * G.DRAG_Y + (wantVy - g.wvy) * G.GAS_DAMP) / G.LIFT_ACC, 0, 1);
      steer = clamp((wantVx - g.wvx) * 0.004 + (gasT - 0.5) * 2, -1, 1);
    }
    g.wantM = wantM;
    // Turning round.
    g.turnCd = Math.max(0, g.turnCd - dt);
    if (g.turn) {
      g.turn.t += dt;
      if (!g.turn.flipped && g.turn.t >= G.TURN_TIME / 2) {
        g.turn.flipped = true;
        flip(g);
      }
      if (g.turn.t >= G.TURN_TIME) {
        g.turn = null;
        g.turnCd = G.TURN_CD;
      }
    } else if (helm && wantM !== g.m && canTurn(g)) {
      g.turn = { t: 0, flipped: false };
      S.turns++;
    }
    if (g.turn) thrWant = 0; // (no way on while she swings round)
    // Engines: throttle follows the wish; the propellers spin with it.
    g.thr += (thrWant - g.thr) * Math.min(1, dt * G.THROTTLE_RESP);
    for (let i = 0; i < g.eng.length; i++) {
      const e = g.eng[i];
      g.props[i] += dt * (5 + 38 * Math.abs(g.thr) * (g.sput > 0 ? 0.35 : 1) * (0.3 + 0.7 * e.hp)) * (g.thr < 0 ? -1 : 1);
    }
    const accX = g.thr * G.ENGINE_ACC * power * g.m - g.wvx * G.DRAG_X; // thrust along her nose, less drag
    g.wvx += accX * dt;
    // Gasbag: lift = (gas - neutral) x LIFT_ACC. Her crew fill and vent it (pump speed depends on steam); with
    // nobody at the helm, or a holed hull, it leaks and she sags.
    const pump = G.GAS_PUMP_MIN + (1 - G.GAS_PUMP_MIN) * clamp(g.steam / 0.5, 0, 1);
    if (gasT !== null) g.gas += clamp(gasT - g.gas, -G.GAS_RATE * 1.4 * pump, G.GAS_RATE * pump) * dt;
    else g.gas -= (dead ? 0.15 : G.LEAK_NOHELM) * dt;
    g.gas = clamp(g.gas - (1 - hpF) * G.LEAK_DAMAGE * dt, 0, 1);
    g.wvy += ((g.gas - 0.5) * G.LIFT_ACC - g.wvy * G.DRAG_Y) * dt;
    // Pitch into climbs and dives (the picture only); the wheel turns with the steering.
    const tcap = g.rope || aboardAny() ? G.TILT_ABOARD : G.TILT_MAX;
    g.pitch += (clamp(g.wvy * G.TILT_PER_SPEED, -tcap, tcap) - g.pitch) * Math.min(1, dt * 2);
    g.wheel += g.turn ? dt * 5 * g.m : (steer * 1.2 - g.wheel) * Math.min(1, dt * 3);
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
    const l = g.bp.x0 - 75 + g.dx;
    const r = g.bp.x1 + 75 + g.dx;
    const top = g.bp.bagTop + 60 + g.dy;
    const bot = g.bp.hullBot + 8 + g.dy;
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
    for (const name of NODE_NAMES) g.free[name] = freeAt(g, G.NODES[name].dx, G.NODES[name].dy);
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
        if (!freeAt(g, dx, dy)) continue;
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
      const wOf = (n) => G.NODES[n].w * (g.cap.nodeW[n] ?? 1);
      let r = Math.random() * options.reduce((s, n) => s + wOf(n), 0);
      for (const n of options) if ((r -= wOf(n)) <= 0) { want = n; break; }
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
  // ---- Her captain: strafing runs and retreats are waypoint runs (offsets from our ship) ----
  // A straight run is only flown if rock is clear along the whole way.
  const runFree = (g, x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 450));
    for (let k = 0; k <= n; k++) if (hits(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, g.bp.pts.look)) return false;
    return true;
  };
  const endMode = (g) => {
    g.mode = 'station';
    g.wp = [];
    g.node = null;
    g.temp = null;
    g.arrived = false;
    g.planT = 0;
    g.stayT = 0;
    g.wpT = 0;
    g.atRetreat = false;
  };
  const gunsReady = (g) => g.crew.some((c) => c.role === 'gunner') && g.ports.some((pt) => !pt.dead && pt.kind === 'cannon');
  // A pass along our ship: climb (or dive) to one side, turn, then run across firing from the stern as she goes by.
  const startStrafe = (g) => {
    if (!gunsReady(g) || g.paraDue || g.t - g.lastStrafe < G.STRAFE_CD * g.cap.strafeCd || Math.random() > g.cap.strafeChance) return false;
    const heights = Math.random() < 0.5 ? [G.STRAFE_Y_HI, G.STRAFE_Y_LO] : [G.STRAFE_Y_LO, G.STRAFE_Y_HI];
    const leftward = g.dx > -600; // she is ahead of us: run back along our side toward the stern (else the other way)
    for (const dy of heights) {
      const entry = { dx: leftward ? Math.max(g.dx, 1400) : Math.min(g.dx, -3000), dy, close: G.STRAFE_CLOSE };
      const exit = { dx: leftward ? -3300 : 2600, dy, close: G.STRAFE_CLOSE, pass: 300 };
      if (hits(entry.dx, entry.dy, g.bp.pts.spot) || hits(exit.dx, exit.dy, g.bp.pts.spot)) continue;
      if (!runFree(g, g.dx, g.dy, entry.dx, entry.dy) || !runFree(g, entry.dx, entry.dy, exit.dx, exit.dy)) continue;
      g.mode = 'strafe';
      g.wp = [entry, exit];
      g.wpT = 0;
      g.lastStrafe = g.t;
      g.node = null;
      g.temp = null;
      S.strafes++;
      return true;
    }
    return false;
  };
  // Badly hurt: pull out of range and patch the hull (and engines), then come back.
  const startRetreat = (g) => {
    const sd = g.dx < -600 ? -1 : 1; // (away from us, out the nearer end: never across our ship)
    const spots = [[sd * G.RETREAT_DX, -300], [sd * G.RETREAT_DX, 300], [sd * G.RETREAT_DX, -800], [sd * 3000, -1000], [sd * 3000, 900], [sd * G.RETREAT_DX, 800]];
    for (const [dx, dy] of spots) {
      if (hits(dx, dy, g.bp.pts.spot) || !runFree(g, g.dx, g.dy, dx, dy)) continue;
      g.mode = 'retreat';
      g.wp = [{ dx, dy, close: G.CLOSE_PASS, pass: 250, stay: true }];
      g.wpT = 0;
      g.repT = 0;
      g.retreats++;
      g.node = null;
      g.temp = null;
      g.atRetreat = false;
      S.retreats++;
      warn('THE GUNSHIP PULLS OUT TO PATCH HER HULL!', 2.5);
      return true;
    }
    return false;
  };
  const wpTarget = (g, dt) => {
    g.wpT += dt;
    let w = g.wp[0];
    while (w && !w.stay && Math.hypot(g.dx - w.dx, g.dy - w.dy) < (w.pass || G.WP_PASS)) {
      g.wp.shift();
      w = g.wp[0];
    }
    if (!w || (g.mode === 'strafe' && g.wpT > G.WP_TIMEOUT)) {
      if (g.mode === 'strafe' && w) S.aborts++;
      endMode(g);
      return { dx: g.dx, dy: g.dy, hold: true, dist: 0, station: true };
    }
    const dist = Math.hypot(g.dx - w.dx, g.dy - w.dy);
    g.atRetreat = g.mode === 'retreat' && dist < 400;
    return { dx: w.dx, dy: w.dy, hold: false, dist, close: w.close, station: false };
  };
  // Each step: re-check the ring now and then, decide what to do next, and return the point she should fly to now.
  const plan = (g, dt) => {
    const need = g.phase === 'approach' || g.phase === 'latch' || g.rope ? 'bow' : null;
    const contact = g.rope || g.charge || aboardAny(); // roped, charge set, or crew aboard: she stays where she is
    if (g.mode !== 'station' && (contact || g.phase !== 'hunt')) endMode(g);
    if ((g.planT -= dt) <= 0) {
      g.planT = G.PLAN_EVERY;
      refreshFree(g);
      if (g.mode === 'station') {
        const stale = g.temp ? !freeAt(g, g.temp.dx, g.temp.dy) || g.t - g.tempT > 2 : g.node ? !g.free[g.node] || g.route.some((n) => !g.free[n]) : true;
        const wrongSpot = need && g.node !== 'bow' && !(g.temp && g.free.bow === false);
        const moveOn = g.arrived && g.stayT <= 0;
        const dropNow = g.paraDue && g.node && !G.NODES[g.node].drop && g.arrived && g.t - g.arrT > 2;
        if (g.phase === 'hunt' && !contact && g.hp < g.cap.retreatAt * g.max && g.retreats < g.cap.retreats && startRetreat(g)) {
          // (pulling out to repair)
        } else if (moveOn && g.phase === 'hunt' && !contact && !need && startStrafe(g)) {
          // (strafing run)
        } else if (stale || wrongSpot || moveOn || dropNow) pick(g, need);
      }
    }
    if (g.mode !== 'station') return wpTarget(g, dt);
    if (g.noRoom) return { dx: g.dx, dy: g.dy, hold: true, dist: 0, station: true };
    let n = g.temp;
    if (!n && g.node) {
      while (g.route.length > 1 && nodeDist(g, G.NODES[g.route[0]]) < G.NODE_PASS) g.route.shift();
      n = G.NODES[g.route.length ? g.route[0] : g.node];
    }
    if (!n) return { dx: g.dx, dy: g.dy, hold: true, dist: 0, station: true };
    const dist = Math.hypot(g.dx - n.dx, g.dy - n.dy);
    const last = g.temp || g.route.length <= 1; // heading for the final spot
    if (last && dist < G.NODE_ARRIVE * 1.5 && !g.arrived) {
      g.arrived = true;
      g.arrT = g.t;
      g.route = [];
    }
    if (g.arrived) g.stayT -= dt;
    return { dx: n.dx, dy: n.dy, hold: false, dist, station: true, fire: !!(g.temp || (g.node && G.NODES[g.node].fire)) };
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
      for (const [px, py] of g.bp.pts.col) {
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
    if (buried && !first) first = { up: 0, down: 0, back: 0, fwd: 0, deep: { x: g.bp.x0 + g.dx, y: g.bp.hullTop + g.dy } };
    if (!first) {
      // Clear: remember where (in the world) she was last fine.
      g.okW = { x: g.dx + dist, y: g.dy - alt };
      return false;
    }
    // Still inside rock after all that (squeezed between walls)? Go back to the last clear spot.
    if (buried || hits(g.dx, g.dy, g.bp.pts.col)) {
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
        if (p.x < g.bp.x0 + 140) d = 1;
        else if (p.x > g.bp.x1 - 140) d = -1;
        p.vx = (p.vx || 0) + d * G.SCRAPE_SHOVE;
      }
    }
    return true;
  };

  // ---- Paratroopers ----
  const dropParas = (g) => {
    const crew = Object.keys(state.players).length;
    const n = clamp(Math.round((1 + Math.floor(crew / 6) + (lap() >= 3 ? 1 : 0) + (g.bp.special === 'paras' ? GP.PARAS.EXTRA : 0)) * crewMul(state, 'raiders')), 1, 5);
    const alt = state.ship.alt;
    const sx = mx(g, g.bp.x0 + 80) + g.dx;
    const sy = deckYAt(g, mx(g, g.bp.x0 + 80)) + g.dy - 110;
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
    const b = out ? { x: landX(g) + g.dx, y: landY(g) + g.dy } : { x: MAIN_X1 - 30, y: P[MAIN].y };
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
    const end = s.out ? { x: landX(g) + g.dx, y: landY(g) + g.dy } : { x: MAIN_X1 - 30, y: P[MAIN].y };
    p.x = s.from.x + (end.x - s.from.x) * e;
    p.y = s.from.y + (end.y - s.from.y) * e + G.SWING_DIP * Math.sin(Math.PI * k) - 40 * Math.sin(Math.PI * Math.min(1, k * 4)); // a hop off, then the dip
    p.face = end.x > s.from.x ? 1 : -1;
    p.moving = false;
    if (k >= 1) {
      p.swing = null;
      if (s.out) {
        p.onGunship = true;
        p.x = landX(g);
        p.y = landY(g);
        p.gd = landSeg(g);
        p.ladT = 0;
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
  // as nav.js moveWalker: momentum. Her decks are steps along her length (p.gd = which one): the step is a wall, and
  // pushing the stick up/down at it climbs the ladder to the next deck. Walking off either end = falling.
  const walk = (p, jx, jy, dt, speed) => {
    const g = state.gunship;
    if (!g) return dropOff(p);
    p.conn = null;
    p.climb = false;
    const ds = decksOf(g);
    let k = clamp(p.gd || 0, 0, ds.length - 1);
    const want = jx * speed;
    const v = p.vx || 0;
    const speedingUp = Math.abs(want) > Math.abs(v) && Math.sign(want) === Math.sign(v || want);
    const rate = (speedingUp ? config.MOVE.ACCEL : config.MOVE.BRAKE) * dt;
    p.vx = v + clamp(want - v, -rate, rate);
    p.x += p.vx * dt;
    if (Math.abs(jx) > 0.15) p.face = jx < 0 ? -1 : 1;
    // The ladder: stick up/down beside a step moves you to the deck on the other side.
    p.ladT = Math.max(0, (p.ladT || 0) - dt);
    if (Math.abs(jy) > 0.6 && p.ladT <= 0 && !p.air) {
      for (const dir of [-1, 1]) {
        const j = k + dir;
        if (j < 0 || j >= ds.length) continue;
        const xb = dir > 0 ? ds[k].x1 : ds[k].x0;
        const higher = ds[j].y < ds[k].y;
        if (Math.abs(p.x - xb) < 55 && (jy < 0) === higher) {
          p.gd = k = j;
          p.x = xb + dir * 26;
          p.vx = 0;
          p.ladT = 0.4;
          S.ladders++;
          puff(p.x + g.dx, ds[j].y + g.dy - 20 - state.ship.alt, '#d9cbb0', 4);
          break;
        }
      }
    }
    p.gd = k;
    // Stand on this deck (a quick climb when it just changed).
    const ty = ds[k].y;
    p.y = p.y == null || Math.abs(ty - p.y) > 400 ? ty : p.y + clamp(ty - p.y, -900 * dt, 900 * dt);
    // Steps are walls; the two ends of her are the edge.
    if (k > 0) p.x = Math.max(p.x, ds[k].x0);
    else if (p.x < ds[k].x0 - 45) {
      dropOff(p);
      warn('OFF HER DECK! SHE\'S GONE BY - YOU FALL!', 1.5);
      return;
    }
    if (k < ds.length - 1) p.x = Math.min(p.x, ds[k].x1);
    else if (p.x > ds[k].x1 + 45) {
      dropOff(p);
      warn('OFF HER DECK! SHE\'S GONE BY - YOU FALL!', 1.5);
    }
  };
  // A player in free flight (jumped or thrown) lands on one of her decks (k = which, left to right): from then on she carries them.
  const land = (p, k = 0) => {
    const g = state.gunship;
    if (!g) return;
    const ds = decksOf(g);
    k = clamp(k, 0, ds.length - 1);
    p.onGunship = true;
    p.d = MAIN;
    p.gd = k;
    p.ladT = 0;
    p.x = clamp(p.x - g.dx, ds[k].x0 - (k === 0 ? 30 : 0), ds[k].x1 + (k === ds.length - 1 ? 30 : 0));
    p.y = ds[k].y;
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
      if (Math.abs(c.x - p.x) > G.STOMP_RANGE || Math.abs(c.y - p.y) > 60) continue;
      c.wind = 0;
      c.cd = 1.2;
      c.x += g.m > 0 ? 150 : -150; // (shoved away from the stern end, where you land)
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
    for (let k = 0; k < 8; k++) puff(rand(g.bp.x0, g.bp.x1) + g.dx, rand(g.bp.bagTop + 80, g.bp.hullBot) + g.dy - state.ship.alt, k % 2 ? '#ff5a1f' : '#555', 24);
    pop(state, g.bp.cx + g.dx, g.bp.bagTop + 80 + g.dy - state.ship.alt, 'boss', '#ff5a1f', 1.6);
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
    g.intent = 'flee';
    g.mode = 'station';
    warn(text, secs);
  };

  // She turns to latching on (a boarder captain, a harpoon, or her guns being down).
  const startLatch = (g, text) => {
    g.phase = 'latch';
    g.latchCd = g.bp.special === 'ramp' ? GP.RAMP.LATCH_CD : 1;
    g.paraDue = false;
    g.node = null; // (plan() will now send her alongside)
    warn(text, 3.5);
  };

  const update = (dt) => {
    updateParas(dt);
    let g = state.gunship;
    if (!g) {
      for (const p of Object.values(state.players)) if (p.onGunship) dropOff(p); // (nothing to stand on)
      if (state.phase !== 'flying' || state.ship.down || state.boss || !Object.keys(state.players).length) return;
      return; // (the pacing director in simulation.js decides when she appears)
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
    const contact = g.rope || g.charge || aboardAny();
    // What her captain is up to (shown on her mast pennant).
    g.intent = g.phase === 'latch' ? 'latch' : g.phase === 'approach' ? 'approach' : g.mode === 'retreat' ? 'retreat' : g.mode === 'strafe' ? 'strafe' : g.paraDue || (g.node && G.NODES[g.node].drop && g.arrived) ? 'climb' : 'attack';
    // Badly hurt with her one retreat used up: she runs for it.
    if (g.phase === 'hunt' && !contact && g.hp < g.cap.fleeAt * g.max && g.retreats >= g.cap.retreats) {
      S.flees++;
      leave('THE GUNSHIP IS BADLY HIT AND FLEES!', 2.5);
      return;
    }
    // Her stern guns (which swing round to face us when she turns) track our hull.
    const bp = g.bp;
    const alt = state.ship.alt;
    const cp = portPos(g, firstCannon(g));
    const gpx = cp.x + g.dx;
    const midY = bp.decks[0].y + 20; // the stern deck level (her ports are stacked at the stern end)
    g.aim = Math.atan2(640 - (midY + g.dy), 800 - gpx);
    g.dist = Math.hypot(gpx - 800, midY + g.dy - 640); // from her guns to our hull
    g.hangarOpen = Math.max(0, g.hangarOpen - dt);
    g.harpFlash = Math.max(0, g.harpFlash - dt);
    if (bp.special === 'ramp') g.ramp += ((g.phase === 'latch' ? (g.rope ? 1 : 0.35) : 0) - g.ramp) * Math.min(1, dt * 2.5);
    if (g.phase === 'approach') {
      // Engaged once she is close to where she is heading.
      if (!tgt.hold && Math.abs(g.dx - tgt.dx) < G.DOCK_DX && Math.abs(g.dy - tgt.dy) < G.DOCK_DY) g.phase = 'hunt';
      // Can't get in (rock, or she's stuck behind us)? She gives up rather than hanging there forever.
      else if ((g.approachT = (g.approachT || 0) + dt) > G.APPROACH_GIVEUP) leave('THE GUNSHIP GIVES UP THE CHASE', 2);
      return;
    }
    // She can fire from a firing spot, or on the run leg of a strafing pass - and only with her stern facing us.
    const inPos = g.bears && !g.turn && !tgt.hold && (g.mode === 'strafe' ? g.wp.length <= 1 : tgt.dist < 450 && tgt.fire);
    g.inPos = inPos;
    if (g.mode !== 'retreat') g.docked += dt;
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
    const steamF = 0.5 + 0.5 * clamp(g.steam / 0.4, 0, 1); // (a cold boiler slows her reloads)
    const missFor = (dist) => clamp(G.MISS_BASE + Math.max(0, dist - 1500) / G.MISS_DX, 0, G.MISS_MAX);
    const lineClear = (px, py) => {
      for (let s = 1; s <= 8; s++) if (inRock(state, px + ((800 - px) * s) / 9, py + ((640 - py) * s) / 9 - alt)) return false;
      return true;
    };
    // Broadsides at our hull (with a glow first) - only while her gunners are at the guns. They
    // aim from wherever she is now, so if you pull away from her (above, below, far off) more miss.
    const alive = g.ports.map((pt, k) => k).filter((k) => !g.ports[k].dead && g.ports[k].kind === 'cannon');
    // Her gunners fire from the gun ports that face us, when she is on a firing spot, in range, with a clear line.
    let canFire = g.phase === 'hunt' && gunners > 0 && alive.length > 0 && !g.charge && !state.ship.down && inPos && g.dist < G.FIRE_RANGE;
    if (canFire) {
      const pp = portPos(g, alive[0]);
      canFire = lineClear(pp.x + g.dx, pp.y + g.dy);
    }
    if (canFire && (g.fireCd -= dt * steamF) <= 0) {
      g.fireCd = ((g.mode === 'strafe' ? G.STRAFE_FIRE : G.FIRE_EVERY) * g.cap.fireMul * rand(0.85, 1.2)) / crewMul(state, 'fire');
      const missChance = missFor(g.dist);
      for (let i = 0; i < Math.min(G.SHOTS, gunners + 1, alive.length); i++) {
        const pp = portPos(g, alive[i]);
        const fx = pp.x + g.dx;
        const fy = pp.y + g.dy - alt;
        const tx = rand(700, 1500);
        const ty = rand(480, 820) - alt;
        const d = Math.hypot(tx - fx, ty - fy) || 1;
        state.bullets.push({ x: fx, y: fy, vx: ((tx - fx) / d) * 620, vy: ((ty - fy) / d) * 620, life: 3, miss: Math.random() < missChance });
        state.flashes && state.flashes.push({ x: fx, y: fy, ang: Math.atan2(ty - fy, tx - fx), t: 0.12, color: '#ffcf80', size: 1.6 });
        S.shots++;
      }
      state.sfxQ && state.sfxQ.push(['cannon']);
    }
    if (!canFire) g.fireCd = Math.max(g.fireCd, g.mode === 'strafe' ? 0.8 : 1.5); // a fresh gunner / a new spot needs a moment
    g.warnFire = canFire && g.fireCd < 1;
    // Her extra weapons (top turret, deck mortar, nose flak gun) fire on their own timers, whichever way she faces.
    const heavyOk = g.phase === 'hunt' && gunners > 0 && !g.charge && !state.ship.down;
    g.ports.forEach((pt, k) => {
      if (pt.kind === 'cannon' || pt.dead) return;
      const pp = portPos(g, k);
      const fx = pp.x + g.dx;
      const fy = pp.y + g.dy - alt;
      const d = Math.hypot(fx - 800, pp.y + g.dy - 640);
      const C = pt.kind === 'turret' ? GP.TURRET_GUN : pt.kind === 'mortar' ? GP.MORTAR_GUN : GP.FLAK_GUN;
      const ready = heavyOk && d < C.RANGE && (pt.kind === 'mortar' || lineClear(fx, pp.y + g.dy));
      pt.glow = ready && pt.cd < 0.8;
      if (!ready) {
        pt.cd = Math.max(pt.cd, 1.2);
        return;
      }
      if ((pt.cd -= dt * steamF) > 0) return;
      pt.cd = (C.EVERY * g.cap.fireMul * rand(0.85, 1.2)) / crewMul(state, 'fire');
      const missChance = clamp(missFor(d) + (C.MISS - G.MISS_BASE), 0, G.MISS_MAX);
      const tx = rand(700, 1500);
      const ty = rand(480, 820) - alt;
      if (pt.kind === 'mortar') {
        const T = rand(C.TIME[0], C.TIME[1]);
        state.bullets.push({ x: fx, y: fy, vx: (tx - fx) / T, vy: (ty - fy) / T - 0.5 * C.GRAVITY * T, ay: C.GRAVITY, life: T + 0.05, miss: Math.random() < missChance, dmg: C.DAMAGE, mortar: true });
        S.mortars++;
        state.flashes && state.flashes.push({ x: fx, y: fy - 20, ang: -Math.PI / 2, t: 0.15, color: '#ffcf80', size: 1.8 });
      } else {
        const base = Math.atan2(ty - fy, tx - fx);
        const nShots = pt.kind === 'flak' ? 3 : 1;
        const speed = pt.kind === 'flak' ? C.SPEED : C.SPEED;
        for (let i = 0; i < nShots; i++) {
          const a = base + (nShots > 1 ? (i - 1) * C.SPREAD : 0);
          state.bullets.push({ x: fx, y: fy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 3.2, miss: Math.random() < missChance, flak: pt.kind === 'flak' });
        }
        if (pt.kind === 'flak') S.flaks++;
        else S.turretShots++;
        state.flashes && state.flashes.push({ x: fx, y: fy, ang: base, t: 0.12, color: '#ffcf80', size: 1.6 });
      }
      state.sfxQ && state.sfxQ.push(['cannon']);
    });
    // Dead weapons smoke.
    g.ports.forEach((pt, k) => {
      if (!pt.dead || Math.random() >= dt * 5) return;
      const pp = portPos(g, k);
      puff(pp.x + g.dx + (Math.random() - 0.5) * 30, pp.y + g.dy - alt, '#555', 1);
    });
    // Captain's moves: a BOARDER latches on after a while, a HARPOON gun fires her grapple from range.
    if (g.phase === 'hunt' && g.mode !== 'retreat') g.huntT += dt;
    if (g.phase === 'hunt' && g.cap.latchAfter && g.huntT > g.cap.latchAfter && !g.charge && !g.rope) startLatch(g, 'HER BOARDERS ARE COMING IN TO LATCH ON!');
    if (g.phase === 'hunt' && bp.special === 'harpoon' && !g.rope && !g.charge && g.mode === 'station' && !g.turn && !aboardAny() && (g.harpT -= dt) <= 0) {
      if (g.gap <= GP.HARPOON.RANGE) {
        g.harpT = GP.HARPOON.EVERY;
        g.harpFlash = 0.5;
        S.harpoons++;
        startLatch(g, 'HARPOON! SHE FIRES HER GRAPPLE - CUT THE LINE AT THE BOW OR BOARD HER!');
        setRope(true);
        g.herRope = true;
        S.latches++;
        state.sfxQ && state.sfxQ.push(['swing']);
      } else g.harpT = 2;
    }
    // A bat hangar launches a small swarm now and then.
    if (g.phase === 'hunt' && bp.special === 'hangar' && !g.charge && !state.ship.down && spawnBats && (g.hangarT -= dt) <= 0) {
      if (state.bats.filter((b) => !b.dead && b.hp > 0).length >= GP.HANGAR.MAX_BATS) g.hangarT = 4;
      else {
        spawnBats({ x: mx(g, bp.hangar.x) + g.dx, y: bp.hangar.y + g.dy - alt }, GP.HANGAR.BATS + Math.floor(lap() / 3));
        S.bats++;
        g.hangarOpen = 1.6;
        g.hangarT = GP.HANGAR.EVERY * rand(0.85, 1.2);
      }
    }
    // Guns all down, or no gunners left: she gives up the broadside duel and latches on.
    if (g.phase === 'hunt' && (!g.ports.some((q) => !q.dead) || !g.crew.some((c) => c.role === 'gunner'))) startLatch(g, 'HER GUNS ARE DOWN! SHE\'S COMING IN TO LATCH ON!');
    // Paratroopers: now and then, from a high spot, raiders jump from her deck and parachute down onto us.
    if (g.phase === 'hunt' && !g.rope && (g.paraT -= dt) <= 0) {
      g.paraDue = true;
      const high = g.arrived && g.node && G.NODES[g.node].drop;
      if (high) {
        if (state.paras.length >= G.PARA_MAX_AIR || state.boarders.length >= G.PARA_MAX_BOARDERS || state.ship.down) g.paraT = 3;
        else if (dropParas(g)) {
          S.climbs++;
          g.paraDue = false;
          g.paraT = rand(G.PARA_EVERY_MIN, G.PARA_EVERY_MAX) * (g.bp.special === 'paras' ? GP.PARAS.EVERY_MUL : 1);
          g.stayT = Math.min(g.stayT, 3);
        } else g.paraT = 2;
      }
    }
    // Latching on: close in alongside and fire her own grapple at our bow...
    if (g.phase === 'latch') {
      g.latchCd = Math.max(0, g.latchCd - dt);
      const latchRange = G.LATCH_RANGE * (g.bp.special === 'ramp' ? GP.RAMP.LATCH_RANGE : g.bp.special === 'harpoon' ? GP.HARPOON.LATCH_RANGE : 1);
      if (!g.rope && g.latchCd <= 0 && g.gap <= latchRange) {
        setRope(true);
        g.herRope = true;
        S.latches++;
        state.sfxQ && state.sfxQ.push(['swing']);
        warn('SHE FIRES HER GRAPPLE! CUT THE LINE AT THE BOW - OR BOARD HER!', 3.5);
      }
      // ...then her guards (and deckhands) cross the rope to board us.
      if (g.rope && (g.sendT += dt) >= G.LATCH_SEND_EVERY * (g.bp.special === 'ramp' ? GP.RAMP.SEND_MUL : 1)) {
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
    for (const e of g.eng) e.hp = Math.min(1, e.hp + G.ENGINE_REPAIR * dt); // (her deckhands patch up the engines)
    // Retreat: once she is clear of the fight her crew patch the hull and the engines (hammering along the hull), then she comes back.
    if (g.mode === 'retreat') {
      g.repT += dt;
      if (g.atRetreat) {
        g.hp = Math.min(g.max, g.hp + (G.REPAIR_SEA + 0.2 * guards.length) * dt);
        for (const e of g.eng) e.hp = Math.min(1, e.hp + 0.04 * dt);
        if ((g.hammerT -= dt) <= 0) {
          g.hammerT = rand(0.25, 0.5);
          puff(rand(g.bp.x0 + 100, g.bp.x1 - 100) + g.dx, g.bp.hullBot - 50 + g.dy - state.ship.alt, '#d8c79a', 3);
        }
      }
      if (g.hp >= G.RETURN_AT * g.max || g.repT > G.RETREAT_MAX) {
        endMode(g);
        warn('THE GUNSHIP IS BACK, PATCHED UP!', 2.5);
      }
    }
    for (const c of g.crew) {
      c.cd = Math.max(0, c.cd - dt);
      const foe = boarders.sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      // Guards chase boarders anywhere; the others only fight back when someone's right on them.
      if (foe && Math.abs(foe.x - c.x) < (c.role === 'guard' ? 700 : 200)) {
        c.face = foe.x < c.x ? -1 : 1;
        const sameLevel = Math.abs(foe.y - c.y) < 60; // (on another deck they walk over the step to get at you)
        if (Math.abs(foe.x - c.x) > 60 || !sameLevel) c.x += c.face * G.CREW_SPEED * dt;
        else if (c.cd <= 0 && !c.wind) c.wind = 0.5; // wind up (a readable tell)
        if (c.wind && (c.wind -= dt) <= 0) {
          c.wind = 0;
          c.cd = 1.2;
          if (Math.abs(foe.x - c.x) < 80 && Math.abs(foe.y - c.y) < 60) {
            foe.ko = config.RAIDERS.KO_TIME * 0.5;
            foe.x += c.face * 120;
            const seg = decksOf(g)[clamp(foe.gd || 0, 0, decksOf(g).length - 1)];
            if (foe.x < g.bp.x0 - 20 || foe.x > g.bp.x1 + 20) dropOff(foe); // knocked off her deck!
            else foe.x = clamp(foe.x, seg.x0, seg.x1); // (a step between decks is a wall)
            puff(foe.x + g.dx, foe.y + g.dy - 60 - state.ship.alt, '#ffffff', 8);
            pop(state, foe.x + g.dx, foe.y + g.dy - 150 - state.ship.alt, 'raider', '#ff5a5a', 0.9);
          }
        }
      } else if (c === guards[0] && g.rope && g.phase === 'hunt' && !boarders.length && g.ropeT > 3) {
        // Head for the rope and hack at it.
        const endX = mx(g, g.bp.x0 + 30); // (the stern end, where the line is)
        c.face = endX < c.x ? -1 : 1;
        if (Math.abs(c.x - endX) > 5) c.x += Math.sign(endX - c.x) * Math.min(Math.abs(endX - c.x), G.CREW_SPEED * dt);
        else if ((c.cutT += dt) > G.CUT_TIME) {
          c.cutT = 0;
          snap('THEY CUT THE ROPE!');
        }
      } else if (c.role === 'guard' && g.mode === 'retreat' && g.atRetreat) {
        // Patching the hull: walk to a spot on the deck and hammer.
        if (c.patchX == null || (c.patchT -= dt) <= 0) {
          c.patchX = rand(g.bp.x0 + 150, g.bp.x1 - 150);
          c.patchT = rand(2, 4);
        }
        const d = c.patchX - c.x;
        c.face = d < 0 ? -1 : 1;
        c.x += Math.sign(d) * Math.min(Math.abs(d), G.CREW_SPEED * dt);
        c.hammer = Math.abs(d) < 8 ? 1 : 0;
      } else {
        c.hammer = 0;
        // Back to their post.
        const d = c.post - c.x;
        c.face = Math.abs(d) > 5 ? Math.sign(d) : c.role === 'gunner' ? -1 : c.face;
        c.x += Math.sign(d) * Math.min(Math.abs(d), G.CREW_SPEED * dt);
      }
      c.x = Math.max(g.bp.x0 + 20, Math.min(g.bp.x1 - 20, c.x));
      c.y = deckYAt(g, c.x); // (they step up and down between her decks)
    }
    // Crew shells hit her hull and gasbag.
    for (const sh of state.shells) {
      if (sh.life <= 0) continue;
      const sy = sh.y + state.ship.alt - g.dy;
      const sx = sh.x - g.dx;
      // A hit on a gun port (or turret, mortar, flak gun) wrecks it (not the hull).
      const k = g.ports.findIndex((pt, i) => {
        if (pt.dead) return false;
        const pp = portPos(g, i);
        return Math.hypot(sx - pp.x, sy - pp.y) < G.PORT_RADIUS;
      });
      if (k >= 0) {
        const pp = portPos(g, k);
        sh.life = 0;
        g.hit = 0.1;
        const pt = g.ports[k];
        pt.hp -= config.GUNS.DAMAGE;
        puff(sh.x, sh.y, '#ffcf40', 8);
        if (pt.hp <= 0) {
          pt.dead = true;
          S.portsDown++;
          puff(pp.x + g.dx, pp.y + g.dy - state.ship.alt, '#ff5a1f', 16);
          pop(state, pp.x + g.dx, pp.y - 50 + g.dy - state.ship.alt, 'kill', '#ffd23f', 1);
          const left = g.ports.filter((q) => !q.dead).length;
          if (left) warn('GUN PORT DOWN!', 2);
        }
        continue;
      }
      const inHull = sx > g.bp.x0 - 75 && sx < g.bp.x1 + 75 && sy > g.bp.hullTop && sy < g.bp.hullBot + 28;
      const inBag = g.bp.bags.some((b) => Math.hypot((sx - b.cx) / b.rx, (sy - b.cy) / b.ry) < 1);
      if (!inHull && !inBag) continue;
      sh.life = 0;
      g.hp -= config.GUNS.DAMAGE;
      g.hit = 0.15;
      if (inBag) g.gas = Math.max(0, g.gas - G.GAS_HIT); // holed gasbag: she sags
      if (Math.random() < G.ENGINE_HIT) {
        const e = g.eng[Math.floor(Math.random() * g.eng.length)];
        e.hp = Math.max(0, e.hp - G.ENGINE_DMG); // a hit rattles an engine
        puff(sh.x, sh.y, '#555', 3);
      }
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
    const c = g.crew.filter((q) => Math.abs(q.x - player.x) < range && Math.abs(q.y - player.y) < 60).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
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
      if (g.rope && inSwingRange(g) && Math.abs(player.x - landX(g)) < 110 && (player.gd || 0) === landSeg(g)) return { type: 'swing', label: 'Swing back!' };
      if (!g.charge && Math.abs(player.x - boilerX(g)) < 70 && (player.gd || 0) === boilerSeg(g)) return { type: 'sabotage', obj: g, hold: true, time: G.PLANT_TIME * (g.bp.special === 'armoured' ? GP.ARMOURED.PLANT_MUL : 1), label: g.bp.special === 'armoured' ? 'Plant charge (armoured boiler)!' : 'Plant charge!' };
      return null;
    }
    if (player.x > MAIN_X1 - 45) {
      if (!g.rope) return { type: 'hook', label: g.turn ? 'She is turning round!' : gap(g) <= G.HOOK_RANGE ? 'Fire hookshot!' : 'Too far to hook!' };
      if (inSwingRange(g)) return { type: 'swing', label: 'Swing across!' };
    }
    // Her grapple is on our bow: hack through the line (just behind the swing spot).
    if (g.phase === 'latch' && g.rope && player.x > MAIN_X1 - 175) return { type: 'cutline', obj: g.cutObj, hold: true, time: G.CUT_HOLD, label: 'Cut her grapple line!' };
    return null;
  };

  // Fire the grapple: it only catches while she's within range. Returns whether it caught.
  const fireHook = () => {
    const g = state.gunship;
    if (!g || g.rope || g.turn || gap(g) > G.HOOK_RANGE) return false;
    setRope(true);
    state.sfxQ && state.sfxQ.push(['swing']);
    return true;
  };

  const reset = () => {
    if (state.gunship) setRope(false);
    dropAll();
    state.gunship = null;
    state.paras.length = 0;
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

  // Calm: she breaks off unless crew are fighting aboard or hooked to her. True once she is gone or going.
  const retire = () => {
    const g = state.gunship;
    if (!g || g.phase === 'leaving' || g.phase === 'sinking') return true;
    if (g.rope || g.charge || aboardAny()) return false;
    leave('THE GUNSHIP BREAKS OFF!', 2);
    return true;
  };
  // Her landing surfaces for the air module (ship coordinates), one per deck (k = left to right); null when she isn't boardable.
  const surface = (k) => {
    const g = state.gunship;
    if (!g || g.phase === 'sinking' || g.phase === 'leaving') return null;
    return bpSurfaces(g)[k] || null;
  };
  return { update, settle, reset, retire, cutLine, interaction, fireHook, plant, hitCrew, swing, swingStep, walk, land, surface, deckAt: (p) => deckAt(state.gunship, p.x, p.y), inSwingRange: () => !!state.gunship && inSwingRange(state.gunship), inHookRange: () => !!state.gunship && gap(state.gunship) <= G.HOOK_RANGE, spawn: (opt) => !state.gunship && spawn(opt) };
}
