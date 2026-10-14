// THE VOID EEL'S PAINTINGS (3D.md section 42): made once with Canvas 2D (a seeded generator, so it is always the same eel). No files, nothing from the internet.
//   paintEelSkin(P)     the body's tiling skin (512 x 512, repeating along the tube): the back a near-black indigo, the flanks indigo-blue washing to violet and teal toward the pale belly, a soft diagonal sheen,
//                       faint fish scales, and on both flanks small CONSTELLATIONS: bright stars joined by thin lines, and a lateral line of tiny dots. Its glow twin (the toon material's emissive map) is black
//                       but for the stars, the lines and the lateral line. u runs round the tube (the belly at 0 and 1), v along it.
//   paintEelAtlas(P)    ONE 1024 x 1024 picture the head shares: SKULL (0..512 x 0..256: u round the head from the back, v from the neck to the snout), JAW (512..1024 x 0..256) and the white SWATCH where
//                       creatureKit.js SWATCH points (flat-coloured pieces take their colour from the vertices alone), and the glow twin
//   paintEelFin(P)      the translucent fin ridges (256 x 256 with alpha, repeating along u: a rib at every third of it; v runs from the root of the fin to its edge) and its glow twin (the ribs)
//   paintBlank(color)   a 4 px stand-in
// Everything is soft and faded on purpose: the colours come from the vertices, the texture only patterns and roughens them.
import { THREE } from './style.js';
import { rngOf } from './creatureKit.js';

export const AW = 1024, AH = 1024;
export const REG = { skull: [0, 0, 512, 256], jaw: [512, 0, 512, 256] };
export const atlasUV = (reg, u, v) => { const [x, y, w, h] = REG[reg]; return [(x + u * w) / AW, 1 - (y + v * h) / AH]; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c, repeat = false) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.needsUpdate = true; return t; };
const rgba = (hex, a) => { const c = new THREE.Color(hex); return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + a + ')'; };

// the colour across the body (t = 0 .. 1 round it): the belly pale at the ends of the range or in the middle (belly0), the back a near-black indigo opposite
function bodyGradient(g, x0, x1, P, belly0) {
  const gr = g.createLinearGradient(x0, 0, x1, 0);
  const stops = [[0, P.belly], [0.07, P.bellyDk], [0.15, P.violet], [0.25, P.flank], [0.34, P.body], [0.43, P.bodyDk], [0.5, P.back]];
  for (const [t, col] of stops) gr.addColorStop(belly0 ? t : 0.5 - t, col);
  for (let i = belly0 ? stops.length - 2 : stops.length - 1; i >= 0; i--) gr.addColorStop(belly0 ? 1 - stops[i][0] : 0.5 + stops[i][0], stops[i][1]);
  return gr;
}
// a star: a soft halo, a coloured core, a white heart (glow = for the emissive twin: a bigger, brighter halo)
function star(g, x, y, r, col, glow) {
  const h = g.createRadialGradient(x, y, 0, x, y, r * (glow ? 4.2 : 3));
  h.addColorStop(0, rgba(col, glow ? 0.95 : 0.4)); h.addColorStop(0.35, rgba(col, glow ? 0.45 : 0.18)); h.addColorStop(1, rgba(col, 0));
  g.fillStyle = h; g.beginPath(); g.arc(x, y, r * (glow ? 4.2 : 3), 0, Math.PI * 2); g.fill();
  g.fillStyle = glow ? col : rgba(col, 1); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, r * 0.45, 0, Math.PI * 2); g.fill();
}
// constellations inside a box of the picture (x0..x1, y0..y1): clusters of stars joined by thin lines; returns [{x, y, r, col, lines: [[x2, y2]]}]. sx / sy stretch the clusters.
function constellations(R, box, nClusters, cols, big) {
  const [x0, x1, y0, y1] = box, out = [];
  for (let k = 0; k < nClusters; k++) {
    const cx = x0 + (x1 - x0) * (0.2 + 0.6 * R()), cy = y0 + ((k + 0.5) / nClusters) * (y1 - y0) + (R() - 0.5) * 20, n = 3 + Math.floor(R() * 3);
    let prev = null;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, d = 12 + R() * 36, x = Math.max(x0, Math.min(x1, cx + Math.cos(a) * d * 0.9)), y = cy + Math.sin(a) * d * 1.2, major = i === 0;
      out.push({ x, y, r: major ? big * (0.8 + 0.4 * R()) : big * (0.32 + 0.22 * R()), col: cols[Math.floor(R() * R() * cols.length * 1.0)], link: prev });
      prev = out[out.length - 1];
    }
  }
  return out;
}
function drawStars(g, list, glow, W, H) {
  for (const oy of [-H, 0, H]) {
    g.lineCap = 'round';
    for (const s of list) if (s.link) { g.strokeStyle = rgba(glow ? '#7fe3f4' : '#7fe3f4', glow ? 0.6 : 0.5); g.lineWidth = glow ? 2.6 : 2; g.beginPath(); g.moveTo(s.link.x, s.link.y + oy); g.lineTo(s.x, s.y + oy); g.stroke(); }
    for (const s of list) star(g, s.x, s.y + oy, s.r, s.col, glow);
  }
  void W;
}
// soft diagonal bands of teal and violet (a sheen), repeated so the tile joins up
function sheen(g, W, H, P, R) {
  g.save();
  for (let k = 0; k < 7; k++) {
    const x = R() * W, y = R() * H, w = 26 + R() * 50, col = k % 2 ? P.teal : P.violet;
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      const gr = g.createLinearGradient(x + ox - w, 0, x + ox + w, 0);
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.5, rgba(col, 0.16)); gr.addColorStop(1, rgba(col, 0));
      g.save(); g.translate(x + ox, y + oy); g.rotate(0.5); g.translate(-(x + ox), -(y + oy)); g.fillStyle = gr; g.fillRect(x + ox - w, y + oy - 360, w * 2, 720); g.restore();
    }
  }
  g.restore();
}
function scales(g, x0, x1, W, H, alpha) {
  g.strokeStyle = 'rgba(200,210,255,' + alpha + ')'; g.lineWidth = 1.6;
  const sw = 30, sh = 22;
  for (let r = -1; r * sh < H + sh; r++) for (let c = -1; c * sw < (x1 - x0) + sw; c++) {
    const x = x0 + c * sw + (r & 1 ? sw / 2 : 0), y = r * sh;
    g.beginPath(); g.arc(x, y, sw * 0.56, 0.2, Math.PI - 0.2); g.stroke();
  }
  void W;
}

export function paintEelSkin(P, seed = 31) {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d'), gc = canvas(W, H), gg = gc.getContext('2d'), R = rngOf(seed);
  g.fillStyle = bodyGradient(g, 0, W, P, true); g.fillRect(0, 0, W, H);
  gg.fillStyle = '#000000'; gg.fillRect(0, 0, W, H);
  sheen(g, W, H, P, R);
  for (const side of [0, 1]) { // a teal wash along each flank (the iridescence)
    const gr = g.createLinearGradient(0, 0, W, 0), c0 = side ? 0.7 : 0.14;
    gr.addColorStop(c0, rgba(P.teal, 0)); gr.addColorStop(c0 + 0.08, rgba(P.teal, 0.3)); gr.addColorStop(c0 + 0.16, rgba(P.teal, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  scales(g, 0, W, W, H, 0.1);
  // the stars (a flank each: the camera sees one or the other), mirrored; the lateral line
  const cols = [P.dot, P.dot, P.dotGold, P.dotPale, P.dot];
  const L = constellations(R, [W * 0.17, W * 0.36, 0, H], 5, cols, 17);
  const Rr = L.map((s) => ({ ...s, x: W - s.x, link: null }));
  L.forEach((s, i) => { if (s.link) Rr[i].link = Rr[L.indexOf(s.link)]; });
  for (const [gx, glow] of [[g, false], [gg, true]]) { drawStars(gx, L, glow, W, H); drawStars(gx, Rr, glow, W, H); }
  for (const x of [W * 0.145, W * 0.855]) for (let y = 6; y < H; y += 21) for (const [gx, glow] of [[g, false], [gg, true]]) { gx.fillStyle = glow ? P.dot : rgba(P.dot, 0.9); gx.beginPath(); gx.arc(x, y, glow ? 3.4 : 3, 0, Math.PI * 2); gx.fill(); }
  // a faint glow down the middle of the belly (a seam of light) and along the back's edge
  for (const x of [W * 0.02, W * 0.98]) { gg.fillStyle = 'rgba(80,200,230,0.12)'; gg.fillRect(x - 12, 0, 24, H); }
  return { map: tex(c, true), glow: tex(gc, true) };
}

export function paintEelAtlas(P, seed = 53) {
  const c = canvas(AW, AH), g = c.getContext('2d'), gc = canvas(AW, AH), gg = gc.getContext('2d'), R = rngOf(seed);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, AW, AH);
  gg.fillStyle = '#000000'; gg.fillRect(0, 0, AW, AH);
  const region = (name, belly0, fn) => {
    const [x, y, w, h] = REG[name];
    for (const ctx of [g, gg]) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); }
    g.fillStyle = bodyGradient(g, 0, w, P, belly0); g.fillRect(0, 0, w, h);
    sheen(g, w, h, P, R);
    scales(g, 0, w, w, h, 0.1);
    fn(w, h);
    for (const ctx of [g, gg]) ctx.restore();
  };
  // the skull: the back (u 0 and 1) near-black, the pale throat at u 0.5; constellations on both cheeks, a ridge of small stars along the crown
  region('skull', false, (w, h) => {
    const cols = [P.dot, P.dot, P.dotGold, P.dotPale];
    const L = constellations(R, [w * 0.14, w * 0.36, 0, h], 4, cols, 11);
    const Rr = L.map((s) => ({ ...s, x: w - s.x, link: null }));
    L.forEach((s, i) => { if (s.link) Rr[i].link = Rr[L.indexOf(s.link)]; });
    for (const [gx, glow] of [[g, false], [gg, true]]) { drawStars(gx, L, glow, w, h); drawStars(gx, Rr, glow, w, h); }
    for (let y = 8; y < h; y += 14) for (const [gx, glow] of [[g, false], [gg, true]]) { gx.fillStyle = glow ? P.dotGold : rgba(P.dotGold, 0.9); gx.beginPath(); gx.arc(w * 0.03, y, glow ? 2.4 : 2.1, 0, Math.PI * 2); gx.fill(); gx.beginPath(); gx.arc(w * 0.97, y, glow ? 2.4 : 2.1, 0, Math.PI * 2); gx.fill(); }
  });
  // the jaw: pale underneath (u 0.5), darker on the lip, a few stars
  region('jaw', false, (w, h) => {
    const L = constellations(R, [w * 0.15, w * 0.35, 0, h], 3, [P.dot, P.dotPale, P.dot], 10);
    const Rr = L.map((s) => ({ ...s, x: w - s.x, link: null }));
    L.forEach((s, i) => { if (s.link) Rr[i].link = Rr[L.indexOf(s.link)]; });
    for (const [gx, glow] of [[g, false], [gg, true]]) { drawStars(gx, L, glow, w, h); drawStars(gx, Rr, glow, w, h); }
  });
  g.fillStyle = '#ffffff'; g.fillRect(512, 640, 512, 384); // the plain swatch
  return { map: tex(c), glow: tex(gc) };
}

export function paintEelFin(P, seed = 77) {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), gc = canvas(W, H), gg = gc.getContext('2d'), R = rngOf(seed);
  g.clearRect(0, 0, W, H); gg.fillStyle = '#000000'; gg.fillRect(0, 0, W, H);
  // the membrane: three-fifths opaque and teal at the root (the canvas bottom: v 0), thinning to a pale violet at the edge (the top)
  const gr = g.createLinearGradient(0, H, 0, 0);
  gr.addColorStop(0, rgba(P.fin, 0.85)); gr.addColorStop(0.45, rgba(P.finDk, 0.5)); gr.addColorStop(1, rgba(P.finEdge, 0.2));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // the ribs: a bright line at every third, tapering toward the edge
  for (const rx of [0, W / 3, (2 * W) / 3, W]) for (let y = 0; y < H; y += 4) {
    const u = 1 - y / H, a = 0.35 + 0.65 * u, w = 3 + 6 * u;
    g.fillStyle = rgba(P.rib, a); g.fillRect(rx - w / 2, y, w, 4);
    gg.fillStyle = rgba(P.rib, 0.25 + 0.75 * u); gg.fillRect(rx - w / 2, y, w, 4);
  }
  // specks of starlight on the membrane
  for (let i = 0; i < 9; i++) { const x = R() * W, y = R() * H * 0.8, r = 2 + R() * 2.4; g.fillStyle = rgba(P.dotPale, 0.8); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); gg.fillStyle = rgba(P.dot, 0.9); gg.beginPath(); gg.arc(x, y, r * 1.3, 0, Math.PI * 2); gg.fill(); }
  // a bright thread along the edge
  g.fillStyle = rgba(P.rib, 0.6); g.fillRect(0, 0, W, 5); gg.fillStyle = rgba(P.rib, 0.5); gg.fillRect(0, 0, W, 5);
  return { map: tex(c, true), glow: tex(gc, true) };
}

export function paintBlank(color = '#ffffff') {
  const c = canvas(4, 4), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 4, 4);
  return tex(c);
}
