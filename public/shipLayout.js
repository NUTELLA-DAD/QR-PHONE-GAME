// Ship layout as data. Change the ship here, not in the game code.
// Coordinates are world pixels; y grows downward. The ship flies to the RIGHT (bow on the right).
//
// Platforms are the walkable floors. Everything that sits on a floor says which one with `p`
// (a platform id). At load time each of those also gets `d` = the platform's index, which is what
// the game code uses.

const platforms = [
  { id: 'nest', name: "Crow's Nest", y: 52, x0: 610, x1: 990, outside: true },
  { id: 'catwalk', name: 'Top Catwalk', y: 470, x0: 240, x1: 1360, outside: true },
  { id: 'main', name: 'Main Deck', y: 640, x0: 140, x1: 1470 },
  { id: 'lower', name: 'Lower Deck', y: 790, x0: 20, x1: 1580 },
  { id: 'pod', name: 'Ball Turret', y: 905, x0: 735, x1: 855 },
  { id: 'hangar', name: 'Fighter Hatch', y: 905, x0: 1020, x1: 1110, outside: true },
];

const index = (id) => platforms.findIndex((p) => p.id === id);
const withD = (list) => list.map((o) => ({ ...o, d: index(o.p) }));

export const SHIP_LAYOUT = {
  platforms,

  // Ways between platforms. `top`/`bottom` are platform ids; xTop/xBottom where each end sits.
  // speed = climbing speed in pixels per second (vertical).
  connectors: [
    { type: 'rope', top: 'nest', bottom: 'catwalk', xTop: 720, xBottom: 720, speed: 150 },
    { type: 'ladder', top: 'catwalk', bottom: 'main', xTop: 300, xBottom: 300, speed: 170 },
    { type: 'ladder', top: 'catwalk', bottom: 'main', xTop: 1050, xBottom: 1050, speed: 170 },
    { type: 'ladder', top: 'main', bottom: 'lower', xTop: 255, xBottom: 255, speed: 170 },
    { type: 'stairs', top: 'main', bottom: 'lower', xTop: 560, xBottom: 700, speed: 150 },
    { type: 'lift', top: 'main', bottom: 'lower', xTop: 960, xBottom: 960, speed: 260 },
    { type: 'ladder', top: 'main', bottom: 'lower', xTop: 1140, xBottom: 1140, speed: 170 },
    { type: 'ladder', top: 'lower', bottom: 'pod', xTop: 760, xBottom: 760, speed: 170 },
    { type: 'ladder', top: 'lower', bottom: 'hangar', xTop: 1040, xBottom: 1040, speed: 170 },
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
    { name: 'Aft Outrigger', p: 'lower', x0: 20, x1: 250, outside: true },
    { name: 'Fore Outrigger', p: 'lower', x0: 1350, x1: 1580, outside: true },
  ]),

  // Stations players can use. n = name, p = platform, x = position.
  stations: withD([
    { n: 'Aft Dorsal Gun', p: 'nest', x: 660 },
    { n: 'Lookout', p: 'nest', x: 770 },
    { n: 'Deflector', p: 'catwalk', x: 940 },
    { n: 'Dorsal Gun', p: 'nest', x: 940 },
    { n: 'Tail Gun', p: 'main', x: 180 },
    { n: 'Lightning Coil', p: 'main', x: 710 },
    { n: 'Boiler', p: 'main', x: 400 },
    { n: 'Navigator', p: 'main', x: 1215 },
    { n: 'Helm', p: 'main', x: 1330 },
    { n: 'Nose Gun', p: 'main', x: 1430 },
    { n: 'Aft Sponson', p: 'lower', x: 420 },
    { n: 'Coal Bunker', p: 'lower', x: 570 },
    { n: 'Ammo Hold', p: 'lower', x: 870 },
    { n: 'Bomb Bay', p: 'lower', x: 495 },
    { n: 'Fore Sponson', p: 'lower', x: 1180 },
    { n: 'Ventral Gun', p: 'pod', x: 820 },
    { n: 'Escort Fighter', p: 'hangar', x: 1085 },
  ]),

  // Guns: where the barrel pivots (bx, by), the middle of its firing arc (aim, radians;
  // 0 = right, PI/2 = down) and how far it may turn either side of that (arc).
  gunMounts: {
    'Dorsal Gun': { bx: 950, by: 18, aim: -1.2, arc: 1.2 },
    'Aft Dorsal Gun': { bx: 650, by: 18, aim: -1.95, arc: 1.2 },
    'Tail Gun': { bx: 112, by: 585, aim: Math.PI, arc: 1.0 },
    'Nose Gun': { bx: 1498, by: 585, aim: 0, arc: 1.0 },
    'Aft Sponson': { bx: 330, by: 812, aim: 2.15, arc: 0.7 },
    'Fore Sponson': { bx: 1270, by: 812, aim: 1.0, arc: 0.7 },
    'Ventral Gun': { bx: 805, by: 948, aim: Math.PI / 2, arc: 1.2 },
  },

  // Lightning Coil emitter (on top of the crow's nest): fires up and out to the sides.
  coil: { x: 875, y: -20, aim: -Math.PI / 2, arc: 1.45 },

  // Deflector shield: a band on an ellipse around the whole ship, swung round by the crew.
  shield: { cx: 800, cy: 470, rx: 1020, ry: 660 },

  // Medical bay: where anyone who falls off the ship comes round.
  medbay: { p: 'lower', x: 640 },
  // Where the escort fighter hangs on its hook under the hull (below the Fighter Hatch).
  escortDock: { x: 1075, y: 965 },

  // Bomb bay doors in the belly, under the Bomb Bay station: bombs drop from here.
  bombBay: { x: 495, y: 815 },

  // Engines on the outriggers, driven by steam.
  engines: withD([
    { name: 'Aft Engine', p: 'lower', x: 70 },
    { name: 'Fore Engine', p: 'lower', x: 1530 },
  ]),

  // Steam pipes from the boiler to each steam-driven module. Each has a valve the crew can
  // open/close (tap Action while standing under it on platform p). Pipes can burst and leak.
  pipes: withD([
    { to: 'Helm', p: 'main', points: [[430, 560], [430, 505], [1330, 505], [1330, 530]], valve: [760, 505] },
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
  gasbag: { cx: 800, cy: 245, rx: 860, ry: 185 },

  // Where to stand to repair the lift.
  liftRepair: { p: 'lower', x: 925 },

  // Tool racks and fire-extinguisher hooks: tap Action to take (or put back) a tool.
  racks: withD([
    { kind: 'sword', p: 'main', x: 660 },
    { kind: 'hammer', p: 'main', x: 860 },
    { kind: 'sword', p: 'lower', x: 1340 },
  ]),
  extinguishers: withD([
    { p: 'main', x: 520 },
    { p: 'main', x: 1185 },
    { p: 'lower', x: 300 },
    { p: 'lower', x: 1040 },
    { p: 'catwalk', x: 820 },
  ]),

  // Where raiders land (grapple points on the catwalk).
  boarderEntryPoints: [
    { x: 290, p: 'catwalk' },
    { x: 1310, p: 'catwalk' },
  ],

  // Outer edges of the whole ship drawing. The camera keeps all of this in view.
  bounds: { x0: -100, x1: 1670, y0: -70, y1: 975 },

  // Where enemy fire is aimed (centre of the gondola).
  aimPoint: { x: 800, y: 640 },
};
