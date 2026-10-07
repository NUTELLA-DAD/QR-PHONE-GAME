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
import { BUILDS, buildLayout } from './modules/host/shipBuild.js';
import { config } from './config.js';

export const SHIP_LAYOUT = { version: 0 };

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
  SHIP_LAYOUT.version++;
  for (const fn of listeners.slice()) fn(SHIP_LAYOUT);
  return SHIP_LAYOUT;
}

applyBuild(BUILDS.classic);
