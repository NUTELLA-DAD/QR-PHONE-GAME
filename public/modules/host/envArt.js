// How the environments LOOK (rules are in environments.js): the sky and far ridges for Frost Peaks
// and Ember Forge, falling snow / rising embers / smoke, the lava in the map, and the ice crusts on the
// ship. Sky Isles draws nothing here (render.js / courseArt.js keep their original code for it).
// Everything sits on grids fixed to the world (it only slides past, never shimmers or wobbles),
// and drawing never throws: problems are reported to the pause menu instead.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { envIdOf, envOf, lavaLevel } from './environments.js';
import { createDeepArt } from './envDeepArt.js'; // Fungal Depths and The Aether
import { createStormSeaArt } from './envArtStormSea.js'; // Storm Front + Sunken Sea look

const hash = (i, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const wrap = (v, span) => ((v % span) + span) % span;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('env: ' + (e && e.message)); };
const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function createEnvArt({ ctx, state, ink }) {
  let now = 0;
  const deepArt = createDeepArt({ ctx, state, ink });
  const ssArt = createStormSeaArt({ ctx, state, ink, time: () => now });
  const GB = SHIP_LAYOUT.gasbag;
  const P = SHIP_LAYOUT.platforms;
  const isOther = () => envIdOf(state) !== config.ENVIRONMENTS.DEFAULT;
  const E = () => envOf(state);
  const env = () => state.env || { blizzard: 0, smoke: 0, heat: 0, burn: 0, wind: 0 };

  // ---------- Sky and far ridges (screen space; replaces the Sky Isles background) ----------
  const ridge = (width, height, view, R) => {
    const s = height / config.H;
    const shift = (num(view.scroll) + num(view.cx)) * R.f;
    const y0 = height * R.base + (config.H / 2 - num(view.cy)) * num(view.zoom, 1) * R.f * 0.6;
    const du = 16;
    const fn = (u) => Math.sin(u * R.freq) * 0.45 + Math.sin(u * R.freq * 2.3 + 1) * 0.35 + Math.sin(u * R.freq * 5.7 + 2) * 0.2;
    const pts = [];
    for (let u = Math.floor(shift / du) * du; (u - shift) * s <= width + du * s; u += du) {
      const h = fn(u);
      pts.push([(u - shift) * s, y0 - (h + 1) * R.amp * s, h]);
    }
    if (pts.length < 2) return;
    ctx.fillStyle = R.color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], height);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.lineTo(pts[pts.length - 1][0], height);
    ctx.closePath();
    ctx.fill();
    if (R.snow) {
      ctx.fillStyle = R.snow;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][2] < 0.55) continue;
        let j = i;
        while (j + 1 < pts.length && pts[j + 1][2] >= 0.55) j++;
        ctx.beginPath();
        for (let k = i; k <= j; k++) ctx.lineTo(pts[k][0], pts[k][1]);
        for (let k = j; k >= i; k--) ctx.lineTo(pts[k][0], pts[k][1] + (pts[k][2] - 0.55) * R.amp * s * (k % 2 ? 0.9 : 0.5));
        ctx.closePath();
        ctx.fill();
        i = j;
      }
    }
  };

  // A long soft cloud (frost) or smoke (ember) band across the sky, fixed to the landscape.
  const band = (width, height, view, f, baseY, thick, color) => {
    const s = height / config.H;
    const shift = (num(view.scroll) + num(view.cx)) * f;
    const y0 = height * baseY + (config.H / 2 - num(view.cy)) * num(view.zoom, 1) * f * 0.6;
    const du = 24;
    const top = [];
    const bot = [];
    for (let u = Math.floor(shift / du) * du; (u - shift) * s <= width + du * s; u += du) {
      const x = (u - shift) * s;
      const w1 = Math.sin(u * 0.004) * 0.6 + Math.sin(u * 0.011 + 2) * 0.4;
      const w2 = Math.sin(u * 0.005 + 1) * 0.6 + Math.sin(u * 0.013 + 4) * 0.4;
      top.push([x, y0 - thick * s * (0.6 + 0.4 * w1)]);
      bot.push([x, y0 + thick * s * (0.3 + 0.3 * w2)]);
    }
    if (top.length < 2) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [x, y] of top) ctx.lineTo(x, y);
    for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  // Returns true when it drew the whole background (so render.js skips the Sky Isles one).
  const background = (width, height, view) => {
    if (!isOther() || !(width > 0) || !(height > 0)) return false;
    const deepDone = deepArt.background(width, height, view); // Fungal Depths / The Aether (null = not theirs)
    if (deepDone !== null) return deepDone;
    if (ssArt.background(width, height, view)) return true; // Storm Front / Sunken Sea draw their own sky (envArtStormSea.js)
    try {
      const e = E();
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, '#' + e.sky[0]);
      g.addColorStop(0.7, '#' + e.sky[1]);
      g.addColorStop(1, '#' + e.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      // A soft sun (or the red glare of the forge) low in the sky.
      const sx = width * 0.74;
      const sy = height * (envIdOf(state) === 'ember' ? 0.62 : 0.2);
      const R = height * (envIdOf(state) === 'ember' ? 0.7 : 0.34);
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      glow.addColorStop(0, `rgba(${e.sun},${envIdOf(state) === 'ember' ? 0.4 : 0.34})`);
      glow.addColorStop(1, `rgba(${e.sun},0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
      const ember = envIdOf(state) === 'ember';
      band(width, height, view, 0.01, 0.2, 40, ember ? 'rgba(30,10,10,.28)' : 'rgba(255,255,255,.24)');
      band(width, height, view, 0.03, 0.42, 60, ember ? 'rgba(40,14,12,.3)' : 'rgba(255,255,255,.3)');
      ridge(width, height, view, { ...e.ridges[0], f: e.ridges[0].f });
      ridge(width, height, view, e.ridges[1]);
      const haze = ctx.createLinearGradient(0, height * 0.6, 0, height);
      haze.addColorStop(0, `rgba(${e.ridgeHaze},0)`);
      haze.addColorStop(1, `rgba(${e.ridgeHaze},${ember ? 0.5 : 0.45})`);
      ctx.fillStyle = haze;
      ctx.fillRect(0, height * 0.6, width, height * 0.4);
      band(width, height, view, 0.06, 0.66, 70, ember ? 'rgba(50,18,14,.3)' : 'rgba(255,255,255,.35)');
      ridge(width, height, view, e.ridges[2]);
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  };

  // ---------- Lava inside the map (world space, drawn before the rock so the rock covers its edges) ----------
  const lava = (view, width, height, map, b) => {
    if (envIdOf(state) !== 'ember' || !map) return;
    try {
      const L = E().LAVA;
      const y0 = lavaLevel(map, L);
      const C = map.CELL;
      const y1 = Math.min(b.y1, map.H * C);
      if (!(y1 > y0) && b.y0 > y0) return;
      const dd = num(state.course && state.course.dist);
      const x0 = b.x0;
      const x1 = b.x1;
      // Glow in the air above the surface.
      const gTop = y0 - L.GLOW;
      if (b.y0 < y0) {
        const gl = ctx.createLinearGradient(0, gTop, 0, y0);
        gl.addColorStop(0, 'rgba(255,110,30,0)');
        gl.addColorStop(1, 'rgba(255,110,30,.36)');
        ctx.fillStyle = gl;
        ctx.fillRect(x0, Math.max(gTop, b.y0), x1 - x0, y0 - Math.max(gTop, b.y0));
      }
      // The molten body, brighter at the surface.
      const body = ctx.createLinearGradient(0, y0, 0, y0 + 900);
      body.addColorStop(0, L.COLOR[0]);
      body.addColorStop(0.18, L.COLOR[1]);
      body.addColorStop(1, L.COLOR[2]);
      ctx.fillStyle = body;
      ctx.fillRect(x0, y0, x1 - x0, Math.max(0, y1 - y0));
      // Dark crust plates drifting slowly with the flow, and bright cracks between them (fixed grid).
      const du = 170;
      const flow = now * 12;
      const k0 = Math.floor((x0 + dd + flow) / du) - 1;
      const k1 = Math.ceil((x1 + dd + flow) / du) + 1;
      for (let k = k0; k <= k1; k++) {
        const h = hash(k, 200);
        if (h > 0.55) continue;
        const x = k * du - dd - flow + hash(k, 201) * du * 0.6;
        const row = hash(k, 202);
        const y = y0 + 30 + row * Math.min(380, Math.max(0, y1 - y0 - 30));
        if (y > y1) continue;
        ctx.fillStyle = 'rgba(70,20,10,.55)';
        ctx.beginPath();
        ctx.ellipse(x, y, 40 + hash(k, 203) * 70, 9 + hash(k, 204) * 12, 0, 0, 7);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,225,120,.55)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 70, y + 12);
        ctx.lineTo(x + 100 + hash(k, 205) * 40, y + 22);
        ctx.stroke();
      }
      // The bright surface line.
      ctx.fillStyle = 'rgba(255,230,140,.8)';
      ctx.fillRect(x0, y0 - 2, x1 - x0, 5);
      // Smoke plumes rising from the lava (stacked soft puffs on a fixed grid).
      const step = L.PLUME_EVERY;
      const p0 = Math.floor((x0 + dd) / step) - 1;
      const p1 = Math.ceil((x1 + dd) / step) + 1;
      for (let p = p0; p <= p1; p++) {
        if (hash(p, 210) > 0.7) continue;
        const mx = p * step + hash(p, 211) * step * 0.6;
        const i = Math.floor(mx / C);
        const j = Math.floor(y0 / C) + 1;
        if (i < 0 || i >= map.W || map.solid[j * map.W + i]) continue; // only where the lava is open to the air
        const x = mx - dd;
        for (let q = 0; q < 7; q++) {
          const r = 55 + q * 22;
          ctx.fillStyle = `rgba(40,22,22,${0.34 - q * 0.04})`;
          ctx.beginPath();
          ctx.arc(x + Math.sin(q * 1.3 + p) * 38 + q * 14, y0 - 50 - q * 120, r, 0, 7);
          ctx.fill();
        }
      }
    } catch (err) {
      report(err);
    }
  };

  // ---------- Weather in the world (snow, blizzard haze, embers, smoke), drawn over the ship ----------
  const worldFront = (view, width, height, time) => {
    if (!isOther() || !state.course) return;
    deepArt.worldFront(view, width, height, time); // fungal motes
    try {
      const zoom = num(view.zoom, 1);
      const left = num(view.cx) - width / 2 / zoom;
      const top = num(view.cy) - height / 2 / zoom;
      const vw = width / zoom;
      const vh = height / zoom;
      const dd = num(state.course.dist);
      const e = E();
      const en = env();
      if (ssArt.front(view, width, height, time)) return; // Storm Front / Sunken Sea weather and life
      if (envIdOf(state) === 'frost') {
        const S = e.SNOW;
        const n = Math.round(S.COUNT * (1 + (e.BLIZZARD.SNOW_MUL - 1) * en.blizzard));
        const slant = S.DRIFT + num(en.wind) * 2.2; // gusts blow the flakes sideways
        ctx.fillStyle = `rgba(255,255,255,${S.ALPHA})`;
        const sz = S.SIZE / Math.max(0.6, zoom);
        for (let i = 0; i < n; i++) {
          const spd = S.SPEED * (0.7 + 0.6 * hash(i, 3)) * (1 + en.blizzard * 0.8);
          const u = hash(i, 1) * S.TILE_W;
          const v = hash(i, 2) * S.TILE_H;
          const x = left + wrap(u + slant * time * (0.6 + 0.4 * hash(i, 4)) - dd * 0.15 - left, S.TILE_W);
          const y = top + wrap(v + spd * time - top, S.TILE_H);
          if (x > left + vw || y > top + vh) continue;
          const sw = sz * (0.7 + hash(i, 5) * 0.9);
          if (en.blizzard > 0.3) ctx.fillRect(x, y, sw * 3.2, sw * 0.8);
          else ctx.fillRect(x, y, sw, sw);
        }
        if (en.blizzard > 0.01) {
          ctx.fillStyle = `rgba(232,242,250,${e.BLIZZARD.HAZE * en.blizzard})`;
          ctx.fillRect(left, top, vw, vh);
        }
      } else if (envIdOf(state) === 'ember') {
        const S = e.EMBERS;
        const lavaY = num(en.lavaY, Infinity);
        for (let i = 0; i < S.COUNT; i++) {
          const spd = S.SPEED * (0.6 + 0.8 * hash(i, 3));
          const u = hash(i, 1) * S.TILE_W;
          const v = hash(i, 2) * S.TILE_H;
          const x = left + wrap(u + 14 * time * hash(i, 4) - dd * 0.2 - left, S.TILE_W);
          const y = top + wrap(v - spd * time - top, S.TILE_H);
          if (x > left + vw || y > top + vh || y > lavaY) continue;
          const a = 0.35 + 0.5 * (1 - (y - top) / vh);
          ctx.fillStyle = hash(i, 6) < 0.5 ? `rgba(255,170,60,${a})` : `rgba(255,110,40,${a})`;
          const sw = (S.SIZE * (0.6 + hash(i, 5))) / Math.max(0.6, zoom);
          ctx.fillRect(x, y, sw, sw);
        }
        if (en.smoke > 0.01) {
          // Smoke banks drifting past: big soft blobs on a fixed grid (purely visual, kept thin so the ship and enemies still read).
          const A = e.SMOKE.ALPHA * en.smoke;
          ctx.fillStyle = `rgba(36,18,18,${A * 0.55})`;
          ctx.fillRect(left, top, vw, vh);
          const du = 520;
          const k0 = Math.floor((left + dd * 0.5 + time * 40) / du) - 1;
          const k1 = Math.ceil((left + vw + dd * 0.5 + time * 40) / du) + 1;
          for (let k = k0; k <= k1; k++) {
            const x = k * du - dd * 0.5 - time * 40;
            for (let r = 0; r < 3; r++) {
              const y = top + hash(k, 220 + r) * vh;
              ctx.fillStyle = `rgba(30,14,14,${A * 0.5})`;
              ctx.beginPath();
              ctx.ellipse(x, y, 280 + hash(k, 223 + r) * 200, 120 + hash(k, 226 + r) * 100, 0, 0, 7);
              ctx.fill();
            }
          }
        }
      }
    } catch (err) {
      report(err);
    }
  };

  // ---------- Ice crusts on the ship (ship coordinates; call right after the guns are drawn) ----------
  const crustShape = (x, y, w, h) => {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.6, y - h * 1.1, x - w * 0.15, y - h * 0.9);
    ctx.quadraticCurveTo(x + w * 0.2, y - h * 1.3, x + w * 0.65, y - h * 0.8);
    ctx.quadraticCurveTo(x + w * 0.95, y - h * 0.5, x + w, y);
    ctx.closePath();
  };
  const icicles = (x, y, w, h, seed) => {
    for (let k = 0; k < 4; k++) {
      const ix = x - w * 0.7 + (k + hash(seed + k, 31) * 0.5) * (w * 1.4 / 4);
      const len = h * (0.5 + hash(seed + k, 32) * 0.9);
      ctx.beginPath();
      ctx.moveTo(ix - 7, y);
      ctx.lineTo(ix, y + len);
      ctx.lineTo(ix + 7, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };
  const drawIce = () => {
    const list = state.icing;
    if (!list || !list.length || envIdOf(state) !== 'frost') return;
    try {
      ctx.save();
      ctx.lineJoin = 'round';
      list.forEach((c, n) => {
        const lvl = Math.max(0.1, Math.min(1, num(c.lvl, 0.3)));
        ink();
        ctx.lineWidth = 2.6;
        if (c.area === 'gasbag') {
          // A crust of ice on the underside of the envelope, with icicles, and a white cap on top.
          const dx = (c.x - GB.cx) / GB.rx;
          const edge = Math.sqrt(Math.max(0, 1 - dx * dx));
          const by = GB.cy + GB.ry * edge;
          const ty = GB.cy - GB.ry * edge;
          const w = 90 + lvl * 140;
          ctx.fillStyle = '#a8dbf5';
          crustShape(c.x, by + 6, w, 16 + lvl * 26);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#e9f6ff';
          icicles(c.x, by + 4, w * 0.9, 24 + lvl * 50, n);
          ctx.fillStyle = '#ffffff';
          crustShape(c.x, ty + 16, w * 1.5, 18 + lvl * 38);
          ctx.fill();
          ctx.stroke();
        } else if (c.area === 'topdeck') {
          const y = P[c.d].y;
          const w = 50 + lvl * 90;
          ctx.fillStyle = '#b5e0f6';
          crustShape(c.x, y + 2, w * 1.2, 18 + lvl * 34);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(c.x - w * 0.2, y - 8 - lvl * 6, w * 0.4, 4 + lvl * 4, 0, 0, 7);
          ctx.fill();
        } else {
          const g = state.GUNS[c.gun];
          if (!g) return;
          const r = 26 + lvl * 34;
          ctx.fillStyle = lvl >= config.ENVIRONMENTS.frost.ICE.JAM_AT ? '#b8e2f7' : '#b5e0f6';
          ctx.beginPath();
          ctx.ellipse(g.bx, g.by, r, r * 0.8, 0, 0, 7);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(g.bx - r * 0.3, g.by - r * 0.3, r * 0.35, r * 0.2, -0.4, 0, 7);
          ctx.fill();
          // A jammed gun shows it.
          if (lvl >= config.ENVIRONMENTS.frost.ICE.JAM_AT) {
            ctx.font = '700 22px ' + config.FONTS.TEXT;
            ctx.textAlign = 'center';
            ctx.lineWidth = 5;
            ctx.strokeStyle = config.INK;
            ctx.fillStyle = '#e9f6ff';
            ctx.strokeText('ICED!', g.bx, g.by - r - 14);
            ctx.fillText('ICED!', g.bx, g.by - r - 14);
          }
        }
      });
      ctx.restore();
    } catch (err) {
      report(err);
      try { ctx.restore(); } catch (e2) { /* ignore */ }
    }
  };

  return { setTime: (t) => { now = num(t); deepArt.setTime(t); }, background, lava, worldFront, drawIce, terrain: deepArt.terrain, drawDeep: deepArt.drawShip, sea: ssArt.sea, drawShip: () => ssArt.ship(now) };
}
