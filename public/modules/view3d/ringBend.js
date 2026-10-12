// THE RING BEND (LOOP.md R1). On a ring map (maps.js buildRingMap: an approach, then a strip C = 2 pi R px long with the castle's faces) the flat 2D strip is wrapped into a circle round the castle, in the PICTURE only:
// the simulation, the physics and every module in view3d/ keep working in the flat map frame (x = the game's x, y up, z toward the viewer), and the vertex shaders do the wrapping.
//
// THE PATH. The strip's x is arc length. Before the ring the path is a straight line, then (over the last LEAD * R px of the approach) an arc of half the ring's curvature, then the circle of radius R round the
// castle's axis, which is at the origin of the ring's own frame: P(x) = R * (sin t, cos t), t = (x - xRing) / R (the same angle ring.js ringAngle gives), the outward normal (toward the viewer at the ship) is
// (sin t, cos t), the heading is t. A point (x, y, z) is P(x) + z * normal(x) (z = 0 is the plane the game is played in).
//
// THE CAMERA-RELATIVE FRAME. The camera never moves round the ring and never rolls (the 2D camera stays the authority): instead the world is rotated and shifted so that the path point under the camera's look-at
// (x = xc) sits at (xc, 0) with the path running along +x. Every vertex is mapped  flat -> frame  by ringBend() in GLSL (and by pt() here, for the HUD), so the plane at the ship is exactly the flat plane of today
// (the sheared lens and every 2D anchor stay 1:1), the castle is always behind the ship in the middle of the picture, and the ring turns round it as the ship flies.
// To keep the SHIP rigid and the HUD exact the strip stays perfectly flat within `flat` px of xc (the ship's half length + a pad) and eases into the true circle over BLEND px, so nothing is bent where she is.
//
// HOW IT REACHES THE SHADERS. Three.js's chunks project_vertex / worldpos_vertex / defaultnormal_vertex are patched (once, at import) so EVERY built-in material bends its vertices when uRingA.x = 1 (a uniform
// branch: nothing happens otherwise), and THREE.UniformsUtils.clone hands every built-in program the SAME four uniform objects. The few custom ShaderMaterials that place things from world points
// (particles.js, lines3d.js, contactShadow.js, beams.js) include RING_GLSL and `ringUniforms()` themselves. Normals turn with the strip, so the lighting stays right all the way round.
import { THREE } from './style.js';
import { config } from '../../config.js';

const fin = Number.isFinite;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---- the shared uniforms ------------------------------------------------------------------------------------------------------------------------------------------------------------
const A = new THREE.Vector4(0, 0, 0, 2500); // on, xc, theta_c, R
const B = new THREE.Vector4(0, 0, 700, 1600); // Pc.x, Pc.z, flat, flat + blend
const C = new THREE.Vector4(0, 0, 0, 1e-4); // xRing, xa (where the lead-in arc begins), the line's heading, the arc's curvature
const D = new THREE.Vector4(0, 0, 1, 0); // P(xa).x, P(xa).z, cos theta_c, sin theta_c
const UNI = { uRingA: { value: A }, uRingB: { value: B }, uRingC: { value: C }, uRingD: { value: D } };

export const RING_GLSL = /* glsl */`
uniform vec4 uRingA; uniform vec4 uRingB; uniform vec4 uRingC; uniform vec4 uRingD;
void ringPath( const in float x, out vec2 P, out float th ) {
  float R = uRingA.w;
  if ( x >= uRingC.x ) { th = ( x - uRingC.x ) / R; float a = th - 6.28318530718 * floor( th / 6.28318530718 + 0.5 ); P = R * vec2( sin( a ), cos( a ) ); } // (the angle is brought into -pi..pi first: a GPU's sin is only accurate there)
  else if ( x >= uRingC.y ) { th = uRingC.z + uRingC.w * ( x - uRingC.y ); P = vec2( sin( th ) / uRingC.w, R + ( cos( th ) - 1.0 ) / uRingC.w ); }
  else { th = uRingC.z; P = uRingD.xy + ( x - uRingC.y ) * vec2( cos( th ), - sin( th ) ); }
}
vec3 ringBend( const in vec3 p, out float phi ) {
  vec2 P; float th; ringPath( p.x, P, th );
  float tr = th - 6.28318530718 * floor( th / 6.28318530718 + 0.5 );
  vec2 d = P + p.z * vec2( sin( tr ), cos( tr ) ) - uRingB.xy;
  vec2 q = vec2( d.x * uRingD.z - d.y * uRingD.w, d.x * uRingD.w + d.y * uRingD.z );
  float w = smoothstep( uRingB.z, uRingB.w, abs( p.x - uRingA.y ) );
  vec2 o = mix( vec2( p.x, p.z ), vec2( uRingA.y + q.x, q.y ), w );
  phi = w * ( th - uRingA.z );
  return vec3( o.x, p.y, o.y );
}
vec3 ringBend( const in vec3 p ) { float phi; return ringBend( p, phi ); }
float ringPhi( const in float x ) { vec2 P; float th; ringPath( x, P, th ); return smoothstep( uRingB.z, uRingB.w, abs( x - uRingA.y ) ) * ( th - uRingA.z ); }
vec3 ringTurn( const in vec3 n, const in float phi ) { float c = cos( phi ), s = sin( phi ); return vec3( n.x * c + n.z * s, n.y, - n.x * s + n.z * c ); }
`;

// ---- the Three.js chunks ---------------------------------------------------------------------------------------------------------------------------------------------------------------
let installed = false, chunksOk = false;
function install() {
  if (installed) return chunksOk;
  installed = true;
  try {
    const SC = THREE.ShaderChunk;
    const P0 = SC.project_vertex, W0 = SC.worldpos_vertex, N0 = SC.defaultnormal_vertex, L0 = SC.logdepthbuf_pars_vertex;
    const okP = P0 && P0.includes('mvPosition = modelViewMatrix * mvPosition;'), okW = W0 && W0.includes('worldPosition = modelMatrix * worldPosition;'), okN = N0 && N0.includes('transformedNormal = normalMatrix * transformedNormal;'), okL = typeof L0 === 'string';
    if (!(okP && okW && okN && okL) || typeof THREE.UniformsUtils.clone !== 'function') { console.warn('view3d ringBend: the shader chunks are not what was expected; the ring stays flat'); return false; }
    SC.logdepthbuf_pars_vertex = L0 + '\n' + RING_GLSL;
    // the vertex: world position -> the bent one -> the camera. (The bend branch is a uniform test: when it is off the line is the old one.)
    // (a material with defines { RING_SKIP: '' } is NOT bent: the keep of the placeholder castle, which stands in the frame itself)
    SC.project_vertex = P0.replace('mvPosition = modelViewMatrix * mvPosition;', `
#ifdef RING_SKIP
mvPosition = modelViewMatrix * mvPosition;
#else
if ( uRingA.x > 0.5 ) { vec4 ringWp = modelMatrix * mvPosition; ringWp.xyz = ringBend( ringWp.xyz ); mvPosition = viewMatrix * ringWp; } else mvPosition = modelViewMatrix * mvPosition;
#endif
`);
    SC.worldpos_vertex = W0.replace('worldPosition = modelMatrix * worldPosition;', `worldPosition = modelMatrix * worldPosition;
#ifndef RING_SKIP
if ( uRingA.x > 0.5 ) worldPosition.xyz = ringBend( worldPosition.xyz );
#endif
`);
    // the normal: it turns with the strip (a rotation about the vertical axis by the heading difference), in the view's own frame
    SC.defaultnormal_vertex = N0.replace('transformedNormal = normalMatrix * transformedNormal;', `transformedNormal = normalMatrix * transformedNormal;
#ifndef RING_SKIP
if ( uRingA.x > 0.5 ) {
  vec4 ringNp = vec4( position, 1.0 );
  #ifdef USE_INSTANCING
  ringNp = instanceMatrix * ringNp;
  #endif
  ringNp = modelMatrix * ringNp;
  transformedNormal = ringTurn( transformedNormal, ringPhi( ringNp.x ) );
}
#endif
`);
    // every built-in program gets the same four uniform objects (so one assignment a frame reaches all of them)
    const clone0 = THREE.UniformsUtils.clone;
    THREE.UniformsUtils.clone = function ringClone(src) {
      const dst = clone0(src);
      if (dst && typeof dst === 'object') { dst.uRingA = UNI.uRingA; dst.uRingB = UNI.uRingB; dst.uRingC = UNI.uRingC; dst.uRingD = UNI.uRingD; }
      return dst;
    };
    // Frustum culling asks "is the object's FLAT bounding sphere on the screen?"; the bend moves it. So the test is made on the BENT centre with a roomier radius (the strip's arc length is kept, so a bent
    // object is never bigger than its arc, plus the easing zone's shear): nothing is culled that the picture shows, and nothing far off screen is drawn.
    const fo = THREE.Frustum.prototype.intersectsObject, sp = new THREE.Sphere(), bp = { x: 0, y: 0, z: 0, phi: 0 };
    THREE.Frustum.prototype.intersectsObject = function ringIntersectsObject(object) {
      if (!S.on || !object.geometry || object.isSprite || !object.parent || RB.noCull) return RB.noCull ? true : fo.call(this, object); // (an object with no parent is a post-processing quad, drawn with its own camera)
      const geometry = object.geometry;
      if (geometry.boundingSphere === null) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) return fo.call(this, object);
      sp.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
      RB.pt(sp.center.x, sp.center.y, sp.center.z, bp);
      sp.center.set(bp.x, bp.y, bp.z);
      sp.radius = sp.radius * 1.5 + 100;
      return this.intersectsSphere(sp);
    };
    chunksOk = true;
  } catch (e) { console.warn('view3d ringBend install', e); chunksOk = false; }
  return chunksOk;
}
install();

// ---- the path (the same maths as the GLSL) ----------------------------------------------------------------------------------------------------------------------------------------------
const S = { on: false, R: 2500, xRing: 0, C: 0, xa: 0, thLine: 0, k1: 1e-4, pxa: [0, 0], axisY: 0, variant: '', flat: 700, blend: 900, xc: 0, thc: 0, pc: [0, 0], cos: 1, sin: 0 };
const _p = [0, 0];
function path(x, out) { // out = [Px, Pz, theta]
  const R = S.R;
  if (x >= S.xRing) { const t = (x - S.xRing) / R; out[0] = R * Math.sin(t); out[1] = R * Math.cos(t); out[2] = t; /* wobble-ok: the ring's own geometry (an angle on the circle, not the time) */ } else if (x >= S.xa) {
    const t = S.thLine + S.k1 * (x - S.xa); out[0] = Math.sin(t) / S.k1; out[1] = R + (Math.cos(t) - 1) / S.k1; out[2] = t; // wobble-ok: the lead-in arc's geometry (an angle on the path, not the time)
  } else { const t = S.thLine; out[0] = S.pxa[0] + (x - S.xa) * Math.cos(t); out[1] = S.pxa[1] - (x - S.xa) * Math.sin(t); out[2] = t; } // wobble-ok: the approach line's heading, not the time
  return out;
}
const smooth = (a, b, v) => { const t = clamp((v - a) / Math.max(1e-6, b - a), 0, 1); return t * t * (3 - 2 * t); };
const _pa = [0, 0, 0];

export const RB = {
  uniforms: UNI,
  get on() { return S.on; },
  get R() { return S.R; },
  get xRing() { return S.xRing; },
  get C() { return S.C; },
  get axisY() { return S.axisY; },
  get xc() { return S.xc; },
  get thc() { return S.thc; }, // (R2: the heading of the path under the camera; a thing in the ring's own frame, like the castle's ward, turns by -thc about the vertical axis at RB.axis())
  get flat() { return S.flat; },
  get ok() { return chunksOk; },
  state: S,
  GLSL: RING_GLSL,
  noCull: false, // (dev: draw every object, never test it against the screen; host.html?ring=nocull)
  // map = state.course.map or null. Returns true when the ring is on.
  setMap(map) {
    const r = map && map.ring, K = config.RING3D || {};
    const want = !!(r && K.ENABLED !== false && chunksOk && fin(r.R) && r.R > 100 && fin(r.xRing));
    if (!want) { S.on = false; A.x = 0; return false; }
    if (S.on && S.xRing === r.xRing && S.R === r.R && S.variant === r.variant) return true;
    S.on = true; S.R = r.R; S.xRing = r.xRing; S.C = r.C; S.axisY = r.axisY; S.variant = r.variant;
    const La = clamp(fin(K.LEAD) ? K.LEAD : 0.8, 0, 2) * S.R;
    S.k1 = 1 / (2 * S.R);
    S.xa = S.xRing - La;
    S.thLine = -S.k1 * La;
    S.pxa[0] = Math.sin(S.thLine) / S.k1; S.pxa[1] = S.R + (Math.cos(S.thLine) - 1) / S.k1;
    A.w = S.R; C.set(S.xRing, S.xa, S.thLine, S.k1); D.x = S.pxa[0]; D.y = S.pxa[1];
    return true;
  },
  // Every frame (and every extra pass that looks somewhere else): xc = the x the camera looks at (map x), halfLen = the half length of the ship the flat zone must cover.
  setFrame(xc, halfLen = 0, flatPx = 0) {
    if (!S.on) { A.x = 0; return; }
    const K = config.RING3D || {};
    S.flat = flatPx > 0 ? flatPx : clamp((fin(halfLen) ? halfLen : 0) + (fin(K.FLAT_PAD) ? K.FLAT_PAD : 200), fin(K.FLAT) ? K.FLAT : 700, fin(K.FLAT_MAX) ? K.FLAT_MAX : 1500);
    S.blend = Math.max(100, fin(K.BLEND) ? K.BLEND : 900);
    path(fin(xc) ? xc : 0, _pa);
    S.xc = fin(xc) ? xc : 0; S.pc[0] = _pa[0]; S.pc[1] = _pa[1]; S.thc = _pa[2]; S.cos = Math.cos(S.thc); S.sin = Math.sin(S.thc);
    A.set(1, S.xc, S.thc, S.R); B.set(S.pc[0], S.pc[1], S.flat, S.flat + S.blend); D.z = S.cos; D.w = S.sin;
  },
  // an extra pass that looks somewhere else (a porthole): the bend is made relative to ITS look-at x for the pass. Returns the function that puts the main frame back.
  pass(xc) {
    if (!S.on) return () => {};
    const x0 = S.xc, f0 = S.flat;
    RB.setFrame(xc, 0);
    return () => RB.setFrame(x0, 0, f0);
  },
  // the same maps as GLSL ringBend: a flat point (x, y up, z toward the viewer) -> where it is drawn. out = { x, y, z, phi } (phi = how far the strip is turned there). Allocation free.
  pt(x, y, z, out) {
    out = out || { x: 0, y: 0, z: 0, phi: 0 };
    if (!S.on) { out.x = x; out.y = y; out.z = z; out.phi = 0; return out; }
    path(x, _pa);
    const th = _pa[2], dx = _pa[0] + z * Math.sin(th) - S.pc[0], dz = _pa[1] + z * Math.cos(th) - S.pc[1];
    const qx = dx * S.cos - dz * S.sin, qz = dx * S.sin + dz * S.cos;
    const w = smooth(S.flat, S.flat + S.blend, Math.abs(x - S.xc));
    out.x = x + (S.xc + qx - x) * w; out.z = z + (qz - z) * w; out.y = y; out.phi = w * (th - S.thc);
    return out;
  },
  // the heading difference at a map x (radians; 0 in the flat zone)
  phi(x) { return RB.pt(x, 0, 0, _tmp).phi; },
  // where the castle's axis is in the frame (x, z) for the camera at S.xc (the keep stands there)
  axis(out) {
    out = out || { x: 0, z: 0 };
    if (!S.on) { out.x = S.xc; out.z = -S.R; return out; }
    const dx = -S.pc[0], dz = -S.pc[1];
    out.x = S.xc + dx * S.cos - dz * S.sin; out.z = dx * S.sin + dz * S.cos;
    return out;
  },
  // the ring angle at a map x (ring.js ringAngle), in radians, for the placeholder castle and the dial
  angle(x) { return (x - S.xRing) / S.R; },
  // Add the shared ring uniforms to a custom ShaderMaterial's uniforms dictionary.
  addUniforms(u) { u.uRingA = UNI.uRingA; u.uRingB = UNI.uRingB; u.uRingC = UNI.uRingC; u.uRingD = UNI.uRingD; return u; },
};
const _tmp = { x: 0, y: 0, z: 0, phi: 0 };
if (typeof location !== 'undefined' && /[?&]ring=nocull/.test(location.search || '')) RB.noCull = true;
export const ringUniforms = RB.addUniforms;
