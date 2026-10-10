// CINEMATIC MOMENTS for the 3D camera (WP11, 3D.md section 16). This only decides HOW FAR the camera is moved off the gameplay mapping this frame; camera3d.js places the camera and index.js asks
// (camera.js stays the authority for the framing). Binding rules (3D.md section 1): the camera never rolls, never breathes and never shakes by hand: every move here is
//   * telegraphed (it follows something the sim already announces: the turn's progress, the Kraken's breach warning, state.slow, a cast off, a hard hit),
//   * short, and critically damped (a smooth-damp, which cannot overshoot, so nothing oscillates),
//   * a yaw / a lift / a pull-back only (the horizon stays level), and it settles EXACTLY back to nothing (a channel under 0.2% snaps to 0), after which the camera is the plain gameplay lens again
//     and the HUD lines up to the pixel (tools/cine3d-check.mjs measures it).
// The hard-hit kick is the one translational jolt: held positions (full, half, a fifth) a few hundredths of a second each, then gone: no decay curve, no random numbers, no sine.
// It reads the game state (never changes it). No time-based sine anywhere.
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);
const smoothstep = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const bell = (u) => (u < 0.5 ? smoothstep(u * 2) : smoothstep((1 - u) * 2)); // 0 -> 1 -> 0, flat at the ends and at the top

// Critically damped easing (the smooth-damp): moves c.x toward `target` in about `time` seconds, never overshoots.
function damp(c, target, time, dt) {
  if (!(dt > 0)) return;
  const om = 2 / Math.max(0.05, time), x = om * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const from = c.x, change = from - target, temp = (c.v + om * change) * dt;
  c.v = (c.v - om * temp) * e;
  c.x = target + (change + temp) * e;
  if ((target - from > 0) === (c.x > target)) { c.x = target; c.v = 0; } // (it would pass the target: stop on it)
}
const chan = () => ({ x: 0, v: 0 });

export function createCinema({ state, settings = {} }) {
  const K = () => config.CINE3D || {};
  const ch = { come: chan(), breach: chan(), finale: chan(), cast: chan() };
  const pose = { active: false, az: 0, elev: 0, mul: 1, dx: 0, dy: 0, kickPx: 0, why: '' };
  const kicks = []; // { age, sx, sy, mag } (px on the screen)
  const seen = new Map(); // ship id -> the newest hitLog number already looked at
  let prevPhase = null, castHold = 0, shakePrev = 0, kickCd = 0;
  const C = { count: 0, fired: { come: 0, breach: 0, finale: 0, cast: 0, kick: 0 } }; // (stats for the gate: how many times each moment started)
  const was = { come: false, breach: false, finale: false };

  const enabled = () => {
    const ok = K().ENABLED !== false && settings.cine !== false && settings.cine !== 0;
    return ok;
  };

  // ---- what the sim says ---------------------------------------------------------------------------------------------------------------------------------------------------
  function readHits(dt, zoom) {
    const KK = K().KICK || {};
    kickCd -= dt;
    let big = 0, from = null;
    for (const sh of state.ships || []) {
      const log = (sh.ctx || state).hitLog || [];
      let last = seen.get(sh.id);
      if (last === undefined) { last = log.length ? log[log.length - 1].n : 0; seen.set(sh.id, last); }
      for (const h of log) {
        if (h.n <= last) continue;
        last = h.n;
        if (fin(h.power) >= (KK.MIN_POWER ?? 2.4) && fin(h.power) > big) { big = h.power; from = { sh, h }; }
      }
      seen.set(sh.id, last);
    }
    const shake = fin(state.ship && state.ship.shake);
    let edge = false;
    if (shake >= (KK.SHAKE_EDGE ?? 1) && shakePrev < (KK.SHAKE_EDGE ?? 1) * 0.8) edge = true; // (the flight shake jumped: a slam, a splash, a crash)
    shakePrev = shake;
    if ((big > 0 || edge) && kickCd <= 0) {
      kickCd = KK.COOLDOWN ?? 0.18;
      const power = big > 0 ? big : 4;
      // the screen pushes the way the blow pushed her: away from where it struck (in the ship's own frame, mirrored while she faces left); straight up and down when we do not know
      let sx = 0, sy = 1;
      if (from) {
        const L = from.sh.layout, f = from.sh.pose.f === -1 ? -1 : 1;
        const rx = L && L.refPoint ? L.refPoint.x : 0, ry = L && L.refPoint ? L.refPoint.y : 0;
        const dx = (rx - from.h.x) * f, dy = ry - from.h.y, m = Math.hypot(dx, dy) || 1;
        sx = dx / m; sy = dy / m;
      }
      const base = Math.min(KK.MAX_PX ?? 15, (KK.PX ?? 12) * Math.min(1, power / 6)), cap = Math.max(4, fin(config.CAMERA && config.CAMERA.SHAKE_MAX, 9) * 1.7);
      kicks.push({ age: 0, sx, sy, mag: Math.max(3, Math.min(base, cap)) });
      C.fired.kick++;
      if (kicks.length > 3) kicks.shift();
    }
    void zoom;
  }

  // ---- the frame ------------------------------------------------------------------------------------------------------------------------------------------------------------
  // v = the 2D camera's view { cx, cy, zoom, minZoom }, w / h = the 2D canvas size, dt seconds. Returns the shared `pose` (active false = leave the camera alone).
  function update(dt, v, w, h) {
    dt = clamp(fin(dt), 0, 0.05);
    const on = enabled();
    const phase = state.phase;
    const castNow = prevPhase !== null && prevPhase !== 'flying' && phase === 'flying';
    prevPhase = phase;
    if (castNow && on) { castHold = (K().CAST || {}).FOR ?? 0.7; ch.cast.x = 1; ch.cast.v = 0; C.fired.cast++; }
    if (!on) { // off: everything at rest, at once
      for (const c of Object.values(ch)) { c.x = 0; c.v = 0; }
      kicks.length = 0; castHold = 0;
      readHits(dt, v.zoom); kicks.length = 0;
      pose.active = false; pose.az = pose.elev = pose.dx = pose.dy = 0; pose.mul = 1; pose.why = '';
      return pose;
    }
    const versus = !!(state.match && state.match.on);
    const main = state.ships && state.ships[0];
    const KC = K();
    // COME ABOUT: the dolly follows the turn's own progress (pose.turn 0..1), peaking in the middle
    const turnU = !versus && main && main.pose && fin(main.pose.turn) > 0 ? clamp(main.pose.turn, 0, 1) : 0;
    if ((turnU > 0) && !was.come) C.fired.come++;
    was.come = turnU > 0;
    damp(ch.come, bell(turnU), (KC.COME_ABOUT || {}).SMOOTH ?? 0.2, dt);
    // KRAKEN BREACH: from the dive to the splash
    const cr = state.creature, b = cr && cr.mode === 'breach' ? cr.breach : null;
    const warn = !!(b && (b.phase === 'dive' || b.phase === 'warn' || b.phase === 'leap' || (b.phase === 'fall' && !b.splashDown)));
    const KB = KC.BREACH || {};
    if (warn && !was.breach) C.fired.breach++;
    was.breach = warn;
    damp(ch.breach, warn ? 1 : 0, warn ? KB.IN ?? 0.6 : KB.OUT ?? 1.1, dt);
    // SLOW-MOTION FINALE: the Kraken's last blow (state.slow) or the match's finale (match.slow)
    const slow = fin((state.match && state.match.on && state.match.slow) || state.slow, 1);
    const slowOn = slow < 0.99;
    const KF = KC.FINALE || {};
    if (slowOn && !was.finale) C.fired.finale++;
    was.finale = slowOn;
    damp(ch.finale, slowOn ? 1 : 0, slowOn ? KF.IN ?? 1 : KF.OUT ?? 1.1, dt);
    // CAST OFF: starts risen and pulled back, settles into the gameplay framing
    const KS = KC.CAST || {};
    if (castHold > 0) castHold -= dt; else damp(ch.cast, 0, KS.OUT ?? 0.9, dt);
    // a hard hit
    readHits(dt, v.zoom);
    const KK = KC.KICK || {};
    let ox = 0, oy = 0;
    for (let i = kicks.length - 1; i >= 0; i--) {
      const k = kicks[i];
      k.age += dt;
      const step = Math.floor(k.age / (KK.STEP ?? 0.07)), steps = KK.STEPS || [1, 0.5, 0.2];
      if (step >= steps.length) { kicks.splice(i, 1); continue; }
      ox += k.sx * k.mag * steps[step]; oy += k.sy * k.mag * steps[step];
    }
    const km = Math.hypot(ox, oy), kcap = KK.MAX_PX ?? 15;
    if (km > kcap) { ox *= kcap / km; oy *= kcap / km; }
    // settle to exactly nothing
    for (const c of Object.values(ch)) if (Math.abs(c.x) < 0.002 && Math.abs(c.v) < 0.01) { c.x = 0; c.v = 0; }
    // ---- combine ----
    const KA = KC.COME_ABOUT || {};
    const a = ch.come.x * (KA.AZ ?? 0.26) + ch.finale.x * (KF.AZ ?? 0.44) + ch.cast.x * (KS.AZ ?? 0.1);
    const el = ch.come.x * (KA.ELEV ?? 0.02) + ch.breach.x * (KB.ELEV ?? 0.2) + ch.finale.x * (KF.ELEV ?? 0.03) + ch.cast.x * (KS.ELEV ?? 0.16);
    let mul = 1 + ch.breach.x * ((KB.MUL ?? 1.16) - 1) + ch.finale.x * ((KF.MUL ?? 1.05) - 1) + ch.cast.x * ((KS.MUL ?? 1.14) - 1);
    // the zoom cap holds: never further out than the 2D camera's own cap (the creature's, Versus's)
    const zoom = fin(v.zoom, 0.5), minZoom = fin(v.minZoom, 0);
    if (minZoom > 0) mul = Math.min(mul, Math.max(1, zoom / minZoom));
    // the look-at slides: down for the breach (so the sea under her reads), toward the dying creature in the finale (map pixels)
    const visH = Math.max(16, h || 1080) / Math.max(1e-3, zoom);
    let dx = ox / zoom, dy = oy / zoom;
    dy += ch.breach.x * (KB.LEAN ?? 0.07) * visH;
    if (ch.finale.x > 0 && cr && Number.isFinite(cr.x) && Number.isFinite(cr.y)) {
      const k = ch.finale.x * (KF.LEAN ?? 0.4);
      dx += (cr.x - fin(v.cx)) * k; dy += (cr.y - fin(v.cy)) * k;
    }
    const any = Math.abs(a) > 0 || Math.abs(el) > 0 || mul !== 1 || ox !== 0 || oy !== 0 || dx !== 0 || dy !== 0;
    pose.active = any;
    pose.az = a; pose.elev = el; pose.mul = mul; pose.dx = dx; pose.dy = dy;
    pose.kickPx = Math.hypot(ox, oy);
    pose.why = any ? [ch.come.x && 'come', ch.breach.x && 'breach', ch.finale.x && 'finale', ch.cast.x && 'cast', pose.kickPx && 'kick'].filter(Boolean).join('+') : '';
    C.count = any ? C.count + 1 : C.count;
    return pose;
  }
  return { update, pose, channels: ch, kicks, stats: C };
}
