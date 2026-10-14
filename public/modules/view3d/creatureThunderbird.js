// THE THUNDERBIRD IN 3D (3D.md section 26). creature.js is the generic creature view and KINDS.thunderbird plugs this in; the models are birdModel.js (the body, the head and the talons), the feathers birdWings.js,
// the paintings birdPaint.js and the storm birdFx.js. What this file does is put the model where the SIMULATION says its parts are, every frame, and never move a thing by itself (no sine of time, no wobble: the
// wing beats, the neck, the pitch, the open beak and the storm's charge are the simulation's stepped numbers; the lightning flickers between the 8 a second keys):
//   - the TORSO is the generic head record (a feathered lathe): placed at the sim's body position, mirrored by `cr.f`, pitched by `cr.rot`, at a depth that depends on what it is doing (flying: behind the ship's
//     plane so it never covers the crew; perched: at the gasbag's own depth; roosting: on the spire)
//   - the NECK, the TAIL's stalk, the WING ARMS and the two LEGS are tubes in a feather skin (creatureTube.js, 6 limbs in one mesh)
//   - the FEATHERS (birdWings.js, one mesh): for each sim wing a fan of long flight feathers swept toward the tip with two rows of coverts over them, gold-tipped, with a glowing storm-blue edge; the tail fan; the
//     hackle along the neck. A plucked wing keeps its stump (the feathers of the segments that are left) and the piece that came off becomes a Rapier body with its own feathers; damage thins the feathers out
//   - the HEAD, the hinged lower MANDIBLE and the two TALONS are rigid pieces (a RigidSet) moved by matrices; the beak opens by the attack it is making, in steps of a sixth
//   - the STORM (birdFx.js): arcs crackling along the wing tips, from the crest, round the glowing gizzard and down to the rod it has called a bolt for; loose feathers; the events
// The weak point language is the Kraken's and the Drake's: the GIZZARD (the sim's 'heart' part) is hidden under a breast shield of cream feathers until it glows; then the shield lifts in five steps and a gold ring,
// a faceted lightning stone and a star of rays show (throbbing in two steps), with arcs round it. The same record is what the dev page and the gate (tools/creature3d-check.mjs) read: rig.ext.
import { THREE, outlineMat } from './style.js';
import { config } from '../../config.js';
import { Tinter } from './creatureKit.js';
import { paintBirdAtlas, paintBirdLimb } from './birdPaint.js';
import { buildTorso, buildPieces, BEAK_PIVOT } from './birdModel.js';
import { createFeatherMesh } from './birdWings.js';
import { createBirdFx } from './birdFx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const hash = (a, b, c = 0) => { let h = Math.imul((a | 0) * 73856093 ^ (b | 0) * 19349663 ^ (c | 0) * 83492791, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ---- what creature.js asks the kind for ----------------------------------------------------------------------------------------------------------------------------------------------------
export const buildThunderbird = buildTorso;
export const birdSkins = (P) => { const a = paintBirdAtlas(P), l = paintBirdLimb(P); return { head: a.map, headGlow: a.glow, limb: l.map, limbGlow: l.glow }; };
// the tube set's limbs: the neck, the tail's stalk, the two legs and the two wing arms (the harpoon rope finds its limb by the sim's part)
export const LI = { neck: 0, tail: 1, talonN: 2, talonF: 3, wingN: 4, wingF: 5, N: 6 };
export const birdLimbs = (cr) => ['neck', 'tail', 'talonN', 'talonF', 'wingN', 'wingF'].map((id) => cr.parts.find((p) => p.id === id) || null);
export const birdTubeOpts = () => ({ rows: [], maxSuckers: 1, stationsFor: () => false });

const Z_FLY = -560; // the depth of the flying bird's body: behind the ship's plane, so it never covers the crew (its near wing reaches to about -60)
const FEATHER_STEP = 3.2; // the depth between neighbouring feathers
const LEN = [820, 1120, 1280, 1300, 1120, 860]; // the length of the flight feathers at each joint of a wing
const HEAD_K = 1.2; // the head is drawn a fifth bigger than the sim's, so it reads from the sofa
const WING_WID = 215; // how wide a flight feather is

// the sim's chain as thin tubes (re-used objects): the radius scaled
const scaled = (segs, k, out) => {
  for (let i = 0; i < segs.length; i++) { const s = segs[i], o = out[i] || (out[i] = { x: 0, y: 0, ang: 0, len: 0, r: 0, r1: 0 }); o.x = s.x; o.y = s.y; o.ang = s.ang; o.len = s.len; o.r = s.r * k; o.r1 = s.r1 * k; }
  out.length = segs.length;
  return out;
};
const jointsOf = (segs, out) => { // game coordinates (y down) of the chain's joints: n + 1 points
  const n = segs.length;
  for (let i = 0; i < n; i++) (out[i] || (out[i] = { x: 0, y: 0 })).x = segs[i].x, out[i].y = segs[i].y;
  const s = segs[n - 1];
  (out[n] || (out[n] = { x: 0, y: 0 })).x = s.x + Math.cos(s.ang) * s.len; out[n].y = s.y + Math.sin(s.ang) * s.len;
  out.length = n + 1;
  return out;
};
// which side of a wing the feathers hang on (the trailing side), with a little hysteresis (the Drake's rule: backward and down)
const sideOf = (J, n, f, st) => {
  const tx = J[n].x - J[0].x, ty = J[n].y - J[0].y, tl = Math.hypot(tx, ty) || 1, score = (ty / tl) * f + (tx / tl) * 0.55;
  if (!st) return score >= 0 ? 1 : -1;
  return score * st < -0.3 ? -st : st;
};

// ---- the feathers of one wing -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// fm = the feather mesh, s0 = its first slot, F = feathers per segment in a row, X = extra tip feathers, J = the joints (game coordinates), n = how many segments the wing has, st = the trailing side, zW = the depth
// of its lowest feather, tl = the tint, dmg = 0..1 (feathers thin out), torn = a stump. Fills `tips` (3D points: the ends of the long feathers, root to tip). Returns the number of slots it used.
export const wingSlots = (F, X) => F * 5 + X + F * 5 + F * 5;
export function layoutWing(fm, s0, F, X, J, n, st, f, zW, tl, dmg, torn, wid, tips) {
  const per = F * 5, c1 = s0 + per + X, c2 = c1 + per;
  tips.length = 0;
  const unit = (k) => { const dx = J[k + 1].x - J[k].x, dy = J[k + 1].y - J[k].y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const put = (slot, kind, k, u, ord, lenK, widK, phi, ft, tip, ragged) => {
    const T = unit(Math.min(k, n - 1)), px = -T[1] * st, py = T[0] * st, cs = Math.cos(phi), sn = Math.sin(phi);
    const dgx = px * cs + T[0] * sn, dgy = py * cs + T[1] * sn;
    const bx = J[k].x + (J[Math.min(n, k + 1)].x - J[k].x) * u, by = J[k].y + (J[Math.min(n, k + 1)].y - J[k].y) * u;
    const lo = LEN[k] + (LEN[k + 1] - LEN[k]) * u;
    let len = lo * lenK;
    if (ragged) len *= 0.45 + 0.55 * hash(slot, 3, 9);
    if (dmg > 0.3) len *= 1 - 0.4 * dmg * hash(slot, 5, 1);
    if (dmg > 0.05 && hash(slot, 7, 5) < dmg * 0.6) { fm.hide(slot); return; }
    fm.look(slot, kind, tl, tip);
    fm.put(slot, { x: bx, y: -by, z: zW + ord * FEATHER_STEP, dx: dgx, dy: -dgy, len, wid: wid * widK, cx: T[0], cy: -T[1], curve: 0.07, ft });
    if (tip && !ragged && kind === 'flight') { const k2 = len; tips.push({ x: bx + dgx * k2, y: -(by + dgy * k2), z: zW + ord * FEATHER_STEP }); }
  };
  for (let k = 0; k < 5; k++) {
    for (let i = 0; i < F; i++) {
      const u = (i + 0.5) / F, s = (k + u) / 5, phi = 0.12 + 1.0 * Math.pow(s, 1.4), ft = ((k * 7 + i * 3) % 5 - 2) / 2, o = per - 1 - (k * F + i);
      if (k >= n) { fm.hide(s0 + k * F + i); fm.hide(c1 + k * F + i); fm.hide(c2 + k * F + i); continue; }
      const rag = torn && k === n - 1;
      put(s0 + k * F + i, 'flight', k, u, X + o, 1, 1, phi, ft, true, rag);
      put(c1 + k * F + i, 'cover1', k, i / F, X + per + o, 0.5, 1.1, phi * 0.95, -ft, false, rag);
      put(c2 + k * F + i, 'cover2', k, u, X + 2 * per + o, 0.26, 0.95, phi * 0.9, ft, false, rag);
    }
  }
  // the tip: a few long feathers that point out past the end of the wing
  for (let q = 0; q < X; q++) {
    const slot = s0 + per + q;
    if (torn || n < 5) { fm.hide(slot); continue; }
    const k = 4, T = unit(k), phi = 0.95 + 0.28 * q, px = -T[1] * st, py = T[0] * st, dgx = px * Math.cos(phi) + T[0] * Math.sin(phi), dgy = py * Math.cos(phi) + T[1] * Math.sin(phi);
    const len = 940 - q * 110, tipP = J[n];
    if (dmg > 0.05 && hash(slot, 7, 5) < dmg * 0.6) { fm.hide(slot); continue; }
    fm.look(slot, 'flight', tl, true);
    fm.put(slot, { x: tipP.x, y: -tipP.y, z: zW + q * FEATHER_STEP, dx: dgx, dy: -dgy, len, wid: wid * 0.95, cx: T[0], cy: -T[1], curve: 0.07, ft: q % 2 ? 0.5 : -0.5 });
    tips.push({ x: tipP.x + dgx * len, y: -(tipP.y + dgy * len), z: zW + q * FEATHER_STEP });
  }
  return wingSlots(F, X);
}

// ---- the extension: made by creature.js build() ---------------------------------------------------------------------------------------------------------------------------------------------------
export function extendThunderbird(ctx) {
  const { cr, P, root, parent, link, head, uniforms, uniformsT, headMat, headMap, tubes, tint: torsoTint, low } = ctx;
  const pieces = buildPieces(cr, P, { low });
  const set = pieces.set, rs = pieces.ranges;
  const pieceMesh = new THREE.Mesh(pieces.geometry, headMat), pieceInk = new THREE.Mesh(pieces.geometry, outlineMat);
  for (const m of [pieceMesh, pieceInk]) m.frustumCulled = false;
  pieceMesh.userData.toon = headMat;
  pieceInk.userData.isOutline = true;
  root.add(pieceMesh, pieceInk);
  const ptint = new Tinter(pieces.geometry);
  // the feather slots: two wings, the tail (a fan and its coverts), the hackle
  const dens = low ? P.FEATHERS.low : P.FEATHERS.high, F = Math.max(3, Math.round(5 * dens)), X = low ? 2 : 3, M = low ? 7 : 11, NH = low ? 6 : 10;
  const perWing = wingSlots(F, X), tail0 = 2 * perWing, hack0 = tail0 + M + (M - 1), slots = hack0 + NH;
  const fm = createFeatherMesh({ map: headMap, uniforms, P, slots, ow: 9 });
  root.add(fm.mesh);
  // the bird flies BEHIND the ship's plane, in the shadow the ship's bag throws backward: it would wear a big black cut-out of her bag, so it receives no shadow (its feathers and its limbs)
  fm.mesh.userData.shadowReceiver = false; fm.mesh.receiveShadow = false;
  tubes.mesh.userData.shadowReceiver = false; tubes.mesh.receiveShadow = false;
  let fx = null;
  try { fx = createBirdFx({ parent, P, low, getP: () => (link.vfx && link.vfx.P) || null }); } catch (e) { console.warn('bird fx', e); }

  const S = {
    zBody: null, bodyM: new THREE.Matrix4(), sg: [0, 0], joints: [[], []], arm: [[], []], tips: [[], []], tailTips: [], key: -1, open: 0, openK: 0, chg: 0, heat: -1, perchZ: 0, feetSet: false,
    thinN: [], thinT: [], thinL: [[], []], thinNeck: [], flightTint: '', tail: { st: 0 },
  };
  const Mh = new THREE.Matrix4(), Mj = new THREE.Matrix4(), Mt = new THREE.Matrix4(), tmp = V();
  const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const Sx = (sx, sy, sz) => new THREE.Matrix4().makeScale(sx, sy, sz);
  const byId = (id) => cr.parts.find((p) => p.id === id);
  const BD = () => config.CREATURES.THUNDERBIRD;

  // the first ship model's bag (for the perch): its node's world matrix
  function bagOf(idx) {
    const e = link.models && link.models.values().next().value, m = e && e.model;
    if (!m || !m.dyn || !m.layout || !m.layout.gasbags) return null;
    const bn = (m.dyn.bags || []).find((q) => q.i === idx);
    return bn ? { node: bn.node } : null;
  }
  // THE DENT: its weight sits the bag down a little (the Drake's small hook: the envelope's node is scaled after the ship model set it this frame, and put back by the model next frame)
  function sagBag(node, k) {
    const u = node.userData.birdSag;
    if (u && node.scale.x === u.x && node.scale.y === u.y) node.scale.set(u.bx, u.by, node.scale.z);
    if (k <= 0) { node.userData.birdSag = null; return; }
    const bx = node.scale.x, by = node.scale.y;
    node.scale.set(bx * (1 + 0.012 * k), by * (1 - 0.05 * k), node.scale.z);
    node.userData.birdSag = { x: node.scale.x, y: node.scale.y, bx, by };
  }
  // a point of the main ship's layout in the world (the charge of a bolt it has called is over a rod)
  function shipPoint(x, y, z) {
    const e = link.models && link.models.values().next().value, m = e && e.model;
    if (!m || !m.content || !m.X) return null;
    const v = V(m.X(x), m.Y(y), z);
    m.content.localToWorld(v);
    return fin(v.x) && fin(v.y) ? v : null;
  }

  // how charged the storm in it is (0..1, in quarters): what it is doing says how much lightning it carries
  function chargeOf(state, dying) {
    const C = P.CHARGE, bd = cr.bird || {}, a = bd.act, B = BD();
    if (dying) return 0;
    let c = C.base;
    if (bd.mode === 'perch') c = C.perch; else if (bd.mode === 'roost') c = C.rest;
    if (a) {
      if (a.kind === 'gust') c = a.sub === 'rear' ? C.gust : a.sub === 'beat' ? C.beat : C.base;
      else if (a.kind === 'pass') c = a.sub === 'wind' ? C.wind : a.sub === 'lock' ? C.lock : a.sub === 'dive' ? C.dive : C.base;
      else if (a.kind === 'dive') {
        const J = state.stormJob, ch = J && J.charge && J.charge.bird ? J.charge : null;
        if (a.sub === 'call') c = C.call + (1 - C.call) * clamp(a.t / B.DIVE.CALL, 0, 1) * 0.6;
        else if (a.sub === 'bolts') c = ch ? 0.7 + 0.3 * (1 - clamp(ch.t / Math.max(0.1, ch.max), 0, 1)) : 0.7;
      } else if (a.kind === 'swallow') {
        if (a.sub === 'call') c = C.call + (C.swallow - C.call) * clamp(a.t / B.SWALLOW.CALL, 0, 1);
        else if (a.sub === 'glow') c = C.swallow * (0.6 + 0.4 * clamp(bd.glow / Math.max(0.1, bd.glowMax || 1), 0, 1));
      }
    }
    if (bd.glow > 0 && c < C.swallow * 0.6) c = C.swallow * 0.6;
    if (bd.dazed > 0) c = Math.min(c, C.dazed);
    return Math.round(clamp(c, 0, 1) * 4) / 4;
  }
  // how wide it holds its beak: 0..1 (the screech of a gust, the call of a bolt, the swallow, the dive)
  function beakTarget(dying) {
    const bd = cr.bird || {}, a = bd.act;
    if (dying) return 1;
    if (!a) return 0;
    if (a.kind === 'gust') return a.sub === 'rear' ? 1 : a.sub === 'beat' ? 0.6 : 0;
    if (a.kind === 'dive') return a.sub === 'call' ? 1 : a.sub === 'bolts' ? 0.6 : 0;
    if (a.kind === 'swallow') return a.sub === 'call' ? 1 : a.sub === 'glow' ? 0.5 : 0;
    if (a.kind === 'pass') return a.sub === 'dive' || a.sub === 'lock' ? 0.45 : 0;
    return 0;
  }

  // the frame's anchors for the arcs (3D points)
  const anchors = { tips: S.tips, joints: S.arm, tail: S.tailTips, crest: null, beak: null, gizzard: null, head: null };

  // ---- the frame ----
  const ext = {
    pieces, fx, set, fm, S, anchors,
    wings: { tris: () => fm.tris() },
    ownsLimbs: true,
    zBody: () => (S.zBody == null ? 0 : S.zBody) + 40, // (where a harpoon line ends when it is made fast to the body)
    // the generic view asks how big the gizzard's stone shows (the shield must be lifted first; 0 = hidden)
    heartScale(heartP, tt) { return heartP && !heartP.hidden && !heartP.dead && S.openK >= 0.6 ? 1 + 0.1 * (Math.floor(tt * 4) & 1) : 0; },
    hide() { if (fx) fx.reset(); },
    // the generic view calls this each frame after it placed the torso group; F = { cr, night, dt, t, state, tintOf, phase3, dying, R (the rig), tier }
    update(Fr) {
      const { R, night, dt, t, state } = Fr, f = cr.f < 0 ? -1 : 1, bd = cr.bird || {}, key = Math.floor(t * 8 + 1e-6), kNew = key !== S.key, dying = Fr.dying, tl = (p) => Fr.tintOf(p);
      S.key = key;
      const torso = byId('torso'), neck = byId('neck'), tail = byId('tail'), headP = byId('head'), beakP = byId('beak'), heartP = byId('gizzard');
      // ---- the depth the body lies at ----
      let zT = Z_FLY, bag = null;
      const pc = bd.perch;
      if (bd.mode === 'perch' && pc) { bag = bagOf(pc.bag); if (bag) { sagBag(bag.node, pc.landed && pc.sub !== 'lift' ? clamp(Math.floor((pc.t || 0) * 8) / 3, 0, 1) : 0); bag.node.updateWorldMatrix(true, false); S.perchZ = tmp.setFromMatrixPosition(bag.node.matrixWorld).z; zT = pc.landed ? S.perchZ + 70 : Z_FLY; } }
      else if (bd.mode === 'roost') zT = -120;
      else if (dying) zT = -300;
      S.zBody = S.zBody == null ? zT : S.zBody + (zT - S.zBody) * (1 - Math.exp(-3.2 * clamp(dt, 0, 0.1)));
      if (Math.abs(S.zBody - zT) < 0.5) S.zBody = zT;
      const zBody = S.zBody, zHead = zBody + 140;
      // ---- the torso group: its depth and pitch ----
      R.hg.position.z = zBody;
      R.hg.rotation.z = (cr.rot || 0) * f;
      R.hg.updateMatrixWorld(true);
      S.bodyM.copy(R.hg.matrixWorld);
      // ---- the dark sky takes the colour out of a dark bird: its materials are lifted with the night (its own light, since the storm has no lamp near it) ----
      const lift = 1 + 0.3 * clamp(night, 0, 1), self = P.SELF * clamp(night, 0, 1);
      if (lift !== S.lift) { S.lift = lift; uniforms.uSelf.value = self; uniformsT.uSelf.value = self; headMat.color.setScalar(lift); tubes.material.color.setScalar(lift); fm.material.color.setScalar(lift); }
      // ---- the storm in it: the glows, the veins ----
      const chg = chargeOf(state, dying), G = P.EYE_GLOW, headLit = headP && headP.lit && night > 0.3;
      S.chg = chg;
      let eye = (headLit ? G.lit : G.base) * (0.8 + 0.5 * chg);
      if (dying) eye *= 1 - clamp((cr.sinkT || 0) / 3, 0, 1);
      R.glow[0] = eye; R.glow[1] = (P.GOLD_GLOW / lift) * (dying ? 1 - 0.5 * clamp((cr.sinkT || 0) / 3, 0, 1) : 1); // (channel 1: the eyes; channel 2: the gold of the beak, the feet and the feather tips, lit by itself)
      R.glow[2] = P.THROAT_GLOW.shut + (P.THROAT_GLOW.open - P.THROAT_GLOW.shut) * chg * (dying ? clamp(1 - (cr.sinkT || 0) / 2, 0, 1) : 1);
      R.glow[3] = P.HEART_GLOW;
      uniforms.uGlow.value.set(R.glow[0], R.glow[1], R.glow[2], R.glow[3]);
      let heat = 0.35 + 0.8 * chg;
      if (dying) heat *= 1 - clamp((cr.sinkT || 0) / 2.5, 0, 1);
      heat = Math.round(heat * 8) / 8;
      if (heat !== S.heat) { S.heat = heat; headMat.emissiveIntensity = heat; tubes.material.emissiveIntensity = heat * 0.8; }
      // ---- the beak: opens in steps of a sixth toward what it is doing ----
      if (kNew) { const tg = beakTarget(dying), d = tg - S.open; S.open += Math.abs(d) < 0.17 ? d : Math.sign(d) * 0.34; S.open = Math.round(clamp(S.open, 0, 1) * 6) / 6; }
      // ---- the breast shield and the gizzard: closed, lifting (five steps), open ----
      const D2 = head.dyn, gOpen = !!(heartP && !heartP.hidden && !heartP.dead);
      if (kNew) S.openK = clamp(S.openK + (gOpen ? 0.2 : -0.25), 0, 1);
      if (D2.plates) D2.plates.pose(-Math.round(S.openK * 5) / 5 * 1.4, 1);
      torsoTint.set(R.ranges.heart, heartP && heartP.hit > 0 ? 2.4 : 1, heartP && heartP.hit > 0 ? 2.4 : 1, heartP && heartP.hit > 0 ? 2.4 : 1);
      // ---- the head, the mandible ----
      const hs = headP && headP.segs[0];
      anchors.head = anchors.beak = anchors.crest = null;
      if (headP && !headP.dead && hs && fin(hs.x) && fin(hs.y) && fin(hs.ang)) {
        Mh.copy(T(hs.x, -hs.y, zHead)).multiply(rotZ(-hs.ang)).multiply(Sx(HEAD_K, f * HEAD_K, HEAD_K));
        set.place('head', Mh);
        set.place('beak', Mh);
        Mj.copy(Mh).multiply(T(BEAK_PIVOT.x, BEAK_PIVOT.y, 0)).multiply(rotZ(-S.open * 0.55)).multiply(T(-BEAK_PIVOT.x, -BEAK_PIVOT.y, 0));
        set.place('jaw', Mj);
        const th = beakP && beakP.hit > 0 && !(headP.hit > 0) ? tl(beakP) : tl(headP);
        ptint.set(rs.head, th[0], th[1], th[2]);
        ptint.set(rs.jaw, th[0] * 1.5, th[1] * 1.4, th[2] * 1.1);
        ptint.set(rs.beak, th[0] * 1.5, th[1] * 1.4, th[2] * 1.1); // (the gold of the bill is lifted: it stays gold in the dark)
        anchors.head = V(100, 150, 0).applyMatrix4(Mh);
        anchors.beak = V(560, -40, 20).applyMatrix4(Mh);
        anchors.crest = V(-220, 540, 0).applyMatrix4(Mh);
      } else { set.place('head', null); set.place('beak', null); set.place('jaw', null); }
      // ---- the neck and the tail's stalk (depth runs from the body to the head / a little behind) ----
      if (neck && !neck.dead && neck.segs.length) {
        const n = neck.segs.length, Z = new Float32Array(n + 1);
        let s = 0; const reach = Math.max(1, neck.reach0 || neck.reach || 900);
        for (let j = 0; j <= n; j++) { Z[j] = zBody + (zHead - zBody) * smooth(s / reach); if (j < n) s += neck.segs[j].len; }
        const nt = tl(neck);
        tubes.setTint(LI.neck, nt[0], nt[1], nt[2]);
        tubes.update(LI.neck, scaled(neck.segs, 0.66, S.thinNeck), f, !!neck.severed, Z, nt);
      } else tubes.update(LI.neck, null, 1, false, null, [1, 1, 1]);
      const tp = tail && !tail.dead && !tail.hidden && tail.segs.length ? tail : null;
      if (tp) {
        const n = tp.segs.length, Z = new Float32Array(n + 1), tt = tl(tp);
        for (let j = 0; j <= n; j++) Z[j] = zBody - 30;
        tubes.setTint(LI.tail, tt[0], tt[1], tt[2]);
        tubes.update(LI.tail, scaled(tp.segs, 0.3, S.thinT), f, false, Z, tt);
      } else tubes.update(LI.tail, null, 1, false, null, [1, 1, 1]);
      // ---- the legs and the feet ----
      for (let i = 0; i < 2; i++) {
        const p = byId(i === 0 ? 'talonN' : 'talonF'), li = i === 0 ? LI.talonN : LI.talonF, foot = i === 0 ? 'footA' : 'footB', z = zBody + (i === 0 ? 130 : -130);
        if (p && !p.dead && p.segs.length) {
          const n = p.segs.length, Z = new Float32Array(n + 1), tt = tl(p), leg = [tt[0] * 1.5, tt[1] * 1.35, tt[2] * 0.7];
          for (let j = 0; j <= n; j++) Z[j] = z;
          tubes.setTint(li, leg[0], leg[1], leg[2]);
          tubes.update(li, scaled(p.segs, 0.6, S.thinL[i]), 1, false, Z, leg);
          const sg = p.segs[n - 1], ex = sg.x + Math.cos(sg.ang) * sg.len, ey = sg.y + Math.sin(sg.ang) * sg.len;
          Mt.copy(T(ex, -ey, z)).multiply(rotZ(Math.PI / 2 - sg.ang)).multiply(Sx(f, 1, 1));
          set.place(foot, Mt);
          ptint.set(rs[foot], tt[0], tt[1], tt[2]);
        } else { tubes.update(li, null, 1, false, null, [1, 1, 1]); set.place(foot, null); }
      }
      // ---- the wings ----
      const wb = [[zBody + 250, 1], [zBody - 560, -1]];
      for (let wi = 0; wi < 2; wi++) {
        const p = byId(wi === 0 ? 'wingN' : 'wingF'), li = wi === 0 ? LI.wingN : LI.wingF, s0 = wi * perWing;
        if (!p || p.dead || p.hidden || !p.segs.length) {
          tubes.update(li, null, 1, false, null, [1, 1, 1]);
          for (let s = 0; s < perWing; s++) fm.hide(s0 + s);
          S.tips[wi].length = 0; S.arm[wi].length = 0;
          continue;
        }
        const n = Math.min(5, p.segs.length), torn = !!p.severed, J = jointsOf(p.segs, S.joints[wi]), tw = tl(p), dmgK = clamp(1 - p.hp / Math.max(1, p.maxHp), 0, 1), zW = wb[wi][0];
        S.sg[wi] = sideOf(J, n, f, S.sg[wi]);
        const bone = [tw[0] * 0.8, tw[1] * 0.8, tw[2] * 0.85], Zb = new Float32Array(n + 1);
        for (let k = 0; k <= n; k++) Zb[k] = zW + 60;
        tubes.setTint(li, bone[0], bone[1], bone[2]);
        tubes.update(li, scaled(p.segs, 0.4, S.thinN[wi] || (S.thinN[wi] = [])), f, torn, Zb, bone);
        layoutWing(fm, s0, F, X, J, n, S.sg[wi], f, zW, tw, dmgK, torn, WING_WID, S.tips[wi]);
        const jn = S.arm[wi];
        for (let k = 0; k <= n; k++) { (jn[k] || (jn[k] = V())).set(J[k].x, -J[k].y, zW + 60); }
        jn.length = n + 1;
      }
      // ---- the tail fan ----
      tailFan(tp, f, zBody, tl);
      // ---- the hackle along the neck ----
      hackle(neck, f, zBody, zHead, tl);
      fm.flush();
      // ---- the storm ----
      if (fx) {
        const gp = head.heartAt;
        anchors.gizzard = gp ? V(gp.x, gp.y, gp.z + 60).applyMatrix4(S.bodyM) : null;
        const J = state.stormJob, ch = J && J.charge && J.charge.bird && !dying ? J.charge : null, sp = ch ? shipPoint(ch.x, -330, 20) : null;
        try { fx.update({ cr, state, dt, t, key, chg, night, anchors, zBody, chunks: [...R.chunks.values()], open: gOpen && S.openK >= 0.6, ship3: sp, tether: ch ? 1 - clamp(ch.t / Math.max(0.1, ch.max), 0, 1) : 0 }); } catch (e) { if (!S.fxWarned) { S.fxWarned = true; console.warn('bird fx', e); } }
      }
    },
    // the markers of the bird's telegraphs, drawn by the generic ring mesh: where its pass will strike, and the ring on a perched bird that the swords empty
    markers(Mk, key) {
      const sw = cr.swoop, pc = cr.bird && cr.bird.perch;
      if (sw && fin(sw.x)) Mk.add(sw.x, -sw.y, 420, 0, 0, 0, sw.locked ? 1 : key & 1);
      if (pc && pc.landed && fin(pc.wx) && pc.job && pc.job.live) Mk.add(pc.wx, -pc.wy, 420, 1, clamp(pc.left / Math.max(1, BD().PERCH.TIME), 0.02, 1), pc.job.prog || 0, key & 1);
    },
    // a plucked wing becomes a Rapier body: its arm bone as a thin tube, its feathers as a mesh of their own (the same layout code)
    chunkBones(part) { return part.kind === 'wing' ? scaled(part.segs, 0.4, []) : part.segs; },
    chunkExtra(part, fs) {
      if (part.kind !== 'wing' || !part.segs.length) return null;
      const n = Math.min(5, part.segs.length), J = jointsOf(part.segs, []), sl = wingSlots(F, X), cf = fs < 0 ? -1 : 1, tips = [];
      const cm = createFeatherMesh({ map: headMap, uniforms, P, slots: sl, ow: 9 });
      layoutWing(cm, 0, F, X, J, n, sideOf(J, n, cf, 0), cf, -120, [1, 1, 1], 0.35, true, WING_WID, tips);
      cm.flush();
      return { mesh: cm.mesh, dispose: () => cm.dispose() };
    },
    dispose() {
      root.remove(pieceMesh, pieceInk, fm.mesh);
      pieces.geometry.dispose(); fm.dispose();
      if (fx) fx.dispose();
    },
    reset() { if (fx) fx.reset(); S.zBody = null; },
  };

  // ---- the tail: a fan of long feathers from the root of the stalk, with a row of shorter ones over them ----
  function tailFan(tp, f, zBody, tl) {
    const kinds = ['tail', 'cover1'];
    if (!tp) { for (let s = 0; s < M + M - 1; s++) fm.hide(tail0 + s); S.tailTips.length = 0; return; }
    const sg = tp.segs, n = sg.length, a = sg[0], b = sg[n - 1], ex = b.x + Math.cos(b.ang) * b.len, ey = b.y + Math.sin(b.ang) * b.len;
    let ax = ex - a.x, ay = ey - a.y;
    const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const base = Math.atan2(ay, ax), L = Math.max(720, al * 1.15), tt = tl(tp), tipsOut = S.tailTips;
    tipsOut.length = 0;
    for (let i = 0; i < M; i++) {
      const w = (i - (M - 1) / 2) * (low ? 0.15 : 0.1), ang = base + w, dgx = Math.cos(ang), dgy = Math.sin(ang), len = L * (1 - 0.07 * Math.abs(i - (M - 1) / 2)) * (0.94 + 0.12 * hash(i, 4, 2)), z = zBody - 40 + i * FEATHER_STEP * 2;
      fm.look(tail0 + i, 'tail', tt, true);
      fm.put(tail0 + i, { x: a.x, y: -a.y, z, dx: dgx, dy: -dgy, len, wid: 200, cx: 0, cy: -1, curve: 0.06, ft: (i % 3) - 1 });
      tipsOut.push({ x: a.x + dgx * len, y: -(a.y + dgy * len), z });
    }
    for (let i = 0; i < M - 1; i++) {
      const w = (i - (M - 2) / 2) * (low ? 0.15 : 0.1), ang = base + w, dgx = Math.cos(ang), dgy = Math.sin(ang), len = L * 0.46 * (1 - 0.05 * Math.abs(i - (M - 2) / 2)), z = zBody - 40 + (M + i) * FEATHER_STEP * 2;
      fm.look(tail0 + M + i, kinds[1], tt, false);
      fm.put(tail0 + M + i, { x: a.x, y: -a.y, z, dx: dgx, dy: -dgy, len, wid: 190, cx: 0, cy: -1, curve: 0.05, ft: 1 - (i % 3) });
    }
  }
  // ---- the hackle: long feathers along the nape, flowing back over the shoulders ----
  function hackle(neck, f, zBody, zHead, tl) {
    if (!neck || neck.dead || !neck.segs.length) { for (let s = 0; s < NH; s++) fm.hide(hack0 + s); return; }
    const sg = neck.segs, n = sg.length, tt = tl(neck);
    for (let i = 0; i < NH; i++) {
      const u = (i + 0.5) / NH * n, k = Math.min(n - 1, Math.floor(u)), s = sg[k], r = u - k;
      const bx = s.x + Math.cos(s.ang) * s.len * r, by = s.y + Math.sin(s.ang) * s.len * r;
      // the direction: back along the neck (the opposite of the way it points), turned up and away
      let dx = -Math.cos(s.ang), dy = Math.sin(s.ang); // (3D, y up)
      const up = dx > 0 ? 1 : -1, a = 0.5 * up * (0.7 + 0.5 * hash(i, 6, 3)), c = Math.cos(a), sn = Math.sin(a);
      const ddx = dx * c - dy * sn, ddy = dx * sn + dy * c, len = 300 + 130 * hash(i, 8, 1) + 20 * (NH - i), z = zBody + 190 + i * FEATHER_STEP;
      fm.look(hack0 + i, 'hackle', tt, true);
      fm.put(hack0 + i, { x: bx, y: -by, z, dx: ddx, dy: ddy, len, wid: 150, cx: 0, cy: -1, curve: 0.08, ft: (i % 3) - 1 });
    }
    void zHead; void f;
  }
  return ext;
}
