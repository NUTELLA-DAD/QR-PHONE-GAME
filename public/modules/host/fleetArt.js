// Fleet art (B.3): what the TV adds when MORE THAN ONE airship is in the sky. With one ship (co-op) none of it is drawn and the HUD is exactly the old one.
//   * a compact logbook panel for each ship (her team colour, her name, hull, steam, gas, trim, the bow pennant that says which way she faces and how far a COME ABOUT has got),
//     in a row across the top, between the big panel and the minimap;
//   * the team pennant on each teamed ship's mast (pvp/pvpArt.js draws the flag), in the world;
//   * an arrow at the screen edge for a ship that is off screen (the camera cannot always fit every ship: view.clipped).
// Captain's-logbook look (logbookArt.js, config.LOGBOOK, config.FONTS); the numbers are config.FLEET. Never throws.
import { config } from '../../config.js';
import { createLogbook } from './logbookArt.js';
import { createPvpArt } from './pvp/pvpArt.js';
import { windSpeed } from './sails.js';
import { pivotOf } from './pose.js';
import { metres } from './pvp/range.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));

export function createFleetArt({ ctx }) {
  const book = createLogbook({ ctx });
  const pvp = createPvpArt({ ctx });
  const LB = () => config.LOGBOOK;
  const teamOfShip = (sh) => sh.team || config.FLEET.TEAMS.brass;
  const ink = (w) => {
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = w;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  };

  // One thin gauge: a dark trough, the fill, an optional white tick (the neutral gas level), an ink outline.
  const gauge = (x, y, w, h, value, fill, tick) => {
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * clamp(value, 0, 1), h);
    if (tick != null) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + w * tick - 1.5, y - 2, 3, h + 4);
    }
    ink(2);
    ctx.strokeRect(x, y, w, h);
  };

  // The bow pennant: a flag that points the way her bow points on the screen (squashing through zero while she comes about), and the hold / turn bar under it.
  const bow = (sh, cx, cy) => {
    const f = sh.pose.f;
    const turning = sh.pose.turn > 0;
    const hold = (sh.ctx.turning && sh.ctx.turning.hold) || 0;
    const T = config.SHIP.TURN;
    const squash = turning ? Math.abs(Math.cos(Math.PI * sh.pose.turn)) : 1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = LB().INK_SOFT;
    ctx.font = '700 9px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.fillText(turning ? 'COMING ABOUT' : 'AHEAD', 0, -9);
    ctx.save();
    ctx.translate(f * 17, 0);
    ctx.scale(f * Math.max(0.02, squash), 1);
    ink(2);
    ctx.fillStyle = teamOfShip(sh).color;
    ctx.beginPath();
    ctx.moveTo(-8, -7);
    ctx.lineTo(9, 0);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (turning || hold > 0) {
      const frac = turning ? sh.pose.turn : hold / T.HOLD;
      ctx.fillStyle = '#3b2a1d';
      ctx.fillRect(-32, 10, 64, 4);
      ctx.fillStyle = turning ? '#ffd23f' : '#ff8c1a';
      ctx.fillRect(-32, 10, 64 * Math.min(1, frac), 4);
    }
    ctx.restore();
  };

  // One ship's panel at (x, y), w wide, on the 1600x900 stage.
  const panel = (sh, x, y, w, h) => {
    const st = sh.ctx;
    const body = sh.state;
    const T = teamOfShip(sh);
    const L = LB();
    book.paper(x, y, w, h, { r: 10, pins: false });
    ctx.fillStyle = T.color; // the team's colour band down the outer edge
    ctx.fillRect(x + 9, y + 11, 7, h - 22);
    ink(2);
    ctx.strokeRect(x + 9, y + 11, 7, h - 22);
    const tx = x + 26;
    const bx = tx + 40;
    const bw = x + w - 14 - bx;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = L.INK;
    ctx.font = '17px ' + config.FONTS.DISPLAY;
    ctx.fillText(String(sh.name || sh.id).toUpperCase(), tx, y + 27, w - 112);
    if (sh.team) {
      ctx.font = '700 10px ' + config.FONTS.TEXT;
      ctx.fillStyle = L.INK_SOFT;
      ctx.fillText(sh.team.name + ' CREW', tx, y + 39, w - 112);
    }
    bow(sh, x + w - 50, y + 26);
    const label = (text, ly) => {
      ctx.font = '700 11px ' + config.FONTS.TEXT;
      ctx.textAlign = 'left';
      ctx.fillStyle = L.INK;
      ctx.fillText(text, tx, ly);
    };
    // hull
    const hull = clamp(body.hull, 0, 100);
    label('Hull', y + 59);
    gauge(bx, y + 49, bw, 12, hull / 100, hull > 35 ? '#4caf50' : '#e63946');
    // steam (or, for a ship with no boiler, the wind that carries her)
    const steamed = !st.rig || st.rig.boiler;
    const p = body.press;
    if (steamed) {
      label('Steam', y + 76);
      gauge(bx, y + 66, bw, 9, p / 100, p >= config.BOILER.WARN_AT ? '#e63946' : p >= config.BOILER.OVERDRIVE_AT ? '#ffd23f' : '#e8eef2');
    } else {
      label('Wind', y + 76);
      gauge(bx, y + 66, bw, 9, windSpeed(st), '#9fd0e8');
    }
    // gas, with the neutral mark
    const GS = config.GAS;
    const gas = body.gas;
    label('Gas', y + 93);
    gauge(bx, y + 83, bw, 9, gas / 100, gas > GS.NEUTRAL + 5 ? '#f2c53d' : gas < GS.NEUTRAL - 5 ? '#5a96e6' : '#a8d8a0', GS.NEUTRAL / 100);
    // trim: a needle on a short seesaw (balance.js: bal.dx is the centre of mass against the middle of her lift)
    const bal = st.balance;
    if (bal) {
      const B = config.BALANCE;
      const k = clamp(bal.dx / B.FAIL_PX, -1, 1);
      const bad = Math.abs(bal.dx) > B.FAIL_PX ? '#c0392b' : Math.abs(bal.dx) > B.WARN_PX ? '#d89a1a' : '#5b9a4a';
      const sx = bx, sw = Math.min(70, bw * 0.5), sy = y + 105;
      ctx.fillStyle = '#3b2a1d';
      ctx.fillRect(sx, sy - 2, sw, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + sw / 2 - 1, sy - 5, 2, 10);
      ctx.fillStyle = bad;
      ctx.beginPath();
      ctx.arc(sx + sw / 2 + (sw / 2) * k, sy, 4, 0, 7);
      ctx.fill();
      ctx.font = '700 10px ' + config.FONTS.TEXT;
      ctx.fillStyle = L.INK;
      ctx.fillText('Trim', tx, sy + 3);
      ctx.fillStyle = bad;
      ctx.fillText(Math.abs(bal.deg) < 0.05 ? 'level' : (bal.deg > 0 ? 'nose ' : 'tail ') + Math.abs(bal.deg).toFixed(1) + '°', sx + sw + 8, sy + 3);
    }
    if (st.wreck || body.down > 0) { // breaking up: the red stamp over the panel
      ctx.save();
      ctx.globalAlpha = 0.9;
      book.stamp(st.wreck && st.wreck.t > 0 ? 'BREAKING UP' : 'DOWN', x + w / 2, y + h / 2 + 8, { size: 20, maxW: w - 30 });
      ctx.restore();
    }
  };

  // The row of panels, one per ship, centred between the big panel (left) and the minimap (right). Call with the 1600x900 stage transform set.
  const drawPanels = (world) => {
    try {
      const F = config.FLEET.PANEL;
      const ships = world.ships.filter((s) => !s.ai); // (the enemy gunship has her pennant on her mast, not a panel)
      const n = ships.length;
      const room = 760;
      const w = Math.min(F.W, (room - (n - 1) * F.GAP) / n);
      const total = n * w + (n - 1) * F.GAP;
      const x0 = F.CENTER - total / 2;
      ctx.save();
      for (let i = 0; i < n; i++) panel(ships[i], x0 + i * (w + F.GAP), F.Y, w, F.H);
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  // The team's flag on top of each teamed ship's mast, in the world (the camera's world transform is set up by pvpArt.drawWorld itself).
  const drawPennants = (world, view, w, h, time) => {
    const list = world.ships.filter((s) => s.team && !s.ai).map((s) => ({ bounds: s.layout.bounds, alt: -s.pose.y, offset: { dx: s.pose.x, dy: 0 }, team: s.team.id, name: s.name }));
    if (list.length) pvp.drawWorld(list, view, w, h, time);
  };

  // Arrows at the screen edge for ships that are off screen. Call on the screen (no world transform) with view = { cx, cy, zoom } in screen units and w, h the screen size;
  // `clipped` (the camera could not fit every ship) makes them pulse.
  const drawEdgeArrows = (world, view, w, h, clipped, time) => {
    try {
      const pad = config.FLEET.ARROW_PAD;
      ctx.save();
      for (const sh of world.ships) {
        if (sh.ai) continue;
        const b = sh.layout.bounds;
        const wx = sh.pose.x + pivotOf(sh);
        const wy = sh.pose.y + (b.y0 + b.y1) / 2;
        const sx = w / 2 + (wx - view.cx) * view.zoom;
        const sy = h / 2 + (wy - view.cy) * view.zoom;
        if (sx > pad && sx < w - pad && sy > pad && sy < h - pad) continue;
        const ax = clamp(sx, pad, w - pad);
        const ay = clamp(sy, pad, h - pad);
        const ang = Math.atan2(sy - h / 2, sx - w / 2);
        const T = teamOfShip(sh);
        ctx.save();
        ctx.translate(ax, ay);
        ctx.globalAlpha = clipped ? 0.65 + 0.35 * Math.sin(time * 6) : 1;
        ctx.save();
        ctx.rotate(ang);
        ink(3);
        ctx.fillStyle = T.color;
        ctx.beginPath();
        ctx.moveTo(22, 0);
        ctx.lineTo(-14, -18);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-14, 18);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        ctx.font = '700 14px ' + config.FONTS.TEXT;
        ctx.textAlign = Math.cos(ang) > 0.3 ? 'right' : Math.cos(ang) < -0.3 ? 'left' : 'center';
        const ty = Math.sin(ang) > 0.5 ? -30 : Math.sin(ang) < -0.5 ? 40 : 5;
        const tx = Math.cos(ang) > 0.3 ? -30 : Math.cos(ang) < -0.3 ? 30 : 0;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff';
        ctx.strokeText(String(sh.name || sh.id), tx, ty);
        ctx.fillStyle = config.INK;
        ctx.fillText(String(sh.name || sh.id), tx, ty);
        if (world.match && world.match.on) { // Versus: how far away she is, in metres, under her name
          const o = world.ships.find((q) => q !== sh && !q.ai);
          if (o) {
            const d = Math.hypot(o.pose.x + pivotOf(o) - wx, o.pose.y + (o.layout.bounds.y0 + o.layout.bounds.y1) / 2 - wy);
            const word = metres(d) + ' m', yy = ty + (ty < 0 ? -20 : 20);
            ctx.font = '700 18px ' + config.FONTS.TEXT;
            ctx.strokeText(word, tx, yy);
            ctx.fillText(word, tx, yy);
          }
        }
        ctx.restore();
      }
      ctx.restore();
    } catch (e) { try { ctx.restore(); } catch (e2) { /* ignore */ } }
  };

  return { drawPanels, drawPennants, drawEdgeArrows, panel };
}
