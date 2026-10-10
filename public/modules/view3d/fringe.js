// A7 ROCK V2: the FRINGE, painted plants along the top lips of the rock. ONE instanced mesh for the whole terrain (one draw call): every plant is a quad that picks a cell of a small atlas painted in code (nothing is
// downloaded): 4 plants for each of the 7 environments (Sky Isles bushes and pines, Frost snowy pines and drifts, Ember charred stumps and glowing coals, Fungal small mushrooms, Sea grass and rock tufts, Storm
// windswept grass, Aether crystal shards). The ink edge is made in the shader (the atlas holds only the flat shapes): the alpha is read five times, the centre and one step to each side, the step being 1.7 PIXELS of
// the screen (fwidth), so the outline keeps its thickness at any zoom like every other ink of A1. A texel painted with a channel at full 255 GLOWS (the ember cracks, the mushroom rims, the crystal tips: added to the
// emissive, the bloom takes the rest). The plants are lit as the rock is (a toon material: lamps, beams and the dark of a cave act on them).
// terrain.js builds the plants of each chunk (stable hash of the lip's position) and hands them over with `set(key, data)`; `commit()` copies the live chunks' plants into the instance buffers once a frame at most.
// SWAY: only when the wind is strong (`setWind(gale, t)`, gale >= FRINGE.WIND): the top of a plant leans with the wind and moves between the 8 keys of a small table, 8 keys a second, each plant at its own phase
// (stepped, no sine of time). Otherwise they stand still. Never throws: if canvas or WebGL cannot do it, `mesh` stays hidden.
import { THREE, INK, rimify, gradientMap } from './style.js';
import { config } from '../../config.js';

export const FRINGE_ENVS = ['skyisles', 'frost', 'ember', 'fungal', 'sea', 'storm', 'aether'];
const CELL = 128, COLS = 4, ROWS = 8, STRIDE = 7;
const cfg = () => ((config.LOOK3D && config.LOOK3D.ROCK && config.LOOK3D.ROCK.FRINGE) || {});

// ---- painting ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// solid(): fill an outline (path draws into the current path) in three flat tones: base, a light crescent on the upper left and a dark one on the lower right (the outline shifted a few pixels and cut away).
function solid(g, path, c, o = {}) {
  const a = o.a || [5, 6], b = o.b || [4, 5];
  g.save();
  if (o.floor != null) { g.beginPath(); g.rect(-20, -20, CELL + 40, o.floor + 20); g.clip(); }
  g.beginPath(); path(g); g.fillStyle = c.base; g.fill();
  g.clip();
  const hole = (dx, dy, col) => { g.save(); g.beginPath(); g.rect(-60, -60, 260, 260); g.translate(dx, dy); path(g); g.fillStyle = col; g.fill('evenodd'); g.restore(); };
  hole(a[0], a[1], c.light);
  hole(-b[0], -b[1], c.dark);
  g.restore();
}
const circ = (x, y, r) => (g) => { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); };
const poly = (pts) => (g) => { g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); };
const many = (...ps) => (g) => { for (const p of ps) p(g); };
function blade(x, y, h, lean, w) { // a curved blade: root at (x, y), tip lean px to the side
  return (g) => { g.moveTo(x - w, y); g.quadraticCurveTo(x - w + lean * 0.35, y - h * 0.6, x + lean, y - h); g.quadraticCurveTo(x + w + lean * 0.45, y - h * 0.55, x + w, y); g.closePath(); };
}
const dot = (g, x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
// a pine: tiers of triangles one above the other (apex y, height, half width) over a trunk
function pine(tiers, cx) {
  return (g) => {
    for (const [ay, h, hw] of tiers) { g.moveTo(cx, ay); g.lineTo(cx + hw, ay + h); g.lineTo(cx - hw, ay + h); g.closePath(); }
  };
}
function snowCap(g, cx, ay, H, hw, col, shade) {
  const p = () => { g.beginPath(); g.moveTo(cx, ay - 1); g.lineTo(cx + hw * 0.72, ay + H * 0.72); g.quadraticCurveTo(cx + hw * 0.4, ay + H * 0.5, cx + hw * 0.22, ay + H * 0.74); g.quadraticCurveTo(cx - hw * 0.05, ay + H * 0.5, cx - hw * 0.3, ay + H * 0.76); g.quadraticCurveTo(cx - hw * 0.5, ay + H * 0.56, cx - hw * 0.72, ay + H * 0.72); g.closePath(); };
  p(); g.fillStyle = col; g.fill();
  g.save(); p(); g.clip(); g.fillStyle = shade; g.beginPath(); g.moveTo(cx + hw * 0.1, ay); g.lineTo(cx + hw, ay + H * 0.9); g.lineTo(cx + hw * 0.1, ay + H * 0.9); g.closePath(); g.fill(); g.restore();
}

// Each painter draws the four plants of one environment: at(k, fn) runs fn in cell k (0..3), whose own coordinates are 0..128 with the plant's foot on y = 112..114.
const PAINT = {
  skyisles(g, P, at) {
    const bush = { base: P.base, light: P.light, dark: P.dark }, wood = { base: P.trunk, light: '#8a6a4a', dark: '#3e2e20' };
    at(0, () => { // a round bush with a few flowers
      solid(g, many(circ(38, 92, 22), circ(62, 80, 28), circ(88, 90, 24), circ(64, 98, 24)), bush, { floor: 112 });
      for (const [x, y] of [[44, 84], [66, 72], [86, 86], [60, 98]]) { dot(g, x, y, 4.2, P.accent); dot(g, x - 1, y - 1, 1.6, '#fff0f0'); }
    });
    at(1, () => { // a small pine
      solid(g, poly([[60, 100], [68, 100], [68, 114], [60, 114]]), wood, { floor: 114 });
      solid(g, pine([[10, 38, 22], [34, 40, 30], [62, 44, 38]], 64), bush, { floor: 112 });
    });
    at(2, () => { // a tall slim pine
      solid(g, poly([[61, 104], [67, 104], [67, 114], [61, 114]]), wood, { floor: 114 });
      solid(g, pine([[8, 34, 15], [28, 34, 21], [48, 36, 26], [70, 40, 31]], 64), bush, { floor: 112 });
    });
    at(3, () => { // a little round tree
      solid(g, poly([[59, 70], [69, 70], [70, 114], [58, 114]]), wood, { floor: 114 });
      solid(g, many(circ(64, 46, 30), circ(42, 58, 20), circ(88, 58, 20), circ(64, 66, 22)), bush, { floor: 112 });
    });
  },
  frost(g, P, at) {
    const pc = { base: P.base, light: P.light, dark: P.dark }, wood = { base: P.trunk, light: '#7a6a5a', dark: '#2c2420' }, snow = { base: P.snow, light: '#ffffff', dark: P.snowShade };
    const tiers0 = [[10, 38, 22], [34, 40, 30], [62, 44, 38]], tiers1 = [[8, 34, 15], [28, 34, 21], [48, 36, 26], [70, 40, 31]];
    const capped = (tiers) => { g.save(); g.beginPath(); g.rect(0, 0, CELL, 112); g.clip(); g.beginPath(); pine(tiers, 64)(g); g.clip(); for (const [ay, h, hw] of tiers) snowCap(g, 64, ay, h, hw, P.snow, P.snowShade); g.restore(); };
    at(0, () => { solid(g, poly([[60, 100], [68, 100], [68, 114], [60, 114]]), wood, { floor: 114 }); solid(g, pine(tiers0, 64), pc, { floor: 112 }); capped(tiers0); }); // snowy pine
    at(1, () => { solid(g, poly([[61, 104], [67, 104], [67, 114], [61, 114]]), wood, { floor: 114 }); solid(g, pine(tiers1, 64), pc, { floor: 112 }); capped(tiers1); }); // tall snowy pine
    at(2, () => { // a drift: low mounds of snow
      solid(g, (gg) => { gg.moveTo(8, 112); gg.quadraticCurveTo(28, 62, 56, 80); gg.quadraticCurveTo(70, 52, 92, 78); gg.quadraticCurveTo(110, 70, 122, 112); gg.closePath(); }, snow, { floor: 112, a: [4, 5], b: [5, 7] });
    });
    at(3, () => { // a snowy bush
      const lumps = many(circ(40, 92, 20), circ(64, 82, 26), circ(88, 92, 21));
      solid(g, lumps, pc, { floor: 112 });
      g.save(); g.beginPath(); g.rect(0, 0, CELL, 112); g.clip(); g.beginPath(); lumps(g); g.clip();
      g.fillStyle = P.snow; g.beginPath(); g.moveTo(14, 82); g.quadraticCurveTo(40, 52, 64, 56); g.quadraticCurveTo(96, 50, 112, 84); g.quadraticCurveTo(88, 72, 64, 76); g.quadraticCurveTo(34, 74, 14, 82); g.fill();
      g.restore();
    });
  },
  ember(g, P, at) {
    const ch = { base: P.base, light: P.light, dark: P.dark }, ember = P.ember || '#ff9628';
    at(0, () => { // a broken trunk with a glowing crack
      solid(g, poly([[46, 114], [50, 60], [44, 40], [54, 48], [58, 22], [66, 44], [74, 34], [78, 62], [84, 114]]), ch, { floor: 114 });
      g.strokeStyle = ember; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(64, 104); g.lineTo(60, 84); g.lineTo(66, 68); g.lineTo(62, 52); g.stroke();
    });
    at(1, () => { // a low stump with a pale ring and embers
      solid(g, poly([[28, 114], [34, 74], [44, 62], [64, 66], [84, 60], [94, 72], [100, 114]]), ch, { floor: 114 });
      g.fillStyle = '#6a5650'; g.beginPath(); g.ellipse(66, 66, 26, 7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ember; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(58, 112); g.lineTo(54, 98); g.lineTo(62, 88); g.lineTo(58, 76); g.stroke();
    });
    at(2, () => { // a bare dead tree
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [pts, w] of [[[[64, 114], [62, 80], [64, 48], [60, 14]], 10], [[[63, 76], [84, 62], [96, 40]], 6], [[[63, 60], [44, 48], [36, 28]], 5], [[[62, 40], [74, 30], [80, 14]], 4]]) {
        g.strokeStyle = ch.base; g.lineWidth = w; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
      }
      g.strokeStyle = ch.dark; g.lineWidth = 3; g.beginPath(); g.moveTo(67, 112); g.lineTo(65, 80); g.lineTo(67, 50); g.stroke();
      dot(g, 63, 96, 2.6, ember);
    });
    at(3, () => { // a heap of charred chunks split by one glowing crack
      solid(g, poly([[22, 114], [30, 92], [46, 84], [58, 64], [72, 72], [84, 88], [100, 94], [108, 114]]), ch, { floor: 114, a: [6, 6], b: [5, 5] });
      g.strokeStyle = ember; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(40, 110); g.lineTo(52, 100); g.lineTo(50, 90); g.lineTo(60, 80); g.stroke();
    });
  },
  fungal(g, P, at) {
    const cap = { base: P.base, light: P.light, dark: P.dark }, stem = { base: P.stem, light: '#ffffff', dark: '#9cb8a8' };
    const shroom = (cx, by, capR, stemW, stemH, tilt = 0) => {
      solid(g, poly([[cx - stemW / 2, by], [cx - stemW / 2 + tilt, by - stemH], [cx + stemW / 2 + tilt, by - stemH], [cx + stemW / 2, by]]), stem, { floor: 114, a: [3, 0], b: [3, 0] });
      const cy = by - stemH + 2;
      solid(g, (gg) => { gg.moveTo(cx + tilt - capR, cy); gg.quadraticCurveTo(cx + tilt - capR, cy - capR * 1.15, cx + tilt, cy - capR * 1.12); gg.quadraticCurveTo(cx + tilt + capR, cy - capR * 1.15, cx + tilt + capR, cy); gg.closePath(); }, cap, { a: [5, 5], b: [4, 4] });
      g.fillStyle = P.glow; g.beginPath(); g.ellipse(cx + tilt, cy + 1, capR * 0.92, 2.6, 0, 0, Math.PI * 2); g.fill();
      dot(g, cx + tilt - capR * 0.35, cy - capR * 0.5, capR * 0.14, P.spot); dot(g, cx + tilt + capR * 0.25, cy - capR * 0.72, capR * 0.11, P.spot); dot(g, cx + tilt + capR * 0.5, cy - capR * 0.3, capR * 0.1, P.spot);
    };
    at(0, () => shroom(64, 114, 34, 16, 48, 4));
    at(1, () => { shroom(34, 114, 20, 10, 28, -2); shroom(66, 114, 28, 13, 42, 3); shroom(96, 114, 15, 8, 20, 2); });
    at(2, () => shroom(64, 114, 44, 18, 24, 0));
    at(3, () => { shroom(26, 114, 13, 6, 16, 0); shroom(48, 114, 17, 8, 24, -2); shroom(74, 114, 12, 6, 14, 1); shroom(98, 114, 15, 7, 20, 2); });
  },
  sea(g, P, at) {
    const gr = { base: P.base, light: P.light, dark: P.dark }, st = { base: P.stone, light: P.stoneLight, dark: P.stoneDark };
    const clump = (cx, n, hMin, hMax, spread, lean, w) => many(...Array.from({ length: n }, (_, i) => { const u = n > 1 ? i / (n - 1) : 0.5, h = hMin + (hMax - hMin) * (1 - Math.abs(u - 0.5) * 2) * (0.7 + 0.3 * ((i * 7) % 3) / 2); return blade(cx + (u - 0.5) * spread, 114, Math.max(14, h), (u - 0.5) * lean + 3, w); }));
    at(0, () => solid(g, clump(64, 9, 40, 96, 60, 56, 5), gr, { floor: 114, a: [4, 3], b: [3, 3] })); // a tall clump
    at(1, () => solid(g, clump(64, 12, 26, 58, 96, 30, 5.5), gr, { floor: 114, a: [4, 3], b: [3, 3] })); // a low wide clump
    at(2, () => { // rocks and a few blades
      solid(g, many(blade(30, 114, 54, -10, 5), blade(40, 114, 38, 8, 4.5), blade(100, 114, 46, 14, 5)), gr, { floor: 114 });
      solid(g, poly([[44, 114], [48, 84], [64, 70], [84, 76], [96, 100], [100, 114]]), st, { floor: 114, a: [5, 6], b: [5, 5] });
      solid(g, poly([[18, 114], [22, 98], [36, 92], [48, 102], [54, 114]]), st, { floor: 114, a: [3, 4], b: [3, 3] });
    });
    at(3, () => { // two boulders
      solid(g, poly([[22, 114], [28, 82], [48, 66], [72, 72], [86, 96], [90, 114]]), st, { floor: 114, a: [6, 6], b: [6, 6] });
      solid(g, poly([[70, 114], [74, 94], [90, 86], [108, 94], [114, 114]]), st, { floor: 114, a: [4, 4], b: [4, 4] });
    });
  },
  storm(g, P, at) {
    const gr = { base: P.base, light: P.light, dark: P.dark };
    const lean = (cx, n, hMin, hMax, spread, L, w) => many(...Array.from({ length: n }, (_, i) => { const u = n > 1 ? i / (n - 1) : 0.5, h = hMin + (hMax - hMin) * (1 - Math.abs(u - 0.4) * 1.6) * (0.75 + 0.25 * ((i * 5) % 3) / 2); return blade(cx + (u - 0.5) * spread, 114, Math.max(14, h), L * (0.7 + 0.3 * u), w); }));
    at(0, () => solid(g, lean(46, 9, 40, 90, 52, 44, 5), gr, { floor: 114, a: [4, 3], b: [3, 3] })); // tall, all leaning right
    at(1, () => solid(g, lean(44, 11, 22, 50, 80, 32, 5.5), gr, { floor: 114, a: [4, 3], b: [3, 3] })); // low
    at(2, () => { // a wind-bent shrub
      solid(g, many(circ(40, 96, 20), circ(62, 84, 24), circ(86, 80, 20), circ(104, 88, 12)), gr, { floor: 114, a: [5, 4], b: [4, 4] });
      solid(g, many(blade(30, 106, 26, 34, 4), blade(36, 106, 20, 32, 3.5)), gr, { floor: 114 });
    });
    at(3, () => { // grass with seed heads
      solid(g, lean(40, 7, 46, 92, 40, 38, 4), gr, { floor: 114, a: [4, 3], b: [3, 3] });
      for (let i = 0; i < 4; i++) { const x = 40 + (i / 3 - 0.5) * 36 + 34, y = 114 - (62 + 8 * i); g.fillStyle = P.seed; g.beginPath(); g.ellipse(x, y, 3.2, 8, 0.45, 0, Math.PI * 2); g.fill(); }
    });
  },
  aether(g, P, at) {
    const crystal = (cx, by, w, h, lean, c, glowTip) => {
      const L = [cx - w / 2, by], R = [cx + w / 2, by], tip = [cx + lean, by - h], sh = by - h * 0.78, mid = [cx + lean * 0.35, by];
      const shell = [L, [cx - w / 2 + lean * 0.3, sh], tip, [cx + w / 2 + lean * 0.3, sh], R];
      g.fillStyle = c.base; g.beginPath(); shell.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill();
      g.fillStyle = c.light; g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(shell[1][0], shell[1][1]); g.lineTo(tip[0], tip[1]); g.lineTo(mid[0], mid[1] - h * 0.1); g.lineTo(mid[0], mid[1]); g.closePath(); g.fill();
      g.fillStyle = c.dark; g.beginPath(); g.moveTo(R[0], R[1]); g.lineTo(shell[3][0], shell[3][1]); g.lineTo(tip[0], tip[1]); g.lineTo(mid[0] + w * 0.12, mid[1] - h * 0.1); g.lineTo(mid[0] + w * 0.12, mid[1]); g.closePath(); g.fill();
      if (glowTip) { g.fillStyle = P.glow; g.beginPath(); g.moveTo(tip[0], tip[1]); g.lineTo(tip[0] - w * 0.18, tip[1] + h * 0.14); g.lineTo(tip[0] + w * 0.18, tip[1] + h * 0.14); g.closePath(); g.fill(); }
    };
    const v = { base: P.base, light: P.light, dark: P.dark }, cy = { base: '#5ab8d8', light: P.cyan, dark: '#2f7898' };
    at(0, () => { crystal(38, 114, 22, 60, -8, v, true); crystal(66, 114, 28, 96, 4, cy, true); crystal(94, 114, 20, 50, 14, v, false); }); // a trio
    at(1, () => crystal(64, 114, 34, 104, 6, v, true)); // one tall
    at(2, () => { for (const [x, w, h, l, c] of [[22, 14, 34, -6, v], [42, 16, 52, -3, cy], [64, 18, 40, 2, v], [84, 15, 56, 5, cy], [104, 13, 30, 8, v]]) crystal(x, 114, w, h, l, c, h > 50); }); // a low five
    at(3, () => { crystal(44, 114, 26, 78, -18, cy, true); crystal(84, 114, 26, 70, 18, v, true); crystal(64, 114, 20, 40, 0, v, false); }); // two leaning out
  },
};

function paintAtlas() {
  const cv = document.createElement('canvas');
  cv.width = CELL * COLS; cv.height = CELL * ROWS;
  const g = cv.getContext('2d');
  if (!g) throw new Error('no 2D canvas');
  const C = cfg();
  FRINGE_ENVS.forEach((env, row) => {
    const at = (k, fn) => { g.save(); g.translate(k * CELL, row * CELL); g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip(); try { fn(); } catch (e) { console.warn('fringe cell', env, k, e); } g.restore(); };
    try { PAINT[env](g, { ...(C[env] || {}) }, at); } catch (e) { console.warn('fringe atlas', env, e); }
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

// ---- the mesh ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const VERT = `
  attribute vec4 aBase; attribute vec4 aInfo;
  uniform float uWind; uniform float uKey; uniform float uWindDir; uniform float uRow;
  varying vec2 vUv; varying vec2 vCell;
  const float KEYS[ 8 ] = float[ 8 ]( 0.0, 0.5, 1.0, 0.5, 0.0, -0.5, -1.0, -0.5 );
`;
const VERT_BODY = `
  vec2 q = vec2( position.x + 0.5, position.y + 0.125 );          // 0..1 over the cell (the cell's bottom edge is 0.125 below the plant's foot)
  vUv = vec2( aInfo.y < 0.0 ? 1.0 - q.x : q.x, q.y );
  vCell = vec2( aInfo.x * ${1 / COLS}, 1.0 - ( uRow + 1.0 ) * ${1 / ROWS} );
  float sz = aBase.w;
  float lean = 0.0;
  if ( uWind > 0.01 ) { float k = mod( floor( aInfo.z * 8.0 ) + uKey, 8.0 ); lean = ( uWindDir * 0.55 + KEYS[ int( k ) ] * 0.45 ) * uWind * 0.14; }
  float hh = q.y - 0.125;                                          // 0 at the foot, 1 at the top
  vec3 transformed = vec3( aBase.x + ( position.x * aInfo.y ) * sz + lean * sz * max( hh, 0.0 ) * max( hh, 0.0 ), aBase.y + position.y * sz, aBase.z );
`;
const FRAG = `
  uniform sampler2D uAtlas; uniform vec3 uInkCol; varying vec2 vUv; varying vec2 vCell;
  vec4 fringeTap( vec2 uv ) { return texture2D( uAtlas, vCell + vec2( uv.x * ${1 / COLS}, uv.y * ${1 / ROWS} ) ); }
`;
const FRAG_BODY = `
  {
    vec2 fw = fwidth( vUv );
    vec2 off = min( fw * 1.7, vec2( 0.09 ) );                       // the ink: 1.7 screen pixels, never more than 12 texels (the cell's padding)
    vec4 c0 = fringeTap( vUv );
    float aD = max( max( fringeTap( vUv + vec2( off.x, 0.0 ) ).a, fringeTap( vUv - vec2( off.x, 0.0 ) ).a ), max( fringeTap( vUv + vec2( 0.0, off.y ) ).a, fringeTap( vUv - vec2( 0.0, off.y ) ).a ) );
    aD = max( aD, c0.a );
    if ( aD < 0.5 ) discard;
    float cover = smoothstep( 0.45, 0.75, c0.a );
    vec3 tex = c0.rgb;
    diffuseColor.rgb = mix( uInkCol, tex, cover );
    float gl = step( 0.985, max( tex.r, max( tex.g, tex.b ) ) ) * cover;
    totalEmissiveRadiance += tex * gl * 1.5;
  }
`;

export function createFringe(parent) {
  const F = { mesh: null, count: 0, supported: false };
  try {
    const C = cfg(), MAX = Math.max(64, Math.min(8000, Number(C.MAX) || 3000));
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.125, 0, 0.5, -0.125, 0, 0.5, 0.875, 0, -0.5, 0.875, 0], 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const base = new Float32Array(MAX * 4), info = new Float32Array(MAX * 4);
    const aBase = new THREE.InstancedBufferAttribute(base, 4), aInfo = new THREE.InstancedBufferAttribute(info, 4);
    aBase.setUsage(THREE.DynamicDrawUsage); aInfo.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBase', aBase); geo.setAttribute('aInfo', aInfo);
    geo.instanceCount = 0;
    const U = { uWind: { value: 0 }, uKey: { value: 0 }, uWindDir: { value: 1 }, uRow: { value: 0 }, uAtlas: { value: null }, uInkCol: { value: new THREE.Color(INK) } };
    const mat = rimify(new THREE.MeshToonMaterial({ gradientMap, side: THREE.DoubleSide }));
    const rim = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      rim(sh, r);
      for (const k of Object.keys(U)) sh.uniforms[k] = U[k];
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT).replace('#include <begin_vertex>', VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG).replace('#include <map_fragment>', FRAG_BODY);
    };
    mat.customProgramCacheKey = () => 'toon-rim-fringe';
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false; // (instances are anywhere; the draw is cheap)
    mesh.raycast = () => {}; // (the contact shadows raycast against the terrain: the plants are not ground)
    mesh.visible = false;
    mesh.renderOrder = 1;
    mesh.userData.fringe = true;
    parent.add(mesh);
    F.mesh = mesh; F.supported = true; F.uniforms = U;

    const chunks = new Map();
    let dirty = false, row = 0, painted = false;
    F.setEnv = (envId) => {
      const i = FRINGE_ENVS.indexOf(envId);
      row = i < 0 ? 0 : i;
      U.uRow.value = row;
      if (!painted) {
        try { U.uAtlas.value = paintAtlas(); painted = true; } catch (e) { console.warn('fringe', e); F.supported = false; mesh.visible = false; }
      }
    };
    F.set = (key, data) => { if (data && data.length) chunks.set(key, data); else chunks.delete(key); dirty = true; };
    F.commit = () => {
      if (!dirty || !F.supported) return;
      dirty = false;
      let n = 0;
      for (const d of chunks.values()) {
        for (let k = 0; k + STRIDE <= d.length && n < MAX; k += STRIDE, n++) {
          base[n * 4] = d[k]; base[n * 4 + 1] = d[k + 1]; base[n * 4 + 2] = d[k + 2]; base[n * 4 + 3] = d[k + 3];
          info[n * 4] = d[k + 4]; info[n * 4 + 1] = d[k + 5]; info[n * 4 + 2] = d[k + 6]; info[n * 4 + 3] = 0;
        }
      }
      aBase.needsUpdate = true; aInfo.needsUpdate = true;
      geo.instanceCount = n; F.count = n;
    };
    // the wind: only above FRINGE.WIND do they move; then they hold each of 8 keys for 1/8 s
    F.setWind = (gale, t, dir = 1) => {
      const thr = Number(C.WIND) || 0.4, g = Math.max(0, Math.min(1, Number(gale) || 0));
      U.uWind.value = g >= thr ? 0.25 + 0.75 * (g - thr) / Math.max(0.05, 1 - thr) : 0;
      U.uKey.value = Math.floor((Number(t) || 0) * 8) % 8;
      U.uWindDir.value = dir >= 0 ? 1 : -1;
    };
    F.show = (on) => { mesh.visible = !!on && F.supported && F.count > 0; };
    F.clear = () => { chunks.clear(); dirty = true; F.commit(); };
  } catch (e) {
    console.warn('fringe off', e);
    F.supported = false;
    F.setEnv = F.set = F.commit = F.setWind = F.show = F.clear = () => {};
  }
  return F;
}
