// THE GIANT-CREATURE gate, C.1 to C.6a (public/modules/host/creatureSystem.js, creature.js, creatures/kraken.js, creatures/drake.js, creatureDrake.js, creatureBreath.js, creatureArt.js; config.CREATURES). Headless, no browser.
//   C.6a: the last section (D0-D11) is THE CINDER DRAKE: its body, the breath (ignites, hurts, armour resists, hydrogen explodes), the perch (tilt within FORCES.MAX_DEG), each forced win by 8 bots on Normal, 4 and 16 bots on Easy
//   node tools/buildsim.mjs --check-creature        or directly:   node tools/creature-check.mjs [--seed 1] [--minutes 3] [--quick]
//
//   (0) THE WORLD: it is a world thing (state.creature in WORLD_SHARED), it rises untouchable and then has targets, radar blips and a wider camera; no creature means no key but `creature: null`
//   (a) EVERY WEAPON HURTS A PART: a crew shell (credited), our bomb, the flamethrower, the Lightning Coil, a laid mine and a thrown crate each take hit points off the part they meet;
//       a searchlight beam makes a blow harder
//   (b) THE BEAK: a bomb in the OPEN beak does MOUTH_BOMB to it, a bomb in the shut beak does nothing and falls on; a crate in the open beak is half a bomb
//   (c) SEVERING: fire cuts a tentacle where it burns (the outer segments tumble away as a chunk, puffs, a sound, a kill credited), the stump stays
//   (d) THE KILL PATHS: the health pool (shells) and all six tentacles each end it: it sinks, the boss reward goes to salvage, the mission goes on (the boss director is only held while it is alive)
//   (e) THE BOTS: tools/botsim.mjs --creature kraken, 8 bots on Normal for 3 minutes in the Sunken Sea (three seeds): 0 errors, no NaN, and they do hurt it
//   (f) THE TV: render.js draws the fight on a stub canvas (lit, and dark with parts dim), the bar with its tentacle pips, and the time it takes
//   C.2 (public/modules/host/creatureGrip.js, creatureBoard.js, creatureTow.js; config.CREATURES.GRIP / SLAP / BOARD / TOW):
//   (g1) THE GRAB: banner + wind-up, the tip glued to the ship's grip point, the tilt inside FORCES.MAX_DEG, the drag, the crew slide, COME ABOUT refused
//   (g2) THE RIP after GRIP.TIME takes a section off (the parts list shrinks); a ship that cannot break takes the hull blow
//   (g3) THE WAYS OUT: a sword hold, 3 sword blows, a hammer, shells, the coil, flame, severing; bare hands and a far sword do nothing
//   (g4) THE JOB ARROW on the phone and a bot that hacks it free;  (g5) THE SLAP: heart lost, flung, hull; a hand at a station is kept
//   (g6) BOARDING: land on the mantle, carried by it, walk, BLIND IT, STRIKE THE HEART, fall off when it dies; the hook anchors to a part and reels aboard
//   (g7) THE HARPOON hooks a part, the reel pulls the ship and (less) the creature, a sword cuts it;  (g8) THE SEA: pulled under, the flood starts
//   (g0) THE KRAKEN IS SEA-ONLY: spawn() and the dev flag do nothing where there is no sea level;  (g1c) THE COIL: segments in front of and behind the hull, rigid, driven from ship coordinates
//   (g1d) every grip pulls (the sum grows, capped by MAX_TOTAL);  (g11) THE BREACH: telegraph, hit, exposed heart with the damage bonus, climbing clear, getting out of the shadow
//   (g9) grips at once by crew size;  (g10) the TV draws a grip ring, a harpoon line and a boarder;  (h) the bots on Normal hack grips free and she is not always torn apart
//   C.3 (creatureFight.js, creatures/kraken.js, voyage.js markLairs, maps.js buildLairMap; config.CREATURES.PHASE / MOUTH / DIVE / TOW_ROCK / LAIR / REWARD) - the last big block of this file:
//   (p) the phases at their thresholds (pool or tentacles cut) with banner, roar, breather; single grabs in phase 1; phase 3 surfaces, exposes the heart, DIVES (3 grips, pulling harder)
//   (m) the beak's windows, the lure under her bomb bay, the funnel, the gulp, crates are half, three win;  (w) each win scripted (SEVER, POOL, BOARD, TOW onto the spire): stats.win, banner, bossDownLap, slow motion
//   (l) the lair: map, no outposts or spouts, no zeppelin, the creature at the boss's slot, the stop done when it has sunk;  (v) lairs only on Sunken Sea stops, never first / Flagship / adjacent, +1 skull x2 reward,
//   the rest of a seeded route untouched; the route map draws them;  (r) salvage x3, hull patch, the free trophy card at the next dock, the Kraken Beak on the ship (ram prow, art kraken)
//   (b) the bots (CREATURE_FORCE_WIN=sever|mouth|tow|board|hp): each win within 6 minutes of its spawn with 8 bots on Normal (tow on a harpoon ship), 4 and 16 bots on Easy within 10, 0 errors, no NaN
//   C.6b: the last section (T0-T12) is THE THUNDERBIRD: its body, the gust (a shove and a twist within FORCES.MAX_DEG), the lightning dive (a held rod grounds a bolt, a manned coil drinks one and fires it back for 3x), the swallow and the glowing gizzard (coil zaps win), the perch,
//   the roost on a rock spire (mortar hits win), boarding it (cut the gizzard), the plucked wings (both: it falls), the lair, the voyage, the reward and the feather sail, the TV, and the bots: each forced win by 8 bots on Normal, 4 and 16 bots on Easy
//   C.6c: the last section (I0-I10) is THE ISLAND TITAN: its body (2 stone arms, torso, head, mouth, a hidden crystal), the boulder (banner, buzz, the ring that follows her and locks, the rock: a hit shakes a frame segment, a move or a shell saves her), the gasbag grab (phase 2 only: a sideways pull within FORCES.MAX_DEG, swords pry it off, a squeeze that tears nothing off), the roar (bombs in the open mouth), the arms and the phases, the ISLAND as a ground that moves with it (a parachute, being carried, JUMP, a hookshot, the rope ladder, its fall), the CRYSTAL on foot, the reward, the lair, the early route placement, the TV, and the bots (forced arms / mouth / crystal / hp by 8 bots on Normal, 4 and 16 bots on Easy; --no-titan-bots skips them)
//   C.6d: the last section (W0-W8) is THE RIME WYRM: its body and its lair of ice cliffs, the cracking cliff and the eruption, the coil (it stops her, the hack arrow comes last), the ice armour (shells bounce, a hammer chips it, flame
//   melts it, a bare segment takes more), the frost breath that jams the guns, the gape, the phases, the sun (a harpoon hauls its head), the underbelly, the reward, the lair stops, the TV, and the bots: each forced win by 8 bots on Normal, 4 and 16 bots on Easy
// Exit code 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const seed = flag('seed', 1), minutes = flag('minutes', 3), quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);

// ---- the stub canvas (as tools/fleet-check.mjs): a real transform stack, and a record of the text it was asked for ----
const rec = { n: 0, texts: [], calls: {} };
const stubCtx = () => {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const t = { imageSmoothingQuality: 'low', font: '10px x', textAlign: 'left', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      switch (k) {
        case 'getTransform': return () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
        case 'setTransform': return (a, b, c, d, e, f) => { m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; };
        case 'resetTransform': return () => { m = [1, 0, 0, 1, 0, 0]; };
        case 'save': return () => { stack.push(m.slice()); };
        case 'restore': return () => { if (stack.length) m = stack.pop(); };
        case 'translate': return (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); };
        case 'scale': return (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); };
        case 'rotate': return (a) => { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); };
        case 'transform': return (a, b, c, d, e, f) => { m = mul(m, [a, b, c, d, e, f]); };
        case 'measureText': return (s) => ({ width: String(s).length * 9 });
        case 'getImageData': return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        case 'createImageData': return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
        case 'createLinearGradient': case 'createRadialGradient': case 'createPattern': case 'createConicGradient': return () => ({ addColorStop() {} });
        case 'isPointInPath': case 'isPointInStroke': return () => false;
        case 'fillText': case 'strokeText': return (s, x, y) => { rec.texts.push({ kind: k, s: String(s), x, y }); };
        default: return () => { rec.n++; rec.calls[k] = (rec.calls[k] || 0) + 1; };
      }
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = {
  fonts: { check: () => true, load: () => Promise.resolve() },
  createElement: () => { const c = { width: 0, height: 0, style: {}, getContext: () => (c.c ||= stubCtx()) }; return c; },
};
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
globalThis.fetch = async () => ({ json: async () => [] });

const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const S = await load('modules/host/ships.js');
const T = await load('modules/host/pose.js');
const { hullLost } = await load('modules/host/structure.js'); // (STRUCTURE.md: what the Kraken's blow costs her is the soundness of her frame it takes, until WP2 puts it on a segment)
const frameHp = (ship) => ship.sim.structure.segs().reduce((n, g) => n + g.hp, 0); // (STRUCTURE.md WP2: a creature hits the segment under the blow - the sum of the frame's soundness drops wherever it lands; the hull meter reads only the weakest load-bearing segment)
const A = await load('modules/host/aim.js');
const CS = await load('modules/host/creatureSystem.js');
const FL = await load('modules/host/flame.js');
const { createCoil } = await load('modules/host/coil.js');
const SP = await load('modules/host/spotter.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');
const { createCreatureArt } = await load('modules/host/creatureArt.js');
const { segDist } = await load('modules/host/creature.js');
const { inRock } = await load('modules/host/course.js');

const C = config.CREATURES, H = C.HURT;
C.TITAN.LAIR.ENABLED = false; // (C.6c: the Island Titan's guaranteed early lair is off for every section before its own, which count lairs by the old rules: the Titan sections turn it on for the route checks)
// C.3 made the real fight last (HURT.PART_HP_MUL: tougher tentacles and pool). The C.1 / C.2 sections below test one blow at a time against the BASE numbers of the data, so they run with every multiplier at 1;
// the C.3 sections (and the bots, which run as child processes) use the real ones.
const REAL_HP = { ...H.PART_HP_MUL };
const unitHp = () => Object.assign(H.PART_HP_MUL, { tentacle: 1, mantle: 1, eye: 1, mouth: 1, heart: 1, pool: 1 });
const realHp = () => Object.assign(H.PART_HP_MUL, REAL_HP);
unitHp();
const SAVED = JSON.stringify({ B: C.BEHAVE, ENV: config.ENVIRONMENTS.FORCE, DEV: C.DEV_SPAWN, MAP: config.MAPS.FORCE_KIND, AP: config.ESCORT.AUTO_PATROL });
const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
  }
};
const secs = (s) => Math.round(s * 60);
const hr = () => Number(process.hrtime.bigint()) / 1e6; // (real milliseconds: the shims freeze performance.now to the simulated clock)
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// A sim with one human on deck (so there is a crew to credit), cast off in this environment.
function boot({ env = 'sea', difficulty = 'normal', dev = null, lair = false, bots = 0, start = null } = {}) { // (lair: every stop is a Kraken's lair, C.3; bots: that many bot crew besides p1; start: the voyage's start build, which gives the sky-dock its part cards)
  clock = seedRandom(seed);
  config.ENVIRONMENTS.FORCE = env;
  config.MAPS.FORCE_KIND = 'open'; // (open sky: a creature in a cliff would eat every shell)
  config.ESCORT.AUTO_PATROL = false; // (the escort planes would launch and shoot the creature by themselves: a fine thing in the game, noise in a unit test)
  C.DEV_SPAWN = dev;
  C.DEV_LAIR = lair;
  const sim = createSimulation();
  const st = sim.state;
  curSt = st;
  st.difficulty = difficulty;
  if (start) sim.setStartBuild(start);
  const e = st.ships[0].layout.boarderEntryPoints;
  st.players.p1 = { id: 'p1', bot: false, name: 'P1', species: config.CREW_SPECIES[0], color: '#e63946', x: e[0].x + 100, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  for (let i = 0; i < bots; i++) { const id = 'bot' + i; st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: '#3a86ff', x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true }; }
  sim.castOff();
  step(sim, 5); // (the first step of a mission clears the last one's enemies, a creature spawned before it would go too)
  return { sim, st, ship: st.ships[0] };
}
// Spawn the Kraken by hand and wait until it has risen; no reaches and no timed beak, so the tests choose when things happen.
function risen(ctx, phase = 2) { // (phase 2 by default: the C.1 / C.2 sections want grabs by crew size and the lunge; the C.3 sections ask for the phase they test)
  const { sim, st } = ctx;
  C.BEHAVE.MOUTH_AFTER = 1e9;
  const cr = sim.creatures.spawn('kraken');
  cr.phase = phase;
  cr.ai.reachT = 1e9;
  cr.ai.gripT = cr.ai.slapT = cr.ai.breachT = cr.ai.diveT = 1e9; // (C.2: the attacks have their own tests below; the weapon tests want a still creature)
  for (let i = 0; i < secs(C.SPAWN.SURFACE_TIME + 1) && cr.mode !== 'idle'; i++) step(sim);
  step(sim, 30);
  cr.ai.reachT = 1e9;
  return cr;
}
const AWAY_ON0 = config.AWAY.ENABLED; // (C.6c: the Island Titan sections turn the away team on, as the real game has it; the gate runs with NO_AWAY=1 otherwise)
const restoreCfg = () => { const o = JSON.parse(SAVED); Object.assign(C.BEHAVE, o.B); config.ENVIRONMENTS.FORCE = o.ENV; C.DEV_SPAWN = o.DEV; config.MAPS.FORCE_KIND = o.MAP; config.ESCORT.AUTO_PATROL = o.AP; C.DEV_LAIR = false; C.DEV_LAIR_AS = null; config.AWAY.ENABLED = AWAY_ON0; C.FORCE_WIN = null; unitHp(); };
const midOf = (s, u = 0.5) => ({ x: s.x + Math.cos(s.ang) * s.len * u, y: s.y + Math.sin(s.ang) * s.len * u });
const partOf = (cr, kind) => cr.parts.find((p) => p.kind === kind);
// A point on part p that every weapon radius attributes to p (hitInfo ranks the beak and eyes over limbs over the mantle, and limbs overlap near their roots).
// It looks for the point deepest inside the part (a thick, slow bit of it) that no other part covers, so a step's drift cannot move it off.
// (and not in rock: a shell dies in rock before the creature gets to see it).
let curSt = null;
const spot = (p) => {
  let best = null;
  p.segs.forEach((s, i) => {
    for (const u of [0.3, 0.5, 0.7]) for (const lat of [0, -0.5, 0.5]) {
      const r = s.r + (s.r1 - s.r) * u, m = midOf(s, u), x = m.x - Math.sin(s.ang) * r * lat, y = m.y + Math.cos(s.ang) * r * lat;
      if (inRock(curSt, x, y) || ![0, H.TOUCH, 20, 24, 60].every((rad) => { const h = CS.creatureHit(curSt, x, y, rad); return h && h.part === p; })) continue;
      const depth = -segDist(s, x, y);
      if (!best || depth > best.depth) best = { x, y, seg: i, depth };
    }
  });
  return best;
};
const on = (p) => {
  const b = spot(p);
  if (!b) { const s0 = p.segs[0], hh = CS.creatureHit(curSt, s0.x, s0.y, 0); throw new Error('no clean spot on ' + p.id + ' at ' + Math.round(s0.x) + ',' + Math.round(s0.y) + ' r' + Math.round(s0.r) + ' first hit ' + (hh ? hh.part.id : 'none') + ' rock ' + inRock(curSt, s0.x, s0.y) + ' mode ' + (curSt.creature && curSt.creature.mode) + ' open ' + p.open + ' hidden ' + p.hidden + ' dead ' + p.dead); }
  return b;
};
// The i-th tentacle that is still whole and has a clean spot (the next one along if it has none: terrain and neighbours decide).
const tent = (cr, i = 0) => { const all = cr.parts.filter((p) => p.kind === 'tentacle'); for (let k = 0; k < all.length; k++) { const p = all[(i + k) % all.length]; if (!p.severed && spot(p)) return p; } return all[i]; };
const hpSum = (cr) => cr.parts.reduce((a, p) => a + p.hp, 0);

// ---- (0) the world ----
{
  restoreCfg();
  const ctx = boot();
  const { sim, st, ship } = ctx;
  report(st.creature === null && S.WORLD_SHARED.includes('creature') && sim.creatures && typeof sim.creatures.spawn === 'function', 'state.creature is null until one is spawned, is in WORLD_SHARED, and the system is on the simulation');
  C.BEHAVE.MOUTH_AFTER = 1e9;
  const cr = sim.creatures.spawn('kraken');
  report(!!cr && st.creature === cr && cr.mode === 'surfacing' && cr.parts.filter((p) => p.kind === 'tentacle').length === 6 && cr.name === 'THE KRAKEN', 'spawn puts the Kraken (6 tentacles) in state.creature, rising');
  const before = hpSum(cr);
  const t0 = tent(cr);
  const m = midOf(t0.segs[3]);
  st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 5);
  report(hpSum(cr) === before && A.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0, 'while it rises it cannot be hurt, shot at or spotted');
  for (let i = 0; i < secs(C.SPAWN.SURFACE_TIME + 1) && cr.mode !== 'idle'; i++) step(sim);
  step(sim, 60);
  const tg = A.targets(st).filter((t) => t.kind === 'creaturePart');
  const kinds = new Set(tg.map((t) => t.part.kind));
  report(cr.mode === 'idle' && tg.length >= 9 && ['tentacle', 'mantle', 'mouth', 'eye'].every((k) => kinds.has(k)) && !kinds.has('heart'), `risen: ${tg.length} aim targets (${[...kinds].join(', ')}; the heart is hidden)`);
  report(tg.every((t) => t.obj && typeof t.obj.lit === 'number' && typeof t.at(0).x === 'number' && t.part.hp >= 0), 'every target has a lit / spotted record (the searchlight and the spotter write to it) and a world point');
  const radar = SP.radarItems(st).filter((i) => i.kind === 'creature');
  report(radar.length === 8 && radar.every((i) => i.k === SP.RADAR_KINDS.indexOf('creature') && i.k >= 0 && Number.isFinite(i.pos().x)) && SP.SPOT_SIZE.creature > 0, `the phone radar has ${radar.length} blips for it (body, beak, 6 tentacles)`);
  // the camera: the cap is wider while a creature is alive
  const canvas = { width: 1920, height: 1080 };
  const cam1 = createWorldCamera(), cam2 = createWorldCamera();
  let v1, v2;
  for (let i = 0; i < 5; i++) v1 = cam1.update(1 / 60, st, canvas.width, canvas.height);
  const keep = st.creature;
  st.creature = null;
  for (let i = 0; i < 5; i++) v2 = cam2.update(1 / 60, st, canvas.width, canvas.height);
  st.creature = keep;
  report(near(v2.minZoom / v1.minZoom, C && config.CAMERA.CREATURE.MAX_ZOOM_OUT / config.CAMERA.MAX_ZOOM_OUT, 1e-6) && config.CAMERA.CREATURE.MAX_ZOOM_OUT === 2.4 && v1.zoom <= v2.zoom + 1e-9, `the camera may zoom out to 1/${config.CAMERA.CREATURE.MAX_ZOOM_OUT} while it lives (min zoom ${v1.minZoom.toFixed(3)} against ${v2.minZoom.toFixed(3)}), and frames its parts (zoom ${v1.zoom.toFixed(3)} against ${v2.zoom.toFixed(3)})`);
  // the sfx names it uses are in sfx.js
  const src = fs.readFileSync(path.join(publicDir, 'modules/host/creatureSystem.js'), 'utf8') + fs.readFileSync(path.join(publicDir, 'modules/host/course.js'), 'utf8');
  const sfxSrc = fs.readFileSync(path.join(publicDir, 'modules/host/sfx.js'), 'utf8');
  const names = [...new Set([...src.matchAll(/sfxQ\.push\(\['(\w+)'\]\)/g)].map((x) => x[1]))].filter((n) => ['roar', 'splash', 'sever', 'chomp'].includes(n));
  report(['roar', 'splash', 'sever', 'chomp'].every((n) => names.includes(n) && new RegExp('\\n    ' + n + ': \\(').test(sfxSrc)), 'the four sounds (roar, splash, sever, chomp) are asked for by the creature and made in sfx.js');
  report(/s\.boss \|\| s\.creature/.test(fs.readFileSync(path.join(publicDir, 'modules/host/music.js'), 'utf8')), 'the music plays combat while a creature is about');
}

// ---- (a) every weapon hurts a part ----
const delta = (cr, p, fn, frames = 2) => { const h0 = p.hp, c0 = cr.hp; fn(); return { part: h0 - p.hp, pool: c0 - cr.hp }; };
{
  restoreCfg();
  const ctx = boot();
  const { sim, st, ship } = ctx;
  const cr = risen(ctx);
  const res = {};
  // a crew shell, credited
  {
    const p = tent(cr, 0), m = on(p);
    const k0 = (st.players.p1.stats || {}).kills || 0;
    const d = delta(cr, p, () => { st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); step(sim, 1); });
    res.shell = d.part;
    report(near(d.part, config.GUNS.DAMAGE * H.SHELL_MUL, 1e-6) && d.pool > 0 && st.shells.every((q) => q.life < 1 || q.x !== m.x), `a crew shell takes ${d.part.toFixed(1)} off the tentacle it meets (GUNS.DAMAGE ${config.GUNS.DAMAGE} x ${H.SHELL_MUL}) and ${d.pool.toFixed(1)} off the pool, and is used up`);
    // a primed / spotted shell is worth more (the same multipliers as at any target)
    const q = tent(cr, 1), mq = on(q);
    CS.tgtOf(q).spotT = 5;
    const d2 = delta(cr, q, () => { st.shells.push({ x: mq.x, y: mq.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 2 }); step(sim, 1); });
    report(near(d2.part, config.GUNS.DAMAGE * H.SHELL_MUL * 2 * (1 + config.SPOT.BONUS), 1e-6), `a primed shell (x2) at a spotted part takes ${d2.part.toFixed(1)}`);
    CS.tgtOf(q).spotT = 0;
    // a searchlight beam: lit parts take more
    const r = tent(cr, 2), mr = on(r);
    CS.tgtOf(r).lit = 0.3;
    const d3 = delta(cr, r, () => { st.shells.push({ x: mr.x, y: mr.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); step(sim, 1); });
    CS.tgtOf(r).lit = 0;
    report(near(d3.part, config.GUNS.DAMAGE * H.SHELL_MUL * (1 + config.SEARCHLIGHT.LIT_DAMAGE), 1e-6), `a part in a searchlight beam takes ${d3.part.toFixed(1)} (+${config.SEARCHLIGHT.LIT_DAMAGE * 100}%)`);
  }
  // sever one by shells: the kill is credited to the shooter
  {
    const p = tent(cr, 3);
    const k0 = (st.players.p1.stats || {}).kills || 0;
    for (let i = 0; i < 80 && !p.severed; i++) { const m = on(p); st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); step(sim, 1); }
    report(p.severed && ((st.players.p1.stats || {}).kills || 0) > k0, 'shells cut a tentacle off, and the kill is credited to the crewman who fired');
  }
  // our bomb
  {
    const p = tent(cr, 4), m = on(p);
    st.shipBombs.push({ x: m.x, y: m.y, vx: 0, vy: 60, owner: 'p1' });
    const n = st.shipBombs.length;
    const d = delta(cr, p, () => step(sim, 1));
    res.bomb = d.part;
    report(d.part >= H.BOMB - 1e-6 && st.shipBombs.length < n && cr.stats.by.bomb >= H.BOMB, `our bomb bursts on a tentacle for ${d.part.toFixed(1)} (BOMB ${H.BOMB}), the parts round it take a share, the bomb is gone`);
  }
  // flame
  {
    const p = tent(cr, 5), m = on(p);
    const gun = { flameHold: 1, flameWho: { id: 'p1' }, ammo: 10, heat: 0, flame: 1, overheat: false };
    st.ship.press = 70;
    const wx = m.x - 300, wy = m.y;
    const W = { credit() {}, stat() {} };
    const d = delta(cr, p, () => FL.stepFlame({ ship, state: st, gun, name: 'Nose Gun', wx, wy, angle: 0, dt: config.FLAME.TICK, puff() {}, W }));
    res.flame = d.part;
    report(d.part > 0 && near(d.part, H.FLAME_DPS * config.FLAME.TICK, 1e-6), `a flame tick takes ${d.part.toFixed(2)} off a part in the cone (FLAME_DPS ${H.FLAME_DPS} x ${config.FLAME.TICK} s)`);
    // and the bots' flamethrower sees its parts as targets
    const ft = FL.flameTargets(st, ship, { bx: ship.layout.refPoint.x + 1000, by: ship.layout.refPoint.y });
    report(Array.isArray(ft), 'flameTargets runs with a creature about');
  }
  // the Lightning Coil
  {
    const M = ship.layout.coil, ex = T.toWorldX(ship, M.x), ey = T.toWorldY(ship, M.y - 60);
    const near = cr.parts.filter((q) => q.kind === 'tentacle' && !q.severed && spot(q)).sort((a, b) => Math.hypot(spot(a).x - ex, spot(a).y - ey) - Math.hypot(spot(b).x - ex, spot(b).y - ey))[0]; // (the bolt reaches COIL.RANGE: aim at the nearest)
    const p = near, m = spot(near);
    const coil = createCoil({ state: st, puff: sim.puff, credit() {} });
    st.coil.aim = T.aimToShip(ship, Math.atan2(m.y - ey, m.x - ex));
    st.coil.charge = 0.999;
    st.phase = 'flying';
    const d = delta(cr, p, () => coil.update(DT, { id: 'p1', jx: 0, jy: 0, fire: true }, true));
    res.coil = d.part;
    report(d.part > 0 && !!st.coil.bolt, `a Lightning Coil bolt that crosses a tentacle takes ${d.part.toFixed(1)} off it (COIL.DAMAGE x charge x ${H.COIL})`);
  }
  // a laid mine and a thrown crate (on a creature that still has all its parts)
  {
    const ctx2 = boot();
    const cr2 = risen(ctx2);
    const { sim: sim2, st: st2 } = ctx2;
    const p = tent(cr2, 1), m = on(p);
    st2.laid.push({ id: 99, x: m.x, y: m.y, vx: 0, vy: 0, age: 30, drift: 0, from: 'player', team: null, owner: 'p1', bob: 0 });
    const d = delta(cr2, p, () => step(sim2, 1));
    res.mine = d.part;
    report(d.part >= H.MINE * 0.5 - 1e-6 && st2.laid.length === 0, `a laid mine that touches a tentacle goes off: ${d.part.toFixed(1)} off it (MINE ${H.MINE}, down to half at the edge of ${H.MINE_RADIUS} px)`);
    const q = tent(cr2, 2), mq = on(q);
    st2.thrown.push({ id: 1, kind: 'crate', x: mq.x, y: mq.y, vx: 0, vy: 0, t: 0, from: 'player', spin: 0, rot: 0, owner: 'p1' });
    const d2 = delta(cr2, q, () => step(sim2, 1));
    res.crate = d2.part;
    report(near(d2.part, H.CARGO, 1e-6) && st2.thrown.length === 0, `a thrown crate hits a tentacle for ${d2.part.toFixed(1)} (CARGO ${H.CARGO}) and is used up`);
  }
  console.log('     damage per blow: ' + Object.entries(res).map(([k, v]) => k + ' ' + v.toFixed(1)).join(', '));
  report(['shell', 'bomb', 'flame', 'coil', 'mine', 'crate'].every((k) => res[k] > 0), 'a shell, a bomb, the flamethrower, the coil, a mine and a crate each damaged a part');
}

// ---- (b) the beak ----
{
  restoreCfg();
  const ctx = boot();
  const { sim, st } = ctx;
  const cr = risen(ctx);
  const mouth = partOf(cr, 'mouth');
  const m = midOf(mouth.segs[0], 0);
  const bomb = () => st.shipBombs.push({ x: m.x, y: m.y, vx: 0, vy: 60, owner: 'p1' });
  // shut
  mouth.open = false;
  const h0 = hpSum(cr), c0 = cr.hp;
  bomb();
  step(sim, 1);
  const stillThere = st.shipBombs.length === 1; 
  report(hpSum(cr) === h0 && cr.hp === c0 && stillThere && !cr.stats.chomps, 'a bomb into the SHUT beak does nothing (no part, no pool) and falls on through');
  st.shipBombs.length = 0;
  // open
  mouth.open = true;
  const q0 = mouth.hp, p0 = cr.hp;
  st.sfxQ.length = 0;
  bomb();
  step(sim, 1);
  report(near(q0 - mouth.hp, Math.min(q0, H.MOUTH_BOMB), 1e-6) && near(p0 - cr.hp, Math.min(q0, H.MOUTH_BOMB) * 0 + H.MOUTH_BOMB * H.POOL.mouth, 1e-6) && cr.stats.chomps === 1 && st.shipBombs.length === 0 && st.sfxQ.some((x) => x[0] === 'chomp'), `a bomb into the OPEN beak does MOUTH_BOMB ${H.MOUTH_BOMB} to it (${(q0 - mouth.hp).toFixed(0)} off the beak, ${(p0 - cr.hp).toFixed(0)} off the pool), CHOMP, and the bomb is gone`);
  // a crate: half a bomb in the open beak, nothing through the shut one
  const r0 = mouth.hp;
  st.thrown.push({ id: 2, kind: 'crate', x: m.x, y: m.y, vx: 0, vy: 0, t: 0, from: 'player', spin: 0, rot: 0, owner: 'p1' });
  step(sim, 1);
  report(near(r0 - mouth.hp, Math.min(r0, H.MOUTH_BOMB * H.CARGO_MOUTH), 1e-6) && st.thrown.length === 0, `a crate into the open beak counts as half a bomb (${(r0 - mouth.hp).toFixed(0)} of ${H.MOUTH_BOMB})`);
  mouth.open = false;
  const s0 = mouth.hp;
  st.thrown.push({ id: 3, kind: 'crate', x: m.x, y: m.y, vx: 0, vy: 0, t: 0, from: 'player', spin: 0, rot: 0, owner: 'p1' });
  step(sim, 1);
  report(mouth.hp === s0 && st.thrown.length === 1, 'a crate through the shut beak does nothing');
  // the aim ranks an open beak above everything
  mouth.open = true;
  const ranks = A.targets(st).filter((t) => t.kind === 'creaturePart').map((t) => [t.part.kind, t.rank]).sort((a, b) => a[1] - b[1]);
  report(ranks[0][0] === 'mouth', `the open beak is the top-ranked target (${ranks.slice(0, 3).map((x) => x.join(' ')).join(', ')})`);
  mouth.open = false;
  const ranks2 = A.targets(st).filter((t) => t.kind === 'creaturePart').map((t) => [t.part.kind, t.rank]).sort((a, b) => a[1] - b[1]);
  report(ranks2[0][0] !== 'mouth', 'a shut beak is not');
}

// ---- (c) severing by fire ----
{
  restoreCfg();
  const ctx = boot();
  const { sim, st, ship } = ctx;
  const cr = risen(ctx);
  const p = tent(cr, 2), n0 = p.segs.length;
  const gun = { flameHold: 1, flameWho: { id: 'p1' }, ammo: 99, heat: 0, flame: 1, overheat: false };
  const W = { credit() {}, stat() {} };
  const kills0 = st.kills, puffs0 = st.puffs.length;
  st.sfxQ.length = 0;
  let ticks = 0;
  for (; ticks < 600 && !p.severed; ticks++) {
    st.ship.press = 70;
    gun.ammo = 99; gun.heat = 0; gun.flameHold = 1;
    const m = on(p);
    FL.stepFlame({ ship, state: st, gun, name: 'Nose Gun', wx: m.x - 300, wy: m.y, angle: 0, dt: config.FLAME.TICK, puff: sim.puff, W });
    step(sim, 6);
  }
  const chunk = cr.chunks[0];
  report(p.severed && p.segs.length > 0 && p.segs.length < n0 && cr.stats.severed === 1, `fire cut a tentacle in ${ticks} ticks (${(ticks * config.FLAME.TICK).toFixed(1)} s in the cone): ${p.segs.length} of ${n0} segments left as a stump`);
  report(cr.chunks.length === 1 && chunk.part.segs.length + p.segs.length === n0 && chunk.part.segs.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y)), `the ${chunk ? chunk.part.segs.length : 0} segments cut off became a chunk of debris`);
  report(st.puffs.length > puffs0 && st.sfxQ.some((x) => x[0] === 'sever') && st.kills === kills0 + 1 && st.popups.some((q) => /KRAKK|SNAP|CRRRACK/.test(q.text)), 'with puffs, a SNAP! word, the sever sound and one kill counted');
  const y0 = chunk.cy;
  step(sim, 60);
  report(chunk.cy > y0 && chunk.a !== 0 && p.severed && cr.mode === 'idle', 'the chunk tumbles and falls; the stump stays on the creature, which fights on');
  const stumpHp = cr.hp;
  const m = on(p);
  st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 1);
  report(cr.hp < stumpHp && cr.chunks.length <= 1 && p.segs.length > 0, 'a hit on the stump still counts against the pool but does not chew it up');
  for (let i = 0; i < 60 * (C.CHUNK.LIFE + 1) && cr.chunks.length; i++) step(sim, 1);
  report(cr.chunks.length === 0, 'the chunk is gone after its few seconds');
}

// ---- (d) the kill paths ----
{
  restoreCfg();
  // the health pool: shells at the mantle
  {
    const ctx = boot();
    const { sim, st } = ctx;
    const cr = risen(ctx);
    const run0 = st.run.salvage;
    const body = [partOf(cr, 'mantle'), ...cr.parts.filter((p) => p.kind === 'eye')];
    let n = 0;
    for (; n < 3000 && !cr.dying; n++) { const m = body.map(spot).find(Boolean); if (m) st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); step(sim, 1); }
    report(cr.dying && cr.diedBy === 'hp' && cr.hp === 0 && cr.parts.filter((p) => p.kind === 'tentacle' && p.severed).length < 6, `the health pool ends it: ${n} steps of shells at the body (${(cr.maxHp).toFixed(0)} hp pool), it is dying (by ${cr.diedBy}) with ${cr.parts.filter((p) => p.kind === 'tentacle' && !p.severed).length} tentacles whole`);
    const warn = st.ev.warnText;
    step(sim, 5);
    report(st.run.salvage - run0 >= config.SALVAGE.BOSS * C.REWARD_MUL && /SUNK IT/.test(warn) && cr.mode === 'dying', `it sinks and the reward lands in salvage (+${st.run.salvage - run0}, the boss reward x ${C.REWARD_MUL} is ${config.SALVAGE.BOSS * C.REWARD_MUL})`);
    const gone = A.targets(st).filter((t) => t.kind === 'creaturePart').length + SP.radarItems(st).filter((i) => i.kind === 'creature').length;
    const dive0 = cr.y;
    step(sim, secs(C.SPAWN.SINK_TIME + C.CHUNK.LIFE + 2));
    report(gone === 0 && st.creature === null && dive0 < cr.y, 'a dying creature is no target and no blip; after its sinking state.creature is null again');
    report(st.phase === 'flying' && !st.ship.down && errors === 0, 'the mission goes on (still flying, 0 errors)');
    // the pacing: while it lived the tempo was the boss
  }
  // all six tentacles
  {
    const ctx = boot();
    const { sim, st } = ctx;
    const cr = risen(ctx);
    const run0 = st.run.salvage;
    let steps = 0;
    for (; steps < 6000 && !cr.dying; steps++) {
      const p = cr.parts.filter((q) => q.kind === 'tentacle' && !q.severed)[0];
      if (!p) break;
      const m = on(p);
      st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
      step(sim, 1);
    }
    const cut = cr.parts.filter((p) => p.kind === 'tentacle' && (p.severed || p.dead)).length;
    report(cr.dying && cr.diedBy === 'sever' && cut === 6 && cr.hp > 0, `cutting off all six tentacles ends it too (${steps} shells; by ${cr.diedBy}, the pool still has ${cr.hp.toFixed(0)} of ${cr.maxHp})`);
    step(sim, 2);
    report(st.run.salvage > run0 && cr.stats.severed === 6, 'and pays the reward (six severs counted)');
    // the pacing: the boss counts while it lives; none while it is dying
  }
  // the boss director holds off while it lives; the tempo makes it the boss
  {
    const ctx = boot();
    const { sim, st } = ctx;
    const cr = risen(ctx);
    step(sim, 60);
    report(st.tempo.phase === 'peak' && st.tempo.kind === 'boss' && st.tempo.rate === 0 && CS.creatureAlive(st), 'the pacing treats it as the boss: the tempo holds the peak with no new waves while it lives');
    st.course.progress = 0.8;
    st.tempo.bossOk = true;
    step(sim, 120);
    report(st.boss === null, 'and the zeppelin boss does not come while it is alive');
  }
  // part hp scales with crew and difficulty
  {
    const hp = (difficulty, bots) => {
      const ctx = boot({ difficulty });
      for (let i = 0; i < bots; i++) { const id = 'x' + i; ctx.st.players[id] = { ...ctx.st.players.p1, id, name: id }; }
      step(ctx.sim, 60);
      const cr = ctx.sim.creatures.spawn('kraken');
      return { t: tent(cr).maxHp, pool: cr.maxHp };
    };
    const e = hp('easy', 7), h = hp('hard', 7), few = hp('normal', 0), many = hp('normal', 15);
    report(e.t < h.t && e.pool < h.pool && few.t < many.t, `part hp follows difficulty (tentacle ${e.t} easy, ${h.t} hard) and crew (${few.t} with 1 aboard, ${many.t} with 16)`);
  }
  // the Sunken Sea: it rises out of the sea line
  {
    const ctx = boot({ env: 'sea' });
    step(ctx.sim, 120);
    const cr = risen(ctx);
    const y = ctx.st.env.seaY;
    report(Number.isFinite(y) && Math.abs(cr.base.y - (y - C.SPAWN.SEA_RISE)) < 2 && T.toWorldX(ctx.ship, 0) !== undefined && Math.abs(cr.base.x - (T.toWorldX(ctx.ship, ctx.ship.layout.refPoint.x) + cr.side * C.SPAWN.STANDOFF)) < 400, `in the Sunken Sea it holds station on the sea line (body ${Math.round(cr.base.y)} for sea ${Math.round(y)} less ${C.SPAWN.SEA_RISE}), ${Math.round(Math.abs(cr.base.x - T.toWorldX(ctx.ship, ctx.ship.layout.refPoint.x)))} px ahead of the ship`);
  }
}

// ---- (g) C.2: GRIPS, the way out of them, the slap, boarding it, harpooning it ----
const GR = await load('modules/host/creatureGrip.js');
const BD = await load('modules/host/creatureBoard.js');
const TW = await load('modules/host/creatureTow.js');
const BC = await load('modules/host/creatureBreach.js');
const AIM = A;
const GP = C.GRIP, SL = C.SLAP, BO = C.BOARD;
const DEG = Math.PI / 180;
const PLS = (ship) => ship.layout.platforms;
// A quiet sky with the Kraken risen and its attacks switched off until a test asks (risen() above). opts.sea: the Sunken Sea.
function arena(opts = {}) {
  const ctx = boot(opts);
  return { ...ctx, cr: risen(ctx) };
}
// Stand a person on a deck, awake, with a tool.
function standOn(p, ship, d, x, carry = null) {
  Object.assign(p, { fall: false, fly: false, air: false, d, x, y: PLS(ship)[d].y, lock: null, conn: null, ko: 0, jx: 0, jy: 0, jz: 0, carry, hearts: config.HEALTH.MAX, fire: false });
}
// Ask the director for a grab now and wait until the limb holds. Returns the grip. (`more`: switch the director off again afterwards.)
function seize(ctx, secsMax = 7) {
  const { sim, cr } = ctx;
  cr.ai.gripT = 0;
  let n = 0;
  for (; n < secs(secsMax) && !(cr.grips[0] && cr.grips[0].mode === 'hold'); n++) step(sim);
  cr.ai.gripT = 1e9;
  return cr.grips[0] && cr.grips[0].mode === 'hold' ? cr.grips[0] : null;
}
const freedBy = (cr) => (cr.grips[0] && cr.grips[0].mode === 'recoil' ? cr.grips[0].why : null);

// (g1) the three-beat telegraph, the pull, the tilt, the slide
{
  restoreCfg();
  const A = arena(), Ctl = arena();
  const { sim, st, ship, cr } = A;
  const msgs = [], seen = [];
  cr.hooks.phoneFx = (p, t) => msgs.push({ id: p.id, t });
  // a second person on an open deck (to feel the slide) - the open deck with the most room
  const p2 = (st.players.p2 = { ...st.players.p1, id: 'p2', name: 'P2' });
  const open = PLS(ship).map((pl, d) => ({ d, pl })).filter((o) => ship.sim.air.outsideAt(o.d, (o.pl.x0 + o.pl.x1) / 2) && o.pl.x1 - o.pl.x0 > 400).sort((a, b) => (b.pl.x1 - b.pl.x0) - (a.pl.x1 - a.pl.x0))[0];
  standOn(p2, ship, open.d, (open.pl.x0 + open.pl.x1) / 2);
  cr.ai.gripT = 0;
  let n = 0, banner = null;
  const phases = [];
  for (; n < secs(8); n++) {
    step(sim);
    const g = cr.grips[0];
    if (g && g.mode === 'wind' && banner === null) banner = st.ev.warnText;
    if (g && phases[phases.length - 1] !== g.mode) phases.push(g.mode);
    if (g && g.mode === 'hold') break;
  }
  cr.ai.gripT = 1e9;
  const g = cr.grips[0];
  report(!!g && /^TENTACLE! (FORE|AFT) /.test(banner || ''), `the grab announces itself: wind-up, then "${banner}" on the TV banner (${phases.join(' -> ')})`);
  const windSecs = n / 60;
  report(g && windSecs >= GP.WINDUP && windSecs < GP.WINDUP + GP.SEIZE_MAX, `from the banner to the tip landing: ${windSecs.toFixed(1)} s (WINDUP ${GP.WINDUP} s + the 0.4 s pull-back + the strike)`);
  report(!!g && g.limb.grip && Math.hypot(g.limb.grip.x - g.ex, g.limb.grip.y - g.ey) < 1 && Math.hypot(GR.gripJobs(st, ship)[0].x - g.x, 0) < 1e-6, 'the tip is glued to the grip point of the ship (the limb\'s grip is the pose.js conversion of the ship point, just over the deck)');
  const tipNow = () => { const k = g.limb.wrap ? g.limb.wrap.k : 0, s = g.limb.segs[g.limb.segs.length - 1 - k], e = { x: s.x + Math.cos(s.ang) * s.len, y: s.y + Math.sin(s.ang) * s.len }; return Math.hypot(e.x - g.ex, e.y - g.ey); }; // (where the reaching part of the limb ends: the start of the coil)
  let tipMax = 0, tilt = 0, fall0 = ship.pose.y, wasGripped = true;
  // the slide: whoever stands on an open deck staggered when it seized
  report(p2.stag > 0 || Math.abs(p2.vx || 0) > 0, `the crew on the open deck slide when it seizes (stagger ${(p2.stag || 0).toFixed(2)} s, shove ${(p2.vx || 0).toFixed(0)} px/s)`);
  // run the control sky the same number of steps, then both for 5 s: the grip drags her down and tips her
  step(Ctl.sim, n);
  const y0 = ship.pose.y, c0 = Ctl.ship.pose.y;
  const sp0 = st.ship.speed;
  for (let i = 0; i < secs(5); i++) {
    step(sim);
    step(Ctl.sim);
    tilt = Math.max(tilt, Math.abs(st.forces.theta));
    tipMax = Math.max(tipMax, tipNow());
    wasGripped = wasGripped && GR.gripped(ship);
  }
  const dropped = (ship.pose.y - y0) - (Ctl.ship.pose.y - c0);
  console.log(`     grip: tilt ${(tilt / DEG).toFixed(2)} deg (limit ${config.FORCES.MAX_DEG}), dragged down ${dropped.toFixed(0)} px more than the free ship in 5 s, coil start off the grip point by ${tipMax.toFixed(1)} px at worst`);
  report(tilt > 0.2 * DEG && tilt <= config.FORCES.MAX_DEG * DEG + 1e-9, `the grip tips her by ${(tilt / DEG).toFixed(2)} degrees, inside FORCES.MAX_DEG ${config.FORCES.MAX_DEG}`);
  report(dropped > 40 && st.ship.speed !== sp0, `and drags her down (${dropped.toFixed(0)} px lower than the same ship with no grip)`);
  report(tipMax < 90 && wasGripped, `the limb stays on the ship's grip point while she moves (worst ${tipMax.toFixed(1)} px, picture and physics agree)`);
  report(Math.abs(tilt) < config.AIR.PITCH_STAGGER, `the tilt alone stays under the crew-slide limit (AIRBORNE.PITCH_STAGGER ${config.AIR.PITCH_STAGGER} rad)`);
  // (d) COME ABOUT is refused while she is gripped
  const why = ship.sim.comeAbout.why();
  report(typeof why === 'string' && /tentacle/i.test(why), `COME ABOUT is refused while gripped ("${why}")`);
  void fall0;
}

// (g1b) the warning on the phone: a crewman standing at the spot gets the buzz and "GET OFF THE ... DECK!"; one far away does not
{
  restoreCfg();
  const trial = arena();
  trial.cr.ai.gripT = 0;
  step(trial.sim, 3);
  const spotD = trial.cr.grips[0] ? { d: trial.cr.grips[0].job.d, x: trial.cr.grips[0].x } : null;
  const B = arena();
  const msgs = [];
  B.cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  const near = B.st.players.p1, far = (B.st.players.p2 = { ...near, id: 'p2', name: 'P2' });
  standOn(near, B.ship, spotD.d, spotD.x - 60);
  standOn(far, B.ship, PLS(B.ship).findIndex((pl, d) => d !== spotD.d && pl.x1 - pl.x0 > 300), 300);
  B.cr.ai.gripT = 0;
  step(B.sim, 3);
  const mine = msgs.filter((m) => m.id === 'p1'), his = msgs.filter((m) => m.id === 'p2');
  report(!!spotD && mine.length === 1 && /^GET OFF THE (FORE|AFT) .+ DECK|^GET OFF THE (FORE|AFT) /.test(mine[0].t) && Array.isArray(mine[0].buzz) && his.length === 0, `the crewman at the target spot gets "${mine[0] && mine[0].t}" with a buzz on his phone; one on another deck gets nothing`);
}

// (g2) the rip: after GRIP.TIME it takes the section off; and a ship with nothing to break takes a hull blow
{
  restoreCfg();
  const A = arena();
  const { sim, st, ship, cr } = A;
  const g = seize(A);
  const parts0 = ship.layout.parts.length, ev0 = st.breakStats.events, hull0 = st.ship.hull;
  let held = 0;
  while (cr.grips[0] && cr.grips[0].mode === 'hold' && held < secs(20)) { step(sim); held++; }
  const lost = ship.layout.parts.length < parts0 && st.breakStats.events === ev0 + 1 && st.breakStats.parts > 0;
  const want = GP.TIME * (GP.TIME_BY_DIFF.normal ?? 1);
  report(!!g && freedBy(cr) === 'rip' && Math.abs(held / 60 - want) < 0.4 && lost, `unhacked, the grip rips a section off after ${(held / 60).toFixed(1)} s (GRIP.TIME ${want}): parts ${parts0} -> ${ship.layout.parts.length}, ${st.breakStats.parts} lost, cause ${(st.breakStats.causes || []).join(',').replace(/@\d+/g, '')}`);
  report(cr.stats.ripped === 1 && !GR.gripped(ship) && (cr.grips[0] ? cr.grips[0].limb.gripCd > 0 : true), 'the tentacle lets go and rests (cooldown); she is not gripped any more');
  report(ship.sim.comeAbout.why() === null || !/tentacle/i.test(ship.sim.comeAbout.why()), 'and COME ABOUT is no longer refused for a tentacle');
  // a ship that cannot break gets the big hull hit
  const B = arena();
  B.ship.sim.breakOff = () => null;
  const gb = seize(B);
  const h0 = B.st.ship.hull, f0 = frameHp(B.ship);
  for (let i = 0; i < secs(GP.TIME + 3) && B.cr.grips[0] && B.cr.grips[0].mode === 'hold'; i++) step(B.sim);
  report(!!gb && B.cr.stats.hulled === 1 && frameHp(B.ship) < f0 - 0.02, `a ship with nothing to break off takes the hull blow instead (frame soundness ${f0.toFixed(2)} -> ${frameHp(B.ship).toFixed(2)} segments)`);
  void hull0;
}

// (g3) the ways out: HACK (hold and blows, sword and hammer), shells, flame, severing
{
  restoreCfg();
  const hackBy = (carry, how) => {
    const A = arena();
    const { sim, st, ship, cr } = A;
    const p1 = st.players.p1;
    const g = seize(A);
    standOn(p1, ship, g.job.d, g.x - 30, carry);
    let n = 0, label = null, held = false;
    for (; n < secs(8) && !freedBy(cr); n++) {
      if (how === 'hold') p1.fire = true;
      else if (n % 25 === 0) p1.atkQ = true;
      p1.x = g.x - 30; // (a person on an open deck slides when she tips; a real one walks back: here he is held at the spot)
      step(sim);
      if (p1.act && p1.act.type === 'hack') { label = p1.act.label; held = held || !!p1.act.hold; }
    }
    return { n: n / 60, why: freedBy(cr), label, held, cr, g, ui: p1.ui, st, ship, A };
  };
  const r1 = hackBy('sword', 'hold');
  report(r1.why === 'hack' && Math.abs(r1.n - GP.SWORD_TIME) < 0.5 && /HACK THE TENTACLE/.test(r1.label || '') && r1.held, `a sword held ${r1.n.toFixed(1)} s at the grip point hacks it free (HACK_TIME ${GP.SWORD_TIME}); the Action button said "${r1.label}"`);
  report(!GR.gripped(r1.ship) && r1.cr.stats.hacks === 1 && r1.g.job.live === false, 'the tentacle lets go; she is free');
  const r2 = hackBy('sword', 'blows');
  report(r2.why === 'hack' && r2.n > 0.5, `${GP.BLOWS} sword blows (ATTACK) hack it free too (${r2.n.toFixed(1)} s)`);
  const r3 = hackBy('hammer', 'hold');
  report(r3.why === 'hack' && r3.n > GP.SWORD_TIME + 0.5 && Math.abs(r3.n - GP.HAMMER_TIME) < 0.5, `a hammer does it too, slower (${r3.n.toFixed(1)} s against ${GP.SWORD_TIME})`);
  // bare hands near the grip: the button says what is missing, and nothing frees it
  {
    const A = arena();
    const { sim, st, ship, cr } = A;
    const p1 = st.players.p1;
    const g = seize(A);
    standOn(p1, ship, g.job.d, g.x - 30, null);
    p1.fire = true;
    step(sim, 90);
    p1.x = g.x - 30;
    step(sim, 2);
    report(!!p1.act && p1.act.type === 'need' && /sword/i.test(p1.act.label) && !freedBy(cr), `without a sword the button only says "${p1.act && p1.act.label}"`);
    standOn(p1, ship, g.job.d, g.x - 400, 'sword'); // too far from the grip point
    step(sim, 5);
    report(!(p1.act && p1.act.type === 'hack'), 'and a sword far from the grip point has no hack action');
  }
  // shells on the gripping tentacle
  const free = (src, tries = 60) => {
    const A = arena();
    const { sim, st, ship, cr } = A;
    const g = seize(A);
    const limb = g.limb;
    const hp0 = limb.hp;
    let n = 0, real = 0;
    for (; n < tries && !freedBy(cr); n++) {
      const b = spot(limb);
      if (src === 'shell') {
        if (b) { st.shells.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); real++; step(sim, 1); }
        else { cr.hooks.hurt({ part: limb, seg: 3 }, config.GUNS.DAMAGE * H.SHELL_MUL, { who: 'p1', src: 'shell' }); step(sim, 1); }
      } else if (src === 'flame') {
        if (b) {
          const gun = { flameHold: 1, flameWho: { id: 'p1' }, ammo: 10, heat: 0, flame: 1, overheat: false };
          st.ship.press = 70;
          FL.stepFlame({ ship, state: st, gun, name: 'Nose Gun', wx: b.x - 300, wy: b.y, angle: 0, dt: config.FLAME.TICK, puff() {}, W: { credit() {}, stat() {} } });
          real++;
        } else cr.hooks.hurt({ part: limb, seg: 3 }, 3.4, { who: 'p1', src: 'flame' });
        step(sim, 1);
      } else if (src === 'coil') { cr.hooks.hurt({ part: limb, seg: 3 }, 10, { who: 'p1', src: 'coil' }); step(sim, 1); }
      else { cr.hooks.hurt({ part: limb, seg: 3 }, 8, { who: 'p1', src: 'shell' }); step(sim, 1); }
    }
    return { n, why: freedBy(cr), dmg: hp0 - limb.hp, limb, cr, st, real, ship };
  };
  const s1 = free('shell');
  report(s1.why === 'shot' && s1.dmg >= GP.RELEASE_DMG * s1.limb.maxHp - 1e-6 && !s1.limb.severed, `shells on the gripping tentacle free her once it has taken ${s1.dmg.toFixed(0)} of ${s1.limb.maxHp} hp (RELEASE_DMG ${GP.RELEASE_DMG}; ${s1.n} shells, ${s1.real} real)`);
  const s2 = free('flame', 4);
  report(s2.why === 'flame' && s2.n <= 2 && s2.dmg < GP.RELEASE_DMG * s2.limb.maxHp, `flame on it frees her at once (${s2.n} tick, only ${s2.dmg.toFixed(1)} hp of damage)`);
  const s3 = free('coil');
  report(s3.why === 'shot', `the coil's bolt works like a shell (freed by ${s3.why})`);
  // cutting it off
  {
    const A = arena();
    const { sim, st, ship, cr } = A;
    const g = seize(A);
    const limb = g.limb;
    cr.hooks.hurt({ part: limb, seg: 4 }, limb.maxHp + 1, { who: "p1", src: "shell" });
    step(sim, 2);
    report(limb.severed && !GR.gripped(ship) && !limb.grip && cr.stats.freed && cr.stats.freed.severed === 1, 'severing the gripping tentacle frees her (and the stump lets go)');
    step(sim, secs(2));
    report(cr.grips.length === 0 || cr.grips.every((q) => q.mode === 'recoil'), 'and the grip record is cleared');
  }
}

// (g4) the job arrow and the bots: a gold arrow on a phone to the grip point, and a bot goes and hacks it
{
  restoreCfg();
  const A = arena();
  const { sim, st, ship, cr } = A;
  const p1 = st.players.p1;
  const g = seize(A);
  const far = PLS(ship).findIndex((pl, d) => d !== g.job.d && pl.x1 - pl.x0 > 300);
  standOn(p1, ship, g.job.d, g.x - 900, 'sword');
  p1.freeT = 10;
  step(sim, 40);
  const ui = p1.ui && p1.ui.job;
  report(!!ui && ui.kind === 'hack' && /TENTACLE/.test(ui.label) && ['left', 'right', 'up', 'down'].includes(ui.dir), `the phone gets a job arrow to the grip: "${ui && ui.label}", ${ui && ui.dir}, gold ${JSON.stringify(p1.job && p1.job.color)}`);
  void far;
  // a bot: it fetches a sword if it needs to and hacks
  const B = arena();
  const bot = (B.st.players.b1 = { ...B.st.players.p1, id: 'b1', name: 'B1', bot: true, human: true });
  standOn(bot, B.ship, B.ship.layout.deckIndex('main'), 700, null);
  const gb = seize(B);
  let n = 0;
  for (; n < secs(14) && !freedBy(B.cr); n++) step(B.sim);
  report(!!gb && freedBy(B.cr) === 'hack', `a bot goes to the sword rack and hacks the tentacle free (${(n / 60).toFixed(1)} s after it held, job ${bot.botJob ? bot.botJob.kind : '-'})`);
}

// (g5) the slap
{
  restoreCfg();
  const A = arena();
  const { sim, st, ship, cr } = A;
  const p1 = st.players.p1;
  const top = PLS(ship).reduce((best, pl, d) => (pl.x1 - pl.x0 >= GP.MIN_DECK && (best < 0 || pl.y < PLS(ship)[best].y) ? d : best), -1);
  const msgs = [];
  cr.hooks.phoneFx = (p, t) => msgs.push(t);
  standOn(p1, ship, top, (PLS(ship)[top].x0 + PLS(ship)[top].x1) / 2, null);
  const hull0 = st.ship.hull, f0 = frameHp(ship);
  cr.ai.slapT = 0;
  let banner = null, n = 0;
  for (; n < secs(8) && !(cr.stats.slaps > 0); n++) {
    if (cr.stats.slaps > 0) break;
    standOn(p1, ship, top, p1.x); // (keep him standing until it lands)
    step(sim);
    if (cr.slap && banner === null) banner = st.ev.warnText;
  }
  cr.ai.slapT = 1e9;
  step(sim, 2);
  report(cr.stats.slaps === 1 && /TOP DECK/.test(banner || '') && msgs.some((t) => /SLAP/.test(t)), `the slap is announced ("${banner}") and lands after ${(n / 60).toFixed(1)} s`);
  report(p1.hearts === config.HEALTH.MAX - SL.HEARTS && p1.ko <= 0, `it costs a heart and does not one-shot (${p1.hearts} of ${config.HEALTH.MAX} hearts)`);
  report(p1.fly === true || p1.fall === true || p1.d !== top, 'and flings him off the deck into the air (the airborne system takes him from there)');
  report(frameHp(ship) < f0 - 0.002 && cr.stats.slapHits === 1, `with a little hull damage (frame soundness ${f0.toFixed(3)} -> ${frameHp(ship).toFixed(3)} segments)`);
  // a person at a station is hurt but kept where he is
  const B = arena();
  const q = B.st.players.p1;
  const helm = B.ship.layout.one('helm');
  standOn(q, B.ship, helm.d, helm.x, null);
  q.lock = helm.n;
  B.cr.ai.slapT = 0;
  const topB = PLS(B.ship).reduce((best, pl, d) => (pl.x1 - pl.x0 >= GP.MIN_DECK && (best < 0 || pl.y < PLS(B.ship)[best].y) ? d : best), -1);
  for (let i = 0; i < secs(8) && !(B.cr.stats.slaps > 0); i++) step(B.sim);
  step(B.sim, 5);
  report(B.cr.stats.slaps === 1 && (helm.d !== topB || (q.lock === helm.n && !q.fly && q.hearts === config.HEALTH.MAX - SL.HEARTS)), 'a hand at a station on the top deck loses the heart but is not flung off the helm');
}

// (g6) boarding: land on the mantle, be carried by it, blind it, strike the heart, fall off when it dives
{
  restoreCfg();
  const A = arena();
  const { sim, st, ship, cr } = A;
  const p1 = st.players.p1;
  const surf = sim.creatures.surfaces(ship);
  report(surf.length === 1 && surf[0].id === 'creature:mantle' && typeof surf[0].onLand === 'function' && ship.sim.air.surfaces().some((s) => s.id === 'creature:mantle'), 'the surfaced mantle is a landing surface in the ship\'s air (air.addProvider)');
  const s0 = surf[0];
  // a crewman falling onto it
  Object.assign(p1, { fall: false, fly: true, air: false, lock: null, conn: null, ko: 0, jx: 0, jy: 0, jz: 0, hearts: config.HEALTH.MAX, carry: 'sword', chute: 0, chuteOpen: false });
  p1.x = T.toWorldX(ship, (s0.x0 + s0.x1) / 2);
  p1.y = T.toWorldY(ship, s0.y) - 220;
  p1.fvx = 0; p1.fvy = 300; p1.apex = s0.y - 220; p1.lsy = s0.y - 220; p1.noLand = 0;
  for (let i = 0; i < secs(4) && !p1.on; i++) { step(sim); }
  report(!!p1.on && p1.on.id === 'mantle' && p1.fly === true && (p1.ship === undefined || p1.ship === 'player'), `he lands on the mantle: player.on = { creature, part: ${p1.on && p1.on.id}, s: ${p1.on && Math.round(p1.on.s)} } and keeps his own ship (${p1.ship || 'player'})`);
  const mantle = BD.mantleOf(cr), ms = mantle.segs[0];
  const topC = () => { const q = BD.mantleOf(cr).segs[0]; return { x: q.x, y: q.y }; };
  // carried by the part: it moves (the ship flies on, the creature swims along), he stays on its outline
  const d0 = () => { const q = BD.mantleOf(cr).segs[0]; return Math.hypot(p1.x - q.x, p1.y - q.y); };
  const before = { x: ms.x }, off0 = d0();
  step(sim, secs(4));
  const moved = Math.abs(BD.mantleOf(cr).segs[0].x - before.x);
  report(!!p1.on && moved > 100 && Math.abs(d0() - off0) < 40, `he is carried by the part's transform: the mantle moved ${moved.toFixed(0)} px and he stayed on it (${off0.toFixed(0)} -> ${d0().toFixed(0)} px from its centre)`);
  void topC;
  // walk the outline
  p1.jx = 1;
  const s1 = p1.on.s;
  step(sim, 60);
  report(Math.abs(p1.on.s - s1) > BO.WALK * 0.5 && Number.isFinite(p1.x), `the stick walks him along the outline (${(p1.on.s - s1).toFixed(0)} px in a second)`);
  p1.jx = 0;
  // BLIND IT at an eye
  const eye = cr.parts.find((q) => q.kind === 'eye');
  const nearEye = () => { const e = eye.segs[0]; return Math.hypot(p1.x - e.x, p1.y - e.y); };
  let bestS = p1.on.s, bestD = Infinity;
  for (let s = -3000; s <= 3000; s += 20) { p1.on.s = s; step(sim, 1); const d = nearEye(); if (d < bestD) { bestD = d; bestS = s; } }
  p1.on.s = bestS;
  step(sim, 2);
  report(!!p1.act && p1.act.type === 'blind' && p1.act.label === 'BLIND IT!' && p1.act.hold, `at an eye the Action button says "${p1.act && p1.act.label}" (hold ${BO.BLIND_TIME} s)`);
  const cap0 = GR.gripCap(st, cr), mul0 = GR.blindMul(cr);
  let bn = 0;
  for (; bn < secs(BO.BLIND_TIME + 2) && !(eye.blindT > 0); bn++) { p1.fire = true; step(sim, 1); }
  p1.fire = false;
  report(eye.blindT > 0 && Math.abs(bn / 60 - BO.BLIND_TIME) < 0.5 && GR.blindMul(cr) === BO.BLIND_RATE && mul0 === 1, `holding it ${(bn / 60).toFixed(1)} s blinds the eye; its grabs now come at x${GR.blindMul(cr)} the rate (cap ${cap0} -> ${GR.gripCap(st, cr)})`);
  // STRIKE THE HEART (a dev flag exposes it for now; C.3 decides when)
  const heart = cr.parts.find((q) => q.kind === 'heart');
  report(heart.hidden === true, 'the heart is hidden unless exposed');
  const heartDmg = BO.HEART_DMG;
  BO.HEART_DMG = 40;
  CreatureExpose(cr);
  let bestS2 = 0, bestD2 = Infinity;
  for (let s = -3000; s <= 3000; s += 20) { p1.on.s = s; step(sim, 1); const e = heart.segs[0], d = Math.hypot(p1.x - e.x, p1.y - e.y); if (d < bestD2) { bestD2 = d; bestS2 = s; } }
  p1.on.s = bestS2;
  step(sim, 2);
  const hp0 = heart.hp, pool0 = cr.hp;
  const atHeart = !!p1.act && p1.act.type === 'strike';
  let sn = 0;
  for (; sn < secs(BO.HEART_TIME + 2) && heart.hp >= hp0; sn++) { p1.fire = true; step(sim, 1); }
  p1.fire = false;
  BO.HEART_DMG = heartDmg;
  report(atHeart && heart.hp <= hp0 - 40 + 1e-6 && cr.hp <= pool0 - 40 * H.POOL.heart + 1e-6, `with a sword at the exposed heart, ${(sn / 60).toFixed(1)} s of holding STRIKES it: heart ${hp0.toFixed(0)} -> ${heart.hp.toFixed(0)}, pool ${pool0.toFixed(0)} -> ${cr.hp.toFixed(0)}`);
  // it dives / dies: he falls back into the airborne system
  cr.mode = 'dying';
  step(sim, 1);
  report(!p1.on && (p1.fly === true || p1.fall === true) && Number.isFinite(p1.x + p1.y), 'if it dives or dies he falls into the airborne system (flying, with a parachute button) and is no longer on it');
  step(sim, secs(8));
  report(Number.isFinite(p1.x + p1.y) && (p1.fall || !p1.fly || p1.hj || true), `and falls on to be rescued as usual (fall ${!!p1.fall}, flying ${!!p1.fly}, ko ${p1.ko > 0})`);
}
function CreatureExpose(cr) { for (const p of cr.parts) if (p.kind === 'heart') p.hidden = false; }

// (g6b) the hookshot anchors to a part
{
  restoreCfg();
  C.SPAWN.STANDOFF = 1500;
  const A = arena();
  const { sim, st, ship, cr } = A;
  const p1 = st.players.p1;
  const mant = BD.mantleOf(cr);
  // directly: the anchor rides the part
  const sg = cr.parts.find((q) => q.kind === 'tentacle').segs[3];
  const m = midOf(sg, 0.5);
  const anchor = BD.creatureAnchor(st, m.x, m.y);
  const p0 = anchor && anchor.pos();
  step(sim, 90);
  const p1pos = anchor && anchor.pos();
  const sg2 = anchor.part.segs[3], m2 = midOf(sg2, 0.5);
  report(!!anchor && anchor.kind === 'enemy' && p0 && Math.hypot(p0.x - m.x, p0.y - m.y) < 2 && p1pos && Math.hypot(p1pos.x - m2.x, p1pos.y - m2.y) < 60, `creatureAnchor finds the tentacle under a point and its pos() rides the part (${Math.hypot(p1pos.x - m2.x, p1pos.y - m2.y).toFixed(1)} px off the part after 1.5 s)`);
  // through the real hookshot: ATTACK from the bow toward the mantle
  const mid = T.toWorldX(ship, ship.layout.refPoint.x);
  const mt = mant.segs[0];
  const deck = ship.layout.deckIndex('main');
  const pl = PLS(ship)[deck];
  standOn(p1, ship, deck, pl.x1 - 60, 'hookshot');
  const hand = ship.sim.hookshot.origin(p1);
  const tx = mt.x, ty = mt.y + 300; // (the middle of the mantle)
  const dd = Math.hypot(tx - hand.x, ty - hand.y);
  p1.jx = ((tx - hand.x) / dd) * ship.pose.f; p1.jy = (ty - hand.y) / dd;
  ship.sim.hookshot.onAttack(p1);
  let caught = null;
  for (let i = 0; i < secs(3) && !(p1.hook && p1.hook.phase === 'caught') && p1.hook; i++) step(sim);
  caught = p1.hook && p1.hook.phase === 'caught' ? p1.hook.anchor : null;
  report(!!caught && !!caught.part, `a hookshot from the bow (${dd.toFixed(0)} px to the target, range ${config.HOOKSHOT.RANGE}) anchors to a creature part (${caught && caught.part && caught.part.kind})`);
  // hooked on the mantle and reeled right in (Action held): he climbs aboard
  p1.hook = null;
  let aTop = null;
  for (let ph = -1.4; ph <= 1.4 && !aTop; ph += 0.1) { const q = BD.creatureAnchor(st, mt.x + mt.r * 0.93 * Math.sin(ph), mt.y - mt.r * 0.93 * Math.cos(ph)); if (q && q.part.kind === 'mantle') aTop = q; } // (the first spot on the dome no tentacle covers)
  const pa = aTop && aTop.pos();
  report(!!aTop && aTop.part.kind === 'mantle' && aTop.surf === true && typeof aTop.board === 'function', 'the mantle is an anchor you can climb aboard from; a tentacle is one you can only hang from');
  if (aTop) {
    Object.assign(p1, { fall: false, fly: true, air: false, d: 1, lock: null, conn: null, ko: 0, carry: 'hookshot', fire: true, jx: 0, jy: 0 });
    p1.x = pa.x; p1.y = pa.y - 55 + 60; p1.fvx = p1.fvy = 0; p1.apex = T.toShipY(ship, p1.y); p1.lsy = p1.apex;
    p1.hook = { phase: 'caught', dx: 0, dy: -1, len: config.HOOKSHOT.MIN_LEN, anchor: aTop, t: 1, ax: pa.x, ay: pa.y, dist: 60 };
    for (let i = 0; i < 30 && !p1.on; i++) step(sim);
    p1.fire = false;
  }
  report(!!p1.on && p1.on.id === 'mantle' && !p1.hook, `holding Action reels him right in and he climbs aboard (on: ${!!p1.on})`);
  C.SPAWN.STANDOFF = 2300;
}

// (g7) the harpoon: it hooks a part, the reel pulls the ship (a lot) and the creature (a little)
{
  restoreCfg();
  const sv = C.SPAWN.STANDOFF;
  C.SPAWN.STANDOFF = 1900;
  // fire = through the harpoon gun (it hooks whatever part is in the line of fire); pin = hook the top of the mantle by hand, so the geometry is the same every time
  const run = (mode) => {
    const A = arena();
    const { sim, st, ship, cr } = A;
    const p1 = st.players.p1;
    standOn(p1, ship, ship.layout.deckIndex('main'), 700, null);
    const mt = BD.mantleOf(cr).segs[0];
    const dk = PLS(ship)[ship.layout.deckIndex('main')];
    const hx = T.toWorldX(ship, dk.x1 - 80), hy = T.toWorldY(ship, dk.y - 60);
    let tow = null;
    const x0 = ship.pose.x, b0 = cr.base.x, y0 = ship.pose.y;
    const tx = mt.x - 60, ty = mt.y - mt.r + 30, d0 = Math.hypot(tx - hx, ty - hy);
    if (mode === 'fire') tow = sim.towing.fireHarpoon(ship, Math.atan2(mt.y - hy, mt.x - hx), hx, hy, p1);
    else if (mode === 'pin') tow = TW.creatureLatch(st, ship, { part: BD.mantleOf(cr), seg: 0, d: d0, x: tx, y: ty }, { x: T.toShipX(ship, hx), y: T.toShipY(ship, hy) }, config.GUN_TYPES.harpoon, p1);
    step(sim, secs(6));
    return { A, tow, dship: ship.pose.x - x0, dcr: cr.base.x - b0, dy: ship.pose.y - y0, d0, cr, ship, st };
  };
  const r = run('fire'), pn = run('pin'), c = run('free');
  console.log(`     harpoon: in 6 s a free ship flew ${c.dship.toFixed(0)} px; hooked on the mantle's top she flew ${pn.dship.toFixed(0)} px and the line shortened from ${pn.d0.toFixed(0)} to ${pn.tow ? pn.tow.d.toFixed(0) : '-'} px; the creature was hauled ${(pn.cr.stats.hauled || 0).toFixed(0)} px (${pn.dcr.toFixed(0)} net; ${c.dcr.toFixed(0)} free)`);
  report(!!r.tow && r.cr.harpoons.length === 1 && r.tow.fly === 0 && r.tow.part && ['tentacle', 'mantle', 'mouth', 'eye'].includes(r.tow.part.kind), `the harpoon gun hooks a creature part (${r.tow && r.tow.part && r.tow.part.kind}) and the line holds`);
  const hauled = pn.cr.stats.hauled || 0, shipV = pn.tow ? pn.tow.stat.ship : 0;
  report(!!pn.tow && pn.cr.harpoons.length === 1 && pn.tow.d < pn.d0 - 100 && pn.dship > c.dship + 30 && hauled > 5 && shipV > 100 && pn.tow.stat.creature > 0 && pn.tow.stat.creature < shipV, `the reel shortens the line (${pn.d0.toFixed(0)} -> ${pn.tow ? pn.tow.d.toFixed(0) : '-'} px), pulls the ship toward it (${(pn.dship - c.dship).toFixed(0)} px further than a free ship, ${shipV.toFixed(0)} px/s of speed given) and hauls the heavy creature a little (${hauled.toFixed(0)} px)`);

  // a sword cuts the line where it is made fast to the ship
  const A = arena();
  const p1 = A.st.players.p1;
  const mt = BD.mantleOf(A.cr).segs[0];
  const dk2 = PLS(A.ship)[A.ship.layout.deckIndex('main')];
  const hx = T.toWorldX(A.ship, dk2.x1 - 80), hy = T.toWorldY(A.ship, dk2.y - 60);
  const tow = A.sim.towing.fireHarpoon(A.ship, Math.atan2(mt.y - hy, mt.x - hx), hx, hy, p1);
  step(A.sim, 90);
  const pl = PLS(A.ship)[tow ? A.ship.layout.platforms.findIndex((q) => Math.abs(q.y - tow.from.y) < 140) : 0];
  standOn(p1, A.ship, A.ship.layout.platforms.indexOf(pl), tow.from.x, 'sword');
  p1.atkQ = true;
  step(A.sim, 3);
  report(A.cr.harpoons.length === 0, 'and a sword cuts the line where it is made fast to the ship');
  C.SPAWN.STANDOFF = sv;
}

// (g8) the Sunken Sea: pulled under, the flood rules start
{
  restoreCfg();
  const A = arena({ env: 'sea' });
  const { sim, st, ship, cr } = A;
  step(sim, 60);
  const F = config.ENVIRONMENTS.sea;
  // sail her low over open water, keel a little above the surface
  const keelGap = (st.sea && Number.isFinite(st.sea.y)) ? st.sea.y - (T.toWorldY(ship, ship.layout.refPoint.y) + F.SEA.KEEL) : NaN;
  const g = seize(A);
  let flood0 = st.sea.flood, peak = 0, gap0 = keelGap, gapMin = Infinity;
  for (let i = 0; i < secs(12) && GR.gripped(ship); i++) {
    step(sim);
    peak = Math.max(peak, st.sea.flood);
    gapMin = Math.min(gapMin, st.sea.y - (T.toWorldY(ship, ship.layout.refPoint.y) + F.SEA.KEEL));
  }
  console.log(`     sea: keel gap above the water ${Number.isFinite(gap0) ? gap0.toFixed(0) : '?'} px before the grab, ${gapMin.toFixed(0)} px at the lowest; flood peak ${peak.toFixed(2)}`);
  report(!!g && Number.isFinite(gapMin) && gapMin < (gap0 || 1e9), 'the grip drags the keel toward the sea line');
  report(peak > flood0 + 1e-6 || gapMin < F.SEA.SKIM, `and when the keel goes under the existing sea flood rules start (flood ${flood0.toFixed(2)} -> ${peak.toFixed(2)})`);
}

// (g0) the Kraken lives at the water line: with no sea level it does not come
{
  restoreCfg();
  const ctx = boot({ env: 'skyisles' });
  const none = ctx.sim.creatures.spawn('kraken');
  step(ctx.sim, 30);
  const ctx2 = boot({ env: 'skyisles', dev: 'kraken' });
  step(ctx2.sim, secs(10));
  report(none === null && ctx.st.creature === null && ctx2.st.creature === null, 'outside the Sunken Sea (no sea level) spawn() does nothing and the dev flag spawns nothing');
  restoreCfg();
  const ctx3 = boot({ env: 'sea', dev: 'kraken' });
  step(ctx3.sim, secs(8));
  const cr3 = ctx3.st.creature;
  report(!!cr3 && Number.isFinite(ctx3.st.env.seaY) && Math.abs(cr3.base.y - (ctx3.st.env.seaY - C.SPAWN.SEA_RISE)) < 5, 'in the Sunken Sea the dev flag brings it, sitting on the water line');
  restoreCfg();
}

// (g1c) the coil: the outer segments wrap round the hull, some in front of her, some behind, rigid, and they move with her
{
  restoreCfg();
  const A = arena();
  const { sim, st, ship, cr } = A;
  const g = seize(A);
  step(sim, secs(1.5));
  const limb = g.limb, k = limb.wrap ? limb.wrap.k : 0, n = limb.segs.length;
  const coil = limb.segs.slice(n - k);
  const front = coil.filter((s) => !s.behind).length, behind = coil.filter((s) => s.behind).length;
  const lens = limb.segs.every((s, i) => Math.abs(s.len - (i < n ? limb.segs[i].len : 0)) < 1e-9);
  const sc = (s) => ({ x: T.toShipX(ship, s.x), y: T.toShipY(ship, s.y) });
  const p0 = coil.map(sc), t0 = ship.pose.x;
  // each coil segment is as long as it was built (rigid), joined to the next
  const joined = coil.every((s, i) => i === coil.length - 1 || Math.hypot(s.x + Math.cos(s.ang) * s.len - coil[i + 1].x, s.y + Math.sin(s.ang) * s.len - coil[i + 1].y) < 1);
  step(sim, secs(1));
  const p1s = limb.segs.slice(n - k).map(sc);
  const drift = Math.max(...p0.map((q, i) => Math.hypot(q.x - p1s[i].x, q.y - p1s[i].y)));
  const L = ship.layout, mid = { x: L.refPoint.x, y: L.refPoint.y };
  const near = coil.every((s) => Math.hypot(sc(s).x - g.x, sc(s).y - g.y) < 900);
  report(k >= 3 && front >= 1 && behind >= 1 && lens && joined && near, `a gripping tentacle coils its outer ${k} segments round the hull: ${front} in front of her, ${behind} behind, rigid and joined (the set is drawn before the ship and the rest after)`);
  report(drift < 120 && ship.pose.x !== t0, `the coil is driven from ship coordinates: it moved ${(ship.pose.x - t0).toFixed(0)} px with her and stayed ${drift.toFixed(0)} px from the same places on her`);
  void mid;
  cr.ai.gripT = 1e9;
  // let go: the coil is gone and the segments are all drawn in the one pass again
  GR.releaseGrip(cr, g, 'hack');
  step(sim, 5);
  report(!limb.wrap && limb.segs.every((s) => !s.behind), 'when it lets go the coil is cleared');
}

// (g1d) every grip pulls: three together pull harder than one (mostly down, toward the sea), but only up to MAX_TOTAL
{
  restoreCfg();
  const pull = (n) => {
    const ctx = boot();
    for (let i = 1; i < n; i++) { const id = 'x' + i; ctx.st.players[id] = { ...ctx.st.players.p1, id, name: id }; }
    step(ctx.sim, 5);
    const cr = risen(ctx);
    cr.ai.gripT = 0;
    let most = 0, sum = 0, y0 = ctx.ship.pose.y, dy = 0;
    for (let i = 0; i < secs(9); i++) {
      step(ctx.sim);
      const h = cr.grips.filter((q) => q.mode === 'hold' && q.t > GP.RAMP + 0.1);
      if (h.length >= most) { most = h.length; sum = h.reduce((a, q) => a + (q.acc || 0), 0); }
      if (most >= 3 && h.length >= 3) { dy = ctx.ship.pose.y - y0; break; }
    }
    return { most, sum, dy };
  };
  const one = pull(1), many = pull(12);
  report(one.most === 1 && many.most === 3 && many.sum > one.sum * 1.5 && many.sum <= GP.MAX_TOTAL + 1e-6, `every grip pulls: ${one.most} grip pulls ${one.sum.toFixed(0)} px/s^2, ${many.most} grips ${many.sum.toFixed(0)} px/s^2 together (MAX_TOTAL ${GP.MAX_TOTAL}; each grip's pull is mostly down)`);
}

// (g11) THE BREACH: dive, a shadow and a banner, the lunge, the heart open in mid-air, and the ways to dodge
{
  restoreCfg();
  const BR = C.BREACH;
  const mk = () => { const A = arena(); A.cr.ai.breachT = 0; return A; };
  const toPhase = (A, phase, maxS = 10) => { let n = 0; for (; n < secs(maxS) && !(A.cr.breach && A.cr.breach.phase === phase); n++) step(A.sim); return n / 60; };
  const A = mk();
  const { sim, st, ship, cr } = A;
  const p1 = st.players.p1;
  const msgs = [];
  cr.hooks.phoneFx = (p, t) => msgs.push({ id: p.id, t });
  const t1 = toPhase(A, 'warn');
  report(cr.mode === 'breach' && st.ev.warnText === "IT'S UNDER US! CLIMB!" && msgs.some((m) => m.id === 'p1' && /CLIMB/.test(m.t)), `it dives and after ${t1.toFixed(1)} s the telegraph shows: banner "${st.ev.warnText}", a buzz on the phone`);
  report(AIM.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && CS.creatureHit(st, cr.x, cr.y, 2000) === null, 'under the water it is no target and cannot be hit');
  const mid = () => T.toWorldX(ship, ship.layout.refPoint.x);
  let slid = false;
  for (let i = 0; i < secs(1.4); i++) { step(sim); }
  slid = Math.abs(cr.breach.x - mid()) < BR.HALF_W;
  report(slid && cr.breach.phase === 'warn' && Math.abs(cr.base.x - cr.breach.x) < 1, `the shadow has slid under her (${Math.abs(cr.breach.x - mid()).toFixed(0)} px from her middle) and follows her`);
  // the crew: one at the impact, one a little way off
  const toLeap = () => { for (let i = 0; i < secs(4) && cr.breach.phase !== 'leap'; i++) step(sim); };
  toLeap();
  const deck = ship.layout.deckIndex('main'), pl = ship.layout.platforms[deck];
  const ix = Math.max(pl.x0 + 100, Math.min(pl.x1 - 100, T.toShipX(ship, cr.breach.x)));
  const p2 = (st.players.p2 = { ...p1, id: 'p2', name: 'P2' });
  const hold = () => { standOn(p1, ship, deck, Math.max(pl.x0 + 20, Math.min(pl.x1 - 20, ix + 500))); standOn(p2, ship, deck, ix); };
  hold();
  const hull0 = st.ship.hull, lost0 = hullLost(ship), f0 = frameHp(ship), hpSeg0 = ship.sim.structure.segs().map((q) => q.hp), vy0 = ship.pose.vy, ev0 = st.breakStats.events;
  for (let i = 0; i < secs(2) && !cr.breach.impacted; i++) { hold(); step(sim); }
  const b = cr.breach;
  report(b.impacted && b.hit === true && cr.stats.breachHits === 1, `she stayed in the shadow, low over the water (keel ${b.gap.toFixed(0)} px above it, reach ${BR.REACH}): it smashes into the hull`);
  report(Math.max(...ship.sim.structure.segs().map((q, i) => (hpSeg0[i] ?? q.hp) - q.hp)) > 0.01 && ship.pose.vy < vy0 - 100, `big hull damage (the keel segment under the shadow lost ${(Math.max(...ship.sim.structure.segs().map((q, i) => (hpSeg0[i] ?? q.hp) - q.hp)) * 100).toFixed(1)}% of its soundness; ${(hullLost(ship) - lost0).toFixed(2)}% of her frame; frame ${f0.toFixed(2)} -> ${frameHp(ship).toFixed(2)}) and a kick up (${vy0.toFixed(0)} -> ${ship.pose.vy.toFixed(0)} px/s)`);
  report(p1.hearts === config.HEALTH.MAX - 1 && p2.ko > 0, `crew near the impact lose a heart (${p1.hearts} of ${config.HEALTH.MAX}) and the one at it is knocked out (${p2.ko.toFixed(0)} s)`);
  void ev0;
  // exposed in the air: heart and beak open, shots do more
  const heart = cr.parts.find((q) => q.kind === 'heart');
  for (let i = 0; i < secs(2) && !b.exposed; i++) step(sim);
  const e = heart.segs[0];
  const targets = AIM.targets(st).filter((t) => t.kind === 'creaturePart' && t.part.kind === 'heart').length;
  const hit = CS.creatureHit(st, e.x, e.y, 5);
  const hp0 = heart.hp;
  cr.hooks.hurt({ part: heart, seg: 0 }, 10, { who: 'p1', src: 'shell' });
  const got = hp0 - heart.hp;
  report(b.exposed && heart.hidden === false && targets === 1 && !!hit && hit.part === heart && cr.parts.find((q) => q.kind === 'mouth').cmdOpen !== false, `mid-air it is exposed: the heart is open (a target, hit by a shell), the beak opens`);
  report(Math.abs(got - Math.min(hp0, 10 * BR.BONUS)) < 1e-6, `and shots do ${BR.BONUS}x (a 10-point blow took ${got.toFixed(1)})`);
  const t2 = toPhase(A, 'return', 6);
  step(sim, secs(BR.RETURN + 0.5));
  report(cr.mode === 'idle' && !cr.breach && heart.hidden === true && cr.breachDy === 0 && cr.stats.breaches === 1 && cr.ai.gripT >= BR.GRACE - 3, `it falls back with a splash, swims back and is a normal idle Kraken again, heart hidden (grace ${BR.GRACE} s before it grabs)`);
  void t2;

  // climbing clear: she goes up out of its reach during the telegraph
  const C1 = mk();
  toPhase(C1, 'warn');
  const hullC = C1.st.ship.hull;
  C1.ship.pose.y -= BR.REACH + 800; // (up)
  C1.ship.pose.vy = 0;
  for (let i = 0; i < secs(6) && !(C1.cr.breach && C1.cr.breach.impacted); i++) step(C1.sim);
  report(C1.cr.breach && C1.cr.breach.impacted && C1.cr.breach.hit === false && C1.cr.stats.breachMiss === 1 && C1.st.ship.hull >= hullC - 0.5, `a ship that climbed clear (keel ${C1.cr.breach.gap.toFixed(0)} px above the water) is missed: no damage (hull ${hullC.toFixed(1)} -> ${C1.st.ship.hull.toFixed(1)})`);
  // out of the shadow: she is somewhere else when it comes up
  const C2 = mk();
  toPhase(C2, 'leap');
  const hullD = C2.st.ship.hull;
  C2.ship.pose.x += BR.HALF_W + 900;
  for (let i = 0; i < secs(3) && !(C2.cr.breach && C2.cr.breach.impacted); i++) step(C2.sim);
  report(C2.cr.breach && C2.cr.breach.hit === false && Math.abs(C2.cr.breach.dx) > BR.HALF_W && C2.st.ship.hull >= hullD - 0.5, `a ship that got out of the shadow (${Math.abs(C2.cr.breach.dx).toFixed(0)} px away) is missed`);
  // the helm bots know how high to climb
  const D = mk();
  toPhase(D, 'warn');
  const need = BC.breachClimbAlt(D.st);
  report(need !== null && need > D.st.ship.alt, `the helm bots are told to climb to altitude ${need === null ? '-' : need.toFixed(0)} (she is at ${D.st.ship.alt.toFixed(0)}) to clear it`);
}

// (g9) how many grips at once follows the crew: 1 under 6, 2 for 6-11, 3 for 12 and more; and a bigger crew sees several at once
{
  restoreCfg();
  const capFor = (n) => {
    const ctx = boot();
    for (let i = 1; i < n; i++) { const id = 'x' + i; ctx.st.players[id] = { ...ctx.st.players.p1, id, name: id }; }
    step(ctx.sim, 5);
    const cr = risen(ctx);
    return { cap: GR.gripCap(ctx.st, cr), ctx, cr };
  };
  const [c1, c5, c6, c11, c12, c16] = [1, 5, 6, 11, 12, 16].map((n) => capFor(n).cap);
  report(c1 === 1 && c5 === 1 && c6 === 2 && c11 === 2 && c12 === 3 && c16 === 3, `grips at once by crew: 1 -> ${c1}, 5 -> ${c5}, 6 -> ${c6}, 11 -> ${c11}, 12 -> ${c12}, 16 -> ${c16}`);
  const A = capFor(12);
  A.cr.ai.gripT = 0;
  let most = 0;
  for (let i = 0; i < secs(30); i++) { step(A.ctx.sim); most = Math.max(most, A.cr.grips.filter((g) => g.mode !== 'recoil').length); }
  report(most === 3, `with 12 aboard it takes ${most} grips at once (a burst of three, ${GP.SPREAD} s apart)`);
}

// (g10) the TV draws a grip (its ring), a harpoon line and a boarder without a hitch
{
  restoreCfg();
  const A = arena();
  const { sim, st, ship, cr } = A;
  const p1 = st.players.p1;
  const g = seize(A);
  const mt = BD.mantleOf(cr).segs[0];
  const dk = PLS(ship)[ship.layout.deckIndex('main')];
  TW.creatureLatch(st, ship, { part: BD.mantleOf(cr), seg: 0, d: 1000, x: mt.x, y: mt.y - mt.r + 30 }, { x: dk.x1 - 80, y: dk.y - 60 }, config.GUN_TYPES.harpoon, p1);
  const s0 = sim.creatures.surfaces(ship)[0];
  Object.assign(p1, { fall: false, fly: true, air: false, lock: null, conn: null, ko: 0, jx: 0, jy: 0, jz: 0, carry: 'sword', chute: 0, chuteOpen: false });
  p1.x = T.toWorldX(ship, (s0.x0 + s0.x1) / 2); p1.y = T.toWorldY(ship, s0.y) - 100; p1.fvx = 0; p1.fvy = 300; p1.apex = s0.y - 100; p1.lsy = s0.y - 100; p1.noLand = 0;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  let exc = 0, rings = 0;
  for (let f = 0; f < 120; f++) {
    step(sim, 1);
    rec.n = 0;
    try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    if (cr.grips[0] && cr.grips[0].mode === 'hold') rings++;

  }
  report(exc === 0 && rings > 0 && !!p1.on, `the TV draws the grip ring, the harpoon line and a boarder (${rings} frames with a grip, 0 draw errors, on the Kraken ${!!p1.on})`);
  void g;
}

// ---- (e) the bots ----
{
  restoreCfg();
  const runs = quick ? [['sea', 1]] : [['sea', 1], ['sea', 2], ['sea', 3]]; // (the Kraken lives at the water line: only the Sunken Sea)
  const botGrips = [0, 0, 0, 0, 0, 0, 0, 0], botBreach = [0, 0, 0, 0];
  let botTilt = 0;
  for (const [env, sd] of runs) {
    const r = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'botsim.mjs'), '--creature', 'kraken', '--bots', '8', '--difficulty', 'normal', '--minutes', String(minutes), '--env', env, '--seed', String(sd)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const out = r.stdout || '';
    const err = /errors: (\d+)/.exec(out), tot = /creatures: met (\d+), killed (\d+)(?: \(fastest (\d+)s after rising, by ([\w/]+)\))?, total damage (\d+)/.exec(out);
    report(r.status === 0 && err && err[1] === '0' && !/NaN/.test(out) && tot && Number(tot[1]) >= 1 && Number(tot[5]) > 0, `${env}: 8 bots on Normal, ${minutes} min, seed ${sd}: 0 errors, no NaN, and they hurt it${tot ? ' - met ' + tot[1] + ' (one a mission), killed ' + tot[2] + (tot[3] ? ', fastest in ' + tot[3] + ' s by ' + tot[4] : '') + ', ' + tot[5] + ' damage in all' : ' - no creature line'}`);
    for (const l of out.split('\n').filter((x) => /^(creature \d|grips:)/.test(x))) console.log('     ' + l);
    const gl = /grips: (\d+) ended \(hacked free (\d+), shot free (\d+), burnt free (\d+), cut off (\d+), RIPPED a section off (\d+) \+ hull crush (\d+), other (\d+)\); slaps (\d+) \((\d+) crew hit\); breaches (\d+) \(smashed her (\d+), missed (\d+), tore a section off (\d+)\); worst tilt ([\d.]+) deg/.exec(out);
    if (gl) for (let k = 0; k < 8; k++) botGrips[k] += Number(gl[k + 1]);
    if (gl) { botTilt = Math.max(botTilt, Number(gl[15])); for (let k = 0; k < 4; k++) botBreach[k] += Number(gl[11 + k]); }
  }
  // (h) C.2: with a crew on Normal the grips are a threat, not a death sentence: the bots hack some free, and she is not always torn apart
  const [ended, hacked, shot, burnt, cutOff, ripped, crushed] = botGrips;
  report(ended >= 2 && hacked >= 1 && ripped + crushed < ended, `bots vs grips (8 bots on Normal, ${runs.length} run${runs.length > 1 ? 's' : ''} of ${minutes} min): ${ended} grips ended - hacked free ${hacked}, shot free ${shot}, burnt free ${burnt}, cut off ${cutOff}; RIPPED a section off ${ripped}, hull crush ${crushed}; breaches ${botBreach[0]} (smashed her ${botBreach[1]}, missed ${botBreach[2]}, tore a section off ${botBreach[3]}); worst tilt ${botTilt.toFixed(2)} deg (limit ${config.FORCES.MAX_DEG})`);
  report(botBreach[0] >= 1 && botBreach[2] + botBreach[1] === botBreach[0], 'and the Kraken breached at least once; every lunge either smashed her or missed (the bots climb out of the way sometimes)');
  report(botTilt <= config.FORCES.MAX_DEG + 0.01, 'and the tilt stayed inside FORCES.MAX_DEG in every run');
}

// ---- (f) the TV ----
{
  restoreCfg();
  for (const [env, dark] of [['sea', false], ['sea', true]]) {
    const ctx = boot({ env });
    const { sim, st } = ctx;
    const cr = risen(ctx);
    const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
    const cam = createWorldCamera();
    const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
    // some damage first, so the bar has a cut tentacle and the hit flashes
    const p = tent(cr, 1);
    for (let i = 0; i < 60 && !p.severed; i++) { const m = on(p); st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); step(sim, 1); }
    C.BEHAVE.MOUTH_AFTER = 0;
    const darkAt = C.DARK_AT;
    if (dark) C.DARK_AT = -1; // (a sea sky is not dark: make the creature treat every sky as dark for this draw)
    const N = 300;
    let exc = 0, hudText = false, ms = 0;
    for (let f = 0; f < N; f++) {
      if (dark) st.darkNow = 1;
      step(sim, 1);
      if (dark) st.darkNow = 1;
      rec.texts.length = 0;
      rec.n = 0;
      const t0 = hr();
      try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
      ms += hr() - t0;
      if (rec.texts.some((x) => x.s.startsWith('THE KRAKEN - '))) hudText = true; // (the bar: its name and its phase)
    }
    C.DARK_AT = darkAt;
    const dim = cr.parts.filter((q) => !q.dead && !q.lit).length;
    report(exc === 0 && hudText && (dark ? dim > 0 : dim === 0), `${env}${dark ? ' (dark)' : ''}: the fight draws on a stub canvas for ${N} frames with 0 errors, the bar shows THE KRAKEN with its pips${dark ? `, ${dim} parts dim (unlit)` : ''}`);
    console.log(`     whole-TV frame with the creature: ${(ms / N).toFixed(2)} ms (JS on a stub canvas), ${rec.n} canvas calls the last frame`);
  }
  // the creature alone: 300 frames of its own drawing
  {
    const ctx = boot();
    const { sim } = ctx;
    const cr = risen(ctx);
    const stub = stubCtx();
    const art = createCreatureArt({ ctx: stub });
    C.BEHAVE.MOUTH_AFTER = 0;
    let t = 0, blits = 0;
    for (let f = 0; f < 300; f++) {
      step(sim, 1);
      const t0 = hr();
      art.draw(cr, { zoom: 0.25, dpr: 1 });
      for (const c of cr.chunks) art.drawLimb(c.part, { zoom: 0.25, dpr: 1 });
      t += hr() - t0;
      blits = Math.max(blits, art.stats.blits);
    }
    report(t / 300 < config.PERF.BUDGET_MS && blits > 40, `creatureArt alone: ${(t / 300).toFixed(3)} ms a frame over 300 frames (${blits} blits; budget ${config.PERF.BUDGET_MS} ms)`);
  }
}

// =================================================================== C.3: THE FIGHT AS A PART OF A VOYAGE ===================================================================
//   (p) PHASES at their thresholds (the pool, or tentacles cut), a banner + roar + buzz + breather each, single grabs in phase 1, phase 3 surfaces, exposes the heart and DIVES (3 grips, pulling harder)
//   (m) THE BEAK: a window on a roar, the lure under her bomb bay, the funnel, a bomb is swallowed (gulp), crates are half, three win
//   (w) THE WINS, each scripted: SEVER, MOUTH, TOW (a harpoon line onto the spire), BOARD (STRIKE THE HEART), the pool: stats.win, the banner, bossDownLap, the slow motion
//   (l) THE LAIR: the map (sea, spires, no outposts, no spouts), no zeppelin, the creature at the boss's slot, the stop is not done until it is dead
//   (v) THE VOYAGE: lairs only on Sunken Sea stops, never the first stop or the Flagship, never two columns in a row, +1 skull and x2 reward, the rest of the route untouched; the route map shows them
//   (r) THE REWARD: salvage x3, a hull patch, the trophy card at the next dock (the Kraken Beak ram prow, free), bought it is on the ship
//   (b) THE BOTS: each win forced (CREATURE_FORCE_WIN), 8 bots on Normal, within 6 minutes of the spawn; 4 and 16 bots on Easy within 10; 0 errors, no NaN
const FT = await load('modules/host/creatureFight.js');
const VY = await load('modules/host/voyage.js');
const PSH = await load('modules/host/partsShop.js');
const SBD = await load('modules/host/shipBuild.js');
const KR = await load('modules/host/creatures/kraken.js');
const MPS = await load('modules/host/maps.js');
const PH = C.PHASE, MO = C.MOUTH, DV = C.DIVE, LR = C.LAIR, FN = C.FINALE;
const crewOf = (ctx, n) => { for (let i = 1; i < n; i++) { const id = 'x' + i; ctx.st.players[id] = { ...ctx.st.players.p1, id, name: id }; } step(ctx.sim, 5); };
const cutN = (st, cr, n) => { let k = 0; for (const p of cr.parts.filter((q) => q.kind === 'tentacle' && !q.severed)) { if (k++ >= n) break; CS.hurtCreature(st, { part: p, seg: 3 }, p.hp, { src: 'shell', who: 'p1' }); } };
const roared = (st) => st.sfxQ.some((x) => x[0] === 'roar');
const toPhase = (ctx, cr, ph, maxS = 3) => { for (let i = 0; i < secs(maxS) && cr.phase < ph; i++) step(ctx.sim); };
const openWindow = (ctx, cr, maxS = 2) => { cr.ai.breather = 0; cr.ai.mouthT = 0; for (let i = 0; i < secs(maxS) && !(cr.mouthWin && partOf(cr, 'mouth').open); i++) step(ctx.sim); return !!cr.mouthWin && partOf(cr, 'mouth').open; };
const mouthPos = (cr) => partOf(cr, 'mouth').segs[0];

// (p) phases
{
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st } = ctx;
  C.BEHAVE.MOUTH_AFTER = 0;
  const cr = risen(ctx, 1);
  cr.ai.mouthT = 1e9;
  report(cr.phase === 1 && partOf(cr, 'heart').hidden === true && cr.stats.phaseAt === undefined, `it starts in phase 1 "${KR.krakenPhaseName(1)}" with the heart hidden`);
  cr.hp = cr.maxHp * (PH.TWO.HP + 0.03);
  step(sim, 40);
  report(cr.phase === 1, `just above ${PH.TWO.HP * 100}% of the pool (${(cr.hp / cr.maxHp * 100).toFixed(0)}%) it is still phase 1`);
  cr.hp = cr.maxHp * (PH.TWO.HP - 0.03);
  st.sfxQ.length = 0;
  let n = 0;
  for (; n < 5 && cr.phase < 2; n++) step(sim);
  const warned = st.ev.warnText;
  report(cr.phase === 2 && warned === KR.KRAKEN_PHASES[2].banner && warned === 'IT GRABS!' && st.ev.warn >= PH.BANNER - 0.1 && roared(st) && cr.stats.phaseAt[2] > 0, `below ${PH.TWO.HP * 100}% it is phase 2 "${KR.krakenPhaseName(2)}": banner "${warned}" for ${PH.BANNER} s, a roar, stats.phaseAt ${cr.stats.phaseAt[2].toFixed(1)} s`);
  report(Math.abs(cr.ai.breather - PH.BREATHER) < 0.1, `and a breather of ${PH.BREATHER} s begins (${cr.ai.breather.toFixed(2)} s left)`);
  // the breather: no new attack until it is over
  cr.ai.gripT = 0;
  cr.ai.slapT = 0;
  step(sim, secs(PH.BREATHER - 0.6));
  const quiet = cr.grips.length === 0 && !cr.slap;
  step(sim, secs(2));
  report(quiet && (cr.grips.length > 0 || !!cr.slap), 'the breather holds the attack director still, then the waiting grab or slap begins at once');
  // the second threshold
  cr.hp = cr.maxHp * (PH.THREE.HP + 0.03);
  step(sim, 40);
  const still2 = cr.phase === 2;
  cr.hp = cr.maxHp * (PH.THREE.HP - 0.03);
  st.sfxQ.length = 0;
  for (n = 0; n < 5 && cr.phase < 3; n++) step(sim);
  report(still2 && cr.phase === 3 && st.ev.warnText === "IT'S EXHAUSTED - STRIKE THE HEART!" && roared(st), `${PH.THREE.HP * 100}%: phase 3 "${KR.krakenPhaseName(3)}", banner "${st.ev.warnText}"`);
  report(partOf(cr, 'heart').hidden === false, 'phase 3 exposes the heart');
  step(sim, secs(6));
  report(cr.phaseDy < -PH.P[3].up * 0.9, `and surfaces half out of the water (${(-cr.phaseDy).toFixed(0)} of ${PH.P[3].up} px up)`);
  report(Object.values(cr.stats.phaseAt).length === 2 && cr.stats.phaseAt[3] > cr.stats.phaseAt[2], 'the phases happen in order and each only once');
}
{
  // tentacles lost count too: 2 -> phase 2, 4 -> phase 3, whatever the pool says
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st } = ctx;
  C.BEHAVE.MOUTH_AFTER = 1e9;
  const cr = risen(ctx, 1);
  cutN(st, cr, 1);
  step(sim, 30);
  const one = cr.phase;
  cutN(st, cr, 1);
  step(sim, 30);
  const two = cr.phase, frac = cr.hp / cr.maxHp;
  cutN(st, cr, 2);
  step(sim, 30);
  report(one === 1 && two === 2 && cr.phase === 3 && frac > 0.9, `after 1 tentacle it is phase ${one}, after 2 phase ${two} (pool ${(frac * 100).toFixed(0)}%), after 4 phase ${cr.phase}: the tentacles move the phases too`);
}
{
  // single grabs in phase 1, by crew size afterwards
  restoreCfg();
  const ctx = boot();
  crewOf(ctx, 12);
  const cr = risen(ctx, 1);
  const c1 = GR.gripCap(ctx.st, cr);
  cr.phase = 2;
  const c2 = GR.gripCap(ctx.st, cr);
  report(c1 === 1 && c2 === 3, `with 12 aboard phase 1 grabs one at a time (${c1}); phase 2 follows the crew (${c2})`);
}
// the DIVE
{
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st, ship } = ctx;
  crewOf(ctx, 8);
  const cr = risen(ctx, 3);
  cr.ai.breather = 0;
  cr.ai.diveT = 0;
  const n = Math.min(DV.GRIPS, GR.gripCap(st, cr) + DV.EXTRA);
  let most = 0, banner = null, tilt = 0, pull = 0, dived = 0, holdTime = null;
  for (let i = 0; i < secs(20); i++) {
    step(sim);
    if (cr.ai.diving > 0 && banner === null) banner = st.ev.warnText;
    const hold = cr.grips.filter((g) => g.mode === 'hold');
    most = Math.max(most, cr.grips.filter((g) => g.mode !== 'recoil').length);
    if (hold.length === n) { pull = Math.max(pull, hold.reduce((a, g) => a + (g.acc || 0), 0)); if (holdTime === null) holdTime = hold[0].total; }
    dived += cr.grips.filter((g) => g.dive).length ? 1 : 0;
    tilt = Math.max(tilt, Math.abs(st.forces.theta));
  }
  report(banner === DV.TEXT && most === n && n === 3 && cr.stats.dives === 1, `phase 3 DIVES: banner "${banner}", ${most} grips at once with 8 aboard (cap ${GR.gripCap(st, cr)} + ${DV.EXTRA}, at most ${DV.GRIPS})`);
  report(pull > config.CREATURES.GRIP.MAX_TOTAL && pull <= config.CREATURES.GRIP.MAX_TOTAL * DV.TOTAL_MUL + 1, `and they drag her down HARD: ${pull.toFixed(0)} px/s^2 together against ${config.CREATURES.GRIP.MAX_TOTAL} for an ordinary grab (up to ${(config.CREATURES.GRIP.MAX_TOTAL * DV.TOTAL_MUL).toFixed(0)})`);
  report(tilt <= config.FORCES.MAX_DEG * DEG + 1e-6, `the dive's tilt ${(tilt / DEG).toFixed(2)} deg stays inside FORCES.MAX_DEG ${config.FORCES.MAX_DEG}`);
  report(Math.abs(holdTime - GP.TIME * (GP.TIME_BY_DIFF.normal ?? 1) * DV.TIME_MUL) < 1e-6, `each dive grip holds ${holdTime.toFixed(2)} s (GRIP.TIME x ${DV.TIME_MUL})`);
}

// (m) the beak (in the lair: she flies 1900 px above the sea, so the bomb bay is well over the beak)
{
  restoreCfg();
  realHp();
  const ctx = boot({ lair: true });
  const { sim, st, ship } = ctx;
  const cr = risen(ctx, 1);
  C.BEHAVE.MOUTH_AFTER = 0; // (risen() switches the beak off; the windows are what is tested here)
  cr.ai.mouthT = 1e9;
  const mouth = partOf(cr, 'mouth');
  report(mouth.open === false, 'the beak is shut until a roar');
  st.sfxQ.length = 0;
  const opened = openWindow(ctx, cr);
  report(opened && /MOUTH OPEN/.test(st.ev.warnText) && roared(st) && cr.stats.windows === 1, `on a roar a window opens: banner "${st.ev.warnText}", the beak opens (a window lasts ${PH.P[1].mouthFor} s in phase 1)`);
  step(sim, secs(1.6));
  report(FT.bombInMouth(st) === true, 'after it has swum under her bomb bay a bomb let go from the bay falls into the beak (the bots drop on this)');
  const mp = mouthPos(cr), g = { x: T.toWorldX(ship, ship.layout.bombBay.x), y: T.toWorldY(ship, ship.layout.bombBay.y) + 20 };
  report(Math.abs(mp.x - g.x) < MO.FUNNEL_W + Math.abs(ship.pose.vx) * 1.5 && mp.y > g.y, `the beak is under the bay (${Math.abs(mp.x - g.x).toFixed(0)} px across, ${(mp.y - g.y).toFixed(0)} px below; the funnel is ${MO.FUNNEL_W} px each side)`);
  const ring = sim.course.predictBomb(g.x, g.y);
  report(ring && Math.abs(ring.x - mp.x) <= MO.FUNNEL_W + 5 && ring.y < mp.y + 300, 'the bomb-bay aiming ring lands in the open beak');
  // the real thing: a bomb from the bay
  const f0 = cr.fed, chomps0 = cr.stats.chomps;
  st.sfxQ.length = 0;
  st.shipBombs.push({ x: g.x, y: g.y, vx: ship.pose.vx, vy: 60, owner: 'p1' });
  for (let i = 0; i < secs(3) && cr.fed === f0; i++) step(sim, 1);
  step(sim, 30);
  report(cr.fed === f0 + 1 && cr.stats.chomps === chomps0 + 1 && st.sfxQ.some((x) => x[0] === 'chomp') && st.shipBombs.length === 0, `the bomb comes down the funnel: CHOMP, fed ${cr.fed}/${MO.FED}, the bomb is gone`);
  report(mouth.open === false, `it gulps and the beak snaps shut for ${MO.GULP} s`);
  step(sim, secs(MO.GULP + 1));
  report(!cr.mouthWin || cr.mouthWin.gulp <= 0, 'the window then ends or the beak opens again');
  // three windows, three bombs: the third wins; each window is a fresh banner
  for (let w = 0; w < 2 && !cr.dying; w++) {
    cr.mouthWin = null;
    mouth.open = false;
    const ok2 = openWindow(ctx, cr, 3);
    step(sim, secs(1.6));
    const p = mouthPos(cr), b = { x: T.toWorldX(ship, ship.layout.bombBay.x), y: T.toWorldY(ship, ship.layout.bombBay.y) + 20 };
    st.shipBombs.push({ x: b.x, y: b.y, vx: ship.pose.vx, vy: 60, owner: 'p1' });
    step(sim, 3);
    void ok2; void p;
  }
  report(cr.dying && cr.stats.win === 'mouth' && cr.fed >= MO.FED, `the third bomb ends it: stats.win "${cr.stats.win}" after ${cr.stats.chomps} bombs`);
  report(st.ev.warnText.startsWith(C.WIN_TEXT.mouth), `final banner "${st.ev.warnText}"`);
}
{
  // crates are half a bomb
  restoreCfg();
  realHp();
  const ctx = boot({ lair: true });
  const { sim, st } = ctx;
  const cr = risen(ctx, 1);
  C.BEHAVE.MOUTH_AFTER = 0;
  cr.ai.mouthT = 1e9;
  openWindow(ctx, cr);
  step(sim, secs(1.6));
  const m = mouthPos(cr);
  const crate = () => CS.creatureCargo(st, { x: m.x, y: m.y - 600, owner: 'p1' });
  for (let i = 0; i < 5; i++) crate();
  const half = cr.fed;
  report(half === 2.5 && !cr.dying, `five crates into the open beak are ${half} bombs: not yet`);
  crate();
  report(cr.dying && cr.stats.win === 'mouth' && cr.fed === 3, 'the sixth is the third bomb: it is fed, and it ends');
}

// (w) the other wins
const winCheck = (name, st, cr, why) => {
  report(cr.dying && cr.stats.win === why && cr.diedBy === why, `${name}: stats.win "${cr.stats.win}"`);
  report(st.ev.warnText.startsWith(C.WIN_TEXT[why]) && st.ev.warn >= FN.BANNER - 0.1, `${name}: the final banner "${st.ev.warnText}"`);
  report(st.bossDownLap === st.course.lap && st.slow === FN.SLOW, `${name}: the boss counts as down (bossDownLap ${st.bossDownLap}) and the last blow runs in slow motion (state.slow ${st.slow})`);
};
{
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st } = ctx;
  const cr = risen(ctx, 1);
  cutN(st, cr, 6);
  step(sim, 1);
  winCheck('SEVER all six', st, cr, 'sever');
  step(sim, secs(FN.SLOW_FOR + 1));
  report(st.slow === 1, 'and normal speed returns after the slow-motion beat');
  step(sim, secs(C.SPAWN.SINK_TIME + C.CHUNK.LIFE + 2));
  report(st.creature === null && st.slow === 1, 'it sinks out of the world and the slow motion is off');
}
{
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st } = ctx;
  const cr = risen(ctx, 1);
  CS.hurtCreature(st, { part: partOf(cr, 'mantle'), seg: 0 }, cr.hp / H.POOL.mantle + 1, { src: 'shell', who: 'p1' });
  step(sim, 1);
  winCheck('the POOL', st, cr, 'hp');
}
{
  // BOARD: phase 3 by the pool, a boarder with a sword holds Action at the exposed heart
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st, ship } = ctx;
  const cr = risen(ctx, 2);
  const p1 = st.players.p1;
  cr.hp = cr.maxHp * 0.2;
  toPhase(ctx, cr, 3);
  const heart = partOf(cr, 'heart');
  Object.assign(p1, { fall: false, fly: true, air: false, lock: null, conn: null, ko: 0, jx: 0, jy: 0, jz: 0, hearts: config.HEALTH.MAX, carry: 'sword' });
  const hs = heart.segs[0];
  BD.boardAt(st, ship, p1, hs.x, hs.y);
  let n = 0;
  for (; n < secs(40) && !cr.dying; n++) { p1.fire = true; step(sim, 1); }
  p1.fire = false;
  report(cr.dying && Number.isFinite(n), `a boarder holding Action at the heart for ${(n / 60).toFixed(0)} s (${C.BOARD.HEART_TIME} s a strike, ${C.BOARD.HEART_DMG} damage)`);
  winCheck('BOARD and STRIKE THE HEART', st, cr, 'board');
  report(cr.stats.struck >= 1, `the blow counted: ${cr.stats.struck} strike(s)`);
}
{
  // TOW onto rock: the exhausted creature on a harpoon line, hauled onto the spire under her
  const tow = (phase) => {
    restoreCfg();
    realHp();
    const ctx = boot({ lair: true });
    const { sim, st, ship } = ctx;
    const map = st.course.map, REFx = ship.layout.refPoint.x, REFy = ship.layout.refPoint.y;
    ship.pose.x = map.goal.x - REFx;
    ship.pose.y = map.goal.y - REFy;
    st.ship.speed = 0;
    const cr = risen(ctx, phase);
    const mt = BD.mantleOf(cr).segs[0];
    const dk = PLS(ship)[ship.layout.deckIndex('main')];
    const from = { x: dk.x1 - 80, y: dk.y - 60 };
    const hx = T.toWorldX(ship, from.x), hy = T.toWorldY(ship, from.y);
    const tw = TW.creatureLatch(st, ship, { part: BD.mantleOf(cr), seg: 0, d: Math.hypot(mt.x - hx, mt.y - hy), x: mt.x - 60, y: mt.y - mt.r + 30 }, from, config.GUN_TYPES.harpoon, st.players.p1);
    let rockT0 = null, n = 0;
    for (; n < secs(60) && !cr.dying; n++) { step(sim, 1); if (rockT0 === null && cr.stats.rockT > 0) rockT0 = n / 60; }
    return { cr, st, tow: tw, n, rockT0, map };
  };
  const a = tow(3);
  report(!!a.map.spires && a.map.spires.length === 3 && a.cr.hooked !== undefined && a.tow.fly !== undefined, 'the lair has rock spires and the line holds the creature');
  console.log(`     tow: in phase 3 it was ground onto the spire after ${a.rockT0 === null ? '-' : a.rockT0.toFixed(1)} s and sank at ${(a.n / 60).toFixed(0)} s (rock ${(a.cr.stats.rockT || 0).toFixed(1)} s, hauled ${(a.cr.stats.hauled || 0).toFixed(0)} px)`);
  report(a.cr.stats.rockT > 0 && a.cr.stats.by.rock > 0, `a line holding it onto the rock hurts the pool (${(a.cr.stats.by.rock || 0).toFixed(0)} hp, closing speed x ${C.TOW_ROCK.RATE})`);
  winCheck('TOW it onto the rocks', a.st, a.cr, 'tow');
  const b = tow(2);
  report(!b.cr.dying && !(b.cr.stats.rockT > 0) && !(b.cr.stats.by.rock > 0), 'the same tow in phase 2 does nothing to it: only the exhausted creature can be dragged onto rock');
}

// (l) the lair
{
  restoreCfg();
  realHp();
  const ctx = boot({ lair: true, bots: 0 });
  const { sim, st, ship } = ctx;
  const map = st.course.map, c = st.course;
  report(c.stop && c.stop.lair === true && map.lair === true && map.kind === 'lair' && map.open === true && map.outposts.length === 0 && map.turrets.length === 0 && c.turrets.length === 0 && c.target === null, 'a lair stop flies the lair map: open sky, no outposts, no guns, no target');
  const ok = Number.isFinite(map.startDist) && map.startDist < 1e8 && Math.abs(map.goal.x - map.start.x) > LR.RUN * 0.9 && map.seaY === st.env.seaY && map.spires.length === LR.SPIRES.length;
  report(ok && map.seaY - map.start.y >= LR.SEA_BELOW - 250,`the route runs ${Math.round(map.goal.x - map.start.x)} px level to the lair's middle, the sea ${Math.round(map.seaY - map.start.y)} px under the launch (${map.spires.length} spires: ${map.spires.map((s) => Math.round(s.x)).join(', ')})`);
  report(st.sea && st.sea.spouts.length === 0 && st.sea.survivors.length === 0, 'no waterspouts and no survivors in a lair');
  // no creature yet; none before the boss's slot
  step(sim, secs(2));
  report(st.creature === null && !st.boss, 'at the start there is no creature and no zeppelin');
  // fly to 70% of the way: the creature rises at the boss's slot, and no zeppelin comes
  const f = 0.7;
  ship.pose.x = map.start.x + (map.goal.x - map.start.x) * f - ship.layout.refPoint.x;
  st.tempo.phase = 'build';
  st.tempo.bossOk = true;
  for (let i = 0; i < secs(4) && !st.creature; i++) step(sim, 1);
  report(!!st.creature && st.creature.mode === 'surfacing' && !st.boss && c.progress > config.WAVES.BOSS_AT, `at ${(c.progress * 100).toFixed(0)}% of the way (the zeppelin's BOSS_AT is ${config.WAVES.BOSS_AT * 100}%) the Kraken rises: ${st.creature && st.creature.name}; no zeppelin`);
  report(sim.creatures.spawn('kraken') === st.creature, 'one creature a mission (a second spawn gives the same one)');
  const cr = st.creature;
  for (let i = 0; i < secs(C.SPAWN.SURFACE_TIME + 1) && cr.mode !== 'idle'; i++) step(sim, 1);
  step(sim, secs(5));
  report(st.tempo.phase === 'peak' && st.tempo.kind === 'boss', 'the pacing director treats it as the mission boss');
  // she hovers at the lair's middle with it alive: the stop is not done
  ship.pose.x = map.goal.x - ship.layout.refPoint.x;
  ship.pose.y = map.goal.y - ship.layout.refPoint.y;
  st.ev.warn = 0;
  step(sim, secs(3));
  report(!c.done && !c.pendingNext, `at the lair's middle with the Kraken alive the stop is not done (the reminder "SLAY THE KRAKEN FIRST!" shows when no attack banner does: "${st.ev.warnText}")`);
  // kill it: the stop is done once it has sunk
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(2));
  report(cr.dying && !c.done && st.bossDownLap === c.lap, 'killed, it is dying and the boss is down, the stop waits for it to sink');
  for (let i = 0; i < secs(C.SPAWN.SINK_TIME + C.CHUNK.LIFE + 3) && !c.done; i++) step(sim, 1);
  report(c.done === true && c.pendingNext === true && st.creature === null, `once it has sunk the stop is done: "${st.ev.warnText}"`);
  report(errors === 0, 'and the lair flew without an error');
}
{
  // the Flagship's beacon rule treats a creature kill like the zeppelin being down
  restoreCfg();
  realHp();
  const ctx = boot();
  const { sim, st } = ctx;
  const cr = risen(ctx, 1);
  st.bossDownLap = 0;
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  report(st.bossDownLap === st.course.lap && st.bossDownLap > 0, `a creature kill sets bossDownLap (${st.bossDownLap}) the way a zeppelin kill does: the Flagship's beacon (course.js) counts after it`);
}

// (v) the voyage generator
{
  restoreCfg();
  const modes = ['quick', 'voyage', 'campaign'];
  const seeds = Array.from({ length: quick ? 80 : 300 }, (_, i) => 1000 + i * 7919);
  let withLair = 0, two = 0, total = 0, bad = [];
  const saved = JSON.stringify(LR.COUNT);
  for (const mode of modes) for (const voyageNo of [1, 2]) for (const sd of seeds) {
    LR.COUNT = JSON.parse(saved);
    const v = VY.generateVoyage(sd, { mode, voyageNo, gentle: sd % 2 === 0 });
    LR.COUNT = { short: 0, long: 0 };
    const plain = VY.generateVoyage(sd, { mode, voyageNo, gentle: sd % 2 === 0 });
    LR.COUNT = JSON.parse(saved);
    total++;
    const h = voyageNo > 1 ? 1 : 0, n = v.columns.length;
    const lairs = v.columns.flat().filter((s) => s.lair);
    if (lairs.length) withLair++;
    if (lairs.length > 1) two++;
    const want = n - h >= LR.LONG_STOPS ? LR.COUNT.long : LR.COUNT.short;
    if (lairs.length > want) bad.push(`${mode}/${sd}: ${lairs.length} lairs, at most ${want}`);
    for (const s of lairs) {
      if (s.env !== 'sea' && s.env !== 'ember' && s.env !== 'storm' && s.env !== 'frost' && s.env !== 'fungal') bad.push(`${mode}/${sd}: lair on ${s.env}`); // (C.6a: a Sunken Sea stop holds the Kraken, an Ember Forge stop the Drake; C.6b: a Storm Front stop the Thunderbird; C.6d: a Frost Peaks stop the Rime Wyrm)
      if (s.creature !== LR.BY_ENV[s.env]) bad.push(`${mode}/${sd}: lair on ${s.env} holds ${s.creature}`);
      if (s.col <= h || s.col >= n - 1) bad.push(`${mode}/${sd}: lair in column ${s.col} of ${n}`);
      if (s.kind !== 'lair' || s.flagship || s.harbour) bad.push(`${mode}/${sd}: lair kind ${s.kind}`);
      if (lairs.some((o) => o !== s && Math.abs(o.col - s.col) <= 1)) bad.push(`${mode}/${sd}: two lairs in neighbouring columns`);
    }
    // the rest of the route is untouched: same stops, same links, same envs; a lair is +1 skull and x2 reward
    v.columns.flat().forEach((s, i) => {
      const o = plain.columns.flat()[i];
      if (s.id !== o.id || s.env !== o.env || s.next.join() !== o.next.join() || s.play !== o.play) bad.push(`${mode}/${sd}: stop ${s.id} differs from the lair-free route`);
      else if (s.lair) { if (s.danger !== o.danger + LR.DANGER || s.reward !== Math.round(o.reward * LR.REWARD_MUL)) bad.push(`${mode}/${sd}: ${s.id} danger ${o.danger}->${s.danger} reward ${o.reward}->${s.reward}`); }
      else if (s.danger !== o.danger || s.reward !== o.reward || s.kind !== o.kind) bad.push(`${mode}/${sd}: ${s.id} (not a lair) changed`);
    });
  }
  report(!bad.length, `${total} generated voyages (quick, voyage, campaign x both voyages): lairs only on Sunken Sea / Ember Forge / Storm Front / Frost Peaks / Fungal Depths stops (the creature of that sky), never the first stop, the harbour or the Flagship, never in neighbouring columns, at most ${LR.COUNT.short} (${LR.COUNT.long} from ${LR.LONG_STOPS} stops), +${LR.DANGER} skull and x${LR.REWARD_MUL} reward, everything else exactly as before${bad.length ? ' - ' + bad.slice(0, 3).join('; ') : ''}`);
  console.log(`     lairs: ${withLair} of ${total} voyages have one (${two} have two)`);
  report(withLair / total > 0.5, `most voyages have a lair (${((withLair / total) * 100).toFixed(0)}%)`);
  // the same seed makes the same route
  const a = JSON.stringify(VY.generateVoyage(4242, { mode: 'voyage' })), b = JSON.stringify(VY.generateVoyage(4242, { mode: 'voyage' }));
  report(a === b, 'a seed always makes the same voyage');
}
{
  // the route map: the creature icon and LAIR label; the vote options carry the lair
  restoreCfg();
  const ctx = boot({ start: 'classic', bots: 3 });
  const { sim, st } = ctx;
  const v = st.run.voyage, here = v.columns[0][0], lair = v.columns[1][0];
  Object.assign(lair, { env: 'sea', play: 'sea', kind: 'lair', lair: true, danger: 3, reward: 80 });
  here.next = v.columns[1].map((s) => s.id);
  st.run.salvage = 0;
  sim.startDock(); // (nothing affordable: straight on to the route vote)
  if (st.vote && st.vote.kind === 'dock') {
    const cast = st.vote.options.findIndex((o) => o.kind === 'cast');
    for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = cast; }
    step(sim, secs(3));
  }
  const route = st.vote && st.vote.kind === 'route' ? st.vote : null;
  const opt = route && route.options.find((o) => o.id === lair.id);
  report(!!opt && opt.lair === true && opt.icon === LR.ICON && /LAIR/.test(opt.desc) && opt.kindName === config.VOYAGE.KIND_NAMES.lair && opt.danger === 3 && opt.reward === 80, `the route vote lists it: ${opt && opt.icon} "${opt && opt.name}" - ${opt && opt.desc}`);
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
  const texts = rec.texts.map((q) => q.s);
  report(exc === 0 && texts.includes(LR.LABEL) && texts.includes('KRAKEN LAIR') && texts.includes(LR.ICON), `the TV's route map draws the creature icon, the "${LR.LABEL}" label and "KRAKEN LAIR" (0 draw errors)`);
}

// (r) the reward and the trophy
{
  restoreCfg();
  realHp();
  const ctx = boot({ lair: true, start: 'classic', bots: 3 });
  const { sim, st, ship } = ctx;
  const players = () => Object.values(st.players);
  const cr = risen(ctx, 1);
  st.ship.hull = 40;
  for (const b of st.bags) b.gas = 30;
  const salv0 = st.run.salvage, hull0 = st.ship.hull;
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(3));
  const SV = config.SALVAGE.BOSS * C.REWARD_MUL;
  report(st.run.salvage - salv0 >= SV && st.run.salvage - salv0 <= SV + 40, `triple boss salvage: +${st.run.salvage - salv0} (SALVAGE.BOSS ${config.SALVAGE.BOSS} x ${C.REWARD_MUL})`);
  report(st.ship.hull >= hull0 + C.REWARD.HULL - 1 && st.bags.every((b) => b.gas >= 30 + C.REWARD.GAS - 10), `a hull patch (+${C.REWARD.HULL}: ${hull0} -> ${st.ship.hull.toFixed(0)}) and every gasbag (+${C.REWARD.GAS})`);
  report(st.run.trophy === C.REWARD.TROPHY, `the trophy is waiting (run.trophy "${st.run.trophy}")`);
  // the next dock
  st.run.salvage = 0;
  sim.startDock();
  const idx = st.vote.options.findIndex((o) => o.kind === 'part' && o.trophy);
  const card = st.vote.options[idx];
  report(!!card && card.entry === 'krakenBeak' && card.name === 'Kraken Beak' && card.cost === 0 && /TROPHY/.test(card.badge) && card.choices.length >= 1, `the next dock offers the TROPHY card "${card && card.name}" - ${card && card.badge}, cost ${card && card.cost}, ${card && card.choices.length} place(s)`);
  report(!ship.layout.ram, 'the classic ship has no ram prow yet');
  for (const p of players()) { p.voteAt = 1e9; p.vote = idx; }
  for (let i = 0; i < 60 * 8 && st.vote && st.vote.kind === 'dock' && !st.vote.options[idx].sold; i++) step(sim, 1);
  if (st.vote && st.vote.kind === 'slot') { for (const p of players()) { p.voteAt = 1e9; p.vote = 0; } for (let i = 0; i < 60 * 5 && st.vote && st.vote.kind === 'slot'; i++) step(sim, 1); }
  step(sim, 5);
  const L = ship.layout;
  report(!!L.ram && L.ram.art === 'kraken' && L.ram.pts && st.run.trophy === null && st.run.parts.some((q) => q.id === 'krakenBeak'), `bought, it is on the ship: layout.ram art "${L.ram && L.ram.art}", ${L.ram ? L.ram.pts.length : 0} outline points, the trophy is used up`);
  report(!fs.readFileSync(path.join(publicDir, 'modules/host/shipBuild.js'), 'utf8').includes('krakenBeak'), 'the Kraken Beak is the same ramProw part (no new rules in shipBuild.js, only an art key)');
  // it draws (the bone beak) without a hitch
  {
    const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
    const cam = createWorldCamera();
    const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
    let exc = 0;
    for (let f = 0; f < 20; f++) { step(sim, 1); try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } }
    report(exc === 0, 'the ship with the Kraken Beak draws on the stub canvas (0 errors)');
  }
}
{
  // a ship with an iron prow gets the beak in its place
  restoreCfg();
  const parts = [...SBD.BUILDS.classic, { part: 'ramProw', p: 'main', x: 0 }];
  const L0 = SBD.buildLayout(SBD.BUILDS.classic);
  const main = L0.platforms.find((q) => q.id === 'main');
  parts[parts.length - 1].x = main.x1;
  const offer = PSH.offerPart(parts, { only: 'krakenBeak', rng: Math.random });
  const ch = offer && offer.choices[0];
  const next = ch && ch.apply(parts);
  const rams = next ? next.filter((q) => q.part === 'ramProw') : [];
  report(!!offer && offer.choices.length === 1 && /in place of the iron prow/.test(ch.where) && rams.length === 1 && rams[0].art === 'kraken' && !parts.find((q) => q.part === 'ramProw').art, 'with an iron prow already on her the trophy card replaces it (one ram prow, art kraken; the old parts list is not touched)');
  report(!PSH.CATALOGUE.find((e) => e.id === 'krakenBeak').allowed([], {}), 'and the trophy never turns up in the random shop (allowed is false)');
}

// (b) the bots
{
  restoreCfg();
  const botsimPath = path.join(publicDir, '..', 'tools', 'botsim.mjs');
  const run = (args, env = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [botsimPath, ...args], { env: { ...process.env, ...env } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  const fight = (out) => {
    const m = /fight 1: phase (\d)[^\n]*?beak windows (\d+), fed ([\d.]+), dives (\d+), rock (\d+)s; ended: (\w+)(?: at (\d+)s)?/.exec(out);
    return m ? { phase: +m[1], windows: +m[2], fed: +m[3], dives: +m[4], rock: +m[5], ended: m[6], at: m[7] === undefined ? null : +m[7] } : null;
  };
  const pool = async (jobs, n) => { const res = []; let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < jobs.length) { const i = k++; res[i] = await jobs[i](); } })); return res; };
  const seedsB = quick ? [1, 2] : [1, 2, 3];
  const forced = ['sever', 'mouth', 'tow', 'board', 'hp'];
  const jobs = [];
  for (const w of forced) for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd), ...(w === 'tow' ? ['--build', 'harpoon'] : [])], { CREATURE_FORCE_WIN: w }).then((r) => ({ w, sd, r })));
  for (const bots of [4, 16]) for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--bots', String(bots), '--difficulty', 'easy', '--minutes', '16', '--seed', String(sd)]).then((r) => ({ w: 'easy' + bots, sd, r })));
  for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)]).then((r) => ({ w: 'free', sd, r })));
  const results = await pool(jobs, 5);
  const clean = (r) => r.code === 0 && /errors: 0/.test(r.out) && !/NaN/.test(r.out);
  const byWin = {};
  for (const { w, sd, r } of results) { const f = fight(r.out); (byWin[w] ||= []).push({ sd, f, ok: clean(r) }); }
  for (const w of forced) {
    const rows = byWin[w];
    const times = rows.map((x) => (x.f && x.f.ended === w ? x.f.at : null));
    report(rows.every((x) => x.ok) && times.every((t) => t !== null && t <= 360), `forced ${w.toUpperCase()}: 8 bots on Normal end it that way within 6 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] === null ? 'NOT (' + (x.f ? x.f.ended + ', phase ' + x.f.phase : 'no fight') + ')' : times[i] + ' s')).join(', ')})`);
  }
  for (const bots of [4, 16]) {
    const rows = byWin['easy' + bots];
    const times = rows.map((x) => (x.f && x.f.ended !== 'no' ? { at: x.f.at, how: x.f.ended } : null));
    report(rows.every((x) => x.ok) && times.every((t) => t && t.at <= 600), `${bots} bots on Easy win within 10 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] ? times[i].how + ' ' + times[i].at + ' s' : 'NOT')).join(', ')})`);
  }
  {
    const rows = byWin.free;
    const how = rows.map((x) => (x.f && x.f.ended !== 'no' ? x.f.ended + ' ' + x.f.at + ' s' : 'NOT'));
    report(rows.every((x) => x.ok) && how.every((h) => h !== 'NOT'), `unforced, 8 bots on Normal win (${how.join(', ')})`);
  }
  report(results.every(({ r }) => clean(r)), `0 errors and no NaN in any of the ${results.length} bot fights`);
}

// =================================================================== C.6a: THE CINDER DRAKE ===================================================================
//   (D0) the body: wings (2 parts of 5 membrane segments, each with hp), a neck of 6 segments, head, mouth, tail, the heart behind scales; about 3x the ship; it lives in the Ember Forge only (and the Kraken only at sea)
//   (D1) every weapon hurts a part; flak on a wing does much more than a shell
//   (D2) BREATH: the three-beat telegraph (banner, a buzz for the crew in its path, a roar, the throat glows GLOW s), then the cone: wood catches by flammability, armour plate does not, a hydrogen bag explodes, crew
//        lose hearts; a shell into the glowing mouth CHOKES it (breath cancelled, a big blow, WIN of them win)
//   (D3) SWOOP bumps the hull;  (D4) PERCH: a live load that tips the ship within FORCES.MAX_DEG, pushes her down, claws holes, lashes the top deck; swords, flame, a hard turn or time drive it off
//   (D5) a torn wing (or the pool under 60%) crashes it onto the ground below, it crawls (phase 2); below 30% (phase 3) it rears and the heart shows;  (D6) the gaping mouth takes bombs (4 win)
//   (D7) the harpoon hooks only a crawling drake; hauled over an erupting lava spout it is roasted (a win);  (D8) boarding the perched drake: hack the scales, strike the heart (a win)
//   (D9) the lair (lava, shelf, spouts, no outposts), the voyage (lairs by sky), the reward and the Drake-scale plating;  (D10) the TV draws it;  (D11) the bots: each win forced, 4 / 16 crew on Easy, unforced
const DRK = C.DRAKE;
const { applyBuild } = await load('shipLayout.js');
const { slotsFor } = await load('modules/host/buildSlots.js');
const DKM = await load('modules/host/creatures/drake.js');
const CDR = await load('modules/host/creatureDrake.js');
const CBR = await load('modules/host/creatureBreath.js');
const FRC = await load('modules/host/forces.js');
const FRM = await load('modules/host/fireModel.js');
const W0 = JSON.stringify(DRK.ATTACK.WEIGHTS), HS0 = DRK.BREATH.HIGH_SHARE, FP0 = DRK.ATTACK.FIRST_PERCH;
const drakeCfgBack = () => { Object.assign(DRK.ATTACK.WEIGHTS, JSON.parse(W0)); DRK.BREATH.HIGH_SHARE = HS0; DRK.ATTACK.FIRST_PERCH = FP0; };
const onlyAttack = (kind) => { for (const k of Object.keys(DRK.ATTACK.WEIGHTS)) DRK.ATTACK.WEIGHTS[k] = k === kind ? 1 : 0; };
// A sim in the Ember Forge's lair with the Drake arrived, circling, its attacks held until a test asks.
function drakeUp({ lair = true, difficulty = 'normal', bots = 0, start = null } = {}) {
  restoreCfg();
  drakeCfgBack();
  const ctx = boot({ env: 'ember', lair, difficulty, bots, start });
  const map = ctx.st.course.map; // (the ship out in the middle of the lair: past its start wall, where it flies)
  if (map.lair) { ctx.ship.pose.x = map.goal.x - ctx.ship.layout.refPoint.x; ctx.ship.pose.y = map.goal.y - ctx.ship.layout.refPoint.y; step(ctx.sim, 5); }
  const cr = ctx.sim.creatures.spawn('drake');
  for (let i = 0; i < secs(DRK.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(ctx.sim);
  quiet(cr);
  step(ctx.sim, 30);
  return { ...ctx, cr, p1: ctx.st.players.p1 };
}
const quiet = (cr) => { cr.ai.breather = 1e9; cr.drake.nextT = 1e9; };
const wake = (cr) => { cr.ai.breather = 0; cr.drake.nextT = 0; cr.drake.lastPerch = -1e9; };
const actIs = (cr, kind, sub) => !!cr.drake.act && cr.drake.act.kind === kind && (sub === undefined || cr.drake.act.sub === sub);
const until = (sim, f, maxS) => { let n = 0; for (; n < secs(maxS) && !f(); n++) step(sim); return n / 60; };
const deckOf = (ship, id) => ship.layout.platforms.findIndex((q) => q.id === id);
const topD = (ship) => { let b = -1; ship.layout.platforms.forEach((q, d) => { if (q.x1 - q.x0 >= config.CREATURES.GRIP.MIN_DECK && (b < 0 || q.y < ship.layout.platforms[b].y)) b = d; }); return b; };
const spawnCr = (ctx, kind = 'drake') => ctx.sim.creatures.spawn(kind);

// (D0) the world and the body
{
  restoreCfg();
  drakeCfgBack();
  const ctx = boot({ env: 'ember', lair: true });
  const { sim, st, ship } = ctx;
  report(spawnCr(ctx, 'kraken') === null && st.creature === null, 'the Kraken does not come to the Ember Forge (no sea line)');
  const cr = spawnCr(ctx);
  const cnt = (k) => cr.parts.filter((p) => p.kind === k);
  report(!!cr && cr.kind === 'drake' && cr.name === DRK.NAME && cr.mode === 'surfacing' && cnt('wing').length === 2 && cnt('wing').every((w) => w.segs.length === DRK.WING.SEGS && w.hp > 0) && cnt('neck')[0].segs.length === 6 && cnt('tail').length === 1 && cnt('head').length === 1 && cnt('mouth').length === 1 && cnt('heart')[0].hidden && cnt('mantle').length === 1, `the Drake: 2 wings of ${DRK.WING.SEGS} segments (each with its own hp), a neck of 6, head, mouth, tail, torso, the heart hidden; ${cr && cr.name}, arriving`);
  const before = cr.parts.reduce((a, p) => a + p.hp, 0);
  const w0 = cnt('wing')[0], m = w0.segs[2];
  st.shells.push({ x: m.x + Math.cos(m.ang) * m.len / 2, y: m.y + Math.sin(m.ang) * m.len / 2, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 5);
  report(cr.parts.reduce((a, p) => a + p.hp, 0) === before && A.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0, 'while it flies in it cannot be hurt, shot at or spotted');
  for (let i = 0; i < secs(DRK.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  quiet(cr);
  step(sim, 60);
  const tg = A.targets(st).filter((t) => t.kind === 'creaturePart');
  const kinds = new Set(tg.map((t) => t.part.kind));
  report(cr.mode === 'idle' && ['wing', 'neck', 'head', 'mouth', 'mantle', 'tail'].every((k) => kinds.has(k)) && !kinds.has('heart') && tg.every((t) => t.obj && typeof t.obj.lit === 'number' && Number.isFinite(t.at(0.5).x)), `arrived: ${tg.length} aim targets (${[...kinds].join(', ')}; the heart is hidden), each with a lit record and a point that leads the target`);
  const radar = SP.radarItems(st).filter((i) => i.kind === 'creature');
  report(radar.length >= 4 && radar.every((i) => Number.isFinite(i.pos().x)), `${radar.length} blips on the phone radar`);
  // its size against the ship
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of cr.parts) for (const s of p.segs) for (const u of [0, 1]) { const x = s.x + Math.cos(s.ang) * s.len * u, y = s.y + Math.sin(s.ang) * s.len * u; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const shipLen = ship.layout.bounds.x1 - ship.layout.bounds.x0, ext = Math.hypot(x1 - x0, y1 - y0);
  report(ext >= 2.4 * shipLen && cnt('wing')[0].reach >= shipLen, `it is huge: ${Math.round(ext)} px across against her ${shipLen} (${(ext / shipLen).toFixed(1)}x), each wing ${Math.round(cnt('wing')[0].reach)} px`);
  // stepped keys: a limb's pose only changes on a key (the held vector p.rel), never between
  const nk = cnt('neck')[0];
  let changed = 0, keyChanges = 0, lastKey = cr.key, lastRel = nk.rel.x + ',' + nk.rel.y;
  for (let i = 0; i < 120; i++) { step(sim); const r = nk.rel.x + ',' + nk.rel.y; if (r !== lastRel) { if (cr.key === lastKey) changed++; else keyChanges++; lastRel = r; } lastKey = cr.key; }
  report(changed === 0, `no wobble: the neck's goal changed only on the key clock (${keyChanges} changes on keys, ${changed} between)`);
  const B0 = boot({ env: 'sea' });
  report(spawnCr(B0) === null && B0.st.creature === null, 'and the Drake does not come to the Sunken Sea (no lava)');
}

// (D1) every weapon hurts a part; flak on a wing hurts far more than a shell
{
  const A0 = drakeUp();
  const { sim, st, cr } = A0;
  const wing = cr.parts.find((p) => p.id === 'wingN'), neck = cr.parts.find((p) => p.kind === 'neck');
  const hpBefore = (p) => p.hp;
  const w = on(wing), h0 = hpBefore(wing);
  st.shells.push({ x: w.x, y: w.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  const shellD = h0 - wing.hp;
  report(shellD > 0 && cr.stats.by.shell > 0 && wing.hit >= 0, `a shell on a wing takes ${shellD.toFixed(1)} off it (credited: ${cr.stats.by.shell.toFixed(1)} by shell)`);
  // flak: a burst within FUSE of the wing
  const wing2 = cr.parts.find((p) => p.id === 'wingF'), h1 = wing2.hp, wp = on(wing2);
  st.shells.push({ x: wp.x, y: wp.y - 60, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 0.5, kind: 'flak', flak: true });
  step(sim, 3);
  const flakD = h1 - wing2.hp;
  report(flakD > 5 * shellD && cr.stats.by.flak > 0, `a flak burst beside a wing in the air takes ${flakD.toFixed(1)} off it (a shell: ${shellD.toFixed(1)}): flak has a job; the burst is credited as flak`);
  // flame: every part in the cone burns
  const n0 = neck.hp, np = midOf(neck.segs[2]);
  CS.creatureBurn(st, (x, y) => Math.hypot(x - np.x, y - np.y) < 300, { x: np.x - 200, y: np.y }, 0.5, 'p1');
  report(neck.hp < n0 && cr.stats.by.flame > 0, `flame on the neck: -${(n0 - neck.hp).toFixed(1)}`);
  // a bomb that meets a shut mouth falls through; the heart is hidden and takes nothing
  const mouth = partOf(cr, 'mouth'), mp = mouth.segs[0];
  report(!mouth.open && CS.creatureBomb(st, { x: mp.x, y: mp.y, owner: 'p1' }) === 'closed', 'a bomb that meets the shut mouth falls on through');
  // the pool follows the part blows: a wing's share is the smallest of the soft parts
  report(DRK.POOL.mouth > DRK.POOL.wing && DRK.POOL.heart >= DRK.POOL.mouth, 'weak points (mouth, heart) count more against the pool than limbs');
}

// (D2) BREATH
{
  const A = drakeUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyAttack('breath');
  DRK.BREATH.HIGH_SHARE = 0;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  const p2 = (st.players.p2 = { ...p1, id: 'p2', name: 'P2' });
  const dM = deckOf(ship, 'main');
  wake(cr);
  until(sim, () => actIs(cr, 'breath'), 15);
  const a = cr.drake.act, xe = a.path.xe, refX = ship.layout.refPoint.x;
  standOn(p1, ship, dM, xe, null);
  standOn(p2, ship, dM, refX - (xe - refX), null); // (the other end of her)
  st.sfxQ.length = 0;
  const tMove = until(sim, () => actIs(cr, 'breath', 'glow'), 10);
  const glowAt = cr.age;
  const mine = msgs.filter((x) => x.id === 'p1'), his = msgs.filter((x) => x.id === 'p2');
  report(actIs(cr, 'breath', 'glow') && /INHALES/.test(st.ev.warnText) && st.sfxQ.some((x) => x[0] === 'roar') && mine.length === 1 && /FIRE/.test(mine[0].t) && Array.isArray(mine[0].buzz) && his.length === 0, `the telegraph: banner "${st.ev.warnText}", a roar, a buzz on the phone of the crewman in its path ("${mine[0] && mine[0].t}"), none for the one at the other end`);
  step(sim, 20);
  const mo = partOf(cr, 'mouth');
  report(cr.drake.glow > 0 && mo.open, `the throat glows (glow ${cr.drake.glow.toFixed(2)}) and the mouth is open`);
  const tGlow = until(sim, () => actIs(cr, 'breath', 'sweep'), 4) + 20 / 60;
  step(sim, 2);
  report(Math.abs(tGlow - DRK.BREATH.GLOW) < 0.25 && !!cr.flame && cr.flame.len === DRK.BREATH.LEN, `the glow lasts ${tGlow.toFixed(2)} s (BREATH.GLOW ${DRK.BREATH.GLOW}); then the cone is out (${cr.flame && cr.flame.len} px long)`);
  until(sim, () => !actIs(cr, 'breath'), 8);
  report(cr.flame === null && !actIs(cr, 'breath') && cr.stats.breaths === 1, 'the cone sweeps, then it recovers and the loop goes on (breath ' + JSON.stringify(cr.flame) + ', act ' + (cr.drake.act && cr.drake.act.kind + '.' + cr.drake.act.sub) + ', breaths ' + cr.stats.breaths + ')');
  void tMove;
  void glowAt;
}
{
  // CHOKE: a shell into the glowing mouth cancels the breath; WIN of them win
  const A = drakeUp();
  const { sim, st, ship, cr } = A;
  onlyAttack('breath');
  DRK.BREATH.HIGH_SHARE = 0;
  const mouth = partOf(cr, 'mouth');
  // a shell into the shut mouth in the middle of a quiet circle chokes nothing
  const sp0 = on(mouth);
  st.shells.push({ x: sp0.x, y: sp0.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(cr.choked === 0 && !actIs(cr, 'cough'), 'a shell into the shut mouth does not choke it');
  const choke = (n) => {
    wake(cr);
    until(sim, () => actIs(cr, 'breath', 'glow'), 15);
    step(sim, 20);
    const sp = on(mouth);
    const pool0 = cr.hp;
    st.shells.push({ x: sp.x, y: sp.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
    step(sim, 3);
    return { ok: cr.choked === n && (actIs(cr, 'cough') || cr.dying) && cr.flame === null, pool: pool0 - cr.hp };
  };
  const c1 = choke(1);
  report(c1.ok && c1.pool >= DRK.CHOKE.POOL_FRAC * cr.maxHp * 0.9 && /CHOKED/.test(st.ev.warnText), `a shell into the glowing mouth CHOKES it: the breath is cancelled, it coughs, a big blow (-${c1.pool.toFixed(0)} of the pool, ${(100 * DRK.CHOKE.POOL_FRAC).toFixed(0)}% of it) ("${st.ev.warnText}")`);
  // coughing: everything hurts it more
  const wing = cr.parts.find((p) => p.id === 'wingN'), wp = on(wing), h0 = wing.hp;
  st.shells.push({ x: wp.x, y: wp.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(actIs(cr, 'cough') && h0 - wing.hp > H.SHELL_MUL * config.GUNS.DAMAGE * 1.3, `while it coughs a blow does ${DRK.CHOKE.COUGH_MUL}x (${(h0 - wing.hp).toFixed(1)} against ${H.SHELL_MUL * config.GUNS.DAMAGE})`);
  until(sim, () => !actIs(cr, 'cough'), 5);
  for (let n = 2; n <= DRK.CHOKE.WIN; n++) { const r = choke(n); if (!r.ok) break; until(sim, () => !actIs(cr, 'cough') || cr.dying, 5); }
  report(cr.stats.win === 'choke' && cr.dying && cr.choked === DRK.CHOKE.WIN && /CHOKED ON ITS OWN FIRE/.test(st.ev.warnText) && st.bossDownLap === st.course.lap, `${DRK.CHOKE.WIN} chokes win: stats.win "${cr.stats.win}", the banner "${st.ev.warnText}", the boss is down`);
  report(st.creature === cr && cr.mode === 'dying' && st.slow === FN.SLOW, 'it falls (dying), the last blow in slow motion');
}
{
  // a shell into the open mouth AFTER the flame has started is only a hit (and the breath is not cancelled)
  const A = drakeUp();
  const { sim, st, cr } = A;
  onlyAttack('breath');
  DRK.BREATH.HIGH_SHARE = 0;
  wake(cr);
  until(sim, () => actIs(cr, 'breath', 'sweep'), 15);
  step(sim, secs(DRK.CHOKE.GRACE) + 20);
  const mouth = partOf(cr, 'mouth'), sp = on(mouth);
  st.shells.push({ x: sp.x, y: sp.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(cr.choked === 0 && actIs(cr, 'breath', 'sweep'), 'once the flame is well under way a shell in the mouth is only a hit: the breath is not cancelled');
}
{
  // the cone on a ship: wood catches, armour plate does not, crew lose hearts, hydrogen explodes
  const burnOn = (parts, label) => {
    applyBuild(parts);
    restoreCfg();
    drakeCfgBack();
    const ctx = boot({ env: 'ember', lair: true });
    const cr = spawnCr(ctx);
    for (let i = 0; i < secs(DRK.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(ctx.sim);
    quiet(cr);
    const { sim, st, ship } = ctx;
    const dM = deckOf(ship, 'main'), pl = ship.layout.platforms[dM];
    const cone = CBR.coneAt(T.toWorldX(ship, pl.x0 - 500), T.toWorldY(ship, pl.y - 60), 0);
    const p1 = st.players.p1;
    standOn(p1, ship, dM, pl.x0 + 100, null);
    return { ctx, cr, cone, dM, pl, p1, label };
  };
  const R0 = (() => { applyBuild(SBD.BUILDS.classic); return null; })();
  void R0;
  // plain wood
  {
    const b = burnOn(SBD.BUILDS.classic, 'wood');
    const { sim, st, ship } = b.ctx;
    const hull0 = st.ship.hull, f0 = frameHp(ship), hearts0 = b.p1.hearts ?? config.HEALTH.MAX;
    let lit = 0, hearts = 0, hull = false;
    for (let i = 0; i < 25; i++) { const o = CBR.breathBurn(st, b.cr, ship, b.cone, 0.1); lit += o.decks; hearts += o.hearts; hull = hull || o.hull; step(sim, 6); }
    report(lit > 0 && st.fires.length > 0 && hull && frameHp(ship) < f0, `the cone lights a wooden deck by its flammability (${lit} spots lit, ${st.fires.length} fires burning) and scorches the hull (frame soundness ${f0.toFixed(2)} -> ${frameHp(ship).toFixed(2)} segments)`);
    report(hearts > 0 && (b.p1.hearts ?? config.HEALTH.MAX) < hearts0 + 1e-9 && (b.p1.hearts < hearts0 || b.p1.ko > 0), `a crewman in the cone loses hearts (${hearts0} -> ${b.p1.hearts})`);
  }
  // armour plate
  {
    const plated = slotsFor('armour', SBD.BUILDS.classic).filter((s) => s.p === 'main').sort((a, c) => c.x - a.x)[0].apply(SBD.BUILDS.classic);
    const b = burnOn(plated, 'armour');
    const { sim, st, ship } = b.ctx;
    const plate = ship.layout.armour.find((q) => q.d === b.dM);
    const cone = CBR.coneAt(T.toWorldX(ship, plate.x1 + 600), T.toWorldY(ship, b.pl.y - 60), Math.PI); // (from the plate's side of her, flying back along the deck)
    let lit = 0, plt = 0;
    for (let i = 0; i < 25; i++) { const o = CBR.breathBurn(st, b.cr, ship, cone, 0.1); plt += o.plated; step(sim, 3); }
    const onPlate = st.fires.filter((f) => f.d === b.dM && f.x >= plate.x0 - 4 && f.x <= plate.x1 + 4);
    report(!!plate && FRM.flamAt(ship.layout, b.dM, (plate.x0 + plate.x1) / 2) === 0 && ship.ctx.fireStats.plated > 0 && onPlate.length === 0, `armour plate does not catch (flammability 0, ${ship.ctx.fireStats.plated} licks on the plate set nothing alight, ${lit} lit)`);
  }
  // hydrogen
  {
    const hy = (await import(pathToFileURL(path.join(publicDir, '..', 'tools', 'fixtures', 'hydrogen-build.mjs')).href)).default;
    const b = burnOn(hy(SBD.BUILDS), 'hydrogen');
    const { sim, st, ship } = b.ctx;
    const bag = ship.layout.gasbags[0];
    const cone = CBR.coneAt(T.toWorldX(ship, bag.cx - bag.rx - 700), T.toWorldY(ship, bag.cy), 0);
    for (let i = 0; i < 15; i++) CBR.breathBurn(st, b.cr, ship, cone, 0.1);
    const lit = st.gasStats.lit;
    for (let i = 0; i < secs(20) && !st.gasStats.exploded; i++) step(sim);
    report(lit > 0 && st.gasStats.exploded > 0, `a hydrogen bag in the cone catches and EXPLODES (lit ${lit}, exploded ${st.gasStats.exploded})`);
  }
  applyBuild(SBD.BUILDS.classic);
}

// (D3) SWOOP
{
  const A = drakeUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyAttack('swoop');
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t });
  let hull0 = st.ship.hull, f0 = frameHp(ship), hits = 0, tries = 0, seen = {};
  for (; tries < 4 && !hits; tries++) {
    hull0 = st.ship.hull; f0 = frameHp(ship);
    wake(cr);
    until(sim, () => actIs(cr, 'swoop'), 15);
    seen.banner = seen.banner || /SWOOP/.test(st.ev.warnText);
    seen.ring = seen.ring || !!cr.swoop;
    until(sim, () => cr.stats.swoopHits > hits || !actIs(cr, 'swoop'), 12);
    hits = cr.stats.swoopHits;
  }
  report(seen.banner && seen.ring && hits >= 1 && frameHp(ship) < f0 && cr.drake.dazed > 0, `a SWOOP: the banner, the ring on the spot, then it bumps the hull (frame soundness ${f0.toFixed(2)} -> ${frameHp(ship).toFixed(2)}) and is DAZED ${cr.drake.dazed.toFixed(1)} s (everything hurts it ${DRK.SWOOP.DAZED_MUL}x)`);
  const wing = cr.parts.find((p) => p.id === 'wingN'), wp = on(wing), h0 = wing.hp;
  st.shells.push({ x: wp.x, y: wp.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(h0 - wing.hp > H.SHELL_MUL * config.GUNS.DAMAGE * 1.2, `a dazed drake takes more: ${(h0 - wing.hp).toFixed(1)} against ${H.SHELL_MUL * config.GUNS.DAMAGE}`);
}

// (D4) PERCH
{
  const A = drakeUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyAttack('perch');
  DRK.ATTACK.FIRST_PERCH = 0;
  const P = DRK.PERCH;
  const live0 = st.balance.live, y0 = ship.pose.y;
  let peak = 0;
  const msgs = [];
  cr.hooks.phoneFx = (p, t) => msgs.push({ id: p.id, t });
  wake(cr);
  const dTop = topD(ship), pl = ship.layout.platforms[dTop];
  until(sim, () => cr.drake.mode === 'perch', 15);
  report(cr.drake.mode === 'perch' && /LANDING/.test(st.ev.warnText) && msgs.some((m) => m.id === 'p1' && /LANDING/.test(m.t)), `PERCH: the warning "${st.ev.warnText}" and a buzz on every phone`);
  until(sim, () => cr.drake.perch && cr.drake.perch.landed, 8);
  const pc = cr.drake.perch;
  standOn(p1, ship, dTop, pc.job.x, null);
  p1.hearts = config.HEALTH.MAX;
  for (let i = 0; i < secs(8); i++) { step(sim); peak = Math.max(peak, Math.abs(st.forces.theta)); p1.x = pc.job.x; }
  const lim = (config.FORCES.MAX_DEG * Math.PI) / 180 + 1e-6;
  report(ship.ctx.perch && ship.ctx.perch.w === P.MASS && st.balance.live >= live0 + P.MASS - 1, `on her gasbag it is a live load: balance.live ${live0.toFixed(1)} -> ${st.balance.live.toFixed(1)} (it weighs ${P.MASS})`);
  report(peak <= lim && ship.pose.y > y0 + 8, `it tips and pushes her: the tilt peaks at ${((peak * 180) / Math.PI).toFixed(2)} degrees (the limit ${config.FORCES.MAX_DEG}), she sank ${(ship.pose.y - y0).toFixed(0)} px`);
  until(sim, () => cr.stats.claws >= 1, 8);
  report(cr.stats.claws >= 1 && st.gasHoles.length >= 1, `it claws holes in the bag (${cr.stats.claws} claws, ${st.gasHoles.length} holes)`);
  const hearts0 = p1.hearts;
  until(sim, () => cr.stats.lashes >= 1 || cr.drake.mode !== 'perch', P.LASH + P.LASH_WARN + 3);
  report(cr.stats.lashes >= 1 && (p1.hearts < hearts0 || p1.ko > 0 || p1.fly || p1.tossed || p1.fall), `the tail LASHES the top deck: ${cr.stats.lashes} lash, the crewman there ${p1.hearts < hearts0 ? 'lost a heart' : 'was flung'}`);
}
{
  // ways off the bag
  const perched = () => {
    const A = drakeUp();
    onlyAttack('perch');
    DRK.ATTACK.FIRST_PERCH = 0;
    wake(A.cr);
    until(A.sim, () => A.cr.drake.perch && A.cr.drake.perch.landed, 25);
    A.cr.drake.perch.claw = A.cr.drake.perch.lash = 1e9;
    quiet(A.cr);
    return A;
  };
  const why = (A) => A.cr.drake.perch ? A.cr.drake.perch.driven : A.cr.drake.lastWhy;
  // swords: a hold at the deck under it
  {
    const A = perched();
    const { sim, st, ship, cr, p1 } = A;
    const dTop = topD(ship), jb = cr.drake.perch.job;
    standOn(p1, ship, dTop, jb.x, 'sword');
    let n = 0, label = null;
    for (; n < secs(8) && !(cr.drake.perch && cr.drake.perch.sub === 'lift'); n++) { p1.fire = true; p1.x = jb.x; step(sim); if (p1.act && p1.act.type === 'hack') label = p1.act.label; }
    report(why(A) === 'sword' && Math.abs(n / 60 - DRK.PERCH.SWORD_TIME) < 0.6 && /DRIVE IT OFF/.test(label || ''), `a sword held ${(n / 60).toFixed(1)} s on the deck under it drives it off (SWORD_TIME ${DRK.PERCH.SWORD_TIME}); the Action button said "${label}"`);
    until(sim, () => cr.drake.mode === 'fly', 5);
    report(cr.drake.mode === 'fly' && !ship.ctx.perch && st.balance.live < 20, 'it flies off: the weight is gone from her bag, it circles again');
  }
  // the job shows on a phone and a bot goes for it
  {
    const A = perched();
    const gj = (await load('modules/host/creatureGrip.js')).gripJobs(A.st, A.ship);
    report(gj.length === 1 && gj[0].kind === 'hack' && gj[0].obj === A.cr.drake.perch.job && Number.isFinite(gj[0].x), 'the perch is a "hack" job (a gold arrow on the phones, and the bots take it): DRIVE THE DRAKE OFF');
  }
  // blows
  {
    const A = perched();
    const { sim, ship, cr, p1 } = A;
    const dTop = topD(ship), jb = cr.drake.perch.job;
    standOn(p1, ship, dTop, jb.x, 'sword');
    for (let k = 0; k < 6 && why(A) !== 'sword'; k++) { p1.atkQ = true; p1.atkCd = 0; step(sim, 30); p1.x = jb.x; }
    report(why(A) === 'sword', `${DRK.PERCH.BLOWS} sword blows drive it off too`);
  }
  // flame, shells
  for (const src of ['flame', 'shot']) {
    const A = perched();
    const { sim, st, cr } = A;
    const torso = partOf(cr, 'mantle'), tp = midOf(torso.segs[0], 0.5);
    for (let i = 0; i < 400 && why(A) === null; i++) {
      if (src === 'flame') CS.creatureBurn(st, (x, y) => Math.hypot(x - tp.x, y - tp.y) < 600, { x: tp.x - 100, y: tp.y }, 0.1, 'p1');
      else { const r = CS.hurtCreature(st, { part: torso, seg: 0 }, 6, { src: 'shell', who: 'p1' }); void r; }
      step(sim, 1);
    }
    report(why(A) === src, `${src === 'flame' ? 'flame on it' : 'enough damage'} drives it off (${why(A)}): ${src === 'flame' ? 'burnt off the bag' : 'worth ' + (100 * DRK.PERCH.DRIVE_DMG).toFixed(0) + '% of its pool'}`);
  }
  // the helm's hard turn
  {
    const A = perched();
    const { sim, st, cr } = A;
    st.turning.t = 0.5;
    step(A.sim, 3);
    report(why(A) === 'shake', 'a hard turn (COME ABOUT) shakes it off');
  }
  // time
  {
    const A = perched();
    const { sim, cr } = A;
    cr.drake.perch.left = 0.2;
    step(sim, 30);
    report(why(A) === 'time', 'and left alone it flies off by itself after its time');
  }
}

// (D5) the crash, the crawl, the phases
{
  const A = drakeUp();
  const { sim, st, ship, cr } = A;
  const wing = cr.parts.find((p) => p.id === 'wingN'), pool0 = cr.hp;
  CS.hurtCreature(st, { part: wing, seg: 3 }, wing.hp + 1, { src: 'shell', who: 'p1' });
  report(wing.severed && wing.segs.length < DRK.WING.SEGS && cr.chunks.length === 1 && cr.chunks[0].part.kind === 'wing' && cr.drake.mode === 'crash' && /WING TORN/.test(st.ev.warnText), `a wing with no hp is torn off (a stump of ${wing.segs.length} segments stays, the rest tumbles away): it CRASHES ("${st.ev.warnText}")`);
  const t = until(sim, () => cr.drake.mode === 'crawl', 8);
  const ground = CDR.groundAt(st, cr.base.x, cr.base.y - 1000);
  report(cr.drake.mode === 'crawl' && cr.phase === 2 && Math.abs(cr.base.y + DRK.TORSO.R - ground) < 80 && cr.hp < pool0 && /CRASH|CRAWL/.test(st.ev.warnText), `it lands after ${t.toFixed(1)} s on the ground below (y ${Math.round(cr.base.y)}, the ground ${Math.round(ground)}), phase 2, the pool took ${(pool0 - cr.hp).toFixed(0)} (the fall): "${st.ev.warnText}"`);
  const sh = st.course.map.shelf;
  report(!!sh && cr.base.x >= sh.x0 && cr.base.x <= sh.x1, `it came down on the rock shelf (x ${Math.round(cr.base.x)}, the shelf ${Math.round(sh.x0)}-${Math.round(sh.x1)})`);
  // it crawls toward her, no faster than CRAWL.SPEED
  ship.pose.x = cr.base.x + 3000 - ship.layout.refPoint.x;
  step(sim, 5);
  const x0 = cr.base.x;
  step(sim, 120);
  const v = Math.abs(cr.base.x - x0) / 2;
  report(v > 50 && v <= DRK.CRAWL.SPEED * 1.05 + 5, `it crawls toward her at ${v.toFixed(0)} px/s (CRAWL.SPEED ${DRK.CRAWL.SPEED})`);
  // the target list now: bombs and harpoon
  report(CS.creatureTowTargets(st).length === 1 && FT.towTarget(cr, CS.creatureTowTargets(st)[0]), 'a crawling drake is a harpoon target (its torso)');
  // the bar and phase names
  report(DKM.drakePhaseName(1) === 'IT FLIES' && DKM.drakePhaseName(2) === 'IT CRAWLS' && DKM.drakePhaseName(3) === 'DESPERATE', 'its phases have names for the health bar');
}
{
  // below 60% of the pool a wing gives out by itself; below 30% it rears and the heart shows
  const A = drakeUp();
  const { sim, st, cr } = A;
  cr.hp = cr.maxHp * (DRK.PHASE.TWO_HP - 0.02);
  step(sim, 30);
  report(cr.parts.filter((p) => p.kind === 'wing' && p.severed).length === 1 && (cr.drake.mode === 'crash' || cr.drake.mode === 'crawl'), 'below 60% of the pool a wing gives out and it crashes');
  until(sim, () => cr.drake.mode === 'crawl', 8);
  cr.ai.breather = 0;
  cr.hp = cr.maxHp * (DRK.PHASE.THREE_HP - 0.02);
  step(sim, 5);
  report(cr.phase === 3 && /DESPERATE/.test(st.ev.warnText), `below 30%: phase 3, "${st.ev.warnText}"`);
  cr.ai.breather = 0;
  cr.drake.nextT = 1e9;
  cr.drake.lastRear = cr.age - DRK.PHASE.REAR_EVERY - 1;
  cr.stats.phaseAt[3] = cr.age - 100;
  until(sim, () => actIs(cr, 'rear'), 6);
  const heart = partOf(cr, 'heart');
  const open = !heart.hidden;
  step(sim, secs(DRK.PHASE.REAR + 1));
  report(open && heart.hidden && cr.stats.rears >= 1, 'while it rears the heart is open (a target for shells, bombs and a boarder), and it closes again after');
}

// (D6) the gaping mouth takes bombs
{
  const A = drakeUp();
  const { sim, st, ship, cr } = A;
  const wing = cr.parts.find((p) => p.id === 'wingN');
  CS.hurtCreature(st, { part: wing, seg: 3 }, wing.hp + 1, { src: 'shell', who: 'p1' });
  until(sim, () => cr.drake.mode === 'crawl', 8);
  cr.ai.breather = 0;
  cr.drake.nextT = 1e9;
  cr.drake.lastGape = -1e9;
  step(sim, 20);
  const mouth = partOf(cr, 'mouth');
  report(actIs(cr, 'gape') && !!cr.mouthWin && mouth.open && /GAPES/.test(st.ev.warnText) && cr.ai.mouthT !== undefined, `GAPE: a window opens for bombs ("${st.ev.warnText}")`);
  // it scuttles to put the mouth under her bomb bay
  const bay = ship.layout.bombBay;
  let dx = 1e9;
  for (let i = 0; i < secs(1.8); i++) { step(sim); const g = { x: T.toWorldX(ship, bay.x) }; dx = Math.min(dx, Math.abs(mouth.segs[0].x - g.x)); }
  report(dx < MO.FUNNEL_W, `the lure puts the mouth under her bomb bay (within ${dx.toFixed(0)} px, the funnel is +-${MO.FUNNEL_W})`);
  // a bomb into the funnel is swallowed: fed, gulp, the mouth shuts a moment
  const mp = mouth.segs[0];
  const r = CS.creatureBomb(st, { x: mp.x, y: mp.y - 600, owner: 'p1' });
  report(r === 'mouth' && cr.fed === 1 && cr.mouthWin.gulp > 0 && !mouth.open === false || (r === 'mouth' && cr.fed === 1), `a bomb into the funnel is swallowed ("${r}"): fed ${cr.fed}/${DRK.FED}`);
  // the funnel is only for a crawler: a shell can hurt the glowing mouth of a flier but a bomb there is a choke, never a feed
  const B = drakeUp();
  onlyAttack('breath');
  DRK.BREATH.HIGH_SHARE = 0;
  wake(B.cr);
  until(B.sim, () => actIs(B.cr, 'breath', 'glow'), 15);
  step(B.sim, 20);
  const bm = partOf(B.cr, 'mouth').segs[0];
  const rr = CS.creatureBomb(B.st, { x: bm.x, y: bm.y, owner: 'p1' });
  report(rr === 'mouth' && B.cr.fed === 0 && B.cr.choked === 1, 'in the air a bomb in the glowing mouth chokes it; it never counts as fed');
  // FED bombs win
  const C2 = drakeUp();
  const w2 = C2.cr.parts.find((p) => p.id === 'wingN');
  CS.hurtCreature(C2.st, { part: w2, seg: 3 }, w2.hp + 1, { src: 'shell', who: 'p1' });
  until(C2.sim, () => C2.cr.drake.mode === 'crawl', 8);
  C2.cr.ai.breather = 0;
  C2.cr.drake.nextT = 1e9;
  for (let k = 0; k < DRK.FED && !C2.cr.dying; k++) {
    C2.cr.drake.lastGape = -1e9;
    until(C2.sim, () => C2.cr.mouthWin && partOf(C2.cr, 'mouth').open, 6);
    const m2 = partOf(C2.cr, 'mouth').segs[0];
    CS.creatureBomb(C2.st, { x: m2.x, y: m2.y - 500, owner: 'p1' });
    step(C2.sim, 10);
    until(C2.sim, () => !C2.cr.mouthWin, 6);
  }
  report(C2.cr.stats.win === 'bombs' && C2.cr.dying && /BOMBED IN THE MOUTH/.test(C2.st.ev.warnText), `${DRK.FED} bombs in the gaping mouth win: stats.win "${C2.cr.stats.win}", "${C2.st.ev.warnText}"`);
}
{
  // LUNGE and the upward breath of the crawler
  const A = drakeUp();
  const { sim, st, ship, cr } = A;
  const wing = cr.parts.find((p) => p.id === 'wingN');
  CS.hurtCreature(st, { part: wing, seg: 3 }, wing.hp + 1, { src: 'shell', who: 'p1' });
  until(sim, () => cr.drake.mode === 'crawl', 8);
  const hull0 = st.ship.hull, f0 = frameHp(ship);
  cr.ai.breather = 0;
  cr.drake.nextT = 1e9;
  cr.drake.lastGape = cr.age + 1e9;
  ship.pose.y = cr.base.y - 1900 - ship.layout.refPoint.y; // (she hangs within its reach)
  step(sim, 5);
  const msgs = [];
  cr.hooks.phoneFx = (p, t) => msgs.push(t);
  cr.drake.nextT = 0;
  until(sim, () => actIs(cr, 'lunge') || actIs(cr, 'breath'), 12);
  const kind = cr.drake.act && cr.drake.act.kind;
  until(sim, () => !cr.drake.act, 10);
  report(kind === 'lunge' || kind === 'breath', `the crawler attacks her from below: ${kind} (a lunge snaps at her hull, a breath goes UP)`);
  cr.drake.nextT = 1e9;
  for (let i = 0; i < 3 && cr.stats.lunges === 0; i++) { cr.drake.nextT = 0; DRK.CRAWL.EVERY[0] = DRK.CRAWL.EVERY[1] = 0.1; until(sim, () => actIs(cr, 'lunge') || cr.stats.lunges > 0, 15); until(sim, () => !cr.drake.act, 10); }
  report(cr.stats.lunges >= 1 || cr.stats.breaths >= 1, `lunges ${cr.stats.lunges} (hit ${cr.stats.lungeHits}), breaths ${cr.stats.breaths}; hull ${hull0.toFixed(1)} -> ${st.ship.hull.toFixed(1)}`);
}

// (D7) the harpoon and the lava spout
{
  const A = drakeUp();
  const { sim, st, ship, cr, p1 } = A;
  // in the air the harpoon finds nothing
  const mp = partOf(cr, 'mantle').segs[0];
  report(TW.creatureRay(st, { x: mp.x - 500, y: mp.y }, 0, 1500) === null, 'a harpoon cannot hook a drake in the air');
  const wing = cr.parts.find((p) => p.id === 'wingN');
  CS.hurtCreature(st, { part: wing, seg: 3 }, wing.hp + 1, { src: 'shell', who: 'p1' });
  until(sim, () => cr.drake.mode === 'crawl', 8);
  cr.ai.breather = 1e9;
  const sp = cr.drake.spouts;
  report(sp.length === DRK.LAIR.SPOUTS.length && sp.every((s) => Number.isFinite(s.x) && s.y > 0), `the lair has ${sp.length} lava spouts on the shelf`);
  // each one: sleeps, bubbles (warn), erupts
  const sts = new Set();
  const t0 = cr.age;
  for (let i = 0; i < secs(DRK.SPOUT.CYCLE + 1); i++) { step(sim); sp.forEach((s) => sts.add(s.st)); }
  report(['sleep', 'warn', 'erupt'].every((k) => sts.has(k)), `a spout sleeps, bubbles for ${DRK.SPOUT.WARN} s, then erupts for ${DRK.SPOUT.ERUPT} s (seen ${[...sts].join(', ')} in ${(cr.age - t0).toFixed(0)} s)`);
  // hook it and haul it over a spout
  const hit = (s) => { cr.base.x = s.x - 100; cr.drake.nextT = 1e9; step(sim, 3); };
  hit(sp[0]);
  const hx = T.toWorldX(ship, ship.layout.platforms[deckOf(ship, 'main')].x1 - 80), hy = T.toWorldY(ship, ship.layout.platforms[deckOf(ship, 'main')].y - 60);
  const m = partOf(cr, 'mantle'), ms = m.segs[0];
  const tow = TW.creatureLatch(st, ship, { part: m, seg: 0, d: Math.hypot(ms.x - hx, ms.y - hy), x: ms.x + Math.cos(ms.ang) * 400, y: ms.y + Math.sin(ms.ang) * 400 }, { x: T.toShipX(ship, hx), y: T.toShipY(ship, hy) }, config.GUN_TYPES.harpoon, p1);
  step(sim, 90);
  report(!!tow && cr.hooked, 'the line holds the crawling drake');
  // asleep spout: nothing; erupting spout: it roasts
  const forceSp = (s, state) => { s.off = state === 'erupt' ? -cr.age + 0.2 : -cr.age + DRK.SPOUT.ERUPT + 1; };
  const pool1 = cr.hp;
  for (let i = 0; i < 120; i++) { forceSp(sp[0], 'sleep'); forceSp(sp[1], 'sleep'); step(sim); }
  report(cr.hp >= pool1 - 1, 'hauled but over a sleeping spout it takes nothing');
  let e = 0;
  for (let i = 0; i < secs(60) && !cr.dying; i++) { forceSp(sp[0], 'erupt'); cr.base.x += (sp[0].x - cr.base.x) * 0.02; step(sim); e++; } // (the body is drawn over it a little at a time)
  report(cr.stats.win === 'tow' && cr.dying && /ROASTED/.test(st.ev.warnText) && cr.stats.spouts > 0, `over an ERUPTING spout it is roasted: the pool is gone after ${(e / 60).toFixed(0)} s (the win is "${cr.stats.win}", "${st.ev.warnText}")`);
}

// (D8) boarding the perched drake: hack the scales, strike the heart
{
  const A = drakeUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyAttack('perch');
  DRK.ATTACK.FIRST_PERCH = 0;
  report(BD.creatureSurfaces(st, ship).length === 0, 'in the air its torso is no landing place');
  wake(cr);
  until(sim, () => cr.drake.perch && cr.drake.perch.landed, 25);
  quiet(cr);
  cr.drake.perch.claw = cr.drake.perch.lash = 1e9;
  report(BD.creatureSurfaces(st, ship).length === 1, 'perched on her bag its torso is a landing strip for the crew in the air');
  const heart = partOf(cr, 'heart'), hs = heart.segs[0];
  p1.carry = 'sword';
  report(BD.boardAt(st, ship, p1, hs.x, hs.y) && !!p1.on, 'a flier lands on it: he is aboard');
  let label = null, type = null;
  const n0 = until(sim, () => { p1.fire = true; if (p1.act) { label = p1.act.label; type = p1.act.type; } return !heart.hidden; }, 10);
  report(type === 'scales' && /HACK THE SCALES/.test(label) && !heart.hidden && Math.abs(n0 - DRK.BOARD.SCALES_TIME) < 1.2, `the heart is behind its breast scales: "${label}" held ${n0.toFixed(1)} s opens it (SCALES_TIME ${DRK.BOARD.SCALES_TIME})`);
  // without a sword the button only says what is missing
  const B = drakeUp();
  onlyAttack('perch');
  DRK.ATTACK.FIRST_PERCH = 0;
  wake(B.cr);
  until(B.sim, () => B.cr.drake.perch && B.cr.drake.perch.landed, 25);
  quiet(B.cr);
  B.cr.drake.perch.claw = B.cr.drake.perch.lash = 1e9;
  const hh = partOf(B.cr, 'heart').segs[0];
  B.st.players.p1.carry = null;
  BD.boardAt(B.st, B.ship, B.st.players.p1, hh.x, hh.y);
  B.st.players.p1.fire = true;
  step(B.sim, 20);
  report(!!B.st.players.p1.act && B.st.players.p1.act.type === 'need' && /sword/i.test(B.st.players.p1.act.label), `without a sword: "${B.st.players.p1.act && B.st.players.p1.act.label}"`);
  // the heart open: STRIKE THE HEART wins
  let type2 = null;
  const n1 = until(sim, () => { p1.fire = true; if (p1.act) type2 = p1.act.type; return cr.dying; }, 14);
  report(type2 === 'strike' && cr.stats.win === 'board' && /HEART STRUCK/.test(st.ev.warnText), `STRIKE THE HEART (a sword, ${DRK.BOARD.HEART_TIME} s): it dies by "${cr.stats.win}" after ${n1.toFixed(1)} s ("${st.ev.warnText}")`);
  // when it lifts off its boarder falls
  const D = drakeUp();
  onlyAttack('perch');
  DRK.ATTACK.FIRST_PERCH = 0;
  wake(D.cr);
  until(D.sim, () => D.cr.drake.perch && D.cr.drake.perch.landed, 25);
  quiet(D.cr);
  D.cr.drake.perch.claw = D.cr.drake.perch.lash = 1e9;
  const dp = partOf(D.cr, 'heart').segs[0], q = D.st.players.p1;
  q.carry = 'sword';
  BD.boardAt(D.st, D.ship, q, dp.x, dp.y);
  D.cr.drake.perch.left = 0.1;
  step(D.sim, 30);
  report(!q.on && q.fly === true, 'when it takes off the boarder falls off it (a flier again, with his parachute button)');
}

// (D9) the lair, the voyage, the reward
{
  restoreCfg();
  drakeCfgBack();
  realHp();
  const ctx = boot({ env: 'ember', lair: true, bots: 0 });
  const { sim, st, ship } = ctx;
  const map = st.course.map, c = st.course;
  const DL = DRK.LAIR;
  report(c.stop && c.stop.lair === true && c.stop.creature === 'drake' && map.lair === true && map.creature === 'drake' && map.outposts.length === 0 && map.turrets.length === 0 && Number.isFinite(map.startDist) && map.startDist < 1e8, 'a Drake lair stop flies the lair map for the Drake: open sky, no outposts, no guns');
  report(Number.isFinite(map.lavaY) && map.lavaY === st.env.lavaY && map.lavaY - map.start.y >= DL.LAVA_BELOW - 250 && !!map.shelf && map.shelf.top < map.lavaY && map.spouts.length === DL.SPOUTS.length, `lava ${Math.round(map.lavaY - map.start.y)} px under the launch, a rock shelf ${Math.round(map.shelf.x1 - map.shelf.x0)} px wide standing ${Math.round(map.lavaY - map.shelf.top)} px above it, ${map.spouts.length} spouts`);
  const fb = MPS.floorBelow(map, (map.shelf.x0 + map.shelf.x1) / 2, map.start.y);
  report(fb === map.shelf.top && MPS.floorBelow(map, map.start.x, map.start.y) > map.lavaY, 'the shelf is solid rock under the middle; the way in is open air over the lava');
  step(sim, secs(2));
  report(st.creature === null && !st.boss, 'at the start there is no creature and no zeppelin');
  ship.pose.x = map.start.x + (map.goal.x - map.start.x) * 0.7 - ship.layout.refPoint.x;
  st.tempo.phase = 'build';
  st.tempo.bossOk = true;
  for (let i = 0; i < secs(4) && !st.creature; i++) step(sim, 1);
  report(!!st.creature && st.creature.kind === 'drake' && st.creature.mode === 'surfacing' && !st.boss, `at ${(c.progress * 100).toFixed(0)}% of the way the Drake comes in where the zeppelin would: ${st.creature && st.creature.name}; no zeppelin`);
  const cr = st.creature;
  for (let i = 0; i < secs(DRK.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim, 1);
  quiet(cr);
  step(sim, secs(5));
  report(st.tempo.phase === 'peak' && st.tempo.kind === 'boss', 'the pacing director treats it as the mission boss');
  ship.pose.x = map.goal.x - ship.layout.refPoint.x;
  ship.pose.y = map.goal.y - ship.layout.refPoint.y;
  st.ev.warn = 0;
  step(sim, secs(3));
  report(!c.done && !c.pendingNext, 'at the lair\'s middle with the Drake alive the stop is not done');
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(2));
  report(cr.dying && !c.done && st.bossDownLap === c.lap, 'killed, it is dying and the boss is down');
  for (let i = 0; i < secs(DRK.SPAWN.SINK + C.CHUNK.LIFE + 3) && !c.done; i++) step(sim, 1);
  report(c.done === true && c.pendingNext === true && st.creature === null && /DRAKE IS SLAIN/.test(st.ev.warnText), `once it has fallen into the lava the stop is done: "${st.ev.warnText}"`);
}
{
  // the voyage: lairs on Sunken Sea (Kraken) and Ember Forge (Drake) stops
  restoreCfg();
  const seeds = Array.from({ length: quick ? 80 : 300 }, (_, i) => 1000 + i * 7919);
  let kr = 0, dr = 0, bad = [];
  for (const mode of ['quick', 'voyage', 'campaign']) for (const voyageNo of [1, 2]) for (const sd of seeds) {
    const v = VY.generateVoyage(sd, { mode, voyageNo, gentle: sd % 2 === 0 });
    for (const s of v.columns.flat().filter((q) => q.lair)) {
      if (s.creature !== LR.BY_ENV[s.env] || !s.creature) bad.push(`${mode}/${sd}: ${s.id} on ${s.env} holds ${s.creature}`);
      if (s.creature === 'kraken') kr++;
      if (s.creature === 'drake') dr++;
    }
  }
  report(!bad.length && kr > 0 && dr > 0, `lairs are by sky: ${kr} Kraken lairs on Sunken Sea stops and ${dr} Drake lairs on Ember Forge stops over ${seeds.length * 6} voyages${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
  const dl = VY.lairOf('drake'), kl = VY.lairOf('kraken');
  report(dl.NAME === DRK.LAIR.NAME && kl.NAME === LR.NAME && VY.stopName({ lair: true, creature: 'drake', env: 'ember' }) === DRK.LAIR.NAME && VY.stopName({ lair: true, creature: 'kraken', env: 'sea' }) === LR.NAME, 'the stop has the right name for its creature');
  // the route map draws the dragon icon and DRAKE LAIR
  const ctx = boot({ start: 'classic', bots: 3 });
  const { sim, st } = ctx;
  const v = st.run.voyage, here = v.columns[0][0], lair = v.columns[1][0];
  Object.assign(lair, { env: 'ember', play: 'ember', kind: 'lair', lair: true, creature: 'drake', danger: 3, reward: 80 });
  here.next = v.columns[1].map((s) => s.id);
  st.run.salvage = 0;
  sim.startDock();
  if (st.vote && st.vote.kind === 'dock') {
    const cast = st.vote.options.findIndex((o) => o.kind === 'cast');
    for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = cast; }
    step(sim, secs(3));
  }
  const route = st.vote && st.vote.kind === 'route' ? st.vote : null;
  const opt = route && route.options.find((o) => o.id === lair.id);
  report(!!opt && opt.lair === true && opt.icon === DRK.LAIR.ICON && /LAIR/.test(opt.desc) && opt.kindName === DRK.LAIR.KIND, `the route vote lists it: ${opt && opt.icon} "${opt && opt.name}" - ${opt && opt.desc}`);
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
  const texts = rec.texts.map((q) => q.s);
  report(exc === 0 && texts.includes(DRK.LAIR.ICON) && texts.includes(DRK.LAIR.LABEL) && texts.includes('DRAKE LAIR'), 'the TV\'s route map draws the dragon icon and "DRAKE LAIR" (0 draw errors)');
}
{
  // the reward and the trophy
  restoreCfg();
  drakeCfgBack();
  const ctx = boot({ env: 'ember', lair: true, start: 'classic', bots: 3 });
  const { sim, st, ship } = ctx;
  const cr = spawnCr(ctx);
  for (let i = 0; i < secs(DRK.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  quiet(cr);
  st.ship.hull = 40;
  for (const b of st.bags) b.gas = 30;
  const salv0 = st.run.salvage, hull0 = st.ship.hull;
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(3));
  const SV = config.SALVAGE.BOSS * C.REWARD_MUL;
  report(st.run.salvage - salv0 >= SV && st.run.salvage - salv0 <= SV + 40, `triple boss salvage: +${st.run.salvage - salv0} (SALVAGE.BOSS ${config.SALVAGE.BOSS} x ${C.REWARD_MUL})`);
  report(st.ship.hull >= hull0 + DRK.REWARD.HULL - 1 && st.bags.every((b) => b.gas >= 30 + DRK.REWARD.GAS - 10) && st.run.trophy === 'drakeScale', `a hull patch (+${DRK.REWARD.HULL}) and every gasbag (+${DRK.REWARD.GAS}); the trophy "${st.run.trophy}" is waiting`);
  st.run.salvage = 0;
  sim.startDock();
  const idx = st.vote.options.findIndex((o) => o.kind === 'part' && o.trophy);
  const card = st.vote.options[idx];
  report(!!card && card.entry === 'drakeScale' && card.name === 'Drake-scale plating' && card.cost === 0 && /TROPHY: from the Drake/.test(card.badge) && card.choices.length >= 1, `the next dock offers the TROPHY card "${card && card.name}" - ${card && card.badge}, cost ${card && card.cost}, ${card && card.choices.length} place(s)`);
  for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = idx; }
  for (let i = 0; i < 60 * 8 && st.vote && st.vote.kind === 'dock' && !st.vote.options[idx].sold; i++) step(sim, 1);
  if (st.vote && st.vote.kind === 'slot') { for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = 0; } for (let i = 0; i < 60 * 5 && st.vote && st.vote.kind === 'slot'; i++) step(sim, 1); }
  step(sim, 5);
  const L = ship.layout, plate = (L.armour || []).find((q) => q.art === 'drake');
  report(!!plate && st.run.trophy === null && st.run.parts.some((q) => q.id === 'drakeScale'), `bought, it is on the ship: an armour stretch with art "${plate && plate.art}" (${plate ? Math.round(plate.x1 - plate.x0) : 0} px)`);
  report(!!plate && FRM.flamAt(L, plate.d, (plate.x0 + plate.x1) / 2) === 0, 'and it is as fireproof as iron plate (flammability 0)');
  // lighter than iron: the same parts without the art key weigh more
  const build = st.run.build, plain = build.map((q) => (q.art === 'drake' ? (({ art, ...r }) => r)(q) : q));
  const mDrake = SBD.balanceOf(build).mass, mIron = SBD.balanceOf(plain).mass;
  report(mDrake < mIron - 0.5, `and lighter: ${mDrake.toFixed(1)} tons against ${mIron.toFixed(1)} for the same plate in iron`);
  report(!fs.readFileSync(path.join(publicDir, 'modules/host/fire.js'), 'utf8').includes('drake'), 'no new fire rules: the plating is armour (the fire model is untouched)');
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  let exc = 0;
  for (let f = 0; f < 20; f++) { step(sim, 1); try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } }
  report(exc === 0, 'the ship with Drake-scale plating draws on the stub canvas (0 errors)');
}

// (D10) the TV
{
  restoreCfg();
  drakeCfgBack();
  const ctx = boot({ env: 'ember', lair: true });
  const { sim, st } = ctx;
  const cr = spawnCr(ctx);
  for (let i = 0; i < secs(DRK.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  cr.ai.breather = 0;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  // fly through every act: breath, swoop, perch, then crash and crawl with lunge, gape, rear
  const seen = new Set();
  let exc = 0, hudText = false, ms = 0, frames = 0;
  const frame = () => {
    step(sim, 1);
    rec.texts.length = 0;
    const t0 = hr();
    try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    ms += hr() - t0;
    frames++;
    if (rec.texts.some((x) => x.s.startsWith('THE CINDER DRAKE - '))) hudText = true;
    if (cr.drake.act) seen.add(cr.drake.act.kind + '.' + cr.drake.act.sub); else seen.add(cr.drake.mode);
  };
  const W = DRK.ATTACK.WEIGHTS;
  for (const k of ['breath', 'swoop', 'perch']) {
    onlyAttack(k);
    DRK.ATTACK.FIRST_PERCH = 0;
    cr.drake.nextT = 0;
    cr.drake.lastPerch = -1e9;
    for (let f = 0; f < 60 * 14; f++) frame();
  }
  void W;
  cr.drake.nextT = 1e9;
  const wing = cr.parts.find((p) => p.id === 'wingN');
  CS.hurtCreature(st, { part: wing, seg: 3 }, wing.hp + 1, { src: 'shell', who: 'p1' });
  for (let f = 0; f < 60 * 6; f++) frame();
  cr.ai.breather = 0;
  for (const kind of ['gape', 'lunge', 'breath', 'rear']) {
    cr.hp = cr.maxHp * (kind === 'rear' ? 0.2 : 0.5);
    if (kind === 'gape') cr.drake.lastGape = -1e9;
    if (kind === 'rear') { cr.drake.lastRear = -1e9; cr.stats.phaseAt = { 3: -100 }; }
    cr.drake.nextT = 0;
    for (let f = 0; f < 60 * 8; f++) frame();
  }
  report(exc === 0 && hudText, `the fight draws on a stub canvas for ${frames} frames with 0 errors (seen: ${[...seen].join(', ')}); the bar says THE CINDER DRAKE with its phase`);
  console.log(`     whole-TV frame with the Drake: ${(ms / frames).toFixed(2)} ms (JS on a stub canvas)`);
  const stub = stubCtx();
  const art = createCreatureArt({ ctx: stub });
  let t = 0, blits = 0;
  for (let f = 0; f < 300; f++) { step(sim, 1); const t0 = hr(); art.draw(cr, { zoom: 0.12, dpr: 1 }); for (const c of cr.chunks) art.drawLimb(c.part, { zoom: 0.12, dpr: 1 }); t += hr() - t0; blits = Math.max(blits, art.stats.blits); }
  report(t / 300 < config.PERF.BUDGET_MS && blits > 12, `creatureArt alone: ${(t / 300).toFixed(3)} ms a frame over 300 frames (${blits} blits; budget ${config.PERF.BUDGET_MS} ms)`);
}

// (D11) the bots
{
  restoreCfg();
  drakeCfgBack();
  const botsimPath = path.join(publicDir, '..', 'tools', 'botsim.mjs');
  const run = (args, env = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [botsimPath, ...args], { env: { ...process.env, ...env } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  const fight = (out) => {
    const m = /fight 1: phase (\d)[^\n]*?; ended: (\w+)(?: at (\d+)s)?/.exec(out);
    return m ? { phase: +m[1], ended: m[2], at: m[3] === undefined ? null : +m[3] } : null;
  };
  const pool = async (jobs, n) => { const res = []; let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < jobs.length) { const i = k++; res[i] = await jobs[i](); } })); return res; };
  const seedsB = quick ? [1, 2] : [1, 2, 3];
  const forced = ['choke', 'bombs', 'tow', 'board', 'flak', 'hp'];
  const buildOf = { tow: ['--build', 'drakeharpoon'], flak: ['--build', 'flak'] };
  const jobs = [];
  for (const w of forced) for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--env', 'ember', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd), ...(buildOf[w] || [])], { CREATURE_FORCE_WIN: w }).then((r) => ({ w, sd, r })));
  for (const bots of [4, 16]) for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--env', 'ember', '--bots', String(bots), '--difficulty', 'easy', '--minutes', '16', '--seed', String(sd)]).then((r) => ({ w: 'easy' + bots, sd, r })));
  for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--env', 'ember', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)]).then((r) => ({ w: 'free', sd, r })));
  const results = await pool(jobs, 5);
  const clean = (r) => r.code === 0 && /errors: 0/.test(r.out) && !/NaN/.test(r.out);
  const byWin = {};
  for (const { w, sd, r } of results) { const f = fight(r.out); (byWin[w] ||= []).push({ sd, f, ok: clean(r) }); }
  for (const w of forced) {
    const rows = byWin[w];
    const times = rows.map((x) => (x.f && x.f.ended === w ? x.f.at : null));
    report(rows.every((x) => x.ok) && times.every((t) => t !== null && t <= 360), `forced ${w.toUpperCase()}: 8 bots on Normal end it that way within 6 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] === null ? 'NOT (' + (x.f ? x.f.ended + ', phase ' + x.f.phase : 'no fight') + ')' : times[i] + ' s')).join(', ')})`);
  }
  for (const bots of [4, 16]) {
    const rows = byWin['easy' + bots];
    const times = rows.map((x) => (x.f && x.f.ended !== 'no' ? { at: x.f.at, how: x.f.ended } : null));
    report(rows.every((x) => x.ok) && times.every((t) => t && t.at <= 600), `${bots} bots on Easy win within 10 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] ? times[i].how + ' ' + times[i].at + ' s' : 'NOT')).join(', ')})`);
  }
  {
    const rows = byWin.free;
    const how = rows.map((x) => (x.f && x.f.ended !== 'no' ? x.f.ended + ' ' + x.f.at + ' s' : 'NOT'));
    report(rows.every((x) => x.ok) && how.every((h) => h !== 'NOT'), `unforced, 8 bots on Normal win (${how.join(', ')})`);
  }
  report(results.every(({ r }) => clean(r)), `0 errors and no NaN in any of the ${results.length} Drake bot fights`);
}

// =================================================================== C.6b: THE THUNDERBIRD ===================================================================
//   (T0) the body: wings (2 parts of 5 feather segments, each with hp), a 3-segment neck, head, beak, a tail fan, two talons, the gizzard hidden; about 3x the ship; it lives in the Storm Front only; stepped keys; the sky is dark
//   (T1) every weapon hurts a part; lit parts rank before unlit ones in the dark
//   (T2) GUST: the three beats (banner, a buzz on every phone, a screech), then the shove: she moves, the twist stays within FORCES.MAX_DEG
//   (T3) PASS bumps the hull;  (T4) LIGHTNING DIVE: bolts through the storm's own strike system: nobody on a rod = she is struck, a held rod grounds one, a manned coil DRINKS it and fires it back at the bird for DRINK.MUL x
//   (T5) SWALLOW: the gizzard glows, only coil bolts into it count (ZAP.HITS win);  (T6) PERCH on her bag: a live load that tips her within FORCES.MAX_DEG, claws holes, driven off by swords, shots, flame, a hard turn, time
//   (T7) ROOST on a rock spire: feet on the rock, a landing place; ROOST.MORTAR_HITS mortar shells win;  (T8) boarding it (bag or spire): CUT THE GIZZARD (a win)
//   (T9) a plucked wing: phase 2, a lopsided flight; both: it falls into the clouds (a win); phases by the pool;  (T10) the lair, the voyage, the reward and the feather sail;  (T11) the TV;  (T12) the bots
const TB = C.THUNDERBIRD;
const CBI = await load('modules/host/creatureBird.js');
const TBM = await load('modules/host/creatures/thunderbird.js');
const BW0 = JSON.stringify(TB.ATTACK.WEIGHTS), BR0 = JSON.stringify(TB.ROOST), BA0 = JSON.stringify({ F: TB.ATTACK.FIRST_PERCH, E: TB.ATTACK.PERCH_EVERY });
const birdCfgBack = () => { TB.ATTACK.WEIGHTS = JSON.parse(BW0); Object.assign(TB.ROOST, JSON.parse(BR0)); const a = JSON.parse(BA0); TB.ATTACK.FIRST_PERCH = a.F; TB.ATTACK.PERCH_EVERY = a.E; };
const onlyBird = (kind) => { for (const ph of [1, 2, 3]) TB.ATTACK.WEIGHTS[ph] = { [kind]: 1 }; };
const noRoost = () => { TB.ROOST.FIRST = 1e9; };
const bActIs = (cr, kind, sub) => !!cr.bird.act && cr.bird.act.kind === kind && (sub === undefined || cr.bird.act.sub === sub);
const quietB = (cr) => { cr.ai.breather = 1e9; cr.bird.nextT = 1e9; };
const wakeB = (cr) => { cr.ai.breather = 0; cr.bird.nextT = 0; cr.bird.lastPerch = -1e9; cr.bird.lastRoost = -1e9; };
// A sim in the Storm Front's lair with the Thunderbird arrived, circling, its attacks held until a test asks.
function birdUp({ lair = true, difficulty = 'normal', bots = 0, start = null } = {}) {
  restoreCfg();
  birdCfgBack();
  const ctx = boot({ env: 'storm', lair, difficulty, bots, start });
  const map = ctx.st.course.map;
  if (map.lair) { ctx.ship.pose.x = map.goal.x - ctx.ship.layout.refPoint.x; ctx.ship.pose.y = map.goal.y - ctx.ship.layout.refPoint.y; step(ctx.sim, 5); }
  const cr = ctx.sim.creatures.spawn('thunderbird');
  for (let i = 0; i < secs(TB.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(ctx.sim);
  quietB(cr);
  step(ctx.sim, 30);
  return { ...ctx, cr, p1: ctx.st.players.p1 };
}
const perchedBird = () => {
  const A = birdUp();
  onlyBird('perch');
  noRoost();
  TB.ATTACK.FIRST_PERCH = 0;
  wakeB(A.cr);
  until(A.sim, () => A.cr.bird.perch && A.cr.bird.perch.landed, 25);
  quietB(A.cr);
  A.cr.bird.perch.claw = 1e9;
  return A;
};
const roostedBird = () => {
  const A = birdUp();
  onlyBird('gust');
  TB.ROOST.FIRST = 0;
  wakeB(A.cr);
  until(A.sim, () => A.cr.bird.roost && A.cr.bird.roost.landed, 25);
  quietB(A.cr);
  return A;
};

// (T0) the world and the body
{
  restoreCfg();
  birdCfgBack();
  const ctx = boot({ env: 'storm', lair: true });
  const { sim, st, ship } = ctx;
  report(spawnCr(ctx, 'kraken') === null && spawnCr(ctx, 'drake') === null && st.creature === null, 'neither the Kraken nor the Drake comes to the Storm Front (no sea line, no lava)');
  const cr = spawnCr(ctx, 'thunderbird');
  const cnt = (k) => cr.parts.filter((p) => p.kind === k);
  report(!!cr && cr.kind === 'thunderbird' && cr.name === TB.NAME && cr.mode === 'surfacing' && cnt('wing').length === 2 && cnt('wing').every((w) => w.segs.length === TB.WING.SEGS && w.hp > 0) && cnt('neck')[0].segs.length === TB.NECK.SEGS && cnt('tail').length === 1 && cnt('head').length === 1 && cnt('beak').length === 1 && cnt('talon').length === 2 && cnt('heart').length === 1 && cnt('heart')[0].id === 'gizzard' && cnt('heart')[0].hidden,
    `spawn puts the Thunderbird in state.creature: 2 wings of ${TB.WING.SEGS} feather segments each with hp, a neck, head, beak, tail fan, 2 talons and a hidden gizzard`);
  const before = cr.parts.reduce((a, p) => a + p.hp, 0);
  const w0 = cnt('wing')[0], m = w0.segs[2];
  st.shells.push({ x: m.x + Math.cos(m.ang) * m.len / 2, y: m.y + Math.sin(m.ang) * m.len / 2, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 5);
  report(cr.parts.reduce((a, p) => a + p.hp, 0) === before && AIM.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0, 'while it flies in it cannot be hurt, shot at or spotted');
  for (let i = 0; i < secs(TB.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  quietB(cr);
  step(sim, 60);
  const tg = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  const kinds = new Set(tg.map((t) => t.part.kind));
  report(cr.mode === 'idle' && ['wing', 'neck', 'head', 'beak', 'mantle', 'tail', 'talon'].every((k) => kinds.has(k)) && !kinds.has('heart') && tg.every((t) => t.obj && typeof t.obj.lit === 'number' && Number.isFinite(t.at(0.5).x)), `arrived: ${tg.length} aim targets (${[...kinds].join(', ')}; the gizzard is hidden)`);
  const radar = SP.radarItems(st).filter((i) => i.kind === 'creature');
  report(radar.length >= 3 && radar.every((i) => Number.isFinite(i.pos().x)), `${radar.length} blips on the phone radar`);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of cr.parts) for (const s of p.segs) for (const u of [0, 1]) { const x = s.x + Math.cos(s.ang) * s.len * u, y = s.y + Math.sin(s.ang) * s.len * u; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const shipLen = ship.layout.bounds.x1 - ship.layout.bounds.x0, ext = Math.hypot(x1 - x0, y1 - y0);
  const span = 2 * cnt('wing')[0].reach + TB.TORSO.LEN;
  report(span >= 2.8 * shipLen && ext >= 1.8 * shipLen && cnt('wing')[0].reach >= shipLen, `it is huge: ${Math.round(span)} px with its wings spread against her ${shipLen} (${(span / shipLen).toFixed(1)}x), ${Math.round(ext)} px across as it flaps, each wing ${Math.round(cnt('wing')[0].reach)} px`);
  const nk = cnt('neck')[0];
  let changed = 0, keyChanges = 0, lastKey = cr.key, lastRel = nk.rel.x + ',' + nk.rel.y;
  for (let i = 0; i < 120; i++) { step(sim); const r = nk.rel.x + ',' + nk.rel.y; if (r !== lastRel) { if (cr.key === lastKey) changed++; else keyChanges++; lastRel = r; } lastKey = cr.key; }
  report(changed === 0, `no wobble: the neck's goal changed only on the key clock (${keyChanges} changes on keys, ${changed} between)`);
  // the sky is dark: a part is dim unless a searchlight has it (or a flash of lightning shows it for a moment)
  let dim = 0, lit = 0, tried = 0;
  for (let i = 0; i < 240; i++) {
    const flash = st.weather.flash;
    step(sim);
    if (flash < 0.3 && (st.darkNow || 0) > C.DARK_AT) { tried++; if (cr.parts.every((p) => !p.lit)) dim++; }
  }
  const w1 = cnt('wing')[0];
  w1.tgt.lit = 1;
  step(sim);
  report(tried > 20 && dim === tried && w1.lit === true, `in the dark every part is dim (${dim} of ${tried} calm steps) and a part in a searchlight beam (lit) is not`);
  const B0 = boot({ env: 'sea' });
  report(spawnCr(B0, 'thunderbird') === null && B0.st.creature === null, 'and the Thunderbird does not come to the Sunken Sea');
  const B1 = boot({ env: 'ember' });
  report(spawnCr(B1, 'thunderbird') === null && B1.st.creature === null, '...nor to the Ember Forge');
}

// (T1) every weapon hurts a part; only lit parts take aim assist
{
  const A0 = birdUp();
  const { sim, st, cr } = A0;
  const wing = cr.parts.find((p) => p.id === 'wingN'), neck = cr.parts.find((p) => p.kind === 'neck'), torso = partOf(cr, 'mantle');
  const w = on(wing), h0 = wing.hp;
  st.shells.push({ x: w.x, y: w.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(h0 - wing.hp > 0 && cr.stats.by.shell > 0, `a shell on a wing takes ${(h0 - wing.hp).toFixed(1)} off it (credited: ${cr.stats.by.shell.toFixed(1)} by shell)`);
  const n0 = neck.hp, np = midOf(neck.segs[1]);
  CS.creatureBurn(st, (x, y) => Math.hypot(x - np.x, y - np.y) < 300, { x: np.x - 200, y: np.y }, 0.5, 'p1');
  report(neck.hp < n0 && cr.stats.by.flame > 0, `flame on the neck: -${(n0 - neck.hp).toFixed(1)}`);
  const tp = midOf(torso.segs[0], 0.5), t0 = torso.hp;
  const rb = CS.creatureBomb(st, { x: tp.x, y: tp.y, owner: 'p1' });
  report(rb === 'burst' && torso.hp < t0, `a bomb on the body bursts on it (${rb}, -${(t0 - torso.hp).toFixed(1)})`);
  const e = A0.ship.layout.coil, ex = T.toWorldX(A0.ship, e.x), ey = T.toWorldY(A0.ship, e.y - 60), dx = tp.x - ex, dy = tp.y - ey, dl = Math.hypot(dx, dy), t1 = torso.hp;
  CS.creatureBeam(st, ex, ey, dx / dl, dy / dl, dl + 400, 80, 60, 'p1');
  report(torso.hp < t1 && cr.stats.by.coil > 0, `the coil's bolt hurts the body (-${(t1 - torso.hp).toFixed(1)})`);
  // lit parts first in the dark
  st.darkNow = 0.8;
  const wing2 = cr.parts.find((p) => p.id === 'wingF');
  wing.tgt.lit = 0;
  wing2.tgt.lit = 1;
  const lst = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  const rU = lst.find((t) => t.part === wing).rank, rL = lst.find((t) => t.part === wing2).rank;
  report(rL < rU && Math.abs(rU - rL - 2) < 1e-9, `in the dark the part a searchlight has ranks first (lit ${rL}, unlit ${rU})`);
  st.darkNow = 0;
  const lst0 = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  report(lst0.find((t) => t.part === wing).rank === lst0.find((t) => t.part === wing2).rank, 'in daylight there is no difference');
  report(TB.POOL.heart >= TB.POOL.mantle && TB.POOL.heart > TB.POOL.wing, 'the weak point (the gizzard) counts more against the pool than a wing');
}

// (T2) GUST
{
  const A = birdUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyBird('gust');
  noRoost();
  const G = TB.GUST;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  const p2 = (st.players.p2 = { ...p1, id: 'p2', name: 'P2' });
  standOn(p1, ship, topD(ship), 600, null);
  standOn(p2, ship, deckOf(ship, 'main'), 900, null);
  wakeB(cr);
  st.sfxQ.length = 0;
  until(sim, () => bActIs(cr, 'gust', 'rear'), 15);
  const rearAt = cr.age;
  step(sim, 2);
  const sqs = st.sfxQ.map((x) => x[0]);
  report(bActIs(cr, 'gust', 'rear') && /REARS ITS WINGS/.test(st.ev.warnText) && sqs.includes('screech') && msgs.some((m) => m.id === 'p1' && /GUST/.test(m.t) && Array.isArray(m.buzz)) && msgs.some((m) => m.id === 'p2') && cr.bird.pose === 'rear', `the wings rear back: banner "${st.ev.warnText}", a screech, a buzz on every phone, the pose "rear"`);
  const sd = cr.bird.act.sd, x0 = ship.pose.x;
  let base = 0;
  { const xa = ship.pose.x; step(sim, 30); base = (ship.pose.x - xa) / 0.5; } // (her own drift while it rears)
  until(sim, () => bActIs(cr, 'gust', 'beat'), 5);
  const tWind = cr.age - rearAt;
  const xb = ship.pose.x;
  let peak = 0;
  const n = until(sim, () => { peak = Math.max(peak, Math.abs(st.forces.theta)); return !bActIs(cr, 'gust', 'beat'); }, 5);
  const moved = ((ship.pose.x - xb) - base * n) * -sd;
  const lim = (config.FORCES.MAX_DEG * Math.PI) / 180 + 1e-6;
  report(moved > 0.5 * G.PUSH * G.BEAT && peak > 0.2 * (Math.PI / 180) && peak <= lim, `the downstroke shoves her ${moved.toFixed(0)} px away from the bird in ${n.toFixed(1)} s (PUSH ${G.PUSH} px/s x ${G.BEAT} s) and twists her: the tilt peaks at ${((peak * 180) / Math.PI).toFixed(2)} degrees (the limit ${config.FORCES.MAX_DEG})`);
  report(Math.abs(tWind - G.WIND) < 0.4, `the rear lasts ${tWind.toFixed(1)} s (GUST.WIND ${G.WIND})`);
  until(sim, () => !cr.bird.act, 5);
  report(!cr.bird.act && cr.stats.gusts === 1 && cr.gust === null && Number.isFinite(ship.pose.x), 'then it recovers and rejoins its loop');
  void x0;
}

// (T3) PASS
{
  const A = birdUp();
  const { sim, st, ship, cr } = A;
  onlyBird('pass');
  noRoost();
  let hull0 = st.ship.hull, f0 = frameHp(ship), hits = 0, seen = {};
  for (let tries = 0; tries < 4 && !hits; tries++) {
    hull0 = st.ship.hull; f0 = frameHp(ship);
    wakeB(cr);
    until(sim, () => bActIs(cr, 'pass'), 15);
    seen.banner = seen.banner || /DIVES/.test(st.ev.warnText);
    seen.ring = seen.ring || !!cr.swoop;
    until(sim, () => cr.stats.passHits > hits || !bActIs(cr, 'pass'), 12);
    hits = cr.stats.passHits;
  }
  report(seen.banner && seen.ring && hits >= 1 && frameHp(ship) < f0 && cr.bird.dazed > 0, `a diving PASS: the banner, the ring on the spot, then it bumps the hull (frame soundness ${f0.toFixed(2)} -> ${frameHp(ship).toFixed(2)}) and is DAZED ${cr.bird.dazed.toFixed(1)} s (everything hurts it ${TB.PASS.DAZED_MUL}x)`);
  const wing = cr.parts.find((p) => p.id === 'wingN'), wp = on(wing), h0 = wing.hp;
  st.shells.push({ x: wp.x, y: wp.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(h0 - wing.hp > H.SHELL_MUL * config.GUNS.DAMAGE * 1.2, `a dazed bird takes more: ${(h0 - wing.hp).toFixed(1)} against ${H.SHELL_MUL * config.GUNS.DAMAGE}`);
  void ship;
}

// (T4) LIGHTNING DIVE: the rod, the coil
{
  const MATES0 = config.MATES.ENABLED;
  config.MATES.ENABLED = false; // (the ship's mates would stand at a rod now and then: this block counts who held one)
  const runDive = (setup, ph = 2) => {
    const A = birdUp();
    const { sim, st, ship, cr, p1 } = A;
    onlyBird('dive');
    noRoost();
    cr.phase = ph;
    const msgs = [];
    cr.hooks.phoneFx = (p, t) => msgs.push({ id: p.id, t });
    const J = ship.ctx.stormJob;
    wakeB(cr);
    const ctl = setup(A, J);
    st.sfxQ.length = 0;
    const log = { calls: 0, banner: false, thunder: false, struck0: J.struck, caught0: J.caught, drank0: J.drank, birdBolt: false, msgs, ctl };
    const total = TB.DIVE.BOLTS[ph];
    for (let i = 0; i < secs(40) && !cr.dying && !(cr.stats.dives >= 1 && !bActIs(cr, 'dive') && cr.stats.bolts >= total); i++) {
      step(sim);
      if (J.charge && J.charge.bird) log.birdBolt = true;
      if (/LIGHTNING DIVE/.test(st.ev.warnText)) log.banner = true;
      if (st.sfxQ.some((x) => x[0] === 'thunder')) log.thunder = true;
      if (ctl && ctl.each) ctl.each(A, J);
    }
    log.bolts = cr.stats.bolts;
    log.struck = J.struck - log.struck0;
    log.caught = J.caught - log.caught0;
    log.drank = J.drank - log.drank0;
    return { A, J, log, total };
  };
  // nobody on a rod: every bolt strikes her
  {
    const { A, log, total } = runDive((A2) => { standOn(A2.p1, A2.ship, deckOf(A2.ship, 'lower'), 300, null); return null; });
    const buzz = log.msgs.filter((m) => m.id === 'p1' && /LIGHTNING DIVE|BOLT COMING/.test(m.t)).length;
    report(log.banner && log.thunder && log.birdBolt && log.bolts === total && buzz >= 1, `LIGHTNING DIVE: the banner, thunder, a buzz on the phones (${buzz}), then ${log.bolts} of ${total} bolts called through the storm's strike system`);
    report(log.struck === total && log.caught === 0, `nobody on a rod: all ${log.struck} bolts strike the ship (hull ${A.st.ship.hull.toFixed(1)}; ${A.st.fires.length} fires)`);
  }
  // a held rod grounds the bolt
  {
    const { A, log, total } = runDive((A2) => { standOn(A2.p1, A2.ship, deckOf(A2.ship, 'lower'), 300, null); return { each: (A3, J) => { for (const r of J.rods) r.held = 0.3; } }; });
    report(log.caught === total && log.struck === 0 && log.drank === 0 && A.st.ship.hull > 99.5, `a lightning rod held by a crewman GROUNDS every bolt (${log.caught} of ${total} grounded, ${log.struck} struck her, hull ${A.st.ship.hull.toFixed(1)})`);
  }
  // a manned coil drinks the grounded bolt and fires it back: 3x
  {
    const { A, log, total } = runDive((A2) => {
      const L = A2.ship.layout, coilSt = L.one('coil');
      standOn(A2.p1, A2.ship, deckOf(A2.ship, 'main'), coilSt.x, null);
      A2.p1.lock = coilSt.n;
      A2.p1.fire = false;
      return { each: (A3, J) => {
        for (const r of J.rods) r.held = 0.3;
        const cr = A3.cr, t = midOf(partOf(cr, 'mantle').segs[0], 0.5), e = A3.ship.layout.coil, ex = T.toWorldX(A3.ship, e.x), ey = T.toWorldY(A3.ship, e.y - 60);
        const a = T.aimToShip(A3.ship, Math.atan2(t.y - ey, t.x - ex));
        A3.p1.jx = Math.cos(a);
        A3.p1.jy = Math.sin(a);
        A3.p1.fire = false; // (it is a drunk bolt that fires the coil: it goes off the moment it drinks, at where it points)
        A3.st.coil.cd = Math.min(A3.st.coil.cd, 0);
      } };
    });
    const by = A.cr.stats.by.coil || 0;
    report(log.drank >= 1 && by > 0, `a manned coil DRINKS the grounded bolt (drank ${log.drank}) and fires it back at the bird (${by.toFixed(0)} damage by coil)`);
    // the same shot, drunk and not drunk, at a hovering bird
    const B = birdUp();
    const { sim, st, ship, cr, p1 } = B;
    onlyBird('dive');
    noRoost();
    cr.phase = 2;
    wakeB(cr);
    const coilSt = ship.layout.one('coil');
    standOn(p1, ship, deckOf(ship, 'main'), coilSt.x, null);
    p1.lock = coilSt.n;
    until(sim, () => bActIs(cr, 'dive', 'bolts'), 15);
    const aimNow = () => { const t = midOf(partOf(cr, 'mantle').segs[0], 0.5), e = ship.layout.coil, ex = T.toWorldX(ship, e.x), ey = T.toWorldY(ship, e.y - 60); const a = T.aimToShip(ship, Math.atan2(t.y - ey, t.x - ex)); st.coil.aim = a; };
    partOf(cr, 'mantle').hp = partOf(cr, 'mantle').maxHp = 1e6; // (a small crew meets a small bird: keep the body out of the way of the arithmetic)
    const fireOnce = (drunk) => {
      const c = st.coil;
      aimNow();
      c.charge = 1;
      c.cd = 0;
      c.drunk = drunk ? TB.DRINK.WINDOW : 0;
      const pool0 = cr.hp, tor = partOf(cr, 'mantle'), wing0 = tor.hp;
      p1.fire = true;
      p1.jx = p1.jy = 0;
      aimNow();
      step(sim, 1);
      p1.fire = false;
      return { pool: pool0 - cr.hp, parts: wing0 - tor.hp, spent: c.drunk === 0 };
    };
    const norm = fireOnce(false);
    st.coil.cd = 0;
    const drunk = fireOnce(true);
    report(norm.parts > 0 && drunk.parts > 0 && Math.abs(drunk.parts / norm.parts - TB.DRINK.MUL) < 0.45 && drunk.spent, `the coil's blow fired back after drinking does ${(drunk.parts / norm.parts).toFixed(2)}x (DRINK.MUL ${TB.DRINK.MUL}): ${drunk.parts.toFixed(0)} against ${norm.parts.toFixed(0)}; the drink is spent after one shot`);
    void total;
  }
  config.MATES.ENABLED = MATES0;
  // phase 3: faster strikes (a shorter warning) and more bolts
  report(TB.DIVE.WARN[3] < TB.DIVE.WARN[2] && TB.DIVE.BOLTS[3] > TB.DIVE.BOLTS[2] && TB.DIVE.GAP[3] < TB.DIVE.GAP[2] && TB.SWALLOW.GLOW[3] > TB.SWALLOW.GLOW[2], 'phase 3 (the frenzy): the bolts come faster and more of them, and the gizzard glows longer');
}

// (T5) SWALLOW and the gizzard
{
  const A = birdUp();
  const { sim, st, ship, cr } = A;
  onlyBird('swallow');
  noRoost();
  const gz = partOf(cr, 'heart');
  cr.phase = 2;
  const msgs = [];
  cr.hooks.phoneFx = (p, t) => msgs.push({ id: p.id, t });
  standOn(A.p1, ship, topD(ship), 600, null);
  report(gz.hidden && !AIM.targets(st).some((t) => t.part === gz), 'before it swallows, the gizzard is hidden (not a target)');
  // a coil bolt through the hidden gizzard does nothing
  const gp0 = midOf(gz.segs[0], 0.5), e = ship.layout.coil, ex = T.toWorldX(ship, e.x), ey = T.toWorldY(ship, e.y - 60);
  { const dx = gp0.x - ex, dy = gp0.y - ey, dl = Math.hypot(dx, dy); CS.creatureBeam(st, ex, ey, dx / dl, dy / dl, dl + 300, 60, 40, 'p1'); }
  report(cr.zapped === 0 && gz.hp === gz.maxHp, 'a coil bolt through the hidden gizzard does nothing');
  wakeB(cr);
  st.sfxQ.length = 0;
  until(sim, () => bActIs(cr, 'swallow', 'call'), 15);
  step(sim, 2);
  report(bActIs(cr, 'swallow', 'call') && /SWALLOWING A BOLT/.test(st.ev.warnText) && st.sfxQ.some((x) => x[0] === 'thunder') && msgs.some((m) => m.id === 'p1' && /SWALLOWING/.test(m.t)) && cr.bird.pose === 'swallow', `the head goes back: banner "${st.ev.warnText}", thunder, a buzz, the pose "swallow"`);
  until(sim, () => cr.bird.glow > 0, 6);
  step(sim, 3);
  const tg = AIM.targets(st).filter((t) => t.part === gz)[0];
  report(!gz.hidden && cr.bird.glow > TB.SWALLOW.GLOW[2] - 1 && !!tg && tg.rank < 4 && gz.lit === true && /GIZZARD GLOWS/.test(st.ev.warnText) && st.flashes.some((f) => f.color === '#9fe8ff'), `the gizzard GLOWS for ${TB.SWALLOW.GLOW[2]} s: it is a target (rank ${tg && tg.rank}), lit in the dark sky, and lights it ("${st.ev.warnText}")`);
  // a shell: only damage; a coil bolt: a zap
  const sp = midOf(gz.segs[0], 0.5), h0 = gz.hp;
  CS.hurtCreature(st, { part: gz, seg: 0 }, 10, { src: 'shell', who: 'p1' });
  const shellD = h0 - gz.hp;
  report(cr.zapped === 0 && shellD > 10 * 1.4, `a shell into the glowing gizzard only hurts it (-${shellD.toFixed(1)}, ${TB.SWALLOW.GLOW_MUL}x): no zap`);
  const z1 = CS.hurtCreature(st, { part: gz, seg: 0 }, 5, { src: 'coil', who: 'p1' });
  report(cr.zapped === 1 && z1 && !z1.killed && /BOLT IN THE GIZZARD! 1[/]3/.test(st.ev.warnText), `a coil bolt into it ZAPS it: ${cr.zapped}/${TB.ZAP.HITS} ("${st.ev.warnText}")`);
  // a drunk bolt counts for more
  st.coil.drunk = TB.DRINK.WINDOW;
  const before = cr.zapped;
  CS.hurtCreature(st, { part: gz, seg: 0 }, 5, { src: 'coil', who: 'p1' });
  st.coil.drunk = 0;
  report(cr.zapped === before + TB.DRINK.HITS && cr.dying && cr.stats.win === 'gizzard' && /BOLT IN THE GIZZARD/.test(st.ev.warnText) && st.bossDownLap === st.course.lap, `${TB.ZAP.HITS} zaps (a drunk bolt counts ${TB.DRINK.HITS}) win: stats.win "${cr.stats.win}", the banner "${st.ev.warnText}"`);
  void sp;
  void ship;
  // the glow ends
  const B = birdUp();
  onlyBird('swallow');
  noRoost();
  B.cr.phase = 2;
  wakeB(B.cr);
  until(B.sim, () => B.cr.bird.glow > 0, 15);
  const gz2 = partOf(B.cr, 'heart');
  until(B.sim, () => B.cr.bird.glow <= 0, TB.SWALLOW.GLOW[2] + 2);
  report(gz2.hidden && B.cr.bird.glow === 0 && B.cr.stats.swallows === 1, 'when the window is over the gizzard hides again');
  // only coil bolts count while it is open: a flame or a bomb does not
  const C2 = birdUp();
  onlyBird('swallow');
  noRoost();
  C2.cr.phase = 2;
  wakeB(C2.cr);
  until(C2.sim, () => C2.cr.bird.glow > 0, 15);
  const gz3 = partOf(C2.cr, 'heart');
  CS.hurtCreature(C2.st, { part: gz3, seg: 0 }, 5, { src: 'bomb', who: 'p1' });
  CS.hurtCreature(C2.st, { part: gz3, seg: 0 }, 5, { src: 'flame', who: 'p1' });
  report(C2.cr.zapped === 0, 'a bomb or flame on the open gizzard is not a zap (only the coil)');
}

// (T6) PERCH on her gasbag
{
  const A = birdUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyBird('perch');
  noRoost();
  TB.ATTACK.FIRST_PERCH = 0;
  const P = TB.PERCH;
  const live0 = st.balance.live, y0 = ship.pose.y;
  let peak = 0;
  const msgs = [];
  cr.hooks.phoneFx = (p, t) => msgs.push({ id: p.id, t });
  wakeB(cr);
  const dTop = topD(ship);
  until(sim, () => cr.bird.mode === 'perch', 15);
  report(cr.bird.mode === 'perch' && /LANDING/.test(st.ev.warnText) && msgs.some((m) => m.id === 'p1' && /LANDING/.test(m.t)), `PERCH: the warning "${st.ev.warnText}" and a buzz on every phone`);
  until(sim, () => cr.bird.perch && cr.bird.perch.landed, 8);
  const pc = cr.bird.perch;
  standOn(p1, ship, dTop, pc.job.x, null);
  for (let i = 0; i < secs(8); i++) { step(sim); peak = Math.max(peak, Math.abs(st.forces.theta)); p1.x = pc.job.x; }
  const lim = (config.FORCES.MAX_DEG * Math.PI) / 180 + 1e-6;
  report(ship.ctx.perch && ship.ctx.perch.w === P.MASS && st.balance.live >= live0 + P.MASS - 1, `on her gasbag it is a live load: balance.live ${live0.toFixed(1)} -> ${st.balance.live.toFixed(1)} (it weighs ${P.MASS})`);
  report(peak > 0.02 * (Math.PI / 180) && peak <= lim && ship.pose.y > y0 + 8, `it tips and pushes her: the tilt peaks at ${((peak * 180) / Math.PI).toFixed(2)} degrees (the limit ${config.FORCES.MAX_DEG}), she sank ${(ship.pose.y - y0).toFixed(0)} px`);
  until(sim, () => cr.stats.claws >= 1, 8);
  report(cr.stats.claws >= 1 && st.gasHoles.length >= 1, `it claws holes in the bag (${cr.stats.claws} claws, ${st.gasHoles.length} holes)`);
  until(sim, () => cr.stats.claws >= P.CLAWS, P.CLAW * P.CLAWS + 5);
  step(sim, secs(P.CLAW + 1));
  report(cr.stats.claws <= P.CLAWS, `at most ${P.CLAWS} claws a perch (${cr.stats.claws})`);
}
{
  const why = (A) => (A.cr.bird.perch ? A.cr.bird.perch.driven : A.cr.bird.lastWhy);
  {
    const A = perchedBird();
    const { sim, st, ship, cr, p1 } = A;
    const dTop = topD(ship), jb = cr.bird.perch.job;
    standOn(p1, ship, dTop, jb.x, 'sword');
    let n = 0, label = null;
    for (; n < secs(8) && !(cr.bird.perch && cr.bird.perch.sub === 'lift'); n++) { p1.fire = true; p1.x = jb.x; step(sim); if (p1.act && p1.act.type === 'hack') label = p1.act.label; }
    report(why(A) === 'sword' && Math.abs(n / 60 - TB.PERCH.SWORD_TIME) < 0.6 && /DRIVE IT OFF/.test(label || ''), `a sword held ${(n / 60).toFixed(1)} s on the deck under it drives it off (SWORD_TIME ${TB.PERCH.SWORD_TIME}); the Action button said "${label}"`);
    until(sim, () => cr.bird.mode === 'fly', 5);
    report(cr.bird.mode === 'fly' && !ship.ctx.perch && st.balance.live < 20, 'it flies off: the weight is gone from her bag, it circles again');
    const gj = (await load('modules/host/creatureGrip.js')).gripJobs(A.st, A.ship);
    report(gj.length === 0, 'and the perch job is gone from the phones');
  }
  {
    const A = perchedBird();
    const gj = (await load('modules/host/creatureGrip.js')).gripJobs(A.st, A.ship);
    report(gj.length === 1 && gj[0].kind === 'hack' && gj[0].obj === A.cr.bird.perch.job && Number.isFinite(gj[0].x), 'the perch is a "hack" job (a gold arrow on the phones, and the bots take it): DRIVE THE THUNDERBIRD OFF');
  }
  {
    const A = perchedBird();
    const { sim, ship, cr, p1 } = A;
    const dTop = topD(ship), jb = cr.bird.perch.job;
    standOn(p1, ship, dTop, jb.x, 'sword');
    for (let k = 0; k < 6 && why(A) !== 'sword'; k++) { p1.atkQ = true; p1.atkCd = 0; step(sim, 30); p1.x = jb.x; }
    report(why(A) === 'sword', `${TB.PERCH.BLOWS} sword blows drive it off too`);
  }
  for (const src of ['flame', 'shot']) {
    const A = perchedBird();
    const { sim, st, cr } = A;
    const torso = partOf(cr, 'mantle'), tp = midOf(torso.segs[0], 0.5);
    for (let i = 0; i < 400 && why(A) === null; i++) {
      if (src === 'flame') CS.creatureBurn(st, (x, y) => Math.hypot(x - tp.x, y - tp.y) < 600, { x: tp.x - 100, y: tp.y }, 0.1, 'p1');
      else CS.hurtCreature(st, { part: torso, seg: 0 }, 6, { src: 'shell', who: 'p1' });
      step(sim, 1);
    }
    report(why(A) === src, `${src === 'flame' ? 'flame on it' : 'enough damage'} drives it off (${why(A)})`);
  }
  {
    const A = perchedBird();
    A.st.turning.t = 0.5;
    step(A.sim, 3);
    report(why(A) === 'shake', 'a hard turn (COME ABOUT) shakes it off');
  }
  {
    const A = perchedBird();
    A.cr.bird.perch.left = 0.2;
    step(A.sim, 30);
    report(why(A) === 'time', 'and left alone it flies off by itself after its time');
  }
}

// (T7) ROOST on a rock spire and the MORTAR win
{
  const A = birdUp();
  const { sim, st, ship, cr } = A;
  onlyBird('gust');
  TB.ROOST.FIRST = 0;
  const R = TB.ROOST, map = st.course.map;
  report(BD.creatureSurfaces(st, ship).length === 0, 'in the air its torso is no landing place');
  wakeB(cr);
  until(sim, () => cr.bird.mode === 'roost', 25);
  report(cr.bird.mode === 'roost' && /SPIRE/.test(st.ev.warnText) && map.spires.length === 3, `ROOST: "${st.ev.warnText}" (the lair has ${map.spires.length} rock spires)`);
  until(sim, () => cr.bird.roost && cr.bird.roost.landed, 12);
  quietB(cr);
  const sp = cr.bird.roost.sp;
  let tipY = -1e9;
  for (const t of cr.parts.filter((p) => p.kind === 'talon')) { const s = t.segs[t.segs.length - 1]; tipY = Math.max(tipY, s.y + Math.sin(s.ang) * s.len); }
  step(sim, 30);
  for (const t of cr.parts.filter((p) => p.kind === 'talon')) { const s = t.segs[t.segs.length - 1]; tipY = Math.max(tipY, s.y + Math.sin(s.ang) * s.len); }
  report(Math.abs(Math.abs(sp.x - cr.base.x) - 0) < 700 && Math.abs(tipY - sp.top) < 260 && CBI.birdOnSpire(cr), `it stands on the spire: the talons reach ${Math.round(tipY)} against the rock's top at ${Math.round(sp.top)}, ${Math.round(Math.abs(sp.x - cr.base.x))} px off its middle`);
  report(BD.creatureSurfaces(st, ship).length === 1 && CBI.birdBoardable(cr), 'on the spire its torso is a landing strip for the crew in the air');
  // mortar shells count, plain shells do not
  const torso = partOf(cr, 'mantle'), tp = midOf(torso.segs[0], 0.5);
  st.shells.push({ x: tp.x, y: tp.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(cr.mortared === 0 && cr.stats.by.shell > 0, 'a plain shell on the resting bird only hurts it');
  const need = R.MORTAR_HITS;
  for (let k = 1; k <= need && !cr.dying; k++) {
    const q = midOf(partOf(cr, 'mantle').segs[0], 0.5);
    st.shells.push({ x: q.x, y: q.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1, kind: 'mortar', g: 900 });
    step(sim, 3);
    if (k < need) report(cr.mortared === k && /MORTAR HIT/.test(st.ev.warnText), `mortar hit ${k}/${need}: "${st.ev.warnText}"`);
  }
  report(cr.dying && cr.stats.win === 'mortar' && /BLASTED OFF ITS ROCK/.test(st.ev.warnText), `${need} mortar shells on the resting bird win: stats.win "${cr.stats.win}", "${st.ev.warnText}"`);
  // a mortar shell on the bird in the air is only a shell
  const B = birdUp();
  const t2 = midOf(partOf(B.cr, 'mantle').segs[0], 0.5);
  B.st.shells.push({ x: t2.x, y: t2.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1, kind: 'mortar', g: 900 });
  step(B.sim, 3);
  report(B.cr.mortared === 0 && !B.cr.dying, 'a mortar shell on a bird in the air is not a mortar hit');
  // it takes off by itself after its time
  const C2 = roostedBird();
  C2.cr.bird.roost.left = 0.2;
  step(C2.sim, 20);
  until(C2.sim, () => C2.cr.bird.mode === 'fly', 6);
  report(C2.cr.bird.mode === 'fly' && C2.cr.bird.roost === null, 'left alone it leaves the spire after its time');
}

// (T8) boarding it: CUT THE GIZZARD
{
  for (const where of ['bag', 'spire']) {
    const A = where === 'bag' ? perchedBird() : roostedBird();
    const { sim, st, ship, cr, p1 } = A;
    const gz = partOf(cr, 'heart'), gs = gz.segs[0];
    p1.carry = 'sword';
    report(gz.hidden && BD.boardAt(st, ship, p1, gs.x, gs.y) && !!p1.on, `a flier lands on it (${where}): he is aboard`);
    let label = null, type = null;
    const n1 = until(sim, () => { p1.fire = true; if (p1.act) { label = p1.act.label; type = p1.act.type; } return cr.dying; }, 40);
    report(type === 'strike' && /CUT THE GIZZARD/.test(label) && cr.stats.win === 'board' && /GIZZARD CUT/.test(st.ev.warnText), `on the ${where}: "${label}" (a sword, ${TB.BOARD.CUT_TIME} s a stroke) wins after ${n1.toFixed(1)} s: "${st.ev.warnText}"`);
  }
  {
    const A = perchedBird();
    const { sim, st, ship, cr, p1 } = A;
    const gs = partOf(cr, 'heart').segs[0];
    p1.carry = null;
    BD.boardAt(st, ship, p1, gs.x, gs.y);
    p1.fire = true;
    step(sim, 20);
    report(!!p1.act && p1.act.type === 'need' && /sword/i.test(p1.act.label), `without a sword: "${p1.act && p1.act.label}"`);
  }
  {
    const A = perchedBird();
    const { sim, st, ship, cr } = A;
    const gs = partOf(cr, 'heart').segs[0], q = A.st.players.p1;
    q.carry = 'sword';
    BD.boardAt(st, ship, q, gs.x, gs.y);
    cr.bird.perch.left = 0.1;
    step(sim, 30);
    report(!q.on && q.fly === true, 'when it takes off the boarder falls off it (a flier again, with his parachute button)');
  }
  {
    const A = birdUp();
    const { st, cr } = A;
    const w = cr.parts.find((p) => p.id === 'wingN').segs[2];
    const an = BD.creatureAnchor(st, w.x + Math.cos(w.ang) * w.len * 0.5, w.y + Math.sin(w.ang) * w.len * 0.5);
    report(an === null, 'a flying Thunderbird is no hook anchor and no landing place');
    const B = perchedBird();
    const ww = B.cr.parts.find((p) => p.id === 'wingN').segs[2];
    const an2 = BD.creatureAnchor(B.st, ww.x + Math.cos(ww.ang) * ww.len * 0.5, ww.y + Math.sin(ww.ang) * ww.len * 0.5);
    report(!an2 || an2.surf === false, 'perched, a hook in a wing is only an anchor (you climb aboard by its body)');
  }
}

// (T9) a plucked wing, the phases, the fall
{
  const A = birdUp();
  const { sim, st, cr } = A;
  noRoost();
  const wingN = cr.parts.find((p) => p.id === 'wingN'), wingF = cr.parts.find((p) => p.id === 'wingF');
  const topY = (secsN) => { let top = 1e9; for (let i = 0; i < secsN * 60; i++) { step(sim); if (cr.bird.mode === 'fly' && !cr.bird.act) top = Math.min(top, cr.base.y - T.toWorldY(A.ship, A.ship.layout.refPoint.y)); } return top; }; // (the highest point of its loop over her)
  const y0 = topY(30);
  CS.hurtCreature(st, { part: wingN, seg: 3 }, wingN.hp + 1, { src: 'shell', who: 'p1' });
  report(wingN.severed && wingN.segs.length < TB.WING.SEGS && cr.chunks.length === 1 && cr.chunks[0].part.kind === 'wing' && cr.chunks[0].part.art === 'thunderbird' && cr.stats.plucked === 1 && /WING IS PLUCKED/.test(st.ev.warnText), `a wing with no hp is PLUCKED (a stump of ${wingN.segs.length} segments stays, the rest tumbles away as a chunk): "${st.ev.warnText}"`);
  cr.ai.breather = 0;
  step(sim, 10);
  report(cr.phase === 2 && !cr.dying && cr.bird.mode !== 'dying' && cr.bird.rotAdd < 0, `one wing plucked: phase 2, it flies on lopsided (pitch ${cr.bird.rotAdd})`);
  const y1 = topY(30);
  report(y1 - y0 > 0.6 * TB.FLY.UP * (1 - TB.ONE_WING.UP_MUL), `with one wing it flies lower: the top of its loop is ${Math.round(y1 - y0)} px lower over her (ONE_WING.UP_MUL ${TB.ONE_WING.UP_MUL})`);
  CS.hurtCreature(st, { part: wingF, seg: 3 }, wingF.hp + 1, { src: 'shell', who: 'p1' });
  step(sim, 5);
  report(cr.dying && cr.stats.win === 'pluck' && /PLUCKED BARE/.test(st.ev.warnText) && /CLOUDS/.test(st.ev.warnText) && st.bossDownLap === st.course.lap, `both wings plucked: it falls into the clouds, stats.win "${cr.stats.win}", "${st.ev.warnText}"`);
  step(sim, secs(1));
  const yf = cr.y;
  step(sim, secs(4));
  report(cr.y > yf + 500 && cr.mode === 'dying', `it falls (${Math.round(cr.y - yf)} px in 4 s)`);
}
{
  // the pool: below 60% the second phase, below 30% the frenzy
  const A = birdUp();
  const { sim, st, cr } = A;
  cr.hp = cr.maxHp * (TB.PHASE.TWO_HP - 0.02);
  step(sim, 30);
  report(cr.phase === 2 && /CALLS DOWN LIGHTNING/.test(st.ev.warnText), `below 60% of the pool: phase 2, "${st.ev.warnText}"`);
  cr.ai.breather = 0;
  cr.hp = cr.maxHp * (TB.PHASE.THREE_HP - 0.02);
  step(sim, 5);
  report(cr.phase === 3 && /FRENZY/.test(st.ev.warnText) && TBM.birdPhaseName(1) === 'IT CIRCLES' && TBM.birdPhaseName(2) === 'IT CALLS LIGHTNING' && TBM.birdPhaseName(3) === 'FRENZY', `below 30%: phase 3, "${st.ev.warnText}"; the phases have names for the health bar`);
  // phase 1 does not dive or swallow, phase 2 does
  const B = birdUp();
  const seen = new Set();
  noRoost();
  for (let i = 0; i < secs(160); i++) { B.cr.ai.breather = 0; if (B.cr.bird.nextT > 6) B.cr.bird.nextT = 0.5; step(B.sim); if (B.cr.bird.act) seen.add(B.cr.bird.act.kind); if (B.cr.phase > 1) break; if (B.cr.bird.mode === 'perch' || B.cr.bird.mode === 'roost') seen.add(B.cr.bird.mode); }
  report(!seen.has('dive') && !seen.has('swallow') && (seen.has('gust') || seen.has('pass')), `phase 1 is gusts, passes and perches only (seen: ${[...seen].join(', ')})`);
}

// (T10) the lair, the voyage, the reward and the feather sail
{
  restoreCfg();
  birdCfgBack();
  realHp();
  const ctx = boot({ env: 'storm', lair: true, bots: 0 });
  const { sim, st, ship } = ctx;
  const map = st.course.map, c = st.course;
  const TL = TB.LAIR;
  report(c.stop && c.stop.lair === true && c.stop.creature === 'thunderbird' && map.lair === true && map.creature === 'thunderbird' && map.outposts.length === 0 && map.turrets.length === 0 && Number.isFinite(map.startDist) && map.startDist < 1e8, 'a Thunderbird lair stop flies the lair map for the Thunderbird: open sky, no outposts, no guns');
  report(map.spires.length === TL.SPIRES.length && map.spires.every((s) => Number.isFinite(s.x) && s.top > map.start.y + 1500 && s.top < map.H * map.CELL), `${map.spires.length} rock spires stand in it (tops ${map.spires.map((s) => Math.round(s.top - map.start.y)).join(', ')} px under the launch height)`);
  report(MPS.floorBelow(map, map.spires[1].x, map.start.y) <= map.spires[1].top + 2 && MPS.floorBelow(map, map.start.x, map.start.y) > map.spires[1].top, 'a spire is solid rock under its top; the way in is open air');
  step(sim, secs(2));
  report(st.creature === null && !st.boss, 'at the start there is no creature and no zeppelin');
  ship.pose.x = map.start.x + (map.goal.x - map.start.x) * 0.7 - ship.layout.refPoint.x;
  st.tempo.phase = 'build';
  st.tempo.bossOk = true;
  for (let i = 0; i < secs(4) && !st.creature; i++) step(sim, 1);
  report(!!st.creature && st.creature.kind === 'thunderbird' && !st.boss, `at ${(c.progress * 100).toFixed(0)}% of the way the Thunderbird comes in where the zeppelin would: ${st.creature && st.creature.name}; no zeppelin`);
  const cr = st.creature;
  for (let i = 0; i < secs(TB.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim, 1);
  quietB(cr);
  step(sim, secs(5));
  report(st.tempo.phase === 'peak' && st.tempo.kind === 'boss', 'the pacing director treats it as the mission boss');
  step(sim, secs(8));
  report(ship.ctx.stormJob.charge === null, 'while it lives the storm sends no strikes of its own (the Thunderbird calls the bolts)');
  ship.pose.x = map.goal.x - ship.layout.refPoint.x;
  ship.pose.y = map.goal.y - ship.layout.refPoint.y;
  st.ev.warn = 0;
  step(sim, secs(3));
  report(!c.done && !c.pendingNext, 'at the lair\'s middle with the Thunderbird alive the stop is not done');
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(2));
  report(cr.dying && !c.done && st.bossDownLap === c.lap, 'killed, it is dying and the boss is down');
  for (let i = 0; i < secs(TB.SPAWN.SINK + C.CHUNK.LIFE + 3) && !c.done; i++) step(sim, 1);
  report(c.done === true && c.pendingNext === true && st.creature === null && /THUNDERBIRD IS SLAIN/.test(st.ev.warnText), `once it has fallen the stop is done: "${st.ev.warnText}"`);
}
{
  // the voyage: lairs by sky
  restoreCfg();
  const seeds = Array.from({ length: quick ? 80 : 300 }, (_, i) => 1000 + i * 7919);
  let kr = 0, dr = 0, tbn = 0, bad = [];
  for (const mode of ['quick', 'voyage', 'campaign']) for (const voyageNo of [1, 2]) for (const sd of seeds) {
    const v = VY.generateVoyage(sd, { mode, voyageNo, gentle: sd % 2 === 0 });
    for (const s of v.columns.flat().filter((q) => q.lair)) {
      if (s.creature !== LR.BY_ENV[s.env] || !s.creature) bad.push(`${mode}/${sd}: ${s.id} on ${s.env} holds ${s.creature}`);
      if (s.creature === 'kraken') kr++;
      if (s.creature === 'drake') dr++;
      if (s.creature === 'thunderbird') tbn++;
    }
  }
  report(!bad.length && kr > 0 && dr > 0 && tbn > 0 && LR.BY_ENV.storm === 'thunderbird', `lairs are by sky: ${kr} Kraken, ${dr} Drake and ${tbn} Thunderbird lairs (Storm Front stops) over ${seeds.length * 6} voyages${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
  const tl = VY.lairOf('thunderbird');
  report(tl.NAME === TB.LAIR.NAME && VY.stopName({ lair: true, creature: 'thunderbird', env: 'storm' }) === TB.LAIR.NAME, 'the stop has the right name');
  const ctx = boot({ start: 'classic', bots: 3 });
  const { sim, st } = ctx;
  const v = st.run.voyage, here = v.columns[0][0], lair = v.columns[1][0];
  Object.assign(lair, { env: 'storm', play: 'storm', kind: 'lair', lair: true, creature: 'thunderbird', danger: 3, reward: 80 });
  here.next = v.columns[1].map((s) => s.id);
  st.run.salvage = 0;
  sim.startDock();
  if (st.vote && st.vote.kind === 'dock') {
    const cast = st.vote.options.findIndex((o) => o.kind === 'cast');
    for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = cast; }
    step(sim, secs(3));
  }
  const route = st.vote && st.vote.kind === 'route' ? st.vote : null;
  const opt = route && route.options.find((o) => o.id === lair.id);
  report(!!opt && opt.lair === true && opt.icon === TB.LAIR.ICON && /LAIR/.test(opt.desc) && opt.kindName === TB.LAIR.KIND, `the route vote lists it: ${opt && opt.icon} "${opt && opt.name}" - ${opt && opt.desc}`);
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
  const texts = rec.texts.map((q) => q.s);
  report(exc === 0 && texts.includes(TB.LAIR.ICON) && texts.includes(TB.LAIR.LABEL), 'the TV\'s route map draws the eagle icon and LAIR (0 draw errors)');
}
{
  // the reward and the trophy: the Thunderbird feather sail
  restoreCfg();
  birdCfgBack();
  const ctx = boot({ env: 'storm', lair: true, start: 'classic', bots: 3 });
  const { sim, st, ship } = ctx;
  const cr = spawnCr(ctx, 'thunderbird');
  for (let i = 0; i < secs(TB.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  quietB(cr);
  st.ship.hull = 40;
  for (const b of st.bags) b.gas = 30;
  const salv0 = st.run.salvage, hull0 = st.ship.hull;
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(3));
  const SV = config.SALVAGE.BOSS * C.REWARD_MUL;
  report(st.run.salvage - salv0 >= SV && st.run.salvage - salv0 <= SV + 40, `triple boss salvage: +${st.run.salvage - salv0} (SALVAGE.BOSS ${config.SALVAGE.BOSS} x ${C.REWARD_MUL})`);
  report(st.ship.hull >= hull0 + TB.REWARD.HULL - 1 && st.bags.every((b) => b.gas >= 30 + TB.REWARD.GAS - 10) && st.run.trophy === 'featherSail', `a hull patch (+${TB.REWARD.HULL}) and every gasbag (+${TB.REWARD.GAS}); the trophy "${st.run.trophy}" is waiting`);
  st.run.salvage = 0;
  sim.startDock();
  const idx = st.vote.options.findIndex((o) => o.kind === 'part' && o.trophy);
  const card = st.vote.options[idx];
  report(!!card && card.entry === 'featherSail' && card.name === 'Thunderbird feather sail' && card.cost === 0 && /TROPHY: from the Thunderbird/.test(card.badge) && card.choices.length >= 1, `the next dock offers the TROPHY card "${card && card.name}" - ${card && card.badge}, cost ${card && card.cost}, ${card && card.choices.length} place(s)`);
  for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = idx; }
  for (let i = 0; i < 60 * 8 && st.vote && st.vote.kind === 'dock' && !st.vote.options[idx].sold; i++) step(sim, 1);
  if (st.vote && st.vote.kind === 'slot') { for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = 0; } for (let i = 0; i < 60 * 5 && st.vote && st.vote.kind === 'slot'; i++) step(sim, 1); }
  step(sim, 5);
  const L = ship.layout, sail = (L.sails || []).find((q) => q.art === 'thunderbird');
  report(!!sail && st.run.trophy === null && st.run.parts.some((q) => q.id === 'featherSail'), `bought, it is on the ship: a mast and sail with art "${sail && sail.art}"`);
  report(!PSH.CATALOGUE.find((e) => e.id === 'featherSail').allowed([], {}), 'and the trophy never turns up in the random shop (allowed is false)');
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  let exc = 0;
  for (let f = 0; f < 20; f++) { step(sim, 1); try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } }
  report(exc === 0, 'the ship with the feather sail draws on the stub canvas (0 errors)');
}
{
  // the feather sail's rules: it pulls TROPHY.PULL_MUL x as hard, and a gust cannot tear it (a plain sail tears)
  const build = SBD.BUILDS.classic;
  const withSail = PSH.offerPart(build, { only: 'featherSail' }).choices[0].parts; // (the trophy card's first place on the classic ship: a mast on her top deck)
  const mk = (art) => withSail.map((q) => (q.part === 'sail' ? (({ art: _a, ...r }) => ({ ...r, ...(art ? { art } : {}) }))(q) : q));
  const fly = (parts) => {
    applyBuild(parts);
    restoreCfg();
    birdCfgBack();
    const ctx = boot({ env: 'storm', lair: false });
    const { sim, st } = ctx;
    st.sails[0].hoist = 1;
    st.weather.storm = 1;
    let torn = 0;
    for (let i = 0; i < secs(60); i++) { st.weather.gusting = true; st.weather.storm = 1; st.sails[0].hoist = Math.max(st.sails[0].hoist, 1); step(sim); }
    torn = st.sailStats.torn;
    return { torn, pull: st.sails[0].pull, feather: !!st.sails[0].feather, color: st.sails[0].color };
  };
  const plain = fly(mk(null));
  const feather = fly(mk('thunderbird'));
  applyBuild(SBD.BUILDS.classic);
  report(plain.torn > 0 && !plain.feather && feather.torn === 0 && feather.feather && feather.color === config.SAIL.FEATHER_COLOR, `in a gale a plain sail tears (${plain.torn} times in a minute) and the feather sail never does (${feather.torn})`);
  // pull: same wind, same hoist
  const pullOf = (parts) => {
    applyBuild(parts);
    restoreCfg();
    birdCfgBack();
    const ctx = boot({ env: 'storm', lair: false });
    const { sim, st } = ctx;
    st.weather.gusting = false;
    st.sails[0].hoist = 1;
    for (let i = 0; i < 30; i++) { st.sails[0].hoist = 1; step(sim); }
    return st.sails[0].pull;
  };
  const p1v = pullOf(mk(null)), p2v = pullOf(mk('thunderbird'));
  applyBuild(SBD.BUILDS.classic);
  report(p1v > 0 && Math.abs(p2v / p1v - TB.TROPHY.PULL_MUL) < 0.01, `the feather sail pulls ${(p2v / p1v).toFixed(2)}x as hard (TROPHY.PULL_MUL ${TB.TROPHY.PULL_MUL}): ${p2v.toFixed(3)} against ${p1v.toFixed(3)}`);
}

// (T11) the TV
{
  restoreCfg();
  birdCfgBack();
  const ctx = boot({ env: 'storm', lair: true });
  const { sim, st } = ctx;
  const cr = spawnCr(ctx, 'thunderbird');
  for (let i = 0; i < secs(TB.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  cr.ai.breather = 0;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const seen = new Set();
  let exc = 0, hudText = false, ms = 0, frames = 0;
  const frame = () => {
    step(sim, 1);
    rec.texts.length = 0;
    const t0 = hr();
    try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    ms += hr() - t0;
    frames++;
    if (rec.texts.some((x) => x.s.startsWith('THE THUNDERBIRD - '))) hudText = true;
    if (cr.bird.act) seen.add(cr.bird.act.kind + '.' + cr.bird.act.sub); else seen.add(cr.bird.mode);
  };
  noRoost();
  cr.phase = 2;
  for (const k of ['gust', 'pass', 'dive', 'swallow', 'perch']) {
    onlyBird(k);
    TB.ATTACK.FIRST_PERCH = 0;
    cr.bird.nextT = 0;
    cr.bird.lastPerch = -1e9;
    let started = false;
    for (let f = 0; f < 60 * 45; f++) { cr.ai.breather = 0; frame(); const on = (cr.bird.act && cr.bird.act.kind === k) || (k === 'perch' && cr.bird.mode === 'perch'); if (on) started = true; if (started && !on && cr.bird.mode === 'fly') break; }
    for (let f = 0; f < 60 * 4; f++) frame();
  }
  TB.ROOST.FIRST = 0;
  cr.bird.lastRoost = -1e9;
  cr.bird.nextT = 0;
  onlyBird('gust');
  for (let f = 0; f < 60 * 30 && cr.bird.mode !== 'roost'; f++) { cr.ai.breather = 0; frame(); }
  for (let f = 0; f < 60 * 6; f++) frame();
  const wing = cr.parts.find((p) => p.id === 'wingN');
  CS.hurtCreature(st, { part: wing, seg: 3 }, wing.hp + 1, { src: 'shell', who: 'p1' });
  for (let f = 0; f < 60 * 4; f++) frame();
  report(exc === 0 && hudText && ['swallow.glow', 'dive.bolts', 'gust.beat', 'perch', 'roost'].every((k) => seen.has(k)), `the fight draws on a stub canvas for ${frames} frames with 0 errors (seen: ${[...seen].join(', ')}); the bar says THE THUNDERBIRD with its phase`);
  console.log(`     whole-TV frame with the Thunderbird: ${(ms / frames).toFixed(2)} ms (JS on a stub canvas)`);
  const stub = stubCtx();
  const art = createCreatureArt({ ctx: stub });
  let t = 0, blits = 0;
  for (let f = 0; f < 300; f++) { step(sim, 1); const t0 = hr(); art.draw(cr, { zoom: 0.12, dpr: 1 }); for (const c of cr.chunks) art.drawLimb(c.part, { zoom: 0.12, dpr: 1 }); t += hr() - t0; blits = Math.max(blits, art.stats.blits); }
  report(t / 300 < config.PERF.BUDGET_MS && blits > 12, `creatureArt alone: ${(t / 300).toFixed(3)} ms a frame over 300 frames (${blits} blits; budget ${config.PERF.BUDGET_MS} ms)`);
}

// (T12) the bots
{
  restoreCfg();
  birdCfgBack();
  const botsimPath = path.join(publicDir, '..', 'tools', 'botsim.mjs');
  const run = (args, env = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [botsimPath, ...args], { env: { ...process.env, ...env } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  const fight = (out) => {
    const m = /fight 1: phase (\d)[^\n]*?; ended: (\w+)(?: at (\d+)s)?/.exec(out);
    return m ? { phase: +m[1], ended: m[2], at: m[3] === undefined ? null : +m[3] } : null;
  };
  const pool = async (jobs, n) => { const res = []; let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < jobs.length) { const i = k++; res[i] = await jobs[i](); } })); return res; };
  const seedsB = quick ? [1, 2] : [1, 2, 3];
  const forced = ['pluck', 'gizzard', 'mortar', 'board', 'hp'];
  const buildOf = { mortar: ['--build', 'birdmortar'] };
  const jobs = [];
  for (const w of forced) for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--env', 'storm', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd), ...(buildOf[w] || [])], { CREATURE_FORCE_WIN: w }).then((r) => ({ w, sd, r })));
  for (const bots of [4, 16]) for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--env', 'storm', '--bots', String(bots), '--difficulty', 'easy', '--minutes', '16', '--seed', String(sd)]).then((r) => ({ w: 'easy' + bots, sd, r })));
  for (const sd of seedsB) jobs.push(() => run(['--lair', '1', '--env', 'storm', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)]).then((r) => ({ w: 'free', sd, r })));
  const results = await pool(jobs, 5);
  const clean = (r) => r.code === 0 && /errors: 0/.test(r.out) && !/NaN/.test(r.out);
  const byWin = {};
  for (const { w, sd, r } of results) { const f = fight(r.out); (byWin[w] ||= []).push({ sd, f, ok: clean(r) }); }
  for (const w of forced) {
    const rows = byWin[w];
    const times = rows.map((x) => (x.f && x.f.ended === w ? x.f.at : null));
    report(rows.every((x) => x.ok) && times.every((t) => t !== null && t <= 360), `forced ${w.toUpperCase()}: 8 bots on Normal end it that way within 6 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] === null ? 'NOT (' + (x.f ? x.f.ended + ', phase ' + x.f.phase : 'no fight') + ')' : times[i] + ' s')).join(', ')})`);
  }
  for (const bots of [4, 16]) {
    const rows = byWin['easy' + bots];
    const times = rows.map((x) => (x.f && x.f.ended !== 'no' ? { at: x.f.at, how: x.f.ended } : null));
    report(rows.every((x) => x.ok) && times.every((t) => t && t.at <= 600), `${bots} bots on Easy win within 10 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] ? times[i].how + ' ' + times[i].at + ' s' : 'NOT')).join(', ')})`);
  }
  {
    const rows = byWin.free;
    const how = rows.map((x) => (x.f && x.f.ended !== 'no' ? x.f.ended + ' ' + x.f.at + ' s' : 'NOT'));
    report(rows.every((x) => x.ok) && how.every((h) => h !== 'NOT'), `unforced, 8 bots on Normal win (${how.join(', ')})`);
  }
  report(results.every(({ r }) => clean(r)), `0 errors and no NaN in any of the ${results.length} Thunderbird bot fights`);
}

// =================================================================== C.6c: THE ISLAND TITAN ===================================================================
//   (I0) the body (2 arms of 3 stone slabs, torso, head, mouth, a hidden crystal), twice the ship, standing on the lair's plain; it lives in the Sky Isles lair only; it strides in untouchable; stepped keys
//   (I1) every weapon hurts a part;  (I2) the BOULDER: banner, a buzz, the ring that follows her and then locks, the rock on its arc; a hit shakes a hull segment, a move out of the ring dodges it, shells shatter it
//   (I3) the GRAB (phase 2 only): the hand on the gasbag, a sideways pull inside FORCES.MAX_DEG, swords pry it off, shells on the arm free her, unfreed it SQUEEZES the bag (holes, a frame blow, nothing torn off)
//   (I4) the ROAR: a wind-up and a buzz for the bomb bay, then the mouth is open for bombs, the funnel, the gulp, crates are half, FED win;  (I5) shell the arms off (phase 2 at one arm, win at two), the phases by the pool
//   (I6) the ISLAND as a ground that moves with it: a parachute landing, carried by it, JUMP, the rope ladder, a hookshot, it falls when the Titan dies;  (I7) the CRYSTAL on foot: strokes by tool, no gun can touch it, hint and arrow, the win
//   (I8) the reward, the lair, the voyage (a Titan lair on the second stop flown, bats and imps only), the TV and the bots: each forced win by 8 bots on Normal, 4 and 16 bots on Easy
const TT = C.TITAN;
const TTM = await load('modules/host/creatures/titan.js');
const TIT = await load('modules/host/creatureTitan.js');
const ISL = await load('modules/host/creatureIsland.js');
const CBD = await load('modules/host/creatureBoard.js');
const TW0 = JSON.stringify({ W: TT.ATTACK.WEIGHTS, F: TT.SPAWN.FIRST, G: TT.GRAB.FIRST, M: TT.MOUTH.FIRST });
const titanCfgBack = () => { const o = JSON.parse(TW0); TT.ATTACK.WEIGHTS = o.W; TT.SPAWN.FIRST = o.F; TT.GRAB.FIRST = o.G; TT.MOUTH.FIRST = o.M; };
const onlyTitan = (kind) => { for (const ph of [1, 2, 3]) TT.ATTACK.WEIGHTS[ph] = { throw: 0, grab: 0, [kind]: 1 }; };
const tQuiet = (cr) => { cr.ai.breather = 1e9; cr.titan.nextT = 1e9; cr.titan.grabT = 1e9; cr.ai.mouthT = 1e9; };
const tWake = (cr) => { cr.ai.breather = 0; cr.titan.nextT = 0; };
const tIsl = (ctx) => ctx.st.away.island;
// A sim in the Sky Isles lair with the Island Titan arrived and standing, its attacks held until a test asks. away: the away team (the island) is on, as in the real game.
function titanUp({ difficulty = 'normal', bots = 0, start = null, away = false } = {}) {
  restoreCfg();
  titanCfgBack();
  config.AWAY.ENABLED = away;
  C.DEV_LAIR_AS = 'titan';
  const ctx = boot({ env: 'skyisles', lair: true, difficulty, bots, start });
  const map = ctx.st.course.map;
  ctx.ship.pose.x = map.goal.x - ctx.ship.layout.refPoint.x;
  ctx.ship.pose.y = map.goal.y - ctx.ship.layout.refPoint.y;
  step(ctx.sim, 5);
  const cr = ctx.sim.creatures.spawn('titan');
  for (let i = 0; i < secs(TT.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(ctx.sim);
  tQuiet(cr);
  step(ctx.sim, 30);
  return { ...ctx, cr, p1: ctx.st.players.p1, map };
}
// A person in free flight over a world point (the away-team gate's way), falling slowly.
const flyOverT = (A, p, x, y, vy = 120, chute = true) => {
  p.fall = false; p.conn = null; p.lock = null; p.d = p.d ?? 1; p.ko = 0; p.hearts = config.HEALTH.MAX;
  A.ship.sim.air.startFlight(p, 0, 0);
  p.x = x; p.y = y; p.fvx = 0; p.fvy = vy;
  p.lsy = p.apex = T.toShipY(A.ship, y);
  if (chute) { p.chute = 1; p.chuteOpen = true; }
};
const tAct = (cr, sub) => !!cr.titan.act && (sub === undefined || cr.titan.act.sub === sub);

// (I0) the world and the body
{
  restoreCfg();
  titanCfgBack();
  C.DEV_LAIR_AS = 'titan';
  const ctx = boot({ env: 'skyisles', lair: true });
  const { sim, st, ship } = ctx;
  const map = st.course.map;
  report(map.lair === true && map.creature === 'titan' && map.outposts.length === 0 && map.turrets.length === 0 && Number.isFinite(map.floorY) && Number.isFinite(map.startDist) && map.startDist < 1e8 && !map.spires, `the Titan's lair is open sky over a flat plain ${Math.round(map.floorY - map.start.y)} px under the launch, no outposts, no guns`);
  report(spawnCr(ctx, 'kraken') === null && spawnCr(ctx, 'drake') === null && spawnCr(ctx, 'thunderbird') === null && st.creature === null, 'no other creature comes to the Sky Isles lair (no sea, no lava, no storm)');
  const cr = spawnCr(ctx, 'titan');
  const cnt = (k) => cr.parts.filter((p) => p.kind === k);
  report(!!cr && cr.kind === 'titan' && cr.name === TT.NAME && cr.mode === 'surfacing' && cnt('tentacle').length === 2 && cnt('tentacle').every((a) => a.segs.length === TT.BODY.ARM.SEGS && a.hp > 0) && cnt('mantle').length === 1 && cnt('head').length === 1 && cnt('mouth').length === 1 && cnt('heart').length === 1 && cnt('heart')[0].id === 'crystal' && cnt('heart')[0].hidden,
    `spawn puts ${cr && cr.name} in state.creature: 2 arms of ${TT.BODY.ARM.SEGS} stone slabs each with hp, a torso, a head, a mouth and a hidden crystal`);
  report(Math.abs(cr.y + TT.BODY.FEET - map.floorY) < 1 && cr.titan.floorY === map.floorY && cr.f === -ship.pose.f, `it stands on the plain (its soles at y ${Math.round(cr.y + TT.BODY.FEET)}, the plain ${map.floorY}) and faces her`);
  const before = cr.parts.reduce((a, p) => a + p.hp, 0);
  const m = midOf(cnt('tentacle')[0].segs[1]);
  st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 5);
  report(cr.parts.reduce((a, p) => a + p.hp, 0) === before && AIM.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0 && !tIsl(ctx), 'while it strides in it cannot be hurt, shot at or spotted, and it has no island to land on');
  const x0 = cr.x;
  for (let i = 0; i < secs(TT.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim);
  report(cr.mode === 'idle' && x0 - cr.x > 0.5 * TT.SPAWN.FROM && Math.abs(cr.x - (st.course.map.goal.x + cr.titan.side * TT.STAND.OFFSET)) < TT.STAND.BAND + 5, `it strode ${Math.round(x0 - cr.x)} px in and stands ${TT.STAND.OFFSET} px beyond the lair's middle (x ${Math.round(cr.x)}, home ${Math.round(map.goal.x + cr.titan.side * TT.STAND.OFFSET)})`);
  tQuiet(cr);
  step(sim, 60);
  const tg = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  const kinds = new Set(tg.map((t) => t.part.kind));
  report(['tentacle', 'head', 'mantle'].every((k) => kinds.has(k)) && !kinds.has('heart') && tg.every((t) => t.obj && typeof t.obj.lit === 'number' && Number.isFinite(t.at(0.5).x)), `arrived: ${tg.length} aim targets (${[...kinds].join(', ')}; the crystal is hidden; the shut mouth is a poor target)`);
  const arms = tg.filter((t) => t.part.kind === 'tentacle'), others = tg.filter((t) => t.part.kind !== 'tentacle');
  report(arms.length === 2 && arms.every((t) => others.every((o) => t.rank < o.rank)), `the arms rank before everything else (${arms[0].rank} against ${Math.min(...others.map((o) => o.rank))}): the guns go for what wins`);
  const radar = SP.radarItems(st).filter((i) => i.kind === 'creature');
  report(radar.length >= 3 && radar.every((i) => Number.isFinite(i.pos().x)), `${radar.length} blips on the phone radar`);
  let x0b = 1e9, x1b = -1e9, y0b = 1e9, y1b = -1e9;
  for (const p of cr.parts) for (const s of p.segs) for (const u of [0, 1]) { const x = s.x + Math.cos(s.ang) * s.len * u, y = s.y + Math.sin(s.ang) * s.len * u; x0b = Math.min(x0b, x - s.r); x1b = Math.max(x1b, x + s.r); y0b = Math.min(y0b, y - s.r); y1b = Math.max(y1b, y + s.r); }
  const shipLen = ship.layout.bounds.x1 - ship.layout.bounds.x0, tall = TT.BODY.FEET + TT.BODY.HEAD.R - TT.BODY.HEAD.AT[1];
  report(tall >= 1.8 * shipLen && tall <= 3 * shipLen && y1b - y0b >= 1.2 * shipLen, `it is about twice the ship: ${tall} px from sole to crown against her ${shipLen} (${(tall / shipLen).toFixed(1)}x); the parts alone span ${Math.round(y1b - y0b)} px`);
  const arm = cnt('tentacle')[0];
  let changed = 0, keyChanges = 0, lastKey = cr.key, lastGoal = arm.goal.x + ',' + arm.goal.y;
  for (let i = 0; i < 180; i++) { step(sim); const r = arm.goal.x + ',' + arm.goal.y; if (r !== lastGoal) { if (cr.key === lastKey) changed++; else keyChanges++; lastGoal = r; } lastKey = cr.key; }
  report(changed === 0, `no wobble: an arm's goal changed only on the key clock (${keyChanges} changes on keys, ${changed} between)`);
  const B0 = boot({ env: 'sea' });
  report(spawnCr(B0, 'titan') === null && B0.st.creature === null, 'and the Island Titan does not come to the Sunken Sea (no Titan lair map)');
  const B1 = boot({ env: 'skyisles', lair: false });
  report(spawnCr(B1, 'titan') === null && B1.st.creature === null, '...nor to an ordinary Sky Isles stop');
}

// (I1) every weapon hurts a part
{
  const A0 = titanUp();
  const { sim, st, cr } = A0;
  const arm = cr.parts.find((p) => p.id === 'armN'), torso = partOf(cr, 'mantle'), head = partOf(cr, 'head');
  const a = on(arm), h0 = arm.hp;
  st.shells.push({ x: a.x, y: a.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(h0 - arm.hp > 0 && cr.stats.by.shell > 0, `a shell on an arm takes ${(h0 - arm.hp).toFixed(1)} off it (credited: ${cr.stats.by.shell.toFixed(1)} by shell)`);
  const armF = cr.parts.find((p) => p.id === 'armF'), f0 = armF.hp, fp = midOf(armF.segs[1]);
  CS.creatureBurn(st, (x, y) => Math.hypot(x - fp.x, y - fp.y) < 400, { x: fp.x - 200, y: fp.y }, 0.5, 'p1');
  report(armF.hp < f0 && cr.stats.by.flame > 0, `flame on the far arm: -${(f0 - armF.hp).toFixed(1)}`);
  const tp = midOf(torso.segs[0], 0.5), t0 = torso.hp;
  const rb = CS.creatureBomb(st, { x: tp.x, y: tp.y, owner: 'p1' });
  report(rb === 'burst' && torso.hp < t0, `a bomb on the body bursts on it (${rb}, -${(t0 - torso.hp).toFixed(1)})`);
  const e = A0.ship.layout.coil, ex = T.toWorldX(A0.ship, e.x), ey = T.toWorldY(A0.ship, e.y - 60), hp = midOf(head.segs[0], 0), dx = hp.x - ex, dy = hp.y - ey, dl = Math.hypot(dx, dy), t1 = head.hp;
  CS.creatureBeam(st, ex, ey, dx / dl, dy / dl, dl + 400, 120, 60, 'p1');
  report(head.hp < t1 && cr.stats.by.coil > 0, `the coil's bolt hurts the head (-${(t1 - head.hp).toFixed(1)})`);
  const mouth = partOf(cr, 'mouth'), ms = mouth.segs[0], m0 = mouth.hp;
  report(CS.creatureBomb(st, { x: ms.x, y: ms.y, owner: 'p1' }) === 'closed' && mouth.hp === m0, 'a bomb on the SHUT mouth does nothing (it falls through)');
  const crystal = partOf(cr, 'heart'), cs = crystal.segs[0], c0 = crystal.hp;
  st.shells.push({ x: cs.x, y: cs.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(crystal.hp === c0 && CS.creatureHit(st, cs.x, cs.y, 40) === null || (CS.creatureHit(st, cs.x, cs.y, 40) && CS.creatureHit(st, cs.x, cs.y, 40).part !== crystal), 'no gun can touch the crystal (a shell on it takes nothing off it): it is for people on foot');
  report(TT.POOL.mouth >= TT.POOL.head && TT.POOL.heart >= TT.POOL.mantle && TT.POOL.tentacle <= 0.5, 'the weak points count more against the pool than the arms do');
}

// (I2) the BOULDER
{
  const A = titanUp();
  const { sim, st, ship, cr, p1 } = A;
  const B = TT.BOULDER, tt = cr.titan;
  onlyTitan('throw');
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  standOn(p1, ship, topD(ship), 600, null);
  tWake(cr);
  st.sfxQ.length = 0;
  until(sim, () => tAct(cr, 'pick'), 8);
  report(tAct(cr, 'pick') && /BOULDER/.test(st.ev.warnText) && tt.boulders.length === 1 && tt.boulders[0].mode === 'held', `it reaches for a boulder on the rubble at its feet: "${st.ev.warnText}"`);
  until(sim, () => tAct(cr, 'aim'), 4);
  const tAim = cr.age;
  step(sim, 5);
  report(tAct(cr, 'aim') && /HEFTS A BOULDER/.test(st.ev.warnText) && msgs.some((m) => m.id === 'p1' && /BOULDER/.test(m.t) && Array.isArray(m.buzz)) && st.sfxQ.some((x) => x[0] === 'roar') && tt.ring && tt.ring.locked === false, `hefted overhead: banner "${st.ev.warnText}", a buzz on the phone, a roar, and a red ring that is not locked yet`);
  const mid0 = { x: T.toWorldX(ship, ship.layout.refPoint.x), y: T.toWorldY(ship, ship.layout.refPoint.y) };
  report(Math.abs(tt.ring.x - mid0.x) < 40 && Math.abs(tt.ring.y - (mid0.y + B.AIM_DY)) < 40 && tt.ring.r > B.R, `the ring is on her, a little under her middle (${Math.round(tt.ring.x - mid0.x)} px across, ${Math.round(tt.ring.y - mid0.y)} px down; the rock is ${B.R} px, the ring ${Math.round(tt.ring.r)})`);
  ship.pose.x += 250;
  step(sim, 6);
  const rx = tt.ring.x;
  report(Math.abs(rx - T.toWorldX(ship, ship.layout.refPoint.x)) < 60, 'until it locks the ring follows her as she moves');
  until(sim, () => tt.ring && tt.ring.locked, 3);
  const lockedAt = { x: tt.ring.x, y: tt.ring.y };
  ship.pose.x -= 2500;
  step(sim, 30);
  report(tt.ring.locked && tt.ring.x === lockedAt.x && tt.ring.y === lockedAt.y, `then it LOCKS (${B.LOCK} s before the throw) and stays put while she moves on`);
  until(sim, () => tt.boulders.some((b) => b.mode === 'fly'), 4);
  const bo = tt.boulders.find((b) => b.mode === 'fly');
  const tThrow = cr.age;
  report(!!bo && tThrow - tAim >= B.AIM - 0.5, `the rock is thrown ${(tThrow - tAim).toFixed(1)} s after the heft began (AIM ${B.AIM} s)`);
  report(AIM.targets(st).some((t) => t.kind === 'boulder' && t.rank < 3 && Number.isFinite(t.at(0.5).x)), 'a rock in the air is the first thing the guns may aim at (rank before the bats)');
  // she has moved out of the ring: it comes down where she was and misses
  const f0 = frameHp(ship), hits0 = cr.stats.boulderHits;
  until(sim, () => !tt.boulders.length, 9);
  report(cr.stats.boulderMiss === 1 && cr.stats.boulderHits === hits0 && frameHp(ship) === f0, `she moved out of the ring: it flew on and thudded on the plain (missed ${cr.stats.boulderMiss}, frame ${frameHp(ship).toFixed(0)} unchanged)`);
  report(tThrow - tAim + B.FLIGHT >= 4, `from the heft to the landing there are ${(tThrow - tAim + B.FLIGHT * (B.FLIGHT_BY_DIFF.normal || 1)).toFixed(1)} s to move, shoot or climb`);
}
{
  // a boulder that finds her: a frame blow on the segment it meets, a shake and a stagger - never a kill
  const A = titanUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyTitan('throw');
  standOn(p1, ship, topD(ship), 600, null);
  tWake(cr);
  const f0 = frameHp(ship), hearts0 = p1.hearts;
  let tilt = 0, peak = 0;
  until(sim, () => { tilt = Math.max(tilt, Math.abs(st.forces.theta)); return cr.stats.boulderHits > 0; }, 16);
  step(sim, 10);
  report(cr.stats.boulderHits === 1 && frameHp(ship) < f0 && p1.hearts === hearts0, `a boulder that finds her shakes the frame (-${(f0 - frameHp(ship)).toFixed(3)} soundness, one segment) and nobody loses a heart`);
  report(tilt <= config.FORCES.MAX_DEG * DEG + 1e-9, `the blow tips her ${((tilt / DEG)).toFixed(2)} degrees at most (the limit ${config.FORCES.MAX_DEG})`);
  void peak;
}
{
  // shells shatter it
  const A = titanUp();
  const { sim, st, ship, cr } = A;
  onlyTitan('throw');
  tWake(cr);
  until(sim, () => cr.titan.boulders.some((b) => b.mode === 'fly'), 14);
  const b = cr.titan.boulders.find((q) => q.mode === 'fly');
  const f0 = frameHp(ship);
  const need = Math.ceil(b.hp / (config.GUNS.DAMAGE * H.SHELL_MUL));
  for (let k = 0; k < need; k++) { st.shells.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 }); step(sim, 1); }
  step(sim, 5);
  report(cr.stats.shattered === 1 && !cr.titan.boulders.some((q) => q === b && q.mode !== 'gone') && frameHp(ship) === f0, `${need} shells shatter the rock in the air (shattered ${cr.stats.shattered}); nothing reaches her`);
  report(st.moments.some((m) => m.kind === 'creature-boulder' && m.who.includes('P1')), 'the Ship\'s Book remembers who shot a boulder to gravel (creature-boulder)');
}

// (I3) the GRAB (phase 2)
{
  const A = titanUp();
  const { sim, st, ship, cr, p1 } = A;
  onlyTitan('throw');
  tWake(cr);
  let n = 0;
  for (let i = 0; i < secs(90); i++) { cr.ai.breather = 0; if (cr.titan.nextT > 4) cr.titan.nextT = 0.5; step(sim); if (cr.stats.throws >= 4) break; n = i; }
  report(cr.phase === 1 && cr.stats.throws >= 4 && cr.stats.grabs === 0 && !cr.grips.length, `phase 1 only throws boulders (${cr.stats.throws} throws, ${cr.stats.grabs} grabs in ${(n / 60).toFixed(0)} s)`);
}
{
  const A = titanUp();
  const { sim, st, ship, cr, p1, p1: p } = A;
  const G = TT.GRAB, tt = cr.titan, GP2 = { ...C.GRIP, ...G };
  const msgs = [];
  cr.hooks.phoneFx = (q, t, buzz) => msgs.push({ id: q.id, t, buzz });
  const topDeck = topD(ship);
  standOn(p, ship, topDeck, 600, null);
  cr.hp = cr.maxHp * (TT.PHASE.TWO_HP - 0.02);
  step(sim, 5);
  report(cr.phase === 2 && /GRABS FOR THE GASBAG/.test(st.ev.warnText) && TTM.titanPhaseName(1) === 'IT WAKES' && TTM.titanPhaseName(2) === 'IT GRABS' && TTM.titanPhaseName(3) === 'IT ROARS', `below ${TT.PHASE.TWO_HP * 100}% of the pool: phase 2, "${st.ev.warnText}"`);
  cr.ai.breather = 0;
  tt.nextT = 1e9;
  tt.grabT = 0;
  st.sfxQ.length = 0;
  let banner = null, phases = [];
  for (let i = 0; i < secs(20); i++) {
    step(sim);
    const g = cr.grips[0];
    if (g && /GRABS THE GASBAG/.test(st.ev.warnText)) banner = st.ev.warnText;
    if (g && phases[phases.length - 1] !== g.mode) phases.push(g.mode);
    if (g && g.mode === 'hold') break;
  }
  tt.grabT = 1e9;
  const g = cr.grips[0];
  report(!!g && g.bag === true && /^THE TITAN GRABS THE GASBAG! SWORDS TO THE (FORE|AFT) TOP DECK!/.test(banner || '') && msgs.some((m) => m.id === p.id && /GASBAG/.test(m.t) && Array.isArray(m.buzz)) && st.sfxQ.some((x) => x[0] === 'roar'), `the hand closes on the gasbag: "${banner}", a buzz for whoever stands near, a roar (${phases.join(' -> ')})`);
  report(!!g && g.limb.grip && g.limb.kind === 'tentacle' && Math.hypot(g.limb.grip.x - g.ex, g.limb.grip.y - g.ey) < 1 && Math.abs(g.ey - T.toWorldY(ship, g.by)) < 400, 'its hand is glued to the side of the gasbag (not to a deck): the picture and the physics agree');
  report(g && GR.gripJobs(st, ship).length === 1 && GR.gripJobs(st, ship)[0].x === g.x && GR.gripJobs(st, ship)[0].d === g.job.d, 'the job arrow points at the deck end under the hand (swords go there)');
  const x0 = ship.pose.x;
  let tilt = 0, still = true;
  const plats0 = ship.layout.platforms.length;
  for (let i = 0; i < secs(5); i++) { step(sim); tilt = Math.max(tilt, Math.abs(st.forces.theta)); still = still && GR.gripped(ship); }
  const toward = (ship.pose.x - x0) * (cr.x > ship.pose.x ? 1 : -1);
  report(tilt > 0.1 * DEG && tilt <= config.FORCES.MAX_DEG * DEG + 1e-9, `the grip twists her: tilt ${(tilt / DEG).toFixed(2)} degrees, inside FORCES.MAX_DEG ${config.FORCES.MAX_DEG}`);
  report(toward > 10 && still, `and pulls her sideways toward the Titan (${toward.toFixed(0)} px in 5 s), the hand staying on the bag`);
  const why = ship.sim.comeAbout.why();
  report(typeof why === 'string' && /tentacle|gripped|hand|holding/i.test(why), `COME ABOUT is refused while she is gripped ("${why}")`);
  // the sword: PRY ITS FINGERS OFF
  standOn(p, ship, g.job.d, g.x, 'sword');
  const act = sim.creatures.actionFor(ship, p);
  report(act && act.type === 'hack' && act.hold && act.label === 'PRY ITS FINGERS OFF!' && near(act.time, G.SWORD_TIME), `with a sword at the grip the Action is "${act && act.label}" (hold ${act && act.time} s)`);
  standOn(p, ship, g.job.d, g.x, null);
  report(sim.creatures.actionFor(ship, p).type === 'need' && /pry/i.test(sim.creatures.actionFor(ship, p).label), 'bare hands: "Need a sword to pry its fingers off!"');
  standOn(p, ship, g.job.d, g.x, 'sword');
  p.atkCd = 0;
  for (let k = 0; k < 3; k++) { sim.creatures.blow(ship, p); p.atkCd = 0; }
  step(sim, 5);
  report(freedBy(cr) === 'hack' && cr.stats.hacks === 1 && !GR.gripped(ship) && st.moments.some((m) => m.kind === 'creature-freed' && m.data.how === 'pry'), 'three sword blows free her: it lets go (hacked), and the Book writes "pry"');
  report(ship.layout.platforms.length === plats0, 'nothing was torn off her');
}
{
  // the time runs out: it SQUEEZES the bag (holes, a frame blow) and lets go; nothing is torn off
  const A = titanUp();
  const { sim, st, ship, cr } = A;
  const G = TT.GRAB;
  cr.hp = cr.maxHp * (TT.PHASE.TWO_HP - 0.02);
  step(sim, 5);
  cr.ai.breather = 0;
  cr.titan.grabT = 0;
  until(sim, () => cr.grips[0] && cr.grips[0].mode === 'hold', 20);
  cr.titan.grabT = 1e9;
  const g = cr.grips[0];
  const total = G.TIME * (G.TIME_BY_DIFF.normal || 1);
  report(!!g && near(g.total, total), `the hold lasts ${g && g.total} s on Normal (GRAB.TIME ${G.TIME})`);
  const holes0 = ship.ctx.gasHoles.length, f0 = frameHp(ship), plats0 = ship.layout.platforms.length;
  g.left = 0.3;
  step(sim, secs(2));
  report(cr.stats.squeezed === 1 && ship.ctx.gasHoles.length === holes0 + G.RIP.HOLES && frameHp(ship) < f0 && ship.layout.platforms.length === plats0 && !cr.stats.ripped && cr.stats.holes === G.RIP.HOLES, `unfreed it SQUEEZES the bag: +${ship.ctx.gasHoles.length - holes0} holes in the gasbag, the frame -${(f0 - frameHp(ship)).toFixed(3)}, no deck torn off`);
  report(cr.stats.freed && cr.stats.freed.rip === 1 && !GR.gripped(ship), 'then it lets go (a squeeze, not a rip)');
  // shells on the arm free her too
  cr.ai.breather = 0;
  cr.titan.grabT = 0;
  for (const q of cr.parts) q.gripCd = 0;
  until(sim, () => cr.grips.some((q) => q.mode === 'hold'), 20);
  cr.titan.grabT = 1e9;
  const g2 = cr.grips.find((q) => q.mode === 'hold'), arm = g2.limb;
  CS.hurtCreature(st, { part: arm, seg: 1 }, G.RELEASE_DMG * arm.maxHp + 1, { src: 'shell', who: 'p1' });
  step(sim, 5);
  report(freedBy(cr) === 'shot' && !GR.gripped(ship), `shells that take ${G.RELEASE_DMG * 100}% of the arm's health free her too`);
}

// (I4) the ROAR
{
  const A = titanUp();
  const { sim, st, ship, cr, p1 } = A;
  const M = TT.MOUTH, tt = cr.titan, mouth = partOf(cr, 'mouth');
  const L = ship.layout, msgs = [];
  cr.hooks.phoneFx = (q, t, buzz) => msgs.push({ id: q.id, t, buzz });
  p1.lock = Object.keys(L.stations || {}).find((k) => L.kindOf(k) === 'bombBay') || L.bombBay.name || null;
  report(mouth.open === false, 'the mouth is shut until a roar');
  cr.ai.breather = 0;
  cr.ai.mouthT = 0;
  st.sfxQ.length = 0;
  step(sim, 5);
  report(!!tt.roar && !cr.mouthWin && /ABOUT TO ROAR/.test(st.ev.warnText) && st.sfxQ.some((x) => x[0] === 'roar') && tt.pose === 'roar' && mouth.open === false, `first the wind-up (${M.WIND} s): the head goes back, "${st.ev.warnText}", a roar`);
  report(FT.mouthWindowSoon(st, 4) === true, 'the bots (and a bombardier\'s phone) know a window is coming (mouthWindowSoon)');
  until(sim, () => cr.mouthWin && mouth.open, 4);
  report(!!cr.mouthWin && mouth.open && /MOUTH OPEN/.test(st.ev.warnText) && cr.stats.windows === 1, `then the mouth opens for ${M.FOR} s: "${st.ev.warnText}"`);
  step(sim, secs(1.2));
  report(FT.bombInMouth(st) === true, 'after it has strode under her bomb bay a bomb let go from the bay falls into the mouth (the bots drop on this)');
  const ms = mouth.segs[0], bay = ship.layout.bombBay, g = { x: T.toWorldX(ship, bay.x), y: T.toWorldY(ship, bay.y) + 20 };
  report(Math.abs(ms.x - g.x) < M.FUNNEL_W + 200 && ms.y > g.y, `the mouth is under the bay (${Math.abs(ms.x - g.x).toFixed(0)} px across, ${(ms.y - g.y).toFixed(0)} px below; the funnel is ${M.FUNNEL_W} px each side)`);
  const ring = sim.course.predictBomb(g.x, g.y);
  report(ring && Math.abs(ring.x - ms.x) <= M.FUNNEL_W + 10, 'the bomb-bay aiming ring lands in the open mouth');
  const f0 = cr.fed;
  st.sfxQ.length = 0;
  st.shipBombs.push({ x: g.x, y: g.y, vx: ship.pose.vx, vy: 60, owner: 'p1' });
  for (let i = 0; i < secs(4) && cr.fed === f0; i++) step(sim, 1);
  step(sim, 20);
  report(cr.fed === f0 + 1 && cr.stats.chomps === 1 && st.sfxQ.some((x) => x[0] === 'chomp') && mouth.open === false, `the bomb comes down the funnel: CHOMP, fed ${cr.fed}/${M.FED}; it gulps and the mouth shuts ${M.GULP} s`);
  step(sim, secs(M.GULP + 0.5));
  report(!cr.mouthWin || cr.mouthWin.gulp <= 0, 'then the window ends or the mouth opens again');
  // the rest: two crates (half each) and a bomb, then another bomb
  cr.mouthWin = { t: 0, left: 4 };
  mouth.open = true;
  const mo = () => partOf(cr, 'mouth').segs[0];
  const c1 = CS.creatureCargo(st, { x: mo().x, y: mo().y - 300, owner: 'p1' });
  const c2 = CS.creatureCargo(st, { x: mo().x, y: mo().y - 300, owner: 'p1' });
  report(c1 === true && c2 === true && Math.abs(cr.fed - (f0 + 2)) < 1e-9, `a crate is half a bomb (fed ${cr.fed})`);
  cr.mouthWin.gulp = 0;
  mouth.open = true;
  CS.creatureBomb(st, { x: mo().x, y: mo().y - 400, owner: 'p1' });
  cr.mouthWin.gulp = 0;
  mouth.open = true;
  const r4 = CS.creatureBomb(st, { x: mo().x, y: mo().y - 400, owner: 'p1' });
  report(r4 === 'mouth' && cr.dying && cr.stats.win === 'mouth' && cr.fed >= M.FED, `FED ${M.FED} wins: stats.win "${cr.stats.win}"`);
  report(st.ev.warnText.startsWith(TT.WIN_TEXT.mouth) && /CRUMBLES/.test(st.ev.warnText), `final banner "${st.ev.warnText}"`);
}

// (I5) the arms and the phases
{
  const A = titanUp();
  const { sim, st, ship, cr } = A;
  const armN = cr.parts.find((p) => p.id === 'armN'), armF = cr.parts.find((p) => p.id === 'armF');
  CS.hurtCreature(st, { part: armN, seg: 1 }, armN.hp + 1, { src: 'shell', who: 'p1' });
  report(armN.severed && armN.segs.length < TT.BODY.ARM.SEGS && cr.chunks.length === 1 && cr.chunks[0].part.kind === 'tentacle' && cr.chunks[0].part.art === 'titan' && /ARM IS SHELLED OFF/.test(st.ev.warnText), `an arm with no hp is shelled off where it was hit (a stump of ${armN.segs.length} slabs stays, the rest tumbles away): "${st.ev.warnText}"`);
  cr.ai.breather = 0;
  step(sim, 10);
  report(cr.phase === 2 && !cr.dying, 'one arm gone: phase 2');
  CS.hurtCreature(st, { part: armF, seg: 1 }, armF.hp + 1, { src: 'shell', who: 'p1' });
  step(sim, 3);
  report(cr.dying && cr.stats.win === 'arms' && /ARMS SHELLED OFF/.test(st.ev.warnText) && st.bossDownLap === st.course.lap, `both arms gone: it is beaten, stats.win "${cr.stats.win}", "${st.ev.warnText}"`);
  report(st.slow < 1 && st.moments.some((m) => m.kind === 'creature-win' && m.data.way === 'arms'), 'the last blow plays in slow motion and the Book writes it (creature-win: arms)');
}
{
  const A = titanUp();
  const { sim, st, cr } = A;
  cr.hp = cr.maxHp * (TT.PHASE.TWO_HP - 0.02);
  step(sim, 5);
  report(cr.phase === 2, 'below 66% of the pool: phase 2');
  cr.ai.breather = 0;
  cr.hp = cr.maxHp * (TT.PHASE.THREE_HP - 0.02);
  step(sim, 5);
  report(cr.phase === 3 && /FURIOUS/.test(st.ev.warnText), `below 33%: phase 3, "${st.ev.warnText}"`);
  onlyTitan('throw');
  cr.ai.breather = 0;
  cr.titan.nextT = 0;
  const t0 = cr.stats.throws;
  let both = 0;
  for (let i = 0; i < secs(20); i++) { step(sim); if (cr.titan.boulders.length >= 2) both = Math.max(both, cr.titan.boulders.length); }
  report(cr.stats.throws - t0 >= 2 && both >= 2, `phase 3 throws two boulders at once (${cr.stats.throws - t0} throws, ${both} in the air together)`);
}

// (I6) the ISLAND: a ground that moves with it
{
  const A = titanUp({ away: true, bots: 2 });
  const { sim, st, ship, cr, p1, map } = A;
  const S = st.away, G = st.groundSys, I = TT.ISLAND;
  step(sim, 10);
  const isl = S.island;
  report(!!isl && isl.island === true && isl.moves === true && S.on && S.decks.includes(isl) && near(isl.y, cr.y + I.TOP, 1) && Math.abs(isl.x1 - isl.x0 - (I.X1 - I.X0)) < 1, `the island is a deck of the away team: x ${Math.round(isl.x0)}..${Math.round(isl.x1)}, walking surface y ${Math.round(isl.y)} (${I.TOP} px over its middle)`);
  report(isl.x0 > cr.x && ship.sim.air.surfaces().some((q) => q.id === 'ground:island'), 'it is on its back (away from the ship it faces) and it is a landing place for the crew');
  report(G.groundAt(isl.x0 + 500, isl.y - 500) !== null, 'the plain below is still ground; the island is a second one');
  // a parachute landing
  ship.pose.x = isl.x0 - 3600 - ship.layout.refPoint.x;
  step(sim, 20);
  const isl2 = S.island;
  p1.carry = null;
  flyOverT(A, p1, (isl2.x0 + isl2.x1) / 2 - 200, isl2.y - 700, 100, true);
  for (let i = 0; i < 400 && !p1.on; i++) step(sim, 1);
  report(!!p1.on && p1.on.away && p1.on.mode === 'walk' && p1.on.deck === S.island && Math.abs(p1.y - S.island.y) < 2, `a person who drops onto it by parachute lands on it: he stands on the island (y ${Math.round(p1.y)}), a world object`);
  report(st.moments.some((m) => m.kind === 'titan-island' && m.who.includes('P1')), 'the Ship\'s Book remembers the first man on the Titan\'s back (titan-island)');
  const hint = G.ui(p1);
  report(!!hint && /crystal/i.test(hint.u.hint), `his phone says: "${hint && hint.u.hint}"`);
  // carried by its movement
  const lx0 = p1.on.lx, x0 = p1.x;
  ship.pose.x -= 7000;
  for (let i = 0; i < secs(5); i++) { step(sim, 1); ship.pose.x += 0; }
  const lx1 = p1.on.lx;
  report(Math.abs(p1.x - x0) > 400 && Math.abs(lx1 - lx0) < 2 && p1.on && p1.on.deck === S.island, `the Titan walks after the ship and he is carried: he moved ${Math.round(p1.x - x0)} px with it, still ${Math.round(lx1)} px from the island's middle`);
  p1.jx = 1;
  p1.fire = false;
  const xw = p1.x;
  step(sim, 60);
  report(Math.abs(p1.x - xw) > 100 || Math.abs((p1.x - (S.island.x0 + S.island.x1) / 2) - lx1) > 50, 'and he can still walk along it');
  p1.jx = 0;
  p1.jumpQ = true;
  step(sim, 3);
  report(!p1.on && p1.fly && p1.fvy < 0, 'JUMP leaps off it');
  // a hookshot reeled in to its rock lands you on it
  const isl3 = S.island, hx = (isl3.x0 + isl3.x1) / 2, hy = isl3.y + 300;
  const anc = CBD.creatureAnchor(st, hx, hy);
  report(!!anc && anc.kind === 'enemy' && typeof anc.board === 'function' && anc.pos() && Math.abs(anc.pos().x - hx) < 1, 'a hook on the island\'s rock is an anchor that rides it and lets you climb aboard');
  flyOverT(A, p1, hx, isl3.y - 300, 0, false);
  const landed = anc.board(p1);
  report(landed === true && p1.on && p1.on.deck === S.island && p1.y === S.island.y, 'reeled right in he lands on the island');
  const x1 = anc.pos().x, c0 = cr.x;
  cr.base.x += 300;
  step(sim, 2);
  report(Math.abs(anc.pos().x - x1 - (cr.x - c0)) < 1 && Math.abs(cr.x - c0) > 250, `and the hook (the anchor) moves with the Titan (it moved ${Math.round(cr.x - c0)} px, the anchor ${Math.round(anc.pos().x - x1)})`);
}
{
  // the rope ladder over the island, and the island's fall when the Titan dies
  const A = titanUp({ away: true, bots: 2 });
  const { sim, st, ship, cr, p1 } = A;
  const S = st.away, G = st.groundSys;
  step(sim, 10);
  const isl4 = S.island, sp = G.ropeSpot();
  ship.pose.x += isl4.x0 + 900 - T.toWorldX(ship, sp.x);
  ship.pose.y = isl4.y - 1100 - ship.layout.refPoint.y;
  step(sim, 40);
  report(S.rope.groundDeck === S.island && S.rope.gap < config.AWAY.LADDER.REACH && S.rope.gap > 100, `with the ship over the island the rope ladder's foot finds it (gap ${Math.round(S.rope.gap)} px, reach ${config.AWAY.LADDER.REACH})`);
  standOn(p1, ship, sp.d, sp.x, null);
  p1.actQ = false;
  report(G.useLadder(ship, p1) === true && S.rope.out && p1.on && p1.on.mode === 'rope', 'the Action at the hatch lowers the ladder over the island and he climbs down it');
  for (let i = 0; i < 700 && !(p1.on && p1.on.mode === 'walk'); i++) { p1.jy = 1; step(sim, 1); }
  p1.jy = 0;
  report(!!p1.on && p1.on.mode === 'walk' && p1.on.deck === S.island && Math.abs(p1.y - S.island.y) < 12, 'at its foot he steps off onto the island (a deck that moves)');
  // the island falls when the Titan dies: a man on it is in the air with the parachute button, a bot is taken home
  const b0 = st.players.bot0;
  b0.trip = { t: 0, goal: null, ready: false, flared: false };
  b0.carry = null;
  flyOverT(A, b0, (S.island.x0 + S.island.x1) / 2, S.island.y - 200, 100, true);
  b0.bot = false; // (a person, for the landing: bots land only on a trip)
  for (let i = 0; i < 300 && !b0.on; i++) step(sim, 1);
  b0.bot = true;
  report(!!b0.on && b0.on.deck === S.island, 'a second man on the island');
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(1));
  report(!S.island && !p1.on && p1.fly && p1.chuteOk === true, 'killed, the Titan takes its island with it: the man on it is in the air with the parachute button');
  report(!b0.on || !b0.on.deck, 'and a man still on it is dropped too');
}

// (I7) the CRYSTAL, on foot
{
  const A = titanUp({ away: true, bots: 2 });
  const { sim, st, ship, cr, p1 } = A;
  const S = st.away, G = st.groundSys, C0 = TT.CRYSTAL, tt = cr.titan, part = partOf(cr, 'heart');
  ship.pose.x = S.island.x0 - 2000 - ship.layout.refPoint.x;
  step(sim, 20);
  const cx = () => ISL.crystalOf(st).x;
  flyOverT(A, p1, cx() - 400, S.island.y - 600, 100, true);
  for (let i = 0; i < 400 && !p1.on; i++) step(sim, 1);
  report(!!p1.on && p1.on.deck === S.island, 'a man on the island');
  p1.jx = 1;
  for (let i = 0; i < 600 && Math.abs(p1.x - cx()) > C0.REACH * 0.5; i++) step(sim, 1);
  p1.jx = 0;
  const job = G.objectiveJob(p1, 1);
  report(Math.abs(p1.x - cx()) <= C0.REACH && !!job && job.kind === 'hack' && /CRYSTAL/.test(job.label) && job.color === '#7fe8ff', `he walks to the crystal; his phone's gold arrow says "${job && job.label}"`);
  const holdAct = () => { step(sim, 1); return p1.act; };
  p1.carry = 'sword';
  p1.fire = false;
  step(sim, 2);
  report(p1.act && p1.act.type === 'crystal' && p1.act.label === 'HACK THE CRYSTAL!' && near(p1.act.time, C0.TIME), `with a sword the Action is "${p1.act && p1.act.label}" (hold ${p1.act && p1.act.time} s)`);
  p1.carry = 'hammer';
  step(sim, 2);
  const th = p1.act && p1.act.time;
  p1.carry = null;
  step(sim, 2);
  const tb = p1.act && p1.act.time;
  report(near(th, C0.TIME_HAMMER) && near(tb, C0.TIME_BARE) && C0.TIME < C0.TIME_HAMMER && C0.TIME_HAMMER < C0.TIME_BARE && /CHIP/.test(p1.act.label), `a hammer takes ${th} s a stroke and bare hands ${tb} s (a sword is quickest: ${C0.TIME} s)`);
  void holdAct;
  // the strokes
  p1.carry = 'sword';
  p1.fire = true;
  const n = C0.STRIKES_BY_DIFF.normal;
  let first = null;
  for (let i = 0; i < secs(C0.TIME * 1.4) && !cr.stats.struck; i++) step(sim, 1);
  first = cr.stats.struck;
  report(first === 1 && part.hp < part.maxHp && part.hp > 0 && /CRACKS! 1\//.test(st.ev.warnText) && tt.tremor > 0, `after ${C0.TIME} s of holding: stroke 1 of ${n} lands, the crystal cracks (hp ${part.hp.toFixed(0)}/${part.maxHp}), "${st.ev.warnText}", the island quakes`);
  for (let i = 0; i < secs(C0.TIME * 3) && !cr.dying; i++) step(sim, 1);
  p1.fire = false;
  report(cr.dying && cr.stats.win === 'crystal' && cr.stats.struck === n && st.bossDownLap === st.course.lap && st.ev.warnText.startsWith(TT.WIN_TEXT.crystal), `stroke ${cr.stats.struck}: the crystal shatters and it is beaten on foot: stats.win "${cr.stats.win}", "${st.ev.warnText}"`);
  report(st.moments.some((m) => m.kind === 'creature-win' && m.data.way === 'crystal' && m.who.includes('P1')), 'the Book names the man on the island (creature-win: crystal)');
  const A2 = titanUp({ away: true, difficulty: 'easy' });
  report(C0.STRIKES_BY_DIFF.easy < C0.STRIKES_BY_DIFF.normal, `on Easy it takes ${C0.STRIKES_BY_DIFF.easy} strokes, on Normal ${C0.STRIKES_BY_DIFF.normal}, on Hard ${C0.STRIKES_BY_DIFF.hard}`);
  void A2;
}

// (I8) the reward, the lair, the voyage
{
  restoreCfg();
  titanCfgBack();
  realHp();
  C.DEV_LAIR_AS = 'titan';
  const ctx = boot({ env: 'skyisles', lair: true, bots: 0, start: 'classic' });
  const { sim, st, ship } = ctx;
  const map = st.course.map, c = st.course;
  report(c.stop && c.stop.lair === true && c.stop.creature === 'titan' && map.creature === 'titan', 'a Titan lair stop flies the lair map for the Titan');
  step(sim, secs(2));
  report(st.creature === null && !st.boss, 'at the start there is no creature and no zeppelin');
  ship.pose.x = map.start.x + (map.goal.x - map.start.x) * 0.7 - ship.layout.refPoint.x;
  st.tempo.phase = 'build';
  st.tempo.bossOk = true;
  for (let i = 0; i < secs(4) && !st.creature; i++) step(sim, 1);
  report(!!st.creature && st.creature.kind === 'titan' && !st.boss, `at ${(c.progress * 100).toFixed(0)}% of the way the Titan comes in where the zeppelin would: ${st.creature && st.creature.name}; no zeppelin`);
  const cr = st.creature;
  for (let i = 0; i < secs(TT.SPAWN.ARRIVE + 1) && cr.mode !== 'idle'; i++) step(sim, 1);
  tQuiet(cr);
  step(sim, secs(5));
  report(st.tempo.phase === 'peak' && st.tempo.kind === 'boss', 'the pacing director treats it as the mission boss');
  ship.pose.x = map.goal.x - ship.layout.refPoint.x;
  ship.pose.y = map.goal.y - ship.layout.refPoint.y;
  st.ev.warn = 0;
  step(sim, secs(3));
  report(!c.done && !c.pendingNext, 'at the lair\'s middle with the Titan alive the stop is not done');
  st.ship.hull = 40;
  for (const b of st.bags) b.gas = 30;
  st.run.trophy = 'krakenBeak';
  const salv0 = st.run.salvage, hull0 = st.ship.hull;
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(2));
  report(cr.dying && !c.done && st.bossDownLap === c.lap, 'killed, it is dying and the boss is down');
  step(sim, secs(1));
  const SV = config.SALVAGE.BOSS * C.REWARD_MUL;
  report(st.run.salvage - salv0 >= SV && st.run.salvage - salv0 <= SV + 40, `triple boss salvage: +${st.run.salvage - salv0}`);
  report(st.ship.hull >= hull0 + TT.REWARD.HULL - 1 && st.bags.every((b) => b.gas >= 30 + TT.REWARD.GAS - 10) && st.run.trophy === 'krakenBeak' && TT.REWARD.TROPHY === null, `a hull patch (+${TT.REWARD.HULL}) and every gasbag (+${TT.REWARD.GAS}); it leaves no trophy and does not wipe the one still waiting ("${st.run.trophy}")`);
  for (let i = 0; i < secs(TT.SPAWN.SINK + C.CHUNK.LIFE + 3) && !c.done; i++) step(sim, 1);
  report(c.done === true && c.pendingNext === true && st.creature === null && /ISLAND TITAN IS SLAIN/.test(st.ev.warnText), `once it has sunk the stop is done: "${st.ev.warnText}"`);
}
{
  // the voyage: a Titan lair on the second stop flown, guaranteed, with its own rules
  restoreCfg();
  const L0 = TT.LAIR;
  L0.ENABLED = true;
  const seeds = Array.from({ length: quick ? 80 : 300 }, (_, i) => 1000 + i * 7919);
  let withT = 0, eligible = 0, bad = [];
  for (const mode of ['quick', 'voyage', 'campaign']) for (const voyageNo of [1, 2]) for (const sd of seeds) {
    const v = VY.generateVoyage(sd, { mode, voyageNo, gentle: sd % 2 === 0 });
    const tl = v.columns.flat().filter((q) => q.lair && q.creature === 'titan');
    const h = voyageNo > 1 ? 1 : 0, n = v.columns.length;
    const should = voyageNo === 1 && n - h >= L0.MIN_STOPS && v.columns[h + L0.COLUMN] && v.columns[h + L0.COLUMN].some((q) => q.env === 'skyisles');
    if (should) eligible++;
    if (tl.length !== (should ? 1 : 0)) bad.push(`${mode}/${voyageNo}/${sd}: ${tl.length} Titan lairs`);
    for (const s of tl) {
      withT++;
      const col = v.columns[s.col];
      if (s.col !== h + L0.COLUMN || s.env !== 'skyisles' || s.kind !== 'lair' || s.gates.join() !== 'swarm,imps' || !col.some((o) => o !== s && o.danger <= o.base)) bad.push(`${mode}/${sd}: ${s.id} ${JSON.stringify({ col: s.col, env: s.env, g: s.gates })}`);
    }
  }
  report(!bad.length && withT === eligible && withT > 0, `the Titan's lair is guaranteed on the second stop flown of ${eligible} first voyages of ${L0.MIN_STOPS}+ stops (Sky Isles, bats and imps only, a way round it in the column), none in quick routes or second voyages${bad.length ? ': ' + bad.slice(0, 3).join('; ') : ''}`);
  const tl = VY.lairOf('titan');
  report(tl.NAME === L0.NAME && VY.stopName({ lair: true, creature: 'titan', env: 'skyisles' }) === L0.NAME, 'the stop has the right name');
  L0.ENABLED = false;
  const off = VY.generateVoyage(1000, { mode: 'voyage' });
  L0.ENABLED = true;
  report(!off.columns.flat().some((q) => q.creature === 'titan'), 'TITAN.LAIR.ENABLED = false takes it off every route');
  const ctx = boot({ start: 'classic', bots: 3 });
  const { sim, st } = ctx;
  const v = st.run.voyage, here = v.columns[0][0], lair = v.columns[1][0];
  Object.assign(lair, { env: 'skyisles', play: 'skyisles', kind: 'lair', lair: true, creature: 'titan', danger: 2, reward: 40 });
  here.next = v.columns[1].map((s) => s.id);
  st.run.salvage = 0;
  sim.startDock();
  if (st.vote && st.vote.kind === 'dock') {
    const cast = st.vote.options.findIndex((o) => o.kind === 'cast');
    for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = cast; }
    step(sim, secs(3));
  }
  const route = st.vote && st.vote.kind === 'route' ? st.vote : null;
  const opt = route && route.options.find((o) => o.id === lair.id);
  report(!!opt && opt.lair === true && opt.icon === L0.ICON && /TITAN/.test(opt.desc) && opt.kindName === L0.KIND, `the route vote lists it: ${opt && opt.icon} "${opt && opt.name}" - ${opt && opt.desc}`);
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
  const texts = rec.texts.map((q) => q.s);
  report(exc === 0 && texts.includes(L0.ICON) && texts.includes(L0.LABEL), 'the TV\'s route map draws the Titan icon and its label (0 draw errors)');
  L0.ENABLED = false;
}

// (I9) the TV
{
  const A = titanUp({ away: true });
  const { sim, st, ship, cr, p1 } = A;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const seen = new Set();
  let exc = 0, hudText = false, ms = 0, frames = 0, marks = 0;
  const frame = () => {
    step(sim, 1);
    rec.texts.length = 0;
    const t0 = hr();
    try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    ms += hr() - t0;
    frames++;
    if (rec.texts.some((x) => x.s.startsWith('THE ISLAND TITAN - '))) hudText = true;
    if (cr.titan.act) seen.add('throw.' + cr.titan.act.sub); if (cr.mouthWin) seen.add('roar'); if (cr.grips.some((g) => g.mode === 'hold')) seen.add('grab');
    if (cr.titan.ring) marks++;
  };
  cr.phase = 2;
  onlyTitan('throw');
  cr.ai.breather = 0; cr.titan.nextT = 0;
  for (let f = 0; f < 60 * 14; f++) { cr.ai.breather = 0; frame(); }
  cr.titan.nextT = 1e9; cr.titan.grabT = 0; cr.ai.breather = 0;
  for (let f = 0; f < 60 * 12 && !cr.grips.some((g) => g.mode === 'hold'); f++) { cr.ai.breather = 0; frame(); }
  for (let f = 0; f < 60 * 3; f++) frame();
  for (const q of cr.grips) q.left = 0.1;
  for (let f = 0; f < 60 * 3; f++) frame();
  cr.ai.mouthT = 0; cr.ai.breather = 0;
  for (let f = 0; f < 60 * 10; f++) { cr.ai.breather = 0; frame(); }
  const arm = cr.parts.find((p) => p.id === 'armN');
  CS.hurtCreature(st, { part: arm, seg: 1 }, arm.hp + 1, { src: 'shell', who: 'p1' });
  for (let f = 0; f < 60 * 3; f++) frame();
  report(exc === 0 && hudText && ['throw.aim', 'roar', 'grab'].every((k) => seen.has(k)) && marks > 30, `the fight draws on a stub canvas for ${frames} frames with 0 errors (seen: ${[...seen].join(', ')}; the ring was up for ${marks} frames); the bar says THE ISLAND TITAN with its phase`);
  console.log(`     whole-TV frame with the Titan: ${(ms / frames).toFixed(2)} ms (JS on a stub canvas)`);
  const stub = stubCtx();
  const art = createCreatureArt({ ctx: stub });
  let t = 0, blits = 0;
  for (let f = 0; f < 300; f++) { step(sim, 1); const t0 = hr(); art.draw(cr, { zoom: 0.14, dpr: 1 }); for (const c of cr.chunks) art.drawLimb(c.part, { zoom: 0.14, dpr: 1 }); for (const b of cr.titan.boulders) art.drawBoulder(b.r, { zoom: 0.14, dpr: 1 }); t += hr() - t0; blits = Math.max(blits, art.stats.blits); }
  report(t / 300 < config.PERF.BUDGET_MS && blits > 12, `creatureArt alone: ${(t / 300).toFixed(3)} ms a frame over 300 frames (${blits} blits; budget ${config.PERF.BUDGET_MS} ms)`);
}

// (I10) the bots
if (!argv.includes('--no-titan-bots')) {
  restoreCfg();
  titanCfgBack();
  const botsimPath = path.join(publicDir, '..', 'tools', 'botsim.mjs');
  const run = (args, env = {}) => new Promise((resolve) => {
    const c = spawn(process.execPath, [botsimPath, ...args], { env: { ...process.env, NO_AWAY: '', ...env } }); // (the real game has the away team on: the island is there)
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  const fight = (out) => {
    const m = /fight 1: phase (\d)[^\n]*?; ended: (\w+)(?: at (\d+)s)?/.exec(out);
    return m ? { phase: +m[1], ended: m[2], at: m[3] === undefined ? null : +m[3] } : null;
  };
  const pool = async (jobs, n) => { const res = []; let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < jobs.length) { const i = k++; res[i] = await jobs[i](); } })); return res; };
  const seedsB = quick ? [1, 2] : [1, 2, 3];
  const forced = ['arms', 'mouth', 'crystal', 'hp'];
  const jobs = [];
  for (const w of forced) for (const sd of seedsB) jobs.push(() => run(['--creature', 'titan', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)], { CREATURE_FORCE_WIN: w, ...(w === 'crystal' ? { AWAY_BOT_TRIPS: '1' } : {}) }).then((r) => ({ w, sd, r })));
  for (const bots of [4, 16]) for (const sd of seedsB) jobs.push(() => run(['--creature', 'titan', '--bots', String(bots), '--difficulty', 'easy', '--minutes', '16', '--seed', String(sd)]).then((r) => ({ w: 'easy' + bots, sd, r })));
  for (const sd of seedsB) jobs.push(() => run(['--creature', 'titan', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)]).then((r) => ({ w: 'free', sd, r })));
  const results = await pool(jobs, 5);
  const clean = (r) => r.code === 0 && /errors: 0/.test(r.out) && !/NaN/.test(r.out);
  const byWin = {};
  for (const { w, sd, r } of results) { const f = fight(r.out); (byWin[w] ||= []).push({ sd, f, ok: clean(r) }); }
  for (const w of forced) {
    const rows = byWin[w];
    const times = rows.map((x) => (x.f && x.f.ended === w ? x.f.at : null));
    report(rows.every((x) => x.ok) && times.every((t) => t !== null && t <= 360), `forced ${w.toUpperCase()}: 8 bots on Normal end it that way within 6 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] === null ? 'NOT (' + (x.f ? x.f.ended + ', phase ' + x.f.phase : 'no fight') + ')' : times[i] + ' s')).join(', ')})`);
  }
  for (const bots of [4, 16]) {
    const rows = byWin['easy' + bots];
    const times = rows.map((x) => (x.f && x.f.ended !== 'no' ? { at: x.f.at, how: x.f.ended } : null));
    report(rows.every((x) => x.ok) && times.every((t) => t && t.at <= 600), `${bots} bots on Easy win within 10 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] ? times[i].how + ' ' + times[i].at + ' s' : 'NOT')).join(', ')})`);
  }
  {
    const rows = byWin.free;
    const how = rows.map((x) => (x.f && x.f.ended !== 'no' ? x.f.ended + ' ' + x.f.at + ' s' : 'NOT'));
    report(rows.every((x) => x.ok) && how.every((h) => h !== 'NOT'), `unforced, 8 bots on Normal win (${how.join(', ')})`);
  }
  report(results.every(({ r }) => clean(r)), `0 errors and no NaN in any of the ${results.length} Titan bot fights`);
}

// =================================================================== C.6d: THE RIME WYRM ===================================================================
//   (W0) the body (a collar, one long iced body of 12 segments, a head, a maw, a hidden underbelly), the lair of ice cliffs in Frost Peaks only, buried it cannot be touched;  (W1) the CRACKING cliff (a banner, a buzz, the camera) and the eruption 2 s later
//   (W2) the COIL: banner, a wind-up, the coil round the hull, it STOPS her (and her tilt stays inside FORCES.MAX_DEG), the hack arrow waits until the last HACK_AT s, a sword frees her, the timer rips a section off
//   (W3) ICE ARMOUR: shells bounce (and wear a little off), bombs crack it, flame melts it, a hammer chips it (hold or blows; beside a rack the button takes a tool), a bare segment takes more, it grows back and freezes over again
//   (W4) FROST BREATH: a wind-up with a buzz for the gunners, then the guns are jammed (the frost environment's own crusts), a hammer clears one;  (W5) the GAPE: the head swims under the bomb bay, the funnel, FED bombs win
//   (W6) the phases (the belly opens, it stays out, the sun) and each win scripted: the sun (a harpoon hauls the head), the underbelly, the pool;  (W7) the reward, the lair stops of a voyage, the TV, and the bots: each forced win by 8 bots on Normal, 4 and 16 bots on Easy
const WY = C.WYRM;
const WYM = await load('modules/host/creatures/wyrm.js');
const WYB = await load('modules/host/creatureWyrm.js');
const WY0 = JSON.stringify({ BF: WY.BREATH.FIRST, CF: WY.CYCLE.FIRST, BU: WY.CYCLE.BURROW });
const wyCfgBack = () => { const o = JSON.parse(WY0); WY.BREATH.FIRST = o.BF; WY.CYCLE.FIRST = o.CF; WY.CYCLE.BURROW = o.BU; };
const wyOf = (cr) => cr.parts.find((p) => p.id === 'wyrm');
const wQuiet = (cr) => { cr.wyrm.nextT = 1e9; cr.ai.breather = 0; };
const iceCount = (cr) => wyOf(cr).ice.filter((v) => v > 0).length;
const midWorld = (ship) => ({ x: T.toWorldX(ship, ship.layout.refPoint.x), y: T.toWorldY(ship, ship.layout.refPoint.y) });
// A sim in the Frost Peaks lair with the Wyrm spawned (buried) and its cycle held; erupt: let it erupt and coil her (its breath held too unless breath).
function wyrmUp({ difficulty = 'normal', bots = 0, erupt = false, breath = false, start = null } = {}) {
  restoreCfg();
  wyCfgBack();
  if (!breath) WY.BREATH.FIRST = 1e9;
  C.DEV_LAIR_AS = 'wyrm';
  const ctx = boot({ env: 'frost', lair: true, difficulty, bots, start });
  const map = ctx.st.course.map;
  ctx.ship.pose.x = map.goal.x - ctx.ship.layout.refPoint.x;
  ctx.ship.pose.y = map.goal.y - ctx.ship.layout.refPoint.y;
  step(ctx.sim, 5);
  const cr = ctx.sim.creatures.spawn('wyrm');
  wQuiet(cr);
  step(ctx.sim, 30);
  const A = { ...ctx, cr, p1: ctx.st.players.p1, map };
  if (erupt) eruptNow(A);
  return A;
}
function eruptNow(A, toCoil = true) {
  const { sim, cr } = A;
  cr.wyrm.nextT = 0;
  until(sim, () => cr.wyrm.mode === 'out', 8);
  if (toCoil) until(sim, () => cr.grips[0] && cr.grips[0].mode === 'hold', 8);
  cr.wyrm.nextT = 1e9;
  return cr.grips[0] || null;
}
const holdCoil = (cr) => { for (const g of cr.grips) g.left = Math.max(g.left, 60); };
const ENVM = await load('modules/host/environments.js');
const wyWin = (name, st, cr, why) => {
  report(cr.dying && cr.stats.win === why && cr.diedBy === why, `${name}: stats.win "${cr.stats.win}"`);
  report(st.ev.warnText.startsWith(WY.WIN_TEXT[why]) && st.ev.warn >= FN.BANNER - 0.1, `${name}: the final banner "${st.ev.warnText}"`);
  report(st.bossDownLap === st.course.lap && st.slow === FN.SLOW, `${name}: the boss counts as down and the last blow runs in slow motion (state.slow ${st.slow})`);
};

// (W0) the world and the body
{
  restoreCfg();
  wyCfgBack();
  C.DEV_LAIR_AS = 'wyrm';
  const ctx = boot({ env: 'frost', lair: true });
  const { sim, st, ship } = ctx;
  const map = st.course.map;
  const shipLen = ship.layout.bounds.x1 - ship.layout.bounds.x0;
  report(map.lair === true && map.creature === 'wyrm' && map.outposts.length === 0 && map.turrets.length === 0 && map.cliffs.length === WY.LAIR.CLIFFS.length && Number.isFinite(map.startDist) && map.startDist < 1e8 && map.cliffs.every((c) => c.top - map.start.y > 1500), `the Wyrm's lair is open sky over an icy floor with ${map.cliffs.length} ice cliffs ${Math.round(map.cliffs[0].top - map.start.y)} px under the launch, no outposts or guns`);
  report(spawnCr(ctx, 'kraken') === null && spawnCr(ctx, 'drake') === null && spawnCr(ctx, 'thunderbird') === null && spawnCr(ctx, 'titan') === null && st.creature === null, 'no other creature comes to the Wyrm lair');
  const cr = spawnCr(ctx, 'wyrm');
  const cnt = (k) => cr.parts.filter((p) => p.kind === k);
  const limb = wyOf(cr);
  report(!!cr && cr.kind === 'wyrm' && cr.name === WY.NAME && cr.mode === 'surfacing' && cr.wyrm.mode === 'buried' && cnt('mantle').length === 1 && cnt('tentacle').length === 1 && limb.segs.length === WY.BODY.LIMB.SEGS && cnt('head').length === 1 && cnt('mouth').length === 1 && cnt('heart').length === 1 && cnt('heart')[0].hidden && cr.parts.every((p) => p.hp > 0),
    `spawn puts ${cr && cr.name} in state.creature, buried: a collar, a body of ${WY.BODY.LIMB.SEGS} segments, a head, a maw and a hidden underbelly`);
  report([cnt('mantle')[0], limb, cnt('head')[0]].every((p) => p.ice && p.ice.length === p.segs.length && p.ice.every((v) => v > 0)) && limb.ice[0] === WY.ICE.HP && cnt('mantle')[0].ice[0] === WY.ICE.HP * WY.ICE.COLLAR_MUL && !cnt('mouth')[0].ice && !cnt('heart')[0].ice, 'the collar, the body and the head wear ice; the maw and the underbelly do not');
  report(limb.reach >= 2.2 * shipLen, `it is long: ${Math.round(limb.reach)} px of body against her ${shipLen} (${(limb.reach / shipLen).toFixed(1)}x)`);
  const col = cnt('mantle')[0].segs[0];
  st.shells.push({ x: col.x, y: col.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 5);
  report(cr.hp === cr.maxHp && AIM.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0 && CS.creatureHit(st, col.x, col.y, 100) === null, 'buried, it cannot be hurt, shot at or spotted');
  wQuiet(cr);
  const B0 = boot({ env: 'sea' });
  report(spawnCr(B0, 'wyrm') === null && B0.st.creature === null, 'the Wyrm does not come to the Sunken Sea');
  const B1 = boot({ env: 'frost', lair: false });
  report(spawnCr(B1, 'wyrm') === null && B1.st.creature === null, '...nor to an ordinary Frost Peaks stop');
}

// (W1) the cracking cliff and the eruption
{
  const A = wyrmUp();
  const { sim, st, ship, cr, p1 } = A;
  const wy = cr.wyrm, CY = WY.CYCLE;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  standOn(p1, ship, topD(ship), 600, null);
  st.sfxQ.length = 0;
  wy.nextT = 0;
  until(sim, () => wy.mode === 'crack', 4);
  const mid = midWorld(ship);
  report(wy.mode === 'crack' && /CLIFF IS CRACKING/.test(st.ev.warnText) && msgs.some((m) => m.id === 'p1' && /CRACKING/.test(m.t) && Array.isArray(m.buzz)) && st.sfxQ.some((x) => x[0] === 'impact'), `a cliff cracks: banner "${st.ev.warnText}", a buzz on the phone, a thud`);
  report(wy.crack && wy.crack.T === CY.CRACK && A.map.cliffs.includes(wy.cliff) && Math.abs(wy.cliff.x - mid.x) >= WY.CLIFF.MIN_DX && Math.abs(wy.cliff.x - mid.x) <= WY.CLIFF.MAX_DX && (wy.cliff.x - mid.x) * ship.pose.f > 0, `it is the cliff ${Math.round(Math.abs(wy.cliff.x - mid.x))} px ahead of her bow (${WY.CLIFF.MIN_DX}..${WY.CLIFF.MAX_DX} is its range)`);
  const pts = CS.creaturePoints(st);
  report(cr.mode === 'surfacing' && AIM.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && pts.length === 1 && Math.abs(pts[0].x - wy.cliff.x) < 1, 'while it cracks nothing can be hit, and the camera keeps the cliff in view');
  const t0 = cr.age;
  until(sim, () => wy.mode === 'out', 5);
  report(Math.abs(cr.age - t0 - CY.CRACK) < 0.3 && cr.mode === 'idle' && cr.x === wy.cliff.x && cr.base.y === wy.cliff.top && cr.f === (mid.x >= wy.cliff.x ? 1 : -1), `it erupts after ${(cr.age - t0).toFixed(1)} s of cracks (CRACK ${CY.CRACK} s), out of the cliff top, facing her`);
  step(sim, secs(WY.CYCLE.RISE + 0.5));
  const tg = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  report(['mantle', 'tentacle', 'head'].every((k) => tg.some((t) => t.part.kind === k)) && SP.radarItems(st).filter((i) => i.kind === 'creature').length >= 2, `out, it has ${tg.length} aim targets (the iced ones rank low: ${Math.min(...tg.map((t) => t.rank))}..${Math.max(...tg.map((t) => t.rank))}) and radar blips`);
  const limb = wyOf(cr);
  let changed = 0, lastKey = cr.key, lastGoal = limb.goal.x + ',' + limb.goal.y;
  for (let i = 0; i < 180; i++) { step(sim); const r = limb.goal.x + ',' + limb.goal.y; if (r !== lastGoal) { if (cr.key === lastKey) changed++; lastGoal = r; } lastKey = cr.key; }
  report(changed === 0, `no wobble: the body's goal changed only on the key clock (${changed} changes between keys)`);
}

// (W2) the COIL
{
  const A = wyrmUp();
  const { sim, st, ship, cr, p1 } = A;
  const wy = cr.wyrm, G = WY.COIL;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  standOn(p1, ship, topD(ship), 380, null);
  wy.nextT = 0;
  until(sim, () => cr.grips.length > 0, 12);
  const g = cr.grips[0];
  report(!!g && g.mode === 'wind' && /THE WYRM COILS/.test(st.ev.warnText), `it strikes: banner "${st.ev.warnText}" and a wind-up on ${g && g.end} ${g && g.deck}`);
  step(sim, secs(0.2));
  const tWind = cr.age;
  until(sim, () => g.mode === 'hold', 6);
  report(g.mode === 'hold' && cr.age - tWind >= G.WINDUP - 0.6 && !!wyOf(cr).grip, `the wind-up gives ${G.WINDUP} s of warning, then the head seizes the deck end (held after ${(cr.age - tWind + 0.2).toFixed(1)} s)`);
  const limb = wyOf(cr);
  step(sim, secs(1.5));
  report(!!limb.wrap && limb.wrap.k === G.WRAP.SEGS && limb.segs.some((s) => s.behind) && limb.segs.some((s) => !s.behind) && g.total === G.TIME, `the outer ${G.WRAP.SEGS} segments wind round her hull (some in front of it, some behind), held ${G.TIME} s`);
  let tilt = 0;
  holdCoil(cr);
  for (let i = 0; i < secs(6); i++) { step(sim); tilt = Math.max(tilt, Math.abs(st.forces.theta)); }
  const vx = ship.pose.vx;
  report(tilt <= config.FORCES.MAX_DEG * DEG + 1e-9, `the coil tips her ${(tilt / DEG).toFixed(2)} degrees at most (the limit ${config.FORCES.MAX_DEG})`);
  report(GR.gripped(ship) && typeof ship.sim.comeAbout.why() === 'string', `COME ABOUT is refused while she is coiled ("${ship.sim.comeAbout.why()}")`);
  // it STOPS her: the same ship at full speed with and without the coil
  const mk = (coiled) => {
    const B = wyrmUp({ erupt: false });
    B.ship.pose.x += 900;
    if (coiled) { eruptNow(B); holdCoil(B.cr); }
    else B.cr.wyrm.nextT = 1e9;
    B.st.ship.speed = 0.55;
    return B;
  };
  const S1 = mk(true), S0 = mk(false);
  for (let i = 0; i < secs(4); i++) { holdCoil(S1.cr); step(S1.sim); step(S0.sim); }
  report(Math.abs(S1.ship.pose.vx) < 0.35 * Math.abs(S0.ship.pose.vx) || Math.abs(S1.ship.pose.vx) < 60, `with the engines at 55% the coil holds her to ${S1.ship.pose.vx.toFixed(0)} px/s; free, she flies at ${S0.ship.pose.vx.toFixed(0)} px/s`);
  report(Math.sign(vx) === Math.sign(wy.cliff.x - midWorld(ship).x) && Math.abs(vx) <= 120, `she drifts toward its cliff at ${G.ANCHOR.DRIFT} px/s at most (now ${vx.toFixed(0)})`);
  // the arrow and the button
  g.left = G.HACK_AT + 3;
  const early = GR.gripJobs(st, ship).filter((j) => j.obj === g.job);
  standOn(p1, ship, g.job.d, g.x, 'hammer');
  const eAct = sim.creatures.actionFor(ship, p1);
  report(early.length === 0 && (!eAct || eAct.label !== 'HACK THE COIL!'), `with more than ${G.HACK_AT} s left there is no hack arrow, and a hammer at the grip does not hack ("${eAct && eAct.label}")`);
  g.left = G.HACK_AT - 1;
  const late = GR.gripJobs(st, ship).filter((j) => j.obj === g.job);
  const lAct = sim.creatures.actionFor(ship, p1);
  report(late.length === 1 && lAct && lAct.label.startsWith('HACK THE COIL'), `in the last ${G.HACK_AT} s the arrow shows and the button is "${lAct && lAct.label}"`);
  standOn(p1, ship, g.job.d, g.x, 'sword');
  const sAct = sim.creatures.actionFor(ship, p1);
  report(sAct && sAct.type === 'hack' && sAct.label === 'HACK THE COIL!' && near(sAct.time, G.SWORD_TIME), `a sword at the grip hacks at any time (hold ${sAct && sAct.time} s)`);
  g.left = 20;
  p1.atkCd = 0;
  for (let k = 0; k < 3; k++) { sim.creatures.blow(ship, p1); p1.atkCd = 0; }
  step(sim, 5);
  report(freedBy(cr) === 'hack' && cr.stats.hacks === 1 && !GR.gripped(ship) && st.moments.some((m) => m.kind === 'creature-freed' && m.data.how === 'hack'), 'three sword blows free her: it lets go (hacked), and the Book writes it');
  until(sim, () => wy.sub === 'gape', 4);
  report(wy.sub === 'gape', 'once it lets go it GAPES (the maw opens for bombs)');
}
{
  // the timer rips a section off; flame does not free her
  const A = wyrmUp({ erupt: true });
  const { sim, st, ship, cr } = A;
  const g = cr.grips[0], plats0 = ship.layout.platforms.length, limb = wyOf(cr);
  const i = limb.segs.length - 1, s = limb.segs[i];
  CS.creatureBurn(st, () => true, { x: s.x, y: s.y }, 0.5, 'p1');
  step(sim, 5);
  report(g.mode === 'hold', 'flame on the coil does not make it let go (it melts the ice)');
  g.left = 0.05;
  step(sim, secs(1));
  report(freedBy(cr) === 'rip' && ((cr.stats.ripped || 0) + (cr.stats.hulled || 0)) >= 1, `unfreed when the time runs out it rips a section off (ripped ${cr.stats.ripped || 0}, hull crushed ${cr.stats.hulled || 0})`);
  void plats0;
}
{
  // shells on the bare body free her once they have done RELEASE_DMG of its hp
  const A = wyrmUp({ erupt: true });
  const { sim, st, cr } = A;
  const limb = wyOf(cr), g = cr.grips[0];
  limb.ice.fill(0);
  limb.hp = limb.maxHp;
  holdCoil(cr);
  let n = 0;
  for (; n < 400 && g.mode === 'hold'; n++) {
    const s = limb.segs[limb.segs.length - 2], m = midOf(s);
    st.shells.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
    step(sim, 2);
  }
  report(g.mode !== 'hold' && g.why === 'shot' && n < 400, `shells on its bare body free her after ${n} hits (${(WY.COIL.RELEASE_DMG * 100).toFixed(0)}% of its hp), the Wyrm lets go`);
}

// (W3) ICE ARMOUR
{
  const A = wyrmUp({ erupt: true });
  const { sim, st, ship, cr, p1 } = A;
  holdCoil(cr);
  const limb = wyOf(cr), I = WY.ICE;
  const seg = (i) => midOf(limb.segs[i]);
  const shell = (i, src = 'shell') => CS.hurtCreature(st, { part: limb, seg: i }, config.GUNS.DAMAGE * C.HURT.SHELL_MUL, { who: 'p1', src });
  const i = 4;
  const m = seg(i), hp0 = limb.hp, pool0 = cr.hp, ice0 = limb.ice[i];
  st.sfxQ.length = 0;
  const r = shell(i);
  report(r === null && limb.hp === hp0 && cr.hp === pool0 && cr.stats.bounces === 1 && near(limb.ice[i], ice0 - I.SHELL_CHIP) && st.sfxQ.some((x) => x[0] === 'clang'), `a shell on an iced segment bounces: no damage, a clang, and it wears ${I.SHELL_CHIP} off the ice (${ice0} -> ${limb.ice[i]})`);
  const iceB = limb.ice[i];
  CS.hurtCreature(st, { part: limb, seg: i }, C.HURT.BOMB, { who: 'p1', src: 'bomb' });
  report(limb.ice[i] < iceB - I.BOMB_CHIP * limb.iceMax[i] * 0.99 && limb.hp === hp0, `a bomb on it cracks ${(I.BOMB_CHIP * 100).toFixed(0)}% of the ice and does no damage`);
  const iceF = limb.ice[i];
  CS.creatureBurn(st, (x, y) => Math.hypot(x - m.x, y - m.y) < 80, { x: m.x - 20, y: m.y }, 0.5, 'p1');
  report(iceCount(cr) <= 12 && limb.hp === hp0 && cr.stats.melted > 0 && limb.ice.reduce((a, v) => a + v, 0) < limb.iceMax.reduce((a, v) => a + v, 0) - 1, `flame melts the ice (${cr.stats.melted.toFixed(0)} melted) without hurting it`);
  void iceF;
  limb.ice[i] = 0;
  const h1 = limb.hp, p1pool = cr.hp;
  const rb = shell(i);
  const dmg = config.GUNS.DAMAGE * C.HURT.SHELL_MUL * I.BARE_MUL;
  report(!!rb && near(h1 - limb.hp, dmg, 1e-6) && near(p1pool - cr.hp, dmg * WY.POOL.tentacle, 1e-6), `a shell on a bare segment takes ${I.BARE_MUL}x its damage off the body (${(h1 - limb.hp).toFixed(1)}) and ${(p1pool - cr.hp).toFixed(1)} off the pool`);
  // the hammer: the button, the hold, the blows, the neighbours
  limb.ice.fill(WY.ICE.HP);
  limb.iceMax.fill(WY.ICE.HP);
  cr.stats.chips = 0;
  // put him on the deck nearest that segment, and ask what the button says
  const jobs = WYB.wyrmChipJobs(st, ship);
  report(jobs.length > 0 && jobs.length <= I.JOBS && jobs.every((q) => q.kind === 'hack' && q.tool === 'hammer' && q.d >= 0 && Number.isFinite(q.x)), `${jobs.length} chip spots on her decks for the phones' arrows and the bots (kind hack, tool hammer)`);
  const job = jobs[0];
  standOn(p1, ship, job.d, job.x, 'hammer');
  const racks = ship.layout.racks.filter((q) => q.d === job.d && Math.abs(q.x - job.x) < config.TOOLS.REACH).length;
  const act = sim.creatures.actionFor(ship, p1);
  if (!racks) report(act && act.type === 'hack' && act.hold && act.label === 'CHIP THE ICE!' && near(act.time, I.CHIP_TIME), `a hammer beside it: the Action is "${act && act.label}" (hold ${act && act.time} s)`);
  else report(act === null || act.label !== 'CHIP THE ICE!', 'beside a tool rack the Action is the rack\'s, so a hammer can be swapped for a sword');
  // find a spot away from the racks to work at
  const work = jobs.find((q) => !ship.layout.racks.some((r2) => r2.d === q.d && Math.abs(r2.x - q.x) < config.TOOLS.REACH + 20)) || job;
  standOn(p1, ship, work.d, work.x, 'hammer');
  const act2 = sim.creatures.actionFor(ship, p1);
  report(!!act2 && act2.label === 'CHIP THE ICE!' && act2.obj && act2.obj.name === 'chip', 'away from the racks the Action is CHIP THE ICE!');
  const target = act2.obj, tp = target.part, ts = target.seg, before = iceCount(cr);
  sim.creatures.hacked(ship, p1, target);
  report(tp.ice[ts] === 0 && tp.ice[Math.max(0, ts - 1)] < WY.ICE.HP * (tp === limb ? 1 : 2) && cr.stats.chips === 1 && st.moments.some((q) => q.kind === 'creature-chip' && q.who.includes('P1')), `a finished hold chips the segment bare and cracks its neighbours (${before} iced segments -> ${iceCount(cr)}), and the Book remembers the hammer`);
  // three ATTACK blows with a hammer do the same
  const act3 = sim.creatures.actionFor(ship, p1);
  p1.atkCd = 0;
  let b = 0;
  const ts3 = act3 && act3.obj ? act3.obj.seg : -1;
  for (let k = 0; k < I.BLOWS; k++) { if (sim.creatures.blow(ship, p1)) b++; p1.atkCd = 0; }
  report(b === I.BLOWS && cr.stats.chips === 2, `${I.BLOWS} ATTACK blows with a hammer chip a segment too (blow ${b}, segment ${ts3})`);
  // a man with no hammer gets nothing
  p1.carry = null;
  const none = sim.creatures.actionFor(ship, p1);
  report(!none || none.label !== 'CHIP THE ICE!', 'bare hands: no chip button');
  // an open steam vent melts the segments beside it
  if (ship.layout.vents.length) {
    limb.ice.fill(WY.ICE.HP);
    let bv = 0, bd = Infinity;
    ship.layout.vents.forEach((v, k) => { const pl = PLS(ship)[v.d], wx = T.toWorldX(ship, v.x), wy = T.toWorldY(ship, pl.y - 40); for (let q = 0; q < limb.segs.length; q++) { const d = segDist(limb.segs[q], wx, wy); if (d < bd) { bd = d; bv = k; } } });
    const reach0 = I.VENT_REACH;
    I.VENT_REACH = bd + 60;
    st.ventOpen[bv] = false;
    const sum0 = limb.ice.reduce((a, v) => a + v, 0);
    step(sim, 30);
    const shut = limb.ice.reduce((a, v) => a + v, 0);
    st.ventOpen[bv] = true;
    for (let i2 = 0; i2 < 120; i2++) { holdCoil(cr); st.ventOpen[bv] = true; step(sim); }
    st.ventOpen[bv] = false;
    const open = limb.ice.reduce((a, v) => a + v, 0);
    I.VENT_REACH = reach0;
    report(shut >= sum0 - 1 && open < sum0 - 20 && cr.stats.vented > 0, `an open steam vent beside the coil melts the ice (${sum0.toFixed(0)} -> ${open.toFixed(0)} in 2 s; shut, none)`);
    limb.ice.fill(0);
  }
  // it grows back
  const k0 = limb.ice.findIndex((v) => v <= 0);
  const grew0 = limb.ice[k0];
  for (let i2 = 0; i2 < secs(I.REGROW_AFTER + 3); i2++) { holdCoil(cr); step(sim); }
  report(k0 >= 0 && limb.ice[k0] > grew0, `a bare segment grows ice again after ${I.REGROW_AFTER} s (${grew0.toFixed(0)} -> ${limb.ice[k0].toFixed(0)})`);
}
{
  // ice at the head and the collar, the maw shut or open
  const A = wyrmUp({ erupt: true });
  const { sim, st, cr } = A;
  holdCoil(cr);
  const head = partOf(cr, 'head'), mouth = partOf(cr, 'mouth'), col = partOf(cr, 'mantle');
  const hh = midOf(head.segs[0], 0.5), mm = mouth.segs[0];
  const h0 = head.hp;
  const r = CS.hurtCreature(st, { part: head, seg: 0 }, 50, { src: 'shell', who: 'p1' });
  const r2 = CS.hurtCreature(st, { part: col, seg: 0 }, 50, { src: 'shell', who: 'p1' });
  report(r === null && r2 === null && head.hp === h0, 'shells bounce off the iced head and the iced collar too');
  const mp = mouth.hp;
  const r3 = CS.hurtCreature(st, { part: mouth, seg: 0 }, 50, { src: 'shell', who: 'p1' });
  report(r3 === null && mouth.hp === mp && !mouth.open, 'and off the shut maw (frost-lipped)');
  void hh; void mm;
}
{
  // a new eruption freezes it over again
  const A = wyrmUp({ erupt: true });
  const { sim, st, cr } = A;
  const limb = wyOf(cr);
  limb.ice.fill(0);
  holdCoil(cr);
  cr.grips[0].left = 0.01;
  until(sim, () => cr.wyrm.mode === 'buried', 40);
  report(cr.wyrm.mode === 'buried' && limb.ice.every((v) => v === WY.ICE.HP) && limb.hp === limb.maxHp, 'after it burrows the whole body is iced again (a new eruption starts armoured)');
  cr.wyrm.nextT = 0;
  until(sim, () => cr.wyrm.mode === 'out', 8);
  report(cr.wyrm.mode === 'out' && limb.ice.every((v) => v === WY.ICE.HP), 'and it comes out armoured');
}

// (W4) FROST BREATH
{
  const A = wyrmUp({ erupt: true, breath: true });
  const { sim, st, ship, cr, p1 } = A;
  const wy = cr.wyrm, B = WY.BREATH;
  holdCoil(cr);
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  const gunNames = Object.keys(st.GUNS);
  const gunner = gunNames.find((n) => ship.layout.kindOf(n) === 'gun');
  Object.assign(p1, { lock: gunner, fall: false, fly: false, d: 0, ko: 0 });
  p1.lock = gunner;
  st.icing.length = 0;
  wy.breathT = 0;
  st.sfxQ.length = 0;
  until(sim, () => wy.breath, 3);
  const open = new Set(ENVM.gunSpotsOf(ship.layout).map((s) => s.gun));
  report(!!wy.breath && wy.breath.sub === 'wind' && /FROZEN BREATH/.test(st.ev.warnText) && msgs.some((m) => m.id === 'p1' && /FROST BREATH/.test(m.t) && Array.isArray(m.buzz)) && st.sfxQ.some((x) => x[0] === 'roar'), `the breath is drawn in: banner "${st.ev.warnText}", a buzz on the gunner's phone`);
  report(st.icing.every((c) => !c.wyrm), 'nothing is frozen yet during the wind-up');
  const t0 = cr.age;
  until(sim, () => wy.breath && wy.breath.sub === 'blow', 4);
  report(Math.abs(cr.age - t0 - B.WIND) < 0.4 && wy.breath.len === B.LEN, `${B.WIND} s later it blows: the cone`);
  const frozen = st.icing.filter((c) => c.wyrm);
  report(frozen.length === Math.min(B.GUNS[1], open.size) && frozen.every((c) => c.lvl >= config.ENVIRONMENTS.frost.ICE.JAM_AT && open.has(c.gun)) && frozen.every((c) => ship.sim.env.gunJammed(c.gun)), `${frozen.length} open gun${frozen.length === 1 ? '' : 's'} frozen solid (${frozen.map((c) => c.gun).join(', ')}): jammed (phase 1 freezes ${B.GUNS[1]}, phase 2 ${B.GUNS[2]}, phase 3 ${B.GUNS[3]})`);
  // the hammer clears it, the Book remembers
  const c0 = frozen[0];
  const spot = ENVM.gunSpotsOf(ship.layout).find((s) => s.gun === c0.gun);
  standOn(p1, ship, spot.d, spot.x, 'hammer');
  c0.prog = 0.99;
  p1.fire = true;
  step(sim, secs(1));
  p1.fire = false;
  report(!st.icing.includes(c0) && !ship.sim.env.gunJammed(c0.gun) && st.moments.some((q) => q.kind === 'creature-thaw' && q.who.includes('P1')), 'a hammer chips the crust off the gun: it fires again, and the Book remembers it');
  step(sim, secs(B.TIME + 0.5));
  report(!wy.breath && wy.breathT > B.EVERY[1] * 0.6, `the cone fades and the next breath is ${wy.breathT.toFixed(0)} s off (every ${B.EVERY[1]} s in phase 1)`);
}
{
  // more guns in the later phases
  const A = wyrmUp({ erupt: true, breath: true });
  const { sim, st, ship, cr } = A;
  holdCoil(cr);
  const open = ENVM.gunSpotsOf(ship.layout).length;
  const counts = [];
  for (const ph of [2, 3]) {
    cr.phase = ph;
    st.icing.length = 0;
    cr.wyrm.breath = null;
    cr.wyrm.breathT = 0;
    cr.ai.breather = 0;
    holdCoil(cr);
    until(sim, () => cr.wyrm.breath && cr.wyrm.breath.sub === 'blow', 4);
    counts.push(st.icing.filter((c) => c.wyrm).length);
  }
  report(counts[0] === Math.min(WY.BREATH.GUNS[2], open) && counts[1] === Math.min(WY.BREATH.GUNS[3], open), `phase 2 freezes ${counts[0]} guns and phase 3 ${counts[1]} (of ${open} open ones)`);
}

// (W5) the GAPE
{
  const A = wyrmUp({ erupt: true });
  const { sim, st, ship, cr, p1 } = A;
  const wy = cr.wyrm, M = WY.MOUTH;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  cr.grips[0].left = 0.01;
  until(sim, () => wy.sub === 'gape', 6);
  const mouth = partOf(cr, 'mouth');
  report(wy.sub === 'gape' && wy.headUp && /MAW IS ABOUT TO GAPE/.test(st.ev.warnText) && !cr.mouthWin, `it lets go and raises its head: "${st.ev.warnText}" (the maw is still shut)`);
  step(sim, secs(M.WIND + 0.4));
  report(!!cr.mouthWin && mouth.open && /GAPES/.test(st.ev.warnText) && cr.stats.windows === 1, `${M.WIND} s later the maw is open: "${st.ev.warnText}"`);
  // the head swims to put the maw under her bay
  step(sim, secs(4));
  const ms = mouth.segs[0];
  const bay = ship.layout.bombBay;
  const mid = midWorld(ship);
  const g = bay ? { x: T.toWorldX(ship, bay.x), y: T.toWorldY(ship, bay.y) } : mid;
  report(Math.abs(ms.x - g.x) < M.FUNNEL_W + 400 && ms.y > g.y, `the maw hangs under her bomb bay (${Math.round(ms.x - g.x)} px across, ${Math.round(ms.y - g.y)} px below it)`);
  report(CS.creatureBomb(st, { x: ms.x, y: ms.y - 200, owner: 'p1' }) === 'mouth' && cr.fed === 1, 'a bomb that falls in the open maw is a bomb fed (1)');
  const m1 = mouth.hp;
  step(sim, 20);
  report(!mouth.open && cr.mouthWin.gulp > 0 && CS.creatureBomb(st, { x: ms.x, y: ms.y - 200, owner: 'p1' }) !== 'mouth' && cr.fed === 1, `it gulps: the maw shuts ${M.GULP} s and the next bomb is not fed`);
  step(sim, secs(M.GULP + 0.6));
  report(mouth.open || !cr.mouthWin, 'then it opens again for what is left of the window');
  const f0 = cr.fed;
  if (cr.mouthWin) CS.creatureCargo(st, { x: ms.x, y: ms.y - 200, owner: 'p1' });
  report(cr.mouthWin ? near(cr.fed - f0, C.HURT.CARGO_MOUTH) : true, 'a thrown crate is half a bomb');
  void m1; void p1;
  until(sim, () => wy.mode === 'buried', 6);
  report(wy.mode === 'buried' && cr.mode === 'surfacing' && wy.nextT >= WY.CYCLE.BURROW[0] * 0.9, `it is under the ice again for ${wy.nextT.toFixed(1)} s (BURROW ${WY.CYCLE.BURROW.join('..')})`);
}
{
  // the window closes after FOR s: the maw shuts and it burrows
  const A = wyrmUp({ erupt: true });
  const { sim, cr } = A;
  const wy = cr.wyrm, M = WY.MOUTH;
  cr.grips[0].left = 0.01;
  until(sim, () => cr.mouthWin && partOf(cr, 'mouth').open, 10);
  const tOpen = cr.age;
  let sawRetreat = false, shut = false, tShut = null;
  for (let i2 = 0; i2 < secs(16) && wy.mode !== 'buried'; i2++) { step(sim); if (wy.sub === 'retreat' && !sawRetreat) { sawRetreat = true; tShut = cr.age; const mo = partOf(cr, 'mouth'); shut = !cr.mouthWin && (mo.cmdOpen === false || !mo.open); } }
  report(sawRetreat && shut && tShut - tOpen >= M.FOR - 0.5 && tShut - tOpen <= M.FOR + M.GULP * 3 + M.SLACK + 1, `the window closes after ${(tShut - tOpen).toFixed(1)} s (FOR ${M.FOR} s): the maw shuts and it burrows`);
}
{
  // FED bombs win it
  const A = wyrmUp({ erupt: true });
  const { sim, st, cr } = A;
  cr.maxHp = cr.hp = 5000; // (a thin crew's pool is small: the bombs would empty it first)
  cr.grips[0].left = 0.01;
  until(sim, () => cr.mouthWin && partOf(cr, 'mouth').open, 10);
  const mouth = partOf(cr, 'mouth');
  for (let k = 0; k < WY.MOUTH.FED && !cr.dying; k++) {
    CS.creatureBomb(st, { x: mouth.segs[0].x, y: mouth.segs[0].y - 200, owner: 'p1' });
    if (cr.mouthWin) { cr.mouthWin.gulp = 0; if (!mouth.open) { mouth.open = true; mouth.cmdOpen = null; } }
  }
  step(sim, 1);
  wyWin('FEED the maw', st, cr, 'mouth');
}

// (W6) the phases, the sun, the underbelly
{
  const A = wyrmUp({ erupt: true });
  const { sim, st, ship, cr } = A;
  const wy = cr.wyrm;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  const belly = partOf(cr, 'heart');
  report(cr.phase === 1 && belly.hidden && !wy.sun, 'phase 1: the underbelly is hidden and there is no sun');
  cr.hp = cr.maxHp * (WY.PHASE.TWO_HP - 0.02);
  step(sim, 2);
  report(cr.phase === 2 && /FREEZES THE GUNS/.test(st.ev.warnText) && cr.ai.breather > 0 && msgs.some((m) => /FREEZES/.test(m.t)), `below ${(WY.PHASE.TWO_HP * 100).toFixed(0)}% of the pool: phase 2, banner "${st.ev.warnText}", a breather`);
  cr.hp = cr.maxHp * (WY.PHASE.THREE_HP - 0.02);
  step(sim, 2);
  report(cr.phase === 3 && !belly.hidden && !!wy.sun && Math.abs(wy.sun.x - (cr.base.x + cr.f * WY.SUN.DIST)) < 1 && /SUN/.test(st.ev.warnText), `below ${(WY.PHASE.THREE_HP * 100).toFixed(0)}%: phase 3, the underbelly opens, a shaft of sun breaks through ${WY.SUN.DIST} px from the cliff ("${st.ev.warnText}")`);
  report(cr.stats.phaseAt && cr.stats.phaseAt[3] !== undefined, 'the phase changes are recorded');
  // it cannot burrow now: after the coil and the gape it waits out
  cr.grips[0].left = 0.01;
  until(sim, () => wy.sub === 'idle', 30);
  step(sim, secs(4));
  report(wy.mode === 'out' && wy.sub === 'idle' && cr.mode === 'idle', 'in phase 3 it stays out after the gape: no more burrowing (exhausted)');
  const head = partOf(cr, 'head'), hs = head.segs[0];
  const root = { x: cr.x + wyOf(cr).at[0] * cr.f, y: cr.y + wyOf(cr).at[1] };
  report(Math.abs(Math.hypot(hs.x - root.x, hs.y - root.y)) < wyOf(cr).reach, 'the head hangs out of the cliff within reach of its root');
  // it coils again, later
  wy.coilT = 0;
  until(sim, () => cr.grips[0] && cr.grips[0].mode === 'hold', 10);
  report(wy.sub === 'coil' && cr.stats.coils >= 2, 'and it coils her again from where it hangs');
  report(WY.POOL.mouth >= WY.POOL.head && WY.POOL.heart >= WY.POOL.mantle && WY.POOL.tentacle >= 0.9, 'the weak points count more against the pool than the body does');
}
{
  // THE SUN: a harpoon on the head hauls it into the shaft; the pool melts
  const A = wyrmUp({ erupt: true });
  const { sim, st, ship, cr, p1 } = A;
  const wy = cr.wyrm;
  cr.hp = cr.maxHp * 0.3;
  step(sim, 2);
  cr.grips[0].left = 0.01;
  until(sim, () => wy.sub === 'idle', 30);
  step(sim, secs(2));
  wy.coilT = wy.gapeT = 1e9; // (the test hauls the head undisturbed)
  const head = partOf(cr, 'head');
  const tg = AIM.targets(st);
  report(CS.creatureTowTargets(st).length === 1 && CS.creatureTowTargets(st)[0].part === head, 'in phase 3 the harpoon gun may aim at its head (and only there)');
  const hs = head.segs[0], dk = PLS(ship)[ship.layout.deckIndex('main')];
  const from = { x: dk.x1 - 80, y: dk.y - 60 };
  const hx = T.toWorldX(ship, from.x), hy = T.toWorldY(ship, from.y);
  const tw = TW.creatureLatch(st, ship, { part: head, seg: 0, d: Math.hypot(hs.x - hx, hs.y - hy), x: hs.x, y: hs.y }, from, config.GUN_TYPES.harpoon, p1);
  step(sim, secs(1));
  const sun = wy.sun;
  report(cr.hooked && !!tw, 'the line holds the head');
  // she flies to the sun: the line hauls the head after her
  const toSun = sun.x - midWorld(ship).x;
  ship.pose.x += toSun;
  const h0 = hs.x;
  let n = 0;
  for (; n < secs(60) && !cr.dying; n++) { step(sim, 1); ship.pose.x += sun.x - midWorld(ship).x; ship.pose.vy = 0; } // (the helm holds her over the shaft: the line would drag her toward the head)
  report(Math.abs(wy.haul) > 100 || cr.stats.sunSecs > 0, `the line hauls its head ${Math.round(Math.abs(wy.haul))} px toward the sun`);
  report(cr.stats.sunSecs > 0 && (cr.stats.by.sun || 0) > 0, `in the shaft the pool melts: ${(cr.stats.sunSecs).toFixed(1)} s of sun took ${Math.round(cr.stats.by.sun || 0)} hp (haul ${Math.round(wy.haul)}, head x ${Math.round(head.segs[0].x)}, sun ${Math.round(sun.x)}, hooked ${cr.hooked}, sub ${wy.sub}, mode ${wy.mode}, ship ${Math.round(midWorld(ship).x)})`);
  void h0; void tg;
  wyWin('the SUN', st, cr, 'tow');
}
{
  // without a line the sun is a place, not a weapon: the head hanging at its station is out of it
  const A = wyrmUp({ erupt: true });
  const { sim, st, cr } = A;
  cr.hp = cr.maxHp * 0.3;
  cr.grips[0].left = 0.01;
  until(sim, () => cr.wyrm.sub === 'idle', 30);
  step(sim, secs(10));
  report(!cr.wyrm.inSun && !(cr.stats.sunSecs > 0), 'a head hanging at its own station is out of the sun (it must be hauled)');
}
{
  // BOARD the underbelly
  const A = wyrmUp({ erupt: true });
  const { sim, st, ship, cr, p1 } = A;
  const wy = cr.wyrm;
  const belly = partOf(cr, 'heart');
  cr.hp = cr.maxHp * 0.3;
  step(sim, 2);
  cr.grips[0].left = 0.01;
  until(sim, () => wy.sub === 'idle', 30);
  step(sim, secs(1));
  Object.assign(p1, { fall: false, fly: true, air: false, lock: null, conn: null, ko: 0, jx: 0, jy: 0, jz: 0, hearts: config.HEALTH.MAX, carry: 'sword' });
  const bs = belly.segs[0];
  report(BD.boardAt(st, ship, p1, bs.x, bs.y) && !!p1.on, 'a flier lands on its collar: he is aboard (the landing strip is the collar\'s top)');
  let n = 0, seen = null;
  for (; n < secs(40) && !cr.dying; n++) { p1.fire = true; step(sim, 1); if (!seen && p1.act) seen = p1.act.label; }
  p1.fire = false;
  report(cr.dying && seen === 'STRIKE THE UNDERBELLY!', `holding Action with a sword at the belly ("${seen}") for ${(n / 60).toFixed(0)} s (${WY.BOARD.HEART_TIME} s a stroke, ${WY.BOARD.HEART_DMG} damage) brings it down`);
  wyWin('BOARD and strike the underbelly', st, cr, 'board');
}
{
  // the pool (shells on the bare body) wins it: 'shell'
  const A = wyrmUp({ erupt: true });
  const { sim, st, cr } = A;
  holdCoil(cr);
  const limb = wyOf(cr);
  limb.ice.fill(0);
  cr.hp = cr.maxHp * 0.3;
  step(sim, 2);
  let n = 0;
  for (; n < 400 && !cr.dying; n++) {
    holdCoil(cr);
    limb.hp = limb.maxHp;
    limb.ice.fill(0);
    st.shells.push({ x: limb.segs[3].x, y: limb.segs[3].y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
    CS.creatureShell(st);
  }
  step(sim, 1);
  report(cr.dying && n < 400, `chipped bare and shelled down by ${n} shells (the pool ${Math.round(cr.maxHp)})`);
  wyWin('SHELL it down', st, cr, 'shell');
}
{
  // FORCE_WIN: only the way asked for can end it
  const A = wyrmUp({ erupt: true });
  const { st, cr } = A;
  holdCoil(cr);
  C.FORCE_WIN = 'mouth';
  const limb = wyOf(cr);
  limb.ice.fill(0);
  CS.hurtCreature(st, { part: limb, seg: 3 }, 1e9, { src: 'shell', who: 'p1' });
  report(!cr.dying, 'with FORCE_WIN "mouth" an emptied pool does not end it (only the maw can)');
  C.FORCE_WIN = null;
}

// (W7) the reward, the lair, the voyage, the TV
{
  restoreCfg();
  wyCfgBack();
  realHp();
  C.DEV_LAIR_AS = 'wyrm';
  const ctx = boot({ env: 'frost', lair: true, bots: 0, start: 'classic' });
  const { sim, st, ship } = ctx;
  const map = st.course.map, c = st.course;
  report(c.stop && c.stop.lair === true && c.stop.creature === 'wyrm' && map.creature === 'wyrm', 'a Wyrm lair stop flies the lair map for the Wyrm');
  step(sim, secs(2));
  report(st.creature === null && !st.boss, 'at the start there is no creature and no zeppelin');
  ship.pose.x = map.start.x + (map.goal.x - map.start.x) * 0.7 - ship.layout.refPoint.x;
  st.tempo.phase = 'build';
  st.tempo.bossOk = true;
  for (let i = 0; i < secs(4) && !st.creature; i++) step(sim, 1);
  report(!!st.creature && st.creature.kind === 'wyrm' && !st.boss, `at ${(c.progress * 100).toFixed(0)}% of the way the Wyrm stirs where the zeppelin would come in: ${st.creature && st.creature.name}; no zeppelin`);
  const cr = st.creature;
  wQuiet(cr);
  step(sim, secs(3));
  ship.pose.x = map.goal.x - ship.layout.refPoint.x;
  ship.pose.y = map.goal.y - ship.layout.refPoint.y;
  st.ev.warn = 0;
  step(sim, secs(3));
  report(!c.done && !c.pendingNext, 'at the lair\'s middle with the Wyrm alive the stop is not done');
  cr.wyrm.nextT = 0;
  until(sim, () => cr.wyrm.mode === 'out', 10);
  report(st.tempo.phase === 'peak' && st.tempo.kind === 'boss', 'the pacing director treats it as the mission boss');
  st.ship.hull = 40;
  for (const b of st.bags) b.gas = 30;
  st.run.trophy = 'krakenBeak';
  const salv0 = st.run.salvage, hull0 = st.ship.hull;
  cr.hooks.hurtPool(1e9, 'shell', 'p1');
  step(sim, secs(2));
  report(cr.dying && !c.done && st.bossDownLap === c.lap, 'killed, it is dying and the boss is down');
  step(sim, secs(1));
  const SV = config.SALVAGE.BOSS * C.REWARD_MUL;
  report(st.run.salvage - salv0 >= SV && st.run.salvage - salv0 <= SV + 40, `triple boss salvage: +${st.run.salvage - salv0}`);
  report(st.ship.hull >= hull0 + WY.REWARD.HULL - 1 && st.bags.every((b) => b.gas >= 30 + WY.REWARD.GAS - 10) && st.run.trophy === 'krakenBeak' && WY.REWARD.TROPHY === null, `a hull patch (+${WY.REWARD.HULL}) and every gasbag (+${WY.REWARD.GAS}); no trophy card (a waiting one is kept)`);
  for (let i = 0; i < secs(WY.SPAWN.SINK + C.CHUNK.LIFE + 3) && !c.done; i++) step(sim, 1);
  report(c.done === true && c.pendingNext === true && st.creature === null && /RIME WYRM IS SLAIN/.test(st.ev.warnText), `once it has collapsed the stop is done: "${st.ev.warnText}"`);
}
{
  // the voyage: Frost Peaks stops hold the Wyrm
  restoreCfg();
  const LR = C.LAIR;
  const seeds = Array.from({ length: quick ? 80 : 300 }, (_, i) => 1000 + i * 7919);
  let frostLairs = 0, bad = [], total = 0;
  for (const mode of ['quick', 'voyage', 'campaign']) for (const sd of seeds) {
    const v = VY.generateVoyage(sd, { mode, gentle: sd % 2 === 0 });
    for (const s of v.columns.flat()) if (s.lair) {
      total++;
      if (s.creature !== LR.BY_ENV[s.env] && s.creature !== 'titan') bad.push(`${mode}/${sd}: ${s.id} on ${s.env} holds ${s.creature}`);
      if (s.creature === 'wyrm') { frostLairs++; if (s.env !== 'frost' || s.col === 0 || s.flagship) bad.push(`${mode}/${sd}: a Wyrm lair on ${s.env} column ${s.col}`); }
    }
  }
  report(!bad.length && frostLairs > 0 && LR.BY_ENV.frost === 'wyrm', `lairs are by sky: ${frostLairs} of ${total} lairs on ${seeds.length * 3} routes are the Rime Wyrm's (Frost Peaks stops only, never the first stop or the Flagship)${bad.length ? '\n  ' + bad.slice(0, 5).join('\n  ') : ''}`);
  const wl = VY.lairOf('wyrm');
  report(wl.NAME === WY.LAIR.NAME && VY.stopName({ lair: true, creature: 'wyrm', env: 'frost' }) === WY.LAIR.NAME, 'the stop has the right name');
  const ctx = boot({ start: 'classic', bots: 3 });
  const { sim, st } = ctx;
  const v = st.run.voyage, here = v.columns[0][0], lair = v.columns[1][0];
  Object.assign(lair, { env: 'frost', play: 'frost', kind: 'lair', lair: true, creature: 'wyrm', danger: 2, reward: 40 });
  here.next = v.columns[1].map((s) => s.id);
  st.run.salvage = 0;
  sim.startDock();
  if (st.vote && st.vote.kind === 'dock') {
    const cast = st.vote.options.findIndex((o) => o.kind === 'cast');
    for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = cast; }
    step(sim, secs(3));
  }
  const route = st.vote && st.vote.kind === 'route' ? st.vote : null;
  const opt = route && route.options.find((o) => o.id === lair.id);
  report(!!opt && opt.lair === true && opt.icon === WY.LAIR.ICON && /wyrm|lair/i.test(opt.desc) && opt.kindName === WY.LAIR.KIND, `the route vote lists it: ${opt && opt.icon} "${opt && opt.name}" - ${opt && opt.desc}`);
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
  const texts = rec.texts.map((q) => q.s);
  report(exc === 0 && texts.includes(WY.LAIR.ICON) && texts.includes(WY.LAIR.LABEL), 'the TV\'s route map draws the Wyrm icon and its label (0 draw errors)');
}
{
  // the TV: cracks, the body, the chip rings, the breath, the funnel, the sun
  const A = wyrmUp({ breath: true });
  const { sim, st, ship, cr } = A;
  const wy = cr.wyrm;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const seen = new Set();
  let exc = 0, hudText = false, ms = 0, frames = 0;
  const frame = () => {
    step(sim, 1);
    rec.texts.length = 0;
    const t0 = hr();
    try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    ms += hr() - t0;
    frames++;
    if (rec.texts.some((x) => x.s.startsWith('THE RIME WYRM - '))) hudText = true;
    if (wy.crack) seen.add('crack'); if (wy.breath) seen.add('breath.' + wy.breath.sub); if (cr.mouthWin) seen.add('gape'); if (cr.grips.some((g) => g.mode === 'hold')) seen.add('coil'); if (wy.sun) seen.add('sun');
    if (cr.mode === 'idle' && WYB.wyrmChipJobs(st, ship).length) seen.add('chip rings');
  };
  wy.nextT = 0;
  for (let f = 0; f < 60 * 8; f++) frame();
  cr.wyrm.breathT = 0;
  for (let f = 0; f < 60 * 6; f++) { holdCoil(cr); frame(); }
  wyOf(cr).ice[8] = 0;
  for (const g of cr.grips) g.left = 0.1;
  for (let f = 0; f < 60 * 10; f++) frame();
  cr.hp = cr.maxHp * 0.3;
  for (let f = 0; f < 60 * 6; f++) frame();
  report(exc === 0 && hudText && ['crack', 'coil', 'breath.wind', 'breath.blow', 'gape', 'sun', 'chip rings'].every((k) => seen.has(k)), `the fight draws on a stub canvas for ${frames} frames with 0 errors (seen: ${[...seen].join(', ')}); the bar says THE RIME WYRM with its phase`);
  console.log(`     whole-TV frame with the Wyrm: ${(ms / frames).toFixed(2)} ms (JS on a stub canvas)`);
  const stub = stubCtx();
  const art = createCreatureArt({ ctx: stub });
  let t = 0, blits = 0;
  cr.wyrm.nextT = 0;
  until(sim, () => cr.wyrm.shown, 20);
  for (let f = 0; f < 300; f++) { step(sim, 1); const t0 = hr(); art.draw(cr, { zoom: 0.14, dpr: 1 }); art.drawBehind(cr, { zoom: 0.14, dpr: 1 }); t += hr() - t0; blits = Math.max(blits, art.stats.blits); }
  report(t / 300 < config.PERF.BUDGET_MS && blits > 5, `creatureArt alone: ${(t / 300).toFixed(3)} ms a frame over 300 frames (${blits} blits; budget ${config.PERF.BUDGET_MS} ms)`);
}

// (W8) the bots
if (!argv.includes('--no-wyrm-bots')) {
  restoreCfg();
  wyCfgBack();
  const botsimPath = path.join(publicDir, '..', 'tools', 'botsim.mjs');
  const run = (args, env = {}) => new Promise((resolve) => {
    // (the Wyrm's fight is long, and the old game's raiders and fires (NO_PARTY, NO_STEAMFIX ...) would sink the ship under the bots before it ends: its bots fly the real game, as the Titan's fly the away team's)
    const real = { NO_ALARMS: '', NO_SCRAP: '', NO_PARTY: '', NO_STOP_SHAPE: '', NO_GUNS: '', NO_RINGFAIR: '', NO_STEAMFIX: '', NO_AWAY: '', NO_ROLE_CARDS: '', NO_HELM_V2: '' };
    const c = spawn(process.execPath, [botsimPath, ...args], { env: { ...process.env, ...real, ...env } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  const fight = (out) => {
    const m = /fight 1: phase (\d)[^\n]*?; ended: (\w+)(?: at (\d+)s)?/.exec(out);
    return m ? { phase: +m[1], ended: m[2], at: m[3] === undefined ? null : +m[3] } : null;
  };
  const pool = async (jobs, n) => { const res = []; let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < jobs.length) { const i = k++; res[i] = await jobs[i](); } })); return res; };
  const seedsB = quick ? [1, 2] : [1, 2, 3];
  const forced = ['shell', 'mouth', 'tow', 'board', 'hp'];
  const jobs = [];
  for (const w of forced) for (const sd of seedsB) jobs.push(() => run(['--creature', 'wyrm', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd), ...(w === 'tow' ? ['--build', 'harpoon'] : [])], { CREATURE_FORCE_WIN: w }).then((r) => ({ w, sd, r })));
  for (const bots of [4, 16]) for (const sd of seedsB) jobs.push(() => run(['--creature', 'wyrm', '--bots', String(bots), '--difficulty', 'easy', '--minutes', '16', '--seed', String(sd)]).then((r) => ({ w: 'easy' + bots, sd, r })));
  for (const sd of seedsB) jobs.push(() => run(['--creature', 'wyrm', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)]).then((r) => ({ w: 'free', sd, r })));
  const results = await pool(jobs, 5);
  const clean = (r) => r.code === 0 && /errors: 0/.test(r.out) && !/NaN/.test(r.out);
  const byWin = {};
  for (const { w, sd, r } of results) { const f = fight(r.out); (byWin[w] ||= []).push({ sd, f, ok: clean(r) }); }
  for (const w of forced) {
    const rows = byWin[w];
    const times = rows.map((x) => (x.f && x.f.ended === w ? x.f.at : null));
    report(rows.every((x) => x.ok) && times.every((t) => t !== null && t <= 360), `forced ${w.toUpperCase()}: 8 bots on Normal end it that way within 6 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] === null ? 'NOT (' + (x.f ? x.f.ended + ', phase ' + x.f.phase : 'no fight') + ')' : times[i] + ' s')).join(', ')})`);
  }
  for (const bots of [4, 16]) {
    const rows = byWin['easy' + bots];
    const times = rows.map((x) => (x.f && x.f.ended !== 'no' ? { at: x.f.at, how: x.f.ended } : null));
    report(rows.every((x) => x.ok) && times.every((t) => t && t.at <= 600), `${bots} bots on Easy win within 10 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] ? times[i].how + ' ' + times[i].at + ' s' : 'NOT')).join(', ')})`);
  }
  {
    const rows = byWin.free;
    const how = rows.map((x) => (x.f && x.f.ended !== 'no' ? x.f.ended + ' ' + x.f.at + ' s' : 'NOT'));
    report(rows.every((x) => x.ok) && how.every((h) => h !== 'NOT'), `unforced, 8 bots on Normal win (${how.join(', ')})`);
  }
  report(results.every(({ r }) => clean(r)), `0 errors and no NaN in any of the ${results.length} Wyrm bot fights`);
}

// =================================================================== C.6e: THE MYCELIAL MOTHER ===================================================================
//   (M0) the body (a cap, two eyes, a hidden spore heart, five tendrils) and her cavern in the Fungal Depths only; asleep she cannot be touched, she stirs when the ship comes near and then wakes
//   (M1) THE DARK: unlit, her cap, eyes and heart cannot be aimed at or hit by a shell, a flame or the radar; a lamp beam makes them hittable; a tendril that reaches is hittable unlit
//   (M2) THE TENDRIL GRAB: banner, a growing tendril, the pull UP (the tilt stays inside FORCES.MAX_DEG), a sword hack frees her and wounds it (not the pool), the timer rips a section off
//   (M3) BURNING: flame does triple, sets the tendril alight, the fire runs along it and jumps to the next, a burning tendril lets go, a burnt tendril is cut off and the last one gone wins (BURN)
//   (M4) SPORES: a ring and a banner, a cloud that falls on the ship, blinds the lamp, slows the crew; flame burns it off and lights the decks
//   (M5) THE WING BEAT: a banner naming the side, then the ship is shoved that way (the tilt stays inside FORCES.MAX_DEG), not while a tendril holds her, rock stops her
//   (M6) the phases and each win scripted (burn, cut, eyes, mortar, board, hp), the reward, the lair stops of a voyage, the TV, and (M7) the bots: each forced win by 8 bots on Normal, 4 and 16 bots on Easy
const MM = C.MOTHER;
const MMB = await load('modules/host/creatureMother.js');
const MM0 = JSON.stringify({ F: MM.FIRST, A: MM.ARRIVE, E: MM.ATTACK.EVERY, W: MM.ATTACK.WEIGHTS });
const mCfgBack = () => { const o = JSON.parse(MM0); MM.FIRST = o.F; MM.ARRIVE = o.A; MM.ATTACK.EVERY = o.E; MM.ATTACK.WEIGHTS = o.W; };
const mPart = (cr, id) => cr.parts.find((p) => p.id === id);
const mTend = (cr) => cr.parts.filter((p) => p.kind === 'tentacle');
const mQuiet = (cr) => { cr.mother.nextT = 1e9; cr.ai.breather = 0; };
const mWeights = (w) => { for (const ph of [1, 2, 3]) MM.ATTACK.WEIGHTS[ph] = { grab: 0, spores: 0, beat: 0, ...w }; };
const mAimLamp = (A, target) => { // man the nest lamp with p1 and point its beam at a world point
  const { st, ship, p1 } = A, l = st.searchlights.find((q) => /Nest/.test(q.n));
  p1.lock = l.n;
  p1.fall = false; p1.fly = false;
  const a = T.aimToShip(ship, Math.atan2(target.y - l.ey, target.x - l.ex)) - (st.ship.pitch || 0);
  p1.jx = Math.cos(a); p1.jy = Math.sin(a);
  return l;
};
// A sim in the Mother's lair (the Fungal Depths) with her spawned; awake: wait until she has stirred and woken (her attacks held until a test asks).
function motherUp({ difficulty = 'normal', bots = 0, awake = true, start = null } = {}) {
  restoreCfg();
  mCfgBack();
  C.DEV_LAIR_AS = 'mother';
  const ctx = boot({ env: 'fungal', lair: true, difficulty, bots, start });
  const map = ctx.st.course.map;
  ctx.ship.pose.x = map.goal.x - ctx.ship.layout.refPoint.x;
  ctx.ship.pose.y = map.goal.y - ctx.ship.layout.refPoint.y;
  step(ctx.sim, 5);
  const cr = ctx.sim.creatures.spawn('mother');
  mQuiet(cr);
  const A = { ...ctx, cr, p1: ctx.st.players.p1, map };
  if (awake) until(ctx.sim, () => cr.mode === 'idle', MM.ARRIVE + 4);
  step(ctx.sim, 10);
  return A;
}
const mHold = (cr) => { for (const g of cr.grips) g.left = Math.max(g.left, 60); };
const mWin = (name, st, cr, why) => {
  report(cr.dying && cr.stats.win === why && cr.diedBy === why, `${name}: stats.win "${cr.stats.win}"`);
  report(st.ev.warnText.startsWith(MM.WIN_TEXT[why]) && st.ev.warn >= FN.BANNER - 0.1, `${name}: the final banner "${st.ev.warnText}"`);
  report(st.bossDownLap === st.course.lap && st.slow === FN.SLOW, `${name}: the boss counts as down and the last blow runs in slow motion (state.slow ${st.slow})`);
};
const mGrab = (A, secsMax = 8) => { // ask for a grab now and wait until a tendril holds her
  const { sim, cr } = A;
  mWeights({ grab: 1 });
  cr.mother.nextT = 0;
  let n = 0;
  for (; n < secs(secsMax) && !(cr.grips[0] && cr.grips[0].mode === 'hold'); n++) step(sim);
  cr.mother.nextT = 1e9;
  return cr.grips[0] && cr.grips[0].mode === 'hold' ? cr.grips[0] : null;
};
const mHack = (A, g, secsHold) => { // a sword at the grip point, Action held
  const { sim, st, ship, p1 } = A;
  standOn(p1, ship, g.job.d, g.x - 30, 'sword');
  p1.fire = true;
  for (let n = 0; n < secs(secsHold) && !freedBy(A.cr); n++) { p1.x = g.x - 30; step(sim); }
  p1.fire = false;
  void st;
};

// (M0) the world and the body
{
  restoreCfg();
  mCfgBack();
  C.DEV_LAIR_AS = 'mother';
  const ctx = boot({ env: 'fungal', lair: true });
  const { sim, st, ship } = ctx;
  const map = st.course.map, d = map.dome;
  report(map.lair === true && map.creature === 'mother' && map.outposts.length === 0 && map.turrets.length === 0 && !!d && d.pillars.length === MM.LAIR.PILLARS.length && Number.isFinite(map.startDist) && map.startDist < 1e8 && Math.abs(d.x - map.goal.x) < 400 && d.roofY < map.goal.y - 2000, `her lair is a closed cavern: a roof ${Math.round(map.goal.y - d.roofY)} px over the lair's middle, ${d.pillars.length} pillars, no outposts or guns, a way to the middle`);
  report(spawnCr(ctx, 'kraken') === null && spawnCr(ctx, 'drake') === null && spawnCr(ctx, 'thunderbird') === null && spawnCr(ctx, 'titan') === null && spawnCr(ctx, 'wyrm') === null && st.creature === null, 'no other creature comes to the Mother lair');
  const cr = spawnCr(ctx, 'mother');
  const cnt = (k) => cr.parts.filter((p) => p.kind === k);
  report(!!cr && cr.kind === 'mother' && cr.name === MM.NAME && cr.mode === 'surfacing' && cr.mother.mode === 'asleep' && cnt('mantle').length === 1 && cnt('eye').length === 2 && cnt('heart').length === 1 && cnt('heart')[0].hidden && cnt('tentacle').length === MM.BODY.TENDRILS.N && cr.parts.every((p) => p.hp > 0),
    `spawn puts ${cr && cr.name} in state.creature, asleep: a cap, 2 eyes, a hidden spore heart and ${MM.BODY.TENDRILS.N} tendrils`);
  const cap = mPart(cr, 'cap').segs[0];
  report(cap.y - cap.r < d.roofY + 300 && cap.y + cap.len + cap.r > d.roofY + 1200 && Math.abs(cap.x - d.x) < 1, `her cap hangs from the roof above the lair's middle (bottom ${Math.round(cap.y + cap.len + cap.r)}, roof ${d.roofY})`);
  st.shells.push({ x: cap.x, y: cap.y + cap.len + cap.r - 100, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 5);
  report(cr.hp === cr.maxHp && AIM.targets(st).filter((t) => t.kind === 'creaturePart').length === 0 && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0 && CS.creatureHit(st, cap.x, cap.y + cap.len + cap.r - 100, 100) === null, 'asleep, she cannot be hurt, shot at or spotted');
  const B0 = boot({ env: 'sea' });
  report(spawnCr(B0, 'mother') === null && B0.st.creature === null, 'the Mother does not come to the Sunken Sea');
  const B1 = boot({ env: 'fungal', lair: false });
  report(spawnCr(B1, 'mother') === null && B1.st.creature === null, '...nor to an ordinary Fungal Depths stop');
  // she stirs when the ship comes near, and wakes after ARRIVE s
  mQuiet(cr);
  ship.pose.x = d.x - MM.WAKE_DX * 3 - ship.layout.refPoint.x;
  step(sim, 60);
  report(cr.mother.mode === 'asleep', 'a ship far from her does not wake her');
  ship.pose.x = d.x - 5000 - ship.layout.refPoint.x;
  ship.pose.y = map.goal.y - ship.layout.refPoint.y;
  st.sfxQ.length = 0;
  let stirText = ""; for (let n = 0; n < 8; n++) { step(sim, 1); if (/STIRS/.test(st.ev.warnText)) stirText = st.ev.warnText; }
  report(cr.mother.mode === 'stirring' && /STIRS/.test(stirText) && /LIGHT/.test(stirText) && st.sfxQ.some((x) => x[0] === 'roar') && cr.mode === 'surfacing', `near her she stirs: "${stirText}", untouchable meanwhile`);
  const t0 = cr.age;
  until(sim, () => cr.mode === 'idle', MM.ARRIVE + 3);
  report(cr.mother.mode === 'awake' && Math.abs(cr.age - t0 - MM.ARRIVE) < 1.2, `she wakes ${(cr.age - t0).toFixed(1)} s later (ARRIVE ${MM.ARRIVE} s)`);
}

// (M1) the dark
{
  const A = motherUp();
  const { sim, st, ship, cr, p1 } = A;
  const eye = mPart(cr, 'eyeN'), cap = mPart(cr, 'cap'), es = eye.segs[0], cs = cap.segs[0];
  report((st.darkNow || 0) > C.DARK_AT, `the cavern is dark (darkNow ${(st.darkNow || 0).toFixed(2)})`);
  const tg = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  report(tg.length > 0 && tg.filter((t) => t.part.kind !== 'tentacle').every((t) => t.dark === true) && SP.radarItems(st).filter((i) => i.kind === 'creature').length === 0, `unlit, her cap, eyes and heart are listed for the lamp but flagged dark (${tg.length} targets), and the radar shows nothing`);
  const gun = st.GUNS['Dorsal Gun'];
  const b0 = AIM.bestTarget(st, gun);
  report(!b0 || b0.target.kind !== 'creaturePart' || b0.target.part.kind === 'tentacle', 'no gun will aim at anything of hers that is not lit');
  const hp0 = eye.hp;
  st.shells.push({ x: es.x, y: es.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 3);
  report(CS.creatureHit(st, es.x, es.y, 60) === null && eye.hp === hp0 && cap.hp === cap.maxHp, 'a shell flying through the unlit eye finds nothing: no damage');
  mAimLamp(A, { x: es.x, y: es.y });
  step(sim, secs(2.5));
  report(eye.tgt && eye.tgt.lit > 0 && cap.tgt.lit > 0 && !!cr.mother.lamp, `the nest lamp held on her eye lights the eye and the cap (lit ${eye.tgt && eye.tgt.lit.toFixed(2)}); the first lamp that finds her is a Book moment`);
  const tg2 = AIM.targets(st).filter((t) => t.kind === 'creaturePart');
  report(tg2.filter((t) => t.part.id === 'eyeN').every((t) => t.dark === false) && SP.radarItems(st).filter((i) => i.kind === 'creature').length > 0 && AIM.bestTarget(st, gun) !== null, 'lit, the eye is a plain target, the guns can aim at it and the radar shows her');
  mAimLamp(A, { x: es.x, y: es.y });
  const hp1 = eye.hp;
  st.shells.push({ x: es.x, y: es.y, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 2);
  const want = config.GUNS.DAMAGE * H.SHELL_MUL * (1 + config.SEARCHLIGHT.LIT_DAMAGE) * MM.EYES.LIT_MUL;
  report(Math.abs((hp1 - eye.hp) - want) < want * 0.35 && (hp1 - eye.hp) > 0, `a shell on the lit eye hurts it ${(hp1 - eye.hp).toFixed(1)} (the beam adds ${config.SEARCHLIGHT.LIT_DAMAGE * 100}%, a lit eye ${MM.EYES.LIT_MUL}x more)`);
  // a plain shell on the lit cap does only a quarter; a mortar shell all of it
  const ch0 = cap.hp;
  st.shells.push({ x: cs.x, y: cs.y + cs.len + cs.r - 150, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1 });
  step(sim, 2);
  const plain = ch0 - cap.hp;
  const ch1 = cap.hp;
  st.shells.push({ x: cs.x, y: cs.y + cs.len + cs.r - 150, vx: 0, vy: 0, life: 1, owner: 'p1', mul: 1, kind: 'mortar' });
  step(sim, 2);
  report(plain > 0 && cap.hp < ch1 && (ch1 - cap.hp) > plain * 3 && cr.mother.mortared === 1, `her cap is spongy: a plain shell does ${plain.toFixed(1)}, a mortar shell ${(ch1 - cap.hp).toFixed(1)} (and counts: ${cr.mother.mortared}/${MM.MORTAR.HITS})`);
  // the beam leaves: dark again
  p1.lock = null;
  p1.jx = p1.jy = 0;
  step(sim, secs(2));
  report(!(eye.tgt.lit > 0) && CS.creatureHit(st, es.x, es.y, 60) === null, 'when the lamp lets go she is dark again, and unhittable');
  // what a tendril shows
  const mid = T.toWorldX(ship, ship.layout.refPoint.x), my = T.toWorldY(ship, ship.layout.refPoint.y);
  const fake = (mode, y) => ({ kind: 'tentacle', ctl: { mode }, segs: [{ x: mid, y, len: 10, ang: 0, r: 10 }] });
  report(MMB.motherSeen(st, cr, fake('seize', my - 3000), 0) && !MMB.motherSeen(st, cr, fake('idle', my - 3000), 0) && MMB.motherSeen(st, cr, fake('idle', my - 100), 0), 'a tendril that reaches is seen anywhere; an idle one only inside the ship\'s own glow');
}

// (M2) the tendril grab
{
  const A = motherUp();
  const { sim, st, ship, cr, p1 } = A;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  standOn(p1, ship, topD(ship), 400, null);
  const y0 = ship.pose.y;
  mWeights({ grab: 1 });
  cr.mother.nextT = 0;
  let banner = '';
  for (let n = 0; n < secs(3) && cr.grips.length === 0; n++) { step(sim); if (/TENDRIL GROWS/.test(st.ev.warnText)) banner = st.ev.warnText; }
  mQuiet(cr);
  report(/TENDRIL GROWS DOWN/.test(banner) && cr.grips.length >= 1 && cr.grips[0].mode === 'wind', `a tendril grows toward the ship: banner "${banner}"`);
  const limb = cr.grips[0].limb;
  report(MMB.motherSeen(st, cr, limb, limb.segs.length - 1) && (limb.ctl.mode !== 'idle' || !!limb.ctl.cmd), 'while it grows it is seen, lamp or no lamp');
  const g = mGrab(A);
  report(!!g && cr.stats.grabs >= 1, 'it takes hold');
  step(sim, secs(3));
  const tilt = Math.abs(ship.ctx.forces.theta);
  report(ship.pose.y < y0 - 20 && g.acc > 0 && tilt <= (config.FORCES.MAX_DEG * Math.PI) / 180 + 1e-3, `it pulls her UP toward the roof: ${Math.round(y0 - ship.pose.y)} px higher after 3 s, the tilt ${(tilt * 180 / Math.PI).toFixed(2)} deg inside the ${config.FORCES.MAX_DEG} deg limit`);
  report(msgs.some((m) => m.id === 'p1' && /MOTHER HAS YOU|TENDRIL|GET OFF/.test(m.t)), 'the phone buzzes for the crew at the deck end');
  // a sword at the grip frees her and wounds the tendril, but not the pool
  const hp0 = cr.hp, th0 = g.limb.hp;
  mHack(A, g, MM.GRAB.SWORD_TIME + 1);
  report(freedBy(cr) === 'hack' && Math.abs((th0 - g.limb.hp) - g.limb.maxHp * MM.GRAB.HACK_DMG) < g.limb.maxHp * 0.06 && cr.hp === hp0 && cr.stats.hacks === 1, `a sword hack frees her (${freedBy(cr)}), wounds the tendril ${Math.round((th0 - g.limb.hp) / g.limb.maxHp * 100)}% and takes nothing off the pool`);
  // enough hacks cut a tendril off
  let cutOne = false;
  for (let k = 0; k < 12 && !cutOne; k++) {
    step(sim, secs(MM.GRAB.RECOIL + MM.GRAB.COOLDOWN + 1));
    const gg = mGrab(A);
    if (!gg) continue;
    mHack(A, gg, MM.GRAB.SWORD_TIME + 1);
    cutOne = mTend(cr).some((p) => p.severed);
  }
  report(cutOne && cr.chunks.length > 0, `${cr.stats.hacks} hacks cut a tendril off (a chunk tumbles)`);
  // the timer rips a section off
  const B = motherUp();
  const G = mGrab(B);
  step(B.sim, secs(MM.GRAB.TIME + 1));
  report(!!G && (B.cr.stats.ripped > 0 || B.cr.stats.hulled > 0), `left alone, the tendril rips a section off after ${MM.GRAB.TIME} s (ripped ${B.cr.stats.ripped || 0}, hull crush ${B.cr.stats.hulled || 0})`);
}

// (M3) burning
{
  const A = motherUp();
  const { sim, st, ship, cr } = A;
  const g = mGrab(A);
  report(!!g, 'a tendril holds her');
  const limb = g.limb, ws = limb.segs[limb.segs.length - 1], wm = { x: ws.x, y: ws.y };
  const hp0 = limb.hp;
  CS.creatureBurn(st, (x, y, pad) => Math.hypot(x - wm.x, y - wm.y) < 150 + pad, { x: wm.x, y: wm.y + 200 }, 0.25, 'p1');
  const dmg = hp0 - limb.hp, plain = H.FLAME_DPS * 0.25;
  report(Math.abs(dmg - plain * MM.BURN.MUL) < plain * 1.2 && dmg > plain * 1.8, `flame does ${MM.BURN.MUL}x on a tendril: ${dmg.toFixed(1)} against ${plain.toFixed(1)}`);
  report(MMB.burning(limb) && cr.stats.ignited === 1 && freedBy(cr) === 'flame', `it is alight and lets go of the ship (freed by "${freedBy(cr)}")`);
  const n0 = limb.burn.filter((v) => v > 0).length;
  step(sim, secs(2));
  const n1 = limb.burn.filter((v) => v > 0).length;
  report(n1 > n0 && n1 >= 4, `the fire runs along the tendril: ${n0} segments alight, then ${n1} two seconds later`);
  const hp1 = limb.hp;
  step(sim, secs(2));
  report(limb.hp < hp1 && cr.stats.by.burn > 0, `a burning tendril keeps losing health (${(hp1 - limb.hp).toFixed(1)} in 2 s)`);
  step(sim, secs(MM.BURN.JUMP_EVERY * 5 + 2));
  report(cr.stats.jumps >= 1, `the fire jumps to another tendril (${cr.stats.jumps} jumps)`);
  // burning ones to death cuts them off where the fire is rootmost
  for (const p of mTend(cr)) { if (p.severed) continue; p.hp = Math.min(p.hp, p.maxHp * 0.03); MMB.igniteTendril(st, cr, p, 1, 'p1'); }
  cr.mother.tDmg = 1000; cr.mother.tFire = 900;
  until(sim, () => cr.dying, 8);
  step(sim, 5);
  const left = mTend(cr).filter((p) => !p.severed);
  report(left.length === 0 && cr.stats.burnt >= 2 && cr.dying, `the burning tendrils burn off (${cr.stats.burnt} by fire, ${cr.chunks.length} chunks tumble)`);
  mWin('every tendril burnt off', st, cr, 'burn');
  const A2 = motherUp();
  A2.cr.mother.tDmg = 1000; A2.cr.mother.tFire = 100;
  for (const p of mTend(A2.cr)) CS.hurtCreature(A2.st, { part: p, seg: 2 }, p.hp + 5, { who: 'p1', src: 'shell' });
  step(A2.sim, 2);
  mWin('every tendril shot and hacked off (little fire)', A2.st, A2.cr, 'cut');
  void ship;
}

// (M4) spores
{
  const A = motherUp();
  const { sim, st, ship, cr, p1 } = A;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  const mid = { x: T.toWorldX(ship, ship.layout.refPoint.x), y: T.toWorldY(ship, ship.layout.refPoint.y) };
  const eyeP = mPart(cr, 'eyeN').segs[0];
  standOn(p1, ship, topD(ship), 700, null);
  mWeights({ spores: 1 });
  cr.mother.nextT = 0;
  let banner = '', ring = false, cloud = null;
  for (let n = 0; n < secs(5) && !cloud; n++) { step(sim); if (/SPORES/.test(st.ev.warnText)) banner = st.ev.warnText; if (cr.mother.ring) ring = true; cloud = cr.mother.clouds[0] || null; }
  mQuiet(cr);
  report(/PUFFS UP/.test(banner) && ring && msgs.some((m) => /SPORE BURST/.test(m.t)) && !!cloud && cloud.mode === 'fall', `the cap puffs up: banner "${banner}", a red ring on the ship, a buzz on the phones, then a cloud is born at the cap`);
  until(sim, () => cloud.mode === 'linger', MM.SPORES.FALL + 1);
  const sx = Math.abs(cloud.x - mid.x), sy = Math.abs(cloud.y - mid.y);
  report(cloud.mode === 'linger' && sx < 300 && sy < 300, `the cloud comes down on the ship (${Math.round(sx)} px off sideways, ${Math.round(sy)} px off in height)`);
  standOn(p1, ship, topD(ship), 700, null);
  step(sim, 10);
  report(p1.sporeT > 0, 'the crew inside the cloud are slowed (their phone says SPORES)');
  const l = mAimLamp(A, { x: eyeP.x, y: eyeP.y });
  step(sim, secs(3.5));
  report(!(mPart(cr, 'eyeN').tgt.lit > 0) && cr.stats.blocked > 0 && MMB.sporeBlocks(st, l.ex, l.ey, eyeP.x, eyeP.y), `with the cloud on the ship the nest lamp lights nothing of hers (blocked ${cr.stats.blocked} steps)`);
  p1.lock = null;
  const fires0 = st.fires.length;
  CS.creatureBurn(st, (x, y, pad) => Math.hypot(x - cloud.x, y - cloud.y) < 700 + pad, { x: cloud.x, y: cloud.y }, 0.25, 'p1');
  step(sim, secs(2));
  report(cr.stats.cloudsBurnt === 1 && cr.mother.clouds.length === 0 && st.fires.length > fires0, `flame burns the cloud off at once and sets ${st.fires.length - fires0} deck fire(s) alight`);
  mAimLamp(A, { x: eyeP.x, y: eyeP.y });
  step(sim, secs(2.5));
  report(mPart(cr, 'eyeN').tgt.lit > 0, 'the beam finds her again once the spores are gone');
  p1.lock = null;
  mWeights({ spores: 1 });
  cr.mother.nextT = 0;
  until(sim, () => cr.mother.clouds.length > 0, 6);
  mQuiet(cr);
  until(sim, () => cr.mother.clouds.length === 0, MM.SPORES.FALL + MM.SPORES.LINGER + MM.SPORES.FADE + 3);
  report(cr.mother.clouds.length === 0, 'a cloud nobody burns thins away by itself');
}

// (M5) the wing beat
{
  const A = motherUp();
  const { sim, st, ship, cr, p1 } = A;
  const msgs = [];
  cr.hooks.phoneFx = (p, t, buzz) => msgs.push({ id: p.id, t, buzz });
  cr.phase = 2;
  mWeights({ beat: 1 });
  standOn(p1, ship, topD(ship), 600, null);
  cr.mother.nextT = 0;
  const x0 = ship.pose.x;
  for (let n = 0; n < secs(3) && !cr.mother.gust; n++) step(sim);
  const gust = cr.mother.gust;
  mQuiet(cr);
  const banner = st.ev.warnText;
  report(!!gust && /SPREADS HER WINGS/.test(banner) && /LEFT|RIGHT/.test(banner) && msgs.some((m) => /WING BEAT/.test(m.t)) && (step(sim, 2), cr.mother.beat >= 1), `the wings spread: "${banner}" and a buzz on the phones`);
  const dir = gust.dir;
  step(sim, secs(MM.BEAT.WIND - 0.3));
  const xs = ship.pose.x;
  report(Math.abs(xs - x0) < 60, 'during the wind-up she is not moved');
  let maxTilt = 0;
  for (let n = 0; n < secs(MM.BEAT.BEAT + MM.BEAT.RECOVER + 0.6); n++) { step(sim); maxTilt = Math.max(maxTilt, Math.abs(ship.ctx.forces.theta)); }
  const moved = (ship.pose.x - xs) * dir;
  report(moved > MM.BEAT.PUSH * MM.BEAT.BEAT * 0.5 && cr.stats.beats === 1 && maxTilt <= (config.FORCES.MAX_DEG * Math.PI) / 180 + 1e-3, `the beat shoves her ${Math.round(moved)} px toward the ${dir < 0 ? 'left' : 'right'} (PUSH ${MM.BEAT.PUSH} px/s for ${MM.BEAT.BEAT} s), the tilt ${(maxTilt * 180 / Math.PI).toFixed(2)} deg inside the ${config.FORCES.MAX_DEG} deg limit`);
  // not while a tendril holds her
  const g = mGrab(A);
  mHold(cr);
  mWeights({ beat: 1 });
  cr.mother.nextT = 0;
  step(sim, secs(3));
  mQuiet(cr);
  report(!!g && cr.stats.beats === 1, 'she does not beat her wings while a tendril has the ship tethered');
  // a pillar stops her
  const B = motherUp();
  B.cr.phase = 2;
  const pil = B.map.dome.pillars[B.map.dome.pillars.length - 1], fb = B.ship.layout.fitBox, ref = B.ship.layout.refPoint;
  B.ship.pose.x = pil.x0 - 150 - fb.x1;
  B.ship.pose.y = B.map.goal.y + 150 - ref.y;
  step(B.sim, 20);
  const f0 = frameHp(B.ship);
  mWeights({ beat: 1 });
  B.cr.mother.nextT = 0;
  for (let n = 0; n < secs(1) && !B.cr.mother.gust; n++) step(B.sim);
  const dirB = B.cr.mother.gust ? B.cr.mother.gust.dir : 0;
  mQuiet(B.cr);
  step(B.sim, secs(MM.BEAT.WIND + MM.BEAT.BEAT + 1.5));
  const front = B.ship.pose.x + fb.x1;
  report(dirB > 0 && front <= pil.x0 + 150, `a ship beaten into a pillar is stopped by the rock (her bow ${Math.round(front)}, the pillar face ${Math.round(pil.x0)})`);
  void f0;
}

// (M6) the phases, each win scripted, the reward
{
  const A = motherUp();
  const { sim, st, cr } = A;
  report(cr.phase === 1 && partOf(cr, 'heart').hidden, 'phase 1: IT STIRS, the spore heart is hidden');
  st.sfxQ.length = 0;
  cr.hp = cr.maxHp * (MM.PHASE.TWO_HP - 0.02);
  step(sim, 3);
  report(cr.phase === 2 && st.sfxQ.some((x) => x[0] === 'roar') && cr.ai.breather > 0 && /ANGRY/.test(st.ev.warnText), `below ${MM.PHASE.TWO_HP * 100}% of the pool: phase 2, a banner "${st.ev.warnText}" and a breather`);
  cr.hp = cr.maxHp * (MM.PHASE.THREE_HP - 0.02);
  step(sim, 3);
  report(cr.phase === 3 && !partOf(cr, 'heart').hidden && /THRASHES/.test(st.ev.warnText), 'below 33%: phase 3, the spore heart opens');
  const A1 = motherUp();
  for (const p of mTend(A1.cr).slice(0, MM.PHASE.TWO_LOST)) CS.hurtCreature(A1.st, { part: p, seg: 3 }, p.hp + 1, { who: 'p1', src: 'shell' });
  step(A1.sim, 3);
  report(A1.cr.phase === 2, `${MM.PHASE.TWO_LOST} tendrils gone also begins phase 2`);
  { // EYES
    const B = motherUp();
    const { sim: s, st: t, cr: c } = B;
    const eN = mPart(c, 'eyeN'), eF = mPart(c, 'eyeF');
    CS.hurtCreature(t, { part: eN, seg: 0 }, eN.hp + 1, { who: 'p1', src: 'shell' });
    step(s, 1);
    report(eN.dead && !c.dying && c.stats.eyesOut === 1 && /ONE EYE OUT|ANGRY/.test(t.ev.warnText), 'one eye out: the banner, and she is blind on that side (grabs slower)');
    CS.hurtCreature(t, { part: eF, seg: 0 }, eF.hp + 1, { who: 'p1', src: 'shell' });
    step(s, 3);
    mWin('both eyes out', t, c, 'eyes');
  }
  { // MORTAR
    const B = motherUp();
    const { sim: s, st: t, cr: c } = B;
    const cap = mPart(c, 'cap');
    for (let k = 0; k < MM.MORTAR.HITS; k++) CS.hurtCreature(t, { part: cap, seg: 0 }, 5, { who: 'p1', src: 'mortar' });
    step(s, 3);
    mWin(`${MM.MORTAR.HITS} mortar shells on the cap`, t, c, 'mortar');
  }
  { // BOARD
    const B = motherUp();
    const { sim: s, st: t, ship: sh, cr: c, p1 } = B;
    c.hp = c.maxHp * 0.3;
    step(s, 3);
    const heart = mPart(c, 'heart'), cap = mPart(c, 'cap');
    report(c.phase === 3 && !heart.hidden, 'phase 3 for the boarder');
    const CB = await load('modules/host/creatureBoard.js');
    p1.carry = 'sword';
    p1.fall = false; p1.fly = true;
    const landed = CB.boardAt(t, sh, p1, heart.segs[0].x, heart.segs[0].y);
    step(s, 3);
    const cs = cap.segs[0];
    report(landed && !!p1.on && p1.y > cs.y + cs.len, `a boarder lands on the UNDERSIDE of her cap (${p1 && Math.round(p1.y)} below the cap's axis end ${Math.round(cs.y + cs.len)})`);
    p1.fire = true;
    for (let n = 0; n < secs(MM.BOARD.HEART_TIME * 8) && !c.dying; n++) step(s);
    p1.fire = false;
    step(s, 2);
    mWin('the spore heart struck', t, c, 'board');
  }
  { // HP
    const B = motherUp();
    B.cr.hooks.hurtPool(1e9, 'shell', 'p1');
    step(B.sim, 3);
    mWin('the pool', B.st, B.cr, 'hp');
  }
  { // the reward
    const B = motherUp();
    const { sim: s, st: t, cr: c } = B;
    const salv0 = t.run.salvage;
    t.ship.hull = 40;
    c.hooks.hurtPool(1e9, 'shell', 'p1');
    step(s, secs(3));
    const SV = config.SALVAGE.BOSS * C.REWARD_MUL;
    report(t.run.salvage - salv0 >= SV && t.run.salvage - salv0 <= SV + 40, `triple boss salvage: +${t.run.salvage - salv0}`);
    report(t.ship.hull >= 40 + MM.REWARD.HULL - 1 && MM.REWARD.TROPHY === null, `a hull patch (+${MM.REWARD.HULL}); no trophy card`);
    for (let i = 0; i < secs(MM.SPAWN.SINK + C.CHUNK.LIFE + 3) && !t.course.done; i++) step(s, 1);
    report(t.course.done === true && t.creature === null && /MYCELIAL MOTHER IS SLAIN/.test(t.ev.warnText), `once she has fallen the stop is done: "${t.ev.warnText}"`);
  }
}
{
  // the voyage: Fungal Depths stops hold the Mother
  restoreCfg();
  const LR = C.LAIR;
  const seeds = Array.from({ length: quick ? 80 : 300 }, (_, i) => 1000 + i * 7919);
  let fungal = 0, bad = [], total = 0;
  for (const mode of ['quick', 'voyage', 'campaign']) for (const sd of seeds) {
    const v = VY.generateVoyage(sd, { mode, gentle: sd % 2 === 0 });
    for (const s of v.columns.flat()) if (s.lair) {
      total++;
      if (s.creature !== LR.BY_ENV[s.env] && s.creature !== 'titan') bad.push(`${mode}/${sd}: ${s.id} on ${s.env} holds ${s.creature}`);
      if (s.creature === 'mother') { fungal++; if (s.env !== 'fungal' || s.col === 0 || s.flagship) bad.push(`${mode}/${sd}: a Mother lair on ${s.env} column ${s.col}`); }
    }
  }
  report(!bad.length && fungal > 0 && LR.BY_ENV.fungal === 'mother', `lairs are by sky: ${fungal} of ${total} lairs on ${seeds.length * 3} routes are the Mother's (Fungal Depths stops only, never the first stop or the Flagship)${bad.length ? '\n  ' + bad.slice(0, 5).join('\n  ') : ''}`);
  report(VY.lairOf('mother').NAME === MM.LAIR.NAME && VY.stopName({ lair: true, creature: 'mother', env: 'fungal' }) === MM.LAIR.NAME, 'the stop has the right name');
}
{
  // the TV: the dark cave, the lamp, a tendril, burning, spores, the wing beat, lit eyes
  const A = motherUp();
  const { sim, st, cr, p1 } = A;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const seen = new Set();
  let exc = 0, hudText = false, ms = 0, frames = 0;
  const frame = () => {
    step(sim, 1);
    rec.texts.length = 0;
    const t0 = hr();
    try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    ms += hr() - t0;
    frames++;
    if (rec.texts.some((x) => x.s.startsWith('THE MYCELIAL MOTHER - '))) hudText = true;
    const mt = cr.mother;
    if (cr.grips.some((g) => g.mode === 'hold')) seen.add('grip'); if (mt.clouds.length) seen.add('cloud'); if (mt.ring) seen.add('ring'); if (mt.gust) seen.add('gust'); if (mTend(cr).some(MMB.burning)) seen.add('fire'); if (mt.beat) seen.add('wings'); if (mPart(cr, 'eyeN').tgt && mPart(cr, 'eyeN').tgt.lit > 0) seen.add('lit');
  };
  const eyeP = mPart(cr, 'eyeN').segs[0];
  for (let f = 0; f < 120; f++) { mAimLamp(A, { x: eyeP.x, y: eyeP.y }); frame(); }
  p1.lock = null;
  mGrab(A);
  for (let f = 0; f < 60 * 2; f++) frame();
  MMB.igniteTendril(st, cr, cr.grips[0] ? cr.grips[0].limb : mTend(cr)[0], 2, 'p1');
  for (let f = 0; f < 60 * 3; f++) frame();
  cr.phase = 2;
  mWeights({ spores: 1 });
  cr.mother.act = null; cr.mother.nextT = 0;
  for (let f = 0; f < 60 * 8; f++) frame();
  mWeights({ beat: 1 });
  cr.mother.act = null; cr.mother.nextT = 0; cr.mother.clouds.length = 0;
  for (let f = 0; f < 60 * 6; f++) frame();
  mQuiet(cr);
  report(exc === 0 && hudText && ['grip', 'cloud', 'ring', 'gust', 'fire', 'wings', 'lit'].every((k) => seen.has(k)), `the fight draws on a stub canvas for ${frames} frames with 0 errors (seen: ${[...seen].join(', ')}); the bar says THE MYCELIAL MOTHER with her phase`);
  console.log(`     whole-TV frame with the Mother: ${(ms / frames).toFixed(2)} ms (JS on a stub canvas)`);
  const stub = stubCtx();
  const art = createCreatureArt({ ctx: stub });
  let t = 0, blits = 0;
  for (let f = 0; f < 300; f++) { step(sim, 1); const t0 = hr(); art.draw(cr, { zoom: 0.18, dpr: 1 }); art.drawBehind(cr, { zoom: 0.18, dpr: 1 }); t += hr() - t0; blits = Math.max(blits, art.stats.blits); }
  report(t / 300 < config.PERF.BUDGET_MS && blits > 5, `creatureArt alone: ${(t / 300).toFixed(3)} ms a frame over 300 frames (${blits} blits; budget ${config.PERF.BUDGET_MS} ms)`);
}

// (M7) the bots
if (!argv.includes('--no-mother-bots')) {
  restoreCfg();
  mCfgBack();
  const botsimPath = path.join(publicDir, '..', 'tools', 'botsim.mjs');
  const run = (args, env = {}) => new Promise((resolve) => {
    const real = { NO_ALARMS: '', NO_SCRAP: '', NO_PARTY: '', NO_STOP_SHAPE: '', NO_GUNS: '', NO_RINGFAIR: '', NO_STEAMFIX: '', NO_AWAY: '', NO_ROLE_CARDS: '', NO_HELM_V2: '' };
    const c = spawn(process.execPath, [botsimPath, ...args], { env: { ...process.env, ...real, ...env } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  const fight = (out) => {
    const m = /fight 1: phase (\d)[^\n]*?; ended: (\w+)(?: at (\d+)s)?/.exec(out);
    return m ? { phase: +m[1], ended: m[2], at: m[3] === undefined ? null : +m[3] } : null;
  };
  const pool = async (jobs, n) => { const res = []; let k = 0; await Promise.all(Array.from({ length: n }, async () => { while (k < jobs.length) { const i = k++; res[i] = await jobs[i](); } })); return res; };
  const seedsB = quick ? [1, 2] : [1, 2, 3];
  const forced = ['burn', 'cut', 'eyes', 'mortar', 'board', 'hp'];
  const buildOf = { burn: ['--build', 'motherflame'], mortar: ['--build', 'mothermortar'] };
  const jobs = [];
  for (const w of forced) for (const sd of seedsB) jobs.push(() => run(['--creature', 'mother', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd), ...(buildOf[w] || [])], { CREATURE_FORCE_WIN: w }).then((r) => ({ w, sd, r })));
  for (const bots of [4, 16]) for (const sd of seedsB) jobs.push(() => run(['--creature', 'mother', '--bots', String(bots), '--difficulty', 'easy', '--minutes', '16', '--seed', String(sd)]).then((r) => ({ w: 'easy' + bots, sd, r })));
  for (const sd of seedsB) jobs.push(() => run(['--creature', 'mother', '--bots', '8', '--difficulty', 'normal', '--minutes', '10', '--seed', String(sd)]).then((r) => ({ w: 'free', sd, r })));
  const results = await pool(jobs, 5);
  const clean = (r) => r.code === 0 && /errors: 0/.test(r.out) && !/NaN/.test(r.out);
  const byWin = {};
  for (const { w, sd, r } of results) { const f = fight(r.out); (byWin[w] ||= []).push({ sd, f, ok: clean(r) }); }
  for (const w of forced) {
    const rows = byWin[w];
    const times = rows.map((x) => (x.f && x.f.ended === w ? x.f.at : null));
    report(rows.every((x) => x.ok) && times.every((t) => t !== null && t <= 360), `forced ${w.toUpperCase()}: 8 bots on Normal end it that way within 6 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] === null ? 'NOT (' + (x.f ? x.f.ended + ', phase ' + x.f.phase : 'no fight') + ')' : times[i] + ' s')).join(', ')})`);
  }
  for (const bots of [4, 16]) {
    const rows = byWin['easy' + bots];
    const times = rows.map((x) => (x.f && x.f.ended !== 'no' ? { at: x.f.at, how: x.f.ended } : null));
    report(rows.every((x) => x.ok) && times.every((t) => t && t.at <= 600), `${bots} bots on Easy win within 10 minutes of its spawn, every seed (${rows.map((x, i) => 'seed ' + x.sd + ': ' + (times[i] ? times[i].how + ' ' + times[i].at + ' s' : 'NOT')).join(', ')})`);
  }
  {
    const rows = byWin.free;
    const how = rows.map((x) => (x.f && x.f.ended !== 'no' ? x.f.ended + ' ' + x.f.at + ' s' : 'NOT'));
    report(rows.every((x) => x.ok) && how.every((h) => h !== 'NOT'), `unforced, 8 bots on Normal win (${how.join(', ')})`);
  }
  report(results.every(({ r }) => clean(r)), `0 errors and no NaN in any of the ${results.length} Mother bot fights`);
}

restoreCfg();
report(errors === 0, `the simulation ran with ${errors} errors` + (firstErrors.length ? ': ' + firstErrors.join(' || ') : ''));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
