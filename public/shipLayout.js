// Ship layout as data. The ship is a list of PARTS (public/modules/host/shipBuild.js); this file holds the
// live layout object the whole game reads, generated from the current build.
// Coordinates are world pixels; y grows downward. The ship flies to the RIGHT (bow on the right).
//
// Platforms are the walkable floors. Everything that sits on a floor says which one with `p`
// (a platform id), and also gets `d` = the platform's index, which is what the game code uses.
//
// SHIP_LAYOUT is updated IN PLACE by applyBuild(), so `const P = SHIP_LAYOUT.platforms` style references
// stay valid. Values DERIVED from the layout (a platform index, a station lookup, a route table ...)
// must not be computed once at import time: recompute them in a function, or in an onLayoutChange(fn) hook
// (tools/buildsim.mjs --lint flags new module-level captures). Builds only change at the dock.
import { BUILDS, buildLayout, balanceOf, deckRoles, rowOf, isNestRow } from './modules/host/shipBuild.js';
import { config } from './config.js';

export const SHIP_LAYOUT = { version: 0 };

// The build's STATIC balance (shipBuild.js balanceOf, config.BALANCE): total weight, centre of mass (comX, comY) and centre of lift (colX, colY) in ship
// coordinates, dx = COM - COL (+ = nose-heavy), the rest trim in radians (+ nose-down; 0 for a level ship such as the classic one). Updated in place like
// SHIP_LAYOUT, but kept apart from it so the layout stays the pure shape of the ship. simulation.js adds the live loads (crew, coal ...) to it.
export const SHIP_BALANCE = { mass: 0, comX: 0, comY: 0, colX: 0, colY: 0, dx: 0, deg: 0, restPitch: 0, k2: 0, bagLift: 0 }; // (k2: radius of gyration squared, bagLift: the bags' lift in gas points - forces.js)

const listeners = [];

// Run `fn` every time a new build is applied (it is not run for the build already applied at load).
export function onLayoutChange(fn) {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

// Replace the layout with the one built from `parts`: arrays are emptied and refilled, objects are
// cleared and refilled, so every existing reference sees the new data. Bumps `version`, then tells the listeners.
export function applyBuild(parts) {
  const next = buildLayout(parts, { cell: config.MAPS.CELL }); // (the derived cave fit depends on the map square size)
  for (const key of Object.keys(SHIP_LAYOUT)) if (key !== 'version' && !(key in next)) delete SHIP_LAYOUT[key];
  for (const [key, value] of Object.entries(next)) {
    const cur = SHIP_LAYOUT[key];
    if (Array.isArray(value) && Array.isArray(cur)) {
      cur.length = 0;
      cur.push(...value);
    } else if (value && typeof value === 'object' && !Array.isArray(value) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      for (const k of Object.keys(cur)) delete cur[k];
      Object.assign(cur, value);
    } else {
      SHIP_LAYOUT[key] = value;
    }
  }
  const bal = balanceOf(parts);
  Object.assign(SHIP_BALANCE, { mass: bal.mass, comX: bal.com ? bal.com.x : 0, comY: bal.com ? bal.com.y : 0, colX: bal.col ? bal.col.x : 0, colY: bal.col ? bal.col.y : 0, dx: bal.dx, deg: bal.deg, restPitch: bal.restPitch, k2: bal.k2, bagLift: bal.bagLift });
  SHIP_LAYOUT.version++;
  for (const fn of listeners.slice()) fn(SHIP_LAYOUT);
  return SHIP_LAYOUT;
}

// ---- station kinds ---------------------------------------------------------------------------------------
// Every station (and engine) has a `kind`: helm, boiler, lookout, coal, ammo, gun, searchlight, coil, deflector,
// bombBay, navigator, escort, engine. Names are unique and human ("Fore Boiler") and are what phones show and what
// player.lock holds; CODE asks by kind, so a build may have several of a kind:
//   one(kind)   the first (or only) instance, or undefined      all(kind)  every instance (array, layout order)
//   kindOf(name) the kind of the station/engine with that name   is(name, kind)  kindOf(name) === kind
// "the" boiler/helm/coal bunker/ammo hold/lookout/coil/deflector/bomb bay is one(kind); loops over guns, lamps, engines,
// escort hooks and boilers use all(kind). Lookups are not cached across builds (they read the live arrays).
// (engines are returned as layout.engines entries, which have `name` instead of `n`)
export const all = (kind) => (kind === 'engine' ? SHIP_LAYOUT.engines.slice() : SHIP_LAYOUT.stations.filter((s) => s.kind === kind));
export const one = (kind) => all(kind)[0];
let kindVersion = -1;
const kinds = new Map(); // name -> kind, rebuilt when the layout version changes (kindOf runs in per-frame loops)
export function kindOf(name) {
  if (kindVersion !== SHIP_LAYOUT.version) {
    kinds.clear();
    for (const e of SHIP_LAYOUT.engines) kinds.set(e.name, e.kind);
    for (const s of SHIP_LAYOUT.stations) kinds.set(s.n, s.kind);
    kindVersion = SHIP_LAYOUT.version;
  }
  return kinds.get(name);
}
export const is = (name, kind) => kindOf(name) === kind;
// The instance of `kind` nearest to a point `at` ({ d, x }: platform index and x): same-deck stations win, a deck apart
// costs DECK_COST px of walking. Used to send coal to the nearest boiler, ammo from the nearest hold, and so on.
const DECK_COST = 450;
export const walkCost = (s, at) => Math.abs(s.x - at.x) + DECK_COST * Math.abs(s.d - at.d);
export function nearest(kind, at) {
  const list = all(kind);
  if (list.length < 2 || !at) return list[0];
  return list.reduce((best, s) => (walkCost(s, at) < walkCost(best, at) ? s : best));
}
// Is this deck (a platform id) a crow's nest? A ship may have several (the eraser cuts the nest in two) and a second, higher tier (S.5e).
export const isNestDeck = (id) => { const q = SHIP_LAYOUT.platforms.find((o) => o.id === id); return !!q && isNestRow(rowOf(q)); };
// How high a nest stands: 0 = the nest on the bag, 1 = the high tier (a longer view, config.NEST).
export const nestTier = (id) => { const q = SHIP_LAYOUT.platforms.find((o) => o.id === id); return q && rowOf(q) === 'crow2' ? 1 : 0; };
// A crow's-nest station: a lookout, or a searchlight standing on a nest deck (links.js, linkArt.js, spotter.js).
export const isNestStation = (name) => {
  const s = SHIP_LAYOUT.stations.find((q) => q.n === name);
  return !!s && (s.kind === 'lookout' || (s.kind === 'searchlight' && isNestDeck(s.p)));
};

// The index of the platform that plays a ROLE ('main', 'lower', 'catwalk', 'nest') or has that id, or -1. A minimal ship (S.5e: a bag and any one deck) has
// not got every deck, so the roles are lent: the main deck is the deck nearest the main row, the lower deck the lowest, the top deck ('catwalk') the highest.
// 'nest' is -1 without a crow's nest (strict: no lending). Other ids ('bay', 'pod' ...) are exact. Not cached across builds: call it from a rebuild hook or a function.
export function deckIndex(role) {
  const P = SHIP_LAYOUT.platforms;
  if (!P.length) return -1;
  const roles = deckRoles(P), q = role === 'main' ? roles.main : role === 'lower' ? roles.lower : role === 'catwalk' ? roles.cat : role === 'nest' ? roles.nest : P.find((o) => o.id === role);
  return q ? P.indexOf(q) : -1;
}
// Where somebody who fell off the ship (or bailed out of a plane) comes round: the medical bay, or with no medbay (S.5e) just aboard again on the spawn deck at a
// boarding point (they wake where they fell, with nobody to nurse them). Returns { d, x, medbay }.
export function reviveSpot() {
  const mb = SHIP_LAYOUT.medbay;
  if (mb) { const d = SHIP_LAYOUT.platforms.findIndex((q) => q.id === mb.p); if (d >= 0) return { d, x: mb.x, medbay: true }; }
  const e = SHIP_LAYOUT.boarderEntryPoints, d = Math.max(0, SHIP_LAYOUT.spawnPlatform);
  const p = SHIP_LAYOUT.platforms[d];
  const x = e.length ? e[0].x + Math.random() * (e[e.length - 1].x - e[0].x) : (p.x0 + p.x1) / 2;
  return { d, x: Math.max(p.x0 + 20, Math.min(p.x1 - 20, x)), medbay: false };
}
// What the ship has (every instance counts; engines are in `engines`, not `stations`): the sim and the phones ask this before assuming a part exists.
export const hasKind = (kind) => (kind === 'engine' ? SHIP_LAYOUT.engines.length > 0 : SHIP_LAYOUT.stations.some((s) => s.kind === kind));

applyBuild(BUILDS.classic);
