// V.0 spike (PVP.md section 2): two independent copies of the host simulation in one Node process.
// ES modules are one instance per URL, so the loader hook (tools/instances-hook.mjs) loads the public/ module graph twice:
// instance "A" plain, instance "B" with ?inst=B on every module URL. Each has its own SHIP_LAYOUT, config, state and bakes.
//
// As a library:   import { loadInstance, installShims, seedRandom, addBots } from './instances.mjs'
// As a spike:     node tools/instances.mjs [--minutes 2] [--seed 1] [--bots 6]
//                 proves the copies are independent, steps both in lockstep with ONE seeded RNG (A then B) and measures memory and time.
import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(path.join(here, 'instances-hook.mjs')));
export const publicDir = path.resolve(here, '..', 'public');

// Browser stand-ins (the sim barely touches any).
export function installShims() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
}

// One seeded random source for every instance (and the clocks the game reads), as tools/botsim.mjs does for one.
export function seedRandom(seed) {
  let s = seed >>> 0; // mulberry32
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Date.now = () => 1700000000000 + seed;
  const clock = { ms: 0 };
  performance.now = () => clock.ms; // (bot timing and swing animations follow the simulated clock)
  return clock;
}

// Load one copy of the game. tag '' = the normal instance; 'B' = ?inst=B on every module URL.
export async function loadInstance(tag = '') {
  const q = tag ? '?inst=' + tag : '';
  const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href + q);
  const { config } = await load('config.js');
  const layoutMod = await load('shipLayout.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  return { tag: tag || 'A', config, SHIP_LAYOUT: layoutMod.SHIP_LAYOUT, applyBuild: layoutMod.applyBuild, BUILDS, createSimulation, load };
}

// Recipe of the "Add 4 bot crew" button (see tools/botsim.mjs): n bots dropped onto the ship's boarding points.
export function addBots(inst, sim, n, prefix = 'bot') {
  const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
  const e = inst.SHIP_LAYOUT.boarderEntryPoints;
  for (let i = 0; i < n; i++) {
    const id = prefix + Math.random();
    sim.state.players[id] = {
      id, bot: true, name: 'Bot' + (i + 1), species: inst.config.CREW_SPECIES[(Math.random() * inst.config.CREW_SPECIES.length) | 0],
      color: colors[(Math.random() * colors.length) | 0], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true,
    };
  }
}

// Heap in MB after a forced collection (gc is switched on at run time, so no special node flag is needed).
let gcFn = null;
export function heapMB() {
  if (!gcFn) {
    v8.setFlagsFromString('--expose-gc');
    gcFn = vm.runInNewContext('gc');
  }
  gcFn();
  return process.memoryUsage().heapUsed / 1048576;
}

// ---- the spike ----
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (n, d) => {
    const i = argv.indexOf('--' + n);
    return i < 0 ? d : Number(argv[i + 1]);
  };
  const minutes = flag('minutes', 2), seed = flag('seed', 1), bots = flag('bots', 6);
  let ok = true;
  const report = (good, what) => {
    console.log((good ? 'PASS ' : 'FAIL ') + what);
    if (!good) ok = false;
  };
  installShims();
  const clock = seedRandom(seed);
  const h0 = heapMB();
  const A = await loadInstance('');
  const h1 = heapMB();
  const B = await loadInstance('B');
  const h2 = heapMB();
  console.log(`memory: base ${h0.toFixed(0)} MB, +instance A ${(h1 - h0).toFixed(1)} MB, +instance B ${(h2 - h1).toFixed(1)} MB`);

  report(A.SHIP_LAYOUT !== B.SHIP_LAYOUT, 'SHIP_LAYOUT of A and B are different objects');
  report(A.config !== B.config && A.config.GUNS !== B.config.GUNS, 'config of A and B are different objects');
  const dmgA = A.config.GUNS.DAMAGE;
  B.config.GUNS.DAMAGE = 99;
  report(A.config.GUNS.DAMAGE === dmgA, 'changing a number in the B config leaves the A config alone');
  B.config.GUNS.DAMAGE = dmgA;
  // Different ships in the two copies: B flies the four-bag build, A stays classic.
  const bagsMod = (await import(pathToFileURL(path.join(here, 'fixtures', 'bags-build.mjs')).href)).default;
  B.applyBuild(bagsMod(B.BUILDS));
  report(A.SHIP_LAYOUT.gasbags.length === 1 && B.SHIP_LAYOUT.gasbags.length > 1, `A keeps ${A.SHIP_LAYOUT.gasbags.length} gasbag, B has ${B.SHIP_LAYOUT.gasbags.length} after its own applyBuild`);

  A.config.MAPS.FORCE_KIND = B.config.MAPS.FORCE_KIND = 'open';
  const h2a = heapMB();
  const simA = A.createSimulation();
  const h2b = heapMB();
  const simB = B.createSimulation();
  const h2c = heapMB();
  console.log(`memory: simulation A +${(h2b - h2a).toFixed(1)} MB, simulation B +${(h2c - h2b).toFixed(1)} MB`);
  report(simA.state !== simB.state && simA.state.GUNS !== simB.state.GUNS, 'two simulations with separate state');
  addBots(A, simA, bots, 'a');
  addBots(B, simB, bots, 'b');
  simA.castOff();
  simB.castOff();
  const dt = 1 / 60, steps = Math.round(minutes * 3600);
  let errors = 0, tA = 0, tB = 0;
  const firstErr = [];
  const step = (sim, which) => {
    const t = process.hrtime.bigint();
    try {
      sim.update(dt);
    } catch (e) {
      errors++;
      if (firstErr.length < 3) firstErr.push(which + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
    return Number(process.hrtime.bigint() - t) / 1e6;
  };
  const wall0 = process.hrtime.bigint();
  for (let i = 0; i < steps; i++) {
    clock.ms += dt * 1000;
    tA += step(simA, 'A'); // lockstep: A then B, one RNG
    tB += step(simB, 'B');
  }
  const wall = Number(process.hrtime.bigint() - wall0) / 1e9;
  const h3 = heapMB();
  for (const e of firstErr) console.log('  ' + e);
  report(errors === 0, `${minutes} min lockstep (${steps} steps each), ${errors} errors`);
  report(simA.state.course.dist !== simB.state.course.dist || simA.state.ship.alt !== simB.state.ship.alt, `the two ships flew on their own (A dist ${simA.state.course.dist.toFixed(0)} alt ${simA.state.ship.alt.toFixed(0)}, B dist ${simB.state.course.dist.toFixed(0)} alt ${simB.state.ship.alt.toFixed(0)})`);
  console.log(`time per step: A ${(tA / steps).toFixed(3)} ms, B ${(tB / steps).toFixed(3)} ms, both ${((tA + tB) / steps).toFixed(3)} ms (frame budget 16.7 ms, 1 step = 1/60 s); ${minutes} min of game in ${wall.toFixed(1)} s`);
  console.log(`memory after the run: ${h3.toFixed(0)} MB`);
  process.exit(ok ? 0 : 1);
}
