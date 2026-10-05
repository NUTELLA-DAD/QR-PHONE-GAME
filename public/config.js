export const config = {
  W: 1600,
  H: 900,
  FLOORS: [500, 650, 800],
  LADDERS: [520, 1080],
  X0: 290,
  X1: 1310,
  INK: '#1b1410',
  MAX_PLAYERS: 16,
  PLAYER_COLORS: ['#e63946', '#f4a261', '#f1c40f', '#2a9d8f', '#3a86ff', '#8338ec', '#ff5da2', '#06d6a0', '#ff7b00', '#00b4d8', '#9ef01a', '#b5179e', '#ffffff', '#7f5539', '#4cc9f0', '#d00000'],
  STATIONS: [
    { n: 'Lookout', d: 0, x: 330 },
    { n: 'Roof Gun', d: 0, x: 1270 },
    { n: 'Port Cannon', d: 1, x: 330 },
    { n: 'Navigator', d: 1, x: 800 },
    { n: 'Helm', d: 1, x: 1270 },
    { n: 'Boiler', d: 2, x: 330 },
    { n: 'Repairs', d: 2, x: 800 },
    { n: 'Ammo Hold', d: 2, x: 1270 },
  ],
  SPECIES: {
    bulldog: { fur: '#b08a62', ear: 'floppy' },
    wolf: { fur: '#7d8794', ear: 'point' },
    tiger: { fur: '#e8892b', ear: 'point', stripes: 1 },
    shiba: { fur: '#d9a05b', ear: 'point' },
    fox: { fur: '#d9572b', ear: 'point' },
    bear: { fur: '#6b4a33', ear: 'round' },
    cat: { fur: '#9a9a9a', ear: 'point' },
    devil: { fur: '#c8372d', ear: 'point', horns: 1 },
  },
};

export const SHIP_LAYOUT = {
  floors: config.FLOORS.slice(),
  ladders: config.LADDERS.slice(),
  stations: config.STATIONS.map((s) => ({ ...s })),
  gunMounts: {
    'Port Cannon': { bx: 262, by: config.FLOORS[1] - 62, aim: Math.PI },
    'Roof Gun': { bx: 1270, by: config.FLOORS[0] - 142, aim: -Math.PI / 2 },
  },
  boarderEntryPoints: [
    { x: config.X0 + 10, side: 'left' },
    { x: config.X1 - 10, side: 'right' },
  ],
};
