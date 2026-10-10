// Scratch test build for C.6a (the Cinder Drake's FLAK win): the classic ship with FLAK guns in place of her two dorsal guns and her tail gun; the rest are the plain guns (the gate's dev flag holds their fire).
// Used by `node tools/botsim.mjs --build flak` and tools/creature-check.mjs. Not a game build.
export default function flakBuild(BUILDS) {
  const flak = new Set(['Aft Dorsal Gun', 'Dorsal Gun', 'Tail Gun']);
  return BUILDS.classic.map((p) => (p.part === 'gun' && flak.has(p.n) ? { ...p, gtype: 'flak' } : p));
}
