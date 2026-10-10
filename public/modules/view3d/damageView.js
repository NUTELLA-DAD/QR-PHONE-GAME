// DAMAGE YOU CAN SEE, v1 (3D.md section 4, WP5): what the simulation remembers about the blows a ship has taken, drawn on the 3D ship. Reads only; nothing is written back to the game.
//   hitLog     (shipSim.js: the last 64 blows { n, t, x, y, power, partId, kind }) -> dents and scorch marks, ONE instanced mesh of quads a ship (max 64, the oldest overwritten), drawn with the trim sheet's
//              scorch / hole rows. A mark on the hull, a deck or a room lies on the wall that is visible from the camera (the other wall is cut away), a mark on a fitting stands in front of it.
//   gasHoles   a rip with a torn edge on the bag's skin, where the hole is (both sides of the bag); when a crew member patches it, a canvas patch with stitches takes its place and stays.
//   scars      the holes broken-off parts left: the hull's two walls are carved ragged with a charred rim by the ship's materials (parts3d/kit.js SCARS); this file hands them the rectangles.
// Everything is rigid and steady (no wobble). The marks live in the ship model's content group, so they follow her pitch, bob and facing. When the ship is rebuilt (a break-off) the marks on what is left are put
// back and the ones that were on a lost part, or inside a new hole, are dropped.
import { THREE } from './style.js';
import { getTrimSheet, uvRect, SCORCH, HOLES } from './textures.js';
import { config } from '../../config.js';
import { BAG_RZ } from './parts3d/bag.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashN = (n) => { let h = Math.imul((n | 0) ^ 0x9e3779b1, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const WALL_KINDS = new Set(['hull', 'deck', 'enemyDeck', 'room', 'armour', 'medbay', 'dropHatch']);

// the rip and the patch: two little canvas paintings (a torn slit with curled flaps; a tan patch with stitches), 128 x 128 each, side by side
let bagSheet = null;
function bagTexture() {
  if (bagSheet) return bagSheet;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  // the rip: a jagged dark slit, canvas-coloured flaps folded back on both sides, ink edge
  g.save(); g.translate(64, 64);
  const slit = [[-56, 2], [-38, -9], [-24, 4], [-10, -13], [4, 3], [18, -11], [32, 5], [47, -6], [58, 1], [46, 10], [33, 16], [19, 6], [4, 17], [-9, 5], [-23, 15], [-38, 8]];
  g.fillStyle = '#d8cba6'; g.strokeStyle = '#2a1d16'; g.lineWidth = 5; g.lineJoin = 'round';
  g.beginPath(); slit.forEach(([x, y], i) => (i ? g.lineTo(x * 1.1, y * 1.5 - 4) : g.moveTo(x * 1.1, y * 1.5 - 4))); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#14100d'; g.beginPath(); slit.forEach(([x, y], i) => (i ? g.lineTo(x * 0.92, y * 0.7) : g.moveTo(x * 0.92, y * 0.7))); g.closePath(); g.fill();
  g.strokeStyle = '#8a7a58'; g.lineWidth = 2.5;
  for (const [x, y, a] of [[-30, -14, 0.5], [0, -18, -0.4], [26, -16, 0.6], [-20, 20, -0.5], [14, 22, 0.4]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12 + (y < 0 ? -6 : 6)); g.stroke(); }
  g.restore();
  // the patch: a square of tan canvas with a darker border, a dashed stitch line round it and a cross stitch
  g.save(); g.translate(192, 64);
  g.fillStyle = '#b79e6a'; g.strokeStyle = '#2a1d16'; g.lineWidth = 4;
  g.beginPath(); g.rect(-50, -38, 100, 76); g.fill(); g.stroke();
  g.strokeStyle = '#5a4528'; g.lineWidth = 3; g.setLineDash([7, 6]);
  g.beginPath(); g.rect(-43, -31, 86, 62); g.stroke();
  g.setLineDash([]); g.lineWidth = 3; g.beginPath(); g.moveTo(-26, -18); g.lineTo(26, 18); g.moveTo(26, -18); g.lineTo(-26, 18); g.stroke();
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return (bagSheet = t);
}

export function createDamageView({ state, models }) {
  const K = () => config.BREAKOFF.PHYS.DECALS;
  const recs = new Map(); // ship id -> record
  const sheet = () => getTrimSheet().texture;
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const half = (k) => { const t = bagTexture().clone(); t.repeat.set(0.5, 1); t.offset.set(0.5 * k, 0); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; }; // (the left half of the painting is the rip, the right half the patch)
  const skinMat = (k) => new THREE.MeshBasicMaterial({ map: half(k), transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const ripMat = skinMat(0), patchMaterial = skinMat(1);
  const ripMats = { rip: ripMat, patch: patchMaterial };
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _z = new THREE.Vector3(0, 0, 1);

  // the instanced decal quads of one ship: the trim sheet, one rect of it per instance (aDecal = u0 v0 du dv)
  function makeDecalMesh() {
    const geo = planeGeo.clone();
    const aDecal = new THREE.InstancedBufferAttribute(new Float32Array(K().MAX * 4), 4);
    aDecal.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aDecal', aDecal);
    const mat = new THREE.MeshBasicMaterial({ map: sheet(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aDecal;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n  vMapUv = aDecal.xy + uv * aDecal.zw;\n#endif');
    };
    mat.customProgramCacheKey = () => 'decal-trim';
    const mesh = new THREE.InstancedMesh(geo, mat, K().MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.renderOrder = 4;
    return mesh;
  }

  function newRec(model) {
    const rec = { model, wall: makeDecalMesh(), front: makeDecalMesh(), list: [], seen: 0, side: 0, holes: new Map(), patches: [], rips: new THREE.Group(), ver: model.layout.version };
    model.content.add(rec.wall, rec.front, rec.rips);
    return rec;
  }

  // ---- scars: hand the hole rectangles to the ship's materials -----------------------------------------------------------------------------------------------------------------
  function applyScars(model) {
    const mats = model.ctx && model.ctx.mats;
    if (!mats || !mats.uScar) return;
    const sc = (model.layout.scars || []).slice(-8), pv = model.pv;
    sc.forEach((q, i) => mats.uScar.value[i].set(q.x0 - pv, -q.y1, q.x1 - pv, -q.y0));
    mats.uScarN.value = sc.length;
  }
  const inScar = (model, x, y) => (model.layout.scars || []).some((q) => x > q.x0 - 14 && x < q.x1 + 14 && y > q.y0 - 14 && y < q.y1 + 14);

  // ---- one hit mark ------------------------------------------------------------------------------------------------------------------------------------------------------------------
  // how a mark looks: { name (trim row), w, h, rot, tint }
  function lookOf(hit) {
    const r = hashN(hit.n), pw = clamp(hit.power || 1, 0.5, 9);
    if (hit.kind === 'rock') return { name: SCORCH[Math.floor(r * 3)], w: 110 + pw * 22, h: 44 + pw * 10, rot: (r - 0.5) * 0.7 };
    if (hit.kind === 'ram') return { name: HOLES[Math.floor(r * 4)], w: 90 + pw * 16, h: 80 + pw * 14, rot: r * 6.28 };
    if (pw >= 2) return { name: HOLES[Math.floor(r * 4)], w: 62 + pw * 10, h: 62 + pw * 10, rot: r * 6.28 };
    return { name: SCORCH[Math.floor(r * 3)], w: 64 + pw * 26, h: 64 + pw * 26, rot: r * 6.28 };
  }
  function zOf(rec, hit) {
    const model = rec.model, meta = hit.partId ? model.parts.get(hit.partId) : null;
    const wallish = !meta || WALL_KINDS.has(meta.kind);
    if (wallish) return { wall: true, z: model.W * 0.97 - 12 };
    const z1 = meta.bounds && Number.isFinite(meta.bounds.z1) ? meta.bounds.z1 : 40;
    return { wall: false, z: clamp(z1 + 2, 8, model.W * 0.9) };
  }
  function write(rec) {
    const model = rec.model, pv = model.pv, sd = rec.side || 1;
    let nw = 0, nf = 0;
    for (const h of rec.list) {
      const lk = h.look, u = uvRect(lk.name, 1), where = zOf(rec, h);
      const mesh = where.wall ? rec.wall : rec.front, i = where.wall ? nw++ : nf++;
      _e.set(0, 0, lk.rot);
      _m.compose(_p.set(h.x - pv, -h.y, where.wall ? -sd * where.z : where.z), _q.setFromEuler(_e), _s.set(lk.w, lk.h, 1));
      mesh.setMatrixAt(i, _m);
      const a = mesh.geometry.attributes.aDecal;
      a.setXYZW(i, u.u0, u.v0, u.u1 - u.u0, u.v1 - u.v0);
      a.needsUpdate = true;
    }
    rec.wall.count = nw; rec.front.count = nf;
    rec.wall.instanceMatrix.needsUpdate = true; rec.front.instanceMatrix.needsUpdate = true;
    rec.wallSide = sd;
    rec.dirty = false;
  }

  // ---- bag rips and patches -----------------------------------------------------------------------------------------------------------------------------------------------------
  // a point on the bag's skin for a hole at the ship point (x, y) of bag number b: { node, p (local, in the bag's group), n (surface normal), } or null
  function onBag(model, b, x, y) {
    const G = model.layout.gasbags[b], bn = model.dyn.bags.find((q) => q.i === b);
    if (!G || !bn) return null;
    const u = clamp((x - G.cx) / G.rx, -0.98, 0.98), pw = u < 0 ? 1.75 : 2.0, r = G.ry * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), pw)), 1 / pw);
    // (the 2D game draws a hole on the bag's rim: the top near the nest, or the belly above the catwalk. From the side camera a belly faces away, so the mark is set on the skin a little way round toward the
    // viewer: 0.8 radians up or down from the side that faces the camera)
    const ang = (y > G.cy ? -1 : 1) * 0.8, ly = r * Math.sin(ang), z = BAG_RZ * r * Math.cos(ang);
    const nrm = new THREE.Vector3(u * 0.4, Math.sin(ang), Math.cos(ang)).normalize();
    return { node: bn.node, lx: x - G.cx, ly, z, nrm };
  }
  function ripMesh(spot, sz, tile, side) {
    const m = new THREE.Mesh(planeGeo, ripMats[tile]);
    m.scale.set(sz.w, sz.h, 1);
    const nrm = spot.nrm.clone();
    nrm.z *= side; // (the same spot on the bag's far side: the quad faces the other way)
    m.position.set(spot.lx, spot.ly, side * (spot.z + 3));
    m.quaternion.setFromUnitVectors(_z, nrm);
    m.renderOrder = 5;
    return m;
  }
  function addRip(rec, kind, spot, seedN, holeObj) {
    const r = hashN(seedN + 7);
    const w = kind === 'patch' ? 130 : 210 + r * 50, h = kind === 'patch' ? 100 : 120 + r * 24;
    const meshes = [];
    for (const side of [1, -1]) {
      const m = ripMesh(spot, { w, h }, kind, side);
      if (kind === 'rip') m.rotateZ((r - 0.5) * 0.9);
      spot.node.add(m);
      meshes.push(m);
    }
    return { meshes, node: spot.node };
  }
  const dropMeshes = (e) => { for (const m of e.meshes) m.removeFromParent(); };

  function syncBagHoles(rec, model, st) {
    const layout = model.layout, holes = st.gasHoles || [];
    // holes that are gone: patched (a patch takes the place) unless the ship was rebuilt
    for (const [obj, e] of rec.holes) {
      if (holes.includes(obj)) continue;
      dropMeshes(e);
      rec.holes.delete(obj);
      if (e.spot && e.ver === layout.version && e.bagCx != null) {
        rec.patches.push({ bagCx: e.bagCx, x: e.x, y: e.y, n: e.n });
        if (rec.patches.length > 24) rec.patches.shift();
        const b = layout.gasbags.findIndex((q) => Math.abs(q.cx - e.bagCx) < 2), spot = b >= 0 ? onBag(model, b, e.x, e.y) : null;
        if (spot) rec.patchMeshes.push(addRip(rec, 'patch', spot, e.n, null));
      }
    }
    for (const h of holes) {
      if (rec.holes.has(h) || !Number.isFinite(h.x) || !Number.isFinite(h.y)) continue;
      const b = h.bag | 0, G = layout.gasbags[b];
      const spot = G ? onBag(model, b, h.x, h.y) : null;
      if (!spot) continue;
      rec.holeSeq = (rec.holeSeq || 0) + 1;
      const e = addRip(rec, 'rip', spot, rec.holeSeq + b * 31, h);
      Object.assign(e, { spot: true, ver: layout.version, bagCx: G.cx, x: h.x, y: h.y, n: rec.holeSeq + b * 31 });
      rec.holes.set(h, e);
    }
  }

  // ---- the frame -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const D = {
    stats: { decals: 0, rips: 0, patches: 0 },
    // call after the ship models are made for this frame's layouts. night = 0..1 (the unlit marks dim in the dark)
    update(night = 0) {
      let decals = 0, rips = 0, patches = 0;
      const seen = new Set();
      for (const sh of state.ships) {
        const e = models.get(sh.id);
        if (!e) continue;
        seen.add(sh.id);
        const model = e.model, st = sh.ctx || state;
        let rec = recs.get(sh.id);
        if (!rec || rec.model !== model) { // a new model (first time, or the ship was rebuilt after a break-off): put back what still belongs on her
          const old = rec;
          rec = newRec(model);
          rec.patchMeshes = [];
          if (old) {
            rec.list = old.list.filter((h) => !inScar(model, h.x, h.y) && (!h.partId || model.parts.has(h.partId)));
            rec.seen = old.seen;
            rec.patches = old.patches.filter((p) => !inScar(model, p.x, p.y));
            rec.holeSeq = old.holeSeq;
            old.rips.removeFromParent();
            for (const m of [old.wall, old.front]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
          }
          for (const p of rec.patches) { const b = model.layout.gasbags.findIndex((q) => Math.abs(q.cx - p.bagCx) < 2), spot = b >= 0 ? onBag(model, b, p.x, p.y) : null; if (spot) rec.patchMeshes.push(addRip(rec, 'patch', spot, p.n, null)); }
          recs.set(sh.id, rec);
          rec.dirty = true;
          applyScars(model);
        }
        // new blows
        const log = st.hitLog || [];
        for (const h of log) {
          if (h.n <= rec.seen) continue;
          rec.seen = h.n;
          if (h.partId && model.parts.get(h.partId) && model.parts.get(h.partId).kind === 'gasbag') continue; // (a bag shows rips, not scorch)
          rec.list.push({ ...h, look: lookOf(h) });
          if (rec.list.length > K().MAX) rec.list.shift();
          rec.dirty = true;
        }
        for (const h of rec.list) if (!h.look) h.look = lookOf(h);
        const sd = model.assembled && model.assembled.side ? model.assembled.side : 1; // (which wall is hidden: the marks go on the other one)
        if (sd !== rec.wallSide) rec.dirty = true;
        rec.side = sd;
        if (rec.dirty) write(rec);
        const dim = 1 - 0.7 * clamp(night, 0, 1);
        rec.wall.material.color.setScalar(dim); rec.front.material.color.setScalar(dim);
        syncBagHoles(rec, model, st);
        decals += rec.list.length; rips += rec.holes.size; patches += rec.patches.length;
      }
      ripMat.color.setScalar(1 - 0.5 * clamp(night, 0, 1));
      patchMaterial.color.setScalar(1 - 0.5 * clamp(night, 0, 1));
      for (const [id, rec] of recs) if (!seen.has(id)) { rec.wall.removeFromParent(); rec.front.removeFromParent(); rec.rips.removeFromParent(); recs.delete(id); }
      D.stats.decals = decals; D.stats.rips = rips; D.stats.patches = patches;
    },
    // A mark the simulation did not log (the Cinder Drake's breath scorches the hull without a hit): a scorch on ship `sh` at the ship point (x, y), the same marks the hit log makes, kept until the ship is rebuilt.
    mark(sh, x, y, power = 1.4, kind = 'scorch') {
      const rec = sh && recs.get(sh.id);
      if (!rec || !Number.isFinite(x) || !Number.isFinite(y)) return false;
      const n = -(1 + (rec.markSeq = (rec.markSeq || 0) + 1)); // (negative numbers: they never clash with the log's own, and `seen` ignores them)
      const h = { n, x, y, power, kind, partId: null };
      h.look = lookOf(h);
      rec.list.push(h);
      if (rec.list.length > K().MAX) rec.list.shift();
      rec.dirty = true;
      return true;
    },
    // forget every mark (a new run)
    clear() { for (const rec of recs.values()) { rec.list.length = 0; rec.dirty = true; for (const e of rec.holes.values()) dropMeshes(e); rec.holes.clear(); for (const e of rec.patchMeshes || []) dropMeshes(e); rec.patchMeshes = []; rec.patches.length = 0; } },
  };
  return D;
}
