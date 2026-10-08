// Blueprint editing (Phase S.5b): draw a deck, erase a deck, lengthen the gasbag. PURE and Node-safe: each function takes a list of
// parts (shipBuild.js) and returns a NEW list with a short report, never touching the one it was given. The dev page's blueprint
// view (buildTest.js) uses them, and so can the in-game Shipwright's Yard (S.6b) and the random batch.
//
//   drawDeck(parts, row, x0, x1)   a line drawn along a deck ROW (EDIT_ROWS): along an existing deck it makes it longer, on an empty
//                                  stretch it makes a new deck (rooms for the hull to enclose, plus a ladder to the nearest deck so it can be reached)
//   erase(parts, row, x0, x1)      rub out a stretch of deck: it gets shorter, splits in two, or goes; whatever stood on the rubbed-out stretch
//                                  (stations, guns, racks, ladders, vents, pipes ...) goes with it and is listed in `removed`
//   setBag(parts, { grow, twin })  the biggest gasbag a column (BAG_STEP) longer or shorter, or its twin envelope on / off (a ship with no bag gets one)
//   drawBag(parts, x0, x1)         a span dragged along the gasbag row: a NEW bag on empty row space (any number side by side, S.5d), or the bag the
//                                  stroke crosses resized; resizeBag(parts, i, side, x) moves one end of bag i (bags are numbered tail to nose)
//   placePart(parts, type, x, y)   drop a part picture from the tray: the nearest legal slot of that palette type (buildSlots.js) takes it, or a hint says why not
//   placeConnector(parts, x, rowA, rowB, type)   a ladder, slide pole or rope straight down between two deck rows at x
//   thingAt(parts, x, y, slop) / removeAt(parts, x, y, slop) the single placed thing under a point (ladders, stations, guns, racks, sandbags ...); delete it
//   emptyBuild() / ensureFrame(parts)            a ship of nothing (just its frame): every operation works on it, the first deck needs no ladder
// Result: { ok, parts, hint, added: [labels], removed: [labels], cols, deck, kind }. ok false = nothing changed and `hint` says why.
// The result may well FAIL validate() (erase the last boiler ...): that is the editor's job to show, not to prevent.
import { buildLayout, BUILDS, COL, DECK_ROWS, KEEL_ROWS, rowOf, isNestRow, bagCover } from './shipBuild.js';
import { config } from '../../config.js';
import { slotsFor, pickSlot, whyNot } from './buildSlots.js'; // (a cycle: buildSlots.js re-exports these operations; each side only calls the other at run time)

export const GRID_X0 = 20; // the column grid: lines at GRID_X0 + k x COL (the classic main and lower decks' aft ends sit on it)

// The rows a deck can be drawn on (top to bottom). hull: its rooms are inside the gondola hull (the art encloses them);
// split: an erase may cut it in two; multi: more than one deck can share the row (the others are single decks that get longer or shorter).
export const EDIT_ROWS = {
  crow2: { id: 'crow2', name: "High Crow's Nest", outside: true, hull: false, split: true, multi: false },
  nest: { id: 'nest', name: "Crow's Nest", outside: true, hull: false, split: true, multi: false },
  catwalk: { id: 'catwalk', name: 'Top Deck', outside: true, hull: false, split: true, multi: false },
  main: { id: 'main', name: 'Main Deck', outside: false, hull: true, split: true, multi: false },
  lower: { id: 'lower', name: 'Lower Deck', outside: false, hull: true, split: true, multi: false },
  keel: { id: 'keel', name: 'Keel Deck', outside: false, hull: true, split: true, multi: true },
  deep: { id: 'deep', name: 'Deep Deck', outside: false, hull: true, split: true, multi: true },
};
export const DRAW_ROWS = Object.keys(EDIT_ROWS);
// Rows that exist but are placed, not drawn (the helm mount and the belly blisters): the eraser still takes them away.
const ERASE_ONLY = { helm: { split: false }, belly: { split: false }, bay: { split: false } };
const rowInfo = (row) => EDIT_ROWS[row] || ERASE_ONLY[row];

const BE = () => config.BUILD_EDIT;
const clone = (parts) => parts.map((p) => ({ ...p }));
const no = (parts, hint) => ({ ok: false, parts, hint, added: [], removed: [] });
const decksOn = (parts, row) => parts.filter((p) => p.part === 'deck' && p.row === row);
const uniqueId = (parts, base) => {
  const used = new Set(parts.filter((p) => p.part === 'deck').map((p) => p.id));
  let id = base, k = 2;
  while (used.has(id)) id = base + k++;
  return id;
};
const cols = (len) => +(len / COL).toFixed(1);

// Every edit makes sure the ship has its frame part (the deflector band and nest rise; a build started from nothing begins with only this).
export function ensureFrame(parts) {
  if (!parts.some((p) => p.part === 'frame')) {
    const c = BUILDS.classic.find((p) => p.part === 'frame');
    parts.push({ part: 'frame', nestRise: c.nestRise, shield: { ...c.shield } });
  }
  return parts;
}
// A ship with nothing on it: just the frame. The blueprint editor can build a whole ship from here.
export const emptyBuild = () => ensureFrame([]);

// ---- what a part is tied to ------------------------------------------------------------------------------------
// refs(o): the (deck id, x) points a part stands on, each with a setter to move it to another deck. Pieces that stand on a deck are
// removed when that stretch of deck is erased; connectors have two ends, the lift also its repair spot.
const POINT = ['station', 'gun', 'searchlight', 'sail', 'engine', 'rack', 'vent', 'gasValve', 'extinguisher', 'boarderEntry', 'escortDock', 'medbay', 'ballast'];
const LINK = ['ladder', 'rope', 'stairs', 'lift', 'pole'];
function refs(o) {
  const r = [];
  if (POINT.includes(o.part)) r.push({ id: o.p, x: o.x, to: (id) => { o.p = id; } });
  else if (LINK.includes(o.part)) {
    r.push({ id: o.top, x: o.xTop, to: (id) => { o.top = id; } }, { id: o.bottom, x: o.xBottom, to: (id) => { o.bottom = id; } });
    if (o.repair) r.push({ id: o.repair.p, x: o.repair.x, to: (id) => { o.repair = { ...o.repair, p: id }; } });
  } else if (o.part === 'pipe') r.push({ id: o.p, x: o.valve[0], to: (id) => { o.p = id; } });
  return r;
}
const nameOf = (o) => o.n || o.name;
// A short human label for the "removed: ..." note.
function labelOf(o) {
  switch (o.part) {
    case 'station': case 'gun': case 'searchlight': case 'sail': return o.n;
    case 'engine': return o.name;
    case 'rack': return `${o.kind} rack`;
    case 'ladder': case 'rope': case 'stairs': case 'pole': case 'lift': return o.part;
    case 'pipe': return `steam pipe to ${o.to}`;
    case 'vent': return 'steam vent';
    case 'gasValve': return 'gas valve';
    case 'extinguisher': return 'extinguisher';
    case 'boarderEntry': return 'boarding point';
    case 'escortDock': return `escort hook ${o.n}`;
    case 'gasbag': return 'gasbag';
    case 'medbay': return 'medbay';
    case 'ballast': return o.hang ? 'hanging sandbag' : 'sandbag';
    case 'deck': return `${o.name} (deck)`;
    default: return o.part;
  }
}
// "Coal Bunker, 2 ladders, steam vent": named things as they are, the rest counted.
export function summarize(labels) {
  const counts = new Map();
  for (const l of labels) counts.set(l, (counts.get(l) || 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${n} ${l}${/s$/.test(l) ? '' : 's'}` : l)).join(', ');
}

// ---- spans ----------------------------------------------------------------------------------------------------
// [lo, hi] minus a list of spans: what is left, as spans.
function subtract(lo, hi, spans) {
  let out = [[lo, hi]];
  for (const s of spans) {
    out = out.flatMap(([a, b]) => (s.x1 <= a || s.x0 >= b ? [[a, b]] : [[a, Math.max(a, s.x0)], [Math.min(b, s.x1), b]].filter(([p, q]) => q - p > 0.5)));
  }
  return out;
}

// Where an x snaps to: the nearest deck end (any deck) within SNAP_X, else the nearest column line of the grid.
export function snapX(parts, x, bags = false) { // (bags: the gasbag tool snaps to the ends of other bags, not to deck ends)
  let best = null;
  for (const p of parts) if (bags ? p.part === 'gasbag' : p.part === 'deck') for (const e of bags ? [p.cx - p.rx, p.cx + p.rx] : [p.x0, p.x1]) if (Math.abs(e - x) <= BE().SNAP_X && (best === null || Math.abs(e - x) < Math.abs(best - x))) best = e;
  return best !== null ? best : GRID_X0 + Math.round((x - GRID_X0) / COL) * COL;
}

// Which row a pointer height means: { row } or { why } (a hint saying why a deck cannot go there).
export function rowAtY(y, rows = DRAW_ROWS) {
  let best = null;
  for (const r of rows) if (best === null || Math.abs(DECK_ROWS[r] - y) < Math.abs(DECK_ROWS[best] - y)) best = r;
  if (Math.abs(DECK_ROWS[best] - y) <= BE().SNAP_ROW) return { row: best };
  const first = DECK_ROWS[rows[0]], last = DECK_ROWS[rows[rows.length - 1]];
  if (y < first - BE().SNAP_ROW) return { why: 'That is above the gasbag line: nothing can be built up there (the crow\'s nest is the top deck).' };
  if (y < DECK_ROWS.catwalk - BE().SNAP_ROW) return { why: 'That would cross the gasbag: decks go in the hull below it (or on top of it, the crow\'s nest row).' };
  if (y > last + BE().SNAP_ROW) return { why: 'That is below the deepest deck row.' };
  const above = rows.filter((r) => DECK_ROWS[r] < y).pop(), below = rows.find((r) => DECK_ROWS[r] > y);
  return { why: `Between deck rows: pull the line to the ${EDIT_ROWS[above] ? EDIT_ROWS[above].name : above} or the ${EDIT_ROWS[below] ? EDIT_ROWS[below].name : below} row.` };
}

// ---- keeping the ship's frame in step -----------------------------------------------------------------------------
// Any edit changes the ship's shape: the hand-placed collision outline (classic) is dropped so it is derived again, and the deflector
// shield band grows or shrinks with the ship's drawn size (the classic band belongs to the classic size).
let classicRef = null;
function refit(parts) {
  const frame = parts.find((p) => p.part === 'frame');
  if (!frame) return;
  delete frame.samples;
  try {
    if (!classicRef) {
      const c = BUILDS.classic.find((p) => p.part === 'frame');
      classicRef = { shield: c.shield, bounds: buildLayout(BUILDS.classic.map((p) => (p.part === 'frame' ? { ...p, samples: null } : p))).bounds };
    }
    const B = buildLayout(parts).bounds, R = classicRef.bounds, S = classicRef.shield;
    if (!B || !S) return;
    const d = { x0: B.x0 - R.x0, x1: B.x1 - R.x1, y0: B.y0 - R.y0, y1: B.y1 - R.y1 };
    frame.shield = { cx: Math.round(S.cx + (d.x0 + d.x1) / 2), cy: Math.round(S.cy + (d.y0 + d.y1) / 2), rx: Math.round(S.rx + (d.x1 - d.x0) / 2), ry: Math.round(S.ry + (d.y1 - d.y0) / 2) };
  } catch { /* the parts do not build: validate() says so */ }
}

// Make sure the hull rows' rooms cover the whole deck: an uncovered stretch at a deck end lengthens the room beside it (up to two
// columns), anything else gets a new room (so the hull art always has walls behind the deck).
function coverRooms(next, deck, info) {
  if (!info.hull) return;
  const rooms = () => next.filter((r) => r.part === 'room' && r.p === deck.id).sort((a, b) => a.x0 - b.x0);
  const gaps = [];
  let cursor = deck.x0;
  for (const r of rooms()) { if (r.x0 > cursor + 20) gaps.push([cursor, r.x0]); cursor = Math.max(cursor, r.x1); }
  if (deck.x1 > cursor + 20) gaps.push([cursor, deck.x1]);
  for (const [g0, g1] of gaps) {
    const left = rooms().find((r) => Math.abs(r.x1 - g0) < 2), right = rooms().find((r) => Math.abs(r.x0 - g1) < 2);
    if (g1 - g0 <= COL * 2 && g1 === deck.x1 && left) left.x1 = g1;
    else if (g1 - g0 <= COL * 2 && g0 === deck.x0 && right) right.x0 = g0;
    else next.push({ part: 'room', name: deck.name + (g0 === deck.x0 && g1 === deck.x1 ? '' : ' Annex'), p: deck.id, x0: g0, x1: g1, color: '#a8814f' });
  }
}

// ---- a spot for the ladder of a new deck -------------------------------------------------------------------------
// x on deck `p` (of layout L) between lo and hi where nothing is in the way (stations, racks, vents, valves, other ladders), nearest the middle.
function freeSpot(L, p, lo, hi, avoid = []) {
  const gap = config.BUILD_CHECK.MIN_GAP + 15, near = config.TOOLS.REACH + 5;
  const q = L.platforms.find((d) => d.id === p), di = L.platforms.indexOf(q);
  const clear = (x, strict) => {
    if ([...L.stations, ...L.engines].some((s) => s.p === p && Math.abs(s.x - x) < gap)) return false;
    if (avoid.some((a) => Math.abs(a - x) < gap + 30)) return false;
    if (!strict) return true;
    if ([...L.racks, ...L.vents, ...L.extinguishers, ...(L.gasValves || [])].some((o) => o.p === p && Math.abs(o.x - x) < near)) return false;
    if (L.pipes.some((o) => o.p === p && Math.abs(o.valve[0] - x) < near)) return false;
    return !L.connectors.some((c) => (c.top === di && Math.abs(c.xTop - x) < near) || (c.bottom === di && Math.abs(c.xBottom - x) < near));
  };
  const mid = (lo + hi) / 2;
  for (const strict of [true, false]) {
    let best = null;
    for (let x = Math.ceil((lo + 40) / 10) * 10; x <= hi - 40; x += 10) if (clear(x, strict) && (best === null || Math.abs(x - mid) < Math.abs(best - mid))) best = x;
    if (best !== null) return best;
  }
  return null;
}

// ---- drawing ------------------------------------------------------------------------------------------------------
export function drawDeck(parts, row, x0, x1) {
  const info = EDIT_ROWS[row];
  if (!info) return no(parts, 'Draw on a deck row: the crow\'s nest, top deck, main, lower, keel or deep deck. The helm mount and belly fittings are placed, not drawn.');
  let lo = Math.round(Math.min(x0, x1)), hi = Math.round(Math.max(x0, x1));
  if (hi - lo < 40) return no(parts, 'Drag along the row to draw a deck (a column or more).');
  let L;
  try { L = buildLayout(parts); } catch { return no(parts, 'The parts do not build: undo the last change first.'); }
  if (isNestRow(row)) {
    if (!L.gasbags.length) return no(parts, "The crow's nest sits on top of the gasbag: draw the gasbag first (the Gasbag tool).");
    if (!bagCover(L.gasbags).some((c) => lo >= c.lo && hi <= c.hi)) return no(parts, "The crow's nest sits on top of the gasbag: keep it over a bag, or a row of touching bags (make the bag longer first).");
  }
  if (row === 'crow2') { // the high tier stands on a mast above a crow's nest and is climbed to from it
    const below = L.platforms.filter((q) => rowOf(q) === 'nest');
    if (!below.length) return no(parts, "A high crow's nest stands on a mast above the crow's nest: draw the crow's nest first.");
    if (!below.some((q) => Math.min(q.x1, hi) - Math.max(q.x0, lo) >= 80) && !decksOn(parts, 'crow2').some((d) => d.x1 >= lo - 1 && d.x0 <= hi + 1)) return no(parts, "A high crow's nest must stand over a crow's nest (it is climbed to by a rope from it): draw it above one.");
  }
  const next = clone(parts);
  const here = decksOn(next, row);
  let touch = here.filter((d) => d.x1 >= lo - 1 && d.x0 <= hi + 1);
  if (!touch.length && here.length && !info.multi) { // a single-deck row: close the gap to the deck that is already there
    const near = here.reduce((a, b) => (Math.min(Math.abs(a.x0 - hi), Math.abs(a.x1 - lo)) <= Math.min(Math.abs(b.x0 - hi), Math.abs(b.x1 - lo)) ? a : b));
    if (near.x1 < lo) lo = near.x1; else hi = near.x0;
    touch = [near];
  }
  const f0 = Math.min(lo, ...touch.map((d) => d.x0)), f1 = Math.max(hi, ...touch.map((d) => d.x1));
  const fresh = subtract(f0, f1, touch); // the stretch that is new deck
  if (touch.length === 1 && !fresh.length) return no(parts, `That stretch is already the ${touch[0].name}: drag past its end to make it longer.`);
  if (!touch.length && !fresh.length) return no(parts, 'Nothing to draw.');
  if (row === 'keel') { // the belly blisters hang in the keel deck's space
    for (const [a, b] of fresh) {
      const blocker = parts.find((d) => d.part === 'deck' && ['belly', 'bay'].includes(d.row) && d.x0 < b - 1 && d.x1 > a + 1);
      if (blocker) return no(parts, `The ${blocker.name} hangs in the way: draw the keel deck clear of it, or erase it first.`);
    }
  }
  ensureFrame(next);
  const added = [];
  let deck;
  if (touch.length) {
    deck = touch.find((d) => d.id === info.id) || touch[0];
    for (const other of touch) {
      if (other === deck) continue; // two decks that now touch become one: everything on the other moves to this one
      for (const o of next) {
        if (o.p === other.id) o.p = deck.id;
        if (o.top === other.id) o.top = deck.id;
        if (o.bottom === other.id) o.bottom = deck.id;
        if (o.repair && o.repair.p === other.id) o.repair = { ...o.repair, p: deck.id };
      }
      next.splice(next.indexOf(other), 1);
    }
    deck.x0 = f0;
    deck.x1 = f1;
    coverRooms(next, deck, info);
    refit(next);
    return { ok: true, parts: next, added, removed: [], kind: 'extend', deck: deck.name, cols: cols(f1 - f0), grew: cols(fresh.reduce((n, [a, b]) => n + b - a, 0)), span: [f0, f1], hint: `${deck.name} made ${cols(fresh.reduce((n, [a, b]) => n + b - a, 0))} column(s) longer.` };
  }
  // A new deck. The very first deck of a ship (nothing to climb to yet) is simply accepted; any later one needs a way to the nearest deck above
  // and below it that it overlaps, so it can be reached: a ladder (a rope up to the crow's nest).
  const y = DECK_ROWS[row];
  const nestOf = (q) => isNestRow(rowOf(q));
  const linkable = L.platforms.filter((q) => ['catwalk', 'main', 'lower', ...KEEL_ROWS].includes(rowOf(q)) && q.y !== y);
  // (a high nest is climbed to from a nest below it only; a nest also reaches a high one above it; the top deck reaches the nests)
  const reachable = row === 'crow2' ? L.platforms.filter((q) => rowOf(q) === 'nest') : [...linkable, ...(row === 'catwalk' ? L.platforms.filter(nestOf) : []), ...(row === 'nest' ? L.platforms.filter((q) => rowOf(q) === 'crow2') : [])];
  const overlap = (q) => Math.min(q.x1, hi) - Math.max(q.x0, lo);
  const links = [];
  for (const above of [true, false]) { // the nearest deck above that it overlaps, and the nearest below
    const cands = reachable.filter((q) => (above ? q.y < y : q.y > y) && overlap(q) >= 80).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
    for (const q of cands) {
      const x = freeSpot(L, q.id, Math.max(q.x0, lo), Math.min(q.x1, hi), links.map((l) => l.x));
      if (x !== null) { links.push({ q, x, above }); break; }
    }
  }
  if (!links.length && (linkable.length || row === 'crow2')) return no(parts, 'A new deck needs a way to climb to the deck above (or below) it: draw it so it overlaps one, with a free spot for a ladder.');
  const id = uniqueId(next, info.id);
  const n = next.filter((p) => p.part === 'deck' && p.row === row).length;
  deck = { part: 'deck', id, row, name: info.name + (n ? ' ' + (n + 1) : ''), x0: lo, x1: hi, ...(info.outside ? { outside: true } : {}) };
  next.push(deck);
  coverRooms(next, deck, info);
  for (const l of links) {
    const top = l.above ? l.q.id : id, bottom = l.above ? id : l.q.id;
    next.push({ part: nestOf(l.q) || isNestRow(row) ? 'rope' : 'ladder', top, bottom, xTop: l.x, xBottom: l.x });
    added.push(`ladder to the ${l.q.name}`);
  }
  added.unshift(deck.name);
  refit(next);
  return { ok: true, parts: next, added, removed: [], kind: 'new', deck: deck.name, cols: cols(hi - lo), grew: cols(hi - lo), span: [lo, hi], hint: links.length ? `New ${deck.name}, ${cols(hi - lo)} columns, with a ladder to the ${links.map((l) => l.q.name).join(' and the ')}.` : `New ${deck.name}, ${cols(hi - lo)} columns: the first deck. Draw the next one under or over it and a ladder comes with it.` };
}

// ---- erasing ------------------------------------------------------------------------------------------------------
// What goes with a part that was taken away: a steam pipe leading to a gone engine / helm / lift, the coil or bomb-bay doors of a gone station, an escort's
// hook, and anything still pointing at a deck that no longer exists (a ladder from another deck ...). Their labels are added to `removed`.
function dropDependents(list, goneParts, removed) {
  const names = new Set(goneParts.map(nameOf).filter(Boolean));
  if (goneParts.some((o) => o.part === 'lift')) names.add('Lift');
  const kinds = new Set(goneParts.filter((o) => o.part === 'station').map((o) => o.kind));
  const dropMore = (o) => (o.part === 'pipe' && names.has(o.to)) || (o.part === 'coil' && kinds.has('coil')) || (o.part === 'bombBay' && kinds.has('bombBay')) || (o.part === 'escortDock' && names.has(o.n));
  const deckIds = new Set(list.filter((o) => o.part === 'deck').map((o) => o.id));
  const orphan = (o) => refs(o).some((r) => !deckIds.has(r.id)) || (o.part === 'room' && !deckIds.has(o.p));
  return list.filter((o) => {
    if (dropMore(o) || orphan(o)) { if (o.part !== 'room') removed.push(labelOf(o)); return false; }
    return true;
  });
}

// A crow's nest cut in two (or one that lost its ropes with the stretch rubbed out) must still be climbable: any nest-row deck with no rope or ladder of its own
// gets one to the nearest deck it overlaps below (the top deck; a high nest: the nest under it) at a free spot. Pushes the rope into `out`, a label into `added`.
function reconnectNests(out, added) {
  let L;
  try { L = buildLayout(out); } catch { return; }
  for (const q of L.platforms) {
    if (!isNestRow(rowOf(q))) continue;
    const di = L.platforms.indexOf(q);
    if (L.connectors.some((c) => c.top === di || c.bottom === di)) continue;
    const below = L.platforms.filter((o) => o.y > q.y && (rowOf(q) === 'crow2' ? rowOf(o) === 'nest' : rowOf(o) === 'catwalk') && Math.min(o.x1, q.x1) - Math.max(o.x0, q.x0) >= 80).sort((p, r) => p.y - r.y);
    for (const o of below) {
      const x = freeSpot(L, o.id, Math.max(o.x0, q.x0), Math.min(o.x1, q.x1));
      if (x === null) continue;
      out.push({ part: 'rope', top: q.id, bottom: o.id, xTop: x, xBottom: x });
      added.push(`rope from the ${q.name} to the ${o.name}`);
      break;
    }
  }
}

export function erase(parts, row, x0, x1) {
  if (row === 'gasbag') return eraseBag(parts, x0, x1);
  const info = rowInfo(row);
  if (!info) return no(parts, 'There is no deck row there.');
  const a = Math.round(Math.min(x0, x1)), b = Math.round(Math.max(x0, x1));
  if (b - a < 20) return no(parts, 'Drag along a deck to rub it out.');
  const targets = decksOn(parts, row).filter((d) => d.x0 < b && d.x1 > a);
  if (!targets.length) return no(parts, 'There is no deck there to erase.');
  const next = clone(parts);
  const removed = []; // parts taken off the ship (labels come from labelOf)
  const gone = new Set(); // indexes into `next` of parts removed
  const margin = BE().ERASE_MARGIN, minPiece = BE().MIN_PIECE;
  for (const t of targets) {
    const d = next.find((o) => o.part === 'deck' && o.id === t.id);
    let c0 = Math.max(a, d.x0), c1 = Math.min(b, d.x1);
    if (c0 - d.x0 < minPiece) c0 = d.x0; // never leave a sliver: clear to the end instead
    if (d.x1 - c1 < minPiece) c1 = d.x1;
    const pieces = []; // what is left of the deck: [x0, x1]
    if (c0 > d.x0) pieces.push([d.x0, c0]);
    if (c1 < d.x1) pieces.push([c1, d.x1]);
    if (pieces.length === 2 && !info.split) return no(parts, `The ${d.name} cannot be cut in the middle: erase from one end.`);
    const ids = pieces.map((_, i) => (i === 0 ? d.id : uniqueId(next, d.id)));
    if (pieces.length === 2) {
      // the far piece becomes its own deck (it keeps the name, gets a new id) and whatever stood on it moves over
      const right = { ...d, id: ids[1], x0: pieces[1][0], x1: pieces[1][1] };
      next.push(right);
    }
    if (pieces.length === 0) { gone.add(next.indexOf(d)); removed.push(labelOf(d)); } else { d.x0 = pieces[0][0]; d.x1 = pieces[0][1]; }
    // Things standing on this deck.
    next.forEach((o, i) => {
      if (gone.has(i) || o.part === 'deck') return;
      if (o.part === 'room') {
        if (o.p !== d.id) return;
        const bits = pieces.map(([p0, p1], k) => ({ x0: Math.max(o.x0, p0), x1: Math.min(o.x1, p1), k })).filter((s) => s.x1 - s.x0 >= 24);
        if (!bits.length) { gone.add(i); return; }
        Object.assign(o, { x0: bits[0].x0, x1: bits[0].x1, p: pieces.length === 2 ? (bits[0].k === 0 ? d.id : ids[1]) : d.id });
        for (const s of bits.slice(1)) next.push({ ...o, x0: s.x0, x1: s.x1, p: s.k === 0 ? d.id : ids[1] });
        return;
      }
      const rs = refs(o).filter((r) => r.id === d.id);
      if (!rs.length) return;
      const hit = pieces.length === 0 || rs.some((r) => r.x > c0 - margin && r.x < c1 + margin);
      if (hit) { gone.add(i); removed.push(labelOf(o)); return; }
      if (pieces.length === 2) for (const r of rs) if (r.x >= pieces[1][0]) r.to(ids[1]);
    });
  }
  // Things that went with their owners (the steam pipe of an engine or the helm, the lift's pipe, the coil emitter, the bomb bay doors ...), and anything left on a deck that is gone.
  const goneParts = next.filter((o, i) => gone.has(i));
  let out = dropDependents(next.filter((o, i) => !gone.has(i)), goneParts, removed);
  const added = [];
  if (isNestRow(row)) reconnectNests(out, added); // (a nest cut in two: each half gets a rope down if it lost its own)
  refit(out);
  const cut = targets.reduce((n, d) => n + Math.min(b, d.x1) - Math.max(a, d.x0), 0);
  return { ok: true, parts: out, added, removed, kind: 'erase', deck: targets.map((d) => d.name).join(', '), cols: cols(cut), span: [a, b], hint: `Erased ${cols(cut)} column(s) of ${targets.map((d) => d.name).join(', ')}.${removed.length ? ' removed: ' + summarize(removed) : ''}` };
}

/// ---- the gasbags -------------------------------------------------------------------------------------------------------
// A ship may have any number of bags side by side on the gasbag row (BAGS_MAX): four small ones so that losing one leaves three, or one giant one. Each is a
// `gasbag` part { cx, cy, rx, ry, twin? } (rx = half its length, between BAG_MIN and BAG_MAX); two bags never overlap. Bags are numbered from the tail (0) to the nose.
const bagParts = (parts) => parts.filter((p) => p.part === 'gasbag').sort((a, b) => a.cx - b.cx);
const bagOf = (parts) => bagParts(parts).reduce((best, b) => (!best || b.rx > best.rx ? b : best), null); // the biggest (the main bag; the twin envelope rides on it)
const bagSpan = (b) => [b.cx - b.rx, b.cx + b.rx];
const bagHalf = (a, b) => Math.max(BE().BAG_MIN, Math.min(BE().BAG_MAX, Math.round((b - a) / 20) * 10)); // the half-length a dragged span means
// Where a bag at `self` may reach: the free stretch between its neighbours, as [from, to] (infinite when nothing is beside it).
function bagRoom(bags, self, mid) {
  let from = -Infinity, to = Infinity;
  for (const b of bags) {
    if (b === self) continue;
    const [a, z] = bagSpan(b);
    if (b.cx <= mid) from = Math.max(from, z); else to = Math.min(to, a);
  }
  return [from, to];
}
const bagText = (b) => `${Math.round(b.rx * 2)} px long`;

// A span dragged along the gasbag row. Crossing one bag it resizes that bag to the new ends (kept clear of its neighbours); across two it is refused; on empty
// row space it draws a NEW bag there (at least BAG_MIN each way, kept clear of the bags beside it).
export function drawBag(parts, x0, x1) {
  const lo = Math.round(Math.min(x0, x1)), hi = Math.round(Math.max(x0, x1));
  if (hi - lo < 40) return no(parts, 'Drag along the gasbag row to draw a bag (as long as you like; draw more beside it for a row of bags).');
  const next = clone(parts);
  const bags = bagParts(next);
  const hits = bags.filter((b) => Math.min(b.cx + b.rx, hi) - Math.max(b.cx - b.rx, lo) > 20);
  ensureFrame(next);
  let hint;
  if (hits.length > 1) return no(parts, `That stroke crosses ${hits.length} bags: drag along one bag to resize it, or in the empty space beside them to add another.`);
  if (hits.length === 1) {
    const bag = hits[0];
    const [from, to] = bagRoom(bags, bag, bag.cx);
    const a = Math.max(lo, from), b = Math.min(hi, to);
    if (b - a < 2 * BE().BAG_MIN) return no(parts, 'The neighbouring bags leave no room for a bag that short.');
    bag.rx = Math.min(bagHalf(a, b), Math.floor((b - a) / 2));
    bag.cx = Math.round((a + b) / 2);
    hint = `Gasbag now ${bagText(bag)}.`;
  } else {
    if (bags.length >= BE().BAGS_MAX) return no(parts, `A ship has at most ${BE().BAGS_MAX} gasbags.`);
    const [from, to] = bagRoom(bags, null, (lo + hi) / 2);
    let a = Math.max(lo, from), b = Math.min(hi, to);
    if (b - a < 2 * BE().BAG_MIN) { // too short a stroke: grow it to the shortest bag that fits in the room
      if (to - from < 2 * BE().BAG_MIN) return no(parts, `No room for a bag there: the bags beside it leave less than ${2 * BE().BAG_MIN} px.`);
      const c = (a + b) / 2;
      a = Math.max(from, Math.min(c - BE().BAG_MIN, to - 2 * BE().BAG_MIN));
      b = a + 2 * BE().BAG_MIN;
    }
    const rx = Math.min(bagHalf(a, b), Math.floor((b - a) / 2));
    next.push({ part: 'gasbag', cx: Math.round((a + b) / 2), cy: BE().BAG_CY, rx, ry: BE().BAG_RY });
    hint = bags.length ? `Gasbag ${bags.length + 1} drawn beside the others: ${rx * 2} px long. Each bag has its own gas; lose one and the rest still lift.` : `Gasbag drawn: ${rx * 2} px long.`;
  }
  refit(next);
  return { ok: true, parts: next, added: ['gasbag'], removed: [], kind: 'bag', cols: 0, hint };
}
// Move one end of bag i (numbered tail to nose; side 'x0' = the tail end, 'x1' = the nose end) to x. Kept clear of its neighbours and within BAG_MIN..BAG_MAX.
export function resizeBag(parts, i, side, x) {
  const next = clone(parts);
  const bags = bagParts(next), bag = bags[i];
  if (!bag) return no(parts, 'There is no such gasbag.');
  const [from, to] = bagRoom(bags, bag, bag.cx);
  let [a, b] = bagSpan(bag);
  if (side === 'x0') a = Math.max(from, Math.min(Math.round(x), b - 2 * BE().BAG_MIN)); else b = Math.min(to, Math.max(Math.round(x), a + 2 * BE().BAG_MIN));
  const rx = Math.min(BE().BAG_MAX, Math.floor((b - a) / 20) * 10);
  if (rx === bag.rx && Math.round((a + b) / 2) === bag.cx) return no(parts, 'That end cannot move there (a neighbouring bag, or the shortest bag).');
  bag.rx = rx;
  bag.cx = side === 'x0' ? Math.round(b - rx) : Math.round(a + rx);
  refit(next);
  return { ok: true, parts: next, added: [], removed: [], kind: 'bag', cols: 0, hint: `Gasbag ${i + 1} now ${bagText(bag)}.` };
}
// Rub out the bags under a stroke (those it crosses; a click inside one rubs out that one). Nothing under it: refused. Erasing a bag takes its twin envelope too.
function eraseBag(parts, x0 = -Infinity, x1 = Infinity) {
  const a = Math.min(x0, x1), b = Math.max(x0, x1);
  const gone = bagParts(parts).filter((p) => (b - a < 20 ? a >= p.cx - p.rx && a <= p.cx + p.rx : Math.min(p.cx + p.rx, b) - Math.max(p.cx - p.rx, a) > 20));
  if (!gone.length) return no(parts, bagParts(parts).length ? 'Drag the eraser across a gasbag to rub it out.' : 'There is no gasbag to erase.');
  const out = clone(parts).filter((p) => !gone.some((g) => g.cx === p.cx && p.part === 'gasbag'));
  refit(out);
  const removed = gone.map(() => 'gasbag');
  return { ok: true, parts: out, added: [], removed, kind: 'erase', deck: 'gasbag', cols: 0, hint: `Erased ${gone.length === 1 ? 'the gasbag' : gone.length + ' gasbags'}. removed: ${summarize(removed)}` };
}
// grow: +1 / -1 = one column (BAG_STEP of half-length) longer / shorter. twin: true / false / 'toggle' = the second envelope. Both act on the biggest bag.
// A ship with no bag gets one (grow +1) sized to cover her decks.
export function setBag(parts, { grow = 0, twin } = {}) {
  const next = clone(parts);
  const bags = bagParts(next);
  let bag = bags.reduce((best, b) => (!best || b.rx > best.rx ? b : best), null);
  if (!bag) {
    if (grow <= 0) return no(parts, 'This ship has no gasbag: draw one with the Gasbag tool (or press Bag +).');
    const decks = parts.filter((p) => p.part === 'deck' && !['nest', 'helm'].includes(p.row));
    const d0 = decks.length ? Math.min(...decks.map((p) => p.x0)) : 0, d1 = decks.length ? Math.max(...decks.map((p) => p.x1)) : 2 * BE().BAG_DROP;
    return drawBag(parts, d0 - 40, d1 + 40);
  }
  if (grow) {
    const [from, to] = bagRoom(bags, bag, bag.cx);
    const rx = Math.max(BE().BAG_MIN, Math.min(BE().BAG_MAX, bag.rx + grow * BE().BAG_STEP, bag.cx - from, to - bag.cx));
    if (rx === bag.rx) return no(parts, grow > 0 ? (bags.length > 1 ? 'The gasbag is as long as it gets here (the bags beside it touch).' : 'The gasbag is as long as it gets.') : 'The gasbag is as short as it gets.');
    bag.rx = rx;
  }
  if (twin !== undefined) bag.twin = twin === 'toggle' ? !bag.twin : !!twin;
  refit(next);
  return { ok: true, parts: next, added: [], removed: [], kind: 'bag', cols: 0, hint: `${bags.length > 1 ? 'The biggest gasbag is ' : 'Gasbag '}${bagText(bag)}${bag.twin ? ', with a twin envelope' : ''}.` };
}

// ---- dropping a part from the tray (S.5d) ----------------------------------------------------------------------------------
// The part picture is dropped at (x, y) in ship coordinates: the nearest LEGAL slot of that palette type within `maxDist` takes it (slots are buildSlots.js's:
// the same ones the click-a-pin way uses). Returns { ok, parts, hint, slot, kind: 'place', type } or { ok: false, hint: why not }. Pure: the input is never touched.
export function placePart(parts, type, x, y, { maxDist = BE().DROP_REACH } = {}) {
  const slot = pickSlot(slotsFor(type, parts), x, y, maxDist);
  if (!slot) return no(parts, whyNot(parts, type, x, y));
  const next = slot.apply(parts);
  return { ok: true, parts: next, added: [slot.label], removed: [], kind: 'place', type, slot, hint: slot.label };
}

// ---- ladders and deleting single things ---------------------------------------------------------------------------------
const deckYs = (parts) => Object.fromEntries(parts.filter((p) => p.part === 'deck').map((d) => [d.id, DECK_ROWS[d.row]]));
const deckAtX = (parts, row, x) => parts.find((p) => p.part === 'deck' && p.row === row && x >= p.x0 - 10 && x <= p.x1 + 10);
// A ladder / slide pole / rope drawn straight down from one deck row to another at x (the two rows may be given in either order). Snaps x to 10 px and
// keeps it inside the stretch both decks share. Refused (with a hint) when there is no deck at both ends, a deck lies between, or something is in the way.
export function placeConnector(parts, x, rowA, rowB, type = 'ladder') {
  if (!['ladder', 'pole', 'rope'].includes(type)) return no(parts, 'A connector is a ladder, a slide pole or a rope.');
  if (DECK_ROWS[rowA] == null || DECK_ROWS[rowB] == null) return no(parts, 'Draw the ladder from one deck down to another: start and end the drag on a deck.');
  if (DECK_ROWS[rowA] === DECK_ROWS[rowB]) return no(parts, 'A ladder joins two different decks: drag up or down, not along.');
  const [topRow, botRow] = DECK_ROWS[rowA] < DECK_ROWS[rowB] ? [rowA, rowB] : [rowB, rowA];
  const t = deckAtX(parts, topRow, x), b = deckAtX(parts, botRow, x);
  const label = (row) => (EDIT_ROWS[row] ? EDIT_ROWS[row].name : row);
  if (!t || !b) return no(parts, `No deck at both ends: there is no ${!t ? label(topRow) : label(botRow)} at that spot. Start and end the drag on decks.`);
  const lo = Math.max(t.x0, b.x0) + 14, hi = Math.min(t.x1, b.x1) - 14;
  if (hi < lo) return no(parts, `The ${t.name} and the ${b.name} do not overlap there: a ladder needs both decks over each other.`);
  const px = Math.max(lo, Math.min(hi, Math.round(x / 10) * 10));
  const ys = deckYs(parts);
  const between = parts.find((p) => p.part === 'deck' && p !== t && p !== b && ys[p.id] > ys[t.id] && ys[p.id] < ys[b.id] && px >= p.x0 - 5 && px <= p.x1 + 5);
  if (between) return no(parts, `The ${between.name} is in the way: join ${t.name} to it, and it to ${b.name}.`);
  const gap = config.BUILD_CHECK.MIN_GAP;
  const twin = parts.find((p) => LINK.includes(p.part) && p.top === t.id && p.bottom === b.id && Math.abs(p.xTop - px) < gap);
  if (twin) return no(parts, `There is already a ${twin.part} there (keep them ${gap} px apart).`);
  const mate = parts.find((p) => (p.part === 'station' || p.part === 'gun' || p.part === 'searchlight' || p.part === 'sail' || p.part === 'engine') && ((p.p === t.id || p.p === b.id)) && Math.abs(p.x - px) < 26);
  if (mate) return no(parts, `${nameOf(mate)} is in the way: slide the ladder along a little.`);
  const next = clone(parts);
  ensureFrame(next);
  next.push({ part: type, top: t.id, bottom: b.id, xTop: px, xBottom: px });
  refit(next);
  return { ok: true, parts: next, added: [`${type} ${t.name} to ${b.name}`], removed: [], kind: 'connector', type, x: px, top: t.id, bottom: b.id, hint: `${type[0].toUpperCase()}${type.slice(1)} from the ${t.name} down to the ${b.name}${type === 'pole' ? ' (one way: down)' : ''}.` };
}

// The single placed thing nearest a point (ship coordinates), within reach of it: { index, label, x, y, r } or null. Decks, rooms, the frame and the gasbag are not
// "things" (the pencil and eraser take those); the coil emitter and bomb-bay doors go with their station.
export function thingAt(parts, x, y, slop = 0) {
  const ys = deckYs(parts);
  const dy = (id) => (ys[id] != null ? ys[id] : null);
  let best = null;
  const consider = (index, o, label, cx, cy, r) => {
    r += slop; // (the page adds a few screen pixels so a thin ladder is easy to hit)
    const d = Math.hypot(cx - x, cy - y) / r;
    if (d <= 1 && (!best || d < best.d)) best = { index, label, x: cx, y: cy, r, d };
  };
  parts.forEach((o, index) => {
    if (o.part === 'deck') return;
    if (LINK.includes(o.part)) {
      const y0 = dy(o.top), y1 = dy(o.bottom);
      if (y0 == null || y1 == null) return;
      const vx = o.xBottom - o.xTop, vy = y1 - y0, len2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((x - o.xTop) * vx + (y - y0) * vy) / len2));
      const px = o.xTop + vx * t, py = y0 + vy * t;
      consider(index, o, labelOf(o), px, py, 18);
      return;
    }
    if (o.part === 'pipe') { consider(index, o, labelOf(o), o.valve[0], o.valve[1], 20); return; }
    const base = dy(o.p);
    if (base == null || o.x == null) return;
    switch (o.part) {
      case 'station': case 'gun': case 'searchlight': case 'sail': consider(index, o, labelOf(o), o.x, base - 11, 18); break;
      case 'engine': consider(index, o, labelOf(o), o.x, base + 14, 18); break;
      case 'rack': case 'vent': case 'gasValve': case 'extinguisher': case 'boarderEntry': consider(index, o, labelOf(o), o.x, base - 5, 14); break;
      case 'medbay': consider(index, o, labelOf(o), o.x, base - 8, 18); break;
      case 'ballast': consider(index, o, labelOf(o), o.x, base + (o.hang ? config.BALANCE.BALLAST_HANG : -8), 16); break;
      default: break;
    }
  });
  return best ? { index: best.index, label: best.label, x: best.x, y: best.y, r: best.r } : null;
}
// Delete the single thing under a point (and what only exists for it: an engine's pipe, a gone station's doors ...). Undo puts it back.
export function removeAt(parts, x, y, slop = 0) {
  const t = thingAt(parts, x, y, slop);
  if (!t) return no(parts, 'Nothing to delete there: click right on a ladder, a station, a gun, a rack, a vent, a sandbag ... (decks go with the eraser).');
  const gone = parts[t.index];
  const removed = [t.label];
  const out = dropDependents(parts.filter((o, i) => i !== t.index).map((o) => ({ ...o })), [gone], removed);
  refit(out);
  return { ok: true, parts: out, added: [], removed, kind: 'delete', deck: t.label, thing: t, cols: 0, hint: `Deleted ${t.label}.${removed.length > 1 ? ' removed: ' + summarize(removed) : ''}` };
}
