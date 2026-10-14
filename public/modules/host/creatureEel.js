// THE VOID EEL'S FIGHT (BOSSES.md 2.6, C.6f): the Aether's serpent. creatures/eel.js is its body, creatureSystem.js the world around it (damage, targets, death), creatureGrip.js the coil (the Kraken's grab with
// config.CREATURES.EEL.COIL merged over it, three tail sections = three grips), creatureBoard.js the crown a boarder walks, squadrons.js the Flagship that flees. The numbers are config.CREATURES.EEL.
//   THE BODY       24 rigid segments laid out every step by follow-the-leader: the head chases a station (ev.goal) and every joint is pulled to its segment length behind the one before. A tail section that reaches into a
//                  grip is an ordinary IK limb (creature.js) until it lets go. The skeleton is ev.P (joint i = x at 2i, y at 2i+1; joint 24 is the head's start).
//   MODES (ev.mode)  'arrive' (cr.mode 'surfacing': it swims in from far away, untouchable) -> 'circle' (cr.mode 'idle': the head circles the ship on an ellipse, acts come now and then) | 'leaving' (the Flagship is
//                  down: it swims away) | 'dying'
//   ACTS (ev.act)  one at a time: LURE (a gold bulb hangs ahead of the ship, the head behind it: touch it and it BITES), SWALLOW (the head swings ahead of the bow and gapes; a red ring follows the bow, LOCKS, the head lunges),
//                  COIL (the loop tightens round the hull and the tail sections reach in, one grip each)
//   THE JOINTS     a shell on the first or last segment of a tail section does JOINT_MUL x; the sections are cut off tail first (only the tail-most one that is left can be cut: eelCuttable); all three cut = 'sever'
//   stepEel(state, cr, ship, dt)       once a step (creatureSystem.js update)
//   eelArmour / eelHit / eelWays / eelDied      what a blow does against the sections, what it triggers, the ways it ends, its death;  eelLamp(cr) the lantern's place;  eelFleeFlagship(state)
import { config } from '../../config.js';
import { setMouth } from './creature.js';
import { EEL_PHASES } from './creatures/eel.js';
import { warnCrew } from './creatureBreath.js';
import { tickGrips, startGrip, gripCap } from './creatureGrip.js';
import { lureX } from './creatureFight.js';
import { toWorldX, toWorldY, toShipX, toShipY, driveGain } from './pose.js';
import { hitForce } from './forces.js';
import { creatureHit } from './structure.js';
import { mainShip, shipOf } from './ships.js';
import { dismount } from './creatureBoard.js';
import { pop } from './popups.js';

const ED = () => config.CREATURES.EEL;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, k) => a + (b - a) * k;
const diffOf = (state) => state.difficulty || 'normal';
const pauseOf = (state) => (config.CREATURES.GRIP.EVERY_BY_DIFF[diffOf(state)] ?? 1);
const rand = (cr, a, b) => a + cr.hooks.rng() * (b - a);
const banner = (state, text, secs = 2.6, pri = 6) => { state.say('setpiece', text, pri, secs); };
const canAttack = (state) => state.phase === 'flying' && !state.ship.down && !state.goingDown;
const partOf = (cr, id) => cr.parts.find((p) => p.id === id);
const tails = (cr) => [0, 1, 2].map((k) => partOf(cr, 'e' + k)).filter(Boolean);
const liveGrips = (cr) => cr.grips.filter((g) => g.mode !== 'recoil').length;
const everyone = () => true;
const NJ = 24; // segments (joint NJ is the head's start)

// ---- the world around the ship ----
// The middle and half-size of the ship's bounds, in the world: the loop's centre.
function centreOf(ship) {
  const b = ship.layout.bounds;
  return { x: toWorldX(ship, (b.x0 + b.x1) / 2), y: toWorldY(ship, (b.y0 + b.y1) / 2), hx: (b.x1 - b.x0) / 2, hy: (b.y1 - b.y0) / 2, bowX: toWorldX(ship, b.x1), bow: b.x1 };
}
const orbitRadii = (ev, C) => {
  const O = ED().ORBIT, K = ED().COIL;
  const a = ev.mode === 'arrive' ? 1 + (O.AFAR - 1) * (1 - smooth(ev.t / O.ARRIVE)) : 1;
  return { rx: lerp(Math.max(O.RX, C.hx + O.CLEAR_X), C.hx + K.HUG_X, ev.tight) * a, ry: lerp(Math.max(O.RY, C.hy + O.CLEAR_Y), C.hy + K.HUG_Y, ev.tight) * a };
};
// Does any part of the hull lie inside the circle (x, y, r)? A polar grid of points through the ship's own hit test.
export function hullInCircle(ship, x, y, r) {
  const sim = ship.sim;
  if (!sim || !sim.hitsShip) return false;
  if (sim.hitsShip(toShipX(ship, x), toShipY(ship, y))) return true;
  for (const k of [0.4, 0.75, 1]) for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (sim.hitsShip(toShipX(ship, x + Math.cos(a) * r * k), toShipY(ship, y + Math.sin(a) * r * k))) return true;
  }
  return false;
}

// ---- setting it up (creatureSystem.js spawnEel) ----
export function setupEel(state, cr, ship, opts = {}) {
  const O = ED().ORBIT, ev = cr.eel, C = centreOf(ship), f = ship.pose.f || 1;
  Object.assign(ev, {
    mode: 'arrive', t: 0, age: 0, nextT: opts.finale ? ED().FINALE.FIRST : ED().ATTACK.FIRST, act: null, lastKind: null, lastLure: -999, finale: !!opts.finale, th: f > 0 ? Math.PI : 0, tight: 0,
    carry: true, goal: { rel: true, x: 0, y: 0, speed: O.CHASE }, head: { x: 0, y: 0 }, lure: null, ring: null, lampLit: 0, lastC: null, P: new Float64Array(2 * (NJ + 1)), V: new Float64Array(2 * (NJ + 1)), hd: { x: f, y: 0 },
    leaveT: 0, gone: false, key: 0, side: f,
  });
  Object.assign(cr.stats, { lures: 0, lookout: 0, bites: 0, swallows: 0, swallowHits: 0, dodged: 0, coils: 0, joints: 0, cuts: 0, windows: 0, struck: 0, fled: 0 });
  cr.fed = 0;
  cr.mouthWin = null;
  cr.mode = 'surfacing';
  cr.ai.mouthT = undefined;
  const R = orbitRadii(ev, C), th = ev.th;
  ev.head.x = C.x + R.rx * Math.cos(th);
  ev.head.y = C.y + R.ry * Math.sin(th);
  const tx = -R.rx * Math.sin(th) * O.DIR, ty = R.ry * Math.cos(th) * O.DIR, tl = Math.hypot(tx, ty) || 1;
  ev.hd = { x: tx / tl, y: ty / tl };
  const L = ED().BODY.LEN;
  ev.P[2 * NJ] = ev.head.x;
  ev.P[2 * NJ + 1] = ev.head.y;
  for (let i = NJ - 1; i >= 0; i--) { ev.P[2 * i] = ev.P[2 * i + 2] - ev.hd.x * L; ev.P[2 * i + 1] = ev.P[2 * i + 3] - ev.hd.y * L; }
  cr.base = { x: ev.head.x, y: ev.head.y };
  cr.x = ev.head.x;
  cr.y = ev.head.y;
  ev.lastC = { x: C.x, y: C.y };
  layout(state, cr, ship, C);
}

// ---- the body: head -> follow-the-leader -> the parts ----
const sectionOf = (cr, k) => partOf(cr, 'e' + k);
const cuttable = (cr) => tails(cr).find((p) => !p.dead && !p.severed) || null; // the tail-most section left: the only one that can be cut off
export const eelCuttable = (cr, p) => cuttable(cr) === p;
export const eelCuts = (cr) => tails(cr).filter((p) => p.dead || p.severed).length;

function moveHead(state, cr, ship, C, dC, dt) {
  const ev = cr.eel, P = ev.P, g = ev.goal, L = ED().BODY.LEN, V = ev.V, was = ev.was || (ev.was = new Float64Array(P.length));
  was.set(P);
  if (ev.carry && (dC.x || dC.y)) { // the loop swims with the ship: the whole body moves as she does
    for (let i = 0; i <= NJ; i++) { P[2 * i] += dC.x; P[2 * i + 1] += dC.y; }
    ev.head.x += dC.x;
    ev.head.y += dC.y;
  }
  const gx = g.rel ? C.x + g.x : g.x, gy = g.rel ? C.y + g.y : g.y;
  const dx = gx - ev.head.x, dy = gy - ev.head.y, d = Math.hypot(dx, dy), step = Math.min(d, g.speed * dt);
  if (d > 1e-6 && step > 0) { ev.head.x += (dx / d) * step; ev.head.y += (dy / d) * step; }
  ev.hv = dt > 0 ? step / dt : 0;
  P[2 * NJ] = ev.head.x;
  P[2 * NJ + 1] = ev.head.y;
  for (let i = NJ - 1; i >= 0; i--) { // each joint is pulled to its segment length behind the one in front, along the line to where it was
    let vx = P[2 * i] - P[2 * i + 2], vy = P[2 * i + 1] - P[2 * i + 3];
    const l = Math.hypot(vx, vy);
    if (l < 1e-6) { vx = -ev.hd.x; vy = -ev.hd.y; } else { vx /= l; vy /= l; }
    P[2 * i] = P[2 * i + 2] + vx * L;
    P[2 * i + 1] = P[2 * i + 3] + vy * L;
  }
  const hx = P[2 * NJ] - P[2 * NJ - 2], hy = P[2 * NJ + 1] - P[2 * NJ - 1], hl = Math.hypot(hx, hy) || 1;
  ev.hd = { x: hx / hl, y: hy / hl };
  if (dt > 0) for (let i = 0; i < P.length; i++) V[i] = (P[i] - was[i]) / dt; // (px/s of every joint: the guns lead the body)
}
// The world velocity of segment i of part p (the aim leads by it): a tail or neck segment's two joints averaged, the head and everything on it the head's own.
export function eelSegVel(cr, p, i) {
  const ev = cr.eel, V = ev.V, per = ED().BODY.PER, m = /^e(\d)$/.exec(p.id);
  if (!V || !m) return V ? { x: V[2 * NJ], y: V[2 * NJ + 1] } : { x: 0, y: 0 };
  const k = +m[1], g = Math.min(NJ - 1, k * per + (k === ED().BODY.SECTIONS - 1 ? i | 0 : per - 1 - (i | 0))); // (a tail section's segment 0 is the one next to its head-side root)
  return { x: (V[2 * g] + V[2 * g + 2]) / 2, y: (V[2 * g + 1] + V[2 * g + 3]) / 2 };
}

// The lantern's place (the crown's top, ahead of the head), from the head's start P[24] and heading.
export function eelLamp(cr) {
  const ev = cr.eel, B = ED().BODY, hx = ev.P[2 * NJ], hy = ev.P[2 * NJ + 1];
  const bx = hx + ev.hd.x * (B.HEAD.LEN * 0.5 + B.CROWN.FWD), by = hy + ev.hd.y * (B.HEAD.LEN * 0.5 + B.CROWN.FWD); // the crown's base (on the head's back)
  return { x: bx + ev.hd.x * B.LAMP.FWD, y: by - B.CROWN.LEN - B.CROWN.R - B.LAMP.UP, bx, by };
}

// Write the parts' places from the skeleton: the tail sections (unless a grip has them), the neck, the crown, the lantern. Also each section's root for the grip code.
function layout(state, cr, ship, C) {
  const ev = cr.eel, P = ev.P, B = ED().BODY, per = B.PER;
  cr.base.x = cr.x = ev.head.x;
  cr.base.y = cr.y = ev.head.y;
  const sz = ev.mode === 'circle' && !(ev.act && ev.act.kind === 'lure');
  for (let k = 0; k < B.SECTIONS; k++) {
    const p = sectionOf(cr, k);
    if (!p || p.dead || !p.segs.length) continue;
    const neck = k === B.SECTIONS - 1, rj = neck ? k * per : (k + 1) * per; // (a tail section's root is its head-side joint, the neck section starts at its tail-side one)
    p.at = [P[2 * rj] - cr.x, P[2 * rj + 1] - cr.y]; // (its root, for the IK limb and the grip code: rootOf)
    const ik = p.kind === 'tentacle' && (p.ctl.mode !== 'idle' || !!p.ctl.cmd || !!p.grip || !!p.wrap);
    p.manual = !ik;
    p.joint = p.kind === 'tentacle' && cuttable(cr) === p; // (the art lights the joint bands of the section that can be cut)
    if (ik) continue;
    for (let j = 0; j < p.segs.length; j++) {
      const g = neck ? k * per + j : k * per + (per - 1 - j), a = neck ? g : g + 1, b = neck ? g + 1 : g, s = p.segs[j], x0 = P[2 * a], y0 = P[2 * a + 1], x1 = P[2 * b], y1 = P[2 * b + 1];
      s.x = x0;
      s.y = y0;
      s.ang = Math.atan2(y1 - y0, x1 - x0);
      s.behind = sz && (y0 + y1) / 2 < C.y; // (the far half of the loop passes behind the hull)
    }
    const last = p.segs[p.segs.length - 1];
    p.view.x = p.goal.x = last.x + Math.cos(last.ang) * last.len;
    p.view.y = p.goal.y = last.y + Math.sin(last.ang) * last.len;
  }
  // the crown stands up from the head's back
  const crown = partOf(cr, 'crown'), lamp = partOf(cr, 'lamp'), lp = eelLamp(cr);
  if (crown && !crown.dead) { const s = crown.segs[0]; s.x = lp.bx; s.y = lp.by; s.ang = -Math.PI / 2; }
  if (lamp && !lamp.dead) { const s = lamp.segs[0]; s.x = lp.x; s.y = lp.y; s.ang = 0; }
}

// ---- the phases ----
function enterPhase(state, cr, ph) {
  const d = EEL_PHASES[ph], h = cr.hooks, A = ED().ATTACK;
  cr.phase = ph;
  cr.ai.breather = A.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (d.banner) {
    banner(state, d.banner, A.BANNER, 5);
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, config.CREATURES.PHASE.SHAKE);
  pop(state, cr.x, cr.y - 1500, d.name, '#e8c44a', 2.2);
  h.puff(cr.x, cr.y - 700, '#ffd86a', 16);
}
function checkPhase(state, cr) {
  const P = ED().PHASE, frac = cr.hp / cr.maxHp, lost = eelCuts(cr);
  let want = 1;
  if (frac < P.TWO_HP || lost >= P.TWO_LOST) want = 2;
  if (frac < P.THREE_HP || lost >= P.THREE_LOST) want = 3;
  if (want > cr.phase) enterPhase(state, cr, want);
}

// ---- the main step ----
export function stepEel(state, cr, ship, dt) {
  const E = ED(), O = E.ORBIT, ev = cr.eel, C = centreOf(ship);
  ev.age += dt;
  ev.t += dt;
  ev.key = Math.floor(ev.age * 8);
  if (cr.ai.breather > 0) cr.ai.breather -= dt;
  const dC = ev.lastC ? { x: C.x - ev.lastC.x, y: C.y - ev.lastC.y } : { x: 0, y: 0 };
  ev.lastC = { x: C.x, y: C.y };
  stepMouthWin(state, cr, ship, dt);
  if (cr.dying) { // limp: the body falls away and drifts on
    tickGrips(state, cr, dt);
    ev.goal = { rel: false, x: ev.head.x + ev.side * E.SPAWN.SINK_DRIFT * 2, y: ev.head.y + (E.SPAWN.SINK_DEEP / E.SPAWN.SINK) * 2, speed: Math.hypot(E.SPAWN.SINK_DRIFT, E.SPAWN.SINK_DEEP / E.SPAWN.SINK) };
    ev.carry = false;
    moveHead(state, cr, ship, C, dC, dt);
    layout(state, cr, ship, C);
    return;
  }
  if (ev.mode === 'leaving') return stepLeaving(state, cr, ship, C, dC, dt);
  if (ev.mode === 'arrive') {
    cr.mode = 'surfacing';
    orbitStep(state, cr, ship, C, dt, 1);
    moveHead(state, cr, ship, C, dC, dt);
    layout(state, cr, ship, C);
    if (ev.t >= O.ARRIVE) { ev.mode = 'circle'; ev.t = 0; cr.mode = 'idle'; state.sfxQ.push(['roar']); }
    return;
  }
  // the Flagship is down (sunk, or the stop won another way): the eel goes
  if (ev.finale && state.course && state.course.ring && state.course.ring.crown) { startLeaving(state, cr); return stepLeaving(state, cr, ship, C, dC, dt); }
  if (ev.finale) ev.calmT = ev.act || cr.grips.length ? E.FINALE.BOARD_CALM : Math.max(0, (ev.calmT || 0) - dt); // (the Flagship's stop: while the Eel has the hands - an act, a coil on the hull - and BOARD_CALM s after, her raiders are held back: raiders.js calm())
  checkPhase(state, cr);
  tickGrips(state, cr, dt);
  let spin = 1;
  if (ev.act) spin = stepAct(state, cr, ship, dt, C, ev.act);
  else {
    ev.carry = true;
    ev.tight += (0 - ev.tight) * Math.min(1, E.COIL.LOOSEN * dt);
    if (canAttack(state) && cr.ai.breather <= 0 && (ev.nextT -= dt) <= 0) pickAct(state, cr, ship, C);
  }
  if (!ev.act || ev.act.kind === 'coil') orbitStep(state, cr, ship, C, dt, spin);
  moveHead(state, cr, ship, C, dC, dt);
  layout(state, cr, ship, C);
  lampStep(state, cr, ship, C, dt);
}

// The head circles on the ellipse (carried with the ship): the goal point advances by `spin` x the orbit speed.
function orbitStep(state, cr, ship, C, dt, spin) {
  const ev = cr.eel, O = ED().ORBIT, R = orbitRadii(ev, C);
  if (ev.sync) { // an act just ended: the loop picks up where the head is
    ev.sync = false;
    ev.th = Math.atan2((ev.head.y - C.y) / R.ry, (ev.head.x - C.x) / R.rx);
  }
  const speed = O.SPEED * (1 + O.SPEED_PER_CUT * eelCuts(cr));
  ev.th += (O.DIR * spin * speed * dt) / ((R.rx + R.ry) / 2);
  ev.goal = { rel: true, x: R.rx * Math.cos(ev.th), y: R.ry * Math.sin(ev.th), speed: O.CHASE };
  ev.carry = true;
}

// ---- the attack director ----
function endAct(state, cr) {
  const A = ED().ATTACK, ev = cr.eel, a = ev.act;
  if (a) ev.lastKind = a.kind;
  ev.act = null;
  ev.ring = null;
  ev.lure = null;
  ev.lampLit = 0;
  ev.sync = true;
  ev.carry = true;
  const pace = ev.finale ? ED().FINALE.PACE : 1;
  ev.nextT = rand(cr, A.EVERY[0], A.EVERY[1]) * (A.PHASE_MUL[Math.min(3, cr.phase)] || 1) * pauseOf(state) * pace;
}
const coilCap = (state, cr) => {
  const E = ED();
  let n = Math.min(gripCap(state, cr), E.COIL.MAX[Math.min(3, cr.phase)] || 1, tails(cr).filter((p) => !p.dead && !p.severed).length);
  if (cr.eel.finale) n = Math.min(n, E.FINALE.MAX_GRIPS);
  return Math.max(0, n);
};
function pickAct(state, cr, ship, C) {
  const E = ED(), ev = cr.eel, W = E.ATTACK.WEIGHTS[Math.min(3, cr.phase)];
  const opts = [];
  if (W.lure > 0 && ev.age - ev.lastLure >= E.LURE.EVERY && ev.lastKind !== 'lure') opts.push(['lure', W.lure]);
  if (W.swallow > 0 && ev.lastKind !== 'swallow') opts.push(['swallow', W.swallow]);
  if (W.coil > 0 && coilCap(state, cr) > 0 && ev.lastKind !== 'coil') opts.push(['coil', W.coil]);
  if (!opts.length) { ev.lastKind = null; ev.nextT = 1.5; return; }
  const total = opts.reduce((n, o) => n + o[1], 0);
  let r = cr.hooks.rng() * total, kind = opts[0][0];
  for (const [k, w] of opts) { r -= w; if (r <= 0) { kind = k; break; } }
  if (kind === 'lure') startLure(state, cr, ship, C);
  else if (kind === 'swallow') startSwallow(state, cr, ship, C);
  else startCoil(state, cr, ship, C, false);
}
function stepAct(state, cr, ship, dt, C, a) {
  a.t += dt;
  if (a.kind === 'lure') return stepLure(state, cr, ship, dt, C, a);
  if (a.kind === 'swallow') return stepSwallow(state, cr, ship, dt, C, a);
  if (a.kind === 'bite') { stepBite(state, cr, ship, dt, C, a); return 0; }
  return stepCoil(state, cr, ship, dt, C, a);
}

// Everyone on a deck feels it on the phone; the helm gets its own word.
const buzzAll = (state, cr, ship, text, buzz) => warnCrew(state, cr, ship, everyone, text, buzz);
function tellHelm(state, cr, ship, text, buzz = [200, 60, 200, 60, 200]) {
  const fx = cr.hooks.phoneFx;
  if (!fx) return;
  for (const p of Object.values(state.players)) if (!p.bot && p.lock && shipOf(state, p) === ship && ship.layout.kindOf(p.lock) === 'helm') fx(p, text, buzz);
}

// ---- the LURE ----
function startLure(state, cr, ship, C) {
  const E = ED(), U = E.LURE, B = E.BODY, ev = cr.eel, f = ship.pose.f || 1;
  const Lx = C.bowX + f * U.AHEAD, Ly = C.y + (cr.hooks.rng() * 2 - 1) * U.ALT; // where the bulb will hang (the world's, not the ship's)
  const offX = B.HEAD.LEN * 0.5 + B.CROWN.FWD + B.LAMP.FWD, offY = B.CROWN.LEN + B.CROWN.R + B.LAMP.UP; // the lantern hangs this far ahead of and above the head
  const S = { x: Lx + f * offX, y: Ly + offY }, A = { x: S.x + f * U.BEHIND, y: S.y + (cr.hooks.rng() < 0.5 ? -1 : 1) * U.PRE_DY };
  ev.act = { kind: 'lure', sub: 'seek', t: 0, S, A, f, L: { x: Lx, y: Ly } };
  ev.lastLure = ev.age;
  ev.carry = false;
  ev.lampLit = 0;
  cr.stats.lures += 1;
  setMouth(cr, partOf(cr, 'mouth'), false);
}
function stepLure(state, cr, ship, dt, C, a) {
  const E = ED(), U = E.LURE, ev = cr.eel, f = a.f;
  if (a.sub === 'seek') {
    const nearA = Math.hypot(ev.head.x - a.A.x, ev.head.y - a.A.y) < U.REACH;
    ev.goal = { rel: false, x: a.A.x, y: a.A.y, speed: E.ORBIT.CHASE };
    if (nearA || a.sub2) {
      a.sub2 = true;
      ev.goal = { rel: false, x: a.S.x, y: a.S.y, speed: E.ORBIT.CHASE * U.SEEK_SPEED };
    }
    if ((a.sub2 && Math.hypot(ev.head.x - a.S.x, ev.head.y - a.S.y) < U.REACH) || a.t > U.SEEK_MAX) {
      a.sub = 'hang';
      a.t = 0;
      ev.lampLit = 2;
      ev.lure = { live: true, x: 0, y: 0, known: false, t: 0, bob: 0, spotT: 0 };
      syncLure(cr);
    }
    return 0;
  }
  if (a.sub === 'hang') {
    a.S.x -= f * U.DRIFT * dt; // it creeps toward her
    ev.goal = { rel: false, x: a.S.x, y: a.S.y, speed: E.ORBIT.CHASE * U.HANG_SPEED };
    const lu = ev.lure;
    lu.t = a.t;
    syncLure(cr);
    // the warning: a lookout sees it from afar; without one, the head shows at TELL px
    const dist = Math.hypot(lu.x - C.x - f * C.hx, lu.y - C.y);
    if (!lu.known) {
      const lookout = Object.values(state.players).find((p) => p.lock && shipOf(state, p) === ship && ship.layout.kindOf(p.lock) === 'lookout');
      if (lookout && dist < U.RANGE) lureKnown(state, cr, ship, lookout, U.TEXT);
      else if (dist < U.TELL) lureKnown(state, cr, ship, null, U.TELL_TEXT);
    }
    // touched: a BITE
    if (hullInCircle(ship, lu.x, lu.y, U.TOUCH)) { startBite(state, cr, ship, C, a); return 0; }
    if (a.t >= U.TIME || f * ((C.x - f * C.hx) - lu.x) > U.PASSED) endAct(state, cr);
    return 0;
  }
  return 0;
}
function syncLure(cr) {
  const ev = cr.eel, lu = ev.lure;
  if (!lu) return;
  const lp = eelLamp(cr);
  lu.x = lp.x;
  lu.y = lp.y + (ev.key % 2 ? ED().LURE.BOB : -ED().LURE.BOB); // (the bulb bobs on the key clock)
}
function lureKnown(state, cr, ship, who, text) {
  const lu = cr.eel.lure;
  lu.known = true;
  if (who) cr.stats.lookout += 1;
  banner(state, text, 3.5, 8);
  state.sfxQ.push(['roar']);
  pop(state, lu.x, lu.y - 300, 'LURE!', '#ff4d4d', 1.8);
  tellHelm(state, cr, ship, text);
  if (who && state.moment) state.moment('creature-lure', { who: [who], where: null, data: { creature: cr.name } }); // (the Ship's Book: the lookout who called it)
}
// Lamp-only upkeep (the glow and the lure's bob) outside the lure's own step.
function lampStep(state, cr) {
  const ev = cr.eel;
  if (!ev.act || ev.act.kind !== 'lure') ev.lampLit = ev.act && ev.act.kind === 'swallow' ? 1 : 0;
  if (ev.lure) syncLure(cr);
}

// ---- the BITE (a ship that flew into the lure) ----
function startBite(state, cr, ship, C, a) {
  const ev = cr.eel, K = ED().BITE;
  ev.act = { kind: 'bite', sub: 'snap', t: 0, x: ev.lure.x, y: ev.lure.y };
  ev.carry = false;
  ev.lure.live = false;
  setMouth(cr, partOf(cr, 'mouth'), true);
  cr.stats.bites += 1;
  shakeBoarders(state, cr);
  banner(state, 'THE LURE BITES! IT WAS THE EEL!', 3, 8);
  state.sfxQ.push(['roar']);
  void a; void K;
}
function stepBite(state, cr, ship, dt, C, a) {
  const ev = cr.eel, K = ED().BITE;
  ev.goal = { rel: false, x: a.x, y: a.y, speed: K.SPEED };
  if (!a.hit && a.t >= K.HIT_AT) {
    a.hit = true;
    const sx = toShipX(ship, a.x), sy = toShipY(ship, a.y);
    creatureHit(ship, sx, sy, K.HULL, { power: K.POWER });
    hitForce(ship.ctx, sx, sy, K.POWER);
    if (ship.sim && ship.sim.air) ship.sim.air.shove(K.SHOVE, sx);
    const per = driveGain(ship);
    if (per) ship.ctx.ship.speed -= ((ship.pose.f || 1) * K.KICK) / per;
    state.ship.shake = Math.max(state.ship.shake || 0, K.SHAKE);
    pop(state, a.x, a.y - 200, 'BITE!', '#ff5a1f', 1.8);
    cr.hooks.puff(a.x, a.y, '#ffd86a', 16);
    state.sfxQ.push(['impact']);
    openWindow(state, cr, ship, 3);
  }
  if (a.t >= K.END) { ev.act = null; startCoil(state, cr, ship, C, true); }
}

// The lunge (and a bite) throws every boarder off the crown: he falls free (the parachute button).
function shakeBoarders(state, cr) {
  for (const p of Object.values(state.players)) {
    if (!p.on || p.on.cr !== cr) continue;
    dismount(state, p, 'gone');
    cr.stats.shaken = (cr.stats.shaken || 0) + 1;
    if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'THE EEL SHOOK YOU OFF! Open the parachute (Action)!', [200, 60, 200]);
  }
}

// ---- the mouth's window ----
function openWindow(state, cr, ship, secs, text = true) {
  const mouth = partOf(cr, 'mouth');
  if (!mouth || mouth.dead) return;
  setMouth(cr, mouth, true);
  cr.mouthWin = { t: 0, left: secs };
  cr.stats.windows += 1;
  if (text) for (const p of Object.values(state.players)) {
    if (p.bot || p.fly || p.fall || shipOf(state, p) !== ship || !ship.layout.kindOf || ship.layout.kindOf(p.lock) !== 'bombBay') continue;
    if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'THE EEL GAPES! Hold Action to DROP BOMBS into its maw!', [90, 40, 90]);
  }
}
function stepMouthWin(state, cr, ship, dt) {
  const w = cr.mouthWin, mouth = partOf(cr, 'mouth'), M = ED().MOUTH;
  if (!w || !mouth) return;
  w.t += dt;
  w.left -= dt;
  if (w.gulp > 0 && (w.gulp -= dt) <= 0 && w.left > M.REOPEN) setMouth(cr, mouth, true); // (it swallowed a bomb: shut a moment, then open again for what is left of the window)
  if (cr.dying || (w.left <= 0 && !(w.gulp > 0)) || w.t > 40) { cr.mouthWin = null; setMouth(cr, mouth, false); }
}

// ---- the SWALLOW ----
function startSwallow(state, cr, ship, C) {
  const E = ED(), S = E.SWALLOW, ev = cr.eel, f = ship.pose.f || 1;
  const yo = (cr.hooks.rng() * 2 - 1) * S.YO;
  ev.act = { kind: 'swallow', sub: 'seek', t: 0, f, yo, ahead: S.AHEAD, sub2: false };
  ev.carry = true;
  ev.ring = null;
  cr.stats.swallows += 1;
}
// Where the ring sits (the world): ahead of the bow, a little ahead of where the bow will be.
function ringSpot(cr, ship, C, f) {
  const S = ED().SWALLOW, vf = Math.max(0, (ship.pose.vx || 0) * f); // (she is led only while she flies on: a ship backing away is not followed)
  return { x: C.bowX + f * (S.RING_AHEAD + vf * S.LEAD), y: C.y + C.hy * S.RING_DROP };
}
function stepSwallow(state, cr, ship, dt, C, a) {
  const E = ED(), S = E.SWALLOW, ev = cr.eel, f = a.f, mouth = partOf(cr, 'mouth');
  const station = () => ({ x: C.bowX + f * a.ahead, y: C.y + a.yo });
  if (a.sub === 'seek') { // swing out beyond the station, then come back toward the ship: the head faces her
    const st = station(), A = { x: st.x + f * S.SWING, y: st.y + (a.yo < 0 ? -1 : 1) * S.SWING_DY };
    const nearA = Math.hypot(ev.head.x - A.x, ev.head.y - A.y) < S.REACH;
    if (nearA) a.sub2 = true;
    const goal = a.sub2 ? st : A;
    ev.goal = { rel: false, x: goal.x, y: goal.y, speed: E.ORBIT.CHASE };
    ev.carry = true;
    if ((a.sub2 && Math.hypot(ev.head.x - st.x, ev.head.y - st.y) < S.REACH) || a.t > S.SEEK_MAX) {
      a.sub = 'wind';
      a.t = 0;
      const r = ringSpot(cr, ship, C, f);
      ev.ring = { x: r.x, y: r.y, r: S.R, locked: false, T: S.WIND, t: 0, threat: false };
      openWindow(state, cr, ship, S.WIND + S.LUNGE + S.RECOVER, false);
      banner(state, 'THE EEL GAPES AHEAD! BRAKE, TURN AWAY OR CLIMB!', S.WIND + 0.5, 8); // (priority 8 cuts in at once: the red ring is up for only a few seconds)
      buzzAll(state, cr, ship, 'SWALLOW AHEAD! Helm: BRAKE or CLIMB out of the red ring!', [200, 60, 200, 60, 200]);
      tellHelm(state, cr, ship, 'THE EEL IS ABOUT TO SWALLOW YOU! BRAKE or CLIMB!', [250, 60, 250, 60, 250]);
      state.sfxQ.push(['roar']);
    }
    return 0;
  }
  if (a.sub === 'wind') {
    const st = station();
    ev.goal = { rel: false, x: st.x, y: st.y, speed: E.ORBIT.CHASE };
    const rg = ev.ring;
    rg.t = a.t;
    if (!rg.locked) {
      const r = ringSpot(cr, ship, C, f);
      rg.x = r.x;
      rg.y = r.y;
      if (a.t >= S.WIND - S.LOCK) {
        rg.locked = true;
        ev.carry = false;
        const vx = ship.pose.vx || 0;
        rg.threat = hullInCircle(ship, rg.x, rg.y, rg.r) || hullInCircle(ship, rg.x - vx * (S.LOCK + S.LUNGE), rg.y, rg.r); // (would a ship that does nothing be caught?)
        state.sfxQ.push(['whoosh']);
      }
    }
    if (a.t >= S.WIND) { a.sub = 'lunge'; a.t = 0; a.from = { x: ev.head.x, y: ev.head.y }; state.sfxQ.push(['roar']); shakeBoarders(state, cr); }
    return 0;
  }
  if (a.sub === 'lunge') {
    const rg = ev.ring;
    ev.carry = false;
    ev.goal = { rel: false, x: rg.x, y: rg.y, speed: Math.max(S.MIN_SPEED, Math.hypot(rg.x - a.from.x, rg.y - a.from.y) / S.LUNGE) };
    if (a.t >= S.LUNGE) { resolveSwallow(state, cr, ship, C, a); a.sub = 'recover'; a.t = 0; }
    return 0;
  }
  if (a.sub === 'recover') { // the maw hangs open: it swims to gape up at her bomb bay (creatureFight.js lureX), the window for bombs
    ev.carry = false;
    const ring = ev.ring;
    if (ring && a.t > S.RING_HIDE) ev.ring = null;
    const M = E.MOUTH, bay = ship.layout.bombBay, by = bay ? toWorldY(ship, bay.y) : C.y, off = E.BODY.HEAD.LEN - E.BODY.MOUTH.R * 0.3;
    ev.goal = { rel: false, x: lureX(state, cr, ship) - ev.hd.x * off, y: by + M.BELOW - ev.hd.y * off, speed: M.LURE_SPEED };
    if (a.t >= S.RECOVER || !cr.mouthWin) { a.sub = 'retreat'; a.t = 0; }
    return 0;
  }
  if (a.sub === 'retreat') { endAct(state, cr); return 0; }
  return 0;
}
function resolveSwallow(state, cr, ship, C, a) {
  const E = ED(), S = E.SWALLOW, ev = cr.eel, rg = ev.ring;
  const hit = hullInCircle(ship, rg.x, rg.y, rg.r);
  if (hit) {
    cr.stats.swallowHits += 1;
    const sx = toShipX(ship, rg.x), sy = toShipY(ship, rg.y);
    creatureHit(ship, sx, sy, S.HULL, { power: S.POWER });
    hitForce(ship.ctx, sx, sy, S.POWER);
    if (ship.sim && ship.sim.air) ship.sim.air.shove(S.SHOVE, sx);
    const per = driveGain(ship);
    if (per) ship.ctx.ship.speed -= ((ship.pose.f || 1) * S.KICK) / per;
    state.ship.shake = Math.max(state.ship.shake || 0, S.SHAKE);
    pop(state, rg.x, rg.y - 260, 'SWALLOWED!', '#ff2a2a', 1.9);
    cr.hooks.puff(rg.x, rg.y, '#ffd86a', 18);
    state.sfxQ.push(['impact']);
    state.say('info', 'THE EEL SWALLOWED THE BOW!', null, 2);
    tellHelm(state, cr, ship, 'SWALLOWED! Next time: brake, turn away or climb.', [200, 60, 200]);
  } else {
    pop(state, rg.x, rg.y - 260, 'MISSED!', '#ffffff', 1.4);
    state.sfxQ.push(['chomp']);
    if (rg.threat) {
      cr.stats.dodged += 1;
      const helm = Object.values(state.players).find((p) => p.lock && shipOf(state, p) === ship && ship.layout.kindOf(p.lock) === 'helm');
      pop(state, rg.x, rg.y - 420, 'DODGED!', '#8fe388', 1.6);
      if (state.moment) state.moment('creature-dodge', { who: helm ? [helm] : [], where: null, data: { creature: cr.name } }); // (the Ship's Book: the helm that got away)
      if (helm && !helm.bot && cr.hooks.phoneFx) cr.hooks.phoneFx(helm, 'You dodged the swallow!', [30, 40, 30]);
    }
  }
  rg.hit = hit;
}

// ---- the COIL ----
function startCoil(state, cr, ship, C, fast) {
  const ev = cr.eel;
  const n = coilCap(state, cr);
  if (n <= 0) { endAct(state, cr); return; }
  ev.act = { kind: 'coil', sub: 'tighten', t: 0, wait: 0, left: n, seized: 0, fast, tSeek: 0 };
  ev.sync = true; // (the loop picks up where the head is: after a bite it is a long way from where it circled)
  cr.stats.coils += 1;
  if (!fast) {
    banner(state, 'THE EEL TIGHTENS ITS LOOP! BRACE - THE COILS COME NEXT!', ED().COIL.TIGHTEN + 1.5, 6);
    buzzAll(state, cr, ship, 'THE EEL IS CLOSING ITS LOOP! Get ready to hack the coils off the deck ends.', [150, 60, 150, 60, 200]);
  }
  state.sfxQ.push(['roar']);
}
function stepCoil(state, cr, ship, dt, C, a) {
  const E = ED(), K = E.COIL, ev = cr.eel;
  if (a.sub === 'tighten') {
    const tt = a.fast ? K.TIGHTEN * K.FAST_MUL : K.TIGHTEN;
    ev.tight = Math.min(1, ev.tight + dt / tt);
    if (a.t >= tt + K.SETTLE) { a.sub = 'grab'; a.t = 0; ev.tight = 1; }
    return K.RUN_SPEED / E.ORBIT.SPEED; // (the head runs the shrinking loop fast, so that the whole body comes to lie round her)
  }
  if (a.sub === 'grab') {
    ev.tight = 1;
    a.tSeek += dt;
    if ((a.wait -= dt) <= 0 && a.left > 0) {
      const g = canAttack(state) ? startGrip(state, cr, ship) : null;
      if (g) {
        if (a.fast && a.seized === 0) g.t = Math.max(0, K.WINDUP - E.BITE.WINDUP); // (the bite: the first coil takes hold almost at once)
        a.left -= 1;
        a.seized += 1;
        a.wait = K.SPREAD;
      } else { a.wait = K.RETRY; if (a.tSeek > K.GIVE_UP) a.left = 0; }
    }
    if (a.left <= 0) { a.sub = 'hold'; a.t = 0; }
    return K.SEEK_SPIN; // (the loop still turns slowly: a section whose root is out of reach comes round)
  }
  if (a.sub === 'hold') {
    ev.tight = 1;
    if (liveGrips(cr) === 0) { a.sub = 'release'; a.t = 0; }
    return 0; // (held: nothing moves, so the grips' roots stay put)
  }
  ev.tight = Math.max(0, ev.tight - dt / K.OPEN_TIME);
  if (ev.tight <= 0) endAct(state, cr);
  return 1 - 0.7 * ev.tight;
}

// ---- leaving (the Flagship is down) and the Flagship that flees (the eel is dead) ----
function startLeaving(state, cr) {
  const ev = cr.eel;
  ev.mode = 'leaving';
  ev.leaveT = 0;
  ev.act = null;
  ev.ring = null;
  ev.lure = null;
  ev.lampLit = 0;
  cr.mode = 'leaving';
  cr.mouthWin = null;
  setMouth(cr, partOf(cr, 'mouth'), false);
}
function stepLeaving(state, cr, ship, C, dC, dt) {
  const ev = cr.eel, E = ED();
  ev.leaveT += dt;
  tickGrips(state, cr, dt); // (cr.mode is not 'idle': every grip lets go)
  ev.carry = false;
  const away = Math.sign(ev.head.x - C.x) || ev.side;
  ev.goal = { rel: false, x: ev.head.x + away * E.FINALE.LEAVE_DIST, y: ev.head.y - E.FINALE.LEAVE_RISE, speed: E.FINALE.LEAVE_SPEED };
  moveHead(state, cr, ship, C, dC, dt);
  layout(state, cr, ship, C);
  if (ev.leaveT >= E.FINALE.LEAVE) ev.gone = true;
}
// The eel is dead at the Flagship's stop: she cuts her moorings and runs (squadrons.js updateBoss reads z.fleeing).
export function eelFleeFlagship(state, cr, who) {
  const z = state.boss, F = ED().FINALE;
  if (!z || z.fleeing) return false;
  z.fleeing = true;
  z.fleeT = 0;
  const sh = mainShip(state);
  z.fleeDir = Math.sign(z.x - toWorldX(sh, sh.layout.refPoint.x)) || 1;
  cr.stats.fled += 1;
  state.say('objective', F.TEXT, 8, 5);
  state.sfxQ.push(['roar']);
  if (state.moment) state.moment('creature-fled', { who: who ? [who] : [], where: null, data: { creature: cr.name } });
  return true;
}

// ---- what a blow does ----
const isJoint = (p, seg) => p.kind === 'tentacle' && p.segs.length > 0 && (seg === 0 || seg >= p.segs.length - 1);
// A blow of dmg on segment seg of part p (creatureSystem.js hurtCreature): the tail section that can be cut takes JOINT.MUL x on a joint; the ones behind it are armoured (half).
export function eelArmour(state, cr, p, seg, dmg, src) {
  if (p.kind !== 'tentacle') return dmg;
  const cut = eelCuttable(cr, p);
  if (!cut) return dmg * ED().JOINT.BEHIND_MUL;
  if (isJoint(p, seg)) { cr.stats.joints += 1; return dmg * ED().JOINT.MUL; }
  return dmg;
}
export function eelHit(state, cr, p, dmg, src, opts) {
  if (p.kind === 'tentacle' && (p.dead || p.severed) && !p.counted) {
    p.counted = true;
    cr.stats.cuts += 1;
    const n = eelCuts(cr);
    pop(state, cr.x, cr.y - 800, 'CUT! ' + n + '/3', '#ffd23f', 1.8);
    state.say('objective', n >= 3 ? 'THE LAST JOINT GOES!' : 'JOINT CUT! ' + (3 - n) + ' TO GO!', 5, 2.4);
    for (const q of Object.values(state.players)) if (!q.bot && cr.hooks.phoneFx) cr.hooks.phoneFx(q, 'A section of the eel is cut away!', [60, 40, 60]);
    void dmg; void src; void opts;
  }
}
export function eelWays(cr, p, src) {
  const ways = [];
  if (tails(cr).every((q) => q.dead || q.severed)) ways.push('sever');
  if (cr.fed >= ED().MOUTH.FED) ways.push('mouth');
  if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
  if (cr.hp <= 0) ways.push('hp');
  return ways;
}
export function eelDied(state, cr, opts = {}) {
  const ev = cr.eel;
  ev.mode = 'dying';
  ev.act = null;
  ev.ring = null;
  ev.lure = null;
  ev.lampLit = 0;
  cr.mouthWin = null;
  if (ev.finale) eelFleeFlagship(state, cr, opts.who);
}
export const eelGone = (cr) => !!cr.eel && cr.eel.gone;
