// Scratch test build for C.6e (the Mycelial Mother's MORTAR win): the classic ship with MORTARS in place of her two dorsal guns on the open crow's nest (they lob up onto the cap on the roof); the rest are the plain guns.
// Used by `node tools/botsim.mjs --build mothermortar` and tools/creature-check.mjs. Not a game build.
export default function motherMortarBuild(BUILDS) {
  const mortar = new Set(['Aft Dorsal Gun', 'Dorsal Gun']);
  return BUILDS.classic.map((p) => (p.part === 'gun' && mortar.has(p.n) ? { ...p, gtype: 'mortar' } : p));
}
