// Rooms (WP2): the painted panelling on the inside of both hull walls, with baked vertex-colour occlusion (about 20% darker near each ceiling and under every deck), pilasters at the room ends, a chair
// rail and a skirting board, and the hanging lanterns (a brass cage round a lamp that glows warm when it is dark; shipMesh.js merges the glowing bulbs of all lanterns into one mesh and keeps
// model.lights.points for the real lights).
import { THREE } from '../style.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the room's ceiling: the underside of the deck above it that overlaps it, else a default height
export function ceilingOf(ctx, q, x0, x1) {
  const { P, isNestRow, rowOf } = ctx;
  let best = q.y - 165;
  for (const o of P) {
    if (o === q || isNestRow(rowOf(o))) continue;
    if (o.y < q.y - 40 && o.y > q.y - 230 && o.x1 > x0 + 20 && o.x0 < x1 - 20) best = Math.max(best, o.y + 12);
  }
  return best;
}

export function buildRoom(r, ctx, i) {
  const { T, W, X, Y, P, mix, rowOf } = ctx;
  const key = 'room:' + (r.name || i), b = ctx.part(key), q = P[r.d];
  if (!q || r.outside || q.outside || !['main', 'lower', 'keel', 'deep'].includes(rowOf(q))) return { key, batches: [b], dyn: [], bounds: null };
  const top = ceilingOf(ctx, q, r.x0, r.x1), h = q.y - top;
  const col = mix(r.color || '#b08250', T.hullDark, T.roomTint);
  const dark = mix(col, '#000000', 0.25), mid = mix(col, '#000000', 0.12), cx = X((r.x0 + r.x1) / 2), ww = r.x1 - r.x0 - 4;
  for (const [sink, s] of [[b.neg, -1], [b.pos, 1]]) {
    const zi = s * (W - 13.5);
    sink.box(col, cx, Y(q.y - h / 2), zi, ww, h - 2, 3, 0, 0, 0, 0, { tr: 'woodB', ao: { top: 0.22, band: 0.34, down: 0 } }); // the panelling: darker toward the ceiling
    sink.box(mid, cx, Y(q.y - h * 0.4), zi - s * 1.6, ww, 4, 3.2, 0, 0, 0, 0, { tr: 'woodC' }); // chair rail
    sink.box(dark, cx, Y(q.y - 8), zi - s * 1.2, ww, 14, 3.5, 0, 0, 0, 0, { tr: 'woodC' }); // skirting
    for (const x of [r.x0 + 3, r.x1 - 3]) sink.box(dark, X(x), Y(q.y - h / 2), zi - s * 1.4, 6, h - 2, 3.6, 0, 0, 0, 0, { tr: 'woodC', ao: { top: 0.2 } }); // pilasters
  }
  const dyn = [];
  if (ctx.lanternRooms.has(r)) { // a lantern hung from the ceiling beam, toward the viewer side's far wall
    const x = (r.x0 + r.x1) / 2, y = q.y - 128, z = -W + 40;
    b.rod(T.rail, V(X(x), Y(y - 18), z), V(X(x), Y(y), z), 1.5, 0, { tr: 'woodC' });
    b.cone(T.brass, X(x), Y(y - 11), z, 8.5, 8, 0.8, 0, 0, 0, { tr: 'brass' }); // the cap
    b.cyl(T.brass, X(x), Y(y + 10), z, 7, 3, 0.8, 0, 0, 0, undefined, { tr: 'brass' }); // the cup
    for (const [dx, dz] of [[-7, 0], [7, 0], [0, -7], [0, 7]]) b.rod(T.brass, V(X(x) + dx, Y(y - 8), z + dz), V(X(x) + dx, Y(y + 9), z + dz), 0.9, 0, { tr: 'brass' }); // the cage bars
    ctx.lanternSpots.push([X(x), Y(y), z, (r.x1 - r.x0) / 2, h]); // (WP10: the room's half width and height too, so the lantern's faked pool on the wall stays inside the room)
  }
  return { key, batches: [b], dyn, bounds: b.bounds };
}
