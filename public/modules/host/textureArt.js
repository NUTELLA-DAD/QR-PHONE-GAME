// Tileable painted textures for the ship and enemy gunships (art/textures/<name>.png, 512x512, seamless both ways).
// Each is a LOW-CONTRAST mid-grey-ish painting that is laid over the flat palette colour with the 'overlay' blend,
// so the palette stays exactly as it is and only gains a gentle gouache/paper grain. If a texture is missing, or
// config.TEXTURES.ENABLED is false, nothing happens and the flat fill stays. Patterns are built once; drawing never throws.
import { config } from '../../config.js';

const NAMES = ['canvas', 'wood', 'brass', 'darkwood', 'oxblood', 'charcoal', 'enemycanvas'];
const pats = {};
let started = false;
const report = (e) => { const list = (globalThis.gameErrors = globalThis.gameErrors || []); if (list.length < 50) list.push('texture: ' + (e && e.message)); };
const on = () => !!(config.TEXTURES && config.TEXTURES.ENABLED);

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
      img.onload = () => {
        try {
          const p = ctx.createPattern(img, 'repeat');
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

export const hasTexture = (name) => on() && !!pats[name];

// Fill the CURRENT path with the texture (overlay, so the flat colour underneath keeps its hue).
export function paintPath(ctx, name, alpha = 1) {
  try {
    const p = on() && pats[name];
    if (!p) return;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
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
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = alpha * (ctx.globalAlpha || 1);
    ctx.fillStyle = p;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  } catch (e) { report(e); }
}
