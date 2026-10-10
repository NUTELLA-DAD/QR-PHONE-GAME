// THE ENEMY AND WORLD-OBJECT MODELS (WP9): every flying thing the sky holds besides the ships, built from rigid pieces (style.js Batch: one mesh + its ink shell per model). No wobble: a model never
// deforms; the things that move (a propeller, a bat's wings, a saw, a gun's barrel) are separate rigid nodes that flyers.js poses on STEPPED keys (8 fps).
// Coordinates: 3D (x right, y up, z toward the viewer). A model faces +x (a plane flying right, her wheels at -y); flyers.js yaws or rolls it for the other way.
// The enemy faction is the EMBER PACT (fictional): a gold triangle with a red flame in it (emblem()), charcoal and oxblood colours. Never a real national insignia.
import { THREE, Batch, G, glowMat, glow, INK, tagSmall } from './style.js';

const PI = Math.PI;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const TRI = new THREE.CylinderGeometry(1, 1, 1, 3); // a 3-sided prism: the emblem's triangle
const DISC = new THREE.CircleGeometry(1, 28);
const TORUS = new THREE.TorusGeometry(1, 0.06, 6, 28);
DISC.rotateY(PI / 2); // (the propeller's disc: faces along x)

export const COL = {
  ink: INK, iron: '#4a4346', ironDark: '#2f2a2e', steel: '#8a8588', bone: '#efe9dc', oxblood: '#8c2f2f', oxbloodDark: '#5c1e1e', red: '#a8443f', gold: '#f4c430', cream: '#ebdfc0', brass: '#c9a85a',
  glass: '#7ad0e0', leather: '#6b4a32', canvas: '#c9b48a', plum: '#3b2c4c', grey: '#6b6a5e', coal: '#2b2622',
};

// ---- small helpers ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// a flat prism from outline points (x, y), `depth` thick about z = 0
export function flatShape(pts, depth) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}
const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();
const mat = (px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(P.set(px, py, pz), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz));
void M4;

// The Ember Pact emblem, flat on a side (z): a gold triangle with a red flame, s = the triangle's radius. face = +1 toward the viewer, -1 the other side.
export function emblem(b, x, y, z, s, face = 1) {
  b.geo(COL.gold, TRI, mat(x, y, z + face * 0.6, s, 1.6, s, -PI / 2), 1.2);
  b.sphere(COL.red, x, y - s * 0.12, z + face * 1.8, s * 0.3, s * 0.52, 1.1, 0.8, true);
  b.cone(COL.red, x, y + s * 0.38, z + face * 1.8, s * 0.2, s * 0.5, 0.8);
}

const prop = (color, len, w, x = 0, depth = 7) => { // two blades on a hub: one rigid node (its own mesh, no ink shell: it is a blur anyway)
  const b = new Batch();
  b.box(color, x, 0, 0, 4, len, depth, 0);
  b.box(color, x, 0, 0, 4, depth, len, 0);
  b.sphere(COL.red, x + 3, 0, 0, 7, 7, 7, 0, true);
  const g = b.build({ cast: false, receive: false });
  if (g.children[1]) g.remove(g.children[1]); // (the ink shell: not for a blur)
  void w;
  return g;
};
const blurMat = new THREE.MeshBasicMaterial({ color: '#4a4440', transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
const blurDisc = (r, x = 0) => { const m = new THREE.Mesh(DISC, blurMat); m.scale.setScalar(r); m.position.x = x; m.renderOrder = 3; return m; };

// ---- a BIPLANE (the dogfighters, our escorts, a stolen plane, the Devil's single fighter): about 124 long, 140 across ---------------------------------------------------------
// pal = { body, wing, trim, dark }; o = { pilot: 'skull' | color hex (a crewman's head), enemy: true | false, scale, number }
export function buildBiplane(pal, o = {}) {
  const b = new Batch(), s = o.scale || 1;
  const body = pal.body, wing = pal.wing || body, trim = pal.trim || pal.wing, dark = pal.dark || '#4a4440';
  // the fuselage: a round belly, a tail cone, a dark cowling with an exhaust stack each side and a spinner
  b.sphere(body, -4, 0, 0, 52, 15.5, 15.5, 3.2);
  b.cone(body, -66, 4, 0, 11, 56, 2.6, 0, 0, PI / 2);
  b.cyl(dark, 52, 0, 0, 16.5, 22, 3, 0, 0, PI / 2);
  b.cyl(COL.steel, 52, 0, 0, 17.4, 4, 0, 0, 0, PI / 2);
  b.cone(COL.red, 70, 0, 0, 11, 22, 2, 0, 0, -PI / 2);
  for (const z of [-17, 17]) b.cyl(COL.steel, 44, 4, z, 2.6, 16, 1, 0, 0, PI / 2);
  b.box(trim, -22, 0, 0, 7, 33, 33, 0); // a painted band round the middle
  for (const z of [-5, 5]) b.box(COL.ironDark, 40, 15, z, 28, 3.4, 3.4, 1.2); // two machine guns over the cowling
  // wings: a lower one under the belly, an upper one above, joined by struts and wires
  b.box(wing, 2, -10, 0, 36, 6, 142, 3);
  b.box(wing, 4, 28, 0, 38, 6, 150, 3);
  b.box(trim, 4, 28.2, 0, 8, 6.4, 152, 0); // a painted stripe along the top wing
  for (const z of [-44, 44]) { for (const x of [-4, 14]) b.box(dark, x, 9, z, 3.4, 40, 3.4, 1.2); b.rod(dark, V(-4, 28, z), V(14, -10, z), 0.9, 0); }
  for (const z of [-66, 66]) b.box(dark, 3, 9, z, 3.4, 40, 3.4, 1.2); // the outer struts at the wing tips
  b.rod(dark, V(-2, 14, 0), V(-6, 28, -16), 1.5, 0); b.rod(dark, V(-2, 14, 0), V(-6, 28, 16), 1.5, 0); // the cabane struts to the upper wing
  b.rod(dark, V(16, 14, 0), V(12, 28, -16), 1.5, 0); b.rod(dark, V(16, 14, 0), V(12, 28, 16), 1.5, 0);
  // the tail
  b.box(trim, -70, 3, 0, 26, 4, 56, 2.4); // tailplane
  b.box(trim, -76, 20, 0, 22, 32, 4.4, 2.4, 0, 0, 0.18); // fin
  b.box(wing, -85, 17, 0, 6, 22, 4.8, 0, 0, 0, 0.18); // rudder
  b.rod(dark, V(-86, 1, 0), V(-98, -9, 0), 1.6, 0); // the tail skid
  // the undercarriage (wheels down)
  for (const z of [-15, 15]) { b.rod(dark, V(24, -10, z * 0.6), V(26, -32, z), 1.8, 0); b.cyl(COL.coal, 26, -34, z, 8.6, 5.6, 1.6, PI / 2, 0, 0); }
  b.rod(dark, V(26, -34, -15), V(26, -34, 15), 1.2, 0);
  // the cockpit: a windscreen and the pilot
  b.box(COL.glass, 20, 15.4, 0, 3, 12, 16, 1, 0, 0, -0.5);
  const pilot = o.pilot || COL.bone;
  if (pilot === 'skull' || pilot === COL.bone) { // the raiders' skeleton pilot: a bone skull in goggles and a leather cap, a red scarf
    b.sphere(COL.bone, 6, 19, 0, 8, 8.4, 7.4, 1.8, true);
    b.cone(COL.bone, 10, 12.5, 0, 5, 5, 1, 0, 0, PI);
    b.sphere(COL.leather, 5, 22.4, 0, 8.6, 5, 7.9, 1.4, true);
    for (const z of [-3.6, 3.6]) b.sphere(COL.glass, 12.4, 20, z, 2.8, 2.8, 2.2, 1, true);
    b.box(COL.red, -4, 14.8, 0, 12, 3, 9, 0, 0, 0, 0.3);
  } else { // one of ours: a crewman's head in his colour, goggles and a cap
    b.sphere(pilot, 6, 19, 0, 8, 8.2, 7.6, 1.8, true);
    b.sphere(COL.leather, 5, 22.6, 0, 8.4, 5, 7.8, 1.4, true);
    for (const z of [-3.6, 3.6]) b.sphere(COL.glass, 12.2, 20, z, 2.8, 2.8, 2.2, 1, true);
    b.box(COL.cream, -4, 14.8, 0, 12, 3, 9, 0, 0, 0, 0.3);
  }
  if (o.enemy) { emblem(b, -34, 0, 16, 9, 1); emblem(b, -34, 0, -16, 9, -1); }
  const g = b.build();
  const pg = prop(COL.coal, 62, 7, 0, 7);
  pg.position.x = 76;
  g.add(pg);
  const blur = blurDisc(31, 78);
  g.add(blur);
  g.scale.setScalar(s);
  g.userData.prop = pg; g.userData.blur = blur;
  return g;
}

// ---- a BOMBER: a long dark fuselage, twin tails, one big wing with two engines, a glass nose, an open bomb bay (about 290 long, 380 across) -------------------------------------------
export function buildBomber(o = {}) {
  const b = new Batch(), body = o.body || '#3d3a40', dark = '#2a272d', trim = o.trim || COL.red;
  b.sphere(body, 0, 0, 0, 148, 28, 28, 4);
  b.cone(body, -170, 6, 0, 18, 110, 3, 0, 0, PI / 2); // the tail cone
  b.sphere(COL.glass, 128, 6, 0, 28, 20, 20, 2.4, true); // the glass nose
  for (const z of [-9, 0, 9]) b.box(dark, 138, 6, z, 2, 30, 2, 0);
  b.box(trim, 30, 0, 0, 8, 58, 58, 0); // the red band
  b.box(trim, -120, 0, 0, 8, 50, 50, 0);
  // the wing, its leading edge and the two engine nacelles
  b.box(body, 6, -4, 0, 76, 9, 380, 3.4);
  b.box(dark, 42, -4, 0, 4, 10, 380, 0);
  for (const z of [-96, 96]) {
    b.sphere('#555', 20, -10, z, 44, 16, 18, 3, true);
    b.cyl(COL.steel, 62, -10, z, 18, 4, 0, 0, 0, PI / 2);
    b.cone(COL.red, 72, -10, z, 11, 22, 2, 0, 0, -PI / 2);
    b.box(dark, -30, -22, z, 64, 6, 10, 1.6);
  }
  // twin tails on a long tailplane
  b.box(body, -150, 8, 0, 44, 5, 150, 3);
  for (const z of [-62, 62]) { b.box(body, -156, 36, z, 38, 62, 6, 3, 0, 0, 0.12); b.box(trim, -166, 40, z, 8, 40, 7, 0, 0, 0, 0.12); }
  // the open bomb bay and a gun turret on the back
  b.box('#14110f', 10, -29, 0, 90, 5, 30, 1.4);
  b.box(dark, 10, -24, 0, 94, 3, 36, 0);
  b.sphere(dark, 20, 28, 0, 15, 11, 15, 2, true);
  b.rod(COL.ironDark, V(26, 30, 0), V(54, 38, 0), 3, 1);
  emblem(b, -64, 2, 29, 14, 1); emblem(b, -64, 2, -29, 14, -1);
  const g = b.build();
  const props = [];
  for (const z of [-96, 96]) { const pg = prop(COL.coal, 76, 8, 0, 8); pg.position.set(78, -10, z); g.add(pg); const bl = blurDisc(38, 80); bl.position.set(80, -10, z); g.add(bl); props.push(pg); }
  g.userData.props = props;
  g.userData.prop = props[0];
  return g;
}

// ---- the Devil's own fighter (state.enemy): grey twin-boom, a red spinner, a shark-mouthed pod, a devil in the cockpit ---------------------------------------------------------------
export function buildDevil() {
  const b = new Batch(), grey = COL.grey, dark = '#4a4440';
  b.sphere(grey, 30, -2, 0, 44, 19, 21, 3.2); // the pod
  b.sphere('#c9663a', 26, 12, 0, 17, 8, 14, 2, true); // a low canopy ring
  b.sphere(COL.red, 32, 22, 0, 10, 11, 9.4, 1.8, true); // the devil's head, sitting up in it
  for (const z of [-1, 1]) b.cone(COL.gold, 30, 35, z * 5.4, 2.6, 10, 0.8, 0, 0, z * -0.18); // horns
  for (const z of [-4.6, 4.6]) b.sphere(COL.gold, 40, 24, z, 2.6, 2.6, 2, 0, true); // yellow eyes
  b.box('#14110f', 41, 17, 0, 2, 3, 9, 0); // a grin
  for (const zz of [-1, 1]) { b.box('#14110f', 58, -8, zz * 21.4, 30, 5.5, 1.6, 0); for (let k = 0; k < 5; k++) b.cone(COL.bone, 46 + k * 6.6, -5.4, zz * 22.2, 2.4, 6.4, 0, 0, 0, PI); } // the shark's mouth painted on the pod's sides
  b.cyl(dark, 70, -2, 0, 14, 12, 2, 0, 0, PI / 2); // the nose
  b.cone(COL.red, 82, -2, 0, 11, 20, 2, 0, 0, -PI / 2);
  for (const z of [-26, 26]) { // two long booms back to a tailplane, a fin on each
    b.rod(grey, V(20, -2, z * 0.7), V(-84, -2, z), 5, 2.4);
    b.box(grey, -92, 12, z, 22, 36, 4.4, 2.4, 0, 0, 0.2);
    b.box('#c9663a', -90, 14, z + (z > 0 ? 3 : -3), 9, 20, 2, 0, 0, 0, 0.2); // the orange lightning mark
  }
  b.box(grey, -94, -2, 0, 22, 4, 56, 2.4);
  b.box(grey, 10, -6, 0, 40, 5, 130, 3); // the short wing
  for (const z of [-60, 60]) b.box(dark, 12, -6, z, 22, 7, 5, 1);
  emblem(b, 8, 0, 21, 8, 1); emblem(b, 8, 0, -21, -1 * 8, -1);
  const g = b.build();
  const pg = prop(COL.coal, 52, 7, 0, 6);
  pg.position.x = 94;
  g.add(pg);
  const blur = blurDisc(26, 96);
  g.add(blur);
  g.userData.prop = pg; g.userData.blur = blur;
  return g;
}

// ---- a BAT: seen head-on (the 2D sprite is too), two scalloped wings, ears, red eyes, fangs. color = the environment's bat (purple, orange magma bats in the Forge). A bat is built in FIVE HELD POSES (the
// wing up, level, down, level again; and folded, for one that has latched onto the ship): flyers.js draws a whole flock as one instanced pair per pose (swarm3d.js), so the beat is the key number picking the pose. ----
const WING_PTS = [[0, 4], [10, 14], [26, 22], [44, 16], [52, 4], [46, -2], [40, 8], [36, -8], [28, 2], [24, -14], [14, -4], [8, -12], [0, -8]]; // a scalloped bat wing, the shoulder at the origin, tip at +x
const WING_GEO = flatShape(WING_PTS, 4);
export const BAT_FLAP = [0.82, 0.3, -0.45, 0.3], BAT_LATCH = -1.3; // wing angles (radians) of the four beat keys, and of a folded wing
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
// the matrix that puts a wing (shoulder at its origin, tip toward +x) on the body: at (px, py, pz), raised by ang, turned half way round for the left one (a mirrored scale would turn its faces inside out)
const wingMatrix = (sgn, ang, px, py, pz, sx = 1) => {
  _q1.setFromEuler(_e.set(0, 0, sgn * ang));
  _q2.setFromEuler(_e.set(0, sgn > 0 ? 0 : PI, 0));
  return new THREE.Matrix4().compose(P.set(px, py, pz), _q1.multiply(_q2), S.set(sx, 1, 1));
};
function batPose(color, ang, folded) {
  const dark = new THREE.Color(color).lerp(new THREE.Color('#9a6ab0'), 0.3).getStyle(); // (the wing membrane: a little lighter than the body, so a bat reads against a dark cave)
  const b = new Batch();
  b.sphere(color, 0, 0, 0, 13, 17, 12, 2.6); // the body
  b.sphere(color, 0, 21, 2, 11, 10, 9.4, 2.4, true); // the head
  for (const x of [-1, 1]) { b.cone(color, x * 7, 33, 2, 3.8, 14, 1.8, 0, 0, -x * 0.28); b.cone('#c9706a', x * 7, 31, 4.6, 1.8, 8, 0, 0, 0, -x * 0.28); } // the ears
  for (const x of [-1, 1]) b.cone('#efe9dc', x * 3, 14.5, 9, 1.4, 5, 0, 0, 0, PI); // fangs
  for (const x of [-1, 1]) b.sphere('#ff6a5a', x * 4.6, 22, 10.2, 2.9, 2.9, 1.8, 0, true); // the eyes
  for (const x of [-1, 1]) b.box(dark, x * 6, -17, 0, 3, 11, 3, 1); // feet
  for (const sgn of [1, -1]) {
    const wm = wingMatrix(sgn, ang, sgn * 9, 8, -2, folded ? 0.55 : 1);
    b.geo(dark, WING_GEO, wm, 1.8);
    b.rod(COL.ironDark, V(0, 3, 0).applyMatrix4(wm), V(50, 4, 0).applyMatrix4(wm), 1.3, 0); // the wing's bone
  }
  return b.build();
}
export function buildBatPoses(color = '#3b2c4c') { return [...BAT_FLAP.map((a) => batPose(color, a, false)), batPose(color, BAT_LATCH, true)]; }

// ---- MINES ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const spikeDirs = (n) => { // n points spread over a sphere (the fibonacci spiral)
  const out = [], ga = PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * ga; out.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
  return out;
};
// the iron ball with its horns, a brass band and a lamp on top. r = the body radius (world units), n = horns, tone = the colour of the iron.
function mineBall(b, r, n, tone) {
  b.sphere(tone, 0, 0, 0, r, r, r, 3);
  for (const [x, y, z] of spikeDirs(n)) {
    const d = V(x, y, z), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
    const m = new THREE.Matrix4().compose(d.clone().multiplyScalar(r + 7), q, V(r * 0.19, r * 0.62, r * 0.19));
    b.geo('#3a3a3e', G.cone, m, 2);
  }
  b.geo(COL.brass, TORUS, mat(0, 0, 0, r * 1.02, r * 1.02, r * 1.02 * 1.0, PI / 2, 0, 0), 0.6);
  b.geo(COL.brass, TORUS, mat(0, 0, 0, r * 1.03, r * 1.03, r * 1.03, 0, PI / 2, 0), 0);
}
// The MINES are drawn as instanced copies (swarm3d.js), so a field of them costs a handful of draw calls: the iron ball (a moored one has 12 horns, a laid one 10 and darker iron), the tan balloon a moored
// one hangs from, a lamp (flyers.js puts it on top of the ball and picks the colour: dark, amber, or hot red) and, for an armed laid one, a pale ring of danger.
export const buildMineBall = (r, laid) => { const b = new Batch(); mineBall(b, r, laid ? 10 : 12, laid ? '#55555b' : COL.iron); return b.build(); };
export function buildMineBalloon(r = 34) {
  const bb = new Batch();
  bb.rod('#2b2622', V(0, r + 6, 0), V(0, r + 66, 0), 1.6, 0);
  bb.sphere(COL.canvas, 0, r + 100, 0, 27, 36, 27, 3);
  bb.geo('#a8443f', TORUS, mat(0, r + 100, 0, 27, 27, 27, PI / 2, 0, 0), 0); // a red band round the balloon
  bb.cone(COL.canvas, 0, r + 66, 0, 7, 12, 1.4, 0, 0, PI);
  return bb.build();
}
const RING = new THREE.MeshBasicMaterial({ color: '#ff3b2e', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
export const MINE_COLORS = { on: glow('#ff2e2e', 3), amber: glow('#ffb347', 2.6), off: new THREE.Color('#4a2a2a') };
export const MINE_MATS = { ringOn: RING, ringGeo: new THREE.CircleGeometry(1, 36), lampGeo: G.sphereLo };

// ---- the SUPPLY BALLOON: six red and white gores, a crate with a gold plus, ropes; a soft yellow glow behind it (flyers.js) ---------------------------------------------------------------
export function buildSupply() {
  const g = new THREE.Group();
  const b = new Batch();
  for (let k = 0; k < 6; k++) b.geo(k % 2 ? '#f3ead6' : '#a8443f', new THREE.SphereGeometry(1, 8, 14, (k * PI) / 3, PI / 3), mat(0, 62, 0, 92, 112, 92), 3);
  b.cone('#7a2a22', 0, 176, 0, 14, 12, 1.4, 0, 0, 0);
  b.geo('#4a3a30', TORUS, mat(0, 62, 0, 92, 92, 92, PI / 2, 0, 0), 0); // the equator band
  for (const s of [-1, 1]) for (const z of [-1, 1]) b.rod('#2b2622', V(s * 48, 12, z * 30), V(s * 22, -50, z * 18), 1.6, 0);
  b.box('#a0784a', 0, -72, 0, 56, 44, 44, 3);
  b.box('#7a5a38', 0, -72, 0, 58, 6, 46, 0);
  b.box(COL.gold, 0, -72, 23, 6, 24, 2, 0); b.box(COL.gold, 0, -72, 23, 24, 6, 2, 0); // the plus
  b.box(COL.gold, 0, -72, -23, 6, 24, 2, 0); b.box(COL.gold, 0, -72, -23, 24, 6, 2, 0);
  g.add(b.build());
  return g;
}

// ---- a PARACHUTE with a bailed-out pilot (cream canopy, a green stripe, cords) ------------------------------------------------------------------------------------------------------------
export function buildChute() {
  const g = new THREE.Group();
  const canopy = new Batch();
  canopy.geo('#eee6d2', new THREE.SphereGeometry(1, 16, 8, 0, PI * 2, 0, PI / 2), mat(0, 52, 0, 50, 36, 38), 2.4);
  canopy.geo('#8fb37a', new THREE.SphereGeometry(1, 6, 8, PI / 2 - 0.5, 1, 0, PI / 2), mat(0, 52.5, 0, 50.5, 36.5, 38.5), 0);
  const cg = tagSmall(canopy.build());
  g.add(cg);
  const body = new Batch();
  body.sphere(COL.bone, 0, 8, 0, 6.4, 6.6, 6, 1.6, true);
  body.sphere(COL.leather, 0, 11, 0, 6.8, 4, 6.2, 1.2, true);
  body.box(COL.grey, 0, -6, 0, 11, 18, 8, 1.6);
  for (const k of [-1, -0.4, 0.4, 1]) body.rod('#2b2622', V(k * 49, 52, 0), V(0, 2, 0), 0.9, 0);
  g.add(tagSmall(body.build()));
  g.userData.canopy = cg;
  return g;
}

// ---- a ROCKET (the batteries' homing rocket): red body, nose cone, grey fins; the flame is a particle ------------------------------------------------------------------------------------
export function buildRocket() {
  const b = new Batch();
  b.cyl(COL.red, 0, 0, 0, 7.6, 34, 2.4, 0, 0, PI / 2);
  b.cone('#7a2a22', 25, 0, 0, 7.6, 16, 2, 0, 0, -PI / 2);
  for (const k of [0, 1, 2]) b.box('#5a5558', -18, 0, 0, 12, 20, 2.6, 1.4, (k * PI) / 3, 0, 0);
  b.cyl('#3a3a3e', -17, 0, 0, 6, 4, 1, 0, 0, PI / 2);
  return tagSmall(b.build());
}

// ---- the specials (specials.js) -----------------------------------------------------------------------------------------------------------------------------------------------------------
// the GYRO-SAW: a steel toothed disc facing the viewer, a dark hub, a lamp that is yellow, and red while it dashes (flyers.js swaps the material and steps the spin)
const SAW_LAMP = glowMat('#f2d36b', 2.4), SAW_LAMP_DASH = glowMat('#ff2e55', 3);
export function buildSaw() {
  const g = new THREE.Group();
  const disc = new THREE.Group();
  const b = new Batch();
  b.cyl('#c9ced3', 0, 0, 0, 38, 7, 2.6, PI / 2, 0, 0, 38);
  for (let k = 0; k < 14; k++) { const a = (k / 14) * PI * 2; b.cone('#c9ced3', Math.cos(a) * 41, Math.sin(a) * 41, 0, 7, 20, 1.6, 0, 0, a - PI / 2); }
  b.cyl(COL.coal, 0, 0, 0, 22, 9, 1.6, PI / 2, 0, 0, 22);
  b.cyl('#4a4f63', 0, 0, 5, 15, 5, 1.2, PI / 2, 0, 0, 15);
  for (let k = 0; k < 4; k++) b.box('#7a8088', Math.cos((k * PI) / 2) * 27, Math.sin((k * PI) / 2) * 27, 0, 9, 9, 8, 0);
  disc.add(tagSmall(b.build()));
  g.add(disc);
  const lamp = new THREE.Mesh(G.sphereLo, SAW_LAMP);
  lamp.scale.setScalar(7); lamp.position.z = 9;
  g.add(lamp);
  g.userData.disc = disc; g.userData.lamp = lamp;
  g.scale.setScalar(1.35);
  return g;
}
export const SAW_MATS = { lamp: SAW_LAMP, dash: SAW_LAMP_DASH };

// an IMP: a red body with horns, a pair of folded-bat wings that beat (four held poses, drawn as instanced copies like the bats), glowing yellow eyes. sd = the spore-drone palette of the Fungal Depths { body, wing, eye }
export const IMP_FLAP = [0.6, 0.1, -0.5, 0.1];
const IMP_WING = flatShape([[0, 2], [14, 12], [28, 10], [20, 0], [24, -9], [10, -4]], 3.4);
function impPose(sd, ang) {
  const body = sd ? sd.body : '#a8443f', wing = sd ? sd.wing : '#5a1a1a', eye = sd ? sd.eye : '#f2d36b';
  const b = new Batch();
  b.sphere(body, 0, 0, 0, 14, 14, 13, 2.6);
  for (const x of [-1, 1]) { b.cone(COL.cream, x * 8, 18, 0, 3.4, 15, 1.4, 0, 0, -x * 0.3); b.sphere(wing, x * 5, -14, 0, 3, 5, 3, 0, true); }
  b.cone(wing, 0, -18, 0, 2.4, 14, 1, 0, 0, PI);
  for (const x of [-1, 1]) b.sphere(eye, x * 5, 3, 11, 3.2, 3.6, 2, 0, true);
  for (const sgn of [1, -1]) b.geo(wing, IMP_WING, wingMatrix(sgn, ang, sgn * 9, 4, -1), 1.6);
  return b.build();
}
export const buildImpPoses = (sd = null) => IMP_FLAP.map((a) => impPose(sd, a));

// the SNIPER ZEPPELIN: a plum envelope with pale ribs, a gondola, a lens that glows red as it charges (flyers.js scales its glow), the Ember emblem. About 260 long.
const LENS_MATS = [glowMat('#ff2a3c', 1.1), glowMat('#ff2a3c', 2.2), glowMat('#ff5a6a', 3.4)];
export function buildSniper() {
  const g = new THREE.Group();
  const b = new Batch();
  b.sphere('#3d2b4f', 0, 0, 0, 132, 50, 50, 4);
  for (const x of [-92, -46, 0, 46, 92]) b.geo('#7a6a8c', TORUS, mat(x, 0, 0, 50 * Math.sqrt(Math.max(0.05, 1 - (x / 132) ** 2)), 50 * Math.sqrt(Math.max(0.05, 1 - (x / 132) ** 2)), 50 * Math.sqrt(Math.max(0.05, 1 - (x / 132) ** 2)), 0, PI / 2, 0), 0);
  for (const s of [-1, 1]) b.box('#2a1d36', -112, s * 40, 0, 56, 6, 60, 2.4, 0, 0, s * 0.45); // fins
  b.box('#2a1d36', -112, 0, 0, 56, 62, 5, 2.4);
  b.box('#2a1d36', 0, -62, 0, 100, 28, 38, 3); // the gondola
  b.cyl(COL.ironDark, 20, -80, 0, 14, 18, 2.4, PI / 2, 0, 0, 14);
  for (const x of [-34, 0, 34]) b.sphere(COL.gold, x, -62, 20, 4, 4, 3, 0, true);
  emblem(b, 70, 4, 50, 14, 1); emblem(b, 70, 4, -50, 14, -1);
  g.add(b.build());
  const lens = new THREE.Mesh(G.sphereLo, LENS_MATS[0]);
  lens.scale.set(15, 15, 10);
  lens.position.set(60, -62, 12);
  g.add(lens);
  g.userData.lens = lens; g.userData.lensMats = LENS_MATS;
  return g;
}

// the HARPOON TUG: a brown tug with a dark stern plate, a glass porthole, a harpoon gun on top and a spinning prop. About 120 long, faces +x.
export function buildTug() {
  const g = new THREE.Group();
  const b = new Batch();
  b.sphere('#7a4a2a', -4, 0, 0, 62, 27, 26, 3.4); // a fat round hull
  b.geo('#5a3820', TORUS, mat(-4, -6, 0, 60, 60, 24, PI / 2, 0, 0), 0); // a dark belt round it
  b.box('#3a2a1d', -62, 4, 0, 14, 60, 34, 2.6); // the stern plate with a little rudder fin
  b.box('#3a2a1d', -76, 12, 0, 12, 40, 4, 1.6);
  b.cyl('#4a4440', -22, 38, 0, 9, 26, 2.2); // a funnel
  b.cyl('#2b2622', -22, 52, 0, 10.5, 5, 1.4);
  b.sphere(COL.glass, 26, 6, 21, 11, 11, 4, 1.6, true); // portholes
  b.sphere(COL.glass, 26, 6, -21, 11, 11, 4, 1.6, true);
  b.box('#5a5558', 8, 30, 0, 40, 14, 18, 2.4); // the harpoon gun
  b.rod(COL.ironDark, V(26, 34, 0), V(66, 42, 0), 3.2, 1.4);
  for (const x of [-34, 4, 40]) b.box(COL.gold, x, -2, 22, 4, 26, 1.4, 0);
  b.cone('#c9c5b8', 70, 0, 0, 11, 22, 2, 0, 0, -PI / 2);
  g.add(b.build());
  const pg = prop(COL.coal, 60, 7, 0, 6);
  pg.position.x = 80;
  g.add(pg);
  const blur = blurDisc(30, 82);
  g.add(blur);
  g.userData.prop = pg; g.userData.blur = blur;
  return g;
}
export function buildHarpoon() {
  const b = new Batch();
  b.box('#c9ced3', -15, 0, 0, 30, 5, 5, 1.2);
  b.cone('#c9ced3', 8, 0, 0, 9, 22, 1.6, 0, 0, -PI / 2);
  return tagSmall(b.build());
}

// ---- THE BOSSES: the Dread Zeppelin (dark envelope, red fins), the Bat Carrier (plum, with a hangar mouth under the gondola), the Iron Dreadnought (grey, armour plates, a ram prow) and, at the last stop of a voyage,
// THE FLAGSHIP: the Dreadnought at her biggest, in oxblood and gold, with a bridge, lamps and a pennant. The envelope's nose is to the LEFT (-x), at the player's ship; the gondola hangs below.
// z.guns[i].dx = -200, 0, 200: three turrets under the gondola (the sim's own); a model has them as pivots that flyers.js aims at our ship.
export function buildBoss(kind, flagship, colors = {}) {
  const g = new THREE.Group();
  const body = colors.body || '#3a3036', fin = colors.fin || '#5c1e1e';
  const k = flagship ? 1.0 : 1.0;
  const b = new Batch();
  // the envelope, with dark banding like sewn canvas
  const rx = 330 * k, ry = 115 * k;
  b.sphere(body, 0, 0, 0, rx, ry, ry, 6);
  for (let i = -3; i <= 3; i++) {
    const x = i * 90, rr = ry * Math.sqrt(Math.max(0.04, 1 - (x / rx) ** 2)) + 1.4;
    b.geo(flagship ? '#c9a24a' : kind === 'iron' ? '#2a2e33' : '#241c22', new THREE.TorusGeometry(1, 0.026, 6, 40), mat(x, 0, 0, rr, rr, rr, 0, PI / 2, 0), 0);
  }
  // tail fins (four: up, down and two to the sides), the rudder
  const finGeo = flatShape([[205, 8], [250, 112], [398, 178], [378, 18]], 9); // a fin: swept back from the envelope, like the 2D art's
  for (const sg of [-1, 1]) b.geo(fin, finGeo, mat(0, 0, 0, 1, 1, 1, sg > 0 ? 0 : PI, 0, 0), 3.4);
  const crossGeo = flatShape([[210, 6], [260, 120], [390, 150], [372, 12]], 8); // the cross fins lie flat (we see them edge-on from the side)
  for (const sg of [-1, 1]) b.geo(fin, crossGeo, mat(0, 0, 0, 1, 1, 1, (sg * PI) / 2, 0, 0), 3);
  // the gondola and what hangs on it
  b.box('#2a2226', 0, -138, 0, 440, 70, 92, 4.4);
  b.box('#3a3036', 0, -176, 0, 450, 10, 100, 3);
  for (let x = -2; x <= 2; x++) b.sphere(COL.gold, x * 70, -128, 47, 8, 8, 4, 0, true); // the lamps (windows): gold
  for (let x = -2; x <= 2; x++) b.sphere(COL.gold, x * 70, -128, -47, 8, 8, 4, 0, true);
  b.box('#4a3a30', 0, -88, 0, 150, 24, 60, 3); // the keel that joins it to the envelope
  for (const x of [-170, 170]) b.rod('#4a3a30', V(x, -100, 0), V(x * 0.8, -ry * 0.8, 0), 6, 2);
  if (kind === 'iron' || flagship) { // armour: riveted plates down the flanks, a ram at the nose
    for (let i = -4; i <= 4; i++) { b.box(i % 2 ? '#656d73' : '#555c62', i * 62, -26, 0, 56, 96 - Math.abs(i) * 6, ry * 1.5, 3); for (const sy of [-30, 14]) for (const zz of [1, -1]) b.sphere('#8a8f92', i * 62, sy, zz * (ry * 0.75 + 1), 3.2, 3.2, 2, 0, true); }
    b.cone('#3a3f44', -rx - 40, 0, 0, 36, 90, 3, 0, 0, PI / 2);
  }
  if (kind === 'carrier') { // the hangar mouth: a lit opening under the gondola
    for (const zz of [1, -1]) { // an open hangar mouth on each flank of the gondola: a black opening with a warm light inside and purple jambs
      b.box('#14110f', 0, -152, zz * 47.5, 150, 40, 3, 0);
      b.box('#d9a24a', 0, -139, zz * 49, 134, 4, 2, 0);
      for (const x of [-80, 80]) b.box('#6a3a8c', x, -152, zz * 48, 9, 46, 6, 1.6);
      for (const x of [-40, 0, 40]) b.cone('#2a1d36', x, -148, zz * 49, 6, 18, 0, 0, 0, PI);
    }
  }
  if (flagship) { // a bridge on the back, a mast with a pennant (flyers.js flutters it), the gold trim and big emblems
    b.box(COL.oxbloodDark, 20, ry + 8, 0, 120, 30, 60, 3.4);
    b.box('#14110f', 20, ry + 14, 31, 100, 12, 2, 0);
    for (const x of [-30, -10, 10, 30, 50]) b.box(COL.gold, 20 + x, ry + 14, 32, 8, 8, 1.4, 0);
    b.rod('#2b2622', V(40, ry + 20, 0), V(40, ry + 150, 0), 3, 1.6);
    for (const x of [-190, 190]) b.cyl('#3a3f44', x, ry + 6, 0, 13, 52, 2.6);
    b.box(COL.gold, 0, 0, ry + 0.5, rx * 1.2, 5, 1, 0); // a gold stripe down each flank
    b.box(COL.gold, 0, 0, -ry - 0.5, rx * 1.2, 5, 1, 0);
  }
  emblem(b, -30, 24, ry + 1, 70, 1); emblem(b, -30, 24, -ry - 1, 70, -1);
  g.add(b.build());
  // the three gun turrets under the gondola: a ball and a barrel on a pivot each (the sim says which are shot off: flyers.js hides the barrel and blackens the ball)
  const turrets = [];
  for (const dx of [-200, 0, 200]) {
    const t = new THREE.Group();
    const tb = new Batch();
    tb.sphere('#a8443f', 0, 0, 0, 26, 26, 26, 3.2);
    tb.cyl('#5a5558', 0, 12, 0, 12, 16, 1.6);
    const ballG = tb.build();
    t.add(ballG);
    const stump = new Batch();
    stump.sphere('#2a2a2a', 0, -2, 0, 17, 15, 17, 2.4);
    stump.cone('#1c1a1a', 4, 14, 0, 7, 22, 1.4, 0, 0, 0.5);
    const sg = stump.build();
    sg.visible = false;
    t.add(sg);
    const pv = new THREE.Group();
    const bb = new Batch();
    bb.box('#5a5558', 34, 0, 0, 80, 14, 14, 2.6);
    bb.box('#2b2622', 78, 0, 0, 10, 19, 19, 1.4);
    bb.box('#c9a85a', 40, 0, 0, 6, 17, 17, 0.6);
    pv.add(bb.build());
    t.add(pv);
    t.position.set(dx, -190, 0);
    g.add(t);
    turrets.push({ node: t, pivot: pv, dx, ball: ballG, stump: sg });
  }
  g.userData.turrets = turrets;
  // the flagship's pennant: rigid segments the keys re-pose (flyers.js)
  if (flagship) {
    const flag = new THREE.Group();
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const sg = new THREE.Group();
      const fb = new Batch();
      fb.box(i % 2 ? COL.gold : '#a8443f', 16, 0, 0, 32, 40, 3, 1.2);
      sg.add(fb.build());
      sg.position.x = i * 32;
      flag.add(sg);
      segs.push(sg);
    }
    flag.position.set(40, ry + 130, 0);
    g.add(flag);
    g.userData.flagSegs = segs;
  }
  g.userData.kind = kind; g.userData.flagship = !!flagship;
  g.userData.stacks = kind === 'iron' || flagship ? [[-190, ry + 8], [190, ry + 8]] : [];
  return g;
}
