// Scratch test build for C.6b (the Thunderbird's MORTAR win): the classic ship with MORTARS in place of her two dorsal guns on the open crow's nest (they lob onto the bird resting on a rock spire below); the rest are the plain guns.
// Used by `node tools/botsim.mjs --build birdmortar` and tools/creature-check.mjs. Not a game build.
export default function birdMortarBuild(BUILDS) {
  const mortar = new Set(['Aft Dorsal Gun', 'Dorsal Gun']);
  return BUILDS.classic.map((p) => (p.part === 'gun' && mortar.has(p.n) ? { ...p, gtype: 'mortar' } : p));
}
