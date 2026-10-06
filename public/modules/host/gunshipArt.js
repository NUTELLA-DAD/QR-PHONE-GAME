// Drawing for an enemy gunship alongside (ship coordinates - drawn inside the ship's transform),
// its crew, the rope bridge from our bow, and the charge ticking on its boiler.
import { GS } from './gunship.js';

export function createGunshipArt({ ctx, state, ink }) {
  return (time) => {
    const g = state.gunship;
    if (!g) return;
    const o = g.offset + (g.phase === 'sinking' ? 0 : 0);
    const sink = g.phase === 'sinking' ? g.sink * g.sink * 120 : 0;
    const x0 = GS.x0 + o;
    const x1 = GS.x1 + o;
    const y = GS.deckY + sink;
    const cx = (x0 + x1) / 2;
    ctx.save();
    if (sink) {
      ctx.translate(cx, y);
      ctx.rotate(g.sink * 0.15);
      ctx.translate(-cx, -y);
    }
    // Rope bridge from our bow (sagging, with planks).
    if (g.rope) {
      const ax = 1470;
      const bx = x0;
      ink();
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(ax, y - 4);
      ctx.quadraticCurveTo((ax + bx) / 2, y + 60, bx, y - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ax, y - 70);
      ctx.quadraticCurveTo((ax + bx) / 2, y - 20, bx, y - 70);
      ctx.stroke();
      ctx.fillStyle = '#8a6a44';
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        const px = ax + (bx - ax) * t;
        const py = y - 4 + 4 * 60 * t * (1 - t) * 0.5;
        ctx.fillRect(px - 10, py - 4, 20, 10);
        ctx.strokeRect(px - 10, py - 4, 20, 10);
      }
    }
    // Gasbag.
    ink();
    ctx.lineWidth = 6;
    ctx.fillStyle = g.hit > 0 ? '#ffffff' : '#3d2b4f';
    ctx.beginPath();
    ctx.ellipse(cx, 380, 660, 160, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 5;
    for (let k = -4; k <= 4; k++) {
      ctx.beginPath();
      ctx.ellipse(cx, 380, Math.abs(k) * 150 + 10, 160, 0, k < 0 ? Math.PI / 2 : -Math.PI / 2, k < 0 ? Math.PI * 1.5 : Math.PI / 2);
      ctx.stroke();
    }
    // Horns emblem.
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.arc(cx, 380, 60, 0, 7);
    ctx.fill();
    ctx.fillStyle = '#1b1410';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 22, 410);
      ctx.quadraticCurveTo(cx + s * 40, 350, cx + s * 10, 340);
      ctx.quadraticCurveTo(cx + s * 18, 375, cx + s * 6, 405);
      ctx.fill();
    }
    // Rigging.
    ink();
    ctx.lineWidth = 3;
    for (let k = 0; k < 5; k++) {
      const rx = x0 + 100 + k * ((x1 - x0 - 200) / 4);
      ctx.beginPath();
      ctx.moveTo(rx, 520);
      ctx.lineTo(rx + 20, y - 80);
      ctx.stroke();
    }
    // Hull.
    ctx.lineWidth = 6;
    ctx.fillStyle = g.hit > 0 ? '#ffffff' : '#4a2626';
    ctx.beginPath();
    ctx.moveTo(x0 - 60, y - 80);
    ctx.lineTo(x1 + 90, y - 80);
    ctx.lineTo(x1 + 40, y + 110);
    ctx.lineTo(x0, y + 120);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1616';
    ctx.fillRect(x0 - 20, y - 6, x1 - x0 + 70, 16); // deck
    ctx.strokeRect(x0 - 20, y - 6, x1 - x0 + 70, 16);
    // Gun ports facing us, glowing before a broadside.
    for (let k = 0; k < 3; k++) {
      const py = y - 80 + 40 + k * 70 - 0;
      const glow = g.warnFire ? 0.5 + 0.5 * Math.sin(time * 30) : 0;
      ctx.fillStyle = glow ? `rgba(255,${80 + 100 * (1 - glow)},60,1)` : '#1b1410';
      ctx.beginPath();
      ctx.arc(x0 - 30, py, 16, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x0 - 90, py - 8, 60, 16);
      ctx.strokeRect(x0 - 90, py - 8, 60, 16);
    }
    // Boiler (the target) with the charge.
    const bx = GS.boilerX + o;
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(bx - 50, y - 110, 100, 104);
    ctx.strokeRect(bx - 50, y - 110, 100, 104);
    ctx.fillStyle = `rgba(255,120,40,${0.6 + 0.3 * Math.sin(time * 6)})`;
    ctx.beginPath();
    ctx.arc(bx, y - 50, 22, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (g.charge) {
      const blink = Math.sin(time * (8 + (10 - g.charge.t) * 3)) > 0;
      ctx.fillStyle = blink ? '#ff2e55' : '#ffd23f';
      ctx.beginPath();
      ctx.arc(bx + 40, y - 120, 22, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px Georgia';
      ctx.textAlign = 'center';
      ctx.fillText(Math.ceil(g.charge.t), bx + 40, y - 150);
    } else if (g.rope) {
      // A big arrow so boarders know where to go.
      ctx.fillStyle = `rgba(255,210,63,${0.6 + 0.4 * Math.sin(time * 6)})`;
      ctx.beginPath();
      ctx.moveTo(bx, y - 130);
      ctx.lineTo(bx - 30, y - 190);
      ctx.lineTo(bx + 30, y - 190);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // Crew: red horned raiders; they flash white while winding up a swing.
    for (const c of g.crew) {
      const px = c.x + o;
      ctx.fillStyle = c.wind > 0 ? '#ffffff' : '#c0392b';
      ctx.beginPath();
      ctx.roundRect(px - 18, y - 70, 36, 64, 12);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, y - 88, 20, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f1e2b8';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(px + s * 8, y - 102);
        ctx.lineTo(px + s * 16, y - 124);
        ctx.lineTo(px + s * 18, y - 98);
        ctx.fill();
      }
      ctx.strokeStyle = '#5a3b26';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(px + c.face * 18, y - 40);
      ctx.lineTo(px + c.face * (c.wind > 0 ? 10 : 60), y - (c.wind > 0 ? 120 : 70));
      ctx.stroke();
      ink();
      ctx.lineWidth = 6;
      for (let k = 0; k < c.hp; k++) {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(px - 18 + k * 13, y - 140, 9, 9);
      }
    }
    // Health bar over the gasbag.
    if (g.phase !== 'sinking') {
      ctx.fillStyle = '#1b1410';
      ctx.fillRect(cx - 200, 190, 400, 22);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(cx - 196, 194, 392 * Math.max(0, g.hp / g.max), 14);
    }
    ctx.restore();
  };
}
