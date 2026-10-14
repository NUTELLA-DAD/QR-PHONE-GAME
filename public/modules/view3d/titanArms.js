// THE ISLAND TITAN'S ARMS IN 3D (3D.md section 39): FLOATING STONES. An arm is three chunky faceted boulders, one per sim segment, that float a little apart (no elbow: nothing joins them but light). Between the stones
// the arm is held by a glowing cyan TETHER (a thin beam from joint to joint, hidden inside the stones, so it shows only in the gaps), a diamond of crystal at each joint, a few crystal SHARDS that orbit it, and a soft
// glow (titanFx.js). At the shoulder the beam ends in a crystal SOCKET that stays when the arm is gone. At the wrist a big PALM CRYSTAL floats among four FINGER stones: they spread (open), clench (fist), close round
// the gasbag (grip), cradle a boulder, or (an arm at a third of its health) lose two of their number. A hurt arm has a boulder with a crater, bright cracks and loose pebbles ("cracked": the view swaps it in).
// Every piece is built in its own frame (a stone at its centre with +x along the arm; the tether from the joint along +x; the palm at the wrist) so the view can place it by a matrix from the sim's own segments.
import { THREE } from './style.js';
import { stone, flat, rockGeo, V, M4, hash } from './titanModel.js';

const qz = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), a);
const qy = (a) => new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), a);
const qx = (a) => new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), a);
const SEGBOX = (mesh, a, b, w, d, color, o) => { // a thin stick from a to b (3D points)
  const dir = b.clone().sub(a), len = Math.max(1, dir.length()), mid = a.clone().add(b).multiplyScalar(0.5);
  flat(mesh, new THREE.BoxGeometry(len, w, d), M4(mid, new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), dir.normalize())), { color, ...o });
};
// a bipyramid (a cut crystal) along +x: half length h, radius r
const diamond = (h, r, sides = 6) => {
  const a = new THREE.ConeGeometry(r, h, sides, 1), b = new THREE.ConeGeometry(r, h, sides, 1);
  a.translate(0, h / 2, 0); a.rotateZ(-Math.PI / 2);
  b.rotateX(Math.PI); b.translate(0, -h / 2, 0); b.rotateZ(-Math.PI / 2);
  return [a, b];
};
const putDiamond = (mesh, h, r, at, rot, color, glow, ow, name, sides, dk) => { diamond(h, r, sides).forEach((g, i) => flat(mesh, g, M4(at, rot), { ow, color: i && dk ? dk : color, glow, name })); }; // (dk: the colour of the lower half: two tones read as facets)

// ---- a boulder of the arm (and the fingers): a rounded faceted stone with moss on top, cyan crack veins on its near face; cracked = a crater, bright cracks, pebbles loose beside it -----------------------------
// rx along the arm, ry up, rz in depth; built at the origin
export function addStoneBody(mesh, P, OW, rx, ry, rz, name, seed, o = {}) {
  const cracked = !!o.cracked, g = rockGeo(rx, ry, rz, { detail: 1, jitter: cracked ? 0.15 : 0.11, seed });
  if (cracked) { // a crater: the vertices near a point on the upper far side are pushed in
    const p = g.attributes.position, q = V(rx * 0.5, ry * 0.5, rz * 0.5), R0 = Math.min(rx, ry, rz) * 0.95, v = V();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const d = v.distanceTo(q) / R0; if (d < 1) { v.multiplyScalar(1 - 0.34 * (1 - d)); p.setXYZ(i, v.x, v.y, v.z); } }
    g.computeVertexNormals();
  }
  stone(mesh, g, null, { ow: OW * 0.9, color: o.color || P.stone, name, seed });
  stone(mesh, rockGeo(rx * 0.55, ry * 0.5, rz * 0.5, { detail: 0, jitter: 0.2, seed: seed + 1 }), M4(V(-rx * 0.22, -ry * 0.5, rz * 0.46), qz(0.2)), { ow: OW * 0.6, color: P.stoneLt, name, seed: seed + 1 }); // a pale facet plate, front low
  stone(mesh, rockGeo(rx * 0.42, ry * 0.4, rz * 0.4, { detail: 0, jitter: 0.2, seed: seed + 2 }), M4(V(rx * 0.5, -ry * 0.1, rz * 0.5), qz(-0.3)), { ow: OW * 0.55, color: P.stoneDk, name, seed: seed + 2 }); // a dark one on the front end
  if (!o.noMoss) { flat(mesh, rockGeo(rx * 0.62, ry * 0.16, rz * 0.55, { detail: 1, jitter: 0.25, seed: seed + 3 }), M4(V(-rx * 0.1, ry * 0.86, rz * 0.08), qz(0.06)), { ow: OW * 0.3, color: P.moss, name }); flat(mesh, rockGeo(rx * 0.3, ry * 0.12, rz * 0.4, { detail: 0, jitter: 0.25, seed: seed + 4 }), M4(V(rx * 0.42, ry * 0.7, rz * 0.2)), { ow: OW * 0.25, color: P.mossDk, name }); }
  // thin cyan veins on the near face
  const zz = (x, y) => rz * Math.sqrt(Math.max(0.05, 1 - (x / rx) * (x / rx) - (y / ry) * (y / ry))) * 1.07 + 8;
  const vein = (pts, w, col, glow) => { for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1]; SEGBOX(mesh, V(ax * rx, ay * ry, zz(ax * rx, ay * ry)), V(bx * rx, by * ry, zz(bx * rx, by * ry)), w, 14, col, { ow: 0, glow, name }); } };
  const s = hash(seed, 3) < 0.5 ? 1 : -1;
  vein([[-0.55 * s, 0.35], [-0.3 * s, 0.05], [-0.38 * s, -0.3], [-0.1 * s, -0.55]], cracked ? 24 : 15, P.crystal, 3);
  if (cracked) vein([[0.45 * s, 0.6], [0.3 * s, 0.25], [0.5 * s, -0.1]], 20, P.crystalIn, 3);
  if (cracked) { // the crater: thick glowing cracks across it, and a few pebbles floating off the break
    vein([[0.15, 0.85], [0.3, 0.5], [0.12, 0.2], [0.34, -0.15], [0.2, -0.5]], 34, P.crystalIn, 4);
    vein([[0.3, 0.5], [0.62, 0.42], [0.8, 0.15]], 26, P.crystal, 3);
    for (const [px, py, pz, pr, k] of [[0.72, 0.78, 0.35, 0.2, 0], [0.9, 0.35, 0.5, 0.14, 1], [0.55, 1.12, 0.15, 0.12, 2]]) stone(mesh, rockGeo(pr * ry, pr * ry * 0.8, pr * ry * 0.9, { detail: 0, jitter: 0.25, seed: seed + 10 + k }), M4(V(px * rx, py * ry, pz * rz), qz(k)), { ow: OW * 0.45, color: k % 2 ? P.stoneLt : P.stone, name, seed: seed + 10 + k });
  }
}

// ---- the tether: a thin beam from the joint along +x for L: a cyan prism with a pale core (hidden inside the stones, it shows in the gaps) -------------------------------------------------------------------------
export function addTether(mesh, P, L, name, w = 1) {
  const hex = (r, col, glow, len) => { const g = new THREE.CylinderGeometry(r, r, len, 6, 1); g.rotateZ(Math.PI / 2); g.translate(len / 2, 0, 0); flat(mesh, g, null, { ow: 0, color: col, glow, name }); };
  hex(40 * w, P.crystal, 3, L);
  flat(mesh, new THREE.BoxGeometry(L, 26 * w, 14 * w), M4(V(L / 2, 6 * w, 34 * w)), { ow: 0, color: P.crystalIn, glow: 4, name }); // a pale highlight along the near face: the beam has facets
  flat(mesh, new THREE.BoxGeometry(L, 14 * w, 12 * w), M4(V(L / 2, -22 * w, 30 * w)), { ow: 0, color: P.crystalDk, glow: 3, name });
  for (const u of [0.07, 0.93, 0.5]) putDiamond(mesh, 55 * w, 42 * w, V(L * u, 0, 0), new THREE.Quaternion(), P.crystalIn, 4, 0, name, 6, P.crystal); // beads of light along it (the ones in the gaps show)
}
// a joint's crystal: a diamond along the arm with a pale heart (built at the joint)
export function addNode(mesh, P, OW, r, name) {
  putDiamond(mesh, r * 1.55, r, V(), new THREE.Quaternion(), P.crystal, 3, OW * 0.4, name, 6, P.crystalDk);
  putDiamond(mesh, r * 1.0, r * 0.5, V(r * 0.1, 0, r * 0.2), new THREE.Quaternion(), P.crystalIn, 4, 0, name, 6);
}
// three crystal shards that orbit the arm's axis at distance d (built round the x axis; the view turns the piece by a stepped angle)
export function addShards(mesh, P, OW, d, s, name) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + hash(s, i) * 0.6, x = (i - 1) * s * 0.8, g = new THREE.ConeGeometry(s * 0.32, s * 1.5, 4, 1);
    flat(mesh, g, M4(V(x, Math.cos(a) * d, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(a + 0.7, hash(s, i + 4) * 3, hash(s, i + 8) * 3))), { ow: OW * 0.25, color: i === 1 ? P.crystalIn : P.crystal, glow: i === 1 ? 4 : 3, name });
  }
}
// the shoulder socket: a dark stone cup with the crystal burning in it (built at the shoulder, the diamond along the arm)
export function addSocket(mesh, P, OW, r, name, seed) {
  stone(mesh, rockGeo(r * 1.0, r * 0.95, r * 0.9, { detail: 1, jitter: 0.12, seed }), M4(V(-r * 0.55, 0, -r * 0.1)), { ow: OW * 0.7, color: P.stoneDk, name, seed }); // the cup, behind the gem
  stone(mesh, rockGeo(r * 0.42, r * 0.34, r * 0.5, { detail: 0, jitter: 0.2, seed: seed + 5 }), M4(V(-r * 0.1, r * 0.8, r * 0.15)), { ow: OW * 0.4, color: P.stoneLt, name, seed: seed + 5 }); // two rim stones above and below the gem
  stone(mesh, rockGeo(r * 0.42, r * 0.34, r * 0.5, { detail: 0, jitter: 0.2, seed: seed + 6 }), M4(V(-r * 0.1, -r * 0.8, r * 0.15)), { ow: OW * 0.4, color: P.stoneLt, name, seed: seed + 6 });
  putDiamond(mesh, r * 1.1, r * 0.78, V(r * 0.15, 0, r * 0.25), new THREE.Quaternion(), P.crystal, 3, OW * 0.4, name, 6, P.crystalDk);
  putDiamond(mesh, r * 0.7, r * 0.4, V(r * 0.2, 0, r * 0.4), new THREE.Quaternion(), P.crystalIn, 4, 0, name, 6);
}

// ---- the hand ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// a finger stone: a small boulder (x forward) with a cyan vein; whole or cracked
export function addFinger(mesh, P, OW, r, name, seed, cracked) {
  addStoneBody(mesh, P, OW, 0.68 * r, 0.5 * r, 0.54 * r, name, seed, { cracked, noMoss: false });
}
// the palm crystal at the wrist: a big bright diamond along the arm with a pale heart and two small side crystals
export function addPalm(mesh, P, OW, r, name) {
  putDiamond(mesh, r * 0.78, r * 0.55, V(), new THREE.Quaternion(), P.crystal, 3, OW * 0.45, name, 6, P.crystalDk);
  putDiamond(mesh, r * 0.5, r * 0.3, V(r * 0.05, 0, r * 0.15), new THREE.Quaternion(), P.crystalIn, 4, 0, name, 6);
  for (const [dy, dz, k] of [[0.45, 0.3, 0], [-0.4, -0.25, 1]]) putDiamond(mesh, r * 0.45, r * 0.18, V(-r * 0.1, dy * r, dz * r), qz(dy * 0.8), P.crystalDk, 3, OW * 0.3, name, 5);
}
// where the finger stones float, in the hand's frame (x along the forearm, y up, z in depth; the wrist at the origin, r = the hand's size). Each: [x, y, z, turn about z, scale]
const PC = 0.62; // the palm crystal's distance from the wrist (shares of r)
const ARC = (phi, d, dz, grow = 1) => phi.map((p, i) => { const dd = Array.isArray(d) ? d[i] : d; return [(PC + dd * Math.cos(p)) * 1, dd * Math.sin(p), (Array.isArray(dz) ? dz[i] : dz), p, Array.isArray(grow) ? grow[i] : grow]; });
export const HAND = {
  PALM: PC,
  // open: the stones spread out in front of the palm; relaxed: half curled; fist: clenched round the palm crystal; grip: wrapped round something (two in front of it, two behind); broken: two stones left
  open: ARC([0.78, 0.28, -0.22, -1.05], [1.9, 2.15, 1.95, 1.35], [0.05, -0.12, 0.12, -0.05]),
  relaxed: ARC([0.62, 0.2, -0.22, -0.8], [1.5, 1.65, 1.5, 1.1], [0.1, -0.1, 0.1, -0.1]),
  fist: ARC([0.95, 0.32, -0.32, -0.95], [1.02, 1.1, 1.02, 0.92], [0.38, -0.12, 0.12, -0.38]),
  grip: ARC([1.2, 0.42, -0.42, -1.2], [1.3, 1.4, 1.4, 1.3], [-1.0, 0.95, 0.95, -1.0]),
  broken: ARC([0.7, 0.18, -0.2, -0.9], [1.6, 1.4, 1.6, 1.1], [0.1, -0.1, 0.1, -0.1]),
};

// a Mesher seen through a matrix: whatever is added to it lands transformed (for building a piece at an offset: the hand of a falling arm)
export const through = (mesh, M) => ({ add: (g, mat, o) => mesh.add(g, mat ? M.clone().multiply(mat) : M, o) });
// the hand of an arm that fell: the palm crystal and two cracked finger stones at the wrist (x = ox along the stone's axis)
export function addBrokenHand(mesh, P, OW, r, ox, name, seed) {
  addPalm(through(mesh, M4(V(ox + PC * r, 0, 0))), P, OW, r, name);
  [0, 1].forEach((i) => { const [x, y, z, phi] = HAND.broken[i]; addFinger(through(mesh, M4(V(ox + x * r, y * r, z * r), qz(phi))), P, OW, r, name, seed + i, true); });
}

// ---- the stump's snapped light: three crystal spikes where an arm was cut (built at the stump's end) and two loose chips ------------------------------------------------------------------------------------------
export function addCut(mesh, P, OW, r, name, seed) {
  for (const [a, len, w] of [[0.5, 1.5, 0.22], [-0.35, 1.1, 0.2], [0.05, 1.9, 0.26]]) {
    const g = new THREE.ConeGeometry(r * w, r * len, 5, 1); g.translate(0, r * len / 2, 0); g.rotateZ(-Math.PI / 2 + a);
    flat(mesh, g, M4(V(0.05 * r, 0, hash(seed, len * 7) * 0.1 * r)), { ow: OW * 0.3, color: len > 1.8 ? P.crystalIn : P.crystal, glow: 3, name });
  }
  stone(mesh, rockGeo(0.3 * r, 0.26 * r, 0.28 * r, { detail: 0, jitter: 0.3, seed }), M4(V(0.7 * r, 0.55 * r, 0.2 * r)), { ow: OW * 0.4, color: P.stone, name, seed });
  stone(mesh, rockGeo(0.22 * r, 0.2 * r, 0.2 * r, { detail: 0, jitter: 0.3, seed: seed + 1 }), M4(V(0.5 * r, -0.65 * r, -0.1 * r)), { ow: OW * 0.35, color: P.stoneDk, name, seed: seed + 1 });
}

// all the arms' pieces into `mesh`. Per arm tag (N near, F far): stones aT{j}{a whole | b cracked}, tethers tT{j} (j = 0..2), joint nodes jT{1,2}, shard rings hT{0..3} (shoulder, two joints, wrist), the socket kT, the palm pT,
// the finger stones fT{i}{a|b}, the cut cT. Returns the segment sizes from the sim's own definition.
export function buildArmPieces(mesh, P, OW, T, opts) {
  const dims = {};
  for (const [tag, id] of [['N', 'armN'], ['F', 'armF']]) {
    const part = opts.cr.parts.find((p) => p.id === id), segs = part ? part.segs : [];
    dims[tag] = segs.map((s) => ({ len: s.len, r: s.r, r1: s.r1 }));
    if (!dims[tag].length) dims[tag] = [0, 1, 2].map((j) => ({ len: 1000 - 50 * j, r: 340 - 40 * j, r1: 300 - 40 * j }));
    const sd = tag === 'N' ? 200 : 300, D = dims[tag];
    D.forEach((d, j) => {
      const rm = (d.r + d.r1) / 2, rx = d.len * 0.31, ry = rm * 0.92, rz = rm * 0.88;
      d.rx = rx; d.ry = ry; d.rz = rz;
      addStoneBody(mesh, P, OW, rx, ry, rz, 'a' + tag + j + 'a', sd + j * 10, { cracked: false });
      addStoneBody(mesh, P, OW, rx, ry, rz, 'a' + tag + j + 'b', sd + j * 10, { cracked: true });
      addTether(mesh, P, d.len, 't' + tag + j);
    });
    addNode(mesh, P, OW, 84, 'j' + tag + '1');
    addNode(mesh, P, OW, 74, 'j' + tag + '2');
    for (let k = 0; k < 4; k++) addShards(mesh, P, OW, k === 3 ? 230 : 150 - k * 12, k === 3 ? 62 : 48 - k * 4, 'h' + tag + k);
    addSocket(mesh, P, OW, 190, 'k' + tag, sd + 40);
    const r = D[D.length - 1].r1;
    addPalm(mesh, P, OW, r, 'p' + tag);
    for (let i = 0; i < 4; i++) { addFinger(mesh, P, OW, r, 'f' + tag + i + 'a', sd + 60 + i * 5, false); addFinger(mesh, P, OW, r, 'f' + tag + i + 'b', sd + 60 + i * 5, true); }
    addCut(mesh, P, OW, 250, 'c' + tag, sd + 90);
  }
  void T; void qy; void qx;
  return { dims };
}
