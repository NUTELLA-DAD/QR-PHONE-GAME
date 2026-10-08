// DEBRIS ART (Phase S.5i): the pieces of ship that broke off (debris.js) tumbling through the sky. Each piece is the ship's own picture as it was when the part left (shipArt.js snapshot,
// clipped to the hole it left), drawn where the piece is under its spin, mirrored if the ship faced left; a piece with no picture (the enemy gunship's, or a stub canvas) is drawn as
// ragged planks in the same ink. The last second fades. Smoke and embers are ordinary puffs made by debris.js.
import { config } from '../../config.js';

export function createDebrisArt({ ctx, state }) {
  const planks = (d) => {
    ctx.fillStyle = d.bag ? '#c9b99a' : '#9a7448';
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    for (const c of d.clips) {
      const x = c.x0 - d.cx, y = c.y0 - d.cy, w = c.x1 - c.x0, h = c.y1 - c.y0;
      if (d.bag) { ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); continue; }
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.1);
      ctx.lineTo(x + w * 0.3, y);
      ctx.lineTo(x + w * 0.6, y + h * 0.12);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w * 0.96, y + h * 0.85);
      ctx.lineTo(x + w * 0.5, y + h);
      ctx.lineTo(x, y + h * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  };

  return {
    draw() {
      for (const d of state.debris || []) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (d.life - d.t) / 1.2));
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.scale(d.f || 1, 1);
        if (d.pic && d.pic.canvas) {
          try { ctx.drawImage(d.pic.canvas, d.pic.x - d.cx, d.pic.y - d.cy, d.pic.w, d.pic.h); } catch (e) { planks(d); }
        } else planks(d);
        ctx.restore();
      }
    },
  };
}
