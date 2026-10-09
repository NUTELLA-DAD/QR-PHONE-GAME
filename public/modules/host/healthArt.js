// TV drawing for crew health (health.js): the little heart pips over a hurt crewman's head (not shown when he is whole, to keep the screen clean). Full, half and empty hearts;
// the last one pulses. Called from render.js drawPlayer with the spot over the name.
import { config } from '../../config.js';

export function createHealthArt({ ctx }) {
  const heart = (x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.95);
    ctx.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 0.85, y - s * 0.8, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.85, y - s * 0.8, x + s * 1.25, y + s * 0.1, x, y + s * 0.95);
    ctx.closePath();
  };

  // hp hearts out of max, centred on (x, y); time (s) drives the pulse on the last heart.
  const pips = (x, y, hp, max, time) => {
    const s = 8, gap = s * 2.5, left = x - ((max - 1) * gap) / 2;
    const low = hp > 0 && hp <= config.HEALTH.JOB_AT;
    ctx.save();
    ctx.lineJoin = 'round';
    for (let i = 0; i < max; i++) {
      const hx = left + i * gap;
      const k = low && i === 0 ? 1 + 0.18 * Math.sin(time * 9) : 1;
      const fill = Math.max(0, Math.min(1, hp - i));
      ctx.save();
      ctx.translate(hx, y);
      ctx.scale(k, k);
      heart(0, 0, s);
      ctx.fillStyle = '#4a3d38';
      ctx.fill();
      if (fill > 0) {
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#e63946';
        ctx.fillRect(-s * 1.4, -s, s * 2.8 * fill, s * 2.4); // (a half heart: only the left half is red)
        ctx.restore();
      }
      heart(0, 0, s);
      ctx.strokeStyle = config.INK;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  return { pips };
}
