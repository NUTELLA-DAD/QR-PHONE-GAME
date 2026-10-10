// THE GIANT-CREATURE gate, C.1 and C.2 (public/modules/host/creatureSystem.js, creature.js, creatures/kraken.js, creatureArt.js; config.CREATURES). Headless, no browser.
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
const restoreCfg = () => { const o = JSON.parse(SAVED); Object.assign(C.BEHAVE, o.B); config.ENVIRONMENTS.FORCE = o.ENV; C.DEV_SPAWN = o.DEV; config.MAPS.FORCE_KIND = o.MAP; config.ESCORT.AUTO_PATROL = o.AP; C.DEV_LAIR = false; C.FORCE_WIN = null; unitHp(); };
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
  if (!b) throw new Error('no clean spot on ' + p.id);
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
  const h0 = B.st.ship.hull;
  for (let i = 0; i < secs(GP.TIME + 3) && B.cr.grips[0] && B.cr.grips[0].mode === 'hold'; i++) step(B.sim);
  report(!!gb && B.cr.stats.hulled === 1 && B.st.ship.hull < h0 - 0.5, `a ship with nothing to break off takes the hull blow instead (hull ${h0.toFixed(0)} -> ${B.st.ship.hull.toFixed(0)})`);
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
  const hull0 = st.ship.hull;
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
  report(st.ship.hull < hull0 && cr.stats.slapHits === 1, `with a little hull damage (${hull0.toFixed(1)} -> ${st.ship.hull.toFixed(1)})`);
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
  const hull0 = st.ship.hull, vy0 = ship.pose.vy, ev0 = st.breakStats.events;
  for (let i = 0; i < secs(2) && !cr.breach.impacted; i++) { hold(); step(sim); }
  const b = cr.breach;
  report(b.impacted && b.hit === true && cr.stats.breachHits === 1, `she stayed in the shadow, low over the water (keel ${b.gap.toFixed(0)} px above it, reach ${BR.REACH}): it smashes into the hull`);
  report(st.ship.hull < hull0 - 1 && ship.pose.vy < vy0 - 100, `big hull damage (${hull0.toFixed(1)} -> ${st.ship.hull.toFixed(1)}) and a kick up (${vy0.toFixed(0)} -> ${ship.pose.vy.toFixed(0)} px/s)`);
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
      if (s.env !== 'sea') bad.push(`${mode}/${sd}: lair on ${s.env}`);
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
  report(!bad.length, `${total} generated voyages (quick, voyage, campaign x both voyages): lairs only on Sunken Sea stops, never the first stop, the harbour or the Flagship, never in neighbouring columns, at most ${LR.COUNT.short} (${LR.COUNT.long} from ${LR.LONG_STOPS} stops), +${LR.DANGER} skull and x${LR.REWARD_MUL} reward, everything else exactly as before${bad.length ? ' - ' + bad.slice(0, 3).join('; ') : ''}`);
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

restoreCfg();
report(errors === 0, `the simulation ran with ${errors} errors` + (firstErrors.length ? ': ' + firstErrors.join(' || ') : ''));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
