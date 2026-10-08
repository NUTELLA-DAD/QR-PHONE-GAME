// Where a part can go (Phase S.5): the palette of part types, the slots each can be placed in, and random legal mutations.
// Pure and Node-safe. The building dev page (public/buildtest.html) shows the slots as highlighted pins; tools/buildsim.mjs --random
// uses the same slots to grow random builds from the classic ship. A slot is { type, p, x, y, label, apply(parts) -> new parts };
// a slot is LEGAL when the build it makes passes validate() with no FAIL (warnings are allowed: the player is told).
// Until the catalogue (S.6) there is no Sparrow, so every part here is built from the existing pieces (shipBuild.js PARTS).
import { buildLayout, COL } from './shipBuild.js';
import { validate } from './buildCheck.js';
import { config } from '../../config.js';

const STEP = 40; // slots sit on a grid this far apart along a deck (px)
const clone = (parts) => parts.map((p) => ({ ...p }));
const names = (parts) => new Set(parts.map((p) => p.n || p.name).filter(Boolean));
const nextName = (parts, base) => { const used = names(parts); let k = 1; while (used.has(`${base} ${k}`)) k++; return `${base} ${k}`; };
const spots = (q, margin = 50) => { const xs = []; for (let x = Math.ceil((q.x0 + margin) / STEP) * STEP; x <= q.x1 - margin; x += STEP) xs.push(x); return xs; };

// Is x on deck p free of other stations (and, for hauling stations, of anything the Action button would grab first)?
function roomAt(L, p, x, haul) {
  const gap = config.BUILD_CHECK.MIN_GAP + 15;
  if ([...L.stations, ...L.engines].some((s) => s.p === p && Math.abs(s.x - x) < gap)) return false;
  if (!haul) return true;
  const near = config.TOOLS.REACH + 5;
  const q = L.platforms.find((d) => d.id === p);
  const d = L.platforms.indexOf(q);
  if ([...L.racks, ...L.vents, ...L.extinguishers].some((o) => o.p === p && Math.abs(o.x - x) < near)) return false;
  if (L.pipes.some((o) => o.p === p && Math.abs(o.valve[0] - x) < near)) return false;
  return !L.connectors.some((c) => (c.top === d && Math.abs(c.xTop - x) < near) || (c.bottom === d && Math.abs(c.xBottom - x) < near));
}

// Station part types: where each may stand, and whether it hauls (needs a clear spot).
const STATION_AT = { lookout: ['nest', false], boiler: ['main', true], coal: ['lower', true], ammo: ['lower', true] };
const LABEL = { lookout: 'Lookout', boiler: 'Boiler', coal: 'Coal Bunker', ammo: 'Ammo Hold', gun: 'Gun', searchlight: 'Searchlight', engine: 'Engine' };

// How a gun sits on each deck (copied from the classic ship's own mounts): where the barrel pivots, the middle of its arc and its spread.
const GUN_AT = {
  nest: (q, x, fore) => ({ bx: x + 10, by: q.y - 34, aim: fore ? -1.2 : -1.95, arc: 1.2 }),
  catwalk: (q, x, fore) => ({ bx: x + (fore ? 32 : -27), by: q.y - 52, aim: fore ? -0.35 : Math.PI + 0.35, arc: 1.1 }),
  lower: (q, x, fore) => ({ bx: x + (fore ? 90 : -90), by: q.y + 22, aim: fore ? 1.0 : 2.15, arc: 0.7 }),
};

// The palette: each type lists its candidate slots for a build (L = its layout). Candidates are not yet checked for legality.
export const PALETTE = [
  { id: 'extend', label: 'Longer deck (+1 column)', hint: 'click a deck end', slots: (L, parts) => {
    const out = [];
    for (const id of ['catwalk', 'main', 'lower']) {
      const q = L.platforms.find((d) => d.id === id);
      if (!q) continue;
      for (const side of [-1, 1]) {
        out.push({ p: id, x: side < 0 ? q.x0 : q.x1, label: `${q.name}, ${side < 0 ? 'aft' : 'fore'} end +1 column`, apply: (ps) => {
          const next = clone(ps);
          const deck = next.find((o) => o.part === 'deck' && o.id === id);
          const edge = side < 0 ? deck.x0 : deck.x1;
          if (side < 0) deck.x0 -= COL; else deck.x1 += COL;
          const room = next.find((o) => o.part === 'room' && o.p === id && (side < 0 ? o.x0 === edge : o.x1 === edge));
          if (room) { if (side < 0) room.x0 -= COL; else room.x1 += COL; }
          const frame = next.find((o) => o.part === 'frame');
          if (frame) delete frame.samples; // the hand-placed collision outline no longer fits: let it be derived again
          return next;
        } });
      }
    }
    return out;
  } },
  { id: 'gun', label: 'Gun mount', hint: 'click a deck spot', slots: (L, parts) => {
    const out = [];
    for (const id of ['nest', 'catwalk', 'lower']) {
      const q = L.platforms.find((d) => d.id === id);
      if (!q) continue;
      for (const x of spots(q)) {
        if (!roomAt(L, id, x, false)) continue;
        const fore = x > L.refPoint.x;
        out.push({ p: id, x, label: `Gun on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'gun', n: nextName(ps, 'Extra Gun'), p: id, x, ...GUN_AT[id](q, x, fore) }] });
      }
    }
    return out;
  } },
  { id: 'searchlight', label: 'Searchlight', hint: 'click a spot on the nest or top deck', slots: (L, parts) => {
    const out = [];
    for (const id of ['nest', 'catwalk']) {
      const q = L.platforms.find((d) => d.id === id);
      if (!q) continue;
      for (const x of spots(q)) {
        if (!roomAt(L, id, x, false)) continue;
        out.push({ p: id, x, label: `Searchlight on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'searchlight', n: nextName(ps, 'Extra Searchlight'), p: id, x, bx: x, by: q.y - (id === 'nest' ? 134 : 100), aim: -Math.PI / 2, arc: 1.5, len: 44 }] });
      }
    }
    return out;
  } },
  ...['lookout', 'boiler', 'coal', 'ammo'].map((kind) => ({
    id: kind, label: kind === 'lookout' ? "Lookout (crow's nest)" : kind === 'boiler' ? 'Boiler (second)' : kind === 'coal' ? 'Coal bunker' : 'Ammo hold', hint: 'click a spot on the ' + STATION_AT[kind][0] + ' deck',
    slots: (L) => {
      const [id, haul] = STATION_AT[kind];
      const q = L.platforms.find((d) => d.id === id);
      if (!q) return [];
      return spots(q).filter((x) => roomAt(L, id, x, haul)).map((x) => ({ p: id, x, label: `${LABEL[kind]} on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part: 'station', n: nextName(ps, 'Extra ' + LABEL[kind]), kind, p: id, x }] }));
    },
  })),
  { id: 'engine', label: 'Engine pod', hint: 'click an outrigger spot (needs a boiler)', slots: (L) => {
    const q = L.platforms.find((d) => d.id === 'lower');
    const boiler = L.stations.find((s) => s.kind === 'boiler');
    const main = L.platforms.find((d) => d.id === 'main');
    if (!q || !boiler || !main) return [];
    const xs = [q.x0 + 30, q.x0 + 90, q.x0 + 150, q.x1 - 150, q.x1 - 90, q.x1 - 30];
    return xs.filter((x) => roomAt(L, 'lower', x, false)).map((x) => ({ p: 'lower', x, label: `Engine pod on the lower deck, x ${x}`, apply: (ps) => {
      const name = nextName(ps, 'Pod Engine');
      const y = 700 + 10 * L.pipes.length; // a steam pipe from the boiler, along under the main deck, down to the pod
      const from = boiler.x + (x < boiler.x ? -30 : 30);
      return [...ps, { part: 'engine', name, p: 'lower', x }, { part: 'pipe', to: name, p: 'lower', points: [[from, main.y - 30], [from, y], [x + 40, y], [x + 40, q.y - 25]], valve: [Math.round((from + x + 40) / 2), y] }];
    } }));
  } },
  ...['ladder', 'pole'].map((type) => ({
    id: type, label: type === 'ladder' ? 'Ladder' : 'Slide pole (down only)', hint: 'click a spot between two decks', slots: (L) => {
      const out = [];
      for (const [top, bottom] of [['catwalk', 'main'], ['main', 'lower']]) {
        const a = L.platforms.find((d) => d.id === top), b = L.platforms.find((d) => d.id === bottom);
        if (!a || !b) continue;
        const ti = L.platforms.indexOf(a), bi = L.platforms.indexOf(b);
        for (const x of spots({ x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1) }, 40)) {
          if (L.connectors.some((c) => c.top === ti && c.bottom === bi && Math.abs(c.xTop - x) < 90)) continue;
          out.push({ p: top, x, label: `${type === 'ladder' ? 'Ladder' : 'Pole'} ${a.name} to ${b.name}, x ${x}`, apply: (ps) => [...ps, { part: type, top, bottom, xTop: x, xBottom: x }] });
        }
      }
      return out;
    },
  })),
  { id: 'rack', label: 'Hammer rack', hint: 'click a deck spot', slots: (L) => rackSlots(L, 'rack', 'a hammer rack') },
  { id: 'extinguisher', label: 'Extinguisher', hint: 'click a deck spot', slots: (L) => rackSlots(L, 'extinguisher', 'an extinguisher') },
  { id: 'vent', label: 'Steam vent', hint: 'click a deck spot', slots: (L) => rackSlots(L, 'vent', 'a steam vent') },
];

function rackSlots(L, part, what) {
  const out = [];
  for (const id of ['catwalk', 'main', 'lower']) {
    const q = L.platforms.find((d) => d.id === id);
    if (!q) continue;
    for (const x of spots(q, 30)) {
      const list = part === 'rack' ? L.racks : part === 'vent' ? L.vents : L.extinguishers;
      if (list.some((o) => o.p === id && Math.abs(o.x - x) < 100)) continue;
      out.push({ p: id, x, label: `${what[0].toUpperCase()}${what.slice(1)} on the ${q.name}, x ${x}`, apply: (ps) => [...ps, { part, ...(part === 'rack' ? { kind: 'hammer' } : {}), p: id, x }] });
    }
  }
  return out;
}

// The slots of one palette type for a build: each with its deck's y (for drawing) and whether the result is legal.
export function slotsFor(type, parts, { legalOnly = true } = {}) {
  const def = PALETTE.find((t) => t.id === type);
  if (!def) return [];
  let L;
  try { L = buildLayout(parts); } catch { return []; }
  const decks = Object.fromEntries(L.platforms.map((q) => [q.id, q]));
  const out = [];
  for (const s of def.slots(L, parts)) {
    const next = s.apply(parts);
    const v = validate(next);
    s.type = type;
    s.y = decks[s.p] ? decks[s.p].y : 0;
    s.ok = v.ok;
    s.warns = v.warns;
    s.fails = v.fails;
    if (s.ok || !legalOnly) out.push(s);
  }
  return out;
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
const WEIGHTS = { extend: 3, gun: 3, searchlight: 2, lookout: 2, boiler: 3, coal: 1, ammo: 1, engine: 3, ladder: 2, pole: 1, rack: 1, extinguisher: 1, vent: 1, remove: 2 };
export function randomMutation(parts, rng, prefer) {
  const bag = Object.entries(WEIGHTS).flatMap(([t, w]) => Array(w).fill(t));
  for (let tries = 0; tries < 12; tries++) {
    const type = prefer && tries === 0 && rng() < 0.7 ? prefer : bag[Math.floor(rng() * bag.length)];
    if (type === 'remove') {
      const list = removals(parts).filter((r) => validate(r.apply(parts)).ok);
      if (list.length) { const r = list[Math.floor(rng() * list.length)]; return { tag: 'remove', label: 'remove ' + r.label, parts: r.apply(parts) }; }
      continue;
    }
    const slots = slotsFor(type, parts);
    if (slots.length) { const s = slots[Math.floor(rng() * slots.length)]; return { tag: type, label: s.label, parts: s.apply(parts) }; }
  }
  return null;
}
