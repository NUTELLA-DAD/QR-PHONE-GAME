// THE THUNDERBIRD'S BODY IN 3D (3D.md section 26): the models. Everything here is built once, in the bird's own frame facing +x (x forward, y UP, z toward the viewer; sizes are the sim's game pixels, so the
// picture and the hit capsules agree) and never moves by itself:
//   buildTorso(cr, P)   the TORSO: a plump, deep-breasted lathe in painted feathers (a pale breast, slate flanks, a dark back, storm-blue veins that glow), the shoulders and the feathered thighs, the BREAST SHIELD
//                       (a dynamic piece: the cream feathers that cover the GIZZARD and lift away in steps while it glows) and the GIZZARD itself (a gold ring, a faceted lightning stone and a star of rays: the weak point,
//                       shown only while the sim has it open). It returns the same record as the Kraken's and the Drake's body so the generic creature view runs it.
//   buildPieces(cr, P)  the RIGID PIECES that follow the sim's limbs, merged in one geometry (a RigidSet places each by a matrix): the HEAD (an eagle's: a flat brow, big glowing storm-blue eyes under a fierce
//                       ridge, a fan of crest feathers with glowing tips, a hooked gold beak), the hinged lower MANDIBLE (with the glowing throat) and the two TALONS (gold feet that grip, black claws).
// Angular things are LOFTED solids with flat faces (loft() of the Drake's model: rings of points joined into quads, wound outward); the body is smooth. The ink outline comes from the Mesher's onormal.
import { THREE } from './style.js';
import { Mesher, DynPiece, RigidSet, mantleUV } from './creatureKit.js';
import { loft, horn } from './drakeModel.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const M4 = (pos, quat, scl) => new THREE.Matrix4().compose(pos, quat || new THREE.Quaternion(), scl || V(1, 1, 1));
const sphere = new THREE.SphereGeometry(1, 14, 10);

// a spline of numbers through rows (Catmull-Rom): s in 0..N-1 -> out[] of row length
function spline(rows) {
  const N = rows.length, K = rows[0].length;
  return (s, out) => {
    s = clamp(s, 0, N - 1 - 1e-9);
    const i = Math.floor(s), u = s - i, p = (k) => rows[clamp(k, 0, N - 1)], p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2), u2 = u * u, u3 = u2 * u;
    for (let c = 0; c < K; c++) out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
    return out;
  };
}

// A flat leaf (a feather, a crest plume) as a closed solid: from `base` along `dir`, `len` long and `width` wide at its widest, bowed toward `bend` by `curve` of its length, `thick` thick. The broad face is in the
// plane of dir and `face` (default z: it faces the viewer).
export function leafSolid(base, dir, len, width, { bend = V(0, 1, 0), curve = 0, thick = 0.16, rings = 7, face = V(0, 0, 1) } = {}) {
  const d = dir.clone().normalize(), b = bend.clone().normalize(), out = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, c = base.clone().addScaledVector(d, len * u).addScaledVector(b, len * curve * u * u);
    const tan = d.clone().addScaledVector(b, 2 * curve * u).normalize(), side = tan.clone().cross(face).normalize();
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.75), hz = Math.max(2, w * thick);
    out.push([c.clone().addScaledVector(side, w), c.clone().addScaledVector(face, hz), c.clone().addScaledVector(side, -w), c.clone().addScaledVector(face, -hz)]);
  }
  return loft(out, true);
}

// ---- the TORSO -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// stations along the body: [x, yCentre, rTop, rBottom, rz] (a plump egg: the breast is deep and forward, the body tapers to the tail's root; the neck base sits high in front)
const STATIONS = [[-800, 18, 40, 40, 36], [-660, 8, 120, 108, 100], [-500, 0, 226, 206, 186], [-320, -10, 320, 298, 264], [-110, -22, 372, 372, 302], [120, -32, 386, 406, 314], [320, -26, 348, 390, 298], [470, -4, 266, 304, 228], [580, 28, 162, 188, 142], [670, 60, 80, 92, 74]];
const stationAt = spline(STATIONS);
const _st = [0, 0, 0, 0, 0];
function bodyAt(u, out = _st) { stationAt(clamp(u, 0, 1) * (STATIONS.length - 1), out); return out; }
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
  const R = torso ? torso.shape.r : 360;
  const q = (u) => bodyAt(u, [0, 0, 0, 0, 0]);
  // --- the lathe: x from the tail's root to the neck's base, round the body from the belly (0) over the near flank (0.25) and the back (0.5) ---
  const pos = (u, v, out) => {
    const s = q(u), th = v * TAU, sn = -Math.cos(th), r = s[3] + (s[2] - s[3]) * (0.5 + 0.5 * sn);
    let y = s[1] + sn * r, z = s[4] * Math.sin(th);
    if (sn < 0) z *= 1 - 0.14 * sn * sn; // (a flatter belly)
    return out.set(s[0], y, z);
  };
  mesh.grid(low ? 34 : 54, low ? 18 : 30, pos, null, { ow: OW, color: '#ffffff', name: 'mantle' }, (u, v) => mantleUV(v, u));
  // --- the shoulders (where the wings come out) and the thighs (feathered trousers), round bulges skinned like the body ---
  const lump = (c, r) => mesh.add(sphere, M4(c, null, r), { ow: OW * 0.8, color: '#ffffff', name: 'mantle', uv: (a, b) => mantleUV(0.08 + a * 0.3, 0.3 + b * 0.4) });
  for (const sz of [1, -1]) {
    lump(V(60, 250, sz * 170), V(215, 130, 120)); // shoulders
    lump(V(-170, -300, sz * 205), V(170, 180, 130)); // thighs (the sim's talon roots are low on the belly)
  }
  // --- the gizzard: a gold ring, a faceted lightning stone and a star of rays, on the breast; the generic view shows it only while the sim has it open and throbs it in two steps ---
  const hx = heartP ? heartP.at[0] : 200, hy = heartP ? -heartP.at[1] : -130, hr = heartP ? heartP.shape.r : 150;
  const zS = (x, y) => { // the depth of the body's near skin at (x, y): by search on the round angle (the height rises with it)
    let lo = 0, hi = Math.PI;
    for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2, s = torsoSurface(x, mid); if (s.y < y) lo = mid; else hi = mid; }
    return torsoSurface(x, (lo + hi) / 2).z;
  };
  const hz = zS(hx, hy);
  const Mh = M4(V(hx, hy, hz + 6), null, V(1, 1, 1));
  mesh.add(new THREE.TorusGeometry(1.12 * hr, 0.2 * hr, 8, 26), Mh.clone().multiply(M4(V(0, 0, hr * 0.05), null, V(1, 1, 0.7))), { ow: OW * 0.6, color: P.gold, name: 'heart' });
  // the lightning stone: a six-sided double cone in two tones (a pale crown over a deep cyan base), with two small ones beside it, and a star of rays lying on the breast; all glow channel 4
  const stoneAt = (c, r, hgt, tilt) => {
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), tilt), crown = new THREE.ConeGeometry(1, 1, 6, 1), base = new THREE.ConeGeometry(1, 1, 6, 1);
    crown.translate(0, 0.5, 0); base.rotateX(Math.PI); base.translate(0, -0.5, 0);
    mesh.add(crown, Mh.clone().multiply(M4(c, q, V(r, hgt * 0.55, r * 0.9))), { ow: OW * 0.5, color: P.stoneHi, glow: 4, name: 'heart' });
    mesh.add(base, Mh.clone().multiply(M4(c, q, V(r, hgt * 0.45, r * 0.9))), { ow: OW * 0.5, color: P.heart, glow: 4, name: 'heart' });
  };
  stoneAt(V(0, -hr * 0.1, hr * 0.34), hr * 0.58, hr * 1.9, 0);
  stoneAt(V(hr * 0.62, -hr * 0.34, hr * 0.14), hr * 0.2, hr * 0.7, -0.5);
  stoneAt(V(-hr * 0.6, -hr * 0.36, hr * 0.14), hr * 0.18, hr * 0.62, 0.5);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.2, len = hr * (k % 2 ? 1.5 : 2.05), hn = horn(V(Math.cos(a) * hr * 0.9, Math.sin(a) * hr * 0.9, hr * 0.02), V(Math.cos(a), Math.sin(a), 0.02), len * 0.7, hr * 0.13, { sides: 4, rings: 2, flat: 0.5 });
    mesh.add(hn.g, Mh, { ow: 0, color: P.heart, glow: 4, name: 'heart' });
  }
  // --- the breast shield: cream feathers with gold rims lying over the gizzard, hinged along their top edge so that they lift away (the generic view poses them) ---
  const FEA = [[0.5, 0.38], [0.5, -0.38], [0.1, -0.5], [-0.3, -0.36], [-0.55, 0], [-0.3, 0.36], [0.1, 0.5]]; // (a feather's outline, tip toward the tail: -x)
  const plateAt = (cx, cy, w, h, off, col, ow, bevel = [0.97, 0.82]) => {
    const ring = (o, k = 1) => FEA.map(([a, b]) => { const x = cx + a * w * k, y = cy + b * h * k; return V(x, y, zS(x, y) + o); });
    mesh.add(loft([ring(off, 1), ring(off + 18, bevel[0]), ring(off + 30, bevel[1])], true), null, { ow, color: col, name: 'plates' });
  };
  const rows = [[0.55, 0.62, 0], [-0.35, 0.62, 0], [0.62, -0.05, 1], [-0.4, -0.05, 1], [0.5, -0.7, 2], [-0.3, -0.72, 2]];
  for (const [dx, dy, layer] of rows) {
    plateAt(hx + dx * hr, hy + dy * hr, hr * 1.5, hr * 1.1, 56 + layer * 14, P.plateEdge, OW * 0.7, [0.99, 0.95]);
    plateAt(hx + dx * hr, hy + dy * hr + 3, hr * 1.22, hr * 0.9, 68 + layer * 14, P.plate, 0, [0.96, 0.78]);
  }
  const geometry = mesh.build();
  const dyn = {};
  if (mesh.ranges.heart) { dyn.heart = new DynPiece(geometry, mesh.ranges.heart, V(hx, hy, hz + 6), V(0, 0, 1)); dyn.heart.pose(0, 0); }
  if (mesh.ranges.plates) dyn.plates = new DynPiece(geometry, mesh.ranges.plates, V(hx, hy + hr * 1.65, hz + 40), V(1, 0, 0));
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: heartP ? { part: heartP } : null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R, L: torso ? torso.shape.len : 900, sz: 1 }, tris: mesh.verts / 3, dynTris: 0, heartAt: { x: hx, y: hy, z: hz },
  };
}

// ---- the RIGID PIECES: head, lower mandible, talons ---------------------------------------------------------------------------------------------------------------------------------------------
export const BEAK_PIVOT = V(236, -4, 0); // the hinge of the lower mandible
export function buildPieces(cr, P, opts = {}) {
  const OW = P.INK || 14, mesh = new Mesher();
  const add = (g, m, o) => mesh.add(g, m, o);
  const cone = (base, dir, len, r0, o = {}, col = P.horn, ow = OW * 0.5, name = 'head', glow = 0) => { const h = horn(base, dir, len, r0, o); add(h.g, null, { ow, color: col, name, glow }); return h; };
  // ---- the HEAD: a flat-browed skull in eight-sided sections [x, top, bottom, half width], feathered cheeks, a big hooked beak ----
  const S = [[-110, 118, 104, 100], [-20, 156, 130, 134], [70, 168, 124, 146], [160, 152, 104, 126], [236, 124, 78, 96], [290, 96, 56, 64]];
  const skull = S.map(([x, top, bot, w]) => {
    const ring = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 2 - (k / 8) * TAU, sy = Math.sin(a), sz = Math.cos(a);
      ring.push(V(x, sy > 0 ? top * sy : bot * sy, w * sz * (Math.abs(sz) > 0.99 ? 1 : 0.94)));
    }
    return ring;
  });
  add(loft(skull, true), null, { ow: OW, color: P.skin, name: 'head' });
  for (const sz of [1, -1]) { // the pale cheeks, the dark brow ridge above the eye, the ear tufts
    add(sphere, M4(V(70, -30, sz * 112), null, V(96, 62, 38)), { ow: OW * 0.5, color: P.belly, name: 'head' });
    cone(V(104, 112, sz * 92), V(1, -0.2, sz * 0.14), 190, 30, { sides: 4, rings: 3, flat: 0.62, endR: 0.2 }, P.goldDk, OW * 0.5);
    cone(V(-30, 70, sz * 118), V(-0.9, 0.35, sz * 0.25), 170, 26, { sides: 4, rings: 3, flat: 0.5, endR: 0.2 }, P.skinDark, OW * 0.4);
  }
  // the eyes: a dark socket, a glowing storm-blue ball, a thin dark pupil
  const eyeQ = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -0.3);
  for (const sz of [1, -1]) {
    add(sphere, M4(V(158, 54, sz * 98), eyeQ, V(56, 42, 30)), { ow: OW * 0.35, color: P.skinDark, name: 'head' });
    add(sphere, M4(V(166, 54, sz * 108), eyeQ, V(41, 31, 22)), { ow: 0, color: P.eye, glow: 1, name: 'head' });
    add(sphere, M4(V(176, 54, sz * 124), eyeQ, V(8, 21, 6)), { ow: 0, color: P.pupil, name: 'head' });
  }
  // ---- the CREST: a fan of plumes swept back from the crown, gold and slate, each ending in a glowing storm-blue tip (glow channel 3) ----
  const PL = [[150, 270, 1], [124, 360, 0], [104, 450, 1], [86, 520, 0], [68, 450, 1], [50, 360, 0], [34, 280, 1]]; // [angle from +x in degrees, length, colour]
  PL.forEach(([deg, len, c], i) => {
    const a = (deg * Math.PI) / 180, dir = V(Math.cos(a), Math.sin(a), 0), z = (i - 3) * 13, col = c ? P.gold : P.skin;
    const lf = leafSolid(V(-30, 130, z), dir, len, 78, { bend: V(-1, -0.1, 0), curve: 0.2, rings: 7, thick: 0.1 });
    add(lf, null, { ow: OW * 0.55, color: col, glow: c ? 2 : 0, name: 'head' });
    const e = dir.clone().multiplyScalar(len * 0.82).add(V(-30, 130, z)).addScaledVector(V(-1, -0.1, 0).normalize(), len * 0.2 * 0.67);
    const tip = leafSolid(e, dir.clone().addScaledVector(V(-1, -0.1, 0).normalize(), 0.4), len * 0.26, 44, { bend: V(-1, -0.1, 0), curve: 0.2, rings: 4, thick: 0.2 });
    add(tip, null, { ow: 0, color: P.cyan, glow: 3, name: 'head' });
  });
  // ---- the BEAK: a pale cere, a deep hooked gold upper mandible, the nostrils, and the glowing roof of the mouth ----
  const beak = (xs, cy, hh, ww) => xs.map((x, i) => [V(x, cy[i] + hh[i], 0), V(x, cy[i] + hh[i] * 0.35, ww[i]), V(x, cy[i] - hh[i] * 0.75, ww[i] * 0.7), V(x, cy[i] - hh[i], 0), V(x, cy[i] - hh[i] * 0.75, -ww[i] * 0.7), V(x, cy[i] + hh[i] * 0.35, -ww[i])]);
  add(loft(beak([226, 262, 300], [26, 24, 20], [100, 98, 94], [86, 82, 76]), true), null, { ow: OW * 0.8, color: P.goldDk, name: 'beak' }); // (the cere)
  add(loft(beak([300, 366, 430, 488, 536, 566], [16, 6, -10, -40, -98, -170], [98, 88, 70, 48, 26, 4], [78, 64, 48, 32, 17, 3]), true), null, { ow: OW * 0.8, color: P.gold, name: 'beak' }); // (the hooked bill)
  for (const sz of [1, -1]) add(sphere, M4(V(322, 52, sz * 70), null, V(20, 12, 8)), { ow: 0, color: P.pupil, name: 'head' }); // (the nostrils)
  { const pts = [[262, 52], [380, 44], [500, 22], [500, -22], [380, -44], [262, -52]]; add(loft([pts.map(([x, z]) => V(x, -34, z)), pts.map(([x, z]) => V(x, -42, z))], true), null, { ow: 0, color: P.cyan, glow: 3, name: 'head' }); } // (the roof of the mouth: dark until it is charged)
  // ---- the lower MANDIBLE (hinged at the back; its own range so the view can turn it) and the glowing floor of the mouth ----
  const J = [[236, -22, -56, 70], [320, -34, -70, 58], [410, -52, -88, 42], [492, -80, -108, 24]];
  add(loft(J.map(([x, top, bot, w]) => [V(x, top, -w * 0.8), V(x, top, w * 0.8), V(x, (top + bot) / 2, w), V(x, bot, w * 0.5), V(x, bot, -w * 0.5), V(x, (top + bot) / 2, -w)]), true), null, { ow: OW * 0.7, color: P.goldDk, name: 'jaw' });
  { const pts = [[246, 50], [330, 42], [440, 24], [440, -24], [330, -42], [246, -50]]; add(loft([pts.map(([x, z]) => V(x, -26, z)), pts.map(([x, z]) => V(x, -32, z))], true), null, { ow: 0, color: P.cyan, glow: 3, name: 'jaw' }); }
  // ---- the TALONS: an ankle block, three toes that curl round whatever they grip, a back toe, and black claws. Local +x = the way the toes point, +y up ----
  for (const nm of ['footA', 'footB']) {
    add(new THREE.BoxGeometry(120, 74, 96), M4(V(0, 0, 0)), { ow: OW * 0.7, color: P.foot, glow: 2, name: nm });
    for (const dz of [-46, 0, 46]) {
      const t = cone(V(40, -10, dz), V(1, -0.1, dz * 0.003), 170, 25, { bend: V(0, -1, 0), curve: 0.7, sides: 5, rings: 6, endR: 0.5 }, P.foot, OW * 0.55, nm, 2);
      cone(t.end, t.tan, 120, 20, { bend: V(0, -1, 0), curve: 0.5, sides: 4, rings: 3 }, P.claw, OW * 0.4, nm);
    }
    const bt = cone(V(-34, -10, 0), V(-1, -0.2, 0), 120, 22, { bend: V(0, -1, 0), curve: 0.6, sides: 5, rings: 4, endR: 0.5 }, P.foot, OW * 0.5, nm, 2);
    cone(bt.end, bt.tan, 90, 18, { bend: V(0, -1, 0), curve: 0.5, sides: 4, rings: 3 }, P.claw, OW * 0.4, nm);
  }
  const geometry = mesh.build();
  return { geometry, set: new RigidSet(geometry, mesh.ranges), ranges: mesh.ranges, tris: mesh.verts / 3 };
}
