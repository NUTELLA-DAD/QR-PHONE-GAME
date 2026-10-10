// WP12: THE WORLD'S OWN WEATHER THINGS (fixed to the map, not to a ship):
//   LAVA (Ember Forge): the lava lies in the map's OPEN gaps at the sim's lava level (state.env.lavaY; only where the map's cells are open at that row, exactly like the 2D game: rock columns stay rock) as a flat
//     glowing sheet (HDR, so the bloom burns it) with dark crust plates drifting at a CONSTANT speed and bright cracks round them (cells fixed to the world), and a tall soft glow wall standing behind the ship over the same
//     gaps. ONE mesh, one draw call. The thermals' heat under the ship is the key light (lights.setHeat), the smoke plumes and the embers are particles (weather.js).
//   WATERSPOUTS and SURVIVORS' RAFTS (Sunken Sea): ONE instanced mesh holds both shapes (a vertex attribute says which piece belongs to which kind, the instance says what it is). A waterspout is a tall banded column
//     that widens toward the top with a spiral of dark stripes and a white ring of spray at its foot; it turns RIGIDLY in steps (a few hundredths of a turn at 8 steps a second). A raft is two planks and one or two
//     little figures in coats; an arm is raised or lowered in two stepped keys (they wave).
//   AURORA (the Aether): one painted band of soft curtains (a canvas painted once, static) that sky.js slides along at a constant speed.
// No sine, no noise that moves, no vertex displacement.
import { THREE, gradientMap, rimify } from './style.js';
import { config } from '../../config.js';
import { Z_FRONT_OPEN, Z_FRONT_CAVE } from './terrain.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;
const W3 = () => (config.LOOK3D && config.LOOK3D.WEATHER) || {};
const Z_FAR = -1500;

// ======================================== LAVA ========================================
const LAVA_VERT = `
  attribute vec3 aQ; // x: -1..1 along the span (x0..x1 in the attributes below), y: 0..1 (depth / height), z: 0 the sheet, 1 the glow wall
  attribute vec2 aSpan;
  uniform float uY, uZ0, uZ1, uGlow, uWallZ;
  varying vec3 vW; varying float vWall; varying float vV;
  void main() {
    float x = mix( aSpan.x, aSpan.y, aQ.x * 0.5 + 0.5 );
    vec3 w = aQ.z < 0.5 ? vec3( x, uY, mix( uZ0, uZ1, aQ.y ) ) : vec3( x, uY + aQ.y * uGlow, uWallZ );
    vW = w; vWall = aQ.z; vV = aQ.y;
    gl_Position = projectionMatrix * viewMatrix * vec4( w, 1.0 );
  }
`;
const LAVA_FRAG = `
  uniform float uTime, uSpeed, uHdr, uAlpha, uScale, uCrack, uNear, uNearZ, uVentStep, uVentShare, uFarDim, uSmoke;
  uniform vec3 uHot, uMid, uDeep, uGlowCol, uCrust, uSmokeCol;
  varying vec3 vW; varying float vWall; varying float vV;
  float h21( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
  float vn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + 1.0 ), f.x ), f.y ); }
  vec2 h22( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.xx + p3.yz ) * p3.zy ); }
  // cellular pattern: x = distance to the nearest point, y = to the second nearest (their difference is 0 on the line between two plates), z = a hash of the nearest cell
  vec3 vor( vec2 q ) {
    vec2 i = floor( q ), f = fract( q ); float d1 = 8.0, d2 = 8.0, id = 0.0;
    for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
      vec2 g = vec2( float( x ), float( y ) ); vec2 r = g + h22( i + g ) - f; float d = dot( r, r );
      if ( d < d1 ) { d2 = d1; d1 = d; id = h21( i + g + 17.0 ); } else if ( d < d2 ) d2 = d;
    }
    return vec3( sqrt( d1 ), sqrt( d2 ), id );
  }
  void main() {
    if ( vWall > 0.5 ) { // the glow wall: a soft warm veil, strongest at the lava, gone at the top
      float a = ( 1.0 - vV ); a = a * a * uAlpha;
      gl_FragColor = vec4( uGlowCol * a, a * 0.08 );
    } else {
      // WP15: a CRUST of dark, irregular cooled plates (a cellular pattern fixed to the world, sliding along x at a constant slow speed) with GLOWING CRACKS between them: a hot yellow core, an orange
      // seam and a dull red rim cooling into the crust, in flat toon bands. The VENTS (a sparse fixed grid) widen the cracks and open a molten pool, so the glow gathers toward them. Darker toward the viewer.
      vec2 pq = vec2( vW.x - uTime * uSpeed, vW.z ) / uScale;
      pq += 0.45 * ( vec2( vn( pq * 0.8 ), vn( pq * 0.8 + 9.0 ) ) - 0.5 ); // (warped, so the plates are irregular, not tiles)
      vec3 v = vor( pq );
      float flow = vn( vW.xz / 1100.0 + 3.0 ); // (broad hot and cool regions fixed to the world: the crust is thin where the magma is near)
      float e = v.y - v.x, aa = max( fwidth( e ) * 1.3, 0.012 );
      float heat = 0.0; vec2 vq = vW.xz / uVentStep, vi = floor( vq );
      for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
        vec2 g = vi + vec2( float( x ), float( y ) );
        if ( h21( g + 31.0 ) < uVentShare ) heat = max( heat, 1.0 - smoothstep( 0.07, 0.36, length( vq - ( g + 0.2 + 0.6 * h22( g + 5.0 ) ) ) ) );
      }
      float w = uCrack * ( 0.5 + 1.0 * flow ) + 0.2 * heat;
      float live = step( 0.32 - 0.4 * heat, v.z ); // (a seam that has cooled stays a dull red line: only some of them glow)
      float core = live * ( 1.0 - smoothstep( w * 0.45, w * 0.45 + aa, e ) );
      float seam = live * ( 1.0 - smoothstep( w, w + aa, e ) );
      float rim = 1.0 - smoothstep( w * 2.0, w * 2.0 + aa, e );
      vec3 col = uCrust * ( 0.7 + 0.6 * v.z ); // (each plate a slightly different dark)
      col = mix( col, uDeep * 0.7, rim * 0.85 );
      col = mix( col, uMid, seam );
      col = mix( col, uHot * 1.25, core );
      float pool = step( 0.72, heat ); // (a vent: a molten pool, hottest in the middle)
      col = mix( col, mix( uMid * 1.05, uHot * 1.2, step( 0.9, heat ) ), pool );
      col *= mix( 1.0, uNear, smoothstep( 0.0, uNearZ, vW.z ) ); // (the foreground sinks into the dark: it is not where the game is played)
      float fa = smoothstep( 0.0, 0.08, vV ); // (it melts into the haze at the far edge)
      // A3: the far lava is a painting that RECEDES: its glow drops by uFarDim past the middle distance, and a dark smoke haze (a static, broken band) lies over the far end of it
      float farK = 1.0 - smoothstep( 0.25, 0.65, vV );
      float smoke = uSmoke * ( 1.0 - smoothstep( 0.02, 0.34, vV ) ) * ( 0.65 + 0.35 * vn( vW.xz / 900.0 + 5.0 ) );
      col = mix( col * ( 1.0 - uFarDim * farK ), uSmokeCol, clamp( smoke, 0.0, 1.0 ) );
      gl_FragColor = vec4( col * uHdr * fa, fa );
    }
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createLava(parent) {
  const U = {
    uY: { value: 0 }, uZ0: { value: Z_FAR }, uZ1: { value: 400 }, uGlow: { value: 700 }, uWallZ: { value: -380 },
    uTime: { value: 0 }, uSpeed: { value: 9 }, uHdr: { value: 1.12 }, uAlpha: { value: 0.4 }, uScale: { value: 230 }, uCrack: { value: 0.075 }, uNear: { value: 0.4 }, uNearZ: { value: 900 }, uVentStep: { value: 1700 }, uVentShare: { value: 0.5 }, uFarDim: { value: 0.25 }, uSmoke: { value: 0.55 }, uSmokeCol: { value: new THREE.Color('#3a1a1c') },
    uHot: { value: new THREE.Color('#ffcf4a') }, uMid: { value: new THREE.Color('#ff7a1c') }, uDeep: { value: new THREE.Color('#c8320f') }, uGlowCol: { value: new THREE.Color('#ff6e1e') }, uCrust: { value: new THREE.Color('#33150f') },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  mat.fog = false;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.visible = false; mesh.name = 'wxLava';
  parent.add(mesh);
  const L = { mesh, spans: 0, key: '' };
  // the open spans of the map at the lava row: [[x0, x1], ...] (map pixels)
  const spansOf = (map, lavaY) => {
    const C = map.CELL, W = map.W, j = Math.min(map.H - 1, Math.floor(lavaY / C) + 1), out = [];
    let a = -1;
    for (let i = 0; i <= W; i++) {
      const open = i < W && !map.solid[j * W + i];
      if (open && a < 0) a = i;
      if (!open && a >= 0) { out.push([a * C - 40, i * C + 40]); a = -1; }
    }
    return out;
  };
  const build = (map, lavaY) => {
    const key = map ? map.W + 'x' + map.H + '@' + Math.round(lavaY) : '';
    if (key === L.key) return;
    L.key = key;
    mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    const q = [], sp = [];
    if (map && map.solid && fin(lavaY)) {
      const spans = spansOf(map, lavaY).slice(0, 400);
      L.spans = spans.length;
      for (const [x0, x1] of spans) for (const wall of [0, 1]) {
        for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]]) { q.push(u, v, wall); sp.push(x0, x1); }
      }
    } else L.spans = 0;
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(q.length), 3)); // (the vertex count; the shader places the points)
    g.setAttribute('aQ', new THREE.Float32BufferAttribute(q, 3));
    g.setAttribute('aSpan', new THREE.Float32BufferAttribute(sp, 2));
    mesh.geometry = g;
  };
  // lavaY = the game's y (down) of the lava surface, NaN = no lava; map = the course's map; cam = THREE camera
  L.update = (t, lavaY, map, cam, drop = 0) => { // (drop: how far the SHEET lies below the sim's lava line, so less of the picture is lava and the ship is cut off less)
    if (!fin(lavaY) || !map) { mesh.visible = false; return; }
    const C = W3().LAVA || {}, E = (config.ENVIRONMENTS.ember || {}).LAVA || {};
    build(map, lavaY);
    mesh.visible = L.spans > 0;
    U.uY.value = -lavaY - (fin(drop) ? drop : 0); U.uZ0.value = Z_FAR; U.uZ1.value = map.open ? Math.max(600, Math.min(cam.position.z + 600, 5000)) : Z_FRONT_CAVE - 6;
    const num = (v, d) => (fin(v) ? v : d);
    U.uTime.value = t; U.uSpeed.value = num(C.SPEED, 9); U.uHdr.value = num(C.HDR, 1.12);
    U.uFarDim.value = clamp(num(C.FAR_DIM, 0.25), 0, 0.9); U.uSmoke.value = clamp(num(C.HAZE, 0.55), 0, 1); U.uSmokeCol.value.set(C.HAZE_COLOR || '#3a1a1c'); // (A3)
    U.uScale.value = num(C.SCALE, 230); U.uCrack.value = num(C.CRACK, 0.075); U.uNear.value = num(C.NEAR, 0.4); U.uNearZ.value = Math.max(100, num(C.NEAR_Z, 900));
    U.uVentStep.value = Math.max(300, num(C.VENT_STEP, 1700)); U.uVentShare.value = num(C.VENT_SHARE, 0.5); U.uCrust.value.set(C.CRUST || '#33150f');
    U.uGlow.value = (E.GLOW || 700) * (fin(C.WALL) ? C.WALL : 1); U.uAlpha.value = num(C.WALL_ALPHA, 0.4);
    U.uWallZ.value = (map.open ? Z_FRONT_OPEN : Z_FRONT_CAVE) - 380;
    const col = E.COLOR || ['#ffcf4a', '#ff7a1c', '#c8320f'];
    U.uHot.value.set(col[0]); U.uMid.value.set(col[1]); U.uDeep.value.set(col[2]);
  };
  L.dispose = () => { parent.remove(mesh); mesh.geometry.dispose(); mat.dispose(); };
  return L;
}

// ======================================== WATERSPOUTS AND RAFTS ========================================
// piece codes: 0 spout; 1 raft (planks + the first figure's body); 2 the second figure's body; 3 / 4 the first arm (up / down); 5 / 6 the second arm (up / down)
export function createSeaThings(parent, max = 48) {
  const C = W3(), SP = C.SPOUT || {}, RF = C.RAFT || {};
  const pos = [], nor = [], col = [], piece = [];
  const tmp = new THREE.Color();
  const pushTri = (a, b, c, color, pc) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); tmp.set(color); col.push(tmp.r, tmp.g, tmp.b); piece.push(pc); }
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const addBox = (color, cx, cy, cz, w, h, d, pc, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rz) g.applyMatrix4(new THREE.Matrix4().makeRotationZ(rz));
    g.translate(cx, cy, cz);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) pushTri(V(p.getX(i), p.getY(i), p.getZ(i)), V(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)), V(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)), color, pc);
    g.dispose();
  };
  const addBall = (color, cx, cy, cz, r, pc) => {
    const g = new THREE.SphereGeometry(r, 8, 6).toNonIndexed();
    g.translate(cx, cy, cz);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) pushTri(V(p.getX(i), p.getY(i), p.getZ(i)), V(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)), V(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)), color, pc);
    g.dispose();
  };
  // ---- the spout (unit height, core radius 1; the instance scales it)
  {
    const S = clamp(Math.round(SP.SIDES || 16), 8, 28), R = clamp(Math.round(SP.RINGS || 9), 3, 16), cs = SP.COLORS || ['#a7bccb', '#3f6178', '#e9f4fa'];
    const ringP = (i, s) => { const f = i / R, r = 1 + f * 2.8, a = (s / S) * Math.PI * 2; return V(Math.cos(a) * r, f, Math.sin(a) * r); };
    for (let i = 0; i < R; i++) for (let s = 0; s < S; s++) {
      const f = (i + 0.5) / R; // (the dark spiral stripes are painted in the fragment shader below: a clean diagonal, not a staircase of squares)
      tmp.set(cs[0]).lerp(new THREE.Color(cs[2]), f * f * 0.7);
      const c = '#' + tmp.getHexString();
      const a = ringP(i, s), b = ringP(i, s + 1), c2 = ringP(i + 1, s + 1), d = ringP(i + 1, s);
      pushTri(a, c2, b, c, 0); pushTri(a, d, c2, c, 0);
    }
    for (let s = 0; s < 16; s++) { // the ring of spray at its foot (flat, white)
      const a0 = (s / 16) * Math.PI * 2, a1 = ((s + 1) / 16) * Math.PI * 2, rr = 3.4;
      pushTri(V(0, 0.004, 0), V(Math.cos(a1) * rr, 0.004, Math.sin(a1) * rr), V(Math.cos(a0) * rr, 0.004, Math.sin(a0) * rr), cs[2], 0);
    }
  }
  // ---- the raft (world units; the foot of the raft is y = 0)
  {
    const wood = RF.WOOD || ['#7a5a3a', '#9a7248'], coats = RF.COATS || ['#d65a4a', '#e8a23c'], skin = RF.SKIN || '#e8d3b0';
    addBox(wood[0], 0, 8, 0, 148, 16, 70, 1);
    addBox(wood[1], -22, 23, 8, 54, 14, 42, 1);
    for (const [q, px, coat] of [[0, -34, coats[0]], [1, 18, coats[1]]]) {
      const pcBody = q === 0 ? 1 : 2, pcA = q === 0 ? 3 : 5, pcB = q === 0 ? 4 : 6;
      addBox(coat, px, 48, 0, 22, 34, 16, pcBody);
      addBall(skin, px, 74, 0, 11, pcBody);
      addBox(coat, px + 16, 66, 0, 5, 30, 6, pcA, -0.75); // an arm raised
      addBox(coat, px + 16, 46, 0, 5, 26, 6, pcB, -0.2); // an arm down
    }
  }
  const cs0 = SP.COLORS || ['#a7bccb', '#3f6178', '#e9f4fa'];
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aPiece', new THREE.Float32BufferAttribute(piece, 1));
  const inst = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  inst.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aInst', inst);
  geo.instanceCount = 0;
  const m = rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, side: THREE.DoubleSide }));
  const rim = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    rim(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPiece; attribute vec3 aInst; varying vec3 vSp; varying float vPc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSp = position; vPc = aPiece;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { float pc = aPiece, kind = aInst.x, n = aInst.y, key = aInst.z; bool vis;
          if ( kind < 0.5 ) vis = pc < 0.5;
          else vis = pc > 0.5 && ( pc < 1.5 || ( pc < 2.5 ? n > 1.5 : pc < 3.5 ? key < 0.5 : pc < 4.5 ? key > 0.5 : pc < 5.5 ? ( n > 1.5 && key < 0.5 ) : ( n > 1.5 && key > 0.5 ) ) );
          if ( ! vis ) gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 ); }`);
    sh.uniforms.uStripe = { value: new THREE.Color(cs0[1]) };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSp; varying float vPc; uniform vec3 uStripe;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        if ( vPc < 0.5 && vSp.y > 0.003 ) { // the spout's spiral: three dark stripes a turn, climbing with the height (fixed to the column, which turns rigidly)
          float sp = fract( atan( vSp.z, vSp.x ) / 6.2831853 * 3.0 + vSp.y * 2.4 );
          diffuseColor.rgb = mix( diffuseColor.rgb, uStripe, step( 0.8, sp ) * ( 1.0 - 0.55 * vSp.y ) );
        }`);
  };
  m.customProgramCacheKey = () => 'toon-rim-sea-things';
  const mesh = new THREE.InstancedMesh(geo, m, max);
  // InstancedMesh wants its own instanceMatrix; the geometry is an InstancedBufferGeometry so the attribute count must match
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false; mesh.name = 'wxSea'; mesh.visible = false; mesh.renderOrder = 1;
  parent.add(mesh);
  const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _P = new THREE.Vector3(), _S = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
  const T = { mesh, spouts: 0, rafts: 0, n: 0 };
  // begin a frame; spout(x, seaY, z, r, height, spin), raft(x, seaY, z, n, key); end() uploads
  let k = 0;
  T.begin = () => { k = 0; T.spouts = 0; T.rafts = 0; };
  T.spout = (x, y, z, r, h, spin) => {
    if (k >= max || !fin(x + y + r + h)) return;
    _Q.setFromAxisAngle(_Y, spin);
    _M.compose(_P.set(x, y, z), _Q, _S.set(r, h, r));
    mesh.setMatrixAt(k, _M); inst.setXYZ(k, 0, 1, 0); k++; T.spouts++;
  };
  T.raft = (x, y, z, n, key, flip) => {
    if (k >= max || !fin(x + y)) return;
    _Q.identity();
    _M.compose(_P.set(x, y, z), _Q, _S.set(flip ? -1.6 : 1.6, 1.6, 1.6));
    mesh.setMatrixAt(k, _M); inst.setXYZ(k, 1, n > 1 ? 2 : 1, key ? 1 : 0); k++; T.rafts++;
  };
  T.end = () => {
    mesh.count = k; geo.instanceCount = k; T.n = k;
    mesh.visible = k > 0;
    if (k > 0) { mesh.instanceMatrix.needsUpdate = true; inst.needsUpdate = true; }
  };
  T.dispose = () => { parent.remove(mesh); geo.dispose(); m.dispose(); };
  return T;
}

// ======================================== AURORA ========================================
// A painted band of soft curtains, 2048 x 512 (a tile 4:1, seamless across, sky.js repeats it). Static: painted once. Returns a CanvasTexture.
export function makeAurora() {
  const A = W3().AURORA || {}, colors = A.COLORS || ['#3df2b4', '#7a5cff', '#ff5cc8'];
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 512;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 2048, 512);
  g.globalCompositeOperation = 'lighter';
  let s = 0x2468ace;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < 26; i++) {
    const cx = rnd() * 2048, w = 50 + rnd() * 200, top = 40 + rnd() * 120, bot = 260 + rnd() * 200, hue = colors[(rnd() * colors.length) | 0];
    const tw = Math.round(w * 2), th = Math.round(bot - top), part = document.createElement('canvas'); // (one curtain on a canvas of its own: tall fade, then soft sides)
    part.width = tw; part.height = th;
    const p = part.getContext('2d'), gr = p.createLinearGradient(0, 0, 0, th);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.18, hue); gr.addColorStop(0.55, hue); gr.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = gr; p.fillRect(0, 0, tw, th);
    p.globalCompositeOperation = 'destination-in';
    const gx = p.createLinearGradient(0, 0, tw, 0);
    gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
    p.fillStyle = gx; p.fillRect(0, 0, tw, th);
    g.globalAlpha = 0.16 + 0.2 * rnd();
    for (const off of [-2048, 0, 2048]) g.drawImage(part, cx + off - w, top); // (drawn three times so the tile joins itself)
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
