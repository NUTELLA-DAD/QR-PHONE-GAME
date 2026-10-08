// Headless bot simulation: runs the REAL host simulation in Node (no browser) with bot crew.
// Usage: node tools/botsim.mjs [--bots 8] [--humans 0] [--minutes 5] [--difficulty normal] [--map network|route|open] [--seed 1] [--help]
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const args = { bots: 8, humans: 0, minutes: 5, difficulty: 'normal', map: null, seed: null, env: null, reapply: 0, build: null, rupture: 0, trace: null, traceEvery: 30 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') {
    console.log('node tools/botsim.mjs [--bots 8] [--humans 0] [--minutes 5] [--difficulty easy|normal|hard] [--map network|route|open] [--env skyisles|frost|ember|fungal|aether|storm|sea] [--seed N] [--reapply N] [--build multi|bags|giantbag] [--rupture SECONDS (several gasbags: shoot the fore bag flat then, S.5d)] [--trace FILE [--trace-every 30] (B0: a per-step dump of the ship, tab separated, for tools/buildsim.mjs --check-frames)]');
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
if (process.env.NO_LINKS) config.LINKS.ENABLED = false; // (compare runs without the linked stations: gun+loader, helm+lookout, boiler surge)
if (!config.DIFFICULTY[args.difficulty]) { console.error('Bad difficulty; use ' + Object.keys(config.DIFFICULTY).join('|')); process.exit(2); }
if (args.map) {
  if (!config.MAPS.KINDS.includes(args.map)) { console.error('Bad map; use ' + config.MAPS.KINDS.join('|')); process.exit(2); }
  config.MAPS.FORCE_KIND = args.map; // set before the sim is created so mission 1 uses it
}
if (args.env) {
  if (!config.ENVIRONMENTS[args.env] || !config.ENVIRONMENTS[args.env].name) { console.error('Bad env; use ' + Object.keys(config.ENVIRONMENTS).filter((k) => config.ENVIRONMENTS[k] && config.ENVIRONMENTS[k].name).join('|')); process.exit(2); }
  config.ENVIRONMENTS.FORCE = args.env; // every mission happens in this environment
}
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
const runStats = args.build ? createRunStats(state) : null; // (--build: the per-run numbers tools/buildsim.mjs reads)
state.difficulty = args.difficulty;

// Same recipe as the "Add 4 bot crew" button in network.js.
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const e = SHIP_LAYOUT.boarderEntryPoints;
for (let i = 0; i < args.bots; i++) {
  const id = 'bot' + Math.random();
  state.players[id] = {
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
let ruptured = false, healedAt = null; // --rupture: the fore bag shot flat at that second (gas 0 and three holes in it); when did the crew get it back above BAG_UP
const missionMins = []; let missionStartStep = 0;
// Steam stats while flying: pressure sum, steps under 35 / over 70 / over 90, blowouts, steps in overdrive.
let pSum = 0, pN = 0, pLow = 0, pOver70 = 0, pOver90 = 0, blowouts = 0, leakSteps = 0, lastPress = state.ship.press;
let sporeCloudSteps = 0, sporedSteps = 0, clogSum = 0, clogMax = 0, engSum = 0, o2Sum = 0, o2Min = 1, lackSteps = 0, gasSum = 0, gasMax = 0, crewSteps = 0, envN = 0, iceG = 0, iceD = 0, iceGun = 0, iceMax = 0, sinkSum = 0, thermalSteps = 0, burnSteps = 0, heatSum = 0, climbSum = 0, climbN = 0, blizSteps = 0, smokeSteps = 0, fireSum = 0, fireMax = 0;
let gapSum = 0, gapMin = 1e9, seaSteps = 0, floodSum = 0, floodHigh = 0, wetSteps = 0, galeSteps = 0;
let lightSteps = 0, lightManned = [0, 0], lightLit = 0, litBonus = 0; // searchlights: flight steps, steps each lamp was manned, steps with something lit
let matesMax = 0;
let contacts = 0, wasScrape = false;
let segSteps = 0, altRef = null, vySum = 0, scrapeSteps = 0;
let distPrev = null, distTravel = 0, flightSteps = 0, altMin = Infinity, altMax = -Infinity, progMax = 0, speedSum = 0, distBack = 0; // S.5e: how far and how fast she got, and how much altitude she covered
const actTally = {};
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
    sim.update(dt);
    if (ruptured && healedAt === null && state.gasHoles.length === 0 && state.bags[state.bags.length - 1].gas > config.GAS.BAG_UP) healedAt = step / 60 - args.rupture;
    if (runStats) runStats.step(dt);
    matesMax = Math.max(matesMax, Object.values(state.players).filter((q) => q.mate).length);
    for (const q of Object.values(state.players)) {
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
  if (state.phase === 'flying') { hullSum += state.ship.hull; hullN++; }
  if (state.phase === 'flying' && !state.ship.down) {
    const dd = distPrev == null ? 0 : state.course.dist - distPrev;
    if (distPrev == null || Math.abs(dd) >= 200) { segSteps = 0; altRef = null; } else distTravel += dd; // (a new mission map or a restart resets the distance: skip that jump and start a new stretch)
    distPrev = state.course.dist;
    flightSteps++; speedSum += state.ship.speed + (state.sailPush || 0); segSteps++;
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
console.log(`average hull: ${hullN ? (hullSum / hullN).toFixed(1) : 'n/a'}`);
console.log(`kills: ${killsTotal}`);
const sum = (k) => tally[k] || 0;
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
if (process.env.BOT_ACT) console.log('bot time: ' + Object.entries(actTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + ((100 * v) / Object.values(actTally).reduce((a, b) => a + b, 0)).toFixed(1) + '%').join(', '));
if (state.bags.length > 1) console.log(`gasbags: ${state.bags.length} bags side by side; a bag went flat ${bagDowns} time${bagDowns === 1 ? '' : 's'}, emptiest ${bagMin.toFixed(0)}; gas valves turned ${state.valveLog || 0}x (shut ${state.valveShuts || 0}x), now ${(state.gasValveOpen || []).filter((o) => !o).length} shut; now ${state.bags.map((b) => b.gas.toFixed(0)).join("/")}${ruptured ? `; fore bag shot flat at ${args.rupture}s: ${healedAt === null ? 'NOT repaired' : `holes patched and bag back above ${config.GAS.BAG_UP} after ${healedAt.toFixed(0)}s`}` : ''}`);
if (args.build || process.env.FLIGHT) console.log(`flight: net speed ${flightSteps ? (distTravel / (flightSteps / 60)).toFixed(0) : 'n/a'} px/s (throttle+sails ${flightSteps ? (speedSum / flightSteps).toFixed(2) : 'n/a'}), altitude moved ${altMin === Infinity ? 'n/a' : Math.round(altMin) + ' to +' + Math.round(altMax)} from where she settled (span ${altMin === Infinity ? 0 : Math.round(altMax - altMin)}), avg climb rate ${flightSteps ? (vySum / flightSteps).toFixed(0) : 'n/a'} px/s, on the rocks ${flightSteps ? ((100 * scrapeSteps) / flightSteps).toFixed(0) : 'n/a'}%, furthest progress ${(progMax * 100).toFixed(0)}%, sails raised ${(state.sailStats && state.sailStats.raised) || 0}x (up ${state.sailStats ? state.sailStats.upSecs.toFixed(0) : 0}s), torn ${(state.sailStats && state.sailStats.torn) || 0}`);
if (runStats) console.log('BUILD_STATS ' + JSON.stringify({ build: args.build, ...runStats.result(), flight: { speed: flightSteps ? distTravel / (flightSteps / 60) : 0, throttle: flightSteps ? speedSum / flightSteps : 0, altMin: altMin === Infinity ? 0 : altMin, altMax: altMax === -Infinity ? 0 : altMax, climb: flightSteps ? vySum / flightSteps : 0, rocks: flightSteps ? scrapeSteps / flightSteps : 0, progress: progMax, sailsRaised: (state.sailStats && state.sailStats.raised) || 0, sailsUpSecs: state.sailStats ? state.sailStats.upSecs : 0, sailsTorn: (state.sailStats && state.sailStats.torn) || 0, tows: state.tows || 0, contacts }, manned: runStats.result().mannedNames, bags: state.bags.length, bagDowns, valveLog: state.valveLog || 0, valveShuts: state.valveShuts || 0, shutAtEnd: (state.gasValveOpen || []).filter((o) => !o).length, ruptured, healedAt, errors: errorCount })); // (read by tools/buildsim.mjs)
console.log(`errors: ${errorCount}`);
for (const [m, s] of errors) console.log(`  - ${m}${s ? '  @ ' + s : ''}`);
console.log(`real time: ${((realNow() - t0) / 1000).toFixed(1)}s`);
process.exit(errorCount ? 1 : 0);
