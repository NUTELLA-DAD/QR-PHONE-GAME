// Forces at places (Phase S.5h): one model for everything that shoves the ship at a point on her body. Engine thrust, a raised sail's wind, a storm gust, a shell or bomb or rocket
// bursting against her, a scrape along rock, a plane ramming her, the gunship's tether: each says WHERE it pushes and HOW HARD, and this module turns that into a twist.
// Everything here is PER SHIP and takes the ship's own state as a parameter (no module-level captures of one ship's layout or balance): the pivot, the weight and the radius of gyration are
// read from `state.balance` (balance.js: live centre of mass comX / comY, k2, mass), the forces from `state.forces`.
//   applyForce(state, { x, y, fx, fy, source, impulse, linear, balanced })     x, y in ship coordinates (y runs down); fx, fy are ship accelerations in px/s^2 (+x toward the bow,
//        +y down), or with impulse: true a change of velocity in px/s. linear: true also counts fy as a push on the ship's climb (engines do; the rest already move her by their own code).
//        balanced: true leaves out the sideways part of the torque (engine thrust is held back by drag along the same line). Torque is  r x F  about the live centre of mass, divided by the
//        radius of gyration squared, so a long ship with her weight at the ends turns slower.
//   forcesOf(state, list)  the body-frame totals of a list of forces (default: this frame's queue), without changing anything:
//        { fwd, up, climb, torque, spin, items }   fwd / up: px/s^2 along the bow and upward (all forces in the list), climb: the up part of the `linear` ones, torque: rad/s^2 (+ nose down),
//        spin: rad/s from the impulses, items: each force with its own torque (for a HUD or a test). The ship's motion integrates these (createForces.update; a later stage moves it into the pose).
//   createForces(state).update(dt)  turns the totals into the tilt: state.forces.theta (radians, + nose-down like state.ship.pitch) rocks on a spring (FORCES.K, DAMP) and settles back;
//        simulation.js adds it to the ship's pitch. hitForce / kickForce are the kick of a burst or a ram.
//   staticPitch(layout, c)  what the engines and the sails would tip her at rest (the validator's INFO line, the dev page).
// Gains per source are in config.FORCES.GAIN; with FORCES.LIVE off only the engines and the sails count. A ship with none of them sits at exactly 0 (nothing runs).
import { config } from '../../config.js';
import { thrustVec } from './shipBuild.js';

const LIVE_ONLY = new Set(['hit', 'gust', 'scrape', 'ram', 'tether', 'grab', 'perch']); // sources that need FORCES.LIVE
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The point the ship turns about and what she weighs: from her own live balance (balance.js).
export const pivotOf = (state) => { const b = state.balance || {}; return { x: b.comX || 0, y: b.comY || 0, k2: Math.max(2000, b.k2 || 0), mass: b.mass || config.FORCES.REF_MASS }; };

// Torque of a push at (x, y) about the pivot c, per unit of k2 (rad/s^2 for an acceleration, rad/s for an impulse); + = nose down.
function twist(f, c) {
  const gain = config.FORCES.GAIN[f.source] ?? 1;
  const rx = f.x - c.x, ry = f.y - c.y;
  return (gain * (rx * (f.fy || 0) - (f.balanced ? 0 : ry * (f.fx || 0)))) / c.k2;
}

export function applyForce(state, f) {
  if (!state.forces || state.ship.down || (LIVE_ONLY.has(f.source) && !config.FORCES.LIVE)) return;
  if (!f.impulse && state.phase !== 'flying') return;
  state.forces.queue.push(f);
}

// The body-frame totals of a list of forces on this ship (default: what was applied this frame). Pure: nothing is changed.
export function forcesOf(state, list = state.forces ? state.forces.queue : []) {
  const c = pivotOf(state), out = { fwd: 0, up: 0, climb: 0, torque: 0, spin: 0, items: [] };
  for (const f of list) {
    const t = twist(f, c);
    if (f.impulse) out.spin += t;
    else { out.fwd += f.fx || 0; out.up -= f.fy || 0; out.torque += t; if (f.linear) out.climb -= f.fy || 0; }
    out.items.push({ source: f.source, impulse: !!f.impulse, torque: t, fx: f.fx || 0, fy: f.fy || 0 });
  }
  return out;
}

export function createForces(state) {
  const F = (state.forces = { theta: 0, omega: 0, torque: 0, vyAcc: 0, queue: [], kicks: 0, peak: 0 });
  const reset = () => { F.theta = F.omega = F.torque = F.vyAcc = 0; F.queue.length = 0; };
  const update = (dt) => {
    const C = config.FORCES;
    if (!F.queue.length && !F.theta && !F.omega) { F.vyAcc = 0; F.torque = 0; return; }
    const tot = forcesOf(state);
    for (const f of F.queue) if (f.impulse) { F.kicks++; if (f.linear) state.ship.vy = (state.ship.vy || 0) - (f.fy || 0); }
    F.queue.length = 0;
    F.vyAcc = tot.climb;
    F.torque = tot.torque;
    F.omega += tot.spin;
    F.omega += (tot.torque - C.K * F.theta - C.DAMP * F.omega) * dt;
    F.omega = clamp(F.omega, -C.MAX_RATE, C.MAX_RATE);
    F.theta += F.omega * dt;
    const lim = (C.MAX_DEG * Math.PI) / 180;
    if (Math.abs(F.theta) > lim) { F.theta = Math.sign(F.theta) * lim; if (F.omega * F.theta > 0) F.omega = 0; }
    if (Math.abs(F.theta) < 1e-6 && Math.abs(F.omega) < 1e-6 && !tot.torque) F.theta = F.omega = 0;
    F.peak = Math.max(F.peak, Math.abs(F.theta));
  };
  return { update, reset, state: F };
}

// The kick of a burst (power 1 = one enemy bullet) at (x, y) against the hull: she is shoved up or down, away from the middle of her height, a little toward her middle sideways, so a hit
// on the nose kicks the nose and one on the tail kicks the tail. A heavier ship is shoved less. The twist swings back (createForces).
export function hitForce(state, x, y, power, source = 'hit') {
  const C = config.FORCES;
  if (!C.LIVE || !state.forces) return;
  const c = pivotOf(state);
  const kick = (C.HIT_KICK * Math.min(3, power) * C.REF_MASS) / c.mass;
  applyForce(state, { x, y, fx: -C.HIT_SIDEWAYS * clamp((x - c.x) / 300, -1, 1) * kick, fy: clamp(-(y - c.y) / 150, -1, 1) * kick, impulse: true, source });
}

// A plane ramming or bumping her at `at` = { x, y } on the ship: shoved along (vx, vy) (unit-ish direction, y down) by RAM_KICK px/s at REF_MASS times `scale`; a heavier ship moves less.
export function kickForce(state, at, vx, vy, scale = 1, source = 'ram') {
  const C = config.FORCES, k = (C.RAM_KICK * scale * C.REF_MASS) / pivotOf(state).mass;
  applyForce(state, { x: at.x, y: at.y, fx: vx * k, fy: vy * k, impulse: true, source });
}

// A raised sail's wind push as a ship acceleration, and where it acts: a third of the way down the mast from its top, above the deck (the centre of effort).
export const sailPush = (pull, gust) => pull * config.SAIL.FORCE_ACC * (gust ? config.SAIL.GUST_FORCE : 1);
export const sailPoint = (sail, deckY) => ({ x: sail.x, y: deckY - sail.h * 0.65 });

// What the engines and the sails would tip her at rest (degrees, + nose-down), from the layout: engines at their direction with steam up, every sail fully raised in a calm sky (gust: in a gust).
// c = { x, y, k2 }: the centre of mass and the radius of gyration squared (shipBuild.js balanceOf). Capped at FORCES.MAX_DEG like the flying ship; `raw` is the uncapped figure.
export function staticPitch(L, c, { gust = false } = {}) {
  const C = config.FORCES, E = config.ENGINES;
  const pv = { x: c.x, y: c.y, k2: Math.max(2000, c.k2 || 0) };
  const deckY = (id) => { const q = L.platforms.find((o) => o.id === id); return q ? q.y : 0; };
  const piece = (list, mk) => list.reduce((n, o) => n + twist(mk(o), pv), 0);
  const eng = piece(L.engines, (e) => ({ x: e.x, y: deckY(e.p) + E.BODY_DY, fx: 0, fy: -thrustVec(e.dir).up * E.LIFT_GAS * config.GAS.LIFT, balanced: true, source: 'engine' }));
  let k = 1;
  const sail = piece(L.sails || [], (s) => { const a = sailPush(config.SAIL.BONUS * k, gust); k *= config.SAIL.BONUS_DIM; const pt = sailPoint(s, deckY(s.p)); return { ...pt, fx: a, fy: 0, source: 'sail' }; });
  const deg = (t) => ((t / C.K) * 180) / Math.PI;
  const cap = (d) => clamp(d, -C.MAX_DEG, C.MAX_DEG);
  return { engines: +cap(deg(eng)).toFixed(2), sails: +cap(deg(sail)).toFixed(2), total: +cap(deg(eng + sail)).toFixed(2), raw: +deg(eng + sail).toFixed(2) };
}
