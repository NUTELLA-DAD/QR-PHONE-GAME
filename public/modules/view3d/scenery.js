// The things that stand on the land, from the course (read only): castle blocks and factories (course.features[].blocks), turrets (course.turrets) and the route markers
// (course.markers: mooring mast, outpost poles, checkpoint flags, the beacon). Each is built once, when the camera first comes near it, from rigid pieces with an ink shell;
// after that only a visible flag, a turret's aim and its health pips change. Simple shapes in the 2D art's colours; WP9 (enemies and world objects v2) gives them detail.
import { THREE, Batch, applyLook, tagSmall } from './style.js';
import { config } from '../../config.js';
import { groundAt } from '../host/course.js';

const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const Z = -45; // the depth the land's things stand at (just in front of the rock slab behind the ships)
const RANGE = 3200; // build and show things this far (world units) either side of the camera

function banner(b, x, y, s) { // the raiders' banner: dark red with a black horn mark (the 2D one hangs from (x, y) downward)
  b.box('#8e1f1a', x, y - 30 * s, 0, 40 * s, 60 * s, 6, 2);
  b.box('#2b2622', x, y - 30 * s, 4, 12 * s, 22 * s, 3, 0);
}

function buildBlock(course, bk) {
  const x0 = bk.x0, x1 = bk.x1, cx = (x0 + x1) / 2, w = x1 - x0;
  const g = Math.max(groundAt(course, x0, false), groundAt(course, x1, false), groundAt(course, cx, false)) + 40;
  const top = bk.top, h = Math.max(20, g - top), mid = -(top + h / 2); // 3D y of the middle of the wall
  const b = new Batch();
  const d = Math.min(150, Math.max(70, w * 0.8));
  const merlons = (xa, xb, yTop, mh, color) => {
    const n = Math.max(2, Math.round((xb - xa) / 44)), mw = (xb - xa) / (n * 2 - 1);
    for (let i = 0; i < n; i++) b.box(color, xa + (i * 2 + 0.5) * mw, -(yTop) - mh / 2, 0, mw, mh, d * 0.9, 2);
  };
  if (bk.kind === 'wall') {
    b.box('#9a948c', cx, mid - 11, 0, w, h - 22, d, 3);
    merlons(x0, x1, top, 22, '#9a948c');
    b.box('#2b2420', cx, -(g - 62), d / 2 + 1, 80, 80, 3, 0); // the gate
  } else if (bk.kind === 'tower') {
    b.box('#8a847c', cx, mid - 13, 0, w, h - 26, d, 3);
    merlons(x0 - 6, x1 + 6, top, 26, '#8a847c');
    banner(b, cx, -(top + 34), 1);
  } else if (bk.kind === 'keep') {
    const roofH = 80;
    b.box('#958f86', cx, -(top + roofH + (h - roofH) / 2), 0, w, h - roofH, d, 3);
    b.cone('#4a4f63', cx, -(top + roofH / 2), 0, Math.max(w, d) * 0.78, roofH, 3, 0, Math.PI / 4, 0);
    banner(b, cx, -(top + roofH + 6), 1.3);
  } else if (bk.kind === 'shed') {
    const roofH = 40;
    b.box('#9b4a3a', cx, -(top + roofH + (h - roofH) / 2), 0, w, h - roofH, d, 3);
    const teeth = Math.max(2, Math.round(w / 80)), tw = w / teeth;
    for (let i = 0; i < teeth; i++) b.box('#5b5550', x0 + (i + 0.5) * tw, -(top + roofH / 2), 0, tw, roofH, d, 2.5);
    b.box('#3b2a1d', cx, -(g - 70), d / 2 + 1, 48, 60, 3, 0);
  } else if (bk.kind === 'chimney') {
    b.cyl('#8e3f30', cx, -(top + 14 + (g - top - 14) / 2), 0, w / 2 + 6, g - top - 14, 3);
    b.cyl('#3a3330', cx, -(top + 9), 0, w / 2 + 12, 18, 3);
    for (const k of [0.12, 0.2]) b.cyl('#f3ead6', cx, -(top + (g - top) * k + 5), 0, w / 2 + 7, 10, 0);
  } else return null;
  const grp = tagSmall(b.build());
  grp.position.z = Z;
  return grp;
}

function buildTurret(t) {
  const root = new THREE.Group();
  const live = new THREE.Group(), dead = new THREE.Group();
  const base = new Batch();
  base.sphere('#6b5a4a', 0, 14, 0, 40, 34, 34, 3.5);
  base.box('#6b5a4a', 0, -6, 0, 80, 12, 60, 3);
  base.sphere('#a8443f', 0, 20, 30, 7, 7, 7, 0, true);
  live.add(base.build());
  const pivot = new THREE.Group();
  pivot.position.set(0, 26, 0);
  if (t.rocket) {
    const r = new Batch();
    r.rod('#2b2622', V3(-20, 16, 0), V3(10, 76, 0), 3, 2);
    r.sphere('#a8443f', 0, 48, 0, 8, 18, 8, 2);
    live.add(r.build());
  } else {
    const barrel = new Batch();
    barrel.box('#5a5558', 29, 0, 0, 58, 16, 16, 2.5);
    pivot.add(barrel.build());
    live.add(pivot);
  }
  const pips = [];
  for (let i = 0; i < 8; i++) {
    const p = new Batch();
    p.box('#a8443f', -18 + i * 13, 66, 0, 9, 9, 9, 1);
    const pg = p.build();
    pips.push(pg);
    live.add(pg);
  }
  const rub = new Batch();
  rub.sphere('#3b3b3b', 0, 6, 0, 36, 14, 26, 3);
  rub.sphere('#3b3b3b', 14, 14, 0, 16, 10, 14, 2.5);
  dead.add(rub.build());
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff2a3c', transparent: true, opacity: 0.45, depthWrite: false }));
  glow.position.set(0, 26, 20);
  glow.visible = false;
  root.add(live, dead, glow);
  root.userData = { live, dead, pivot, pips, glow };
  return tagSmall(root);
}

function buildMarker(m, course) {
  const G = Number(config.COURSE.GROUND) || 1350, LIFT = G - 1350;
  const b = new Batch();
  const x = fin(m.mx ?? m.cx), g = fin(m.my, groundAt(course, x));
  const up = (y) => -(g - y); // a height y metres above the ground -> 3D y offset from the ground
  void up;
  const gy = -g;
  let body = null;
  if (m.kind === 'home') {
    const mastH = m.top != null ? g - m.top : 900 + LIFT;
    b.cone('#7a5a3a', x, gy + mastH / 2, 0, 70, mastH, 3, 0, Math.PI / 4, 0);
    b.box('#8a6444', x, gy + mastH, 0, 120, 24, 60, 3);
    b.rod('#2b2622', V3(x, gy + mastH, 0), V3(x, gy + mastH + 98, 0), 2.5, 0);
    b.box('#3a86ff', x + 36, gy + mastH + 92, 0, 70, 28, 4, 2);
  } else if (m.kind === 'outpost') {
    b.rod('#2b2622', V3(x, gy, 0), V3(x, gy + 420, 0), 3, 2);
    body = new Batch();
    banner(body, x + 2 + 24, gy + 420, 2.4);
  } else if (m.kind === 'checkpoint') {
    const topH = 640 + LIFT;
    b.rod('#2b2622', V3(x, gy, 0), V3(x, gy + topH, 0), 3, 2);
    b.box('#ffffff', x + 52, gy + topH - 36, 0, 104, 72, 4, 2);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) b.box('#a8443f', x + i * 26 + 13, gy + topH - j * 24 - 12, 3, 26, 24, 2, 0);
  } else if (m.kind === 'beacon') {
    const H = 820 + LIFT;
    for (let i = 0; i < 6; i++) {
      const w = 80 - ((i + 0.5) * 40) / 6;
      b.cyl(i % 2 ? '#ffffff' : '#a8443f', x, gy + (i + 0.5) * (H / 6), 0, w, H / 6, 3);
    }
    b.box('#f2d36b', x, gy + H + 30, 0, 68, 60, 68, 3);
    b.cone('#3b2a1d', x, gy + H + 85, 0, 56, 50, 3, 0, Math.PI / 4, 0);
  } else return null;
  const root = new THREE.Group();
  root.add(tagSmall(b.build()));
  if (body) { const bg = tagSmall(body.build()); root.add(bg); root.userData.banner = bg; }
  root.position.z = Z;
  return root;
}

export function createScenery(root, state) {
  const group = new THREE.Group();
  root.add(group);
  const blocks = new Map(), turrets = new Map(), markers = new Map();
  let courseRef = null;
  const clear = () => { for (const m of [blocks, turrets, markers]) { for (const o of m.values()) if (o) { o.removeFromParent(); o.traverse((q) => q.geometry && q.geometry.dispose()); } m.clear(); } };
  const get = (map, key, make) => {
    if (map.has(key)) return map.get(key);
    let o = null;
    try { o = make(); } catch (e) { console.warn('view3d scenery', e && e.message); }
    if (o) { applyLook(o); group.add(o); }
    map.set(key, o);
    return o;
  };
  return {
    // camX = the camera's map x, halfW = half the visible width (map units)
    update(camX, halfW) {
      const course = state.course;
      if (!course) { if (courseRef) { clear(); courseRef = null; } return; }
      if (course.map !== courseRef) { clear(); courseRef = course.map || {}; }
      const reach = halfW + RANGE;
      for (const f of course.features || []) for (const bk of f.blocks || []) {
        const near = bk.x1 > camX - reach && bk.x0 < camX + reach;
        const o = blocks.get(bk) || (near ? get(blocks, bk, () => buildBlock(course, bk)) : null);
        if (o) o.visible = near;
      }
      for (const t of course.turrets || []) {
        if (t.x == null) continue;
        const near = Math.abs(t.x - camX) < reach;
        const o = turrets.get(t) || (near ? get(turrets, t, () => buildTurret(t)) : null);
        if (!o) continue;
        o.visible = near;
        if (!near) continue;
        o.position.set(t.x, -(t.y + 20), Z);
        const u = o.userData;
        u.live.visible = !t.dead;
        u.dead.visible = !!t.dead;
        u.pivot.rotation.z = -fin(t.aim);
        const hp = Math.max(0, Math.min(8, Math.round(fin(t.hp))));
        u.pips.forEach((p, i) => { p.visible = i < hp && !t.dead; });
        const k = t.charging ? Math.max(0, Math.min(1, 1 - Math.max(0, fin(t.cd)) / (Number(config.COURSE.TURRET_WARN) || 1))) : 0;
        u.glow.visible = !!t.charging && !t.dead;
        u.glow.scale.setScalar(30 + 40 * k);
      }
      for (const m of course.markers || []) {
        const x = fin(m.mx ?? m.cx, NaN);
        if (!Number.isFinite(x)) continue;
        const near = Math.abs(x - camX) < reach + 1500;
        const o = markers.get(m) || (near ? get(markers, m, () => buildMarker(m, course)) : null);
        if (!o) continue;
        o.visible = near;
        if (near && m.kind === 'outpost') {
          const live = course.map && course.map.outposts && course.map.outposts.find((q) => q.x === m.mx && !q.done);
          o.visible = !!live;
        }
      }
    },
  };
}
