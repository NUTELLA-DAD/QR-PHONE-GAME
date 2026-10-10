// THE CINDER DRAKE'S SKIN (3D.md section 22): the paintings the dragon is wrapped in, made once with Canvas 2D (a seeded generator, so it is always the same dragon). No files, nothing from the internet.
//   paintDrakeAtlas(P)  the BODY atlas, the same layout as the Kraken's head atlas (creatureKit.js ATLAS): the top 640 rows are the torso (x = round the body, 0 = the belly's middle line, 0.25 = the near flank,
//                       0.5 = the back; y = along it, rear to chest), the lower left is a sheet of armour plates (the breast scales), the lower right is the plain white swatch the flat pieces point at.
//   paintDrakeLimb(P)   the skin of a tube (neck, tail, wing bones, legs): x = round it (0 and 1 = the belly side), y = along it (stretched 2:1: the tube kit maps one unit of v to one circumference).
// Each comes with a GLOW twin: the same layout, black but for the ember cracks (the toon material's emissive map: the view scales it by how hot the dragon is). Scales are overlapping rounded shields in two
// charred tones, darker at the back and paler toward a tan belly of plates. The cracks are orange with a yellow heart.
import { THREE } from './style.js';
import { ATLAS, rngOf } from './creatureKit.js';

const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; t.needsUpdate = true; return t; };
const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
const lift = (a, k) => '#' + new THREE.Color(a).multiplyScalar(k).getHexString();

// a field of overlapping scales over a rect (x0, y0, w, h): each a round-bottomed shield (cw wide, ch tall) in one of the tones; drawn from the bottom row up so that every row lies over the one below it and shows its curved
// lower edge: a dark rim, a lighter inner arc, and a short shadow under the rim (the scale above casts it on the one below)
function scales(g, R, x0, y0, w, h, cw, ch, tones, edge, hi, wrapX) {
  const step = ch * 0.5, rows = Math.ceil(h / step) + 2, cols = Math.ceil(w / cw) + 2;
  for (let r = rows - 1; r >= 0; r--) {
    const y = y0 + r * step, off = (r % 2) * cw * 0.5;
    for (let c = -1; c < cols; c++) {
      const x = x0 + c * cw + off + (R() - 0.5) * 1.5;
      for (const ox of wrapX ? [-w, 0, w] : [0]) {
        const cx = x + ox;
        if (cx + cw < x0 || cx - cw > x0 + w) continue;
        const shield = (k, dy) => { g.beginPath(); g.moveTo(cx - cw * 0.5 * k, y + dy); g.bezierCurveTo(cx - cw * 0.52 * k, y + dy + ch * 0.62 * k, cx - cw * 0.26 * k, y + dy + ch * k, cx, y + dy + ch * k); g.bezierCurveTo(cx + cw * 0.26 * k, y + dy + ch * k, cx + cw * 0.52 * k, y + dy + ch * 0.62 * k, cx + cw * 0.5 * k, y + dy); g.closePath(); };
        shield(1, 0);
        g.fillStyle = tones[(R() * tones.length) | 0];
        g.fill();
        g.strokeStyle = edge; g.lineWidth = 3; g.stroke();
        g.save(); shield(1, 0); g.clip(); // (an inner lighter arc near the lower rim, and the top of the scale lies in shadow)
        g.strokeStyle = hi; g.globalAlpha = 0.5; g.lineWidth = 2.4;
        shield(0.78, ch * 0.05); g.stroke();
        g.fillStyle = edge; g.globalAlpha = 0.35; g.fillRect(cx - cw, y - 1, cw * 2, ch * 0.2);
        g.restore();
        g.globalAlpha = 1;
      }
    }
  }
}

// ember cracks: random walks that fork now and then, orange outside and a yellow heart
function cracks(g, R, x0, y0, w, h, n, wid, wrapW) {
  const draw = (x, y, a, steps, width) => {
    const pts = [[x, y]];
    for (let i = 0; i < steps; i++) {
      a += (R() - 0.5) * 1.5;
      x += Math.cos(a) * (10 + R() * 22); y += Math.sin(a) * (10 + R() * 22);
      pts.push([x, y]);
      if (R() < 0.16 && width > 1.6) draw(x, y, a + (R() < 0.5 ? 1 : -1) * (0.6 + R() * 0.7), 2 + ((R() * 3) | 0), width * 0.7);
    }
    for (const [col, k] of [['#ff5a14', 1], ['#ffb23a', 0.62], ['#ffe9a0', 0.26]]) {
      g.strokeStyle = col; g.lineWidth = Math.max(1, width * k); g.lineCap = 'round'; g.lineJoin = 'round';
      for (const ox of wrapW ? [-wrapW, 0, wrapW] : [0]) { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px + ox, py) : g.moveTo(px + ox, py))); g.stroke(); }
    }
  };
  for (let i = 0; i < n; i++) draw(x0 + R() * w, y0 + R() * h, R() * Math.PI * 2, 4 + ((R() * 5) | 0), wid * (0.7 + R() * 0.7));
}

export function paintDrakeAtlas(P, seed = 29) {
  const W = ATLAS.W, H = ATLAS.H, M = ATLAS.mantle.y1, R = rngOf(seed);
  const c = canvas(W, H), g = c.getContext('2d'), e = canvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  // --- the torso: charred scales, a dark back, a paler flank edge, a tan belly of plates ---
  g.fillStyle = P.skinDark; g.fillRect(0, 0, W, H);
  scales(g, R, 0, -20, W, M + 40, 46, 42, [P.skin, lift(P.skin, 0.9), mixHex(P.skin, P.skinDark, 0.3), lift(P.skin, 1.1)], P.skinDark, P.spotLight, true);
  const back = g.createLinearGradient(W * 0.38, 0, W * 0.62, 0); // the back (x 0.5): darker, charcoal
  back.addColorStop(0, 'rgba(30,14,16,0)'); back.addColorStop(0.5, 'rgba(30,14,16,0.62)'); back.addColorStop(1, 'rgba(30,14,16,0)');
  g.fillStyle = back; g.fillRect(W * 0.34, 0, W * 0.32, M);
  // the underside: from about 0.13 round, the scales turn ember-orange, and below 0.085 a tan belly of plates
  for (const side of [0, 1]) {
    const x0 = side ? W * 0.915 : 0, w = side ? W * 0.085 : W * 0.085;
    g.fillStyle = P.belly; g.fillRect(x0, 0, w, M);
    g.strokeStyle = lift(P.belly, 0.62); g.lineWidth = 3;
    for (let y = 8; y < M; y += 24) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    const band = side ? [W * 0.83, W * 0.915] : [W * 0.085, W * 0.17];
    scales(g, R, band[0], -10, band[1] - band[0], M + 20, 38, 42, [P.spotLight, lift(P.spotLight, 1.12), lift(P.spotLight, 0.9)], P.skinDark, P.belly, false);
    g.fillStyle = P.skinDark; // a serrated edge where the plates meet the scales
    const ex = side ? W * 0.915 : W * 0.085;
    for (let y = 0; y < M; y += 28) { g.beginPath(); g.moveTo(ex, y); g.lineTo(ex + (side ? 14 : -14) * -1, y + 14); g.lineTo(ex, y + 28); g.closePath(); g.fill(); }
  }
  cracks(ge, R, W * 0.16, 0, W * 0.68, M, 26, 5, 0);
  cracks(ge, R, W * 0.2, 0, W * 0.6, M, 18, 4, 0);
  // --- the breast plates' sheet (lower left): dark armour, a pale ridge, a rim of ember ---
  const px = 0, py = M, pw = ATLAS.fin.x1, ph = H - M;
  g.fillStyle = P.plate; g.fillRect(px, py, pw, ph);
  for (let k = 0; k < 6; k++) {
    const y = py + 6 + k * (ph / 6);
    g.fillStyle = k % 2 ? lift(P.plate, 1.18) : lift(P.plate, 0.88); g.fillRect(px, y, pw, ph / 6 - 4);
    g.strokeStyle = P.plateEdge; g.lineWidth = 4; g.beginPath(); g.moveTo(px, y + ph / 6 - 5); g.lineTo(px + pw, y + ph / 6 - 5); g.stroke();
  }
  g.strokeStyle = lift(P.plateEdge, 1.1); g.lineWidth = 5; g.globalAlpha = 0.6;
  for (let k = 0; k < 4; k++) { const x = (k + 0.5) * (pw / 4); g.beginPath(); g.moveTo(x, py); g.lineTo(x, py + ph); g.stroke(); }
  g.globalAlpha = 1;
  cracks(ge, R, px, py, pw, ph, 6, 3.5, 0);
  g.fillStyle = '#ffffff'; g.fillRect(ATLAS.fin.x1, M, W - ATLAS.fin.x1, H - M); // the plain swatch
  ge.fillStyle = '#000'; ge.fillRect(ATLAS.fin.x1, M, W - ATLAS.fin.x1, H - M);
  return { map: tex(c), glow: tex(e) };
}

export function paintDrakeLimb(P, seed = 31) {
  const W = 256, H = 512, R = rngOf(seed);
  const c = canvas(W, H), g = c.getContext('2d'), e = canvas(W, H), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  g.fillStyle = P.skinDark; g.fillRect(0, 0, W, H);
  scales(g, R, 0, -30, W, H + 60, 30, 56, [P.skin, lift(P.skin, 0.9), mixHex(P.skin, P.skinDark, 0.3), lift(P.skin, 1.1)], P.skinDark, P.spotLight, true);
  const back = g.createLinearGradient(W * 0.3, 0, W * 0.7, 0); // the back (x 0.5) is darker
  back.addColorStop(0, 'rgba(30,14,16,0)'); back.addColorStop(0.5, 'rgba(30,14,16,0.6)'); back.addColorStop(1, 'rgba(30,14,16,0)');
  g.fillStyle = back; g.fillRect(W * 0.28, 0, W * 0.44, H);
  for (const side of [0, 1]) { // the belly (the sucker side of the tube kit: x 0 and 1): tan bands
    const x0 = side ? W * 0.86 : 0, w = W * 0.14;
    g.fillStyle = P.belly; g.fillRect(x0, 0, w, H);
    g.strokeStyle = lift(P.belly, 0.6); g.lineWidth = 4;
    for (let y = 10; y < H; y += 32) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + w, y); g.stroke(); }
    g.fillStyle = P.skinDark;
    const ex = side ? W * 0.86 : W * 0.14;
    for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(ex, y); g.lineTo(ex + (side ? 9 : -9), y + 20); g.lineTo(ex, y + 40); g.closePath(); g.fill(); }
  }
  cracks(ge, R, W * 0.2, 0, W * 0.6, H, 9, 3.4, 0);
  return { map: tex(c), glow: tex(e) };
}
