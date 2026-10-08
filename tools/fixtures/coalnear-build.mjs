// Scratch test build for S.5f (fire that cares where things are): the classic ship with the Coal Bunker moved up onto the main deck, 60 px from the boiler.
// Used by `node tools/botsim.mjs --build coalnear` and `node tools/buildsim.mjs --check-fire` (it burns more than the classic ship, whose bunker is a deck below). Not a game build.
// Clear of the extinguisher (x 520) and the ice locker (x 285), so the Action button picks the bunker.
export default function coalNearBuild(BUILDS) {
  return BUILDS.classic.map((p) => (p.part === 'station' && p.kind === 'coal' ? { ...p, p: 'main', x: 460 } : p));
}
