// The ship as LEGO PARTS (Phase S). A build is a list of placed parts; buildLayout(parts) turns it into the
// layout data the whole game reads (the same shape SHIP_LAYOUT always had). public/shipLayout.js applies it.
//
// This module is PURE and Node-safe (no config, no DOM) like gunshipBlueprint.js, so tools/buildsim.mjs can use it.
//
// Placement: x runs on a 120 px COLUMN grid (a part has `col`, and everything it emits is shifted by col * COL);
// y runs on named DECK ROWS (DECK_ROWS). The classic ship predates the grid, so its parts all sit at col 0 and
// carry their own pixel x, which is exactly what reproduces today's ship. New parts (S.6) use cols for real.
//
// Each PARTS entry is { emit(part, A), mass, lift, steam, hands, ... }. emit() hands pieces to A.add(kind, item):
// kind is a layout array (platforms, stations ...) or a keyed collection (gunMounts, searchlights) or a single
// object (coil, gasbag ...). Array order follows the order parts are listed, unless a part gives `ord: { kind: n }`
// to sort earlier or later (the classic ship needs that in a couple of places to match today's order exactly).
// Items name their platform with `p` (an id); buildLayout adds the platform index `d` the game code uses.

export const COL = 120; // width of one column of the build grid (px)

// Deck rows: the y of each floor level. A deck part says `row`, so S.6 can stack decks by row.
export const DECK_ROWS = { nest: -42, helm: 420, catwalk: 470, main: 640, lower: 790, belly: 905, bay: 925 };

// Climbing speeds (px/s) by connector type; a connector part may override with `speed`.
export const CONNECTOR_SPEED = { rope: 150, ladder: 170, stairs: 150, lift: 260, pole: 520 };

// Pieces that live in arrays vs keyed objects vs single objects, and which of their fields are x positions
// (shifted by the part's column). Fields named in D_KINDS also get `d` (the platform index).
const ARRAYS = ['platforms', 'connectors', 'rooms', 'stations', 'engines', 'pipes', 'vents', 'racks', 'extinguishers', 'boarderEntryPoints', 'escortDocks'];
const KEYED = ['gunMounts', 'searchlights'];
const SINGLES = ['coil', 'shield', 'medbay', 'bombBay', 'gasbag', 'liftRepair', 'bounds', 'aimPoint'];
const X_FIELDS = {
  platforms: ['x0', 'x1'], connectors: ['xTop', 'xBottom'], rooms: ['x0', 'x1'], stations: ['x'], engines: ['x'], vents: ['x'], racks: ['x'],
  extinguishers: ['x'], boarderEntryPoints: ['x'], escortDocks: ['x'], gunMounts: ['bx'], searchlights: ['bx'],
  coil: ['x'], shield: ['cx'], medbay: ['x'], bombBay: ['x', 'jumpX'], gasbag: ['cx'], liftRepair: ['x'], bounds: ['x0', 'x1'], aimPoint: ['x'],
};
const D_KINDS = ['rooms', 'stations', 'engines', 'pipes', 'vents', 'racks', 'extinguishers'];

// Copy of a piece moved `ox` px to the right (so builds are never aliased or mutated by buildLayout).
function place(kind, item, ox) {
  const o = { ...item };
  if (kind === 'pipes') {
    o.points = item.points.map(([x, y]) => [x + ox, y]);
    o.valve = [item.valve[0] + ox, item.valve[1]];
  }
  if (ox) for (const f of X_FIELDS[kind] || []) if (o[f] != null) o[f] += ox;
  return o;
}

// ---- the parts -------------------------------------------------------------------------------------------
// mass / lift / steam / hands are the budget numbers (S.5/S.6 fill them in; 0 for the classic's loose pieces).
const piece = (kind, extra = {}) => ({ mass: 0, lift: 0, steam: 0, hands: 0, ...extra, emit: (p, A) => A.add(kind, withoutPart(p)) });
const withoutPart = (p) => { const o = { ...p }; delete o.part; delete o.col; delete o.ord; return o; };
const connector = { mass: 0, lift: 0, steam: 0, hands: 0, emit: (p, A) => {
  const o = withoutPart(p);
  o.speed ??= CONNECTOR_SPEED[o.type];
  A.add('connectors', o);
} };
const asType = (type) => ({ ...connector, emit: (p, A) => connector.emit({ ...p, type }, A) });

export const PARTS = {
  // A walkable floor. `row` is a DECK_ROWS name (y comes from it), x0/x1 are its span.
  deck: { mass: 0, lift: 0, steam: 0, hands: 0, emit: (p, A) => {
    const o = withoutPart(p);
    o.y = DECK_ROWS[o.row];
    delete o.row;
    A.add('platforms', o);
  } },
  // A named area on a deck (drawing, and telling players where things are).
  room: piece('rooms'),
  // Ways between decks. top/bottom are platform ids.
  ladder: asType('ladder'),
  rope: asType('rope'),
  stairs: asType('stairs'),
  lift: { ...connector, emit: (p, A) => {
    const o = withoutPart(p);
    const repair = o.repair; // where to stand to repair the lift's gas
    delete o.repair;
    A.add('connectors', { type: 'lift', speed: CONNECTOR_SPEED.lift, ...o });
    if (repair) A.add('liftRepair', repair);
  } },
  pole: asType('pole'),
  // A place a player can stand to do a job.
  station: piece('stations'),
  // A station plus the gun on it: where the barrel pivots (bx, by), the middle of its arc (aim) and how far it turns (arc).
  gun: { mass: 0, lift: 0, steam: 0, hands: 1, emit: (p, A) => {
    const { bx, by, aim, arc, n, ord } = p;
    A.add('stations', { n, p: p.p, x: p.x });
    A.add('gunMounts', { bx, by, aim, arc }, n, ord && ord.gunMounts);
  } },
  // A station plus its lamp. len = how long the drum is (the beam starts at the lens).
  searchlight: { mass: 0, lift: 0, steam: 0, hands: 1, emit: (p, A) => {
    const { bx, by, aim, arc, len, n } = p;
    A.add('stations', { n, p: p.p, x: p.x });
    A.add('searchlights', { bx, by, aim, arc, len }, n);
  } },
  coil: piece('coil'),
  engine: piece('engines'),
  pipe: piece('pipes'),
  vent: piece('vents'),
  rack: piece('racks'),
  extinguisher: piece('extinguishers'),
  boarderEntry: piece('boarderEntryPoints'),
  escortDock: piece('escortDocks'),
  medbay: piece('medbay'),
  bombBay: piece('bombBay'),
  gasbag: piece('gasbag'),
  // Ship-wide singletons that S.2 will derive from the parts instead.
  frame: { mass: 0, lift: 0, steam: 0, hands: 0, emit: (p, A) => {
    A.add('shield', p.shield);
    A.add('bounds', p.bounds);
    A.add('aimPoint', p.aimPoint);
    A.setScalar('nestRise', p.nestRise);
  } },
};

// ---- the classic ship ------------------------------------------------------------------------------------
// Today's ship, as a list of parts (the order below is the order of platforms, stations, connectors ... in the game).
const deck = (id, row, name, x0, x1, outside) => ({ part: 'deck', id, row, name, x0, x1, ...(outside ? { outside: true } : {}) });
const room = (name, p, x0, x1, color, outside) => ({ part: 'room', name, p, x0, x1, ...(color ? { color } : {}), ...(outside ? { outside: true } : {}) });
const conn = (part, top, bottom, xTop, xBottom) => ({ part, top, bottom, xTop, xBottom });
const station = (n, p, x) => ({ part: 'station', n, p, x });
const rack = (kind, p, x) => ({ part: 'rack', kind, p, x });
const extinguisher = (p, x) => ({ part: 'extinguisher', p, x });
const vent = (p, x) => ({ part: 'vent', p, x });

export const BUILDS = {};
BUILDS.classic = [
  // Floors. The nest sits on top of the gasbag; the top deck is the open-air roof of the gondola; the helm mount is raised on it.
  deck('nest', 'nest', "Crow's Nest", 610, 990, true),
  deck('catwalk', 'catwalk', 'Top Deck', 240, 1360, true),
  deck('helm', 'helm', 'Helm Mount', 1195, 1315, true),
  deck('main', 'main', 'Main Deck', 140, 1470),
  deck('lower', 'lower', 'Lower Deck', 20, 1580),
  deck('bay', 'bay', 'Bomb Bay', 350, 640), // its own compartment in the belly, reached by a hatch ladder from the lower deck
  deck('pod', 'belly', 'Ball Turret', 735, 855),
  deck('hangar', 'belly', 'Fighter Hatch', 1020, 1110, true),
  deck('hangar2', 'belly', 'Fore Fighter Hatch', 1215, 1305, true),
  deck('lamp', 'belly', 'Belly Lamp', 1370, 1450, true), // a small blister under the fore outrigger; the belly searchlight lives here

  // Ways between decks (speed comes from the type).
  conn('rope', 'nest', 'catwalk', 720, 720),
  conn('ladder', 'helm', 'catwalk', 1215, 1215),
  conn('ladder', 'catwalk', 'main', 340, 340),
  conn('ladder', 'catwalk', 'main', 1050, 1050),
  conn('ladder', 'main', 'lower', 255, 255),
  conn('stairs', 'main', 'lower', 560, 700),
  { part: 'lift', top: 'main', bottom: 'lower', xTop: 960, xBottom: 960, repair: { p: 'lower', x: 925 } },
  conn('ladder', 'main', 'lower', 1140, 1140),
  conn('ladder', 'catwalk', 'main', 640, 640), // a third way down from the top deck, mid-ship
  conn('rope', 'nest', 'catwalk', 640, 640), // third rope, above the mid-ship ladder
  conn('rope', 'nest', 'catwalk', 905, 905), // second rope, by the Dorsal Gun and Deflector
  // Slide poles: one-way and fast, top to bottom only.
  conn('pole', 'catwalk', 'main', 860, 860),
  conn('pole', 'main', 'lower', 860, 860),
  conn('pole', 'catwalk', 'main', 1300, 1300),
  conn('pole', 'main', 'lower', 1300, 1300),
  conn('ladder', 'lower', 'bay', 372, 372),
  conn('ladder', 'lower', 'pod', 760, 760),
  conn('ladder', 'lower', 'hangar', 1040, 1040),
  conn('ladder', 'lower', 'hangar2', 1235, 1235),
  conn('ladder', 'lower', 'lamp', 1410, 1410),

  // Named areas.
  room('Tail Turret', 'main', 140, 240, '#b9925c'),
  room('Boiler Room', 'main', 240, 620, '#b08250'),
  room('Workshop', 'main', 620, 1100, '#c9a46a'),
  room('Bridge', 'main', 1100, 1470, '#d4b47c'),
  room('Aft Gun Deck', 'lower', 250, 650, '#a8814f'),
  room('Hold', 'lower', 650, 950, '#9c7646'),
  room('Fore Gun Deck', 'lower', 950, 1350, '#a8814f'),
  room('Bomb Bay', 'bay', 350, 640, '#4a4346'),
  room('Aft Outrigger', 'lower', 20, 250, null, true),
  room('Fore Outrigger', 'lower', 1350, 1580, null, true),

  // Stations (and the guns and lamps on them).
  { part: 'gun', n: 'Aft Dorsal Gun', p: 'nest', x: 660, bx: 650, by: -76, aim: -1.95, arc: 1.2 },
  station('Lookout', 'nest', 770),
  station('Deflector', 'catwalk', 940),
  { part: 'gun', n: 'Dorsal Gun', p: 'nest', x: 940, bx: 950, by: -76, aim: -1.2, arc: 1.2, ord: { gunMounts: -1 } },
  { part: 'gun', n: 'Tail Gun', p: 'catwalk', x: 275, bx: 248, by: 418, aim: Math.PI + 0.35, arc: 1.1 }, // top deck, aft: back and up
  station('Lightning Coil', 'main', 710),
  station('Boiler', 'main', 400),
  station('Navigator', 'main', 1215),
  station('Helm', 'helm', 1275),
  { part: 'gun', n: 'Nose Gun', p: 'catwalk', x: 1340, bx: 1372, by: 418, aim: -0.35, arc: 1.1 }, // top deck, fore: forward and up
  { part: 'gun', n: 'Aft Sponson', p: 'lower', x: 420, bx: 330, by: 812, aim: 2.15, arc: 0.7 },
  station('Coal Bunker', 'lower', 570),
  station('Ammo Hold', 'lower', 870),
  station('Bomb Bay', 'bay', 520),
  { part: 'gun', n: 'Fore Sponson', p: 'lower', x: 1180, bx: 1270, by: 812, aim: 1.0, arc: 0.7 },
  { part: 'gun', n: 'Ventral Gun', p: 'pod', x: 820, bx: 805, by: 948, aim: Math.PI / 2, arc: 1.2 },
  station('Escort Fighter', 'hangar', 1085),
  station('Escort Fighter 2', 'hangar2', 1280),
  { part: 'searchlight', n: 'Nest Searchlight', p: 'nest', x: 815, bx: 815, by: -176, aim: -Math.PI / 2, arc: 1.5, len: 44 },
  { part: 'searchlight', n: 'Belly Searchlight', p: 'lamp', x: 1410, bx: 1410, by: 944, aim: Math.PI / 2, arc: 1.5, len: 40 },

  // Lightning Coil emitter (on top of the crow's nest): fires up and out to the sides.
  { part: 'coil', x: 875, y: -114, aim: -Math.PI / 2, arc: 1.45 },
  // Medical bay: where anyone who falls off the ship comes round.
  { part: 'medbay', p: 'lower', x: 640 },
  // Where each escort fighter hangs on its hook under the hull (the first is the legacy single escortDock).
  { part: 'escortDock', n: 'Escort Fighter', num: 1, p: 'hangar', x: 1075, y: 965 },
  { part: 'escortDock', n: 'Escort Fighter 2', num: 2, p: 'hangar2', x: 1265, y: 965 },
  // Bomb bay doors in the bay floor beside the bombardier: bombs drop from here; jumpX is where you stand to jump (parachute).
  { part: 'bombBay', x: 550, y: 925, jumpX: 585, doorHalf: 48 },
  // Engines on the outriggers, driven by steam.
  { part: 'engine', name: 'Aft Engine', p: 'lower', x: 70 },
  { part: 'engine', name: 'Fore Engine', p: 'lower', x: 1530 },
  // Steam pipes from the boiler to each steam-driven module, each with a valve.
  { part: 'pipe', to: 'Helm', p: 'main', points: [[430, 560], [430, 505], [1275, 505], [1275, 430]], valve: [760, 505] },
  { part: 'pipe', to: 'Lift', p: 'main', points: [[455, 560], [455, 535], [960, 535], [960, 490]], valve: [600, 535] },
  { part: 'pipe', to: 'Aft Engine', p: 'lower', points: [[370, 610], [370, 680], [110, 680], [110, 765]], valve: [230, 680] },
  { part: 'pipe', to: 'Fore Engine', p: 'lower', points: [[440, 610], [440, 692], [1490, 692], [1490, 765]], valve: [1260, 692] },
  // Steam vents.
  vent('catwalk', 600),
  vent('main', 1000),
  vent('lower', 1100),
  // The gasbag envelope (an ellipse); holes in it are patched from the catwalk below or the crow's nest on top.
  { part: 'gasbag', cx: 800, cy: 198, rx: 1000, ry: 232 },

  // Tool racks and fire-extinguisher hooks.
  rack('sword', 'main', 660),
  rack('hammer', 'main', 860),
  rack('sword', 'lower', 1340),
  rack('hammer', 'lower', 1430), // more hammers where the holes and repairs actually happen (the outriggers, the top deck)
  rack('hammer', 'lower', 110),
  rack('hammer', 'catwalk', 480),
  rack('hammer', 'lower', 690),
  rack('hookshot', 'catwalk', 1150), // grappling hookshots: top deck and main deck
  rack('hookshot', 'main', 960),
  rack('ice', 'main', 285), // the ICE LOCKER, aft of the boiler
  extinguisher('lower', 1510),
  extinguisher('main', 520),
  extinguisher('main', 1185),
  extinguisher('lower', 300),
  extinguisher('lower', 1040),
  extinguisher('catwalk', 820),

  // Where raiders land (grapple points on the catwalk).
  { part: 'boarderEntry', x: 290, p: 'catwalk' },
  { part: 'boarderEntry', x: 1335, p: 'catwalk' },

  // Ship-wide numbers: the deflector shield band, the outer edges of the drawing (the camera keeps all of it in view),
  // where enemy fire is aimed, and how far the nest sits above where it was drawn when the bag was smaller.
  { part: 'frame', nestRise: 94, shield: { cx: 800, cy: 470, rx: 1020, ry: 660 }, bounds: { x0: -240, x1: 1810, y0: -165, y1: 975 }, aimPoint: { x: 800, y: 640 } },
];

// ---- building the layout ---------------------------------------------------------------------------------

// Turn a list of placed parts into layout data (same shape as the old hand-written SHIP_LAYOUT).
export function buildLayout(parts) {
  const rows = Object.fromEntries([...ARRAYS, ...KEYED].map((k) => [k, []]));
  const out = {};
  let seq = 0;
  let ox = 0;
  const A = {
    add(kind, item, key, ord) {
      const o = place(kind, item, ox);
      if (KEYED.includes(kind)) rows[kind].push({ key, o, ord: ord ?? seq++ });
      else if (ARRAYS.includes(kind)) rows[kind].push({ o, ord: seq++ });
      else if (SINGLES.includes(kind)) out[kind] = o;
      else throw new Error('shipBuild: unknown piece kind ' + kind);
    },
    setScalar(name, v) { out[name] = v; },
  };
  for (const p of parts) {
    const def = PARTS[p.part];
    if (!def) throw new Error('shipBuild: unknown part ' + p.part);
    ox = (p.col || 0) * COL;
    def.emit(p, A);
  }
  const sorted = (list) => list.map((r, i) => ({ ...r, i })).sort((a, b) => a.ord - b.ord || a.i - b.i);
  for (const kind of ARRAYS) out[kind] = sorted(rows[kind]).map((r) => r.o);
  for (const kind of KEYED) out[kind] = Object.fromEntries(sorted(rows[kind]).map((r) => [r.key, r.o]));

  // Platform indices: d on everything that stands on a deck, top/bottom on connectors.
  const index = (id) => out.platforms.findIndex((q) => q.id === id);
  for (const kind of D_KINDS) out[kind] = out[kind].map((o) => ({ ...o, d: index(o.p) }));
  out.connectors = out.connectors.map((c) => ({ ...c, top: index(c.top), bottom: index(c.bottom) }));
  // The first escort hook doubles as the old single `escortDock`.
  if (out.escortDocks.length) out.escortDock = { x: out.escortDocks[0].x, y: out.escortDocks[0].y };
  return out;
}

// Budget numbers for a build (S.5/S.6 fill these in; the classic's pieces are all zero for now).
export function budgets(parts) {
  const b = { mass: 0, lift: 0, steam: 0, hands: 0 };
  for (const p of parts) {
    const def = PARTS[p.part];
    if (def) for (const k of Object.keys(b)) b[k] += def[k] || 0;
  }
  return b;
}

// Quick sanity check of a build (S.5 grows this into the full validator). Returns { ok, fails, warns }.
export function validate(parts) {
  const fails = [];
  const warns = [];
  let layout;
  try { layout = buildLayout(parts); } catch (e) { return { ok: false, fails: [String(e.message || e)], warns }; }
  const ids = layout.platforms.map((q) => q.id);
  if (new Set(ids).size !== ids.length) fails.push('duplicate platform id');
  for (const kind of D_KINDS) for (const o of layout[kind]) if (o.d < 0) fails.push(kind + ' on unknown platform ' + o.p);
  for (const c of layout.connectors) if (c.top < 0 || c.bottom < 0) fails.push('connector between unknown platforms');
  for (const id of ['nest', 'catwalk', 'main', 'lower']) if (!ids.includes(id)) fails.push('missing deck ' + id);
  return { ok: fails.length === 0, fails, warns };
}
