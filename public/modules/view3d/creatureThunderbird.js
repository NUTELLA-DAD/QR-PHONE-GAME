// THE THUNDERBIRD IN 3D, a first fallback (C.6b; 3D.md section 14, the creature kit): enough that the generic creature view (creature.js) can draw the Storm Front's bird without any special case and never crash.
// It is the Drake's first fallback again: the TORSO is a sculpted lathe (an egg, the sim's torso capsule), the GIZZARD a glowing lump on the breast that the view shows only while the sim has it open (the generic
// heart window), and every limb the sim has (two wings, the tail fan, the neck, two talons) is a tapered tube along the sim's rigid segments (creatureTube.js, `tubesOnly`). The proper model (a feathered
// body, wings with real flight feathers, a crested head with a hooked beak, talons that grip the bag, lightning crackling between the feathers) is a later task: the data it will need is already all in the
// sim's parts (cr.parts: wingN / wingF / tail / neck / talonN / talonF limbs, torso, head, beak, gizzard) and in cr.bird (mode, act, pose, glow).
//   build(cr, P, opts) -> the same record as the Kraken's and the Drake's (creatureKraken.js, drakeModel.js): { geometry, dynGeometry, ranges, dyn, sil, eyes, mouth, heart, mantle, tris, dynTris }
import { THREE } from './style.js';
import { Mesher, DynPiece, mantleUV } from './creatureKit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function buildThunderbird(cr, P, opts = {}) {
  const OW = P.INK || 14, low = !!opts.low, mesh = new Mesher();
  const torso = cr.parts.find((p) => p.kind === 'mantle'), gz = cr.parts.find((p) => p.kind === 'heart');
  const R = torso ? torso.shape.r : 360, L = torso ? torso.shape.len : 900, ax = torso ? torso.at[0] : -480, ay = torso ? -torso.at[1] : 0;
  // the torso: a lathe along x from the tail end to the breast; a plump egg (radius from the sim's capsule), a little flatter front to back so the wings sit proud of it
  const prof = (u) => { const t = Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.6; return R * (0.15 + 0.85 * t); };
  const pos = (u, v, out) => { const th = v * Math.PI * 2, r = prof(u); return out.set(ax - R * 0.9 + u * (L + R * 1.8), ay + r * Math.cos(th), r * 0.8 * Math.sin(th)); };
  mesh.grid(low ? 22 : 34, low ? 14 : 22, pos, null, { ow: OW, color: '#ffffff', name: 'mantle' }, (u, v) => mantleUV(v, u));
  // the gizzard: a glowing lump on the breast, the generic view's heart window (shown only while the sim has it open)
  const gx = gz ? gz.at[0] : 200, gy = gz ? -gz.at[1] : -130, gr = gz ? gz.shape.r : 150, gzz = R * 0.75 + gr * 0.2;
  mesh.add(new THREE.SphereGeometry(1, 16, 12), new THREE.Matrix4().compose(V(gx, gy, gzz), new THREE.Quaternion(), V(gr, gr, gr * 0.8)), { ow: OW * 0.4, color: P.heart, glow: 4, name: 'heart' });
  const geometry = mesh.build();
  const dyn = {};
  if (mesh.ranges.heart) { dyn.heart = new DynPiece(geometry, mesh.ranges.heart, V(gx, gy, gzz), V(0, 0, 1)); dyn.heart.pose(0, 0); }
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: gz ? { part: gz } : null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R, L, sz: 1 }, tris: mesh.verts / 3, dynTris: 0,
  };
}
