// Ship layout as data. Change the ship here, not in the game code.
// Coordinates are world pixels; y grows downward. The ship flies to the RIGHT (bow on the right).
//
// Platforms are the walkable floors. Everything that sits on a floor says which one with `p`
// (a platform id). At load time each of those also gets `d` = the platform's index, which is what
// the game code uses.

const platforms = [
  { id: 'nest', name: "Crow's Nest", y: -42, x0: 610, x1: 990, outside: true },
  // The open-air TOP DECK on the roof of the gondola, under the gasbag: deck guns at both ends,
  // and the helm on its own raised mount (the helmsman is exposed up here).
  { id: 'catwalk', name: 'Top Deck', y: 470, x0: 240, x1: 1360, outside: true },
  { id: 'helm', name: 'Helm Mount', y: 420, x0: 1195, x1: 1315, outside: true },
  { id: 'main', name: 'Main Deck', y: 640, x0: 140, x1: 1470 },
  { id: 'lower', name: 'Lower Deck', y: 790, x0: 20, x1: 1580 },
  // The bomb bay: its own compartment in the belly of the hull, reached by a hatch ladder from the lower deck.
  { id: 'bay', name: 'Bomb Bay', y: 925, x0: 350, x1: 640 },
  { id: 'pod', name: 'Ball Turret', y: 905, x0: 735, x1: 855 },
  { id: 'hangar', name: 'Fighter Hatch', y: 905, x0: 1020, x1: 1110, outside: true },
  { id: 'hangar2', name: 'Fore Fighter Hatch', y: 905, x0: 1215, x1: 1305, outside: true },
  // The belly lamp: a small blister hung under the fore outrigger, reached by a ladder from the lower deck. The belly searchlight lives here.
  { id: 'lamp', name: 'Belly Lamp', y: 905, x0: 1370, x1: 1450, outside: true },
];

const index = (id) => platforms.findIndex((p) => p.id === id);
const withD = (list) => list.map((o) => ({ ...o, d: index(o.p) }));

export const SHIP_LAYOUT = {
  platforms,

  // Ways between platforms. `top`/`bottom` are platform ids; xTop/xBottom where each end sits.
  // speed = climbing speed in pixels per second (vertical).
  connectors: [
    { type: 'rope', top: 'nest', bottom: 'catwalk', xTop: 720, xBottom: 720, speed: 150 },
    { type: 'ladder', top: 'helm', bottom: 'catwalk', xTop: 1215, xBottom: 1215, speed: 170 },
    { type: 'ladder', top: 'catwalk', bottom: 'main', xTop: 340, xBottom: 340, speed: 170 },
    { type: 'ladder', top: 'catwalk', bottom: 'main', xTop: 1050, xBottom: 1050, speed: 170 },
    { type: 'ladder', top: 'main', bottom: 'lower', xTop: 255, xBottom: 255, speed: 170 },
    { type: 'stairs', top: 'main', bottom: 'lower', xTop: 560, xBottom: 700, speed: 150 },
    { type: 'lift', top: 'main', bottom: 'lower', xTop: 960, xBottom: 960, speed: 260 },
    { type: 'ladder', top: 'main', bottom: 'lower', xTop: 1140, xBottom: 1140, speed: 170 },
    { type: 'ladder', top: 'catwalk', bottom: 'main', xTop: 640, xBottom: 640, speed: 170 }, // a third way down from the top deck, mid-ship
    { type: 'rope', top: 'nest', bottom: 'catwalk', xTop: 640, xBottom: 640, speed: 150 }, // third rope, above the new mid-ship ladder (one climb from the main deck to the nest)
    { type: 'rope', top: 'nest', bottom: 'catwalk', xTop: 905, xBottom: 905, speed: 150 }, // second rope, by the Dorsal Gun and Deflector
    // SLIDE POLES: one-way and fast, top -> bottom only (a brass pole straight down through the decks).
    { type: 'pole', top: 'catwalk', bottom: 'main', xTop: 860, xBottom: 860, speed: 520 },
    { type: 'pole', top: 'main', bottom: 'lower', xTop: 860, xBottom: 860, speed: 520 },
    { type: 'pole', top: 'catwalk', bottom: 'main', xTop: 1300, xBottom: 1300, speed: 520 },
    { type: 'pole', top: 'main', bottom: 'lower', xTop: 1300, xBottom: 1300, speed: 520 },
    { type: 'ladder', top: 'lower', bottom: 'bay', xTop: 372, xBottom: 372, speed: 170 },
    { type: 'ladder', top: 'lower', bottom: 'pod', xTop: 760, xBottom: 760, speed: 170 },
    { type: 'ladder', top: 'lower', bottom: 'hangar', xTop: 1040, xBottom: 1040, speed: 170 },
    { type: 'ladder', top: 'lower', bottom: 'hangar2', xTop: 1235, xBottom: 1235, speed: 170 },
    { type: 'ladder', top: 'lower', bottom: 'lamp', xTop: 1410, xBottom: 1410, speed: 170 },
  ].map((c) => ({ ...c, top: index(c.top), bottom: index(c.bottom) })),

  // Named areas, used for drawing and for telling players where things are.
  rooms: withD([
    { name: 'Tail Turret', p: 'main', x0: 140, x1: 240, color: '#b9925c' },
    { name: 'Boiler Room', p: 'main', x0: 240, x1: 620, color: '#b08250' },
    { name: 'Workshop', p: 'main', x0: 620, x1: 1100, color: '#c9a46a' },
    { name: 'Bridge', p: 'main', x0: 1100, x1: 1470, color: '#d4b47c' },
    { name: 'Aft Gun Deck', p: 'lower', x0: 250, x1: 650, color: '#a8814f' },
    { name: 'Hold', p: 'lower', x0: 650, x1: 950, color: '#9c7646' },
    { name: 'Fore Gun Deck', p: 'lower', x0: 950, x1: 1350, color: '#a8814f' },
    { name: 'Bomb Bay', p: 'bay', x0: 350, x1: 640, color: '#4a4346' },
    { name: 'Aft Outrigger', p: 'lower', x0: 20, x1: 250, outside: true },
    { name: 'Fore Outrigger', p: 'lower', x0: 1350, x1: 1580, outside: true },
  ]),

  // Stations players can use. n = name, p = platform, x = position.
  stations: withD([
    { n: 'Aft Dorsal Gun', p: 'nest', x: 660 },
    { n: 'Lookout', p: 'nest', x: 770 },
    { n: 'Deflector', p: 'catwalk', x: 940 },
    { n: 'Dorsal Gun', p: 'nest', x: 940 },
    { n: 'Tail Gun', p: 'catwalk', x: 275 },
    { n: 'Lightning Coil', p: 'main', x: 710 },
    { n: 'Boiler', p: 'main', x: 400 },
    { n: 'Navigator', p: 'main', x: 1215 },
    { n: 'Helm', p: 'helm', x: 1275 },
    { n: 'Nose Gun', p: 'catwalk', x: 1340 },
    { n: 'Aft Sponson', p: 'lower', x: 420 },
    { n: 'Coal Bunker', p: 'lower', x: 570 },
    { n: 'Ammo Hold', p: 'lower', x: 870 },
    { n: 'Bomb Bay', p: 'bay', x: 520 },
    { n: 'Fore Sponson', p: 'lower', x: 1180 },
    { n: 'Ventral Gun', p: 'pod', x: 820 },
    { n: 'Escort Fighter', p: 'hangar', x: 1085 },
    { n: 'Escort Fighter 2', p: 'hangar2', x: 1280 },
    { n: 'Nest Searchlight', p: 'nest', x: 815 },
    { n: 'Belly Searchlight', p: 'lamp', x: 1410 },
  ]),

  // Guns: where the barrel pivots (bx, by), the middle of its firing arc (aim, radians;
  // 0 = right, PI/2 = down) and how far it may turn either side of that (arc).
  gunMounts: {
    'Dorsal Gun': { bx: 950, by: -76, aim: -1.2, arc: 1.2 },
    'Aft Dorsal Gun': { bx: 650, by: -76, aim: -1.95, arc: 1.2 },
    'Tail Gun': { bx: 248, by: 418, aim: Math.PI + 0.35, arc: 1.1 }, // top deck, aft: back and up
    'Nose Gun': { bx: 1372, by: 418, aim: -0.35, arc: 1.1 }, // top deck, fore: forward and up
    'Aft Sponson': { bx: 330, by: 812, aim: 2.15, arc: 0.7 },
    'Fore Sponson': { bx: 1270, by: 812, aim: 1.0, arc: 0.7 },
    'Ventral Gun': { bx: 805, by: 948, aim: Math.PI / 2, arc: 1.2 },
  },

  // Searchlights (searchlight.js): where the lamp pivots (bx, by), the middle of its sweep (aim, radians; 0 = right,
  // PI/2 = down), how far it may swing either side of that (arc) and how long the drum is (len: the beam starts at the lens).
  // The nest light covers up / fore / aft; the belly light covers down / fore / aft.
  searchlights: {
    'Nest Searchlight': { bx: 815, by: -176, aim: -Math.PI / 2, arc: 1.5, len: 44 },
    'Belly Searchlight': { bx: 1410, by: 944, aim: Math.PI / 2, arc: 1.5, len: 40 },
  },

  // Lightning Coil emitter (on top of the crow's nest): fires up and out to the sides.
  coil: { x: 875, y: -114, aim: -Math.PI / 2, arc: 1.45 },

  // Deflector shield: a band on an ellipse around the whole ship, swung round by the crew.
  shield: { cx: 800, cy: 470, rx: 1020, ry: 660 },

  // Medical bay: where anyone who falls off the ship comes round.
  medbay: { p: 'lower', x: 640 },
  // Where the escort fighter hangs on its hook under the hull (below the Fighter Hatch).
  escortDock: { x: 1075, y: 965 },
  // Both patrol planes' hooks: n = station name, num = tail number, p = hatch platform.
  escortDocks: [
    { n: 'Escort Fighter', num: 1, p: 'hangar', x: 1075, y: 965 },
    { n: 'Escort Fighter 2', num: 2, p: 'hangar2', x: 1265, y: 965 },
  ],

  // Bomb bay doors in the bay floor beside the bombardier: bombs drop from here, and jumpX is
  // where you stand to jump out (parachute) - both are over the doors.
  bombBay: { x: 550, y: 925, jumpX: 585, doorHalf: 48 },

  // Engines on the outriggers, driven by steam.
  engines: withD([
    { name: 'Aft Engine', p: 'lower', x: 70 },
    { name: 'Fore Engine', p: 'lower', x: 1530 },
  ]),

  // Steam pipes from the boiler to each steam-driven module. Each has a valve the crew can
  // open/close (tap Action while standing under it on platform p). Pipes can burst and leak.
  pipes: withD([
    { to: 'Helm', p: 'main', points: [[430, 560], [430, 505], [1275, 505], [1275, 430]], valve: [760, 505] },
    { to: 'Lift', p: 'main', points: [[455, 560], [455, 535], [960, 535], [960, 490]], valve: [600, 535] },
    { to: 'Aft Engine', p: 'lower', points: [[370, 610], [370, 680], [110, 680], [110, 765]], valve: [230, 680] },
    { to: 'Fore Engine', p: 'lower', points: [[440, 610], [440, 692], [1490, 692], [1490, 765]], valve: [1260, 692] },
  ]),

  // Steam vents: hold Action here to release boiler pressure when it gets too high.
  vents: withD([
    { p: 'catwalk', x: 600 },
    { p: 'main', x: 1000 },
    { p: 'lower', x: 1100 },
  ]),

  // The gasbag envelope (an ellipse). Holes in it are patched from the catwalk below
  // or the crow's nest on top.
  gasbag: { cx: 800, cy: 198, rx: 1000, ry: 232 },
  // How far the crow's nest (and flag, periscope) sits above where it was drawn when the bag was smaller.
  nestRise: 94,

  // Where to stand to repair the lift.
  liftRepair: { p: 'lower', x: 925 },

  // Tool racks and fire-extinguisher hooks: tap Action to take (or put back) a tool.
  racks: withD([
    { kind: 'sword', p: 'main', x: 660 },
    { kind: 'hammer', p: 'main', x: 860 },
    { kind: 'sword', p: 'lower', x: 1340 },
    // More hammers where the holes and repairs actually happen (the outriggers, the top deck).
    { kind: 'hammer', p: 'lower', x: 1430 },
    { kind: 'hammer', p: 'lower', x: 110 },
    { kind: 'hammer', p: 'catwalk', x: 480 },
    { kind: 'hammer', p: 'lower', x: 690 },
    // Grappling hookshots (ATTACK fires, swing and launch across the sky): top deck and main deck.
    { kind: 'hookshot', p: 'catwalk', x: 1150 },
    { kind: 'hookshot', p: 'main', x: 960 },
    // The ICE LOCKER, aft of the boiler (goingDown.js): take a block, throw it on the boiler to cool it. Drawn by goingDownArt.js.
    { kind: 'ice', p: 'main', x: 285 },
  ]),
  extinguishers: withD([
    { p: 'lower', x: 1510 },
    { p: 'main', x: 520 },
    { p: 'main', x: 1185 },
    { p: 'lower', x: 300 },
    { p: 'lower', x: 1040 },
    { p: 'catwalk', x: 820 },
  ]),

  // Where raiders land (grapple points on the catwalk).
  boarderEntryPoints: [
    { x: 290, p: 'catwalk' },
    { x: 1335, p: 'catwalk' },
  ],

  // Outer edges of the whole ship drawing. The camera keeps all of this in view.
  bounds: { x0: -240, x1: 1810, y0: -165, y1: 975 },

  // Where enemy fire is aimed (centre of the gondola).
  aimPoint: { x: 800, y: 640 },
};
