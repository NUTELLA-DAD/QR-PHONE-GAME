// 1930s cartoon look for the host screen:
//  - line boil: outlines wobble a little, redrawn ~10 times a second, like hand-drawn animation
//  - film look over the whole screen: paper grain, film grain, warm tint, vignette, flicker, scratches
// Settings in config.STYLE.
import { config } from '../../config.js';

const S = config.STYLE;
let boilFrame = 0;

// Same point + same frame = same wobble, so a shape's fill and outline stay together.
const wobble = (x, y, salt) => {
  const h = Math.sin(Math.round(x) * 12.9898 + Math.round(y) * 78.233 + boilFrame * 37.719 + salt) * 43758.5453;
  return (h - Math.floor(h)) * 2 - 1;
};

// Wrap the canvas path functions so every point gets a small, frame-stepped wobble.
export function installLineBoil(ctx) {
  if (!S.LINE_BOIL) return;
  const A = S.BOIL_AMOUNT;
  const off = (x, y) => [x + wobble(x, y, 1) * A, y + wobble(x, y, 2) * A];
  const wrap = (name, fn) => {
    const orig = ctx[name].bind(ctx);
    ctx[name] = (...args) => orig(...fn(args));
  };
  wrap('moveTo', ([x, y]) => off(x, y));
  wrap('lineTo', ([x, y]) => off(x, y));
  wrap('quadraticCurveTo', ([cx, cy, x, y]) => [...off(cx, cy), ...off(x, y)]);
  wrap('bezierCurveTo', ([c1x, c1y, c2x, c2y, x, y]) => [...off(c1x, c1y), ...off(c2x, c2y), ...off(x, y)]);
  wrap('arc', ([x, y, r, a0, a1, ccw]) => [...off(x, y), Math.max(0.1, r + wobble(x, y, 3) * A * 0.6), a0, a1, ccw]);
  wrap('ellipse', ([x, y, rx, ry, rot, a0, a1, ccw]) => [...off(x, y), Math.max(0.1, rx + wobble(x, y, 4) * A), Math.max(0.1, ry + wobble(x, y, 5) * A), rot, a0, a1, ccw]);
}

// Call once per frame before drawing.
export function setBoilTime(timeMs) {
  boilFrame = Math.floor((timeMs / 1000) * S.BOIL_FPS);
}

// Noise texture (made once) used for paper and film grain.
function makeNoise(size, contrast) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * contrast;
    img.data[i] = v;
    img.data[i + 1] = v * 0.97;
    img.data[i + 2] = v * 0.9;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function createFilmLook(ctx) {
  const paper = ctx.createPattern(makeNoise(256, 70), 'repeat');
  const grain = ctx.createPattern(makeNoise(200, 160), 'repeat');
  let vignette = null;
  let vigSize = '';
  let step = -1;
  let gx = 0;
  let gy = 0;
  let flicker = 0;
  let scratch = null;

  // Draw over the finished frame (screen space).
  return (timeMs, width, height) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // New grain position, flicker and maybe a scratch ~12 times a second.
    const s = Math.floor(timeMs / 83);
    if (s !== step) {
      step = s;
      gx = Math.random() * 200;
      gy = Math.random() * 200;
      flicker = Math.random() * S.FLICKER;
      scratch = Math.random() < 0.06 ? { x: Math.random() * width, w: 1 + Math.random() * 2 } : null;
    }
    // Warm sepia tint.
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = S.WARM_TINT;
    ctx.fillStyle = '#e8c890';
    ctx.fillRect(0, 0, width, height);
    // Paper texture (fixed) and film grain (jumping).
    ctx.globalAlpha = S.PAPER;
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = S.GRAIN;
    ctx.translate(gx, gy);
    ctx.fillStyle = grain;
    ctx.fillRect(-gx, -gy, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Vignette (cached per screen size).
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (vigSize !== width + 'x' + height) {
      vigSize = width + 'x' + height;
      vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.6);
      vignette.addColorStop(0, 'rgba(40,25,10,0)');
      vignette.addColorStop(1, `rgba(40,25,10,${S.VIGNETTE})`);
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    // Projector flicker and the odd scratch.
    ctx.fillStyle = `rgba(20,12,5,${flicker})`;
    ctx.fillRect(0, 0, width, height);
    if (scratch) {
      ctx.fillStyle = 'rgba(255,250,235,.35)';
      ctx.fillRect(scratch.x, 0, scratch.w, height);
    }
    ctx.restore();
  };
}
