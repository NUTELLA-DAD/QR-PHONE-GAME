// A ship's PARTS LIST (via its layout) turned into 3D, in the toon + ink look.
//   buildShipModel(layout, { enemy }) -> model
// WP2: the building is done by the PARTS REGISTRY (parts3d/registry.js: one builder per kind of part; hull.js lofts the gondola, bag.js lathes the envelopes, decks.js, rooms.js, stations.js, weapons.js,
// engines.js build the rest) on the painted trim sheet (textures.js). This file is the orchestrator: it builds every part, assembles all the static pieces into ONE mesh with one ink shell
// (kit.assemble, with a vertex range per part id: model.parts / model.ranges / model.extractPart(key), what WP5 needs to lift a broken part out), puts the moving pieces (guns, lamps, props, the wheel, bags,
// sails, hatch leaves, the rudder) in groups of their own, and animates them from the game state every frame (model.update). Nothing here wobbles.
// Ship coordinates (x along the ship, y down) become 3D as X = x - pivot, Y = -y; Z is depth (the viewer is at +Z). The rooms are a cut-away: the hull's wall that faces the viewer is hidden each frame
// (model.setView, a draw range) so you can see the crew and fittings, and the far wall carries the room colours. Pitch is a rotation of `pitchG` about the ship's tilt pivot; the facing (and COME ABOUT) is a yaw of
// `root`. Anything the generator has no 3D version of is drawn as a plain box and listed in model.fallbacks (empty for every build the game can make).
import { THREE, G, look, applyLook, glow, glowMat, INK } from './style.js';
import { assemble, makeTrimMaterials, inkOn } from './parts3d/kit.js';
import { makeShipContext, buildParts, THEMES } from './parts3d/registry.js';
import { GLOW as WGLOW } from './parts3d/weapons.js';
import { buildEnemyDecor } from './parts3d/enemyDecor.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { config } from '../../config.js';

export { THEMES };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Emissive things are HDR colours (style.js glow: brighter than 1) so they cross the bloom threshold and the post pass makes them glow; nothing else does.
const GLOW = { lamp: glow('#ffe9b0', 3.4), lampOff: new THREE.Color('#b9a67a'), boiler: glow('#ff9a4a', 3.4), boilerLow: glow('#d9531a', 3.2), lens: WGLOW.lens, lensOff: WGLOW.lensOff };
const lampMat = glowMat('#ffe9b0', 3.4);
// WP10 LANTERN POOLS: a soft warm gradient on the far wall behind every lantern, so a room still reads lantern-lit where there are few or no real lights (Medium: 2 a ship, Low: none). One additive material
// for every ship (its strength follows the night and the tier, set in step()); one merged quad mesh a ship.
let _poolMat = null;
function lanternPoolMat() {
  if (_poolMat) return _poolMat;
  const N = 64, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d'), r = N / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.62)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  _poolMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false, opacity: 0 });
  return _poolMat;
}
const flameMats = { out: glowMat('#ff5a24', 4.4), inn: glowMat('#ffe680', 2.4), ink: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }) };

export function buildShipModel(layout, opts = {}) {
  const L = layout, ctx = makeShipContext(L, opts), { T, P, W, pv, X, Y, FZ } = ctx;
  const fallbacks = ctx.fallbacks;

  const root = new THREE.Group(); // yaw (facing / COME ABOUT) is applied here; placed at the ship's pivot in the world
  const pitchG = new THREE.Group(); // pitch about the tilt pivot
  const content = new THREE.Group();
  root.add(pitchG);
  pitchG.add(content);
  const tp = L.tiltPivot || [pv, 520];
  pitchG.position.set(X(tp[0]), Y(tp[1]), 0);
  content.position.set(-X(tp[0]), -Y(tp[1]), 0);
  ctx.content = content;
  ctx.mats = makeTrimMaterials(); // (this ship's own materials: its own hidden-wall switch; the compiled programs are shared)

  const dyn = { guns: {}, lamps: [], bags: [], lanterns: [], boilerGlow: [], sails: [], engines: [], coil: null, liftCages: [], wheels: [], twins: [], hatches: [], cannons: [], rudder: null };
  const lights = { points: [], boiler: [] };

  // ---- every part, from the registry ---------------------------------------------------------------------------------------------------------------------------------
  let built = { entries: [], parts: new Map(), dyn: [] };
  try { built = buildParts(L, ctx); } catch (e) { fallbacks.push('parts failed: ' + (e && e.message)); console.warn('ship3d parts', e); }
  let asm;
  try { asm = assemble(built.entries, ctx.mats); } catch (e) { // (never throw from drawing code: a ship with no static mesh is better than a frozen TV)
    fallbacks.push('assemble failed: ' + (e && e.message));
    console.warn('ship3d assemble', e);
    asm = { group: new THREE.Group(), ranges: {}, layers: {}, tris: 0, geometry: null, mesh: null, mats: ctx.mats, setSide() {}, setCarves() {}, extract: () => new THREE.Group() };
  }
  content.add(asm.group);
  try { asm.setCarves(ctx.carves); } catch (e) { console.warn('ship3d carves', e); }
  for (const d of built.dyn) {
    switch (d.role) {
      case 'gun': dyn.guns[d.name] = d.node; break;
      case 'lamp': dyn.lamps.push({ name: d.name, pivot: d.pivot, spot: d.spot, target: d.target, outer: d.outer, inner: d.inner, lens: d.lens, reach: d.reach, ll: d.ll, home: d.home, arc: d.arc }); break;
      case 'bag': content.add(d.node); dyn.bags.push({ node: d.node, G: d.G, i: d.i, back: d.back || 0, baseX: d.baseX }); break;
      case 'engine': dyn.engines.push({ name: d.name, group: d.group, prop: d.prop, out: d.out, angle: d.angle }); break;
      case 'wheel': dyn.wheels.push(d.node); break;
      case 'liftCage': dyn.liftCages.push({ node: d.node, lane: d.lane || 0 }); break;
      case 'sail': dyn.sails.push({ node: d.node, s: d.s }); break;
      case 'hatch': dyn.hatches.push({ n: d.n, left: d.left, right: d.right }); break;
      case 'cannon': dyn.cannons.push({ name: d.name, pivot: d.node, inner: d.inner, home: d.home }); break;
      case 'rudder': dyn.rudder = d.node; break;
      case 'coilTip': dyn.coil = d.node; break;
      default: break;
    }
  }

  // WP9: the enemy gunship's menace (spikes on the bags, her emblem, her mast and pennant, a bowsprit horn, red lanterns, a stack): on top of the same parts every ship has
  let decor = null;
  if (opts.enemy) { try { decor = buildEnemyDecor(ctx, { dyn, content }, { bp: opts.bp || null }); } catch (e) { fallbacks.push('enemy decor failed: ' + (e && e.message)); console.warn('ship3d decor', e); } }

  // ---- lanterns (small lights hung in the rooms: ONE merged mesh of all the bulbs) and the boiler glow --------------------------------------------------------------------
  dyn.lanterns = ctx.lanternSpots;
  if (ctx.lanternSpots.length) {
    const gs = ctx.lanternSpots.map((p) => { const g = G.sphereLo.clone(); g.applyMatrix4(new THREE.Matrix4().compose(V(p[0], p[1], p[2]), new THREE.Quaternion(), V(9, 9, 9))); return g; });
    const m = new THREE.Mesh(mergeGeometries(gs, false), lampMat);
    content.add(m);
    for (const g of gs) g.dispose();
  }
  let lanternPool = null; // (WP10) the faked pool of each lantern on the far wall: ONE merged mesh, moved to whichever wall is the far one each frame (step())
  if (ctx.lanternSpots.length) {
    try {
      const R = ((config.LOOK3D && config.LOOK3D.LANTERN && config.LOOK3D.LANTERN.SIZE) || 190);
      const qs = ctx.lanternSpots.map((p) => { // (the pool stays inside its room: its half width and height are the room's)
        const rw = Math.min(R, (p[3] || R) * 0.95), rh = Math.min(1.55 * R, (p[4] || 260) * 0.62), g = new THREE.PlaneGeometry(1, 1);
        g.applyMatrix4(new THREE.Matrix4().compose(V(p[0], p[1] - 30, 0), new THREE.Quaternion(), V(2 * rw, 2 * rh, 1)));
        return g;
      });
      lanternPool = new THREE.Mesh(mergeGeometries(qs, false), lanternPoolMat());
      for (const g of qs) g.dispose();
      lanternPool.renderOrder = 2; lanternPool.frustumCulled = false; lanternPool.visible = false;
      content.add(lanternPool);
    } catch (e) { console.warn('ship3d lantern pools', e); lanternPool = null; }
  }
  for (const p of ctx.lanternSpots) {
    const pl = new THREE.PointLight('#ffd9a0', 0, 420, 0);
    pl.position.set(p[0], p[1] - 6, p[2] + 50);
    content.add(pl);
    lights.points.push(pl);
  }
  if (ctx.glowSpots.length) {
    const gm = glowMat('#ff8a3a', 3.4, { side: THREE.DoubleSide });
    const gs = ctx.glowSpots.map((g) => { const c = new THREE.CircleGeometry(20, 14); c.applyMatrix4(new THREE.Matrix4().compose(V(g[0], g[1], g[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, g[3] < 0 ? Math.PI : 0, 0)), V(1, 1, 1))); return c; });
    const m = new THREE.Mesh(mergeGeometries(gs, false), gm);
    content.add(m);
    for (const g of gs) g.dispose();
    dyn.boilerGlow.push(m);
    const bl = new THREE.PointLight('#ff7a2a', 0, 380, 0);
    bl.position.set(ctx.glowSpots[0][0], ctx.glowSpots[0][1], ctx.glowSpots[0][2] + 60);
    content.add(bl);
    lights.boiler.push(bl);
  }

  // count what we made (the unique geometry: the ink shells share it)
  let tris = 0;
  content.traverse((o) => { if (o.isMesh && !o.userData.isOutline && o.geometry && o.geometry.attributes.position) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 / (o.geometry.attributes.aShell ? 2 : 1); });

  // ---- flames (a pool; stepped frames, no wobble) --------------------------------------------------------------------------------------------------
  const flamePool = [];
  const makeFlame = () => { // three tongues (a tall one between two short ones), each an ink shell, an orange cone and a yellow heart; update() steps their heights through four frames
    const g = new THREE.Group();
    const tongues = [];
    for (const [dx, r, h] of [[-19, 15, 46], [0, 21, 74], [19, 15, 52]]) {
      const t = new THREE.Group();
      const inkM = new THREE.Mesh(G.cone, flameMats.ink), a = new THREE.Mesh(G.cone, flameMats.out), c = new THREE.Mesh(G.cone, flameMats.inn);
      inkM.scale.set(r + 7, h + 12, r + 7); inkM.position.y = h / 2 + 2;
      a.scale.set(r, h, r); a.position.y = h / 2;
      c.scale.set(r * 0.5, h * 0.55, r * 0.5); c.position.y = h * 0.27;
      t.add(inkM, a, c);
      t.position.x = dx;
      g.add(t);
      tongues.push(t);
    }
    g.userData.tongues = tongues;
    return g;
  };

  let lastT = null;
  // ---- the per-frame update ---------------------------------------------------------------------------------------------------------------------------
  const model = {
    root, pitchG, content, W, pv, X, Y, tris, fallbacks, layout: L, lights, dyn, enemy: !!opts.enemy, theme: T, ctx, crewLane: ctx.crewLane,
    // WP5: the parts, by id. parts.get(key) = { key, kind, name, deck, x, x0, x1, dyn: [...], bounds }; ranges[key] = [{ layer, start, count }] into the one merged geometry.
    parts: built.parts, ranges: asm.ranges, assembled: asm,
    extractPart: (key) => asm.extract(key),
    dispose() { try { for (const k of ['toon', 'plain', 'depth']) ctx.mats[k].dispose(); } catch { /* (gone already) */ } }, // (this ship's own materials; index.js calls it when the ship is rebuilt or gone)
    // Hide the hull wall that faces the viewer: camSide > 0 when the camera is on the ship's local +Z side.
    setView(camSide, both) { asm.setSide(camSide, both); model.viewSide = camSide; model.bothWalls = !!both; }, // (A1: both = the middle of a COME ABOUT shows both walls)
    // c: { t, ship (handle), world, night (0..1), lamps (the beams shine) }
    update(c) { try { this.step(c); } catch (e) { const m = String((e && e.message) || e); if (m !== model.lastErr) { model.lastErr = m; console.warn('ship3d update', e); } } }, // (never throw from drawing code)
    step(c) {
      const sh = c.ship, st = (sh && sh.ctx) || c.world, t = c.t, night = c.night || 0;
      const dt = lastT == null ? 0 : clamp(t - lastT, 0, 0.1);
      lastT = t;
      inkOn.value = look.toon && look.outlines ? 1 : 0; // (the ink is part of each mesh now: the look's outline switch is a uniform)
      for (const lc of dyn.liftCages) lc.node.position.z = (asm.side || 1) * lc.lane; // (the lift stands on the camera's side, like the ladders)
      dyn.bags.forEach((bg) => {
        const bs = st.bags && st.bags[bg.i];
        const gas = bs ? bs.gas : st.ship ? st.ship.gas : 50;
        const g = clamp((Number.isFinite(gas) ? gas : 50) / 100, 0, 1);
        bg.node.scale.set(0.78 + 0.44 * g, 0.9 + 0.2 * g, 0.9 + 0.2 * g); // the swell: a SCALE from the gas level, never a vertex wobble
        // fix_ship: the envelope rides `back` units behind the gondola in WORLD depth whichever way she faces (and through COME ABOUT): the offset (0, -back) in the world, turned back into the ship's own frame
        const yw = root.rotation.y;
        bg.node.position.x = (bg.baseX || 0) + bg.back * Math.sin(yw);
        bg.node.position.z = -bg.back * Math.cos(yw);
      });
      if (decor) decor.update(t, opts.gunship && opts.gunship.intent, model.gale || 0);
      const guns = st.GUNS || {};
      for (const [name, pivot] of Object.entries(dyn.guns)) { const live = guns[name]; if (live && Number.isFinite(live.aim)) pivot.rotation.z = -live.aim; }
      const sls = st.searchlights || [];
      dyn.lamps.forEach((lp, i) => {
        const live = sls.find((q) => q.n === lp.name) || sls[i];
        const manned = !!(live && live.manned);
        let aim = live && Number.isFinite(live.aim) ? live.aim : lp.home;
        let power = live && Number.isFinite(live.power) ? clamp(live.power, 0, 1) : 0.3;
        if (c.sweep && !manned) { aim = lp.home + lp.arc * 0.85 * Math.sin(t * 0.4 + i * 2.2); power = 0.9; } // wobble-ok: the dev page's idle-lamp sweep demo (off in the game) (demo: nobody is on the lamp, so it sweeps by itself; display only)
        lp.pivot.rotation.z = -aim;
        lp.spot.castShadow = !!c.spotShadow && i === 0 && look.shadows;
        const on = !!c.lamps && night > 0.12;
        const reach = lp.reach * (0.65 + 0.35 * power);
        lp.spot.intensity = on ? 9 * (0.5 + 0.5 * power) * Math.min(1, night * 1.4) : 0;
        lp.spot.distance = reach * 1.5;
        lp.spot.angle = Math.max(0.2, (live && Number.isFinite(live.half) ? live.half : 0.24) * 1.15);
        lp.outer.visible = lp.inner.visible = on && !look.beam; // (WP10: the soft volumetric beam of beams.js replaces the two cones; ?look=nobeam brings them back)
        lp.outer.scale.x = lp.inner.scale.x = reach / lp.reach;
        lp.target.position.x = reach;
        lp.lens.material.color.copy(on ? GLOW.lens : GLOW.lensOff);
      });
      const lampOn = night > 0.12 ? 1 : 0;
      for (const pl of lights.points) pl.intensity = lampOn * 5 * night;
      const press = st.ship ? clamp((Number.isFinite(st.ship.press) ? st.ship.press : 60) / 100, 0.2, 1) : 0.6;
      for (const pl of lights.boiler) pl.intensity = (0.8 + 5 * night) * press;
      for (const m of dyn.boilerGlow) m.material.color.copy(press > 0.5 ? GLOW.boiler : GLOW.boilerLow);
      lampMat.color.copy(lampOn ? GLOW.lamp : GLOW.lampOff); // (the lanterns are lit when it is dark)
      if (lanternPool) { // WP10: the pool of each lantern on the far wall (the near wall is cut away): strong where there are few real lights
        const LC = (config.LOOK3D && config.LOOK3D.LANTERN) || {}, tierName = c.tier || 'medium';
        const amt = lampOn ? ((LC.ALPHA && LC.ALPHA[tierName]) != null ? LC.ALPHA[tierName] : 0.4) * clamp(night * 1.4, 0, 1) * (c.lamps === false ? 0.6 : 1) : 0;
        const pm = lanternPool.material;
        pm.color.set(LC.COLOR || '#ffb25c');
        pm.opacity = amt;
        lanternPool.visible = amt > 0.01 && look.beam !== false;
        lanternPool.position.z = -(model.viewSide >= 0 ? 1 : -1) * (W - 15.5); // (the far wall: the side the camera is NOT on)
      }
      // each prop spins at ITS engine's own throttle (state.engines[i].pow, what the engine is running at; the sim keeps it, the view only reads it); a stopped or broken engine stands still
      const live = st.engines || [];
      for (const e of dyn.engines) {
        const le = live.find((q) => q.name === e.name);
        let pow = le && Number.isFinite(le.pow) ? le.pow : le && Number.isFinite(le.thr) ? le.thr : st.ship && Number.isFinite(st.ship.speed) ? st.ship.speed : 0;
        if (le && le.works === false) pow = 0;
        e.angle = (e.angle + dt * 38 * clamp(pow, -1.2, 1.2)) % (Math.PI * 2);
        e.prop.rotation.x = e.angle;
        if (le && Number.isFinite(le.dir)) e.group.rotation.z = -le.dir;
      }
      for (const w of dyn.wheels) w.rotation.z = (st.ship && Number.isFinite(st.ship.order) ? st.ship.order : 0) * 3;
      const liveSails = st.sails || [];
      dyn.sails.forEach((sd, i) => { const ls = liveSails.find((q) => q.n === sd.s.n) || liveSails[i]; const hoist = ls && Number.isFinite(ls.hoist) ? ls.hoist : 1; sd.node.scale.y = 0.12 + 0.88 * clamp(hoist, 0, 1); });
      // the drop hatch's leaves swing down on the sim's door (0 shut .. 1 wide); the crew cannon's barrel follows its gunner and kicks back
      const liveHatch = st.hatches || [];
      for (const h of dyn.hatches) { const lh = liveHatch.find((q) => q.n === h.n); const door = lh && Number.isFinite(lh.door) ? clamp(lh.door, 0, 1) : 0; h.left.rotation.z = -door * 1.45; h.right.rotation.z = door * 1.45; }
      const liveCannon = st.cannons || {};
      for (const cn of dyn.cannons) { const r = liveCannon[cn.name]; cn.pivot.rotation.z = -(r && Number.isFinite(r.aim) ? r.aim : cn.home); cn.inner.position.x = -(r && Number.isFinite(r.recoil) ? r.recoil : 0) * 22; }
      if (dyn.rudder) { const turn = sh && sh.pose && sh.pose.turn > 0 && sh.pose.turn < 1; dyn.rudder.rotation.y = turn ? 0.5 : 0; } // (hard over while she comes about)
      const fires = model.flameFallback ? st.fires || [] : []; // (WP4: vfx.js draws the flames as particles; these three-tongue cones are only the fallback when the particles are off)
      while (flamePool.length < fires.length) { const f = makeFlame(); content.add(f); flamePool.push(f); }
      flamePool.forEach((f, i) => {
        const fr = fires[i], q = fr && P[fr.d];
        f.visible = !!q;
        if (!q) return;
        const k = fr.big ? 1.7 : 1, fi = ((Math.floor(t * 8 + fr.x * 0.013) % 4) + 4) % 4; // (fires left of x 0 gave a negative frame)
        f.position.set(X(fr.x), Y(q.y), FZ + 40);
        f.scale.setScalar(k);
        f.userData.tongues.forEach((tg, ti) => { const hh = [[1, 0.8, 1.1], [0.85, 1.15, 0.9], [1.1, 0.9, 0.8], [0.95, 1.05, 1.0]][fi][ti]; tg.scale.set(1, hh, 1); });
      });
    },
  };
  applyLook(root);
  return model;
}
