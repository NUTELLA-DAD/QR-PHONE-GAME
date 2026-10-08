// A ship's POSE and the only place world <-> ship coordinates are converted (MOVEMENT.md, B0/M.0). Node-safe: no DOM.
//
// SHIP SPACE is the ship's own frame: the layout's coordinates (decks, stations, crew, fires, modules ...). It is NEVER mirrored.
// WORLD SPACE is the sky: map coordinates, y pointing down. EVERYTHING in the sky is stored there since M.1 (shells, planes, bats, mines, wrecks, puffs,
// crew in the air, hooks ...), at rest in the world and moving by its own velocity; the world is not pulled past a ship any more. A ship is where her pose says:
//     world x = ship x + pose.x            world y = ship y + pose.y
// Since M.2 the pose OWNS those numbers (plain data, one set per ship): ship 0's course.dist is a view of pose.x and every body's `alt` is a view of -pose.y (bindBody).
// f is +1 for a bow to the right, -1 for a bow to the left (COME ABOUT flips it, M.3); with f = +1 the maths is `sx + x` and `sy + y`. Velocities are WORLD velocities.
// Things that steer by their speed RELATIVE to the ship (bats, imps, saws, shots fired from or at her ...) add pose.vx to what they want; a shot leaves the barrel at
// its muzzle speed relative to her and keeps the speed of her at that moment.
//
//   pose = { x, y,      where the ship's origin is in the world (y points down, so a ship that climbs has a smaller y)
//            vx, vy,    its velocity in the world (px/s; vx is measured by simulation.js every step, vy is the climb rate negated)
//            f,         facing: +1 bow to the right, -1 to the left (flips at the middle of a COME ABOUT)
//            pitch,     nose tilt in radians (+ = nose down), the same number the art tilts by
//            turn }     0 = not turning, 0..1 = progress of a COME ABOUT manoeuvre (shipSim.js comeAbout)
//
// Every function here takes a SHIP HANDLE (ships.js: { id, team, layout, state, world, pose }), not a global, so a second ship works the same way.
// RULES for all new code: see ships.js. Do NOT write `x + course.dist` or `y - state.ship.alt` in new code; call toWorld / toShip.
import { scrollSpeed } from './course.js';

// Where her engines (and sails) carry the ship along the sky, px/s along the world x: her speed along her bow (course.js scrollSpeed) the way her facing f points. This is the velocity
// the movement model reads; pose.vx is what she really moved at.
export const driveVx = (ship, f = ship.pose.f) => f * scrollSpeed(ship.ctx || ship.world);
// How much that changes for one more unit of her speed (a share of the top speed; the sails, overdrive and the sky are in it): a shove of dv px/s is dv / driveGain of ship.speed.
export function driveGain(ship) {
  const b = ship.ctx.ship, s0 = b.speed, v0 = driveVx(ship);
  b.speed = s0 + 1;
  const g = driveVx(ship) - v0;
  b.speed = s0;
  return g;
}

// Build the pose object for `ship`: its own x, y, vy, f, pitch and turn. vx is the speed she REALLY moved at in the last step (simulation.js measures it): a ship
// pressed against the rock, shoved by the wind or hanging in a calm moves at that and everything that goes along with her goes along with THAT. What her
// engines ask of her is course.js scrollSpeed; until her first step vx is the same.
export function createPose(ship, { x = 0, y = 0 } = {}) {
  let vx;
  const pose = Object.defineProperties({ x, y, vy: 0, f: 1, pitch: 0, turn: 0 }, {
    vx: { enumerable: true, get: () => (vx !== undefined ? vx : driveVx(ship, pose.f)), set: (v) => { vx = v; } },
  });
  return pose;
}

// The body's old names over the pose (so every `state.ship.alt` / `.vy` / `.pitch` read and write still works, and writes land in the pose): alt = -pose.y,
// vy = the climb rate (+ = up) = -pose.vy. Negation is exact in floating point, so `alt += d` and `pose.y -= d` give the same number to the last bit.
export function bindBody(body, pose) {
  pose.y = -(body.alt || 0);
  pose.vy = -(body.vy || 0);
  pose.pitch = body.pitch || 0;
  delete body.alt;
  delete body.vy;
  delete body.pitch;
  Object.defineProperties(body, {
    alt: { enumerable: true, configurable: true, get: () => -pose.y, set: (v) => { pose.y = -v; } },
    vy: { enumerable: true, configurable: true, get: () => -pose.vy, set: (v) => { pose.vy = -v; } },
    pitch: { enumerable: true, configurable: true, get: () => pose.pitch, set: (v) => { pose.pitch = v; } },
  });
  return body;
}
export const poseOf = (ship) => ship.pose;

// Facing mirrors ship space about the middle of the ship's drawing (the middle of layout.bounds, so her hull stays where it is when she comes about; a stand-in
// without bounds uses layout.midPoint). With f = +1 this is the plain offset, written so it is the same additions as before.
export const pivotOf = (ship) => {
  const L = ship.layout;
  return L.bounds ? (L.bounds.x0 + L.bounds.x1) / 2 : L.midPoint ? L.midPoint.x : 0;
};
const pivotX = pivotOf;

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
