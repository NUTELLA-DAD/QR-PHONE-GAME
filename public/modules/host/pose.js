// A ship's POSE and the only place world <-> ship coordinates are converted (MOVEMENT.md, B0/M.0). Node-safe: no DOM.
//
// SHIP SPACE is the ship's own frame: the layout's coordinates (decks, stations, crew, fires, modules ...). It is NEVER mirrored.
// WORLD SPACE is the sky: map coordinates, y pointing down. EVERYTHING in the sky is stored there since M.1 (shells, planes, bats, mines, wrecks, puffs,
// crew in the air, hooks ...), at rest in the world and moving by its own velocity; the world is not pulled past a ship any more. A ship is where her pose says:
//     world x = ship x + pose.x   (pose.x = course.dist)          world y = ship y + pose.y   (pose.y = -state.ship.alt)
// The pose is still a set of GETTERS/SETTERS over those numbers (f fixed at +1) until the stages that make it OWN the position and turn on f (+1 bow to the
// right, -1 facing left); with f = +1 the maths is `sx + x` and `sy + y`. Velocities are WORLD velocities. Things that steer by their speed RELATIVE to the ship
// (bats, imps, saws, shots fired from or at her ...) add pose.vx to what they want; a shot leaves the barrel at its muzzle speed relative to her and keeps the
// speed of her at that moment.
//
//   pose = { x, y,      where the ship's origin is in the world (y points down, so a ship that climbs has a smaller y)
//            vx, vy,    its velocity in the world (px/s; READ-ONLY until the pose owns position)
//            f,         facing: +1 bow to the right, -1 to the left (fixed +1 until the COME ABOUT stage)
//            pitch,     nose tilt in radians (+ = nose down), the same number the art tilts by
//            turn }     0 = not turning, 0..1 = progress of a COME ABOUT manoeuvre (0 until then)
//
// Every function here takes a SHIP HANDLE (ships.js: { id, team, layout, state, world, pose }), not a global, so a second ship works the same way.
// RULES for all new code: see ships.js. Do NOT write `x + course.dist` or `y - state.ship.alt` in new code; call toWorld / toShip.
import { scrollSpeed } from './course.js';

// Build the pose object for `ship`. It reads and writes the ship's existing numbers by reference (world = the host state, ship.state = state.ship).
export function createPose(ship) {
  const world = ship.world, S = ship.state;
  let turn = 0;
  const readOnly = (what) => () => { throw new Error('pose.' + what + ' is read-only until the pose owns position (MOVEMENT.md B4)'); };
  return Object.defineProperties({}, {
    x: { enumerable: true, get: () => (world.course ? world.course.dist : 0), set: (v) => { world.course.dist = v; } },
    y: { enumerable: true, get: () => -S.alt, set: (v) => { S.alt = -v; } },
    // (the velocity she really has: what the last step moved her by, so a ship pressed against the rock, shoved by the wind or hanging in a calm moves at that and
    // everything that goes along with her goes along with THAT. What her engines ask of her is course.js scrollSpeed; until her first step it is the same.)
    vx: { enumerable: true, get: () => (world.shipVx !== undefined ? world.shipVx : scrollSpeed(world)), set: readOnly('vx') },
    vy: { enumerable: true, get: () => -(S.vy || 0), set: readOnly('vy') }, // (state.ship.vy is the climb rate: + = up)
    f: { enumerable: true, get: () => 1, set: (v) => { if (v !== 1) throw new Error('pose.f is fixed at +1 until COME ABOUT exists (MOVEMENT.md B5)'); } },
    pitch: { enumerable: true, get: () => S.pitch || 0, set: (v) => { S.pitch = v; } },
    turn: { enumerable: true, get: () => turn, set: (v) => { turn = v; } },
  });
}
export const poseOf = (ship) => ship.pose;

// Facing mirrors ship space about the middle of the ship (layout.midPoint). With f = +1 this is the plain offset, written so it is the same additions as before.
const pivotX = (ship) => (ship.layout.midPoint ? ship.layout.midPoint.x : 0);

// A point on the ship (ship coordinates) -> where it is in the world.
export function toWorldX(ship, sx) {
  const p = ship.pose;
  return p.f === 1 ? sx + p.x : p.x + pivotX(ship) + p.f * (sx - pivotX(ship));
}
export const toWorldY = (ship, sy) => sy + ship.pose.y;
export const toWorld = (ship, sx, sy) => ({ x: toWorldX(ship, sx), y: toWorldY(ship, sy) });

// A point in the world -> ship coordinates (the inverse of toWorld).
export function toShipX(ship, wx) {
  const p = ship.pose;
  return p.f === 1 ? wx - p.x : pivotX(ship) + (wx - p.x - pivotX(ship)) / p.f;
}
export const toShipY = (ship, wy) => wy - ship.pose.y;
export const toShip = (ship, wx, wy) => ({ x: toShipX(ship, wx), y: toShipY(ship, wy) });

// A direction: an angle in ship space (radians, 0 = bow-ward, y down) <-> the same direction in the world. Mirroring flips it about the vertical axis.
// (A gun's tilt from the ship's pitch is added by the caller, as it is today: aimToWorld(ship, gun.aim) + pose.pitch.)
export const aimToWorld = (ship, a) => (ship.pose.f === 1 ? a : Math.PI - a);
export const aimToShip = (ship, a) => (ship.pose.f === 1 ? a : Math.PI - a); // (a mirror is its own inverse)
// A horizontal distance or speed along the ship's own "ahead" -> along the world x axis.
export const aheadToWorld = (ship, d) => (ship.pose.f === 1 ? d : d * ship.pose.f);
