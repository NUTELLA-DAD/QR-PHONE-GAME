// The ship-building validator (Phase S.5): is this list of parts a ship that can be flown?
//   validate(parts, opts)  ->  { ok, fails, warns, checks, budgets, layout, needs, checklist }   (needs: what a half-built ship still lacks, in building order)
// It builds the layout (shipBuild.js buildLayout), then checks geometry, connectivity, walking times, lift, steam, size, cave fit,
// required kinds and hands against the limits in config.BUILD_CHECK. Pure and Node-safe (no DOM, no live ship): the CLI
// (tools/buildsim.mjs), the batch runner and the dev page (public/buildtest.html) all use it.
// A check is { group, level: 'PASS' | 'WARN' | 'FAIL', text }; ok means no FAIL.
import { config } from '../../config.js';
import { buildLayout, budgets as partBudgets, balanceOf, bagCover, ventBoiler, STATION_KINDS, ONE_PER_SHIP, KIND_STATS, rowOf, isNestRow, thrustVec, engineUse, crossesGap, COL } from './shipBuild.js';
import { staticPitch } from './forces.js';
import { fireRisk, hydrogenExposure } from './fireModel.js';
import { gasKey } from './gases.js';
import { planBreak } from './breakOff.js';

const BC = config.BUILD_CHECK;
const BALANCE = config.BALANCE;
const GRAB_COST = 0.25; // seconds to get onto a ladder (the same number as nav.js)

// Kinds the bots man within any 3 minutes of flying: a build where one of these is never manned has a station nobody can reach or use.
// (Searchlights, the coil and the navigator are manned only when it is dark, when there are targets, or by humans.)
export const BOT_MANNED_KINDS = ['helm', 'lookout', 'gun', 'deflector', 'bombBay', 'escort'];

// A ship needs only TWO things to fly (S.5e): a gasbag, and a deck to stand on. Everything else is optional; what she lacks just takes some control away, and the
// game copes with every missing part (see config.WIND, sails.js and the guards in the sim). The checklist lists the two needs first, then the recommended parts
// with what you lose without them (the dev page shows them as chips; the validator turns each missing one into a strong WARN).
const has = (L, kind) => L.stations.some((s) => s.kind === kind) || L.engines.some((e) => e.kind === kind);
const hasRack = (L, kind) => L.racks.some((r) => r.kind === kind);
const hasPlate = (L, id) => L.platforms.some((q) => rowOf(q) === id);
// Each is [key, label, test(layout, routesOk), tier, why-not text, applies(layout)]. tier 'need' = cannot fly without it; 'rec' = recommended (a missing one WARNs);
// 'opt' = shown as a chip only. applies: the line is only worth saying when this is true (no coal bunker matters only if there is a boiler).
export const CHECKLIST = [
  ['deck', 'a deck to stand on', (L) => L.platforms.length > 0, 'need', 'There is nothing to stand on: draw a deck.'],
  ['gasbag', 'a gasbag', (L) => !!L.gasbag, 'need', 'There is nothing to float her: draw a gasbag.'],
  ['routes', 'ladders between the decks', (L, routesOk) => routesOk, 'need', 'Some decks cannot be reached: join them with ladders.'],
  ['helm', 'a helm', (L) => has(L, 'helm'), 'rec', "No helm: she can't steer. Nobody works the speed or the up/down trim, she drifts with the wind."],
  ['boiler', 'a boiler', (L) => has(L, 'boiler'), 'rec', 'No boiler: no steam. She cannot pump her gasbag, so there is no climb control (the helm can only vent gas to drop) and the engines are dead.'],
  ['coal', 'a coal bunker', (L) => has(L, 'coal'), 'rec', "No coal bunker: nobody can feed the boiler; its fire runs dry in a minute or two.", (L) => has(L, 'boiler')],
  ['engine', 'an engine', (L) => has(L, 'engine'), 'rec', 'No engine: wind only. She goes no faster than the breeze (sails help).'],
  ['gun', 'a gun', (L) => has(L, 'gun'), 'rec', "No guns: she can't shoot back."],
  ['ammo', 'an ammo hold', (L) => has(L, 'ammo'), 'rec', 'No ammo hold: the guns fire their first shells and then go quiet.', (L) => has(L, 'gun') || !!L.bombBay],
  ['lookout', 'a lookout', (L) => has(L, 'lookout'), 'rec', 'No lookout: no early warning of rock and enemies, and no sharper helm.'],
  ['medbay', 'a medbay', (L) => !!L.medbay, 'rec', 'No medbay: crew who fall off the ship come round on deck, dazed, where they fell.'],
  ['hammer', 'a hammer rack', (L) => hasRack(L, 'hammer'), 'rec', 'No hammer rack: nobody can patch holes or mend broken parts, and a holed gasbag sinks her.'],
  ['extinguisher', 'an extinguisher', (L) => L.extinguishers.length > 0, 'rec', 'No extinguisher: fires can only burn out, and they eat the hull while they do.'],
  ['sword', 'a sword rack', (L) => hasRack(L, 'sword'), 'rec', 'No sword rack: raiders can only be shoved back with bare hands.'],
  ['boarding', 'two boarding points', (L) => L.boarderEntryPoints.filter((e) => !e.auto).length >= 2, 'rec', 'Fewer than two boarding points: raiders and new crew drop in over the ends of the top deck.'],
  ['nest', "a crow's nest (on the bag)", (L) => hasPlate(L, 'nest'), 'opt', "No crow's nest: no lookout post on top."],
  ['bombBay', 'a bomb bay', (L) => !!L.bombBay && has(L, 'bombBay'), 'opt', 'No bomb bay: no bombing runs (outposts must be shot instead).'],
  ['lift', 'a lift', (L) => L.connectors.some((c) => c.type === 'lift') && !!L.liftRepair, 'opt', 'No lift.'],
  ['hookshot', 'a hookshot rack', (L) => hasRack(L, 'hookshot'), 'opt', 'No hookshot rack.'],
  ['sail', 'a sail', (L) => has(L, 'sail'), 'opt', 'No sail: no extra speed from the wind.'],
];
export function checklist(L, routesOk = true) {
  return CHECKLIST.map(([key, label, test, tier, why, applies]) => ({ key, label, ok: !!test(L, routesOk), tier, why, applies: applies ? !!applies(L) : true }));
}

// ---- walking: the same route-finding as nav.js, on any layout -----------------------------------------------
// Returns { plan(d1, x1, d2, x2) -> { cost (seconds), node }, reach(d1, d2) } for the layout's platforms and connectors.
// Poles are one-way (top to bottom). Used here for the walk budgets and the connectivity check, and by the dev page's heat map.
// gaps: holes in decks [{ d, x0, x1 }] (cargo drop hatches standing open, hatch.js): nobody walks across one, the way goes round by a ladder.
export function makePlanner(L, walk = config.MOVE.WALK_SPEED, gaps = []) {
  const P = L.platforms, C = L.connectors;
  const NN = C.length * 2;
  const nodes = Array.from({ length: NN }, (_, n) => ({ d: n % 2 ? C[n >> 1].bottom : C[n >> 1].top, x: n % 2 ? C[n >> 1].xBottom : C[n >> 1].xTop }));
  const nodesOn = P.map((_, d) => nodes.map((nd, n) => (nd.d === d ? n : -1)).filter((n) => n >= 0));
  const climb = (c) => (P[c.bottom].y - P[c.top].y) / c.speed + GRAB_COST;
  const tt = Array.from({ length: NN }, () => Array(NN).fill(Infinity));
  const secs = (d, a, b) => (crossesGap(gaps, d, a, b) ? Infinity : Math.abs(a - b) / walk);
  for (let a = 0; a < NN; a++) {
    tt[a][a] = 0;
    for (const b of nodesOn[nodes[a].d]) tt[a][b] = Math.min(tt[a][b], secs(nodes[a].d, nodes[a].x, nodes[b].x));
  }
  C.forEach((c, i) => {
    tt[2 * i][2 * i + 1] = Math.min(tt[2 * i][2 * i + 1], climb(c));
    if (c.type !== 'pole') tt[2 * i + 1][2 * i] = Math.min(tt[2 * i + 1][2 * i], climb(c));
  });
  for (let k = 0; k < NN; k++) for (let a = 0; a < NN; a++) for (let b = 0; b < NN; b++) if (tt[a][k] + tt[k][b] < tt[a][b]) tt[a][b] = tt[a][k] + tt[k][b];
  const plan = (d1, x1, d2, x2) => {
    if (d1 === d2) {
      const direct = secs(d1, x1, x2);
      if (direct < Infinity) return { cost: direct, node: -1 };
    }
    let best = { cost: Infinity, node: -1 };
    for (const a of nodesOn[d1] || []) {
      const c = C[a >> 1];
      if (a % 2 && c.type === 'pole') continue;
      const there = a % 2 ? 2 * (a >> 1) : 2 * (a >> 1) + 1;
      const first = secs(d1, x1, nodes[a].x) + climb(c);
      for (const b of nodesOn[d2] || []) {
        const cost = first + tt[there][b] + secs(d2, nodes[b].x, x2);
        if (cost < best.cost) best = { cost, node: a };
      }
    }
    return best;
  };
  const reach = (d1, d2) => d1 === d2 || Number.isFinite(plan(d1, P[d1].x0, d2, P[d2].x0).cost);
  return { plan, reach, nodes };
}

// ---- the three gauges -----------------------------------------------------------------------------------------
// LIFT: the gas level she hovers at. Weight and lift are in gas points (shipBuild.js), so it is the same arithmetic as the game's own
// lift (simulation.js: lift = (gas - sink - NEUTRAL) x LIFT): an overweight ship needs more gas just to hang still.
// BALANCE: the centre of mass against the centre of lift (shipBuild.js balanceOf; limits in config.BALANCE). Adds the text the dev page prints.
export function balanceGauge(parts) {
  const b = balanceOf(parts), B = config.BALANCE;
  const kind = b.deg > 0 ? 'nose-heavy' : b.deg < 0 ? 'tail-heavy' : 'level';
  const text = b.com && b.col ? (b.deg === 0 ? 'level' : `${kind} ${Math.abs(b.deg)} degrees`) : 'no weight or no bag yet';
  return { ...b, kind, text, warnPx: B.WARN_PX, failPx: B.FAIL_PX };
}

export function liftGauge(parts) {
  const b = partBudgets(parts);
  const hover = config.GAS.NEUTRAL + b.mass - b.lift;
  const level = hover > BC.HOVER_MAX ? 'FAIL' : hover < BC.HOVER_MIN || hover > BC.HOVER_WARN ? 'WARN' : 'PASS'; // (too heavy FAILs; very buoyant is only a WARN: S.5e)
  return { mass: +b.mass.toFixed(1), lift: +b.lift.toFixed(1), hover: +hover.toFixed(1), level };
}

// STEAM: the pressure the line settles at when heat in = steam used (simulation.js: dP = heat - use x P / USE_REF), with the firebox
// at FUEL_SETTLED. Cruise runs the engines at CRUISE_SPEED with the pump and the shield/coil drawing now and then; idle is
// IDLE_SPEED with nothing else. Every pipe is a steam user (an engine pipe by speed, the others USE_POWERED); boilers add heat.
export function steamGauge(L) {
  const B = config.BOILER;
  const boilers = L.stations.filter((s) => s.kind === 'boiler').length;
  const fuel = BC.FUEL_SETTLED;
  const heat = boilers ? ((B.HEAT_MAX * fuel) / (fuel + B.HEAT_HALF)) * (1 + (boilers - 1) * B.EXTRA_BOILER) : 0;
  const engineDir = new Map(L.engines.map((e) => [e.name, e.dir]));
  const use = (speed, busy) => {
    let u = B.USE_BASE;
    for (const pipe of L.pipes) u += engineDir.has(pipe.to) ? engineUse(engineDir.get(pipe.to), speed) : B.USE_POWERED;
    if (busy) {
      u += BC.PUMP_DUTY * config.GAS.PUMP_STEAM;
      if (L.stations.some((s) => s.kind === 'deflector')) u += BC.POWER_DUTY * config.SHIELD.STEAM_USE;
      if (L.stations.some((s) => s.kind === 'coil')) u += BC.POWER_DUTY * config.COIL.STEAM_USE;
    }
    return u;
  };
  const settle = (u) => (heat <= 0 ? 0 : Math.min(100, (heat * B.USE_REF) / u));
  const useCruise = use(BC.CRUISE_SPEED, true);
  const useIdle = use(BC.IDLE_SPEED, false);
  const cruise = settle(useCruise), idle = settle(useIdle);
  const level = !boilers ? 'NONE' : cruise < BC.PRESS_CRUISE_MIN ? 'FAIL' : idle > BC.PRESS_IDLE_MAX ? 'WARN' : 'PASS';
  return { boilers, heat: +heat.toFixed(2), useCruise: +useCruise.toFixed(2), useIdle: +useIdle.toFixed(2), cruise: +cruise.toFixed(1), idle: +idle.toFixed(1), level };
}

// HANDS: stations somebody has to man, against crew size.
export function handsGauge(L) {
  const stations = L.stations.reduce((n, s) => n + ((KIND_STATS[s.kind] || {}).hands || 0), 0);
  const perPlayer = (crew) => +(stations / crew).toFixed(2);
  return { stations, crew: BC.CREW, perPlayer: perPlayer(BC.CREW), at4: perPlayer(4), at6: perPlayer(6), level: stations / BC.CREW > BC.HANDS_PER_PLAYER ? 'WARN' : 'PASS' };
}

// The three walks (seconds), worst case over the instances: each boiler from its nearest coal bunker, each gun from its nearest ammo
// hold, and the crow's nest down to the middle of the main deck.
export function walkTimes(L, planner = makePlanner(L)) {
  const all = (kind) => L.stations.filter((s) => s.kind === kind);
  const worst = (targets, sources, cost) => (targets.length && sources.length ? Math.max(...targets.map((t) => Math.min(...sources.map((s) => cost(s, t))))) : null);
  const walk = (a, b) => planner.plan(a.d, a.x, b.d, b.x).cost;
  const mainD = L.platforms.findIndex((q) => q.id === 'main');
  const mid = mainD >= 0 ? (L.platforms[mainD].x0 + L.platforms[mainD].x1) / 2 : 0;
  const nest = all('lookout');
  return {
    coal: worst(all('boiler'), all('coal'), walk),
    ammo: worst(all('gun'), all('ammo'), walk),
    nest: nest.length && mainD >= 0 ? Math.max(...nest.map((s) => planner.plan(s.d, s.x, mainD, mid).cost)) : null,
  };
}

// ---- validate --------------------------------------------------------------------------------------------------
// opts.starter: a starter ship (classic, the Sparrow): it must fit cave tunnels (FAIL), other builds only WARN "wedges in caves".
// opts.cell: the map square size (default config.MAPS.CELL).
export function validate(parts, opts = {}) {
  const checks = [];
  const add = (level, group, text) => checks.push({ group, level, text });
  const fail = (group, text) => add('FAIL', group, text);
  const warn = (group, text) => add('WARN', group, text);
  const pass = (group, text) => add('PASS', group, text);
  const info = (group, text) => add('INFO', group, text); // (a note, not a verdict: the report shows it and nothing fails)
  const result = (layout, extra = {}) => {
    const fails = checks.filter((c) => c.level === 'FAIL').map((c) => c.text);
    const warns = checks.filter((c) => c.level === 'WARN').map((c) => c.text);
    return { ok: fails.length === 0, fails, warns, checks, layout, ...extra };
  };
  let L;
  try { L = buildLayout(parts, { cell: opts.cell || config.MAPS.CELL }); } catch (e) { fail('Geometry', 'the parts do not build: ' + String(e.message || e)); return result(null, { budgets: {}, checklist: [], needs: [] }); }
  const group = (name, problems, okText, level = 'FAIL') => {
    if (problems.length) for (const t of problems.slice(0, 6)) add(level, name, t);
    else pass(name, okText);
  };

  // --- Geometry: no overlaps; every piece on a real deck and inside its span.
  const G = 'Geometry';
  const ids = L.platforms.map((q) => q.id);
  const byId = Object.fromEntries(L.platforms.map((q) => [q.id, q]));
  const bad = [];
  if (new Set(ids).size !== ids.length) bad.push('two decks share an id');
  const decks = [...L.platforms].sort((a, b) => a.y - b.y || a.x0 - b.x0);
  for (let i = 1; i < decks.length; i++) if (decks[i].y === decks[i - 1].y && decks[i].x0 < decks[i - 1].x1) bad.push(`the ${decks[i - 1].name} and the ${decks[i].name} overlap`);
  const placed = (list, label) => {
    for (const o of list) {
      const q = byId[o.p];
      if (!q) bad.push(`${label(o)} is on a deck that does not exist (${o.p})`);
      else if (o.x < q.x0 - 1 || o.x > q.x1 + 1) bad.push(`${label(o)} is off the end of the ${q.name}`);
    }
  };
  placed(L.stations, (o) => o.n);
  placed(L.engines, (o) => o.name);
  placed(L.racks, (o) => `a ${o.kind} rack (${o.p} ${o.x})`);
  placed(L.vents, (o) => `a vent (${o.p} ${o.x})`);
  placed(L.extinguishers, (o) => `an extinguisher (${o.p} ${o.x})`);
  placed(L.boarderEntryPoints, (o) => `a boarding point (${o.p} ${o.x})`);
  placed(L.ballast || [], (o) => `a sandbag (${o.p} ${o.x})`);
  placed(L.sails || [], (o) => `sail ${o.n}`);
  placed(L.cannons || [], (o) => `crew cannon ${o.n}`);
  placed(L.gasValves || [], (o) => `a gas valve (${o.p} ${o.x})`);
  placed(L.escortDocks, (o) => `escort hook ${o.n}`);
  if (L.medbay) placed([L.medbay], () => 'the medbay');
  for (const h of L.hatches || []) { // (a cargo drop hatch: its trapdoors and its lever on a real deck, inside its ends)
    const q = byId[h.p];
    if (!q) bad.push(`the ${h.n} is on a deck that does not exist (${h.p})`);
    else if (h.x0 < q.x0 - 1 || h.x1 > q.x1 + 1 || h.lx < q.x0 - 1 || h.lx > q.x1 + 1) bad.push(`the ${h.n} runs off the end of the ${q.name}`);
  }
  if (L.liftRepair) placed([L.liftRepair], () => 'the lift repair spot');
  for (const r of L.rooms) {
    const q = byId[r.p];
    if (!q) bad.push(`room ${r.name} is on a deck that does not exist (${r.p})`);
  }
  for (const pipe of L.pipes) if (!byId[pipe.p]) bad.push(`the ${pipe.to} pipe is on a deck that does not exist (${pipe.p})`);
  // Stations on one deck must not sit on top of each other.
  const onDeck = {};
  for (const s of [...L.stations.map((s) => ({ n: s.n, p: s.p, x: s.x })), ...L.engines.map((e) => ({ n: e.name, p: e.p, x: e.x }))]) (onDeck[s.p] = onDeck[s.p] || []).push(s);
  for (const list of Object.values(onDeck)) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) if (list[i].x - list[i - 1].x < BC.MIN_GAP) bad.push(`${list[i - 1].n} and ${list[i].n} overlap (${Math.round(list[i].x - list[i - 1].x)} px apart; at least ${BC.MIN_GAP})`);
  }
  for (const key of Object.keys(L.gunMounts)) if (!L.stations.some((s) => s.n === key && s.kind === 'gun')) bad.push(`gun mount ${key} has no gun station`);
  for (const key of Object.keys(L.searchlights)) if (!L.stations.some((s) => s.n === key && s.kind === 'searchlight')) bad.push(`searchlight ${key} has no lamp station`);
  group(G, bad, `${L.platforms.length} decks, ${L.stations.length} stations, ${L.engines.length} engines: no overlaps, everything on a deck and inside its span`);
  // Connectors: both ends on their decks, going down, no two on top of each other.
  const cbad = [];
  const cname = (c) => `${c.type} ${L.platforms[c.top] ? L.platforms[c.top].id : '?'}->${L.platforms[c.bottom] ? L.platforms[c.bottom].id : '?'} at ${c.xTop}`;
  L.connectors.forEach((c, i) => {
    const t = L.platforms[c.top], b = L.platforms[c.bottom];
    if (!t || !b) return cbad.push(`a ${c.type} joins a deck that does not exist`);
    if (!(t.y < b.y)) cbad.push(`${cname(c)} does not go downward (ladders, ropes and poles run from a higher deck to a lower one)`);
    if (c.xTop < t.x0 - 1 || c.xTop > t.x1 + 1) cbad.push(`${cname(c)}: the top is off the end of the ${t.name}`);
    if (c.xBottom < b.x0 - 1 || c.xBottom > b.x1 + 1) cbad.push(`${cname(c)}: the bottom is off the end of the ${b.name}`);
    for (let j = 0; j < i; j++) {
      const o = L.connectors[j];
      if (o.top === c.top && o.bottom === c.bottom && Math.abs(o.xTop - c.xTop) < BC.MIN_GAP) cbad.push(`${cname(c)} and ${cname(o)} overlap`);
    }
  });
  group(G, cbad, `${L.connectors.length} ways between decks, all on their decks and running downward`);
  const pipeWarn = [];
  const engineNames = new Set(L.engines.map((e) => e.name));
  for (const e of L.engines) if (!L.pipes.some((p) => p.to === e.name)) pipeWarn.push(`${e.name} has no steam pipe (it would run for free)`);
  for (const pipe of L.pipes) if (!engineNames.has(pipe.to) && pipe.to !== 'Helm' && pipe.to !== 'Lift') pipeWarn.push(`a steam pipe leads to ${pipe.to}, which is not an engine, the helm or the lift`);
  if (pipeWarn.length) for (const t of pipeWarn) warn('Steam pipes', t);

  // --- Connectivity: a route between every pair of decks, a spawn deck, boarding points, the decks the game needs.
  const K = 'Connectivity';
  const kbad = [];
  let routesOk = true;
  if (!cbad.length && L.platforms.length > 1) {
    const planner = makePlanner(L);
    const lost = [];
    for (let a = 0; a < L.platforms.length; a++) for (let b = 0; b < L.platforms.length; b++) if (a !== b && !planner.reach(a, b)) lost.push(`no way from the ${L.platforms[a].name} to the ${L.platforms[b].name}`);
    routesOk = !lost.length;
    kbad.push(...lost.slice(0, 4));
    if (lost.length > 4) kbad.push(`...and ${lost.length - 4} more broken routes`);
  }
  if (L.platforms.length && !(L.spawnPlatform >= 0)) kbad.push('there is no spawn deck for crew that miss the ship');
  group(K, kbad, `every deck reaches every other (poles only downward), spawn deck ${L.platforms[L.spawnPlatform] ? L.platforms[L.spawnPlatform].name : '?'}, ${L.boarderEntryPoints.filter((e) => !e.auto).length} boarding points`);

  // --- Walking budgets.
  const W = 'Walking';
  let walk = { coal: null, ammo: null, nest: null };
  if (!kbad.length && !cbad.length) {
    walk = walkTimes(L);
    const rate = (name, secs, budget, what) => {
      if (secs == null) return; // (the missing kind is reported under Required kinds)
      const text = `${what}: ${secs.toFixed(1)} s (budget ${budget})`;
      if (!Number.isFinite(secs)) fail(W, `${what}: no route`);
      else if (secs > budget * BC.WALK_FAIL) fail(W, text + ` - over ${BC.WALK_FAIL}x the budget`);
      else if (secs > budget) warn(W, text);
      else pass(W, text);
    };
    rate('coal', walk.coal, BC.WALK_COAL, 'coal bunker to its boiler (worst boiler)');
    rate('ammo', walk.ammo, BC.WALK_AMMO, 'ammo hold to the farthest gun');
    rate('nest', walk.nest, BC.WALK_NEST, "crow's nest to the main deck");
  }

  // --- Lift, steam, hands.
  const lift = liftGauge(parts);
  const hoverText = `hover at gas ${lift.hover} (weight ${lift.mass}, lift ${lift.lift}; allowed ${BC.HOVER_MIN}-${BC.HOVER_MAX})`;
  if (lift.level === 'FAIL') fail('Lift', hoverText + ': too heavy for her bags');
  else if (lift.hover < BC.HOVER_MIN) warn('Lift', hoverText + ': a lot of lift for her weight: she rides high and wants venting or ballast to hold her down');
  else if (lift.level === 'WARN') warn('Lift', hoverText + `: above ${BC.HOVER_WARN}, lots of pumping`);
  else pass('Lift', hoverText);
  const steam = steamGauge(L);
  if (!steam.boilers) info('Steam', 'no boiler: no steam for engines, the pump or the helm (see the advice below)');
  else if (steam.cruise < BC.PRESS_CRUISE_MIN) fail('Steam', `settled pressure at cruise ${steam.cruise} (needs ${BC.PRESS_CRUISE_MIN}): the boiler cannot keep up`);
  else if (steam.idle > BC.PRESS_IDLE_MAX) warn('Steam', `settled pressure at idle ${steam.idle} (over ${BC.PRESS_IDLE_MAX}): the crew will be venting`);
  else pass('Steam', `settled pressure ${steam.cruise} at cruise, ${steam.idle} at idle (${steam.boilers} boiler${steam.boilers === 1 ? '' : 's'})`);
  const hands = handsGauge(L);
  if (hands.level === 'WARN') warn('Hands', `${hands.stations} manned stations is ${hands.perPlayer} per player at ${hands.crew} crew (over ${BC.HANDS_PER_PLAYER})`);
  else pass('Hands', `${hands.stations} manned stations: ${hands.perPlayer} per player at ${hands.crew} crew (${hands.at4} at 4, ${hands.at6} at 6)`);

  // --- Balance: the centre of mass against the centre of lift.
  const bal = balanceGauge(parts);
  if (bal.com && bal.col) {
    const px = Math.abs(bal.dx), ahead = bal.dx > 0;
    const where = `centre of mass x ${Math.round(bal.com.x)}, lift x ${Math.round(bal.col.x)}: ${Math.round(px)} px ${ahead ? 'ahead of' : 'behind'} it`;
    if (bal.level === 'FAIL') fail('Balance', `she will ${ahead ? 'nose-dive' : 'tail-slide'}: ${bal.kind} ${Math.abs(bal.deg)} degrees (${where}). Hang sandbags at the ${ahead ? 'tail' : 'nose'} or move the heavy things (boiler, coal, bomb bay) back to the middle`);
    else if (bal.level === 'WARN') warn('Balance', `${bal.kind} ${Math.abs(bal.deg)} degrees (${where}): she rides tipped and handles worse; add sandbags at the ${ahead ? 'tail' : 'nose'}`);
    else pass('Balance', `${bal.deg === 0 ? 'level' : bal.kind + ' ' + Math.abs(bal.deg) + ' degrees'} (${where})`);
  }

  // --- Thrust (S.5h): which way the engines push, and how the engines and sails tip her. INFO lines, with WARNs for engines fighting each other and for a tilt nobody can trim away.
  if (L.engines.length) {
    const E = config.ENGINES, vs = L.engines.map((e) => ({ e, v: thrustVec(e.dir) }));
    const drive = Math.max(1, vs.filter((q) => q.v.fwd >= E.DRIVE_COS).length);
    const ahead = vs.reduce((n, q) => n + Math.max(0, q.v.fwd), 0) / drive, astern = vs.reduce((n, q) => n + Math.max(0, -q.v.fwd), 0) / drive;
    const up = vs.reduce((n, q) => n + Math.max(0, q.v.up), 0), down = vs.reduce((n, q) => n + Math.max(0, -q.v.up), 0);
    const net = Math.min(1, ahead) - Math.min(1, astern), swivels = L.engines.filter((e) => e.swivel).length;
    const sp = bal.com ? staticPitch(L, { x: bal.com.x, y: bal.com.y, k2: bal.k2 }) : null;
    info('Thrust', `${L.engines.length} engine${L.engines.length === 1 ? '' : 's'}: forward ${Math.round(Math.min(1, ahead) * 100)}% of full speed, back ${Math.round(Math.min(1, astern) * 100)}%, up ${(up * E.LIFT_GAS).toFixed(0)} gas points of lift, down ${(down * E.LIFT_GAS).toFixed(0)}${swivels ? `; ${swivels} swivel mount${swivels === 1 ? '' : 's'} (crew turn the engine in flight)` : ''}${sp && sp.engines ? `; pitch torque: ${sp.engines > 0 ? 'nose down' : 'nose up'} ${Math.abs(sp.engines)} degrees with steam up` : ''}`);
    if (ahead > 0 && astern > 0 && Math.abs(net) < E.OPPOSE_NET) warn('Thrust', `the engines push against each other: ${Math.round(ahead * 100)}% ahead and ${Math.round(astern * 100)}% astern cancel out (net ${Math.round(net * 100)}%): she barely moves`);
    if (!drive || (ahead === 0 && up + down > 0)) info('Thrust', 'no engine pushes her ahead: only the wind (and sails) drive her forward');
    if (sp && Math.abs(sp.engines) >= E.PITCH_WARN_DEG && !swivels) warn('Thrust', `the engines tip her ${sp.engines > 0 ? 'nose down' : 'nose up'} ${Math.abs(sp.engines)} degrees (the lift sits ${sp.engines > 0 ? 'behind' : 'ahead of'} the middle of her weight) and nothing can turn them back: put a lift engine at the other end, or give one a swivel mount`);
  }
  if ((L.sails || []).length && bal.com) {
    const sp = staticPitch(L, { x: bal.com.x, y: bal.com.y, k2: bal.k2 }), gust = staticPitch(L, { x: bal.com.x, y: bal.com.y, k2: bal.k2 }, { gust: true });
    info('Sails', `sails up: nose-${sp.sails >= 0 ? 'down' : 'up'} ${Math.abs(sp.sails)} degrees in a steady wind, ${Math.abs(gust.sails)} in a gust (the wind pushes high up the mast, above her centre of mass; a tall mast or an upper-nest sail tips her more; an engine at the nose pointing up, or sandbags at the nose, hold her level)`);
    if (Math.abs(sp.sails) >= config.ENGINES.PITCH_WARN_DEG && !L.engines.some((e) => thrustVec(e.dir).up > 0.5)) warn('Sails', `her sails tip her nose down ${Math.abs(sp.sails)} degrees with the wind in them: a shorter mast, a lower deck, or a lift engine at the nose would level her`);
  }

  // --- Fit and cave fit.
  const B = L.bounds;
  const fit = B ? { width: Math.round(B.x1 - B.x0), height: Math.round(B.y1 - B.y0), caveNeed: L.caveNeed } : null;
  if (fit) {
    if (fit.width > BC.FIT_WIDTH || fit.height > BC.FIT_HEIGHT) fail('Fit', `${fit.width} x ${fit.height} px drawn (allowed ${BC.FIT_WIDTH} x ${BC.FIT_HEIGHT}): too big to read on a TV`);
    else pass('Fit', `${fit.width} x ${fit.height} px drawn (allowed ${BC.FIT_WIDTH} x ${BC.FIT_HEIGHT})`);
    const n = L.caveNeed;
    if (n.tunnel > BC.CAVE_TUNNEL || n.shaft > BC.CAVE_SHAFT) {
      const text = `needs a ${n.tunnel}-square tunnel and ${n.shaft}-square shaft (caves carve ${BC.CAVE_TUNNEL} x ${BC.CAVE_SHAFT}): wedges in caves and waits for the tug`;
      if (opts.starter) fail('Cave fit', text); else warn('Cave fit', text);
    } else pass('Cave fit', `needs a ${n.tunnel}-square tunnel and ${n.shaft}-square shaft (caves carve ${BC.CAVE_TUNNEL} x ${BC.CAVE_SHAFT})`);
  }

  // --- The gasbags should reach the whole ship (a longer ship with the same bags leaves its ends bare, and a gap between two bags leaves a stretch of deck unlifted).
  const bags = L.gasbags || [];
  if (bags.length) {
    const cover = config.BUILD_EDIT.BAG_COVER;
    const decks = L.platforms.filter((q) => ['catwalk', 'main', 'lower', 'keel', 'deep'].includes(rowOf(q)));
    if (decks.length) {
      const d0 = Math.min(...decks.map((q) => q.x0)), d1 = Math.max(...decks.map((q) => q.x1));
      const lo = bags[0].cx - bags[0].rx * cover, hi = bags[bags.length - 1].cx + bags[bags.length - 1].rx * cover;
      if (d0 < lo || d1 > hi) warn('Gasbag', `the gasbag${bags.length > 1 ? 's cover' : ' covers'} x ${Math.round(lo)} to ${Math.round(hi)} but the decks run ${d0} to ${d1}: make the bag${bags.length > 1 ? 's' : ''} longer`);
      for (let i = 1; i < bags.length; i++) {
        const gap = bags[i].x0 - bags[i - 1].x1;
        if (gap > BC.BAG_GAP_WARN && decks.some((q) => q.x1 > bags[i - 1].x1 && q.x0 < bags[i].x0)) warn('Gasbag', `${Math.round(gap)} px of open sky between bag ${i} and bag ${i + 1}: the deck under it has no lift`);
      }
    }
    // The crow's nest sits on a bag (any one).
    // (a cut crow's nest is two nests, a high tier is one more: each must sit on a bag)
    for (const nestDeck of L.platforms.filter((q) => isNestRow(rowOf(q)))) {
      if (!bagCover(bags).some((c) => nestDeck.x0 >= c.lo && nestDeck.x1 <= c.hi)) {
        fail('Gasbag', `the ${nestDeck.name} (x ${nestDeck.x0} to ${nestDeck.x1}) hangs off the end of the gasbag${bags.length > 1 ? 's (it must sit on a bag, or a row of touching bags)' : ''}: make the bag longer or the nest shorter`);
      }
    }
    if (bags.length > config.BUILD_EDIT.BAGS_MAX) fail('Gasbag', `${bags.length} gasbags (at most ${config.BUILD_EDIT.BAGS_MAX})`);
    // Redundancy: does she keep flying with her biggest bag gone? (a ruptured bag stays on the ship, weighing the same, but lifts nothing)
    const lift = liftGauge(parts);
    const big = bags.reduce((a, b) => (b.lift > a.lift ? b : a), bags[0]);
    if (bags.length === 1) info('Redundancy', `one gasbag: if it is lost she falls (it lifts ${big.lift}). Several bags side by side keep her up when one is shot away`);
    else {
      const left = lift.lift - big.lift, hover = +(config.GAS.NEUTRAL + lift.mass - left).toFixed(1);
      info('Redundancy', `${bags.length} gasbags. Lose one bag: hover ${hover}, ${hover <= BC.HOVER_MAX ? 'still flies' : hover <= 100 ? 'she limps (the pump at its limit)' : 'she falls'} (lift ${left} of ${lift.lift}; with all bags, hover ${lift.hover})`);
    }
    // Gas types (gases.js): a bag that is not helium says what it holds. Hydrogen beside a boiler, a coal bunker or a flamethrower is an explosion waiting for a spark (WARN); hot air with no boiler never lifts.
    if (bags.some((b) => gasKey(b) !== 'helium')) {
      const G = config.GASES;
      bags.forEach((b, i) => {
        const k = gasKey(b), name = bags.length > 1 ? `bag ${i + 1}` : 'the gasbag';
        if (k === 'hydrogen') info('Gas', `${name} holds hydrogen: lift ${b.lift} (x${G.hydrogen.lift} of helium) and cheap to top up, but a fire that reaches it, a flamethrower or a lucky hit sets it alight and it explodes (the bag is lost, fires, hearts)`);
        else if (k === 'hot') info('Gas', `${name} holds hot air: lift ${b.lift} (x${G.hot.lift} of helium), free to top up and it cannot burn, but it only lifts while the boiler is hot (the crew must keep stoking)`);
      });
      for (const e of hydrogenExposure(L)) warn('Gas', `hydrogen ${bags.length > 1 ? 'bag ' + (e.bag + 1) : 'bag'} is close to the ${e.name} (${e.kind}${e.dist ? ', ' + e.dist + ' px of fire path' : ', in the bag\'s reach'}): explosion risk`);
      if (bags.some((b) => gasKey(b) === 'hot') && !L.stations.some((s) => s.kind === 'boiler')) warn('Gas', 'a hot-air bag but no boiler: the air never heats and the bag lifts only a third');
    }
  }

  // --- Gas valves (one per bag cuts it off from the pump; a bag with none is always open) and steam vents (each lets steam out of the nearest boiler's line).
  if ((L.gasValves || []).length) {
    const feeds = (L.gasbags || []).map((_, i) => (L.gasValves || []).filter((v) => v.bag === i).length);
    const lacking = feeds.map((n, i) => (n ? null : i + 1)).filter(Boolean);
    info('Gas valves', `${L.gasValves.length} valve${L.gasValves.length === 1 ? '' : 's'}: bag${feeds.length > 1 ? 's' : ''} ${feeds.map((n, i) => `${i + 1}${n ? '' : ' (none)'}`).join(', ')}${lacking.length ? `; a bag with no valve is always open (${lacking.join(', ')})` : '; every bag can be shut off'}`);
    for (const v of L.gasValves) if (v.bag < 0) warn('Gas valves', `a gas valve (${v.p} ${v.x}) has no gasbag to feed`);
  }
  if ((L.vents || []).length) {
    const tie = new Map();
    for (const v of L.vents) { const b = ventBoiler(L, v); const k = b ? b.n : '(no boiler)'; tie.set(k, (tie.get(k) || 0) + 1); }
    info('Steam vents', `${L.vents.length} vent${L.vents.length === 1 ? '' : 's'}, on the steam line of: ${[...tie].map(([n, c]) => `${n} x${c}`).join(', ')}`);
  }

  // --- Required kinds, kind sanity.
  const R = 'Required kinds';
  const named = [...L.stations.map((s) => [s.n, s.kind]), ...L.engines.map((e) => [e.name, e.kind])];
  const rbad = [];
  for (const [n, kind] of named) if (!STATION_KINDS.includes(kind)) rbad.push(`${n} has ${kind ? 'unknown kind ' + kind : 'no kind'}`);
  const seen = new Set();
  for (const [n] of named) { if (seen.has(n)) rbad.push('duplicate station name ' + n); seen.add(n); }
  for (const kind of ONE_PER_SHIP) if (named.filter(([, k]) => k === kind).length > 1) rbad.push('more than one ' + kind + ' station (the game supports one)');
  // The only parts a ship cannot fly without (S.5e): something to stand on, and something to float her.
  if (!L.platforms.length) rbad.push('no deck: she needs a deck to stand on');
  if (!L.gasbag) rbad.push('no gasbag: she needs a gasbag to float');
  group(R, rbad, 'a deck and a gasbag: she can fly (everything else is optional)');
  for (const s of L.sails || []) {
    const q = byId[s.p];
    if (q && !q.outside) warn('Sails', `${s.n} stands on the ${q.name}, a covered deck: a mast needs the open air to catch the wind (make the deck outdoor, or move the mast)`);
    else if (q && !['nest', 'crow2', 'catwalk'].includes(rowOf(q))) warn('Sails', `${s.n} stands on the ${q.name}: a mast belongs on the top deck or a crow's nest, where it catches the wind`);
  }
  // --- Open-air and covered decks (S.5g): the pencil's OUTDOOR / COVERED toggle. Weather, boarders and the overboard drop reach outdoor decks only.
  const BODY = ['catwalk', 'main', 'lower', 'keel', 'deep'];
  const openDecks = L.platforms.filter((q) => q.outside && BODY.includes(rowOf(q))), coveredDecks = L.platforms.filter((q) => !q.outside && BODY.includes(rowOf(q)));
  if (openDecks.length || coveredDecks.length) {
    const names = (list) => list.map((q) => q.name).join(', ') || 'none';
    info('Decks', `${openDecks.length} outdoor (${names(openDecks)}: rails, wide gun arcs, weather and boarders reach them, crew can be knocked overboard), ${coveredDecks.length} covered (${names(coveredDecks)}: protected rooms, heavier, fires spread inside, guns as ports)`);
    if (!openDecks.length) info('Decks', 'no outdoor deck: boarders and falling crew land on a covered deck, no mast, lamp or boarding point has anywhere to stand, and nobody can be knocked overboard');
  }
  for (const e of L.boarderEntryPoints) { const q = byId[e.p]; if (q && !e.auto && !q.outside) warn('Decks', `a boarding point on the ${q.name}, a covered deck: raiders land on a roof (put boarding points on an outdoor deck)`); }
  for (const s of L.stations) { const q = byId[s.p]; if (q && s.kind === 'searchlight' && !q.outside) warn('Decks', `${s.n} is on the ${q.name}, a covered deck: a lamp needs the open air`); }
  for (const a of L.armour || []) { const q = byId[a.p]; if (!q) fail('Armour', `armour plate on a deck that does not exist (${a.p})`); else if (a.x0 < q.x0 - 1 || a.x1 > q.x1 + 1) warn('Armour', `armour plate on the ${q.name} runs off the end of the deck (x ${Math.round(a.x0)} to ${Math.round(a.x1)})`); }
  if ((L.armour || []).length) {
    const len = L.armour.reduce((n, a) => n + a.x1 - a.x0, 0), w = (len / 100) * BALANCE.MASS.armour;
    info('Armour', `${L.armour.length} stretch${L.armour.length === 1 ? '' : 'es'} of riveted plate, ${Math.round(len)} px in all, weighing ${w.toFixed(0)} (about ${(w / BALANCE.MASS.kind.boiler).toFixed(1)} boilers): hits there count for ${Math.round(config.ARMOUR.POWER_MUL * 100)}%, rarely breach, and the plate does not burn`);
  }
  // --- Fire (S.5f): fire cares where things are. Coal is tinder and the boiler is where fires start.
  const fr = fireRisk(L);
  if (fr.coalBoiler !== null && fr.coalBoiler < BC.FIRE_NEAR) warn('Fire', `coal bunker beside the boiler: fire risk (${fr.coalBoiler} px of fire path apart, under ${BC.FIRE_NEAR}). A blowout lights the coal, which flares into a blaze; put them on different decks or further apart (it costs walking)`);
  if (L.platforms.length) info('Fire', `fire risk ${fr.score}/10 (${fr.level})${fr.notes.length ? ': ' + fr.notes.join('; ') : ''}; up to ${fr.cap} fires at once for her size`);
  // --- Parts break off (S.5i): a bomb bay that goes up blows the parts round it off the ship, and sets fire to any coal or ammunition in reach
  {
    const BO = config.BREAKOFF;
    const near = [['boiler', fr.bayBoiler], ['coal bunker', fr.bayCoal]].filter(([, d]) => d !== null && d !== undefined && d < BO.BAY.CHAIN_WARN);
    if (L.bombBay && near.length) warn('Break-off', `bomb bay beside the ${near.map(([k]) => k).join(' and the ')}: chain-reaction risk (${near.map(([k, d]) => d + ' px of fire path from the ' + k).join(', ')}, under ${BO.BAY.CHAIN_WARN}). If the bombs go up the blast takes the ${near.map(([k]) => k).join(' and the ')} with the bay and lights what is left, which flares into a blaze; keep the bay well away from them (it costs walking)`);
    if (L.bombBay && L.stations.some((s) => s.kind === 'bombBay')) {
      const bay = L.bombBay, plan = planBreak(parts, { kind: 'blast', x: bay.x, y: bay.y - 30, r: BO.BAY.RADIUS }, () => 1);
      if (plan.ok) info('Break-off', `a bomb bay explosion (a hard hit on the loaded bay, or fire in it for ${BO.BAY.COOKOFF} s) blows off about ${plan.names.length ? plan.names.slice(0, 6).join(', ') + (plan.names.length > 6 ? ' and ' + (plan.names.length - 6) + ' more' : '') : 'the bay'} (${Math.round(plan.mass)} of her weight); keep the loaded bay clear of what you cannot do without, or empty it`);
    }
    if (L.platforms.length) info('Break-off', `very heavy hits, hard crashes and rams can break off the end or limb they strike (a deck end with its guns and engines, a belly pod, a nest); armour plate on that stretch cuts the chance to ${Math.round(BO.ARMOUR_MUL * 100)}%${(L.armour || []).length ? ' (' + L.armour.length + ' stretch' + (L.armour.length === 1 ? '' : 'es') + ' plated)' : ''}. What breaks off stays gone until it is rebuilt at a sky-dock`);
  }
  if ((L.sails || []).length) {
    const S = config.SAIL, k = Array.from({ length: L.sails.length }, (_, i) => S.BONUS_DIM ** i).reduce((a, b) => a + b, 0);
    info('Sails', `${L.sails.length} sail${L.sails.length === 1 ? '' : 's'}: raised, they add about +${Math.round(S.BONUS * k * 100)}% of top speed in a calm sky (more in a gale, less in caves); a gust can tear a sail left up`);
  }

  // --- Cross-ship parts (B.6, config.CROSS): the crew cannon needs the open air and two hands; the racks are advice-free (they just have to be reachable).
  for (const c of L.cannons || []) {
    const q = byId[c.p];
    if (q && !q.outside) warn('Crew cannon', `${c.n} stands on the ${q.name}, a covered deck: the barrel needs the open air to fire into (make the deck outdoor, or move it)`);
  }
  if ((L.cannons || []).length) {
    const K = config.CROSS.CANNON, g = config.AIR.GRAVITY;
    let x = 0, y = 0, vx = Math.cos(Math.PI / 4) * K.SPEED, vy = -Math.sin(Math.PI / 4) * K.SPEED; // (a 45 degree shot at full power, the airborne.js flight with the cannon flyer's drag)
    for (let t = 0; t < 8 && !(vy > 0 && y >= 0); t += 0.02) { vx -= vx * Math.min(1, K.DRAG * 0.02); vy = Math.min(config.AIR.MAX_FALL, vy + g * 0.02); x += vx * 0.02; y += vy * 0.02; }
    info('Crew cannon', `${L.cannons.length} crew cannon${L.cannons.length === 1 ? '' : 's'}: fires a crewman about ${Math.round(x / 10) * 10} px across the sky at full power on the level (a second crewman aims, or the one inside fires himself at ${Math.round(K.SOLO_POWER * 100)}% power); weighs ${BALANCE.MASS.kind.cannon} each, uses ${K.STEAM} points of steam pressure a shot, reloads in ${K.COOLDOWN} s. He can land on any ship's deck: an enemy's means boarding her`);
    if (!L.stations.some((s) => s.kind === 'boiler')) warn('Crew cannon', 'no boiler: the cannon is fired with steam pressure and will not fire');
  }
  if (L.racks.some((r) => r.kind === 'sandbag' || r.kind === 'crate')) info('Cargo', `${L.racks.filter((r) => r.kind === 'sandbag' || r.kind === 'crate').length} cargo rack(s): ATTACK on an open deck throws what you carry (a sandbag weighs ${config.CROSS.CARGO.ITEMS.sandbag.w}, a crate ${config.CROSS.CARGO.ITEMS.crate.w}); it lands on whatever ship it hits as dead weight and tips her until somebody shovels it off. At the rail, Action dumps a sandbag for a quick lift`);
  if (L.racks.some((r) => r.kind === 'towline')) info('Towing', `a towline reel: ATTACK throws the grapple at a ship within ${config.CROSS.TOW.RANGE} px and tows her (a spring between the two ships that twists both); a sword cuts it`);

  // --- The weapons of the range bands (config.GUN_TYPES, weapons.js) and the ram prow: what each does, and the roofs that spoil them.
  {
    const GTs = config.GUN_TYPES, count = {};
    for (const [name, m] of Object.entries(L.gunMounts)) {
      if (!m.type || !GTs[m.type]) continue;
      count[m.type] = (count[m.type] || 0) + 1;
      const st = L.stations.find((s) => s.n === name), q = st && byId[st.p];
      if ((m.type === 'mortar' || m.type === 'flak') && q && !q.outside && !isNestRow(rowOf(q))) warn(GTs[m.type].LABEL, `${name} stands on the ${q.name}, a covered deck: a ${m.type === 'mortar' ? 'lob' : 'burst'} needs the open air above it (make the deck outdoor, or move it)`);
    }
    const word = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    const px = (v) => Math.round(v / 100) * 100;
    if (count.long) info('Long gun', `${word(count.long, 'long gun', 'long guns')}: shells reach about ${px(GTs.long.SPEED * GTs.long.LIFE)} px (a broadside gun: ${px(config.GUNS.SHELL_SPEED * config.GUNS.SHELL_LIFE)}), one shot every ${GTs.long.COOLDOWN} s, each ${GTs.long.MUL}x the blow of a broadside shell and tightly aimed; ${GTs.long.MAX_AMMO} shells; weighs ${BALANCE.MASS.kind.gun_long} each. It wants a ship that keeps her distance`);
    if (count.mortar) info('Mortar', `${word(count.mortar, 'mortar', 'mortars')}: lobs a shell up to ${px((GTs.mortar.SPEED * GTs.mortar.SPEED) / GTs.mortar.GRAVITY)} px on a high arc (it takes ${(((2 * GTs.mortar.SPEED) / GTs.mortar.GRAVITY) * 0.707).toFixed(1)} s to land) that drops onto a deck and a gasbag and splashes down through the hull; wild unless a lookout is up in the nest or the rival is spotted on the radar; ${GTs.mortar.MAX_AMMO} shells; weighs ${BALANCE.MASS.kind.gun_mortar} each`);
    if (count.scatter) info('Grapeshot', `${word(count.scatter, 'grapeshot gun', 'grapeshot guns')}: a fan of ${GTs.scatter.PELLETS} pellets over ${px(GTs.scatter.SPEED * GTs.scatter.LIFE)} px, once a second - a ship alongside, and boarders; weighs ${BALANCE.MASS.kind.gun_scatter} each`);
    if (count.flak) info('Flak', `${word(count.flak, 'flak gun', 'flak guns')}: shells that burst when a plane, a bat or an enemy crewman in the air comes within ${GTs.flak.FUSE} px - a boarder's leap is knocked out of the sky; weighs ${BALANCE.MASS.kind.gun_flak} each`);
    if (count.harpoon) info('Harpoon', `${word(count.harpoon, 'harpoon gun', 'harpoon guns')}: fires a line up to ${GTs.harpoon.RANGE} px at the nearest enemy deck where it points; it latches and reels the two ships together to ${GTs.harpoon.LEN} px (a sword cuts it, it snaps at ${GTs.harpoon.SNAP} px); ${GTs.harpoon.MAX_AMMO} harpoons, one every ${GTs.harpoon.COOLDOWN} s; weighs ${BALANCE.MASS.kind.gun_harpoon} each`);
    if (count.flame) {
      const F = config.FLAME;
      info('Flamethrower', `${word(count.flame, 'flamethrower', 'flamethrowers')}: a cone of fire ${GTs.flame.RANGE} px long while FIRE is held - a hostile ship alongside, boarders, bats; it lights wooden decks (not armour plate), burns crew, makes gas holes. A tank of ${GTs.flame.MAX_AMMO} units of coal lasts ${Math.round(GTs.flame.MAX_AMMO / F.FUEL_RATE)} s of fire (a sack adds ${GTs.flame.LOAD}); it eats ${F.STEAM_RATE} steam pressure a second (needs ${F.MIN_PRESS}) and overheats after ${Math.round(1 / F.HEAT_RATE)} s; weighs ${GTs.flame.MASS} each. Short range: it wants a ship that closes in`);
      for (const [name, m] of Object.entries(L.gunMounts)) {
        if (m.type !== 'flame') continue;
        const st = L.stations.find((s) => s.n === name);
        const hot = st && L.stations.filter((s) => s.d === st.d && ['coal', 'ammo', 'bombBay'].includes(s.kind) && Math.abs(s.x - st.x) < 260).map((s) => `${s.kind === 'bombBay' ? 'bomb bay' : s.kind === 'ammo' ? 'ammo hold' : 'coal bunker'} (${Math.round(Math.abs(s.x - st.x))} px)`);
        if (hot && hot.length) warn('Flamethrower', `${name} stands close to the ${hot.join(' and the ')}: a backdraft or a burning boarder beside it would light them`);
      }
    }
    if (count.mines) {
      info('Mine layer', `${word(count.mines, 'mine layer', 'mine layers')}: a crew member drops floating mines out of the belly (${GTs.mines.MAX_AMMO} in the chute, ${GTs.mines.LOAD} more per ammo crate). A mine arms after ${config.MINEFIELD.ARM} s and goes off against ANY ship that touches it - yours too - and against planes; a shell sets it off; weighs ${BALANCE.MASS.kind.mineLayer} each`);
      if (!L.stations.some((s) => s.kind === 'ammo')) warn('Mine layer', 'no ammo hold: the mine layer cannot be refilled once it is empty');
    }
    if (L.ram) info('Ram prow', `a reinforced prow: when the ships meet nose first a ram hurts the other ship ${config.RAM.MUL}x as much, and her own only ${config.RAM.SELF}x; weighs ${BALANCE.MASS.kind.ram}. It wants speed and a bold captain`);
  }

  // --- The cargo drop hatch (hatch.js, config.HATCH): a real hole in a deck when it is open. What falls through it, what is in the way, and whether the crew can still get about with it open.
  if ((L.hatches || []).length) {
    const HC = config.HATCH, hs = L.hatches, cols = (h) => Math.round(((h.x1 - h.x0) / COL) * 10) / 10;
    info('Cargo drop hatch', `${hs.length} hatch${hs.length === 1 ? '' : 'es'} (${hs.map((h) => `${h.n}: ${cols(h)} column${cols(h) === 1 ? '' : 's'} of the ${(byId[h.p] || {}).name || h.p}`).join(', ')}), weighing ${hs.reduce((n, h) => n + ((h.x1 - h.x0) / 100) * HC.MASS, 0).toFixed(1)} in all. The lever beside it sounds a klaxon for ${HC.WARN_TIME} s, then the trapdoors swing open and anyone standing over them falls through (Action opens a parachute); sacks and crates lying on it drop onto whatever is below; boarders on it are tipped out; routes go round the hole. Dump weight when she is going down, drop crates on a ship below, tip raiders out`);
    const below = (h) => L.platforms.filter((q) => q.y > byId[h.p].y + 2 && q.x1 > h.x0 + 4 && q.x0 < h.x1 - 4);
    for (const h of hs) {
      const q = byId[h.p];
      if (!q) continue;
      const under = below(h);
      info('Cargo drop hatch', under.length ? `the ${h.n} drops onto the ${under[0].name}${under.length > 1 ? ' (and the decks under that)' : ''}: a crate lands on her own deck as a load, a faller lands hurt only from a great height` : `the ${h.n} has none of her own decks under it: what falls goes straight out of the hull (onto a ship below, or away) - a crate dropped on an enemy, weight dumped for good`);
      const inSpan = (x) => x > h.x0 - 1 && x < h.x1 + 1;
      const stuff = [...L.stations, ...L.engines].filter((s) => s.p === h.p && inSpan(s.x)).map((s) => s.n || s.name);
      for (const c of L.connectors) if ((L.platforms[c.top] || {}).id === h.p && inSpan(c.xTop)) stuff.push(`a ${c.type}`); else if ((L.platforms[c.bottom] || {}).id === h.p && inSpan(c.xBottom)) stuff.push(`a ${c.type}`);
      for (const o of [...L.racks, ...L.vents, ...L.extinguishers, ...(L.gasValves || []), ...(L.ballast || [])]) if (o.p === h.p && !o.hang && inSpan(o.x)) stuff.push(o.kind ? `a ${o.kind} rack` : 'a rack, vent or valve');
      if (stuff.length) warn('Cargo drop hatch', `the ${h.n} has ${stuff.slice(0, 4).join(', ')} on its trapdoors: open, the floor there is gone (move it, or the hatch)`);
      const near = L.stations.find((s) => s.kind === 'coal' && s.p === h.p && s.x > h.x0 - HC.COAL_REACH && s.x < h.x1 + HC.COAL_REACH);
      if (near) info('Cargo drop hatch', `the ${near.n} stands beside the ${h.n}: when she is going down, opening it spills the coal bunker down the chute (the weight goes at once, and so does the fuel)`);
    }
    if (routesOk && !cbad.length && L.platforms.length > 1) { // the way about with every hatch open: the lever, and every station, must still be reachable from each other
      const open = makePlanner(L, config.MOVE.WALK_SPEED, hs.map((h) => ({ d: L.platforms.indexOf(byId[h.p]), x0: h.x0, x1: h.x1 })));
      const cut = [];
      for (const h of hs) {
        const d = L.platforms.indexOf(byId[h.p]);
        for (const s of [...L.stations, ...L.engines]) {
          const sd = s.d, sx = s.x;
          if (!Number.isFinite(open.plan(d, h.lx, sd, sx).cost) || !Number.isFinite(open.plan(sd, sx, d, h.lx).cost)) cut.push(`${s.n || s.name} and the ${h.n}'s lever`);
        }
      }
      if (cut.length) warn('Cargo drop hatch', `with every hatch open there is no way between ${[...new Set(cut)].slice(0, 3).join('; ')} (the hole cuts the deck in two: give the cut-off part a ladder of its own)`);
      else pass('Cargo drop hatch', 'with every hatch open the crew can still walk from the levers to every station');
    }
  }

  // --- Advice: the parts she would be better for (a missing one is a strong WARN, never a FAIL).
  const list = checklist(L, routesOk);
  for (const c of list) if (c.tier === 'rec' && !c.ok && c.applies) warn('Advice', c.why);
  const hardNeeds = list.filter((c) => c.tier === 'need' && !c.ok);
  const advice = list.filter((c) => c.tier !== 'need' && !c.ok && c.applies);
  return result(L, { budgets: { lift, steam, hands, walk, fit, balance: bal, fire: fr }, checklist: list, needs: hardNeeds.map((c) => c.label), advice: advice.map((c) => ({ key: c.key, label: c.label, why: c.why, tier: c.tier })) });
}

// ---- bot-run check ---------------------------------------------------------------------------------------------
// runs = BUILD_STATS results from buildStats.js (one per map), layout = the build's layout. Returns checks like validate's.
// opts.strict: judge manned kinds and hauling (a full 3-minute run); a short test only reports them.
export function judgeBotRuns(runs, layout, opts = {}) {
  const first = (list, n = 4) => list.slice(0, n).join(', ') + (list.length > n ? ` and ${list.length - n} more` : '');
  const checks = [];
  const add = (level, text) => checks.push({ group: 'Bot run', level, text });
  const sum = (f) => runs.reduce((n, r) => n + f(r), 0);
  const errors = sum((r) => r.errors || 0);
  if (errors) add('FAIL', `${errors} errors while the bots flew her`);
  else add('PASS', `0 errors in ${runs.length} run${runs.length === 1 ? '' : 's'}`);
  const kinds = {};
  for (const r of runs) for (const [k, s] of Object.entries(r.mannedKinds || {})) kinds[k] = (kinds[k] || 0) + s;
  const present = BOT_MANNED_KINDS.filter((k) => layout.stations.some((s) => s.kind === k));
  const never = present.filter((k) => !kinds[k]);
  const level = opts.strict === false ? 'WARN' : 'FAIL';
  if (never.length) add(level, `never manned by the bots: ${never.join(', ')}`);
  else add('PASS', `every station kind the bots use was manned (${present.map((k) => k + ' ' + Math.round(kinds[k]) + 's').join(', ')})`);
  const idle = layout.stations.filter((s) => BOT_MANNED_KINDS.includes(s.kind) && !runs.some((r) => (r.mannedNames || {})[s.n])).map((s) => s.n);
  if (idle.length && !never.length && opts.strict !== false) add('WARN', `stations nobody manned: ${first(idle)}`);
  const hauled = (k) => sum((r) => (r.hauled || {})[k] || 0);
  const lacks = ['coal', 'ammo'].filter((k) => !hauled(k));
  if (lacks.length) add('WARN', `nothing hauled: ${lacks.join(', ')}`);
  else add('PASS', `hauled ${hauled('coal')} coal and ${hauled('ammo')} ammo loads, patched ${hauled('holes')} holes, ${hauled('fires')} fires out`);
  if (!hauled('holes')) add('WARN', 'no holes patched (maybe none were punched)');
  const hull = runs.length ? sum((r) => r.avgHull || 0) / runs.length : 0;
  if (hull <= config.BUILD_CHECK.BOT_HULL_MIN) add('WARN', `average hull ${hull.toFixed(0)} (needs over ${config.BUILD_CHECK.BOT_HULL_MIN})`);
  else add('PASS', `average hull ${hull.toFixed(0)}`);
  const tugs = Math.max(0, ...runs.map((r) => r.tows || 0));
  if (tugs > config.BUILD_CHECK.BOT_TUGS_MAX) add('WARN', `hauled out of a wedge ${tugs} times (at most ${config.BUILD_CHECK.BOT_TUGS_MAX})`);
  else add('PASS', `${tugs} tug rescue${tugs === 1 ? '' : 's'}`);
  return checks;
}

// Plain-text report of a validate() result (the CLI prints it; the dev page uses result.checks directly).
export function formatReport(res, title = 'build') {
  const lines = [`=== ${title}: ${res.ok ? 'PASS' : 'FAIL'}${res.warns.length ? ` (${res.warns.length} warning${res.warns.length === 1 ? '' : 's'})` : ''} ===`];
  for (const c of res.checks) lines.push(`  ${c.level.padEnd(4)}  ${c.group.padEnd(14)} ${c.text}`);
  const b = res.budgets;
  if (b && b.lift) {
    const bar = (v, lo, hi, w = 24) => { const n = Math.max(0, Math.min(w, Math.round(((v - lo) / (hi - lo)) * w))); return '[' + '#'.repeat(n) + '.'.repeat(w - n) + ']'; };
    lines.push('', `  LIFT   ${bar(b.lift.hover, 0, 100)} hover at gas ${b.lift.hover}  (weight ${b.lift.mass}, lift ${b.lift.lift}; ok ${BC.HOVER_MIN}-${BC.HOVER_MAX})  ${b.lift.level}`);
    lines.push(`  STEAM  ${bar(b.steam.cruise, 0, 100)} ${b.steam.cruise} at cruise, ${b.steam.idle} at idle  (${b.steam.boilers} boiler${b.steam.boilers === 1 ? '' : 's'}; ok cruise >= ${BC.PRESS_CRUISE_MIN}, idle <= ${BC.PRESS_IDLE_MAX})  ${b.steam.level}`);
    if (b.balance && b.balance.com) lines.push(`  BALANCE ${b.balance.text}  (centre of mass x ${Math.round(b.balance.com.x)}, lift x ${Math.round(b.balance.col.x)}; level within ${BALANCE.LEVEL_PX} px, warn ${BALANCE.WARN_PX}, fail ${BALANCE.FAIL_PX})  ${b.balance.level}`);
    lines.push(`  HANDS  ${bar(b.hands.perPlayer, 0, 4)} ${b.hands.perPlayer} stations per player at ${b.hands.crew} crew  (${b.hands.stations} manned stations; ${b.hands.at4} at 4, ${b.hands.at6} at 6; ok <= ${BC.HANDS_PER_PLAYER})  ${b.hands.level}`);
  }
  return lines.join('\n');
}
