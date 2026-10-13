// THE GARRISON KIT (CASTLE.md D2; config.RING3D.GAR): the models of the castle's men and their works, built once per castle palette. Everything is rigid and held: a soldier is one of five poses (stand, aim, cheer, run,
// give up), a banner one of three poses of its cloth, a ballista one of four draws of its bow. Nothing here moves; garrison3d.js picks which one is shown on 8 fps keys (the banners 4 a second). No sine of time.
// Coordinates of a model: x right, y up, z toward the viewer, the soldier's feet at the origin, the arrow along +x. Geometry never throws: sizes are clamped.
//   buildMen(A, C)      -> { stand, aim, cheer, run, give } doubled geometries (style.js inkDouble: the picture and its ink shell in ONE mesh, so each pose is one draw call however many men)
//   buildBanners(A, C)  -> { red: [3 geometries], white: [3 geometries] }  (a standard: pole, finial, cloth in the three held poses of the castle's other flags)
//   buildArrow(C)       -> one plain geometry of an arrow (a shaft, a head, feathers), unit long; the bolt is the same scaled up
//   buildBallista(A, C) -> a baked-pose group (style.js bakePoses): show(0..3) = how far the bow is drawn
import { THREE, Batch, inkDouble, bakePoses, piece, mat } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flagPoses, cone as coneAt } from './castleKit.js';

export const GAR_LIVE = { on: false }; // (garrison3d.js sets it while it draws the arrows and bolts; vfx.js and index.js then skip the generic tracer for those kinds)
const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const merge = (parts) => { const g = mergeGeometries(parts, false); for (const p of parts) p.dispose(); return g; };

// ---- a soldier ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// A cheaper Batch for the men (there can be a hundred and every one is drawn twice, picture and ink): faceted balls (20 / 80 triangles), five-sided rods, six-sided cones, an eight-sided disc.
const ICO0 = new THREE.IcosahedronGeometry(1, 0), ICO1 = new THREE.IcosahedronGeometry(1, 1), ROD5 = new THREE.CylinderGeometry(1, 1, 1, 5, 1), CONE6 = new THREE.ConeGeometry(1, 1, 6), CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
class LowBatch extends Batch {
  sphere(color, cx, cy, cz, rx, ry = rx, rz = rx, ow = 0, lo = false) { this.parts.push(piece(lo === 2 ? ICO1 : ICO0, color, mat(cx, cy, cz, rx, ry, rz), ow)); return this; }
  cone(color, cx, cy, cz, r, h, ow = 0, rx = 0, ry = 0, rz = 0) { this.parts.push(piece(CONE6, color, mat(cx, cy, cz, r, h, r, rx, ry, rz), ow)); return this; }
  cyl(color, cx, cy, cz, r, h, ow = 0, rx = 0, ry = 0, rz = 0) { this.parts.push(piece(CYL8, color, mat(cx, cy, cz, r, h, r, rx, ry, rz), ow)); return this; }
  rod(color, a, b, r, ow = 0) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < 1e-3) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    this.parts.push(piece(ROD5, color, new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r)), ow));
    return this;
  }
}
// A man 118 tall, in the Ember Pact's colours (an oxblood tunic with a gold belt and a flame on the chest, an iron helmet with a flame crest: fictional heraldry only).
function head(B, A, C, x, y, z, side) {
  B.sphere(C.SKIN, x, y, z, 10, 11, 10, 1.4);
  B.sphere(C.HELM, x, y + 4.5, z, 12.5, 10, 12.5, 1.6, 2);
  if (side) B.box(C.HELM, x + 10, y - 1, z, 3, 13, 4, 0.8); else B.box(C.HELM, x, y - 1, z + 10.5, 4, 13, 3, 0.8); // the nose guard
  B.cone(A.flame || '#ffb347', x, y + 19, z, 4.6, 15, 0.8, 0, 0, 0); // a crest of flame
}
function quiver(B, A, C, x, y, z, tilt) {
  B.box(C.LEATHER, x, y, z, 9, 34, 9, 1.2, 0, 0, tilt);
  B.box(C.FEATHER, x - Math.sin(tilt) * 19, y + Math.cos(tilt) * 19, z, 8, 7, 8, 0.5, 0, 0, tilt);
}
function frontBody(B, A, C, o = {}) {
  const T = A.banner || '#8f302c', GD = A.gold || '#c8a85c', sp = o.spread || 9;
  for (const s of [-1, 1]) {
    B.box(C.PANTS, s * sp, 24, 0, 14, 46, 15, 1.4);
    B.box(C.LEATHER, s * sp, 5, 3, 16, 10, 22, 1.2);
  }
  B.box(T, 0, 66, 0, 38, 44, 23, 1.9); // the tunic
  B.box(GD, 0, 46, 0, 40, 6, 25, 0.4); // the belt
  B.cone(A.flame || '#ffb347', 0, 68, 12.5, 7, 20, 0, 0, 0, 0); // the flame on his chest
  for (const s of [-1, 1]) B.sphere(C.HELM, s * 22, 86, 0, 9, 7, 9, 1.4, true); // pauldrons
  head(B, A, C, 0, 101, 0, 0);
  return T;
}
function hand(B, C, x, y, z, r = 5.8) { B.sphere(C.SKIN, x, y, z, r, r, r, 1.2, true); }

function standPose(A, C) {
  const B = new LowBatch(), T = frontBody(B, A, C);
  B.rod(T, V(21, 84, 0), V(27, 54, 4), 5.2, 1.4); hand(B, C, 27, 51, 4); // the right arm, down; a sword at his hip
  B.rod(C.HELM, V(30, 50, 4), V(34, 22, 5), 2.2, 0.8); B.box(C.LEATHER, 29, 52, 4, 7, 4, 5, 0.6);
  B.rod(T, V(-21, 84, 0), V(-28, 62, 8), 5.2, 1.4); hand(B, C, -29, 60, 10); // the left arm holds the shield
  B.cyl(A.banner || '#8f302c', -30, 62, 11, 18, 4, 1.7, PI / 2); B.cyl(A.gold || '#c8a85c', -30, 62, 9.5, 19.5, 2.2, 0, PI / 2); B.sphere(A.gold || '#c8a85c', -30, 62, 14.5, 5.6, 5.6, 3, 0, true);
  quiver(B, A, C, 9, 76, -14, 0.25);
  return B.parts;
}
function cheerPose(A, C) {
  const B = new LowBatch(), T = frontBody(B, A, C, { spread: 11 });
  for (const s of [-1, 1]) { B.rod(T, V(s * 21, 84, 0), V(s * 40, 122, 3), 5.4, 1.4); hand(B, C, s * 42, 126, 3, 6.6); } // both arms up
  quiver(B, A, C, 9, 76, -14, 0.25);
  return B.parts;
}
function givePose(A, C) { // hands up, a white flag on a stick in one of them
  const B = new LowBatch(), T = frontBody(B, A, C);
  B.rod(T, V(-21, 84, 0), V(-35, 120, 3), 5.2, 1.4); hand(B, C, -36, 124, 3, 6.2);
  B.rod(T, V(21, 84, 0), V(34, 114, 4), 5.2, 1.4); hand(B, C, 35, 116, 4, 6.2);
  B.rod(C.SHAFT, V(35, 108, 4), V(35, 184, 4), 2.6, 0.9); // the stick
  B.box(C.CLOTH, 35 + 15, 168, 4, 30, 40, 2.6, 1.3, 0, 0, 0.04); // the white flag: a pennant of three steps
  B.box(C.CLOTH, 35 + 38, 166, 4, 18, 28, 2.6, 1.1, 0, 0, -0.05);
  B.box(C.CLOTH, 35 + 53, 164, 4, 12, 15, 2.6, 0.9, 0, 0, 0.08);
  return B.parts;
}
function aimPose(A, C) { // in profile, facing +x: the bow drawn, an arrow on the string
  const B = new LowBatch(), T = A.banner || '#8f302c', GD = A.gold || '#c8a85c';
  B.rod(C.PANTS, V(2, 46, 0), V(14, 5, 0), 7.2, 1.4); B.rod(C.PANTS, V(-2, 46, 0), V(-15, 5, 0), 7.2, 1.4);
  B.box(C.LEATHER, 19, 4, 0, 23, 9, 14, 1.2); B.box(C.LEATHER, -13, 4, 0, 23, 9, 14, 1.2);
  B.box(T, 0, 66, 0, 24, 44, 33, 1.9); B.box(GD, 0, 46, 0, 26, 6, 35, 0.4);
  B.cone(A.flame || '#ffb347', 12.5, 66, 0, 7, 20, 0, 0, 0, -PI / 2);
  B.sphere(C.HELM, 0, 86, 0, 8, 7, 12, 1.4, true);
  head(B, A, C, 4, 101, 0, 1);
  quiver(B, A, C, -14, 76, -2, 0.3);
  B.rod(T, V(6, 84, 10), V(52, 87, 9), 5.2, 1.4); hand(B, C, 53, 87, 9, 5.4); // the bow arm, straight out
  const w = A.wood || '#7a5a3e';
  B.rod(w, V(53, 128, 9), V(61, 87, 9), 3.4, 1); B.rod(w, V(61, 87, 9), V(53, 46, 9), 3.4, 1); // the bow
  B.rod(C.CLOTH, V(53, 128, 9), V(3, 87, 6), 1.3, 0); B.rod(C.CLOTH, V(3, 87, 6), V(53, 46, 9), 1.3, 0); // the string, drawn back
  B.rod(C.SHAFT, V(3, 87, 7), V(66, 87, 9), 1.9, 0); B.cone(C.HEAD, 69, 87, 9, 3.6, 10, 0, 0, 0, -PI / 2); // the arrow
  B.rod(T, V(-2, 84, -8), V(-16, 92, -2), 5.0, 1.4); B.rod(T, V(-16, 92, -2), V(3, 87, 6), 4.6, 1.2); hand(B, C, 3, 87, 6, 5);
  return B.parts;
}
function runPose(A, C) { // in profile, facing +x, leaning into the run, the quiver bouncing
  const B = new LowBatch(), T = A.banner || '#8f302c', GD = A.gold || '#c8a85c';
  B.rod(C.PANTS, V(4, 46, 0), V(27, 14, 0), 7.2, 1.4); B.rod(C.PANTS, V(-2, 46, 0), V(-25, 18, 0), 7.2, 1.4);
  B.box(C.LEATHER, 31, 9, 0, 22, 9, 14, 1.2, 0, 0, 0.5); B.box(C.LEATHER, -29, 13, 0, 22, 9, 14, 1.2, 0, 0, -0.6);
  B.box(T, 3, 65, 0, 24, 44, 33, 1.9, 0, 0, -0.26); B.box(GD, 1, 46, 0, 26, 6, 35, 0.4, 0, 0, -0.26);
  B.sphere(C.HELM, 8, 86, 0, 8, 7, 12, 1.4, true);
  head(B, A, C, 16, 98, 0, 1);
  quiver(B, A, C, -11, 78, -2, 0.7);
  B.rod(T, V(12, 82, 10), V(32, 68, 10), 5.2, 1.4); hand(B, C, 33, 66, 10); // the arms pump
  B.rod(T, V(4, 82, -10), V(-17, 76, -10), 5.2, 1.4); hand(B, C, -19, 75, -10);
  return B.parts;
}
export function buildMen(A, C) {
  const out = {};
  for (const [name, fn] of [['stand', standPose], ['aim', aimPose], ['cheer', cheerPose], ['run', runPose], ['give', givePose]]) {
    const g = inkDouble(merge(fn(A, C)));
    out[name] = g;
  }
  return out;
}

// ---- a standard: a pole with a cloth of four hinged segments in the three held poses --------------------------------------------------------------------------------------------
export function buildBanners(A, C, G) {
  const pole = G.POLE, w = G.W / 4 * 3, ch = G.CLOTH;
  const make = (white) => {
    const poses = flagPoses(4, w, ch, () => (white ? [C.CLOTH, C.CLOTH] : [A.banner || '#8f302c', A.banner || '#8f302c']), 4, (i) => [1, 0.9, 0.76, 0.52][i], white ? null : (i, b, hh) => {
      if (i === 0) b.box(A.gold || '#c8a85c', w / 2, -hh * 0.14, 2.8, w, hh * 0.12, 2, 0);
      if (i === 1) { coneAt(b, A.flame || '#ffb347', w / 2, -hh * 0.52, 3.2, w * 0.3, hh * 0.46, 5, 0); coneAt(b, '#ffe08a', w / 2, -hh * 0.58, 4.4, w * 0.15, hh * 0.26, 5, 0); }
    });
    return poses.map((cloth) => {
      const B = new Batch();
      B.rod(A.woodDark || '#563c28', V(0, 0, 0), V(0, pole + 4, 0), 3.8, 1.3);
      B.cone(A.gold || '#c8a85c', 0, pole + 16, 0, 7, 22, 1.1);
      B.box(A.gold || '#c8a85c', 0, pole - 4, 0, 11, 6, 11, 0.8);
      for (const p of cloth) { p.translate(2, pole - 6, 0); B.parts.push(p); }
      return inkDouble(merge(B.parts));
    });
  };
  return { red: make(false), white: make(true) };
}

// ---- an arrow (and the bolt, the same shape scaled up) -------------------------------------------------------------------------------------------------------------------------------
// Unit long along +x, centred, with the head at x = +0.62 (garrison3d places the head at the arrow's own position). A thickness of 1 = the shaft; the head and the feathers are wider than it.
export function buildArrow(C) {
  const B = new Batch();
  B.box(C.SHAFT, 0, 0, 0, 1.0, 0.7, 0.7, 0);
  B.cone(C.HEAD, 0.55, 0, 0, 1.7, 0.2, 0, 0, 0, -PI / 2);
  B.box(C.FEATHER, -0.4, 0, 0, 0.18, 3.0, 0.16, 0);
  B.box(C.FEATHER, -0.4, 0, 0, 0.18, 0.16, 3.0, 0);
  return merge(B.parts);
}
export const ARROW_TIP = 0.65; // (x of the head's tip in the unit arrow)

// ---- the ballista: a stock, a bow of two arms that bends back as it is drawn, a string, the bolt laid in it --------------------------------------------------------------------------
// Local space: the pivot at the origin, the stock along +x, the arms standing in the picture's plane (as the 2D game draws it). Four poses: the bow drawn 0, 1/3, 2/3, all the way.
export function buildBallista(A, C) {
  const w = A.wood || '#7a5a3e', wd = A.woodDark || '#563c28', iron = A.iron || '#3f3b3e';
  const poses = [0, 1, 2, 3].map((pull) => {
    const B = new Batch(), k = pull / 3, tip = 100 - 40 * k, nock = 98 - 72 * k;
    B.box(w, 38, 0, 0, 150, 17, 24, 2.2); // the stock
    B.box(wd, 38, -10, 0, 150, 5, 30, 0);
    B.cyl(iron, 0, -13, 0, 19, 12, 1.5); // the turntable
    B.box(wd, 96, 0, 0, 16, 34, 28, 1.6); // the bow's block
    for (const s of [-1, 1]) {
      B.rod(w, V(96, s * 8, 0), V(110 - 14 * k, s * 50, 0), 6, 1.5);
      B.rod(w, V(110 - 14 * k, s * 50, 0), V(tip, s * 92, 0), 5.4, 1.5);
      B.sphere(iron, tip, s * 92, 0, 6, 6, 6, 1, true);
      B.rod(C.CLOTH, V(tip, s * 92, 0), V(nock, 0, 0), 1.5, 0); // the string
    }
    B.rod(C.BOLT, V(nock - 4, 0, 0), V(nock + 142, 0, 0), 3.6, 1); // the bolt in its groove
    B.cone(C.BOLT_HEAD, nock + 152, 0, 0, 7.5, 24, 1.1, 0, 0, -PI / 2);
    B.box(C.FEATHER, nock + 10, 0, 0, 20, 12, 1.6, 0.5); B.box(C.FEATHER, nock + 10, 0, 0, 20, 1.6, 12, 0.5);
    return B.parts;
  });
  return bakePoses(poses, { cast: false, receive: false, small: false });
}
