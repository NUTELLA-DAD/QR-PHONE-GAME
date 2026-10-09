// THE NUMBERS OF THE GUN TYPES (config.GUN_TYPES; PVP.md "Space and range") and the aim for them. Node-safe: no DOM, and nothing here imports the rest of the game (ships.js, aim.js and shipSim.js all read it).
//
// A gun part may carry a `gtype` (the layout's gunMounts[name].type, state.GUNS[name].type): the ordinary broadside gun has none and every number falls back to config.GUNS, so a ship without these
// parts flies exactly as before. What leaves the barrel is weapons.js; this file is how fast, how far, how much ammo, and where to point.
import { config } from '../../config.js';
import { aimToShip } from './pose.js';

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const typeOf = (gun) => (gun && gun.type ? config.GUN_TYPES[gun.type] || null : null);

// The numbers of one gun: how fast its shell flies, how long, how often it fires. A plain gun: config.GUNS.
export function specOf(gun) {
  const T = typeOf(gun), G = config.GUNS;
  return { speed: (T && T.SPEED) || G.SHELL_SPEED, life: (T && T.LIFE) || G.SHELL_LIFE, cd: T ? T.COOLDOWN : G.COOLDOWN, g: (T && T.GRAVITY) || 0, tol: T ? T.TOL : null };
}
// The most a gun can reach in a straight line from its muzzle (px). A mortar: the flat ground range of a 45 degree lob; the harpoon: its line; a mine layer: nothing.
export function rangeOf(gun) {
  const T = typeOf(gun), reach = gun.reach || 1;
  if (!T) return config.GUNS.SHELL_SPEED * config.GUNS.SHELL_LIFE * reach;
  if (gun.type === 'mortar') return ((T.SPEED * T.SPEED) / T.GRAVITY) * reach;
  if (gun.type === 'harpoon' || gun.type === 'flame') return T.RANGE;
  if (gun.type === 'mines') return 0;
  return T.SPEED * T.LIFE * reach;
}
// What a gun starts with and holds ({ ammo, max }, plus the `type` that marks a typed gun) from its layout mount.
export function gunStock(m) {
  const T = m && m.type ? config.GUN_TYPES[m.type] : null;
  return T ? { ammo: T.START_AMMO, max: T.MAX_AMMO, type: m.type } : { ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO };
}
export const loadOf = (gun) => { const T = typeOf(gun); return T ? T.LOAD : config.GUNS.LOAD; }; // shells one ammo crate adds
export const autoloadOf = (gun) => { const T = typeOf(gun); return T && T.AUTOLOAD ? T.AUTOLOAD : config.GUNS.AUTOLOAD_EVERY; }; // seconds per free shell

// ---- the mortar's lob ----
// The launch velocity (relative to the ship, px/s; y down) that lands a shell at (dx, dy) from the muzzle after t seconds, at launch speed v under gravity g: the HIGH arc (the one that falls onto a deck).
// From (v^2 t^2 = dx^2 + (dy - g t^2 / 2)^2): a quadratic in t^2. null when the target is out of range.
export function lob(dx, dy, v, g, high = true) {
  const d2 = dx * dx + dy * dy, b = g * dy + v * v, disc = b * b - g * g * d2;
  if (disc < 0) return null;
  const u = (b + (high ? 1 : -1) * Math.sqrt(disc)) / ((g * g) / 2);
  if (!(u > 0)) return null;
  const t = Math.sqrt(u);
  return { t, vx: dx / t, vy: (dy - (g * u) / 2) / t };
}

// The aim (in SHIP space, like gun.aim) that hits a target with a typed gun, or null (out of arc or reach). `target.at(t)` is where it will be in t seconds, in the ship's moving frame (aim.js).
export function typedSolution(state, ship, gun, target, gx, gy) {
  const T = typeOf(gun);
  if (!T || gun.type === 'mines') return null;
  const pitch = state.ship.pitch || 0;
  const inArc = (a) => (Math.abs(angleDiff(a, gun.home)) <= gun.arc ? a : null);
  if (gun.type === 'mortar') {
    let p = target.at(0), r = null;
    for (let i = 0; i < 4; i++) {
      r = lob(p.x - gx, p.y - gy, T.SPEED, T.GRAVITY);
      if (!r) return null;
      p = target.at(r.t);
    }
    r = lob(p.x - gx, p.y - gy, T.SPEED, T.GRAVITY);
    return r ? inArc(aimToShip(ship, Math.atan2(r.vy, r.vx)) - pitch) : null;
  }
  if (gun.type === 'flame') { // a cone of fire has no flight time: the target where it is now, within the cone's reach (less part of its own size)
    const p = target.at(0);
    return Math.hypot(p.x - gx, p.y - gy) - (target.r || 0) * 0.6 > rangeOf(gun) ? null : inArc(aimToShip(ship, Math.atan2(p.y - gy, p.x - gx)) - pitch);
  }
  const speed = T.SPEED;
  let p = target.at(0);
  for (let i = 0; i < 3; i++) p = target.at(Math.hypot(p.x - gx, p.y - gy) / speed);
  if (Math.hypot(p.x - gx, p.y - gy) > rangeOf(gun)) return null;
  return inArc(aimToShip(ship, Math.atan2(p.y - gy, p.x - gx)) - pitch);
}
