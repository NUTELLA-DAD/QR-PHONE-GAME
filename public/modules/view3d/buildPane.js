// WP13 (3D.md section 17): the build page's LIVE PANE in 3D. buildtest.html / host/buildTest.js mount this when the owner switches "3D" on.
//   createBuildPane({ container, state, pixelScale, tod }) -> pane   (throws when WebGL is not there: the page stays in 2D)
//   pane.frame(now, dt, state)   draw one frame of the flying ship being built (the page's own simulation; `state` may be a NEW simulation after every edit: the view follows it)
//   pane.setTod('day' | 'dusk' | 'night'), pane.resetView(), pane.setMarkers(spec), pane.request(ghost spec), pane.showMarkers(bool), pane.showGhost(bool), pane.setNote(text), pane.stats(), pane.dispose()
// It is the SAME 3D view the real game uses (index.js createView3D), with: orbit on (drag to turn the ship, wheel to zoom, double-click for the side view; never any roll), a pinned time of day, lamps
// that sweep by themselves at night (nobody is manning them here), no cinematics, and the build page's extras on top (buildStage.js: the ghost of the part being dragged, the balance markers).
// The page's simulation restarts after every edit (a fresh state object each time); the view reads its state through a forwarding proxy, so it is made once and just follows the new one. The ship's
// model is rebuilt by the view itself when the layout version changes. The quality tier follows the game's performance governor (host/perf.js), starting at Medium: Low on weak machines.
import { createView3D } from './index.js';
import { createBuildStage } from './buildStage.js';
import { createPerfGovernor, perfState } from '../host/perf.js';
import { config } from '../../config.js';

const B3 = () => config.BUILD3D;

// The 2D camera's kind of view ({ cx, cy, zoom }, what the 3D camera starts from) that frames the whole ship in the pane: her bounds (hull, bag and masts) with a margin. The game's follow camera is not used:
// it frames what the crew need (threats, look-ahead), the build page only wants the ship, as big as the pane allows.
function fitView(st, w, h) {
  const sh = st.ships && st.ships[0];
  if (!sh || !sh.layout || !sh.layout.bounds) return { cx: 800, cy: 400, zoom: 0.5 };
  const b = sh.layout.bounds, p = sh.pose, bw = b.x1 - b.x0 + 220, bh = b.y1 - b.y0 + 220;
  const z = Math.min(w / bw, h / bh);
  return { cx: p.x + (b.x0 + b.x1) / 2, cy: p.y + (b.y0 + b.y1) / 2, zoom: Number.isFinite(z) && z > 0 ? z : 0.5 };
}

export function createBuildPane({ container, state, pixelScale = () => 1, tod = B3().TOD_DEFAULT }) {
  const canvas = document.createElement('canvas'); // (a fresh canvas each time: a canvas whose WebGL context was released cannot get a new one)
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  container.appendChild(canvas);
  const note = document.createElement('div');
  note.style.cssText = 'position:absolute;left:10px;top:10px;right:10px;display:none;padding:6px 10px;background:rgba(243,234,214,.94);border:2px solid var(--stamp,#a8443f);border-radius:8px;color:var(--stamp,#a8443f);font:700 13px var(--text,Georgia);pointer-events:none;z-index:2';
  container.appendChild(note);

  // the view reads the game's state through this proxy; swapping `holder.s` points it at the next simulation (the page makes a new one after every edit)
  const holder = { s: state };
  const proxy = new Proxy({}, {
    get: (_, k) => holder.s[k],
    set: (_, k, v) => { holder.s[k] = v; return true; },
    has: (_, k) => k in holder.s,
    deleteProperty: (_, k) => delete holder.s[k],
    ownKeys: () => Reflect.ownKeys(holder.s),
    getOwnPropertyDescriptor: (_, k) => { const d = Reflect.getOwnPropertyDescriptor(holder.s, k); if (d) d.configurable = true; return d; },
  });

  const savedLevel = perfState.level;
  let saved = null;
  try { saved = localStorage.getItem('airshipDetail'); } catch { /* (no storage) */ }
  const gov = createPerfGovernor();
  if (!saved || saved === 'auto') perfState.level = Math.min(perfState.level, 2); // (the build page starts at Medium and climbs if the machine is quick)

  const S = {
    allowOrbit: true, orbit: true, orbitSide: true, // orbit is always on; it starts from the side view (see index.js syncCamera)
    sweep: true, cine: false, lift: 0,
    tod,
    get detail() { return perfState.level >= 2 ? 'high' : 'low'; },
    get tier() { return perfState.level >= 3 ? 'high' : perfState.level >= 1 ? 'medium' : 'low'; },
    pixelRatio: () => Math.min(2, window.devicePixelRatio || 1) * Math.max(0.5, pixelScale()),
  };
  let view;
  try { view = createView3D({ canvas, state: proxy, settings: S }); } catch (e) { canvas.remove(); note.remove(); perfState.level = savedLevel; throw e; } // (no WebGL: leave nothing behind)
  if (view.controls) {
    const c = view.controls;
    c.enablePan = false;
    c.minDistance = B3().MIN_DIST;
    c.maxDistance = B3().MAX_DIST;
    c.zoomSpeed = 0.9;
  }
  const stage = createBuildStage(view);
  const onDbl = () => { S.orbit = true; view.resetOrbit(); };
  canvas.addEventListener('dblclick', onDbl);

  let last = 0, ms = 16.7, frames = 0, errors = 0, lastErr = '', rebuilds = 0, rebuildMs = 0, rebuildMax = 0;
  const pane = {
    canvas, view, stage, S, container,
    get ready() { return frames > 0; },
    frame(now, dt, st) {
      if (st && st !== holder.s) holder.s = st; // (the page made a new simulation)
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 8 || h < 8) return false;
      try {
        const cam = fitView(holder.s, w, h);
        stage.update(performance.now());
        const t0 = performance.now(), m0 = view.models.values().next().value;
        view.renderFrame(now, cam, { width: w, height: h, t: now / 1000 });
        const took = performance.now() - t0, m1 = view.models.values().next().value;
        if (m0 && m1 && m0.model !== m1.model) { rebuilds++; rebuildMs = took; rebuildMax = Math.max(rebuildMax, took); } // (the ship's model was rebuilt this frame: the layout changed)
        frames++;
        const gap = last ? now - last : 16.7;
        last = now;
        ms += (gap - ms) * 0.05;
        const s = view.stats();
        gov.update(now, gap, (s.jsMs || 0) + (s.renderMs || 0));
        return true;
      } catch (e) {
        errors++;
        const m = String(e && e.stack ? e.stack : e);
        if (m !== lastErr) { lastErr = m; console.warn('buildPane', m.slice(0, 400)); }
        return false;
      }
    },
    setTod(name) { S.tod = B3().TIMES.includes(name) ? name : B3().TOD_DEFAULT; },
    getTod: () => S.tod,
    resetView() { S.orbit = true; view.resetOrbit(); },
    setMarkers: (spec) => stage.setMarkers(spec),
    showMarkers: (on) => stage.showMarkers(on),
    showGhost: (on) => stage.showGhost(on),
    request: (spec) => stage.request(spec),
    setNote(text) { note.textContent = text || ''; note.style.display = text ? 'block' : 'none'; },
    stats() { const s = view.stats(); return { ...s, fps: 1000 / Math.max(1, ms), frames, errors, rebuilds, rebuildMs, rebuildMax, level: perfState.level, stage: { ...stage.stats } }; },
    dispose() {
      try { canvas.removeEventListener('dblclick', onDbl); stage.dispose(); if (view.controls) view.controls.dispose(); view.dispose(); view.renderer.forceContextLoss(); } catch { /* (gone already) */ }
      canvas.remove(); note.remove();
      perfState.level = savedLevel;
    },
  };
  return pane;
}
