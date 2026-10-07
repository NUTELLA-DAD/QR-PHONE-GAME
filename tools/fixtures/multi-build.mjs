// Scratch test build for S.3 (multi-instance stations): the classic ship plus a second boiler and a second lookout.
// Used by `node tools/botsim.mjs --build multi` and `node tools/buildsim.mjs --check-multi`. Not a game build.
//  - "Fore Boiler": a station of kind 'boiler' on the main deck, clear of racks, vents, valves and ladders (anything within
//    config.TOOLS.REACH of the spot would take the Action button before the station does).
//    It shares the classic boiler's firebox and steam pool (config.BOILER.EXTRA_BOILER); coal can go into either.
//  - "Aft Lookout": a second station of kind 'lookout' on the crow's nest, between the aft dorsal gun and the first lookout.
export default function multiBuild(BUILDS) {
  return [
    ...BUILDS.classic,
    { part: 'station', n: 'Fore Boiler', kind: 'boiler', p: 'main', x: 1090 },
    { part: 'station', n: 'Aft Lookout', kind: 'lookout', p: 'nest', x: 700 },
  ];
}
