// Sky and fog effects in the soft flat style: sun, god-rays, birds and far airships in the open sky;
// valley fog banks; the layered cave backdrop with light shafts and dust. Everything is placed on
// grids fixed to the world, so shapes only slide past (never shimmer or reshape). Drawing never throws.
import { config } from '../../config.js';
import { envIdOf, envOf } from './environments.js';

const hash = (i, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const wrap = (v, span) => ((v % span) + span) % span;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const rgbOf = (s) => String(s).split(',').map((v) => Number(v));
const mixRgb = (a, b, t) => {
  const pa = rgbOf(a);
  const pb = rgbOf(b);
  return pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',');
};

// Decorative effects never stop the game, but problems are still reported (pause menu shows the last one).
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('sky: ' + (e && e.message)); };
export function createSkyArt({ ctx, state }) {
  let now = 0; // seconds, set by the renderer each frame
  const SKY = config.SKY;
  const FOG = config.FOG;
  const CAVE = config.CAVE_ATMOS;

  const mood = () => ({
    dusk: Math.max(0, Math.min(1, num(state.course && state.course.dusk))),
    storm: Math.max(0, Math.min(1, num(state.weather && state.weather.storm))),
  });

  // ---------- Open sky (screen space, drawn inside drawBackground) ----------

  // Sun glow and god-rays (before the cloud bands so the clouds cover their roots).
  const skyBack = (width, height, view) => {
    if (!SKY.ENABLED || !(width > 0) || !(height > 0)) return;
    try {
      const { dusk, storm } = mood();
      const S = SKY.SUN;
      const a = 1 - storm * 0.9;
      const sx = width * S.X;
      const sy = height * (S.Y + dusk * S.DUSK_DROP);
      const col = mixRgb(S.COLOR, S.DUSK_COLOR, dusk);
      const R = Math.max(1, height * S.GLOW);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      glow.addColorStop(0, `rgba(${col},${S.GLOW_ALPHA * a})`);
      glow.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
      ctx.fillStyle = `rgba(${col},${S.DISC_ALPHA * a})`;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(1, height * S.DISC), 0, 7);
      ctx.fill();

      // God-rays: pale wedges fanning down-left from the sun, off in storms.
      const Rr = SKY.RAYS;
      const ra = Rr.ALPHA * Math.max(0, 1 - storm * 2.5);
      if (ra > 0.002) {
        const L = Math.max(1, height * Rr.LENGTH);
        const rcol = mixRgb(Rr.COLOR, Rr.DUSK_COLOR, dusk);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, L);
        g.addColorStop(0, `rgba(${rcol},1)`);
        g.addColorStop(1, `rgba(${rcol},0)`);
        ctx.fillStyle = g;
        const n = Math.max(1, Math.round(Rr.COUNT));
        for (let k = 0; k < n; k++) {
          const ang = Math.PI * 0.62 + ((n > 1 ? k / (n - 1) : 0.5) - 0.5) * Rr.SPREAD + (hash(k, 91) - 0.5) * 0.12;
          const w = 0.03 + hash(k, 92) * 0.035;
          const pulse = 1 - Rr.PULSE + Rr.PULSE * (0.5 + 0.5 * Math.sin(now * 0.2 + k * 1.9));
          ctx.globalAlpha = Math.max(0, Math.min(1, ra * pulse * (0.6 + hash(k, 93) * 0.8)));
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + L * Math.cos(ang - w), sy + L * Math.sin(ang - w));
          ctx.lineTo(sx + L * Math.cos(ang + w), sy + L * Math.sin(ang + w));
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } catch (e) {
      report(e);
      ctx.globalAlpha = 1;
    }
  };

  // Very faint far-off airships drifting by (decorative silhouettes).
  const skyShips = (width, height, view) => {
    if (!SKY.ENABLED || !(width > 0) || !(height > 0)) return;
    try {
      const { storm } = mood();
      const C = SKY.SHIPS;
      const a = C.ALPHA * (1 - storm * 0.6);
      if (a < 0.005) return;
      ctx.fillStyle = `rgba(${C.COLOR},${a})`;
      const scroll = num(view && view.cx);
      for (let k = 0; k < C.COUNT; k++) {
        const L = Math.max(8, width * C.SIZE * (1 + hash(k, 94) * 0.5));
        const span = width + L * 6;
        const x = wrap(hash(k, 95) * span + now * C.SPEED * (0.8 + hash(k, 96) * 0.5) - scroll * C.PARALLAX, span) - L * 3;
        const y = height * (0.2 + 0.17 * k + hash(k, 97) * 0.06);
        ctx.beginPath();
        ctx.ellipse(x, y, L / 2, L * 0.17, 0, 0, 7);
        ctx.rect(x - L * 0.1, y + L * 0.15, L * 0.2, L * 0.06); // gondola
        ctx.moveTo(x - L * 0.5, y); // tail fins
        ctx.lineTo(x - L * 0.62, y - L * 0.16);
        ctx.lineTo(x - L * 0.36, y - L * 0.08);
        ctx.moveTo(x - L * 0.5, y);
        ctx.lineTo(x - L * 0.62, y + L * 0.16);
        ctx.lineTo(x - L * 0.36, y + L * 0.08);
        ctx.fill();
      }
    } catch (e) { report(e); }
  };

  // Small flocks of tiny gull 'v' shapes (static shapes, slowly sliding).
  const skyBirds = (width, height, view) => {
    if (!SKY.ENABLED || !(width > 0) || !(height > 0)) return;
    try {
      const { storm } = mood();
      const C = SKY.BIRDS;
      const a = C.ALPHA * (1 - storm);
      if (a < 0.01) return;
      const sz = Math.max(2, height * C.SIZE);
      ctx.strokeStyle = `rgba(${C.COLOR},${a})`;
      ctx.lineWidth = Math.max(1, height / 600);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const scroll = num(view && view.cx);
      ctx.beginPath();
      for (let f = 0; f < C.FLOCKS; f++) {
        const span = width + 400;
        const fx = wrap(hash(f, 98) * span + now * C.SPEED * (0.7 + hash(f, 99) * 0.6) - scroll * C.PARALLAX, span) - 200;
        const fy = height * (0.1 + hash(f, 100) * 0.35);
        for (let i = 0; i < C.PER_FLOCK; i++) {
          const side = i % 2 ? 1 : -1;
          const rank = Math.ceil(i / 2);
          const bx = fx - rank * sz * 2.4;
          const by = fy + side * rank * sz * 0.9 + (hash(f * 9 + i, 101) - 0.5) * sz;
          ctx.moveTo(bx - sz, by - sz * 0.45);
          ctx.quadraticCurveTo(bx - sz * 0.4, by - sz * 0.5, bx, by);
          ctx.quadraticCurveTo(bx + sz * 0.4, by - sz * 0.5, bx + sz, by - sz * 0.45);
        }
      }
      ctx.stroke();
    } catch (e) { report(e); }
  };

  // ---------- Fog (world space) ----------

  const levelOf = (course) => {
    if (course.map) return course.map.H * course.map.CELL - FOG.CAVE_DEPTH;
    return FOG.OPEN_LEVEL;
  };

  const fogRgb = () => {
    const { dusk, storm } = mood();
    const look = state.course && envIdOf(state) !== config.ENVIRONMENTS.DEFAULT ? envOf(state) : null; // Frost Peaks / Ember Forge tint the fog
    const warm = look ? look.fog : mixRgb(FOG.COLOR, FOG.DUSK_COLOR, dusk);
    return { rgb: mixRgb(warm, FOG.STORM_COLOR, storm), storm };
  };

  // One flat fog band: wavy top on a grid fixed to the land, thicker toward the bottom.
  const fogBand = (view, width, height, L, alphaMul) => {
    const course = state.course;
    const zoom = num(view.zoom, 1);
    if (!course || !(zoom > 0) || !(width > 0)) return;
    const { rgb, storm } = fogRgb();
    const a = Math.max(0, Math.min(1, L.alpha * alphaMul * (1 + storm * 0.3)));
    if (a < 0.003) return;
    const y0 = levelOf(course) + L.lift;
    const bottom = num(view.cy) + height / 2 / zoom + 60;
    if (bottom <= y0 - L.wave - 5) return; // view is entirely above this fog
    const half = width / 2 / zoom;
    const du = L.spacing;
    const shift = -num(view.cx) * (1 - L.parallax) - now * L.drift; // world x = u - shift (the bank slides at (1 - parallax) of the camera)
    const u0 = Math.floor((num(view.cx) - half - du - 200 + shift) / du) * du;
    const xMax = num(view.cx) + half + du + 200;
    const grad = ctx.createLinearGradient(0, y0 - L.wave, 0, y0 + FOG.TALL);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(1, `rgba(${rgb},${Math.min(0.9, a * FOG.BOTTOM_BOOST)})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    let first = true;
    let lastX = 0;
    for (let u = u0; u - shift <= xMax; u += du) {
      const x = u - shift;
      const w = Math.sin(u * 0.0021 + L.parallax * 7) * 0.6 + Math.sin(u * 0.0057 + 2) * 0.4;
      const y = y0 + L.wave * w;
      if (first) {
        ctx.moveTo(x, bottom);
        first = false;
      }
      ctx.lineTo(x, y);
      lastX = x;
    }
    if (first) return;
    ctx.lineTo(lastX, bottom);
    ctx.closePath();
    ctx.fill();
  };

  // Back fog layers: behind the rock, so the ridges and hills poke out of them.
  const fogBack = (view, width, height) => {
    if (!FOG.ENABLED || !state.course) return;
    try {
      for (const L of FOG.LAYERS) fogBand(view, width, height, L, 1);
    } catch (e) { report(e); }
  };

  // Thin fog in front of the rock but behind the ship, plus floating dust in caves.
  const fogFront = (view, width, height) => {
    const course = state.course;
    if (!course) return;
    try {
      if (FOG.ENABLED) fogBand(view, width, height, FOG.FRONT, course.map && !course.map.open ? FOG.FRONT.cave : 1);
      if (CAVE.ENABLED && course.map && !course.map.open) dust(view, width, height);
    } catch (e) { report(e); }
  };

  // A few slow dust motes on a tile grid fixed to the cave.
  const dust = (view, width, height) => {
    const D = CAVE.DUST;
    const zoom = num(view.zoom, 1);
    if (!(zoom > 0) || !(D.TILE > 0)) return;
    const T = D.TILE;
    const hw = width / 2 / zoom;
    const hh = height / 2 / zoom;
    const i0 = Math.floor((num(view.cx) - hw) / T) - 1;
    const i1 = Math.floor((num(view.cx) + hw) / T) + 1;
    const j0 = Math.floor((num(view.cy) - hh) / T) - 1;
    const j1 = Math.floor((num(view.cy) + hh) / T) + 1;
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 150) return;
    const r = Math.max(0.5, Math.min(D.SIZE / zoom, 16) / 2);
    ctx.fillStyle = `rgba(236,240,244,${D.ALPHA})`;
    ctx.beginPath();
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = i * 131 + j * 7;
        if (hash(k, 110) > 0.8) continue;
        const ph = hash(k, 113) * 6.28;
        const x = (i + hash(k, 111)) * T + Math.sin(now * 0.13 + ph) * 40;
        const y = (j + hash(k, 112)) * T + Math.sin(now * 0.17 + ph * 1.3) * 30;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, 7);
      }
    }
    ctx.fill();
  };

  // ---------- Cave backdrop (world space, inside drawMapTerrain) ----------

  const shaftCache = new WeakMap(); // map -> Map(column -> y of the first open cell, or -1)
  const openingY = (map, i) => {
    let m = shaftCache.get(map);
    if (!m) {
      m = new Map();
      shaftCache.set(map, m);
    }
    if (m.has(i)) return m.get(i);
    let y = -1;
    if (i >= 0 && i < map.W) {
      for (let j = 0; j < Math.min(map.H, 30); j++) {
        if (!map.solid[j * map.W + i]) {
          y = j * map.CELL;
          break;
        }
      }
    }
    m.set(i, y);
    return y;
  };

  // Fills the map rectangle b = {x0,x1,y0,y1} with the far wall, distant rock pillars and light shafts.
  const caveBackdrop = (view, width, height, map, b) => {
    if (!(b.x1 > b.x0) || !(b.y1 > b.y0)) return false;
    if (!CAVE.ENABLED) return false;
    try {
      const C = map.CELL;
      const zoom = num(view.zoom, 1);
      const hw = width / 2 / zoom;
      const { dusk, storm } = mood();
      const mapH = map.H * C;
      const wall = ctx.createLinearGradient(0, 0, 0, mapH);
      const look = state.course && envIdOf(state) !== config.ENVIRONMENTS.DEFAULT ? envOf(state) : null;
      wall.addColorStop(0, look ? look.cave[0] : CAVE.TOP);
      wall.addColorStop(1, look ? look.cave[1] : CAVE.BOTTOM);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.clip();
      ctx.fillStyle = wall;
      ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);

      // Faint silhouettes of distant rock pillars, two depths with parallax.
      CAVE.PILLARS.forEach((P, layer) => {
        const sp = P.spacing;
        const shift = -num(view.cx) * (1 - P.parallax); // (the pillars slide at (1 - parallax) of the camera)
        const k0 = Math.floor((num(view.cx) - hw - 400 + shift) / sp) - 1;
        const k1 = Math.ceil((num(view.cx) + hw + 400 + shift) / sp) + 1;
        ctx.fillStyle = `rgba(${look ? look.pillar : P.color},${P.alpha})`;
        ctx.beginPath();
        for (let k = k0; k <= k1; k++) {
          if (hash(k, 120 + layer) > P.chance) continue;
          const x = (k + 0.2 + hash(k, 125 + layer) * 0.6) * sp - shift;
          const w = 90 + hash(k, 130 + layer) * 150;
          const h = 500 + hash(k, 135 + layer) * 1200;
          if (hash(k, 140 + layer) < 0.5) {
            // Stalagmite rising from the floor of the map.
            ctx.moveTo(x - w, mapH);
            ctx.quadraticCurveTo(x - w * 0.35, mapH - h * 0.5, x - w * 0.2, mapH - h);
            ctx.lineTo(x + w * 0.2, mapH - h);
            ctx.quadraticCurveTo(x + w * 0.35, mapH - h * 0.5, x + w, mapH);
          } else {
            // Stalactite hanging from the ceiling.
            ctx.moveTo(x - w, 0);
            ctx.quadraticCurveTo(x - w * 0.3, h * 0.5, x, h);
            ctx.quadraticCurveTo(x + w * 0.3, h * 0.5, x + w, 0);
          }
          ctx.closePath();
        }
        ctx.fill();
      });

      // Light shafts from openings in the ceiling (fixed to the cave, slowly fading in and out).
      const S = CAVE.SHAFTS;
      const sa = S.ALPHA * (1 - storm * 0.85);
      if (sa > 0.003) {
        const col = look ? look.shaft : mixRgb(S.COLOR, S.DUSK_COLOR, dusk);
        const g0 = Math.floor((num(view.cx) - hw - S.LENGTH) / (C * S.SPACING)) - 1;
        const g1 = Math.ceil((num(view.cx) + hw + S.LENGTH) / (C * S.SPACING)) + 1;
        for (let g = g0; g <= g1; g++) {
          if (hash(g, 150) > S.CHANCE) continue;
          const i = g * S.SPACING + Math.floor(hash(g, 151) * S.SPACING);
          const y = openingY(map, i);
          if (y < 0) continue;
          const x = i * C + C / 2;
          const pulse = 1 - S.PULSE + S.PULSE * (0.5 + 0.5 * Math.sin(now * 0.3 + g * 2.3));
          const lean = 140 + hash(g, 152) * 160;
          const hwid = S.WIDTH / 2;
          const grad = ctx.createLinearGradient(0, y, 0, y + S.LENGTH);
          grad.addColorStop(0, `rgba(${col},${sa * pulse})`);
          grad.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(x - hwid, y);
          ctx.lineTo(x + hwid, y);
          ctx.lineTo(x + hwid + S.SPREAD + lean, y + S.LENGTH);
          ctx.lineTo(x - hwid + lean, y + S.LENGTH);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
      return true;
    } catch (e) {
      report(e);
      try { ctx.restore(); } catch (e2) { /* ignore */ }
      return false;
    }
  };

  return { setTime: (t) => { now = num(t); }, skyBack, skyShips, skyBirds, fogBack, fogFront, caveBackdrop };
}
