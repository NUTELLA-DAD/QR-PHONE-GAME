// THE MYCELIAL MOTHER IN 3D (3D.md section 41). creature.js is the generic creature view and KINDS.mother plugs this in; the models are motherModel.js (the cap, the gill skirt, the stem and roots, the furry face, the compound eyes, the
// antennae, the spore heart's pod) and motherWings.js (the four poses of her furry wings), the paintings motherPaint.js and the marks motherFx.js. What this file does is put the model where the SIMULATION says her parts are, every
// frame, and never move a thing by itself (no sine of time, no wobble: the wings change pose on the sim's 8 a second beat key, the cap swells in three held steps, the lamp's reveal fades in three held steps, the spore heart
// opens in three, the fire flickers on the key):
//   - the BODY: one mesh (+ its ink shell) in the cap's own frame, placed at the sim's cap; a RigidSet re-places the few pieces that move (the cap and skirt when she puffs, the wings, the petals, the stem when she falls)
//   - THE DARK (the fight's heart): the Fungal Depths are pitch dark. A part nobody's lamp holds is a very dim silhouette with only its bioluminescence showing (the glowing spots, the gill hem, the eyes at a low glow, the roots,
//     the dots on the tendrils); a part the sim calls lit (part.lit: a beam holds it) fades up in three held steps to its full colour, the eyes blaze, and the toon shader's beam cone (style.js, the lamp's real cone) lights what it covers
//   - the TENDRILS: the generic tube kit (creatureTube.js): five long fungal tubes with painted glowing dots, glowing nodules, a gold bud at the tip; they grow, hold the deck ends (the coil's own depth path, as the Kraken's),
//     burn (the fire runs along the segments the sim says burn: flames, embers and smoke on the key, a hot colour on a burning segment, char on a burnt-out one, a halo) and, cut off, tumble as Rapier bodies (the generic chunks)
//   - the SPORES: the cap puffs up (a stepped swelling and spore vents at the gill hem) then a cloud falls on the ship (a sheet of puffs and falling spores, a red dashed ring where it lands), a flame burns it off in a gold flash
//   - the WING BEAT: the wings spread (half open, then fully, with a side telegraph of dashed chevrons), then beat (a stepped downstroke, chevrons blowing, a wave of spores and dust across the ship)
//   - PHASE 3: the spore heart's pod opens in three steps (five petals fold back, the pink heart glows and pulses on the key) with a dashed ring for the boarders
//   - DAMAGE AND DEATH: a put-out eye goes dark and cracked (a puff and a flash), she wilts (greys, the cap shrinks, the wings fold) and falls from the roof as the sim sinks her 1400 px, the stem stretching and snapping
import { THREE, outlineMat, gradientMap, rimify } from './style.js';
import { config } from '../../config.js';
import { Tinter } from './creatureKit.js';
import { paintMotherAtlas, paintTendrilSkin } from './motherPaint.js';
import { buildMotherBody as buildBody, buildMotherPieces, podFrame, POD, headZ, V } from './motherModel.js';
import { createMotherMarks } from './motherFx.js';
import { toWorldX, toWorldY } from '../host/pose.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const FLASH = [2.4, 2.2, 2.2], WHITE = [1, 1, 1];
const Z_AX = V(0, 0, 1), Y_AX = V(0, 1, 0);
const PETAL_ANG = [2.25, 1.6, 0.9, 0.12], ORB_SCALE = [0, 0.4, 0.75, 1]; // (the pod's three opening steps: how far a petal is folded back, how big the heart shows)

// ---- what creature.js asks the kind for --------------------------------------------------------------------------------------------------------------------------------------------------------
export const buildMotherBody = (cr, P, o) => buildBody(cr, P, o);
export const motherSkins = (P) => { const a = paintMotherAtlas(P), s = paintTendrilSkin(P); return { head: a.map, headGlow: a.glow, limb: s.map, limbGlow: s.glow }; };
export const motherLimbs = (cr) => cr.parts.filter((p) => p.kind === 'tentacle');
// the tube kit's "suckers" are her glowing nodules: small bulbs on the viewer's side of each tendril, one row down the viewer's side, alternately pale lime and teal
export const motherTubeOpts = (P) => {
  const cup = new THREE.SphereGeometry(1, 7, 4);
  cup.scale(0.85, 0.7, 0.85); cup.translate(0, 0.3, 0);
  return { ridgeJoint: 0.06, ridgeMid: 0.02, tipK: 2.2, cup, rows: [1.5], maxSuckers: 200, rsMax: 32, gap: 4.4, suckerK: 0.22, cols: [P.nodule, P.noduleAlt], stationsFor: () => true };
};

// ---- the extension: made by creature.js build() ------------------------------------------------------------------------------------------------------------------------------------------------------
export function extendMother(ctx) {
  const { cr, P, low, root, parent, link, uniforms, headMat, tubes } = ctx;
  const M = config.CREATURES.MOTHER, ZC = P.Z, G = P.EYE_GLOW, OW = P.INK || 22;
  const pieces = buildMotherPieces(cr, P, { M, low });
  const set = pieces.set, ranges = pieces.ranges, poses = { A: pieces.poses, B: pieces.posesB };
  const _M0 = new THREE.Matrix4();
  const bodyG = new THREE.Group();
  bodyG.name = 'motherBody';
  const bodyMesh = new THREE.Mesh(pieces.geometry, headMat), bodyInk = new THREE.Mesh(pieces.geometry, outlineMat);
  for (const m of [bodyMesh, bodyInk]) m.frustumCulled = false;
  bodyMesh.userData.toon = headMat;
  bodyInk.userData.isOutline = true;
  bodyMesh.name = 'motherBody';
  bodyG.add(bodyMesh, bodyInk);
  root.add(bodyG);
  headMat.emissive.set('#ffffff');
  uniforms.uSelf.value = P.SELF; ctx.uniformsT.uSelf.value = P.SELF; // (her own light: a floor of her own colour under the cave's blue ambient, so a part the lamp holds shows its real colours and a dark one a faint shape)
  tubes.suckers.material.emissive = new THREE.Color(P.nodule);
  const bt = new Tinter(pieces.geometry);
  // the gold BUDS: a glowing bulb at the tip of every tendril (one instanced mesh, one draw call): it pulses while the tendril grows, burns orange, goes dark when the tendril is burnt out
  const budGeo = new THREE.SphereGeometry(1, 8, 6), budMat = rimify(new THREE.MeshToonMaterial({ color: P.bud, gradientMap, emissive: new THREE.Color(P.bud), emissiveIntensity: 0.95 })), buds = new THREE.InstancedMesh(budGeo, budMat, 8);
  buds.frustumCulled = false; buds.count = 0; buds.name = 'motherBuds'; buds.setColorAt(0, new THREE.Color('#ffffff'));
  root.add(buds);
  const _bc = new THREE.Color(), _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _bp = V(), _bs = V();
  const marks = createMotherMarks(parent, P);
  const podM = podFrame(M);
  for (const nme of ['sockA', 'sockB', 'orb']) { set.place(nme, _M0.identity()); set.place(nme, null); } // (pieces that start hidden: a RigidSet cannot hide a piece it has never placed)

  const S = {
    key: -1, rev: { cap: 0, head: 0, eA: 0, eB: 0 }, tl: [], pose: -1, podStep: 0, eyeDead: [false, false], eyeLit: [false, false], rs: 7, died: false, seenAwake: false, sinkSteps: 0,
    clouds: new Set(), flashed: new Set(), tint: {}, burnSig: [], mode: '', hidden: false, wasPuff: 0, wasBeat: 0, snapped: false,
  };
  const byId = (id) => cr.parts.find((p) => p.id === id);
  const Pt = () => (link.vfx && link.vfx.P) || null;
  const rnd = (a) => { S.rs = (Math.imul((S.rs || 7) + a * 977, 0x2c1b3c6d) + 0x7f4a7c15) | 0; return ((S.rs >>> 0) % 10000) / 10000; };
  const _M = new THREE.Matrix4(), _N = new THREE.Matrix4(), _T = new THREE.Matrix4(), _p = V(), _q = new THREE.Quaternion(), _s = V(1, 1, 1);

  // ---- the tendrils' depth (creature.js jointZ: the root lies BEHIND the eyes, then it comes forward to the front layer; a coil takes the wrap's own path) ----
  const hullHalf = () => { let h = 0; if (link.models) for (const e of link.models.values()) h = Math.max(h, e.model && e.model.W ? e.model.W : 0); return h || 240; };
  function wrapZ(w, s) {
    const { pts, cum } = w, n = pts.length, total = cum[n - 1];
    if (s >= total) return pts[n - 1].z;
    let i = 1;
    while (i < n - 1 && cum[i] < s) i++;
    const u = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u;
  }
  function jointZ(p, n, Zb, hh) {
    const zRoot = ZC.ROOT_FRONT, reach = Math.max(1, p.reach0 || p.reach || 1000), m = p.wrap ? Math.max(2, n - p.wrap.k) : n;
    let s = 0, sw = 0;
    for (let j = 0; j <= n; j++) {
      if (p.wrap && j >= m) Zb[j] = (hh + ZC.WRAP_MARGIN) * wrapZ(p.wrap, sw);
      else Zb[j] = zRoot + (ZC.FRONT - zRoot) * smooth(s / (reach * 0.8));
      if (j < n) { s += p.segs[j].len; if (p.wrap && j >= m) sw += p.segs[j].len; }
    }
    if (p.wrap) for (let j = m; j < n; j++) if (p.segs[j].behind && Zb[j] > 0 && Zb[j + 1] > 0) Zb[j] = Zb[j + 1] = -4;
  }
  const segMid = (s, u = 0.5) => ({ x: s.x + Math.cos(s.ang) * s.len * u, y: s.y + Math.sin(s.ang) * s.len * u });
  // THE TENDRIL'S PATH: the sim's chain is 3150 px of rigid segments that hang 1000 px, so at rest it folds up into a zig-zag of 100 degree bends. Drawn as it is, that is a crumpled ribbon; the picture relaxes the joints
  // (a few passes of averaging with the neighbours: the root, the tip and the coil round a hull stay exactly where the sim has them) so it hangs as a long soft meander. The segments keep their design length for the painting.
  const smoothed = [];
  function relax(li, p, n) {
    let out = smoothed[li];
    if (!out || out.length !== n) out = smoothed[li] = Array.from({ length: n }, () => ({ x: 0, y: 0, ang: 0, len: 1, lenD: 1, r: 1, r1: 1, behind: false }));
    const J = [], segs = p.segs, last = segs[n - 1];
    for (let i = 0; i < n; i++) J.push([segs[i].x, segs[i].y]);
    J.push([last.x + Math.cos(last.ang) * last.len, last.y + Math.sin(last.ang) * last.len]);
    const hi = p.wrap ? Math.max(1, n - p.wrap.k - 1) : n - 1, T = [];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i <= hi; i++) T[i] = [J[i][0] * 0.5 + (J[i - 1][0] + J[i + 1][0]) * 0.25, J[i][1] * 0.5 + (J[i - 1][1] + J[i + 1][1]) * 0.25];
      for (let i = 1; i <= hi; i++) J[i] = T[i];
    }
    for (let i = 0; i < n; i++) {
      const o = out[i], dx = J[i + 1][0] - J[i][0], dy = J[i + 1][1] - J[i][1], s = segs[i];
      o.x = J[i][0]; o.y = J[i][1]; o.ang = Math.atan2(dy, dx); o.len = Math.max(1, Math.hypot(dx, dy)); o.lenD = s.len; o.r = s.r; o.r1 = s.r1; o.behind = s.behind;
    }
    return out;
  }

  // ---- particles: spore puffs, sparks ----
  // (spores are SOFT GLOWS, not gouache puffs: a puff is lit by the cave's ambient, which is nearly black, so it would be a dark smudge; a glow is her own light)
  const spores = (Ptc, x, y, z, n, o = {}) => Ptc && Ptc.burst('flash', x, y, z, n, { dir: -Math.PI / 2, spread: 1.2, speed: [20, 140], up: [-120, -20], size: [70, 150], size1: 1.5, life: [0.9, 1.7], color: P.spore, hdr: 0.9, alpha: 0.5, area: 160, noRate: true, ...o });
  const sparks = (Ptc, x, y, z, n, o = {}) => Ptc && Ptc.burst('spark', x, y, z, n, { speed: [200, 760], size: [6, 10], life: [0.3, 0.7], color: P.sporeLt, hdr: 2, noRate: true, ...o });

  // the burning colours of a tendril: per ring, by the segment the ring belongs to (-1 = burnt out: char, > 0 = burning: hot orange, 0 = never burnt)
  const colAttr = () => tubes.geometry.getAttribute('color');
  function paintTendril(li, p, mult, key) {
    const L = tubes.limbs[li], n = p.segs.length, Q = tubes.Q, RB = tubes.RB, R = tubes.R, S1 = tubes.sides + 1;
    if (!L || L.dead) return;
    const states = []; let sig = mult.map((v) => v.toFixed(2)).join(',') + '|' + (p.severed ? 1 : 0) + '|' + (key & 1) + '|';
    for (let i = 0; i < n; i++) { const b = p.burn ? p.burn[i] : 0, st = b > 0 ? 1 : b < 0 ? 2 : 0; states.push(st); sig += st; }
    if (S.burnSig[li] === sig) return;
    S.burnSig[li] = sig;
    const a = colAttr().array, tip = new THREE.Color(p.severed ? P.flesh : P.char), hot = key & 1 ? [1.9, 0.72, 0.25] : [2.3, 0.95, 0.3], char = [0.2, 0.17, 0.16];
    const f = (st) => (st === 1 ? hot : st === 2 ? char : WHITE);
    for (let r = 0; r < R; r++) {
      const seg = Math.min(n - 1, Math.floor(r / Q)), tipRing = r >= RB, joint = r % Q === 0 && r > 0 && r <= Q * n, c = tipRing ? tip : null;
      const A = f(states[tipRing ? n - 1 : seg]), Bc = joint ? f(states[Math.min(n - 1, seg - 1)]) : A;
      const k = [0, 1, 2].map((j) => (A[j] + Bc[j]) * 0.5 * mult[j]);
      for (let s = 0; s < S1; s++) { const o = (L.base + r * S1 + s) * 3; a[o] = (c ? c.r : 1) * k[0]; a[o + 1] = (c ? c.g : 1) * k[1]; a[o + 2] = (c ? c.b : 1) * k[2]; }
    }
    colAttr().needsUpdate = true;
  }

  const ext = {
    pieces: { tris: pieces.tris }, S, marks, set, bt, poses, bodyG, bodyMesh, ownsLimbs: true,
    zBody: () => 0,
    hide() { marks.hide(); bodyG.visible = false; buds.visible = false; },
    reset() { marks.hide(); },
    update(Fr) {
      const { R, t, state, dying, phase3 } = Fr, key = Math.floor(t * 8 + 1e-6), kNew = key !== S.key, Ptc = Pt(), mt = cr.mother || {}, pulse = (key >> 2) & 1;
      S.key = key;
      const cap = byId('cap'), cs = cap && cap.segs[0], eyes = [byId('eyeN'), byId('eyeF')], heart = byId('heart');
      if (!cs || !fin(cs.x) || !fin(cs.y)) { bodyG.visible = false; buds.visible = false; marks.hide(); return; }
      bodyG.visible = true;
      bodyG.position.set(cs.x, -cs.y, 0);
      marks.begin(key);
      const base = cr.base || { x: cs.x, y: cs.y }, dive = dying ? Math.max(0, cs.y - base.y) : 0, sk = dying ? clamp(cr.sinkT || 0, 0, 99) : 0, wither = clamp(sk / 4, 0, 1);
      const W3 = (lx, ly, lz = 0) => ({ x: cs.x + lx, y: -cs.y + ly, z: lz }); // a point of the cap's frame in the world

      // ---- THE DARK: how much of her the lamps reveal, in held steps ----
      if (kNew) {
        const step = 1 / (P.REVEAL_STEPS || 3), toward = (v, tg) => v + clamp(tg - v, -step, step);
        const dyingGlow = dying ? Math.max(0, 0.85 * (1 - sk / 9)) : 0; // (she is seen as she dies: the picture would be a black blot otherwise)
        const capT = Math.max(cap.lit ? 1 : 0, dyingGlow), eT = eyes.map((e) => (e && !e.dead && e.lit ? 1 : 0));
        S.rev.cap = toward(S.rev.cap, capT); S.rev.eA = toward(S.rev.eA, eT[0]); S.rev.eB = toward(S.rev.eB, eT[1]);
        S.rev.head = toward(S.rev.head, Math.max(capT * 0.8, eT[0], eT[1]));
        for (let i = 0; i < 2; i++) { // a lamp finds an eye: a ring of light round it
          const lit = eT[i] > 0.5;
          if (lit && !S.eyeLit[i] && Ptc && eyes[i] && eyes[i].segs[0] && !dying) { const e = eyes[i].segs[0]; Ptc.ring(e.x, -e.y, 380, 520, P.eye, 0.5); sparks(Ptc, e.x, -e.y, 380, 8, { color: P.eyeLt, speed: [120, 420] }); }
          S.eyeLit[i] = lit;
        }
      }
      const lvCap = S.rev.cap, lvHead = S.rev.head, mulOf = (lv, dim) => (dim + (P.LIT - dim) * lv);
      const W = [1 - 0.28 * wither, 1 - 0.34 * wither, 1 - 0.22 * wither];
      const warm = (lv, j) => lerp(1, P.WARM[j], lv); // (a lamp's light is warm: a part a beam holds turns from a cool dark to a warm lilac)
      const tintOf = (lv, p) => (p && p.hit > 0 ? FLASH : [mulOf(lv, P.DIM) * W[0] * warm(lv, 0), mulOf(lv, P.DIM) * W[1] * warm(lv, 1), mulOf(lv, P.DIM) * W[2] * warm(lv, 2)]);
      const tc = tintOf(lvCap, cap), th = tintOf(lvHead, null);
      for (const nme of ['cap', 'skirt', 'stem', 'wA', 'wB', 'antA', 'antB', 'podBase', 'petal0', 'petal1', 'petal2', 'petal3', 'petal4', 'orb']) bt.set(ranges[nme], tc[0], tc[1], tc[2]);
      for (const nme of ['head', 'sockA', 'sockB']) bt.set(ranges[nme], th[0], th[1], th[2]);
      const rt = 0.45 + 0.55 * lvCap; bt.set(ranges.roots, rt, rt, rt);
      const asleep = mt.mode === 'asleep', stirring = mt.mode === 'stirring';
      const eyeGlow = (p, lv) => {
        if (!p || p.dead) return 0;
        if (p.hit > 0) return G.hit;
        const b = asleep ? G.asleep : stirring ? lerp(G.asleep, G.base, 0.6) : G.base;
        return (b + (G.lit - b) * lv) * (dying ? 1 - clamp(sk / 3, 0, 1) : 1);
      };
      uniforms.uGlow.value.set(eyeGlow(eyes[0], S.rev.eA), eyeGlow(eyes[1], S.rev.eB), (P.BIO_GLOW.dark + (P.BIO_GLOW.lit - P.BIO_GLOW.dark) * lvCap) * (0.9 + 0.1 * pulse) * (dying ? 1 - 0.7 * wither : 1), P.HEART_GLOW[key & 1]);
      headMat.emissiveIntensity = (P.EMISSIVE.dark + (P.EMISSIVE.lit - P.EMISSIVE.dark) * lvCap) * (0.92 + 0.08 * pulse);
      for (let i = 0; i < 2; i++) { // the eyes: the dome (tinted white, or flashing) or, when put out, the dark cracked ball
        const e = eyes[i], nm = 'AB'[i], dead = !!(e && e.dead);
        if (dead && !S.eyeDead[i] && Ptc && e && e.segs[0]) { const s = e.segs[0]; Ptc.flash(s.x, -s.y, 420, 600, '#ffffff', { hdr: 2, alpha: 0.8, life: 0.2 }); Ptc.ring(s.x, -s.y, 420, 800, P.sporeLt, 0.5); spores(Ptc, s.x, -s.y, 380, 12, { area: 160 }); sparks(Ptc, s.x, -s.y, 420, 14); }
        S.eyeDead[i] = dead;
        set.place('eye' + nm, dead ? null : _M.identity());
        set.place('sock' + nm, dead ? _M.identity() : null);
        const et = e && e.hit > 0 ? FLASH : WHITE;
        bt.set(ranges['eye' + nm], et[0], et[1], et[2]);
      }

      // ---- the cap swells when she puffs for the spores (three held steps); it shrinks as she wilts ----
      const puffN = dying ? 0 : clamp(mt.puff | 0, 0, 3), kk = (dying ? 1 - 0.12 * wither : P.PUFF[puffN]) || 1;
      if (puffN !== S.wasPuff && puffN > S.wasPuff && Ptc && !dying) { const hem = W3(0, -690, 330); sparks(Ptc, hem.x, hem.y, hem.z, 6, { speed: [100, 300] }); }
      S.wasPuff = puffN;
      _M.compose(_p.set(0, -300 * (1 - kk), 0), _q.identity(), _s.set(kk, kk * (dying ? 0.9 : 1), kk));
      set.place('cap', _M); set.place('skirt', _M);
      if (puffN > 0 && kNew && Ptc) for (let c = 0; c < 2 + puffN; c++) { const a = (rnd(key + c) - 0.5) * 2, hem = W3(a * 640 * kk, -700 * kk, 300 + Math.abs(a) * 0); spores(Ptc, hem.x, hem.y, hem.z, 1, { area: 30, up: [-170, -80] }); } // (spores trickle from the gill hem)
      if (stirring && kNew && Ptc && (key & 3) === 0) { const a = (rnd(key) - 0.5) * 2, hem = W3(a * 600, -700, 300); spores(Ptc, hem.x, hem.y, hem.z, 2, { area: 40 }); }

      // ---- the stem and roots: they stay on the roof while she falls (the stem stretches, thins, then snaps and leaves a stump) ----
      if (dive > 0 || S.snapped) {
        if (dive > 520 && !S.snapped) { S.snapped = true; if (Ptc) { const top = W3(0, 450 + dive, 0); Ptc.flash(top.x, top.y, 100, 1500, P.sporeLt, { hdr: 1.6, alpha: 0.7, life: 0.25 }); spores(Ptc, top.x, top.y - 200, 120, 14, { area: 260, size: [90, 180] }); } }
        if (S.snapped) _M.compose(_p.set(0, 450 + dive - 450 * 0.55, 0), _q.identity(), _s.set(1.1, 0.55, 1.1));
        else { const sy = (360 + dive) / 360, sx = 1 / Math.sqrt(Math.max(1, sy)); _M.compose(_p.set(0, 90 - 90 * sy, 0), _q.identity(), _s.set(sx, sy, sx)); }
        set.place('stem', _M);
        set.place('roots', _N.compose(_p.set(0, dive, 0), _q.identity(), _s.set(1, 1, 1)));
      } else { set.place('stem', _M.identity()); set.place('roots', _M.identity()); }

      // ---- the wings: the sim's beat key (0 folded, 1 half open, 2 spread, 3 down-stroke); stirring she flutters; dying they fold ----
      let pose = clamp(mt.beat | 0, 0, 3);
      if (stirring && !dying && !pose) pose = (key >> 1) & 1;
      if (dying) pose = sk < 0.9 ? 3 : sk < 2 ? 1 : 0;
      if (pose !== S.pose) { S.pose = pose; for (const s of ['A', 'B']) { const pc = set.pieces['w' + s], d = poses[s][pose]; pc.p0 = d.p; pc.n0 = d.n; pc.o0 = d.o; pc.key = null; } }
      const ang = (dying && pose === 0 ? 100 : P.WING_ANG[pose]) * Math.PI / 180, pvx = 0.8 * M.BODY.CAP.R, pvy = -0.55 * M.BODY.CAP.R;
      set.place('wA', _M.compose(_p.set(pvx, pvy, ZC.WING), _q.setFromAxisAngle(Z_AX, -ang), _s.set(1, 1, 1)));
      set.place('wB', _M.compose(_p.set(-pvx, pvy, ZC.WING), _q.setFromAxisAngle(Z_AX, ang), _s.set(1, 1, 1)));
      if (pose === 3 && S.wasBeat !== 3 && Ptc && !dying) for (const sd of [-1, 1]) { const tip = W3(sd * (pvx + 1500), pvy - 700, ZC.WING + 80); spores(Ptc, tip.x, tip.y, tip.z, 4, { area: 300, speed: [40, 200], up: [-260, -120], size: [90, 170] }); }
      S.wasBeat = pose;

      // ---- the spore heart: a bud until phase 3, then the five petals fold back in three steps ----
      const open = !!heart && !heart.hidden && !heart.dead && !dying;
      if (kNew) { const was = S.podStep; S.podStep = clamp(S.podStep + (open ? 1 : -1), 0, 3); if (S.podStep > was && was === 0 && Ptc) { const hz = W3(M.BODY.HEART.AT[0], -M.BODY.HEART.AT[1], 480); Ptc.ring(hz.x, hz.y, hz.z + 60, 900, P.heart, 0.5); spores(Ptc, hz.x, hz.y, hz.z, 10, { area: 160, color: P.heartIn }); } }
      for (let k = 0; k < 5; k++) {
        _N.copy(podM).multiply(_T.makeRotationZ((k / 5) * Math.PI * 2 + Math.PI / 2)).multiply(_T.makeTranslation(POD.R, 0, 0)).multiply(_T.makeRotationY(-PETAL_ANG[S.podStep]));
        set.place('petal' + k, _N);
      }
      const os = ORB_SCALE[S.podStep] * (S.podStep >= 3 ? 1 + 0.08 * pulse : 1); // (the heart swells and settles twice a second)
      set.place('orb', os > 0 ? _N.copy(podM).multiply(_T.makeTranslation(0, 0, 25)).multiply(_T.makeScale(os, os, os)) : null);
      set.place('podBase', _M.identity());
      if (open && S.podStep >= 3 && heart.segs[0]) marks.heartRing(heart.segs[0].x, -heart.segs[0].y, 420, M.BODY.HEART.R * 1.25, heart.job ? heart.job.prog : 0);

      // ---- the tendrils ----
      const hh = hullHalf(), limbs = R.limbs;
      let anyLit = 0;
      if (kNew) {
        for (let li = 0; li < limbs.length; li++) { const p = limbs[li], step = 1 / (P.REVEAL_STEPS || 3); S.tl[li] = (S.tl[li] || 0) + clamp((p && p.lit && !p.dead ? 1 : 0) - (S.tl[li] || 0), -step, step); }
      }
      const nFire = { n: 0 };
      let nBud = 0;
      limbs.forEach((p, li) => {
        const n = p.segs ? p.segs.length : 0;
        if (p.dead || p.hidden || !n) { tubes.update(li, null, 1, false, R.zbuf, WHITE); return; }
        if (R.zbuf.length < n + 1) R.zbuf = new Float32Array(n + 8);
        jointZ(p, n, R.zbuf, hh);
        const lv = S.tl[li] || 0, m = p.hit > 0 ? FLASH[0] : mulOf(lv, P.TENDRIL_DIM) * (1 - 0.2 * wither);
        anyLit = Math.max(anyLit, lv);
        tubes.setTint(li, m, m, m);
        const sm = relax(li, p, n);
        tubes.update(li, sm, p.side || 1, !!p.severed, R.zbuf, WHITE);
        paintTendril(li, p, [m, m, p.hit > 0 ? m : m * 0.98], key);
        if (!p.severed && nBud < 8) { // the bud at the tip
          const sg = sm[n - 1], tip = { x: sg.x + Math.cos(sg.ang) * sg.len, y: sg.y + Math.sin(sg.ang) * sg.len }, tr = Math.max(30, sg.r1), growing = p.ctl && (p.ctl.mode === 'wind' || p.ctl.mode === 'seize'), burnt = p.burn && p.burn[n - 1] < 0, hotTip = p.burn && p.burn[n - 1] > 0;
          const k = tr * (growing ? 1.5 + 0.3 * (key & 1) : 1.35), cd = Math.cos(sg.ang), sd = Math.sin(sg.ang);
          _bm.compose(_bp.set(tip.x + cd * tr * 0.9, -(tip.y + sd * tr * 0.9), R.zbuf[n] + 6), _bq.setFromAxisAngle(Z_AX, -sg.ang - Math.PI / 2), _bs.set(k * 0.9, k * 1.25, k * 0.9));
          buds.setMatrixAt(nBud, _bm);
          const lvv = clamp(0.35 + 0.65 * lv, 0, 1) * (p.hit > 0 ? 2 : 1);
          if (burnt) _bc.setRGB(0.1, 0.08, 0.08); else if (hotTip) _bc.setRGB(1.5, 0.6, 0.15); else _bc.setRGB(lvv, lvv * 0.95, lvv * 0.75);
          buds.setColorAt(nBud, _bc);
          nBud++;
        }
        // fire along the burning segments, and a halo
        if (p.burn && !dying) {
          let first = -1, last = -1;
          for (let i = 0; i < n; i++) if (p.burn[i] > 0) { if (first < 0) first = i; last = i; }
          if (first >= 0) {
            for (let i = first; i <= last; i++) {
              if (!(p.burn[i] > 0)) continue;
              const sg = sm[i], mid = segMid(sg), z = R.zbuf[i] + 70;
              if (kNew && Ptc && nFire.n < 26) {
                nFire.n++;
                const j = (i + key + li) % 3;
                Ptc.burst('fire', mid.x + (rnd(key + i) - 0.5) * sg.r, -mid.y + sg.r * 0.4, z, 1, { size: [110, 190], size1: 0.6, life: [0.32, 0.55], speed: [0, 30], up: [110, 220], area: sg.r * 0.5, noRate: true });
                if (j === 0) Ptc.burst('ember', mid.x, -mid.y, z, 1, { up: [90, 240], speed: [10, 90], noRate: true });
                if (j === 1 && (key & 1)) Ptc.burst('smoke', mid.x, -mid.y + sg.r, z - 20, 1, { size: [60, 100], life: [0.9, 1.4], color: '#8a7a88', alpha: 0.4, noRate: true });
              }
              if (i === first || i === last || i % 3 === 0) marks.halo(mid.x, -mid.y, z, 190 + sg.r * 0.9, 0, 0.55);
            }
          }
        }
        // a tendril that grows or reaches leaves spores at its tip
        const ctl = p.ctl;
        if (kNew && Ptc && ctl && (ctl.mode === 'wind' || ctl.mode === 'seize') && !p.dead) { const sg = sm[n - 1], tip = { x: sg.x + Math.cos(sg.ang) * sg.len, y: sg.y + Math.sin(sg.ang) * sg.len }; spores(Ptc, tip.x, -tip.y, R.zbuf[n] + 40, 1, { area: 40, size: [50, 90], up: [-40, 40], color: P.glowDot }); }
      });
      buds.count = nBud; buds.instanceMatrix.needsUpdate = true; if (buds.instanceColor) buds.instanceColor.needsUpdate = true; buds.visible = nBud > 0;
      tubes.suckers.material.emissiveIntensity = (0.35 + 0.35 * anyLit) * (0.9 + 0.1 * pulse);
      tubes.material.emissiveIntensity = (P.TENDRIL_EMISSIVE.dark + (P.TENDRIL_EMISSIVE.lit - P.TENDRIL_EMISSIVE.dark) * anyLit) * (0.92 + 0.08 * pulse);

      // ---- the spore ring and the clouds ----
      if (mt.ring && !dying) { const r = mt.ring, u = Math.min(1, Math.floor((r.t / Math.max(0.1, r.T)) * 8) / 8); marks.ring(r.x, -r.y, 360, r.rx * (0.5 + 0.5 * u), r.ry * (0.5 + 0.5 * u), u); }
      for (const c of mt.clouds || []) {
        if (!fin(c.x) || !fin(c.y)) continue;
        const op = c.mode === 'fade' ? clamp(c.left / 1.5, 0, 1) : c.mode === 'fall' ? 0.7 + 0.3 * c.grow : 1;
        if (!S.clouds.has(c)) { S.clouds.add(c); if (Ptc) { const hem = W3(0, -700, 320); spores(Ptc, hem.x, hem.y, hem.z, 14, { area: 520, speed: [60, 240], up: [-200, -60], size: [90, 170] }); Ptc.ring(c.x, -c.y, 300, 1200, P.spore, 0.5); } }
        if (c.flash && !S.flashed.has(c)) { S.flashed.add(c); if (Ptc) { Ptc.flash(c.x, -c.y, 340, 2800, P.sporeFlash, { hdr: 1.8, alpha: 0.8, life: 0.25 }); Ptc.ring(c.x, -c.y, 340, 2400, '#ffb347', 0.5); sparks(Ptc, c.x, -c.y, 340, 18, { color: '#ffd35c', speed: [200, 900], area: 0 }); } }
        marks.cloud(c.x, -c.y, 340, c.rx * c.grow, c.ry * c.grow, c.id || 1, !!c.flash, op);
        if (kNew && Ptc && c.mode !== 'fade') spores(Ptc, c.x + (rnd(key + 3) - 0.5) * c.rx * c.grow * 1.4, -c.y + c.ry * c.grow * 0.6, 330, 1, { area: 0, size: [90, 160], up: [-110, -50], alpha: 0.5 });
        if (c.mode === 'fade' && c.left < 0.4) S.clouds.delete(c);
      }
      if (S.clouds.size > 6) for (const c of S.clouds) if (!(mt.clouds || []).includes(c)) { S.clouds.delete(c); S.flashed.delete(c); }

      // ---- the wing beat: wind chevrons over the ship (dashed gold while the wings spread, solid pale while they beat), and a wave of spores and dust ----
      const ms0 = state.ships && state.ships[0];
      if (mt.gust && ms0 && !dying) {
        const g = mt.gust, d = g.dir < 0 ? -1 : 1, mx = toWorldX(ms0, ms0.layout.refPoint.x), my = toWorldY(ms0, ms0.layout.refPoint.y);
        for (let row = -1; row <= 1; row++) for (let k = 0; k < 3; k++) {
          const x = mx + d * (500 + k * 520 + (g.beat ? (key % 6) * 90 : 0)), y = my + row * 380 - 200;
          marks.chevron(x, -y, 400, 270, 180, d, !g.beat, g.beat ? 0.95 : 0.9);
        }
        if (g.beat && kNew && Ptc) for (let c = 0; c < 3; c++) {
          const x = mx - d * (900 - rnd(key + c) * 1500), y = my + (rnd(key + c + 9) - 0.5) * 1200 - 200;
          Ptc.burst('flash', x, -y, 300, 1, { vx: d * (900 + rnd(key + c + 5) * 700), speed: [0, 30], up: [-40, 40], size: [80, 160], size1: 1.6, life: [0.6, 1.0], color: c ? P.sporeLt : P.spore, hdr: 0.9, alpha: 0.45, noRate: true });
        }
      }

      marks.end();

      // ---- the death: a flash and a ring, spores pouring from the cap as she withers ----
      if (dying) {
        if (!S.died) { S.died = true; if (Ptc) { const m0 = W3(0, -700, 200); Ptc.flash(m0.x, m0.y, 200, 5200, P.sporeLt, { hdr: 1.8, alpha: 0.8, life: 0.3 }); Ptc.ring(m0.x, m0.y, 200, 5600, P.spore, 0.8); spores(Ptc, m0.x, m0.y, 250, 26, { area: 700, size: [110, 220], speed: [100, 500], life: [1.2, 2.2] }); sparks(Ptc, m0.x, m0.y, 300, 16, { speed: [200, 900] }); } }
        if (kNew && Ptc && sk < 7) { const a = (rnd(key) - 0.5) * 2, hem = W3(a * 700, -650 - sk * 30, 280); spores(Ptc, hem.x, hem.y, hem.z, 2, { area: 80, size: [90, 170] }); if (key % 4 === 0) Ptc.burst('drop', hem.x, hem.y, hem.z, 3, { color: P.glowDot, speed: [20, 120], noRate: true }); }
      }
      void phase3; void OW;
    },
    dispose() {
      root.remove(bodyG, buds);
      budGeo.dispose(); budMat.dispose(); buds.dispose();
      pieces.geometry.dispose();
      marks.dispose();
    },
  };
  void Y_AX;
  return ext;
}
