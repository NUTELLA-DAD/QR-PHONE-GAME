// A3 SKY COHESION: pictures painted in code (nothing is downloaded, nothing animates; every drawing here is a still the sky.js planes show).
//   caveStone(env)  the dark painted stone of a cave's back wall: the trim sheet's terrain rock strata (rock0-2) scaled up 4x, mirrored into a seamless tile, mapped to the environment's own cave colours
//                   (ENVIRONMENTS.<env>.cave), faint vertical strata over it, and the old cave picture kept as a 10% grain at most. Lit only by the lamps and beams (sky.js).
//   emberSky()      the Ember Forge's sky, camera-glued like every sky: flat cel bands from smoky dark red to hot orange, a few darker smoke bands, a stepped molten glow low on the horizon.
//   emberFoundry()  a world-fixed strip (4:1, tileable): distant foundry roofs, chimneys with glowing windows and flat smoke plumes, slag hills with glowing cracks.
//   emberMist()     a world-fixed strip (4:1, tileable): drifting ash bands over the old mist picture (sky.js slides it at a constant speed, the mist strip's slot).
// All of them return a THREE.CanvasTexture, or null (and the caller keeps the old picture) if canvas is not there. Never throw.
import { THREE } from './style.js';
import { getTrimSheet, TRIM, ROCK_STRATA } from './textures.js';
import { config } from '../../config.js';

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const canvasTex = (cv, repeatX) => {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
};
const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')]; };

// ---- the cave's stone -------------------------------------------------------------------------------------------------------------------------------------------------------------
export const STONE_TILE = 1100; // world units one 1024 px tile covers
const stoneCache = new Map();
export function caveStone(envId) {
  if (stoneCache.has(envId)) return stoneCache.get(envId);
  let tex = null;
  try {
    const sheet = getTrimSheet();
    const E = (config.ENVIRONMENTS && config.ENVIRONMENTS[envId]) || {};
    const cave = E.cave || ['#161c2a', '#2f3a52'];
    const dark = hex(cave[0]), light = hex(cave[1]);
    if (!sheet.canvas) throw new Error('no sheet');
    const N = 1024, Q = N / 2, rnd = mulberry(7000 + envId.length * 31 + (envId.charCodeAt(0) || 0));
    const [cv, g] = mk(N, N);
    // one quarter: a 128 x 128 crop of a strata row, 4x bigger (512 x 512), then mirrored three times so the tile is seamless
    const [qc, qg] = mk(Q, Q);
    const row = TRIM[ROCK_STRATA[Math.floor(rnd() * ROCK_STRATA.length)]];
    qg.imageSmoothingEnabled = true;
    qg.drawImage(sheet.canvas, row.x + Math.floor(rnd() * (row.w - 128)), row.y, 128, 128, 0, 0, Q, Q);
    g.drawImage(qc, 0, 0);
    g.save(); g.translate(N, 0); g.scale(-1, 1); g.drawImage(qc, 0, 0); g.restore();
    g.save(); g.translate(0, N); g.scale(1, -1); g.drawImage(qc, 0, 0); g.restore();
    g.save(); g.translate(N, N); g.scale(-1, -1); g.drawImage(qc, 0, 0); g.restore();
    // grey strata -> the environment's own cave colours (the rock's brightness picks a point between the cave's dark and light colour, a little brighter than the 2D picture)
    const id = g.getImageData(0, 0, N, N), d = id.data;
    const lo = dark.map((v) => v * 1.0), hi = light.map((v) => Math.min(255, v * 1.9));
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255, t = Math.max(0, Math.min(1, (l - 0.5) / 0.38));
      d[i] = lo[0] + (hi[0] - lo[0]) * t; d[i + 1] = lo[1] + (hi[1] - lo[1]) * t; d[i + 2] = lo[2] + (hi[2] - lo[2]) * t; d[i + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    // faint vertical strata: long thin streaks, a pale one and a dark one (drawn again one tile up / down so they wrap)
    for (let k = 0; k < 70; k++) {
      const x = rnd() * N, w = 2 + rnd() * 5, y = rnd() * N, len = 160 + rnd() * 520, pale = rnd() < 0.4;
      g.fillStyle = pale ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)';
      for (const dy of [-N, 0, N]) g.fillRect(x, y + dy, w, len);
    }
    // the old cave picture, a 10% grain (it arrives a moment later)
    const img = new Image();
    img.onload = () => { try { g.save(); g.globalAlpha = 0.1; g.globalCompositeOperation = 'overlay'; g.drawImage(img, 0, 0, N, N); g.restore(); tex.needsUpdate = true; } catch { /* (no grain) */ } };
    img.src = `art/backgrounds/${envId}/cave.png`;
    tex = canvasTex(cv, true);
    tex.wrapT = THREE.RepeatWrapping;
  } catch (e) { console.warn('view3d cave stone', e); tex = null; }
  stoneCache.set(envId, tex);
  return tex;
}

// ---- the Ember Forge -------------------------------------------------------------------------------------------------------------------------------------------------------------
let emberSkyTex = null, emberFoundryTex = null, emberMistTex = null;

export function emberSky() {
  if (emberSkyTex !== null) return emberSkyTex || null;
  emberSkyTex = false;
  try {
    const W = 1280, H = 720, [cv, g] = mk(W, H), rnd = mulberry(5151), R = (a, b) => a + (b - a) * rnd();
    // flat bands, dark smoky red at the top to hot orange at the horizon (the old picture's colours, cut into steps)
    const stops = [[0, '#2a1115'], [0.25, '#4e1b16'], [0.5, '#86291a'], [0.6, '#9c3a20'], [0.75, '#c06028'], [0.9, '#dc7632'], [1, '#ec8c42']];
    const col = (t) => { for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const a = hex(stops[i - 1][1]), b = hex(stops[i][1]), u = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return a.map((v, k) => v + (b[k] - v) * u); } return hex(stops[stops.length - 1][1]); };
    const STEPS = 18;
    for (let i = 0; i < STEPS; i++) { const c = col((i + 0.5) / STEPS); g.fillStyle = `rgb(${c.map(Math.round).join(',')})`; g.fillRect(0, Math.floor((i / STEPS) * H), W, Math.ceil(H / STEPS) + 1); }
    // the molten glow low down: three flat, stepped ellipses
    for (const [rx, ry, a] of [[760, 250, 0.1], [520, 170, 0.12], [300, 100, 0.14]]) { g.fillStyle = `rgba(255,190,90,${a})`; g.beginPath(); g.ellipse(W * 0.42, H * 0.97, rx, ry, 0, 0, 7); g.fill(); }
    // smoke bands: long flat lenses of dark red-brown across the middle, a few with a thin hot underside
    for (let k = 0; k < 9; k++) {
      const y = H * R(0.12, 0.72), w = R(380, 980), h = R(18, 44), x = R(-100, W - w + 100);
      g.fillStyle = `rgba(36,10,14,${R(0.16, 0.3).toFixed(2)})`;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - h, x + w, y); g.quadraticCurveTo(x + w / 2, y + h * 0.7, x, y); g.fill();
      if (rnd() < 0.5) { g.strokeStyle = 'rgba(255,150,70,0.16)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.1, y + h * 0.28); g.quadraticCurveTo(x + w / 2, y + h * 0.62, x + w * 0.9, y + h * 0.2); g.stroke(); }
    }
    emberSkyTex = canvasTex(cv, false);
  } catch (e) { console.warn('view3d ember sky', e); emberSkyTex = false; }
  return emberSkyTex || null;
}

// shapes are drawn three times (one tile left, here, one tile right) so a strip tiles seamlessly
const wrap3 = (W, fn) => { for (const dx of [-W, 0, W]) fn(dx); };

export function emberFoundry() {
  if (emberFoundryTex !== null) return emberFoundryTex || null;
  emberFoundryTex = false;
  try {
    const W = 2048, H = 512, [cv, g] = mk(W, H), rnd = mulberry(6262), R = (a, b) => a + (b - a) * rnd();
    const GROUND = H - 16, SIL = '#4a2430', SIL2 = '#5a2c36', ROOF = '#3c1c28', GLOW = '#ffb450', PLUME = '#5a2a30';
    // long low foundry sheds with sawtooth roofs, windows glowing
    const sheds = [];
    for (let x = 40; x < W - 80;) { const w = R(160, 340), h = R(46, 96); sheds.push([x, w, h]); x += w + R(60, 220); }
    for (const [x, w, h] of sheds) wrap3(W, (dx) => {
      g.fillStyle = SIL; g.fillRect(x + dx, GROUND - h, w, h + 20);
      g.fillStyle = ROOF; const teeth = Math.max(2, Math.round(w / 52));
      for (let k = 0; k < teeth; k++) { const tx = x + dx + (k * w) / teeth; g.beginPath(); g.moveTo(tx, GROUND - h); g.lineTo(tx, GROUND - h - 26); g.lineTo(tx + w / teeth, GROUND - h); g.closePath(); g.fill(); }
      g.fillStyle = GLOW; for (let k = 0; k < Math.floor(w / 46); k++) if (((k * 7 + Math.floor(x)) % 3) !== 0) g.fillRect(x + dx + 14 + k * 46, GROUND - h * 0.7, 14, 10);
    });
    // chimneys: tall tapered stacks with a pale cap band, a window or two, some with a hot flare ring and a flat smoke plume
    let cx = R(60, 200);
    while (cx < W - 60) {
      const w = R(26, 46), h = R(260, 440), top = GROUND - h, flare = rnd() < 0.4, second = rnd() < 0.6, plumeL = Math.min(R(110, 190), (top - 24) / 0.6);
      wrap3(W, (dx) => {
        g.fillStyle = SIL2; g.beginPath(); g.moveTo(cx + dx - w / 2, GROUND + 6); g.lineTo(cx + dx - w * 0.36, top); g.lineTo(cx + dx + w * 0.36, top); g.lineTo(cx + dx + w / 2, GROUND + 6); g.closePath(); g.fill();
        g.fillStyle = '#6a3640'; g.fillRect(cx + dx - w * 0.42, top - 6, w * 0.84, 12);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(cx + dx + w * 0.05, top, w * 0.4, h); // the shaded side
        g.fillStyle = GLOW; g.fillRect(cx + dx - 4, top + h * 0.35, 8, 11); if (second) g.fillRect(cx + dx - 4, top + h * 0.6, 8, 11);
        if (flare) { g.fillStyle = 'rgba(255,170,70,0.85)'; g.beginPath(); g.ellipse(cx + dx, top - 12, w * 0.5, 9, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,230,150,0.9)'; g.beginPath(); g.ellipse(cx + dx, top - 14, w * 0.26, 5, 0, 0, 7); g.fill(); }
        g.fillStyle = PLUME; const px = cx + dx, py = top - 14, wS = w * 0.3, wE = w * 0.9; // a flat smoke trail: one hard-edged lens leaning right, thin at the stack and fat at the far end
        g.beginPath(); g.moveTo(px - wS, py); g.quadraticCurveTo(px + plumeL * 0.3, py - plumeL * 0.5 - wS, px + plumeL, py - plumeL * 0.42 - wE); g.quadraticCurveTo(px + plumeL * 0.62, py - plumeL * 0.14 + wE * 0.3, px + wS, py); g.closePath(); g.fill();
      });
      cx += R(150, 330);
    }
    // slag hills in front: dark humps with a lighter crest line and glowing cracks
    for (let k = 0; k < 11; k++) {
      const x = (k / 11) * W + R(-60, 60), w = R(260, 420), h = R(60, 120);
      wrap3(W, (dx) => {
        g.fillStyle = '#2c1219'; g.beginPath(); g.moveTo(x + dx - w / 2, H); g.quadraticCurveTo(x + dx - w * 0.2, GROUND - h, x + dx + w * 0.05, GROUND - h); g.quadraticCurveTo(x + dx + w * 0.3, GROUND - h, x + dx + w / 2, H); g.closePath(); g.fill();
        g.strokeStyle = '#6a3a3e'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + dx - w * 0.4, GROUND - h * 0.35); g.quadraticCurveTo(x + dx - w * 0.2, GROUND - h * 0.98, x + dx + w * 0.05, GROUND - h + 1); g.stroke();
        g.strokeStyle = 'rgba(255,140,60,0.85)'; g.lineWidth = 2.5; g.beginPath(); let yy = GROUND - h * 0.55, xx = x + dx - w * 0.1; g.moveTo(xx, yy);
        for (let j = 0; j < 4; j++) { xx += 14 + ((j * 13 + k * 7) % 11); yy += ((j % 2) ? -9 : 11); g.lineTo(xx, yy); } g.stroke();
      });
    }
    g.fillStyle = '#2c1219'; g.fillRect(0, H - 14, W, 14);
    emberFoundryTex = canvasTex(cv, true);
  } catch (e) { console.warn('view3d ember foundry', e); emberFoundryTex = false; }
  return emberFoundryTex || null;
}

export function emberMist() {
  if (emberMistTex !== null) return emberMistTex || null;
  emberMistTex = false;
  try {
    const W = 2048, H = 512, [cv, g] = mk(W, H), rnd = mulberry(7373), R = (a, b) => a + (b - a) * rnd();
    for (let k = 0; k < 15; k++) {
      const x = R(0, W), y = R(40, H - 60), w = R(300, 760), h = R(14, 34), al = R(0.22, 0.38).toFixed(2);
      wrap3(W, (dx) => {
        g.fillStyle = `rgba(52,22,26,${al})`;
        g.beginPath(); g.moveTo(x + dx, y); g.quadraticCurveTo(x + dx + w / 2, y - h, x + dx + w, y); g.quadraticCurveTo(x + dx + w / 2, y + h * 0.6, x + dx, y); g.fill();
        g.strokeStyle = 'rgba(255,150,80,0.14)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + dx + w * 0.12, y + h * 0.22); g.quadraticCurveTo(x + dx + w / 2, y + h * 0.5, x + dx + w * 0.88, y + h * 0.16); g.stroke();
      });
    }
    // the old mist picture goes UNDER the ash (it arrives a moment later), so the Ember mist strip is both: the same one draw call as before
    const img = new Image();
    img.onload = () => { try { g.save(); g.globalCompositeOperation = 'destination-over'; g.drawImage(img, 0, 0, W, H); g.restore(); emberMistTex.needsUpdate = true; } catch { /* (ash only) */ } };
    img.src = 'art/backgrounds/ember/mist.png';
    emberMistTex = canvasTex(cv, true);
  } catch (e) { console.warn('view3d ember ash', e); emberMistTex = false; }
  return emberMistTex || null;
}
