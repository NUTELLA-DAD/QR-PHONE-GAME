// The ship as LEGO PARTS (Phase S). A build is a list of placed parts; buildLayout(parts) turns it into the
// layout data the whole game reads (the same shape SHIP_LAYOUT always had). public/shipLayout.js applies it.
//
// This module is PURE and Node-safe (no DOM; it reads only the BALANCE weights from config) like gunshipBlueprint.js, so tools/buildsim.mjs can use it.
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

import { config } from '../../config.js';

export const COL = 120; // width of one column of the build grid (px)
export const TWIN_SIZE = { rx: 0.7, ry: 0.62 }; // the twin envelope relative to the first (shipArt.js twinGeom uses the same numbers)

// Station kinds: what a station (or engine) IS, so code asks layout.one('boiler') / all('gun') rather than for a name.
// A ship may have several of most kinds; ONE_PER_SHIP kinds are single so far (one helm, shield, bomb bay compartment, coil emitter).
// Names stay unique and human ("Fore Boiler"): phones show them, and player.lock holds the name.
export const STATION_KINDS = ['helm', 'boiler', 'lookout', 'coal', 'ammo', 'gun', 'searchlight', 'coil', 'deflector', 'bombBay', 'navigator', 'escort', 'engine', 'sail'];

export const ONE_PER_SHIP = ['helm', 'deflector', 'bombBay', 'coil', 'navigator'];

// Deck rows: the y of each floor level. A deck part says `row`, so S.6 can stack decks by row.
// keel and deep are the rows the blueprint editor (buildEdit.js) adds under the lower deck: full decks inside the hull (belly and bay are small blisters).
// crow2 is a second, higher crow's nest tier on a mast above the nest (S.5e): a longer view, but weight and wind up high.
export const DECK_ROWS = { crow2: -210, nest: -42, helm: 420, catwalk: 470, main: 640, lower: 790, belly: 905, bay: 925, keel: 950, deep: 1110 };
export const KEEL_ROWS = ['keel', 'deep'];
export const NEST_ROWS = ['nest', 'crow2']; // the decks on top of the gasbag(s): a ship may have several (the eraser cuts one in two) and two heights
export const isNestRow = (row) => NEST_ROWS.includes(row);
export const rowOf = (q) => Object.keys(DECK_ROWS).find((k) => DECK_ROWS[k] === q.y); // the row name of a built platform (its y is a row's y)

// Climbing speeds (px/s) by connector type; a connector part may override with `speed`.
export const CONNECTOR_SPEED = { rope: 150, ladder: 170, stairs: 150, lift: 260, pole: 520 };

// Pieces that live in arrays vs keyed objects vs single objects, and which of their fields are x positions
// (shifted by the part's column). Fields named in D_KINDS also get `d` (the platform index).
const ARRAYS = ['platforms', 'connectors', 'rooms', 'stations', 'engines', 'pipes', 'vents', 'racks', 'extinguishers', 'boarderEntryPoints', 'escortDocks', 'gasbags'];
const KEYED = ['gunMounts', 'searchlights'];
const OPTIONAL = ['ballast', 'gasValves', 'sails']; // arrays that exist in the layout only when the build has some (so the classic layout is unchanged)
const SINGLES = ['coil', 'shield', 'medbay', 'bombBay', 'liftRepair'];
const X_FIELDS = {
  platforms: ['x0', 'x1'], connectors: ['xTop', 'xBottom'], rooms: ['x0', 'x1'], stations: ['x'], engines: ['x'], vents: ['x'], racks: ['x'],
  extinguishers: ['x'], boarderEntryPoints: ['x'], ballast: ['x'], sails: ['x'], gasValves: ['x', 'bx'], escortDocks: ['x'], gunMounts: ['bx'], searchlights: ['bx'],
  coil: ['x'], shield: ['cx'], medbay: ['x'], bombBay: ['x', 'jumpX'], gasbags: ['cx'], liftRepair: ['x'],
};
const D_KINDS = ['rooms', 'stations', 'engines', 'pipes', 'vents', 'racks', 'extinguishers'];
// Derived fields a `frame` part may set by hand instead of letting deriveGeometry work them out.
const OVERRIDES = ['samples', 'bounds', 'aimPoint', 'refPoint', 'midPoint', 'tiltPivot', 'fitBox', 'hullRect', 'hitRects', 'spawn'];

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
// mass / lift / steam / hands are the budget numbers (S.5; each is a number, or a function of the placed part). Weights are the BALANCE.MASS table in config.js:
//   mass   weight in GAS POINTS: a ship hovers at gas level  GAS.NEUTRAL + (total mass - total lift)  (the same scale as an iced bag's `sink`)
//   lift   gas points of buoyancy (a gasbag by its size; lift engines will add theirs)
//   steam  steam use at full speed, in config.BOILER units per second (an engine = BOILER.USE_ENGINE); pipes and boilers are worked out by buildCheck.js
//   hands  1 for a station somebody has to man (a gun, the helm ...), 0 for the rest
// buildCheck.js judges a build by these against config.BUILD_CHECK.
const piece = (kind, extra = {}) => ({ mass: 0, lift: 0, steam: 0, hands: 0, ...extra, emit: (p, A) => A.add(kind, withoutPart(p)) });
const withoutPart = (p) => { const o = { ...p }; delete o.part; delete o.col; delete o.ord; return o; };
const M = () => config.BALANCE.MASS;
const connector = { mass: 0.5, lift: 0, steam: 0, hands: 0, emit: (p, A) => {
  const o = withoutPart(p);
  o.speed ??= CONNECTOR_SPEED[o.type];
  A.add('connectors', o);
} };
const asType = (type) => ({ ...connector, mass: () => M().link[type], emit: (p, A) => connector.emit({ ...p, type }, A) });
// Whether a station of each kind needs a person (engines are driven by steam; coal and ammo are pick-up points). What it weighs is BALANCE.MASS.kind.
export const KIND_STATS = {
  helm: { hands: 1 }, boiler: { hands: 1 }, lookout: { hands: 1 }, coal: { hands: 0 }, ammo: { hands: 0 },
  gun: { hands: 1 }, searchlight: { hands: 1 }, coil: { hands: 1 }, deflector: { hands: 1 }, bombBay: { hands: 1 },
  navigator: { hands: 1 }, escort: { hands: 1 }, sail: { hands: 1 },
};
const kindStat = (key) => (p) => (key === 'mass' ? M().kind[p.kind] : (KIND_STATS[p.kind] || {})[key]) || 0;

// ---- gasbags (S.5d) ---------------------------------------------------------------------------------------------
// A bag is an ellipse { cx, cy, rx, ry } (rx = half its length). Its lift is by its size (area / 1560, in gas points); the twin envelope adds TWIN_SIZE of that.
export const bagBase = (b) => (b.rx * b.ry) / 1560;
export const bagLift = (b) => Math.round((b.rx * b.ry * (1 + (b.twin ? TWIN_SIZE.rx * TWIN_SIZE.ry : 0))) / 1560);
// The points a bag lifts at (for the centre of lift): the envelope's middle, and the twin riding above and behind it. v = the lift at each, x / y = where.
export const bagLiftPoints = (b) => {
  const base = bagBase(b), pts = [{ x: b.cx, y: b.cy, v: base }];
  if (b.twin) pts.push({ x: b.cx - 20, y: b.cy - 258, v: base * TWIN_SIZE.rx * TWIN_SIZE.ry });
  return pts;
};
// The bags of a layout as a list (a layout from before S.5d has only `gasbag`).
export const bagList = (L) => (L && L.gasbags && L.gasbags.length ? L.gasbags : L && L.gasbag ? [L.gasbag] : []);
// The bag whose envelope holds (x, y) (the ellipse grown by `grow`), or -1; the y of an envelope's edge at x (top or underside; clamped to its ends);
// the bag nearest to an x (the one that holds it, else the closest end).
export function bagAtPoint(bags, x, y, grow = 1) {
  for (let i = 0; i < bags.length; i++) if (((x - bags[i].cx) / (bags[i].rx * grow)) ** 2 + ((y - bags[i].cy) / (bags[i].ry * grow)) ** 2 < 1) return i;
  return -1;
}
export const bagEdgeY = (b, x, top) => b.cy + (top ? -1 : 1) * b.ry * Math.sqrt(Math.max(0, 1 - ((x - b.cx) / b.rx) ** 2));
export function bagNearX(bags, x) {
  let best = -1, bd = Infinity;
  bags.forEach((b, i) => { const d = x < b.cx - b.rx ? b.cx - b.rx - x : x > b.cx + b.rx ? x - b.cx - b.rx : 0; if (d < bd) { bd = d; best = i; } });
  return best;
}
// Where a crow's nest may stand: the stretches the bags cover, as [{ lo, hi }]. A run of bags that touch (within BAG_GAP_WARN) is one stretch; the thin
// ends of its end bags do not count (BAG_COVER of their half-length does).
export function bagCover(bags) {
  const cover = config.BUILD_EDIT.BAG_COVER, gap = config.BUILD_CHECK.BAG_GAP_WARN, out = [];
  for (const b of bags.slice().sort((p, q) => p.cx - q.cx)) {
    const last = out[out.length - 1];
    if (last && b.cx - b.rx - last.end <= gap) { last.hi = b.cx + b.rx * cover; last.end = b.cx + b.rx; } else out.push({ lo: b.cx - b.rx * cover, hi: b.cx + b.rx * cover, end: b.cx + b.rx });
  }
  return out;
}
// The boiler a steam vent belongs to (a vent lets steam out of the boiler's line): the nearest boiler, a deck apart counting like 450 px of walking. null with no boiler.
export function ventBoiler(L, v) {
  let best = null, bd = Infinity;
  for (const s of L.stations) if (s.kind === 'boiler') { const d = Math.abs(s.x - v.x) + 450 * Math.abs(s.d - v.d); if (d < bd) { bd = d; best = s; } }
  return best;
}
// What a bag is called on the TV when it goes down: "FORE BAG", "AFT BAG", "BAG 2" (a ship with one bag just says "GASBAG").
export const bagName = (i, n) => (n <= 1 ? 'GASBAG' : i === 0 ? 'AFT BAG' : i === n - 1 ? 'FORE BAG' : `BAG ${i + 1}`);

export const PARTS = {
  // A walkable floor. `row` is a DECK_ROWS name (y comes from it), x0/x1 are its span.
  deck: { mass: (p) => ((p.x1 - p.x0) / 100) * M().deck * (p.outside ? 0.5 : 1) + (p.row === 'crow2' ? M().mast : 0), lift: 0, steam: 0, hands: 0, emit: (p, A) => {
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
  lift: { ...connector, mass: () => M().link.lift, emit: (p, A) => {
    const o = withoutPart(p);
    const repair = o.repair; // where to stand to repair the lift's gas
    delete o.repair;
    A.add('connectors', { type: 'lift', speed: CONNECTOR_SPEED.lift, ...o });
    if (repair) A.add('liftRepair', repair);
  } },
  pole: asType('pole'),
  // A place a player can stand to do a job.
  station: piece('stations', { mass: kindStat('mass'), hands: kindStat('hands') }),
  // A station plus the gun on it: where the barrel pivots (bx, by), the middle of its arc (aim) and how far it turns (arc).
  gun: { mass: () => M().kind.gun, lift: 0, steam: 0, hands: 1, emit: (p, A) => {
    const { bx, by, aim, arc, n, ord } = p;
    A.add('stations', { n, kind: 'gun', p: p.p, x: p.x });
    A.add('gunMounts', { bx, by, aim, arc }, n, ord && ord.gunMounts);
  } },
  // A station plus its lamp. len = how long the drum is (the beam starts at the lens).
  searchlight: { mass: () => M().kind.searchlight, lift: 0, steam: 0, hands: 1, emit: (p, A) => {
    const { bx, by, aim, arc, len, n } = p;
    A.add('stations', { n, kind: 'searchlight', p: p.p, x: p.x });
    A.add('searchlights', { bx, by, aim, arc, len }, n);
  } },
  // A mast and sail (S.5e): a station somebody works to haul the sail up or let it down, and the sail itself (n = its name, h = how tall the mast stands above its deck,
  // w = the canvas width). In flight a raised sail catches the wind for extra forward speed (config.SAIL).
  sail: { mass: () => M().kind.sail, lift: 0, steam: 0, hands: 1, emit: (p, A) => {
    const { n, h, w } = p;
    A.add('stations', { n, kind: 'sail', p: p.p, x: p.x });
    A.add('sails', { n, p: p.p, x: p.x, h: h || config.SAIL.MAST_H, w: w || config.SAIL.WIDTH });
  } },
  coil: piece('coil'), // (the Lightning Coil's weight is on its station)
  engine: { ...piece('engines', { mass: () => M().engine, steam: 3 }), emit: (p, A) => A.add('engines', { kind: 'engine', ...withoutPart(p) }) },
  // A sandbag (trim weight): `p` is its deck and x where it stands; `hang: true` hangs it from the hull under the deck instead. Cheap, but a long way out
  // from the middle it moves the centre of mass (balanceOf).
  ballast: { mass: () => M().ballast, lift: 0, steam: 0, hands: 0, emit: (p, A) => A.add('ballast', withoutPart(p)) },
  pipe: piece('pipes', { mass: () => M().pipe }),
  vent: piece('vents', { mass: () => M().vent }),
  // A gas valve (S.5d): a wheel on a deck that opens or shuts the feed to ONE gasbag (the one nearest `bx`, the x of the bag it was linked to when placed). A shut bag
  // is cut off from the helm's pump and vent and its holes stop bleeding the shared feed. A bag with no valve is always open.
  gasValve: piece('gasValves', { mass: () => M().gasValve }),
  rack: piece('racks', { mass: () => M().rack }),
  extinguisher: piece('extinguishers', { mass: () => M().extinguisher }),
  boarderEntry: piece('boarderEntryPoints'),
  escortDock: piece('escortDocks'),
  medbay: piece('medbay', { mass: () => M().medbay }),
  bombBay: piece('bombBay'), // (the bomb bay's weight is on its station)
  // buoyancy by the envelope's size; `twin: true` adds the second, smaller envelope riding behind it (shipArt's twin-gasbag art), which
  // lifts TWIN_SIZE.rx x TWIN_SIZE.ry of the first and adds a little rigging weight. A ship may have several of these side by side (S.5d): each is
  // its own envelope with its own gas and holes in flight, and the ship's lift is the sum.
  gasbag: piece('gasbags', { mass: (p) => M().bag + (p.twin ? M().bagTwin : 0), lift: (p) => bagLift(p) }),
  // Ship-wide numbers: the shield band and the nest rise are given here; everything else (samples, bounds, aim and
  // reference points ...) is DERIVED from the parts by buildLayout. A field named in OVERRIDES that is set here wins
  // over the derived value (the classic ship keeps its hand-placed collision samples this way).
  frame: { mass: 0, lift: 0, steam: 0, hands: 0, emit: (p, A) => {
    A.add('shield', p.shield);
    A.setScalar('nestRise', p.nestRise);
    for (const k of OVERRIDES) if (p[k] != null) A.setScalar(k, p[k]);
  } },
};

// ---- the classic ship ------------------------------------------------------------------------------------
// Today's ship, as a list of parts (the order below is the order of platforms, stations, connectors ... in the game).
const deck = (id, row, name, x0, x1, outside) => ({ part: 'deck', id, row, name, x0, x1, ...(outside ? { outside: true } : {}) });
const room = (name, p, x0, x1, color, outside) => ({ part: 'room', name, p, x0, x1, ...(color ? { color } : {}), ...(outside ? { outside: true } : {}) });
const conn = (part, top, bottom, xTop, xBottom) => ({ part, top, bottom, xTop, xBottom });
const station = (n, p, x, kind) => ({ part: 'station', n, kind, p, x });
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
  station('Lookout', 'nest', 770, 'lookout'),
  station('Deflector', 'catwalk', 940, 'deflector'),
  { part: 'gun', n: 'Dorsal Gun', p: 'nest', x: 940, bx: 950, by: -76, aim: -1.2, arc: 1.2, ord: { gunMounts: -1 } },
  { part: 'gun', n: 'Tail Gun', p: 'catwalk', x: 275, bx: 248, by: 418, aim: Math.PI + 0.35, arc: 1.1 }, // top deck, aft: back and up
  station('Lightning Coil', 'main', 710, 'coil'),
  station('Boiler', 'main', 400, 'boiler'),
  station('Navigator', 'main', 1215, 'navigator'),
  station('Helm', 'helm', 1275, 'helm'),
  { part: 'gun', n: 'Nose Gun', p: 'catwalk', x: 1340, bx: 1372, by: 418, aim: -0.35, arc: 1.1 }, // top deck, fore: forward and up
  { part: 'gun', n: 'Aft Sponson', p: 'lower', x: 420, bx: 330, by: 812, aim: 2.15, arc: 0.7 },
  station('Coal Bunker', 'lower', 570, 'coal'),
  station('Ammo Hold', 'lower', 870, 'ammo'),
  station('Bomb Bay', 'bay', 520, 'bombBay'),
  { part: 'gun', n: 'Fore Sponson', p: 'lower', x: 1180, bx: 1270, by: 812, aim: 1.0, arc: 0.7 },
  { part: 'gun', n: 'Ventral Gun', p: 'pod', x: 820, bx: 805, by: 948, aim: Math.PI / 2, arc: 1.2 },
  station('Escort Fighter', 'hangar', 1085, 'escort'),
  station('Escort Fighter 2', 'hangar2', 1280, 'escort'),
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

  // Ship-wide numbers: the deflector shield band, how far the nest sits above where it was drawn when the bag was smaller,
  // and the hull's collision outline (points round the ship tested against rock). Hand-placed here so the classic ship
  // flies exactly as before; other builds get theirs from deriveSamples(). Bounds, aim point and the rest are derived.
  { part: 'frame', nestRise: 94, shield: { cx: 800, cy: 470, rx: 1020, ry: 660 }, samples: [
    // underside
    [-80, 410], [126, 662], [248, 815], [372, 942], [500, 942], [628, 942], [740, 935], [805, 975], [855, 935], [1100, 815], [1352, 815], [1470, 662],
    [20, 862], [140, 862], [1460, 862], [1580, 862], [1512, 620], [1790, 198],
    // top
    [-235, 20], [-60, 90], [150, 5], [380, -50], [600, -100], [690, -86], [800, -154], [910, -86], [1000, -100], [1220, -50], [1450, 5], [1660, 90],
  ] },
];

// ---- building the layout ---------------------------------------------------------------------------------

// Turn a list of placed parts into layout data (same shape as the old hand-written SHIP_LAYOUT), plus the derived
// geometry (deriveGeometry). opts.cell = the cave map's square size in px (config.MAPS.CELL), used for caveNeed.
export function buildLayout(parts, opts = {}) {
  const rows = Object.fromEntries([...ARRAYS, ...KEYED, ...OPTIONAL].map((k) => [k, []]));
  const out = {};
  let seq = 0;
  let ox = 0;
  const A = {
    add(kind, item, key, ord) {
      const o = place(kind, item, ox);
      if (KEYED.includes(kind)) rows[kind].push({ key, o, ord: ord ?? seq++ });
      else if (ARRAYS.includes(kind) || OPTIONAL.includes(kind)) rows[kind].push({ o, ord: seq++ });
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
  // The gasbags, side by side from the tail to the nose (ids bag1, bag2 ...). `gasbag` stays as the old single-bag field: the bag itself when there is one
  // (the classic ship reads exactly what it always did), otherwise the envelope spanning all of them (code that only knows one bag still sees the ship's top).
  if (out.gasbags.length) {
    const raw = out.gasbags.slice().sort((a, b) => a.cx - b.cx);
    out.gasbags = raw.map((b) => ({ ...b, x0: b.cx - b.rx, x1: b.cx + b.rx, lift: bagLift(b) })).map((b, i) => ({ ...b, id: 'bag' + (i + 1) }));
    if (raw.length === 1) out.gasbag = raw[0];
    else {
      const x0 = raw[0].cx - raw[0].rx, x1 = raw[raw.length - 1].cx + raw[raw.length - 1].rx;
      out.gasbag = { cx: (x0 + x1) / 2, cy: raw[0].cy, rx: (x1 - x0) / 2, ry: Math.max(...raw.map((b) => b.ry)), n: raw.length, ...(raw.some((b) => b.twin) ? { twin: true } : {}) };
    }
  }
  for (const kind of KEYED) out[kind] = Object.fromEntries(sorted(rows[kind]).map((r) => [r.key, r.o]));
  for (const kind of OPTIONAL) if (rows[kind].length) out[kind] = sorted(rows[kind]).map((r) => r.o);

  // Platform indices: d on everything that stands on a deck, top/bottom on connectors.
  const index = (id) => out.platforms.findIndex((q) => q.id === id);
  for (const kind of D_KINDS) out[kind] = out[kind].map((o) => ({ ...o, d: index(o.p) }));
  if (out.sails) out.sails = out.sails.map((o) => ({ ...o, d: index(o.p) }));
  if (out.gasValves) out.gasValves =out.gasValves.map((o) => ({ ...o, d: index(o.p), bag: bagNearX(out.gasbags, o.bx != null ? o.bx : o.x) })); // (the bag it feeds: tail to nose, as in gasbags; -1 with no bag)
  if (out.ballast) out.ballast =out.ballast.map((o) => { const d = index(o.p); return { ...o, d, y: d < 0 ? 0 : out.platforms[d].y + (o.hang ? config.BALANCE.BALLAST_HANG : 0) }; });
  out.connectors = out.connectors.map((c) => ({ ...c, top: index(c.top), bottom: index(c.bottom) }));
  // The first escort hook doubles as the old single `escortDock`.
  if (out.escortDocks.length) out.escortDock = { x: out.escortDocks[0].x, y: out.escortDocks[0].y };
  // Raiders and new crew drop in at the boarding points; a ship with fewer than two gets default ones over the ends of her top deck (flagged `auto`: not a part,
  // the validator still advises placing real ones).
  if (out.boarderEntryPoints.length < 2 && out.platforms.length) {
    const top = deckRoles(out.platforms).cat, span = rowSpan(out.platforms, top), have = out.boarderEntryPoints;
    const ends = [span.x0 + Math.min(70, (span.x1 - span.x0) * 0.2), span.x1 - Math.min(70, (span.x1 - span.x0) * 0.2)];
    const mine = ends.filter((x) => !have.some((o) => Math.abs(o.x - x) < 80)).map((x) => ({ x: Math.round(x), p: top.id, auto: true }));
    out.boarderEntryPoints = [...have, ...mine].slice(0, Math.max(2, have.length)).sort((a, b) => a.x - b.x);
    if (out.boarderEntryPoints.length < 2) out.boarderEntryPoints.push({ x: Math.round(span.x1 - 20), p: top.id, auto: true });
  }
  deriveGeometry(out, opts.cell || CAVE_CELL);
  return out;
}

// ---- derived geometry (S.2) ------------------------------------------------------------------------------
// What the rest of the game used to hard-code about the ship's SHAPE is worked out here from the decks and the gasbag:
//   samples        points round the hull and bag that are tested against rock (ship coordinates)
//   topY, bottomY  the highest / lowest of those points
//   refPoint       where the ship's middle sits in the world: world x = course.dist + refPoint.x, world y = refPoint.y - alt
//   midPoint       the middle of the ship (what supplies, lamps and the spotter are measured from)
//   aimPoint       where enemy fire is aimed
//   tiltPivot      the point the ship tips around when climbing and diving
//   bounds         outer edges of the drawing (the camera keeps all of it in view)
//   fitBox         the box that has to fit through cave tunnels and shafts; caveNeed = how many map squares that takes
//   hullRect       the box another gunship is nudged out of
//   hitRects       boxes a shell or plane hits (the gasbag ellipse is separate)
//   spawnPlatform  index of the deck anything that missed the ship drops back onto
//   lowDeckY       the y of the lower deck (crew below this wade when the ship floods)
// The offsets below are what make the classic ship come out exactly as it was hand-placed; a longer or taller build
// moves the same edges with it. (A `frame` part can still set any of them by hand: see OVERRIDES.)
export const CAVE_CELL = 200; // map square size used for caveNeed unless buildLayout is told otherwise (config.MAPS.CELL)
const SAMPLE_GAP = 130; // most space between collision samples along a hull or bag edge (px)

// Collision samples for a build with none of its own: hull shoulders, chine and keel, belly compartments, the bag's top and the nest.
// The x range a deck row covers: the union of every deck at the same y (a deck cut in two by the editor is still one row).
export function rowSpan(platforms, q) {
  const row = platforms.filter((o) => o.y === q.y);
  return { x0: Math.min(...row.map((o) => o.x0)), x1: Math.max(...row.map((o) => o.x1)) };
}

// The gondola hull outline, worked out from the decks (shipArt.js draws it, the blueprint editor draws it, deriveGeometry measures it).
// The classic ship comes out at today's numbers (130..1512 across, 480..815 down). The hull follows the main deck row's span, tapers to a
// keel line that also covers the lower deck's rooms inside the hull, and full decks added under the lower deck (keel / deep rows) hang
// in `boxes` of their own: { x0, x1, y0, y1 } with the walls a little outside the decks.
export function hullGeom(platforms, rooms = []) {
  const find = (id) => platforms.find((q) => q.id === id);
  // (A half-built ship from the blueprint editor has no main / lower / top deck yet: the hull wraps whatever hull decks there are.)
  const inHull = platforms.filter((q) => !q.outside && ['main', 'lower', ...KEEL_ROWS].includes(rowOf(q))).sort((a, b) => a.y - b.y);
  const main = find('main') || inHull[0], lower = find('lower') || inHull[inHull.length - 1];
  if (!main || !lower) return null;
  const cat = find('catwalk') || { y: main.y - 170 };
  const m = rowSpan(platforms, main);
  const inside = rooms.filter((r) => !r.outside && (find(r.p) || {}).y === lower.y); // the lower deck's rooms that are inside the hull (not the outriggers)
  const lowMin = inside.length ? Math.min(...inside.map((r) => r.x0)) : Infinity;
  const lowMax = inside.length ? Math.max(...inside.map((r) => r.x1)) : -Infinity;
  const decks = platforms.filter((q) => !q.outside && KEEL_ROWS.includes(rowOf(q))).sort((a, b) => a.x0 - b.x0);
  const boxes = [];
  for (const q of decks) {
    const last = boxes[boxes.length - 1];
    if (last && q.x0 - 14 <= last.x1) { last.x1 = Math.max(last.x1, q.x1 + 14); last.y1 = Math.max(last.y1, q.y + 25); } else boxes.push({ x0: q.x0 - 14, x1: q.x1 + 14, y0: lower.y, y1: q.y + 25 });
  }
  return {
    xL: m.x0 - 10, xL2: m.x0 - 14, xR: m.x1 + 42, xNose: m.x1, xTopR: m.x1 - 40,
    xKeelL: Math.min(m.x0 + 108, lowMin), xKeelR: Math.max(m.x1 - 118, lowMax),
    top: cat.y + 10, yShoulder: main.y - 40, yTuck: main.y + 10, yTuck2: main.y + 22, yKeel: lower.y + 25, boxes,
  };
}

// The decks that play the part of the main deck, the lower deck, the top deck and the (first) crow's nest. A full ship has them by id; a minimal one (S.5e: any one
// deck will do) lends whichever deck is nearest: the main deck is the one nearest the main row, the lower deck the lowest deck, the top deck the highest (of the
// hull and top decks; the nest and the belly blisters only when nothing else is there). nest is null with no crow's nest.
export function deckRoles(platforms) {
  const by = (id) => platforms.find((q) => q.id === id);
  const body = platforms.filter((q) => ['catwalk', 'main', 'lower', ...KEEL_ROWS].includes(rowOf(q)));
  const pool = body.length ? body : platforms;
  const nearest = (y) => pool.reduce((a, b) => (Math.abs(b.y - y) < Math.abs(a.y - y) ? b : a), pool[0]);
  return {
    main: by('main') || nearest(DECK_ROWS.main),
    lower: by('lower') || pool.reduce((a, b) => (b.y > a.y ? b : a), pool[0]),
    cat: by('catwalk') || pool.reduce((a, b) => (b.y < a.y ? b : a), pool[0]),
    nest: by('nest') || platforms.find((q) => rowOf(q) === 'nest') || null,
  };
}

export function deriveSamples(out) {
  const { main, lower, nest } = deckRoles(out.platforms);
  const mainS = rowSpan(out.platforms, main), lowerS = rowSpan(out.platforms, lower);
  const pts = [];
  const add = (x, y) => pts.push([Math.round(x), Math.round(y)]);
  const row = (x0, x1, y) => {
    const n = Math.max(1, Math.ceil((x1 - x0) / SAMPLE_GAP));
    for (let k = 0; k <= n; k++) add(x0 + ((x1 - x0) * k) / n, y);
  };
  add(mainS.x0 - 14, main.y + 22); // shoulders, aft and fore
  add(mainS.x1, main.y + 22);
  if (lowerS.x1 - lowerS.x0 > 456) row(lowerS.x0 + 228, lowerS.x1 - 228, lower.y + 25); // the chine
  row(lowerS.x0, lowerS.x1, lower.y + 72); // the keel line, outriggers included
  for (const q of out.platforms) {
    if (!q.outside && KEEL_ROWS.includes(rowOf(q))) { // a full deck under the lower deck: its walls and its keel
      add(q.x0 - 14, q.y - 60), add(q.x1 + 14, q.y - 60);
      row(q.x0 - 14, q.x1 + 14, q.y + 27);
      continue;
    }
    if (q.outside || q.y <= lower.y) continue; // belly compartments: a flat bay, or a ball turret that hangs lower
    if (q.x1 - q.x0 >= 200) row(q.x0 + 22, q.x1 - 12, q.y + 17);
    else add(q.x0 + 5, q.y + 30), add((q.x0 + q.x1) / 2, q.y + 70), add(q.x1, q.y + 30);
  }
  for (const bag of out.gasbags) { // each bag's top half, a margin wider than the drawing
    const m = 35;
    const n = Math.max(6, Math.ceil((Math.PI * (bag.rx + bag.ry)) / 2 / SAMPLE_GAP));
    for (let k = 0; k <= n; k++) {
      const a = Math.PI + (Math.PI * k) / n;
      add(bag.cx + Math.cos(a) * (bag.rx + m), bag.cy + Math.sin(a) * (bag.ry + m));
    }
    if (bag.twin) { // the twin envelope rides higher behind it (shipArt.js twinGeom)
      const t = { x: bag.cx - 20, y: bag.cy - 258, rx: bag.rx * TWIN_SIZE.rx, ry: bag.ry * TWIN_SIZE.ry };
      for (let k = 1; k < 6; k++) {
        const a = Math.PI + (Math.PI * k) / 6;
        add(t.x + Math.cos(a) * (t.rx + m), t.y + Math.sin(a) * (t.ry + m));
      }
    }
  }
  for (const q of out.platforms.filter((o) => isNestRow(rowOf(o)))) { // each crow's nest and its flag (a high tier on its mast; a cut nest has two)
    const nx = (q.x0 + q.x1) / 2, nn = q === nest || q.id === 'nest' ? 1 : 0.7;
    add(nx - 110 * nn, q.y - 44), add(nx, q.y - 112), add(nx + 110 * nn, q.y - 44);
  }
  return pts;
}

function deriveGeometry(out, cell) {
  if (!out.platforms.length) return; // validate() reports that there is no deck to stand on
  const { main, lower, cat, nest } = deckRoles(out.platforms); // (a minimal ship lends one deck all three parts)
  const set =(k, v) => { if (out[k] == null) out[k] = v; };
  const mainS = rowSpan(out.platforms, main), lowerS = rowSpan(out.platforms, lower), catS = rowSpan(out.platforms, cat);
  const keels = out.platforms.filter((q) => !q.outside && KEEL_ROWS.includes(rowOf(q))); // full decks added under the lower deck
  const lowX0 = Math.min(lowerS.x0, ...keels.map((q) => q.x0)), lowX1 = Math.max(lowerS.x1, ...keels.map((q) => q.x1));
  set('refPoint', { x: (lowerS.x0 + lowerS.x1) / 2, y: main.y - 140 });
  const ref = out.refPoint;
  set('midPoint', { x: ref.x, y: cat.y });
  set('aimPoint', { x: ref.x, y: main.y });
  set('tiltPivot', [ref.x, cat.y + 50]);
  set('samples', deriveSamples(out));
  out.samples = out.samples.map((s) => [s[0], s[1]]);
  const xs = out.samples.map((s) => s[0]);
  const ys = out.samples.map((s) => s[1]);
  out.topY = Math.min(...ys);
  out.bottomY = Math.max(...ys);
  set('bounds', { x0: Math.min(...xs) - 5, x1: Math.max(...xs) + 20, y0: out.topY - 11, y1: out.bottomY });
  const bagTop = out.gasbags.length ? Math.min(...out.gasbags.map((b) => b.cy - b.ry)) : (nest || cat).y - 44;
  set('fitBox', { x0: lowX0 - 120, x1: lowX1 + 90, y0: bagTop - 36, y1: out.bottomY + 10 });
  set('hullRect', { x0: lowX0 + 80, x1: lowX1 - 60, y0: bagTop - 86, y1: out.bottomY - 15 });
  const F = out.fitBox;
  out.caveNeed = { // map squares the ship takes: the box, measured from the ref point, rounded out to whole squares
    tunnel: Math.ceil((ref.y - F.y0) / cell) + Math.ceil((F.y1 - ref.y) / cell) + 1,
    shaft: Math.ceil((ref.x - F.x0) / cell) + Math.ceil((F.x1 - ref.x) / cell) + 1,
  };
  if (!out.hitRects) {
    out.hitRects = [
      { x0: mainS.x0 - 15, x1: mainS.x1 + 30, y0: cat.y + 5, y1: lower.y + 25 }, // the gondola
      { x0: lowerS.x0, x1: lowerS.x1, y0: lower.y - 45, y1: lower.y + 10 }, // the outriggers
      { x0: catS.x0, x1: catS.x1 + 20, y0: cat.y - 140, y1: cat.y + 5 }, // the open top deck, its guns and the helm mount
    ];
    for (const q of out.platforms) if (rowOf(q) === 'crow2') out.hitRects.push({ x0: q.x0 - 10, x1: q.x1 + 10, y0: q.y - 120, y1: q.y + 20 }); // a high nest sticks out above the bag: a bigger target
    for (const q of out.platforms) { // belly compartments (and full decks under the lower deck)
      if (!q.outside && q.y > lower.y) out.hitRects.push({ x0: q.x0, x1: q.x1, y0: lower.y + 25, y1: q.y + (KEEL_ROWS.includes(rowOf(q)) ? 25 : q.y >= DECK_ROWS.bay ? 20 : 30) });
    }
  }
  out.lowDeckY = lower.y;
  out.spawnPlatform = out.platforms.findIndex((q) => q.id === (out.spawn || cat.id));
  delete out.spawn;
}

// Budget numbers for a build: the sums of its parts' mass / lift / steam / hands (see PARTS above).
// buildCheck.js turns them into the LIFT / STEAM / HANDS gauges and checks them (validate lives there).
export function partStat(p, key) {
  const def = PARTS[p.part];
  const v = def && def[key];
  return typeof v === 'function' ? v(p) || 0 : v || 0;
}
export function budgets(parts) {
  const b = { mass: 0, lift: 0, steam: 0, hands: 0 };
  for (const p of parts) for (const k of Object.keys(b)) b[k] += partStat(p, k);
  const bal = balanceOf(parts);
  return { ...b, com: bal.com, col: bal.col, balance: bal };
}

// ---- balance (S.5c) --------------------------------------------------------------------------------------------
// Where a part is, for the centre of mass: { x, y } in ship coordinates, or null when it has no place (rooms, the frame ...).
// ys = deck id -> y. A deck weighs at its middle, a connector midway between its decks, a pipe at the middle of its run.
const LINKS = ['ladder', 'rope', 'stairs', 'lift', 'pole'];
const deckYs = (parts) => Object.fromEntries(parts.filter((p) => p.part === 'deck').map((d) => [d.id, DECK_ROWS[d.row]]));
export function partPos(p, ys) {
  const y = (id) => (ys[id] != null ? ys[id] : DECK_ROWS.main);
  if (p.part === 'deck') return { x: (p.x0 + p.x1) / 2, y: DECK_ROWS[p.row] };
  if (p.part === 'gasbag') return { x: p.cx, y: p.cy };
  if (p.part === 'coil' || p.part === 'bombBay') return { x: p.x, y: p.y };
  if (LINKS.includes(p.part)) return { x: (p.xTop + p.xBottom) / 2, y: (y(p.top) + y(p.bottom)) / 2 };
  if (p.part === 'pipe') return { x: p.points.reduce((n, q) => n + q[0], 0) / p.points.length, y: p.points.reduce((n, q) => n + q[1], 0) / p.points.length };
  if (p.part === 'ballast') return { x: p.x, y: y(p.p) + (p.hang ? config.BALANCE.BALLAST_HANG : 0) };
  if (p.x != null && p.p != null) return { x: p.x, y: y(p.p) };
  return null;
}
// The trim a centre-of-mass offset makes (dx = COM - COL, px; positive = nose-heavy): the angle the gauge shows (signed degrees, + nose-down),
// the level of the check, and what the flying ship rests tipped by (radians, + nose-down; 0 when level).
export function trimOf(dx, known = true) {
  const B = config.BALANCE, a = Math.abs(dx);
  const deg = a <= B.LEVEL_PX ? 0 : Math.min(B.CAP_DEG, (a - B.LEVEL_PX) * B.DEG_PER_PX) * Math.sign(dx);
  const restDeg = Math.min(B.SIM_CAP_DEG, Math.abs(deg) * B.SIM_SHARE) * Math.sign(deg);
  return { dx: +dx.toFixed(1), deg: +deg.toFixed(1), side: deg > 0 ? 'nose' : deg < 0 ? 'tail' : 'level', level: !known ? 'PASS' : a > B.FAIL_PX ? 'FAIL' : a > B.WARN_PX ? 'WARN' : 'PASS', restPitch: (restDeg * Math.PI) / 180 || 0 };
}
// The centre of mass and the centre of lift of a build, and what the difference does to her (x runs along the ship, bow on the right):
// COM = every part's mass at its place; COL = the bag(s) centre(s) weighted by their lift (a twin envelope rides behind and above; parts with
// lift of their own, the lift engines to come, count at their place). mass is the total weight of the parts that have a place.
export function balanceOf(parts) {
  const ys = deckYs(parts);
  let m = 0, mx = 0, my = 0, w = 0, wx = 0, wy = 0;
  const lift = (x, y, v) => { w += v; wx += x * v; wy += y * v; };
  for (const p of parts) {
    const pos = partPos(p, ys), mass = partStat(p, 'mass');
    if (pos && mass > 0) { m += mass; mx += mass * pos.x; my += mass * pos.y; }
    if (p.part === 'gasbag') {
      for (const q of bagLiftPoints(p)) lift(q.x, q.y, q.v);
    } else if (pos && partStat(p, 'lift') > 0) lift(pos.x, pos.y, partStat(p, 'lift'));
  }
  const com = m > 0 ? { x: mx / m, y: my / m } : null, col = w > 0 ? { x: wx / w, y: wy / w } : null;
  return { com, col, mass: m, ...trimOf(com && col ? com.x - col.x : 0, !!(com && col)) };
}
