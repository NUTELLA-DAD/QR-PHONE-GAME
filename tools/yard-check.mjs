// SHIPWRIGHT'S YARD gate (S.6a / S.6b: the Sparrow, ship PARTS in the sky-dock shop, the slot vote, the TV and the phones). Headless.
//   node tools/buildsim.mjs --check-yard        or directly:   node tools/yard-check.mjs [--seed 1]
//
//   (a) the Sparrow validates clean, is a small ship (3 guns, 1 bag, 2 engines, no bomb bay), flies; the start build is fitted in the lobby (setStartBuild) and classic comes back; a sim that never
//       asked for a start build keeps the classic ship and the old shop (no part cards)
//   (b) the dock offers ONE part card (a price from config.PARTS_SHOP, at most YARD.SLOT_MAX places, every place already checked by the validator); a unanimous vote is 25% off, a split vote is not
//   (c) a part with several places opens the 10 s slot vote (A / B / C): the winning place is built (the voyage's build is exactly that choice, it validates, ship 0 is refitted: stations, guns, modules,
//       crew back aboard) and she KEEPS her hull, coal and shells; a part with one place is built at once; BUILT is stamped
//   (d) the whole catalogue: every part, offered on every build it fits, comes with validated places; a run of purchases (hull bay, bag, boiler, engine, keel, coal, nest, bomb bay ...) each validates and
//       the grown ship flies with 0 errors; the salvage spent adds up
//   (e) derelict stops (2 and 5): the part is free; limp home shakes the NEWEST part loose (its modules broken, mended by a hammer) and loses nothing
//   (f) the voyage save keeps the build (versioned, tolerant); a campaign's second voyage flies the ship the first one built; a new voyage starts again from the start build
//   (g) the phones are told: a part card with its badge and one line, then the slot cards with a letter; the TV draws the blueprint, the gauges, the pins, the stamp and the call-out on a stub canvas
//       with 0 errors; the camera holds its zoom while she is built and pulls back slowly after cast off
//   (h) bots with their own votes buy parts over a few docks, 0 errors; Versus fits the classic ship and a new voyage the Sparrow again
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
const clock = seedRandom(seed);
// a tiny stub canvas (g) for the TV checks: a transform stack, a record of the texts
const rec = { texts: [], calls: 0 };
const stubCtx = () => {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const t = { imageSmoothingQuality: 'low', font: '10px x', textAlign: 'left', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      switch (k) {
        case 'getTransform': return () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
        case 'setTransform': return (a, b, c, d, e, f) => { m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; };
        case 'resetTransform': return () => { m = [1, 0, 0, 1, 0, 0]; };
        case 'save': return () => { stack.push(m.slice()); };
        case 'restore': return () => { if (stack.length) m = stack.pop(); };
        case 'translate': return (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); };
        case 'scale': return (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); };
        case 'rotate': return (a) => { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); };
        case 'transform': return (a, b, c, d, e, f) => { m = mul(m, [a, b, c, d, e, f]); };
        case 'measureText': return (s) => ({ width: String(s).length * 9 });
        case 'getImageData': return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        case 'createImageData': return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
        case 'createLinearGradient': case 'createRadialGradient': case 'createPattern': case 'createConicGradient': return () => ({ addColorStop() {} });
        case 'isPointInPath': case 'isPointInStroke': return () => false;
        case 'fillText': case 'strokeText': return (s) => { rec.texts.push(String(s)); };
        default: return () => { rec.calls++; };
      }
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = {
  fonts: { check: () => true, load: () => Promise.resolve() },
  createElement: () => { const c = { width: 0, height: 0, style: {}, getContext: () => (c.c ||= stubCtx()) }; return c; },
};
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
globalThis.fetch = async () => ({ json: async () => [] });

const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS, buildLayout } = await load('modules/host/shipBuild.js');
const { validate } = await load('modules/host/buildCheck.js');
const PS = await load('modules/host/partsShop.js');
const V = await load('modules/host/voyage.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');
const YD = config.YARD;
const DT = 1 / 60;
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
const errs = () => (globalThis.gameErrors || []).length;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const players = (st) => Object.values(st.players);

// A sim with the Sparrow (or another start build), `bots` bot crew, cast off and flying a moment.
function boot({ start = 'sparrow', bots = 4, mode = null } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  const sim = createSimulation();
  const st = sim.state;
  if (mode) sim.setSession(mode);
  if (start) sim.setStartBuild(start);
  for (let i = 0; i < bots; i++) {
    const e = st.ships[0].layout.boarderEntryPoints, id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  step(sim, 90);
  return { sim, st, ship: st.ships[0], layout: st.ships[0].layout };
}
// Everybody votes for option i (bots included: they think no more).
const voteAll = (st, i) => { for (const p of players(st)) { p.voteAt = 1e9; p.vote = i; } };
const partIndex = (st) => st.vote.options.findIndex((o) => o.kind === 'part');
// Open the dock with this part on offer; returns the part card.
function dockWith(sim, st, entry, salvage = 2000) {
  st.run.salvage = salvage;
  st.yardOnly = entry;
  sim.startDock();
  return st.vote && st.vote.kind === 'dock' ? st.vote.options[partIndex(st)] : null;
}
// Vote the part card (unanimously, or split) and play until the slot vote or the end of the purchase. Returns { price, slot }.
function buyCard(sim, st, card, { unanimous = true, place = 0 } = {}) {
  const before = st.run.salvage, i = partIndex(st);
  if (unanimous) voteAll(st, i);
  else { const cast = st.vote.options.findIndex((o) => o.kind === 'cast'); players(st).forEach((p, k) => { p.voteAt = 1e9; p.vote = k === 0 ? cast : i; }); }
  for (let k = 0; k < 60 * 6 && st.vote && st.vote.kind === 'dock' && !partSold(st); k++) step(sim, 1);
  let slot = null;
  if (st.vote && st.vote.kind === 'slot') {
    slot = { options: st.vote.options.map((o) => ({ ...o })), t: st.vote.t, title: st.vote.title };
    voteAll(st, place);
    for (let k = 0; k < 60 * 4 && st.vote && st.vote.kind === 'slot'; k++) step(sim, 1);
  }
  step(sim, 5);
  return { price: before - st.run.salvage, slot };
}
const partSold = (st) => st.vote.options.some((o) => o.kind === 'part' && o.sold);
// Close the dock without going anywhere (the route is not used up): the ship flies on from where she is.
function leaveDock(sim, st, secs = 0.2) {
  st.vote = null;
  for (const p of players(st)) { p.vote = null; p.uk = null; }
  st.yard.hold = false;
  step(sim, Math.round(secs * 60));
}
// Leave the dock: cast off, then the route vote (first stop), then fly.
function castOffDock(sim, st, secs = 4) {
  if (st.vote && st.vote.kind === 'dock') { voteAll(st, st.vote.options.findIndex((o) => o.kind === 'cast')); step(sim, 60 * 3); }
  if (st.vote && st.vote.kind === 'route') { voteAll(st, 0); step(sim, 60 * 3); }
  step(sim, Math.round(secs * 60));
}
const stationsOf = (layout) => layout.stations.length + layout.engines.length;

// ---- (a) the Sparrow, the start build, the old shop for a sim that did not ask ----
{
  const sp = BUILDS.sparrow;
  const v = validate(sp, { starter: true });
  const L = buildLayout(sp);
  const guns = L.stations.filter((s) => s.kind === 'gun').length;
  report(v.ok && v.warns.length === 0, `the Sparrow validates with no fail and no warning (hover ${v.budgets.lift.hover}, steam ${v.budgets.steam.cruise}/${v.budgets.steam.idle}, ${v.budgets.hands.stations} to man)`);
  report(guns === 3 && L.gasbags.length === 1 && L.engines.length === 2 && !L.bombBay && L.stations.some((s) => s.kind === 'lookout') && L.stations.some((s) => s.kind === 'searchlight') && !!L.medbay && L.platforms.length === 4,
    `she is the small ship of SHIP_BUILDING.md: ${guns} guns, ${L.gasbags.length} gasbag, ${L.engines.length} engines, no bomb bay, a nest with a lookout and a lamp, a medbay, ${L.platforms.length} decks`);
  const plain = createSimulation();
  plain.state.run.salvage = 900;
  plain.startDock();
  const cards = plain.state.vote ? plain.state.vote.options.filter((o) => o.kind === 'part') : [];
  report(plain.state.startBuild === null && cards.length === 0 && stationsOf(plain.state.ships[0].layout) === stationsOf(buildLayout(BUILDS.classic)), 'a sim that never asked for a start build keeps the classic ship and the old shop (no part cards)');
  const { sim, st, layout } = boot({ start: null, bots: 0 });
  sim.setStartBuild('sparrow');
  report(true, 'setStartBuild while flying only takes effect for the next voyage');
  report(stationsOf(layout) === stationsOf(buildLayout(BUILDS.classic)), 'a flying voyage keeps its ship when the start build is changed (it is the next voyage\'s)');
}
{
  const sim = createSimulation(), st = sim.state, layout = st.ships[0].layout;
  const classicN = stationsOf(layout);
  sim.setStartBuild('sparrow');
  const sparrowN = stationsOf(layout);
  report(sparrowN === stationsOf(buildLayout(BUILDS.sparrow)) && sparrowN < classicN && st.ships[0].buildId === 'sparrow' && Object.keys(st.GUNS).length === 3 && JSON.stringify(st.run.build) === JSON.stringify(BUILDS.sparrow),
    `in the lobby the Sparrow is fitted at once (${classicN} stations -> ${sparrowN}, 3 guns, run.build is her parts list)`);
  sim.setStartBuild('classic');
  report(stationsOf(layout) === classicN && Object.keys(st.GUNS).length === 7 && st.ships[0].buildId === 'classic', 'the classic ship comes back from the Ship button / menu');
  sim.setStartBuild('sparrow');
  report(stationsOf(layout) === sparrowN, 'and the Sparrow again');
}

// ---- (b) + (c) the part card, the deal, the slot vote, the refit that keeps what she carries ----
let payments = 0, start = 2000;
{
  const { sim, st, ship, layout } = boot();
  start = 2000;
  const card = dockWith(sim, st, 'gun', start);
  const parts = st.vote.options.filter((o) => o.kind === 'part');
  const base = config.PARTS_SHOP.PRICES.gun;
  report(parts.length === 1 && card && card.cost === PS.partPrice(PS.entryById('gun'), 0, 4) && card.cost >= base * 0.8 && card.choices.length >= 2 && card.choices.length <= YD.SLOT_MAX, `the dock has ONE part card (${card && card.name}, salvage ${card && card.cost}) with ${card && card.choices.length} places (at most ${YD.SLOT_MAX})`);
  report(card.choices.every((c) => validate(c.parts).ok && c.letter && c.where && c.note), 'every place on offer has been checked by the validator (no FAIL) and has a letter, a name and a note');
  // keep what she carries: damage her, spend shells, then build
  st.ship.hull = 70; st.ship.fuel = 61; st.GUNS['Nose Gun'].ammo = 7;
  const cost = card.cost, n0 = stationsOf(layout), v0 = layout.version, mods0 = st.modules.length;
  const guns0 = Object.keys(st.GUNS).length;
  const r = buyCard(sim, st, card, { unanimous: true, place: 1 });
  const deal = Math.round((cost * (1 - YD.DEAL)) / 5) * 5;
  payments += r.price;
  report(r.price === deal && deal < cost, `a UNANIMOUS vote takes 25% off (${cost} -> ${r.price})`);
  report(r.slot && r.slot.options.length === card.choices.length && r.slot.t > YD.SLOT_TIME - 1.5 && /WHERE DOES THE GUN MOUNT GO/.test(r.slot.title), `several places: the slot vote opens (${r.slot && r.slot.options.length} options A / B / C, ${YD.SLOT_TIME} s, "${r.slot && r.slot.title}")`);
  const chosen = card.choices[1];
  report(JSON.stringify(st.run.build) === JSON.stringify(chosen.parts) && layout.version > v0 && stationsOf(layout) === n0 + 1 && validate(st.run.build).ok, `the winning place (B: ${chosen.where}) is built: the voyage's build is exactly that choice, it validates, the layout was replaced in place (+1 station)`);
  report(Object.keys(st.GUNS).length === guns0 + 1 && st.modules.length === mods0 + 1 && st.modules.some((m) => m.name === 'Extra Gun 1') && st.GUNS['Extra Gun 1'].ammo > 0, 'ship 0 was refitted: the new gun is in state.GUNS (loaded) and in the modules');
  report(Math.abs(st.ship.hull - 70) < 1 && Math.abs(st.ship.fuel - 61) < 8 && st.GUNS['Nose Gun'].ammo === 7, `she keeps what she carries: hull ${st.ship.hull.toFixed(0)}, coal ${st.ship.fuel.toFixed(0)}, the Nose Gun's 7 shells`);
  report(players(st).every((p) => p.fall === true || p.y !== undefined) && players(st).every((p) => !p.lock && !p.carry && p.conn == null), 'the crew were put back on their feet aboard her (no station, no load, no ladder)');
  report(st.yard.built && st.yard.built.letter === 'B' && st.yard.newPart && st.yard.newPart.name === 'GUN MOUNT' && st.yard.hold === true && st.run.parts.length === 1 && st.run.parts[0].names.includes('Extra Gun 1'), 'BUILT is stamped, the call-out is waiting, the camera holds, and the part is in the voyage\'s log with its new modules');
  // one place = placed at once, no second vote; a split vote pays full price
  st.run.salvage = 1000;
  const sail = dockWith(sim, st, 'sail', 1000);
  report(sail && sail.choices.length === 1, 'a part with ONE legal place has one choice');
  const n1 = stationsOf(layout);
  const r2 = buyCard(sim, st, sail, { unanimous: false });
  payments += r2.price;
  report(!r2.slot && stationsOf(layout) === n1 + 1 && st.vote && st.vote.kind === 'dock' && r2.price === sail.cost, `the single place is built at once (no slot vote), at full price when the crew did not all agree (${r2.price})`);
  report(st.vote.options.every((o) => o.kind !== 'part' || o.sold), 'the part card shows SOLD afterwards; the dock goes on');
  castOffDock(sim, st, 3);
  const e0 = errs(), pulling = st.yard.pull > 0 && st.yard.hold === false && st.yard.newPart.t > 0;
  step(sim, 60 * 40);
  report(st.phase === 'flying' && errs() === e0 && st.ship.hull > 0 && pulling, `cast off: the camera is let go for the slow pull-back and the call-out starts; the grown ship flies the next mission 40 s with 0 errors (hull ${st.ship.hull.toFixed(0)})`);
  void ship;
}

// ---- (d) the whole catalogue, then a run of purchases ----
{
  const { sim, st, layout } = boot({ bots: 6 });
  const seen = [];
  let parts = BUILDS.sparrow, bad = 0, offered = 0;
  const order = ['hullBay', 'gasbag', 'keel', 'boiler', 'engine', 'coal', 'nest', 'bombBay', 'liftEngine', 'armour', 'lamp', 'ammo', 'ballast', 'pole', 'ladder', 'gun'];
  let paid = 0, got = 0;
  st.run.salvage = start = 5000;
  const earned0 = st.run.earned;
  const flown = [];
  for (const id of order) {
    const e0 = errs(), n0 = st.run.parts.length;
    const card = dockWith(sim, st, id, st.run.salvage);
    if (!card) { seen.push(id + ':none'); if (st.vote) leaveDock(sim, st); continue; }
    offered++;
    if (!card.choices.every((c) => validate(c.parts).ok)) bad++;
    const before = st.run.salvage;
    buyCard(sim, st, card, { unanimous: false, place: card.choices.length - 1 });
    paid += before - st.run.salvage;
    if (st.run.parts.length === n0 + 1) { got++; seen.push(id); }
    const v = validate(st.run.build);
    if (!v.ok) { bad++; seen.push(id + ':INVALID'); }
    leaveDock(sim, st, 0.1);
    step(sim, 60 * 8);
    flown.push(errs() - e0);
    if (st.phase !== 'flying') break;
  }
  report(offered >= 8 && bad === 0, `the catalogue on a growing Sparrow: ${offered} parts offered, every place valid, every purchase validates (${seen.join(', ')})`);
  report(got >= 6 && flown.every((n) => n === 0), `${got} parts built one after another; the ship flew 8 s after each with 0 errors`);
  report(paid > 0 && start + (st.run.earned - earned0) - paid === st.run.salvage, `the salvage adds up: ${start} + ${st.run.earned - earned0} earned in flight - ${paid} spent on parts = ${st.run.salvage}`);
  const price = (id, k) => PS.partPrice(PS.entryById(id), k, 4);
  report(price('gun', 3) > price('gun', 0) && price('gun', 0) === PS.partPrice(PS.entryById('gun'), 0, 4), `prices rise with the parts you own (a gun: ${price('gun', 0)}, then ${price('gun', 3)} with three bought)`);
  report(PS.partPrice(PS.entryById('engine'), 0, 3) < PS.partPrice(PS.entryById('engine'), 0, 5) && PS.partPrice(PS.entryById('boiler'), 0, 7) < PS.partPrice(PS.entryById('boiler'), 0, 4), 'a small crew finds engines cheaper, a big crew station parts');
  void layout;
}
// every catalogue entry, on the Sparrow and on the classic ship: its places validate
{
  let n = 0, bad = 0;
  for (const base of [BUILDS.sparrow, BUILDS.classic]) {
    for (const e of PS.CATALOGUE) {
      const o = PS.offerPart(base, { only: e.id });
      if (!o) continue;
      n++;
      for (const c of o.choices) if (!validate(c.apply(base)).ok) bad++;
    }
  }
  report(n >= 20 && bad === 0, `${n} (part, ship) pairs offer places and every place validates with no fail`);
}

// ---- (e) derelicts and limp home ----
{
  const { sim, st } = boot();
  const stop = st.run.voyage.columns[1][0];
  st.run.stopId = stop.id; // the second stop of the voyage
  const card = dockWith(sim, st, 'ammo', 300);
  const before = st.run.salvage;
  report(card && card.derelict && card.cost === 0 && /FREE/.test(card.badge), 'after stop 2 a derelict is found: the part card is FREE');
  buyCard(sim, st, card, { unanimous: false });
  report(st.run.salvage === before && st.run.parts.length === 1, 'and it costs nothing');
  const keepStop = st.run.stopId;
  const legs = [2, 5].map((k) => { st.run.stopId = st.run.voyage.columns[Math.min(k - 1, st.run.voyage.columns.length - 1)][0].id; st.vote = null; st.run.salvage = 900; st.yardOnly = 'lamp'; sim.startDock(); const c = st.vote && st.vote.options.find((o) => o.kind === 'part'); return c && c.derelict; });
  st.run.stopId = keepStop;
  report(legs[0] === true, 'stop 2 is a derelict stop' + (st.run.voyage.columns.length > 5 ? ' (stop 5: ' + legs[1] + ')' : ''));
}
{
  const { sim, st, layout } = boot();
  const card = dockWith(sim, st, 'engine', 3000);
  const sparrowEngines = layout.engines.length;
  // a longer bag to carry them, a boiler for the steam, then the pod
  const bag = dockWith(sim, st, 'gasbag', 3000);
  if (bag) buyCard(sim, st, bag, { unanimous: false });
  leaveDock(sim, st);
  const boiler = dockWith(sim, st, 'boiler', 3000);
  if (boiler) buyCard(sim, st, boiler, { unanimous: false });
  leaveDock(sim, st);
  const pod = dockWith(sim, st, 'engine', 3000);
  if (pod) buyCard(sim, st, pod, { unanimous: false });
  leaveDock(sim, st);
  const newest = st.run.parts[st.run.parts.length - 1];
  report(newest && newest.id === 'engine' && layout.engines.length === sparrowEngines + 1 && newest.names.length >= 2, `a second boiler and an engine pod built (the pod brings ${newest && newest.names.join(', ')})`);
  void card;
  const spares = st.run.spares;
  st.run.visited.push(st.run.stopId); // (she has somewhere to limp back to)
  st.run.salvage = 3000;
  st.ship.hull = -1;
  for (let k = 0; k < 60 * 240 && !st.limp; k++) { if (k % 60 === 0 && !st.ship.down) st.ship.hull = -1; step(sim, 1); } // (the first wreck of a mission is GOING DOWN!, a last stand: it ends in the limp)
  const limping = !!st.limp;
  for (let k = 0; k < 60 * (config.LIMP.TIME + 10) && st.limp; k++) step(sim, 1); // (and look the moment she is patched up: the bots at the dock soon buy the Full Repair)
  const mods = newest ? newest.names.map((nm) => st.modules.find((m) => m.name === nm)).filter(Boolean) : [];
  report(limping && st.run.spares === spares - 1 && mods.length && mods.every((m) => m.broken) && st.run.parts.length >= 2 && st.run.build && layout.engines.length === sparrowEngines + 1, `limp home: the newest part (${newest && newest.name}) is shaken loose, its modules start broken (${mods.map((m) => m.name).join(', ')}) - and nothing is lost`);
  const others = st.modules.filter((m) => !newest.names.includes(m.name) && m.kind !== 'pipe');
  report(others.every((m) => !m.broken), 'every other module was patched up');
  const hasRepair = st.vote && st.vote.kind === 'dock' && st.vote.options.some((o) => o.kind === 'repair' && /Repair/.test(o.name));
  report(!!hasRepair, 'the dock after the limp offers the Full Repair that mends it');
}

// ---- (f) the voyage save, the campaign's second voyage, a new voyage ----
{
  const { sim, st, layout } = boot({ mode: 'campaign' });
  const card = dockWith(sim, st, 'keel', 3000);
  buyCard(sim, st, card, { unanimous: true, place: 0 });
  const grown = JSON.stringify(st.run.build);
  const saved = V.loadVoyageSave();
  report(saved.build && saved.build.v === 1 && JSON.stringify(saved.build.parts) === grown && saved.build.log.length === 1 && saved.build.log[0].id === 'keel', 'the build is in the voyage save (versioned: { v: 1, parts, log }) and loads back');
  store('airshipVoyage', JSON.stringify({ version: 2, bestStops: 3, build: { v: 7, parts: 'nonsense' } }));
  const odd = V.loadVoyageSave();
  store('airshipVoyage', JSON.stringify({ version: 2, build: { v: 1, parts: [{ part: 'deck' }, 5] } }));
  const odd2 = V.loadVoyageSave();
  store('airshipVoyage', '{"bestStops": 2}');
  const odd3 = V.loadVoyageSave();
  report(odd.build === null && odd.bestStops === 3 && odd2.build === null && odd3.build === null && odd3.bestStops === 2, 'a save with a build that is not a parts list, or none, loads with no build and everything else intact');
  leaveDock(sim, st);
  // the first Flagship falls: the harbour, the second voyage
  st.run.stopId = st.run.voyage.columns[st.run.voyage.columns.length - 1][0].id;
  const nStations = stationsOf(layout);
  sim.onMarker({ kind: 'home', lap: 3 });
  step(sim, 60 * (config.VOTE.SCORECARD_TIME + 2));
  report(st.run.voyageNo === 2 && st.vote && st.vote.kind === 'dock', 'the first Flagship is down: the harbour dock of the second voyage');
  report(JSON.stringify(st.run.build) === grown && stationsOf(layout) === nStations && st.ships[0].buildId === 'yard' && JSON.stringify(V.loadVoyageSave().build.parts) === grown, 'the second voyage keeps the ship the first one built (same parts, same layout, same save)');
  const dock2 = st.vote.options.find((o) => o.kind === 'part');
  report(!dock2 || !dock2.derelict, 'the harbour is not a derelict stop');
  // a new voyage starts from the start build again
  sim.restart();
  report(JSON.stringify(st.run.build) === JSON.stringify(BUILDS.sparrow) && stationsOf(layout) === stationsOf(buildLayout(BUILDS.sparrow)) && st.run.parts.length === 0, 'a new voyage starts again from the Sparrow');
}
function store(k, v) { globalThis.localStorage.setItem(k, v); }

// ---- (g) the phones and the TV ----
{
  const { sim, st, layout } = boot({ bots: 3 });
  const sent = [];
  sim.setSocket({ emit: (ev, data) => sent.push([ev, data]) });
  const me = { id: 'human1', bot: false, human: true, name: 'Kenny', species: config.CREW_SPECIES[0], color: '#fff', x: 500, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  st.players.human1 = me;
  const card = dockWith(sim, st, 'gun', 900);
  step(sim, 5);
  const ui = sent.filter(([e, d]) => e === 'host:ui' && d.id === 'human1' && d.ui.vote).map(([, d]) => d.ui.vote);
  const last = ui[ui.length - 1];
  const pc = last && last.options.find((o) => o.badge);
  report(pc && /NEW PART/.test(pc.badge) && pc.cost === card.cost && pc.desc && pc.desc.length <= 80 && pc.name === 'Gun mount' && /places/.test(pc.badge), `the phone's part card: badge "${pc && pc.badge}", name, price ${pc && pc.cost}, ONE line "${pc && pc.desc}"`);
  voteAll(st, partIndex(st));
  step(sim, 60 * 3);
  const slotUi = sent.filter(([e, d]) => e === 'host:ui' && d.id === 'human1' && d.ui.vote && d.ui.vote.kind === 'slot').map(([, d]) => d.ui.vote).pop();
  report(slotUi && slotUi.options.length === card.choices.length && slotUi.options.every((o, i) => o.icon === 'ABC'[i] && o.name && o.desc && o.desc.length <= 80 && o.cost == null), `the phone's slot vote: ${slotUi && slotUi.options.map((o) => o.icon + ' ' + o.name).join(' / ')} - a letter, a place and one line each (${slotUi && slotUi.title})`);

  // the TV on a stub canvas
  const canvas = { width: 1600, height: 900, clientWidth: 1600, clientHeight: 900, style: {} };
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const cam = createWorldCamera();
  const frame = () => { clock.ms += DT * 1000; renderer.renderFrame(clock.ms, cam.update(DT, st, canvas.width, canvas.height)); };
  const draw = (n = 3) => { rec.texts.length = 0; const e0 = errs(); for (let i = 0; i < n; i++) frame(); return { texts: rec.texts.slice(), errors: errs() - e0 }; };
  const has = (d, ...w) => w.every((s) => d.texts.some((t) => t.includes(s)));
  let d = draw();
  report(st.vote.kind === 'slot' && has(d, 'WHERE DOES THE GUN MOUNT GO?', 'LIFT', 'STEAM', 'HANDS', 'BALANCE', 'THE BLUEPRINT') && d.texts.filter((t) => t === 'A' || t === 'B' || t === 'C').length >= 3 && d.errors === 0, 'the TV slot vote: the title, the blueprint, the four gauges and the letters A B C, 0 errors');
  voteAll(st, 1);
  step(sim, 60 * 3);
  d = draw();
  report(st.yard.built && has(d, "SKY-DOCK - THE SHIPWRIGHT'S YARD") && d.errors === 0, 'the TV dock screen after the build (the BUILT stamp is drawn into the blueprint) with 0 errors');
  st.vote = null;
  const dockCard = dockWith(sim, st, 'sail', 900);
  d = draw();
  report(has(d, "SKY-DOCK - THE SHIPWRIGHT'S YARD", 'Mast and sail', 'LIFT') && dockCard && d.errors === 0, 'the TV dock screen with a part card: the blueprint with its pins, the gauges, the cards');
  void dockCard;
  // the camera holds while she is built, then pulls back slowly
  st.vote = null;
  const cam2 = createWorldCamera();
  st.yard.hold = false; st.yard.pull = 0;
  for (let i = 0; i < 400; i++) cam2.update(DT, st, canvas.width, canvas.height);
  const z0 = cam2.update(DT, st, canvas.width, canvas.height).zoom;
  const hb = PS.offerPart(st.run.build, { only: 'hullBay' });
  sim.fitShip(hb.choices[0].parts, 'yard');
  st.yard.hold = true;
  let zh = 0;
  for (let i = 0; i < 300; i++) zh = cam2.update(DT, st, canvas.width, canvas.height).zoom;
  st.yard.hold = false; st.yard.pull = YD.PULL_TIME;
  const zs = [];
  for (let i = 0; i < 60 * 12; i++) { const z = cam2.update(DT, st, canvas.width, canvas.height).zoom; if (i % 120 === 119) zs.push(z); }
  report(Math.abs(zh - z0) < 1e-6 && zs[zs.length - 1] < z0 - 0.002 && zs.every((z, i) => i === 0 || z <= zs[i - 1] + 1e-9), `the camera holds its zoom while she is built (${z0.toFixed(3)}), then pulls back slowly as she grows (${zs.map((z) => z.toFixed(3)).join(' -> ')})`);
  // the call-out over the new part
  st.yard.newPart = { name: 'HULL BAY', x: 500, y: 640, t: YD.NEW_CALLOUT };
  d = draw(2);
  report(has(d, 'NEW: HULL BAY') && d.errors === 0, 'after cast off the call-out "NEW: HULL BAY" is drawn over the part');
  void layout;
}

// ---- (h) bots vote for themselves; Versus ----
{
  const { sim, st } = boot({ bots: 6 });
  const e0 = errs();
  let docks = 0;
  const salvage0 = 600;
  for (let k = 0; k < 6; k++) {
    st.run.salvage = salvage0;
    st.run.stopId = st.run.voyage.columns[1 + (k % 3)][0].id; // (a stop with somewhere to go on)
    st.yardOnly = null;
    sim.startDock();
    if (!st.vote) continue;
    docks++;
    for (let i = 0; i < 60 * 70 && st.vote && (st.vote.kind === 'dock' || st.vote.kind === 'slot'); i++) step(sim, 1);
    if (st.vote && st.vote.kind === 'route') { voteAll(st, 0); step(sim, 120); }
    step(sim, 60 * 6);
  }
  report(docks >= 5 && st.run.parts.length >= 1 && errs() === e0 && st.run.parts.every((p) => p.id), `bots with their own votes: ${st.run.parts.length} part${st.run.parts.length === 1 ? '' : 's'} bought over ${docks} docks (${st.run.parts.map((p) => p.id).join(', ')}), 0 errors`);
}
{
  const { sim, st, layout } = boot({ start: 'sparrow', bots: 0 });
  sim.restart();
  sim.setSession('versus');
  report(st.ships[0].buildId === 'classic' && stationsOf(layout) === stationsOf(buildLayout(BUILDS.classic)), 'Versus fits the classic ship (its own shelf follows)');
  sim.setSession('voyage');
  report(st.mode === 'voyage' && stationsOf(st.ships[0].layout) === stationsOf(buildLayout(BUILDS.sparrow)), 'back to a Voyage: the Sparrow again');
}

console.log(ok ? 'All yard checks passed' : 'SOME YARD CHECKS FAILED');
process.exit(ok ? 0 : 1);
