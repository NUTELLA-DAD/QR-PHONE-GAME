// THE CREATURE KIT (WP8, 3D.md section 14): what every giant creature in 3D is built from, so the Kraken, and the dragon, thunderbird and wyrm after it, share one set of tools.
//   - textures: painted once with Canvas 2D (a seeded generator, so the same creature always has the same spots): a HEAD ATLAS (the body's mottled skin, a fin sheet, a white swatch for flat
//     colours) and a LIMB SKIN (a tube's skin: a pale belly stripe, darker back, spots), both a few hundred KB
//   - creatureToon(map, uniforms): the toon material every creature piece uses: skin map x vertex colour, the thin rim light, a one-step wet SHEEN, and an emissive channel per vertex (eyes, the
//     inner mouth, the heart: they glow by a number the view sets, bloom does the rest). No PBR, no noise, no time in the shader.
//   - Mesher: merges pieces (any Three geometry, or a parametric grid) into ONE geometry with the ink outline vectors, colours, uvs and glow ids baked; `ranges` remember where a named piece is
//     so the view can tint it or move it. DynPiece: a rigid piece (a jaw, an eyelid, the heart) whose vertices are rewritten when its pose changes (stepped by the view: never every frame).
// All of it is rigid and static between keys: nothing here wobbles.
import { THREE, gradientMap, rimify, outlineMat } from './style.js';

export const ATLAS = { W: 1024, H: 1024, mantle: { y1: 640 }, fin: { x1: 512, y0: 640 } };
export const SWATCH = [0.75, 1 - 832 / 1024]; // (uv of the plain white square of the head atlas: flat-coloured pieces point here and take their colour from the vertex colours)
export const mantleUV = (u, v) => [u, 1 - (v * ATLAS.mantle.y1) / ATLAS.H]; // u around (0..1, the back at 0 and 1), v along the body from the tip (0) to the base (1)
export const finUV = (u, v) => [(u * ATLAS.fin.x1) / ATLAS.W, 1 - (ATLAS.fin.y0 + v * (ATLAS.H - ATLAS.fin.y0)) / ATLAS.H];

export function rngOf(seed) {
  let a = (seed | 0) || 1;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- the textures --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Spots drawn so they wrap round the edges (wx: horizontally, wy: vertically).
function blot(g, w, h, x, y, rx, ry, rot, wx, wy) {
  for (const ox of wx ? [-w, 0, w] : [0]) for (const oy of wy ? [-h, 0, h] : [0]) {
    g.beginPath();
    g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  }
}
export function paintHeadAtlas(P, seed = 7) {
  const c = canvas(ATLAS.W, ATLAS.H), g = c.getContext('2d'), R = rngOf(seed), M = ATLAS.mantle.y1;
  // the mantle: dark crown to a mid mauve, the front (u 0.5) carries a pale two-step belly
  const gr = g.createLinearGradient(0, 0, 0, M);
  gr.addColorStop(0, P.skinDark); gr.addColorStop(0.35, P.skin); gr.addColorStop(1, P.skin);
  g.fillStyle = gr; g.fillRect(0, 0, ATLAS.W, M);
  g.fillStyle = P.skinDark; // the dark back (the sides and rear of the sack)
  g.beginPath(); g.rect(0, 0, ATLAS.W * 0.18, M); g.rect(ATLAS.W * 0.82, 0, ATLAS.W * 0.18, M); g.fill();
  const belly = (rx, ry, col, cy = M * 0.62) => { g.fillStyle = col; g.beginPath(); g.ellipse(ATLAS.W * 0.5, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  belly(ATLAS.W * 0.11, M * 0.34, '#8a4f9a', M * 0.84); belly(ATLAS.W * 0.075, M * 0.27, P.belly, M * 0.86); // (a smaller, lower pale belly: the face is not an egg)
  g.fillStyle = P.skinDark; g.fillRect(ATLAS.W * 0.5 - 9, 0, 18, M * 0.5); // the crest line: a dark stripe down the front from the crown
  for (let i = 0; i < 230; i++) { // mottling: dark spots, a few pale freckles
    const x = R() * ATLAS.W, y = R() * M, r = 5 + R() * R() * 30;
    g.fillStyle = R() < 0.82 ? P.spot : P.spotLight;
    g.globalAlpha = 0.4 + R() * 0.4;
    blot(g, ATLAS.W, M, x, y, r, r * (0.6 + R() * 0.5), R() * 3, true, false);
  }
  g.globalAlpha = 1;
  g.strokeStyle = P.skinDark; g.lineWidth = 5; // growth rings near the base
  for (let k = 0; k < 4; k++) { const y = M * (0.8 + k * 0.045); g.beginPath(); g.moveTo(0, y); g.lineTo(ATLAS.W, y); g.stroke(); }
  // the fins: dark at the root, paler toward the rim, with ribs
  const fg = g.createLinearGradient(0, M, 0, ATLAS.H);
  fg.addColorStop(0, P.skinDark); fg.addColorStop(0.5, P.fin); fg.addColorStop(1, P.spotLight);
  g.fillStyle = fg; g.fillRect(0, M, ATLAS.fin.x1, ATLAS.H - M);
  g.strokeStyle = P.skinDark; g.lineWidth = 7; g.globalAlpha = 0.6;
  for (let k = 0; k < 11; k++) { const x = (k + 0.5) * (ATLAS.fin.x1 / 11); g.beginPath(); g.moveTo(x, M); g.lineTo(x, ATLAS.H); g.stroke(); }
  g.globalAlpha = 1;
  g.fillStyle = P.spot; for (let i = 0; i < 40; i++) blot(g, ATLAS.fin.x1, ATLAS.H - M, R() * ATLAS.fin.x1, M + R() * (ATLAS.H - M), 6 + R() * 14, 5 + R() * 9, 0, false, false);
  g.fillStyle = '#ffffff'; g.fillRect(ATLAS.fin.x1, M, ATLAS.W - ATLAS.fin.x1, ATLAS.H - M); // the plain swatch
  return finishTexture(c, false);
}
export function paintLimbSkin(P, seed = 11) {
  const W = 256, H = 512, c = canvas(W, H), g = c.getContext('2d'), R = rngOf(seed);
  g.fillStyle = P.skinDark; g.fillRect(0, 0, W, H); // the back
  g.fillStyle = P.skin; g.fillRect(W * 0.12, 0, W * 0.76, H); // the flanks
  g.fillStyle = P.skin; // the belly stripe sits on the seam (u 0 and 1): the sucker side. Two steps, wrapped.
  const stripe = (half, col) => { g.fillStyle = col; g.fillRect(0, 0, half, H); g.fillRect(W - half, 0, half, H); };
  stripe(W * 0.2, '#a86c8a'); stripe(W * 0.12, P.belly);
  for (let i = 0; i < 90; i++) {
    const x = R() * W, y = R() * H, r = 4 + R() * R() * 20;
    g.fillStyle = R() < 0.85 ? P.spot : P.spotLight;
    g.globalAlpha = 0.5 + R() * 0.4;
    blot(g, W, H, x, y, r, r * (0.7 + R() * 0.5), R() * 3, true, true);
  }
  g.globalAlpha = 1;
  return finishTexture(c, true);
}
function finishTexture(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ---- the material --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// uniforms = { uGlow: Vector4 (the glow multipliers of glow ids 1..4), uSheen: number, uSheenDir: Vector3 (view space: the half vector of the key light) }, kept by the view and shared.
const GLOW_BODY = `
  {
    float gm = step( 0.5, vGlowId );
    float gk = vGlowId < 1.5 ? uGlow.x : ( vGlowId < 2.5 ? uGlow.y : ( vGlowId < 3.5 ? uGlow.z : uGlow.w ) );
    float sh = step( uSheenCut, dot( normalize( normal ), uSheenDir ) ) * uSheen * ( 1.0 - gm );
    outgoingLight = mix( outgoingLight + vec3( 0.3, 0.33, 0.4 ) * sh, diffuseColor.rgb * gk, gm );
  }
`;
export function makeUniforms(cut = 0.99) {
  return { uGlow: { value: new THREE.Vector4(1, 1, 1, 1) }, uSheen: { value: 1 }, uSheenCut: { value: cut }, uSheenDir: { value: new THREE.Vector3(0.3, 0.6, 0.74).normalize() } };
}
// WP15: SEE-THROUGH WHERE THE CREATURE PASSES IN FRONT OF THE SHIP. A tentacle's coil (or a front limb) crossing the open decks is nearer the camera than the crew and used to hide them. Inside the ship's box
// (uCoilBox = world x0, x1, y0, y1; creature.js sets it every frame) and in front of the crew's lane (z above uCoilZ) the creature's picture AND its ink are drawn in a fixed screen-door pattern (every other pixel,
// the same pattern every frame: nothing flickers or moves), so the crew show through it. Off (an empty box) everywhere else.
export const coilFade = { uCoilBox: { value: new THREE.Vector4(1, -1, 1, -1) }, uCoilZ: { value: 1e9 } };
const COIL_HOLE = 'if ( vCW.z > uCoilZ && vCW.x > uCoilBox.x && vCW.x < uCoilBox.y && vCW.y > uCoilBox.z && vCW.y < uCoilBox.w && mod( floor( gl_FragCoord.x ) + floor( gl_FragCoord.y ), 2.0 ) < 1.0 ) discard;';
export function creatureToon(map, uniforms) {
  const m = new THREE.MeshToonMaterial({ map, vertexColors: true, gradientMap });
  rimify(m);
  const rim = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    rim(sh, r);
    Object.assign(sh.uniforms, uniforms, coilFade);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlowId; varying vec3 vCW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlowId = aGlow; vCW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlowId; varying vec3 vCW;\nuniform vec4 uGlow; uniform float uSheen, uSheenCut; uniform vec3 uSheenDir; uniform vec4 uCoilBox; uniform float uCoilZ;').replace('void main() {', 'void main() {\n  ' + COIL_HOLE).replace('#include <opaque_fragment>', GLOW_BODY + '\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'creature-toon-coil';
  return m;
}
// the ink pass of the creature's limbs: style.js's outline, with the same screen-door hole (or the dark back faces would show through the holes of the skin)
export function creatureInk() {
  const m = outlineMat.clone();
  m.onBeforeCompile = (sh, r) => {
    outlineMat.onBeforeCompile(sh, r);
    Object.assign(sh.uniforms, coilFade);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW;').replace('vec3 transformed = position + onormal;', 'vec3 transformed = position + onormal; vCW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCW; uniform vec4 uCoilBox; uniform float uCoilZ;').replace('void main() {', 'void main() {\n  ' + COIL_HOLE);
  };
  m.customProgramCacheKey = () => 'ink-outline-coil';
  return m;
}

// ---- the mesher ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const _c = new THREE.Color(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
export class Mesher {
  constructor() { this.P = []; this.N = []; this.UV = []; this.C = []; this.G = []; this.O = []; this.ranges = {}; }
  get verts() { return this.P.length / 3; }
  _v(p, n, u, v, c, g, o) { this.P.push(p.x, p.y, p.z); this.N.push(n.x, n.y, n.z); this.UV.push(u, v); this.C.push(c.r, c.g, c.b); this.G.push(g); this.O.push(o.x, o.y, o.z); }
  // Any Three geometry (indexed or not) at a matrix. o: { color, uv: [u, v] (a flat swatch: default the white square) | (u, v) => [u, v], glow (id 1..4, 0 = none), ow (ink width), name }
  add(geo, matrix, o = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo, pos = g.attributes.position, nor = g.attributes.normal, uva = g.attributes.uv, n = pos.count, start = this.verts;
    const color = _c.set(o.color || '#ffffff').clone(), glow = o.glow || 0, ow = o.ow || 0, uvo = o.uv || SWATCH;
    _m3.getNormalMatrix(matrix || new THREE.Matrix4());
    const ps = [], ns = [];
    for (let i = 0; i < n; i++) {
      _p.fromBufferAttribute(pos, i); if (matrix) _p.applyMatrix4(matrix);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_m3).normalize();
      ps.push(_p.clone()); ns.push(_n.clone());
    }
    const sum = new Map(), key = (p) => Math.round(p.x * 2) + ',' + Math.round(p.y * 2) + ',' + Math.round(p.z * 2);
    if (ow > 0) for (let i = 0; i < n; i++) { const k = key(ps[i]); let s = sum.get(k); if (!s) sum.set(k, (s = new THREE.Vector3())); s.add(ns[i]); }
    const o3 = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (ow > 0) o3.copy(sum.get(key(ps[i]))).normalize().multiplyScalar(ow); else o3.set(0, 0, 0);
      let u, v;
      if (typeof uvo === 'function') [u, v] = uvo(uva ? uva.getX(i) : 0, uva ? uva.getY(i) : 0); else [u, v] = uvo;
      this._v(ps[i], ns[i], u, v, color, glow, o3);
    }
    if (o.name) { const r = this.ranges[o.name] || (this.ranges[o.name] = { start, count: 0 }); r.count = this.verts - r.start; }
    return this;
  }
  // A parametric surface P(u, v), u and v in 0..1: nU x nV quads. Normals are the cross of the partial derivatives (t x theta: u runs along, v round); flip reverses the sides.
  // posFn(u, v, out Vector3); uvFn(u, v) -> [uu, vv]; the same options as add().
  grid(nU, nV, posFn, matrix, o = {}, uvFn = null, flip = false) {
    const ow = o.ow || 0, glow = o.glow || 0, color = _c.set(o.color || '#ffffff').clone(), E = 1e-3;
    _m3.getNormalMatrix(matrix || new THREE.Matrix4());
    const start = this.verts, pts = [], nrm = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i <= nU; i++) for (let j = 0; j <= nV; j++) {
      const u = i / nU, v = j / nV;
      posFn(u, v, q);
      const p = q.clone();
      const u1 = clamp(u + E, 0, 1), u0 = clamp(u - E, 0, 1), v1 = v + E, v0 = v - E;
      posFn(u1, v, a); posFn(u0, v, b); const du = a.clone().sub(b);
      posFn(u, v1, a); posFn(u, v0, b); const dv = a.clone().sub(b);
      let nn = du.clone().cross(dv);
      if (nn.lengthSq() < 1e-12) { posFn(clamp(u, 0.02, 0.98), v, a); posFn(clamp(u, 0.02, 0.98) + 0.01, v, b); nn = b.clone().sub(a).multiplyScalar(u < 0.5 ? -1 : 1); }
      if (flip) nn.negate();
      nn.normalize();
      if (matrix) { p.applyMatrix4(matrix); nn.applyMatrix3(_m3).normalize(); }
      pts.push(p); nrm.push(nn);
    }
    const idx = (i, j) => i * (nV + 1) + j, o3 = new THREE.Vector3();
    const vert = (i, j) => { const k = idx(i, j), n = nrm[k]; o3.copy(n).multiplyScalar(ow); const uv = uvFn ? uvFn(i / nU, j / nV) : SWATCH; this._v(pts[k], n, uv[0], uv[1], color, glow, o3); };
    for (let i = 0; i < nU; i++) for (let j = 0; j < nV; j++) {
      if (flip) { vert(i, j); vert(i + 1, j + 1); vert(i + 1, j); vert(i, j); vert(i, j + 1); vert(i + 1, j + 1); }
      else { vert(i, j); vert(i + 1, j); vert(i + 1, j + 1); vert(i, j); vert(i + 1, j + 1); vert(i, j + 1); }
    }
    if (o.name) { const r = this.ranges[o.name] || (this.ranges[o.name] = { start, count: 0 }); r.count = this.verts - r.start; }
    return this;
  }
  // -> a BufferGeometry with position, normal, uv, color, aGlow and onormal (the ink outline vectors, drawn by style.js outlineMat).
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.P), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.N), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.UV), 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.C), 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(this.G), 1));
    g.setAttribute('onormal', new THREE.BufferAttribute(new Float32Array(this.O), 3));
    g.computeBoundingSphere();
    g.boundingSphere.radius = Math.max(g.boundingSphere.radius, 1) * 1.3;
    return g;
  }
}

// The vertex colours of a mesh stay as they were built (`base`, a copy); a range can be tinted (x a colour, e.g. 0.55 to dim, 3 to flash white): written only when the tint changes.
export class Tinter {
  constructor(geometry) { this.attr = geometry.getAttribute('color'); this.base = new Float32Array(this.attr.array); this.cur = new Map(); }
  set(range, r, g, b) {
    if (!range) return;
    const key = r + '|' + g + '|' + b, was = this.cur.get(range);
    if (was === key) return;
    this.cur.set(range, key);
    const a = this.attr.array, s = range.start * 3, e = (range.start + range.count) * 3;
    for (let i = s; i < e; i += 3) { a[i] = this.base[i] * r; a[i + 1] = this.base[i + 1] * g; a[i + 2] = this.base[i + 2] * b; }
    this.attr.needsUpdate = true;
  }
}

// A rigid piece whose pose changes (a jaw, a lid, the heart): its vertices (position, normal, ink vector) are rewritten from the rest pose when the view changes it.
//   piece.pose(angle, scale): rotate about the pivot's axis by angle, scale about the pivot; nothing is written if (angle, scale) did not change.
export class DynPiece {
  constructor(geometry, range, pivot, axis) {
    this.g = geometry; this.range = range; this.pivot = pivot.clone(); this.axis = axis.clone().normalize(); this.key = '';
    const take = (name) => { const a = geometry.getAttribute(name).array, s = range.start * 3, e = (range.start + range.count) * 3; return new Float32Array(a.subarray(s, e)); };
    this.p0 = take('position'); this.n0 = take('normal'); this.o0 = take('onormal');
  }
  pose(angle, scale = 1) {
    const key = angle.toFixed(3) + '|' + scale.toFixed(3);
    if (key === this.key) return;
    this.key = key;
    const q = new THREE.Quaternion().setFromAxisAngle(this.axis, angle), v = new THREE.Vector3(), s = this.range.start * 3, n = this.range.count;
    const P = this.g.getAttribute('position'), N = this.g.getAttribute('normal'), O = this.g.getAttribute('onormal');
    for (let i = 0; i < n; i++) {
      v.set(this.p0[i * 3], this.p0[i * 3 + 1], this.p0[i * 3 + 2]).sub(this.pivot).multiplyScalar(scale).applyQuaternion(q).add(this.pivot);
      P.array[s + i * 3] = v.x; P.array[s + i * 3 + 1] = v.y; P.array[s + i * 3 + 2] = v.z;
      v.set(this.n0[i * 3], this.n0[i * 3 + 1], this.n0[i * 3 + 2]).applyQuaternion(q);
      N.array[s + i * 3] = v.x; N.array[s + i * 3 + 1] = v.y; N.array[s + i * 3 + 2] = v.z;
      v.set(this.o0[i * 3], this.o0[i * 3 + 1], this.o0[i * 3 + 2]).multiplyScalar(scale > 0.01 ? 1 : 0).applyQuaternion(q);
      O.array[s + i * 3] = v.x; O.array[s + i * 3 + 1] = v.y; O.array[s + i * 3 + 2] = v.z;
    }
    P.needsUpdate = N.needsUpdate = O.needsUpdate = true;
  }
}
