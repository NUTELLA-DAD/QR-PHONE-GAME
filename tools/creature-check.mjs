// THE GIANT-CREATURE gate, C.1 (public/modules/host/creatureSystem.js, creature.js, creatures/kraken.js, creatureArt.js; config.CREATURES). Headless, no browser.
//   node tools/buildsim.mjs --check-creature        or directly:   node tools/creature-check.mjs [--seed 1] [--minutes 3] [--quick]
//
//   (0) THE WORLD: it is a world thing (state.creature in WORLD_SHARED), it rises untouchable and then has targets, radar blips and a wider camera; no creature means no key but `creature: null`
//   (a) EVERY WEAPON HURTS A PART: a crew shell (credited), our bomb, the flamethrower, the Lightning Coil, a laid mine and a thrown crate each take hit points off the part they meet;
//       a searchlight beam makes a blow harder
//   (b) THE BEAK: a bomb in the OPEN beak does MOUTH_BOMB to it, a bomb in the shut beak does nothing and falls on; a crate in the open beak is half a bomb
//   (c) SEVERING: fire cuts a tentacle where it burns (the outer segments tumble away as a chunk, puffs, a sound, a kill credited), the stump stays
//   (d) THE KILL PATHS: the health pool (shells) and all six tentacles each end it: it sinks, the boss reward goes to salvage, the mission goes on (the boss director is only held while it is alive)
//   (e) THE BOTS: tools/botsim.mjs --creature kraken, 8 bots on Normal for 3 minutes in the sea, the sky isles and a storm (dark): 0 errors, no NaN, and they do hurt it
//   (f) THE TV: render.js draws the fight on a stub canvas (lit, and dark with parts dim), the bar with its tentacle pips, and the time it takes
// Exit code 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
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
function boot({ env = 'skyisles', difficulty = 'normal', dev = null } = {}) {
  clock = seedRandom(seed);
  config.ENVIRONMENTS.FORCE = env;
  config.MAPS.FORCE_KIND = 'open'; // (open sky: a creature in a cliff would eat every shell)
  config.ESCORT.AUTO_PATROL = false; // (the escort planes would launch and shoot the creature by themselves: a fine thing in the game, noise in a unit test)
  C.DEV_SPAWN = dev;
  const sim = createSimulation();
  const st = sim.state;
  curSt = st;
  st.difficulty = difficulty;
  const e = st.ships[0].layout.boarderEntryPoints;
  st.players.p1 = { id: 'p1', bot: false, name: 'P1', species: config.CREW_SPECIES[0], color: '#e63946', x: e[0].x + 100, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  sim.castOff();
  step(sim, 5); // (the first step of a mission clears the last one's enemies, a creature spawned before it would go too)
  return { sim, st, ship: st.ships[0] };
}
// Spawn the Kraken by hand and wait until it has risen; no reaches and no timed beak, so the tests choose when things happen.
function risen(ctx) {
  const { sim, st } = ctx;
  C.BEHAVE.MOUTH_AFTER = 1e9;
  const cr = sim.creatures.spawn('kraken');
  cr.ai.reachT = 1e9;
  for (let i = 0; i < secs(C.SPAWN.SURFACE_TIME + 1) && cr.mode !== 'idle'; i++) step(sim);
  step(sim, 30);
  cr.ai.reachT = 1e9;
  return cr;
}
const restoreCfg = () => { const o = JSON.parse(SAVED); Object.assign(C.BEHAVE, o.B); config.ENVIRONMENTS.FORCE = o.ENV; C.DEV_SPAWN = o.DEV; config.MAPS.FORCE_KIND = o.MAP; config.ESCORT.AUTO_PATROL = o.AP; };
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
    report(st.run.salvage - run0 >= config.SALVAGE.BOSS * C.REWARD_MUL && /SINKING/.test(warn) && cr.mode === 'dying', `it sinks and the reward lands in salvage (+${st.run.salvage - run0}, the boss reward x ${C.REWARD_MUL} is ${config.SALVAGE.BOSS * C.REWARD_MUL})`);
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

// ---- (e) the bots ----
{
  restoreCfg();
  const runs = quick ? [['sea', 1]] : [['sea', 1], ['skyisles', 2], ['storm', 3]];
  for (const [env, sd] of runs) {
    const r = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'botsim.mjs'), '--creature', 'kraken', '--bots', '8', '--difficulty', 'normal', '--minutes', String(minutes), '--env', env, '--seed', String(sd)], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const out = r.stdout || '';
    const err = /errors: (\d+)/.exec(out), tot = /creatures: met (\d+), killed (\d+)(?: \(fastest (\d+)s after rising, by ([\w/]+)\))?, total damage (\d+)/.exec(out);
    report(r.status === 0 && err && err[1] === '0' && !/NaN/.test(out) && tot && Number(tot[1]) >= 1 && Number(tot[5]) > 0, `${env}: 8 bots on Normal, ${minutes} min, seed ${sd}: 0 errors, no NaN, and they hurt it${tot ? ' - met ' + tot[1] + ' (one a mission), killed ' + tot[2] + (tot[3] ? ', fastest in ' + tot[3] + ' s by ' + tot[4] : '') + ', ' + tot[5] + ' damage in all' : ' - no creature line'}`);
    for (const l of out.split('\n').filter((x) => /^creature \d/.test(x))) console.log('     ' + l);
  }
}

// ---- (f) the TV ----
{
  restoreCfg();
  for (const [env, dark] of [['skyisles', false], ['storm', true], ['sea', false]]) {
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
    const N = 300;
    let exc = 0, hudText = false, ms = 0;
    for (let f = 0; f < N; f++) {
      step(sim, 1);
      if (dark) st.darkNow = 1;
      rec.texts.length = 0;
      rec.n = 0;
      const t0 = hr();
      try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
      ms += hr() - t0;
      if (rec.texts.some((x) => x.s === 'THE KRAKEN')) hudText = true;
    }
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

restoreCfg();
report(errors === 0, `the simulation ran with ${errors} errors` + (firstErrors.length ? ': ' + firstErrors.join(' || ') : ''));
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
