// THE PARTS REGISTRY (3D.md section 2, WP2). Every kind of part in a ship's parts list (shipBuild.js PARTS) maps to a builder:
//
//   REGISTRY[kind] = { build(part, ctx, index) -> { key, batches: [PartBatch], dyn: [ { role, key, node, ... } ], bounds }, art: true|false }
//
// part is the layout's item for that part (a platform, a station, a gun mount ...); ctx is the shared ship context (makeShipContext below). A builder returns
//   key      the PART ID: 'deck:main', 'gasbag:bag1', 'station:Boiler', 'gun:Nose Gun', 'engine:Fore Engine', 'ladder:3', 'dropHatch:Hatch', 'hull' ... (listParts gives every part's key)
//   batches  the part's own PartBatch(es): pieces in three layers (neg | main | pos, see kit.js), NOT yet merged
//   dyn      pieces that move (a gun's barrel, a lamp, a prop, a wheel, the bag's swell group, a hatch leaf): each is a Group of its own, listed with its role
//   bounds   a box around the part in the ship's 3D frame
//
// WP5 (destruction) relies on the KEYING: buildParts() hands back `entries` ({ key, batch }) which kit.assemble() merges into ONE mesh while remembering which vertex ranges belong to which key
// (assembled.ranges[key]) - so a part that breakOff.js cuts is lifted out with assembled.extract(key) (a Group of just its triangles) plus its dyn nodes (parts.get(key).dyn), and the ship is rebuilt
// from the new layout. parts.get(key) also says what the part IS: { key, kind, name, deck (the platform id it stands on), x, x0, x1 } so a cut [x0, x1] of deck `id` finds its parts.
// Kinds that are data only (boarder entry points, scars, the frame, gas valves of no art ...) are in the registry too, with art: false, so a gate can check that every PARTS kind has an entry.
import { THREE } from '../style.js';
import { PartBatch } from './kit.js';
import { hullGeom, rowOf, isNestRow, KEEL_ROWS } from '../../host/shipBuild.js';
import { buildHull } from './hull.js';
import { buildBag } from './bag.js';
import { buildDeck, buildHatch, buildArmour, buildRam } from './decks.js';
import { buildRoom } from './rooms.js';
import { buildStation, buildConnector, buildPipe, buildRack, buildExtinguisher, buildVent, buildMedbay, buildEscortDock, buildBallast, buildGasValve } from './stations.js';
import { buildGun, buildSearchlight, buildCoil, buildCannon } from './weapons.js';
import { buildEngine, buildSail } from './engines.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

export const THEMES = {
  ours: { hull: '#b98a5a', hullDark: '#8a6444', deck: '#c9a05f', deckAlt: '#bf9567', wall: '#d2b98e', rail: '#6b4a32', bag: '#ebdfc0', bagShade: '#d6c7a2', fin: '#c49a74', brass: '#c9a85a', iron: '#6a6568', trim: '#8fb37a', glass: '#bcd9e3', rope: '#a88a5a', roomTint: 0 },
  enemy: { hull: '#4a4346', hullDark: '#2f2a2e', deck: '#6a5f62', deckAlt: '#5e5457', wall: '#6a5a5c', rail: '#2f2a2e', bag: '#a8443f', bagShade: '#8c2f2f', fin: '#4a4346', brass: '#b08a4a', iron: '#4a4346', trim: '#e8dcc0', glass: '#c9706a', rope: '#6b5a4a', roomTint: 0.55 },
};

const empty = (key) => (part, ctx) => ({ key: key || 'none', batches: [], dyn: [], bounds: null });
const keyless = (kind) => (part, ctx, i) => ({ key: kind + ':' + i, batches: [], dyn: [], bounds: null }); // (data only: nothing to draw)
const connector = (part, ctx, i) => buildConnector(part, ctx, i);

// kind -> builder. `art: false` = a part of the build that has no picture of its own (the sim uses it, or another part draws it).
export const REGISTRY = {
  hull: { build: (L, ctx) => buildHull(ctx), art: true },
  deck: { build: buildDeck, art: true },
  enemyDeck: { build: buildDeck, art: true },
  room: { build: buildRoom, art: true },
  ladder: { build: connector, art: true }, rope: { build: connector, art: true }, stairs: { build: connector, art: true }, lift: { build: connector, art: true }, pole: { build: connector, art: true },
  station: { build: buildStation, art: true },
  gun: { build: (m, ctx, name) => buildGun(name, m, ctx), art: true },
  searchlight: { build: (s, ctx, name) => buildSearchlight(name, s, ctx), art: true },
  sail: { build: buildSail, art: true },
  crewCannon: { build: buildCannon, art: true },
  coil: { build: buildCoil, art: true },
  engine: { build: buildEngine, art: true },
  ballast: { build: buildBallast, art: true },
  dropHatch: { build: buildHatch, art: true },
  armour: { build: buildArmour, art: true },
  ramProw: { build: (r, ctx) => buildRam(r, ctx), art: true },
  pipe: { build: buildPipe, art: true },
  vent: { build: buildVent, art: true },
  gasValve: { build: buildGasValve, art: true },
  rack: { build: buildRack, art: true },
  extinguisher: { build: buildExtinguisher, art: true },
  escortDock: { build: buildEscortDock, art: true },
  medbay: { build: (q, ctx) => buildMedbay(q, ctx), art: true },
  gasbag: { build: (g, ctx, i) => buildBag(g, ctx, i, ctx.bags.length), art: true },
  boarderEntry: { build: keyless('boarderEntry'), art: false }, // (where raiders land: no picture)
  bombBay: { build: keyless('bombBay'), art: false }, // (its station draws the bombs)
  scar: { build: keyless('scar'), art: false }, // (the hole a broken-off part left: WP5 draws it)
  frame: { build: keyless('frame'), art: false },
  enemyFrame: { build: keyless('enemyFrame'), art: false },
};
void empty;

// Every part of a layout as { kind, part (the layout item), key hint, arg (the third builder argument) }, in the order they are built.
export function listParts(L) {
  const out = [{ kind: 'hull', part: L, arg: 0 }];
  const add = (kind, list, argOf) => (list || []).forEach((p, i) => out.push({ kind, part: p, arg: argOf ? argOf(p, i) : i }));
  add('deck', L.platforms);
  add('room', L.rooms);
  for (const t of ['ladder', 'rope', 'stairs', 'lift', 'pole']) add(t, (L.connectors || []).filter((c) => c.type === t), (p) => (L.connectors || []).indexOf(p));
  add('pipe', L.pipes); add('vent', L.vents); add('rack', L.racks); add('extinguisher', L.extinguishers);
  if (L.medbay) out.push({ kind: 'medbay', part: L.medbay, arg: 0 });
  add('escortDock', L.escortDocks); add('dropHatch', L.hatches); add('ballast', L.ballast); add('gasValve', L.gasValves); add('armour', L.armour);
  add('station', L.stations);
  for (const [name, m] of Object.entries(L.gunMounts || {})) out.push({ kind: 'gun', part: m, arg: name });
  for (const [name, s] of Object.entries(L.searchlights || {})) out.push({ kind: 'searchlight', part: s, arg: name });
  add('engine', L.engines); add('sail', L.sails); add('crewCannon', L.cannons);
  if (L.ram) out.push({ kind: 'ramProw', part: L.ram, arg: 0 });
  if (L.coil) out.push({ kind: 'coil', part: L.coil, arg: 0 });
  const bags = L.gasbags && L.gasbags.length ? L.gasbags : L.gasbag ? [L.gasbag] : [];
  bags.forEach((g, i) => out.push({ kind: 'gasbag', part: g, arg: i, n: bags.length }));
  return out;
}

// Where a part is: { deck (platform id), x, x0, x1, name }, for WP5 to find the parts of a cut deck stretch.
export function locate(L, kind, part) {
  const P = L.platforms || [];
  const deck = part.p || (part.d != null && P[part.d] ? P[part.d].id : null);
  const x = part.x != null ? part.x : part.bx != null ? part.bx : part.cx != null ? part.cx : part.xTop != null ? part.xTop : null;
  const x0 = part.x0 != null ? part.x0 : part.cx != null ? part.cx - part.rx : x, x1 = part.x1 != null ? part.x1 : part.cx != null ? part.cx + part.rx : x;
  return { kind, deck: kind === 'deck' ? part.id : deck, x, x0, x1, name: part.n || part.name || part.id || null };
}

// The shared context every builder reads (the same numbers the old shipMesh computed up front).
export function makeShipContext(layout, opts = {}) {
  const L = layout, T = opts.enemy ? THEMES.enemy : THEMES.ours;
  const P = L.platforms || [];
  const b = L.bounds || { x0: 0, x1: 1500, y0: -300, y1: 900 };
  const pv = (b.x0 + b.x1) / 2, len = b.x1 - b.x0;
  const W = clamp(len * 0.09, 90, 250); // the gondola's half-beam (about 18% of the ship's length across)
  const X = (x) => x - pv, Y = (y) => -y;
  const H = (() => { try { return hullGeom(P, L.rooms || []); } catch { return null; } })();
  const hx0 = H ? H.xL : P.length ? Math.min(...P.map((q) => q.x0)) : 0, hx1 = H ? H.xR : P.length ? Math.max(...P.map((q) => q.x1)) : 1000;
  const bags = L.gasbags && L.gasbags.length ? L.gasbags : L.gasbag ? [L.gasbag] : [];
  const fallbacks = [];
  const ctx = {
    L, T, P, W, pv, X, Y, H, hx0, hx1, bags, opts, fallbacks, rowOf, isNestRow, KEEL_ROWS,
    FZ: -W * 0.3, // the depth where fittings stand (crew walk in front of them, ladders behind)
    laneZ: -W * 0.62, // ladders, ropes and poles
    mix: mixHex,
    platY: (d) => (P[d] ? P[d].y : 0),
    catwalk: P.find((q) => q.id === 'catwalk') || P.reduce((a, q) => (q.y < a.y ? q : a), P[0] || { y: 470 }),
    glowSpots: [], lanternSpots: [], lanternRooms: new Set(),
    content: null, // (shipMesh sets it: the group the dynamic nodes go into)
    note: (s) => { if (!fallbacks.includes(s)) fallbacks.push(s); },
  };
  const zOf = (q) => {
    const row = rowOf(q);
    if (isNestRow(row)) return 95;
    if (row === 'helm') return W * 0.6;
    if (row === 'bay') return W * 0.75;
    if (row === 'belly') return W * 0.4;
    return W * 0.97;
  };
  // [x0, x1, zHalf, rail?] pieces: the part inside the hull is full width, outriggers beyond it narrower (with rails)
  ctx.deckSegs = (q) => {
    const row = rowOf(q), z = zOf(q);
    const rail = !!q.outside || isNestRow(row) || row === 'helm';
    if (!['main', 'lower'].includes(row)) return [[q.x0, q.x1, z, rail]];
    const out = [];
    if (q.x0 < hx0) out.push([q.x0, Math.min(q.x1, hx0), W * 0.5, true]);
    if (q.x1 > hx0 && q.x0 < hx1) out.push([Math.max(q.x0, hx0), Math.min(q.x1, hx1), q.outside ? W * 0.9 : z, !!q.outside]);
    if (q.x1 > hx1) out.push([Math.max(q.x0, hx1), q.x1, W * 0.5, true]);
    return out.filter((s) => s[1] - s[0] > 1);
  };
  // the rooms that hang a lantern: every other hull room, up to 4 (2 for the enemy)
  const hullRooms = (L.rooms || []).filter((r) => !r.outside && P[r.d] && !P[r.d].outside && ['main', 'lower'].includes(rowOf(P[r.d])));
  for (const r of hullRooms.filter((_, i) => i % 2 === 0).slice(0, opts.enemy ? 2 : 4)) ctx.lanternRooms.add(r);
  return ctx;
}

// Build every part: returns { entries: [{ key, batch }], parts: Map(key -> { key, kind, name, deck, x, x0, x1, dyn, bounds }), dyn: [every dyn record] }. A part whose builder throws is skipped and noted
// in ctx.fallbacks (and warned), the rest of the ship still builds.
export function buildParts(L, ctx, makeDyn) {
  const entries = [], parts = new Map(), dyn = [], made = [];
  ctx.part = (key) => { const batch = new PartBatch(key); batch.mats = ctx.mats; made.push({ key, batch }); return batch; };
  ctx.dynBatch = (key) => { const batch = new PartBatch(key); batch.mats = ctx.mats; return batch; };
  for (const item of listParts(L)) {
    const reg = REGISTRY[item.kind];
    if (!reg) { ctx.note('part kind "' + item.kind + '" has no builder'); continue; }
    made.length = 0;
    let res = null;
    try { res = reg.build(item.part, ctx, item.arg); } catch (e) { ctx.note(item.kind + ' failed: ' + (e && e.message)); console.warn('ship3d', item.kind, e); continue; }
    if (!res) continue;
    let key = res.key;
    if (parts.has(key)) { let n = 2; while (parts.has(key + '#' + n)) n++; key = key + '#' + n; }
    const mine = new Set(res.batches || []);
    for (const m of made) if (mine.has(m.batch)) { const e = { key, batch: m.batch }; entries.push(e); }
    const meta = item.kind === 'hull' ? { kind: 'hull', deck: null, x: null, x0: null, x1: null, name: 'hull' } : locate(L, item.kind, item.part);
    parts.set(key, { key, ...meta, kind: item.kind, dyn: res.dyn || [], bounds: res.bounds || null });
    for (const d of res.dyn || []) dyn.push({ ...d, partKey: key });
  }
  void makeDyn;
  return { entries, parts, dyn };
}
