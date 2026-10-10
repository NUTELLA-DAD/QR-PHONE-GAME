// THE PARTICLE SYSTEM (WP4, 3D.md section 12). One fixed-size pool, simulated in JS (linear motion or plain gravity, never noise: 3D.md section 1, rule 6), drawn as camera-facing quads:
//   mesh 1 "alpha"    smoke, steam, dust, water droplets   (soft painted discs, normal alpha, tinted by the environment's light)
//   mesh 2 "additive" fire (the trim sheet's 4-frame flipbook, stepped at 8 fps), sparks and embers (stretched along their velocity), the 2-frame muzzle star, impact rings (stepped), flashes and glow halos
//   (HDR colours, so the bloom pass makes them glow; blending is "premultiplied" so a flame covers a bright sky a little instead of washing out)
//   + a third InstancedMesh of small lit boxes for splinters and chips (constant spin, gravity). That is 3 draw calls in all, however many particles are alive.
// Every particle is a row of the pool (a Float32Array); the instance buffers are written once a frame from it and uploaded once. Caps per tier (config.VFX3D.CAP): High 1500, Medium 800, Low 400, and Low has no splinter boxes.
// Nothing here reads or writes the simulation. vfx.js is the part that reads the game's state and calls this.
//
// COORDINATES are the 3D world's: x = the game's x, y = UP (the game's y negated), z toward the viewer (the gameplay plane is z = 0). Sizes are world units (a ship is about 2000 long).
//
// API (for WP5 and the dev page):
//   particles.burst(kind, x, y, z, n, opts)     n particles of a kind at a point. kind: 'fire' 'smoke' 'steam' 'dust' 'spark' 'ember' 'drop' (water droplet) 'ball' (a round toon fireball) 'flash' 'ring' 'muzzle'.
//        opts: dir (radians, 0 = +x, PI/2 = up; default up), spread (half-angle, default PI = all round), speed [min,max], life [min,max], size [min,max], size1 (end size multiplier), color (hex),
//              vx, vy, vz (inherited velocity), up (extra upward speed), ay (acceleration; negative = down), drag, alpha, hdr, stretch, warm, area (random scatter radius)
//   particles.spawn(kind, x, y, z, opts)         exactly one (opts as above, plus vx / vy / vz and life / size as plain numbers)
//   particles.splinters(x, y, z, n, opts)        n small lit boxes (opts: kind 'wood' | 'iron' | 'rock', speed, up, size, vx, vy, spread, dir)
//   particles.explosion(x, y, z, size, opts)     a prefab: flash + fire + sparks + smoke (+ ring, splinters when opts.wood)
//   particles.flash(x, y, z, size, color) / ring(x, y, z, size, color, life) / muzzle(x, y, z, angle, size, color)
//   particles.sprite(kind, ...)                   an immediate quad for ONE frame (flames that sit on a deck, shell tracers): see below.
//   particles.setTier(tier) / setView(cx, cy, halfW, halfH) / setAmbient(color, night) / begin() / update(dt, t) / stats() / clear()
import { THREE, gradientMap, rimify } from './style.js';
import { getTrimSheet, TRIM } from './textures.js';
import { config } from '../../config.js';

export const KIND = { fire: 0, smoke: 1, spark: 2, muzzle: 3, ring: 4, flash: 5, steam: 6, drop: 7, ball: 8 };
const ADDITIVE = [true, false, true, true, true, true, false, false, true]; // by kind: which of the two meshes draws it
const IN = 16; // floats per instance: aPos(x y z size) aDir(dx dy len kind) aCol(r g b a) aTime(frame seed - -)
const ST = 24; // floats per pooled particle
// pool row layout
const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, S0 = 8, S1 = 9, AY = 10, DRAG = 11, KD = 12, SEED = 13, CR = 14, CG = 15, CB = 16, A0 = 17, STRETCH = 18, WARM = 19, HDR = 20, ROT = 21, KEY = 22;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;
// a small seeded generator of its own: the view must not touch Math.random (the simulation shares it in the browser) and screenshots should repeat
let rs = 0x2545f491;
export const rnd = () => { rs = (Math.imul(rs ^ (rs >>> 15), 0x2c1b3c6d) + 0x7f4a7c15) | 0; let t = Math.imul(rs ^ (rs >>> 7), 1 | rs); t = (t + Math.imul(t ^ (t >>> 15), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const pick = (v) => (Array.isArray(v) ? (v.length === 2 && typeof v[0] === 'number' ? rr(v[0], v[1]) : v[(rnd() * v.length) | 0]) : v);

const colCache = new Map();
const _c = new THREE.Color();
export function rgbOf(hex) { // a colour as linear [r, g, b] (cached)
  let c = colCache.get(hex);
  if (!c) { _c.set(hex || '#ffffff'); c = [_c.r, _c.g, _c.b]; colCache.set(hex, c); }
  return c;
}

// ---- the shader (both meshes) ----------------------------------------------------------------------------------------------------------------------------------------------------
const VERT = /* glsl */`
  attribute vec4 aPos; attribute vec4 aDir; attribute vec4 aCol; attribute vec4 aTime;
  varying vec2 vUv; varying vec4 vCol; varying float vKind; varying float vFrame; varying float vStreak; varying float vSeed;
  void main() {
    vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] );
    vec3 up = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
    float size = aPos.w, kind = aDir.w;
    vec2 c = position.xy;
    vUv = c + 0.5; vCol = aCol; vKind = kind; vFrame = aTime.x; vSeed = aTime.y; vStreak = aDir.z > 0.0 ? 1.0 : 0.0;
    vec2 q;
    if ( aDir.z > 0.0 ) { // a streak: long along its direction (as the camera sees it), thin across
      vec2 dv = vec2( dot( vec3( aDir.xy, 0.0 ), right ), dot( vec3( aDir.xy, 0.0 ), up ) );
      float dl = length( dv ); dv = dl > 0.0001 ? dv / dl : vec2( 1.0, 0.0 );
      q = dv * ( c.x * aDir.z ) + vec2( -dv.y, dv.x ) * ( c.y * size );
    } else {
      vec2 cc = c;
      if ( kind < 0.5 ) cc.y += 0.42; // a flame stands on its position (the painted base is 8% above the bottom edge)
      q = vec2( cc.x * aDir.x - cc.y * aDir.y, cc.x * aDir.y + cc.y * aDir.x ) * size;
    }
    vec3 wp = aPos.xyz + right * q.x + up * q.y;
    gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
  }
`;
const FRAG = /* glsl */`
  uniform sampler2D tSheet; uniform vec4 uFire; uniform vec4 uSmoke;
  varying vec2 vUv; varying vec4 vCol; varying float vKind; varying float vFrame; varying float vStreak; varying float vSeed;
  void main() {
    vec3 rgb = vCol.rgb; float a = 0.0, addk = 0.0;
    vec2 p = ( vUv - 0.5 ) * 2.0; float r = length( p );
    if ( vKind < 0.5 ) { // fire: the flipbook frame (one of 4, stepped by the CPU at 8 fps)
      vec2 uv = vec2( uFire.x + vFrame * uFire.w + vUv.x * uFire.z, uFire.y - ( 1.0 - vUv.y ) * uFire.z );
      vec4 tx = texture2D( tSheet, uv );
      rgb *= tx.rgb; a = tx.a * vCol.a; addk = 0.5;
    } else if ( vKind < 1.5 || ( vKind > 5.5 && vKind < 6.5 ) ) { // smoke and steam: the painted soft disc
      vec2 uv = vec2( uSmoke.x + vUv.x * uSmoke.z, uSmoke.y - ( 1.0 - vUv.y ) * uSmoke.z );
      vec4 tx = texture2D( tSheet, uv );
      rgb *= tx.rgb; a = tx.a * vCol.a * ( 1.0 - smoothstep( 0.42, 0.84, r ) ); // (the painted disc's hard rim is softened)
    } else if ( vKind < 2.5 ) { // spark: a streak with a bright head, or a round ember
      if ( vStreak > 0.5 ) { float along = p.x; a = ( 1.0 - smoothstep( 0.7, 1.0, abs( p.x ) ) ) * ( 1.0 - smoothstep( 0.25, 1.0, abs( p.y ) ) ) * smoothstep( -1.0, 0.6, along ); }
      else a = 1.0 - smoothstep( 0.35, 1.0, r );
      a *= vCol.a; addk = vStreak > 0.5 ? 0.55 : 0.8;
    } else if ( vKind < 3.5 ) { // muzzle flash: a 2-frame star (6 rays, then 8 rays turned half a step)
      float rays = vFrame < 0.5 ? 6.0 : 8.0, off = vFrame < 0.5 ? 0.0 : 0.3927;
      float ang = atan( p.y, p.x ), k = 0.5 + 0.5 * cos( ( ang + off ) * rays );
      float rl = mix( 0.3, 1.0, k * k * k );
      float body = 1.0 - smoothstep( rl - 0.18, rl, r ), core = 1.0 - smoothstep( 0.0, 0.42, r );
      a = max( body * 0.9, core ) * vCol.a; rgb = mix( rgb, vec3( 3.2, 3.0, 2.4 ), core ); addk = 0.15;
    } else if ( vKind < 4.5 ) { // impact ring (its radius is stepped by the CPU)
      float d = abs( r - 0.84 );
      a = ( ( 1.0 - smoothstep( 0.08, 0.12, d ) ) + 0.14 * step( r, 0.84 ) ) * vCol.a; addk = 0.35;
    } else if ( vKind < 5.5 ) { // flash / glow halo: a soft disc
      float s = 1.0 - smoothstep( 0.0, 1.0, r ); a = s * s * vCol.a; addk = 1.0;
    } else if ( vKind > 7.5 ) { // a toon fireball (an explosion): a lumpy round shape in three flat steps (the lumps are fixed per particle, they never move)
      float ang = atan( p.y, p.x );
      float rl = r * ( 1.0 + 0.1 * sin( ang * 5.0 + vSeed * 6.2831 ) + 0.06 * sin( ang * 3.0 + vSeed * 17.0 ) );
      a = ( 1.0 - smoothstep( 0.86, 1.0, rl ) ) * vCol.a;
      vec3 stepc = rl < 0.38 ? vec3( 1.0, 0.86, 0.42 ) : rl < 0.68 ? vec3( 1.0, 0.5, 0.12 ) : vec3( 0.85, 0.2, 0.06 );
      rgb *= stepc; addk = 0.12;
    } else { // a water droplet: a crisp disc with a darker rim
      a = ( 1.0 - smoothstep( 0.88, 1.0, r ) ) * vCol.a; rgb *= mix( 1.0, 0.62, smoothstep( 0.62, 0.9, r ) );
    }
    if ( a < 0.004 ) discard;
    gl_FragColor = vec4( rgb * a, a * ( 1.0 - addk ) );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const makeMaterial = (sheet, order, depthTest) => {
  const S = 2048, f = TRIM.fire0, sm = TRIM.smoke;
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    uniforms: { tSheet: { value: sheet }, uFire: { value: new THREE.Vector4((f.x + 1) / S, 1 - (f.y + 1) / S, 254 / S, 256 / S) }, uSmoke: { value: new THREE.Vector4((sm.x + 1) / S, 1 - (sm.y + 1) / S, 254 / S, 0) } },
  });
  m.fog = false;
  m.userData.order = order;
  return m;
};

// ---- the defaults of each kind of particle -----------------------------------------------------------------------------------------------------------------------------------------
const V3 = () => (config.VFX3D || {});
const KINDS = {
  fire: { kd: KIND.fire, life: [0.38, 0.62], size: [38, 66], grow: 0.25, speed: [0, 40], up: [90, 160], ay: 0, drag: 0, color: '#ffffff', alpha: 1, hdr: 1.7 },
  smoke: { kd: KIND.smoke, life: [1.3, 2.2], size: [40, 68], grow: 2.4, speed: [8, 36], up: [50, 95], ay: 0, drag: 0.9, color: '#6e6a6a', alpha: 0.7, hdr: 1, warm: 0 },
  steam: { kd: KIND.steam, life: [0.9, 1.5], size: [30, 52], grow: 2.7, speed: [8, 40], up: [80, 140], ay: 0, drag: 0.7, color: '#f4f7f7', alpha: 0.66, hdr: 1 },
  dust: { kd: KIND.smoke, life: [0.7, 1.2], size: [26, 46], grow: 2.2, speed: [30, 110], up: [10, 50], ay: -60, drag: 2.4, color: '#a58f72', alpha: 0.6, hdr: 1 },
  spark: { kd: KIND.spark, life: [0.3, 0.7], size: [5, 8], grow: 1, speed: [260, 720], up: 0, ay: -1250, drag: 0.6, color: '#ffb040', alpha: 1, hdr: 2.3, stretch: 0.045 },
  ember: { kd: KIND.spark, life: [0.9, 1.7], size: [9, 15], grow: 0.35, speed: [20, 90], up: [90, 190], ay: -170, drag: 0.4, color: '#ff8a3a', alpha: 1, hdr: 2.4, stretch: 0 },
  drop: { kd: KIND.drop, life: [0.6, 1.1], size: [9, 15], grow: 0.8, speed: [180, 440], up: [60, 200], ay: -950, drag: 0.3, color: '#e6f4fa', alpha: 0.95, hdr: 1 },
  ball: { kd: KIND.ball, life: [0.35, 0.55], size: [70, 110], grow: 1.8, speed: [0, 60], up: [0, 40], ay: 0, drag: 1.5, color: '#ffffff', alpha: 1, hdr: 1.5 },
  flash: { kd: KIND.flash, life: [0.08, 0.1], size: [150, 150], grow: 1.25, speed: [0, 0], up: 0, ay: 0, drag: 0, color: '#ffe2a0', alpha: 1, hdr: 3 },
  ring: { kd: KIND.ring, life: [0.32, 0.32], size: [120, 120], grow: 1, speed: [0, 0], up: 0, ay: 0, drag: 0, color: '#ffd23f', alpha: 1, hdr: 2.2 },
  muzzle: { kd: KIND.muzzle, life: [0.1, 0.1], size: [100, 100], grow: 1, speed: [0, 0], up: 0, ay: 0, drag: 0, color: '#ffe9a8', alpha: 1, hdr: 2.6 },
};

export function createParticles(scene) {
  const sheet = getTrimSheet().texture;
  const IMM = 360; // immediate sprites per mesh per frame
  const MAXN = Math.max(...Object.values(V3().CAP || { high: 1500 }), 1500);
  const MAXS = Math.max(...Object.values(V3().SPLINTERS || { high: 160 }), 160);
  const pool = new Float32Array(MAXN * ST);
  let n = 0, cap = (V3().CAP || {}).medium || 800, capS = (V3().SPLINTERS || {}).medium || 90, rate = 1, trails = true;
  let dropped = 0, spawned = 0;
  const view = { on: false, cx: 0, cy: 0, hw: 0, hh: 0 };
  const amb = [0.8, 0.8, 0.8];
  let night = 0, tNow = 0;

  // ---- the two instanced quads ------------------------------------------------------------------------------------------------------------------------------------------------
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const makeMesh = (additive) => {
    const cnt = MAXN + IMM;
    const arr = new Float32Array(cnt * IN);
    const buf = new THREE.InstancedInterleavedBuffer(arr, IN, 1);
    buf.setUsage(THREE.DynamicDrawUsage);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('aPos', new THREE.InterleavedBufferAttribute(buf, 4, 0));
    g.setAttribute('aDir', new THREE.InterleavedBufferAttribute(buf, 4, 4));
    g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(buf, 4, 8));
    g.setAttribute('aTime', new THREE.InterleavedBufferAttribute(buf, 4, 12));
    g.instanceCount = 0;
    const mat = makeMaterial(sheet, additive ? 21 : 20, additive); // (the smoke ignores depth: a ship's bag and decks would swallow a column of it rising from a room; the fire and sparks are hidden by what stands in front)
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = additive ? 21 : 20; // (smoke first, then the fire over it; both after the water and the clouds)
    mesh.name = additive ? 'vfxAdd' : 'vfxAlpha';
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, g, buf, arr, scratch: new Float32Array(IMM * IN), nImm: 0 };
  };
  const A = makeMesh(false), B = makeMesh(true); // alpha, additive

  // ---- the splinters (small lit boxes, one instanced mesh) -------------------------------------------------------------------------------------------------------------------------
  const SS = 22; // x y z vx vy vz age life sx sy sz qx qy qz qw ax ay az spin r g b -
  const sp = new Float32Array(MAXS * SS);
  let ns = 0;
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = rimify(new THREE.MeshToonMaterial({ gradientMap, color: '#ffffff' }));
  boxMat.fog = true;
  const boxes = new THREE.InstancedMesh(boxGeo, boxMat, MAXS);
  boxes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  boxes.frustumCulled = false; boxes.count = 0; boxes.castShadow = false; boxes.receiveShadow = false; boxes.name = 'vfxSplinters';
  boxes.setColorAt(0, new THREE.Color('#ffffff'));
  boxes.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(boxes);
  const _M = new THREE.Matrix4(), _q0 = new THREE.Quaternion(), _q1 = new THREE.Quaternion(), _ax = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _col = new THREE.Color();

  const P = { KIND, rnd, rgbOf, ok: true, mesh: { alpha: A.mesh, additive: B.mesh, boxes } };

  // ---- gating -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const inView = (x, y, m = 1.2) => !view.on || (Math.abs(x - view.cx) < view.hw * m + 200 && Math.abs(y - view.cy) < view.hh * m + 200);
  P.setView = (cx, cy, hw, hh) => { if (cx == null) view.on = false; else if (fin(cx) && fin(cy) && fin(hw) && fin(hh)) { view.on = true; view.cx = cx; view.cy = cy; view.hw = hw; view.hh = hh; } };
  P.inView = inView;
  P.setTier = (tier) => {
    const name = (tier && tier.name) || 'medium', C = V3();
    cap = clamp((C.CAP && C.CAP[name]) || 800, 50, MAXN);
    capS = clamp(C.SPLINTERS && C.SPLINTERS[name] != null ? C.SPLINTERS[name] : 90, 0, MAXS);
    rate = (C.RATE && C.RATE[name]) || 1;
    trails = name !== 'low';
    P.rate = rate; P.trails = trails; P.tier = name;
    if (n > cap) n = cap;
    if (ns > capS) ns = capS;
  };
  P.rate = rate; P.trails = trails; P.tier = 'medium';
  // the smoke takes the light of the place: the hemisphere's colours, darker at night, with a little warmth from the key light
  P.setAmbient = (sky, ground, strength, nightK) => {
    _c.copy(sky).lerp(ground, 0.4);
    const k = clamp(0.3 + 0.5 * strength, 0.3, 1.05);
    amb[0] = _c.r * k + 0.05; amb[1] = _c.g * k + 0.05; amb[2] = _c.b * k + 0.05;
    night = clamp(nightK || 0, 0, 1);
  };
  P.night = () => night;

  // ---- spawning ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // the generic one: opts as in the header; numbers are used as given, [min, max] pairs are picked from
  const spawn = (kindName, x, y, z, o = {}) => {
    const K = KINDS[kindName];
    if (!K || !fin(x) || !fin(y)) return false;
    if (!inView(x, y) && !o.force) return false;
    const kd = K.kd;
    if (n >= cap) { dropped++; return false; }
    if ((kd === KIND.smoke || kd === KIND.steam) && n >= cap * 0.82) { dropped++; return false; }
    if (kd === KIND.spark && n >= cap * 0.94) { dropped++; return false; }
    const i = n * ST;
    const life = o.life != null ? pick(o.life) : pick(K.life);
    const size = o.size != null ? pick(o.size) : pick(K.size);
    const grow = o.size1 != null ? o.size1 : K.grow;
    const speed = o.speed != null ? pick(o.speed) : pick(K.speed);
    const dir = o.dir != null ? o.dir : Math.PI / 2, spread = o.spread != null ? o.spread : Math.PI;
    const ang = dir + (rnd() * 2 - 1) * spread;
    const up = (o.up != null ? pick(o.up) : pick(K.up)) || 0;
    const area = o.area || 0;
    pool[i + X] = x + (area ? (rnd() * 2 - 1) * area : 0);
    pool[i + Y] = y + (area ? (rnd() * 2 - 1) * area * 0.6 : 0);
    pool[i + Z] = (fin(z) ? z : 0) + (o.zs ? (rnd() * 2 - 1) * o.zs : 0);
    pool[i + VX] = Math.cos(ang) * speed + (o.vx || 0);
    pool[i + VY] = Math.sin(ang) * speed + up + (o.vy || 0);
    pool[i + VZ] = (o.vz || 0) + (o.zv ? (rnd() * 2 - 1) * o.zv : 0);
    pool[i + AGE] = 0; pool[i + LIFE] = Math.max(0.02, life);
    pool[i + S0] = size; pool[i + S1] = size * (kd === KIND.smoke || kd === KIND.steam ? grow : kd === KIND.fire ? grow : kd === KIND.flash || kd === KIND.ring || kd === KIND.muzzle ? grow : grow);
    pool[i + AY] = o.ay != null ? o.ay : K.ay;
    pool[i + DRAG] = o.drag != null ? o.drag : K.drag;
    pool[i + KD] = kd; pool[i + SEED] = rnd();
    const c = rgbOf(pick(o.color || K.color));
    pool[i + CR] = c[0]; pool[i + CG] = c[1]; pool[i + CB] = c[2];
    pool[i + A0] = o.alpha != null ? o.alpha : K.alpha;
    pool[i + STRETCH] = o.stretch != null ? o.stretch : K.stretch || 0;
    pool[i + WARM] = o.warm != null ? o.warm : K.warm || 0;
    pool[i + HDR] = o.hdr != null ? o.hdr : K.hdr;
    pool[i + ROT] = o.rot != null ? o.rot : kd === KIND.muzzle ? (o.angle || 0) : kd === KIND.smoke || kd === KIND.steam ? rr(0, 6.283) : 0;
    n++; spawned++;
    return true;
  };
  P.spawn = spawn;
  P.burst = (kindName, x, y, z, count, o = {}) => {
    const k = Math.round(count * (o.noRate ? 1 : rate));
    let made = 0;
    for (let i = 0; i < k; i++) { if (!spawn(kindName, x, y, z, o)) { if (n >= cap) break; } else made++; }
    return made;
  };
  // a flash and a ring are single things with a colour
  P.flash = (x, y, z, size, color, o = {}) => spawn('flash', x, y, z, { size, color: color || '#ffe2a0', ...o });
  P.ring = (x, y, z, size, color, life, o = {}) => spawn('ring', x, y, z, { size: size * 0.35, size1: 2.9, life: life || 0.32, color: color || '#ffd23f', ...o });
  P.muzzle = (x, y, z, angle, size, color, o = {}) => spawn('muzzle', x, y, z, { size: size || 100, rot: angle || 0, color: color || '#ffe9a8', ...o });
  // THE HIT-STOP FLASH (a brief bright quad over a big impact; one or two frames; the picture does not shake)
  P.hitFlash = (x, y, z, size) => spawn('flash', x, y, z + 40, { size: clamp(size, 120, 900), size1: 1.1, life: 0.055, color: '#fff6dc', hdr: 4.2, alpha: 1, force: true });

  // an explosion prefab. size ~ 1 is a shell hit, 2-3 a bomb or a crashed plane
  P.explosion = (x, y, z, size = 1, o = {}) => {
    const s = clamp(size, 0.3, 6);
    P.flash(x, y, z + 30, 190 * s, '#ffb860', { hdr: 1.5, alpha: 0.8 });
    P.burst('ball', x, y, z, Math.round(3 + 2.5 * s), { size: [70 * s, 120 * s], size1: 1.9, life: [0.3, 0.52], speed: [0, 90 * s], up: [0, 40], area: 34 * s, drag: 2 }); // (round toon fireballs)
    P.burst('fire', x, y, z, Math.round(2 + 2 * s), { size: [60 * s, 100 * s], life: [0.4, 0.7], speed: [10, 80], up: [60, 160], area: 28 * s, drag: 1.2 }); // (a few tongues rising out of it)
    P.burst('spark', x, y, z + 10, Math.round(10 + 10 * s), { speed: [200, 560 * Math.sqrt(s)], life: [0.35, 0.85], size: [5, 9] });
    P.burst('smoke', x, y, z - 10, Math.round(3 + 3 * s), { size: [70 * s, 120 * s], life: [1.4, 2.6], color: o.smoke || '#3e3a3c', warm: 0.9, speed: [10, 70 * s], up: [30, 80] });
    P.ring(x, y, z + 20, 180 * s, '#ffd23f');
    if (o.wood) P.splinters(x, y, z, Math.round(6 + 6 * s), { kind: 'wood', speed: [180, 480], up: 160 });
    if (s >= 1.6) P.hitFlash(x, y, z, 260 * s);
  };

  // ---- splinters --------------------------------------------------------------------------------------------------------------------------------------------------------------
  const WOOD = ['#d9b98a', '#b98a56', '#8f6338', '#e8d2a6', '#6e4a2a'], IRON = ['#6d7378', '#3a3032', '#8a8f94'], ROCK = ['#8b7a64', '#6c5f50', '#a39580'];
  P.splinters = (x, y, z, count, o = {}) => {
    if (capS <= 0 || !fin(x) || !fin(y) || !inView(x, y)) return 0;
    const pal = o.kind === 'iron' ? IRON : o.kind === 'rock' ? ROCK : (V3().WOOD || WOOD);
    let made = 0;
    const k = Math.round(count * rate);
    for (let j = 0; j < k && ns < capS; j++) {
      const i = ns * SS;
      const ang = (o.dir != null ? o.dir : Math.PI / 2) + (rnd() * 2 - 1) * (o.spread != null ? o.spread : Math.PI);
      const speed = pick(o.speed || [140, 420]);
      sp[i] = x + (rnd() * 2 - 1) * (o.area || 12); sp[i + 1] = y + (rnd() * 2 - 1) * (o.area || 12) * 0.6; sp[i + 2] = (fin(z) ? z : 0) + (rnd() * 2 - 1) * 20;
      sp[i + 3] = Math.cos(ang) * speed + (o.vx || 0); sp[i + 4] = Math.sin(ang) * speed + pick(o.up != null ? o.up : [40, 160]) + (o.vy || 0); sp[i + 5] = (rnd() * 2 - 1) * 90;
      sp[i + 6] = 0; sp[i + 7] = rr(1.0, 1.9);
      const sz = (o.size != null ? pick(o.size) : rr(7, 16)), plank = o.kind !== 'iron' && o.kind !== 'rock' && rnd() < 0.7;
      sp[i + 8] = plank ? sz * rr(2.2, 3.6) : sz; sp[i + 9] = plank ? sz * 0.45 : sz * 0.8; sp[i + 10] = plank ? sz * 0.7 : sz * 0.8;
      _q0.setFromAxisAngle(_ax.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), rr(0, 6.28));
      sp[i + 11] = _q0.x; sp[i + 12] = _q0.y; sp[i + 13] = _q0.z; sp[i + 14] = _q0.w;
      _ax.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5 + 0.3).normalize();
      sp[i + 15] = _ax.x; sp[i + 16] = _ax.y; sp[i + 17] = _ax.z; sp[i + 18] = (rnd() < 0.5 ? -1 : 1) * rr(4, 12); // a constant spin
      const c = rgbOf(pal[(rnd() * pal.length) | 0]);
      sp[i + 19] = c[0]; sp[i + 20] = c[1]; sp[i + 21] = c[2];
      ns++; made++;
    }
    return made;
  };

  // ---- immediate sprites: one frame only (a flame that sits on a deck, a shell's tracer, the lightning). Written to a scratch list, drawn this frame, gone ----------------------------------
  // sprite(kindName, x, y, z, size, r, g, b, a, o): o = { frame, dx, dy (direction; for a streak the world direction), len (> 0 makes it a streak of that length), seed }
  P.begin = () => { A.nImm = 0; B.nImm = 0; };
  P.sprite = (kindName, x, y, z, size, r, g, b, a, o) => {
    const K = KINDS[kindName];
    if (!K || !fin(x) || !fin(y) || !fin(size) || size <= 0) return false;
    if (!inView(x, y, 1.3)) return false;
    const T = ADDITIVE[K.kd] ? B : A;
    if (T.nImm >= IMM) return false;
    const w = T.scratch, j = T.nImm++ * IN, q = o || {};
    w[j] = x; w[j + 1] = y; w[j + 2] = fin(z) ? z : 0; w[j + 3] = size;
    w[j + 4] = q.dx != null ? q.dx : 1; w[j + 5] = q.dy != null ? q.dy : 0; w[j + 6] = q.len || 0; w[j + 7] = K.kd;
    w[j + 8] = r; w[j + 9] = g; w[j + 10] = b; w[j + 11] = a;
    w[j + 12] = q.frame || 0; w[j + 13] = q.seed || 0; w[j + 14] = 0; w[j + 15] = 0;
    return true;
  };

  // ---- the frame: simulate the pool, write the instance buffers, upload -------------------------------------------------------------------------------------------------
  P.update = (dt, t) => {
    tNow = t;
    dt = clamp(dt, 0, 0.05);
    let na = 0, nb = 0;
    const wa = A.arr, wb = B.arr;
    const step8 = Math.floor(t * 8);
    for (let k = 0; k < n; k++) {
      const i = k * ST;
      const age = (pool[i + AGE] += dt), life = pool[i + LIFE];
      if (age >= life) { // gone: the last particle takes this place
        n--;
        if (k < n) pool.copyWithin(i, n * ST, n * ST + ST);
        k--;
        continue;
      }
      const kd = pool[i + KD], u = age / life;
      let vx = pool[i + VX], vy = pool[i + VY];
      vy += pool[i + AY] * dt;
      const drag = pool[i + DRAG];
      if (drag > 0) {
        const f = 1 / (1 + drag * dt);
        vx *= f;
        if (kd === KIND.spark || kd === KIND.drop) { vy *= f; pool[i + VZ] *= f; } // (smoke, steam and fire only slow sideways: they rise at a steady speed)
      }
      pool[i + VX] = vx; pool[i + VY] = vy;
      const x = (pool[i + X] += vx * dt), y = (pool[i + Y] += vy * dt), z = (pool[i + Z] += pool[i + VZ] * dt);
      const s0 = pool[i + S0], s1 = pool[i + S1], a0 = pool[i + A0], hdr = pool[i + HDR], seed = pool[i + SEED];
      let size = s0 + (s1 - s0) * u, a = a0, r = pool[i + CR], g = pool[i + CG], b = pool[i + CB], dx = 1, dy = 0, len = 0, frame = 0;
      if (kd === KIND.fire) {
        a = a0 * (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45);
        frame = (step8 + ((seed * 4) | 0)) & 3;
        const h = hdr * (1 - 0.25 * u);
        r *= h; g *= h * (1 - 0.3 * u); b *= h * (1 - 0.6 * u);
      } else if (kd === KIND.smoke || kd === KIND.steam) {
        a = a0 * Math.min(1, u / 0.1) * (u < 0.5 ? 1 : (1 - u) / 0.5);
        const w = pool[i + WARM] * (1 - u) * (1 - u);
        r = r * amb[0] * (1 - w) + 1.5 * w; g = g * amb[1] * (1 - w) + 0.6 * w; b = b * amb[2] * (1 - w) + 0.18 * w; // (fresh smoke is lit orange by the fire it came from)
        if (kd === KIND.steam) { r *= 1.1; g *= 1.1; b *= 1.1; }
        const ro = pool[i + ROT] + seed * 0; dx = Math.cos(ro); dy = Math.sin(ro);
      } else if (kd === KIND.spark) {
        const sp2 = Math.hypot(vx, vy), st = pool[i + STRETCH];
        a = a0 * (1 - u * u);
        const h = hdr * (1 - 0.4 * u);
        r *= h; g *= h * (1 - 0.3 * u); b *= h * (1 - 0.7 * u);
        if (st > 0 && sp2 > 1) { dx = vx / sp2; dy = vy / sp2; len = size * 2 + sp2 * st; size = size * (1 - 0.4 * u); }
        else { size = s0 * (1 - 0.55 * u); a = u < 0.7 ? a0 : a0 * (1 - u) / 0.3; }
      } else if (kd === KIND.muzzle) {
        frame = u < 0.5 ? 0 : 1; a = a0 * (1 - u * u * 0.5);
        r *= hdr; g *= hdr; b *= hdr;
        const ro = pool[i + ROT]; dx = Math.cos(ro); dy = Math.sin(ro);
      } else if (kd === KIND.ring) {
        const uq = clamp(Math.floor(age * 8) / 8 / life, 0, 1); // stepped at 8 fps: a ring that grows in a few clear steps
        size = s0 + (s1 - s0) * uq; a = a0 * (1 - 0.8 * uq);
        r *= hdr; g *= hdr; b *= hdr;
      } else if (kd === KIND.ball) {
        size = s0 + (s1 - s0) * Math.sqrt(u); a = a0 * (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45); // (it swells fast, then slows)
        r *= hdr; g *= hdr; b *= hdr;
      } else if (kd === KIND.flash) {
        a = a0 * (1 - u) * (1 - u * 0.5);
        r *= hdr; g *= hdr; b *= hdr;
      } else { // drop
        a = u < 0.8 ? a0 : a0 * (1 - u) / 0.2;
        r *= amb[0] * 1.15; g *= amb[1] * 1.15; b *= amb[2] * 1.15;
      }
      if (ADDITIVE[kd]) { // (a night makes the glows stronger, a bright day pales them a little)
        if (nb >= MAXN) continue;
        const o = nb++ * IN;
        wb[o] = x; wb[o + 1] = y; wb[o + 2] = z; wb[o + 3] = size; wb[o + 4] = dx; wb[o + 5] = dy; wb[o + 6] = len; wb[o + 7] = kd;
        wb[o + 8] = r; wb[o + 9] = g; wb[o + 10] = b; wb[o + 11] = a; wb[o + 12] = frame; wb[o + 13] = seed; wb[o + 14] = 0; wb[o + 15] = 0;
      } else {
        if (na >= MAXN) continue;
        const o = na++ * IN;
        wa[o] = x; wa[o + 1] = y; wa[o + 2] = z; wa[o + 3] = size; wa[o + 4] = dx; wa[o + 5] = dy; wa[o + 6] = len; wa[o + 7] = kd;
        wa[o + 8] = r; wa[o + 9] = g; wa[o + 10] = b; wa[o + 11] = a; wa[o + 12] = frame; wa[o + 13] = seed; wa[o + 14] = 0; wa[o + 15] = 0;
      }
    }
    // the immediate sprites go after the pool (the same arrays)
    const flush = (T, base) => {
      if (T.nImm > 0) { T.arr.set(T.scratch.subarray(0, T.nImm * IN), base * IN); }
      const total = base + T.nImm;
      T.g.instanceCount = total;
      T.mesh.visible = total > 0;
      if (total > 0) {
        T.buf.clearUpdateRanges && T.buf.clearUpdateRanges();
        if (T.buf.addUpdateRange) T.buf.addUpdateRange(0, total * IN);
        T.buf.needsUpdate = true;
      }
      return total;
    };
    P.drawn = flush(A, na) + flush(B, nb);
    // splinters
    let m = 0;
    for (let k = 0; k < ns; k++) {
      const i = k * SS;
      const age = (sp[i + 6] += dt), life = sp[i + 7];
      if (age >= life) { ns--; if (k < ns) sp.copyWithin(i, ns * SS, ns * SS + SS); k--; continue; }
      sp[i + 4] -= 1100 * dt; // gravity
      sp[i] += sp[i + 3] * dt; sp[i + 1] += sp[i + 4] * dt; sp[i + 2] += sp[i + 5] * dt;
      _q0.set(sp[i + 11], sp[i + 12], sp[i + 13], sp[i + 14]);
      _q1.setFromAxisAngle(_ax.set(sp[i + 15], sp[i + 16], sp[i + 17]), sp[i + 18] * age); // the constant spin
      _q1.multiply(_q0);
      const u = age / life, k2 = u < 0.75 ? 1 : (1 - u) / 0.25;
      _M.compose(_p.set(sp[i], sp[i + 1], sp[i + 2]), _q1, _s.set(sp[i + 8] * k2, sp[i + 9] * k2, sp[i + 10] * k2));
      boxes.setMatrixAt(m, _M);
      boxes.setColorAt(m, _col.setRGB(sp[i + 19], sp[i + 20], sp[i + 21]));
      m++;
    }
    boxes.count = m;
    boxes.visible = m > 0;
    if (m > 0) { boxes.instanceMatrix.needsUpdate = true; boxes.instanceColor.needsUpdate = true; }
    P.splinterCount = m;
  };

  P.stats = () => ({ pool: n, drawn: P.drawn || 0, splinters: P.splinterCount || 0, cap, capS, dropped, spawned, calls: (A.mesh.visible ? 1 : 0) + (B.mesh.visible ? 1 : 0) + (boxes.visible ? 1 : 0), tier: P.tier });
  P.clear = () => { n = 0; ns = 0; A.nImm = B.nImm = 0; A.g.instanceCount = B.g.instanceCount = 0; boxes.count = 0; A.mesh.visible = B.mesh.visible = boxes.visible = false; };
  P.count = () => n;
  P.dispose = () => { for (const T of [A, B]) { scene.remove(T.mesh); T.g.dispose(); T.mesh.material.dispose(); } scene.remove(boxes); boxes.dispose(); boxGeo.dispose(); boxMat.dispose(); };
  P.setTier({ name: 'medium' });
  void tNow;
  return P;
}
