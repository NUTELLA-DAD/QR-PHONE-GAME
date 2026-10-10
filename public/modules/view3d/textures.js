// THE TRIM SHEET (3D.md section 2, WP2): ONE 2048x2048 texture painted by code with Canvas 2D when the first ship is built (nothing is downloaded, nothing animates).
// Flat painterly strokes with a slight grain. Everything is a near-white / mid-value "modulator": the vertex colours carry the hue (the theme's hull, the enemy's charcoal and oxblood...),
// the sheet carries the planks, the weave, the rivets. (The material adds a small gain so the average stays where the old flat colours were.)
//
// LAYOUT (pixels, canvas y down; the helpers below turn a rect into UVs for you):
//   y    0.. 384  four plank strips, 2048 x 96 each: woodA woodB woodC (3 wood tones, boards of 150-330 px with streaks, knots, nails) and deck (3 sub-planks of 32 px with tar-black seams)
//   y  384.. 640  canvas cells x6 (128x256: weave, seam lines and stitches on the four edges), 3 patch shapes (square, round, strip), brass (a highlight band across), riveted iron, rope (twisted), plain, tar
//   y  640.. 768  strap (webbing) and lacing (eyelets and criss-cross cord), the H2 stencil
//   y  768.. 896  A2: the sea's foam atlas (4 cells, 128 high: an arc 640 wide, a ring 384, a pair of dashes 640, a broken ring 384). White, with the ALPHA a soft ramp round each shape (0.5 on its
//                 edge, 0 about 12 texels out, 1 about 12 in), so water.js can cut the fill, and a thin ink line just outside it, at any size, from one texture tap
//   y  896..1280  rock strata x3 (2048 x 128): for WP3, modulators like the rest, they are tinted by vertex colour
//   y 1280..1408  a foam band (2048 x 128, transparent between the scallops)
//   y 1408..1664  a cloud disc atlas: 8 discs of 256 (transparent edges)
//   y 1664..1920  a 4-frame fire flipbook (4 x 256), a smoke disc (256), 3 scorch decals (256 each)
//   y 1920..2048  4 hole decals (128 each), spare
// The optional art/textures/*.png (wood, darkwood, canvas, brass, charcoal...) are blended in as a faint grain when they arrive (the game works without them).
//
// API:  getTrimSheet() -> { texture, rects, ms, grain }   (built once; never throws: a plain white texture if canvas is not there)
//       TRIM (the pixel rects), uvRect(name) -> { u0, v0, u1, v1 } (a 0.5 px inset), uvAt(name, tx, ty) -> [u, v] for a texel inside the rect, plankLayout(name) -> { subs, subH, boards }
import * as THREE from 'three';

export const SHEET = 2048;
const S = SHEET;
const row = (y, h) => ({ x: 0, y, w: S, h });
export const TRIM = {
  woodA: row(0, 96), woodB: row(96, 96), woodC: row(192, 96), deck: row(288, 96),
  canvas0: { x: 0, y: 384, w: 128, h: 256 }, canvas1: { x: 128, y: 384, w: 128, h: 256 }, canvas2: { x: 256, y: 384, w: 128, h: 256 },
  canvas3: { x: 384, y: 384, w: 128, h: 256 }, canvas4: { x: 512, y: 384, w: 128, h: 256 }, canvas5: { x: 640, y: 384, w: 128, h: 256 },
  patchSq: { x: 768, y: 384, w: 128, h: 128 }, patchRound: { x: 896, y: 384, w: 128, h: 128 }, patchStrip: { x: 1024, y: 384, w: 128, h: 128 },
  brass: { x: 1152, y: 384, w: 256, h: 256 }, iron: { x: 1408, y: 384, w: 256, h: 256 }, rope: { x: 1664, y: 384, w: 256, h: 256 },
  plain: { x: 1920, y: 384, w: 128, h: 128 }, tar: { x: 1920, y: 512, w: 128, h: 128 },
  strap: { x: 0, y: 640, w: 1024, h: 64 }, lacing: { x: 1024, y: 640, w: 1024, h: 64 }, stencilH2: { x: 0, y: 704, w: 512, h: 64 },
  seaFoam0: { x: 0, y: 768, w: 640, h: 128 }, seaFoam1: { x: 640, y: 768, w: 384, h: 128 }, seaFoam2: { x: 1024, y: 768, w: 640, h: 128 }, seaFoam3: { x: 1664, y: 768, w: 384, h: 128 },
  rock0: row(896, 128), rock1: row(1024, 128), rock2: row(1152, 128), foam: row(1280, 128),
  cloud0: { x: 0, y: 1408, w: 256, h: 256 }, cloud1: { x: 256, y: 1408, w: 256, h: 256 }, cloud2: { x: 512, y: 1408, w: 256, h: 256 }, cloud3: { x: 768, y: 1408, w: 256, h: 256 },
  cloud4: { x: 1024, y: 1408, w: 256, h: 256 }, cloud5: { x: 1280, y: 1408, w: 256, h: 256 }, cloud6: { x: 1536, y: 1408, w: 256, h: 256 }, cloud7: { x: 1792, y: 1408, w: 256, h: 256 },
  fire0: { x: 0, y: 1664, w: 256, h: 256 }, fire1: { x: 256, y: 1664, w: 256, h: 256 }, fire2: { x: 512, y: 1664, w: 256, h: 256 }, fire3: { x: 768, y: 1664, w: 256, h: 256 },
  smoke: { x: 1024, y: 1664, w: 256, h: 256 }, scorch0: { x: 1280, y: 1664, w: 256, h: 256 }, scorch1: { x: 1536, y: 1664, w: 256, h: 256 }, scorch2: { x: 1792, y: 1664, w: 256, h: 256 },
  hole0: { x: 0, y: 1920, w: 128, h: 128 }, hole1: { x: 128, y: 1920, w: 128, h: 128 }, hole2: { x: 256, y: 1920, w: 128, h: 128 }, hole3: { x: 384, y: 1920, w: 128, h: 128 },
};
export const CANVAS_CELLS = ['canvas0', 'canvas1', 'canvas2', 'canvas3', 'canvas4', 'canvas5'];
export const WOODS = ['woodA', 'woodB', 'woodC'];
export const FIRE_FRAMES = ['fire0', 'fire1', 'fire2', 'fire3'];
export const CLOUD_DISCS = ['cloud0', 'cloud1', 'cloud2', 'cloud3', 'cloud4', 'cloud5', 'cloud6', 'cloud7'];
export const SCORCH = ['scorch0', 'scorch1', 'scorch2'];
export const HOLES = ['hole0', 'hole1', 'hole2', 'hole3'];
export const SEA_FOAM = ['seaFoam0', 'seaFoam1', 'seaFoam2', 'seaFoam3'];
export const ROCK_STRATA = ['rock0', 'rock1', 'rock2'];

// ---- UV helpers (flipY canvas texture: canvas y down -> v up) -------------------------------------------------------------------------------------------------------------------------
export function uvRect(name, inset = 0.5) {
  const r = TRIM[name] || TRIM.plain;
  return { u0: (r.x + inset) / S, u1: (r.x + r.w - inset) / S, v0: 1 - (r.y + r.h - inset) / S, v1: 1 - (r.y + inset) / S };
}
export function uvAt(name, tx, ty) { const r = TRIM[name] || TRIM.plain; return [(r.x + tx) / S, 1 - (r.y + ty) / S]; }

// the boards painted into a plank strip (texels from the strip's left edge), so geometry can put its butt joints where the picture has them: { subs, subH, boards: [ [ [u0, u1], ... ] per sub-strip ] }
const PLANKS = {};
export function plankLayout(name) { return PLANKS[name] || { subs: 1, subH: (TRIM[name] || TRIM.woodA).h, boards: [[[0, 256]]] }; }

// ---- the painter ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
const grey = (v, a = 1) => rgba(v, v, v, a);

function paintPlanks(g, name, o) {
  const r = TRIM[name], rnd = mulberry(o.seed), R = (a, b) => a + (b - a) * rnd();
  const subs = o.subs || 1, subH = r.h / subs;
  PLANKS[name] = { subs, subH, boards: [] };
  for (let k = 0; k < subs; k++) {
    const y0 = r.y + k * subH, boards = [];
    let x = 0;
    while (x < r.w) {
      const len = Math.min(r.w - x, R(o.minLen || 150, o.maxLen || 330));
      boards.push([x, x + len]);
      const bx = r.x + x, tone = o.tone, sh = R(-o.vary, o.vary);
      g.fillStyle = rgba(tone[0] + sh, tone[1] + sh * 0.9, tone[2] + sh * 0.8);
      g.fillRect(bx, y0, len, subH);
      // a flat darker wash along one edge of the board (painted, not blended)
      g.fillStyle = rgba(0, 0, 0, R(0.03, 0.07));
      g.fillRect(bx, y0 + subH * R(0.5, 0.72), len, subH * 0.5);
      // grain streaks (long thin strokes with a slow drift)
      const streaks = Math.round(subH / R(7, 11));
      for (let i = 0; i < streaks; i++) {
        const yy = y0 + R(2, subH - 2), dr = R(-2.2, 2.2), a0 = bx + R(0, len * 0.25), a1 = bx + len * R(0.55, 1);
        g.strokeStyle = i % 3 === 0 ? rgba(255, 250, 235, R(0.1, 0.2)) : rgba(60, 38, 18, R(0.08, 0.2));
        g.lineWidth = R(0.7, 2);
        g.beginPath(); g.moveTo(a0, yy); g.quadraticCurveTo((a0 + a1) / 2, yy + dr, a1, yy + dr * 0.4); g.stroke();
      }
      if (rnd() < (o.knots == null ? 0.3 : o.knots)) { // a knot: three flat rings
        const kx = bx + R(len * 0.2, len * 0.8), ky = y0 + R(subH * 0.3, subH * 0.7), kr = R(3.5, 6.5) * (subH / 96 + 0.5);
        for (let q = 3; q >= 1; q--) { g.strokeStyle = rgba(70, 44, 22, 0.16 + 0.07 * (4 - q)); g.lineWidth = 1.3; g.beginPath(); g.ellipse(kx, ky, kr * q * 0.7 * 1.6, kr * q * 0.7, 0, 0, 7); g.stroke(); }
        g.fillStyle = rgba(60, 36, 16, 0.4); g.beginPath(); g.ellipse(kx, ky, kr * 0.5, kr * 0.34, 0, 0, 7); g.fill();
      }
      // the seams: top and bottom edge lines (tar-black on a deck), the butt joint at the end, two nail dots at each end
      g.fillStyle = o.seam;
      g.fillRect(bx, y0, len, o.seamW);
      g.fillRect(bx, y0 + subH - o.seamW, len, o.seamW);
      g.fillRect(bx + len - o.buttW, y0, o.buttW, subH);
      g.fillStyle = rgba(40, 28, 20, 0.55);
      for (const nx of [bx + 7, bx + len - 9]) for (const ny of [y0 + subH * 0.28, y0 + subH * 0.72]) { g.beginPath(); g.arc(nx, ny, 1.5, 0, 7); g.fill(); }
      x += len;
    }
    PLANKS[name].boards.push(boards);
  }
}

function paintCanvasCell(g, name, seed) {
  const r = TRIM[name], rnd = mulberry(seed), R = (a, b) => a + (b - a) * rnd();
  const base = 244 + R(-5, 3);
  g.fillStyle = rgba(base, base - 5, base - 17);
  g.fillRect(r.x, r.y, r.w, r.h);
  // painted stains: two flat washes (a big pale one and a smaller darker one)
  for (const [s, a] of [[0.55, 0.045], [0.28, 0.05]]) {
    g.fillStyle = rgba(120, 96, 60, a);
    g.beginPath(); g.ellipse(r.x + R(30, 100), r.y + R(50, 210), r.w * s * R(0.7, 1.1), r.h * s * R(0.4, 0.7), R(-0.6, 0.6), 0, 7); g.fill();
  }
  // the weave: fine crossed lines
  g.lineWidth = 1;
  for (let yy = 2; yy < r.h; yy += 3) { g.strokeStyle = rgba(110, 90, 60, 0.07); g.beginPath(); g.moveTo(r.x, r.y + yy + 0.5); g.lineTo(r.x + r.w, r.y + yy + 0.5); g.stroke(); }
  for (let xx = 3; xx < r.w; xx += 3) { g.strokeStyle = rgba(110, 90, 60, 0.06); g.beginPath(); g.moveTo(r.x + xx + 0.5, r.y); g.lineTo(r.x + xx + 0.5, r.y + r.h); g.stroke(); }
  for (let i = 0; i < 26; i++) { g.strokeStyle = rgba(90, 70, 40, R(0.06, 0.14)); const sx = r.x + R(4, r.w - 12), sy = r.y + R(4, r.h - 4); g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + R(4, 11), sy + R(-0.6, 0.6)); g.stroke(); }
  // the seams: a darker lap along both long edges (the gore seams), a lighter fold along the short edges (the band seams), and a dashed stitch line on each
  g.fillStyle = rgba(90, 66, 36, 0.13);
  g.fillRect(r.x, r.y, 5, r.h); g.fillRect(r.x + r.w - 5, r.y, 5, r.h);
  g.fillStyle = rgba(255, 252, 238, 0.35);
  g.fillRect(r.x, r.y, r.w, 4); g.fillRect(r.x, r.y + r.h - 4, r.w, 4);
  g.fillStyle = rgba(70, 50, 28, 0.3);
  g.fillRect(r.x, r.y, 1.5, r.h); g.fillRect(r.x + r.w - 1.5, r.y, 1.5, r.h);
  g.fillStyle = rgba(70, 50, 28, 0.14);
  g.fillRect(r.x, r.y, r.w, 1.5); g.fillRect(r.x, r.y + r.h - 1.5, r.w, 1.5);
  g.strokeStyle = rgba(70, 50, 28, 0.36); g.lineWidth = 1.4; g.setLineDash([5, 4]);
  for (const xx of [8, r.w - 8]) { g.beginPath(); g.moveTo(r.x + xx, r.y + 6); g.lineTo(r.x + xx, r.y + r.h - 6); g.stroke(); }
  g.strokeStyle = rgba(70, 50, 28, 0.2);
  for (const yy of [8, r.h - 8]) { g.beginPath(); g.moveTo(r.x + 8, r.y + yy); g.lineTo(r.x + r.w - 8, r.y + yy); g.stroke(); }
  g.setLineDash([]);
}

function paintPatches(g) {
  const sq = TRIM.patchSq, rd = TRIM.patchRound, st = TRIM.patchStrip;
  for (const r of [sq, rd, st]) { g.fillStyle = rgba(222, 205, 168); g.fillRect(r.x, r.y, r.w, r.h); g.fillStyle = rgba(120, 96, 60, 0.07); for (let yy = 2; yy < r.h; yy += 3) g.fillRect(r.x, r.y + yy, r.w, 1); }
  g.strokeStyle = rgba(70, 50, 28, 0.6); g.lineWidth = 1.8; g.setLineDash([6, 4]);
  g.strokeRect(sq.x + 8, sq.y + 8, sq.w - 16, sq.h - 16);
  g.beginPath(); g.arc(rd.x + rd.w / 2, rd.y + rd.h / 2, 54, 0, 7); g.stroke();
  g.strokeRect(st.x + 6, st.y + 30, st.w - 12, st.h - 60);
  g.setLineDash([]);
  g.lineWidth = 1.6; // cross stitches on the strip
  for (let x = st.x + 14; x < st.x + st.w - 10; x += 12) { g.beginPath(); g.moveTo(x, st.y + 42); g.lineTo(x + 7, st.y + 86); g.moveTo(x + 7, st.y + 42); g.lineTo(x, st.y + 86); g.stroke(); }
}

function paintBrass(g) {
  const r = TRIM.brass, rnd = mulberry(7), R = (a, b) => a + (b - a) * rnd();
  const grad = g.createLinearGradient(r.x, 0, r.x + r.w, 0);
  for (const [t, v] of [[0, 150], [0.1, 190], [0.26, 247], [0.34, 255], [0.46, 226], [0.68, 200], [0.9, 160], [1, 146]]) grad.addColorStop(t, rgba(v, v * 0.97, v * 0.86));
  g.fillStyle = grad; g.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < 70; i++) { g.strokeStyle = i % 2 ? rgba(255, 250, 225, R(0.05, 0.14)) : rgba(80, 60, 20, R(0.05, 0.12)); g.lineWidth = R(0.6, 1.6); const x = r.x + R(2, r.w - 2); g.beginPath(); g.moveTo(x, r.y); g.lineTo(x + R(-1.5, 1.5), r.y + r.h); g.stroke(); }
  g.fillStyle = rgba(80, 58, 24, 0.22); // a seam ring top and bottom
  g.fillRect(r.x, r.y, r.w, 5); g.fillRect(r.x, r.y + r.h - 5, r.w, 5);
  for (let i = 0; i < 14; i++) { g.fillStyle = rgba(70, 50, 20, R(0.1, 0.2)); g.beginPath(); g.arc(r.x + R(6, r.w - 6), r.y + R(8, r.h - 8), R(0.8, 2), 0, 7); g.fill(); }
}

function paintIron(g) {
  const r = TRIM.iron, rnd = mulberry(11), R = (a, b) => a + (b - a) * rnd();
  g.fillStyle = grey(206); g.fillRect(r.x, r.y, r.w, r.h);
  for (let i = 0; i < 60; i++) { g.strokeStyle = grey(i % 2 ? 255 : 80, R(0.05, 0.12)); g.lineWidth = R(0.6, 1.4); const y = r.y + R(0, r.h); g.beginPath(); g.moveTo(r.x, y); g.lineTo(r.x + r.w, y + R(-1, 1)); g.stroke(); }
  for (const px of [0, 128]) for (const py of [0, 128]) { // four plates, each with a rim and a ring of rivets
    const x0 = r.x + px, y0 = r.y + py;
    g.fillStyle = grey(0, 0.1); g.fillRect(x0, y0, 128, 128);
    g.fillStyle = grey(236, 0.55); g.fillRect(x0 + 3, y0 + 3, 122, 3);
    g.strokeStyle = grey(40, 0.6); g.lineWidth = 2.2; g.strokeRect(x0 + 1, y0 + 1, 126, 126);
    for (let k = 0; k < 6; k++) for (const [rx, ry] of [[14 + k * 20, 11], [14 + k * 20, 117], [11, 14 + k * 20], [117, 14 + k * 20]]) {
      g.fillStyle = grey(30, 0.45); g.beginPath(); g.arc(x0 + rx + 0.8, y0 + ry + 1, 3.4, 0, 7); g.fill();
      g.fillStyle = grey(232); g.beginPath(); g.arc(x0 + rx, y0 + ry, 2.8, 0, 7); g.fill();
      g.fillStyle = grey(255, 0.9); g.beginPath(); g.arc(x0 + rx - 0.8, y0 + ry - 0.9, 1, 0, 7); g.fill();
    }
  }
  for (let i = 0; i < 40; i++) { g.fillStyle = rgba(120, 80, 50, R(0.04, 0.1)); g.beginPath(); g.ellipse(r.x + R(0, r.w), r.y + R(0, r.h), R(2, 8), R(1, 3), 0, 0, 7); g.fill(); }
}

function paintRope(g) {
  const r = TRIM.rope, rnd = mulberry(13), R = (a, b) => a + (b - a) * rnd();
  g.fillStyle = rgba(228, 214, 186); g.fillRect(r.x, r.y, r.w, r.h);
  const N = 16; // twists down the tile
  for (let strand = 0; strand < 3; strand++) { // three plies, each a run of slanted bars
    for (let i = -2; i < N + 2; i++) {
      const y = r.y + (i * r.h) / N, x0 = r.x + (strand * r.w) / 3, w = r.w / 3;
      g.fillStyle = rgba(60, 44, 26, 0.17);
      g.beginPath(); g.moveTo(x0, y + r.h / N * 0.7); g.lineTo(x0 + w, y - r.h / N * 0.1); g.lineTo(x0 + w, y + r.h / N * 0.12); g.lineTo(x0, y + r.h / N * 0.95); g.closePath(); g.fill();
      g.strokeStyle = rgba(255, 248, 226, 0.34); g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y + r.h / N * 0.2); g.lineTo(x0 + w, y - r.h / N * 0.5); g.stroke();
    }
  }
  g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
  for (let i = 0; i < 40; i++) { g.strokeStyle = rgba(60, 44, 26, R(0.05, 0.1)); g.lineWidth = 1; const x = r.x + R(0, r.w), y = r.y + R(0, r.h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y + R(4, 10)); g.stroke(); }
  g.restore();
}

function paintSmall(g) {
  const p = TRIM.plain, t = TRIM.tar, rnd = mulberry(17), R = (a, b) => a + (b - a) * rnd();
  g.fillStyle = rgba(246, 241, 228); g.fillRect(p.x, p.y, p.w, p.h);
  for (let i = 0; i < 90; i++) { g.fillStyle = rgba(120, 100, 70, R(0.03, 0.07)); g.fillRect(p.x + R(0, p.w), p.y + R(0, p.h), R(2, 7), R(1, 2)); }
  g.fillStyle = rgba(86, 78, 74); g.fillRect(t.x, t.y, t.w, t.h);
  for (let i = 0; i < 60; i++) { g.fillStyle = rgba(30, 26, 24, R(0.15, 0.35)); g.beginPath(); g.ellipse(t.x + R(0, t.w), t.y + R(0, t.h), R(3, 12), R(2, 6), R(0, 3), 0, 7); g.fill(); }
}

function paintStrapAndLacing(g) {
  const s = TRIM.strap, l = TRIM.lacing, h2 = TRIM.stencilH2;
  g.fillStyle = rgba(238, 228, 204); g.fillRect(s.x, s.y, s.w, s.h);
  g.strokeStyle = rgba(90, 66, 36, 0.14); g.lineWidth = 1;
  for (let x = 0; x < s.w; x += 7) { g.beginPath(); g.moveTo(s.x + x, s.y); g.lineTo(s.x + x + 5, s.y + s.h); g.stroke(); }
  g.fillStyle = rgba(90, 66, 36, 0.18); g.fillRect(s.x, s.y, s.w, 5); g.fillRect(s.x, s.y + s.h - 5, s.w, 5);
  g.strokeStyle = rgba(70, 50, 28, 0.5); g.setLineDash([6, 4]); g.lineWidth = 1.5;
  for (const yy of [9, s.h - 9]) { g.beginPath(); g.moveTo(s.x, s.y + yy); g.lineTo(s.x + s.w, s.y + yy); g.stroke(); }
  g.setLineDash([]);
  g.fillStyle = rgba(236, 224, 196); g.fillRect(l.x, l.y, l.w, l.h);
  g.fillStyle = rgba(90, 66, 36, 0.16); g.fillRect(l.x, l.y, l.w, 6); g.fillRect(l.x, l.y + l.h - 6, l.w, 6);
  const step = 28;
  for (let x = 14; x < l.w; x += step) { // eyelets and the criss-cross cord
    g.strokeStyle = rgba(120, 88, 50); g.lineWidth = 3.2;
    g.beginPath(); g.moveTo(l.x + x, l.y + 14); g.lineTo(l.x + x + step, l.y + l.h - 14); g.moveTo(l.x + x + step, l.y + 14); g.lineTo(l.x + x, l.y + l.h - 14); g.stroke();
    g.strokeStyle = rgba(236, 214, 170, 0.6); g.lineWidth = 1;
    g.beginPath(); g.moveTo(l.x + x, l.y + 13); g.lineTo(l.x + x + step, l.y + l.h - 15); g.stroke();
  }
  for (let x = 14; x <= l.w; x += step) for (const yy of [14, l.h - 14]) {
    g.fillStyle = rgba(150, 130, 90); g.beginPath(); g.arc(l.x + x, l.y + yy, 5, 0, 7); g.fill();
    g.fillStyle = rgba(60, 44, 26); g.beginPath(); g.arc(l.x + x, l.y + yy, 2.6, 0, 7); g.fill();
  }
  g.fillStyle = rgba(244, 236, 214); g.fillRect(h2.x, h2.y, h2.w, h2.h);
  g.strokeStyle = rgba(70, 36, 30); g.lineWidth = 3; g.strokeRect(h2.x + 3, h2.y + 3, h2.w - 6, h2.h - 6);
  g.fillStyle = rgba(70, 36, 30); g.font = 'bold 40px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('H2 - NO FLAMES', h2.x + h2.w / 2, h2.y + h2.h / 2 + 2);
}

function paintRock(g) {
  ROCK_STRATA.forEach((name, i) => {
    const r = TRIM[name], rnd = mulberry(100 + i), R = (a, b) => a + (b - a) * rnd();
    const tones = [[[196, 188, 176], [176, 168, 158], [150, 142, 134], [210, 200, 186]], [[190, 176, 160], [166, 150, 134], [140, 126, 112], [208, 194, 172]], [[184, 186, 190], [160, 164, 170], [136, 140, 148], [206, 208, 212]]][i];
    g.fillStyle = rgba(...tones[1]); g.fillRect(r.x, r.y, r.w, r.h);
    let y = 0;
    while (y < r.h) { // strata: bands with a slowly wandering edge, each painted flat
      const h = R(10, 26), c = tones[Math.floor(rnd() * 4)];
      g.fillStyle = rgba(c[0] + R(-6, 6), c[1] + R(-6, 6), c[2] + R(-6, 6));
      g.beginPath(); g.moveTo(r.x, r.y + y);
      for (let x = 0; x <= r.w; x += 64) g.lineTo(r.x + x, r.y + y + R(-2.5, 2.5));
      g.lineTo(r.x + r.w, r.y + y + h + 3); g.lineTo(r.x, r.y + y + h + 3); g.closePath(); g.fill();
      g.strokeStyle = rgba(40, 34, 30, R(0.14, 0.28)); g.lineWidth = R(1, 2.2);
      g.beginPath(); g.moveTo(r.x, r.y + y); for (let x = 0; x <= r.w; x += 64) g.lineTo(r.x + x, r.y + y + R(-2.5, 2.5)); g.stroke();
      y += h;
    }
    for (let k = 0; k < 40; k++) { g.strokeStyle = rgba(40, 34, 30, R(0.1, 0.22)); g.lineWidth = R(0.8, 1.6); const x = r.x + R(0, r.w), yy = r.y + R(0, r.h); g.beginPath(); g.moveTo(x, yy); g.lineTo(x + R(-6, 6), yy + R(8, 24)); g.stroke(); }
  });
}

function paintFoam(g) {
  const r = TRIM.foam, rnd = mulberry(201), R = (a, b) => a + (b - a) * rnd();
  g.fillStyle = rgba(250, 253, 253, 0.95);
  g.beginPath(); g.moveTo(r.x, r.y + r.h * 0.5);
  for (let x = 0; x <= r.w; x += 32) { const hh = R(r.h * 0.28, r.h * 0.46); g.quadraticCurveTo(r.x + x + 16, r.y + r.h * 0.5 - hh, r.x + x + 32, r.y + r.h * 0.5 - R(0, 6)); }
  g.lineTo(r.x + r.w, r.y + r.h * 0.5 + 8);
  for (let x = r.w; x >= 0; x -= 40) { const hh = R(r.h * 0.2, r.h * 0.4); g.quadraticCurveTo(r.x + x - 20, r.y + r.h * 0.5 + hh, r.x + x - 40, r.y + r.h * 0.5 + R(0, 6)); }
  g.closePath(); g.fill();
  g.fillStyle = rgba(190, 222, 228, 0.5); g.fillRect(r.x, r.y + r.h * 0.5 + 4, r.w, 5);
  for (let i = 0; i < 60; i++) { g.fillStyle = rgba(250, 253, 253, 0.9); g.beginPath(); g.arc(r.x + R(0, r.w), r.y + R(8, r.h - 8), R(2, 6), 0, 7); g.fill(); }
}

// A2: the sea's foam stamps. Each shape is drawn as a flat mask, blurred (three box passes, radius 5) and written as white with the blurred mask in the alpha: a soft ramp that is 0.5 where the shape's edge was.
function paintSeaFoam(g) {
  const draw = {
    seaFoam0(c, w) { // a long arc: a smile that tapers to both ends
      const pts = [];
      for (let i = 0; i <= 40; i++) { const q = i / 40, u = 2 * q - 1, cy = 46 + 34 * (1 - u * u), wd = 40 * Math.pow(Math.sin(Math.PI * q), 0.7) + 2; pts.push([44 + (w - 88) * q, cy, wd]); }
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1] - pts[0][2] / 2);
      for (const [x, y, wd] of pts) c.lineTo(x, y - wd / 2);
      for (let i = pts.length - 1; i >= 0; i--) c.lineTo(pts[i][0], pts[i][1] + pts[i][2] / 2);
      c.closePath(); c.fill();
    },
    seaFoam1(c, w, h) { // a ring (round: the box is wider than the ring so the world box can be squat)
      c.beginPath(); c.arc(w / 2, h / 2, 46, 0, Math.PI * 2); c.arc(w / 2, h / 2, 29, 0, Math.PI * 2, true); c.fill('evenodd');
    },
    seaFoam2(c) { // two dashes, a long one over a shorter one, each a pointed lens, and a tick
      const lens = (x0, x1, y, wd) => { c.beginPath(); c.moveTo(x0, y); c.quadraticCurveTo((x0 + x1) / 2, y - wd, x1, y); c.quadraticCurveTo((x0 + x1) / 2, y + wd, x0, y); c.closePath(); c.fill(); };
      lens(60, 430, 46, 17); lens(250, 570, 86, 15); lens(470, 540, 38, 8);
    },
    seaFoam3(c, w, h) { // a broken ring: three quarters of a circle with round ends
      c.lineCap = 'round'; c.lineWidth = 16; c.beginPath(); c.arc(w / 2, h / 2, 37, 0.5, 0.5 + Math.PI * 1.55); c.stroke();
    },
  };
  const boxBlur = (a, w, h, r) => { // one separable box pass (running sums, clamped at the border)
    const tmp = new Float32Array(a.length), k = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) { let sum = 0; for (let x = -r; x <= r; x++) sum += a[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = sum * k; sum += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; } }
    for (let x = 0; x < w; x++) { let sum = 0; for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = sum * k; sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  };
  for (const name of SEA_FOAM) {
    const r = TRIM[name], cv = document.createElement('canvas');
    cv.width = r.w; cv.height = r.h;
    const c = cv.getContext('2d');
    c.fillStyle = '#fff'; c.strokeStyle = '#fff';
    draw[name](c, r.w, r.h);
    const src = c.getImageData(0, 0, r.w, r.h), m = new Float32Array(r.w * r.h);
    for (let i = 0; i < m.length; i++) m[i] = src.data[i * 4 + 3] / 255;
    for (let p = 0; p < 3; p++) boxBlur(m, r.w, r.h, 5);
    const out = g.createImageData(r.w, r.h);
    for (let i = 0; i < m.length; i++) { out.data[i * 4] = out.data[i * 4 + 1] = out.data[i * 4 + 2] = 255; out.data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(m[i] * 255))); }
    g.putImageData(out, r.x, r.y);
  }
}

function paintClouds(g) {
  CLOUD_DISCS.forEach((name, i) => {
    const r = TRIM[name], rnd = mulberry(300 + i), R = (a, b) => a + (b - a) * rnd();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, n = 5 + (i % 3);
    const blobs = [];
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.283 + R(-0.4, 0.4), d = R(0.12, 0.3) * r.w; blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, R(0.18, 0.3) * r.w]); }
    blobs.push([cx, cy, 0.3 * r.w]);
    g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip();
    g.fillStyle = rgba(248, 250, 252); for (const [x, y, rr] of blobs) { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-atop'; // the flat blue-grey underside, painted over the white only
    g.fillStyle = rgba(176, 196, 224, 0.75);
    g.beginPath(); g.ellipse(cx, cy + r.h * 0.34, r.w * 0.52, r.h * 0.2, 0, 0, 7); g.fill();
    g.fillStyle = rgba(255, 255, 255, 0.6); g.beginPath(); g.arc(cx - r.w * 0.1, cy - r.h * 0.15, r.w * 0.16, 0, 7); g.fill();
    g.restore();
  });
}

function paintFire(g) {
  const tongues = [ // per frame: [dx, height, lean] of three flames
    [[-0.22, 0.52, -0.05], [0, 0.82, 0.02], [0.2, 0.58, 0.07]], [[-0.2, 0.62, 0.04], [0.02, 0.74, -0.04], [0.22, 0.5, -0.06]],
    [[-0.24, 0.5, 0.06], [-0.02, 0.88, 0.05], [0.2, 0.64, 0.02]], [[-0.18, 0.6, -0.04], [0.03, 0.78, -0.06], [0.23, 0.54, 0.05]],
  ];
  FIRE_FRAMES.forEach((name, f) => {
    const r = TRIM[name], base = r.y + r.h * 0.92;
    for (const [layer, col, sc] of [[0, rgba(232, 92, 38), 1], [1, rgba(255, 168, 60), 0.74], [2, rgba(255, 236, 140), 0.42]]) {
      for (const [dx, h, lean] of tongues[f]) {
        const cx = r.x + r.w / 2 + dx * r.w, hh = h * r.h * 0.9 * (layer === 2 ? 0.7 : layer === 1 ? 0.85 : 1), w = 0.2 * r.w * sc;
        g.fillStyle = col; g.beginPath();
        g.moveTo(cx - w, base);
        g.quadraticCurveTo(cx - w * 1.1, base - hh * 0.5, cx + lean * r.w, base - hh);
        g.quadraticCurveTo(cx + w * 1.1, base - hh * 0.5, cx + w, base);
        g.closePath(); g.fill();
      }
    }
  });
}

function paintSmokeScorchHoles(g) {
  const sm = TRIM.smoke, rnd = mulberry(401), R = (a, b) => a + (b - a) * rnd();
  g.fillStyle = rgba(150, 150, 156, 0.72); g.beginPath(); g.arc(sm.x + 128, sm.y + 132, 100, 0, 7); g.fill();
  g.fillStyle = rgba(196, 196, 202, 0.7); g.beginPath(); g.arc(sm.x + 112, sm.y + 112, 70, 0, 7); g.fill();
  g.fillStyle = rgba(228, 228, 232, 0.6); g.beginPath(); g.arc(sm.x + 100, sm.y + 100, 36, 0, 7); g.fill();
  SCORCH.forEach((name, i) => { // ragged dark splats: an outer brown ring, a black middle
    const r = TRIM[name], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    for (const [rad, col] of [[104, rgba(70, 52, 38, 0.45)], [78, rgba(36, 28, 24, 0.7)], [44, rgba(16, 12, 10, 0.82)]]) {
      g.fillStyle = col; g.beginPath();
      const n = 14 + i * 2;
      for (let k = 0; k < n; k++) { const a = (k / n) * 6.283, d = rad * R(0.72, 1.05); k ? g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * (0.8 + 0.1 * i)) : g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
      g.closePath(); g.fill();
    }
  });
  HOLES.forEach((name, i) => { // a torn hole: light splintered rim, dark inside
    const r = TRIM[name], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    g.fillStyle = rgba(214, 186, 140); g.beginPath();
    const n = 12;
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.283, d = (k % 2 ? 36 : 56) * R(0.8, 1.1); k ? g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d) : g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
    g.closePath(); g.fill();
    g.fillStyle = rgba(28, 22, 20); g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * 6.283, d = 30 * R(0.75, 1.1) * (1 + 0.1 * i); k ? g.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85) : g.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85); }
    g.closePath(); g.fill();
  });
}

// a faint multiply-grain over the painted trims (a pattern fill: the graphics card does it)
function grainOver(g, noise, rects) {
  const pat = g.createPattern(noise, 'repeat');
  if (!pat) return;
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = pat;
  for (const n of rects) { const r = TRIM[n]; g.fillRect(r.x, r.y, r.w, r.h); }
  g.restore();
}

let cache = null;
export function getTrimSheet() {
  if (cache) return cache;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let canvas = null, texture = null, g = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    g = canvas.getContext('2d');
    if (!g) throw new Error('no 2D canvas');
    paintPlanks(g, 'woodA', { seed: 1, tone: [243, 228, 204], vary: 6, seam: rgba(70, 46, 26, 0.5), seamW: 3, buttW: 2.5 });
    paintPlanks(g, 'woodB', { seed: 2, tone: [234, 218, 190], vary: 7, seam: rgba(70, 46, 26, 0.5), seamW: 3, buttW: 2.5, knots: 0.4 });
    paintPlanks(g, 'woodC', { seed: 3, tone: [214, 198, 172], vary: 8, seam: rgba(40, 28, 18, 0.55), seamW: 3, buttW: 3, knots: 0.35 });
    paintPlanks(g, 'deck', { seed: 4, tone: [240, 226, 196], vary: 7, seam: rgba(34, 26, 22, 0.78), seamW: 2.6, buttW: 2.2, subs: 3, minLen: 130, maxLen: 300, knots: 0.12 });
    CANVAS_CELLS.forEach((n, i) => paintCanvasCell(g, n, 50 + i * 7));
    paintPatches(g); paintBrass(g); paintIron(g); paintRope(g); paintSmall(g); paintStrapAndLacing(g);
    paintRock(g); paintFoam(g); paintSeaFoam(g); paintClouds(g); paintFire(g); paintSmokeScorchHoles(g);
    // the slight grain
    const nc = document.createElement('canvas');
    nc.width = nc.height = 128;
    const ng = nc.getContext('2d'), id = ng.createImageData(128, 128), rnd = mulberry(999);
    for (let i = 0; i < id.data.length; i += 4) { const v = 236 + Math.floor(rnd() * 20); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    ng.putImageData(id, 0, 0);
    grainOver(g, nc, [...WOODS, 'deck', ...CANVAS_CELLS, 'brass', 'iron', 'rope', 'plain', 'strap', 'lacing']);
    texture = new THREE.CanvasTexture(canvas);
  } catch (e) {
    console.warn('trim sheet', e);
    texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  }
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  texture.name = 'trimSheet';
  cache = { texture, canvas, rects: TRIM, ms: (typeof performance !== 'undefined' ? performance.now() : 0) - t0, grain: [] };
  loadGrain(cache, g);
  return cache;
}

// Blend the old painted textures in as a faint grain when they load (art/textures/*.png, relative to the page: the host serves /art). Missing files change nothing.
const GRAIN_ON = { wood: ['woodA', 'woodB', 'deck'], darkwood: ['woodC'], canvas: CANVAS_CELLS, brass: ['brass'], charcoal: ['iron'], oxblood: [], enemycanvas: [] };
function loadGrain(sheet, g) {
  if (!g || typeof Image === 'undefined') return;
  for (const [file, targets] of Object.entries(GRAIN_ON)) {
    if (!targets.length) continue;
    const img = new Image();
    img.onload = () => {
      try {
        g.save();
        g.globalCompositeOperation = 'soft-light';
        g.globalAlpha = 0.5;
        for (const n of targets) { const r = TRIM[n]; g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); for (let x = r.x; x < r.x + r.w; x += 512) for (let y = r.y; y < r.y + r.h; y += 512) g.drawImage(img, x, y); g.restore(); }
        g.restore();
        sheet.grain.push(file);
        sheet.texture.needsUpdate = true;
      } catch { /* (a tainted or broken image: the sheet stays as painted) */ }
    };
    img.onerror = () => {};
    img.src = 'art/textures/' + file + '.png';
  }
}
