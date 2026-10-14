// THE RIME WYRM'S BODY IN 3D (3D.md section 40): the models. Everything here is built once, in each piece's own frame (x along the piece, y UP, z toward the viewer) and never moves by itself; the extension
// (creatureWyrm.js) places each piece from the sim's parts every frame with a matrix (a RigidSet). Sizes are the sim's game px from config.CREATURES.WYRM, so the picture and the hit capsules agree.
//   buildWyrmBody(cr, P)       the generic view's still "head" record: nothing (a degenerate triangle, never drawn): every piece of the Wyrm moves, so all of it is in the two sets below
//   buildWyrmPieces(cr, P)     BODY set (opaque, toon + ink): 12 SEGMENTS (a tapered tube of dark blue-grey scales with a pale belly, a ball joint, back plates), their cold SEAM bands (glow channel 3: shown on a bare
//                              segment), the COLLAR (a vertical capsule standing out of the cliff, scales and a pale belly strip on the side facing the ship), the UNDERBELLY plate with its pink heart (glow channel 4),
//                              the horned SKULL with glowing icy eyes (channel 1), the hinged upper and lower JAW with fangs, the THROAT wedge (channel 2: icy blue when the maw opens) and the lip seam
//                              ICE set (translucent, one material): for the 12 segments, the collar and the head, a FULL shell (thick, faceted, with crystals and icicles), a CRACKED shell (bitten, with crack lines), and
//                              FROST PATCHES (a few slabs); and the frost on a shut snout
// The ink outline comes from the Mesher's onormal. Flat-coloured pieces point at the hide texture's plain swatch and take their colour from the vertices.
import { THREE } from './style.js';
import { Mesher, RigidSet, SWATCH } from './creatureKit.js';
import { loft, horn } from './drakeModel.js';
import { V, M4, hash, rockGeo, stoneUV, ringYZ } from './titanModel.js';
import { HIDE_TILE } from './wyrmPaint.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const _c = new THREE.Color();
export const RZK = 0.86; // a segment is a little flatter in depth than it is tall
export const ICE_INK = 9; // the ink on the ice's crystals (the shells themselves have none: they are see-through)

// ---- the sim's chain, as the sim makes it (creatures/wyrm.js wyrmDef) ------------------------------------------------------------------------------------------------------------------------------
export function chainOf(W) {
  const B = W.BODY.LIMB, n = B.SEGS, out = [];
  for (let j = 0; j < n; j++) {
    const u = j / n, u1 = (j + 1) / n;
    out.push({ len: B.LEN[0] + (B.LEN[1] - B.LEN[0]) * (j / Math.max(1, n - 1)), r0: B.R[0] * Math.pow(B.R[1] / B.R[0], u), r1: B.R[0] * Math.pow(B.R[1] / B.R[0], u1) });
  }
  return out;
}

// ---- helpers --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// flat-shaded triangles into a Mesher: tris = [{ p: [V, V, V], c: '#hex' }]; the ink vector at a corner is the average of the face normals there (so the outline has no gaps)
function emit(mesh, tris, o = {}) {
  const ow = o.ow || 0, glow = o.glow || 0, uv = o.uv || SWATCH, start = mesh.verts;
  if (o.convex) { // (a closed solid: every face is turned to look away from its middle)
    const c = V(); let n = 0; for (const t of tris) for (const p of t.p) { c.add(p); n++; }
    c.multiplyScalar(1 / Math.max(1, n));
    for (const t of tris) { const nm = t.p[1].clone().sub(t.p[0]).cross(t.p[2].clone().sub(t.p[0])), g = t.p[0].clone().add(t.p[1]).add(t.p[2]).multiplyScalar(1 / 3); if (nm.dot(g.sub(c)) < 0) t.p = [t.p[0], t.p[2], t.p[1]]; }
  }
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
// a shell of faceted ice from rings of points (each ring a closed loop of the same length): quads of two triangles, each face its own shade of ice; bites: [[ring, corner], ...] drop the faces round them
function shell(mesh, rings, P, { seed = 1, bites = [], ow = 0, name, tones = null, capA = true, capB = true } = {}) {
  const tris = [], nR = rings.length, N = rings[0].length;
  const tone = tones || [P.ice, P.ice, P.iceMid, P.iceLt, P.iceDk];
  const ctr = rings.map((r) => { const c = V(); r.forEach((p) => c.add(p)); return c.multiplyScalar(1 / N); });
  const push = (a, b, c, col, ref) => { const n = b.clone().sub(a).cross(c.clone().sub(a)), g = a.clone().add(b).add(c).multiplyScalar(1 / 3); if (n.dot(g.sub(ref)) < 0) tris.push({ p: [a, c, b], c: col }); else tris.push({ p: [a, b, c], c: col }); }; // (turned to look away from `ref`, a point inside)
  for (let i = 0; i < nR - 1; i++) for (let j = 0; j < N; j++) {
    if (bites.some(([bi, bj]) => bi === i && ((j - bj + N) % N <= 1))) continue;
    const a = rings[i][j], b = rings[i][(j + 1) % N], c = rings[i + 1][(j + 1) % N], d = rings[i + 1][j], col = tone[Math.floor(hash(seed, i * 17 + j, 3) * tone.length)];
    push(a, b, c, col, ctr[i]); push(a, c, d, tone[Math.floor(hash(seed, i * 17 + j, 4) * tone.length)], ctr[i]);
  }
  const cap = (ring, k, ref) => { for (let j = 0; j < N; j++) { const a = ring[j], b = ring[(j + 1) % N], col = tone[Math.floor(hash(seed, 900 + k * 7 + j) * tone.length)]; push(ctr[k], a, b, col, ref); } };
  if (capA) cap(rings[0], 0, ctr[1]);
  if (capB) cap(rings[nR - 1], nR - 1, ctr[nR - 2]);
  emit(mesh, tris, { ow, name });
}
const coneAt = (mesh, base, dir, len, w, color, ow, name, sides = 4, flat = 1) => { const h = horn(base, dir, len, w, { sides, rings: 1, endR: 0, flat }); mesh.add(h.g, null, { color, ow, name }); };
const lerp = (a, b, u) => a + (b - a) * u;

// a tapered tube along +x: radius r(x) (round in y, RZK of it in z), from x0 to x1; belly at the bottom (v = 0.5), back at the top (v = 0, 1)
function tubeGrid(mesh, { L, r0, r1, rzK = RZK, x0 = 0, x1 = L, nU = 5, nV = 14, name, ow, color = '#ffffff', off = 0 }) {
  const rAt = (x) => lerp(r0, r1, clamp(x / L, 0, 1)), C = Math.PI * (r0 + r1) * 0.5 * (1 + rzK) * 0.5 * 2; // (the tile along the tube is as long as the way round it: the scales are round)
  mesh.grid(nU, nV, (u, v, out) => { const x = lerp(x0, x1, u), r = rAt(x), a = v * TAU; out.set(x, r * Math.cos(a), r * rzK * Math.sin(a)); }, null, { color, ow, name }, (u, v) => [(lerp(x0, x1, u) + off) / C, v], true);
}
function ballGrid(mesh, { x, r, rzK = RZK, nU = 4, nV = 14, name, ow, off = 0 }) { // the forward half of a sphere at x (covers the gap at a bend)
  const C = Math.PI * r * (1 + rzK);
  mesh.grid(nU, nV, (u, v, out) => { const f = (Math.PI / 2) * (1 - u), a = v * TAU, rr = r * Math.sin(f); out.set(x + r * Math.cos(f), rr * Math.cos(a), rr * rzK * Math.sin(a)); }, null, { color: '#ffffff', ow, name }, (u, v) => [(x + r * Math.cos((Math.PI / 2) * (1 - u)) + off) / C, v], true);
}

// ---- one segment: base joint at the origin, +x along the segment ---------------------------------------------------------------------------------------------------------------------------------
function addSegment(mesh, P, i, d, low) {
  const { len: L, r0, r1 } = d, OW = P.INK || 22, name = 'b' + i, nV = low ? 10 : 14, off = i * 331;
  tubeGrid(mesh, { L, r0, r1, x0: -L * 0.05, x1: L, nU: low ? 3 : 5, nV, name, ow: OW, off });
  ballGrid(mesh, { x: L, r: r1, nU: low ? 2 : 4, nV, name, ow: OW, off });
  // back plates: dark flat blades along the spine, leaning back toward the root
  for (const [u, k] of [[0.2, 0.55], [0.52, 0.68], [0.84, 0.5]]) {
    const x = L * u, r = lerp(r0, r1, u), h = r * (0.5 + 0.18 * hash(i, k * 10)), h2 = horn(V(x + r * 0.2, r * 0.9, 0), V(-0.3, 1, 0), h, r * 0.3, { sides: 4, rings: 2, endR: 0, flat: 0.32 });
    mesh.add(h2.g, null, { color: P.plate, ow: OW * 0.5, name });
  }
  // the cold seams (channel 3): two thin rings round the segment and a line along the belly: shown only when the segment is bare
  const gn = 'g' + i;
  for (const u of [0.32, 0.7]) {
    const x = L * u, r = lerp(r0, r1, u) * 1.012;
    mesh.add(new THREE.TorusGeometry(r, 7, 5, low ? 14 : 22), M4(V(x, 0, 0), qy(Math.PI / 2), V(RZK, 1, 1)), { color: P.seam, glow: 3, name: gn });
  }
  mesh.add(new THREE.BoxGeometry(L * 0.86, 9, 70), M4(V(L * 0.5, -lerp(r0, r1, 0.5) * 0.99, 0)), { color: P.seam, glow: 3, name: gn });
}

// ---- the ice of a tube segment: FULL (a thick faceted shell with crystals and icicles), CRACKED (a bite out of it and crack lines), PATCHES (a few slabs) -------------------------------------------------------
function addSegmentIce(mesh, P, i, d, low) {
  const { len: L, r0, r1 } = d, N = low ? 6 : 7, K = 4, rAt = (x) => lerp(r0, r1, clamp(x / L, 0, 1)), sd = 50 + i * 7;
  const ring = (k, scale) => { // ring k of the shell: a polygon of N corners with a little radial jitter
    const x = lerp(-L * 0.06, L * 1.06, k / K), r = rAt(x) * 1.2 * scale, out = [];
    for (let j = 0; j < N; j++) { const a = (j / N) * TAU + 0.25 * (k % 2), q = 1 + (hash(sd, k * 13 + j) - 0.5) * 0.2; out.push(V(x, r * q * Math.cos(a), r * RZK * q * Math.sin(a))); }
    return out;
  };
  const rings = []; for (let k = 0; k <= K; k++) rings.push(ring(k, k === 0 || k === K ? 0.82 : 1));
  const crystals = (nm, k0) => {
    for (let k = 0; k < 3; k++) { const u = 0.15 + 0.35 * k + 0.05 * hash(sd, k), x = L * u, r = rAt(x) * 1.2; coneAt(mesh, V(x, r * 0.93, 0), V(0.18, 1, 0.1 * (k - 1)), r * (0.5 + 0.2 * hash(sd, k + 5)), r * 0.2, P.iceLt, ICE_INK, nm); } // (crystals up the spine)
    for (let k = 0; k < 3; k++) { const u = 0.2 + 0.3 * k + 0.05 * hash(sd, k + 9), x = L * u, r = rAt(x) * 1.2; coneAt(mesh, V(x, -r * 0.9, r * 0.1 * (k - 1)), V(0.05, -1, 0), r * (0.7 + 0.35 * hash(sd, k + 2) - 0.1 * k0), r * 0.14, k % 2 ? P.ice : P.iceLt, ICE_INK, nm); } // (icicles hang under it)
  };
  shell(mesh, rings, P, { seed: sd, name: 'i' + i + 'F' });
  crystals('i' + i + 'F', 0);
  const rings2 = []; for (let k = 0; k <= K; k++) rings2.push(ring(k, k === 0 || k === K ? 0.82 : 1));
  shell(mesh, rings2, P, { seed: sd + 3, bites: [[1, 1], [2, 4], [2, 5]], name: 'i' + i + 'C', tones: [P.ice, P.iceMid, P.iceMid, P.iceLt, P.iceDk, P.iceDk] });
  crystals('i' + i + 'C', 1);
  { // the cracks: thin dark strips laid on the shell
    const nm = 'i' + i + 'C', pts = [[0.18, 0.8, 0.3], [0.3, 1.2, 0.5], [0.42, 0.7, 0.3], [0.56, 1.1, 0.5]];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], pa = V(L * a[0], rAt(L * a[0]) * 1.2 * Math.cos(a[1]), rAt(L * a[0]) * 1.2 * RZK * Math.sin(a[1])), pb = V(L * b[0], rAt(L * b[0]) * 1.2 * Math.cos(b[1]), rAt(L * b[0]) * 1.2 * RZK * Math.sin(b[1]));
      const dir = pb.clone().sub(pa), len = dir.length(), q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.normalize());
      mesh.add(new THREE.BoxGeometry(len, 12, 10), M4(pa.clone().add(pb).multiplyScalar(0.5).multiplyScalar(1.03), q), { color: P.crack, name: nm });
    }
  }
  for (let s = 0; s < (low ? 4 : 6); s++) { // frost patches: low faceted slabs stuck on the back and flanks
    const nm = 'i' + i + 'P', u = 0.1 + 0.8 * hash(sd, 60 + s), x = L * u, r = rAt(x), a = (hash(sd, 70 + s) - 0.5) * 2.6, w = r * (0.28 + 0.3 * hash(sd, 80 + s)), h = r * (0.16 + 0.12 * hash(sd, 90 + s));
    const nrm = V(0, Math.cos(a), RZK * Math.sin(a)).normalize(), pos = V(x, r * 1.0 * Math.cos(a), r * RZK * Math.sin(a)).addScaledVector(nrm, h * 0.5), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm);
    mesh.add(rockGeo(1, 1, 1, { detail: 0, jitter: 0.3, seed: sd + s }), M4(pos, q, V(w, h, w * 0.9)), { color: s % 2 ? P.iceLt : P.ice, ow: ICE_INK * 0.5, name: nm });
    if (s < 2) coneAt(mesh, V(x, r * 0.95, 0), V(0.2, 1, 0), r * 0.4, r * 0.13, P.iceLt, ICE_INK, nm);
  }
}

// ---- the collar: the top of its straight part (the centre of its round top) at the origin, the axis down -y, +x toward the ship (the pale belly side), the depth in z -------------------------------------------------
function addCollar(mesh, P, C, low) {
  const rx = C.r, rz = C.r * 0.73, len = C.len, OW = (P.INK || 22) * 1.1, nV = low ? 12 : 18, Cc = Math.PI * (rx + rz); // (it stands behind the cliff's face: kept flat in z)
  const ang = (v) => (v - 0.5) * TAU + 0.6; // the pale belly (v = 0.5) faces the ship and a little toward the viewer
  mesh.grid(low ? 3 : 5, nV, (u, v, out) => { const f = (Math.PI / 2) * u, a = ang(v), rr = Math.sin(f); out.set(rx * rr * Math.cos(a), rx * Math.cos(f), rz * rr * Math.sin(a)); }, null, { color: '#ffffff', ow: OW, name: 'collar' }, (u, v) => [(rx * (Math.PI / 2) * u) / Cc, v], true);
  mesh.grid(low ? 3 : 6, nV, (u, v, out) => { const a = ang(v); out.set(rx * Math.cos(a), -len * u, rz * Math.sin(a)); }, null, { color: '#ffffff', ow: OW, name: 'collar' }, (u, v) => [(rx * Math.PI / 2 + len * u) / Cc, v], true);
  // dark plate bands round it and a few back plates on the far side (away from the ship)
  for (let k = 0; k < 4; k++) mesh.add(new THREE.TorusGeometry(1, 0.012, 4, 20), M4(V(0, -len * (0.2 + 0.22 * k), 0), qx(Math.PI / 2), V(rx * 1.012, rz * 1.012, rx)), { color: P.plate, name: 'collar' }); // (a thin dark ring: a plate seam)
  for (let k = 0; k < 4; k++) { const y = -len * (0.1 + 0.25 * k), a = Math.PI - 0.5; coneAt(mesh, V(rx * 0.97 * Math.cos(a) * 0.95, y, rz * Math.sin(a) * 0.55), V(-1, 0.35, 0.2), rx * (0.32 - 0.03 * k), rx * 0.15, P.plate, OW * 0.5, 'collar', 4, 0.5); }
  mesh.add(new THREE.TorusGeometry(rx * 0.98, 7, 5, low ? 14 : 24), M4(V(0, -len * 0.3, 0), qx(Math.PI / 2), V(1, rz / rx, 1)), { color: P.seam, glow: 3, name: 'cg' });
}
function addCollarIce(mesh, P, C, low) {
  const N = low ? 8 : 10, rx = C.r * 1.14, rz = C.r * 0.73 * 1.16, len = C.len, sd = 21;
  const ring = (y, scale, k) => { const out = []; for (let j = 0; j < N; j++) { const a = (j / N) * TAU + 0.2 * (k % 2), q = 1 + (hash(sd, k * 11 + j) - 0.5) * 0.18; out.push(V(rx * scale * q * Math.cos(a), y, rz * scale * q * Math.sin(a))); } return out; };
  const rings = [ring(rx * 1.02, 0.25, 0), ring(rx * 0.86, 0.72, 1), ring(rx * 0.5, 0.97, 2), ring(rx * 0.05, 1.04, 3), ring(-len * 0.35, 1.04, 4), ring(-len * 0.7, 1.04, 5), ring(-len, 1.02, 6)];
  shell(mesh, rings, P, { seed: sd, name: 'cF', capA: true, capB: false });
  for (let k = 0; k < 4; k++) coneAt(mesh, V(-rx * (0.8 - 0.4 * k), rx * 0.78 - k * 80, rz * 0.4), V(-0.45 + 0.3 * k, 1, 0.2), rx * (0.7 - 0.08 * k), rx * 0.2, k % 2 ? P.ice : P.iceLt, ICE_INK, 'cF'); // (a crown of crystals)
  for (let k = 0; k < 5; k++) coneAt(mesh, V(rx * (-0.6 + 0.3 * k), -len * (0.05 + 0.2 * k % 0.6) - 60, rz * 0.9), V(0.1, -1, 0.1), rx * (0.7 - 0.07 * k), rx * 0.1, k % 2 ? P.iceLt : P.ice, ICE_INK, 'cF'); // (icicles on its flank)
  const rings2 = [ring(rx * 1.02, 0.25, 0), ring(rx * 0.86, 0.72, 1), ring(rx * 0.5, 0.97, 2), ring(rx * 0.05, 1.04, 3), ring(-len * 0.35, 1.04, 4), ring(-len * 0.7, 1.04, 5), ring(-len, 1.02, 6)];
  shell(mesh, rings2, P, { seed: sd + 3, bites: [[1, 2], [2, 6], [3, 1], [4, 5]], name: 'cC', capA: true, capB: false, tones: [P.ice, P.iceMid, P.iceMid, P.iceLt, P.iceDk, P.iceDk] });
  for (let k = 0; k < 3; k++) coneAt(mesh, V(-rx * (0.7 - 0.5 * k), rx * 0.75, rz * 0.4), V(-0.4 + 0.3 * k, 1, 0.2), rx * (0.55 - 0.08 * k), rx * 0.17, P.ice, ICE_INK, 'cC');
  for (let s = 0; s < 6; s++) { // frost patches
    const a = (hash(sd, 40 + s) - 0.5) * 3 + 0.4, y = -len * hash(sd, 50 + s) + 220, nrm = V(Math.cos(a) * 0.8, 0.15, Math.sin(a) * 1.2).normalize(), w = rx * (0.22 + 0.2 * hash(sd, 60 + s)), pos = V(rx * Math.cos(a), y, rz * Math.sin(a)).addScaledVector(nrm, 30), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), nrm);
    mesh.add(rockGeo(1, 1, 1, { detail: 0, jitter: 0.3, seed: 20 + s }), M4(pos, q, V(w, w * 0.4, w * 0.9)), { color: s % 2 ? P.iceLt : P.ice, ow: ICE_INK * 0.5, name: 'cP' });
  }
  for (let k = 0; k < 2; k++) coneAt(mesh, V(-rx * (0.3 - 0.5 * k), rx * 0.95, 0), V(0.1, 1, 0), rx * 0.5, rx * 0.16, P.iceLt, ICE_INK, 'cP');
}

// ---- the underbelly (phase 3): a soft pale plate where the ice has fallen from the collar's flank, a pink heart in its middle (channel 4), a few dark scale tips round it ---------------------------------------
function addBelly(mesh, P, R, low) {
  const OW = (P.INK || 22) * 0.8;
  mesh.add(rockGeo(1, 1, 1, { detail: low ? 0 : 1, jitter: 0.04, seed: 5 }), M4(V(0, 0, 0), null, V(R * 1.02, R * 1.0, R * 0.34)), { color: P.belly, ow: OW, name: 'belly' });
  mesh.add(new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 8), M4(V(0, 0, R * 0.2), null, V(R * 0.5, R * 0.5, R * 0.22)), { color: P.soft, glow: 4, ow: OW * 0.5, name: 'belly' });
  for (const [x, y] of [[-0.78, 0.2], [0.78, 0.25], [-0.5, -0.78], [0.55, -0.8], [0, 0.95]]) coneAt(mesh, V(x * R, y * R, R * 0.1), V(x, y, 0.5), R * 0.42, R * 0.14, P.plate, OW * 0.5, 'belly');
  mesh.add(new THREE.TorusGeometry(R * 0.96, 8, 4, low ? 10 : 16), M4(V(0, 0, R * 0.04), null, V(1.03, 1, 0.4)), { color: P.bellyDk, name: 'belly' });
}

// ---- the head: the neck joint at the origin, +x forward ------------------------------------------------------------------------------------------------------------------------------------------
const SKULL = (len, r) => [[-0.1 * len, 0.7 * r, -0.65 * r], [0, 0.88 * r, -0.82 * r], [0.3 * len, 1.0 * r, -0.95 * r], [0.78 * len, 0.62 * r, -0.52 * r], [len, 0.36 * r, -0.32 * r]];
function addSkull(mesh, P, H, low) {
  const { len, r } = H, OW = (P.INK || 22), st = SKULL(len, r);
  const rings = st.map(([x, top, bot], i) => ringYZ(low ? 8 : 10, x, top, bot, 0.82 * (top - bot) * 0.5, { jitter: 0.02, seed: 4, k: i }));
  mesh.add(stoneUV(loft(rings, true), 0, 0, 1 / 760), null, { color: '#ffffff', ow: OW, name: 'skull', uv: (u, v) => [u, v] });
  // a heavy brow over each eye, a ridge of crest blades along the crown, the swept-back horns
  for (const s of [1, -1]) {
    mesh.add(new THREE.BoxGeometry(0.34 * len, 0.1 * r, 0.22 * r), M4(V(0.45 * len, 0.5 * r, s * 0.66 * r), qz(-0.12)), { color: P.plate, ow: OW * 0.5, name: 'skull' });
    const h = horn(V(0.1 * len, 0.62 * r, s * 0.4 * r), V(-0.8, 0.55, s * 0.45), 1.85 * r, 0.24 * r, { sides: 5, rings: 5, endR: 0, curve: 0.22, bend: V(0, 1, 0) });
    mesh.add(h.g, null, { color: P.horn, ow: OW * 0.8, name: 'skull' });
    const h2 = horn(V(0.2 * len, 0.5 * r, s * 0.52 * r), V(-0.55, 0.2, s * 0.8), 0.9 * r, 0.14 * r, { sides: 4, rings: 3, endR: 0, curve: 0.15, bend: V(0, 1, 0) }); // (a smaller horn below)
    mesh.add(h2.g, null, { color: P.hornLt, ow: OW * 0.5, name: 'skull' });
  }
  for (let k = 0; k < 4; k++) coneAt(mesh, V((0.34 + 0.14 * k) * len, (0.98 - 0.15 * k) * r, 0), V(-0.25, 1, 0), (0.6 - 0.07 * k) * r, 0.17 * r, P.horn, OW * 0.5, 'skull', 4, 0.45);
  // the eyes: an icy glowing ball (channel 1) in a dark socket on each side; a nostril on top of the snout
  for (const s of [1, -1]) {
    mesh.add(rockGeo(1, 1, 1, { detail: 1, jitter: 0.08, seed: 9 }), M4(V(0.45 * len, 0.2 * r, s * 0.7 * r), null, V(0.26 * r, 0.22 * r, 0.14 * r)), { color: P.plate, name: 'skull' });
    mesh.add(new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 8), M4(V(0.47 * len, 0.2 * r, s * 0.76 * r), null, V(0.2 * r, 0.17 * r, 0.1 * r)), { color: P.eye, glow: 1, name: 'skull' });
    mesh.add(new THREE.SphereGeometry(1, 8, 6), M4(V(0.5 * len, 0.2 * r, s * 0.84 * r), null, V(0.06 * r, 0.1 * r, 0.04 * r)), { color: P.eyeDk, name: 'skull' });
  }
  mesh.add(new THREE.SphereGeometry(1, 6, 4), M4(V(0.93 * len, 0.3 * r, 0.12 * r), null, V(0.06 * r, 0.04 * r, 0.05 * r)), { color: P.plate, name: 'skull' });
  mesh.add(new THREE.SphereGeometry(1, 6, 4), M4(V(0.93 * len, 0.3 * r, -0.12 * r), null, V(0.06 * r, 0.04 * r, 0.05 * r)), { color: P.plate, name: 'skull' });
}
function addHeadIce(mesh, P, H, low) {
  const { len, r } = H, N = low ? 7 : 9, st = SKULL(len, r), sd = 31;
  const mk = (seed) => st.map(([x, top, bot], i) => { const out = [], w = 0.82 * (top - bot) * 0.5, cy = (top + bot) / 2, hh = (top - bot) / 2; for (let j = 0; j < N; j++) { const a = (j / N) * TAU + 0.2 * (i % 2), q = (1 + (hash(seed, i * 11 + j) - 0.5) * 0.18) * 1.22 * (i === 0 || i === st.length - 1 ? 0.8 : 1); out.push(V(x, cy + hh * q * Math.cos(a), w * q * Math.sin(a))); } return out; });
  shell(mesh, mk(sd), P, { seed: sd, name: 'hF' });
  for (let k = 0; k < 5; k++) coneAt(mesh, V((0.08 + 0.16 * k) * len, (1.06 - 0.12 * k) * r, 0), V(-0.15 + 0.1 * k, 1, 0), (0.85 - 0.1 * k) * r, 0.2 * r, k % 2 ? P.ice : P.iceLt, ICE_INK, 'hF');
  shell(mesh, mk(sd + 3), P, { seed: sd + 3, bites: [[1, 1], [2, 4], [2, 5], [3, 0]], name: 'hC', tones: [P.ice, P.iceMid, P.iceMid, P.iceLt, P.iceDk, P.iceDk] });
  for (let k = 0; k < 3; k++) coneAt(mesh, V((0.1 + 0.2 * k) * len, (1.0 - 0.14 * k) * r, 0), V(-0.15, 1, 0), (0.6 - 0.08 * k) * r, 0.17 * r, P.ice, ICE_INK, 'hC');
  for (let s = 0; s < 5; s++) { const a = (hash(sd, 40 + s) - 0.5) * 2.4, x = len * (0.1 + 0.6 * hash(sd, 50 + s)), w = r * (0.2 + 0.16 * hash(sd, 60 + s)), pos = V(x, r * 0.9 * Math.cos(a), r * 0.8 * Math.sin(a)); mesh.add(rockGeo(1, 1, 1, { detail: 0, jitter: 0.3, seed: 60 + s }), M4(pos, qz(0), V(w, w * 0.5, w)), { color: s % 2 ? P.iceLt : P.ice, ow: ICE_INK * 0.5, name: 'hP' }); }
  coneAt(mesh, V(0.3 * len, 0.95 * r, 0), V(-0.1, 1, 0), 0.5 * r, 0.14 * r, P.iceLt, ICE_INK, 'hP');
}

// ---- the jaws: the hinge at the origin, +x along the jaw (the mouth part's frame) -------------------------------------------------------------------------------------------------------------------
function addJaw(mesh, P, R, sgn, nm, color, low) {
  const J = 2.1 * R, OW = P.INK || 22, st = [[-0.5 * R, 0.5 * R, 0.5 * R], [0, 0.5 * R, 0.5 * R], [0.55 * J, 0.4 * R, 0.4 * R], [J * 0.82, 0.2 * R, 0.2 * R], [J, 0.05 * R, 0.05 * R]];
  const rings = st.map(([x, h, w], i) => { const ring = ringYZ(low ? 6 : 8, x, h, 0, w * 0.85, { jitter: 0.02, seed: 7, k: i }); return sgn > 0 ? ring : ring.map((p) => V(p.x, -p.y, p.z)); });
  mesh.add(stoneUV(loft(rings, true), 0, 0, 1 / 760), null, { color, ow: OW * 0.9, name: nm, uv: (u, v) => [u, v] });
  for (let k = 0; k < 4; k++) coneAt(mesh, V((0.55 + 0.4 * k) * R, 0, (k % 2 ? 1 : -1) * 0.12 * R), V(0, -sgn, 0), (0.46 - 0.04 * k) * R, 0.11 * R, P.fang, OW * 0.35, nm); // (fangs, pointing into the gap)
  for (let k = 0; k < 3; k++) coneAt(mesh, V((0.9 + 0.38 * k) * R, 0, (k % 2 ? -1 : 1) * 0.2 * R), V(0, -sgn, 0), 0.32 * R, 0.08 * R, P.fang, OW * 0.3, nm);
}
function addThroat(mesh, P, R) { // the wedge between the jaws: icy blue light, with a dark plum back to it; its y is scaled by the opening angle
  const J = 2.1 * R, Y = 0.9 * J * 0.717, z = 0.4 * R, tris = [], a0 = V(-0.3 * R, 0, z), a1 = V(-0.3 * R, 0, -z), t = (x, y) => [V(x, y, z), V(x, y, -z)];
  const [u0, u1] = t(0.9 * J, Y), [d0, d1] = t(0.9 * J, -Y);
  const col = P.throat;
  tris.push({ p: [a0, u0, d0], c: col }, { p: [a1, d1, u1], c: col }, { p: [a0, a1, u1], c: col }, { p: [a0, u1, u0], c: col }, { p: [a0, d0, d1], c: col }, { p: [a0, d1, a1], c: col }, { p: [u0, u1, d1], c: col }, { p: [u0, d1, d0], c: col });
  emit(mesh, tris, { glow: 2, name: 'throat', convex: true });
  const pl = [], [v0, v1] = t(0.4 * J, Y * 0.44), [w0, w1] = t(0.4 * J, -Y * 0.44), b0 = V(-0.34 * R, 0, z * 1.04), b1 = V(-0.34 * R, 0, -z * 1.04);
  pl.push({ p: [b0, v0, w0], c: P.maw }, { p: [b1, w1, v1], c: P.maw }, { p: [b0, b1, v1], c: P.maw }, { p: [b0, v1, v0], c: P.maw }, { p: [b0, w0, w1], c: P.maw }, { p: [b0, w1, b1], c: P.maw });
  emit(mesh, pl, { name: 'throat', convex: true });
}
function addLipGlow(mesh, P, R) { // the seam between the shut jaws: an icy line (channel 2): it brightens as the breath is drawn
  mesh.add(new THREE.BoxGeometry(1.9 * R, 0.07 * R, 0.62 * R), M4(V(1.05 * R, 0, 0)), { color: P.throat, glow: 2, name: 'lip' });
}
function addSnoutFrost(mesh, P, R) { // the shut maw is frost-lipped: crystals along the closed jaws (it bounces shells until it opens)
  for (let k = 0; k < 6; k++) { const x = (0.3 + 0.3 * k) * R, s = k % 2 ? 1 : -1; coneAt(mesh, V(x, 0.46 * R - 0.04 * k * R, s * 0.16 * R), V(0.12, 1, 0), (0.62 - 0.05 * k) * R, 0.17 * R, k % 2 ? P.ice : P.iceLt, ICE_INK, 'lip'); }
  mesh.add(rockGeo(1, 1, 1, { detail: 0, jitter: 0.25, seed: 12 }), M4(V(1.0 * R, 0.4 * R, 0), null, V(0.95 * R, 0.16 * R, 0.4 * R)), { color: P.ice, ow: ICE_INK * 0.5, name: 'lip' });
}

// ---- the builders ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function buildWyrmBody(cr, P, opts = {}) { // the still record the generic view expects: one degenerate triangle, drawRange 0
  const mesh = new Mesher();
  mesh.add(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3)).setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)), null, { color: '#ffffff', name: 'none' });
  const geometry = mesh.build();
  geometry.setDrawRange(0, 0);
  void cr; void opts;
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn: {}, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R: 520, L: 1400, sz: 1 }, tris: 0, dynTris: 0,
  };
}

export function buildWyrmPieces(cr, P, opts = {}) {
  const W = opts.W, low = !!opts.low, B = W.BODY, body = new Mesher(), ice = new Mesher(), chain = chainOf(W), COL = { len: B.COLLAR.LEN, r: B.COLLAR.R }, HEAD = { len: B.HEAD.LEN, r: B.HEAD.R };
  chain.forEach((d, i) => addSegment(body, P, i, d, low));
  addCollar(body, P, COL, low);
  addBelly(body, P, B.BELLY.R, low);
  addSkull(body, P, HEAD, low);
  addJaw(body, P, B.MOUTH.R, 1, 'jawU', '#ffffff', low);
  addJaw(body, P, B.MOUTH.R, -1, 'jawL', P.belly, low);
  addThroat(body, P, B.MOUTH.R);
  addLipGlow(body, P, B.MOUTH.R);
  chain.forEach((d, i) => addSegmentIce(ice, P, i, d, low));
  addCollarIce(ice, P, COL, low);
  addHeadIce(ice, P, HEAD, low);
  addSnoutFrost(ice, P, B.MOUTH.R);
  const bg = body.build(), ig = ice.build();
  return {
    body: { geometry: bg, set: new RigidSet(bg, body.ranges), ranges: body.ranges, tris: body.verts / 3 },
    ice: { geometry: ig, set: new RigidSet(ig, ice.ranges), ranges: ice.ranges, tris: ice.verts / 3 },
    chain, tris: (body.verts + ice.verts) / 3,
  };
}
export { M4, V, hash, rockGeo };
