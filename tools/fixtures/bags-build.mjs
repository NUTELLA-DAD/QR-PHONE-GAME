// Scratch test build for S.5d (many gasbags): the classic ship with her one long bag rubbed out and FOUR bags drawn side by side (600 px each, touching) with the
// blueprint editor's own operations, so if you lose one you have three left. Used by `node tools/botsim.mjs --build bags` and `node tools/buildsim.mjs --check-bags`.
// Not a game build. The bags are centred on the classic bag (x 800) so the centre of lift stays where it was; each lifts 45 (four 45s against one 149), so she
// hovers a little lower than the classic ship (and a bag's rigging weighs 6 each). The crow's nest (x 610 to 990) sits across the seam of the two middle bags:
// a row of touching bags counts as one. Drawing through the editor also re-derives her collision outline and the deflector band for the wider ship.
import { erase, drawBag } from '../../public/modules/host/buildEdit.js';

export default function bagsBuild(BUILDS) {
  let p = erase(BUILDS.classic, 'gasbag', 0, 0).parts;
  for (const [a, b] of [[-400, 200], [200, 800], [800, 1400], [1400, 2000]]) p = drawBag(p, a, b).parts;
  return p;
}
