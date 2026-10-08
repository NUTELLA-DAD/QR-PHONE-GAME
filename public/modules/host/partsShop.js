// The Shipwright's Yard (S.6a): ship PARTS as cards in the sky-dock shop. Pure and Node-safe (no DOM, no live ship): simulation.js makes the offers and applies them, the TV
// (yardArt.js) draws the choices, tools/buildsim.mjs --check-yard drives it headless.
//
// A part is a PURE BUILD EDIT of the voyage's parts list (run.build): the editor's own operations (buildEdit.js drawDeck / setBag / placePart, buildSlots.js slotsFor), so every effect
// is weight, lift, steam and stations in the build and config is never written. An offer is a catalogue entry plus up to YARD.SLOT_MAX CHOICES - the places it can go - each one
// already checked by the validator (never a FAIL; a WARN is kept as the choice's note). One choice = it is placed at once; several = the crew votes A / B / C.
//
//   offerPart(parts, { owned, crew, rng, avoid })   -> { entry, choices } or null     choose a part this ship can take
//   choicesFor(entry, parts, base)                  -> [{ letter, where, note, desc, x, y, ghost, apply(parts), summary, warns }]
//   partPrice(entry, bought, crew)                  -> salvage
//   summaryOf(validateResult)                       -> the four gauges as plain numbers (the TV bars)
//   moduleNames(layout) / newModules(before, after) -> the stations, engines, pipes and sails a build has / has gained (the limp rule shakes the newest part's loose)
import { config } from '../../config.js';
import { buildLayout, rowOf, COL, DECK_ROWS, bagList, bagCover } from './shipBuild.js';
import { slotsFor, drawDeck, setBag, placePart, routePipes, ensureFrame } from './buildSlots.js';
import { validate } from './buildCheck.js';

const PS = () => config.PARTS_SHOP;
const clone = (parts) => parts.map((p) => ({ ...p }));
const count = (parts, test) => parts.filter(test).length;
const UP = -Math.PI / 2;

// ---- the gauges as numbers -------------------------------------------------------------------------------------------------------------
export function summaryOf(res) {
  const b = (res && res.budgets) || {};
  if (!b.lift) return null;
  return {
    hover: b.lift.hover, hoverLevel: b.lift.level, mass: b.lift.mass, lift: b.lift.lift,
    cruise: b.steam.cruise, idle: b.steam.idle, steamLevel: b.steam.level, boilers: b.steam.boilers,
    perPlayer: b.hands.perPlayer, stations: b.hands.stations, handsLevel: b.hands.level,
    deg: b.balance ? b.balance.deg : 0, balLevel: b.balance ? b.balance.level || 'PASS' : 'PASS',
  };
}

// ---- what a build has by name ----------------------------------------------------------------------------------------------------------
// The things the sim gives a health bar (modules.js): stations, engines, steam pipes, sails and the lift. A part's new modules are the ones a build has after it and not before.
export function moduleNames(L) {
  const out = [...L.stations.map((s) => s.n), ...L.engines.map((e) => e.name), ...L.pipes.map((p) => p.to + ' Pipe'), ...(L.sails || []).map((s) => s.n)];
  if (L.connectors.some((c) => c.type === 'lift')) out.push('Lift');
  return out;
}
export const newModules = (before, after) => { const had = new Set(before); return after.filter((n) => !had.has(n)); };

// ---- choosing places ---------------------------------------------------------------------------------------------------------------------
// n of the list, spread along it (first, last, then the middle ones): the places the crew sees as A / B / C.
function spread(list, n) {
  if (list.length <= n) return list.slice();
  const out = [];
  for (let k = 0; k < n; k++) out.push(list[Math.round((k * (list.length - 1)) / (n - 1))]);
  return out;
}
// "Main Deck, aft" / "Lower Deck, middle" / "Top Deck, fore": where on a deck an x is.
function whereOn(L, id, x) {
  const q = L.platforms.find((d) => d.id === id);
  if (!q) return 'the ship';
  const f = (x - q.x0) / Math.max(1, q.x1 - q.x0);
  return `${q.name}, ${f < 0.34 ? 'aft' : f > 0.66 ? 'fore' : 'middle'}`;
}
const boxAt = (x, y, w = 36, up = 64, down = 10) => ({ x0: x - w, y0: y - up, x1: x + w, y1: y + down });

// A catalogue entry's candidate places: [{ x, y, where, ghost, apply(parts) -> parts }] (not yet validated). The palette types (buildSlots.js PALETTE) give the legal spots; the others are
// composite edits made of the editor's operations.
const fromPalette = (type, opts = {}) => (parts, L) => slotsFor(type, parts).map((s) => ({
  x: s.x, y: s.y, where: whereOn(L, s.p, s.x), ghost: opts.ghost ? opts.ghost(s) : s.hr != null ? { x0: s.x - 16, x1: s.x + 16, y0: s.hy - s.hr, y1: s.hy + s.hr } : boxAt(s.x, s.y, 40, 70, 12),
  apply: opts.dir != null ? (ps) => s.apply(ps, { dir: opts.dir }) : s.apply,
}));

// The ship's two ends along the hull: the decks a hull bay lengthens, and what the new bay gets.
function bayCandidates(parts, L) {
  const rows = ['main', 'lower', 'catwalk'].map((r) => L.platforms.find((q) => rowOf(q) === r)).filter(Boolean);
  if (rows.length < 2) return [];
  const lo = Math.min(...rows.map((q) => q.x0)), hi = Math.max(...rows.map((q) => q.x1));
  const out = [];
  for (const side of ['aft', 'fore']) {
    const edge = side === 'aft' ? lo : hi;
    const decks = rows.filter((q) => Math.abs((side === 'aft' ? q.x0 : q.x1) - edge) <= COL * 1.5);
    if (decks.length < 2) continue;
    const apply = (ps) => {
      let next = ps;
      for (const q of decks) {
        const r = drawDeck(next, rowOf(q), side === 'aft' ? q.x0 - COL : q.x1, side === 'aft' ? q.x0 : q.x1 + COL);
        if (!r.ok) return clone(ps);
        next = r.parts;
      }
      const lower = decks.find((q) => rowOf(q) === 'lower');
      if (lower) { // a fire extinguisher in the new room, if it fits
        const x = side === 'aft' ? lower.x0 - COL / 2 : lower.x1 + COL / 2;
        const r = placePart(next, 'extinguisher', x, lower.y, { maxDist: COL });
        if (r.ok) next = r.parts;
      }
      for (let k = 0; k < 2 && validate(next).warns.some((w) => /gasbag covers/.test(w)); k++) { // the bag no longer covers the decks: stretch it
        const g = setBag(next, { grow: 1 });
        if (!g.ok) break;
        next = g.parts;
      }
      return routePipes(ensureFrame(next));
    };
    const y = (decks.find((q) => rowOf(q) === 'lower') || decks[0]).y;
    const x = edge + (side === 'aft' ? -COL / 2 : COL / 2);
    out.push({ x, y, where: `${side === 'aft' ? 'Aft' : 'Fore'} end, one room longer`, ghost: { x0: x - COL / 2, x1: x + COL / 2, y0: Math.min(...decks.map((q) => q.y)) - 70, y1: y + 30 }, apply });
  }
  return out;
}

// A second gasbag, or a bigger one.
function bagCandidates(parts, L) {
  const out = [];
  const bags = bagList(L);
  if (!bags.length) return out;
  const big = bags.reduce((a, b) => (b.rx > a.rx ? b : a));
  const grown = setBag(parts, { grow: 1 });
  if (grown.ok) out.push({ x: big.cx + big.rx, y: big.cy, where: 'The gasbag, one column longer', ghost: { ellipse: true, cx: big.cx, cy: big.cy, rx: big.rx + config.BUILD_EDIT.BAG_STEP, ry: big.ry }, apply: () => grown.parts });
  if (bags.length < PS().BAGS_MAX) {
    const slots = slotsFor('gasbag', parts).sort((a, b) => a.x - b.x);
    const mid = (Math.min(...bags.map((b) => b.cx - b.rx)) + Math.max(...bags.map((b) => b.cx + b.rx))) / 2;
    const aft = slots.find((s) => s.x < mid), fore = slots.slice().reverse().find((s) => s.x >= mid);
    for (const [s, name] of [[aft, 'aft'], [fore, 'fore']]) {
      if (s) out.push({ x: s.x, y: s.y, where: `A second gasbag, ${name} of the first`, ghost: { ellipse: true, cx: s.x, cy: s.y, rx: (s.span[1] - s.span[0]) / 2, ry: config.BUILD_EDIT.BAG_RY }, apply: s.apply });
    }
  }
  return out;
}

// A crow's nest on the bag (two columns) with a dorsal gun on it.
function nestCandidates(parts, L) {
  const out = [];
  const cover = bagCover(bagList(L));
  const have = L.platforms.filter((q) => rowOf(q) === 'nest');
  const y = DECK_ROWS.nest;
  for (const c of cover) {
    for (let x0 = Math.ceil(c.lo / COL) * COL; x0 + 2 * COL <= c.hi + 1; x0 += COL) {
      if (have.some((q) => q.x1 > x0 - 40 && q.x0 < x0 + 2 * COL + 40)) continue;
      const apply = (ps) => {
        const r = drawDeck(ps, 'nest', x0, x0 + 2 * COL);
        if (!r.ok) return clone(ps);
        const g = placePart(r.parts, 'gun', x0 + COL, y, { maxDist: COL });
        return routePipes(ensureFrame(g.ok ? g.parts : r.parts));
      };
      out.push({ x: x0 + COL, y, where: `On the gasbag, ${x0 + COL < (Math.min(...cover.map((k) => k.lo)) + Math.max(...cover.map((k) => k.hi))) / 2 ? 'aft' : 'fore'} half`, ghost: { x0, x1: x0 + 2 * COL, y0: y - 80, y1: y + 10 }, apply });
    }
  }
  return out;
}

// ---- the catalogue -----------------------------------------------------------------------------------------------------------------------
// id            the key of config.PARTS_SHOP.PRICES    group  who finds it cheaper (crew size) - 'engine' small crews, 'station' big ones
// blurb         the one phone line: what it does, and the catch    allowed(parts, owned)  the v1 limits    cands(parts, L)  the places    w(ctx)  how often it is offered
const engines = (p) => count(p, (q) => q.part === 'engine');
const stationsOf = (p, kind) => count(p, (q) => q.part === 'station' && q.kind === kind);
export const CATALOGUE = [
  { id: 'hullBay', name: 'Hull bay', icon: '\u{1FAB5}', group: 'frame', blurb: 'A room longer on every deck (the gasbag is stretched to cover it). Heavier, a bigger target.', allowed: (p, o) => (o.hullBay || 0) < PS().HULL_BAYS_MAX, cands: bayCandidates, w: () => 2 },
  { id: 'keel', name: 'Keel deck', icon: '⚓', group: 'frame', blurb: 'A whole deck under the lower deck, with a ladder. Taller, more room.', allowed: (p) => !p.some((q) => q.part === 'deck' && q.row === 'keel'), cands: fromPalette('keel', { ghost: (s) => ({ x0: s.x - COL, x1: s.x + COL, y0: DECK_ROWS.keel - 50, y1: DECK_ROWS.keel + 14 }) }), w: () => 1.4 },
  { id: 'gasbag', name: 'Gasbag', icon: '\u{1F388}', group: 'bag', pic: 'gasbag', blurb: 'More lift. A bigger target with more holes to patch.', allowed: () => true, cands: bagCandidates, w: (c) => (c.sum.hover > 60 ? 4 : 2) },
  { id: 'engine', name: 'Engine pod', icon: '⚙️', group: 'engine', pic: 'engine', blurb: 'More push. Burns coal and steam, and weighs.', allowed: (p) => engines(p) < PS().ENGINES_MAX, cands: fromPalette('engine'), w: (c) => (c.engines < 3 ? 3 : 1.2) },
  { id: 'liftEngine', name: 'Lift engine', icon: '⬆️', group: 'engine', pic: 'engine', picDir: UP, blurb: 'An engine pointing up: lifts her without gas. Uses steam all the time.', allowed: (p) => engines(p) < PS().ENGINES_MAX && count(p, (q) => q.part === 'engine' && q.dir === UP) < 2, cands: fromPalette('engine', { dir: UP }), w: (c) => (c.sum.hover > 58 ? 3 : 1) },
  { id: 'nest', name: 'Gun nest', icon: '\u{1F52D}', group: 'station', pic: 'lookout', blurb: "A crow's nest on the bag with a dorsal gun. Only pays if somebody climbs up.", allowed: (p, o) => (o.nest || 0) < PS().NEST_MAX, cands: nestCandidates, w: () => 1.2 },
  { id: 'gun', name: 'Gun mount', icon: '\u{1F52B}', group: 'station', pic: 'gun', blurb: 'One more gun. More ammo to haul.', allowed: (p) => count(p, (q) => q.part === 'gun') < PS().GUNS_MAX, cands: fromPalette('gun'), w: () => 3 },
  { id: 'lamp', name: 'Searchlight', icon: '\u{1F4A1}', group: 'station', pic: 'searchlight', blurb: 'A lamp to see and spot with. Somebody has to man it.', allowed: (p) => count(p, (q) => q.part === 'searchlight') < 3, cands: fromPalette('searchlight'), w: () => 1 },
  { id: 'bombBay', name: 'Bomb bay', icon: '\u{1F4A3}', group: 'station', pic: 'bombBay', blurb: 'Bombs for outposts, dropped from the belly. Heavy.', allowed: (p) => !p.some((q) => q.part === 'bombBay'), cands: fromPalette('bombBay'), w: () => 2.2 },
  { id: 'boiler', name: 'Second boiler', icon: '\u{1F525}', group: 'station', pic: 'boiler', blurb: 'More steam for more engines. A fire risk, and it eats coal.', allowed: (p) => stationsOf(p, 'boiler') < PS().BOILERS_MAX, cands: fromPalette('boiler'), w: (c) => (c.sum.cruise < 62 ? 3 : 1) },
  { id: 'coal', name: 'Coal bunker', icon: '⚫', group: 'station', pic: 'coal', blurb: 'Coal closer to the boiler: shorter hauls. Coal burns.', allowed: (p) => stationsOf(p, 'coal') < 2, cands: fromPalette('coal'), w: () => 1 },
  { id: 'ammo', name: 'Ammo hold', icon: '\u{1F4E6}', group: 'station', pic: 'ammo', blurb: 'Shells closer to the guns: shorter hauls.', allowed: (p) => stationsOf(p, 'ammo') < 2, cands: fromPalette('ammo'), w: () => 1 },
  { id: 'armour', name: 'Armour plate', icon: '\u{1F6E1}️', group: 'armour', pic: 'armour', blurb: 'Iron on the hull: hits there hurt a third as much. Very heavy.', allowed: (p) => count(p, (q) => q.part === 'armour') < 4, cands: fromPalette('armour', { ghost: (s) => ({ x0: s.x - COL, x1: s.x + COL, y0: s.y - 28, y1: s.y + 26 }) }), w: () => 1.5 },
  { id: 'sail', name: 'Mast and sail', icon: '⛵', group: 'station', pic: 'sail', blurb: 'Raise it for speed from the wind. Gusts can tear it.', allowed: (p) => count(p, (q) => q.part === 'sail') < 2, cands: fromPalette('sail'), w: () => 0.9 },
  { id: 'ballast', name: 'Ballast', icon: '⚖️', group: 'frame', pic: 'ballast', blurb: 'Sandbags to trim her level. Cheap, dense, and heavy.', allowed: (p) => count(p, (q) => q.part === 'ballast') < 6, cands: (p, L) => [...fromPalette('ballast')(p, L), ...fromPalette('ballast_hang')(p, L)], w: (c) => (Math.abs(c.sum.deg) >= config.BALANCE.WARN_PX * config.BALANCE.DEG_PER_PX ? 4 : 0.5) },
  { id: 'ladder', name: 'Ladder', icon: '\u{1FA9C}', group: 'frame', pic: 'ladder', blurb: 'Another way between two decks: shorter walks.', allowed: () => true, cands: fromPalette('ladder'), w: () => 0.6 },
  { id: 'pole', name: 'Slide pole', icon: '\u{1F6DD}', group: 'frame', pic: 'pole', blurb: 'A fast way DOWN between two decks. Up is still the ladder.', allowed: () => true, cands: fromPalette('pole'), w: () => 0.6 },
  { id: 'lift', name: 'Steam lift', icon: '\u{1F6D7}', group: 'frame', pic: 'lift', blurb: 'A fast lift from the main to the lower deck. Uses steam; mend it with a hammer.', allowed: () => true, cands: fromPalette('lift', { ghost: (s) => ({ x0: s.x - 16, x1: s.x + 16, y0: DECK_ROWS.main, y1: DECK_ROWS.lower }) }), w: () => 0.9 },
];
export const entryById = (id) => CATALOGUE.find((e) => e.id === id);

// ---- price -----------------------------------------------------------------------------------------------------------------------------
// The base price, raised by how many parts the crew has already bought (PARTS_SHOP.REPEAT_PRICE each), and tilted by crew size: engines, armour and gasbags are cheaper for a crew of
// CREW_SMALL or fewer, station parts for a crew of CREW_BIG or more. Rounded to 5.
export function partPrice(entry, bought = 0, crew = 4) {
  const P = PS();
  let c = (P.PRICES[entry.id] || 100) * (1 + P.REPEAT_PRICE * bought);
  if (crew <= P.CREW_SMALL && (entry.group === 'engine' || entry.group === 'armour' || entry.group === 'bag')) c *= P.SMALL_MUL;
  if (crew >= P.CREW_BIG && entry.group === 'station') c *= P.BIG_MUL;
  return Math.round(c / 5) * 5;
}

// ---- the choices -----------------------------------------------------------------------------------------------------------------------
// A validator warning in a few words for a phone card.
function shortWarn(w) {
  let m;
  if (/gasbag covers/.test(w)) return 'the gasbag is too short for the decks';
  if ((m = /^hover at gas ([\d.]+)/.exec(w))) return +m[1] < config.BUILD_CHECK.HOVER_MIN + 10 ? `rides high (hover ${Math.round(m[1])}): wasted lift` : `getting heavy (hover ${Math.round(m[1])}): more pumping`;
  if (/idle/.test(w) && /venting/.test(w)) return 'idle steam runs hot: more engines to use it';
  if (/coal bunker beside the boiler/.test(w)) return 'coal beside the boiler: fire risk';
  if (/sails tip her/.test(w)) return 'the sail tips her nose down';
  if (/wedge/.test(w)) return 'too big for tight caves';
  if (/nose-heavy|tail-heavy/.test(w)) return w.split(/[,(:;]/)[0].trim();
  return w.length > 60 ? w.slice(0, 57).replace(/[ ,;(]+$/, '') + '...' : w;
}
// A short note on a choice: its first NEW warning, else the most telling change in the gauges.
function noteFor(base, sum, warns, baseWarns) {
  const fresh = warns.find((w) => !baseWarns.includes(w));
  if (fresh) return shortWarn(fresh);
  const dh = +(sum.hover - base.hover).toFixed(0), dc = +(sum.cruise - base.cruise).toFixed(0);
  if (Math.abs(dh) >= 2) return `hover ${Math.round(base.hover)} to ${Math.round(sum.hover)}`;
  if (Math.abs(dc) >= 3) return `steam ${Math.round(base.cruise)} to ${Math.round(sum.cruise)}`;
  if (sum.stations !== base.stations) return `${sum.stations - base.stations > 0 ? '+' : ''}${sum.stations - base.stations} to man`;
  return 'no catch';
}

// Up to YARD.SLOT_MAX places for an entry on a build, each checked by the validator (never a FAIL), with the gauges it would give. `base` = { res, sum } of the build as it is.
export function choicesFor(entry, parts, base) {
  let L;
  try { L = buildLayout(parts); } catch { return []; }
  const b = base || { res: validate(parts), sum: null };
  b.sum = b.sum || summaryOf(b.res);
  const cands = entry.cands(parts, L);
  if (!cands.length) return [];
  const tried = spread(cands.slice().sort((p, q) => p.x - q.x || p.y - q.y), PS().CANDIDATES);
  const good = [];
  for (const c of tried) {
    let next;
    try { next = c.apply(parts); } catch { continue; }
    if (!next || next.length === parts.length && JSON.stringify(next) === JSON.stringify(parts)) continue;
    const res = validate(next);
    if (!res.ok) continue;
    const sum = summaryOf(res);
    good.push({ ...c, parts: next, summary: sum, warns: res.warns, note: noteFor(b.sum, sum, res.warns, b.res.warns) });
  }
  // different places first: one of each deck-and-end, then the rest, spread along the ship
  const seen = new Set(), diverse = [];
  for (const c of good) { if (!seen.has(c.where)) { seen.add(c.where); diverse.push(c); } }
  const pick = spread(diverse.length ? diverse : good, Math.min(config.YARD.SLOT_MAX, (diverse.length ? diverse : good).length));
  return pick.map((c, i) => ({ letter: 'ABCDEFGH'[i], where: c.where, note: c.note, desc: `${c.where}: ${c.note}`, x: c.x, y: c.y, ghost: c.ghost, summary: c.summary, warns: c.warns, parts: c.parts, apply: c.apply }));
}

// ---- the offer --------------------------------------------------------------------------------------------------------------------------
// Pick one part this build can take and the places it can go. owned = { <entry id>: times bought } (hull bays and nests are limited by it), crew = players aboard, rng() -> 0..1,
// avoid = an entry id not to offer twice running, only = force one entry (the gates). Returns { entry, choices, base } or null when nothing fits.
export function offerPart(parts, { owned = {}, crew = 4, rng = Math.random, avoid = null, only = null } = {}) {
  const res = validate(parts);
  const base = { res, sum: summaryOf(res) };
  if (!base.sum) return null;
  const ctx = { sum: base.sum, engines: engines(parts) };
  let pool = CATALOGUE.filter((e) => (only ? e.id === only : e.allowed(parts, owned)));
  const list = pool.map((e) => ({ e, w: Math.max(0.01, e.w(ctx)) * (e.id === avoid ? 0.15 : 1) }));
  while (list.length) {
    const total = list.reduce((a, x) => a + x.w, 0);
    let r = rng() * total, k = 0;
    while (k < list.length - 1 && (r -= list[k].w) > 0) k++;
    const { e } = list.splice(k, 1)[0];
    const choices = choicesFor(e, parts, base);
    if (choices.length) return { entry: e, choices, base };
  }
  return null;
}
