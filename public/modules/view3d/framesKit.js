// THE FRAMES KIT (LOOP.md R4, config.FRAMES3D; 3D.md section 35): the models of a frame the crew are building in flight (host/buildFrames.js). Coordinates: x right, y up, z toward the viewer (the frame
// builder mirrors z with the ship's near side). A frame is drawn as a box { xa, xb, yb, yt, d }: x from xa to xb, y from the bottom yb to the top yt, d deep (centred on z 0).
//   solidBatch(B, box, fill, need, K)   the SOLID scaffold into a Batch: four poles, beams, braces and a gold pennant, and one steel slab (a layer) for every bundle that is in, with rivets
//   ghostGeo(box, fill, need, K)        the TRANSLUCENT blueprint: the part's volume above what is built, its twelve edges, the layer lines on the front (one doubled-free geometry, RGBA vertex colours)
//   glowGeo(box, fill, prog, need, spot, built, K)  the HDR gold things (additive): the band that rises as the bundle in the hands goes in, the ring on the deck where the crew stand, the flash shell of the built moment
// Everything is rigid and held; nothing here depends on time. Drawing code never throws (the caller wraps it) and every size is clamped.
import { THREE } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

export const KF = () => config.FRAMES3D || {};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

// a box (or a thin bar between two points) as a position + RGBA colour geometry
function pieceGeo(src, matrix, color, alpha, mul = 1) {
  const g = src.clone();
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g.applyMatrix4(matrix);
  const n = g.attributes.position.count, col = new Float32Array(n * 4);
  _c.set(color);
  for (let i = 0; i < n; i++) { col[i * 4] = _c.r * mul; col[i * 4 + 1] = _c.g * mul; col[i * 4 + 2] = _c.b * mul; col[i * 4 + 3] = alpha; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}
const boxP = (list, cx, cy, cz, w, h, d, color, alpha, mul) => list.push(pieceGeo(UNIT, _m.compose(_p.set(cx, cy, cz), _q.identity(), _s.set(w, h, d)), color, alpha, mul));
function barP(list, a, b, th, color, alpha, mul) { // a thin square bar from a to b
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return;
  _q.setFromUnitVectors(_y, new THREE.Vector3(dx / len, dy / len, dz / len));
  list.push(pieceGeo(UNIT, _m.compose(_p.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), _q, _s.set(th, len, th)), color, alpha, mul));
}
const merge = (list) => {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  for (const p of list) p.dispose();
  return g;
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- the solid scaffold and the layers that are in -----------------------------------------------------------------------------------------------------------------------------------------------------------
export function solidBatch(B, box, fill, need, K = KF()) {
  const C = K.COL || {}, { xa, xb, yb, yt, d } = box, w = xb - xa, h = yt - yb, zf = d / 2, n = Math.max(1, need | 0), lh = h / n;
  const wood = C.TIMBER || '#a9bccd', dark = C.TIMBER_DARK || '#6f8398', plankC = C.PLANK || '#bccbd8';
  const po = 9; // pole thickness
  for (const sx of [xa - 2, xb + 2]) for (const sz of [-zf, zf]) B.box(wood, sx, yb + (h + 14) / 2, sz, po, h + 14, po, 1.5); // four poles, a little over the top
  for (const sz of [-zf, zf]) B.box(dark, (xa + xb) / 2, yt + 7, sz, w + 20, 6, 6, 1.4); // the top beams
  for (const sx of [xa - 2, xb + 2]) B.box(dark, sx, yt + 7, 0, 6, 6, d, 1.4); // ... and across
  B.box(plankC, (xa + xb) / 2, yb - 1, 0, w + 22, 4, d + 14, 1.4); // the footing plank (it lies on the deck)
  B.rod(dark, V(xa - 2, yb + 2, zf), V(xb + 2, yt, zf), 2.6, 1.2); // an X of braces on the front
  B.rod(dark, V(xb + 2, yb + 2, zf), V(xa - 2, yt, zf), 2.6, 1.2);
  const px = xb + 2; // a pennant on a short mast over the front-right pole: the gold flag says "being built"
  B.box(dark, px, yt + 36, zf, 5, 56, 5, 1.4);
  B.box(C.GOLD || '#ffd23f', px - 20, yt + 52, zf, 40, 22, 3.4, 1.6);
  const S = (K.STEEL || {}), steel = S.A || '#7f8fa0', steel2 = S.B || '#6c7b8c', bevel = S.BEVEL || '#b9c5d1', rivet = S.RIVET || '#e3e9ee';
  const filled = clamp(fill | 0, 0, n);
  for (let k = 0; k < filled; k++) { // one steel slab for each bundle in, from the bottom up, a hair out of line
    const y0 = yb + k * lh, off = ((k % 3) - 1) * 1.6;
    B.box(k % 2 ? steel : steel2, (xa + xb) / 2 + off, y0 + lh / 2, 0, w - 6, Math.max(2, lh - 2), d * 0.94, 1.8);
    B.box(bevel, (xa + xb) / 2 + off, y0 + lh - 3, zf * 0.94 + 0.4, w - 8, 2.4, 1, 0); // the lit top edge on the front
    for (const sx of [xa + 8, xb - 8]) B.sphere(rivet, sx + off, y0 + lh / 2, zf * 0.94 + 0.8, 2.6, 2.6, 2, 0.8, true);
  }
}

// ---- the translucent blueprint ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function ghostGeo(box, fill, need, K = KF()) {
  const C = K.COL || {}, { xa, xb, yb, yt, d } = box, w = xb - xa, h = yt - yb, zf = d / 2, n = Math.max(1, need | 0), lh = h / n, filled = clamp(fill | 0, 0, n);
  const list = [], blue = C.BLUE || '#7db4f2', edge = C.EDGE || '#d4e8ff', va = K.VOL_ALPHA == null ? 0.2 : K.VOL_ALPHA, ea = K.EDGE_ALPHA == null ? 0.9 : K.EDGE_ALPHA, th = K.EDGE || 2.6;
  const y0 = yb + filled * lh; // the part's volume above what is already built
  if (y0 < yt - 0.5) boxP(list, (xa + xb) / 2, (y0 + yt) / 2, 0, w, yt - y0, d, blue, va);
  const ink = C.INK || '#1b2a44', ow = th + 2.8; // a dark blue line under the bright one, so the ghost reads against the bright sky and the pale hull
  for (const [tn, col, al] of [[ow, ink, 0.85 * ea], [th, edge, ea]]) { // the twelve edges (the dark ones first)
    for (const y of [yb, yt]) for (const z of [-zf, zf]) boxP(list, (xa + xb) / 2, y, z, w + tn, tn, tn, col, al);
    for (const x of [xa, xb]) for (const z of [-zf, zf]) boxP(list, x, (yb + yt) / 2, z, tn, h + tn, tn, col, al);
    for (const x of [xa, xb]) for (const y of [yb, yt]) boxP(list, x, y, 0, tn, tn, d + tn, col, al);
  }
  for (let k = filled + 1; k < n; k++) boxP(list, (xa + xb) / 2, yb + k * lh, zf, w, 1.8, 1.8, edge, ea * 0.55); // the layer lines: one for each bundle still to carry
  if (filled < n) { // the blueprint's cross on the front of the empty part
    barP(list, V(xa, y0, zf), V(xb, yt, zf), 1.6, edge, ea * 0.35);
    barP(list, V(xb, y0, zf), V(xa, yt, zf), 1.6, edge, ea * 0.35);
  }
  return merge(list);
}

// ---- the HDR gold: the band, the ring, the built flash --------------------------------------------------------------------------------------------------------------------------------------------------------
export function glowGeo(box, fill, prog, need, spot, built, K = KF()) {
  const C = K.COL || {}, { xa, xb, yb, yt, d } = box, w = xb - xa, h = yt - yb, n = Math.max(1, need | 0), lh = h / n, filled = clamp(fill | 0, 0, n);
  const list = [], gold = C.GOLD || '#ffd23f', G = K.GLOW || {};
  const pr = clamp(prog || 0, 0, 1);
  if (pr > 0.02 && filled < n) { // the bundle in the hands going in: a gold slab rising through the next layer, a bright line on top
    const bh = Math.max(2, lh * pr);
    boxP(list, (xa + xb) / 2, yb + filled * lh + bh / 2, 0, w + 3, bh, d + 3, gold, G.BAND_ALPHA == null ? 0.55 : G.BAND_ALPHA, G.BAND || 1.5);
    boxP(list, (xa + xb) / 2, yb + filled * lh + bh, d / 2 + 1.5, w + 6, 4, 4, '#fff4c2', 1, G.TOP || 2);
  }
  if (spot) { // BUILD HERE: a ring flat on the deck where the crew stand (the 2D one is a gold ring too)
    const R = K.RING || {}, r1 = clamp(R.R || 34, 10, 90), r0 = r1 - clamp(R.W || 6, 2, 20), N = 28;
    for (let i = 0; i < N; i++) {
      if (i % 2) continue; // dashes
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2, rm = (r0 + r1) / 2;
      _q.setFromAxisAngle(_y, -am - Math.PI / 2);
      list.push(pieceGeo(UNIT, _m.compose(_p.set(spot.x + Math.cos(am) * rm, spot.y + 1.5, spot.z + Math.sin(am) * rm), _q, _s.set(rm * (a1 - a0) * 1.02, 1.6, r1 - r0)), gold, 1, G.RING || 1.6));
    }
  }
  if (built) { // the built moment: a gold shell round the whole part that swells and fades over a few keys (`built` = { grow, mul })
    const gr = built.grow || 0;
    boxP(list, (xa + xb) / 2, (yb + yt) / 2, 0, w + 4 + gr, h + 4 + gr, d + 4 + gr, '#ffe9a8', 1, built.mul);
  }
  return merge(list);
}
