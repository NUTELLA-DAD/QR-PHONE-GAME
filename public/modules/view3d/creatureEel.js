// THE VOID EEL IN 3D (3D.md section 42). creature.js is the generic creature view and KINDS.eel plugs this in; the models are eelModel.js (the angler's head with its hinged jaw, needle teeth and glowing throat, the crown's bone
// rim, the rod, the lantern and the gold crate, the joint rings), the paintings eelPaint.js, the translucent fins eelFins.js and the marks eelFx.js. What this file does is put the model where the SIMULATION says the eel's
// parts are, every frame, and never move a thing by itself (no sine of time, no wobble: the jaw opens in sixths of the sim's `openAmt`, the dim fades in three held steps, the marks step on the 8 a second key):
//   - the BODY: the generic tube kit (creatureTube.js): four smooth tubes (the three tail sections and the neck) laid along the sim's rigid segments, painted with a deep-indigo hide, a pale belly and glowing constellations on the
//     flanks (an emissive map), the dorsal and belly fins (one translucent mesh); a gold ring at each end of every tail section (bright on the one that can be cut, dull on the others) with a soft halo; a cone of a tail tip
//   - the LOOP'S DEPTH: the far half of the loop (above the ship's middle) lies behind the hull and the near half in front of it (the screen-door in creatureKit.js lets the crew show through); a section in a coil takes the
//     wrap's own path (the Kraken's rule)
//   - the HEAD: an angler's skull with a crest, two big glowing eyes, a jaw that swings down in sixths with the throat glowing between the jaws, needle teeth, barbels; it turns over about its own axis as it comes about
//     (a real roll, never a mirror) so that its back stays up
//   - the CROWN: the bone rim along the capsule a boarder walks and the translucent sail inside it; the ROD curves from its top to the LANTERN, a bone cage round a glowing core (hunting: dark, gaping: bright) that turns
//     into a GOLD CRATE with straps, a pickup ring and a twinkle while it lures; the sim's `lampLit` says which (0 dark, 1 glowing, 2 lure)
//   - the DIM: while the eel hides behind its lure the body is a dark shape with only its lure shining (the sim's part.lit); the constellations and the rings go out in three held steps and come back when it is called
//   - the COIL, the SWALLOW, the BITE: a coiled section passes behind and in front of the hull; the swallow's red ring, chevrons and the lunge's streaks are drawn here (the 2D marks layer is not drawn in 3D); the bite
//     is a gold flash; a cut section throws sparks at the stump (a glowing face) and falls as a Rapier body with its fins
//   - the DEATH: the body goes limp as the sim sinks it and DISSOLVES into stardust from the tail on (the radius thins, the fins fade, soft lights and sparks drift off), the head last, the lantern the very last
import { THREE, outlineMat, applyLook, gradientMap, rimify } from './style.js';
import { config } from '../../config.js';
import { Tinter } from './creatureKit.js';
import { paintEelSkin, paintEelAtlas } from './eelPaint.js';
import { buildEelBody as buildBody, buildEelPieces, throatCorners, HEAD, CROWN, NCORD, V, M4 } from './eelModel.js';
import { createEelFins, chunkFinGeometry } from './eelFins.js';
import { createEelMarks } from './eelFx.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, u) => a + (b - a) * u;
const FLASH = [2.4, 2.2, 2.2];
const X_AX = V(1, 0, 0), Z_AX = V(0, 0, 1);
const SEC = ['e0', 'e1', 'e2', 'e3'];
const NSEG = 6;

// ---- what creature.js asks the kind for --------------------------------------------------------------------------------------------------------------------------------------------------------
export const buildEelBody = (cr, P, o) => buildBody(cr, P, o);
export const eelSkins = (P) => { const s = paintEelSkin(P), a = paintEelAtlas(P); return { head: a.map, headGlow: a.glow, limb: s.map, limbGlow: s.glow }; };
export const eelLimbs = (cr) => cr.parts.filter((p) => p.kind === 'tentacle' || p.kind === 'neck');
export const eelTubeOpts = () => ({ rows: [], maxSuckers: 1, stationsFor: () => false, tipK: 0.3, ridgeJoint: 0.12, ridgeMid: 0.04 });

// ---- the extension: made by creature.js build() ------------------------------------------------------------------------------------------------------------------------------------------------------
export function extendEel(ctx) {
  const { cr, P, low, root, parent, link, uniforms, uniformsT, headMat, tubes, plainOf } = ctx;
  const E = config.CREATURES.EEL, B = E.BODY, ZC = P.Z, G = P.EYE_GLOW, DS = P.DISSOLVE;
  const pieces = buildEelPieces(cr, P, { low });
  const set = pieces.set, ranges = pieces.ranges;
  const bodyMesh = new THREE.Mesh(pieces.geometry, headMat), bodyInk = new THREE.Mesh(pieces.geometry, outlineMat);
  for (const m of [bodyMesh, bodyInk]) m.frustumCulled = false;
  bodyMesh.userData.toon = headMat;
  bodyInk.userData.isOutline = true;
  bodyMesh.name = 'eelBody';
  root.add(bodyMesh, bodyInk);
  tubes.suckers.visible = false; // (no suckers: the body is smooth)
  ctx.hg.visible = false; // (the generic head group holds only the empty stand-in geometry: not drawn at all)
  headMat.emissive.set('#ffffff');
  headMat.emissiveIntensity = P.EMISSIVE.body;
  uniforms.uSelf.value = P.SELF; uniformsT.uSelf.value = P.SELF; // (its own light: a floor of its own colour in the dark Aether, so the indigo does not fall to black)
  const _M = new THREE.Matrix4(), _H = new THREE.Matrix4(), _J = new THREE.Matrix4(), _T = new THREE.Matrix4(), _Rm = new THREE.Matrix4(), _S = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = V(), _s = V(1, 1, 1);
  const _a = V(), _b = V(), _c = V();
  const fins = createEelFins(root, P, { Q: tubes.Q }), marks = createEelMarks(parent, P), bt = new Tinter(pieces.geometry);
  for (const nme of Object.keys(ranges)) { set.place(nme, _M.identity()); set.place(nme, null); } // (every piece starts hidden: a RigidSet cannot hide a piece it has never placed)
  void low;

  const S = { key: -1, rev: {}, open: 0, jawA: 0, died: false, jawKey: '', cut: new Set(), lastRoot: {}, rs: 7, lamp: -1, wasOpen: false, wasLure: false, wasKnown: false, wasBite: false, ringHit: null, hmx: 0, dissolved: false, sparkT: 0, burstN: 0, swT: -1 };
  const byId = (id) => cr.parts.find((p) => p.id === id);
  const Pt = () => (link.vfx && link.vfx.P) || null;
  const rnd = (a) => { S.rs = (Math.imul((S.rs || 7) + a * 977, 0x2c1b3c6d) + 0x7f4a7c15) | 0; return ((S.rs >>> 0) % 10000) / 10000; };

  // ---- particles ----
  const dust = (Ptc, x, y, z, n, o = {}) => Ptc && Ptc.burst('flash', x, y, z, n, { speed: [10, 120], up: [-30, 50], ay: 0, size: [70, 150], size1: 1.4, life: [1.0, 2.0], color: P.stardust, hdr: 0.9, alpha: 0.5, area: 140, noRate: true, ...o });
  const spark = (Ptc, x, y, z, n, o = {}) => Ptc && Ptc.burst('spark', x, y, z, n, { speed: [160, 640], size: [6, 10], life: [0.3, 0.8], color: P.stardustLt, hdr: 2.2, ay: 0, drag: 1.2, noRate: true, ...o });

  // ---- depth: a free joint of the loop lies behind the ship's plane above the ship's middle and in front below it; a coiled one on the coil's own path ----
  const hullHalf = () => { let h = 0; if (link.models) for (const e of link.models.values()) h = Math.max(h, e.model && e.model.W ? e.model.W : 0); return h || 240; };
  function wrapZ(w, s) {
    const { pts, cum } = w, n = pts.length, total = cum[n - 1];
    if (s >= total) return pts[n - 1].z;
    let i = 1;
    while (i < n - 1 && cum[i] < s) i++;
    const u = cum[i] > cum[i - 1] ? (s - cum[i - 1]) / (cum[i] - cum[i - 1]) : 0;
    return pts[i - 1].z + (pts[i].z - pts[i - 1].z) * u;
  }
  const centreY = () => (cr.eel && cr.eel.lastC && fin(cr.eel.lastC.y) ? cr.eel.lastC.y : cr.y);
  const zOf = (gy) => ZC.LOOP * clamp((gy - centreY()) / ZC.SPAN, -1, 1);
  const ZB = new Float32Array(NSEG + 2);
  function jointZ(p, n, hh) {
    const m = p.wrap ? Math.max(2, n - p.wrap.k) : n;
    let sw = 0;
    for (let j = 0; j <= n; j++) {
      const sg = p.segs[Math.min(j, n - 1)], y = j < n ? sg.y : sg.y + Math.sin(sg.ang) * sg.len;
      if (p.wrap && j >= m) ZB[j] = (hh + ZC.WRAP_MARGIN) * wrapZ(p.wrap, sw);
      else ZB[j] = zOf(y);
      if (j < n && p.wrap && j >= m) sw += p.segs[j].len;
    }
    if (p.wrap) for (let j = m; j < n; j++) if (p.segs[j].behind && ZB[j] > 0 && ZB[j + 1] > 0) ZB[j] = ZB[j + 1] = -4;
  }
  // the segments the tubes are laid along: the sim's own, with the dissolve's thinning (a copy, the sim's are never touched)
  const view = [0, 1, 2, 3].map(() => Array.from({ length: NSEG }, () => ({ x: 0, y: 0, ang: 0, len: 1, lenD: 1, r: 1, r1: 1, behind: false })));
  const gOf = (li, j) => (li === 3 ? 18 + j : li * 6 + (5 - j)); // the global segment (0 = the tail's tip .. 23 = the neck's last)
  const scaleOf = (g, sk) => (sk <= 0 ? 1 : clamp(1 - smooth((sk - (DS.FROM + g * DS.STEP)) / DS.TIME), 0.012, 1));
  const ringScale = new Float32Array(32), finScale = [0, 1, 2, 3].map(() => new Float32Array(48)); // (per ring: how much of the fin stands)

  const ext = {
    pieces: { tris: pieces.tris }, S, marks, fins, set, bt, ranges, bodyMesh, ownsLimbs: true,
    zBody: () => 0,
    hide() { marks.hide(); fins.hide(); bodyMesh.visible = bodyInk.visible = false; },
    reset() { marks.hide(); fins.hide(); },
    update(Fr) {
      const { R, t, state, dying } = Fr, key = Math.floor(t * 8 + 1e-6), kNew = key !== S.key, Ptc = Pt(), ev = cr.eel || {}, sk = dying ? clamp(cr.sinkT || 0, 0, 99) : 0, pulse = key & 1;
      S.key = key;
      bodyMesh.visible = bodyInk.visible = true;
      const parts = SEC.map(byId), head = byId('head'), mouth = byId('mouth'), crown = byId('crown'), lamp = byId('lamp');
      const hh = hullHalf(), limbs = R.limbs;
      marks.begin(key);
      fins.begin();

      // ---- THE DIM: while the eel hides behind its lure a part nobody lights is a dark shape; it fades in and out in held steps ----
      if (kNew) {
        const step = 1 / (P.REVEAL_STEPS || 3);
        for (const [id, p] of [...SEC.map((id, i) => [id, parts[i]]), ['head', head], ['mouth', mouth], ['crown', crown], ['lamp', lamp]]) {
          const tg = !p || p.lit || dying ? 1 : 0, was = S.rev[id] == null ? tg : S.rev[id];
          S.rev[id] = was + clamp(tg - was, -step, step);
        }
      }
      const rv = (id) => (S.rev[id] == null ? 1 : S.rev[id]);
      const tintOf = (id, p) => { if (p && p.hit > 0) return FLASH; const m = lerp(P.DIM, 1, rv(id)); return [m, m, m * 1.06]; };

      // ---- THE BODY: four tubes laid along the segments, then their fins ----
      let revBody = 0, nBody = 0;
      const stump = [false, false, false];
      for (let k = 1; k < 3; k++) if (parts[k] && !parts[k].dead && parts.slice(0, k).some((q) => q && (q.dead || q.severed))) stump[k] = true; // (a section whose tail side was cut off ends in a flat cut face)
      if (parts[0] && parts[0].severed && !parts[0].dead) stump[0] = true;
      const rings = [];
      let tailLive = -1;
      limbs.forEach((p, li) => {
        const n = p.segs ? p.segs.length : 0;
        if (p.dead || p.hidden || !n || n > NSEG) { tubes.update(li, null, 1, false, R.zbuf, [1, 1, 1]); return; }
        const vs = view[li];
        let alive = 0;
        for (let j = 0; j < n; j++) {
          const s = p.segs[j], o = vs[j], sc = scaleOf(gOf(li, j), sk);
          o.x = s.x; o.y = s.y; o.ang = s.ang; o.len = s.len; o.lenD = s.len * sc; o.r = s.r * sc; o.r1 = s.r1 * sc; o.behind = s.behind;
          if (sc > 0.02) alive++;
          ringScale[j] = sc;
        }
        if (!alive) { tubes.update(li, null, 1, false, R.zbuf, [1, 1, 1]); return; }
        if (R.zbuf.length < n + 1) R.zbuf = new Float32Array(n + 8);
        jointZ(p, n, hh);
        for (let j = 0; j <= n; j++) R.zbuf[j] = ZB[j];
        const tl = tintOf(SEC[li], p);
        tubes.setTint(li, tl[0], tl[1], tl[2]);
        const stub = li < 3 && stump[li];
        const L = tubes.update(li, n === NSEG ? vs : vs.slice(0, n), li === 3 ? 1 : -1, stub, R.zbuf, tl); // (the belly side: toward the loop's inside; the tail sections run the other way round, so their side is the opposite)
        revBody += rv(SEC[li]); nBody++;
        if (tailLive < 0 && li < 3) tailLive = li;
        // the fins: one scale per ring from the segment's dissolve
        const sc = finScale[li];
        for (let r = 0; r < L.nr && r < 48; r++) sc[r] = ringScale[Math.min(n - 1, Math.floor(r / tubes.Q))];
        fins.strip(L, { tail: li === 0 && !stub, rgb: tl[0] > 1 ? [1.6, 1.6, 1.6] : [lerp(0.35, 1, rv(SEC[li])), lerp(0.4, 1, rv(SEC[li])), 1], alpha: lerp(0.3, 1, rv(SEC[li])), scale: sc, root: li < 3 });
        if (li < 3) { // the rings at both ends of a tail section
          const mk = (r, endKind) => { const o = r * 3; return { li, endKind, x: L.P[o], y: L.P[o + 1], z: L.P[o + 2], T: [L.T[o], L.T[o + 1], L.T[o + 2]], N1: [L.N1[o], L.N1[o + 1], L.N1[o + 2]], N2: [L.N2[o], L.N2[o + 1], L.N2[o + 2]], rad: L.rad[r] * ringScale[endKind === 'root' ? 0 : n - 1], bright: !!p.joint, rv: rv(SEC[li]), p }; };
          rings.push(mk(0, 'root'), mk(L.nr - 1, 'tip'));
        }
      });
      tubes.material.emissiveIntensity = lerp(P.EMISSIVE.dim, P.EMISSIVE.body, nBody ? revBody / nBody : 1);

      // the joint rings: one band at a joint (the two sections that meet there share it: the brighter one wins); the tail's cone; a stump's glowing face
      const keep = [];
      for (const r of rings) {
        const dup = keep.findIndex((q) => Math.hypot(q.x - r.x, q.y - r.y, q.z - r.z) < 90);
        if (dup < 0) keep.push(r); else if (r.bright && !keep[dup].bright) keep[dup] = r;
      }
      for (let i = 0; i < 6; i++) {
        const r = keep[i], nm = 'jr' + i;
        if (!r || r.rad < 3) { set.place(nm, null); continue; }
        _M.makeBasis(_a.set(...r.T), _b.set(...r.N1), _c.set(...r.N2)).setPosition(r.x, r.y, r.z);
        _M.multiply(_S.makeScale(r.rad * 0.72, r.rad * 1.04, r.rad * 1.04));
        set.place(nm, _M);
        const m = (r.bright ? 1.25 : 0.3) * (0.35 + 0.65 * r.rv);
        bt.set(ranges[nm], m, m * (r.bright ? 0.92 : 0.9), m * (r.bright ? 0.72 : 0.78));
        if (r.bright && r.rv > 0.3 && !dying) marks.halo(r.x, r.y, 360, r.rad * 2.1 + 150, 0, 0.34 + 0.14 * pulse);
      }
      // the tail cone on the very tip of the first section (a point to the tail, not a blunt end) and a stump's cut face
      const t0 = parts[0], L0 = tubes.limbs[0];
      if (t0 && !t0.dead && L0 && !L0.dead && !stump[0] && L0.nr > 1) {
        const o = (L0.nr - 1) * 3, rad = L0.rad[L0.nr - 1];
        _M.makeBasis(_a.set(L0.T[o], L0.T[o + 1], L0.T[o + 2]), _b.set(L0.N1[o], L0.N1[o + 1], L0.N1[o + 2]), _c.set(L0.N2[o], L0.N2[o + 1], L0.N2[o + 2])).setPosition(L0.P[o], L0.P[o + 1], L0.P[o + 2]);
        _M.multiply(_S.makeScale(rad * 4.6, rad, rad));
        set.place('tailCone', _M);
        bt.set(ranges.tailCone, tintOf('e0', t0)[0], tintOf('e0', t0)[1], tintOf('e0', t0)[2]);
      } else set.place('tailCone', null);
      let stumpAt = null;
      for (let k = 0; k < 3; k++) if (stump[k]) { const L = tubes.limbs[k]; if (L && !L.dead && L.nr > 1) { const o = (L.nr - 1) * 3; stumpAt = { x: L.P[o], y: L.P[o + 1], z: L.P[o + 2], T: [L.T[o], L.T[o + 1], L.T[o + 2]], N1: [L.N1[o], L.N1[o + 1], L.N1[o + 2]], N2: [L.N2[o], L.N2[o + 1], L.N2[o + 2]], rad: L.rad[L.nr - 1] }; break; } }
      if (stumpAt) {
        _M.makeBasis(_a.set(...stumpAt.T), _b.set(...stumpAt.N1), _c.set(...stumpAt.N2)).setPosition(stumpAt.x + stumpAt.T[0] * 6, stumpAt.y + stumpAt.T[1] * 6, stumpAt.z + stumpAt.T[2] * 6);
        _M.multiply(_S.makeScale(1, stumpAt.rad * 0.97, stumpAt.rad * 0.97));
        set.place('stump', _M);
        bt.set(ranges.stump, 1.5, 1.5, 1.5);
        if (kNew && Ptc && !dying) { if (key & 1) { spark(Ptc, stumpAt.x, stumpAt.y, stumpAt.z + 40, 2, { speed: [120, 420] }); } if ((key & 3) === 0) dust(Ptc, stumpAt.x, stumpAt.y, stumpAt.z + 40, 1, { area: 60, size: [50, 100], life: [0.8, 1.4] }); }
        marks.halo(stumpAt.x, stumpAt.y, 340, stumpAt.rad * 2 + 100, 1, 0.3 + 0.15 * pulse);
      } else set.place('stump', null);
      // a section that was cut off: a burst of sparks and light where it left the body (the place is where its root was a moment ago)
      for (let k = 0; k < 3; k++) {
        const p = parts[k], L = tubes.limbs[k];
        if (p && !p.dead && L && !L.dead && L.nr > 1) S.lastRoot[SEC[k]] = { x: L.P[0], y: L.P[1], z: L.P[2], rad: L.rad[0] };
        const gone = !!p && (p.dead || p.severed) && !dying;
        if (gone && !S.cut.has(SEC[k])) {
          S.cut.add(SEC[k]);
          const at = S.lastRoot[SEC[k]] || { x: cr.x, y: -cr.y, z: 0, rad: 120 };
          if (Ptc) { Ptc.flash(at.x, at.y, at.z + 100, at.rad * 5, '#ffffff', { hdr: 2.2, alpha: 0.8, life: 0.22 }); Ptc.ring(at.x, at.y, at.z + 100, at.rad * 7, P.cut, 0.5); spark(Ptc, at.x, at.y, at.z + 100, 22, { speed: [200, 900] }); dust(Ptc, at.x, at.y, at.z + 100, 12, { area: 220, size: [90, 190] }); }
        }
        if (!gone && S.cut.has(SEC[k]) && p && !p.dead && !p.severed) S.cut.delete(SEC[k]);
      }

      // ---- THE HEAD: placed by the sim's head (its start is the neck's tip); it rolls over about its own axis as it comes about, so its back stays up ----
      const hs = head && !head.dead && head.segs[0] ? head.segs[0] : null, ms = mouth && !mouth.dead ? mouth : null;
      const scH = scaleOf(24, sk), headOn = !!hs && scH > 0.03;
      let headPos = null;
      if (headOn) {
        const ang = hs.ang, c = Math.cos(ang), roll = Math.PI * (1 - smooth((c + 0.3) / 0.6)), zH = ZC.HEAD + zOf(hs.y);
        _H.makeRotationZ(-ang); if (roll) _H.multiply(_Rm.makeRotationX(roll));
        _H.setPosition(hs.x, -hs.y, zH);
        if (scH < 0.999) _H.multiply(_S.makeScale(scH, scH, scH));
        headPos = { x: hs.x, y: -hs.y, z: zH, ang, c };
        // the jaw: sixths of the sim's openAmt (it hangs half open when it dies)
        const tg = dying ? Math.min(0.55, clamp(sk / 3, 0, 1) * 0.55) : ms ? clamp(ms.openAmt || 0, 0, 1) : 0, open = Math.round(tg * 6) / 6;
        const aJ = open * P.JAW, th = tintOf('head', head), tj = tintOf('mouth', mouth || head);
        if (S.jawKey !== aJ.toFixed(4)) { S.jawKey = aJ.toFixed(4); S.jawA = aJ; const pc = set.pieces.throat; pc.p0 = throatCorners(aJ); pc.key = null; }
        S.open = open;
        for (const nme of ['skull', 'brow', 'gill', 'eyeA', 'eyeB', 'teethU', 'throat']) set.place(nme, _H);
        _J.copy(_H).multiply(_T.makeTranslation(HEAD.HINGE[0], HEAD.HINGE[1], 0)).multiply(_Rm.makeRotationZ(-aJ)).multiply(_T.makeTranslation(-HEAD.HINGE[0], -HEAD.HINGE[1], 0));
        set.place('jaw', _J); set.place('teethL', _J);
        for (const nme of ['skull', 'brow', 'gill', 'teethU']) bt.set(ranges[nme], th[0], th[1], th[2]);
        for (const nme of ['jaw', 'teethL']) bt.set(ranges[nme], tj[0], tj[1], tj[2]);
        for (const nme of ['eyeA', 'eyeB']) { const f = head && head.hit > 0 ? 1.8 : 1; bt.set(ranges[nme], f, f, f); }
        // the glow channels: the eyes (1), the throat (2), the seams (3), the lantern (4)
        let eye = (head && head.hit > 0 ? G.hit : lerp(G.base * 0.55, G.base, rv('head'))) * (dying ? 1 - clamp(sk / 3, 0, 1) * (1 - G.dying / G.base) : 1);
        const throat = P.THROAT_GLOW.shut + (P.THROAT_GLOW.open - P.THROAT_GLOW.shut) * clamp(open, 0, 1);
        uniforms.uGlow.value.set(eye, throat * (0.6 + 0.4 * rv('mouth')), P.SEAM_GLOW.bright, uniforms.uGlow.value.w);
        if (open >= 0.5 && !S.wasOpen && Ptc && !dying) { const mp = _p.set(HEAD.x1 * 0.7, -60, 0).applyMatrix4(_H); Ptc.ring(mp.x, mp.y, zH + 200, 1400, P.throat, 0.5); dust(Ptc, mp.x, mp.y, zH + 200, 8, { area: 200, color: P.throatLt, speed: [60, 300] }); }
        S.wasOpen = open >= 0.5;
        if (open >= 0.5 && kNew && Ptc && !dying && (key & 1)) { const mp = _p.set(HEAD.x1 * 0.55, -110, 0).applyMatrix4(_H); dust(Ptc, mp.x, mp.y, zH + 160, 1, { area: 120, color: P.throatLt, size: [60, 120], life: [0.8, 1.4] }); }
        if (open >= 0.34 && !dying) { const mp = _p.set(HEAD.x1 * 0.5, -100, 0).applyMatrix4(_H); marks.halo(mp.x, mp.y, 330, 380 + 260 * open, 2, 0.28 * open); }
      } else for (const nme of ['skull', 'brow', 'gill', 'eyeA', 'eyeB', 'teethU', 'throat', 'jaw', 'teethL']) set.place(nme, null);

      // ---- THE CROWN, THE ROD AND THE LANTERN ----
      const cs = crown && !crown.dead && crown.segs[0] ? crown.segs[0] : null, ls = lamp && !lamp.dead && lamp.segs[0] ? lamp.segs[0] : null;
      const zC = (headPos ? headPos.z : zOf(cr.y)) + ZC.CROWN, scC = scaleOf(24, sk), tcr = tintOf('crown', crown);
      if (cs && scC > 0.03) {
        _M.makeTranslation(cs.x, -cs.y, zC);
        if (scC < 0.999) _M.multiply(_S.makeScale(scC, scC, scC));
        set.place('crown', _M); set.place('knob', _M);
        bt.set(ranges.crown, tcr[0], tcr[1], tcr[2]); bt.set(ranges.knob, tcr[0], tcr[1], tcr[2]);
        fins.crown(cs.x, -cs.y, zC, scC, lerp(0.35, 1, rv('crown')), [lerp(0.35, 1, rv('crown')), lerp(0.4, 1, rv('crown')), 1]);
      } else { set.place('crown', null); set.place('knob', null); }
      const lampLit = ev.lampLit || 0, scL = dying ? smooth(1 - (sk - 6.4) / 1.4) : 1;
      if (ls && cs && scL > 0.03) {
        const zL = (headPos ? headPos.z : zOf(cr.y)) + ZC.CROWN + 4;
        // the rod: a curve from the crown's top out and up to the lantern's cap
        const Sx = cs.x, Sy = -cs.y + CROWN.LEN + CROWN.R - 2, Ex = ls.x, Ey = -ls.y + 128 * scL, Qx = Sx + (Ex - Sx) * 0.12, Qy = Math.max(Sy, Ey) + 190;
        let px = Sx, py = Sy;
        for (let k = 0; k < NCORD; k++) {
          const u = (k + 1) / NCORD, ix = (1 - u) * (1 - u) * Sx + 2 * (1 - u) * u * Qx + u * u * Ex, iy = (1 - u) * (1 - u) * Sy + 2 * (1 - u) * u * Qy + u * u * Ey;
          const dx = ix - px, dy = iy - py, len = Math.hypot(dx, dy) || 1, rad = lerp(15, 9, k / (NCORD - 1)) * scL;
          _q.setFromUnitVectors(X_AX, _a.set(dx / len, dy / len, 0));
          _M.compose(_p.set(px, py, zL), _q, _s.set(len * 1.02, rad, rad));
          set.place('cord' + k, _M);
          bt.set(ranges['cord' + k], tcr[0], tcr[1], tcr[2]);
          px = ix; py = iy;
        }
        const tl = tintOf('lamp', lamp), flash = lamp.hit > 0;
        _M.makeTranslation(ls.x, -ls.y, zL).multiply(_S.makeScale(scL, scL, scL));
        const crate = lampLit === 2;
        set.place('lampCrate', crate ? _M : null);
        set.place('lampCore', crate ? null : _M);
        set.place('lampCage', crate ? null : _M);
        const k0 = flash ? 2 : 1;
        if (crate) bt.set(ranges.lampCrate, k0, k0, k0);
        else {
          const warm = lampLit === 1 ? [1.0, 0.86, 0.5] : [0.3, 0.5, 0.95]; // (gaping: a gold core in a cyan glow; hunting: a cold ember)
          bt.set(ranges.lampCore, warm[0] * k0, warm[1] * k0, warm[2] * k0);
          bt.set(ranges.lampCage, lerp(0.35, 1, lampLit ? 1 : 0.7) * tl[0], lerp(0.35, 1, lampLit ? 1 : 0.7) * tl[1], lerp(0.35, 1, lampLit ? 1 : 0.7) * tl[2]);
        }
        uniforms.uGlow.value.w = crate ? P.LAMP_GLOW.crate : lampLit === 1 ? P.LAMP_GLOW.glow : P.LAMP_GLOW.dark;
        const lx = ls.x, ly = -ls.y;
        if (crate) { // the lure: a gold pickup ring, a halo and a twinkle on the 8 fps key; red once the lookout has called it
          marks.halo(lx, ly, 360, 360 * scL, 0, 0.5 + 0.1 * pulse);
          marks.pickupRing(lx, ly, 380, 200 * scL, 1);
          const tw = (key % 3) === 0 ? 1 : (key % 3) === 1 ? 0.55 : 0.25;
          marks.twinkle(lx + 90, ly + 100, 390, 120 * tw + 40, 0.9);
          marks.twinkle(lx - 100, ly - 60, 390, 70 * (1.2 - tw) + 24, 0.7);
          if (ev.lure && ev.lure.live && ev.lure.known) marks.lureRing(ev.lure.x, -ev.lure.y, 400, 340 + (key % 2) * 16);
        } else if (lampLit === 1) { marks.halo(lx, ly, 360, 340 * scL, 1, 0.4); marks.halo(lx, ly, 362, 190 * scL, 0, 0.42); }
        else marks.halo(lx, ly, 360, 150 * scL, 1, 0.2);
        if (lampLit !== S.lamp) { // a new state of the lantern: a flash of its own colour
          if (S.lamp >= 0 && Ptc && !dying) { Ptc.flash(lx, ly, zL + 100, 520, lampLit === 2 ? P.gold : P.eye, { hdr: 1.8, alpha: 0.7, life: 0.2 }); spark(Ptc, lx, ly, zL + 100, 6, { color: lampLit === 2 ? P.goldLt : P.eyeLt, speed: [100, 360] }); }
          S.lamp = lampLit;
        }
      } else { for (const nme of ['lampCrate', 'lampCore', 'lampCage', ...Array.from({ length: NCORD }, (_, k) => 'cord' + k)]) set.place(nme, null); S.lamp = -1; }

      // ---- the BITE: the lantern's gold snaps shut; the SWALLOW: the red ring, the chevrons from the head, the lunge's streaks ----
      const act = ev.act || null;
      const bite = !!act && act.kind === 'bite';
      if (bite && !S.wasBite && Ptc && !dying) { Ptc.flash(act.x, -act.y, 420, 1400, P.gold, { hdr: 2.2, alpha: 0.85, life: 0.26 }); Ptc.ring(act.x, -act.y, 420, 1800, P.goldLt, 0.6); spark(Ptc, act.x, -act.y, 420, 30, { color: P.goldLt, speed: [300, 1100] }); dust(Ptc, act.x, -act.y, 420, 12, { area: 260, color: P.gold, size: [90, 190] }); }
      S.wasBite = bite;
      const rg = ev.ring || null;
      if (rg && !dying && fin(rg.x) && fin(rg.y)) {
        const u = Math.min(1, Math.floor((rg.t / Math.max(0.1, rg.T)) * 8) / 8);
        marks.swallow(rg.x, -rg.y, 390, rg.r, !!rg.locked, u);
        if (headPos) {
          const dx = rg.x - headPos.x, dy = -rg.y - headPos.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
          if (d > rg.r + 300) for (let k = 0; k < 3; k++) { const tt = rg.r + 140 + k * 220 + (rg.locked ? 0 : (key % 3) * 50); marks.chevron(rg.x - ux * tt, -rg.y - uy * tt, 400, 110, 130, Math.atan2(uy, ux), 1); }
        }
        if (rg.hit != null && S.ringHit !== rg) { S.ringHit = rg; if (Ptc) { if (rg.hit) { Ptc.flash(rg.x, -rg.y, 420, 1800, '#ff5040', { hdr: 2, alpha: 0.8, life: 0.25 }); Ptc.ring(rg.x, -rg.y, 420, 2200, P.ring, 0.6); spark(Ptc, rg.x, -rg.y, 420, 24, { color: '#ffb080', speed: [200, 900] }); } else dust(Ptc, rg.x, -rg.y, 400, 8, { area: 300, color: '#e8e4ff', size: [100, 200] }); } }
      }
      if (act && act.kind === 'swallow' && act.sub === 'lunge' && headPos && ev.V) {
        const vx = ev.V[2 * 24] || 0, vy = -(ev.V[2 * 24 + 1] || 0), sp = Math.hypot(vx, vy);
        if (sp > 400) { const rot = Math.atan2(vy, vx); for (let k = 0; k < 3; k++) marks.streak(headPos.x - Math.cos(rot) * (560 + k * 80), headPos.y - Math.sin(rot) * (560 + k * 80) + (k - 1) * 90 * Math.cos(rot), 340, 600 + k * 120, 120 - k * 28, rot, 0.75 - k * 0.12 + 0.1 * pulse); }
      }
      if (bite && headPos && ev.V) { const vx = ev.V[2 * 24] || 0, vy = -(ev.V[2 * 24 + 1] || 0); if (Math.hypot(vx, vy) > 500) { const rot = Math.atan2(vy, vx); marks.streak(headPos.x - Math.cos(rot) * 600, headPos.y - Math.sin(rot) * 600, 340, 640, 110, rot, 0.8); } }

      marks.end();
      fins.end();

      // ---- the DEATH: it goes limp as the sim sinks it and dissolves into stardust from the tail on (the head last, the lantern the very last) ----
      if (dying) {
        if (!S.died) {
          S.died = true;
          if (Ptc && headPos) { Ptc.flash(headPos.x, headPos.y, headPos.z + 200, 5200, '#ffffff', { hdr: 2, alpha: 0.8, life: 0.3 }); Ptc.ring(headPos.x, headPos.y, headPos.z + 200, 6000, P.stardust, 0.8); dust(Ptc, headPos.x, headPos.y, headPos.z + 200, 22, { area: 400, size: [140, 260], speed: [60, 400] }); spark(Ptc, headPos.x, headPos.y, headPos.z + 200, 18, { speed: [200, 900] }); }
        }
        if (kNew && Ptc && sk < 8.2) {
          let burst = 0;
          for (let li = 0; li < 4 && burst < 5; li++) {
            const p = parts[li], L = tubes.limbs[li];
            if (!p || p.dead || !L || L.dead || L.nr < 2) continue;
            for (let j = 0; j < Math.min(NSEG, p.segs.length) && burst < 5; j++) {
              const sc = scaleOf(gOf(li, j), sk);
              if (sc < 0.96 && sc > 0.1 && ((key + j + li) % 2) === 0) { const k = Math.min(L.nr - 1, j * tubes.Q + 1), o = k * 3; dust(Ptc, L.P[o], L.P[o + 1], L.P[o + 2] + 60, 3, { area: L.rad[k] * 0.9, size: [140, 280], hdr: 1.25, alpha: 0.7, life: [1.3, 2.5], speed: [20, 160] }); spark(Ptc, L.P[o], L.P[o + 1], L.P[o + 2] + 60, 3, { speed: [60, 360], size: [8, 14], life: [0.5, 1.1] }); burst++; }
            }
          }
          if (headPos && scH < 0.98 && scH > 0.05 && (key & 1)) { dust(Ptc, headPos.x, headPos.y, headPos.z + 120, 4, { area: 300, size: [160, 300], hdr: 1.25, alpha: 0.7, life: [1.3, 2.5] }); spark(Ptc, headPos.x, headPos.y, headPos.z + 120, 4, { speed: [100, 480], size: [8, 14], life: [0.5, 1.1] }); }
          if (ls && scL < 0.98 && scL > 0.05 && (key & 1)) dust(Ptc, ls.x, -ls.y, 300, 2, { area: 120, color: P.gold, size: [80, 170] });
        }
      }
    },
    // a section cut off falls as a Rapier body (creature.js makeChunk): its tube is baked running from the tail to the cut (the flat face is the tube's END), and its fins and caps ride along
    chunkBones(p) {
      const segs = p.segs, out = [];
      for (let i = segs.length - 1; i >= 0; i--) { const s = segs[i]; out.push({ x: s.x + Math.cos(s.ang) * s.len, y: s.y + Math.sin(s.ang) * s.len, ang: s.ang + Math.PI, len: s.len, r: s.r1, r1: s.r, behind: false }); }
      return out;
    },
    chunkExtra(p) {
      const segs = p.segs;
      if (!segs || !segs.length) return null;
      const grp = new THREE.Group(), fg = chunkFinGeometry(P, segs, tubes.Q), fm = new THREE.Mesh(fg, fins.material);
      fm.frustumCulled = false; fm.renderOrder = 6; fm.userData.toon = fins.material;
      grp.add(fm);
      const s0 = segs[0], s1 = segs[segs.length - 1], tx = s1.x + Math.cos(s1.ang) * s1.len, ty = -(s1.y + Math.sin(s1.ang) * s1.len), rad1 = s1.r1;
      const mats = [];
      const capMat = rimify(new THREE.MeshToonMaterial({ color: P.bodyDk, gradientMap })), discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.cut).multiplyScalar(1.7), side: THREE.DoubleSide });
      mats.push(capMat, discMat);
      // the tail end: a point (a cone along the chain's direction); the cut end (the chunk's root): the glowing face
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 14), capMat), hgt = rad1 * 4.6;
      cone.userData.toon = capMat;
      cone.position.set(tx + Math.cos(s1.ang) * hgt * 0.5, ty - Math.sin(s1.ang) * hgt * 0.5, 0);
      cone.rotation.z = -s1.ang - Math.PI / 2; // (the cone's apex is +y: turn it to point away from the body)
      cone.scale.set(rad1, hgt, rad1);
      grp.add(cone);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 20), discMat);
      disc.position.set(s0.x - Math.cos(s0.ang) * 4, -(s0.y - Math.sin(s0.ang) * 4), 0);
      disc.rotation.order = 'ZYX'; disc.rotation.y = Math.PI / 2; disc.rotation.z = -s0.ang;
      disc.scale.set(s0.r * 0.97, s0.r * 0.97, 1);
      grp.add(disc);
      return { mesh: grp, dispose() { fg.dispose(); cone.geometry.dispose(); disc.geometry.dispose(); for (const m of mats) m.dispose(); } };
    },
    dispose() {
      root.remove(bodyMesh, bodyInk);
      pieces.geometry.dispose();
      fins.dispose(); marks.dispose();
    },
  };
  void applyLook; void plainOf; void M4; void B; void Z_AX; void FLASH;
  return ext;
}
