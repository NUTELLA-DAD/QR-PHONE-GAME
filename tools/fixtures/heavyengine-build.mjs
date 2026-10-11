// Scratch test build for ENGINE SIZES (SHIP_BUILDING.md b6c): the classic ship with a twin-envelope bag, a second boiler and coal bunker, and BOTH engines HEAVY (twice the push, 2.5 times the steam each).
// Used by `node tools/botsim.mjs --build heavyengine` and `node tools/buildsim.mjs --check-engine-sizes`. Not a game build.
import { slotsFor, setBag } from '../../public/modules/host/buildSlots.js';

export default function heavyEngineBuild(BUILDS) {
  let p = BUILDS.classic.map((q) => ({ ...q }));
  p = slotsFor('boiler', p).find((s) => s.p === 'lower').apply(p);
  p = slotsFor('coal', p)[0].apply(p);
  p = setBag(p, { twin: true }).parts;
  return p.map((q) => (q.part === 'engine' ? { ...q, size: 'heavy' } : q));
}
