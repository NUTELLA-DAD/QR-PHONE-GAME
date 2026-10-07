// "Captain's logbook" look for the TV panels: cream paper, warm-brown ink border, a fine inner rule,
// small brass corner pins, and red ink "stamps" for warnings. All flat colours (config.LOGBOOK), no
// wobble. A paper panel is baked once per size to an offscreen canvas, so each frame is one drawImage.
// Never throws (a crash in drawing freezes the TV).
import { config } from '../../config.js';

const PAD = 8; // room around a baked panel for its drop shadow

export function createLogbook({ ctx }) {
  const cache = new Map();

  const path = (g, x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };

  const scaleNow = () => {
    try {
      const m = ctx.getTransform();
      const s = Math.hypot(m.a, m.b);
      return Number.isFinite(s) ? Math.max(0.5, Math.min(3, s)) : 1;
    } catch {
      return 1;
    }
  };

  const pin = (g, x, y, rad) => {
    const L = config.LOGBOOK;
    g.fillStyle = L.PIN;
    g.strokeStyle = L.PIN_DARK;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, rad, 0, 6.2832);
    g.fill();
    g.stroke();
    g.fillStyle = 'rgba(255,248,214,.85)'; // the one small highlight
    g.beginPath();
    g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.32, 0, 6.2832);
    g.fill();
  };

  const bake = (w, h, r, pins, fill, ruled, s) => {
    const L = config.LOGBOOK;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil((w + PAD * 2) * s));
    cv.height = Math.max(1, Math.ceil((h + PAD * 2) * s));
    const g = cv.getContext('2d');
    g.scale(s, s);
    g.translate(PAD, PAD);
    g.lineJoin = 'round';
    path(g, 3, 4, w, h, r); // soft drop shadow
    g.fillStyle = L.SHADOW;
    g.fill();
    path(g, 0, 0, w, h, r); // paper
    g.fillStyle = fill || L.PAPER;
    g.fill();
    if (ruled && h > 160) { // faint ruled lines, like a ledger
      g.save();
      path(g, 0, 0, w, h, r);
      g.clip();
      g.strokeStyle = L.RULE;
      g.lineWidth = 1;
      g.beginPath();
      for (let y = 48; y < h - 14; y += 32) {
        g.moveTo(14, y + 0.5);
        g.lineTo(w - 14, y + 0.5);
      }
      g.stroke();
      g.restore();
    }
    const inset = Math.min(6, w / 8, h / 8);
    path(g, inset, inset, w - inset * 2, h - inset * 2, Math.max(2, r - inset)); // fine inner rule
    g.strokeStyle = L.INK_SOFT;
    g.globalAlpha = 0.45;
    g.lineWidth = 1;
    g.stroke();
    g.globalAlpha = 1;
    path(g, 0, 0, w, h, r); // ink border
    g.strokeStyle = L.INK;
    g.lineWidth = L.BORDER;
    g.stroke();
    if (pins) {
      const rad = h > 200 ? 6 : h > 80 ? 4.5 : 3.5;
      const o = Math.min(w, h) > 200 ? 18 : 9;
      for (const [px, py] of [[o, o], [w - o, o], [o, h - o], [w - o, h - o]]) pin(g, px, py, rad);
    }
    return cv;
  };

  // A paper panel at (x, y) size w x h. opts: r (corner radius), pins (default true), fill, ruled.
  const paper = (x, y, w, h, opts = {}) => {
    try {
      w = Math.round(Math.max(8, w));
      h = Math.round(Math.max(8, h));
      const r = Math.round(Math.max(2, Math.min(opts.r ?? 12, 40)));
      const pins = opts.pins !== false;
      const s = scaleNow();
      const key = `${w}|${h}|${r}|${pins ? 1 : 0}|${opts.fill || ''}|${opts.ruled ? 1 : 0}|${s.toFixed(2)}`;
      let cv = cache.get(key);
      if (!cv) {
        if (cache.size > 40) cache.clear();
        cv = bake(w, h, r, pins, opts.fill, opts.ruled, s);
        cache.set(key, cv);
      }
      ctx.drawImage(cv, x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);
    } catch (e) { /* drawing must never throw */ }
  };

  // A red ink "stamp" (warnings, alarms): double red border on pale paper, Limelight text, a slight tilt.
  // Centred on (cx, cy). Returns the stamp's width.
  const stamp = (text, cx, cy, opts = {}) => {
    try {
      const L = config.LOGBOOK;
      const size = Math.max(10, Math.min(opts.size || 24, 80));
      const col = opts.color || L.STAMP;
      ctx.save();
      ctx.font = size + 'px ' + config.FONTS.DISPLAY;
      const maxW = opts.maxW || 1300;
      const tw = Math.min(maxW, ctx.measureText(text).width);
      const w = tw + size * 1.6;
      const h = size * 1.9;
      ctx.translate(cx, cy);
      ctx.rotate(opts.rot ?? -0.025);
      path(ctx, -w / 2, -h / 2, w, h, 6);
      ctx.fillStyle = L.STAMP_BG;
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = col;
      ctx.lineWidth = 3.2;
      ctx.stroke();
      path(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 3);
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 1, maxW);
      ctx.restore();
      return w;
    } catch (e) {
      try { ctx.restore(); } catch (e2) { /* ignore */ }
      return 0;
    }
  };

  return { paper, stamp };
}
