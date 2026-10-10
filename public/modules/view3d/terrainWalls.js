// The rock's outline for the 3D view, with no Three.js in it (so a Node tool can use it too): one map square's marching-squares polygon and cut edges (makeCell, the same outline the 2D game draws and
// collides with), and the COLLISION walls of a chunk for the wreckage world (chunkWalls, physics.js). terrain.js draws the rock from the same cells.
export const CH = 12; // squares per chunk side

// (what the rock looks like at one square: its polygon and its cut edges)
export function makeCell(map, i, j) {
  const C = map.CELL;
  const S = (a, b) => (b < 0 && map.open && a >= 0 && a < map.W ? 0 : a < 0 || b < 0 || a >= map.W || b >= map.H ? 1 : map.solid[b * map.W + a]);
  const corner = (a, b) => (S(a - 1, b - 1) + S(a, b - 1) + S(a - 1, b) + S(a, b)) / 4;
  const v = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
  const Pt = [[i * C, j * C], [(i + 1) * C, j * C], [(i + 1) * C, (j + 1) * C], [i * C, (j + 1) * C]];
  const inside = v.map((q) => q >= 0.5);
  if (!inside.some((q) => q)) return { poly: null, segs: [], full: false };
  const poly = [], cross = [];
  if (inside.every((q) => q)) return { poly: Pt, segs: [], full: true };
  for (let k = 0; k < 4; k++) {
    const a = k, b = (k + 1) % 4;
    if (inside[a]) poly.push(Pt[a]);
    if (inside[a] !== inside[b]) {
      const t = (0.5 - v[a]) / (v[b] - v[a]);
      const p = [Pt[a][0] + (Pt[b][0] - Pt[a][0]) * t, Pt[a][1] + (Pt[b][1] - Pt[a][1]) * t];
      poly.push(p);
      cross.push(p);
    }
  }
  if (poly.length < 3) return { poly: null, segs: [], full: false };
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  const segs = [];
  for (let k = 0; k + 1 < cross.length; k += 2) {
    const pa = cross[k], pb = cross[k + 1];
    let nx = -(pb[1] - pa[1]), ny = pb[0] - pa[0]; // perpendicular in map coordinates (y down)
    const l = Math.hypot(nx, ny) || 1;
    nx /= l; ny /= l;
    if (nx * ((pa[0] + pb[0]) / 2 - cx) + ny * ((pa[1] + pb[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; } // point away from the rock
    segs.push({ ax: pa[0], ay: pa[1], bx: pb[0], by: pb[1], nx, ny, l });
  }
  return { poly, segs, full: false };
}

// The rock's COLLISION for the wreckage world (physics.js, WP5): the cut edges of the chunk's squares, the same marching-squares outline the 2D game collides with, as walls standing `zHalf` either
// side of the gameplay plane (the picture's rock has its own depth; the wreckage collides in the plane). 3D x = map x, 3D y = -map y. Returns { vertices, indices } for a Rapier trimesh, or null when the chunk has no edge.
export function chunkWalls(map, ci, cj, zHalf = 260) {
  const v = [], ix = [];
  for (let j = cj * CH; j < Math.min(map.H, (cj + 1) * CH); j++) {
    for (let i = ci * CH; i < Math.min(map.W, (ci + 1) * CH); i++) {
      for (const s of makeCell(map, i, j).segs) {
        const n = v.length / 3;
        v.push(s.ax, -s.ay, -zHalf, s.bx, -s.by, -zHalf, s.bx, -s.by, zHalf, s.ax, -s.ay, zHalf);
        ix.push(n, n + 1, n + 2, n, n + 2, n + 3, n, n + 2, n + 1, n, n + 3, n + 2); // (both ways round: Rapier's trimesh lets a fast body through from its back side)
      }
    }
  }
  return v.length ? { vertices: new Float32Array(v), indices: new Uint32Array(ix) } : null;
}
