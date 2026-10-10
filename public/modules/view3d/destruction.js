// DESTRUCTION IN 3D (3D.md section 4, WP5). When the simulation breaks parts off a ship (shipSim.js breakOff), it leaves a note on the ship's `breakEvents` BEFORE the layout is replaced. This file reads the
// notes first thing each frame, while the 3D model is still the old whole ship, and:
//   1. lifts the lost parts out of the old model (model.extractPart(key) plus their moving bits) and the hull, deck and room walls inside the hole they leave (extractClip, cut at the edge), one bundle per
//      piece of debris the plan made (plan.pieces[i]);
//   2. makes each bundle a rigid body in the wreckage world (physics.js, Rapier) with the 2D debris piece's speed and spin plus a kick away from a blast, and a smoke trail;
//   3. throws plank and iron chunks about when it was a blast;
//   4. lets index.js rebuild the ship from the new layout (the hole in her hull wall is carved by the ship's materials, parts3d/kit.js SCARS; damageView.js sets it up).
// The pieces fall, bounce off the rock and the hulls (kinematic compounds of hitRects and bags), splash into the sea and float (wood) or sink (iron), and shrink away when their 2D twin in `state.debris` expires.
// The 2D game stays in charge: nothing here is read back. If Rapier cannot load, the pieces fall on a plain ballistic path instead (the same gravity), so the picture never depends on it.
// Hooks for the VFX pass (WP4): D.hooks.smoke / spark / splash are small functions that default to simple puffs here; particles.js can replace them.
import { THREE, G, INK, pairFor, styled, applyLook } from './style.js';
import { loadRapier, createPhysics, PHYS } from './physics.js';
import { chunkWalls } from './terrainWalls.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const IRON_KINDS = new Set(['engine', 'gun', 'searchlight', 'coil', 'crewCannon', 'ramProw', 'pipe', 'rack', 'ballast', 'vent', 'armour']);
const CANVAS_KINDS = new Set(['gasbag', 'sail']);
const SKIN_KINDS = ['hull', 'deck', 'enemyDeck', 'room', 'armour']; // (the parts whose hole a break-off leaves: the picture inside it goes with the piece)

// inRock(state, x, y) = the 2D game's rock test (course.js), used as a safety net: a piece that ends up deep in the rock (it started inside it, a ledge was thinner than a step) is removed instead of falling through the mountain.
export function createDestruction({ parent, state, models, terrain, world, inRock = null, renderer = null }) {
  const K = () => PHYS();
  const group = new THREE.Group();
  group.name = 'wreckage';
  parent.add(group);
  const pieces = [], chunks = [];
  let physics = null, loading = false, failed = false, awake = false, idleFor = 0, sea = NaN;
  const lastChunks = new Map(); // key -> { map, ci, cj }: the rock chunks standing now (so the physics can take them when it wakes)
  const stats = { events: 0, pieces: 0, chunks: 0, bodies: 0, stepMs: 0, maxStepMs: 0, loadMs: 0, fallback: 0, lastExtractMs: 0 };

  // ---- smoke and sparks: simple instanced puffs (WP4's particles can replace D.hooks) -------------------------------------------------------------------------------------------
  const PUFFS = 140;
  const puffGeo = new THREE.SphereGeometry(1, 8, 6);
  const puffMesh = new THREE.InstancedMesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), PUFFS);
  puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  puffMesh.frustumCulled = false;
  puffMesh.count = 0;
  puffMesh.setColorAt(0, new THREE.Color('#888888'));
  group.add(puffMesh);
  const puffs = [];
  const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _C = new THREE.Color();
  const hooks = {
    // smoke(x, y, z, { r, life, color, rise }): a grey puff that grows, rises at a constant speed and shrinks away in 8 fps steps
    smoke(x, y, z, o = {}) { if (puffs.length >= PUFFS) puffs.shift(); puffs.push({ x, y, z, r: o.r || 22, life: o.life || 1.4, age: 0, color: o.color || '#6e6862', rise: o.rise == null ? 36 : o.rise, grow: o.grow || 1.8 }); },
    // spark(x, y, z, { n }): a few small bright bits (puffs that live a quarter second)
    spark(x, y, z, o = {}) { for (let i = 0; i < (o.n || 3); i++) puffs.length < PUFFS && puffs.push({ x: x + (i - 1) * 7, y: y + ((i * 5) % 9), z, r: 6, life: 0.28, age: 0, color: i % 2 ? '#ffd23f' : '#ff8c42', rise: 0, grow: 0.4, vx: (i - 1) * 60, vy: 40 + i * 20 }); },
    // splash(x, y, size): a ring on the water (water.js splashAt; x, y = the 3D point, the ring is drawn on the surface)
    splash(x, y, size) { if (world && world.splashAt) world.splashAt(x, -y, size, 40); },
  };
  const stepPuffs = (dt) => {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.age += dt;
      if (p.age >= p.life) { puffs.splice(i, 1); continue; }
      p.y += (p.rise + (p.vy || 0) * (1 - p.age / p.life)) * dt;
      if (p.vx) p.x += p.vx * dt;
    }
    let n = 0;
    for (const p of puffs) {
      const k = Math.floor((p.age / p.life) * 8) / 8; // (8 fps steps)
      const r = p.r * (1 + p.grow * k) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
      if (r <= 0.5) continue;
      _M.compose(_P.set(p.x, p.y, p.z), _Q.identity(), _S.set(r, r, r));
      puffMesh.setMatrixAt(n, _M);
      puffMesh.setColorAt(n, _C.set(p.color));
      n++;
    }
    puffMesh.count = n;
    puffMesh.instanceMatrix.needsUpdate = true;
    if (puffMesh.instanceColor) puffMesh.instanceColor.needsUpdate = true;
  };

  // ---- the physics, loaded lazily the first time wreckage appears (or by D.warm() earlier) --------------------------------------------------------------------------------------
  const applyChunk = (op, key, map, ci, cj) => {
    if (!physics) return;
    if (op === 'remove') { physics.setTerrain(key, null); return; }
    physics.setTerrain(key, chunkWalls(map, ci, cj, K().TERRAIN_Z));
  };
  if (terrain) {
    terrain.onChunk = (op, key, map, ci, cj) => {
      if (op === 'add') lastChunks.set(key, { map, ci, cj }); else lastChunks.delete(key);
      if (awake) applyChunk(op, key, map, ci, cj);
    };
    for (const c of terrain.chunkList()) lastChunks.set(c.key, { map: c.map, ci: c.ci, cj: c.cj });
  }
  const wake = () => {
    if (awake || !physics) return;
    awake = true;
    for (const [key, c] of lastChunks) applyChunk('add', key, c.map, c.ci, c.cj);
  };
  const sleep = () => {
    if (!awake || !physics) return;
    awake = false;
    for (const key of lastChunks.keys()) physics.setTerrain(key, null);
    for (const id of [...shipIds]) physics.removeShip(id);
    shipIds.clear();
  };
  const shipIds = new Set();
  const load = () => {
    if (physics || loading || failed) return;
    loading = true;
    const t0 = performance.now();
    loadRapier().then((R) => {
      physics = createPhysics(R);
      physics.warmup();
      physics.events.splash = (x, y, size, speed) => { if (speed > K().SPLASH_SPEED) hooks.splash(x, y, size); };
      physics.events.bump = (x, y, strength, mat) => { hooks.spark(x, y, 40, { n: mat === 'iron' ? 4 : 2 }); if (strength > 160) hooks.smoke(x, y, 40, { r: 16, life: 0.9, color: '#8a7f72', rise: 20 }); };
      stats.loadMs = performance.now() - t0;
      loading = false;
      for (const p of pieces) if (!p.id) toBody(p); // (pieces made while it loaded fall by hand until now)
      if (pieces.length || chunks.length) wake();
    }).catch((e) => { failed = true; loading = false; console.warn('wreckage physics', e); });
  };

  // ---- the ships as kinematic compounds -----------------------------------------------------------------------------------------------------------------------------------------
  const shapes = new Map(); // ship id -> her compound (rebuilt when her layout changes)
  const _pos = new THREE.Vector3(), _quat = new THREE.Quaternion(), _scl = new THREE.Vector3();
  const shapeOf = (sh, model) => {
    const L = sh.layout, pv = model.pv, hz = Math.max(60, model.W * 0.9), boxes = [], caps = [];
    for (const r of L.hitRects || []) boxes.push({ cx: (r.x0 + r.x1) / 2 - pv, cy: -(r.y0 + r.y1) / 2, cz: 0, hx: (r.x1 - r.x0) / 2, hy: (r.y1 - r.y0) / 2, hz });
    for (const b of L.gasbags || []) { const r = b.ry * 0.96, hl = Math.max(0, b.rx - r); caps.push({ cx: b.cx - pv, cy: -b.cy, cz: 0, r, hl }); }
    return { version: L.version, boxes, caps };
  };
  const syncShips = () => {
    state.ships.forEach((sh, index) => {
      const e = models.get(sh.id);
      if (!e) return;
      const model = e.model;
      model.content.matrixWorld.decompose(_pos, _quat, _scl); // (syncShips updated the ship's matrices this frame)
      const pose = { x: _pos.x, y: _pos.y, z: _pos.z, qx: _quat.x, qy: _quat.y, qz: _quat.z, qw: _quat.w };
      let shape = shapes.get(sh.id);
      if (!shape || shape.version !== sh.layout.version) shapes.set(sh.id, (shape = shapeOf(sh, model)));
      physics.setShip(sh.id, index, shape, pose);
      shipIds.add(sh.id);
    });
  };

  // ---- one piece of debris ---------------------------------------------------------------------------------------------------------------------------------------------------------
  // p = { holder, inner, entry (the 2D debris twin), boxes, rel, mat, size, vel: [x, y], spin, id (physics handle), age, life, smokeT, rng, fake: ballistic state }
  const toBody = (p) => {
    if (!physics || p.id) return;
    const h = p.holder;
    const id = physics.addDebris({ shipIndex: p.shipIndex, pos: [h.position.x, h.position.y, h.position.z], quat: [h.quaternion.x, h.quaternion.y, h.quaternion.z, h.quaternion.w], vel: p.vel, ang: [0, 0, p.spin], boxes: p.boxes, rel: p.rel, mat: p.mat, kind: p.kind || 'piece', delay: p.kind === 'chunk' ? 0 : K().OWN_DELAY });
    if (id) p.id = id; else p.drop = true;
  };
  // gather the 3D look and the physics boxes of the piece, and add it to the scene
  const makePiece = (sh, model, ev, i, keys, entry, inSync) => {
    const plan = ev.plan, pc = plan.pieces[i], box = pc.box, pv = model.pv, W = model.W;
    const inner = new THREE.Group(), holder = new THREE.Group();
    const lostSet = new Set(ev.lostKeys);
    const items = []; // { kind, vol } for the weight of the piece
    let meshes = 0;
    if (inSync) {
      for (const key of keys) {
        const g = model.extractPart(key), meta = model.parts.get(key);
        if (g.children.length) { inner.add(g); meshes++; }
        for (const d of (meta && meta.dyn) || []) { // the moving bits (barrels, props, lamps, hatch leaves, the bag's group): lifted out of the ship, their lights left behind
          const node = d.node;
          if (!node) continue;
          const lights = [];
          node.traverse((o) => { if (o.isLight) lights.push(o); });
          for (const l of lights) { if (l.target) l.target.removeFromParent(); l.removeFromParent(); }
          node.removeFromParent();
          inner.add(node);
          meshes++;
        }
        const b = meta && meta.bounds;
        items.push({ kind: meta ? meta.kind : 'deck', vol: b ? Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)) : 2000 });
      }
      if (!pc.ellipse) { // the hull, deck and room walls inside the hole
        const skin = [...model.parts.values()].filter((q) => SKIN_KINDS.includes(q.kind) && !lostSet.has(q.key)).map((q) => q.key);
        const rects = pc.clips.map((c) => ({ x0: c.x0 - pv, x1: c.x1 - pv, y0: -c.y1, y1: -c.y0 }));
        const g = model.assembled.extractClip(skin, rects);
        if (g.children.length) { inner.add(g); meshes++; }
        items.push({ kind: 'deck', vol: Math.max(1, (box.x1 - box.x0) * (box.y1 - box.y0)) * 0.6 });
      }
    }
    if (!meshes) { // (the model was already newer than the note, or nothing came out: a plain plank slab the size of the hole)
      const m = pairFor('#b98a5a');
      const slab = styled(new THREE.Mesh(G.box, m.toon), m.toon, m.plain);
      slab.scale.set(box.x1 - box.x0, box.y1 - box.y0, W * 0.8);
      slab.position.set((box.x0 + box.x1) / 2 - pv, -(box.y0 + box.y1) / 2, 0);
      const ink = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
      ink.userData.isOutline = true;
      ink.scale.copy(slab.scale).addScalar(10);
      ink.position.copy(slab.position);
      inner.add(slab, ink);
      items.push({ kind: 'deck', vol: 1 });
      stats.fallback++;
    }
    // where the piece stands: its middle, in the model's frame, then in the world
    const cx = (box.x0 + box.x1) / 2 - pv, cy = -(box.y0 + box.y1) / 2;
    inner.position.set(-cx, -cy, 0);
    holder.add(inner);
    model.content.updateMatrixWorld(true);
    _M.copy(model.content.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(cx, cy, 0)).decompose(holder.position, holder.quaternion, _scl);
    holder.scale.set(1, 1, 1);
    group.add(holder);
    applyLook(holder);
    // the weight of it, by what it is made of
    let wsum = 0, rsum = 0, iron = 0, canvas = 0;
    for (const it of items) {
      const rel = IRON_KINDS.has(it.kind) ? K().REL.iron : CANVAS_KINDS.has(it.kind) ? K().REL.canvas : K().REL.wood;
      wsum += it.vol; rsum += it.vol * rel;
      if (IRON_KINDS.has(it.kind)) iron += it.vol; else if (CANVAS_KINDS.has(it.kind)) canvas += it.vol;
    }
    const mat = iron > wsum * 0.5 ? 'iron' : canvas > wsum * 0.5 ? 'canvas' : 'wood';
    const rel = wsum ? rsum / wsum : K().REL.wood;
    // the physics boxes: the clips (the real shape of what was cut), a bag as one fat box, at most 8
    const raw = pc.ellipse ? [{ x0: pc.ellipse.cx - pc.ellipse.rx * 0.92, y0: pc.ellipse.cy - pc.ellipse.ry * 0.7, x1: pc.ellipse.cx + pc.ellipse.rx * 0.92, y1: pc.ellipse.cy + pc.ellipse.ry * 0.7 }] : pc.clips.slice(0, 8);
    const hz = Math.max(40, W * 0.8);
    const boxes = raw.map((c) => ({ cx: (c.x0 + c.x1) / 2 - pv - cx, cy: -(c.y0 + c.y1) / 2 - cy, cz: 0, hx: Math.max(6, (c.x1 - c.x0) / 2 - 2), hy: Math.max(6, (c.y1 - c.y0) / 2 - 2), hz }));
    // velocity and spin: the 2D twin's, plus the kick away from the blast
    const p = sh.pose;
    let vx = entry ? entry.vx : p.vx, vy = entry ? entry.vy : p.vy, spin = entry ? entry.spin : 0;
    const ox = ev.origin.x, oy = ev.origin.y;
    let dx = (box.x0 + box.x1) / 2 - ox, dy = (box.y0 + box.y1) / 2 - oy;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    const kick = K().KICK * (ev.blast ? 1 : 0.3);
    vx += dx * p.f * kick;
    vy += dy * kick - (ev.blast ? 60 : 0);
    const piece = {
      kind: 'piece', holder, inner, entry, boxes, rel, mat, size: Math.hypot(box.x1 - box.x0, box.y1 - box.y0), vel: [vx, -vy], spin: -spin, id: 0, age: 0, life: entry ? entry.life : config.BREAKOFF.DEBRIS.LIFE,
      burn: !!(entry && entry.burn), shipIndex: state.ships.indexOf(sh), smokeT: 0, rng: mulberry(hashStr(sh.id + ':' + ev.t + ':' + i)), gone: -1, fake: { vx, vy: -vy, rz: 0 },
      baseQuat: holder.quaternion.clone(), shipId: sh.id,
    };
    pieces.push(piece);
    stats.pieces++;
    if (physics) toBody(piece);
    return piece;
  };

  // plank and iron chunks thrown by a blast: little bodies of their own (not pieces: they have no 2D twin and live CHUNKS.LIFE seconds)
  const chunkMats = { wood: pairFor('#b98a5a'), dark: pairFor('#6b4a32'), iron: pairFor('#5a5558') };
  const chunkInk = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  const scatter = (sh, model, ev, rng, centre) => {
    const C = K().CHUNKS;
    const n = C.MIN + Math.floor(rng() * (C.MAX - C.MIN + 1));
    for (let k = 0; k < n && chunks.length < C.CAP; k++) {
      const ang = rng() * Math.PI * 2, spd = C.SPEED * (0.35 + rng() * 0.75);
      const sx = C.SIZE_MIN + rng() * (C.SIZE_MAX - C.SIZE_MIN), sy = (rng() < 0.5 ? 0.25 : 0.7) * sx, sz = sx * 0.5;
      const kind = rng() < 0.3 ? 'iron' : rng() < 0.5 ? 'wood' : 'dark', pair = chunkMats[kind];
      const holder = new THREE.Group();
      const m = styled(new THREE.Mesh(G.box, pair.toon), pair.toon, pair.plain);
      m.scale.set(sx, sy, sz);
      const ink = new THREE.Mesh(G.box, chunkInk);
      ink.userData.isOutline = true;
      ink.scale.set(sx + 6, sy + 6, sz + 6);
      holder.add(m, ink);
      holder.position.set(centre.x + (rng() - 0.5) * 120, centre.y + (rng() - 0.5) * 80, 0);
      holder.quaternion.setFromEuler(new THREE.Euler(0, 0, rng() * Math.PI * 2));
      group.add(holder);
      applyLook(holder);
      const piece = {
        kind: 'chunk', holder, entry: null, boxes: [{ cx: 0, cy: 0, cz: 0, hx: sx / 2, hy: sy / 2, hz: sz / 2 }], rel: kind === 'iron' ? K().REL.iron : K().REL.wood, mat: kind === 'iron' ? 'iron' : 'wood', size: sx, vel: [Math.cos(ang) * spd + sh.pose.vx, Math.sin(ang) * spd * 0.8 + 120],
        spin: (rng() - 0.5) * 9, id: 0, age: 0, life: C.LIFE * (0.7 + rng() * 0.6), burn: false, shipIndex: -1, smokeT: 0, rng, gone: -1, fake: null, baseQuat: holder.quaternion.clone(), shipId: sh.id,
      };
      piece.fake = { vx: piece.vel[0], vy: piece.vel[1], rz: 0 };
      chunks.push(piece);
      pieces.push(piece);
      stats.chunks++;
      if (physics) toBody(piece);
    }
  };

  // ---- a break-off note, read before the model is rebuilt ---------------------------------------------------------------------------------------------------------------------------
  const take = (sh, ev) => {
    stats.events++;
    const t0 = performance.now();
    const e = models.get(sh.id), model = e && e.model;
    if (!model) return;
    const inSync = e.ver === ev.ver;
    const plan = ev.plan;
    // which lost part belongs to which piece: the piece whose box holds (or is nearest) the part's middle
    const keysBy = plan.pieces.map(() => []);
    for (const r of ev.lostRects) {
      if (!model.parts.has(r.id)) continue;
      const mx = (r.x0 + r.x1) / 2, my = (r.y0 + r.y1) / 2;
      let best = 0, bd = Infinity;
      plan.pieces.forEach((pc, i) => {
        const b = pc.box, dx = mx < b.x0 ? b.x0 - mx : mx > b.x1 ? mx - b.x1 : 0, dy = my < b.y0 ? b.y0 - my : my > b.y1 ? my - b.y1 : 0, d = Math.hypot(dx, dy);
        if (d < bd) { bd = d; best = i; }
      });
      keysBy[best].push(r.id);
    }
    const rng = mulberry(hashStr(sh.id + ':' + ev.t));
    plan.pieces.forEach((pc, i) => {
      const entry = (state.debris || []).find((d) => d.ship === sh && d.box === pc.box) || null;
      makePiece(sh, model, ev, i, keysBy[i], entry, inSync);
    });
    // the first frame of smoke at each piece, and (for a blast) the chunks and a flash of sparks at the centre
    const ctr = (() => { const c = model.content, v = new THREE.Vector3(ev.origin.x - model.pv, -ev.origin.y, 0); return c.localToWorld(v); })();
    if (ev.blast) {
      scatter(sh, model, ev, rng, ctr);
      for (let k = 0; k < 10; k++) hooks.smoke(ctr.x + (rng() - 0.5) * 220, ctr.y + (rng() - 0.5) * 140, 60, { r: 20 + rng() * 16, life: 1.5, grow: 1.4, color: k % 3 ? '#4a4540' : '#d9622b', rise: 50 });
    } else {
      for (let k = 0; k < 4; k++) hooks.smoke(ctr.x + (rng() - 0.5) * 120, ctr.y + (rng() - 0.5) * 80, 60, { r: 22, life: 1.2, color: '#6e6862', rise: 40 });
    }
    hooks.spark(ctr.x, ctr.y, 60, { n: 5 });
    load();
    if (physics) wake();
    stats.lastExtractMs = performance.now() - t0;
  };

  // ---- the frame ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const D = {
    group, hooks, stats, pieces, chunks,
    get physics() { return physics; },
    get ready() { return !!physics; },
    get failed() { return failed; },
    warm: load, // (index.js starts the engine a moment after the view starts)
    // Read the notes of every ship. Call BEFORE the ship models are rebuilt for the new layouts.
    process() {
      for (const sh of state.ships) {
        const q = sh.ctx && sh.ctx.breakEvents;
        if (!q || !q.length) continue;
        while (q.length) {
          const ev = q.shift();
          try { take(sh, ev); } catch (err) { console.warn('wreckage', err); }
        }
      }
    },
    setSea(seaY) { sea = seaY; },
    // WP8: a body somebody else made (the Kraken's severed limbs, view3d/creature.js). spec = { holder (a Group at the body's start pose, its mesh inside), boxes (the physics boxes in the body's
    // frame, y up), rel (density against water: about 0.9 floats), mat, size, vel: [x, y], spin, life (s) }. It falls, bounces, splashes and floats like a chunk; returns the piece (pass it to
    // removeExternal), or null when the cap is full. The holder's geometry is disposed when it goes.
    addExternal(spec) {
      if (chunks.length >= K().CHUNKS.CAP) return null;
      const holder = spec.holder;
      group.add(holder);
      const piece = { kind: 'chunk', holder, entry: null, boxes: spec.boxes, rel: spec.rel || 0.9, mat: spec.mat || 'wood', size: spec.size || 100, vel: spec.vel, spin: spec.spin || 0, id: 0, age: 0, life: spec.life || 4, burn: false, shipIndex: -1, smokeT: 0, rng: mulberry(7), gone: -1, fake: { vx: spec.vel[0], vy: spec.vel[1], rz: 0 }, baseQuat: holder.quaternion.clone(), shipId: null, external: true };
      chunks.push(piece);
      pieces.push(piece);
      stats.chunks++;
      load();
      if (physics) toBody(piece);
      return piece;
    },
    removeExternal(piece) { const i = pieces.indexOf(piece); if (i >= 0) removePiece(i); },
    // dt = seconds of this frame. Steps the physics (the ships' hulls put where the models are), moves every piece's mesh, smokes, fades and removes what is done.
    update(dt) {
      if (!pieces.length && !puffs.length) { if (awake && (idleFor += dt) > 5) sleep(); return; }
      idleFor = 0;
      if (physics && pieces.length) {
        if (!awake) wake();
        physics.setSea(Number.isFinite(sea) ? -sea : NaN);
        syncShips();
        const t0 = performance.now();
        physics.step(dt);
        const ms = performance.now() - t0;
        stats.stepMs = ms; if (ms > stats.maxStepMs) stats.maxStepMs = ms;
        stats.bodies = physics.bodies;
      }
      const G_ = config.BREAKOFF.DEBRIS.GRAVITY, rd = {};
      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i];
        p.age += dt;
        // how much of its life is left: a piece follows its 2D twin (when that is gone the piece goes), a chunk its own clock
        let left;
        if (p.kind === 'piece' && p.entry) {
          const alive = state.debris && state.debris.includes(p.entry);
          if (!alive && p.gone < 0) p.gone = p.age;
          left = alive ? p.entry.life - p.entry.t : Math.max(0, K().FADE - (p.age - p.gone));
        } else left = p.life - p.age;
        if (inRock && p.age > 0.3) { // buried: its middle has been inside the rock for a while
          const h = p.holder.position;
          p.buried = inRock(state, h.x, -h.y) ? (p.buried || 0) + dt : 0;
          if (p.buried > K().BURY) p.drop = true;
        }
        if (left <= 0 || p.drop) { removePiece(i); continue; }
        if (p.id && physics && physics.read(p.id, rd)) {
          p.holder.position.set(rd.x, rd.y, rd.z);
          p.holder.quaternion.set(rd.qx, rd.qy, rd.qz, rd.qw);
          p.wet = rd.wet;
        } else if (!p.id) { // (physics not here yet, or it failed: fall on the 2D debris's path)
          const f = p.fake;
          f.vy -= G_ * dt;
          p.holder.position.x += f.vx * dt; p.holder.position.y += f.vy * dt;
          f.rz += p.spin * dt;
          p.holder.quaternion.copy(p.baseQuat).multiply(_Q.setFromAxisAngle(_S.set(0, 0, 1), f.rz));
          if (!p.id && physics && !p.drop) toBody(p);
        }
        const fade = left < K().FADE ? clamp(left / K().FADE, 0, 1) : 1;
        const s = fade * fade * (3 - 2 * fade);
        p.holder.scale.set(s, s, s);
        // smoke: a puff now and then from a piece (more from a bigger, burning one), a dust-grey one from a chunk
        if (p.kind === 'piece') {
          p.smokeT -= dt;
          if (p.smokeT <= 0) {
            p.smokeT = (p.burn ? 0.11 : 0.2) + p.rng() * 0.1;
            const h = p.holder.position;
            hooks.smoke(h.x + (p.rng() - 0.5) * p.size * 0.4, h.y + (p.rng() - 0.5) * p.size * 0.25, 50, { r: 8 + p.size * 0.03, life: 1.1, grow: 1.2, color: p.burn ? '#403a36' : '#85796d', rise: 32 });
            if (p.burn && p.rng() < 0.6) hooks.spark(h.x, h.y, 50, { n: 2 });
          }
        }
      }
      stepPuffs(dt);
    },
    // forget everything (a new run, the view is dropped)
    clear() {
      for (let i = pieces.length - 1; i >= 0; i--) removePiece(i);
      puffs.length = 0;
      stepPuffs(0);
      if (physics) { physics.clear(); }
    },
    dispose() { D.clear(); if (terrain) terrain.onChunk = null; if (physics) physics.dispose(); parent.remove(group); },
  };
  function removePiece(i) {
    const p = pieces[i];
    pieces.splice(i, 1);
    if (p.kind === 'chunk') { const c = chunks.indexOf(p); if (c >= 0) chunks.splice(c, 1); }
    if (p.id && physics) physics.remove(p.id);
    p.holder.removeFromParent();
    p.holder.traverse((o) => { if (o.geometry && o.geometry !== G.box && o.geometry !== puffGeo) o.geometry.dispose(); });
  }
  void renderer;
  return D;
}
