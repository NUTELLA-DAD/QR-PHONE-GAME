// THE CASTLE KIT (LOOP R2 / CASTLE.md): the small shape helpers the castle files share. Everything is rigid, built once, and merged by style.js's Batch (one mesh + one ink shell per batch).
//   * materials that the ring bend leaves alone (RING_SKIP): the ward, the island and the keep stand in the CAMERA frame (ringBend.js RB.axis()), not on the bent strip;
//   * tapered cylinders / cones with a chosen number of sides (the towers: 10 to 12 sides is plenty at TV distance), extruded outlines, flat fans and bands (the island's rock);
//   * a flag baked in three rigid poses (held on 8 fps keys, nothing waves), an instanced glow set (HDR unlit shapes: cores, lamps, braziers, shards).
// Nothing here moves on a sine. Geometry never throws: sizes are clamped.
import { THREE, Batch, piece, mat, rimify, gradientMap, inkUniforms, INK, INK_GLSL, look, styled, toonVC, plainVC, outlineMat } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLAG_KEYS } from './scenery.js';

export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const fin = Number.isFinite;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Batch.build() with a cheaper shell: the ink shell draws only the pieces that have an outline width (Batch.build draws the whole merged geometry twice, small dark windows and thin bars included).
const hasInk = (p) => { const a = p.attributes.onormal; return !!a && Math.abs(a.getX(0)) + Math.abs(a.getY(0)) + Math.abs(a.getZ(0)) > 1e-6; };
export function buildBatch(B, { cast = true, receive = true } = {}) {
  const group = new THREE.Group();
  if (!B.parts.length) return group;
  const inked = B.parts.filter(hasInk);
  const geometry = mergeGeometries(B.parts, false);
  const inkGeo = inked.length === B.parts.length ? geometry : inked.length ? mergeGeometries(inked, false) : null;
  for (const p of B.parts) p.dispose();
  B.tris = geometry.attributes.position.count / 3;
  const mesh = styled(new THREE.Mesh(geometry, toonVC), toonVC, plainVC);
  mesh.userData.shadowCaster = cast; mesh.userData.shadowReceiver = receive;
  mesh.castShadow = cast && look.shadows; mesh.receiveShadow = receive && look.shadows;
  group.add(mesh);
  if (inkGeo) {
    const shell = new THREE.Mesh(inkGeo, outlineMat);
    shell.userData.isOutline = true;
    shell.visible = look.toon && look.outlines;
    group.add(shell);
  }
  group.userData.mesh = mesh;
  return group;
}

// ---- materials that stand in the camera frame ---------------------------------------------------------------------------------------------------------------------------------------------
const skipDef = (m) => { m.defines = { ...(m.defines || {}), RING_SKIP: '' }; return m; };
const skipToon = skipDef(rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap })));
const skipPlain = skipDef(new THREE.MeshLambertMaterial({ vertexColors: true }));
const skipInk = skipDef(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
skipInk.onBeforeCompile = (sh) => {
  inkUniforms(sh);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 onormal;\n' + INK_GLSL).replace('#include <begin_vertex>', 'vec3 transformed = position + inkPush( onormal );');
};
skipInk.customProgramCacheKey = () => 'ink-outline-keep';
skipToon.customProgramCacheKey = () => 'toon-rim-keep';
export const SKIP = { toon: skipToon, plain: skipPlain, ink: skipInk };

// A Batch.build() group -> the same group on the skip materials (it never gets bent; it is drawn wherever its group stands). frustumCulled off (the bend-aware culling test would bend its centre).
export function skipify(g, name) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.isOutline) o.material = skipInk;
    else { o.userData.toon = skipToon; o.userData.plain = skipPlain; o.material = look.toon ? skipToon : skipPlain; }
    o.frustumCulled = false;
  });
  if (name) g.name = name;
  return g;
}
// The same for a batch that IS bent with the strip (the gatehouses and the curtain wall): just no culling (the strip's own culling is the bend-aware one, but one big mesh is always on screen).
export function plainify(g, name) { g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; }); if (name) g.name = name; return g; }

// ---- shapes ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const cache = new Map();
const cached = (key, make) => { let g = cache.get(key); if (!g) { g = make(); cache.set(key, g); } return g; };
const sides = (n) => clamp(Math.round(n) || 12, 3, 24);
const taperGeo = (ratio, seg) => cached('t' + seg + ':' + ratio.toFixed(3), () => new THREE.CylinderGeometry(clamp(ratio, 0.01, 4), 1, 1, seg));
const coneGeo = (seg) => cached('c' + seg, () => new THREE.ConeGeometry(1, 1, seg));
// A tapered cylinder about the y axis: radius rTop at the top, rBot at the bottom, h tall, `seg` sides, centred on (x, y, z); then turned by rx, ry, rz.
export function tcyl(B, color, x, y, z, rTop, rBot, h, seg = 12, ow = 0, rx = 0, ry = 0, rz = 0) {
  rBot = Math.max(0.5, rBot); h = Math.max(0.5, h);
  B.geo(color, taperGeo(rTop / rBot, sides(seg)), mat(x, y, z, rBot, h, rBot, rx, ry, rz), ow);
}
export function cone(B, color, x, y, z, r, h, seg = 12, ow = 0, rx = 0, ry = 0, rz = 0) { B.geo(color, coneGeo(sides(seg)), mat(x, y, z, Math.max(0.5, r), Math.max(0.5, h), Math.max(0.5, r), rx, ry, rz), ow); }
// A flat disc facing the viewer (+z), r wide, d deep, `seg` sides.
export function disc(B, color, x, y, z, r, d, seg = 14, ow = 0) { tcyl(B, color, x, y, z, r, r, d, seg, ow, PI / 2, 0, 0); }
// A diamond (a bipyramid: 8 faces; a shard, a finial): r wide, h tall, turned by ry.
const diamondGeo = () => cached('dia', () => new THREE.OctahedronGeometry(1, 0));
export function diamond(B, color, x, y, z, rx, ry, rz, ow = 0, rotY = 0, rotZ = 0, rotX = 0) { B.geo(color, diamondGeo(), mat(x, y, z, rx, ry, rz, rotX, rotY, rotZ), ow); }
// An extruded flat outline (a THREE.Shape in x / y), depth along +z from z, then moved to (x, y, z).
export function extrude(B, color, shape, depth, x, y, z, ow = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1, depth), bevelEnabled: false, curveSegments: 6 });
  B.geo(color, g, mat(x, y, z), ow);
  g.dispose();
}

// A strip of faces between two closed rims (arrays of [x, y, z] of the same length n), flat shaded; `hint(cx, cy, cz)` says which way the outside is (a unit-ish vector), so the winding is right whatever the order.
// Returns a ready geometry (position + normal), to hand to Batch.geo(color, geometry, null, ow).
export function stripGeo(rimA, rimB, hint) {
  const n = Math.min(rimA.length, rimB.length), pos = [], nor = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3();
  const tri = (p, q, r) => {
    a.set(...p); b.set(...q); c.set(...r);
    e1.subVectors(b, a); e2.subVectors(c, a); nn.crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-9) return;
    const h = hint((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3);
    if (nn.x * h[0] + nn.y * h[1] + nn.z * h[2] < 0) { [q, r] = [r, q]; nn.negate(); }
    nn.normalize();
    pos.push(...p, ...q, ...r); nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(rimA[i], rimB[i], rimA[j]);
    tri(rimA[j], rimB[i], rimB[j]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  return g;
}
// A fan from a centre point to a rim (the island's top).
export function fanGeo(center, rim, up = 1) {
  const pos = [], nor = [], n = rim.length;
  for (let i = 0; i < n; i++) {
    const p = rim[i], q = rim[(i + 1) % n];
    // (counter-clockwise seen from above: up = 1; from below: up = -1)
    const tri = up > 0 ? [center, p, q] : [center, q, p];
    for (const v of tri) { pos.push(v[0], v[1], v[2]); nor.push(0, up, 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  return g;
}

// ---- a flag baked in three poses -------------------------------------------------------------------------------------------------------------------------------------------------
// The scenery's flags are hinged rigid segments (scenery.js FLAG_KEYS); here the three poses are baked into ONE geometry (pose 0, 1 and 2 one after the other) so a mesh draws just the range of the pose that is on the key.
// A flag hangs from its pole at the origin of its own space, flying toward +x; segments of width w, cloth height h; cells(i) = the colours of the segment's rows; decorate(i, B, hh) adds an emblem.
// Returns { geometry, ranges: [[start, count] x 3] } (vertex counts), to be moved with `matrix` per flag and merged by the caller via mergeFlags.
export const FLAG_POSES = FLAG_KEYS; // (scenery.js: the same three rigid poses as every other flag in the game)
export function flagPoses(n, w, h, cells, depth = 3, hOf = null, decorate = null) {
  const out = [];
  for (let pose = 0; pose < 3; pose++) {
    const B = new Batch();
    for (let i = 0; i < n; i++) {
      const rows = cells(i) || ['#8e1f1a'], hh = h * (hOf ? hOf(i) : 1), ry = FLAG_POSES[pose][i % 4];
      const b = new Batch();
      rows.forEach((col, j) => b.box(col, w / 2, -(j + 0.5) * (hh / rows.length), 0, w, hh / rows.length, depth, 0));
      if (decorate) decorate(i, b, hh);
      // each segment is turned about its own hinge, as the scenery's flag does: rotate the baked pieces about the y axis through (i * w, 0)
      const M = new THREE.Matrix4().makeTranslation(i * w, 0, 0).multiply(new THREE.Matrix4().makeRotationY(ry));
      for (const p of b.parts) { p.applyMatrix4(M); B.parts.push(p); }
    }
    out.push(B.parts);
  }
  return out; // three arrays of geometries (one per pose)
}
// Merge a list of placed flags into one geometry laid out [pose 0 of every flag | pose 1 of every flag | pose 2 ...]. `flags` = [{ poses (from flagPoses), at: Matrix4 }]. Returns { geometry, ranges }.
export function mergeFlags(flags) {
  const parts = [], ranges = [];
  let start = 0;
  for (let pose = 0; pose < 3; pose++) {
    let count = 0;
    for (const f of flags) for (const g0 of f.poses[pose]) {
      const g = g0.clone();
      g.applyMatrix4(f.at);
      parts.push(g); count += g.attributes.position.count;
    }
    ranges.push([start, count]); start += count;
  }
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return { geometry, ranges };
}
export function disposeFlagPoses(poses) { for (const arr of poses) for (const g of arr) g.dispose(); }

// ---- an instanced glow set -------------------------------------------------------------------------------------------------------------------------------------------------------
// Unlit HDR shapes, one colour each, one draw call: the cores behind the portcullis, the gate lamps, the braziers' flames, the aether shards' glow. `skip` = the set stands in the camera frame (RING_SKIP).
export function createGlowSet(parent, geometry, max, skip = false) {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  m.toneMapped = false;
  if (skip) m.defines = { ...(m.defines || {}), RING_SKIP: '' };
  const mesh = new THREE.InstancedMesh(geometry, m, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color('#ffffff'));
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.renderOrder = 2;
  parent.add(mesh);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    add(x, y, z, sx, sy, sz, color, k = 1) {
      if (n >= max || !(fin(x) && fin(y) && fin(z))) return;
      M.compose(P.set(x, y, z), Q.identity(), S.set(Math.max(0.1, sx), Math.max(0.1, sy), Math.max(0.1, sz)));
      mesh.setMatrixAt(n, M); mesh.setColorAt(n, C.set(color).multiplyScalar(k)); n++;
    },
    end() { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.visible = n > 0; },
    get count() { return n; },
    dispose() { mesh.removeFromParent(); m.dispose(); },
  };
}
export const glowDisc = () => cached('gdisc', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 16); g.rotateX(PI / 2); return g; }); // (a flat disc facing +z, unit size)
export const glowDiamond = () => diamondGeo();

// A tiny deterministic random (the castle's lumps and houses never change between builds of the same map): a seed -> a function.
export function rng(seed) { let s = (seed | 0) || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { Batch, piece, mat };
