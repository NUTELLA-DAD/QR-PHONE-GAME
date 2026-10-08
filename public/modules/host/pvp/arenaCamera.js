// PvP arena camera (Phase V): ONE shared camera that frames BOTH ships (no split screen).
// It returns the same view shape camera.js returns - { cx, cy, zoom } in WORLD (map) coordinates - plus { minZoom, clipped }, so
// renderer.renderFrame(now, view, opts) takes it as it is.
//
//   const cam = createArenaCamera();
//   const view = cam.update(dt, ships, canvas.width, canvas.height, { pixelRatio });
//
// ships: [{ bounds: {x0,y0,x1,y1}, pose: { x, y }, offset: {dx,dy} }, ...]
//   bounds  the ship's layout bounds (SHIP_LAYOUT.bounds of that ship's own module copy)
//   pose    the ship's pose (pose.js): the renderer draws her art at (pose.x, pose.y)
//   offset  the same { dx, dy } given to renderFrame as opts.worldOffset (zero when both ships share one sky, as in the bridge)
// Zoom: fits both ships plus a margin, glides (out quicker than in), and is capped so a crew member never gets
// smaller than MIN_CREW_PX screen pixels. If the ships no longer fit at the cap, `clipped` is true (pvpArt then
// shows edge arrows for the ship that is off screen) and the view stays centred between them.
// Never throws: bad numbers fall back to the last good view.
import { config } from '../../../config.js';

const finite = (n, d = 0) => (Number.isFinite(n) ? n : d);

export function createArenaCamera() {
  const P = () => config.PVP_ART || {};
  const C = () => P().CAMERA || {};
  const K = () => config.CAMERA || {};
  let view = null;

  // The world box (A's frame) holding every ship, with the sky margin; also the biggest single ship (for the zoom-in limit).
  const frame = (ships) => {
    const c = C();
    const padY = finite(c.PAD_Y, 90);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, bigW = 1, bigH = 1;
    for (const s of ships || []) {
      const b = (s && s.bounds) || { x0: 0, x1: 1600, y0: 0, y1: 900 };
      const o = (s && s.offset) || { dx: 0, dy: 0 };
      const p = (s && s.pose) || { x: 0, y: 0 };
      const ax = finite(p.x) + finite(o.dx);
      const ay = finite(p.y) + finite(o.dy);
      x0 = Math.min(x0, b.x0 + ax); x1 = Math.max(x1, b.x1 + ax);
      y0 = Math.min(y0, b.y0 + ay - padY); y1 = Math.max(y1, b.y1 + ay + padY);
      bigW = Math.max(bigW, b.x1 - b.x0);
      bigH = Math.max(bigH, b.y1 - b.y0 + padY * 2);
    }
    if (!Number.isFinite(x0)) { x0 = 0; x1 = 1600; y0 = 0; y1 = 900; }
    return { x0: x0 - finite(c.MARGIN_X, 240), x1: x1 + finite(c.MARGIN_X, 240), y0: y0 - finite(c.MARGIN_Y, 120), y1: y1 + finite(c.MARGIN_Y, 120), bigW, bigH };
  };

  const target = (ships, width, height, pr) => {
    const c = C();
    const f = frame(ships);
    const spanW = Math.max(1, f.x1 - f.x0);
    const spanH = Math.max(1, f.y1 - f.y0);
    // the HUD panels cover the top of the screen (1600x900 stage): keep the ships below them
    const hud = (P() && P().HUD) || {};
    const top = Math.min(width / config.W, height / config.H) * (finite(hud.Y, 24) + finite(hud.H, 104) + 14);
    const fit = Math.min(width / spanW, Math.max(1, height - top) / spanH);
    // closest she may come: one ship fills the share of the screen the co-op camera gives her
    const maxZoom = Math.min(width / (f.bigW / finite(K().SHIP_SCREEN_FRACTION, 0.53)), height / f.bigH);
    // furthest out: a crew member stays this many screen pixels tall
    const minZoom = (finite(c.MIN_CREW_PX, 20) * pr) / Math.max(20, finite(c.CREW_H, 130));
    const zoom = Math.max(minZoom, Math.min(maxZoom, fit));
    return { cx: (f.x0 + f.x1) / 2, cy: (f.y0 + f.y1) / 2 - top / (2 * zoom), zoom, minZoom, clipped: fit < minZoom - 1e-6 };
  };

  return {
    update(dt, ships, width, height, opts = {}) {
      try {
        // (a minimised or hidden window can report zero size: keep the last view)
        if (!(width >= 10 && height >= 10)) return view ? { ...view } : { cx: 800, cy: 450, zoom: 0.3, minZoom: 0.15, clipped: false };
        const pr = finite(opts.pixelRatio, 1) || 1;
        const t = target(ships, width, height, pr);
        if (!view || !Number.isFinite(view.cx) || !Number.isFinite(view.cy) || !Number.isFinite(view.zoom) || view.zoom <= 0) view = { ...t };
        const c = C();
        dt = Math.max(0, Math.min(0.1, finite(dt)));
        const k = 1 - Math.exp(-finite(c.SMOOTHING, 2) * dt);
        view.cx += (t.cx - view.cx) * k;
        view.cy += (t.cy - view.cy) * k;
        const zr = t.zoom < view.zoom ? finite(c.ZOOM_OUT, 2) : finite(c.ZOOM_IN, 0.7); // out is quicker: never lose a ship off the edge
        view.zoom += (t.zoom - view.zoom) * (1 - Math.exp(-zr * dt));
        view.zoom = Math.max(t.minZoom, view.zoom); // (the hard cap holds even mid-glide)
        view.minZoom = t.minZoom;
        view.clipped = t.clipped;
        return { ...view };
      } catch (e) {
        return view ? { ...view } : { cx: 800, cy: 450, zoom: 0.3, minZoom: 0.15, clipped: false };
      }
    },
    reset() { view = null; },
  };
}
