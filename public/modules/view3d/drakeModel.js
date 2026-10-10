// THE CINDER DRAKE'S BODY IN 3D (3D.md section 22): the models. Everything here is built once, in the dragon's own frame facing +x (x forward, y UP, z toward the viewer; sizes are the sim's game pixels, so the
// picture and the hit capsules agree) and never moves by itself:
//   buildTorso(cr, P)   the TORSO: a deep-chested, sculpted lathe (smooth, with a painted scale skin and glowing ember cracks), a ridge of back spines, the shoulder and haunch bulges, the BREAST PLATES (a dynamic
//                       piece the boarding hack opens) and the HEART behind them. It returns the same record as the Kraken's body (creatureKraken.js buildKraken) so the generic creature view runs it.
//   buildPieces(cr, P)  the RIGID PIECES that follow the sim's limbs, merged in one geometry (a RigidSet places each by a matrix): the HEAD (angular, horned, asymmetric: glowing eyes, cheek vents that glow
//                       with the throat, fangs), the hinged lower JAW (with its teeth and the glowing floor of the mouth), the spiked tail CLUB, the two talons and the wing thumbs.
// Angular things (the head, the horns, the claws, the club) are LOFTED solids with flat faces (loft() below: rings of points joined into quads, flat normals, wound outward by checking the volume), which is the
// enemy shape language of the game: spiky and a little crooked. The torso is smooth. The ink outline comes from the Mesher's onormal as for the Kraken.
import { THREE } from './style.js';
import { Mesher, DynPiece, RigidSet, mantleUV, finUV } from './creatureKit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;

// ---- lofted flat-faced solids -----------------------------------------------------------------------------------------------------------------------------------------------------------
// rings: [[Vector3 ...] ...] (every ring the same number of points, going round the same way); cap closes both ends with a fan. The winding is fixed so the faces look out.
export function loft(rings, cap = true) {
  const pos = [], n = rings[0].length;
  const tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % n], c = rings[i + 1][(j + 1) % n], d = rings[i + 1][j];
      tri(a, b, c); tri(a, c, d);
    }
  }
  if (cap) {
    for (const [ring, first] of [[rings[0], true], [rings[rings.length - 1], false]]) {
      const ctr = V();
      ring.forEach((p) => ctr.add(p));
      ctr.multiplyScalar(1 / n);
      for (let j = 0; j < n; j++) { const a = ring[j], b = ring[(j + 1) % n]; if (first) tri(ctr, b, a); else tri(ctr, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  let vol = 0;
  for (let i = 0; i < pos.length; i += 9) vol += pos[i] * (pos[i + 4] * pos[i + 8] - pos[i + 5] * pos[i + 7]) + pos[i + 1] * (pos[i + 5] * pos[i + 6] - pos[i + 3] * pos[i + 8]) + pos[i + 2] * (pos[i + 3] * pos[i + 7] - pos[i + 4] * pos[i + 6]);
  if (vol < 0) for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } // (inside out: swap two corners of every face)
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}
// A frame (two perpendicular unit vectors) round a direction.
function frameOf(dir) {
  const ref = Math.abs(dir.z) > 0.85 ? V(0, 1, 0) : V(0, 0, 1);
  const ex = dir.clone().cross(ref).normalize(), ey = dir.clone().cross(ex).normalize();
  return [ex, ey];
}
// A curved spike / horn / claw: from `base` along `dir`, `len` long, bending toward `bend` (a direction) by `curve` of its length, radius r0 at the root narrowing to endR * r0 at the tip (0 = a point).
// `flat` squashes the section (a blade). Returns { g, end (the tip), tan (the direction there) }.
export function horn(base, dir, len, r0, { bend = V(0, 1, 0), curve = 0, sides = 5, rings = 7, endR = 0, flat = 1, bulge = 0 } = {}) {
  const d = dir.clone().normalize(), b = bend.clone().normalize(), out = [];
  let end = null, tan = d.clone();
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, c = base.clone().addScaledVector(d, len * t).addScaledVector(b, len * curve * t * t);
    tan = d.clone().addScaledVector(b, 2 * curve * t).normalize();
    const [ex, ey] = frameOf(tan), r = r0 * (1 - (1 - endR) * Math.pow(t, 0.9)) * (1 + bulge * Math.sin(t * Math.PI));
    const ring = [];
    for (let k = 0; k < sides; k++) { const a = (k / sides) * TAU + 0.3; ring.push(c.clone().addScaledVector(ex, Math.cos(a) * r).addScaledVector(ey, Math.sin(a) * r * flat)); }
    out.push(ring);
    end = c;
  }
  return { g: loft(out, true), end, tan };
}
// a spline of numbers through rows (Catmull-Rom): s in 0..N-1 -> out[] of row length
function spline(rows) {
  const N = rows.length, K = rows[0].length;
  return (s, out) => {
    s = clamp(s, 0, N - 1 - 1e-9);
    const i = Math.floor(s), t = s - i, p = (k) => rows[clamp(k, 0, N - 1)], p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2), t2 = t * t, t3 = t2 * t;
    for (let c = 0; c < K; c++) out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
    return out;
  };
}
const M4 = (pos, quat, scl) => new THREE.Matrix4().compose(pos, quat || new THREE.Quaternion(), scl || V(1, 1, 1));
const sphere = new THREE.SphereGeometry(1, 14, 9);

// ---- the TORSO ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// stations along the body: [x, yCentre, rTop, rBottom, rz] (body frame: the chest is deep, the haunches round, a waist between, the neck base in front)
const STATIONS = [[-900, -30, 30, 30, 26], [-780, -28, 130, 120, 100], [-640, -10, 245, 225, 190], [-480, 4, 308, 290, 230], [-300, 12, 336, 336, 246], [-80, 20, 368, 392, 260], [160, 24, 392, 430, 274], [400, 36, 376, 410, 268], [600, 56, 300, 330, 226], [760, 80, 205, 220, 160], [880, 100, 90, 100, 80]];
export const TORSO_X = [STATIONS[0][0], STATIONS[STATIONS.length - 1][0]];
const stationAt = spline(STATIONS);
const _st = [0, 0, 0, 0, 0];
// u (0 = the rear tip, 1 = the neck end) -> the station numbers at that point of the body
function bodyAt(u, out = _st) {
  const s = clamp(u, 0, 1) * (STATIONS.length - 1);
  // x is interpolated linearly between stations so u maps evenly along x
  stationAt(s, out);
  return out;
}
export function torsoSurface(x, theta = Math.PI) { // the body's skin at x (body frame) for the round angle theta (0 = belly middle, PI = back): { y, z }
  let lo = 0, hi = 1;
  for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; bodyAt(mid); if (_st[0] < x) lo = mid; else hi = mid; }
  bodyAt((lo + hi) / 2);
  const s = -Math.cos(theta), r = _st[3] + (_st[2] - _st[3]) * (0.5 + 0.5 * s);
  return { y: _st[1] + s * r, z: _st[4] * Math.sin(theta) };
}

export function buildTorso(cr, P, opts = {}) {
  const OW = P.INK || 14, low = !!opts.low, mesh = new Mesher();
  const torso = cr.parts.find((p) => p.kind === 'mantle'), heartP = cr.parts.find((p) => p.kind === 'heart');
  const R = torso ? torso.shape.r : 380;
  const rng = (() => { let a = 4242; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  const q = (u) => bodyAt(u, [0, 0, 0, 0, 0]);
  // --- the lathe: x from the rear tip to the neck end, round the body from the belly (0) over the near flank (0.25) and the back (0.5) ---
  const pos = (u, v, out) => {
    const s = q(u), th = v * TAU, sn = -Math.cos(th), r = s[3] + (s[2] - s[3]) * (0.5 + 0.5 * sn);
    let y = s[1] + sn * r, z = s[4] * Math.sin(th);
    if (sn < 0) z *= 1 - 0.18 * sn * sn; // (a flatter belly)
    const ridge = Math.exp(-((th - Math.PI) * (th - Math.PI)) / 0.04); // a low spine along the back
    y += 22 * ridge * clamp((u - 0.06) * 6, 0, 1) * clamp((0.95 - u) * 6, 0, 1);
    return out.set(s[0], y, z);
  };
  mesh.grid(low ? 34 : 54, low ? 18 : 30, pos, null, { ow: OW, color: '#ffffff', name: 'mantle' }, (u, v) => mantleUV(v, u));
  const surf = (x, th) => torsoSurface(x, th);
  // --- the ridge of back spines: charcoal horns along the spine, longest over the shoulders, swept back, a little crooked ---
  for (let k = 0; k < 13; k++) {
    const x = -720 + k * 116 + (rng() - 0.5) * 30, sf = surf(x, Math.PI), h = 95 + 120 * Math.sin(((k + 0.6) / 13) * Math.PI) * (0.75 + rng() * 0.45), r0 = 30 + h * 0.2;
    const sideK = (k % 3) - 1;
    const hn = horn(V(x, sf.y - 24, sideK * 14), V(-0.42 - rng() * 0.2, 1, sideK * 0.1), h, r0, { bend: V(-1, 0, 0), curve: 0.22, sides: 4, rings: 4 });
    mesh.add(hn.g, null, { ow: OW * 0.55, color: P.horn, name: 'mantle' });
  }
  // --- the bulges where the wings and the legs come out (shoulders: both sides; haunches), round, skinned like the body ---
  const lump = (c, r, name = 'mantle') => mesh.add(sphere, M4(c, null, r), { ow: OW * 0.8, color: '#ffffff', name, uv: (u, v) => mantleUV(0.1 + u * 0.3, 0.25 + v * 0.35) });
  for (const sz of [1, -1]) {
    lump(V(60, 250, sz * 175), V(205, 150, 120)); // shoulders
    lump(V(-380, -110, sz * 195), V(215, 190, 120)); // haunches
  }
  // --- the breast plates and the heart (dynamic) sit on the near side over the heart's place ---
  const hx = heartP ? heartP.at[0] : 330, hy = heartP ? -heartP.at[1] : -110, hr = heartP ? heartP.shape.r : 150;
  const zS = (x, y) => { // the depth of the body's near skin at (x, y): by search on the round angle (the height rises with it)
    let lo = 0, hi = Math.PI;
    for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2, s = torsoSurface(x, mid); if (s.y < y) lo = mid; else hi = mid; }
    return torsoSurface(x, (lo + hi) / 2).z;
  };
  const hz = zS(hx, hy);
  // the heart first (so the plates, added after it, cover it)
  const Mh = M4(V(hx, hy, hz + 4), null, V(1, 1, 1));
  const heartAt = (c, s) => mesh.add(sphere, Mh.clone().multiply(M4(c, null, V(s, s, s * 0.95))), { ow: OW * 0.4, color: P.heart, glow: 4, name: 'heart' });
  mesh.add(new THREE.TorusGeometry(1.08 * hr, 0.26 * hr, 8, 22), Mh.clone().multiply(M4(V(0, 0, -hr * 0.1), null, V(1, 1, 0.8))), { ow: OW * 0.6, color: P.flesh, name: 'heart' });
  heartAt(V(-0.1 * hr, 0.5 * hr, 0.1 * hr), hr * 0.62);
  heartAt(V(-0.1 * hr, -0.5 * hr, 0.1 * hr), hr * 0.62);
  mesh.add(new THREE.ConeGeometry(1, 1, 12), Mh.clone().multiply(M4(V(0.78 * hr, 0, 0.1 * hr), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2), V(1.02 * hr, 1.2 * hr, 0.6 * hr))), { ow: OW * 0.4, color: P.heart, glow: 4, name: 'heart' });
  // the plates: two rows of overlapping shields, each a flat pentagon prism; hinged along their top edge
  const plateAt = (cx, cy, w, h, off, col, ow, bevel = [0.97, 0.82]) => { // (every corner follows the body's skin, so the shield lies on the chest instead of floating off it)
    const pts = [[-0.44, 0.4], [0, 0.46], [0.44, 0.4], [0.54, 0.0], [0.38, -0.4], [0, -0.62], [-0.38, -0.4], [-0.54, 0.0]].map(([a, b]) => [a * w, b * h]); // (a shield with a pointed foot)
    const ring = (o, k = 1) => pts.map(([a, b]) => { const x = cx + a * k, y = cy + b * k; return V(x, y, zS(x, y) + o); });
    mesh.add(loft([ring(off, 1), ring(off + 14, bevel[0]), ring(off + 22, bevel[1])], true), null, { ow, color: col, name: 'plates' });
  };
  const rows = [[-0.55, 0.62, 0], [0.55, 0.62, 0], [0, 0.25, 1], [-0.58, -0.28, 2], [0.58, -0.28, 2], [0, -0.78, 3]];
  for (const [dx, dy, layer] of rows) {
    plateAt(hx + dx * hr, hy + dy * hr, hr * 1.3, hr * 1.34, 4 + layer * 7, P.plateEdge, OW * 0.7, [0.99, 0.95]);
    plateAt(hx + dx * hr, hy + dy * hr + 3, hr * 1.04, hr * 1.08, 16 + layer * 7, P.plate, 0, [0.96, 0.78]);
  }
  const geometry = mesh.build();
  const dyn = {};
  if (mesh.ranges.heart) { dyn.heart = new DynPiece(geometry, mesh.ranges.heart, V(hx, hy, hz + 4), V(0, 0, 1)); dyn.heart.pose(0, 0); }
  if (mesh.ranges.plates) dyn.plates = new DynPiece(geometry, mesh.ranges.plates, V(hx, hy + hr * 0.8, hz), V(1, 0, 0));
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: heartP ? { part: heartP } : null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R, L: torso ? torso.shape.len : 1040, sz: 1 }, tris: mesh.verts / 3, dynTris: 0, heartAt: { x: hx, y: hy, z: hz },
  };
}

// ---- the RIGID PIECES: head, jaw, club, talons, wing thumbs ---------------------------------------------------------------------------------------------------------------------------------
export const JAW_PIVOT = V(34, -84, 0);
export function buildPieces(cr, P, opts = {}) {
  const OW = P.INK || 14, mesh = new Mesher();
  const head = cr.parts.find((p) => p.kind === 'head');
  const HR = head ? head.shape.r : 190;
  const K = HR / 190; // (the model is drawn for the sim's head; this scales it if the numbers are ever changed)
  const add = (g, m, o) => mesh.add(g, m, o);
  const cone = (base, dir, len, r0, o = {}, col = P.horn, ow = OW * 0.5, name = 'head', glow = 0) => { const h = horn(base, dir, len, r0, o); add(h.g, null, { ow, color: col, name, glow }); return h; };
  // ---- the HEAD: an angular skull in eight-sided sections (top, bottom, half width), a long snout, a flat palate ----
  const S = [[-70, 105, 95, 100], [20, 140, 80, 128], [120, 170, 56, 142], [220, 140, 50, 110], [330, 108, 50, 88], [430, 92, 48, 78], [510, 82, 46, 70], [560, 66, 40, 56]];
  const skull = S.map(([x, top, bot, w]) => {
    const ring = [];
    for (let k = 0; k < 8; k++) {
      const phi = Math.PI / 2 - (k / 8) * TAU, sy = Math.sin(phi), sz = Math.cos(phi);
      ring.push(V(x, sy > 0 ? top * sy : bot * sy, w * sz * (Math.abs(sz) > 0.99 ? 1 : 0.94) + (x > 300 ? 0 : 0)));
    }
    return ring;
  });
  // (asymmetric: the far side of the snout is a little lower, as if broken)
  for (const ring of skull.slice(5)) ring[7].y -= 10;
  add(loft(skull, true), null, { ow: OW, color: P.skin, name: 'head' });
  // the brow ridges over the eyes and a crest of small spikes down the skull
  const hasNear = true;
  for (const sz of [1, -1]) {
    cone(V(190, 150, sz * 70), V(1, -0.32, sz * 0.12), 140, 26, { endR: 0.25, sides: 4, rings: 3, flat: 0.8 }, P.horn, OW * 0.5);
    cone(V(80, 146, sz * 95), V(-0.5, 0.5, sz * 0.7), 120 + (sz > 0 ? 30 : -30), 26, { sides: 4, rings: 4, bend: V(0, 1, 0), curve: 0.3 }, P.horn);
  }
  for (let k = 0; k < 5; k++) cone(V(-10 + k * 48, 150 + k * 4, 0), V(-0.35, 1, 0), 70 + (k === 2 ? 35 : 0) - k * 4, 22, { sides: 4, rings: 3 }, P.horn, OW * 0.5);
  // ---- the horns: two long ones swept back and up (the far one broken off short), cheek horns, the nose horn, jaw spikes ----
  cone(V(40, 142, 56), V(-0.8, 0.52, 0.22), 400, 42, { bend: V(0, 1, 0), curve: 0.45, sides: 5, rings: 8 }, P.horn, OW * 0.8);
  cone(V(130, 150, 46), V(-0.55, 0.9, 0.2), 130, 20, { sides: 4, rings: 3, bend: V(0, 1, 0), curve: 0.2 }, P.horn, OW * 0.5); // (a notch spike on the long horn's root)
  cone(V(40, 142, -56), V(-0.8, 0.52, -0.22), 270, 40, { bend: V(0, 1, 0), curve: 0.4, sides: 5, rings: 6, endR: 0.38 }, P.horn, OW * 0.8);
  cone(V(10, 10, 126), V(-0.55, -0.15, 0.82), 210, 30, { bend: V(0, -1, 0), curve: 0.3, sides: 5, rings: 5 }, P.horn, OW * 0.6); // (cheek horn, near)
  cone(V(10, 10, -126), V(-0.55, -0.15, -0.82), 150, 28, { bend: V(0, -1, 0), curve: 0.3, sides: 5, rings: 4 }, P.horn, OW * 0.6);
  cone(V(472, 80, 0), V(0.3, 0.95, 0), 105, 25, { sides: 4, rings: 4, bend: V(1, 0, 0), curve: 0.25 }, P.horn, OW * 0.6); // (nose horn)
  // an ear frill: three flat fins flung back behind the eye, ember-orange
  for (let k = 0; k < 3; k++) cone(V(0 + k * 4, 30 - k * 36, 132 - k * 6), V(-0.9, 0.35 - k * 0.38, 0.2), 150 - k * 22, 24, { sides: 4, rings: 4, flat: 0.28 }, P.wing, OW * 0.5);
  // ---- the eyes: slanted, glowing, a dark slit; a heavy brow wedge above (near eye drawn; the far one hides behind the skull) ----
  const eyeQ = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.38);
  for (const sz of [1, -1]) {
    add(sphere, M4(V(222, 104, sz * 100), eyeQ, V(38, 17, 15)), { ow: OW * 0.35, color: P.eye, glow: 1, name: 'head' });
    add(sphere, M4(V(226, 104, sz * 112), eyeQ, V(6.5, 15, 4)), { ow: 0, color: P.pupil, name: 'head' });
  }
  // the cheek vents: slits that glow with the throat (glow channel 3)
  for (let k = 0; k < 3; k++) add(new THREE.BoxGeometry(1, 1, 1), M4(V(60 + k * 36, 8 + (k % 2) * 6, 124 - k * 2), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), 0.25), V(9, 56 - k * 8, 7)), { ow: 0, color: P.throat, glow: 3, name: 'head' });
  // nostril and the throat itself: an ember in the back of the mouth (glow 3) with a hot core
  add(sphere, M4(V(532, 52, 54), null, V(14, 9, 7)), { ow: 0, color: P.pupil, name: 'head' });
  add(sphere, M4(V(140, -58, 0), null, V(86, 40, 64)), { ow: 0, color: P.throat, glow: 3, name: 'head' });
  add(sphere, M4(V(118, -58, 0), null, V(48, 24, 36)), { ow: 0, color: P.core, glow: 3, name: 'head' });
  // the palate: the roof of the mouth, red, a flat prism under the skull from the throat to the snout
  { const pts = [[110, 60], [330, 74], [520, 30], [520, -30], [330, -74], [110, -60]]; add(loft([pts.map(([x, z]) => V(x, -46, z)), pts.map(([x, z]) => V(x, -52, z))], true), null, { ow: 0, color: P.mouthIn, glow: 3, name: 'head' }); }
  // the upper fangs along the lip line, two long canines near the front
  for (const sz of [1, -1]) {
    for (let k = 0; k < 6; k++) { const x = 200 + k * 58, w = 96 - (k * 7), len = 36 + (k === 5 ? 56 : (k % 2) * 12); cone(V(x, -44, sz * w * 0.92), V(0.1, -1, sz * 0.05), len, 13, { sides: 4, rings: 2 }, P.bone, 0); }
  }
  // ---- the lower JAW (hinged at the back; its own range so the view can turn it): a long wedge, a spiked chin, lower teeth, the mouth's floor ----
  const J = [[10, -55, -135, 92], [130, -52, -142, 100], [270, -50, -118, 82], [400, -48, -100, 66], [500, -46, -82, 52], [548, -44, -66, 40]];
  const jaw = J.map(([x, top, bot, w]) => [V(x, top, -w * 0.82), V(x, top, w * 0.82), V(x, (top + bot) / 2, w), V(x, bot, w * 0.6), V(x, bot, -w * 0.6), V(x, (top + bot) / 2, -w)]);
  add(loft(jaw, true), null, { ow: OW * 0.9, color: P.skin, name: 'jaw' });
  { const pts = [[120, 70], [300, 64], [520, 30], [520, -30], [300, -64], [120, -70]]; add(loft([pts.map(([x, z]) => V(x, -53, z)), pts.map(([x, z]) => V(x, -58, z))], true), null, { ow: 0, color: P.mouthIn, glow: 3, name: 'jaw' }); } // (the floor of the mouth)
  for (const sz of [1, -1]) {
    for (let k = 0; k < 5; k++) { const x = 190 + k * 62, w = 84 - k * 8; cone(V(x, -50, sz * w * 0.78), V(0.1, 1, sz * 0.04), 30 + (k === 4 ? 36 : (k % 2) * 10), 12, { sides: 4, rings: 2 }, P.bone, 0, 'jaw'); }
    cone(V(120, -140, sz * 80), V(-0.25, -1, sz * 0.3), 100, 22, { sides: 4, rings: 3, bend: V(-1, 0, 0), curve: 0.3 }, P.horn, OW * 0.5, 'jaw');
  }
  cone(V(430, -98, 0), V(0.3, -1, 0), 90, 24, { sides: 4, rings: 3 }, P.horn, OW * 0.5, 'jaw');
  // ---- the tail CLUB: a spiked mace on the tail's end (local +x = along the tail, away from the body) ----
  { // (kept in a frame where the tail points +x)
    add(sphere, M4(V(100, 0, 0), null, V(125, 82, 72)), { ow: OW * 0.8, color: P.club, name: 'club' });
    add(new THREE.CylinderGeometry(58, 70, 70, 10, 1).rotateZ(Math.PI / 2), M4(V(4, 0, 0)), { ow: OW * 0.7, color: P.horn, name: 'club' });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + 0.2; cone(V(100 + Math.cos(a) * 70, Math.sin(a) * 52, 0), V(Math.cos(a) * 0.55, Math.sin(a), 0), 125 - (k % 2) * 22, 26, { sides: 4, rings: 3 }, P.bone, OW * 0.5, 'club'); }
    for (const sz of [1, -1]) cone(V(100, 0, sz * 58), V(0.1, 0, sz), 70, 20, { sides: 4, rings: 2 }, P.bone, OW * 0.4, 'club');
    cone(V(210, 0, 0), V(1, 0, 0), 250, 46, { sides: 4, rings: 4, flat: 0.55 }, P.bone, OW * 0.8, 'club');
  }
  // ---- the two TALONS: an ankle block and three toes that grip (curled down), a spur behind. Local +x = the way the toes point, +y up ----
  for (const nm of ['footA', 'footB']) {
    add(new THREE.BoxGeometry(110, 70, 100), M4(V(0, 0, 0)), { ow: OW * 0.7, color: P.skinDark, name: nm });
    for (const dz of [-44, 0, 44]) {
      cone(V(40, -10, dz), V(1, -0.12, dz * 0.004), 175, 26, { bend: V(0, -1, 0), curve: 0.75, sides: 5, rings: 6, endR: 0.2 }, P.skinDark, OW * 0.6, nm);
      cone(V(40 + 160, -52 - Math.abs(dz) * 0.2, dz * 1.1), V(0.45, -1, dz * 0.01), 62, 17, { sides: 4, rings: 2 }, P.bone, OW * 0.3, nm);
    }
    cone(V(-40, -6, 0), V(-1, -0.25, 0), 90, 22, { sides: 4, rings: 3, bend: V(0, -1, 0), curve: 0.4 }, P.bone, OW * 0.4, nm);
  }
  // ---- the wing thumbs: a hooked claw at each wrist (local +x = out from the wrist, away from the membrane) ----
  for (const nm of ['thumbN', 'thumbF']) {
    cone(V(0, 0, 0), V(1, 0.12, 0), 190, 30, { bend: V(0, 1, 0), curve: 0.55, sides: 5, rings: 6 }, P.horn, OW * 0.6, nm);
    add(sphere, M4(V(0, 0, 0), null, V(46, 46, 46)), { ow: OW * 0.6, color: P.bone2, name: nm });
  }
  // ---- the dents the perched talons leave in the gasbag: three creases fanning from each foot, dark canvas, laid flat (local +x = the foot's direction, the ground plane is x-z) ----
  for (const nm of ['dentA', 'dentB']) {
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.46, len = 190 - Math.abs(k - 2) * 28;
      const c = V(Math.cos(a) * len * 0.5, 2, Math.sin(a) * len * 0.5), d = V(Math.cos(a), 0, Math.sin(a)), n = V(-Math.sin(a), 0, Math.cos(a));
      const w = 11 - Math.abs(k - 2) * 1.8;
      const ring = (t, ww) => [c.clone().addScaledVector(d, len * t * 0.5).addScaledVector(n, ww), c.clone().addScaledVector(d, len * t * 0.5).addScaledVector(n, -ww)];
      void ring;
      const pts = [[0, 0], [0.3, 1], [1, 0.15], [0.3, -1]];
      const r0 = pts.map(([t, s]) => c.clone().addScaledVector(d, (t - 0.5) * len).addScaledVector(n, s * w).setY(2));
      const r1 = r0.map((p) => p.clone().setY(9));
      add(loft([r0, r1], true), null, { ow: 0, color: P.dent, name: nm });
    }
  }
  void hasNear; void K; void opts;
  const geometry = mesh.build();
  return { geometry, set: new RigidSet(geometry, mesh.ranges), ranges: mesh.ranges, tris: mesh.verts / 3 };
}

export { finUV };
