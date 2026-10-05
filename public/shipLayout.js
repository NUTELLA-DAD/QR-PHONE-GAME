// Ship layout as data. Change the ship here, not in the game code.
// Coordinates are in world pixels (the world is config.W x config.H).
// Floors are numbered 0 (top) to 2 (bottom); `d` on a station means which floor it is on.

const floors = [500, 650, 800];

export const SHIP_LAYOUT = {
  // Y position of each walkable floor (top to bottom).
  floors,

  // X position of each ladder. Ladders connect all floors.
  ladders: [520, 1080],

  // Left and right inner walls of the hull.
  hull: { x0: 290, x1: 1310 },

  // Rooms: a named area on one floor, from x0 to x1.
  rooms: [
    { name: 'Upper Deck', d: 0, x0: 290, x1: 1310 },
    { name: 'Gun Deck', d: 1, x0: 290, x1: 1310 },
    { name: 'Engine Deck', d: 2, x0: 290, x1: 1310 },
  ],

  // Stations players can use. n = name, d = floor, x = position.
  stations: [
    { n: 'Lookout', d: 0, x: 330 },
    { n: 'Roof Gun', d: 0, x: 1270 },
    { n: 'Port Cannon', d: 1, x: 330 },
    { n: 'Navigator', d: 1, x: 800 },
    { n: 'Helm', d: 1, x: 1270 },
    { n: 'Boiler', d: 2, x: 330 },
    { n: 'Repairs', d: 2, x: 800 },
    { n: 'Ammo Hold', d: 2, x: 1270 },
  ],

  // Where each gun's barrel pivots (bx, by) and its resting aim angle.
  gunMounts: {
    'Port Cannon': { bx: 262, by: floors[1] - 62, aim: Math.PI },
    'Roof Gun': { bx: 1270, by: floors[0] - 142, aim: -Math.PI / 2 },
  },

  // Where raiders can climb aboard.
  boarderEntryPoints: [
    { x: 300, side: 'left' },
    { x: 1300, side: 'right' },
  ],
};
