// THE RIME WYRM'S HIDE (3D.md section 40): the painting the serpent is wrapped in, made once with Canvas 2D (a seeded generator, so it is always the same Wyrm). No files, nothing from the internet.
//   paintWyrmHide(P)   a TILING hide texture (512 px): rows of overlapping fish scales in dark blue-grey with a pale highlight crescent on each, a darker dorsal stripe at the top and bottom edges (the tube's back is
//                      v = 0 and 1), and a band of wide pale belly plates across the middle (v = 0.5: the tube's belly, the collar's ship-facing side). x runs ALONG the body, y round it. A small white square (the swatch,
//                      where creatureKit.js SWATCH points) lets flat-coloured pieces (horns, fangs, eyes, ice) take their colour from the vertices alone.
//   its GLOW twin      black but for thin cold-cyan lines in the seams between the scales and across the belly plates (the toon material's emissive map: the view sets how brightly they glow).
import { THREE } from './style.js';
import { rngOf } from './creatureKit.js';

export const HIDE_PX = 512, HIDE_TILE = 1250; // (one tile covers this many world px along a segment; round it, one tile is one turn)
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.needsUpdate = true; return t; };

export function paintWyrmHide(P, seed = 41) {
  const S = HIDE_PX, R = rngOf(seed), c = canvas(S, S), g = c.getContext('2d'), gc = canvas(S, S), gg = gc.getContext('2d');
  g.fillStyle = P.hide; g.fillRect(0, 0, S, S);
  gg.fillStyle = '#000000'; gg.fillRect(0, 0, S, S);
  const wrap = (ctx, fn) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); } };
  // the dorsal stripe: darker at v = 0 and v = 1 (the top of the tube)
  const dg = g.createLinearGradient(0, 0, 0, S * 0.2);
  dg.addColorStop(0, P.hideDk); dg.addColorStop(1, 'rgba(61,86,111,0)');
  g.fillStyle = dg; g.fillRect(0, 0, S, S * 0.2);
  const dg2 = g.createLinearGradient(0, S * 0.8, 0, S);
  dg2.addColorStop(0, 'rgba(61,86,111,0)'); dg2.addColorStop(1, P.hideDk);
  g.fillStyle = dg2; g.fillRect(0, S * 0.8, S, S * 0.2);
  // the scales: shingled rows (a lower row overlaps the one above), a half step between rows
  const ROWS = 16, COLS = 16, cw = S / COLS, ch = S / ROWS;
  for (let r = 0; r < ROWS; r++) {
    const y = r * ch + ch * 0.5, belly = Math.abs(y / S - 0.5) < 0.1;
    if (belly) continue;
    for (let k = 0; k < COLS; k++) {
      const x = k * cw + (r % 2 ? cw * 0.5 : 0) + cw * 0.5, tone = R(), rad = cw * 0.66;
      wrap(g, () => {
        g.beginPath(); g.ellipse(x, y, rad * 0.78, rad, 0, 0, Math.PI * 2);
        g.fillStyle = tone < 0.25 ? P.hideLt : tone < 0.7 ? P.hide : P.hideDk;
        g.globalAlpha = 0.9; g.fill(); g.globalAlpha = 1;
        g.lineWidth = 2; g.strokeStyle = P.hideDk; g.stroke();
        g.beginPath(); g.ellipse(x - 1, y - rad * 0.28, rad * 0.55, rad * 0.55, 0, Math.PI * 1.1, Math.PI * 1.9);
        g.lineWidth = 2.4; g.strokeStyle = 'rgba(190,225,245,0.45)'; g.stroke();
      });
      wrap(gg, () => { // the cold light in the seam under the lower edge of a scale
        gg.beginPath(); gg.ellipse(x, y, rad * 0.78, rad, 0, Math.PI * 0.12, Math.PI * 0.88);
        gg.lineWidth = 2.2; gg.strokeStyle = 'rgba(120,225,255,0.8)'; gg.stroke();
      });
    }
  }
  // the belly: wide pale plates across the middle band, with dark seams (and a seam of cold light between them)
  const b0 = S * 0.4, b1 = S * 0.6;
  g.fillStyle = P.belly; g.fillRect(0, b0, S, b1 - b0);
  g.fillStyle = P.bellyDk; g.fillRect(0, b0, S, 7); g.fillRect(0, b1 - 7, S, 7);
  const pw = S / 8;
  for (let k = 0; k < 8; k++) {
    const x = k * pw;
    g.fillStyle = P.bellyDk; g.fillRect(x - 2, b0, 4, b1 - b0);
    g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x + 6, b0 + 14, pw * 0.5, 7);
    gg.fillStyle = 'rgba(120,225,255,0.7)'; gg.fillRect(x - 2, b0 + 4, 4, b1 - b0 - 8);
  }
  // a few frost speckles on the back
  for (let i = 0; i < 60; i++) {
    const x = R() * S, y = (R() < 0.5 ? R() * 0.28 : 1 - R() * 0.28) * S, r = 1.5 + R() * 3;
    g.fillStyle = 'rgba(235,248,255,' + (0.25 + R() * 0.3) + ')';
    wrap(g, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  }
  // the swatch: a plain white square at (0.75, 0.8125) of the tile (creatureKit.js SWATCH)
  g.fillStyle = '#ffffff'; g.fillRect(S * 0.75 - 16, S * 0.8125 - 16, 32, 32);
  gg.fillStyle = '#000000'; gg.fillRect(S * 0.75 - 16, S * 0.8125 - 16, 32, 32);
  return { map: tex(c), glow: tex(gc) };
}

// a 4 px stand-in for the tube skin the generic view makes (the Wyrm has no tubes), and the ice's plain white
export function paintBlank(color = '#ffffff') {
  const c = canvas(4, 4), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
