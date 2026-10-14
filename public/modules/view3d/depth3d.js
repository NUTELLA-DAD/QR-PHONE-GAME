// LOOP.md R3 / R5: THE DEPTH DIRECTOR. The 2D simulation has no depth and nothing here can be hit; this file only READS the game and tells the view what to stage far behind the play plane:
//   ctx.dest      the next stop on the horizon (landmarks3d.js): a lair's backdrop (volcano / storm crown / sea stacks) or the outpost the route points at
//   ctx.front     a weather front rolling in or away (fronts3d.js): a storm from the ROUTE (config.STORM.ZONES, the sim's own zones, with a lead before and a tail after), a blizzard or the Ember smoke from the
//                 sim's own number; f (0..1) is EASED toward its target, so a jump of the route becomes a roll of a few seconds
//   ctx.creature  the lair's giant circling far away before the fight (farCreature.js)
//   arrive        the ARRIVALS FROM DEPTH (createArrivals): the sim spawns a squadron, a bomber, a gunship, a boss or a bat swarm past the screen's edge; the view draws it far back in the depth first, at the edge of the picture,
//                 and brings it forward as the sim brings it in (flyers.js and index.js ask arrive.edge(obj, x) for a depth offset). The sim has no early hint (the pacing director picks the set piece at the moment of
//                 spawning), so the "approach ghost" is this: the real model, pushed back in depth while it is outside the picture. A supply balloon, which the sim places IN view, flies in from the depth over a couple of seconds.
// Everything it hands out is a function of the game's numbers and of the clock in held steps. No sine of the time; no random numbers. Never throws (the caller wraps it).
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
const D3 = () => config.DEPTH3D || {};

export function createArrivals() {
  const A = { on: false, stats: { pushed: 0, tracked: 0 } };
  let T = 0, camX = 0, hw = 1000, D = 4000, warm = 0, mapRef = null;
  const seen = new WeakMap(); // object -> { t0, live }
  // once a frame: t = the view's clock, camX = the look-at x, hw = half the picture's width at the play plane, D = the camera's distance, on = arrivals wanted this frame, map = the course's map (a new one starts a warm-up)
  A.begin = ({ t, camX: cx, hw: h, D: d, on, map }) => {
    T = t; camX = cx; hw = Math.max(200, h); D = Math.max(500, d);
    if (map !== mapRef) { mapRef = map; warm = t + 1.2; } // (what is there when a stop begins is not an arrival)
    const C = D3().ARRIVE || {};
    A.on = !!on && C.ENABLED !== false && D3().ENABLED !== false;
    A.stats.pushed = 0;
  };
  // The depth offset (<= 0, world units) of a thing at map x that the sim has just brought in from beyond the edge of the picture: how far back it must be to sit at the edge of the picture, so that it comes
  // forward as it comes in. 0 once it has been in the picture, or if it was already there when first seen, or after SECS seconds.
  A.edge = (obj, x) => {
    if (!A.on || !obj || !fin(x)) return 0;
    const C = D3().ARRIVE || {}, lim = hw * (C.EDGE || 0.92), dx = Math.abs(x - camX);
    let r = seen.get(obj);
    if (!r) { r = { t0: T, live: T >= warm && dx > lim }; seen.set(obj, r); A.stats.tracked++; }
    if (!r.live) return 0;
    if (dx <= lim || T - r.t0 > (C.SECS || 6)) { r.live = false; return 0; }
    A.stats.pushed++;
    return Math.max(D * (1 - dx / lim), -D * (C.MAXZ || 1.5));
  };
  // The balloon: it appears in view, so it flies in from the depth over SUPPLY seconds (linear, then a held end).
  A.time = (obj) => {
    if (!A.on || !obj) return 0;
    const C = D3().ARRIVE || {}, secs = C.SUPPLY || 2.2;
    let r = seen.get(obj);
    if (!r) { r = { t0: T, live: T >= warm }; seen.set(obj, r); }
    if (!r.live) return 0;
    const k = (T - r.t0) / secs;
    if (k >= 1) { r.live = false; return 0; }
    A.stats.pushed++;
    return -D * (C.SUPPLY_Z || 1.1) * (1 - k) * (1 - k);
  };
  return A;
}

const LAIR_DEST = { drake: 'volcano', thunderbird: 'stormcrown', kraken: 'tidehenge' };

export function createDepth({ state, world }) {
  const arrive = createArrivals();
  const ctx = { dest: null, front: null, creature: null };
  const fs = { storm: 0, blizzard: 0, smoke: 0, last: 'storm', side: 1 };
  const D = { arrive, ctx, stats: ctx };
  world.depthCtx = ctx;

  // the strength a storm front should have for a progress along the route p (the sim's zones; a lead before each, a tail after)
  const stormTarget = (c, w) => {
    const Z = (config.STORM && config.STORM.ZONES) || [], F = D3().FRONT || {}, lead = F.LEAD || 0.07, tail = F.TAIL || 0.05, p = fin(c.progress) ? c.progress : 0;
    let f = 0, side = 1;
    for (const z of Z) {
      if (c.lap < z.fromLap) continue;
      if (p >= z.from - lead && p < z.from) { const g = (p - (z.from - lead)) / lead; if (g > f) { f = g; side = 1; } }
      else if (p >= z.from && p <= z.to) { f = 1; side = 1; }
      else if (p > z.to && p < z.to + tail) { const g = 1 - (p - z.to) / tail; if (g > f) { f = g; side = -1; } }
    }
    const s = clamp(fin(w.storm) ? w.storm : 0, 0, 1);
    if (s > f) { f = s; side = 1; }
    return { f, side };
  };

  // Every frame, once, before anything is placed. cam = { visW, D }, target = the look-at point (3D), tier. Fills world.depthCtx.
  D.update = ({ t, dt, env, map, cam, target, tier, cave, versus }) => {
    const c = state.course, flying = state.phase === 'flying' && !versus;
    const off = D3().ENABLED === false || !flying || !c || !map;
    arrive.begin({ t, camX: target.x, hw: cam.visW / 2, D: cam.D, on: !off && !cave && !versus && !map.ring, map });
    ctx.dest = null; ctx.creature = null;
    if (off) { ctx.front = null; fs.storm = fs.blizzard = fs.smoke = 0; return ctx; }
    // ---- the destination and the lair's giant
    if (map.lair && map.goal && fin(map.goal.x)) {
      const kind = map.creature || 'kraken', over = state.bossDownLap === c.lap || c.done;
      ctx.dest = over ? null : { kind: LAIR_DEST[kind] || 'tidehenge', x: map.goal.x };
      if (!over && !state.creature) {
        const y = kind === 'kraken' ? -(fin(map.seaY) ? map.seaY : (map.goal.y || 0)) : kind === 'drake' ? -(fin(map.lavaY) ? map.lavaY : map.goal.y || 0) + 1250 : -(map.goal.y || 0) + 200;
        ctx.creature = { kind, x: map.goal.x, y };
      }
    } else if (map.open && !map.ring && c.target && !c.target.done && fin(c.target.x) && !c.done) {
      ctx.dest = { kind: 'fort', x: c.target.x };
    }
    // ---- the weather front: the strongest of the storm (from the route), the blizzard and the smoke, eased
    const w = state.weather || {}, E = state.env || {};
    const st = env === 'storm' ? { f: 0, side: 1 } : stormTarget(c, w);
    const rate = (D3().FRONT && D3().FRONT.EASE) || 0.35;
    const mv = (cur, to, r) => (cur < to ? Math.min(to, cur + r * dt) : Math.max(to, cur - r * dt));
    const prevStorm = fs.storm;
    fs.storm = mv(fs.storm, st.f, rate);
    fs.blizzard = mv(fs.blizzard, env === 'frost' ? clamp(fin(E.blizzard) ? E.blizzard : 0, 0, 1) : 0, 0.7);
    fs.smoke = mv(fs.smoke, env === 'ember' ? clamp(fin(E.smoke) ? E.smoke : 0, 0, 1) : 0, 0.7);
    let kind = 'storm', f = fs.storm;
    if (fs.blizzard > f) { kind = 'blizzard'; f = fs.blizzard; }
    if (fs.smoke > f) { kind = 'smoke'; f = fs.smoke; }
    if (kind === 'storm') fs.side = fs.storm > prevStorm + 1e-5 ? 1 : fs.storm < prevStorm - 1e-5 ? -1 : fs.side; // (coming or going)
    else fs.side = 1;
    ctx.front = f > 0.012 && !cave ? { kind, f, side: fs.side } : null;
    return ctx;
  };
  return D;
}
