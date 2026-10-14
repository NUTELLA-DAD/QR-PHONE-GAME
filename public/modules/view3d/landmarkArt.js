// LOOP.md R3: the far landmarks and the destination silhouettes, built from farKit.js pieces (flat silhouettes in three baked tones; no ink: they are painted like the strips behind them).
// A builder is ART[type](F, P, s, r): F = the Far builder, P = the environment's palette, s = a size multiplier, r = the seeded random (0..1). The origin of a FLOATING thing is its middle (its top surface), of a STANDING
// thing (a spire, a lighthouse, a volcano) the foot of what is seen: they all carry on far below the bottom of the picture, so nothing ever hangs on nothing. Units are world px at the thing's own depth.
// LAMPS (a lighthouse's lamp, a foundry's windows, a crater, a crystal's glow) carry a lamp amount: they ignore the tint and the haze, so they shine in the dark and the bloom picks them up.
// Every list says which landmarks an environment draws, how high in the sky each hangs (share: -1 the bottom of the picture .. 1 the top) and how big it is. Nothing here moves.
const PI = Math.PI;

export const PALETTE = {
  skyisles: { rock: '#b09c8c', rock2: '#8c7b72', grass: '#a2c67c', grass2: '#7fa862', wood: '#8a6a4a', roof: '#c4604a', stone: '#d4cab8', white: '#f0ebe0', red: '#c9473d', gold: '#e3b04b', lamp: '#ffe9a0' },
  ember: { rock: '#6a4a4c', rock2: '#46303a', grass: '#5a4a44', grass2: '#3e3236', wood: '#4a3a36', roof: '#7a3428', stone: '#8a6a60', white: '#c9b0a0', red: '#a8402c', gold: '#ff9a40', lamp: '#ff8a3a' },
  frost: { rock: '#8da2b8', rock2: '#6a7e96', grass: '#f1f6fa', grass2: '#c8d9e8', wood: '#8a6a4a', roof: '#b5483f', stone: '#d4dde8', white: '#f6fafc', red: '#c9473d', gold: '#e3b04b', lamp: '#ffe9a0' },
  fungal: { rock: '#58587a', rock2: '#3c3c5a', grass: '#8c64b0', grass2: '#6a4a8e', wood: '#d8c9b0', roof: '#6a4a8e', stone: '#b8a8cc', white: '#e4dcd0', red: '#b04a78', gold: '#7affc0', lamp: '#7affc0' },
  sea: { rock: '#8a9698', rock2: '#667478', grass: '#93b66e', grass2: '#76a05a', wood: '#7a5a40', roof: '#c9473d', stone: '#d8d2c4', white: '#f3eee2', red: '#c9473d', gold: '#e3b04b', lamp: '#ffe9a0' },
  aether: { rock: '#7a78a6', rock2: '#58568a', grass: '#b7c2f2', grass2: '#8f9de0', wood: '#a8a2c8', roof: '#8f9de0', stone: '#d8d2ee', white: '#f0eefc', red: '#d0709a', gold: '#bff2ff', lamp: '#bff2ff' },
  storm: { rock: '#5a6678', rock2: '#3c4658', grass: '#4a5668', grass2: '#343e4e', wood: '#5a4a40', roof: '#3a4252', stone: '#8794a8', white: '#aab6c8', red: '#a84a44', gold: '#cfe6ff', lamp: '#cfe6ff' },
};

// ---- parts shared by several landmarks ----------------------------------------------------------------------------------------------------------------------------------------------------------
function islet(F, P, s, r, o = {}) { // a floating island: rock hanging underneath, a flat top with grass; returns the top radius
  const R = s * (o.r || 700), H = R * (o.deep || 1.0);
  F.cone(P.rock2, 0, -H * 0.5 - 14, 0, R * 0.98, H, 9, PI, 0, 0);
  F.cone(P.rock, R * 0.22, -H * 0.38 - 14, R * 0.12, R * 0.62, H * 0.66, 7, PI, 0.5, 0.06);
  F.cyl(o.top || P.grass, 0, -R * 0.07, 0, R, R * 1.02, R * 0.15, 14);
  F.cyl(o.rim || P.rock, 0, -R * 0.17, 0, R * 0.99, R * 0.9, R * 0.1, 14);
  return R;
}
function tree(F, P, x, y, z, h, col) { F.cyl(P.wood, x, y + h * 0.18, z, h * 0.05, h * 0.07, h * 0.36, 5); F.cone(col, x, y + h * 0.62, z, h * 0.28, h * 0.62, 7); }
function hut(F, P, x, y, z, w) { F.box(P.stone, x, y + w * 0.3, z, w, w * 0.6, w * 0.8); F.cone(P.roof, x, y + w * 0.78, z, w * 0.82, w * 0.46, 4, 0, PI / 4, 0); }
const col = (F, color, x, z, top, rTop, rBot, seg = 8, bottom = 3200) => F.cyl(color, x, (top - bottom) / 2, z, rTop, rBot, top + bottom, seg); // a column standing from far below the picture up to `top`
function lighthouse(F, P, x, y, z, h, w) { // a banded tower with a gallery, a lamp room (the lamp is flagged) and a cap; y is its foot
  const n = 5;
  for (let i = 0; i < n; i++) F.cyl(i % 2 ? P.red : P.white, x, y + ((i + 0.5) * h) / n, z, w * (0.62 - 0.09 * ((i + 1) / n)), w * (0.62 - 0.09 * (i / n)) + 4, h / n + 1, 8);
  F.cyl(P.rock2, x, y + h + w * 0.04, z, w * 0.82, w * 0.74, w * 0.12, 8);
  F.cyl(P.stone, x, y + h + w * 0.34, z, w * 0.34, w * 0.34, w * 0.5, 8); // the lamp room
  F.sph(P.lamp, x, y + h + w * 0.36, z, w * 0.3, w * 0.34, w * 0.3, 6, 0, 0, 0, 3.2);
  F.cone(P.red, x, y + h + w * 0.8, z, w * 0.5, w * 0.5, 8);
}
function keep(F, P, x, y, z, w, h, roof) { // a square keep with a cone roof and lit windows
  F.box(P.stone, x, y + h / 2, z, w, h, w * 0.8);
  F.cone(roof || P.roof, x, y + h + w * 0.3, z, w * 0.78, w * 0.6, 4, 0, PI / 4, 0);
  for (const k of [-0.22, 0.22]) F.box(P.lamp, x + k * w, y + h * 0.7, z + w * 0.4 + 2, w * 0.09, w * 0.16, 4, 0, 0, 0, 0.6);
}
function mushroom(F, P, x, y, z, h, glow) {
  F.cyl(P.wood, x, y + h * 0.3, z, h * 0.09, h * 0.14, h * 0.6, 7);
  F.sph(P.grass, x, y + h * 0.66, z, h * 0.42, h * 0.26, h * 0.42, 10);
  F.sph(P.grass2, x, y + h * 0.6, z, h * 0.44, h * 0.12, h * 0.44, 10);
  for (const [dx, dz] of [[-0.18, 0.1], [0.14, 0.2], [0.05, -0.18]]) F.sph(glow ? P.lamp : P.white, x + dx * h, y + h * 0.84, z + dz * h, h * 0.05, h * 0.04, h * 0.05, 5, 0, 0, 0, glow ? 0.8 : 0);
}
function crystal(F, P, x, y, z, h, w, tilt = 0, glow = 0.25) { // a hexagonal crystal: a tall prism with a point
  F.cyl(P.grass, x, y + h * 0.32, z, w, w * 0.9, h * 0.64, 6, 0, 0, tilt);
  F.cone(P.grass2, x - Math.sin(tilt) * h * 0.64, y + h * 0.64 + h * 0.18, z, w, h * 0.36, 6, 0, 0, tilt);
  if (glow > 0) F.cone(P.lamp, x - Math.sin(tilt) * h * 0.64, y + h * 0.64 + h * 0.18, z + w * 0.5, w * 0.34, h * 0.3, 6, 0, 0, tilt, glow);
}

// ---- landmarks --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const ART = {
  islet(F, P, s, r) { const R = islet(F, P, s, r, { r: 650 + 350 * r() }); tree(F, P, -R * 0.4, 0, 0, R * 0.55, P.grass2); tree(F, P, R * 0.1, 0, R * 0.2, R * 0.4, P.grass2); if (r() < 0.6) hut(F, P, R * 0.45, 0, -R * 0.1, R * 0.28); },
  windmillIsle(F, P, s, r) {
    const R = islet(F, P, s, r, { r: 760 });
    F.cyl(P.stone, 0, R * 0.42, 0, R * 0.12, R * 0.2, R * 0.84, 8); F.cone(P.roof, 0, R * 0.96, 0, R * 0.2, R * 0.26, 8);
    for (let i = 0; i < 4; i++) { const a = i * (PI / 2) + 0.35; F.box(P.wood, Math.cos(a) * R * 0.3, R * 0.8 + Math.sin(a) * R * 0.3, R * 0.2, R * 0.07, R * 0.58, R * 0.03, 0, 0, a - PI / 2); }
    hut(F, P, -R * 0.55, 0, 0, R * 0.26); tree(F, P, R * 0.55, 0, 0, R * 0.5, P.grass2);
  },
  lightIsle(F, P, s, r) { const R = islet(F, P, s, r, { r: 640 }); lighthouse(F, P, 0, 0, 0, R * 1.5, R * 0.34); tree(F, P, R * 0.55, 0, 40, R * 0.4, P.grass2); },
  castleIsle(F, P, s, r) {
    const R = islet(F, P, s, r, { r: 980, deep: 1.15 });
    keep(F, P, 0, 0, 0, R * 0.34, R * 0.62); keep(F, P, -R * 0.5, 0, 60, R * 0.2, R * 0.4); keep(F, P, R * 0.5, 0, 60, R * 0.22, R * 0.46);
    F.box(P.stone, 0, R * 0.12, R * 0.2, R * 1.1, R * 0.24, R * 0.08);
  },
  arch(F, P, s, r) { // two rock pillars and a lintel on a floating rock
    const R = islet(F, P, s, r, { r: 880, top: P.rock, rim: P.rock2 });
    F.box(P.stone, -R * 0.4, R * 0.5, 0, R * 0.2, R * 1.0, R * 0.26); F.box(P.stone, R * 0.4, R * 0.5, 0, R * 0.2, R * 1.0, R * 0.26);
    F.box(P.stone, 0, R * 1.04, 0, R * 1.05, R * 0.18, R * 0.3); F.box(P.stone, R * 0.1, R * 1.2, 0, R * 0.4, R * 0.16, R * 0.26);
  },
  spire(F, P, s, r) { // a stack of rock rising from far below the picture
    const T = 1900 * s, W = 520 * s * (0.8 + 0.4 * r());
    col(F, P.rock2, 0, 0, T, W * 0.16, W * 1.5, 8);
    col(F, P.rock, W * 0.5, W * 0.2, T * 0.62, W * 0.1, W * 0.84, 7);
    col(F, P.rock, -W * 0.7, W * 0.1, T * 0.42, W * 0.1, W * 0.7, 6);
    F.cyl(P.stone, 0, T + W * 0.2, 0, W * 0.1, W * 0.16, W * 0.5, 6);
  },
  seastack(F, P, s, r) { // sea stacks with a grassy cap
    const W = 520 * s;
    for (const [x, h, w, z] of [[-W * 1.1, 1100, 0.55, 20], [0, 1600, 0.8, 0], [W * 1.0, 900, 0.5, 40], [W * 1.9, 600, 0.4, 60]]) {
      col(F, P.rock2, x, z, h * s, W * w * 0.62, W * w * 1.4, 8);
      F.cyl(P.grass, x, h * s + 40, z, W * w * 0.6, W * w * 0.64, 90, 8);
    }
  },
  lighthouse(F, P, s, r) { // a lighthouse on a rock, standing from far below
    const W = 300 * s;
    col(F, P.rock2, 0, 0, 300, W * 1.0, W * 3.2, 9); col(F, P.rock, W * 0.9, W * 0.3, 120, W * 0.5, W * 1.8, 7);
    F.cyl(P.grass, 0, 330, 0, W * 1.2, W * 1.4, 160, 9);
    lighthouse(F, P, 0, 400, 0, 1400 * s, W);
  },
  volcano(F, P, s, r) {
    const W = 1500 * s, H = 1700 * s;
    col(F, P.rock2, 0, 0, H, W * 0.16, W, 10, 3400); col(F, P.rock, -W * 0.2, W * 0.1, H * 0.7, W * 0.1, W * 0.55, 7, 3400);
    F.cyl(P.rock, 0, H + 40, 0, W * 0.15, W * 0.17, 100, 10);
    F.cyl(P.lamp, 0, H + 96, 0, W * 0.13, W * 0.13, 30, 10, 0, 0, 0, 3.0); // the crater's glow
    F.box(P.lamp, W * 0.06, H - 330, W * 0.15, W * 0.05, 560, 10, 0, 0, 0.1, 2.4); F.box(P.lamp, -W * 0.08, H - 760, W * 0.18, W * 0.04, 520, 10, 0, 0, -0.15, 2.0); // lava running down
    for (let i = 0; i < 4; i++) F.sph(P.stone, 90 * (i % 2 ? 1 : -1) + i * 20, H + 250 + i * 330, 0, 160 + i * 50, 120 + i * 30, 120, 7); // the plume
  },
  foundry(F, P, s, r) { // a floating works: sheds with sawtooth roofs, chimneys, windows alight
    const R = islet(F, P, s, r, { r: 900, top: P.grass, rim: P.rock });
    F.box(P.roof, -R * 0.3, R * 0.2, 0, R * 0.7, R * 0.36, R * 0.4);
    for (let i = 0; i < 3; i++) F.cone(P.rock2, -R * 0.55 + i * R * 0.25, R * 0.46, R * 0.2, R * 0.12, R * 0.12, 4, 0, PI / 4, 0);
    F.cyl(P.stone, R * 0.3, R * 0.7, 0, R * 0.07, R * 0.1, R * 1.4, 8); F.cyl(P.stone, R * 0.5, R * 0.55, 0, R * 0.06, R * 0.09, R * 1.1, 8);
    F.cyl(P.lamp, R * 0.3, R * 1.42, 0, R * 0.075, R * 0.075, R * 0.05, 8, 0, 0, 0, 3.0);
    for (const x of [-0.5, -0.3, -0.1]) F.box(P.lamp, R * x, R * 0.22, R * 0.21, R * 0.06, R * 0.07, 4, 0, 0, 0, 1.4);
  },
  chimneys(F, P, s, r) { // three tall chimneys rising from far below, glowing at the top
    const W = 150 * s;
    for (const [x, h] of [[-W * 2.4, 1500], [0, 2200], [W * 2.2, 1100]]) { col(F, P.stone, x, 0, h * s, W * 0.7, W * 1.1, 8); F.cyl(P.rock2, x, h * s + 40, 0, W * 0.95, W * 0.78, 90, 8); F.cyl(P.lamp, x, h * s + 90, 0, W * 0.6, W * 0.6, 24, 8, 0, 0, 0, 2.8); }
  },
  wreck(F, P, s, r) { // a wrecked airship hanging in the sky: a broken hull, two masts, a skeleton of the bag
    const L = 900 * s;
    F.sph(P.wood, 0, 0, 0, L * 0.55, L * 0.12, L * 0.14, 10, 0, 0, 0.18);
    F.box(P.rock2, -L * 0.1, L * 0.14, 0, L * 0.5, L * 0.05, L * 0.12, 0, 0, 0.18);
    F.cyl(P.rock2, L * 0.15, L * 0.46, 0, 6 * s, 9 * s, L * 0.6, 5, 0, 0, 0.12); F.cyl(P.rock2, -L * 0.22, L * 0.4, 0, 6 * s, 9 * s, L * 0.5, 5, 0, 0, 0.1);
    for (let i = 0; i < 5; i++) F.cyl(P.stone, -L * 0.28 + i * L * 0.16, L * 0.5 - i * 5 * s, 0, 5 * s, 5 * s, L * 0.5 - Math.abs(i - 2) * 30 * s, 5, 0, 0, 0.18); // the ribs of the bag
    F.cyl(P.stone, L * 0.05, L * 0.76, 0, L * 0.5, L * 0.5, 6 * s, 12, 0, 0, PI / 2 + 0.18);
    F.poly(P.roof, [[0, 0], [L * 0.12, 0], [L * 0.1, -L * 0.28], [0, -L * 0.1]], 10, -L * 0.62, L * 0.0, 0);
  },
  iceSpire(F, P, s, r) { // a cluster of tall ice shards
    const W = 440 * s;
    col(F, P.rock2, 0, 0, 2000 * s, W * 0.1, W * 1.4, 6); col(F, P.rock, W * 0.8, W * 0.2, 1200 * s, W * 0.08, W * 0.8, 5); col(F, P.rock, -W * 0.8, 0, 900 * s, W * 0.08, W * 0.7, 5);
    F.cone(P.white, 0, 2000 * s - 160, 0, W * 0.3, 520 * s, 6);
  },
  glacier(F, P, s, r) { // a long ice cliff with a snow cap, standing from far below
    const W = 1800 * s;
    F.box(P.rock, 0, (900 * s - 3200) / 2, 0, W, 900 * s + 3200, 560); F.box(P.white, -W * 0.05, 900 * s + 90, 0, W * 0.9, 220 * s, 580);
    col(F, P.rock2, W * 0.55, 40, 1500 * s, W * 0.05, W * 0.28, 5); F.cone(P.white, W * 0.55, 1500 * s + 120, 40, W * 0.12, 420 * s, 5);
    col(F, P.rock2, -W * 0.6, 30, 1100 * s, W * 0.05, W * 0.22, 5);
  },
  iceIsle(F, P, s, r) { const R = islet(F, P, s, r, { r: 760, top: P.white, rim: P.rock }); F.cone(P.rock, -R * 0.3, R * 0.4, 0, R * 0.26, R * 0.9, 5); F.cone(P.white, -R * 0.3, R * 0.78, 0, R * 0.14, R * 0.34, 5); F.cone(P.rock, R * 0.3, R * 0.3, 20, R * 0.2, R * 0.6, 5); },
  sporeIsle(F, P, s, r) { const R = islet(F, P, s, r, { r: 760, top: P.rock, rim: P.rock2 }); mushroom(F, P, -R * 0.35, 0, 0, R * 1.0, true); mushroom(F, P, R * 0.2, 0, 60, R * 0.7, false); mushroom(F, P, R * 0.55, 0, -30, R * 0.5, true); },
  mushroom(F, P, s, r) { // a giant mushroom standing from far below
    const h = 1900 * s;
    col(F, P.wood, 0, 0, h, h * 0.09, h * 0.16, 8); F.sph(P.grass, 0, h + h * 0.06, 0, h * 0.42, h * 0.2, h * 0.42, 12); F.sph(P.grass2, 0, h - h * 0.02, 0, h * 0.44, h * 0.08, h * 0.44, 12);
    for (const [dx, dz] of [[-0.18, 0.1], [0.14, 0.2], [0.05, -0.16], [0.26, -0.04]]) F.sph(P.lamp, dx * h, h + h * 0.2, dz * h, h * 0.05, h * 0.035, h * 0.05, 5, 0, 0, 0, 0.8);
  },
  crystalIsle(F, P, s, r) { const R = islet(F, P, s, r, { r: 720, top: P.rock, rim: P.rock2 }); crystal(F, P, -R * 0.3, 0, 0, R * 1.2, R * 0.16, 0.12); crystal(F, P, R * 0.1, 0, 60, R * 1.7, R * 0.2, -0.05); crystal(F, P, R * 0.45, 0, 0, R * 0.9, R * 0.13, -0.2); },
  crystal(F, P, s, r) { // a bed of crystals standing from far below
    const h = 1700 * s, w = 190 * s;
    col(F, P.rock2, 0, 0, 200, w * 1.2, w * 3.2, 7); crystal(F, P, 0, 100, 0, h, w, 0.04); crystal(F, P, w * 2.2, 100, 40, h * 0.6, w * 0.8, -0.18); crystal(F, P, -w * 2.0, 100, 30, h * 0.7, w * 0.9, 0.2);
  },
  ruinArch(F, P, s, r) { // broken columns and a lintel hanging in the air on a thin rock
    const R = islet(F, P, s, r, { r: 640, top: P.rock, rim: P.rock2, deep: 0.7 });
    F.cyl(P.stone, -R * 0.4, R * 0.5, 0, R * 0.08, R * 0.1, R * 1.0, 8); F.cyl(P.stone, R * 0.1, R * 0.34, 0, R * 0.08, R * 0.1, R * 0.68, 8); F.box(P.stone, -R * 0.15, R * 1.06, 0, R * 0.7, R * 0.1, R * 0.2, 0, 0, 0.05);
  },
  stormSpire(F, P, s, r) { // a black crown of rock with a flickering lightning rod
    const T = 2000 * s, W = 480 * s;
    col(F, P.rock2, 0, 0, T, W * 0.14, W * 1.5, 6); col(F, P.rock, W * 0.6, 0, T * 0.55, W * 0.1, W * 0.8, 5); col(F, P.rock, -W * 0.7, 0, T * 0.4, W * 0.08, W * 0.6, 5);
    F.cyl(P.stone, 0, T + 380 * s, 0, 10 * s, 14 * s, 760 * s, 5);
    F.sph(P.lamp, 0, T + 800 * s, 0, 50 * s, 50 * s, 50 * s, 6, 0, 0, 0, 3.0);
  },
  pylons(F, P, s, r) { // the stumps of a ruined sky bridge
    const W = 120 * s;
    for (const x of [-1, 0, 1]) { const T = (x === 0 ? 1500 : 1150) * s; col(F, P.stone, x * W * 9, 0, T, W * 0.5, W * 0.8, 6); F.box(P.rock2, x * W * 9, T + W * 0.2, 0, W * 2.2, W * 0.5, W * 1.2); }
    F.box(P.rock2, -W * 4.5, 1400 * s, 0, W * 6, W * 0.4, W * 1.0, 0, 0, 0.06); F.box(P.rock2, W * 8.5, 1050 * s, 0, W * 3.2, W * 0.4, W * 1.0, 0, 0, -0.12);
  },
};

// the environments' lists: [type, share low, share high, size low, size high]
export const LIST = {
  skyisles: [['islet', 0.12, 0.64, 0.9, 1.4], ['windmillIsle', 0.12, 0.59, 1, 1.3], ['lightIsle', 0.17, 0.59, 1, 1.3], ['castleIsle', 0.17, 0.64, 1, 1.2], ['arch', 0.22, 0.64, 1, 1.2], ['islet', 0.12, 0.64, 0.8, 1.2]],
  ember: [['spire', -0.2, -0.05, 0.8, 1.2], ['volcano', -0.25, -0.1, 0.8, 1.1], ['foundry', 0.12, 0.59, 0.9, 1.2], ['wreck', 0.22, 0.64, 0.9, 1.3], ['chimneys', -0.3, -0.1, 0.9, 1.2], ['spire', -0.2, -0.05, 0.7, 1.0]],
  frost: [['iceSpire', -0.25, -0.05, 0.8, 1.2], ['glacier', -0.3, -0.1, 0.9, 1.3], ['iceIsle', 0.12, 0.64, 0.9, 1.3], ['lightIsle', 0.17, 0.59, 1, 1.2], ['iceSpire', -0.25, -0.05, 0.7, 1.0]],
  fungal: [['mushroom', -0.25, -0.05, 0.8, 1.3], ['sporeIsle', 0.12, 0.64, 0.9, 1.3], ['mushroom', -0.25, -0.05, 0.6, 1.0]],
  sea: [['seastack', -0.3, -0.1, 0.8, 1.2], ['lighthouse', -0.3, -0.12, 0.9, 1.2], ['wreck', 0.12, 0.44, 0.9, 1.2], ['seastack', -0.3, -0.1, 0.7, 1.0], ['islet', 0.12, 0.54, 0.8, 1.1]],
  aether: [['crystalIsle', 0.12, 0.64, 0.9, 1.3], ['crystal', -0.25, -0.05, 0.8, 1.2], ['ruinArch', 0.17, 0.64, 1, 1.3], ['crystalIsle', 0.12, 0.64, 0.8, 1.1]],
  storm: [['stormSpire', -0.25, -0.05, 0.8, 1.2], ['wreck', 0.22, 0.54, 0.9, 1.3], ['castleIsle', 0.17, 0.59, 0.9, 1.1], ['stormSpire', -0.25, -0.05, 0.7, 1.0], ['wreck', 0.22, 0.54, 0.8, 1.1]],
};

// ---- the destination: what the next stop looks like on the horizon (one mesh, grown by landmarks3d.js as the ship comes near) -----------------------------------------------------------------------------
export const DEST = {
  beacon(F, P) { // the turning beacon: a tall banded lighthouse on its rock
    const W = 360;
    col(F, P.rock2, 0, 0, 300, W * 1.2, W * 3.4, 9); col(F, P.rock, W * 1.1, W * 0.3, 120, W * 0.6, W * 1.9, 7);
    F.cyl(P.grass, 0, 330, 0, W * 1.3, W * 1.5, 180, 9);
    lighthouse(F, P, 0, 420, 0, 1900, W);
  },
  fort(F, P) { // the next outpost: a curtain wall with three towers, flags on poles
    const W = 2000;
    F.box(P.stone, 0, 260, 0, W, 420, 260);
    F.box(P.rock2, 0, 520, 0, W * 1.02, 60, 280);
    for (const x of [-0.45, 0, 0.45]) { F.cyl(P.stone, x * W, 620, 0, 150, 175, 1100, 8); F.cone(P.roof, x * W, 1320, 0, 205, 260, 8); F.box(P.lamp, x * W, 900, 160, 60, 110, 4, 0, 0, 0, 0.7); }
    F.cyl(P.rock2, 0, 1570, 0, 6, 6, 400, 4); F.poly(P.red, [[0, 0], [150, -50], [0, -110]], 8, 0, 1760, 0);
    col(F, P.rock2, 0, 0, 80, W * 0.5, W * 0.9, 10);
  },
  volcano(F, P) { ART.volcano(F, P, 1.5, () => 0.5); },
  stormcrown(F, P) { ART.stormSpire(F, P, 1.5, () => 0.5); },
  tidehenge(F, P) { ART.seastack(F, P, 1.6, () => 0.5); },
};
