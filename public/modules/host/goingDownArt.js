// Drawing for "GOING DOWN!" (goingDown.js) and for limping home: the ice locker and ice blocks, the boiler's heat
// bar, the glowing gasbag leaks, the TV alarm (red edge, banner, three meters), "SHE HOLDS!", spare gasbags and the
// "LIMPING HOME" card. Same hand-inked look as shipArt.js: thin warm-brown ink, flat fills, no gradients.
// Everything takes ctx (+ state) so render.js / shipArt.js only need one small call each.
import { config } from '../../config.js';
import { mainShip } from './ships.js';

const INK = config.INK;
const ICE = '#cdeaf2';
const ICE_LIGHT = '#eaf8fb';
const ICE_SHADE = '#9fcfdd';
const WOOD = '#b98a55';
const WOOD_DARK = '#8a6038';
const GOLD = '#ffd23f';

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

// One ice block, centred on (x, y), s = size scale (1 = 36 px wide). Pale blue, a bright top facet, two cracks.
export function drawIceBlock(ctx, x, y, s = 1, tilt = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.fillStyle = ICE;
  rr(ctx, -18, -15, 36, 30, 6);
  ctx.fill();
  ctx.stroke();
  // lit top facet and a shaded side
  ctx.lineWidth = 1.6;
  ctx.fillStyle = ICE_LIGHT;
  ctx.beginPath();
  ctx.moveTo(-14, -11);
  ctx.lineTo(8, -11);
  ctx.lineTo(3, -3);
  ctx.lineTo(-14, -3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = ICE_SHADE;
  ctx.beginPath();
  ctx.moveTo(18, -9);
  ctx.lineTo(18, 9);
  ctx.quadraticCurveTo(18, 15, 12, 15);
  ctx.lineTo(8, 15);
  ctx.lineTo(8, -3);
  ctx.closePath();
  ctx.fill();
  // cracks
  ctx.strokeStyle = 'rgba(70,110,125,.7)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-8, 4);
  ctx.lineTo(-2, 8);
  ctx.lineTo(-4, 12);
  ctx.moveTo(2, 2);
  ctx.lineTo(5, 6);
  ctx.stroke();
  ctx.restore();
}

// The ice locker standing on the deck (x = the layout rack's x, deck = floor y). Door ajar, blocks stacked inside
// (one drawn per block held), frost wisps curling off the top.
export function drawIceLocker(ctx, state, time) {
  const lay = mainShip(state).layout; // (this ship's own layout)
  const r = lay.racks.find((q) => q.kind === 'ice');
  if (!r) return;
  const deck = lay.platforms[r.d].y;
  const L = state.iceLocker || { n: 0, max: 4 };
  const x = r.x;
  const w = 62;
  const h = 92;
  const y0 = deck - h;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  // feet
  ctx.fillStyle = WOOD_DARK;
  ctx.fillRect(x - w / 2 + 4, deck - 6, 10, 6);
  ctx.fillRect(x + w / 2 - 14, deck - 6, 10, 6);
  ctx.strokeRect(x - w / 2 + 4, deck - 6, 10, 6);
  ctx.strokeRect(x + w / 2 - 14, deck - 6, 10, 6);
  // cabinet body
  ctx.fillStyle = WOOD;
  rr(ctx, x - w / 2, y0, w, h - 6, 5);
  ctx.fill();
  ctx.stroke();
  // dark inside
  ctx.fillStyle = '#4b5d66';
  rr(ctx, x - w / 2 + 7, y0 + 16, w - 14, h - 34, 3);
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // blocks stacked in the opening (up to 6 shown; 2 columns)
  const shown = Math.min(6, Math.max(0, Math.round(L.n)));
  for (let k = 0; k < shown; k++) {
    const col = k % 2;
    const row = Math.floor(k / 2);
    drawIceBlock(ctx, x - w / 2 + 21 + col * 21, y0 + h - 34 - 3 - row * 17 - 4, 0.52, 0);
  }
  // door swung open on the left
  ctx.lineWidth = 2.4;
  ctx.fillStyle = '#c99a62';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y0 + 12);
  ctx.lineTo(x - w / 2 - 17, y0 + 20);
  ctx.lineTo(x - w / 2 - 17, y0 + h - 18);
  ctx.lineTo(x - w / 2, y0 + h - 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // frosty top with a little sign
  ctx.fillStyle = ICE_LIGHT;
  rr(ctx, x - w / 2 - 3, y0 - 5, w + 6, 11, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.font = '11px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'center';
  ctx.fillText('ICE', x, y0 + 14);
  // frost wisps
  for (let k = 0; k < 3; k++) {
    const t = (time * 0.5 + k / 3) % 1;
    ctx.fillStyle = `rgba(225,245,250,${0.55 - t * 0.55})`;
    ctx.beginPath();
    ctx.arc(x - 14 + k * 14 + Math.sin(time * 2 + k * 2) * 5, y0 - 8 - t * 34, 5 + t * 8, 0, 7);
    ctx.fill();
  }
  // how many are left (small pips under the sign when the locker is nearly empty)
  if (L.n < 1) {
    ctx.fillStyle = '#a8443f';
    ctx.font = '10px ' + config.FONTS.DISPLAY;
    ctx.fillText('EMPTY', x, y0 - 12);
  }
  ctx.restore();
}

// Ice blocks in flight to the boiler (ship coordinates). state.iceFlights = [{ x0, y0, x1, y1, t, max }].
export function drawIceFlights(ctx, state) {
  for (const f of state.iceFlights || []) {
    const u = Math.min(1, f.t / f.max);
    const x = f.x0 + (f.x1 - f.x0) * u;
    const y = f.y0 + (f.y1 - f.y0) * u - Math.sin(u * Math.PI) * 70;
    drawIceBlock(ctx, x, y, 0.8, u * 7 * (f.x1 < f.x0 ? -1 : 1));
  }
}

// The boiler's heat bar, above the boiler while she is falling (and a glow when it runs hot).
export function drawBoilerHeat(ctx, state, time) {
  const g = state.goingDown;
  if (!g) return;
  const lay = mainShip(state).layout;
  const boiler = lay.one('boiler');
  const by = lay.platforms[boiler.d].y;
  const heat = Math.min(1, g.heat);
  ctx.save();
  if (heat > 0.5) {
    // a flat orange disc that pulses in steps (4 frames at 8 fps), no blend mode
    const step = Math.floor(time * 8) & 3;
    ctx.fillStyle = `rgba(240,120,50,${(heat - 0.5) * (0.28 + 0.07 * step)})`;
    ctx.beginPath();
    ctx.arc(boiler.x - 25, by - 56, 90, 0, 7);
    ctx.fill();
  }
  const x = boiler.x - 70;
  const y = by - 140;
  ctx.fillStyle = 'rgba(27,20,16,.8)';
  rr(ctx, x - 6, y - 24, 142, 38, 8);
  ctx.fill();
  ctx.fillStyle = '#f3ead6';
  ctx.font = '13px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'left';
  ctx.fillText('BOILER HEAT', x, y - 8);
  ctx.fillStyle = '#3b2a1d';
  ctx.fillRect(x, y, 130, 9);
  ctx.fillStyle = heat > 0.8 ? '#e63946' : heat > 0.55 ? '#ff9f1c' : '#ffd23f';
  ctx.fillRect(x, y, 130 * heat, 9);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y, 130, 9);
  ctx.restore();
}

// A glowing ring round a gasbag leak that must be patched (called from shipArt's drawGasHoles).
export function drawHoleGlow(ctx, h, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 7);
  ctx.fillStyle = `rgba(255,210,63,${0.2 + 0.2 * pulse})`; // (a flat disc: no blend mode)
  ctx.beginPath();
  ctx.arc(h.x, h.y, 38 + pulse * 8, 0, 7);
  ctx.fill();
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.setLineDash([9, 7]);
  ctx.lineDashOffset = -time * 24;
  ctx.beginPath();
  ctx.arc(h.x, h.y, 34 + pulse * 5, 0, 7);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = INK;
  ctx.font = '14px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'center';
  ctx.fillText('PATCH!', h.x, h.y - 48 - pulse * 4);
}

// A little gasbag icon (the spare gasbags): a fat balloon with a basket, in ink and gold.
export function drawGasbagIcon(ctx, x, y, s, full = true) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.2;
  ctx.fillStyle = full ? '#e8a23a' : 'rgba(120,100,80,.35)';
  ctx.beginPath();
  ctx.ellipse(0, -8, 13, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (full) {
    ctx.strokeStyle = 'rgba(80,50,20,.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-5, -17);
    ctx.quadraticCurveTo(-8, -8, -4, 1);
    ctx.moveTo(5, -17);
    ctx.quadraticCurveTo(8, -8, 4, 1);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-6, 1);
  ctx.lineTo(-4, 6);
  ctx.moveTo(6, 1);
  ctx.lineTo(4, 6);
  ctx.stroke();
  ctx.fillStyle = full ? WOOD : 'rgba(120,100,80,.35)';
  ctx.fillRect(-5, 6, 10, 6);
  ctx.strokeRect(-5, 6, 10, 6);
  ctx.restore();
}

// "Spare gasbags" row: n full icons out of max, starting at (x, y), right-aligned if right is true.
export function drawSpares(ctx, state, x, y, right = false, s = 1) {
  const run = state.run;
  if (!run || run.spares == null) return;
  const max = run.sparesMax ?? config.LIMP.SPARES;
  const step = 30 * s;
  const w = max * step;
  const x0 = right ? x - w : x;
  for (let k = 0; k < max; k++) drawGasbagIcon(ctx, x0 + step / 2 + k * step, y, s, k < run.spares);
}

// A meter box: title, bar 0..1 (fill colour), extra text on the right of the title, optional marker (0..1).
const meter = (ctx, x, y, w, title, value, color, text, done, bad) => {
  ctx.fillStyle = 'rgba(27,20,16,.86)';
  rr(ctx, x, y, w, 68, 12);
  ctx.fill();
  ctx.strokeStyle = done ? '#7bdc8a' : bad ? '#ff4d4d' : INK;
  ctx.lineWidth = done || bad ? 4 : 2.5;
  ctx.stroke();
  ctx.fillStyle = '#f3ead6';
  ctx.font = '15px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'left';
  ctx.fillText(title, x + 14, y + 27);
  ctx.textAlign = 'right';
  ctx.fillStyle = done ? '#7bdc8a' : '#f3ead6';
  ctx.fillText(text, x + w - 14, y + 27);
  ctx.fillStyle = '#3b2a1d';
  ctx.fillRect(x + 14, y + 40, w - 28, 16);
  ctx.fillStyle = color;
  ctx.fillRect(x + 14, y + 40, (w - 28) * Math.max(0, Math.min(1, value)), 16);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 14, y + 40, w - 28, 16);
};

// The TV alarm on the fixed 1600x900 stage: red pulsing edge, the GOING DOWN! banner, the fall timer and the three
// meters. Also the "SHE HOLDS!" / "SHE'S GONE!" banner afterwards and the limp-home card.
export function drawScreen(ctx, state, time, W = 1600, H = 900) {
  const g = state.goingDown;
  if (g) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    // red edge tint (four soft bands; flat fills, no gradients)
    ctx.save();
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = `rgba(210,30,30,${(0.13 + 0.14 * pulse) * (1 - k / 6)})`;
      const t = k * 14;
      ctx.fillRect(0, t, W, 14);
      ctx.fillRect(0, H - t - 14, W, 14);
      ctx.fillRect(t, 0, 14, H);
      ctx.fillRect(W - t - 14, 0, 14, H);
    }
    // banner
    const cx = 860;
    const bounce = 1 + 0.04 * Math.sin(time * 8);
    ctx.translate(cx, 78);
    ctx.scale(bounce, bounce);
    ctx.fillStyle = 'rgba(27,20,16,.88)';
    rr(ctx, -380, -50, 760, 100, 18);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = pulse > 0.5 ? '#ff4d4d' : '#ff8a5c';
    ctx.font = '59px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillText('GOING DOWN!', 0, 24);
    ctx.restore();
    // fall timer: a bar that drains across the bottom of the banner area
    const left = Math.max(0, g.time - g.t);
    ctx.fillStyle = 'rgba(27,20,16,.86)';
    rr(ctx, 480, 134, 760, 30, 10);
    ctx.fill();
    ctx.fillStyle = left < 6 ? '#ff4d4d' : '#ffb347';
    ctx.fillRect(488, 142, 744 * (left / g.time), 14);
    ctx.fillStyle = '#f3ead6';
    ctx.font = '700 16px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(`FALLING - ${Math.ceil(left)}s to the ground!`, 860, 130);
    // the three jobs
    const y = 176;
    const liftDone = g.lift >= 1;
    const nLoads = Math.min(g.loads, Math.floor(g.lift * g.loads + 1e-6));
    meter(ctx, 480, y, 250, 'LIFT: STOKE COAL', g.lift, '#ff8c1a', `${nLoads}/${g.loads}`, liftDone, false);
    meter(ctx, 745, y, 250, `COOL: ICE x${Math.floor((state.iceLocker || { n: 0 }).n)}`, g.heat, g.heat > 0.8 ? '#e63946' : g.heat > 0.55 ? '#ff9f1c' : '#9fdcff', g.heat > 0.8 ? 'HOT!' : 'heat', false, g.heat > 0.8);
    const patched = g.required - g.holes.filter((h) => state.gasHoles.includes(h)).length;
    meter(ctx, 1010, y, 230, 'PATCH LEAKS', patched / g.required, '#4dc3ff', `${patched}/${g.required}`, patched >= g.required, false);
  }
  const b = state.gdBanner;
  if (b) {
    const a = Math.min(1, b.t * 1.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(800, 380);
    const grow = b.t > b.max - 0.25 ? 0.6 + (b.max - b.t) * 1.6 : 1;
    ctx.scale(grow, grow);
    ctx.fillStyle = 'rgba(27,20,16,.86)';
    rr(ctx, -470, -90, 940, 180, 26);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = b.color;
    ctx.font = '99px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillText(b.text, 0, 36);
    if (b.sub) {
      ctx.fillStyle = '#f3ead6';
      ctx.font = '700 26px ' + config.FONTS.TEXT;
      ctx.fillText(b.sub, 0, 78);
    }
    ctx.restore();
  }
}

// "LIMPING HOME..." card: shown during the break-up when a spare gasbag takes the blow (state.limp).
export function drawLimpCard(ctx, state, W = 1600, H = 900) {
  const l = state.limp;
  const w = state.wreck;
  if (!l || !w || w.t < 1.4) return;
  const a = Math.min(1, (w.t - 1.4) * 2);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(27,20,16,.82)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f1e2b8';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  rr(ctx, 330, 190, 940, 440, 26);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#b3261e';
  ctx.font = '59px ' + config.FONTS.DISPLAY;
  ctx.fillText('LIMPING HOME...', 800, 290);
  ctx.fillStyle = INK;
  ctx.font = '700 30px ' + config.FONTS.TEXT;
  ctx.fillText('A spare gasbag takes the strain!', 800, 342);
  ctx.font = '700 26px ' + config.FONTS.TEXT;
  ctx.fillText(l.back ? `Back to the last stop: ${l.back}` : 'Back to the start of this stop', 800, 392);
  if (l.lost > 0) ctx.fillText(`${l.lost} salvage lost in the crash`, 800, 430);
  // spare gasbags: the one just used crossed out
  const max = l.max ?? config.LIMP.SPARES;
  const step = 76;
  const x0 = 800 - ((max - 1) * step) / 2;
  for (let k = 0; k < max; k++) drawGasbagIcon(ctx, x0 + k * step, 540, 2, k < l.spares);
  ctx.font = '700 24px ' + config.FONTS.TEXT;
  ctx.fillStyle = l.spares > 0 ? INK : '#b3261e';
  ctx.fillText(l.spares > 0 ? `${l.spares} spare gasbag${l.spares > 1 ? 's' : ''} left` : 'That was the LAST spare gasbag!', 800, 596);
  ctx.restore();
}
