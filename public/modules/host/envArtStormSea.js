// How Storm Front and Sunken Sea LOOK (the rules are in envStormSea.js; envArt.js hands over to this file).
//  Storm: slate sky with dark cloud banks, wind streaks and a gust banner, lightning rods on the top deck
//         with a charging ring and sparks.
//  Sea:   a rolling ocean in the map (drawn under the rock so rocks poke out of it), sunken wrecks,
//         survivors on wreckage, waterspouts, gulls, spray at the keel, the winch rope, flood water in the
//         lower deck and the bilge pump.
// Everything sits on grids fixed to the world (it only slides past); waves roll smoothly with time.
// Drawing never throws: problems are reported to the pause menu instead. Nothing from the internet.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toShipX, toShipY } from './pose.js';
import { envIdOf, envOf } from './environments.js';
import { seaLevel } from './envStormSea.js';
import { solidAt } from './maps.js';

const hash = (i, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const wrap = (v, span) => ((v % span) + span) % span;
const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('storm/sea: ' + (e && e.message)); };

export function createStormSeaArt({ ctx, state, ink, time }) {
  const mship = mainShip(state); // (the ship; `ship` below is the layer drawn on her)
  const layout = mship.layout; // (this ship's own layout)
  const P = layout.platforms;
  const CAT = layout.deckIndex('catwalk');
  const LOWER = layout.deckIndex('lower');
  const isStorm = () => envIdOf(state) === 'storm';
  const isSea = () => envIdOf(state) === 'sea';

  // A long soft band across the sky, fixed to the landscape (same idea as the other environments).
  const band = (width, height, view, f, baseY, thick, color) => {
    const s = height / config.H;
    const shift = num(view.cx) * f;
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
  const ridge = (width, height, view, R) => {
    const s = height / config.H;
    const shift = num(view.cx) * R.f;
    const y0 = height * R.base + (config.H / 2 - num(view.cy)) * num(view.zoom, 1) * R.f * 0.6;
    const du = 16;
    const fn = (u) => Math.sin(u * R.freq) * 0.45 + Math.sin(u * R.freq * 2.3 + 1) * 0.35 + Math.sin(u * R.freq * 5.7 + 2) * 0.2;
    ctx.fillStyle = R.color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let u = Math.floor(shift / du) * du; (u - shift) * s <= width + du * s; u += du) ctx.lineTo((u - shift) * s, y0 - (fn(u) + 1) * R.amp * s);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  };
  // Big rounded cloud masses on a fixed grid (storm).
  const clouds = (width, height, view, f, baseY, size, color) => {
    const s = height / config.H;
    const shift = num(view.cx) * f;
    const y0 = height * baseY + (config.H / 2 - num(view.cy)) * num(view.zoom, 1) * f * 0.6;
    const du = size * 1.1;
    ctx.fillStyle = color;
    for (let k = Math.floor(shift / du) - 1; (k * du - shift) * s <= width + du * s; k++) {
      const x = (k * du + hash(k, 301) * du * 0.5 - shift) * s;
      for (let q = 0; q < 4; q++) {
        ctx.beginPath();
        ctx.ellipse(x + (q - 1.5) * size * 0.34 * s, y0 + (hash(k, 302 + q) - 0.5) * size * 0.18 * s, size * (0.3 + hash(k, 306 + q) * 0.22) * s, size * (0.16 + hash(k, 310 + q) * 0.1) * s, 0, 0, 7);
        ctx.fill();
      }
    }
  };

  // Returns true when it drew the whole sky (envArt.background hands over for these two).
  const background = (width, height, view) => {
    if (!(isStorm() || isSea()) || !(width > 0) || !(height > 0)) return false;
    try {
      const e = envOf(state);
      const g = ctx.createLinearGradient(0, 0, 0, height);
      g.addColorStop(0, '#' + e.sky[0]);
      g.addColorStop(0.7, '#' + e.sky[1]);
      g.addColorStop(1, '#' + e.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      if (isStorm()) {
        clouds(width, height, view, 0.008, 0.1, 900, 'rgba(18,22,34,.7)');
        clouds(width, height, view, 0.016, 0.26, 760, 'rgba(30,38,56,.62)');
        ridge(width, height, view, e.ridges[0]);
        clouds(width, height, view, 0.03, 0.48, 640, 'rgba(46,56,78,.55)');
        ridge(width, height, view, e.ridges[1]);
        const haze = ctx.createLinearGradient(0, height * 0.55, 0, height);
        haze.addColorStop(0, `rgba(${e.ridgeHaze},0)`);
        haze.addColorStop(1, `rgba(${e.ridgeHaze},.5)`);
        ctx.fillStyle = haze;
        ctx.fillRect(0, height * 0.55, width, height * 0.45);
        ridge(width, height, view, e.ridges[2]);
      } else {
        const sx = width * 0.72;
        const sy = height * 0.18;
        const R = height * 0.4;
        const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        glow.addColorStop(0, `rgba(${e.sun},.55)`);
        glow.addColorStop(1, `rgba(${e.sun},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
        band(width, height, view, 0.01, 0.16, 36, 'rgba(255,255,255,.34)');
        band(width, height, view, 0.03, 0.34, 54, 'rgba(255,255,255,.4)');
        ridge(width, height, view, e.ridges[0]);
        ridge(width, height, view, e.ridges[1]);
        const haze = ctx.createLinearGradient(0, height * 0.6, 0, height);
        haze.addColorStop(0, `rgba(${e.ridgeHaze},0)`);
        haze.addColorStop(1, `rgba(${e.ridgeHaze},.5)`);
        ctx.fillStyle = haze;
        ctx.fillRect(0, height * 0.6, width, height * 0.4);
        band(width, height, view, 0.06, 0.62, 60, 'rgba(255,255,255,.4)');
        ridge(width, height, view, e.ridges[2]);
      }
      return true;
    } catch (err) {
      report(err);
      return false;
    }
  };

  // ---------- The sea inside the map (world space, before the rock so rock covers its edges) ----------
  const waveY = (y0, ux, t, A, k) => y0 + A * (Math.sin(ux * 0.011 + t * 1.3 + k) * 0.6 + Math.sin(ux * 0.027 - t * 0.9 + k * 2) * 0.4);

  const wreck = (x, y0, s, k) => {
    // A sunken ship's hull listing out of the water: dark planks, broken ribs, a snapped mast.
    ctx.save();
    ctx.translate(x, y0);
    ctx.rotate((hash(k, 21) - 0.5) * 0.5);
    ctx.scale(s * (hash(k, 22) < 0.5 ? -1 : 1), s);
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = '#4b3a2f';
    ctx.beginPath();
    ctx.moveTo(-170, -34);
    ctx.quadraticCurveTo(-120, 40, 0, 52);
    ctx.quadraticCurveTo(120, 40, 190, -70);
    ctx.lineTo(120, -40);
    ctx.lineTo(60, -62);
    ctx.lineTo(-20, -36);
    ctx.lineTo(-80, -58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(20,12,8,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let r = -120; r <= 120; r += 40) {
      ctx.moveTo(r, -36 + Math.abs(r) * 0.05);
      ctx.lineTo(r * 0.9, 30);
    }
    ctx.stroke();
    ink();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-20, -36);
    ctx.lineTo(-34, -200);
    ctx.moveTo(-34, -150);
    ctx.lineTo(40, -176);
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,170,120,.5)';
    ctx.beginPath();
    ctx.ellipse(-60, -4, 36, 10, 0, 0, 7);
    ctx.ellipse(70, 8, 28, 8, 0, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  const survivor = (x, y, sv, t) => {
    const bob = Math.sin(t * 1.6 + sv.ph) * 5;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(Math.sin(t * 1.1 + sv.ph) * 0.07);
    // A bit of wreckage (planks and a barrel) with someone waving on it.
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = '#7a5a3a';
    ctx.beginPath();
    ctx.roundRect(-74, -8, 148, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#9a7248';
    ctx.beginPath();
    ctx.roundRect(-50, -20, 54, 14, 3);
    ctx.fill();
    ctx.stroke();
    for (let q = 0; q < sv.n; q++) {
      const px = -30 + q * 46;
      ctx.fillStyle = q % 2 ? '#e8a23c' : '#d65a4a';
      ctx.beginPath();
      ctx.roundRect(px - 11, -52, 22, 34, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8d3b0';
      ctx.beginPath();
      ctx.arc(px, -62, 11, 0, 7);
      ctx.fill();
      ctx.stroke();
      // The waving arm.
      const a = -1.2 + Math.sin(t * 7 + q * 2 + sv.ph) * 0.5;
      ctx.beginPath();
      ctx.moveTo(px + 8, -46);
      ctx.lineTo(px + 8 + Math.cos(a) * 30, -46 + Math.sin(a) * 30);
      ctx.stroke();
    }
    ctx.restore();
  };

  // A waterspout: a spinning pale column that widens toward the top, with bands curling round it.
  const spout = (x, y0, H, r, t, k) => {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const f0 = i / n;
      const f1 = (i + 1) / n;
      const w0 = r * (1.0 + f0 * 2.8);
      const w1 = r * (1.0 + f1 * 2.8);
      const sway0 = Math.sin(f0 * 3 + t * 0.7 + k) * r * 0.6 * f0;
      const sway1 = Math.sin(f1 * 3 + t * 0.7 + k) * r * 0.6 * f1;
      ctx.fillStyle = `rgba(150,172,190,${0.88 - f0 * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(x + sway0 - w0, y0 - H * f0);
      ctx.lineTo(x + sway1 - w1, y0 - H * f1);
      ctx.lineTo(x + sway1 + w1, y0 - H * f1);
      ctx.lineTo(x + sway0 + w0, y0 - H * f0);
      ctx.closePath();
      ctx.fill();
      // Spinning stripes (the phase runs with time, so they visibly turn).
      ctx.strokeStyle = 'rgba(52,80,100,.8)';
      ctx.lineWidth = 3;
      const ph = Math.sin(t * 6 + i * 1.7 + k) * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + sway0 + w0 * ph, y0 - H * f0);
      ctx.lineTo(x + sway1 + w1 * (ph * -0.6 + 0.2), y0 - H * f1);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(244,251,255,.7)';
    ctx.beginPath();
    ctx.ellipse(x, y0, r * 3.2, 20, 0, 0, 7); // the spray ring where it meets the water
    ctx.fill();
  };

  const sea = (view, width, height, map, b) => {
    if (!isSea() || !map) return;
    try {
      const F = envOf(state);
      const L = F.SEA;
      const y0 = seaLevel(map, L);
      const C = map.CELL;
      const y1 = Math.min(b.y1, map.H * C);
      if (!(y1 > y0) && b.y0 > y0) return;
      if (b.y1 < y0 - 1200) return; // (the window is entirely above the water and its tall things)
      const t = time();
      const x0 = b.x0;
      const x1 = b.x1;
      const A = L.WAVE_AMP;
      // Body of the water with depth shading.
      const body = ctx.createLinearGradient(0, y0, 0, y0 + 1400);
      body.addColorStop(0, L.COLOR[0]);
      body.addColorStop(0.2, L.COLOR[1]);
      body.addColorStop(1, L.COLOR[2]);
      ctx.fillStyle = body;
      ctx.beginPath();
      const du = 36;
      const u0 = Math.floor(x0 / du) * du;
      ctx.moveTo(u0, y1);
      for (let u = u0; u <= x1 + du; u += du) ctx.lineTo(u, waveY(y0, u, t, A, 0));
      ctx.lineTo(x1 + du, y1);
      ctx.closePath();
      ctx.fill();
      // Sunken wrecks poking out (fixed grid along the map).
      const W = L.WRECKS;
      const k0 = Math.floor(x0 / W.EVERY) - 1;
      const k1 = Math.ceil(x1 / W.EVERY) + 1;
      for (let k = k0; k <= k1; k++) {
        if (hash(k, 500) > W.CHANCE) continue;
        const mx = k * W.EVERY + hash(k, 501) * W.EVERY * 0.7;
        if (solidAt(map, mx, y0 + 40) || solidAt(map, mx - 160, y0 + 40) || solidAt(map, mx + 160, y0 + 40)) continue; // only on open water
        if (mx < x0 - 400 || mx > x1 + 400) continue;
        wreck(mx, waveY(y0, mx, t, A, 0) + 10, 0.9 + hash(k, 502) * 0.7, k);
      }
      // A second, lighter wave layer in front of the wrecks (so their feet are in the water), foam on the crests.
      ctx.fillStyle = 'rgba(70,170,200,.55)';
      ctx.beginPath();
      ctx.moveTo(u0, y1);
      for (let u = u0; u <= x1 + du; u += du) ctx.lineTo(u, waveY(y0 + 8, u, t * 1.15, A * 1.1, 2.3));
      ctx.lineTo(x1 + du, y1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = L.FOAM;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let u = u0; u <= x1 + du; u += du) {
        const y = waveY(y0 + 8, u, t * 1.15, A * 1.1, 2.3);
        if (u === u0) ctx.moveTo(u, y);
        else ctx.lineTo(u, y);
      }
      ctx.stroke();
      // Foam flecks and glints on a fixed grid.
      ctx.fillStyle = 'rgba(244,251,255,.7)';
      for (let u = u0; u <= x1; u += du * 3) {
        const h = hash(u / du, 510);
        if (h > 0.5) continue;
        ctx.fillRect(u, waveY(y0 + 8, u, t * 1.15, A * 1.1, 2.3) + 10 + h * 80, 30 + h * 50, 3);
      }
      // Survivors on wreckage.
      for (const sv of state.sea.survivors) {
        if (sv.saved) continue;
        const sx = sv.mx;
        if (sx < x0 - 200 || sx > x1 + 200) continue;
        survivor(sx, waveY(y0 + 8, sv.mx, t * 1.15, A * 1.1, 2.3) + 4, sv, t);
      }
      // Waterspouts.
      for (const sp of state.sea.spouts) {
        const sx = sp.x;
        if (sx < x0 - 400 || sx > x1 + 400) continue;
        spout(sx, waveY(y0, sp.x, t, A, 0), F.SPOUT.HEIGHT, sp.r, t, sp.id);
      }
    } catch (err) {
      report(err);
    }
  };

  // ---------- Weather and life drawn over the ship (world space) ----------
  const front = (view, width, height, tm) => {
    const storm = isStorm();
    const seaEnv = isSea();
    if (!storm && !seaEnv) return false;
    try {
      const zoom = num(view.zoom, 1);
      const left = num(view.cx) - width / 2 / zoom;
      const top = num(view.cy) - height / 2 / zoom;
      const vw = width / zoom;
      const vh = height / zoom;
      const cam = num(view.cx); // (the gulls slide slower than the world: they follow the camera)
      const en = state.env || {};
      if (storm) {
        const gale = num(en.gale);
        const dir = num(en.windDir, 1) >= 0 ? 1 : -1;
        if (gale > 0.02) {
          // Wind streaks racing across (long pale lines on a fixed grid, sliding with the gust).
          ctx.strokeStyle = `rgba(225,235,248,${0.5 * gale})`;
          ctx.lineWidth = 3 / Math.max(0.6, zoom);
          ctx.lineCap = 'round';
          ctx.beginPath();
          const n = 26;
          for (let i = 0; i < n; i++) {
            const sp = 1500 + hash(i, 1) * 1100;
            const x = left + wrap(hash(i, 2) * (vw + 1200) + dir * tm * sp - left, vw + 1200) - 600;
            const y = top + hash(i, 3) * vh;
            const len = 140 + hash(i, 4) * 220;
            ctx.moveTo(x, y);
            ctx.lineTo(x - dir * len, y + 6);
          }
          ctx.stroke();
          // A banner with arrows: which way the gust is shoving.
          if (gale > 0.25) {
            const bx = left + vw / 2;
            const by = top + vh * 0.16;
            ctx.save();
            ctx.globalAlpha = Math.min(1, gale * 1.4);
            ctx.translate(bx, by);
            ctx.scale(1 / Math.max(0.6, zoom), 1 / Math.max(0.6, zoom));
            ink();
            ctx.lineWidth = 5;
            ctx.fillStyle = 'rgba(40,52,76,.82)';
            ctx.beginPath();
            ctx.roundRect(-190, -34, 380, 68, 14);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#e9f1ff';
            ctx.font = '31px ' + config.FONTS.DISPLAY;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(dir > 0 ? 'GUST  >>>' : '<<<  GUST', 0, 2);
            ctx.restore();
          }
        }
      }
      if (seaEnv) {
        const F = envOf(state);
        const s = state.sea;
        const y0 = num(en.seaY, Infinity);
        // Gulls wheeling over the water.
        if (Number.isFinite(y0)) {
          ink();
          ctx.lineWidth = 3 / Math.max(0.6, zoom);
          ctx.lineCap = 'round';
          for (let i = 0; i < F.SEA.GULLS; i++) {
            const x = left + wrap(hash(i, 601) * vw * 1.6 + tm * (40 + hash(i, 602) * 50) * (hash(i, 603) < 0.5 ? 1 : -1) + cam * 0.7, vw * 1.6) - vw * 0.3;
            const y = Math.min(y0 - 120, top + vh * 0.3 + hash(i, 604) * vh * 0.5) + Math.sin(tm * 0.8 + i) * 40;
            const flap = Math.sin(tm * 7 + i * 3) * 12;
            ctx.beginPath();
            ctx.moveTo(x - 22, y + flap * 0.4);
            ctx.quadraticCurveTo(x - 11, y - 10 - flap, x, y);
            ctx.quadraticCurveTo(x + 11, y - 10 - flap, x + 22, y + flap * 0.4);
            ctx.stroke();
          }
          // Sea spray where the keel cuts the water.
          if (num(s.spray) > 0.05) {
            const c = state.course;
            const keel = (c && c.refY != null ? c.refY : mship.pose.y + layout.refPoint.y) + F.SEA.KEEL;
            for (let i = 0; i < 26; i++) {
              const ph = wrap(tm * 1.8 + hash(i, 611), 1);
              const x = toWorldX(mship, 460 + hash(i, 612) * 700 + (hash(i, 613) - 0.5) * 60 * ph);
              const y = Math.min(keel + 20, y0 + 10) - Math.sin(ph * Math.PI) * (70 + hash(i, 614) * 90);
              ctx.fillStyle = `rgba(244,251,255,${0.75 * s.spray * (1 - ph * 0.5)})`;
              ctx.beginPath();
              ctx.arc(x, y, 3 + hash(i, 615) * 4, 0, 7);
              ctx.fill();
            }
          }
        }
      }
    } catch (err) {
      report(err);
    }
    return true;
  };

  // ---------- Things on the ship (ship coordinates; drawn right after the guns) ----------
  const rod = (r, charge, tm) => {
    const y = P[r.d].y;
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = '#9aa7b6';
    ctx.beginPath();
    ctx.roundRect(r.x - 16, y - 12, 32, 12, 3);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#4a5260';
    ctx.beginPath();
    ctx.moveTo(r.x, y - 10);
    ctx.lineTo(r.x, y - 140);
    ctx.stroke();
    ctx.lineWidth = 3;
    ink();
    ctx.beginPath();
    ctx.moveTo(r.x, y - 10);
    ctx.lineTo(r.x, y - 140);
    ctx.stroke();
    const live = !!charge;
    const held = r.held > 0;
    ctx.fillStyle = held ? '#9fe8ff' : live ? `rgba(255,${200 + Math.sin(tm * 14) * 40},80,1)` : '#ffe27a';
    ctx.beginPath();
    ctx.arc(r.x, y - 150, held ? 22 : 17, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (live || held) {
      const R = 42 + Math.sin(tm * 12) * 5;
      ctx.strokeStyle = held ? 'rgba(159,232,255,.85)' : 'rgba(255,240,120,.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, y - 150, R, 0, 7);
      ctx.stroke();
      if (live && !held) {
        ctx.font = '31px ' + config.FONTS.DISPLAY;
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = config.INK;
        ctx.fillStyle = '#fff27a';
        ctx.strokeText('HOLD!', r.x, y - 205);
        ctx.fillText('HOLD!', r.x, y - 205);
      }
    }
  };

  const ship = (tm) => {
    if (!isStorm() && !isSea()) return;
    try {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (isStorm() && state.stormJob) {
        const J = state.stormJob;
        for (const r of J.rods) rod(r, J.charge, tm);
        const c = J.charge;
        if (c) {
          // The charging bolt: a crackling ball in the cloud over the ship and a ring that closes (time left).
          const f = Math.max(0, c.t / c.max);
          const cx = c.x;
          const cy = -330;
          ctx.strokeStyle = c.held ? 'rgba(159,232,255,.9)' : 'rgba(255,245,140,.95)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(cx, cy, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
          ctx.stroke();
          ctx.fillStyle = c.held ? 'rgba(159,232,255,.6)' : `rgba(255,245,160,${0.4 + 0.3 * Math.sin(tm * 18)})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 24 + Math.sin(tm * 20) * 4, 0, 7);
          ctx.fill();
          ctx.strokeStyle = c.held ? '#9fe8ff' : '#fff7a8';
          ctx.lineWidth = 3;
          for (let i = 0; i < 5; i++) {
            const a = hash(i + Math.floor(tm * 14), 701) * 6.28;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
            ctx.stroke();
          }
          ctx.font = '27px ' + config.FONTS.DISPLAY;
          ctx.textAlign = 'center';
          ctx.lineWidth = 6;
          ctx.strokeStyle = config.INK;
          ctx.fillStyle = c.held ? '#9fe8ff' : '#fff27a';
          const txt = c.held ? 'GROUNDING...' : 'LIGHTNING! HOLD A ROD!';
          ctx.strokeText(txt, cx, cy - 64);
          ctx.fillText(txt, cx, cy - 64);
        }
      }
      if (isSea() && state.sea) {
        const s = state.sea;
        const lo = P[LOWER];
        // Water sloshing around the lower deck.
        if (s.flood > 0.01) {
          const h = 14 + s.flood * 100;
          ctx.fillStyle = 'rgba(40,120,160,.5)';
          ctx.beginPath();
          const x0 = 150;
          const x1 = 1450;
          ctx.moveTo(x0, lo.y);
          for (let x = x0; x <= x1; x += 25) ctx.lineTo(x, lo.y - h + Math.sin(x * 0.03 + tm * 2.2) * 5);
          ctx.lineTo(x1, lo.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(240,250,255,.7)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let x = x0; x <= x1; x += 25) {
            const y = lo.y - h + Math.sin(x * 0.03 + tm * 2.2) * 5;
            if (x === x0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        // The bilge pump (a squat red hand pump with a lever that works while someone pumps).
        if (s.pump) {
          const x = s.pump.x;
          const y = lo.y;
          const working = num(s.pumped) > 0;
          ink();
          ctx.lineWidth = 3;
          ctx.fillStyle = '#b8402f';
          ctx.beginPath();
          ctx.roundRect(x - 22, y - 46, 44, 46, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#d9d2c0';
          ctx.beginPath();
          ctx.roundRect(x - 8, y - 70, 16, 26, 3);
          ctx.fill();
          ctx.stroke();
          const lev = working ? Math.sin(tm * 12) * 0.5 : 0.2;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(x, y - 64);
          ctx.lineTo(x + Math.cos(-0.9 + lev) * 52, y - 64 + Math.sin(-0.9 + lev) * 52);
          ctx.stroke();
          ctx.font = '16px ' + config.FONTS.DISPLAY;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = config.INK;
          ctx.fillStyle = s.flood > 0.12 ? '#9fe8ff' : '#f1e2b8';
          const txt = s.flood > 0.12 ? `BILGE PUMP - FLOODED ${Math.round(s.flood * 100)}%` : 'BILGE PUMP';
          ctx.strokeText(txt, x, y - 82);
          ctx.fillText(txt, x, y - 82);
        }
        // The winch in the bomb bay and its rope down to the survivor.
        const wi = s.winch;
        const c = state.course;
        if (wi) {
          const bay = P[wi.d];
          const wx = wi.x;
          ink();
          ctx.lineWidth = 3;
          ctx.fillStyle = '#7b8794';
          ctx.beginPath();
          ctx.roundRect(wx - 22, bay.y - 40, 44, 40, 5);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#d9a441';
          ctx.beginPath();
          ctx.arc(wx, bay.y - 22, 12, 0, 7);
          ctx.fill();
          ctx.stroke();
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(wx, bay.y - 22);
          ctx.lineTo(wx + Math.cos(tm * (s.hook ? 6 : 1)) * 22, bay.y - 22 + Math.sin(tm * (s.hook ? 6 : 1)) * 22);
          ctx.stroke();
          ctx.font = '18px ' + config.FONTS.DISPLAY;
          ctx.textAlign = 'center';
          ctx.lineWidth = 4;
          ctx.strokeStyle = config.INK;
          ctx.fillStyle = s.hook ? '#8fe388' : '#f1e2b8';
          const txt = s.hook ? 'WINCH!' : 'WINCH - SURVIVORS AHEAD';
          ctx.strokeText(txt, wx, bay.y - 56);
          ctx.fillText(txt, wx, bay.y - 56);
        }
        if (s.hook && c) {
          const sv = s.hook;
          const door = layout.bombBay;
          const hx = toShipX(mship, sv.mx); // (this layer is in ship coordinates)
          const hy = toShipY(mship, sv.y);
          ctx.strokeStyle = '#d9c89a';
          ctx.lineWidth = 4;
          ctx.setLineDash([10, 6]);
          ctx.beginPath();
          ctx.moveTo(door.x, door.y + 4);
          ctx.quadraticCurveTo((door.x + hx) / 2, Math.max(door.y, hy) + 40, hx, hy - 60);
          ctx.stroke();
          ctx.setLineDash([]);
          // Progress of the haul above the survivor.
          const p = Math.max(0, Math.min(1, num(sv.prog)));
          ctx.fillStyle = 'rgba(0,0,0,.55)';
          ctx.fillRect(hx - 50, hy - 130, 100, 14);
          ctx.fillStyle = '#8fe388';
          ctx.fillRect(hx - 50, hy - 130, 100 * p, 14);
          ctx.strokeStyle = config.INK;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(hx - 50, hy - 130, 100, 14);
        }
      }
      ctx.restore();
    } catch (err) {
      report(err);
      try { ctx.restore(); } catch (e2) { /* ignore */ }
    }
  };

  return { background, sea, front, ship, CAT };
}
