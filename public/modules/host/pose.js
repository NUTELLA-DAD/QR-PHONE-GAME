// A ship's POSE and the only place world <-> ship coordinates are converted (MOVEMENT.md, B0/M.0). Node-safe: no DOM.
//
// SHIP SPACE is the ship's own frame: the layout's coordinates (decks, stations, crew, fires, modules ...). It is NEVER mirrored.
// WORLD SPACE is the sky: map coordinates, y pointing down. Today the world strip is pulled past a ship nailed to the middle of the screen:
//     world x = ship x + course.dist          world y = ship y - state.ship.alt
// so the pose is { x: course.dist, y: -alt }. In M.0 the pose is a set of GETTERS/SETTERS over those numbers (f fixed at +1), so nothing moves and every
// result is bit-identical to the old inline arithmetic (with f = +1 the maths is `sx + x` and `sy + y`: the same additions as before).
// Later stages (MOVEMENT.md B3-B4) make the pose OWN its position and turn on f (+1 bow to the right, -1 facing left).
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
    vx: { enumerable: true, get: () => scrollSpeed(world), set: readOnly('vx') },
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
