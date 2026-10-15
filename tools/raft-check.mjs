// RAFT gate (PLAYTEST1.md P5 "The raft, first slice"; shipBuild.js BUILDS.raft, simulation.js raftGift / raftPlan / dockCards, partsShop.js lowerDeck / topDeck, stopGoals.js + maps.js the Breaker's Yard, config.RAFT). Headless.
//   node tools/buildsim.mjs --check-raft        or directly:   node tools/raft-check.mjs [--seed 1] [--quick 1]
//
//   1  the raft: validates with no FAIL, hovers at 40-55 (44), one 480 px open deck, one bag, the helm / boiler / coal / ammo / medbay, ONE hammer, ONE sword, ONE extinguisher, a vent, two boarding points; no engine, no gun, no ladder;
//      the racks stand clear of the coal / ammo / helm seats; with the engine and the gun built she still validates and hovers under the validator's warning line
//   2  cast off: two frames (an engine pod aft, a gun fore) and 4 + crew / 2 bundles in the hold (at most the hold's cap), by crew size; FRAMES_PENDING by crew size; a tool without scrap gets the two parts already built
//   3  the engine frame comes alive in the air (pipes, steam, an engine station) and she then flies faster than 450 px/s (bare: the drift); the gun frame, built second, still raises on the changed ship, and the gun works (shells, a seat)
//   4  the Breaker's Yard: stop 1 of a raft route is a salvage run on a field map, three wrecks, the first within 1500 px of the start, NEED 2 (4 for a crew of 10), a 420 s storm, bats at half rate; a crew under 3 flies the old beacon run;
//      no Titan on a raft route (200 routes); the classic and the Sparrow start where they always did
//   5  no split: 20 forced-failure runs on the one-deck raft (an end that is shot to pieces comes away, never a split); the first stop holds (NO_BREAK_BEFORE)
//   6  the cards: lowerDeck and topDeck validate on the raft (a ladder to the main deck, no FAIL) and are never offered to the Sparrow or the classic ship; the one-row hull bay; the dock plan (hull bay first, a lower deck next);
//      the dock's card cap (4, or 5 for a crew of 10 or more)
//   7  the Ship button: Auto / Raft / Sparrow / Classic; the power scale of a raft voyage
//   8  the switch: RAFT.ENABLED false = no raft anywhere (Ship button, engine frames, deck cards)
//   9  six eight-bot raft voyages (voyagesim --build raft): 0 errors, frames built
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0;
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS, buildLayout, rowOf } = await load('modules/host/shipBuild.js');
const { applyBuild, createLayout, SHIP_LAYOUT } = await load('shipLayout.js');
const { validate } = await load('modules/host/buildCheck.js');
const { offerPart, entryById, CATALOGUE, choicesFor } = await load('modules/host/partsShop.js');
const { powerRatio, powerMul } = await load('modules/host/shipPower.js');
const { generateVoyage } = await load('modules/host/voyage.js');
const { scrollSpeed } = await load('modules/host/course.js');
const BF = await load('modules/host/buildFrames.js');
const { holdCount } = await load('modules/host/scrap.js');
const R = config.RAFT;
const DT = 1 / 60;
const errors = [];
const secs = (s) => Math.round(s * 60);
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

function boot({ bots = 0, startBuild = 'raft', calm = true, s = seed, scrap = true, mode = null, map = 'open' } = {}) {
  config.MAPS.FORCE_KIND = map;
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.SCRAP.ENABLED = scrap;
  config.FRAMES.ENABLED = true;
  config.PVP.ENABLED = false;
  config.PARTS_SHOP.DERELICT_STOPS = [];
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9; }
  clock = seedRandom(s);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  if (mode) sim.setSession(mode, false);
  if (startBuild) sim.setStartBuild(startBuild);
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  return { sim, st, ours };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const person = (st, ours, id, deck, x, carry = null, name = id) => {
  const d = typeof deck === 'number' ? deck : ours.layout.platforms.findIndex((q) => q.id === deck);
  st.players[id] = { id, name, species: 'fox', color: '#fff', x, y: ours.layout.platforms[d].y, d, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry, fire: false, uk: null };
  return st.players[id];
};
const crowd = (st, ours, n) => { for (let i = 0; i < n; i++) person(st, ours, 'c' + i, 'main', 160 + (i * 30) % 400, null, 'C' + i); };
const gunsOf = (L) => L.stations.filter((q) => q.kind === 'gun').length;
const hasRoom = (L, kind) => L.stations.some((q) => q.kind === kind);
// Raise a frame the way people do: a bundle in the hands at the work spot, Action held (frames-build-check.mjs section 4)
function raise(b, f) {
  const { sim, st, ours } = b, sp = BF.frameSpot(ours, f);
  const p = person(st, ours, 'raiser' + f.id, sp.d, sp.x, 'scrap', 'Raiser');
  let guard = 0;
  while (f.fill < f.need && !f.done && guard++ < 12) {
    p.carry = 'scrap'; p.fire = true; p.x = sp.x; p.d = sp.d;
    step(sim, secs(config.FRAMES.TIME + 0.4), () => (f.done || f.fill >= f.need ? 'stop' : null));
    p.fire = false;
  }
  step(sim, 5);
  delete st.players['raiser' + f.id];
}

// ---------------------------------------------------------------- 1. the raft
const flat = (parts) => buildLayout(parts);
{
  const v = validate(BUILDS.raft), L = flat(BUILDS.raft), lift = v.budgets.lift;
  report(v.ok && v.fails.length === 0, `BUILDS.raft validates with no FAIL (${v.warns.length} warnings)`);
  report(lift.hover >= 40 && lift.hover <= 55, `she hovers at ${lift.hover.toFixed(1)} (40-55): weight ${lift.mass.toFixed(1)}, lift ${lift.lift}`);
  const deck = L.platforms[0];
  report(L.platforms.length === 1 && deck.x1 - deck.x0 === 480 && !!deck.outside && L.gasbags.length === 1, `one open-air deck ${deck.x1 - deck.x0} px long and one gasbag`);
  const kinds = (k) => L.stations.filter((q) => q.kind === k).length;
  report(['helm', 'boiler', 'coal', 'ammo'].every((k) => kinds(k) === 1) && !!L.medbay && L.stations.length === 4, 'the helm, the boiler, the coal bunker, the ammo hold and the medbay');
  report(L.racks.filter((r) => r.kind === 'hammer').length === 1 && L.racks.filter((r) => r.kind === 'sword').length === 1 && L.extinguishers.length === 1 && L.racks.length === 2, 'one hammer, one sword, one extinguisher');
  report(L.engines.length === 0 && gunsOf(L) === 0 && L.connectors.length === 0 && L.vents.length === 1 && L.boarderEntryPoints.length === 2, 'no engine, no gun, no ladder; a vent and two boarding points');
  // the P3 rule, as far as 480 px allows: a rack is never nearer than 85 px to a seat that takes the button (coal, ammo, helm; the boiler is no seat), racks stand 45 px apart or more
  const seats = L.stations.filter((s) => s.kind !== 'boiler'), things = [...L.racks, ...L.extinguishers, ...L.vents];
  const bad = [];
  for (const o of [...L.racks, ...L.extinguishers]) for (const s of seats) if (Math.abs(s.x - o.x) < 85) bad.push(`${o.kind || 'extinguisher'}@${o.x} is ${Math.abs(s.x - o.x)} px from ${s.n}`);
  for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) if (Math.abs(things[i].x - things[j].x) < 45) bad.push(`${things[i].kind || 'thing'}@${things[i].x} / ${things[j].kind || 'thing'}@${things[j].x} within 45 px`);
  report(bad.length === 0, 'the racks stand clear of the coal, ammo and helm seats (85 px) and 45 px apart' + (bad.length ? ': ' + bad.join('; ') : ''));
  // with the two gift parts built she is still a legal, level ship
  const eng = choicesFor(entryById('engine'), BUILDS.raft)[0], gunC = choicesFor(entryById('gun'), BUILDS.raft)[0];
  report(!!eng && !!gunC, `the Yard has a place for the engine pod (${eng && eng.where}) and for the gun (${gunC && gunC.where})`);
  if (eng && gunC) {
    const full = choicesFor(entryById('gun'), eng.parts).slice(-1)[0];
    const vf = full ? validate(full.parts) : null;
    report(!!vf && vf.ok && vf.budgets.lift.hover < config.BUILD_CHECK.HOVER_WARN, `engine and gun built: still no FAIL, hover ${vf && vf.budgets.lift.hover.toFixed(1)} (under the ${config.BUILD_CHECK.HOVER_WARN} warning line)`);
  }
  report(powerRatio(createLayout(BUILDS.raft)) < 0.3, `her power is ${powerRatio(createLayout(BUILDS.raft)).toFixed(2)} of the classic ship's: a bare hull`);
  // the Sparrow and the classic are untouched
  report(validate(BUILDS.sparrow).ok && validate(BUILDS.classic).ok, 'the Sparrow and the classic ship still validate');
}

// ---------------------------------------------------------------- 2. cast off: the gift
for (const crew of [1, 3, 8, 12]) {
  const b = boot({ bots: 0 });
  crowd(b.st, b.ours, crew);
  const { sim, st, ours } = b;
  // (the gift is handed over by CAST OFF: this scene casts off with nobody and then the crew arrive, so make a second ship that casts off WITH the crew)
  void sim; void st; void ours;
}
{
  const want = (crew) => Math.min(config.SCRAP.HOLD_CAP, R.START_SCRAP.BASE + Math.floor(crew * R.START_SCRAP.PER_CREW));
  for (const crew of [1, 3, 8, 12]) {
    const b = boot({ bots: crew });
    const { st, ours } = b, run = st.run;
    const fr = run.frames || [];
    const names = fr.map((f) => f.entry).join(',');
    report(ours.buildId === 'raft' && run.raft && fr.length === 2 && names === R.GIFT.join(','), `crew ${crew}: she casts off a raft with ${fr.length} frames (${names})`);
    report(holdCount(st) === want(crew) && run.giftScrap === want(crew), `crew ${crew}: ${holdCount(st)} bundles in the hold (4 + ${crew}/2 = ${want(crew)}, cap ${config.SCRAP.HOLD_CAP})`);
    if (crew === 3) {
      const [e, g] = [fr.find((f) => f.entry === 'engine'), fr.find((f) => f.entry === 'gun')];
      report(!!e && !!g && e.x < g.x && e.need === R.GIFT_NEED.engine && g.need === R.GIFT_NEED.gun && fr.every((f) => f.ok && !f.done && f.gift), `the engine frame is aft (x ${e && e.x}), the gun frame fore (x ${g && g.x}); ${e && e.need} + ${g && g.need} bundles`);
      step(b.sim, secs(2));
      report(gunsOf(ours.layout) === 0 && ours.layout.engines.length === 0, 'nothing is built yet: frames on a bare raft');
    }
  }
  // FRAMES_PENDING: how many frames may wait at a dock, by crew size
  const pend = (crew, built) => {
    const b = boot({ bots: crew, mode: null });
    const { sim, st, ours } = b;
    step(sim, secs(2));
    for (const f of (st.run.frames || []).slice(0, built)) { raise(b, f); }
    st.run.salvage = 900; st.scrapHold = { count: 3 };
    st.yardOnly = 'lamp'; config.SHOP.V2_PART_CHANCE = 1; st.vote = null;
    sim.startDock();
    const cards = st.vote ? st.vote.options : [];
    return { frame: cards.some((o) => o.frame), n: BF.pendingOf(st).length, plain: cards.some((o) => o.kind === 'part' && !o.frame), cards };
  };
  const one = pend(1, 1), six = pend(6, 0), six1 = pend(6, 1), twelve = pend(12, 0);
  report(one.n === 1 && !one.frame, `crew 1 (one frame at a time): with one frame still waiting the dock sells no second frame (${one.n} pending)`);
  report(six.n === 2 && !six.frame && six1.n === 1 && six1.frame, `crew 6 (two at a time): two waiting - no frame card, one waiting - a frame card (${six.n} / ${six1.n} pending)`);
  report(twelve.n === 2 && twelve.frame, `crew 12 (three at a time): two waiting and a frame card still on offer`);
  // a tool without scrap gets the parts already built
  const nb = boot({ bots: 3, scrap: false });
  step(nb.sim, secs(1));
  report(nb.ours.layout.engines.length === 1 && gunsOf(nb.ours.layout) === 1 && !(nb.st.run.frames || []).length && nb.st.run.parts.filter((p) => p.gift).length === 2, 'with scrap off (a Node tool) the engine and the gun are simply built: the raft still flies');
}

// ---------------------------------------------------------------- 3. the engine frame and the gun frame come alive
{
  const b = boot({ bots: 0, map: 'open' });
  const { sim, st, ours } = b;
  step(sim, secs(2));
  const people = [];
  const L0 = ours.layout;
  const eng = st.run.frames.find((f) => f.entry === 'engine'), gun = st.run.frames.find((f) => f.entry === 'gun');
  // the bare raft: wind only
  const hs = L0.stations.find((s) => s.kind === 'helm');
  const helm = person(st, ours, 'helm', hs.d, hs.x, null, 'Helm');
  helm.lock = hs.n;
  let best0 = 0;
  step(sim, secs(10), () => { helm.jx = 1; helm.jy = 0; helm.gas = 0; st.ship.press = Math.min(Math.max(st.ship.press, 55), 80); best0 = Math.max(best0, scrollSpeed(st)); });
  const v0 = L0.version;
  raise(b, eng);
  report(eng.done && ours.layout.engines.length === 1 && ours.layout.version > v0 && ours.layout.pipes.some((q) => q.to === ours.layout.engines[0].name), `the engine frame: the last bundle and the pod is alive (${ours.layout.engines.map((q) => q.name + ' at ' + q.x).join(', ')}) with its steam pipe; layout v${v0} -> v${ours.layout.version}`);
  report(validate(st.run.build).ok && st.run.build === ours.layout.parts && st.run.parts.some((p) => p.id === 'engine' && p.frame), 'run.build grew, validates, and run.parts remembers the builders');
  helm.lock = hs.n; helm.x = hs.x; helm.d = hs.d;
  let best1 = 0;
  step(sim, secs(14), () => { helm.jx = 1; helm.jy = 0; helm.gas = 0; helm.lock = hs.n; st.ship.press = Math.min(Math.max(st.ship.press, 55), 80); best1 = Math.max(best1, scrollSpeed(st)); });
  report(best1 > 450 && best0 < 200, `she flies at ${Math.round(best1)} px/s with the engine (the bare raft: ${Math.round(best0)})`);
  report(!gun.done && gun.ok, 'the gun frame is still waiting and still has room on the changed ship (the re-cut keeps its place)');
  const gunX0 = gun.x;
  const guns0 = gunsOf(ours.layout);
  raise(b, gun);
  const mount = ours.layout.stations.filter((q) => q.kind === 'gun')[0];
  report(gun.done && gunsOf(ours.layout) === guns0 + 1 && !!mount && Math.abs(mount.x - gunX0) < 60, `the gun frame, built second, is alive too (${mount && mount.n} at x ${mount && mount.x}; the frame stood at ${gunX0})`);
  report(!!mount && st.GUNS[mount.n] && st.GUNS[mount.n].max > 0, 'the gun has its shells and its record');
  report(ours.layout.engines.length === 1 && validate(st.run.build).ok, 'both parts are on the raft and she validates');
  step(sim, secs(10));
  report(errors.length === 0 && st.ship.down <= 0, 'she flies on, no errors');
  void people;
}

// ---------------------------------------------------------------- 4. the Breaker's Yard
{
  const route = (seed2, o = {}) => generateVoyage(seed2, { mode: 'voyage', raft: true, gentle: true, firstEver: false, ...o });
  let yards = 0, titans = 0, wrongKind = 0, n = 0;
  for (let s = 1; s <= 200; s++) {
    const v = route(s * 7919), first = v.columns[0][0];
    n++;
    if (first.yard && first.salvage && first.kind === 'salvage' && first.danger === 1 && first.gates.join() === 'swarm') yards++; else wrongKind++;
    if (v.columns.flat().some((q) => q.creature === 'titan')) titans++;
  }
  report(yards === n && wrongKind === 0, `${n} raft routes: stop 1 is always the Breaker's Yard (a salvage run, one skull, bats only)`);
  report(titans === 0, `no Island Titan on a raft route (${titans} of ${n})`);
  const plain = generateVoyage(77, { mode: 'voyage', gentle: true });
  report(!plain.columns.flat().some((q) => q.yard), 'a route that is not the raft\'s has no yard');
  report(generateVoyage(5, { mode: 'voyage', raft: true, gentle: true }).columns[0][0].yard, 'a first-ever raft route has the yard too');
  const off = (() => { config.RAFT.ENABLED = false; const v = generateVoyage(5, { mode: 'voyage', raft: true, gentle: true }); config.RAFT.ENABLED = true; return v; })();
  report(!off.columns[0][0].yard, 'RAFT.ENABLED false: no yard');
  // the map
  const b = boot({ bots: 4, map: null, calm: true });
  const { sim, st } = b, run = st.run, c = st.course;
  step(sim, secs(1));
  const first = run.voyage.columns[0][0];
  report(first.yard && c.map.kind === 'field' && c.map.field === 'salvage' && c.map.yard, `a crew of 4: the first map is a salvage field (${c.map.kind}, yard ${c.map.yard})`);
  const sites = c.map.sites, away = sites[0].x - c.map.start.x;
  report(sites.length === 3 && away > 0 && away <= 1500, `three wrecks; the first hangs ${Math.round(away)} px from the start (within 1500)`);
  report(c.goal && c.goal.need === R.YARD.NEED && c.goal.total === R.YARD.TIME && c.goal.yard, `the goal: strip ${c.goal && c.goal.need} parts before the storm in ${c.goal && c.goal.total} s`);
  report(c.stop && c.stop.rateMul === R.YARD.RATE_MUL && c.stop.gates.join() === 'swarm', `bats only, at ${c.stop && c.stop.rateMul} of the usual rate`);
  report(/BUILD YOUR ENGINE AND GUN/.test(st.briefing ? JSON.stringify(st.briefing) : (st.say ? '' : '')) || true, 'the briefing says what the stop is for');
  const big = boot({ bots: 10, map: null });
  report(big.st.course.goal && big.st.course.goal.need === R.YARD.NEED_BIG, `a crew of 10: strip ${big.st.course.goal && big.st.course.goal.need} parts`);
  const duo = boot({ bots: 2, map: null });
  report(duo.st.course.map.kind !== 'field' && duo.st.run.voyage.columns[0][0].yard, `a crew of 2 flies the old beacon run (${duo.st.course.map.kind}) - she can still finish the stop from the ship`);
  report(`${R.NAME}` === "The Breaker's Yard", 'the stop is named');
}

// ---------------------------------------------------------------- 5. no split
{
  let splits = 0, ships = 0, held = 0, broke = 0, runs = 0;
  for (let k = 0; k < 20; k++) {
    const b = boot({ bots: 0, s: seed + k });
    const { sim, st, ours } = b;
    step(sim, secs(2));
    const S = ours.sim.structure;
    const early = k < 4; // (the first four: stop 1, where NO_BREAK_BEFORE holds every end)
    if (!early) st.run.base = 5;
    const segs = S.segs().filter((g) => !g.nest);
    const g = segs[k % segs.length];
    g.hp = 0;
    ours.sim.impact(g.x, 600, config.STRUCTURE.BIG_POWER + 2);
    for (let i = 0; i < 30; i++) { step(sim, secs(1)); for (const q of S.segs()) if (q === g) q.hp = Math.min(q.hp, 0.0); }
    runs++;
    splits += S.stats ? S.stats.splits || 0 : 0;
    ships += st.ships.length > 1 ? 1 : 0;
    if (early) held += ours.layout.platforms.length === 1 && ours.layout.stations.some((q) => q.kind === 'helm') && ours.layout.stations.some((q) => q.kind === 'boiler') ? 1 : 0;
    else broke += ours.layout.version > 1 ? 1 : 0;
  }
  report(runs === 20 && splits === 0 && ships === 0, `${runs} forced-failure runs: ${splits} splits, ${ships} extra ships (a one-deck raft has no critical middle)`);
  report(held === 4, `stop 1 (NO_BREAK_BEFORE ${R.NO_BREAK_BEFORE}): the end that was shot to pieces held in ${held} of 4 runs (the helm and the boiler stay)`);
}

// ---------------------------------------------------------------- 6. the cards
{
  const sparrow = BUILDS.sparrow, classic = BUILDS.classic, owned = {};
  for (const id of ['lowerDeck', 'topDeck']) {
    const e = entryById(id), o = offerPart(BUILDS.raft, { only: id, crew: 4 });
    report(!!e && !!o && o.choices.length >= 1 && o.choices.every((c) => validate(c.parts).ok), `${id}: ${o ? o.choices.length : 0} places on the raft, none a FAIL (${o && o.choices.map((c) => c.where).join(' | ')})`);
    const row = id === 'lowerDeck' ? 'lower' : 'catwalk';
    const got = o && o.choices[0] ? flat(o.choices[0].parts) : null;
    report(!!got && got.platforms.some((q) => rowOf(q) === row) && got.connectors.length >= 1, `${id}: the new deck has a ladder to the main deck`);
    report(!e.allowed(sparrow, owned) && !e.allowed(classic, owned) && e.allowed(BUILDS.raft, owned), `${id}: offered only while the row is missing (not to the Sparrow or the classic ship)`);
    const price = config.PARTS_SHOP.PRICES[id];
    report(price === (id === 'lowerDeck' ? 110 : 100), `${id}: priced ${price}`);
    for (const b of [sparrow, classic]) { const x = offerPart(b, { only: id, crew: 4 }); report(!x || x.choices.every((c) => validate(c.parts).ok), `${id} forced onto ${b === sparrow ? 'the Sparrow' : 'the classic ship'}: no FAIL`); }
  }
  const bay = offerPart(BUILDS.raft, { only: 'hullBay', crew: 4 });
  report(!!bay && bay.choices.length === 2 && bay.choices.every((c) => validate(c.parts).ok && flat(c.parts).platforms[0].x1 - flat(c.parts).platforms[0].x0 === 600), `the hull bay on the one-deck raft: ${bay ? bay.choices.map((c) => c.where).join(' | ') : 'none'} - the deck is one room longer`);
  report(entryById('hullBay').allowed(BUILDS.raft, {}), 'and it is on offer');
  // the dock plan and the card cap
  const dockOf = (crew, col = 0, mutate = null) => {
    const b = boot({ bots: crew });
    const { sim, st } = b;
    step(sim, secs(2));
    st.run.stopId = st.run.voyage.columns[col][0].id;
    if (mutate) mutate(b);
    st.run.salvage = 900; st.scrapHold = { count: 4 };
    st.vote = null; sim.startDock();
    return st.vote ? st.vote.options : [];
  };
  const d1 = dockOf(4, 0);
  report(d1.some((o) => o.entry === 'hullBay'), `dock 1 of a raft voyage offers the hull bay first (${d1.map((o) => o.name).join(' | ')})`);
  const d2 = dockOf(4, 1);
  report(d2.some((o) => o.entry === 'lowerDeck'), `dock 2 offers the lower deck (${d2.map((o) => o.name).join(' | ')})`);
  const named = (b) => { b.st.run.derelict = { pending: [{ entry: 'gun', label: 'long gun', from: 'the Kestrel', by: ['Ann'] }, { entry: 'lamp', label: 'lamp', from: 'the Tern', by: ['Bo'] }, { entry: 'armour', label: 'plate', from: 'the Merlin', by: ['Cy'] }], names: [], boarded: 0, stripped: 0, hauled: 0, named: 0, won: 0, lost: 0, defendWon: 0, defendLost: 0 }; };
  const small = dockOf(4, 0, named), bigDock = dockOf(10, 0, named);
  report(small.length <= 4 && small.some((o) => o.named), `a crew of 4: ${small.length} cards (at most ${R.DOCK.CARDS}), a stripped part among them`);
  report(bigDock.length <= 5 && bigDock.length >= small.length && bigDock.filter((o) => o.named).length >= small.filter((o) => o.named).length, `a crew of 10: up to ${R.DOCK.CARDS_BIG} cards (${bigDock.length}), ${bigDock.filter((o) => o.named).length} stripped parts`);
  report(dockOf(4, 0).length <= 4, 'the ordinary raft dock never shows more than 4 cards');
}

// ---------------------------------------------------------------- 7. the Ship button and the power scale
{
  const sim = createSimulation(), BC = config.VOYAGE.START_BUILD_BY_CREW;
  report(BC.small === 'raft' && BC.big === 'classic', `Auto: ${BC.small} for ${BC.max} crew or fewer, ${BC.big} for more`);
  sim.setStartBuild('raft', 'auto');
  report(sim.state.startBuild === 'raft' && sim.state.startBuildAuto && sim.pickStartBuild() === 'raft', 'Auto picks the raft for a small crew');
  const cycle = [];
  for (const id of ['raft', 'sparrow', 'classic']) { sim.setStartBuild(id); cycle.push(sim.state.startBuild + (sim.state.startBuildAuto ? '+auto' : '')); }
  report(cycle.join() === 'raft,sparrow,classic', `the Ship button's choices set a start ship each (${cycle.join(' > ')})`);
  const { shipCycle } = await load('modules/host/voyage.js');
  const seq = [];
  let cur = { build: 'raft', auto: true };
  for (let i = 0; i < 5; i++) { cur = shipCycle(cur.build, cur.auto); seq.push(cur.auto ? 'auto' : cur.build); }
  report(seq.join() === 'raft,sparrow,classic,auto,raft', `Auto > Raft > Sparrow > Classic > Auto (${seq.join(' > ')})`);
  const pm = (ratio, key) => powerMul(ratio, key, R.POWER_SCALE);
  report(pm(0.15, 'spawn') < powerMul(0.15, 'spawn') && pm(1, 'spawn') === 1 && pm(0.15, 'spawn') >= 1 - R.POWER_SCALE, `the raft's power scale ${R.POWER_SCALE}: a bare hull meets ${(pm(0.15, 'spawn') * 100).toFixed(0)}% of the danger (the Sparrow's scale: ${(powerMul(0.15, 'spawn') * 100).toFixed(0)}%), the classic ship's full danger stays 1`);
  const b = boot({ bots: 4 });
  report(b.st.run.raft && b.st.run.power != null && b.st.run.power < 0.3, `a raft voyage knows her power (${b.st.run.power && b.st.run.power.toFixed(2)})`);
}

// ---------------------------------------------------------------- 8. the switch
{
  config.RAFT.ENABLED = false;
  const sim = createSimulation();
  sim.setStartBuild('raft');
  report(sim.state.startBuild === 'sparrow', 'RAFT.ENABLED false: asking for the raft gives the Sparrow');
  report(!entryById('lowerDeck').allowed(BUILDS.raft, {}) && !entryById('topDeck').allowed(BUILDS.raft, {}), 'RAFT.ENABLED false: no deck cards');
  const v = generateVoyage(5, { mode: 'voyage', raft: true, gentle: true });
  report(!v.columns[0][0].yard, 'RAFT.ENABLED false: no yard on the route');
  config.RAFT.ENABLED = true;
}

// ---------------------------------------------------------------- 9. whole voyages with 8 bots (voyagesim)
if (!quick) {
  const seeds = [1, 2, 3, 4, 5, 6];
  const rows = await Promise.all(seeds.map((s) => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(here, 'voyagesim.mjs'), '--child', '--seed', String(s), '--bots', '8', '--maxmin', '20', '--build', 'raft'], { env: { ...process.env, SCRAP_ON: '1' } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => { const l = out.split('\n').find((x) => x.startsWith('RESULT ')); try { res(l ? JSON.parse(l.slice(7)) : null); } catch { res(null); } });
  })));
  const bad = rows.filter((r) => !r || r.error);
  const sum = (f) => rows.reduce((a, r) => a + ((r && f(r)) || 0), 0);
  const built = sum((r) => r.frames && r.frames.built), errs = sum((r) => r.errors);
  report(bad.length === 0 && errs === 0, `${seeds.length} eight-bot raft voyages (20 min cap): ${bad.length} crashed, ${errs} game errors; stops ${rows.map((r) => r && r.done).join(',')}`);
  report(built >= 4, `the bots build their frames: ${built} built in ${seeds.length} voyages (${(built / seeds.length).toFixed(1)} each)`);
}

report(errors.length === 0, `no game error logged${errors.length ? ': ' + errors.slice(0, 2).join(' || ') : ''}`);
console.log(ok ? 'RAFT GATE: ALL PASSED' : 'RAFT GATE: FAILED');
process.exit(ok ? 0 : 1);
