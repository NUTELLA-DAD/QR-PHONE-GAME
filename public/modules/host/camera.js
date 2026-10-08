// Camera: decides which part of the world is on screen. The world is in MAP coordinates (M.1): the view is { cx, cy, zoom } in the same
// coordinates as every shell, plane and rock, and each ship is where her pose says she is.
//
// It frames EVERY ship it is given ([{ pose, bounds }]: state.ships in the game, so co-op has just ours, and a second ship (Versus, B.2/B.7)
// is framed the same way with no new code). It always keeps the biggest ship at no more than CAMERA.SHIP_SCREEN_FRACTION of the screen width,
// and zooms out / pans to also frame the near threats and a gunship alongside, gliding smoothly. With one ship it frames her exactly as the
// old fixed-ship camera did (the smoothing is done relative to the ships' middle, so it does not lag a moving ship).
//
// The zoom never goes out further than baseZoom / CAMERA.MAX_ZOOM_OUT (the cap). If the SHIPS themselves do not fit at the cap, view.clipped is
// true and the view stays centred between them (the PvP edge arrows read it; threats that do not fit just get the lookout's arrows).
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';

const C = config.CAMERA;
const PAD_Y = 90; // sky kept above and below the ship (world pixels)
const finite = (n, d = 0) => (Number.isFinite(n) ? n : d);

export function createWorldCamera() {
  let view = null;
  let rel = 0; // the smoothed centre, measured from the ships' middle
  const leads = new Map(); // look-ahead in the direction each ship is moving (smoothed): ship pose -> { x, y }

  // The ships to frame: opts.ships, or every ship of the game ([{ pose, bounds }]).
  const shipsOf = (state, opts) => (opts && opts.ships) || (state.ships || []).map((s) => ({ pose: s.pose, bounds: s.layout.bounds }));

  // Where a ship's drawing is along the world, as [x0, x1] relative to pose.x: her bounds, or those mirrored about her middle while she faces left (a ship's hull
  // stays where it is when she comes about: pose.js mirrors about the middle of the same bounds).
  const spanOf = (s) => {
    const b = s.bounds;
    if (s.pose.f === 1) return [b.x0, b.x1];
    const pv = (b.x0 + b.x1) / 2;
    return [2 * pv - b.x1, 2 * pv - b.x0];
  };

  const leadOf = (s) => {
    let l = leads.get(s.pose);
    if (!l) leads.set(s.pose, (l = { x: 0, y: 0 }));
    return l;
  };

  const target = (state, ships, width, height) => {
    const main = mainShip(state);
    // The box round every ship (with the sky margin and a look-ahead the way each is moving).
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    // (and the same box without the look-ahead, for the middle and for "do the ships fit")
    let sx0 = Infinity, sx1 = -Infinity, sy0 = Infinity, sy1 = -Infinity, bigW = 1, bigH = 1;
    for (const s of ships) {
      const b = s.bounds, p = s.pose, ld = leadOf(s), [bx0, bx1] = spanOf(s);
      x0 = Math.min(x0, p.x + bx0 + Math.min(0, ld.x));
      x1 = Math.max(x1, p.x + bx1 + Math.max(0, ld.x));
      y0 = Math.min(y0, p.y + b.y0 - PAD_Y + Math.min(0, ld.y));
      y1 = Math.max(y1, p.y + b.y1 + PAD_Y + Math.max(0, ld.y));
      sx0 = Math.min(sx0, p.x + bx0);
      sx1 = Math.max(sx1, p.x + bx1);
      sy0 = Math.min(sy0, p.y + b.y0 - PAD_Y);
      sy1 = Math.max(sy1, p.y + b.y1 + PAD_Y);
      bigW = Math.max(bigW, b.x1 - b.x0);
      bigH = Math.max(bigH, b.y1 - b.y0 + PAD_Y * 2);
    }
    // Frame threats that are actually close (farther ones get arrows at the screen edge instead).
    const near = (t, r) => ships.some((s) => Math.hypot((t.x - (s.pose.x + (s.bounds.x0 + s.bounds.x1) / 2)) * 0.8, t.y - (s.pose.y + (s.bounds.y0 + s.bounds.y1) / 2)) < r); // (the middle of the bounds is the mirror's pivot: it is the same whichever way she faces)
    const things = [];
    if (state.enemy.dead <= 0 && near(state.enemy, C.FRAME_RANGE)) things.push(state.enemy);
    for (const t of [...(state.mines || []), ...(state.bombers || [])]) if (near(t, C.FRAME_RANGE)) things.push(t);
    if (state.boss && near(state.boss, C.FRAME_RANGE + 600)) things.push(state.boss);
    for (const t of state.hijacks || []) if (near(t, C.FRAME_RANGE + 600)) things.push(t); // a stolen plane stays in view
    for (const t of state.specials ? [...state.specials.snipers, ...state.specials.tugs] : []) if (near(t, C.FRAME_RANGE + 400)) things.push(t);
    if (state.supply && state.course) things.push({ x: state.supply.mx, y: state.supply.my });
    if (state.gunship) { // (she stays an offset from our ship: converted through her pose; far off on her way in she is only an edge arrow)
      const L = main.layout, gd = Math.min(state.gunship.dx, 1300);
      things.push({ x: toWorldX(main, L.bounds.x1 + 790 + gd), y: toWorldY(main, L.refPoint.y + state.gunship.dy) }, { x: toWorldX(main, L.bounds.x1 + 1490 + gd), y: toWorldY(main, L.refPoint.y - 200 + state.gunship.dy) });
    }
    for (const e of things) {
      x0 = Math.min(x0, e.x - C.ENEMY_MARGIN);
      x1 = Math.max(x1, e.x + C.ENEMY_MARGIN);
      y0 = Math.min(y0, e.y - C.ENEMY_MARGIN);
      y1 = Math.max(y1, e.y + C.ENEMY_MARGIN);
    }
    // Normal zoom: the biggest ship fills the allowed fraction of the width (and fits vertically).
    const baseZoom = Math.min(width / (bigW / C.SHIP_SCREEN_FRACTION), height / bigH);
    const fitZoom = Math.min(width / (x1 - x0), height / (y1 - y0));
    const minZoom = baseZoom / C.MAX_ZOOM_OUT;
    const zoom = Math.max(minZoom, Math.min(baseZoom, fitZoom));
    const shipsFit = Math.min(width / (sx1 - sx0), height / (sy1 - sy0));
    // Centre on the framed box, but never let the ships slide off screen.
    const halfW = width / 2 / zoom;
    const halfH = height / 2 / zoom;
    const clampTo = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    // (The ships' middle always stays within the middle half of the screen.)
    const keep = C.SHIP_KEEP_IN;
    const mx = (sx0 + sx1) / 2;
    const my = (sy0 + sy1) / 2; // (the sky padding is the same above and below, so this is the middle of the ships themselves)
    const cx = clampTo((x0 + x1) / 2, mx - halfW * keep, mx + halfW * keep);
    const cy = clampTo((y0 + y1) / 2, my - halfH * keep, my + halfH * keep);
    return { cx, cy, zoom, anchor: mx, minZoom, clipped: ships.length > 1 && shipsFit < minZoom - 1e-6 };
  };

  const dflt = (state) => {
    const m = state.ships && state.ships[0];
    return { cx: (m ? m.pose.x : 0) + 800, cy: 450, zoom: 0.3, minZoom: 0.15, clipped: false };
  };

  return {
    // opts.ships overrides which ships are framed (pose + bounds); everything else is read from the game state.
    update(dt, state, width, height, opts = {}) {
      // A minimised or hidden window can report zero size; keep the last view until it's back.
      if (width < 10 || height < 10) return view ? { ...view, cx: view.cx } : dflt(state);
      try {
        const ships = shipsOf(state, opts);
        // Smoothly lead toward where each is heading.
        const kl = 1 - Math.exp(-C.LEAD_SMOOTHING * dt);
        for (const s of ships) {
          const l = leadOf(s);
          l.x += (finite(s.pose.vx) * C.LEAD_TIME - l.x) * kl;
          l.y += (finite(s.pose.vy) * C.LEAD_TIME * 0.8 - l.y) * kl;
        }
        const t = target(state, ships, width, height);
        // Start fresh if there's no view yet or it ever went bad.
        if (!view || !Number.isFinite(view.cx) || !Number.isFinite(view.cy) || !Number.isFinite(view.zoom) || view.zoom <= 0) {
          view = { cx: t.cx, cy: t.cy, zoom: t.zoom };
          rel = t.cx - t.anchor;
        }
        const k = 1 - Math.exp(-C.SMOOTHING * dt);
        // (The centre glides relative to the ships' middle, so a ship that flew on is not left behind and a jump of the course, a new mission, is no pan.)
        rel += (t.cx - t.anchor - rel) * k;
        view.cx = t.anchor + rel;
        view.cy += (t.cy - view.cy) * k;
        // Zoom changes slowly (no pumping in and out), panning a little quicker.
        if (!ships.some((s) => s.pose.turn > 0)) view.zoom += (t.zoom - view.zoom) * (1 - Math.exp(-C.ZOOM_SMOOTHING * dt)); // (the zoom holds still while a ship comes about: no pumping while the picture is squashing)
        view.zoom = Math.max(t.minZoom, view.zoom); // (the cap holds even mid-glide)
        view.minZoom = t.minZoom;
        view.clipped = t.clipped;
        return { ...view };
      } catch (e) {
        return view ? { ...view } : dflt(state);
      }
    },
  };
}

export const createCamera = createWorldCamera; // (the name main.js, buildTest.js and styleTest.js use)
