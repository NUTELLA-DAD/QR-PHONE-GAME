// TV drawing for the spotter (spotter.js) and primed shells (prime.js):
//  - SPOTTED targets: a bracket in the spotter's colour with "SPOTTED by Sam" (and an edge-of-screen arrow when off screen)
//  - the pulsing HELP! call-out over a crewmate who called
//  - the glow on a gun that is charging / primed
import { config } from '../../config.js';

const INK = '#1b1410';
// Rough size (px) of each thing, for the bracket drawn round it.
const SIZE = { mine: 44, fighter: 54, bomber: 110, plane: 50, boss: 240, gunship: 240, bat: 34, sniper: 90, tug: 60, saw: 56, imp: 30 };
const WHAT = { mine: 'MINE', fighter: 'FIGHTER', bomber: 'BOMBER', plane: 'PLANE', boss: 'BOSS', gunship: 'GUNSHIP', bat: 'BAT', sniper: 'SNIPER', tug: 'HARPOON', saw: 'SAW', imp: 'IMP' };

export function createSpotterArt({ ctx, state }) {
  const outlined = (text, x, y, color, font) => {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  // Screen-space (the same transform the lookout arrows use: world -> screen with view.cx/cy/zoom).
  const drawSpots = (width, height, view, time) => {
    for (const s of state.spots || []) {
      const who = state.players[s.by];
      const color = (who && who.color) || '#ffd23f';
      const name = who ? who.name : '';
      const at = s.item.pos();
      const sx = width / 2 + (at.x - view.cx) * view.zoom;
      const sy = height / 2 + (at.y - view.cy) * view.zoom;
      const left = Math.max(0, Math.min(1, s.obj.spotT / config.SPOT.TIME));
      const fade = Math.min(1, s.obj.spotT / 0.8); // fades out over the last moment
      ctx.save();
      ctx.globalAlpha = fade;
      if (sx > 0 && sx < width && sy > 0 && sy < height) {
        const half = Math.max(30, (SIZE[s.kind] || 50) * view.zoom * 0.62) + Math.sin(time * 9) * 2.5;
        const arm = Math.min(22, half * 0.45);
        for (const [pass, w, c] of [[0, 9, INK], [1, 5, color]]) {
          void pass;
          ctx.strokeStyle = c;
          ctx.lineWidth = w;
          ctx.lineCap = 'round';
          for (const [kx, ky] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            ctx.beginPath();
            ctx.moveTo(sx + kx * half, sy + ky * (half - arm));
            ctx.lineTo(sx + kx * half, sy + ky * half);
            ctx.lineTo(sx + kx * (half - arm), sy + ky * half);
            ctx.stroke();
          }
        }
        const ly = Math.max(26, sy - half - 12);
        outlined('SPOTTED by ' + name, sx, ly, color, '900 17px Georgia');
        ctx.fillStyle = INK;
        ctx.fillRect(sx - 31, ly + 6, 62, 7);
        ctx.fillStyle = color;
        ctx.fillRect(sx - 29, ly + 8, 58 * left, 3);
      } else {
        // Off screen: an arrow at the edge (kept clear of the lookout arrows) pointing at it.
        const margin = 100;
        const ax = Math.max(margin, Math.min(width - margin, sx));
        const ay = Math.max(height * 0.3, Math.min(height - margin * 1.6, sy)); // (below the minimap and its banner)
        const ang = Math.atan2(sy - ay, sx - ax);
        ctx.translate(ax, ay);
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, 7);
        ctx.fill();
        ctx.stroke();
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(24, -13);
        ctx.lineTo(24, 13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.rotate(-ang);
        outlined(WHAT[s.kind] || '', 0, 5, '#fff', '900 11px Georgia');
        outlined('SPOTTED by ' + name, 0, 40, color, '900 13px Georgia');
      }
      ctx.restore();
    }
  };

  // World-space, over the caller's head (px, y = the colour marker's position).
  const drawHelp = (p, px, y, time) => {
    const call = (state.helpCalls || []).find((c) => c.caller === p);
    if (!call) return;
    const fade = Math.min(1, call.t / 0.6);
    const age = config.HELP.SHOW - call.t;
    const pulse = 1 + 0.1 * Math.sin(time * 14);
    const by = y - 118 + Math.sin(time * 6) * 3;
    ctx.save();
    ctx.globalAlpha = fade;
    // ripples out from the caller
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 5;
    for (let k = 0; k < 2; k++) {
      const t = ((age * 1.4 + k * 0.5) % 1);
      ctx.globalAlpha = fade * (1 - t) * 0.8;
      ctx.beginPath();
      ctx.arc(px, y + 70, 30 + t * 110, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = fade;
    ctx.translate(px, by);
    ctx.scale(pulse, pulse);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(-62, -28, 124, 56, 18);
    ctx.moveTo(-12, 27);
    ctx.lineTo(0, 46);
    ctx.lineTo(12, 27);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.fillRect(-12, 24, 24, 6); // (hides the join between bubble and tail)
    outlined('HELP!', 0, 11, '#fff', '900 34px Georgia');
    ctx.restore();
  };

  // A gun that is charging (a ring filling up) or primed (a glowing barrel). Draw it in ship space, after the barrel.
  const drawGunGlow = (gun, time) => {
    const charge = gun.primed ? 1 : gun.prime || 0;
    if (charge <= 0.02 && !(gun.primedFlash > 0)) return;
    const ready = !!gun.primed;
    const pulse = ready ? 0.65 + 0.35 * Math.sin(time * 12) : 0.4 + charge * 0.5;
    ctx.save();
    ctx.translate(gun.bx, gun.by);
    // charge ring round the mount
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(27,20,16,.55)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = ready ? '#fff2b0' : '#ff9a2e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2);
    ctx.stroke();
    // glowing barrel
    ctx.rotate(gun.aim);
    ctx.globalAlpha = pulse * 0.55;
    ctx.strokeStyle = '#ff7b00';
    ctx.lineWidth = 22 + (ready ? 8 : 0);
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(66, 0);
    ctx.stroke();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = ready ? '#fff2b0' : '#ffb347';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(66, 0);
    ctx.stroke();
    if (ready) {
      ctx.globalAlpha = pulse * 0.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(70, 0, 20 + Math.sin(time * 12) * 4, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  };

  return { drawSpots, drawHelp, drawGunGlow };
}
