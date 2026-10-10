// The gas envelope, a LATHE (WP2): a profile curve spun about the ship's axis (a rounder nose, a longer tail; not a stretched sphere), cut into GORES and BANDS like sewn canvas: every cell takes one of
// six painted canvas tiles from the trim sheet (so the seams and stitches are real lines), with raised RIB BANDS (webbing), a lacing line down each flank and up the ridge, canvas PATCHES (a square, a round and
// a strip) and, for the fins, a canvas skin with ribs. The rigging is a set of CATENARY ropes (a parabola with a sag) from patches on the flank down to the gondola's top deck.
// Gas hints follow the 2D art (gases.js / config.GASES tint): hydrogen is tinted red with the H2 stencil, hot air is warm with big stitched patches.
// The swell is a SCALE of the group (shipMesh update), never a vertex wobble. Twin envelopes ride higher behind the first, as the layout has them.
//   buildBag(Gb, ctx, i, n) -> { key: 'gasbag:bagN', batches: [rigging], dyn: [{ role: 'bag', node, G, i }], bounds }
import { THREE } from '../style.js';
import { Soup, rgbOf, shade, mixRgb, rng, hashOf } from './kit.js';
import { uvAt, TRIM, CANVAS_CELLS } from '../textures.js';
import { gasKey } from '../../host/gases.js';
import { config } from '../../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const TINT = { hydrogen: { rgb: [0.804, 0.2, 0.14], k: 0.38 }, hot: { rgb: [0.941, 0.627, 0.235], k: 0.3 } };

// the lathe: returns helpers to put things ON the surface (ribs, lacing, patches, rigging points)
function envelope(sink, o) {
  const { rx, ry, rzK, G, tail, nose, rgb, seed, ow = 6 } = o;
  const R = rng(seed);
  const profile = (u) => { const p = u < 0 ? tail : nose, a = Math.pow(Math.abs(u), p); return ry * Math.pow(Math.max(0, 1 - a), 1 / p); };
  const M = 180, xs = [], rs = [], arc = [0];
  for (let k = 0; k <= M; k++) { const u = -Math.cos((Math.PI * k) / M); xs.push(u * rx); rs.push(profile(u)); if (k) arc.push(arc[k - 1] + Math.hypot(xs[k] - xs[k - 1], rs[k] - rs[k - 1])); }
  const L = arc[M];
  const at = (s) => { // the profile at arc length s: x, r and the unit tangent
    s = clamp(s, 0, L);
    let lo = 0, hi = M;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m; }
    const t = (s - arc[lo]) / Math.max(1e-6, arc[hi] - arc[lo]), dx = xs[hi] - xs[lo], dr = rs[hi] - rs[lo], l = Math.hypot(dx, dr) || 1;
    return { x: xs[lo] + dx * t, r: rs[lo] + dr * t, tx: dx / l, tr: dr / l };
  };
  const arcOfX = (x) => { let lo = 0, hi = M; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; } const t = (x - xs[lo]) / Math.max(1e-6, xs[hi] - xs[lo]); return arc[lo] + (arc[hi] - arc[lo]) * t; };
  // a point on the surface at arc s and angle a (a = 0 faces the viewer, +z; PI/2 is the top), pushed `off` along the normal
  const surf = (s, a, off = 0) => {
    const p = at(s), sa = Math.sin(a), ca = Math.cos(a);
    let nx = -p.tr * rzK, ny = p.tx * rzK * sa, nz = p.tx * ca;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    return { p: [p.x + nx * off, p.r * sa + ny * off, p.r * rzK * ca + nz * off], n: [nx, ny, nz], r: p.r, x: p.x };
  };
  const body = new Soup();
  const bandLen = Math.max(70, (TAU * ry) / G * 2.7), nb = Math.max(5, Math.round(L / bandLen)), sub = 2, NR = nb * sub;
  const cells = CANVAS_CELLS;
  let prev = -1;
  const tint = rgb;
  for (let j = 0; j < NR; j++) {
    const band = Math.floor(j / sub), m0 = (j % sub) / sub, m1 = ((j % sub) + 1) / sub;
    const s0 = (L * j) / NR, s1 = (L * (j + 1)) / NR;
    for (let g = 0; g < G; g++) {
      let v = Math.floor(R() * cells.length);
      if (v === prev) v = (v + 1) % cells.length;
      prev = v;
      const a0 = (g / G) * TAU - Math.PI / G, a1 = ((g + 1) / G) * TAU - Math.PI / G, jit = 0.965 + R() * 0.05;
      const A = surf(s0, a0), B = surf(s0, a1), C = surf(s1, a1), D = surf(s1, a0);
      const col = (q, a) => shade(tint, jit * (0.92 + 0.08 * (0.5 + 0.5 * Math.sin(a))));
      const rect = TRIM[cells[v]];
      const tu = (t) => rect.x + 0.5 + t * (rect.w - 1), tvv = (t) => rect.y + 0.5 + t * (rect.h - 1);
      const uv = (tx, ty) => [tu(tx) / 2048, 1 - tvv(ty) / 2048];
      body.quad([A.p, B.p, C.p, D.p], [A.n, B.n, C.n, D.n], [col(A, a0), col(B, a1), col(C, a1), col(D, a0)], [uv(0, m0), uv(1, m0), uv(1, m1), uv(0, m1)], A.n);
    }
    void band;
  }
  body.flush(sink, ow);

  // webbing ribs round the envelope: raised bands (the middle one green, as the old rings were)
  const ribs = (rgbA, rgbMid, midRibs) => {
    const nR = Math.max(5, Math.round(rx / 95)), soup = new Soup(), SEG = G * 2;
    for (let i = 1; i < nR; i++) {
      const s = (L * i) / nR, w = 7, mid = midRibs.includes(i), c = mid ? rgbMid : rgbA;
      for (let k = 0; k < SEG; k++) {
        const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
        const A = surf(s - w, a0, 2.6), B = surf(s - w, a1, 2.6), C = surf(s + w, a1, 2.6), D = surf(s + w, a0, 2.6);
        soup.quad([A.p, B.p, C.p, D.p], [A.n, B.n, C.n, D.n], [c, c, c, c], [uvAt('strap', (k / SEG) * 1000, 6), uvAt('strap', ((k + 1) / SEG) * 1000, 6), uvAt('strap', ((k + 1) / SEG) * 1000, 58), uvAt('strap', (k / SEG) * 1000, 58)], A.n);
      }
    }
    soup.flush(sink, 0);
    return nR;
  };
  // a lacing line along the surface at angle a: chunks of 56 units, each a window of four eyelet periods
  const lacing = (a, s0, s1, rgbL) => {
    const soup = new Soup(), step = 56;
    for (let s = s0; s < s1 - 4; s += step) {
      const sq = Math.min(s1, s + step), pa = surf(s, a, 2.4), pb = surf(sq, a, 2.4);
      const ta = [0, Math.cos(a), -rzK * Math.sin(a)], tl = Math.hypot(...ta) || 1, w = 8.5;
      const off = (q, k) => [q.p[0] + (ta[0] / tl) * w * k, q.p[1] + (ta[1] / tl) * w * k, q.p[2] + (ta[2] / tl) * w * k];
      const u1 = ((sq - s) / step) * 112;
      soup.quad([off(pa, -1), off(pb, -1), off(pb, 1), off(pa, 1)], [pa.n, pb.n, pb.n, pa.n], [rgbL, rgbL, rgbL, rgbL], [uvAt('lacing', 0, 4), uvAt('lacing', u1, 4), uvAt('lacing', u1, 60), uvAt('lacing', 0, 60)], pa.n);
    }
    soup.flush(sink, 0);
  };
  // a decal on the surface: kind 'sq' | 'round' | 'strip' | 'h2', centred at arc s and angle a, size w x h (world units), tone rgb
  const patch = (kind, s, a, w, h, rgbP, flip = false) => {
    const soup = new Soup(), rect = kind === 'h2' ? 'stencilH2' : kind === 'sq' ? 'patchSq' : kind === 'round' ? 'patchRound' : 'patchStrip';
    const c0 = surf(s, a), rr = Math.max(20, c0.r), grid = (du, dv) => surf(s + du, a + dv / rr, 1.8);
    const cr = TRIM[rect], tex = (tx, ty) => [(cr.x + 0.5 + (flip ? 1 - tx : tx) * (cr.w - 1)) / 2048, 1 - (cr.y + 0.5 + (1 - ty) * (cr.h - 1)) / 2048]; // (v grows upward on the surface, the picture's y grows downward; the far side reads the other way round)
    if (kind === 'round') {
      const n = 12, ctr = grid(0, 0);
      for (let k = 0; k < n; k++) {
        const t0 = (k / n) * TAU, t1 = ((k + 1) / n) * TAU, p0 = grid(Math.cos(t0) * w / 2, Math.sin(t0) * h / 2), p1 = grid(Math.cos(t1) * w / 2, Math.sin(t1) * h / 2);
        soup.quad([ctr.p, p0.p, p1.p, p1.p], [ctr.n, p0.n, p1.n, p1.n], [rgbP, rgbP, rgbP, rgbP], [tex(0.5, 0.5), tex(0.5 + Math.cos(t0) * 0.43, 0.5 + Math.sin(t0) * 0.43), tex(0.5 + Math.cos(t1) * 0.43, 0.5 + Math.sin(t1) * 0.43), tex(0.5 + Math.cos(t1) * 0.43, 0.5 + Math.sin(t1) * 0.43)], ctr.n);
      }
    } else {
      const N = 3;
      for (let iu = 0; iu < N; iu++) for (let iv = 0; iv < N; iv++) {
        const u0 = iu / N, u1 = (iu + 1) / N, v0 = iv / N, v1 = (iv + 1) / N;
        const P = [grid((u0 - 0.5) * w, (v0 - 0.5) * h), grid((u1 - 0.5) * w, (v0 - 0.5) * h), grid((u1 - 0.5) * w, (v1 - 0.5) * h), grid((u0 - 0.5) * w, (v1 - 0.5) * h)];
        soup.quad(P.map((q) => q.p), P.map((q) => q.n), [rgbP, rgbP, rgbP, rgbP], [tex(u0, v0), tex(u1, v0), tex(u1, v1), tex(u0, v1)], P[0].n);
      }
    }
    soup.flush(sink, 0);
  };
  return { surf, at, L, arcOfX, ribs, lacing, patch, profile, R };
}

export function buildBag(Gb, ctx, i, n) {
  const { T, X, Y, P, W } = ctx;
  const id = Gb.id || 'bag' + (i + 1), key = 'gasbag:' + id;
  const bagB = ctx.dynBatch(key), rig = ctx.part(key);
  const gas = gasKey(Gb), tintSpec = TINT[gas], seed = hashOf(key);
  let rgb = rgbOf(T.bag);
  if (tintSpec) rgb = mixRgb(rgb, tintSpec.rgb, tintSpec.k);
  const rzK = 0.96, nowTop = Gb.ry;
  const env = envelope(bagB, { rx: Gb.rx, ry: Gb.ry, rzK, G: 20, tail: 1.75, nose: 2.0, rgb, seed });
  const nR = env.ribs(rgbOf(T.bagShade), rgbOf(T.trim), [Math.round(Math.max(5, Math.round(Gb.rx / 95)) / 2)]);
  const lace = shade(rgbOf(T.bag), 0.95);
  for (const a of [Math.PI / 2, -0.42, Math.PI + 0.42]) env.lacing(a, env.L * 0.05, env.L * 0.95, lace); // the ridge and both flanks
  // patches on both sides (a different set each, from the id), more of them (and bigger, warmer) for hot air
  const R = env.R, patchRgb = mixRgb(rgb, [0.52, 0.42, 0.28], 0.22);
  for (const side of [0, Math.PI]) {
    const count = gas === 'hot' ? 5 : 4;
    for (let k = 0; k < count; k++) {
      const s = env.L * (0.14 + 0.72 * ((k + R() * 0.5) / count)), a = side + (R() - 0.5) * 1.5 + (R() < 0.5 ? 0 : 0.2), kind = gas === 'hot' ? 'sq' : ['sq', 'round', 'strip'][Math.floor(R() * 3)];
      env.patch(kind, s, a, kind === 'strip' ? 118 : gas === 'hot' ? 100 : 66, kind === 'strip' ? 26 : gas === 'hot' ? 64 : 52, gas === 'hot' ? mixRgb(rgb, [0.6, 0.38, 0.18], 0.45) : patchRgb);
    }
    if (gas === 'hydrogen') env.patch('h2', env.L * 0.56, side > 1 ? side + 0.5 : -0.5, Math.min(340, Gb.rx * 0.34), 44, shade(mixRgb(rgb, [0.76, 0.2, 0.15], 0.3), 0.98), side > 1);
  }
  void nR;
  // the fins: four at the stern of the first bag, four (smaller) at the nose of the last, each a canvas skin with ribs
  const finSet = (sgn, s) => {
    const fx = sgn > 0 ? -Gb.rx : Gb.rx, xa = fx + sgn * 380 * s, xb = fx + sgn * 40 * s, xc = fx + sgn * 190 * s, xd = fx - sgn * 70 * s;
    const rAt = (x) => env.profile(clamp(x / Gb.rx, -1, 1));
    const pts = [[xa, rAt(xa) - 8], [xb, rAt(xb) - 8], [xd, Gb.ry * 0.9], [xc, Gb.ry * 1.03]];
    const shp = new THREE.Shape();
    pts.forEach((p, k) => (k ? shp.lineTo(p[0], p[1]) : shp.moveTo(p[0], p[1])));
    shp.closePath();
    const geo = new THREE.ExtrudeGeometry(shp, { depth: 8, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 1.6, bevelSegments: 1, curveSegments: 2 });
    geo.translate(0, 0, -4);
    for (let q = 0; q < 4; q++) {
      const ang = (q * Math.PI) / 2, zk = q % 2 ? rzK : 1;
      const m = new THREE.Matrix4().makeRotationX(ang);
      bagB.geo(T.fin, geo, m, 3, { tr: 'canvas2' });
      for (const t of [0.22, 0.5, 0.78]) { // ribs on both faces
        const p0 = [pts[0][0] + (pts[1][0] - pts[0][0]) * t, pts[0][1] + (pts[1][1] - pts[0][1]) * t], p1 = [pts[3][0] + (pts[2][0] - pts[3][0]) * t, pts[3][1] + (pts[2][1] - pts[3][1]) * t];
        for (const z of [-5.5, 5.5]) {
          const a = V(p0[0], p0[1], z).applyMatrix4(m), c = V(p1[0], p1[1], z).applyMatrix4(m);
          bagB.rod(T.rail, a, c, 1.7, 0.8, { tr: 'woodC', seg: 1e9 });
        }
      }
      void zk;
    }
  };
  if (i === 0) finSet(1, 1);
  if (i === n - 1) finSet(-1, 0.7);
  const grp = new THREE.Group();
  grp.position.set(X(Gb.cx), Y(Gb.cy), 0);
  // the twin envelope rides higher behind the first
  if (Gb.twin) {
    const twB = ctx.dynBatch(key + ':twin');
    const tw = envelope(twB, { rx: Gb.rx * 0.7, ry: Gb.ry * 0.62, rzK: 0.96, G: 16, tail: 1.8, nose: 2.0, rgb, seed: seed ^ 0x1234, ow: 5 });
    tw.ribs(rgbOf(T.bagShade), rgbOf(T.bagShade), []);
    tw.lacing(Math.PI / 2, tw.L * 0.06, tw.L * 0.94, lace);
    const twg = twB.buildGroup({ cast: true });
    twg.position.set(-20, 258, 0);
    grp.add(twg);
  }
  grp.add(bagB.buildGroup({ cast: true }));

  // catenary rigging: ropes sag between plates on the flank and the rail of the top deck
  const cat = ctx.catwalk;
  const catY = cat ? cat.y : 470;
  for (const f of [-0.54, -0.28, 0, 0.28, 0.54]) for (const sgn of [-1, 1]) {
    const x = Gb.cx + f * Gb.rx, aAtt = sgn > 0 ? -0.62 : Math.PI + 0.62, sA = env.arcOfX(f * Gb.rx), sp = env.surf(sA, aAtt, -4);
    const top = V(X(Gb.cx) + sp.p[0], Y(Gb.cy) + sp.p[1], sp.p[2]), low = V(X(x - 30), Y(catY - 4), sgn * W * 0.85);
    const len = top.distanceTo(low), sag = len * 0.1, pts = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6, p = low.clone().lerp(top, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
    for (let k = 0; k < 6; k++) rig.rod('#4a3a2a', pts[k], pts[k + 1], 2.1, 0, { tr: 'rope', seg: 1e9 });
    rig.sphere(T.iron, top.x, top.y, top.z, 6, 6, 6, 0, true, { tr: 'iron' }); // the thimble on the flank
    rig.sphere(T.iron, low.x, low.y, low.z, 4.5, 4.5, 4.5, 0, true, { tr: 'iron' });
  }
  void nowTop; void P; void config; void ctx.content;
  return { key, batches: [rig], dyn: [{ role: 'bag', key, node: grp, G: Gb, i }], bounds: { x0: X(Gb.cx - Gb.rx), x1: X(Gb.cx + Gb.rx), y0: Y(Gb.cy + Gb.ry), y1: Y(Gb.cy - Gb.ry), z0: -Gb.ry, z1: Gb.ry } };
}
