// Searchlight art: the brass lamps and the belly blister (storybook gouache look: thin warm-brown ink,
// flat fills), the beams, the lit-target brackets and the DARKNESS overlay for caves, night storms and the deep levels.
//
// The darkness is cheap: one reduced-resolution offscreen canvas (config.SEARCHLIGHT.DARK.RES) is filled with the
// dark colour, soft light shapes are cut out of it (destination-out: the ship's glow, each beam cone, lamps, flashes and
// explosions) and it is drawn scaled up over the world, under the HUD. No per-shape blend modes on the main canvas.
// The lamps' screen positions are captured while the ship is drawn (so beams stay glued to the drums, bob and all).
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { darkTarget } from './searchlight.js';
import { perfDarkRes } from './perf.js';

const S = config.SEARCHLIGHT;
const D = S.DARK;
const L = SHIP_LAYOUT;
const P = L.platforms;
const INK = config.INK;
const BRASS = '#c9a85a';
const BRASS_LIGHT = '#e8d28c';
const BRASS_DARK = '#8a6b2e';
const IRON = '#6a6568';
const WOOD_DARK = '#6b4a32';
const WARM = '255,246,214';

export function createSearchlightArt({ ctx, state, ink }) {
  const line = (pts, width = 3.2, color = INK) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  };
  const filled = (color, path) => {
    ink();
    ctx.fillStyle = color;
    ctx.beginPath();
    path();
    ctx.fill();
    ctx.stroke();
  };

  // ---- The belly blister (drawn with the rest of the hull, before the ladders) ----
  const drawBellyPod = () => {
    const p = P.find((q) => q.id === 'lamp');
    if (!p) return; // (a built ship may have no belly lamp blister)
    const fy = p.y;
    const x0 = p.x0 - 14;
    const x1 = p.x1 + 14;
    const top = 836;
    // Struts up to the outrigger.
    line([[x0 + 12, top + 6], [x0 - 4, 800]], 6);
    line([[x1 - 12, top + 6], [x1 + 4, 800]], 6);
    // Hull blister: warm wood and dark metal with chamfered bottom corners, like the bomb bay.
    filled('#5f585d', () => {
      ctx.moveTo(x0, top);
      ctx.lineTo(x0, fy - 6);
      ctx.lineTo(x0 + 16, fy + 20);
      ctx.lineTo(x1 - 16, fy + 20);
      ctx.lineTo(x1, fy - 6);
      ctx.lineTo(x1, top);
      ctx.closePath();
    });
    ctx.fillStyle = '#4a4346';
    ctx.fillRect(x0 + 5, top + 8, x1 - x0 - 10, fy - top - 10);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(x0 + 5, top + 8, x1 - x0 - 10, 8);
    ctx.fillStyle = INK;
    for (let x = x0 + 14; x < x1 - 8; x += 26) {
      ctx.beginPath();
      ctx.arc(x, top + 14, 2, 0, 7);
      ctx.fill();
    }
    // Hatch up to the lower deck and the floor planks.
    filled('#3d373b', () => ctx.rect(p.x0 + 40 - 24, top + 2, 48, 7));
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(p.x0, fy, p.x1 - p.x0, 8);
    // Stencilled name.
    ctx.font = '14px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8d9b0';
    ctx.fillText('BELLY LAMP', (p.x0 + p.x1) / 2, top + 40);
    // A round window in the floor (the lamp looks out of it).
    filled('#2b2622', () => ctx.ellipse(1410, fy + 4, 26, 6, 0, 0, 7));
  };

  // ---- The lamps (drawn inside the ship's transform) ----
  const anchors = []; // [{ n, x, y, a, power, reach, half, manned }] in canvas pixels, captured while the lamps are drawn
  let shipM = null; // the ship's transform (canvas pixels), for the ship glow

  const capture = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

  const drawLamps = (time) => {
    const lights = state.searchlights;
    if (!lights) return;
    const m = ctx.getTransform();
    shipM = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
    anchors.length = 0;
    for (const l of lights) {
      const floor = P[L.stations.find((q) => q.n === l.n).d].y; // (the deck the lamp's station stands on)
      const lens = capture(m, l.bx + Math.cos(l.aim) * l.len, l.by + Math.sin(l.aim) * l.len);
      const dir = { x: m.a * Math.cos(l.aim) + m.c * Math.sin(l.aim), y: m.b * Math.cos(l.aim) + m.d * Math.sin(l.aim) };
      anchors.push({ n: l.n, x: lens.x, y: lens.y, a: Math.atan2(dir.y, dir.x), scale: Math.hypot(m.a, m.b), l });
      const glow = l.power;
      ctx.save();
      // Stand: a post from the floor up to the pivot, and a base plate.
      line([[l.bx, floor], [l.bx, l.by]], 11);
      line([[l.bx, floor], [l.bx, l.by]], 6, IRON);
      filled(IRON, () => ctx.roundRect(l.bx - 22, floor - (floor > l.by ? 8 : -2), 44, 8, 3));
      ctx.translate(l.bx, l.by);
      ctx.rotate(l.aim);
      const len = l.len;
      // The drum: a brass barrel with a pale top highlight and a dark underside band, a rim at the lens end and a back cap.
      filled(BRASS_DARK, () => ctx.ellipse(-26, 0, 7, 19, 0, 0, 7)); // back cap
      filled(BRASS, () => ctx.roundRect(-26, -19, len + 18, 38, 6));
      ctx.fillStyle = BRASS_LIGHT;
      ctx.fillRect(-20, -15, len + 6, 7);
      ctx.fillStyle = BRASS_DARK;
      ctx.fillRect(-20, 9, len + 6, 7);
      line([[len - 24, -19], [len - 24, 19]], 3.2); // a seam
      filled(BRASS_DARK, () => ctx.roundRect(len - 8, -23, 16, 46, 5)); // rim
      // The lens: pale and glowing when the lamp is working.
      ctx.fillStyle = `rgb(${Math.round(240 + 15 * glow)},${Math.round(222 + 30 * glow)},${Math.round(150 + 80 * glow)})`;
      ctx.beginPath();
      ctx.ellipse(len + 2, 0, 5, 17, 0, 0, 7);
      ctx.fill();
      ink();
      ctx.lineWidth = 2.5;
      ctx.stroke();
      // Pivot pin and a handle at the back.
      filled(IRON, () => ctx.arc(0, 0, 6, 0, 7));
      line([[-30, 0], [-46, 0], [-46, -10]], 4);
      ctx.restore();
    }
  };

  // ---- The darkness ----
  let off = null;
  let octx = null;
  let shipGlowGrad = null;
  let dark = 0; // smoothed
  let lastTime = 0;

  // Light cone path (canvas pixels).
  const cone = (c, x, y, a, h, R) => {
    c.beginPath();
    c.moveTo(x, y);
    c.arc(x, y, R, a - h, a + h);
    c.closePath();
  };

  // Is this canvas point over the ship (gasbag or gondola), where the ship's own glow already lights it?
  const onShip = (px, py) => {
    if (!shipM) return false;
    const det = shipM.a * shipM.d - shipM.b * shipM.c || 1;
    const lx = (shipM.d * (px - shipM.e) - shipM.c * (py - shipM.f)) / det;
    const ly = (-shipM.b * (px - shipM.e) + shipM.a * (py - shipM.f)) / det;
    const G = L.gasbag;
    return ((lx - G.cx) / (G.rx + 60)) ** 2 + ((ly - G.cy) / (G.ry + 60)) ** 2 < 1 || (lx > -60 && lx < 1660 && ly > 380 && ly < 990);
  };

  const draw = (view, width, height, time) => {
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    const lights = state.searchlights;
    if (!lights || !anchors.length) return;
    const flash = state.weather ? Math.min(1, state.weather.flash * 1.2) : 0;
    const target = darkTarget(state);
    dark += (target - dark) * Math.min(1, dt * D.SMOOTH);
    if (Math.abs(target - dark) < 0.002) dark = target;
    const alphaDark = dark * (1 - flash);
    const k = view.zoom;
    const sx = (x) => width / 2 + (x - view.cx) * k;
    const sy = (y) => height / 2 + (y - view.cy) * k;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1. The dark itself, with light cut out of it.
    if (alphaDark > 0.01 && width >= 1 && height >= 1) { // (a 0-size screen, e.g. a minimised window, has nothing to darken)
      const RES = perfDarkRes(D.RES); // (coarser when the perf governor has stepped down)
      const w = Math.ceil(width / RES);
      const h = Math.ceil(height / RES);
      if (!off) {
        off = document.createElement('canvas');
        octx = off.getContext('2d');
      }
      if (off.width !== w || off.height !== h) {
        off.width = w;
        off.height = h;
      }
      const q = 1 / RES;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalCompositeOperation = 'source-over';
      octx.globalAlpha = 1;
      octx.clearRect(0, 0, w, h);
      octx.fillStyle = `rgba(${D.COLOR},${alphaDark.toFixed(3)})`;
      octx.fillRect(0, 0, w, h);
      octx.globalCompositeOperation = 'destination-out';
      octx.fillStyle = '#000';
      // The ship's own glow: the gasbag and the gondola, grown outward in a few soft layers.
      if (shipM) {
        // One soft ellipse (a radial gradient squashed to the ship's shape): clear over the whole ship, fading out beyond it.
        octx.setTransform(shipM.a * q, shipM.b * q, shipM.c * q, shipM.d * q, shipM.e * q, shipM.f * q);
        octx.translate(D.SHIP_GLOW_CX, D.SHIP_GLOW_CY);
        octx.scale(D.SHIP_GLOW_RX, D.SHIP_GLOW_RY);
        if (!shipGlowGrad) { // (the same every frame: built once; a gradient works on any transform)
          const sg = octx.createRadialGradient(0, 0, 0, 0, 0, 1);
          const G = D.SHIP_GLOW;
          sg.addColorStop(0, 'rgba(0,0,0,1)');
          sg.addColorStop(0.62, 'rgba(0,0,0,1)');
          sg.addColorStop(0.78, `rgba(0,0,0,${(G * 0.8).toFixed(3)})`);
          sg.addColorStop(0.9, `rgba(0,0,0,${(G * 0.35).toFixed(3)})`);
          sg.addColorStop(1, 'rgba(0,0,0,0)');
          shipGlowGrad = sg;
        }
        octx.fillStyle = shipGlowGrad;
        octx.fillRect(-1, -1, 2, 2);
      }
      octx.setTransform(q, 0, 0, q, 0, 0);
      // Beams.
      for (const an of anchors) {
        const l = an.l;
        const R = l.reach * an.scale;
        if (R < 20 || l.power < 0.05) continue;
        const g = octx.createRadialGradient(an.x, an.y, 0, an.x, an.y, R);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.55, 'rgba(0,0,0,.85)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = g;
        for (const [wide, amt] of [[1.35, 0.3], [1, 0.45], [0.55, 0.55]]) {
          octx.globalAlpha = amt * Math.min(1, l.power * 1.2);
          cone(octx, an.x, an.y, an.a, l.half * wide, R);
          octx.fill();
        }
        octx.globalAlpha = Math.min(1, l.power);
        const lg = octx.createRadialGradient(an.x, an.y, 0, an.x, an.y, 150 * an.scale);
        lg.addColorStop(0, 'rgba(0,0,0,.9)');
        lg.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = lg;
        octx.beginPath();
        octx.arc(an.x, an.y, 150 * an.scale, 0, 7);
        octx.fill();
      }
      // Muzzle flashes and explosions glow a little.
      octx.globalAlpha = 1;
      const lamp = (x, y, r, amt) => {
        const px = sx(x);
        const py = sy(y);
        const pr = r * k;
        if (px < -pr || px > width + pr || py < -pr || py > height + pr) return;
        const g = octx.createRadialGradient(px, py, 0, px, py, pr);
        g.addColorStop(0, `rgba(0,0,0,${amt})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        octx.fillStyle = g;
        octx.beginPath();
        octx.arc(px, py, pr, 0, 7);
        octx.fill();
      };
      for (const f of state.flashes || []) lamp(f.x, f.y, D.LAMP * (f.size || 1), 0.8);
      for (const r of state.rings || []) lamp(r.x, r.y, D.LAMP * 0.6 * ((r.size || 80) / 80) * Math.min(1, (r.t || 0) / ((r.max || 0.3) * 0.8)), 0.55);
      octx.globalCompositeOperation = 'source-over';
      octx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, w, h, 0, 0, width, height);
    }

    // 2. The beams you can see (a soft warm cone), and lens flares.
    const aBeam = alphaDark > 0.15 ? S.DARK_ALPHA : S.DAY_ALPHA;
    for (const an of anchors) {
      const l = an.l;
      const R = l.reach * an.scale;
      if (R < 20 || l.power < 0.05) continue;
      const g = ctx.createRadialGradient(an.x, an.y, 0, an.x, an.y, R);
      g.addColorStop(0, `rgba(${WARM},.95)`);
      g.addColorStop(0.45, `rgba(${WARM},.5)`);
      g.addColorStop(1, `rgba(${WARM},0)`);
      ctx.fillStyle = g;
      for (const [wide, amt] of [[1.2, 0.45], [0.8, 0.6], [0.4, 0.7]]) {
        ctx.globalAlpha = aBeam * amt * l.power * (0.9 + 0.1 * Math.sin(time * 40));
        cone(ctx, an.x, an.y, an.a, l.half * wide, R);
        ctx.fill();
      }
      if (l.power > 0.3) {
        ctx.globalAlpha = Math.min(1, l.power) * 0.8;
        const fr = 46 * an.scale;
        const fg = ctx.createRadialGradient(an.x, an.y, 0, an.x, an.y, fr);
        fg.addColorStop(0, `rgba(${WARM},.9)`);
        fg.addColorStop(1, `rgba(${WARM},0)`);
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(an.x, an.y, fr, 0, 7);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // 3. Lit targets: warm brackets (and a faint halo) round everything in a manned beam.
    for (const t of state.litTargets || []) {
      const px = sx(t.x);
      const py = sy(t.y);
      const r = Math.max(t.r, 24) * k * (1.15 + 0.06 * Math.sin(time * 9 + t.x));
      if (px < -r || px > width + r || py < -r || py > height + r) continue;
      const hg = ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 1.5);
      hg.addColorStop(0, `rgba(${WARM},.28)`);
      hg.addColorStop(1, `rgba(${WARM},0)`);
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(px, py, r * 1.5, 0, 7);
      ctx.fill();
      const arm = r * 0.42;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [col, wd] of [[INK, Math.max(5, 7 * k)], ['#fff6c8', Math.max(2.4, 3.4 * k)]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = wd;
        ctx.beginPath();
        for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const bx = px + cx * r;
          const by = py + cy * r;
          ctx.moveTo(bx - cx * arm, by);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx, by - cy * arm);
        }
        ctx.stroke();
      }
    }

    // 4. In the dark, enemies outside the light show glowing eyes (or a lamp): you know something is there.
    if (D.EYES && alphaDark > 0.12) {
      const a = Math.min(1, alphaDark * 1.4) * D.EYE_ALPHA;
      for (const t of state.dimTargets || []) {
        const px = sx(t.x);
        const py = sy(t.y);
        if (px < -40 || px > width + 40 || py < -40 || py > height + 40) continue;
        if (onShip(px, py)) continue; // (right on the ship it is plainly visible)
        const r = Math.max(2.4, Math.min(9, t.r * 0.13 * k));
        const pulse = 0.75 + 0.25 * Math.sin(time * 6 + t.x * 0.01);
        let eyes = [[-0.32, -0.08], [0.32, -0.08]];
        let col = '255,196,84';
        if (t.kind === 'mine') {
          eyes = [[0, -0.5]];
          col = '255,70,60';
        } else if (t.kind === 'bomb' || t.kind === 'rocket' || t.kind === 'saw' || t.kind === 'cable') {
          eyes = [[0, 0]];
          col = '255,140,50';
        } else if (t.kind === 'turret' || t.kind === 'gport' || t.kind === 'bossgun') col = '255,90,70';
        const big = t.kind === 'boss' || t.kind === 'gunship' || t.kind === 'bomber';
        const er = big ? r * 1.6 : r;
        for (const [ex, ey] of eyes) {
          const ox = px + ex * t.r * k;
          const oy = py + ey * t.r * k;
          const eg = ctx.createRadialGradient(ox, oy, 0, ox, oy, er * 3.2);
          eg.addColorStop(0, `rgba(${col},${(a * pulse).toFixed(3)})`);
          eg.addColorStop(0.35, `rgba(${col},${(a * pulse * 0.5).toFixed(3)})`);
          eg.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = eg;
          ctx.beginPath();
          ctx.arc(ox, oy, er * 3.2, 0, 7);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  };

  return { drawBellyPod, drawLamps, draw };
}
