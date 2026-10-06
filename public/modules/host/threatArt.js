// Drawing for outside threats (cargo plane, mines, wrecks), sapper bombs, and the lookout's
// off-screen arrows. Placeholder vector art until Phase 3. Ember Pact = fictional enemy faction.
import { config } from '../../config.js';
import { drawBiplane } from './planeArt.js';
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
    ctx.fillStyle = '#a8443f';
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
          ctx.fillStyle = '#a8443f';
          ctx.fillRect(c.x - c.hp * 6 + i * 12, c.y - 80, 9, 9);
        }
        continue;
      }
      ink();
      ctx.lineWidth = 3;
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
        ctx.fillStyle = '#a8443f';
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
      ctx.lineWidth = 2.8;
      // Spikes.
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + time * 0.3;
        ctx.beginPath();
        ctx.moveTo(m.x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
        ctx.lineTo(m.x + Math.cos(a) * (r + 12), y + Math.sin(a) * (r + 12));
        ctx.stroke();
      }
      ctx.fillStyle = '#4a4346';
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
      if (w.kind === 'biplane' || w.kind === 'escort') {
        if (Math.cos(w.spin) < 0) ctx.scale(1, -1);
        ctx.scale(1.3, 1.3);
        if (w.kind === 'escort') biplane(0, '#5f7a52', '#b89a5a', true, '#a8443f');
        else biplane(0, '#7d766a', '#7a3433', true);
        ctx.restore();
        continue;
      }
      if (sprites.plane(ctx, w.kind === 'cargo' ? 'cargo' : 'fighter', 0, 'wreck')) {
        ctx.restore();
        continue;
      }
      ink();
      ctx.lineWidth = 2.8;
      ctx.fillStyle = '#3a2a22';
      const big = w.kind === 'cargo' ? 2.2 : 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, 46 * big, 15 * big, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e8884a';
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
      ctx.lineWidth = 2.8;
      if (!sprites.box(ctx, 'fx/bomb', b.x - 24, y - 38, 48, 60)) {
        ctx.fillStyle = '#2b2622';
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
      ctx.fillStyle = Math.sin(time * 20) > 0 ? '#f2d36b' : '#e8884a';
      ctx.beginPath();
      ctx.arc(b.x + 14, y - 46, 6, 0, 7);
      ctx.fill();
      // Countdown.
      ctx.font = '900 30px Georgia';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = '#fff';
      const secs = Math.ceil(b.t);
      ctx.strokeText(secs, b.x, y - 56);
      ctx.fillStyle = secs <= 3 ? '#a8443f' : INK;
      ctx.fillText(secs, b.x, y - 56);
      if (b.prog > 0) {
        ctx.fillStyle = '#3b2a1d';
        ctx.fillRect(b.x - 24, y + 28, 48, 8);
        ctx.fillStyle = '#9cc99a';
        ctx.fillRect(b.x - 24, y + 28, 48 * Math.min(1, b.prog), 8);
      }
    }
  };

  // Lookout on duty: arrows at the screen edge pointing at threats out of view.
  // Arrows at the screen edge pointing at threats out of view. Everyone gets them for nearby
  // threats; with someone on Lookout they reach much farther and carry labels.
  const drawLookoutArrows = (width, height, view) => {
    const items = [];
    for (const c of state.cargo || []) items.push({ x: c.x, y: c.y, icon: '✈', color: '#9c5a2b', label: 'CARGO' });
    for (const m of state.mines || []) items.push({ x: m.x, y: m.y, icon: '✹', color: '#4a4346', label: 'MINE' });
    if (state.enemy.dead <= 0) items.push({ x: state.enemy.x, y: state.enemy.y, icon: '✈', color: '#8c2f2f', label: 'FIGHTER' });
    for (const p of state.bombers || []) items.push({ x: p.x, y: p.y, color: '#3d3a40', label: 'BOMBER' });
    if ((state.strafers || []).length) items.push({ x: state.strafers[0].x, y: state.strafers[0].y, color: '#26221f', label: 'SQUADRON' });
    if (state.boss) items.push({ x: state.boss.x, y: state.boss.y, color: '#5c1e1e', label: 'BOSS' });
    const bat = (state.bats || []).find((b) => b.delay <= 0);
    if (bat) items.push({ x: bat.x, y: bat.y, color: '#3b2c4c', label: 'BATS' });
    const SP = state.specials;
    if (SP) {
      for (const z of SP.snipers) items.push({ x: z.x, y: z.y, color: '#a8443f', label: 'SNIPER' });
      for (const g of SP.tugs) items.push({ x: g.x, y: g.y, color: '#7a4a2a', label: 'HARPOON' });
      if (SP.saws.length) items.push({ x: SP.saws[0].x, y: SP.saws[0].y, color: '#4a4f63', label: 'SAWS' });
      const imp = SP.imps.find((b) => b.delay <= 0);
      if (imp) items.push({ x: imp.x, y: imp.y, color: '#a8443f', label: 'IMPS' });
    }
    const margin = 46;
    const range = state.lookout ? 9000 : 3600;
    const shipY = 470 - state.ship.alt;
    for (const it of items) {
      if (Math.hypot(it.x - 800, it.y - shipY) > range) continue;
      const sx = width / 2 + (it.x - view.cx) * view.zoom;
      const sy = height / 2 + (it.y - view.cy) * view.zoom;
      if (sx > 0 && sx < width && sy > 0 && sy < height) continue;
      const ax = Math.max(margin, Math.min(width - margin, sx));
      const ay = Math.max(height * 0.2, Math.min(height - margin * 2, sy)); // (clear of the HUD at the top and the message bar)
      const ang = Math.atan2(sy - ay, sx - ax);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = '#ebdfc0';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.8;
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
      if (state.lookout) {
        ctx.font = '900 13px Georgia';
        ctx.textAlign = 'center';
        ctx.fillStyle = it.color;
        ctx.fillText(it.label, ax, ay + 5);
      } else {
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(ax, ay, 9, 0, 7);
        ctx.fill();
      }
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
        ctx.lineWidth = 3;
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
          ctx.fillStyle = '#2b2622';
          ctx.fillRect(ex + 22, 14 - spin, 4, spin * 2);
        }
        // Open bomb bay.
        ctx.fillStyle = '#2b2622';
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
      ctx.lineWidth = 3.2;
      // Fins, then a dark banded envelope.
      ctx.fillStyle = z.fin || '#5c1e1e';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-260, s * 40);
        ctx.lineTo(-380, s * 150);
        ctx.lineTo(-360, s * 30);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = z.hit > 0 ? '#ffffff' : z.body || '#3a3036';
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
        // Live turrets are red with a barrel; shot-off ones are blackened stumps.
        ctx.fillStyle = g.dead ? '#2a2a2a' : '#a8443f';
        ctx.beginPath();
        ctx.arc(-g.dx, 168, g.dead ? 12 : 16, 0, 7);
        ctx.fill();
        ctx.stroke();
        if (!g.dead) {
          ctx.fillStyle = '#5a5558';
          ctx.fillRect(-g.dx - 5, 172, 10, 34);
          ctx.strokeRect(-g.dx - 5, 172, 10, 34);
        }
      }
      ctx.fillStyle = '#f2d36b';
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

  const biplane = (time, body, trim, wreck, pilot) => drawBiplane(ctx, time, body, trim, wreck, pilot);

  // Contrails: thin white lines behind planes, brightest where they turned hard.
  const drawTrail = (t) => {
    if (!t || t.length < 2) return;
    ctx.lineCap = 'round';
    for (let i = 1; i < t.length; i++) {
      const a = Math.max(0, t[i].a) * (i / t.length) * 0.7;
      if (a < 0.03) continue;
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.lineWidth = 3 + 3 * (i / t.length);
      ctx.beginPath();
      ctx.moveTo(t[i - 1].x, t[i - 1].y);
      ctx.lineTo(t[i].x, t[i].y);
      ctx.stroke();
    }
  };

  // Pilots who bailed out, drifting down under parachutes.
  const drawChutes = (time) => {
    for (const c of state.chutes || []) {
      const open = Math.min(1, c.t / 0.6);
      const sway = Math.sin(time * 2 + c.x * 0.01) * 0.15 * open;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(sway);
      ctx.strokeStyle = '#2b2622';
      ctx.lineWidth = 2;
      if (open > 0.2) {
        ctx.fillStyle = '#eee6d2';
        ctx.beginPath();
        ctx.ellipse(0, -70, 46 * open, 34 * open, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        for (const k of [-1, -0.4, 0.4, 1]) {
          ctx.moveTo(k * 44 * open, -70);
          ctx.lineTo(0, -12);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#efe9dc';
      ctx.beginPath();
      ctx.arc(0, -10, 6, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6b6a5e';
      ctx.fillRect(-5, -4, 10, 16);
      ctx.strokeRect(-5, -4, 10, 16);
      ctx.restore();
    }
  };

  // Dogfighters (skeleton biplanes), with every plane's contrail and the parachutes.
  const drawStrafers = (time) => {
    if (state.enemy && !(state.enemy.dead > 0) && state.phase !== 'lobby') drawTrail(state.enemy.trail);
    for (const p of state.strafers || []) drawTrail(p.trail);
    const esc = state.escort;
    if (esc && esc.flying) {
      drawTrail(esc.trail);
      // Our escort fighter: green and cream, so she never looks like an enemy.
      ctx.save();
      ctx.translate(esc.x, esc.y);
      ctx.rotate(esc.heading);
      if (Math.cos(esc.heading) < 0) ctx.scale(1, -1);
      ctx.scale(1.45, 1.45 * (1 - 0.45 * Math.min(1, Math.abs(esc.bank) || 0))); // banking squashes her
      biplane(time, '#8fb37a', '#e8d8a8', false, '#a8443f');
      ctx.restore();
    }
    drawChutes(time);
    for (const p of state.strafers || []) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.heading || 0);
      if (Math.cos(p.heading || 0) < 0) ctx.scale(1, -1); // keep the wheels down
      ctx.scale(1.3, 1.3 * (1 - 0.45 * Math.min(1, Math.abs(p.bank) || 0))); // banking squashes her
      biplane(time, '#b9b1a0', '#b0413e');
      ctx.restore();
    }
  };

  // Homing rockets from the ground batteries.
  const drawRockets = () => {
    for (const k of state.rockets || []) {
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.rotate(k.ang);
      ink();
      ctx.lineWidth = 3;
      ctx.fillStyle = '#a8443f';
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(10, -7);
      ctx.lineTo(-16, -7);
      ctx.lineTo(-16, 7);
      ctx.lineTo(10, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#5a5558';
      ctx.beginPath();
      ctx.moveTo(-16, -7);
      ctx.lineTo(-24, -14);
      ctx.lineTo(-24, 14);
      ctx.lineTo(-16, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f2d36b';
      ctx.beginPath();
      ctx.arc(-28, 0, 6 + Math.random() * 3, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  };

  // Small health bar.
  const drawHp = (x, y, hp, max, w) => {
    ctx.fillStyle = '#3b2a1d';
    ctx.fillRect(x - w / 2, y, w, 8);
    ctx.fillStyle = '#a8443f';
    ctx.fillRect(x - w / 2, y, (w * Math.max(0, hp)) / max, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y, w, 8);
  };

  return { drawCargo, drawMines, drawWrecks, drawBombs, drawLookoutArrows, drawBats, drawBombers, drawBoss, drawStrafers, drawRockets };
}
