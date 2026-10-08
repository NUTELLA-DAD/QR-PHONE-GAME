// PvP drawing (Phase V, started in V.1a): the two-sided HUD, team pennants, edge arrows for a ship that is off
// screen, and the "!" that marks an enemy on your deck. Captain's-logbook style (logbookArt.js paper panels,
// config.FONTS, config.LOGBOOK), soft faded team colours from config.PVP_ART. No wobble. Never throws.
//
//   const art = createPvpArt({ ctx });
//   // (render.js and versusArt.js call these:)
//   art.drawWorld(ships, view, w, h, now);   // team pennants, in world space
//   art.drawEdgeArrows(ships, view, w, h);   // arrows to a ship that is off screen
//   art.drawHud(hud, w, h, now);             // left red / right blue hull bars, round timer
//   art.drawBang(x, y, team, view, now);     // call inside the world transform, over an enemy crew member
//
// ships: [{ bounds, alt, offset: {dx, dy}, team: 'red' | 'blue', hull }]   (the same list the arena camera takes)
// hud:   { left: { team, label, hull (0-100), wins }, right: { ... }, timer (seconds left, or null), round, rounds }
import { config } from '../../../config.js';
import { createLogbook } from '../logbookArt.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function createPvpArt({ ctx }) {
  const book = createLogbook({ ctx });
  const P = () => config.PVP_ART || {};
  const L = () => config.LOGBOOK;
  const colors = (team) => {
    const p = P();
    return team === 'blue' ? { main: p.BLUE, dark: p.BLUE_DARK, pale: p.BLUE_PALE } : { main: p.RED, dark: p.RED_DARK, pale: p.RED_PALE };
  };
  const inkLine = (w) => {
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };
  const worldTo = (view, w, h) => ctx.setTransform(view.zoom, 0, 0, view.zoom, w / 2 - view.cx * view.zoom, h / 2 - view.cy * view.zoom);

  // A swallow-tailed flag on a pole, streaming back (left) from (x, y) = the foot of the pole. Zoom keeps the ink line readable.
  const pennant = (x, y, team, zoom, time, phase) => {
    const p = P().PENNANT || {};
    const c = colors(team);
    const pole = clamp(p.POLE, 20, 400), len = clamp(p.LEN, 30, 600), hgt = clamp(p.HEIGHT, 10, 300), wave = clamp(p.WAVE, 0, 0.6);
    const lw = clamp(1.8 / zoom, 3, 12);
    const topY = y - pole;
    inkLine(lw);
    ctx.beginPath(); // the pole
    ctx.moveTo(x, y);
    ctx.lineTo(x, topY - 8);
    ctx.stroke();
    const N = 6; // flag: a strip of 6 slices (smooth sine ripple, not a random wobble)
    const edge = (u, side) => {
      const fx = x - len * u;
      const fy = topY + (side ? hgt : 0) * (1 - 0.35 * u) + Math.sin(time * 3.2 + phase - u * 4.5) * hgt * wave * u;
      return [fx, fy];
    };
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const [fx, fy] = edge(i / N, 0); i ? ctx.lineTo(fx, fy) : ctx.moveTo(fx, fy); }
    const [tx, ty] = edge(1, 1);
    const [nx, ny] = edge(0.82, 0.5); // the swallowtail notch
    ctx.lineTo(tx, ty - hgt * 0.15);
    ctx.lineTo(nx - len * 0.04, ny + hgt * 0.1);
    ctx.lineTo(tx, ty + hgt * 0.1);
    for (let i = N; i >= 0; i--) { const [fx, fy] = edge(i / N, 1); ctx.lineTo(fx, fy); }
    ctx.closePath();
    ctx.fillStyle = c.main;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath(); // a pale stripe along the flag
    for (let i = 0; i <= N - 1; i++) { const [fx, fy] = edge(i / N, 0); const m = edge(i / N, 1); const yy = fy + (m[1] - fy) * 0.5; i ? ctx.lineTo(fx, yy) : ctx.moveTo(fx, yy); }
    ctx.strokeStyle = c.pale;
    ctx.lineWidth = Math.max(2, hgt * 0.16);
    ctx.stroke();
    ctx.fillStyle = c.dark; // brass-ish finial
    ctx.beginPath();
    ctx.arc(x, topY - 8, lw * 1.1, 0, 7);
    ctx.fill();
  };

  // Team pennants on top of each gasbag (world space).
  const drawWorld = (ships, view, w, h, time) => {
    try {
      ctx.save();
      worldTo(view, w, h);
      (ships || []).forEach((s, i) => {
        const b = s.bounds || { x0: 0, x1: 1600, y0: 0, y1: 900 };
        const o = s.offset || { dx: 0, dy: 0 };
        const x = (b.x0 + b.x1) / 2 + clamp(o.dx, -1e6, 1e6);
        const y = b.y0 - (Number.isFinite(s.alt) ? s.alt : 0) + clamp(o.dy, -1e6, 1e6) + 12;
        pennant(x, y, s.team, view.zoom, time / 1000, i * 1.9);
      });
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  // Arrows at the screen edge pointing to a ship that is not fully on screen (the camera can be capped).
  const drawEdgeArrows = (ships, view, w, h, pr = 1) => {
    try {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const m = 46 * pr;
      for (const s of ships || []) {
        const b = s.bounds || { x0: 0, x1: 1600, y0: 0, y1: 900 };
        const o = s.offset || { dx: 0, dy: 0 };
        const wx = (b.x0 + b.x1) / 2 + clamp(o.dx, -1e6, 1e6);
        const wy = (b.y0 + b.y1) / 2 - (Number.isFinite(s.alt) ? s.alt : 0) + clamp(o.dy, -1e6, 1e6);
        const sx = w / 2 + (wx - view.cx) * view.zoom;
        const sy = h / 2 + (wy - view.cy) * view.zoom;
        if (sx > m && sx < w - m && sy > m && sy < h - m) continue;
        const ax = clamp(sx, m, w - m), ay = clamp(sy, m, h - m);
        const ang = Math.atan2(sy - h / 2, sx - w / 2);
        const c = colors(s.team);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(ang);
        inkLine(3 * pr);
        ctx.fillStyle = c.main;
        ctx.beginPath();
        ctx.moveTo(22 * pr, 0);
        ctx.lineTo(-14 * pr, -18 * pr);
        ctx.lineTo(-6 * pr, 0);
        ctx.lineTo(-14 * pr, 18 * pr);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  const fmtTime = (t) => {
    if (!Number.isFinite(t)) return '-:--';
    const s = Math.max(0, Math.ceil(t));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // One side's panel on the 1600x900 stage. side = -1 (left) or 1 (right: the bar fills from the right edge).
  const panel = (d, side) => {
    const H = P().HUD || {};
    const pw = clamp(H.W, 200, 700), ph = clamp(H.H, 60, 200), py = clamp(H.Y, 0, 200), bw = clamp(H.BAR_W, 100, pw - 60), bh = clamp(H.BAR_H, 10, 40);
    const x0 = side < 0 ? 30 : config.W - 30 - pw;
    const c = colors(d.team || (side < 0 ? 'red' : 'blue'));
    const hull = clamp(d.hull, 0, 100);
    book.paper(x0, py, pw, ph, { r: 12 });
    // team colour band along the outer edge of the panel
    ctx.fillStyle = c.main;
    ctx.fillRect(side < 0 ? x0 + 9 : x0 + pw - 17, py + 12, 8, ph - 24);
    inkLine(2);
    ctx.strokeRect(side < 0 ? x0 + 9 : x0 + pw - 17, py + 12, 8, ph - 24);
    const bx = side < 0 ? x0 + 34 : x0 + pw - 34 - bw;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = L().INK;
    ctx.font = '22px ' + config.FONTS.DISPLAY;
    ctx.textAlign = side < 0 ? 'left' : 'right';
    ctx.fillText(String(d.label || (side < 0 ? 'RED CREW' : 'BLUE CREW')).slice(0, 18), side < 0 ? bx : bx + bw, py + 36);
    // hull bar
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(bx, py + 48, bw, bh);
    ctx.fillStyle = hull > clamp(H.LOW, 0, 100) ? c.main : L().STAMP;
    const fw = (bw * hull) / 100;
    ctx.fillRect(side < 0 ? bx : bx + bw - fw, py + 48, fw, bh);
    inkLine(2.5);
    ctx.strokeRect(bx, py + 48, bw, bh);
    ctx.font = '700 14px ' + config.FONTS.TEXT;
    ctx.fillStyle = L().INK_SOFT;
    ctx.fillText('HULL ' + Math.round(hull) + '%', side < 0 ? bx : bx + bw, py + 48 + bh + 20);
    // round wins as pips (the first to win `rounds / 2 + 1` takes the match)
    const wins = clamp(d.wins, 0, 9);
    const n = clamp(Math.floor((d.rounds || 3) / 2) + 1, 1, 6);
    for (let i = 0; i < n; i++) {
      const px = side < 0 ? bx + bw - 12 - i * 26 : bx + 12 + i * 26;
      ctx.beginPath();
      ctx.arc(px, py + 28, 9, 0, 7);
      ctx.fillStyle = i < wins ? c.main : 'rgba(58,44,32,.12)';
      ctx.fill();
      inkLine(2);
      ctx.stroke();
    }
  };

  // The screen overlay: left (red) and right (blue) panels, round timer in the middle. Drawn on a fixed 1600x900 stage.
  const drawHud = (hud, w, h) => {
    try {
      if (!hud) return;
      ctx.save();
      const scale = Math.min(w / config.W, h / config.H);
      ctx.setTransform(scale, 0, 0, scale, (w - config.W * scale) / 2, (h - config.H * scale) / 2);
      const rounds = hud.rounds || 3;
      if (hud.left) panel({ ...hud.left, rounds }, -1);
      if (hud.right) panel({ ...hud.right, rounds }, 1);
      const py = clamp((P().HUD || {}).Y, 0, 200);
      book.paper(config.W / 2 - 90, py, 180, 74, { r: 12, pins: false });
      ctx.textAlign = 'center';
      ctx.fillStyle = L().INK_SOFT;
      ctx.font = '700 13px ' + config.FONTS.TEXT;
      ctx.fillText('ROUND ' + (hud.round || 1) + ' OF ' + rounds, config.W / 2, py + 24);
      ctx.fillStyle = hud.timer != null && hud.timer < 30 ? L().STAMP : L().INK;
      ctx.font = '36px ' + config.FONTS.DISPLAY;
      ctx.fillText(fmtTime(hud.timer), config.W / 2, py + 60);
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  // "!" over an enemy crew member on your deck. Call inside the world transform; (x, y) = their head. Sized to stay readable when zoomed out.
  const drawBang = (x, y, team, view, time) => {
    try {
      const zoom = view && view.zoom > 0 ? view.zoom : 0.3;
      const r = clamp(16 / zoom, ((P().BANG || {}).SIZE || 30) * 0.6, 120);
      const by = y - r * 1.6 + Math.sin(time * 6) * r * 0.12;
      const c = colors(team);
      inkLine(clamp(2 / zoom, 2.5, 10));
      ctx.fillStyle = c.pale;
      ctx.beginPath();
      ctx.arc(x, by, r, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = config.INK;
      ctx.font = Math.round(r * 1.5) + 'px ' + config.FONTS.DISPLAY;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x, by + r * 0.08);
      ctx.textBaseline = 'alphabetic';
    } catch (e) { /* drawing must never throw */ }
  };

  return { drawWorld, drawEdgeArrows, drawHud, drawBang, pennant };
}
