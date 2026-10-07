// Shared plane drawings.
import { config } from '../../config.js';

// Painted sprites (art/sprites/planes/dogfighter|escort), set once by threatArt. Optional.
let planeSprites = null;
export function setPlaneSprites(sprites) {
  planeSprites = sprites;
}
// Which painted plane a call stands for, judged by its colours (other palettes, e.g. the
// Aether's void corsairs, keep the drawn version).
const SPRITE_KIND = { '#8fb37a': 'escort', '#5f7a52': 'escort', '#b9b1a0': 'dogfighter', '#7d766a': 'dogfighter' };

// A small biplane (after Bomber XXL): soft flat colours, thin outlines, two stacked wings,
// a round cowling and a blurred propeller. Drawn nose-right at the origin.
export function drawBiplane(ctx, time, body, trim, wreck, pilot = '#efe9dc') {
  const kind = SPRITE_KIND[body];
  if (kind && planeSprites && planeSprites.plane(ctx, kind, time, wreck ? 'wreck' : 'body')) return;
  ctx.strokeStyle = '#2b2622';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  // Tail fin and tailplane.
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.moveTo(-40, -2);
  ctx.lineTo(-50, -22);
  ctx.lineTo(-38, -22);
  ctx.lineTo(-28, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Lower wing.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-10, 8, 34, 6, 3);
  ctx.fill();
  ctx.stroke();
  // Fuselage.
  ctx.beginPath();
  ctx.moveTo(-46, -4);
  ctx.quadraticCurveTo(-10, -12, 22, -10);
  ctx.lineTo(24, 8);
  ctx.quadraticCurveTo(-10, 8, -46, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Stripe and cowling.
  ctx.fillStyle = trim;
  ctx.fillRect(-20, -9, 7, 15);
  ctx.fillStyle = '#4a4440';
  ctx.beginPath();
  ctx.roundRect(20, -11, 10, 20, 4);
  ctx.fill();
  ctx.stroke();
  // Struts and upper wing.
  ctx.beginPath();
  ctx.moveTo(-2, 8);
  ctx.lineTo(0, -20);
  ctx.moveTo(16, 8);
  ctx.lineTo(18, -20);
  ctx.stroke();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-12, -26, 38, 7, 3);
  ctx.fill();
  ctx.stroke();
  // Pilot (a skull in goggles, for the enemy).
  ctx.fillStyle = pilot;
  ctx.beginPath();
  ctx.arc(-8, -14, 5.5, 0, 7);
  ctx.fill();
  ctx.stroke();
  // Propeller blur.
  if (!wreck) {
    ctx.fillStyle = 'rgba(60,50,45,.45)';
    ctx.beginPath();
    ctx.ellipse(33, -1, 3, 18 * (0.7 + 0.3 * Math.abs(Math.sin(time * 40))), 0, 0, 7);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ff7b00';
    ctx.beginPath();
    ctx.arc(26, -2, 7 + Math.random() * 3, 0, 7);
    ctx.fill();
  }
}

// A small tail number on a friendly plane (drawn in the plane's own frame; `flip` = she is drawn
// mirrored so the text must be mirrored back). Never throws.
export function drawTailNumber(ctx, num, flip = false) {
  try {
    ctx.save();
    ctx.translate(-33, -1);
    if (flip) ctx.scale(1, -1);
    ctx.fillStyle = '#2b2622';
    ctx.font = '700 12px ' + config.FONTS.TEXT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(num), 0, 0);
    ctx.restore();
  } catch (e) { /* drawing must never throw */ }
}
