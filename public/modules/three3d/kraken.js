// The Kraken (state.creature, creature.js / creatures/kraken.js) in 3D. Each tentacle is a chain of rigid segments: tapered toon capsules with a ball joint at the
// base and rows of bone sucker bumps on the inside of the curl; the mantle is one big toon ellipsoid with fins and crest spikes; the eyes glow. Depth does the showing
// off: front tentacles are held in front of the hull, back ones behind it, so they pass in front of and behind the ship. Every position is read from the 2D body;
// nothing here moves by itself (no wobble).
import { THREE, Batch, G, mat, look, INK, toonVC, plainVC, applyLook } from './style.js';
import { config } from '../../config.js';

const SKIN = '#6a2d49', SKIN_DARK = '#46203a', BELLY = '#b9708a', BONE = '#e8dcc0', CHAR = '#2f2a2e', EYE = '#f0c64a', FIN = '#52284a', MOUTH_IN = '#6e1a28';
const OW = 12; // ink width in world units (the creature is huge and drawn far away)
const FRONT_Z = 360, BACK_Z = -360;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const flashMat = new THREE.MeshBasicMaterial({ color: '#fff4e0' });

const segCache = new Map();
function segGeometry(len, r0, r1, mode) {
  const key = Math.round(len) + '|' + Math.round(r0) + '|' + Math.round(r1) + '|' + mode;
  let g = segCache.get(key);
  if (g) return g;
  const b = new Batch();
  const cyl = new THREE.CylinderGeometry(r1, r0, len, 16, 1);
  cyl.rotateZ(-Math.PI / 2);
  cyl.translate(len / 2, 0, 0);
  b.geo(SKIN, cyl, mat(), OW);
  b.sphere(SKIN, 0, 0, 0, r0 * 1.02, r0 * 1.02, r0 * 1.02, OW); // the ball joint at the base
  const rm = (r0 + r1) / 2;
  if (mode === 'tip') {
    const tipL = r1 * 3.2;
    b.cone(SKIN, len + tipL / 2 - 4, 0, 0, r1, tipL, OW, 0, 0, -Math.PI / 2);
    b.cone(CHAR, len + tipL * 0.78, 0, 0, r1 * 0.34, tipL * 0.45, OW * 0.6, 0, 0, -Math.PI / 2);
  } else if (mode === 'cut') {
    b.sphere('#d98a95', len, 0, 0, Math.max(6, r1 * 0.4), r1 * 0.98, r1 * 0.98, OW * 0.7);
  }
  // back spike (charcoal) sweeping toward the tip
  b.cone(CHAR, len * 0.5, rm * 1.05 + 14, 0, Math.max(10, rm * 0.28), Math.max(28, rm * 0.7), OW * 0.7, 0, 0, -0.5);
  // suckers on the inside of the curl (local -y): rows of bone bumps, three round the axis
  const ns = clamp(Math.round(len / (rm * 1.3)), 1, 4);
  for (let k = 0; k < ns; k++) {
    const u = (k + 0.5) / ns, x = len * u, e = r0 + (r1 - r0) * u, rs = Math.max(7, e * 0.34);
    for (const a of [-0.62, 0, 0.62]) {
      const ang = -Math.PI / 2 + a; // around the axis, centred on -y
      b.sphere(BONE, x, Math.sin(ang) * e * 0.98, Math.cos(ang) * e * 0.98, rs * 0.95, rs * 0.7, rs * 0.95, OW * 0.55, true);
    }
  }
  g = b.parts;
  segCache.set(key, b);
  return b;
}
// (a Batch is built into a fresh Group per segment mesh, sharing nothing mutable)
function segMesh(len, r0, r1, mode) {
  const b = segGeometry(len, r0, r1, mode);
  // rebuild a Batch's mesh from its parts: Batch.build disposes its parts, so keep a merged geometry cached on the batch instead
  if (!b.merged) {
    const grp = b.build({ cast: true, receive: true });
    b.merged = grp;
    b.parts = [];
  }
  const src = b.merged;
  const grp = new THREE.Group();
  const mesh = src.children[0].clone();
  const shell = src.children[1].clone();
  mesh.userData = { ...src.children[0].userData };
  shell.userData = { isOutline: true };
  grp.add(mesh, shell);
  mesh.userData.sharedGeo = true; shell.userData.sharedGeo = true;
  return grp;
}

export function createKrakenView(scene) {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);
  const segs = new Map(); // key -> { grp, mode, len, r0, r1 }
  const chunkGroups = new Map(); // chunk -> Group
  const rigid = {}; // mantle, eyes, mouth
  const eyeLights = [];

  // ---- rigid parts, built once ---------------------------------------------------------------------------------------------------------------------------------
  const mantleFor = (s) => {
    const L = s.len, Wm = s.r;
    const b = new Batch();
    const cxm = L * 0.5 - 0.1 * Wm;
    b.sphere(SKIN, cxm, 0, 0, L * 0.5 + 0.95 * Wm, Wm, 0.9 * Wm, OW * 1.2);
    // the shaded flank: a darker, slightly smaller ellipsoid peeking out below (toon steps already give a light/dark split)
    const fin = (pts, z) => {
      const sh = new THREE.Shape();
      pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 50, bevelEnabled: false });
      g.translate(0, 0, z - 25);
      return g;
    };
    b.geo(FIN, fin([[0, 0.7 * Wm], [-0.5 * Wm, 1.9 * Wm], [0.35 * L, 0.9 * Wm]], 0), mat(), OW);
    b.geo(FIN, fin([[0.05 * L, -0.7 * Wm], [-0.2 * Wm, -1.7 * Wm], [0.4 * L, -0.95 * Wm]], 0), mat(), OW);
    b.geo(FIN, fin([[0.55 * L, 0.85 * Wm], [0.62 * L, 1.5 * Wm], [0.9 * L, 0.8 * Wm]], 0), mat(), OW);
    for (const [x, k] of [[0.08, 0.34], [0.3, 0.3], [0.56, 0.36], [0.8, 0.26]]) b.cone(CHAR, x * L, Wm * 1.0 + k * Wm * 0.6, 0, k * Wm * 0.5, k * Wm * 1.5, OW * 0.8);
    for (const [x, y, k] of [[0.2, 0.3, 0.16], [0.45, 0.1, 0.12], [0.62, 0.5, 0.18], [0.3, 0.62, 0.11], [0.75, 0.0, 0.14]]) b.sphere(SKIN_DARK, x * L, y * Wm, 0.9 * Wm * Math.sqrt(Math.max(0.05, 1 - (y * 0.9) ** 2)) * 0.96, k * Wm, k * Wm * 0.7, k * Wm * 0.3, 0, true);
    return b.build();
  };
  const eyeFor = (R) => {
    const b = new Batch();
    b.sphere(EYE, 0, 0, 0, R, R, R * 0.7, OW * 0.6);
    b.box(CHAR, R * 0.55, 0, R * 0.62, R * 0.3, R * 1.3, R * 0.2, 0);
    b.box(CHAR, -R * 0.3, R * 0.85, R * 0.5, R * 1.9, R * 0.4, R * 0.5, OW * 0.4, 0, 0, -0.35);
    const g = b.build();
    // glow: the eye itself does not take light (it is its own light)
    const mesh = g.children[0];
    mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true });
    mesh.userData.toon = mesh.material; mesh.userData.plain = mesh.material;
    return g;
  };
  const mouthFor = (R) => {
    const upper = new Batch(), lower = new Batch();
    upper.geo(BONE, new THREE.ConeGeometry(R * 1.0, R * 1.5, 12).rotateX(Math.PI), mat(0, -R * 0.55, 0, 1, 1, 0.8), OW * 0.8);
    upper.sphere(MOUTH_IN, 0, R * 0.1, R * 0.25, R * 0.8, R * 0.2, R * 0.5, 0);
    lower.geo(BONE, new THREE.ConeGeometry(R * 0.8, R * 1.1, 12).rotateX(Math.PI), mat(0, -R * 0.35, 0, 1, 1, 0.8), OW * 0.8);
    const g = new THREE.Group();
    const ug = upper.build(), lg = lower.build();
    g.add(ug, lg);
    g.userData.lower = lg;
    return g;
  };

  const getSeg = (key, len, r0, r1, mode) => {
    let e = segs.get(key);
    if (e && e.mode === mode && e.len === len) return e;
    if (e) root.remove(e.grp);
    const grp = segMesh(len, r0, r1, mode);
    grp.userData.segKey = key;
    root.add(grp);
    e = { grp, mode, len, used: true };
    segs.set(key, e);
    return e;
  };

  const placeLimb = (p, z, used, idKey, tint) => {
    const n = p.segs.length;
    p.segs.forEach((s, i) => {
      const mode = i === n - 1 ? (p.severed ? 'cut' : 'tip') : 'mid';
      const e = getSeg(idKey + '#' + i, s.len, s.r, s.r1, mode);
      e.used = true;
      used.add(idKey + '#' + i);
      const g = e.grp;
      g.visible = true;
      g.position.set(s.x, -s.y, z);
      g.rotation.set(p.side < 0 ? Math.PI : 0, 0, -s.ang);
      const mesh = g.children[0];
      mesh.material = p.hit > 0 ? flashMat : look.toon ? mesh.userData.toon : mesh.userData.plain;
    });
  };

  let t0 = 0;
  const view = {
    root,
    update(cr, night) {
      if (!cr) { root.visible = false; return; }
      root.visible = true;
      const used = new Set();
      const chunksUsed = new Set();
      cr.parts.forEach((p, pi) => {
        if (p.dead || p.hidden) return;
        const s0 = p.segs && p.segs[0];
        if (p.limb && p.segs.length) {
          const z = p.layer === 'front' ? FRONT_Z : BACK_Z - (pi % 3) * 70;
          placeLimb(p, z, used, 'L' + p.id);
        } else if (p.kind === 'mantle' && s0) {
          let r = rigid.mantle;
          if (!r) { r = rigid.mantle = { grp: mantleFor(s0), key: Math.round(s0.len) + '|' + Math.round(s0.r) }; root.add(r.grp); }
          const key = Math.round(s0.len) + '|' + Math.round(s0.r);
          if (r.key !== key) { root.remove(r.grp); r.grp = mantleFor(s0); r.key = key; root.add(r.grp); }
          const k = 1 + config.CREATURES.BREATH.AMOUNT * (cr.puff || 0);
          r.grp.position.set(s0.x, -s0.y, 0);
          r.grp.rotation.set(cr.f < 0 ? Math.PI : 0, 0, -s0.ang);
          r.grp.scale.set(k, k, k);
          const mesh = r.grp.children[0];
          mesh.material = p.hit > 0 ? flashMat : look.toon ? mesh.userData.toon : mesh.userData.plain;
          r.grp.visible = true;
        } else if (p.kind === 'eye' && s0) {
          let r = rigid[p.id];
          if (!r) { r = rigid[p.id] = { grp: eyeFor(s0.r) }; root.add(r.grp); const pl = new THREE.PointLight('#ffd75a', 0, 1800, 0); r.grp.add(pl); pl.position.z = 150; eyeLights.push(pl); r.light = pl; }
          r.grp.position.set(s0.x, -s0.y, 520);
          r.grp.scale.x = p.at && p.at[0] * cr.f > 0 ? -1 : 1;
          r.light.intensity = night * 3.2 * (p.hp > 0 ? 1 : 0.2);
        } else if (p.kind === 'mouth' && s0) {
          let r = rigid.mouth;
          if (!r) { r = rigid.mouth = { grp: mouthFor(s0.r) }; root.add(r.grp); }
          r.grp.position.set(s0.x, -s0.y, 330);
          r.grp.userData.lower.position.y = -(p.openAmt || 0) * s0.r * 0.9;
        }
      });
      for (const c of cr.chunks || []) { // severed limbs tumbling away
        chunksUsed.add(c);
        let g = chunkGroups.get(c);
        if (!g) { g = new THREE.Group(); chunkGroups.set(c, g); g.userData.meshes = []; root.add(g); }
        const p = c.part;
        const n = p.segs.length;
        while (g.userData.meshes.length < n) { const i = g.userData.meshes.length, s = p.segs[i]; const m = segMesh(s.len, s.r, s.r1, i === n - 1 ? 'cut' : 'mid'); g.add(m); g.userData.meshes.push(m); }
        g.position.set(c.cx, -c.cy, BACK_Z);
        g.rotation.z = -c.a;
        p.segs.forEach((s, i) => { const m = g.userData.meshes[i]; m.position.set(s.x, -s.y, 0); m.rotation.set(p.side < 0 ? Math.PI : 0, 0, -s.ang); });
      }
      for (const [c, g] of chunkGroups) if (!chunksUsed.has(c)) { root.remove(g); chunkGroups.delete(c); }
      for (const [key, e] of segs) { if (!used.has(key)) e.grp.visible = false; e.used = false; }
      t0++;
    },
    clear() {
      for (const e of segs.values()) root.remove(e.grp);
      segs.clear();
      for (const k of Object.keys(rigid)) { root.remove(rigid[k].grp); delete rigid[k]; }
      eyeLights.length = 0;
      root.visible = false;
    },
  };
  void toonVC; void plainVC; void applyLook; void G; void INK;
  return view;
}
