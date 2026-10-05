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
      // Barrel, then the bunker over its base.
      if (!sprites.pivot(ctx, 'fx/turret-barrel', 0, -26, 0.1, 0.5, t.aim)) {
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

  return { drawTerrain, drawTurrets };
}
