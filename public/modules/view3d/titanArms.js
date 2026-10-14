// THE ISLAND TITAN'S ARMS IN 3D (3D.md section 38): three heavy stone SLABS per arm, each a faceted block with a ball joint at its root, a patch of moss and (once the arm is hurt) a bite out of it with cyan light in the
// cracks; a HAND at the end of the last slab (open: four stone fingers and a thumb; a fist: four knuckles round whatever it grips; broken: two stubs) and a jagged CUT face for the stump when an arm is shelled off. Every
// piece is built in its own frame (origin at the slab's root, +x along it, +y up; the hand at its wrist) so the view can place it by a matrix from the sim's own segments. Also used for the slabs of an arm that falls.
import { THREE } from './style.js';
import { loft } from './drakeModel.js';
import { stone, flat, rockGeo, blockGeo, ringYZ, V, M4, M4 as M4g, hash } from './titanModel.js';

const TAU = Math.PI * 2;
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const SEGBOX = (mesh, a, b, w, d, color, o) => {
  const dir = b.clone().sub(a), len = dir.length(), mid = a.clone().add(b).multiplyScalar(0.5);
  flat(mesh, new THREE.BoxGeometry(len, w, d), M4(mid, new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.normalize())), { color, ...o });
};

// one slab: length L, radius r0 -> r1 along it. cracked = a bite out of the top of its far half and glowing cracks
export function addSlab(mesh, P, OW, L, r0, r1, name, seed, cracked = false) {
  const st = [0, 0.28, 0.72, 1], bulge = [0.97, 1.1, 1.07, 0.98], rings = [];
  st.forEach((u, i) => {
    const r = (r0 + (r1 - r0) * u) * bulge[i], ring = ringYZ(8, L * u, r, -r, r * 0.86, { jitter: 0.07, seed, k: i });
    if (cracked && i >= 2) for (const p of ring) if (p.y > r * 0.45) p.y -= r * (i === 2 ? 0.5 : 0.85) * (p.z > 0 ? 1 : 0.55);
    rings.push(ring);
  });
  stone(mesh, loft(rings, true), null, { ow: OW * 0.9, color: P.stone, name, seed });
  stone(mesh, rockGeo(r0 * 0.74, r0 * 0.74, r0 * 0.74, { detail: 1, jitter: 0.1, seed: seed + 1 }), null, { ow: OW * 0.7, color: P.stoneLt, name, seed: seed + 1 }); // the ball joint at the root
  stone(mesh, blockGeo(L * 0.1, (r0 + r1) * 1.0, (r0 + r1) * 0.95, { seed: seed + 2, jitter: 0.06 }), M4(V(L * 0.55, 0, 0)), { ow: OW * 0.5, color: P.stoneDk, name, seed: seed + 2 }); // a darker band round the slab
  if (!cracked) flat(mesh, rockGeo(L * 0.15, r0 * 0.2, r0 * 0.5, { detail: 1, jitter: 0.25, seed: seed + 3 }), M4(V(L * 0.3, r0 * 1.0, 0), qz(0.05)), { ow: OW * 0.3, color: P.moss, name }); // moss on top
  else {
    const r = (r0 + r1) / 2, z = r * 0.78;
    SEGBOX(mesh, V(L * 0.35, r * 0.9, z), V(L * 0.5, r * 0.2, z + 6), 26, 16, P.crack, { ow: 0, name });
    SEGBOX(mesh, V(L * 0.5, r * 0.2, z + 6), V(L * 0.44, -r * 0.5, z), 22, 16, P.crack, { ow: 0, name });
    SEGBOX(mesh, V(L * 0.5, r * 0.2, z + 10), V(L * 0.62, -r * 0.1, z + 4), 20, 14, P.crystal, { ow: 0, glow: 3, name }); // light through the crack
    SEGBOX(mesh, V(L * 0.35, r * 0.9, z + 10), V(L * 0.46, r * 0.4, z + 8), 18, 14, P.crystal, { ow: 0, glow: 3, name });
    flat(mesh, rockGeo(L * 0.1, r * 0.2, r * 0.4, { detail: 0, jitter: 0.25, seed: seed + 4 }), M4(V(L * 0.2, r * 0.95, 0)), { ow: OW * 0.2, color: P.mossDk, name });
  }
}

// the hand (origin at the wrist, +x forward): open, a fist, or broken
export function addHand(mesh, P, OW, r, kind, name, seed, ox = 0) {
  const M4 = (p, q) => M4g(V(p.x + ox, p.y, p.z), q); // (ox: where the wrist is, along x: a falling arm's hand sits at the end of its last slab)
  const ys = [0.62, 0.22, -0.18, -0.58], lens = [1.75, 2.05, 2.0, 1.6];
  const finger = (i, len, droop = 0) => stone(mesh, blockGeo(len * r, 0.38 * r, 0.56 * r, { seed: seed + 10 + i, jitter: 0.07 }), M4(V(r * 1.0 + (len * r) / 2, ys[i] * r, (i % 2 ? 0.05 : -0.05) * r), qz(droop)), { ow: OW * 0.55, color: P.stoneLt, name, seed: seed + 10 + i });
  if (kind === 'fist') {
    stone(mesh, blockGeo(1.6 * r, 1.85 * r, 1.35 * r, { seed: seed + 1, jitter: 0.07 }), M4(V(0.7 * r, 0, 0)), { ow: OW * 0.75, color: P.stone, name, seed: seed + 1 });
    for (let i = 0; i < 4; i++) stone(mesh, blockGeo(0.62 * r, 0.44 * r, 0.62 * r, { seed: seed + 20 + i, jitter: 0.1 }), M4(V(1.55 * r, ys[i] * r, (i % 2 ? 0.52 : 0.4) * r)), { ow: OW * 0.5, color: P.stoneLt, name, seed: seed + 20 + i }); // knuckles
    stone(mesh, blockGeo(0.95 * r, 0.46 * r, 0.52 * r, { seed: seed + 30, jitter: 0.08 }), M4(V(1.1 * r, -0.78 * r, 0.62 * r), qz(0.2)), { ow: OW * 0.5, color: P.stoneLt, name, seed: seed + 30 }); // the thumb across
    return;
  }
  stone(mesh, blockGeo(1.25 * r, 1.8 * r, 1.0 * r, { seed: seed + 1, jitter: 0.07 }), M4(V(0.5 * r, 0, 0)), { ow: OW * 0.75, color: P.stone, name, seed: seed + 1 }); // the palm
  if (kind === 'broken') { finger(1, 0.95, -0.08); finger(2, 1.25, 0.1); stone(mesh, rockGeo(0.45 * r, 0.45 * r, 0.4 * r, { detail: 0, jitter: 0.3, seed: seed + 5 }), M4(V(1.0 * r, 0.62 * r, 0)), { ow: OW * 0.4, color: P.stoneLt, name, seed: seed + 5 }); }
  else for (let i = 0; i < 4; i++) finger(i, lens[i], (i - 1.5) * 0.03);
  stone(mesh, blockGeo(1.2 * r, 0.4 * r, 0.5 * r, { seed: seed + 31, jitter: 0.08 }), M4(V(0.95 * r, -0.95 * r, 0.1 * r), qz(-0.55)), { ow: OW * 0.5, color: P.stoneLt, name, seed: seed + 31 }); // the thumb
}

// the jagged broken face at the end of a stump (origin at the slab's end)
export function addCut(mesh, P, OW, r, name, seed) {
  stone(mesh, rockGeo(0.42 * r, 1.0 * r, 0.9 * r, { detail: 1, jitter: 0.32, seed }), M4(V(0.05 * r, 0, 0)), { ow: OW * 0.6, color: P.stoneLt, name, seed });
  flat(mesh, rockGeo(0.2 * r, 0.5 * r, 0.45 * r, { detail: 0, jitter: 0.3, seed: seed + 1 }), M4(V(0.3 * r, 0.1 * r, 0.1 * r)), { ow: OW * 0.3, color: P.crystalDk, glow: 3, name });
}

// all the arms' pieces into `mesh`: for each arm (N near, F far): slabs a / b (whole and cracked), hands o / f / b, the cut face. Returns the slab sizes from the sim's own definition.
export function buildArmPieces(mesh, P, OW, T, opts) {
  const dims = {};
  for (const [tag, id] of [['N', 'armN'], ['F', 'armF']]) {
    const part = opts.cr.parts.find((p) => p.id === id), segs = part ? part.segs : [];
    dims[tag] = segs.map((s) => ({ len: s.len, r: s.r, r1: s.r1 }));
    if (!dims[tag].length) dims[tag] = [0, 1, 2].map((j) => ({ len: 1000 - 50 * j, r: 340 - 40 * j, r1: 300 - 40 * j }));
    const sd = tag === 'N' ? 200 : 300;
    dims[tag].forEach((d, j) => {
      addSlab(mesh, P, OW, d.len, d.r, d.r1, 'a' + tag + j + 'a', sd + j * 10, false);
      addSlab(mesh, P, OW, d.len, d.r, d.r1, 'a' + tag + j + 'b', sd + j * 10, true);
    });
    const r = dims[tag][dims[tag].length - 1].r1;
    addHand(mesh, P, OW, r, 'open', 'h' + tag + 'o', sd + 60);
    addHand(mesh, P, OW, r, 'fist', 'h' + tag + 'f', sd + 70);
    addHand(mesh, P, OW, r, 'broken', 'h' + tag + 'b', sd + 80);
    addCut(mesh, P, OW, 250, 'c' + tag, sd + 90);
  }
  void T; void hash; void TAU;
  return { dims };
}
