// THE THUNDERBIRD'S PLUMAGE (3D.md section 26): the paintings the bird is wrapped in, made once with Canvas 2D (a seeded generator, so it is always the same bird). No files, nothing from the internet.
//   paintBirdAtlas(P)  the BODY atlas, the same layout as the Kraken's head atlas (creatureKit.js ATLAS): the top 640 rows are the torso (x = round the body, 0 = the belly's middle line, 0.25 = the near flank,
//                      0.5 = the back; y = along it, tail to breast), the lower right is the plain white swatch the flat pieces point at.
//   paintBirdLimb(P)   the skin of a tube (neck, tail stalk, wing arms, legs): x = round it (0 and 1 = the belly side), y = along it.
// Each comes with a GLOW twin: the same layout, black but for the thin storm-blue veins of lightning that run under the feathers (the toon material's emissive map: the view scales it by how charged the bird is).
// Feathers are drawn from the tail forward, each row over the one behind it, every feather a rounded shield with its tip toward the tail, a dark rim, a pale inner arc and a shaft: the way real plumage lies.
import { THREE } from './style.js';
import { ATLAS, rngOf } from './creatureKit.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.needsUpdate = true; return t; };
const mix = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k))).getHexString();
const lift = (a, k) => '#' + new THREE.Color(a).multiplyScalar(k).getHexString();
const smooth = (a, b, v) => { const u = Math.max(0, Math.min(1, (v - a) / (b - a))); return u * u * (3 - 2 * u); };

// a field of feathers over a rect (x0, y0, w, h): rows from the top (the tail end) down, each row drawn over the one above it. toneAt(cx, y) -> the colour of the feather there.
function feathers(g, R, x0, y0, w, h, fw, fh, toneAt, edge, wrapX) {
  const step = fh * 0.46, rows = Math.ceil(h / step) + 2, cols = Math.ceil(w / fw) + 2;
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * step, off = (r % 2) * fw * 0.5;
    for (let c = -1; c < cols; c++) {
      const cx = x0 + c * fw + off + (R() - 0.5) * 2;
      for (const ox of wrapX ? [-w, 0, w] : [0]) {
        const px = cx + ox;
        if (px + fw < x0 || px - fw > x0 + w) continue;
        const shape = (k, dy) => { // a shield: flat base at the bottom, rounded tip at the top
          g.beginPath();
          g.moveTo(px - fw * 0.5 * k, y + fh * k + dy);
          g.lineTo(px - fw * 0.5 * k, y + fh * 0.4 * k + dy);
          g.bezierCurveTo(px - fw * 0.5 * k, y + fh * 0.1 * k + dy, px - fw * 0.22 * k, y + dy, px, y + dy);
          g.bezierCurveTo(px + fw * 0.22 * k, y + dy, px + fw * 0.5 * k, y + fh * 0.1 * k + dy, px + fw * 0.5 * k, y + fh * 0.4 * k + dy);
          g.lineTo(px + fw * 0.5 * k, y + fh * k + dy);
          g.closePath();
        };
        const col = toneAt(px, y);
        shape(1, 0);
        g.fillStyle = col; g.fill();
        g.strokeStyle = edge; g.lineWidth = 3; g.stroke();
        g.save(); shape(1, 0); g.clip();
        g.strokeStyle = lift(col, 1.35); g.globalAlpha = 0.55; g.lineWidth = 2.4; // the pale inner arc near the tip
        shape(0.8, fh * 0.06); g.stroke();
        g.globalAlpha = 0.5; g.strokeStyle = lift(col, 0.62); g.lineWidth = 1.8; // the shaft
        g.beginPath(); g.moveTo(px, y + fh * 0.12); g.lineTo(px, y + fh); g.stroke();
        g.fillStyle = edge; g.globalAlpha = 0.28; g.fillRect(px - fw, y + fh * 0.86, fw * 2, fh * 0.3); // the next row's shadow
        g.restore();
        g.globalAlpha = 1;
      }
    }
  }
}

// the veins of lightning: jagged paths that fork now and then, drawn with a wide soft stroke and a thin bright one
function veins(g, R, x0, y0, w, h, n, wid) {
  const draw = (x, y, a, steps, width) => {
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      a += (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.9);
      x += Math.cos(a) * (12 + R() * 24); y += Math.sin(a) * (12 + R() * 24);
      pts.push([x, y]);
      if (R() < 0.18 && width > 1.4) draw(x, y, a + (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.6), 2 + ((R() * 3) | 0), width * 0.65);
    }
    for (const [col, k] of [['#4aa8ff', 1], ['#a8e4ff', 0.55], ['#ffffff', 0.22]]) {
      g.strokeStyle = col; g.lineWidth = Math.max(1, width * k); g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    }
  };
  for (let i = 0; i < n; i++) draw(x0 + R() * w, y0 + R() * h, R() * Math.PI * 2, 3 + ((R() * 4) | 0), wid * (0.7 + R() * 0.7));
}

export function paintBirdAtlas(P, seed = 41) {
  const W = ATLAS.W, H = ATLAS.H, M = ATLAS.mantle.y1, R = rngOf(seed);
  const c = canvas(W, H), g = c.getContext('2d'), e = canvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const back = [P.skinDark, mix(P.skinDark, P.skin, 0.4), lift(P.skin, 0.88)];
  const flank = [P.skin, lift(P.skin, 1.12), mix(P.skin, P.spotLight, 0.3), lift(P.skin, 0.95)];
  const pale = [P.belly, lift(P.belly, 0.94), mix(P.belly, '#ffffff', 0.5), mix(P.belly, P.spotLight, 0.18)];
  const gold = [P.goldPale, P.gold, mix(P.gold, '#ffffff', 0.35)];
  // the colour of the feather at (x, y): dark on the back, slate on the flank, cream on the belly; the breast is cream far round the sides; a few gold ones on the shoulders
  const tone = (x, y) => {
    const u = x / W, d = Math.abs(((u + 0.5) % 1) - 0.5) * 2, v = y / M; // d: 0 on the belly line, 1 on the back's middle
    const pick = (a) => a[(R() * a.length) | 0];
    if (R() < 0.07 && v > 0.45 && v < 0.78 && d > 0.45) return pick(gold);
    if (d < 0.26 + 0.5 * smooth(0.55, 0.95, v)) return pick(pale); // (the cream belly, and the breast which is cream far round the sides)
    if (d > 0.7) return pick(back);
    return pick(flank);
  };
  g.fillStyle = P.skinDark; g.fillRect(0, 0, W, H);
  feathers(g, R, 0, -30, W, M + 60, 50, 70, tone, P.inkLeaf, true);
  // a dark stripe along the very back and a paler line under the wing roots
  const bk = g.createLinearGradient(W * 0.4, 0, W * 0.6, 0);
  bk.addColorStop(0, 'rgba(14,18,40,0)'); bk.addColorStop(0.5, 'rgba(14,18,40,0.5)'); bk.addColorStop(1, 'rgba(14,18,40,0)');
  g.fillStyle = bk; g.fillRect(W * 0.36, 0, W * 0.28, M);
  veins(ge, R, W * 0.12, 0, W * 0.76, M, 22, 4.4);
  veins(ge, R, W * 0.2, M * 0.2, W * 0.6, M * 0.7, 12, 3.6);
  g.fillStyle = '#ffffff'; g.fillRect(ATLAS.fin.x1, M, W - ATLAS.fin.x1, H - M); // the plain swatch
  ge.fillStyle = '#000'; ge.fillRect(ATLAS.fin.x1, M, W - ATLAS.fin.x1, H - M);
  return { map: tex(c), glow: tex(e) };
}

export function paintBirdLimb(P, seed = 43) {
  const W = 256, H = 512, R = rngOf(seed);
  const c = canvas(W, H), g = c.getContext('2d'), e = canvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.fillStyle = P.skinDark; g.fillRect(0, 0, W, H);
  const dark = [P.skinDark, mix(P.skinDark, P.skin, 0.4), lift(P.skin, 0.85)];
  const mid = [P.skin, lift(P.skin, 1.12), mix(P.skin, P.spotLight, 0.3)];
  const pale = [P.belly, lift(P.belly, 0.94), mix(P.belly, '#ffffff', 0.5)];
  const tone = (x) => { const u = x / W, d = Math.abs(((u + 0.5) % 1) - 0.5) * 2, a = d > 0.66 ? dark : d > 0.24 ? mid : pale; return a[(R() * a.length) | 0]; };
  feathers(g, R, 0, -30, W, H + 60, 38, 56, tone, P.inkLeaf, true);
  veins(ge, R, W * 0.15, 0, W * 0.7, H, 8, 3.6);
  return { map: tex(c), glow: tex(e) };
}
