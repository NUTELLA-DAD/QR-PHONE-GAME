// Ship power (Balance, the Shipwright's Yard): how much FIGHT a ship has, as one number worked out from her layout once per build (not every frame).
// The danger of a voyage follows it: a small starting ship (the Sparrow) meets lighter enemies early on, and as the crew builds her up the danger rises towards the classic
// ship's (crewscale.js reads run.power and multiplies the spawn / fire / damage / raiders / hp scalers; config is never written). The classic ship is the baseline: a ship at
// least as strong as she is gets a ratio of exactly 1, so the multiplier is exactly 1 and nothing changes for her.
//
//   powerOf(layout)      -> points (guns, bomb bay, coil, escorts, deflector, armour, engines, spare gasbags and a base for the hull)
//   powerRatio(layout)   -> 0..1, her power against the classic ship's
//   powerMul(ratio, key) -> the multiplier for one crewscale key (spawn, fire, damage ...)
import { config } from '../../config.js';
import { BUILDS, buildLayout } from './shipBuild.js';

const P = () => config.YARD.POWER;

export function powerOf(L) {
  const W = P();
  const kinds = {};
  for (const s of L.stations) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
  const armour = (L.armour || []).reduce((n, a) => n + Math.max(0, a.x1 - a.x0) / 100, 0); // (per 100 px of plate)
  const bags = (L.gasbags || []).length;
  return W.BASE + W.GUN * (kinds.gun || 0) + W.BOMB_BAY * (kinds.bombBay || 0) + W.COIL * (kinds.coil || 0) + W.ESCORT * (kinds.escort || 0) + W.DEFLECTOR * (kinds.deflector || 0)
    + W.ARMOUR * armour + W.ENGINE * L.engines.length + W.SPARE_BAG * Math.max(0, bags - 1)
    + W.CANNON * (kinds.cannon || 0) + W.CARGO_RACK * L.racks.filter((r) => r.kind === 'sandbag' || r.kind === 'crate').length + W.TOWLINE * L.racks.filter((r) => r.kind === 'towline').length; // (B.6: the cross-ship parts count a little: a cannon puts boarders aboard, ballast and a towline are weapons of weight)
}

let classicPower = null; // (the baseline: the classic ship's, worked out once)
export function powerRatio(L) {
  if (classicPower == null) classicPower = powerOf(buildLayout(BUILDS.classic));
  return Math.max(0, Math.min(1, powerOf(L) / classicPower));
}

// ratio -> the share of full danger a ship of that power meets: 1 at the classic ship's power, down to POWER_FLOOR for a bare hull; key = which scaler (YARD.POWER.KEYS says how
// strongly each one follows: 1 = all of it, 0 = not at all).
export function powerMul(ratio, key) {
  const Y = config.YARD;
  const m = Math.max(Y.POWER_FLOOR, 1 - Y.POWER_SCALE * (1 - ratio));
  const w = Y.POWER.KEYS[key];
  return w ? 1 - w * (1 - m) : 1;
}
