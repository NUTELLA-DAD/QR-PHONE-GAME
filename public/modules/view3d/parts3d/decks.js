// Decks and everything that stands on or round them (WP2): planked floors (the planks have uv rows from the trim sheet's `deck` strip, with tar-black seams), the slab edge, rails with TURNED POSTS and a
// rope mid-rail, outrigger struts and braces, the nest's basket, the wheelhouse, the compartments under the hull, the belly pod, armour plate and the ram prow, and the CARGO DROP HATCH (a real hole in the
// deck with two leaves that swing on the sim's `door`). Every builder returns { key, batches, dyn, bounds } (registry.js).
import { THREE } from '../style.js';
import { Soup, rgbOf, shade, rng, hashOf } from './kit.js';
import { uvAt, plankLayout } from '../textures.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A turned rail post of height `hi`: foot, bulb, neck, cap. 6 sides.
function post(b, color, x, yBase, z, hi, r = 3.4) {
  const pts = [[r, 0], [r * 0.62, 3.6], [r * 0.62, hi * 0.4], [r * 1.0, hi * 0.5], [r * 0.62, hi * 0.6], [r * 0.7, hi], [0.05, hi + 0.3]];
  b.lathe(color, pts, x, yBase, z, 1.2, { tr: 'woodC', segs: 5 });
}

// The planked top of a deck: lanes of boards running along x, from the `deck` strip's sub-planks. rects: [[xa, xb, zHalf]] (several when a hatch cuts a hole).
function plankTop(b, ctx, q, x0, x1, zHalf, holes) {
  const { T, X, Y } = ctx, R = rng(hashOf('planks' + q.id + x0)), lanes = Math.max(1, Math.round((zHalf * 2) / 28.8)), laneW = (zHalf * 2) / lanes, soup = new Soup();
  const y = Y(q.y) + 0.6, n = [0, 1, 0], base = [rgbOf(T.deck), rgbOf(T.deckAlt)];
  for (let j = 0; j < lanes; j++) {
    const za = -zHalf + j * laneW, zb = za + laneW, zc = (za + zb) / 2, sub = j % 3, lay = plankLayout('deck').boards[sub];
    let bi = Math.floor(R() * lay.length), x = x0 - R() * 150;
    while (x < x1) {
      const [u0, u1] = lay[bi++ % lay.length], len = Math.max(10, (u1 - u0) * 0.9);
      let xa = Math.max(x, x0), xb = Math.min(x + len, x1);
      const tone = 0.95 + R() * 0.08, c = shade(base[j % 2], tone);
      // a hatch's hole takes out the lanes inside it (by the lane's middle)
      let pieces = [[xa, xb]];
      for (const h of holes || []) if (Math.abs(zc) < h.z) pieces = pieces.flatMap(([p, q2]) => (h.x1 <= p || h.x0 >= q2 ? [[p, q2]] : [[p, Math.min(q2, h.x0)], [Math.max(p, h.x1), q2]].filter((t) => t[1] - t[0] > 0.5)));
      for (const [pa, pb] of pieces) {
        const ua = u0 + ((pa - x) / len) * (u1 - u0), ub = u0 + ((pb - x) / len) * (u1 - u0), ty0 = sub * 32 + 1, ty1 = sub * 32 + 31;
        soup.quad([[X(pa), y, za], [X(pb), y, za], [X(pb), y, zb], [X(pa), y, zb]], [n, n, n, n], [c, c, c, c], [uvAt('deck', ua, ty0), uvAt('deck', ub, ty0), uvAt('deck', ub, ty1), uvAt('deck', ua, ty1)], n);
      }
      x += len;
    }
  }
  soup.flush(b, 0);
}

export function buildDeck(q, ctx) {
  const { T, W, X, Y, P, rowOf, isNestRow, KEEL_ROWS, L } = ctx;
  const key = 'deck:' + q.id, b = ctx.part(key), row = rowOf(q), thick = 12, dyn = [];
  const di = P.indexOf(q);
  if (/^pod/.test(q.id)) { // the ball turret: a round pod under the belly
    const mid = (q.x0 + q.x1) / 2, rr = (q.x1 - q.x0) / 2 + 12;
    b.sphere(T.hullDark, X(mid), Y(q.y - 25), 0, rr, 58, rr * 0.95, 4, false, { tr: 'iron', ao: { down: 0.15 } });
    b.sphere(T.glass, X(mid + 35), Y(q.y - 25), rr * 0.7, 22, 22, 12, 2, true);
    b.box(T.rail, X(mid), Y(q.y + 2), 0, q.x1 - q.x0, 8, rr * 1.7, 2, 0, 0, 0, { tr: 'woodC' });
    return { key, batches: [b], dyn, bounds: b.bounds };
  }
  const holes = (L.hatches || []).filter((h) => h.d === di).map((h) => ({ x0: h.x0, x1: h.x1, z: W * 0.7 }));
  const segs = ctx.deckSegs(q);
  for (const [a, c, z, rail] of segs) {
    // the slab: a plank edge all round; a hatch leaves a hole, so the slab is cut into boxes round it
    const cutsHere = holes.filter((h) => h.x1 > a && h.x0 < c).sort((p, s) => p.x0 - s.x0);
    const boxes = [];
    let at = a;
    for (const h of cutsHere) {
      if (h.x0 > at) boxes.push([at, h.x0, -z, z]);
      boxes.push([Math.max(at, h.x0), Math.min(c, h.x1), -z, -h.z], [Math.max(at, h.x0), Math.min(c, h.x1), h.z, z]);
      at = Math.max(at, h.x1);
    }
    if (at < c) boxes.push([at, c, -z, z]);
    for (const [xa, xb, za, zb] of boxes) if (xb - xa > 0.5 && zb - za > 0.5) b.box(T.hull, X((xa + xb) / 2), Y(q.y + thick / 2), (za + zb) / 2, xb - xa, thick, zb - za, 3, 0, 0, 0, { tr: 'woodB', ao: { down: 0.22 } });
    plankTop(b, ctx, q, a, c, z, holes);
    if (rail) {
      const hi = isNestRow(row) ? 56 : 46;
      for (const sgn of [-1, 1]) {
        for (let x = a + 10; x <= c - 5; x += 130) post(b, T.rail, X(x), Y(q.y), sgn * (z - 6), hi);
        const ends = [a + 4, c - 4];
        for (const x of ends) post(b, T.rail, X(x), Y(q.y), sgn * (z - 6), hi + 6, 4.4); // the heavier stanchions at the ends
        b.rod(T.rail, V(X(a + 4), Y(q.y - hi - 3), sgn * (z - 6)), V(X(c - 4), Y(q.y - hi - 3), sgn * (z - 6)), 3, 1.3, { tr: 'woodC' }); // the top rail
        b.rod(T.rope, V(X(a + 4), Y(q.y - hi * 0.52), sgn * (z - 6)), V(X(c - 4), Y(q.y - hi * 0.52), sgn * (z - 6)), 1.5, 0, { tr: 'rope' }); // the rope mid-rail
        for (const x of ends) b.sphere(T.brass, X(x), Y(q.y - hi - 8), sgn * (z - 6), 4.4, 4.4, 4.4, 0.8, true, { tr: 'brass' });
      }
    }
    if (z === W * 0.5 && (q.x1 > ctx.hx1 || q.x0 < ctx.hx0)) { // struts holding an outrigger to the hull, with a cross brace
      const near = a < ctx.hx0 ? c : a, far = a < ctx.hx0 ? a + 18 : c - 18;
      for (const sgn of [-1, 1]) {
        b.rod(T.rail, V(X(far), Y(q.y + 12), sgn * z * 0.6), V(X(near), Y(q.y + 52), sgn * z * 0.6), 4, 1.2, { tr: 'woodC' });
        b.rod(T.rail, V(X(far), Y(q.y + 52), sgn * z * 0.6), V(X(near), Y(q.y + 12), sgn * z * 0.6), 2.6, 0.8, { tr: 'woodC' });
        b.cyl(T.iron, X(far), Y(q.y + 12), sgn * z * 0.6, 4.6, 3, 0.8, Math.PI / 2, 0, 0, undefined, { tr: 'iron' });
      }
    }
  }
  const z0 = Math.max(...segs.map((s) => s[2]), 10);
  if (isNestRow(row)) { // the basket under the nest, with a rim
    const mid = (q.x0 + q.x1) / 2;
    b.sphere(T.hullDark, X(mid), Y(q.y + 36), 0, (q.x1 - q.x0) / 2 + 6, 34, 100, 4, false, { tr: 'woodC' });
    b.geo(T.rail, new THREE.TorusGeometry(1, 0.05, 6, 24), new THREE.Matrix4().compose(V(X(mid), Y(q.y + 6), 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V((q.x1 - q.x0) / 2 + 4, 100, 1)), 1, { tr: 'woodC', uv: 'fit' });
  }
  if (row === 'helm') { // the wheelhouse: end walls, a back wall, a roof; glass facing the viewer's side
    const zh = z0, hh = 120, x0 = q.x0, x1 = q.x1, mx = (x0 + x1) / 2;
    for (const [sink, s] of [[b.neg, -1], [b.pos, 1]]) {
      sink.box(T.wall, X(mx), Y(q.y - hh / 2), s * zh, x1 - x0, hh, 8, 3, 0, 0, 0, { tr: 'woodB', ao: { top: 0.15 } });
      sink.box(T.glass, X(mx), Y(q.y - hh * 0.6), s * (zh + 4.5), (x1 - x0) * 0.6, 40, 2, 1);
      for (const [fx, fy, fw, fh] of [[0, 21, (x1 - x0) * 0.6 + 6, 4], [0, -21, (x1 - x0) * 0.6 + 6, 4], [-(x1 - x0) * 0.3, 0, 4, 44], [(x1 - x0) * 0.3, 0, 4, 44], [0, 0, 3, 40]]) sink.box(T.brass, X(mx) + fx, Y(q.y - hh * 0.6) + fy, s * (zh + 5.6), fw, fh, 3, 0.8, 0, 0, 0, { tr: 'brass' });
    }
    b.box(T.wall, X(x0), Y(q.y - hh / 2), 0, 8, hh, zh * 2, 3, 0, 0, 0, { tr: 'woodB' });
    b.box(T.wall, X(x1), Y(q.y - hh / 2), 0, 8, hh, zh * 2, 3, 0, 0, 0, { tr: 'woodB' });
    b.box(T.hullDark, X(mx), Y(q.y - hh - 6), 0, x1 - x0 + 24, 12, zh * 2 + 24, 3.5, 0, 0, 0, { tr: 'woodC' });
    b.box(T.rail, X(mx), Y(q.y - hh - 14), 0, x1 - x0 + 8, 5, zh * 2 + 8, 1.5, 0, 0, 0, { tr: 'woodC' }); // roof ridge cap
  }
  if (!q.outside && (row === 'bay' || KEEL_ROWS.includes(row))) { // a compartment under the hull: floor plate, ends, back wall
    const zh = z0, ceilY = q.y - 120, mx = (q.x0 + q.x1) / 2;
    b.box(T.hullDark, X(mx), Y(q.y + 20), 0, q.x1 - q.x0 + 24, 14, zh * 2 + 20, 3.5, 0, 0, 0, { tr: 'woodC', ao: { down: 0.2 } });
    for (const [sink, s] of [[b.neg, -1], [b.pos, 1]]) sink.box(T.wall, X(mx), Y((q.y + ceilY) / 2), s * zh, q.x1 - q.x0, q.y - ceilY, 8, 2, 0, 0, 0, { tr: 'woodB', ao: { top: 0.2 } });
    for (const x of [q.x0, q.x1]) b.box(T.hullDark, X(x), Y((q.y + ceilY) / 2), 0, 8, q.y - ceilY, zh * 2, 2.5, 0, 0, 0, { tr: 'woodC' });
  }
  return { key, batches: [b], dyn, bounds: b.bounds };
}

// the CARGO DROP HATCH: a coaming round the hole, and two leaves hinged at the ends that swing down on the sim's `door` (0 shut .. 1 wide)
export function buildHatch(h, ctx) {
  const { T, W, X, Y, P } = ctx, key = 'dropHatch:' + (h.n || h.x0), b = ctx.part(key), dyn = [];
  const y = ctx.platY(h.d), zh = W * 0.7, w = h.x1 - h.x0, half = w / 2;
  for (const s of [-1, 1]) b.box(T.iron, X((h.x0 + h.x1) / 2), Y(y - 2), s * (zh + 2.5), w + 6, 5, 5, 1, 0, 0, 0, { tr: 'iron' });
  for (const x of [h.x0, h.x1]) b.box(T.iron, X(x), Y(y - 2), 0, 5, 5, zh * 2 + 10, 1, 0, 0, 0, { tr: 'iron' });
  // hazard stripes: two yellow bars
  b.box('#d9a93a', X(h.x0 - 14), Y(y - 0.9), 0, 12, 1.2, zh * 2, 0, 0, 0, 0, { tr: 'plain' });
  b.box('#d9a93a', X(h.x1 + 14), Y(y - 0.9), 0, 12, 1.2, zh * 2, 0, 0, 0, 0, { tr: 'plain' });
  const leaf = (side) => {
    const lb = ctx.dynBatch(key + ':leaf' + side), dir = side > 0 ? 1 : -1; // (the left leaf lies to the right of its hinge)
    lb.box(T.deckAlt, dir * half / 2, -2, 0, half - 1, 3.2, zh * 2 - 2, 1.2, 0, 0, 0, { tr: 'deck' });
    for (const k of [0.25, 0.7]) lb.box(T.iron, dir * half * k, -2, 0, 8, 3.8, zh * 2 - 3, 0.6, 0, 0, 0, { tr: 'iron' }); // iron straps
    lb.cyl(T.iron, dir * half * 0.82, -3.6, 0, 3.4, 3, 0.6, Math.PI / 2, 0, 0, undefined, { tr: 'iron' }); // the ring pull
    const g = lb.buildGroup();
    const piv = new THREE.Group();
    piv.position.set(X(side > 0 ? h.x0 : h.x1), Y(y - 0), 0);
    piv.add(g);
    ctx.content.add(piv);
    return piv;
  };
  const left = leaf(1), right = leaf(-1);
  dyn.push({ role: 'hatch', key, n: h.n, left, right, node: left });
  return { key, batches: [b], dyn, bounds: b.bounds };
}

export function buildArmour(a, ctx, i) {
  const { T, W, X, Y, P } = ctx, key = 'armour:' + i, b = ctx.part(key);
  const q = P[a.d];
  if (!q) return { key, batches: [b], dyn: [], bounds: null };
  const hgt = q.outside ? 40 : 90;
  for (const [sink, sgn] of [[b.neg, -1], [b.pos, 1]]) {
    const zz = sgn * (q.outside ? W * 0.9 + 6 : W) + (sgn > 0 ? 6 : -6), cx = X((a.x0 + a.x1) / 2), cy = Y(q.y - hgt / 2 + 10);
    sink.box('#8d969b', cx, cy, zz, a.x1 - a.x0, hgt, 8, 3, 0, 0, 0, { tr: 'iron' });
    for (const dy of [-hgt / 2 + 3, hgt / 2 - 3]) sink.box('#7b848a', cx, cy + dy, zz + sgn * 1.6, a.x1 - a.x0 + 3, 5, 9, 1, 0, 0, 0, { tr: 'iron' });
  }
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildRam(r, ctx) {
  const { T, X, Y } = ctx, key = 'ramProw', b = ctx.part(key);
  if (!r || !r.pts) return { key, batches: [b], dyn: [], bounds: null };
  const sh = new THREE.Shape();
  r.pts.forEach(([x, y], i) => (i ? sh.lineTo(X(x), Y(y)) : sh.moveTo(X(x), Y(y))));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 92, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -46);
  b.geo(T.iron, g, null, 4, { tr: 'iron' });
  b.cone('#8d969b', X(r.tipX + 24), Y(r.y), 0, 26, 60, 3, 0, 0, -Math.PI / 2, { tr: 'iron' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}
