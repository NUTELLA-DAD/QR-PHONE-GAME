// Everything that flies through the sky or hangs in it, drawn in 3D from the real game state (read only): the enemy dogfighters, the Devil's own fighter, the bombers, our escort / stolen planes, bats (flying
// and latched), mines (moored and laid), bailed-out pilots under parachutes, the supply balloon, the three bosses and THE FLAGSHIP, the burning wrecks, the batteries' rockets, the specials (gyro-saws, imps, the
// sniper zeppelin, the harpoon tug), contrails and thrown cargo. The models are in enemyArt.js; this file puts them where the game says and poses them on STEPPED keys (3D.md section 1: 8 fps, held, then
// snapped; no sine of the time anywhere). Gameplay never depends on any of it: the host calls update() inside a try/catch and a failure here just leaves the sky emptier.
//   createFlyers(root, state, api) -> { update(t, refVx, { dt, zoomEq }), stats }
//   api = { shipPoint(ship, x, y, z) -> [x, y, z] (a spot on a ship, in the 3D world), P() -> the particle system or null, mainShip() }
import { THREE, INK, applyLook, glow } from './style.js';
import { config } from '../../config.js';
import { envOf } from '../host/environments.js';
import * as A from './enemyArt.js';
import { createLines } from './lines3d.js';
import { createInstanced, createLampInstances } from './swarm3d.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const PI = Math.PI;
const hashN = (n) => { let h = (Math.floor(Math.abs(n) * 977) + 7) | 0; h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return (h ^ (h >>> 16)) >>> 0; };

const PAL_STRAFER = { body: '#b9b1a0', wing: '#c9c0ac', trim: '#b0413e', dark: '#4a4440' }; // bone-white skeleton biplanes with red trim
const PAL_FRIEND = { body: '#8fb37a', wing: '#a7c392', trim: '#e8d8a8', dark: '#4a4440' }; // ours: green and cream, so they never look like an enemy
const PAL_WRECK = { body: '#4a3a32', wing: '#3a2c26', trim: '#2f2622', dark: '#26201c' };
// held-key bobs (8 fps): a mine's (+-6, 3 s a cycle) and the supply balloon's (+-30, 5 s). A table, indexed by the key number: nothing here is a sine of the time.
const SWING = (amp, n) => Array.from({ length: n }, (_, i) => Math.round(Math.sin((i / n) * Math.PI * 2) * amp * 2) / 2);
const BOB_MINE = SWING(6, 24), BOB_SUPPLY = SWING(30, 40);
const FLAG_KEYS = [[0.04, 0.14, 0.2, 0.2], [0, -0.1, -0.16, -0.1], [-0.05, 0.06, 0.15, 0.1]]; // the Flagship's pennant, rigid segments, three held poses

// state = the game's world state (read only). root = the world group the whole 3D scene hangs from.
export function createFlyers(root, stateArg, api = {}) {
  let state = stateArg; // (the game; the dev page's enemy line-up swaps in a made-up one for a frame)
  const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _C = new THREE.Color(), _E = new THREE.Euler();
  const pools = new Map();
  const lines = createLines(root, 600, { depth: true, order: 4 }); // (contrails: they hide behind the ships)
  const slots = []; // one WeakMap of accumulators per slot (an object can have more than one rate): nothing is ever written on the game's own objects
  let K = 0, T = 0, DT = 0.016, frame = 0, zoomEq = 0.5, refVxNow = 0;
  const P = () => (api.P ? api.P() : null);
  // a steady rate of particles: how many whole particles are due this frame for this object
  const due = (obj, perSec, slot = 0) => { const m = slots[slot] || (slots[slot] = new WeakMap()); const a = (m.get(obj) || 0) + perSec * DT, n = Math.floor(a); m.set(obj, a - n); return Math.min(n, 3); };

  const stats = { planes: 0, bats: 0, mines: 0, specials: 0, wrecks: 0, boss: 0 };
  const poolOf = (key) => { let p = pools.get(key); if (!p) pools.set(key, (p = [])); return p; };
  const use = (key, i, make) => {
    const arr = poolOf(key);
    while (arr.length <= i) { const o = make(); applyLook(o); root.add(o); o.visible = false; arr.push(o); }
    return arr[i];
  };
  const hideFrom = (key, n) => { const arr = pools.get(key); if (arr) for (let i = n; i < arr.length; i++) arr[i].visible = false; };
  const hideAll = () => { for (const arr of pools.values()) for (const o of arr) o.visible = false; };

  // ---- planes ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const stepProp = (mesh, k) => { const p = mesh && mesh.userData.prop; if (p) p.rotation.x = (k % 3) * (PI / 3); const ps = mesh && mesh.userData.props; if (ps) ps.forEach((q, i) => { q.rotation.x = ((k + i) % 3) * (PI / 3); }); };
  const placePlane = (g, p, flipBy = 'heading') => {
    const h = Number.isFinite(p.heading) ? p.heading : 0;
    g.visible = true;
    g.position.set(p.x, -p.y, 0);
    g.rotation.z = -h;
    const up = Math.cos(h) < 0; // flying left: roll the model over so her wheels stay down
    g.userData.inner.rotation.x = (up ? PI : 0) + clamp(fin(p.bank), -1, 1) * 0.55 * (up ? -1 : 1);
    stepProp(g.userData.mesh, K + (p.phase ? Math.floor(p.phase) : 0));
    void flipBy;
  };
  const planeShell = (mesh) => { const gr = new THREE.Group(), inner = new THREE.Group(); inner.add(mesh); gr.add(inner); gr.userData.inner = inner; gr.userData.mesh = mesh; return gr; };
  const syncPlanes = (key, list, make, max = 24, post = null) => {
    let n = 0;
    for (const p of list) {
      if (!p || p.dead > 0 || p.dead === true || !Number.isFinite(p.x) || !Number.isFinite(p.y) || n >= max) continue;
      const g = use(key, n, () => planeShell(make(p)));
      n++;
      placePlane(g, p);
      if (p.hijackScale) g.scale.setScalar(p.hijackScale);
      if (post) post(g, p);
    }
    hideFrom(key, n);
    stats.planes += n;
  };
  const contrail = (t) => { // thin white lines behind the planes, brightest where they turned hard (the sim keeps the points: planes.js trail)
    if (!t || t.length < 2) return;
    for (let i = 1; i < t.length; i++) {
      const a = Math.max(0, fin(t[i].a)) * (i / t.length) * 0.7;
      if (a < 0.04) continue;
      lines.seg(t[i - 1].x, -t[i - 1].y, t[i].x, -t[i].y, 3 + 3 * (i / t.length), '#ffffff', a, -30);
    }
  };

  // ---- bats, imps and mines: instanced copies (swarm3d.js: a flock is a handful of draw calls, not a handful for every bat) -------------------------------------------------------------------------------
  const swarms = new Map(); // key -> { sets: [instanced pair] ... }
  const swarmOf = (key, make) => { let w = swarms.get(key); if (!w) { w = make(); swarms.set(key, w); } return w; };
  const _m = new THREE.Matrix4(), _pp = new THREE.Vector3(), _qq = new THREE.Quaternion(), _ss = new THREE.Vector3(), _ee = new THREE.Euler(), _cc = new THREE.Color();
  const put = (x, y, z, rz, sc, ry = 0) => _m.compose(_pp.set(x, y, z), _qq.setFromEuler(_ee.set(0, ry, rz)), _ss.set(sc, sc, sc));
  const beginAll = (w) => w.all.forEach((q) => q.begin());
  const endAll = (w) => w.all.forEach((q) => q.end());
  const batSwarm = (color) => swarmOf('bat' + color, () => { const sets = A.buildBatPoses(color).map((g) => createInstanced(root, g, 40)); return { sets, all: sets }; });
  const impSwarm = (sd) => swarmOf('imp' + (sd ? sd.body + sd.wing : ''), () => { const sets = A.buildImpPoses(sd).map((g) => createInstanced(root, g, 48)); return { sets, all: sets }; });
  const syncBats = (list) => {
    const env = state.course ? envOf(state) : null;
    const color = env && env.bat ? env.bat.body : '#3b2c4c';
    for (const [k, w] of swarms) if (k.startsWith('bat') && k !== 'bat' + color) { beginAll(w); endAll(w); } // (another environment's bats: none now)
    const w = batSwarm(color);
    beginAll(w);
    let n = 0;
    for (const b of list) {
      if (!b || b.delay > 0 || !Number.isFinite(b.x) || !Number.isFinite(b.y) || n >= 40) continue;
      const latched = b.latched && b.landed, hang = latched && b.kind === 'gas';
      put(b.x, -b.y, 60, hang ? PI : latched ? 0 : clamp(-(fin(b.vx) - refVxNow) * 0.0004, -0.28, 0.28), 1.7); // (it tilts into its flight; a gas-bag bat hangs upside down)
      w.sets[latched ? 4 : (K + n) & 3].add(_m); // (the key picks the pose: wing up, level, down, level; folded when latched)
      n++;
    }
    endAll(w);
    stats.bats += n;
  };
  const syncImps = (list) => {
    const sd = state.course ? envOf(state).imp : null;
    for (const [k, w] of swarms) if (k.startsWith('imp') && k !== 'imp' + (sd ? sd.body + sd.wing : '')) { beginAll(w); endAll(w); }
    const w = impSwarm(sd);
    beginAll(w);
    let n = 0;
    for (const b of list) {
      if (!b || b.delay > 0 || !Number.isFinite(b.x) || !Number.isFinite(b.y) || n >= 48) continue;
      put(b.x, -b.y, 40, clamp(-(fin(b.vx) - refVxNow) * 0.0003, -0.3, 0.3), 1.25);
      w.sets[(K + n) & 3].add(_m);
      n++;
    }
    endAll(w);
    stats.specials += n;
  };

  // the mines: a moored one (iron ball, tan balloon, a lamp that blinks) and a laid one (darker ball, a lamp that blinks faster once armed, a pale ring of danger while armed)
  const mineSet = () => swarmOf('mines', () => {
    const rM = Number(config.MINES && config.MINES.RADIUS) || 34, rL = Number((config.MINEFIELD || {}).RADIUS) || 40;
    const moored = createInstanced(root, A.buildMineBall(rM, false), 30), balloon = createInstanced(root, A.buildMineBalloon(rM), 30), laid = createInstanced(root, A.buildMineBall(rL, true), 40);
    const lamps = createLampInstances(root, 80, A.MINE_MATS.lampGeo);
    const rings = new THREE.InstancedMesh(A.MINE_MATS.ringGeo, A.MINE_MATS.ringOn, 40);
    rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage); rings.frustumCulled = false; rings.count = 0; rings.renderOrder = 2; root.add(rings);
    const ringSet = { mesh: rings, n: 0, begin() { this.n = 0; }, add(M) { if (this.n < 40) rings.setMatrixAt(this.n++, M); }, end() { rings.count = this.n; rings.instanceMatrix.needsUpdate = true; rings.visible = this.n > 0; } };
    return { moored, balloon, laid, lamps, rings: ringSet, rM, rL, all: [moored, balloon, laid, lamps, ringSet] };
  });
  const syncMines = () => {
    const w = mineSet(), MF = config.MINEFIELD || {};
    beginAll(w);
    let n = 0;
    for (const m of state.mines || []) {
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || n >= 30) continue;
      const y = -(m.y + BOB_MINE[(K + (hashN(fin(m.baseY)) % 24)) % 24]);
      put(m.x, y, 0, 0, 1); w.moored.add(_m); w.balloon.add(_m);
      put(m.x, y + w.rM * 1.06, 0, 0, w.rM * 0.2); w.lamps.add(_m, (K >> 1) & 1 ? A.MINE_COLORS.on : A.MINE_COLORS.off);
      n++;
    }
    stats.mines += n;
    const far = state.match && state.match.on ? Math.max(1, 0.34 / zoomEq) : 1; // (zoomed far out in Versus, the mines grow so they can be seen)
    let nl = 0;
    for (const m of state.laid || []) {
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || nl >= 40) continue;
      const armed = fin(m.age) >= (Number(MF.ARM) || 3.2), y = -(m.y + BOB_MINE[(K + (hashN(fin(m.id)) % 24)) % 24]);
      put(m.x, y, 0, 0, far); w.laid.add(_m);
      put(m.x, y + w.rL * 1.08 * far, 0, 0, w.rL * 0.24 * far); w.lamps.add(_m, armed ? (K & 1 ? A.MINE_COLORS.on : A.MINE_COLORS.off) : (K >> 1) & 1 ? A.MINE_COLORS.amber : A.MINE_COLORS.off);
      if (armed) { const rr = (Number(MF.TRIGGER) || 60) * 1.7 * far; put(m.x, y, -30, 0, rr); w.rings.add(_m); }
      nl++;
    }
    A.MINE_MATS.ringOn.opacity = (K >> 1) & 1 ? 0.2 : 0.12; // (the danger ring: two held values)
    endAll(w);
    stats.mines += nl;
  };

  // ---- bailed-out pilots under a chute ----------------------------------------------------------------------------------------------------------------------------------------------
  const SWAY = [0, 0.05, 0, -0.05];
  const syncChutes = () => {
    let n = 0;
    for (const c of state.chutes || []) {
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y) || n >= 20) continue;
      const g = use('chute', n, A.buildChute);
      n++;
      g.visible = true;
      g.position.set(c.x, -c.y, 20);
      g.rotation.z = SWAY[(K + n) & 3];
      g.userData.canopy.scale.setScalar(clamp(fin(c.t) / 0.6, 0.01, 1));
    }
    hideFrom('chute', n);
  };

  // ---- the supply balloon, with a soft yellow glow behind it (three flat discs, each fainter: toon steps) -----------------------------------------------------------------------------------
  let supply = null;
  const GLOW_MAT = new THREE.MeshBasicMaterial({ color: '#ffdc5a', transparent: true, opacity: 0.1, depthWrite: false });
  const makeSupply = () => {
    const g = A.buildSupply();
    for (const r of [260, 190, 120]) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 32), GLOW_MAT); m.scale.setScalar(r); m.position.set(0, 20, -60); m.renderOrder = 1; g.add(m); }
    return g;
  };

  // ---- the bosses ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const bossModels = []; // { obj, key }: one per boss in the sky (the game has one; the dev page's line-up shows four)
  const syncBoss = () => {
    const list = state.bossList || (state.boss ? [state.boss] : []);
    let n = 0;
    for (const z of list) {
      if (!(z && Number.isFinite(z.x) && Number.isFinite(z.y)) || n >= 4) continue;
      const key = [z.kind, !!z.flagship, z.body, z.fin].join('|');
      let m = bossModels[n];
      if (!m || m.key !== key) {
        if (m) { m.obj.removeFromParent(); m.obj.traverse((o) => o.geometry && o.geometry.dispose()); }
        const obj = A.buildBoss(z.kind, !!z.flagship, { body: z.body, fin: z.fin });
        obj.scale.setScalar(z.flagship ? 1.18 : 1);
        applyLook(obj);
        root.add(obj);
        m = bossModels[n] = { obj, key };
      }
      n++;
      const boss = m.obj;
      boss.visible = true;
      boss.position.set(z.x, -z.y, 0);
      stats.boss = n;
      const main = api.mainShip && api.mainShip();
      const aimX = main ? main.pose.x + (main.layout.aimPoint ? main.layout.aimPoint.x : 0) : z.x - 1000, aimY = main ? -(main.pose.y + (main.layout.aimPoint ? main.layout.aimPoint.y : 0)) : -z.y;
      (boss.userData.turrets || []).forEach((tu, i) => {
        const gun = z.guns && z.guns[i];
        tu.node.visible = !!gun;
        if (!gun) return;
        tu.node.position.x = gun.dx;
        tu.pivot.visible = !gun.dead;
        tu.ball.visible = !gun.dead; tu.stump.visible = !!gun.dead; // (a shot-off turret is a blackened stump)
        const gx = z.x + gun.dx * boss.scale.x, gy = -z.y - 190 * boss.scale.y;
        tu.pivot.rotation.z = Math.atan2(aimY - gy, aimX - gx);
        if (gun.dead && due(gun, 5)) { const q = P(); if (q) q.burst('smoke', gx, gy + 14, 40, 1, { size: [26, 40], size1: 2, life: [1, 1.6], color: '#2a2626', alpha: 0.75, speed: [4, 20], up: [30, 60] }); }
      });
      const segs = boss.userData.flagSegs;
      if (segs) segs.forEach((sg, i) => { sg.rotation.y = FLAG_KEYS[K % 3][i]; }); // (the pennant's four rigid segments hold one of three poses)
      const q = P();
      if (q && boss.userData.stacks) boss.userData.stacks.forEach(([sx, sy], si) => { if (due(z, 3, si)) q.burst('smoke', z.x + sx * boss.scale.x, -z.y + sy * boss.scale.y + 30, 10, 1, { size: [34, 56], size1: 2.2, life: [1.4, 2.2], color: '#3a3636', alpha: 0.8, speed: [4, 18], up: [30, 70] }); });
    }
    for (let i = n; i < bossModels.length; i++) if (bossModels[i]) bossModels[i].obj.visible = false;
  };

  // ---- shot-down planes, falling and burning --------------------------------------------------------------------------------------------------------------------------------------------
  const syncWrecks = () => {
    let nF = 0, nB = 0;
    for (const w of state.wrecks || []) {
      if (!w || !Number.isFinite(w.x) || !Number.isFinite(w.y) || nF + nB >= 12) continue;
      const cargo = w.kind === 'cargo';
      const g = cargo ? use('wreckBig', nB++, () => { const m = A.buildBomber({ body: '#3a302c', trim: '#2f2622' }); m.scale.setScalar(0.9); return planeShell(m); }) : use('wreck', nF++, () => planeShell(A.buildBiplane(PAL_WRECK, { pilot: 'skull', enemy: true })));
      g.visible = true;
      g.position.set(w.x, -w.y, 0);
      g.rotation.z = -fin(w.spin);
      g.userData.inner.rotation.x = Math.cos(fin(w.spin)) < 0 ? PI : 0;
      g.scale.setScalar(cargo ? 1 : 1.15);
      const p = P();
      if (p) {
        const k = cargo ? 2 : 1;
        if (due(w, 14)) p.burst('fire', w.x, -w.y + 10, 30, 1, { size: [36 * k, 58 * k], size1: 0.3, life: [0.3, 0.5], speed: [4, 30], up: [30, 100], area: 12 * k, drag: 1.4 });
        if (due(w, 7, 1)) p.burst('smoke', w.x, -w.y + 20, 25, 1, { size: [36, 60], size1: 2.2, life: [1.1, 1.9], color: '#3a3636', alpha: 0.8, speed: [4, 22], up: [30, 80] });
      }
    }
    hideFrom('wreck', nF);
    hideFrom('wreckBig', nB);
    stats.wrecks = nF + nB;
  };

  // ---- the batteries' homing rockets ---------------------------------------------------------------------------------------------------------------------------------------------------
  const syncRockets = () => {
    let n = 0;
    for (const k of state.rockets || []) {
      if (!k || !Number.isFinite(k.x) || !Number.isFinite(k.y) || n >= 12) continue;
      const g = use('rocket', n, A.buildRocket);
      n++;
      g.visible = true;
      g.position.set(k.x, -k.y, 10);
      g.rotation.z = -fin(k.ang);
      const p = P(), ca = Math.cos(fin(k.ang)), sa = Math.sin(fin(k.ang));
      if (p) {
        if (due(k, 40)) p.burst('fire', k.x - ca * 26, -k.y + sa * 26, 14, 1, { size: [22, 34], size1: 0.3, life: [0.15, 0.28], speed: [4, 20], dir: PI + (-fin(k.ang)), spread: 0.3, drag: 1.2 });
        if (due(k, 22, 1)) p.burst('smoke', k.x - ca * 34, -k.y + sa * 34, 10, 1, { size: [18, 30], size1: 2, life: [0.8, 1.3], color: '#b8b4b0', alpha: 0.7, speed: [2, 12] });
      }
    }
    hideFrom('rocket', n);
  };

  // ---- the specials ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const syncSpecials = () => {
    const S = state.specials;
    if (!S) { syncImps([]); hideFrom('saw', 0); hideFrom('sniper', 0); hideFrom('tug', 0); hideFrom('harpoon', 0); return; }
    let n = 0;
    for (const s of S.saws || []) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.y) || n >= 10) continue;
      const g = use('saw', n, A.buildSaw);
      n++;
      g.visible = true;
      g.position.set(s.x, -s.y, 30);
      g.userData.disc.rotation.z = -((K + (n & 3)) * 0.42); // (a spin held per key: 0.42 rad a key)
      g.userData.lamp.material = s.mode === 'dash' ? A.SAW_MATS.dash : A.SAW_MATS.lamp;
    }
    hideFrom('saw', n);
    stats.specials = n;
    syncImps(S.imps || []);
    n = 0;
    for (const z of S.snipers || []) {
      if (!Number.isFinite(z.x) || !Number.isFinite(z.y) || n >= 3) continue;
      const g = use('sniper', n, A.buildSniper);
      n++;
      g.visible = true;
      g.position.set(z.x, -z.y, 0);
      const k = z.mode === 'lock' ? 2 : z.mode === 'charge' ? 1 : 0;
      g.userData.lens.material = g.userData.lensMats[k === 2 ? (K & 1 ? 2 : 1) : k];
      g.userData.lens.position.set(Math.cos(fin(z.aim)) * 60, -62 - Math.sin(fin(z.aim)) * 6, 12);
      g.rotation.y = Math.cos(fin(z.aim)) < 0 ? 0 : PI; // (she faces the way she aims: the lens is on that side)
    }
    hideFrom('sniper', n);
    stats.specials += n;
    n = 0;
    const main = api.mainShip && api.mainShip();
    for (const z of S.tugs || []) {
      if (!Number.isFinite(z.x) || !Number.isFinite(z.y) || n >= 3) continue;
      const g = use('tug', n, A.buildTug);
      n++;
      g.visible = true;
      g.position.set(z.x, -z.y, 0);
      g.rotation.y = main && z.side * main.pose.f > 0 ? PI : 0;
      stepProp(g, K + n);
      if (z.harpoon && Number.isFinite(z.harpoon.x)) {
        const h = use('harpoon', 0, A.buildHarpoon);
        h.visible = true;
        h.position.set(z.harpoon.x, -z.harpoon.y, 10);
        h.rotation.z = Math.atan2(-fin(z.harpoon.vy), fin(z.harpoon.vx, 1));
      }
    }
    if (!(S.tugs || []).some((z) => z.harpoon)) hideFrom('harpoon', 0);
    hideFrom('tug', n);
    stats.specials += n;
  };

  // ---- single objects ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  const syncSingles = () => {
    syncBoss();
    const sp = state.supply;
    if (sp && state.course && Number.isFinite(sp.mx) && Number.isFinite(sp.my)) {
      if (!supply) { supply = makeSupply(); applyLook(supply); root.add(supply); }
      supply.visible = true;
      supply.position.set(sp.mx, -(sp.my + BOB_SUPPLY[K % 40]), 0);
    } else if (supply) supply.visible = false;
  };

  // ---- thrown cargo: instanced boxes (one draw call each for the boxes and their ink). (The broken-off ship pieces are WP5's bodies now: destruction.js.) -----------------------------------
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const mkInst = (mat, max) => { const m = new THREE.InstancedMesh(BOX, mat, max); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; root.add(m); return m; };
  const bitMat = new THREE.MeshBasicMaterial();
  const bits = mkInst(bitMat, 120), bitsInk = mkInst(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), 120);
  const syncBits = () => {
    let n = 0;
    const put = (x, y, rot, lx, ly, w, h, d, color) => {
      if (n >= 120) return;
      _E.set(0, 0, -rot);
      _Q.setFromEuler(_E);
      _P.set(lx, -ly, 0).applyQuaternion(_Q);
      _P.x += x; _P.y += -y;
      _M.compose(_P, _Q, _S.set(w, h, d));
      bits.setMatrixAt(n, _M);
      bits.setColorAt(n, _C.set(color));
      _M.compose(_P, _Q, _S.set(w + 7, h + 7, d + 7));
      bitsInk.setMatrixAt(n, _M);
      n++;
    };
    for (const it of state.thrown || []) {
      if (!it || !Number.isFinite(it.x)) continue;
      if (it.kind === 'crate') { put(it.x, it.y, fin(it.rot), 0, 0, 30, 30, 30, '#c9a05f'); put(it.x, it.y, fin(it.rot), 0, 0, 33, 5, 33, '#8a6444'); }
      else put(it.x, it.y, fin(it.rot), 0, 0, 34, 24, 24, it.kind === 'coal' ? '#2b2b2b' : '#b79a63');
    }
    bits.count = bitsInk.count = n;
    bits.instanceMatrix.needsUpdate = bitsInk.instanceMatrix.needsUpdate = true;
    if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
  };

  // ---- the dev page's ENEMY LINE-UP (three3d.html?enemies=1..3): a made-up game state with one of everything, so the models can be looked at close and side by side. Page 1: planes and bats and mines,
  // page 2: the specials, wrecks and rockets, page 3: the four bosses. (x, y) = the middle of the picture in the 3D world (y up).
  let lu = { key: '', state: null };
  const fakeFor = ({ x, y, page }) => {
    const key = [Math.round(x), Math.round(y), page].join(',');
    if (lu.key === key && lu.state) return lu.state;
    const f = Object.create(stateArg);
    const X = (i, step = 230) => x + i * step, Yg = (r) => -(y + r * 280); // (row r: +1.5 top .. -1.5 bottom; the game's y points down)
    const empty = { strafers: [], bombers: [], escorts: [], hijacks: [], bats: [], mines: [], laid: [], chutes: [], wrecks: [], rockets: [], thrown: [], supply: null, boss: null, enemy: { dead: 1, trail: [] }, specials: null, phase: 'flying' };
    Object.assign(f, empty, { course: stateArg.course || { map: { open: true } } });
    const trail = () => [];
    if (page === 1) {
      f.strafers = [{ x: X(-3.5), y: Yg(1.5), heading: 0, bank: 0, trail: trail() }, { x: X(-2.4), y: Yg(1.5), heading: Math.PI, bank: 0, trail: trail() }, { x: X(-1.3), y: Yg(1.5), heading: -0.5, bank: 0.9, trail: trail() }];
      f.enemy = { x: X(0), y: Yg(1.5), heading: 0, bank: 0, dead: 0, trail: trail() };
      f.escorts = [{ flying: true, x: X(1.3), y: Yg(1.5), heading: 0, bank: 0, trail: trail() }];
      f.hijacks = [{ x: X(2.4), y: Yg(1.5), heading: Math.PI, bank: 0, rider: 'nobody', trail: trail() }];
      f.bombers = [{ x: X(-2.6), y: Yg(0.5), vx: 100, hp: 5, maxHp: 5 }, { x: X(0.6), y: Yg(0.5), vx: -100, hp: 5, maxHp: 5 }];
      f.supply = { mx: X(3.1), my: Yg(0.5) + 40 };
      f.chutes = [{ x: X(-3.5), y: Yg(-0.5) - 20, t: 1 }];
      f.bats = [{ x: X(-2.4), y: Yg(-0.5), vx: 100, delay: 0, phase: 1 }, { x: X(-1.3), y: Yg(-0.5), vx: -100, delay: 0, phase: 2 }, { x: X(-0.2), y: Yg(-0.5), vx: 0, delay: 0, phase: 3, latched: true, landed: true, kind: 'hull' }, { x: X(0.9), y: Yg(-0.5), vx: 0, delay: 0, phase: 4, latched: true, landed: true, kind: 'gas' }];
      f.mines = [{ x: X(2.0), y: Yg(-0.5) - 40, baseY: 0, bob: 1 }];
      f.laid = [{ id: 1, x: X(3.0), y: Yg(-0.5), age: 0, bob: 1 }, { id: 2, x: X(3.8), y: Yg(-0.5), age: 9, bob: 2 }];
      f.wrecks = [{ x: X(-2.4), y: Yg(-1.5), spin: 0.5, kind: 'biplane' }, { x: X(-0.4), y: Yg(-1.5), spin: -0.3, kind: 'cargo' }];
      f.rockets = [{ x: X(1.8), y: Yg(-1.5), ang: -0.8 }, { x: X(2.5), y: Yg(-1.5), ang: -2.4 }];
    } else if (page === 2) {
      f.specials = {
        saws: [{ x: X(-3.4), y: Yg(1), mode: 'orbit', spin: 0 }, { x: X(-2.4), y: Yg(1), mode: 'dash', spin: 0 }],
        imps: [{ x: X(-1.3), y: Yg(1), delay: 0, flap: 0 }, { x: X(-0.7), y: Yg(1), delay: 0, flap: 1 }, { x: X(-0.1), y: Yg(1), delay: 0, flap: 2 }],
        snipers: [{ x: X(1.4), y: Yg(1), aim: Math.PI, mode: 'move', hit: 0 }, { x: X(3.0), y: Yg(1), aim: 0.2, mode: 'lock', hit: 0 }],
        tugs: [{ x: X(-2.2), y: Yg(-0.4), side: 1, mode: 'approach', hook: null, harpoon: { x: X(-0.8), y: Yg(-0.4), vx: -900, vy: 0 } }],
        beams: [],
      };
      f.course = { ...(stateArg.course || {}), map: { open: true } };
    } else {
      const mk = (kind, flagship, body, fin, ox, oy) => ({ kind, flagship, body, fin, x: ox, y: oy, hp: 100, maxHp: 100, guns: [{ dx: -200, dead: false }, { dx: 0, dead: true }, { dx: 200, dead: false }] });
      f.boss = null;
      f.bossList = [mk('dread', false, '#3a3036', '#5c1e1e', X(-1.5, 640), Yg(1.1)), mk('carrier', false, '#3b2c4c', '#6a3a8c', X(1.5, 640), Yg(1.1)), mk('iron', false, '#4a5056', '#2a2e33', X(-1.5, 640), Yg(-1.1)), mk('iron', true, '#4a5056', '#2a2e33', X(1.5, 640), Yg(-1.1))];
    }
    lu = { key, state: f };
    return f;
  };

  return {
    stats: () => ({ ...stats, lineSegments: lines.count }), // (contrail segments this frame; the draw calls of everything are in view.stats())
    // t = seconds; refVx = the main ship's speed (bats face the way they fly relative to her); o = { dt, zoomEq }
    update(t, refVx = 0, o = {}) {
      state = o.lineup ? fakeFor(o.lineup) : stateArg;
      T = t; K = Math.floor(t * 8); DT = clamp(fin(o.dt, 0.016), 0, 0.1); zoomEq = clamp(fin(o.zoomEq, 0.5), 0.05, 3); refVxNow = refVx; frame++;
      stats.planes = stats.bats = stats.mines = stats.specials = stats.wrecks = stats.boss = 0;
      const lobby = state.phase === 'lobby';
      lines.begin();
      const vc = state.course ? envOf(state).strafer : null; // (the Aether's void corsairs are a different colour)
      const strafers = (state.strafers || []);
      syncPlanes('S' + (vc ? vc.body : ''), strafers, () => A.buildBiplane(vc ? { body: vc.body, wing: vc.body, trim: vc.trim, dark: '#2f2a3a' } : PAL_STRAFER, { enemy: true, pilot: 'skull' }));
      const dev = state.enemy && !lobby && !(state.enemy.dead > 0) ? [state.enemy] : [];
      syncPlanes('D', dev, () => A.buildDevil(), 1);
      syncPlanes('B', state.bombers || [], () => A.buildBomber(), 6, (g, p) => { g.rotation.z = 0; g.userData.inner.rotation.x = 0; g.rotation.y = fin(p.vx) < 0 ? PI : 0; }); // (a bomber turns about her tail: the emblem is on both sides)
      const friends = [...(state.escorts || [state.escort]).filter((e) => e && e.flying), ...(state.hijacks || [])];
      syncPlanes('F', friends.map((p) => ({ ...p, hijackScale: p.big ? 1.6 : 1 })), (p) => A.buildBiplane(PAL_FRIEND, { enemy: false, pilot: (p && state.players[p.rider] && state.players[p.rider].color) || '#a8443f' }), 12);
      for (const p of [...strafers, ...dev, ...friends]) contrail(p.trail);
      lines.end();
      syncBats(state.bats || []);
      syncMines();
      syncChutes();
      syncSingles();
      syncWrecks();
      syncRockets();
      syncSpecials();
      syncBits();
    },
    dispose() { hideAll(); lines.dispose(); },
    // the planes' model for the dev page / a screenshot tool
    models: A,
    T: () => T,
  };
}
