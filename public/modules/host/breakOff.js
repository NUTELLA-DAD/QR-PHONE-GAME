// PARTS BREAK OFF FOR REAL (Phase S.5i): the PURE half. Node-safe, no live ship. Given a ship's parts list and where something struck her, planBreak() works out which parts come away and
// returns the NEW parts list (what is left, plus a SCAR for every hole the missing parts leave), with a report of what went. shipSim.js breakOff() applies it to a flying ship; debris.js
// tumbles the pieces; the sky-dock REBUILD cards bring the old parts list back.
//
//   planBreak(parts, spec, rng)    spec = { kind: 'blast', x, y, r }                 a bomb bay going up: every deck stretch, room, gun, engine and rack within r px of (x, y) is blown off
//                                          { kind: 'limb', x, y, reach, len }        a heavy hit / crash / ram at (x, y): the end or limb that took it (a small deck - a belly pod, a
//                                                                                    nest - whole; the end of a big deck, `len` px of it)
//                                          { kind: 'part', name }                    the limb a named station or engine stands on
//                                          { kind: 'bag', index }                    gasbag number `index` (tail to nose) tears away
//   returns { ok, hint, parts, labels, summary, cuts, pieces, scars, bags, mass, lift, deckPx, names }
//     cuts    the deck stretches that went: { id, y, a, b, x0, x1, whole } (ship coordinates; id is the deck as it was BEFORE, so crew standing there can be found)
//     pieces  the debris: { clips: [{ x0, y0, x1, y1 }], box, ellipse? } - one per cluster of holes (and one per lost bag)
//     names   the stations, guns and engines that went (by name)
//     sigs    the partRects signatures (shipBuild.js) of what is LEFT: shipSim.js breakOff diffs them with the old layout's to tell the 3D view which parts are gone
//   rebuildPrice(plan)             what mending it costs at a sky-dock
//   makeRng(seed)                  a small seeded random source: the break-off rolls use their own, so a run with no break-off draws exactly the random numbers it always did
// A ship is never left with no deck or no gasbag (she keeps what the S.5e minimum ship needs). Anything the cut leaves hanging with no way to it falls too.
import { buildLayout, budgets, rowOf, DECK_ROWS, bagCover } from './shipBuild.js';
import { refs, labelOf, dropDependents, summarize } from './buildEdit.js';
import { config } from '../../config.js';

const BO = () => config.BREAKOFF;

// The one global layout (ship 0's, shipLayout.js SHIP_LAYOUT) outlives a simulation in a tool that makes several in one process: what a layout wears after a break-off, and what she was before it,
// so ships.js createMainShip can mend her when the next simulation is made. layout -> { broken: the parts list she wears, intact: the list before her first break-off }.
export const brokenOf = new WeakMap();
const DECK_PARTS = ['deck', 'enemyDeck'];
const isDeck = (o) => DECK_PARTS.includes(o.part);
const deckPartY = (p) => (p.y != null ? p.y : DECK_ROWS[p.row]);
const WHOLE_ROWS = ['belly', 'bay', 'helm', 'nest', 'crow2']; // small decks: they go whole
const nameOf = (o) => o.n || o.name;

export function makeRng(seed) { // mulberry32
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The box of picture a deck's stuff takes (ship coordinates): from the top of whatever stands on it down to its floor (and the hull skin under it when nothing is below).
export function slabOf(q, platforms) {
  const row = rowOf(q), y = q.y;
  if (row === 'nest' || row === 'crow2') return { y0: y - 190, y1: y + 22 };
  if (row === 'catwalk') return { y0: y - 190, y1: y + 26 };
  if (row === 'helm') return { y0: y - 125, y1: y + 20 };
  if (row === 'belly') return { y0: y - 60, y1: y + 85 };
  if (row === 'bay') return { y0: y - 125, y1: y + 40 };
  const below = platforms.some((o) => o !== q && o.y > y && o.y - y < 200 && o.x1 > q.x0 && o.x0 < q.x1 && !WHOLE_ROWS.includes(rowOf(o)));
  return { y0: y - 165, y1: y + (below ? 8 : 42) };
}

// Is every px of [a, b] on deck d covered by armour plate?
function platedAll(L, d, a, b) {
  const plates = (L.armour || []).filter((p) => p.d === d).sort((p, q) => p.x0 - q.x0);
  let at = a;
  for (const p of plates) { if (p.x0 > at + 4) break; at = Math.max(at, p.x1); }
  return at >= b - 4;
}

// ---- cutting decks out of a parts list ----
const uniqueDeckId = (parts, base) => {
  const used = new Set(parts.filter(isDeck).map((p) => p.id));
  let id = base, k = 2;
  while (used.has(id)) id = base + k++;
  return id;
};

// Take the stretch [a, b] out of deck `id` of `next` (mutating it; `gone` collects the parts removed). Whatever stands on the stretch goes; rooms and plate keep what is left of them; the far
// piece of a deck cut in two becomes a deck of its own and the things on it move over. Returns false when there was nothing to cut.
function cutDeck(next, gone, rep, id, a, b) {
  const d = next.find((o) => isDeck(o) && o.id === id && !gone.has(o));
  if (!d) return false;
  const margin = config.BUILD_EDIT.ERASE_MARGIN, minPiece = BO().STUB;
  let c0 = Math.max(a, d.x0), c1 = Math.min(b, d.x1);
  if (c1 - c0 < 1) return false;
  if (c0 - d.x0 < minPiece) c0 = d.x0; // never leave a sliver of deck: clear to the end
  if (d.x1 - c1 < minPiece) c1 = d.x1;
  const pieces = [];
  if (c0 > d.x0) pieces.push([d.x0, c0]);
  if (c1 < d.x1) pieces.push([c1, d.x1]);
  const farId = pieces.length === 2 ? uniqueDeckId(next, d.id) : null;
  rep.cuts.push({ id: d.id, y: deckPartY(d), row: d.row, name: d.name, a: c0, b: c1, x0: d.x0, x1: d.x1, whole: pieces.length === 0, outside: !!d.outside });
  if (pieces.length === 2) next.push({ ...d, id: farId, x0: pieces[1][0], x1: pieces[1][1] });
  if (pieces.length === 0) { gone.add(d); rep.labels.push(labelOf(d)); } else { d.x0 = pieces[0][0]; d.x1 = pieces[0][1]; }
  next.forEach((o) => {
    if (gone.has(o) || isDeck(o)) return;
    if (o.part === 'room' || o.part === 'armour') { // (a room or a stretch of plate on the deck keeps what is left of its stretch)
      if (o.p !== d.id) return;
      const bits = pieces.map(([p0, p1], k) => ({ x0: Math.max(o.x0, p0), x1: Math.min(o.x1, p1), k })).filter((s) => s.x1 - s.x0 >= 24);
      if (!bits.length) { gone.add(o); if (o.part === 'armour') rep.labels.push(labelOf(o)); return; }
      Object.assign(o, { x0: bits[0].x0, x1: bits[0].x1, p: pieces.length === 2 ? (bits[0].k === 0 ? d.id : farId) : d.id });
      for (const s of bits.slice(1)) next.push({ ...o, x0: s.x0, x1: s.x1, p: s.k === 0 ? d.id : farId });
      return;
    }
    const rs = refs(o).filter((r) => r.id === d.id);
    if (!rs.length) return;
    const hit = pieces.length === 0 || rs.some((r) => r.x > c0 - margin && r.x < c1 + margin);
    if (hit) { gone.add(o); rep.labels.push(labelOf(o)); if (nameOf(o) && (o.part === 'station' || o.part === 'gun' || o.part === 'engine' || o.part === 'searchlight' || o.part === 'sail' || o.part === 'crewCannon')) rep.names.push(nameOf(o)); return; }
    if (pieces.length === 2) for (const r of rs) if (r.x >= pieces[1][0]) r.to(farId);
  });
  return true;
}

// Apply a list of cuts { id, a, b } to a copy of `parts`; returns the new list (with the things that depended on what went also gone).
function applyCuts(parts, cuts, rep) {
  const next = parts.map((p) => ({ ...p }));
  const gone = new Set();
  for (const c of cuts) {
    const decksLeft = next.filter((o) => isDeck(o) && !gone.has(o)).length;
    const d = next.find((o) => isDeck(o) && o.id === c.id && !gone.has(o));
    if (!d) continue;
    if (decksLeft <= 1 && c.a <= d.x0 + 60 && c.b >= d.x1 - 60) continue; // (the last deck stays: a bag and a deck still drift)
    cutDeck(next, gone, rep, c.id, c.a, c.b);
  }
  const goneList = next.filter((o) => gone.has(o));
  return dropDependents(next.filter((o) => !gone.has(o)), goneList, rep.labels);
}

// Decks the cuts left with no way to the rest of the ship fall too (the helm mount whose ladder went, a belly pod hanging from a lost stretch of deck).
function sweepOrphans(out, rep, wasWhole) {
  if (!wasWhole) return out;
  for (let pass = 0; pass < 4; pass++) {
    let L;
    try { L = buildLayout(out); } catch { return out; }
    const P = L.platforms;
    if (P.length < 2) return out;
    const up = P.map((_, i) => i);
    const find = (i) => (up[i] === i ? i : (up[i] = find(up[i])));
    for (const c of L.connectors) if (c.top >= 0 && c.bottom >= 0) up[find(c.top)] = find(c.bottom);
    const size = new Map();
    P.forEach((q, i) => size.set(find(i), (size.get(find(i)) || 0) + q.x1 - q.x0));
    let main = -1;
    for (const [k, v] of size) if (main < 0 || v > size.get(main)) main = k;
    const lost = P.filter((q, i) => find(i) !== main);
    if (!lost.length) return out;
    for (const q of lost) out = applyCuts(out, [{ id: q.id, a: -1e9, b: 1e9 }], rep);
  }
  return out;
}

// Are all the decks of this ship one piece (connected by ladders, ropes, stairs, poles and lifts)?
function connected(L) {
  const P = L.platforms;
  if (P.length < 2) return true;
  const up = P.map((_, i) => i);
  const find = (i) => (up[i] === i ? i : (up[i] = find(up[i])));
  for (const c of L.connectors) if (c.top >= 0 && c.bottom >= 0) up[find(c.top)] = find(c.bottom);
  return P.every((_, i) => find(i) === find(0));
}

// ---- which cuts a cause makes ----
function blastCuts(L, spec, rng) {
  const { x: cx, y: cy, r: R } = spec, cuts = [];
  L.platforms.forEach((q, d) => {
    const s = slabOf(q, L.platforms);
    const dy = cy < s.y0 ? s.y0 - cy : cy > s.y1 ? cy - s.y1 : 0;
    if (dy >= R) return;
    const w = Math.sqrt(R * R - dy * dy);
    if (cx + w <= q.x0 || cx - w >= q.x1) return;
    const whole = WHOLE_ROWS.includes(rowOf(q));
    const a = whole ? q.x0 : Math.max(cx - w, q.x0), b = whole ? q.x1 : Math.min(cx + w, q.x1);
    if (!whole && platedAll(L, d, a, b) && rng() < BO().BAY.ARMOUR_HOLD) return; // (riveted plate along the whole stretch holds)
    cuts.push({ id: q.id, a, b, dist: dy });
  });
  return cuts.sort((p, q) => p.dist - q.dist);
}

// The limb at (x, y): the nearest small deck within `reach` (whole), or the end of a big deck within END_REACH of it (`len` px).
function limbCut(L, spec) {
  const { x, y } = spec, reach = spec.reach ?? BO().HIT.END_REACH, len = spec.len ?? BO().HIT.LIMB;
  let best = null;
  const consider = (c, dist) => { if (!best || dist < best.dist) best = { ...c, dist }; };
  L.platforms.forEach((q) => {
    const s = slabOf(q, L.platforms);
    const dy = y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0;
    if (WHOLE_ROWS.includes(rowOf(q))) {
      const dx = x < q.x0 - 30 ? q.x0 - 30 - x : x > q.x1 + 30 ? x - q.x1 - 30 : 0;
      const dist = Math.hypot(dx, dy);
      if (dist < Math.min(reach, 110)) consider({ id: q.id, a: q.x0, b: q.x1 }, dist);
      return;
    }
    if (dy > 110) return;
    const dl = Math.abs(x - q.x0), dr = Math.abs(x - q.x1);
    if (dl < reach && dl <= dr) consider({ id: q.id, a: q.x0, b: Math.min(q.x1, q.x0 + len) }, Math.hypot(dl, dy));
    else if (dr < reach) consider({ id: q.id, a: Math.max(q.x0, q.x1 - len), b: q.x1 }, Math.hypot(dr, dy));
  });
  return best ? [best] : [];
}

// The cut that takes a NAMED station, gun or engine off the ship (the gates, botsim --breakoff): a small deck goes whole, else the stretch of its deck from the nearer end past it.
function partCut(L, name, len) {
  const s = L.stations.find((o) => o.n === name) || L.engines.find((o) => o.name === name);
  const q = s && L.platforms[s.d];
  if (!q) return null;
  if (WHOLE_ROWS.includes(rowOf(q))) return { id: q.id, a: q.x0, b: q.x1, dist: 0 };
  const reach = Math.max(80, (len || 0) / 2);
  return s.x - q.x0 <= q.x1 - s.x ? { id: q.id, a: q.x0, b: Math.min(q.x1, s.x + reach), dist: 0 } : { id: q.id, a: Math.max(q.x0, s.x - reach), b: q.x1, dist: 0 };
}

const scarFor = (cut, platforms) => {
  const q = platforms.find((o) => o.id === cut.id) || { y: cut.y, x0: cut.x0, x1: cut.x1 };
  const s = slabOf({ ...q, y: cut.y, x0: cut.x0, x1: cut.x1 }, platforms);
  const ext = 70; // (the hull and the pods hang a little past the ends of a deck)
  const x0 = cut.a - (cut.a <= cut.x0 + 0.5 ? ext : 0), x1 = cut.b + (cut.b >= cut.x1 - 0.5 ? ext : 0);
  return { part: 'scar', x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(s.y0), y1: Math.round(s.y1) };
};

// Cluster rectangles that touch or overlap into pieces of debris.
function clusters(rects) {
  const n = rects.length, up = rects.map((_, i) => i);
  const find = (i) => (up[i] === i ? i : (up[i] = find(up[i])));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const p = rects[i], q = rects[j];
    if (p.x0 <= q.x1 + 4 && q.x0 <= p.x1 + 4 && p.y0 <= q.y1 + 4 && q.y0 <= p.y1 + 4) up[find(i)] = find(j);
  }
  const by = new Map();
  rects.forEach((r, i) => { const k = find(i); (by.get(k) || by.set(k, []).get(k)).push(r); });
  return [...by.values()].map((clips) => ({ clips, box: { x0: Math.min(...clips.map((c) => c.x0)), y0: Math.min(...clips.map((c) => c.y0)), x1: Math.max(...clips.map((c) => c.x1)), y1: Math.max(...clips.map((c) => c.y1)) } }));
}

// How far the point (x, y) is outside a bag's envelope (0 inside), px.
const bagDist = (b, x, y) => {
  const u = (x - b.cx) / b.rx, v = (y - b.cy) / b.ry, r = Math.hypot(u, v);
  return r <= 1 ? 0 : (r - 1) * Math.min(b.rx, b.ry);
};

export function planBreak(parts, spec, rng = Math.random) {
  const no = (hint) => ({ ok: false, hint, parts, labels: [], summary: '', cuts: [], pieces: [], scars: [], bags: [], names: [], mass: 0, lift: 0, deckPx: 0 });
  let L0;
  try { L0 = buildLayout(parts); } catch { return no('the parts do not build'); }
  if (!L0.platforms.length) return no('no deck');
  const rep = { cuts: [], labels: [], names: [] };
  let cuts = [];
  const bagsGone = [];
  if (spec.kind === 'blast') {
    cuts = blastCuts(L0, spec, rng);
    const R = spec.r;
    L0.gasbags.forEach((b) => { if (bagDist(b, spec.x, spec.y) <= R * BO().BAY.BAG_REACH) bagsGone.push(b); });
  } else if (spec.kind === 'limb') cuts = limbCut(L0, spec);
  else if (spec.kind === 'part') {
    const cut = partCut(L0, spec.name, spec.len);
    if (!cut) return no('no such part: ' + spec.name);
    cuts = [cut];
  } else if (spec.kind === 'bag') {
    const b = L0.gasbags[spec.index];
    if (!b) return no('no such bag');
    bagsGone.push(b);
  } else return no('unknown cause ' + spec.kind);
  if (bagsGone.length >= L0.gasbags.length) bagsGone.splice(bagsGone.reduce((best, b, i) => (b.rx > bagsGone[best].rx ? i : best), 0), 1); // (the biggest bag always stays)
  let out = parts.map((p) => ({ ...p }));
  // bags first: a bag goes, then the crow's nests it carried
  if (bagsGone.length) {
    out = out.filter((p) => !(p.part === 'gasbag' && bagsGone.some((b) => Math.abs(b.cx - p.cx) < 1 && Math.abs(b.rx - p.rx) < 1)));
    rep.labels.push(...bagsGone.map(() => 'gasbag'));
    const left = out.filter((p) => p.part === 'gasbag');
    if (left.length) {
      const cover = bagCover(left.map((b) => ({ ...b, x0: b.cx - b.rx, x1: b.cx + b.rx })));
      for (const q of L0.platforms) if (['nest', 'crow2'].includes(rowOf(q)) && !cover.some((c) => q.x0 >= c.lo - 1 && q.x1 <= c.hi + 1)) cuts.push({ id: q.id, a: q.x0, b: q.x1, dist: 999 });
    }
  }
  const wasWhole = connected(L0);
  out = applyCuts(out, cuts, rep);
  out = sweepOrphans(out, rep, wasWhole);
  if (!rep.cuts.length && !bagsGone.length) return no('nothing to break off there');
  // the hull's collision outline was hand-placed (the classic ship): let it be worked out again from what is left
  const frame = out.find((p) => p.part === 'frame');
  if (frame) delete frame.samples;
  const scars = rep.cuts.map((c) => scarFor(c, L0.platforms));
  out.push(...scars);
  let L1;
  try { L1 = buildLayout(out); } catch { return no('what is left does not build'); }
  if (!L1.platforms.length || !L1.gasbags.length) return no('she would have no deck or no gasbag left');
  const pieces = clusters(scars.map((s) => ({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 })));
  for (const b of bagsGone) pieces.push({ clips: [{ x0: b.cx - b.rx, y0: b.cy - b.ry, x1: b.cx + b.rx, y1: b.cy + b.ry }], box: { x0: b.cx - b.rx, y0: b.cy - b.ry, x1: b.cx + b.rx, y1: b.cy + b.ry }, ellipse: { cx: b.cx, cy: b.cy, rx: b.rx, ry: b.ry } });
  const b0 = budgets(parts), b1 = budgets(out);
  const len = (list) => list.reduce((n, q) => n + q.x1 - q.x0, 0);
  const labels = rep.labels;
  return { ok: true, hint: '', parts: out, labels, summary: summarize(labels), cuts: rep.cuts, pieces, scars, bags: bagsGone.map((b) => L0.gasbags.indexOf(b)), names: rep.names, sigs: (L1.partRects || []).map((r) => r.sig).filter((s) => s != null), mass: Math.max(0, b0.mass - b1.mass), lift: Math.max(0, b0.lift - b1.lift), deckPx: Math.max(0, len(L0.platforms) - len(L1.platforms)) };
}

// Salvage a sky-dock asks to mend what broke off (config.BREAKOFF.REBUILD), from the weight, the gasbag lift and the deck she lost.
export function rebuildPrice(plan) {
  const R = BO().REBUILD;
  const raw = plan.mass * R.MASS_PRICE + plan.lift * R.LIFT_PRICE + (plan.deckPx / 100) * R.DECK_PRICE;
  return Math.round(Math.max(R.MIN, Math.min(R.MAX, raw)) / 5) * 5;
}

// The gas level she would need to hover at with these parts (shipBuild.js budgets): GAS.NEUTRAL + weight - lift. A ship that lost bags is heavy for the lift she has left.
export function hoverOf(parts) {
  const b = budgets(parts);
  return config.GAS.NEUTRAL + b.mass - b.lift;
}
