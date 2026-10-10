// Everything that flies through the sky or hangs in it, drawn simply in 3D from the real game state: enemy planes (small and big), our escort / stolen planes, bats, mines (moored
// and laid), parachutes, the supply balloon, the boss airship, broken-off ship pieces and thrown cargo. Rigid shapes only (no wobble). Gameplay never depends on any of it:
// the host calls update() inside a try/catch and a failure here just leaves the sky emptier.
import { THREE, Batch, INK, G, tagSmall, applyLook } from './style.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);

// one generic fighter (a skeleton biplane): bombers are the same plane, bigger. pal = body / wing colours.
const PAL_ENEMY = { body: '#a8443f', wing: '#c9706a' }, PAL_FRIEND = { body: '#8fb37a', wing: '#e8d8a8' };
function buildPlane(big, pal) {
  const b = new Batch();
  const s = big ? 1.6 : 1;
  b.sphere(pal.body, 0, 0, 0, 62 * s, 17 * s, 16 * s, 3.5); // fuselage
  b.sphere('#4a4346', 52 * s, 0, 0, 14 * s, 14 * s, 14 * s, 3, true); // cowling
  b.box(pal.wing, -2 * s, 10 * s, 0, 36 * s, 5 * s, 150 * s, 3); // lower wing (the span runs toward the viewer: seen edge-on from the side)
  b.box(pal.wing, 4 * s, 34 * s, 0, 34 * s, 5 * s, 150 * s, 3);
  for (const z of [-48, 48]) b.box('#4a4346', 2 * s, 22 * s, z * s, 4 * s, 28 * s, 4 * s, 1.5);
  b.box('#4a4346', -58 * s, 12 * s, 0, 32 * s, 4 * s, 52 * s, 2.5); // tailplane
  b.box('#4a4346', -58 * s, 20 * s, 0, 5 * s, 30 * s, 5 * s, 2.5, 0, 0, 0.1); // fin
  b.sphere('#efe9dc', 8 * s, 14 * s, 0, 9 * s, 8 * s, 8 * s, 2, true); // pilot
  const grp = b.build();
  const prop = new Batch();
  prop.box('#2b2622', 0, 0, 0, 4 * s, 60 * s, 8 * s, 1.5);
  const pg = prop.build();
  pg.position.x = 66 * s;
  grp.add(pg);
  grp.userData.prop = pg;
  return grp;
}

// bats: a charcoal body, two flat wings that beat on rigid pivots
function buildBat() {
  const g = new THREE.Group();
  const body = new Batch();
  body.sphere('#4a4346', 0, 0, 0, 20, 14, 13, 3);
  body.sphere('#4a4346', 18, 6, 0, 10, 9, 9, 2.4, true);
  for (const z of [-5, 5]) body.cone('#4a4346', 20, 18, z, 3.5, 11, 1.6);
  body.sphere('#f2d36b', 25, 8, 0, 2.2, 2.2, 6, 0, true);
  g.add(body.build());
  const wings = [];
  for (const sgn of [1, -1]) {
    const piv = new THREE.Group();
    const w = new Batch();
    w.box('#2f2a2e', -4, 0, sgn * 36, 38, 3, 72, 2.6);
    piv.add(w.build());
    piv.position.y = 6;
    g.add(piv);
    wings.push([piv, sgn]);
  }
  g.userData.wings = wings;
  return g;
}

// a floating mine: iron ball with eight spikes, a blinking light, and (moored ones) the balloon it hangs from
function buildMine(r, balloon) {
  const g = new THREE.Group();
  const b = new Batch();
  b.sphere('#4a4346', 0, 0, 0, r, r, r, 3);
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    b.cone('#4a4346', Math.cos(a) * (r + 5), Math.sin(a) * (r + 5), 0, 7, 22, 2, 0, 0, a - Math.PI / 2);
  }
  g.add(tagSmall(b.build()));
  const on = new THREE.MeshBasicMaterial({ color: '#ff3b30' }), off = new THREE.MeshBasicMaterial({ color: '#6b1b17' });
  const light = new THREE.Mesh(G.sphereLo, off);
  light.scale.setScalar(r * 0.22);
  light.position.set(0, r * 0.4, r * 0.85);
  g.add(light);
  g.userData.light = light; g.userData.on = on; g.userData.off = off;
  if (balloon) {
    const bb = new Batch();
    bb.sphere('#c9706a', 0, 118, 0, 34, 42, 34, 3);
    bb.rod('#2b2622', new THREE.Vector3(0, 76, 0), new THREE.Vector3(0, r, 0), 1.6, 0);
    g.add(tagSmall(bb.build()));
  }
  return g;
}

function buildChute() {
  const g = new THREE.Group();
  const canopy = new Batch();
  canopy.sphere('#eee6d2', 0, 70, 0, 46, 34, 40, 2.5);
  const cg = tagSmall(canopy.build());
  g.add(cg);
  const body = new Batch();
  body.sphere('#4a4346', 0, 0, 0, 11, 16, 9, 2, true);
  for (const k of [-1, 1]) body.rod('#2b2622', new THREE.Vector3(k * 40, 62, 0), new THREE.Vector3(0, 14, 0), 1.2, 0);
  g.add(tagSmall(body.build()));
  g.userData.canopy = cg;
  return g;
}

function buildBoss() {
  const b = new Batch();
  b.sphere('#5c1e1e', 0, 0, 0, 330, 112, 112, 6); // the envelope (nose to the left)
  for (const s of [-1, 1]) b.box('#4a1818', 285, s * 98, 0, 120, 8, 110, 4, 0, 0, s * 0.5);
  b.box('#4a1818', 300, 0, 0, 100, 150, 8, 4);
  b.box('#4a4346', -20, -128, 0, 150, 30, 46, 4); // gondola
  b.cone('#4a4346', -345, 0, 0, 24, 50, 3, 0, 0, Math.PI / 2);
  const g = b.build();
  return g;
}

function buildSupply() {
  const g = new THREE.Group();
  const b = new Batch();
  b.sphere('#a8443f', 0, 60, 0, 90, 110, 90, 4);
  b.sphere('#f3ead6', 0, 60, 0, 92, 22, 92, 0);
  b.box('#c9a05f', 0, -78, 0, 44, 44, 44, 3);
  for (const s of [-1, 1]) b.rod('#2b2622', new THREE.Vector3(s * 60, -10, 0), new THREE.Vector3(s * 20, -58, 0), 1.6, 0);
  g.add(b.build());
  return g;
}

// state = the game's world state (read only). root = the world group the whole 3D scene hangs from.
export function createFlyers(root, state) {
  const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _C = new THREE.Color(), _E = new THREE.Euler();
  const pools = { plane: new Map(), bat: [], mine: [], laid: [], chute: [] };

  const poolAt = (arr, i, make) => { while (arr.length <= i) { const o = make(); applyLook(o); root.add(o); o.visible = false; arr.push(o); } return arr[i]; };
  const hideFrom = (arr, n) => { for (let i = n; i < arr.length; i++) arr[i].visible = false; };

  const syncPlanes = (key, list, big, pal, t) => {
    let pool = pools.plane.get(key);
    if (!pool) pools.plane.set(key, (pool = []));
    let n = 0;
    for (const p of list) {
      if (!p || p.dead > 0 || p.dead === true || !Number.isFinite(p.x) || !Number.isFinite(p.y) || n >= 24) continue;
      const g = poolAt(pool, n, () => { const gr = new THREE.Group(), inner = new THREE.Group(), mesh = tagSmall(buildPlane(big, pal)); inner.add(mesh); gr.add(inner); gr.userData.inner = inner; gr.userData.mesh = mesh; return gr; });
      n++;
      const h = Number.isFinite(p.heading) ? p.heading : 0;
      g.visible = true;
      g.position.set(p.x, -p.y, 0);
      g.rotation.z = -h;
      g.userData.inner.rotation.x = Math.cos(h) < 0 ? Math.PI : 0;
      const prop = g.userData.mesh.userData.prop;
      if (prop) prop.rotation.x = t * 40;
    }
    hideFrom(pool, n);
  };

  const syncBats = (list, t, refVx) => {
    let n = 0;
    for (const b of list) {
      if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || n >= 40) continue;
      const g = poolAt(pools.bat, n, () => tagSmall(buildBat()));
      n++;
      g.visible = true;
      g.position.set(b.x, -b.y, 60);
      g.rotation.y = fin(b.vx) - refVx >= 0 ? 0 : Math.PI;
      const flap = 0.55 + 0.6 * Math.sin(t * 13 + (b.phase || 0));
      for (const [piv, sgn] of g.userData.wings) piv.rotation.x = -sgn * flap;
    }
    hideFrom(pools.bat, n);
  };

  const syncMines = (t) => {
    const r = Number(config.MINES && config.MINES.RADIUS) || 28;
    const blink = Math.floor(t * 6) % 2 === 0;
    let n = 0;
    for (const m of state.mines || []) {
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || n >= 30) continue;
      const g = poolAt(pools.mine, n, () => buildMine(r, true));
      n++;
      g.visible = true;
      g.position.set(m.x, -(m.y + Math.sin(fin(m.bob) * 2) * 6), 0);
      g.userData.light.material = blink ? g.userData.on : g.userData.off;
    }
    hideFrom(pools.mine, n);
    n = 0;
    for (const m of state.laid || []) {
      if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y) || n >= 40) continue;
      const g = poolAt(pools.laid, n, () => buildMine(r * 0.8, false));
      n++;
      g.visible = true;
      g.position.set(m.x, -m.y, 0);
      g.userData.light.material = blink ? g.userData.on : g.userData.off;
    }
    hideFrom(pools.laid, n);
  };

  const syncChutes = () => {
    let n = 0;
    for (const c of state.chutes || []) {
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y) || n >= 20) continue;
      const g = poolAt(pools.chute, n, buildChute);
      n++;
      g.visible = true;
      g.position.set(c.x, -c.y, 20);
      const open = clamp(fin(c.t) / 0.6, 0.01, 1);
      g.userData.canopy.scale.setScalar(open);
    }
    hideFrom(pools.chute, n);
  };

  // single objects
  let boss = null, supply = null;
  const syncSingles = () => {
    const z = state.boss;
    if (z && Number.isFinite(z.x) && Number.isFinite(z.y)) {
      if (!boss) { boss = buildBoss(); applyLook(boss); root.add(boss); }
      boss.visible = true;
      boss.position.set(z.x, -z.y, 0);
    } else if (boss) boss.visible = false;
    const sp = state.supply;
    if (sp && state.course && Number.isFinite(sp.mx) && Number.isFinite(sp.my)) {
      if (!supply) { supply = buildSupply(); applyLook(supply); root.add(supply); }
      supply.visible = true;
      supply.position.set(sp.mx, -(sp.my + Math.sin(fin(sp.bob) * 1.3) * 30), 0);
    } else if (supply) supply.visible = false;
  };

  // broken-off ship pieces and thrown cargo: instanced boxes (one draw call each for the boxes and their ink)
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const mkInst = (mat, max) => { const m = new THREE.InstancedMesh(BOX, mat, max); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; root.add(m); return m; };
  const bitMat = new THREE.MeshBasicMaterial();
  const bits = mkInst(bitMat, 400), bitsInk = mkInst(new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), 400);
  const syncBits = () => {
    let n = 0;
    const put = (x, y, rot, lx, ly, w, h, d, color, k = 1) => {
      if (n >= 400) return;
      _E.set(0, 0, -rot);
      _Q.setFromEuler(_E);
      _P.set(lx, -ly, 0).applyQuaternion(_Q);
      _P.x += x; _P.y += -y;
      _M.compose(_P, _Q, _S.set(Math.max(1, w * k), Math.max(1, h * k), Math.max(1, d * k)));
      bits.setMatrixAt(n, _M);
      bits.setColorAt(n, _C.set(color));
      _M.compose(_P, _Q, _S.set(Math.max(1, w * k) + 7, Math.max(1, h * k) + 7, Math.max(1, d * k) + 7));
      bitsInk.setMatrixAt(n, _M);
      n++;
    };
    for (const d of state.debris || []) {
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      const k = clamp((fin(d.life, 3) - fin(d.t)) / 1.2, 0.05, 1), rot = fin(d.rot), f = d.f || 1;
      for (const c of d.clips || []) {
        const w = fin(c.x1) - fin(c.x0), h = fin(c.y1) - fin(c.y0);
        put(d.x, d.y, rot, ((c.x0 + c.x1) / 2 - fin(d.cx)) * f, (c.y0 + c.y1) / 2 - fin(d.cy), clamp(w, 4, 600), clamp(h, 4, 400), Math.min(70, Math.max(18, Math.min(w, h) * 0.5)), d.bag ? '#c9b99a' : '#9a7448', k);
      }
    }
    for (const it of state.thrown || []) {
      if (!it || !Number.isFinite(it.x)) continue;
      if (it.kind === 'crate') put(it.x, it.y, fin(it.rot), 0, 0, 30, 30, 30, '#c9a05f');
      else put(it.x, it.y, fin(it.rot), 0, 0, 34, 24, 24, it.kind === 'coal' ? '#2b2b2b' : '#b79a63');
    }
    bits.count = bitsInk.count = n;
    bits.instanceMatrix.needsUpdate = bitsInk.instanceMatrix.needsUpdate = true;
    if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
  };

  return {
    // t = seconds; refVx = the main ship's speed (bats face the way they fly relative to her)
    update(t, refVx = 0) {
      const lobby = state.phase === 'lobby';
      const enemy = state.enemy && !lobby ? [state.enemy] : [];
      syncPlanes('S', [...(state.strafers || []), ...enemy], false, PAL_ENEMY, t);
      syncPlanes('B', state.bombers || [], true, PAL_ENEMY, t);
      syncPlanes('F', [...(state.escorts || [state.escort]).filter((e) => e && e.flying), ...(state.hijacks || [])], false, PAL_FRIEND, t);
      syncBats(state.bats || [], t, refVx);
      syncMines(t);
      syncChutes();
      syncSingles();
      syncBits();
    },
  };
}
