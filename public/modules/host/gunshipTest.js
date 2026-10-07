// Test page for the gunship art (public/gunshiptest.html): draws several generated gunships with the real gunshipArt.js
// over the Sky Isles sky, in a grid: hull sizes, single / twin bags, mirrored, damaged, sinking.
import { config } from '../../config.js';
import { generateBlueprint, mx, deckYAt } from './gunshipBlueprint.js';
import { createGunshipArt } from './gunshipArt.js';
import { createSprites } from './sprites.js';
import { loadTextures } from './textureArt.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const sprites = createSprites();
const state = { players: {}, paras: [], ship: { alt: 0, gas: 50, speed: 0 }, phase: 'flight', gunship: null };
const ink = () => {
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = config.OUTLINE.MAIN;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
};
const draw = createGunshipArt({ ctx, state, ink, sprites });
loadTextures(ctx);

// Find a seed that gives the wanted hull / twin bag.
const find = (hull, twin, from = 1) => {
  for (let s = from; s < 3000; s++) {
    const bp = generateBlueprint(s, { hull, mission: 5 });
    if (!!bp.twin === twin) return s;
  }
  return from;
};
const CASES = [
  { hull: 'cutter', twin: false, hp: 1, m: 1, label: 'cutter, single bag' },
  { hull: 'frigate', twin: false, hp: 1, m: 1, label: 'frigate, single bag' },
  { hull: 'frigate', twin: true, hp: 1, m: -1, label: 'frigate, twin bags, mirrored' },
  { hull: 'dreadnought', twin: false, hp: 0.55, m: 1, label: 'dreadnought, hurt (55%)' },
  { hull: 'dreadnought', twin: true, hp: 0.2, m: 1, label: 'dreadnought, twin bags, nearly dead (20%)', dead: true },
  { hull: 'cutter', twin: true, hp: 0.5, m: -1, label: 'cutter, twin, mirrored, hurt', sink: 0.5 },
];
const seeds = {};
// ?only=3 shows just that case, big.
const only = new URLSearchParams(location.search).get('only');
const COLS = only === null ? 2 : 1;
const CW = only === null ? 1000 : 1900;
const CH = only === null ? 520 : 1000;
if (only !== null) {
  cv.width = CW;
  cv.height = CH;
}

let sky = null;
const img = new Image();
img.onload = () => (sky = img);
img.src = '/art/backgrounds/skyisles/sky.png';
sprites.load();

const mk = (c, i) => {
  const seed = (seeds[i] = seeds[i] || find(c.hull, c.twin, 1 + i * 7));
  const bp = generateBlueprint(seed, { hull: c.hull, mission: 5 });
  const g = {
    bp, dx: 0, dy: 0, m: c.m, gas: 0.8, hp: c.hp * 100, max: 100, thr: 0.6, steam: 0.8, intent: ['attack', 'strafe', 'retreat', 'latch', 'climb', 'approach'][i % 6],
    phase: c.sink ? 'sinking' : 'hunt', sink: c.sink || 0, props: [0, 0, 0], eng: bp.engines.map(() => ({ hp: c.hp < 0.4 ? 0.2 : c.hp < 0.6 ? 0.45 : 1 })), ports: bp.weapons.map((w, k) => ({ kind: w.kind, dead: !!c.dead && k % 2 === 0, glow: k === 1 })),
    posts: { helm: true, steam: true, guns: 1 }, engF: 1, wvx: 0, pitch: 0, wheel: 0.3, crew: [], hit: 0, turn: null, warnFire: i === 1,
  };
  const roles = ['gunner', 'helm', 'stoker', 'guard', 'gunner', 'guard', 'guard'];
  roles.slice(0, bp.crew).forEach((role, k) => {
    const list = role === 'gunner' ? bp.posts.gunner : role === 'helm' ? bp.posts.helm : role === 'stoker' ? bp.posts.stoker : bp.posts.guard;
    const post = list[k % list.length];
    const x = mx(g, post);
    g.crew.push({ role, post: x, x, y: deckYAt(g, x), hp: 3, face: -c.m, wind: k === 3 ? 1 : 0, hammer: role === 'guard' && k === 5 ? 1 : 0 });
  });
  return g;
};

const frame = (t) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#7fb6d9';
  ctx.fillRect(0, 0, cv.width, cv.height);
  CASES.forEach((c, i) => {
    if (only !== null && i !== Number(only)) return;
    const col = only !== null ? 0 : i % COLS;
    const row = only !== null ? 0 : Math.floor(i / COLS);
    ctx.save();
    ctx.beginPath();
    ctx.rect(col * CW, row * CH, CW, CH);
    ctx.clip();
    if (sky) ctx.drawImage(sky, 0, 0, sky.naturalWidth, sky.naturalHeight, col * CW, row * CH, CW, CH);
    const g = mk(c, i);
    state.gunship = g;
    const bp = g.bp;
    const top = bp.bagTop - 90;
    const bot = bp.hullBot + 90;
    const wL = bp.x0 - 200;
    const wR = bp.x1 + 130;
    const s = Math.min((CW - 30) / (wR - wL), (CH - 50) / (bot - top));
    ctx.translate(col * CW + 15 - wL * s, row * CH + 25 - top * s);
    ctx.scale(s, s);
    draw(t / 1000);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px Georgia';
    ctx.fillText(c.label + '  (seed ' + seeds[i] + ', ' + g.bp.layout + ', ' + g.bp.special + ')', col * CW + 10, row * CH + 18);
  });
  if (!window.__once) {
    window.__once = true;
  }
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);
window.gunshipTest = { state };
