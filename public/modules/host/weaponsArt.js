// What the weapons of the range bands LOOK like (weapons.js, minefield.js, config.GUN_TYPES, config.MINEFIELD, config.RAM): the barrels of the gun types (the live gun on the ship, and the little
// picture in the build tray: partArt.js), the shells that are not the plain glowing orb, the floating mines, the ram prow, the mine chute. Storybook gouache like the rest: flat colour, the ink outline.
// Pure drawing functions of a 2D context (a stub canvas is fine); never throws. Shapes are in LOCAL coordinates: a barrel points along +x from its pivot.
import { config } from '../../config.js';

const IRON = '#4a4a4a', DARK = '#2a2a2a', BRASS = '#c9a85a', STEEL = '#6d7378', WOOD = '#b98a5a', WOOD_DARK = '#6b4a32', RED = '#a8443f';
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// A barrel is a list of filled shapes { color, pts } (a closed polygon) or { color, circle: [x, y, r] }.
export const BARRELS = {
  long: [ // a long slender rifled barrel with brass bands and a muzzle brake
    { color: IRON, pts: rect(0, -6, 124, 12) },
    { color: BRASS, pts: rect(28, -8, 6, 16) },
    { color: BRASS, pts: rect(74, -8, 6, 16) },
    { color: DARK, pts: rect(118, -10, 14, 20) },
    { color: DARK, pts: rect(-8, -11, 14, 22) },
  ],
  mortar: [ // a short fat tube on a base plate, wide at the mouth
    { color: IRON, pts: [[-4, -17], [42, -22], [42, 22], [-4, 17]] },
    { color: BRASS, pts: rect(34, -25, 9, 50) },
    { color: DARK, pts: rect(-14, -14, 12, 28) },
    { color: BRASS, pts: rect(10, -19, 6, 38) },
  ],
  scatter: [ // a bell-mouthed blunderbuss
    { color: IRON, pts: [[0, -7], [34, -9], [74, -26], [74, 26], [34, 9], [0, 7]] },
    { color: BRASS, pts: rect(14, -10, 6, 20) },
    { color: DARK, pts: [[70, -22], [76, -22], [76, 22], [70, 22]] },
  ],
  flak: [ // two slender barrels side by side with a ring sight
    { color: IRON, pts: rect(0, -15, 76, 9) },
    { color: IRON, pts: rect(0, 6, 76, 9) },
    { color: BRASS, pts: rect(18, -17, 6, 34) },
    { color: DARK, pts: rect(70, -17, 8, 13) },
    { color: DARK, pts: rect(70, 4, 8, 13) },
    { color: STEEL, circle: [34, 0, 6] },
  ],
  harpoon: [ // a plain barrel with the harpoon laid in the muzzle and a spool of line at the breech
    { color: IRON, pts: rect(0, -8, 62, 16) },
    { color: BRASS, pts: rect(20, -10, 6, 20) },
    { color: STEEL, pts: [[58, -5], [96, 0], [58, 5]] },
    { color: STEEL, pts: [[84, -10], [96, 0], [84, 10], [74, 0]] },
    { color: '#d6bf8a', circle: [-8, 0, 15] },
    { color: WOOD_DARK, circle: [-8, 0, 6] },
  ],
  flame: [ // a brass fuel tank on the mount with a gauge and a valve wheel, iron pipes forward to a flared brass nozzle (flameArt.js draws the cone from its lip)
    { color: IRON, pts: rect(-6, -4, 52, 8) }, // the main pipe
    { color: IRON, pts: [[-4, 8], [8, 8], [26, 3], [26, 7], [10, 13], [-4, 13]] }, // the feed pipe from the tank, in a bend
    { color: BRASS, pts: rect(-58, -19, 48, 38) }, // the tank
    { color: DARK, pts: rect(-48, -21, 5, 42) },
    { color: DARK, pts: rect(-30, -21, 5, 42) },
    { color: '#d9d3c4', circle: [-37, -4, 6] }, // the pressure gauge
    { color: RED, circle: [18, -11, 5] }, // the valve wheel
    { color: BRASS, pts: [[40, -8], [60, -6], [66, -12], [66, 12], [60, 6], [40, 8]] }, // the flared nozzle
    { color: DARK, pts: rect(64, -13, 5, 26) },
  ],
};
// Draw the barrel of a gun type. `fill(color, pathFn)` is the caller's filled-and-inked shape (partArt.js `filled`, or render.js's ink fill).
export function drawBarrel(g, type, fill) {
  const list = BARRELS[type];
  if (!list) return false;
  for (const s of list) {
    if (s.circle) fill(s.color, () => g.arc(s.circle[0], s.circle[1], s.circle[2], 0, 7));
    else fill(s.color, () => { s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); });
  }
  return true;
}

// ---- shells that are not the plain orb ----
// How a shell of this kind is drawn: { color or null (the shooter's), r (the orb), trail (s of streak), iron (a dark ball with smoke) }. null = the plain one.
export const SHELL_LOOK = {
  long: { color: '#fff4c2', r: 7, trail: 0.12 },
  mortar: { color: '#ffb347', r: 14, trail: 0.05, iron: true },
  scatter: { color: '#ffd9a0', r: 4, trail: 0.03 },
  flak: { color: '#e9e4d6', r: 8, trail: 0.05 },
  flakFrag: null,
};

// ---- mines ----
const SPIKES = 10;
// One floating mine at its world position: an iron ball with spikes, bobbing, with a blinking lamp on top (amber and slow while it is still sinking clear of the layer, red and quick once it is armed) and,
// armed, a faint pulsing ring of danger. `sc` makes everything bigger when the camera is far out (so it reads from the sofa).
export function drawMine(ctx, m, time, sc = 1) {
  const K = config.MINEFIELD, armed = m.age >= K.ARM, R = K.RADIUS * sc;
  const bob = Math.sin(time * 1.6 + m.bob) * 6;
  ctx.save();
  ctx.translate(m.x, m.y + bob);
  if (armed) {
    ctx.globalAlpha = 0.16 + 0.1 * Math.sin(time * 5 + m.bob);
    ctx.fillStyle = '#ff3b2e';
    ctx.beginPath();
    ctx.arc(0, 0, K.TRIGGER * 1.7 * sc, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = Math.max(3, 3.4 * sc);
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#3a3a3e';
  ctx.beginPath(); // the horns
  for (let k = 0; k < SPIKES * 2; k++) {
    const a = (k / (SPIKES * 2)) * Math.PI * 2 + 0.15, r = k % 2 ? R * 0.92 : R * 1.5;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#55555b'; // the ball
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; // a sheen
  ctx.beginPath();
  ctx.ellipse(-R * 0.3, -R * 0.35, R * 0.34, R * 0.2, -0.6, 0, 7);
  ctx.fill();
  ctx.strokeStyle = BRASS; // a brass band
  ctx.lineWidth = Math.max(3, 4 * sc);
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.28, 0, 0, 7);
  ctx.stroke();
  const lit = armed ? Math.sin(time * 14 + m.bob) > 0 : Math.sin(time * 4 + m.bob) > 0.2;
  ctx.fillStyle = lit ? (armed ? '#ff2e2e' : '#ffb347') : '#4a2a2a'; // the lamp
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = Math.max(2.5, 3 * sc);
  ctx.beginPath();
  ctx.arc(0, -R * 1.05, R * 0.24, 0, 7);
  ctx.fill();
  ctx.stroke();
  if (lit) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = armed ? '#ff2e2e' : '#ffb347';
    ctx.beginPath();
    ctx.arc(0, -R * 1.05, R * 0.6, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
export function drawMines(ctx, world, time, zoom = 1) {
  try {
    const sc = world.match && world.match.on ? Math.max(1, 0.34 / zoom) : 1; // (zoomed far out in Versus the mines grow)
    for (const m of world.laid || []) drawMine(ctx, m, time, sc);
  } catch (e) { /* drawing must never throw */ }
}

// ---- the mine layer's chute (in the floor of a lower deck) ----
// At the gun's pivot (bx, by) on its deck: a hatch with brass hinges and, beside it, the mines it holds (one iron ball per mine, `ammo` of `max`).
export function drawChute(ctx, gun, time) {
  const { bx, by } = gun, open = gun.cd > 0 ? Math.min(1, gun.cd * 2) : 0;
  ctx.save();
  ctx.translate(bx, by);
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'round';
  ctx.fillStyle = DARK; // the hole in the floor
  ctx.beginPath();
  ctx.rect(-34, -4, 68, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = WOOD; // the trap door, swung down while a mine falls
  ctx.beginPath();
  ctx.moveTo(-34, -4);
  ctx.lineTo(34, -4);
  ctx.lineTo(34 - open * 20, -4 + open * 24);
  ctx.lineTo(-34 + open * 20, -4 + open * 24);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BRASS;
  for (const x of [-30, 30]) { ctx.beginPath(); ctx.arc(x, -4, 4, 0, 7); ctx.fill(); ctx.stroke(); }
  const n = Math.max(1, gun.max || 6);
  for (let i = 0; i < n; i++) { // the mines on the rack beside it
    ctx.fillStyle = i < gun.ammo ? '#55555b' : 'rgba(27,20,16,.25)';
    ctx.beginPath();
    ctx.arc(-46 - 20 * (i % 3), -14 - 20 * Math.floor(i / 3) * 1, 8, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ---- the ram prow ----
// The big iron beak (config.RAM) in ship coordinates: `r` = layout.ram { x, d }, `deckY` = the deck's y; it sticks config.RAM.TIP px out past the fore end of the deck. A collar and two straps bolted over the
// hull's nose, a riveted iron wedge in plates with a painted stripe in the team's colour, three spikes on each side and a brass cap on the point. o = { trim: the team's stripe colour, hits: landed rams (0..SCUFF_MAX:
// each one adds a dent, a scratch and soot), lw: the ink width }. The same drawing is the little picture in the build tray (partArt.js) at a smaller scale.
const SCUFFS = [[318, -22, 0.6], [180, 24, -0.4], [352, 9, 0.2], [246, -30, -0.7], [128, 12, 0.5], [290, 30, -0.2]]; // (x, y, slant of each landed ram's dent and scratch)
export function drawRam(ctx, r, deckY, o = {}) {
  const K = o.art === 'kraken'; // the KRAKEN BEAK trophy (partsShop.js): the same ram prow in bone and purple, with a dark horn on the point
  const PAL = K ? { strap: '#5c3a4c', spike: '#e8dcc0', plate: '#e3d6b6', shade: '#b9a77f', cap: '#3a2430', collar: '#6a4a5a', band: '#a98fa0', trim: '#7a3a5a' } : { strap: '#5a6065', spike: '#3f4348', plate: '#76808a', shade: '#58606a', cap: BRASS, collar: '#464b52', band: BRASS, trim: RED };
  const R = config.RAM, T = R.TIP, H = R.HALF, lw = o.lw || 5.5, trim = K ? PAL.trim : o.trim || RED, hits = Math.min(R.SCUFF_MAX, o.hits || 0);
  const TOP = []; // the upper edge of the beak, collar to point: a sleek swoop (the lower edge is its mirror)
  for (let i = 0; i <= 28; i++) { const t = i / 28, u = 1 - t; TOP.push([u * u * 50 + 2 * t * u * (50 + (T - 50) * 0.5) + t * t * T, -(u * u * H + 2 * t * u * H * 0.42)]); }
  const edge = (x) => { // half the height of the beak at x
    for (let i = 1; i < TOP.length; i++) if (TOP[i][0] >= x) return -(TOP[i - 1][1] + ((TOP[i][1] - TOP[i - 1][1]) * (x - TOP[i - 1][0])) / (TOP[i][0] - TOP[i - 1][0] || 1));
    return 0;
  };
  const body = () => { ctx.beginPath(); TOP.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = TOP.length - 1; i >= 0; i--) ctx.lineTo(TOP[i][0], -TOP[i][1]); ctx.closePath(); };
  const rivet = (x, y, rad = 4.2) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = '#e0d9c6'; ctx.fill(); ctx.lineWidth = lw * 0.35; ctx.stroke(); };
  ctx.save();
  ctx.translate(r.x, deckY);
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // the straps over the hull's nose, behind the collar
  for (const s of [-1, 1]) {
    ctx.fillStyle = PAL.strap;
    ctx.beginPath(); ctx.rect(-150, s < 0 ? -H + 2 : H - 18, 130, 16); ctx.fill(); ctx.stroke();
    for (let x = -136; x < -30; x += 30) rivet(x, s < 0 ? -H + 10 : H - 10, 3.4);
  }
  // the spikes, three on each side leaning forward
  for (const s of [-1, 1]) for (const x of [136, 226, 316]) {
    ctx.fillStyle = PAL.spike;
    ctx.beginPath();
    ctx.moveTo(x - 15, s * edge(x - 15));
    ctx.lineTo(x + 38, s * (edge(x) + 40));
    ctx.lineTo(x + 14, s * edge(x + 14));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // the beak: iron plate with the lower half in shade
  body();
  ctx.fillStyle = PAL.plate;
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  ctx.fillStyle = PAL.shade; // shade under
  ctx.fillRect(0, 6, T + 10, H);
  ctx.fillStyle = 'rgba(255,255,255,0.26)'; // light along the top
  ctx.beginPath(); TOP.forEach(([x, y]) => ctx.lineTo(x, y + 13)); for (let i = TOP.length - 1; i >= 0; i--) ctx.lineTo(TOP[i][0], TOP[i][1] + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = trim; // the painted stripe in the team colour, with a pale line each side
  ctx.fillRect(84, -H, 46, 2 * H);
  ctx.fillStyle = 'rgba(243,234,214,0.85)';
  ctx.fillRect(80, -H, 4, 2 * H);
  ctx.fillRect(130, -H, 4, 2 * H);
  ctx.strokeStyle = 'rgba(43,38,34,0.55)'; // plate seams
  ctx.lineWidth = lw * 0.55;
  for (const x of [200, 290]) { ctx.beginPath(); ctx.moveTo(x, -H); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.strokeStyle = config.INK;
  for (const x of [80, 134, 178, 222, 270, 310]) for (const f of [-0.62, 0, 0.62]) if (Math.abs(f * edge(x)) < edge(x) - 7) rivet(x, f * edge(x), 3.8);
  ctx.fillStyle = PAL.cap; // the cap on the point, with a seam
  ctx.fillRect(T - 90, -H, 92, 2 * H);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(T - 90, -H, 92, 10);
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = lw * 0.7;
  ctx.beginPath(); ctx.moveTo(T - 90, -H); ctx.lineTo(T - 90, H); ctx.stroke();
  if (hits) { // scuffs: one dent and one scratch for each landed ram, the soot on the point, a chip out of the stripe
    ctx.lineCap = 'round';
    for (let i = 0; i < hits; i++) {
      const [x, y, a] = SCUFFS[i];
      ctx.fillStyle = 'rgba(30,28,32,0.72)';
      ctx.beginPath(); ctx.ellipse(x, y, 19, 12, a, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(235,228,210,0.85)';
      ctx.lineWidth = lw * 0.5;
      ctx.beginPath(); ctx.arc(x, y, 14, a + 3.3, a + 5.2); ctx.stroke(); // (the glint on the dent)
      ctx.strokeStyle = 'rgba(235,228,210,0.7)';
      ctx.lineWidth = lw * 0.75;
      ctx.beginPath(); ctx.moveTo(x - 38, y - 18 * Math.sign(a || 1)); ctx.lineTo(x + 34, y + 14 * Math.sign(a || 1)); ctx.stroke(); // (the scratch across it)
    }
    ctx.fillStyle = `rgba(30,24,20,${Math.min(0.62, 0.14 * hits)})`;
    ctx.beginPath(); ctx.ellipse(T - 24, 0, 56, 30, 0, 0, 7); ctx.fill();
    if (hits >= 3) { ctx.fillStyle = '#76808a'; ctx.fillRect(106, -H, 14, 22); ctx.fillRect(118, 12, 12, 18); }
  }
  ctx.restore();
  ctx.strokeStyle = config.INK;
  ctx.lineWidth = lw;
  body();
  ctx.stroke();
  // the collar, bolted over the nose
  ctx.fillStyle = PAL.collar;
  ctx.beginPath(); ctx.roundRect(-34, -H - 10, 96, 2 * H + 20, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = PAL.band;
  ctx.beginPath(); ctx.rect(46, -H - 10, 16, 2 * H + 20); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-28, -H - 4, 70, 9);
  for (const x of [-16, 10, 32]) for (const y of [-H - 1, H + 1]) rivet(x, y, 5.2);
  for (const y of [-26, 0, 26]) rivet(-20, y, 4.4);
  ctx.restore();
}
