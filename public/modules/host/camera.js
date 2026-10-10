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
// VERSUS (config.CAMERA.VERSUS): the cap is much wider, and when even that cannot fit both ships the view SPLITS: the main view follows the ship nearer the middle of the sky and
// view.inset = { cx, cy, zoom, x, y, w, h, ship } (canvas pixels) is the porthole on the other one, which render.js draws.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';
import { creaturePoints } from './creatureSystem.js';

const C = config.CAMERA;
const PAD_Y = 90; // sky kept above and below the ship (world pixels)
const finite = (n, d = 0) => (Number.isFinite(n) ? n : d);

export function createWorldCamera() {
  let view = null;
  let rel = 0; // the smoothed centre, measured from the ships' middle
  const leads = new Map(); // look-ahead in the direction each ship is moving (smoothed): ship pose -> { x, y }

  // The ships to frame: opts.ships, or every ship of the game ([{ pose, bounds }]).
  const shipsOf = (state, opts) => (opts && opts.ships) || (state.ships || []).filter((s) => !s.ai).map((s) => ({ pose: s.pose, bounds: s.layout.bounds, ship: s })); // (the enemy gunship is framed as a threat below, not as one of the crew's ships)
  const versus = (state) => !!(state.match && state.match.on && config.PVP.ENABLED);
  const split = { on: false, primary: null }; // Versus: the view has split (the far ship is in the porthole); primary = the ship the main view follows
  let inset = null; // the porthole's own smoothed centre { cx, cy }

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

  const target = (state, ships, width, height, zoomMul = 1) => {
    const main = mainShip(state);
    const maxOut = versus(state) ? C.VERSUS.MAX_ZOOM_OUT : state.creature ? Math.max(C.MAX_ZOOM_OUT, C.CREATURE.MAX_ZOOM_OUT) : C.MAX_ZOOM_OUT; // (Versus: the arena is big: the widest view is much wider; a giant creature needs a wide view too)
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
    if (state.creature) { // a giant creature: its living parts are all kept in view (as far as the zoom cap allows)
      for (const e of creaturePoints(state)) {
        const m = e.r + C.CREATURE.MARGIN;
        x0 = Math.min(x0, e.x - m);
        x1 = Math.max(x1, e.x + m);
        y0 = Math.min(y0, e.y - m);
        y1 = Math.max(y1, e.y + m);
      }
    }
    for (const e of things) {
      x0 = Math.min(x0, e.x - C.ENEMY_MARGIN);
      x1 = Math.max(x1, e.x + C.ENEMY_MARGIN);
      y0 = Math.min(y0, e.y - C.ENEMY_MARGIN);
      y1 = Math.max(y1, e.y + C.ENEMY_MARGIN);
    }
    // Normal zoom: the biggest ship fills the allowed fraction of the width (and fits vertically).
    const baseZoom0 = Math.min(width / (bigW / C.SHIP_SCREEN_FRACTION), height / bigH);
    const baseZoom = baseZoom0 * zoomMul; // (the split's main view looks a little wider than the one ship's normal framing)
    const fitZoom = Math.min(width / (x1 - x0), height / (y1 - y0));
    const minZoom = baseZoom0 / maxOut;
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
    let cx = clampTo((x0 + x1) / 2, mx - halfW * keep, mx + halfW * keep);
    let cy = clampTo((y0 + y1) / 2, my - halfH * keep, my + halfH * keep);
    if (ships.length > 1 && shipsFit >= minZoom - 1e-6) {
      // (B.3: with several ships the middle staying in view is not enough: when the ships fit at all, EVERY ship stays whole on the screen, whatever far threats pull the box towards)
      cx = clampTo(cx, sx1 - halfW, sx0 + halfW);
      cy = clampTo(cy, sy1 - halfH, sy0 + halfH);
    }
    return { cx, cy, zoom, anchor: mx, minZoom, shipsFit, clipped: ships.length > 1 && shipsFit < minZoom - 1e-6 };
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
        let ships = shipsOf(state, opts);
        // Smoothly lead toward where each is heading.
        const kl = 1 - Math.exp(-C.LEAD_SMOOTHING * dt);
        for (const s of ships) {
          const l = leadOf(s);
          l.x += (finite(s.pose.vx) * C.LEAD_TIME - l.x) * kl;
          l.y += (finite(s.pose.vy) * C.LEAD_TIME * 0.8 - l.y) * kl;
        }
        let t = target(state, ships, width, height);
        // Versus, ships too far apart for the widest view: SPLIT. The main view follows the ship nearer the middle of the sky; the other is shown in the porthole (render.js drawInset).
        let far = null, reanchor = false;
        if (ships.length > 1 && versus(state)) {
          const V = C.VERSUS, was = split.on, wasPrimary = split.primary;
          if (!split.on && t.shipsFit < t.minZoom * V.ENTER) split.on = true;
          else if (split.on && t.shipsFit > t.minZoom * V.EXIT) split.on = false;
          if (split.on) {
            const w = state.match.wall;
            const mid = (s) => ({ x: s.pose.x + (spanOf(s)[0] + spanOf(s)[1]) / 2, y: s.pose.y + (s.bounds.y0 + s.bounds.y1) / 2 });
            const ax = w ? (w.x0 + w.x1) / 2 : ships.reduce((a, s) => a + mid(s).x, 0) / ships.length, ay = w ? (w.y0 + w.y1) / 2 : ships.reduce((a, s) => a + mid(s).y, 0) / ships.length;
            const away = (s) => Math.hypot(mid(s).x - ax, (mid(s).y - ay) * 1.4);
            const best = ships.slice().sort((a, b) => away(a) - away(b))[0];
            const keep = split.primary && ships.includes(split.primary) && away(split.primary) <= away(best) * 1.25 + 300; // (sticky: the view does not flip between the ships)
            split.primary = keep ? split.primary : best;
            far = ships.find((s) => s !== split.primary);
            ships = [split.primary];
            t = target(state, ships, width, height, V.FAR_ZOOM);
            t.clipped = true;
          }
          reanchor = was !== split.on || (split.on && wasPrimary !== split.primary);
        }
        // Start fresh if there's no view yet or it ever went bad.
        if (!view || !Number.isFinite(view.cx) || !Number.isFinite(view.cy) || !Number.isFinite(view.zoom) || view.zoom <= 0) {
          view = { cx: t.cx, cy: t.cy, zoom: t.zoom };
          rel = t.cx - t.anchor;
        } else if (reanchor) rel = view.cx - t.anchor; // (the framed ships changed: glide from where the view is, no jump)
        const k = 1 - Math.exp(-C.SMOOTHING * dt);
        // (The centre glides relative to the ships' middle, so a ship that flew on is not left behind and a jump of the course, a new mission, is no pan.)
        rel += (t.cx - t.anchor - rel) * k;
        view.cx = t.anchor + rel;
        view.cy += (t.cy - view.cy) * k;
        // Zoom changes slowly (no pumping in and out), panning a little quicker.
        const yd = state.yard; // (the Shipwright's Yard: while the crew builds at the dock the zoom holds, then she grows into the picture slowly after cast off)
        if (!ships.some((s) => s.pose.turn > 0) && !(yd && yd.hold)) view.zoom += (t.zoom - view.zoom) * (1 - Math.exp(-(yd && yd.pull > 0 ? C.PULL_SMOOTHING : C.ZOOM_SMOOTHING) * dt)); // (the zoom holds still while a ship comes about: no pumping while the picture is squashing)
        view.zoom = Math.max(t.minZoom, view.zoom); // (the cap holds even mid-glide)
        view.minZoom = t.minZoom;
        view.clipped = t.clipped;
        view.inset = null;
        if (far) { // the porthole on the far ship: its own centre (smoothed), zoomed so she fits
          const V = C.VERSUS.INSET, sp = spanOf(far), fx = far.pose.x + (sp[0] + sp[1]) / 2, fy = far.pose.y + (far.bounds.y0 + far.bounds.y1) / 2;
          const w = width * V.W, h = height * V.H;
          if (!inset || inset.ship !== far.ship) inset = { cx: fx, cy: fy, ship: far.ship };
          const ki = 1 - Math.exp(-V.SMOOTHING * dt);
          inset.cx += (fx - inset.cx) * ki;
          inset.cy += (fy - inset.cy) * ki;
          const fit = Math.min((w * 0.9) / Math.max(1, far.bounds.x1 - far.bounds.x0), (h * 0.85) / Math.max(1, far.bounds.y1 - far.bounds.y0 + 2 * PAD_Y));
          const zoom = Math.max(t.minZoom * 0.9, view.zoom / V.MAX_RATIO, Math.min(view.zoom * V.ZOOM, fit));
          view.inset = { cx: inset.cx, cy: inset.cy, zoom, x: V.LEFT ? width * V.X : width - w - width * V.X, y: height * V.Y, w, h, ship: far.ship };
        } else inset = null;
        return { ...view };
      } catch (e) {
        return view ? { ...view } : dflt(state);
      }
    },
  };
}

export const createCamera = createWorldCamera; // (the name main.js, buildTest.js and styleTest.js use)
