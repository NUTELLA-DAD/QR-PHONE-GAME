// The gondola hull, LOFTED (WP2): the side silhouette is the layout's hull outline (shipBuild.js hullGeom), the cross-section is a rounded box with a small bulge, a bevelled chine and a keel, and the skin is
// laid in PLANKING ROWS (strakes) that follow the hull: every strake is a run of boards, each board a quad strip whose uv is a window of a plank strip of the trim sheet (so the butt joints, knots and
// nails are where the picture has them). Rivet bands run along the gunwale and the chine, a wale (a thick plank) round the middle, a keel along the bottom, the stern transom, the rudder, the bow and its details.
// Cut-away: the two sides go in the 'neg' and 'pos' layers (the wall that faces the camera is hidden by the assembler's draw range); the hull's INNER lining and the room colours are the far wall's face.
//   buildHull(ctx) -> { key: 'hull', batches, dyn: [rudder], bounds }
// Everything is rigid; the only thing that moves is the rudder, which stays hard over while she comes about.
import { THREE } from '../style.js';
import { Soup, rgbOf, shade, mixRgb, rng, hashOf } from './kit.js';
import { uvAt, plankLayout, WOODS } from '../textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const bez = (p0, c, p1, n = 8) => { const out = []; for (let i = 1; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; out.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]); } return out; };

// The outline of the gondola in ship coordinates (what shipBuild.hullGeom describes; shipMesh used to extrude it).
export function hullPolygon(H) {
  const top = H.top;
  return [[H.xL, top], [H.xTopR, top], ...bez([H.xTopR, top], [H.xR, top + 4], [H.xR, H.yShoulder]), ...bez([H.xR, H.yShoulder], [H.xR - 4, H.yTuck], [H.xNose, H.yTuck2]), [H.xKeelR, H.yKeel], [H.xKeelL, H.yKeel], [H.xL2, H.yTuck2]];
}

// the top and bottom of the polygon at x (min and max of the crossings), or null
function extentAt(poly, x) {
  let lo = 1e9, hi = -1e9;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a[0] <= x && x <= b[0]) || (b[0] <= x && x <= a[0])) {
      if (Math.abs(b[0] - a[0]) < 1e-6) { lo = Math.min(lo, a[1], b[1]); hi = Math.max(hi, a[1], b[1]); continue; }
      const y = a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
  }
  return hi < lo ? null : [lo, hi];
}

// the cross-section: how wide the hull is at fraction f of its height (0 = gunwale, 1 = keel), as a share of the full half-beam
const section = (f) => (f <= 0.55 ? 0.955 + 0.045 * Math.sin(Math.PI / 2 * (f / 0.55)) : f <= 0.9 ? 1 - 0.015 * smooth(0.55, 0.9, f) : 0.985 - 0.42 * Math.pow((f - 0.9) / 0.1, 1.6));
const STRAKES = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.82, 0.9, 0.955, 1];

// ctx: the shared ship context (shipMesh.js). poly: ship coordinates. o: { W, x0, x1, bowX, strakes, inEnd, caps, tag }
function loft(b, ctx, poly, o) {
  const { X, Y, T } = ctx;
  const W = o.W, xmin = o.x0, xmax = o.x1, th = o.th || 11;
  const R = rng(hashOf('hull' + (o.tag || '')));
  const hullRgb = rgbOf(T.hull), inRgb = shade(rgbOf(T.hullDark), 0.96);
  const cache = new Map();
  const ext = (x) => {
    const k = Math.round(x * 50);
    let e = cache.get(k);
    if (!e) { e = extentAt(poly, clamp(x, xmin + 0.02, xmax - 0.02)); if (!e) { const m = extentAt(poly, (xmin + xmax) / 2) || [0, 1]; e = [(m[0] + m[1]) / 2, (m[0] + m[1]) / 2]; } cache.set(k, e); }
    return e;
  };
  const bf = (x) => { if (!o.bowX || x <= o.bowX) return 1; const t = (x - o.bowX) / Math.max(1, xmax - o.bowX); return Math.max(0.06, Math.sqrt(Math.max(0, 1 - t * t))); };
  const pos = (x, f, s, inset = 0, out = 0) => { const e = ext(x), y = e[0] + (e[1] - e[0]) * f; return [X(x), Y(y), s * Math.max(2, W * bf(x) * section(f) - inset + out)]; };
  const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const nrm = (x, fm, s) => { // outward normal: smooth along the hull, faceted from strake to strake
    const a = pos(x - 3, fm, s), c = pos(x + 3, fm, s), p0 = pos(x, Math.max(0, fm - 0.03), s), p1 = pos(x, Math.min(1, fm + 0.03), s);
    let n = norm(cross(sub(p1, p0), sub(c, a)));
    if (n[2] * s < 0) n = [-n[0], -n[1], -n[2]];
    return n;
  };
  // the stations along the hull: dense at the ends, plus every x the outline bends at
  const NS = o.stations || 14, xs = [];
  for (let k = 0; k <= NS; k++) xs.push(xmin + (xmax - xmin) * (0.5 - 0.5 * Math.cos((Math.PI * k) / NS)));
  for (const p of poly) if (p[0] > xmin + 3 && p[0] < xmax - 3) xs.push(p[0]);
  if (o.bowX) xs.push(o.bowX);
  xs.sort((a, c) => a - c);
  const stations = xs.filter((x, i) => i === 0 || x - xs[i - 1] > 3.5);
  const mid = (xmin + xmax) / 2, hMid = (() => { const e = ext(mid); return Math.max(24, e[1] - e[0]); })();
  const F = o.strakes || (hMid < 120 ? [0, 0.3, 0.55, 0.8, 1] : STRAKES);

  for (const s of [-1, 1]) {
    const sink = s < 0 ? b.neg : b.pos, soup = new Soup();
    F.forEach((f0, i) => {
      if (i === F.length - 1) return;
      const f1 = F[i + 1], fm = (f0 + f1) / 2;
      const row = WOODS[(i * 5 + (s < 0 ? 1 : 0) + (hashOf(o.tag || 'h') & 3)) % 3];
      const lay = plankLayout(row).boards[0], tsI = Math.max(0.3, ((f1 - f0) * hMid) / 90);
      let bi = Math.floor(R() * lay.length), x = xmin - R() * 150 * tsI * 1.2;
      while (x < xmax) {
        const [u0, u1] = lay[bi++ % lay.length], lenW = Math.max(8, (u1 - u0) * tsI), xa = Math.max(x, xmin), xb = Math.min(x + lenW, xmax);
        const tone = 0.93 + R() * 0.13;
        if (xb - xa > 0.5) {
          const pts = [xa, ...stations.filter((q) => q > xa + 1 && q < xb - 1), xb];
          for (let k = 0; k + 1 < pts.length; k++) {
            const xp = pts[k], xq = pts[k + 1], P = [pos(xp, f0, s), pos(xq, f0, s), pos(xq, f1, s), pos(xp, f1, s)];
            const N = [nrm(xp, fm, s), nrm(xq, fm, s), nrm(xq, fm, s), nrm(xp, fm, s)];
            const cUp = shade(hullRgb, tone * (1 - 0.1 * f0)), cDn = shade(hullRgb, tone * (1 - 0.1 * f1));
            const up = (x_) => u0 + ((x_ - x) / lenW) * (u1 - u0);
            const U = [uvAt(row, up(xp), 2), uvAt(row, up(xq), 2), uvAt(row, up(xq), 94), uvAt(row, up(xp), 94)];
            soup.quad(P, N, [cUp, cUp, cDn, cDn], U, N[0]);
          }
        }
        x += lenW;
      }
    });
    soup.flush(sink, 4);

    // bands: a rivet band along the gunwale and the chine, the wale (a thick plank) round the middle
    const band = (f0, f1, out, rgb, row, win, ow) => {
      const sp = new Soup(), step = 90;
      for (let x = xmin; x < xmax - 1; x += step) {
        const xq = Math.min(xmax, x + step), P = [pos(x, f0, s, 0, out), pos(xq, f0, s, 0, out), pos(xq, f1, s, 0, out), pos(x, f1, s, 0, out)];
        const n = nrm((x + xq) / 2, (f0 + f1) / 2, s), u0 = 10, u1 = 10 + (xq - x) * win;
        sp.quad(P, [n, n, n, n], [rgb, rgb, rgb, rgb], [uvAt(row, u0, 10), uvAt(row, u1, 10), uvAt(row, u1, row === 'iron' ? 118 : 94), uvAt(row, u0, row === 'iron' ? 118 : 94)], n);
      }
      sp.flush(sink, ow);
    };
    band(0.012, 0.07, 1.8, shade(rgbOf(T.iron), 1.15), 'iron', 1.15, 1.2); // gunwale rivet band
    band(0.4, 0.46, 3.2, shade(rgbOf(T.rail), 1.05), 'woodC', 1.0, 1.4); // the wale
    if (F.length > 6) band(0.88, 0.935, 2.4, shade(rgbOf(T.iron), 1.1), 'iron', 1.15, 1.2); // chine rivet band

    // the inner lining: the far wall's face, darker toward the ceiling (baked occlusion)
    const lin = new Soup();
    const LF = hMid < 120 ? [0, 0.5, 0.9] : [0, 0.3, 0.9];
    for (let i = 0; i + 1 < LF.length; i++) {
      const f0 = LF[i], f1 = LF[i + 1];
      const ao = (f) => 0.72 + 0.28 * smooth(0, 0.3, f);
      for (let k = 0; k + 1 < stations.length; k++) {
        const xp = stations[k], xq = stations[k + 1];
        if (xp < xmin + 1) continue;
        const P = [pos(xp, f0, s, th), pos(xq, f0, s, th), pos(xq, f1, s, th), pos(xp, f1, s, th)];
        const n = [0, 0, -s], c0 = shade(inRgb, ao(f0)), c1 = shade(inRgb, ao(f1));
        const ua = 40 + (xp - xmin) / 0.9, ub = 40 + (xq - xmin) / 0.9;
        lin.quad(P, [n, n, n, n], [c0, c0, c1, c1], [uvAt('woodC', ua, 8), uvAt('woodC', ub, 8), uvAt('woodC', ub, 88), uvAt('woodC', ua, 88)], n);
      }
    }
    lin.flush(sink, 0);
    // the cap of the wall: a flat strip along the top between the skin and the lining (it is what the cut edge shows)
    const capS = new Soup();
    for (let k = 0; k + 1 < stations.length; k++) {
      const xp = stations[k], xq = stations[k + 1];
      if (xp < xmin + 1) continue;
      const P = [pos(xp, 0, s), pos(xq, 0, s), pos(xq, 0, s, th), pos(xp, 0, s, th)], n = [0, 1, 0], c = shade(hullRgb, 0.86);
      capS.quad(P, [n, n, n, n], [c, c, c, c], [uvAt('woodC', 10, 4), uvAt('woodC', 60, 4), uvAt('woodC', 60, 20), uvAt('woodC', 10, 20)], n);
    }
    capS.flush(sink, 0);
  }

  // the roof and the belly (both in the always-drawn layer), and the keel along the middle of the belly
  const roof = new Soup(), belly = new Soup(), keel = new Soup();
  for (let k = 0; k + 1 < stations.length; k++) {
    const xp = stations[k], xq = stations[k + 1], n = [0, 1, 0];
    const rP = [pos(xp, 0, -1), pos(xq, 0, -1), pos(xq, 0, 1), pos(xp, 0, 1)], rc = shade(hullRgb, 0.95);
    const ua = 30 + ((xp - xmin) / 0.9) % 1500, ub = ua + (xq - xp) / 0.9;
    roof.quad(rP, [n, n, n, n], [rc, rc, rc, rc], [uvAt('woodB', ua, 6), uvAt('woodB', ub, 6), uvAt('woodB', ub, 90), uvAt('woodB', ua, 90)], n);
    const bP = [pos(xp, 1, -1), pos(xq, 1, -1), pos(xq, 1, 1), pos(xp, 1, 1)], bc = shade(hullRgb, 0.74), dn = [0, -1, 0];
    belly.quad(bP, [dn, dn, dn, dn], [bc, bc, bc, bc], [uvAt('woodC', ua, 6), uvAt('woodC', ub, 6), uvAt('woodC', ub, 90), uvAt('woodC', ua, 90)], dn);
    // ...and its inside (the bilge floor you see from the cut-away: a single-sided belly would show only its black ink shell there)
    const ic = shade(inRgb, 0.82), upN = [0, 1, 0];
    belly.quad(bP.map((p) => [p[0], p[1] + 0.8, p[2]]), [upN, upN, upN, upN], [ic, ic, ic, ic], [uvAt('woodC', ua, 6), uvAt('woodC', ub, 6), uvAt('woodC', ub, 90), uvAt('woodC', ua, 90)], upN);
    if (o.keel !== false) { // the keel: a beam hanging under the belly
      const kw = Math.min(12, W * 0.07), kd = 9, e0 = ext(xp), e1 = ext(xq);
      const kc = shade(rgbOf(T.hullDark), 0.9), kt = shade(kc, 0.9);
      const a0 = V(X(xp), Y(e0[1]), 0), a1 = V(X(xq), Y(e1[1]), 0);
      const lo0 = [a0.x, a0.y - kd, 0], lo1 = [a1.x, a1.y - kd, 0];
      const sd = (zz, nn) => keel.quad([[a0.x, a0.y, zz], [a1.x, a1.y, zz], [lo1[0], lo1[1], zz], [lo0[0], lo0[1], zz]], [nn, nn, nn, nn], [kc, kc, kt, kt], [uvAt('woodC', 10, 10), uvAt('woodC', 40, 10), uvAt('woodC', 40, 40), uvAt('woodC', 10, 40)], nn);
      sd(kw, [0, 0, 1]); sd(-kw, [0, 0, -1]);
      keel.quad([[lo0[0], lo0[1], -kw], [lo1[0], lo1[1], -kw], [lo1[0], lo1[1], kw], [lo0[0], lo0[1], kw]], [dn, dn, dn, dn], [kt, kt, kt, kt], [uvAt('woodC', 10, 10), uvAt('woodC', 40, 10), uvAt('woodC', 40, 40), uvAt('woodC', 10, 40)], dn);
    }
  }
  roof.flush(b, 3); belly.flush(b, 3); keel.flush(b, 2);

  // the ends: the stern transom (outside), and the inner end plates that close the room so it is not a black void
  const plate = (x, s2, inset, rgb, row, caps) => { // a vertical plate across the hull at x, facing s2 (+1 / -1 along x)
    const sp = new Soup(), fs = [0, 0.3, 0.6, 0.9, 1], n = [s2, 0, 0];
    for (let i = 0; i + 1 < fs.length; i++) {
      const f0 = fs[i], f1 = fs[i + 1];
      if (inset && f0 >= 0.9) break;
      const P = [pos(x, f0, -1, inset), pos(x, f0, 1, inset), pos(x, f1, 1, inset), pos(x, f1, -1, inset)];
      const c0 = caps ? rgb : shade(rgb, 0.72 + 0.28 * smooth(0, 0.3, f0)), c1 = caps ? rgb : shade(rgb, 0.72 + 0.28 * smooth(0, 0.3, f1));
      sp.quad(P, [n, n, n, n], [c0, c0, c1, c1], [uvAt(row, 30, 6 + i * 20), uvAt(row, 330, 6 + i * 20), uvAt(row, 330, 26 + i * 20), uvAt(row, 30, 26 + i * 20)], n);
    }
    sp.flush(b, caps ? 3 : 0);
  };
  const e0 = ext(xmin + 0.5), e1 = ext(xmax - 0.5);
  if (o.caps !== false && e0[1] - e0[0] > 8) { plate(xmin, -1, 0, shade(hullRgb, 0.9), 'woodB', true); plate(xmin + 0.6, 1, 0, inRgb, 'woodC', false); } // (the stern transom, and its inside: a single-sided plate seen from within would show only its ink)
  if (o.inPlates !== false) {
    if (e0[1] - e0[0] > 8) plate(xmin + th, 1, th, inRgb, 'woodC', false);
    if (o.inEnd != null && e1[1] - e1[0] > 8) plate(o.inEnd, -1, th, inRgb, 'woodC', false);
    else if (e1[1] - e1[0] > 8 && o.caps !== false) plate(xmax, 1, 0, shade(hullRgb, 0.9), 'woodB', true);
  }
  return { ext, pos, bf, xmin, xmax };
}

// ---- the rudder: a blade on a post at the stern, hung from brass pintles; it stays hard over while she comes about -------------------------------------------------------------------------------------
function makeRudder(ctx, x, yTop, yBot) {
  const { T, X, Y } = ctx;
  const rb = ctx.dynBatch('rudder'), hh = Math.max(20, (yBot - yTop) / 2), cy = (yTop + yBot) / 2;
  rb.cyl(T.brass, 0, 0, 0, 3.4, hh * 2 + 8, 1.4, 0, 0, 0, undefined, { tr: 'brass' });
  const sh = new THREE.Shape();
  sh.moveTo(-2, hh); sh.lineTo(-2, -hh); sh.lineTo(-48, -hh * 0.9); sh.lineTo(-72, -hh * 0.2); sh.lineTo(-64, hh * 0.78); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 1, curveSegments: 4 });
  g.translate(0, 0, -3);
  rb.geo(T.hullDark, g, null, 2, { tr: 'woodC' });
  for (const k of [-0.62, 0, 0.62]) rb.box(T.brass, -34, hh * k, 0, 70, 5, 9.4, 1, 0, 0, 0, { tr: 'brass' });
  const pivot = new THREE.Group();
  pivot.position.set(X(x), Y(cy), 0);
  pivot.add(rb.buildGroup());
  ctx.content.add(pivot);
  return { role: 'rudder', key: 'hull', node: pivot };
}

// ---- the DOORWAYS (fix_ship). A hull deck (main / lower) that runs on past the end of the gondola (the stern and the bow) is the way out to the outriggers: the nav graph walks the crew straight through the end of the hull
// there. The end of the hull is closed by the end plates, the slanted belly board and the far wall's lining, so the shader CARVES an opening through all of them (ctx.carves, kit.js), as high as a crewman with his
// cap on, and an open frame stands round it: a post at each end and a lintel, on the far wall's plane (a copy on each side, only the far one shows, as the ladders do).
function addDoors(b, ctx, H, th) {
  const { P, W, X, T, rowOf, hx0, hx1 } = ctx, DOORH = 136;
  const clampN = (v, a, c) => Math.max(a, Math.min(c, v));
  const doors = [];
  for (const q of P) {
    if (q.outside || !['main', 'lower'].includes(rowOf(q))) continue;
    const yF = q.y, fl = clampN((yF - H.yTuck2) / Math.max(1, H.yKeel - H.yTuck2), 0, 1);
    if (q.x0 < hx0 - 6) { // the stern: where the slanted belly meets this floor (or the plate's inner face), plus a little
      const xf = H.xKeelL > H.xL2 && yF > H.yTuck2 && yF < H.yKeel ? H.xL2 + fl * (H.xKeelL - H.xL2) : hx0 + th;
      doors.push({ q, xa: hx0 - 0.3, xb: clampN(Math.max(hx0 + th + 10, xf + 16, hx0 + 76), hx0 + 10, hx0 + 260), dir: -1 }); // (the deck's own end posts stand just outside the hull: the carve stops short of them)
    }
    if (q.x1 > hx1 + 6) { // the bow
      const xf = H.xKeelR < H.xNose && yF > H.yTuck2 && yF < H.yKeel ? H.xNose - fl * (H.xNose - H.xKeelR) : H.xNose - 4 - th;
      doors.push({ q, xa: clampN(Math.min(H.xNose - 4 - th - 8, xf - 16, hx1 - 76), hx1 - 260, hx1 - 10), xb: hx1 - 0.5, dir: 1 });
    }
  }
  for (const d of doors) {
    const yF = d.q.y, ytop = yF - DOORH, zf = W - 18, w = d.xb - d.xa;
    ctx.carves.push({ box: [X(d.xa + 10), -(yF - 1.5), X(d.xb - 10), -ytop, -W * 1.15, W * 1.15], side: 0 }); // (the end plates, the belly board and the far lining, within the doorway's height)
    for (const [sink, s] of [[b.neg, -1], [b.pos, 1]]) {
      const z = s * zf;
      for (const x of [d.xa + 5, d.xb - 5]) sink.box(T.rail, X(x), -(yF - DOORH / 2), z, 10, DOORH, 16, 1.2, 0, 0, 0, { tr: 'woodC' }); // the door posts
      sink.box(T.rail, X(d.xa + w / 2), -(ytop - 6), z, w, 12, 18, 1.2, 0, 0, 0, { tr: 'woodC' }); // the lintel
      sink.box(T.brass, X(d.xa + 5), -(ytop - 13), z, 14, 4, 20, 0.6, 0, 0, 0, { tr: 'brass' }); // a brass cap on each post's head
      sink.box(T.brass, X(d.xb - 5), -(ytop - 13), z, 14, 4, 20, 0.6, 0, 0, 0, { tr: 'brass' });
    }
  }
  ctx.doors = doors;
}

export function buildHull(ctx) {
  const { L, T, W, X, Y, P, H, rowOf, isNestRow } = ctx;
  const b = ctx.part('hull'), dyn = [];
  const noteBounds = {};
  if (!H) { // no main / lower deck (the enemy gunship): a boat tray under her lowest deck
    const decks = P.filter((q) => !isNestRow(rowOf(q))), lo = decks.reduce((a, q) => (q.y > a.y ? q : a), decks[0] || P[0]);
    if (!lo) return { key: 'hull', batches: [b], dyn, bounds: null };
    const lows = P.filter((q) => q.y >= lo.y - 170), a0 = Math.min(...lows.map((q) => q.x0)) - 16, a1 = Math.max(...lows.map((q) => q.x1)) + 30, y0 = lo.y + 12;
    const poly = [[a0, y0], [a1, y0], [a1 - 90, y0 + 70], [a0 + 100, y0 + 70]];
    loft(b, ctx, poly, { W: W * 0.8, x0: a0, x1: a1, tag: 'tray', strakes: [0, 0.3, 0.6, 0.85, 1], caps: false, inPlates: false, stations: 14, keel: false, th: 8 });
    dyn.push(makeRudder(ctx, a0 - 6, y0 - 70, y0 + 60));
    return { key: 'hull', batches: [b], dyn, bounds: b.bounds };
  }
  const poly = hullPolygon(H), xmin = H.xL, xmax = H.xR - 0.5;
  const lf = loft(b, ctx, poly, { W, x0: xmin, x1: xmax, bowX: H.xNose, inEnd: H.xNose - 4, tag: 'gondola', stations: 14 });
  try { addDoors(b, ctx, H, 11); } catch (e) { ctx.note('doors failed: ' + (e && e.message)); }
  // full decks added under the lower deck: a box hull round each (chamfered underneath)
  (H.boxes || []).forEach((bx, i) => {
    const p2 = [[bx.x0, bx.y0], [bx.x1, bx.y0], [bx.x1, bx.y1 - 26], [bx.x1 - 26, bx.y1], [bx.x0 + 26, bx.y1], [bx.x0, bx.y1 - 26]];
    loft(b, ctx, p2, { W: W * 0.92, x0: bx.x0, x1: bx.x1 - 0.3, tag: 'box' + i, strakes: [0, 0.3, 0.6, 0.85, 1], stations: 10, inEnd: bx.x1 - 12, keel: false, th: 9 });
  });
  // bridge windows (brass frames) and portholes on both walls' outsides
  const md = P.find((q) => q.id === 'main');
  for (const s of [-1, 1]) {
    const sink = s < 0 ? b.neg : b.pos;
    for (const dx of [-320, -220, -120]) {
      const x = H.xNose + dx + 40, wx = X(x), wy = Y(H.top + 48), z = lf.pos(x, 0.14, s, 0, 1.2)[2];
      sink.box(T.glass, wx, wy, z, 80, 56, 3, 2, 0, 0, 0, { tr: 'plain' });
      for (const [fx, fy, fw, fh] of [[0, 30, 88, 5], [0, -30, 88, 5], [-42, 0, 5, 62], [42, 0, 5, 62], [0, 0, 4, 56]]) sink.box(T.brass, wx + fx, wy + fy, z + s * 1.4, fw, fh, 3.4, 1, 0, 0, 0, { tr: 'brass' });
    }
    if (md) for (const dx of [170, 420, 870, 1120]) {
      const x = md.x0 + dx;
      if (x >= md.x1 - 40) continue;
      const f = clamp((md.y + 50 - H.top) / Math.max(40, H.yKeel - H.top), 0.1, 0.9), z = lf.pos(x, f, s, 0, 1.2)[2];
      sink.cyl(T.glass, X(x), Y(md.y + 50), z, 16, 3, 2, Math.PI / 2);
      sink.geo(T.brass, new THREE.TorusGeometry(17, 2.6, 4, 10), new THREE.Matrix4().makeTranslation(X(x), Y(md.y + 50), z + s * 1.4), 1, { tr: 'brass' });
    }
  }
  // the bow: a bowsprit with a brass ball, an iron stem band down the nose, two hawse pipes
  const by = H.yShoulder, bx0 = H.xR;
  b.rod(T.rail, V(X(bx0 - 24), Y(by + 8), 0), V(X(bx0 + 84), Y(by - 34), 0), 3.8, 1.4, { tr: 'woodC' });
  b.sphere(T.brass, X(bx0 + 88), Y(by - 36), 0, 5.6, 5.6, 5.6, 1.2, true, { tr: 'brass' });
  b.rod(T.rope, V(X(bx0 + 84), Y(by - 34), 0), V(X(bx0 - 6), Y(by + 70), 0), 1.4, 0, { tr: 'rope' });
  for (const s of [-1, 1]) b.cyl(T.iron, X(bx0 - 12), Y(by + 22), s * W * 0.24, 6.5, 14, 1.4, Math.PI / 2, 0, 0, undefined, { tr: 'iron' });
  b.box(T.iron, X(bx0 - 2), Y((H.top + by) / 2 + 20), 0, 6, Math.max(30, by - H.top - 40), 12, 1.2, 0, 0, 0, { tr: 'iron' }); // (the stem band)
  // the rudder at the stern
  dyn.push(makeRudder(ctx, H.xL - 6, H.top + 30, H.yTuck2 + 56));
  void noteBounds;
  return { key: 'hull', batches: [b], dyn, bounds: b.bounds };
}
