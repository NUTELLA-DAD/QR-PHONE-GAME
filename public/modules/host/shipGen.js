// The ship generator (the ship forge, tools/shipforge.mjs): a VALID random ship from nothing, seeded. Pure and Node-safe, like buildEdit.js / buildSlots.js, whose operations it
// is made with (so every ship is one a player could draw by hand): decks, a bag sized to her weight, then parts dropped on the nearest legal slot.
//
//   generateShip(seed, { theme, cap })   -> { parts, genome, name, summary, theme, mass, lift, hover, hands, warns, tags } or null (almost never)
//   buildGenome(g)                       -> the parts a genome makes (null when a deck will not draw)
//   makeValid(g, rng, cap)               -> repairs a genome until validate() has no FAIL and she is under the weight cap (null when it cannot)
//   mutateGenome(g, rng) / crossGenome(a, b, rng)    -> the evolution operators (the combo finder)
//   describeShip(parts) / nameShip(seed, theme, parts) / tagsOf(parts)    -> the one-line summary, a fun name, the part-presence tags the statistics use
//
// A GENOME is plain JSON: the decks (x0, x1 in px, open-air or covered), a crow's nest (its width and where along the bag it sits), the bags (how many, twin envelope, the hover
// level they are sized for) and ITEMS: { t: palette type (buildSlots.js PALETTE id), row: the deck row, u: 0..1 along that row, dir: an engine's way }. A genome is cheap to
// cross over (items map by row and by u onto another hull) and every build is checked by validate(): the repair loop adds a ladder, a boiler or a sandbag, or drops the
// heaviest extra, until nothing FAILs. The weights of the themes are data here, the dials are config.SHIPGEN.
import { config } from '../../config.js';
import { BUILDS, budgets, buildLayout, ENGINE_DIRS, COL } from './shipBuild.js';
import { validate } from './buildCheck.js';
import { emptyBuild, drawDeck, drawBag, erase, setBag, GRID_X0 } from './buildEdit.js';
import { slotsFor } from './buildSlots.js';

// ---- a small seeded random source -----------------------------------------------------------------------------------
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive both ends
  rng.pick = (list) => list[Math.floor(rng() * list.length)];
  rng.chance = (p) => rng() < p;
  rng.range = (lo, hi) => lo + rng() * (hi - lo);
  return rng;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const G = () => config.SHIPGEN;
// The weight cap of the Versus shelf: the classic ship's mass times config.PVP.TONNAGE (the same sum as pvp/shelf.js tonnageCap, which imports this file for its surprise ships).
export const weightCap = () => Math.round(budgets(BUILDS.classic).mass * config.PVP.TONNAGE);
export const rowOfId = (id) => (/^crow2/.test(id) ? 'crow2' : id.replace(/\d+$/, '')); // (deck ids are the row name, with a number when a row holds several decks: keel2)

// ---- the order parts are dropped in, and how readily each is let go of when she is too heavy ------------------------------ // (the engines go in before the coal and ammo: their steam pipes carry a valve halfway along the deck, and a station within 80 px of a valve cannot be worked)
const PRI = { helm: 0, boiler: 0, engine: 1, engineSwivel: 1, coal: 2, ammo: 2, medbay: 3, lift: 3, bombBay: 3, ramProw: 4, crewCannon: 5, mineLayer: 5, armour: 6, sail: 6, searchlight: 7, extinguisher: 7, vent: 7, boarding: 7, ballast: 8, ballast_hang: 8, ladder: 9, pole: 9, gasValve: 10 };
const priOf = (t) => (PRI[t] != null ? PRI[t] : /^gun/.test(t) ? 5 : /^rack_/.test(t) ? 7 : 7);
// Items a heavy ship gives up first (lower number = first to go); the core of a ship (helm, boiler, coal, ammo, engines, one gun, lookout, medbay) is never in this list.
const LET_GO = ['rack_crate', 'rack_sandbag', 'rack_towline', 'searchlight', 'ballast_hang', 'ballast', 'crewCannon', 'armour', 'sail', 'mineLayer', 'gun_flak', 'gun_scatter', 'gun_harpoon', 'gun_mortar', 'gun_flame', 'gun_long', 'gun', 'engineSwivel', 'bombBay', 'lift', 'ramProw'];

// ---- the themes ---------------------------------------------------------------------------------------------------------
// A theme is a recipe that fills a genome: the hull's dials and the loadout. Zones are where along a deck an item goes (u).
const ZONE = { aft: [0.04, 0.24], fore: [0.76, 0.96], mid: [0.36, 0.64], any: [0.08, 0.92], nose: [0.9, 0.98], tail: [0.02, 0.1] };
export const THEMES = ['kiter', 'brawler', 'rammer', 'firebrand', 'raider', 'bomber', 'fortress', 'skiff', 'gunboat', 'sapper', 'wildcard'];
export const THEME_LABEL = { kiter: 'long-range kiter', brawler: 'close-quarters brawler', rammer: 'ram-prow bruiser', firebrand: 'fireship', raider: 'boarding raider', bomber: 'bomber', fortress: 'floating fortress', skiff: 'speedy skiff', gunboat: 'broadside gunboat', sapper: 'mine-laying sapper', wildcard: 'wild card' };

function recipe(theme, R) {
  const { add, rng } = R;
  const n = rng.int;
  const side = () => (rng.chance(0.5) ? 'fore' : 'aft');
  const engines = (count, { dirs = [], swivel = 0, row = 'lower' } = {}) => { for (let i = 0; i < count; i++) add('engine', row, i % 2 ? 'fore' : 'aft', dirs[i] === 'up' ? { dir: ENGINE_DIRS[2] } : dirs[i] === 'upfwd' ? { dir: ENGINE_DIRS[1] } : dirs[i] === 'down' ? { dir: ENGINE_DIRS[6] } : {}); for (let i = 0; i < swivel; i++) add('engineSwivel', row, i % 2 ? 'fore' : 'aft'); };
  const gunRows = ['catwalk', 'lower'];
  const spread = (t, count, rows, zones) => { for (let i = 0; i < count; i++) add(t, rows[i % rows.length], zones ? zones[i % zones.length] : i % 2 ? 'fore' : 'aft'); };
  switch (theme) {
    case 'kiter':
      R.hull({ lower: n(9, 14), bags: n(1, 2), boilers: n(1, 2) });
      engines(n(3, 4), { swivel: R.chance(0.25) ? 1 : 0 });
      spread('gun_long', n(2, 3), ['catwalk', 'lower', 'catwalk'], ['fore', 'aft', 'fore']);
      spread('gun_mortar', n(1, 2), ['catwalk', 'nest'], ['mid', 'mid']);
      add('mineLayer', 'lower', 'aft');
      if (R.chance(0.4)) add('gun', 'catwalk', 'fore');
      spread('sail', n(0, 2), ['catwalk', 'catwalk'], ['mid', 'fore']);
      if (R.chance(0.35)) add('armour', 'lower', side());
      break;
    case 'brawler':
      R.hull({ lower: n(7, 10), bags: n(1, 2), boilers: 2 });
      engines(n(2, 3));
      spread('gun_scatter', n(2, 4), ['lower', 'lower', 'catwalk', 'main'], ['fore', 'aft', 'fore', 'aft']);
      if (R.chance(0.7)) add('gun_flak', R.chance(0.5) ? 'nest' : 'catwalk', 'mid');
      spread('gun', n(1, 2), ['catwalk'], ['aft', 'fore']);
      for (let i = n(2, 4); i > 0; i--) add('armour', rng.pick(['lower', 'main', 'lower']), rng.pick(['fore', 'aft', 'mid']));
      break;
    case 'rammer':
      R.hull({ lower: n(8, 12), bags: n(1, 2), boilers: n(1, 2) });
      engines(n(3, 4));
      add('ramProw', R.chance(0.8) ? 'main' : 'lower', 'nose');
      spread('gun_harpoon', n(1, 2), ['catwalk', 'lower'], ['fore', 'fore']);
      spread('gun_scatter', n(1, 2), ['lower', 'catwalk'], ['fore', 'aft']);
      for (let i = n(2, 3); i > 0; i--) add('armour', rng.pick(['main', 'lower']), 'fore');
      if (R.chance(0.4)) add('gun', 'catwalk', 'aft');
      break;
    case 'firebrand':
      R.hull({ lower: n(7, 10), bags: n(1, 2), boilers: 2, coals: 2 });
      engines(n(2, 3));
      spread('gun_flame', n(2, 3), ['catwalk', 'lower', 'main'], ['nose', 'nose', 'fore']);
      add('gun_harpoon', 'catwalk', 'fore');
      for (let i = n(1, 3); i > 0; i--) add('armour', rng.pick(['main', 'lower']), rng.pick(['fore', 'mid']));
      if (R.chance(0.5)) add('gun', 'catwalk', 'aft');
      add('extinguisher', 'lower', 'fore');
      break;
    case 'raider':
      R.hull({ lower: n(8, 12), bags: n(1, 2), boilers: 1 });
      engines(n(3, 4), { swivel: R.chance(0.3) ? 1 : 0 });
      spread('crewCannon', n(1, 2), ['catwalk', 'catwalk'], ['fore', 'aft']);
      add('rack_hookshot', 'catwalk', 'mid');
      add('rack_hookshot', 'main', 'mid');
      add('rack_sword', 'main', 'fore');
      add('rack_sword', 'lower', 'aft');
      if (R.chance(0.6)) add('rack_towline', 'catwalk', 'aft', { alt: 'main' });
      if (R.chance(0.4)) add('rack_sandbag', 'catwalk', 'mid', { alt: 'main' });
      if (R.chance(0.4)) add('rack_crate', 'main', 'fore', { alt: 'lower' });
      spread('gun_scatter', n(1, 2), ['lower', 'catwalk'], ['fore', 'aft']);
      if (R.chance(0.6)) add('gun_flak', 'catwalk', 'mid');
      if (R.chance(0.5)) add('gun', 'catwalk', 'fore');
      break;
    case 'bomber':
      R.hull({ lower: n(9, 13), bags: n(1, 3), boilers: n(1, 2), tall: R.chance(0.4) });
      engines(n(3, 4));
      add('bombBay', 'lower', 'mid');
      if (R.chance(0.6)) add('lift', 'main', 'mid');
      spread('gun', n(2, 3), ['catwalk', 'lower', 'nest'], ['fore', 'aft', 'mid']);
      add('gun_flak', 'catwalk', 'mid');
      if (R.chance(0.5)) add('mineLayer', 'lower', 'aft');
      if (R.chance(0.4)) add('sail', 'catwalk', 'mid');
      break;
    case 'fortress':
      R.hull({ lower: n(9, 13), bags: n(3, 4), boilers: R.chance(0.5) ? 1 : 2, keel: R.chance(0.4) });
      engines(n(2, 3), { dirs: R.chance(0.5) ? [] : [undefined, undefined, 'up'] });
      for (let i = n(3, 4); i > 0; i--) add('armour', rng.pick(['lower', 'main', 'catwalk']), rng.pick(['fore', 'aft', 'mid']));
      spread('gun', n(2, 4), ['catwalk', 'lower', 'catwalk', 'nest'], ['fore', 'aft', 'mid', 'mid']);
      if (R.chance(0.7)) add('gun_mortar', 'catwalk', 'mid');
      if (R.chance(0.6)) add('gun_long', 'catwalk', side());
      if (R.chance(0.5)) add('gun_flak', 'catwalk', 'mid');
      add('extinguisher', 'main', 'mid');
      break;
    case 'skiff':
      R.hull({ lower: n(5, 7), bags: 1, boilers: 1, noMain: R.chance(0.5), small: true });
      engines(n(2, 3), { swivel: R.chance(0.4) ? 1 : 0 });
      spread(R.chance(0.5) ? 'gun_long' : 'gun', n(1, 3), ['catwalk', 'lower', 'catwalk'], ['fore', 'aft', 'mid']);
      spread('sail', n(1, 2), ['catwalk', 'catwalk'], ['mid', 'fore']);
      break;
    case 'gunboat':
      R.hull({ lower: n(9, 12), bags: n(1, 2), boilers: n(1, 2), ammos: 2 });
      engines(n(2, 3));
      spread('gun', n(5, 7), ['lower', 'catwalk', 'lower', 'catwalk', 'nest', 'lower', 'catwalk'], ['fore', 'fore', 'aft', 'aft', 'mid', 'mid', 'mid']);
      add('rack_hammer', 'lower', 'mid');
      add('rack_hammer', 'catwalk', 'mid');
      break;
    case 'sapper':
      R.hull({ lower: n(8, 11), bags: n(1, 2), boilers: n(1, 2), keel: R.chance(0.5) });
      engines(n(3, 4), { dirs: [undefined, undefined, 'up'], swivel: R.chance(0.5) ? 1 : 0 });
      spread('mineLayer', n(1, 2), ['lower', 'keel'], ['mid', 'aft']);
      add('gun_long', 'catwalk', side());
      if (R.chance(0.6)) add('gun_flak', 'catwalk', 'mid');
      if (R.chance(0.5)) add('gun', 'catwalk', 'fore');
      if (R.chance(0.5)) add('sail', 'catwalk', 'mid');
      break;
    default: { // wildcard: three to five weapon families picked at random, a random engine line-up, a random hull
      R.hull({ lower: n(6, 14), bags: n(1, 4), boilers: n(1, 2), keel: R.chance(0.25), tall: R.chance(0.3) });
      engines(n(2, 4), { dirs: [undefined, undefined, rng.pick([undefined, 'up', 'upfwd'])], swivel: R.chance(0.3) ? 1 : 0 });
      const families = [() => spread('gun_long', n(1, 2), gunRows, ['fore', 'aft']), () => spread('gun_mortar', n(1, 2), ['catwalk', 'nest'], ['mid']), () => spread('gun_scatter', n(1, 3), gunRows, ['fore', 'aft']),
        () => add('gun_flak', 'catwalk', 'mid'), () => spread('gun_harpoon', 1, gunRows, ['fore']), () => spread('gun_flame', n(1, 2), ['catwalk', 'lower'], ['nose']), () => add('mineLayer', 'lower', 'mid'),
        () => add('ramProw', 'main', 'nose'), () => spread('gun', n(2, 4), ['catwalk', 'lower', 'nest'], ['fore', 'aft', 'mid']), () => add('crewCannon', 'catwalk', 'fore'), () => add('bombBay', 'lower', 'mid'),
        () => { for (let i = n(1, 3); i > 0; i--) add('armour', rng.pick(['main', 'lower', 'catwalk']), rng.pick(['fore', 'aft', 'mid'])); }, () => spread('sail', n(1, 2), ['catwalk'], ['mid', 'fore'])];
      for (let i = n(3, 5); i > 0; i--) families.splice(rng.int(0, families.length - 1), 1)[0]();
    }
  }
}

// The things every ship carries (the crew's tools and the six stations): the recipe only says how many boilers, coal bunkers and ammo holds.
function crewKit(R, o) {
  const { add, rng } = R;
  add('helm', 'catwalk', rng.chance(0.75) ? 'fore' : 'aft');
  const bu = rng.range(0.3, 0.6);
  for (let i = 0; i < o.boilers; i++) { const u = clamp(bu + i * 0.22, 0.12, 0.88); add('boiler', 'main', [u, u], { alt: 'lower' }); const cu = u > 0.5 ? u - 0.27 : u + 0.27; add('coal', 'lower', [cu, cu]); } // (coal well away from the boiler: a blowout lights it)
  if (o.coals > o.boilers) add('coal', 'lower', [0.5, 0.5]);
  for (let i = 0; i < (o.ammos || 1); i++) add('ammo', 'lower', i ? 'any' : 'mid');
  add('lookout', 'nest', 'mid');
  add('medbay', rng.chance(0.5) ? 'lower' : 'main', rng.chance(0.5) ? 'aft' : 'mid');
  add('rack_hammer', 'lower', 'fore'); add('rack_hammer', 'lower', 'aft'); add('rack_hammer', 'catwalk', 'mid');
  add('rack_sword', 'main', 'mid'); add('rack_hookshot', 'catwalk', 'fore');
  add('extinguisher', 'lower', [bu, bu]); add('extinguisher', 'main', [bu, bu]); add('extinguisher', 'catwalk', 'aft');
  add('boarding', 'catwalk', 'tail'); add('boarding', 'catwalk', 'nose');
  add('vent', 'main', 'fore'); add('vent', 'lower', 'mid');
  if (rng.chance(0.5)) add('searchlight', rng.chance(0.5) ? 'nest' : 'catwalk', 'any');
  add('ladder', 'catwalk', [bu - 0.05, bu - 0.05]); add('ladder', 'main', [bu + 0.06, bu + 0.06]); // (a way down beside the boiler: the coal walk)
}

// ---- making a genome -----------------------------------------------------------------------------------------------------
export function newGenome(seed, theme) {
  const rng = makeRng(seed * 7919 + 17);
  const th = theme && THEMES.includes(theme) ? theme : rng.pick(THEMES);
  const g = { v: 1, theme: th, seed, decks: {}, nest: { w: 3, u: 0.5, tall: false }, bags: { n: 1, twin: false, hover: 42 }, items: [] };
  const H = G().HULL;
  const R = {
    rng, g, chance: rng.chance,
    add(t, row, zone, extra = {}) {
      const z = typeof zone === 'string' ? ZONE[zone] || ZONE.any : zone;
      g.items.push({ t, row, u: +clamp(z[0] + rng() * (z[1] - z[0]), 0, 1).toFixed(3), ...extra });
    },
    hull(o) {
      const cols = clamp(o.lower, H.LOWER[0] - (o.small ? 3 : 0), H.LOWER[1]);
      const x0 = GRID_X0, x1 = x0 + cols * COL;
      g.decks.lower = { x0, x1 };
      if (!o.noMain && !(rng.chance(G().NO_MAIN_CHANCE) && cols <= 9)) {
        const trim = rng.int(H.MAIN_TRIM[0], H.MAIN_TRIM[1]), a = rng.int(0, Math.min(1, trim));
        g.decks.main = { x0: x0 + a * COL, x1: x1 - (trim - a) * COL };
        if (rng.chance(G().OPEN_MAIN_CHANCE)) g.decks.main.out = true;
      }
      const base = g.decks.main || g.decks.lower;
      const ctrim = Math.min(rng.int(H.CAT_TRIM[0], H.CAT_TRIM[1]) + 1, Math.max(0, Math.round((base.x1 - base.x0) / COL) - 4)), ca = rng.int(0, ctrim);
      g.decks.catwalk = { x0: base.x0 + ca * COL, x1: base.x1 - (ctrim - ca) * COL };
      if (o.keel || rng.chance(G().KEEL_CHANCE)) { const k = rng.int(H.KEEL[0], H.KEEL[1]); const a = rng.int(1, Math.max(1, cols - k - 1)); g.decks.keel = { x0: x0 + a * COL, x1: x0 + (a + k) * COL }; }
      g.nest = { w: rng.int(H.NEST[0], H.NEST[1]), u: rng.range(0.3, 0.7), tall: !!o.tall || rng.chance(G().TALL_NEST_CHANCE) };
      g.bags = { n: o.bags || 1, twin: (o.bags || 1) === 1 && rng.chance(G().TWIN_CHANCE), hover: Math.round(rng.range(G().HOVER[0], G().HOVER[1])) }; // (a twin envelope: more lift for the same length)
      if (rng.chance(G().BALLAST_CHANCE)) R.add('ballast', rng.pick(['lower', 'main']), rng.pick(['tail', 'aft'])); // (a sandbag aft: a fine trim, and a weight to carry)
      crewKit(R, { boilers: o.boilers || 1, coals: o.coals || 0, ammos: o.ammos || 1 });
    },
  };
  recipe(th, R);
  const engs = g.items.filter((it) => it.t === 'engine' || it.t === 'engineSwivel').length;
  if (g.items.filter((it) => it.t === 'boiler').length === 1 && engs < 3 && !g.items.some((it) => it.t === 'lift')) R.add('lift', 'main', 'mid'); // (one boiler, two engines idles at full pressure: the steam lift is a second steam user)
  if (g.nest.tall) { R.add('gun', 'crow2', 'mid'); }
  if (g.bags.n >= 3) for (let i = 0; i < g.bags.n; i++) g.items.push({ t: 'gasValve', row: 'nest', u: 0.5, bag: i });
  return g;
}

// ---- building a genome into parts ------------------------------------------------------------------------------------------
const spanOf = (parts, row) => {
  const d = parts.filter((p) => p.part === 'deck' && rowOfId(p.id) === row);
  return d.length ? [Math.min(...d.map((q) => q.x0)), Math.max(...d.map((q) => q.x1))] : null;
};
const standing = (parts) => parts.filter((p) => ['station', 'engine', 'gun', 'searchlight', 'sail', 'crewCannon'].includes(p.part) || (p.part === 'station')).map((p) => ({ p: p.p, x: p.x }));

// Stations the Action button cannot reach (partsShop.js hijacks, the Shipwright's "HIJACK" rule): a rack, a vent, an extinguisher or a steam valve nearer than HIJACK px to a station on the same
// deck takes the button before the station does (a bot stops a few px short of its station, a hand reaches 65), so nobody could man that gun or stoke that boiler. A random ship that ignores it
// has half her stations dead, so every item is dropped on the nearest spot that does not make it worse (and a spare rack that fits nowhere is simply left off).
const HIJACK = 80;
export function hijackCount(parts) {
  let L;
  try { L = buildLayout(parts); } catch { return 1e6; }
  const hs = [...L.racks, ...L.vents, ...L.extinguishers, ...L.pipes.map((q) => ({ d: q.d, x: q.valve[0] })), ...(L.gasValves || [])];
  let n = 0;
  for (const st of L.stations) for (const h of hs) if (h.d === st.d && Math.abs(h.x - st.x) < HIJACK) n++;
  return n;
}
// Take off the spare racks, vents, extinguishers and valves that still hijack a station (the bags and the engines moved things after they were placed).
function clearHijacks(parts) {
  let p = parts;
  for (let pass = 0; pass < 12; pass++) {
    let L;
    try { L = buildLayout(p); } catch { return p; }
    const hs = [...L.racks.map((h) => ({ h, part: 'rack' })), ...L.vents.map((h) => ({ h, part: 'vent' })), ...L.extinguishers.map((h) => ({ h, part: 'extinguisher' })), ...(L.gasValves || []).map((h) => ({ h, part: 'gasValve' }))];
    const bad = hs.find(({ h }) => L.stations.some((st) => st.d === h.d && Math.abs(st.x - h.x) < HIJACK));
    if (!bad) { // (a steam valve that sits on a gun or a lamp: that spare weapon comes off, unless it is the last)
      const valve = L.pipes.map((q) => ({ d: q.d, x: q.valve[0] }));
      const st = L.stations.find((s) => ['gun', 'searchlight', 'sail'].includes(s.kind) && valve.some((v) => v.d === s.d && Math.abs(v.x - s.x) < HIJACK));
      if (!st || (st.kind === 'gun' && L.stations.filter((s) => s.kind === 'gun').length < 2)) return p;
      const dropped = p.dropped;
      p = p.filter((q) => !((q.part === 'gun' || q.part === 'searchlight' || q.part === 'sail') && (q.n === st.n)));
      p.dropped = dropped;
      continue;
    }
    const i = p.findIndex((q) => q.part === bad.part && q.p === bad.h.p && q.x === bad.h.x && (q.kind || '') === (bad.h.kind || ''));
    if (i < 0) return p;
    const dropped = p.dropped;
    p = p.filter((_, j) => j !== i);
    p.dropped = dropped;
  }
  return p;
}
const SPARE = new Set(['rack_hammer', 'rack_sword', 'rack_hookshot', 'rack_ice', 'rack_sandbag', 'rack_crate', 'rack_towline', 'extinguisher', 'vent', 'gasValve', 'searchlight', 'ballast', 'ballast_hang', 'boarding', 'armour']); // (extras that are better left off than put where they hurt)

// Drop one item on the nearest legal slot of its type on its row that does not take a station away. Returns the new parts, or null when there is no room.
function placeItem(p, it) {
  let slots = slotsFor(it.t, p);
  let row = it.row;
  if (it.t === 'gasValve') slots = slots.filter((s) => s.feeds === it.bag);
  else {
    slots = slots.filter((s) => rowOfId(s.p) === row);
    if (!slots.length && it.alt) { row = it.alt; slots = slotsFor(it.t, p).filter((s) => rowOfId(s.p) === row); } // (the row is full or missing: the other one)
  }
  if (!slots.length) return null;
  const sp = spanOf(p, row) || [0, 0];
  const tx = sp[0] + it.u * (sp[1] - sp[0]);
  slots.sort((a, b) => Math.abs(a.x - tx) - Math.abs(b.x - tx));
  const dir = it.dir != null ? { dir: it.dir } : undefined;
  if (it.t === 'ladder' || it.t === 'pole') {
    const mine = standing(p); // a ladder never lands on a station (the button would climb instead of work)
    for (const s of slots.slice(0, 12)) {
      const next = s.apply(p);
      const c = next.find((q, i) => i >= p.length && (q.part === 'ladder' || q.part === 'pole' || q.part === 'rope'));
      if (c && !mine.some((m) => (m.p === c.top || m.p === c.bottom) && Math.abs(m.x - c.xTop) < 70)) return next;
    }
    return null;
  }
  const base = hijackCount(p);
  let best = null;
  for (const s of slots.slice(0, 16)) {
    const next = s.apply(p, dir), h = hijackCount(next);
    if (h <= base) return next;
    if (!best || h < best.h) best = { next, h };
  }
  return SPARE.has(it.t) ? null : best.next;
}

// Resize the bag(s) to her weight: n bags side by side, centred on her centre of mass (so she is level), as long as the hover level asks (a bag is 232 px tall: lift is length).
export function fitBags(p, bags) {
  const E = config.BUILD_EDIT, ry = E.BAG_RY;
  const gone = erase(p, 'gasbag', -1e6, 1e6);
  let q = gone.ok ? gone.parts : p;
  const n = clamp(bags.n || 1, 1, E.BAGS_MAX);
  const twinF = n === 1 && bags.twin ? 1 + 0.7 * 0.62 : 1;
  for (let it = 0; it < 3; it++) {
    const now = budgets(q);
    const rest = budgets(q.filter((o) => o.part !== 'gasbag')); // (everything but the bags: lift engines pointing up lift too)
    const mass = rest.mass + n * config.BALANCE.MASS.bag + (n === 1 && bags.twin ? config.BALANCE.MASS.bagTwin : 0);
    const lift = config.GAS.NEUTRAL + mass - rest.lift - bags.hover;
    let rx = clamp((lift * 1560) / ry / twinF, E.BAG_MIN * n, E.BAG_MAX * n); // total half-length
    rx = Math.round(rx / 10) * 10;
    const cx = Math.round(now.com ? now.com.x : 800);
    let r = q.filter((o) => o.part !== 'gasbag');
    for (let i = 0; i < n; i++) {
      const a = cx - rx + (2 * rx * i) / n, b = cx - rx + (2 * rx * (i + 1)) / n;
      const d = drawBag(r, Math.round(a), Math.round(b));
      if (!d.ok) return null;
      r = d.parts;
    }
    q = r;
  }
  if (n === 1 && bags.twin) { const t = setBag(q, { twin: true }); if (t.ok) q = t.parts; }
  return q;
}

export function buildGenome(g) {
  let p = emptyBuild();
  const op = (r) => { if (r.ok) p = r.parts; return r.ok; };
  for (const row of ['lower', 'main', 'catwalk', 'keel']) {
    const d = g.decks[row];
    if (!d) continue;
    if (!op(drawDeck(p, row, d.x0, d.x1, d.out == null ? {} : { covered: !d.out }))) return null;
  }
  const all = [g.decks.lower, g.decks.main, g.decks.catwalk, g.decks.keel].filter(Boolean);
  const lo = Math.min(...all.map((d) => d.x0)), hi = Math.max(...all.map((d) => d.x1));
  if (!op(drawBag(p, lo - 60, hi + 60))) return null; // (a first bag over the hull: the nest and the parts need one; it is resized to her weight below)
  const order = (list) => list.map((it, i) => [it, i]).sort((a, b) => priOf(a[0].t) - priOf(b[0].t) || a[1] - b[1]).map((x) => x[0]);
  const dropped = [];
  const put = (list) => { for (const it of order(list)) { const next = placeItem(p, it); if (next) p = next; else dropped.push(it.t + '@' + it.row); } };
  const onNest = (it) => it.row === 'nest' || it.row === 'crow2';
  put(g.items.filter((it) => !onNest(it) && it.t !== 'gasValve'));
  let fit = fitBags(p, g.bags);
  if (!fit) return null;
  p = fit;
  // the crow's nest sits on the bag (a nest anywhere along it: u), with an upper nest on a mast above it when the genome has one
  const bags = p.filter((o) => o.part === 'gasbag');
  const b0 = Math.min(...bags.map((b) => b.cx - b.rx)), b1 = Math.max(...bags.map((b) => b.cx + b.rx));
  const nw = g.nest.w * COL, nx0 = Math.round(clamp(b0 + (b1 - b0 - nw) * g.nest.u, b0 + 40, b1 - nw - 40));
  if (b1 - b0 < nw + 80 || !op(drawDeck(p, 'nest', nx0, nx0 + nw))) return null;
  if (g.nest.tall && nw >= 3 * COL) op(drawDeck(p, 'crow2', nx0 + COL, nx0 + nw - COL));
  put(g.items.filter((it) => onNest(it) && !(it.row === 'crow2' && !spanOf(p, 'crow2'))));
  fit = fitBags(p, g.bags);
  if (!fit) return null;
  p = fit;
  put(g.items.filter((it) => it.t === 'gasValve'));
  p = clearHijacks(p);
  p.dropped = dropped; // (non-enumerable noise for the repair loop; JSON.stringify of an array ignores it)
  return p;
}

// ---- judging a build ----------------------------------------------------------------------------------------------------------
const WARN_COST = { Advice: 4, Gasbag: 6, Lift: 6, Walking: 8, Steam: 6, Balance: 8, Fire: 8, 'Break-off': 5, Thrust: 5, Sails: 4, Decks: 3 };
export function judge(parts, cap) {
  let v;
  try { v = validate(parts); } catch (e) { return { v: null, score: 1e6, fails: ['validate threw: ' + e.message], mass: 0 }; }
  const b = budgets(parts);
  let score = v.fails.length * 100;
  for (const c of v.checks) if (c.level === 'WARN') score += WARN_COST[c.group] || 5;
  const over = Math.round(b.mass) - cap; // (the shelf compares the rounded weight)
  if (over > 0) score += 100 + over;
  return { v, score, fails: v.fails, mass: b.mass, over };
}

// ---- the repair loop -----------------------------------------------------------------------------------------------------------
// Looks at what validate() says and edits the GENOME: a ladder for a long walk, a second boiler for weak steam, a smaller hull for a fit failure, the heaviest extra gone when she is over the cap.
function repairOnce(g, j, rng, parts) {
  const groups = new Set(j.v ? j.v.checks.filter((c) => c.level === 'FAIL' || c.level === 'WARN').map((c) => c.group) : []);
  const failGroups = new Set(j.v ? j.v.checks.filter((c) => c.level === 'FAIL').map((c) => c.group) : []);
  const add = (it) => g.items.push(it);
  const count = (t) => g.items.filter((it) => it.t === t).length;
  const letGo = () => {
    for (const t of LET_GO) {
      const idx = g.items.map((it, i) => [it, i]).filter(([it]) => it.t === t).map(([, i]) => i);
      if (idx.length) { g.items.splice(idx[idx.length - 1], 1); return true; }
    }
    return false;
  };
  if (!j.v) return letGo();
  if (j.over > 0) return letGo();
  const text = j.v.checks.filter((c) => c.level === 'FAIL' || c.level === 'WARN').map((c) => c.group + ': ' + c.text).join(' | ');
  if (failGroups.has('Fit')) {
    const k = ['lower', 'main', 'catwalk', 'keel'].find((r) => g.decks[r] && g.decks[r].x1 - g.decks[r].x0 > 4 * COL);
    if (!k) return false;
    for (const r of ['lower', 'main', 'catwalk']) if (g.decks[r] && g.decks[r].x1 - g.decks[r].x0 > 5 * COL) g.decks[r].x1 -= COL;
    return true;
  }
  if (groups.has('Steam') && /cannot keep up|settled pressure at cruise/.test(text)) {
    if (count('boiler') < 3 && !j.over) { add({ t: 'boiler', row: 'main', alt: 'lower', u: rng.range(0.2, 0.8) }); add({ t: 'coal', row: 'lower', u: rng.range(0.2, 0.8) }); return true; }
    const e = g.items.findIndex((it) => it.t === 'engine'); if (e >= 0) { g.items.splice(e, 1); return true; }
  }
  if (groups.has('Walking')) {
    if (/ammo hold to the farthest gun/.test(text) && count('ammo') < 3) { add({ t: 'ammo', row: 'lower', u: rng.pick([0.15, 0.85, 0.5]) }); return true; }
    if (/coal bunker to its boiler/.test(text)) { add({ t: 'ladder', row: 'main', u: rng.range(0.1, 0.9) }); add({ t: 'pole', row: 'main', u: rng.range(0.1, 0.9) }); return true; }
    add({ t: rng.chance(0.5) ? 'ladder' : 'pole', row: rng.pick(['catwalk', 'main']), u: rng.range(0.1, 0.9) });
    return true;
  }
  if (failGroups.has('Geometry') || failGroups.has('Connectivity') || failGroups.has('Required kinds')) {
    if (parts && parts.dropped && parts.dropped.length > 4) return letGo();
    add({ t: 'ladder', row: rng.pick(['catwalk', 'main']), u: rng.range(0.05, 0.95) });
    return rng.chance(0.5) ? true : letGo();
  }
  if (failGroups.has('Lift')) { g.bags.twin = !g.bags.twin; g.bags.hover = Math.min(g.bags.hover + 4, 60); return letGo() || true; }
  if (groups.has('Balance')) { if (count('ballast') < 6) { add({ t: 'ballast', row: 'lower', u: rng.pick([0.05, 0.95]) }); return true; } return letGo(); }
  if (groups.has('Gasbag') && /hangs off|off the end/.test(text)) { g.nest.w = Math.max(2, g.nest.w - 1); g.nest.u = 0.5; return true; }
  if (groups.has('Gasbag') && /covers x/.test(text)) { g.bags.hover = Math.max(config.BUILD_CHECK.HOVER_MIN + 2, g.bags.hover - 5); return g.bags.hover > config.BUILD_CHECK.HOVER_MIN + 3; }
  if (groups.has('Lift') && /rides high/.test(text)) { add({ t: 'ballast', row: 'lower', u: rng.range(0.1, 0.9) }); return true; }
  const missing = (j.v.advice || []).filter((a) => a.tier === 'rec' && ADVICE_FIX[a.key]); // (a part she should have and does not: the spot was full or had no room, try another deck)
  if (missing.length) {
    const [t, rows] = ADVICE_FIX[missing[0].key];
    const have = rows.filter((r) => g.decks[r] || r === 'nest');
    if (have.length) { add({ t, row: rng.pick(have), u: +rng.range(0.1, 0.9).toFixed(3) }); return true; }
  }
  if (failGroups.size) return letGo();
  return false;
}
const ADVICE_FIX = { helm: ['helm', ['catwalk', 'main']], boiler: ['boiler', ['main', 'lower']], coal: ['coal', ['lower', 'main', 'keel']], ammo: ['ammo', ['lower', 'main', 'keel']], lookout: ['lookout', ['nest']], medbay: ['medbay', ['lower', 'main', 'keel']], hammer: ['rack_hammer', ['lower', 'main', 'catwalk']], extinguisher: ['extinguisher', ['lower', 'main', 'catwalk']], sword: ['rack_sword', ['main', 'lower', 'catwalk']], boarding: ['boarding', ['catwalk', 'main']], engine: ['engine', ['lower', 'main']], gun: ['gun', ['catwalk', 'lower']] };

// Repair a genome until it validates with no FAIL and is under the cap. Returns { g, parts, j } or null.
export function makeValid(g0, rng, cap = weightCap()) {
  const g = clone(g0);
  let best = null;
  for (let pass = 0; pass <= G().REPAIRS; pass++) {
    const parts = buildGenome(g);
    if (!parts) { if (!g.items.length || !letGoAny(g)) return best; continue; }
    const j = judge(parts, cap);
    if (!best || j.score < best.j.score) best = { g: clone(g), parts, j };
    if (!j.fails.length && !(j.over > 0) && j.score < 30 && !(j.v.advice || []).some((a) => a.tier === 'rec')) return { g, parts, j };
    if (!repairOnce(g, j, rng, parts)) break;
  }
  return best && !best.j.fails.length && !(best.j.over > 0) ? best : null;
}
function letGoAny(g) {
  for (const t of LET_GO) { const i = g.items.findIndex((it) => it.t === t); if (i >= 0) { g.items.splice(i, 1); return true; } }
  return false;
}

// ---- evolution operators ---------------------------------------------------------------------------------------------------------
const ADDABLE = [['gun', 3], ['gun_long', 2], ['gun_mortar', 2], ['gun_scatter', 2], ['gun_flak', 1], ['gun_harpoon', 1], ['gun_flame', 1], ['mineLayer', 1], ['armour', 3], ['engine', 2], ['engineSwivel', 1], ['sail', 1], ['ballast', 1], ['extinguisher', 1], ['rack_hammer', 1], ['ladder', 1], ['crewCannon', 0.5], ['ramProw', 0.5], ['bombBay', 0.5], ['searchlight', 0.5], ['boiler', 0.5], ['ammo', 0.5]];
const ROWS_FOR = { gun: ['catwalk', 'lower', 'nest'], gun_long: ['catwalk', 'lower', 'nest'], gun_mortar: ['catwalk', 'nest'], gun_scatter: ['lower', 'catwalk', 'main'], gun_flak: ['catwalk', 'nest'], gun_harpoon: ['catwalk', 'lower'], gun_flame: ['catwalk', 'lower', 'main'], mineLayer: ['lower', 'keel'], armour: ['lower', 'main', 'catwalk'], engine: ['lower', 'main'], engineSwivel: ['lower', 'main'], sail: ['catwalk', 'nest'], ballast: ['lower', 'main'], extinguisher: ['lower', 'main', 'catwalk'], rack_hammer: ['lower', 'main', 'catwalk'], ladder: ['catwalk', 'main'], crewCannon: ['catwalk'], ramProw: ['main', 'lower'], bombBay: ['lower'], searchlight: ['nest', 'catwalk'], boiler: ['main', 'lower'], ammo: ['lower'] };
const CORE = ['helm', 'boiler', 'coal', 'ammo', 'lookout', 'medbay'];
function weighted(rng, table) { const tot = table.reduce((n, [, w]) => n + w, 0); let r = rng() * tot; for (const [t, w] of table) { r -= w; if (r <= 0) return t; } return table[0][0]; }

// One to three changes: add / move / remove a part, re-aim an engine, resize the bags, change a deck's length, flip a deck open or covered.
export function mutateGenome(g0, rng) {
  const g = clone(g0);
  g.theme = g.theme || 'wildcard';
  const tags = [];
  for (let k = rng.int(1, 3); k > 0; k--) {
    const r = rng();
    if (r < 0.28) { const t = weighted(rng, ADDABLE); g.items.push({ t, row: rng.pick(ROWS_FOR[t]), u: +rng.range(0.05, 0.95).toFixed(3), ...(t === 'engine' && rng.chance(0.4) ? { dir: ENGINE_DIRS[rng.int(1, 7)] } : {}) }); tags.push('+' + t); }
    else if (r < 0.46) { const idx = g.items.map((it, i) => [it, i]).filter(([it]) => !CORE.includes(it.t) && it.t !== 'gasValve'); if (idx.length) { const [it, i] = rng.pick(idx); g.items.splice(i, 1); tags.push('-' + it.t); } }
    else if (r < 0.64) { const idx = g.items.filter((it) => it.t !== 'gasValve' && !(it.row === 'nest')); if (idx.length) { const it = rng.pick(idx); it.u = +clamp(it.u + rng.range(-0.3, 0.3), 0.03, 0.97).toFixed(3); if (rng.chance(0.3) && ROWS_FOR[it.t]) it.row = rng.pick(ROWS_FOR[it.t]); tags.push('move ' + it.t); } }
    else if (r < 0.74) { const es = g.items.filter((it) => it.t === 'engine' || it.t === 'engineSwivel'); if (es.length) { const e = rng.pick(es); e.dir = ENGINE_DIRS[rng.int(0, 7)]; tags.push('aim engine'); } }
    else if (r < 0.84) { const b = g.bags; if (rng.chance(0.5)) b.n = clamp(b.n + (rng.chance(0.5) ? 1 : -1), 1, 4); else if (rng.chance(0.5)) b.twin = !b.twin; else b.hover = clamp(b.hover + rng.int(-6, 6), 30, 56); tags.push('bags'); }
    else if (r < 0.94) { const rows = ['lower', 'main', 'catwalk'].filter((x) => g.decks[x]); const row = rng.pick(rows), d = g.decks[row]; const dx = rng.chance(0.5) ? COL : -COL; if (rng.chance(0.5)) d.x1 += dx; else d.x0 -= dx; if (d.x1 - d.x0 < 4 * COL) d.x1 = d.x0 + 4 * COL; tags.push('hull'); }
    else { const rows = ['main', 'catwalk'].filter((x) => g.decks[x]); const d = g.decks[rng.pick(rows)]; if (d) { d.out = d.out ? undefined : true; if (d.out === undefined) delete d.out; } tags.push('flip deck'); }
  }
  g.bags.twin = g.bags.n === 1 && g.bags.twin;
  g.mut = tags;
  return g;
}

// Cross two genomes: A's hull, bags and crew kit with B's weapons and engines (the "weapon set" swap), or A's aft half with B's fore half (the "sections" swap). Items map by row and u.
export function crossGenome(a, b, rng) {
  const g = clone(a);
  const isGear = (it) => /^gun/.test(it.t) || ['mineLayer', 'ramProw', 'crewCannon', 'armour', 'sail', 'engine', 'engineSwivel', 'bombBay', 'rack_towline'].includes(it.t);
  const mode = rng.chance(0.5) ? 'weapons' : 'sections';
  if (mode === 'weapons') {
    g.items = a.items.filter((it) => !isGear(it)).concat(clone(b.items.filter(isGear)));
  } else {
    const cut = rng.range(0.35, 0.65);
    g.items = a.items.filter((it) => it.u < cut || it.row === 'nest' || it.t === 'gasValve').concat(clone(b.items.filter((it) => it.u >= cut && it.row !== 'nest' && it.t !== 'gasValve' && !CORE.includes(it.t))));
  }
  if (rng.chance(0.3)) g.bags = { ...clone(b.bags) };
  g.theme = a.theme + 'x' + b.theme;
  g.mut = ['cross ' + mode];
  return g;
}

// ---- describing a ship -------------------------------------------------------------------------------------------------------------
// What a build has, as a count per kind of thing (from the PARTS list, so an evolved or hand-drawn ship is described right).
export function inventory(parts) {
  const c = { gun: 0, long: 0, mortar: 0, scatter: 0, flak: 0, harpoon: 0, flame: 0, mines: 0, ram: 0, cannon: 0, armour: 0, sails: 0, engines: 0, upEngines: 0, swivel: 0, bags: 0, twin: 0, bombBay: 0, boilers: 0, nests: 0, keel: 0, towline: 0, cargo: 0, lift: 0, hookshot: 0 };
  for (const p of parts) {
    if (p.part === 'gun') { if (p.gtype === 'mines') c.mines++; else if (p.gtype && c[p.gtype] != null) c[p.gtype]++; else c.gun++; }
    else if (p.part === 'mineLayer') c.mines++;
    else if (p.part === 'ramProw') c.ram++;
    else if (p.part === 'crewCannon') c.cannon++;
    else if (p.part === 'armour') c.armour += (p.x1 - p.x0) / 100;
    else if (p.part === 'sail') c.sails++;
    else if (p.part === 'engine') { c.engines++; if (p.dir != null && Math.sin(p.dir) < -0.5) c.upEngines++; if (p.swivel) c.swivel++; }
    else if (p.part === 'gasbag') { c.bags++; if (p.twin) c.twin++; }
    else if (p.part === 'station' && p.kind === 'bombBay') c.bombBay++;
    else if (p.part === 'station' && p.kind === 'boiler') c.boilers++;
    else if (p.part === 'deck' && p.row === 'keel') c.keel++;
    else if (p.part === 'deck' && (p.row === 'nest' || p.row === 'crow2')) c.nests++;
    else if (p.part === 'rack' && p.kind === 'towline') c.towline++;
    else if (p.part === 'rack' && (p.kind === 'sandbag' || p.kind === 'crate')) c.cargo++;
    else if (p.part === 'rack' && p.kind === 'hookshot') c.hookshot++;
    else if (p.part === 'lift') c.lift++;
  }
  return c;
}

// The part-presence tags the statistics use (tools/shipforge.mjs): one string per notable thing a ship has.
export function tagsOf(parts) {
  const c = inventory(parts), t = [];
  const has = (k, n = 1) => c[k] >= n;
  if (has('long')) t.push('long gun'); if (has('long', 2)) t.push('2+ long guns');
  if (has('mortar')) t.push('mortar'); if (has('scatter')) t.push('grapeshot'); if (has('scatter', 3)) t.push('3+ grapeshot'); if (has('flak')) t.push('flak'); if (has('harpoon')) t.push('harpoon'); if (has('flame')) t.push('flamethrower');
  if (has('mines')) t.push('mine layer'); if (has('ram')) t.push('ram prow'); if (has('cannon')) t.push('crew cannon'); if (has('armour', 2)) t.push('armour 2+ cols'); if (has('armour', 5)) t.push('armour 5+ cols');
  if (has('sails')) t.push('sail'); if (has('upEngines')) t.push('lift engine'); if (has('swivel')) t.push('swivel engine'); if (has('engines', 4)) t.push('4+ engines'); if (c.engines <= 2) t.push('2 or fewer engines');
  if (has('bags', 2)) t.push('2+ bags'); if (has('bags', 3)) t.push('3+ bags'); if (has('twin')) t.push('twin envelope bag'); if (has('bombBay')) t.push('bomb bay'); if (has('boilers', 2)) t.push('2+ boilers');
  if (has('nests', 2)) t.push('upper nest'); if (has('keel')) t.push('keel deck'); if (has('towline')) t.push('towline'); if (has('cargo')) t.push('cargo racks'); if (has('lift')) t.push('steam lift');
  if (c.gun + c.long + c.mortar + c.scatter + c.flak + c.harpoon + c.flame >= 6) t.push('6+ guns');
  if (parts.some((p) => p.part === 'ballast')) t.push('ballast'); if (parts.some((p) => p.part === 'gasValve')) t.push('gas valves'); if (parts.some((p) => p.part === 'searchlight')) t.push('searchlight');
  const decks = parts.filter((p) => p.part === 'deck');
  if (decks.some((d) => d.row === 'main' && d.outside)) t.push('open main deck');
  const lo = decks.filter((d) => d.row === 'lower')[0];
  if (lo && lo.x1 - lo.x0 >= 12 * COL) t.push('long hull'); if (lo && lo.x1 - lo.x0 <= 8 * COL) t.push('short hull');
  return t;
}
export const TAG_LIST = ['long gun', '2+ long guns', 'mortar', 'grapeshot', '3+ grapeshot', 'flak', 'harpoon', 'flamethrower', 'mine layer', 'ram prow', 'crew cannon', 'armour 2+ cols', 'armour 5+ cols', 'sail', 'lift engine', 'swivel engine', '4+ engines', '2 or fewer engines', '2+ bags', '3+ bags', 'twin envelope bag', 'bomb bay', '2+ boilers', 'upper nest', 'keel deck', 'towline', 'cargo racks', 'steam lift', '6+ guns', 'ballast', 'gas valves', 'searchlight', 'open main deck', 'long hull', 'short hull'];

// "long-range kiter with mortars and mines": the role from the weapon bands (what range she fights at), then her three most distinctive parts.
export function roleOf(parts) {
  const c = inventory(parts), b = budgets(parts);
  const long = 2 * c.long + 1.5 * c.mortar + 0.5 * c.mines, mid = c.gun + 0.5 * c.flak, short = c.scatter + c.harpoon + 1.5 * c.flame + 3 * c.ram + 2 * c.cannon;
  if (c.ram) return 'ram-prow bruiser';
  if (c.flame >= 1 && short >= mid) return 'fireship';
  if (c.cannon && short >= long) return 'boarding raider';
  if (c.bombBay && c.gun + c.long + c.scatter + c.mortar <= 3) return 'bomber';
  if (c.bags >= 3 && c.armour >= 3) return 'floating fortress';
  if (b.mass < 95 && c.engines >= 2) return 'speedy skiff';
  if (c.mines >= 2 && long >= 2) return 'mine-laying sapper';
  const top = Math.max(long, mid, short);
  if (top < 1) return 'unarmed drifter';
  return top === long ? 'long-range kiter' : top === short ? 'close-quarters brawler' : 'broadside gunboat';
}
export function describeShip(parts) {
  const c = inventory(parts);
  const f = [];
  const n = (k, one, many) => { if (c[k]) f.push(c[k] === 1 ? one : `${many}`); };
  n('long', 'a long gun', 'long guns'); n('mortar', 'a mortar', 'mortars'); n('mines', 'a mine layer', 'mines'); n('scatter', 'grapeshot', 'grapeshot'); n('flak', 'a flak gun', 'flak'); n('harpoon', 'a harpoon', 'harpoons'); n('flame', 'a flamethrower', 'flamethrowers');
  n('ram', 'a ram prow', 'a ram prow'); n('cannon', 'a crew cannon', 'crew cannons'); n('bombBay', 'a bomb bay', 'a bomb bay');
  if (c.armour >= 5) f.push('heavy armour'); else if (c.armour >= 2) f.push('armour plate');
  if (c.sails) f.push(c.sails > 1 ? 'sails' : 'a sail'); if (c.upEngines) f.push('lift engines'); if (c.swivel) f.push('swivel engines');
  if (c.bags >= 3) f.push(c.bags + ' gasbags'); else if (c.twin) f.push('a twin-envelope bag');
  if (c.gun >= 4) f.push(c.gun + ' broadside guns');
  const pick = f.slice(0, 3);
  const role = roleOf(parts);
  return role + (pick.length ? ' with ' + (pick.length > 1 ? pick.slice(0, -1).join(', ') + ' and ' + pick[pick.length - 1] : pick[0]) : '');
}

const ADJ = {
  kiter: ['Distant', 'Silver', 'Far', 'Patient', 'Quiet', 'Longshot'], brawler: ['Iron', 'Grim', 'Stubborn', 'Red', 'Bristling', 'Rough'], rammer: ['Stout', 'Horned', 'Thundering', 'Bold', 'Anvil'], firebrand: ['Ember', 'Smouldering', 'Scarlet', 'Cinder', 'Blazing'],
  raider: ['Sly', 'Midnight', 'Reckless', 'Bold', 'Grinning'], bomber: ['Heavy', 'Falling', 'Thunder', 'Drop', 'Lumbering'], fortress: ['Mighty', 'Granite', 'Bastion', 'Steadfast', 'Great'], skiff: ['Little', 'Swift', 'Nimble', 'Darting', 'Quick'],
  gunboat: ['Broad', 'Loud', 'Salvo', 'Stout', 'Cannonade'], sapper: ['Wicked', 'Sneaky', 'Fuse', 'Tricky', 'Quiet'], wildcard: ['Odd', 'Mad', 'Curious', 'Lucky', 'Patchwork', 'Wayward'],
};
const NOUN = {
  kiter: ['Heron', 'Longbow', 'Kestrel', 'Lantern', 'Marksman'], brawler: ['Bulldog', 'Badger', 'Knuckle', 'Mastiff', 'Hammer'], rammer: ['Ram', 'Bullock', 'Anvil', 'Prow', 'Ox'], firebrand: ['Brand', 'Phoenix', 'Salamander', 'Kettle', 'Torch'],
  raider: ['Corsair', 'Magpie', 'Buccaneer', 'Fox', 'Jackdaw'], bomber: ['Hornet', 'Anvil', 'Thunderhead', 'Stork', 'Whale'], fortress: ['Bastion', 'Tortoise', 'Citadel', 'Barge', 'Keep'], skiff: ['Wasp', 'Sparrow', 'Swift', 'Dart', 'Moth'],
  gunboat: ['Broadside', 'Battery', 'Thunder', 'Volley', 'Gunboat'], sapper: ['Urchin', 'Mole', 'Trapper', 'Tinker', 'Spider'], wildcard: ['Gadabout', 'Contraption', 'Oddity', 'Rascal', 'Whatsit'],
};
const OF = ['of Dawn', 'of the Gale', 'of Brass', 'II', 'of the Reef', 'the Younger'];
// A fun name: an adjective and a noun from the ship's role (or her theme), now and then a flourish.
export function nameShip(seed, theme, parts) {
  const rng = makeRng(seed * 31 + 5);
  const role = parts ? roleOf(parts) : '';
  const key = parts ? Object.keys(THEME_LABEL).find((k) => THEME_LABEL[k] === role) || String(theme).split('x')[0] : String(theme).split('x')[0];
  const th = ADJ[key] ? key : 'wildcard';
  let name = `${rng.pick(ADJ[th])} ${rng.pick(NOUN[th])}`;
  const flourish = rng.pick(OF);
  if (rng.chance(0.18) && name.length + 1 + flourish.length <= G().NAME_MAX) name += ' ' + flourish; // (never cut in the middle of a word)
  return name.slice(0, G().NAME_MAX);
}

// ---- the front door ----------------------------------------------------------------------------------------------------------------
export function statsOf(parts) {
  const b = budgets(parts), v = validate(parts), L = v.layout;
  const lift = v.budgets && v.budgets.lift ? v.budgets.lift : { lift: 0, hover: 0 };
  return { mass: Math.round(b.mass), lift: Math.round(lift.lift), hover: lift.hover, hands: v.budgets && v.budgets.hands ? v.budgets.hands.stations : 0, warns: v.warns.length, fails: v.fails.length, width: v.budgets && v.budgets.fit ? v.budgets.fit.width : 0, ok: v.ok, layoutOk: !!L };
}
export function packShip(seed, g, parts, theme) {
  const st = statsOf(parts);
  return { seed, theme: theme || g.theme, genome: g, parts: parts.map((p) => ({ ...p })), name: nameShip(seed, g.theme, parts), summary: describeShip(parts), tags: tagsOf(parts), ...st };
}
// A valid random ship for a seed (and a theme, or any). Retries with fresh genomes; null only if every try failed.
export function generateShip(seed, { theme, cap = weightCap() } = {}) {
  const rng = makeRng(seed * 104729 + 3);
  for (let t = 0; t < G().TRIES; t++) {
    const g = newGenome(seed * 101 + t, theme);
    const r = makeValid(g, rng, cap);
    if (r) return { ...packShip(seed, r.g, r.parts, g.theme), attempts: t + 1 };
  }
  return null;
}
// A child genome made valid (the combo finder's mutate / cross step); null when it cannot be repaired.
export function repairedChild(g, rng, cap = weightCap()) {
  const r = makeValid(g, rng, cap);
  return r ? r : null;
}
