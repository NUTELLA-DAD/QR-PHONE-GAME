// THE VOID EEL'S MODELS IN 3D (3D.md section 42). Everything is built once, in the frame of the part it follows, and one RigidSet (creatureKit.js) places the pieces by a matrix each frame:
//   HEAD FRAME     the origin is the neck's tip (where the sim's head starts), x forward along the heading, y the back of the head, z toward the viewer. The angler's head: a big smooth skull (a swept dome with a crest,
//                  a heavy brow over each eye, gill slits, a snout), a hinged lower jaw that swings about a hinge under the cheek, two rows of needle teeth in each jaw and a pair of fangs, chin barbels, two big glowing eyes,
//                  and the THROAT, a flat glowing sheet between the jaws that is rewritten when the jaw's pose changes (so the open mouth glows from inside)
//   CROWN FRAME    the origin is the crown's base on the head's back, y up (the sim keeps it standing straight up): a bone rim round the capsule outline a boarder walks (two straight sides and a round top) and the
//                  knob at its top where the rod starts; the translucent sail inside it is eelFins.js's
//   THE ROD        six little tapered cylinders along a curve from the crown's top out to the lantern: placed each frame along the Bezier the view computes (it follows the lantern)
//   THE LANTERN    about its own centre: a glowing core inside a cage of six bone ribs with a cap and a spike (it hunts and gapes), and the GOLD CRATE with straps and a buckle (the lure: it must read as loot)
//   JOINT RINGS    six glowing gold bands for the ends of the three tail sections (bright on the one that can be cut, dull on the others), the tail's cone and a glowing cut-face disc for a stump
// Sizes are the sim's game px (config.CREATURES.EEL.BODY) so the picture and the hit capsules agree. Every named piece is ONE contiguous run of the mesher (a RigidSet places it as a whole). Winding is
// checked by the gate (windingReport below).
import { THREE } from './style.js';
import { Mesher, RigidSet } from './creatureKit.js';
import { horn } from './drakeModel.js';
import { V, M4, hash } from './titanModel.js';
import { atlasUV } from './eelPaint.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const TAU = Math.PI * 2;
const ss = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const _c = new THREE.Color();
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);

// a Catmull-Rom profile through (xs, ys)
const prof = (xs, ys) => (x) => {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]), p0 = ys[Math.max(0, i - 1)], p1 = ys[i], p2 = ys[i + 1], p3 = ys[Math.min(n - 1, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
};

// ---- the head's numbers (head frame) -------------------------------------------------------------------------------------------------------------------------------------------------------------
export const HEAD = { x0: -60, x1: 605, MY: -30, HINGE: [80, -70], EYE: [335, 96] };
const SX = [-60, 0, 90, 200, 320, 430, 520, 580, 605];
const TOP = prof(SX, [160, 205, 248, 258, 222, 152, 96, 52, 8]);
const ZR = prof(SX, [150, 198, 236, 234, 196, 132, 84, 42, 6]);
const crest = (x) => 36 * ss(40, 210, x) * (1 - ss(360, 520, x));
// a superellipse: the point on the unit "round box" in the direction (c, s): a little boxier than an ellipse, smooth everywhere (a p-norm)
const SE = 2.5;
const se = (c, s) => { const k = Math.pow(Math.pow(Math.abs(c), SE) + Math.pow(Math.abs(s), SE), 1 / SE) || 1; return [c / k, s / k]; };
// the skull's skin at (x, psi): psi = 0 the back of the head, pi the underside (the lip), z toward the viewer on the first half
export function skullAt(x, psi, out = V()) {
  const top = TOP(x), bot = lerp(-top, HEAD.MY, ss(30, 150, x)), cy = (top + bot) / 2, ry = (top - bot) / 2, rz = ZR(x);
  const wrap = Math.atan2(Math.sin(psi), Math.cos(psi)), c = crest(x) * Math.exp(-Math.pow(wrap / 0.42, 2)), q = se(Math.cos(psi), Math.sin(psi));
  return out.set(x, cy + ry * q[0] + c, rz * q[1]);
}
// the depth of the skull's skin at (x, y) (for what sits on it: the eyes, the brow, the gill slits)
export function skullZ(x, y) {
  const top = TOP(x), bot = lerp(-top, HEAD.MY, ss(30, 150, x)), cy = (top + bot) / 2, ry = Math.max(1, (top - bot) / 2), c = clamp((y - cy) / ry, -1, 1);
  return ZR(x) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(c), SE)), 1 / SE);
}
const JX = [55, 120, 220, 330, 440, 530, 575, 592], JD = prof(JX, [105, 215, 240, 196, 136, 86, 40, 8]), JZ = prof(JX, [118, 214, 216, 176, 118, 72, 36, 6]), JTOP = -27;
export function jawAt(x, psi, out = V()) {
  const d = JD(x), cy = JTOP - d / 2, q = se(Math.cos(psi), Math.sin(psi));
  return out.set(x, cy + (d / 2) * q[0], JZ(x) * q[1]);
}
// the crown's outline (crown frame): two straight sides and a round top, as the boarding path (creatureBoard.js): half width R, top of the straight part LEN above the base
export const NCORD = 12;
export const CROWN = { R: 210, LEN: 430, FOOT: 110 };
export function crownAt(s) { // s in 0..1 along the outline from the foot of the left side, over the top, to the foot of the right side: [x, y, outward x, outward y]
  const R = CROWN.R, side = CROWN.LEN - CROWN.FOOT, arc = Math.PI * R, tot = side * 2 + arc, d = clamp(s, 0, 1) * tot;
  if (d <= side) return [-R, CROWN.FOOT + d, -1, 0];
  if (d <= side + arc) { const a = Math.PI - ((d - side) / R); return [R * Math.cos(a), CROWN.LEN + R * Math.sin(a), Math.cos(a), Math.sin(a)]; }
  return [R, CROWN.LEN - (d - side - arc), 1, 0];
}

// ---- geometry helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const cylX = (r0, r1, sides = 8) => { const g = new THREE.CylinderGeometry(r1, r0, 1, sides, 1); g.rotateZ(-Math.PI / 2); g.translate(0.5, 0, 0); return g; }; // axis +x from 0 to 1, radius r0 at the start and r1 at the end
function band(P, mesh, name, color, glow, OW, low) { // a ring band (axis x, radius 1): a belt with two flanges and four studs (cheap: it is re-placed every frame)
  const s = low ? 10 : 14;
  const belt = new THREE.CylinderGeometry(1.0, 1.0, 0.9, s, 1, true); belt.rotateZ(Math.PI / 2);
  mesh.add(belt, null, { color, glow, ow: OW, name });
  for (const sx of [-0.47, 0.47]) { const f = new THREE.CylinderGeometry(1.12, 1.12, 0.12, s, 1, true); f.rotateZ(Math.PI / 2); mesh.add(f, M4(V(sx, 0, 0)), { color: P.goldDk, glow, ow: OW, name }); }
  for (let k = 0; k < 4; k++) { const a = ((k + 0.5) / 4) * TAU; mesh.add(new THREE.SphereGeometry(1, 5, 3), M4(V(0, Math.cos(a) * 1.08, Math.sin(a) * 1.08), null, V(0.13, 0.13, 0.13)), { color: P.goldLt, glow, name }); }
}
// a rounded box: half sizes a, b, c, the corners rounded by a p-norm (smooth everywhere, so the shading has no seams)
function squircle(mesh, a, b, c, p, matrix, o, low) {
  mesh.grid(low ? 8 : 12, low ? 10 : 18, (u, v, out) => {
    const pol = u * Math.PI, az = v * TAU, x = Math.sin(pol) * Math.cos(az), y = Math.cos(pol), z = Math.sin(pol) * Math.sin(az), k = Math.pow(Math.pow(Math.abs(x), p) + Math.pow(Math.abs(y), p) + Math.pow(Math.abs(z), p), 1 / p) || 1;
    out.set((a * x) / k, (b * y) / k, (c * z) / k);
  }, matrix, o, null, true);
}

// ---- a RigidSet that places a piece faster (the head and the lantern are re-placed every frame): the same rules as creatureKit.js RigidSet.place (a piece is rewritten only when its matrix changed, null hides it, a mirror
// swaps the winding of its triangles), the matrix maths written out on the typed arrays ----
export class FastSet extends RigidSet {
  place(name, M) {
    const pc = this.pieces[name];
    if (!pc) return false;
    const e = M ? M.elements : null;
    if (pc.key === null && !M) return false;
    if (e && pc.key && pc.key.length === 16) { let same = true; for (let i = 0; i < 16; i++) if (Math.abs(pc.key[i] - e[i]) > 1e-4) { same = false; break; } if (same) return false; }
    if (!e && pc.key === 'hidden') return false;
    if (e) { if (pc.key && pc.key.length === 16) for (let i = 0; i < 16; i++) pc.key[i] = e[i]; else pc.key = Array.from(e); } else pc.key = 'hidden';
    const g = this.g, PA = g.getAttribute('position'), NA = g.getAttribute('normal'), OA = g.getAttribute('onormal'), P = PA.array, Nn = NA.array, O = OA.array, n = pc.r.count, s = pc.r.start * 3;
    if (!e) { P.fill(0, s, s + n * 3); O.fill(0, s, s + n * 3); PA.needsUpdate = OA.needsUpdate = true; return true; }
    const a = e[0], b = e[4], c = e[8], d = e[1], f = e[5], h = e[9], k = e[2], l = e[6], m = e[10], tx = e[12], ty = e[13], tz = e[14];
    const C00 = f * m - h * l, C01 = -(d * m - h * k), C02 = d * l - f * k, C10 = -(b * m - c * l), C11 = a * m - c * k, C12 = -(a * l - b * k), C20 = b * h - c * f, C21 = -(a * h - c * d), C22 = a * f - b * d;
    const det = a * C00 + b * C01 + c * C02, flip = det < 0, id = Math.abs(det) > 1e-12 ? 1 / det : 0;
    const n00 = C00 * id, n01 = C01 * id, n02 = C02 * id, n10 = C10 * id, n11 = C11 * id, n12 = C12 * id, n20 = C20 * id, n21 = C21 * id, n22 = C22 * id; // (the normal matrix: the cofactors over the determinant)
    const p0 = pc.p0, n0 = pc.n0, o0 = pc.o0;
    for (let i = 0; i < n; i++) {
      const j = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i, o = s + j * 3, q = i * 3;
      const x = p0[q], y = p0[q + 1], z = p0[q + 2];
      P[o] = a * x + b * y + c * z + tx; P[o + 1] = d * x + f * y + h * z + ty; P[o + 2] = k * x + l * y + m * z + tz;
      const nx = n0[q], ny = n0[q + 1], nz = n0[q + 2];
      let vx = n00 * nx + n01 * ny + n02 * nz, vy = n10 * nx + n11 * ny + n12 * nz, vz = n20 * nx + n21 * ny + n22 * nz;
      const ln = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      Nn[o] = vx / ln; Nn[o + 1] = vy / ln; Nn[o + 2] = vz / ln;
      const ox = o0[q], oy = o0[q + 1], oz = o0[q + 2];
      O[o] = n00 * ox + n01 * oy + n02 * oz; O[o + 1] = n10 * ox + n11 * oy + n12 * oz; O[o + 2] = n20 * ox + n21 * oy + n22 * oz;
    }
    PA.needsUpdate = NA.needsUpdate = OA.needsUpdate = true;
    return true;
  }
}

// ---- the pieces ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function buildEelPieces(cr, P, opts = {}) {
  const low = !!opts.low, OW = P.INK || 24, mesh = new Mesher(), nU = low ? 16 : 24, nV = low ? 18 : 28;
  const sph = (a, b) => new THREE.SphereGeometry(1, low ? a : a + 2, low ? b : b + 2);
  // THE SKULL: one smooth surface, its colour from the painted atlas
  mesh.grid(nU, nV, (u, v, out) => skullAt(lerp(HEAD.x0, HEAD.x1, u), v * TAU, out), null, { color: '#ffffff', ow: OW, name: 'skull' }, (u, v) => atlasUV('skull', v, u), true);
  // the brow: a heavy bone above each eye, in a dark socket
  const [ex, ey] = HEAD.EYE, zs = skullZ(ex, ey);
  for (const s of [1, -1]) {
    mesh.add(sph(8, 6), M4(V(ex - 20, ey + 64, s * (zs - 6)), qz(-0.28), V(112, 36, 70)), { color: P.bodyDk, ow: OW * 0.55, name: 'brow' });
    mesh.add(sph(8, 6), M4(V(ex, ey, s * (zs - 20)), null, V(94, 92, 58)), { color: P.socket, ow: OW * 0.5, name: 'brow' });
  }
  // the eyes: a glowing ball, a ring, a slit pupil, a glint (glow channel 1)
  for (const s of [1, -1]) {
    const nm = s > 0 ? 'A' : 'B', R = 74, zc = s * (zs + 4), face = s > 0 ? null : new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);
    mesh.add(sph(12, 9), M4(V(ex, ey, zc), null, V(R, R, R * 0.82)), { color: P.eye, glow: 1, ow: OW * 0.45, name: 'eye' + nm });
    mesh.add(new THREE.TorusGeometry(1, 0.09, 5, low ? 12 : 16), M4(V(ex + 3, ey, zc + s * R * 0.72), face, V(R * 0.62, R * 0.62, R * 0.62)), { color: P.eyeDk, glow: 1, name: 'eye' + nm });
    mesh.add(new THREE.CircleGeometry(1, 12), M4(V(ex + 8, ey - 2, zc + s * R * 0.8), face, V(R * 0.17, R * 0.54, 1)), { color: P.pupil, name: 'eye' + nm });
    mesh.add(new THREE.SphereGeometry(1, 5, 4), M4(V(ex - R * 0.36, ey + R * 0.44, zc + s * R * 0.7), null, V(R * 0.14, R * 0.1, R * 0.08)), { color: P.eyeLt, glow: 1, name: 'eye' + nm });
  }
  // gill slits behind the eye: three dark cuts on each cheek
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    const gx = 40 + k * 26, gy = ey - 34 - k * 14, gz = skullZ(gx, gy) * s;
    mesh.add(new THREE.BoxGeometry(14, 92 - k * 12, 10), M4(V(gx, gy, gz), qz(-0.2), null), { color: P.gill, name: 'gill' });
  }
  // THE LOWER JAW: hinged under the cheek (the view swings it); its upper edge is a flat lip
  mesh.grid(low ? 14 : 22, low ? 16 : 24, (u, v, out) => jawAt(lerp(JX[0], JX[JX.length - 1], u), v * TAU, out), null, { color: '#ffffff', ow: OW, name: 'jaw' }, (u, v) => atlasUV('jaw', v, u), true);
  for (const s of [1, -1]) for (const [bx, len] of [[250, 280], [370, 220]]) { // chin barbels: two fine whiskers trailing down and back from the jaw
    const p = jawAt(bx, Math.PI + s * 0.45, V());
    mesh.add(horn(p, V(0.18, -1, s * 0.25), len, 15, { bend: V(-1, 0, 0), curve: 0.55, sides: 5, rings: 6, endR: 0 }).g, null, { color: P.boneDk, ow: OW * 0.3, name: 'jaw' });
  }
  // THE NEEDLE TEETH: rows on the lips of both jaws, a pair of long fangs at the front of each (each row is one run: the upper, then the lower)
  const toothGeo = new THREE.ConeGeometry(1, 1, 5, 1, true), tq = new THREE.Quaternion(), tY = V(0, 1, 0); toothGeo.translate(0, 0.5, 0); // (a needle: apex at y 1, base at y 0)
  const tooth = (name, p, dir, len, r0, col) => mesh.add(toothGeo, M4(p, tq.setFromUnitVectors(tY, dir.clone().normalize()), V(r0, len, r0)), { color: col, ow: OW * 0.18, name });
  const N = low ? 9 : 16, tx = (i) => lerp(175, 560, (i + 0.5) / N) + (hash(3, i) - 0.5) * 12, tf = (i) => 1 - 0.25 * ((i + 0.5) / N);
  for (let i = 0; i < N; i++) for (const s of [1, -1]) tooth('teethU', skullAt(tx(i), Math.PI - s * 0.52, V()).add(V(0, 4, 0)), V(0.12, -1, s * 0.1), (108 + 76 * hash(4, i)) * tf(i), 11.5 - 4 * ((i + 0.5) / N), P.tooth);
  for (const s of [1, -1]) tooth('teethU', skullAt(548, Math.PI - s * 0.7, V()).add(V(0, 6, 0)), V(0.1, -1, s * 0.12), 236, 16, P.tooth);
  for (let i = 0; i < N; i++) for (const s of [1, -1]) tooth('teethL', jawAt(tx(i) + 12, s * 0.5, V()).add(V(0, -4, 0)), V(0.12, 1, s * 0.1), (100 + 76 * hash(5, i)) * tf(i), 11.5 - 4 * ((i + 0.5) / N), P.tooth);
  for (const s of [1, -1]) tooth('teethL', jawAt(520, s * 0.62, V()).add(V(0, -6, 0)), V(0.1, 1, s * 0.12), 204, 15, P.tooth);
  // THE THROAT: a flat glowing sheet between the jaws, drawn on both sides (the head rolls over): its corners are rewritten for each pose of the jaw (throatCorners)
  const quad = new THREE.BufferGeometry(), nz = [];
  for (let i = 0; i < 24; i++) nz.push(0, 0, i < 12 ? 1 : -1);
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array(72), 3));
  quad.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nz), 3));
  mesh.add(quad, null, { color: '#ffffff', glow: 2, name: 'throat' });

  // THE CROWN (crown frame): a bone rim along the boarding outline with glowing studs, a knob at the top
  mesh.grid(low ? 24 : 44, low ? 5 : 6, (u, v, out) => {
    const [x, y, nx, ny] = crownAt(u), a = v * TAU, r = 30 - 8 * Math.abs(u - 0.5) * 2;
    out.set(x + nx * Math.cos(a) * r, y + ny * Math.cos(a) * r, Math.sin(a) * r);
  }, null, { color: P.bone, ow: OW * 0.6, name: 'crown' }, null, true);
  for (let k = 0; k < 7; k++) { const [x, y, nx, ny] = crownAt(0.08 + 0.84 * (k / 6)); mesh.add(new THREE.SphereGeometry(1, 6, 4), M4(V(x + nx * 22, y + ny * 22, 22), null, V(17, 17, 12)), { color: P.dot, glow: 3, name: 'crown' }); }
  mesh.add(sph(8, 6), M4(V(0, CROWN.LEN + CROWN.R + 4, 0), null, V(40, 40, 40)), { color: P.bone, ow: OW * 0.5, name: 'knob' });
  // THE ROD: unit tapered cylinders (axis +x, length 1), placed along the curve each frame
  for (let k = 0; k < NCORD; k++) mesh.add(cylX(1.0, 0.8, 8), null, { color: P.cord, ow: OW * 0.28, name: 'cord' + k });
  // THE LANTERN (about its own centre)
  mesh.add(sph(12, 9), M4(V(0, 0, 0), null, V(86, 86, 86)), { color: '#ffffff', glow: 4, ow: OW * 0.4, name: 'lampCore' });
  mesh.add(new THREE.SphereGeometry(1, 6, 4), M4(V(-26, 30, 66), null, V(22, 16, 12)), { color: '#ffffff', glow: 4, name: 'lampCore' });
  for (let k = 0; k < 6; k++) { // the cage: six bone ribs bowing out from the cap to the foot
    const yaw = new THREE.Matrix4().makeRotationY((k / 6) * Math.PI);
    for (const sg of [1, -1]) mesh.grid(low ? 8 : 10, 4, (u, v, out) => { const th = u * Math.PI, a = v * TAU, r = 7.5; out.set(sg * 112 * Math.sin(th) * (1 - 0.18 * Math.pow(Math.abs(Math.cos(th)), 3)) + Math.cos(a) * r, 126 * Math.cos(th) + Math.sin(a) * r * 0.2, Math.sin(a) * r); }, yaw, { color: P.bone, ow: OW * 0.3, name: 'lampCage' }, null, sg > 0);
  }
  mesh.add(horn(V(0, 112, 0), V(0, 1, 0), 56, 38, { sides: 6, rings: 2, endR: 0.35 }).g, null, { color: P.bone, ow: OW * 0.4, name: 'lampCage' });
  mesh.add(horn(V(0, -118, 0), V(0, -1, 0), 84, 24, { sides: 6, rings: 2, endR: 0 }).g, null, { color: P.bone, ow: OW * 0.4, name: 'lampCage' });
  // THE GOLD CRATE: it has to read as a pickup at first glance (a rounded gold box with two straps, a buckle and a shine)
  squircle(mesh, 104, 88, 84, 5, null, { color: P.crate, glow: 4, ow: OW * 0.4, name: 'lampCrate' }, low);
  squircle(mesh, 12, 98, 94, 5, M4(V(-46, 0, 0)), { color: P.strap, glow: 4, name: 'lampCrate' }, low);
  squircle(mesh, 12, 98, 94, 5, M4(V(46, 0, 0)), { color: P.strap, glow: 4, name: 'lampCrate' }, low);
  squircle(mesh, 112, 13, 94, 5, M4(V(0, 6, 0)), { color: P.strap, glow: 4, name: 'lampCrate' }, low);
  squircle(mesh, 22, 20, 8, 5, M4(V(0, 6, 94)), { color: P.goldLt, glow: 4, name: 'lampCrate' }, low);
  squircle(mesh, 46, 8, 14, 5, M4(V(-30, 66, 70), qz(0.15)), { color: '#fff6d0', glow: 4, name: 'lampCrate' }, low);
  // THE JOINT RINGS, the tail's cone, the stump's disc
  for (let k = 0; k < 6; k++) band(P, mesh, 'jr' + k, P.gold, 3, OW * 0.35, low);
  mesh.grid(low ? 6 : 8, low ? 10 : 14, (u, v, out) => { const a = v * TAU, r = Math.pow(1 - u, 0.75); out.set(u, Math.cos(a) * r, Math.sin(a) * r); }, null, { color: P.bodyDk, ow: OW * 0.5, name: 'tailCone' }, null, true);
  const disc = new THREE.CircleGeometry(1, 20); disc.rotateY(Math.PI / 2);
  mesh.add(disc, null, { color: P.cut, glow: 3, name: 'stump' });
  mesh.add(disc.clone().rotateY(Math.PI), null, { color: P.cut, glow: 3, name: 'stump' });

  const geometry = mesh.build();
  // the throat's colour: a hot pink at the back, a violet at the front (written into the vertex colours once)
  const col = geometry.getAttribute('color'), tr = mesh.ranges.throat, hot = new THREE.Color(P.throatLt), mid = new THREE.Color(P.throat), lo = new THREE.Color(P.mawLt);
  const ids = 'MADMDCMCBMBA'.split('').concat('MDAMCDMBCMAB'.split('')), by = { M: hot, A: mid, D: mid, C: lo, B: lo }; // (the corners of throatCorners: the hot centre, the back of the maw, the front: the front face, then the reversed one)
  for (let i = 0; i < 24; i++) { _c.copy(by[ids[i]]); const o = (tr.start + i) * 3; col.array[o] = _c.r; col.array[o + 1] = _c.g; col.array[o + 2] = _c.b; }
  const set = new FastSet(geometry, mesh.ranges);
  return { geometry, set, ranges: mesh.ranges, tris: mesh.verts / 3 };
}

// the corners of the throat for a jaw swung down by angle a (head frame): the roof's two ends and the lower jaw's two ends. Returns the 36 floats of both faces (the second reversed)
export function throatCorners(a, out = new Float32Array(72)) {
  const [hx, hy] = HEAD.HINGE, c = Math.cos(a), s = Math.sin(a), z = -26;
  const A = [78, -16], B = [574, -16], jaw = (x) => { const rx = x - hx, ry = JTOP - hy; return [hx + rx * c + ry * s, hy - rx * s + ry * c]; };
  const D = jaw(78), C = jaw(574), M = [(A[0] * 0.5 + B[0] * 0.5 + (D[0] + C[0]) * 0.5) * 0.5 - 60, (A[1] + B[1] + D[1] + C[1]) / 4]; // (the hot centre: toward the back of the maw)
  // the front face: four triangles round the centre (back edge, jaw edge, front edge, roof edge), then the same reversed
  const tri = [[M, A, D], [M, D, C], [M, C, B], [M, B, A]], front = tri.flat(), back = tri.map(([m, p, q]) => [m, q, p]).flat();
  front.forEach((p, i) => { out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = z; });
  back.forEach((p, i) => { out[(i + 12) * 3] = p[0]; out[(i + 12) * 3 + 1] = p[1]; out[(i + 12) * 3 + 2] = z; });
  return out;
}

// does every triangle's winding agree with its vertex normals? (a gate: the fraction that does not, per named piece)
export function windingReport(geometry, ranges) {
  const pos = geometry.getAttribute('position').array, nor = geometry.getAttribute('normal').array, out = {};
  const a = V(), b = V(), c = V(), n = V();
  for (const [name, r] of Object.entries(ranges)) {
    let ok = 0, bad = 0;
    for (let i = r.start; i + 2 < r.start + r.count; i += 3) {
      a.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); b.set(pos[i * 3 + 3], pos[i * 3 + 4], pos[i * 3 + 5]); c.set(pos[i * 3 + 6], pos[i * 3 + 7], pos[i * 3 + 8]);
      n.copy(b).sub(a).cross(c.clone().sub(a));
      if (n.lengthSq() < 1e-6) continue;
      const vn = V(nor[i * 3] + nor[i * 3 + 3] + nor[i * 3 + 6], nor[i * 3 + 1] + nor[i * 3 + 4] + nor[i * 3 + 7], nor[i * 3 + 2] + nor[i * 3 + 5] + nor[i * 3 + 8]);
      if (n.dot(vn) >= 0) ok++; else bad++;
    }
    out[name] = bad / Math.max(1, ok + bad);
  }
  return out;
}

// the record the generic creature view wants from build(): nothing still (everything of the Eel moves or is placed by the extension), as the Mother's
export function buildEelBody(cr, P, opts = {}) {
  const mesh = new Mesher();
  mesh.add(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)).setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)), null, { color: '#ffffff' });
  const geometry = mesh.build();
  geometry.setDrawRange(0, 0);
  void cr; void opts; void P;
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn: {}, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R: 1, L: 1, sz: 1 }, tris: 0, dynTris: 0,
  };
}
export { M4, V, hash };
