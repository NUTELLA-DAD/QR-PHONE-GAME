// THE DUEL KIT (CASTLE.md A4 in 3D; config.DUEL3D): the soldiers who step out of a squad's block to fight one man, as real 3D men in the garrison's own style (an oxblood tunic with a gold belt and a flame on the chest, an iron
// helmet with a flame crest, a round shield; fictional heraldry only), and the held poses they take. Everything is rigid and held: duel3d.js picks which pose is shown on 8 fps keys. No sine of time.
//   POSES   guard (sword up and forward, shield across), tell (the sword raised over the shoulder, a red "!" key floating over his head), strike (lunging, the sword swung forward and down), stagger (thrown back, the shield
//           dropping, the sword flung up), down (lying on his back, the shield beside him), runA / runB (the two strides of a run, the sword carried back), fleeA / fleeB (no sword, hands up, the shield on his back),
//           blade (a lone sword: dropped when a soldier goes down).
//   TWO MESHES  every pose is built twice (facing +x, and mirrored: facing -x); the ten poses of one facing sit in ONE geometry with a per-vertex pose number (aPose), and the material throws away every vertex whose pose is
//           not the instance's pose (iPose) off screen. So the whole brawl, whatever poses the men are in, is TWO draw calls, one for each way they face (the picture and its ink shell are in the same mesh: style.js inkDouble).
// Model space of a pose: the man stands on y = 0, faces +x (turned a little toward the viewer, ALPHA, so his chest and his shield show), z toward the viewer. He is 118 tall (the same man as garrisonKit.js).
// Geometry never throws: sizes are fixed numbers.
import { THREE, piece, mat, inkDouble, inkCall, rimify, gradientMap } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ICO0 = new THREE.IcosahedronGeometry(1, 0), ICO1 = new THREE.IcosahedronGeometry(1, 1), ROD = new THREE.CylinderGeometry(1, 1, 1, 6, 1), CONE = new THREE.ConeGeometry(1, 1, 6), DISC = new THREE.CylinderGeometry(1, 1, 1, 14, 1), BOX = new THREE.BoxGeometry(1, 1, 1);
const YAXIS = new THREE.Vector3(0, 1, 0);

export const POSES = ['guard', 'tell', 'strike', 'stagger', 'down', 'runA', 'runB', 'fleeA', 'fleeB', 'blade'];
const STEEL = '#e6eaee', GRIP = '#6b4526', INKC = '#2b2622';

// A figure under construction. Coordinates in the man's own frame: f = forward (toward his foe), y = up, s = sideways (+s = the viewer's side of him); v() turns them into model space (a turn of ALPHA about y).
class Fig {
  constructor(A, C, K, alpha) {
    this.A = A; this.C = C; this.K = K; this.a = alpha; this.ca = Math.cos(alpha); this.sa = Math.sin(alpha); this.parts = [];
    this.T = A.banner || '#8f302c'; this.GD = A.gold || '#c8a85c'; this.FL = A.flame || '#ffb347';
  }
  v(f, y, s) { return new THREE.Vector3(f * this.ca - s * this.sa, y, f * this.sa + s * this.ca); }
  add(geo, col, m, ow) { this.parts.push(piece(geo, col, m, ow)); }
  box(col, f, y, s, w, h, d, ow = 1.2, lean = 0) { const p = this.v(f, y, s); this.add(BOX, col, mat(p.x, p.y, p.z, w, h, d, 0, -this.a, -lean), ow); }
  ell(col, f, y, s, rf, ry, rs, ow = 1.2, hi = false) { const p = this.v(f, y, s); this.add(hi ? ICO1 : ICO0, col, mat(p.x, p.y, p.z, rf, ry, rs, 0, -this.a, 0), ow); }
  cone(col, f, y, s, r, h, ow = 0.8, lean = 0) { const p = this.v(f, y, s); this.add(CONE, col, mat(p.x, p.y, p.z, r, h, r, 0, -this.a, -lean), ow); }
  rod(col, a, b, r, ow = 1.4) { this.rodW(col, this.v(a[0], a[1], a[2]), this.v(b[0], b[1], b[2]), r, ow); }
  rodW(col, a, b, r, ow = 1.4) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < 1e-3) return;
    const q = new THREE.Quaternion().setFromUnitVectors(YAXIS, d.normalize());
    this.add(ROD, col, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r)), ow);
  }
  // a round plate at p (model space) facing n (model space): the shield, the key
  discW(col, p, n, r, th, ow = 1.2) {
    const q = new THREE.Quaternion().setFromUnitVectors(YAXIS, n.clone().normalize());
    this.add(DISC, col, new THREE.Matrix4().compose(p, q, new THREE.Vector3(r, th, r)), ow);
  }
  // a flat thing along dv (model space, unit) at centre c: x = its width (in the plane of the picture), y = along dv, z = its thickness (the side of the man)
  slab(geo, col, c, dv, w, len, th, ow = 0.9) {
    const S = new THREE.Vector3(-this.sa, 0, this.ca), Z = S.clone().sub(dv.clone().multiplyScalar(S.dot(dv))).normalize(), X = new THREE.Vector3().crossVectors(dv, Z);
    const m = new THREE.Matrix4().makeBasis(X, dv, Z);
    m.setPosition(c);
    m.multiply(new THREE.Matrix4().makeScale(w, len, th));
    this.add(geo, col, m, ow);
  }
}

// the sword: grip, pommel, cross-guard and a flat blade with a point. h = the hand [f, y, s], d = the way it points [f, y, s]
function sword(F, h, d, len = 66) {
  const dv = F.v(d[0], d[1], d[2]).normalize(), hv = F.v(h[0], h[1], h[2]), at = (k) => hv.clone().addScaledVector(dv, k);
  F.rodW(GRIP, at(-3), at(8), 2.3, 0.8);
  F.add(ICO0, F.GD, mat(at(-5).x, at(-5).y, at(-5).z, 3.2, 3.2, 3.2), 0.7);
  const Sx = new THREE.Vector3(-F.sa, 0, F.ca), Z = Sx.clone().sub(dv.clone().multiplyScalar(Sx.dot(dv))).normalize(), X = new THREE.Vector3().crossVectors(dv, Z).normalize();
  const g = new THREE.Matrix4().makeBasis(X, dv, Z); g.setPosition(at(8)); g.multiply(new THREE.Matrix4().makeScale(19, 3.8, 5.4)); F.add(BOX, F.GD, g, 0.7); // (the cross-guard)
  F.slab(BOX, STEEL, at(8 + (len - 14) / 2 + 2), dv, 8.4, len - 14, 2.8, 1); // (the blade)
  F.slab(CONE, STEEL, at(len - 6), dv, 4.4, 12, 1.5, 0.8); // (the point: a cone, so its first two numbers are half widths)
}
// the round shield: a gold rim, a red face with the flame on it and a gold boss. c = its centre [f, y, s], n = the way it faces [f, y, s]
function shieldAt(F, c, n, r = 21) {
  const nn = F.v(n[0], n[1], n[2]).normalize(), p = F.v(c[0], c[1], c[2]);
  F.discW(F.GD, p.clone().addScaledVector(nn, -1.8), nn, r + 2.2, 2.6, 0.9);
  F.discW(F.T, p, nn, r - 1.2, 4.6, 1.2);
  const fl = p.clone().addScaledVector(nn, 3.4);
  F.add(CONE, F.FL, mat(fl.x, fl.y + 1, fl.z, 4.6, 15, 4.6), 0);
  const bs = p.clone().addScaledVector(nn, 4.4);
  F.add(ICO1, F.GD, mat(bs.x, bs.y - 7, bs.z, 4.6, 4.6, 3.2), 0);
}

// the body of a standing / running man from a few numbers: o = { lean (forward +), hipF, hipY, nf, ff (near / far foot [f, sole height]), nearHand, farHand [f, y, s], shield { c, n }, sword { d, len }, back (the shield on his back) }
function rig(F, o) {
  const { C } = F, T = F.T, GD = F.GD, hip = [o.hipF || 0, o.hipY == null ? 46 : o.hipY], L = o.lean || 0, sl = Math.sin(L), cl = Math.cos(L);
  const up = (d, side = 0, fw = 0) => [hip[0] + sl * d + cl * fw, hip[1] + cl * d - sl * fw, side]; // a point d up his body, fw ahead of its axis
  for (const [s, ft] of [[9, o.nf], [-9, o.ff]]) {
    F.rod(C.PANTS, [hip[0], hip[1], s], [ft[0], ft[1] + 9, s], 7.2, 1.4);
    F.box(C.LEATHER, ft[0] + 5, ft[1] + 4.5, s, 24, 9, 14, 1.2);
  }
  F.box(T, ...up(22), 24, 44, 36, 1.9, L); // the tunic
  F.box(GD, ...up(3), 26, 6, 38, 0.4, L); // the belt
  F.cone(F.FL, ...up(24, 0, 13), 7, 20, 0, L); // the flame on his chest
  for (const s of [-1, 1]) F.ell(C.HELM, ...up(40, s * 21), 9, 7, 9, 1.4, false); // pauldrons
  F.ell(C.SKIN, ...up(56, 0, 3), 10, 11, 10, 1.4, true); // head, helmet, nose guard, crest, eyes
  F.ell(C.HELM, ...up(60.5, 0, 3), 12.5, 10, 12.5, 1.6, true);
  F.box(C.HELM, ...up(55, 0, 13.5), 3, 13, 4, 0.8, L);
  F.cone(F.FL, ...up(77, 0, 3), 4.6, 15, 0.8, L);
  for (const s of [-1, 1]) F.ell(INKC, ...up(57, s * 4.6, 12.2), 1.7, 2.3, 1.4, 0, false);
  const shoulder = (s) => up(39, s * 21);
  if (o.nearHand) { F.rod(T, shoulder(1), o.nearHand, 5.2, 1.4); F.ell(C.SKIN, ...o.nearHand, 5.8, 5.8, 5.8, 1.2, false); }
  if (o.farHand) { F.rod(T, shoulder(-1), o.farHand, 5.2, 1.4); F.ell(C.SKIN, ...o.farHand, 5.8, 5.8, 5.8, 1.2, false); }
  if (o.shield) shieldAt(F, o.shield.c, o.shield.n);
  if (o.sword) sword(F, o.farHand, o.sword.d, o.sword.len);
  if (o.back) shieldAt(F, up(30, 0, -15.5), [-1, 0, 0.18], 19); // (slung on his back)
}

const NF = [0.82, 0, 0.57]; // (the shield's normal: forward, turned a little toward the viewer so the disc is round on the screen)
const POSE = {
  guard: { lean: 0.1, hipF: -2, hipY: 43, nf: [26, 0], ff: [-20, 0], nearHand: [26, 72, 24], shield: { c: [32, 72, 28], n: NF }, farHand: [32, 76, -12], sword: { d: [0.55, 0.83, 0], len: 66 } },
  tell: { lean: -0.1, hipF: 0, hipY: 46, nf: [16, 0], ff: [-16, 0], nearHand: [22, 62, 24], shield: { c: [28, 62, 28], n: NF }, farHand: [-4, 122, -14], sword: { d: [-0.5, 0.86, 0], len: 66 } },
  strike: { lean: 0.34, hipF: 6, hipY: 40, nf: [38, 0], ff: [-24, 0], nearHand: [0, 68, 26], shield: { c: [6, 68, 30], n: NF }, farHand: [46, 62, -12], sword: { d: [0.88, -0.47, 0], len: 66 } },
  stagger: { lean: -0.5, hipF: -12, hipY: 44, nf: [14, 16], ff: [-34, 0], nearHand: [20, 56, 32], shield: { c: [25, 53, 37], n: [0.6, 0.45, 0.66] }, farHand: [-34, 104, -20], sword: { d: [-0.7, 0.7, 0], len: 62 } },
  runA: { lean: 0.28, hipF: 4, hipY: 46, nf: [30, 14], ff: [-28, 4], nearHand: [22, 66, 24], shield: { c: [28, 66, 28], n: NF }, farHand: [-16, 72, -14], sword: { d: [-0.75, 0.5, 0], len: 62 } },
  runB: { lean: 0.28, hipF: 4, hipY: 44, nf: [-26, 6], ff: [30, 14], nearHand: [22, 66, 24], shield: { c: [28, 66, 28], n: NF }, farHand: [-16, 72, -14], sword: { d: [-0.75, 0.5, 0], len: 62 } },
  fleeA: { lean: 0.4, hipF: 6, hipY: 46, nf: [32, 14], ff: [-26, 4], nearHand: [26, 104, 24], farHand: [24, 100, -22], back: true },
  fleeB: { lean: 0.4, hipF: 6, hipY: 44, nf: [-26, 6], ff: [32, 14], nearHand: [20, 92, 26], farHand: [14, 112, -22], back: true },
};
function lying(F) { // flat on his back, his head away from his foe, the arms flung out, the shield beside him
  const { C } = F;
  for (const s of [-1, 1]) {
    F.rod(C.PANTS, [16, 14, s * 9], [62, 10, s * 16], 7.2, 1.4);
    F.box(C.LEATHER, 68, 6, s * 16, 22, 9, 14, 1.2);
    F.rod(F.T, [-18, 20, s * 21], [-27, 10, s * 37], 5.2, 1.4);
    F.ell(C.SKIN, -28, 10, s * 38, 5.8, 5.8, 5.8, 1.2, false);
    F.ell(C.HELM, -18, 22, s * 21, 9, 7, 9, 1.4, false);
  }
  F.box(F.T, -2, 12, 0, 46, 21, 36, 1.9);
  F.box(F.GD, 14, 12, 0, 6, 23, 38, 0.4);
  F.cone(F.FL, -6, 26, 0, 6, 14, 0, 0);
  F.ell(C.SKIN, -38, 14, 0, 10, 11, 10, 1.4, true);
  F.ell(C.HELM, -39.5, 17.5, 0, 12.5, 10, 12.5, 1.6, true);
  F.cone(F.FL, -46, 29, 0, 4.4, 14, 0.8, -0.5);
  shieldAt(F, [12, 3.5, 46], [0, 1, 0], 21);
}

// the "!" key over a man about to strike: a cream-rimmed red disc facing the viewer with a white mark (world axes, not the man's). Its place is KEY (duel3d.js draws the closing ring round it).
export const KEY = { x: 8, y: 220, z: 34, r: 24 };
function keyOver(F) {
  const n = new THREE.Vector3(0, 0, 1), p = (dx, dy, dz) => new THREE.Vector3(KEY.x + dx, KEY.y + dy, KEY.z + dz);
  F.discW('#fff7e0', p(0, 0, -2.4), n, KEY.r + 3.2, 3.2, 1.2);
  F.discW('#d62828', p(0, 0, 0), n, KEY.r, 5, 1.4);
  F.add(BOX, '#ffffff', mat(KEY.x, KEY.y + 4.5, KEY.z + 3.4, 5.6, 14, 3), 0.6);
  F.add(ICO1, '#ffffff', mat(KEY.x, KEY.y - 9.2, KEY.z + 3.4, 3.5, 3.5, 2.2), 0.6);
}

const merge = (parts) => { const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); return g; };
function mirror(g) { // x -> -x and the winding reversed (a mirrored man faces the other way and still draws his front faces)
  const out = new THREE.BufferGeometry(), n = g.attributes.position.count;
  for (const name of ['position', 'normal', 'color', 'onormal']) {
    const src = g.attributes[name].array, arr = new Float32Array(src.length);
    for (let i = 0; i < n; i += 3) for (const [d, f] of [[0, 0], [1, 2], [2, 1]]) for (let k = 0; k < 3; k++) arr[(i + d) * 3 + k] = k === 0 && name !== 'color' ? -src[(i + f) * 3 + k] : src[(i + f) * 3 + k];
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

// One doubled geometry (picture + ink) holding every pose of one facing, with the pose number on every vertex (aPose).
function poseGeo(list) {
  const big = mergeGeometries(list.map((e) => e.g), false), ids = [];
  for (const e of list) { for (let k = 0; k < e.g.attributes.position.count; k++) ids.push(e.id); e.g.dispose(); }
  const n = big.attributes.position.count, geo = inkDouble(big), pose = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) pose[i] = pose[i + n] = ids[i];
  geo.setAttribute('aPose', new THREE.BufferAttribute(pose, 1));
  big.dispose();
  return geo;
}
// -> { right, left, tris }: the poses of a man facing +x (and the lone blade) and the mirrored ones (facing -x), each one doubled geometry; tris = the triangles of one man in one of them (the picture only). alpha = the turn toward the viewer.
export function buildDuelKit(A, C, K = {}) {
  const alpha = Number.isFinite(K.ALPHA) ? K.ALPHA : 0.62, R = [], L = [];
  POSES.forEach((name, i) => {
    const F = new Fig(A, C, K, name === 'blade' ? 0 : alpha);
    if (name === 'down') lying(F);
    else if (name === 'blade') sword(F, [0, 0, 0], [1, 0, 0], 62);
    else { rig(F, POSE[name]); if (name === 'tell') keyOver(F); }
    const g = merge(F.parts);
    if (name !== 'blade') L.push({ g: mirror(g), id: i });
    R.push({ g, id: i });
  });
  const tris = R.reduce((s, e) => s + e.g.attributes.position.count, 0) / 3;
  return { right: poseGeo(R), left: poseGeo(L), tris };
}

// The picture material of the duel men: the garrison's own one-call-ink material with one more rule: a vertex whose pose (aPose) is not this instance's (iPose) is thrown off screen.
function poseMat(toon) {
  const base = toon ? rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, side: THREE.DoubleSide })) : new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const m = inkCall(base, true), prev = m.onBeforeCompile, key = m.customProgramCacheKey();
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPose; attribute float iPose;').replace('#include <project_vertex>', '#include <project_vertex>\n  if ( abs( aPose - iPose ) > 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );');
  };
  m.customProgramCacheKey = () => key + '-duel';
  return m;
}
export const duelMaterials = () => ({ toon: poseMat(true), plain: poseMat(false) });
