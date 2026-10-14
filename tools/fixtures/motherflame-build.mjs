// Scratch test build for C.6e (the Mycelial Mother's BURN win): the classic ship with FLAMETHROWERS in place of her two end guns on the top deck and her two sponsons (the decks' ends are where a tendril takes hold); the rest are the
// plain guns. Used by `node tools/botsim.mjs --build motherflame` and tools/creature-check.mjs. Not a game build.
export default function motherFlameBuild(BUILDS) {
  const flame = new Set(['Tail Gun', 'Nose Gun', 'Aft Sponson', 'Fore Sponson']);
  return BUILDS.classic.map((p) => (p.part === 'gun' && flame.has(p.n) ? { ...p, gtype: 'flame' } : p));
}
