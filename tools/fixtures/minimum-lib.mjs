// Test ships for S.5e (a ship needs only a gasbag and a deck): the steps of building one up from nothing with the blueprint editor's own operations.
//   step 1  one main deck and one gasbag (nothing else: she drifts)
//   step 2  + a helm                       (she can steer; no steam, so the helm is a hand wheel)
//   step 3  + a boiler and a coal bunker   (steam: the pump and the vent work, the helm is powered)
//   step 4  + two engines                  (speed)
//   step 5  + a top deck with a mast and a sail  (the wind helps)
// Used by `node tools/botsim.mjs --build min1` ... `min5` and `node tools/buildsim.mjs --check-minimum`. Not game builds.
import { emptyBuild, drawDeck, drawBag } from '../../public/modules/host/buildEdit.js';
import { slotsFor } from '../../public/modules/host/buildSlots.js';

export function minimumBuild(step = 1) {
  let p = emptyBuild();
  const op = (r) => { if (!r.ok) throw new Error('minimumBuild: ' + r.hint); p = r.parts; };
  op(drawDeck(p, 'main', 140, 860));
  op(drawBag(p, -30, 1030));
  const put = (type, deck, x) => { // the legal slot of that palette type nearest x on that deck row
    const slot = slotsFor(type, p).filter((s) => s.p === deck).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
    if (!slot) throw new Error(`minimumBuild: no spot for ${type} near ${x} on ${deck}`);
    p = slot.apply(p);
  };
  if (step >= 2) put('helm', 'main', 760);
  if (step >= 3) { put('boiler', 'main', 300); put('coal', 'main', 420); }
  if (step >= 4) { put('engine', 'main', 150); put('engine', 'main', 850); }
  if (step >= 5) {
    op(drawDeck(p, 'catwalk', 240, 760));
    put('sail', 'catwalk', 500);
  }
  return p;
}
