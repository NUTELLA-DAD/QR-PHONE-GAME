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

// A FRAME (LOOP.md G4, buildFrames.js): the scaffold of a part the crew bought and are building from carried scrap, in the SHIP's own frame. f = { ghost: { x0, y0, x1, y1 }, x, y, fill, prog, need, name }:
// timber poles and braces round the part's place, the part filling in from the bottom as bundles go in (iron plates, rising), a row of bundle slots over it (solid = in, dashed = still to carry) and "n/m". spot = { x, y }
// where the crew stand (the deck point nearest the place): a gold ring there says BUILD HERE.
const WOOD = '#8a6a44', WOOD_DARK = '#5e4630';
export function drawFrameScaffold(ctx, f, time = 0, spot = null) {
  const g = f.ghost && f.ghost.x0 != null ? f.ghost : { x0: f.x - 44, x1: f.x + 44, y0: f.y - 74, y1: f.y + 12 };
  const w = g.x1 - g.x0, h = g.y1 - g.y0, t = Math.max(0, Math.min(1, ((f.fill || 0) + (f.prog || 0)) / Math.max(1, f.need)));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(243,234,214,0.30)'; // the part's ghost: a pale panel
  ctx.fillRect(g.x0, g.y0, w, h);
  if (t > 0) { // the part filling in: iron plates rising from the bottom
    const fh = h * t;
    ctx.fillStyle = 'rgba(141,150,160,0.82)';
    ctx.fillRect(g.x0, g.y1 - fh, w, fh);
    ctx.strokeStyle = INK();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let y = g.y1 - 13; y > g.y1 - fh; y -= 13) { ctx.moveTo(g.x0, y); ctx.lineTo(g.x1, y); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(179,188,198,0.9)';
    ctx.fillRect(g.x0, g.y1 - fh, w, 4);
  }
  ctx.strokeStyle = WOOD_DARK; // the scaffold: two poles, a top beam and two braces
  ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(g.x0, g.y1); ctx.lineTo(g.x0, g.y0 - 8); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x1, g.y0 - 8); ctx.moveTo(g.x0 - 8, g.y0); ctx.lineTo(g.x1 + 8, g.y0); ctx.stroke();
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(g.x0, g.y1); ctx.lineTo(g.x1, g.y0); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x0, g.y0); ctx.stroke();
  ctx.setLineDash([14, 9]); // the dashed outline of what is coming
  ctx.lineDashOffset = -(time * 20) % 23;
  ctx.strokeStyle = INK();
  ctx.lineWidth = 6;
  ctx.strokeRect(g.x0, g.y0, w, h);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3.2;
  ctx.strokeRect(g.x0, g.y0, w, h);
  ctx.setLineDash([]);
  const n = Math.max(1, f.need | 0), step = Math.min(34, (w + 40) / n), x0 = (g.x0 + g.x1) / 2 - (step * (n - 1)) / 2, by = g.y0 - 30;
  for (let k = 0; k < n; k++) { // the bundle slots over it
    if (k < (f.fill || 0)) drawScrapBundle(ctx, x0 + k * step, by, 0.6);
    else { ctx.setLineDash([4, 4]); ctx.strokeStyle = INK(); ctx.lineWidth = 2; ctx.strokeRect(x0 + k * step - 10, by - 8, 20, 16); ctx.setLineDash([]); }
  }
  const cx = (g.x0 + g.x1) / 2, ty = by - 42; // the tag: a gold plate on a pole, "BUILD n/m"
  ctx.strokeStyle = WOOD_DARK;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(cx, ty + 12); ctx.lineTo(cx, by - 12); ctx.stroke();
  ctx.font = '700 30px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'center';
  const tag = `BUILD ${f.fill || 0}/${f.need}`, tw = ctx.measureText(tag).width + 26;
  ctx.fillStyle = GOLD;
  ctx.strokeStyle = INK();
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.roundRect(cx - tw / 2, ty - 26, tw, 40, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK();
  ctx.fillText(tag, cx, ty + 5);
  ctx.restore();
  if (spot) drawScrapRing(ctx, spot.x, spot.y - 6, 26, time); // BUILD HERE: the gold ring on the deck where the crew stand
}
