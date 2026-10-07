// Headless check of the session modes and the daily voyage (QUICK / VOYAGE / EVENING CAMPAIGN).
// Checks: route length and danger per mode, the daily name and seed being the same all day, the saved daily best,
// the lobby choice being remembered, and the campaign's two voyages (harbour, second voyage harder, stop counts).
// Usage: node tools/modes.mjs   (prints PASS or FAIL lines; exit code 1 on any failure)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
const V = await load('modules/host/voyage.js');
const { createSimulation } = await load('modules/host/simulation.js');

let fails = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails++; };

// Route generation per mode.
for (const [id, M] of Object.entries(config.VOYAGE.MODES)) {
  let lens = new Set();
  let maxDanger = 0;
  let ok = true;
  for (let seed = 1; seed <= 40; seed++) {
    const v = V.generateVoyage(seed, { mode: id });
    lens.add(v.columns.length);
    if (v.columns.length < M.stopsMin || v.columns.length > M.stopsMax) ok = false;
    const last = v.columns[v.columns.length - 1][0];
    if (!last.flagship) ok = false;
    for (const c of v.columns) for (const s of c) maxDanger = Math.max(maxDanger, s.danger);
  }
  check(ok && maxDanger <= 3, `${id}: ${[...lens].sort().join('/')} stops, every route ends at the Flagship, danger never above 3 (max ${maxDanger})`);
}
const v2 = V.generateVoyage(5, { mode: 'campaign', voyageNo: 2 });
check(v2.columns[0][0].harbour && !v2.columns[1][0].harbour && v2.columns[v2.columns.length - 1][0].danger === 3 + config.VOYAGE.SECOND.DANGER_BONUS, 'second voyage starts at a harbour and ends at a harder Flagship');

// Daily voyage.
const d1 = V.dailyVoyage(new Date(2026, 9, 7, 9));
const d2 = V.dailyVoyage(new Date(2026, 9, 7, 23));
const d3 = V.dailyVoyage(new Date(2026, 9, 8, 9));
check(d1.name === d2.name && d1.seed === d2.seed, `same day, same name and seed ("${d1.name}")`);
check(d1.seed !== d3.seed, `next day differs ("${d3.name}")`);
const names = new Set();
for (let k = 0; k < 60; k++) names.add(V.dailyVoyage(new Date(2026, 0, 1 + k)).name);
check(names.size > 40, `names vary across days (${names.size} different in 60 days)`);
check(JSON.stringify(V.generateVoyage(d1.seed, { mode: 'voyage' })) === JSON.stringify(V.generateVoyage(d2.seed, { mode: 'voyage' })), 'the daily route map is identical');

// Save: tolerant of old and broken saves; best-of rules.
store.set('airshipVoyage', JSON.stringify({ bestStops: 3, daily: 'junk' }));
let sv = V.loadVoyageSave();
check(sv.bestStops === 3 && sv.daily === null && Array.isArray(sv.unlocks) && sv.version === 2, 'an old/odd save loads with defaults filled in');
store.set('airshipVoyage', '{not json');
check(V.loadVoyageSave().totalRuns === 0, 'a corrupt save falls back to a blank one');
sv = V.loadVoyageSave();
check(V.recordDaily(sv, '2026-10-07', 'quick', { stops: 2, victory: false, salvage: 50 }) === true, 'first daily result is a best');
check(V.recordDaily(sv, '2026-10-07', 'quick', { stops: 1, victory: false, salvage: 500 }) === false, 'fewer stops is not a new best');
check(V.recordDaily(sv, '2026-10-07', 'quick', { stops: 4, victory: true, salvage: 10 }) === true && V.dailyBest(sv, '2026-10-07', 'quick').victory, 'a victory beats everything');
check(V.dailyBest(sv, '2026-10-08', 'quick') === null && V.dailyBest(sv, '2026-10-07', 'voyage') === null, "another day or mode has no best yet");

// The lobby choice is remembered.
store.clear();
let sim = createSimulation();
check(sim.state.mode === 'voyage' && !sim.state.daily, 'default is VOYAGE, daily off');
sim.setSession('quick', true);
sim = createSimulation();
check(sim.state.mode === 'quick' && sim.state.daily === true, 'mode and daily are remembered');
check(sim.state.run.voyage.columns.length === 4 && sim.state.run.daily.name === V.dailyVoyage().name, 'a new game starts with that mode and the daily route');
sim.setSession('campaign', false);
sim.castOff(); // (the route is made again for the choice made in the lobby)
check(sim.state.run.mode === 'campaign' && !sim.state.run.daily && sim.state.run.voyages === 2, 'CAST OFF uses what the lobby picked');

// The Evening Campaign end to end (daily, so the saved best is checked too).
store.clear();
sim = createSimulation();
sim.setSession('campaign', true);
sim.castOff();
const { state } = sim;
const run = state.run;
const dt = 1 / 30;
const finishStop = () => { // pretend the Flagship has just fallen and the ship is home
  const cols = run.voyage.columns;
  run.stopId = cols[cols.length - 1][0].id;
  sim.onMarker({ kind: 'home', lap: 9 });
  for (let i = 0; i < 30 * 12 && state.scorecard; i++) sim.update(dt);
};
const n1 = run.voyage.columns.length;
finishStop();
check(run.voyageNo === 2 && run.voyage.columns[0][0].harbour && run.stopId === '0.0', 'first Flagship down: the second voyage starts at the harbour');
check(state.vote && (state.vote.kind === 'dock' || state.vote.kind === 'route') && !state.runEnd, 'the crew docks (shop or route vote) and the run is not over');
check(run.base === n1 - 1, `stop numbering carries on (base ${run.base})`);
const n2 = run.voyage.columns.length;
finishStop();
const e = state.runEnd;
check(e && e.victory && e.done === run.base + n2 && e.total === run.base + n2, `victory after both voyages: ${e && e.done} of ${e && e.total} stops`);
check(e && e.daily && e.dailyBest === true, 'the daily best was recorded');
check(V.dailyBest(state.save, V.dailyVoyage().key, 'campaign').victory === true, "today's best is in the save");
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
