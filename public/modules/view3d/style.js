// The storybook look in 3D: toon materials with a 3-step gradient, ink outlines by the inverted-hull method, and a Batch that merges many small
// vertex-coloured pieces into ONE mesh (one draw call for a whole ship) with its outline shell.
//
// INVERTED HULL: every piece carries a second vertex attribute `onormal` = its welded (smoothed) normal times the outline width. The outline mesh is the
// same geometry drawn BackSide in the ink colour with the vertices pushed out along `onormal`. A plain "Plain lit" switch swaps the materials and hides
// the outline shells, so the owner can compare the two looks on the same scene.
//
// Everything here is RIGID: no wobble, no jiggle. Colours come from config.PALETTE / config.INK.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

export const PAL = config.PALETTE;
export const INK = config.INK;
export { THREE };

// What the toggles say right now (main.js changes these and calls applyLook).
// low = the Detail: low setting (small things lose their ink shells). The rest are the WP1 look kill-switches (quality.js reads ?look=nobloom,nofog... into them; the dev page has buttons):
// bloom, lut (the colour grade), grain (paper grain + vignette), fog, rim (the thin warm edge light), lanterns (the lamps' real point lights), post (false = no composer at all).
export const look = { toon: true, outlines: true, shadows: true, low: false, bloom: true, lut: true, grain: true, fog: true, rim: true, lanterns: true, post: true };

// Shared shader numbers (one object, read by every patched material, so changing them needs no recompile): the toon rim light, and what the painted backdrops need to survive tone mapping.
export const fx = {
  uRimColor: { value: new THREE.Color('#ffd9a8') }, uRimAmt: { value: 0.16 }, uRimEdge: { value: 0.72 }, uRimDir: { value: new THREE.Vector3(-0.43, 0.66, 0.59) },
  uUntone: { value: 0 }, uExposure: { value: 1 }, // (post.js sets uUntone to 1 while the composer tone-maps the picture: the unlit painted planes then undo it so they stay exactly as painted)
};

// The THIN WARM RIM: one hard step where the surface turns edge-on to the viewer (dot(N, V) small), on the side the key light comes from. Added to a MeshToonMaterial by a small compile patch.
const RIM_FRAG = `
  uniform vec3 uRimColor; uniform float uRimAmt; uniform float uRimEdge; uniform vec3 uRimDir;
`;
const RIM_BODY = `
  {
    vec3 rimN = normalize( normal );
    float rimFacing = 1.0 - saturate( dot( rimN, normalize( vViewPosition ) ) );
    float rimSide = smoothstep( 0.05, 0.6, dot( rimN, uRimDir ) );
    outgoingLight += uRimColor * ( uRimAmt * step( uRimEdge, rimFacing ) * rimSide );
  }
  #include <opaque_fragment>
`;
export function rimify(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = fx.uRimColor; sh.uniforms.uRimAmt = fx.uRimAmt; sh.uniforms.uRimEdge = fx.uRimEdge; sh.uniforms.uRimDir = fx.uRimDir;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + RIM_FRAG).replace('#include <opaque_fragment>', RIM_BODY);
  };
  material.customProgramCacheKey = () => 'toon-rim';
  return material;
}

// Unlit painted planes (sky, backdrop strips): the composer tone-maps everything, so these pre-compensate for the exposure and for Neutral tone mapping's small black offset
// (the highlights above 0.76 roll off a little; the painted pictures keep their own colours). Used while fx.uUntone = 1.
export function paintedPlane(material) {
  material.toneMapped = false;
  material.fog = false;
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uUntone = fx.uUntone; sh.uniforms.uExposure = fx.uExposure;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uUntone; uniform float uExposure;\nvec3 untoneNeutral( vec3 c ) { float x = min( c.r, min( c.g, c.b ) ); float xp = x >= 0.04 ? x + 0.04 : ( 1.0 - sqrt( max( 0.0, 1.0 - 25.0 * x ) ) ) / 12.5; return ( c + ( xp - x ) ) / max( uExposure, 0.0001 ); }')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix( outgoingLight, untoneNeutral( outgoingLight ), uUntone );\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => 'painted-plane';
  return material;
}

// A bright unlit colour that crosses the bloom threshold (HDR: more than 1 is fine, the picture is floating point until the tone mapping). k ~ 3 for lamps, 2.5 for fire.
export const glow = (hex, k = 3) => new THREE.Color(hex).multiplyScalar(k);
export function glowMat(hex, k = 3, extra = {}) { const m = new THREE.MeshBasicMaterial({ ...extra }); m.color.copy(glow(hex, k)); m.userData.glow = k; return m; }

// ---- materials ---------------------------------------------------------------------------------------------------------------------------------
function makeGradient(steps) {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) data[i] = Math.round(255 * (0.6 + (0.4 * i) / (steps - 1))); // 153 .. 255: soft, faded shadows
  const t = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
export const gradientMap = makeGradient(3);

export const toonVC = rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap }));
export const plainVC = new THREE.MeshLambertMaterial({ vertexColors: true }); // (the dev page's "Plain lit" comparison only: no PBR Standard material anywhere)
toonVC.name = 'toonVC';
plainVC.name = 'plainVC';

// The ink pass: back faces only, vertices pushed out along `onormal` (already scaled by the piece's outline width).
export const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
outlineMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 onormal;')
    .replace('#include <begin_vertex>', 'vec3 transformed = position + onormal;');
};
outlineMat.customProgramCacheKey = () => 'ink-outline';

// A toon / plain pair for a single flat colour (used by animated bits that are not vertex coloured).
export function pairFor(color, extra = {}) {
  return {
    toon: rimify(new THREE.MeshToonMaterial({ color, gradientMap, ...extra })),
    plain: new THREE.MeshLambertMaterial({ color, ...extra }),
  };
}

// Put a toon/plain material pair on a mesh and remember them so applyLook can swap.
export function styled(mesh, toon, plain) {
  mesh.userData.toon = toon;
  mesh.userData.plain = plain;
  mesh.material = look.toon ? toon : plain;
  mesh.castShadow = look.shadows;
  mesh.receiveShadow = look.shadows;
  return mesh;
}

// Walk a subtree after a toggle: swap materials, show/hide ink shells, shadows.
export function applyLook(root) {
  root.traverse((o) => {
    if (o.userData.toon) o.material = look.toon ? o.userData.toon : o.userData.plain;
    if (o.userData.isOutline) o.visible = look.toon && look.outlines && !(look.low && o.userData.small);
    if (o.isMesh && o.userData.shadowCaster) o.castShadow = look.shadows;
    if (o.isMesh && o.userData.shadowReceiver) o.receiveShadow = look.shadows;
  });
}

// ---- geometry helpers --------------------------------------------------------------------------------------------------------------------------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function mat(px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
}

// Unit shapes, built once.
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14), // radius 1, height 1 along y
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  cone: new THREE.ConeGeometry(1, 1, 12),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLo: new THREE.SphereGeometry(1, 12, 8),
};

// Replace the normals of a non-indexed geometry's outline vectors by the average normal of every vertex at the same place, scaled to `width`.
export function setOutline(g, width) {
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count;
  const out = new Float32Array(n * 3);
  if (width > 0) {
    const sums = new Map();
    const keyOf = (i) => Math.round(pos.getX(i) * 8) + ',' + Math.round(pos.getY(i) * 8) + ',' + Math.round(pos.getZ(i) * 8);
    const keys = new Array(n);
    for (let i = 0; i < n; i++) {
      const k = (keys[i] = keyOf(i));
      let s = sums.get(k);
      if (!s) sums.set(k, (s = [0, 0, 0]));
      s[0] += nor.getX(i);
      s[1] += nor.getY(i);
      s[2] += nor.getZ(i);
    }
    for (let i = 0; i < n; i++) {
      const s = sums.get(keys[i]);
      const l = Math.hypot(s[0], s[1], s[2]) || 1;
      out[i * 3] = (s[0] / l) * width;
      out[i * 3 + 1] = (s[1] / l) * width;
      out[i * 3 + 2] = (s[2] / l) * width;
    }
  }
  g.setAttribute('onormal', new THREE.BufferAttribute(out, 3));
}

const _c = new THREE.Color();
// A piece ready for merging: position, normal, colour and the outline vector, all baked at the given transform.
export function piece(geo, color, matrix, ow = 0) {
  const src = geo.index ? geo.toNonIndexed() : geo.clone();
  if (matrix) src.applyMatrix4(matrix);
  const n = src.attributes.position.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position);
  g.setAttribute('normal', src.attributes.normal);
  _c.set(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  setOutline(g, ow);
  return g;
}

// ---- Batch: many pieces -> one mesh + one ink shell --------------------------------------------------------------------------------------------
export class Batch {
  constructor() { this.parts = []; this.tris = 0; }
  // 3D coordinates (x right, y up, z toward the viewer). ow = ink outline width (world units); 0 = none.
  box(color, cx, cy, cz, w, h, d, ow = 0, rx = 0, ry = 0, rz = 0) { this.parts.push(piece(G.box, color, mat(cx, cy, cz, w, h, d, rx, ry, rz), ow)); return this; }
  // A cylinder about the y axis (radius rt at the top, rb at the bottom is not supported by the unit shape: uniform radius), then rotated.
  cyl(color, cx, cy, cz, r, h, ow = 0, rx = 0, ry = 0, rz = 0, rz2) { this.parts.push(piece(G.cyl, color, mat(cx, cy, cz, r, h, rz2 == null ? r : rz2, rx, ry, rz), ow)); return this; }
  cone(color, cx, cy, cz, r, h, ow = 0, rx = 0, ry = 0, rz = 0) { this.parts.push(piece(G.cone, color, mat(cx, cy, cz, r, h, r, rx, ry, rz), ow)); return this; }
  sphere(color, cx, cy, cz, rx_, ry_ = rx_, rz_ = rx_, ow = 0, lo = false) { this.parts.push(piece(lo ? G.sphereLo : G.sphere, color, mat(cx, cy, cz, rx_, ry_, rz_), ow)); return this; }
  // A round rod between two 3D points.
  rod(color, a, b, r, ow = 0) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < 1e-3) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    this.parts.push(piece(G.cyl8, color, m, ow));
    return this;
  }
  // Any ready geometry (extrusions, tori ...), given a colour and matrix.
  geo(color, geometry, matrix, ow = 0) { this.parts.push(piece(geometry, color, matrix, ow)); return this; }
  get empty() { return this.parts.length === 0; }
  // -> a Group holding the mesh and its outline shell (or an empty Group).
  build({ cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    if (!this.parts.length) return group;
    const geometry = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.tris = geometry.attributes.position.count / 3;
    const mesh = styled(new THREE.Mesh(geometry, toonVC), toonVC, plainVC);
    mesh.userData.shadowCaster = cast;
    mesh.userData.shadowReceiver = receive;
    mesh.castShadow = cast && look.shadows;
    mesh.receiveShadow = receive && look.shadows;
    const shell = new THREE.Mesh(geometry, outlineMat);
    shell.userData.isOutline = true;
    shell.visible = look.toon && look.outlines;
    group.add(mesh, shell);
    group.userData.mesh = mesh;
    return group;
  }
}

// Mark every ink shell under a root as "small" (crew, planes, bats): Detail: low drops those.
export function tagSmall(root) { root.traverse((o) => { if (o.userData.isOutline) o.userData.small = true; }); return root; }

// Dispose every geometry (not the shared materials) under a root.
export function disposeTree(root) {
  root.traverse((o) => { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); });
}
