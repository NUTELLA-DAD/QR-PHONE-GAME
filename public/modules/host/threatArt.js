// Drawing for outside threats (cargo plane, mines, wrecks), sapper bombs, and the lookout's
// off-screen arrows. Placeholder vector art until Phase 3. Ember Pact = fictional enemy faction.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const INK = config.INK;
const P = SHIP_LAYOUT.platforms;

export function createThreatArt({ ctx, state, ink, sprites }) {
  // Ember Pact insignia: a flame inside a triangle.
  const insignia = (x, y, s) => {
    if (sprites.box(ctx, 'crests/monsters', x - 16 * s, y - 16 * s, 32 * s, 32 * s)) return;
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
      if (sprites.plane(ctx, 'cargo', time)) {
        // Side door swings open as it nears the drop point.
        const R = { door: { x: -60, y: 0 }, ...sprites.rigFor('planes/cargo') };
        if (!c.dropped && Math.abs(c.x - c.dropX) < 700) sprites.pivot(ctx, 'planes/cargo/door_open', R.door.x, R.door.y, 0.5, 0.5);
        ctx.restore();
        for (let i = 0; i < c.hp; i++) {
          ctx.fillStyle = '#e63946';
          ctx.fillRect(c.x - c.hp * 6 + i * 12, c.y - 80, 9, 9);
        }
        continue;
      }
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
      // Mine art includes its balloon: the mine ball sits in the lower part of the picture.
      if (sprites.box(ctx, 'fx/mine', m.x - 50, y - 110, 100, 160)) continue;
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
      if (sprites.plane(ctx, w.kind === 'cargo' ? 'cargo' : 'fighter', 0, 'wreck')) {
        ctx.restore();
        continue;
      }
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
      if (!sprites.box(ctx, 'fx/bomb', b.x - 24, y - 38, 48, 60)) {
        ctx.fillStyle = '#1b1410';
        ctx.beginPath();
        ctx.arc(b.x, y, 22, 0, 7);
        ctx.fill();
        ctx.stroke();
        // Fuse.
        ctx.strokeStyle = '#7a4a24';
        ctx.beginPath();
        ctx.moveTo(b.x + 10, y - 18);
        ctx.quadraticCurveTo(b.x + 22, y - 36, b.x + 14, y - 44);
        ctx.stroke();
      }
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
    for (const p of state.bombers || []) items.push({ x: p.x, y: p.y, color: '#3d3a40', label: 'BOMBER' });
    if (state.boss) items.push({ x: state.boss.x, y: state.boss.y, color: '#5c1e1e', label: 'BOSS' });
    const bat = (state.bats || []).find((b) => b.delay <= 0);
    if (bat) items.push({ x: bat.x, y: bat.y, color: '#3b2c4c', label: 'BATS' });
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

  // ---- Wave enemies ----
  const drawBats = (time) => {
    for (const b of state.bats || []) {
      if (b.delay > 0) continue;
      const flap = Math.sin(b.phase * 1.4);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.scale(b.vx < 0 ? -1.7 : 1.7, 1.7); // drawn big enough to read on a TV
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#3b2c4c';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(side * 14, -18 * flap - 6, side * 30, -10 * flap);
        ctx.lineTo(side * 24, 2);
        ctx.lineTo(side * 16, -2);
        ctx.lineTo(side * 10, 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(0, 2, 9, 11, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(4, -1, 2.5, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  };

  const drawBombers = (time) => {
    for (const p of state.bombers || []) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.vx < 0) ctx.scale(-1, 1);
      if (!sprites.plane(ctx, 'bomber', time)) {
        ink();
        ctx.lineWidth = 5;
        ctx.fillStyle = p.hit > 0 ? '#ffffff' : '#3d3a40';
        // Twin tails, long body, big wing with two engines.
        ctx.beginPath();
        ctx.moveTo(-150, -8);
        ctx.lineTo(-175, -46);
        ctx.lineTo(-140, -44);
        ctx.lineTo(-115, -10);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(-160, -24, 300, 50, 24);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#7ad0e0';
        ctx.beginPath();
        ctx.roundRect(100, -18, 30, 16, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2a272d';
        ctx.beginPath();
        ctx.roundRect(-70, -4, 150, 16, 6);
        ctx.fill();
        ctx.stroke();
        for (const ex of [-40, 50]) {
          ctx.fillStyle = '#555';
          ctx.beginPath();
          ctx.ellipse(ex, 14, 22, 11, 0, 0, 7);
          ctx.fill();
          ctx.stroke();
          const spin = Math.abs(Math.sin(time * 30)) * 26 + 4;
          ctx.fillStyle = '#1b1410';
          ctx.fillRect(ex + 22, 14 - spin, 4, spin * 2);
        }
        // Open bomb bay.
        ctx.fillStyle = '#1b1410';
        ctx.fillRect(-30, 20, 50, 8);
        insignia(-120, 0, 1);
      }
      ctx.restore();
      drawHp(p.x, p.y - 60, p.hp, p.maxHp, 140);
    }
    for (const b of state.enemyBombs || []) {
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#2a272d';
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 8, 14, Math.atan2(b.vy, b.vx) - Math.PI / 2, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  };

  const drawBoss = (time) => {
    const z = state.boss;
    if (!z) return;
    ctx.save();
    ctx.translate(z.x, z.y);
    ctx.scale(-1, 1); // faces the player's ship (left)
    if (!sprites.plane(ctx, 'boss', time)) {
      ink();
      ctx.lineWidth = 6;
      // Fins, then a dark banded envelope.
      ctx.fillStyle = '#5c1e1e';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-260, s * 40);
        ctx.lineTo(-380, s * 150);
        ctx.lineTo(-360, s * 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = z.hit > 0 ? '#ffffff' : '#3a3036';
      ctx.beginPath();
      ctx.ellipse(0, 0, 330, 115, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, Math.abs(i) * 50 + 4, 115, 0, -1.57, 1.57);
        ctx.stroke();
      }
      ink();
      // Gondola with three turrets.
      ctx.fillStyle = '#2a2226';
      ctx.beginPath();
      ctx.roundRect(-220, 100, 440, 70, 18);
      ctx.fill();
      ctx.stroke();
      for (const g of z.guns) {
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(-g.dx, 168, 16, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#ffd23f';
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        ctx.arc(k * 70, 135, 8, 0, 7);
        ctx.fill();
      }
      ctx.restore();
      ctx.save();
      ctx.translate(z.x, z.y);
      insignia(0, -10, 3.2);
    }
    ctx.restore();
  };

  // Small health bar.
  const drawHp = (x, y, hp, max, w) => {
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(x - w / 2, y, w, 8);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(x - w / 2, y, (w * Math.max(0, hp)) / max, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y, w, 8);
  };

  return { drawCargo, drawMines, drawWrecks, drawBombs, drawLookoutArrows, drawBats, drawBombers, drawBoss };
}
