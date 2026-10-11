// PORTHOLES: what the TV shows in round brass windows. Node-safe: no DOM, no drawing (portholeArt.js draws the rims, view3d/portholes.js or render.js the pictures). Two kinds:
//   EDGE portholes: a FRIENDLY plane (an escort, a stolen fighter the crew is flying, our team's planes in Versus) that has flown off screen gets a green-rimmed window pinned to the screen edge in its
//     direction, with a live close-up of it, its distance, and "x3" when several are together. Enemies are NOT here: they keep the edge arrows and the radar. The window appears when the plane is
//     ENTER_PX past the screen edge and goes when it is EXIT_PX back inside (so a plane hovering at the edge never flickers); it fades in and out in a few stepped shades (no smooth ramp).
//   The SPYGLASS: while somebody mans the lookout, a bigger lens at the top centre showing the sky far ahead (spyglass.js pans it): what it looks at is state.spy.cx / cy.
// plan({ view, w, h, dt, tier, mode3d }) -> { items, spy } where each item is { id, kind: 'edge' | 'spy', x, y, r (canvas px: its centre and radius), cx, cy, zoom (the world point at its middle and its scale),
//   a (0..1 stepped), ring ('friend' | 'spy'), label, sub, count, ang (the pointer notch), pic ('3d' | '2d': who draws the picture), marks (spyglass: what is in the lens) }.
import { config } from '../../config.js';
import { metres } from './pvp/range.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';
import { radarItems, SPOT_SIZE } from './spotter.js';
import { darkTarget } from './searchlight.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
export const kmText = (px) => { const m = metres(px); return m < 1000 ? m + ' m' : (m / 1000).toFixed(1) + ' km'; };
export const budgetFor = (tier) => { const B = config.PORTHOLES.BUDGET; return B[tier] == null ? B.medium : B[tier]; };

export function createPortholes({ state }) {
  const slots = new Map(); // id -> { id, item (the last drawn data), a (stepped 0..1), want, acc }
  const ids = new WeakMap();
  let nextId = 1;
  const keyOf = (o) => { let k = ids.get(o); if (!k) ids.set(o, (k = nextId++)); return k; };
  const off = new Set(); // friendly planes counted as "off screen" now (the hysteresis)

  // the friendly planes: { key, x, y, size, name }
  const friends = () => {
    const out = [];
    const main = mainShip(state);
    const team = main.team ? main.team.id : null;
    for (const sh of state.ships || []) {
      if (sh.ai) continue;
      const t = sh.team ? sh.team.id : null;
      if (t !== team) continue;
      const list = sh === main ? state.escorts || [] : (sh.ctx && sh.ctx.escorts) || [];
      for (const e of list) if (e && e.flying && Number.isFinite(e.x) && Number.isFinite(e.y)) out.push({ key: keyOf(e), x: e.x, y: e.y, size: 70, name: 'ESCORT' });
    }
    for (const h of state.hijacks || []) if (h && Number.isFinite(h.x) && Number.isFinite(h.y) && (h.hp == null || h.hp > 0)) out.push({ key: keyOf(h), x: h.x, y: h.y, size: 70, name: 'OUR FIGHTER' });
    return out;
  };

  const shown = (ctx) => !!ctx;
  const fadeStep = (s, dt) => { // stepped shades: a moves one shade at a time
    const P = config.PORTHOLES, step = P.FADE / P.FADE_STEPS;
    s.acc += dt;
    while (s.acc >= step) { s.acc -= step; s.a = s.a < s.want ? Math.min(s.want, s.a + 1 / P.FADE_STEPS) : s.a > s.want ? Math.max(s.want, s.a - 1 / P.FADE_STEPS) : s.a; }
    if (Math.abs(s.a - s.want) < 1e-6) s.a = s.want;
  };

  const plan = ({ view, w, h, dt = 0.016, tier = 'medium', mode3d = true } = {}) => {
    const P = config.PORTHOLES;
    const items = [];
    let spyItem = null;
    try {
      dt = clamp(dt, 0, 0.1);
      const live = P.ENABLED && view && Number.isFinite(view.zoom) && view.zoom > 0 && w > 50 && h > 50 && state.phase === 'flying' && !state.vote && !state.scorecard && !state.runEnd;
      const main = mainShip(state);
      const L = main.layout;
      const mx = toWorldX(main, L.midPoint.x), my = toWorldY(main, L.midPoint.y);
      const picFor = (budgeted) => (mode3d && tier !== 'low' && budgeted !== false ? '3d' : '2d');
      const wanted = new Map(); // id -> item
      if (live) {
        const N = budgetFor(tier);
        const R = Math.round(P.R * h), range = state.lookout ? P.RANGE_LOOKOUT : P.RANGE;
        // 1. which friends are off screen (with hysteresis)
        const cand = [];
        for (const f of friends()) {
          const sx = w / 2 + (f.x - view.cx) * view.zoom, sy = h / 2 + (f.y - view.cy) * view.zoom;
          const out = Math.max(-sx, sx - w, -sy, sy - h) - f.size * view.zoom * 0.5;
          const was = off.has(f.key);
          const isOff = was ? out > P.EXIT_PX : out > P.ENTER_PX;
          if (isOff && Math.hypot(f.x - mx, f.y - my) <= range) { off.add(f.key); cand.push({ ...f, sx, sy }); } else off.delete(f.key);
        }
        // 2. clusters: planes close together share one porthole
        const groups = [];
        for (const f of cand.sort((a, b) => a.key - b.key)) {
          let g = groups.find((q) => Math.hypot(q.x - f.x, q.y - f.y) < P.CLUSTER);
          if (!g) groups.push((g = { members: [], x: f.x, y: f.y }));
          g.members.push(f);
          g.x = g.members.reduce((a, m) => a + m.x, 0) / g.members.length;
          g.y = g.members.reduce((a, m) => a + m.y, 0) / g.members.length;
        }
        for (const g of groups) {
          const had = g.members.find((m) => slots.has('f' + m.key));
          g.id = 'f' + (had || g.members[0]).key;
          g.dist = Math.hypot(g.x - mx, g.y - my);
          g.extent = Math.max(...g.members.map((m) => Math.hypot(m.x - g.x, m.y - g.y) + m.size));
        }
        groups.sort((a, b) => (slots.has(a.id) && slots.get(a.id).want ? -1e6 : 0) + a.dist - ((slots.has(b.id) && slots.get(b.id).want ? -1e6 : 0) + b.dist));
        // 3. the budget, the place on the screen edge and the picture's scale
        const xmin = P.SAFE.SIDE * w + R, xmax = w - P.SAFE.SIDE * w - R, ymin = P.SAFE.TOP * h + R, ymax = h - P.SAFE.BOTTOM * h - R;
        const placed = [];
        for (const g of groups.slice(0, Math.max(0, N))) {
          const sx = w / 2 + (g.x - view.cx) * view.zoom, sy = h / 2 + (g.y - view.cy) * view.zoom;
          const q = { g, sx, sy, x: clamp(sx, xmin, xmax), y: clamp(sy, ymin, ymax) };
          const SC = config.SPYGLASS;
          if (SC.ENABLED && state.spy && state.spy.on) { // (keep clear of the spyglass and its plate)
            const sr = Math.round(SC.R * h), sxx = w * SC.X, bottom = SC.TOP * h + 2 * sr + 0.05 * h;
            if (Math.abs(q.x - sxx) < sr + R && q.y - R < bottom + P.GAP) q.y = clamp(bottom + P.GAP + R, ymin, ymax);
          }
          placed.push(q);
        }
        for (let it = 0; it < 4; it++) { // (push apart along the edge: nobody overlaps)
          for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
            const a = placed[i], b = placed[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), need = 2 * R + P.GAP;
            if (d >= need) continue;
            const tx = Math.abs(dx) >= Math.abs(dy) ? 0 : 1; // slide along the axis they differ least on
            if (tx === 0) b.y = clamp(b.y + (dy >= 0 ? 1 : -1) * (need - Math.abs(dy)) * 0.55 + (dy === 0 ? need * 0.5 : 0), ymin, ymax);
            else b.x = clamp(b.x + (dx >= 0 ? 1 : -1) * (need - Math.abs(dx)) * 0.55 + (dx === 0 ? need * 0.5 : 0), xmin, xmax);
          }
        }
        const ins = view.inset;
        for (const q of placed) {
          if (ins && q.x + R > ins.x && q.x - R < ins.x + ins.w && q.y + R > ins.y && q.y - R < ins.y + ins.h) continue; // (Versus: the far-ship porthole has that corner)
          const g = q.g;
          const n = g.members.length;
          const zoom = clamp((2 * R * 0.9) / (2 * g.extent + P.PAD), view.zoom * (n > 1 ? P.ZOOM.MIN_GROUP : P.ZOOM.MIN), view.zoom * P.ZOOM.MAX);
          wanted.set(g.id, {
            id: g.id, kind: 'edge', x: q.x, y: q.y, r: R, cx: g.x, cy: g.y, zoom, ring: 'friend', count: n,
            label: kmText(g.dist), sub: n > 1 ? 'x' + n : g.members[0].name, ang: Math.atan2(q.sy - q.y, q.sx - q.x), pic: picFor(),
          });
        }
        // 4. the lookout's spyglass
        const S = state.spy, C = config.SPYGLASS;
        if (C.ENABLED && S && S.on) {
          const r = Math.round(C.R * h), zoom = (2 * r) / C.VIEW_W, dark = darkTarget(state) > C.DARK;
          const marks = [];
          for (const it of radarItems(state)) {
            if (it.kind === 'ship') continue;
            const p = it.pos(), dx = (p.x - S.cx) * zoom, dy = (p.y - S.cy) * zoom;
            if (Math.hypot(dx, dy) > r * 1.02 || (dark && !(it.obj.lit > 0))) continue;
            marks.push({ dx, dy, kind: it.kind, spotted: it.obj.spotT > 0, prog: S.progOf ? S.progOf(it.obj) : 0 });
            if (marks.length >= 12) break;
          }
          const fwd = S.fwd || 0;
          wanted.set('spy', {
            id: 'spy', kind: 'spy', x: Math.round(w * C.X), y: Math.round(C.TOP * h + r), r, cx: S.cx, cy: S.cy, zoom, ring: 'spy', count: marks.length,
            label: (fwd >= 0 ? 'AHEAD ' : 'ASTERN ') + kmText(Math.abs(fwd)), sub: (S.name ? S.name + ' ON LOOKOUT' : 'LOOKOUT') + (S.spotted ? '  -  ' + S.spotted + ' SPOTTED' : ''),
            ang: 0, pic: mode3d && tier !== 'low' ? '3d' : '2d', marks, dark,
          });
        }
      }
      // 5. the fades: every id has a slot; a porthole that is wanted fades in, one that is not fades out (from its last picture)
      for (const [id, it] of wanted) {
        let s = slots.get(id);
        if (!s) slots.set(id, (s = { id, item: it, a: 0, want: 1, acc: 0 }));
        s.item = it; s.want = 1;
      }
      for (const [id, s] of slots) {
        if (!wanted.has(id)) s.want = 0;
        fadeStep(s, dt);
        if (s.want === 0 && s.a <= 0) { slots.delete(id); continue; }
        items.push({ ...s.item, a: s.a, leaving: s.want === 0 });
        if (s.item.kind === 'spy') spyItem = items[items.length - 1];
      }
      void shown;
    } catch (e) { /* never throw from planning: no porthole this frame */ }
    return { items, spy: spyItem };
  };

  const reset = () => { slots.clear(); off.clear(); };
  return { plan, reset };
}

// (kept for the checks: where a friendly at world (x, y) lands on a w x h screen for this view)
export const screenOf = (view, w, h, x, y) => ({ x: w / 2 + (x - view.cx) * view.zoom, y: h / 2 + (y - view.cy) * view.zoom });
void SPOT_SIZE;
