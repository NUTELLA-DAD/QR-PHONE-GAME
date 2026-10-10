// The Sunken Sea's water (WP3): FLAT toon water, fixed to the world, with nothing that wobbles.
//   - one big plane at the sea level (it is opaque, so it is also what hides the Kraken's segments below the water line, like the old slab did);
//   - TWO colour steps by depth: beyond a world-fixed line (z = -split) the water is the lighter shallow colour, nearer it is the deep one;
//   - a cheap fake REFLECTION (Medium and High): the mirrored sky gradient, painted in steps (zenith colour near, horizon colour toward the far edge, a mist band at the edge);
//   - FOAM as stepped bands: lanes lying on the water, world-fixed in z, each a strip of the trim sheet's foam row (scalloped, alpha cut in two steps) sliding along x at a CONSTANT speed per lane
//     (a linear scroll of the texture coordinate: no sine, no vertex waves, the plane is flat);
//   - a SHORELINE ring: where the rock meets the water (the map's solid rows at the sea level) a pale shallow band and a foam ribbon hug the rock's foot;
//   - SPLASH hooks for the VFX pass (WP4): water.splashAt(x, y, size [, z]) puts a ring decal on the surface (two rings growing at a constant speed, faded in steps at 8 per second).
// The surface is lit like the other toon things (the Kraken's shadow falls on it); the foam is painted (unlit, dimmed with the darkness). Water is exempt from the rim light.
import { THREE, gradientMap, look } from './style.js';
import { getTrimSheet, uvRect } from './textures.js';
import { config } from '../../config.js';
import { Z_FRONT_OPEN, Z_FRONT_CAVE } from './terrain.js';

const Z_FAR = -1500; // where the water ends in the distance (the horizon: the same place the old slab ended)
const SPLIT = 520; // the colour step: farther than this behind the ship plane = shallow
const LANE = 520; // foam lane width (world z)
const MAX_SPLASH = 24, SPLASH_LIFE = 1.0;

const FRAG_HEAD = `
  varying vec3 vWPos;
  uniform float uTime, uSplit, uZFar, uSpeed, uLevel, uRefl, uLane;
  uniform vec3 uDeep, uShallow, uFoamCol, uSkyTop, uHor, uShoreTint;
  uniform sampler2D uFoamTex; uniform vec4 uFoamRect;
  float h11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }
`;
const FRAG_COLOR = `
  float wZf = -vWPos.z;
  float wDepth = step( uSplit, wZf );
  vec3 wCol = mix( uDeep, uShallow, wDepth );
  float wHz = clamp( wZf / uZFar, 0.0, 1.0 );
  float wMir = step( 0.5, wHz ) * 0.22 + step( 0.84, wHz ) * 0.3;
  wCol = mix( wCol, mix( uSkyTop, uHor, step( 0.5, wHz ) ), uRefl * ( 0.12 + wMir ) );
  diffuseColor.rgb = wCol;
  // foam lanes: lane = a strip of the foam row, sliding at a constant speed (linear in time)
  float wLi = floor( vWPos.z / uLane ), wLf = vWPos.z / uLane - wLi;
  float wSeed = h11( wLi + 17.0 );
  float wV = ( wLf - ( 0.1 + 0.25 * wSeed ) ) / 0.42;
  float wU = ( vWPos.x - uTime * uSpeed * ( 0.55 + 0.9 * h11( wLi + 3.0 ) ) ) / 4096.0 + wSeed * 7.0;
  vec2 wRaw = vec2( wU, wV );
  vec2 wGx = dFdx( wRaw ) * vec2( uFoamRect.z - uFoamRect.x, uFoamRect.y - uFoamRect.w ), wGy = dFdy( wRaw ) * vec2( uFoamRect.z - uFoamRect.x, uFoamRect.y - uFoamRect.w );
  vec2 wUv = vec2( mix( uFoamRect.x, uFoamRect.z, fract( wU ) ), mix( uFoamRect.w, uFoamRect.y, clamp( wV, 0.03, 0.97 ) ) );
  float wA = textureGrad( uFoamTex, wUv, wGx, wGy ).a;
  float wOn = step( 0.0, wV ) * step( wV, 1.0 ) * step( 0.28, wSeed ) * step( wZf, uZFar - 80.0 );
  float wFoam = step( 0.55, wA ) * wOn, wFoam2 = ( step( 0.16, wA ) - step( 0.55, wA ) ) * wOn;
`;
const FRAG_TAIL = `
  outgoingLight = mix( outgoingLight, uShoreTint * ( 0.55 + 0.45 * uLevel ), wFoam2 * 0.8 );
  outgoingLight = mix( outgoingLight, uFoamCol * uLevel, wFoam );
  #include <opaque_fragment>
`;

export function createWater(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const sheet = getTrimSheet();
  const fr = uvRect('foam', 1);
  const U = {
    uTime: { value: 0 }, uSplit: { value: SPLIT }, uZFar: { value: -Z_FAR }, uSpeed: { value: 26 }, uLevel: { value: 1 }, uRefl: { value: 1 }, uLane: { value: LANE },
    uDeep: { value: new THREE.Color('#5b93a6') }, uShallow: { value: new THREE.Color('#80bcc4') }, uFoamCol: { value: new THREE.Color('#f4fbfa') }, uShoreTint: { value: new THREE.Color('#b6e0e2') },
    uSkyTop: { value: new THREE.Color('#4d93b8') }, uHor: { value: new THREE.Color('#e9f4ee') },
    uFoamTex: { value: sheet.texture }, uFoamRect: { value: new THREE.Vector4(fr.u0, fr.v0, fr.u1, fr.v1) },
  };

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
    const E = (config.ENVIRONMENTS && config.ENVIRONMENTS[envId]) || {};
    const sky = Array.isArray(E.sky) ? E.sky : null, hex = (s, d) => (typeof s === 'string' ? (s[0] === '#' ? s : '#' + s) : d);
    U.uSkyTop.value.set(hex(sky && sky[0], '#4d93b8')); U.uHor.value.set(hex(sky && sky[sky.length - 1], '#e9f4ee'));
  };
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
  T.dispose = () => { surface.geometry.dispose(); shore.geometry.dispose(); sGeo.dispose(); wMat.dispose(); shoreMat.dispose(); sMat.dispose(); };
  return T;
}
