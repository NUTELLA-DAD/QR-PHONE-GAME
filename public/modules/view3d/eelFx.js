// THE VOID EEL'S MARKS IN 3D (3D.md section 42): what the 2D game draws over the fight (render.js drawEelFx) and the 3D view must draw itself, plus the glows that make the eel readable on a TV in the dark. ONE draw call of
// rotatable quads, each with its own little fragment program (the kind in aA.x), always over the picture (depth test off, like the grip rings and the 2D game). Everything that moves does so on the 8 a second key (uKey), never a
// sine of time. The blending is premultiplied (an additive mark writes alpha 0), so rings and glows share one material. The quads go through the ring bend on a ring map (the finale).
//   0  the LURE'S RING     a red dashed ring round the gold lure once the lookout has called it
//   1  the SWALLOW'S RING  a red disc with a dashed rim that follows her bow (filling as the telegraph runs), solid and darker once it is locked
//   2  a CHEVRON           a broad red chevron pointing from the head to the ring (the lunge's way)
//   3  a HALO              a soft additive glow (gold on a bright joint, cyan, pink in the maw, white)
//   4  a TWINKLE           a four-point star (the lure's sparkle, on the 8 fps key)
//   5  the PICKUP RING     a thin gold annulus round the lure, as the game marks every pickup
//   6  a STREAK            an additive speed line behind the lunging head
// Each is a quad: centre, half sizes, rotation, kind, then up to four numbers for the program.
import { THREE } from './style.js';
import { RB, RING_GLSL } from './ringBend.js';

const MAX = 96;
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

export function createEelMarks(parent, P) {
  const pos = new Float32Array(MAX * 6 * 3), loc = new Float32Array(MAX * 6 * 2), A = new Float32Array(MAX * 6 * 4), B = new Float32Array(MAX * 6 * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aP', new THREE.BufferAttribute(loc, 2));
  geo.setAttribute('aA', new THREE.BufferAttribute(A, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aB', new THREE.BufferAttribute(B, 4).setUsage(THREE.DynamicDrawUsage));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  for (let q = 0; q < MAX; q++) for (let k = 0; k < 6; k++) { loc[(q * 6 + k) * 2] = corners[k][0]; loc[(q * 6 + k) * 2 + 1] = corners[k][1]; }
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const col = (h) => new THREE.Color(h);
  const U = RB.addUniforms({
    uKey: { value: 0 }, uInk: { value: col('#1d1426') }, uRed: { value: col(P.ring || '#ff4d4d') }, uRedLt: { value: col(P.ringLt || '#ffd0d0') }, uGold: { value: col(P.gold) }, uGoldLt: { value: col(P.goldLt) },
    uCyan: { value: col(P.eye) }, uPink: { value: col(P.throat) }, uWhite: { value: col('#ffffff') }, uViolet: { value: col(P.finEdge) },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: `
      ${RING_GLSL}
      attribute vec2 aP; attribute vec4 aA; attribute vec4 aB; varying vec2 vP; varying vec4 vA; varying vec4 vB;
      void main() { vP = aP; vA = aA; vB = aB; vec3 wp = position; if ( uRingA.x > 0.5 ) wp = ringBend( wp ); gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 ); }`,
    fragmentShader: `
      varying vec2 vP; varying vec4 vA; varying vec4 vB;
      uniform float uKey; uniform vec3 uInk, uRed, uRedLt, uGold, uGoldLt, uCyan, uPink, uWhite, uViolet;
      float dashes( float a, float n ) { return step( 0.5, fract( a * n ) ); }
      void main() {
        // vA = kind, half width, half height, p1; vB = p2, p3, p4, rot. The quad is already rotated: vP is in its own frame, q in px
        vec2 q = vP * vA.yz;
        float kind = vA.x, pulse = mod( floor( uKey ), 2.0 ), addf = 0.0;
        vec4 c = vec4( 0.0 );
        if ( kind < 0.5 ) { // the lure's ring: a dashed red circle (vA.w = its radius)
          float d = length( q ), r = vA.w, a = fract( atan( q.y, q.x ) / 6.28318 );
          float dash = dashes( a + 0.03 * pulse, 16.0 );
          if ( step( abs( d - r ), 15.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( d - r ), 8.5 ) * dash > 0.5 ) c = vec4( uRed, 1.0 );
        } else if ( kind < 1.5 ) { // the swallow's ring: vA.w = the radius, vB.x = 1 once locked, vB.y = how far the telegraph has come (0..1)
          float d = length( q ), r = vA.w, a = fract( atan( q.y, q.x ) / 6.28318 ), locked = vB.x, u = vB.y;
          if ( d < r ) c = vec4( uRed, mix( 0.1 + 0.12 * u, 0.32, locked ) );
          float w = mix( 8.0, 12.0, locked ), dash = mix( dashes( a + 0.03 * pulse, 15.0 ), 1.0, locked );
          if ( step( abs( d - r ), w + 6.0 ) * dash > 0.5 ) c = vec4( uInk, 1.0 );
          if ( step( abs( d - r ), w ) * dash > 0.5 ) c = vec4( mix( uRed, uRedLt, locked * 0.3 ), 1.0 );
        } else if ( kind < 2.5 ) { // a chevron pointing along +x of the quad: vA.w = opacity
          float w = vA.y, h = vA.z, ay = abs( q.y ), line = q.x - ( w * 0.5 - ay * ( w / h ) ), thick = 20.0;
          if ( abs( line ) < thick * 1.6 && ay < h ) c = vec4( uInk, 0.9 * vA.w );
          if ( abs( line ) < thick * 0.8 && ay < h ) c = vec4( uRed, vA.w );
        } else if ( kind < 3.5 ) { // a soft halo (vA.w: 0 gold, 1 cyan, 2 pink, 3 white; vB.x = strength)
          float d = length( q ) / vA.y, f = vA.w;
          vec3 hc = f < 0.5 ? uGold : f < 1.5 ? uCyan : f < 2.5 ? uPink : uWhite;
          float a = pow( 1.0 - smoothstep( 0.0, 1.0, d ), 1.6 ) * vB.x;
          c = vec4( hc, a ); addf = 1.0;
        } else if ( kind < 4.5 ) { // a twinkle: an astroid (a four-point star), bright core (vB.x = strength)
          vec2 n = abs( q ) / vA.y;
          float s = 1.0 - ( sqrt( n.x ) + sqrt( n.y ) );
          float a = clamp( s * 3.0, 0.0, 1.0 ) * vB.x, core = smoothstep( 0.55, 0.9, s );
          c = vec4( mix( uGoldLt, uWhite, core ), a ); addf = 1.0;
        } else if ( kind < 5.5 ) { // the pickup ring: a thin gold annulus (vA.w = the radius, vB.x = opacity)
          float d = length( q ), r = vA.w;
          if ( abs( d - r ) < 14.0 ) c = vec4( uInk, vB.x );
          if ( abs( d - r ) < 8.0 ) c = vec4( mix( uGold, uGoldLt, pulse * 0.5 ), vB.x );
        } else { // a streak along +x of the quad: the head's end (x = +) bright, the tail fading (vB.x = strength)
          float t = ( vP.x + 1.0 ) * 0.5, across = 1.0 - abs( vP.y );
          float a = pow( t, 1.6 ) * pow( across, 1.5 ) * vB.x;
          c = vec4( mix( uViolet, uWhite, t * t ), a ); addf = 1.0;
        }
        if ( c.a < 0.01 ) discard;
        gl_FragColor = vec4( c.rgb * c.a, c.a * ( 1.0 - addf ) );
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19;
  mesh.visible = false;
  mesh.name = 'eelMarks';
  parent.add(mesh);
  let n = 0;
  const quad = (cx, cy, cz, hw, hh, rot, kind, p1 = 0, b0 = 0, b1 = 0, b2 = 0) => {
    if (n >= MAX || !Number.isFinite(cx) || !Number.isFinite(cy) || !(hw > 0) || !(hh > 0)) return;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    for (let k = 0; k < 6; k++) {
      const i = n * 6 + k, lx = corners[k][0] * hw, ly = corners[k][1] * hh;
      pos[i * 3] = cx + lx * cs - ly * sn; pos[i * 3 + 1] = cy + lx * sn + ly * cs; pos[i * 3 + 2] = cz;
      A[i * 4] = kind; A[i * 4 + 1] = hw; A[i * 4 + 2] = hh; A[i * 4 + 3] = p1;
      B[i * 4] = b0; B[i * 4 + 1] = b1; B[i * 4 + 2] = b2; B[i * 4 + 3] = rot;
    }
    n++;
  };
  return {
    mesh,
    begin(key) { n = 0; U.uKey.value = key; },
    // (x, y) in 3D (y up)
    lureRing(x, y, z, r) { quad(x, y, z, r * 1.12, r * 1.12, 0, 0, r); },
    swallow(x, y, z, r, locked, u) { quad(x, y, z, r * 1.12, r * 1.12, 0, 1, r, locked ? 1 : 0, clamp01(u)); },
    chevron(x, y, z, w, h, rot, opacity = 1) { quad(x, y, z, w, h, rot, 2, clamp01(opacity)); },
    halo(x, y, z, r, color, strength) { quad(x, y, z, r, r, 0, 3, color, clamp01(strength)); },
    twinkle(x, y, z, s, strength) { quad(x, y, z, s, s, 0, 4, 0, clamp01(strength)); },
    pickupRing(x, y, z, r, opacity = 1) { quad(x, y, z, r * 1.12, r * 1.12, 0, 5, r, clamp01(opacity)); },
    streak(x, y, z, len, wid, rot, strength) { quad(x, y, z, len, wid, rot, 6, 0, clamp01(strength)); },
    end() {
      geo.setDrawRange(0, n * 6);
      geo.getAttribute('position').needsUpdate = geo.getAttribute('aA').needsUpdate = geo.getAttribute('aB').needsUpdate = true;
      mesh.visible = n > 0;
    },
    hide() { n = 0; geo.setDrawRange(0, 0); mesh.visible = false; },
    get count() { return n; },
    dispose() { geo.dispose(); mat.dispose(); mesh.removeFromParent(); },
  };
}
