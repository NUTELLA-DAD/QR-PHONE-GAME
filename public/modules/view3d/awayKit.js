// THE AWAY TEAM'S KIT (CASTLE.md package A3; config.AWAY3D): the models of the things the away team uses and does on the ground. Everything is rigid and held; away3d.js decides which pose is shown on 8 fps keys.
// Coordinates of a model: x right, y up, z toward the viewer, the foot of the thing at (x, y0, z) given by the caller. Geometry never throws: sizes are clamped.
//   buildLadderCell(C)   -> ONE doubled geometry (style.js inkDouble, the picture and its ink in one mesh) of a ladder's cell: a rung with the two rails below it. The rope ladder and the wall ladders are instances of it.
//   makeIconAtlas()      -> { texture, cell(name) -> [u0, v0, u1, v1] } the objective signs' pictures (groundArt.js icon(), the same drawings as the 2D markers) on a 3 x 3 sheet
//   the prop functions   push pieces into a Batch (winch, keg, fuse, beacon, cage, banner, ground rings, arrow, planks, sign boards)
import { THREE, Batch, inkDouble } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createGroundArt } from '../host/groundArt.js';
import { config } from '../../config.js';

const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;
export const COLS = () => (config.AWAY3D && config.AWAY3D.COL) || {};

// ---- the ladder's cell: a rung (a plank across) and the two rails below it ---------------------------------------------------------------------------------------------------------------
export function buildLadderCell(C = COLS()) {
  const K = (config.AWAY3D && config.AWAY3D.ROPE) || {}, W = K.W || 24, H = K.CELL || 40;
  const B = new Batch();
  B.box(C.WOOD || '#8a6444', 0, -3.5, 0, W + 10, 6.4, 9, 1.4); // the rung
  for (const s of [-1, 1]) B.rod(C.ROPE || '#c9a66b', V(s * W / 2, 0.5, 0), V(s * W / 2, -H - 0.5, 0), 2.7, 1.1); // the rails
  const g = mergeGeometries(B.parts, false);
  for (const p of B.parts) p.dispose();
  return inkDouble(g);
}

// ---- the signs' pictures --------------------------------------------------------------------------------------------------------------------------------------------------------------------
export const ICONS = ['winch', 'charge', 'keg', 'ballista', 'beacon', 'cage', 'banner', 'tick', 'fuse'];
const BOARD_COL = { winch: '#8fe388', charge: '#ff7b3a', keg: '#c9a05f', ballista: '#ffb347', beacon: '#ffd23f', cage: '#9fdcff', banner: '#ff5a3c' }; // (the same as objectives.js META)
export function makeIconAtlas() {
  const N = 128, COLS_ = 3, cv = document.createElement('canvas');
  cv.width = cv.height = N * COLS_;
  const ctx = cv.getContext('2d');
  const art = createGroundArt({ ctx, world: {}, ink: () => {} });
  ICONS.forEach((name, i) => {
    const cx = (i % COLS_) * N + N / 2, cy = Math.floor(i / COLS_) * N + N / 2, r = N / 2 - 6;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, PI * 2);
    ctx.fillStyle = name === 'tick' ? '#cfc7b4' : '#fff7e0'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = config.INK; ctx.stroke();
    const col = name === 'fuse' ? BOARD_COL.charge : BOARD_COL[name] || '#8fe388';
    ctx.beginPath(); ctx.arc(cx, cy, r - 9, 0, PI * 2);
    ctx.lineWidth = 6; ctx.strokeStyle = name === 'fuse' ? '#d62828' : name === 'tick' ? '#9a9382' : col; ctx.stroke();
    if (name === 'tick') {
      ctx.strokeStyle = '#2d8a3e'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy); ctx.lineTo(cx - r * 0.1, cy + r * 0.35); ctx.lineTo(cx + r * 0.45, cy - r * 0.35); ctx.stroke();
    } else art.icon(name === 'fuse' ? 'charge' : name, cx, cy, r * 0.78 * 1.05, col);
    ctx.restore();
  });
  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const cell = (name) => { const i = Math.max(0, ICONS.indexOf(name)), x = (i % COLS_) / COLS_, y = 1 - Math.floor(i / COLS_) / COLS_; return [x, y - 1 / COLS_, x + 1 / COLS_, y]; }; // (v = 0 is the bottom of a canvas texture)
  return { texture, cell };
}

// ---- pieces ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A ring of dashes lying flat on the ground (x, y = the ground's top, z), r = its radius, n dashes, phase = which 1/n step it is turned to (the caller steps it)
export function groundRing(B, color, x, y, z, r, n, phase, w = 9, len = 0.55, ow = 1.1) {
  r = clamp(r, 8, 600); n = clamp(n | 0, 4, 40);
  const seg = ((2 * PI * r) / n) * len;
  for (let i = 0; i < n; i++) {
    const a = ((i + phase) / n) * PI * 2;
    B.box(color, x + Math.cos(a) * r, y + 3, z + Math.sin(a) * r, seg, 5, w, ow, 0, -a + PI / 2, 0);
  }
}
// A gold arrow pointing down (the pickup mark) with its tip at (x, y, z)
export function arrowDown(B, color, x, y, z, s = 1) {
  B.cone(color, x, y + 22 * s, z, 22 * s, 44 * s, 1.5, 0, 0, PI);
  B.box(color, x, y + 62 * s, z, 15 * s, 40 * s, 15 * s, 1.5);
}
// A sign: a post and a board (the picture is a textured quad placed by away3d.js)
export function signPost(B, C, x, y0, z, up, r) {
  B.box(C.SIGN_POST || '#5e4129', x, y0 + up / 2, z - 2, 8, up, 8, 1.2);
  B.cyl(C.BOARD || '#fff7e0', x, y0 + up, z, r, 5.5, 1.6, PI / 2);
}

// A barrel of powder: a fat body, two iron hoops, lids
export function kegAt(B, C, x, y0, z, s = 1, ry = 0) {
  B.sphere(C.KEG || '#a37a45', x, y0 + 27 * s, z, 22 * s, 27 * s, 22 * s, 1.7);
  B.cyl(C.KEG_BAND || '#3d3a3c', x, y0 + 14 * s, z, 20.4 * s, 4 * s, 0.9);
  B.cyl(C.KEG_BAND || '#3d3a3c', x, y0 + 40 * s, z, 20.4 * s, 4 * s, 0.9);
  B.cyl(C.WOOD_DARK || '#5e4129', x, y0 + 52.5 * s, z, 12 * s, 3 * s, 0.8);
  void ry;
}
export function kegPile(B, C, x, y0, z) {
  kegAt(B, C, x - 26, y0, z + 4, 1);
  kegAt(B, C, x + 24, y0, z - 4, 0.9);
  kegAt(B, C, x - 2, y0 + 50, z, 0.8);
}
// The fuse of a planted charge: a cord rising from the plug; frac = how much of it is left (the burning tip is returned)
const FUSE = [[0, 56], [11, 78], [-7, 98], [9, 119], [-3, 140]];
export function fuseTip(x, y0, frac) { // where the burning end is (frac 1 = a fresh cord, 0 = burnt down to the plug)
  frac = clamp(frac, 0, 1);
  const total = FUSE.length - 1, f = frac * total, i = Math.min(total - 1, Math.floor(f)), k = f - i, a = FUSE[i], b = FUSE[i + 1];
  return { x: x + a[0] + (b[0] - a[0]) * k, y: y0 + a[1] + (b[1] - a[1]) * k };
}
export function fuseCord(B, C, x, y0, z, frac) { // the cord from the plug up to the burning tip
  frac = clamp(frac, 0, 1);
  const total = FUSE.length - 1;
  for (let i = 0; i < total; i++) {
    const a = FUSE[i], b = FUSE[i + 1], t0 = i / total, t1 = (i + 1) / total;
    if (frac <= t0) break;
    const k = clamp((frac - t0) / (t1 - t0), 0, 1);
    B.rod(C.POWDER || '#2b2724', V(x + a[0], y0 + a[1], z), V(x + a[0] + (b[0] - a[0]) * k, y0 + a[1] + (b[1] - a[1]) * k, z), 2.6, 0.7);
  }
}

// The gate winch: a post and sill with the drum on its face (a wheel that looks at us), rope coiled on it, and a crank arm that is turned a step at a time. ang = the crank's angle
export function winch(B, C, x, y0, z, ang) {
  const wood = C.WOOD || '#8a6444', dark = C.WOOD_DARK || '#5e4129', iron = C.IRON || '#3f3b3e';
  B.box(dark, x, y0 + 9, z, 150, 18, 62, 1.6); // the sill
  for (const s of [-1, 1]) B.rod(dark, V(x + s * 66, y0 + 14, z - 8), V(x + s * 14, y0 + 118, z - 8), 5.2, 1.2); // the braces
  B.box(wood, x, y0 + 96, z - 10, 24, 190, 22, 1.8); // the post
  B.box(dark, x, y0 + 196, z - 10, 64, 14, 30, 1.4); // its cap
  B.cyl(wood, x, y0 + 108, z + 16, 40, 24, 1.6, PI / 2); // the drum, face to us
  B.cyl(C.ROPE || '#c9a66b', x, y0 + 108, z + 16, 43.5, 9, 1, PI / 2); // the rope coiled round it
  B.cyl(iron, x, y0 + 108, z + 32, 9, 10, 1, PI / 2); // the hub
  const ca = Math.cos(ang), sa = Math.sin(ang), len = 74;
  B.box(iron, x + ca * len / 2, y0 + 108 + sa * len / 2, z + 37, len, 9, 8, 1.2, 0, 0, ang); // the crank arm
  B.box(wood, x + ca * len, y0 + 108 + sa * len, z + 46, 10, 10, 28, 1.2); // its handle
  B.rod(C.ROPE || '#c9a66b', V(x + 30, y0 + 98, z + 24), V(x + 62, y0 + 20, z + 22), 2.4, 0.6); // the rope runs off to the gate
}

// The beacon: a stone pillar with an iron bowl. lit = the coals glow (the flames are the particles)
export function beacon(B, A, C, x, y0, z, lit) {
  const stone = A.stone || '#a09da2', shade = A.shade || '#7f7c84', trim = A.trim || '#68656e', iron = C.IRON || '#3f3b3e';
  B.box(shade, x, y0 + 11, z, 100, 22, 100, 2);
  B.cyl(stone, x, y0 + 70, z, 32, 100, 2);
  B.cyl(trim, x, y0 + 126, z, 42, 16, 1.6);
  B.cone(iron, x, y0 + 150, z, 64, 44, 1.8, 0, 0, PI); // the bowl, wide at the top
  B.cyl(iron, x, y0 + 173, z, 66, 7, 1.2);
  B.sphere(lit ? '#ff8a2a' : (C.COAL || '#2c2a2b'), x, y0 + 172, z, 48, 12, 48, 0.8, true);
  if (!lit) for (const [dx, dz, a] of [[-18, 6, 0.4], [14, -8, -0.5], [0, 14, 1.2]]) B.box(C.WOOD_DARK || '#5e4129', x + dx, y0 + 182, z + dz, 54, 10, 10, 1, 0, a, 0.25); // logs, laid ready
}

// The prisoner cage: a floor, a roof, corner posts and bars; the door swings open (open = 0 shut .. 1 open)
export function cage(B, A, C, x, y0, z, open) {
  const iron = C.IRON || '#3f3b3e', wood = C.WOOD_DARK || '#5e4129', W = 150, D = 100, H = 124, hx = W / 2, hz = D / 2;
  B.box(wood, x, y0 + 7, z, W + 14, 14, D + 14, 1.6);
  B.box(wood, x, y0 + H + 22, z, W + 20, 12, D + 20, 1.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(iron, x + sx * hx, y0 + 14 + H / 2, z + sz * hz, 9, H + 8, 9, 1.1);
  const bar = (bx, bz, h = H) => B.box(iron, bx, y0 + 14 + h / 2, bz, 4.6, h, 4.6, 0.8);
  for (let i = 1; i < 8; i++) { const bx = x - hx + (W / 8) * i; bar(bx, z - hz); if (!(open > 0 && Math.abs(bx - x) < W * 0.22)) bar(bx, z + hz); }
  for (let i = 1; i < 5; i++) { const bz = z - hz + (D / 5) * i; bar(x - hx, bz); bar(x + hx, bz); }
  B.box(iron, x, y0 + 14 + H - 8, z + hz, W, 6, 6, 0.8); B.box(iron, x, y0 + 28, z + hz, W, 6, 6, 0.8); // the rails along the front
  if (open > 0) { // the door, swung out toward us about its right hinge
    const hxp = x + W * 0.22, ang = clamp(open, 0, 1) * 1.35, dw = W * 0.44, dx = -Math.cos(ang), dz = Math.sin(ang);
    const cx = hxp + dx * dw / 2, cz = z + hz + dz * dw / 2, ry = Math.atan2(-dz, dx);
    B.box(iron, cx, y0 + 14 + H / 2, cz, dw, H, 5, 1.2, 0, ry, 0);
    for (const k of [-0.3, 0, 0.3]) B.box(iron, cx + dx * dw * k, y0 + 14 + H / 2, cz + dz * dw * k, 4.6, H, 4.6, 0.7);
  } else B.box(iron, x, y0 + 14 + H / 2, z + hz, W * 0.44, H, 5, 1.2); // (shut: a barred door panel in the front)
  B.box(C.GOLD || '#ffd23f', x + W * 0.1, y0 + 14 + H * 0.45, z + hz + 5, 12, 14, 5, 0.8); // the lock
}

// The great banner: a stone footing, a tall pole with a gold finial, a crossbar and a crimson cloth of four hinged segments (pose 0..2 = the three held poses of the castle's flags)
const FLAP = [[0, 0, 0, 0], [0, 4, 9, 14], [0, -3, -6, -11]];
export function greatBanner(B, A, C, x, y0, z, pose) {
  const red = A.banner || C.BANNER || '#a8302c', gold = A.gold || C.BANNER_GOLD || '#d9b24e', wood = A.woodDark || C.WOOD_DARK || '#563c28';
  B.box(A.shade || '#7f7c84', x, y0 + 16, z, 76, 32, 60, 1.8);
  B.rod(wood, V(x, y0 + 30, z), V(x, y0 + 352, z), 5, 1.4);
  B.cone(gold, x, y0 + 372, z, 9, 30, 1.2);
  B.box(gold, x + 62, y0 + 332, z, 124, 7, 7, 1);
  const widths = [38, 34, 30, 26], heights = [128, 116, 98, 74], f = FLAP[((pose % 3) + 3) % 3];
  let ox = x + 6;
  for (let i = 0; i < 4; i++) {
    const w = widths[i], h = heights[i];
    B.box(red, ox + w / 2, y0 + 326 - h / 2 + f[i] * 0.6, z + 1, w + 0.5, h, 3.4, 1.2, 0, 0, i ? -0.02 * i : 0);
    B.box(gold, ox + w / 2, y0 + 326 + f[i] * 0.6, z + 2, w + 0.5, 6, 4, 0.6);
    if (i === 1) B.cone(A.flame || '#ffb347', ox + w / 2, y0 + 326 - h * 0.56, z + 4, 15, 52, 0.8);
    ox += w;
  }
}

// The wall walk's plank ledge: a wooden platform on brackets, hung on the wall from x0 to x1 with its top at y (the walk's height)
export function plank(B, C, x0, x1, y, z, depth, thick) {
  const wood = C.WOOD || '#8a6444', dark = C.WOOD_DARK || '#5e4129', len = Math.max(10, x1 - x0), cx = (x0 + x1) / 2;
  B.box(wood, cx, y - thick / 2, z, len, thick, depth, 2);
  B.box(dark, cx, y - thick - 5, z + depth / 2 - 3, len, 10, 6, 1.2); // the front beam
  const n = Math.max(2, Math.round(len / 280));
  for (let i = 0; i <= n; i++) { const bx = x0 + (len * i) / n; B.rod(dark, V(bx, y - thick - 4, z + depth / 2 - 6), V(bx, y - thick - 90, z - depth / 2 - 24), 5, 1.2); }
  for (let i = 0; i < len / 70; i++) B.box(dark, x0 + 35 + i * 70, y + 0.4, z, 3, 1, depth - 4, 0); // plank seams
}
