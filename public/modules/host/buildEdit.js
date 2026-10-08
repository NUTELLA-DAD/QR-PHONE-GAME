// Blueprint editing (Phase S.5b): draw a deck, erase a deck, lengthen the gasbag. PURE and Node-safe: each function takes a list of
// parts (shipBuild.js) and returns a NEW list with a short report, never touching the one it was given. The dev page's blueprint
// view (buildTest.js) uses them, and so can the in-game Shipwright's Yard (S.6b) and the random batch.
//
//   drawDeck(parts, row, x0, x1)   a line drawn along a deck ROW (EDIT_ROWS): along an existing deck it makes it longer, on an empty
//                                  stretch it makes a new deck (rooms for the hull to enclose, plus a ladder to the nearest deck so it can be reached)
//   erase(parts, row, x0, x1)      rub out a stretch of deck: it gets shorter, splits in two, or goes; whatever stood on the rubbed-out stretch
//                                  (stations, guns, racks, ladders, vents, pipes ...) goes with it and is listed in `removed`
//   setBag(parts, { grow, twin })  the gasbag a column (BAG_STEP) longer or shorter, or the twin envelope on / off
// Result: { ok, parts, hint, added: [labels], removed: [labels], cols, deck, kind }. ok false = nothing changed and `hint` says why.
// The result may well FAIL validate() (erase the last boiler ...): that is the editor's job to show, not to prevent.
import { buildLayout, BUILDS, COL, DECK_ROWS, KEEL_ROWS, rowOf } from './shipBuild.js';
import { config } from '../../config.js';

export const GRID_X0 = 20; // the column grid: lines at GRID_X0 + k x COL (the classic main and lower decks' aft ends sit on it)

// The rows a deck can be drawn on (top to bottom). hull: its rooms are inside the gondola hull (the art encloses them);
// split: an erase may cut it in two; multi: more than one deck can share the row (the others are single decks that get longer or shorter).
export const EDIT_ROWS = {
  nest: { id: 'nest', name: "Crow's Nest", outside: true, hull: false, split: false, multi: false },
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

// ---- what a part is tied to ------------------------------------------------------------------------------------
// refs(o): the (deck id, x) points a part stands on, each with a setter to move it to another deck. Pieces that stand on a deck are
// removed when that stretch of deck is erased; connectors have two ends, the lift also its repair spot.
const POINT = ['station', 'gun', 'searchlight', 'engine', 'rack', 'vent', 'extinguisher', 'boarderEntry', 'escortDock', 'medbay'];
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
    case 'station': case 'gun': case 'searchlight': return o.n;
    case 'engine': return o.name;
    case 'rack': return `${o.kind} rack`;
    case 'ladder': case 'rope': case 'stairs': case 'pole': case 'lift': return o.part;
    case 'pipe': return `steam pipe to ${o.to}`;
    case 'vent': return 'steam vent';
    case 'extinguisher': return 'extinguisher';
    case 'boarderEntry': return 'boarding point';
    case 'escortDock': return `escort hook ${o.n}`;
    case 'medbay': return 'medbay';
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
export function snapX(parts, x) {
  let best = null;
  for (const p of parts) if (p.part === 'deck') for (const e of [p.x0, p.x1]) if (Math.abs(e - x) <= BE().SNAP_X && (best === null || Math.abs(e - x) < Math.abs(best - x))) best = e;
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
function freeSpot(L, p, lo, hi) {
  const gap = config.BUILD_CHECK.MIN_GAP + 15, near = config.TOOLS.REACH + 5;
  const q = L.platforms.find((d) => d.id === p), di = L.platforms.indexOf(q);
  const clear = (x, strict) => {
    if ([...L.stations, ...L.engines].some((s) => s.p === p && Math.abs(s.x - x) < gap)) return false;
    if (!strict) return true;
    if ([...L.racks, ...L.vents, ...L.extinguishers].some((o) => o.p === p && Math.abs(o.x - x) < near)) return false;
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
  const bag = L.gasbag;
  if (row === 'nest' && bag) {
    const reach = bag.rx * BE().BAG_COVER;
    if (lo < bag.cx - reach || hi > bag.cx + reach) return no(parts, "The crow's nest sits on top of the gasbag: keep it over the bag (make the bag longer first).");
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
  // A new deck: it needs a way up or down, so it must sit under (or over) a deck it can climb to.
  const y = DECK_ROWS[row];
  const linkable = L.platforms.filter((q) => ['catwalk', 'main', 'lower', ...KEEL_ROWS].includes(rowOf(q)) && q.y !== y);
  const overlap = (q) => Math.min(q.x1, hi) - Math.max(q.x0, lo);
  let parent = null;
  for (const above of [true, false]) { // the nearest deck above that it overlaps, else the nearest below
    const cands = linkable.filter((q) => (above ? q.y < y : q.y > y) && overlap(q) >= 80).sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
    for (const q of cands) {
      const x = freeSpot(L, q.id, Math.max(q.x0, lo), Math.min(q.x1, hi));
      if (x !== null) { parent = { q, x, above }; break; }
    }
    if (parent) break;
  }
  if (!parent) return no(parts, 'A new deck needs a way to climb to the deck above (or below) it: draw it so it overlaps one, with a free spot for a ladder.');
  const id = uniqueId(next, info.id);
  const n = next.filter((p) => p.part === 'deck' && p.row === row).length;
  deck = { part: 'deck', id, row, name: info.name + (n ? ' ' + (n + 1) : ''), x0: lo, x1: hi, ...(info.outside ? { outside: true } : {}) };
  next.push(deck);
  coverRooms(next, deck, info);
  const top = parent.above ? parent.q.id : id, bottom = parent.above ? id : parent.q.id;
  next.push({ part: row === 'nest' ? 'rope' : 'ladder', top, bottom, xTop: parent.x, xBottom: parent.x });
  added.push(`${deck.name}`, `ladder to the ${parent.q.name}`);
  refit(next);
  return { ok: true, parts: next, added, removed: [], kind: 'new', deck: deck.name, cols: cols(hi - lo), grew: cols(hi - lo), span: [lo, hi], hint: `New ${deck.name}, ${cols(hi - lo)} columns, with a ladder up to the ${parent.q.name}.` };
}

// ---- erasing ------------------------------------------------------------------------------------------------------
export function erase(parts, row, x0, x1) {
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
  // Things that went with their owners: the steam pipe of a gun-less ... engine or helm, the lift's pipe, the coil emitter, the bomb bay doors.
  let out = next.filter((o, i) => !gone.has(i));
  const goneParts = next.filter((o, i) => gone.has(i));
  const names = new Set(goneParts.map(nameOf).filter(Boolean));
  if (goneParts.some((o) => o.part === 'lift')) names.add('Lift');
  const kinds = new Set(goneParts.filter((o) => o.part === 'station').map((o) => o.kind));
  const dropMore = (o) => (o.part === 'pipe' && names.has(o.to)) || (o.part === 'coil' && kinds.has('coil')) || (o.part === 'bombBay' && kinds.has('bombBay'));
  // Anything left pointing at a deck that no longer exists (a ladder from another deck ...) goes too.
  const deckIds = new Set(out.filter((o) => o.part === 'deck').map((o) => o.id));
  const orphan = (o) => refs(o).some((r) => !deckIds.has(r.id)) || (o.part === 'room' && !deckIds.has(o.p));
  out = out.filter((o) => {
    if (dropMore(o) || orphan(o)) { if (o.part !== 'room') removed.push(labelOf(o)); return false; }
    return true;
  });
  refit(out);
  const cut = targets.reduce((n, d) => n + Math.min(b, d.x1) - Math.max(a, d.x0), 0);
  return { ok: true, parts: out, added: [], removed, kind: 'erase', deck: targets.map((d) => d.name).join(', '), cols: cols(cut), span: [a, b], hint: `Erased ${cols(cut)} column(s) of ${targets.map((d) => d.name).join(', ')}.${removed.length ? ' removed: ' + summarize(removed) : ''}` };
}

// ---- the gasbag ------------------------------------------------------------------------------------------------------
// grow: +1 / -1 = one column (BAG_STEP of half-length) longer / shorter. twin: true / false / 'toggle' = the second envelope.
export function setBag(parts, { grow = 0, twin } = {}) {
  const next = clone(parts);
  const bag = next.find((p) => p.part === 'gasbag');
  if (!bag) return no(parts, 'This ship has no gasbag.');
  if (grow) {
    const rx = Math.max(BE().BAG_MIN, Math.min(BE().BAG_MAX, bag.rx + grow * BE().BAG_STEP));
    if (rx === bag.rx) return no(parts, grow > 0 ? 'The gasbag is as long as it gets.' : 'The gasbag is as short as it gets.');
    bag.rx = rx;
  }
  if (twin !== undefined) bag.twin = twin === 'toggle' ? !bag.twin : !!twin;
  refit(next);
  return { ok: true, parts: next, added: [], removed: [], kind: 'bag', cols: 0, hint: `Gasbag ${bag.rx * 2} px long${bag.twin ? ', with a twin envelope' : ''}.` };
}
