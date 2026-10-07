// Scratch test for "GOING DOWN!" (last stand) and LIMP HOME (spare gasbags), headless (same recipe as dare.mjs).
//   node tools/goingdown.mjs [seed]
// (a) the first time the hull hits 0 in a mission she goes DOWN (a fall, not a wreck) - and only once per mission;
//     the next mission gets its own last stand.
// (b) the bots can save her (several seeds, 8 bots, and 3 bots): lift full, leaks patched, heat never maxed.
// (c) if nobody does anything she falls out of the sky: a real wreck (limp or run end).
// (d) a voyage wreck uses up a spare gasbag, loses 30% of the salvage and resumes at the last stop on the route.
// (e) no spares left: the wreck ends the voyage (summary, then back to the mast).
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const seed = Number(process.argv[2] || 3);
globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
let s0 = seed >>> 0;
const reseed = (n) => { s0 = n >>> 0; };
Math.random = () => {
  s0 = (s0 + 0x6d2b79f5) | 0;
  let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Date.now = () => 1700000000000 + seed;
let simClock = 0;
performance.now = () => simClock;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
const { SHIP_LAYOUT } = await load('shipLayout.js');
config.MAPS.FORCE_KIND = 'open';
const { createSimulation } = await load('modules/host/simulation.js');

const dt = 1 / 60;
let fails = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) fails++;
};
const errs = [];
function mk(nBots, nHumans = 0) {
  const sim = createSimulation();
  const e = SHIP_LAYOUT.boarderEntryPoints;
  for (let i = 0; i < nBots; i++) {
    const id = 'bot' + i;
    sim.state.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[0], color: '#3a86ff', x: e[0].x + i * 40, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  for (let i = 0; i < nHumans; i++) {
    const id = 'human' + i;
    sim.state.players[id] = { id, name: 'Human' + (i + 1), species: config.CREW_SPECIES[0], color: '#e63946', x: e[0].x + 300 + i * 40, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  return sim;
}
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) {
    simClock += dt * 1000;
    try { sim.update(dt); } catch (err) { errs.push(String(err.stack).split('\n').slice(0, 3).join(' | ')); }
  }
};
const until = (sim, cond, maxSec) => {
  for (let i = 0; i < maxSec * 60; i++) {
    if (cond()) return true;
    step(sim);
  }
  return cond();
};
// Make the ship's hull give out right now (the same path an enemy hit takes).
const killHull = (sim) => { sim.state.ship.hull = 0; step(sim); };

// ---------------- (a) once per mission ----------------
{
  console.log('--- (a) GOING DOWN triggers once per mission ---');
  const sim = mk(8);
  const st = sim.state;
  step(sim, 60 * 20);
  check(!st.goingDown && !st.wreck, 'flying normally before the test');
  killHull(sim);
  check(!!st.goingDown && !st.wreck && st.ship.down === 0, 'hull 0 the first time: GOING DOWN (a fall, no wreck)');
  const g = st.goingDown;
  check(g && g.holes.length === g.required && g.holes.every((h) => st.gasHoles.includes(h) && h.gd), `${g && g.required} leaks are marked to patch`);
  const alt0 = st.ship.alt;
  step(sim, 60 * 3);
  check(st.ship.alt < alt0 - 20 && st.ship.hull > 0 && st.ship.hull <= config.GOING_DOWN.HOLD_HULL + 0.5, `she sinks (${Math.round(alt0 - st.ship.alt)}px in 3s) and the hull is held at ${st.ship.hull.toFixed(1)}`);
  // a "hit" while falling must not wreck her
  st.ship.hull = -5;
  step(sim);
  check(!st.wreck && st.goingDown, 'nothing wrecks her while she falls');
  const saved = until(sim, () => !st.goingDown, 45);
  check(saved && !st.wreck && Math.abs(st.ship.hull - config.GOING_DOWN.SURVIVE_HULL) < 5, `the bots saved her: hull ${st.ship.hull.toFixed(0)}`);
  check(st.gdBanner && st.gdBanner.text === 'SHE HOLDS!', 'the TV says SHE HOLDS!');
  step(sim, 60 * 8); // grace runs out
  killHull(sim);
  check(!st.goingDown && !!st.wreck, 'second time in the SAME mission: a real wreck (once per mission)');
  // The next mission has its own last stand: run on to the next stop (limp restarts the first stop).
  until(sim, () => !st.wreck && !st.limp && st.ship.down === 0, 20);
  step(sim, 60 * 3);
  const spares = st.run.spares;
  check(spares === st.run.sparesMax - 1, `the wreck used a spare (${spares} left)`);
  until(sim, () => !st.vote && st.phase === 'flying' && st.course.stop, 60);
  step(sim, 60 * 10);
  killHull(sim);
  check(!!st.goingDown && !st.wreck, 'a new mission: GOING DOWN is available again');
}

// ---------------- (b) bots save her ----------------
{
  console.log('--- (b) bots can save her ---');
  for (const crew of [8, 3, 2, 16]) {
    let ok = 0;
    const tries = crew === 8 ? 6 : 4;
    const times = [];
    for (let k = 0; k < tries; k++) {
      reseed(100 + k * 7 + crew);
      const sim = mk(crew);
      const st = sim.state;
      step(sim, 60 * 15 + k * 90);
      killHull(sim);
      if (!st.goingDown) continue;
      const t0 = st.goingDown.t;
      const g = st.goingDown;
      const got = until(sim, () => !st.goingDown, 60);
      if (got && !st.wreck && st.ship.hull > 10) { ok++; times.push(+(g.t - t0).toFixed(0)); }
      else console.log(`   (fail: ${crew} bots try ${k}: lift ${g.loadsDone}/${g.loads} heat ${g.heat.toFixed(2)} leaks left ${g.holes.filter((h) => st.gasHoles.includes(h)).length} of ${g.required}, t ${g.t.toFixed(1)}/${g.time.toFixed(1)})`);
    }
    console.log(`   ${crew} bots: saved ${ok}/${tries}  (seconds used ${times.join(',')})`);
    check(ok >= Math.ceil(tries * 0.66), `${crew} bots save her in most tries (${ok}/${tries})`);
  }
}

// ---------------- (c) failure leads to a wreck ----------------
{
  console.log('--- (c) nobody helps: she is wrecked ---');
  const matesWas = config.MATES.ENABLED;
  config.MATES.ENABLED = false; // (ship's mates would help: this test wants nobody helping)
  const sim = mk(0, 2); // two humans who do nothing
  const st = sim.state;
  st.run.spares = 0; // (so the wreck is final and easy to see)
  step(sim, 60 * 10);
  killHull(sim);
  check(!!st.goingDown && !st.wreck, '2 players: GOING DOWN starts');
  const need = st.goingDown.loads;
  check(need <= 3 && st.goingDown.required === 1, `scaled for 2 players: ${need} coal loads, ${st.goingDown.required} leak, ${st.goingDown.time.toFixed(0)}s`);
  const gone = until(sim, () => !st.goingDown, 60);
  check(gone && !!st.wreck && !!st.runEnd, 'timeout with nothing done: wrecked and the voyage ends (no spares)');
  check(st.ship.hull === 0, 'hull is 0 after the wreck');
  config.MATES.ENABLED = matesWas;
}

// ---------------- (d) voyage wreck = a spare gasbag ----------------
{
  console.log('--- (d) limp home ---');
  reseed(seed);
  const sim = mk(8);
  const st = sim.state;
  step(sim, 60 * 10);
  const first = st.run.stopId;
  // Finish stop 1 the normal way: reach "home" -> scorecard -> dock -> route vote -> stop 2.
  sim.onMarker({ kind: 'home', lap: 2 });
  const there = until(sim, () => st.run.stopId !== first && !st.vote && !st.scorecard, 240);
  check(there, `bots voted on to the next stop (${first} -> ${st.run.stopId})`);
  step(sim, 60 * 8);
  st.run.salvage = 100;
  const spares0 = st.run.spares;
  const stop2 = st.run.stopId;
  killHull(sim);
  check(!!st.goingDown, 'GOING DOWN first');
  st.goingDown.t = st.goingDown.time; // (nobody manages: time runs out)
  st.goingDown.lift = 0;
  step(sim);
  check(!!st.wreck && !!st.limp && !st.runEnd, 'then the wreck: limping home, voyage not over');
  check(st.run.spares === spares0 - 1 && st.limp.spares === spares0 - 1, `a spare gasbag is used (${spares0} -> ${st.run.spares})`);
  check(st.run.salvage === 70, `30% of the salvage is lost (100 -> ${st.run.salvage})`);
  check(st.limp.back != null, `the card says where she limps to: ${st.limp.back}`);
  const back = until(sim, () => !st.limp && !st.wreck, 30);
  check(back && st.ship.down === 0 && st.ship.hull >= config.LIMP.HULL - 1, `repaired to ${st.ship.hull.toFixed(0)} hull`);
  check(st.run.stopId === first && !st.run.visited.includes(stop2), `back at the last stop (${st.run.stopId}), the wrecked stop is not counted`);
  check(!!st.vote, `the sky-dock / route vote is open (${st.vote && st.vote.kind})`);
  // and the voyage carries on
  const again = until(sim, () => !st.vote && st.phase === 'flying' && !st.scorecard, 200);
  step(sim, 60 * 20);
  check(again && st.phase === 'flying' && !st.runEnd && !st.ship.down, `the voyage resumes (stop ${st.run.stopId})`);
  // First stop: a wreck restarts the same stop.
  const sim2 = mk(8);
  const s2 = sim2.state;
  step(sim2, 60 * 10);
  const id0 = s2.run.stopId;
  killHull(sim2);
  s2.goingDown.t = s2.goingDown.time;
  step(sim2);
  until(sim2, () => !s2.limp && !s2.wreck, 30);
  check(s2.run.stopId === id0 && s2.run.visited.length === 1 && s2.run.spares === s2.run.sparesMax - 1 && !s2.vote, 'wreck on the very first stop: the same stop starts again');
}

// ---------------- (e) no spares: the voyage ends ----------------
{
  console.log('--- (e) no spares ---');
  const sim = mk(8);
  const st = sim.state;
  step(sim, 60 * 10);
  st.run.spares = 1;
  killHull(sim);
  st.goingDown.t = st.goingDown.time;
  step(sim);
  check(!!st.limp && st.run.spares === 0, 'the last spare is used up');
  until(sim, () => !st.limp && !st.wreck, 30);
  step(sim, 60 * 8);
  // second mission, no spares left
  killHull(sim); // (still the same mission? the first stop restarted: a fresh mission)
  if (st.goingDown) { st.goingDown.t = st.goingDown.time; step(sim); }
  check(!!st.wreck && !st.limp && !!st.runEnd && !st.runEnd.victory, 'no spares: the wreck ends the voyage (summary shown)');
  const lobby = until(sim, () => st.phase === 'lobby', 40);
  check(lobby && !st.runEnd && st.run.spares === st.run.sparesMax, 'back at the mast with a fresh voyage and fresh spares');
}

console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 5).join('\n') : 'no errors');
check(errs.length === 0, 'no exceptions in the sim');
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
