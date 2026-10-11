// The sized engines in 2D (SHIP_BUILDING.md b6c, config.ENGINES.SIZES). A standard pod keeps the ship art's sprite and its two-bladed edge-on propeller (shipArt.js, partArt.js draw that themselves).
// A HEAVY engine is the same pod bigger, with brass bands, twin stacks and a four-bladed propeller; a GREAT LIFT engine (the sky-lifter) is a dark turbine drum with a brass duct ring and two fans
// one behind the other. Everything is drawn about the engine's centre (0, 0) in its own frame: the push end is on side `out` (+1 / -1), 120 px or so long for a pod. Pure drawing: no state.
//   artOf(size)                                       { k, kh, size } the length factor and the height factor of the nacelle (config.ENGINES.SIZES art, ART_HEIGHT)
//   drawEngineBody(g, size, out, sprites, filled, line)   the nacelle (no propeller), `filled(color, path)` and `line(points, width, color)` are the caller's inked pens
//   drawEngineProp(g, size, out, ph, filled)          the propeller or fans at blade phase `ph` (edge-on, so a spinning blade is a thin ellipse)
//   steamPuff(size)                                   how big the exhaust puffs are, against a pod's (the square root of the steam it burns)
import { config } from '../../config.js';
import { sizeNamed } from './shipBuild.js';

const IRON = '#6a6568', DARK = '#4b5258', BRASS = '#c9a85a', WOOD_DARK = '#6b4a32';

export function artOf(size) {
  const S = sizeNamed(size), k = S.art, kh = 1 + (k - 1) * config.ENGINES.ART_HEIGHT;
  return { k, kh, S };
}
export const steamPuff = (size) => Math.sqrt(sizeNamed(size).steam);

export function drawEngineBody(g, size, out, sprites, filled, line) {
  const { k, kh } = artOf(size);
  if (size === 'great') { // the turbine drum: dark iron, riveted bands, a duct ring at the push end, stacks on top
    filled(DARK, () => g.ellipse(0, 0, 62 * k, 24 * kh, 0, 0, 7));
    for (const f of [-0.55, -0.1, 0.35]) { const x = out * f * 62 * k; line([[x, -22 * kh], [x, 22 * kh]], 3, IRON); }
    for (const f of [-0.45, 0.05]) filled(IRON, () => g.rect(out * f * 62 * k - 8, -24 * kh - 14, 16, 18));
    filled(BRASS, () => g.ellipse(out * 52 * k * 0.92, 0, 11, 24 * kh * 1.5, 0, 0, 7)); // the duct ring, seen from the side: a tall brass lens
    filled('#2b2622', () => g.ellipse(out * 52 * k * 0.92, 0, 6, 24 * kh * 1.25, 0, 0, 7));
    filled(BRASS, () => g.ellipse(-out * 50 * k, 0, 8, 24 * kh * 0.7, 0, 0, 7)); // the exhaust collar aft
    return;
  }
  if (!sprites || !sprites.box(g, 'ship/engine', -62 * k, -24 * kh, 124 * k, 48 * kh, out < 0)) {
    filled('#6d7378', () => g.ellipse(0, 0, 62 * k, 24 * kh, 0, 0, 7));
    filled(IRON, () => g.arc(out * 62 * k, 0, 9 * k, 0, 7));
  }
  for (const f of [0.28, 0.62]) filled(BRASS, () => g.rect(out * f * 62 * k - 4, -24 * kh * 0.92, 8, 48 * kh * 0.92)); // two brass bands
  for (const f of [-0.55, -0.3]) filled(IRON, () => g.rect(out * f * 62 * k - 5, -24 * kh - 11, 10, 14)); // twin stacks
}

export function drawEngineProp(g, size, out, ph, filled) {
  const { k, kh } = artOf(size);
  if (size === 'great') { // two fans, the rear one a little behind and quarter a turn on: the twin rotor
    const fan = (x, r, p) => filled('#3b4650', () => g.ellipse(out * x, 0, 4.5, Math.abs(Math.cos(p)) * r + 5, 0, 0, 7));
    fan(60 * k, 54 * kh * 1.1, ph);
    fan(60 * k - 22, 54 * kh * 1.1, ph + 0.8);
    filled(BRASS, () => g.arc(out * (60 * k + 5), 0, 7, 0, 7));
    return;
  }
  const r = 46 * k; // heavy: four blades, so two edge-on ellipses a quarter turn apart
  filled(WOOD_DARK, () => g.ellipse(out * 70 * k, 0, 6, Math.abs(Math.cos(ph)) * r + 4, 0, 0, 7));
  filled(WOOD_DARK, () => g.ellipse(out * 70 * k, 0, 6, Math.abs(Math.sin(ph)) * r + 4, 0, 0, 7));
  filled(BRASS, () => g.arc(out * (70 * k + 3), 0, 7, 0, 7));
}
