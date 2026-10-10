// The kit every part builder uses (WP2): textured, vertex-coloured, ink-outlined pieces collected PER PART, and the assembler that turns all the parts of a ship into ONE mesh (and one ink shell).
//
// PartBatch   a part's own pile of pieces, in three LAYERS: 'main' (always drawn), 'neg' and 'pos' (the hull's two sides: the wall that faces the viewer is hidden each frame, see assemble()).
//             main.box(...) / .cyl / .cone / .sphere / .rod / .geo / .raw  and  .neg.* / .pos.*  (the same calls, into that side's layer). Every call may take a last argument { tr, ao, mode, ts, seg }:
//               tr    the trim-sheet row that gives the piece its picture ('plain' by default; see textures.js: woodA woodB woodC deck brass iron rope canvas0.. strap lacing ...)
//               ao    baked vertex-colour occlusion { top: 0.2, band: 0.35, down: 0.2 }: darken the top 35% of the piece by up to 20%, and faces that look down by 20%
//               mode  'fit' (the picture stretched over the piece) or 'win' (a window of the picture at world scale, planks keep their size); each trim has a default
// assemble()  merges every part's pieces into one geometry ordered [neg | main | pos], remembers WHICH VERTEX RANGES belong to which part id (ranges[key] = [{ layer, start, count }]) and lets the
//             caller hide a side by changing the draw range, so one mesh and one ink shell draw the whole static ship. extractPart(assembled, key) copies one part's triangles out as its own
//             Group (WP5: the wreckage of a part that broke off). Dynamic bits (guns, props, wheels, bags) are built with buildGroup() into groups of their own.
// Nothing here wobbles: it is all rigid geometry.
import { THREE, G, gradientMap, rimify, look, styled, setOutline, INK } from '../style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTrimSheet, TRIM, uvRect } from '../textures.js';

const S = 2048;
// unit shapes for ship parts, lighter than style.js G (a ship is drawn three times: the mesh, its ink shell and the shadow pass)
const GX = {
  box: G.box, cyl: new THREE.CylinderGeometry(1, 1, 1, 12), cone: new THREE.ConeGeometry(1, 1, 10), sphere: new THREE.SphereGeometry(1, 14, 9), sphereXs: new THREE.SphereGeometry(1, 8, 5),
  rod8: new THREE.CylinderGeometry(1, 1, 1, 8), rod6: new THREE.CylinderGeometry(1, 1, 1, 6, 1, true),
};
const TS = 0.9; // world units per texel for 'win' mode (a 96 px plank strip is about 86 units tall)
const _c = new THREE.Color();

// ---- the materials: one toon and one plain, both with the trim sheet -------------------------------------------------------------------------------------------------------------
// INK IN THE SAME DRAW CALL: a part's geometry holds its pieces TWICE. The first copy is the picture; the second (aShell = 1) is the ink shell, pushed out along `onormal` and drawn back-faces-only in the ink colour,
// all by the shader (the material is double sided; the picture copy keeps front faces, the shell copy keeps back faces). So a part is ONE draw call, not two. aLayer is -1 / 0 / +1 (the hull's neg wall, always, the pos
// wall): the wall that faces the camera is hidden by the shader (uHide), not by a draw range. The shadow pass draws only the picture copy (onBeforeShadow narrows the draw range) and drops the hidden wall too.
// Each ship has its own material instances (its own uHide); the compiled programs are shared.
export const inkOn = { value: 1 }; // (the look's "outlines" switch; shipMesh updates it every frame)
const inkColor = { value: new THREE.Color(INK) };
const SHELL_VERT_COMMON = '#include <common>\nattribute vec3 onormal; attribute float aShell; attribute float aLayer; uniform float uHide; varying float vShell;';
const SHELL_VERT_BEGIN = 'vec3 transformed = vec3( position ) + onormal * aShell; vShell = aShell;';
const SHELL_VERT_PROJECT = '#include <project_vertex>\n  if ( aLayer * uHide > 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );';
function patchShell(sh, uHide, ink) {
  sh.uniforms.uHide = uHide;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', SHELL_VERT_COMMON).replace('#include <begin_vertex>', SHELL_VERT_BEGIN).replace('#include <project_vertex>', SHELL_VERT_PROJECT);
  if (ink) { sh.uniforms.uInkOn = inkOn; sh.uniforms.uInk = inkColor; }
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShell;' + (ink ? ' uniform float uInkOn; uniform vec3 uInk;' : ''))
    .replace('void main() {', 'void main() {\n  ' + (ink ? 'if ( vShell > 0.5 ) { if ( uInkOn < 0.5 || gl_FrontFacing ) discard; } else if ( ! gl_FrontFacing ) discard;' : 'if ( vShell > 0.5 || ! gl_FrontFacing ) discard;'));
  if (ink) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  if ( vShell > 0.5 ) gl_FragColor.rgb = uInk;');
}
export function makeTrimMaterials() {
  const sheet = getTrimSheet();
  const uHide = { value: 0 };
  const toon = rimify(new THREE.MeshToonMaterial({ vertexColors: true, map: sheet.texture, gradientMap, side: THREE.DoubleSide }));
  const rim = toon.onBeforeCompile;
  toon.onBeforeCompile = (sh, r) => { // (the painted sheet is a little darker than white on average: a small gain keeps the hull colours where the flat ones were)
    rim(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= 1.14;');
    patchShell(sh, uHide, true);
  };
  toon.customProgramCacheKey = () => 'toon-rim-trim-ink';
  toon.shadowSide = THREE.BackSide;
  toon.name = 'trimToon';
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true, map: sheet.texture, side: THREE.DoubleSide });
  plain.onBeforeCompile = (sh) => patchShell(sh, uHide, false);
  plain.customProgramCacheKey = () => 'lambert-trim';
  plain.shadowSide = THREE.BackSide;
  plain.name = 'trimPlain';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => {
    sh.uniforms.uHide = uHide;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aShell; attribute float aLayer; uniform float uHide;').replace('#include <project_vertex>', '#include <project_vertex>\n  if ( aShell > 0.5 || aLayer * uHide > 0.5 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );');
  };
  depth.customProgramCacheKey = () => 'depth-trim';
  return { toon, plain, depth, uHide, sheet };
}
let sharedMats = null;
export const sharedTrimMaterials = () => sharedMats || (sharedMats = makeTrimMaterials());

// ---- trims ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const MODE = { woodA: 'win', woodB: 'win', woodC: 'win', deck: 'win' };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// The rect of a trim row to take a picture from (a deck strip is three stacked sub-planks: pick one).
function trimRect(name, rnd) {
  const r = TRIM[name] || TRIM.plain;
  if (name === 'deck') { const k = Math.floor(rnd() * 3); return { x: r.x, y: r.y + k * 32, w: r.w, h: 32 }; }
  return r;
}
const atlas = (x, y, out, i) => { out[i] = x / S; out[i + 1] = 1 - y / S; };

// The non-indexed copy of each unit primitive (position, normal, uv), made once.
const NI = new WeakMap();
function nonIndexed(geo) {
  let g = NI.get(geo);
  if (!g) { g = geo.index ? geo.toNonIndexed() : geo; NI.set(geo, g); }
  return g;
}

// uv for a piece: stretch the whole trim over it ('fit') or lay a window of it at world scale ('win'). dims(i) says how big the face the vertex is on is: [A (along u), B (along v)] in world units.
function pieceUV(src, trName, rnd, o, dimsOf) {
  const n = src.attributes.position.count, out = new Float32Array(n * 2), uvA = src.attributes.uv;
  const mode = o.mode || MODE[trName] || 'fit';
  const base = TRIM[trName] || TRIM.plain;
  if (mode === 'fit') {
    const r = trimRect(trName, rnd);
    for (let i = 0; i < n; i++) { const u = uvA ? uvA.getX(i) : 0, v = uvA ? uvA.getY(i) : 0; atlas(r.x + 0.5 + u * (r.w - 1), r.y + 0.5 + (1 - v) * (r.h - 1), out, i * 2); }
    return out;
  }
  const ts = o.ts || TS, r = trimRect(trName, rnd), faceCache = new Map();
  for (let i = 0; i < n; i++) {
    const u = uvA ? uvA.getX(i) : 0, v = uvA ? uvA.getY(i) : 0, d = dimsOf(i);
    let [A, B] = d, uu = u, vv = v;
    if (B > A * 1.2) { [A, B] = [B, A]; uu = v; vv = u; } // (planks run along the long side)
    const key = d[0] + ',' + d[1] + ',' + (d[2] || 0);
    let off = faceCache.get(key);
    if (!off) { const a = Math.min(A / ts, r.w - 3), b = Math.min(B / ts, r.h - 3); off = { a, b, ox: r.x + 1 + rnd() * (r.w - 2 - a), oy: r.y + 1 + rnd() * (r.h - 2 - b) }; faceCache.set(key, off); }
    atlas(off.ox + uu * off.a, off.oy + (1 - vv) * off.b, out, i * 2);
  }
  void base;
  return out;
}

// Planar projection for geometry with no sensible uv (an extrusion): per triangle, the axis the face looks along decides the plane.
function planarUV(pos, nor, trName, rnd, o) {
  const n = pos.count, out = new Float32Array(n * 2), mode = o.mode || MODE[trName] || 'fit', r = trimRect(trName, rnd), ts = o.ts || TS;
  const lo = [[1e9, 1e9], [1e9, 1e9], [1e9, 1e9]], hi = [[-1e9, -1e9], [-1e9, -1e9], [-1e9, -1e9]];
  const axisOf = (i) => { const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i)); return az >= ax && az >= ay ? 2 : ay >= ax ? 1 : 0; };
  const proj = (i, a) => (a === 2 ? [pos.getX(i), pos.getY(i)] : a === 1 ? [pos.getX(i), pos.getZ(i)] : [pos.getZ(i), pos.getY(i)]);
  const ax = new Uint8Array(n);
  for (let i = 0; i < n; i += 3) { // (one axis per triangle, from its first vertex's normal)
    const a = axisOf(i);
    for (let k = 0; k < 3; k++) { ax[i + k] = a; const p = proj(i + k, a); lo[a][0] = Math.min(lo[a][0], p[0]); lo[a][1] = Math.min(lo[a][1], p[1]); hi[a][0] = Math.max(hi[a][0], p[0]); hi[a][1] = Math.max(hi[a][1], p[1]); }
  }
  const off = [0, 1, 2].map(() => ({ ox: r.x + 1 + rnd() * Math.max(0, r.w - 2 - Math.min((r.w - 3), 200)), oy: r.y + 1 + rnd() * Math.max(0, r.h - 2 - Math.min(r.h - 3, 60)) }));
  for (let i = 0; i < n; i++) {
    const a = ax[i], p = proj(i, a);
    if (mode === 'fit') { atlas(r.x + 0.5 + ((p[0] - lo[a][0]) / Math.max(1, hi[a][0] - lo[a][0])) * (r.w - 1), r.y + 0.5 + (1 - (p[1] - lo[a][1]) / Math.max(1, hi[a][1] - lo[a][1])) * (r.h - 1), out, i * 2); continue; }
    const tx = off[a].ox + Math.min(r.w - 3, (p[0] - lo[a][0]) / ts), ty = off[a].oy + Math.min(r.h - 3, (hi[a][1] - p[1]) / ts);
    atlas(tx, ty, out, i * 2);
  }
  return out;
}

// ---- one piece: position, normal, colour, uv and the ink vector, all baked --------------------------------------------------------------------------------------------------------
function applyAO(pos, nor, col, ao) {
  const n = pos.count;
  let y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const band = Math.max(1, (y1 - y0) * (ao.band == null ? 0.35 : ao.band));
  for (let i = 0; i < n; i++) {
    let f = 1;
    if (ao.top) f *= 1 - ao.top * Math.min(1, Math.max(0, (pos.getY(i) - (y1 - band)) / band));
    if (ao.down && nor.getY(i) < -0.5) f *= 1 - ao.down;
    if (ao.up && nor.getY(i) > 0.5) f *= 1 - ao.up;
    col[i * 3] *= f; col[i * 3 + 1] *= f; col[i * 3 + 2] *= f;
  }
}
function finishPiece(position, normal, color, uv, ow) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', position);
  g.setAttribute('normal', normal);
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  setOutline(g, ow);
  return g;
}

export class Sink {
  constructor(batch, layer) { this.b = batch; this.layer = layer; }
  _rnd() { return mulberry(this.b.seed ^ Math.imul(++this.b.n, 2654435761)); }
  _push(g) { this.b._add(this.layer, g); return this; }
  _colorArray(color, n) { _c.set(color); const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; } return col; }
  // a primitive from the shared unit shapes, at a matrix, with a picture
  _prim(unit, color, matrix, ow, o, dims) {
    const rnd = this._rnd(), tr = o.tr || 'plain', src = nonIndexed(unit).clone();
    src.applyMatrix4(matrix);
    const n = src.attributes.position.count;
    const uv = pieceUV(src, tr, rnd, o, dims || (() => [1, 1]));
    const col = this._colorArray(color, n);
    if (o.ao) applyAO(src.attributes.position, src.attributes.normal, col, o.ao);
    return this._push(finishPiece(src.attributes.position, src.attributes.normal, col, uv, ow));
  }
  box(color, cx, cy, cz, w, h, d, ow = 0, rx = 0, ry = 0, rz = 0, o = {}) {
    const dm = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(w, h, d));
    return this._prim(G.box, color, m, ow, o, (i) => dm[Math.min(5, Math.floor(i / 6))]);
  }
  // A cylinder about y (radius r, height h), then rotated; rz2 = a different radius along z (an ellipse section).
  cyl(color, cx, cy, cz, r, h, ow = 0, rx = 0, ry = 0, rz = 0, rz2, o = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(r, h, rz2 == null ? r : rz2));
    return this._prim(GX.cyl, color, m, ow, o, () => [Math.PI * 2 * r, h]);
  }
  cone(color, cx, cy, cz, r, h, ow = 0, rx = 0, ry = 0, rz = 0, o = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(r, h, r));
    return this._prim(GX.cone, color, m, ow, o, () => [Math.PI * 2 * r, h]);
  }
  sphere(color, cx, cy, cz, rx_, ry_ = rx_, rz_ = rx_, ow = 0, lo = false, o = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion(), new THREE.Vector3(rx_, ry_, rz_));
    return this._prim(lo ? GX.sphereXs : GX.sphere, color, m, ow, o, () => [Math.PI * 2 * rx_, Math.PI * ry_]);
  }
  // A round rod between two points (a rope trim is cut into short lengths so its twist keeps its size).
  rod(color, a, b, r, ow = 0, o = {}) {
    const len = a.distanceTo(b);
    if (len < 1e-3) return this;
    const tr = o.tr || 'plain', seg = o.seg || (tr === 'rope' ? 110 : 1e9), n = Math.max(1, Math.ceil(len / seg));
    const dir = b.clone().sub(a).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
      const m = new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, new THREE.Vector3(r, len / n, r));
      this._prim(r <= 2.6 ? GX.rod6 : GX.rod8, color, m, ow, o, () => [Math.PI * 2 * r, len / n]);
    }
    return this;
  }
  // A turned shape: profile [[radius, y], ...] from the bottom up, spun about y (a post, a finial, a bowl), at a point.
  lathe(color, pts, cx, cy, cz, ow = 0, o = {}) {
    const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(Math.max(0.01, p[0]), p[1])), o.segs || 8);
    const rmax = Math.max(...pts.map((p) => p[0])), ys = pts.map((p) => p[1]), h = Math.max(...ys) - Math.min(...ys);
    return this._prim(g, color, new THREE.Matrix4().makeTranslation(cx, cy, cz), ow, o, () => [Math.PI * 2 * rmax, h]);
  }
  // Any ready geometry (extrusions, tori, lathes), at a matrix. Its own uv is used when o.uv === 'native' (atlas coordinates, e.g. the hull); otherwise a planar projection of the trim.
  geo(color, geometry, matrix, ow = 0, o = {}) {
    const rnd = this._rnd(), tr = o.tr || 'plain';
    const src = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (matrix) src.applyMatrix4(matrix);
    const n = src.attributes.position.count;
    let nor = src.attributes.normal;
    if (!nor) { src.computeVertexNormals(); nor = src.attributes.normal; }
    let uv;
    if (o.uv === 'native' && src.attributes.uv) uv = Float32Array.from(src.attributes.uv.array);
    else if (o.uv === 'fit' && src.attributes.uv) uv = pieceUV(src, tr, rnd, { ...o, mode: 'fit' }, () => [1, 1]);
    else uv = planarUV(src.attributes.position, nor, tr, rnd, o);
    const col = this._colorArray(color, n);
    if (o.ao) applyAO(src.attributes.position, nor, col, o.ao);
    return this._push(finishPiece(src.attributes.position, nor, col, uv, ow));
  }
  // Ready-made triangle soup: flat arrays (3 per vertex position / normal / colour, 2 per uv), no index. The hull and the bags build these.
  raw(position, normal, color, uv, ow = 0) {
    return this._push(finishPiece(new THREE.BufferAttribute(Float32Array.from(position), 3), new THREE.BufferAttribute(Float32Array.from(normal), 3), Float32Array.from(color), Float32Array.from(uv), ow));
  }
}

export class PartBatch extends Sink {
  constructor(key) {
    super(null, 'main');
    this.b = this;
    this.key = key;
    this.seed = hash(String(key));
    this.n = 0;
    this.layers = { neg: [], main: [], pos: [] };
    this.neg = new Sink(this, 'neg');
    this.pos = new Sink(this, 'pos');
    this.min = new THREE.Vector3(1e9, 1e9, 1e9);
    this.max = new THREE.Vector3(-1e9, -1e9, -1e9);
  }
  _add(layer, g) {
    this.layers[layer].push(g);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) { // (every third vertex is enough for a box that bounds the part)
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (x < this.min.x) this.min.x = x; if (y < this.min.y) this.min.y = y; if (z < this.min.z) this.min.z = z;
      if (x > this.max.x) this.max.x = x; if (y > this.max.y) this.max.y = y; if (z > this.max.z) this.max.z = z;
    }
  }
  get empty() { return !this.layers.neg.length && !this.layers.main.length && !this.layers.pos.length; }
  // bounds in the ship's 3D frame ({ x0, x1, y0, y1, z0, z1 })
  get bounds() { return this.empty ? null : { x0: this.min.x, x1: this.max.x, y0: this.min.y, y1: this.max.y, z0: this.min.z, z1: this.max.z }; }
  // The whole part as ONE group of its own (a gun's barrel, a prop, a wheel: things that move). Layers are merged; the ink shell is part of the same mesh.
  buildGroup({ cast = false, receive = true } = {}) {
    const group = new THREE.Group();
    const list = [...this.layers.neg, ...this.layers.main, ...this.layers.pos];
    if (!list.length) return group;
    const built = inkGeometry(list, null);
    const m = this.mats || sharedTrimMaterials();
    const mesh = inkMesh(built, m, cast, receive);
    group.add(mesh);
    group.userData.mesh = mesh;
    group.userData.partKey = this.key;
    this.tris = built.n / 3;
    return group;
  }
}

// ---- assembling a whole ship's static pieces --------------------------------------------------------------------------------------------------------------------------------------
// The pieces (in the order given) twice over: the picture copy and the ink-shell copy, with aShell / aLayer attributes (layerEnds = [negEnd, mainEnd] in vertices, or null: no layers).
function inkGeometry(list, layerEnds) {
  const n = list.reduce((k, g) => k + g.attributes.position.count, 0);
  const merged = mergeGeometries([...list, ...list], false);
  const shell = new Float32Array(n * 2), layer = new Float32Array(n * 2);
  for (let i = n; i < n * 2; i++) shell[i] = 1;
  if (layerEnds) for (let i = 0; i < n; i++) { const l = i < layerEnds[0] ? -1 : i < layerEnds[1] ? 0 : 1; layer[i] = l; layer[n + i] = l; }
  merged.setAttribute('aShell', new THREE.BufferAttribute(shell, 1));
  merged.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  merged.computeBoundingSphere();
  return { geometry: merged, n };
}
// One mesh with the toon material (swapped for the plain one by applyLook), its own depth material, and a shadow pass that draws only the picture copy.
function inkMesh(built, m, cast, receive) {
  const { geometry, n } = built;
  const mesh = styled(new THREE.Mesh(geometry, m.toon), m.toon, m.plain);
  mesh.userData.shadowCaster = cast;
  mesh.userData.shadowReceiver = receive;
  mesh.castShadow = cast && look.shadows;
  mesh.receiveShadow = receive && look.shadows;
  mesh.customDepthMaterial = m.depth;
  mesh.onBeforeShadow = () => geometry.setDrawRange(0, n);
  mesh.onAfterShadow = () => geometry.setDrawRange(0, Infinity);
  return mesh;
}

// entries: [{ key, batch }]. Returns { group, ranges, geometry, setSide(camSide), extract(key), tris, layers: { negEnd, mainEnd, total }, mats }. mats: this ship's own materials (makeTrimMaterials).
export function assemble(entries, mats) {
  const list = [], ranges = {}, ends = { negEnd: 0, mainEnd: 0, total: 0 };
  let cursor = 0;
  for (const layer of ['neg', 'main', 'pos']) {
    for (const e of entries) {
      for (const g of e.batch.layers[layer]) {
        const count = g.attributes.position.count;
        list.push(g);
        const rs = (ranges[e.key] = ranges[e.key] || []), last = rs[rs.length - 1];
        if (last && last.layer === layer && last.start + last.count === cursor) last.count += count; else rs.push({ layer, start: cursor, count });
        cursor += count;
      }
    }
    if (layer === 'neg') ends.negEnd = cursor;
    if (layer === 'main') ends.mainEnd = cursor;
  }
  ends.total = cursor;
  const m = mats || sharedTrimMaterials();
  const group = new THREE.Group();
  const out = { group, ranges, geometry: null, layers: ends, tris: cursor / 3, side: 0, mats: m };
  if (!list.length) { out.setSide = () => {}; out.extract = () => new THREE.Group(); return out; }
  const built = inkGeometry(list, [ends.negEnd, ends.mainEnd]);
  for (const g of list) g.dispose();
  const geometry = (out.geometry = built.geometry);
  const mesh = inkMesh(built, m, true, true);
  group.add(mesh);
  out.mesh = mesh;
  // camSide >= 0: the camera is on the ship's +Z side, so the +Z wall (the 'pos' layer) is hidden; otherwise the -Z wall is. (The shader does it: uHide = the layer to hide.)
  out.setSide = (camSide) => { out.side = camSide >= 0 ? 1 : -1; m.uHide.value = out.side; };
  out.setSide(1);
  // WP5: one part's triangles as a Group of their own (same coordinates as the ship's content group), ready to be detached into a physics body. It never hides a wall.
  out.extract = (key) => {
    const rs = ranges[key] || [], g = new THREE.Group();
    const total = rs.reduce((k, r) => k + r.count, 0);
    if (!total) return g;
    const out2 = new THREE.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2], ['onormal', 3]]) {
      const src = geometry.attributes[name].array, dst = new Float32Array(total * 2 * size);
      let at = 0;
      for (let copy = 0; copy < 2; copy++) for (const r of rs) { dst.set(src.subarray(r.start * size, (r.start + r.count) * size), at); at += r.count * size; }
      out2.setAttribute(name, new THREE.BufferAttribute(dst, size));
    }
    const shell = new Float32Array(total * 2);
    for (let i = total; i < total * 2; i++) shell[i] = 1;
    out2.setAttribute('aShell', new THREE.BufferAttribute(shell, 1));
    out2.setAttribute('aLayer', new THREE.BufferAttribute(new Float32Array(total * 2), 1));
    out2.computeBoundingSphere();
    const mm = inkMesh({ geometry: out2, n: total }, m, true, true);
    g.add(mm);
    g.userData.partKey = key;
    return g;
  };
  return out;
}

// ---- a small triangle-soup builder for lofted geometry (hull, bag) -------------------------------------------------------------------------------------------------------------------
export class Soup {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  get count() { return this.p.length / 3; }
  vert(p, n, c, uv) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); this.uv.push(uv[0], uv[1]); }
  // a quad p0 p1 p2 p3: arrays of 4 positions, normals, colours, uvs. With faceN (the way the face should look) the winding is fixed up so the front side faces that way.
  quad(P, N, C, U, faceN) {
    let order = [0, 1, 2, 0, 2, 3];
    if (faceN) {
      const cr = (a, b, c) => { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
      let c = cr(P[0], P[1], P[2]);
      if (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]) < 1e-9) c = cr(P[0], P[2], P[3]);
      if (c[0] * faceN[0] + c[1] * faceN[1] + c[2] * faceN[2] < 0) order = [0, 2, 1, 0, 3, 2];
    }
    for (const i of order) this.vert(P[i], N[i], C[i], U[i]);
  }
  tri(P, N, C, U) { for (let i = 0; i < 3; i++) this.vert(P[i], N[i], C[i], U[i]); }
  flush(sink, ow = 0) { if (this.p.length) sink.raw(this.p, this.n, this.c, this.uv, ow); this.p = []; this.n = []; this.c = []; this.uv = []; return sink; }
}

// colour helpers
export const rgbOf = (hex) => { _c.set(hex); return [_c.r, _c.g, _c.b]; };
export const shade = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
export const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const hashOf = hash;
export const rng = mulberry;
export { uvRect, TRIM };
