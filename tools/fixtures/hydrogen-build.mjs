// Scratch test build for GAS TYPES (catalogue v2 Tier 1): the classic ship with her one bag filled with HYDROGEN (30% more lift, burns). Used by `node tools/botsim.mjs --build hydrogen`
// and `node tools/buildsim.mjs --check-gas`. Not a game build.
import { setGas } from '../../public/modules/host/buildEdit.js';

export default function hydrogenBuild(BUILDS) {
  return setGas(BUILDS.classic, { gas: 'hydrogen' }).parts;
}
