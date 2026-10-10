// WP10: SEARCHLIGHTS. One soft volumetric beam per lamp, a light pool where it lands, and the warm rim of everything the sim calls LIT. (3D.md section 15; every number is in config.LOOK3D.BEAM / POOL / LIT.)
//
// THE BEAM is one camera-facing ribbon along the lamp's axis (the camera is nearly orthographic and never rolls, so a flat card along the beam reads as a volume from every side). A small shader draws it: a
// radial soft edge with a brighter core, a fall-off along the length (fading out before the end, or less when the beam lands on something), and DUST: a static noise picture that slides along the beam at a
// CONSTANT speed (no flicker, no sine) with a few sparse bright motes in it. The beams are not drawn in the main pass. post.js's BeamPass draws them (this file's `scene`) onto a picture of their own at
// BEAM RES x the screen, with the scene's DEPTH TEXTURE as an input: where the beam meets geometry it dissolves over CFG.SOFT world units (the hull, the rock, the cave picture) instead of cutting through it, and
// geometry in front of the beam hides it. That picture is added to the scene before the bloom. With no post (?look=nopost, or the composer failed) the ribbons go into the main scene, depth-tested, with no fade.
//
// THE POOL: where the beam ends on something (the cave picture, rock, the sea, another ship) a soft additive disc lies on it, so the lit spot is plain. The end is found once a frame by a few cheap ray tests
// (the sim's own range and its rock test `inRock`, refined to 10 px; the cave picture's plane; the sea plane; the boxes of the other ships). It is the same range the sim lights targets over.
//
// LIT TARGETS: the sim's `state.litTargets` (what a manned beam holds: the guns hit it harder) go to a small uniform array that the toon shader reads (style.js rimify): a warm rim and a little lift on
// everything inside the circle, whoever draws it (planes, bats, mines, gunships, the creature's parts). The rest of a dark sky stays a dim silhouette: the lights decide, exactly the rule of the 2D darkness.
//
// Nothing here changes the game. It never throws (the view calls it inside a try/catch, and a lamp that cannot be read is simply not drawn).
import { THREE, look, fx } from './style.js';
import { config } from '../../config.js';
import { inRock } from '../host/course.js';
import { Z_BACK, Z_FRONT_CAVE, Z_FRONT_OPEN } from './terrain.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// ---- the dust: a tileable noise picture (R = soft cloud, G = sparse flecks), painted once from a seeded generator -------------------------------------------------------------------------
function dustTexture() {
  const N = 128, d = new Uint8Array(N * N * 4);
  let s = 0x2545f491;
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x7f4a7c15) | 0; return ((s >>> 8) & 0xffff) / 65535; };
  const lattice = (n) => { const a = new Float32Array(n * n); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const value = (a, n, x, y) => { // periodic value noise, x and y in 0..1 (the picture tiles)
    const fx_ = x * n, fy_ = y * n, ix = Math.floor(fx_), iy = Math.floor(fy_), tx = fx_ - ix, ty = fy_ - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => a[((j % n) + n) % n * n + (((i % n) + n) % n)];
    return lerp(lerp(at(ix, iy), at(ix + 1, iy), sx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), sx), sy);
  };
  const A = lattice(6), B = lattice(14), C = lattice(32);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const cloud = clamp(0.5 + (value(A, 6, u, v) * 0.55 + value(B, 14, u, v) * 0.45 - 0.5) * 1.8, 0, 1);
    const fleck = value(C, 32, u, v);
    const i = (y * N + x) * 4;
    d[i] = Math.round(cloud * 255); d[i + 1] = Math.round(clamp((fleck - 0.6) * 3.5, 0, 1) * 255); // (only the top of the noise: sparse flecks) d[i + 2] = 0; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// ---- the pool: a soft disc painted once ----------------------------------------------------------------------------------------------------------------------------------------------------
function poolTexture() {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d'), r = N / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.32, 'rgba(255,255,255,0.78)'); grad.addColorStop(0.62, 'rgba(255,255,255,0.34)'); grad.addColorStop(0.86, 'rgba(255,255,255,0.1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const BEAM_VERT = /* glsl */`
  uniform vec3 uO; uniform vec3 uA; uniform float uLen; uniform float uTan; uniform float uW0;
  varying vec2 vUv; varying float vViewZ;
  void main() {
    float u = position.x, s = position.y;
    vec3 c = uO + uA * ( u * uLen );
    vec3 side = cross( uA, cameraPosition - c );
    side = side / max( length( side ), 1e-3 );
    vec3 wp = c + side * ( s * ( uW0 + uTan * u * uLen ) );
    vec4 mv = viewMatrix * vec4( wp, 1.0 );
    vUv = vec2( u, s );
    vViewZ = - mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const BEAM_FRAG = /* glsl */`
  #include <packing>
  uniform sampler2D uNoise; uniform sampler2D uDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform float uUseDepth;
  uniform vec3 uColor; uniform float uAlpha; uniform float uScroll; uniform float uFade; uniform float uSoft; uniform float uSeed; uniform float uLen; uniform float uDust; uniform float uMotes;
  varying vec2 vUv; varying float vViewZ;
  void main() {
    float u = vUv.x, s = vUv.y;
    float edge = max( 1.0 - s * s, 0.0 );
    float prof = pow( edge, 1.35 );                     // a soft shoulder, no hard rim
    float core = pow( edge, 4.5 );                      // a brighter, narrower core
    float fadeEnd = 1.0 - smoothstep( uFade, 1.0, u );  // dies out before the end (less when it lands on something: the pool takes over)
    float fadeStart = smoothstep( 0.0, 0.045, u );
    float fall = mix( 1.0, 0.32, u );
    float body = ( prof * 0.42 + core * 0.8 ) * fall * fadeEnd * fadeStart;
    // the dust: fixed in the beam's own length, sliding at a constant speed (uScroll = distance * speed, set by the view)
    vec2 nuv = vec2( u * uLen * 0.0006 - uScroll, s * 1.1 + uSeed );   // stretched along the beam: faint streaks, like rays through dusty air
    vec4 n1 = texture2D( uNoise, nuv );
    vec4 n2 = texture2D( uNoise, nuv * vec2( 2.6, 1.9 ) + vec2( 0.31, 0.17 ) );
    float dust = 1.0 + uDust * ( n1.r - 0.5 ) * 1.6;
    float mote = smoothstep( 0.12, 0.7, n2.g ) * uMotes * prof * fadeEnd * fadeStart;
    float a = body * dust + mote * 0.2;
    if ( uUseDepth > 0.5 ) {                            // dissolve where the beam meets something; hidden behind what is in front of it
      float zs = - perspectiveDepthToViewZ( texture2D( uDepth, gl_FragCoord.xy / uRes ).x, uNear, uFar );
      a *= smoothstep( 0.0, mix( 28.0, uSoft, smoothstep( 0.0, 0.2, u ) ), zs - vViewZ );
    }
    gl_FragColor = vec4( uColor * ( a * uAlpha ), 1.0 );
  }
`;

export function createBeams({ scene, post, world, state, models }) {
  const cfg = () => (config.LOOK3D && config.LOOK3D.BEAM) || {};
  const poolCfg = () => cfg().POOL || {};
  const litCfg = () => (config.LOOK3D && config.LOOK3D.LIT) || {};
  const noise = dustTexture();
  const poolTex = poolTexture();
  const geo = new THREE.BufferGeometry(); // (u along the beam in x, s across in y: the vertex shader makes the ribbon)
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const poolGeo = new THREE.PlaneGeometry(2, 2);
  const beamScene = new THREE.Scene(); // (what BeamPass draws: no background, no lights, no fog)
  const shared = { uNoise: { value: noise }, uDepth: { value: null }, uRes: { value: new THREE.Vector2(2, 2) }, uNear: { value: 60 }, uFar: { value: 70000 }, uUseDepth: { value: 0 } };
  const bp = post && post.beamPass;
  if (bp) { shared.uDepth = bp.shared.uDepth; shared.uRes = bp.shared.uRes; shared.uNear = bp.shared.uNear; shared.uFar = bp.shared.uFar; } // (the pass fills these every frame)
  if (bp) bp.scene = beamScene;
  const group = new THREE.Group(); // the ribbons (in beamScene, or in the main scene when there is no composer)
  group.frustumCulled = false;
  beamScene.add(group);
  let inMain = false;
  const lamps = new Map(); // "shipId:lampName" -> { beam, pool, seen }
  const stats = { lamps: 0, pools: 0, lit: 0, hit: '', len: 0, ms: 0 };

  const mkLamp = (key) => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      uniforms: {
        ...shared, uO: { value: new THREE.Vector3() }, uA: { value: new THREE.Vector3(1, 0, 0) }, uLen: { value: 1000 }, uTan: { value: 0.25 }, uW0: { value: 12 },
        uColor: { value: new THREE.Color('#fff0cc') }, uAlpha: { value: 0 }, uScroll: { value: 0 }, uFade: { value: 0.5 }, uSoft: { value: 150 }, uSeed: { value: hashStr(key) }, uDust: { value: 0.45 }, uMotes: { value: 0.8 },
      },
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.frustumCulled = false;
    beam.visible = false;
    group.add(beam);
    const pm = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide, toneMapped: false });
    const pool = new THREE.Mesh(poolGeo, pm);
    pool.frustumCulled = false;
    pool.renderOrder = 6;
    pool.visible = false;
    scene.add(pool);
    return { beam, pool, seen: 0 };
  };

  // which parent the ribbons are in: the beam scene (BeamPass, depth fade) or the main scene (no composer)
  const setMode = (main) => {
    if (main === inMain) return;
    inMain = main;
    (main ? scene : beamScene).add(group);
    for (const l of lamps.values()) { l.beam.material.depthTest = main; l.beam.renderOrder = main ? 5 : 0; }
    shared.uUseDepth.value = main ? 0 : 1;
  };

  // ---- the ray tests (all once a frame per lamp) ---------------------------------------------------------------------------------------------------------------------------------------------
  const _ci = new THREE.Matrix4(), _cv = new THREE.Vector3(), _cd = new THREE.Vector3();
  const _O = new THREE.Vector3(), _T = new THREE.Vector3(), _A = new THREE.Vector3(), _lo = new THREE.Vector3(), _ld = new THREE.Vector3(), _inv = new THREE.Matrix4(), _E = new THREE.Vector3();
  // the first hit of the ray O + t A against the boxes of the OTHER ships (a box in the ship's own frame), or Infinity
  const shipHit = (own, tMax) => {
    let best = Infinity;
    for (const [id, e] of models) {
      if (id === own) continue;
      const m = e.model, b = m.layout && m.layout.bounds;
      if (!b || !m.content) continue;
      m.content.updateMatrixWorld(true);
      _inv.copy(m.content.matrixWorld).invert();
      _lo.copy(_O).applyMatrix4(_inv);
      _ld.copy(_A).transformDirection(_inv);
      const x0 = m.X(b.x0), x1 = m.X(b.x1), y0 = m.Y(b.y1), y1 = m.Y(b.y0), zh = 120;
      let t0 = 0, t1 = tMax;
      for (const [o, d, lo, hi] of [[_lo.x, _ld.x, x0, x1], [_lo.y, _ld.y, y0, y1], [_lo.z, _ld.z, -zh, zh]]) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t1 = -1; break; } continue; }
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) { const q = a; a = c; c = q; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 > 40 && t0 < best) best = t0;
    }
    return best;
  };

  // c = { t, dt, night, tier, state, sea (the sea level in game y or null), cave } once a frame, after the ships are placed
  const update = (c) => {
    const t0 = performance.now();
    const envBeam = (config.LOOK3D && config.LOOK3D[c.env] && config.LOOK3D[c.env].beam) || null; // (an environment can tint / strengthen its beams: LOOK3D.<env>.beam = { color, alpha })
    const B = envBeam ? { ...cfg(), ...Object.fromEntries(Object.entries(envBeam).map(([k, v]) => [k.toUpperCase(), v])) } : cfg(), P = poolCfg();
    const usePass = !!(bp && look.post && post.enabled);
    const on = look.beam && !c.noBeam;
    setMode(!usePass);
    if (bp) {
      bp.scale = (B.RES && B.RES[c.tier.name]) || 1;
      bp.enabled = false;
    }
    const night = clamp(c.night || 0, 0, 1), nightK = sstep(0.05, 0.5, night);
    const k = lerp(fin(B.DAY, 0.2), 1, nightK);
    let nBeam = 0, nPool = 0, nCone = 0;
    const cam = c.camera, camInv = _ci.copy(cam.matrixWorld).invert(); // (the cones are handed to the toon shader in view space)
    _cv.set(0, 0, 0).applyMatrix4(camInv);
    fx.uBeamD.value = Math.max(100, -_cv.z); // (the camera's distance to the gameplay plane)
    fx.uBeamColor.value.set(B.LIGHT_COLOR || '#ffe9b8');
    for (const l of lamps.values()) l.seen = 0;
    const ships = state.ships || [];
    if (on) {
      for (const [id, e] of models) {
        const sh = ships.find((q) => q.id === id), model = e.model;
        if (!sh || sh.ai) continue;
        const st = sh.ctx || state, live = st.searchlights || [];
        model.dyn.lamps.forEach((lp, i) => {
          const sl = live.find((q) => q.n === lp.name) || live[i];
          if (!sl) return;
          const key = id + ':' + lp.name;
          let rec = lamps.get(key);
          if (!rec) { rec = mkLamp(key); rec.beam.material.depthTest = inMain; lamps.set(key, rec); }
          rec.seen = 1;
          const pw = clamp(fin(sl.power, 0.28), 0, 1);
          const aBeam = fin(B.ALPHA, 0.55) * k * pw * (sl.manned ? 1 : fin(B.UNMANNED, 0.5));
          if (aBeam < 0.006) { rec.beam.visible = false; rec.pool.visible = false; return; }
          lp.pivot.updateMatrixWorld(true);
          lp.spot.getWorldPosition(_O);
          lp.target.getWorldPosition(_T);
          _A.subVectors(_T, _O);
          if (_A.lengthSq() < 1e-6) return;
          _A.normalize();
          const half = clamp(fin(sl.half, 0.24), 0.05, 0.6), tan = Math.tan(half * fin(B.WIDTH, 1.12));
          const dxy = Math.max(0.3, Math.hypot(_A.x, _A.y));
          const reach = clamp(fin(sl.reach, 1200), 60, 6000);
          let len = clamp(reach / dxy, 140, fin(B.LEN_MAX, 3600)), hit = '';
          // rock: the sim's own range already stopped at rock; look again in 10 px steps just round it to find the edge itself
          const map = state.course && state.course.map;
          if (map) {
            const d0 = Math.max(0, reach - 70), d1 = reach + 50, ux = _A.x / dxy, uy = -_A.y / dxy;
            for (let d = d0; d <= d1; d += 10) {
              if (inRock(state, _O.x + ux * d, -_O.y + uy * d)) { len = clamp((d - 4) / dxy, 120, len); hit = 'rock'; break; }
            }
          }
          if (c.cave && _A.z < -0.05) { const tb = (_O.z - Z_BACK) / -_A.z; if (tb > 60 && tb < len) { len = tb; hit = 'back'; } }
          if (c.sea != null && _A.y < -0.02) { const ty = (_O.y - -c.sea) / -_A.y; stats.ty = Math.round(ty); stats.sea = Math.round(c.sea); stats.oy = Math.round(_O.y); stats.ay = +_A.y.toFixed(2); if (ty > 60 && ty < len) { len = ty; hit = 'sea'; } }
          const ts = shipHit(id, len);
          if (ts < len) { len = ts; hit = 'ship'; }
          const mat = rec.beam.material, u = mat.uniforms;
          u.uO.value.copy(_O); u.uA.value.copy(_A); u.uLen.value = len; u.uTan.value = tan; u.uW0.value = 10;
          u.uColor.value.set(B.COLOR || '#fff0cc');
          u.uAlpha.value = aBeam;
          u.uFade.value = hit ? 0.82 : fin(B.FADE, 0.5);
          u.uSoft.value = fin(B.SOFT, 150);
          u.uDust.value = fin(B.DUST, 0.45); u.uMotes.value = fin(B.MOTES, 0.8);
          u.uScroll.value = ((c.t * fin(B.SCROLL, 46)) / 1667) % 64; // (a constant speed along the beam: world units a second / the noise's 1667-unit period)
          rec.beam.visible = true;
          nBeam++;
          if (nCone < 4) { // the cone that lights things (style.js, in the gameplay plane: where the sim's own cone is)
            _cv.copy(_O).applyMatrix4(camInv);
            _cd.copy(_A).transformDirection(camInv);
            const dl = Math.hypot(_cd.x, _cd.y) || 1;
            fx.uBeamA.value[nCone].set(_cv.x, _cv.y, _cd.x / dl, _cd.y / dl);
            fx.uBeamB.value[nCone].set(Math.tan(half * 1.04), len * dxy, fin(B.LIGHT, 0.9) * k * pw * (sl.manned ? 1 : fin(B.UNMANNED, 0.5)), 0);
            nCone++;
          }
          // the pool
          const pv = rec.pool;
          if (hit && pw > 0.2) {
            const across = clamp(tan * len * fin(P.SCALE, 0.9), fin(P.MIN, 80), 760);
            _E.copy(_A).multiplyScalar(len).add(_O);
            const pm = pv.material;
            pm.color.set(P.COLOR || '#ffe6b0').multiplyScalar(fin(P.HDR, 1.3));
            pm.opacity = clamp(fin(P.ALPHA, 0.9) * k * pw, 0, 1);
            if (hit === 'sea') { // lies flat on the water, stretched along the beam (seen from the side it is a thin ellipse)
              pv.rotation.order = 'YXZ';
              pv.rotation.set(-Math.PI / 2, Math.atan2(-_A.z, _A.x), 0);
              pv.position.set(_E.x, _E.y + 3, _E.z);
              pv.scale.set(across / Math.max(0.22, Math.abs(_A.y)), across, 1);
              pv.scale.x = Math.min(pv.scale.x, across * 3);
            } else {
              const along = Math.min(across * 3, across / Math.max(0.35, Math.abs(_A.z)));
              pv.rotation.order = 'XYZ';
              pv.rotation.set(0, 0, Math.atan2(_A.y, _A.x));
              // on the rock it lies on the slab's FRONT face (that is what the camera sees: the lit spot where the beam meets the rock reads at once; the tunnel wall itself is edge-on), on the cave picture just in front of it
              const pz = hit === 'rock' ? (state.course && state.course.map && state.course.map.open ? Z_FRONT_OPEN : Z_FRONT_CAVE) + 26 : hit === 'back' ? Z_BACK + 36 : _E.z + 60;
              pv.position.set(_E.x, _E.y, pz);
              pv.scale.set(hit === 'ship' ? across : hit === 'rock' ? Math.max(across, Math.min(across * 1.7, 700)) : along, across, 1);
            }
            pv.visible = true;
            nPool++;
          } else pv.visible = false;
          stats.hit = hit; stats.len = Math.round(len);
        });
      }
    }
    for (const [key, l] of lamps) {
      if (l.seen) continue;
      l.beam.visible = false; l.pool.visible = false;
      if (!on || !models.size) { group.remove(l.beam); scene.remove(l.pool); l.beam.material.dispose(); l.pool.material.dispose(); lamps.delete(key); }
    }
    fx.uBeamN.value = nCone;
    if (bp) bp.enabled = usePass && nBeam > 0;
    stats.lamps = nBeam; stats.pools = nPool; stats.ms = performance.now() - t0;
  };

  // ---- the lit targets (the rim in the toon shader) -------------------------------------------------------------------------------------------------------------------------------------------
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4();
  const updateLit = (camera, state, night) => {
    const L = litCfg();
    let n = 0;
    if (look.beam) {
      const list = state.litTargets || [];
      _m.copy(camera.matrixWorld).invert();
      for (const t of list) {
        if (n >= 8) break;
        if (!t || !Number.isFinite(t.x) || !Number.isFinite(t.y)) continue;
        _v.set(t.x, -t.y, 0).applyMatrix4(_m);
        fx.uLit.value[n].set(_v.x, _v.y, _v.z, clamp(fin(t.r, 40), 30, 260) * fin(L.SCALE, 1.3));
        n++;
      }
    }
    fx.uLitN.value = n;
    fx.uLitColor.value.set(L.COLOR || '#ffe2a0');
    const nightK = sstep(0.05, 0.5, clamp(night || 0, 0, 1));
    fx.uLitRim.value = fin(L.RIM, 0.95) * lerp(0.6, 1, nightK);
    fx.uLitFill.value = fin(L.FILL, 0.18) * lerp(0.5, 1, nightK);
    stats.lit = n;
  };

  const dispose = () => { for (const l of lamps.values()) { l.beam.material.dispose(); l.pool.material.dispose(); } geo.dispose(); poolGeo.dispose(); noise.dispose(); poolTex.dispose(); };
  return { update, updateLit, stats, scene: beamScene, group, lamps, dispose };
}
