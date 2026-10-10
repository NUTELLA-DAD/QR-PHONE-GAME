// The map's rock in 3D (WP3: no more cardboard). The same marching-squares outline the 2D game draws (courseArt.js, without its wobble) is the footprint of a slab. The camera sees the slab's front
// face with the tunnels as holes through it, and the tunnel floors, walls and ceilings running back in perspective. Chunks of 12x12 squares are built as the ship comes near and dropped when she
// has gone by. Fixed to the world: nothing moves except by being built or removed, and nothing here is animated.
//
// WHAT MAKES IT ROCK (all of it a STABLE hash of the world position, so a chunk looks the same whenever it is built and neighbouring chunks join without a crack):
//   - the front face is displaced in depth by two octaves of hashed value noise (lumps), only near the cut edges (it fades to a flat slab 200 px from them, where nobody looks);
//   - the lip of every cut edge is BEVELLED: the face rolls back into the tunnel (a pillowy edge that the toon steps catch) and the bevel width wanders with the hash;
//   - the edge outline in the x/y plane is never moved (the collision rock is exactly where the 2D game has it); only depth changes;
//   - three STRATA tones: the trim sheet's rock0..rock2 rows (modulators) are picked per fragment from a continuous strata coordinate, so the layers read as bands of different stone;
//   - mossy / snowy CAPS (config.LOOK3D.<env>.cap) on the edges that face up and on the tunnel floors, puffed up a little;
//   - an ink line along every cut edge (a ribbon that follows the displaced lip);
//   - the tunnel walls are lumpy faceted rock (rows in depth, offset by the hash), lit by the lamps (toon: the rock gradient has a real dark step, so a lamp behind the slab does not shine through it).
// Chunk build time is measured (terrain.stats): the budget is 4 ms.
import { THREE, PAL, INK, look, rimify, fx } from './style.js';
import { getTrimSheet, uvRect, ROCK_STRATA } from './textures.js';
import { config } from '../../config.js';

const CH = 12; // squares per chunk side
const NSUB = 3; // a square near a cut edge is built from NSUB x NSUB little squares
export const Z_FRONT_CAVE = 330, Z_BACK = -420; // caves: the rock slab stands in FRONT of the ship (tunnels are holes through it); the cave picture stands at the back (world.js)
export const Z_FRONT_OPEN = -70; // open sky: the rock stands just behind the ships and creatures, so nothing is ever hidden behind a cliff

// ---- materials ------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The rock's own toon gradient: four steps with a REAL dark one (0), so a light behind the slab (a cave's lamps stand behind its front face) does not leak through it.
const rockGradient = (() => {
  const d = new Uint8Array([0, 140, 205, 255]);
  const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();
const STRATA_VERT = `
  attribute vec2 aRockUv; attribute float aStrata; varying vec2 vRockUv; varying float vStrata;
`;
const STRATA_FRAG = `
  uniform sampler2D uTrim; uniform vec4 uRockRect[3]; uniform vec3 uFloor; varying vec2 vRockUv; varying float vStrata;
  vec3 rockTone( float row ) { vec4 r = uRockRect[ int( mod( row, 3.0 ) ) ]; return texture2D( uTrim, mix( r.xy, r.zw, vRockUv ) ).rgb; }
`;
// One toon material for all the rock: the thin warm rim (style.js rimify) plus the three strata rows blended by vStrata (hard-edged bands with a short soft seam).
const rockToon = rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rockGradient, side: THREE.DoubleSide }));
{
  const rim = rockToon.onBeforeCompile;
  rockToon.onBeforeCompile = (sh, r) => {
    rim(sh, r);
    const sheet = getTrimSheet();
    sh.uniforms.uTrim = { value: sheet.texture };
    sh.uniforms.uFloor = fx.uFloor;
    sh.uniforms.uRockRect = { value: ROCK_STRATA.map((n) => { const q = uvRect(n, 1.5); return new THREE.Vector4(q.u0, q.v0, q.u1, q.v1); }) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + STRATA_VERT).replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockUv = aRockUv; vStrata = aStrata;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + STRATA_FRAG)
      .replace('#include <map_fragment>', '#include <map_fragment>\n{ float f = fract( vStrata ); vec3 tone = mix( rockTone( floor( vStrata ) ), rockTone( floor( vStrata ) + 1.0 ), smoothstep( 0.36, 0.64, f ) ); diffuseColor.rgb *= mix( vec3( 1.0 ), tone * 2.0, 0.72 ); }')
      .replace('#include <opaque_fragment>', 'outgoingLight += uFloor * ( 0.4 + 0.6 * diffuseColor.rgb );\n#include <opaque_fragment>'); // (the dark-blue floor: in the dark the rock keeps a faint silhouette)
  };
  rockToon.customProgramCacheKey = () => 'toon-rim-rock';
}
const rockPlain = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });

// ---- the stable hash ------------------------------------------------------------------------------------------------------------------------------------------------------------
const h2 = (ix, iy) => { let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn(x, y) { // value noise 0..1 on the hashed integer lattice (smooth between lattice points)
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const sstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
const tri = (v) => { v %= 2; if (v < 0) v += 2; return v > 1 ? 2 - v : v; }; // a mirrored repeat (no seam at the fold)
const UW = 2048 * 3, UH = 128 * 3.2; // world units one pass of a strata row covers
const strataOf = (x, ym) => ym / 640 + (vn(x / 2600 + 3, ym / 2200) - 0.5) * 0.55 + 6; // (the layers wander gently with x: no patchwork)

// ---- the cells -------------------------------------------------------------------------------------------------------------------------------------------------------------------
// (what the rock looks like at one square: its polygon and its cut edges, the same marching squares as before)
function makeCell(map, i, j) {
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

// polygon clipping against an axis-aligned window (Sutherland-Hodgman), for the convex squares of the marching squares
function clipHalf(poly, nx, ny, c) {
  const out = [];
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const clipRect = (poly, x0, y0, x1, y1) => clipHalf(clipHalf(clipHalf(clipHalf(poly, 1, 0, x0), -1, 0, -x1), 0, 1, y0), 0, -1, -y1);

// ---- the chunk ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const _tc = new THREE.Color();
const style = { rock: new THREE.Color(PAL.rock), cap: new THREE.Color('#8fa65e'), capAmount: 0.9, floor: new THREE.Color(), ceil: new THREE.Color(), wall: new THREE.Color(), env: '' };
function setStyle(envId) {
  const E = (config.ENVIRONMENTS && config.ENVIRONMENTS[envId]) || {}, L3 = (config.LOOK3D && config.LOOK3D[envId]) || {};
  const rock = typeof E.rock === 'string' && E.rock[0] === '#' ? E.rock : PAL.rock;
  style.rock.set(mixHex(rock, '#ffffff', 0.12));
  const lum = 0.3 * style.rock.r + 0.59 * style.rock.g + 0.11 * style.rock.b;
  if (lum > 0.45) style.rock.multiplyScalar(0.82); // (pale rock - frost - is toned down so its snow caps still stand out)
  style.cap.set((L3.cap && L3.cap.color) || '#8fa65e');
  style.capAmount = L3.cap && L3.cap.amount != null ? L3.cap.amount : 0.9;
  style.floor.copy(style.rock).lerp(_tc.set('#ffffff'), 0.14);
  style.ceil.copy(style.rock).lerp(_tc.set('#2b2622'), 0.38);
  style.wall.copy(style.rock).lerp(_tc.set('#2b2622'), 0.14);
  style.env = envId;
}
setStyle('skyisles');

export const stats = { chunks: 0, lastMs: 0, maxMs: 0, totalMs: 0, tris: 0, slow: 0 };

function buildChunk(map, ci, cj) {
  const C = map.CELL;
  const Z0 = map.open ? Z_FRONT_OPEN : Z_FRONT_CAVE; // (this map's front face)
  const AMP = map.open ? 0.7 : 1; // (open sky: the rock stands close behind the ships, so its lumps are a little shallower)
  const REL_R = C; // the relief fades out this far from a cut edge
  // the squares of this chunk and a margin of 3 round it, made on demand and kept in a flat array (every lookup of the build goes through here)
  const MG = 3, WC = CH + 2 * MG, cellArr = new Array(WC * WC), nearArr = new Int8Array(WC * WC);
  const ib = ci * CH - MG, jb = cj * CH - MG;
  const cell = (i, j) => {
    const a = i - ib, b = j - jb;
    if (a < 0 || b < 0 || a >= WC || b >= WC) return makeCell(map, i, j); // (cannot happen for the points the build asks about)
    let c = cellArr[b * WC + a];
    if (!c) { c = makeCell(map, i, j); cellArr[b * WC + a] = c; }
    return c;
  };
  const near = (i, j) => { // any cut edge in the 3x3 squares round this one?
    const a = i - ib, b = j - jb, inR = a >= 0 && b >= 0 && a < WC && b < WC;
    if (inR && nearArr[b * WC + a]) return nearArr[b * WC + a] > 0;
    let r = false;
    for (let bb = -1; bb <= 1 && !r; bb++) for (let aa = -1; aa <= 1; aa++) if (cell(i + aa, j + bb).segs.length) { r = true; break; }
    if (inR) nearArr[b * WC + a] = r ? 1 : -1;
    return r;
  };

  // the nearest cut edge of a point: distance and the (smoothly blended) direction it faces, in E.*
  const E = { d: Infinity, nx: 0, ny: 0 };
  const dd = [], ds = [];
  const edge = (x, y) => {
    const ci0 = Math.floor(x / C), cj0 = Math.floor(y / C);
    let n = 0, dmin = Infinity;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const segs = cell(ci0 + a, cj0 + b).segs;
      for (let k = 0; k < segs.length; k++) {
        const s = segs[k], dx = s.bx - s.ax, dy = s.by - s.ay;
        let t = ((x - s.ax) * dx + (y - s.ay) * dy) / (s.l * s.l);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(s.ax + dx * t - x, s.ay + dy * t - y);
        dd[n] = d; ds[n] = s; n++;
        if (d < dmin) dmin = d;
      }
    }
    E.d = dmin;
    if (!n) { E.nx = 0; E.ny = 0; return; }
    let nx = 0, ny = 0;
    for (let k = 0; k < n; k++) { const w = Math.max(0, 1 - (dd[k] - dmin) / 36); nx += ds[k].nx * w; ny += ds[k].ny * w; }
    const l = Math.hypot(nx, ny) || 1;
    E.nx = nx / l; E.ny = ny / l;
  };
  // the depth offset of the front face at a point (relative to Z0), and how much cap there is there (0..1)
  let capOut = 0;
  const H = (x, y) => {
    edge(x, y);
    capOut = 0;
    const d = E.d;
    if (!(d < REL_R)) return 0;
    const f = 1 - d / REL_R, env = f * f * (3 - 2 * f);
    const lump = ((vn(x / 170, y / 170) - 0.5) * 2 * 46 + (vn(x / 66 + 11, y / 66 + 3) - 0.5) * 2 * 14) * AMP;
    const bw = 52 + 38 * vn(x / 120 + 5, y / 120 + 9);
    let bevel = 0;
    if (d < bw) { const t = 1 - d / bw; bevel = 82 * t * t; }
    const up = -E.ny, capW = 100 * (0.6 + 0.8 * vn(x / 90 + 2, y / 90 + 4));
    let cap = 0;
    if (up > 0.3 && d < capW) cap = sstep((up - 0.3) / 0.5) * (1 - d / capW);
    capOut = cap;
    return env * lump - bevel + 20 * cap;
  };

  // the vertices of the front face: depth, normal (from the depth's slope), colour, strata. Memoised by position, so the pieces that share a corner share its numbers.
  const vmemo = new Map();
  const base = style.rock, capC = style.cap;
  const vtx = (x, y) => {
    const key = Math.round(x * 16) * 1048583 + Math.round(y * 16);
    let v = vmemo.get(key);
    if (v) return v;
    const nearEdge = near(Math.floor(x / C), Math.floor(y / C));
    let z = 0, nx = 0, ny = 0, nz = 1, cap = 0, d = 1e9;
    if (nearEdge) {
      z = H(x, y); cap = capOut; d = E.d;
      const hx = (H(x + 10, y) - H(x - 10, y)) / 20, hy = (H(x, y + 10) - H(x, y - 10)) / 20;
      const l = Math.hypot(hx, hy, 1);
      nx = -hx / l; ny = hy / l; nz = 1 / l; // (map y runs down, 3D y up)
    }
    const tint = 0.9 + 0.16 * vn(x / 380 + 1, y / 380 + 2) + 0.06 * vn(x / 90, y / 90);
    const shade = (d < 90 ? 0.88 + 0.12 * sstep(d / 90) : 1) * (1 + 0.0034 * Math.max(-60, Math.min(60, z - 20 * cap))); // (the lumps are painted too: the hollows a little darker, the bumps a little lighter)
    const cm = Math.min(1, cap * 1.7) * style.capAmount;
    v = {
      z, nx, ny, nz,
      r: (base.r + (capC.r - base.r) * cm) * tint * shade, g: (base.g + (capC.g - base.g) * cm) * tint * shade, b: (base.b + (capC.b - base.b) * cm) * tint * shade,
      u: tri(x / UW), v: tri(y / UH), s: strataOf(x, y),
    };
    vmemo.set(key, v);
    return v;
  };

  const pos = [], nor = [], col = [], uvs = [], strata = [], ink = [];
  const pushVert = (x, ym, v) => { pos.push(x, -ym, Z0 + v.z); nor.push(v.nx, v.ny, v.nz); col.push(v.r, v.g, v.b); uvs.push(v.u, v.v); strata.push(v.s); };
  const front = (poly) => { // a convex polygon of the front face, as a fan
    const k = poly.length;
    if (k < 3) return;
    const vs = poly.map((p) => vtx(p[0], p[1]));
    for (let q = 1; q + 1 < k; q++) {
      const a = poly[0], b = poly[q], c = poly[q + 1];
      const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(area) < 1e-3) continue;
      if (area > 0) { pushVert(a[0], a[1], vs[0]); pushVert(c[0], c[1], vs[q + 1]); pushVert(b[0], b[1], vs[q]); } // (map y runs down: facing +z needs the other order)
      else { pushVert(a[0], a[1], vs[0]); pushVert(b[0], b[1], vs[q]); pushVert(c[0], c[1], vs[q + 1]); }
    }
  };
  // flat-shaded pieces (the walls): a triangle with its own normal, facing away from the rock (n3 = the way the cut faces)
  const flat = (a, b, c, n3, r, g, bl, uvf, sf) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-6) return;
    nx /= l; ny /= l; nz /= l;
    if (nx * n3[0] + ny * n3[1] + nz * n3[2] < 0) { nx = -nx; ny = -ny; nz = -nz; [b, c] = [c, b]; }
    // the wall shades as the PLANE it is (n3), not by each facet: a wall is seen edge-on, so any facet that tilted a little would flip the toon steps and the thin rim light (a mosaic of bright dashes); the lumps stay in the geometry
    nx = n3[0]; ny = n3[1]; nz = n3[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(r, g, bl); const uv = uvf(p); uvs.push(uv[0], uv[1]); strata.push(sf(p)); }
  };

  const i0 = ci * CH, j0 = cj * CH, s = C / NSUB, ROWS = 3;
  let any = false;
  const wallCol = new THREE.Color();
  for (let j = j0; j < Math.min(map.H, j0 + CH); j++) {
    for (let i = i0; i < Math.min(map.W, i0 + CH); i++) {
      const c = cell(i, j);
      if (!c.poly) continue;
      any = true;
      // ---- the front face
      if (!near(i, j)) front(c.poly);
      else {
        for (let sj = 0; sj < NSUB; sj++) for (let si = 0; si < NSUB; si++) {
          const x0 = i * C + si * s, y0 = j * C + sj * s;
          let piece;
          if (c.full) piece = [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
          else {
            piece = clipRect(c.poly, x0, y0, x0 + s, y0 + s);
            const clean = [];
            for (const p of piece) { const q = clean[clean.length - 1]; if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 1e-4) clean.push(p); }
            if (clean.length > 1) { const a = clean[0], b = clean[clean.length - 1]; if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 1e-4) clean.pop(); }
            piece = clean;
          }
          front(piece);
        }
      }
      // ---- the cut edges: the tunnel wall (lumpy rows from the lip back), and the ink line along the lip
      for (const sg of c.segs) {
        const { ax, ay, bx, by, nx, ny, l } = sg;
        const dx = bx - ax, dy = by - ay;
        const ts = [0, 1]; // where the edge crosses the little squares' lines: the pieces share the front face's vertices
        if (Math.abs(dx) > 1e-6) { const lo = Math.min(ax, bx), hi = Math.max(ax, bx); for (let k = Math.ceil(lo / s); k * s < hi; k++) { const t = (k * s - ax) / dx; if (t > 1e-4 && t < 1 - 1e-4) ts.push(t); } }
        if (Math.abs(dy) > 1e-6) { const lo = Math.min(ay, by), hi = Math.max(ay, by); for (let k = Math.ceil(lo / s); k * s < hi; k++) { const t = (k * s - ay) / dy; if (t > 1e-4 && t < 1 - 1e-4) ts.push(t); } }
        ts.sort((p, q) => p - q);
        const n3 = [nx, -ny, 0];
        const kind = n3[1] > 0.5 ? 0 : n3[1] < -0.5 ? 2 : 1; // floor, wall, ceiling
        const tone = kind === 0 ? style.floor : kind === 2 ? style.ceil : style.wall;
        const floorish = kind === 0 ? sstep((n3[1] - 0.5) / 0.4) : 0;
        const uvf = kind === 1 ? (p) => [tri(p[2] / UW), tri(-p[1] / UH)] : () => [0.42, 0.5]; // (walls: the strata run along them; floors and ceilings: one flat tone of the row, no pattern)
        const sf = (p) => strataOf(p[0], -p[1]);
        const ptAt = (t, r, zTop) => { // a point of the wall at fraction t along the edge, row r (0 = the lip .. ROWS = the back)
          const x = ax + dx * t, y = ay + dy * t;
          let off = 0;
          if (r > 0 && r < ROWS) off = (vn(x / 80 + r * 7.3, y / 80 + r * 3.1) - 0.5) * 2 * 12 * (4 * t * (1 - t));
          return [x + nx * off, -(y + ny * off), zTop + (Z_BACK - zTop) * (r / ROWS)];
        };
        for (let m = 0; m + 1 < ts.length; m++) {
          const t0 = ts[m], t1 = ts[m + 1];
          if (t1 - t0 < 1e-4) continue;
          const z0 = Z0 + vtx(ax + dx * t0, ay + dy * t0).z, z1 = Z0 + vtx(ax + dx * t1, ay + dy * t1).z;
          for (let r = 0; r < ROWS; r++) {
            const shade = 1 - 0.34 * ((r + 0.5) / ROWS);
            const cm = floorish * style.capAmount * 0.75;
            wallCol.setRGB((tone.r + (style.cap.r - tone.r) * cm) * shade, (tone.g + (style.cap.g - tone.g) * cm) * shade, (tone.b + (style.cap.b - tone.b) * cm) * shade);
            const A = ptAt(t0, r, z0), B = ptAt(t1, r, z1), A2 = ptAt(t0, r + 1, z0), B2 = ptAt(t1, r + 1, z1);
            flat(A, B, B2, n3, wallCol.r, wallCol.g, wallCol.b, uvf, sf);
            flat(A, B2, A2, n3, wallCol.r, wallCol.g, wallCol.b, uvf, sf);
          }
          // the ink: a ribbon on the lip, 12 units wide, going inward (into the rock)
          const w = 12, pa = [ax + dx * t0, ay + dy * t0], pb = [ax + dx * t1, ay + dy * t1];
          const qa = [pa[0] - nx * w, pa[1] - ny * w], qb = [pb[0] - nx * w, pb[1] - ny * w];
          const za = z0 + 1.1, zb = z1 + 1.1, zqa = Z0 + vtx(qa[0], qa[1]).z + 1.1, zqb = Z0 + vtx(qb[0], qb[1]).z + 1.1;
          const P = [[pa[0], -pa[1], za], [pb[0], -pb[1], zb], [qb[0], -qb[1], zqb], [qa[0], -qa[1], zqa]];
          for (const q of [P[0], P[1], P[2], P[0], P[2], P[3]]) ink.push(q[0], q[1], q[2]);
        }
      }
    }
  }
  if (!any || !pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRockUv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aStrata', new THREE.Float32BufferAttribute(strata, 1));
  g.computeBoundingSphere();
  const grp = new THREE.Group();
  const mesh = new THREE.Mesh(g, look.toon ? rockToon : rockPlain);
  mesh.userData.toon = rockToon;
  mesh.userData.plain = rockPlain;
  mesh.userData.shadowCaster = !map.open; // (open sky: the rock stands behind the ships and its shadow pass cost most of the frame's triangles; only a cave's rock, which stands in front, shades the ship)
  mesh.userData.shadowReceiver = true;
  mesh.castShadow = look.shadows && !map.open;
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
  grp.userData.tris = (pos.length + ink.length) / 9;
  return grp;
}

export function createTerrain(parent) {
  const group = new THREE.Group();
  parent.add(group);
  const chunks = new Map();
  let mapRef = null;
  const drop = (c) => { if (c.grp) { group.remove(c.grp); c.grp.traverse((o) => o.geometry && o.geometry.dispose()); } };
  const clear = () => { for (const c of chunks.values()) drop(c); chunks.clear(); };
  const T = {
    group,
    stats,
    count: () => chunks.size,
    // the environment's rock colours and caps (call when the environment changes; the chunks are rebuilt)
    setEnv(envId) { if (style.env !== envId) { setStyle(envId); clear(); } },
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
        const t0 = performance.now();
        let grp = null;
        try { grp = buildChunk(map, ci, cj); } catch (e) { console.warn('terrain chunk', e); } // (never throw from drawing code: a missing chunk is better than a frozen TV)
        const ms = performance.now() - t0;
        stats.chunks++; stats.lastMs = ms; stats.totalMs += ms; if (ms > stats.maxMs) stats.maxMs = ms; if (ms > 4) stats.slow++;
        if (grp) stats.tris += grp.userData.tris || 0;
        chunks.set(key, { grp, ci, cj });
        if (grp) group.add(grp);
        built++;
      }
      for (const [key, c] of chunks) {
        if (Math.abs(c.ci - ci0) > 4 || Math.abs(c.cj - cj0) > 3) { drop(c); chunks.delete(key); }
      }
    },
    clear,
  };
  return T;
}
