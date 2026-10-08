// Scratch test build for S.5d (one giant gasbag): the classic ship with her bag dragged out to 2400 px long (about as long as the TV readability limit allows)
// with the blueprint editor, and sandbags hung from the lower deck, both ends alike, to weigh her down (the big bag lifts a lot more than she weighs, so she
// would not stay down without them). Used by `node tools/botsim.mjs --build giantbag` and `node tools/buildsim.mjs --check-bags`. Not a game build.
import { drawBag } from '../../public/modules/host/buildEdit.js';

export default function giantBagBuild(BUILDS) {
  const p = drawBag(BUILDS.classic, -400, 2000).parts; // (across the bag: it is resized)
  for (const x of [60, 300, 560, 1040, 1300, 1540]) p.push({ part: 'ballast', p: 'lower', x, hang: true });
  return p;
}
