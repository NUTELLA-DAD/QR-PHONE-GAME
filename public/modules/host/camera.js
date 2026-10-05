// Camera: decides which part of the world is on screen.
// It always keeps the whole ship in view at no more than CAMERA.SHIP_SCREEN_FRACTION of the
// screen width, and zooms out / pans to also frame the enemy plane, gliding smoothly.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const C = config.CAMERA;
const PAD_Y = 90; // sky kept above and below the ship (world pixels)

export function createCamera() {
  let scroll = 0;
  let view = null;

  const target = (state, width, height) => {
    const b = SHIP_LAYOUT.bounds;
    const alt = state.ship.alt;
    const shipW = b.x1 - b.x0;
    const shipH = b.y1 - b.y0 + PAD_Y * 2;
    let x0 = b.x0;
    let x1 = b.x1;
    let y0 = b.y0 - alt - PAD_Y;
    let y1 = b.y1 - alt + PAD_Y;
    // Frame the fighter, plus any cargo plane or mine that's getting close.
    const shipX = (b.x0 + b.x1) / 2;
    const things = [];
    if (state.enemy.dead <= 0) things.push(state.enemy);
    for (const t of [...(state.cargo || []), ...(state.mines || [])]) if (Math.abs(t.x - shipX) < 2400) things.push(t);
    for (const e of things) {
      x0 = Math.min(x0, e.x - C.ENEMY_MARGIN);
      x1 = Math.max(x1, e.x + C.ENEMY_MARGIN);
      y0 = Math.min(y0, e.y - C.ENEMY_MARGIN);
      y1 = Math.max(y1, e.y + C.ENEMY_MARGIN);
    }
    // Normal zoom: ship fills the allowed fraction of the width (and fits vertically).
    const baseZoom = Math.min(width / (shipW / C.SHIP_SCREEN_FRACTION), height / shipH);
    const fitZoom = Math.min(width / (x1 - x0), height / (y1 - y0));
    const zoom = Math.max(baseZoom / C.MAX_ZOOM_OUT, Math.min(baseZoom, fitZoom));
    // Centre on the framed box, but never let the ship slide off screen.
    const halfW = width / 2 / zoom;
    const halfH = height / 2 / zoom;
    const clampTo = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    const cx = clampTo((x0 + x1) / 2, b.x1 - halfW, b.x0 + halfW);
    const cy = clampTo((y0 + y1) / 2, b.y1 - alt + PAD_Y - halfH, b.y0 - alt - PAD_Y + halfH);
    return { cx, cy, zoom };
  };

  return {
    update(dt, state, width, height) {
      scroll += (40 + state.ship.speed * 520) * dt;
      const t = target(state, width, height);
      if (!view) view = { ...t };
      const k = 1 - Math.exp(-C.SMOOTHING * dt);
      view.cx += (t.cx - view.cx) * k;
      view.cy += (t.cy - view.cy) * k;
      view.zoom += (t.zoom - view.zoom) * k;
      return { ...view, scroll };
    },
    getScroll() {
      return scroll;
    },
  };
}
