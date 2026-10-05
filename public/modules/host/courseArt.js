// Draws the course: rocky ground and mountains below, rock overhangs above, and ground turrets.
// Placeholder vector art (sprites: fx/turret, fx/turret-barrel if they exist).
import { config } from '../../config.js';
import { groundAt, ceilAt } from './course.js';

const INK = config.INK;

export function createCourseArt({ ctx, state, ink, sprites }) {
  // Visible world x range for the current camera view.
  const span = (view, width) => {
    const half = width / 2 / view.zoom;
    return [view.cx - half - 60, view.cx + half + 60];
  };

  const drawTerrain = (view, width, height) => {
    const course = state.course;
    if (!course || !config.COURSE.ENABLED) return;
    const [x0, x1] = span(view, width);
    const step = Math.max(12, 18 / view.zoom);
    const bottom = view.cy + height / 2 / view.zoom + 200;
    const top = view.cy - height / 2 / view.zoom - 200;

    // Ground: rock with a grassy top edge.
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1 + step; x += step) ctx.lineTo(x, groundAt(course, x));
    ctx.lineTo(x1 + step, bottom);
    ctx.closePath();
    ctx.fillStyle = '#8b6b4a';
    ctx.fill();
    ink();
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = '#6f8f4e';
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let x = x0; x <= x1 + step; x += step) {
      const y = groundAt(course, x) + 6;
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Overhangs and tunnel roofs: dark rock hanging down, with stalactites.
    let inRock = false;
    ctx.fillStyle = '#5e4a3a';
    ink();
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let x = x0; x <= x1 + step; x += step) {
      const c = ceilAt(course, x);
      const rock = c > top;
      if (rock && !inRock) {
        ctx.moveTo(x, top);
        inRock = true;
      }
      if (rock) {
        const drip = (Math.floor(x / 60) % 3 === 0 ? 22 : 0) * Math.min(1, (c - top) / 400);
        ctx.lineTo(x, c + drip);
      }
      if (!rock && inRock) {
        ctx.lineTo(x, top);
        inRock = false;
      }
    }
    if (inRock) ctx.lineTo(x1 + step, top);
    ctx.fill();
    ctx.stroke();
  };

  const drawTurrets = (time) => {
    const course = state.course;
    if (!course) return;
    for (const t of course.turrets) {
      if (t.x == null) continue;
      ctx.save();
      ctx.translate(t.x, t.y + 20);
      if (t.dead) {
        ink();
        ctx.fillStyle = '#3b3b3b';
        ctx.beginPath();
        ctx.moveTo(-36, 0);
        ctx.lineTo(-20, -18);
        ctx.lineTo(4, -10);
        ctx.lineTo(26, -22);
        ctx.lineTo(36, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = `rgba(60,60,60,${0.5 + 0.3 * Math.sin(time * 3 + t.cx)})`;
        ctx.beginPath();
        ctx.arc(0, -40 - ((time * 30) % 30), 14, 0, 7);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (t.rocket) {
        // Rocket battery: a sloped launch rail with a rocket waiting on it.
        ink();
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(-20, -10);
        ctx.lineTo(10, -70);
        ctx.stroke();
        ctx.fillStyle = t.cd < 1 ? '#c0392b' : '#7a2a22';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -48, 8, 18, 0.45, 0, 7);
        ctx.fill();
        ctx.stroke();
      } else if (!sprites.pivot(ctx, 'fx/turret-barrel', 0, -26, 0.1, 0.5, t.aim)) {
        ctx.save();
        ctx.translate(0, -26);
        ctx.rotate(t.aim);
        ink();
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(0, -8, 58, 16);
        ctx.strokeRect(0, -8, 58, 16);
        ctx.restore();
      }
      if (!sprites.box(ctx, 'fx/turret', -40, -50, 80, 52)) {
        ink();
        ctx.fillStyle = '#6b5a4a';
        ctx.beginPath();
        ctx.moveTo(-40, 2);
        ctx.lineTo(-30, -30);
        ctx.quadraticCurveTo(0, -52, 30, -30);
        ctx.lineTo(40, 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, -22, 7, 0, 7);
        ctx.fill();
      }
      for (let i = 0; i < t.hp; i++) {
        ctx.fillStyle = '#e63946';
        ctx.fillRect(-18 + i * 13, -66, 9, 9);
      }
      ctx.restore();
    }
  };

  // Route markers: home mooring mast, checkpoint flags, and the turning beacon (a lighthouse).
  const drawMarkers = (time) => {
    const course = state.course;
    if (!course || !course.markers) return;
    for (const m of course.markers) {
      const x = m.cx - course.dist;
      if (x < -1500 || x > 4500) continue;
      const g = groundAt(course, x);
      ink();
      if (m.kind === 'home') {
        // Lattice mooring mast with a platform near the top.
        const top = g - 900;
        ctx.fillStyle = '#7a5a3a';
        ctx.beginPath();
        ctx.moveTo(x - 70, g);
        ctx.lineTo(x - 22, top);
        ctx.lineTo(x + 22, top);
        ctx.lineTo(x + 70, g);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = 3;
        for (let y = g; y > top + 40; y -= 70) {
          const k = (g - y) / 900;
          const half = 70 - 48 * k;
          ctx.beginPath();
          ctx.moveTo(x - half, y);
          ctx.lineTo(x + half - 6, y - 70);
          ctx.moveTo(x + half, y);
          ctx.lineTo(x - half + 6, y - 70);
          ctx.stroke();
        }
        ink();
        ctx.fillStyle = '#5a3b26';
        ctx.fillRect(x - 60, top - 12, 120, 24);
        ctx.strokeRect(x - 60, top - 12, 120, 24);
        ctx.beginPath();
        ctx.moveTo(x, top - 12);
        ctx.lineTo(x, top - 110);
        ctx.stroke();
        ctx.fillStyle = '#3a86ff';
        ctx.beginPath();
        ctx.moveTo(x, top - 110);
        ctx.lineTo(x + 70 + Math.sin(time * 4) * 8, top - 92);
        ctx.lineTo(x, top - 74);
        ctx.fill();
        ctx.stroke();
      } else if (m.kind === 'checkpoint') {
        // Tall pole with a waving chequered flag.
        const top = g - 640;
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(x, g);
        ctx.lineTo(x, top);
        ctx.stroke();
        const wave = (k) => Math.sin(time * 5 + k) * 8;
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 3; j++) {
            ctx.fillStyle = (i + j) % 2 ? '#ffffff' : '#e63946';
            ctx.beginPath();
            ctx.moveTo(x + i * 26, top + j * 24 + wave(i));
            ctx.lineTo(x + (i + 1) * 26, top + j * 24 + wave(i + 1));
            ctx.lineTo(x + (i + 1) * 26, top + (j + 1) * 24 + wave(i + 1));
            ctx.lineTo(x + i * 26, top + (j + 1) * 24 + wave(i));
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.lineWidth = 3;
        ctx.strokeRect(x, top, 104, 72);
      } else if (m.kind === 'beacon') {
        // Striped lighthouse with a sweeping light.
        const top = g - 820;
        for (let i = 0; i < 6; i++) {
          const y0 = g - (i * 820) / 6;
          const y1 = g - ((i + 1) * 820) / 6;
          const w0 = 80 - (i * 40) / 6;
          const w1 = 80 - ((i + 1) * 40) / 6;
          ctx.fillStyle = i % 2 ? '#ffffff' : '#c0392b';
          ctx.beginPath();
          ctx.moveTo(x - w0, y0);
          ctx.lineTo(x - w1, y1);
          ctx.lineTo(x + w1, y1);
          ctx.lineTo(x + w0, y0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.fillStyle = '#ffd23f';
        ctx.fillRect(x - 34, top - 60, 68, 60);
        ctx.strokeRect(x - 34, top - 60, 68, 60);
        ctx.fillStyle = '#3b2a1d';
        ctx.beginPath();
        ctx.moveTo(x - 44, top - 60);
        ctx.lineTo(x, top - 110);
        ctx.lineTo(x + 44, top - 60);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        const a = time * 1.5;
        ctx.fillStyle = 'rgba(255,240,150,.35)';
        ctx.beginPath();
        ctx.moveTo(x, top - 30);
        ctx.lineTo(x + Math.cos(a) * 900, top - 30 + Math.sin(a) * 160 - 80);
        ctx.lineTo(x + Math.cos(a) * 900, top - 30 + Math.sin(a) * 160 + 80);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  return { drawTerrain, drawTurrets, drawMarkers };
}
