// SHIPS: the multi-ship scaffolding (MOVEMENT.md, Option B, stage B0). Node-safe: no DOM.
//
// The game is moving to ONE simulation that understands MANY ships (the player's, a PvP rival, later the enemy gunship), so more airships can always be
// added. In M.0 there is exactly one ship, `state.ships[0]`, and it WRAPS today's singletons BY REFERENCE: nothing is copied, nothing moves.
//
//   ship = { id,        'player' for the main ship
//            team,      the PvP team object (state.team) or null (a getter: the bridge sets it after the sim is made)
//            layout,    the ship's layout (today the global SHIP_LAYOUT, updated in place by applyBuild)
//            state,     the ship's own fields: hull, gas, alt, speed, pitch ... (today state.ship, the same object)
//            world,     the host state it lives in (map, weather, enemies, players ...; a handle for the pose and the accessors)
//            pose }     pose.js: where she is and which way she faces
//
//   mainShip(state)           the player's ship (ships[0])
//   shipOf(state, player)     the ship a player is aboard (player.ship = a ship id; none = the main ship)
//   eachShip(state, fn)       fn(ship, index) for every ship
//
// ---- THE RULES (all new code, from now on) ------------------------------------------------------------------------------------------------------
//  1. No new module-level captures of per-ship data (layout-derived tables, SHIP_LAYOUT.x arrays copied at import, GUNS, bags, balance ...).
//     tools/buildsim.mjs --lint fails new ones. Build them in a factory taking the ship, or recompute in a function.
//  2. New code takes a ship HANDLE (a parameter), or gets one from shipOf / mainShip. It does not `import { SHIP_LAYOUT }` (the lint counts those down).
//  3. World <-> ship conversions happen ONLY in pose.js: toWorld / toShip / aimToWorld / aimToShip. No `x + course.dist`, no `y - state.ship.alt`,
//     no new `scrollSpeed` reads (the lint counts those down). Ship space is never mirrored; only the boundary (rock tests, hits, guns, lamps, camera, art) uses f.
//  4. Per-ship things live UNDER the ship object as they get migrated (layout, modules, bags, balance, GUNS, fires/holes, nav tables, art bake).
//     The shipLayout.js helpers (all/one/kindOf/is/nearest/hasKind/deckIndex/reviveSpot/isNestDeck/nestTier/isNestStation) take an optional layout last.
//  5. Keep the update order and the Math.random order unchanged when you route something through here; the botsim baseline must stay byte-identical.
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { createPose } from './pose.js';

// The main ship, wrapping today's singletons: ship.state === state.ship, ship.layout === SHIP_LAYOUT.
export function createMainShip(state) {
  const ship = {
    id: 'player',
    get team() { return state.team || null; },
    layout: SHIP_LAYOUT,
    state: state.ship,
    world: state,
    pose: null,
  };
  ship.pose = createPose(ship);
  return ship;
}

export const mainShip = (state) => state.ships[0];
export function shipOf(state, player) {
  const id = player && player.ship;
  if (id == null || id === 'player') return state.ships[0];
  return state.ships.find((s) => s.id === id) || state.ships[0];
}
export function eachShip(state, fn) {
  const list = state.ships;
  for (let i = 0; i < list.length; i++) fn(list[i], i);
}
