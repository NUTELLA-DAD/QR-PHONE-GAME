// How Fungal Depths and The Aether LOOK (rules are in envDeep.js; the shared environment art is envArt.js, which
// calls into this file). Everything sits on grids fixed to the world, so it only slides past - no shimmer, no
// wobble - and drawing never throws: problems are reported to the pause menu instead.
//
//   background(width, height, view)  - the sky: glowing mushroom forest (fungal) / stars, aurora, islands, the world's curve (aether)
//   worldFront(view, width, height, time) - drifting bioluminescent motes (fungal)
//   terrain(floors, ceilings, map)   - mushrooms, vines and lanterns (fungal) / crystals (aether) on the rock edges (world space)
//   drawShip()                       - spore clouds, clogged engines, the oxygen tank (ship coordinates)
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { envIdOf, envOf } from './environments.js';

const hash = (i, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const wrap = (v, span) => ((v % span) + span) % span;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('envDeep: ' + (e && e.message)); };
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

export function createDeepArt({ ctx, state, ink }) {
  let now = 0;
  const P = SHIP_LAYOUT.platforms;
  const MAIN = P.findIndex((p) => p.id === 'main');
  const E = () => envOf(state);
  const id = () => envIdOf(state);

  // ---------- sky ----------
  // A far line of giant glowing mushrooms standing on dark ground (one parallax layer).
  const forest = (width, height, view, f, baseK, size, spacing, color, glow, salt) => {
    const s = height / config.H;
    const zoom = num(view.zoom, 1);
    const shift = (num(view.scroll) + num(view.cx)) * f;
    const y0 = height * baseK + (config.H / 2 - num(view.cy)) * zoom * f * 0.6;
    const k0 = Math.floor(shift / spacing) - 1;
    const k1 = Math.ceil((shift + width / s) / spacing) + 1;
    ctx.fillStyle = color;
    ctx.strokeStyle = `rgba(${glow},.4)`;
    ctx.lineWidth = Math.max(1.5, 3 * s);
    for (let k = k0; k <= k1; k++) {
      if (hash(k, salt) < 0.22) continue;
      const x = (k * spacing + hash(k, salt + 1) * spacing * 0.7 - shift) * s;
      const sz = size * (0.55 + hash(k, salt + 2) * 0.9) * s;
      const stemW = sz * 0.2;
      const stemH = sz * (0.9 + hash(k, salt + 3) * 0.8);
      ctx.beginPath();
      ctx.moveTo(x - stemW, y0 + 6);
      ctx.quadraticCurveTo(x - stemW * 0.6, y0 - stemH * 0.5, x - stemW * 0.8, y0 - stemH);
      ctx.lineTo(x + stemW * 0.8, y0 - stemH);
      ctx.quadraticCurveTo(x + stemW * 0.6, y0 - stemH * 0.5, x + stemW, y0 + 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y0 - stemH, sz * 0.85, sz * 0.5, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y0 - stemH, sz * 0.85, sz * 0.5, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.fillRect(0, y0, width, height - y0 + 2);
  };

  const fungalSky = (width, height, view) => {
    const e = E();
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#' + e.sky[0]);
    g.addColorStop(0.7, '#' + e.sky[1]);
    g.addColorStop(1, '#' + e.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    for (const [fx, fy, r, c, a] of [[0.28, 0.72, 0.7, e.sun, 0.22], [0.8, 0.3, 0.55, '190,130,255', 0.16]]) {
      const R = height * r;
      const gl = ctx.createRadialGradient(width * fx, height * fy, 0, width * fx, height * fy, R);
      gl.addColorStop(0, `rgba(${c},${a})`);
      gl.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = gl;
      ctx.fillRect(width * fx - R, height * fy - R, R * 2, R * 2);
    }
    forest(width, height, view, 0.02, 0.86, 560, 640, e.ridges[0].color, '110,255,210', 410);
    forest(width, height, view, 0.045, 0.92, 420, 460, e.ridges[1].color, '190,130,255', 420);
    const haze = ctx.createLinearGradient(0, height * 0.6, 0, height);
    haze.addColorStop(0, `rgba(${e.ridgeHaze},0)`);
    haze.addColorStop(1, `rgba(${e.ridgeHaze},.5)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, height * 0.6, width, height * 0.4);
    forest(width, height, view, 0.1, 0.98, 330, 330, e.ridges[2].color, '110,255,210', 430);
  };

  const aetherSky = (width, height, view) => {
    const e = E();
    const s = height / config.H;
    const zoom = num(view.zoom, 1);
    const shift = (num(view.scroll) + num(view.cx));
    const dy = (config.H / 2 - num(view.cy)) * zoom;
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, '#' + e.sky[0]);
    g.addColorStop(0.62, '#' + e.sky[1]);
    g.addColorStop(1, '#' + e.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    // Stars: a fixed field that slides past very slowly.
    const S = e.STARS;
    const TW = 3200;
    const sh = shift * S.PARALLAX;
    for (let i = 0; i < S.COUNT; i++) {
      const x = wrap(hash(i, 1) * TW - sh, TW) * s;
      if (x > width) continue;
      const y = hash(i, 2) * height * 0.86;
      const big = hash(i, 3);
      const sz = Math.max(1, S.SIZE * s * (0.4 + big * (big > 0.93 ? 1.6 : 0.7)));
      ctx.fillStyle = big > 0.9 ? 'rgba(200,220,255,.95)' : big > 0.5 ? 'rgba(255,255,255,.75)' : 'rgba(190,175,255,.55)';
      ctx.fillRect(x, y, sz, sz);
    }
    // Faint aurora: slow ribbons of green and violet, shaped by fixed sine waves.
    const A = e.AURORA;
    A.COLORS.forEach((col, n) => {
      const sa = shift * A.PARALLAX * (1 + n * 0.5);
      const top = [];
      const du = 28;
      for (let u = Math.floor(sa / du) * du; (u - sa) * s <= width + du * s; u += du) {
        const w = Math.sin(u * 0.0031 + n * 2) * 0.6 + Math.sin(u * 0.0087 + n) * 0.4;
        top.push([(u - sa) * s, height * (0.2 + n * 0.12) + w * height * 0.07 + dy * 0.01]);
      }
      if (top.length < 2) return;
      const len = height * 0.34;
      const yMin = Math.min(...top.map((q) => q[1]));
      const gr = ctx.createLinearGradient(0, yMin, 0, yMin + len * 2.4); // (a curtain: strongest near the top, fading to nothing at its lower edge)
      gr.addColorStop(0, `rgba(${col},0)`);
      gr.addColorStop(0.2, `rgba(${col},${A.ALPHA})`);
      gr.addColorStop(0.55, `rgba(${col},${A.ALPHA * 0.35})`);
      gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const [x, y] of top) ctx.lineTo(x, y);
      for (let i = top.length - 1; i >= 0; i--) ctx.lineTo(top[i][0], top[i][1] + len * 2.3);
      ctx.closePath();
      ctx.fill();
    });
    // The world far below: the curve of a great blue planet with a thin glowing atmosphere.
    const W = e.WORLD;
    const R = width * 1.7;
    const cx = width * 0.5;
    const cy = height * W.RISE + R + dy * 0.03;
    const pg = ctx.createLinearGradient(0, cy - R, 0, cy - R + height * 0.5);
    pg.addColorStop(0, W.COLOR[1]);
    pg.addColorStop(1, W.COLOR[0]);
    const atm = ctx.createRadialGradient(cx, cy, R * 0.985, cx, cy, R * 1.035);
    atm.addColorStop(0, `rgba(${W.ATMOS},.55)`);
    atm.addColorStop(1, `rgba(${W.ATMOS},0)`);
    ctx.fillStyle = atm;
    ctx.fillRect(0, Math.max(0, cy - R * 1.04), width, height);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 7);
    ctx.fill();
    // Cloud bands on the planet (world-fixed streaks along its curve).
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, 7);
    ctx.clip();
    for (let k = 0; k < 9; k++) {
      const x0 = wrap(hash(k, 440) * 4200 - shift * 0.012, 4200) * s - 400 * s;
      const yy = cy - R + (20 + hash(k, 441) * 0.36 * height) + 30 * s * k * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${0.1 + hash(k, 442) * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(x0, yy, (260 + hash(k, 443) * 380) * s, (10 + hash(k, 444) * 16) * s, 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    // Far floating islands drifting in front of the planet.
    const I = e.ISLANDS;
    const sp = 1500;
    const si = shift * I.PARALLAX;
    for (let k = Math.floor(si / sp) - 1; k <= Math.ceil((si + width / s) / sp) + 1; k++) {
      for (let q = 0; q < 2; q++) {
        if (hash(k * 2 + q, 450) > I.COUNT / 10) continue;
        const x = (k * sp + hash(k * 2 + q, 451) * sp - si) * s;
        const y = height * (0.2 + hash(k * 2 + q, 452) * 0.4) + dy * 0.04;
        const w = (90 + hash(k * 2 + q, 453) * 190) * s;
        const h = w * (0.55 + hash(k * 2 + q, 454) * 0.5);
        const glow = ctx.createRadialGradient(x, y + h * 0.4, 0, x, y + h * 0.4, w * 1.5);
        glow.addColorStop(0, `rgba(${I.GLOW},.16)`);
        glow.addColorStop(1, `rgba(${I.GLOW},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(x - w * 1.5, y - w, w * 3, w * 3);
        ctx.fillStyle = I.COLOR;
        ctx.beginPath();
        ctx.moveTo(x - w, y);
        ctx.quadraticCurveTo(x - w * 0.9, y - h * 0.25, x - w * 0.4, y - h * 0.28);
        ctx.quadraticCurveTo(x, y - h * 0.4, x + w * 0.5, y - h * 0.25);
        ctx.quadraticCurveTo(x + w * 0.95, y - h * 0.2, x + w, y);
        ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.15, x + w * 0.15, y + h);
        ctx.quadraticCurveTo(x, y + h * 1.1, x - w * 0.2, y + h * 0.8);
        ctx.quadraticCurveTo(x - w * 0.6, y + h * 0.2, x - w, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = `rgba(${I.GLOW},.35)`;
        ctx.lineWidth = Math.max(1.2, 2.4 * s);
        ctx.beginPath();
        ctx.moveTo(x - w * 0.95, y - h * 0.05);
        ctx.quadraticCurveTo(x - w * 0.4, y - h * 0.3, x + w * 0.5, y - h * 0.25);
        ctx.stroke();
      }
    }
  };

  // Returns true when it drew the whole background, false when it failed, null when this is not one of ours.
  const background = (width, height, view) => {
    const which = id();
    if (which !== 'fungal' && which !== 'aether') return null;
    if (!(width > 0) || !(height > 0)) return false;
    try {
      if (which === 'fungal') fungalSky(width, height, view);
      else aetherSky(width, height, view);
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  };

  // ---------- motes (world space, drawn over the ship) ----------
  const worldFront = (view, width, height, time) => {
    if (id() !== 'fungal' || !state.course) return;
    try {
      const zoom = num(view.zoom, 1);
      const left = num(view.cx) - width / 2 / zoom;
      const top = num(view.cy) - height / 2 / zoom;
      const vw = width / zoom;
      const vh = height / zoom;
      const dd = num(state.course.dist);
      const M = E().MOTES;
      for (let i = 0; i < M.COUNT; i++) {
        const u = hash(i, 1) * M.TILE_W;
        const v = hash(i, 2) * M.TILE_H;
        const x = left + wrap(u + 10 * time * hash(i, 4) - dd * 0.25 - left, M.TILE_W);
        const y = top + wrap(v - M.SPEED * (0.5 + hash(i, 3)) * time - top, M.TILE_H);
        if (x > left + vw || y > top + vh) continue;
        const sz = (M.SIZE * (0.5 + hash(i, 5))) / Math.max(0.6, zoom);
        const col = M.COLORS[hash(i, 6) < 0.6 ? 0 : 1];
        ctx.fillStyle = `rgba(${col},.16)`;
        ctx.fillRect(x - sz, y - sz, sz * 3, sz * 3);
        ctx.fillStyle = `rgba(${col},.8)`;
        ctx.fillRect(x, y, sz, sz);
      }
    } catch (err) {
      report(err);
    }
  };

  // ---------- rock decoration (world space; called by courseArt with the edge pieces it found) ----------
  // One glowing mushroom standing on (or hanging from) a point. s = size, dir 1 = standing, -1 = hanging.
  const mushroom = (x, y, s, cap, dir, glowA) => {
    const col = rgb(cap);
    ctx.save();
    ctx.translate(x, y);
    if (dir < 0) ctx.scale(1, -1);
    const stemH = 38 * s;
    const capW = 34 * s;
    const capH = 24 * s;
    ctx.fillStyle = `rgba(${col},${glowA})`;
    ctx.beginPath();
    ctx.arc(0, -stemH - capH * 0.2, capW * 1.7, 0, 7);
    ctx.fill();
    ctx.fillStyle = `rgba(${col},${glowA * 0.9})`;
    ctx.beginPath();
    ctx.arc(0, -stemH - capH * 0.2, capW * 1.05, 0, 7);
    ctx.fill();
    ink();
    ctx.lineWidth = 2.6;
    ctx.fillStyle = '#e8def7';
    ctx.beginPath();
    ctx.moveTo(-6 * s, 2);
    ctx.quadraticCurveTo(-4 * s, -stemH * 0.5, -5 * s, -stemH);
    ctx.lineTo(5 * s, -stemH);
    ctx.quadraticCurveTo(4 * s, -stemH * 0.5, 7 * s, 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.ellipse(0, -stemH, capW, capH, 0, Math.PI, 0);
    ctx.quadraticCurveTo(0, -stemH + capH * 0.35, -capW, -stemH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    for (const [dx, dy, r] of [[-0.45, -0.55, 0.16], [0.2, -0.75, 0.2], [0.55, -0.35, 0.13]]) {
      ctx.beginPath();
      ctx.ellipse(dx * capW, -stemH + dy * capH, r * capW * 0.7, r * capH * 0.8, 0, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  };

  // A crystal spike (aether), standing (dir 1) or hanging (dir -1).
  const crystal = (x, y, s, col, dir) => {
    ctx.save();
    ctx.translate(x, y);
    if (dir < 0) ctx.scale(1, -1);
    const c = rgb(col);
    ctx.fillStyle = `rgba(${c},.16)`;
    ctx.beginPath();
    ctx.arc(0, -34 * s, 44 * s, 0, 7);
    ctx.fill();
    ink();
    ctx.lineWidth = 2.6;
    ctx.fillStyle = col;
    for (const [dx, h, w] of [[-14, 0.6, 9], [0, 1, 12], [15, 0.7, 9]]) {
      ctx.beginPath();
      ctx.moveTo((dx - w) * s, 3);
      ctx.lineTo((dx - w * 0.7) * s, -60 * s * h);
      ctx.lineTo(dx * s, -80 * s * h);
      ctx.lineTo((dx + w * 0.7) * s, -60 * s * h);
      ctx.lineTo((dx + w) * s, 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(-4 * s, -66 * s, 3 * s, 28 * s);
    ctx.restore();
  };

  const terrain = (floors, ceilings) => {
    const which = id();
    if (which !== 'fungal' && which !== 'aether') return;
    try {
      const e = E();
      if (which === 'fungal') {
        const M = e.MUSHROOMS;
        for (const [[ax, ay], [bx, by], i, j] of floors) {
          if (hash(i * 31 + j, 300) > M.CHANCE) continue;
          const cnt = 1 + Math.floor(hash(i + j, 301) * 2.6);
          for (let n = 0; n < cnt; n++) {
            const t = hash(i * 7 + j + n * 13, 302 + n);
            const giant = hash(i * 5 + j * 3 + n, 305) < M.GIANT;
            const s = giant ? 2.2 + hash(i + n, 306) * 1.4 : 0.6 + hash(j + n, 307) * 0.9;
            mushroom(ax + (bx - ax) * t, ay + (by - ay) * t + 5, s, M.CAPS[Math.floor(hash(i * 3 + j + n, 308) * M.CAPS.length)], 1, M.GLOW);
          }
        }
        for (const [[ax, ay], [bx, by], i, j] of ceilings) {
          const x = (ax + bx) / 2;
          const y = (ay + by) / 2;
          const h = hash(i * 17 + j, 55); // (the same roll courseArt uses for its stalactites and vines)
          if (h >= 0.18 && h < 0.28) {
            // The end of a hanging vine carries a glowing bulb.
            const len = 60 + hash(j, 57) * 140;
            ctx.fillStyle = 'rgba(110,255,210,.16)';
            ctx.beginPath();
            ctx.arc(x - 6, y + len, 30, 0, 7);
            ctx.fill();
            ink();
            ctx.lineWidth = 2.4;
            ctx.fillStyle = '#7dffd8';
            ctx.beginPath();
            ctx.arc(x - 6, y + len + 4, 9, 0, 7);
            ctx.fill();
            ctx.stroke();
          } else if (h >= 0.28 && h < 0.4) {
            mushroom(x, y - 4, 0.55 + hash(i, 309) * 0.5, M.CAPS[Math.floor(hash(j, 310) * M.CAPS.length)], -1, M.GLOW * 1.2);
          }
        }
      } else {
        for (const [[ax, ay], [bx, by], i, j] of floors) {
          if (hash(i * 29 + j, 320) > 0.3) continue;
          const t = hash(i + j * 3, 321);
          crystal(ax + (bx - ax) * t, ay + (by - ay) * t + 4, 0.6 + hash(i, 322) * 0.9, hash(j, 323) < 0.5 ? '#8f7bff' : '#6fe0ff', 1);
        }
        for (const [[ax, ay], [bx, by], i, j] of ceilings) {
          if (hash(i * 23 + j, 324) > 0.2) continue;
          crystal((ax + bx) / 2, (ay + by) / 2 - 3, 0.4 + hash(j, 325) * 0.6, hash(i, 326) < 0.5 ? '#b49cff' : '#7fe8ff', -1);
        }
      }
    } catch (err) {
      report(err);
    }
  };

  // ---------- on the ship (ship coordinates, right after the guns) ----------
  const cloud = (c) => {
    const col = E().SPORES.COLOR;
    const y = c.y;
    for (let n = 0; n < 11; n++) {
      const a = hash(c.seed * 13 + n, 500) * 6.283;
      const r = Math.sqrt(hash(c.seed * 17 + n, 501));
      const px = c.x + Math.cos(a) * r * c.rx * 0.62;
      const py = y + Math.sin(a) * r * c.ry * 0.62;
      const pr = Math.min(c.rx, c.ry * 1.4) * (0.42 + hash(c.seed * 19 + n, 502) * 0.3);
      ctx.fillStyle = `rgba(${col},.085)`;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, 7);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${col},.14)`;
    ctx.beginPath();
    ctx.ellipse(c.x, y, c.rx * 0.55, c.ry * 0.5, 0, 0, 7);
    ctx.fill();
    for (let n = 0; n < 16; n++) {
      const a = hash(c.seed * 23 + n, 503) * 6.283;
      const r = Math.sqrt(hash(c.seed * 29 + n, 504));
      ctx.fillStyle = 'rgba(214,255,150,.75)';
      ctx.fillRect(c.x + Math.cos(a) * r * c.rx * 0.9, y + Math.sin(a) * r * c.ry * 0.9, 4, 4);
    }
  };

  const clogBlob = (c, n) => {
    const lvl = Math.max(0.1, Math.min(1, num(c.lvl, 0.1)));
    const x = c.x;
    const y = P[c.d].y + 22;
    ink();
    ctx.lineWidth = 2.6;
    for (let k = 0; k < 6; k++) {
      const a = hash(k + n * 7, 510) * 3.2 + 0.1 * Math.PI;
      const r = (10 + lvl * 26) * (0.6 + hash(k, 511) * 0.6);
      const px = x + Math.cos(a * 2) * (14 + lvl * 34) * 0.9;
      const py = y - Math.abs(Math.sin(a)) * (10 + lvl * 28);
      ctx.fillStyle = k % 2 ? '#8ed44f' : '#6fb53f';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(230,255,170,.8)';
    for (let k = 0; k < 4; k++) ctx.fillRect(x - 22 + hash(k + n, 512) * 44, y - 36 * lvl - hash(k, 513) * 14, 4, 4);
    if (lvl > 0.5) {
      ctx.font = '700 22px ' + config.FONTS.TEXT;
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = config.INK;
      ctx.fillStyle = '#d9ffa6';
      ctx.strokeText('CLOGGED!', x, y - 56 - lvl * 30);
      ctx.fillText('CLOGGED!', x, y - 56 - lvl * 30);
    }
  };

  const tank = () => {
    const T = state.o2tank;
    if (!T) return;
    const o2 = Math.max(0, Math.min(1, num(state.env.o2, 1)));
    const x = T.x;
    const y = P[MAIN].y;
    ctx.save();
    ink();
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    // body
    ctx.fillStyle = '#9fc0d4';
    ctx.beginPath();
    ctx.moveTo(x - 24, y);
    ctx.lineTo(x - 24, y - 86);
    ctx.quadraticCurveTo(x - 24, y - 112, x, y - 112);
    ctx.quadraticCurveTo(x + 24, y - 112, x + 24, y - 86);
    ctx.lineTo(x + 24, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // valve on top
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(x - 7, y - 128, 14, 18);
    ctx.strokeRect(x - 7, y - 128, 14, 18);
    ctx.fillRect(x - 18, y - 134, 36, 8);
    ctx.strokeRect(x - 18, y - 134, 36, 8);
    // gauge window with the oxygen level
    ctx.fillStyle = '#16202c';
    ctx.fillRect(x - 12, y - 96, 24, 62);
    const col = o2 > 0.4 ? '#7fe8ff' : o2 > 0.2 ? '#ffd23f' : '#ff5a4a';
    ctx.fillStyle = col;
    ctx.fillRect(x - 10, y - 34 - 58 * o2, 20, 58 * o2);
    ctx.strokeRect(x - 12, y - 96, 24, 62);
    ctx.font = '700 17px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1b1410';
    ctx.fillText('O2', x, y - 14);
    // feet
    ctx.fillStyle = '#6d8497';
    ctx.fillRect(x - 28, y - 6, 56, 6);
    ctx.strokeRect(x - 28, y - 6, 56, 6);
    if (o2 < 0.3) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = config.INK;
      ctx.fillStyle = o2 <= 0 ? '#ff5a4a' : '#ffd23f';
      ctx.font = '700 22px ' + config.FONTS.TEXT;
      ctx.strokeText(o2 <= 0 ? 'EMPTY!' : 'LOW O2', x, y - 146);
      ctx.fillText(o2 <= 0 ? 'EMPTY!' : 'LOW O2', x, y - 146);
    }
    ctx.restore();
  };

  const drawShip = () => {
    const which = id();
    if (which !== 'fungal' && which !== 'aether') return;
    try {
      ctx.save();
      ctx.lineJoin = 'round';
      if (which === 'fungal') {
        (state.clogs || []).forEach((c, n) => { if (c.lvl >= 0.08) clogBlob(c, n); });
        for (const c of state.spores || []) cloud(c);
      } else tank();
      ctx.restore();
    } catch (err) {
      report(err);
      try { ctx.restore(); } catch (e2) { /* ignore */ }
    }
  };

  return { setTime: (t) => { now = num(t); void now; }, background, worldFront, terrain, drawShip };
}
