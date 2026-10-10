// Scratch test build for C.3 (the tow onto rock): the classic ship with a HARPOON gun in place of her nose gun (a plain broadside gun on the top deck, fore).
// Used by `node tools/botsim.mjs --build harpoon` and tools/creature-check.mjs. Not a game build.
export default function harpoonBuild(BUILDS) {
  return BUILDS.classic.map((p) => (p.part === 'gun' && p.n === 'Nose Gun' ? { ...p, gtype: 'harpoon' } : p));
}
