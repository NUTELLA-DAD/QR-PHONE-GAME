// DAMAGE STATES PER PART (3D.md section 4, WP6): what the simulation says about every part of a ship, drawn on the 3D ship. Reads only; nothing is written back to the game.
//
// A part has four states, from its hp share (modules.js: hp / max, broken):  0 INTACT   1 SCUFFED (soot; the blows themselves are decals, damageView.js)   2 DAMAGED (dents, a loose piece hanging as a
// POSE, smoke)   3 BROKEN. The searchlights have no hp: their state is how many blows the hit log shows on them. What each broken part looks like:
//   gun        the barrel droops and the muzzle end is bent over (a second, two-piece barrel is built the first time a gun is hurt and swapped in; the whole thing is a pose, never a joint)
//   engine     the nacelle sags, the prop stands still, tilted and bent, and the engine smokes black
//   boiler     the firebox door hangs open (built when first needed) on a dark mouth, the glow and the boiler's light go out, steam vents
//   sail       ragged holes are cut through the canvas (shader), the lower corner is missing; a damaged sail still has that corner hanging by one point (a small flap, posed)
//   searchlight the lens goes dark and cracked (a few thin dark strips over it)
//   other station, coil, cannon  soot and dents (shader), loose planks and a toppled crate on the deck beside it, smoke or sparks
// HOW (3D.md 6: no per-frame geometry): every part has a number (aPart, set when the ship is assembled) and one small data texture a ship (kit.js DMG_FRAG) holds its soot / dents / tears / grey, so the ship is
// still ONE draw call; a texel is rewritten only when it changes. Poses touch the dyn nodes the builders already made (guns, props, wheel, sail, bag). Planks and crates are two InstancedMeshes a ship.
// Also here: SCORCH MEMORY (a fire that burned more than 3 s leaves a scorch mark, kept until the part near it is repaired or the ship refitted), BREACHES (a hole in the far hull wall with planks sticking out,
// a plank patch once it is mended), RAM DENTS (dents on the prow for each landed ram), HULL SOOT (the hull, decks and rooms darken as the hull share drops), the DEFLATED BAG (a stepped crumple and sag, no cloth)
// and REPAIRS (a part that mends snaps back through a half-way key and gives a puff of dust and sparks). Everything is steady: rigid poses, stepped keys, no wobble.
import { THREE, look } from './style.js';
import { PartBatch, inkInstanced } from './parts3d/kit.js';
import { GUN_LOOK } from './parts3d/weapons.js';
import { getTrimSheet, uvRect, SCORCH, HOLES } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (v) => Number.isFinite(v);
const hashN = (n) => { let h = Math.imul((n | 0) ^ 0x9e3779b1, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hashS = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const K = () => config.DAMAGE3D;
const CLASS = { gun: 'gun', engine: 'engine', sail: 'sail', station: 'station', coil: 'coil', crewCannon: 'cannon', searchlight: 'lamp', pipe: 'pipe', hull: 'wall', deck: 'wall', enemyDeck: 'wall', room: 'wall', armour: 'wall', gasbag: 'bag', ramProw: 'ram' };
const WALL_DECK_ROWS = new Set(['main', 'lower', 'keel', 'deep', 'bay']);
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _p = new THREE.Vector3();
const baseName = (key) => String(key).replace(/#\d+$/, '');

export function createPartDamage({ state, models, vfx }) {
  const P = vfx && vfx.P && vfx.P.ok !== false ? vfx.P : null;
  const pers = new Map(); // ship id -> what a ship remembers across a rebuild: { seenN, hits, scorches, patches, fireAge, breaches }
  const recs = new Map(); // ship id -> what is bound to the ship's current model
  const sheet = () => getTrimSheet().texture;
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const stats = { parts: 0, damaged: 0, broken: 0, scorches: 0, breaches: 0, patches: 0, planks: 0, crates: 0, texWrites: 0, variants: 0 };

  // ---- the loose bits: ONE plank geometry and ONE crate geometry (toon + ink, the ship's own materials), instanced ---------------------------------------------------------------------------
  const bitGeos = new WeakMap(); // model -> { plank, crate } (built once per ship model)
  function bitsFor(model) {
    let b = bitGeos.get(model);
    if (b) return b;
    const ctx = model.ctx, C = K().COLORS;
    const pb = new PartBatch('dmg:plank');
    pb.mats = ctx.mats;
    pb.box(C.PLANK, 0, 0, 0, 66, 12, 9, 1.4, 0, 0, 0, { tr: 'woodC' });
    pb.box(C.PLANK, 31, 0, 0, 5, 14, 11, 0.8, 0, 0, 0, { tr: 'woodC', ao: { top: 0.1 } }); // (a splintered end: a little thicker)
    const cb = new PartBatch('dmg:crate');
    cb.mats = ctx.mats;
    cb.box(C.CRATE, 0, 0, 0, 32, 28, 30, 1.8, 0, 0, 0, { tr: 'woodC' });
    for (const sx of [-10, 10]) cb.box(ctx.T.iron, sx, 0, 0, 4.5, 29, 31, 0.5, 0, 0, 0, { tr: 'iron' });
    const plank = inkInstanced(pb.buildGeometry(), ctx.mats, 48), crate = inkInstanced(cb.buildGeometry(), ctx.mats, 16);
    plank.name = 'dmgPlanks'; crate.name = 'dmgCrates';
    model.content.add(plank, crate);
    b = { plank, crate };
    bitGeos.set(model, b);
    return b;
  }

  // ---- decals: the trim sheet's scorch / hole rows, one instanced quad mesh for the wall and one for fittings (like damageView.js) -------------------------------------------------------------
  function makeDecalMesh(max) {
    const geo = planeGeo.clone();
    const aDecal = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    aDecal.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDecal', aDecal);
    const mat = new THREE.MeshBasicMaterial({ map: sheet(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -2.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aDecal;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aDecal.xy + uv * aDecal.zw;\n#endif');
    };
    mat.customProgramCacheKey = () => 'decal-trim'; // (the same program as damageView.js's decals)
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    mesh.renderOrder = 4;
    return mesh;
  }

  // ---- what a ship remembers --------------------------------------------------------------------------------------------------------------------------------------------------------------
  const newPers = () => ({ seenN: 0, hits: new Map(), scorches: [], patches: [], fireAge: new Map(), breaches: new Map(), lastHull: 100 });
  const resetPers = (pm) => { pm.seenN = 0; pm.hits.clear(); pm.scorches.length = 0; pm.patches.length = 0; pm.fireAge.clear(); pm.breaches.clear(); };

  const nameOf = (key, kind) => {
    const k = baseName(key);
    if (kind === 'pipe') return (k.split(':')[1] || '') + ' Pipe';
    if (kind === 'crewCannon') return k.slice(7);
    if (kind === 'coil') return null;
    const i = k.indexOf(':');
    return i < 0 ? k : k.slice(i + 1);
  };

  // the state of a part: 0..3
  const stateOfMod = (m) => {
    if (!m) return 0;
    if (m.broken) return 3;
    const s = m.max > 0 ? m.hp / m.max : 1;
    return s <= K().DAMAGED_AT ? 2 : s < K().SCUFF_AT ? 1 : 0;
  };

  const lampState = (n) => K().LAMP_HITS.filter((h) => n >= h).length;
  // what the sim says about a part right now: { state 0..3, mod (its module, or null) }
  function wantOf(p, st, mb, pm) {
    if (p.cls === 'lamp') return { state: lampState(pm.hits.get(baseName(p.key)) || 0), mod: null };
    if (p.cls === 'wall' || p.cls === 'bag' || p.cls === 'ram') return { state: 0, mod: null };
    const mod = p.cls === 'coil' ? (st.modules || []).find((m) => m.kind === 'coil') : mb[p.name];
    return { state: stateOfMod(mod), mod: mod || null };
  }

  // ---- binding a ship's model: part table, aPart on the moving nodes, decal and plank meshes ---------------------------------------------------------------------------------------------
  const fillPart = (node, idx) => { node.traverse((o) => { const a = o.isMesh && o.geometry && o.geometry.attributes.aPart; if (a) { a.array.fill(idx); a.needsUpdate = true; } }); };
  function bind(sh, model, pm, st) {
    const asm = model.assembled || {}, pIdx = asm.partIndex || {}, L = model.layout;
    const rec = { sh, model, ship: sh.id, parts: [], mats: model.ctx && model.ctx.mats, side: 0, ver: L.version, bitsDirty: true, decalDirty: true, texDirty: true, hullSoot: 0, acc: new Map(), bagK: new Map(), boilerSt: 0, last: -1e9 };
    const mb = {};
    for (const m of st.modules || []) mb[m.name] = m;
    for (const [key, meta] of model.parts) {
      const cls = CLASS[meta.kind];
      if (!cls) continue;
      const idx = pIdx[key] || 0;
      const p = { key, meta, idx, cls, name: nameOf(key, meta.kind), state: 0, shown: 0, last: 0, snapUntil: 0, mid: 0, row: [0, 0, 0, 0, 0, 0, 0, 0], dyn: null, anchor: null, tick: 0 };
      p.st = (meta.kind === 'station' ? L.stations.find((s) => s.n === p.name) : null) || null;
      p.dyn = (meta.dyn || [])[0] || null;
      for (const d of meta.dyn || []) if (d.node && idx) fillPart(d.node, idx);
      if (cls === 'engine' && p.dyn && p.dyn.prop) { p.dyn.prop.rotation.order = 'ZYX'; p.baseY = p.dyn.group.position.y; }
      if (p.st && p.st.kind === 'helm' && p.dyn && p.dyn.node) p.baseY = p.dyn.node.position.y;
      if (cls === 'bag' && p.dyn && p.dyn.node) p.baseY = p.dyn.node.position.y;
      p.state = p.shown = p.last = wantOf(p, st, mb, pm).state;
      rec.parts.push(p);
    }
    for (const bg of model.dyn.bags) { const pp = rec.parts.find((p) => p.cls === 'bag' && p.dyn && p.dyn.node === bg.node); if (pp) pp.bag = bg; }
    rec.wall = makeDecalMesh(48);
    rec.front = makeDecalMesh(40);
    model.content.add(rec.wall, rec.front);
    return rec;
  }

  // ---- poses ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const worldPos = (rec, a) => { rec.model.content.localToWorld(_p.copy(a)); return _p; };
  function anchorOf(rec, p) {
    if (p.anchor) return p.anchor;
    const d = p.dyn, b = p.meta.bounds;
    let a = null;
    if (p.cls === 'engine' && d && d.group) a = d.group.position.clone();
    else if (p.cls === 'gun' && d && d.node) a = d.node.position.clone().add(new THREE.Vector3(0, 10, 0));
    else if ((p.cls === 'lamp' || p.cls === 'cannon') && d && d.node) a = d.node.position.clone();
    else if (p.cls === 'sail' && d && d.node) a = d.node.position.clone().add(new THREE.Vector3(0, -(d.s.h || 100) * 0.5, 0));
    else if (b && p.st && p.st.kind === 'boiler') a = new THREE.Vector3((b.x0 + b.x1) / 2 - 40, b.y0 + 118, (b.z0 + b.z1) / 2 + 54); // (the boiler vents from its shoulder, not the chimney)
    else if (b) a = new THREE.Vector3((b.x0 + b.x1) / 2, p.cls === 'station' ? b.y1 - 24 : (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2 + 20);
    p.anchor = a || new THREE.Vector3(0, 0, 0);
    p.hasAnchor = !!a;
    return p.anchor;
  }

  // --- guns: a second barrel in two pieces, built the first time the gun is hurt ---
  function gunVariant(rec, p) {
    if (p.gv !== undefined) return p.gv;
    p.gv = null;
    const d = p.dyn, mount = rec.model.layout.gunMounts && rec.model.layout.gunMounts[p.name];
    if (!d || !d.node || !mount) return null;
    const ctx = rec.model.ctx, T = ctx.T, g = GUN_LOOK[mount.type] || { len: 84, r: 8 }, s = Math.round(g.len * 0.5), key = p.key;
    const rear = ctx.dynBatch(key + ':dmgRear'), tip = ctx.dynBatch(key + ':dmgTip'), tl = g.len - 8 - s;
    rear.cyl(T.iron, (s - 8) / 2, 0, 0, g.r, s + 8, 2.5, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
    rear.sphere(T.hullDark, 0, 0, 0, g.r + 7, g.r + 7, g.r + 7, 2.5, true, { tr: 'iron' });
    rear.cyl('#7c7468', g.len * 0.3 - 8, 0, 0, g.r * 1.14, 6, 1, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
    rear.cyl(T.hullDark, 0, 0, 0, g.r * 0.7, g.r * 3.2 + 14, 1, Math.PI / 2, 0, 0, undefined, { tr: 'iron' });
    tip.cyl(T.iron, tl / 2, 0, 0, g.r, tl, 2.5, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
    tip.cyl('#7c7468', 0, 0, 0, g.r * 1.2, 5, 1, 0, 0, Math.PI / 2, undefined, { tr: 'iron' }); // (the bend: a collar where the muzzle end folds)
    tip.cyl('#7c7468', g.len * 0.62 - 8 - s, 0, 0, g.r * 1.14, 6, 1, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
    tip.cyl(T.brass, g.len - 6 - s, 0, 0, g.r * 1.28, 9, 1.4, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
    if (mount.type === 'flame') tip.cone('#ffb347', g.len + 6 - s, 0, 0, g.r * 1.4, 20, 1.5, 0, 0, -Math.PI / 2, { tr: 'plain' });
    const root = new THREE.Group(), tipPivot = new THREE.Group();
    tipPivot.position.x = s;
    root.add(rear.buildGroup());
    tipPivot.add(tip.buildGroup());
    root.add(tipPivot);
    d.node.add(root);
    root.visible = false;
    if (p.idx) fillPart(root, p.idx);
    p.orig = d.node.children.find((c) => c !== root) || null;
    p.gv = { root, tipPivot };
    stats.variants++;
    return p.gv;
  }
  function poseGun(rec, p, amt) {
    const d = p.dyn;
    if (!d || !d.node) return;
    const want = p.shown >= 2;
    const gv = want ? gunVariant(rec, p) : p.gv;
    if (!gv) return;
    if (gv.root.visible !== want) { gv.root.visible = want; if (p.orig) p.orig.visible = !want; }
    if (!want) return;
    const rz = d.node.rotation.z, flip = Math.cos(rec.model.root.rotation.y) < 0 ? -1 : 1, wx = Math.cos(rz) * flip;
    if (Math.abs(wx) > 0.25 || p.sgn == null) p.sgn = wx >= 0 ? -1 : 1; // (the way is DOWN in the world: a hysteresis so a gun swinging through the vertical does not flip its droop)
    const loc = p.sgn * flip, droop = p.shown >= 3 ? 0.3 : 0.1, bend = p.shown >= 3 ? 1.0 : 0.35;
    gv.root.rotation.z = loc * droop;
    gv.tipPivot.rotation.z = loc * bend;
  }

  // --- engines: sag, prop stopped and tilted ---
  function poseEngine(rec, p, amt) {
    const d = p.dyn;
    if (!d || !d.group || !d.prop) return;
    d.group.position.y = p.baseY - 8 * amt;
    d.group.rotation.x = 0.17 * amt;
    d.prop.rotation.z = 0.3 * amt * d.out;
    d.prop.rotation.y = 0.5 * amt;
    if (p.shown >= 3) d.prop.rotation.x = 0.5; // (stopped: the prop stands where it stopped, over a blade or two)
  }

  // --- sails: the shader cuts the holes and the corner, a small flap hangs in the corner's place ---
  function sailVariant(rec, p) {
    if (p.fv !== undefined) return p.fv;
    p.fv = null;
    const d = p.dyn;
    if (!d || !d.node || !d.s) return null;
    const ctx = rec.model.ctx, s = d.s, w = s.w, ph = s.h * 0.78, cw = w * 0.32, ch = ph * 0.4, ryMax = Math.max(100, ...ctx.bags.map((q) => q.ry)), zS = ryMax * 0.96 + 16;
    const fb = ctx.dynBatch(p.key + ':dmgFlap');
    for (const sgn of [-1, 1]) {
      fb.box('#ebdfc0', cw / 2, -ch / 2, sgn * (zS + 5), cw, ch, 4, 2, 0, 0, 0, { tr: 'canvas3' });
      fb.box(ctx.T.rail, cw / 2, 0, sgn * (zS + 5), cw + 2, 4, 6, 1, 0, 0, 0, { tr: 'woodC' }); // (the hem it hangs by)
    }
    const hinge = new THREE.Group();
    hinge.position.set(w / 2 - cw, -ph + ch, 0);
    hinge.add(fb.buildGroup());
    d.node.add(hinge);
    if (p.idx) fillPart(hinge, p.idx);
    stats.variants++;
    return (p.fv = { hinge, w, ph, cw, ch });
  }
  function poseSail(rec, p) {
    const fv = p.shown >= 2 ? sailVariant(rec, p) : p.fv;
    if (!fv) return;
    fv.hinge.visible = p.shown === 2;
    fv.hinge.rotation.z = -0.55;
  }

  // --- the boiler: a firebox door that hangs open on a dark mouth ---
  function doorVariant(rec, p) {
    if (p.dv !== undefined) return p.dv;
    p.dv = null;
    const st = p.st;
    if (!st) return null;
    const ctx = rec.model.ctx, { T, X, Y, FZ, P: PL } = ctx, q = PL[st.d];
    if (!q) return null;
    const x = X(st.x + 62), y = Y(q.y - 18), doors = {};
    const mouth = ctx.dynBatch(p.key + ':dmgMouth');
    for (const sgn of [-1, 1]) mouth.box('#0f0b0a', x, y, FZ + sgn * 20.8, 26, 24, 1.6, 0, 0, 0, 0, { tr: 'plain' });
    const mg = mouth.buildGroup();
    rec.model.content.add(mg);
    for (const sgn of [-1, 1]) {
      const db = ctx.dynBatch(p.key + ':dmgDoor' + sgn);
      db.box(T.iron, -14, 0, 0, 29, 31, 3.4, 1.4, 0, 0, 0, { tr: 'iron' });
      db.box(T.brass, -22, 0, sgn * 3, 4, 14, 3, 0.8, 0, 0, 0, { tr: 'brass' }); // the handle
      const hinge = new THREE.Group();
      hinge.position.set(x + 17, y, FZ + sgn * 22);
      hinge.add(db.buildGroup());
      rec.model.content.add(hinge);
      doors[sgn] = hinge;
    }
    if (p.idx) { fillPart(mg, p.idx); fillPart(doors[-1], p.idx); fillPart(doors[1], p.idx); }
    stats.variants += 2;
    return (p.dv = { mouth: mg, doors });
  }
  function poseBoiler(rec, p) {
    const dv = p.shown >= 2 ? doorVariant(rec, p) : p.dv;
    if (!dv) return;
    const on = p.shown >= 2, sd = rec.side || 1;
    dv.mouth.visible = on;
    for (const sgn of [-1, 1]) {
      const h = dv.doors[sgn];
      h.visible = on && sgn === sd; // (only the door on the side the camera sees)
      const open = p.shown >= 3 ? 1.0 : 0.5;
      h.rotation.y = sgn * open;
      h.rotation.x = p.shown >= 3 ? 0.22 : 0; // (hanging askew by its hinge)
      h.rotation.z = p.shown >= 3 ? 0.1 * sgn : 0;
    }
  }

  // --- searchlights: a dark lens with cracks over it ---
  function lampCracks(rec, p) {
    if (p.cv !== undefined) return p.cv;
    p.cv = null;
    const d = p.dyn;
    if (!d || !d.lens || !d.lens.parent) return null;
    const strips = [];
    for (const [a, len, w, ox, oy] of [[0.4, 17, 1.8, 3, 2], [2.0, 15, 1.5, 3, 2], [3.5, 13, 1.5, 3, 2], [-1.1, 16, 1.6, 3, 2], [1.2, 8, 1.2, 9, 6], [-2.5, 9, 1.2, -4, -6]]) {
      const g = new THREE.PlaneGeometry(len, w);
      g.translate(len / 2, 0, 0);
      g.rotateZ(a);
      g.translate(ox, oy, 0);
      strips.push(g);
    }
    const geo = mergeGeometries(strips, false);
    for (const g of strips) g.dispose();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: K().COLORS.CRACK, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.rotation.copy(d.lens.rotation);
    m.position.copy(d.lens.position);
    m.position.x += 0.9;
    m.visible = false;
    d.lens.parent.add(m);
    stats.variants++;
    return (p.cv = m);
  }
  function poseLamp(rec, p) {
    const d = p.dyn;
    if (!d || !d.lens) return;
    const cr = p.shown >= 2 ? lampCracks(rec, p) : p.cv;
    if (cr) cr.visible = p.shown >= 2;
    if (p.shown >= 3) d.lens.material.color.set(K().COLORS.LENS_DEAD);
    else if (p.shown === 2) d.lens.material.color.multiplyScalar(0.4);
  }

  // ---- fx ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function emit(rec, p, dt, vx, vy) {
    if (!P || p.shown < 2) return;
    const KK = K(), broken = p.shown >= 3, rate0 = KK.SMOKE_RATE[broken ? 'broken' : 'damaged'];
    let rate = 0, kind = 'smoke', col = KK.COLORS.SMOKE, o = null;
    switch (p.cls) {
      case 'engine': rate = rate0 * (broken ? 1.2 : 1); col = broken ? KK.COLORS.BLACK : KK.COLORS.SMOKE; o = { size: broken ? [18, 30] : [14, 22], size1: 2.6, life: [0.9, 1.5], up: [30, 70], alpha: broken ? 0.7 : 0.5 }; break;
      case 'gun': case 'cannon': rate = rate0 * 0.5; col = broken ? '#3a3638' : KK.COLORS.SMOKE; o = { size: [10, 18], size1: 2.4, life: [0.8, 1.3], up: [30, 60], alpha: 0.45 }; break;
      case 'station': case 'coil': {
        if (p.st && p.st.kind === 'boiler') { kind = 'steam'; col = KK.COLORS.STEAM; rate = broken ? 11 : 4; o = { size: broken ? [30, 50] : [20, 32], size1: 3, life: [0.8, 1.3], up: broken ? [160, 260] : [100, 160], alpha: broken ? 0.7 : 0.55, vxo: -75 }; }
        else if ((p.st && p.st.kind === 'helm') || p.cls === 'coil') { kind = 'spark'; rate = broken ? 3 : 1; o = { size: [4, 7], life: [0.25, 0.5], speed: [80, 220] }; }
        else { rate = rate0 * 0.7; o = { size: [12, 22], size1: 2.4, life: [0.9, 1.4], up: [30, 60], alpha: 0.5 }; }
        break;
      }
      case 'lamp': if (broken) { kind = 'spark'; rate = 1; o = { size: [4, 7], life: [0.25, 0.5], speed: [80, 200] }; } break;
      case 'pipe': if (broken) { kind = 'steam'; col = KK.COLORS.STEAM; rate = 6; o = { size: [18, 30], size1: 2.6, life: [0.6, 1.0], up: [60, 110], alpha: 0.6 }; } break;
      default: break;
    }
    if (!rate || !o) return;
    anchorOf(rec, p);
    if (!p.hasAnchor) return;
    let n = Math.min(3, (rec.acc.get(p.key) || 0) + dt * rate * P.rate);
    while (n >= 1) {
      n -= 1;
      const w = worldPos(rec, p.anchor);
      if (!P.inView(w.x, w.y)) continue;
      const opt = { ...o, color: col, vx: vx * 0.88 + (o.vxo || 0), vy: vy * 0.5, speed: o.speed || [0, 14], warm: kind === 'smoke' ? 0.1 : 0 };
      if (kind === 'spark') P.burst('spark', w.x, w.y, w.z + 20, 3, { ...opt, vx: 0, vy: 0, ay: -500 });
      else P.spawn(kind, w.x, w.y, w.z, opt);
    }
    rec.acc.set(p.key, n);
  }
  function repairFx(rec, p) {
    if (!P) return;
    anchorOf(rec, p);
    if (!p.hasAnchor) return;
    const w = worldPos(rec, p.anchor);
    P.burst('dust', w.x, w.y, w.z + 20, 6, { size: [16, 28], size1: 2, life: [0.5, 0.9], speed: [30, 110], color: '#c4b48e', alpha: 0.7, force: true });
    P.burst('spark', w.x, w.y, w.z + 25, 8, { speed: [120, 320], life: [0.25, 0.55], size: [4, 7], force: true });
  }

  // ---- scorch memory, breaches, patches, prow dents ---------------------------------------------------------------------------------------------------------------------------------------
  const deckIdOf = (L, d) => (L.platforms[d] ? L.platforms[d].id : null);
  const deckIndex = (L, id) => L.platforms.findIndex((q) => q.id === id);
  const inScar = (L, x, y) => (L.scars || []).some((q) => x > q.x0 - 14 && x < q.x1 + 14 && y > q.y0 - 14 && y < q.y1 + 14);
  function watchFires(rec, pm, st, dt) {
    const L = rec.model.layout, KK = K(), live = new Set(st.fires || []);
    for (const f of live) pm.fireAge.set(f, (pm.fireAge.get(f) || 0) + dt);
    for (const [f, age] of pm.fireAge) {
      if (live.has(f)) continue;
      pm.fireAge.delete(f);
      const id = deckIdOf(L, f.d);
      if (age < KK.SCORCH_AFTER || !id || !fin(f.x)) continue;
      const near = pm.scorches.find((q) => q.deck === id && Math.abs(q.x - f.x) < 45);
      if (near) { near.big = near.big || !!f.big; continue; }
      pm.scorches.push({ deck: id, x: f.x, big: !!f.big, n: (pm.scorchSeq = (pm.scorchSeq || 0) + 1) });
      if (pm.scorches.length > KK.SCORCH_MAX) pm.scorches.shift();
      rec.decalDirty = true;
    }
  }
  function watchBreaches(rec, pm, st) {
    const L = rec.model.layout, now = new Set(st.breaches || []);
    for (const b of now) if (!pm.breaches.has(b)) { pm.breaches.set(b, { deck: deckIdOf(L, b.d), x: b.x, n: (pm.breachSeq = (pm.breachSeq || 0) + 1) }); rec.bitsDirty = rec.decalDirty = true; }
    for (const [b, e] of pm.breaches) {
      if (now.has(b)) continue;
      pm.breaches.delete(b); // (mended: a plank patch takes its place and stays until the ship is refitted)
      rec.bitsDirty = rec.decalDirty = true;
      if (e.deck && !inScar(L, e.x, L.platforms[deckIndex(L, e.deck)] ? L.platforms[deckIndex(L, e.deck)].y : 0)) {
        pm.patches.push(e);
        if (pm.patches.length > 12) pm.patches.shift();
        if (P) { const q = L.platforms[deckIndex(L, e.deck)]; if (q) { const w = worldPos(rec, new THREE.Vector3(rec.model.X(e.x), rec.model.Y(q.y - 55), 0)); P.burst('dust', w.x, w.y, w.z + 30, 6, { size: [14, 26], size1: 2, life: [0.5, 0.9], speed: [30, 100], color: '#c4b48e', alpha: 0.7, force: true }); } }
      }
    }
  }
  // a wall mark / plank pose lies on the wall the camera sees through the cut-away: the far one
  function writeDecals(rec, pm, sh, st) {
    const model = rec.model, L = model.layout, pv = model.pv, KK = K(), sd = rec.side || 1, wz = -sd * (model.W * 0.97 - 12), FZ = model.ctx.FZ;
    const wallItems = [], frontItems = [];
    const deckOf = (id) => { const i = deckIndex(L, id); return i < 0 ? null : L.platforms[i]; };
    const onWall = (q) => !q.outside && !model.ctx.isNestRow(model.ctx.rowOf(q)) && WALL_DECK_ROWS.has(model.ctx.rowOf(q));
    for (const sc of pm.scorches) {
      const q = deckOf(sc.deck);
      if (!q) continue;
      const sz = KK.SCORCH_SIZE[0] + (KK.SCORCH_SIZE[1] - KK.SCORCH_SIZE[0]) * (sc.big ? 1 : hashN(sc.n) * 0.6);
      wallItems.push({ name: SCORCH[sc.n % 3], x: sc.x - pv, y: -(q.y - sz * 0.42), z: onWall(q) ? wz : FZ - 40, w: sz, h: sz * 0.95, rot: (hashN(sc.n + 3) - 0.5) * 0.5, a: 1 });
    }
    for (const b of pm.breaches.values()) {
      const q = deckOf(b.deck);
      if (!q) continue;
      wallItems.push({ name: HOLES[b.n % 4], x: b.x - pv, y: -(q.y - 56), z: wz, w: 124, h: 118, rot: hashN(b.n) * 6.28 });
    }
    for (const b of pm.patches) {
      const q = deckOf(b.deck);
      if (!q) continue;
      wallItems.push({ name: HOLES[b.n % 4], x: b.x - pv, y: -(q.y - 56), z: wz, w: 92, h: 88, rot: hashN(b.n) * 6.28 });
    }
    // the prow: dents on both faces of the ram, more for each landed ram (the sim's own scuff count)
    const ram = rec.parts.find((p) => p.cls === 'ram');
    const nRam = Math.min(18, Math.round((sh.ramHits || 0) * KK.RAM_DENTS));
    if (ram && ram.meta.bounds && nRam > 0) {
      const b = ram.meta.bounds, r = L.ram, tipX = r && fin(r.tipX) ? model.X(r.tipX) : b.x1, tipRight = tipX > (b.x0 + b.x1) / 2, len = b.x1 - b.x0, hgt = b.y1 - b.y0, mid = (b.y0 + b.y1) / 2, sz = clamp(hgt * 0.42, 26, 70);
      for (let i = 0; i < nRam; i++) { // (the prow narrows to its tip: a dent must stay on the iron, so how far off the middle it may sit grows with the distance from the tip)
        const f = 0.12 + hashN(i * 7 + 1) * 0.5, x = tipRight ? b.x1 - len * f : b.x0 + len * f, half = (hgt / 2) * clamp(f * 1.5, 0.15, 0.85), y = mid + (hashN(i * 13 + 5) - 0.5) * 1.5 * half, face = i % 2 ? 1 : -1;
        frontItems.push({ name: SCORCH[i % 3], x, y, z: face > 0 ? b.z1 + 2 : b.z0 - 2, w: sz * (0.55 + 0.45 * hashN(i + 9)), h: sz * (0.5 + 0.4 * hashN(i + 21)), rot: hashN(i + 31) * 6.28 });
      }
    }
    const fill = (mesh, items) => {
      const a = mesh.geometry.attributes.aDecal;
      const n = Math.min(items.length, mesh.instanceMatrix.count);
      for (let i = 0; i < n; i++) {
        const it = items[i], u = uvRect(it.name, 1);
        _e.set(0, 0, it.rot);
        _m.compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e), _s.set(it.w, it.h, 1));
        mesh.setMatrixAt(i, _m);
        a.setXYZW(i, u.u0, u.v0, u.u1 - u.u0, u.v1 - u.v0);
      }
      a.needsUpdate = true;
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    };
    fill(rec.wall, wallItems);
    fill(rec.front, frontItems);
    rec.wallSide = sd;
    rec.decalDirty = false;
    void st;
  }

  // loose planks and crates: knocked-about stations (shown >= 2) and the planks of breaches and patches. Written when something changed, never per frame.
  function writeBits(rec, pm) {
    const model = rec.model, L = model.layout, ctx = model.ctx, pv = model.pv, { plank, crate } = bitsFor(model), sd = rec.side || 1, wz = -sd * (model.W * 0.97 - 12);
    let np = 0, nc = 0;
    const put = (mesh, i, x, y, z, rx, ry, rz, sc = 1) => { _e.set(rx, ry, rz); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sc, sc, sc)); mesh.setMatrixAt(i, _m); };
    for (const p of rec.parts) {
      if (p.cls !== 'station' && p.cls !== 'coil' && p.cls !== 'cannon') continue;
      if (p.shown < 2 || !p.meta) continue;
      const st = p.st, q = st ? L.platforms[st.d] : null;
      if (!q) continue;
      const h = hashS(p.key), r = (k) => hashN(h + k * 977), x = st.x - pv, y = -q.y, nCrate = p.shown >= 3 ? 2 : 1, nPlank = p.shown >= 3 ? 4 : 2;
      const boiler = st.kind === 'boiler'; // (the boiler keeps its firebox door clear: its rubble falls to the left and in front)
      for (let i = 0; i < nCrate && nc < 16; i++) put(crate, nc++, x + (boiler ? -1 : i ? 1 : -1) * ((boiler ? 80 : 46) + r(i) * 40 + (boiler ? i * 50 : 0)), y + 19, ctx.FZ + 6 + r(i + 3) * 30, r(i + 5) * 0.4, r(i + 8) * 1.2, (r(i + 12) - 0.5) * 1.5 + (i ? 0.45 : -0.4), 1);
      for (let i = 0; i < nPlank && np < 48; i++) put(plank, np++, x + (boiler ? -60 : 0) + (r(i + 20) - 0.5) * (boiler ? 110 : 150), y + 6 + (i % 2) * 9, ctx.FZ + (boiler ? 58 : 20) + r(i + 30) * 36, 0, (r(i + 40) - 0.5) * 0.8, (r(i + 50) - 0.5) * 2.2 + (i % 2 ? 0.7 : 0), 0.9 + 0.3 * r(i + 60));
    }
    const deckOf = (id) => { const i = deckIndex(L, id); return i < 0 ? null : L.platforms[i]; };
    for (const b of pm.breaches.values()) { // planks sticking out of the hole toward the viewer
      const q = deckOf(b.deck);
      if (!q) continue;
      const h = b.n * 31, cx = b.x - pv, cy = -(q.y - 56);
      for (let i = 0; i < 4 && np < 48; i++) {
        const rz = (i - 1.5) * 0.85 + (hashN(h + i) - 0.5) * 0.5 + (i < 2 ? 0 : 0.15), ry = -sd * (0.3 + 0.3 * hashN(h + i + 9)), len = 33 * (0.8 + 0.4 * hashN(h + i + 17)); // (they fan out round the hole, tilted toward the viewer a little: straight at the viewer they would be foreshortened to stubs)
        const dir = _v.set(1, 0, 0).applyEuler(_e.set(0, ry, rz)), dx = dir.x, dy = dir.y, dz = dir.z; // (where the plank's long axis points: the direction a rotation of (ry, rz) turns +x to; static layout, not animation)
        put(plank, np++, cx + dx * len, cy + dy * len, wz + dz * len + sd * 4, 0, ry, rz, 0.9 * (len / 33));
      }
    }
    for (const b of pm.patches) { // a plank patch: three boards across and a brace over the hole
      const q = deckOf(b.deck);
      if (!q) continue;
      const cx = b.x - pv, cy = -(q.y - 56), z = wz + sd * 8;
      for (let i = -1; i <= 1 && np < 48; i++) put(plank, np++, cx + (hashN(b.n + i + 5) - 0.5) * 6, cy + i * 20, z, 0, 0, (hashN(b.n + i + 11) - 0.5) * 0.08);
      if (np < 48) put(plank, np++, cx, cy, z + sd * 7, 0, 0, 0.75 * (b.n % 2 ? 1 : -1), 0.85);
    }
    plank.count = np; crate.count = nc;
    plank.visible = np > 0; crate.visible = nc > 0;
    plank.instanceMatrix.needsUpdate = true; crate.instanceMatrix.needsUpdate = true;
    rec.bitsSide = sd;
    rec.bitsDirty = false;
    rec.np = np; rec.nc = nc;
  }

  // WP15: SOFT SOOT POOLS. The walls' shader (kit.js DMG_TINT, uSootPts) darkens the hull, decks and rooms only near real damage: the scars, breaches, fires (and the scorch a long fire left) and the blows in the hit log, each a soft
  // round pool (x y radius strength in content coordinates), a blow within MERGE units of a pool joins it. The strength grows as the hull share drops (POOL.FROM -> FULL); fires, breaches and scars keep POOL.BASE of it even on a
  // healthy hull. Rewritten only when the picture of damage changes (a signature), never per frame.
  const smooth01 = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
  function writeSoot(rec, pm, st, share) {
    const mats = rec.mats;
    if (!mats || !mats.uSootPts) return;
    const KK = K().POOL, model = rec.model, L = model.layout, pv = model.pv || 0;
    const k = smooth01((share - KK.FROM) / Math.max(0.01, KK.FULL - KK.FROM)), kb = Math.max(k, KK.BASE);
    const log = st.hitLog || [], fires = st.fires || [], scars = L.scars || [];
    const sig = [Math.round(k * 40), log.length ? log[log.length - 1].n : 0, log.length, fires.length, fires.length ? fires[0].x : 0, pm.breaches.size, scars.length, pm.scorches.length, L.version].join(',');
    if (rec.sootSig === sig) return;
    rec.sootSig = sig;
    const src = [];
    const add = (x, y, r, s) => {
      if (!fin(x) || !fin(y) || !(s > 0.01)) return;
      for (const q of src) if (Math.hypot(q[0] - x, q[1] - y) < KK.MERGE) { q[3] = Math.min(1.3, q[3] + s * 0.55); q[2] = Math.max(q[2], r); return; }
      if (src.length < Math.min(24, KK.MAX)) src.push([x, y, r, s]);
    };
    for (const q of scars) add(((q.x0 + q.x1) / 2) - pv, -((q.y0 + q.y1) / 2), Math.max(q.x1 - q.x0, q.y1 - q.y0) / 2 + KK.SCAR[1], KK.SCAR[0] * kb);
    for (const b of pm.breaches.values()) { const q = L.platforms[deckIndex(L, b.deck)]; if (q) add(b.x - pv, -(q.y - 56), KK.BREACH[1], KK.BREACH[0] * kb); }
    for (const f of fires) { const q = L.platforms[f.d]; if (q) add(f.x - pv, -(q.y - 40), KK.FIRE[1], KK.FIRE[0] * kb); }
    for (const sc of pm.scorches) { const q = L.platforms[deckIndex(L, sc.deck)]; if (q) add(sc.x - pv, -(q.y - 40), KK.FIRE[1] * 0.9, KK.FIRE[0] * 0.8 * kb); }
    if (k > 0.01) {
      for (let i = log.length - 1; i >= 0; i--) { // newest first: the ring keeps the last 64 blows, the pools keep the most recent ones
        const h = log[i], pw = clamp(h.power || 1, 0.5, 9);
        if (h.partId) { const meta = model.parts.get(h.partId); if (meta && meta.kind === 'gasbag') continue; } // (a bag takes rips, not soot on the hull)
        add(h.x - pv, -h.y, Math.min(KK.RADIUS[2], KK.RADIUS[0] + KK.RADIUS[1] * pw), (KK.HIT[0] + KK.HIT[1] * pw) * k);
      }
    }
    const arr = mats.uSootPts.value;
    for (let i = 0; i < arr.length; i++) { const q = src[i]; if (q) arr[i].set(q[0], q[1], q[2], q[3]); else arr[i].set(0, 0, 1, 0); }
    mats.uSootN.value = src.length;
  }

  // ---- the frame, one ship ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function stepShip(sh, model, dt, t, night) {
    const KK = K(), st = sh.ctx || state;
    let pm = pers.get(sh.id);
    if (!pm) pers.set(sh.id, (pm = newPers()));
    const log = st.hitLog || [];
    if (pm.seenN > 0 && log.length === 0) { resetPers(pm); const rr = recs.get(sh.id); if (rr) { rr.decalDirty = rr.bitsDirty = true; for (const bg of rr.bagK.keys()) rr.bagK.set(bg, 0); } } // (the ship was rebuilt or refitted: she wears no scars)
    if (!model.ctx || !model.ctx.mats) return;
    let rec = recs.get(sh.id);
    if (!rec || rec.model !== model) { rec = bind(sh, model, pm, st); recs.set(sh.id, rec); }
    for (const h of log) { // blows on a searchlight (it has no hp: three blows kill the lens)
      if (h.n <= pm.seenN) continue;
      pm.seenN = h.n;
      if (h.partId && /^searchlight:/.test(h.partId)) { const k = baseName(h.partId); pm.hits.set(k, (pm.hits.get(k) || 0) + 1); }
    }
    const sd = model.assembled && model.assembled.side ? model.assembled.side : 1;
    if (sd !== rec.side) { rec.side = sd; rec.decalDirty = rec.bitsDirty = true; }
    const mb = {};
    for (const m of st.modules || []) mb[m.name] = m;
    const hull = st.ship && fin(st.ship.hull) ? st.ship.hull : 100, share = clamp(1 - hull / 100, 0, 1);
    const sootHull = share <= KK.HULL.SOOT_FROM ? 0 : clamp((share - KK.HULL.SOOT_FROM) / (1 - KK.HULL.SOOT_FROM), 0, 1) * KK.HULL.SOOT_MAX;
    const dentHull = hull < KK.HULL.DENT_BELOW ? ((KK.HULL.DENT_BELOW - hull) / KK.HULL.DENT_BELOW) * 0.4 : 0;
    const vx = (sh.pose && sh.pose.vx) || 0, vy = -((sh.pose && sh.pose.vy) || 0);
    watchFires(rec, pm, st, dt);
    watchBreaches(rec, pm, st);
    writeSoot(rec, pm, st, share);
    let best = 3, nDamaged = 0, nBroken = 0;
    const data = rec.mats.dmgData, W = rec.mats.dmgData.length / 8;
    let wrote = false;
    for (const p of rec.parts) {
      // 1. the state, from the sim
      const { state: want, mod } = wantOf(p, st, mb, pm);
      if (want !== p.state) {
        if (want < p.state) { repairFx(rec, p); if (mod && want === 0) { const L = model.layout, id = deckIdOf(L, mod.d); const before = pm.scorches.length; pm.scorches = pm.scorches.filter((q) => !(q.deck === id && Math.abs(q.x - mod.x) < 190)); if (pm.scorches.length !== before) rec.decalDirty = true; } } // (a part that mends wipes the scorch beside it)
        p.mid = Math.round((p.state + want) / 2);
        p.snapUntil = t + KK.SNAP;
        p.state = want;
        rec.bitsDirty = true;
      }
      const shown = t < p.snapUntil ? p.mid : p.state;
      if (shown !== p.shown) { p.shown = shown; rec.bitsDirty = true; }
      if (p.shown >= 2) nDamaged++;
      if (p.shown >= 3) nBroken++;
      if (p.st && p.st.kind === 'boiler') best = Math.min(best, p.shown);
      const amt = KK.AMT[p.shown] || 0;
      // 2. the shader row
      let r = KK.SOOT[p.shown], g = KK.DENT[p.shown], b = 0, a = 0, cx = 0, cy = 0, cz = 0;
      const wallF = p.cls === 'wall' ? 1 : 0; // (row 1 w: the shader treats it as a wall: light grime + the soft pools of writeSoot)
      if (p.cls === 'wall') { r = sootHull; g = dentHull; }
      else if (p.cls === 'sail') {
        b = KK.TEAR[p.shown];
        r *= 0.5; // (soot on cream canvas shows far more than on timber)
        const d = p.dyn;
        if (d && d.s && p.shown >= 2) { const w = d.s.w, ph = d.s.h * 0.78, big = p.shown >= 3; cx = w / 2 - w * (big ? 0.46 : 0.32); cy = -ph + ph * (big ? 0.6 : 0.4); cz = big ? 9 : 5; }
      } else if (p.cls === 'bag') {
        const k = rec.bagK.get(p.bag ? p.bag.i : -1) || 0, c = k / Math.max(1, KK.BAG.STEPS);
        r = 0; g = 0; a = KK.BAG.GREY * c; // (a flat bag is only washed out: soot would speckle the canvas)
      }
      const row = p.row;
      if (p.idx && (row[0] !== r || row[1] !== g || row[2] !== b || row[3] !== a || row[4] !== cx || row[5] !== cy || row[6] !== cz || row[7] !== wallF)) {
        row[0] = r; row[1] = g; row[2] = b; row[3] = a; row[4] = cx; row[5] = cy; row[6] = cz; row[7] = wallF;
        let o = p.idx * 4;
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = a;
        o = (W + p.idx) * 4;
        data[o] = cx; data[o + 1] = cy; data[o + 2] = cz; data[o + 3] = wallF;
        wrote = true;
      }
      // 3. the pose
      switch (p.cls) {
        case 'gun': poseGun(rec, p, amt); break;
        case 'engine': poseEngine(rec, p, amt); break;
        case 'sail': poseSail(rec, p); if (p.shown >= 3 && p.dyn && p.dyn.node) p.dyn.node.scale.y = Math.max(p.dyn.node.scale.y, 0.55); break; // (a torn sail cannot be furled neatly: it hangs in tatters)
        case 'lamp': poseLamp(rec, p); break;
        case 'cannon': if (p.dyn && p.dyn.inner) p.dyn.inner.rotation.z = (Math.cos(model.root.rotation.y) < 0 ? 1 : -1) * 0.35 * amt * (Math.cos(p.dyn.node.rotation.z) >= 0 ? 1 : -1); break;
        case 'station':
          if (p.st && p.st.kind === 'boiler') poseBoiler(rec, p);
          else if (p.st && p.st.kind === 'helm' && p.dyn && p.dyn.node) { p.dyn.node.rotation.x = 0.6 * amt; p.dyn.node.position.y = p.baseY - 7 * amt; }
          break;
        default: break;
      }
      emit(rec, p, dt, vx, vy);
    }
    if (wrote) { rec.mats.dmgTex.needsUpdate = true; stats.texWrites++; }
    // the boiler's glow and light go out when every boiler is broken, and dim when it is damaged
    const gl = best >= 3 ? 0 : best === 2 ? 0.4 : 1;
    if (rec.parts.some((p) => p.st && p.st.kind === 'boiler')) {
      for (const m of model.dyn.boilerGlow) { m.visible = gl > 0; if (gl > 0 && gl < 1) m.material.color.multiplyScalar(gl); }
      for (const pl of model.lights.boiler) pl.intensity *= gl;
    }
    // the deflated bags: a stepped crumple (3 keys at 8 fps) and a sag
    for (const bg of model.dyn.bags) {
      const down = !!(st.bags && st.bags[bg.i] && st.bags[bg.i].down);
      const key = bg.i, steps = KK.BAG.STEPS, tick = Math.floor(t * 8);
      let k = rec.bagK.get(key) || 0;
      if (rec.bagTick !== tick) { const tk = down ? Math.min(steps, k + 1) : Math.max(0, k - 1); if (tk !== k) { k = tk; rec.bagK.set(key, k); } }
      const c = k / Math.max(1, steps), pp = rec.parts.find((p) => p.bag === bg);
      if (c > 0) {
        const S = KK.BAG.SCALE;
        bg.node.scale.set(bg.node.scale.x * (1 + (S[0] - 1) * c), bg.node.scale.y * (1 + (S[1] - 1) * c), bg.node.scale.z * (1 + (S[2] - 1) * c));
        bg.node.position.y = (pp && pp.baseY != null ? pp.baseY : bg.node.position.y) - bg.G.ry * (1 - S[1]) * KK.BAG.SAG * c;
        bg.node.rotation.z = (bg.i % 2 ? -1 : 1) * 0.035 * c;
      } else if (pp && pp.baseY != null && bg.node.position.y !== pp.baseY) { bg.node.position.y = pp.baseY; bg.node.rotation.z = 0; }
    }
    rec.bagTick = Math.floor(t * 8);
    const ramN = sh.ramHits || 0;
    if (ramN !== rec.ramN) { rec.ramN = ramN; rec.decalDirty = true; }
    if (rec.decalDirty || rec.wallSide !== rec.side) writeDecals(rec, pm, sh, st);
    if (rec.bitsDirty || rec.bitsSide !== rec.side) writeBits(rec, pm);
    stats.planks += rec.np || 0; stats.crates += rec.nc || 0;
    stats.damaged += nDamaged; stats.broken += nBroken; stats.parts += rec.parts.length;
    stats.scorches += pm.scorches.length; stats.breaches += pm.breaches.size; stats.patches += pm.patches.length;
    const dim = 1 - 0.7 * clamp(night, 0, 1);
    rec.wall.material.color.setScalar(dim); rec.front.material.color.setScalar(dim);
  }

  const D = {
    stats,
    // call after the ship models are made and posed for this frame (shipMesh model.update has run: poses here are on top of it)
    update(dt, t, night = 0) {
      stats.parts = stats.damaged = stats.broken = stats.scorches = stats.breaches = stats.patches = stats.planks = stats.crates = 0;
      const seen = new Set();
      for (const sh of state.ships) {
        const e = models.get(sh.id);
        if (!e) continue;
        seen.add(sh.id);
        try {
          stepShip(sh, e.model, clamp(dt, 0, 0.1), t, night);
        } catch (err) { if (D.lastErr !== String(err && err.message)) { D.lastErr = String(err && err.message); console.warn('view3d damageStates', err); } }
      }
      for (const id of [...recs.keys()]) if (!seen.has(id)) { recs.delete(id); pers.delete(id); }
    },
    // forget the scorch marks, patches and counts (a new run)
    clear() { for (const pm of pers.values()) resetPers(pm); for (const rec of recs.values()) rec.decalDirty = rec.bitsDirty = true; },
    // the dev tools: the states of a ship's parts, { key: state }
    states(shipId) { const rec = recs.get(shipId); const o = {}; if (rec) for (const p of rec.parts) if (p.shown) o[p.key] = p.shown; return o; },
    rec: (shipId) => recs.get(shipId) || null, // (dev: the bound meshes and the part table)
    memory(shipId) { const pm = pers.get(shipId); return pm ? { scorches: pm.scorches.length, breaches: pm.breaches.size, patches: pm.patches.length } : null; },
  };
  void look;
  return D;
}
