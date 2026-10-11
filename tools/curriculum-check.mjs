// THE VOYAGE CURRICULUM gate (package G0, LOOP.md "The ramp"; config.VOYAGE.CURRICULUM, voyage.js generateCurriculum, simulation.js markSalvage / pickSetPiece gates). Headless.
//   node tools/buildsim.mjs --check-curriculum        or directly:   node tools/curriculum-check.mjs [--seed 1] [--voyages 200]
//
//   (a) 200 seeded voyages per mode (QUICK, VOYAGE, CAMPAIGN voyage 1 and the harder voyage 2, each also as a Sparrow's "gentle" route):
//       - the SHAPE: 4 / 6-8 / 5-7 (+ the harbour) columns, a lone first stop, 2-3 branches in every middle column, a lone Flagship in the Aether; a second voyage starts at slot 3's difficulty
//       - each stop follows its slot's row of the table: sky, kind, gates, base skulls; the base skulls never fall from one column to the next
//       - NO gunship set piece in column 1 and no strafers before column 2 (the gates), and a gate once open stays open
//       - the SKY TIERS are in order (Sky Isles, tier A, tier B, the Aether) column by column (a lair may stand in its creature's own sky)
//       - LAIRS only in a slot with lair: true, at 60% of the route or later, never two columns in a row, no more than config.CREATURES.LAIR.COUNT
//       - every middle column has a branch AT OR UNDER its base danger (a lair never takes the only one); a gentle route has a way round an outpost raid in its first two columns
//       - the Nemesis, ring and multi-part flags only where their slot allows them; a ring column flags one raid; the Flagship carries the citadel
//       - every stop leads on and is reachable; the same seed gives the same route
//   (b) CURRICULUM.ENABLED = false gives exactly the old routes (a hash of 600 of them, tools/fixtures/voyage-legacy.json, taken before the curriculum existed)
//   (c) in the game: a first stop allows only bats and imps for as long as we fly it (no gunship, no bombers, no strafers ever), the second stop's gates allow them all; a crew UNDER the expected power
//       is offered a SALVAGE RUN on the route vote (the lowest-danger branch, kind salvage, lighter gates, the pass map flagged salvage, flown with 0 errors), a crew at the expected power or with no power
//       figure (the headless classic) is not; the offers and the stop taken are counted
// Exit code 1 on any failure.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const COUNT = Number(flag('voyages', 200));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
const clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const VG = await load('modules/host/voyage.js');
const V = config.VOYAGE, CU = V.CURRICULUM, LR = config.CREATURES.LAIR;

// ---- (a) the generated routes ----
const GATES_ALL = ['swarm', 'imps', 'bombers', 'strafers', 'gunship'];
const seeds = Array.from({ length: COUNT }, (_, i) => (i + 1) * 7919 + 13);
const variants = [['quick', {}], ['quick', { gentle: true }], ['voyage', {}], ['voyage', { gentle: true }], ['campaign', {}], ['campaign', { voyageNo: 2 }]];
const stats = { lairs: 0, creatures: {}, rings: {}, nemesis: 0, multi: 0, n: {}, tags: 0, voyages: 0 };
for (const [mode, o] of variants) {
  const M = V.MODES[mode], table = VG.curriculumTable(mode), L = table.length;
  const second = (o.voyageNo || 1) > 1, h = second ? 1 : 0, bonus = second ? V.SECOND.DANGER_BONUS : 0, maxD = 3 + bonus;
  const bad = [];
  const fail = (s, msg) => { if (bad.length < 6) bad.push(`seed ${s}: ${msg}`); };
  const sawKind = new Set();
  for (const sd of seeds) {
    const v = VG.generateVoyage(sd, { mode, ...o });
    stats.voyages++;
    const cols = v.columns, n = cols.length, m = n - h;
    stats.n[mode + (second ? '2' : '')] = stats.n[mode + (second ? '2' : '')] || {};
    stats.n[mode + (second ? '2' : '')][n] = (stats.n[mode + (second ? '2' : '')][n] || 0) + 1;
    if (JSON.stringify(v) !== JSON.stringify(VG.generateVoyage(sd, { mode, ...o }))) fail(sd, 'not deterministic');
    if (!v.curriculum) fail(sd, 'no curriculum flag');
    // shape
    if (n < M.stopsMin + h || n > M.stopsMax + h) fail(sd, `${n} columns, want ${M.stopsMin + h}-${M.stopsMax + h}`);
    if (cols[0].length !== 1 || cols[0][0].harbour !== second) fail(sd, 'first column');
    const last = cols[n - 1];
    if (last.length !== 1 || !last[0].flagship || last[0].env !== 'aether' || last[0].kind !== 'network' || last[0].danger !== maxD) fail(sd, 'the Flagship stop');
    if (last[0].ring !== 'citadel') fail(sd, 'the Flagship has no citadel flag');
    if (!second && (cols[0][0].env !== 'skyisles' || cols[0][0].kind !== 'network' || cols[0][0].danger !== 1 || cols[0][0].slot !== 0)) fail(sd, 'first stop is not the Sky Isles cave run');
    if (second && (cols[h].length < V.CHOICES_MIN || cols[h][0].slot !== CU.SECOND_START || cols[h][0].base !== table[CU.SECOND_START].danger + bonus)) fail(sd, 'the second voyage does not start at slot ' + CU.SECOND_START);
    // lairs
    const lairCols = [];
    let lastTier = -1, lastBase = 0, lastGates = [];
    for (let c = h; c < n; c++) {
      const col = cols[c];
      const mid = c > 0 && c < n - 1;
      if (mid && (col.length < V.CHOICES_MIN || col.length > V.CHOICES_MAX)) fail(sd, `column ${c} has ${col.length} branches`);
      const slot = col[0].slot, row = table[slot];
      const share = c === n - 1 ? 1 : second ? CU.SECOND_START / (CU.POWER_CURVE.length - 1) + ((c - h) / (m - 1)) * (1 - CU.SECOND_START / (CU.POWER_CURVE.length - 1)) : c / (n - 1);
      if (slot !== Math.round(share * (L - 1))) fail(sd, `column ${c} takes slot ${slot}, its share ${share.toFixed(2)} says ${Math.round(share * (L - 1))}`);
      if (col.some((s) => s.slot !== slot || s.gates.join() !== row.gates.join())) fail(sd, `column ${c} stops disagree on their slot`);
      const base = c === n - 1 ? maxD : Math.min(maxD, row.danger + bonus);
      if (col.some((s) => s.base !== base)) fail(sd, `column ${c} base danger`);
      if (base < lastBase) fail(sd, `base danger falls at column ${c}`);
      lastBase = base;
      if (mid && !col.some((s) => s.danger <= base)) fail(sd, `column ${c} has no branch at or under ${base} skulls`);
      if (col.some((s) => s.danger < 1 || (!s.lair && s.danger > maxD))) fail(sd, `column ${c} danger out of range`);
      // gates: nothing is taken back, column 1 has bats and imps only, strafers wait for column 2
      if (lastGates.some((g) => !row.gates.includes(g))) fail(sd, `a gate closes at column ${c}`);
      lastGates = row.gates;
      if (!second && c === 0 && col[0].gates.some((g) => !['swarm', 'imps'].includes(g))) fail(sd, 'column 1 allows ' + col[0].gates.join());
      if (!second && c === 0 && (col[0].gates.includes('gunship') || col[0].gates.includes('strafers'))) fail(sd, 'gunship or strafers in column 1');
      if (!second && c === 1 && !['gunship', 'bombers', 'strafers'].every((g) => col[0].gates.includes(g))) fail(sd, 'column 2 does not teach the planes and the gunship');
      if (col.some((s) => s.gates.some((g) => !GATES_ALL.includes(g)))) fail(sd, 'unknown gate');
      // skies
      const tiers = col.filter((s) => !s.lair).map((s) => VG.envTier(s.env));
      const allowed = VG.envsOf(row.env);
      for (const s of col) {
        if (!s.lair && !allowed.includes(s.env)) fail(sd, `${s.id} sky ${s.env} is not in slot ${slot}'s ${allowed}`);
        if (s.lair && !LR.BY_ENV[s.env]) fail(sd, `${s.id} lair in ${s.env}`);
        const kinds = s.lair ? ['lair'] : s.ring && !s.flagship ? ['open'] : row.kinds;
        if (!kinds.includes(s.kind)) fail(sd, `${s.id} kind ${s.kind} not in ${kinds}`);
        sawKind.add(s.kind);
        if (s.play !== s.env) fail(sd, `${s.id} plays ${s.play}`);
      }
      if (tiers.length) {
        const mn = Math.min(...tiers);
        if (mn < lastTier) fail(sd, `sky tiers go back at column ${c}`);
        lastTier = Math.max(lastTier, mn);
      }
      // lairs, flags
      for (const s of col) {
        if (s.lair) {
          if (!row.lair) fail(sd, `${s.id} lair in a slot with lair: false`);
          if (s.share < CU.LAIR_FROM) fail(sd, `${s.id} lair at ${s.share} of the route (before ${CU.LAIR_FROM})`);
          if (s.flagship || s.harbour) fail(sd, 'lair on the Flagship or harbour');
          if (s.creature !== LR.BY_ENV[s.env]) fail(sd, 'lair creature does not match its sky');
          stats.lairs++;
          stats.creatures[s.creature] = (stats.creatures[s.creature] || 0) + 1;
          if (!lairCols.includes(c)) lairCols.push(c);
        }
        if (s.nemesis) { stats.nemesis++; if (!row.nemesis || s.lair || s.flagship) fail(sd, `${s.id} Nemesis flag not allowed`); }
        if (s.multi) { stats.multi++; if (!row.multi || s.lair) fail(sd, `${s.id} multi-part flag not allowed`); }
        if (s.ring) { stats.rings[s.ring] = (stats.rings[s.ring] || 0) + 1; if (s.ring !== row.ring || s.lair) fail(sd, `${s.id} ring flag ${s.ring} not allowed`); }
        if (s.tag) stats.tags++;
        if (row.nemesis && !s.lair && !s.flagship && !s.nemesis) fail(sd, `${s.id} lacks its Nemesis flag`);
      }
      const rings = col.filter((s) => s.ring);
      if (row.ring && !col[0].harbour && rings.length !== 1) fail(sd, `column ${c} has ${rings.length} ring stops, want 1`);
      if (!row.ring && rings.length) fail(sd, `column ${c} has ring stops but its slot has none`);
      if (rings.some((s) => !s.flagship && s.kind !== 'open')) fail(sd, 'a ring stop that is not a raid');
      if (col.filter((s) => s.lair).length > 1) fail(sd, `two lairs in column ${c}`);
    }
    const maxLairs = m >= LR.LONG_STOPS ? LR.COUNT.long : LR.COUNT.short;
    if (lairCols.length > maxLairs) fail(sd, `${lairCols.length} lairs, at most ${maxLairs}`);
    if (lairCols.some((c, i) => lairCols.some((d, j) => i < j && Math.abs(c - d) <= 1))) fail(sd, 'two lairs in a row');
    // a gentle route: a way round an outpost raid in its first two columns
    if (o.gentle) for (let c = 0; c < Math.min(2, n - 1); c++) if (!cols[c].some((s) => s.danger <= s.base && s.kind !== 'open')) fail(sd, `gentle column ${c} has no way round a raid`);
    // reachable, leading on
    for (let c = 0; c < n - 1; c++) {
      if (cols[c].some((s) => !s.next.length)) fail(sd, `a dead end in column ${c}`);
      for (const t of cols[c + 1]) if (!cols[c].some((s) => s.next.includes(t.id))) fail(sd, `${t.id} cannot be reached`);
    }
  }
  const label = `${mode}${second ? ' voyage 2' : ''}${o.gentle ? ' (gentle)' : ''}`;
  report(!bad.length, `${COUNT} ${label} routes: shape, slots, gates, sky tiers, lairs, easy branches, flags, links${bad.length ? '\n  ' + bad.join('\n  ') : ''}`);
}
report(stats.lairs > 0 && Object.keys(stats.creatures).length >= 2, `lairs appear in the curriculum routes: ${stats.lairs} (${Object.entries(stats.creatures).map(([k, v]) => k + ' ' + v).join(', ')})`);
report(stats.nemesis > 0 && stats.multi > 0 && stats.rings.tower > 0 && stats.rings.fortress > 0 && stats.rings.citadel > 0, `Nemesis flags ${stats.nemesis}, multi-part flags ${stats.multi}, rings ${JSON.stringify(stats.rings)}, route-map tags ${stats.tags}`);
console.log('INFO columns per mode: ' + Object.entries(stats.n).map(([k, v]) => k + ' ' + Object.entries(v).map(([c, x]) => c + 'x' + x).join('/')).join(', '));

// ---- (b) the switch: ENABLED = false is the old dice, byte for byte ----
{
  const fix = JSON.parse(fs.readFileSync(path.join(publicDir, '..', 'tools', 'fixtures', 'voyage-legacy.json'), 'utf8'));
  CU.ENABLED = false;
  let same = true, flagged = false;
  for (const mode of ['quick', 'voyage', 'campaign']) {
    const h = crypto.createHash('sha256');
    for (let s = 1; s <= 200; s++) for (const o of [{}, { gentle: true }, { voyageNo: 2 }]) { const v = VG.generateVoyage(s * 7919 + 13, { mode, ...o }); flagged ||= !!v.curriculum || JSON.stringify(v).includes('"slot"'); h.update(JSON.stringify(v)); }
    if (h.digest('hex') !== fix[mode]) { same = false; console.log('  ' + mode + ' differs from the old routes'); }
  }
  CU.ENABLED = true;
  report(same && !flagged, 'CURRICULUM.ENABLED = false: 600 routes per mode are byte-identical to the old ones (tools/fixtures/voyage-legacy.json)');
}

// ---- (c) in the game ----
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const { createSimulation } = await load('modules/host/simulation.js');
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
const players = (st) => Object.values(st.players);
const voteAll = (st, i) => { for (const p of players(st)) { p.voteAt = 1e9; p.vote = i; } };
function boot({ start = 'sparrow', bots = 5, mode = 'voyage' } = {}) {
  const sim = createSimulation();
  const st = sim.state;
  sim.setSession(mode, false);
  if (start) sim.setStartBuild(start);
  for (let i = 0; i < bots; i++) {
    const e = st.ships[0].layout.boarderEntryPoints, id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  step(sim, 90);
  return { sim, st };
}
// Fly for `secs`, noting every set piece the director calls and whether a gunship, bomber or strafer was ever in the sky. The hull is kept up (we are watching the director, not the fight).
function watch(sim, st, secs) {
  const seen = new Set();
  let planes = false;
  for (let i = 0; i < secs * 60; i++) {
    if (st.phase === 'flying') st.ship.hull = 100;
    step(sim, 1);
    const t = st.tempo;
    if (t && t.phase === 'peak' && t.kind) seen.add(t.kind);
    if (st.gunship || st.bombers.length || st.strafers.length) planes = true;
    if (st.phase === 'lobby' && !st.runEnd && !st.wreck) sim.castOff();
  }
  return { seen: [...seen], planes };
}
{
  const { sim, st } = boot();
  const stop = st.run.voyage.columns[0][0];
  report(st.course.stop && st.course.stop.gates && st.course.stop.gates.join() === 'swarm,imps' && !st.course.stop.gates.includes('gunship'), 'the first stop reaches the director with gates ' + (st.course.stop && st.course.stop.gates));
  const w = watch(sim, st, 8 * 60);
  report(w.seen.every((k) => k === 'swarm' || k === 'imps' || k === 'boss') && !w.planes, `first stop, 8 minutes: set pieces seen [${w.seen}], no gunship / bomber / strafer in the sky`);
  report(w.seen.length > 0, 'the director still ran set pieces there (' + w.seen.length + ' kinds)');
  void stop;
}
{
  const { sim, st } = boot();
  st.run.power = 1; // (a strong crew)
  sim.startRoute();
  report(st.vote && st.vote.kind === 'route' && !st.vote.options.some((o) => o.salvage), 'a crew at full power is offered no salvage run');
  voteAll(st, 0);
  step(sim, 60 * 3);
  report(!!st.course.stop && st.course.stop.col === 1 && st.course.stop.gates.includes('gunship') && st.course.stop.gates.includes('strafers'), 'the second stop allows the planes and the gunship (gates ' + (st.course.stop && st.course.stop.gates) + ')');
}
{
  const { sim, st } = boot();
  const stop0 = st.run.voyage.columns[0][0];
  const colNext = stop0.next.map((id) => VG.stopById(st.run.voyage, id));
  const lowest = Math.min(...colNext.map((s) => s.danger));
  st.run.power = VG.expectedPower(colNext[0]) - 0.1;
  sim.startRoute();
  const opts = st.vote.options;
  const salv = opts.filter((o) => o.salvage);
  report(salv.length === 1 && salv[0].danger === Math.max(1, lowest - CU.SALVAGE.DANGER_DROP) && salv[0].kindName === V.KIND_NAMES.salvage, `a crew under the expected power gets ONE salvage run: ${salv.length} (${salv[0] && salv[0].name}, ${salv[0] && salv[0].danger} skulls, lowest was ${lowest})`);
  const idx = opts.findIndex((o) => o.salvage);
  const s = VG.stopById(st.run.voyage, opts[idx].id);
  report(s.kind === 'salvage' && s.gates.join() === CU.SALVAGE.GATES.join() && st.run.offers.salvage.includes(s.id), 'the stop is marked: kind salvage, gates ' + s.gates + ', counted as offered');
  sim.startRoute(); // (the vote again: nothing marked twice)
  report(st.vote.options.filter((o) => o.salvage).length === 1 && st.run.offers.salvage.length === 1, 'asking again marks no second salvage run');
  voteAll(st, idx);
  step(sim, 60 * 3);
  const c = st.course;
  report(c.stop.id === s.id && c.stop.salvage && c.map.salvage === true && c.map.kind !== 'open' && c.stop.rateMul === CU.SALVAGE.RATE_MUL && st.run.offers.taken.includes(s.id), `the crew takes it: the salvage map (${c.map.kind}) is flown, lighter enemies (x${c.stop.rateMul}), counted as taken`);
  const errs0 = (globalThis.gameErrors || []).length;
  const w = watch(sim, st, 120);
  report(w.seen.every((k) => k === 'swarm' || k === 'boss') && !w.planes && (globalThis.gameErrors || []).length === errs0, `2 minutes on the salvage run: set pieces [${w.seen}], no planes, 0 errors`);
}
{
  const { sim, st } = boot({ start: null }); // (the headless classic: no ship power figure)
  sim.startRoute();
  report(st.run.power == null && !st.vote.options.some((o) => o.salvage), 'a run with no ship power figure (the headless classic) is never offered a salvage run');
}
{
  const { sim, st } = boot({ mode: 'quick' });
  st.run.power = 0;
  sim.startRoute();
  report(st.vote.options.filter((o) => o.salvage).length === 1, 'QUICK: a crew at power 0 is offered a salvage run too');
  CU.ENABLED = false;
  const b = boot();
  b.st.run.power = 0;
  b.sim.startRoute();
  CU.ENABLED = true;
  report(!b.st.run.voyage.curriculum && !b.st.vote.options.some((o) => o.salvage), 'with the curriculum off a weak crew is offered no salvage run (the old route)');
}
console.log(ok ? 'curriculum check: PASS' : 'curriculum check: FAIL');
process.exit(ok ? 0 : 1);
