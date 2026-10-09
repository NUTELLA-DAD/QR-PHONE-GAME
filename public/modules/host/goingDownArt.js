// Drawing for "GOING DOWN!" (goingDown.js) and for limping home: the LIFT vs WEIGHT balance bar on the TV, the boiler's steam gauge, the marked joints where a section can be cut away,
// the glowing gasbag leaks, the TV alarm (red edge, banner, fall timer), "SHE HOLDS!", spare gasbags and the "LIMPING HOME" card. Same hand-inked look as shipArt.js: thin warm-brown
// ink, flat fills, no gradients. Everything takes ctx (+ state) so render.js / shipArt.js only need one small call each.
import { config } from '../../config.js';
import { mainShip } from './ships.js';

const INK = config.INK;
const WOOD = '#b98a55';
const GOLD = '#ffd23f';

const rr = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
};

// The boiler's steam gauge, above the boiler while she is falling: full steam is more lift, but the red zone blows the boiler (and a glow when it runs hot).
export function drawBoilerSteam(ctx, state, time) {
  const g = state.goingDown;
  if (!g) return;
  const lay = mainShip(state).layout;
  const boiler = lay.one('boiler');
  if (!boiler) return;
  const by = lay.platforms[boiler.d].y;
  const BO = config.BOILER;
  const press = Math.max(0, Math.min(100, state.ship.press));
  const hot = press >= BO.WARN_AT;
  ctx.save();
  if (press > BO.OVERDRIVE_AT) {
    // a flat disc that pulses in steps (4 frames at 8 fps), no blend mode
    const step = Math.floor(time * 8) & 3;
    ctx.fillStyle = hot ? `rgba(230,70,50,${0.2 + 0.07 * step})` : `rgba(240,160,60,${0.1 + 0.05 * step})`;
    ctx.beginPath();
    ctx.arc(boiler.x - 25, by - 56, 90, 0, 7);
    ctx.fill();
  }
  const x = boiler.x - 70;
  const y = by - 140;
  ctx.fillStyle = 'rgba(27,20,16,.8)';
  rr(ctx, x - 6, y - 24, 142, 38, 8);
  ctx.fill();
  ctx.fillStyle = hot ? '#ff8a6c' : '#f3ead6';
  ctx.font = '13px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'left';
  ctx.fillText(hot ? 'TOO HOT! VENT IT!' : 'STEAM - HOT GAS LIFTS', x, y - 8);
  ctx.fillStyle = '#3b2a1d';
  ctx.fillRect(x, y, 130, 9);
  ctx.fillStyle = hot ? '#e63946' : press > BO.OVERDRIVE_AT ? '#ff9f1c' : '#ffd23f';
  ctx.fillRect(x, y, 130 * (press / 100), 9);
  ctx.fillStyle = 'rgba(230,57,70,.55)'; // the red zone
  ctx.fillRect(x + 130 * (BO.WARN_AT / 100), y, 130 * (1 - BO.WARN_AT / 100), 9);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y, 130, 9);
  ctx.restore();
}

// Marks on the ship while she falls (ship coordinates): the joints where a section can be cut away (a dashed red line at the cut, a sign, the hold ring) and a ring round every
// loose load that must go overboard.
export function drawFallMarks(ctx, state, time) {
  const g = state.goingDown;
  if (!g) return;
  const lay = mainShip(state).layout;
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  ctx.save();
  ctx.lineCap = 'round';
  for (const ld of state.loads || []) {
    const y = lay.platforms[ld.d].y - 24;
    ctx.strokeStyle = `rgba(255,210,63,${0.55 + 0.3 * pulse})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -time * 20;
    ctx.beginPath();
    ctx.arc(ld.x, y, 36 + pulse * 3, 0, 7);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const j of g.joints) {
    const pl = lay.platforms[j.d];
    if (!pl) continue;
    const y = pl.y;
    ctx.strokeStyle = `rgba(230,57,70,${0.7 + 0.3 * pulse})`;
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 9]);
    ctx.lineDashOffset = -time * 30;
    ctx.beginPath();
    ctx.moveTo(j.edge, y - 150);
    ctx.lineTo(j.edge, y + 70);
    ctx.stroke();
    ctx.setLineDash([]);
    if (g.t / g.time < config.GOING_DOWN.CUT_AT * 0.7 && j.prog < 0.02) continue; // (the sign only shows once the easy ways are running out; the dashed line is always there)
    // the sign where you stand
    ctx.fillStyle = 'rgba(27,20,16,.88)';
    rr(ctx, j.x - 62, y - 128, 124, 40, 8);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ff8a6c';
    ctx.font = '13px ' + config.FONTS.DISPLAY;
    ctx.textAlign = 'center';
    ctx.fillText('CUT AWAY HERE', j.x, y - 112);
    ctx.fillStyle = '#f3ead6';
    ctx.font = '700 11px ' + config.FONTS.TEXT;
    ctx.fillText(`-${Math.round(j.mass)} weight, hold Action`, j.x, y - 96);
    if (j.prog > 0.02) {
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(j.x, y - 40, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, j.prog));
      ctx.stroke();
    }
  }
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

// One small gauge chip of the LIFT vs WEIGHT panel: a title, a value and a hint of what to do about it. tone: 'ok' | 'warn' | 'bad' | '' (plain).
const chip = (ctx, x, y, w, title, value, hint, tone) => {
  ctx.fillStyle = 'rgba(60,44,32,.9)';
  rr(ctx, x, y, w, 50, 8);
  ctx.fill();
  ctx.strokeStyle = tone === 'bad' ? '#ff4d4d' : tone === 'warn' ? '#ffb347' : tone === 'ok' ? '#7bdc8a' : INK;
  ctx.lineWidth = tone ? 3 : 2;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#d9c9a8';
  ctx.font = '11px ' + config.FONTS.DISPLAY;
  ctx.fillText(title, x + w / 2, y + 14);
  ctx.fillStyle = tone === 'bad' ? '#ff8a6c' : '#f3ead6';
  ctx.font = '17px ' + config.FONTS.DISPLAY;
  ctx.fillText(value, x + w / 2, y + 33);
  ctx.fillStyle = '#b8a88a';
  ctx.font = '700 10px ' + config.FONTS.TEXT;
  ctx.fillText(hint, x + w / 2, y + 45);
};

// The big LIFT vs WEIGHT balance bar: the two as one tug of war (the divider passes the middle when lift beats weight), the verdict, and the gauges that move it.
function drawBalance(ctx, state, g, time) {
  const m = g.m;
  if (!m) return;
  const x = 470, y = 172, w = 780;
  const need = g.need, saved = need <= 0;
  ctx.fillStyle = 'rgba(27,20,16,.9)';
  rr(ctx, x, y, w, 158, 14);
  ctx.fill();
  ctx.strokeStyle = saved ? '#7bdc8a' : INK;
  ctx.lineWidth = saved ? 4 : 2.5;
  ctx.stroke();
  // the bar
  const bx = x + 20, bw = w - 40, by = y + 14, bh = 40;
  const share = Math.max(0.04, Math.min(0.96, m.lift / Math.max(1, m.lift + m.weight)));
  ctx.fillStyle = '#a9774a';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = saved ? '#58c878' : '#58b6ff';
  ctx.fillRect(bx, by, bw * share, bh);
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(bx, by, bw * share, bh / 3);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(bx, by, bw, bh);
  // where the divider has to get to: half way (the margin moves it a little)
  const goal = bx + bw * ((m.weight + config.GOING_DOWN.MARGIN) / (2 * m.weight + config.GOING_DOWN.MARGIN));
  ctx.strokeStyle = '#fff6d6';
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(goal, by - 5);
  ctx.lineTo(goal, by + bh + 5);
  ctx.stroke();
  ctx.setLineDash([]);
  // the divider itself
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx + bw * share - 3, by - 4, 6, bh + 8);
  ctx.strokeRect(bx + bw * share - 3, by - 4, 6, bh + 8);
  ctx.font = '22px ' + config.FONTS.DISPLAY;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`LIFT ${Math.round(m.lift)}`, bx + 12, by + 28);
  ctx.textAlign = 'right';
  ctx.fillText(`WEIGHT ${Math.round(m.weight)}`, bx + bw - 12, by + 28);
  // the verdict
  ctx.textAlign = 'center';
  if (saved) {
    ctx.fillStyle = '#7bdc8a';
    ctx.font = '22px ' + config.FONTS.DISPLAY;
    ctx.fillText(`HOLD IT! ${Math.min(config.GOING_DOWN.HOLD, g.hold).toFixed(1)} / ${config.GOING_DOWN.HOLD}s`, x + w / 2, y + 80);
  } else {
    ctx.fillStyle = need > 25 ? '#ff8a6c' : '#ffd23f';
    ctx.font = '22px ' + config.FONTS.DISPLAY;
    ctx.fillText(`SHORT BY ${Math.ceil(need)} - DUMP WEIGHT, PATCH AND PUMP, FULL STEAM!`, x + w / 2, y + 80);
  }
  // the gauges
  const BO = config.BOILER;
  const open = g.holes.filter((h) => state.gasHoles.includes(h)).length;
  const press = Math.round(state.ship.press);
  const cy = y + 94, cw = 104, gap = 8.7;
  let cx = x + 20;
  const next = (...a) => { chip(ctx, cx, cy, cw, ...a); cx += cw + gap; };
  next('GAS BAGS', `${Math.round(m.gas)}%`, open ? 'patch, then pump' : 'pump (the helm)', m.gas > 70 ? 'ok' : m.gas < 30 ? 'warn' : '');
  next('STEAM', `${press}`, press >= BO.WARN_AT ? 'VENT IT!' : `+${Math.round(m.steam)} lift, stoke`, press >= BO.WARN_AT ? 'bad' : press > BO.OVERDRIVE_AT ? 'ok' : '');
  next('LEAKS', `${g.required - open}/${g.required}`, open ? 'patch the glow' : 'all patched', open ? 'warn' : 'ok');
  next('CARGO', `${Math.round(m.cargo)}`, m.cargo > 0.5 ? 'shovel overboard' : 'all gone', m.cargo > 0.5 ? 'warn' : 'ok');
  next('BOMBS', `${m.bombs.toFixed(1)}`, m.bombs > 0.1 ? 'drop (hold)' : 'dropped', m.bombs > 0.1 ? '' : 'ok');
  next('COAL', `${Math.round(m.coal)}`, g.coalGone ? 'bunker dumped' : 'dump bunker (hold)', g.coalGone ? 'ok' : '');
  next('TRIM', m.trim > 0.4 ? `-${m.trim.toFixed(1)}` : 'level', m.trim > 0.4 ? 'dump evenly!' : 'no lift spilt', m.trim > 2 ? 'bad' : m.trim > 0.4 ? 'warn' : 'ok');
  void time;
}

// The TV alarm on the fixed 1600x900 stage: red pulsing edge, the GOING DOWN! banner, the fall timer and the LIFT vs WEIGHT panel. Also the "SHE HOLDS!" / "SHE'S GONE!" banner
// afterwards and the limp-home card.
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
    drawBalance(ctx, state, g, time);
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
