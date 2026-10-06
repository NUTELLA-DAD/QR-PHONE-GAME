// Headless bot simulation: runs the REAL host simulation in Node (no browser) with bot crew.
// Usage: node tools/botsim.mjs [--bots 8] [--minutes 5] [--difficulty normal] [--map network|route|open] [--seed 1] [--help]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = { bots: 8, minutes: 5, difficulty: 'normal', map: null, seed: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') {
    console.log('node tools/botsim.mjs [--bots 8] [--minutes 5] [--difficulty easy|normal|hard] [--map network|route|open] [--seed N]');
    process.exit(0);
  } else if (a.startsWith('--') && a.slice(2) in args) {
    const v = argv[++i];
    args[a.slice(2)] = typeof args[a.slice(2)] === 'number' ? Number(v) : v;
  } else {
    console.error('Unknown option ' + a + ' (try --help)');
    process.exit(2);
  }
}

// Browser stand-ins (the sim barely touches any).
globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);

// Repeatable runs: seed Math.random (and the clock the course seeds itself from) BEFORE loading the game.
if (args.seed != null) {
  let s = args.seed >>> 0; // mulberry32
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Date.now = () => 1700000000000 + args.seed;
}
// The game also reads performance.now() (bot timing, swing animations): in a seeded run it
// follows the simulated clock instead of the real one, so the same seed always plays the same.
const realNow = performance.now.bind(performance);
let simClock = 0;
if (args.seed != null) performance.now = () => simClock;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
const { SHIP_LAYOUT } = await load('shipLayout.js');
if (!config.DIFFICULTY[args.difficulty]) { console.error('Bad difficulty; use ' + Object.keys(config.DIFFICULTY).join('|')); process.exit(2); }
if (args.map) {
  if (!config.MAPS.KINDS.includes(args.map)) { console.error('Bad map; use ' + config.MAPS.KINDS.join('|')); process.exit(2); }
  config.MAPS.FORCE_KIND = args.map; // set before the sim is created so mission 1 uses it
}
const { createSimulation } = await load('modules/host/simulation.js');

const sim = createSimulation();
const state = sim.state;
state.difficulty = args.difficulty;

// Same recipe as the "Add 4 bot crew" button in network.js.
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const e = SHIP_LAYOUT.boarderEntryPoints;
for (let i = 0; i < args.bots; i++) {
  const id = 'bot' + Math.random();
  state.players[id] = {
    id, bot: true, name: 'Bot' + (i + 1),
    species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0],
    color: colors[(Math.random() * colors.length) | 0],
    x: e[0].x + Math.random() * (e[1].x - e[0].x),
    y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true,
  };
}
sim.castOff();

const dt = 1 / 60;
const totalSteps = Math.round(args.minutes * 60 * 60);
const errors = new Map(); let errorCount = 0;
let wrecks = 0, killsTotal = 0, hullSum = 0, hullN = 0, missions = 0, maxLap = state.course.lap;
let lastKills = 0, stuckVoteSteps = 0;
const t0 = realNow();

for (let step = 1; step <= totalSteps; step++) {
  try {
    simClock += dt * 1000;
    sim.update(dt);
  } catch (err) {
    errorCount++;
    const msg = String(err && err.message);
    if (!errors.has(msg) && errors.size < 5) errors.set(msg, ((err && err.stack) || '').split('\n').slice(1, 3).map((s) => s.trim()).join(' | '));
  }
  // Kills reset on a wreck, so accumulate the increases.
  if (state.kills < lastKills) lastKills = 0;
  killsTotal += state.kills - lastKills; lastKills = state.kills;
  if (state.course.lap > maxLap) { missions += state.course.lap - maxLap; maxLap = state.course.lap; }
  if (state.phase === 'flying') { hullSum += state.ship.hull; hullN++; }
  // Wreck sequence ends in the lobby: count it and cast off again.
  if (state.phase === 'lobby') {
    wrecks++;
    maxLap = state.course.lap; lastKills = 0;
    sim.castOff();
  }
  // Watchdog: a vote that never resolves.
  stuckVoteSteps = state.vote ? stuckVoteSteps + 1 : 0;
  if (stuckVoteSteps > 60 * 60) { errorCount++; errors.set('vote stalled for over a minute', ''); state.vote = null; stuckVoteSteps = 0; }
  if (step % 3600 === 0) {
    console.log(`min ${step / 3600}: mission ${state.course.lap}, hull ${Math.round(state.ship.hull)}, kills ${killsTotal}, wrecks ${wrecks}`);
  }
}

console.log('--- botsim summary ---');
console.log(`bots ${args.bots}, ${args.minutes} min, ${args.difficulty}, map ${args.map || 'mixed'}, seed ${args.seed ?? 'random'}`);
console.log(`missions completed: ${missions}`);
console.log(`wrecks: ${wrecks}`);
console.log(`average hull: ${hullN ? (hullSum / hullN).toFixed(1) : 'n/a'}`);
console.log(`kills: ${killsTotal}`);
console.log(`errors: ${errorCount}`);
for (const [m, s] of errors) console.log(`  - ${m}${s ? '  @ ' + s : ''}`);
console.log(`real time: ${((realNow() - t0) / 1000).toFixed(1)}s`);
process.exit(errorCount ? 1 : 0);
