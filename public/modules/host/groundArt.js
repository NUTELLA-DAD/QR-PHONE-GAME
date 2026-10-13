// THE AWAY TEAM, drawn (CASTLE.md package A0; ground.js keeps state.away). The 2D fallback draws the castle walkways and their wall ladders, the ship's ROPE LADDER, a lit FLARE and the PICKUP marker (where the foot of the
// ship should hover) in the world layer; the 3D view has none of these yet (A3 makes the real ones), so render.js draws the same few things on the HUD there, through the 3D camera.
// Every primitive draws at the CURRENT transform and takes two scales: u for the shapes and tu for the words, so the 2D world pass (world units) and the 3D HUD pass (screen pixels) share them.
// Nothing wobbles: pulses are held for 1/8 s.
import { config } from '../../config.js';

const GOLD = '#ffd23f', FLARE = '#ff5a3c', ROPE = '#c9a66b', WOOD = '#8a6444', WOOD_DARK = '#5e4129';

export function createGroundArt({ ctx, world, ink }) {
  const text = (s, x, y, size, fill, tu) => {
    ctx.font = '700 ' + Math.round(size * tu) + 'px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * tu * 0.22);
    ctx.strokeStyle = '#fff7e0';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };

  // A ladder between two points: two rails and rungs every `gap` (the same units as the points).
  const ladder = (x0, y0, x1, y1, u, gap, color = WOOD) => {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / len, ny = (x1 - x0) / len, w = 11 * u;
    ctx.save();
    ink();
    ctx.lineCap = 'round';
    for (const [lw, col] of [[7.5 * u, config.INK], [4 * u, color]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w, y0 + ny * w);
      ctx.lineTo(x1 + nx * w, y1 + ny * w);
      ctx.moveTo(x0 - nx * w, y0 - ny * w);
      ctx.lineTo(x1 - nx * w, y1 - ny * w);
      ctx.stroke();
    }
    const n = Math.max(1, Math.floor(len / gap));
    for (const [lw, col] of [[6 * u, config.INK], [3 * u, color]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const t = i / n; ctx.moveTo(x0 + (x1 - x0) * t + nx * w, y0 + (y1 - y0) * t + ny * w); ctx.lineTo(x0 + (x1 - x0) * t - nx * w, y0 + (y1 - y0) * t - ny * w); }
      ctx.stroke();
    }
    ctx.restore();
  };

  // A flare: a red burst on a thin beam, "FLARE" over it.
  const flare = (x, y, u, k8, name, tu = u, h = 1) => { // (h: world units to drawn units, for the beam's length and the burst's height)
    ctx.save();
    ink();
    ctx.lineWidth = 3.5 * u;
    ctx.strokeStyle = 'rgba(255,90,60,0.55)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 330 * h);
    ctx.stroke();
    const r = (k8 & 1 ? 30 : 24) * u;
    ctx.fillStyle = FLARE;
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = 3.4 * u;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r * 0.5 : r; ctx.lineTo(x + Math.cos(a) * rr, y - 350 * h + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.arc(x, y - 350 * h, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    text('FLARE', x, y - 350 * h - r - 10 * u, 20, FLARE, tu);
    ctx.restore();
  };

  // The pickup marker: a gold ring where the foot of the ship's hatch should hover, an arrow down into it, and the words.
  const pickup = (x, y, u, k8, name, tu = u) => {
    ctx.save();
    ink();
    const r = (k8 & 1 ? 54 : 48) * u;
    ctx.setLineDash([14 * u, 10 * u]);
    ctx.lineWidth = 6 * u;
    ctx.strokeStyle = config.INK;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3.4 * u;
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = GOLD;
    ctx.lineWidth = 3.4 * u;
    ctx.strokeStyle = config.INK;
    ctx.beginPath();
    ctx.moveTo(x, y + 22 * u);
    ctx.lineTo(x - 18 * u, y - 6 * u);
    ctx.lineTo(x - 6 * u, y - 6 * u);
    ctx.lineTo(x - 6 * u, y - 24 * u);
    ctx.lineTo(x + 6 * u, y - 24 * u);
    ctx.lineTo(x + 6 * u, y - 6 * u);
    ctx.lineTo(x + 18 * u, y - 6 * u);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    text('PICK UP ' + String(name).toUpperCase(), x, y - r - 12 * u, 22, '#8a4a00', tu);
    ctx.restore();
  };

  // The walkway of a castle face: a plank between two points.
  const plank = (x0, y0, x1, y1, u) => {
    ctx.save();
    ink();
    ctx.lineCap = 'round';
    for (const [lw, col, dy] of [[12 * u, config.INK, 6], [7 * u, WOOD, 6], [3 * u, WOOD_DARK, 11]]) {
      ctx.lineWidth = lw;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + dy * u);
      ctx.lineTo(x1, y1 + dy * u);
      ctx.stroke();
    }
    ctx.restore();
  };

  // The 2D world pass, with the castle (render.js, under the ships): the walkways and their wall ladders. Only while the away team exists (ground.js S.on).
  const drawGround = () => {
    const S = world.away;
    if (!S || !S.on) return;
    for (const dk of S.decks) plank(dk.x0, dk.y, dk.x1, dk.y, 1);
    for (const l of S.ladders) ladder(l.x, l.y0 + 6, l.x, l.y1, 1, 46);
  };
  // The 2D world pass over the ships (render.js, after the crew in the air): the rope ladder, the flares and the pickup markers, in world units. tu = the words' scale.
  const drawWorld = (time, tu = 1) => {
    const S = world.away;
    if (!S || !S.on) return;
    const k8 = Math.floor(time * 8);
    const R = S.rope;
    if (R.out && R.len > 4) ladder(R.x, R.y, R.x, R.y + R.len, 1, 40, ROPE);
    for (const p of S.pickups) pickup(p.x, p.y, tu, k8, p.name, tu);
    for (const f of S.flares) flare(f.x, f.y, tu, k8, f.name, tu, 1);
  };

  return { drawGround, drawWorld, ladder, flare, pickup, plank, text, ROPE };
}
