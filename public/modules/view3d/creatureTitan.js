// THE ISLAND TITAN IN 3D (3D.md section 38). creature.js is the generic creature view and KINDS.titan plugs this in; the models are titanModel.js (the torso, legs, head, island, crystal, boulder), titanArms.js (the slabs and
// hands), the stone titanPaint.js and the marks titanFx.js. What this file does is put the model where the SIMULATION says its parts are, every frame, and never move a thing by itself (no sine of time, no wobble: the
// legs swap on the sim's 8 a second key, the head tips back in held steps, the jaw opens in sixths, the crystal cracks in stages):
//   - the TORSO, the rubble heap, the heartstone and its vein are the generic "head" record (a still mesh), placed with the sim's body at a depth BEHIND the lair's plain face, so a sinking Titan is hidden by the plain itself
//   - every other piece is a RIGID PIECE (RigidSet) in the body's own frame (a child of the body group, so walking moves nothing in the mesh): the two LEGS (they swap and lift on `cr.titan.leg` while it walks), the HEAD
//     (tipped back in three held steps for the roar), the hinged JAW (sixths of `openAmt`), the ISLAND with its trees and ruin, the CRYSTAL in four stages, three boulders
//   - the ARMS are FLOATING STONES (titanArms.js): three boulders each, one per sim segment, centred on the segment (with a stepped bob), held by a cyan tether between the sim's joints (a crystal node and orbiting shards at
//     each joint, a soft glow); the hand is a palm crystal among four finger stones that spread, clench, wrap the gasbag or cradle a boulder; hurt arms crack a boulder (a crater, bright cracks, a flickering tether) at
//     ARM_STAGES; a shelled-off arm snaps its light (a flash, a crystal stub) and the boulders that came off are Rapier bodies; the shoulder keeps its crystal socket
//   - the MARKS (titanFx.js): the boulder's red ring, the gold funnel over the roaring mouth, the island's landing strip and the crystal's ring
//   - DEATH: it kneels (legs shorten, the body leans), the head drops and the jaw hangs, cracks flare, the island and everything on it crumbles into Rapier rocks and dust, and the sim sinks it into the plain
import { THREE, outlineMat, applyLook } from './style.js';
import { config } from '../../config.js';
import { Tinter, Mesher } from './creatureKit.js';
import { paintTitanStone, paintBlank } from './titanPaint.js';
import { buildTitan, buildPieces, JAW_PIVOT, V, M4, stone, rockGeo, hash } from './titanModel.js';
import { addStoneBody, addCut, addBrokenHand, through, HAND } from './titanArms.js';
import { createTitanOverlay } from './titanFx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const FLASH = [2.4, 2.2, 2.2], HIT = [1.7, 1.62, 1.5]; // (a blow on a part this big is a lift, not a white-out: the generic flash is 2.4x)
const TAU = Math.PI * 2;

// ---- what creature.js asks the kind for --------------------------------------------------------------------------------------------------------------------------------------------------------
export const buildTitanBody = (cr, P, o) => buildTitan(cr, P, { ...o, heapZ: P.Z.HEAP });
export const titanSkins = (P) => { const s = paintTitanStone(P); return { head: s.map, headGlow: s.glow, limb: paintBlank('#ffffff'), limbGlow: paintBlank('#000000') }; };
export const titanLimbs = (cr) => cr.parts.filter((p) => p.kind === 'tentacle'); // (the arms are not tubes here: the view makes the tube set empty and hides it)
export const titanTubeOpts = () => ({ rows: [], maxSuckers: 1, stationsFor: () => false });

// ---- the extension: made by creature.js build() ------------------------------------------------------------------------------------------------------------------------------------------------------
export function extendTitan(ctx) {
  const { cr, P, root, parent, link, head, uniforms, headMat, tubes, tint: torsoTint, low, hg, plainOf } = ctx;
  const T = config.CREATURES.TITAN, ZC = P.Z, BZ = ZC.BODY, I = T.ISLAND, TOP = -I.TOP, OW = P.INK || 26;
  const pieces = buildPieces(cr, P, { low, T, Z: ZC });
  const set = pieces.set, rs = pieces.ranges, dims = pieces.arms.dims;
  const pieceMesh = new THREE.Mesh(pieces.geometry, headMat), pieceInk = new THREE.Mesh(pieces.geometry, outlineMat);
  for (const m of [pieceMesh, pieceInk]) m.frustumCulled = false;
  pieceMesh.userData.toon = headMat;
  pieceInk.userData.isOutline = true;
  hg.add(pieceMesh, pieceInk);
  tubes.mesh.visible = tubes.inkMesh.visible = tubes.suckers.visible = false; // (the arms are rigid slabs: the generic tube set stays empty)
  const ptint = new Tinter(pieces.geometry);
  const overlay = createTitanOverlay(parent, P);

  const S = {
    key: -1, tilt: 0, open: 0, kneel: 0, crush: 0, leg: 0, armStage: { N: 0, F: 0 }, cStage: 0, cGone: false, died: false, dieSteps: 0, isleGone: false, treesGone: false, loose: new Set(), shake: 0, wasRoar: false, wasOpen: false, heat: -1,
    gripN: false, gripF: false, deadFrom: 0, feetKey: -1, built: Date.now(), hand: { N: '', F: '' }, cut: { N: false, F: false }, dropped: { N: false, F: false },
  };
  const byId = (id) => cr.parts.find((p) => p.id === id);
  const Pt = () => (link.vfx && link.vfx.P) || null;
  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _im = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = V(), _bv = V(), _bd = V();
  const rotZ = (a) => new THREE.Matrix4().makeRotationZ(a);
  const rotY = (a) => new THREE.Matrix4().makeRotationY(a);
  const trn = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const scl = (x, y, z) => new THREE.Matrix4().makeScale(x, y, z);
  const Z_AX = V(0, 0, 1);

  // ---- loose stone: a rock that becomes a Rapier body (destruction.addExternal) and falls ----
  function spawnRock(x, y, z, size, color, vx, vy, spin, life = 4, seed = 1, glow = 0) {
    const D = link.destruction;
    if (!D || !D.addExternal) return null;
    const m = new Mesher();
    stone(m, rockGeo(size, size * 0.8, size * 0.9, { detail: 0, jitter: 0.25, seed }), null, { ow: OW * 0.5, color, seed, glow });
    const geo = m.build(), holder = new THREE.Group(), mesh = new THREE.Mesh(geo, headMat), ink = new THREE.Mesh(geo, outlineMat);
    mesh.frustumCulled = ink.frustumCulled = false;
    mesh.userData.toon = headMat; ink.userData.isOutline = true;
    holder.add(mesh, ink);
    holder.position.set(x, y, z);
    holder.quaternion.setFromAxisAngle(Z_AX, seed);
    plainOf(mesh);
    applyLook(holder);
    const piece = D.addExternal({ holder, boxes: [{ cx: 0, cy: 0, cz: 0, hx: size * 0.75, hy: size * 0.65, hz: size * 0.7 }], rel: 1.8, mat: 'stone', size: size * 2, vel: [vx, vy], spin, life });
    if (!piece) { geo.dispose(); return null; }
    S.loose.add(piece);
    return piece;
  }
  const rnd = (a) => { S.rs = (Math.imul((S.rs || 7) + a * 977, 0x2c1b3c6d) + 0x7f4a7c15) | 0; return ((S.rs >>> 0) % 10000) / 10000; };
  const colors = () => [P.stone, P.stoneDk, P.stoneLt, P.soil, P.grassDk];

  // ---- the arms: floating stones (titanArms.js) ----
  const FOLD = (a) => { const x = Math.atan2(Math.sin(a), Math.cos(a)); return x > Math.PI / 2 ? x - Math.PI : x <= -Math.PI / 2 ? x + Math.PI : x; }; // (an angle folded into -90..90 degrees: a stone looks the same turned round)
  const lerp = (a, b, u) => a + (b - a) * u;
  const BOBS = [-1, 0, 1, 0]; // the floating bob: a stepped triangle (held 4 keys a step), each stone on its own phase: no sine of time
  const bobOf = (key, tag, j) => BOBS[((key >> 2) + j * 2 + (tag === 'F' ? 1 : 0)) & 3];
  const flickOf = (key, tag, j, on) => (on && hash(key >> 1, j * 5 + (tag === 'F' ? 3 : 0), 11) < 0.45 ? 0.22 : 1); // a hurt boulder's light flickers in held steps (2 keys)
  const armNames = { N: [], F: [] };
  for (const tag of ['N', 'F']) {
    for (let j = 0; j < 3; j++) armNames[tag].push('a' + tag + j + 'a', 'a' + tag + j + 'b', 't' + tag + j);
    armNames[tag].push('j' + tag + '1', 'j' + tag + '2', 'p' + tag, 'c' + tag);
    for (let k = 0; k < 4; k++) armNames[tag].push('h' + tag + k);
    for (let i = 0; i < 4; i++) armNames[tag].push('f' + tag + i + 'a', 'f' + tag + i + 'b');
  }
  const BOB = P.BOB || 22, SHIFT = 260; // (SHIFT: how far back a stone slides in depth where it would cover the face)
  const HEAD_AT = [T.BODY.HEAD.AT[0], -T.BODY.HEAD.AT[1]];
  const avoidHead = (x, y, r) => clamp((560 + 0.5 * r - Math.hypot(x - HEAD_AT[0], y - HEAD_AT[1])) / (0.6 * r + 60), 0, 1); // 1 where a near-arm stone would hide the face: it passes BEHIND the head there
  // o: { bp, bang, key, f, held (the boulder in this hand), gripping, gone, ta (the part's tint), GL (the glows) }
  function placeArm(tag, p, st, o) {
    const { bp, bang, key, f, held, gripping, gone, ta, GL } = o, full = dims[tag];
    const hideArm = () => { for (const nme of armNames[tag]) set.place(nme, null); };
    const P3 = (x, y) => { const q = bp(x, y); return { x: q.x, y: q.y }; };
    const zr0 = tag === 'N' ? ZC.ARM_N : ZC.ARM_F, zr = gripping ? [zr0[0], ZC.GRIP] : zr0, near = tag === 'N';
    const n = p && !p.dead && !gone ? Math.min(3, p.segs.length) : 0;
    const sev = !!(p && (p.severed || p.dead || gone));
    // the shoulder socket: always there (its crystal burns on with no arm)
    if (!p || !p.at) { hideArm(); set.place('k' + tag, null); return; }
    const sock = P3(cr.x + f * p.at[0], cr.y + p.at[1]), a0 = n ? bang(p.segs[0].ang) : 0, zs = zr[0] + (near ? 200 - SHIFT * avoidHead(sock.x, sock.y, 150) : 0);
    set.place('k' + tag, trn(sock.x, sock.y, zs).multiply(rotZ(a0)));
    ptint.set(rs['k' + tag], ta[0], ta[1], ta[2]);
    GL.push([sock.x, sock.y, zs + 60, 340, sev ? 1.0 : 0.6]);
    if (!n) { hideArm(); return; }
    const reach0 = p.reach0 || full.reduce((a, d) => a + d.len, 0) || 1, zAt = (s, x, y) => lerp(zr[0], zr[1], clamp(s / reach0, 0, 1)) - (near ? SHIFT * avoidHead(x, y, 200) : 0);
    // the joints (where the light is) and the segments' angles, in the body's frame
    const J = [], A = [];
    let s = 0;
    for (let j = 0; j < n; j++) { const sg = p.segs[j], q = P3(sg.x, sg.y); J.push({ x: q.x, y: q.y, z: zAt(s, q.x, q.y) }); A.push(bang(sg.ang)); s += sg.len; }
    { const sg = p.segs[n - 1], q = P3(sg.x + Math.cos(sg.ang) * sg.len, sg.y + Math.sin(sg.ang) * sg.len); J.push({ x: q.x, y: q.y, z: zAt(s, q.x, q.y) }); }
    const crackFrom = st >= 2 ? 1 : st === 1 ? 2 : 9;
    const tinted = (nme, fl) => ptint.set(rs[nme], ta[0] * fl, ta[1] * fl, ta[2] * fl);
    for (let j = 0; j < 3; j++) {
      const na = 'a' + tag + j + 'a', nb = 'a' + tag + j + 'b', nt = 't' + tag + j;
      if (j >= n) { set.place(na, null); set.place(nb, null); set.place(nt, null); continue; }
      const cracked = j >= crackFrom, fl = flickOf(key, tag, j, cracked), a = J[j], b = J[j + 1], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, mz = (a.z + b.z) / 2;
      set.place(cracked ? na : nb, null);
      set.place(cracked ? nb : na, trn(mx, my + bobOf(key, tag, j) * BOB, mz).multiply(rotZ(0.4 * FOLD(A[j]))));
      tinted(na, 1); tinted(nb, 1);
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d2 = Math.hypot(dx, dy), d3 = Math.hypot(d2, dz), L = full[j].len;
      set.place(nt, trn(a.x, a.y, a.z).multiply(rotZ(Math.atan2(dy, dx))).multiply(rotY(-Math.atan2(dz, Math.max(1, d2)))).multiply(scl(d3 / L, 1, 1)));
      tinted(nt, fl);
    }
    // the joints: a crystal diamond with shards orbiting it, and a soft glow
    const th = (k) => key * 0.5 * (k % 2 ? 1 : -1) + k * 1.3 + (tag === 'F' ? 0.8 : 0);
    for (let k = 1; k <= 2; k++) {
      const nn = 'j' + tag + k;
      if (k < n) {
        const q = J[k], fl = flickOf(key, tag, k - 1, k - 1 >= crackFrom || k >= crackFrom);
        set.place(nn, trn(q.x, q.y, q.z).multiply(rotZ(A[k - 1]))); tinted(nn, fl);
        GL.push([q.x, q.y, q.z + 40, 300, 0.5 * fl]);
      } else set.place(nn, null);
    }
    for (let k = 0; k < 4; k++) {
      const nm = 'h' + tag + k;
      if (k === 3) continue; // (the palm's shards: below)
      if (k < n) { const q = k === 0 ? { x: sock.x, y: sock.y, z: zs } : J[k]; set.place(nm, trn(q.x, q.y, q.z).multiply(rotZ(a0 * (k === 0 ? 1 : 0) + (k ? A[k - 1] : 0))).multiply(new THREE.Matrix4().makeRotationX(th(k)))); tinted(nm, k === 0 ? 1 : flickOf(key, tag, k - 1, k >= crackFrom)); } else set.place(nm, null);
    }
    // the hand (or, for a shot-off arm, the stump with its snapped light)
    const End = J[n], zE = End.z, r = full[2].r1, nmP = 'p' + tag;
    for (let i = 0; i < 4; i++) { set.place('f' + tag + i + 'a', null); set.place('f' + tag + i + 'b', null); }
    if (p.severed || n < 3) {
      set.place(nmP, null); set.place('h' + tag + '3', null);
      set.place('c' + tag, trn(End.x, End.y + bobOf(key, tag, 3) * BOB * 0.5, End.z).multiply(rotZ(A[n - 1])));
      tinted('c' + tag, flickOf(key, tag, 5, true));
      GL.push([End.x, End.y, End.z + 40, 360, 0.6 * flickOf(key, tag, 5, true)]);
      S.hand[tag] = 'stump';
      return;
    }
    set.place('c' + tag, null);
    const ah = A[2], flip = Math.cos(ah) < 0 ? -1 : 1, H = trn(End.x, End.y, zE).multiply(rotZ(ah)).multiply(scl(1, flip, 1)), mode = p.ctl ? p.ctl.mode : 'idle';
    const pose = gripping ? 'grip' : held ? 'cradle' : st >= 2 ? 'broken' : mode === 'wind' ? 'fist' : mode === 'strike' || mode === 'seize' ? 'open' : 'relaxed', brk = pose === 'broken';
    S.hand[tag] = pose;
    const flH = flickOf(key, tag, 4, st >= 2), pulse = ((key >> 1) & 1) ? 1.1 : 1, hb = bobOf(key, tag, 3) * BOB * 0.5;
    let palmAt;
    if (pose === 'cradle') {
      const bc = P3(held.x, held.y), R = held.r || T.BOULDER.R, kk = R / 300;
      for (let i = 0; i < 4; i++) {
        const q = [-1.3, -0.62, 0.62, 1.3][i], M = trn(bc.x + R * 1.0 * Math.sin(q), bc.y - R * 1.0 * Math.cos(q) + hb * (i % 2 ? 1 : -1), zE + (i % 2 ? 0.3 : -0.25) * R).multiply(rotZ(q)).multiply(scl(1.25 * kk, 1.25 * kk, 1.25 * kk));
        set.place('f' + tag + i + 'a', M);
      }
      palmAt = trn(bc.x, bc.y - 0.95 * R, zE + 30).multiply(rotZ(Math.PI / 2)).multiply(scl(pulse * kk, pulse * kk, pulse * kk));
    } else {
      const arr = HAND[pose];
      for (let i = 0; i < 4; i++) {
        if (brk && i >= 2) continue;
        const [x, y, z, phi, sc] = arr[i], M = H.clone().multiply(trn(x * r, y * r + hb * (i % 2 ? 1 : -1), z * r)).multiply(rotZ(phi)).multiply(scl(sc, sc, sc));
        set.place('f' + tag + i + (brk ? 'b' : 'a'), M);
      }
      palmAt = H.clone().multiply(trn(HAND.PALM * r, 0, 0)).multiply(scl(pulse * (brk ? 0.85 : 1), pulse * (brk ? 0.85 : 1), pulse * (brk ? 0.85 : 1)));
    }
    set.place(nmP, palmAt);
    for (let i = 0; i < 4; i++) { tinted('f' + tag + i + 'a', 1); tinted('f' + tag + i + 'b', 1); }
    tinted(nmP, flH);
    // the palm's shards orbit the wrist axis
    const pe = new THREE.Vector3().setFromMatrixPosition(palmAt);
    set.place('h' + tag + '3', trn(pe.x, pe.y, pe.z).multiply(rotZ(pose === 'cradle' ? Math.PI / 2 : ah)).multiply(new THREE.Matrix4().makeRotationX(th(3)))); tinted('h' + tag + '3', flH);
    GL.push([pe.x, pe.y, pe.z + 50, 430, 0.65 * flH]);
  }

  // a whole boulder of an arm as a Rapier body (it falls when the Titan dies): at world (x, y, z), turned by ang
  function spawnBoulder(x, y, z, d, ang, vx, vy, spin, seed, life) {
    const D = link.destruction;
    if (!D || !D.addExternal || S.loose.size > 40) return null;
    const m = new Mesher();
    addStoneBody(m, P, OW, d.rx, d.ry, d.rz, 'x', seed, { cracked: true });
    const geo = m.build(), holder = new THREE.Group(), mesh = new THREE.Mesh(geo, headMat), ink = new THREE.Mesh(geo, outlineMat);
    mesh.frustumCulled = ink.frustumCulled = false;
    mesh.userData.toon = headMat; ink.userData.isOutline = true;
    holder.add(mesh, ink);
    holder.position.set(x, y, z);
    holder.quaternion.setFromAxisAngle(Z_AX, ang);
    plainOf(mesh);
    applyLook(holder);
    const piece = D.addExternal({ holder, boxes: [{ cx: 0, cy: 0, cz: 0, hx: d.rx * 0.8, hy: d.ry * 0.8, hz: d.rz * 0.78 }], rel: 1.8, mat: 'stone', size: d.rx * 1.6, vel: [vx, vy], spin, life });
    if (!piece) { geo.dispose(); return null; }
    S.loose.add(piece);
    return piece;
  }
  // the Titan is dying: the light holding an arm together goes out, and its boulders drop
  function dropArm(tag, p) {
    S.dropped[tag] = true;
    const Ptc = Pt(), zr = tag === 'N' ? ZC.ARM_N : ZC.ARM_F;
    p.segs.slice(0, 3).forEach((sg, j) => {
      const d = dims[tag][j];
      if (!d) return;
      const c = Math.cos(sg.ang), s = Math.sin(sg.ang), mx = sg.x + c * sg.len / 2, my = sg.y + s * sg.len / 2, z = BZ + lerp(zr[0], zr[1], (j + 0.5) / 3);
      spawnBoulder(mx, -my, z, d, -sg.ang * 0.4, (j - 1) * 150, 100 + j * 70, (j - 1) * 1.6, 600 + j + (tag === 'F' ? 20 : 0), 5);
      if (Ptc) { Ptc.flash(sg.x, -sg.y, z + 250, 900, '#d9fcff', { hdr: 2.0, alpha: 0.85, life: 0.22 }); Ptc.burst('spark', sg.x, -sg.y, z + 250, 12, { speed: [200, 900], size: [6, 10], life: [0.4, 0.9], color: '#bff6ff', noRate: true }); }
    });
  }

  const ext = {
    pieces, set, S, overlay, dims, ptint,
    ownsLimbs: true,
    zBody: () => BZ + 240,
    hide() { overlay.hide(); },
    reset() { overlay.hide(); },
    update(Fr) {
      const { R, night, dt, t, state, dying } = Fr, tintOf = (p) => (p && p.hit > 0 ? HIT : Fr.tintOf(p)), f = cr.f < 0 ? -1 : 1, tt = cr.titan || {}, key = Math.floor(t * 8 + 1e-6), kNew = key !== S.key, Ptc = Pt();
      S.key = key;
      const k = R.hg.scale.z || 1, inv = Math.abs(k - 1) > 1e-6 ? scl(1 / k, 1 / k, 1 / k) : null, sk = dying ? clamp(cr.sinkT || 0, 0, 99) : 0, phase3 = (cr.phase || 1) >= 3;
      const torso = byId('torso'), headP = byId('head'), mouthP = byId('mouth'), crystal = byId('crystal'), armN = byId('armN'), armF = byId('armF');
      if (kNew && S.loose.size) { const D = link.destruction; if (D && D.pieces) for (const p of S.loose) if (!D.pieces.includes(p)) S.loose.delete(p); } // (the stones that have lived their life are forgotten)
      // ---- the body group: depth behind the plain's face, and the kneeling lean ----
      if (kNew) S.kneel += clamp((dying ? clamp(sk / 3, 0, 1) : 0) - S.kneel, -0.125, 0.125);
      R.hg.position.z = BZ;
      R.hg.rotation.z = -f * 0.11 * S.kneel;
      // ... and the crumble: in its last seconds it is squashed toward the plain in held steps, a heap of stone going under (the group is scaled about the plain's level)
      if (kNew) S.crush += clamp((dying ? clamp((sk - 4) / 5, 0, 1) : 0) - S.crush, -0.1, 0.1);
      const sy = 1 - 0.85 * S.crush;
      if (sy < 1) { const fl = tt.floorY != null ? -tt.floorY : -cr.y - 2200; R.hg.position.y = fl + (R.hg.position.y - fl) * sy; R.hg.scale.set(f * k, k * sy, k * (1 + 0.12 * S.crush)); }
      // the sim's points (world px) into the body group's frame, through the group's own matrix: breath, crumble, lean and the mirror are all in it
      R.hg.updateMatrix();
      _im.copy(R.hg.matrix).invert();
      const bp = (wx, wy) => _bv.set(wx, -wy, BZ).applyMatrix4(_im), bang = (a) => { _bd.set(Math.cos(a), -Math.sin(a), 0).transformDirection(_im); return Math.atan2(_bd.y, _bd.x); };
      // ---- tints: the sim's lit / dim / hit flash per part ----
      const tm = tintOf(torso), th = tintOf(headP), tj = tintOf(mouthP);
      for (const nme of ['legN', 'legF', 'isle', 'treeA', 'treeB', 'ruin', 'boulder0', 'boulder1', 'boulder2']) ptint.set(rs[nme], tm[0], tm[1], tm[2]);
      ptint.set(rs.head, th[0], th[1], th[2]);
      ptint.set(rs.jaw, tj[0], tj[1], tj[2]);
      const tc = crystal && crystal.hit > 0 ? FLASH : [1, 1, 1];
      for (let s = 0; s < 4; s++) ptint.set(rs['crys' + s], tc[0], tc[1], tc[2]);
      // ---- the glows: eyes (1), the open throat (2), the veins and crystal (3), the heartstone (4) ----
      const G = P.EYE_GLOW, roar = tt.pose === 'roar' || !!tt.roar || !!cr.mouthWin;
      let eye = G.base * (roar ? 1.5 : 1) * (phase3 ? 1.2 : 1);
      if (dying) eye *= 1 - clamp(sk / 3, 0, 1);
      if (kNew) { const tg = dying ? 0.7 : mouthP ? clamp(mouthP.openAmt || 0, 0, 1) : 0, d = tg - S.open; S.open += Math.abs(d) < 0.17 ? d : Math.sign(d) * 0.34; S.open = Math.round(clamp(S.open, 0, 1) * 6) / 6; }
      const throat = P.THROAT_GLOW.shut + (P.THROAT_GLOW.open - P.THROAT_GLOW.shut) * clamp(S.open / 0.7, 0, 1);
      const flare = dying ? 1 + 1.2 * clamp(1 - sk / 3, 0, 1) : 1; // (the cracks flare as it falls apart)
      uniforms.uGlow.value.set(eye, throat, P.VEIN_GLOW * flare, P.HEART_GLOW[key & 1] * flare);
      let heat = P.VEIN_EMISSIVE * (phase3 ? 1.6 : 1) * (dying ? 1 + 2.2 * clamp(1 - sk / 4, 0, 1) : 1);
      heat = Math.round(heat * 16) / 16;
      if (heat !== S.heat) { S.heat = heat; headMat.emissiveIntensity = heat; }
      // ---- the head: tips back in held steps for the roar, droops when it dies; the jaw drops in sixths ----
      if (kNew) { const tg = dying ? -0.34 * clamp(sk / 2.5, 0, 1) : roar && !(mouthP && mouthP.openAmt < 0.02 && !cr.mouthWin && !tt.roar) ? P.HEAD_TILT : 0; S.tilt += clamp(tg - S.tilt, -0.09, 0.09); }
      const HA = T.BODY.HEAD.AT, Mh = trn(HA[0], -HA[1], ZC.HEAD).multiply(rotZ(S.tilt));
      if (headP && !headP.dead) {
        set.place('head', Mh);
        const Mj = Mh.clone().multiply(trn(JAW_PIVOT.x, JAW_PIVOT.y, 0)).multiply(rotZ(-S.open * 0.95)).multiply(trn(-JAW_PIVOT.x, -JAW_PIVOT.y, 0));
        set.place('jaw', Mj);
      } else { set.place('head', null); set.place('jaw', null); }
      // ---- the legs: they swap and lift on the sim's key while it walks; they shorten when it kneels ----
      const walking = !!tt.walking && !dying, leg = tt.leg ? 1 : 0, LG = T.BODY.LEGS;
      [['legN', LG.AT[0], 170, 1], ['legF', LG.AT[1], -170, 0]].forEach(([nme, lx, lz, isN]) => {
        const lifted = walking && (isN ? leg === 1 : leg === 0), swing = walking ? (lifted ? 0.1 : -0.05) : 0;
        const kn = 1 - 0.3 * S.kneel;
        const M = trn(lx, lifted ? LG.LIFT : 0, lz).multiply(trn(0, -2200, 0)).multiply(scl(1 + 0.1 * S.kneel, kn, 1 + 0.1 * S.kneel)).multiply(trn(0, 2200, 0)).multiply(trn(0, -380, 0)).multiply(rotZ(swing)).multiply(trn(0, 380, 0));
        set.place(nme, inv ? inv.clone().multiply(M) : M);
      });
      if (walking && leg !== S.leg && S.feetKey !== key) { // a foot comes down: dust and a ring
        S.feetKey = key;
        const landing = leg === 1 ? 'legF' : 'legN', lx = landing === 'legN' ? LG.AT[0] : LG.AT[1];
        if (Ptc && tt.floorY != null) { const wx = cr.x + f * (lx + 250), wy = -tt.floorY; Ptc.burst('dust', wx, wy + 40, BZ + 100, 7, { dir: Math.PI / 2, spread: 1.5, speed: [120, 520], up: [30, 140], size: [110, 220], size1: 2.2, life: [0.9, 1.6], color: '#b9a888', alpha: 0.55, area: 420 }); Ptc.ring(wx, wy + 30, BZ + 100, 1100, '#d9cbb0', 0.45); }
      }
      S.leg = leg;
      // ---- the arms ----
      const heldBy = (p) => (cr.boulders || []).find((b) => b && b.mode === 'held' && b.arm === p && fin(b.x) && fin(b.y)) || null;
      const gripping = (p) => (cr.grips || []).some((g) => g && g.limb === p && (g.mode === 'hold' || g.mode === 'seize'));
      const GL = []; // (the soft glows of the arms' light this frame, in the body's frame: x, y, z, radius, strength)
      for (const [tag, p] of [['N', armN], ['F', armF]]) {
        const frac = p ? p.hp / Math.max(1, p.maxHp) : 0, st = p && p.severed ? 2 : frac <= P.ARM_STAGES[1] ? 2 : frac <= P.ARM_STAGES[0] ? 1 : 0;
        if (p && !p.dead && st > S.armStage[tag] && S.loose.size < 40) { // it cracks: stone chips off the slab that took the blow
          const sg = p.segs[Math.min(p.segs.length - 1, st === 1 ? 2 : 1)];
          if (sg) {
            const cx = sg.x + Math.cos(sg.ang) * sg.len * 0.5, cy = sg.y + Math.sin(sg.ang) * sg.len * 0.5, z = BZ + (tag === 'N' ? ZC.ARM_N[1] : ZC.ARM_F[1]) * 0.8;
            for (let c = 0; c < P.CHUNKS; c++) spawnRock(cx + (c - 1) * 160, -cy + 60 * c, z, 70 + 40 * c, c % 2 ? P.stoneDk : P.stone, (c - 1) * 260 + 60, 260 + 120 * c, (c - 1) * 3, 3, 300 + c + st * 7);
            if (Ptc) { Ptc.burst('dust', cx, -cy, z, 12, { speed: [100, 500], up: [20, 200], size: [90, 190], size1: 2.2, life: [0.7, 1.3], color: '#cdbf9f', alpha: 0.6, area: 300 }); Ptc.burst('spark', cx, -cy, z + 60, 10, { speed: [200, 800], size: [6, 10], life: [0.3, 0.7], color: '#bff6ff', noRate: true }); }
          }
        }
        S.armStage[tag] = Math.max(S.armStage[tag], st);
        if (p && p.severed && !S.cut[tag]) { // the light snaps: a flash, a ring, sparks and a burst of crystal at the cut
          S.cut[tag] = true;
          const sg = p.segs[p.segs.length - 1];
          if (Ptc && sg) { const ex = sg.x + Math.cos(sg.ang) * sg.len, ey = sg.y + Math.sin(sg.ang) * sg.len, z = BZ + (tag === 'N' ? ZC.ARM_N[0] + 200 : ZC.ARM_F[1]); Ptc.flash(ex, -ey, z + 120, 1100, '#d9fcff', { hdr: 2.6, alpha: 0.95, life: 0.28 }); Ptc.ring(ex, -ey, z + 120, 900, '#7fe8ff', 0.5); Ptc.burst('spark', ex, -ey, z + 120, 34, { speed: [300, 1300], size: [6, 11], life: [0.4, 1.0], color: '#bff6ff', noRate: true }); }
        }
        if (p && !p.severed && !p.dead) S.cut[tag] = false;
        if (dying && p && !p.dead && !S.dropped[tag] && sk >= 0.3) dropArm(tag, p);
        const gone = !!(dying && p && S.dropped[tag]);
        placeArm(tag, p, dying ? 2 : st, { bp, bang, key, f, held: p ? heldBy(p) : null, gripping: p ? gripping(p) : false, gone, ta: tintOf(p), GL });
      }
      // ---- the boulders: held in a fist or flying: spin in held steps ----
      const bl = (cr.boulders || []).filter((b) => b && b.mode !== 'gone');
      for (let i = 0; i < 3; i++) {
        const b = bl[i], nme = 'boulder' + i;
        if (!b || !fin(b.x) || !fin(b.y)) { set.place(nme, null); continue; }
        const arm = b.arm, zr = arm && arm.id === 'armF' ? ZC.ARM_F : ZC.ARM_N, zh = zr[1];
        const zb = b.mode === 'fly' ? zh + (-BZ - zh) * clamp((b.t || 0) / Math.max(0.5, b.T || 3), 0, 1) : zh, step = Math.PI / 8, rot = Math.round((b.rot || 0) / step) * step, s = (b.r || T.BOULDER.R) / T.BOULDER.R;
        _q.setFromAxisAngle(Z_AX, rot);
        const qa = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), rot * 0.6);
        const qb = bp(b.x, b.y);
        set.place(nme, new THREE.Matrix4().compose(V(qb.x, qb.y, zb), _q.multiply(qa), V(s, s, s)));
      }
      // ---- the island and the crystal ----
      const quake = tt.tremor > 0 && !dying ? ((key & 1) ? 16 : -16) : 0;
      const frac = crystal ? crystal.hp / Math.max(1, crystal.maxHp) : 1, cs = P.STAGES, stage = crystal && (crystal.dead || crystal.hp <= 0) ? 4 : frac > cs[0] ? 0 : frac > cs[1] ? 1 : frac > cs[2] ? 2 : 3;
      if (stage > S.cStage && Ptc) { // a stroke: the crystal cracks: sparks, a ring, dust
        const wx = cr.x + f * T.CRYSTAL.X, wy = -(cr.y + I.TOP) + 300;
        Ptc.flash(wx, wy, BZ + ZC.CRYSTAL + 80, 900, '#bff6ff', { hdr: 2.2, alpha: 0.9, life: 0.2 });
        Ptc.ring(wx, wy, BZ + ZC.CRYSTAL + 80, 1300, '#7fe8ff', 0.45);
        Ptc.burst('spark', wx, wy, BZ + ZC.CRYSTAL + 80, stage >= 4 ? 40 : 18, { speed: [200, 1100], size: [6, 10], life: [0.4, 0.9], color: '#bff6ff', noRate: true });
        Ptc.burst('dust', wx, wy - 200, BZ + ZC.CRYSTAL, 8, { dir: Math.PI / 2, spread: 1.4, speed: [100, 400], up: [30, 200], size: [90, 190], size1: 2.2, life: [0.8, 1.4], color: '#cdbf9f', alpha: 0.5, area: 500 });
        if (stage >= 4) for (let c = 0; c < 4; c++) spawnRock(wx + (c - 1.5) * 90, wy - 100, BZ + ZC.CRYSTAL, 55 + 20 * c, P.crystalDk, (c - 1.5) * 330, 500 + 140 * c, (c - 1.5) * 4, 3, 500 + c);
      }
      S.cStage = Math.max(S.cStage, stage);
      // the death: it falls apart. Stage by sinkT (held in steps of the key): quake, then the trees and ruin and crystal fall, then the island breaks up
      const isleOn = !(dying && sk >= 1.1), treesOn = !(dying && sk >= 0.45), jit = dying && sk < 1.1 ? ((key & 1) ? 22 : -22) : 0;
      if (dying) {
        if (!S.died) {
          S.died = true;
          if (Ptc) { Ptc.flash(cr.x, -cr.y + 900, BZ + 300, 4200, '#ffffff', { hdr: 2.2, alpha: 0.85, life: 0.3 }); Ptc.ring(cr.x, -cr.y + 400, BZ + 300, 4600, '#e9dcc0', 0.8); Ptc.burst('dust', cr.x, -cr.y + 900, BZ + 300, 26, { dir: Math.PI / 2, spread: 1.6, speed: [200, 1200], up: [100, 500], size: [200, 420], size1: 2.4, life: [1.4, 2.6], color: '#cdbf9f', alpha: 0.6, area: 1500, noRate: true }); }
        }
        const cc = colors();
        if (!S.treesGone && sk >= 0.45) {
          S.treesGone = true;
          const top = -cr.y - I.TOP;
          for (const [dx, sz, c] of [[I.X0 + 420, 210, P.leafDk], [I.X1 - 380, 180, P.leaf], [(I.X0 + I.X1) / 2 + 450, 130, P.ruin], [(I.X0 + I.X1) / 2, 160, P.crystalDk]]) spawnRock(cr.x + f * dx, top + 280, BZ + 100, sz, c, f * (dx > -1000 ? 160 : -160) + (rnd(dx) - 0.5) * 400, 250 + rnd(sz) * 300, (rnd(dx) - 0.5) * 6, 4.5, Math.round(dx));
          if (Ptc) Ptc.burst('dust', cr.x + f * (I.X0 + I.X1) / 2, top + 100, BZ + 100, 22, { dir: Math.PI / 2, spread: 1.6, speed: [200, 900], up: [60, 300], size: [200, 380], size1: 2.4, life: [1.2, 2.2], color: '#a8c88a', alpha: 0.5, area: 1300, noRate: true });
        }
        if (!S.isleGone && sk >= 1.1) {
          S.isleGone = true;
          const top = -cr.y - I.TOP;
          for (let c = 0; c < 9; c++) { const dx = I.X0 + 150 + c * ((I.X1 - I.X0 - 300) / 8); spawnRock(cr.x + f * dx, top - 200 - (c % 3) * 160, BZ + 200 - (c % 2) * 300, 200 + rnd(c) * 170, cc[c % cc.length], (rnd(c + 40) - 0.5) * 700, 80 + rnd(c + 80) * 400, (rnd(c + 9) - 0.5) * 6, 5, 700 + c); }
          if (Ptc) { Ptc.flash(cr.x + f * (I.X0 + I.X1) / 2, top - 300, BZ + 300, 3600, '#fff4d0', { hdr: 1.8, alpha: 0.8, life: 0.3 }); Ptc.burst('dust', cr.x + f * (I.X0 + I.X1) / 2, top - 300, BZ + 300, 34, { dir: Math.PI / 2, spread: 1.7, speed: [200, 1100], up: [60, 300], size: [220, 460], size1: 2.4, life: [1.4, 2.6], color: '#cdbf9f', alpha: 0.55, area: 1600, noRate: true }); }
        }
        if (kNew && Ptc && sk < 7 && tt.floorY != null) Ptc.burst('dust', cr.x + (rnd(key) - 0.5) * 1800, -tt.floorY + 80, BZ + 150, 3, { dir: Math.PI / 2, spread: 1.4, speed: [100, 500], up: [30, 160], size: [150, 300], size1: 2.3, life: [1.0, 1.8], color: '#b9a888', alpha: 0.5, area: 600, noRate: true }); // (the body grinds into the plain)
        if (S.dieSteps < 2 && (sk >= 1.0 + S.dieSteps * 1.2)) { // stones fall off the body
          S.dieSteps++;
          for (let c = 0; c < 4; c++) spawnRock(cr.x + (rnd(c + S.dieSteps * 5) - 0.5) * 1600, -cr.y + 900 - c * 250, BZ + 120, 130 + rnd(c) * 110, cc[c % cc.length], (rnd(c + 3) - 0.5) * 500, 60 + rnd(c + 6) * 250, (rnd(c + 1) - 0.5) * 6, 4.5, 800 + c + S.dieSteps * 10);
        }
      }
      // the island pieces (a still picture in the body's frame; the quake of a crystal stroke shakes the crystal only)
      // (the island, its trees, ruin and crystal, like the legs, are not breathed on: the body group's held breath would lift the walking top a few px off the sim's island deck. inv takes the group's scale off them)
      const ident = inv ? inv.clone() : new THREE.Matrix4(), W = (m) => (inv ? inv.clone().multiply(m) : m);
      if (isleOn) { set.place('isle', jit ? W(trn(0, jit, 0)) : ident); set.place('ruin', treesOn ? ident : null); } else { set.place('isle', null); set.place('ruin', null); }
      set.place('treeA', isleOn && treesOn ? ident : null);
      set.place('treeB', isleOn && treesOn ? ident : null);
      for (let s = 0; s < 4; s++) set.place('crys' + s, isleOn && treesOn && stage < 4 && s === stage ? W(trn(T.CRYSTAL.X + quake, TOP + jit, ZC.CRYSTAL)) : null);
      // ---- the marks: the boulder's rings, the funnel, the landing strip, the crystal's ring ----
      overlay.begin(key);
      { // the soft glow of the floating stones' light (the heartstone too): fades as the body goes under
        const gk = dying ? 1 - clamp((sk - 2) / 2.5, 0, 1) : 1;
        if (gk > 0.02) {
          GL.push([330, 960, 420, 600, 0.3 * (1 + (key & 1) * 0.4)]);
          for (const g of GL) { _bv.set(g[0], g[1], g[2]).applyMatrix4(R.hg.matrix); overlay.glow(_bv.x, _bv.y, _bv.z, g[3] * k, g[4] * gk); }
        }
      }
      if (!dying) {
        for (const rg of tt.rings || []) if (rg && fin(rg.x) && fin(rg.y)) overlay.ring(rg.x, -rg.y, 420, rg.r || 500, !!rg.locked);
        if (mouthP && mouthP.segs[0] && (cr.mouthWin || tt.roar)) { const m = mouthP.segs[0], M = T.MOUTH; overlay.funnel(m.x, -m.y, 380, M.FUNNEL_W, M.FUNNEL_UP, !!cr.mouthWin, Math.floor(cr.age * 4) % 2); }
        const isl = state.away && state.away.island;
        if (isl && fin(isl.x0) && fin(isl.x1) && fin(isl.y)) {
          overlay.strip(isl.x0 + 60, isl.x1 - 60, -isl.y + 14, 380);
          if (crystal && !crystal.dead && crystal.hp > 0) overlay.crystalRing(cr.x + f * T.CRYSTAL.X, -(cr.y + I.TOP - 120), 420, T.CRYSTAL.REACH, crystal.job ? clamp(crystal.job.prog || 0, 0, 1) : 0);
        }
      }
      overlay.end();
      // ---- the roar: a ring and dust leave the mouth as it opens ----
      const openNow = S.open >= 0.5 && !dying;
      if (openNow && !S.wasOpen && Ptc && mouthP && mouthP.segs[0]) { const m = mouthP.segs[0]; Ptc.ring(m.x, -m.y, BZ + 500, 1500, '#e9dcc0', 0.5); Ptc.burst('dust', m.x, -m.y, BZ + 500, 10, { dir: f > 0 ? 0 : Math.PI, spread: 0.7, speed: [300, 1100], size: [90, 190], size1: 2.2, life: [0.8, 1.4], color: '#e9dcc0', alpha: 0.5, area: 200, noRate: true }); }
      S.wasOpen = openNow;
      void night; void dt;
    },
    // a shelled-off arm: its slabs fall as Rapier bodies (one each, with the hand on the last), tumbling as the sim's chunk does
    makeChunk(c) {
      const D = link.destruction, part = c.part, segs = part && part.segs;
      if (!D || !D.addExternal || !segs || !segs.length) return null;
      const tag = part.side < 0 ? 'N' : 'F', full = dims[tag], i0 = Math.max(0, full.length - segs.length), zr = tag === 'N' ? ZC.ARM_N : ZC.ARM_F;
      const total = full.reduce((a, d) => a + d.len, 0) || 1;
      let off = 0;
      for (let j = 0; j < i0; j++) off += full[j].len;
      const ca = Math.cos(c.a || 0), sa = Math.sin(c.a || 0), made = [];
      segs.forEach((s, j) => {
        const L = s.len, ang = s.ang + (c.a || 0), sx = c.cx + s.x * ca - s.y * sa, sy = c.cy + s.x * sa + s.y * ca, mx = sx + Math.cos(ang) * L / 2, my = sy + Math.sin(ang) * L / 2;
        const z = BZ + zr[0] + (zr[1] - zr[0]) * ((off + L / 2) / total);
        off += L;
        const m = new Mesher();
        const d = full[Math.min(full.length - 1, i0 + j)];
        addStoneBody(m, P, OW, d.rx, d.ry, d.rz, 'slab', 400 + j, { cracked: true });
        addCut(through(m, M4(V(-d.rx * 0.9, 0, 0), new THREE.Quaternion().setFromAxisAngle(Z_AX, Math.PI))), P, OW, 150, 'slab', 430 + j); // the snapped light sticks out of the broken end
        if (j === segs.length - 1) addBrokenHand(m, P, OW, s.r1, L / 2, 'slab', 460);
        const geo = m.build(), holder = new THREE.Group(), mesh = new THREE.Mesh(geo, headMat), ink = new THREE.Mesh(geo, outlineMat);
        mesh.frustumCulled = ink.frustumCulled = false;
        mesh.userData.toon = headMat; ink.userData.isOutline = true;
        holder.add(mesh, ink);
        holder.position.set(mx, -my, z);
        holder.quaternion.setFromAxisAngle(Z_AX, -ang);
        plainOf(mesh);
        applyLook(holder);
        const boxes = [{ cx: 0, cy: 0, cz: 0, hx: d.rx * 0.8, hy: d.ry * 0.8, hz: d.rz * 0.78 }];
        const piece = D.addExternal({ holder, boxes, rel: 1.8, mat: 'stone', size: L * 0.6, vel: [(c.vx || 0) + (j - 1) * 140, -(c.vy || 0) + j * 60], spin: -(c.w || 0) + (j - 1) * 0.8, life: Math.max(0.3, config.CREATURES.CHUNK.LIFE - (c.t || 0)) });
        if (!piece) { geo.dispose(); return; }
        made.push({ holder, piece, geo });
      });
      if (!made.length) return null;
      const first = made[0], rest = made.slice(1);
      return { holder: first.holder, piece: first.piece, geo: first.geo, born: c.t || 0, extra: { dispose() { for (const e of rest) if (D.removeExternal) D.removeExternal(e.piece); } } };
    },
    dispose() {
      hg.remove(pieceMesh, pieceInk);
      pieces.geometry.dispose();
      overlay.dispose();
      const D = link.destruction;
      if (D && D.removeExternal) for (const p of S.loose) D.removeExternal(p);
      S.loose.clear();
    },
  };
  void TAU; void M4; void _m; void _m2; void _v;
  return ext;
}
