// THE MYCELIAL MOTHER'S WINGS IN 3D (3D.md section 41): big furry moth wings, built once in four poses. A wing is a thin SLAB (a front sheet, a back sheet and a rim between them, so the ink outline has an edge to follow) with a
// gentle camber and a pleat between the veins, painted by the atlas (motherPaint.js FORE / HIND): a plum furry root, a lilac field, rose veins, a cream margin with dark lunules and a big eyespot with a faint teal glow.
//   forewing  a rounded triangle that narrows to the tip, a scalloped trailing edge
//   hindwing  a warmer lobe below it ending in a long curling tail (a luna moth's)
//   fur       a ruff of tufts at the root
// The four poses are the sim's stepped beat key (cr.mother.beat 0 folded, 1 half open, 2 spread, 3 down-stroke): they differ in how wide the wing is (a folded one is narrow), how its tip lifts or droops and how deep the
// camber is. Each pose is a piece of the body mesh that creatureMother.js places by a matrix (the angle about the pivot) and mirrors for the left side. Wing frame: the pivot at the origin, the leading edge along +x,
// the trailing edge below it (-y), z toward the viewer.
import { THREE } from './style.js';
import { horn } from './drakeModel.js';
import { V, hash } from './titanModel.js';
import { atlasUV } from './motherPaint.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// a sampled profile (Catmull-Rom through rows of numbers)
function prof(rows) {
  const N = rows.length;
  return (s) => {
    const f = clamp(s, 0, 1) * (N - 1), i = Math.min(N - 2, Math.floor(f)), t = f - i, p = (k) => rows[clamp(k, 0, N - 1)], t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p(i) + (-p(i - 1) + p(i + 1)) * t + (2 * p(i - 1) - 5 * p(i) + 4 * p(i + 1) - p(i + 2)) * t2 + (-p(i - 1) + 3 * p(i) - 3 * p(i + 1) + p(i + 2)) * t3);
  };
}
const FORE_W = prof([0.78, 0.92, 1.0, 0.96, 0.84, 0.64, 0.4, 0.16, 0.0]); // the forewing's width along the span (of Wd)
const HIND_W = prof([0.86, 1.0, 0.94, 0.72, 0.44, 0.2, 0.1, 0.07, 0.05]); // the hindwing's width (the last stretch is the tail)

// the poses: len = how long (a folded wing is shorter: it is tucked), wk = how wide, lift = how the tip rises (+) or droops (-) (of L), camber = how deep, curl = how far the folded wing curls round (z)
export const POSES = [
  { len: 0.52, wk: 0.42, lift: -0.02, camber: 1.5, curl: 0.5 }, // folded, hanging down the cap's side
  { len: 0.8, wk: 0.68, lift: 0.0, camber: 1.2, curl: 0.2 }, // half open
  { len: 1.0, wk: 1.0, lift: 0.07, camber: 1.0, curl: 0 }, // spread
  { len: 0.94, wk: 0.86, lift: -0.12, camber: 1.6, curl: 0.1 }, // down-stroke: the tip bends down
];

// ---- a slab from a surface -------------------------------------------------------------------------------------------------------------------------------------------------------------------
// fn(s, c, out) puts the middle surface's point in out; s runs along the span (root 0 to tip 1), c across (leading edge 0 to trailing edge 1). Returns a BufferGeometry (position, normal, uv = (s, c)): the front sheet,
// the back sheet (thick behind it) and the rim. Triangles are wound to agree with their normals.
const REC = {}; // the winding of every triangle of a slab, recorded the first time it is built: every pose of a wing then has the same vertex order (so the painting stays where it is)
function slab(nS, nC, fn, thick, key) {
  const flips = REC[key] || (REC[key] = { arr: [], done: false });
  let fi = 0;
  const P = [], pos = [], nor = [], uv = [];
  const q = V();
  for (let i = 0; i <= nS; i++) { P.push([]); for (let j = 0; j <= nC; j++) { fn(i / nS, j / nC, q); P[i].push(q.clone()); } }
  const at = (i, j) => P[clamp(i, 0, nS)][clamp(j, 0, nC)];
  const nrm = (i, j) => { const ds = at(i + 1, j).clone().sub(at(i - 1, j)), dc = at(i, j + 1).clone().sub(at(i, j - 1)), n = dc.cross(ds); if (n.lengthSq() < 1e-9) n.set(0, 0, 1); n.normalize(); if (n.z < 0) n.negate(); return n; };
  const NN = []; for (let i = 0; i <= nS; i++) { NN.push([]); for (let j = 0; j <= nC; j++) NN[i].push(nrm(i, j)); }
  const h = thick / 2, a = V(), b = V(), c = V();
  const tri = (pa, pb, pc, na, nb, nc, ua, ub, uc) => {
    a.copy(pb).sub(pa); b.copy(pc).sub(pa); c.copy(a).cross(b);
    const avg = na.clone().add(nb).add(nc);
    let flip;
    if (flips.done) flip = flips.arr[fi++]; else { flip = c.dot(avg) < 0; flips.arr.push(flip); }
    const order = flip ? [[pa, na, ua], [pc, nc, uc], [pb, nb, ub]] : [[pa, na, ua], [pb, nb, ub], [pc, nc, uc]];
    for (const [p, n, u] of order) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u[0], u[1]); }
  };
  const front = (i, j) => at(i, j).clone().add(V(0, 0, h)), back = (i, j) => at(i, j).clone().add(V(0, 0, -h));
  const nb = (i, j) => NN[i][j].clone().negate();
  for (let i = 0; i < nS; i++) for (let j = 0; j < nC; j++) {
    const u00 = [i / nS, j / nC], u10 = [(i + 1) / nS, j / nC], u11 = [(i + 1) / nS, (j + 1) / nC], u01 = [i / nS, (j + 1) / nC];
    tri(front(i, j), front(i + 1, j), front(i + 1, j + 1), NN[i][j], NN[i + 1][j], NN[i + 1][j + 1], u00, u10, u11);
    tri(front(i, j), front(i + 1, j + 1), front(i, j + 1), NN[i][j], NN[i + 1][j + 1], NN[i][j + 1], u00, u11, u01);
    tri(back(i, j), back(i + 1, j), back(i + 1, j + 1), nb(i, j), nb(i + 1, j), nb(i + 1, j + 1), u00, u10, u11);
    tri(back(i, j), back(i + 1, j + 1), back(i, j + 1), nb(i, j), nb(i + 1, j + 1), nb(i, j + 1), u00, u11, u01);
  }
  // the rim: along the four edges, a strip from the front sheet to the back sheet whose normal points out of the wing in its own plane
  const edge = (cells, outDir) => {
    for (let k = 0; k < cells.length - 1; k++) {
      const [i0, j0] = cells[k], [i1, j1] = cells[k + 1];
      const m0 = outDir(i0, j0), m1 = outDir(i1, j1);
      const u0 = [i0 / nS, j0 / nC], u1 = [i1 / nS, j1 / nC];
      tri(front(i0, j0), back(i0, j0), back(i1, j1), m0, m0, m1, u0, u0, u1);
      tri(front(i0, j0), back(i1, j1), front(i1, j1), m0, m1, m1, u0, u1, u1);
    }
  };
  const outward = (kind) => (i, j) => { // the in-plane normal at a boundary cell: along the cross direction of the edge (kind 'c' for the edges at c = 0 and 1, 's' for the root and the tip), pointing away from the middle
    const d = kind === 'c' ? at(i, j + 1).clone().sub(at(i, j - 1)) : at(i + 1, j).clone().sub(at(i - 1, j));
    const mid = at(Math.round(nS / 2), Math.round(nC / 2)), out = at(i, j).clone().sub(mid);
    out.z = 0; d.z = 0;
    const n = d.lengthSq() < 1e-9 ? out : d;
    n.normalize();
    if (n.dot(out) < 0) n.negate();
    return n;
  };
  const row = (j) => Array.from({ length: nS + 1 }, (_, i) => [i, j]), col = (i) => Array.from({ length: nC + 1 }, (_, j) => [i, j]);
  edge(row(0), outward('c')); edge(row(nC), outward('c')); edge(col(0), outward('s')); edge(col(nS), outward('s'));
  flips.done = true;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  return g;
}

// ---- the forewing ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function foreWingGeo(L, pose, low) {
  const Wd = 0.62 * L * pose.wk, nS = low ? 10 : 16, nC = low ? 6 : 10;
  const scallop = (s) => Math.pow(Math.abs(Math.sin(s * Math.PI * 6.5)), 0.7);
  const fn = (s, c, out) => {
    const edgeY = L * (0.05 * Math.sin(Math.PI * 0.9 * s) - 0.05 * s * s) + L * pose.lift * s * s;
    const w = Wd * FORE_W(s) * (1 - 0.085 * scallop(s) * s);
    const x = s * L * (1 - 0.05 * c * s * (1 - pose.wk * 0.5)), y = edgeY - c * w;
    const pleat = 0.006 * L * Math.sin(c * Math.PI * 9) * s * (0.5 + 0.5 * pose.wk);
    const z = L * 0.06 * pose.camber * (0.5 - c) * (1 - 0.55 * s) + pleat - L * (0.04 * s) + L * pose.curl * 0.1 * c * (1 - s);
    out.set(x, y, z);
  };
  return slab(nS, nC, fn, 26, 'fore' + (low ? 1 : 0));
}
// ---- the hindwing: rotated further down about the pivot, with a long curling tail ----
export function hindWingGeo(L, pose, low) {
  const Lh = 0.82 * L, Wd = 0.5 * L * pose.wk, nS = low ? 10 : 14, nC = low ? 5 : 8, rot = -0.46;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const fn = (s, c, out) => {
    const edgeY = L * 0.02 * Math.sin(Math.PI * s) - L * 0.03 * s * s * 0 + L * pose.lift * 0.4 * s * s;
    const w = Wd * HIND_W(s) * (1 - 0.06 * Math.abs(Math.sin(s * Math.PI * 4.5)) * Math.min(1, s * 1.6));
    let x = s * Lh, y = edgeY - c * w;
    if (s > 0.8) y -= L * 0.07 * Math.pow((s - 0.8) / 0.2, 2); // the tail curls down
    out.set(x * cs - y * sn, x * sn + y * cs, -70 - L * 0.012 * Math.sin(c * Math.PI * 7) * s + L * 0.03 * (0.5 - c) * pose.camber);
  };
  return slab(nS, nC, fn, 22, 'hind' + (low ? 1 : 0));
}

// the whole wing of one pose into a Mesher (fore + hind + the fur at the root): flat vertex colours are not used: the atlas paints them
export function addWing(mesh, P, L, pi, name, low, mirror = false) {
  const pose = POSES[pi], OW = (P.INK || 22) * 0.7, v0 = mesh.verts;
  L *= pose.len;
  const fore = foreWingGeo(L, pose, low), hind = hindWingGeo(L, pose, low);
  mesh.add(fore, null, { ow: OW, name, uv: (u, v) => atlasUV('fore', u, v) });
  mesh.add(hind, null, { ow: OW, name, uv: (u, v) => atlasUV('hind', u, v) });
  // tufts of fur along the root: short blades laid along the leading edge and toward the trailing edge, behind the cap's rim
  const n = low ? 6 : 10;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), base = V(L * (0.02 + 0.2 * u), -L * 0.1 * Math.sin(u * 2.6) * pose.wk * 0.6, 20), d = V(0.8 - 0.5 * u, -0.5 - 0.5 * pose.wk * u, 0.15), col = hash(7, k) < 0.5 ? P.fur : P.furDk;
    mesh.add(horn(base, d, L * (0.1 + 0.05 * hash(3, k)), L * 0.028, { sides: 4, rings: 1, endR: 0, flat: 0.6 }).g, null, { color: col, ow: OW * 0.35, name });
  }
  if (mirror) mirrorRange(mesh, v0, mesh.verts);
}
// the left wing is the right wing turned inside out: x negated, and two corners of every triangle swapped (in every attribute) so it still faces out
function mirrorRange(mesh, v0, v1) {
  for (let v = v0; v < v1; v++) { mesh.P[v * 3] = -mesh.P[v * 3]; mesh.N[v * 3] = -mesh.N[v * 3]; mesh.O[v * 3] = -mesh.O[v * 3]; }
  const swap = (arr, k, a, b) => { for (let c = 0; c < k; c++) { const t = arr[a * k + c]; arr[a * k + c] = arr[b * k + c]; arr[b * k + c] = t; } };
  for (let v = v0; v + 2 < v1; v += 3) for (const [arr, k] of [[mesh.P, 3], [mesh.N, 3], [mesh.UV, 2], [mesh.C, 3], [mesh.G, 1], [mesh.O, 3]]) swap(arr, k, v + 1, v + 2);
}
void TAU; void lerp; void smooth;
