// Scratch test build for ENGINE SIZES (SHIP_BUILDING.md b6c): the classic ship made too heavy for her bag (a second boiler and coal bunker: hover 77, the validator FAILs "too heavy for her bags") and her FORE engine
// swapped for a GREAT LIFT engine pointing UP (3.5 times the lift: hover 39, she validates). The aft engine stays a forward pod.
// Used by `node tools/botsim.mjs --build greatlift` and `node tools/buildsim.mjs --check-engine-sizes`. Not a game build.
import { slotsFor } from '../../public/modules/host/buildSlots.js';

export const heavyShip = (BUILDS) => { // (the same ship without the great engine: too heavy for her bag)
  let p = BUILDS.classic.map((q) => ({ ...q }));
  p = slotsFor('boiler', p).find((s) => s.p === 'lower').apply(p);
  return slotsFor('coal', p)[0].apply(p);
};
export default function greatLiftBuild(BUILDS) {
  return heavyShip(BUILDS).map((q) => (q.part === 'engine' && q.name === 'Fore Engine' ? { ...q, size: 'great', dir: -Math.PI / 2 } : q));
}
