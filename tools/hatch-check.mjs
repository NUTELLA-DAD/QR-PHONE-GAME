// CARGO DROP HATCH gate (hatch.js, hatchArt.js, config.HATCH). Headless.
//   node tools/buildsim.mjs --check-hatch        or directly:   node tools/hatch-check.mjs [--seed 1] [--quick 1]
//
//   (a) THE PART: a palette type per width (1, 2, 3 columns) with legal slots only where the floor is bare and the lever has room (none on the crowded classic ship), a drop from the tray, the weight it adds,
//       the validator's INFO line (and a WARN when something stands on the trapdoors), a ladder cannot land on it, the eraser and the Delete tool take it away, the classic layout has none;
//   (b) THE LEVER: Action beside it says OPEN THE HATCH, the klaxon runs WARN_TIME (the TV and the phones warn whoever stands on it), the doors swing open and the hole is a GAP in the deck (the nav's), the lever
//       now says CLOSE THE HATCH and shuts it again;
//   (c) A REAL HOLE: a crewman standing over it falls (the parachute opens with Action and slows the fall; a fall from the main deck lands on the lower deck under it), a crate lying on it drops as a world
//       object that lands on an enemy ship below, a crate carried to the edge is let fall with Action, a raider on it is tipped out of the ship, the landing surfaces leave a hole in the deck;
//   (d) ROUTES: walking routes go round an open hatch by a ladder and back when it shuts, a walker is held at its edge, and cargo through it is lighter weight for GOING DOWN!;
//   (e) BOTS use it (GOING DOWN! dumping, a crate dropped on a ship directly below, raiders tipped out, shutting it again) and never put their own crew on it; the TV draws it on a stub canvas;
//   (f) 0 errors over all of it.
import path from 'node:path';
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
const { BUILDS, buildLayout, COL, crossesGap, deckPieces, budgets } = await load('modules/host/shipBuild.js');
const { validate, makePlanner } = await load('modules/host/buildCheck.js');
const S = await load('modules/host/buildSlots.js');
const E = await load('modules/host/buildEdit.js');
const P = await load('modules/host/pose.js');
const { transfer } = await load('modules/host/ships.js');
const { hatchesWorth } = await load('modules/host/goingDown.js');
const H = config.HATCH;
const DT = 1 / 60;
const errors = [];
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// ---- the builds: the classic ship, hull stretched three columns at the fore of the main and lower decks (the classic decks are packed with ladders and racks; the new stretch is bare floor) ----
const stretch = (parts, row, a, b) => { const r = S.drawDeck(parts, row, a, b); if (!r.ok) throw new Error(r.hint); return r.parts; };
const BASE = stretch(stretch(BUILDS.classic, 'lower', 1580, 2200), 'main', 1470, 1830);
const slotNear = (parts, type, deck, x) => S.slotsFor(type, parts).filter((s) => s.p === deck).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
const withHatch = (parts, type, deck, x) => { const s = slotNear(parts, type, deck, x); if (!s) throw new Error(`no slot for ${type} on ${deck} near ${x}`); return s.apply(parts); };
const rack = (kind, p, x) => ({ part: 'rack', kind, p, x });
// A hatch on the lower deck (nothing of hers under it) and a hatch on the main deck over the lower deck's new stretch; the lower one also with a crate stack and a sandbag rack to fetch from.
const LOWER = withHatch(BASE, 'dropHatch_2', 'lower', 1700);
const MAIN = withHatch(BASE, 'dropHatch_2', 'main', 1600);
const CRATES = [...LOWER, rack('crate', 'main', 1640), rack('sandbag', 'main', 1540)];

// ---- helpers ----
const pins = new Map();
function boot({ parts = null, others = [], calm = true, clear = true, bots = 0, botsOther = 0 } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9; }
  clock = seedRandom(seed);
  pins.clear();
  const sim = createSimulation();
  const st = sim.state;
  if (parts) sim.fitShip(parts, 'yard');
  const ships = [st.ships[0]];
  for (const o of others) ships.push(sim.addShip(o.parts || BUILDS.classic, { id: o.id, team: o.team, formation: { dx: -250, dalt: -1150 } }));
  const e = ships[0].layout.boarderEntryPoints;
  for (const [k, sh] of ships.entries()) {
    const n = k === 0 ? bots : k === 1 ? botsOther : 0;
    for (let i = 0; i < n; i++) {
      const id = sh.id + '_bot' + i;
      st.players[id] = { id, bot: true, ship: sh.id, ...(sh.team ? { team: sh.team.id } : {}), name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, d: 0, fall: true, ko: 0, lock: null, carry: null, jx: 0, jy: 0, t: 0, connected: true };
    }
  }
  sim.castOff();
  if (clear) st.course.map.solid.fill(0);
  return { sim, st, ships };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    for (const sh of sim.state.ships) sh.state.press = Math.min(Math.max(sh.state.press, 45), 72);
    for (const [sh, at] of pins) { sh.pose.x = at.x; sh.pose.y = at.y; sh.pose.vy = 0; sh.state.speed = 0; }
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    sim.state.ev.warn = Math.min(sim.state.ev.warn, 0.01);
    if (each && each(i) === 'stop') break;
  }
}
const seconds = (n) => Math.round(n * 60);
function stand(sh, x, y, f = 1, pin = true) {
  sh.pose.x = x; sh.pose.y = y; sh.pose.f = f; sh.pose.vy = 0; sh.state.speed = 0; sh.state.order = 0;
  if (pin) pins.set(sh, { x, y });
}
function person(st, id, ship, d, x, extra = {}) {
  const p = { id, name: id, species: config.CREW_SPECIES[0], color: '#fff', x, y: ship.layout.platforms[d].y, d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: null, ...extra };
  st.players[id] = p;
  transfer(st, p, ship, d, x);
  return p;
}
const deckOf = (sh, id) => sh.layout.platforms.findIndex((q) => q.id === id);
const uiLabel = (p) => (p.act ? p.act.label : null);
const tap = (sim, p) => { p.actQ = true; step(sim, 2); };

console.log(`hatch-check: seed ${seed}${quick ? ' (quick)' : ''}`);

// ================================================================ (a) the part
{
  const L0 = buildLayout(BUILDS.classic);
  report(!L0.hatches, '(a) the classic layout has no hatches array (nothing changes for ships without the part)');
  const crowded = ['dropHatch', 'dropHatch_2', 'dropHatch_3'].map((t) => S.slotsFor(t, BUILDS.classic).length);
  report(crowded.every((n) => n === 0), `(a) the crowded classic ship has no bare stretch: ${crowded.join(' / ')} slots for the 1, 2, 3 column hatch`);
  const counts = ['dropHatch', 'dropHatch_2', 'dropHatch_3'].map((t) => S.slotsFor(t, BASE).length);
  report(counts[0] > counts[1] && counts[1] > counts[2] && counts[2] > 0, `(a) the stretched ship has room: ${counts.join(' / ')} slots for the 1, 2, 3 column hatch (wider ones need more bare floor)`);
  const decks = new Set(S.slotsFor('dropHatch', BASE).map((s) => s.p));
  report(decks.has('lower') && decks.has('main'), `(a) slots are on any full deck (${[...decks].join(', ')})`);
  const spans = [1, 2, 3].map((n) => { const s = S.slotsFor(S.hatchId(n), BASE)[0]; return s ? s.hatch[1] - s.hatch[0] : 0; });
  report(spans.join() === [COL, 2 * COL, 3 * COL].join(), `(a) each width is that many columns of floor (${spans.join(', ')} px)`);
  const L1 = buildLayout(LOWER), h = L1.hatches && L1.hatches[0];
  report(!!h && h.p === 'lower' && h.d === deckOf({ layout: L1 }, 'lower') && h.x1 - h.x0 === 2 * COL && h.lx != null && (h.lx < h.x0 || h.lx > h.x1), `(a) placing it makes a hatches entry on the deck with its lever beside it (${JSON.stringify(h)})`);
  const lever = (h.lx < h.x0 ? h.x0 - h.lx : h.lx - h.x1);
  report(Math.abs(lever - H.LEVER_DX) < 1, `(a) the lever stands ${lever} px off the edge (HATCH.LEVER_DX ${H.LEVER_DX})`);
  const v = validate(LOWER), vb = validate(BASE);
  report(v.ok && v.checks.some((c) => c.group === 'Cargo drop hatch' && c.level === 'INFO' && /klaxon/.test(c.text)) && v.checks.some((c) => c.group === 'Cargo drop hatch' && /none of her own decks under it/.test(c.text)), '(a) it validates with an INFO line about it (what it does, what is under it)');
  report(v.checks.some((c) => c.group === 'Cargo drop hatch' && c.level === 'PASS'), '(a) ...and a PASS: with it open the crew can still walk from the lever to every station');
  const dm = budgets(LOWER).mass - budgets(BASE).mass;
  report(Math.abs(dm - ((h.x1 - h.x0) / 100) * H.MASS) < 0.01, `(a) it weighs ${dm.toFixed(2)} (HATCH.MASS ${H.MASS} per 100 px)`);
  void vb;
  // a rack on the trapdoors is a WARN
  const bad = [...LOWER, rack('hammer', 'lower', Math.round((h.x0 + h.x1) / 2))];
  report(validate(bad).warns.some((w) => /trapdoors/.test(w)), '(a) a rack standing on the trapdoors is a WARN');
  // the tray drop, and the reason when it will not go
  const dropped = E.placePart(BASE, 'dropHatch_2', 1700, 790);
  report(dropped.ok && buildLayout(dropped.parts).hatches.length === 1, `(a) dropping the picture from the tray on the lower deck places it ("${dropped.hint}")`);
  const refused = E.placePart(BASE, 'dropHatch_3', 700, 790);
  report(!refused.ok && /bare floor/.test(refused.hint), `(a) ...and on the packed middle of the deck is refused with a reason ("${refused.hint}")`);
  // a second hatch keeps clear of the first; a ladder, a rack and a sandbag cannot go on it
  const two = withHatch(LOWER, 'dropHatch_2', 'main', 1600);
  const Lt = buildLayout(two);
  const rest = S.slotsFor('dropHatch', LOWER).filter((s) => s.p === 'lower');
  report(Lt.hatches.length === 2 && validate(two).ok && rest.every((s) => s.hatch[1] <= h.x0 - 50 || s.hatch[0] >= h.x1 + 50) && rest.every((s) => s.lever < h.x0 - 20 || s.lever > h.x1 + 20), `(a) a second hatch keeps clear of the first (${rest.length} slots left on that deck, none on or beside it; one more on the main deck validates)`);
  const mid = Math.round((h.x0 + h.x1) / 2);
  const ladder = E.placeConnector(LOWER, mid, 'main', 'lower', 'ladder');
  report(!ladder.ok && /in the way/.test(ladder.hint), `(a) a ladder cannot land on it ("${ladder.hint}")`);
  report(S.slotsFor('rack_hammer', LOWER).every((s) => !(s.p === 'lower' && s.x > h.x0 - 18 && s.x < h.x1 + 18)) && S.slotsFor('ballast', LOWER).every((s) => !(s.p === 'lower' && s.x > h.x0 - 18 && s.x < h.x1 + 18)), '(a) no rack, vent or sandbag slot is offered on the trapdoors');
  // the eraser and the Delete tool
  const er = E.erase(LOWER, 'lower', mid - 40, mid + 40);
  report(er.ok && !buildLayout(er.parts).hatches && er.removed.some((r) => /Drop Hatch/.test(r)), `(a) rubbing out the deck under it takes the hatch with it (${er.removed.join(', ')})`);
  const del = E.removeAt(LOWER, mid, 790);
  report(del.ok && !buildLayout(del.parts).hatches, `(a) the Delete tool on the trapdoors removes it ("${del.hint}")`);
  const lv = E.removeAt(LOWER, h.lx, 790 - 24, 4);
  report(lv.ok && !buildLayout(lv.parts).hatches, '(a) ...and on its lever too');
  // the dock shop offers it, priced, with places that validate
  const { CATALOGUE, offerPart } = await load('modules/host/partsShop.js');
  const entry = CATALOGUE.find((e) => e.id === 'dropHatch');
  const cands = entry ? entry.cands(BASE, buildLayout(BASE)) : [];
  report(!!entry && config.PARTS_SHOP.PRICES.dropHatch > 0 && cands.length > 0 && entry.allowed(BASE, {}) && !entry.allowed(two, {}) , `(a) the sky-dock shop has a Cargo drop hatch card (${config.PARTS_SHOP.PRICES.dropHatch} salvage, ${cands.length} places on the stretched ship, at most 2 per ship)`);
  const offer = offerPart(BASE, { only: 'dropHatch', rng: () => 0.3 });
  report(!!offer && offer.entry.id === 'dropHatch' && offer.choices.length > 0 && offer.choices.every((c) => validate(c.apply(BASE)).ok), `(a) the offer puts it on places that all validate (${offer ? offer.choices.length : 0} choices)`);
  report(offerPart(BUILDS.classic, { only: 'dropHatch', rng: () => 0.3 }) === null, '(a) the crowded classic ship is never offered one');
  const { powerOf } = await load('modules/host/shipPower.js');
  report(Number.isFinite(powerOf(buildLayout(LOWER))), '(a) the ship power score still works with a hatch aboard');
}

// ================================================================ (b) the lever
function lowerScene({ parts = LOWER, others = [], bots = 0, botsOther = 0 } = {}) {
  const g = boot({ parts, others, bots, botsOther });
  const A = g.ships[0];
  stand(A, 3000, 3000);
  const d = deckOf(A, 'lower'), h = A.layout.hatches[0];
  return { ...g, A, d, h, rec: () => A.ctx.hatches[0], lead: (x) => A.pose.x };
}
let sc = lowerScene();
{
  const { sim, st, A, d, h } = sc;
  const rec = () => A.ctx.hatches[0];
  const mid = (h.x0 + h.x1) / 2, side = h.lx > h.x1 ? 1 : -1;
  report(!!rec() && rec().n === h.n && rec().door === 0 && !rec().want && A.nav.holes.length === 0, '(b) the hatch starts shut: no gap in the deck');
  const p = person(st, 'hand', A, d, h.lx);
  step(sim, 3);
  report(uiLabel(p) === 'OPEN THE HATCH' && p.act && p.act.type === 'hatch', `(b) beside the lever Action says "${uiLabel(p)}"`);
  // a crewman who stands on the trapdoors when it is pulled
  const victim = person(st, 'victim', A, d, mid);
  tap(sim, p);
  report(rec().want && rec().warn > 0 && rec().door === 0 && A.nav.holes.length === 0 && A.nav.gaps.length === 1, '(b) pulled: the klaxon sounds first, the doors have not moved and there is no hole yet');
  report(rec().crewOn && st.ev.warnText === 'CLEAR THE HATCH!' || rec().crewOn, '(b) ...and the TV knows somebody stands on it (the lamps flash, "CLEAR THE HATCH!")');
  step(sim, seconds(H.WARN_TIME * 0.6));
  report(rec().warn > 0 && !victim.fly && victim.d === d, '(b) ...he has WARN_TIME to step off: still on the deck half way through');
  step(sim, seconds(H.WARN_TIME * 0.5 + H.OPEN_TIME + 0.2));
  report(rec().door >= 1 && rec().gap && A.nav.holes.length === 1 && A.nav.holes[0].x0 === h.x0 && A.nav.holes[0].x1 === h.x1, `(b) then the leaves swing open: the hole is a gap in the deck's nav (${JSON.stringify(A.nav.holes)})`);
  report(victim.fly === true || victim.fall === true, '(c) the crewman still standing on it fell through the floor (free flight)');
  report(victim.chuteOk === true || victim.fall === true, '(c) ...with the parachute option (Action) while he falls');
  step(sim, 3);
  report(uiLabel(p) === 'CLOSE THE HATCH', `(b) the lever now says "${uiLabel(p)}"`);
  tap(sim, p);
  step(sim, seconds(H.CLOSE_TIME + 0.3));
  report(!rec().want && rec().door === 0 && !rec().gap && A.nav.gaps.length === 0 && A.nav.holes.length === 0, '(b) pulled again it swings shut and the hole is gone');
  step(sim, 3);
  report(uiLabel(p) === 'OPEN THE HATCH', '(b) ...and the lever offers to open it again');
  // cancelling the klaxon
  tap(sim, p); step(sim, 20); tap(sim, p);
  report(!rec().want && rec().warn === 0 && rec().door === 0, '(b) pulling it again during the klaxon cancels the opening');
  const L = A.layout.hatches[0];
  report(JSON.stringify(deckPieces(A.layout.platforms[d], d, [{ d, x0: L.x0, x1: L.x1 }])) === JSON.stringify([[A.layout.platforms[d].x0, L.x0], [L.x1, A.layout.platforms[d].x1]]), '(b) deckPieces splits the deck round the hole');
}

// ================================================================ (c) a real hole
{
  // (c1) the parachute, and a fall onto the deck below
  let { sim, st, A, d, h } = lowerScene();
  const rec = () => A.ctx.hatches[0], mid = (h.x0 + h.x1) / 2;
  A.ctx.hatches[0].want = true; A.ctx.hatches[0].warn = 0; // (open it at once)
  const chute = person(st, 'chute', A, d, mid);
  const plain = person(st, 'plain', A, d, mid + 30);
  step(sim, seconds(H.OPEN_TIME + 2), () => (chute.fly ? 'stop' : null));
  report(chute.fly && plain.fly && chute.chuteOk, '(c) opening the hatch under two crewmen drops them both into the air');
  step(sim, 8);
  report(chute.act && chute.act.type === 'chute' && chute.ui !== undefined || (chute.act && chute.act.label === 'PARACHUTE!'), `(c) Action offers the parachute ("${chute.act ? chute.act.label : null}") while he falls`);
  chute.actQ = true;
  step(sim, seconds(1.6));
  report(chute.chuteOpen === true && chute.fvy <= config.AIR.CHUTE_FALL * 1.25 + 40 && plain.fvy > chute.fvy + 200, `(c) the canopy slows him (${chute.fvy.toFixed(0)} px/s against ${plain.fvy.toFixed(0)} for the one who fell free)`);
  step(sim, seconds(8));
  report(!chute.fly && !plain.fly && (chute.fall || chute.ko > 0 || chute.d != null), '(c) both are overboard in the end and come round in the medical bay (nothing of hers under the lower deck hatch)');
}
{
  // a fall from the main deck lands on the lower deck under the hatch
  const g = boot({ parts: MAIN });
  const A = g.ships[0];
  stand(A, 3000, 3000);
  const d = deckOf(A, 'main'), dl = deckOf(A, 'lower'), h = A.layout.hatches[0], mid = (h.x0 + h.x1) / 2;
  A.ctx.hatches[0].want = true; A.ctx.hatches[0].warn = 0;
  const p = person(g.st, 'faller', A, d, mid);
  step(g.sim, seconds(H.OPEN_TIME + 1), () => (p.fly ? 'stop' : null));
  report(p.fly, '(c) a hatch in the main deck drops a crewman too');
  step(g.sim, seconds(2));
  const lower = A.layout.platforms[dl];
  report(!p.fly && p.d === dl && Math.abs(p.y - lower.y) < 1 && p.x >= lower.x0 && p.x <= lower.x1, `(c) ...and he lands on the lower deck under it (deck ${p.d === dl ? 'lower' : p.d}, x ${p.x.toFixed(0)})`);
  // the deck pieces are the landing surfaces: a flier passes through the hole
  const surf = A.sim.air.surfaces().filter((s) => s.d === d);
  report(surf.length === 2 && surf.every((s) => s.x1 <= h.x0 + 0.1 || s.x0 >= h.x1 - 0.1), `(c) the landing surfaces leave a hole in the main deck (${surf.map((s) => s.x0 + '-' + s.x1).join(', ')})`);
}
{
  // (c2) a crate on it drops onto the enemy ship below, a carried one is let fall, a raider is tipped out
  const g = lowerScene({ parts: CRATES, others: [{ id: 'foe', team: 'enemy', parts: BUILDS.classic }] });
  const { sim, st, A, d, h } = g;
  const B = g.ships[1];
  const mid = (h.x0 + h.x1) / 2, wx = P.toWorldX(A, mid);
  // her deck right under the hatch: B's main deck reaches wx, 900 px down
  stand(B, wx - P.toWorldX({ ...B, pose: { ...B.pose, x: 0, f: 1 } }, B.layout.refPoint.x) - 0, 3000 + 1000);
  B.pose.x = wx - B.layout.refPoint.x; B.pose.y = A.pose.y + 1000;
  pins.set(B, { x: B.pose.x, y: B.pose.y });
  const crate = A.sim.cargo.place('crate', d, mid);
  const sack = A.sim.cargo.place('sandbag', d, mid + 40);
  const w0 = A.ctx.loads.length;
  A.ctx.hatches[0].want = true; A.ctx.hatches[0].warn = 0;
  const bl0 = (B.ctx.loads || []).length;
  step(sim, seconds(H.OPEN_TIME + 1), () => ((st.thrown || []).some((o) => o.hatch) ? "stop" : null));
  const thrown = (st.thrown || []).filter((o) => o.hatch);
  report(w0 === 2 && A.ctx.loads.length === 0 && thrown.length === 2 && thrown.every((o) => !o.ghost && o.from === A.id), `(c) the crate and the sandbag lying on the trapdoors left her decks as world objects (${thrown.length} in the air, ${A.ctx.loads.length} left aboard)`);
  step(sim, seconds(4));
  const landed = (B.ctx.loads || []).length - bl0;
  report(landed === 2 && (st.thrown || []).length === 0, `(c) ...and landed on the enemy ship below as live loads (${landed} on her decks)`);
  report(A.ctx.hatchStats.loads === 2, '(c) the hatch counted them (hatchStats.loads)');
  // a load placed over the hole while it is open falls at once, and nothing lands on the hole
  const late = A.sim.cargo.place('crate', d, mid - 20);
  step(sim, 3);
  report(A.ctx.loads.indexOf(late) < 0, '(c) a load that arrives over an open hatch falls through it too');
  // carried to the edge and let fall
  const edge = h.lx > h.x1 ? h.x1 + 26 : h.x0 - 26;
  const hand = person(st, 'hand', A, d, edge, { carry: 'crate' });
  step(sim, 3);
  report(hand.act && hand.act.type === 'hatchdrop' && /down the hatch/.test(hand.act.label), `(c) with a crate in his hands beside the open hatch Action says "${hand.act ? hand.act.label : null}"`);
  tap(sim, hand);
  report(hand.carry === null && (st.thrown || []).some((o) => o.owner === hand.id && !o.ghost), '(c) ...and the crate is let fall (a world object that is not a ghost, owned by him)');
  step(sim, seconds(4));
  report((B.ctx.loads || []).length - bl0 === 4, `(c) it lands on the ship below too (${(B.ctx.loads || []).length - bl0} loads on her decks)`);
  // a raider on the trapdoors
  A.ctx.hatches[0].want = false; A.ctx.hatches[0].door = 0.2; step(sim, seconds(1.2));
  const raider = { id: 'rx', type: 'grunt', name: 'Raider', species: 'rat', color: '#888', scale: 1, x: mid, y: A.layout.platforms[d].y, d, fall: false, hp: 3, hit: 0, cd: 0, windup: 0, face: 1 };
  A.ctx.boarders.push(raider);
  A.ctx.hatches[0].want = true; A.ctx.hatches[0].warn = 0;
  step(sim, seconds(H.OPEN_TIME + 0.2));
  report(!!raider.tipped && raider.fall === true && A.ctx.hatchStats.tipped === 1, '(c) a raider standing on it is tipped out (falling, by hatch.js)');
  step(sim, seconds(3));
  report(!A.ctx.boarders.includes(raider), '(c) ...and falls clean out of the ship (nothing of hers under the lower hatch)');
}

{
  // (c3) an enemy boarder (the other side's crewman) on the trapdoors falls out and lands on HIS ship below: back where he came from
  const g = lowerScene({ parts: LOWER, others: [{ id: 'foe', team: 'enemy', parts: BUILDS.classic }] });
  const { sim, st, A, d, h } = g;
  const B = g.ships[1];
  const mid = (h.x0 + h.x1) / 2;
  B.pose.x = P.toWorldX(A, mid) - B.layout.refPoint.x; B.pose.y = A.pose.y + 1000;
  pins.set(B, { x: B.pose.x, y: B.pose.y });
  const raider = person(st, 'boarder', A, d, mid, { team: 'enemy' });
  raider.ship = A.id; // (aboard her as a boarder)
  A.ctx.hatches[0].want = true; A.ctx.hatches[0].warn = 0;
  step(sim, seconds(H.OPEN_TIME + 1), () => (raider.fly ? 'stop' : null));
  report(raider.fly === true, '(c) a boarder of the other side standing on the trapdoors falls through too');
  step(sim, seconds(5), () => (raider.fly ? null : 'stop'));
  report(!raider.fly && raider.ship === 'foe', `(c) ...and lands on the deck of HIS ship below (transferred to ${raider.ship}), the hatch is a hole in the landing decks`);
  const { powerOf } = await load('modules/host/shipPower.js');
  report(powerOf(buildLayout(LOWER)) > powerOf(buildLayout(BASE)), '(a) the ship power score counts the hatch a little');
}

// ================================================================ (d) routes
{
  const MIN = S.minimalBuild();
  const slot = S.slotsFor('dropHatch', MIN).filter((s) => s.p === 'main')[0];
  const ROUTE = slot.apply(MIN);
  const LR = buildLayout(ROUTE), hr = LR.hatches[0], dm = LR.platforms.findIndex((q) => q.id === 'main');
  const WALK = config.MOVE.WALK_SPEED, a = hr.x0 - 40, b = hr.x1 + 40;
  const closedPlan = makePlanner(LR), openPlan = makePlanner(LR, WALK, [{ d: dm, x0: hr.x0, x1: hr.x1 }]);
  const direct = (b - a) / WALK;
  report(Math.abs(closedPlan.plan(dm, a, dm, b).cost - direct) < 1e-6 && closedPlan.plan(dm, a, dm, b).node === -1, `(d) the validator's planner walks straight across the shut hatch (${direct.toFixed(2)} s)`);
  const o = openPlan.plan(dm, a, dm, b);
  report(Number.isFinite(o.cost) && o.cost > direct * 1.5 && o.node >= 0, `(d) ...and goes round by a ladder with it open (${o.cost.toFixed(2)} s via a connector end)`);
  report(validate(ROUTE).ok && validate(ROUTE).checks.some((c) => c.group === 'Cargo drop hatch' && c.level === 'PASS'), '(d) the little ship with a main-deck hatch validates and the crew can still reach everything with it open');
  // the live nav
  const g = boot({ parts: ROUTE });
  const A = g.ships[0];
  stand(A, 3000, 3000);
  step(g.sim, 3);
  const nav = A.nav, rec = () => A.ctx.hatches[0];
  const c0 = nav.plan(dm, a, dm, b);
  report(Math.abs(c0.cost - direct) < 1e-6, '(d) the live nav walks straight across while it is shut');
  rec().want = true; rec().warn = 0;
  step(g.sim, seconds(H.OPEN_TIME + 0.3));
  const c1 = nav.plan(dm, a, dm, b);
  report(rec().gap && Number.isFinite(c1.cost) && c1.cost > direct * 1.5 && c1.node >= 0, `(d) with it open the nav's route goes round (${c1.cost.toFixed(2)} s against ${direct.toFixed(2)})`);
  // a walker sent across it walks round by the ladders and never enters the hole
  const walker = { d: dm, x: a, y: LR.platforms[dm].y, vx: 0, conn: null, s: 0 };
  let inside = 0, frames = 0, arrived = false, usedLadder = false;
  for (; frames < 60 * 60 && !arrived; frames++) {
    const sg = nav.steerTo(walker, dm, b, 12);
    nav.moveWalker(walker, sg.jx, sg.jy, DT, WALK);
    if (walker.conn != null) usedLadder = true;
    if (walker.conn == null && walker.d === dm && walker.x > hr.x0 && walker.x < hr.x1) inside++;
    arrived = sg.arrived;
  }
  report(arrived && inside === 0 && usedLadder && frames > direct * 60 * 1.5, `(d) a walker sent across it arrives round by a ladder (${(frames / 60).toFixed(1)} s) and never stood over the hole`);
  // held at its edge
  const held = { d: dm, x: a, y: LR.platforms[dm].y, vx: 0, conn: null, s: 0 };
  for (let i = 0; i < 180; i++) nav.moveWalker(held, 1, 0, DT, WALK);
  report(held.x <= hr.x0 && held.x >= hr.x0 - H.EDGE_PUSH - 1, `(d) pushing straight at the hole holds him at its edge for 3 s (x ${held.x.toFixed(1)}, the hole starts at ${hr.x0})`);
  const heldR = { d: dm, x: b, y: LR.platforms[dm].y, vx: 0, conn: null, s: 0 };
  for (let i = 0; i < 180; i++) nav.moveWalker(heldR, -1, 0, DT, WALK);
  report(heldR.x >= hr.x1 && heldR.x <= hr.x1 + H.EDGE_PUSH + 1, '(d) ...from the other side too');
  // shut again: the straight way is back
  rec().want = false;
  step(g.sim, seconds(H.CLOSE_TIME + 0.3));
  const c2 = nav.plan(dm, a, dm, b);
  report(!rec().gap && nav.gaps.length === 0 && Math.abs(c2.cost - direct) < 1e-6 && c2.node === -1, '(d) shut again, the nav walks straight across');
  report(A.sim.air.surfaces().filter((s) => s.d === dm).length === 1, '(d) ...and the deck is one landing surface again');
  // while the klaxon runs nobody is walked onto it
  rec().want = true; rec().warn = H.WARN_TIME; step(g.sim, 2);
  const c3 = nav.plan(dm, a, dm, b);
  report(!rec().gap && c3.cost > direct * 1.5 && nav.holes.length === 0, '(d) while the klaxon runs the walkers already keep off it (and the floor is still there)');
  rec().want = false; step(g.sim, 5);
  // a hatch that cuts a deck in two with a gun on the far piece is a WARN
  const island = S.slotsFor('gun', LOWER).filter((s) => s.p === 'lower' && s.x > 1960)[0];
  const cut = island ? island.apply(LOWER) : null;
  report(!!cut && validate(cut).warns.some((w) => /no way between/.test(w)), '(d) the validator WARNs when an open hatch would cut a gun off from the lever');
}

// ================================================================ (d) GOING DOWN!: weight through the hatch
{
  const g = lowerScene({ parts: LOWER });
  const { sim, A, d, h } = g;
  const mid = (h.x0 + h.x1) / 2, rec = () => A.ctx.hatches[0];
  step(sim, 5);
  const c1 = A.sim.cargo.place('crate', d, mid - 40), c2 = A.sim.cargo.place('crate', d, mid), c3 = A.sim.cargo.place('sandbag', d, mid + 40);
  const w = c1.w + c2.w + c3.w;
  step(sim, seconds(4));
  const m0 = A.sim.goingDown.measure();
  report(m0.cargo >= w - 0.01, `(d) three loads lie on the trapdoors: GOING DOWN!'s weight counts them (cargo ${m0.cargo.toFixed(1)} of weight ${m0.weight.toFixed(1)})`);
  report(hatchesWorth(A.ctx).length === 0, '(d) ...and outside GOING DOWN! nobody is sent to the hatch');
  A.sim.goingDown.tryStart();
  step(sim, 5);
  const jobs = A.ctx.gdJobs({ x: 100, d, id: 'x', carry: null });
  report(A.ctx.goingDown && hatchesWorth(A.ctx).length === 1 && (jobs || []).some((j) => j.kind === 'hatch' && /HATCH/.test(j.label)), '(d) GOING DOWN!: the hatch is a job for the phones ("PULL THE HATCH LEVER - THE CARGO DROPS!") while cargo lies over it');
  const before = A.ctx.goingDown.m.weight, dumped0 = A.ctx.goingDown.dumped;
  rec().want = true; rec().warn = 0;
  step(sim, seconds(H.OPEN_TIME + 4));
  const m1 = A.ctx.goingDown.m;
  report(A.ctx.loads.filter((l) => l.d === d && l.x > h.x0 && l.x < h.x1).length === 0 && before - m1.weight >= w - 3 && A.ctx.goingDown.dumped - dumped0 >= w - 0.01, `(d) opening it drops the cargo: her weight falls ${(before - m1.weight).toFixed(1)} (the loads weighed ${w}), counted as dumped (${(A.ctx.goingDown.dumped - dumped0).toFixed(1)})`);
  report(hatchesWorth(A.ctx).length === 0, '(d) ...and the job is gone');
}
{
  // the coal bunker beside the hole spills down it
  const base = BASE;
  let co = null, slot = null, COAL = null;
  for (const hs of S.slotsFor('dropHatch', base).filter((s) => s.p === 'lower' && s.hatch[0] > 1600)) { // (a hatch, and a bunker 60 to 115 px beyond its fore end)
    const w = hs.apply(base), c = S.slotsFor('coal', w).filter((q) => q.p === 'lower' && q.x - hs.hatch[1] >= 60 && q.x - hs.hatch[1] <= 115)[0];
    if (c) { slot = hs; co = c; COAL = c.apply(w); break; }
  }
  report(!!COAL && validate(COAL).ok && validate(COAL).checks.some((c) => /spills the coal bunker/.test(c.text)), `(d) a hatch built beside a coal bunker says so in the validator (bunker x ${co && co.x}, hatch ${slot && slot.hatch})`);
  if (COAL) {
    const g = lowerScene({ parts: COAL });
    const { sim, A } = g;
    step(sim, 5);
    A.sim.goingDown.tryStart();
    step(sim, 5);
    const gd = A.ctx.goingDown, fuel0 = gd.m.weight;
    A.ctx.hatches[0].want = true; A.ctx.hatches[0].warn = 0;
    step(sim, seconds(H.OPEN_TIME + 1.5));
    report(gd.coalGone === true && gd.coalShed > 0 && A.ctx.hatchStats.dumped >= 1 && gd.m.weight < fuel0 - gd.coalShed * 0.5, `(d) opening it while she falls spills the bunker: coal gone (shed ${gd.coalShed}), her weight ${fuel0.toFixed(1)} -> ${gd.m.weight.toFixed(1)}`);
  }
}

// ================================================================ (e) bots
{
  // GOING DOWN!: the bots open it for the cargo that lies over it, then shut it again
  const g = lowerScene({ parts: CRATES, bots: 6 });
  const { sim, A, d, h } = g;
  const mid = (h.x0 + h.x1) / 2, rec = () => A.ctx.hatches[0];
  step(sim, seconds(8));
  A.sim.goingDown.tryStart();
  for (let k = 0; k < 4; k++) A.sim.cargo.place(k % 2 ? 'sandbag' : 'crate', d, mid - 70 + k * 45);
  let hold = 0, ourOn = 0;
  step(sim, seconds(quick ? 25 : 40), () => {
    const gd = A.ctx.goingDown;
    if (gd) gd.t = Math.min(gd.t, gd.time * 0.2); // (she does not hit the ground while the crew work)
    for (const p of Object.values(A.ctx.players)) if (p.bot && (rec().gap || rec().warn > 0) && p.d === d && p.conn == null && p.x > h.x0 && p.x < h.x1 && !p.fly) ourOn++;
    if (A.ctx.hatchStats.loads >= 4) hold++;
  });
  report(A.ctx.hatchStats.opened >= 1 && A.ctx.hatchStats.loads >= 3, `(e) GOING DOWN!: the bots pull the lever and the cargo over the hatch drops (opened ${A.ctx.hatchStats.opened}x, ${A.ctx.hatchStats.loads} loads through it)`);
  report(A.ctx.hatchStats.fell === 0 && ourOn === 0, `(e) ...and none of the crew ever stood on it while it was warning or open (${ourOn} frames, ${A.ctx.hatchStats.fell} fell)`);
  step(sim, seconds(12));
  report(!rec().want && rec().door === 0, `(e) ...and they shut it again afterwards (open for ${H.BOT.OPEN_FOR} s at least, door ${rec().door.toFixed(2)})`);
}
{
  // Versus-style: an enemy ship directly below; the bots fetch a crate, open the hatch and drop it on her
  const g = lowerScene({ parts: CRATES, others: [{ id: 'foe', team: 'enemy', parts: BUILDS.classic }], bots: 6 });
  const { sim, st, A, d, h } = g;
  const B = g.ships[1];
  const mid = (h.x0 + h.x1) / 2, wx = P.toWorldX(A, mid);
  B.pose.x = wx - B.layout.refPoint.x; B.pose.y = A.pose.y + 1000;
  pins.set(B, { x: B.pose.x, y: B.pose.y });
  const bl0 = (B.ctx.loads || []).length;
  let ourOn = 0;
  step(sim, seconds(quick ? 60 : 110), () => {
    const r = A.ctx.hatches[0];
    for (const p of Object.values(A.ctx.players)) if (p.bot && (r.gap || r.warn > 0) && p.d === d && p.conn == null && p.x > h.x0 && p.x < h.x1 && !p.fly) ourOn++;
    if (A.ctx.hatchStats.dropped >= 2 && (B.ctx.loads || []).length - bl0 >= 2) return 'stop';
  });
  if (process.env.DBG) { for (const p of Object.values(A.ctx.players)) console.log("DBG bot", p.id, p.botJob && p.botJob.kind + ":" + (p.botJob.mode || ""), p.hatchUntil, "fall", p.fall, "y", Math.round(p.y), "ko", p.ko, "ship", p.ship, "carry", p.carry, "d", p.d, "x", Math.round(p.x), "lock", p.lock); console.log("DBG hatch", JSON.stringify(A.ctx.hatches[0]), JSON.stringify(A.ctx.hatchStats), "foe loads", (B.ctx.loads||[]).length); }
  report(A.ctx.hatchStats.dropped >= 1 && (B.ctx.loads || []).length - bl0 >= 1, `(e) a ship directly below: the bots fetched a crate, opened the hatch and dropped it (${A.ctx.hatchStats.dropped} dropped, ${(B.ctx.loads || []).length - bl0} landed on her deck)`);
  report(A.ctx.hatchStats.fell === 0 && ourOn === 0, `(e) ...without ever standing on it while it was warning or open (${ourOn} frames)`);
  B.pose.x += 7000; pins.set(B, { x: B.pose.x, y: B.pose.y }); // (the enemy sails on: no more errands)
  step(sim, seconds(25));
  report(!A.ctx.hatches[0].want && A.ctx.hatches[0].door === 0, '(e) ...and when the enemy has gone by the hatch was shut again');
}
{
  // no ship below: they do not drop anything (and never open it for nothing)
  const g = lowerScene({ parts: CRATES, others: [{ id: 'foe', team: 'enemy', parts: BUILDS.classic }], bots: 6 });
  const { sim, A } = g;
  const B = g.ships[1];
  B.pose.x = A.pose.x + 6000; B.pose.y = A.pose.y + 1000;
  pins.set(B, { x: B.pose.x, y: B.pose.y });
  step(sim, seconds(quick ? 40 : 70));
  report(A.ctx.hatchStats.opened === 0 && A.ctx.hatchStats.dropped === 0, `(e) with the enemy beside her, not below, the bots leave the hatch alone (opened ${A.ctx.hatchStats.opened}x)`);
}
{
  // raiders on the trapdoors: the bots pull the lever and tip them out; with one of their own on it they do not
  const g = lowerScene({ parts: CRATES, bots: 4 });
  const { sim, A, d, h } = g;
  const mid = (h.x0 + h.x1) / 2, rec = () => A.ctx.hatches[0];
  step(sim, seconds(6));
  const mk = (id, x) => ({ id, type: 'grunt', name: 'Raider', species: 'rat', color: '#888', scale: 1, x, y: A.layout.platforms[d].y, d, fall: false, hp: 6, hit: 0, cd: 0, windup: 0, face: 1 });
  // (their raiders stand still here: the AI of a raider would walk them off the trapdoors at once)
  const frozen = [mk('r1', mid - 30), mk('r2', mid + 30)];
  A.ctx.boarders.push(...frozen);
  const hold = () => { for (const b of frozen) if (!b.fall && b.d === d && A.ctx.boarders.includes(b)) { b.x = b.x < mid ? mid - 30 : mid + 30; b.windup = 0; b.cd = 5; } };
  step(sim, seconds(quick ? 30 : 50), () => { hold(); if (A.ctx.hatchStats.tipped >= 1) return 'stop'; });
  report(A.ctx.hatchStats.opened >= 1 && A.ctx.hatchStats.tipped >= 1 && frozen.every((b) => !A.ctx.boarders.includes(b) || b.tipped || b.hp < 6), `(e) raiders on the trapdoors: the bots pull the lever and they are tipped out (${A.ctx.hatchStats.tipped} tipped)`);
  step(sim, seconds(15));
  report(!rec().want, '(e) ...and shut it afterwards');
}
{
  // one of their own on the trapdoors: no lever (the bot who would pull it sees him)
  const g = lowerScene({ parts: CRATES, bots: 3 });
  const { sim, st, A, d, h } = g;
  const mid = (h.x0 + h.x1) / 2;
  step(sim, seconds(4));
  const mk = (id, x) => ({ id, type: 'grunt', name: 'Raider', species: 'rat', color: '#888', scale: 1, x, y: A.layout.platforms[d].y, d, fall: false, hp: 6, hit: 0, cd: 0, windup: 0, face: 1 });
  const mate = person(st, 'mate', A, d, mid + 10); // a person who stands there
  const r1 = mk('r9', mid - 40);
  A.ctx.boarders.push(r1);
  step(sim, seconds(20), () => { mate.x = mid + 10; mate.d = d; r1.x = mid - 40; r1.cd = 5; r1.windup = 0; });
  report(A.ctx.hatchStats.opened === 0 && !mate.fly, '(e) with one of their own crew on the trapdoors and a single raider, the bots do not pull the lever');
}

// ================================================================ (f) the TV
{
  const stubRec = { n: 0, h: 2166136261 };
  const fnv = (hh, s) => { for (let i = 0; i < s.length; i++) hh = Math.imul(hh ^ s.charCodeAt(i), 16777619) >>> 0; return hh; };
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(2) : typeof v === 'string' ? v : 'o');
  const stubCtx = (rec) => new Proxy({ imageSmoothingQuality: 'low' }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'measureText') return (s2) => ({ width: String(s2).length * 9 });
      if (k === 'getImageData') return (x, y, w, h2) => ({ data: new Uint8ClampedArray(Math.max(1, w * h2 * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'isPointInPath' || k === 'isPointInStroke') return () => false;
      return (...args) => { rec.n++; rec.h = fnv(rec.h, k + ':' + args.map(fmt).join(',')); };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  globalThis.document = { fonts: { check: () => true }, createElement: () => { const rec = { n: 0, h: 1 }; const cv = { width: 0, height: 0, getContext: () => (cv.c ||= stubCtx(rec)) }; return cv; } };
  const { createShipArt } = await load('modules/host/shipArt.js');
  const { drawHatch } = await load('modules/host/hatchArt.js');
  const { createPartPictures } = await load('modules/host/partArt.js');
  const { drawBlueprint, blueprintView } = await load('modules/host/blueprintArt.js');
  const g = lowerScene({ parts: LOWER });
  const { sim, A } = g;
  step(sim, 5);
  const sprites = new Proxy({}, { get: (t, k) => (k === 'has' ? () => false : () => undefined) });
  const draw = createShipArt({ ctx: stubCtx(stubRec), state: A.ctx, sprites, ship: A });
  const e0 = (globalThis.gameErrors || []).length;
  const hashes = [];
  const frame = (t) => { stubRec.n = 0; stubRec.h = 2166136261; draw(t); return stubRec.h + ':' + stubRec.n; };
  hashes.push(frame(0.5));
  const rec = A.ctx.hatches[0];
  rec.want = true; rec.warn = H.WARN_TIME * 0.5; hashes.push(frame(0.6)); // klaxon (and somebody on it)
  rec.crewOn = true; hashes.push(frame(0.7));
  rec.warn = 0; rec.door = 0.5; hashes.push(frame(0.8)); // swinging
  rec.door = 1; rec.handle = 1; hashes.push(frame(0.9)); // wide open
  const errs = (globalThis.gameErrors || []).length - e0;
  report(errs === 0 && new Set(hashes).size === hashes.length, `(f) the ship draws the hatch on a stub canvas in five states (shut, klaxon, shouting, swinging, open): different pictures, ${errs} errors`);
  const pics = createPartPictures({ sprites: null });
  const e1 = (globalThis.gameErrors || []).length;
  for (const id of ['dropHatch', 'dropHatch_2', 'dropHatch_3']) pics.get(id, 60);
  report((globalThis.gameErrors || []).length === e1 && pics.ids.includes('dropHatch_2'), '(f) the tray pictures draw (1, 2 and 3 columns)');
  const bp = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const v = validate(LOWER), slot = S.slotsFor('dropHatch', LOWER)[0] || S.slotsFor('dropHatch', BASE)[0];
  let bad = null;
  try {
    drawBlueprint(bp, blueprintView(v.layout, 1200, 700, 1), v.layout, { balance: v.budgets.balance });
    drawBlueprint(bp, blueprintView(v.layout, 1200, 700, 1), v.layout, { balance: v.budgets.balance, slots: S.slotsFor('dropHatch_2', BASE), hover: S.slotsFor('dropHatch_2', BASE)[0], drop: { slots: S.slotsFor('dropHatch_2', BASE), target: S.slotsFor('dropHatch_2', BASE)[0], ptr: { x: 1700, y: 790 }, img: null } });
  } catch (e) { bad = e; }
  void slot;
  report(!bad, '(f) the blueprint draws the hatch, the pin that shows its span, and the dragged ghost' + (bad ? ': ' + bad.message : ''));
  void drawHatch;
}

console.log(`errors: ${errors.length}`);
if (errors.length) console.log(errors.join('\n'));
report(errors.length === 0, '(g) 0 errors over all of it');
process.exit(ok ? 0 : 1);
