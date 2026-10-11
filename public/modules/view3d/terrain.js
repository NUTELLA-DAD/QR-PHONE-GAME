// The map's rock in 3D (WP3: no more cardboard). The same marching-squares outline the 2D game draws (courseArt.js, without its wobble) is the footprint of a slab. The camera sees the slab's front
// face with the tunnels as holes through it, and the tunnel floors, walls and ceilings running back in perspective. Chunks of 12x12 squares are built as the ship comes near and dropped when she
// has gone by. Fixed to the world: nothing moves except by being built or removed, and nothing here is animated.
//
// WHAT MAKES IT ROCK (all of it a STABLE hash of the world position, so a chunk looks the same whenever it is built and neighbouring chunks join without a crack):
//   - the front face is displaced in depth by two octaves of hashed value noise (lumps), only near the cut edges (it fades to a flat slab 200 px from them, where nobody looks);
//   - the lip of every cut edge is BEVELLED: the face rolls back into the tunnel (a pillowy edge that the toon steps catch) and the bevel width wanders with the hash;
//   - the edge outline in the x/y plane stays where the collision rock is (the 2D game's) except for the A7 bites, which only ever go inward and at most CHIP units; the rest is depth;
//   - the trim sheet's rock0..rock2 rows are fine laminations, cracks and pits, laid over the beds the shader paints from the world position (see rockLook);
//   - mossy / snowy CAPS (config.LOOK3D.<env>.cap) on the edges that face up and on the tunnel floors, puffed up a little;
//   - an ink line along every cut edge (a ribbon that follows the displaced lip);
//   - the tunnel walls are lumpy faceted rock (rows in depth, offset by the hash), lit by the lamps (toon: the rock gradient has a real dark step, so a lamp behind the slab does not shine through it).
// A7 ROCK V2 (3D.md section 25) changed what the surface is painted from: the fragment's world position (rockLook below: ragged beds, faults, joints, patches, a shadow side, a hard-edged cap with an overhang band),
// the lip is BITTEN inward by a stable hash (<= config.LOOK3D.ROCK.CHIP units; the collision is untouched) and its edge is split every 24 units so the bites are small chips, and ONE instanced mesh of painted plants
// stands along the upward lips (fringe.js). The cut edges' normals come out of terrainWalls.js makeCell, which now orients them by the corner field (a cut lying on a cell's edge used to be a coin toss).
// Chunk build time is measured (terrain.stats): the budget is 4 ms.
import { THREE, PAL, INK, look, rimify, fx, INK_GLSL, inkUniforms } from './style.js';
import { getTrimSheet, uvRect, ROCK_STRATA } from './textures.js';
import { config } from '../../config.js';
import { CH, makeCell, chunkWalls } from './terrainWalls.js';
import { createFringe } from './fringe.js';
export { chunkWalls };

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
// A7 ROCK V2: everything the rock's surface is painted from is the fragment's WORLD POSITION (a varying), so it is fixed to the world and no triangle's interpolation can break it (the old vertex UVs folded inside
// big triangles and left visible rectangles). `aRock` = (d, nx, ny, cap) per vertex: d = the distance to the nearest cut edge (clamped; -1 marks a tunnel wall, -2 a floor / ceiling), (nx, ny) = that edge's outward
// normal in world axes (x right, y up), cap = how much cap there is (0..1). The shader lays, from the world position alone:
//   - RAGGED BEDS: the bed number is a warped, irregular function of height (thin and thick beds, pinch-outs), a tone and a hue per bed (hashed), a dark seam on the top of each bed, a bed darker toward its lower edge,
//     vertical joints in about two thirds of the beds, TWO FAMILIES OF DIAGONAL FAULTS where the beds step up or down (with a dark crack along the fault), hashed lighter / darker patches; and the trim sheet's
//     painted rock rows (fine laminations, cracks, pits) at half strength on top;
//   - the SHADOW SIDE: an edge whose normal faces away from the key light (fx.uRimDir) gets a darker, cooler band SHADE_W wide with a ragged inner edge, an edge that faces the light a thin bright band;
//   - the CAP (moss, snow) with a hard ragged lower edge, a dark band under it (the overhang's shadow) and a darker rim along its lowest part.
const STRATA_VERT = `
  attribute vec4 aRock; varying vec4 vRock; varying vec2 vWP;
`;
const STRATA_FRAG = `
  uniform sampler2D uTrim; uniform sampler2D uNz; uniform vec4 uRockRect[3]; uniform vec3 uFloor; uniform vec3 uRockDir; uniform vec3 uCapCol; uniform vec3 uShadeMul; uniform vec4 uRockK; varying vec4 vRock; varying vec2 vWP;
  float rkH( vec2 p ) { vec3 q = fract( vec3( p.xyx ) * 0.1031 ); q += dot( q, q.yzx + 33.33 ); return fract( ( q.x + q.y ) * q.z ); }
  float rkN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return texture2D( uNz, ( i + f + 0.5 ) * 0.00390625 ).r; } // (value noise from a 256 x 256 table: one tap, smoothed weights)
  float rkTri( float v ) { v = mod( v, 2.0 ); return v > 1.0 ? 2.0 - v : v; }
  vec3 rockTone( float row, vec2 uv ) { vec4 r = uRockRect[ int( mod( row, 3.0 ) ) ]; return texture2D( uTrim, mix( r.xy, r.zw, uv ) ).rgb; }
  // a family of parallel faults: f = the distance across them (they sit at jittered spacing W); returns the bed shift of the block the point is in (-1..1) and the distance to the nearest fault line (3 hashes)
  float rkFault( float f, float W, float seed, out float dist ) {
    float u = f / W, k = floor( u + 0.5 );
    float h0 = rkH( vec2( k, seed ) ), hm = rkH( vec2( k - 1.0, seed ) ), hp = rkH( vec2( k + 1.0, seed ) );
    float bk = k + 0.8 * ( h0 - 0.5 );
    bool right = u >= bk;
    float b0 = right ? bk : k - 1.0 + 0.8 * ( hm - 0.5 ), b1 = right ? k + 1.0 + 0.8 * ( hp - 0.5 ) : bk;
    dist = min( u - b0, b1 - u ) * W;
    return ( fract( ( right ? h0 : hm ) * 37.1 ) - 0.5 ) * 2.0;
  }
  vec3 rockLook( vec3 base ) {
    vec2 wp = vWP; float ym = - wp.y;
    float isFlat = step( vRock.x, -1.5 ), isFace = step( -0.5, vRock.x ); // (no branches on these: every derivative below runs for every fragment, so the shader compiles flat)
    float c1;
    float yb = ym + rkFault( dot( wp, vec2( 0.906, 0.423 ) ), 2600.0, 3.0, c1 ) * 130.0 + ( rkN( vec2( wp.x / 900.0, ym / 1500.0 ) ) - 0.5 ) * 70.0;
    float bed = max( 30.0, uRockK.x );
    float g = yb / bed + 1.3 * rkN( vec2( 0.7, yb / ( bed * 3.1 ) ) ) + 0.8 * rkN( vec2( 2.3, yb / ( bed * 0.86 ) + 11.0 ) );
    float bid = floor( g ), bf = fract( g ), fw = max( fwidth( g ), 0.0005 );
    float ha = rkH( vec2( bid, 5.0 ) ), hb = rkH( vec2( bid, 8.0 ) );
    vec3 bt = mix( vec3( 0.86 ), vec3( 1.16 ), floor( ha * 5.0 ) / 4.0 ) * mix( vec3( 1.05, 0.98, 0.90 ), vec3( 0.94, 0.99, 1.06 ), hb );
    float line = 1.0 - smoothstep( fw * 0.8, fw * 2.4 + 0.012, bf );
    bt *= ( 1.0 - 0.10 * bf ) * ( 1.0 - 0.28 * line );
    float jq = ( wp.x + 211.0 * fract( hb * 3.9 ) ) / ( 220.0 + 200.0 * fract( hb * 13.7 ) );
    float joint = step( 0.72, fract( ha * 29.3 ) ) * ( 1.0 - smoothstep( 0.0, 0.012 + fwidth( jq ) * 1.2, 0.5 - abs( fract( jq ) - 0.5 ) ) ) * ( 1.0 - line );
    float crack = ( 1.0 - smoothstep( 1.0, 3.0 + fw * bed, c1 ) ) * smoothstep( 0.42, 0.5, rkN( wp / 420.0 + 7.0 ) ); // (a thin line that comes and goes: long stretches with gaps)
    float pn = rkN( wp * vec2( 1.0 / 230.0, 1.0 / 120.0 ) + 4.1 );
    bt *= ( 1.0 - 0.16 * joint ) * ( 1.0 - 0.30 * crack ) * ( 1.0 + 0.10 * smoothstep( 0.66, 0.68, pn ) - 0.13 * ( 1.0 - smoothstep( 0.22, 0.24, pn ) ) );
    float srow = ym / 640.0 + ( rkN( vec2( wp.x / 2600.0 + 3.0, ym / 2200.0 ) ) - 0.5 ) * 0.55 + 6.0;
    vec2 tuv = vec2( rkTri( wp.x / 6144.0 ), rkTri( ym / 409.6 ) );
    vec3 tone = mix( rockTone( floor( srow ), tuv ), rockTone( floor( srow ) + 1.0, tuv ), smoothstep( 0.36, 0.64, fract( srow ) ) );
    vec3 col = base * mix( vec3( 1.0 ), tone * 2.0, 0.5 ) * bt;
    { // the front face: the edge shading (weighted by isFace)
      float nl = length( vRock.yz );
      float side = nl > 0.05 ? dot( vRock.yz / nl, normalize( uRockDir.xy + vec2( 0.0001 ) ) ) : 0.0; // + faces the light, - faces away
      float dd = vRock.x + ( rkN( wp / 40.0 ) - 0.5 ) * 50.0, fwd = max( fwidth( dd ), 0.5 );
      float shadowSide = isFace * ( 1.0 - smoothstep( -0.38, -0.08, side ) ) * ( 1.0 - smoothstep( uRockK.y - fwd, uRockK.y + fwd, dd ) );
      col *= mix( vec3( 1.0 ), uShadeMul, shadowSide ) * ( 1.0 + 0.14 * isFace * smoothstep( 0.2, 0.55, side ) * ( 1.0 - smoothstep( 20.0 - fwd, 34.0 + fwd, dd ) ) );
      float cn = ( rkN( wp / 26.0 + 1.3 ) - 0.5 ) * 0.36, fc = max( fwidth( vRock.w ), 0.004 );
      float capM = isFace * smoothstep( 0.30 + cn - fc, 0.30 + cn + fc, vRock.w );
      col *= 1.0 - 0.26 * isFace * smoothstep( 0.15 + cn - fc, 0.15 + cn + fc, vRock.w ) * ( 1.0 - capM );
      vec3 capC = uCapCol * ( 1.0 - 0.20 * ( 1.0 - smoothstep( 0.30 + cn + fc, 0.40 + cn + fc, vRock.w ) ) );
      col = mix( col, capC, capM * uRockK.w );
    }
    return mix( col, base * ( 0.94 + 0.12 * rkN( wp / 90.0 ) ), isFlat ); // (a tunnel's floor and ceiling: one flat tone with a little mottling)
  }
`;
// the shared uniform objects (setStyle changes their values when the environment changes: no recompile)
const RU = { uCapCol: { value: new THREE.Color('#8fa65e') }, uShadeMul: { value: new THREE.Vector3(0.46, 0.5, 0.58) }, uRockK: { value: new THREE.Vector4(96, 150, 0.58, 0.9) } };
// One toon material for all the rock: the thin warm rim (style.js rimify) plus the world-position painting above.
const rockToon = rimify(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: rockGradient, side: THREE.DoubleSide }));
{
  const rim = rockToon.onBeforeCompile;
  rockToon.onBeforeCompile = (sh, r) => {
    rim(sh, r);
    const sheet = getTrimSheet();
    sh.uniforms.uTrim = { value: sheet.texture }; sh.uniforms.uNz = { value: noiseTable() };
    sh.uniforms.uFloor = fx.uFloor;
    sh.uniforms.uRockDir = fx.uRimDir; sh.uniforms.uCapCol = RU.uCapCol; sh.uniforms.uShadeMul = RU.uShadeMul; sh.uniforms.uRockK = RU.uRockK;
    sh.uniforms.uRockRect = { value: ROCK_STRATA.map((n) => { const q = uvRect(n, 3); return new THREE.Vector4(q.u0, q.v0, q.u1, q.v1); }) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + STRATA_VERT).replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock; vWP = position.xy;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + STRATA_FRAG)
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = rockLook( diffuseColor.rgb );')
      .replace('#include <opaque_fragment>', 'outgoingLight += uFloor * ( 0.4 + 0.6 * diffuseColor.rgb );\n{ vec3 fN = normalize( normal ); float fE = 1.0 - saturate( dot( fN, normalize( vViewPosition ) ) ); outgoingLight += uFloor * 1.8 * smoothstep( 0.4, 0.85, fE ); } // (WP15: and a cool rim where the rock turns edge-on, so an unlit cave still has a readable outline)\n#include <opaque_fragment>'); // (the dark-blue floor: in the dark the rock keeps a faint silhouette)
  };
  rockToon.customProgramCacheKey = () => 'toon-rim-rock';
}
const rockPlain = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
// A1: the ink ribbon along a lip is screen-constant like every other outline: its inner vertices carry the inward offset in `onormal` (config.LOOK3D.INK.TERRAIN world units at the reference zoom), style.js inkPush widens it.
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });
inkMat.onBeforeCompile = (sh) => {
  inkUniforms(sh);
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 onormal;\n' + INK_GLSL).replace('#include <begin_vertex>', 'vec3 transformed = position + inkPush( onormal );');
};
inkMat.customProgramCacheKey = () => 'ink-lip';
const LIP_W = () => Math.max(2, Number(config.LOOK3D && config.LOOK3D.INK && config.LOOK3D.INK.TERRAIN) || 9);
const rock3d = () => (config.LOOK3D && config.LOOK3D.ROCK) || {}; // (A7: the rock's numbers, config.LOOK3D.ROCK)

// ---- the stable hash ------------------------------------------------------------------------------------------------------------------------------------------------------------
const h2 = (ix, iy) => { let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn(x, y) { // value noise 0..1 on the hashed integer lattice (smooth between lattice points)
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
let _nz = null;
function noiseTable() { // the rock shader's value noise: a 256 x 256 table of hashed bytes (static, built once), sampled with smoothed weights (rkN in STRATA_FRAG)
  if (_nz) return _nz;
  const N = 256, d = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) d[y * N + x] = Math.min(255, Math.floor(h2(x + 17, y + 91) * 256));
  _nz = new THREE.DataTexture(d, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  _nz.wrapS = _nz.wrapT = THREE.RepeatWrapping;
  _nz.magFilter = _nz.minFilter = THREE.LinearFilter;
  _nz.generateMipmaps = false;
  _nz.needsUpdate = true;
  return _nz;
}
const sstep = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// ---- the cells: makeCell (a square's polygon and cut edges, the marching squares) lives in terrainWalls.js, which the wreckage world's collision shares ----

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
  // A7: the numbers the rock shader reads (config.LOOK3D.ROCK): the bed thickness, the shadow side's width and brightness (cooled toward SHADE_TINT) and the cap colour / amount
  const R3 = rock3d(), shade = Math.max(0.2, Math.min(1, Number(R3.SHADE) || 0.58)), tint = new THREE.Color(R3.SHADE_TINT || '#9aa6c8'), tm = Math.max(tint.r, tint.g, tint.b, 1e-4);
  RU.uCapCol.value.copy(style.cap);
  RU.uRockK.value.set(Math.max(30, Number(R3.BED) || 96), Math.max(20, Number(R3.SHADE_W) || 150), shade, style.capAmount);
  RU.uShadeMul.value.set(shade * (1 + (tint.r / tm - 1) * 0.45), shade * (1 + (tint.g / tm - 1) * 0.45), shade * (1 + (tint.b / tm - 1) * 0.45));
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

  // A7 THE BROKEN LIP: how far the picture's lip is bitten inward at a point ON a cut edge (a stable hash of the position, 0..CHIP map units, never outward). The face, the tunnel wall and the ink ribbon all
  // ask for the same point and get the same bite, so they stay joined. The sim's collision (chunkWalls, the 2D game) is the unbitten line, and a bite is at most CHIP (15) units deep.
  const CHIP = Math.max(0, Math.min(40, Number(rock3d().CHIP == null ? 15 : rock3d().CHIP)));
  const shiftMemo = new Map();
  const lipShift = (x, y) => {
    const key = Math.round(x * 16) * 1048583 + Math.round(y * 16);
    let sft = shiftMemo.get(key);
    if (sft) return sft;
    edge(x, y);
    let amt = 0;
    if (CHIP > 0 && E.d < 0.5) { const q = vn(x / 44 + 7.7, y / 44 + 1.9) * 0.7 + vn(x / 16 + 2.1, y / 16 + 8.3) * 0.3; amt = q < 0.48 ? 0 : Math.min(1, (q - 0.48) / 0.24) * CHIP; }
    sft = [-E.nx * amt, -E.ny * amt];
    shiftMemo.set(key, sft);
    return sft;
  };

  // the vertices of the front face: depth, normal (from the depth's slope), colour, the shader's `aRock` numbers, the bitten position. Memoised by position, so the pieces that share a corner share its numbers.
  const vmemo = new Map();
  const base = style.rock;
  const vtx = (x, y) => {
    const key = Math.round(x * 16) * 1048583 + Math.round(y * 16);
    let v = vmemo.get(key);
    if (v) return v;
    const nearEdge = near(Math.floor(x / C), Math.floor(y / C));
    let z = 0, nx = 0, ny = 0, nz = 1, cap = 0, d = 400, ex = 0, ey = 0;
    if (nearEdge) {
      z = H(x, y); cap = capOut; d = Math.min(E.d, 400); ex = E.nx; ey = -E.ny; // (the nearest edge's outward normal in 3D axes: y up)
      const hx = (H(x + 10, y) - H(x - 10, y)) / 20, hy = (H(x, y + 10) - H(x, y - 10)) / 20;
      const l = Math.hypot(hx, hy, 1);
      nx = -hx / l; ny = hy / l; nz = 1 / l; // (map y runs down, 3D y up)
    }
    let px = x, py = y;
    if (d < 0.5) { const sft = lipShift(x, y); px = x + sft[0]; py = y + sft[1]; }
    const tint = 0.9 + 0.16 * vn(x / 380 + 1, y / 380 + 2) + 0.06 * vn(x / 90, y / 90);
    const shade = (d < 90 ? 0.88 + 0.12 * sstep(d / 90) : 1) * (1 + 0.0034 * Math.max(-60, Math.min(60, z - 20 * cap))); // (the lumps are painted too: the hollows a little darker, the bumps a little lighter)
    v = { z, nx, ny, nz, r: base.r * tint * shade, g: base.g * tint * shade, b: base.b * tint * shade, d, ex, ey, cap, px, py }; // (the cap's colour is the shader's: hard-edged, see rockLook)
    vmemo.set(key, v);
    return v;
  };

  const pos = [], nor = [], col = [], rock = [], ink = [], inkN = [], plants = [];
  const pushVert = (x, ym, v) => { pos.push(v.px, -v.py, Z0 + v.z); nor.push(v.nx, v.ny, v.nz); col.push(v.r, v.g, v.b); rock.push(v.d, v.ex, v.ey, v.cap); };
  // a polygon's lip edges get extra points (one every 24 units or so), so the bites are small chips and not one long dent; the wall and the ink below split the same intervals the same way
  const lipSplits = (len) => Math.max(1, Math.ceil(Math.round(len * 100) / 100 / 24));
  const subdivide = (poly) => {
    const out = [], n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      out.push(p);
      if (vtx(p[0], p[1]).d > 0.5 || vtx(q[0], q[1]).d > 0.5) continue;
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < 26) continue;
      edge((p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      if (E.d > 0.5) continue;
      const kk = lipSplits(len);
      for (let k = 1; k < kk; k++) out.push([p[0] + (q[0] - p[0]) * k / kk, p[1] + (q[1] - p[1]) * k / kk]);
    }
    return out;
  };
  const front = (poly0, lip) => { // a convex polygon of the front face, as a fan
    const poly = lip ? subdivide(poly0) : poly0;
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
  const flat = (a, b, c, n3, r, g, bl, kflag) => {
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
    for (const p of [a, b, c]) { pos.push(p[0], p[1], p[2]); nor.push(nx, ny, nz); col.push(r, g, bl); rock.push(kflag, 0, 0, 0); } // (kflag: -1 a tunnel wall, -2 a floor or ceiling: see rockLook)
  };

  const FR = rock3d().FRINGE || {}, envScale = Math.max(0.3, Math.min(3, Number((FR[style.env] || {}).scale) || 1)), FRN = { // (A7: how many plants along the upward lips; zero in a cave unless FRINGE.CAVE says so)
    on: !!FR.ON && look.fringe !== false, spacing: Math.max(30, Number(FR.SPACING) || 84), cap: 400,
    chance: Math.max(0, Number(FR.CHANCE) || 0.6) * (map.open ? 1 : Math.max(0, Number(FR.CAVE == null ? 0.35 : FR.CAVE))),
    size0: (Array.isArray(FR.SIZE) ? Number(FR.SIZE[0]) || 84 : 84) * envScale, size1: (Array.isArray(FR.SIZE) ? Number(FR.SIZE[1]) || 150 : 150) * envScale,
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
      if (!near(i, j)) front(c.poly, false);
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
          front(piece, c.segs.length > 0);
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
        const kflag = kind === 1 ? -1 : -2; // (the shader: a wall gets the beds, a floor or ceiling one flat tone)
        const ptAt = (t, r, zTop) => { // a point of the wall at fraction t along the edge, row r (0 = the lip .. ROWS = the back); the bitten lip slides the whole wall in with it
          const x = ax + dx * t, y = ay + dy * t, sft = lipShift(x, y);
          let off = 0;
          if (r > 0 && r < ROWS) off = (vn(x / 80 + r * 7.3, y / 80 + r * 3.1) - 0.5) * 2 * 12 * (4 * t * (1 - t));
          return [x + sft[0] + nx * off, -(y + sft[1] + ny * off), zTop + (Z_BACK - zTop) * (r / ROWS)];
        };
        for (let m = 0; m + 1 < ts.length; m++) {
          const tA = ts[m], tB = ts[m + 1];
          if (tB - tA < 1e-4) continue;
          const kk = lipSplits(l * (tB - tA)); // (the same split as the face's lip chain)
          for (let u = 0; u < kk; u++) {
            const t0 = tA + (tB - tA) * u / kk, t1 = tA + (tB - tA) * (u + 1) / kk;
            const z0 = Z0 + vtx(ax + dx * t0, ay + dy * t0).z, z1 = Z0 + vtx(ax + dx * t1, ay + dy * t1).z;
            for (let r = 0; r < ROWS; r++) {
              const shade = 1 - 0.34 * ((r + 0.5) / ROWS);
              const cm = floorish * style.capAmount * 0.75;
              wallCol.setRGB((tone.r + (style.cap.r - tone.r) * cm) * shade, (tone.g + (style.cap.g - tone.g) * cm) * shade, (tone.b + (style.cap.b - tone.b) * cm) * shade);
              const A = ptAt(t0, r, z0), B = ptAt(t1, r, z1), A2 = ptAt(t0, r + 1, z0), B2 = ptAt(t1, r + 1, z1);
              flat(A, B, B2, n3, wallCol.r, wallCol.g, wallCol.b, kflag);
              flat(A, B2, A2, n3, wallCol.r, wallCol.g, wallCol.b, kflag);
            }
            // the ink: a ribbon on the (bitten) lip, LIP_W units wide at the reference zoom (A1: screen-constant, see inkMat), going inward (into the rock). The inner vertices sit on the lip in x / y and carry the inward offset in `onormal`.
            const w = LIP_W(), s0 = lipShift(ax + dx * t0, ay + dy * t0), s1 = lipShift(ax + dx * t1, ay + dy * t1);
            const pa = [ax + dx * t0 + s0[0], ay + dy * t0 + s0[1]], pb = [ax + dx * t1 + s1[0], ay + dy * t1 + s1[1]];
            const qa = [pa[0] - nx * w, pa[1] - ny * w], qb = [pb[0] - nx * w, pb[1] - ny * w];
            const za = z0 + 1.1, zb = z1 + 1.1, zqa = Z0 + vtx(qa[0], qa[1]).z + 1.1, zqb = Z0 + vtx(qb[0], qb[1]).z + 1.1;
            const ox = -nx * w, oy = ny * w; // (the inward offset in 3D: map y runs down)
            const P = [[pa[0], -pa[1], za, 0, 0], [pb[0], -pb[1], zb, 0, 0], [pb[0], -pb[1], zqb, ox, oy], [pa[0], -pa[1], zqa, ox, oy]];
            for (const q of [P[0], P[1], P[2], P[0], P[2], P[3]]) { ink.push(q[0], q[1], q[2]); inkN.push(q[3], q[4], 0); }
          }
        }
        // ---- the FRINGE: plants stand along an upward lip (fringe.js). Where they stand is a stable hash of the segment's own position, so a chunk always grows the same plants.
        if (kind === 0 && FRN.on && plants.length < FRN.cap * 7) {
          const nSite = Math.floor(l * FRN.chance / FRN.spacing + h2(Math.round(ax) + 3, Math.round(ay) + 11));
          for (let k = 0; k < nSite; k++) {
            const hk = (a2, b2) => h2(Math.round(ax) * 37 + k * 11 + a2, Math.round(ay) * 53 + b2);
            const u = (k + 0.12 + 0.76 * hk(1, 2)) / nSite, px = ax + dx * u, py = ay + dy * u, v = vtx(px, py);
            const size = FRN.size0 + (FRN.size1 - FRN.size0) * hk(3, 4);
            plants.push(v.px, -v.py, map.open ? Z0 + v.z + 6 : -50, size, Math.min(3, Math.floor(hk(5, 6) * 4)), hk(7, 8) < 0.5 ? -1 : 1, hk(9, 10)); // (x, y, z, size, variant, flip, seed)
          }
        }
      }
    }
  }
  if (!any || !pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRock', new THREE.Float32BufferAttribute(rock, 4));
  g.computeBoundingSphere();
  const grp = new THREE.Group();
  grp.userData.plants = plants.length ? new Float32Array(plants) : null; // (the fringe's plants of this chunk, see createTerrain)
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
    ig.setAttribute('onormal', new THREE.Float32BufferAttribute(inkN, 3));
    ig.computeBoundingSphere();
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
  const fringe = createFringe(parent); // (A7: one instanced mesh for the plants of every chunk; it lives beside the chunk group, not in it, so nothing that walks the chunks meets it)
  fringe.setEnv(style.env);
  const drop = (c, key) => { if (c.grp) { group.remove(c.grp); c.grp.traverse((o) => o.geometry && o.geometry.dispose()); } fringe.set(key, null); };
  const clear = () => { for (const [key, c] of chunks) { drop(c, key); if (T.onChunk) T.onChunk('remove', key); } chunks.clear(); fringe.commit(); };
  const T = {
    group,
    stats,
    fringe,
    // the wind for the plants (index.js, once a frame): gale 0..1, the clock, the direction (+1 / -1)
    setWind: (gale, t, dir) => fringe.setWind(gale, t, dir),
    count: () => chunks.size,
    // WP5: the wreckage world listens to the chunks coming and going: onChunk(op, key, map, ci, cj) with op 'add' | 'remove'. chunkList() = the chunks standing now (for a listener that starts late).
    onChunk: null,
    chunkList: () => [...chunks].map(([key, c]) => ({ key, ci: c.ci, cj: c.cj, map: mapRef })),
    // the environment's rock colours and caps (call when the environment changes; the chunks are rebuilt)
    setEnv(envId) { if (style.env !== envId) { setStyle(envId); clear(); fringe.setEnv(envId); } },
    // map = state.course.map (or null); (fx, fy) = the world point to build around (map coordinates)
    update(map, fx, fy, budget = 2, extra = null) { // extra = [{ x, y }] more places to build round (the portholes: the spyglass looking far ahead)
      if (map !== mapRef) { clear(); mapRef = map; }
      if (!map) { fringe.show(false); return; }
      const size = CH * map.CELL, ci0 = Math.floor(fx / size), cj0 = Math.floor(fy / size);
      const wanted = [];
      for (let dj = -2; dj <= 2; dj++) for (let di = -3; di <= 3; di++) {
        const ci = ci0 + di, cj = cj0 + dj;
        if (ci < 0 || cj < 0 || ci * CH >= map.W || cj * CH >= map.H) continue;
        wanted.push([ci, cj, Math.abs(di) + Math.abs(dj)]);
      }
      wanted.sort((a, b) => a[2] - b[2]);
      const foci = [];
      if (extra) for (const e of extra) {
        const ei = Math.floor(e.x / size), ej = Math.floor(e.y / size);
        foci.push([ei, ej]);
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ci = ei + di, cj = ej + dj;
          if (ci < 0 || cj < 0 || ci * CH >= map.W || cj * CH >= map.H || wanted.some((q) => q[0] === ci && q[1] === cj)) continue;
          wanted.push([ci, cj, 50 + Math.abs(di) + Math.abs(dj)]); // (after everything round the main camera)
        }
      }
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
        if (grp) { group.add(grp); fringe.set(key, grp.userData.plants); }
        if (T.onChunk) T.onChunk('add', key, map, ci, cj);
        built++;
      }
      for (const [key, c] of chunks) {
        if ((Math.abs(c.ci - ci0) > 4 || Math.abs(c.cj - cj0) > 3) && !foci.some((q) => Math.abs(c.ci - q[0]) <= 2 && Math.abs(c.cj - q[1]) <= 2)) { drop(c, key); chunks.delete(key); if (T.onChunk) T.onChunk('remove', key); }
      }
      fringe.commit();
      fringe.show(look.fringe !== false && !!(rock3d().FRINGE && rock3d().FRINGE.ON));
    },
    clear,
  };
  return T;
}
