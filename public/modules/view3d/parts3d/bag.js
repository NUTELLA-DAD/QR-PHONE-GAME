// The gas envelope, a LATHE (WP2) now cut into real GORES (A4): a profile curve spun about the ship's axis (a rounder nose, a longer tail; not a stretched sphere), sewn from 10-14 longitudinal panels. Each gore is a shallow
// pillow: its crest keeps the old lathe surface (so spikes, emblems, icicles and rip decals still sit on it) and a V-crease a few units deep runs between neighbours; between the rib bands the panels sag a touch. The shading
// normals are domed across each gore, so the toon step breaks into one scallop a gore and the creases darken (vertex colour), which is what the eye reads as sewn canvas from across a room. A darker NOSE CAP and TAIL CONE
// close the ends (the gores run on into them and meet at the pole), a brass ring marks the nose cap, a brass button caps the nose and a small fairing the tail. Every cell takes one of six painted canvas tiles from the trim sheet
// (the seams and stitches are real lines) and a faint quilt tone of its own, raised RIB BANDS (webbing) sit on the band lines, a lacing line runs in a crease down each flank and up the ridge, canvas PATCHES (a square, a
// round and a strip, in a few repair tones) sit on the gore crests and, for the fins, thick tapered canvas SLABS with a spar, ribs, a darker underside and a root fairing.
// Triangles come from the ring (row) count, not the gore count: the nose / tail caps take 3 rows, each band between ribs 2, a gore is 4 quads across (2 for the small twin envelope).
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
const TAU = Math.PI * 2, HALF_PI = Math.PI / 2;
// FIX (fix_ship): the envelope is a squat oval in depth and rides BEHIND the whole gondola (the camera looks from +z, so a full-depth bag hung in front of the top deck, its nest ladders and its crew). The group's z
// (and the x that keeps it straight behind the ship while she turns) is set every frame by shipMesh.step from the `back` number below; at the gameplay camera it lands on the 2D position (the camera's lens keeps
// the plane z = 0 exact; a body 300 units behind it only looks a few percent smaller and a little higher, which gives the top deck more room).
export const BAG_RZ = 0.62; // depth of the lathe as a share of its height (was 0.96)
const TINT = { hydrogen: { rgb: [0.804, 0.2, 0.14], k: 0.38 }, hot: { rgb: [0.941, 0.627, 0.235], k: 0.3 } };
// the cross-section of one gore, crease to crease: the columns (share of the gore's width) and how deep into the crease each lies (1 = the bottom of the V, 0 = the crest)
const GORE_FULL = { t: [0, 0.13, 0.5, 0.87, 1], c: [1, 0.3, 0, 0.3, 1] };
const GORE_LOD = { t: [0, 0.5, 1], c: [1, 0, 1] }; // (the small twin envelope behind the first)
const TILT = 0.4; // how far the shading normals lean across a gore (a dome: the toon terminator scallops by gore)
const CAP_AT = 0.8; // the nose cap and tail cone start at this share of the half length

const same3 = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) < 0.05;
const toColor = (rgb) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]);
// a quad p0 p1 p2 p3 into a soup; a corner pair that coincides (a pole) makes a triangle instead
function emit(soup, P, N, C, U, fn) {
  if (same3(P[0], P[1]) || same3(P[2], P[3])) {
    const k = same3(P[0], P[1]) ? [0, 2, 3] : [0, 1, 2];
    if (same3(P[k[0]], P[k[1]]) || same3(P[k[1]], P[k[2]]) || same3(P[k[0]], P[k[2]])) return;
    const a = P[k[0]], b = P[k[1]], c = P[k[2]];
    const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const o = cx * fn[0] + cy * fn[1] + cz * fn[2] < 0 ? [k[0], k[2], k[1]] : k;
    soup.tri(o.map((i) => P[i]), o.map((i) => N[i]), o.map((i) => C[i]), o.map((i) => U[i]));
    return;
  }
  soup.quad(P, N, C, U, fn);
}

// the lathe: returns helpers to put things ON the surface (ribs, lacing, patches, rigging points)
function envelope(sink, o) {
  const { rx, ry, rzK, G, tail, nose, rgb, seed, ow = 6, capRgb, lod = false } = o;
  const R = rng(seed);
  const GT = lod ? GORE_LOD.t : GORE_FULL.t, GC = lod ? GORE_LOD.c : GORE_FULL.c, NC = GT.length - 1;
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

  // ---- the gores: where the crests and creases are, and how deep ---------------------------------------------------------------------------------------------------------------------
  const gw = TAU / G;
  // gore g's crest is at angle PI/2 + g * gw (gore 0 runs along the ridge); its creases are half a gore either side
  const crestOf = (g) => HALF_PI + g * gw;
  const crestNear = (a) => crestOf(Math.round((a - HALF_PI) / gw));
  const creaseNear = (a) => HALF_PI + (Math.round((a - HALF_PI) / gw - 0.5) + 0.5) * gw;
  const cwAt = (t) => { t = clamp(t, 0, 1); for (let i = 0; i < NC; i++) if (t <= GT[i + 1]) return GC[i] + ((GC[i + 1] - GC[i]) * (t - GT[i])) / (GT[i + 1] - GT[i]); return 1; };
  const tOf = (a) => { let f = (a - (HALF_PI - gw / 2)) / gw; f -= Math.floor(f); return f; }; // where angle a falls across its gore (0 = a crease, 0.5 = the crest)
  const D0 = clamp(ry * 0.021, 2.6, 5.2), SG = clamp(ry * 0.011, 1.2, 2.6); // crease depth and panel sag, in units
  // the band lines: the nose / tail caps (3 rows each) and the bands between ribs (2 rows: a mid line to sag)
  const sT = arcOfX(-rx * CAP_AT), sN = arcOfX(rx * CAP_AT);
  const bandT = clamp(((TAU * ry) / G) * 2.0, 110, 250); // (a cell is about as long as two gore widths: the canvas tiles are 1:2)
  const nB = Math.max(3, Math.round((sN - sT) / bandT));
  const bands = [{ s0: 0, s1: sT, rows: 3, cap: 1 }];
  for (let b = 0; b < nB; b++) bands.push({ s0: sT + ((sN - sT) * b) / nB, s1: sT + ((sN - sT) * (b + 1)) / nB, rows: 2, cap: 0 });
  bands.push({ s0: sN, s1: L, rows: 3, cap: 2 });
  const bandOf = (s) => { for (const b of bands) if (s <= b.s1 + 1e-6) return b; return bands[bands.length - 1]; };
  const sagAt = (s) => { const b = bandOf(s); if (b.cap) return 0; const ph = (s - b.s0) / Math.max(1e-6, b.s1 - b.s0); return SG * (1 - Math.abs(2 * ph - 1)); };
  const creaseAt = (s) => D0 * clamp(at(s).r / (0.5 * ry), 0, 1); // (the creases fade out toward the poles, where the gores meet)
  const depthAt = (s, t) => creaseAt(s) * cwAt(t) + sagAt(s);
  const surfG = (s, a, off = 0) => surf(s, a, off - depthAt(s, tOf(a))); // the gore surface (decals, lacing)
  // a shading normal domed across the gore (lean toward the side the point is on), fading to nothing at the poles
  const domeN = (q, a, t) => {
    const ca = Math.cos(a), sa = Math.sin(a), tl = Math.hypot(ca, rzK * sa) || 1, k = TILT * (t - 0.5) * 2 * clamp(q.r / (0.35 * ry), 0, 1);
    const nx = q.n[0], ny = q.n[1] + (ca / tl) * k, nz = q.n[2] - ((rzK * sa) / tl) * k, nl = Math.hypot(nx, ny, nz) || 1;
    return [nx / nl, ny / nl, nz / nl];
  };

  // ---- the canvas skin ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const body = new Soup();
  const cells = CANVAS_CELLS, lastV = [];
  let prev = -1;
  for (const bd of bands) {
    const base = bd.cap ? capRgb : rgb;
    for (let g = 0; g < G; g++) {
      let v = Math.floor(R() * cells.length);
      if (v === prev || v === lastV[g]) v = (v + 1) % cells.length;
      if (v === prev || v === lastV[g]) v = (v + 1) % cells.length;
      prev = lastV[g] = v;
      const tone = (bd.cap ? 0.95 : 0.925) + R() * (bd.cap ? 0.08 : 0.11); // the cell's own quilt tone (a few per cent either way: a patchwork)
      const rect = TRIM[cells[v]];
      const tu = (t) => rect.x + 0.5 + t * (rect.w - 1), tvv = (t) => rect.y + 0.5 + t * (rect.h - 1);
      const uv = (tx, ty) => [tu(tx) / 2048, 1 - tvv(ty) / 2048];
      for (let k = 0; k < bd.rows; k++) {
        const ph0 = k / bd.rows, ph1 = (k + 1) / bd.rows, s0 = bd.s0 + (bd.s1 - bd.s0) * ph0, s1 = bd.s0 + (bd.s1 - bd.s0) * ph1;
        const corner = (s, ph, j) => {
          const t = GT[j], a = crestOf(g) + (t - 0.5) * gw, q = surf(s, a, -(creaseAt(s) * GC[j] + sagAt(s)));
          const pole = clamp((1.6 * q.r) / ry, 0, 1), dm = (t - 0.5) * 2;
          const belly = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(a)), seam = (1 - 0.34 * GC[j] * pole) * (1 - 0.1 * dm * dm * pole), edge = bd.cap ? 1 : 1 - 0.09 * (1 - Math.sin(Math.PI * ph)); // (darker in the creases, round each gore's shoulders and toward the ribs: puffy cells)
          return { p: q.p, n: domeN(q, a, t), c: shade(base, tone * belly * seam * edge), uv: uv(t, ph) };
        };
        for (let j = 0; j < NC; j++) {
          const A = corner(s0, ph0, j), B = corner(s0, ph0, j + 1), C = corner(s1, ph1, j + 1), D = corner(s1, ph1, j);
          emit(body, [A.p, B.p, C.p, D.p], [A.n, B.n, C.n, D.n], [A.c, B.c, C.c, D.c], [A.uv, B.uv, C.uv, D.uv], surf(s0, crestOf(g) + (GT[j] + GT[j + 1] - 1) * gw / 2).n);
        }
      }
    }
  }
  body.flush(sink, ow);

  // a band of webbing (or brass) right round the envelope at arc s, half width w, standing `off` above the gore surface; it follows the creases
  const ring = (s, w, off, c, trim = 'strap') => {
    const soup = new Soup(), SEG = G * NC, pr = (k) => (k % SEG) / SEG;
    const brassy = trim === 'brass';
    for (let g = 0; g < G; g++) for (let j = 0; j < NC; j++) {
      const k = g * NC + j, P = [], N = [], U = [];
      for (const [ds, jj] of [[-w, j], [-w, j + 1], [w, j + 1], [w, j]]) {
        const a = crestOf(g) + (GT[jj] - 0.5) * gw, q = surf(s + ds, a, off - creaseAt(s) * GC[jj]);
        P.push(q.p); N.push(q.n);
        const kk = jj === j ? k : k + 1;
        U.push(brassy ? uvAt('brass', ds < 0 ? 12 : 244, 20 + pr(kk) * 200) : uvAt('strap', pr(kk) * 1000, ds < 0 ? 6 : 58));
      }
      soup.quad(P, N, [c, c, c, c], U, N[0]);
    }
    soup.flush(sink, 0);
  };
  // webbing ribs on the band lines (the middle one green, as the old rings were); returns how many
  const ribs = (rgbA, rgbMid, midRibs) => {
    for (let i = 1; i < nB; i++) ring(sT + ((sN - sT) * i) / nB, 7, 2.6, midRibs.includes(i) ? rgbMid : rgbA);
    return nB - 1;
  };
  // a lacing line along the surface at angle a (set in the nearest crease): chunks of 56 units, each a window of four eyelet periods
  const lacing = (a, s0, s1, rgbL) => {
    a = creaseNear(a);
    const soup = new Soup(), step = 56;
    for (let s = s0; s < s1 - 4; s += step) {
      const sq = Math.min(s1, s + step), pa = surf(s, a, 2.4 - creaseAt(s) - sagAt(s)), pb = surf(sq, a, 2.4 - creaseAt(sq) - sagAt(sq));
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
    const c0 = surf(s, a), rr = Math.max(20, c0.r), grid = (du, dv) => surfG(s + du, a + dv / rr, 1.6);
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
  return { surf, at, L, arcOfX, ribs, ring, lacing, patch, profile, R, nB, sT, sN, crestNear, creaseNear };
}

// the repair patches' cloth: a few faded tones, mixed into the bag's own colour
const PATCH_TONES = [[0.5, 0.36, 0.2], [0.34, 0.4, 0.26], [0.56, 0.3, 0.22]];

export function buildBag(Gb, ctx, i, n) {
  const { T, X, Y, P, W } = ctx;
  const id = Gb.id || 'bag' + (i + 1), key = 'gasbag:' + id;
  const bagB = ctx.dynBatch(key), rig = ctx.part(key);
  const gas = gasKey(Gb), tintSpec = TINT[gas], seed = hashOf(key);
  let rgb = rgbOf(T.bag);
  if (tintSpec) rgb = mixRgb(rgb, tintSpec.rgb, tintSpec.k);
  const rzK = BAG_RZ, nowTop = Gb.ry;
  const capRgb = shade(mixRgb(rgb, [0.2, 0.14, 0.07], 0.72), 0.85); // the nose cap and tail cone: a clearly darker canvas
  const G = clamp(Math.round(Gb.ry / 20), 10, 14);
  const env = envelope(bagB, { rx: Gb.rx, ry: Gb.ry, rzK, G, tail: 1.75, nose: 2.0, rgb, seed, capRgb });
  env.ribs(rgbOf(T.bagShade), rgbOf(T.trim), [Math.round(env.nB / 2)]);
  // the brass nose ring where the cap starts, a darker belt where the tail cone starts, a brass button on the nose and a small fairing on the tail
  env.ring(env.sN, 9, 4.4, rgbOf(T.brass), 'brass');
  env.ring(env.sT, 7, 3.4, shade(capRgb, 0.6), 'strap');
  const nr = clamp(Gb.ry * 0.075, 9, 20);
  bagB.sphere(T.brass, Gb.rx - nr * 0.55, 0, 0, nr, nr, nr * rzK + 4, 2.6, true, { tr: 'brass' });
  bagB.cone(toColor(shade(capRgb, 0.78)), -Gb.rx - nr * 0.2, 0, 0, nr * 1.5, nr * 3.2, 2.6, 0, 0, HALF_PI, { tr: 'canvas3' });
  const lace = shade(rgbOf(T.bag), 0.95);
  for (const a of [Math.PI / 2, -0.7, Math.PI + 0.5]) env.lacing(a, env.L * 0.05, env.L * 0.95, lace); // the ridge and both flanks (each set in a crease)
  // patches on both sides (a different set each, from the id), more of them (and bigger, warmer) for hot air; they sit on gore crests
  const R = env.R;
  for (const side of [0, Math.PI]) {
    const count = gas === 'hot' ? 5 : 4;
    for (let k = 0; k < count; k++) {
      const s = env.L * (0.14 + 0.72 * ((k + R() * 0.5) / count)), a = env.crestNear(side + (R() - 0.5) * 1.5 + (R() < 0.5 ? 0 : 0.2)), kind = gas === 'hot' ? 'sq' : ['sq', 'round', 'strip'][Math.floor(R() * 3)];
      const tone = gas === 'hot' ? mixRgb(rgb, [0.6, 0.38, 0.18], 0.5) : mixRgb(rgb, PATCH_TONES[Math.floor(R() * PATCH_TONES.length)], 0.85);
      env.patch(kind, s, a, kind === 'strip' ? 130 : gas === 'hot' ? 100 : 80, kind === 'strip' ? 30 : gas === 'hot' ? 64 : 62, tone);
    }
    if (gas === 'hydrogen') env.patch('h2', env.L * 0.56, env.crestNear(side > 1 ? side + 0.5 : -0.5), Math.min(340, Gb.rx * 0.34), 44, shade(mixRgb(rgb, [0.76, 0.2, 0.15], 0.3), 0.98), side > 1);
  }

  // ---- the fins: four at the stern of the first bag, four (smaller) at the nose of the last. Each is a thick TAPERED canvas slab (12-18 units at the root, half that at the tip) with a spar and ribs on both faces, a
  // darker underside, and a fillet along the root where it meets the skin. They sweep less than the old cardboard cut-outs (a shorter, lower outer edge that does not overhang the end of the bag).
  const finRgb = rgbOf(T.fin), finDark = shade(finRgb, 0.7), finLight = shade(finRgb, 1.04), ribC = new THREE.Color(T.rail), sparC = toColor(shade(rgbOf(T.rail), 0.85));
  const finSet = (sgn, sz) => {
    const fx = sgn > 0 ? -Gb.rx : Gb.rx, kf = clamp(Gb.rx / 900, 0.34, 1.12) * sz, ry = Gb.ry;
    const Xw = (w) => fx + sgn * w * kf;
    const rAt = (x) => env.profile(clamp(x / Gb.rx, -1, 1));
    const wR = [30, 170, 300, 430], wT = [-10, 80, 180, 270], hT = [0.74, 0.8, 0.85, 0.88]; // the root stations (along the skin) and the outer edge's, swept
    const root = wR.map((w) => [Xw(w), rAt(Xw(w)) - 5]), tip = wT.map((w, q) => [Xw(w), hT[q] * ry * (sz < 1 ? 0.95 : 1)]);
    const tR = clamp(ry * 0.07, 10, 17) * (0.8 + 0.2 * sz), tT = tR * 0.5; // thickness at the root and at the tip
    const lerp2 = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
    const poly = (pl, f) => { const q = clamp(f, 0, 0.9999) * 3, k = Math.floor(q); return lerp2(pl[k], pl[k + 1], q - k); };
    const th = (y) => { const y0 = root[1][1], y1 = tip[1][1]; return tT + (tR - tT) * (1 - clamp((y - y0) / Math.max(1, y1 - y0), 0, 1)); }; // (the slab is half as thick at the outer edge)
    const cen = [(root[0][0] + tip[3][0]) / 2, (root[0][1] + tip[3][1]) / 2, 0];
    for (let q = 0; q < 4; q++) {
      const ang = (q * Math.PI) / 2, zk = q % 2 ? rzK : 1; // (the side fins are as long as the oval is deep)
      const m = new THREE.Matrix4().makeRotationX(ang).multiply(new THREE.Matrix4().makeScale(1, zk, 1));
      const tf = (x, y, z) => V(x, y, z).applyMatrix4(m).toArray();
      const soup = new Soup(), ctr = tf(cen[0], cen[1], 0);
      const face = (pts, uvs) => { // pts in the fin's plane [x, y, z]; the face looks away from the slab's centre; the underside (the faces that look down) is a darker step
        const P = pts.map((p) => tf(p[0], p[1], p[2]));
        const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
        let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (Math.hypot(...nrm) < 1e-6) { const e3 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]]; nrm = [e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]]; }
        const mx = (P[0][0] + P[2][0]) / 2 - ctr[0], my = (P[0][1] + P[2][1]) / 2 - ctr[1], mz = (P[0][2] + P[2][2]) / 2 - ctr[2];
        if (nrm[0] * mx + nrm[1] * my + nrm[2] * mz < 0) nrm = nrm.map((v) => -v);
        const nl = Math.hypot(...nrm) || 1; nrm = nrm.map((v) => v / nl);
        const c = nrm[1] < -0.35 ? finDark : nrm[1] > 0.35 ? finLight : shade(finRgb, 0.94);
        soup.quad(P, [nrm, nrm, nrm, nrm], [c, c, c, c], uvs, nrm);
      };
      const uvF = (x, y) => uvAt('canvas2', 4 + 120 * clamp((y - root[1][1] * 0.2) / (ry * 0.8), 0, 1), 4 + 248 * clamp(Math.abs(x - Xw(wT[0])) / (430 * kf), 0, 1));
      for (let k = 0; k < 3; k++) { // the two broad faces (+z, -z), three strips each, tapering in thickness toward the outer edge
        const quad = (z) => [[root[k][0], root[k][1], z * tR / 2], [root[k + 1][0], root[k + 1][1], z * tR / 2], [tip[k + 1][0], tip[k + 1][1], z * tT / 2], [tip[k][0], tip[k][1], z * tT / 2]];
        for (const z of [1, -1]) { const pts = quad(z); face(pts, pts.map((p) => uvF(p[0], p[1]))); }
        const outer = (z) => [[tip[k][0], tip[k][1], z * tT / 2], [tip[k + 1][0], tip[k + 1][1], z * tT / 2], [tip[k + 1][0], tip[k + 1][1], -z * tT / 2], [tip[k][0], tip[k][1], -z * tT / 2]];
        { const pts = outer(1); face(pts, pts.map((p) => uvF(p[0], p[1]))); } // the outer edge (a flat strip)
      }
      for (const [a, b] of [[0, 0], [3, 3]]) { // the aft and the forward edge
        const pts = [[root[a][0], root[a][1], tR / 2], [tip[b][0], tip[b][1], tT / 2], [tip[b][0], tip[b][1], -tT / 2], [root[a][0], root[a][1], -tR / 2]];
        face(pts, pts.map((p) => uvF(p[0], p[1])));
      }
      soup.flush(bagB, 3);
      // the spar (a heavy batten near the forward edge) and two ribs on both faces, from the root to the outer edge
      for (const [f, rad, big] of [[0.78, 2.5, true], [0.42, 1.9, false]]) { // (radii up to 2.6 are six-sided open rods: 12 triangles)
        const a0 = poly(root, f), a1 = poly(tip, f);
        for (const z of [1, -1]) bagB.rod(big ? sparC : ribC, V(...tf(a0[0], a0[1], z * (tR / 2 + 0.4))), V(...tf(a1[0], a1[1], z * (tT / 2 + 0.4))), rad, 0.9, { tr: 'woodC', seg: 1e9 });
      }
      // a cross rib at mid span, ties the others together
      { const m0 = lerp2(poly(root, 0.2), poly(tip, 0.2), 0.45), m1 = lerp2(poly(root, 0.86), poly(tip, 0.86), 0.45); for (const z of [1, -1]) bagB.rod(ribC, V(...tf(m0[0], m0[1], z * (th(m0[1]) / 2 + 0.4))), V(...tf(m1[0], m1[1], z * (th(m1[1]) / 2 + 0.4))), 1.7, 0.8, { tr: 'woodC', seg: 1e9 }); }
      // the root fairing: a sloping canvas fillet along the foot of the fin on both faces, from the face (about 26 units up) down onto the skin (about 11 units out); one quad a root segment a side
      const fil = new Soup(), fc = shade(finRgb, 0.82), fo = ctr;
      for (let k = 0; k < 3; k++) for (const z of [1, -1]) {
        const hi = (j) => [root[j][0], root[j][1] + 24, z * tR / 2], lo = (j) => [root[j][0], root[j][1] + 3, z * (tR / 2 + 12)];
        const pts = [lo(k), lo(k + 1), hi(k + 1), hi(k)].map((p) => tf(p[0], p[1], p[2]));
        const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]];
        let nrm = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        const mx = (pts[0][0] + pts[2][0]) / 2 - fo[0], my = (pts[0][1] + pts[2][1]) / 2 - fo[1], mz = (pts[0][2] + pts[2][2]) / 2 - fo[2];
        if (nrm[0] * mx + nrm[1] * my + nrm[2] * mz < 0) nrm = nrm.map((v) => -v);
        const nl = Math.hypot(...nrm) || 1; nrm = nrm.map((v) => v / nl);
        const cc = nrm[1] < -0.35 ? shade(fc, 0.8) : fc;
        fil.quad(pts, [nrm, nrm, nrm, nrm], [cc, cc, cc, cc], [uvAt('canvas1', 10, 10), uvAt('canvas1', 10, 240), uvAt('canvas1', 118, 240), uvAt('canvas1', 118, 10)], nrm);
      }
      fil.flush(bagB, 2.4);
    }
  };
  if (i === 0) finSet(1, 1);
  if (i === n - 1) finSet(-1, 0.7);
  const grp = new THREE.Group();
  grp.position.set(X(Gb.cx), Y(Gb.cy), 0);
  // the twin envelope rides higher behind the first
  if (Gb.twin) {
    const twB = ctx.dynBatch(key + ':twin');
    const twRy = Gb.ry * 0.62, twRgb = rgb;
    const tw = envelope(twB, { rx: Gb.rx * 0.7, ry: twRy, rzK, G: clamp(Math.round(twRy / 20), 10, 12), tail: 1.8, nose: 2.0, rgb: twRgb, seed: seed ^ 0x1234, ow: 5, capRgb, lod: true });
    tw.ribs(rgbOf(T.bagShade), rgbOf(T.bagShade), []);
    tw.ring(tw.sN, 7, 3.4, rgbOf(T.brass), 'brass');
    tw.lacing(Math.PI / 2, tw.L * 0.06, tw.L * 0.94, lace);
    const twg = twB.buildGroup({ cast: true });
    twg.position.set(-20, 258, 0);
    grp.add(twg);
  }
  grp.add(bagB.buildGroup({ cast: true }));

  // (the catenary rigging of WP2 is gone: the envelope no longer hangs over the deck, so there is nothing for the ropes to run to; they would only have crossed the crew's lane)
  const back = W + 10 + 1.14 * rzK * Gb.ry; // how far behind the gondola's far wall the group's centre rides: the whole oval (swell included) clears the top deck's far rail
  void nowTop; void P; void config; void ctx.content; void rig;
  return { key, batches: [rig], dyn: [{ role: 'bag', key, node: grp, G: Gb, i, back, baseX: X(Gb.cx) }], bounds: { x0: X(Gb.cx - Gb.rx) - 30, x1: X(Gb.cx + Gb.rx) + 30, y0: Y(Gb.cy + Gb.ry), y1: Y(Gb.cy - Gb.ry), z0: -back - Gb.ry * rzK, z1: -back + Gb.ry * rzK } };
}
