// The ship-building validator (Phase S.5): is this list of parts a ship that can be flown?
//   validate(parts, opts)  ->  { ok, fails, warns, checks, budgets, layout }
// It builds the layout (shipBuild.js buildLayout), then checks geometry, connectivity, walking times, lift, steam, size, cave fit,
// required kinds and hands against the limits in config.BUILD_CHECK. Pure and Node-safe (no DOM, no live ship): the CLI
// (tools/buildsim.mjs), the batch runner and the dev page (public/buildtest.html) all use it.
// A check is { group, level: 'PASS' | 'WARN' | 'FAIL', text }; ok means no FAIL.
import { config } from '../../config.js';
import { buildLayout, budgets as partBudgets, STATION_KINDS, ONE_PER_SHIP, KIND_STATS } from './shipBuild.js';

const BC = config.BUILD_CHECK;
const GRAB_COST = 0.25; // seconds to get onto a ladder (the same number as nav.js)

// Kinds the bots man within any 3 minutes of flying: a build where one of these is never manned has a station nobody can reach or use.
// (Searchlights, the coil and the navigator are manned only when it is dark, when there are targets, or by humans.)
export const BOT_MANNED_KINDS = ['helm', 'lookout', 'gun', 'deflector', 'bombBay', 'escort'];

// What the game code needs of a ship until the part catalogue (S.6) teaches it to cope without: these single pieces must exist.
const ENGINE_NEEDS = [
  ['bombBay', (L) => !!L.bombBay && L.stations.some((s) => s.kind === 'bombBay'), 'a bomb bay (the bomb bay station and its doors: modules.js builds a module for it)'],
  ['lift', (L) => L.connectors.some((c) => c.type === 'lift') && !!L.liftRepair, 'a lift (modules.js builds a module for it, with its repair spot)'],
  ['gasbag', (L) => !!L.gasbag, 'a gasbag'],
  ['shield', (L) => !!L.shield, 'a deflector shield band'],
  ['hammer rack', (L) => L.racks.some((r) => r.kind === 'hammer'), 'a hammer rack (repairs)'],
  ['hookshot rack', (L) => L.racks.some((r) => r.kind === 'hookshot'), 'a hookshot rack'],
  ['sword rack', (L) => L.racks.some((r) => r.kind === 'sword'), 'a sword rack (raiders)'],
  ['ice locker', (L) => L.racks.some((r) => r.kind === 'ice'), 'an ice locker (GOING DOWN!)'],
];

// ---- walking: the same route-finding as nav.js, on any layout -----------------------------------------------
// Returns { plan(d1, x1, d2, x2) -> { cost (seconds), node }, reach(d1, d2) } for the layout's platforms and connectors.
// Poles are one-way (top to bottom). Used here for the walk budgets and the connectivity check, and by the dev page's heat map.
export function makePlanner(L, walk = config.MOVE.WALK_SPEED) {
  const P = L.platforms, C = L.connectors;
  const NN = C.length * 2;
  const nodes = Array.from({ length: NN }, (_, n) => ({ d: n % 2 ? C[n >> 1].bottom : C[n >> 1].top, x: n % 2 ? C[n >> 1].xBottom : C[n >> 1].xTop }));
  const nodesOn = P.map((_, d) => nodes.map((nd, n) => (nd.d === d ? n : -1)).filter((n) => n >= 0));
  const climb = (c) => (P[c.bottom].y - P[c.top].y) / c.speed + GRAB_COST;
  const tt = Array.from({ length: NN }, () => Array(NN).fill(Infinity));
  for (let a = 0; a < NN; a++) {
    tt[a][a] = 0;
    for (const b of nodesOn[nodes[a].d]) tt[a][b] = Math.min(tt[a][b], Math.abs(nodes[a].x - nodes[b].x) / walk);
  }
  C.forEach((c, i) => {
    tt[2 * i][2 * i + 1] = Math.min(tt[2 * i][2 * i + 1], climb(c));
    if (c.type !== 'pole') tt[2 * i + 1][2 * i] = Math.min(tt[2 * i + 1][2 * i], climb(c));
  });
  for (let k = 0; k < NN; k++) for (let a = 0; a < NN; a++) for (let b = 0; b < NN; b++) if (tt[a][k] + tt[k][b] < tt[a][b]) tt[a][b] = tt[a][k] + tt[k][b];
  const plan = (d1, x1, d2, x2) => {
    if (d1 === d2) return { cost: Math.abs(x1 - x2) / walk, node: -1 };
    let best = { cost: Infinity, node: -1 };
    for (const a of nodesOn[d1] || []) {
      const c = C[a >> 1];
      if (a % 2 && c.type === 'pole') continue;
      const there = a % 2 ? 2 * (a >> 1) : 2 * (a >> 1) + 1;
      const first = Math.abs(x1 - nodes[a].x) / walk + climb(c);
      for (const b of nodesOn[d2] || []) {
        const cost = first + tt[there][b] + Math.abs(nodes[b].x - x2) / walk;
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
export function liftGauge(parts) {
  const b = partBudgets(parts);
  const hover = config.GAS.NEUTRAL + b.mass - b.lift;
  const level = hover < BC.HOVER_MIN || hover > BC.HOVER_MAX ? 'FAIL' : hover > BC.HOVER_WARN ? 'WARN' : 'PASS';
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
  const engineNames = new Set(L.engines.map((e) => e.name));
  const use = (speed, busy) => {
    let u = B.USE_BASE;
    for (const pipe of L.pipes) u += engineNames.has(pipe.to) ? B.USE_ENGINE * speed : B.USE_POWERED;
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
  const level = cruise < BC.PRESS_CRUISE_MIN ? 'FAIL' : idle > BC.PRESS_IDLE_MAX ? 'WARN' : 'PASS';
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
  const result = (layout, extra = {}) => {
    const fails = checks.filter((c) => c.level === 'FAIL').map((c) => c.text);
    const warns = checks.filter((c) => c.level === 'WARN').map((c) => c.text);
    return { ok: fails.length === 0, fails, warns, checks, layout, ...extra };
  };
  let L;
  try { L = buildLayout(parts, { cell: opts.cell || config.MAPS.CELL }); } catch (e) { fail('Geometry', 'the parts do not build: ' + String(e.message || e)); return result(null, { budgets: {} }); }
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
  placed(L.escortDocks, (o) => `escort hook ${o.n}`);
  if (L.medbay) placed([L.medbay], () => 'the medbay');
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
  for (const id of ['nest', 'catwalk', 'main', 'lower']) if (!byId[id]) kbad.push(`there is no ${id} deck`);
  if (!kbad.length && !cbad.length) {
    const planner = makePlanner(L);
    const lost = [];
    for (let a = 0; a < L.platforms.length; a++) for (let b = 0; b < L.platforms.length; b++) if (a !== b && !planner.reach(a, b)) lost.push(`no way from the ${L.platforms[a].name} to the ${L.platforms[b].name}`);
    kbad.push(...lost.slice(0, 4));
    if (lost.length > 4) kbad.push(`...and ${lost.length - 4} more broken routes`);
  }
  if (!(L.spawnPlatform >= 0)) kbad.push('there is no spawn deck for crew that miss the ship');
  if (L.boarderEntryPoints.length < 2) kbad.push(`only ${L.boarderEntryPoints.length} boarding point(s); raiders and new crew need at least 2`);
  group(K, kbad, `every deck reaches every other (poles only downward), spawn deck ${L.platforms[L.spawnPlatform] ? L.platforms[L.spawnPlatform].name : '?'}, ${L.boarderEntryPoints.length} boarding points`);

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
  if (lift.level === 'FAIL') fail('Lift', hoverText + (lift.hover > BC.HOVER_MAX ? ': too heavy for her bags' : ': too much lift, she will not stay down'));
  else if (lift.level === 'WARN') warn('Lift', hoverText + `: above ${BC.HOVER_WARN}, lots of pumping`);
  else pass('Lift', hoverText);
  const steam = steamGauge(L);
  if (steam.cruise < BC.PRESS_CRUISE_MIN) fail('Steam', `settled pressure at cruise ${steam.cruise} (needs ${BC.PRESS_CRUISE_MIN}): the boiler cannot keep up${steam.boilers ? '' : ' (no boiler)'}`);
  else if (steam.idle > BC.PRESS_IDLE_MAX) warn('Steam', `settled pressure at idle ${steam.idle} (over ${BC.PRESS_IDLE_MAX}): the crew will be venting`);
  else pass('Steam', `settled pressure ${steam.cruise} at cruise, ${steam.idle} at idle (${steam.boilers} boiler${steam.boilers === 1 ? '' : 's'})`);
  const hands = handsGauge(L);
  if (hands.level === 'WARN') warn('Hands', `${hands.stations} manned stations is ${hands.perPlayer} per player at ${hands.crew} crew (over ${BC.HANDS_PER_PLAYER})`);
  else pass('Hands', `${hands.stations} manned stations: ${hands.perPlayer} per player at ${hands.crew} crew (${hands.at4} at 4, ${hands.at6} at 6)`);

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

  // --- Required kinds, kind sanity.
  const R = 'Required kinds';
  const named = [...L.stations.map((s) => [s.n, s.kind]), ...L.engines.map((e) => [e.name, e.kind])];
  const rbad = [];
  for (const [n, kind] of named) if (!STATION_KINDS.includes(kind)) rbad.push(`${n} has ${kind ? 'unknown kind ' + kind : 'no kind'}`);
  const seen = new Set();
  for (const [n] of named) { if (seen.has(n)) rbad.push('duplicate station name ' + n); seen.add(n); }
  for (const kind of ['helm', 'boiler', 'coal', 'ammo', 'engine', 'gun', 'lookout']) if (!named.some(([, k]) => k === kind)) rbad.push('no ' + kind + ' station');
  if (!L.medbay) rbad.push('no medbay');
  for (const kind of ONE_PER_SHIP) if (named.filter(([, k]) => k === kind).length > 1) rbad.push('more than one ' + kind + ' station (the game supports one)');
  for (const [key, ok, what] of ENGINE_NEEDS) if (!ok(L)) rbad.push(`no ${key}: the game still needs ${what}`);
  group(R, rbad, 'helm, boiler, coal, ammo, engine, gun, lookout and medbay are all there');

  return result(L, { budgets: { lift, steam, hands, walk, fit } });
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
    lines.push(`  HANDS  ${bar(b.hands.perPlayer, 0, 4)} ${b.hands.perPlayer} stations per player at ${b.hands.crew} crew  (${b.hands.stations} manned stations; ${b.hands.at4} at 4, ${b.hands.at6} at 6; ok <= ${BC.HANDS_PER_PLAYER})  ${b.hands.level}`);
  }
  return lines.join('\n');
}
