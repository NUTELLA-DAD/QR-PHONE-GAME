// Ship layout as data. The ship is a list of PARTS (public/modules/host/shipBuild.js); this file holds the
// live layout object the whole game reads, generated from the current build.
// Coordinates are world pixels; y grows downward. The ship flies to the RIGHT (bow on the right).
//
// Platforms are the walkable floors. Everything that sits on a floor says which one with `p`
// (a platform id), and also gets `d` = the platform's index, which is what the game code uses.
//
// A layout is updated IN PLACE by applyBuild(), so `const P = SHIP_LAYOUT.platforms` style references
// stay valid. Values DERIVED from the layout (a platform index, a station lookup, a route table ...)
// must not be computed once at import time: recompute them in a function, or with layoutTables(fn) below
// (tools/buildsim.mjs --lint flags new module-level captures). Builds only change at the dock.
import { BUILDS, buildLayout, balanceOf, deckRoles, rowOf, isNestRow } from './modules/host/shipBuild.js';
import { config } from './config.js';

// A LAYOUT is one ship's live layout object (B1, MOVEMENT.md Option B): createLayout(parts) makes an INSTANCE with its own arrays, objects, version, listeners and
// balance. The station-kind helpers further down (all one kindOf is nearest ... hasKind) are also METHODS of it (layout.one('helm')), and applyBuild(parts) /
// onChange(fn) act on that layout only. The methods are non-enumerable, so Object.keys(layout) and JSON stay the pure shape of the ship.
//
// The ship the game flies today is ship 0 and its layout is SHIP_LAYOUT: the exported SHIP_LAYOUT / SHIP_BALANCE / onLayoutChange / applyBuild (end of this file)
// and the helpers' default argument are COMPATIBILITY forwards to it (ships.js: ship0.layout === SHIP_LAYOUT), kept until the last single-ship file moves over
// (MOVEMENT.md B7). New code takes a layout (mainShip(state).layout / shipOf(state, player).layout) and hands it on.
export function createLayout(parts) {
  const layout = { version: 0 };
  const listeners = [];
  let current = null; // the parts list this layout was last built from (layout.parts: the voyage's build is kept as a list, simulation.js run.build)
  // The build's STATIC balance (shipBuild.js balanceOf, config.BALANCE): total weight, centre of mass (comX, comY) and centre of lift (colX, colY) in ship
  // coordinates, dx = COM - COL (+ = nose-heavy), the rest trim in radians (+ nose-down; 0 for a level ship such as the classic one). Updated in place like
  // the layout, but kept apart from it so the layout stays the pure shape of the ship. simulation.js adds the live loads (crew, coal ...) to it.
  const balance = { mass: 0, comX: 0, comY: 0, colX: 0, colY: 0, dx: 0, deg: 0, restPitch: 0, k2: 0, bagLift: 0 }; // (k2: radius of gyration squared, bagLift: the bags' lift in gas points - forces.js)
  const methods = {
    balance,
    // Run `fn` every time a new build is applied to THIS layout (it is not run for the build already applied at creation). Returns the unsubscribe function.
    onChange(fn) {
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    // Replace the layout with the one built from `newParts`: arrays are emptied and refilled, objects are
    // cleared and refilled, so every existing reference sees the new data. Bumps `version`, then tells the listeners.
    applyBuild(newParts) {
      const next = buildLayout(newParts, { cell: config.MAPS.CELL }); // (the derived cave fit depends on the map square size)
      for (const key of Object.keys(layout)) if (key !== 'version' && !(key in next)) delete layout[key];
      for (const [key, value] of Object.entries(next)) {
        const cur = layout[key];
        if (Array.isArray(value) && Array.isArray(cur)) {
          cur.length = 0;
          cur.push(...value);
        } else if (value && typeof value === 'object' && !Array.isArray(value) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
          for (const k of Object.keys(cur)) delete cur[k];
          Object.assign(cur, value);
        } else {
          layout[key] = value;
        }
      }
      current = newParts;
      const bal = balanceOf(newParts);
      Object.assign(balance, { mass: bal.mass, comX: bal.com ? bal.com.x : 0, comY: bal.com ? bal.com.y : 0, colX: bal.col ? bal.col.x : 0, colY: bal.col ? bal.col.y : 0, dx: bal.dx, deg: bal.deg, restPitch: bal.restPitch, k2: bal.k2, bagLift: bal.bagLift });
      layout.version++;
      for (const fn of listeners.slice()) fn(layout);
      return layout;
    },
    // the station-kind helpers below, bound to this layout
    all: (kind) => all(kind, layout),
    one: (kind) => one(kind, layout),
    kindOf: (name) => kindOf(name, layout),
    is: (name, kind) => is(name, kind, layout),
    nearest: (kind, at) => nearest(kind, at, layout),
    isNestDeck: (id) => isNestDeck(id, layout),
    nestTier: (id) => nestTier(id, layout),
    outdoorDecks: () => outdoorDecks(layout),
    isNestStation: (name) => isNestStation(name, layout),
    deckIndex: (role) => deckIndex(role, layout),
    reviveSpot: () => reviveSpot(layout),
    hasKind: (kind) => hasKind(kind, layout),
  };
  for (const [k, v] of Object.entries(methods)) Object.defineProperty(layout, k, { value: v, enumerable: false, writable: false, configurable: true });
  Object.defineProperty(layout, 'parts', { get: () => current, enumerable: false, configurable: true }); // (read only, and not part of the layout's data)
  layout.applyBuild(parts);
  return layout;
}

// A table of values DERIVED from a layout (deck indices, station lists, route tables ...), kept per layout and rebuilt when that layout's version changes (a new
// build was applied): `const tables = layoutTables((layout) => ({ MAIN: layout.deckIndex('main') }))`, then `tables(layout).MAIN` (no argument = ship 0's layout).
// This replaces the old module-level `let X; rebuild(); onLayoutChange(rebuild)` captures: nothing is shared between two ships.
export function layoutTables(build) {
  const cache = new WeakMap();
  return (layout = SHIP_LAYOUT) => {
    let t = cache.get(layout);
    if (!t || t.version !== layout.version) cache.set(layout, (t = { version: layout.version, value: build(layout) }));
    return t.value;
  };
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
// (B0: every helper below takes an optional LAYOUT as its LAST argument, defaulting to the global SHIP_LAYOUT, so a second ship's layout can be passed in
// without changing a single existing call. Never hand one of these straight to .map()/.filter(): the extra index argument would be read as the layout.)
export const all = (kind, layout = SHIP_LAYOUT) => (kind === 'engine' ? layout.engines.slice() : layout.stations.filter((s) => s.kind === kind));
export const one = (kind, layout = SHIP_LAYOUT) => all(kind, layout)[0];
const kindTables = new WeakMap(); // layout -> { version, kinds: name -> kind }, rebuilt when that layout's version changes (kindOf runs in per-frame loops)
export function kindOf(name, layout = SHIP_LAYOUT) {
  let t = kindTables.get(layout);
  if (!t) kindTables.set(layout, (t = { version: -1, kinds: new Map() }));
  if (t.version !== layout.version) {
    t.kinds.clear();
    for (const e of layout.engines) t.kinds.set(e.name, e.kind);
    for (const s of layout.stations) t.kinds.set(s.n, s.kind);
    t.version = layout.version;
  }
  return t.kinds.get(name);
}
export const is = (name, kind, layout = SHIP_LAYOUT) => kindOf(name, layout) === kind;
// The instance of `kind` nearest to a point `at` ({ d, x }: platform index and x): same-deck stations win, a deck apart
// costs DECK_COST px of walking. Used to send coal to the nearest boiler, ammo from the nearest hold, and so on.
const DECK_COST = 450;
export const walkCost = (s, at) => Math.abs(s.x - at.x) + DECK_COST * Math.abs(s.d - at.d);
export function nearest(kind, at, layout = SHIP_LAYOUT) {
  const list = all(kind, layout);
  if (list.length < 2 || !at) return list[0];
  return list.reduce((best, s) => (walkCost(s, at) < walkCost(best, at) ? s : best));
}
// Is this deck (a platform id) a crow's nest? A ship may have several (the eraser cuts the nest in two) and a second, higher tier (S.5e).
export const isNestDeck = (id, layout = SHIP_LAYOUT) => { const q = layout.platforms.find((o) => o.id === id); return !!q && isNestRow(rowOf(q)); };
// How high a nest stands: 0 = the nest on the bag, 1 = the high tier (a longer view, config.NEST).
export const nestTier = (id, layout = SHIP_LAYOUT) => { const q = layout.platforms.find((o) => o.id === id); return q && rowOf(q) === 'crow2' ? 1 : 0; };
// The open-air walkways of the ship (S.5g): indices of the full decks that are OUTDOOR (the top deck on the classic ship; the pencil's OUTDOOR / COVERED toggle can make any
// deck either). Weather (ice, lightning), boarders landing and crew being knocked overboard care about these; the crow's nests, the helm mount and the belly blisters are not counted.
export const outdoorDecks = (layout = SHIP_LAYOUT) => layout.platforms.map((q, i) => (q.outside && ['catwalk', 'main', 'lower', 'keel', 'deep'].includes(rowOf(q)) ? i : -1)).filter((i) => i >= 0);
// A crow's-nest station: a lookout, or a searchlight standing on a nest deck (links.js, linkArt.js, spotter.js).
export const isNestStation = (name, layout = SHIP_LAYOUT) => {
  const s = layout.stations.find((q) => q.n === name);
  return !!s && (s.kind === 'lookout' || (s.kind === 'searchlight' && isNestDeck(s.p, layout)));
};

// The index of the platform that plays a ROLE ('main', 'lower', 'catwalk', 'nest') or has that id, or -1. A minimal ship (S.5e: a bag and any one deck) has
// not got every deck, so the roles are lent: the main deck is the deck nearest the main row, the lower deck the lowest, the top deck ('catwalk') the highest.
// 'nest' is -1 without a crow's nest (strict: no lending). Other ids ('bay', 'pod' ...) are exact. Not cached across builds: call it from a rebuild hook or a function.
export function deckIndex(role, layout = SHIP_LAYOUT) {
  const P = layout.platforms;
  if (!P.length) return -1;
  const roles = deckRoles(P), q = role === 'main' ? roles.main : role === 'lower' ? roles.lower : role === 'catwalk' ? roles.cat : role === 'nest' ? roles.nest : P.find((o) => o.id === role);
  return q ? P.indexOf(q) : -1;
}
// Where somebody who fell off the ship (or bailed out of a plane) comes round: the medical bay, or with no medbay (S.5e) just aboard again on the spawn deck at a
// boarding point (they wake where they fell, with nobody to nurse them). Returns { d, x, medbay }.
export function reviveSpot(layout = SHIP_LAYOUT) {
  const mb = layout.medbay;
  if (mb) { const d = layout.platforms.findIndex((q) => q.id === mb.p); if (d >= 0) return { d, x: mb.x, medbay: true }; }
  const e = layout.boarderEntryPoints, d = Math.max(0, layout.spawnPlatform);
  const p = layout.platforms[d];
  const x = e.length ? e[0].x + Math.random() * (e[e.length - 1].x - e[0].x) : (p.x0 + p.x1) / 2;
  return { d, x: Math.max(p.x0 + 20, Math.min(p.x1 - 20, x)), medbay: false };
}
// What the ship has (every instance counts; engines are in `engines`, not `stations`): the sim and the phones ask this before assuming a part exists.
export const hasKind = (kind, layout = SHIP_LAYOUT) => (kind === 'engine' ? layout.engines.length > 0 : layout.stations.some((s) => s.kind === kind));

// ---- ship 0 (compatibility forwards, see createLayout) ------------------------------------------------------------------------------------------------
export const SHIP_LAYOUT = createLayout(BUILDS.classic);
export const SHIP_BALANCE = SHIP_LAYOUT.balance;
export const onLayoutChange = (fn) => SHIP_LAYOUT.onChange(fn);
export const applyBuild = (parts) => SHIP_LAYOUT.applyBuild(parts);
