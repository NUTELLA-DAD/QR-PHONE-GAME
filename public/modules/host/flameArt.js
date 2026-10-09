// What the FLAMETHROWER looks like in action (flame.js, config.FLAME; the brass nozzle on its tank is the gun-type barrel in weaponsArt.js). Storybook gouache like the rest: flat fills, a thin
// warm-brown ink outline, no gradients and no wobble - the tongues of the cone change between three fixed shapes, stepped at about nine frames a second.
//   drawCone(ctx, len, half, time, seed)       a cone of fire from (0, 0) along +x: orange tongues, a yellow heart, a cream core. Draw it in the gun's frame, translated to the nozzle.
//   drawFlameGun(ctx, gun, time)               on the ship, at a flame gun: the pilot light, the cone when it burns, and the heat gauge above the mount (red and blinking when it has overheated)
// Pure drawing functions of a 2D context (a stub canvas is fine); never throw.
import { config } from '../../config.js';

const INK = () => config.INK || '#2b2622';
// Tongue patterns, [share of the length, share of the half-angle (-1 = the top edge, 1 = the bottom)] for five tongues. Three frames, stepped.
const FRAMES = [
  [[0.80, -0.95], [1.00, -0.5], [0.86, 0], [1.00, 0.5], [0.78, 0.95]],
  [[0.90, -0.95], [0.82, -0.5], [1.00, 0], [0.84, 0.5], [0.92, 0.95]],
  [[0.76, -0.95], [0.96, -0.5], [0.90, 0], [0.94, 0.5], [0.84, 0.95]],
];

// The outline of one layer: from the nozzle's top lip out along the upper edge, up and down over each tongue and valley, and back along the lower edge.
function tonguePath(g, len, half, lip, frame, spread, grow) {
  g.beginPath();
  g.moveTo(0, -lip);
  const tip = (l, a) => [Math.cos(a * half * spread) * len * l * grow, Math.sin(a * half * spread) * len * l * grow];
  frame.forEach(([l, a], i) => {
    const [x, y] = tip(l, a);
    if (i) {
      const [pl, pa] = frame[i - 1], m = tip(((l + pl) / 2) * 0.74, (a + pa) / 2);
      g.lineTo(m[0], m[1]); // the valley between two tongues
    }
    g.lineTo(x, y);
  });
  g.lineTo(0, lip);
  g.closePath();
}

export function drawCone(g, len, half, time, seed = 0) {
  try {
    if (!(len > 4)) return;
    const frame = FRAMES[((Math.floor(time * 9 + seed) % 3) + 3) % 3];
    const lip = Math.min(15, 5 + len * 0.06);
    g.lineJoin = 'round';
    g.strokeStyle = INK();
    g.lineWidth = 3;
    tonguePath(g, len, half, lip, frame, 1, 1);
    g.fillStyle = '#f08a3c';
    g.fill();
    g.stroke();
    tonguePath(g, len, half, lip * 0.7, frame, 0.66, 0.78); // the yellow heart
    g.fillStyle = '#ffd35c';
    g.fill();
    tonguePath(g, len, half, lip * 0.4, frame, 0.34, 0.5); // the cream core
    g.fillStyle = '#fff2cf';
    g.fill();
  } catch { /* (drawing never throws) */ }
}

// On the ship (the context is in ship space), at flame gun `gun` (a record of state.GUNS: bx, by, aim, flame 0..1, heat 0..1, overheat).
export function drawFlameGun(g, gun, time) {
  try {
    const F = config.FLAME, T = config.GUN_TYPES.flame, reach = Math.max(0, T.RANGE - F.NOZZLE);
    g.save();
    g.translate(gun.bx, gun.by);
    g.rotate(gun.aim);
    g.translate(F.NOZZLE, 0);
    const len = reach * (gun.flame || 0);
    if (len > 10) drawCone(g, len, F.HALF, time, gun.bx * 0.01);
    else if (!gun.overheat) drawCone(g, 15, 0.5, time, gun.bx * 0.01); // the pilot light
    g.restore();
    const heat = Math.min(1, gun.heat || 0);
    if (heat > 0.04 || gun.overheat) { // the heat gauge
      const w = 54, h = 8, x = gun.bx - w / 2, y = gun.by - 48;
      g.lineJoin = 'round';
      g.strokeStyle = INK();
      g.lineWidth = 2.4;
      g.fillStyle = '#f1e7cf';
      g.fillRect(x, y, w, h);
      const blink = gun.overheat && Math.floor(time * 6) % 2 === 0;
      g.fillStyle = blink ? '#ffffff' : heat > 0.8 ? '#e63946' : heat > 0.5 ? '#ff7b00' : '#f2d36b';
      g.fillRect(x + 1, y + 1, (w - 2) * heat, h - 2);
      g.strokeRect(x, y, w, h);
    }
  } catch { /* (drawing never throws) */ }
}
