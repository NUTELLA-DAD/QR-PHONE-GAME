// THE WRECKAGE WORLD (3D.md section 3, WP5): a small Rapier physics world that lives in the TV's 3D view and only makes the broken-off parts look real. The game's own 2D simulation stays in
// charge of everything that counts (where the ships are, what hits what, who is hurt): nothing here is ever read back by it. Plain numbers in and out (no Three.js), so tools/physics-check.mjs can
// run exactly the same code in Node.
//
//   loadRapier()                       the bundled engine (vendor/rapier, WASM inlined), loaded once and only when asked
//   createPhysics(R)                   a world: gravity = the 2D debris gravity (config.BREAKOFF.DEBRIS.GRAVITY, px/s^2: the world is in game pixels), a fixed 60 Hz step
//     .setTerrain(key, mesh | null)    a chunk of rock as a trimesh { vertices, indices } (terrain.js chunkWalls); null removes it
//     .setShip(id, index, shape, pose) a ship as a KINEMATIC compound of boxes and capsules (hitRects and the gasbags) put where the model is each frame; debris bounces off the hull it left
//     .addDebris(spec)                 one dynamic body (a compound of boxes) -> handle; capped at DEBRIS.MAX pieces plus PHYS.CHUNKS.CAP little chunks
//     .setSea(y | NaN)                 the water level (3D y): a half-space with BUOYANCY done in code (wood floats, iron sinks)
//     .step(dt)                        accumulate real time, run fixed steps (none while no body exists)
//     .read(handle, out)               position / rotation / velocity of a body
//     .hash()                          a number over every body's position and rotation: the determinism check compares two runs
// Everything is deterministic: the engine is the deterministic build, bodies are made in the order the caller adds them (by ship id, then piece index), no Math.random in here.
import { config } from '../../config.js';

let rapierPromise = null;
export function loadRapier() {
  if (!rapierPromise) rapierPromise = import('../../vendor/rapier/rapier.mjs').then(async (m) => { const R = m.default; await R.init(); return R; });
  return rapierPromise;
}

// Collision groups (membership << 16 | filter). Debris touches the rock and the ships (its own ship only after PHYS.OWN_DELAY), never other debris: no pile-up jitter, and cheap.
export const GROUP = { TERRAIN: 0x0001, DEBRIS: 0x8000, SHIPS: 0x7ffe, ship: (i) => 1 << (1 + (i % 14)) };
const pack = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const PHYS = () => config.BREAKOFF.PHYS;

export function createPhysics(R) {
  const K = PHYS(), D = () => config.BREAKOFF.DEBRIS;
  const world = new R.World({ x: 0, y: -D().GRAVITY, z: 0 });
  world.timestep = K.STEP;
  world.integrationParameters.lengthUnit = K.LENGTH_UNIT;
  const flags = R.TriMeshFlags && R.TriMeshFlags.FIX_INTERNAL_EDGES;
  const terrain = new Map(); // key -> { body, collider }
  const ships = new Map(); // id -> { index, body, colliders, version, from, to }
  const debris = []; // { id, body, colliders, mass, halfH, rel, mat, age, own, ownBit, wet, pv, kind }
  let acc = 0, seaY = NaN, nextId = 1, tickNo = 0;
  const events = { splash: null, bump: null }; // callbacks: splash(x, y, size, speed), bump(x, y, strength, mat)
  const stats = { steps: 0, lastMs: 0, maxMs: 0, totalMs: 0, bodies: 0, colliders: 0 };

  const P = {
    R, world, stats, events, get bodies() { return debris.length; },
    get terrainCount() { return terrain.size; },
    get shipCount() { return ships.size; },
    setSea(y) { seaY = Number.isFinite(y) ? y : NaN; },
    get seaY() { return seaY; },

    // ---- the rock ----------------------------------------------------------------------------------------------------------------------------------------------
    setTerrain(key, mesh) {
      const old = terrain.get(key);
      if (old) { world.removeRigidBody(old.body); terrain.delete(key); }
      if (!mesh || !mesh.indices.length) return false;
      const body = world.createRigidBody(R.RigidBodyDesc.fixed());
      const desc = flags != null ? R.ColliderDesc.trimesh(mesh.vertices, mesh.indices, flags) : R.ColliderDesc.trimesh(mesh.vertices, mesh.indices);
      desc.setFriction(K.FRICTION).setRestitution(K.RESTITUTION).setCollisionGroups(pack(GROUP.TERRAIN, GROUP.DEBRIS));
      const collider = world.createCollider(desc, body);
      terrain.set(key, { body, collider });
      return true;
    },

    // ---- a ship: a kinematic compound of the boxes she can be hit on (shape = { version, boxes: [{ cx, cy, cz, hx, hy, hz }], caps: [{ cx, cy, cz, r, hl }] } in the model's frame, pose = { x, y, z, qx, qy, qz, qw }) ----
    setShip(id, index, shape, pose) {
      let s = ships.get(id);
      if (!s) {
        const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pose.x, pose.y, pose.z).setRotation({ x: pose.qx, y: pose.qy, z: pose.qz, w: pose.qw }));
        s = { index, body, colliders: [], version: null, from: { ...pose }, to: { ...pose } };
        ships.set(id, s);
      }
      if (shape && s.version !== shape.version) {
        for (const c of s.colliders) world.removeCollider(c, false);
        s.colliders = [];
        const grp = pack(GROUP.ship(index), GROUP.DEBRIS);
        for (const b of shape.boxes) s.colliders.push(world.createCollider(R.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.cx, b.cy, b.cz).setFriction(K.FRICTION).setRestitution(K.RESTITUTION * 0.6).setCollisionGroups(grp), s.body));
        for (const c of shape.caps) { // (a gasbag: a capsule lying along x)
          const q = { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 };
          s.colliders.push(world.createCollider(R.ColliderDesc.capsule(c.hl, c.r).setTranslation(c.cx, c.cy, c.cz).setRotation(q).setFriction(K.FRICTION).setRestitution(K.RESTITUTION * 0.6).setCollisionGroups(grp), s.body));
        }
        s.version = shape.version;
      }
      s.from = s.stepped ? { ...s.to } : { ...pose }; // (the body is where the last step left it; with no steps since, it simply is at the new pose)
      s.to = { ...pose };
      s.stepped = false;
    },
    removeShip(id) { const s = ships.get(id); if (s) { world.removeRigidBody(s.body); ships.delete(id); } },
    hasShip(id) { return ships.has(id); },

    // ---- debris: spec = { shipIndex, pos: [x, y, z], quat: [x, y, z, w], vel, ang, boxes: [{ cx, cy, cz, hx, hy, hz }], rel (density against water), mat ('wood' | 'iron' | 'canvas'), kind ('piece' | 'chunk'), delay } ----
    addDebris(spec) {
      const pieces = debris.filter((d) => d.kind === 'piece').length, chunks = debris.length - pieces;
      if (spec.kind === 'chunk' ? chunks >= K.CHUNKS.CAP : pieces >= D().MAX) return null;
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic()
        .setTranslation(spec.pos[0], spec.pos[1], spec.pos[2]).setRotation({ x: spec.quat[0], y: spec.quat[1], z: spec.quat[2], w: spec.quat[3] })
        .setLinvel(spec.vel[0], spec.vel[1], 0).setAngvel({ x: spec.ang[0], y: spec.ang[1], z: spec.ang[2] })
        .enabledTranslations(true, true, false) // (the wreckage stays in the gameplay plane: it is where the 2D game says the piece is)
        .setAdditionalMassProperties(1e-4, { x: 0, y: 0, z: 0 }, { x: K.TILT_INERTIA, y: K.TILT_INERTIA, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }) // (...and it turns about the camera axis: a huge extra inertia about the other two keeps it from leaning out of the cut-away. Locking those axes outright would switch friction off in Rapier)
        .setLinearDamping(K.LINEAR_DAMP).setAngularDamping(K.ANGULAR_DAMP).setCcdEnabled(true));
      const rel = spec.rel > 0 ? spec.rel : 0.55;
      const ownBit = spec.shipIndex != null && spec.shipIndex >= 0 ? GROUP.ship(spec.shipIndex) : 0;
      const colliders = [];
      let vol = 0, top = -1e9, bot = 1e9;
      for (const b of spec.boxes) {
        colliders.push(world.createCollider(R.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.cx, b.cy, b.cz).setDensity(rel * K.DENSITY_SCALE).setFriction(K.FRICTION).setRestitution(K.RESTITUTION)
          .setCollisionGroups(pack(GROUP.DEBRIS, GROUP.TERRAIN | (GROUP.SHIPS & ~(spec.delay > 0 ? ownBit : 0)))), body));
        vol += 8 * b.hx * b.hy * b.hz;
        top = Math.max(top, b.cy + b.hy); bot = Math.min(bot, b.cy - b.hy);
      }
      const d = { id: nextId++, body, colliders, boxes: spec.boxes, rel, mat: spec.mat || 'wood', kind: spec.kind || 'piece', age: 0, delay: spec.delay || 0, ownBit, mass: body.mass(), vol, halfH: Math.max(8, (top - bot) / 2), wet: false, pv: { x: spec.vel[0], y: spec.vel[1] }, size: Math.cbrt(vol) };
      debris.push(d);
      return d.id;
    },
    remove(id) {
      const i = debris.findIndex((d) => d.id === id);
      if (i < 0) return false;
      world.removeRigidBody(debris[i].body);
      debris.splice(i, 1);
      return true;
    },
    has(id) { return debris.some((d) => d.id === id); },
    clear() { for (const d of debris) world.removeRigidBody(d.body); debris.length = 0; },
    // out = { x, y, z, qx, qy, qz, qw, vx, vy, wet, rest }
    read(id, out = {}) {
      const d = debris.find((q) => q.id === id);
      if (!d) return null;
      const t = d.body.translation(), r = d.body.rotation(), v = d.body.linvel();
      out.x = t.x; out.y = t.y; out.z = t.z; out.qx = r.x; out.qy = r.y; out.qz = r.z; out.qw = r.w; out.vx = v.x; out.vy = v.y; out.wet = d.wet; out.rest = d.body.isSleeping();
      return out;
    },

    // ---- time --------------------------------------------------------------------------------------------------------------------------------------------------
    step(dt) {
      if (!debris.length) { acc = 0; return 0; } // (stepped only while bodies exist)
      acc = Math.min(acc + dt, K.STEP * K.MAX_STEPS);
      const n = Math.floor(acc / K.STEP + 1e-6);
      if (!n) return 0;
      acc -= n * K.STEP;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
      for (let k = 1; k <= n; k++) {
        const f = k / n;
        for (const s of ships.values()) { // (the kinematic ships move to where the model is, in even steps over the frame)
          const a = s.from, b = s.to;
          s.body.setNextKinematicTranslation({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
          let dot = a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw;
          const sg = dot < 0 ? -1 : 1;
          let qx = a.qx + (sg * b.qx - a.qx) * f, qy = a.qy + (sg * b.qy - a.qy) * f, qz = a.qz + (sg * b.qz - a.qz) * f, qw = a.qw + (sg * b.qw - a.qw) * f;
          const l = Math.hypot(qx, qy, qz, qw) || 1;
          s.body.setNextKinematicRotation({ x: qx / l, y: qy / l, z: qz / l, w: qw / l });
        }
        this._forces(K.STEP);
        world.step();
        tickNo++;
        stats.steps++;
      }
      for (const s of ships.values()) s.stepped = true;
      if (typeof performance !== 'undefined') { const ms = performance.now() - t0; stats.lastMs = ms; stats.totalMs += ms; if (ms > stats.maxMs) stats.maxMs = ms; }
      stats.bodies = debris.length;
      this._events();
      return n;
    },
    // buoyancy and water drag, by hand: the water is a level, not a collider. Archimedes: the push is the weight of the water the submerged share pushes aside, = weight / rel * share.
    _forces(dt) {
      const g = D().GRAVITY;
      for (const d of debris) {
        d.age += dt;
        if (d.delay > 0 && d.age >= d.delay && (d.age >= d.delay + K.OWN_WAIT || !this._overlapsOwn(d))) { // (the ship the piece came off is solid to it from now on, once it has cleared her)
          d.delay = 0;
          for (const c of d.colliders) c.setCollisionGroups(pack(GROUP.DEBRIS, GROUP.TERRAIN | GROUP.SHIPS));
        }
        if (!Number.isFinite(seaY)) continue;
        const t = d.body.translation();
        const sub = Math.max(0, Math.min(1, (seaY - (t.y - d.halfH)) / (2 * d.halfH)));
        if (sub > 0) {
          d.body.applyImpulse({ x: 0, y: (d.mass * g * (1 / d.rel) * sub) * dt, z: 0 }, true);
          d.body.setLinearDamping(K.LINEAR_DAMP + K.WATER_LIN * sub);
          d.body.setAngularDamping(K.ANGULAR_DAMP + K.WATER_ANG * sub);
          if (!d.wet) { d.wet = true; if (events.splash) { const v = d.body.linvel(); events.splash(t.x, t.y, Math.min(260, 70 + d.size * 0.9), Math.hypot(v.x, v.y)); } }
        } else if (d.wet && t.y - d.halfH > seaY + 6) {
          d.wet = false;
          d.body.setLinearDamping(K.LINEAR_DAMP);
          d.body.setAngularDamping(K.ANGULAR_DAMP);
        }
      }
    },
    // is any box of the piece still inside the hull it came off? (a piece that starts inside her outline must be free of her before she turns solid to it, or it is shoved about inside her)
    _overlapsOwn(d) {
      const t = d.body.translation(), q = d.body.rotation(), groups = pack(GROUP.DEBRIS, d.ownBit);
      for (const b of d.boxes) {
        // the box's middle in the world: the body's position + its rotation applied to the offset
        const ux = q.y * b.cz - q.z * b.cy, uy = q.z * b.cx - q.x * b.cz, uz = q.x * b.cy - q.y * b.cx;
        const vx = q.y * uz - q.z * uy, vy = q.z * ux - q.x * uz, vz = q.x * uy - q.y * ux;
        const pos = { x: t.x + b.cx + 2 * (q.w * ux + vx), y: t.y + b.cy + 2 * (q.w * uy + vy), z: t.z + b.cz + 2 * (q.w * uz + vz) };
        if (world.intersectionWithShape(pos, q, new R.Cuboid(b.hx, b.hy, b.hz), undefined, groups)) return true;
      }
      return false;
    },
    // a sudden change of velocity = a knock (rock, hull): the caller puffs dust and sparks there
    _events() {
      for (const d of debris) {
        const v = d.body.linvel(), dvx = v.x - d.pv.x, dvy = v.y - d.pv.y;
        d.pv.x = v.x; d.pv.y = v.y;
        if (events.bump && !d.wet) { const dv = Math.hypot(dvx, dvy); if (dv > K.BUMP_SPEED && d.age > 0.1) { const t = d.body.translation(); events.bump(t.x, t.y, dv, d.mat); } }
      }
    },

    // The very first step of a world costs about 30 ms (the engine sets itself up on first use): spend it now, on a throwaway body, not in the frame a ship breaks.
    warmup() {
      const b = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 1e5, 0));
      world.createCollider(R.ColliderDesc.cuboid(5, 5, 5), b);
      const f = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, 1e5 - 20, 0));
      world.createCollider(R.ColliderDesc.trimesh(new Float32Array([-9, 0, -9, 9, 0, -9, 9, 0, 9]), new Uint32Array([0, 2, 1])), f);
      world.step();
      world.removeRigidBody(b);
      world.removeRigidBody(f);
    },

    hash() { // FNV-1a over the float bits of every debris body, in the order they were added
      let h = 2166136261;
      const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
      const mix = (v) => { f32[0] = v; h = Math.imul(h ^ u32[0], 16777619) >>> 0; };
      for (const d of debris) { const t = d.body.translation(), r = d.body.rotation(); mix(t.x); mix(t.y); mix(t.z); mix(r.x); mix(r.y); mix(r.z); mix(r.w); }
      return h >>> 0;
    },
    finite() { return debris.every((d) => { const t = d.body.translation(), r = d.body.rotation(); return [t.x, t.y, t.z, r.x, r.y, r.z, r.w].every(Number.isFinite); }); },
    dispose() { try { world.free(); } catch { /* (already gone) */ } },
  };
  void tickNo;
  return P;
}
