// THE FRAMES IN 3D (LOOP.md R4, config.FRAMES3D; 3D.md section 35). A part bought as a FRAME at the dock (G4: host/buildFrames.js, state.run.frames) is built in flight: the crew carry scrap bundles to its place. Plain words: the
// part's place on the ship shows a blueprint-blue GHOST of the part inside pale timber scaffolding; every bundle that goes in adds a slab of riveted steel from the bottom up; while a bundle is going in (the hold progress `prog`)
// a gold band rises through the next layer and gold sparks fly; a gold ring on the deck marks where the crew stand. When the last bundle is in the sim makes the part alive (shipSim.js growPart: the layout's version
// changes, so index.js `modelFor` builds the ship's 3D model again, and the real part is there) and the view plays a short BUILT moment: a gold shell round the part's box swelling for a few keys, sparks, dust, a flash and a ring.
// It reads state.run.frames ({ id, fill, need, prog, x, y, ghost: { x0, y0, x1, y1 }, done }) and buildFrames.frameSpot, nothing else. Three draw calls at most (the solid scaffold with its ink, the translucent ghost, the gold glow), all
// children of the ship's own `content` group (so they ride her bob, pitch and yaw) and mirrored with the model's near side. Everything is rigid and held: the band moves in PROG_STEPS steps a bundle, the ring pulses on the 8 fps
// key, the built shell is a table of keys; no sine of time. The HUD keeps the words (BUILD GUN MOUNT 2/3) and the bar. update() is wrapped by the caller; a failed build leaves the HUD tag alone.
import { THREE, Batch, applyLook } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';
import { framesOf, frameSpot } from '../host/buildFrames.js';
import { solidBatch, ghostGeo, glowGeo } from './framesKit.js';

const fin = Number.isFinite;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createFrames3d({ parent, state, models, P }) {
  const K = () => config.FRAMES3D || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const stats = { frames: 0, built: 0, rebuilds: 0, sparks: 0, calls: 0, ms: 0 };
  let broken = false, live = false;
  const rec = { model: null, sig: '', holder: null, solid: null, ghost: null, glow: null };
  const seen = new Map(); // frame id -> what the last update saw of it (a frame that turns done is a built moment)
  let builts = []; // the built moments being played: { id, t0, box (3D), center (ship coords) }
  let lastKey = -1;
  const V3 = new THREE.Vector3();
  const GLOWCOL = new THREE.Color();
  void parent;

  const ghostMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, forceSinglePass: true });
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false, forceSinglePass: true });

  const dropMesh = (m) => { if (m) { m.removeFromParent(); m.traverse((o) => o.geometry && o.geometry.dispose()); } };
  function drop() {
    if (rec.holder) { rec.holder.traverse((o) => o.geometry && o.geometry.dispose()); rec.holder.removeFromParent(); }
    rec.holder = rec.solid = rec.ghost = rec.glow = null;
    rec.sig = '';
  }
  function hide() {
    live = false;
    if (rec.holder) rec.holder.visible = false;
    stats.frames = stats.calls = 0;
  }
  const mkMesh = (geo, mat, order, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false; m.renderOrder = order; m.name = name; m.castShadow = m.receiveShadow = false;
    return m;
  };

  // The box a frame stands in, in the model's 3D frame (y up), from the part's own box in ship coordinates.
  function boxOf(f, model, depth) {
    const X = model.X || ((x) => x), Y = model.Y || ((y) => -y);
    const g = f.ghost && fin(f.ghost.x0) && fin(f.ghost.x1) && fin(f.ghost.y0) && fin(f.ghost.y1) ? f.ghost : { x0: f.x - 44, x1: f.x + 44, y0: f.y - 74, y1: f.y + 12 };
    const xa = X(Math.min(g.x0, g.x1)), xb = X(Math.max(g.x0, g.x1)), ya = Y(Math.max(g.y0, g.y1)), yb2 = Y(Math.min(g.y0, g.y1));
    const pad = clamp(K().PAD == null ? 8 : K().PAD, 0, 40); // (the scaffold stands a little proud of the part's own box, so it reads at the plain zoom)
    return { xa: xa - pad, xb: Math.max(xb, xa + 24) + pad, yb: ya, yt: Math.max(yb2, ya + 24) + pad * 0.5, d: depth };
  }

  function update({ t = 0, dt = 0 } = {}) {
    const t0 = performance.now();
    const A = K();
    if (broken || A.ENABLED === false) { hide(); return; }
    const sh = state.ships && state.ships[0];
    const e = sh && models && models.get(sh.id);
    const frames = sh && sh.main !== false ? framesOf(state) : [];
    if (!e || !e.model || !e.model.content || !sh.layout || (!frames.length && !builts.length)) {
      if (!frames.length && !builts.length && seen.size) seen.clear();
      hide();
      return;
    }
    const model = e.model, X = model.X || ((x) => x), Y = model.Y || ((y) => -y), MW = model.content.matrixWorld;
    const side = (model.viewSide || 1) >= 0 ? 1 : -1;
    const depth = clamp(A.DEPTH || 64, 24, 160), k8 = Math.floor(t * 8), BT = A.BUILT || {}, SP = A.SPARKS || {}, STEPS = Math.max(1, A.PROG_STEPS || 10);
    const Pt = getP();
    const world = (x, y, z) => V3.set(x, y, z * side).applyMatrix4(MW); // (a point of the model's frame to the world; z is in camera terms)

    // -- what is on the ship: the frames still to build, and the ones that just finished
    const list = [];
    const alive = new Set();
    for (const f of frames) {
      if (!f || !fin(f.x) || !fin(f.y)) continue;
      alive.add(f.id);
      const box = boxOf(f, model, depth);
      if (f.done) {
        const was = seen.get(f.id);
        if (was) { // the last bundle went in: the part came alive this frame (the model has just been built again from the new layout)
          seen.delete(f.id);
          builts.push({ id: f.id, t0: t, box, k: -1 });
          stats.built++;
          if (Pt) {
            const c = world((box.xa + box.xb) / 2, (box.yb + box.yt) / 2, 0), h = box.yt - box.yb, w = box.xb - box.xa;
            Pt.spawn('flash', c.x, c.y, c.z + 30, { size: clamp(Math.max(w, h) * 3.4, 200, 520), size1: 1.3, life: 0.14, color: '#ffe2a0', hdr: 2.4, alpha: 0.9 });
            Pt.burst('spark', c.x, c.y, c.z + 20, BT.SPARKS || 26, { speed: [220, 620], life: [0.35, 0.8], size: [5, 9], color: '#ffd23f', area: Math.max(24, w * 0.4) });
            Pt.burst('dust', c.x, c.y - h * 0.3, c.z + 10, BT.DUST || 10, { area: w * 0.7, size: [36, 72], size1: 2, life: [0.6, 1.1], speed: [40, 190], up: [20, 110], alpha: 0.8, color: '#fff1d6', hdr: 1.3 });
            Pt.ring(c.x, c.y, c.z + 20, clamp(Math.max(w, h) * 4, 260, 640), '#ffd23f', 0.4, { alpha: 0.8 });
          }
        }
        continue;
      }
      const spotRaw = frameSpot(sh, f), q = sh.layout.platforms[spotRaw.d];
      const zh = model.ctx && model.ctx.zHalfAt ? model.ctx.zHalfAt(spotRaw.d, spotRaw.x) : 120;
      const spot = q && fin(spotRaw.x) ? { x: X(spotRaw.x), y: Y(q.y), z: Math.min((A.RING && A.RING.Z) || 84, zh - 12) } : null;
      const fill = clamp(f.fill | 0, 0, Math.max(1, f.need | 0)), pr = clamp(f.prog || 0, 0, 1), step = Math.floor(pr * STEPS) / STEPS;
      const was = seen.get(f.id);
      const working = !!was && (fill > was.fill || pr > was.prog + 0.0005);
      list.push({ f, box, fill, pr: step, spot, need: Math.max(1, f.need | 0), working });
      seen.set(f.id, { fill, prog: pr });
    }
    for (const id of [...seen.keys()]) if (!alive.has(id)) seen.delete(id); // (taken down: refunded at a dock, or the voyage ended)
    // the built moments play for BUILT.KEYS keys of the view's clock
    builts = builts.filter((b) => { b.k = Math.floor((t - b.t0) * 8); return b.k < (BT.KEYS || 6); });
    if (!list.length && !builts.length) { hide(); return; }

    // -- the rebuild: only when something that shows changed
    if (rec.model !== model) { drop(); rec.model = model; }
    const sig = list.map((r) => [r.f.id, r.fill, r.pr, r.need, r.spot ? Math.round(r.spot.x) : 'n', Math.round(r.box.xa), Math.round(r.box.yb), (r.f.ghost ? 1 : 0)].join(':')).join('|') + '#' + builts.map((b) => b.id + ':' + b.k).join('|');
    if (sig !== rec.sig) {
      rec.sig = sig;
      try {
        const B = new Batch(), ghosts = [], glows = [];
        for (const r of list) {
          solidBatch(B, r.box, r.fill, r.need, A);
          const g = ghostGeo(r.box, r.fill, r.need, A);
          if (g) ghosts.push(g);
          const w = glowGeo(r.box, r.fill, r.pr, r.need, r.spot, null, A);
          if (w) glows.push(w);
        }
        for (const b of builts) {
          const w = glowGeo(b.box, 99, 0, 1, null, { grow: Math.max(0, b.k) * (BT.GROW || 3), mul: Math.max(0.05, (BT.FADE || 1.8) * (1 - Math.max(0, b.k) / (BT.KEYS || 6))) }, A);
          if (w) glows.push(w);
        }
        if (!rec.holder) {
          rec.holder = new THREE.Group(); rec.holder.name = 'frames3d';
          model.content.add(rec.holder);
        }
        dropMesh(rec.solid); dropMesh(rec.ghost); dropMesh(rec.glow); rec.solid = rec.ghost = rec.glow = null;
        if (!B.empty) {
          const grp = B.build({ cast: false, receive: false, one: true, small: false });
          grp.name = 'framesSolid';
          grp.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
          rec.holder.add(grp); applyLook(grp);
          rec.solid = grp;
        }
        const merged = (arr) => { if (!arr.length) return null; const m = arr.length === 1 ? arr[0] : mergeGeometries(arr, false); if (arr.length > 1) for (const a of arr) a.dispose(); return m; };
        const gg = merged(ghosts), ww = merged(glows);
        if (gg) { rec.ghost = mkMesh(gg, ghostMat, 8, 'framesGhost'); rec.holder.add(rec.ghost); }
        if (ww) { rec.glow = mkMesh(ww, glowMat, 9, 'framesGlow'); rec.holder.add(rec.glow); }
        stats.rebuilds++;
      } catch (err) { console.warn('view3d frames build failed', err); drop(); broken = true; hide(); return; }
    }
    // -- every frame: the model's near side, the ring's pulse on the 8 fps key (a held two-step: the ring is a gold HDR colour, not a sine)
    if (rec.holder) { rec.holder.visible = true; rec.holder.scale.z = side; }
    const PU = (A.GLOW && A.GLOW.PULSE) || [1, 1.6];
    GLOWCOL.setRGB(1, 1, 1).multiplyScalar(PU[k8 & 1] == null ? 1 : PU[k8 & 1] / (PU[0] || 1));
    glowMat.color.copy(GLOWCOL);
    live = true;

    // -- sparks while a bundle goes in (on the 8 fps key, at the top of the rising band)
    if (Pt && k8 !== lastKey && (k8 % Math.max(1, SP.EVERY || 2)) === 0) {
      for (const r of list) {
        if (!r.working) continue;
        const lh = (r.box.yt - r.box.yb) / r.need, c = world((r.box.xa + r.box.xb) / 2, r.box.yb + (r.fill + Math.max(0.15, r.pr)) * lh, 0), w = r.box.xb - r.box.xa;
        Pt.burst('spark', c.x, c.y, c.z + depth * 0.55, SP.N || 3, { speed: [120, 340], life: [0.25, 0.5], size: [4, 7], color: '#ffd23f', area: w * 0.5 });
        stats.sparks++;
      }
    }
    lastKey = k8;
    stats.frames = list.length;
    stats.calls = (rec.solid ? 1 : 0) + (rec.ghost ? 1 : 0) + (rec.glow ? 1 : 0);
    stats.ms = performance.now() - t0;
    void dt;
  }

  return {
    update, stats,
    get live() { return live; },
    get builts() { return builts.length; },
    dispose() { drop(); ghostMat.dispose(); glowMat.dispose(); },
  };
}
