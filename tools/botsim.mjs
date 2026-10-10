// Headless bot simulation: runs the REAL host simulation in Node (no browser) with bot crew.
// Usage: node tools/botsim.mjs [--bots 8] [--humans 0] [--minutes 5] [--difficulty normal] [--map network|route|open] [--seed 1] [--help]
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const args = { bots: 8, humans: 0, minutes: 5, difficulty: 'normal', map: null, seed: null, env: null, reapply: 0, build: null, rupture: 0, blowout: 0, trace: null, traceEvery: 30, ships: 1, build2: 'classic', botTurns: 0, teams: 0, breakoff: 0, creature: null, lair: 0 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') {
    console.log('node tools/botsim.mjs [--bots 8] [--humans 0] [--minutes 5] [--difficulty easy|normal|hard] [--map network|route|open] [--env skyisles|frost|ember|fungal|aether|storm|sea] [--seed N] [--reapply N] [--build multi|bags|giantbag] [--rupture SECONDS (several gasbags: shoot the fore bag flat then, S.5d)] [--blowout SECONDS (S.5f: over-pressure the boiler every SECONDS of flight so it blows and lights a fire beside itself: a fire test)] [--ships N [--build2 NAME] (B.2: N ships in one sky, the bots dealt out round the ships by player.ship; ship 0 is the classic one or --build, the others --build2; the summary is about ship 0, with one line per ship at the end)] [--teams 1 (B.3: each ship takes a team: red, blue, green)] [--breakoff SECONDS (S.5i: force a break-off every SECONDS of flight: a bomb bay explosion, then the limb a gun or an engine stands on, then a gasbag; the crew rebuild at the next sky-dock; prints a breakoff line)] [--creature kraken (C.1: a giant Kraken in every mission: rises ahead of the ship; prints a creature line)] [--bot-turns 1 (M.3: a bot at the helm may COME ABOUT when the goal has been behind her for a while; off by default so the baseline stands; prints a turns line)] [--trace FILE [--trace-every 30] (B0: a per-step dump of the ship, tab separated, for tools/buildsim.mjs --check-frames)]');
    process.exit(0);
  } else if (a.startsWith('--') && a.slice(2).replace(/-([a-z])/g, (m, c) => c.toUpperCase()) in args) {
    const key = a.slice(2).replace(/-([a-z])/g, (m, c) => c.toUpperCase()); // (--trace-every -> traceEvery)
    const v = argv[++i];
    args[key] = typeof args[key] === 'number' ? Number(v) : v;
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
if (process.env.NO_DARING) config.BOTS.DARING.ENABLED = false; // (compare runs with and without the bots' daring stunts)
if (process.env.NO_LIVE) config.BALANCE.LIVE = false; // (compare runs without the live balance: crew, coal and ammo shifting the ship's trim, balance.js)
if (process.env.NO_FORCES) config.FORCES.LIVE = false; // (compare runs without hits, gusts, scrapes, rams and the tether twisting the ship: forces.js; engines and sails still do)
if (process.env.NO_BREAKOFF) config.BREAKOFF.ENABLED = false; // (compare runs with parts never breaking off: S.5i)
if (!args.lair && !process.env.WITH_LAIRS) config.CREATURES.LAIR.COUNT = { short: 0, long: 0 }; // (C.3: botsim flies single missions, to compare numbers from one change to the next - the baseline, the golden, the frames. Whatever route it rolls has no Kraken lair in it, so those stay as they were; lairs are flown by tools/voyagesim.mjs, by --lair 1 here, and by WITH_LAIRS=1)
if (process.env.NO_LINKS) config.LINKS.ENABLED = false; // (compare runs without the linked stations: gun+loader, helm+lookout, boiler surge)
if (process.env.NO_HEALTH) config.HEALTH.ENABLED = false; // (compare runs with the old crew rules: no hearts, a raider blow or a bomb knocks a crewman out in one go)
if (process.env.HEALTH_CFG) { const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (v && typeof v === 'object') merge(a[k], v); else a[k] = v; } }; merge(config.HEALTH, JSON.parse(process.env.HEALTH_CFG)); } // (tuning: HEALTH_CFG='{"SHELL":{"RADIUS":140}}' overrides config.HEALTH numbers)
if (!config.DIFFICULTY[args.difficulty]) { console.error('Bad difficulty; use ' + Object.keys(config.DIFFICULTY).join('|')); process.exit(2); }
if (args.map) {
  if (!config.MAPS.KINDS.includes(args.map)) { console.error('Bad map; use ' + config.MAPS.KINDS.join('|')); process.exit(2); }
  config.MAPS.FORCE_KIND = args.map; // set before the sim is created so mission 1 uses it
}
if ((args.creature || args.lair) && !args.env) args.env = args.creature === 'drake' ? 'ember' : 'sea'; // (the Kraken lives at the water line: --creature kraken flies the Sunken Sea unless told otherwise; the Cinder Drake lives in the Ember Forge; --lair 1 --env ember makes the Drake's lairs)
if (args.env) {
  if (!config.ENVIRONMENTS[args.env] || !config.ENVIRONMENTS[args.env].name) { console.error('Bad env; use ' + Object.keys(config.ENVIRONMENTS).filter((k) => config.ENVIRONMENTS[k] && config.ENVIRONMENTS[k].name).join('|')); process.exit(2); }
  config.ENVIRONMENTS.FORCE = args.env; // every mission happens in this environment
}
if (args.creature) {
  if (args.creature !== 'kraken' && args.creature !== 'drake') { console.error('Bad creature; use kraken or drake'); process.exit(2); }
  if (!args.lair || args.creature === 'kraken') config.CREATURES.DEV_SPAWN = args.creature; // (C.1: a giant creature in every mission, creatureSystem.js; for the Drake with --lair, the lair raises it)
}
if (args.lair) config.CREATURES.DEV_LAIR = true; // (C.3: every stop but the Flagship is a Kraken's LAIR - the sea map of buildLairMap, the creature rising at the zeppelin's slot, the stop done when it is dead - instead of the dev flag's creature in the usual map)
if (process.env.CREATURE_FORCE_WIN) config.CREATURES.FORCE_WIN = process.env.CREATURE_FORCE_WIN; // (C.3: sever | mouth | tow | board | hp: the bots steer so that the fight can only end that way)
const crOn = !!(args.creature || args.lair);
const { createSimulation } = await load('modules/host/simulation.js');

// (--build NAME: fly another build instead of the classic ship: a scratch fixture tools/fixtures/NAME-build.mjs, e.g. --build multi,
// or a .json / .mjs file (tools/buildload.mjs), e.g. the random builds of tools/buildsim.mjs --random)
if (args.build && args.build !== 'classic') {
  const { applyBuild } = await load('shipLayout.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { loadBuild } = await import(pathToFileURL(path.join(root, '..', 'tools', 'buildload.mjs')).href);
  applyBuild(await loadBuild(args.build, BUILDS));
}
const { createRunStats } = await load('modules/host/buildStats.js');
const sim = createSimulation();
const state = sim.state;
if (args.ships > 1) {
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { loadBuild } = await import(pathToFileURL(path.join(root, '..', 'tools', 'buildload.mjs')).href);
  for (let k = 1; k < args.ships; k++) sim.addShip(await loadBuild(args.build2, BUILDS), { formation: { dx: -250 * k, dalt: -1150 * k } });
}
if (args.teams) state.ships.forEach((sh, i) => { sh.team = config.FLEET.DEV_TEAMS[i % config.FLEET.DEV_TEAMS.length]; });
if (args.botTurns) config.SHIP.TURN.BOT_TURNS = true;
let turns = 0, lastFacing = state.ships[0].pose.f; // (--bot-turns: how often ship 0 came about)
const runStats = args.build ? createRunStats(state) : null; // (--build: the per-run numbers tools/buildsim.mjs reads)
state.difficulty = args.difficulty;

// Same recipe as the "Add 4 bot crew" button in network.js.
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
for (let i = 0; i < args.bots; i++) {
  const sh = state.ships[i % state.ships.length]; // (several ships: the bots are dealt out round them, each over his own ship's boarding span)
  const e = sh.layout.boarderEntryPoints;
  const id = 'bot' + Math.random();
  state.players[id] = {
    ...(state.ships.length > 1 ? { ship: sh.id } : {}),
    id, bot: true, human: i < args.humans, name: 'Bot' + (i + 1), // (--humans N: the first N stand in for human players, so ship's mates come aboard for N <= 3)
    species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0],
    color: colors[(Math.random() * colors.length) | 0],
    x: e[0].x + Math.random() * (e[1].x - e[0].x),
    y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true,
  };
}
// (--reapply N: re-apply the classic ship build N times in the lobby; the run must still match the plain one)
if (args.reapply) {
  const { applyBuild } = await load('shipLayout.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  for (let i = 0; i < args.reapply; i++) applyBuild(BUILDS.classic);
}
sim.castOff();

const tally = {}; // stat counts that survive the per-lap stat reset
const dt = 1 / 60;
const totalSteps = Math.round(args.minutes * 60 * 60);
const errors = new Map(); let errorCount = 0;
let wrecks = 0, killsTotal = 0, hullSum = 0, hullN = 0, missions = 0, maxLap = state.course.lap;
let lastKills = 0, stuckVoteSteps = 0;
let bagDowns = 0, lastBagAlert = null, bagMin = 100; // several gasbags (S.5d): times a bag went flat, and the emptiest any bag got
let forcedBreaks = 0; // --breakoff: how many forced break-offs so far
let ruptured = false, healedAt = null; // --rupture: the fore bag shot flat at that second (gas 0 and three holes in it); when did the crew get it back above BAG_UP
const missionMins = []; let missionStartStep = 0;
// Steam stats while flying: pressure sum, steps under 35 / over 70 / over 90, blowouts, steps in overdrive.
let pSum = 0, pN = 0, pLow = 0, pOver70 = 0, pOver90 = 0, blowouts = 0, leakSteps = 0, lastPress = state.ship.press;
let sporeCloudSteps = 0, sporedSteps = 0, clogSum = 0, clogMax = 0, engSum = 0, o2Sum = 0, o2Min = 1, lackSteps = 0, gasSum = 0, gasMax = 0, crewSteps = 0, envN = 0, iceG = 0, iceD = 0, iceGun = 0, iceMax = 0, sinkSum = 0, thermalSteps = 0, burnSteps = 0, heatSum = 0, climbSum = 0, climbN = 0, blizSteps = 0, smokeSteps = 0, fireSum = 0, fireMax = 0;
let gapSum = 0, gapMin = 1e9, seaSteps = 0, floodSum = 0, floodHigh = 0, wetSteps = 0, galeSteps = 0;
let lightSteps = 0, lightManned = [0, 0], lightLit = 0, litBonus = 0; // searchlights: flight steps, steps each lamp was manned, steps with something lit
let matesMax = 0;
let koEdges = 0, crewSteps2 = 0, heartSum = 0, lowSteps = 0; // crew health: times a crewman was knocked out, and the hearts the crew carried while flying
let fireSteps = 0, fireStarts = 0, fireHullEaten = 0, firePrev = 0, fireStepsAny = 0; // S.5f: fire exposure while flying (fires burning, new ones lit, hull they eat)
let contacts = 0, wasScrape = false;
let segSteps = 0, altRef = null, vySum = 0, scrapeSteps = 0;
let distPrev = null, distTravel = 0, flightSteps = 0, altMin = Infinity, altMax = -Infinity, progMax = 0, speedSum = 0, distBack = 0; // S.5e: how far and how fast she got, and how much altitude she covered
const actTally = {};
if (process.env.FIRE_TRACE && sim.fire) { const ig = sim.fire.ignite; let n = 0; sim.fire.ignite = (d, x, why, opts) => { if (n++ < 3) console.log(`ignite ${why} d${d} x${Math.round(x)} @${(simClock / 1000).toFixed(1)}s ${new Error().stack.split('\n').slice(2, 6).map((s) => s.trim().replace(/\(.*[\\/]/, '(')).join(' < ')}`); return ig(d, x, why, opts); }; } // (FIRE_TRACE: who lights the first fires; only reaches callers that look the function up through sim.fire)
const crTrack = { rec: null, list: [] }; // --creature: every creature the bots met, one a mission
const traceRows = args.trace ? ['step\tphase\tlap\tx\ty\talt\tdist\tspeed\tpitch\tvy\thull\tgas\tkills\twrecks'] : null; // (--trace)
const t0 = realNow();

for (let step = 1; step <= totalSteps; step++) {
  try {
    simClock += dt * 1000;
    if (args.rupture && step === Math.round(args.rupture * 60) && state.bags.length > 1 && state.phase === 'flying') {
      const last = state.bags.length - 1;
      state.bags[last].gas = 0;
      for (const x of [1300, 1340, 1320]) state.gasHoles.push(sim.gasHoleAt(x, 450, last));
      ruptured = true;
    }
    if (args.breakoff && state.phase === 'flying' && !state.ship.down && step % Math.round(args.breakoff * 60) === 0) { // (--breakoff: the S.5i test switch: cause 0 = the bomb bay goes up, 1 = a gun's or an engine's limb, 2 = a gasbag when there are several)
      const sh0 = state.ships[0];
      let k = forcedBreaks++ % 3;
      if (k === 0) { if (sh0.layout.bombBay) { state.bombBay.bombs = Math.max(1, state.bombBay.bombs); sh0.sim.explodeBay('test'); } else k = 1; }
      if (k === 1) { const names = [...sh0.layout.stations.filter((q) => q.kind === 'gun').map((q) => q.n), ...sh0.layout.engines.map((q) => q.name)]; if (names.length) sh0.sim.breakOff({ kind: 'part', name: names[(Math.random() * names.length) | 0], cause: 'test' }, { force: true }); }
      if (k === 2 && sh0.layout.gasbags.length > 1) sh0.sim.breakOff({ kind: 'bag', index: (Math.random() * sh0.layout.gasbags.length) | 0, cause: 'test' }, { force: true });
    }
    if (args.blowout && state.phase === 'flying' && step % Math.round(args.blowout * 60) === 0) state.ship.press = 100; // (the next step the boiler blows: a pipe bursts and a fire may start beside it)
    sim.update(dt);
    if (ruptured && healedAt === null && state.gasHoles.length === 0 && state.bags[state.bags.length - 1].gas > config.GAS.BAG_UP) healedAt = step / 60 - args.rupture;
    if (runStats) runStats.step(dt);
    if (process.env.FIRE_TRACE && state.fires.length > 0 && !globalThis.__fireSeen) { globalThis.__fireSeen = true; console.log(`first fire at ${(step / 60).toFixed(1)}s: ${JSON.stringify(state.fires.map((f) => ({ d: f.d, x: Math.round(f.x), why: f.why })))} hull ${state.ship.hull.toFixed(0)} ev ${state.ev.warnText}`); }
    if (process.env.BOT_TICK && (step % 300 === 0 || (process.env.BOT_TICK === 'fast' && step < 1800 && step % 60 === 0))) console.log(`tick ${step / 60}s: gas ${state.ship.gas.toFixed(0)} vy ${state.ship.vy.toFixed(0)} press ${state.ship.press.toFixed(0)} fuel ${state.ship.fuel.toFixed(0)} speed ${state.ship.speed.toFixed(2)} alt ${state.ship.alt.toFixed(0)} hull ${state.ship.hull.toFixed(0)} progress ${(state.course.progress || 0).toFixed(2)} bats ${state.bats.length} bombers ${(state.bombers || []).length} strafers ${(state.strafers || []).length} gunship ${state.gunship ? state.gunship.phase : '-'} boss ${state.boss ? 'yes' : '-'} creature ${state.creature ? state.creature.mode + ' p' + state.creature.phase : '-'} fires ${state.fires.length} holes ${state.breaches.length} tempo ${state.tempo ? state.tempo.phase + '/' + state.tempo.kind : '-'}`); // (a look at what is going on)
    if (crOn && state.creature) { // (--creature / --lair: when it rose, when it died and how, and a check that nothing in it went NaN)
      const c = state.creature;
      if (!crTrack.rec || crTrack.rec.c !== c) crTrack.list.push((crTrack.rec = { c, riseAt: null, deadAt: null, how: null }));
      const r = crTrack.rec;
      if (process.env.CREATURE_TOW && c.phase >= 3 && step % 120 === 0) { const sh = state.ships[0], sp = state.course.map.spires || []; console.log(`tow t${(step / 60).toFixed(0)}s lines ${c.harpoons.length} hooked ${c.hooked} tvx ${(c.tvx || 0).toFixed(0)} tension ${(c.towTension || 0).toFixed(2)} body ${Math.round(c.x)} ship ${Math.round(sh.pose.x + sh.layout.refPoint.x)} spires ${sp.map((s) => Math.round(s.x)).join('/')} rockT ${(c.stats.rockT || 0).toFixed(1)} hp ${Math.round(c.hp)} harpoon ammo ${Object.values(state.GUNS).filter((g) => g.type === 'harpoon').map((g) => g.ammo + '/cd' + (g.cd || 0).toFixed(0)).join(',')}`); }
      if (process.env.CREATURE_BEAK && c.mouthWin && step % 20 === 0) { const sh = state.ships[0], m = c.parts.find((p) => p.kind === 'mouth').segs[0], bay = sh.layout.bombBay; console.log(`beak t${(step / 60).toFixed(1)} window ${c.mouthWin.t.toFixed(1)}/${(c.mouthWin.t + c.mouthWin.left).toFixed(1)} open ${c.parts.find((p) => p.kind === 'mouth').open} bombs ${state.bombBay.bombs} at bay: ${Object.values(state.players).filter((q) => sh.layout.kindOf(q.lock) === 'bombBay').map((q) => q.name).join(',') || 'nobody'} bayX ${bay ? Math.round(sh.pose.x + bay.x) : '-'} mouthX ${Math.round(m.x)} dx ${bay ? Math.round(m.x - (sh.pose.x + bay.x)) : '-'} dy ${bay ? Math.round(m.y - (sh.pose.y + bay.y)) : '-'} fed ${c.fed}`); }
      if (process.env.CREATURE_LOG && step % 600 === 0) { const sh = state.ships[0]; console.log(`creature t${step / 60}s ${c.mode} body ${Math.round(c.x)},${Math.round(c.y)} ship ${Math.round(sh.pose.x + sh.layout.refPoint.x)},${Math.round(sh.pose.y + sh.layout.refPoint.y)} hp ${Math.round(c.hp)} mouth ${c.parts.find((p) => p.kind === 'mouth').open ? 'open' : 'shut'}`); }
      if (process.env.DRAKE_LOG && c.kind === 'drake' && step % 120 === 0) { const sh = state.ships[0]; console.log(`drake t${step / 60}s ${c.drake.mode}/${c.drake.act ? c.drake.act.kind + '.' + (c.drake.act.sub || '') : '-'} body ${Math.round(c.x)},${Math.round(c.y)} ship ${Math.round(sh.pose.x + sh.layout.refPoint.x)},${Math.round(sh.pose.y + sh.layout.refPoint.y)} hp ${Math.round(c.hp)}/${c.maxHp} hooked ${c.hooked} lines ${c.harpoons.length} tvx ${(c.tvx || 0).toFixed(0)} spouts ${c.drake.spouts.map((v) => Math.round(v.x) + ':' + v.st).join(' ')} perch ${c.drake.perch ? c.drake.perch.sub : '-'} hull ${state.ship.hull.toFixed(0)} gas ${state.ship.gas.toFixed(0)} fires [${state.fires.map((f) => f.d + ':' + Math.round(f.x) + (f.big ? 'B' : '')).join(' ')}] gasHoles ${state.gasHoles.length}` + (process.env.DRAKE_LOG === '2' ? ' bots ' + Object.values(state.players).filter((q) => q.bot).map((q) => (q.lock ? 'L:' + String(q.lock).slice(0, 5) : q.botJob ? q.botJob.kind : q.fall ? 'fall' : q.ko > 0 ? 'ko' : '-') + '@' + q.d + ':' + Math.round(q.x)).join(' ') : '')); }
      if (c.mode === 'idle' && r.riseAt == null) r.riseAt = step / 60;
      crTrack.tilt = Math.max(crTrack.tilt || 0, Math.abs(state.forces.theta)); if (!Number.isFinite(state.ships[0].pose.x + state.ships[0].pose.y + state.forces.theta)) throw new Error('NaN in the ship');
      if (c.dying && r.deadAt == null) { r.deadAt = step / 60; r.how = c.diedBy; }
      if (c.parts.some((p) => !Number.isFinite(p.hp) || p.segs.some((s) => !Number.isFinite(s.x) || !Number.isFinite(s.y) || !Number.isFinite(s.ang)))) throw new Error('NaN in the creature');
    }
    matesMax = Math.max(matesMax, Object.values(state.players).filter((q) => q.mate).length);
    for (const q of Object.values(state.players)) {
      if (!q.enemy && state.phase === 'flying') { // (crew health: knock-outs counted as they start, and the hearts in the crew)
        if (q.ko > 0 && !q.koSeen) { koEdges++; if (process.env.KO_LOG) console.log('KO', (step / 60).toFixed(0) + 's', q.name, 'ko', q.ko.toFixed(2), 'hearts', q.hearts); }
        q.koSeen = q.ko > 0;
        const hv = q.hearts == null ? config.HEALTH.MAX : q.hearts;
        crewSteps2++; heartSum += hv; if (hv <= config.HEALTH.JOB_AT) lowSteps++;
      }
      const st = q.stats || {};
      for (const k of ['ammo', 'coal', 'fires', 'holes', 'ice', 'clears', 'oxygen']) {
        const d = (st[k] || 0) - ((q.seen && q.seen[k]) || 0);
        if (d > 0) tally[k] = (tally[k] || 0) + d;
        (q.seen = q.seen || {})[k] = st[k] || 0;
      }
    }
  } catch (err) {
    errorCount++;
    const msg = String(err && err.message);
    if (!errors.has(msg) && errors.size < 5) errors.set(msg, ((err && err.stack) || '').split('\n').slice(1, 3).map((s) => s.trim()).join(' | '));
  }
  // Kills reset on a wreck, so accumulate the increases.
  if (state.kills < lastKills) lastKills = 0;
  killsTotal += state.kills - lastKills; lastKills = state.kills;
  if (state.course.lap > maxLap) { missions += state.course.lap - maxLap; maxLap = state.course.lap; missionMins.push((step - missionStartStep) / 3600); missionStartStep = step; }
  if (state.phase === 'flying') {
    const pr = state.ship.press;
    pSum += pr; pN++; if (pr < 35) pLow++; if (pr > 70) pOver70++; if (pr > 90) pOver90++;
    if (state.steamParts && state.steamParts.leaks > 0.2) leakSteps++;
    if (state.boilerBlew) { blowouts++; state.boilerBlew = false; }
  }
  lastPress = state.ship.press;
  if (state.bags.length > 1) { if (state.bagAlert && state.bagAlert !== lastBagAlert) { bagDowns++; lastBagAlert = state.bagAlert; } if (state.phase === 'flying') for (const b of state.bags) bagMin = Math.min(bagMin, b.gas); }
  if (state.phase === 'flying' && state.searchlights) { lightSteps++; state.searchlights.forEach((l, i) => { if (l.manned) lightManned[i] = (lightManned[i] || 0) + 1; }); if (state.litTargets.length) lightLit++; }
  if (state.phase === 'flying') { hullSum += state.ship.hull; hullN++; const nf = state.fires.length; fireSteps += nf; if (nf) fireStepsAny++; if (nf > firePrev) fireStarts += nf - firePrev; firePrev = nf; fireHullEaten += nf * 0.35 * 2 * dt; } else firePrev = 0;
  if (state.phase === 'flying' && !state.ship.down) {
    const dd = distPrev == null ? 0 : state.course.dist - distPrev;
    if (distPrev == null || Math.abs(dd) >= 200) { segSteps = 0; altRef = null; } else distTravel += dd; // (a new mission map or a restart resets the distance: skip that jump and start a new stretch)
    distPrev = state.course.dist;
    flightSteps++; speedSum += state.ship.speed; segSteps++;
    if (segSteps === 1200) altRef = state.ship.alt; // (20 s after a start she has settled: measure how far she moves from there)
    if (altRef != null) { altMin = Math.min(altMin, state.ship.alt - altRef); altMax = Math.max(altMax, state.ship.alt - altRef); }
    progMax = Math.max(progMax, state.course.progress || 0);
    vySum += Math.abs(state.ship.vy || 0); if (state.course.scraping) scrapeSteps++;
    if (state.course.scraping && !wasScrape) contacts++; wasScrape = !!state.course.scraping; // (B0: rock contacts = scrape episodes, for the cave golden)
  } else distPrev = null;
  if (process.env.BOT_ACT && state.phase === 'flying') for (const q of Object.values(state.players)) if (q.bot) { const k = q.lock ? 'at ' + q.lock : q.botJob ? q.botJob.kind : 'idle'; actTally[k] = (actTally[k] || 0) + 1; } // (BOT_ACT=1: what the bots spend their time on)
  if (state.phase === 'flying' && state.env) { // environment stats
    const E = state.env;
    envN++; iceG += state.ice.gasbag; iceD += state.ice.topdeck; iceGun += state.ice.guns; iceMax = Math.max(iceMax, state.ice.gasbag, state.ice.guns); sinkSum += E.sink;
    if (E.heat > 0.05) thermalSteps++; if (E.burn > 0.2) burnSteps++; heatSum += E.heat; if (E.heat > 0.05) { climbSum += Math.abs(state.ship.vy || 0); climbN++; }
    gasSum += state.ship.gas; gasMax = Math.max(gasMax, state.ship.gas);
    if ((state.spores || []).length) sporeCloudSteps++;
    { let any = 0, n = 0; for (const q of Object.values(state.players)) { n++; if ((q.sporeT || 0) > 0) any++; } sporedSteps += any; crewSteps += n; }
    { const cl = Math.max(...(state.clogs || [{ lvl: 0 }]).map((c) => c.lvl)); clogSum += cl; clogMax = Math.max(clogMax, cl); engSum += E.engine; }
    o2Sum += E.o2; o2Min = Math.min(o2Min, E.o2); if (E.lack > 0) lackSteps++;
    if (args.env === 'sea' && state.course && state.course.map && E.seaY != null) { const gp = E.seaY - ((state.course.refY ?? 500 - state.ship.alt) + config.ENVIRONMENTS.sea.SEA.KEEL); gapSum += gp; gapMin = Math.min(gapMin, gp); }
    seaSteps++; floodSum += state.sea.flood; if (state.sea.flood > 0.3) floodHigh++; if (state.sea.spray > 0.5) wetSteps++; if (E.gale > 0.3) galeSteps++;
    if (E.blizzard > 0.3) blizSteps++; if (E.smoke > 0.3) smokeSteps++; fireSum += state.fires.length; fireMax = Math.max(fireMax, state.fires.length);
  }
  // Wreck sequence ends in the lobby: count it and cast off again.
  if (state.phase === 'lobby') {
    wrecks++; missionStartStep = step;
    maxLap = state.course.lap; lastKills = 0;
    sim.castOff();
  }
  // --trace FILE: every N steps the ship's numbers at full precision (x, y = the pose's world position; alt/dist are what they are made of).
  if (traceRows && step % args.traceEvery === 0) {
    const sh = state.ships[0], p = sh.pose;
    traceRows.push([step, state.phase, state.course.lap, p.x, p.y, state.ship.alt, state.course.dist, state.ship.speed, state.ship.pitch || 0, state.ship.vy || 0, state.ship.hull, state.ship.gas, killsTotal, wrecks].join('\t'));
  }
  // Watchdog: a vote that never resolves.
  stuckVoteSteps = state.vote ? stuckVoteSteps + 1 : 0;
  if (stuckVoteSteps > 60 * 60) { errorCount++; errors.set('vote stalled for over a minute', ''); state.vote = null; stuckVoteSteps = 0; }
  if (state.ships[0].pose.f !== lastFacing) { turns++; lastFacing = state.ships[0].pose.f; }
  if (process.env.TRACE && step % 300 === 0) console.log(`t ${step / 60}s alt ${Math.round(state.ship.alt)} vy ${Math.round(state.ship.vy || 0)} gas ${state.ship.gas.toFixed(0)} holes ${state.gasHoles.length} speed ${state.ship.speed.toFixed(2)} sail ${(state.sailPush || 0).toFixed(2)} dist ${Math.round(state.course.dist)} scrape ${state.course.scraping} hull ${Math.round(state.ship.hull)}`);
  if (step % 3600 === 0) {
    console.log(`min ${step / 3600}: mission ${state.course.lap}, hull ${Math.round(state.ship.hull)}, kills ${killsTotal}, wrecks ${wrecks}`);
  }
}

if (traceRows) fs.writeFileSync(args.trace, traceRows.join('\n') + '\n');
console.log('--- botsim summary ---');
console.log(`bots ${args.bots} (${args.humans} as humans; ship's mates seen: ${matesMax}), ${args.minutes} min, ${args.difficulty}, map ${args.map || 'mixed'}, seed ${args.seed ?? 'random'}`);
console.log(`missions completed: ${missions}` + (missionMins.length ? `, minutes each: ${missionMins.map((m) => m.toFixed(1)).join(" ")}, average ${(missionMins.reduce((a, b) => a + b, 0) / missionMins.length).toFixed(1)}` : ""));
console.log(`wrecks: ${wrecks}`);
if (args.botTurns) console.log(`turns (COME ABOUT, bot helm): ${turns}`);
console.log(`average hull: ${hullN ? (hullSum / hullN).toFixed(1) : 'n/a'}`);
console.log(`kills: ${killsTotal}`);
const sum = (k) => tally[k] || 0;
console.log(`fires: burning avg ${hullN ? (fireSteps / hullN).toFixed(2) : 'n/a'}, on fire ${hullN ? ((100 * fireStepsAny) / hullN).toFixed(1) : 'n/a'}% of flight, lit ${fireStarts}, hull eaten ~${fireHullEaten.toFixed(1)}; by hit ${state.fireStats.hit}, spread ${state.fireStats.spread}, boiler ${state.fireStats.boiler}, other ${state.fireStats.env}; blazes ${state.fireStats.blazes}, hits on plate ${state.fireStats.plated}`);
console.log(`hauled: ${sum('ammo')} ammo loads, ${sum('coal')} coal loads; fires out ${sum('fires')}, holes patched ${sum('holes')}`);
const pc = (n) => (pN ? ((100 * n) / pN).toFixed(1) : 'n/a') + '%';
console.log(`steam: mean ${pN ? (pSum / pN).toFixed(1) : 'n/a'}, <35 ${pc(pLow)}, >70 ${pc(pOver70)}, >90 ${pc(pOver90)}, blowouts ${blowouts}, leaking ${pc(leakSteps)}`);
if (args.env === 'frost' || args.env === 'ember') {
  const pe = (n) => (envN ? ((100 * n) / envN).toFixed(1) : 'n/a') + '%';
  const av = (n) => (envN ? (n / envN).toFixed(2) : 'n/a');
  if (args.env === 'frost') console.log(`frost: ice chipped ${sum('ice')}; coverage avg gasbag ${av(iceG)} / top deck ${av(iceD)} / guns(max crust) ${av(iceGun)}, peak ${iceMax.toFixed(2)}; weight sink avg ${av(sinkSum)} gas pts; blizzard ${pe(blizSteps)} of flight`);
  if (args.env === 'ember') console.log(`ember: thermal ${pe(thermalSteps)} of flight (avg heat ${av(heatSum)}, avg climb speed in thermals ${climbN ? (climbSum / climbN).toFixed(0) : 'n/a'} px/s), scorched ${pe(burnSteps)}, fires burning avg ${av(fireSum)} max ${fireMax}, smoke ${pe(smokeSteps)}`);
}
{
  const pe = (n) => (envN ? ((100 * n) / envN).toFixed(1) : 'n/a') + '%';
  const av = (n) => (envN ? (n / envN).toFixed(2) : 'n/a');
  console.log(`gas (hover needs ~${(config.GAS.NEUTRAL + (state.env.sink || 0)).toFixed(0)}): avg ${av(gasSum)}, peak ${gasMax.toFixed(0)}`);
  if (args.env === 'fungal') console.log(`fungal: spore cloud aboard ${pe(sporeCloudSteps)} of flight, crew in spores ${crewSteps ? ((100 * sporedSteps) / crewSteps).toFixed(1) : 'n/a'}% of crew-time; worst engine clog avg ${av(clogSum)} peak ${clogMax.toFixed(2)}; engine power avg ${av(engSum)}; clogs cleared ${sum('clears')}`);
  if (args.env === 'aether') console.log(`aether: oxygen avg ${av(o2Sum)} min ${o2Min.toFixed(2)}, short of air ${pe(lackSteps)} of flight; oxygen refills ${sum('oxygen')}; engine x${state.env.engine}, gravity x${state.env.gravity}`);
}
if (args.env === 'storm') console.log(`storm: strikes grounded ${state.stormJob.caught}, struck the ship ${state.stormJob.struck}, coil drank ${state.stormJob.drank}; gusting ${seaSteps ? ((100 * galeSteps) / seaSteps).toFixed(1) : 'n/a'}% of flight`);
if (args.env === "sea") console.log(`sea (this map: ${state.sea.survivors.length} survivors, ${state.sea.survivors.filter((q) => q.lost).length} lost, ${state.sea.survivors.filter((q) => q.told).length} flagged, ${state.sea.spouts.length} spouts): rescues ${state.sea.rescued}, hull dmg scrape ${(state.sea.dmgScrape || 0).toFixed(0)} flood ${(state.sea.dmgCrit || 0).toFixed(0)} spout hits ${state.sea.spoutHits || 0}, pump held ${(state.sea.pumpTime || 0).toFixed(0)}s, scrapes ${state.sea.scrapes}, keel gap above water avg ${seaSteps ? (gapSum / seaSteps).toFixed(0) : 'n/a'} min ${gapMin.toFixed(0)} px; in the water ${seaSteps ? ((100 * wetSteps) / seaSteps).toFixed(1) : 'n/a'}% of flight, flood avg ${seaSteps ? (floodSum / seaSteps).toFixed(2) : 'n/a'} (over 0.3 for ${seaSteps ? ((100 * floodHigh) / seaSteps).toFixed(1) : 'n/a'}%, peak ${state.sea.floodMax.toFixed(2)})`);
{
  // Daring stunts (bots.js): how many started, how they ended.
  const log = state.stuntLog || [];
  const count = (re) => log.filter((e) => re.test(e.text)).length;
  console.log(`daring stunts: started ${count(/^start/)} (plane ${count(/^start plane/)}, gun ${count(/^start gun/)}, show ${count(/^start show/)}); fighters stolen ${count(/-> fly$/)}; ended ${count(/^end/)}: ${[...new Set(log.filter((e) => /^end/.test(e.text)).map((e) => e.text.replace(/^end \w+ \(([^)]*)\).*/, '$1')))].map((w) => w + ' x' + count(new RegExp('^end \\w+ \\(' + w.replace(/[()]/g, '') + '\\)'))).join(', ')}`);
  if (state.stuntStats) console.log('  plane aim checks: ' + Object.entries(state.stuntStats).map(([k, v]) => k + ' x' + v).join(', '));
  if (process.env.STUNT_LOG) for (const e of log) console.log(`  ${e.t}s ${e.bot}: ${e.text}`);
}
if (lightSteps) console.log(`searchlights: ${(state.searchlights || []).map((l, i) => l.n + ' manned ' + ((100 * lightManned[i]) / lightSteps).toFixed(0) + '%').join(', ')}; something lit ${((100 * lightLit) / lightSteps).toFixed(0)}% of flight`);
{
  // Linked stations (links.js): station time with both partners present, and gunners with nothing to do.
  const S = state.linkStats;
  const all = S.gunT + S.helmT + S.nestT;
  const pr = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) : 'n/a') + '%';
  console.log(`links${config.LINKS.ENABLED ? '' : ' (OFF)'}: paired seconds ${(S.gunPair + S.helmPair + S.nestPair).toFixed(0)} of ${all.toFixed(0)} station seconds = ${pr(S.gunPair + S.helmPair + S.nestPair, all)} (gun+loader ${pr(S.gunPair, S.gunT)}, helm+lookout ${pr(S.helmPair, S.helmT)}, lookout+helm ${pr(S.nestPair, S.nestT)}); gunner idle ${pr(S.gunIdle, S.gunT)} of ${S.gunT.toFixed(0)}s; surge held ${S.surgeT.toFixed(0)}s`);
}
{
  // Crew health (health.js): knock-outs, the hearts lost (by cause) and healed, and the crew's average hearts.
  const hs = state.healthStats || { lost: {}, healed: 0, bandaged: 0, rested: 0, burnSecs: 0, ticks: 0 };
  const lostSum = Object.values(hs.lost).reduce((a, b) => a + b, 0);
  console.log(`crew${config.HEALTH.ENABLED ? '' : ' (hearts OFF)'}: knocked out ${koEdges}x; hearts lost ${lostSum.toFixed(1)} (${Object.entries(hs.lost).map(([k, v]) => k + " " + v.toFixed(1)).join(", ") || "none"}); by hearts to zero: ${Object.entries(hs.kos || {}).map(([k, v]) => k + " " + v).join(", ") || "none"}; healed ${hs.healed} in the medbay, ${hs.bandaged} bandaged, ${hs.rested} rested; burning ${hs.burnSecs.toFixed(0)}s (${hs.ticks} burns); avg hearts ${crewSteps2 ? (heartSum / crewSteps2).toFixed(2) : 'n/a'}, on the last heart ${crewSteps2 ? ((100 * lowSteps) / crewSteps2).toFixed(1) : 'n/a'}% of crew-time`);
}
if (process.env.BOT_ACT) console.log('bot time: ' + Object.entries(actTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + ((100 * v) / Object.values(actTally).reduce((a, b) => a + b, 0)).toFixed(1) + '%').join(', '));
if (state.bags.length > 1) console.log(`gasbags: ${state.bags.length} bags side by side; a bag went flat ${bagDowns} time${bagDowns === 1 ? '' : 's'}, emptiest ${bagMin.toFixed(0)}; gas valves turned ${state.valveLog || 0}x (shut ${state.valveShuts || 0}x), now ${(state.gasValveOpen || []).filter((o) => !o).length} shut; now ${state.bags.map((b) => b.gas.toFixed(0)).join("/")}${ruptured ? `; fore bag shot flat at ${args.rupture}s: ${healedAt === null ? 'NOT repaired' : `holes patched and bag back above ${config.GAS.BAG_UP} after ${healedAt.toFixed(0)}s`}` : ''}`);
if (args.build || process.env.FLIGHT) console.log(`flight: net speed ${flightSteps ? (distTravel / (flightSteps / 60)).toFixed(0) : 'n/a'} px/s (speed share incl. sails ${flightSteps ? (speedSum / flightSteps).toFixed(2) : 'n/a'}), altitude moved ${altMin === Infinity ? 'n/a' : Math.round(altMin) + ' to +' + Math.round(altMax)} from where she settled (span ${altMin === Infinity ? 0 : Math.round(altMax - altMin)}), avg climb rate ${flightSteps ? (vySum / flightSteps).toFixed(0) : 'n/a'} px/s, on the rocks ${flightSteps ? ((100 * scrapeSteps) / flightSteps).toFixed(0) : 'n/a'}%, furthest progress ${(progMax * 100).toFixed(0)}%, sails raised ${(state.sailStats && state.sailStats.raised) || 0}x (up ${state.sailStats ? state.sailStats.upSecs.toFixed(0) : 0}s), torn ${(state.sailStats && state.sailStats.torn) || 0}`);
if (state.engines && state.engines.some((q) => q.swivel || q.home)) console.log(`engines: ${state.engines.map((q) => q.name + ' ' + (q.swivel ? 'swivel' : 'fixed') + ' now ' + (Math.round((q.dir * 180) / Math.PI)) + ' deg').join(', ')}; swivel cranks manned ${state.engineStats.mannedSecs.toFixed(0)}s, engines turned ${state.engineStats.turnSecs.toFixed(0)}s; pitch from forces peaked ${((state.forces.peak * 180) / Math.PI).toFixed(2)} deg`);
if (runStats) console.log('BUILD_STATS ' + JSON.stringify({ build: args.build, ...runStats.result(), flight: { speed: flightSteps ? distTravel / (flightSteps / 60) : 0, throttle: flightSteps ? speedSum / flightSteps : 0, altMin: altMin === Infinity ? 0 : altMin, altMax: altMax === -Infinity ? 0 : altMax, climb: flightSteps ? vySum / flightSteps : 0, rocks: flightSteps ? scrapeSteps / flightSteps : 0, progress: progMax, sailsRaised: (state.sailStats && state.sailStats.raised) || 0, sailsUpSecs: state.sailStats ? state.sailStats.upSecs : 0, sailsTorn: (state.sailStats && state.sailStats.torn) || 0, tows: state.tows || 0, engineTurnSecs: state.engineStats.turnSecs, engineMannedSecs: state.engineStats.mannedSecs, engineSplitSecs: state.engineStats.splitSecs, pitchPeak: state.forces.peak, contacts }, manned: runStats.result().mannedNames, bags: state.bags.length, bagDowns, valveLog: state.valveLog || 0, valveShuts: state.valveShuts || 0, shutAtEnd: (state.gasValveOpen || []).filter((o) => !o).length, ruptured, healedAt, errors: errorCount })); // (read by tools/buildsim.mjs)
if (crOn) {
  // One line for each creature the bots met (one a mission), then the total.
  crTrack.list.forEach((r, i) => {
    const c = r.c, st = c.stats;
    console.log(`fight ${i + 1}: phase ${c.phase}${st.phaseAt ? ' (' + Object.entries(st.phaseAt).map(([k, v]) => k + ' at ' + v.toFixed(0) + 's').join(', ') + ' after it spawned)' : ''}, beak windows ${st.windows || 0}, fed ${st.fed || 0}, dives ${st.dives || 0}, rock ${((st.rockT || st.spouts) || 0).toFixed(0)}s; ended: ${st.win || 'no'}${st.winAt != null ? ' at ' + st.winAt.toFixed(0) + 's' : ''}`);
    if (c.kind === 'drake') console.log(`  drake: mode ${c.drake.mode}, breaths ${st.breaths}, fires lit ${st.fires}, crew hearts burnt ${st.hearts}, bag hits ${st.bags}, swoops ${st.swoops} (hit ${st.swoopHits}), perches ${st.perches} (claws ${st.claws}, lashes ${st.lashes}, driven off ${JSON.stringify(st.driven)}), chokes ${st.chokes} (mouth hit ${st.mouthHits || 0}x), crashes ${st.crashes}, lunges ${st.lunges} (hit ${st.lungeHits}), gapes ${st.gapes}, rears ${st.rears}, spout ${(st.spouts || 0).toFixed(1)}s`);
    { const kinds = {}; for (const [id, v] of Object.entries(st.parts)) { const k = id.replace(/\d+$/, ''); kinds[k] = (kinds[k] || 0) + v; } console.log(`  damage by part: ${Object.entries(kinds).map(([k, v]) => k + ' ' + Math.round(v)).join(', ')}`); }
    console.log(`creature ${i + 1} (${c.name}): rose at ${r.riseAt == null ? 'n/a' : r.riseAt.toFixed(0) + 's'}, ${r.deadAt == null ? 'alive when its mission ended (hp ' + Math.round(c.hp) + '/' + c.maxHp + ', ' + c.parts.filter((p) => p.kind === 'tentacle' && p.severed).length + '/6 tentacles cut)' : 'died at ' + r.deadAt.toFixed(0) + 's (' + (r.deadAt - (r.riseAt || 0)).toFixed(0) + 's after rising) by ' + r.how}; damage ${Math.round(st.dmg)} (${Object.entries(st.by).map(([k, v]) => k + ' ' + Math.round(v)).join(', ') || 'none'}), tentacles severed ${st.severed}, beak bombs ${st.chomps}`);
  });
  { const g = crTrack.list.reduce((a, r) => { const s = r.c.stats, f = s.freed || {}; a.n += s.grips || 0; for (const k of Object.keys(f)) a[k] = (a[k] || 0) + f[k]; a.slaps += s.slaps || 0; a.slapHits += s.slapHits || 0; a.ripped += s.ripped || 0; a.hulled += s.hulled || 0; a.br += s.breaches || 0; a.brHit += s.breachHits || 0; a.brMiss += s.breachMiss || 0; a.brBroke += s.breachBroke || 0; return a; }, { n: 0, slaps: 0, slapHits: 0, ripped: 0, hulled: 0, br: 0, brHit: 0, brMiss: 0, brBroke: 0 }); console.log(`grips: ${g.n} ended (hacked free ${g.hack || 0}, shot free ${g.shot || 0}, burnt free ${g.flame || 0}, cut off ${g.severed || 0}, RIPPED a section off ${g.ripped} + hull crush ${g.hulled}, other ${(g.missed || 0) + (g.gone || 0)}); slaps ${g.slaps} (${g.slapHits} crew hit); breaches ${g.br} (smashed her ${g.brHit}, missed ${g.brMiss}, tore a section off ${g.brBroke}); worst tilt ${((crTrack.tilt || 0) * 180 / Math.PI).toFixed(2)} deg (limit ${config.FORCES.MAX_DEG})`); }
  const dead = crTrack.list.filter((r) => r.deadAt != null), dmgAll = crTrack.list.reduce((a, r) => a + r.c.stats.dmg, 0);
  console.log(`creatures: met ${crTrack.list.length}, killed ${dead.length}${dead.length ? ' (fastest ' + Math.min(...dead.map((r) => r.deadAt - (r.riseAt || 0))).toFixed(0) + 's after rising, by ' + [...new Set(dead.map((r) => r.how))].join('/') + ')' : ''}, total damage ${Math.round(dmgAll)}`);
}
if (state.ships.length > 1) for (const sh of state.ships) console.log(`ship ${sh.id} (${sh.name}${sh.team ? ", " + sh.team.name : ""}): crew scale x${sh.ctx.crewScale.count.toFixed(2)}, ${sh.ctx.icing.length} ice crusts, ${sh.ctx.spores.length} spore clouds, hull ${sh.state.hull.toFixed(0)}, gas ${sh.state.gas.toFixed(0)}, ${Object.keys(sh.ctx.players).length} crew, ${sh.layout.platforms.length} decks, ${sh.layout.gasbags.length} bag(s)`);
{ const B = state.breakStats; if (args.breakoff || (B && B.events)) console.log(`breakoff: ${B.events} time${B.events === 1 ? '' : 's'} (bomb bay ${B.bay}, hit ${B.hit}, crash ${B.crash}, ram ${B.ram}, gasbag ${B.bag}), ${B.parts} parts lost, ${B.fell} crew fell, ${B.rebuilt || 0} rebuilt at the dock, ${state.run ? state.run.lost.length : 0} still missing, lift deficit ${state.liftDeficit.toFixed(1)}, ${state.debris.length} pieces in the sky; causes ${(B.causes || []).join(', ')}`); }
{ const G = state.gasStats; if (G && state.bags.some((b) => b.type && b.type !== 'helium') || (G && (G.lit || G.exploded))) console.log(`gas: bags ${state.bags.map((b) => b.type).join('/')}, hydrogen scorched ${G.scorched}, alight ${G.lit}, exploded ${G.exploded}, fizzled ${G.fizzled}, chained ${G.chained}; hot air heat now ${state.hotAir ? state.hotAir.heat.toFixed(2) : 'n/a'} (lowest ${state.hotAir ? state.hotAir.min.toFixed(2) : 'n/a'}, cold calls ${G.hotCold})`); } // (GAS TYPES: printed only when a bag holds something other than helium)
{ const H = state.hatchStats; if ((state.hatches || []).length && H) console.log(`hatch: ${state.hatches.length} cargo drop hatch${state.hatches.length === 1 ? '' : 'es'}, opened ${H.opened}x, ${H.dropped} crates dropped by hand, ${H.loads} loads through it, ${H.tipped} raiders tipped, ${H.fell} crew fell through, coal chute ${H.dumped}x`); } // (a ship with a hatch part, the bots work the lever)
console.log(`errors: ${errorCount}`);
for (const [m, s] of errors) console.log(`  - ${m}${s ? '  @ ' + s : ''}`);
console.log(`real time: ${((realNow() - t0) / 1000).toFixed(1)}s`);
process.exit(errorCount ? 1 : 0);
