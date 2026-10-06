// Draws the course: rocky ground and mountains below, rock overhangs above, and ground turrets.
// Placeholder vector art (sprites: fx/turret, fx/turret-barrel if they exist).
import { config } from '../../config.js';
import { groundAt, ceilAt, elevAt } from './course.js';

const INK = config.INK;

export function createCourseArt({ ctx, state, ink, sprites }) {
  // Visible world x range for the current camera view.
  const span = (view, width) => {
    const half = width / 2 / view.zoom;
    return [view.cx - half - 60, view.cx + half + 60];
  };

  // Everything below is placed on a grid fixed to the course (not to the screen), so the outline
  // and the scenery stay put as the ground scrolls past instead of shimmering.
  const STEP = 20;
  const HAZE = 'rgba(200,214,228,.32)'; // aerial haze over the rock (higher = calmer background)
  const hash = (i, salt = 0) => {
    const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const G = config.COURSE.GROUND;
  const SNOW_LINE = G - 640; // peaks higher than this get snow
  const LIFT = G - 1350; // markers were sized for ground at 1350; keep their tops at the same height

  // Trace a line through samples, offset by dy(i) (i = sample index).
  const trace = (xs, ys, dy, from = 0, to = xs.length - 1, move = true) => {
    for (let i = from; i <= to; i++) {
      if (i === from && move) ctx.moveTo(xs[i], ys[i] + dy(i));
      else ctx.lineTo(xs[i], ys[i] + dy(i));
    }
  };

  const pine = (x, y, s, dark) => {
    ctx.fillStyle = '#5a3b26';
    ctx.fillRect(x - 4 * s, y - 14 * s, 8 * s, 16 * s);
    ctx.strokeRect(x - 4 * s, y - 14 * s, 8 * s, 16 * s);
    ctx.fillStyle = dark ? '#2f5e3a' : '#3d7a47';
    for (let k = 0; k < 3; k++) {
      const by = y - 12 * s - k * 22 * s;
      const w = (30 - k * 7) * s;
      ctx.beginPath();
      ctx.moveTo(x - w, by);
      ctx.lineTo(x, by - 36 * s);
      ctx.lineTo(x + w, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  const bush = (x, y, s) => {
    ctx.fillStyle = '#4f8a4a';
    ctx.beginPath();
    ctx.arc(x - 14 * s, y - 8 * s, 14 * s, Math.PI, 0);
    ctx.arc(x, y - 16 * s, 17 * s, Math.PI, 0);
    ctx.arc(x + 15 * s, y - 8 * s, 13 * s, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  };

  const boulder = (x, y, s) => {
    ctx.fillStyle = '#9a8a78';
    ctx.beginPath();
    ctx.moveTo(x - 30 * s, y + 4);
    ctx.quadraticCurveTo(x - 30 * s, y - 30 * s, x - 4 * s, y - 32 * s);
    ctx.quadraticCurveTo(x + 30 * s, y - 30 * s, x + 32 * s, y + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(x - 8 * s, y - 20 * s, 10 * s, 5 * s, -0.3, 0, 7);
    ctx.fill();
  };

  // ---------- Mission maps: caves drawn with smooth edges (marching squares) ----------
  // A tiling rock texture (layers and stones), made once.
  let rockPattern = null;
  const getRockPattern = () => {
    if (rockPattern) return rockPattern;
    const c = document.createElement('canvas');
    c.width = c.height = 400;
    const g = c.getContext('2d');
    g.fillStyle = '#7d6148';
    g.fillRect(0, 0, 400, 400);
    for (let k = 0; k < 8; k++) {
      g.strokeStyle = k % 2 ? 'rgba(60,40,26,.35)' : 'rgba(176,140,96,.35)';
      g.lineWidth = 18 + (k % 3) * 8;
      g.beginPath();
      for (let x = 0; x <= 400; x += 20) {
        const y = k * 50 + 20 + Math.sin((x / 400) * Math.PI * 2 + k) * 10;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let k = 0; k < 26; k++) {
      const h = hash(k, 40);
      g.fillStyle = h < 0.5 ? 'rgba(60,45,35,.6)' : 'rgba(170,145,120,.6)';
      g.beginPath();
      g.ellipse(hash(k, 41) * 400, hash(k, 42) * 400, 8 + hash(k, 43) * 14, 6 + hash(k, 44) * 8, hash(k, 45) * 3, 0, 7);
      g.fill();
    }
    rockPattern = ctx.createPattern(c, 'repeat');
    return rockPattern;
  };

  const drawMapTerrain = (view, width, height) => {
    const course = state.course;
    const map = course.map;
    const C = map.CELL;
    const dist = course.dist;
    const [wx0, wx1] = span(view, width);
    const top = view.cy - height / 2 / view.zoom - C;
    const bottom = view.cy + height / 2 / view.zoom + C;
    const i0 = Math.floor((wx0 + dist) / C) - 1;
    const i1 = Math.ceil((wx1 + dist) / C) + 1;
    const j0 = Math.floor(top / C) - 1;
    const j1 = Math.ceil(bottom / C) + 1;
    const S = (i, j) => (i < 0 || j < 0 || i >= map.W || j >= map.H ? 1 : map.solid[j * map.W + i]);
    // Corner values: how much rock surrounds each grid corner, wobbled a little (fixed to the map)
    // so the edges look like rock rather than blocks.
    const corner = (i, j) => {
      const v = (S(i - 1, j - 1) + S(i, j - 1) + S(i - 1, j) + S(i, j)) / 4;
      return v === 0 || v === 1 ? v : v + (hash(i * 7919 + j, 50) - 0.5) * 0.3;
    };
    const X = (i) => i * C - dist;
    const Y = (j) => j * C;

    // Cave backdrop: dark, so ships, enemies and shots stand out.
    ctx.fillStyle = '#2b2733';
    const bx0 = Math.max(X(0), wx0 - C);
    const bx1 = Math.min(X(map.W), wx1 + C);
    const by0 = Math.max(0, top);
    const by1 = Math.min(map.H * C, bottom);
    if (bx1 > bx0 && by1 > by0) ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.fillStyle = 'rgba(70,60,80,.5)';
    for (let i = i0; i <= i1; i += 3) {
      for (let j = j0; j <= j1; j += 3) {
        if (hash(i * 131 + j, 51) > 0.35) continue;
        ctx.beginPath();
        ctx.ellipse(X(i) + C * 1.5, Y(j) + C * 1.5, C * (0.8 + hash(i + j, 52)), C * (0.5 + hash(i - j, 53)), 0, 0, 7);
        ctx.fill();
      }
    }

    // Marching squares: rock polygon pieces and edge segments.
    const fill = new Path2D();
    const segs = [];
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const v = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
        const P = [[X(i), Y(j)], [X(i + 1), Y(j)], [X(i + 1), Y(j + 1)], [X(i), Y(j + 1)]];
        const inside = v.map((q) => q >= 0.5);
        if (inside.every((q) => q)) {
          fill.rect(X(i), Y(j), C, C);
          continue;
        }
        if (!inside.some((q) => q)) continue;
        const poly = [];
        const cross = [];
        for (let k = 0; k < 4; k++) {
          const a = k;
          const b = (k + 1) % 4;
          if (inside[a]) poly.push(P[a]);
          if (inside[a] !== inside[b]) {
            const t = (0.5 - v[a]) / (v[b] - v[a]);
            const pt = [P[a][0] + (P[b][0] - P[a][0]) * t, P[a][1] + (P[b][1] - P[a][1]) * t];
            poly.push(pt);
            cross.push(pt);
          }
        }
        fill.moveTo(poly[0][0], poly[0][1]);
        for (const p of poly.slice(1)) fill.lineTo(p[0], p[1]);
        fill.closePath();
        for (let k = 0; k + 1 < cross.length; k += 2) segs.push([cross[k], cross[k + 1], i, j]);
      }
    }
    const pat = getRockPattern();
    if (pat.setTransform) pat.setTransform(new DOMMatrix([1, 0, 0, 1, -(dist % 400), 0]));
    ctx.fillStyle = pat;
    ctx.fill(fill);
    ctx.fillStyle = HAZE;
    ctx.fill(fill);

    // Edges: ink outline, grass on floors, drips/vines/crystals under ceilings.
    const rockAt = (x, y) => S(Math.floor((x + dist) / C), Math.floor(y / C)) === 1;
    const floors = [];
    const ceilings = [];
    for (const sg of segs) {
      const [[ax, ay], [bx2, by2], i, j] = sg;
      const mx = (ax + bx2) / 2;
      const my = (ay + by2) / 2;
      if (!rockAt(mx, my - 40) && rockAt(mx, my + 40)) floors.push(sg);
      else if (rockAt(mx, my - 40) && !rockAt(mx, my + 40)) ceilings.push(sg);
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4f7f3c';
    ctx.lineWidth = 20;
    ctx.beginPath();
    for (const [[ax, ay], [bx2, by2]] of floors) {
      ctx.moveTo(ax, ay + 8);
      ctx.lineTo(bx2, by2 + 8);
    }
    ctx.stroke();
    ctx.strokeStyle = '#7fb24f';
    ctx.lineWidth = 8;
    ctx.stroke();
    ink();
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (const [[ax, ay], [bx2, by2]] of segs) {
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
    }
    ctx.stroke();
    // Tufts on floors.
    ctx.strokeStyle = '#3f6e30';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (const [[ax, ay], [bx2, by2], i, j] of floors) {
      if (hash(i * 31 + j, 54) > 0.6) continue;
      const x = (ax + bx2) / 2;
      const y = (ay + by2) / 2;
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x - 12, y - 18);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y - 24);
      ctx.moveTo(x + 8, y);
      ctx.lineTo(x + 13, y - 16);
    }
    ctx.stroke();
    // Under ceilings: stalactites, vines and the odd glowing crystal.
    for (const [[ax, ay], [bx2, by2], i, j] of ceilings) {
      const h = hash(i * 17 + j, 55);
      const x = (ax + bx2) / 2;
      const y = (ay + by2) / 2;
      if (h < 0.35) {
        const len = 30 + hash(i, 56) * 50;
        ctx.fillStyle = '#6e5646';
        ink();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 4);
        ctx.lineTo(x, y + len);
        ctx.lineTo(x + 16, y - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (h < 0.55) {
        const len = 60 + hash(j, 57) * 140;
        ctx.strokeStyle = '#3f6e30';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 16, y + len * 0.5, x - 6, y + len);
        ctx.stroke();
      } else if (h < 0.62) {
        ctx.fillStyle = 'rgba(120,230,255,.25)';
        ctx.beginPath();
        ctx.arc(x, y + 20, 60, 0, 7);
        ctx.fill();
        ink();
        ctx.lineWidth = 4;
        ctx.fillStyle = '#7fe6ff';
        for (const dx of [-18, 0, 18]) {
          ctx.beginPath();
          ctx.moveTo(x + dx - 10, y - 4);
          ctx.lineTo(x + dx, y + 40 + (dx ? 0 : 20));
          ctx.lineTo(x + dx + 10, y - 4);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  };

  const drawTerrain = (view, width, height) => {
    if (state.course && state.course.map) return drawMapTerrain(view, width, height);
    const course = state.course;
    if (!course || !config.COURSE.ENABLED) return;
    const [wx0, wx1] = span(view, width);
    const dist = course.dist;
    const bottom = view.cy + height / 2 / view.zoom + 200;
    const top = view.cy - height / 2 / view.zoom - 200;

    // Samples at fixed course positions.
    const i0 = Math.floor((wx0 + dist) / STEP) - 1;
    const i1 = Math.ceil((wx1 + dist) / STEP) + 1;
    const ids = [];
    const xs = [];
    const gs = [];
    const cs = [];
    const snow = []; // snow line at each sample
    for (let i = i0; i <= i1; i++) {
      const x = i * STEP - dist;
      ids.push(i);
      xs.push(x);
      gs.push(groundAt(course, x, false)); // bare rock (buildings are drawn separately)
      snow.push(SNOW_LINE - elevAt(course, i * STEP) * 0.5); // higher land is snowier
      cs.push(ceilAt(course, x));
    }
    const n = xs.length;
    const last = n - 1;
    const minG = Math.min(...gs);

    // ---------- Ground ----------
    // Rock body, lighter near the surface.
    const grad = ctx.createLinearGradient(0, minG, 0, minG + 900);
    grad.addColorStop(0, '#b08a5c');
    grad.addColorStop(0.35, '#8b6b4a');
    grad.addColorStop(1, '#6a4c36');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(xs[0], bottom);
    trace(xs, gs, () => 0, 0, last, false);
    ctx.lineTo(xs[last], bottom);
    ctx.closePath();
    ctx.fill();

    // Rock strata: wavy bands that follow the surface.
    ctx.save();
    ctx.clip();
    ctx.lineJoin = 'round';
    // (alternating light and dark layers all the way down)
    for (let k = 0; k < 14; k++) {
      const depth = 60 + k * 105;
      ctx.strokeStyle = k % 2 ? `rgba(60,38,24,${0.3 + k * 0.012})` : `rgba(176,140,96,${Math.max(0.12, 0.45 - k * 0.025)})`;
      ctx.lineWidth = 16 + k * 2;
      ctx.beginPath();
      trace(xs, gs, (i) => depth + Math.sin(ids[i] * 0.09 + k * 2) * 14 + Math.sin(ids[i] * 0.023 + k) * 26);
      ctx.stroke();
    }
    // Embedded stones and cracks.
    ink();
    ctx.lineWidth = 3;
    for (let i = 0; i < n; i++) {
      if (ids[i] % 5 !== 0) continue;
      const h = hash(ids[i], 1);
      if (h > 0.6) continue;
      const y = gs[i] + 60 + hash(ids[i], 2) * 1100;
      ctx.fillStyle = h < 0.2 ? '#6b5440' : '#a08466';
      ctx.beginPath();
      ctx.ellipse(xs[i], y, 10 + hash(ids[i], 3) * 16, 7 + hash(ids[i], 4) * 8, hash(ids[i], 5), 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Snow caps on the high peaks (the surface plus a jagged lower edge).
    ctx.fillStyle = '#f4f7fb';
    ink();
    ctx.lineWidth = 4;
    for (let i = 0; i < n; i++) {
      if (gs[i] >= snow[i]) continue;
      let j = i;
      while (j + 1 < n && gs[j + 1] < snow[j + 1]) j++;
      const depth = (k) => Math.min(70, (snow[k] - gs[k]) * 0.5) * (ids[k] % 3 === 0 ? 1.25 : 0.8);
      ctx.beginPath();
      trace(xs, gs, () => -2, i, j);
      for (let k = j; k >= i; k--) ctx.lineTo(xs[k], gs[k] + depth(k));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      i = j;
    }

    // Grass along the surface (not on snow), with a lighter sunlit lip.
    const grassy = (i) => gs[i] >= snow[i] - 10;
    const runs = (fn) => {
      for (let i = 0; i < n; i++) {
        if (!grassy(i)) continue;
        let j = i;
        while (j + 1 < n && grassy(j + 1)) j++;
        fn(i, j);
        i = j;
      }
    };
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4f7f3c';
    ctx.lineWidth = 22;
    ctx.beginPath();
    runs((i, j) => trace(xs, gs, () => 9, i, j));
    ctx.stroke();
    ctx.strokeStyle = '#7fb24f';
    ctx.lineWidth = 9;
    ctx.beginPath();
    runs((i, j) => trace(xs, gs, () => 3, i, j));
    ctx.stroke();

    // Ink outline of the whole surface.
    ink();
    ctx.lineWidth = 6;
    ctx.beginPath();
    trace(xs, gs, () => 0);
    ctx.stroke();

    // Grass tufts and flowers.
    ctx.lineWidth = 3;
    for (let i = 0; i < n; i++) {
      if (!grassy(i) || ids[i] % 2) continue;
      const h = hash(ids[i], 6);
      if (h > 0.55) continue;
      const x = xs[i] + hash(ids[i], 7) * 16;
      const y = gs[i] + 2;
      ctx.strokeStyle = '#3f6e30';
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x - 9, y - 14);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 1, y - 18);
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 10, y - 13);
      ctx.stroke();
      if (h < 0.08) {
        ctx.fillStyle = ['#ffd23f', '#ff8fa0', '#ffffff'][ids[i] % 3];
        ctx.beginPath();
        ctx.arc(x + 1, y - 20, 5, 0, 7);
        ctx.fill();
      }
    }

    // Trees, bushes and boulders, kept clear of turrets and markers.
    const busy = (cx) =>
      course.turrets.some((t) => Math.abs(t.cx - cx) < 140) ||
      (course.markers || []).some((m) => Math.abs(m.cx - cx) < 220) ||
      course.features.some((f) => f.blocks && f.blocks.some((b) => cx > b.x0 - 80 && cx < b.x1 + 80));
    ink();
    ctx.lineWidth = 4;
    for (let i = 1; i < last; i++) {
      if (ids[i] % 4 !== 0) continue;
      const h = hash(ids[i], 8);
      if (h > 0.42) continue;
      const slope = Math.abs(gs[i + 1] - gs[i - 1]) / (2 * STEP);
      const cx = ids[i] * STEP;
      if (busy(cx)) continue;
      const x = xs[i];
      const y = gs[i] + 6;
      const s = 0.8 + hash(ids[i], 9) * 0.7;
      if (gs[i] < snow[i]) {
        if (h < 0.12) boulder(x, y, s * 0.8);
      } else if (slope > 0.9) {
        if (h < 0.2) boulder(x, y, s);
      } else if (h < 0.24) pine(x, y, s, h < 0.1);
      else if (h < 0.34) bush(x, y, s);
      else boulder(x, y, s * 0.7);
    }

    // A light haze over the land pushes it back, so ships, enemies and shots read clearly.
    ctx.fillStyle = HAZE;
    ctx.beginPath();
    ctx.moveTo(xs[0], bottom);
    trace(xs, gs, () => 0, 0, last, false);
    ctx.lineTo(xs[last], bottom);
    ctx.closePath();
    ctx.fill();

    // ---------- Overhangs and tunnel roofs ----------
    const rock = (i) => cs[i] > top;
    const roofRuns = (fn) => {
      for (let i = 0; i < n; i++) {
        if (!rock(i)) continue;
        let j = i;
        while (j + 1 < n && rock(j + 1)) j++;
        fn(Math.max(0, i - 1), Math.min(last, j + 1));
        i = j;
      }
    };
    const roofY = (i) => (rock(i) ? cs[i] : top);
    const ceilYs = cs.map((c, i) => roofY(i));
    let maxC = -Infinity;
    for (let i = 0; i < n; i++) if (rock(i)) maxC = Math.max(maxC, cs[i]);
    if (maxC > -Infinity) {
      const rg = ctx.createLinearGradient(0, maxC - 700, 0, maxC);
      rg.addColorStop(0, '#5a4638');
      rg.addColorStop(1, '#7a6150');
      roofRuns((i, j) => {
        ctx.beginPath();
        ctx.moveTo(xs[i], top);
        trace(xs, ceilYs, () => 0, i, j, false);
        ctx.lineTo(xs[j], top);
        ctx.closePath();
        ctx.fillStyle = rg;
        ctx.fill();
        // Bands inside the rock.
        ctx.save();
        ctx.clip();
        for (let k = 0; k < 12; k++) {
          ctx.strokeStyle = k % 2 ? 'rgba(50,36,28,.35)' : 'rgba(150,122,100,.35)';
          ctx.lineWidth = 14 + k * 2;
          ctx.beginPath();
          trace(xs, ceilYs, (q) => -50 - k * 100 + Math.sin(ids[q] * 0.07 + k * 3) * 16 + Math.sin(ids[q] * 0.02 + k) * 24, i, j);
          ctx.stroke();
        }
        // Embedded stones.
        ink();
        ctx.lineWidth = 3;
        for (let q = i; q <= j; q++) {
          if (!rock(q) || ids[q] % 4 || hash(ids[q], 16) > 0.5) continue;
          ctx.fillStyle = hash(ids[q], 17) < 0.5 ? '#4a3a30' : '#8f7764';
          ctx.beginPath();
          ctx.ellipse(xs[q], cs[q] - 50 - hash(ids[q], 18) * 900, 10 + hash(ids[q], 19) * 14, 7 + hash(ids[q], 20) * 7, hash(ids[q], 21), 0, 7);
          ctx.fill();
          ctx.stroke();
        }
        // Glowing crystals here and there.
        for (let q = i; q <= j; q++) {
          if (!rock(q) || ids[q] % 6 || hash(ids[q], 10) > 0.3) continue;
          const x = xs[q];
          const y = cs[q] - 100 - hash(ids[q], 11) * 450;
          ctx.fillStyle = 'rgba(120,230,255,.25)';
          ctx.beginPath();
          ctx.arc(x, y, 75, 0, 7);
          ctx.fill();
          ink();
          ctx.lineWidth = 5;
          ctx.fillStyle = '#7fe6ff';
          [-30, 0, 28].forEach((dx, m) => {
            const hgt = 40 + (m === 1 ? 30 : m * 8);
            ctx.beginPath();
            ctx.moveTo(x + dx - 14, y + 20);
            ctx.lineTo(x + dx, y - hgt);
            ctx.lineTo(x + dx + 14, y + 20);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.restore();
        // Haze, then the outline.
        ctx.fillStyle = HAZE;
        ctx.beginPath();
        ctx.moveTo(xs[i], top);
        trace(xs, ceilYs, () => 0, i, j, false);
        ctx.lineTo(xs[j], top);
        ctx.closePath();
        ctx.fill();
        ink();
        ctx.lineWidth = 6;
        ctx.beginPath();
        trace(xs, ceilYs, () => 0, i, j);
        ctx.stroke();
      });

      // Stalactites and hanging vines (only where the rock is well down into view).
      ink();
      ctx.lineWidth = 4;
      for (let i = 1; i < last; i++) {
        if (!rock(i) || !rock(i - 1) || !rock(i + 1)) continue;
        const h = hash(ids[i], 12);
        if (ids[i] % 3 === 0 && h < 0.5) {
          const len = 16 + hash(ids[i], 13) * 30;
          const w = 10 + hash(ids[i], 14) * 10;
          const c = cs[i] - 4;
          ctx.fillStyle = '#6e5646';
          ctx.beginPath();
          ctx.moveTo(xs[i] - w, c);
          ctx.lineTo(xs[i] + 2, c + len);
          ctx.lineTo(xs[i] + w, c);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (ids[i] % 5 === 1 && h < 0.35) {
          const len = 40 + hash(ids[i], 15) * 110;
          ctx.strokeStyle = '#3f6e30';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(xs[i], cs[i]);
          ctx.quadraticCurveTo(xs[i] + 14, cs[i] + len * 0.5, xs[i] - 4, cs[i] + len);
          ctx.stroke();
          ctx.fillStyle = '#5f9a45';
          for (let k = 1; k <= 3; k++) {
            ctx.beginPath();
            ctx.ellipse(xs[i] + 6 - k * 2, cs[i] + (len * k) / 3.4, 8, 4, 0.6, 0, 7);
            ctx.fill();
          }
          ink();
          ctx.lineWidth = 4;
        }
      }
    }
  };

  // ---------- Buildings: mountain fortresses and factories ----------
  const stoneLines = (x0, y0, x1, y1, row, col) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.strokeStyle = 'rgba(40,30,25,.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let y = y0 + row, k = 0; y < y1; y += row, k++) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      for (let x = x0 + (k % 2 ? col / 2 : 0); x < x1; x += col) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y - row);
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  // Battlements: a row of merlons along the top edge.
  const merlons = (x0, x1, top, h, color) => {
    const n = Math.max(2, Math.round((x1 - x0) / 44));
    const w = (x1 - x0) / (n * 2 - 1);
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      ctx.fillRect(x0 + i * 2 * w, top, w, h + 2);
      ctx.strokeRect(x0 + i * 2 * w, top, w, h + 2);
    }
  };

  // The raiders' banner: dark red with a pair of black horns (fictional emblem).
  const banner = (x, y, s) => {
    ctx.fillStyle = '#8e1f1a';
    ctx.beginPath();
    ctx.moveTo(x - 20 * s, y);
    ctx.lineTo(x + 20 * s, y);
    ctx.lineTo(x + 20 * s, y + 60 * s);
    ctx.lineTo(x, y + 48 * s);
    ctx.lineTo(x - 20 * s, y + 60 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1b1410';
    ctx.beginPath();
    ctx.moveTo(x - 10 * s, y + 34 * s);
    ctx.quadraticCurveTo(x - 14 * s, y + 14 * s, x - 4 * s, y + 10 * s);
    ctx.quadraticCurveTo(x - 6 * s, y + 22 * s, x - 2 * s, y + 32 * s);
    ctx.moveTo(x + 10 * s, y + 34 * s);
    ctx.quadraticCurveTo(x + 14 * s, y + 14 * s, x + 4 * s, y + 10 * s);
    ctx.quadraticCurveTo(x + 6 * s, y + 22 * s, x + 2 * s, y + 32 * s);
    ctx.fill();
  };

  const window2 = (x, y, w, h, lit) => {
    ctx.fillStyle = lit ? '#ffd86b' : '#2b2420';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y, w, h, [w / 2, w / 2, 2, 2]);
    ctx.fill();
    ctx.stroke();
  };

  const drawBuildings = (view, width, time) => {
    const course = state.course;
    if (!course) return;
    const [wx0, wx1] = span(view, width);
    const dist = course.dist;
    // Draw tall things last so walls sit behind towers.
    const order = { wall: 0, shed: 1, keep: 2, tower: 3, chimney: 4 };
    const blocks = [];
    for (const f of course.features) if (f.blocks) for (const b of f.blocks) if (b.x1 - dist > wx0 - 200 && b.x0 - dist < wx1 + 200) blocks.push(b);
    blocks.sort((a, b) => order[a.kind] - order[b.kind]);
    for (const b of blocks) {
      const x0 = b.x0 - dist;
      const x1 = b.x1 - dist;
      const cx = (x0 + x1) / 2;
      const top = b.top;
      const bottom = Math.max(groundAt(course, x0, false), groundAt(course, x1, false), groundAt(course, cx, false)) + 40;
      ink();
      if (b.kind === 'wall') {
        ctx.fillStyle = '#9a948c';
        ctx.fillRect(x0, top + 22, x1 - x0, bottom - top - 22);
        stoneLines(x0, top + 22, x1, bottom, 26, 52);
        ctx.strokeRect(x0, top + 22, x1 - x0, bottom - top - 22);
        merlons(x0, x1, top, 22, '#9a948c');
        // Gatehouse arch.
        ctx.fillStyle = '#2b2420';
        ctx.beginPath();
        ctx.moveTo(cx - 40, bottom - 40);
        ctx.lineTo(cx - 40, bottom - 90);
        ctx.arc(cx, bottom - 90, 40, Math.PI, 0);
        ctx.lineTo(cx + 40, bottom - 40);
        ctx.fill();
        ctx.stroke();
      } else if (b.kind === 'tower') {
        ctx.fillStyle = '#8a847c';
        ctx.fillRect(x0, top + 26, x1 - x0, bottom - top - 26);
        stoneLines(x0, top + 26, x1, bottom, 26, 40);
        ctx.strokeRect(x0, top + 26, x1 - x0, bottom - top - 26);
        merlons(x0 - 6, x1 + 6, top, 26, '#8a847c');
        for (let y = top + 70; y < bottom - 90; y += 90) window2(cx, y, 12, 34, false);
        banner(cx, top + 34, 1);
      } else if (b.kind === 'keep') {
        const roofH = 80;
        ctx.fillStyle = '#958f86';
        ctx.fillRect(x0, top + roofH, x1 - x0, bottom - top - roofH);
        stoneLines(x0, top + roofH, x1, bottom, 26, 52);
        ctx.strokeRect(x0, top + roofH, x1 - x0, bottom - top - roofH);
        ctx.fillStyle = '#4a4f63';
        ctx.beginPath();
        ctx.moveTo(x0 - 10, top + roofH);
        ctx.lineTo(cx, top);
        ctx.lineTo(x1 + 10, top + roofH);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        for (let y = top + roofH + 30; y < bottom - 80; y += 70) {
          window2(cx - 60, y, 20, 36, (Math.floor(y) + b.x0) % 3 !== 0);
          window2(cx + 60, y, 20, 36, (Math.floor(y) + b.x0) % 2 === 0);
        }
        banner(cx, top + roofH + 6, 1.3);
      } else if (b.kind === 'shed') {
        const roofH = 40;
        ctx.fillStyle = '#9b4a3a';
        ctx.fillRect(x0, top + roofH, x1 - x0, bottom - top - roofH);
        stoneLines(x0, top + roofH, x1, bottom, 14, 30);
        ctx.strokeRect(x0, top + roofH, x1 - x0, bottom - top - roofH);
        // Saw-tooth roof with glazed faces.
        const teeth = Math.max(2, Math.round((x1 - x0) / 80));
        const tw = (x1 - x0) / teeth;
        for (let i = 0; i < teeth; i++) {
          const a = x0 + i * tw;
          ctx.fillStyle = '#5b5550';
          ctx.beginPath();
          ctx.moveTo(a, top + roofH);
          ctx.lineTo(a + tw, top);
          ctx.lineTo(a + tw, top + roofH);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#9fd3e6';
          ctx.fillRect(a + tw - 8, top + 8, 6, roofH - 10);
        }
        for (let x = x0 + 40; x < x1 - 30; x += 60) window2(x, top + roofH + 24, 26, 30, ((x - x0) / 60) % 2 < 1);
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(cx - 24, bottom - 100, 48, 60);
        ctx.strokeRect(cx - 24, bottom - 100, 48, 60);
      } else if (b.kind === 'chimney') {
        // Tapered brick smokestack with bands, puffing smoke.
        ctx.fillStyle = '#8e3f30';
        ctx.beginPath();
        ctx.moveTo(x0, top + 14);
        ctx.lineTo(x1, top + 14);
        ctx.lineTo(x1 + 12, bottom);
        ctx.lineTo(x0 - 12, bottom);
        ctx.closePath();
        ctx.fill();
        ctx.save();
        ctx.clip();
        stoneLines(x0 - 12, top + 14, x1 + 12, bottom, 14, 24);
        ctx.restore();
        ctx.stroke();
        ctx.fillStyle = '#3a3330';
        ctx.fillRect(x0 - 6, top, x1 - x0 + 12, 18);
        ctx.strokeRect(x0 - 6, top, x1 - x0 + 12, 18);
        ctx.fillStyle = '#f3ead6';
        for (const k of [0.12, 0.2]) ctx.fillRect(x0 + 2, top + (bottom - top) * k, x1 - x0 - 4, 10);
        const seed = (b.x0 * 0.013) % 1;
        for (let k = 0; k < 7; k++) {
          const t = (time * 0.3 + k / 7 + seed) % 1;
          ctx.fillStyle = `rgba(70,68,66,${0.75 * (1 - t)})`;
          ctx.beginPath();
          ctx.arc(cx + t * 160, top - 30 - t * 320, 26 + t * 70, 0, 7);
          ctx.fill();
        }
      }
    }
  };

  const drawTurrets = (time) => {
    const course = state.course;
    if (!course) return;
    for (const t of course.turrets) {
      if (t.x == null) continue;
      ctx.save();
      ctx.translate(t.x, t.y + 20);
      if (t.dead) {
        ink();
        ctx.fillStyle = '#3b3b3b';
        ctx.beginPath();
        ctx.moveTo(-36, 0);
        ctx.lineTo(-20, -18);
        ctx.lineTo(4, -10);
        ctx.lineTo(26, -22);
        ctx.lineTo(36, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `rgba(60,60,60,${0.5 + 0.3 * Math.sin(time * 3 + t.cx)})`;
        ctx.beginPath();
        ctx.arc(0, -40 - ((time * 30) % 30), 14, 0, 7);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (t.rocket) {
        // Rocket battery: a sloped launch rail with a rocket waiting on it.
        ink();
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-20, -10);
        ctx.lineTo(10, -70);
        ctx.stroke();
        ctx.fillStyle = t.cd < 1 ? '#c0392b' : '#7a2a22';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -48, 8, 18, 0.45, 0, 7);
        ctx.fill();
        ctx.stroke();
      } else if (!sprites.pivot(ctx, 'fx/turret-barrel', 0, -26, 0.1, 0.5, t.aim)) {
        ctx.save();
        ctx.translate(0, -26);
        ctx.rotate(t.aim);
        ink();
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(0, -8, 58, 16);
        ctx.strokeRect(0, -8, 58, 16);
        ctx.restore();
      }
      if (!sprites.box(ctx, 'fx/turret', -40, -50, 80, 52)) {
        ink();
        ctx.fillStyle = '#6b5a4a';
        ctx.beginPath();
        ctx.moveTo(-40, 2);
        ctx.lineTo(-30, -30);
        ctx.quadraticCurveTo(0, -52, 30, -30);
        ctx.lineTo(40, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, -22, 7, 0, 7);
        ctx.fill();
      }
      for (let i = 0; i < t.hp; i++) {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(-18 + i * 13, -66, 9, 9);
      }
      ctx.restore();
    }
  };

  // Route markers: home mooring mast, checkpoint flags, and the turning beacon (a lighthouse).
  const drawMarkers = (time) => {
    const course = state.course;
    if (!course || !course.markers) return;
    for (const m of course.markers) {
      // (On a mission map markers sit on a cave floor; the mast reaches up to the ship.)
      const x = (m.mx ?? m.cx) - course.dist;
      if (x < -1500 || x > 4500) continue;
      const g = m.my ?? groundAt(course, x);
      const mastH = m.top != null ? g - m.top : 900 + LIFT;
      ink();
      if (m.kind === 'home') {
        // Lattice mooring mast with a platform near the top.
        const top = g - mastH;
        ctx.fillStyle = '#7a5a3a';
        ctx.beginPath();
        ctx.moveTo(x - 70, g);
        ctx.lineTo(x - 22, top);
        ctx.lineTo(x + 22, top);
        ctx.lineTo(x + 70, g);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let y = g; y > top + 40; y -= 70) {
          const k = (g - y) / mastH;
          const half = 70 - 48 * k;
          ctx.beginPath();
          ctx.moveTo(x - half, y);
          ctx.lineTo(x + half - 6, y - 70);
          ctx.moveTo(x + half, y);
          ctx.lineTo(x - half + 6, y - 70);
          ctx.stroke();
        }
        ink();
        ctx.fillStyle = '#5a3b26';
        ctx.fillRect(x - 60, top - 12, 120, 24);
        ctx.strokeRect(x - 60, top - 12, 120, 24);
        ctx.beginPath();
        ctx.moveTo(x, top - 12);
        ctx.lineTo(x, top - 110);
        ctx.stroke();
        ctx.fillStyle = '#3a86ff';
        ctx.beginPath();
        ctx.moveTo(x, top - 110);
        ctx.lineTo(x + 70 + Math.sin(time * 4) * 8, top - 92);
        ctx.lineTo(x, top - 74);
        ctx.fill();
        ctx.stroke();
      } else if (m.kind === 'checkpoint') {
        // Tall pole with a waving chequered flag.
        const top = g - 640 - LIFT;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x, g);
        ctx.lineTo(x, top);
        ctx.stroke();
        const wave = (k) => Math.sin(time * 5 + k) * 8;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#e63946';
            ctx.beginPath();
            ctx.moveTo(x + i * 26, top + j * 24 + wave(i));
            ctx.lineTo(x + (i + 1) * 26, top + j * 24 + wave(i + 1));
            ctx.lineTo(x + (i + 1) * 26, top + (j + 1) * 24 + wave(i + 1));
            ctx.lineTo(x + i * 26, top + (j + 1) * 24 + wave(i));
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.lineWidth = 3;
        ctx.strokeRect(x, top, 104, 72);
      } else if (m.kind === 'beacon') {
        // Striped lighthouse with a sweeping light.
        const top = g - 820 - LIFT;
        for (let i = 0; i < 6; i++) {
          const y0 = g - (i * (820 + LIFT)) / 6;
          const y1 = g - ((i + 1) * (820 + LIFT)) / 6;
          const w0 = 80 - (i * 40) / 6;
          const w1 = 80 - ((i + 1) * 40) / 6;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#c0392b';
          ctx.beginPath();
          ctx.moveTo(x - w0, y0);
          ctx.lineTo(x - w1, y1);
          ctx.lineTo(x + w1, y1);
          ctx.lineTo(x + w0, y0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - 34, top - 60, 68, 60);
        ctx.strokeRect(x - 34, top - 60, 68, 60);
        ctx.fillStyle = '#3b2a1d';
        ctx.beginPath();
        ctx.moveTo(x - 44, top - 60);
        ctx.lineTo(x, top - 110);
        ctx.lineTo(x + 44, top - 60);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const a = time * 1.5;
        ctx.fillStyle = 'rgba(255,240,150,.35)';
        ctx.beginPath();
        ctx.moveTo(x, top - 30);
        ctx.lineTo(x + Math.cos(a) * 900, top - 30 + Math.sin(a) * 160 - 80);
        ctx.lineTo(x + Math.cos(a) * 900, top - 30 + Math.sin(a) * 160 + 80);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  return { drawTerrain, drawBuildings, drawTurrets, drawMarkers };
}
