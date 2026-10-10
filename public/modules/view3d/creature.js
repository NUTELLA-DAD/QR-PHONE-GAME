// THE GIANT CREATURES IN 3D (WP8, 3D.md section 14): one generic view for every creature of host/creature.js (state.creature), plus a small KIND per creature (creatureKraken.js: the body's
// geometry and colours). It replaces the old kraken.js (tapered capsules). What it draws, all from the simulation's data and never moving a thing by itself (no wobble, no idle sine):
//   - the HEAD / BODY: a sculpted mantle with mottled skin, a crest, spikes, fins, a frill, big glowing eyes on the sides of the head and the beak in the middle of the lips (two hinged halves, a
//     glowing throat), the heart window; one mesh (+ its ink shell) for the still parts and one for the jaws, lids and heart (their vertices are rewritten when their pose changes: stepped)
//   - the LIMBS: each limb is ONE continuous tube along the sim's rigid segments (creatureTube.js), all limbs in one mesh, with instanced suckers on the inner side. A limb wrapped round a ship
//     (setWrap) gets its depth from the coil's own path (wrap.pts[].z), so it passes behind and in front of the hull and visibly squeezes it
//   - the WATER: foam rings where a limb or the body crosses the sea line, a wake, a spray column and a crash when it breaches, the breach SHADOW on the water, a death flourish, all through
//     WP4's particles and the sea's splash rings (creatureWater.js, creatureFx.js)
//   - severed chunks as Rapier bodies (destruction.addExternal) that tumble, splash and float; the harpoon line as a rope; grip markers (the red ring that warns, the timer ring)
//   - dim until a searchlight has a part (the sim's p.lit), eyes always glowing a little, a hit flash, an exhausted look in phase 3 (paler, dim eyes, heavy lids), a sinking look when it dies
// Coordinates: the 3D world's (x = the game's x, y = UP = the game's y negated, z toward the viewer; the gameplay plane z = 0). Budget: about 8 draw calls (head 4, limbs 2 + suckers 1, a foam mesh,
// the shadow, ropes and markers only while they exist), under 60k triangles with ink.
import { THREE, look, applyLook, outlineMat } from './style.js';
import { config } from '../../config.js';
import { paintHeadAtlas, paintLimbSkin, creatureToon, makeUniforms, Tinter } from './creatureKit.js';
import { createTubeSet } from './creatureTube.js';
import { buildKraken } from './creatureKraken.js';
import { createFoamRings, createShadowDecal, createGripMarkers, createRopeSet } from './creatureFx.js';
import { createWaterFx } from './creatureWater.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const FLASH = [2.4, 2.2, 2.2], DIM = [0.66, 0.72, 0.95], LIT = [1.28, 1.22, 1.2], TIRED = [0.84, 0.82, 0.95]; // (LIT: a part a searchlight has, in the dark, is lifted a little on top of the real beam)

// The kinds: what is special about each creature. A new creature adds one entry (palette, build -> the geometry, which part kinds are its limbs).
export const KINDS = {
  kraken: { id: 'kraken', palette: () => config.CREATURE3D.KRAKEN, build: buildKraken, limbKind: 'tentacle' },
};

export function createCreatureView(parent) {
  const root = new THREE.Group();
  root.name = 'creature';
  root.visible = false;
  parent.add(root);
  const link = { world: null, vfx: null, destruction: null, models: null, camera: null };
  let rig = null, failedFor = null;
  const stats = { tris: 0, chunks: 0, built: 0 };

  // ---- the plain look (the dev page's "Plain lit" comparison) for every textured mesh we make ----
  const plainOf = (o) => { const m = o.userData.toon; if (m && !o.userData.plain) o.userData.plain = new THREE.MeshLambertMaterial({ map: m.map || null, vertexColors: !!m.vertexColors, color: m.color ? m.color.clone() : '#ffffff' }); };

  // ---- build everything for a creature (once, when it first appears) ----
  function build(cr, tier) {
    if (rig) dispose();
    const K = KINDS[cr.kind] || KINDS.kraken, P = K.palette(), low = !!(tier && tier.name === 'low');
    const head = K.build(cr, P, { low });
    const uniforms = makeUniforms(0.99), uniformsT = makeUniforms(0.958); // (a thin limb shows a thinner glint than the big smooth dome)
    const headMap = paintHeadAtlas(P), limbMap = paintLimbSkin(P);
    const headMat = creatureToon(headMap, uniforms);
    const hg = new THREE.Group();
    const headMesh = new THREE.Mesh(head.geometry, headMat), headInk = new THREE.Mesh(head.geometry, outlineMat);
    const dynMesh = new THREE.Mesh(head.dynGeometry, headMat), dynInk = new THREE.Mesh(head.dynGeometry, outlineMat);
    for (const m of [headMesh, headInk, dynMesh, dynInk]) m.frustumCulled = false;
    headMesh.userData.toon = dynMesh.userData.toon = headMat;
    headInk.userData.isOutline = dynInk.userData.isOutline = true;
    hg.add(headMesh, headInk, dynMesh, dynInk);
    root.add(hg);
    const limbs = cr.parts.filter((p) => p.limb);
    const defLimb = cr.def.parts.find((d) => d.chain);
    const maxSegs = Math.max(2, defLimb ? defLimb.chain.length : 8);
    const sides = low ? 8 : P.TENTACLE_SIDES || 12;
    const tubes = createTubeSet({ nLimbs: limbs.length, maxSegs, sides, map: limbMap, uniforms: uniformsT, palette: P, ow: P.INK || 14 });
    root.add(tubes.mesh, tubes.inkMesh, tubes.suckers);
    const fxU = { uFoam: { value: new THREE.Color(P.FOAM ? P.FOAM.COLOR : '#f4fbfa') }, uLevel: { value: 1 }, uBand: { value: P.FOAM ? P.FOAM.BAND : 0.55 }, uAlpha: { value: P.FOAM ? P.FOAM.ALPHA : 0.92 }, uShadow: { value: new THREE.Color(P.SHADOW ? P.SHADOW.COLOR : '#0a1830') }, uShadowAlpha: { value: P.SHADOW ? P.SHADOW.ALPHA : 0.5 } };
    const foam = createFoamRings(parent, fxU), shadow = createShadowDecal(parent, fxU), markers = createGripMarkers(parent), ropes = createRopeSet(parent);
    applyLook(root);
    root.traverse(plainOf);
    plainOf(foam.mesh);
    const ranges = head.ranges, tint = new Tinter(head.geometry);
    rig = {
      cr, kind: cr.kind, K, P, low, head, uniforms, uniformsT, headMap, limbMap, headMat, hg, headMesh, dynMesh, tubes, tint, limbs, fxU, foam, shadow, markers, ropes, ranges, bake: null, chunks: new Map(),
      water: createWaterFx({ world: { splashAt: (...a) => (link.world ? link.world.splashAt(...a) : 0) }, getP: () => (link.vfx && link.vfx.P) || null }),
      lastY: null, speedY: 0, zbuf: new Float32Array(32), glow: [1, 1, 1, 1], lidKey: '', jawKey: '', heartKey: '', mantleX: null,
    };
    stats.built++;
    stats.tris = head.tris + head.dynTris + tubes.stats().tris;
  }

  function dispose() {
    if (!rig) return;
    clearChunks();
    root.remove(rig.hg, rig.tubes.mesh, rig.tubes.inkMesh, rig.tubes.suckers);
    for (const g of [rig.head.geometry, rig.head.dynGeometry]) g.dispose();
    rig.tubes.dispose(); if (rig.bake) rig.bake.dispose();
    for (const o of [rig.foam, rig.shadow, rig.markers, rig.ropes]) { (o.mesh || o.group).removeFromParent(); o.dispose(); }
    rig.headMat.dispose(); rig.headMap.dispose(); rig.limbMap.dispose();
    rig = null;
  }

  // ---- the depth of a limb at each joint: front or back layer, a coil's own path when it wraps a ship ----
  function wrapZ(w, s) { // the depth (-1..1) at arc length s along a wrap path (creature.js wrapAt)
    const { pts, cum } = w, n = pts.length, total = cum[n - 1];
    if (s >= total) return pts[n - 1].z;
    let i = 1;
    while (i < n - 1 && cum[i] < s) i++;
    const u = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u;
  }
  const hullHalf = () => { let h = 0; if (link.models) for (const e of link.models.values()) h = Math.max(h, e.model && e.model.W ? e.model.W : 0); return h || 240; };
  function jointZ(p, li, n, Z, dz, hh) {
    const ZC = rig.P.Z, front = p.layer === 'front';
    const zBase = front ? ZC.FRONT : ZC.BACK - (li % 3) * 40, zRoot = front ? ZC.ROOT_FRONT : ZC.ROOT_BACK, reach = Math.max(1, p.reach0 || p.reach || 1000);
    let s = 0;
    const m = p.wrap ? Math.max(2, p.segs.length - p.wrap.k) : n;
    let sw = 0;
    for (let j = 0; j <= n; j++) {
      if (p.wrap && j >= m) Z[j] = (hh + ZC.WRAP_MARGIN) * wrapZ(p.wrap, sw) + dz;
      else Z[j] = zRoot + (zBase - zRoot) * smooth(s / (reach * 0.4)) + dz;
      if (j < n) { s += p.segs[j].len; if (p.wrap && j >= m) sw += p.segs[j].len; }
    }
    // a wrapped segment the sim calls "behind" stays behind (the path says so too; this only guards the sign at the crossings)
    if (p.wrap) for (let j = m; j < n; j++) if (p.segs[j].behind && Z[j] > dz && Z[j + 1] > dz) Z[j] = Z[j + 1] = dz - 4;
  }

  // ---- severed chunks: Rapier bodies (destruction.addExternal) ----
  function clearChunks() {
    if (!rig) return;
    const D = link.destruction;
    for (const e of rig.chunks.values()) { if (D && D.removeExternal) D.removeExternal(e.piece); else e.holder.removeFromParent(); }
    rig.chunks.clear();
  }
  function makeChunk(c) {
    if (!rig) return null;
    const D = link.destruction, p = c.part, segs = p.segs, n = segs.length, P = rig.P;
    if (!n) return null;
    if (!rig.bake) rig.bake = createTubeSet({ nLimbs: 1, maxSegs: Math.max(8, (rig.tubes.RB - 1) / rig.tubes.Q), sides: rig.low ? 8 : P.TENTACLE_SIDES || 12, map: rig.limbMap, uniforms: rig.uniformsT, palette: P, ow: P.INK || 14 });
    // the boxes of the body: a row of cubes along each segment (the physics only has axis-aligned boxes in the body's frame)
    const boxes = [], pts = [];
    for (const s of segs) {
      const rm = (s.r + s.r1) / 2, half = clamp(rm * 0.75, 16, 90), step = Math.max(24, half * 1.7), k = Math.max(1, Math.round(s.len / step));
      for (let i = 0; i < k; i++) { const u = (i + 0.5) / k; pts.push({ x: s.x + Math.cos(s.ang) * s.len * u, y: -(s.y + Math.sin(s.ang) * s.len * u), h: half }); }
    }
    let stride = Math.ceil(pts.length / 14), cx = 0, cy = 0, cnt = 0;
    const use = pts.filter((_, i) => i % stride === 0);
    for (const q of use) { cx += q.x; cy += q.y; cnt++; }
    cx /= cnt; cy /= cnt;
    for (const q of use) boxes.push({ cx: q.x - cx, cy: q.y - cy, cz: 0, hx: q.h, hy: q.h, hz: q.h * 0.9 });
    const Z = new Float32Array(n + 1);
    const geo = rig.bake.bakeStatic(segs, p.side, true, Z, [1, 1, 1]);
    const holder = new THREE.Group(), inner = new THREE.Group();
    const mesh = new THREE.Mesh(geo, rig.tubes.material), ink = new THREE.Mesh(geo, outlineMat);
    mesh.userData.toon = rig.tubes.material; mesh.userData.shadowReceiver = true; ink.userData.isOutline = true;
    inner.add(mesh, ink);
    inner.position.set(-cx, -cy, 110);
    holder.add(inner);
    holder.position.set(c.cx + cx, -c.cy + cy, 0);
    holder.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -c.a);
    plainOf(mesh);
    applyLook(holder);
    const K = config.CREATURES.CHUNK;
    const piece = D && D.addExternal ? D.addExternal({ holder, boxes, rel: 0.9, mat: 'canvas', size: Math.hypot(...[cx, cy]) + 200, vel: [c.vx, -c.vy], spin: -c.w, life: Math.max(0.3, K.LIFE - c.t) }) : null;
    if (!piece) { holder.removeFromParent(); return null; }
    return { holder, piece, geo, born: c.t };
  }

  // the mantle's outline against the sea line (head frame -> world), for the foam ring and the wake
  function mantleCrossing(cr, sea3, k, dz) {
    const sil = rig.head.sil, f = cr.f < 0 ? -1 : 1, bx = cr.x, by = -cr.y;
    const edge = (arr) => {
      for (let i = 0; i < sil.n - 1; i++) {
        const y0 = by + k * arr[i * 2 + 1], y1 = by + k * arr[(i + 1) * 2 + 1];
        if ((y0 - sea3) * (y1 - sea3) <= 0 && y0 !== y1) { const u = (sea3 - y0) / (y1 - y0); return bx + f * k * (arr[i * 2] + (arr[(i + 1) * 2] - arr[i * 2]) * u); }
      }
      return null;
    };
    const a = edge(sil.L), b = edge(sil.R);
    if (a === null || b === null) return null;
    return { xl: Math.min(a, b), xr: Math.max(a, b), z: dz + 40, speed: rig.speedY };
  }

  // ---- the frame ----
  const _stepKey = (t, fps) => Math.floor(t * fps + 1e-6);
  const view = {
    root,
    stats,
    get rig() { return rig; }, // (dev / tests)
    // index.js gives us what it makes after us: { world, vfx, destruction, models, camera }
    link(o) { Object.assign(link, o); },
    // cr = state.creature | null, night = the world's darkness (0..1), dt / t = frame seconds / animation seconds, ctx = { state, sea (the game's y of the sea line, or null), tier }
    update(cr, night, dt = 0.016, t = 0, ctx = {}) {
      if (!cr || !cr.parts || !cr.parts.length) {
        root.visible = false;
        if (rig) { rig.foam.mesh.visible = false; rig.shadow.hide(); rig.markers.mesh.visible = false; rig.ropes.group.visible = false; clearChunks(); rig.water.reset(); }
        return;
      }
      const tier = ctx.tier || null, lowNow = !!(tier && tier.name === 'low');
      if (failedFor === cr) { root.visible = false; return; } // (building it threw once: not again every frame)
      if (!rig || rig.cr !== cr || rig.kind !== cr.kind || rig.low !== lowNow) { try { build(cr, tier); } catch (e) { failedFor = cr; rig = null; root.visible = false; logOnce('build', e); return; } }
      const R = rig, P = R.P, state = ctx.state || {}, sea = fin(ctx.sea) ? ctx.sea : null, sea3 = sea === null ? NaN : -sea, f = cr.f < 0 ? -1 : 1;
      root.visible = true;
      const phase3 = (cr.phase || 1) >= 3, dying = cr.mode === 'dying';
      const dz = cr.mouthWin && cr.mode === 'idle' ? -(rig.head.mantle.R * rig.head.mantle.sz + hullHalf() + 120) : 0; // (the beak gapes under her bomb bay: all of it is behind her hull, as in 2D)
      // the light on it
      R.uniforms.uSheenDir.value.copy(link.world && link.world.sunDir ? link.world.sunDir : _sun).add(_front).normalize();
      R.uniforms.uSheen.value = night > 0.6 ? 0.35 : 1;
      R.uniformsT.uSheenDir.value.copy(R.uniforms.uSheenDir.value); R.uniformsT.uSheen.value = R.uniforms.uSheen.value;
      R.fxU.uLevel.value = 1 - 0.7 * clamp(night, 0, 1);
      // ---- the head: placed by the sim's body position; breathing is the sim's own held-and-snapped scale ----
      const k = 1 + config.CREATURES.BREATH.AMOUNT * (cr.puff || 0);
      R.hg.position.set(cr.x, -cr.y, dz);
      R.hg.scale.set(f * k, k, k);
      R.hg.rotation.z = phase3 || dying ? -f * 0.06 : 0; // (slumped a little toward the ship, in phase 3)
      const mantleP = cr.parts.find((p) => p.kind === 'mantle'), mouthP = cr.parts.find((p) => p.kind === 'mouth'), heartP = cr.parts.find((p) => p.kind === 'heart'), eyeParts = cr.parts.filter((p) => p.kind === 'eye');
      const tintOf = (p, eye) => {
        if (!p) return [1, 1, 1];
        if (p.hit > 0) return FLASH;
        if (eye) return [1, 1, 1];
        let a = !p.lit ? DIM : night > 0.35 ? LIT : [1, 1, 1];
        if (phase3 || dying) a = [a[0] * TIRED[0], a[1] * TIRED[1], a[2] * TIRED[2]];
        if (dying) { const d = clamp((cr.sinkT || 0) / 4, 0, 1); a = [a[0] * (1 - 0.3 * d), a[1] * (1 - 0.25 * d), a[2] * (1 - 0.1 * d)]; }
        return a;
      };
      const tm = tintOf(mantleP), tmo = tintOf(mouthP);
      R.tint.set(R.ranges.mantle, tm[0], tm[1], tm[2]);
      R.tint.set(R.ranges.mouth, tmo[0], tmo[1], tmo[2]);
      const G = P.EYE_GLOW;
      eyeParts.slice(0, 2).forEach((ep, i) => {
        const te = tintOf(ep, true), flash = ep.hit > 0 ? te : [1, 1, 1];
        R.tint.set(R.ranges[i ? 'eyeB' : 'eyeA'], flash[0], flash[1], flash[2]);
        let g = ep.blindT > 0 ? G.blind : ep.lit && night > 0.3 ? G.lit : G.base;
        if (phase3) g *= G.tired / G.base;
        if (dying) g *= 1 - clamp((cr.sinkT || 0) / 3, 0, 1);
        R.glow[i] = g;
      });
      // the beak and the lids and the heart: stepped (a new pose only when the quantised value changes)
      const open = mouthP ? Math.round(clamp(mouthP.openAmt || 0, 0, 1) * 6) / 6 : 0;
      if (R.head.dyn.upper) { R.head.dyn.upper.pose(-open * 0.95, 1); R.head.dyn.lower.pose(open * 0.5, 1); }
      R.glow[2] = P.THROAT_GLOW.shut + (P.THROAT_GLOW.open - P.THROAT_GLOW.shut) * open;
      eyeParts.slice(0, 2).forEach((ep, i) => {
        const lid = R.head.dyn['lid' + i];
        if (!lid) return;
        if (ep.blindT > 0) lid.pose(0.95, 1); // a blinded eye is shut
        else if (phase3 || dying) lid.pose(0.32, 1); // heavy lids
        else lid.pose(0, 0);
      });
      const hd = R.head.dyn.heart;
      if (hd) { if (heartP && !heartP.hidden && !heartP.dead) hd.pose(0, 1 + 0.1 * (_stepKey(t, 4) & 1)); else hd.pose(0, 0); }
      R.glow[3] = P.HEART_GLOW;
      R.uniforms.uGlow.value.set(R.glow[0], R.glow[1], R.glow[2], R.glow[3]);

      // ---- the limbs ----
      const hh = hullHalf(), tubes = R.tubes;
      R.limbs.forEach((p, li) => {
        const n = p.segs ? p.segs.length : 0;
        if (p.dead || p.hidden || !n) { tubes.update(li, null, 1, false, R.zbuf, [1, 1, 1]); return; }
        if (R.zbuf.length < n + 1) R.zbuf = new Float32Array(n + 8);
        jointZ(p, li, n, R.zbuf, dz, hh);
        const tl = tintOf(p);
        tubes.setTint(li, tl[0], tl[1], tl[2]);
        tubes.update(li, p.segs, p.side || 1, !!p.severed, R.zbuf, tl);
      });
      tubes.placeSuckers();

      // ---- the water: foam rings, shadow, wake, splashes ----
      R.foam.begin();
      let mantleX = null;
      if (sea !== null) {
        const dyv = R.lastY == null ? 0 : (cr.y - R.lastY) / Math.max(dt, 0.004);
        R.speedY += (dyv - R.speedY) * 0.5;
        mantleX = mantleCrossing(cr, sea3, k, dz);
        if (mantleX) { const rx = (mantleX.xr - mantleX.xl) / 2, cx = (mantleX.xr + mantleX.xl) / 2; R.foam.add(cx, mantleX.z, rx * 1.2 + 40, rx * 1.2 * 0.82 + 40, 0, 1, 0.13, 0.3); }
        R.limbs.forEach((p, li) => {
          const L = tubes.limbs[li];
          if (L.dead || L.nr < 2) return;
          let found = 0;
          for (let r = 0; r < L.nr - 1 && found < 3; r++) {
            const y0 = L.P[r * 3 + 1], y1 = L.P[(r + 1) * 3 + 1];
            if ((y0 - sea3) * (y1 - sea3) >= 0 || y0 === y1) continue;
            const u = (sea3 - y0) / (y1 - y0), x = L.P[r * 3] + (L.P[(r + 1) * 3] - L.P[r * 3]) * u, z = L.P[r * 3 + 2] + (L.P[(r + 1) * 3 + 2] - L.P[r * 3 + 2]) * u, rad = L.rad[r] + (L.rad[r + 1] - L.rad[r]) * u;
            const tx = L.T[r * 3] + L.T[(r + 1) * 3], ty = L.T[r * 3 + 1] + L.T[(r + 1) * 3 + 1], tz = L.T[r * 3 + 2] + L.T[(r + 1) * 3 + 2], tl = Math.hypot(tx, ty, tz) || 1;
            const along = rad / Math.max(0.35, Math.abs(ty / tl)), a = Math.min(along, rad * 2.8);
            R.foam.add(x, z, a * 1.45 + 14, rad * 1.45 + 14, Math.atan2(tz, tx), 1, li * 0.37);
            found++;
          }
        });
        // the breach shadow on the water (2D render.js drew it as an ellipse: the lunge's telegraph)
        const br = cr.breach, B = config.CREATURES.BREACH;
        if (br && (br.phase === 'dive' || br.phase === 'warn' || (br.phase === 'leap' && br.t < 0.6))) {
          const pr = br.phase === 'warn' ? Math.min(1, br.t / B.WARN) : br.phase === 'dive' ? 0 : 1, rx = (B.SHADOW_W * (0.5 + 0.5 * pr)) / 2;
          R.shadow.set(br.x, -sea, 30, rx, rx * P.SHADOW.DEPTH, pr, _stepKey(br.t, 8) / 8);
        } else R.shadow.hide();
      } else R.shadow.hide();
      R.foam.end(sea === null ? 0 : sea3);
      R.lastY = cr.y;
      try { R.water.update(cr, { sea: sea === null ? NaN : sea, dt, slow: state.slow || 1, mantle: mantleX, limbZ: (p, i) => { const li = R.limbs.indexOf(p), L = tubes.limbs[li]; return L && L.nr > tubes.Q * i + (tubes.Q >> 1) ? L.P[(tubes.Q * i + (tubes.Q >> 1)) * 3 + 2] : dz; } }); } catch (e) { logOnce('water', e); }

      // ---- the grips, the harpoon lines ----
      R.markers.begin();
      for (const g of cr.grips || []) {
        if (!g || g.mode === 'recoil') continue;
        R.markers.add(g.wx, -g.wy, 420, g.mode === 'hold' ? 1 : 0, g.total ? g.left / g.total : 0, g.job ? g.job.prog : 0, _stepKey(g.t || 0, 8) & 1);
      }
      R.markers.end();
      R.ropes.begin();
      for (const tw of cr.harpoons || []) {
        const fl = tw.fly > 0 ? clamp(tw.t / tw.fly, 0, 1) : 1, a = { x: tw.a.x, y: -tw.a.y, z: 40 };
        const li = R.limbs.indexOf(tw.part), L = li >= 0 ? tubes.limbs[li] : null;
        const bz = L && L.nr > tubes.Q * (tw.seg || 0) + (tubes.Q >> 1) ? L.P[(tubes.Q * (tw.seg || 0) + (tubes.Q >> 1)) * 3 + 2] : dz + 40;
        const b = { x: a.x + (tw.b.x - tw.a.x) * fl, y: a.y + (-tw.b.y - a.y) * fl, z: a.z + (bz - a.z) * fl };
        const d = Math.hypot(b.x - a.x, b.y - a.y), slack = Math.max(0, (tw.len || d) - d);
        R.ropes.add(a, b, 7, fl < 1 ? 0 : clamp(Math.sqrt(0.375 * d * slack), 0, 0.28 * d), tw.tension || 0);
      }
      R.ropes.end();

      // ---- severed chunks: bodies in the wreckage world ----
      const live = new Set();
      for (const c of cr.chunks || []) {
        live.add(c);
        let e = R.chunks.get(c);
        if (!e) { e = makeChunk(c) || { none: true }; R.chunks.set(c, e); }
        if (!e.none && link.destruction && link.destruction.pieces && !link.destruction.pieces.includes(e.piece)) { e.none = true; } // (the wreckage world dropped it: the cap)
      }
      for (const [c, e] of R.chunks) if (!live.has(c)) { if (!e.none && link.destruction && link.destruction.removeExternal) link.destruction.removeExternal(e.piece); R.chunks.delete(c); }
      stats.chunks = R.chunks.size;
    },
    clear() { dispose(); root.visible = false; },
    dispose,
  };
  const _sun = new THREE.Vector3(-0.5, 0.8, 0.7).normalize(), _front = new THREE.Vector3(0, 0, 1);
  let lastLog = '';
  const logOnce = (what, e) => { const m = what + ': ' + String(e && e.message ? e.message : e); if (m !== lastLog) { lastLog = m; console.warn('view3d creature', m); } };
  return view;
}
