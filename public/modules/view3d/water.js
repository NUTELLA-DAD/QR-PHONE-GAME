// The Sunken Sea's water (WP3): FLAT toon water, fixed to the world, with nothing that wobbles.
//   - one big plane at the sea level (it is opaque, so it is also what hides the Kraken's segments below the water line, like the old slab did);
//   - TWO colour steps by depth: beyond a world-fixed line (z = -split) the water is the lighter shallow colour, nearer it is the deep one;
//   - a cheap fake REFLECTION (Medium and High): the mirrored sky gradient, painted in steps (zenith colour near, horizon colour toward the far edge, a mist band at the edge);
//   - A2 (Wind Waker sea): STAMPED FOAM, not lanes: two hashed grids of world cells, each cell holding (config.LOOK3D.<env>.water.density) one arc, ring, dash pair or broken ring from the trim sheet's
//     sea-foam atlas row, sliding along its OWN direction at its own constant speed (never on a straight lane), growing and shrinking away in steps, with a thin ink edge of a constant screen width;
//     a TWO-TONE CREST (a static value-noise texture, thresholded into lighter patches and, near the viewer, darker ones, sliding at one constant slow speed); a stepped sun GLITTER stipple in the far
//     third; a stepped HORIZON HAZE that melts the sea into the painted sky's horizon colour (no hard line). All in this one shader: no sine, no vertex waves, the plane is flat, nothing extra is drawn;
//   - a SHORELINE ring: where the rock meets the water (the map's solid rows at the sea level) a pale shallow band and a foam ribbon hug the rock's foot;
//   - SPLASH hooks for the VFX pass (WP4): water.splashAt(x, y, size [, z]) puts a ring decal on the surface (two rings growing at a constant speed, faded in steps at 8 per second).
// The surface is lit like the other toon things (the Kraken's and the ship's shadows fall on it, foam included); the haze and the glitter are painted (unlit). Water is exempt from the rim light.
import { THREE, gradientMap, look, fx } from './style.js';
import { getTrimSheet, uvRect, TRIM, SEA_FOAM } from './textures.js';
import { config } from '../../config.js';
import { Z_FRONT_OPEN, Z_FRONT_CAVE } from './terrain.js';

const Z_FAR = -1500; // where the water ends in the distance (the horizon: the same place the old slab ended)
const SPLIT = 520; // the colour step: farther than this behind the ship plane = shallow
const MAX_SPLASH = 24, SPLASH_LIFE = 1.0;
// A2: the stamps (the foam atlas row of textures.js): the world size of one cell's box at scale 1 (the cell's texels times a scale), and the cell's size in texels
const STAMP_SCALE = { seaFoam0: 0.7, seaFoam1: 1.8, seaFoam2: 0.8, seaFoam3: 1.8 };

const FRAG_HEAD = `
  varying vec3 vWPos;
  uniform float uTime, uSplit, uZFar, uSpeed, uLevel, uRefl, uDens, uCrestAmt, uDarkAmt, uGlit, uHazeAmt, uInkPx;
  uniform vec3 uDeep, uShallow, uFoamCol, uSkyTop, uHor, uShoreTint, uInk, uCrest, uGlitCol, uHazeCol;
  uniform float uUntone, uExposure;
  vec3 untoneNeutral( vec3 c ) { float x = min( c.r, min( c.g, c.b ) ); float xp = x >= 0.04 ? x + 0.04 : ( 1.0 - sqrt( max( 0.0, 1.0 - 25.0 * x ) ) ) / 12.5; return ( c + ( xp - x ) ) / max( uExposure, 0.0001 ); } // (as style.js paintedPlane: the haze is painted like the sky it melts into)
  uniform sampler2D uFoamTex, uNoiseTex; uniform vec4 uFoamRect;
  uniform vec4 uSF[4]; // the stamp cells in the atlas: u0 v0 u1 v1
  uniform vec4 uSFB[4]; // xy = the cell's box in world units (scale 1), zw = the cell in texels
  float h11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
  // ONE grid of foam stamps, fixed to the world. Every cell holds (with chance uDens) one stamp: an arc, a ring, a pair of dashes or a broken ring, that slides along its own direction at its own
  // CONSTANT speed (a linear function of time, wrapping inside its own cell), grows in two steps, and shrinks away in two steps before it wraps. Returns ( fill, ink line ). The atlas alpha is a ramp
  // (0.5 on the shape's edge), so the fill is alpha > threshold and the ink is the thin band just under it, about uInkPx screen pixels wide at any distance.
  vec2 seaStamp( vec2 wp, vec2 gdx, vec2 gdy, vec2 cs, float seed, vec2 scl, float hz ) {
    vec2 id = floor( wp / cs );
    float n = id.x * 53.0 + id.y * 197.0 + seed;
    if ( h11( n ) > uDens ) return vec2( 0.0 );
    float h1 = h11( n + 11.3 ), h2 = h11( n + 23.7 ), h3 = h11( n + 37.1 ), h4 = h11( n + 51.9 ), h5 = h11( n + 67.3 );
    float hk = scl.x < 0.8 ? pow( h1, 1.6 ) : h1; // (the small grid holds fewer rings)
    int k = hk < 0.42 ? 0 : ( hk < 0.68 ? 2 : ( hk < 0.83 ? 1 : 3 ) );
    vec4 R = uSF[ k ], B = uSFB[ k ];
    vec2 box = B.xy * scl;
    float travel = cs.x * 0.34, rate = uSpeed * ( 0.3 + 0.9 * h2 );
    float ph = fract( h4 + uTime * rate / travel );
    vec2 dir = normalize( vec2( ( h3 < 0.5 ? -1.0 : 1.0 ) * ( 0.75 + 0.25 * h5 ), ( h5 - 0.5 ) * 0.8 ) );
    vec2 ctr = ( id + 0.5 + ( vec2( h2, h5 ) - 0.5 ) * 0.1 ) * cs + dir * ( ph - 0.5 ) * travel;
    float ang = ( k == 0 || k == 2 ) ? ( h4 - 0.5 ) * 0.36 : 0.0;
    float ca = cos( ang ), sa = sin( ang );
    mat2 M = mat2( ca, -sa, sa, ca );
    vec2 fl = vec2( fract( h1 * 13.1 ) < 0.5 ? -1.0 : 1.0, fract( h3 * 17.7 ) < 0.5 ? -1.0 : 1.0 );
    vec2 uv = ( M * ( wp - ctr ) * fl ) / box + 0.5;
    if ( uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 ) return vec2( 0.0 );
    vec2 sz = vec2( R.z - R.x, R.w - R.y );
    vec2 cgx = ( M * gdx * fl ) / box, cgy = ( M * gdy * fl ) / box; // (the cell's uv per pixel)
    float a = textureGrad( uFoamTex, vec2( mix( R.x, R.z, uv.x ), mix( R.y, R.w, uv.y ) ), cgx * sz, cgy * sz ).a;
    float e = min( ph, 1.0 - ph ) * 2.0; // 0 at both ends of the slide, 1 in the middle: the stamp grows in two steps and shrinks in two steps (the threshold rises, so the shape thins away)
    float th = 0.5 + 0.8 * ( 1.0 - step( 0.1, e ) ) + 0.17 * ( 1.0 - step( 0.28, e ) ) + 0.12 * step( 0.78, hz ) + 0.12 * step( 0.9, hz );
    float tp = max( length( cgx * B.zw ), length( cgy * B.zw ) ); // texels per screen pixel
    float aw = max( 0.5 * tp / ( 24.0 + tp ), 0.015 ); // about one screen pixel in alpha units: the edges are anti-aliased
    float kk = clamp( uInkPx * tp / ( 24.0 + tp ), 0.03, 0.4 );
    float inkOn = 1.0 - smoothstep( 2.5, 6.0, tp ); // the ink thins out far away (a distant dash is just white)
    return vec2( smoothstep( th - aw, th + aw, a ), smoothstep( th - kk - aw, th - kk + aw, a ) * inkOn ); // (the second value covers the fill too: the fill is drawn over it)
  }
  // the sun glitter: short pale dashes in a stipple, static in the world, all sliding at one constant slow speed; densest in a band in the far third
  float seaGlit( vec2 wp, float hz, float nz ) {
    vec2 cs = vec2( 120.0, 60.0 );
    vec2 p = vec2( wp.x - uTime * 5.0, wp.y );
    vec2 id = floor( p / cs ), f = ( p / cs - id - 0.5 ) * cs;
    float n = id.x * 61.0 + id.y * 173.0 + 5.0;
    float dens = floor( clamp( 1.0 - abs( hz - 0.5 ) / 0.3, 0.0, 1.0 ) * 3.0 ) / 3.0 * uGlit * smoothstep( 0.35, 0.5, nz );
    if ( h11( n ) > dens ) return 0.0;
    float len = 20.0 + 30.0 * h11( n + 7.0 );
    vec2 j = ( vec2( h11( n + 3.0 ), h11( n + 9.0 ) ) - 0.5 ) * vec2( cs.x - 2.0 * len - 6.0, cs.y - 34.0 );
    vec2 q = abs( f - j );
    return step( q.x, len ) * step( q.y, 16.0 );
  }
`;
const FRAG_COLOR = `
  float wZf = -vWPos.z;
  float wDepth = step( uSplit, wZf );
  vec3 wCol = mix( uDeep, uShallow, wDepth );
  float wHz = clamp( wZf / uZFar, 0.0, 1.0 );
  float wMir = step( 0.5, wHz ) * 0.22;
  wCol = mix( wCol, mix( uSkyTop, uHor, step( 0.5, wHz ) ), uRefl * ( 0.12 + wMir ) );
  // the two-tone crest: a static value-noise texture (R = the light patches, G = the dark ones), fixed to the world, all sliding at one constant slow speed. The edges are cut hard (two flat
  // tones) but anti-aliased by the noise's own screen derivative, so nothing crawls when the camera moves.
  vec2 wNP = vec2( ( vWPos.x - uTime * uSpeed * 0.3 ) / 9000.0, vWPos.z / 3600.0 );
  vec2 wN = texture2D( uNoiseTex, wNP ).rg;
  float wNa = max( fwidth( wN.x ) * 0.9, 0.012 ), wNb = max( fwidth( wN.y ) * 0.9, 0.012 );
  float wLight = smoothstep( 0.6 - wNa, 0.6 + wNa, wN.x ) * ( 1.0 - step( 0.9, wHz ) );
  float wDark = smoothstep( 0.6 - wNb, 0.6 + wNb, wN.y ) * smoothstep( 250.0, 420.0, vWPos.z ) * ( 1.0 - wHz );
  wCol = mix( wCol, uCrest, wLight * uCrestAmt );
  wCol *= 1.0 - wDark * uDarkAmt;
  // the horizon haze: three or four flat steps toward the sky's horizon colour (the sea no longer ends on a hard line)
  float wHk = uHazeAmt * ( 0.16 * step( 0.64, wHz ) + 0.2 * step( 0.76, wHz ) + 0.24 * step( 0.88, wHz ) + 0.25 * step( 0.95, wHz ) );
  // the foam stamps: a big grid and a small one, each in the sea's own grid of world cells; far stamps are stretched in z (the sea is foreshortened there) so they keep their look
  vec2 wGdx = dFdx( vWPos.xz ), wGdy = dFdy( vWPos.xz );
  vec2 wScl = vec2( 1.0, 1.0 + 0.4 * wHz );
  vec2 wSA = seaStamp( vWPos.xz, wGdx, wGdy, vec2( 700.0, 270.0 ), 3.0, wScl, wHz );
  vec2 wSB = seaStamp( vWPos.xz, wGdx, wGdy, vec2( 440.0, 230.0 ), 91.0, wScl * 0.55, wHz );
  float wFoam = max( wSA.x, wSB.x ) * ( 1.0 - wHk );
  float wInk = max( wSA.y, wSB.y ) * ( 1.0 - wHk );
  wCol = mix( wCol, uInk, wInk );
  wCol = mix( wCol, uFoamCol, wFoam );
  diffuseColor.rgb = wCol;
  float wGl = seaGlit( vWPos.xz, wHz, wN.x ) * ( 1.0 - wHk );
  vec3 wHc = mix( uHazeCol, mix( uHor, uHazeCol, 0.5 ), step( 0.88, wHz ) ); // (the paler steps first, the sky's own horizon colour at the very end)
`;
const FRAG_TAIL = `
  outgoingLight = mix( outgoingLight, uGlitCol * uLevel, wGl );
  outgoingLight = mix( outgoingLight, mix( wHc, untoneNeutral( wHc ), uUntone ), wHk ); // (the haze is painted, unlit, like the sky behind it)
  #include <opaque_fragment>
`;

// A2: the crest pattern's texture. 128 x 128, tiles, built once with a fixed seed (no Math.random): R and G are two independent smooth value-noise fields (a coarse lattice plus a finer one),
// 0..1 around 0.5. The shader thresholds R for the light patches and G for the dark ones.
function noiseTexture() {
  const N = 128, d = new Uint8Array(N * N * 4);
  const lattice = (L, seed) => { const g = new Float32Array(L * L); let s = seed >>> 0; for (let i = 0; i < g.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; g[i] = s / 4294967296; } return g; };
  const val = (g, L, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % L) + L) % L, x1 = (x0 + 1) % L, y0 = ((yi % L) + L) % L, y1 = (y0 + 1) % L;
    const a = g[y0 * L + x0], b = g[y0 * L + x1], c = g[y1 * L + x0], e = g[y1 * L + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
  };
  const fields = [[lattice(8, 7), lattice(16, 8)], [lattice(8, 21), lattice(16, 22)]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (let c = 0; c < 2; c++) {
      const v = (val(fields[c][0], 8, (x / N) * 8, (y / N) * 8) * 0.68 + val(fields[c][1], 16, (x / N) * 16, (y / N) * 16) * 0.32);
      d[(y * N + x) * 4 + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    d[(y * N + x) * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  t.name = 'seaNoise';
  return t;
}

export function createWater(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const sheet = getTrimSheet();
  const fr = uvRect('foam', 1);
  const sf = SEA_FOAM.map((n) => uvRect(n, 1)), sfB = SEA_FOAM.map((n) => new THREE.Vector4(TRIM[n].w * STAMP_SCALE[n], TRIM[n].h * STAMP_SCALE[n], TRIM[n].w, TRIM[n].h));
  const U = {
    uTime: { value: 0 }, uSplit: { value: SPLIT }, uZFar: { value: -Z_FAR }, uSpeed: { value: 26 }, uLevel: { value: 1 }, uRefl: { value: 1 },
    uDeep: { value: new THREE.Color('#5b93a6') }, uShallow: { value: new THREE.Color('#80bcc4') }, uFoamCol: { value: new THREE.Color('#f4fbfa') }, uShoreTint: { value: new THREE.Color('#b6e0e2') },
    uSkyTop: { value: new THREE.Color('#4d93b8') }, uHor: { value: new THREE.Color('#e9f4ee') },
    uFoamTex: { value: sheet.texture }, uFoamRect: { value: new THREE.Vector4(fr.u0, fr.v0, fr.u1, fr.v1) },
    // A2: the stamps, the crest tones, the glitter and the haze (setRig fills them from config.LOOK3D.<env>.water)
    uSF: { value: sf.map((r) => new THREE.Vector4(r.u0, r.v0, r.u1, r.v1)) }, uSFB: { value: sfB }, uNoiseTex: { value: noiseTexture() },
    uDens: { value: 0.7 }, uCrestAmt: { value: 0.34 }, uDarkAmt: { value: 0.14 }, uGlit: { value: 0.4 }, uHazeAmt: { value: 1 }, uInkPx: { value: 1.8 },
    uInk: { value: new THREE.Color('#1d4756') }, uCrest: { value: new THREE.Color('#a4d3d4') }, uGlitCol: { value: new THREE.Color('#fff4cc') }, uHazeCol: { value: new THREE.Color('#73b3e9') },
    uUntone: fx.uUntone, uExposure: fx.uExposure,
  };
  const hazeBase = new THREE.Color('#73b3e9'), skyTint = new THREE.Color('#ffffff');

  // ---- the surface ----------------------------------------------------------------------------------------------------------------------------------------------------------
  const wMat = new THREE.MeshToonMaterial({ color: '#6f9fae', gradientMap });
  wMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD).replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR).replace('#include <opaque_fragment>', FRAG_TAIL);
  };
  wMat.customProgramCacheKey = () => 'toon-water';
  const wPlain = new THREE.MeshLambertMaterial({ color: '#6f9fae' });
  const wFlat = new THREE.MeshToonMaterial({ color: '#6f9fae', gradientMap });
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  planeGeo.rotateX(-Math.PI / 2); // lying flat, facing up; x -1/2..1/2, z -1/2..1/2
  const surface = new THREE.Mesh(planeGeo, wMat);
  surface.userData.toon = wMat; surface.userData.plain = wPlain; surface.userData.shadowReceiver = true;
  surface.receiveShadow = look.shadows;
  surface.frustumCulled = false;
  group.add(surface);

  // ---- the shoreline: where the map's rock stands in the water ----------------------------------------------------------------------------------------------------------------
  const shoreMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { ...U },
    vertexShader: `varying vec3 vWP; varying vec2 vUv; void main() { vUv = uv; vec4 wp = modelMatrix * vec4( position, 1.0 ); vWP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `
      varying vec3 vWP; varying vec2 vUv;
      uniform float uTime, uSpeed, uLevel; uniform vec3 uFoamCol, uShoreTint; uniform sampler2D uFoamTex; uniform vec4 uFoamRect;
      void main() {
        // vUv.y: 0 at the rock's foot .. 1 out on the water. A pale shallow band, then a scalloped foam ribbon on its edge.
        float u = ( vWP.x - uTime * uSpeed * 0.7 ) / 2048.0;
        vec2 raw = vec2( u, vUv.y );
        vec2 sc = vec2( uFoamRect.z - uFoamRect.x, uFoamRect.y - uFoamRect.w );
        vec2 uv = vec2( mix( uFoamRect.x, uFoamRect.z, fract( u ) ), mix( uFoamRect.w, uFoamRect.y, clamp( vUv.y * 0.9 + 0.05, 0.03, 0.97 ) ) );
        float a = textureGrad( uFoamTex, uv, dFdx( raw ) * sc, dFdy( raw ) * sc ).a;
        float band = step( vUv.y, 0.92 ) * step( 0.05, vUv.y );
        float foam = step( 0.55, a ) * band, foam2 = ( step( 0.16, a ) - step( 0.55, a ) ) * band;
        float tint = step( vUv.y, 0.8 ) * 0.5;
        vec3 c = mix( uShoreTint * ( 0.5 + 0.5 * uLevel ), uFoamCol * uLevel, foam );
        float al = max( tint, max( foam, foam2 * 0.7 ) );
        if ( al < 0.01 ) discard;
        gl_FragColor = vec4( c, al );
        #include <colorspace_fragment>
      }`,
  });
  shoreMat.toneMapped = false;
  const shore = new THREE.Mesh(new THREE.BufferGeometry(), shoreMat);
  shore.frustumCulled = false;
  shore.renderOrder = 2;
  group.add(shore);
  let shoreKey = '';
  const buildShore = (map, seaY) => {
    const key = map ? map.W + 'x' + map.H + '@' + Math.round(seaY) : '';
    if (key === shoreKey) return;
    shoreKey = key;
    shore.geometry.dispose();
    shore.geometry = new THREE.BufferGeometry();
    if (!map || !map.solid || !Number.isFinite(seaY)) return;
    const C = map.CELL, W = map.W, H = map.H, j = Math.floor(seaY / C), fy = seaY / C - j;
    if (j < 0 || j + 1 > H) return;
    const S = (a, b) => (b < 0 && map.open && a >= 0 && a < W ? 0 : a < 0 || b < 0 || a >= W || b >= H ? 1 : map.solid[b * W + a]);
    const corner = (a, b) => (S(a - 1, b - 1) + S(a, b - 1) + S(a - 1, b) + S(a, b)) / 4;
    const step = 20, spans = [];
    let start = null;
    for (let x = 0; x <= W * C; x += step) {
      const i = Math.min(W - 1, Math.floor(x / C)), fx = x / C - i;
      const top = corner(i, j) * (1 - fx) + corner(i + 1, j) * fx, bot = corner(i, j + 1) * (1 - fx) + corner(i + 1, j + 1) * fx, v = top * (1 - fy) + bot * fy;
      const inRock = v >= 0.5;
      if (inRock && start == null) start = x;
      if (!inRock && start != null) { spans.push([start, x]); start = null; }
    }
    if (start != null) spans.push([start, W * C]);
    const Zf = map.open ? Z_FRONT_OPEN : Z_FRONT_CAVE, y = -seaY + 0.8;
    const pos = [], uvs = [];
    for (const [a, b] of spans.slice(0, 600)) { // one ribbon per stretch of rock: from its foot (v = 0) out onto the water (v = 1), a little wider than the rock at both ends
      const x0 = a - 40, x1 = b + 40, zf = Zf - 20, depth = 150;
      pos.push(x0, y, zf, x1, y, zf, x1, y, zf + depth, x0, y, zf, x1, y, zf + depth, x0, y, zf + depth);
      uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    shore.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shore.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    shore.geometry.computeBoundingSphere();
  };

  // ---- splashes (the hook the VFX pass calls) ------------------------------------------------------------------------------------------------------------------------------------
  const sGeo = new THREE.InstancedBufferGeometry();
  { // a unit quad lying flat: x, z in -1..1
    const p = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1]);
    sGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  }
  const sData = new Float32Array(MAX_SPLASH * 4);
  for (let i = 0; i < MAX_SPLASH; i++) sData[i * 4 + 2] = -1000;
  const sAttr = new THREE.InstancedBufferAttribute(sData, 4);
  sAttr.setUsage(THREE.DynamicDrawUsage);
  sGeo.setAttribute('aSplash', sAttr);
  sGeo.instanceCount = MAX_SPLASH;
  const sMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    uniforms: { uTime: U.uTime, uY: { value: 0 }, uFoamCol: U.uFoamCol, uLevel: U.uLevel },
    vertexShader: `
      attribute vec4 aSplash; varying vec2 vP; varying float vAge; varying float vSize;
      uniform float uTime, uY;
      void main() {
        float age = max( 0.0, uTime - aSplash.z );
        vAge = floor( age * 8.0 ) / 8.0;
        vP = position.xz;
        float r = aSplash.w * 2.2;
        vec3 wp = vec3( aSplash.x + position.x * r, uY, aSplash.y + position.z * r );
        gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
        if ( age > ${SPLASH_LIFE.toFixed(2)} ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
      }`,
    fragmentShader: `
      varying vec2 vP; varying float vAge;
      uniform vec3 uFoamCol; uniform float uLevel;
      void main() {
        float p = clamp( vAge / ${SPLASH_LIFE.toFixed(2)}, 0.0, 1.0 );
        float r = length( vP );
        float r1 = 0.14 + 0.76 * p, r2 = 0.06 + 0.5 * p;
        float ring = step( abs( r - r1 ), 0.07 ) + step( abs( r - r2 ), 0.045 ) * step( 0.05, p );
        float fade = 1.0 - floor( p * 4.0 ) * 0.22;
        if ( ring < 0.5 ) discard;
        gl_FragColor = vec4( uFoamCol * uLevel, 0.92 * fade );
        #include <colorspace_fragment>
      }`,
  });
  sMat.toneMapped = false;
  const splashes = new THREE.Mesh(sGeo, sMat);
  splashes.frustumCulled = false;
  splashes.renderOrder = 3;
  group.add(splashes);

  const T = { group, surface, time: 0, seaY: NaN, tierOK: true, refl: 1 };
  let nextSplash = 0;
  // splashAt(x, y, size [, z]): a ring decal on the water. x = the world x (the game's own x), y = the game's y (unused: the rings lie on the surface), size = the ring's radius in world
  // units (about the splashing thing's width), z = how far toward the viewer (default 40, just in front of the ship plane). WP4 can draw real splash particles on top.
  T.splashAt = (x, y, size = 160, z = 40) => {
    if (!group.visible || !Number.isFinite(x) || !Number.isFinite(size)) return;
    const i = nextSplash++ % MAX_SPLASH;
    sData[i * 4] = x; sData[i * 4 + 1] = Number.isFinite(z) ? z : 40; sData[i * 4 + 2] = T.time; sData[i * 4 + 3] = Math.max(20, Math.min(900, size));
    sAttr.needsUpdate = true;
  };
  // the environment's colours (config.LOOK3D.<env>.water + the sky colours of config.ENVIRONMENTS for the mirror) and the darkness
  T.setRig = (rig, envId) => {
    const w = rig.water || {};
    U.uDeep.value.set(w.deep || '#5b93a6'); U.uShallow.value.set(w.shallow || '#80bcc4'); U.uFoamCol.value.set(w.foam || '#f4fbfa'); U.uSpeed.value = Number.isFinite(w.speed) ? w.speed : 26;
    U.uShoreTint.value.set(w.shallow || '#80bcc4').lerp(new THREE.Color('#ffffff'), 0.35);
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    U.uDens.value = Math.max(0, Math.min(1, num(w.density, 0.7))); U.uCrestAmt.value = Math.max(0, Math.min(1, num(w.crestAmt, 0.34))); U.uDarkAmt.value = Math.max(0, Math.min(0.6, num(w.darkAmt, 0.14)));
    U.uGlit.value = Math.max(0, Math.min(1, num(w.glitter, 0.4))); U.uHazeAmt.value = Math.max(0, Math.min(1, num(w.haze, 1))); U.uInkPx.value = Math.max(0.5, Math.min(4, num(w.inkPx, 1.8)));
    U.uInk.value.set(w.ink || '#1d4756'); U.uCrest.value.set(w.crest || '#a4d3d4'); U.uGlitCol.value.set(w.glitterCol || '#fff4cc');
    hazeBase.set(w.hazeCol || '#73b3e9'); U.uHazeCol.value.copy(hazeBase).multiply(skyTint);
    const E = (config.ENVIRONMENTS && config.ENVIRONMENTS[envId]) || {};
    const sky = Array.isArray(E.sky) ? E.sky : null, hex = (s, d) => (typeof s === 'string' ? (s[0] === '#' ? s : '#' + s) : d);
    U.uSkyTop.value.set(hex(sky && sky[0], '#4d93b8')); U.uHor.value.set(hex(sky && sky[sky.length - 1], '#e9f4ee'));
  };
  // the time of day's tint of the painted sky (world.js setTod): the haze that melts the sea into that sky takes it too
  T.setSkyTint = (c) => { try { skyTint.set(c || '#ffffff'); U.uHazeCol.value.copy(hazeBase).multiply(skyTint); } catch { /* (a bad colour: the tint stays) */ } };
  T.setLevel = (night) => { U.uLevel.value = 1 - 0.7 * Math.max(0, Math.min(1, night)); }; // (the painted foam dims in the dark)
  T.setTier = (tier) => { U.uRefl.value = tier && tier.name === 'low' ? 0 : 1; };
  // every frame. seaY = the sea level in the game's y (NaN = no sea). cam = the THREE camera.
  T.update = (cam, target, t, seaY, map) => {
    T.time = t;
    U.uTime.value = t;
    if (!Number.isFinite(seaY)) { group.visible = false; return; }
    group.visible = true;
    surface.userData.toon = look.water ? wMat : wFlat; // (?look=nowater: the old plain flat water, no foam, no shore, no splashes)
    const want = look.toon ? surface.userData.toon : wPlain;
    if (surface.material !== want) surface.material = want;
    shore.visible = splashes.visible = look.water;
    T.seaY = seaY;
    const y = -seaY, zNear = Math.max(1500, cam.position.z + 900);
    surface.scale.set(80000, 1, zNear - Z_FAR);
    surface.position.set(target.x, y, (zNear + Z_FAR) / 2);
    sMat.uniforms.uY.value = y + 1.2;
    buildShore(map, seaY);
  };
  T.dispose = () => { surface.geometry.dispose(); shore.geometry.dispose(); sGeo.dispose(); wMat.dispose(); shoreMat.dispose(); sMat.dispose(); U.uNoiseTex.value.dispose(); };
  return T;
}
