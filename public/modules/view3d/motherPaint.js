// THE MYCELIAL MOTHER'S PAINTINGS (3D.md section 41): made once with Canvas 2D (a seeded generator, so it is always the same Mother). No files, nothing from the internet.
//   paintMotherAtlas(P)   ONE 2048 x 1024 picture the whole body shares (the toon material takes one map), and its GLOW twin (the toon material's emissive map: black but for the bioluminescent parts):
//       CAP    (0..1024 x 0..512)       the violet cap: a soft gradient, big cream spots with a glowing teal heart, growth rings near the rim, speckle. u runs down the cap, v round it (the back is the seam)
//       HEAD   (1024..2048 x 0..512)    the furry face: lilac with short darker hair strokes, paler in the middle, a few glowing dots
//       FORE   (0..1024 x 512..1024)    the forewing: s (the span, root to tip) across, c (leading edge to trailing edge) down: plum furry root, lilac field, rose veins, a cream margin with dark lunules, a big EYESPOT
//       HIND   (1024..1536 x 512..1024) the hindwing: warmer (rose and peach), its own eyespot
//       GILL   (1536..2048 x 512..800)  the gill skirt: pale pink pleats with dark creases (x across the pleats, y from the cap down to the hem)
//       SWATCH (the white square at 0.75, 0.8125 where creatureKit.js SWATCH points)  flat-coloured pieces take their colour from the vertices alone
//   paintTendrilSkin(P)   the tendril's tiling skin (256 x 512): teal, a darker back, rows of glowing dots and thin growth bands; its glow twin carries the dots
//   paintBlank(color)     a 4 px stand-in
// Everything is soft and faded on purpose: the colours come from the vertices, the texture only roughens and patterns them.
import { THREE } from './style.js';
import { rngOf } from './creatureKit.js';

export const AW = 2048, AH = 1024;
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c, repeat = false) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.needsUpdate = true; return t; };
// the atlas coordinates of each region (canvas pixels, y down) and the uv a (u, v) of the region lands at (three's v runs up)
export const REG = { cap: [0, 0, 1024, 512], head: [1024, 0, 1024, 512], fore: [0, 512, 1024, 512], hind: [1024, 512, 512, 512], gill: [1536, 512, 512, 288] };
export const atlasUV = (reg, u, v) => { const [x, y, w, h] = REG[reg]; return [(x + u * w) / AW, 1 - (y + v * h) / AH]; };

export function paintMotherAtlas(P, seed = 71) {
  const R = rngOf(seed), c = canvas(AW, AH), g = c.getContext('2d'), gc = canvas(AW, AH), gg = gc.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, AW, AH);
  gg.fillStyle = '#000000'; gg.fillRect(0, 0, AW, AH);
  const clip = (ctx, reg, fn) => { const [x, y, w, h] = REG[reg]; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.translate(x, y); fn(w, h); ctx.restore(); };
  const wrapX = (ctx, w, fn) => { for (const ox of [-w, 0, w]) { ctx.save(); ctx.translate(ox, 0); fn(); ctx.restore(); } };
  const blob = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };

  // ---- the CAP: dark near the stem, soft violet over the dome, paler toward the rim; spots; rings ----
  clip(g, 'cap', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, P.capDk); gr.addColorStop(0.3, P.cap); gr.addColorStop(0.8, P.capLt); gr.addColorStop(1, P.cap);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { // speckle: tiny darker and paler blots
      const x = R() * w, y = R() * h, r = 2 + R() * R() * 9;
      g.fillStyle = R() < 0.6 ? 'rgba(40,26,80,' + (0.1 + R() * 0.2) + ')' : 'rgba(230,214,255,' + (0.1 + R() * 0.2) + ')';
      wrapX(g, w, () => blob(g, x, y, r, r * (0.6 + R() * 0.6), R() * 3));
    }
    g.strokeStyle = 'rgba(40,24,84,0.2)'; g.lineWidth = 4; // growth rings: bands round the dome
    for (let k = 0; k < 6; k++) { const y = h * (0.28 + k * 0.1); g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + k) * 4); g.stroke(); }
  });
  const capSpots = []; // [x, y, r] shared by the cap and its glow twin
  for (let i = 0; i < 30; i++) {
    const r = 22 + R() * R() * 64, y = 90 + R() * 360, x = R() * 1024;
    capSpots.push([x, y, r]);
  }
  clip(g, 'cap', (w) => {
    for (const [x, y, r] of capSpots) wrapX(g, w, () => {
      g.fillStyle = 'rgba(30,20,60,0.5)'; blob(g, x, y + 3, r * 1.08, r * 1.08 * 0.8);
      g.fillStyle = P.spot; blob(g, x, y, r, r * 0.8);
      g.fillStyle = 'rgba(255,255,255,0.5)'; blob(g, x - r * 0.3, y - r * 0.28, r * 0.4, r * 0.24, -0.4);
      g.fillStyle = P.spotCore; blob(g, x, y, r * 0.34, r * 0.28);
    });
  });
  clip(gg, 'cap', (w) => {
    for (const [x, y, r] of capSpots) wrapX(gg, w, () => { gg.fillStyle = 'rgba(80,230,190,0.25)'; blob(gg, x, y, r * 0.9, r * 0.72); gg.fillStyle = P.spotGlow; blob(gg, x, y, r * 0.32, r * 0.26); });
    gg.strokeStyle = 'rgba(80,220,190,0.22)'; gg.lineWidth = 4;
    for (let k = 0; k < 6; k++) { const y = 512 * (0.28 + k * 0.1); gg.beginPath(); gg.moveTo(0, y); for (let x = 0; x <= w; x += 64) gg.lineTo(x, y + Math.sin(x * 0.02 + k) * 4); gg.stroke(); }
  });

  // ---- the HEAD: lilac fur ----
  clip(g, 'head', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, P.furDk); gr.addColorStop(0.45, P.fur); gr.addColorStop(1, P.furDk);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { // hair strokes, mostly pointing down the face
      const x = R() * w, y = R() * h, l = 10 + R() * 22, a = Math.PI / 2 + (R() - 0.5) * 0.9;
      g.strokeStyle = R() < 0.5 ? 'rgba(90,66,140,' + (0.18 + R() * 0.2) + ')' : 'rgba(250,240,255,' + (0.16 + R() * 0.24) + ')';
      g.lineWidth = 2 + R() * 2.5; g.lineCap = 'round';
      wrapX(g, w, () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); });
    }
  });
  clip(gg, 'head', (w, h) => { for (let i = 0; i < 40; i++) { const x = R() * w, y = R() * h; gg.fillStyle = 'rgba(120,255,214,0.5)'; wrapX(gg, w, () => blob(gg, x, y, 5, 5)); } });

  // ---- the WINGS ----
  const wing = (reg, o) => {
    clip(g, reg, (w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0); // root to tip
      gr.addColorStop(0, o.root); gr.addColorStop(0.16, o.dk); gr.addColorStop(0.5, o.mid); gr.addColorStop(0.9, o.lt); gr.addColorStop(1, o.rim);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // veins: from the root toward the margin
      g.lineCap = 'round';
      for (let k = 0; k < 9; k++) {
        const ty = (k + 0.5) / 9 * h * 1.15 - h * 0.08, bend = (R() - 0.5) * 40;
        g.strokeStyle = o.vein; g.lineWidth = 5; g.globalAlpha = 0.55;
        g.beginPath(); g.moveTo(w * 0.02, h * 0.1); g.quadraticCurveTo(w * 0.5, h * 0.1 + (ty - h * 0.1) * 0.55 + bend, w * 0.99, ty); g.stroke();
      }
      g.globalAlpha = 1;
      for (let i = 0; i < 360; i++) { // fur: short strokes thick near the root and thin out toward the tip
        const sx = Math.pow(R(), 2.2) * w * 0.55, y = R() * h, l = 12 + R() * 22;
        g.strokeStyle = R() < 0.5 ? 'rgba(70,40,110,' + (0.16 + R() * 0.2) + ')' : 'rgba(255,240,255,' + (0.14 + R() * 0.22) + ')';
        g.lineWidth = 2.2 + R() * 2; g.beginPath(); g.moveTo(sx, y); g.lineTo(sx + l, y + (R() - 0.5) * 8); g.stroke();
      }
      g.fillStyle = o.cream; // the pale margin band along the outer edge
      g.beginPath(); g.moveTo(w * 0.86, 0); g.quadraticCurveTo(w * 0.99, h * 0.5, w * 0.86, h); g.lineTo(w, h); g.lineTo(w, 0); g.closePath(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
      for (let k = 0; k < 7; k++) { g.fillStyle = o.lune; blob(g, w * (0.9 + 0.03 * Math.sin(k * 1.7)), h * (0.08 + k * 0.14), 16, 22, 0.2); } // dark lunules along the margin
      // the eyespot: concentric rings, a dark pupil, a white glint
      const [ex, ey, er] = o.eye;
      for (const [k, col] of [[1.0, o.eyeOut], [0.8, o.eyeGold], [0.62, o.eyeTeal], [0.44, o.eyeDk], [0.2, '#120a1c']]) { g.fillStyle = col; blob(g, ex * w, ey * h, er * k * 1.25, er * k); }
      g.fillStyle = 'rgba(255,255,255,0.85)'; blob(g, ex * w - er * 0.18, ey * h - er * 0.2, er * 0.12, er * 0.08, -0.5);
    });
    clip(gg, reg, (w, h) => {
      const [ex, ey, er] = o.eye;
      gg.fillStyle = 'rgba(80,225,190,0.35)'; blob(gg, ex * w, ey * h, er * 0.78 * 1.25, er * 0.78);
      gg.fillStyle = 'rgba(0,0,0,1)'; blob(gg, ex * w, ey * h, er * 0.5 * 1.25, er * 0.5);
      gg.strokeStyle = 'rgba(110,255,214,0.9)'; gg.lineWidth = 6; gg.beginPath(); gg.ellipse(ex * w, ey * h, er * 0.62 * 1.25, er * 0.62, 0, 0, Math.PI * 2); gg.stroke();
      for (let k = 0; k < 7; k++) { gg.fillStyle = 'rgba(120,255,214,0.55)'; blob(gg, w * (0.9 + 0.03 * Math.sin(k * 1.7)), h * (0.08 + k * 0.14), 5, 7); }
    });
  };
  wing('fore', { root: P.wingDk, dk: P.wingDk, mid: P.wing, lt: P.wingLt, rim: P.wingLt, vein: P.wingRose, cream: P.wingCream, lune: 'rgba(60,34,96,0.55)', eye: [0.64, 0.56, 130], eyeOut: P.wingDk, eyeGold: P.wingGold, eyeTeal: P.eyeSpotTeal, eyeDk: P.wingDk });
  wing('hind', { root: P.wingDk, dk: P.wingRoseDk, mid: P.wingRose, lt: P.wingPeach, rim: P.wingPeach, vein: P.wingDk, cream: P.wingCream, lune: 'rgba(110,50,80,0.5)', eye: [0.6, 0.5, 100], eyeOut: P.wingRoseDk, eyeGold: P.wingGold, eyeTeal: P.eyeSpotTeal, eyeDk: P.wingDk });

  // ---- the GILL skirt: pale pink pleats with dark creases ----
  clip(g, 'gill', (w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, P.gillDk); gr.addColorStop(0.35, P.gill); gr.addColorStop(1, P.gillEdge);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const N = 36, pw = w / N;
    for (let k = 0; k < N; k++) {
      g.fillStyle = 'rgba(120,60,110,0.55)'; g.fillRect(k * pw - 3, 0, 6, h);
      g.fillStyle = 'rgba(255,240,248,0.35)'; g.fillRect(k * pw + pw * 0.3, h * 0.1, pw * 0.22, h * 0.8);
    }
    g.fillStyle = 'rgba(120,60,110,0.5)'; g.fillRect(0, h - 8, w, 8); // the hem
  });
  clip(gg, 'gill', (w, h) => { gg.fillStyle = 'rgba(120,255,214,0.32)'; gg.fillRect(0, h - 14, w, 14); for (let k = 0; k < 36; k++) { gg.fillStyle = 'rgba(120,255,214,0.5)'; gg.fillRect(k * (w / 36) - 2, h - 40, 4, 40); } });

  // ---- the swatch ----
  g.fillStyle = '#ffffff'; g.fillRect(AW * 0.75 - 16, AH * 0.8125 - 16, 32, 32);
  gg.fillStyle = '#000000'; gg.fillRect(AW * 0.75 - 16, AH * 0.8125 - 16, 32, 32);
  return { map: tex(c), glow: tex(gc) };
}

// ---- the tendril skin: u runs round the tube (0 and 1 are the belly side, 0.5 the back), v along it ----
export function paintTendrilSkin(P, seed = 83) {
  const W = 256, H = 512, R = rngOf(seed), c = canvas(W, H), g = c.getContext('2d'), gc = canvas(W, H), gg = gc.getContext('2d');
  g.fillStyle = P.tendril; g.fillRect(0, 0, W, H);
  gg.fillStyle = '#000000'; gg.fillRect(0, 0, W, H);
  const wrap = (ctx, fn) => { for (const oy of [-H, 0, H]) for (const ox of [-W, 0, W]) { ctx.save(); ctx.translate(ox, oy); fn(); ctx.restore(); } };
  g.fillStyle = P.tendrilDk; g.fillRect(W * 0.34, 0, W * 0.32, H); // the dark back
  g.fillStyle = P.tendrilLt; g.fillRect(0, 0, W * 0.1, H); g.fillRect(W * 0.9, 0, W * 0.1, H); // a pale belly
  for (let i = 0; i < 70; i++) { // mottling
    const x = R() * W, y = R() * H, r = 3 + R() * R() * 16;
    g.fillStyle = R() < 0.6 ? 'rgba(20,70,70,' + (0.14 + R() * 0.2) + ')' : 'rgba(190,255,230,' + (0.1 + R() * 0.18) + ')';
    wrap(g, () => { g.beginPath(); g.ellipse(x, y, r, r * (0.6 + R() * 0.6), R() * 3, 0, Math.PI * 2); g.fill(); });
  }
  g.strokeStyle = 'rgba(20,70,70,0.4)'; g.lineWidth = 3; // growth bands
  for (let k = 0; k < 9; k++) { const y = (k + 0.5) * (H / 9); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + 4); g.stroke(); }
  for (const [x, y, r] of [...Array.from({ length: 14 }, (_, i) => [W * (i % 2 ? 0.22 : 0.78), (i + 0.5) * (H / 14), 5 + (i % 3) * 1.5]), ...Array.from({ length: 10 }, () => [R() * W, R() * H, 2.5 + R() * 2.5])]) { // the glowing dots: two rows down the flanks and a few strays
    g.fillStyle = P.glowDotDk; wrap(g, () => { g.beginPath(); g.arc(x, y, r * 1.3, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = P.glowDot; wrap(g, () => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
    gg.fillStyle = 'rgba(160,255,150,0.3)'; wrap(gg, () => { gg.beginPath(); gg.arc(x, y, r * 1.9, 0, Math.PI * 2); gg.fill(); });
    gg.fillStyle = P.glowDot; wrap(gg, () => { gg.beginPath(); gg.arc(x, y, r * 0.9, 0, Math.PI * 2); gg.fill(); });
  }
  gg.fillStyle = 'rgba(120,255,214,0.16)'; gg.fillRect(W * 0.46, 0, W * 0.08, H); // a faint line down the back
  return { map: tex(c, true), glow: tex(gc, true) };
}

export function paintBlank(color = '#ffffff') {
  const c = canvas(4, 4), g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
