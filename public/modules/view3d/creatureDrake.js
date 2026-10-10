// THE CINDER DRAKE IN 3D (3D.md section 24). creature.js is the generic creature view and KINDS.drake plugs this in; the models are drakeModel.js, the wing skins drakeWings.js, the paintings drakePaint.js
// and the fire drakeFx.js. What this file does is put the model where the SIMULATION says its parts are, every frame, and never move a thing by itself (no sine of time, no wobble: the wing beats, the
// neck, the pitch, the open jaw and the throat's glow are the simulation's stepped numbers; the flames swap between four fixed frames at 8 a second):
//   - the TORSO is the generic head record (a sculpted lathe): placed at the sim's body position, mirrored by `cr.f`, pitched by `cr.rot`, at a depth that depends on what it is doing (flying: behind the
//     ship's plane so it never covers the crew; perched: at the gasbag's own depth; crawling: on the shelf)
//   - the NECK, the TAIL, the WING ARMS, the WING FINGERS and the two HIND LEGS are tubes (creatureTube.js, 14 limbs in one mesh), the neck and tail with a ridge of spines along the back; the wing arm is the
//     sim's chain drawn thin (the sim's radius is the membrane's width), each finger a bone from a joint to the trailing edge, and the MEMBRANES (drakeWings.js) are stretched between them with holes as the wing is hurt
//   - the HEAD, the hinged JAW, the tail CLUB, the TALONS and the wing thumbs are rigid pieces (a RigidSet, creatureKit.js) moved by matrices; the jaw turns by the sim's mouth openness in eighths; the throat,
//     the cheek vents and the mouth glow by the stepped breath glow; the talons are placed by a two bone leg IK on the gasbag's own skin when it perches, and the bag sags under its weight
//   - the FIRE (drakeFx.js): the breath cone, the lava spouts, the crash, the perch's thud and the fall into the lava
// The same record is what the dev page and the gate (tools/creature3d-check.mjs) read: rig.ext.
import { THREE, outlineMat } from './style.js';
import { config } from '../../config.js';
import { Tinter } from './creatureKit.js';
import { paintDrakeAtlas, paintDrakeLimb } from './drakePaint.js';
import { buildTorso, buildPieces, JAW_PIVOT } from './drakeModel.js';
import { createWingMesh } from './drakeWings.js';
import { createDrakeFx } from './drakeFx.js';
import { BAG_RZ } from './parts3d/bag.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---- what creature.js asks the kind for ----------------------------------------------------------------------------------------------------------------------------------------------------
export const buildDrake = buildTorso;
export const drakeSkins = (P) => { const a = paintDrakeAtlas(P), l = paintDrakeLimb(P); return { head: a.map, headGlow: a.glow, limb: l.map, limbGlow: l.glow }; };
// the tube set's limbs: 0 near wing's arm, 1 far wing's arm, 2 neck, 3 tail, 4-5 hind legs, 6-9 the near wing's four fingers, 10-13 the far wing's. The first four stand for the sim's parts (the harpoon rope finds its limb by them)
export const LI = { wingN: 0, wingF: 1, neck: 2, tail: 3, legN: 4, legF: 5, finN: 6, finF: 10, N: 14 };
export const drakeLimbs = (cr) => {
  const by = (id) => cr.parts.find((p) => p.id === id) || null;
  return [by('wingN'), by('wingF'), by('neck'), by('tail'), ...new Array(LI.N - 4).fill(null)];
};
export const drakeTubeOpts = (P) => {
  const spine = new THREE.ConeGeometry(0.5, 1.9, 5);
  spine.translate(0, 0.95, 0);
  return { cup: spine, rows: [Math.PI], rsMax: 92, suckerK: 0.36, gap: 2.5, stationsFor: (l) => l === LI.neck || l === LI.tail, cols: [P.horn, P.horn], maxSuckers: 160, tipK: 2.2 };
};

const TIRED_NONE = [1, 1, 1];
// the sim's wing: the leading edge chain. Its radius is the membrane's width; the bone drawn along it is thin
const boneR = (r) => 0.17 * r + 12;
const boneSegs = (segs, out) => { // the sim's chain as thin bone segments (re-used objects)
  for (let i = 0; i < segs.length; i++) { const s = segs[i], o = out[i] || (out[i] = { x: 0, y: 0, ang: 0, len: 0, r: 0, r1: 0 }); o.x = s.x; o.y = s.y; o.ang = s.ang; o.len = s.len; o.r = boneR(s.r); o.r1 = boneR(s.r1); }
  return out;
};
const jointsOf = (segs, out) => { // game coordinates (y down) of the chain's joints: n + 1 points
  const n = segs.length;
  for (let i = 0; i < n; i++) (out[i] || (out[i] = { x: 0, y: 0 })).x = segs[i].x, out[i].y = segs[i].y;
  const s = segs[n - 1];
  (out[n] || (out[n] = { x: 0, y: 0 })).x = s.x + Math.cos(s.ang) * s.len; out[n].y = s.y + Math.sin(s.ang) * s.len;
  return out;
};

// ---- the extension: made by creature.js build() ---------------------------------------------------------------------------------------------------------------------------------------------------
export function extendDrake(ctx) {
  const { cr, P, root, parent, link, head, uniforms, headMat, headMap, tubes, tint: torsoTint, low } = ctx;
  const pieces = buildPieces(cr, P, { low });
  const set = pieces.set, rs = pieces.ranges;
  const pieceMesh = new THREE.Mesh(pieces.geometry, headMat), pieceInk = new THREE.Mesh(pieces.geometry, outlineMat);
  for (const m of [pieceMesh, pieceInk]) m.frustumCulled = false;
  pieceMesh.userData.toon = headMat;
  pieceInk.userData.isOutline = true;
  root.add(pieceMesh, pieceInk);
  const ptint = new Tinter(pieces.geometry);
  const wings = createWingMesh({ map: headMap, uniforms, P, nWings: 2 });
  root.add(wings.mesh);
  let fx = null;
  try { fx = createDrakeFx({ parent, P, getP: () => (link.vfx && link.vfx.P) || null, getDamage: () => link.damage || null }); } catch (e) { console.warn('drake fx', e); }

  const S = {
    zBody: null, bodyM: new THREE.Matrix4(), sg: [0, 0], feet: [V(), V()], feetSet: false, jointsN: [], jointsF: [], bones: [[], []], legSegs: [[], []], finSeg: [{ x: 0, y: 0, ang: 0, len: 0, r: 0, r1: 0 }],
    perchZ: 0, lastKey: '', glowStep: 0, prevMode: '', heatKey: -1,
  };
  const Mh = new THREE.Matrix4(), Mj = new THREE.Matrix4(), Mt = new THREE.Matrix4(), Q1 = new THREE.Quaternion(), tmp = V(), tmp2 = V(), tmp3 = V();
  const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const Sx = (sx, sy, sz) => new THREE.Matrix4().makeScale(sx, sy, sz);
  const partOf = (kind) => cr.parts.find((p) => p.kind === kind);
  const byId = (id) => cr.parts.find((p) => p.id === id);
  const D = () => config.CREATURES.DRAKE;

  // the first ship model's bag (for the perch): its node's world matrix and the layout's numbers
  function bagOf(idx) {
    const e = link.models && link.models.values().next().value, m = e && e.model;
    if (!m || !m.dyn || !m.layout || !m.layout.gasbags) return null;
    const G = m.layout.gasbags[idx], bn = (m.dyn.bags || []).find((q) => q.i === idx);
    return G && bn ? { G, node: bn.node, model: m } : null;
  }
  // a point on the skin of that bag over ship x, `dz` toward the viewer from its middle: the world point (same profile as damageView.js onBag) and the world "up" there
  function bagSkin(b, x, dz, out) {
    const G = b.G, u = clamp((x - G.cx) / G.rx, -0.98, 0.98), pw = u < 0 ? 1.75 : 2.0, r = G.ry * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), pw)), 1 / pw), rz = Math.max(20, BAG_RZ * r);
    const ly = r * Math.sqrt(Math.max(0, 1 - Math.pow(clamp(dz / rz, -0.98, 0.98), 2)));
    b.node.updateWorldMatrix(true, false);
    return out.set(x - G.cx, ly, dz).applyMatrix4(b.node.matrixWorld);
  }

  // THE DENT: its weight sits the bag down a little (a small separate hook: the envelope's node is scaled after the ship model set it this frame, and put back by the model next frame; bag.js is untouched). k = 0..1 in
  // three steps after it lands. A node whose scale is still the one this left (the model did not run in between) is first put back, so it never compounds.
  function sagBag(node, k) {
    const u = node.userData.drakeSag;
    if (u && node.scale.x === u.x && node.scale.y === u.y) node.scale.set(u.bx, u.by, node.scale.z);
    if (k <= 0) { node.userData.drakeSag = null; return; }
    const bx = node.scale.x, by = node.scale.y;
    node.scale.set(bx * (1 + 0.015 * k), by * (1 - 0.06 * k), node.scale.z);
    node.userData.drakeSag = { x: node.scale.x, y: node.scale.y, bx, by };
  }

  // two bone leg: hip -> knee -> foot in the plane of the screen (knee toward `fwd`), positions in 3D; fills the two segments (game coordinates)
  function leg(li, hip, foot, fwd, zHip, zFoot, segsOut, tl) {
    const a = 430, b = 410;
    let dx = foot.x - hip.x, dy = foot.y - hip.y, d = Math.hypot(dx, dy) || 1;
    const dd = clamp(d, Math.abs(a - b) + 20, a + b - 4);
    dx /= d; dy /= d;
    const x = (a * a - b * b + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, a * a - x * x));
    let nx = -dy, ny = dx;
    if (nx * fwd < 0) { nx = -nx; ny = -ny; } // the knee toward the front
    const kx = hip.x + dx * x + nx * h, ky = hip.y + dy * x + ny * h;
    const fx2 = hip.x + dx * dd, fy = hip.y + dy * dd; // (the foot, within reach)
    const A = segsOut[0] || (segsOut[0] = { x: 0, y: 0, ang: 0, len: 0, r: 0, r1: 0 }), B = segsOut[1] || (segsOut[1] = { x: 0, y: 0, ang: 0, len: 0, r: 0, r1: 0 });
    A.x = hip.x; A.y = -hip.y; A.ang = Math.atan2(-(ky - hip.y), kx - hip.x); A.len = Math.hypot(kx - hip.x, ky - hip.y); A.r = 112; A.r1 = 76;
    B.x = kx; B.y = -ky; B.ang = Math.atan2(-(fy - ky), fx2 - kx); B.len = Math.hypot(fx2 - kx, fy - ky); B.r = 76; B.r1 = 50;
    const Z = new Float32Array(3);
    Z[0] = zHip; Z[1] = (zHip + zFoot) / 2; Z[2] = zFoot;
    tubes.update(li, segsOut, 1, false, Z, tl);
    return { x: fx2, y: fy };
  }

  // the trailing edge of a wing from its joints (game coords): the points the finger bones end on, and which side the membrane hangs
  const trailOf = (p, st, J, f, n, torn, out) => {
    const W = [-f, 0.55], tx = J[n].x - J[0].x, ty = J[n].y - J[0].y, tl = Math.hypot(tx, ty) || 1, score = (-(ty / tl)) * W[0] + (tx / tl) * W[1];
    if (st === 0) st = score >= 0 ? 1 : -1; else if (score * st < -0.3) st = -st;
    for (let k = 1; k <= n; k++) {
      if (k === n && !torn) { (out[k] || (out[k] = { x: 0, y: 0, dx: 0, dy: 0, len: 0 })); out[k].x = J[n].x; out[k].y = J[n].y; out[k].len = 0; out[k].dx = 0; out[k].dy = 0; continue; }
      const a = J[k - 1], b = J[Math.min(n, k + 1)], Tx0 = b.x - a.x, Ty0 = b.y - a.y, l0 = Math.hypot(Tx0, Ty0) || 1, Tx = Tx0 / l0, Ty = Ty0 / l0;
      const fan = 0.34 - 0.045 * k, px = -Ty * st, py = Tx * st; // (the perpendicular on the membrane's side, swept toward the tip a little)
      let dx = px * Math.cos(fan) + Tx * Math.sin(fan), dy = py * Math.cos(fan) + Ty * Math.sin(fan);
      const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const r = k < n ? p.segs[k].r : p.segs[n - 1].r1, len = 2.5 * r; // (the skin hangs wider than the hit capsule: a dragon's wing is broad)
      const o = out[k] || (out[k] = { x: 0, y: 0, dx: 0, dy: 0, len: 0 });
      o.x = J[k].x + dx * len; o.y = J[k].y + dy * len; o.dx = dx; o.dy = dy; o.len = len;
    }
    return st;
  };
  const E = [[], []];
  const bodyPt = (cr2, bx, by) => { // a point of the body's frame (game: x forward, y down) in the world (game coordinates), the mirror and the pitch applied (host/creature.js bodyVec)
    const ax = bx * cr2.f, th = cr2.rot ? -cr2.rot * cr2.f : 0, c = Math.cos(th), s = Math.sin(th);
    return { x: cr2.x + ax * c - by * s, y: cr2.y + ax * s + by * c };
  };

  // ---- one wing: the arm and finger tubes and the membrane ----
  const J3 = [[], []], E3 = [[], []];
  function stepWing(wi, p, f, zRoot, zSpread, tw, tl, dmgK) { // tw = the skin's tint, tl = the bones' tint
    const base = wi === 0 ? LI.wingN : LI.wingF, fin0 = wi === 0 ? LI.finN : LI.finF;
    if (!p || p.dead || p.hidden || !p.segs.length) {
      tubes.update(base, null, 1, false, null, tl); for (let k = 0; k < 4; k++) tubes.update(fin0 + k, null, 1, false, null, tl);
      wings.hide(wi); set.place(wi === 0 ? 'thumbN' : 'thumbF', null);
      return;
    }
    const n = Math.min(5, p.segs.length), torn = !!p.severed, J = jointsOf(p.segs, wi === 0 ? S.jointsN : S.jointsF);
    S.sg[wi] = trailOf(p, S.sg[wi], J, f, n, torn, E[wi]);
    const e0 = bodyPt(cr, wi === 0 ? -440 : -380, wi === 0 ? 70 : 90);
    E[wi][0] = Object.assign(E[wi][0] || {}, { x: e0.x, y: e0.y });
    // depths: the arm leaves the shoulder and spreads toward its side
    const zJ = (k) => zRoot + zSpread * smooth(k / Math.max(1, n)), side = wi === 0 ? 1 : -1;
    const Zb = new Float32Array(n + 1);
    for (let k = 0; k <= n; k++) Zb[k] = zJ(k);
    tubes.update(base, boneSegs(p.segs, S.bones[wi]).slice(0, n), cr.f < 0 ? -1 : 1, torn, Zb, tl);
    // the finger bones: from each inner joint to the trailing edge
    const fs = S.finSeg;
    for (let k = 1; k <= 4; k++) {
      const li = fin0 + k - 1;
      if (k >= n + (torn ? 1 : 0) || k > 4) { tubes.update(li, null, 1, false, null, tl); continue; }
      const j = J[k], e = E[wi][k], len = Math.hypot(e.x - j.x, e.y - j.y);
      if (!(len > 8)) { tubes.update(li, null, 1, false, null, tl); continue; }
      const o = fs[0];
      o.x = j.x; o.y = j.y; o.ang = Math.atan2(e.y - j.y, e.x - j.x); o.len = len; o.r = boneR(p.segs[Math.min(k, n - 1)].r) * 0.7; o.r1 = 6;
      tubes.update(li, fs, 1, false, new Float32Array([zJ(k), zJ(k) - 30]), tl);
    }
    // the membrane
    const Jv = J3[wi], Ev = E3[wi];
    for (let k = 0; k <= n; k++) {
      (Jv[k] || (Jv[k] = V())).set(J[k].x, -J[k].y, zJ(k));
      const e = E[wi][k];
      (Ev[k] || (Ev[k] = V())).set(e.x, -e.y, k === 0 ? zRoot - side * 40 : zJ(k) - 30);
    }
    Jv.length = n + 1; Ev.length = n + 1;
    wings.update(wi, { J: Jv, E: Ev, n, torn, damage: dmgK, tint: tw });
    // the thumb claw at the wrist: out from the leading edge (away from the membrane), curling toward the tip
    const kk = Math.min(2, n - 1) || 0, a = J[kk], b = J[Math.min(n, kk + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl2 = Math.hypot(tx, ty) || 1; tx /= tl2; ty /= tl2;
    const ox = ty * S.sg[wi], oy = -tx * S.sg[wi]; // (opposite the membrane's side)
    const ex = tmp.set(ox, -oy, 0).normalize(), ey = tmp2.set(tx, -ty, 0).normalize(), ez = tmp3.copy(ex).cross(ey);
    Mt.makeBasis(ex, ey, ez).setPosition(a.x, -a.y, zJ(kk));
    set.place(wi === 0 ? 'thumbN' : 'thumbF', Mt);
    const rn = wi === 0 ? rs.thumbN : rs.thumbF;
    ptint.set(rn, tw[0], tw[1], tw[2]);
  }

  // ---- the frame ----
  const ext = {
    pieces, wings, fx, set,
    ownsLimbs: true,
    zBody: () => (S.zBody == null ? 0 : S.zBody) + 40, // (where a harpoon line ends when it is made fast to the body)
    // the generic view calls this each frame after it placed the torso group; f = { cr, night, dt, t, state, tintOf, phase3, dying, R (the rig), link }
    update(F) {
      const { R, night, dt, t, state } = F, f = cr.f < 0 ? -1 : 1, dk = cr.drake || {};
      const torso = partOf('mantle'), neck = byId('neck'), tail = byId('tail'), headP = partOf('head'), mouthP = partOf('mouth'), heartP = partOf('heart');
      // ---- the depth the body lies at ----
      let zT = -480, bag = null;
      const pc = dk.perch;
      if (dk.mode === 'perch' && pc) { bag = bagOf(pc.bag); if (bag) { sagBag(bag.node, pc.landed && pc.sub !== 'lift' ? clamp(Math.floor((pc.t || 0) * 8) / 3, 0, 1) : 0); bag.node.updateWorldMatrix(true, false); S.perchZ = tmp.setFromMatrixPosition(bag.node.matrixWorld).z; zT = pc.landed ? S.perchZ + 70 : -300; } }
      else if (dk.mode === 'crash' || dk.mode === 'crawl') zT = -230;
      else if (cr.mode === 'dying') zT = 240; // (it falls in front of the shelf, into the lava)
      S.zBody = S.zBody == null ? zT : S.zBody + (zT - S.zBody) * (1 - Math.exp(-3.2 * clamp(dt, 0, 0.1)));
      if (Math.abs(S.zBody - zT) < 0.5) S.zBody = zT;
      const zBody = S.zBody, zHead = -40;
      // ---- the torso group: its depth and pitch ----
      R.hg.position.z = zBody;
      R.hg.rotation.z = (cr.rot || 0) * f;
      R.hg.updateMatrixWorld(true);
      S.bodyM.copy(R.hg.matrixWorld);
      // ---- tints, glows ----
      const tl = (p) => F.tintOf(p);
      const dying = F.dying, G = P.EYE_GLOW;
      let eye = headP && headP.lit && night > 0.3 ? G.lit : G.base;
      if (dying) eye *= 1 - clamp((cr.sinkT || 0) / 3, 0, 1);
      R.glow[0] = eye; R.glow[1] = eye;
      const glow = dying ? 0 : clamp(dk.glow || 0, 0, 1), lvl = glow > 0.04 ? Math.min(1, Math.ceil(glow * 5) / 5) : 0;
      R.glow[2] = P.THROAT_GLOW.shut + (P.THROAT_GLOW.open - P.THROAT_GLOW.shut) * lvl;
      R.glow[3] = P.HEART_GLOW;
      uniforms.uGlow.value.set(R.glow[0], R.glow[1], R.glow[2], R.glow[3]);
      // the ember cracks' heat: stepped quarters of the breath's glow; they dim as it dies and when it is tired
      let heat = P.HEAT.base + P.HEAT.breath * (lvl > 0 ? lvl : 0) + (cr.flame ? 0.15 : 0);
      if ((cr.phase || 1) >= 3 && !dying) heat += 0.25; // (phase 3, desperate: the cracks burn brighter)
      if (dying) heat *= 1 - 0.8 * clamp((cr.sinkT || 0) / 4, 0, 1);
      heat = Math.round(heat * 8) / 8;
      if (heat !== S.heat) { S.heat = heat; headMat.emissiveIntensity = heat; tubes.material.emissiveIntensity = heat * 0.85; }
      // the breast plates and the heart: closed (plates), cracking open (the hack's progress, in steps), or open (the heart shows)
      const D2 = head.dyn;
      if (D2.plates) {
        const open = heartP && !heartP.hidden && !heartP.dead, prog = dk.scales ? clamp(dk.scales.prog || 0, 0, 1) : 0;
        if (open) D2.plates.pose(0, 0); else D2.plates.pose(-Math.round(prog * 5) / 5 * 0.7, 1);
      }
      // ---- the head, the jaw, the club, the pieces' tints ----
      const hs = headP && headP.segs[0];
      if (headP && !headP.dead && hs && fin(hs.x) && fin(hs.y)) {
        Mh.copy(T(hs.x, -hs.y, zHead)).multiply(rotZ(-hs.ang)).multiply(Sx(1, f, 1));
        set.place('head', Mh);
        const open = mouthP ? Math.round(clamp(mouthP.openAmt || 0, 0, 1) * 8) / 8 : 0;
        Mj.copy(Mh).multiply(T(JAW_PIVOT.x, JAW_PIVOT.y, 0)).multiply(rotZ(-open * 0.95)).multiply(T(-JAW_PIVOT.x, -JAW_PIVOT.y, 0));
        set.place('jaw', Mj);
        const th = tl(headP);
        ptint.set(rs.head, th[0], th[1], th[2]);
        ptint.set(rs.jaw, th[0], th[1], th[2]);
      } else { set.place('head', null); set.place('jaw', null); }
      const tp = tail && !tail.dead && !tail.hidden && tail.segs.length ? tail : null;
      if (tp) {
        const s = tp.segs[tp.segs.length - 1], ex = s.x + Math.cos(s.ang) * s.len, ey = s.y + Math.sin(s.ang) * s.len;
        Mt.copy(T(ex, -ey, zBody - 40)).multiply(rotZ(-s.ang));
        set.place('club', Mt);
        const tt = tl(tp);
        ptint.set(rs.club, tt[0], tt[1], tt[2]);
      } else set.place('club', null);
      // ---- the tubes: neck and tail (depth runs from the body to the plane / a little behind) ----
      if (neck && !neck.dead && neck.segs.length) {
        const n = neck.segs.length, Z = new Float32Array(n + 1);
        let s = 0; const reach = Math.max(1, neck.reach0 || neck.reach || 1900);
        for (let j = 0; j <= n; j++) { Z[j] = zBody + (zHead - zBody) * smooth(s / reach); if (j < n) s += neck.segs[j].len; }
        const nt = tl(neck);
        tubes.setTint(LI.neck, nt[0], nt[1], nt[2]);
        tubes.update(LI.neck, neck.segs, f, !!neck.severed, Z, nt);
      } else tubes.update(LI.neck, null, 1, false, null, [1, 1, 1]);
      if (tp) {
        const n = tp.segs.length, Z = new Float32Array(n + 1), tt = tl(tp);
        let s = 0; const reach = Math.max(1, tp.reach0 || tp.reach || 2000);
        for (let j = 0; j <= n; j++) { Z[j] = zBody - 40 * smooth(s / reach); if (j < n) s += tp.segs[j].len; }
        tubes.setTint(LI.tail, tt[0], tt[1], tt[2]);
        tubes.update(LI.tail, tp.segs, f, false, Z, tt);
      } else tubes.update(LI.tail, null, 1, false, null, [1, 1, 1]);
      // ---- the wings ----
      for (let wi = 0; wi < 2; wi++) {
        const p = byId(wi === 0 ? 'wingN' : 'wingF'), tw = p ? tl(p) : [1, 1, 1], side = wi === 0 ? 1 : -1;
        const dmgK = p ? clamp(1 - p.hp / Math.max(1, p.maxHp), 0, 1) : 0;
        const bone = [tw[0] * 0.62, tw[1] * 0.55, tw[2] * 0.55];
        tubes.setTint(wi === 0 ? LI.wingN : LI.wingF, bone[0], bone[1], bone[2]);
        stepWing(wi, p, f, zBody + side * 190, side * 170, tw, bone, dmgK);
        if (p && !p.dead && !p.hidden) {
          for (let k = 0; k < 4; k++) tubes.setTint((wi === 0 ? LI.finN : LI.finF) + k, bone[0], bone[1], bone[2]);
        }
      }
      // ---- the legs and the talons ----
      stepLegs(F, f, zBody, bag);
      // ---- the effects ----
      if (fx) {
        const hsd = headP && headP.segs[0], mo = mouthP && mouthP.segs[0];
        const m3 = mo ? { x: mo.x, y: -mo.y } : hsd ? { x: hsd.x, y: -hsd.y } : null;
        const sw = cr.parts.find((q) => q.kind === 'wing' && q.severed && q.segs.length), sj = sw ? jointsOf(sw.segs, []) : null, drag = sj ? { x: sj[sj.length - 1].x, y: -sj[sj.length - 1].y } : null; // (the stump of a torn wing drags on the shelf)
        try { fx.update({ cr, state, dt, t, zMouth: zHead, zBody, mouth3: m3, drag, tier: F.tier, night, lavaY: state && state.env && fin(state.env.lavaY) ? state.env.lavaY : null, chunks: [...R.chunks.values()], tierK: F.tier && F.tier.name === 'low' ? 0 : F.tier && F.tier.name === 'medium' ? 0.6 : 1 }); } catch (e) { if (!S.fxWarned) { S.fxWarned = true; console.warn('drake fx', e); } }
      }
      S.prevMode = dk.mode;
    },
    // the markers of the Drake's telegraphs, drawn by the generic ring mesh: where a swoop will strike, where a lunge will snap, and the ring on a perched drake that the swords empty
    markers(M, key) {
      const sw = cr.swoop, lg = cr.lunge, dk = cr.drake, pc = dk && dk.perch;
      if (sw && fin(sw.x)) M.add(sw.x, -sw.y, 420, 0, 0, 0, sw.locked ? 1 : key & 1);
      if (lg && fin(lg.x)) M.add(lg.x, -lg.y, 420, 0, 0, 0, key & 1);
      if (pc && pc.landed && fin(pc.wx) && pc.job && pc.job.live) M.add(pc.wx, -pc.wy, 420, 1, clamp(pc.left / Math.max(1, D().PERCH.TIME), 0.02, 1), pc.job.prog || 0, key & 1);
    },
    // a torn-off wing becomes a Rapier body: its bones are baked as thin tubes and its skin as a membrane mesh (the same builder, one panel set)
    chunkBones(part) { return part.kind === 'wing' ? boneSegs(part.segs, []) : part.segs; },
    chunkExtra(part, f) {
      if (part.kind !== 'wing' || !part.segs.length) return null;
      const wm = createWingMesh({ map: headMap, uniforms, P, nWings: 1, seed: 11 }), n = Math.min(5, part.segs.length), J = jointsOf(part.segs, []), Eo = [], Jv = [], Ev = [];
      const st = trailOf(part, 0, J, f < 0 ? -1 : 1, n, true, Eo);
      void st;
      for (let k = 0; k <= n; k++) { Jv.push(V(J[k].x, -J[k].y, 0)); const e = k === 0 ? { x: J[0].x - 40, y: J[0].y + 60 } : Eo[k]; Ev.push(V(e.x, -e.y, -20)); }
      wm.update(0, { J: Jv, E: Ev, n, torn: true, damage: 0.45, tint: [1, 1, 1] });
      return { mesh: wm.mesh, dispose: () => wm.dispose() };
    },
    dispose() {
      root.remove(pieceMesh, pieceInk, wings.mesh);
      pieces.geometry.dispose(); wings.dispose();
      if (fx) fx.dispose();
    },
    reset() { if (fx) fx.reset(); S.zBody = null; S.feetSet = false; },
  };

  // ---- the hind legs: tucked in flight, planted on the shelf when it crawls, gripping the bag when it perches ----
  function stepLegs(F, f, zBody, bag) {
    const dk = cr.drake || {}, pc = dk.perch, torso = partOf('mantle');
    const M = S.bodyM, tl = [1, 1, 1];
    if (!torso || torso.dead) { tubes.update(LI.legN, null, 1, false, null, tl); tubes.update(LI.legF, null, 1, false, null, tl); set.place('footA', null); set.place('footB', null); return; }
    const tt = F.tintOf(torso);
    const perched = dk.mode === 'perch' && pc && pc.landed && bag;
    const hipsL = [V(-350, -120, 205), V(-350, -120, -205)];
    for (let i = 0; i < 2; i++) {
      const hip = hipsL[i].clone().applyMatrix4(M), zH = hip.z;
      let target = tmp3.set(0, 0, 0), zF = zH;
      if (perched) {
        const near = i === 0, x = pc.px + (near ? 130 : -100) * f, dz = near ? 110 : 30; // (both feet on the half of the bag that faces the viewer)
        const w = bagSkin(bag, x, dz, target);
        target.copy(w); zF = w.z; target.y += 38;
      } else if (dk.mode === 'crawl' || dk.mode === 'crash') {
        target.set(hip.x + f * (i ? -170 : 120), -(cr.y + 380) + 62, zH * 0.9);
        zF = target.z;
      } else {
        target.copy(V(-80 * 0 + (i ? -190 : -130), -430, i === 0 ? 205 : -205).applyMatrix4(M)); zF = zH; // tucked under the belly
      }
      const fp = S.feet[i];
      if (!S.feetSet) fp.copy(target); else { const k = 1 - Math.exp(-12 * clamp(F.dt, 0, 0.1)); fp.lerp(target, k); }
      const L = leg(LI.legN + i, hip, fp, f, zH, zF, S.legSegs[i], tt);
      tubes.setTint(LI.legN + i, tt[0], tt[1], tt[2]);
      const foot = i === 0 ? 'footA' : 'footB';
      Mt.copy(T(L.x, L.y, zF)).multiply(Sx(f, 1, 1)).multiply(rotZ(perched ? -0.12 * f : 0));
      set.place(foot, Mt);
    }
    S.feetSet = true;
    const tn = tt;
    ptint.set(rs.footA, tn[0], tn[1], tn[2]); ptint.set(rs.footB, tn[0], tn[1], tn[2]);
  }
  void TIRED_NONE;
  return ext;
}
