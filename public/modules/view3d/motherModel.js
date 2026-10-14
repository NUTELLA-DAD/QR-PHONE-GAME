// THE MYCELIAL MOTHER'S BODY IN 3D (3D.md section 41): the models. Everything is built once, in the CAP'S OWN FRAME (the origin is the middle of the cap's top where the sim has it cling to the roof, x to the right, y UP, z toward the
// viewer; sizes are the sim's game px from config.CREATURES.MOTHER, so the picture and the hit capsules agree) and one RigidSet (creatureKit.js) places the pieces that move. She is a spore-moth that hangs upside down from a rock roof:
//   STEM + ROOTS   a thick stalk growing out of the roof (its top ring lies on the roof line), mycelium strands spreading over the rock face
//   CAP            the violet mushroom cap: a smooth dome with lumps, cream spots with a glowing teal heart, growth rings; it swells (a stepped scale) when she puffs for the spores
//   SKIRT          the GILLS: a pleated pink skirt hanging from the cap's rim (36 pleats, a glowing hem)
//   HEAD           the furry face hanging under the cap: a lilac bulb with a ruff of fur tufts, a socket (a flattened mound) for each of the five tendrils, a dark ring round each eye
//   EYES           two big COMPOUND eyes (a faceted dome with a slit pupil and a glint, glow channels 1 and 2) and, for an eye that is put out, a dark cracked ball (SOCK)
//   ANTENNAE       two long feathered antennae sweeping out and up: a stalk with pairs of barbs (the tips glow)
//   WINGS          motherWings.js: four poses of a furry slab wing (fore and hind), one piece for each side, whose vertices are rewritten when the sim's beat key changes
//   SPORE HEART    a pod on the underside of the face: five petals that are closed (a bud) until phase 3 and then open (a stepped angle) round the glowing pink heart (glow channel 4)
// The ink outline comes from the Mesher's onormal. Every named piece is one contiguous run of the mesher, so the Tinter can dim, flash or light it.
import { THREE } from './style.js';
import { Mesher, RigidSet, SWATCH } from './creatureKit.js';
import { horn, loft } from './drakeModel.js';
import { V, M4, hash, rockGeo } from './titanModel.js';
import { atlasUV } from './motherPaint.js';
import { addWing, POSES } from './motherWings.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const _c = new THREE.Color();
export const RZ = 0.84; // the cap is a little flatter in depth than it is wide

// ---- the body's numbers that the extension needs too ---------------------------------------------------------------------------------------------------------------------------------------------
export const HEAD = { cy: -800, rx: 690, ry: 420, rz: 520 }; // the face's bulb: centre (0, cy), radii (cy is y up: h 800 under the cap's top)
const headRx = (c) => HEAD.rx * (1 - 0.16 * (1 - c) / 2); // narrower toward the chin
// the depth of the face's skin at (x, y) (0 outside it): for what is stuck to it (the eyes, the sockets, the pod)
export function headZ(x, y) {
  const c = (y - HEAD.cy) / HEAD.ry;
  if (c <= -1 || c >= 1) return 0;
  const q = 1 - c * c - (x / headRx(c)) ** 2;
  return q > 0 ? HEAD.rz * Math.sqrt(q) : 0;
}
const headNormal = (x, y, z) => { const c = (y - HEAD.cy) / HEAD.ry; return V(x / headRx(c) ** 2, (y - HEAD.cy) / HEAD.ry ** 2, z / HEAD.rz ** 2).normalize(); };

// ---- flat-shaded triangles with a colour each (the compound eyes, the roots) ---------------------------------------------------------------------------------------------------------------------
// tris = [{ p: [V, V, V], c: '#hex' }]; the ink vector at a corner is the average of the face normals meeting there. convex: every face is turned to look away from the middle of the solid; up: a flat ribbon wound toward +z.
function emit(mesh, tris, o = {}) {
  const ow = o.ow || 0, glow = o.glow || 0, uv = o.uv || SWATCH, start = mesh.verts;
  if (o.convex) {
    const c = V(); let n = 0; for (const t of tris) for (const p of t.p) { c.add(p); n++; }
    c.multiplyScalar(1 / Math.max(1, n));
    for (const t of tris) { const nm = t.p[1].clone().sub(t.p[0]).cross(t.p[2].clone().sub(t.p[0])), g = t.p[0].clone().add(t.p[1]).add(t.p[2]).multiplyScalar(1 / 3); if (nm.dot(g.sub(c)) < 0) t.p = [t.p[0], t.p[2], t.p[1]]; }
  }
  if (o.up) for (const t of tris) { const nm = t.p[1].clone().sub(t.p[0]).cross(t.p[2].clone().sub(t.p[0])); if (nm.z < 0) t.p = [t.p[0], t.p[2], t.p[1]]; }
  const nn = tris.map((t) => { const a = t.p[1].clone().sub(t.p[0]), b = t.p[2].clone().sub(t.p[0]); return a.cross(b).normalize(); });
  const sum = new Map(), key = (p) => Math.round(p.x * 2) + ',' + Math.round(p.y * 2) + ',' + Math.round(p.z * 2);
  if (ow > 0) tris.forEach((t, i) => { for (const p of t.p) { const k = key(p); let s = sum.get(k); if (!s) sum.set(k, (s = V())); s.add(nn[i]); } });
  const o3 = V();
  tris.forEach((t, i) => {
    _c.set(t.c || '#ffffff');
    for (const p of t.p) { if (ow > 0) o3.copy(sum.get(key(p))).normalize().multiplyScalar(ow); else o3.set(0, 0, 0); mesh._v(p, nn[i], uv[0], uv[1], _c, glow, o3); }
  });
  if (o.name) { const r = mesh.ranges[o.name] || (mesh.ranges[o.name] = { start, count: 0 }); r.count = mesh.verts - r.start; }
}
// a faceted dome (an icosphere, every face its own tone of `tones`) at a matrix: the compound eye
function facetedBall(mesh, detail, matrix, tones, seed, o = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, tris = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    const a = V().fromBufferAttribute(p, i).applyMatrix4(matrix), b = V().fromBufferAttribute(p, i + 1).applyMatrix4(matrix), c = V().fromBufferAttribute(p, i + 2).applyMatrix4(matrix);
    tris.push({ p: [a, b, c], c: tones[Math.floor(hash(seed, i / 3) * tones.length)] });
  }
  emit(mesh, tris, { ...o, convex: true });
}
// a strip (a ribbon) along a polyline of points with a width that tapers: flat, facing +z, a root strand on the rock
function ribbon(mesh, pts, w0, w1, z, color, o = {}) {
  const n = pts.length, tris = [], L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], d = V(b[0] - a[0], b[1] - a[1], 0).normalize(), w = lerp(w0, w1, i / (n - 1));
    L.push(V(pts[i][0] - d.y * w, pts[i][1] + d.x * w, z)); R.push(V(pts[i][0] + d.y * w, pts[i][1] - d.x * w, z));
  }
  for (let i = 0; i < n - 1; i++) { tris.push({ p: [L[i], R[i], R[i + 1]], c: color }, { p: [L[i], R[i + 1], L[i + 1]], c: color }); }
  emit(mesh, tris, { up: true, ...o });
}
// a Catmull-Rom point on a polyline of [x, y] (u in 0..1)
function spline2(pts, u) {
  const n = pts.length - 1, f = clamp(u, 0, 0.9999) * n, i = Math.floor(f), t = f - i, p = (k) => pts[clamp(k, 0, n)], t2 = t * t, t3 = t2 * t;
  return [0, 1].map((c) => 0.5 * (2 * p(i)[c] + (-p(i - 1)[c] + p(i + 1)[c]) * t + (2 * p(i - 1)[c] - 5 * p(i)[c] + 4 * p(i + 1)[c] - p(i + 2)[c]) * t2 + (-p(i - 1)[c] + 3 * p(i)[c] - 3 * p(i + 1)[c] + p(i + 2)[c]) * t3));
}
const tuft = (mesh, base, dir, len, r0, color, ow, name, flat = 1) => mesh.add(horn(base, dir, len, r0, { sides: 4, rings: 1, endR: 0, flat }).g, null, { color, ow, name });

// ---- the pieces ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function addCap(mesh, P, low) {
  const OW = P.INK || 22, nU = low ? 12 : 20, nV = low ? 24 : 40, TH = 1.95;
  const dome = (u, v, o) => {
    const th = u * TH, a = v * TAU - Math.PI / 2, s = Math.sin(th), lump = 1 + 0.032 * Math.sin(5 * a + 1.3) * s + 0.02 * Math.sin(9 * a + 0.4) * s;
    const r = 930 * Math.pow(s, 0.92) * lump, hh = 270 - 440 * Math.cos(th);
    o.set(r * Math.cos(a), -hh, r * RZ * Math.sin(a));
  };
  mesh.grid(nU, nV, dome, null, { color: '#ffffff', ow: OW, name: 'cap' }, (u, v) => atlasUV('cap', v, 0.04 + 0.94 * u), true);
  // the underside: a shallow dish from the rim in to the middle (hidden by the face, here so the cap is closed)
  const th = TH, rr = 930 * Math.pow(Math.sin(th), 0.92), h0 = 270 - 440 * Math.cos(th);
  mesh.grid(4, low ? 16 : 28, (u, v, o) => { const a = v * TAU - Math.PI / 2, r = rr * (1 - u), hh = h0 - 70 * Math.pow(u, 0.7); o.set(r * Math.cos(a), -hh, r * RZ * Math.sin(a)); }, null, { color: '#ffffff', ow: OW, name: 'cap' }, (u, v) => atlasUV('cap', v, 0.97), true);
}
function addSkirt(mesh, P, low) {
  const OW = P.INK || 22, nU = low ? 3 : 5, nV = low ? 72 : 108;
  mesh.grid(nU, nV, (u, v, o) => {
    const a = v * TAU - Math.PI / 2, r = lerp(845, 690, Math.pow(u, 0.8)), hh = lerp(405, 695, u), pleat = Math.cos(36 * a), rr = r * (1 + 0.05 * pleat * Math.pow(u, 0.6)), h2 = hh + 24 * pleat * u;
    o.set(rr * Math.cos(a), -h2, rr * RZ * Math.sin(a));
  }, null, { color: '#ffffff', ow: OW * 0.8, name: 'skirt' }, (u, v) => atlasUV('gill', v, u), true);
}
function addStem(mesh, P, low) {
  const OW = P.INK || 22;
  mesh.grid(low ? 5 : 8, low ? 14 : 24, (u, v, o) => {
    const a = v * TAU - Math.PI / 2, hh = lerp(-450, -90, u), r = (300 + 190 * Math.exp(-u * 3.2) + 130 * smooth((u - 0.7) / 0.3)) * (1 + 0.05 * Math.sin(3 * a + hh * 0.012));
    o.set(r * Math.cos(a), -hh, r * 0.9 * Math.sin(a));
  }, null, { color: '#ffffff', ow: OW, name: 'stem' }, (u, v) => atlasUV('cap', v, 0.01 + 0.1 * u), true);
}
// mycelium strands over the rock face above the roof line (y > 450 in the cap's frame), faintly glowing (channel 3)
const ROOT_PATHS = [
  [[130, 455], [520, 500], [960, 540], [1500, 600], [2100, 700]], [[-130, 455], [-540, 505], [-980, 520], [-1480, 590], [-2050, 690]],
  [[90, 470], [300, 820], [440, 1150], [700, 1600]], [[-90, 470], [-320, 830], [-520, 1180], [-760, 1650]],
  [[200, 460], [700, 700], [1300, 950], [1800, 1350]], [[-200, 460], [-720, 720], [-1250, 980], [-1900, 1330]],
  [[40, 480], [60, 900], [-80, 1300], [-200, 1800]], [[300, 470], [820, 470], [1250, 440], [1700, 500]], [[-300, 470], [-860, 468], [-1300, 450], [-1760, 505]],
];
function addRoots(mesh, P, low) {
  const n = low ? 8 : 12;
  ROOT_PATHS.forEach((path, k) => {
    const pts = Array.from({ length: n }, (_, i) => spline2(path, i / (n - 1)));
    ribbon(mesh, pts, 46 - (k % 3) * 8, 8, -22 - k * 2, k % 2 ? P.root : P.stem, { ow: 5, name: 'roots' });
  });
  // a glowing thin core down the middle of the strands (channel 3)
  ROOT_PATHS.forEach((path, k) => { const pts = Array.from({ length: n }, (_, i) => spline2(path, i / (n - 1))); ribbon(mesh, pts, 7, 2, -19 - k * 2, P.rootGlow, { glow: 3, name: 'roots' }); });
}
// the face: a furry bulb; tufts all over it except where a socket, an eye or the pod are
function addHead(mesh, P, M, low) {
  const OW = P.INK || 22, nU = low ? 12 : 18, nV = low ? 24 : 36, B = M.BODY;
  mesh.grid(nU, nV, (u, v, o) => {
    const th = u * Math.PI, a = v * TAU - Math.PI / 2, c = Math.cos(th), s = Math.sin(th), lumpy = 1 + 0.02 * Math.sin(4 * a + 2) * s;
    o.set(headRx(c) * s * Math.cos(a) * lumpy, HEAD.cy + HEAD.ry * c, HEAD.rz * s * Math.sin(a) * lumpy);
  }, null, { color: '#ffffff', ow: OW, name: 'head' }, (u, v) => atlasUV('head', v, u), true);
  const eyes = B.EYES.AT.map(([x, h]) => [x, -h]), roots = B.TENDRILS.ROOTS.map(([x, h]) => [x, -h]), pod = [B.HEART.AT[0], -B.HEART.AT[1]];
  const free = (x, y) => eyes.every((e) => Math.hypot(e[0] - x, e[1] - y) > 285) && roots.every((r) => Math.hypot(r[0] - x, r[1] - y) > 200) && Math.hypot(pod[0] - x, pod[1] - y) > 270;
  // the ruff: rings of fat tufts round the face, pointing outward and down (she hangs: fur falls), light on the outside
  let k = 0;
  for (const [thf, cnt, len0] of [[0.36, 30, 240], [0.5, 30, 230], [0.64, 26, 220], [0.78, 22, 200], [0.9, 14, 180], [0.97, 8, 150]]) {
    const th = thf * Math.PI, c = Math.cos(th), s = Math.sin(th), nn = low ? Math.ceil(cnt * 0.6) : cnt;
    for (let i = 0; i < nn; i++, k++) {
      const a = ((i + 0.5 * (k % 2)) / nn) * Math.PI * 1.9 - 0.45 * Math.PI + 0.05 * (hash(5, k) - 0.5);
      const x = headRx(c) * s * Math.cos(a), y = HEAD.cy + HEAD.ry * c, z = HEAD.rz * s * Math.sin(a);
      if (z < -80 || !free(x, y)) continue;
      const n3 = headNormal(x, y, z), dir = n3.clone().multiplyScalar(0.95).add(V(0, -0.7, 0.1)).normalize(), h = hash(9, k), col = h < 0.45 ? P.furLt : h < 0.8 ? P.fur : P.furDk;
      tuft(mesh, V(x, y, z).addScaledVector(n3, -26), dir, len0 * (0.8 + 0.4 * hash(3, k)), 70 + 28 * hash(4, k), col, OW * 0.35, 'head');
    }
  }
  // the lashes: an arch of light tufts over each eye
  for (const [ex, ey] of eyes) for (let j = 0; j < 7; j++) {
    const a = Math.PI * (0.04 + 0.92 * (j / 6)), px = ex + Math.cos(a) * 238, py = ey + Math.sin(a) * 256, pz = headZ(px, py) - 10;
    tuft(mesh, V(px, py, pz), V(Math.cos(a) * 0.55, Math.sin(a) * 0.85 + 0.1, 0.5).normalize(), 170 + 16 * (3 - Math.abs(j - 3)), 36, j % 2 ? P.furLt : P.fur, OW * 0.3, 'head');
  }
  // a thin dark rim round each eye, and a low mound at every tendril's root
  for (const [ex, ey] of eyes) mesh.add(new THREE.SphereGeometry(1, low ? 10 : 14, low ? 8 : 10), M4(V(ex, ey, headZ(ex, ey) - 50), null, V(228, 246, 140)), { color: P.socket, ow: OW * 0.5, name: 'head' });
  addProboscis(mesh, P, low);
  for (const [rx, ry] of roots) {
    const z = Math.max(headZ(rx, ry), 120), n3 = headNormal(rx, ry, z), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n3);
    mesh.add(new THREE.SphereGeometry(1, low ? 10 : 14, low ? 6 : 8), M4(V(rx, ry, z - 30).addScaledVector(n3, 20), q, V(185, 185, 100)), { color: P.fur, ow: OW * 0.4, name: 'head' });
  }
}
// the proboscis: a moth's coiled tongue, a flat spiral of a pink tube between the eyes
function addProboscis(mesh, P, low) {
  const OW = (P.INK || 22) * 0.5, cx = 0, cy = -780, N = low ? 14 : 24, rings = [], z = headZ(cx, cy) + 40;
  for (let i = 0; i <= N; i++) {
    const u = i / N, a = u * Math.PI * 3.1 + 0.6, r = lerp(150, 28, u), c = V(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9, z + 25 * u), T = V(-Math.sin(a), Math.cos(a) * 0.9, 0.05).normalize(), ex = T.clone().cross(V(0, 0, 1)).normalize(), ey = T.clone().cross(ex).normalize(), w = lerp(34, 15, u), ring = [];
    for (let k = 0; k < 6; k++) { const b = (k / 6) * TAU; ring.push(c.clone().addScaledVector(ex, Math.cos(b) * w).addScaledVector(ey, Math.sin(b) * w)); }
    rings.push(ring);
  }
  mesh.add(loft(rings, true), null, { color: P.skirt, ow: OW, name: 'head' });
}
// an eye: a faceted compound dome, a slit pupil and a glint (the glow channel decides how brightly the dome shines)
function addEye(mesh, P, M, i, low) {
  const [ex, h] = M.BODY.EYES.AT[i], ey = -h, z = headZ(ex, ey) - 40, s = Math.sign(ex) || 1, OW = P.INK || 22, name = 'eye' + 'AB'[i];
  const tones = [P.eye, P.eye, P.eyeLt, P.eyeDk, P.eye];
  const R = M.BODY.EYES.R * 1.28; // the dome is a little bigger than the hit circle
  facetedBall(mesh, low ? 1 : 2, M4(V(ex, ey, z), null, V(R, R * 1.08, R * 0.9)), tones, 11 + i, { glow: i ? 2 : 1, ow: OW * 0.5, name });
  const d = V(-s * 0.18, -0.12, 1).normalize(), pos = V(ex, ey, z).add(V(d.x * R, d.y * R * 1.08, d.z * R * 0.9).multiplyScalar(0.985)), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), d);
  mesh.add(new THREE.CircleGeometry(1, 14), M4(pos, q, V(R * 0.2, R * 0.66, 1)), { color: P.eyePupil, name });
  mesh.add(new THREE.SphereGeometry(1, 6, 4), M4(V(ex - s * R * 0.42, ey + R * 0.5, z + R * 0.72), null, V(R * 0.14, R * 0.1, R * 0.08)), { color: P.glint, name });
}
// an eye that has been put out: a dark ball with cracks
function addSocketBall(mesh, P, M, i, low) {
  const [ex, h] = M.BODY.EYES.AT[i], ey = -h, z = headZ(ex, ey) - 50, R = M.BODY.EYES.R * 1.2, name = 'sock' + 'AB'[i], OW = P.INK || 22;
  mesh.add(rockGeo(R, R * 1.08, R * 0.8, { detail: low ? 0 : 1, jitter: 0.1, seed: 40 + i }), M4(V(ex, ey, z)), { color: P.dead, ow: OW * 0.5, name });
  for (let k = 0; k < 6; k++) {
    const a = hash(13 + i, k) * TAU, l = R * (0.55 + 0.5 * hash(14 + i, k)), p = V(ex + Math.cos(a) * R * 0.25, ey + Math.sin(a) * R * 0.25, z + R * 0.74);
    mesh.add(new THREE.BoxGeometry(l, 13, 12), M4(p.add(V(Math.cos(a) * l * 0.3, Math.sin(a) * l * 0.3, 0)), qz(a)), { color: P.crack, name });
  }
}
// an antenna: a stalk on a curve out and up, with pairs of broad flat barbs along it (a feather's plume; the tips glow, channel 3)
function addAntenna(mesh, P, s, name, low) {
  const OW = (P.INK || 22) * 0.55, path = [[620, -690, 250], [980, -610, 330], [1330, -400, 300], [1520, -60, 230], [1470, 300, 160]].map(([x, y, z]) => V(s * x, y, z));
  const at = (u) => { const f = clamp(u, 0, 0.9999) * (path.length - 1), i = Math.floor(f), t = f - i, p = (k) => path[clamp(k, 0, path.length - 1)], out = V(); const t2 = t * t, t3 = t2 * t; for (const c of ['x', 'y', 'z']) out[c] = 0.5 * (2 * p(i)[c] + (-p(i - 1)[c] + p(i + 1)[c]) * t + (2 * p(i - 1)[c] - 5 * p(i)[c] + 4 * p(i + 1)[c] - p(i + 2)[c]) * t2 + (-p(i - 1)[c] + 3 * p(i)[c] - 3 * p(i + 1)[c] + p(i + 2)[c]) * t3); return out; };
  const N = low ? 10 : 16, rings = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, c = at(u), c2 = at(Math.min(1, u + 0.02)), T = c2.clone().sub(c).normalize(), ex = T.clone().cross(V(0, 0, 1)).normalize(), ey = T.clone().cross(ex).normalize(), r = lerp(40, 11, u), ring = [];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; ring.push(c.clone().addScaledVector(ex, Math.cos(a) * r).addScaledVector(ey, Math.sin(a) * r)); }
    rings.push(ring);
  }
  mesh.add(loft(rings, true), null, { color: P.antenna, ow: OW, name });
  const nb = low ? 9 : 14;
  for (let k = 1; k <= nb; k++) {
    const u = 0.1 + 0.88 * (k / nb), c = at(u), c2 = at(Math.min(1, u + 0.02)), T = c2.clone().sub(c).normalize(), len = 100 + 270 * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 - 0.2 * u), tip = u > 0.78;
    for (const sg of [1, -1]) {
      const ang = sg * (0.95 - 0.35 * u), d = V(T.x * Math.cos(ang) - T.y * Math.sin(ang), T.x * Math.sin(ang) + T.y * Math.cos(ang), T.z * 0.3).normalize();
      mesh.add(horn(c, d, len, 30 * (1 - 0.45 * u), { sides: 4, rings: 1, endR: 0, flat: 0.4 }).g, null, { color: tip ? P.antennaTip : sg > 0 ? P.antennaLt : P.antenna, glow: tip ? 3 : 0, ow: OW * 0.5, name });
    }
  }
  mesh.add(new THREE.SphereGeometry(1, 8, 6), M4(at(1), null, V(34, 34, 34)), { color: P.antennaTip, glow: 3, name });
}
// the spore heart: a base ring and a dark hollow (always there), five petals (each its own piece: closed over the heart like a bud, or opened) and the heart itself (glow channel 4)
export const POD = { R: 150, PETAL: 235 };
function addPod(mesh, P, M, low) {
  const OW = P.INK || 22, name = 'podBase', hr = M.BODY.HEART.R;
  mesh.add(new THREE.TorusGeometry(POD.R + 26, 30, 6, low ? 14 : 22), M4(V(0, 0, 14)), { color: P.podDk, ow: OW * 0.5, name });
  mesh.add(new THREE.CircleGeometry(POD.R + 10, low ? 14 : 22), M4(V(0, 0, 6)), { color: '#3a2448', name });
  for (let k = 0; k < 5; k++) {
    const nm = 'petal' + k;
    mesh.add(horn(V(0, 0, 0), V(1, 0, 0), POD.PETAL, 82, { sides: 4, rings: 3, endR: 0.12, flat: 0.3, curve: 0.2, bend: V(0, 0, 1) }).g, null, { color: k % 2 ? P.petal : P.pod, ow: OW * 0.5, name: nm });
  }
  mesh.add(new THREE.SphereGeometry(1, low ? 10 : 14, low ? 8 : 10), M4(V(0, 0, 0), null, V(hr * 0.78, hr * 0.78, hr * 0.62)), { color: P.heart, glow: 4, ow: OW * 0.4, name: 'orb' });
  mesh.add(new THREE.SphereGeometry(1, 8, 6), M4(V(-hr * 0.22, hr * 0.26, hr * 0.5), null, V(hr * 0.2, hr * 0.16, hr * 0.1)), { color: P.heartIn, glow: 4, name: 'orb' });
}
// where the pod sits: the face's skin at the heart's place, its axis along the skin's normal
export function podFrame(M) {
  const [x, h] = M.BODY.HEART.AT, y = -h, z = headZ(x, y) + 8, n3 = headNormal(x, y, z), q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n3);
  return M4(V(x, y, z), q);
}

// ---- the builders ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// the still record the generic view expects: one degenerate triangle, drawRange 0 (everything of the Mother moves or is placed by the extension)
export function buildMotherBody(cr, P, opts = {}) {
  const mesh = new Mesher();
  mesh.add(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)).setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)), null, { color: '#ffffff' });
  const geometry = mesh.build();
  geometry.setDrawRange(0, 0);
  void cr; void opts;
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn: {}, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R: 900, L: 260, sz: 1 }, tris: 0, dynTris: 0,
  };
}

// the wing's pose arrays: the same vertices in each of the four poses (positions, normals and ink vectors of the range 'w'), so one piece per side can be re-posed by rewriting its vertices
function wingPoses(P, L, low, mirror) {
  const out = [];
  for (const pi of [2, 0, 1, 3]) { // (pose 2 first: it records the winding of every triangle, the others reuse it)
    const m = new Mesher();
    addWing(m, P, L, pi, 'w', low, mirror);
    const g = m.build();
    out[pi] = { p: new Float32Array(g.getAttribute('position').array), n: new Float32Array(g.getAttribute('normal').array), o: new Float32Array(g.getAttribute('onormal').array), verts: m.verts };
    g.dispose();
  }
  return out;
}

export function buildMotherPieces(cr, P, opts = {}) {
  const M = opts.M, low = !!opts.low, body = new Mesher(), B = M.BODY, L = B.CAP.R * 2.6;
  addCap(body, P, low);
  addSkirt(body, P, low);
  addStem(body, P, low);
  addRoots(body, P, low);
  addHead(body, P, M, low);
  addEye(body, P, M, 0, low); addEye(body, P, M, 1, low);
  addSocketBall(body, P, M, 0, low); addSocketBall(body, P, M, 1, low);
  addAntenna(body, P, 1, 'antA', low); addAntenna(body, P, -1, 'antB', low);
  const poses = wingPoses(P, L, low, false), posesB = wingPoses(P, L, low, true);
  addWing(body, P, L, 2, 'wA', low, false); addWing(body, P, L, 2, 'wB', low, true);
  addPod(body, P, M, low);
  const geometry = body.build();
  const set = new RigidSet(geometry, body.ranges);
  const poseOk = poses.every((p) => p && p.verts === poses[2].verts) && body.ranges.wA && body.ranges.wA.count === poses[2].verts;
  return { geometry, set, ranges: body.ranges, tris: body.verts / 3, poses, posesB, poseOk, L };
}

// does every triangle's winding agree with its vertex normals? (a gate: the fraction that does, per named piece)
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
export { M4, V, hash, POSES, qx, qy, qz };
