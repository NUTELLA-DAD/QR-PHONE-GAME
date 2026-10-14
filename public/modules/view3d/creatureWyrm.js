// THE RIME WYRM IN 3D (3D.md section 40). creature.js is the generic creature view and KINDS.wyrm plugs this in; the models are wyrmModel.js (the 12 scaled segments, the collar, the underbelly, the horned head and its
// hinged jaws, and the ice), the hide wyrmPaint.js and the marks wyrmFx.js. What this file does is put the model where the SIMULATION says its parts are, every frame, and never move a thing by itself (no sine of time,
// no wobble: the ice sheds in steps, the jaw opens in sixths, the cracks spread in eighths, the breath's cone and the sun's bands step on the sim's 8 a second key):
//   - the BODY: 12 rigid segments, each a tapered tube of dark blue-grey scales with a pale belly, placed by the sim's segment (position, angle, a tilt in depth from the joint's depth to the next one's); the same matrix
//     places its ICE. A coiled segment takes its depth from the coil's own path (the Kraken's rule: it passes behind and in front of the hull, and the screen-door in creatureKit.js lets the crew show through it where
//     it is in front of the decks); a free one lies a little behind the ship's plane; everything below the cliff's top is pushed BEHIND the cliff's face (z -440 against the rock at -70), so the cliff itself hides a
//     burrowed Wyrm (the Titan does the same with its plain)
//   - the ICE (a translucent material, one mesh): per segment, the collar and the head the sim's `part.ice[i] / iceMax[i]` is a FULL thick faceted shell with crystals and icicles (at 72% or more), a CRACKED shell
//     (a bite out of it, crack lines: 40%), FROST PATCHES (a few slabs) or BARE. Every step down sheds ice shards (Rapier bodies) and a puff; a bare segment shows its scales and a cold glow in the seams (channel 3);
//     a shell that has just bounced a shell flashes and sparks (PING); ice that grows back pops in over three keys
//   - the COLLAR (a vertical capsule standing out of the cliff top, a pale belly strip on the side that faces the ship), the UNDERBELLY (phase 3: a pale plate with a pink heart on the collar's flank, a ring
//     round it for the boarders) and the HEAD (a crest, swept horns, glowing icy eyes, a wide maw whose upper and lower jaw part along the head's axis in sixths of `openAmt`; the open throat glows icy blue)
//   - the ERUPTION: cracks spread over the cliff in eighths during the 2 s telegraph (wyrmFx.js: the red ring, the fissures, the split at its top, ice chips flying), then the collar rises through the cliff top in
//     a spray of ice shards, dust and a ring; it burrows with dust
//   - the FROST BREATH: a ring glows at the throat (the lip seam glows icy through the shut jaws), then a stepped three-layer cone of frost along the sim's `breath.ang` with ice mist rolling down it, and the
//     rings and crosses on the guns it froze (the crust itself is the ship's weather view's)
//   - the SUN (phase 3): a god-ray column with slanted bands that step down it, dashed edges, glints and a warm pool; while the head is in it steam rises and the ice drips and falls
//   - the DEATH: a white flash and a ring, the ice shatters into shards, it darkens and collapses into the cliff (the sim sinks it 2600 px) in a cloud of ice dust
import { THREE, outlineMat, applyLook } from './style.js';
import { config } from '../../config.js';
import { Tinter, Mesher, creatureToon, makeUniforms } from './creatureKit.js';
import { paintWyrmHide, paintBlank } from './wyrmPaint.js';
import { buildWyrmBody as buildBody, buildWyrmPieces, M4, V, hash, rockGeo } from './wyrmModel.js';
import { createWyrmMarks, createCliffCracks } from './wyrmFx.js';
import { wyrmChipJobs } from '../host/creatureWyrm.js';
import { toWorldX, toWorldY } from '../host/pose.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const FLASH = [2.4, 2.2, 2.2], HIT = [1.6, 1.55, 1.5], ICE_FLASH = [1.7, 1.7, 1.7];
const Z_AX = V(0, 0, 1), Y_AX = V(0, 1, 0);
const NSEG = 12;

// ---- what creature.js asks the kind for --------------------------------------------------------------------------------------------------------------------------------------------------------
export const buildWyrmBody = (cr, P, o) => buildBody(cr, P, o);
export const wyrmSkins = (P) => { const s = paintWyrmHide(P); return { head: s.map, headGlow: s.glow, limb: paintBlank('#ffffff'), limbGlow: paintBlank('#000000') }; };
export const wyrmLimbs = (cr) => cr.parts.filter((p) => p.kind === 'tentacle'); // (the body is rigid pieces, not a tube: the view makes the tube set empty and hides it)
export const wyrmTubeOpts = () => ({ rows: [], maxSuckers: 1, stationsFor: () => false });

// ---- the extension: made by creature.js build() ------------------------------------------------------------------------------------------------------------------------------------------------------
export function extendWyrm(ctx) {
  const { cr, P, root, parent, link, head, uniforms, headMat, tubes, low, plainOf } = ctx;
  const W = config.CREATURES.WYRM, B = W.BODY, ZC = P.Z, I = P.ICE, OW = P.INK || 22, SEAM = P.SEAM_GLOW;
  const pieces = buildWyrmPieces(cr, P, { low, W });
  const bset = pieces.body.set, iset = pieces.ice.set, br = pieces.body.ranges, ir = pieces.ice.ranges;
  const bodyMesh = new THREE.Mesh(pieces.body.geometry, headMat), bodyInk = new THREE.Mesh(pieces.body.geometry, outlineMat);
  for (const m of [bodyMesh, bodyInk]) m.frustumCulled = false;
  bodyMesh.userData.toon = headMat;
  bodyInk.userData.isOutline = true;
  bodyMesh.name = 'wyrmBody';
  root.add(bodyMesh, bodyInk);
  tubes.mesh.visible = tubes.inkMesh.visible = tubes.suckers.visible = false; // (the body is rigid pieces: the generic tube set stays empty)
  headMat.emissive.set('#ffffff');
  headMat.emissiveIntensity = P.EMISSIVE;
  // the ice: its own translucent toon material (the same shader as the creature's: the screen-door where it passes in front of the crew, the glint), no ink
  const iceU = makeUniforms(0.93), iceMap = paintBlank('#ffffff'), iceMat = creatureToon(iceMap, iceU);
  iceMat.transparent = true; iceMat.opacity = I.ALPHA; iceMat.depthWrite = false;
  const iceMesh = new THREE.Mesh(pieces.ice.geometry, iceMat);
  iceMesh.frustumCulled = false;
  iceMesh.renderOrder = 6;
  iceMesh.userData.toon = iceMat;
  iceMesh.userData.plain = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: I.ALPHA, depthWrite: false });
  iceMesh.name = 'wyrmIce';
  root.add(iceMesh);
  const bt = new Tinter(pieces.body.geometry), it = new Tinter(pieces.ice.geometry);
  const marks = createWyrmMarks(parent, P), cracks = createCliffCracks(parent);

  const S = {
    key: -1, shown: false, open: 0, lv: {}, grow: {}, flash: new Map(), frozen: new Set(), loose: new Set(), mode: '', sub: '', crackStep: -1, died: false, dieSteps: 0, bellyOn: false, hidden: false, wasOpen: false,
    sunKey: -1, rs: 7, tilt: 0, gunsKey: 0,
  };
  const byId = (id) => cr.parts.find((p) => p.id === id);
  const Pt = () => (link.vfx && link.vfx.P) || null;
  const rnd = (a) => { S.rs = (Math.imul((S.rs || 7) + a * 977, 0x2c1b3c6d) + 0x7f4a7c15) | 0; return ((S.rs >>> 0) % 10000) / 10000; };
  const _p = V(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = V(1, 1, 1), _M = new THREE.Matrix4(), _N = new THREE.Matrix4(), _N2 = new THREE.Matrix4(), _T = new THREE.Matrix4();
  const mat = (x, y, z, ang, flip = 1, tilt = 0, sx = 1) => { // a piece's frame in the world: at the sim's point (x, y), turned by the sim's angle (y flips going to the 3D world), tilted in depth, mirrored in y so the light stays on top
    _q.setFromAxisAngle(Z_AX, -ang);
    if (tilt) { _q2.setFromAxisAngle(Y_AX, tilt); _q.multiply(_q2); }
    return _M.compose(_p.set(x, -y, z), _q, _s.set(sx, flip, 1));
  };

  // ---- depth: a free joint lies behind the ship's plane, everything below the cliff's top behind the cliff's face, a coiled one on the coil's own path ----
  const hullHalf = () => { let h = 0; if (link.models) for (const e of link.models.values()) h = Math.max(h, e.model && e.model.W ? e.model.W : 0); return h || 240; };
  function wrapZ(w, s) {
    const { pts, cum } = w, n = pts.length, total = cum[n - 1];
    if (s >= total) return pts[n - 1].z;
    let i = 1;
    while (i < n - 1 && cum[i] < s) i++;
    const u = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u;
  }
  const topOf = () => (cr.base && fin(cr.base.y) ? cr.base.y : cr.y);
  const hidK = (y) => smooth((topOf() - y - 300) / 1100); // 0 = at or under the cliff's top, 1 = well above it
  const zFree = (y) => lerp(ZC.HIDE, ZC.FREE, hidK(y));
  const ZB = new Float32Array(NSEG + 2);
  function jointZ(p, n) {
    const hh = hullHalf(), m = p.wrap ? Math.max(2, n - p.wrap.k) : n;
    let s = 0, sw = 0;
    for (let j = 0; j <= n; j++) {
      const sg = p.segs[Math.min(j, n - 1)], y = j < n ? sg.y : sg.y + Math.sin(sg.ang) * sg.len;
      if (p.wrap && j >= m) ZB[j] = (hh + 130) * wrapZ(p.wrap, sw);
      else ZB[j] = lerp(ZC.COLLAR, zFree(y), smooth(s / 1600));
      if (j < n) { s += p.segs[j].len; if (p.wrap && j >= m) sw += p.segs[j].len; }
    }
    if (p.wrap) for (let j = m; j < n; j++) if (p.segs[j].behind && ZB[j] > 0 && ZB[j + 1] > 0) ZB[j] = ZB[j + 1] = -4;
  }
  const segMid = (s, u = 0.5) => ({ x: s.x + Math.cos(s.ang) * s.len * u, y: s.y + Math.sin(s.ang) * s.len * u });

  // ---- loose ice: a shard that becomes a Rapier body (destruction.addExternal) and falls ----
  function spawnShard(x, y, z, size, vx, vy, spin, life = 3.6, seed = 1) {
    const D = link.destruction;
    if (!D || !D.addExternal || S.loose.size >= 34) return null;
    const m = new Mesher();
    m.add(rockGeo(size, size * 0.75, size * 0.85, { detail: 0, jitter: 0.3, seed }), null, { color: [P.shard, P.ice, P.iceLt, P.iceDk][seed & 3], ow: OW * 0.4 });
    const geo = m.build(), holder = new THREE.Group(), mesh = new THREE.Mesh(geo, headMat), ink = new THREE.Mesh(geo, outlineMat);
    mesh.frustumCulled = ink.frustumCulled = false;
    mesh.userData.toon = headMat; ink.userData.isOutline = true;
    holder.add(mesh, ink);
    holder.position.set(x, y, z);
    holder.quaternion.setFromAxisAngle(Z_AX, seed);
    plainOf(mesh);
    applyLook(holder);
    const piece = D.addExternal({ holder, boxes: [{ cx: 0, cy: 0, cz: 0, hx: size * 0.72, hy: size * 0.6, hz: size * 0.65 }], rel: 1.8, mat: 'stone', size: size * 2, vel: [vx, vy], spin, life });
    if (!piece) { geo.dispose(); return null; }
    S.loose.add(piece);
    return piece;
  }
  const snow = (Ptc, x, y, z, n, o = {}) => Ptc && Ptc.burst('dust', x, y, z, n, { dir: Math.PI / 2, spread: 1.5, speed: [100, 520], up: [30, 220], size: [90, 200], size1: 2.2, life: [0.8, 1.5], color: '#dcecf7', alpha: 0.6, area: 300, noRate: true, ...o });
  const glint = (Ptc, x, y, z, n, o = {}) => Ptc && Ptc.burst('spark', x, y, z, n, { speed: [250, 900], size: [6, 10], life: [0.3, 0.7], color: '#e4f6ff', hdr: 2, noRate: true, ...o });

  // ---- the ice's steps ----
  const lvOf = (p, i) => { if (!p || !p.ice || !p.iceMax) return 0; const v = p.ice[i], m = p.iceMax[i] || 1; if (!(v > 0)) return 0; const fr = v / m; return fr >= I.FULL ? 3 : fr >= I.CRACKED ? 2 : 1; };
  function shed(id, from, to, p, i) { // a step down: ice shards and a puff of frost where the segment is
    const Ptc = Pt(), sg = p.segs[i];
    if (!sg || !fin(sg.x)) return;
    const m = segMid(sg), z = (id === 'c' ? ZC.COLLAR : ZC.FREE) + sg.r * 0.6, bare = to === 0, n = Math.min(I.SHARDS || 3, from - to + (bare ? 1 : 0)), r = Math.max(60, sg.r);
    for (let c = 0; c < n; c++) spawnShard(m.x + (c - 1) * r * 0.5, -m.y + r * (0.2 + 0.2 * c), z, r * (0.22 + 0.1 * c), (c - 1) * 240 + (rnd(c) - 0.5) * 200, 160 + 150 * c, (c - 1) * 4, 3.4, 200 + c + i * 3);
    snow(Ptc, m.x, -m.y + r * 0.4, z, bare ? 9 : 4, { area: r * 0.9 });
    glint(Ptc, m.x, -m.y + r * 0.5, z + 60, bare ? 10 : 4);
    if (bare && Ptc) { Ptc.flash(m.x, -m.y, z + 80, r * 2.6, '#ffffff', { hdr: 1.8, alpha: 0.8, life: 0.16 }); Ptc.ring(m.x, -m.y, z + 80, r * 3.4, '#cfeeff', 0.4); }
  }
  function ping(p) { // a shell bounced: sparks where the segment was just hit (iceAge is reset by a hit)
    const Ptc = Pt();
    if (!Ptc || !p.iceAge) return;
    let bi = -1, ba = 0.2;
    for (let i = 0; i < p.iceAge.length; i++) if (p.iceAge[i] < ba && p.ice[i] > 0) { ba = p.iceAge[i]; bi = i; }
    const sg = p.segs[Math.max(0, bi)];
    if (!sg || bi < 0) return;
    const m = segMid(sg), z = (p.kind === 'mantle' ? ZC.COLLAR : ZC.FREE) + sg.r;
    glint(Ptc, m.x, -m.y + sg.r * 0.7, z, 7, { speed: [300, 950], size: [7, 11], hdr: 2.4 });
    Ptc.flash(m.x, -m.y + sg.r * 0.5, z + 40, Math.max(240, sg.r * 1.3), '#ffffff', { hdr: 2.2, alpha: 0.85, life: 0.12 });
  }

  const ext = {
    pieces: { tris: pieces.tris }, S, marks, cracks, bset, iset, bodyMesh, iceMesh, bt, it,
    ownsLimbs: true,
    zBody: () => ZC.HEAD + 260,
    hide() { marks.hide(); cracks.hide(); },
    reset() { marks.hide(); cracks.hide(); },
    update(Fr) {
      const { R, dt, t, state, dying } = Fr, tintOf = (p) => (p && p.hit > 0 ? HIT : Fr.tintOf(p)), f = cr.f < 0 ? -1 : 1, wy = cr.wyrm || {}, key = Math.floor(t * 8 + 1e-6), kNew = key !== S.key, Ptc = Pt();
      S.key = key;
      void dt;
      const limb = byId('wyrm'), collar = byId('collar'), headP = byId('head'), mouthP = byId('mouth'), belly = byId('belly'), sk = dying ? clamp(cr.sinkT || 0, 0, 99) : 0;
      const shown = !!wy.shown && !!limb && limb.segs.length === NSEG && !limb.dead;
      const base = cr.base || { x: cr.x, y: cr.y }, top3 = -base.y;
      if (kNew && S.loose.size) { const D = link.destruction; if (D && D.pieces) for (const p of S.loose) if (!D.pieces.includes(p)) S.loose.delete(p); } // (the shards that have lived their life are forgotten)
      const phase3 = (cr.phase || 1) >= 3;
      // ---- the cycle: what the sim says it is doing now ----
      const mode = wy.mode || '', sub = wy.sub || '';
      if (kNew) {
        if (mode === 'crack' && wy.crack && Ptc) { // the cliff cracks: chips and dust fly off its top, more of them as the cracks spread
          const c = wy.crack, u = clamp(c.t / Math.max(0.1, c.T), 0, 1);
          if (key & 1) { snow(Ptc, c.x + (rnd(key) - 0.5) * c.w * 0.4, -c.y + 40, -60, 1 + Math.round(u * 3), { speed: [60, 300], up: [60, 260], area: 500, size: [80, 170] }); glint(Ptc, c.x + (rnd(key + 3) - 0.5) * c.w * 0.4, -c.y + 60, -40, 2 + Math.round(u * 4), { speed: [150, 600], up: [200, 500], dir: Math.PI / 2, spread: 1.0 }); }
        }
        if (mode === 'out' && sub === 'rise' && Ptc) { snow(Ptc, cr.x + (rnd(key) - 0.5) * 900, top3 + 80, -30, 5, { area: 500, size: [110, 240] }); glint(Ptc, cr.x + (rnd(key + 1) - 0.5) * 900, top3 + 120, 0, 5, { dir: Math.PI / 2, spread: 1.2 }); }
        if (sub === 'retreat' && Ptc) snow(Ptc, cr.x + (rnd(key) - 0.5) * 900, top3 + 100, -30, 4, { area: 500 });
      }
      if (mode === 'out' && S.mode === 'crack') { // the eruption: the collar bursts through in a spray of ice shards
        const wx = cr.x, wy3 = top3;
        for (let c = 0; c < 9; c++) spawnShard(wx + (rnd(c) - 0.5) * 1100, wy3 + 200 + rnd(c + 9) * 600, ZC.COLLAR + 380 + c * 12, 90 + rnd(c + 2) * 150, (rnd(c + 4) - 0.5) * 1400, 700 + rnd(c + 6) * 900, (rnd(c + 1) - 0.5) * 8, 4, 300 + c);
        if (Ptc) {
          Ptc.flash(wx, wy3 + 700, -20, 3800, '#ffffff', { hdr: 2.2, alpha: 0.8, life: 0.28 });
          Ptc.ring(wx, wy3 + 100, -20, 4200, '#dff3fe', 0.7);
          snow(Ptc, wx, wy3 + 200, -30, 26, { speed: [200, 1100], up: [100, 500], size: [200, 420], area: 1100, life: [1.2, 2.4] });
          glint(Ptc, wx, wy3 + 600, 20, 36, { speed: [400, 1500], dir: Math.PI / 2, spread: 1.0, size: [8, 14] });
        }
      }
      S.mode = mode; S.sub = sub;
      // ---- the cracks on the cliff (the telegraph) ----
      if (mode === 'crack' && wy.crack && !dying) {
        const c = wy.crack, step = Math.min(8, Math.floor((c.t / Math.max(0.1, c.T)) * 8));
        cracks.show(c, -45, step);
      } else if (cracks.visible) cracks.hide();
      marks.begin(key);
      if (mode === 'crack' && wy.crack && !dying) marks.crackRing(wy.crack.x, -wy.crack.y + 40, 420, 700 + 80 * (key % 2), 180);

      if (!shown) { // buried: nothing to see but the cracks and a breath of frost
        if (!S.hidden) {
          S.hidden = true;
          for (const nme of Object.keys(bset.pieces)) bset.place(nme, null);
          for (const nme of Object.keys(iset.pieces)) iset.place(nme, null);
        }
        S.lv = {}; S.grow = {}; S.shown = false;
        marks.end();
        return;
      }
      const first = !S.shown;
      S.shown = true; S.hidden = false;
      if (first) { S.lv = {}; S.grow = {}; S.frozen.clear(); S.died = false; S.dieSteps = 0; S.bellyOn = false; }

      // ---- the body: a matrix for each segment, the depth from the coil's path or the cliff ----
      const n = limb.segs.length;
      jointZ(limb, n);
      const tl = tintOf(limb), tc = tintOf(collar), th = tintOf(headP), tm = tintOf(mouthP), tb = tintOf(belly);
      const iceFlash = (p) => (p && p.iceFlash > 0 ? ICE_FLASH : [1, 1, 1]);
      for (let i = 0; i < n; i++) {
        const sg = limb.segs[i], lv = dying && sk > 0.2 ? 0 : lvOf(limb, i), id = 'i' + i, was = S.lv[id];
        if (was !== undefined && kNew && !dying) {
          if (lv < was) shed(id, was, lv, limb, i);
          else if (lv > was) S.grow[id] = 3;
        }
        S.lv[id] = lv;
        const z0 = ZB[i], z1 = ZB[i + 1], flip = Math.cos(sg.ang) < 0 ? -1 : 1, tilt = -Math.atan2(z1 - z0, Math.max(1, sg.len));
        mat(sg.x, sg.y, z0, sg.ang, flip, tilt);
        bset.place('b' + i, _M);
        bset.place('g' + i, lv === 0 && !dying ? _M : null);
        bt.set(br['b' + i], tl[0], tl[1], tl[2]); bt.set(br['g' + i], tl[0], tl[1], tl[2]);
        const gr = S.grow[id] > 0 ? 1 - 0.07 * S.grow[id] : 1;
        _N.copy(_M);
        if (gr < 1) _N.multiply(_T.makeScale(1, gr, gr));
        for (const [v, nm] of [[3, 'F'], [2, 'C'], [1, 'P']]) { iset.place('i' + i + nm, lv === v ? _N : null); const f2 = iceFlash(limb); it.set(ir['i' + i + nm], f2[0], f2[1], f2[2]); }
      }
      if (kNew) for (const id of Object.keys(S.grow)) if (S.grow[id] > 0) S.grow[id]--;
      // the collar and the head's ice
      const placeIce = (id, p, name) => {
        const lv = dying && sk > 0.2 ? 0 : lvOf(p, 0), was = S.lv[id];
        if (was !== undefined && kNew && !dying) { if (lv < was) shed(id, was, lv, p, 0); else if (lv > was) S.grow[id] = 3; }
        S.lv[id] = lv;
        const gr = S.grow[id] > 0 ? 1 - 0.07 * S.grow[id] : 1;
        _N.copy(_M);
        if (gr < 1) _N.multiply(_T.makeScale(1, gr, gr));
        const f2 = iceFlash(p);
        for (const [v, nm] of [[3, 'F'], [2, 'C'], [1, 'P']]) { iset.place(name + nm, lv === v ? _N : null); it.set(ir[name + nm], f2[0], f2[1], f2[2]); }
        return lv;
      };
      if (collar && !collar.dead && collar.segs[0]) {
        const cs = collar.segs[0];
        mat(cs.x, cs.y, ZC.COLLAR, 0, 1, 0, f);
        bset.place('collar', _M); bset.place('cg', lvOf(collar, 0) === 0 && !dying ? _M : null);
        bt.set(br.collar, tc[0], tc[1], tc[2]); bt.set(br.cg, tc[0], tc[1], tc[2]);
        placeIce('c', collar, 'c');
        if (belly && !belly.dead && !belly.hidden) { // the underbelly: a pale plate on the collar's flank, tipped toward the viewer
          const A = B.BELLY.AT, lx = A[0], ly = -(A[1] - B.COLLAR.AT[1]), rz = B.COLLAR.R * 0.73, zc = rz * Math.sqrt(Math.max(0.05, 1 - Math.pow(lx / B.COLLAR.R, 2))) + 40;
          _N.copy(_M).multiply(_T.makeTranslation(lx, ly, zc)).multiply(_T.makeRotationY(0.55));
          bset.place('belly', _N);
          bt.set(br.belly, tb[0], tb[1], tb[2]);
          if (!S.bellyOn) { S.bellyOn = true; if (Ptc && !first) { snow(Ptc, cr.x + f * lx, -cr.y + ly, ZC.COLLAR + zc, 14, { area: 400 }); glint(Ptc, cr.x + f * lx, -cr.y + ly, ZC.COLLAR + zc + 60, 18); for (let c = 0; c < 4; c++) spawnShard(cr.x + f * lx + (c - 1.5) * 120, -cr.y + ly + 80, ZC.COLLAR + zc + 40, 90 + c * 20, f * (120 + c * 140), 200 + c * 100, c - 1.5, 3.4, 400 + c); } }
          marks.chipRing(cr.x + f * lx, -cr.y + ly, 420, B.BELLY.R * 1.25, belly.job ? belly.job.prog : 0);
        } else { bset.place('belly', null); S.bellyOn = false; }
      } else { for (const nme of ['collar', 'cg', 'belly']) bset.place(nme, null); for (const nme of ['cF', 'cC', 'cP']) iset.place(nme, null); }
      // the head and the jaws (the maw is a hinged V: the upper jaw turns up, the lower down, by sixths of openAmt)
      const hs = headP && !headP.dead ? headP.segs[0] : null, ms = mouthP && !mouthP.dead ? mouthP.segs[0] : null;
      if (kNew) { const tg = dying ? 0.5 : mouthP ? clamp(mouthP.openAmt || 0, 0, 1) : 0, d = tg - S.open; S.open += Math.abs(d) < 0.17 ? d : Math.sign(d) * 0.34; S.open = Math.round(clamp(S.open, 0, 1) * 6) / 6; }
      const open = S.open, brth = wy.breath;
      if (hs) {
        const zh = lerp(ZC.HIDE, ZC.HEAD, hidK(hs.y)), flip = Math.cos(hs.ang) < 0 ? -1 : 1;
        mat(hs.x, hs.y, zh, hs.ang, flip);
        bset.place('skull', _M);
        bt.set(br.skull, th[0], th[1], th[2]);
        placeIce('h', headP, 'h');
      } else { bset.place('skull', null); for (const nme of ['hF', 'hC', 'hP']) iset.place(nme, null); }
      if (ms && hs) {
        const zh = lerp(ZC.HIDE, ZC.HEAD, hidK(ms.y)), flip = Math.cos(ms.ang) < 0 ? -1 : 1, thA = 0.04 + 0.76 * open, shut = open < 0.1;
        mat(ms.x, ms.y, zh, ms.ang, flip);
        _N2.copy(_M); // (the mouth's frame: the hinge)
        bset.place('jawU', _N.copy(_N2).multiply(_T.makeRotationZ(thA)));
        bset.place('jawL', _N.copy(_N2).multiply(_T.makeRotationZ(-thA)));
        bset.place('throat', shut ? null : _N.copy(_N2).multiply(_T.makeScale(1, Math.max(0.2, Math.sin(thA) / 0.717), 1)));
        bset.place('lip', shut ? _N2 : null);
        iset.place('lip', shut && !mouthP.open ? _N2 : null);
        for (const nme of ['jawU', 'jawL', 'throat', 'lip']) bt.set(br[nme], tm[0], tm[1], tm[2]);
        it.set(ir.lip, 1, 1, 1);
      } else { for (const nme of ['jawU', 'jawL', 'throat', 'lip']) bset.place(nme, null); iset.place('lip', null); }
      // ---- the glow channels: the icy eyes (1), the throat (2), the seams of a bare hide (3), the heart (4) ----
      const G = P.EYE_GLOW, TG = P.THROAT_GLOW;
      let eye = G.base * (brth ? 1.35 : 1) * (phase3 ? G.tired / G.base * 1.2 : 1);
      if (dying) eye *= 1 - clamp(sk / 3, 0, 1);
      let throat = TG.shut + (TG.open - TG.shut) * clamp(open, 0, 1);
      if (brth && brth.sub === 'wind') throat = Math.max(throat, lerp(TG.shut, TG.wind, Math.floor(clamp(brth.t / W.BREATH.WIND, 0, 1) * 5) / 5)); // (it rises in five held steps through the wind-up)
      else if (brth && brth.sub === 'blow') throat = Math.max(throat, TG.wind);
      uniforms.uGlow.value.set(eye, throat, SEAM * (dying ? Math.max(0, 1 - sk / 3) : 1), P.HEART_GLOW[key & 1]);
      iceU.uSheenDir.value.copy(uniforms.uSheenDir.value);
      iceU.uSheen.value = Math.max(uniforms.uSheen.value, 0.8);
      // ---- the pings: a shell that just bounced one flashes and sparks ----
      for (const p of [limb, collar, headP]) {
        if (!p) continue;
        const was = S.flash.get(p) || 0;
        if (p.iceFlash > 0 && !(was > 0)) ping(p);
        S.flash.set(p, p.iceFlash || 0);
      }
      // ---- the marks: rings on the ice a hammer can reach, the frozen guns, the throat, the cone of frost, the funnel, the sun ----
      const ms0 = state.ships && state.ships[0];
      if (!dying && cr.mode === 'idle' && ms0) {
        try {
          for (const j of wyrmChipJobs(state, ms0)) {
            const p = j.obj.part, sg = p && p.segs[j.obj.seg];
            if (!sg) continue;
            const m = segMid(sg);
            marks.chipRing(m.x, -m.y, 420, sg.r * 1.25 + 40, j.obj.prog);
          }
        } catch { /* (the chip spots are a nicety) */ }
      }
      if (ms0) for (const c of state.icing || []) {
        const pl = c.wyrm && ms0.layout.platforms[c.d];
        if (!pl || !(c.lvl >= config.ENVIRONMENTS.frost.ICE.JAM_AT)) continue;
        const gx = toWorldX(ms0, c.x), gy = toWorldY(ms0, pl.y - 70);
        marks.gunRing(gx, -gy, 420, 130);
        if (!S.frozen.has(c)) { S.frozen.add(c); if (Ptc) { snow(Ptc, gx, -gy, 80, 8, { area: 120, size: [60, 130], speed: [60, 260] }); glint(Ptc, gx, -gy, 140, 14); Ptc.ring(gx, -gy, 140, 700, '#cfeeff', 0.4); } }
      }
      if (S.frozen.size > 8) for (const c of S.frozen) if (!(state.icing || []).includes(c)) S.frozen.delete(c);
      const mz = ms || null;
      if (brth && mz && !dying) {
        if (brth.sub === 'wind') {
          marks.throatRing(mz.x, -mz.y, 420, 260);
          if (kNew && Ptc) Ptc.burst('steam', mz.x + f * 120, -mz.y, ZC.HEAD + 200, 2, { dir: f > 0 ? 0 : Math.PI, spread: 0.5, speed: [80, 260], size: [80, 150], size1: 2, life: [0.7, 1.2], color: '#dff3fe', alpha: 0.6, noRate: true });
        } else if (fin(brth.x) && fin(brth.y) && fin(brth.ang)) {
          const ang3 = -brth.ang, len = brth.len || W.BREATH.LEN;
          marks.cone(brth.x, -brth.y, 400, ang3, len, 0.24, key);
          if (kNew && Ptc) for (let c = 0; c < 3; c++) { const d = len * (0.15 + 0.85 * rnd(key + c * 5)), a = ang3 + (rnd(key + c * 7) - 0.5) * 0.4; Ptc.burst('steam', brth.x + Math.cos(a) * d, -brth.y + Math.sin(a) * d, ZC.HEAD + 260, 1, { speed: [40, 160], up: [-20, 40], size: [100, 210], size1: 2.2, life: [0.7, 1.3], color: '#e6f4fd', alpha: 0.65, noRate: true }); glint(Ptc, brth.x + Math.cos(a) * d, -brth.y + Math.sin(a) * d, ZC.HEAD + 300, 2, { speed: [60, 260], size: [6, 9] }); }
        }
      }
      if (mz && ((cr.mouthWin || (wy.gape && sub === 'gape')) && !dying)) marks.funnel(mz.x, -mz.y, 380, W.MOUTH.FUNNEL_W, W.MOUTH.FUNNEL_UP, !!cr.mouthWin, Math.floor((cr.age || 0) * 4) % 2);
      if (S.open >= 0.5 && !S.wasOpen && Ptc && mz && !dying) { Ptc.ring(mz.x, -mz.y, ZC.HEAD + 200, 1500, '#dff3fe', 0.5); snow(Ptc, mz.x, -mz.y, ZC.HEAD + 260, 8, { dir: f > 0 ? 0 : Math.PI, spread: 0.7, speed: [250, 900], size: [90, 190], area: 200 }); }
      S.wasOpen = S.open >= 0.5;
      if (S.open >= 0.5 && kNew && Ptc && mz && !dying && (key & 1)) Ptc.burst('steam', mz.x, -mz.y, ZC.HEAD + 240, 1, { dir: Math.PI / 2, spread: 0.9, speed: [40, 140], up: [60, 140], size: [90, 160], size1: 2, life: [0.8, 1.3], color: '#dff3fe', alpha: 0.55, noRate: true });
      // the sun: a god-ray column; steam and drips where the head (and the ice it melts) stand in it
      if (wy.sun && fin(wy.sun.x) && !dying) {
        const map = state.course && state.course.map, floor3 = map && fin(map.floorY) ? -map.floorY : top3 - 3200;
        marks.sun(wy.sun.x, floor3, -(base.y - 9000), 380, wy.sun.w || W.SUN.W, !!wy.inSun, key);
        if (wy.inSun && kNew && Ptc && hs) {
          Ptc.burst('steam', hs.x + (rnd(key) - 0.5) * 500, -hs.y + 200, ZC.HEAD + 260, 3, { dir: Math.PI / 2, spread: 0.6, speed: [20, 100], up: [120, 260], size: [90, 170], size1: 2.2, life: [0.9, 1.5], color: '#ffffff', alpha: 0.6, noRate: true });
          for (let c = 0; c < 2; c++) { const i = Math.floor(rnd(key + c) * NSEG), sg = limb.segs[i]; if (sg && limb.ice[i] > 0 && Math.abs(sg.x - wy.sun.x) < (wy.sun.w || W.SUN.W) / 2) Ptc.burst('drop', sg.x, -sg.y - sg.r, ZC.FREE + 200, 3, { speed: [10, 60], color: '#d8f0ff', noRate: true }); }
        }
      }
      marks.end();
      // ---- the death: a flash, the ice shatters, it collapses into the cliff in a cloud of frost ----
      if (dying) {
        if (!S.died) {
          S.died = true;
          if (Ptc) { Ptc.flash(cr.x, top3 + 900, -20, 5200, '#ffffff', { hdr: 2.2, alpha: 0.85, life: 0.3 }); Ptc.ring(cr.x, top3 + 300, -20, 5600, '#dff3fe', 0.8); snow(Ptc, cr.x, top3 + 500, -30, 30, { speed: [200, 1200], up: [100, 600], size: [220, 460], area: 1400, life: [1.4, 2.6] }); }
          for (let i = 0; i < NSEG; i += 1) { const sg = limb.segs[i], m = segMid(sg); if (i % 2 === 0) spawnShard(m.x, -m.y, ZB[i] + sg.r * 0.5, sg.r * 0.3, (rnd(i) - 0.5) * 900, 200 + rnd(i + 3) * 500, (rnd(i + 5) - 0.5) * 6, 4.4, 600 + i); if (Ptc && i % 3 === 0) glint(Ptc, m.x, -m.y, ZB[i] + 120, 8); }
        }
        if (kNew && Ptc && sk < 7) { snow(Ptc, cr.x + (rnd(key) - 0.5) * 1800, top3 + 80, -30, 3, { area: 700, speed: [100, 500], size: [150, 300] }); if (S.dieSteps < 4 && sk >= 0.8 + S.dieSteps * 1.4) { S.dieSteps++; for (let c = 0; c < 3; c++) { const i = Math.floor(rnd(key + c * 3) * NSEG), sg = limb.segs[i], m = segMid(sg); spawnShard(m.x, -m.y, ZB[i] + sg.r * 0.5, sg.r * 0.3, (rnd(i) - 0.5) * 700, 100 + rnd(i + 2) * 300, (rnd(i + 4) - 0.5) * 5, 4, 700 + i + c); snow(Ptc, m.x, -m.y, ZB[i] + 100, 5, { area: 300 }); } } }
      }
    },
    makeChunk() { return null; }, // (the Wyrm's limb is never severed)
    dispose() {
      root.remove(bodyMesh, bodyInk, iceMesh);
      pieces.body.geometry.dispose(); pieces.ice.geometry.dispose();
      iceMat.dispose(); iceMap.dispose();
      marks.dispose(); cracks.dispose();
      const D = link.destruction;
      if (D && D.removeExternal) for (const p of S.loose) D.removeExternal(p);
      S.loose.clear();
    },
  };
  void head; void M4; void hash;
  return ext;
}
