// LOOP.md R3 / R5: the kit for everything that stands FAR behind the play plane (distant landmarks, the destination on the horizon, the creature circling over its lair). Flat silhouettes in vertex colours with
// three baked tones (lit / mid / shade, chosen by the face's normal: no lights, no ink: far things are painted like the strips behind them), unlit, hazed toward the environment's haze colour by their own depth
// (aerial perspective), multiplied by the picture tint of the hour like the painted strips (so they follow day / dusk / night), and cut by the hard-edged untone of paintedPlane (style.js). One mesh = one draw call.
//   new Far()                     a builder: box / cyl / cone / sph / tri / poly (an extruded outline) in LOCAL units (world px at the thing's depth), each with a colour and an optional lamp amount (0..1:
//                                 a lamp ignores the tint and the haze and may be HDR, so the bloom picks it up)
//   far.build() -> BufferGeometry (position, color, aLamp)
//   farMaterial({ anchored })     the ShaderMaterial. anchored = every vertex also carries aPlace = (world x, depth z, screen share or world y, mode); mode 0: the thing's origin hangs at that SCREEN SHARE of the
//                                 half height at its depth (like the clouds: the sheared gameplay lens, so a landmark keeps its place in the sky whatever the zoom), mode 1: aPlace.z is a world y.
//                                 Not anchored (a creature): the mesh's own matrix places it, in world coordinates.
// Stepped, never a sine of the time: the only things that change are uniforms set by the caller (the tint, the haze, the lens, the blink step).
import { THREE, fx } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const LIGHT = new THREE.Vector3(-0.45, 0.8, 0.55).normalize();
const SHADE_TINT = new THREE.Color('#3a4a66');

// the three baked tones: lit (the face looks toward the light), mid, shade (a cool tint, so the dark side is a colour and not just darker)
function bake(geo, base, lamp) {
  const n = geo.attributes.position.count, nor = geo.attributes.normal;
  const col = new Float32Array(n * 3), lp = new Float32Array(n);
  const b = _c.set(base);
  const hdr = lamp > 1 ? lamp : 1;
  const r0 = b.r, g0 = b.g, b0 = b.b;
  for (let i = 0; i < n; i++) {
    const d = nor.getX(i) * LIGHT.x + nor.getY(i) * LIGHT.y + nor.getZ(i) * LIGHT.z;
    const k = d > 0.5 ? 1.1 : d > 0.08 ? 0.94 : d > -0.35 ? 0.78 : 0.62;
    let r = r0 * k, g = g0 * k, bl = b0 * k;
    if (k < 0.8 && lamp <= 0) { const w = k < 0.7 ? 0.2 : 0.1; r += (SHADE_TINT.r - r) * w; g += (SHADE_TINT.g - g) * w; bl += (SHADE_TINT.b - bl) * w; }
    if (lamp > 0) { r = r0 * hdr; g = g0 * hdr; bl = b0 * hdr; } // (a lamp is one flat glowing colour)
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = bl;
    lp[i] = lamp > 0 ? Math.min(1, lamp) : 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aLamp', new THREE.BufferAttribute(lp, 1));
  return geo;
}

const mx = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));

export class Far {
  constructor() { this.geos = []; this.tris = 0; }
  _add(geo, color, matrix, lamp = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    this.geos.push(bake(g, color, lamp));
    return this;
  }
  box(color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0, lamp = 0) { return this._add(new THREE.BoxGeometry(w, h, d), color, mx(x, y, z, 1, 1, 1, rx, ry, rz), lamp); }
  // a tapered cylinder about the y axis (top radius, bottom radius, height)
  cyl(color, x, y, z, rTop, rBot, h, seg = 8, rx = 0, ry = 0, rz = 0, lamp = 0) { return this._add(new THREE.CylinderGeometry(Math.max(0.01, rTop), Math.max(0.01, rBot), h, seg, 1), color, mx(x, y, z, 1, 1, 1, rx, ry, rz), lamp); }
  cone(color, x, y, z, r, h, seg = 8, rx = 0, ry = 0, rz = 0, lamp = 0) { return this._add(new THREE.ConeGeometry(r, h, seg, 1), color, mx(x, y, z, 1, 1, 1, rx, ry, rz), lamp); }
  sph(color, x, y, z, rx_, ry_ = rx_, rz_ = rx_, seg = 8, rx = 0, ry = 0, rz = 0, lamp = 0) { return this._add(new THREE.SphereGeometry(1, seg, Math.max(4, seg >> 1)), color, mx(x, y, z, rx_, ry_, rz_, rx, ry, rz), lamp); }
  // a tapered rod between two points (radius at a, radius at b)
  rod(color, a, b, r0, r1, seg = 6, lamp = 0) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
    if (len < 1e-3) return this;
    const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m2 = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q2, new THREE.Vector3(1, 1, 1));
    return this._add(new THREE.CylinderGeometry(Math.max(0.01, r1), Math.max(0.01, r0), len, seg, 1), color, m2, lamp);
  }
  // a triangle (three [x, y, z] points)
  tri(color, a, b, c, lamp = 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
    g.computeVertexNormals();
    return this._add(g, color, null, lamp);
  }
  // an extruded outline (a wing, a fin, a flag): points = [[x, y], ...] (counter-clockwise), thickness along z, centred on z = 0
  poly(color, points, thick = 20, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, lamp = 0) {
    const sh = new THREE.Shape(points.map((p) => new THREE.Vector2(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 4 });
    g.translate(0, 0, -thick / 2);
    return this._add(g, color, mx(x, y, z, 1, 1, 1, rx, ry, rz), lamp);
  }
  get empty() { return !this.geos.length; }
  // a place for every vertex of what was added since `from` (the landmark's origin: world x, depth z, share or y, mode); returns the new mark
  mark(from, place) {
    for (let i = from; i < this.geos.length; i++) {
      const n = this.geos[i].attributes.position.count, a = new Float32Array(n * 4);
      for (let k = 0; k < n; k++) { a[k * 4] = place[0]; a[k * 4 + 1] = place[1]; a[k * 4 + 2] = place[2]; a[k * 4 + 3] = place[3]; }
      this.geos[i].setAttribute('aPlace', new THREE.BufferAttribute(a, 4));
    }
    return this.geos.length;
  }
  build() {
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    for (const q of this.geos) q.dispose();
    this.tris = g.attributes.position.count / 3;
    this.geos = [];
    return g;
  }
}

const VERT = `
  attribute vec3 color; attribute float aLamp;
  #ifdef ANCHORED
  attribute vec4 aPlace;
  #endif
  uniform vec4 uLens;   // (camera z, camera y, the lens' shear = tan(elevation), tan(half fov))
  uniform vec4 uMove;   // (world x offset, depth offset, scale, 0): the destination slides and grows
  uniform vec3 uHaze;   // (depth where the haze starts, its range, the most it takes)
  varying vec3 vCol; varying float vHaze; varying float vLamp;
  void main() {
    vec3 w;
    #ifdef ANCHORED
      vec3 p = position * uMove.z;
      float z = aPlace.y + uMove.y;
      float hd = uLens.x - z;
      float yb = aPlace.w < 0.5 ? uLens.y + hd * ( aPlace.z * uLens.w - uLens.z ) : aPlace.z;
      w = vec3( aPlace.x + uMove.x + p.x, yb + p.y, z + p.z );
    #else
      w = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
    #endif
    vCol = color; vLamp = aLamp;
    vHaze = clamp( ( -w.z - uHaze.x ) / uHaze.y, 0.0, 1.0 ) * uHaze.z;
    gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
  }
`;
const FRAG = `
  uniform vec3 uTint; uniform vec3 uHazeCol; uniform float uUntone; uniform float uExposure; uniform float uAlpha; uniform float uLampK;
  varying vec3 vCol; varying float vHaze; varying float vLamp;
  vec3 untoneNeutral( vec3 c ) { float x = min( c.r, min( c.g, c.b ) ); float xp = x >= 0.04 ? x + 0.04 : ( 1.0 - sqrt( max( 0.0, 1.0 - 25.0 * x ) ) ) / 12.5; return ( c + ( xp - x ) ) / max( uExposure, 0.0001 ); }
  void main() {
    vec3 c = vCol * uTint;
    c = mix( c, uHazeCol, vHaze );
    c = mix( c, vCol * uLampK, vLamp );
    c = mix( c, untoneNeutral( c ), uUntone );
    gl_FragColor = vec4( c, uAlpha );
    #include <colorspace_fragment>
  }
`;

export function farMaterial({ anchored = true } = {}) {
  const u = {
    uLens: { value: new THREE.Vector4(4000, 480, 0.12, 0.268) }, uMove: { value: new THREE.Vector4(0, 0, 1, 0) }, uHaze: { value: new THREE.Vector3(3000, 6000, 0.55) },
    uTint: { value: new THREE.Color('#ffffff') }, uHazeCol: { value: new THREE.Color('#e6ecea') }, uAlpha: { value: 1 }, uLampK: { value: 1 },
    uUntone: fx.uUntone, uExposure: fx.uExposure,
  };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, transparent: true, depthWrite: true, depthTest: true, defines: anchored ? { ANCHORED: '' } : {} });
  m.toneMapped = false;
  m.fog = false;
  m.userData.far = true;
  return m;
}

const _white = new THREE.Color('#ffffff'), _tint = new THREE.Color(), _hz = new THREE.Color();
// Everything a far material needs from the world each frame (the lens of THIS camera, the picture tint of the hour like the painted strips, the haze colour and strength, the lamp level). cfg = config.DEPTH3D.LANDMARKS
export function syncFar(mat, cam, W, cfg, lampK = 1) {
  const u = mat.uniforms, rig = W.lights.rig, sc = rig && rig.strips;
  _tint.set(W.todCfg ? W.todCfg.sky : '#ffffff');
  if (W.tod !== 'night') _tint.lerp(_white, 0.35);
  _hz.set((sc && sc.color) || (rig && rig.haze) || '#e6ecea').multiply(_tint);
  const HZ = cfg.HAZE || [3500, 5500, 0.6], farHaze = sc && sc.far && Number.isFinite(Number(sc.far.haze)) ? Number(sc.far.haze) : 0.35;
  u.uLens.value.set(cam.position.z, cam.position.y, cam.userData.lensShift || 0, Math.tan((cam.fov * Math.PI) / 360));
  u.uTint.value.copy(_tint); u.uHazeCol.value.copy(_hz);
  u.uHaze.value.set(HZ[0], HZ[1], Math.max(0.2, Math.min(0.8, HZ[2] * (0.6 + farHaze))));
  u.uLampK.value = lampK * (W.night > 0.5 ? 1.3 : 1);
}
