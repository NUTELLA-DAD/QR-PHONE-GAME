// Where a part can go (Phase S.5): the palette of part types, the slots each can be placed in, and random legal mutations.
// Pure and Node-safe. The building dev page (public/buildtest.html) shows the slots as highlighted pins; tools/buildsim.mjs --random
// uses the same slots to grow random builds from the classic ship. A slot is { type, p, x, y, label, apply(parts) -> new parts }.
// A slot is LEGAL when the placement itself is: on a deck, inside its span, clear of what is already there, within the kind's limits (one helm ...).
// It does NOT have to leave a flyable ship (S.5c: you build a ship up from nothing, so half-built ships take parts): the validator says what is
// still missing. slotsFor(type, parts, { whole: true }) also demands that the result passes validate() (the random batch wants that).
// Every placement ends with finish(): the frame part is there and every engine, the helm and the lift have a steam pipe from the boiler (routePipes).
import { buildLayout, COL, rowOf, DECK_ROWS, KEEL_ROWS, isNestRow, bagNearX, bagName, ventBoiler } from './shipBuild.js';
import { drawDeck, drawBag, placeConnector, GRID_X0, ensureFrame, emptyBuild, erase, setBag } from './buildEdit.js';
import { validate } from './buildCheck.js';
import { config } from '../../config.js';

// The blueprint editing operations (draw a deck, erase, lengthen the gasbag, place a ladder, delete a thing) are pure functions of a parts list: re-exported here with the slots.
export { drawDeck, drawBag, resizeBag, erase, setBag, placeConnector, placePart, thingAt, removeAt, emptyBuild, ensureFrame, snapX, rowAtY, summarize, EDIT_ROWS, DRAW_ROWS, GRID_X0 } from './buildEdit.js';
const STEP = 40; // slots sit on a grid this far apart along a deck (px)
const clone = (parts) => parts.map((p) => ({ ...p }));
const names = (parts) => new Set(parts.map((p) => p.n || p.name).filter(Boolean));
const nextName = (parts, base) => { const used = names(parts); let k = 1; while (used.has(`${base} ${k}`)) k++; return `${base} ${k}`; };
// The first of a kind gets its plain name ("Boiler", "Helm": the game and the phones know them), later ones "Extra Boiler 1".
const nameFor = (parts, plain) => (names(parts).has(plain) ? nextName(parts, 'Extra ' + plain) : plain);
const spots = (q, margin = 50) => { const xs = []; for (let x = Math.ceil((q.x0 + margin) / STEP) * STEP; x <= q.x1 - margin; x += STEP) xs.push(x); return xs; };
const onRows = (L, rows) => L.platforms.filter((q) => rows.includes(rowOf(q)));
const midX = (L) => (L.refPoint ? L.refPoint.x : L.platforms.length ? (Math.min(...L.platforms.map((q) => q.x0)) + Math.max(...L.platforms.map((q) => q.x1))) / 2 : 0); // (a half-built ship has no reference point yet)
const count = (parts, test) => parts.filter(test).length;

// Is x on deck p free of other stations (and, for hauling stations, of anything the Action button would grab first)?
function roomAt(L, p, x, haul, near = config.TOOLS.REACH + 5, gap = config.BUILD_CHECK.MIN_GAP + 15) {
  if ([...L.stations, ...L.engines].some((s) => s.p === p && Math.abs(s.x - x) < gap)) return false;
  if (!haul) return true;
  const q = L.platforms.find((d) => d.id === p);
  const d = L.platforms.indexOf(q);
  if ([...L.racks, ...L.vents, ...L.extinguishers, ...(L.gasValves || [])].some((o) => o.p === p && Math.abs(o.x - x) < near)) return false;
  if (L.pipes.some((o) => o.p === p && Math.abs(o.valve[0] - x) < near)) return false;
  return !L.connectors.some((c) => (c.top === d && Math.abs(c.xTop - x) < near) || (c.bottom === d && Math.abs(c.xBottom - x) < near));
}

// ---- steam pipes ------------------------------------------------------------------------------------------------------
// Every engine, the helm and the lift is fed by a pipe from the boiler (the game draws it, bursts it, and a valve on it shuts the steam off). Placing
// the part, or the boiler, adds whichever pipe is missing: no pipe is added while there is no boiler. Idempotent. Returns the same list.
export function routePipes(parts) {
  const decks = Object.fromEntries(parts.filter((p) => p.part === 'deck').map((d) => [d.id, d]));
  const boiler = parts.find((p) => p.part === 'station' && p.kind === 'boiler');
  if (!boiler || !decks[boiler.p]) return parts;
  const y = (id) => DECK_ROWS[decks[id].row];
  const wants = [];
  for (const e of parts) if (e.part === 'engine' && decks[e.p]) wants.push({ to: e.name, p: e.p, x: e.x, ty: y(e.p), vp: e.p });
  const helm = parts.find((p) => p.part === 'station' && p.kind === 'helm');
  if (helm && decks[helm.p]) wants.push({ to: helm.n, p: boiler.p, x: helm.x, ty: y(helm.p), vp: boiler.p });
  const lift = parts.find((p) => p.part === 'lift');
  if (lift && decks[lift.top]) wants.push({ to: 'Lift', p: boiler.p, x: lift.xTop, ty: y(lift.top), vp: boiler.p });
  let k = parts.filter((p) => p.part === 'pipe').length;
  const yb = y(boiler.p);
  for (const w of wants) {
    if (parts.some((p) => p.part === 'pipe' && p.to === w.to)) continue;
    const from = boiler.x + (w.x < boiler.x ? -30 : 30);
    const down = w.ty > yb;
    const ym = down ? yb + 40 + 10 * k : Math.min(yb, w.ty) - 135 + 10 * k;
    const q = decks[w.vp];
    parts.push({ part: 'pipe', to: w.to, p: w.vp, points: [[from, down ? yb - 30 : yb - 80], [from, ym], [w.x, ym], [w.x, w.ty - 25]], valve: [Math.round(Math.max(q.x0 + 25, Math.min(q.x1 - 25, (from + w.x) / 2))), ym] });
    k++;
  }
  return parts;
}
const finish = (ps) => routePipes(ensureFrame(ps));

// Station part types: the deck rows each may stand on, and whether it hauls (needs a clear spot).
const STATION_AT = { lookout: [['nest', 'crow2'], false], boiler: [['main', 'lower'], true], coal: [['lower', 'main', 'keel', 'deep'], true], ammo: [['lower', 'main', 'keel', 'deep'], true], helm: [['catwalk', 'main'], false] };
const LABEL = { lookout: 'Lookout', boiler: 'Boiler', coal: 'Coal Bunker', ammo: 'Ammo Hold', helm: 'Helm', gun: 'Gun', searchlight: 'Searchlight', engine: 'Engine' };
const PLAIN = { lookout: 'Lookout', boiler: 'Boiler', coal: 'Coal Bunker', ammo: 'Ammo Hold', helm: 'Helm' };

// How a gun sits on each deck (copied from the classic ship's own mounts): where the barrel pivots, the middle of its arc and its spread.
const GUN_AT = {
  nest: (q, x, fore) => ({ bx: x + 10, by: q.y - 34, aim: fore ? -1.2 : -1.95, arc: 1.2 }),
  crow2: (q, x, fore) => ({ bx: x + 10, by: q.y - 34, aim: fore ? -1.2 : -1.95, arc: 1.2 }),
  catwalk: (q, x, fore) => ({ bx: x + (fore ? 32 : -27), by: q.y - 52, aim: fore ? -0.35 : Math.PI + 0.35, arc: 1.1 }),
  lower: (q, x, fore) => ({ bx: x + (fore ? 90 : -90), by: q.y + 22, aim: fore ? 1.0 : 2.15, arc: 0.7 }),
};
const RACK_LABEL = { hammer: 'Hammer rack', sword: 'Sword rack', hookshot: 'Hookshot rack', ice: 'Ice locker' };
const BAY_W = 290; // a bomb bay compartment (the classic one is this wide)

// The palette, in the order a ship is usually built: each type lists its candidate slots for a build (L = its layout).
export const PALETTE = [
  { id: 'helm', label: 'Helm', hint: 'click a spot on the top or main deck (one per ship)', slots: (L, parts) => (count(parts, (p) => p.part === 'station' && p.kind === 'helm') ? [] : stationSlots(L, 'helm')) },
  { id: 'boiler', label: 'Boiler', hint: 'click a spot on the main or lower deck', slots: (L) => stationSlots(L, 'boiler') },
  { id: 'coal', label: 'Coal bunker', hint: 'click a spot on a lower deck', slots: (L) => stationSlots(L, 'coal') },
  { id: 'ammo', label: 'Ammo hold', hint: 'click a spot on a lower deck', slots: (L) => stationSlots(L, 'ammo') },
  { id: 'engine', label: 'Engine pod', hint: 'click an outrigger spot on the lower or main deck (it gets a steam pipe from the boiler)', slots: (L) => {
    const out = [];
    for (const q of onRows(L, ['lower', 'main'])) {
      const xs = [q.x0 + 30, q.x0 + 90, q.x0 + 150, q.x1 - 150, q.x1 - 90, q.x1 - 30].filter((x) => x > q.x0 + 10 && x < q.x1 - 10);
      for (const x of xs) if (roomAt(L, q.id, x, false)) out.push({ p: q.id, x, label: `Engine pod on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'engine', name: nameFor(ps, 'Pod Engine'), p: q.id, x }] });
    }
    return out;
  } },
  { id: 'gun', label: 'Gun mount', hint: 'click a deck spot', slots: (L) => {
    const out = [];
    for (const q of onRows(L, ['crow2', 'nest', 'catwalk', 'lower'])) {
      const row = rowOf(q);
      for (const x of spots(q)) {
        if (!roomAt(L, q.id, x, false)) continue;
        const fore = x > midX(L);
        out.push({ p: q.id, x, label: `Gun on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'gun', n: nextName(ps, 'Extra Gun'), p: q.id, x, ...GUN_AT[row](q, x, fore) }] });
      }
    }
    return out;
  } },
  { id: 'lookout', label: "Lookout (crow's nest)", hint: "click a spot on the crow's nest", slots: (L) => stationSlots(L, 'lookout') },
  { id: 'medbay', label: 'Medbay', hint: 'click a deck spot (one per ship)', slots: (L, parts) => {
    if (L.medbay) return [];
    const out = [];
    for (const q of onRows(L, ['main', 'lower', 'keel', 'deep'])) for (const x of spots(q, 40)) if (roomAt(L, q.id, x, false)) out.push({ p: q.id, x, label: `Medbay on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'medbay', p: q.id, x }] });
    return out;
  } },
  { id: 'bombBay', label: 'Bomb bay', hint: 'click the lower deck: a compartment hangs under it (one per ship)', slots: (L, parts) => {
    if (count(parts, (p) => p.part === 'bombBay' || (p.part === 'deck' && p.id === 'bay'))) return [];
    const out = [];
    for (const q of onRows(L, ['lower'])) {
      for (let x0 = Math.ceil((q.x0 + 10) / 10) * 10; x0 + BAY_W <= q.x1 - 10; x0 += 60) {
        if (!bayClear(L, x0)) continue;
        if (!roomAt(L, q.id, x0 + 22, true)) continue;
        out.push({ p: q.id, x: x0 + BAY_W / 2, label: `Bomb bay under the ${q.name}, from x ${x0}`, apply: (ps) => [...ps,
          { part: 'deck', id: 'bay', row: 'bay', name: 'Bomb Bay', x0, x1: x0 + BAY_W },
          { part: 'ladder', top: q.id, bottom: 'bay', xTop: x0 + 22, xBottom: x0 + 22 },
          { part: 'room', name: 'Bomb Bay', p: 'bay', x0, x1: x0 + BAY_W, color: '#4a4346' },
          { part: 'station', n: 'Bomb Bay', kind: 'bombBay', p: 'bay', x: x0 + 170 },
          { part: 'bombBay', x: x0 + 200, y: DECK_ROWS.bay, jumpX: x0 + 235, doorHalf: 48 }] });
      }
    }
    return out;
  } },
  { id: 'lift', label: 'Lift (main to lower)', hint: 'click the main deck where it overlaps the lower deck (one per ship)', slots: (L, parts) => {
    if (count(parts, (p) => p.part === 'lift')) return [];
    const out = [];
    for (const top of onRows(L, ['main'])) for (const bot of onRows(L, ['lower'])) {
      for (const x of spots({ x0: Math.max(top.x0, bot.x0), x1: Math.min(top.x1, bot.x1) }, 70)) {
        if (!roomAt(L, top.id, x, true) || !roomAt(L, bot.id, x, true) || !roomAt(L, bot.id, x - 35, true)) continue;
        out.push({ p: top.id, x, label: `Lift from the ${top.name} to the ${bot.name}, x ${x}`, apply: (ps) => [...ps, { part: 'lift', top: top.id, bottom: bot.id, xTop: x, xBottom: x, repair: { p: bot.id, x: x - 35 } }] });
      }
    }
    return out;
  } },
  { id: 'boarding', label: 'Boarding point', hint: 'click the top deck (raiders land here; a ship needs two)', slots: (L) => {
    const out = [];
    for (const q of onRows(L, ['catwalk'])) for (const x of spots(q, 30)) {
      if (L.boarderEntryPoints.some((o) => o.p === q.id && Math.abs(o.x - x) < 120)) continue;
      out.push({ p: q.id, x, label: `Boarding point on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'boarderEntry', p: q.id, x }] });
    }
    return out;
  } },
  ...['hammer', 'sword', 'hookshot', 'ice'].map((kind) => ({ id: 'rack_' + kind, label: RACK_LABEL[kind], hint: 'click a deck spot', slots: (L) => rackSlots(L, 'rack', RACK_LABEL[kind].toLowerCase(), kind) })),
  { id: 'searchlight', label: 'Searchlight', hint: 'click a spot on the nest or top deck', slots: (L) => {
    const out = [];
    for (const q of onRows(L, ['crow2', 'nest', 'catwalk'])) {
      const id = rowOf(q);
      for (const x of spots(q)) {
        if (!roomAt(L, q.id, x, false)) continue;
        out.push({ p: q.id, x, label: `Searchlight on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'searchlight', n: nextName(ps, 'Extra Searchlight'), p: q.id, x, bx: x, by: q.y - (id === 'nest' || id === 'crow2' ? 134 : 100), aim: -Math.PI / 2, arc: 1.5, len: 44 }] });
      }
    }
    return out;
  } },
  { id: 'sail', label: 'Mast and sail', hint: 'click a spot on the top deck or a crow\'s nest: a crew member raises the sail for extra speed from the wind', slots: (L) => {
    const out = [];
    for (const q of onRows(L, ['crow2', 'nest', 'catwalk'])) {
      for (const x of spots(q, 60)) {
        if (!roomAt(L, q.id, x, true)) continue;
        if ((L.sails || []).some((s) => s.p === q.id && Math.abs(s.x - x) < config.SAIL.WIDTH + 30)) continue; // (two sails need room for their canvas)
        out.push({ p: q.id, x, label: `Mast and sail on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'sail', n: nameFor(ps, 'Mainsail'), p: q.id, x }] });
      }
    }
    return out;
  } },
  ...['ladder', 'pole'].map((type) => ({
    id: type, label: type === 'ladder' ? 'Ladder' : 'Slide pole (down only)', hint: 'click a spot between two decks (or drag it on the blueprint with the Ladder tool)', slots: (L) => {
      const out = [];
      const ROWS = ['crow2', 'nest', 'catwalk', 'main', 'lower', 'keel', 'deep']; // each deck with the decks on the next row down
      const pairs = ROWS.slice(0, -1).flatMap((r, i) => L.platforms.filter((a) => rowOf(a) === r).flatMap((a) => L.platforms.filter((b) => rowOf(b) === ROWS[i + 1]).map((b) => [a.id, b.id])));
      for (const [top, bottom] of pairs) {
        const a = L.platforms.find((d) => d.id === top), b = L.platforms.find((d) => d.id === bottom);
        if (!a || !b) continue;
        const ti = L.platforms.indexOf(a), bi = L.platforms.indexOf(b);
        for (const x of spots({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1) }, 40)) {
          if (L.connectors.some((c) => c.top === ti && c.bottom === bi && Math.abs(c.xTop - x) < 90)) continue;
          out.push({ p: top, x, hy: (a.y + b.y) / 2, hr: (b.y - a.y) / 2 + 20, label: `${type === 'ladder' ? 'Ladder' : 'Pole'} ${a.name} to ${b.name}, x ${x}`, apply: (ps) => [...ps, { part: type === 'ladder' && isNestRow(rowOf(a)) ? 'rope' : type, top, bottom, xTop: x, xBottom: x }] });
        }
      }
      return out;
    },
  })),
  { id: 'extend', label: 'Longer deck (+1 column)', hint: 'click a deck end', slots: (L, parts) => {
    const out = [];
    for (const id of ['catwalk', 'main', 'lower']) {
      const q = L.platforms.find((d) => d.id === id);
      if (!q) continue;
      for (const side of [-1, 1]) {
        out.push({ p: id, x: side < 0 ? q.x0 : q.x1, label: `${q.name}, ${side < 0 ? 'aft' : 'fore'} end +1 column`, apply: (ps) => {
          const r = drawDeck(ps, id, side < 0 ? q.x0 - COL : q.x1, side < 0 ? q.x0 : q.x1 + COL); // (the same operation as drawing along the deck: rooms, collision outline and shield follow)
          return r.ok ? r.parts : clone(ps);
        } });
      }
    }
    return out;
  } },
  { id: 'keel', label: 'Keel deck (2 columns)', hint: 'click a spot under the lower deck', slots: (L, parts) => {
    const out = [], q = L.platforms.find((d) => d.id === 'lower');
    if (!q) return out;
    for (let x = GRID_X0 + Math.ceil((q.x0 - GRID_X0) / COL) * COL; x + 2 * COL <= q.x1; x += COL) { // (a pin on the lower deck for every free two-column stretch under it)
      if (!drawDeck(parts, 'keel', x, x + 2 * COL).ok) continue;
      out.push({ p: 'lower', x: x + COL, label: `Keel deck under the lower deck, columns from x ${x}`, apply: (ps) => { const r = drawDeck(ps, 'keel', x, x + 2 * COL); return r.ok ? r.parts : clone(ps); } });
    }
    return out;
  } },
  { id: 'ballast', label: 'Sandbag (on deck)', hint: 'click a spot on a main, lower or keel deck: cheap weight to trim her', slots: (L, parts) => ballastSlots(L, parts, false) },
  { id: 'ballast_hang', label: 'Sandbag (hanging)', hint: 'click a lower or keel deck: it hangs from the hull under it', slots: (L, parts) => ballastSlots(L, parts, true) },
  { id: 'extinguisher', label: 'Extinguisher', hint: 'click a deck spot', slots: (L) => rackSlots(L, 'extinguisher', 'an extinguisher') },
  { id: 'vent', label: 'Steam vent', hint: 'click a deck spot', slots: (L) => rackSlots(L, 'vent', 'a steam vent', undefined, VENT_ROWS) },
  { id: 'gasValve', label: 'Gas valve', hint: 'drop it on the nest, top or main deck: it feeds the bag over it (the nearest). A shut valve cuts that bag off from the pump', slots: (L) => valveSlots(L) },
  { id: 'gasbag', label: 'Gasbag', hint: 'click a stretch of the gasbag row: one more bag beside the others (a row of small ones keeps flying if you lose one)', slots: (L, parts) => bagSlots(parts) },
];

// Gasbags (S.5d): a slot is a stretch of the empty gasbag row a new bag (BAG_DROP half-length, less where a neighbour is close) fits in: touching the bag beside it,
// or centred on a column line. Not a point on a deck: the slot carries its `span` and sits on the bag row (y = BAG_CY).
function bagSlots(parts) {
  const E = config.BUILD_EDIT, R = E.BAG_DROP;
  const bags = parts.filter((p) => p.part === 'gasbag').sort((a, b) => a.cx - b.cx);
  if (bags.length >= E.BAGS_MAX) return [];
  const gaps = [];
  let cursor = -Infinity;
  for (const b of bags) { gaps.push([cursor, b.cx - b.rx]); cursor = b.cx + b.rx; }
  gaps.push([cursor, Infinity]);
  const out = [], seen = new Set();
  const add = (a, z) => {
    a = Math.round(a); z = Math.round(z);
    if (z - a < 2 * E.BAG_MIN || seen.has(a + ':' + z)) return;
    seen.add(a + ':' + z);
    const rx = Math.min(E.BAG_MAX, Math.floor((z - a) / 20) * 10);
    const cx = Math.round((a + z) / 2);
    out.push({ p: null, x: cx, y: E.BAG_CY, span: [cx - rx, cx + rx], bag: true, label: `Gasbag ${rx * 2} px long, x ${cx - rx} to ${cx + rx}`, apply: (ps) => [...ps, { part: 'gasbag', cx, cy: E.BAG_CY, rx, ry: E.BAG_RY }] });
  };
  for (const [from, to] of gaps) {
    if (Number.isFinite(from)) add(from, Math.min(to, from + 2 * R)); // touching the bag on its tail side
    if (Number.isFinite(to)) add(Math.max(from, to - 2 * R), to); // ...or on its nose side
    for (let c = GRID_X0 + Math.ceil((Math.max(from, -300) - GRID_X0) / COL) * COL; c <= Math.min(to, 2400); c += COL) add(Math.max(from, c - R), Math.min(to, c + R)); // on the column grid
  }
  return out;
}

// How far a slot is from a point (ship coordinates): a pin on a deck by its distance from the pin; a bag stretch by its centre, and only for a point up on the bag row.
export function slotDistance(s, x, y) {
  if (s.bag) return Math.abs(y - s.y) < config.BUILD_EDIT.BAG_RY + 50 ? Math.abs(x - s.x) : Infinity;
  const dy = Math.abs((s.hy ?? s.y - 14) - y); // (a ladder's pin hangs mid-way between its two decks: hy / hr)
  return dy > (s.hr ?? config.BUILD_EDIT.DROP_ROW) ? Infinity : Math.hypot(s.x - x, dy);
}
// The nearest of `slots` to a point within maxDist, or null.
export function pickSlot(slots, x, y, maxDist = config.BUILD_EDIT.DROP_REACH) {
  let best = null, bd = maxDist;
  for (const s of slots) { const d = slotDistance(s, x, y); if (d <= bd) { bd = d; best = s; } }
  return best;
}

// Why a part cannot be dropped at a point: where each palette type may stand (deck rows) and its one-per-ship limits. A sentence for the hover note.
const ROW_NAME = { crow2: "high crow's nest", nest: "crow's nest", catwalk: 'top deck', main: 'main deck', lower: 'lower deck', keel: 'keel deck', deep: 'deep deck', helm: 'helm mount', belly: 'belly', bay: 'bomb bay' };
const RACK_ROWS = ['catwalk', 'main', 'lower'];
const RULES = {
  helm: { rows: ['catwalk', 'main'], once: (parts) => count(parts, (p) => p.part === 'station' && p.kind === 'helm') > 0, onceText: 'A ship has one helm.' },
  boiler: { rows: ['main', 'lower'] }, coal: { rows: ['lower', 'main', 'keel', 'deep'] }, ammo: { rows: ['lower', 'main', 'keel', 'deep'] },
  engine: { rows: ['lower', 'main'] }, gun: { rows: ['crow2', 'nest', 'catwalk', 'lower'] }, lookout: { rows: ['nest', 'crow2'] }, searchlight: { rows: ['crow2', 'nest', 'catwalk'] }, sail: { rows: ['crow2', 'nest', 'catwalk'] },
  medbay: { rows: ['main', 'lower', 'keel', 'deep'], once: (parts) => count(parts, (p) => p.part === 'medbay') > 0, onceText: 'A ship has one medbay.' },
  bombBay: { rows: ['lower'], once: (parts) => count(parts, (p) => p.part === 'bombBay' || (p.part === 'deck' && p.id === 'bay')) > 0, onceText: 'A ship has one bomb bay.' },
  lift: { rows: ['main'], once: (parts) => count(parts, (p) => p.part === 'lift') > 0, onceText: 'A ship has one lift.' },
  boarding: { rows: ['catwalk'] }, rack_hammer: { rows: RACK_ROWS }, rack_sword: { rows: RACK_ROWS }, rack_hookshot: { rows: RACK_ROWS }, rack_ice: { rows: RACK_ROWS },
  extinguisher: { rows: RACK_ROWS }, vent: { rows: ['catwalk', 'main', 'lower', 'keel', 'deep'] }, gasValve: { rows: ['nest', 'catwalk', 'main'], needsBag: true }, ballast: { rows: ['main', 'lower', 'keel', 'deep'] }, ballast_hang: { rows: ['lower', 'keel', 'deep'] },
  ladder: { link: true }, pole: { link: true },
};
export function whyNot(parts, type, x, y) {
  const def = PALETTE.find((t) => t.id === type), rule = RULES[type] || {}, what = def ? def.label.toLowerCase() : type;
  let L;
  try { L = buildLayout(parts); } catch { return 'The parts do not build: undo the last change first.'; }
  if (type === 'gasbag') {
    const E = config.BUILD_EDIT;
    if (count(parts, (p) => p.part === 'gasbag') >= E.BAGS_MAX) return `A ship has at most ${E.BAGS_MAX} gasbags.`;
    if (Math.abs(y - E.BAG_CY) >= E.BAG_RY + 50) return 'Drop a gasbag on the gasbag row, above the decks.';
    return `No room for a bag there: the bags beside it leave less than ${2 * E.BAG_MIN} px (drop it in a wider gap, or shorten a neighbour).`;
  }
  if (rule.once && rule.once(parts)) return rule.onceText;
  if (rule.needsBag && !L.gasbags.length) return `A ${what} feeds a gasbag: draw or drop a gasbag first.`;
  const decks = L.platforms.filter((q) => x > q.x0 - 70 && x < q.x1 + 70 && Math.abs(q.y - y) < 130).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
  const deck = decks[0];
  if (!deck) return `Drop the ${what} on a deck of the ship.`;
  const row = rowOf(deck);
  if (rule.link) return `A ${what} joins two decks that overlap: drop it where another deck lies directly above or below the ${deck.name}, clear of ladders and stations.`;
  if (rule.rows && !rule.rows.includes(row)) return `A ${what} goes on the ${rule.rows.map((r) => ROW_NAME[r]).join(' or ')}, not the ${deck.name}.`;
  if (x < deck.x0 + 25 || x > deck.x1 - 25) return `Too close to the end of the ${deck.name}.`;
  const gap = config.BUILD_CHECK.MIN_GAP + 15;
  const near = [...L.stations.map((s) => ({ n: s.n, p: s.p, x: s.x })), ...L.engines.map((e) => ({ n: e.name, p: e.p, x: e.x }))].filter((s) => s.p === deck.id && Math.abs(s.x - x) < gap).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  if (near) return `${near.n} is in the way (keep ${gap} px clear on the ${deck.name}).`;
  return `No clear spot for a ${what} there on the ${deck.name}: something is standing too close (a ladder, a rack, a vent or another ${what}).`;
}

function stationSlots(L, kind) {
  const [rows, haul] = STATION_AT[kind];
  const out = [];
  for (const q of onRows(L, rows)) {
    for (const x of spots(q)) {
      if (!roomAt(L, q.id, x, haul)) continue;
      out.push({ p: q.id, x, label: `${LABEL[kind]} on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'station', n: nameFor(ps, PLAIN[kind]), kind, p: q.id, x }] });
    }
  }
  return out;
}

// Is there room for a bomb bay compartment from x0: no keel / bay / belly deck in its space?
function bayClear(L, x0) {
  return !L.platforms.some((q) => (KEEL_ROWS.includes(rowOf(q)) || ['belly', 'bay'].includes(rowOf(q))) && q.x0 < x0 + BAY_W + 14 && q.x1 > x0 - 14);
}

const VENT_ROWS = ['catwalk', 'main', 'lower', 'keel', 'deep']; // a steam vent can stand on any full deck
function rackSlots(L, part, what, kind, rows = ['catwalk', 'main', 'lower']) {
  const out = [];
  for (const q of onRows(L, rows)) {
    const d = L.platforms.indexOf(q);
    for (const x of spots(q, 30)) {
      const list = part === 'rack' ? L.racks : part === 'vent' ? L.vents : L.extinguishers;
      if (list.some((o) => o.p === q.id && Math.abs(o.x - x) < 100)) continue;
      if ((L.gasValves || []).some((o) => o.p === q.id && Math.abs(o.x - x) < 60)) continue; // (not on top of a gas valve)
      const boiler = part === 'vent' ? ventBoiler(L, { x, d }) : null; // (a steam vent lets steam out of a boiler's line: the nearest boiler's)
      out.push({ p: q.id, x, label: `${what[0].toUpperCase()}${what.slice(1)} on the ${q.name}, x ${x}${boiler ? ` (on the ${boiler.n}'s steam line)` : ''}`, apply: (ps) => [...ps, { part, ...(part === 'rack' ? { kind } : {}), p: q.id, x }] });
    }
  }
  return out;
}

// Gas valves (S.5d): a wheel on a deck that shuts or opens the feed to ONE gasbag. A spot links to the bag over it (the nearest bag); a bag no spot lies under (the end
// bags beyond the top deck) gets the two spots nearest it, so every bag can have its valve. The part remembers `bx`, the bag's middle, so it stays linked as bags are resized.
const VALVE_ROWS = ['nest', 'catwalk', 'main'];
function valveSlots(L) {
  const bags = L.gasbags;
  if (!bags.length) return [];
  const have = L.gasValves || [];
  const cands = [];
  for (const q of onRows(L, VALVE_ROWS)) for (const x of spots(q, 30)) {
    if (!roomAt(L, q.id, x, true, config.BUILD_EDIT.VALVE_CLEAR, config.BUILD_EDIT.VALVE_STATION) || have.some((v) => v.p === q.id && Math.abs(v.x - x) < config.BUILD_EDIT.VALVE_GAP)) continue;
    cands.push({ q, x, bag: Math.max(0, bagNearX(bags, x)) });
  }
  const count = (bi) => cands.filter((c) => c.bag === bi).length;
  bags.forEach((b, bi) => { // a bag with no spot under it: the spots nearest it are its (taken from a bag that keeps at least one)
    if (count(bi)) return;
    const take = cands.filter((c) => count(c.bag) > 1 || c.bag === bi).sort((p, r) => Math.abs(p.x - b.cx) - Math.abs(r.x - b.cx));
    for (const c of take.slice(0, 2)) if (count(c.bag) > 1) c.bag = bi;
  });
  return cands.map(({ q, x, bag }) => ({ p: q.id, x, feeds: bag, label: `Gas valve on the ${q.name}, x ${x} (feeds the ${bagName(bag, bags.length).toLowerCase().replace(/^bag /, "bag ")})`, apply: (ps) => [...ps, { part: 'gasValve', p: q.id, x, bx: Math.round(bags[bag].cx) }] }));
}

// Sandbags: on a deck (main / lower / keel / deep) or hanging under one with nothing hanging below it. Cheap, a fixed few per ship (BALANCE.BALLAST_MAX).
function ballastSlots(L, parts, hang) {
  const B = config.BALANCE;
  if (count(parts, (p) => p.part === 'ballast') >= B.BALLAST_MAX) return [];
  const out = [];
  for (const q of onRows(L, hang ? ['lower', 'keel', 'deep'] : ['main', 'lower', 'keel', 'deep'])) {
    for (const x of spots(q, 25)) {
      if ((L.ballast || []).some((o) => o.p === q.id && !!o.hang === hang && Math.abs(o.x - x) < B.BALLAST_GAP)) continue;
      if (!hang && [...L.stations, ...L.engines].some((s) => s.p === q.id && Math.abs(s.x - x) < 30)) continue;
      if (hang && L.platforms.some((o) => !o.outside && o.y > q.y && o.x0 - 20 < x && o.x1 + 20 > x)) continue; // (the hull is not bare there)
      out.push({ p: q.id, x, y: q.y + (hang ? B.BALLAST_HANG : 0), label: `Sandbag ${hang ? 'hanging under' : 'on'} the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'ballast', p: q.id, x, ...(hang ? { hang: true } : {}) }] });
    }
  }
  return out;
}

// The slots of one palette type for a build, each with its deck's y (for drawing). Legality is LOCAL (see the top of this file); { whole: true } also
// demands that the resulting ship validates. Warnings and FAILs of the result are worked out on demand (slot.check()) or up front with { whole: true }.
export function slotsFor(type, parts, { legalOnly = true, whole = false } = {}) {
  const def = PALETTE.find((t) => t.id === type);
  if (!def) return [];
  let L;
  try { L = buildLayout(parts); } catch { return []; }
  const decks = Object.fromEntries(L.platforms.map((q) => [q.id, q]));
  const out = [];
  for (const s of def.slots(L, parts)) {
    const place = s.apply;
    s.apply = (ps) => finish(place(ps));
    s.type = type;
    if (s.y == null) s.y = decks[s.p] ? decks[s.p].y : 0;
    s.ok = true;
    s.warns = [];
    s.fails = [];
    s.check = () => { const v = validate(s.apply(parts)); s.warns = v.warns; s.fails = v.fails; s.valid = v.ok; return v; };
    if (whole) s.ok = s.check().ok;
    if (s.ok || !legalOnly) out.push(s);
  }
  return out;
}

// A small ship built from nothing with the same operations a player uses (draw the decks and the bag, then pick palette slots nearest to where the
// parts are wanted): the dev page's "Start from a minimal ship" and the gates use it. Flyable, level, a bit over 3 columns... see MINIMAL below.
export const MINIMAL = {
  decks: [['main', 140, 860], ['lower', 20, 980], ['catwalk', 260, 860]], bag: [-70, 1070], nest: [380, 620],
  // [palette type, deck row, x]
  parts: [
    ['boiler', 'main', 300], ['coal', 'lower', 400], ['ammo', 'lower', 640], ['helm', 'catwalk', 800], ['engine', 'lower', 50], ['engine', 'lower', 950],
    ['gun', 'catwalk', 300], ['gun', 'catwalk', 820], ['lookout', 'nest', 500], ['medbay', 'lower', 520], ['bombBay', 'lower', 760], ['lift', 'main', 700],
    ['boarding', 'catwalk', 300], ['boarding', 'catwalk', 820], ['rack_hammer', 'main', 520], ['rack_sword', 'main', 200], ['rack_hookshot', 'catwalk', 560], ['rack_ice', 'main', 780], ['extinguisher', 'lower', 300],
  ],
};
export function minimalBuild(plan = MINIMAL) {
  let p = emptyBuild();
  const op = (r) => { if (!r.ok) throw new Error('minimalBuild: ' + r.hint); p = r.parts; };
  for (const [row, x0, x1] of plan.decks) op(drawDeck(p, row, x0, x1));
  op(drawBag(p, plan.bag[0], plan.bag[1]));
  op(drawDeck(p, 'nest', plan.nest[0], plan.nest[1]));
  for (const [type, row, x] of plan.parts) {
    const L = buildLayout(p);
    const on = (slot) => rowOf(L.platforms.find((q) => q.id === slot.p) || {}) === row;
    const slot = slotsFor(type, p).filter(on).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    if (!slot) throw new Error(`minimalBuild: no spot for ${type} near x ${x} on the ${row} row`);
    p = slot.apply(p);
  }
  return p;
}

// Parts a build can lose without breaking the game (guns beyond the first, lamps, escort fighters, the navigator ...).
// Returns [{ label, apply(parts) -> new parts }].
export function removals(parts) {
  const out = [];
  const guns = parts.filter((p) => p.part === 'gun').length;
  parts.forEach((p, i) => {
    const drop = (extra = () => false) => (ps) => ps.filter((o, j) => j !== i && !extra(o));
    if (p.part === 'gun' && guns > 1) out.push({ label: p.n, apply: drop() });
    else if (p.part === 'searchlight') out.push({ label: p.n, apply: drop() });
    else if (p.part === 'station' && p.kind === 'escort') out.push({ label: p.n, apply: drop((o) => o.part === 'escortDock' && o.n === p.n) });
    else if (p.part === 'station' && p.kind === 'navigator') out.push({ label: p.n, apply: drop() });
    else if (p.part === 'station' && ['boiler', 'coal', 'ammo', 'lookout'].includes(p.kind) && parts.filter((o) => o.part === 'station' && o.kind === p.kind).length > 1) out.push({ label: p.n, apply: drop() });
  });
  return out;
}

// One random legal mutation of a build: { tag, label, parts } or null if nothing fits. rng() gives 0..1.
// prefer: a type to try first most of the time (the batch asks for an engine pod right after a second boiler, the only way one fits).
// weights: how often each type is tried (the batch wants engines and boilers as often as guns).
const WEIGHTS = { extend: 3, keel: 1, gun: 3, searchlight: 2, lookout: 2, boiler: 3, coal: 1, ammo: 1, engine: 3, ladder: 2, pole: 1, rack_hammer: 1, extinguisher: 1, vent: 1, ballast: 1, remove: 2 };
export function randomMutation(parts, rng, prefer) {
  const bag = Object.entries(WEIGHTS).flatMap(([t, w]) => Array(w).fill(t));
  for (let tries = 0; tries < 12; tries++) {
    const type = prefer && tries === 0 && rng() < 0.7 ? prefer : bag[Math.floor(rng() * bag.length)];
    if (type === 'remove') {
      const list = removals(parts).filter((r) => validate(r.apply(parts)).ok);
      if (list.length) { const r = list[Math.floor(rng() * list.length)]; return { tag: 'remove', label: 'remove ' + r.label, parts: r.apply(parts) }; }
      continue;
    }
    const slots = slotsFor(type, parts, { whole: true });
    if (slots.length) { const s = slots[Math.floor(rng() * slots.length)]; return { tag: type, label: s.label, parts: s.apply(parts) }; }
  }
  return null;
}
