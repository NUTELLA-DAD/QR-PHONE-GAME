// One Versus game between two parts lists, headless: the harness of the ship forge (tools/shipforge.mjs) and its gate (tools/gen-check.mjs). Built on the same flow as tools/pvp-stats.mjs:
// Mode VERSUS with bot crews, the shelf skipped, one round (config.PVP.WINS_NEEDED 1), the sky of a chosen environment and map seed. Sides are fixed by the caller (red is the ship on the left
// in round 1), so a fair pairing plays twice with the sides swapped. Deterministic for (red, blue, env, seed): a fresh simulation every game, Math.random seeded.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

installShims();
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
export { config, load };

const DT = 1 / 60;
const BASE = { ROUND_TIME: config.PVP.ROUND_TIME, WINS_NEEDED: config.PVP.WINS_NEEDED, ENVIRONMENT: config.PVP.ENVIRONMENT, MAP_SEED: config.PVP.MAP_SEED };
export const ENVS = Object.keys(config.ENVIRONMENTS).filter((k) => config.ENVIRONMENTS[k] && config.ENVIRONMENTS[k].name);

// game = { red: parts, blue: parts, env, seed, cap (round seconds), bots (per side) }  ->  { winner: 'red' | 'blue' | null, cause, time, hull: { red, blue }, stats: { red, blue }, errors, firstError }
export function playGame({ red, blue, env = 'skyisles', seed = 1, cap = 300, bots = 5 }) {
  const clock = seedRandom(seed);
  Object.assign(config.PVP, { ROUND_TIME: cap, WINS_NEEDED: 1, ENVIRONMENT: env, MAP_SEED: 7 + (seed % 997) });
  let errors = 0, firstError = null;
  const sim = createSimulation();
  const step = () => {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors++; if (!firstError) firstError = e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e); }
  };
  sim.setSession('versus');
  const M = sim.match;
  M.addBots('red', bots);
  M.addBots('blue', bots);
  M.shelf = [{ id: 'forge-red', name: 'RED', parts: red }, { id: 'forge-blue', name: 'BLUE', parts: blue }];
  M.applyPicks({ red: 0, blue: 1 });
  M.begin({ shelf: false });
  const maxSteps = 60 * (cap + 40) * 2;
  let n = 0;
  while (M.results.length < 1 && n++ < maxSteps) step();
  const res = M.results[0];
  Object.assign(config.PVP, BASE);
  if (!res) return { winner: null, cause: 'stuck', time: n * DT, hull: { red: 0, blue: 0 }, stats: { red: {}, blue: {} }, errors, firstError };
  return { winner: res.winner || null, cause: res.cause, time: res.time, hull: res.hull, stats: res.stats, errors, firstError };
}

// A worker process: tools/shipforge.mjs forks this file; it plays the games it is sent and answers with the results.
if (process.argv.includes('--worker') && process.send) {
  process.on('message', (m) => {
    if (m.type === 'exit') process.exit(0);
    if (m.type !== 'game') return;
    let r;
    try { r = playGame(m.game); } catch (e) { r = { error: String(e && e.stack ? e.stack : e) }; }
    process.send({ id: m.id, result: r });
  });
  process.send({ ready: true });
}
void BUILDS;
