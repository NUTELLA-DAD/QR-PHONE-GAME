// Gas types (catalogue v2 Tier 1): the PURE half. Node-safe, config only: shipBuild.js (lift and weight), buildCheck.js (the validator), the art and the shop read it; gasBags.js and hydrogen.js run it live.
//   every gasbag part may carry `gasType`: 'helium' (the default: absent means helium, so older builds are unchanged), 'hydrogen' or 'hot'
//   gasKey(b)          the type of a bag (a part, a layout bag or a live bag), 'helium' when it has none
//   gasInfo(b)         its config.GASES entry (name, lift, mass, seep, price ...)
//   gasLiftMul(b)      what its lift is multiplied by (helium 1, hydrogen 1.3, hot air 0.6)
//   GAS_KEYS           the three, in the order the build page lists them
//   hotLift(heat)      the share of a hot-air bag's lift it has at this heat (0..1)
//   heatTarget(press)  the heat the boiler's pressure holds the burner at
//   setGasType(part, key)   the part with its type set (helium is written as no field)
import { config } from '../../config.js';

export const GAS_KEYS = ['helium', 'hydrogen', 'hot'];
export const gasKey = (b) => (b && GAS_KEYS.includes(b.gasType) ? b.gasType : 'helium');
export const gasInfo = (b) => config.GASES[gasKey(b)];
export const gasLiftMul = (b) => config.GASES[gasKey(b)].lift;
export const isHydrogen = (b) => gasKey(b) === 'hydrogen';
export const isHot = (b) => gasKey(b) === 'hot';

export function setGasType(part, key) {
  const out = { ...part };
  if (key === 'helium' || !GAS_KEYS.includes(key)) delete out.gasType;
  else out.gasType = key;
  return out;
}

// A hot-air bag's lift at burner heat `heat` (0..1): COLD of it when cold, all of it hot.
export const hotLift = (heat) => {
  const H = config.GASES.HOT;
  return H.COLD + (1 - H.COLD) * Math.max(0, Math.min(1, heat));
};
// The heat the boiler's pressure holds the burner at (1 from PRESS_FULL up).
export const heatTarget = (press) => Math.max(0, Math.min(1, press / config.GASES.HOT.PRESS_FULL));
