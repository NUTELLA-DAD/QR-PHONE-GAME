// The things that stand on the land, from the course (read only): castle blocks and factories (course.features[].blocks), turrets (course.turrets) and the route markers (course.markers: mooring mast,
// outpost poles, checkpoint flags, the beacon). Each is built once, when the camera first comes near it, from rigid pieces with an ink shell; after that only a few things change, all of them held on
// 8 fps keys (3D.md section 1): a flag's pose, the beacon's sweep, a turret's aim and its health pips and warning glow, smoke from a chimney or a wrecked turret (WP4's particles).
// WP9 (enemies and world objects v2) gave them detail: sandbagged turrets with plated domes, the outposts' lookout posts and red lanterns, hinged flags, a lighthouse with a sweeping beam, windowed castles.
// The turrets' dotted warning lines are drawn with the line pool (worldObjects.js).
import { THREE, Batch, applyLook, tagSmall, INK, G, glowMat, glow } from './style.js';
import { config } from '../../config.js';
import { groundAt } from '../host/course.js';
import { buildRocket } from './enemyArt.js';

const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const Z = -45; // the depth the land's things stand at (just in front of the rock slab behind the ships)
const RANGE = 3200; // build and show things this far (world units) either side of the camera
const FLAG_KEYS = [[0.05, 0.16, 0.24, 0.26], [0, -0.1, -0.18, -0.12], [-0.06, 0.06, 0.16, 0.12]]; // a flag's rigid segments: three held poses
const SLIT = '#2b2420';

// a flag of `n` hinged segments (rigid): cloth(i) -> [color, ...] per cell stack; w = a segment's width, h = the flag's height. update() poses the segments on the key.
function buildFlag(n, w, h, cells, depth = 3, hOf = null, decorate = null) {
  const flag = new THREE.Group();
  const segs = [];
  for (let i = 0; i < n; i++) {
    const sg = new THREE.Group(), b = new Batch(), rows = cells(i) || [], hh = h * (hOf ? hOf(i) : 1); // (hOf: a segment's share of the full height: a pennant tapers)
    rows.forEach((col, j) => b.box(col, w / 2, -(j + 0.5) * (hh / rows.length), 0, w, hh / rows.length, depth, 1.2));
    if (decorate) decorate(i, b, hh);
    sg.add(tagSmall(b.build()));
    sg.position.x = i * w;
    flag.add(sg);
    segs.push(sg);
  }
  flag.userData.segs = segs;
  return flag;
}
const poseFlag = (flag, K, phase = 0) => { const segs = flag && flag.userData.segs, row = FLAG_KEYS[(((Math.floor(K) + phase) % 3) + 3) % 3]; if (segs && row) segs.forEach((sg, i) => { sg.rotation.y = row[i % 4]; }); };

function banner(b, x, y, s) { // the raiders' banner on a wall or tower: dark red with a black horn mark (the 2D one hangs from (x, y) downward)
  b.box('#8e1f1a', x, y - 30 * s, 0, 40 * s, 60 * s, 6, 2);
  b.box('#2b2622', x, y - 30 * s, 4, 12 * s, 22 * s, 3, 0);
  b.cone('#2b2622', x - 9 * s, y - 20 * s, 4, 3.4 * s, 12 * s, 0, 0, 0, 0.5); b.cone('#2b2622', x + 9 * s, y - 20 * s, 4, 3.4 * s, 12 * s, 0, 0, 0, -0.5);
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
  const slits = (n, yTop, color = SLIT) => { for (let i = 0; i < n; i++) b.box(color, x0 + ((i + 0.5) * w) / n, -(yTop), d / 2 + 1, 7, 26, 3, 0); };
  if (bk.kind === 'wall') {
    b.box('#9a948c', cx, mid - 11, 0, w, h - 22, d, 3);
    merlons(x0, x1, top, 22, '#9a948c');
    b.box('#8a847c', cx, -(top + 26), 0, w + 6, 8, d + 8, 2); // a coping stone along the top
    b.box('#2b2420', cx, -(g - 62), d / 2 + 1, 80, 80, 3, 0); // the gate
    for (const k of [-24, -8, 8, 24]) b.box('#4a3a2a', cx + k, -(g - 62), d / 2 + 3, 3, 78, 2, 0); // its portcullis bars
    slits(Math.max(2, Math.round(w / 140)), top + 70);
  } else if (bk.kind === 'tower') {
    b.box('#8a847c', cx, mid - 13, 0, w, h - 26, d, 3);
    merlons(x0 - 6, x1 + 6, top, 26, '#8a847c');
    b.box('#7a746c', cx, -(top + 32), 0, w + 14, 8, d + 12, 2); // the overhanging parapet
    slits(2, top + 90);
    b.box('#f2d36b', cx, -(top + 150), d / 2 + 1, 12, 20, 3, 0); // a lit window
    banner(b, cx, -(top + 34), 1);
  } else if (bk.kind === 'keep') {
    const roofH = 80;
    b.box('#958f86', cx, -(top + roofH + (h - roofH) / 2), 0, w, h - roofH, d, 3);
    b.cone('#4a4f63', cx, -(top + roofH / 2), 0, Math.max(w, d) * 0.78, roofH, 3, 0, Math.PI / 4, 0);
    slits(3, top + roofH + 60);
    b.box('#f2d36b', cx, -(top + roofH + 120), d / 2 + 1, 14, 22, 3, 0);
    b.rod('#2b2622', V3(cx, -(top + roofH - 10), 0), V3(cx, -(top + roofH + 58), 0), 1.6, 0);
    banner(b, cx, -(top + roofH + 6), 1.3);
  } else if (bk.kind === 'shed') {
    const roofH = 40;
    b.box('#9b4a3a', cx, -(top + roofH + (h - roofH) / 2), 0, w, h - roofH, d, 3);
    const teeth = Math.max(2, Math.round(w / 80)), tw = w / teeth;
    for (let i = 0; i < teeth; i++) { b.box('#5b5550', x0 + (i + 0.5) * tw, -(top + roofH / 2), 0, tw, roofH, d, 2.5); b.box('#bcd9e3', x0 + (i + 0.5) * tw, -(top + roofH / 2 + 4), d / 2 + 1, tw * 0.6, 12, 2, 0); } // sawtooth roof lights
    b.box('#3b2a1d', cx, -(g - 70), d / 2 + 1, 48, 60, 3, 0);
    for (let i = 0; i < Math.max(2, Math.round(w / 90)); i++) b.box('#f2d36b', x0 + ((i + 0.5) * w) / Math.max(2, Math.round(w / 90)), -(top + roofH + 60), d / 2 + 1, 16, 20, 3, 0);
  } else if (bk.kind === 'chimney') {
    b.cyl('#8e3f30', cx, -(top + 14 + (g - top - 14) / 2), 0, w / 2 + 6, g - top - 14, 3);
    b.cyl('#3a3330', cx, -(top + 9), 0, w / 2 + 12, 18, 3);
    for (const k of [0.12, 0.2]) b.cyl('#f3ead6', cx, -(top + (g - top) * k + 5), 0, w / 2 + 7, 10, 0);
    b.cyl('#6a2f24', cx, -(top + (g - top) * 0.6), 0, w / 2 + 8, 6, 0); // a belt of darker brick
  } else return null;
  const grp = tagSmall(b.build());
  grp.position.z = Z;
  if (bk.kind === 'chimney') grp.userData.smokeAt = { x: cx, y: -top };
  return grp;
}

// the turret: a sandbagged emplacement with a plated dome, a barrel on a mount, a lamp that goes red when it is about to fire, and eight health pips (an instanced strip: 2 draw calls, however many show)
const SACK = '#b79a63';
const PIP_GEO = new THREE.BoxGeometry(1, 1, 1);
function buildTurret(t) {
  const root = new THREE.Group();
  const live = new THREE.Group(), dead = new THREE.Group();
  const base = new Batch();
  base.cyl('#6b5a4a', 0, 8, 0, 40, 24, 3.4);
  base.cyl('#5a5558', 0, 10, 0, 42, 5, 2);
  base.sphere('#7a6a58', 0, 18, 0, 36, 26, 36, 3.4); // the plated dome
  for (const a of [0.7, 1.3, 1.9, 2.5]) base.box('#5a5558', Math.cos(a) * 33, 12 + Math.sin(a) * 22, 0, 6, 6, 40, 1.2, 0, 0, a); // iron ribs over it
  for (let k = 0; k < 9; k++) { const a = (k / 9) * PI * 2; base.sphere(SACK, Math.cos(a) * 52, -2, Math.sin(a) * 34, 14, 8, 11, 1.6, true); } // the sandbags
  base.box('#5a3a22', -48, 6, 24, 18, 14, 14, 1.4); base.box('#5a3a22', -48, 20, 24, 14, 10, 12, 1.4); // an ammo crate or two
  base.cyl('#a8443f', 0, 42, 0, 6, 6, 1.4); // the lamp's stand
  live.add(base.build());
  const lampOff = new THREE.MeshBasicMaterial({ color: '#6b1b17' }), lampOn = glowMat('#ff2a3c', 3);
  const lamp = new THREE.Mesh(G.sphereLo, lampOff);
  lamp.scale.setScalar(7); lamp.position.set(0, 48, 0);
  live.add(lamp);
  const pivot = new THREE.Group();
  pivot.position.set(0, 26, 0);
  if (t.rocket) {
    const r = new Batch();
    r.rod('#2b2622', V3(-26, 10, 0), V3(12, 84, 0), 3.4, 2);
    r.rod('#2b2622', V3(-26, 10, 12), V3(12, 84, 12), 2, 1.2); r.rod('#2b2622', V3(-26, 10, -12), V3(12, 84, -12), 2, 1.2);
    r.box('#5a5558', 12, 84, 0, 18, 6, 28, 1.6, 0, 0, 0.4);
    live.add(r.build());
    const rk = buildRocket();
    rk.position.set(-6, 52, 0); rk.rotation.z = 1.1; rk.scale.setScalar(1.2);
    live.add(rk);
  } else {
    const barrel = new Batch();
    barrel.box('#5a5558', 31, 0, 0, 62, 16, 16, 2.5);
    barrel.box('#2b2622', 62, 0, 0, 8, 22, 22, 1.6); // the muzzle ring
    barrel.box('#3a3638', -2, 0, 0, 22, 26, 26, 2); // the breech
    barrel.box('#c9a85a', 30, 0, 0, 6, 18, 18, 0.6); // a brass band
    pivot.add(barrel.build());
    live.add(pivot);
  }
  const pips = new THREE.InstancedMesh(PIP_GEO, new THREE.MeshBasicMaterial({ color: '#a8443f' }), 8);
  const pipsInk = new THREE.InstancedMesh(PIP_GEO, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }), 8);
  pips.userData.small = true; pipsInk.userData.isOutline = true; pipsInk.userData.small = true;
  const M = new THREE.Matrix4();
  for (let i = 0; i < 8; i++) { M.compose(V3(-45.5 + i * 13, 84, 0), new THREE.Quaternion(), V3(9, 9, 9)); pips.setMatrixAt(i, M); M.compose(V3(-45.5 + i * 13, 84, 0), new THREE.Quaternion(), V3(13, 13, 13)); pipsInk.setMatrixAt(i, M); }
  pips.frustumCulled = pipsInk.frustumCulled = false;
  live.add(pips, pipsInk);
  const rub = new Batch();
  rub.sphere('#3b3b3b', 0, 6, 0, 36, 14, 26, 3);
  rub.sphere('#3b3b3b', 14, 14, 0, 16, 10, 14, 2.5);
  rub.box('#2b2622', -22, 16, 6, 22, 6, 6, 1, 0, 0, 0.5);
  for (let k = 0; k < 5; k++) rub.sphere(SACK, Math.cos(k) * 48, -2, Math.sin(k * 1.7) * 30, 12, 7, 9, 1.4, true);
  dead.add(rub.build());
  const glowM = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff2a3c', transparent: true, opacity: 0.4, depthWrite: false }));
  glowM.position.set(0, 26, 20);
  glowM.visible = false;
  root.add(live, dead, glowM);
  root.userData = { live, dead, pivot, pips, pipsInk, glow: glowM, lamp, lampOn, lampOff };
  return tagSmall(root);
}

// ---- the route markers -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const BEAM_MAT = new THREE.MeshBasicMaterial({ color: '#fff0a0', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const BEAM_GEO = new THREE.ConeGeometry(1, 1, 18, 1, true); // (open: a hollow cone of light)
BEAM_GEO.rotateZ(PI / 2); BEAM_GEO.translate(0.5, 0, 0); // apex at the origin, widening toward +x
function buildMarker(m, course) {
  const G0 = Number(config.COURSE.GROUND) || 1350, LIFT = G0 - 1350;
  const b = new Batch();
  const x = fin(m.mx ?? m.cx), g = fin(m.my, groundAt(course, x));
  const gy = -g;
  const root = new THREE.Group();
  root.userData = {};
  if (m.kind === 'home') { // the mooring mast: a lattice tower with a platform and a blue pennant
    const mastH = m.top != null ? g - m.top : 900 + LIFT;
    b.cone('#7a5a3a', x, gy + mastH / 2, 0, 70, mastH, 3, 0, Math.PI / 4, 0);
    for (let y = 70; y < mastH - 40; y += 90) { const k = 1 - y / mastH, hw = 56 * k + 8; b.rod('#5a3e26', V3(x - hw, gy + y, hw), V3(x + hw, gy + y + 60, hw), 3, 1.4); b.rod('#5a3e26', V3(x + hw, gy + y, hw), V3(x - hw, gy + y + 60, hw), 3, 1.4); b.box('#5a3e26', x, gy + y, hw, hw * 2, 5, 5, 1.2); }
    b.box('#8a6444', x, gy + mastH, 0, 120, 24, 60, 3);
    for (const s of [-1, 1]) b.rod('#5a3e26', V3(x + s * 60, gy + mastH + 12, 30), V3(x + s * 60, gy + mastH + 44, 30), 2, 1);
    b.rod('#2b2622', V3(x, gy + mastH, 0), V3(x, gy + mastH + 110, 0), 2.5, 0);
    root.add(tagSmall(b.build()));
    const fl = buildFlag(4, 18, 36, () => ['#3a86ff', '#3a86ff'], 2.4);
    fl.position.set(x + 1, gy + mastH + 108, 0);
    root.add(fl);
    root.userData.flags = [[fl, 0]];
  } else if (m.kind === 'outpost') { // the raiders' pole: a lookout post, a banner, two red lanterns and a ring of sandbags
    b.rod('#2b2622', V3(x, gy, 0), V3(x, gy + 420, 0), 3.6, 2);
    b.box('#4a3a2a', x, gy + 360, 0, 70, 8, 44, 2.4); // a lookout platform
    for (const s of [-1, 1]) { b.rod('#4a3a2a', V3(x + s * 33, gy + 362, 20), V3(x + s * 33, gy + 392, 20), 1.6, 0); b.rod('#4a3a2a', V3(x + s * 33, gy + 362, -20), V3(x + s * 33, gy + 392, -20), 1.6, 0); }
    b.rod('#4a3a2a', V3(x - 33, gy + 392, 20), V3(x + 33, gy + 392, 20), 1.6, 0);
    for (const s of [-1, 1]) { b.rod('#2b2622', V3(x, gy + 410, 0), V3(x + s * 20, gy + 380, 0), 1, 0); b.sphere('#ff6a3a', x + s * 20, gy + 372, 0, 8, 10, 8, 1.4, true); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * PI * 2; b.sphere(SACK, x + Math.cos(a) * 46, gy + 6, Math.sin(a) * 30, 17, 9, 12, 1.8, true); }
    root.add(tagSmall(b.build()));
    const fl = buildFlag(4, 26, 70, () => ['#8e1f1a', '#8e1f1a'], 4, (i) => [1, 0.88, 0.7, 0.46][i], (i, bb, hh) => { // the raiders' banner: a tapering pennant, a black horn mark on its second segment
      if (i !== 1) return;
      bb.box('#2b2622', 13, -hh * 0.5, 3.4, 12, hh * 0.4, 2.2, 0);
      for (const sgn of [-1, 1]) bb.cone('#2b2622', 13 + sgn * 9, -hh * 0.3, 3.4, 4, 18, 0, 0, 0, -sgn * 0.55);
    });
    fl.position.set(x + 2, gy + 420, 0);
    fl.scale.setScalar(1.7);
    root.add(fl);
    root.userData.flags = [[fl, 1]];
  } else if (m.kind === 'checkpoint') { // a tall pole with a waving chequered flag: four hinged columns of three cells
    const topH = 640 + LIFT;
    b.rod('#2b2622', V3(x, gy, 0), V3(x, gy + topH, 0), 3.4, 2);
    b.sphere('#c9a85a', x, gy + topH + 6, 0, 7, 7, 7, 1.4, true);
    root.add(tagSmall(b.build()));
    const fl = buildFlag(4, 26, 72, (i) => [0, 1, 2].map((j) => ((i + j) % 2 ? '#ffffff' : '#a8443f')), 3);
    fl.position.set(x, gy + topH, 0);
    root.add(fl);
    root.userData.flags = [[fl, 2]];
  } else if (m.kind === 'beacon') { // the lighthouse: red and white bands, a lantern room that glows and a beam that sweeps (turned in 8 fps steps)
    const H = 820 + LIFT;
    for (let i = 0; i < 6; i++) {
      const w = 80 - ((i + 0.5) * 40) / 6;
      b.cyl(i % 2 ? '#ffffff' : '#a8443f', x, gy + (i + 0.5) * (H / 6), 0, w, H / 6, 3);
    }
    b.cyl('#3a3330', x, gy + H + 4, 0, 52, 10, 2.4); // the gallery
    b.box('#5a3e26', x, gy + H + 12, 0, 96, 6, 96, 2);
    for (const a of [0.2, 1.77, 3.34, 4.91]) b.rod('#3a3330', V3(x + Math.cos(a) * 30, gy + H + 12, Math.sin(a) * 30), V3(x + Math.cos(a) * 30, gy + H + 56, Math.sin(a) * 30), 2.2, 0);
    b.cone('#3b2a1d', x, gy + H + 92, 0, 56, 50, 3, 0, Math.PI / 4, 0);
    b.sphere('#c9a85a', x, gy + H + 122, 0, 7, 7, 7, 1.4, true);
    root.add(tagSmall(b.build()));
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 44, 14), glowMat('#ffe27a', 2.2));
    lantern.position.set(x, gy + H + 34, 0);
    root.add(lantern);
    const beam = new THREE.Group();
    const cone = new THREE.Mesh(BEAM_GEO, BEAM_MAT);
    cone.scale.set(900, 150, 150);
    const cone2 = cone.clone();
    cone2.rotation.y = PI;
    beam.add(cone, cone2);
    beam.position.set(x, gy + H + 34, 0);
    beam.renderOrder = 3;
    root.add(beam);
    root.userData.beam = beam;
  } else return null;
  root.position.z = Z;
  return root;
}

export function createScenery(root, state, api = {}) {
  const group = new THREE.Group();
  root.add(group);
  const blocks = new Map(), turrets = new Map(), markers = new Map();
  let courseRef = null, K = 0;
  const accs = new WeakMap();
  const P = () => (api.P ? api.P() : null);
  const due = (o, perSec, dt) => { let a = (accs.get(o) || 0) + perSec * dt; const n = Math.floor(a); accs.set(o, a - n); return Math.min(n, 2); };
  const clear = () => { for (const m of [blocks, turrets, markers]) { for (const o of m.values()) if (o) { o.removeFromParent(); o.traverse((q) => q.geometry && q.geometry.dispose()); } m.clear(); } };
  const get = (map, key, make) => {
    if (map.has(key)) return map.get(key);
    let o = null;
    try { o = make(); } catch (e) { console.warn('view3d scenery', e && (e.stack || e.message)); }
    if (o) { applyLook(o); group.add(o); }
    map.set(key, o);
    return o;
  };
  return {
    // camX = the camera's map x, halfW = half the visible width (map units); o = { t, dt }
    update(camX, halfW, o = {}) {
      const course = state.course;
      K = Math.floor(fin(o.t) * 8);
      const dt = Math.min(0.1, Math.max(0, fin(o.dt, 0.016)));
      if (!course) { if (courseRef) { clear(); courseRef = null; } return; }
      if (course.map !== courseRef) { clear(); courseRef = course.map || {}; }
      const reach = halfW + RANGE, p = P();
      for (const f of course.features || []) for (const bk of f.blocks || []) {
        const near = bk.x1 > camX - reach && bk.x0 < camX + reach;
        const ob = blocks.get(bk) || (near ? get(blocks, bk, () => buildBlock(course, bk)) : null);
        if (!ob) continue;
        ob.visible = near;
        if (near && p && ob.userData.smokeAt && due(ob, 3.5, dt)) { const s = ob.userData.smokeAt; p.burst('smoke', s.x, s.y + 24, Z + 10, 1, { size: [40, 66], size1: 2.4, life: [2, 3.2], color: '#8a8480', alpha: 0.7, speed: [4, 14], up: [34, 60] }); } // a factory chimney smokes
      }
      for (const t of course.turrets || []) {
        if (t.x == null) continue;
        const near = Math.abs(t.x - camX) < reach;
        const ot = turrets.get(t) || (near ? get(turrets, t, () => buildTurret(t)) : null);
        if (!ot) continue;
        ot.visible = near;
        if (!near) continue;
        ot.position.set(t.x, -(t.y + 20), Z);
        const u = ot.userData;
        u.live.visible = !t.dead;
        u.dead.visible = !!t.dead;
        u.pivot.rotation.z = -fin(t.aim);
        const hp = Math.max(0, Math.min(8, Math.round(fin(t.hp))));
        u.pips.count = u.pipsInk.count = t.dead ? 0 : hp;
        const warn = Number(config.COURSE.TURRET_WARN) || 1, k = t.charging ? Math.max(0, Math.min(1, 1 - Math.max(0, fin(t.cd)) / warn)) : 0;
        u.glow.visible = !!t.charging && !t.dead;
        u.glow.scale.setScalar(30 + 40 * k);
        u.lamp.material = t.charging && !t.dead ? (K & 1 ? u.lampOn : u.lampOff) : u.lampOff; // (the lamp blinks: held keys)
        if (t.dead && p && due(t, 2.5, dt)) p.burst('smoke', t.x, -(t.y + 20) + 30, Z + 10, 1, { size: [30, 52], size1: 2, life: [1.6, 2.6], color: '#403c3c', alpha: 0.75, speed: [3, 12], up: [24, 50] }); // a wrecked turret smoulders
      }
      for (const m of course.markers || []) {
        const x = fin(m.mx ?? m.cx, NaN);
        if (!Number.isFinite(x)) continue;
        const near = Math.abs(x - camX) < reach + 1500;
        const om = markers.get(m) || (near ? get(markers, m, () => buildMarker(m, course)) : null);
        if (!om) continue;
        om.visible = near;
        if (near && m.kind === 'outpost') {
          const live = course.map && course.map.outposts && course.map.outposts.find((q) => q.x === m.mx && !q.done);
          om.visible = !!live;
        }
        if (om.visible && om.userData.flags) for (const [fl, ph] of om.userData.flags) poseFlag(fl, K, ph);
        if (om.visible && om.userData.beam) om.userData.beam.rotation.y = -(K * 0.19); // (the beam turns at a constant 1.5 rad/s, shown in 8 fps steps)
      }
    },
    dispose() { clear(); group.removeFromParent(); },
  };
}
void glow;
