// Tileable painted textures for the ship and enemy gunships (art/textures/<name>.png, 512x512, seamless both ways).
// Each is a LOW-CONTRAST mid-grey-ish painting. When it loads it is turned ONCE into a "light and shade" layer:
// pixels lighter than the painting's average become see-through white, darker ones see-through dark brown
// (config.TEXTURES.STRENGTH sets how strong). That layer is laid over the flat palette colour with a plain
// normal blend, which looks like the old 'overlay' grain but is far cheaper for the graphics card (overlay made
// it copy the screen for every ship shape, every frame). If a texture is missing, or config.TEXTURES.ENABLED
// is false, nothing happens and the flat fill stays. Patterns are built once; drawing never throws.
import { config } from '../../config.js';
import { perfTextures } from './perf.js';

const NAMES = ['canvas', 'wood', 'brass', 'darkwood', 'oxblood', 'charcoal', 'enemycanvas'];
const pats = {};
let started = false;
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('texture: ' + (e && e.message)); };
const on = () => !!(config.TEXTURES && config.TEXTURES.ENABLED) && perfTextures(); // (the perf governor drops textures on a slow screen)

// The texture as light/shade on a see-through layer (see the top of this file).
function shadeLayer(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  const n = px.length / 4;
  const lum = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
  mean /= n;
  // STRENGTH 1 is about one old overlay pass; each extra point adds another.
  const gain = 1.6 * strength();
  for (let i = 0; i < n; i++) {
    const v = lum[i] - mean;
    const a = Math.min(1, Math.abs(v) * gain);
    const light = v > 0;
    px[i * 4] = light ? 255 : 34;
    px[i * 4 + 1] = light ? 250 : 22;
    px[i * 4 + 2] = light ? 238 : 12;
    px[i * 4 + 3] = Math.round(a * 255);
  }
  g.putImageData(d, 0, 0);
  return c;
}

export function loadTextures(ctx) {
  if (started || typeof fetch !== 'function' || typeof Image === 'undefined') return;
  started = true;
  (async () => {
    let list = [];
    try { list = await (await fetch('/api/textures')).json(); } catch { return; }
    const scale = Math.max(0.05, Number(config.TEXTURES && config.TEXTURES.SCALE) || 1);
    await Promise.all(list.map((file) => new Promise((resolve) => {
      const name = file.replace(/\.png$/i, '').toLowerCase();
      if (!NAMES.includes(name)) return resolve();
      const img = new Image();
      img.onload = async () => {
        try {
          // (an ImageBitmap lives on the graphics card; a plain canvas made for pixel reading would be
          // re-uploaded every time the pattern is drawn, which was very slow)
          let src = shadeLayer(img);
          if (typeof createImageBitmap === 'function') src = await createImageBitmap(src);
          const p = ctx.createPattern(src, 'repeat');
          if (p && p.setTransform) p.setTransform(new DOMMatrix().scale(scale));
          if (p) pats[name] = p;
        } catch (e) { report(e); }
        resolve();
      };
      img.onerror = () => resolve();
      img.src = '/art/textures/' + file;
    })));
  })();
}

const strength = () => Math.max(0, Math.min(4, Number(config.TEXTURES && config.TEXTURES.STRENGTH) || 1));

export const hasTexture = (name) => on() && !!pats[name];

// Fill the CURRENT path with the texture (overlay, so the flat colour underneath keeps its hue).
export function paintPath(ctx, name, alpha = 1) {
  try {
    const p = on() && pats[name];
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = alpha * (ctx.globalAlpha || 1);
    ctx.fillStyle = p;
    ctx.fill();
    ctx.restore();
  } catch (e) { report(e); }
}

export function paintRect(ctx, name, x, y, w, h, alpha = 1) {
  try {
    const p = on() && pats[name];
    if (!p) return;
    ctx.save();
    ctx.globalAlpha = alpha * (ctx.globalAlpha || 1);
    ctx.fillStyle = p;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  } catch (e) { report(e); }
}
