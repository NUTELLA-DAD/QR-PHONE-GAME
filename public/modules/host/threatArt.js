// Drawing for outside threats (cargo plane, mines, wrecks), sapper bombs, and the lookout's
// off-screen arrows. Placeholder vector art until Phase 3. Ember Pact = fictional enemy faction.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const INK = config.INK;
const P = SHIP_LAYOUT.platforms;

export function createThreatArt({ ctx, state, ink }) {
  // Ember Pact insignia: a flame inside a triangle.
  const insignia = (x, y, s) => {
    ctx.fillStyle = '#f4c430';
    ctx.beginPath();
    ctx.moveTo(x, y - 14 * s);
    ctx.lineTo(x + 13 * s, y + 10 * s);
    ctx.lineTo(x - 13 * s, y + 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d62828';
    ctx.beginPath();
    ctx.moveTo(x, y - 6 * s);
    ctx.quadraticCurveTo(x + 7 * s, y + 4 * s, x, y + 7 * s);
    ctx.quadraticCurveTo(x - 7 * s, y + 4 * s, x, y - 6 * s);
    ctx.fill();
  };

  const drawCargo = (time) => {
    for (const c of state.cargo || []) {
      ctx.save();
      ctx.translate(c.x, c.y);
      if (c.vx < 0) ctx.scale(-1, 1);
      ink();
      ctx.lineWidth = 5;
      // Tail and fuselage.
      ctx.fillStyle = c.hit > 0 ? '#ffffff' : '#9c5a2b';
      ctx.beginPath();
      ctx.moveTo(-120, -10);
      ctx.lineTo(-150, -50);
      ctx.lineTo(-118, -48);
      ctx.lineTo(-95, -12);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-130, -26, 230, 54, 22);
      ctx.fill();
      ctx.stroke();
      // Cockpit glass and wing.
      ctx.fillStyle = '#7ad0e0';
      ctx.beginPath();
      ctx.roundRect(60, -20, 30, 18, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7a3f1d';
      ctx.beginPath();
      ctx.roundRect(-40, -6, 110, 16, 6);
      ctx.fill();
      ctx.stroke();
      // Twin engines with spinning props.
      for (const ex of [-10, 40]) {
        ctx.fillStyle = '#555';
        ctx.beginPath();
        ctx.ellipse(ex, 16, 20, 11, 0, 0, 7);
        ctx.fill();
        ctx.stroke();
        const spin = Math.abs(Math.sin(time * 30)) * 26 + 4;
        ctx.fillStyle = '#2b1d14';
        ctx.fillRect(ex + 20, 16 - spin, 4, spin * 2);
      }
      // Side door: open (raiders inside) until they've jumped.
      ctx.fillStyle = c.dropped ? '#3b2a1d' : '#5c3418';
      ctx.fillRect(-60, -14, 28, 34);
      ctx.strokeRect(-60, -14, 28, 34);
      insignia(-90, 2, 1);
      ctx.restore();
      // Health pips.
      for (let i = 0; i < c.hp; i++) {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(c.x - c.hp * 6 + i * 12, c.y - 64, 9, 9);
      }
    }
  };

  const drawMines = (time) => {
    const r = config.MINES.RADIUS;
    for (const m of state.mines || []) {
      const y = m.y + Math.sin(m.bob * 2) * 6;
      ink();
      ctx.lineWidth = 4;
      // Spikes.
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + time * 0.3;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
        ctx.lineTo(m.x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12));
        ctx.stroke();
      }
      ctx.fillStyle = '#3d3d3d';
      ctx.beginPath();
      ctx.arc(m.x, y, r, 0, 7);
      ctx.fill();
      ctx.stroke();
      // Blinking light.
      ctx.fillStyle = Math.sin(time * 8) > 0 ? '#ff3b30' : '#6b1b17';
      ctx.beginPath();
      ctx.arc(m.x, y - r * 0.4, 7, 0, 7);
      ctx.fill();
      // Little balloon holding it up.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.x, y - r);
      ctx.lineTo(m.x, y - r - 40);
      ctx.stroke();
      ctx.fillStyle = '#c9b48a';
      ctx.beginPath();
      ctx.ellipse(m.x, y - r - 58, 18, 22, 0, 0, 7);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  };

  const drawWrecks = () => {
    for (const w of state.wrecks || []) {
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.spin);
      ink();
      ctx.lineWidth = 4;
      ctx.fillStyle = '#3a2a22';
      const big = w.kind === 'cargo' ? 2.2 : 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 46 * big, 15 * big, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff7b00';
      ctx.beginPath();
      ctx.arc(-20 * big, 0, 10 * big, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  };

  // Sapper bombs (drawn in ship coordinates).
  const drawBombs = (time) => {
    for (const b of state.bombs || []) {
      const y = P[b.d].y - 22;
      ink();
      ctx.lineWidth = 4;
      ctx.fillStyle = '#1b1410';
      ctx.beginPath();
      ctx.arc(b.x, y, 22, 0, 7);
      ctx.fill();
      ctx.stroke();
      // Fizzing fuse.
      ctx.strokeStyle = '#7a4a24';
      ctx.beginPath();
      ctx.moveTo(b.x + 10, y - 18);
      ctx.quadraticCurveTo(b.x + 22, y - 36, b.x + 14, y - 44);
      ctx.stroke();
      ctx.fillStyle = Math.sin(time * 20) > 0 ? '#ffd23f' : '#ff5a1f';
      ctx.beginPath();
      ctx.arc(b.x + 14, y - 46, 6, 0, 7);
      ctx.fill();
      // Countdown.
      ctx.font = '900 30px Georgia';
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#fff';
      const secs = Math.ceil(b.t);
      ctx.strokeText(secs, b.x, y - 56);
      ctx.fillStyle = secs <= 3 ? '#e63946' : INK;
      ctx.fillText(secs, b.x, y - 56);
      if (b.prog > 0) {
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(b.x - 24, y + 28, 48, 8);
        ctx.fillStyle = '#8fe388';
        ctx.fillRect(b.x - 24, y + 28, 48 * Math.min(1, b.prog), 8);
      }
    }
  };

  // Lookout on duty: arrows at the screen edge pointing at threats out of view.
  const drawLookoutArrows = (width, height, view) => {
    if (!state.lookout) return;
    const items = [];
    for (const c of state.cargo || []) items.push({ x: c.x, y: c.y, icon: '✈', color: '#9c5a2b', label: 'CARGO' });
    for (const m of state.mines || []) items.push({ x: m.x, y: m.y, icon: '✹', color: '#3d3d3d', label: 'MINE' });
    if (state.enemy.dead <= 0) items.push({ x: state.enemy.x, y: state.enemy.y, icon: '✈', color: '#8c2f2f', label: 'FIGHTER' });
    const margin = 46;
    for (const it of items) {
      const sx = width / 2 + (it.x - view.cx) * view.zoom;
      const sy = height / 2 + (it.y - view.cy) * view.zoom;
      if (sx > 0 && sx < width && sy > 0 && sy < height) continue;
      const ax = Math.max(margin, Math.min(width - margin, sx));
      const ay = Math.max(margin, Math.min(height - margin, sy));
      const ang = Math.atan2(sy - ay, sx - ax);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = '#f1e2b8';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.rotate(ang);
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.moveTo(42, 0);
      ctx.lineTo(28, -12);
      ctx.lineTo(28, 12);
      ctx.fill();
      ctx.restore();
      ctx.font = '900 13px Georgia';
      ctx.textAlign = 'center';
      ctx.fillStyle = it.color;
      ctx.fillText(it.label, ax, ay + 5);
    }
  };

  return { drawCargo, drawMines, drawWrecks, drawBombs, drawLookoutArrows };
}
