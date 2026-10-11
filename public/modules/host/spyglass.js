// THE LOOKOUT'S SPYGLASS (simulation side). While somebody mans the lookout (the crow's nest) a round lens hangs at the top of the TV and shows the sky FAR AHEAD of the ship (portholes.js plans it,
// portholeArt.js frames it, view3d/portholes.js or render.js draw the picture). The lookout's phone stick PANS it: the lens centre eases after a target point that the stick moves (a critically damped
// follow, so it never overshoots or wobbles), within a range: SPYGLASS.AHEAD_MAX ahead, BEHIND astern, UP / DOWN above and below the ship. Whatever stays inside the lens for SEEN_T seconds is
// SPOTTED, exactly as if the lookout had tapped its ping on the phone radar (spotter.js markSpot): the TV marks it, shells hurt it more, the helm answers faster, the phone pings.
// A bot lookout pans toward the nearest unspotted threat ahead (config.SPYGLASS.BOTS) and spots it the same way. In a dark sky only what a searchlight holds can be seen.
// state.spy is the TV's view of all this: { on, who, bot, cx, cy (the world point at the lens' middle), fwd, up, f, seen, ... }. No random numbers are drawn here, and nothing but spotting reaches the
// simulation, so with SPYGLASS.BOTS off (tools/botsim.mjs) a run is byte for byte what it was.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';
import { radarItems, SPOT_SIZE } from './spotter.js';
import { darkTarget } from './searchlight.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);

// A critically damped follow (never overshoots): moves `cur` toward `tgt` with the velocity kept in `vel.v`; `st` is about how long it takes to settle.
export function smoothDamp(cur, tgt, vel, st, dt) {
  const o = 2 / Math.max(0.0001, st), x = o * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = cur - tgt;
  const temp = (vel.v + o * ch) * dt;
  vel.v = (vel.v - o * temp) * e;
  let out = tgt + (ch + temp) * e;
  if ((tgt - cur > 0) === (out > tgt)) { out = tgt; vel.v = 0; } // (never past the goal)
  return out;
}

export function createSpyglass({ state, spotter }) {
  const SG = () => config.SPYGLASS;
  const S = (state.spy = { on: false, who: null, name: '', bot: false, fwd: 0, up: 0, tfwd: 0, tup: 0, ox: 0, oy: 0, f: 1, cx: 0, cy: 0, mx: 0, my: 0, seen: 0, spotted: 0, idle: 99, t: 0 });
  const vx = { v: 0 }, vy = { v: 0 };
  const seenT = new Map(); // obj -> seconds it has been inside the lens
  S.progOf = (obj) => clamp((seenT.get(obj) || 0) / SG().SEEN_T, 0, 1); // (the TV draws a filling ring on a target that is being made out)
  let tick = 0, botGoal = null;

  // the lookout: a human first, else a bot (bots only when SPYGLASS.BOTS)
  const lookoutOf = (ship) => {
    let best = null;
    for (const p of Object.values(state.players)) {
      if (!p.lock || p.connected === false || p.ko > 0 || p.mate) continue;
      if (ship.layout.kindOf(p.lock) !== 'lookout') continue;
      if (p.bot && !SG().BOTS) { best = best || null; continue; }
      if (!best || (best.bot && !p.bot)) best = p;
    }
    return best;
  };

  const placeCentre = (ship) => {
    const L = ship.layout;
    S.mx = toWorldX(ship, L.midPoint.x);
    S.my = toWorldY(ship, L.midPoint.y);
    S.f = ship.pose.f || 1;
    S.cx = S.mx + S.ox;
    S.cy = S.my + S.oy;
  };

  const off = () => {
    if (S.on) { S.on = false; S.who = null; S.name = ''; S.seen = 0; seenT.clear(); botGoal = null; }
    S.idle = Math.min(99, S.idle + 1 / 60);
  };

  const update = (dt) => {
    const C = SG();
    try {
      const ship = mainShip(state);
      const alone = state.ships.filter((s) => !s.ai).length <= 1 && !(state.match && state.match.on);
      const flying = state.phase === 'flying' && !state.vote && !state.scorecard && !state.runEnd && !ship.state.down && !ship.ai;
      const p = C.ENABLED && alone && flying ? lookoutOf(ship) : null;
      if (!p) { S.t += dt; off(); if (S.idle > C.RECENTRE_AFTER) { S.tfwd = C.AHEAD; S.tup = 0; S.fwd = C.AHEAD; S.up = 0; vx.v = vy.v = 0; S.ox = (ship.pose.f || 1) * C.AHEAD; S.oy = 0; } placeCentre(ship); return; }
      if (!S.on) { // somebody just climbed up: the spyglass starts where it was left, or ahead if it has been a while
        S.on = true;
        if (S.idle > C.RECENTRE_AFTER) { S.tfwd = S.fwd = C.AHEAD; S.tup = S.up = 0; S.ox = (ship.pose.f || 1) * C.AHEAD; S.oy = 0; vx.v = vy.v = 0; }
        S.idle = 0;
      }
      S.t += dt;
      S.who = p.id; S.name = p.name || ''; S.bot = !!p.bot;
      const f = ship.pose.f || 1;
      // ---- the pan: the stick (screen right = right on the TV) or, for a bot, a target to look at ----
      if (p.bot) {
        tick -= dt;
        if (tick <= 0) { tick = 0.3; botGoal = botTarget(ship, f); }
        if (botGoal) { S.tfwd = botGoal.fwd; S.tup = botGoal.up; } else { S.tfwd += (C.AHEAD - S.tfwd) * Math.min(1, dt * 0.8); S.tup += (0 - S.tup) * Math.min(1, dt * 0.8); }
      } else {
        const jx = finite(p.jxs), jy = finite(p.jy);
        const dead = (v) => (Math.abs(v) < 0.18 ? 0 : v);
        S.tfwd += dead(jx) * f * C.PAN_SPEED * dt; // (right on the stick is right on the TV: forward when she faces right)
        S.tup -= dead(jy) * C.PAN_SPEED * dt; // (the phone's y grows downward)
      }
      S.tfwd = clamp(S.tfwd, -C.BEHIND, C.AHEAD_MAX);
      S.tup = clamp(S.tup, -C.DOWN, C.UP);
      // keep the lens inside the map
      const map = state.course && state.course.map;
      let wantX = S.tfwd * f, wantY = -S.tup;
      if (map && map.CELL && map.W && map.H) {
        const mx = toWorldX(ship, ship.layout.midPoint.x), my = toWorldY(ship, ship.layout.midPoint.y);
        wantX = clamp(mx + wantX, 0, map.W * map.CELL) - mx;
        wantY = clamp(my + wantY, 0, map.H * map.CELL) - my;
      }
      S.ox = smoothDamp(S.ox, wantX, vx, C.SMOOTH, dt);
      S.oy = smoothDamp(S.oy, wantY, vy, C.SMOOTH, dt);
      S.fwd = S.ox * f; S.up = -S.oy; S.f = f;
      placeCentre(ship);
      spot(p, dt);
    } catch (e) { S.on = false; }
  };

  // a bot's choice: the nearest threat (not already spotted) that is ahead of the ship; fwd / up are measured from her middle
  const botTarget = (ship, f) => {
    const C = SG();
    const mx = toWorldX(ship, ship.layout.midPoint.x), my = toWorldY(ship, ship.layout.midPoint.y);
    let best = null;
    for (const it of radarItems(state)) {
      if (it.kind === 'ship' || it.obj.spotT > 0) continue;
      const q = it.pos();
      const fwd = (q.x - mx) * f, up = -(q.y - my);
      if (fwd < -400 || fwd > C.AHEAD_MAX + 600 || Math.abs(up) > C.UP + 600) continue;
      const d = Math.hypot(fwd, up);
      if (!best || d < best.d) best = { d, fwd, up };
    }
    return best;
  };

  // Who is inside the lens, and for how long
  const spot = (p, dt) => {
    const C = SG();
    tick = tick; // (the bot's own timer is above; this one runs a few times a second)
    S.acc = (S.acc || 0) + dt;
    if (S.acc < 0.2) return;
    const step = S.acc;
    S.acc = 0;
    const R = (C.VIEW_W / 2) * C.EDGE;
    const dark = darkTarget(state) > C.DARK;
    let seen = 0, spotted = 0;
    const live = new Set();
    for (const it of radarItems(state)) {
      if (it.kind === 'ship') continue;
      const q = it.pos();
      const d = Math.hypot(q.x - S.cx, q.y - S.cy) - (SPOT_SIZE[it.kind] || 50) * 0.4;
      if (d > R || (dark && !(it.obj.lit > 0))) continue;
      seen++;
      live.add(it.obj);
      const t = (seenT.get(it.obj) || 0) + step;
      seenT.set(it.obj, t);
      if (it.obj.spotT > 0) spotted++;
      if (t >= C.SEEN_T) {
        if (!(it.obj.spotT > 0)) { spotter.markSpot(p, it); spotted++; seenT.set(it.obj, C.SEEN_T); }
        else if (it.obj.spotT < 2.5) spotter.markSpot(p, it, true); // (still watching it: the mark is kept up quietly)
      }
    }
    for (const k of [...seenT.keys()]) if (!live.has(k)) { const t = seenT.get(k) - step * 2; if (t <= 0) seenT.delete(k); else seenT.set(k, t); }
    S.seen = seen; S.spotted = spotted;
  };

  const reset = () => { S.on = false; S.who = null; S.idle = 99; seenT.clear(); botGoal = null; S.acc = 0; };
  return { update, reset, state: S };
}
