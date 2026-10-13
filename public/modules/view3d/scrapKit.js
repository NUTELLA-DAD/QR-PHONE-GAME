// THE SCRAP KIT (LOOP.md G1 / G2 in 3D, config.SCRAP3D; 3D.md section 34): the models of the scrap economy. Everything is rigid and held. Coordinates: x right, y up, z toward the viewer.
//   bundleParts(B, x, y, z, s, rot)   one bundle of scrap into a Batch: three iron plates a little out of line, a gold strap with a buckle and two rivets (about 34 x 28 x 25 at s 1)
//   buildBundleGeo()                  -> ONE doubled geometry (the picture and its ink in one mesh, style.js inkDouble) of a bundle about the origin: the instanced mesh of every bundle in the sky, on a deck, on a hulk
//   binBatch(B, count, cap)           the HOLD BIN about the origin (its foot at y 0, 80 wide, 40 deep): an open crate with a low slat in front, `count` bundles piled in it (two layers of four) that show over its sides
//   plate(B, K, x, y, z, w, rot)      a riveted steel plate (the scrap patch) centred on (x, y), its back face at depth z, w wide
//   ringGeo()                         the gold ring that marks a pickup: a flat thin annulus of radius 1 facing +z (scrap3d.js instances it)
import { THREE, Batch, inkDouble } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

export const COLS = () => (config.SCRAP3D && config.SCRAP3D.COL) || {};
const PI = Math.PI;

export function bundleParts(B, x, y, z, s = 1, rot = 0, C = COLS()) {
  const L = new Batch(), a = C.IRON_A || '#8d96a0', b = C.IRON_B || '#b3bcc6', c = C.IRON_C || '#76808a', strap = C.STRAP || '#d9a24a';
  L.box(a, 0, -9, 0, 32, 8, 22, 1.6, 0, 0, 0.03); // three plates, a little out of line
  L.box(b, 1.5, 0, 0, 34, 8, 22, 1.6, 0, 0, -0.02);
  L.box(c, -1, 9, 0, 30, 8, 22, 1.6, 0, 0, 0.04);
  L.box(strap, -1, 0, 0, 7, 29.5, 25.4, 1.3); // the strap that holds them
  L.box('#3f3b3e', -1, 0, 13.2, 4.6, 6.4, 2.2, 0.6); // its buckle
  for (const sy of [-1, 1]) L.sphere('#e3e9ee', -1, sy * 10.5, 13.2, 2.2, 2.2, 1.4, 0.6, true);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rot), new THREE.Vector3(s, s, s));
  B.append(L, m);
}

export function buildBundleGeo() {
  const B = new Batch();
  bundleParts(B, 0, 0, 0, 1, 0);
  const g = mergeGeometries(B.parts, false);
  for (const p of B.parts) p.dispose();
  return inkDouble(g);
}

export function binBatch(B, count, cap = 8) {
  const C = COLS(), wood = C.BIN || '#8a6444', slat = C.BIN_SLAT || '#a87c4a', post = C.BIN_POST || '#5e4129';
  const W = 80, D = 40;
  B.box(wood, 0, 2, 0, W, 4, D, 1.8); // the floor
  B.box(wood, 0, 17, -D / 2 + 1.5, W, 26, 3, 1.8); // the back
  for (const s of [-1, 1]) B.box(wood, s * (W / 2 - 1.5), 13, 0, 3, 18, D, 1.8); // the sides (low, so the pile shows)
  B.box(slat, 0, 7, D / 2 - 1.5, W - 6, 6.4, 3, 1.4); // one low slat across the front: the pile shows above it
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(post, sx * (W / 2 - 2.5), 15, sz * (D / 2 - 2.5), 5, 30, 5, 1.4); // corner posts
  const n = Math.max(0, Math.min(cap, count | 0));
  for (let i = 0; i < n; i++) { // the bundles: two layers of four, the upper one rising over the sides
    const col = i % 4, row = Math.floor(i / 4), rot = (((i * 7) % 5) - 2) * 0.03;
    bundleParts(B, -27 + col * 18 + (row ? 4 : 0), 13 + row * 16, ((i * 3) % 3 - 1) * 2.5, 0.56, rot, C);
  }
}

// ---- the scrap patch's rivet plate -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A steel plate bolted over a deck's edge: a slab with a bright bevel along its top, a darker band along its foot, a weld seam, and rivets round the border. (x, y) = its centre, z = its back face, w = width.
export function plate(B, K, x, y, z, w, rot = 0) {
  const P = K.PLATE || {}, C = P.COL || {}, h = P.H || 40, th = 5.5;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z + th / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rot), new THREE.Vector3(1, 1, 1));
  const L = new Batch(); // built about the origin, then moved into place
  L.box(C.STEEL || '#6c7b8c', 0, 0, 0, w, h, th, 2.2);
  L.box(C.STEEL2 || '#7f8fa0', 0, -h * 0.2, th / 2 + 0.2, w - 6, h * 0.42, 0.8, 0); // the lower half a shade lighter, so it reads as a patch of two sheets
  L.box(C.BEVEL || '#b9c5d1', 0, h / 2 - 3.2, th / 2 + 0.4, w - 3, 4.4, 1, 0); // the lit edge
  L.box(C.DARK || '#3c4652', 0, -h / 2 + 2.6, th / 2 + 0.4, w - 3, 4, 1, 0); // the shadowed foot
  const n = Math.max(2, Math.round(w / 22));
  for (let i = 0; i < n; i++) {
    const rx = -w / 2 + 8 + ((w - 16) * i) / (n - 1);
    L.sphere(C.RIVET || '#e3e9ee', rx, h / 2 - 8.5, th / 2, 3.4, 3.4, 2.6, 1, true);
    L.sphere(C.RIVET || '#e3e9ee', rx, -h / 2 + 8.5, th / 2, 3.4, 3.4, 2.6, 1, true);
  }
  for (const s of [-1, 1]) L.sphere(C.RIVET || '#e3e9ee', s * (w / 2 - 8), 0, th / 2, 3.4, 3.4, 2.6, 1, true);
  B.append(L, m);
}

export const ringGeo = () => new THREE.RingGeometry(0.86, 1, 40);
void PI;
