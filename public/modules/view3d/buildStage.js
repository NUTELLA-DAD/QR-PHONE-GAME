// WP13 (3D.md section 17): what the build page adds on top of the 3D ship: the GHOST of the part being dragged and the BALANCE MARKERS.
//   createBuildStage(view) -> { setMarkers(spec), showMarkers(bool), showGhost(bool), request(spec | null), update(now), stats, dispose() }
// Everything lives in ONE group that is a child of the main ship's `content` group (so it follows her pose, yaw and bob); it is re-attached when the ship's model is rebuilt.
// Drawn on top of the ship (no depth test), flat colours with a thin dark shell, nothing moves on a clock (3D.md no-wobble rules).
//
// THE GHOST. request({ key, make, bad, offset }) says what the dragged part would be: `make()` -> { parts, ok } builds lazily the parts list the ship would have with it dropped. The ghost is built with the
// PARTS REGISTRY itself (parts3d/registry.js): the new layout is made (shipBuild.buildLayout), every part of it that the live layout does not have is built by its registry builder (no hull, no rooms,
// nothing else), merged into one translucent mesh and boxed. Green = it can go there and the ship still validates (buildCheck), red = it cannot (`bad` forces red; `offset` slides a ghost made at
// another spot to where the pointer is, for a drop that snaps nowhere). A new spot must hold still for BUILD3D.GHOST_DEBOUNCE ms before the ghost is built, so a fast drag costs nothing.
// THE MARKERS (the same as the blueprint paper draws): the centre of LIFT (a cream diamond), the centre of WEIGHT (a ball, green / amber / red by the balance level), the beam between them, and a
// red arrow along each engine's thrust.
import { THREE } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeTrimMaterials, PartBatch } from './parts3d/kit.js';
import { makeShipContext, listParts, REGISTRY } from './parts3d/registry.js';
import { buildLayout } from '../host/shipBuild.js';
import { config } from '../../config.js';

const B3 = () => config.BUILD3D;
const SKIP = new Set(['hull', 'room']); // (the hull and the rooms are remade around every change: they are never "the new part")
const RENDER_ORDER = 40;

// A part's name for the "is it new?" test: its kind and every plain value (a deck index becomes the deck's id, so a deck inserted above does not make every ladder look new).
function sigOf(L, item) {
  const P = L.platforms || [], p = item.part || {}, out = [item.kind, typeof item.arg === 'string' ? item.arg : ''];
  if (item.kind === 'hull') return out.join('|');
  for (const k of Object.keys(p).sort()) {
    const v = p[k];
    if (typeof v === 'number') out.push(k + '=' + ((k === 'd' || k === 'top' || k === 'bottom') && P[v] ? P[v].id : Math.round(v * 10) / 10));
    else if (typeof v === 'string' || typeof v === 'boolean') out.push(k + '=' + v);
  }
  return out.join('|');
}

const edgeGeometry = (box, t) => { // the 12 edges of a box as thin bars (a line would be one pixel wide)
  const gs = [], [sx, sy, sz] = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z], c = box.getCenter(new THREE.Vector3());
  const bar = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); gs.push(g); };
  for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) bar(sx + t, t, t, c.x, y, z);
  for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) bar(t, sy + t, t, x, c.y, z);
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) bar(t, t, sz + t, x, y, c.z);
  const m = mergeGeometries(gs, false);
  for (const g of gs) g.dispose();
  return m;
};

export function createBuildStage(view) {
  const overlay = new THREE.Group();
  overlay.name = 'buildStage';
  const markersG = new THREE.Group(), ghostG = new THREE.Group();
  overlay.add(markersG, ghostG);
  let host = null, showM = true, showG = true, logged = '';
  const stats = { ghostBuilds: 0, ghostMs: 0, lastGhostMs: 0, ghostParts: 0, markerBuilds: 0, errors: 0 };
  const warnOnce = (what, e) => { stats.errors++; const m = what + ': ' + String(e && e.message ? e.message : e); if (m !== logged) { logged = m; console.warn('buildStage', m); } };

  // ---- shared materials ---------------------------------------------------------------------------------------------------------------------------------------------------------------
  const flat = (color, extra = {}) => new THREE.MeshBasicMaterial({ color, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false, ...extra });
  const inkMat = flat(B3().INK, { side: THREE.BackSide });
  const ghostMatV = flat('#ffffff', { vertexColors: true, side: THREE.DoubleSide, opacity: B3().GHOST_ALPHA });
  const ghostMatP = flat('#ffffff', { side: THREE.DoubleSide, opacity: B3().GHOST_ALPHA });
  const edgeMat = flat('#ffffff', { opacity: 0.95 });
  const paint = (ok) => { const c = ok ? B3().GHOST_OK : B3().GHOST_BAD; ghostMatV.color.set(c); ghostMatP.color.set(c); edgeMat.color.set(c); };
  paint(true);

  // ---- markers --------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const unit = { box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 20, 14), octa: new THREE.OctahedronGeometry(1), cone: new THREE.ConeGeometry(1, 1, 14) };
  const disposables = [];
  const label = (text, color, h = B3().LABEL_H) => {
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 96;
    const g = cv.getContext('2d');
    g.font = `bold 40px ${config.FONTS.TEXT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const tw = Math.min(600, g.measureText(text).width + 40); // a small paper plate under the words, like the blueprint's labels
    g.fillStyle = 'rgba(243,234,214,0.94)'; g.strokeStyle = B3().INK; g.lineWidth = 4;
    g.beginPath(); if (g.roundRect) g.roundRect(320 - tw / 2, 14, tw, 70, 16); else g.rect(320 - tw / 2, 14, tw, 70); g.fill(); g.stroke();
    g.fillStyle = color;
    g.fillText(text, 320, 50, 580);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    disposables.push(tex, mat);
    const sp = new THREE.Sprite(mat);
    sp.scale.set((h * 640) / 96, h, 1);
    sp.userData.size = [(h * 640) / 96, h];
    sp.renderOrder = RENDER_ORDER + 20;
    return sp;
  };
  const scalers = []; // what grows and shrinks with the camera's distance, so the markers keep their size on the screen: { o: object, base: [x, y] or null (labels move out from their marker) , off }
  const SCREEN_REF = 2950; // the camera's distance at the page's usual framing (a ship about half the pane wide)
  const solid = (geo, color, sx, sy, sz, x, y, z, ink = 4) => { // a flat fill with a thin dark shell behind it
    const g = new THREE.Group(), m = flat(color);
    disposables.push(m);
    const fill = new THREE.Mesh(geo, m), shell = new THREE.Mesh(geo, inkMat);
    fill.scale.set(sx, sy, sz); shell.scale.set(sx + ink, sy + ink, sz + ink);
    fill.renderOrder = RENDER_ORDER + 11; shell.renderOrder = RENDER_ORDER + 10;
    fill.frustumCulled = shell.frustumCulled = false;
    g.add(shell, fill);
    g.position.set(x, y, z);
    return g;
  };
  const clearMarkers = () => {
    scalers.length = 0;
    for (const o of [...markersG.children]) markersG.remove(o);
    for (const d of disposables.splice(0)) { try { d.dispose(); } catch { /* (gone) */ } }
  };
  // spec = { balance: { com: {x, y}, col: {x, y}, deg, level }, engines: [{ x, y, dir }] } in ship layout coordinates (y down), or null. The group is placed by update() (x - the ship's pivot, y up).
  function setMarkers(spec) {
    stats.markerBuilds++;
    try {
      clearMarkers();
      if (!spec) return;
      const C = B3(), bal = spec.balance;
      if (bal && bal.com && bal.col) {
        const lvl = C.LEVEL[bal.level] || C.LEVEL.PASS;
        const lx = bal.col.x, ly = -bal.col.y, wx = bal.com.x, wy = -bal.com.y;
        const dash = Math.abs(ly - wy);
        if (dash > 8) { // a dashed plumb line from the lift down to the height of the weight
          const n = Math.max(1, Math.round(dash / 26)), step = dash / n, dir = wy < ly ? -1 : 1;
          for (let i = 0; i < n; i++) markersG.add(solid(unit.box, '#6b4a32', 4, step * 0.5, 4, lx, ly + dir * (i + 0.5) * step, 0, 2));
        }
        const beam = Math.abs(wx - lx);
        if (beam > 3) markersG.add(solid(unit.box, lvl, beam, 6, 6, (lx + wx) / 2, wy, 0, 4));
        const dia = solid(unit.octa, C.LIFT, C.LIFT_R * 0.8, C.LIFT_R, C.LIFT_R * 0.5, lx, ly, 0, 5), ball = solid(unit.sphere, lvl, C.WEIGHT_R, C.WEIGHT_R, C.WEIGHT_R, wx, wy, 0, 5);
        markersG.add(dia, ball);
        scalers.push({ o: dia }, { o: ball });
        const lab = label('LIFT', C.INK); lab.position.set(lx, ly + C.LIFT_R + C.LABEL_H * 0.7, 0); markersG.add(lab);
        const word = bal.deg === 0 ? 'level' : (bal.deg > 0 ? 'nose-heavy ' : 'tail-heavy ') + Math.abs(bal.deg) + '°';
        const wl = label('WEIGHT  ' + word, bal.level === 'FAIL' ? C.LEVEL.FAIL : C.INK); wl.position.set(wx, wy - C.WEIGHT_R - C.LABEL_H * 0.7, 0); markersG.add(wl);
        scalers.push({ o: lab, at: [lx, ly], off: [0, C.LIFT_R + C.LABEL_H * 0.7] }, { o: wl, at: [wx, wy], off: [0, -(C.WEIGHT_R + C.LABEL_H * 0.7)] });
      }
      for (const e of spec.engines || []) { // the thrust arrow: the way the engine pushes (0 = forward), drawn in the ship's frame (y down in the layout, up here)
        const a = -(e.dir || 0), len = C.ARROW_LEN, head = 26, w = C.ARROW_W, ox = e.x, oy = -e.y;
        const g = new THREE.Group();
        g.position.set(ox, oy, 0);
        g.rotation.z = a;
        const shaft = solid(unit.box, C.THRUST, len - head, w, w, (len - head) / 2, 0, 0, 3.5);
        const tip = solid(unit.cone, C.THRUST, 12, head, 12, len - head / 2, 0, 0, 4);
        tip.rotation.z = -Math.PI / 2;
        g.add(shaft, tip);
        markersG.add(g);
        scalers.push({ o: g });
      }
    } catch (e) { warnOnce('markers', e); }
  }

  // ---- the ghost -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const cache = new Map(); // key -> { group, pv, bags, ok, order, ... }
  let cacheVer = -1, current = null, pending = null, builtKey = '', shownOk = true;
  const disposeGhost = (gh) => {
    if (!gh) return;
    gh.group.removeFromParent();
    gh.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of gh.mats || []) { try { for (const k of ['toon', 'plain', 'depth']) m[k].dispose(); if (m.dmgTex) m.dmgTex.dispose(); } catch { /* (gone) */ } }
  };
  const clearGhosts = () => { for (const gh of cache.values()) disposeGhost(gh); cache.clear(); current = null; builtKey = ''; };

  // Build the ghost of what `newParts` adds to the live layout `base`. Returns { group, pv, bags, bounds } or null (nothing new / nothing drawable).
  function buildGhost(base, newParts) {
    const L = buildLayout(newParts, { cell: config.MAPS.CELL });
    const have = new Map();
    for (const it of listParts(base)) { if (SKIP.has(it.kind)) continue; const s = sigOf(base, it); have.set(s, (have.get(s) || 0) + 1); }
    const fresh = [];
    for (const it of listParts(L)) {
      if (SKIP.has(it.kind)) continue;
      const s = sigOf(L, it), n = have.get(s) || 0;
      if (n > 0) have.set(s, n - 1); else fresh.push(it);
    }
    if (!fresh.length) return null;
    const ctx = makeShipContext(L, {}), holder = new THREE.Group(), mats = makeTrimMaterials();
    ctx.content = holder; ctx.mats = mats;
    const entries = [], made = [], dyn = [];
    ctx.part = (key) => { const b = new PartBatch(key); b.mats = mats; made.push(b); return b; };
    ctx.dynBatch = (key) => { const b = new PartBatch(key); b.mats = mats; return b; };
    for (const it of fresh) {
      const reg = REGISTRY[it.kind];
      if (!reg || !reg.art) continue;
      made.length = 0;
      let res = null;
      try { res = reg.build(it.part, ctx, it.arg); } catch (e) { warnOnce('ghost ' + it.kind, e); continue; }
      if (!res) continue;
      const mine = new Set(res.batches || []);
      for (const b of made) if (mine.has(b)) entries.push(b);
      for (const d of res.dyn || []) dyn.push(d);
    }
    // the fixed pieces: one geometry, neg layer first, then main, then pos (the near-side copy is picked each frame by the ship's view side)
    const geos = [];
    let negEnd = 0, mainEnd = 0, total = 0, n = 0;
    for (const layer of ['neg', 'main', 'pos']) {
      for (const b of entries) for (const g of b.layers[layer]) { geos.push(g); n += g.attributes.position.count; }
      if (layer === 'neg') negEnd = n; else if (layer === 'main') mainEnd = n; else total = n;
    }
    let mesh = null;
    if (geos.length) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (merged) { merged.computeBoundingBox(); mesh = new THREE.Mesh(merged, ghostMatV); mesh.frustumCulled = false; mesh.renderOrder = RENDER_ORDER; holder.add(mesh); }
    }
    const bags = [];
    for (const d of dyn) {
      if (!d.node) continue;
      if (d.role === 'bag') { holder.add(d.node); bags.push({ node: d.node, back: d.back || 0, baseX: d.baseX || 0 }); }
      if (d.role === 'lamp') { if (d.outer) d.outer.visible = false; if (d.inner) d.inner.visible = false; }
    }
    // everything that moves was added to the holder by its builder: tint it all, drop the lights, ink shells and glow cones
    const lights = [];
    holder.traverse((o) => {
      if (o.isLight) { lights.push(o); return; }
      if (!o.isMesh) return;
      o.frustumCulled = false;
      o.renderOrder = RENDER_ORDER;
      o.castShadow = o.receiveShadow = false;
      if (o === mesh) return;
      const hasColor = !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color);
      const additive = o.material && !Array.isArray(o.material) && (o.material.blending === THREE.AdditiveBlending || o.material.transparent);
      if (o.userData.isOutline || additive) { o.visible = false; return; }
      o.material = hasColor ? ghostMatV : ghostMatP;
    });
    for (const l of lights) { if (l.target) l.target.removeFromParent(); l.removeFromParent(); }
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder);
    if (!Number.isFinite(box.min.x) || box.isEmpty()) { disposeGhost({ group: holder, mats: [mats] }); return null; }
    const pad = 6;
    box.expandByVector(new THREE.Vector3(pad, pad, pad));
    const edges = new THREE.Mesh(edgeGeometry(box, B3().GHOST_EDGE), edgeMat);
    edges.frustumCulled = false; edges.renderOrder = RENDER_ORDER + 1;
    holder.add(edges);
    return { group: holder, pv: ctx.pv, bags, mesh, negEnd, mainEnd, total, mats: [mats], count: fresh.length, bounds: box };
  }

  // ask for a ghost (null = none). spec = { key, make(): { parts, ok }, bad (force red), offset: { x, y } in ship px (slide the ghost by this), at (when asked, ms) }
  function request(spec) {
    if (!spec) { pending = null; hideGhost(); return; }
    if (!pending || pending.key !== spec.key) pending = { ...spec, t: spec.t != null ? spec.t : performance.now() };
    else { pending.offset = spec.offset; pending.bad = spec.bad; pending.make = spec.make; }
  }
  const hideGhost = () => { ghostG.visible = false; };

  // ---- the frame ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  function update(now) {
    try {
      const models = view.models, e = models && models.values().next().value;
      if (!e) { overlay.removeFromParent(); host = null; return; }
      const model = e.model;
      if (model.content !== host || overlay.parent !== model.content) { overlay.removeFromParent(); host = model.content; host.add(overlay); }
      const ver = model.layout ? model.layout.version : 0;
      if (ver !== cacheVer) { cacheVer = ver; clearGhosts(); } // (a new build: the old ghosts were made against the old ship)
      markersG.visible = showM;
      markersG.position.x = -model.pv;
      if (showM && scalers.length) { // keep the markers the same size on the screen whatever the orbit distance
        const cam = view.camera, tgt = view.controls ? view.controls.target : null;
        const dist = tgt ? cam.position.distanceTo(tgt) : SCREEN_REF, k = Math.max(0.3, Math.min(3.5, dist / SCREEN_REF));
        for (const s of scalers) {
          if (s.at) { s.o.position.set(s.at[0], s.at[1] + s.off[1] * k, 0); s.o.scale.set(s.o.userData.size[0] * k, s.o.userData.size[1] * k, 1); } else s.o.scale.setScalar(k);
        }
      }
      // the ghost: build once the spot has been held for the debounce time
      let want = showG ? pending : null;
      if (!want) { hideGhost(); return; }
      let gh = cache.get(want.key);
      if (!gh && now - want.t >= B3().GHOST_DEBOUNCE && !want.building) {
        const t0 = performance.now();
        want.building = true;
        try {
          const r = want.make();
          const built = r && r.parts ? buildGhost(model.layout, r.parts) : null;
          if (built) { built.ok = !!r.ok; gh = built; cache.set(want.key, gh); stats.ghostBuilds++; stats.ghostParts = built.count; }
          else cache.set(want.key, (gh = { empty: true, group: new THREE.Group(), mats: [] }));
        } catch (err) { warnOnce('ghost', err); cache.set(want.key, (gh = { empty: true, group: new THREE.Group(), mats: [] })); }
        stats.lastGhostMs = performance.now() - t0; stats.ghostMs += stats.lastGhostMs;
        while (cache.size > 6) { const k = cache.keys().next().value; if (k === want.key) break; disposeGhost(cache.get(k)); cache.delete(k); }
      }
      if (gh && !gh.empty) {
        if (current !== gh) { if (current) current.group.removeFromParent(); current = gh; ghostG.add(gh.group); }
        shownOk = !want.bad && gh.ok;
        paint(shownOk);
        const off = want.offset;
        gh.group.position.set(gh.pv - model.pv + (off ? off.x : 0), off ? -off.y : 0, 0);
        const side = model.viewSide >= 0 ? 1 : -1; // (the near-side copy of ladders and such: the layer the camera is on)
        if (gh.mesh) { gh.mesh.geometry.setDrawRange(side >= 0 ? 0 : gh.negEnd, side >= 0 ? gh.mainEnd : gh.total - gh.negEnd); }
        const yw = model.root.rotation.y;
        for (const bg of gh.bags) { bg.node.position.x = bg.baseX + bg.back * Math.sin(yw); bg.node.position.z = -bg.back * Math.cos(yw); bg.node.scale.set(0.78 + 0.44 * 0.6, 0.9 + 0.2 * 0.6, 0.9 + 0.2 * 0.6); }
        ghostG.visible = true;
      } else if (current && gh && gh.empty) { current.group.removeFromParent(); current = null; hideGhost(); }
      else if (!gh) { /* (still waiting for the debounce: keep what is showing) */ }
    } catch (e) { warnOnce('update', e); }
  }

  return {
    group: overlay,
    setMarkers,
    showMarkers: (on) => { showM = !!on; },
    showGhost: (on) => { showG = !!on; if (!on) hideGhost(); },
    request,
    update,
    stats,
    ghostWorld: () => { if (!current || !current.bounds) return null; const v = current.bounds.getCenter(new THREE.Vector3()); current.group.localToWorld(v); return v; }, // (tools: where the ghost is in the world)
    ghostState: () => ({ visible: !!(showG && ghostG.visible && current), ok: shownOk, key: pending ? pending.key : '', cached: cache.size, markers: markersG.children.length }), // (tools)
    clearGhosts,
    dispose() {
      try { clearGhosts(); clearMarkers(); overlay.removeFromParent(); for (const g of Object.values(unit)) g.dispose(); for (const m of [inkMat, ghostMatV, ghostMatP, edgeMat]) m.dispose(); } catch { /* (gone) */ }
    },
  };
}
