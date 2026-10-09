// Scratch test build for GAS TYPES: the Sparrow (the light starter ship) with a bigger bag filled with HOT AIR (60% of helium's lift, free, lifts only while the boiler is hot). The bag is made
// 1000 px long on each side so that, even at 0.6 of the lift, she weighs less than it lifts. Used by `node tools/botsim.mjs --build hotair` and `node tools/buildsim.mjs --check-gas`. Not a game build.
import { setGas } from '../../public/modules/host/buildEdit.js';

export default function hotAirBuild(BUILDS) {
  const p = BUILDS.sparrow.map((q) => (q.part === 'gasbag' ? { ...q, rx: 1000 } : { ...q }));
  return setGas(p, { gas: 'hot' }).parts;
}
