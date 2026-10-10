// CREW v2 (WP7). Every crewman, raider, parachute, hookshot rope and heart is drawn by ONE layer: a single big mesh (+ its ink shell) holding every figure's parts, with a BONE id on every
// vertex. Each frame the layer writes one 4x4 matrix per bone per figure into a float data texture, and the vertex shader reads it (GPU skinning by hand: no SkinnedMesh, no per-figure meshes).
// So 16 crew + raiders cost 2 draw calls (+1 for the shadow pass), whatever they do, and a figure's pieces (head per species, hat, goggles, scarf, items) are all in the same buffer.
//
// The geometry is rebuilt (a typed-array copy) only when a figure appears or disappears or what it WEARS or HOLDS changes (an item, the hearts, a canopy, the Low tier dropping accessories), at most
// every 70 ms; moving never rebuilds anything. crewParts.js = the parts, crewPose.js = the stepped poses, this file = the buffers, the shader, the bones and the facing.
//
// NO WOBBLE (3D.md section 1): limbs take their angles from crewPose.js, which is only asked again when the 8 fps key number changes (held, then snapped); the figure's position is the simulation's
// own and interpolates smoothly; a turn is two keys (profile -> towards the camera -> profile); nothing here is a function of the time except the key number.
import { THREE, look, gradientMap, rimify, INK, INK_GLSL, inkUniforms } from './style.js';
import { NB, NTINT, B, R, kindOf, BULK, rolesFor, furOf, bodyParts, headParts, tailParts, scarfParts, itemParts, heartParts, markParts, chuteParts, packParts, ropeParts, hookParts, swooshParts, CHEST_ITEMS } from './crewParts.js';
import { computePose, newPose, stepKey, heartsOf, MELEE } from './crewPose.js';
import { config } from '../../config.js';

const MAXF = 48; // figures drawn at once (more are skipped, the furthest-added first)
const MAXV = 200000; // vertices in the big buffer (a figure is about 2-4 thousand)
const TW = 256, TINT0 = MAXF * NB * 4, TH = Math.ceil((TINT0 + MAXF * NTINT) / TW);
const REBUILD_MS = 70;
const OVERLAY = new Set([B.MARK, B.H0, B.H1, B.H2]); // parts drawn over everything
const WEAPON = { grunt: 'cutlass', brute: 'club', sapper: 'bomb', cutter: 'cleaver' }; // what a raider holds
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ---- the shader patch: every vertex looks its bone matrix up in the data texture ---------------------------------------------------------------------------------------------------
const GLSL_HEAD = `
attribute float aBone; attribute float aRole;
uniform highp sampler2D uBones;
mat4 crewBone( float id ) { int b = int( id + 0.5 ) * 4; ivec2 s = ivec2( b % ${TW}, b / ${TW} ); return mat4( texelFetch( uBones, s, 0 ), texelFetch( uBones, s + ivec2( 1, 0 ), 0 ), texelFetch( uBones, s + ivec2( 2, 0 ), 0 ), texelFetch( uBones, s + ivec2( 3, 0 ), 0 ) ); }
vec4 crewTint( float id, int slot ) { int fig = int( floor( id / ${NB}.0 + 0.001 ) ); int t = ${TINT0} + fig * ${NTINT} + slot; return texelFetch( uBones, ivec2( t % ${TW}, t / ${TW} ), 0 ); }
`;
function skinPatch(material, key, mode) { // mode 'color' (toon / plain lit: role colours + the hit flash), 'ink' (the outline shell) or 'depth' (the shadow pass)
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uBones = U.uBones;
    if (mode === 'ink') inkUniforms(sh);
    let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + GLSL_HEAD + (mode === 'ink' ? 'attribute vec3 onormal;\n' + INK_GLSL + '\n' : ''));
    if (mode === 'color') {
      v = v.replace('#include <color_vertex>', `#include <color_vertex>
        mat4 crewM = crewBone( aBone );
        if ( aRole > 0.5 ) vColor = crewTint( aBone, int( aRole + 0.5 ) ).rgb;
        vColor = mix( vColor, vec3( 1.0, 0.55, 0.5 ), crewTint( aBone, 0 ).r * 0.6 );`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = mat3( crewM ) * normal;')
        .replace('#include <begin_vertex>', 'vec3 transformed = ( crewM * vec4( position, 1.0 ) ).xyz;');
    } else if (mode === 'ink') {
      v = v.replace('#include <begin_vertex>', 'mat4 crewM = crewBone( aBone );\n vec3 transformed = ( crewM * vec4( position + inkPush( onormal ), 1.0 ) ).xyz;');
    } else {
      v = v.replace('#include <begin_vertex>', 'mat4 crewM = crewBone( aBone );\n vec3 transformed = ( crewM * vec4( position, 1.0 ) ).xyz;');
    }
    sh.vertexShader = v;
  };
  material.customProgramCacheKey = () => key;
  return material;
}
const U = { uBones: { value: null } };

// ---- scratch ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const Mr = new THREE.Matrix4(), Mt = new THREE.Matrix4(), Ma = new THREE.Matrix4(), Mb = new THREE.Matrix4(), tmp = new THREE.Matrix4(), tmp2 = new THREE.Matrix4();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _col = new THREE.Color();
const rotZ = (m, a) => m.multiply(tmp.makeRotationZ(a));
const trans = (m, x, y, z) => m.multiply(tmp.makeTranslation(x, y, z));

// the world's own crew layer. parent = the Group the scene's world objects live in (worldRoot).
export function createCrewLayer(parent) {
  const geometry = new THREE.BufferGeometry();
  const A = {
    position: new Float32Array(MAXV * 3), normal: new Float32Array(MAXV * 3), color: new Float32Array(MAXV * 3), onormal: new Float32Array(MAXV * 3), aRole: new Float32Array(MAXV), aBone: new Float32Array(MAXV),
  };
  const attrs = {};
  for (const [k, arr] of Object.entries(A)) {
    const a = new THREE.BufferAttribute(arr, k === 'aRole' || k === 'aBone' ? 1 : 3);
    a.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(k, a);
    attrs[k] = a;
  }
  geometry.setDrawRange(0, 0);
  const boneData = new Float32Array(TW * TH * 4);
  const boneTex = new THREE.DataTexture(boneData, TW, TH, THREE.RGBAFormat, THREE.FloatType);
  boneTex.minFilter = boneTex.magFilter = THREE.NearestFilter;
  boneTex.generateMipmaps = false;
  boneTex.needsUpdate = true;
  U.uBones.value = boneTex;
  const toon = skinPatch(rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap })), 'crew-toon', 'color');
  const plain = skinPatch(new THREE.MeshLambertMaterial({ vertexColors: true }), 'crew-plain', 'color');
  const inkM = skinPatch(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), 'crew-ink', 'ink');
  const depthM = skinPatch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), 'crew-depth', 'depth');
  const mesh = new THREE.Mesh(geometry, toon);
  mesh.userData.toon = toon; mesh.userData.plain = plain; mesh.userData.shadowCaster = true; mesh.userData.shadowReceiver = true;
  mesh.frustumCulled = false; mesh.castShadow = look.shadows; mesh.receiveShadow = look.shadows; mesh.customDepthMaterial = depthM;
  mesh.name = 'crew';
  const shell = new THREE.Mesh(geometry, inkM);
  shell.userData.isOutline = true; shell.userData.small = true; shell.frustumCulled = false; shell.visible = look.toon && look.outlines; shell.name = 'crewInk';
  // the OVERLAY: the colour marker and the hearts are drawn over everything (no depth test, unlit: they must read through a deck above the crewman and in a dark cave). A second geometry
  // shares the SAME attributes and draws only the tail of the buffer; it costs 2 more draw calls (fill + ink).
  const geometryO = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(attrs)) geometryO.setAttribute(k, a);
  geometryO.setDrawRange(0, 0);
  const basicO = skinPatch(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, depthWrite: false, transparent: true }), 'crew-basic', 'color');
  const inkO = skinPatch(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide, fog: false, depthTest: false, depthWrite: false, transparent: true }), 'crew-ink', 'ink');
  const meshO = new THREE.Mesh(geometryO, basicO);
  meshO.userData.toon = basicO; meshO.userData.plain = basicO; meshO.frustumCulled = false; meshO.renderOrder = 991; meshO.name = 'crewMarks';
  const shellO = new THREE.Mesh(geometryO, inkO);
  shellO.userData.isOutline = true; shellO.frustumCulled = false; shellO.renderOrder = 990; shellO.visible = look.toon && look.outlines; shellO.name = 'crewMarksInk';
  parent.add(mesh, shell, shellO, meshO);

  const figs = new Map();
  const L = { mesh, shell, figs, K: 0, t: 0, dt: 0, now: 0, frame: 0, acc: true, dirty: false, lastBuild: -1e9, verts: 0, tris: 0, rebuilds: 0, overflow: 0, lineupOn: false, vfx: null, ms: 0, msLast: 0 };

  // ---- the layer's frame ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  L.begin = (t, dt, tier, now) => {
    L.t = Number.isFinite(t) ? t : 0; L.dt = clamp(fin(dt), 0, 0.1); L.K = stepKey(L.t, 8); L.now = Number.isFinite(now) ? now : (typeof performance !== 'undefined' ? performance.now() : 0);
    L.frame++;
    L.ms = 0;
    const acc = !tier || tier.name !== 'low';
    if (acc !== L.acc) { L.acc = acc; L.dirty = true; }
  };

  function newFig(key) {
    return { key, seen: 0, idx: -1, cfg: {}, parts: [], nv: 0, z: null, yaw: null, pose: newPose(), poseK: -1, st: { airK0: 0, squashK: 0, wasAir: false, lastSquash: 0 }, lx: 0, ly: 0, moved: false, ph: (hash(String(key)) * 4) | 0, tint: new Float32Array(NTINT * 4), rec: null, holder: 'A', fresh: true, trailK: -1 };
  }

  // What the figure WEARS and HOLDS (a change rebuilds the buffer). Returns true when it changed.
  function config3(f, rec, env) {
    const raider = !!rec.type, kind = kindOf(rec.type);
    const species = raider ? 'skeleton' : (rec.species && config.CREW_SPECIES.includes(rec.species) ? rec.species : 'bulldog');
    const item = raider ? WEAPON[rec.type] || null : rec.carry || null;
    const ko = rec.ko > 0;
    const hp = !raider && !ko && rec.connected !== false && rec.hearts != null ? heartsOf(rec.hearts, config.HEALTH.MAX) : '';
    const chute = rec.fly && rec.chuteOpen ? 2 : rec.fly && rec.chute > 0 ? 1 : rec.fall && !rec.tumble && !rec.fly ? 2 : 0;
    const hook = !!(rec.hook && rec.hook.phase) && !raider;
    const c = { kind, species, item: ITEMS_OK.has(item) ? item : null, itemOpt: item === 'hookshot' && rec.hook ? 'fired' : '', ko, hearts: hp, chute, hook, mark: !raider, team: !!env.teamColor, acc: L.acc, satchel: rec.type === 'sapper' };
    const o = f.cfg;
    let ch = false;
    for (const k of Object.keys(c)) if (o[k] !== c[k]) { ch = true; break; }
    if (ch) { f.cfg = c; f.parts = null; }
    const tk = f.tk || (f.tk = {});
    if (tk.kind !== kind || tk.species !== species || tk.color !== rec.color || tk.mate !== !!rec.mate || tk.team !== env.teamColor) { // (the role colours: only recomputed when they could have changed)
      tk.kind = kind; tk.species = species; tk.color = rec.color; tk.mate = !!rec.mate; tk.team = env.teamColor;
      const roles = rolesFor(kind, { color: rec.color, mate: rec.mate, teamColor: env.teamColor }, raider ? '#e6dcc4' : furOf(species));
      for (let r = 1; r < NTINT; r++) { _col.set(roles[r] || '#ffffff'); f.tint[r * 4] = _col.r; f.tint[r * 4 + 1] = _col.g; f.tint[r * 4 + 2] = _col.b; f.tint[r * 4 + 3] = 1; }
      f.tint[0] = 0; f.tint[1] = 0; f.tint[2] = 0;
    }
    return ch;
  }
  const ITEMS_OK = new Set(['coal', 'ammo', 'sword', 'hammer', 'hookshot', 'towline', 'sandbag', 'crate', 'extinguisher', 'cutlass', 'club', 'bomb', 'cleaver']);

  function partsOf(c) {
    const out = [];
    out.push(...bodyParts(c.kind, c.acc, { satchel: c.satchel }), ...headParts(c.kind, c.species, c.ko, c.acc));
    if (c.kind === 'crew') { out.push(...tailParts(c.species)); if (c.acc) out.push(...scarfParts()); }
    if (c.item) out.push(...itemParts(c.item, c.itemOpt));
    if (c.hearts) for (let i = 0; i < 3; i++) out.push(...heartParts(c.hearts[i], B.H0 + i));
    if (c.chute === 1) out.push(...packParts());
    if (c.chute === 2) out.push(...chuteParts());
    if (c.hook) out.push(...ropeParts(), ...hookParts());
    if (MELEE.has(c.item)) out.push(...swooshParts());
    if (c.mark) out.push(...markParts(c.team));
    return out;
  }

  // ---- placing a figure -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  // env: { W: Matrix4 | null (the ship's content matrix), lx, ly, lz (position in that frame; z eased by the caller), cz (+1 / -1: which way local +z points at the camera), dt, teamColor, hookFrom? }
  function drive(key, rec, env) {
    let f = figs.get(key);
    if (!f) { f = newFig(key); figs.set(key, f); L.dirty = true; }
    f.seen = L.frame; f.rec = rec;
    if (config3(f, rec, env) || !f.parts) { f.parts = partsOf(f.cfg); let n = 0; for (const p of f.parts) n += p.n; f.nv = n; L.dirty = true; }
    const K = rec.freezeK != null ? rec.freezeK : L.K; // (the dev page's key strip freezes a figure on one key of its animation)
    const o = f.pose;
    // the key changes: a new pose, a new facing, whether he moved (everything held for 1/8 s)
    if (f.poseK !== K) {
      const dx = Math.abs(fin(rec.x) - f.lx) + Math.abs(fin(rec.y) - f.ly);
      f.moved = !f.fresh && dx > 2.5;
      f.lx = fin(rec.x); f.ly = fin(rec.y);
      f.fresh = false;
      const raider = !!rec.type;
      const item = f.cfg.item;
      // the facing: stepped. profile (the way he looks), slightly to the camera when idle, the ladder's wall when climbing; a turn goes through the camera-facing key
      const cz = env.cz;
      const fwd = rec.face >= 0 ? 1 : -1;
      // first pass pose (needs the holder arm, so decide the yaw from the previous pose's wish first)
      const sgnOld = f.yaw == null ? 1 : Math.sign(cz * Math.cos(f.yaw)) || 1;
      f.holder = sgnOld >= 0 ? 'A' : 'B';
      const heading = rec.fly && rec.cannon ? Math.atan2(-fin(rec.fvx), -fin(rec.fvy)) : 0; // (up axis along the velocity: world angle; y is down in the sim)
      const aim = rec.hook && Number.isFinite(rec.hook.dx) ? Math.atan2(-rec.hook.dy, rec.hook.dx * (Math.cos(f.yaw == null ? 0 : f.yaw) >= 0 ? 1 : -1)) : 0.3;
      computePose(o, { p: rec, item, holder: f.holder, K, ph: rec.phase != null ? rec.phase : f.ph, now: L.now, moving: !!rec.moving || f.moved, st: f.st, aim, heading, raider });
      const th = 0.55;
      let target;
      if (o.facing === 'wall') target = Math.PI / 2 - (fwd > 0 ? 0.5 : -0.5); // (the ladder is at the back: he faces it, turned a little to his side, so the arms and legs show)
      else if (o.facing === 'side') target = fwd > 0 ? 0 : Math.PI;
      else target = fwd > 0 ? -cz * th : -cz * (Math.PI - th);
      if (f.yaw == null) f.yaw = target;
      else if (f.yaw !== target) {
        const mid = -cz * Math.PI / 2, c0 = Math.cos(f.yaw), c1 = Math.cos(target);
        if (c0 * c1 < -0.05 && Math.abs(c0) > 0.1) f.yaw = mid; // (a turn: profile -> towards the camera, then the other profile on the next key)
        else f.yaw = target;
      }
      f.poseK = K;
      // a crewman fired from the crew cannon trails smoke (a puff every key)
      if (rec.fly && rec.cannon && L.vfx && L.vfx.P && f.trailK !== K) { f.trailK = K; try { L.vfx.P.burst('smoke', env.lx, env.ly, env.lz + 20, 1, { speed: [5, 25], life: [0.6, 1.0], size: [26, 40], size1: 1.8, alpha: 0.75, color: '#e8e0cc' }); } catch { /* (the particles are off) */ } }
    }
    const E = f.env || (f.env = { W: null, lx: 0, ly: 0, lz: 0, cz: 1, teamColor: null }); // (kept: a figure that only just got a slot in the buffer is assembled again after the rebuild)
    E.W = env.W; E.lx = env.lx; E.ly = env.ly; E.lz = env.lz; E.cz = env.cz; E.teamColor = env.teamColor;
    _v.set(env.lx, env.ly, env.lz); if (env.W) _v.applyMatrix4(env.W); // (WP9: where he stands in the world, for the name labels on the HUD canvas: even before he has a slot in the buffer)
    f.wx = _v.x; f.wy = _v.y + fin(rec.jz); f.wz = _v.z;
    assemble(f, rec, E);
    return f;
  }

  // ---- the bones of one figure -------------------------------------------------------------------------------------------------------------------------------------------------------
  const setBone = (f, bone, m) => m.toArray(boneData, (f.idx * NB + bone) * 16);
  function assemble(f, rec, env) {
    if (f.idx < 0) return; // (not in the buffer yet: the next rebuild gives it a slot)
    const o = f.pose, kind = f.cfg.kind, bulk = BULK[kind] || 1, sc = fin(rec.scale, 1) || 1, yaw = f.yaw == null ? 0 : f.yaw;
    const axis = Math.sign(env.cz * Math.cos(yaw)) || 1; // (does the figure's local +z point at the viewer? flips the sense of a roll given in world terms)
    // root: the ship's frame (or the world), the position, the facing, the roll about the middle of the body, the size and the squash
    if (env.W) Mr.copy(env.W); else Mr.identity();
    trans(Mr, env.lx + o.shudder, env.ly + o.up + fin(rec.jz), env.lz);
    Mr.multiply(tmp.makeRotationY(yaw));
    if (o.roll) { trans(Mr, 0, o.pivotY, 0); rotZ(Mr, o.mode === 'ko' ? o.roll : o.roll * axis); trans(Mr, 0, -o.pivotY, 0); }
    Mr.multiply(tmp.makeScale(sc * o.sx, sc * o.sy, sc * o.sx));
    // torso (leans about the hips) and what hangs on it
    Mt.copy(Mr); trans(Mt, 0, 22 + o.bob, 0); rotZ(Mt, -o.lean); trans(Mt, 0, -22, 0);
    Ma.copy(Mt); Ma.multiply(tmp.makeScale(bulk, 1, bulk)); setBone(f, B.TORSO, Ma);
    Ma.copy(Mt); trans(Ma, 0, 48, 0); rotZ(Ma, -o.headTilt); setBone(f, B.HEAD, Ma);
    const holderArm = f.holder === 'B' ? B.ARM_B : B.ARM_A;
    for (const [bone, z, ang] of [[B.ARM_A, 14.5 * bulk * o.spread, o.aA], [B.ARM_B, -14.5 * bulk * o.spread, o.aB]]) {
      Ma.copy(Mt); trans(Ma, 0, 46, z); rotZ(Ma, ang); setBone(f, bone, Ma);
      if (bone === holderArm && f.cfg.item && !CHEST_ITEMS.has(f.cfg.item)) { Mb.copy(Ma); trans(Mb, 0, -26, 0); rotZ(Mb, o.itemRel); setBone(f, B.ITEM, Mb); }
    }
    for (const [bone, z, ang] of [[B.LEG_A, 7 * bulk * (0.6 + 0.4 * o.spread), o.lA], [B.LEG_B, -7 * bulk * (0.6 + 0.4 * o.spread), o.lB]]) { Ma.copy(Mr); trans(Ma, 0, 22 + o.bob, z); rotZ(Ma, ang); setBone(f, bone, Ma); }
    Ma.copy(Mt); trans(Ma, -8, 47, 0); rotZ(Ma, o.scarf); setBone(f, B.SCARF, Ma);
    Ma.copy(Mt); trans(Ma, -12, 23, 0); rotZ(Ma, o.tail); setBone(f, B.TAIL, Ma);
    if (f.cfg.item && CHEST_ITEMS.has(f.cfg.item)) setBone(f, B.ITEMC, Mt);
    if (o.swoosh) { Ma.copy(Mr); trans(Ma, 10, 40, 0); Ma.multiply(tmp.makeScale(o.swoosh, o.swoosh, o.swoosh * 0.6)); } else { Ma.makeScale(0, 0, 0); }
    setBone(f, B.SWOOSH, Ma);
    if (f.cfg.chute === 2) { Ma.copy(Mr); trans(Ma, 0, 150, 0); const s = f.cfg.chute === 2 && o.open ? o.open : rec.fall ? 1 : 0.35; Ma.multiply(tmp.makeScale(s, s, s)); setBone(f, B.CHUTE, Ma); }
    // the marker, hearts and the rope are WORLD things: they do not lean with the ship or the body
    _v.set(env.lx, env.ly, env.lz); if (env.W) _v.applyMatrix4(env.W);
    f.wx = _v.x; f.wy = _v.y + fin(rec.jz); f.wz = _v.z;
    const markY = (o.mode === 'ko' ? 66 : 128) * sc;
    Ma.makeTranslation(f.wx, f.wy + markY, f.wz); setBone(f, B.MARK, Ma);
    for (let i = 0; i < 3; i++) {
      const pulse = i === 0 && rec.hearts > 0 && rec.hearts <= (config.HEALTH.JOB_AT || 1) && (L.K & 1) ? 1.22 : 1; // (the last heart pulses: two keys)
      Ma.makeTranslation(f.wx + (i - 1) * 24, f.wy + markY + 40, f.wz + 6); Ma.multiply(tmp.makeScale(pulse, pulse, pulse)); setBone(f, B.H0 + i, Ma);
    }
    // the hookshot rope and hook, in the world: from his hand to the hook
    if (f.cfg.hook && rec.hook) {
      const h = rec.hook, HAND = config.HOOKSHOT.HAND;
      _v.set(env.lx, env.ly + HAND + fin(rec.jz), env.lz); if (env.W) _v.applyMatrix4(env.W);
      if (h.phase === 'caught' && Number.isFinite(h.ax) && Number.isFinite(h.ay)) _w.set(h.ax, -h.ay, _v.z); else _w.set(_v.x + fin(h.dx) * fin(h.len), _v.y - fin(h.dy) * fin(h.len), _v.z);
      _d.subVectors(_w, _v);
      const len = _d.length();
      if (len > 1) {
        _q.setFromUnitVectors(_up, _d.multiplyScalar(1 / len));
        Ma.compose(_v, _q, tmp2Scale.set(1, len, 1)); setBone(f, B.ROPE, Ma);
        Ma.compose(_w, _q, tmp2Scale.set(1, 1, 1)); setBone(f, B.HOOK, Ma);
      } else { Ma.makeScale(0, 0, 0); setBone(f, B.ROPE, Ma); setBone(f, B.HOOK, Ma); }
    }
    // tint texture
    boneData.set(f.tint, (TINT0 + f.idx * NTINT) * 4);
    boneData[(TINT0 + f.idx * NTINT) * 4] = o.flash;
  }
  const tmp2Scale = new THREE.Vector3(1, 1, 1);

  // an aboard crewman / raider: model = the ship's 3D model (its content matrix, X/Y mappers and half-beam), raider = a boarder
  L.placeAboard = (key, rec, model, extra = {}) => {
    const t0 = performance.now();
    try {
      let f = figs.get(key);
      const W = model.W;
      // (fix_ship) the lane is in CAMERA terms (toward the viewer, model.crewLane: in front of the ladders and the fittings, inside his deck's width); the local z is that lane times the side the camera is on
      const hh = hash(String(rec.id || key));
      const zt = model.crewLane ? model.crewLane(rec, hh) : (rec.climb ? W * 0.5 : (0.07 + 0.34 * hh) * W);
      const z = f && f.z != null ? f.z + (zt - f.z) * Math.min(1, L.dt * 7) : zt;
      const mw = model.content.matrixWorld, e = mw.elements;
      const cz = Math.abs(e[10]) < 0.02 && f ? f.cz || 1 : e[10] >= 0 ? 1 : -1;
      f = drive(key, rec, { W: mw, lx: model.X(fin(rec.x)), ly: model.Y(fin(rec.y)), lz: z * cz, cz, teamColor: extra.teamColor || null });
      f.z = z; f.cz = cz;
    } catch (e) { logOnce('crew aboard', e); }
    L.ms += performance.now() - t0;
  };
  // a crewman in free flight (a world object): rec.x / rec.y are map coordinates
  L.placeFly = (key, rec, extra = {}) => {
    const t0 = performance.now();
    try {
      let f = figs.get(key);
      const zt = 70;
      const z = f && f.z != null ? f.z + (zt - f.z) * Math.min(1, L.dt * 5) : zt;
      f = drive(key, rec, { W: null, lx: fin(rec.x), ly: -fin(rec.y), lz: z, cz: 1, teamColor: extra.teamColor || null });
      f.z = z;
    } catch (e) { logOnce('crew fly', e); }
    L.ms += performance.now() - t0;
  };
  // anywhere in the world (the dev page's line-up): x, y (UP), z
  L.placeAt = (key, rec, x, y, z, extra = {}) => {
    try { const f = drive(key, rec, { W: null, lx: x, ly: y, lz: z, cz: 1, teamColor: extra.teamColor || null }); f.z = z; } catch (e) { logOnce('crew at', e); }
  };

  // ---- the end of the frame: drop figures that went, rebuild the buffer if something changed, upload ------------------------------------------------------------------------
  L.end = () => {
    const t0 = performance.now();
    let fresh = false;
    for (const [k, f] of figs) { if (f.seen !== L.frame) { figs.delete(k); L.dirty = true; } else if (f.idx < 0 && !f.skipped) fresh = true; }
    if (L.dirty && (fresh || L.now - L.lastBuild > REBUILD_MS)) {
      rebuild();
      for (const f of figs.values()) if (f.idx >= 0 && f.rec && f.env) { try { assemble(f, f.rec, f.env); } catch (e) { logOnce('crew assemble', e); } } // (new slots: their bones are written now)
    }
    boneTex.needsUpdate = true;
    L.ms += performance.now() - t0;
    L.msLast = L.ms;
  };

  function rebuild() {
    L.dirty = false; L.lastBuild = L.now; L.rebuilds++; const rt0 = performance.now();
    let o = 0, n = 0, skipped = 0;
    for (const f of figs.values()) {
      if (!f.parts) { f.parts = partsOf(f.cfg); f.nv = f.parts.reduce((s, p) => s + p.n, 0); }
      if (n >= MAXF || o + f.nv > MAXV) { f.idx = -1; f.skipped = true; skipped++; continue; }
      f.skipped = false;
      f.idx = n++;
      for (const p of f.parts) {
        if (OVERLAY.has(p.bone)) continue;
        A.position.set(p.pos, o * 3); A.normal.set(p.nor, o * 3); A.color.set(p.col, o * 3); A.onormal.set(p.onr, o * 3); A.aRole.set(p.role, o);
        A.aBone.fill(f.idx * NB + p.bone, o, o + p.n);
        o += p.n;
      }
    }
    const o1 = o;
    for (const f of figs.values()) { // (pass two: the overlay parts, in a block of their own at the end)
      if (f.idx < 0) continue;
      for (const p of f.parts) {
        if (!OVERLAY.has(p.bone)) continue;
        A.position.set(p.pos, o * 3); A.normal.set(p.nor, o * 3); A.color.set(p.col, o * 3); A.onormal.set(p.onr, o * 3); A.aRole.set(p.role, o);
        A.aBone.fill(f.idx * NB + p.bone, o, o + p.n);
        o += p.n;
      }
    }
    L.overflow = skipped;
    L.verts = o; L.tris = o / 3;
    for (const [k, a] of Object.entries(attrs)) { a.clearUpdateRanges(); a.addUpdateRange(0, o * a.itemSize); a.needsUpdate = true; }
    geometry.setDrawRange(0, o1);
    geometryO.setDrawRange(o1, o - o1);
    const rms = performance.now() - rt0; L.rebuildMs = rms; L.rebuildMax = Math.max(L.rebuildMax || 0, rms); L.rebuildSum = (L.rebuildSum || 0) + rms;
  }

  // WP9: where a figure stands this frame (3D world, y up), for the HUD canvas's name labels, call-outs and bars (render.js drawOver3D); null when he was not placed this frame
  L.anchor = (key) => {
    const f = figs.get(key);
    if (!f || f.seen !== L.frame || !Number.isFinite(f.wx) || !Number.isFinite(f.wy) || !Number.isFinite(f.wz)) return null;
    return { x: f.wx, y: f.wy, z: f.wz, sc: fin(f.rec && f.rec.scale, 1) || 1, ko: f.pose.mode === 'ko' };
  };
  L.setTier = (tier) => { const acc = !tier || tier.name !== 'low'; if (acc !== L.acc) { L.acc = acc; L.dirty = true; } };
  L.stats = () => ({ figs: figs.size, verts: L.verts, tris: Math.round(L.tris), rebuilds: L.rebuilds, overflow: L.overflow, calls: 4, ms: Math.round((L.msLast || 0) * 100) / 100, rebuildMs: Math.round((L.rebuildSum || 0) / Math.max(1, L.rebuilds) * 100) / 100, rebuildMax: Math.round((L.rebuildMax || 0) * 100) / 100 });
  L.clear = () => { figs.clear(); L.dirty = true; };
  L.dispose = () => { geometry.dispose(); geometryO.dispose(); boneTex.dispose(); };

  let lastLog = '';
  function logOnce(what, e) { const m = what + ': ' + String(e && e.stack ? e.stack : e); if (m !== lastLog) { lastLog = m; console.warn('view3d', m); } }

  // ---- the dev page's CREW LINE-UP: every species, the raiders, and the poses, side by side with their items (no simulation involved) ---------------------------------------------------------------
  // Page 2 of the line-up: the KEYS. Each animation as its separate poses side by side (frozen on one key each): the 4-key walk, the 4-key ladder climb, the jump (crouch, stretch, air) and the
  // landing squash, a swing (raised, struck), the two keys of working a station, the turn (profile, to the camera, the other profile).
  function lineupKeys(ax, ay) {
    const gap = 112, now = L.now, X = (i) => ax + (i - 3.5) * gap, R0 = ay + 285, R1 = ay + 95, R2 = ay - 95, R3 = ay - 285;
    const at = (k, rec, x, y, z = 0) => L.placeAt('lk' + k, { id: 'lk' + k, x: 0, y: 0, face: 1, hearts: 3, ...rec }, x, y, z);
    const base = { species: 'fox', color: '#e8554a' };
    for (let i = 0; i < 4; i++) at('w' + i, { ...base, moving: true, freezeK: 0, phase: i }, X(i), R0); // walk: key 0..3
    for (let i = 0; i < 4; i++) at('c' + i, { species: 'wolf', color: '#3a86ff', climb: true, moving: true, freezeK: 0, phase: i }, X(4 + i), R0, -30); // climb: key 0..3 (from behind)
    at('j0', { ...base, air: true, jumpKey: 0, jz: 8, freezeK: 0 }, X(0), R1); // jump: crouch / tuck
    at('j1', { ...base, air: true, jumpKey: 1, jz: 30, freezeK: 0 }, X(1), R1); // stretch
    at('j2', { ...base, air: true, jumpKey: 2, jz: 50, freezeK: 0 }, X(2), R1); // in the air
    at('j3', { ...base, squash: 0.6, freezeK: 0 }, X(3), R1); // landing squash (1.15 wide, 0.85 tall)
    at('s0', { species: 'bear', color: '#4ac2c9', carry: 'hammer', swingT: now - 40, freezeK: 0 }, X(4), R1); // swing: raised
    at('s1', { species: 'bear', color: '#4ac2c9', carry: 'hammer', swingT: now - 180, freezeK: 0 }, X(5), R1); // swing: struck
    at('k0', { species: 'tiger', color: '#f2b04a', lock: 'gun', fire: true, freezeK: 0, phase: 0 }, X(6), R1); // working a station: key A
    at('k1', { species: 'tiger', color: '#f2b04a', lock: 'gun', fire: true, freezeK: 1, phase: 0 }, X(7), R1); // key B
    at('i0', { species: 'rabbit', color: '#e87aa8', freezeK: 0 }, X(0), R2); // idle: faces the camera a little
    at('i1', { species: 'rabbit', color: '#e87aa8', freezeK: 0, face: -1 }, X(1), R2); // idle, the other way
    at('i2', { species: 'rabbit', color: '#e87aa8', carry: 'extinguisher', moving: true, freezeK: 0, phase: 1 }, X(2), R2); // walking with a tool: the held arm keeps its angle
    at('i3', { species: 'rabbit', color: '#e87aa8', carry: 'crate', moving: true, freezeK: 0, phase: 0 }, X(3), R2); // hauling a crate
    at('i4', { species: 'bulldog', color: '#7ac27a', ko: 5, hearts: 0, freezeK: 0 }, X(4) - 30, R2); // knocked out: tipped over
    at('i5', { species: 'bulldog', color: '#7ac27a', hearts: 1, hurtT: 0.5, carry: 'sword', freezeK: 0 }, X(6), R2); // just hit: the stepped flash
    at('i6', { species: 'bulldog', color: '#7ac27a', hearts: 1.5, freezeK: 1 }, X(7), R2); // a hurt crewman idling
    // the "Hey!" hop of an Action press (crouch, crouch, up, top, down), and an overhead chop by a raider (raised, struck)
    [60, 190, 320, 450, 560].forEach((age, i) => at('h' + i, { species: 'shiba', color: '#e8554a', actT: now - age, freezeK: 0 }, X(i), R3));
    at('x0', { type: 'grunt', species: 'skeleton', scale: 1, swingT: now - 40, freezeK: 0, hearts: undefined }, X(6), R3);
    at('x1', { type: 'grunt', species: 'skeleton', scale: 1, swingT: now - 180, freezeK: 0, hearts: undefined }, X(7), R3);
  }
  // Four rows, 190 apart. ay = the world point (y UP) of the line-up's middle (the camera looks at ay + 95).
  L.lineup = (ax, ay, page) => { // call between begin() and end(), once a frame
    if (page === 2) return lineupKeys(ax, ay);
    const sp = config.CREW_SPECIES, cols = ['#3a86ff', '#e8554a', '#f2b04a', '#7ac27a', '#b07ad9', '#4ac2c9', '#e87aa8', '#c9c24a'];
    const items = ['hammer', 'sword', 'extinguisher', 'ammo', 'coal', 'sandbag', 'hookshot', 'crate'];
    const gap = 112, now = L.now, X = (i) => ax + (i - 3.5) * gap;
    const R0 = ay + 285, R1 = ay + 95, R2 = ay - 95, R3 = ay - 285;
    const at = (k, rec, x, y, z = 0) => L.placeAt('lu' + k, { id: 'lu' + k, x: 0, y: 0, face: 1, hearts: 3, ...rec }, x, y, z);
    // row 0: the eight species, each with an item (the tiger and the shiba hurt)
    sp.forEach((s, i) => at('s' + i, { species: s, color: cols[i], carry: items[i], hearts: i === 3 ? 2.5 : i === 6 ? 1.5 : 3 }, X(i), R0));
    // row 1: walking with a sword / climbing / working a gun / knocked out / hauling coal / mid-jump / swinging a hammer / a fox facing left
    at('a0', { species: 'bulldog', color: cols[0], moving: true, carry: 'sword' }, X(0), R1);
    at('a1', { species: 'wolf', color: cols[1], climb: true, moving: true }, X(1), R1, -30);
    at('a2', { species: 'tiger', color: cols[2], lock: 'gun', fire: true }, X(2), R1);
    at('a3', { species: 'shiba', color: cols[3], ko: 5, hearts: 0 }, X(3) - 30, R1);
    at('a4', { species: 'fox', color: cols[4], moving: true, carry: 'coal' }, X(4), R1);
    at('a5', { species: 'bear', color: cols[5], air: true, jz: 40, carry: 'hammer' }, X(5), R1);
    at('a6', { species: 'cat', color: cols[6], carry: 'hammer', swingT: now - 40, hearts: 2 }, X(6), R1);
    at('a7', { species: 'rabbit', color: cols[7], face: -1, carry: 'sword', hearts: 1 }, X(7), R1);
    // row 2: in the air: a parachute, swinging on the hookshot (the rope runs up and to the right), thrown (flailing), fired from the crew cannon, the overboard tumble, aiming the hookshot on deck
    at('b0', { species: 'fox', color: cols[4], fly: true, chute: 2, chuteOpen: true, fvx: 40, fvy: 80, rot: 0.1 }, X(0), R2 + 30, 40);
    at('b1', { species: 'bear', color: cols[5], fly: true, carry: 'hookshot', hook: { phase: 'caught', dx: 0.7, dy: -0.7, len: 150, ax: X(1) + 110, ay: -(R2 + 190) } }, X(1), R2 + 40, 40);
    at('b2', { species: 'cat', color: cols[6], fly: true, rot: 0.3, fvx: 200, fvy: 100 }, X(2), R2 + 40, 40);
    at('b3', { species: 'wolf', color: cols[1], fly: true, cannon: true, fvx: 700, fvy: -300, rot: 0.3 }, X(3), R2 + 40, 40);
    at('b4', { species: 'bulldog', color: cols[0], fall: true, tumble: true, rot: 1.9, carry: null }, X(4), R2 + 40, 40);
    at('b5', { species: 'tiger', color: cols[2], carry: 'hookshot', hook: { phase: 'flying', dx: 0.8, dy: -0.6, len: 140 } }, X(5), R2);
    at('b6', { species: 'shiba', color: cols[3], carry: 'towline' }, X(6), R2);
    at('b7', { species: 'rabbit', color: cols[7], carry: 'crate', moving: true }, X(7), R2);
    // row 3: the four raiders (a grunt mid-swing, a brute walking, a sapper, a cutter winding up) and the hurt crew with 1, 1.5 and 2 hearts
    ['grunt', 'brute', 'sapper', 'cutter'].forEach((t, i) => at('r' + i, { type: t, species: config.RAIDERS[t].species, scale: config.RAIDERS[t].scale, moving: i === 1, swingT: i === 0 ? now - 60 : 0, windup: i === 3 ? 0.4 : 0, hearts: undefined }, X(i), R3));
    at('c0', { species: 'wolf', color: cols[1], carry: 'extinguisher', hearts: 1 }, X(4), R3);
    at('c1', { species: 'bear', color: cols[5], carry: 'sandbag', hearts: 1.5 }, X(5), R3);
    at('c2', { species: 'tiger', color: cols[2], team: 'a', hearts: 2 }, X(6), R3);
    at('c3', { species: 'fox', color: cols[4], ko: 5, hearts: 0 }, X(7) - 30, R3);
  };
  return L;
}
