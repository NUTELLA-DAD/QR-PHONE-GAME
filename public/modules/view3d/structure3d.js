// STRUCTURE IN 3D (STRUCTURE.md WP5, config.STRUCT3D, 3D.md section 36). The frame of a ship is a row of SEGMENTS (host/structure.js: a 240 px stretch of a deck with the hull under it, each with a soundness, state.frames). This is how the
// 3D view shows what is happening to them. It only READS the game: state.frames, the split note the simulation leaves on breakEvents (kind 'split'), the piece ships (ship.piece, ship.splitT) and their crash (ship.ctx.ship.down).
//
//   SOOT AND CRACKS   a hurt segment goes dark and charred as its soundness drops, and a web of cracks (dark core, pale splintered fringe) spreads out from the middle of it. The segments are written into rows 2-3 of the ship's
//                     damage data texture (parts3d/kit.js SEG_N, segTest): one more loop in the wall shader, no new draw call. Soot and cracks grow in steps on the 8 fps key (never faster than a step a key), they clear when
//                     the crew shore the segment up.
//   THE WARNING       a segment under WARN.AT soundness, and every segment that holds at 0 with the grace running, blinks a red-orange edge on both its ends and the cracks glow, on stepped keys (slow blink; fast and nearly
//                     steady in the last of the grace).
//   THE SEAM          while the grace runs a glowing jagged seam runs down the middle of the failing segment, top to bottom of the gondola there, with sparks and embers; a critical one (it will split her) is hot and wide.
//   THE SPLIT         the note of kind 'split' is read before the model is rebuilt: a white-hot flash in the gap, sparks, dust, smoke and torn planks (Rapier shards); both halves grow torn teeth on their cut ends; the half that falls
//                     (a ship with `piece`, the sim's own) tips seam end down and drifts away from the seam, trailing smoke and embers; it keeps the soot the whole ship had.
//   THE CRASH         the sim's breakPiece (ship.ctx.ship.down turns positive): the half breaks into three pieces and its big parts (destruction.js shatter: Rapier bodies) and throws planks and splinters (shards); dust and
//                     rock chips on rock, a big splash in the sea.
// Draw calls: the seam 1, the torn teeth 1 a half (2), the shards 1 (the picture and its ink in the same call) = 4 at most; the soot and cracks cost none. The particles are the vfx's. Nothing moves on a sine of time.
import { THREE, Batch, applyLook, look, toonVCInkS, plainVCInk, depthVCInk, piece, inkDouble } from './style.js';
import { SEG_N, DMG_W } from './parts3d/kit.js';
import { slabOf } from '../host/breakOff.js';
import { rowOf } from '../host/shipBuild.js';
import { config } from '../../config.js';

const fin = Number.isFinite;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ss = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const hashN = (n) => { let h = Math.imul((n | 0) ^ 0x9e3779b1, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerpA = (r, k) => r[0] + (r[1] - r[0]) * k;
const ZAX = new THREE.Vector3(0, 0, 1);
const BIG_KINDS = new Set(['gasbag', 'engine', 'gun', 'sail']); // the parts of a crashing half that are lifted out on their own (the rest of it is cut into the three pieces)

// a plank / splinter: 100 long, with knocked-about corners and a lighter end grain, its ink in the same mesh (one draw call for every shard)
function plankGeometry() {
  const g = new THREE.BoxGeometry(100, 16, 22, 4, 1, 1).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), end = Math.abs(x) > 49;
    const j = (a, b, c) => hashN(Math.round(a * 4) * 73856093 ^ Math.round(b * 4) * 19349663 ^ Math.round(c * 4) * 83492791);
    p.setXYZ(i, x + (end ? (j(x, y, z) - 0.5) * 12 : 0), y + (j(y, z, x) - 0.5) * 4, z + (j(z, x, y) - 0.5) * 5);
  }
  g.computeVertexNormals();
  const out = piece(g, '#ffffff', null, 2);
  g.dispose();
  const c = out.attributes.color, pos = out.attributes.position;
  for (let i = 0; i < c.count; i++) { const k = Math.abs(pos.getX(i)) > 49 ? 1.08 : 0.86 + 0.12 * hashN(Math.floor(i / 3) * 7 + 1); c.setXYZ(i, k, k, k); }
  return inkDouble(out);
}

export function createStructure3d({ parent, state, models, destruction, world, P, sea }) {
  const K = () => config.STRUCT3D || {};
  const getP = () => { try { return typeof P === 'function' ? P() : P; } catch { return null; } };
  const getSea = () => { try { const v = typeof sea === 'function' ? sea() : sea; return fin(v) ? v : null; } catch { return null; } };
  const stats = { segs: 0, writes: 0, seams: 0, splits: 0, teeth: 0, crashes: 0, shards: 0, calls: 0, ms: 0, pieces: 0 };
  const recs = new Map(); // ship id -> { model, segs: Map(sig -> { soot, crack }), k8, sig, n, seamMesh, seamSig, teethModel, teethMesh }
  const lastSegs = new Map(); // ship id -> [{ id, x0, x1, hp }] as of the last frame (what a half that splits off was wearing)
  const pieces = new Map(); // piece ship id -> { parent, dir, seamX, inherit, crashed, seen }
  const cutsOf = new Map(); // ship id -> [{ id, a, b }] the cut line a half came from (the torn teeth)
  const pending = []; // splits read off a note, waiting for their piece to turn up: { parent, A, B, cuts, snap, t }
  const evSeen = new WeakSet();
  const glows = []; // the white-hot glow left in a gap: { x, y, z, k0 }
  let lastK8 = -1, broken = false, warned = '';
  const _w = new THREE.Vector3(), _w2 = new THREE.Vector3();
  const logOnce = (what, e) => { const m = what + ': ' + String(e && e.message ? e.message : e); if (m !== warned) { warned = m; console.warn('view3d structure3d', m); } };

  // ---- the shards: planks and splinters on Rapier bodies (destruction.bodies, kind 'shard'), ONE instanced mesh ---------------------------------------------------------------------------------------
  const shardGeo = plankGeometry();
  const shardMesh = new THREE.InstancedMesh(shardGeo, toonVCInkS, 64);
  shardMesh.userData.toon = toonVCInkS; shardMesh.userData.plain = plainVCInk;
  shardMesh.customDepthMaterial = depthVCInk;
  if (!look.toon) shardMesh.material = plainVCInk;
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  shardMesh.setColorAt(0, new THREE.Color('#ffffff')); shardMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  shardMesh.frustumCulled = false; shardMesh.castShadow = false; shardMesh.receiveShadow = false;
  shardMesh.count = 0; shardMesh.visible = false; shardMesh.name = 'structShards';
  parent.add(shardMesh);
  const shards = []; // { x, y, z, q, rot, spin, vx, vy, s, color, age, life, id, rest }
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), S3 = new THREE.Vector3(), CO = new THREE.Color();
  const shardRnd = mulberry(20261013);
  function addShard(o) {
    const KS = K().SHARD || {}, cap = Math.min(KS.CAP || 40, 64);
    if (shards.length >= cap) return null;
    const c = { x: o.x, y: o.y, z: o.z, rot: o.rot || 0, spin: o.spin || 0, vx: o.vx, vy: o.vy, s: clamp(o.len / 100, 0.25, 2), color: new THREE.Color(o.color || '#b98a56'), age: 0, life: o.life, id: null, rest: false };
    c.q = new THREE.Quaternion().setFromAxisAngle(ZAX, c.rot);
    const B = destruction && destruction.bodies;
    if (B && B.ready) {
      const len = c.s * 100;
      c.id = B.add({ pos: [c.x, c.y, c.z], quat: [c.q.x, c.q.y, c.q.z, c.q.w], vel: [c.vx, c.vy], ang: [0, 0, c.spin], boxes: [{ cx: 0, cy: 0, cz: 0, hx: len * 0.47, hy: len * 0.08, hz: Math.min(len * 0.11, 40) }], rel: 0.55, mat: 'shard', kind: 'shard' });
    }
    shards.push(c);
    stats.shards++;
    return c;
  }
  function stepShards(dt) {
    const B = destruction && destruction.bodies, rd = {}, G = config.BREAKOFF.DEBRIS.GRAVITY, KS = K().SHARD || {};
    for (let i = shards.length - 1; i >= 0; i--) {
      const c = shards[i];
      c.age += dt;
      if (c.age >= c.life || c.y < -40000) { if (c.id && B) B.remove(c.id); shards.splice(i, 1); continue; }
      if (c.id && B && B.read(c.id, rd)) { c.x = rd.x; c.y = rd.y; c.z = rd.z; c.q.set(rd.qx, rd.qy, rd.qz, rd.qw); }
      else if (!c.id && !c.rest) { // by hand (the engine is not here yet): gravity, a spin, no floor
        c.vy -= G * dt;
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.rot += c.spin * dt;
        c.q.setFromAxisAngle(ZAX, c.rot);
      }
    }
    let n = 0;
    const fade = Math.max(0.1, KS.FADE || 0.7);
    for (const c of shards) {
      if (n >= 64) break;
      const left = c.life - c.age, f = left < fade ? ss(left / fade) : 1;
      if (f <= 0.02) continue;
      M4.compose(V3.set(c.x, c.y, c.z), c.q, S3.set(c.s * f, c.s * f, c.s * f));
      shardMesh.setMatrixAt(n, M4); shardMesh.setColorAt(n, c.color); n++;
    }
    shardMesh.count = n; shardMesh.visible = n > 0;
    shardMesh.instanceMatrix.needsUpdate = true; if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  }
  // planks and splinters thrown from a point of the 3D world: n of them, outward (+ up)
  function throwShards(x, y, z, n, o = {}) {
    const KS = K().SHARD || {}, life = KS.LIFE || [5, 7.5], cols = KS.COLORS || ['#b98a56'];
    for (let k = 0; k < n; k++) {
      const a = o.dir != null ? o.dir + (shardRnd() - 0.5) * 2 * (o.spread == null ? 1.2 : o.spread) : shardRnd() * Math.PI * 2, sp = lerpA(o.speed || [120, 420], shardRnd());
      addShard({ x: x + (shardRnd() - 0.5) * (o.area || 0), y: y + (shardRnd() - 0.5) * (o.area || 0) * 0.5, z: z + (shardRnd() - 0.5) * 50, vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp * 0.8 + (o.up == null ? 160 : o.up) * (0.4 + shardRnd()) + (o.vy || 0), rot: shardRnd() * Math.PI * 2, spin: (shardRnd() - 0.5) * 12, len: lerpA(o.len || [50, 120], shardRnd()), color: cols[(shardRnd() * cols.length) | 0], life: lerpA(life, shardRnd()) });
    }
  }

  // ---- world points -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const wpt = (model, x, y, z = 0, out = _w) => model.content.localToWorld(out.set(model.X(x), model.Y(y), z));

  // ---- 1. the segments -> rows 2 and 3 of the ship's damage texture --------------------------------------------------------------------------------------------------------------------------------
  const sootOf = (hp) => { const S = K().SOOT || {}, f = S.FROM == null ? 0.95 : S.FROM, u = S.FULL == null ? 0.1 : S.FULL; return ss((f - hp) / Math.max(0.01, f - u)) * (S.MAX == null ? 1 : S.MAX); };
  const crackOf = (hp) => { const C = K().CRACK || {}, f = C.FROM == null ? 0.8 : C.FROM; return clamp((f - hp) / Math.max(0.01, f - (C.FULL == null ? 0.08 : C.FULL)), 0, 1); };
  // how much of a piece's (or a ship's) own frame was already hurt before it split off: the worst of the old segments on the same deck that overlap this one
  function inheritedHp(g, snap) {
    let hp = 1;
    for (const s of snap) if (s.id === g.id && Math.min(s.x1, g.x1) - Math.max(s.x0, g.x0) >= 0.3 * Math.min(s.x1 - s.x0, g.x1 - g.x0)) hp = Math.min(hp, s.hp);
    return hp;
  }
  function writeSegments(sh, model, rec, k8, keyed, pe) {
    const st = sh.ctx || state, fr = st.frames, mats = model.ctx && model.ctx.mats;
    if (!Array.isArray(fr) || !mats || !mats.dmgData || !mats.uSegN) return;
    const KK = K(), SOOT = KK.SOOT || {}, CR = KK.CRACK || {}, WARN = KK.WARN || {}, EXT = KK.EXT || {};
    const steps = Math.max(1, CR.STEPS || 10), live = !pe && !sh.piece;
    const raw = [], list = [];
    for (const g of fr) {
      if (!g || !fin(g.hp) || !fin(g.x0) || !fin(g.x1) || !fin(g.y0) || !fin(g.y1)) continue;
      raw.push({ id: g.id, x0: g.x0, x1: g.x1, hp: g.hp });
      let hp = clamp(g.hp, 0, 1);
      if (pe) hp = Math.min(hp, inheritedHp(g, pe.inherit));
      let s = rec.segs.get(g.sig);
      const tSoot = sootOf(hp), tCrack = crackOf(hp);
      if (!s) { s = { soot: tSoot, crack: tCrack }; rec.segs.set(g.sig, s); } // (seen for the first time already hurt: it is simply that way, nothing grows)
      s.seen = k8;
      if (keyed) {
        s.soot = tSoot > s.soot ? Math.min(tSoot, s.soot + (SOOT.UP || 0.1)) : Math.max(tSoot, s.soot - (SOOT.DOWN || 0.25));
        s.crack = tCrack > s.crack ? Math.min(tCrack, s.crack + (CR.GROW || 0.125)) : Math.max(tCrack, s.crack - 2 * (CR.GROW || 0.125));
      }
      const crack = s.crack > 0.02 ? Math.max(1 / steps, Math.round(s.crack * steps) / steps) : 0, soot = Math.round(s.soot * 16) / 16;
      const level = !live ? 0 : g.hold ? 2 : hp < (WARN.AT == null ? 0.3 : WARN.AT) ? 1 : 0;
      if (soot < 0.02 && crack <= 0 && !level) continue;
      let on = true;
      if (level === 2) { const late = g.hold && g.hold.max > 0 && g.hold.t / g.hold.max > (WARN.LATE == null ? 0.7 : WARN.LATE); on = late ? (k8 & 3) !== 3 : (k8 & 1) === 0; } // (held at 0: a four-a-second blink, nearly steady in the last of the grace)
      else if (level === 1) on = ((k8 >> 1) & 1) === 0; // (two keys on, two off)
      list.push({ g, soot, crack, warn: level ? (on ? level : level * (WARN.DIM == null ? 0.22 : WARN.DIM)) : 0, level });
    }
    lastSegs.set(sh.id, raw);
    if (keyed) for (const [sig, s] of rec.segs) if (k8 - (s.seen == null ? k8 : s.seen) > 16) rec.segs.delete(sig); // (a segment that is gone from the frame)
    list.sort((a, b) => b.level - a.level || b.soot - a.soot);
    if (list.length > SEG_N) list.length = SEG_N;
    // the extent of each segment on the wall: its deck's slab; the lowest / highest of a column also covers the hull below / above
    const X = model.X, Y = model.Y;
    const rows = list.map((r) => {
      const g = r.g;
      let lo = g.y1, hi = g.y0;
      let below = false, above = false;
      for (const o of fr) {
        if (o === g || o.nest || !fin(o.x0) || Math.min(o.x1, g.x1) - Math.max(o.x0, g.x0) < 20) continue;
        if (o.y1 > g.y1 + 2) below = true;
        if (o.y0 < g.y0 - 2) above = true;
      }
      if (!below) lo += EXT.DOWN == null ? 70 : EXT.DOWN;
      if (!above) hi -= EXT.UP == null ? 50 : EXT.UP;
      return [X(g.x0), Y(lo), X(g.x1), Y(hi), r.soot, r.crack, r.warn, (hashStr(String(g.sig)) % 997) * 0.37];
    });
    const sig = rows.map((r) => r.map((v) => (v === 0 ? 0 : Math.round(v * 100) / 100)).join(',')).join(';');
    if (sig === rec.sig) return;
    rec.sig = sig;
    const d = mats.dmgData, n = rows.length;
    for (let i = 0; i < Math.max(n, rec.n || 0); i++) {
      const r = rows[i] || [0, 0, 0, 0, 0, 0, 0, 0], a = (2 * DMG_W + i) * 4, b = (3 * DMG_W + i) * 4;
      d[a] = r[0]; d[a + 1] = r[1]; d[a + 2] = r[2]; d[a + 3] = r[3];
      d[b] = r[4]; d[b + 1] = r[5]; d[b + 2] = r[6]; d[b + 3] = r[7];
    }
    rec.n = n;
    mats.uSegN.value = n;
    if (mats.dmgTex) mats.dmgTex.needsUpdate = true;
    stats.writes++;
    stats.segs += n;
  }

  // ---- 2. the seam of a column that is about to give way ---------------------------------------------------------------------------------------------------------------------------------------------
  const seamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false, forceSinglePass: true });
  const _c = new THREE.Color();
  // the segments whose grace is running, grouped into COLUMNS: the segments of different decks that stand over each other fail together (a split needs the whole cross-section), so one seam runs through all of them
  function seamGroups(fr) {
    const groups = [];
    for (const g of fr) {
      if (!g || !g.hold || g.nest || !fin(g.x0) || !fin(g.x1) || !fin(g.y0) || !fin(g.y1)) continue;
      let grp = groups.find((q) => Math.min(q.x1, g.x1) - Math.max(q.x0, g.x0) > 30);
      if (!grp) groups.push((grp = { x0: g.x0, x1: g.x1, segs: [] }));
      grp.segs.push(g);
      grp.x0 = Math.min(grp.x0, g.x0); grp.x1 = Math.max(grp.x1, g.x1);
    }
    for (const q of groups) {
      q.critical = q.segs.some((g) => g.critical);
      q.prog = Math.max(...q.segs.map((g) => (g.hold.max > 0 ? clamp(g.hold.t / g.hold.max, 0, 1) : 1)));
      q.cx = q.segs.reduce((a, g) => a + (g.x0 + g.x1) / 2, 0) / q.segs.length;
      q.lo = Math.max(...q.segs.map((g) => g.y1)); q.hi = Math.min(...q.segs.map((g) => g.y0)); // (every deck that stands in the column: the cross-section top to bottom)
      for (const o of fr) { if (o.nest || !fin(o.x0) || !fin(o.y0) || Math.min(o.x1, q.x1) - Math.max(o.x0, q.x0) < 30) continue; q.lo = Math.max(q.lo, o.y1); q.hi = Math.min(q.hi, o.y0); }
      q.sig = q.segs.map((g) => g.sig).sort().join('+');
    }
    return groups;
  }
  function seamGeometry(groups, model, KS) {
    const pos = [], col = [];
    const quad = (ax, ay, bx, by, cx, cy, dx, dy, ca, cb, cc, cd) => { // two triangles a b c / a c d, each corner an [r, g, b, a]
      for (const [px, py, c] of [[ax, ay, ca], [bx, by, cb], [cx, cy, cc], [ax, ay, ca], [cx, cy, cc], [dx, dy, cd]]) { pos.push(px, py, 0); col.push(c[0], c[1], c[2], c[3]); }
    };
    for (const q of groups) {
      const big = q.critical, k = q.prog, minor = big ? 1 : KS.MINOR == null ? 0.55 : KS.MINOR;
      const yb = model.Y(q.lo + 24), yt = model.Y(q.hi - 8), cx = model.X(q.cx), n = Math.max(3, Math.round((yt - yb) / (KS.STEP || 24)));
      const jag = (KS.JAG == null ? 15 : KS.JAG) * (0.6 + 0.4 * k), seed = hashStr(q.sig);
      const px = [], py = [];
      for (let i = 0; i <= n; i++) { const taper = clamp(Math.min(i, n - i) / 1.5, 0.15, 1); px.push(cx + (hashN(seed + i * 131) - 0.5) * 2 * jag * taper); py.push(yb + ((yt - yb) * i) / n); }
      const gw = lerpA(KS.GLOW || [26, 54], k) * minor * 0.5, cw = lerpA(KS.CORE || [4, 10], k) * minor * 0.5;
      const warm = _c.set(big ? KS.GLOW_COLOR || '#ff6a1c' : '#ffa636'), gh = KS.GLOW_HDR || 0.9, gr = warm.r * gh, gg = warm.g * gh, gb = warm.b * gh, ga = (0.45 + 0.35 * k) * (big ? 1 : 0.8);
      const cc = _c.set(KS.CORE_COLOR || '#ffe2b0'), hdr = (KS.HDR || 2.1) * (big ? 1 : 0.8), cr = cc.r * hdr, cg = cc.g * hdr, cb = cc.b * hdr;
      const G0 = [gr, gg, gb, 0], G1 = [gr, gg, gb, ga], C1 = [cr, cg, cb, 1];
      for (let i = 0; i < n; i++) {
        const x0 = px[i], x1 = px[i + 1], y0 = py[i], y1 = py[i + 1];
        quad(x0 - gw, y0, x0, y0, x1, y1, x1 - gw, y1, G0, G1, G1, G0); // the soft glow: faded at both edges, brightest on the seam
        quad(x0, y0, x0 + gw, y0, x1 + gw, y1, x1, y1, G1, G0, G0, G1);
        quad(x0 - cw, y0, x0 + cw, y0, x1 + cw, y1, x1 - cw, y1, C1, C1, C1, C1); // the white-hot core
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
    geo.computeBoundingSphere();
    return geo;
  }
  const dropMesh = (m) => { if (m) { m.removeFromParent(); if (m.geometry) m.geometry.dispose(); } };
  const rng = mulberry(777);
  function stepSeam(sh, model, rec, k8, keyed, Pt) {
    const KS = (K().SEAM) || {}, st = sh.ctx || state, fr = st.frames || [];
    const groups = sh.piece ? [] : seamGroups(fr), STEPS = Math.max(1, KS.STEPS || 8);
    for (const q of groups) q.prog = Math.round(q.prog * STEPS) / STEPS;
    const sig = groups.map((q) => q.sig + ':' + Math.round(q.prog * STEPS) + ':' + (q.critical ? 1 : 0)).join('|') + '@' + model.layout.version;
    if (!groups.length) { if (rec.seamMesh) rec.seamMesh.visible = false; rec.seamSig = ''; return; }
    if (sig !== rec.seamSig) {
      rec.seamSig = sig;
      dropMesh(rec.seamMesh);
      rec.seamMesh = new THREE.Mesh(seamGeometry(groups, model, KS), seamMat);
      rec.seamMesh.frustumCulled = false; rec.seamMesh.renderOrder = 10; rec.seamMesh.name = 'structSeam'; rec.seamMesh.castShadow = rec.seamMesh.receiveShadow = false;
      model.content.add(rec.seamMesh);
      stats.seams++;
    }
    const side = (model.viewSide || 1) >= 0 ? 1 : -1, Z = side * (KS.Z || 74);
    rec.seamMesh.visible = true;
    rec.seamMesh.position.z = Z;
    // the glow beats on the key: bright, a little dimmer, bright ... (a held two-step, nearly steady near the end)
    const hot = groups.some((q) => q.prog > 0.7);
    seamMat.color.setScalar(hot ? ((k8 & 3) === 3 ? 0.7 : 1) : (k8 & 1) ? 0.62 : 1);
    if (!Pt || !keyed) return;
    for (const q of groups) { // sparks and embers jump out of the seam (on the key; more as the grace runs out)
      if (k8 % (KS.SPARK_EVERY || 2)) continue;
      const n = Math.round(lerpA(KS.SPARKS || [2, 5], q.prog) * (q.critical ? 1 : 0.5));
      for (let i = 0; i < n; i++) {
        const y = q.hi + (q.lo - q.hi) * rng(), c = wpt(model, q.cx, y, Z, _w2);
        Pt.burst('spark', c.x, c.y, c.z + 10, 1, { speed: [90, 330], life: [0.3, 0.7], size: [4, 8], color: q.critical ? '#ffc24a' : '#ffb04a', ay: -650, dir: Math.PI / 2, spread: 1.5 });
      }
      if (!(k8 % (KS.EMBER_EVERY || 4))) {
        const y = q.hi + (q.lo - q.hi) * rng(), c = wpt(model, q.cx, y, Z, _w2);
        Pt.burst('ember', c.x, c.y, c.z + 10, 1, { speed: [10, 60], life: [0.7, 1.3], size: [6, 10], up: [40, 120], color: '#ff8a2a' });
        Pt.burst('smoke', c.x, c.y, c.z - 10, 1, { size: [20, 34], size1: 1.9, life: [0.9, 1.5], color: '#5a5452', alpha: 0.5, up: [30, 70], speed: [5, 30] });
      }
    }
  }

  // ---- 3. the torn teeth on the cut ends of the halves ------------------------------------------------------------------------------------------------------------------------------------------------
  function stepTeeth(sh, model, rec) {
    const cuts = cutsOf.get(sh.id);
    if (!cuts || rec.teethModel === model) return;
    rec.teethModel = model;
    const L = model.layout, SP = K().SPLIT || {}, cols = SP.TEETH_COLORS || ['#e2c590', '#b98a5a'];
    const edges = [];
    L.platforms.forEach((q, d) => {
      for (const c of cuts) {
        if (c.id !== q.id) continue;
        if (Math.abs(q.x1 - c.a) < 8) edges.push({ x: q.x1, dir: 1, d, q });
        if (Math.abs(q.x0 - c.b) < 8) edges.push({ x: q.x0, dir: -1, d, q });
      }
    });
    if (!edges.length) return;
    const B = new Batch(), r = mulberry(hashStr(sh.id + ':teeth'));
    const nT = Math.max(2, SP.TEETH || 5), TL = SP.TOOTH || [22, 60];
    for (const e of edges) {
      const slab = slabOf(e.q, L.platforms), zh = Math.max(40, (model.ctx && model.ctx.zHalfAt ? model.ctx.zHalfAt(e.d, e.x) : 110) - 14), yBot = model.Y(slab.y1), yTop = model.Y(slab.y0);
      for (let k = 0; k < nT; k++) {
        const yy = yBot + (yTop - yBot) * ((k + 0.3 + 0.5 * r()) / nT), len = lerpA(TL, r()), th = 5 + r() * 5, dep = 9 + r() * 9, rot = (r() - 0.5) * (k % 3 === 2 ? 2.2 : 0.8), zz = (r() - 0.5) * 2 * zh;
        const dx = e.dir * Math.cos(rot), dy = Math.sin(rot);
        B.box(cols[(r() * cols.length) | 0], model.X(e.x) + dx * len * 0.5, yy + dy * len * 0.5, zz, len, th, dep, 1.4, 0, 0, Math.atan2(dy, dx));
      }
    }
    dropMesh(rec.teethMesh);
    const grp = B.build({ cast: false, receive: false, one: true, small: false });
    grp.name = 'structTeeth';
    grp.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    model.content.add(grp);
    applyLook(grp);
    rec.teethMesh = grp;
    stats.teeth++;
  }

  // ---- 4. a split on a note: the moment, and the record of it for the piece that turns up --------------------------------------------------------------------------------------------------
  function onSplit(sh, ev, t) {
    const e = models.get(sh.id), model = e && e.model, split = ev.plan && ev.plan.split, cuts = ((split && split.cuts) || []).filter((c) => fin(c.a) && fin(c.b));
    const A = cuts.length ? Math.min(...cuts.map((c) => c.a)) : ev.origin.x, B = cuts.length ? Math.max(...cuts.map((c) => c.b)) : ev.origin.x;
    pending.push({ parent: sh.id, A, B, cuts, snap: (lastSegs.get(sh.id) || []).map((s) => ({ ...s })), t });
    if (pending.length > 6) pending.shift();
    cutsOf.set(sh.id, cuts);
    stats.splits++;
    if (!model || !model.content) return;
    const SP = K().SPLIT || {}, Pt = getP(), midY = ev.origin.y, L = sh.layout;
    // the gap: where the cut is, as tall as the decks there
    let lo = -1e9, hi = 1e9;
    const GON = (config.STRUCTURE && config.STRUCTURE.GONDOLA) || ['main', 'lower', 'keel', 'deep'];
    for (const q of L.platforms) { if (Math.min(q.x1, B) - Math.max(q.x0, A) < 20 || !GON.includes(rowOf(q))) continue; const s = slabOf(q, L.platforms); lo = Math.max(lo, s.y1); hi = Math.min(hi, s.y0); } // (the gondola's own decks: the glow sits in the middle of the cut, not up at the catwalk)
    if (!(lo > hi)) { lo = midY + 80; hi = midY - 120; }
    const c = wpt(model, (A + B) / 2, (lo + hi) / 2, 0, new THREE.Vector3()), halfH = (lo - hi) / 2, gapW = Math.max(120, B - A);
    glows.push({ x: c.x, y: c.y, z: c.z, k0: -1, size: SP.FLASH || 640 });
    if (Pt) {
      Pt.spawn('flash', c.x, c.y, c.z + 50, { size: SP.FLASH || 420, size1: 1.3, life: 0.14, color: '#fff0c8', hdr: 2.6, alpha: 0.9, force: true });
      Pt.ring(c.x, c.y, c.z + 30, SP.RING || 520, '#ffc27a', 0.4, { alpha: 0.7, force: true });
      Pt.burst('spark', c.x, c.y, c.z + 40, SP.SPARKS || 48, { speed: [200, 760], life: [0.4, 1.0], size: [5, 10], color: '#ffc24a', area: gapW * 0.35, force: true, ay: -700 });
      Pt.burst('dust', c.x, c.y - halfH * 0.4, c.z + 20, SP.DUST || 14, { area: gapW * 0.45, size: [60, 120], size1: 2.2, life: [0.9, 1.6], speed: [30, 200], up: [10, 120], color: '#b9a98a', alpha: 0.8, force: true });
      Pt.burst('smoke', c.x, c.y, c.z - 10, SP.SMOKE || 6, { area: gapW * 0.4, size: [34, 64], size1: 1.9, life: [1.2, 2.2], color: '#58524f', alpha: 0.7, speed: [10, 70], up: [30, 90], force: true });
      Pt.splinters(c.x, c.y, c.z + 20, 18, { kind: 'wood', speed: [200, 560], up: 200 });
    }
    // torn planks: thrown out of the gap to both sides, falling on Rapier bodies
    throwShards(c.x, c.y, c.z, SP.PLANKS || 14, { area: gapW * 0.6, speed: [160, 520], dir: Math.PI / 2, spread: 1.6, up: 220, len: [60, 130] });
  }

  // a piece ship seen for the first time: which end is the seam, and what the whole ship was wearing
  function registerPiece(sh, model) {
    const parent = sh.id.replace(/-piece\d*$/, ''), lb = sh.layout.bounds, cx = lb ? (lb.x0 + lb.x1) / 2 : model.pv;
    const pi = pending.findIndex((p) => p.parent === parent), sp = pi >= 0 ? pending.splice(pi, 1)[0] : null;
    let dir = 1, seamX = cx;
    if (sp) { seamX = (sp.A + sp.B) / 2; dir = seamX > cx ? 1 : -1; cutsOf.set(sh.id, sp.cuts); }
    else { const par = state.ships.find((s) => s.id === parent), pb = par && par.layout.bounds; dir = pb && (pb.x0 + pb.x1) / 2 > cx ? 1 : -1; seamX = lb ? (dir > 0 ? lb.x1 : lb.x0) : cx; }
    const pe = { parent, dir, seamX, inherit: sp ? sp.snap : [], crashed: false, seen: true, base: null };
    pieces.set(sh.id, pe);
    stats.pieces++;
    return pe;
  }

  // ---- 5. the crash of a half that split off -------------------------------------------------------------------------------------------------------------------------------------------------------------
  function crash(sh, e, pe, t) {
    const model = e.model, L = sh.layout, b = L.bounds, KC = K().CRASH || {};
    pe.crashed = true;
    stats.crashes++;
    if (!b || !model.content) return;
    const Pt = getP(), halfW = Math.max(120, (b.x1 - b.x0) / 2), imp = wpt(model, (b.x0 + b.x1) / 2, b.y1, 0, new THREE.Vector3());
    const seaY = getSea(), inSea = seaY != null && -imp.y >= seaY - 90;
    // the break-up: the three pieces the sim made (its debris list) and the biggest parts, as Rapier bodies (destruction.js take)
    const ds = (state.debris || []).filter((d) => d.ship === sh && d.box);
    const pcs = ds.length ? ds.map((d) => ({ box: d.box, clips: d.clips && d.clips.length ? d.clips : [d.box] })) : [0, 1, 2].map((k) => { const w = (b.x1 - b.x0) / 3, x0 = b.x0 + k * w, box = { x0, y0: b.y0, x1: x0 + w, y1: b.y1 }; return { clips: [box], box }; });
    const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
    const big = (L.partRects || []).filter((r) => { const m = model.parts.get(r.id); return m && BIG_KINDS.has(m.kind); }).sort((p, q) => area(q) - area(p)).slice(0, KC.KEEP_PARTS == null ? 6 : KC.KEEP_PARTS);
    const ev = { plan: { pieces: pcs }, origin: { x: L.midPoint.x, y: L.midPoint.y }, blast: true, noChunks: true, clipAll: true, cause: 'crash', t: Math.round((sh.splitT || 0) * 1000) + 7, ver: L.version, lostKeys: big.map((r) => r.id), lostRects: big.map((r) => ({ ...r })) };
    if (destruction && destruction.shatter) destruction.shatter(sh, ev);
    model.shattered = true;
    model.root.visible = false;
    if (!Pt) return;
    const touching = !!(sh.ctx && sh.ctx.grounded); // (the sim says she touched rock or the waves; a half that simply ran out of its 45 s breaks up in the air: no dust, no splash)
    if (!touching) {
      Pt.explosion(imp.x, imp.y + 120, 70, 1.4, { wood: true, smoke: true });
    } else if (inSea) {
      const sz = KC.SPLASH || 520;
      if (world && world.splashAt) { world.splashAt(imp.x - halfW * 0.25, -imp.y, sz, 40); world.splashAt(imp.x + halfW * 0.25, -imp.y, sz * 0.7, 40); }
      Pt.burst('drop', imp.x, imp.y, 50, KC.DROPS || 36, { dir: Math.PI / 2, spread: 0.85, speed: [260, 720], size: [10, 22], up: [120, 320], area: halfW * 0.7, force: true });
      Pt.burst('dust', imp.x, imp.y + 30, 60, (KC.DUST || 18) * 0.8, { area: halfW * 0.8, size: [80, 150], size1: 2.2, life: [0.9, 1.7], speed: [60, 260], up: [60, 200], color: '#e6f1f4', alpha: 0.8, force: true });
      Pt.flash(imp.x, imp.y + 50, 70, 300, '#fff0d0', { hdr: 2, life: 0.12, alpha: 0.8, force: true });
      Pt.burst('steam', imp.x, imp.y + 30, 70, 8, { area: halfW * 0.7, size: [50, 90], size1: 2, life: [0.8, 1.5], up: [60, 160], speed: [20, 90], color: '#f4f7f7', alpha: 0.7, force: true });
      Pt.splinters(imp.x, imp.y + 20, 60, 12, { kind: 'wood', speed: [180, 520], up: 220 });
    } else {
      Pt.explosion(imp.x, imp.y + 50, 70, 1.5, { wood: true, smoke: true });
      Pt.burst('dust', imp.x, imp.y + 12, 60, KC.DUST || 18, { area: halfW * 0.75, size: [70, 140], size1: 2.2, life: [0.9, 1.7], speed: [80, 320], up: [20, 130], color: '#b8a888', alpha: 0.85, force: true });
      Pt.splinters(imp.x, imp.y, 60, 14, { kind: 'rock', speed: [180, 520], up: 200 });
      Pt.burst('spark', imp.x, imp.y + 10, 70, KC.SPARKS || 40, { speed: [200, 700], life: [0.4, 1.0], size: [5, 9], color: '#ffc24a', area: halfW * 0.5, force: true, ay: -700 });
    }
    Pt.burst('smoke', imp.x, imp.y + 40, 40, KC.SMOKE || 8, { area: halfW * 0.6, size: [44, 80], size1: 1.9, life: [1.3, 2.4], color: '#4e4947', alpha: 0.75, speed: [10, 60], up: [30, 100], force: true });
    const sp = KC.SHARD_SPEED || [120, 520];
    throwShards(imp.x, imp.y + 40, 20, KC.SHARDS == null ? 18 : KC.SHARDS, { area: halfW * 1.1, speed: sp, dir: Math.PI / 2, spread: 1.5, up: 260, len: KC.SHARD_LEN || [50, 130] });
  }

  // ---- the frame ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const API = {
    stats,
    // call first thing in a frame, BEFORE destruction.process() (the notes are still on the ships and the old models are still whole): reads the 'split' notes (it leaves them for destruction.js) and breaks up a half that has just crashed
    pre(t) {
      if (broken || K().ENABLED === false) return;
      try {
        for (const sh of state.ships) {
          const q = sh.ctx && sh.ctx.breakEvents;
          if (q && q.length) for (const ev of q) { if (ev.kind !== 'split' || evSeen.has(ev)) continue; evSeen.add(ev); try { onSplit(sh, ev, t); } catch (err) { logOnce('split', err); } }
        }
        for (const sh of state.ships) {
          if (!sh.piece) continue;
          const e = models.get(sh.id), pe = pieces.get(sh.id);
          if (!e || !e.model || !pe || pe.crashed || e.model.shattered) continue;
          const down = sh.ctx && sh.ctx.ship ? sh.ctx.ship.down : 0;
          if (down > 0) { try { crash(sh, e, pe, t); } catch (err) { logOnce('crash', err); } }
        }
      } catch (err) { logOnce('pre', err); }
    },
    // the extra tilt (radians, about the pitch pivot) and the sideways drift (px, along the ship's own x) of a half that fell off the ship; both are functions of the sim's own clock for that half (ship.splitT)
    tilt(sh, model) {
      const pe = pieces.get(sh.id);
      if (!pe || !sh.piece || K().ENABLED === false) return 0;
      const PC = K().PIECE || {}, k = ss((sh.splitT || 0) / Math.max(0.1, PC.TILT_T || 2.6)), full = sh.layout.gasbags && sh.layout.gasbags.length ? PC.TILT_BAG : PC.TILT;
      return -pe.dir * (full == null ? 0.5 : full) * k;
    },
    drift(sh) {
      const pe = pieces.get(sh.id);
      if (!pe || !sh.piece || K().ENABLED === false) return 0;
      const PC = K().PIECE || {};
      return -pe.dir * Math.min(PC.DRIFT_MAX == null ? 120 : PC.DRIFT_MAX, (PC.DRIFT == null ? 36 : PC.DRIFT) * (sh.splitT || 0));
    },
    // after the ships are placed this frame
    update({ t = 0, dt = 0, night = 0, tier = null } = {}) {
      void night; void tier;
      if (broken) return;
      const t0 = performance.now();
      if (K().ENABLED === false) { for (const r of recs.values()) { if (r.seamMesh) r.seamMesh.visible = false; } return; }
      const k8 = Math.floor(t * 8), keyed = k8 !== lastK8, Pt = getP();
      const seen = new Set();
      for (const sh of state.ships) {
        const e = models.get(sh.id);
        if (!e || !e.model || !e.model.ctx || !e.model.content) continue;
        seen.add(sh.id);
        const model = e.model;
        try {
          let rec = recs.get(sh.id);
          if (!rec) recs.set(sh.id, (rec = { model: null, segs: new Map(), k8: -1, sig: '', n: 0, seamMesh: null, seamSig: '', teethModel: null, teethMesh: null }));
          if (rec.model !== model) { rec.model = model; rec.sig = ''; rec.n = 0; rec.seamMesh = null; rec.seamSig = ''; rec.teethModel = null; rec.teethMesh = null; } // (a new model: its meshes went with the old one)
          let pe = pieces.get(sh.id);
          if (sh.piece && !pe) pe = registerPiece(sh, model);
          if (pe) pe.seen = true;
          writeSegments(sh, model, rec, k8, keyed, pe);
          if (!model.shattered) {
            stepSeam(sh, model, rec, k8, keyed, Pt);
            stepTeeth(sh, model, rec);
            if (pe && Pt && keyed && !pe.crashed && (k8 % Math.max(1, (K().PIECE || {}).TRAIL_EVERY || 2)) === 0) { // the falling half trails smoke and embers from its torn end
              const c = wpt(model, pe.seamX, sh.layout.midPoint ? sh.layout.midPoint.y : 0, 40, _w2);
              Pt.burst('smoke', c.x, c.y, c.z, 1, { size: [26, 48], size1: 1.9, life: [1.0, 1.7], color: '#5a5452', alpha: 0.6, up: [20, 60], speed: [5, 40] });
              Pt.burst('ember', c.x, c.y, c.z + 10, 1, { speed: [20, 90], life: [0.6, 1.2], size: [6, 10], up: [10, 60], color: '#ff8a2a' });
            }
          }
        } catch (err) { logOnce('ship', err); }
      }
      for (const id of [...recs.keys()]) if (!seen.has(id)) { recs.delete(id); lastSegs.delete(id); }
      for (const id of [...pieces.keys()]) { const p = pieces.get(id); if (!seen.has(id)) pieces.delete(id); else p.seen = true; }
      for (const id of [...cutsOf.keys()]) if (!seen.has(id) && !pending.some((p) => p.parent === id)) cutsOf.delete(id);
      // the glow left in a gap: a hot flash that dies away in a few keys
      if (keyed && Pt) {
        const SP = K().SPLIT || {}, keys = SP.GLOW_KEYS || 8;
        for (let i = glows.length - 1; i >= 0; i--) {
          const g = glows[i];
          if (g.k0 < 0) g.k0 = k8;
          const k = k8 - g.k0;
          if (k >= keys) { glows.splice(i, 1); continue; }
          if (k > 0) Pt.spawn('flash', g.x, g.y, g.z + 40, { size: g.size * (1 - k / keys) * 0.7, size1: 1, life: 0.14, color: '#ff8a2a', hdr: 1.3 * (1 - k / keys), alpha: 0.5, force: true });
        }
      }
      lastK8 = k8;
      stepShards(dt);
      let calls = shardMesh.visible ? 1 : 0;
      for (const r of recs.values()) calls += (r.seamMesh && r.seamMesh.visible ? 1 : 0) + (r.teethMesh ? 1 : 0);
      stats.calls = calls;
      stats.ms = performance.now() - t0;
    },
    get shards() { return shards.length; },
    clear() { for (const c of shards) if (c.id && destruction && destruction.bodies) destruction.bodies.remove(c.id); shards.length = 0; pending.length = 0; glows.length = 0; stepShards(0); },
    dispose() { API.clear(); shardMesh.removeFromParent(); shardGeo.dispose(); seamMat.dispose(); for (const r of recs.values()) { dropMesh(r.seamMesh); } recs.clear(); },
  };
  return API;
}
