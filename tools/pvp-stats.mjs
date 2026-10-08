// Versus bot-captain report: how lively and how fair the bot captains are, round by round (the "before and after" numbers of the PvP bot work).
//   node tools/pvp-stats.mjs [--matches 6] [--bots 5] [--seed 2000] [--cap 300] [--quiet 1]
// The classic ship against herself, bot crews, best of three N times (seeded). Per round it reports: seconds, winner and cause, boardings tried / made, rams (hull-on-hull bumps),
// COME ABOUTs, the share of shells that were flying at a hull and missed (dodged), the altitude range each ship flew over, and the captains' own counters if there are any.
// Printed at the end as means; the red / blue split is the fairness number (the gate is `--check-match --mirror N`, 35-65%).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const matches = flag('matches', 6), nBots = flag('bots', 5), seed0 = flag('seed', 2000), cap = flag('cap', 300), quiet = flag('quiet', 0);

installShims();
const clock = seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const T = await load('modules/host/pose.js');

const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim) => {
  clock.ms += DT * 1000;
  try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
};
config.PVP.ROUND_TIME = cap;

const rows = [];
const won = { red: 0, blue: 0 };
for (let m = 0; m < matches; m++) {
  seedRandom(seed0 + m);
  const sim = createSimulation();
  sim.setSession('versus');
  const M = sim.match, st = sim.state;
  M.addBots('red', nBots);
  M.addBots('blue', nBots);
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
        m, round: res.round, time: res.time, winner: res.winner, cause: res.cause,
        tried, made: res.stats.red.boardings + res.stats.blue.boardings, bumps: res.stats.red.bumps,
        turns: r.turns, aimed: a, dodged: a ? 100 * (1 - h / a) : null,
        altRange: (r.alt.red[1] - r.alt.red[0] + r.alt.blue[1] - r.alt.blue[0]) / 2, altSd: (sd(r.ys.red) + sd(r.ys.blue)) / 2, vyFlips: r.vyFlips,
        hitsPerShot: (res.stats.red.hits + res.stats.blue.hits) / Math.max(1, res.stats.red.shots + res.stats.blue.shots),
        sab: res.stats.red.sabotage + res.stats.blue.sabotage, caps: res.stats.red.captures + res.stats.blue.captures,
        cap: capStats,
      };
      rows.push(row);
      if (row.winner) won[row.winner]++;
      if (!quiet) console.log(`  m${m} r${row.round}: ${row.time.toFixed(0)}s ${row.winner || 'draw'}/${row.cause} board ${row.made}/${row.tried} bumps ${row.bumps} turns ${row.turns} dodged ${row.dodged == null ? '-' : row.dodged.toFixed(0) + '%'} (${row.aimed} aimed) alt ${row.altRange.toFixed(0)} sd ${row.altSd.toFixed(0)} flips ${row.vyFlips} sab ${row.sab} ${Object.keys(row.cap).length ? JSON.stringify(row.cap) : ''}`);
    }
  }
}
const mean = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0) / Math.max(1, rows.length);
const capKeys = [...new Set(rows.flatMap((r) => Object.keys(r.cap)))];
const dodgedRows = rows.filter((r) => r.dodged != null);
const decided = won.red + won.blue;
console.log(`PVP STATS: ${matches} matches, ${rows.length} rounds, errors ${errors}${firstErrors.length ? ' ' + firstErrors.join(' || ') : ''}`);
console.log(`  mean fight ${mean('time').toFixed(0)} s (min ${Math.min(...rows.map((r) => r.time)).toFixed(0)}, max ${Math.max(...rows.map((r) => r.time)).toFixed(0)}); red ${won.red} blue ${won.blue} (${(100 * won.red / Math.max(1, decided)).toFixed(0)}% red); causes ${JSON.stringify(rows.reduce((o, r) => ((o[r.cause] = (o[r.cause] || 0) + 1), o), {}))}`);
console.log(`  per round: boardings made ${mean('made').toFixed(2)} / tried ${mean('tried').toFixed(2)}, bumps ${mean('bumps').toFixed(2)}, come abouts ${mean('turns').toFixed(2)}, shells dodged ${(dodgedRows.reduce((a, r) => a + r.dodged, 0) / Math.max(1, dodgedRows.length)).toFixed(0)}% of ${mean('aimed').toFixed(0)} aimed, altitude range ${mean('altRange').toFixed(0)} px (sd ${mean('altSd').toFixed(0)}), climb/dive reversals ${mean('vyFlips').toFixed(1)}, hits per shot ${(100 * mean('hitsPerShot')).toFixed(0)}%, sabotage ${mean('sab').toFixed(2)}, helms taken ${mean('caps').toFixed(2)}`);
if (capKeys.length) console.log('  captain counters per round: ' + capKeys.map((k) => `${k} ${mean2(k).toFixed(2)}`).join(', '));
function mean2(k) { return rows.reduce((a, r) => a + (r.cap[k] || 0), 0) / Math.max(1, rows.length); }
process.exit(errors ? 1 : 0);
