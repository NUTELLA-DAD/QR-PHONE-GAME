// Painted background images (optional). Files in art/backgrounds/<env>/ :
//   sky  - whole-screen sky painting (fixed)       far / mid / near - sideways-tileable strips, parallax
//   cave - tileable texture for the cave backdrop
// If an environment has none of these, nothing here does anything and the drawn background is used.
// Everything is fixed to the world (strips slide at a steady fraction of the ship's travel, tiles
// are drawn in whole pixels so no seams or shimmer), and drawing never throws.
import { config } from '../../config.js';

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
const wrap = (v, span) => ((v % span) + span) % span;
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('background: ' + (e && e.message)); };
const KINDS = ['sky', 'far', 'mid', 'near', 'cave'];

export function createBackgroundArt({ ctx, state }) {
  const imgs = {}; // 'env/kind' -> image
  let loaded = false;

  const load = async () => {
    let list = [];
    try {
      list = await (await fetch('/api/backgrounds')).json();
    } catch {
      return;
    }
    const files = {};
    const rank = (f) => (/\.png$/i.test(f) ? 3 : /\.webp$/i.test(f) ? 2 : /\.jpe?g$/i.test(f) ? 1 : 0);
    for (const file of list) {
      const m = file.match(/^([a-z0-9_-]+)\/(sky|far|mid|near|cave)\.(png|webp|jpe?g|svg)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase() + '/' + m[2].toLowerCase();
      if (!files[key] || rank(file) > rank(files[key])) files[key] = file;
    }
    await Promise.all(
      Object.entries(files).map(
        ([key, file]) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth > 0 && img.naturalHeight > 0) imgs[key] = img;
              resolve();
            };
            img.onerror = () => {
              console.warn('Could not load background', file);
              resolve();
            };
            img.src = `/art/backgrounds/${file}`;
          }),
      ),
    );
    loaded = true;
    const n = Object.keys(imgs).length;
    if (n) console.log(`Loaded ${n} background image(s)`);
  };

  const on = () => config.BACKGROUNDS && config.BACKGROUNDS.ENABLED;
  const get = (env, kind) => (on() ? imgs[env + '/' + kind] || null : null);
  // True if this environment has any painted sky or strip (the cave texture alone doesn't count).
  const has = (env) => !!(get(env, 'sky') || get(env, 'far') || get(env, 'mid') || get(env, 'near'));

  // A tileable strip along the bottom of the screen (its height a share of the screen's, per layer),
  // scrolling at `f` of the ship's travel. Far layers sit lower and paler so the sky and the action read.
  const strip = (img, width, height, view, f, kind) => {
    const B = config.BACKGROUNDS;
    const L = (B.LAYERS && B.LAYERS[kind]) || {};
    const over = Math.max(1, num(B.OVERSCAN, 1.1));
    const share = Math.max(0.05, Math.min(1, num(L.HEIGHT, 1)));
    const h = height * share * over;
    const tw = Math.max(1, Math.round((img.naturalWidth * h) / img.naturalHeight));
    const s = height / config.H;
    const shift = (num(view.scroll) + num(view.cx)) * f * s;
    // Camera high = picture shifts down a little, low = up (inside the spare height).
    const v = Math.max(-1, Math.min(1, (num(view.cy, config.H / 2) - config.H / 2) / config.H));
    const spare = h - height * share;
    const y = Math.round(height - h + spare * (0.5 + v * 0.5));
    let x = -Math.floor(wrap(shift, tw));
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * Math.max(0, Math.min(1, num(L.ALPHA, 1)));
    for (; x < width; x += tw) ctx.drawImage(img, x, y, tw + 1, Math.round(h)); // (+1: overlap, no hairline seams)
    ctx.globalAlpha = a;
  };

  // Draws the painted layers for env. `fallback` draws the normal drawn sky when there is no sky.png.
  // Returns true if it drew (so the caller skips the drawn background).
  const draw = (env, width, height, view, fallback) => {
    try {
      if (!has(env)) return false;
      const sky = get(env, 'sky');
      if (sky) {
        // Cover the screen (crop the overflow), centred.
        const k = Math.max(width / sky.naturalWidth, height / sky.naturalHeight);
        const w = sky.naturalWidth * k;
        const h = sky.naturalHeight * k;
        ctx.drawImage(sky, (width - w) / 2, (height - h) / 2, w, h);
      } else if (fallback) fallback();
      for (const kind of ['far', 'mid', 'near']) {
        const img = get(env, kind);
        if (img) strip(img, width, height, view, num(config.BACKGROUNDS.PARALLAX[kind], 0.05), kind);
      }
      return true;
    } catch (e) {
      report(e);
      return false;
    }
  };

  // The cave backdrop: tiles the texture over the map rectangle b (world space, the caller has set the camera).
  // Returns true if it drew.
  const cave = (env, view, b) => {
    try {
      const img = get(env, 'cave');
      if (!img || !(b.x1 > b.x0) || !(b.y1 > b.y0)) return false;
      const C = config.BACKGROUNDS.CAVE;
      const th = Math.max(64, num(C.HEIGHT, 900));
      const tw = (img.naturalWidth * th) / img.naturalHeight;
      const f = num(C.PARALLAX, 0.5);
      // Tiles are laid on a grid that follows the camera at (1 - f): near-world feel, no shimmer.
      const ox = num(view.cx) * f;
      const oy = num(view.cy) * f;
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      ctx.clip();
      const i0 = Math.floor((b.x0 - ox) / tw);
      const j0 = Math.floor((b.y0 - oy) / th);
      for (let i = i0; i * tw + ox < b.x1; i++) {
        for (let j = j0; j * th + oy < b.y1; j++) ctx.drawImage(img, i * tw + ox, j * th + oy, tw + 1, th + 1);
      }
      const dim = num(C.DIM, 0);
      if (dim > 0) {
        ctx.fillStyle = `rgba(10,10,20,${dim})`;
        ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      }
      ctx.restore();
      return true;
    } catch (e) {
      report(e);
      try { ctx.restore(); } catch { /* nothing */ }
      return false;
    }
  };

  return { load, draw, cave, has, get, count: () => Object.keys(imgs).length, isLoaded: () => loaded, KINDS };
}
