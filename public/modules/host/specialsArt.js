// Drawing for the special enemies (see specials.js): gyro-saws, imps, the sniper zeppelin with
// its warning line and beam, and the harpoon tug with its cable. Bold shapes and bright accents
// so each reads at a glance from across the room.
import { config } from '../../config.js';
import { envOf } from './environments.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';

export function createSpecialsArt({ ctx, state, ink }) {
  const drawSaw = (s) => {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1.5, 1.5);
    ctx.rotate(s.spin);
    ink();
    ctx.lineWidth = 2.8;
    ctx.fillStyle = s.hit > 0 ? '#ffffff' : '#c9ced3';
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const r = k % 2 ? 26 : 38;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a4f63';
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(-s.spin);
    ctx.fillStyle = s.mode === 'dash' ? '#ff2e55' : '#f2d36b';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  const drawImp = (b) => {
    if (b.delay > 0) return;
    ctx.save();
    ctx.translate(b.x, b.y);
    ink();
    ctx.lineWidth = 3;
    const w = Math.sin(b.flap) * 8;
    const sd = state.course && envOf(state).imp; // 'spore drones' in the Fungal Depths
    ctx.fillStyle = sd ? sd.wing : '#5a1a1a';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 6, -2);
      ctx.lineTo(s * 26, -10 + w);
      ctx.lineTo(s * 18, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = sd ? sd.body : '#a8443f';
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ebdfc0';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * 5, -10);
      ctx.lineTo(s * 10, -22);
      ctx.lineTo(s * 11, -8);
      ctx.fill();
    }
    ctx.fillStyle = sd ? sd.eye : '#f2d36b';
    ctx.beginPath();
    ctx.arc(-4, -2, 3, 0, 7);
    ctx.arc(4, -2, 3, 0, 7);
    ctx.fill();
    ctx.restore();
  };

  const drawSniper = (z, time) => {
    // Warning line while charging (thin, tracking) and locked (thick, flashing).
    if (z.mode === 'charge' || z.mode === 'lock') {
      const lock = z.mode === 'lock';
      const k = lock ? 1 - z.t / config.SPECIALS.SNIPER_LOCK : 1 - z.t / config.SPECIALS.SNIPER_CHARGE;
      ctx.strokeStyle = lock ? (Math.sin(time * 40) > 0 ? 'rgba(255,255,255,.95)' : 'rgba(255,40,60,.95)') : `rgba(255,40,60,${0.3 + 0.4 * k})`;
      ctx.lineWidth = lock ? 14 : 4 + 6 * k;
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      ctx.lineTo(z.x + Math.cos(z.aim) * 4200, z.y + Math.sin(z.aim) * 4200);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(z.x, z.y);
    ink();
    ctx.lineWidth = 3.2;
    ctx.fillStyle = z.hit > 0 ? '#ffffff' : '#3d2b4f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 130, 50, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 2.8;
    for (const x of [-70, -20, 30, 80]) {
      ctx.beginPath();
      ctx.moveTo(x, -46);
      ctx.quadraticCurveTo(x + 10, 0, x, 46);
      ctx.stroke();
    }
    ink();
    ctx.fillStyle = '#2a1d36';
    ctx.fillRect(-50, 46, 100, 30);
    ctx.strokeRect(-50, 46, 100, 30);
    // The beam lens, glowing brighter as it charges.
    const glow = z.mode === 'lock' ? 1 : z.mode === 'charge' ? 0.6 : 0.2;
    ctx.fillStyle = `rgba(255,40,60,${0.4 + glow * 0.6})`;
    ctx.beginPath();
    ctx.arc(Math.cos(z.aim) * 60, 60 + Math.sin(z.aim) * 10, 14 + glow * 8, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const drawBeam = (b) => {
    const k = b.t / 0.35;
    const x1 = b.x + Math.cos(b.ang) * b.len;
    const y1 = b.y + Math.sin(b.ang) * b.len;
    ctx.lineCap = 'round';
    for (const [w, c] of [[70 * k + 10, `rgba(255,40,60,${0.4 * k})`], [24 * k + 4, `rgba(255,120,140,${0.8 * k})`], [8, `rgba(255,255,255,${k})`]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  };

  const drawTug = (g, time) => {
    // Cable to the hook (flashing red so the crew know to shoot it).
    if (g.mode === 'pull' && g.hook) {
      const hx = toWorldX(mainShip(state), g.hook.x); // (the hook is on the ship: ship coordinates)
      const hy = toWorldY(mainShip(state), g.hook.y);
      ctx.strokeStyle = '#2b2622';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.strokeStyle = Math.sin(time * 12) > 0 ? '#ff2e55' : '#f2d36b';
      ctx.lineWidth = 2.8;
      ctx.setLineDash([24, 18]);
      ctx.stroke();
      ctx.setLineDash([]);
      ink();
      ctx.fillStyle = '#9aa1a6';
      ctx.beginPath();
      ctx.arc(hx, hy, 12, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
    if (g.harpoon) {
      const h = g.harpoon;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(Math.atan2(h.vy, h.vx));
      ink();
      ctx.fillStyle = '#c9ced3';
      ctx.fillRect(-30, -3, 30, 6);
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(18, 0);
      ctx.lineTo(0, 10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(g.x, g.y);
    if (g.side > 0) ctx.scale(-1, 1);
    ink();
    ctx.lineWidth = 3;
    ctx.fillStyle = g.hit > 0 ? '#ffffff' : '#7a4a2a';
    ctx.beginPath();
    ctx.roundRect(-60, -24, 110, 48, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3a2a1d';
    ctx.fillRect(-70, -36, 24, 72);
    ctx.strokeRect(-70, -36, 24, 72);
    ctx.fillStyle = '#bcd9e3';
    ctx.beginPath();
    ctx.arc(20, -4, 11, 0, 7);
    ctx.fill();
    ctx.stroke();
    // Spinning prop.
    ctx.strokeStyle = 'rgba(30,20,15,.6)';
    ctx.lineWidth = 3.2;
    const p = Math.sin(time * 40) * 30;
    ctx.beginPath();
    ctx.moveTo(56, -p);
    ctx.lineTo(56, p);
    ctx.stroke();
    // Harpoon gun on top.
    ink();
    ctx.fillStyle = '#5a5558';
    ctx.fillRect(-20, -40, 50, 14);
    ctx.strokeRect(-20, -40, 50, 14);
    ctx.restore();
  };

  return (time) => {
    const S = state.specials;
    if (!S) return;
    for (const b of S.beams) drawBeam(b);
    for (const z of S.snipers) drawSniper(z, time);
    for (const g of S.tugs) drawTug(g, time);
    for (const s of S.saws) drawSaw(s);
    for (const b of S.imps) drawImp(b);
  };
}
