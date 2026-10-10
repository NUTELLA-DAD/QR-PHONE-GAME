// Scratch test build for C.6a (the Cinder Drake's TOW into a lava spout): the classic ship with a HARPOON gun in place of her ventral (belly) gun, which points down at a drake crawling on the shelf below.
// (The Kraken's harpoon-build.mjs puts it on the nose, where the Kraken is level with her.) Used by `node tools/botsim.mjs --build drakeharpoon` and tools/creature-check.mjs. Not a game build.
export default function drakeHarpoonBuild(BUILDS) {
  return BUILDS.classic.map((p) => (p.part === 'gun' && p.n === 'Ventral Gun' ? { ...p, gtype: 'harpoon' } : p));
}
