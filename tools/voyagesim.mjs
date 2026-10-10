// Full-voyage bot simulation. Plays whole voyages (8 stops) with bot crew and reports how far each got and why it died.
//  --mode quick|voyage|campaign: the session-length mode (config.VOYAGE.MODES); --daily flies today's daily voyage. The table shows median minutes and victory rate.
//  --build sparrow|classic: start the voyage with that ship and the Shipwright's Yard (part cards at the sky-docks, the bots vote for them): the table adds the parts bought by the Flagship. Default: no start build (the classic ship, the old shop).
// Usage: node tools/voyagesim.mjs [--runs 10] [--difficulty normal] [--mode voyage] [--bots 8] [--humans 0] [--topup] [--maxmin 45] [--stall 8] [--seed 1] [--verbose]
//  natural mode (default): the run ends on a wreck or victory; the cause of the wreck is reported.
//  --topup: the hull is kept full so the run cannot end; reports STALLS (no stop reached for --stall minutes).
//  --runs N > 1 launches N child processes (seeds seed..seed+N-1, 12 at a time) and prints a table.
//  --humans N: the first N bots stand in for human players (flag { human: true }); with N <= 3 on easy/normal and no other bots, ship's mates come aboard.
//    e.g. 2 humans: --bots 2 --humans 2
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = { runs: 1, difficulty: 'normal', mode: 'voyage', daily: false, bots: 8, humans: 0, topup: false, maxmin: 45, seed: 1, verbose: false, child: false, trace: 0, dump: 0, stall: 8, set: '', build: '' };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log('node tools/voyagesim.mjs [--runs 10] [--difficulty easy|normal|hard] [--mode quick|voyage|campaign] [--daily] [--bots 8] [--humans 0] [--topup] [--maxmin 45] [--stall 8] [--seed 1] [--verbose] [--build sparrow|classic] [--set "CREW_SCALE.TABLE.4.fire=0.5;DIFFICULTY.normal.damage=0.2"]'); process.exit(0); }
  else if (a === '--topup' || a === '--verbose' || a === '--child' || a === '--daily') args[a.slice(2)] = true;
  else if (a.startsWith('--') && a.slice(2) in args) { const v = argv[++i]; args[a.slice(2)] = typeof args[a.slice(2)] === 'number' ? Number(v) : v; }
  else { console.error('Unknown option ' + a); process.exit(2); }
}

if (args.runs > 1 && !args.child) {
  const me = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const rows = [];
  const seeds = [];
  for (let i = 0; i < args.runs; i++) seeds.push(args.seed + i);
  const runOne = (seed) => new Promise((res) => {
    const a = [me, '--child', '--seed', String(seed), '--difficulty', args.difficulty, '--mode', args.mode, '--bots', String(args.bots), '--humans', String(args.humans), '--maxmin', String(args.maxmin), '--stall', String(args.stall), '--set', args.set, '--build', args.build];
    if (args.topup) a.push('--topup');
    if (args.daily) a.push('--daily');
    const c = spawn(process.execPath, a);
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => { const l = out.split('\n').find((x) => x.startsWith('RESULT ')); res(l ? JSON.parse(l.slice(7)) : { seed, error: out.slice(-300) }); });
  });
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => { while (next < seeds.length) { const s = seeds[next++]; rows.push(await runOne(s)); } }));
  rows.sort((a, b) => a.seed - b.seed);
  console.log(`--- voyagesim ${args.topup ? 'TOP-UP' : 'NATURAL'} ${args.mode}${args.daily ? ' (daily)' : ''} ${args.difficulty}, ${args.bots} bots (${args.humans} as humans), ${args.runs} runs ---`);
  for (const r of rows) {
    if (r.error) { console.log(`seed ${r.seed}: ERROR ${r.error}`); continue; }
    console.log(`seed ${String(r.seed).padStart(3)}: stops ${r.done}/${r.total} ${r.victory ? 'VICTORY' : r.timeout ? 'TIMEOUT' : 'wreck'} ${(r.minutes || 0).toFixed(1)}min${args.topup ? ` stalls ${r.stalls} [${(r.stallInfo || []).join("; ")}]` : ""} | ${r.cause}`);
  }
  const ok = rows.filter((r) => !r.error);
  const ds = ok.map((r) => r.done).sort((a, b) => a - b);
  const med = ds.length ? (ds[(ds.length - 1) >> 1] + ds[ds.length >> 1]) / 2 : 0;
  const mins = ok.map((r) => r.minutes || 0).sort((a, b) => a - b);
  const medMin = mins.length ? (mins[(mins.length - 1) >> 1] + mins[mins.length >> 1]) / 2 : 0;
  const vm = ok.filter((r) => r.victory).map((r) => r.minutes).sort((a, b) => a - b);
  const medVic = vm.length ? (vm[(vm.length - 1) >> 1] + vm[vm.length >> 1]) / 2 : 0;
  console.log(`MODE ${args.mode}: median ${medMin.toFixed(1)} min (victories only: ${medVic.toFixed(1)}; range ${(mins[0] || 0).toFixed(1)}-${(mins[mins.length - 1] || 0).toFixed(1)}), victory rate ${ok.filter((r) => r.victory).length}/${ok.length}`);
  console.log(`median stops ${med}, mean ${(ds.reduce((a, b) => a + b, 0) / (ds.length || 1)).toFixed(1)}, victories ${ok.filter((r) => r.victory).length}/${ok.length}, timeouts ${ok.filter((r) => r.timeout).length}${args.topup ? `, runs with stalls ${ok.filter((r) => r.stalls).length}` : ''}, errors ${ok.reduce((a, r) => a + (r.errors || 0), 0)}`);
  { const m = ok.map((r) => r.mates || {}); const jobs = {}; for (const x of m) for (const [k, v] of Object.entries(x.jobs || {})) jobs[k] = (jobs[k] || 0) + v; const tot = Object.values(jobs).reduce((a, b) => a + b, 0) || 1; console.log(`ship's mates: max aboard ${Math.max(0, ...m.map((x) => x.max || 0))}, station snapshots ${m.reduce((a, x) => a + (x.locks || 0), 0)}, in awards ${m.filter((x) => x.inAwards).length} runs; mate time: ${Object.entries(jobs).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round((100 * v) / tot) + '%').join(', ') || 'n/a'}`); }
  { const L = ok.map((r) => r.lairs || { planned: 0, met: 0, won: 0, how: {} }), how = {}; for (const l of L) for (const [k, v] of Object.entries(l.how || {})) how[k] = (how[k] || 0) + v; console.log(`kraken lairs: ${L.reduce((a, l) => a + l.planned, 0)} on the routes of ${ok.length} voyages, ${L.reduce((a, l) => a + l.met, 0)} met, ${L.reduce((a, l) => a + l.won, 0)} won (${Object.entries(how).map(([k, v]) => k + ' ' + v).join(', ') || 'none'})`); }
  { const n = ok.reduce((a, r) => a + (r.breaks || 0), 0); if (n) console.log(`parts broke off ${n} time(s) in ${ok.filter((r) => r.breaks).length} of ${ok.length} voyages: ${[...new Set(ok.flatMap((r) => r.breakCauses || []))].join(', ')}`); }
  const causes = {};
  for (const r of ok) for (const k of r.flags || []) causes[k] = (causes[k] || 0) + 1;
  if (args.build) { console.log('salvage earned per run: ' + ok.map((r) => r.earned).join(', ')); const pc = ok.map((r) => (r.parts || []).length); const win = ok.filter((r) => r.victory).map((r) => (r.parts || []).length); const all = {}; for (const r of ok) for (const id of r.parts || []) all[id] = (all[id] || 0) + 1; console.log(`parts bought by the end (start ship ${args.build}): mean ${(pc.reduce((a, b) => a + b, 0) / (pc.length || 1)).toFixed(1)}, victories only ${(win.reduce((a, b) => a + b, 0) / (win.length || 1)).toFixed(1)}; which: ${Object.entries(all).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '=' + v).join(', ')}`); }
  console.log('wreck flags: ' + Object.entries(causes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', '));
  process.exit(0);
}

globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
{
  let s = args.seed >>> 0;
  Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Date.now = () => 1700000000000 + args.seed;
}
const realNow = performance.now.bind(performance);
let simClock = 0;
performance.now = () => simClock;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
if (process.env.NO_BREAKOFF) config.BREAKOFF.ENABLED = false; // (compare voyages with parts never breaking off: S.5i)
if (process.env.NO_LAIRS) config.CREATURES.LAIR.COUNT = { short: 0, long: 0 }; // (compare voyages with no Kraken lair on the route: C.3)
// --set "A.B.C=value;...": tweak config numbers for tuning runs
for (const kv of args.set.split(';').filter(Boolean)) { const [k, v] = kv.split('='); const ks = k.split('.'); let o = config; for (const x of ks.slice(0, -1)) o = o[x] ??= {}; o[ks[ks.length - 1]] = Number(v); }
const { SHIP_LAYOUT, kindOf } = await load('shipLayout.js');
const { damageMul } = await load('modules/host/crewscale.js');
const { createSimulation } = await load('modules/host/simulation.js');
const maps = await load("modules/host/maps.js");
const course = await load("modules/host/course.js");
const sim = createSimulation();
const state = sim.state;
state.difficulty = args.difficulty;
sim.setSession(args.mode, args.daily);
if (args.build) { // (--build sparrow | classic | a .json / .mjs / fixture name: any parts list is registered as BUILDS.custom and used as the start ship)
  const { BUILDS } = await load('modules/host/shipBuild.js');
  if (!BUILDS[args.build]) {
    const { loadBuild } = await import(pathToFileURL(path.join(root, '..', 'tools', 'buildload.mjs')).href);
    BUILDS.custom = await loadBuild(args.build, BUILDS);
    args.build = 'custom';
  }
  sim.setStartBuild(args.build);
}
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const e = SHIP_LAYOUT.boarderEntryPoints;
for (let i = 0; i < args.bots; i++) {
  const id = 'bot' + Math.random();
  state.players[id] = { id, bot: true, human: i < args.humans, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[(Math.random() * colors.length) | 0], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
}
sim.castOff();

const dt = 1 / 60;
const maxSteps = Math.round(args.maxmin * 3600);
let errorCount = 0;
let lastCol = 0, lastProgress = 0, stalls = 0, stalled = false;
let snapshot = null;
const rolling = { helmEmpty: 0, flying: 0, br: 0, fires: 0, gh: 0, crew: {}, n: 0 };
const snap = () => {
  const players = Object.values(state.players);
  const helmMan = players.find((q) => kindOf(q.lock) === 'helm');
  const helmMod = (state.modules || []).find((m) => m.kind === 'helm');
  const broken = (state.modules || []).filter((m) => m.broken).map((m) => m.name);
  return {
    stop: state.run ? state.run.stopId : null, mk: state.course && state.course.map ? state.course.map.kind + (state.course.map.open ? ':' + state.course.map.outposts.filter((o) => o.done).length + '/' + state.course.map.outposts.length : '') + ' spd ' + state.ship.speed.toFixed(2) : null,
    env: state.env && state.env.id,
    helmManned: !!helmMan, helmBroken: !!(helmMod && helmMod.broken),
    koCount: players.filter((q) => q.ko > 0).length,
    gas: Math.round(state.ship.gas), holes: (state.gasHoles || []).length, breaches: state.breaches.length,
    press: Math.round(state.ship.press), fuel: Math.round(state.ship.fuel), leaks: +(((state.steamParts && state.steamParts.leaks) || 0)).toFixed(1),
    boarders: state.boarders.length, fires: state.fires.length, broken, alt: Math.round(state.ship.alt),
    flood: state.sea ? +state.sea.flood.toFixed(2) : 0,
    clog: Math.max(0, ...(state.clogs || []).map((c) => c.lvl)).toFixed(2), o2: state.env && state.env.o2 != null ? +state.env.o2.toFixed(2) : null,
  };
};
const stallInfo = [];
const mateStat = { snaps: 0, jobs: {}, locks: 0, max: 0 }; // ship's mates seen in the snapshots: what they were doing, and whether any ever held a station
const mateInfo = () => ({ max: mateStat.max, locks: mateStat.locks, jobs: mateStat.jobs, inAwards: Object.values(state.run.crew).some((c) => c.name === "Mate") || ((state.runEnd && state.runEnd.rows) || []).some((r) => r.name === "Mate") });
const dmg = { fire: 0, breach: 0, direct: 0 }; // hull points lost to fires, hull holes and everything else
let result = null;
const lairs = { seen: new Set(), won: new Set(), met: 0, how: {} };
for (let step = 1; step <= maxSteps && !result; step++) {
  try {
    simClock += dt * 1000;
    if (args.topup && state.phase === 'flying' && !state.ship.down) state.ship.hull = 100;
    // remember the recent past so we can describe the build-up to a wreck
    if (state.phase === 'flying' && !state.ship.down && step % 30 === 0) { snapshot = snap(); rolling.flying++; rolling.br += snapshot.breaches; rolling.fires += snapshot.fires; rolling.gh += snapshot.holes; for (const q of Object.values(state.players)) { if (q.mate) { mateStat.snaps++; const mk = q.ko > 0 ? "ko" : q.botJob ? q.botJob.kind : "idle"; mateStat.jobs[mk] = (mateStat.jobs[mk] || 0) + 1; if (q.lock) mateStat.locks++; continue; } const k = q.ko > 0 ? "ko" : q.lock ? "station" : q.botJob ? (["fire", "patch", "repair", "swat", "valve", "ice", "unclog", "oxygen", "vent", "coal", "ammo", "revive"].includes(q.botJob.kind) ? "chore" : q.botJob.kind === "fight" ? "fight" : "other") : "idle"; rolling.crew[k] = (rolling.crew[k] || 0) + 1; rolling.n++; } if (!snapshot.helmManned) rolling.helmEmpty++; }
    const h0 = state.ship.hull, nf = state.fires.length, nb = state.breaches.length, fl = state.phase === 'flying' && !state.ship.down;
    sim.update(dt);
    mateStat.max = Math.max(mateStat.max, Object.values(state.players).filter((q) => q.mate).length);
    { const cr = state.creature; if (cr && !lairs.seen.has(cr)) { lairs.seen.add(cr); lairs.met++; } if (cr && cr.dying && cr.stats.win && !lairs.won.has(cr)) { lairs.won.add(cr); lairs.how[cr.stats.win] = (lairs.how[cr.stats.win] || 0) + 1; } } // (C.3: the Kraken lairs the crew met and how they won)
    if (fl && state.ship.hull < h0) { const dd = damageMul(state); const pf = nf * 0.35 * dd * 2 * dt, pb = nb * 0.5 * dd * 2 * dt, drop = h0 - state.ship.hull; dmg.fire += pf; dmg.breach += pb; dmg.direct += Math.max(0, drop - pf - pb); }
  } catch (err) { errorCount++; if (errorCount < 4) console.error('ERR', err && err.stack); }
  if (state.phase === 'lobby' && !state.runEnd && !state.wreck) sim.castOff();
  const stopId = state.run && state.run.stopId;
  const col = stopId ? Number(stopId.split('.')[0]) : 0;
  if (col !== lastCol && (args.verbose || args.trace)) console.error(`=== stop ${stopId} (${state.env && state.env.id}, ${state.course && state.course.kind}) at ${(step / 3600).toFixed(1)} min, hull ${Math.round(state.ship.hull)} salvage ${state.run.salvage} bought [${state.run.bought.join(",")}]`);
  if (col !== lastCol) { lastCol = col; lastProgress = step; stalled = false; }
  if (args.topup && step - lastProgress > args.stall * 3600 && !stalled) { stalls++; stalled = true; stallInfo.push(snap().stop + ' ' + snap().env + ' ' + snap().mk + ' g' + snap().gas + ' br' + snap().breaches + ' f' + snap().fires); if (args.verbose) console.error('STALL at', JSON.stringify(snap())); }
  if (args.trace && step % (args.trace * 60) === 0) console.error(`t=${(step / 3600).toFixed(2)} dist ${Math.round(state.course.dist)} alt ${Math.round(state.ship.alt)} spd ${state.ship.speed.toFixed(2)} vy ${Math.round(state.ship.vy)} hull ${Math.round(state.ship.hull)} fires ${state.fires.length} br ${state.breaches.length} gh ${(state.gasHoles || []).length} bd ${state.boarders.length} KO ${Object.values(state.players).filter((q) => q.ko > 0).length} boss ${state.boss ? Math.round(state.boss.hp) + '/' + state.boss.maxHp + (state.boss.leaving ? 'L' : '') : '-'} press ${Math.round(state.ship.press)} gas ${Math.round(state.ship.gas)} jobs ${Object.entries(Object.values(state.players).reduce((o, q) => { const k = q.ko > 0 ? 'KO' : q.lock ? 'S:' + q.lock : q.botJob ? q.botJob.kind : 'idle'; o[k] = (o[k] || 0) + 1; return o; }, {})).map(([k, v]) => k + v).join(' ')}`);
  if (args.dump && step > args.dump * 3600 && step < args.dump * 3600 + 1200 && step % 120 === 0) console.error("POS " + Object.values(state.players).map((q) => q.name + ":" + (q.botJob && q.botJob.kind) + "@" + q.d + "/" + Math.round(q.x) + (q.carry ? "(" + q.carry + ")" : "")).join(" "));
  if (args.dump && step === args.dump * 3600) { const c0 = state.course, m0 = c0.map, sx0 = c0.dist + 800, sy0 = 500 - state.ship.alt; const sg = c0.stationGun; const stc = sg && maps.stationCell(m0, { x: sg.mx, y: sg.my - 20 }); console.error("HELM", JSON.stringify({ gasValve: state.gasValve, helmP: Object.values(state.players).filter((q) => q.lock === "Helm").map((q) => ({ gas: q.gas, jx: q.jx, jy: q.jy })), mods: (state.modules || []).filter((m) => ["Helm", "Lift", "Boiler", "Helm Pipe", "Lift Pipe"].includes(m.name)).map((m) => [m.name, m.broken, Math.round(m.hp), m.open]), env: state.env, lava: state.lava, ship: state.ship })); console.error("ROUTE", JSON.stringify({ scraping: c0.scraping, contact: c0.lastContact, stuckT: c0.stuckT, unstick: c0.unstick, unstuck: c0.unstuck, stc, fitAt: stc && m0.fit[stc.j * m0.W + stc.i], sx0, sy0, dNow: maps.distToGoal(m0, sx0, sy0), p: maps.routeAhead(m0, sx0, sy0, 7), plan: course.pilotPlan(state, 2.5, 0.55), goal: m0.goal, W: m0.W, H: m0.H, C: m0.CELL, cellDist: m0.dist[Math.floor(sy0 / m0.CELL) * m0.W + Math.floor(sx0 / m0.CELL)] })); }
  if (args.dump && step === args.dump * 3600) console.error(JSON.stringify({ boarders: state.boarders, bots: Object.values(state.players).map((q) => ({ n: q.name, d: q.d, x: Math.round(q.x), y: Math.round(q.y), job: q.botJob && q.botJob.kind, carry: q.carry, ko: q.ko, lock: q.lock, onG: q.onGunship })), bats: (state.bats || []).map((b) => ({ k: b.kind, d: b.d, lx: b.lx, hp: b.hp, latched: b.latched, landed: b.landed, x: Math.round(b.x), y: Math.round(b.y) })), gunship: state.gunship && state.gunship.phase, boss: state.boss && { kind: state.boss.kind, x: Math.round(state.boss.x), hp: state.boss.hp, leaving: state.boss.leaving, flagship: state.boss.flagship }, bossDownLap: state.bossDownLap, lap: state.course.lap, progress: state.course.progress, stopFlagship: state.course.stop && state.course.stop.flagship, tempo: state.tempo && { phase: state.tempo.phase, bossOk: state.tempo.bossOk }, bombBay: state.bombBay, shipBombs: (state.shipBombs || []).length, stationGun: state.course.stationGun, sx: state.course.dist + 800, sy: 500 - state.ship.alt, bayBroken: (state.modules || []).filter((m) => /Bomb/.test(m.name)).map((m) => [m.name, m.broken, m.hp]), ship: state.ship, course: { mapkind: state.course.map && Object.keys(state.course.map), open: state.course.map && state.course.map.open, outposts: state.course.map && state.course.map.outposts && state.course.map.outposts.map((o) => [o.x, o.y, o.done]), unstick: state.course.unstick, dist: state.course.dist, target: state.course.target, done: state.course.done, kind: state.course.kind, lap: state.course.lap }, env: state.env }, (k, v) => (k === 'p' || k === 'obj' ? undefined : v), 1));
  if (args.verbose && step % 3600 === 0) console.error(`min ${step / 3600} hull ${Math.round(state.ship.hull)} ${JSON.stringify(snap())}`);
  if (state.runEnd) {
    const r = state.runEnd;
    const s = snapshot || snap();
    const flags = [];
    if (!r.victory) {
      if (!s.helmManned) flags.push('helmEmpty');
      if (s.gas < 25) flags.push('gasLow');
      if (s.holes >= 4) flags.push('manyHoles');
      if (s.press < 20) flags.push('noPressure');
      if (s.leaks > 5) flags.push('steamLeaks');
      if (s.boarders >= 2) flags.push('raiders');
      if (s.koCount >= 3) flags.push('crewKO');
      if (s.fires >= 3) flags.push('fires');
      if (s.fuel < 10) flags.push('noCoal');
      if (s.flood > 0.5) flags.push('flooded');
      if (!flags.length) flags.push('hullShot');
    }
    const hp = rolling.flying ? Math.round((100 * rolling.helmEmpty) / rolling.flying) : 0;
    const avg = (v) => (rolling.flying ? +(v / rolling.flying).toFixed(1) : 0); const crew = Object.fromEntries(Object.entries(rolling.crew).map(([k, v]) => [k, Math.round((100 * v) / rolling.n)]));
    result = { earned: state.run.earned, parts: (state.run.parts || []).map((p) => p.id), mates: mateInfo(), avg: { br: avg(rolling.br), fires: avg(rolling.fires), gh: avg(rolling.gh), crew }, seed: args.seed, done: r.done, total: r.total, victory: r.victory, minutes: step / 3600, stalls, stallInfo, errors: errorCount, flags,
      cause: r.victory ? 'flagship down' : `dmg fire ${Math.round(dmg.fire)} breach ${Math.round(dmg.breach)} direct ${Math.round(dmg.direct)} | stop ${r.reached} ${s.env} | helm ${s.helmManned ? 'manned' : s.helmBroken ? 'BROKEN' : 'EMPTY'} (empty ${hp}% of run) gas ${s.gas} holes ${s.holes} press ${s.press} fuel ${s.fuel} leaks ${s.leaks} raiders ${s.boarders} KO ${s.koCount} fires ${s.fires} broken [${s.broken.join(',')}] clog ${s.clog} o2 ${s.o2} flood ${s.flood} [${flags.join(',')}]` };
  }
}
if (!result) {
  const stopId = state.run.stopId;
  result = { earned: state.run.earned, parts: (state.run.parts || []).map((p) => p.id), mates: mateInfo(), seed: args.seed, done: Number(stopId.split('.')[0]), total: state.run.voyage.columns.length, victory: false, timeout: true, minutes: args.maxmin, stalls, stallInfo, errors: errorCount, flags: [], cause: `still flying at stop ${stopId}: ${JSON.stringify(snap())}` };
}
result.lairs = { planned: state.run.voyage.columns.flat().filter((s) => s.lair).length, met: lairs.met, won: lairs.won.size, how: lairs.how }; // (C.3)
result.breaks = state.breakStats ? state.breakStats.events : 0; // (S.5i: how often parts broke off in this voyage, and what did it)
result.breakCauses = state.breakStats && state.breakStats.causes ? state.breakStats.causes.map((c) => c.split('@')[0]) : [];
console.log('RESULT ' + JSON.stringify(result));
