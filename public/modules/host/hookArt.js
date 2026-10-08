// Drawing for the hookshot rope and hook (WORLD coordinates since M.1: called outside the ship's frame; a player on a deck is converted with pose.js).
// Never throws: a drawing problem must not stop the game.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';

export function createHookArt({ ctx, state, ink }) {
  const rope = (p) => {
    const h = p.hook;
    const ship = mainShip(state);
    const o = p.fly ? { x: p.x, y: p.y - config.HOOKSHOT.HAND } : { x: toWorldX(ship, p.x), y: toWorldY(ship, p.y - config.HOOKSHOT.HAND - (p.jz || 0)) };
    if (h.phase === 'caught') return { from: o, to: { x: h.ax, y: h.ay }, caught: true };
    return { from: o, to: { x: o.x + h.dx * h.len, y: o.y + h.dy * h.len }, caught: false };
  };
  const drawRopes = () => {
    try {
      for (const p of Object.values(state.players)) {
        if (!p.hook || p.connected === false) continue;
        const r = rope(p);
        if (!r) continue;
        const { from, to, caught } = r;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // The rope: a thin dark line (a little slack when the hook is still flying).
        const sag = caught ? 0 : Math.min(14, len * 0.04);
        for (const [col, w] of [['#2b2118', 3], ['#b89968', 1.4]]) {
          ctx.strokeStyle = col;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(from.x, from.y);
          ctx.quadraticCurveTo((from.x + to.x) / 2, (from.y + to.y) / 2 + sag, to.x, to.y);
          ctx.stroke();
        }
        // The hook: a small iron grapple pointing along the rope.
        ctx.translate(to.x, to.y);
        ctx.rotate(Math.atan2(dy, dx));
        ink();
        ctx.lineWidth = 2.6;
        ctx.fillStyle = caught ? '#e8d8a8' : '#8a8f94';
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-4, -9);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    } catch (e) {
      /* drawing never throws */
    }
  };
  return { drawRopes };
}
