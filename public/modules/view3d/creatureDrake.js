// THE CINDER DRAKE IN 3D, the placeholder (C.6a; the proper sculpted look is the next task): the generic creature view (creature.js) with a KIND that has no head to build. Every part of the Drake that has
// segments (torso, neck, head, wings, tail) is drawn as a TUBE of tapered capsules along the simulation's own segments (creatureTube.js: one smooth tube each, no suckers), in the Drake's ember palette
// (config.CREATURE3D.DRAKE). The head group is empty (no mantle, jaws, lids or heart yet), and creature.js knows (K.tubesOnly) to leave it alone. Nothing here moves a thing by itself.
//   buildDrake(cr, P) -> the same record as creatureKraken.js buildKraken, with nothing in it
//   drakeTubeParts(cr) -> the parts drawn as tubes
import { THREE } from './style.js';
import { Mesher } from './creatureKit.js';

export function buildDrake(cr, P, opts = {}) {
  void P;
  void opts;
  const mesh = new Mesher(), dm = new Mesher();
  mesh.add(new THREE.SphereGeometry(1, 4, 3), new THREE.Matrix4().makeScale(0.01, 0.01, 0.01), { color: '#ffffff', name: 'mantle' }); // (a speck, so the geometries are valid)
  dm.add(new THREE.SphereGeometry(1, 4, 3), new THREE.Matrix4().makeScale(0.01, 0.01, 0.01), { color: '#ffffff', name: 'upper' });
  const torso = cr.parts.find((p) => p.kind === 'mantle'), R = torso ? torso.shape.r : 380;
  return {
    geometry: mesh.build(), dynGeometry: dm.build(), ranges: mesh.ranges, dynRanges: dm.ranges, dyn: {}, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: null,
    mantle: { S: new THREE.Vector3(), X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), M: new THREE.Matrix4(), R, L: torso ? torso.shape.len : 1000, sz: 1 }, tris: mesh.verts / 3, dynTris: dm.verts / 3,
  };
}
// The parts drawn as tubes: everything with segments but the snout (a point) and the heart.
export const drakeTubeParts = (cr) => cr.parts.filter((p) => p.segs.length && p.kind !== 'mouth' && p.kind !== 'heart');
