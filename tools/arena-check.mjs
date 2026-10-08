// V.2 gate: the PvP bridge (public/modules/host/pvp/bridge.js) with two classic ships and bot crews, headless.
// Run it with   node tools/buildsim.mjs --check-arena   (that also holds co-op to the frozen botsim numbers)  or directly:
//   node tools/arena-check.mjs [--rounds 2] [--bots 6] [--seed 1] [--cap 120]      (--cap = round cap in seconds for the bot rounds)
// Checks: one sky (same map and environment in both copies), 0 errors, both ships take damage, the score follows the rounds, sides swap,
// a sunk ship ends the round (forced on a crewless ship), the round cap decides by hull %, and nothing is written to the co-op saves.
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { installShims, seedRandom, loadInstance, addBots, publicDir } from './instances.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf('--' + n);
  return i < 0 ? d : Number(argv[i + 1]);
};
const rounds = flag('rounds', 2), bots = flag('bots', 6), seed = flag('seed', 1), cap = flag('cap', 120);
let ok = true;
const report = (good, what) => {
  console.log((good ? 'PASS ' : 'FAIL ') + what);
  if (!good) ok = false;
};

installShims();
const writes = []; // every localStorage write the game makes
const realSet = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = (k, v) => {
  writes.push(k);
  return realSet(k, v);
};
const clock = seedRandom(seed);
const A = await loadInstance('');
const B = await loadInstance('B');
const { createBridge } = await import(pathToFileURL(path.join(publicDir, 'modules', 'host', 'pvp', 'bridge.js')).href);

A.config.PVP.ROUND_TIME = cap;
const simA = A.createSimulation();
const simB = B.createSimulation();
const br = createBridge({ A: { sim: simA, config: A.config, layout: A.SHIP_LAYOUT }, B: { sim: simB, config: B.config, layout: B.SHIP_LAYOUT } });
report(A.SHIP_LAYOUT !== B.SHIP_LAYOUT && A.config !== B.config, 'two independent copies (own SHIP_LAYOUT and config)');
addBots(A, simA, bots, 'a');
addBots(B, simB, bots, 'b');
br.startMatch();

const dt = 1 / 60;
const tick = () => {
  clock.ms += dt * 1000;
  br.update(dt);
};
const sA = simA.state, sB = simB.state;
// one sky
{
  const mA = sA.course.map, mB = sB.course.map;
  let same = mA.W === mB.W && mA.H === mB.H && mA.solid.length === mB.solid.length;
  for (let i = 0; same && i < mA.solid.length; i++) if (mA.solid[i] !== mB.solid[i]) same = false;
  report(same && mA !== mB && sA.course.environment === sB.course.environment, `one sky: same ${mA.kind} map (${mA.W}x${mA.H} cells) and environment (${sA.course.environment}) in both copies`);
  const gap = Math.abs(sA.course.dist - sB.course.dist);
  report(Math.abs(gap - br.P.START_GAP) < 1, `the ships start ${gap.toFixed(0)} px apart (START_GAP ${br.P.START_GAP})`);
  report(sA.rival && sB.rival && Math.abs(sA.rival.dx + sB.rival.dx) < 1e-6, `rival mirror: A sees B at dx ${sA.rival.dx.toFixed(0)}, B sees A at dx ${sB.rival.dx.toFixed(0)}`);
}

// bot rounds
const lefts = [];
const minHull = { A: 100, B: 100 };
const total = { A: { shots: 0, hits: 0, dmg: 0 }, B: { shots: 0, hits: 0, dmg: 0 } };
const maxSteps = Math.round(rounds * (cap + br.P.COUNT_IN + br.P.FINALE + br.P.BETWEEN + 20) / dt);
const t0 = process.hrtime.bigint();
let steps = 0;
lefts.push(br.left);
while (br.results.length < rounds && steps < maxSteps) {
  const roundBefore = br.round;
  tick();
  steps++;
  if (br.round !== roundBefore) lefts.push(br.left);
  minHull.A = Math.min(minHull.A, sA.ship.hull);
  minHull.B = Math.min(minHull.B, sB.ship.hull);
}
const wall = Number(process.hrtime.bigint() - t0) / 1e9;
for (const r of br.results) {
  for (const x of ['A', 'B']) for (const k of ['shots', 'hits', 'dmg']) total[x][k] += r.stats[x][k];
  console.log(`  round ${r.round}: winner ${r.winner || 'none'} (${r.cause}) after ${r.time.toFixed(0)} s, hull A ${r.hull.A.toFixed(0)} B ${r.hull.B.toFixed(0)}, shots A ${r.stats.A.shots} B ${r.stats.B.shots}, hits A ${r.stats.A.hits} B ${r.stats.B.hits}, hull damage dealt A ${r.stats.A.dmg.toFixed(0)} B ${r.stats.B.dmg.toFixed(0)}`);
}
if (br.lastError) console.log('  ' + br.lastError);
report(br.errors === 0, `${br.results.length} bot rounds (${(steps * dt / 60).toFixed(1)} game minutes, ${wall.toFixed(1)} s real), ${br.errors} errors`);
report(br.results.length >= rounds, `the rounds close (${br.results.length} of ${rounds})`);
report(total.A.shots > 0 && total.B.shots > 0 && total.A.hits > 0 && total.B.hits > 0, `both crews fired and hit (A ${total.A.hits}/${total.A.shots}, B ${total.B.hits}/${total.B.shots} hits/shots)`);
report(minHull.A < 100 && minHull.B < 100, `both ships took damage (lowest hull A ${minHull.A.toFixed(0)}, B ${minHull.B.toFixed(0)})`);
report(lefts.length >= 2 ? lefts[0] !== lefts[1] : true, `sides swap each round (${lefts.join(', ')} on the left)`);
const wins = { A: br.results.filter((r) => r.winner === 'A').length, B: br.results.filter((r) => r.winner === 'B').length };
report(br.score.A === wins.A && br.score.B === wins.B, `the score follows the rounds (A ${br.score.A}, B ${br.score.B})`);
report(br.results.every((r) => r.cause === 'timeout' || r.cause === 'sunk' || r.cause === 'both wrecked'), 'every round ends by a wreck or by the cap');

// A sunk ship ends the round: a fresh round, B without a crew (nobody can hold the last stand), A shoots it to pieces from outside.
{
  br.auto = false;
  while (br.phase !== 'between' && br.phase !== 'match' && steps++ < maxSteps) tick();
  br.matchWinner = null;
  const before = { A: br.score.A, B: br.score.B };
  br.startRound();
  for (const id of Object.keys(sB.players)) delete sB.players[id];
  const n0 = br.results.length;
  let n = 0;
  while (br.phase === 'count') tick();
  while (br.phase === 'fight' && n++ < 60 * 90) {
    tick();
    if (n % 20 === 0 && !sB.ship.down) simB.external.impact(700, 500, 4); // the shots of A's guns would land like this
  }
  const r = br.results[n0];
  report(!!r && r.winner === 'A' && r.cause === 'sunk', `a sunk ship ends the round: B wrecked after ${((n * dt) | 0)} s, winner ${r ? r.winner : 'none'} (${r ? r.cause : 'no result'})`);
  report(br.score.A === before.A + 1 && br.score.B === before.B, `the score updated (A ${before.A} -> ${br.score.A})`);
  for (let i = 0; i < (br.P.FINALE + 1) * 60; i++) tick();
  report(br.phase === 'between' || br.phase === 'match', `after the finale the bridge moves on (${br.phase}); match winner: ${br.matchWinner || 'not decided'}`);
  report(sA.rival && sA.rival.down, 'A sees the wrecked B as down (rival.down)');
}

// The round cap: on a timeout the higher hull % wins.
{
  br.startRound();
  br.P.ROUND_TIME = 6;
  const n0 = br.results.length;
  while (br.phase === 'count') tick();
  sB.ship.hull = 60;
  for (let i = 0; i < 10 * 60 && br.results.length === n0; i++) tick();
  const r = br.results[n0];
  report(!!r && r.cause === 'timeout' && r.winner === 'A', `the round cap decides by hull %: A ${r ? r.hull.A.toFixed(0) : '?'} against B ${r ? r.hull.B.toFixed(0) : '?'} -> winner ${r ? r.winner : 'none'} (${r ? r.cause : 'no result'})`);
  br.P.ROUND_TIME = cap;
}

// A bomb dropped through the other ship lands on it.
{
  br.startRound();
  while (br.phase === 'count') tick();
  const before = sB.ship.hull;
  const mid = br.S.B.layout.aimPoint;
  sA.shipBombs.push({ x: mid.x + sA.rival.dx, y: mid.y + sA.rival.dy - sA.ship.alt, vx: 0, vy: 0, owner: 'x' }); // (put inside B's hull, in A's frame)
  tick();
  report(br.stats.A.bombs === 1 && sB.ship.hull < before, `a bomb of A through B hits her (hull ${before.toFixed(1)} -> ${sB.ship.hull.toFixed(1)})`);
}

report(!writes.some((k) => /airshipRecord|airshipVoyage|airshipMode|Save|Pref/i.test(k)), `no co-op saves written (localStorage writes: ${writes.length ? [...new Set(writes)].join(', ') : 'none'})`);
console.log(ok ? 'ARENA CHECK OK' : 'ARENA CHECK FAILED');
process.exit(ok ? 0 : 1);
