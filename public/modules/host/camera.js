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
  let lead = { x: 0, y: 0 }; // look-ahead in the direction she's moving (smoothed)

  const target = (state, width, height) => {
    const b = SHIP_LAYOUT.bounds;
    const alt = state.ship.alt;
    const shipW = b.x1 - b.x0;
    const shipH = b.y1 - b.y0 + PAD_Y * 2;
    let x0 = b.x0;
    let x1 = b.x1;
    let y0 = b.y0 - alt - PAD_Y;
    let y1 = b.y1 - alt + PAD_Y;
    // Look ahead the way she's going (so you see what you're flying into).
    x0 += Math.min(0, lead.x);
    x1 += Math.max(0, lead.x);
    y0 += Math.min(0, lead.y);
    y1 += Math.max(0, lead.y);
    // Frame threats that are actually close (farther ones get arrows at the screen edge instead).
    const shipX = (b.x0 + b.x1) / 2;
    const shipY = (b.y0 + b.y1) / 2 - alt;
    const near = (t, r) => Math.hypot((t.x - shipX) * 0.8, t.y - shipY) < r;
    const things = [];
    if (state.enemy.dead <= 0 && near(state.enemy, C.FRAME_RANGE)) things.push(state.enemy);
    for (const t of [...(state.mines || []), ...(state.bombers || [])]) if (near(t, C.FRAME_RANGE)) things.push(t);
    if (state.boss && near(state.boss, C.FRAME_RANGE + 600)) things.push(state.boss);
    for (const t of state.hijacks || []) if (near(t, C.FRAME_RANGE + 600)) things.push(t); // a stolen plane stays in view
    for (const t of state.specials ? [...state.specials.snipers, ...state.specials.tugs] : []) if (near(t, C.FRAME_RANGE + 400)) things.push(t);
    if (state.supply && state.course) things.push({ x: state.supply.mx - state.course.dist, y: state.supply.my });
    if (state.gunship) { const gd = Math.min(state.gunship.dx, 1300); things.push({ x: 2600 + gd, y: 500 + state.gunship.dy - alt }, { x: 3300 + gd, y: 300 + state.gunship.dy - alt }); } // (far off on her way in she is only an edge arrow)
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
    // (The ship always stays well inside the frame - threats that don't fit get edge arrows.)
    // (The ship's middle always stays within the middle half of the screen.)
    const keep = C.SHIP_KEEP_IN;
    const mx = (b.x0 + b.x1) / 2;
    const my = (b.y0 + b.y1) / 2 - alt;
    const cx = clampTo((x0 + x1) / 2, mx - halfW * keep, mx + halfW * keep);
    const cy = clampTo((y0 + y1) / 2, my - halfH * keep, my + halfH * keep);
    return { cx, cy, zoom };
  };

  return {
    update(dt, state, width, height) {
      // The scenery follows the ship's real position (it scrolls back when backing up).
      scroll = state.course ? state.course.dist : scroll + 200 * dt;
      // A minimised or hidden window can report zero size; keep the last view until it's back.
      if (width < 10 || height < 10) return view ? { ...view, scroll } : { cx: 800, cy: 450, zoom: 0.3, scroll };
      // Smoothly lead toward where she's heading.
      const vx = (state.ship.speed || 0) * config.SHIP.TOP_SPEED * (1 + config.BOILER.OD_ENGINE * (state.overdrive || 0));
      const vy = -(state.ship.vy || 0);
      const kl = 1 - Math.exp(-C.LEAD_SMOOTHING * dt);
      lead.x += (vx * C.LEAD_TIME - lead.x) * kl;
      lead.y += (vy * C.LEAD_TIME * 0.8 - lead.y) * kl;
      const t = target(state, width, height);
      // Start fresh if there's no view yet or it ever went bad.
      if (!view || !Number.isFinite(view.cx) || !Number.isFinite(view.cy) || !Number.isFinite(view.zoom) || view.zoom <= 0) view = { ...t };
      const k = 1 - Math.exp(-C.SMOOTHING * dt);
      view.cx += (t.cx - view.cx) * k;
      view.cy += (t.cy - view.cy) * k;
      // Zoom changes slowly (no pumping in and out), panning a little quicker.
      view.zoom += (t.zoom - view.zoom) * (1 - Math.exp(-C.ZOOM_SMOOTHING * dt));
      return { ...view, scroll };
    },
    getScroll() {
      return scroll;
    },
  };
}
