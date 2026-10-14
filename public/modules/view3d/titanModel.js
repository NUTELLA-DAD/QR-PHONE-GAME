// THE ISLAND TITAN'S BODY IN 3D (3D.md section 38): the models. Everything here is built once, in the Titan's own frame facing +x (x forward, y UP, z toward the viewer; the origin is the middle of the torso;
// sizes are the sim's game px from config.CREATURES.TITAN, so the picture and the hit capsules agree) and never moves by itself:
//   buildTitan(cr, P)      the STILL body, the generic creature view's "head" record: the torso (a heavy faceted block of stone with broad shoulders), its shoulder mounds, back ridge, chest plates, the heartstone
//                          in the chest and the glowing vein that climbs the chest toward the island, and the heap of rubble at its feet that it takes boulders from.
//   buildPieces(cr, P)     the RIGID PIECES, merged in one geometry (a RigidSet places each by a matrix): the two LEGS, the HEAD (a blocky skull, a heavy brow, amber glowing eyes, a stone nose, an upper lip with teeth and
//                          the dark throat), the hinged JAW (with its teeth), the ISLAND (rock, soil, grass), two TREES, a RUIN, the CRYSTAL in four stages of cracking, a boulder, and (titanArms.js) the slabs and hands of the arms.
// Angular things are LOFTED solids with flat faces (loft() of the Drake's model) and jittered icosahedra for the rocks (flat-shaded, so the stone looks cut); they take the stone texture by box mapping (stoneUV).
// The ink outline comes from the Mesher's onormal. Flat-coloured pieces (crystal, grass, teeth, eyes) point at the texture's plain swatch.
import { THREE } from './style.js';
import { Mesher, RigidSet } from './creatureKit.js';
import { loft, horn } from './drakeModel.js';
import { TILE_PX } from './titanPaint.js';
import { buildArmPieces } from './titanArms.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
export const M4 = (pos, quat, scl) => new THREE.Matrix4().compose(pos || V(), quat || new THREE.Quaternion(), scl || V(1, 1, 1));
const qz = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
export const hash = (a, b, c = 0) => { let h = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const jit = (seed, k, amp) => 1 + (hash(seed, k) - 0.5) * 2 * amp;

// ---- the stone kit -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// box mapping of the tiling stone texture: every face takes the two coordinates its normal does not point along
export function stoneUV(geo, ox = 0, oy = 0, k = 1 / TILE_PX) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = p.count, uv = new Float32Array(n * 2), a = V(), b = V(), c = V(), nn = V();
  for (let i = 0; i + 2 < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    nn.copy(b).sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(nn.x), ay = Math.abs(nn.y), az = Math.abs(nn.z);
    for (let j = 0; j < 3; j++) {
      const v = j === 0 ? a : j === 1 ? b : c;
      let u, w;
      if (az >= ax && az >= ay) { u = v.x; w = v.y; } else if (ax >= ay) { u = v.z; w = v.y; } else { u = v.x; w = v.z; }
      uv[(i + j) * 2] = u * k + ox; uv[(i + j) * 2 + 1] = w * k + oy;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const ID = (u, v) => [u, v];
// textured stone / flat colour into a Mesher
export function stone(mesh, geo, matrix, o = {}) { const s = o.seed || 1; return mesh.add(stoneUV(geo, hash(s, 1) * 8, hash(s, 2) * 8), matrix, { ...o, uv: ID }); }
export function flat(mesh, geo, matrix, o = {}) { return mesh.add(geo, matrix, o); }

// a jittered icosahedron (a faceted rock): radii rx, ry, rz, flat shaded
export function rockGeo(rx, ry, rz, { detail = 1, jitter = 0.2, seed = 1, squashTop = 0 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = hash(Math.round(x * 90), Math.round(y * 90) + seed * 13, Math.round(z * 90)), s = 1 + (h - 0.5) * 2 * jitter;
    if (squashTop && y > 0) y *= 1 - squashTop;
    p.setXYZ(i, x * rx * s, y * ry * s, z * rz * s);
  }
  g.computeVertexNormals();
  return g;
}
// a cut block with jittered corners (a flat-faced slab of stone): w, h, d full sizes
export function blockGeo(w, h, d, { jitter = 0.08, seed = 1 } = {}) {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1).toNonIndexed(), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = hash(Math.round(x * 3), Math.round(y * 3) + seed * 7, Math.round(z * 3));
    p.setXYZ(i, x + (hash(seed, i % 8, 1) - 0.5) * w * jitter * (k + 0.3), y + (hash(seed, i % 8, 2) - 0.5) * h * jitter * (k + 0.3), z + (hash(seed, i % 8, 3) - 0.5) * d * jitter * (k + 0.3));
  }
  g.computeVertexNormals();
  return g;
}
// a ring of n points in the xz-plane at height y round (xc, zc): half sizes rx, rz, a superellipse (exp 2 = an ellipse, 4 = a rounded rectangle) with a radial jitter
export function ringXZ(n, y, xc, zc, rx, rz, { exp = 2, jitter = 0.05, seed = 1, k = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a), e = 2 / exp, cx = Math.sign(c) * Math.pow(Math.abs(c), e), sz = Math.sign(s) * Math.pow(Math.abs(s), e), j = jit(seed, i + k * 31, jitter);
    out.push(V(xc + rx * cx * j, y, zc + rz * sz * j));
  }
  return out;
}
// the same for a ring in the yz-plane at x (the skull and the feet are lofted along x): top / bottom heights, half width w
export function ringYZ(n, x, top, bot, w, { jitter = 0.04, seed = 1, k = 0 } = {}) {
  const out = [], mid = (top + bot) / 2, hh = (top - bot) / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 - (i / n) * TAU, sy = Math.sin(a), sz = Math.cos(a), j = jit(seed, i + k * 31, jitter);
    out.push(V(x, mid + hh * sy * j, w * sz * (Math.abs(sz) > 0.99 ? 1 : 0.94) * j));
  }
  return out;
}

// ---- the torso ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// stations [y, xCentre, halfWidth x, halfDepth z] from the neck down to the hips (the 2D picture's outline: broad shoulders, a thick waist), z kept inside +-430 so the whole body lies behind the lair's plain
const TORSO = [[2170, 40, 400, 300], [1990, 20, 740, 400], [1700, 10, 960, 430], [1280, 0, 930, 430], [820, 10, 860, 420], [320, 0, 740, 400], [-300, 0, 770, 410], [-640, 0, 690, 380]];
export function torsoZ(x, y) { // the depth of the torso's near skin at (x, y) (for what is stuck to it: the vein, the plates)
  let i = 0;
  while (i < TORSO.length - 2 && y < TORSO[i + 1][0]) i++;
  const a = TORSO[i], b = TORSO[i + 1], u = clamp((a[0] - y) / (a[0] - b[0]), 0, 1), xc = a[1] + (b[1] - a[1]) * u, wx = a[2] + (b[2] - a[2]) * u, wz = a[3] + (b[3] - a[3]) * u;
  const t = clamp((x - xc) / Math.max(1, wx), -0.97, 0.97);
  return wz * Math.sqrt(1 - t * t);
}
const SEG = (a, b, w, d, color, mesh, o = {}) => { // a thin stick from a to b (3D points): a box along the line
  const dir = b.clone().sub(a), len = dir.length(), mid = a.clone().add(b).multiplyScalar(0.5), q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.normalize());
  flat(mesh, new THREE.BoxGeometry(len, w, d), M4(mid, q), { color, ...o });
};

export function buildTitan(cr, P, opts = {}) {
  const OW = P.INK || 26, low = !!opts.low, mesh = new Mesher();
  const sides = low ? 9 : 12;
  // --- the torso: a loft through the stations, every ring a rounded octagon-ish with a little jitter: a heavy block of cut stone ---
  const rings = TORSO.map(([y, xc, wx, wz], i) => ringXZ(sides, y, xc, 0, wx, wz, { exp: 2.6, jitter: 0.045, seed: 5, k: i }));
  stone(mesh, loft(rings, true), null, { ow: OW, color: P.torso, name: 'mantle', seed: 3 });
  // shoulder mounds (where the arms come out) and the hunch of the back, in the same stone
  const lump = (c, r, col, sd, nm = 'mantle', jitterK = 0.18, d = 1) => stone(mesh, rockGeo(r.x, r.y, r.z, { detail: d, jitter: jitterK, seed: sd }), M4(c, qz((hash(sd, 4) - 0.5) * 0.5)), { ow: OW * 0.85, color: col, name: nm, seed: sd });
  lump(V(190, 1680, 340), V(450, 340, 300), P.stone, 11);
  lump(V(-330, 1700, -330), V(450, 340, 300), P.stoneDk, 12);
  lump(V(-560, 1420, 0), V(420, 700, 480), P.torso, 13);
  lump(V(-760, 1960, 120), V(330, 260, 330), P.stoneDk, 14);
  // the back ridge: rocks along the spine (the island sits on it)
  for (let i = 0; i < 5; i++) lump(V(-930 - (i % 2) * 40, 600 + i * 330, (i % 2 ? 90 : -70)), V(240 + (i % 3) * 30, 220, 280), i % 2 ? P.stoneDk : P.stone, 20 + i);
  // chest plates: heavy raised slabs on the near side, a belt of stone across the belly
  const plate = (x, y, w, h, sd, col) => { const z = torsoZ(x, y); stone(mesh, blockGeo(w, h, 120, { seed: sd, jitter: 0.12 }), M4(V(x, y, z - 18), qz((hash(sd, 9) - 0.5) * 0.18)), { ow: OW * 0.7, color: col, name: 'mantle', seed: sd }); };
  plate(120, 1650, 620, 300, 31, P.stoneLt); plate(560, 560, 520, 330, 32, P.stone); plate(-300, 500, 560, 360, 33, P.stoneLt); plate(250, -140, 700, 260, 34, P.stoneDk);
  // moss on the shoulders, the head's collar and the back: flat lumps in two greens
  const moss = (c, r, sd, col) => flat(mesh, rockGeo(r.x, r.y, r.z, { detail: 1, jitter: 0.25, seed: sd }), M4(c, qz((hash(sd, 4) - 0.5) * 0.4)), { ow: OW * 0.3, color: col, name: 'mantle' });
  moss(V(150, 1990, 330), V(300, 70, 160), 41, P.moss); moss(V(-360, 2030, -250), V(260, 60, 140), 42, P.mossDk); moss(V(-560, 1960, 160), V(320, 80, 220), 43, P.moss);
  moss(V(-700, 1180, 380), V(220, 60, 100), 44, P.mossDk); moss(V(500, 1350, 330), V(160, 50, 80), 45, P.moss);
  // --- the rubble heap at its feet (it picks its boulders from it): a mound of dark stone with loose rocks; in front of the plain's face, so it lies a little toward the viewer ---
  const hz = (opts.heapZ == null ? 180 : opts.heapZ);
  stone(mesh, rockGeo(880, 600, 290, { detail: 1, jitter: 0.12, seed: 51, squashTop: 0.2 }), M4(V(1210, -1700, hz)), { ow: OW * 0.9, color: P.stoneDk, name: 'heap', seed: 51 });
  for (const [x, y, r, k] of [[900, -1180, 230, 0], [1250, -1300, 260, 1], [1560, -1700, 220, 2], [700, -1650, 200, 3], [1100, -1850, 240, 4], [1850, -2000, 180, 5]]) stone(mesh, rockGeo(r, r * 0.8, r * 0.9, { detail: 1, jitter: 0.22, seed: 60 + k }), M4(V(x, y, hz + (k % 2 ? 90 : -40)), qz(k)), { ow: OW * 0.7, color: k % 2 ? P.stone : P.stoneLt, name: 'heap', seed: 60 + k });
  // --- the heartstone in its chest and the vein that climbs the chest toward the island: cyan, glowing (channels 4 and 3) ---
  const hx = 330, hy = 1000, hzz = torsoZ(hx, hy) + 18;
  const crown = new THREE.ConeGeometry(1, 1, 4, 1), base = new THREE.ConeGeometry(1, 1, 4, 1);
  crown.translate(0, 0.5, 0); base.rotateX(Math.PI); base.translate(0, -0.5, 0);
  flat(mesh, crown, M4(V(hx, hy, hzz), qy(Math.PI / 4), V(190, 250, 110)), { ow: OW * 0.5, color: P.crystalIn, glow: 4, name: 'heartstone' });
  flat(mesh, base, M4(V(hx, hy, hzz), qy(Math.PI / 4), V(190, 250, 110)), { ow: OW * 0.5, color: P.crystal, glow: 4, name: 'heartstone' });
  flat(mesh, new THREE.TorusGeometry(215, 34, 5, 10), M4(V(hx, hy, hzz - 20), qy(0), V(1, 1.25, 0.6)), { ow: OW * 0.5, color: P.stoneLt, name: 'heartstone' });
  const vein = [[330, 1000], [200, 1300], [60, 1480], [-120, 1750], [-380, 1950]];
  for (let i = 0; i < vein.length - 1; i++) {
    const a = vein[i], b = vein[i + 1];
    SEG(V(a[0], a[1], torsoZ(a[0], a[1]) + 14), V(b[0], b[1], torsoZ(b[0], b[1]) + 14), 74, 42, P.crystal, mesh, { ow: OW * 0.35, glow: 3, name: 'vein' });
    flat(mesh, rockGeo(70, 70, 50, { detail: 0, jitter: 0.2, seed: 70 + i }), M4(V(b[0], b[1], torsoZ(b[0], b[1]) + 26)), { ow: OW * 0.3, color: P.crystalIn, glow: 3, name: 'vein' });
  }
  const geometry = mesh.build();
  const torso = cr.parts.find((p) => p.kind === 'mantle');
  return {
    geometry, dynGeometry: null, ranges: mesh.ranges, dynRanges: {}, dyn: {}, sil: { L: new Float32Array(0), R: new Float32Array(0), n: 0 }, eyes: [], mouth: null, heart: null,
    mantle: { S: V(), X: V(1, 0, 0), Y: V(0, 1, 0), M: new THREE.Matrix4(), R: torso ? torso.shape.r : 820, L: torso ? torso.shape.len : 1750, sz: 1 }, tris: mesh.verts / 3, dynTris: 0,
  };
}

// ---- the legs -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// local frame: x = 0 on the leg's own centre line, y as in the body frame (the hip at +420, the soles at -2200)
const LEG = [[420, 0, 330, 250], [-300, 0, 305, 240], [-900, -15, 285, 235], [-1350, 0, 305, 245], [-1850, -15, 335, 262]];
function addLeg(mesh, P, nm, seed, OW, sides) {
  const rings = LEG.map(([y, xc, wx, wz], i) => ringXZ(sides, y, xc, 0, wx, wz, { exp: 2.5, jitter: 0.06, seed, k: i }));
  stone(mesh, loft(rings, true), null, { ow: OW, color: P.stone, name: nm, seed });
  stone(mesh, rockGeo(330, 260, 300, { detail: 1, jitter: 0.18, seed: seed + 1 }), M4(V(-10, -1080, 0)), { ow: OW * 0.8, color: P.stoneLt, name: nm, seed: seed + 1 }); // the knee
  flat(mesh, rockGeo(210, 60, 170, { detail: 1, jitter: 0.25, seed: seed + 2 }), M4(V(-30, -830, 20)), { ow: OW * 0.3, color: P.moss, name: nm });
  // the foot: a long block of darker stone, toes at the front
  const foot = [[-480, -1900, -2200, 250], [-120, -1880, -2200, 305], [380, -1950, -2200, 310], [780, -2000, -2200, 270], [940, -2070, -2200, 200]];
  stone(mesh, loft(foot.map(([x, t, b, w], i) => ringYZ(8, x, t, b, w, { jitter: 0.04, seed: seed + 3, k: i })), true), null, { ow: OW, color: P.stoneDk, name: nm, seed: seed + 3 });
  for (const dz of [-150, 0, 150]) stone(mesh, rockGeo(120, 90, 100, { detail: 0, jitter: 0.2, seed: seed + 7 + dz }), M4(V(930, -2110, dz)), { ow: OW * 0.6, color: P.stoneLt, name: nm, seed: seed + 8 });
  stone(mesh, rockGeo(250, 120, 280, { detail: 1, jitter: 0.2, seed: seed + 4 }), M4(V(0, -1900, 0)), { ow: OW * 0.7, color: P.stone, name: nm, seed: seed + 4 }); // the ankle
}

// ---- the head ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// local frame: the head's centre (HEAD.AT) at the origin, +x the way it faces
export const JAW_PIVOT = V(260, -130, 0);
function addHead(mesh, P, OW, low) {
  // the skull: its lower front is cut away (below the lip there is only the jaw), so a dropped jaw opens a gap the camera sees into from the side
  const S = [[-560, 400, -260, 250], [-300, 640, -580, 400], [0, 690, -580, 430], [200, 670, -560, 430], [300, 640, -540, 425], [312, 640, -30, 425], [520, 520, -30, 400], [640, 150, -30, 340], [700, 110, -30, 290]];
  const rings = S.map(([x, top, bot, w], i) => ringYZ(8, x, top, bot, w, { jitter: 0.05, seed: 9, k: i }));
  stone(mesh, loft(rings, true), null, { ow: OW, color: P.head, name: 'head', seed: 9 });
  // the heavy brow: a dark slab over the eyes, jutting forward; moss on the crown and a couple of crown stones
  stone(mesh, blockGeo(640, 160, 880, { seed: 3, jitter: 0.06 }), M4(V(380, 270, 0), qz(-0.05)), { ow: OW * 0.8, color: P.stoneDk, name: 'head', seed: 3 });
  stone(mesh, rockGeo(260, 200, 330, { detail: 1, jitter: 0.2, seed: 4 }), M4(V(-120, 640, 0)), { ow: OW * 0.8, color: P.stone, name: 'head', seed: 4 });
  flat(mesh, rockGeo(330, 80, 300, { detail: 1, jitter: 0.25, seed: 5 }), M4(V(-140, 770, 20), qz(0.1)), { ow: OW * 0.3, color: P.moss, name: 'head' });
  flat(mesh, rockGeo(180, 60, 150, { detail: 1, jitter: 0.25, seed: 6 }), M4(V(-380, 520, -150)), { ow: OW * 0.3, color: P.mossDk, name: 'head' });
  stone(mesh, rockGeo(170, 150, 150, { detail: 0, jitter: 0.2, seed: 7 }), M4(V(-420, 300, 300)), { ow: OW * 0.6, color: P.stoneLt, name: 'head', seed: 7 }); // ears
  stone(mesh, rockGeo(170, 150, 150, { detail: 0, jitter: 0.2, seed: 8 }), M4(V(-420, 300, -300)), { ow: OW * 0.6, color: P.stoneLt, name: 'head', seed: 8 });
  // a blocky nose bridge above the lip
  stone(mesh, blockGeo(210, 230, 330, { seed: 6, jitter: 0.1 }), M4(V(640, 170, 0), qz(-0.1)), { ow: OW * 0.7, color: P.stoneLt, name: 'head', seed: 6 });
  // the eyes: a dark socket and a glowing amber ball (glow channel 1) on each side, under the brow
  for (const sz of [1, -1]) {
    flat(mesh, rockGeo(165, 140, 90, { detail: 1, jitter: 0.1, seed: 10 }), M4(V(365, 70, sz * 400)), { ow: OW * 0.5, color: P.stoneDk, name: 'head' });
    flat(mesh, new THREE.SphereGeometry(1, low ? 8 : 12, low ? 6 : 8), M4(V(375, 70, sz * 450), null, V(140, 115, 56)), { ow: 0, color: P.eye, glow: 1, name: 'head' });
    flat(mesh, new THREE.SphereGeometry(1, 8, 6), M4(V(395, 67, sz * 492), null, V(30, 46, 14)), { ow: 0, color: P.eyeDk, name: 'head' });
  }
  // the upper lip (a heavy slab across the face, a little narrower than the head) with its row of stone teeth; behind it the dark throat that shows when the jaw drops
  stone(mesh, blockGeo(540, 140, 700, { seed: 7, jitter: 0.06 }), M4(V(560, 55, 0)), { ow: OW * 0.75, color: P.stone, name: 'head', seed: 11 });
  flat(mesh, new THREE.BoxGeometry(70, 330, 600), M4(V(345, -110, 0)), { ow: 0, color: P.mouthIn, glow: 2, name: 'head' });
  flat(mesh, new THREE.BoxGeometry(520, 40, 560), M4(V(590, -2, 0)), { ow: 0, color: P.mouthIn, glow: 2, name: 'head' }); // the roof of the mouth
  for (let k = 0; k < 5; k++) {
    const z = (k - 2) * 140, tooth = new THREE.ConeGeometry(50, 130, 4, 1);
    tooth.rotateX(Math.PI);
    flat(mesh, tooth, M4(V(790, -60, z), qy(Math.PI / 4)), { ow: OW * 0.25, color: P.tooth, name: 'head' });
  }
  // the lower jaw (its own piece, hinged at the back, inside the cheek: it drops for the roar): a heavy slab with teeth and the floor of the mouth
  stone(mesh, blockGeo(690, 220, 720, { seed: 8, jitter: 0.06 }), M4(V(545, -150, 0)), { ow: OW * 0.75, color: P.stoneDk, name: 'jaw', seed: 12 });
  for (let k = 0; k < 4; k++) { const z = (k - 1.5) * 160, tooth = new THREE.ConeGeometry(46, 120, 4, 1); flat(mesh, tooth, M4(V(820, -10, z), qy(Math.PI / 4)), { ow: OW * 0.25, color: P.tooth, name: 'jaw' }); }
  flat(mesh, new THREE.BoxGeometry(440, 30, 560), M4(V(560, -38, 0)), { ow: 0, color: P.mouthIn, glow: 2, name: 'jaw' });
}

// ---- the island ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// the island's top is the sim's walking surface: y = -ISLAND.TOP exactly (flat), covering X0..X1 (plus a little) in x and z from Z[0] to Z[1] (z in the body frame; the crew walk at the world depth 16)
function addIsland(mesh, P, OW, I, Zr, low) {
  const top = -I.TOP, x0 = I.X0, x1 = I.X1, xc = (x0 + x1) / 2, wx = (x1 - x0) / 2 + 110, zc = (Zr[0] + Zr[1]) / 2, wz = (Zr[1] - Zr[0]) / 2, n = low ? 14 : 20;
  const ring = (y, k, sx = 1, sz = 1, o = 0) => ringXZ(n, y, xc, zc, wx * sx + o, wz * sz + o, { exp: 4, jitter: 0.035, seed: 77, k });
  // grass: the flat top (cap at exactly `top`), a rounded lip
  flat(mesh, loft([ring(top - 70, 0, 1.0, 1.0, 40), ring(top - 22, 1, 1.0, 1.0, 20), ring(top, 2, 0.985, 0.985, 0)], true), null, { ow: OW * 0.7, color: P.grass, name: 'isle' });
  flat(mesh, loft([ring(top - 100, 3, 0.98, 0.98, 20), ring(top - 210, 4, 0.965, 0.965, 0)], true), null, { ow: OW * 0.5, color: P.grassDk, name: 'isle' });
  // the earth band under the grass, then the rock hanging below: tapering to a rough point
  const ys = [top - 190, top - 330, top - 620, top - 900, top - 1130, top - 1250];
  const sc = [0.94, 0.88, 0.7, 0.46, 0.22, 0.06];
  stone(mesh, loft(ys.map((y, i) => ring(y, 5 + i, sc[i], sc[i] * 0.95)), true), null, { ow: OW, color: P.stoneDk, name: 'isle', seed: 21 });
  flat(mesh, loft([ring(top - 170, 11, 0.95, 0.95, 24), ring(top - 330, 12, 0.89, 0.89, 12), ring(top - 460, 13, 0.82, 0.82, 0)], true), null, { ow: OW * 0.5, color: P.soil, name: 'isle' });
  // hanging rocks and roots under it
  for (const [dx, dz, r, dy, k] of [[-700, -40, 190, -520, 0], [-300, 120, 230, -760, 1], [350, 40, 170, -560, 2], [720, -60, 150, -430, 3], [-60, -180, 150, -640, 4]]) stone(mesh, rockGeo(r, r * 1.5, r * 0.9, { detail: 1, jitter: 0.2, seed: 80 + k }), M4(V(xc + dx, top + dy, zc + dz), qz(k * 0.7)), { ow: OW * 0.7, color: k % 2 ? P.stone : P.stoneDk, name: 'isle', seed: 80 + k });
  for (let k = 0; k < 4; k++) { const rx = x0 + 330 + k * 560, h = horn(V(rx, top - 300, zc + 160), V(0.1 * (k - 1.5), -1, 0), 560 + k * 60, 30, { sides: 4, rings: 4, endR: 0.2 }); flat(mesh, h.g, null, { ow: OW * 0.25, color: P.trunk, name: 'isle' }); } // roots
  // little tufts and flowers on the grass edge (low: they never hide a man)
  for (let k = 0; k < 7; k++) { const x = x0 + 120 + k * 300 + hash(k, 3) * 90, z = Zr[1] - 70 - hash(k, 5) * 90; flat(mesh, rockGeo(70, 34, 60, { detail: 0, jitter: 0.25, seed: 90 + k }), M4(V(x, top + 14, z)), { ow: OW * 0.2, color: k % 3 ? P.grassDk : P.leafLt, name: 'isle' }); }
}
function addTree(mesh, P, OW, x, base, z, r, nm, seed) {
  const trunk = horn(V(x, base - 20, z), V(0.04, 1, 0), r * 1.45, r * 0.2, { sides: 6, rings: 2, endR: 0.65 });
  flat(mesh, trunk.g, null, { ow: OW * 0.35, color: P.trunk, name: nm });
  const y = base + r * 1.6;
  flat(mesh, rockGeo(r, r * 0.9, r, { detail: 1, jitter: 0.12, seed }), M4(V(x, y, z)), { ow: OW * 0.55, color: P.leafDk, name: nm });
  flat(mesh, rockGeo(r * 0.7, r * 0.62, r * 0.7, { detail: 1, jitter: 0.12, seed: seed + 1 }), M4(V(x - r * 0.3, y + r * 0.28, z + r * 0.35)), { ow: OW * 0.4, color: P.leaf, name: nm });
  flat(mesh, rockGeo(r * 0.45, r * 0.4, r * 0.45, { detail: 0, jitter: 0.1, seed: seed + 2 }), M4(V(x - r * 0.55, y + r * 0.5, z + r * 0.7)), { ow: OW * 0.3, color: P.leafLt, name: nm });
}
function addRuin(mesh, P, OW, x, base, z) {
  const pil = (dx, h, sd) => stone(mesh, blockGeo(130, h, 150, { seed: sd, jitter: 0.1 }), M4(V(x + dx, base + h / 2 - 10, z)), { ow: OW * 0.5, color: P.ruin, name: 'ruin', seed: sd });
  pil(-115, 340, 91); pil(115, 260, 92);
  stone(mesh, blockGeo(340, 90, 160, { seed: 93, jitter: 0.1 }), M4(V(x - 30, base + 330, z), qz(0.1)), { ow: OW * 0.5, color: P.stoneLt, name: 'ruin', seed: 93 });
  flat(mesh, rockGeo(120, 40, 80, { detail: 0, jitter: 0.2, seed: 94 }), M4(V(x - 120, base + 385, z)), { ow: OW * 0.2, color: P.moss, name: 'ruin' });
  stone(mesh, rockGeo(100, 60, 90, { detail: 0, jitter: 0.2, seed: 95 }), M4(V(x + 280, base + 20, z + 80)), { ow: OW * 0.4, color: P.ruin, name: 'ruin', seed: 95 });
}

// ---- the crystal, in four stages of cracking -----------------------------------------------------------------------------------------------------------------------------------------------------------
// local frame: the foot on the island's top at the origin, up = +y. stage 0 whole; 1 a crack; 2 the tip broken, more cracks, a shard lies by it; 3 half gone, shattered
function addCrystal(mesh, P, OW, R, stage) {
  const nm = 'crys' + stage, spire = (base, dir, len, r0, endR, col, sides = 6, glow = 3, ow = OW * 0.5) => { const h = horn(base, dir, len, r0, { sides, rings: 3, endR, flat: 0.9 }); flat(mesh, h.g, null, { ow, color: col, glow, name: nm }); return h; };
  const H = [1, 1, 0.66, 0.4][stage];
  spire(V(0, -30, 0), V(0.04, 1, 0), 3.1 * R * H, 0.62 * R, stage >= 2 ? 0.5 : 0, P.crystal, 6, 3);
  spire(V(0, -10, 0), V(0.04, 1, 0), 2.0 * R * H, 0.3 * R, stage >= 2 ? 0.45 : 0.08, P.crystalIn, 6, 4, 0); // the pale heart (it burns brighter)
  spire(V(-0.7 * R, -30, 0.1 * R), V(-0.38, 1, 0.05), (stage >= 3 ? 0.9 : 1.55) * R, 0.42 * R, stage >= 2 ? 0.4 : 0, P.crystalDk, 5, 3);
  if (stage < 3) spire(V(0.78 * R, -30, -0.1 * R), V(0.42, 1, -0.05), (stage >= 2 ? 1.0 : 1.35) * R, 0.38 * R, stage >= 2 ? 0.4 : 0, P.crystalDk, 5, 3);
  spire(V(-0.3 * R, -30, 0.7 * R), V(-0.15, 1, 0.55), 0.8 * R, 0.24 * R, 0, P.crystal, 5, 3);
  stone(mesh, rockGeo(1.5 * R, 0.3 * R, 1.1 * R, { detail: 1, jitter: 0.2, seed: 99 }), M4(V(0, -6, 0)), { ow: OW * 0.5, color: P.stoneDk, name: nm, seed: 99 }); // the rocks it grows from
  if (stage >= 1) { // dark cracks across its near face
    const cr = [[[-0.2, 0.2], [0.1, 0.9], [-0.1, 1.5], [0.2, 2.2]], [[0.3, 0.1], [0.05, 0.6], [0.3, 1.1]], [[-0.4, 0.5], [-0.1, 1.0]]];
    for (let c = 0; c < Math.min(stage + 1, cr.length); c++) for (let i = 0; i < cr[c].length - 1; i++) { const a = cr[c][i], b = cr[c][i + 1]; if (b[1] * 1.0 > 3.0 * H) continue; SEG(V(a[0] * R, a[1] * R * H, 0.55 * R * (1 - Math.abs(a[0]) * 0.4) + 12), V(b[0] * R, b[1] * R * H, 0.55 * R * (1 - Math.abs(b[0]) * 0.4) + 12), 16, 14, P.crack, mesh, { ow: 0, name: nm }); }
  }
  if (stage >= 2) for (const [x, z, k] of [[1.1, 0.7, 0], [-1.3, 0.5, 1], [0.4, 1.1, 2]]) { const h = horn(V(x * R, 0, z * R), V(0.5 * (k - 1), 0.25, 1), 0.7 * R, 0.16 * R, { sides: 4, rings: 2, endR: 0 }); flat(mesh, h.g, null, { ow: OW * 0.3, color: P.crystal, glow: 3, name: nm }); } // shards on the ground
}

// ---- the boulder ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function addBoulder(mesh, P, OW, r, nm, seed) {
  stone(mesh, rockGeo(r, r * 0.95, r * 0.95, { detail: 1, jitter: 0.16, seed }), null, { ow: OW * 0.8, color: P.boulder, name: nm, seed });
  flat(mesh, rockGeo(r * 0.5, r * 0.22, r * 0.5, { detail: 0, jitter: 0.2, seed: seed + 1 }), M4(V(-r * 0.4, r * 0.72, r * 0.3)), { ow: OW * 0.2, color: P.moss, name: nm });
  stone(mesh, rockGeo(r * 0.55, r * 0.4, r * 0.5, { detail: 0, jitter: 0.2, seed: seed + 2 }), M4(V(r * 0.5, -r * 0.45, r * 0.45)), { ow: OW * 0.3, color: P.boulderDk, name: nm, seed: seed + 2 });
}

// ---- all the rigid pieces ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
export function buildPieces(cr, P, opts = {}) {
  const OW = P.INK || 26, low = !!opts.low, T = opts.T, mesh = new Mesher(), sides = low ? 9 : 12;
  addLeg(mesh, P, 'legN', 101, OW, sides);
  addLeg(mesh, P, 'legF', 111, OW, sides);
  addHead(mesh, P, OW, low); // (the head, then the jaw: each name's vertices are one run)
  addIsland(mesh, P, OW, T.ISLAND, opts.Z.ISLAND, low);
  addTree(mesh, P, OW, T.ISLAND.X0 + 420, -T.ISLAND.TOP, opts.Z.ISLAND[0] + 330, 200, 'treeA', 120);
  addTree(mesh, P, OW, T.ISLAND.X1 - 380, -T.ISLAND.TOP, opts.Z.ISLAND[0] + 210, 170, 'treeB', 130);
  addRuin(mesh, P, OW, (T.ISLAND.X0 + T.ISLAND.X1) / 2 + 450, -T.ISLAND.TOP, opts.Z.ISLAND[0] + 560);
  for (let s = 0; s < 4; s++) addCrystal(mesh, P, OW, T.CRYSTAL.R, s);
  for (let b = 0; b < 3; b++) addBoulder(mesh, P, OW, T.BOULDER.R, 'boulder' + b, 140 + b * 7);
  const arms = buildArmPieces(mesh, P, OW, T, { ...opts, cr });
  const geometry = mesh.build();
  return { geometry, set: new RigidSet(geometry, mesh.ranges), ranges: mesh.ranges, tris: mesh.verts / 3, arms };
}
