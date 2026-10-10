// WP12: THE FALLING LAYER. Rain streaks, snow flakes, rising embers, drifting motes and a star field: ONE instanced mesh (one draw call), moved entirely in the vertex shader.
// NO WOBBLE (3D.md section 1, rule 6): a rain streak, a flake, a mote moves in a straight line at a constant speed; an ember rises under plain gravity. There is no noise, no sine, no curl.
// How: every instance has a fixed random place (a seeded generator, painted once). The shader puts it in a box that is wrapped round the camera's look-at point, but the pattern itself is
// fixed to the WORLD (position = random place + slide, wrapped), so nothing shimmers when the camera pans; things leave one edge of the box (faded out) and re-enter at the other, like the 2D art's tiles.
// The slide is a number the view integrates every frame (a gust changes the SLOPE, never the places), and it is wrapped by a whole number of boxes, so it never pops. Three speed classes
// (0.75, 1, 1.25) make that wrap exact. How many are shown is a smooth density (each instance has its own threshold and fades in or out), so a storm THICKENS instead of switching on.
//   mode 0 rain (a thin streak along the fall direction), 1 snow (soft flakes), 2 embers (born at the lava, rise under gravity, cool as they climb), 3 motes (slow glowing dust)
//   stars: instances flagged `far` are painted in the screen's own space (they never parallax: the sky picture's own stars do not either) and drift across it at a tiny constant speed.
import { THREE } from './style.js';

const VERT = /* glsl */`
  attribute vec4 aA; attribute vec4 aB;
  uniform vec2 uBox; uniform vec2 uZ; uniform vec2 uC; uniform vec2 uPhase; uniform vec2 uDir; uniform vec2 uRes;
  uniform float uMode, uScale, uSize, uLen, uDensity, uStars, uTime, uLavaY, uEmber, uPx, uCut;
  varying vec2 vC; varying float vA; varying float vSeed; varying float vFar; varying float vHeat;
  float wrap1( float v, float s ) { return v - s * floor( v / s ); }
  float h11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
  void main() {
    vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
    vec3 up = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
    vec2 c = position.xy;
    vC = c; vSeed = aB.z; vFar = aB.y; vHeat = 0.0;
    float far = aB.y;
    if ( far > 0.5 ) { // a star: in the picture's own space, drifting a tiny constant amount
      float on = clamp( ( uStars - aB.x ) * 6.0, 0.0, 1.0 );
      float x = wrap1( aA.x + uTime * ( 0.0016 + 0.0016 * aA.w ), 1.0 ) * 2.0 - 1.0;
      float y = aA.y * 1.35 - 0.3;
      vA = on * smoothstep( -0.1, 0.25, y ) * ( 0.35 + 0.65 * aB.z );
      float s = ( 1.6 + 2.2 * aB.z ) * uPx;
      vec2 ndc = vec2( x, y ) + c * s * 2.0 / uRes;
      gl_Position = vec4( ndc, 0.99995, 1.0 );
      return;
    }
    float spd = 0.75 + 0.25 * floor( aA.w * 2.999 ); // three speed classes (so the phase wraps exactly)
    float thr = clamp( ( uDensity - aB.x ) * 6.0, 0.0, 1.0 );
    vec2 rel; float z = uZ.x + aA.z * uZ.y; float a = thr; vec2 q; vec3 wp;
    if ( uMode > 1.5 && uMode < 2.5 ) { // embers: born on the lava (or the bottom of the view), rise and slow down under gravity, cool and fade
      float per = 3.0 + 4.0 * aA.w; float u = uTime / per + aA.z * 17.0; float cyc = floor( u ); float tau = fract( u ) * per;
      float rx = h11( aA.x * 91.0 + cyc * 0.37 + aA.y * 13.0 );
      float v0 = 190.0 + 330.0 * aA.y, g = 2.0 * v0 / per; // rises to its top exactly when its cycle ends
      float xw = rx * uBox.x + ( aB.z - 0.5 ) * 60.0 * tau;
      rel.x = wrap1( xw - uC.x + 0.5 * uBox.x, uBox.x ) - 0.5 * uBox.x;
      float y = uLavaY + 20.0 + v0 * tau - 0.5 * g * tau * tau;
      rel.y = y - uC.y;
      float life = tau / per;
      a *= smoothstep( 0.0, 0.06, life ) * ( 1.0 - smoothstep( 0.55, 1.0, life ) );
      a *= 1.0 - smoothstep( 0.8, 1.0, abs( rel.x ) / ( 0.5 * uBox.x ) );
      vHeat = 1.0 - life; // white-yellow when new, red when it is nearly out
      z = uZ.x + aA.z * uZ.y * 0.6;
      float sz = uSize * ( 0.55 + 0.9 * aB.w ) * uScale * ( 1.0 - 0.35 * life );
      q = c * sz;
    } else {
      vec2 base = vec2( aA.x * uBox.x + uPhase.x * spd, aA.y * uBox.y + uPhase.y * spd );
      rel = vec2( wrap1( base.x - uC.x + 0.5 * uBox.x, uBox.x ) - 0.5 * uBox.x, wrap1( base.y - uC.y + 0.5 * uBox.y, uBox.y ) - 0.5 * uBox.y );
      a *= 1.0 - smoothstep( 0.8, 1.0, max( abs( rel.x ) / ( 0.5 * uBox.x ), abs( rel.y ) / ( 0.5 * uBox.y ) ) ); // (faded where it leaves the box: no pop)
      float sz = uSize * ( 0.6 + 0.8 * aB.w ) * uScale;
      if ( uMode < 0.5 ) { // a rain streak, long along the fall direction as the camera sees it
        vec2 dv = vec2( dot( vec3( uDir, 0.0 ), right ), dot( vec3( uDir, 0.0 ), up ) );
        float dl = length( dv ); dv = dl > 0.0001 ? dv / dl : vec2( 0.0, -1.0 );
        q = dv * ( c.x * uLen * uScale * ( 0.7 + 0.6 * aB.w ) ) + vec2( -dv.y, dv.x ) * ( c.y * sz );
      } else if ( uMode > 2.5 ) { q = c * sz; a *= 0.45 + 0.55 * aB.w; }
      else { // snow: a flake; in a blizzard it is stretched along the wind
        vec2 dv = vec2( dot( vec3( uDir, 0.0 ), right ), dot( vec3( uDir, 0.0 ), up ) );
        float dl = length( dv ); dv = dl > 0.0001 ? dv / dl : vec2( 1.0, 0.0 );
        float st = 1.0 + uLen * 2.6;
        q = dv * ( c.x * sz * st ) + vec2( -dv.y, dv.x ) * ( c.y * sz );
      }
    }
    wp = vec3( uC + rel, z );
    if ( wp.y < uCut ) a = 0.0; // (nothing below the lava, the sea)
    vA = a;
    vec3 w = wp + right * q.x + up * q.y;
    gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
    if ( a <= 0.002 ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform vec3 uColor2; uniform vec3 uTint; uniform float uMode, uAlpha, uAddk, uHdr;
  varying vec2 vC; varying float vA; varying float vSeed; varying float vFar; varying float vHeat;
  void main() {
    vec2 p = vC * 2.0; float r = length( p ); float a; vec3 rgb = uColor;
    if ( vFar > 0.5 ) { a = ( 1.0 - smoothstep( 0.2, 1.0, r ) ); rgb = mix( vec3( 0.86, 0.9, 1.0 ), vec3( 1.0, 0.92, 0.8 ), vSeed ); a *= vA; gl_FragColor = vec4( rgb * 1.35 * a, a * 0.1 );
      if ( a < 0.01 ) discard;
    } else {
      if ( uMode < 0.5 ) { float along = vC.x + 0.5; a = ( 1.0 - smoothstep( 0.18, 0.5, abs( vC.y ) ) ) * smoothstep( 0.0, 0.8, along ) * ( 0.35 + 0.65 * along ); }
      else if ( uMode < 1.5 ) a = 1.0 - smoothstep( 0.55, 1.0, length( vec2( p.x * 0.8, p.y ) ) );
      else if ( uMode < 2.5 ) { a = 1.0 - smoothstep( 0.25, 1.0, r ); rgb = mix( uColor2, uColor, vHeat ) * ( 0.8 + 1.4 * ( 1.0 - r ) ); }
      else { a = pow( 1.0 - smoothstep( 0.0, 1.0, r ), 1.6 ); rgb = mix( uColor, uColor2, vSeed ); }
      a *= vA * uAlpha;
      if ( a < 0.004 ) discard;
      vec3 lit = mix( rgb * uTint, rgb, step( 1.5, uMode ) ) * uHdr; // (rain and snow take the light of the place; embers and motes glow by themselves)
      gl_FragColor = vec4( lit * a, a * ( 1.0 - uAddk ) );
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// a small seeded generator (mulberry32): the places are fixed, the same every run
function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function createFall(parent, maxN = 700) {
  const r = rng(0x5eed12);
  const aA = new Float32Array(maxN * 4), aB = new Float32Array(maxN * 4);
  for (let i = 0; i < maxN; i++) {
    aA[i * 4] = r(); aA[i * 4 + 1] = r(); aA[i * 4 + 2] = r(); aA[i * 4 + 3] = r();
    aB[i * 4] = (i + 0.5) / maxN; // the threshold: instance i shows when the density is above it (the first ones are always there)
    aB[i * 4 + 1] = r() < 0.28 ? 1 : 0; // a star (only shown when the stars are on)
    aB[i * 4 + 2] = r(); aB[i * 4 + 3] = r();
  }
  // the near ones (not stars) get their own order of thresholds so the density thins them evenly
  let nNear = 0;
  for (let i = 0; i < maxN; i++) if (aB[i * 4 + 1] < 0.5) nNear++;
  let k = 0;
  for (let i = 0; i < maxN; i++) if (aB[i * 4 + 1] < 0.5) aB[i * 4] = (k++ + 0.5) / nNear;
  let ks = 0, nFar = maxN - nNear;
  for (let i = 0; i < maxN; i++) if (aB[i * 4 + 1] > 0.5) aB[i * 4] = Math.min(0.999, (ks++ + 0.5) / Math.max(1, nFar));
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute('aA', new THREE.InstancedBufferAttribute(aA, 4));
  geo.setAttribute('aB', new THREE.InstancedBufferAttribute(aB, 4));
  geo.instanceCount = maxN;
  const U = {
    uBox: { value: new THREE.Vector2(5000, 3000) }, uZ: { value: new THREE.Vector2(-650, 950) }, uC: { value: new THREE.Vector2() }, uPhase: { value: new THREE.Vector2() }, uDir: { value: new THREE.Vector2(0, -1) }, uRes: { value: new THREE.Vector2(1600, 900) },
    uMode: { value: 0 }, uScale: { value: 1 }, uSize: { value: 4 }, uLen: { value: 100 }, uDensity: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 }, uLavaY: { value: -1e5 }, uEmber: { value: 0 }, uPx: { value: 1 }, uCut: { value: -1e9 },
    uColor: { value: new THREE.Color('#dbe8f7') }, uColor2: { value: new THREE.Color('#ff5a1c') }, uTint: { value: new THREE.Color('#ffffff') }, uAlpha: { value: 0.5 }, uAddk: { value: 0 }, uHdr: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  mat.fog = false;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 19; // (after the sky strips, the clouds and the water, before the particles)
  mesh.name = 'wxFall';
  mesh.visible = false;
  parent.add(mesh);
  const F = { mesh, U, maxN, nNear, nFar, phase: { x: 0, y: 0 }, box: { x: 5000, y: 3000 } };
  F.setCount = (n) => { geo.instanceCount = Math.max(1, Math.min(maxN, Math.round(n))); };
  F.dispose = () => { parent.remove(mesh); geo.dispose(); mat.dispose(); };
  return F;
}
