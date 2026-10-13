// SCRAP drawings (LOOP.md G1): the bundle, its little parachute, the gold ring round flotsam (gold = goals and pickups, art/ART_SPEC.md), a gunship's hulk and the hold bin. Flat fills, an ink outline, no gradients
// of its own; every function takes the context and a point, so the TV's world layer (render.js), the ship's art (shipArt.js) and the dock can all use them.
//   drawScrapBundle(ctx, x, y, size, rot)               one bundle of scrap: iron plates strapped together, centred on (x, y), about 34 x 26 at size 1
//   drawScrapChute(ctx, x, y, w)                        the canvas over a falling bundle, (x, y) = the bundle's top
//   drawScrapRing(ctx, x, y, r, time)                   the gold ring (a dashed circle that turns slowly, with a soft glow)
//   drawScrapHulk(ctx, h, time)                         a gunship's hulk (h = { x, y, rot, left, max, hooked })
//   drawScrapBin(ctx, x, y, count, cap, time)           the hold bin standing on a deck at (x, y): a slatted crate that shows how full it is
//   drawRivetPlate(ctx, x, y, w, rot)                   a riveted iron plate bolted over a failing stretch of the frame (the scrap patch, G2), centred on (x, y), about 52 x 22 at w 52
import { config } from '../../config.js';

const INK = () => config.INK;
const GOLD = '#ffd23f';
const IRON = ['#8d96a0', '#b3bcc6', '#76808a'];
const STRAP = '#d9a24a';

export function drawScrapBundle(ctx, x, y, size = 1, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(size, size);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK();
  ctx.lineJoin = 'round';
  [[-15, -12, 28, 9, 0], [-13, -3, 30, 9, 1], [-16, 6, 29, 8, 2]].forEach(([px, py, w, h, c]) => { // three plates, a little out of line
    ctx.fillStyle = IRON[c];
    ctx.beginPath();
    ctx.rect(px, py, w, h);
    ctx.fill();
    ctx.stroke();
  });
  ctx.fillStyle = STRAP; // the strap that holds them
  ctx.beginPath();
  ctx.rect(-4, -14, 7, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK();
  ctx.beginPath();
  ctx.arc(-0.5, -8, 1.4, 0, 7);
  ctx.arc(-0.5, 8, 1.4, 0, 7);
  ctx.fill();
  ctx.restore();
}

export function drawScrapChute(ctx, x, y, w = 56) {
  const top = y - w * 0.85;
  ctx.save();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = INK();
  ctx.beginPath(); // the strings first, under the canvas
  ctx.moveTo(x - w / 2, top + w * 0.3); ctx.lineTo(x - 6, y - 12);
  ctx.moveTo(x + w / 2, top + w * 0.3); ctx.lineTo(x + 6, y - 12);
  ctx.moveTo(x, top + w * 0.3); ctx.lineTo(x, y - 12);
  ctx.stroke();
  ctx.lineWidth = 2.8;
  for (let k = 0; k < 4; k++) { // the canvas: four gores, white and brick red
    ctx.fillStyle = k % 2 ? '#c4574d' : '#f1e6c9';
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + (k * w) / 4, top + w * 0.3);
    ctx.quadraticCurveTo(x - w / 2 + (k * w) / 4 + w / 8, top - w * 0.12, x - w / 2 + ((k + 1) * w) / 4, top + w * 0.3);
    ctx.lineTo(x - w / 2 + (k * w) / 4, top + w * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawScrapRing(ctx, x, y, r, time = 0) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,210,63,0.16)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
  ctx.setLineDash([r * 0.5, r * 0.32]);
  ctx.lineDashOffset = -(time * 26) % (r * 0.82);
  ctx.strokeStyle = INK();
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.stroke();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4.4;
  ctx.stroke();
  ctx.restore();
}

export function drawScrapHulk(ctx, h, time = 0) {
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate((h.rot || 0) * 0.3);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK();
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#5d5558'; // the broken hull, a keel and a torn plank edge
  ctx.beginPath();
  ctx.moveTo(-170, -10); ctx.lineTo(-120, 34); ctx.lineTo(-30, 46); ctx.lineTo(70, 38); ctx.lineTo(150, 6); ctx.lineTo(170, -22);
  ctx.lineTo(120, -8); ctx.lineTo(96, -34); ctx.lineTo(54, -14); ctx.lineTo(18, -40); ctx.lineTo(-20, -12); ctx.lineTo(-62, -30); ctx.lineTo(-100, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#8d96a0';
  ctx.lineWidth = 3;
  ctx.beginPath(); // plank lines
  ctx.moveTo(-110, 14); ctx.lineTo(120, 10); ctx.moveTo(-70, 30); ctx.lineTo(70, 26);
  ctx.stroke();
  ctx.restore();
  const n = Math.max(0, h.left | 0); // the bundles still on it, piled on top
  for (let k = 0; k < n; k++) drawScrapBundle(ctx, h.x - 70 + k * 44, h.y - 56 - (k % 2) * 14, 1.1, ((k % 3) - 1) * 0.12);
}

export function drawRivetPlate(ctx, x, y, w = 52, rot = 0) {
  const h = w * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK();
  ctx.lineJoin = 'round';
  ctx.fillStyle = IRON[0];
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = IRON[1]; // a lit edge along the top
  ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 3);
  ctx.fillStyle = INK(); // the rivets, one in each corner and one between
  for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { ctx.beginPath(); ctx.arc(rx * (w / 2 - 6), ry * (h / 2 - 5), 1.9, 0, 7); ctx.fill(); }
  ctx.restore();
}

export function drawScrapBin(ctx, x, y, count, cap, time = 0) {
  const w = 80, h = 58;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK();
  ctx.lineWidth = 3;
  ctx.fillStyle = '#7c5a3a'; // the crate behind the scrap
  ctx.beginPath(); ctx.rect(x - w / 2, y - h, w, h); ctx.fill(); ctx.stroke();
  const rows = 2, per = Math.ceil(cap / rows); // what is in it: bundles in two courses
  for (let i = 0; i < Math.min(count, cap); i++) drawScrapBundle(ctx, x - w / 2 + 12 + (i % per) * ((w - 20) / per) + 4, y - 12 - Math.floor(i / per) * 22, 0.52, ((i % 3) - 1) * 0.06);
  ctx.fillStyle = '#a07848'; // the front slats, the top ones left open so the pile shows
  ctx.beginPath(); ctx.rect(x - w / 2, y - 14, w, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK();
  ctx.font = '700 15px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'center';
  ctx.fillText(`HOLD ${count}/${cap}`, x, y - h - 8);
  ctx.restore();
}
