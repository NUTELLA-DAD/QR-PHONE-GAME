// Rooms (WP2): the painted panelling on the inside of both hull walls, with baked vertex-colour occlusion (about 20% darker near each ceiling and under every deck), pilasters at the room ends, a chair
// rail and a skirting board, and the hanging lanterns (a brass cage round a lamp that glows warm when it is dark; shipMesh.js merges the glowing bulbs of all lanterns into one mesh and keeps
// model.lights.points for the real lights).
import { THREE } from '../style.js';
import { Soup, rgbOf, shade, hashOf } from './kit.js';
import { uvAt } from '../textures.js';
import { config } from '../../../config.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// A5: the far wall is a step LIGHTER and a little less saturated than the floors and the (brown) stations in front of it, with vertex-colour occlusion under the ceiling, in the corners and along the floor, and a dark
// skirting board where it meets the deck: so the helm, racks, tables and ladders stand OUT of it instead of melting into one brown. All numbers: LOOK3D.STATIONS.WALL.
const wallCfg = () => ({ LIGHT: 1.4, SAT: 0.72, AO_TOP: 0.3, AO_CORNER: 0.3, AO_FLOOR: 0.2, SKIRT: 0.55, ...(((config.LOOK3D || {}).STATIONS || {}).WALL || {}) });
function lightWall(hex, WC) {
  const c = new THREE.Color(hex), h = {};
  c.getHSL(h, THREE.SRGBColorSpace);
  c.setHSL(h.h, Math.min(1, h.s * WC.SAT), Math.min(0.9, h.l * WC.LIGHT), THREE.SRGBColorSpace);
  return '#' + c.getHexString(THREE.SRGBColorSpace);
}
// the panelling as a 3 x 3 grid of vertex-coloured quads (the shade is in the corners of the quads, so it fades smoothly): x edges at 0 / 10% / 90% / 100% of the width, y edges (from the ceiling down) at 0 / 22% / 90% / 100%
function wallGrid(sink, s, x0, x1, yTop, yBot, z, rgb, WC, u0) {
  const xs = [0, 0.1, 0.9, 1], ys = [0, 0.22, 0.9, 1];
  const kx = [1 - WC.AO_CORNER, 1, 1, 1 - WC.AO_CORNER], ky = [1 - WC.AO_TOP, 0.95, 1, 1 - WC.AO_FLOOR];
  const n = [0, 0, -s], soup = new Soup();
  const Pt = (i, j) => [x0 + (x1 - x0) * xs[i], yTop + (yBot - yTop) * ys[j], z];
  const C = (i, j) => shade(rgb, kx[i] * ky[j]);
  const U = (i, j) => uvAt('woodB', u0 + ((x1 - x0) * xs[i]) / 0.9, 4 + 86 * ys[j]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) soup.quad([Pt(i, j), Pt(i + 1, j), Pt(i + 1, j + 1), Pt(i, j + 1)], [n, n, n, n], [C(i, j), C(i + 1, j), C(i + 1, j + 1), C(i, j + 1)], [U(i, j), U(i + 1, j), U(i + 1, j + 1), U(i, j + 1)], n);
  soup.flush(sink, 0);
}

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
  const WC = wallCfg(), col = lightWall(mix(r.color || '#b08250', T.hullDark, T.roomTint), WC);
  const dark = mix(col, '#000000', 0.25), mid = mix(col, '#000000', 0.12), cx = X((r.x0 + r.x1) / 2), ww = r.x1 - r.x0 - 4, skirt = mix(T.hullDark, '#000000', 1 - WC.SKIRT);
  const u0 = 30 + (hashOf(key) % 400);
  for (const [sink, s] of [[b.neg, -1], [b.pos, 1]]) {
    const zi = s * (W - 13.5);
    wallGrid(sink, s, cx - ww / 2, cx + ww / 2, Y(q.y) + h - 1, Y(q.y) + 1, zi - s * 1.5, rgbOf(col), WC, u0); // the panelling: shaded under the ceiling, in the corners and at the floor
    sink.box(mid, cx, Y(q.y - h * 0.4), zi - s * 1.6, ww, 4, 3.2, 0, 0, 0, 0, { tr: 'woodC' }); // chair rail
    sink.box(skirt, cx, Y(q.y - 8), zi - s * 2.1, ww, 16, 5, 0, 0, 0, 0, { tr: 'woodC' }); // skirting: a dark board along the foot of the wall, so the deck's edge reads
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
