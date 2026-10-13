// THE CASTLE'S SET PIECES IN 3D (CASTLE.md package D3; config.RING3D.SET; the sim is host/ring.js and garrison.js, read only). The castle's big moments:
//   GATEHOUSE COLLAPSE  a face is breached (face.down turns true while the view watches): the strip already shows the rubble stump (castleStrip.js); here the intact gatehouse, rebuilt as a group of its own, sinks into its
//                       own dust in 8 held steps, spreading a little and leaning, while stone chunks peel off its top edge and tumble: Rapier bodies (destruction.bodies, the wreckage world: they land on the
//                       platform's rock, bounce, slide off its edge and fall down the cliff) drawn as ONE instanced mesh. Chunks by tier. The 2D simulation never reads any of it.
//   THE CROWN FALL      ring.crown (the sim's own slow-motion: state.slow, ring.crown.t in sim seconds): the crown shudders, breaks off the keep, tips and slides off and falls to the lawn, landing at LAND_AT
//                       sim seconds, where it throws dust and gold sparks, breaks into gold pieces and lies on its side with its lantern out. It runs on ring.crown.t, so the slow-motion is its clock. `cue`
//                       tells the cinematic camera (cinema.js CROWN) where the crown is.
//   FLAMING STONES      state.bullets with stone: true: a rough faceted stone (instanced), tumbling on the 8 fps key, with a trail (burning ones glow and trail fire and smoke); where it ends, dust, rock chips
//                       and (burning) fire. Replaces the generic ball and tracer (SET_LIVE.stone).
// Frames: the gatehouse, the chunks and the stones stand in the flat map frame (the vertex shaders bend them with the ring, like the castle); the crown, its gold pieces and its dust stand in the CAMERA frame
// (RING_SKIP materials, like the keep). Nothing moves on a sine: held keys on t * 8, linear and quadratic motion on the sim's clock. Drawing code never throws (the caller wraps update()).
import { THREE, toonVCInkS, plainVCInk, depthVCInk, look } from './style.js';
import { config } from '../../config.js';
import { createGlowSet, glowDisc, glowDiamond, rng, clamp, fin, TAU } from './castleKit.js';
import { buildGatehouseGroup } from './castleStrip.js';
import { roughBlock, roughStone, SET_LIVE } from './setpieceKit.js';

const ss = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const ZAX = new THREE.Vector3(0, 0, 1);
const pick = (r, lo, hi) => lo + (hi - lo) * r();
const LEAN = [0, 0.012, -0.02, 0.026, -0.03, 0.024, -0.016, 0.008]; // (the collapsing gatehouse's lean at each key: radians, a held pose each, no sine)

// the camera frame's materials: the instanced picture with its ink in the same mesh, and not bent by the ring (RING_SKIP), as the keep's
function skipVariant(m, key) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.defines = { ...(c.defines || {}), RING_SKIP: '' };
  c.customProgramCacheKey = () => key;
  c.shadowSide = m.shadowSide;
  return c;
}

export function createSetPieces({ parent, state, P, destruction }) {
  const K = () => (config.RING3D || {}).SET || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const root = new THREE.Group(), frame = new THREE.Group(); // (the strip frame, bent with the ring / the camera frame, left alone)
  root.name = 'setPieces'; frame.name = 'setPiecesFrame';
  root.visible = false; frame.visible = false;
  parent.add(root, frame);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S3 = new THREE.Vector3(), CO = new THREE.Color();
  const rnd = rng(20261012);

  // ---- the instanced meshes ---------------------------------------------------------------------------------------------------------------------------------------------------------
  const skipToon = skipVariant(toonVCInkS, 'toon-rim-vc-ink-skip'), skipPlain = skipVariant(plainVCInk, 'lambert-vc-ink-skip');
  function inst(geometry, max, name, into, toon, plain) {
    const mesh = new THREE.InstancedMesh(geometry, toon, max);
    mesh.userData.toon = toon; mesh.userData.plain = plain;
    mesh.customDepthMaterial = depthVCInk;
    if (!look.toon) mesh.material = plain;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, CO.set('#ffffff')); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.count = 0; mesh.visible = false; mesh.name = name;
    into.add(mesh);
    return mesh;
  }
  const blockGeo = roughBlock(), stoneGeo = roughStone();
  const CHUNK_MAX = 72, GOLD_MAX = 24;
  const chunkMesh = inst(blockGeo, CHUNK_MAX, 'castleChunks', root, toonVCInkS, plainVCInk);
  const stoneMesh = inst(stoneGeo, 16, 'castleStones', root, toonVCInkS, plainVCInk);
  const goldMesh = inst(blockGeo, GOLD_MAX, 'crownPieces', frame, skipToon, skipPlain);
  const glow = createGlowSet(root, glowDisc(), 40, false);
  const frameGlow = createGlowSet(frame, glowDiamond(), 96, true);
  // dust in the camera frame: opaque faceted balls that swell in 8 fps steps and shrink away (the gouache puffs of destruction.js), lit like the keep
  const FX_MAX = 140;
  const dustMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  dustMat.defines = { RING_SKIP: '' };
  const dustMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), dustMat, FX_MAX);
  dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dustMesh.setColorAt(0, CO.set('#ffffff')); dustMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  dustMesh.frustumCulled = false; dustMesh.count = 0; dustMesh.visible = false; dustMesh.name = 'crownDust';
  frame.add(dustMesh);

  const finish = (mesh, n) => { mesh.count = n; mesh.visible = n > 0; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; };
  const stats = { collapses: 0, chunks: 0, bodies: 0, fakes: 0, stones: 0, landed: 0, crowns: 0, gold: 0, ms: 0, thuds: 0, maxChunks: 0 };
  const cue = { on: false, u: 0, drop: 0, t: 0, landed: false }; // (for cinema.js: the crown's fall)

  // ---- state ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  let lastRing = null, wasOn = false, broken = false, lastKey = -1;
  const downSeen = new Map(); // face index -> was it breached when we last looked (a face that is breached when the map starts does not collapse)
  const collapses = new Map(); // face index -> { f, t0, group, k, base }
  const chunks = []; // the gatehouse's stones: { x, y, z, vx, vy, spin, rot, q, sx, sy, sz, color, age, life, id }
  const gold = []; // the crown's pieces (the camera frame)
  const fx = []; // camera-frame dust and sparks: { kind, x, y, z, vx, vy, vz, r0, r1, age, life, color }
  const stoneSeen = new Map(); // bullet -> { x, y, vx, vy, burn, rot0 }
  let cs = null; // the crown's state

  const bodies = () => (destruction && destruction.bodies) || null;
  const gravity = () => ((config.BREAKOFF || {}).DEBRIS || {}).GRAVITY || 520;
  const stoneG = () => gravity() * ((((config.BREAKOFF || {}).PHYS || {}).STONES || {}).GRAVITY || 2);

  function dropChunk(c) { if (c.id) { const B = bodies(); if (B) B.remove(c.id); c.id = null; } }
  function clearAll() {
    for (const c of chunks) dropChunk(c);
    chunks.length = 0; gold.length = 0; fx.length = 0;
    for (const c of collapses.values()) killGroup(c);
    collapses.clear(); stoneSeen.clear(); downSeen.clear();
    if (cs) restoreCrown();
    cs = null; cue.on = false; cue.u = 0; cue.landed = false;
    SET_LIVE.stone = false;
    finish(chunkMesh, 0); finish(stoneMesh, 0); finish(goldMesh, 0); finish(dustMesh, 0);
    glow.begin(); glow.end(); frameGlow.begin(); frameGlow.end();
  }
  function killGroup(c) { if (c.group) { c.group.removeFromParent(); c.group.traverse((o) => o.geometry && o.geometry.dispose()); c.group = null; } }

  // a stone chunk of a collapsing gatehouse (or a fallen crown, gold = true: it falls by hand in the camera frame)
  function addChunk(o) {
    const list = o.gold ? gold : chunks;
    if (list.length >= (o.gold ? GOLD_MAX : CHUNK_MAX)) return null;
    const c = { ...o, q: new THREE.Quaternion().setFromAxisAngle(ZAX, o.rot || 0), age: 0, id: null, rest: false };
    if (!o.gold) {
      const B = bodies();
      if (B && B.ready) c.id = B.add({ pos: [c.x, c.y, c.z], quat: [c.q.x, c.q.y, c.q.z, c.q.w], vel: [c.vx, c.vy], ang: [0, 0, c.spin], boxes: [{ cx: 0, cy: 0, cz: 0, hx: c.sx * 0.45, hy: c.sy * 0.45, hz: Math.min(c.sz * 0.45, 70) }] });
      if (c.id) stats.bodies++; else stats.fakes++;
    }
    list.push(c);
    stats.chunks++;
    return c;
  }
  function stepChunks(dt, list, isGold) {
    const B = bodies(), rd = {}, g = stoneG();
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.age += dt;
      if (c.age >= c.life || c.y < (c.floor == null ? -40000 : c.floor - 5000)) { if (!isGold) dropChunk(c); list.splice(i, 1); continue; }
      if (c.id && B && B.read(c.id, rd)) {
        c.x = rd.x; c.y = rd.y; c.z = rd.z; c.q.set(rd.qx, rd.qy, rd.qz, rd.qw);
      } else if (!c.rest) { // by hand: gravity, a bounce on the ground plane, a roll that slows
        c.vy -= (isGold ? g * 0.6 : g) * dt;
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.rot = (c.rot || 0) + c.spin * dt;
        const gy = c.gy;
        if (gy != null && (c.gx0 == null || (c.x > c.gx0 && c.x < c.gx1)) && c.y - c.sy * 0.5 < gy && c.vy < 0) {
          c.y = gy + c.sy * 0.5; c.vy = -c.vy * 0.28; c.vx *= 0.7; c.spin *= 0.6;
          if (Math.abs(c.vy) < 60) { c.vy = 0; c.vx *= 0.5; if (Math.abs(c.vx) < 20) { c.vx = 0; c.rest = true; } }
        }
        c.q.setFromAxisAngle(ZAX, c.rot);
      }
    }
  }
  function writeChunks(list, mesh, max) {
    let n = 0;
    for (const c of list) {
      if (n >= max) break;
      const left = c.life - c.age, f = left < 0.6 ? ss(left / 0.6) : 1;
      if (f <= 0.01) continue;
      M4.compose(V.set(c.x, c.y, c.z), c.q, S3.set((c.sx * f) / 100, (c.sy * f) / 100, (c.sz * f) / 100));
      mesh.setMatrixAt(n, M4); mesh.setColorAt(n, c.color); n++;
    }
    finish(mesh, n);
    return n;
  }

  // camera-frame dust and sparks
  function puff(kind, x, y, z, vx, vy, vz, r0, r1, life, color) { if (fx.length < FX_MAX + 60) fx.push({ kind, x, y, z, vx, vy, vz, r0, r1, age: 0, life, color }); }
  function stepFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      p.age += dt;
      if (p.age >= p.life) { fx.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind === 'spark') p.vy -= 900 * dt;
    }
    let n = 0;
    for (const p of fx) {
      if (p.kind !== 'dust' || n >= FX_MAX) continue;
      const k = Math.floor((p.age / p.life) * 8) / 8, r = (p.r0 + (p.r1 - p.r0) * k) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      if (r <= 0.5) continue;
      M4.compose(V.set(p.x, p.y, p.z), Q.identity(), S3.set(r, r * 0.9, r));
      dustMesh.setMatrixAt(n, M4); dustMesh.setColorAt(n, CO.set(p.color)); n++;
    }
    finish(dustMesh, n);
    frameGlow.begin();
    for (const p of fx) {
      if (p.kind !== 'spark') continue;
      const k = 1 - Math.floor((p.age / p.life) * 6) / 6;
      if (k > 0) frameGlow.add(p.x, p.y, p.z, p.r0 * k, p.r0 * 1.7 * k, p.r0 * k, p.color, 2);
    }
    frameGlow.end();
  }

  // ---- 1. the gatehouse collapse -----------------------------------------------------------------------------------------------------------------------------------------------------
  function startCollapse(f, ring, castle, t) {
    const S = K().COLLAPSE || {};
    let built = null;
    try { built = buildGatehouseGroup(f, castle.art(ring), config.RING3D || {}); } catch (e) { console.warn('view3d collapse build failed', e); return; }
    const group = built.group, A = castle.art(ring);
    group.position.set(f.x, -f.y, 0);
    root.add(group);
    collapses.set(f.i, { f, t0: t, group, k: -1, base: -f.y, keys: S.KEYS || 8, stone: A.stone, shade: A.shade, trim: A.trim });
    stats.collapses++;
  }
  function stepCollapse(c, t, tierName) {
    const S = K().COLLAPSE || {}, sink = S.SINK || [1, 0.7, 0.4, 0.1], keys = c.keys, key = Math.floor((t - c.t0) * 8);
    if (key === c.k) return;
    c.k = key;
    const Pt = getP(), f = c.f, x0 = f.x, base = c.base;
    if (key >= keys) { killGroup(c); collapses.delete(f.i); return; }
    const s = sink[Math.min(sink.length - 1, key)] ?? 0.1, bulge = S.BULGE ?? 0.07;
    c.group.scale.set(1 + bulge * (1 - s) * 1.5, Math.max(0.04, s), 1 + bulge * (1 - s));
    c.group.rotation.z = LEAN[key % LEAN.length] || 0;
    // stones peel off the top edge as it sinks (the towers' tops first), flying out from the middle
    const total = (S.CHUNKS || {})[tierName] ?? (S.CHUNKS || {}).medium ?? 26, span = Math.max(1, keys - 1), per = Math.round((total * (key + 1)) / span) - Math.round((total * key) / span); // (exactly `total` over the keys before the last)
    const hTop = 1450 * s, size = S.SIZE || [46, 130], spd = S.SPEED || [180, 640], up = S.UP || [120, 520], life = S.LIFE || [3.6, 5.6];
    if (key < keys - 1) {
      for (let i = 0; i < per; i++) {
        const side = rnd() < 0.5 ? -1 : 1, tower = rnd() < 0.6, ox = tower ? side * (560 + (rnd() - 0.5) * 300) : (rnd() - 0.5) * 840;
        const sz = pick(rnd, size[0], size[1]), top = tower ? hTop : hTop * 0.52;
        addChunk({ x: x0 + ox, y: base + top * (0.55 + 0.45 * rnd()) + sz * 0.5, z: -40 - rnd() * 120, vx: Math.sign(ox || side) * pick(rnd, spd[0], spd[1]) * (0.4 + 0.6 * rnd()) + (rnd() - 0.5) * 140, vy: pick(rnd, up[0], up[1]) * (key === 0 ? 0.7 : 1), spin: (rnd() - 0.5) * 9, rot: rnd() * TAU,
          sx: sz, sy: sz * (0.5 + 0.5 * rnd()), sz: sz * 0.7, color: new THREE.Color(rnd() < 0.5 ? c.stone : rnd() < 0.5 ? c.shade : c.trim).multiplyScalar(0.9 + 0.2 * rnd()), life: pick(rnd, life[0], life[1]), gy: base, gx0: x0 - 1700, gx1: x0 + 1700, floor: base });
      }
    }
    // the dust: big pale balls along the foot of it and billowing up from the top, every key; a ring of it when the last of it goes
    if (Pt && look.vfx !== false) {
      const dust = (S.DUST || {})[tierName] ?? 6;
      Pt.burst('dust', x0, base + 60, 60, dust, { area: 520, size: [90, 170], size1: 2.2, life: [0.9, 1.7], speed: [30, 150], up: [20, 110], alpha: 0.8, color: '#fff1d6', hdr: 1.4, zs: 60 });
      Pt.burst('dust', x0, base + hTop * 0.6 + 80, 30, Math.ceil(dust / 2), { area: 380, size: [80, 140], size1: 2, life: [0.8, 1.4], speed: [20, 110], up: [60, 170], alpha: 0.7, color: '#fbecd0', hdr: 1.4 });
      if (key === 0) { Pt.spawn('flash', x0, base + 420, 80, { size: 900, size1: 1.1, life: 0.12, color: '#ffe2a0', hdr: 1.6, alpha: 0.7 }); Pt.burst('smoke', x0, base + 300, 40, 3, { size: [110, 160], size1: 2.2, life: [1.4, 2.2], color: '#4a4440', alpha: 0.8, speed: [20, 90], up: [40, 120] }); }
      if (key === keys - 1) { Pt.burst('dust', x0, base + 40, 70, dust * 2, { area: 640, size: [100, 190], size1: 2.2, life: [1.1, 2], speed: [60, 220], up: [10, 80], alpha: 0.85, color: '#fff1d6', hdr: 1.4, zs: 80 }); Pt.ring(x0, base + 30, 90, 900, '#e8dcc0', 0.5, { alpha: 0.5, hdr: 1 }); }
      Pt.splinters(x0, base + hTop * 0.7, 40, 6, { kind: 'rock', speed: [200, 520], up: [100, 320], area: 360 });
    }
  }

  // ---- 2. the crown fall ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  function restoreCrown() {
    if (!cs || !cs.grp) return;
    cs.grp.position.copy(cs.rest); cs.grp.rotation.set(0, 0, 0);
    if (cs.lantern) { cs.lantern.visible = true; cs.lantern.scale.copy(cs.lanternScale); }
    cs.restored = true;
  }
  // the crown's world position (the camera frame): the keep's root plus the group's own offset
  function crownAt(castle) { const k = castle.keep, g = cs.grp; return { x: k.position.x + g.position.x, y: k.position.y + g.position.y, z: k.position.z + g.position.z }; }
  function stepCrown(ring, t, dt, castle, tierName, newKey, k8) {
    const cr = ring.crown, meta = castle.crownMeta, grp = castle.crown;
    if (!cr || !meta || !grp) {
      if (cs && cs.touched) { restoreCrown(); cs.touched = false; } // (a test put the crown back: stand it up again)
      cue.on = false;
      return;
    }
    if (!cs || cs.grp !== grp) cs = { grp, rest: grp.position.clone(), lantern: meta.lantern, lanternScale: meta.lantern ? meta.lantern.scale.clone() : null, broke: false, landed: false, touched: false, lastKey: -1, landY: 0, drop: 0 };
    const C = K().CROWN || {}, T = Math.max(0, cr.t || 0), brk = C.BREAK_AT ?? 0.6, land = C.LAND_AT ?? 2.3, tf = Math.max(0.4, land - brk);
    if (cs.fresh !== false) { cs.fresh = false; if (T > land + 0.3) { cs.broke = cs.landed = true; cue.landed = true; if (cs.lantern) cs.lantern.visible = false; } } // (the view began after the crown had fallen: it just lies there, no second show)
    cs.touched = true;
    const landY = meta.base0 + meta.band * 0.98 + 36, drop = Math.max(300, meta.seatY - landY);
    cs.landY = landY; cs.drop = drop;
    const Pt = getP(), allow = Pt && look.vfx !== false;
    let dx = 0, dy = 0, dz = 0, rz = 0, ry = 0;
    if (T < brk) { // the shudder: held offsets on the 8 fps key, growing
      const a = (T / brk), sgn = k8 & 1 ? 1 : -1;
      dx = sgn * (5 + 16 * a); dy = ((k8 >> 1) & 1) * 5 * a; rz = sgn * 0.006 * a;
      if (cs.lantern && newKey) cs.lantern.scale.copy(cs.lanternScale).multiplyScalar([1, 1.3, 0.85][k8 % 3]);
      if (newKey && allow && (k8 & 1)) { const w = crownAt(castle); for (let i = 0; i < 2; i++) puff('dust', w.x + (rnd() - 0.5) * meta.band * 1.6, w.y - 20, w.z + (rnd() - 0.5) * meta.band * 1.6, (rnd() - 0.5) * 80, 40 + rnd() * 50, 0, 40, 110, 1.1, '#ece0c4'); }
    } else {
      const u = T - brk, s = clamp(u / tf, 0, 1), sl = ss(u / (tf * 0.55));
      dx = (C.SLIDE ?? 1500) * sl; dz = (C.FORWARD ?? 650) * sl; dy = -drop * s * s; rz = -(C.TILT ?? 1.35) * Math.pow(s, 1.2); ry = -0.9 * s;
      if (!cs.broke) { // it comes away: a flash, dust round the seat, gold sparks
        cs.broke = true; stats.crowns++;
        if (cs.lantern) cs.lantern.scale.copy(cs.lanternScale).multiplyScalar(1.4);
        const w = crownAt(castle);
        if (allow) {
          for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; puff('dust', w.x + Math.sin(a) * meta.band * 0.9, w.y - 30, w.z + Math.cos(a) * meta.band * 0.9, Math.sin(a) * 110, 30 + rnd() * 70, Math.cos(a) * 110, 50, 150, 1.5, '#ece0c4'); }
          for (let i = 0; i < 16; i++) { const a = rnd() * TAU; puff('spark', w.x + Math.sin(a) * meta.band * 0.8, w.y + 20, w.z + Math.cos(a) * meta.band * 0.8, Math.sin(a) * (120 + rnd() * 360), 120 + rnd() * 420, Math.cos(a) * (120 + rnd() * 360), 14 + rnd() * 10, 0, 0.9, '#ffd980'); }
        }
      }
      if (s < 1 && newKey && allow) { // a few gold sparks and a puff of dust fall away from it, once a key
        const w = crownAt(castle);
        puff('spark', w.x + (rnd() - 0.5) * meta.band, w.y - 10, w.z + (rnd() - 0.5) * meta.band, (rnd() - 0.5) * 120, -40 - rnd() * 60, (rnd() - 0.5) * 80, 14, 0, 0.8, '#ffd980');
        if (k8 & 1) puff('dust', w.x + (rnd() - 0.5) * meta.band, w.y + 40, w.z, (rnd() - 0.5) * 50, 20, 0, 30, 90, 0.9, '#ece0c8');
      }
      if (cs.lantern && s < 1 && newKey) cs.lantern.scale.copy(cs.lanternScale).multiplyScalar([1.4, 1.2, 1][k8 % 3]);
      if (s >= 1 && !cs.landed) { // it lands: dust, a flash, gold pieces; the lantern goes out
        cs.landed = true; cue.landed = true; stats.landed++;
        if (cs.lantern) cs.lantern.visible = false;
        const w = crownAt(castle), ground = meta.base0 + 12;
        if (allow) {
          for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; puff('dust', w.x + Math.sin(a) * 120, ground + 40, w.z + Math.cos(a) * 120, Math.sin(a) * (260 + rnd() * 220), 40 + rnd() * 80, Math.cos(a) * (260 + rnd() * 220), 70, 220, 1.8, rnd() < 0.5 ? '#ece0c4' : '#f2e9d2'); }
          for (let i = 0; i < 26; i++) { const a = rnd() * TAU; puff('spark', w.x, ground + 80, w.z, Math.sin(a) * (200 + rnd() * 560), 200 + rnd() * 700, Math.cos(a) * (200 + rnd() * 560), 12 + rnd() * 12, 0, 1.0, rnd() < 0.5 ? '#ffd980' : '#fff0c8'); }
          puff('spark', w.x, ground + 160, w.z + 60, 0, 0, 0, 340, 0, 0.12, '#fff0c8');
        }
        const n = ((C.CHUNKS || {})[tierName]) ?? 12, cols = C.COLOR || ['#dcba58'];
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, sz = 26 + rnd() * 44;
          addChunk({ gold: true, x: w.x + Math.sin(a) * 120, y: ground + 120 + rnd() * 100, z: w.z + Math.cos(a) * 120, vx: Math.sin(a) * (180 + rnd() * 420), vy: 260 + rnd() * 520, spin: (rnd() - 0.5) * 8, rot: rnd() * TAU, sx: sz, sy: sz * (0.5 + 0.8 * rnd()), sz: sz * 0.7,
            color: new THREE.Color(cols[i % cols.length]), life: 1e9, gy: ground, floor: ground });
        }
      }
    }
    grp.position.set(cs.rest.x + dx, cs.rest.y + dy, cs.rest.z + dz);
    grp.rotation.set(0, ry, rz);
    // the cue for the camera: how far through the fall it is, and for how long the camera should hold
    cue.on = T < land + (C.HOLD ?? 3) * 0.3;
    cue.u = clamp((T - brk) / tf, 0, 1); cue.drop = drop; cue.t = T;
  }

  // ---- 3. the catapult stones ----------------------------------------------------------------------------------------------------------------------------------------------------
  function stepStones(dt, t, newKey, night, tierName) {
    const S = K().STONE || {}, Pt = getP(), allow = Pt && look.vfx !== false;
    const size = S.SIZE ?? 40, halo = S.GLOW ?? 84, cap = Math.min(16, S.CAP ?? 14);
    const seen = new Set();
    let n = 0;
    const k8 = Math.floor(t * 8);
    glow.begin();
    for (const b of state.bullets) {
      if (!b.stone || !fin(b.x) || !fin(b.y)) continue;
      seen.add(b);
      let rec = stoneSeen.get(b);
      if (!rec) { rec = { rot0: rnd() * TAU, ax: rnd() * TAU, acc: 0, acc2: 0 }; stoneSeen.set(b, rec); }
      rec.x = b.x; rec.y = b.y; rec.vx = b.vx || 0; rec.vy = b.vy || 0; rec.burn = !!b.burn; rec.life = b.life;
      if (n >= cap) continue;
      const x = b.x, y = -b.y, z = 14, hot = !!b.burn;
      const ang = rec.rot0 + k8 * 0.85, tum = rec.ax + k8 * 0.6;
      Q.setFromEuler(new THREE.Euler(tum * 0.5, 0, ang));
      M4.compose(V.set(x, y, z), Q, S3.set(size / 100, (size * 0.86) / 100, (size * 0.9) / 100));
      stoneMesh.setMatrixAt(n, M4);
      stoneMesh.setColorAt(n, CO.set(hot ? (S.HOT || '#ffb27a') : (n & 1 ? S.ROCK2 || '#6e655c' : S.ROCK || '#8d8378')));
      n++;
      if (hot) { // heat: a halo and a core behind it, a trail of fire and smoke
        glow.add(x, y, 2, size * 0.62, size * 0.62, 6, '#ff7a22', 1.5 + 0.3 * (k8 & 1)); // a rim of heat round the stone
        if (allow) {
          Pt.spawn('flash', x, y, 20, { size: halo, size1: 1, life: 0.05, color: '#ff9a3a', hdr: 1.15, alpha: 0.5 }); // (a soft halo; made again every frame, it follows the stone)
          rec.acc += dt * 40; rec.acc2 += dt * 13;
          while (rec.acc >= 1) { rec.acc -= 1; Pt.spawn('fire', x - rec.vx * 0.012, y + rec.vy * -0.012, 6, { size: [70, 118], size1: 0.3, life: [0.3, 0.55], speed: [0, 10], up: [0, 22], vx: -rec.vx * 0.04, vy: rec.vy * 0.04, hdr: 1.5 }); }
          while (rec.acc2 >= 1) { rec.acc2 -= 1; Pt.spawn('smoke', x - rec.vx * 0.03, y + rec.vy * -0.03, 0, { size: [40, 62], size1: 2.4, life: [0.8, 1.4], color: '#6e5f58', alpha: 0.6, speed: [0, 14], up: [10, 40] }); }
          if (newKey && night > 0.15) Pt.spawn('flash', x, y, 30, { size: 340 + 160 * night, life: 0.13, size1: 1, color: '#ff9a3a', hdr: 1.1, alpha: 0.5 * night });
        }
      } else if (allow) { // a plain stone: a thin trail of rock dust
        rec.acc += dt * 14;
        while (rec.acc >= 1) { rec.acc -= 1; Pt.spawn('dust', x - rec.vx * 0.02, y + rec.vy * -0.02, 4, { size: [30, 46], size1: 2, life: [0.4, 0.7], alpha: 0.5, color: '#e0d6c0', speed: [0, 10], up: [0, 20] }); }
      }
    }
    finish(stoneMesh, n);
    glow.end();
    stats.stones = n;
    // a stone that has gone from the sim's list: it landed (or struck): dust, chips, and for a burning one a burst of fire
    for (const [b, r] of stoneSeen) {
      if (seen.has(b)) continue;
      stoneSeen.delete(b);
      stats.landed++;
      if (!allow) continue;
      const x = r.x, y = -r.y;
      Pt.burst('dust', x, y + 10, 40, 10, { area: 80, size: [90, 170], size1: 2.1, life: [0.7, 1.3], speed: [60, 280], up: [30, 130], alpha: 0.85, color: '#fff1d6', hdr: 1.4 });
      Pt.splinters(x, y + 20, 40, 10, { kind: 'rock', speed: [200, 560], up: [140, 400], area: 60 });
      Pt.burst('spark', x, y + 16, 44, r.burn ? 14 : 5, { speed: [160, 520], life: [0.3, 0.6], size: [5, 8] });
      Pt.ring(x, y + 8, 50, r.burn ? 640 : 420, r.burn ? '#ffb347' : '#e8dcc0', 0.36, { alpha: 0.7 });
      if (r.burn) {
        Pt.spawn('flash', x, y + 40, 70, { size: 620, size1: 1.2, life: 0.1, color: '#ffb060', hdr: 2.2, alpha: 0.9 });
        Pt.burst('fire', x, y + 10, 46, 6, { size: [110, 190], size1: 0.35, life: [0.4, 0.8], speed: [20, 160], up: [60, 220], area: 60, drag: 1.2 });
        Pt.burst('smoke', x, y + 30, 36, 2, { size: [90, 130], size1: 2.2, life: [1.2, 2], color: '#5d4e47', alpha: 0.7, speed: [10, 60], up: [40, 100] });
      }
    }
  }

  // ---- the frame ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function update({ on, t = 0, dt = 0.016, night = 0, tier = null, castle = null }) {
    const t0 = performance.now();
    const ring = on && state.course && state.course.ring ? state.course.ring : null;
    if (!ring || K().ENABLED === false || broken || !castle) {
      if (wasOn) { wasOn = false; clearAll(); root.visible = false; frame.visible = false; lastRing = null; }
      return;
    }
    wasOn = true;
    root.visible = true; frame.visible = true;
    dt = clamp(dt, 0, 0.1);
    if (ring !== lastRing) { clearAll(); lastRing = ring; for (const f of ring.faces) downSeen.set(f.i, !!f.down); }
    SET_LIVE.stone = true;
    const tierName = (tier && tier.name) || 'medium', nightK = clamp(Number(night) || 0, 0, 1);
    const k8 = Math.floor(t * 8), newKey = k8 !== lastKey;
    lastKey = k8;
    // a face that falls while we watch: its gatehouse collapses (one that is already down when the map begins does not)
    for (const f of ring.faces) {
      const was = downSeen.get(f.i);
      if (f.down && was === false && !collapses.has(f.i)) startCollapse(f, ring, castle, t);
      downSeen.set(f.i, !!f.down);
    }
    for (const c of [...collapses.values()]) stepCollapse(c, t, tierName);
    try { stepCrown(ring, t, dt, castle, tierName, newKey, k8); } catch (e) { cue.on = false; console.warn('view3d crown fall failed', e); }
    stepStones(dt, t, newKey, nightK, tierName);
    // the stones of the collapse and the crown's gold pieces
    stepChunks(dt, chunks, false);
    stepChunks(dt * Math.max(0.35, Number(state.slow) || 1), gold, true);
    stats.maxChunks = Math.max(stats.maxChunks, chunks.length);
    writeChunks(chunks, chunkMesh, CHUNK_MAX);
    writeChunks(gold, goldMesh, GOLD_MAX);
    stepFx(dt * Math.max(0.35, Number(state.slow) || 1));
    // the glow (the strip frame's: the stones' heat)
    stats.ms = performance.now() - t0;
  }
  return {
    update, stats, root, frame, cue,
    get chunkCount() { return chunks.length; },
    get collapsing() { return collapses.size; },
    dispose() { clearAll(); glow.dispose(); frameGlow.dispose(); root.removeFromParent(); frame.removeFromParent(); },
  };
}
