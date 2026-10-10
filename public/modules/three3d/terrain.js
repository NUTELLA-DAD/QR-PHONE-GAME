// The map's rock in 3D: the same marching-squares outline the 2D game draws (courseArt.js, without its wobble), extruded into a slab. The camera sees the slab's
// front face with the tunnels as holes through it, and the tunnel floors and walls running back in perspective. Chunks of 12x12 squares are built as the ship
// comes near and dropped when she has gone by. Fixed to the world: nothing moves except by being built or removed.
import { THREE, PAL, INK, gradientMap, look } from './style.js';

const CH = 12; // squares per chunk side
export const Z_FRONT = 330, Z_BACK = -560;

const rockToon = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap, side: THREE.DoubleSide });
const rockPlain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });

const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

function buildChunk(map, ci, cj) {
  const C = map.CELL;
  const S = (i, j) => (j < 0 && map.open && i >= 0 && i < map.W ? 0 : i < 0 || j < 0 || i >= map.W || j >= map.H ? 1 : map.solid[j * map.W + i]);
  const corner = (i, j) => (S(i - 1, j - 1) + S(i, j - 1) + S(i - 1, j) + S(i, j)) / 4;
  const pos = [], nor = [], col = [], ink = [];
  const cFront = new THREE.Color(PAL.rock), cFloor = mixHex(PAL.rock, '#ffffff', 0.16), cCeil = mixHex(PAL.rock, '#2b2622', 0.35), cWall = mixHex(PAL.rock, '#2b2622', 0.12);
  const push3 = (a, b, c, n, color) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) [b, c] = [c, b]; // wind it so it faces the way its normal says
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); col.push(color.r, color.g, color.b); }
  };
  const i0 = ci * CH, j0 = cj * CH;
  let any = false;
  for (let j = j0; j < Math.min(map.H, j0 + CH); j++) {
    for (let i = i0; i < Math.min(map.W, i0 + CH); i++) {
      const v = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      const Pt = [[i * C, j * C], [(i + 1) * C, j * C], [(i + 1) * C, (j + 1) * C], [i * C, (j + 1) * C]];
      const inside = v.map((q) => q >= 0.5);
      if (!inside.some((q) => q)) continue;
      const poly = [], cross = [];
      if (inside.every((q) => q)) poly.push(...Pt);
      else {
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
      }
      if (poly.length < 3) continue;
      any = true;
      const P3 = poly.map(([x, y]) => [x, -y, Z_FRONT]);
      for (let k = 1; k + 1 < P3.length; k++) {
        let a = P3[0], b = P3[k], c = P3[k + 1];
        const cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (cz < 0) [b, c] = [c, b];
        push3(a, b, c, [0, 0, 1], cFront);
      }
      // the tunnel surfaces: a wall along each cut edge, from the front face back to the back
      const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      for (let k = 0; k + 1 < cross.length; k += 2) {
        const a = cross[k], b = cross[k + 1];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0]; // perpendicular in map coordinates (y down)
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; } // point away from the rock
        const n3 = [nx, -ny, 0];
        const color = n3[1] > 0.5 ? cFloor : n3[1] < -0.5 ? cCeil : cWall;
        const A = [a[0], -a[1], Z_FRONT], B = [b[0], -b[1], Z_FRONT], A2 = [a[0], -a[1], Z_BACK], B2 = [b[0], -b[1], Z_BACK];
        push3(A, B, B2, n3, color);
        push3(A, B2, A2, n3, color);
        // the ink line along the front edge: a thin ribbon in the front plane, centred on the cut, a little in front
        const w = 7, ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
        const ox = -uy * w, oy = ux * w;
        const q0 = [a[0] - ox, -(a[1] - oy), Z_FRONT + 1.2], q1 = [a[0] + ox, -(a[1] + oy), Z_FRONT + 1.2], q2 = [b[0] + ox, -(b[1] + oy), Z_FRONT + 1.2], q3 = [b[0] - ox, -(b[1] - oy), Z_FRONT + 1.2];
        for (const p of [q0, q1, q2, q0, q2, q3]) ink.push(p[0], p[1], p[2]);
      }
    }
  }
  if (!any) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(g, look.toon ? rockToon : rockPlain);
  mesh.userData.toon = rockToon;
  mesh.userData.plain = rockPlain;
  mesh.userData.shadowCaster = true;
  mesh.userData.shadowReceiver = true;
  mesh.castShadow = look.shadows;
  mesh.receiveShadow = look.shadows;
  grp.add(mesh);
  if (ink.length) {
    const ig = new THREE.BufferGeometry();
    ig.setAttribute('position', new THREE.Float32BufferAttribute(ink, 3));
    const im = new THREE.Mesh(ig, inkMat);
    im.userData.isOutline = true;
    im.visible = look.toon && look.outlines;
    grp.add(im);
  }
  return grp;
}

export function createTerrain(parent) {
  const group = new THREE.Group();
  parent.add(group);
  const chunks = new Map();
  let mapRef = null;
  const clear = () => {
    for (const c of chunks.values()) { group.remove(c.grp); c.grp.traverse((o) => o.geometry && o.geometry.dispose()); }
    chunks.clear();
  };
  return {
    group,
    count: () => chunks.size,
    // map = state.course.map (or null); (fx, fy) = the world point to build around (map coordinates)
    update(map, fx, fy, budget = 2) {
      if (map !== mapRef) { clear(); mapRef = map; }
      if (!map) return;
      const size = CH * map.CELL, ci0 = Math.floor(fx / size), cj0 = Math.floor(fy / size);
      const wanted = [];
      for (let dj = -2; dj <= 2; dj++) for (let di = -3; di <= 3; di++) {
        const ci = ci0 + di, cj = cj0 + dj;
        if (ci < 0 || cj < 0 || ci * CH >= map.W || cj * CH >= map.H) continue;
        wanted.push([ci, cj, Math.abs(di) + Math.abs(dj)]);
      }
      wanted.sort((a, b) => a[2] - b[2]);
      let built = 0;
      for (const [ci, cj] of wanted) {
        const key = ci + ',' + cj;
        if (chunks.has(key)) continue;
        if (built >= budget) break;
        const grp = buildChunk(map, ci, cj);
        chunks.set(key, { grp, ci, cj });
        if (grp) group.add(grp);
        built++;
      }
      for (const [key, c] of chunks) {
        if (Math.abs(c.ci - ci0) > 4 || Math.abs(c.cj - cj0) > 3) { if (c.grp) { group.remove(c.grp); c.grp.traverse((o) => o.geometry && o.geometry.dispose()); } chunks.delete(key); }
      }
    },
    clear,
  };
}
