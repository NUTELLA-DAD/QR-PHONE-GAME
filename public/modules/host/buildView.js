// The build page's blueprint view: ZOOM and PAN on top of blueprintArt.js blueprintView (which fits the whole sheet to the pane).
//   const view = createBpView();
//   bv = view.apply(blueprintView(...))     the same transform, zoomed and moved (X, Y, toWorld, s, ox, oy); everything that hit-tests through bv.toWorld / bv.s works at any zoom
//   view.zoomAt(px, py, factor) / view.pan(dx, dy) / view.fit(layout) / view.reset()    (px, py, dx, dy: paper pixels, i.e. canvas pixels)
//   attachPanZoom(canvas, view, hooks)       the mouse wheel zooms at the pointer; a middle- or right-button drag, or SPACE + drag, pans; two fingers pinch and pan; + - 0 keys
// Pan and pinch listen in the CAPTURE phase and stop the event there, so the pencil / eraser / drag-drop handlers of buildTest.js never see a pan. A right-button press that moved less than
// PAN_TAP is still a right-click (it deletes the thing under it, as before). Numbers: config.BUILD_VIEW. No game state; the only DOM is the canvas it is given.
import { config } from '../../config.js';

const V = () => config.BUILD_VIEW;

export function createBpView() {
  let z = 1, px = 0, py = 0; // paper = base(world) * z + (px, py)
  let base = null; // the unzoomed view of the last apply (the fit and the zoom read it)
  const clampZ = (v) => Math.max(V().ZOOM_MIN, Math.min(V().ZOOM_MAX, v));
  const view = {
    get z() { return z; },
    get px() { return px; },
    get py() { return py; },
    set(nz, nx, ny) { z = clampZ(nz); px = nx; py = ny; },
    reset() { z = 1; px = 0; py = 0; },
    apply(bv) {
      base = bv;
      const s = bv.s * z, ox = bv.ox * z + px, oy = bv.oy * z + py;
      return { ...bv, s, ox, oy, X: (x) => ox + x * s, Y: (y) => oy + y * s, toWorld: (qx, qy) => ({ x: (qx - ox) / s, y: (qy - oy) / s }), zoom: z };
    },
    zoomAt(cx, cy, factor) { // keep the paper point (cx, cy) where it is
      const z2 = clampZ(z * factor), r = z2 / z;
      px = cx - (cx - px) * r;
      py = cy - (cy - py) * r;
      z = z2;
    },
    pan(dx, dy) { px += dx; py += dy; },
    // Frame the ship (her collision bounds and the gasbags) in the pane with FIT_MARGIN screen pixels of paper round her.
    fit(layout) {
      if (!base || !layout) return false;
      const b = layout.bounds;
      if (!b || !(b.x1 > b.x0)) { view.reset(); return false; }
      let x0 = b.x0, x1 = b.x1, y0 = b.y0, y1 = b.y1;
      for (const g of layout.gasbags || []) { x0 = Math.min(x0, g.cx - g.rx); x1 = Math.max(x1, g.cx + g.rx); y0 = Math.min(y0, g.cy - g.ry); }
      const m = V().FIT_MARGIN * base.k;
      const bx0 = base.ox + x0 * base.s, bx1 = base.ox + x1 * base.s, by0 = base.oy + y0 * base.s, by1 = base.oy + y1 * base.s;
      const nz = clampZ(Math.min((base.w - 2 * m) / (bx1 - bx0), (base.h - 2 * m) / (by1 - by0)));
      z = nz;
      px = base.w / 2 - ((bx0 + bx1) / 2) * nz;
      py = base.h / 2 - ((by0 + by1) / 2) * nz;
      return true;
    },
  };
  return view;
}

// hooks: { paperPoint(e) -> { x, y } in canvas pixels, cancelStroke() (a stroke / drag in progress is dropped when a pinch starts), blockWheel() -> true to leave the wheel alone, changed() }
export function attachPanZoom(canvas, view, hooks) {
  let space = false;
  let pan = null; // { id, x, y (client), moved, button }
  let tapped = false; // the last right-button press moved: its contextmenu is not a right-click
  const touches = new Map(); // pointerId -> { x, y } (paper pixels)
  let pinch = null; // { z0, px0, py0, d0, m0 }
  const typing = (e) => /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '');
  const stop = (e) => { e.stopImmediatePropagation(); };
  const cursor = (c) => { canvas.style.cursor = c; };
  const mid = () => { const q = [...touches.values()]; return { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2, d: Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y) || 1 }; };

  canvas.addEventListener('wheel', (e) => {
    if (hooks.blockWheel && hooks.blockWheel()) return;
    e.preventDefault();
    const p = hooks.paperPoint(e), unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    view.zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * V().WHEEL_RATE));
    if (hooks.changed) hooks.changed();
  }, { passive: false });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') {
      touches.set(e.pointerId, hooks.paperPoint(e));
      if (touches.size === 2) { // two fingers: pinch and pan
        hooks.cancelStroke();
        const m = mid();
        pinch = { z0: view.z, px0: view.px, py0: view.py, d0: m.d, m0: m };
        for (const id of touches.keys()) { try { canvas.setPointerCapture(id); } catch { /* (the pointer is gone) */ } }
      }
      if (touches.size >= 2) { e.preventDefault(); stop(e); }
      return;
    }
    const mouse = e.button === 1 || e.button === 2 || (e.button === 0 && space);
    if (!mouse) return;
    e.preventDefault();
    stop(e);
    canvas.setPointerCapture(e.pointerId);
    pan = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button };
    tapped = false;
    cursor('grabbing');
  }, true);

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, hooks.paperPoint(e));
      if (touches.size >= 2) {
        stop(e);
        if (!pinch) return;
        const m = mid(), nz = pinch.z0 * (m.d / pinch.d0), r = Math.max(V().ZOOM_MIN, Math.min(V().ZOOM_MAX, nz)) / pinch.z0;
        view.set(nz, m.x - (pinch.m0.x - pinch.px0) * r, m.y - (pinch.m0.y - pinch.py0) * r);
        if (hooks.changed) hooks.changed();
      }
      return;
    }
    if (!pan || pan.id !== e.pointerId) return;
    stop(e);
    if (!pan.moved && Math.hypot(e.clientX - pan.x, e.clientY - pan.y) < V().PAN_TAP) return;
    pan.moved = true;
    const a = hooks.paperPoint({ clientX: pan.x, clientY: pan.y }), b = hooks.paperPoint(e);
    view.pan(b.x - a.x, b.y - a.y);
    pan.x = e.clientX;
    pan.y = e.clientY;
    if (hooks.changed) hooks.changed();
  }, true);

  const up = (e) => {
    if (e.pointerType === 'touch') {
      const had = touches.size >= 2;
      touches.delete(e.pointerId);
      if (touches.size < 2) pinch = null;
      if (had) { stop(e); if (touches.size === 1) hooks.cancelStroke(); } // (the finger left behind starts nothing)
      return;
    }
    if (!pan || pan.id !== e.pointerId) return;
    stop(e);
    tapped = pan.button === 2 && pan.moved;
    pan = null;
    cursor(space ? 'grab' : 'crosshair');
  };
  canvas.addEventListener('pointerup', up, true);
  canvas.addEventListener('pointercancel', up, true);
  canvas.addEventListener('contextmenu', (e) => { // (a right-button drag that panned is not a right-click)
    if (tapped || (pan && pan.moved)) { e.preventDefault(); stop(e); tapped = false; }
  }, true);

  let over = false; // the pointer is over the paper: SPACE belongs to the pan only then (and a focused button gives its focus up, so space does not click it)
  canvas.addEventListener('pointerenter', () => { over = true; const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  canvas.addEventListener('pointerleave', () => { over = false; });
  addEventListener('keydown', (e) => {
    if (typing(e) || e.ctrlKey || e.metaKey) return;
    if (e.key === ' ') { if (!over) return; e.preventDefault(); if (!space) { space = true; cursor('grab'); } return; }
    const c = canvas.getBoundingClientRect();
    if (e.key === '+' || e.key === '=') { view.zoomAt(canvas.width / 2, canvas.height / 2, V().ZOOM_STEP); if (hooks.changed) hooks.changed(); }
    else if (e.key === '-' || e.key === '_') { view.zoomAt(canvas.width / 2, canvas.height / 2, 1 / V().ZOOM_STEP); if (hooks.changed) hooks.changed(); }
    else if (e.key === '0' && c.width) { view.reset(); if (hooks.changed) hooks.changed(); }
  });
  addEventListener('keyup', (e) => { if (e.key === ' ') { space = false; if (!pan) cursor('crosshair'); } });
  addEventListener('blur', () => { space = false; });
  return { spaceDown: () => space, panning: () => !!pan, pinching: () => !!pinch };
}
