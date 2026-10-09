// Versus bot-captain report: how lively and how fair the bot captains are, round by round (the "before and after" numbers of the PvP bot work).
//   node tools/pvp-stats.mjs [--matches 6] [--bots 5] [--seed 2000] [--cap 300] [--quiet 1] [--red classic] [--blue classic] [--style sniper]
//   (--red / --blue = a shelf ship id: classic, twin, bags, var0.., sniper, brawler, ram; --style forces every captain's style. The SPACE AND RANGE lines at the end: distance, time in each band, the weapons.)
// The classic ship against herself, bot crews, best of three N times (seeded). Per round it reports: seconds, winner and cause, boardings tried / made, rams (hull-on-hull bumps),
// COME ABOUTs, the share of shells that were flying at a hull and missed (dodged), the altitude range each ship flew over, and the captains' own counters if there are any.
// Printed at the end as means; the red / blue split is the fairness number (the gate is `--check-match --mirror N`, 35-65%).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const sflag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const matches = flag('matches', 6), nBots = flag('bots', 5), seed0 = flag('seed', 2000), cap = flag('cap', 300), quiet = flag('quiet', 0);

installShims();
const clock = seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const T = await load('modules/host/pose.js');
const { buildShelf } = await load('modules/host/pvp/shelf.js');
const redId = sflag('red', 'classic'), blueId = sflag('blue', 'classic'), styleArg = sflag('style', '');
for (let i = 0; i < argv.length; i++) { // --set GUN_TYPES.long.MUL=3  (any number in config.js, for tuning runs; repeat the flag)
  if (argv[i] !== '--set') continue;
  const [path_, val] = argv[i + 1].split('=');
  const keys = path_.split('.');
  let o = config;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = Number(val);
}
if (styleArg) config.PVP.BOT.STYLE = styleArg; // (every captain flies this style: sniper, brawler, boarder, daredevil)

const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim) => {
  clock.ms += DT * 1000;
  try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
};
config.PVP.ROUND_TIME = cap;
if (flag('weave', 1) === 0) config.PVP.BOT.WEAVE = false; // the old steady captains (raids stay on)
if (flag('raids', 1) === 0) config.PVP.BOT.RAID.CHANCE_PER_MIN = 0;
if (flag('edge', -1) >= 0) config.PVP.ALT_EDGE = flag('edge', -1);
if (flag('raid', 0)) config.PVP.BOT.RAID.CHANCE_PER_MIN = flag('raid', 0);
if (flag('grap', 0)) config.PVP.BOT.RAID.GRAPPLE = flag('grap', 0);
if (flag('pass', 1) === 0) config.PVP.BOT.PASS.RATE = 0;
if (flag('dodge', 1) === 0) config.PVP.BOT.DODGE.ALT = 0;
if (flag('shell', 0)) config.PVP.SHELL_POWER = flag('shell', 0);

// The space-and-range numbers of one round (both sides added): the fight's mean distance, seconds in each band, the weapons by kind.
const KEYS = ['secs', 'distSum', 'bandShort', 'bandMid', 'bandLong', 'bandFar', 'longShots', 'longHits', 'mortarShots', 'mortarHits', 'scatterShots', 'scatterHits', 'flakBursts', 'minesLaid', 'mineHits', 'mineShot', 'rams', 'ramRuns', 'ramDmg', 'harpoons', 'harpoonHits', 'stormSecs'];
function rangeRow(res) {
  const o = {};
  for (const k of KEYS) o[k] = (res.stats.red[k] || 0) + (res.stats.blue[k] || 0);
  o.secs = res.stats.red.secs || 0; o.distSum = res.stats.red.distSum || 0; o.bandShort = res.stats.red.bandShort || 0; o.bandMid = res.stats.red.bandMid || 0; o.bandLong = res.stats.red.bandLong || 0; o.bandFar = res.stats.red.bandFar || 0; // (these are the same for both sides)
  return o;
}
const rows = [];
const won = { red: 0, blue: 0 }, left = { won: 0, of: 0 };
for (let m = 0; m < matches; m++) {
  seedRandom(seed0 + m);
  const sim = createSimulation();
  sim.setSession('versus');
  const M = sim.match, st = sim.state;
  M.addBots('red', nBots);
  M.addBots('blue', nBots);
  if (redId !== 'classic' || blueId !== 'classic') { M.shelf = buildShelf(); const ix = (id) => M.shelf.findIndex((e) => e.id === id); M.applyPicks({ red: Math.max(0, ix(redId)), blue: Math.max(0, ix(blueId)) }); }
  M.begin({ shelf: false });
  const [red, blue] = st.ships;
  const ships = { red, blue };
  // ---- shell watching: a shell seen for the first time is "aimed" if its straight flight meets the target hull while that ship keeps her course; it is a hit if life is zeroed beside an impact
  let stepNo = 0, lastImpact = -1;
  for (const sh of st.ships) {
    const imp = sh.sim.impact;
    sh.sim.impact = (...a) => { lastImpact = stepNo; return imp(...a); };
  }
  const watched = new WeakSet();
  let aimed = { red: 0, blue: 0 }, hitAimed = { red: 0, blue: 0 }; // by TARGET team
  const watch = (shell) => {
    watched.add(shell);
    const from = st.ships.find((s) => s.id === shell.from);
    const tgt = st.ships.find((s) => s !== from && s.team);
    if (!tgt || !from) return;
    let pred = false;
    for (let t = 0; t <= Math.max(0, shell.life) + 0.02 && !pred; t += 1 / 30) {
      const wx = shell.x + shell.vx * t - tgt.pose.vx * t, wy = shell.y + shell.vy * t - tgt.pose.vy * t;
      if (tgt.sim.hitsShip(T.toShipX(tgt, wx), T.toShipY(tgt, wy))) pred = true;
    }
    if (!pred) return;
    const team = tgt.team.id;
    aimed[team]++;
    let life = shell.life;
    Object.defineProperty(shell, 'life', { get: () => life, set: (v) => { if (v === 0 && lastImpact === stepNo) hitAimed[team]++; life = v; }, enumerable: true, configurable: true });
  };
  // ---- per round bookkeeping
  let r = null;
  const newRound = () => ({ alt: { red: [1e9, -1e9], blue: [1e9, -1e9] }, turns: 0, lastTurn: { red: 0, blue: 0 }, aimed0: { ...aimed }, hit0: { ...hitAimed }, logN: new Set(st.stuntLog || []), vyFlips: 0, lastVy: { red: 0, blue: 0 }, ys: { red: [], blue: [] } });
  let lastPhase = '', nResults = 0, steps = 0;
  const maxSteps = 60 * (cap + 40) * 5 * 2;
  while (M.phase !== 'over' && steps++ < maxSteps) {
    step(sim);
    stepNo++;
    if (M.phase === 'fight' && lastPhase !== 'fight') r = newRound();
    lastPhase = M.phase;
    if (M.phase === 'fight' && r) {
      for (const sh of st.shells) if (!watched.has(sh)) watch(sh);
      for (const t of ['red', 'blue']) {
        const s = ships[t];
        const y = T.toWorldY(s, s.layout.aimPoint.y);
        r.alt[t][0] = Math.min(r.alt[t][0], y); r.alt[t][1] = Math.max(r.alt[t][1], y);
        r.ys[t].push(y);
        if (s.pose.turn > 0 && !r.lastTurn[t]) r.turns++;
        r.lastTurn[t] = s.pose.turn > 0 ? 1 : 0;
        const vy = s.pose.vy;
        if (Math.abs(vy) > 40 && Math.sign(vy) !== r.lastVy[t] && r.lastVy[t] !== 0) r.vyFlips++;
        if (Math.abs(vy) > 40) r.lastVy[t] = Math.sign(vy);
      }
    }
    if (M.results.length > nResults) {
      const res = M.results[M.results.length - 1];
      nResults = M.results.length;
      const log = (st.stuntLog || []).filter((e) => !r.logN.has(e));
      const tried = log.filter((e) => /^start (board|drop)/.test(e.text)).length;
      const sd = (a) => { const mu = a.reduce((x, y) => x + y, 0) / Math.max(1, a.length); return Math.sqrt(a.reduce((x, y) => x + (y - mu) ** 2, 0) / Math.max(1, a.length)); };
      const capStats = {};
      for (const t of ['red', 'blue']) { const c = ships[t].captain; if (c && c.stats) for (const [k, v] of Object.entries(c.stats)) capStats[k] = (capStats[k] || 0) + v; }
      const a = aimed.red + aimed.blue - r.aimed0.red - r.aimed0.blue, h = hitAimed.red + hitAimed.blue - r.hit0.red - r.hit0.blue;
      const row = {
        m, round: res.round, hullR: res.hull.red, hullB: res.hull.blue, time: res.time, winner: res.winner, cause: res.cause,
        tried, made: res.stats.red.boardings + res.stats.blue.boardings, bumps: res.stats.red.bumps,
        turns: r.turns, aimed: a, dodged: a ? 100 * (1 - h / a) : null,
        altRange: (r.alt.red[1] - r.alt.red[0] + r.alt.blue[1] - r.alt.blue[0]) / 2, altSd: (sd(r.ys.red) + sd(r.ys.blue)) / 2, vyFlips: r.vyFlips,
        dmgPerHit: (res.stats.red.dmg + res.stats.blue.dmg) / Math.max(1, res.stats.red.hits + res.stats.blue.hits), shots: res.stats.red.shots + res.stats.blue.shots, hitsPerShot: (res.stats.red.hits + res.stats.blue.hits) / Math.max(1, res.stats.red.shots + res.stats.blue.shots),
        sab: res.stats.red.sabotage + res.stats.blue.sabotage, caps: res.stats.red.captures + res.stats.blue.captures,
        cap: capStats, rng: rangeRow(res),
      };
      rows.push(row);
      if (row.winner) { won[row.winner]++; left.of++; if (row.winner === res.left) left.won++; }
      if (!quiet) console.log(`  m${m} r${row.round}: ${row.time.toFixed(0)}s hulls ${row.hullR.toFixed(0)}/${row.hullB.toFixed(0)} ${row.winner || 'draw'}/${row.cause} board ${row.made}/${row.tried} bumps ${row.bumps} turns ${row.turns} dodged ${row.dodged == null ? '-' : row.dodged.toFixed(0) + '%'} (${row.aimed} aimed) alt ${row.altRange.toFixed(0)} sd ${row.altSd.toFixed(0)} flips ${row.vyFlips} sab ${row.sab} ${Object.keys(row.cap).length ? JSON.stringify(row.cap) : ''}`);
    }
  }
}
const mean = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0) / Math.max(1, rows.length);
const capKeys = [...new Set(rows.flatMap((r) => Object.keys(r.cap)))];
const dodgedRows = rows.filter((r) => r.dodged != null);
const decided = won.red + won.blue;
console.log(`PVP STATS: ${matches} matches, ${rows.length} rounds, errors ${errors}${firstErrors.length ? ' ' + firstErrors.join(' || ') : ''}`);
console.log(`  mean fight ${mean('time').toFixed(0)} s (min ${Math.min(...rows.map((r) => r.time)).toFixed(0)}, max ${Math.max(...rows.map((r) => r.time)).toFixed(0)}); red ${won.red} blue ${won.blue} (${(100 * won.red / Math.max(1, decided)).toFixed(0)}% red, the left-hand ship won ${left.won} of ${left.of} = ${(100 * left.won / Math.max(1, left.of)).toFixed(0)}%); causes ${JSON.stringify(rows.reduce((o, r) => ((o[r.cause] = (o[r.cause] || 0) + 1), o), {}))}`);
console.log(`  per round: boardings made ${mean('made').toFixed(2)} / tried ${mean('tried').toFixed(2)}, bumps ${mean('bumps').toFixed(2)}, come abouts ${mean('turns').toFixed(2)}, shells dodged ${(dodgedRows.reduce((a, r) => a + r.dodged, 0) / Math.max(1, dodgedRows.length)).toFixed(0)}% of ${mean('aimed').toFixed(0)} aimed, altitude range ${mean('altRange').toFixed(0)} px (sd ${mean('altSd').toFixed(0)}), climb/dive reversals ${mean('vyFlips').toFixed(1)}, hits per shot ${(100 * mean('hitsPerShot')).toFixed(0)}% (${mean('shots').toFixed(0)} shots, ${mean('dmgPerHit').toFixed(3)} hull per hit), sabotage ${mean('sab').toFixed(2)}, helms taken ${mean('caps').toFixed(2)}`);
if (capKeys.length) console.log('  captain counters per round: ' + capKeys.map((k) => `${k} ${mean2(k).toFixed(2)}`).join(', '));
function mean2(k) { return rows.reduce((a, r) => a + (r.cap[k] || 0), 0) / Math.max(1, rows.length); }
{
  const sum = (k) => rows.reduce((a, r) => a + (r.rng[k] || 0), 0);
  const pct = (a, b) => (b ? (100 * a / b).toFixed(0) + '%' : '-');
  const secs = Math.max(1, sum('secs'));
  console.log(`  SPACE AND RANGE (${redId} red against ${blueId} blue${styleArg ? ', every captain a ' + styleArg : ''}): mean distance ${(sum('distSum') / secs).toFixed(0)} px (${(sum('distSum') / secs / config.PVP.RANGE.PX_PER_M).toFixed(0)} m); time in the bands: short ${pct(sum('bandShort'), secs)}, mid ${pct(sum('bandMid'), secs)}, long ${pct(sum('bandLong'), secs)}, far ${pct(sum('bandFar'), secs)}`);
  console.log(`  weapons per round: long gun ${(sum('longShots') / rows.length).toFixed(1)} shells, ${pct(sum('longHits'), sum('longShots'))} hit; mortar ${(sum('mortarShots') / rows.length).toFixed(1)} shells, ${pct(sum('mortarHits'), sum('mortarShots'))} hit; grapeshot ${(sum('scatterShots') / rows.length).toFixed(1)} volleys, ${(sum('scatterHits') / Math.max(1, sum('scatterShots'))).toFixed(1)} pellets each; flak bursts ${(sum('flakBursts') / rows.length).toFixed(2)}; mines laid ${(sum('minesLaid') / rows.length).toFixed(1)}, hit ${(sum('mineHits') / rows.length).toFixed(2)}, shot ${(sum('mineShot') / rows.length).toFixed(2)}; rams ${(sum('rams') / rows.length).toFixed(2)} (ram runs ${(sum('ramRuns') / rows.length).toFixed(2)}); harpoons ${(sum('harpoons') / rows.length).toFixed(2)} fired, ${(sum('harpoonHits') / rows.length).toFixed(2)} latched; storm seconds ${(sum('stormSecs') / rows.length).toFixed(1)}`);
}
process.exit(errors ? 1 : 0);
