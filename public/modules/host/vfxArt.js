// Shared effects drawing in the storybook gouache style (NEXT_LEVEL.md section 2): flat shapes, one ink colour, no
// gradients, no blend modes, no wobble. Motion is scale / fade / stepped frames only.
//   fire puffs  3 stacked circles (charcoal rim, orange body, cream core) that grow, then fade
//   smoke       soft grey circles, ink only round the OUTER edge of the whole chain (ink pass first, then the fills)
//   steam       pure white puffs, no ink
//   rings       a flat ring with a thin ink edge, plus 3-5 short comic "tick" strokes for the first 0.15 s of an impact
//   flashes     flat star shapes
//   flames      a 4-frame flat flame, stepped at 8 fps
// Every function is cheap (a handful of draw calls per effect), takes the 2D context, and never throws.
// The perf governor (perf.js) is asked for the level: low = one flat circle per puff, no ink, no core.
import { config } from '../../config.js';
import { perfState } from './perf.js';

const V = () => config.VFX || {};
const INK = () => config.INK || '#2b2622';
const O = () => config.OUTLINE || { MAIN: 3.4, SMALL: 2.5, SHIP: 4 };
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

// ---- colour classes (a puff only carries one colour; the class decides how it is painted) ----
const classCache = new Map();
const mixCache = new Map();
const parseHex = (c) => {
  if (typeof c !== 'string' || c[0] !== '#') return null;
  let h = c.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null;
};
// 'fire' (orange / yellow / red), 'steam' (white or pale cool), otherwise 'smoke' (greys, browns, dust, green spores...).
export const puffClass = (c) => {
  let k = classCache.get(c);
  if (k) return k;
  const p = parseHex(c);
  if (!p) k = 'smoke';
  else if (Math.min(p[0], p[1], p[2]) >= 215 || (p[2] >= p[0] && p[0] >= 150 && p[2] >= 200)) k = 'steam';
  else if (p[0] >= 190 && p[0] - p[2] >= 100) k = 'fire';
  else k = 'smoke';
  classCache.set(c, k);
  return k;
};
// Smoke is painted a soft grey: the puff's own colour mixed halfway with the smoke grey (cached per colour).
const smokeFill = (c) => {
  let m = mixCache.get(c);
  if (m) return m;
  const p = parseHex(c);
  const g = parseHex(V().SMOKE || '#9a9490') || [154, 148, 144];
  m = p ? `rgb(${(p[0] + g[0]) >> 1},${(p[1] + g[1]) >> 1},${(p[2] + g[2]) >> 1})` : '#9a9490';
  mixCache.set(c, m);
  return m;
};

// Radius of a puff at progress t (0..1): swells up quickly then eases back.
const puffRadius = (t) => 5 + 13 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5 + 0.15) * (1 - t * 0.45);

// All the cartoon puffs: smoke and steam first (so a fire puff always sits on top), then the fire puffs.
export function drawPuffs(ctx, puffs) {
  try {
    if (!puffs || !puffs.length) return;
    const level = perfState.level;
    const low = level <= 0;
    const ink = INK();
    const v = V();
    const edge = Math.max(1.2, O().SMALL * 0.7);
    let n = 0;
    // pass 1: ink under every smoke puff (so only the outside of the chain shows ink)
    if (!low) {
      ctx.fillStyle = ink;
      for (const p of puffs) {
        if (puffClass(p.c) !== 'smoke') continue;
        const t = 1 - num(p.life) / (num(p.max) || 1);
        const a = Math.max(0, 1 - t * t);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a * a * 0.85;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, puffRadius(t)) + edge, 0, 7);
        ctx.fill();
      }
    }
    // pass 2: smoke fills and white steam
    n = 0;
    for (const p of puffs) {
      const cls = puffClass(p.c);
      if (cls === 'fire') continue;
      if (low && (n++ & 1)) continue;
      const t = 1 - num(p.life) / (num(p.max) || 1);
      const a = Math.max(0, 1 - t * t);
      if (a <= 0.02) continue;
      ctx.globalAlpha = cls === 'steam' ? a * 0.9 : a;
      ctx.fillStyle = cls === 'steam' ? v.STEAM || '#ffffff' : smokeFill(p.c);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, puffRadius(t)), 0, 7);
      ctx.fill();
    }
    // pass 3: fire / explosion puffs (rim, body, core), full strength until late in their life, then fading
    n = 0;
    for (const p of puffs) {
      if (puffClass(p.c) !== 'fire') continue;
      if (low && (n++ & 1)) continue;
      const t = 1 - num(p.life) / (num(p.max) || 1);
      const a = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);
      if (a <= 0.02) continue;
      const r = Math.max(0.5, puffRadius(t) * 1.3);
      ctx.globalAlpha = a;
      if (low) {
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.9, 0, 7);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = v.CHARCOAL || '#3a302c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 7);
      ctx.fill();
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 0.8, 0, 7);
      ctx.fill();
      if (level >= 2 && t < 0.75) {
        ctx.fillStyle = v.CREAM || '#fff2cf';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.08, p.y - r * 0.08, r * 0.42 * (1 - t / 0.75), 0, 7);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } catch { ctx.globalAlpha = 1; /* (drawing must never throw) */ }
}

// ---- impact rings with comic ink ticks ----
// A tick is a short stroke radiating out of the impact; they are fixed in direction (from where the hit was), so nothing
// jitters. They show for TICK_SECS (0.15 s) and push outwards a little while they last.
const ticks = (ctx, x, y, size, age, count, seed) => {
  const life = Math.max(0.05, num(V().TICK_SECS, 0.15));
  if (age >= life) return;
  const k = age / life;
  const a0 = ((Math.abs(Math.floor(x * 7 + y * 13)) % 628) / 100);
  const inner = 6 + size * 0.16 + size * 0.2 * k;
  const len = 9 + size * 0.1;
  ctx.strokeStyle = INK();
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, O().MAIN * (1 - 0.4 * k));
  ctx.globalAlpha = 1;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = a0 + seed + (i / count) * Math.PI * 2 + (i % 2 ? 0.12 : -0.12);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const l = len * (i % 2 ? 0.7 : 1);
    ctx.moveTo(x + c * inner, y + s * inner);
    ctx.lineTo(x + c * (inner + l), y + s * (inner + l));
  }
  ctx.stroke();
};

export function drawRings(ctx, rings) {
  try {
    if (!rings || !rings.length) return;
    const low = perfState.level <= 0;
    const v = V();
    ctx.lineCap = 'round';
    for (const r of rings) {
      const max = num(r.max) || 0.3;
      const k = Math.min(1, Math.max(0, 1 - num(r.t) / max));
      const prime = r.kind === 'prime';
      const radius = 10 + num(r.size, 80) * k;
      const w = (prime ? 8 : 6) * (1 - k) + 2;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      if (!low) {
        ctx.strokeStyle = INK();
        ctx.lineWidth = w + 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, 7);
        ctx.stroke();
      }
      ctx.strokeStyle = prime ? v.GOLD || '#f2c14e' : r.color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, 7);
      ctx.stroke();
      if (!low) ticks(ctx, r.x, r.y, num(r.size, 80), max - num(r.t), prime ? 6 : 4, prime ? 0.3 : 0);
    }
    ctx.globalAlpha = 1;
  } catch { ctx.globalAlpha = 1; }
}

// ---- muzzle flashes: flat stars (long spike forward, short ones round the back) ----
const STAR = (() => {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const c = Math.cos(a);
    pts.push([a, 0.62 + (c > 0 ? 0.7 * c * c : 0)]); // tip
    pts.push([a + Math.PI / 8, 0.34]); // notch
  }
  return pts;
})();
const starPath = (ctx, x, y, s, ang) => {
  ctx.beginPath();
  for (let i = 0; i < STAR.length; i++) {
    const a = STAR[i][0] + ang;
    const px = x + Math.cos(a) * STAR[i][1] * s;
    const py = y + Math.sin(a) * STAR[i][1] * s;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.closePath();
};

export function drawFlashes(ctx, flashes) {
  try {
    if (!flashes || !flashes.length) return;
    const low = perfState.level <= 0;
    const cream = V().CREAM || '#fff2cf';
    ctx.globalAlpha = 1;
    ctx.lineJoin = 'round';
    for (const f of flashes) {
      if (f.glow) continue; // (a flame's light in the dark: searchlightArt.js cuts it out of the darkness, there is nothing to draw)
      const k = Math.min(1, Math.max(0, num(f.t) / 0.06)); // full size, then a quick shrink at the very end (no fading)
      const s = 26 * num(f.size, 1) * (0.65 + 0.35 * k);
      starPath(ctx, f.x, f.y, s, num(f.ang));
      ctx.fillStyle = f.color || cream;
      ctx.fill();
      if (!low) {
        ctx.strokeStyle = INK();
        ctx.lineWidth = Math.max(1.5, O().SMALL * (0.6 + 0.3 * Math.min(2, num(f.size, 1))));
        ctx.stroke();
      }
      starPath(ctx, f.x, f.y, s * 0.5, num(f.ang));
      ctx.fillStyle = cream;
      ctx.fill();
    }
  } catch { /* (never throw) */ }
}

// ---- a flat flame: 4 stepped frames, orange with a yellow heart and a thin ink outline ----
// Base centre at (x, y), width w, height h, pointing up (rotate the context to aim it). seed offsets the frame so
// neighbouring flames do not step together. time is in seconds.
const FRAMES = [
  { lean: -0.12, tip: 1.0, hl: 0.5, hr: 0.58 },
  { lean: 0.1, tip: 0.92, hl: 0.62, hr: 0.44 },
  { lean: 0.18, tip: 1.0, hl: 0.44, hr: 0.62 },
  { lean: -0.04, tip: 0.94, hl: 0.58, hr: 0.5 },
];
const flamePath = (ctx, x, y, w, h, f) => {
  const hw = w / 2;
  const tip = h * f.tip;
  const hl = h * f.hl;
  const hr = h * f.hr;
  ctx.beginPath();
  ctx.moveTo(x - hw, y);
  ctx.quadraticCurveTo(x - hw * 1.1, y - h * 0.4, x - hw * 0.78, y - hl);
  ctx.lineTo(x - hw * 0.3, y - h * 0.5);
  ctx.quadraticCurveTo(x - hw * 0.2, y - tip * 0.8, x + hw * f.lean * 2, y - tip);
  ctx.quadraticCurveTo(x + hw * 0.25, y - h * 0.6, x + hw * 0.34, y - h * 0.46);
  ctx.lineTo(x + hw * 0.8, y - hr);
  ctx.quadraticCurveTo(x + hw * 1.15, y - h * 0.35, x + hw, y);
  ctx.closePath();
};

export function drawFlame(ctx, x, y, w, h, time, seed = 0) {
  try {
    w = Math.max(2, Math.min(400, num(w, 20)));
    h = Math.max(2, Math.min(600, num(h, 30)));
    const frame = FRAMES[(((Math.floor(num(time) * 8 + num(seed)) % 4) + 4) % 4)] || FRAMES[0];
    const v = V();
    const low = perfState.level <= 0;
    flamePath(ctx, x, y, w, h, frame);
    ctx.fillStyle = v.FIRE_OUT || '#f08a3c';
    ctx.fill();
    if (!low) {
      ctx.strokeStyle = INK();
      ctx.lineWidth = Math.max(1.2, h < 40 ? O().SMALL * 0.7 : O().SMALL);
      ctx.lineJoin = 'round';
      ctx.stroke();
      flamePath(ctx, x, y - h * 0.04, w * 0.52, h * 0.62, frame);
      ctx.fillStyle = v.FIRE_IN || '#ffd35c';
      ctx.fill();
    }
  } catch { /* (never throw) */ }
}

// ---- a flat spark / small star (bomb fuse, sparks): points = number of tips ----
export function drawSpark(ctx, x, y, r, color, points = 4) {
  try {
    r = Math.max(1, Math.min(200, num(r, 6)));
    const n = Math.max(3, Math.min(12, points | 0));
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n - Math.PI / 2;
      const rr = i % 2 ? r * 0.38 : r;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (perfState.level > 0) {
      ctx.strokeStyle = INK();
      ctx.lineWidth = Math.max(1.2, O().SMALL * 0.6);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
  } catch { /* (never throw) */ }
}

// ---- a flak burst: the gouache puff (rim, orange, cream core) with four fixed ink ticks ----
export function drawFlakBurst(ctx, x, y, r) {
  try {
    r = Math.max(2, Math.min(120, num(r, 13)));
    const v = V();
    const low = perfState.level <= 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle = v.CHARCOAL || '#3a302c';
    ctx.beginPath();
    ctx.arc(x, y, r * 1.12, 0, 7);
    ctx.fill();
    ctx.fillStyle = v.ORANGE || '#f08a3c';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.88, 0, 7);
    ctx.fill();
    if (low) return;
    ctx.fillStyle = v.CREAM || '#fff2cf';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, 7);
    ctx.fill();
    ctx.strokeStyle = INK();
    ctx.lineWidth = Math.max(1.5, O().SMALL * 0.8);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      ctx.moveTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
      ctx.lineTo(x + Math.cos(a) * r * 1.8, y + Math.sin(a) * r * 1.8);
    }
    ctx.stroke();
  } catch { /* (never throw) */ }
}
