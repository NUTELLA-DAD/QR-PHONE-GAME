// Little pictures of ship parts (Phase S.5d): the tray of the build page (buildtest.html) shows one for every kind of part, and a dragged one follows the pointer
// as a ghost. Storybook gouache like the ship itself: the same ink outline, the same flat palette (wood, iron, brass, canvas) with the painted textures laid
// over when they have loaded, and the real sprites where the ship art has one (the gasbag envelope, the engine pod, the crow's nest); everything else is
// drawn here with the same shapes and colours as the ship's own drawers in shipArt.js / render.js (boiler, extinguisher, sandbag, gun, racks ...).
//   const pics = createPartPictures({ sprites })      sprites: the sprite loader (sprites.js) or null
//   pics.get(id, px)                                   an offscreen canvas px x px (cached; ids are the palette ids in buildSlots.js PALETTE)
//   pics.refresh()                                     forget the cache (call when sprites or textures finish loading)
import { config } from '../../config.js';
import { paintPath } from './textureArt.js';

const INK = () => config.INK;
const WOOD = '#b98a5a', WOOD_DARK = '#6b4a32', IRON = '#6a6568', BRASS = '#c9a85a', RED = '#a8443f', CANVAS = '#ebdfc0';
const TEX = { [WOOD]: 'wood', [WOOD_DARK]: 'darkwood', '#5a5558': 'brass', [IRON]: 'brass', '#6d7378': 'brass', [BRASS]: 'brass', [CANVAS]: 'canvas', '#4a4346': 'charcoal' };

// Every picture is drawn in a 100 x 100 box with the ink pen below; `g` is the canvas context, `sprites` may be null.
function pen(g) {
  const ink = () => { g.strokeStyle = INK(); g.lineWidth = 3.4; g.lineJoin = 'round'; g.lineCap = 'round'; };
  const filled = (color, path) => { ink(); g.fillStyle = color; g.beginPath(); path(); g.fill(); const t = TEX[color]; if (t) paintPath(g, t, t === 'brass' ? 0.8 : 1); g.stroke(); };
  const line = (pts, width = 3.4, color = INK()) => { g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  return { ink, filled, line };
}

const DRAW = {
  gun(g, { filled, ink }, sprites) {
    g.save(); g.translate(30, 58); g.rotate(-0.42); // the barrel, tipped up on its mount
    if (!sprites || !sprites.pivot(g, 'ship/gun-barrel', 0, 0, 0.12, 0.5, 0)) {
      filled('#4a4a4a', () => g.rect(0, -9, 56, 18));
      filled('#2a2a2a', () => g.rect(50, -12, 10, 24));
      filled(BRASS, () => g.rect(20, -10, 7, 20));
    }
    g.restore();
    filled(RED, () => g.arc(30, 58, 17, 0, 7)); // the red mount
    filled(IRON, () => g.arc(30, 58, 6, 0, 7));
    filled(WOOD_DARK, () => g.rect(14, 74, 34, 10));
  },
  searchlight(g, { filled, line }) {
    g.fillStyle = 'rgba(255,238,160,0.55)'; g.beginPath(); g.moveTo(52, 46); g.lineTo(98, 14); g.lineTo(98, 78); g.closePath(); g.fill(); // the beam
    filled(WOOD_DARK, () => g.rect(24, 62, 12, 24)); line([[16, 88], [44, 88]], 5);
    g.save(); g.translate(40, 48); g.rotate(-0.1);
    filled('#6d7378', () => g.roundRect(-20, -17, 38, 34, 8));
    filled('#fff2b0', () => g.ellipse(18, 0, 7, 15, 0, 0, 7)); // the lens
    g.restore();
  },
  boiler(g, { filled, line }) {
    filled('#5a5558', () => g.roundRect(14, 22, 62, 62, 14));
    filled('#3a3538', () => g.roundRect(24, 52, 30, 22, 5));
    g.fillStyle = 'rgba(255,150,50,0.85)'; g.fillRect(28, 58, 22, 11); // the fire behind the door
    filled('#f1e2b8', () => g.arc(66, 38, 16, 0, 7)); // the pressure gauge
    line([[66, 38], [75, 30]], 3.2, RED);
    line([[34, 22], [34, 10], [46, 10]], 6); // the pipe
  },
  coal(g, { filled }) {
    filled(WOOD, () => g.rect(12, 52, 76, 36));
    filled('#3a3538', () => { g.moveTo(16, 54); g.quadraticCurveTo(50, 4, 84, 54); g.closePath(); });
    g.fillStyle = 'rgba(255,255,255,0.2)'; for (const [x, y] of [[36, 36], [54, 28], [64, 42]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
  },
  ammo(g, { filled, line }) {
    for (const [x, y] of [[10, 56], [50, 56], [30, 20]]) { filled('#c9a05f', () => g.rect(x, y, 38, 34)); line([[x, y + 17], [x + 38, y + 17]], 2.4); line([[x + 19, y], [x + 19, y + 34]], 2.4); }
  },
  lookout(g, { filled, line }) {
    line([[78, 30], [78, 4]], 4); filled(RED, () => { g.moveTo(78, 4); g.lineTo(96, 10); g.lineTo(78, 17); g.closePath(); }); // flag
    filled(WOOD, () => g.roundRect(14, 56, 72, 32, 8)); // the nest basket
    for (let x = 24; x < 84; x += 14) line([[x, 56], [x, 88]], 2.4, WOOD_DARK);
    g.save(); g.translate(34, 50); g.rotate(-0.5); // the spyglass
    filled(BRASS, () => g.rect(0, -7, 40, 14)); filled(IRON, () => g.rect(38, -9, 12, 18)); filled('#bcd9e3', () => g.arc(3, 0, 5, 0, 7));
    g.restore();
  },
  helm(g, { filled, line }) {
    filled(WOOD_DARK, () => g.roundRect(40, 62, 20, 30, 4)); // the pedestal
    g.save(); g.translate(50, 40);
    for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; line([[0, 0], [Math.cos(a) * 36, Math.sin(a) * 36]], 5, WOOD); g.fillStyle = BRASS; g.beginPath(); g.arc(Math.cos(a) * 36, Math.sin(a) * 36, 3.4, 0, 7); g.fill(); }
    filled('#d8c8a0', () => g.arc(0, 0, 25, 0, 7)); g.fillStyle = CANVAS; g.beginPath(); g.arc(0, 0, 19, 0, 7); g.fill();
    filled(BRASS, () => g.arc(0, 0, 8, 0, 7));
    g.restore();
  },
  medbay(g, { filled }) {
    filled('#f3ead6', () => g.roundRect(14, 14, 72, 72, 10));
    g.fillStyle = RED; g.fillRect(43, 26, 14, 48); g.fillRect(26, 43, 48, 14);
  },
  bombBay(g, { filled, line }) {
    filled('#4a4346', () => g.roundRect(8, 30, 84, 52, 6));
    for (let x = 14; x < 86; x += 18) { g.fillStyle = '#e0b43a'; g.beginPath(); g.moveTo(x, 76); g.lineTo(x + 9, 76); g.lineTo(x + 18, 82); g.lineTo(x + 9, 82); g.closePath(); g.fill(); } // hazard stripes
    filled('#222', () => g.ellipse(50, 52, 24, 13, 0, 0, 7));
    filled('#3a3538', () => { g.moveTo(26, 52); g.lineTo(16, 42); g.lineTo(16, 62); g.closePath(); }); // the fin
    line([[44, 40], [44, 64]], 2, '#777');
    line([[50, 30], [50, 12]], 3, '#999'); // the bomb doors, open above
  },
  lift(g, { filled, line }) {
    line([[26, 6], [26, 94]], 5, IRON); line([[74, 6], [74, 94]], 5, IRON);
    filled(BRASS, () => g.roundRect(20, 36, 60, 46, 5));
    line([[20, 52], [80, 52]], 2.4); for (const x of [38, 50, 62]) line([[x, 36], [x, 52]], 2.4);
    g.fillStyle = INK(); g.beginPath(); g.moveTo(50, 20); g.lineTo(42, 31); g.lineTo(58, 31); g.closePath(); g.fill(); // the arrow
  },
  boarding(g, { filled, line }) {
    line([[22, 94], [22, 40]], 5, '#d6bf8a'); line([[22, 40], [22, 10]], 5, '#d6bf8a');
    g.strokeStyle = '#8a8588'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(22, 40); g.quadraticCurveTo(22, 12, 54, 8); g.moveTo(22, 40); g.quadraticCurveTo(58, 50, 74, 20); g.moveTo(22, 40); g.quadraticCurveTo(44, 50, 40, 70); g.stroke(); // the grappling hook
    filled(WOOD, () => g.rect(10, 84, 54, 8));
  },
  rack_hammer(g, { filled, line }) {
    filled(WOOD, () => g.roundRect(10, 12, 80, 76, 6));
    for (const x of [34, 66]) { line([[x, 36], [x, 82]], 6, '#7a4a24'); filled(IRON, () => g.rect(x - 12, 24, 24, 17)); }
  },
  rack_sword(g, { filled, line }) {
    filled(WOOD, () => g.roundRect(10, 12, 80, 76, 6));
    for (const x of [34, 66]) { line([[x, 20], [x, 78]], 6, '#d8dde0'); line([[x - 11, 66], [x + 11, 66]], 4.4, INK()); }
  },
  rack_hookshot(g, { filled, line }) {
    filled(WOOD, () => g.roundRect(10, 12, 80, 76, 6));
    g.save(); g.translate(18, 52); g.scale(0.95, 0.95);
    filled('#9a6a3e', () => { g.moveTo(-6, -3); g.lineTo(8, -7); g.lineTo(20, -7); g.lineTo(20, 2); g.lineTo(13, 4); g.lineTo(8, 13); g.lineTo(0, 13); g.lineTo(2, 3); g.lineTo(-6, 3); g.closePath(); });
    filled('#c9a54a', () => g.rect(20, -9, 30, 8)); filled('#a8863a', () => g.rect(48, -11, 6, 12));
    line([[54, -5], [62, -5]], 4);
    g.restore();
    line([[24, 70], [24, 82]], 4, WOOD_DARK); line([[52, 70], [52, 82]], 4, WOOD_DARK);
  },
  rack_ice(g, { filled, line }) {
    filled('#cfe9f5', () => g.roundRect(14, 26, 72, 60, 8));
    g.fillStyle = 'rgba(255,255,255,0.65)'; g.fillRect(20, 32, 22, 12);
    g.strokeStyle = '#4a86a8'; g.lineWidth = 3.4; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(50 + Math.cos(a) * 20, 58 + Math.sin(a) * 20); g.lineTo(50 - Math.cos(a) * 20, 58 - Math.sin(a) * 20); g.stroke(); } // a snowflake
    line([[38, 26], [38, 12]], 4, '#9fdcff'); line([[62, 26], [62, 16]], 4, '#9fdcff'); // icicles
  },
  extinguisher(g, { filled, line }) {
    filled(RED, () => g.roundRect(34, 30, 32, 62, 12));
    filled(IRON, () => g.rect(42, 18, 16, 14));
    line([[50, 18], [68, 12]], 5); line([[66, 14], [74, 38], [66, 48]], 4);
    g.fillStyle = CANVAS; g.fillRect(38, 56, 24, 14);
  },
  vent(g, { filled, line }) {
    filled(IRON, () => g.roundRect(38, 46, 24, 46, 4));
    filled(RED, () => g.arc(50, 38, 15, 0, 7)); line([[35, 38], [65, 38]], 3.4);
    g.fillStyle = 'rgba(255,255,255,0.85)'; for (const [x, y, r] of [[34, 22, 9], [52, 12, 12], [72, 20, 9], [60, 4, 7]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  },
  engine(g, { filled, line }, sprites) {
    if (!sprites || !sprites.box(g, 'ship/engine', 4, 26, 92, 40)) {
      filled('#6d7378', () => g.ellipse(46, 48, 40, 20, 0, 0, 7));
      filled(IRON, () => g.arc(84, 48, 8, 0, 7));
      line([[16, 40], [76, 40]], 2.4);
    }
    filled('#6b4a32', () => g.ellipse(94, 48, 4, 24, 0, 0, 7)); // the propeller, edge on
    line([[28, 68], [28, 90], [4, 90]], 4); // the steam pipe in
  },
  ladder(g, { filled, line }) {
    line([[34, 6], [34, 94]], 6, WOOD_DARK); line([[66, 6], [66, 94]], 6, WOOD_DARK);
    for (let y = 16; y < 92; y += 15) line([[34, y], [66, y]], 5, WOOD);
  },
  pole(g, { filled, line }) {
    line([[50, 6], [50, 94]], 8, BRASS); line([[50, 6], [50, 94]], 2.6, '#f2dc9a');
    filled(IRON, () => g.rect(30, 4, 40, 8)); filled(IRON, () => g.rect(30, 88, 40, 8));
    g.fillStyle = INK(); g.beginPath(); g.moveTo(80, 70); g.lineTo(70, 52); g.lineTo(90, 52); g.closePath(); g.fill(); // down only
  },
  ballast(g, { filled, line }) {
    const sack = (x, y, w, h) => filled('#b79a63', () => g.roundRect(x - w / 2, y - h, w, h, 9));
    sack(34, 90, 42, 30); sack(68, 90, 42, 30); sack(51, 62, 42, 30);
    line([[40, 66], [62, 66]], 2.4);
  },
  ballast_hang(g, { filled, line }) {
    line([[50, 4], [50, 44]], 3.4); filled(IRON, () => g.rect(40, 2, 20, 8));
    filled('#b79a63', () => g.roundRect(28, 44, 44, 46, 12)); line([[38, 50], [62, 50]], 2.8);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(34, 60, 12, 6);
  },
  gasbag(g, { filled, line }, sprites) {
    g.save();
    g.beginPath(); g.ellipse(50, 50, 46, 30, 0, 0, 7);
    if (sprites && sprites.has('ship/gasbag')) { g.save(); g.clip(); sprites.box(g, 'ship/gasbag', 4, 20, 92, 60); g.restore(); g.strokeStyle = INK(); g.lineWidth = 3.4; g.stroke(); }
    else {
      filled(CANVAS, () => g.ellipse(50, 50, 46, 30, 0, 0, 7));
      g.strokeStyle = 'rgba(43,38,34,0.5)'; g.lineWidth = 2;
      for (const k of [-24, -8, 8, 24]) { g.beginPath(); g.ellipse(50 + k * 0.4, 50, Math.abs(k) + 6, 30, 0, -1.57, 1.57); g.stroke(); }
    }
    g.restore();
    line([[28, 76], [36, 92]], 3); line([[50, 80], [50, 92]], 3); line([[72, 76], [64, 92]], 3); // rigging
  },
};

export function createPartPictures({ sprites = null } = {}) {
  const cache = new Map();
  const make = (id, px) => {
    const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(px * dpr);
    const g = c.getContext('2d');
    g.scale((px * dpr) / 100, (px * dpr) / 100);
    try { (DRAW[id] || DRAW.ballast)(g, pen(g), sprites); } catch (e) { (globalThis.gameErrors = globalThis.gameErrors || []).push('partArt ' + id + ': ' + e.message); }
    return c;
  };
  return {
    get: (id, px = 72) => { const k = id + ':' + px; if (!cache.has(k)) cache.set(k, make(id, px)); return cache.get(k); },
    refresh: () => cache.clear(),
    ids: Object.keys(DRAW),
  };
}
