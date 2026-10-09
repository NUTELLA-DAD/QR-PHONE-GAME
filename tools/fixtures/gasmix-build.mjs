// Scratch test build for GAS TYPES: the four-bag ship (tools/fixtures/bags-build.mjs) with the two tail bags HYDROGEN (touching, so one explodes into the other), the third HOT AIR and the nose bag helium.
// Used by `node tools/botsim.mjs --build gasmix` and `node tools/buildsim.mjs --check-gas`. Not a game build.
import bagsBuild from './bags-build.mjs';
import { setGas } from '../../public/modules/host/buildEdit.js';

export default function gasMixBuild(BUILDS) {
  let p = bagsBuild(BUILDS);
  p = setGas(p, { bag: 0, gas: 'hydrogen' }).parts;
  p = setGas(p, { bag: 1, gas: 'hydrogen' }).parts;
  p = setGas(p, { bag: 2, gas: 'hot' }).parts;
  return p;
}
