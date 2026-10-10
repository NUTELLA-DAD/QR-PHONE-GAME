// GIANT CREATURES, the generic body (BOSSES.md 3.1). Pure logic, no DOM, no game state: a creature is a puppet made of rigid segments.
// It knows nothing about ships; creatures/kraken.js holds the Kraken's DATA and creatureArt.js draws it.
//   createCreatureBody(def, opts)       the body record { kind, x, y, vx, vy, f, phase, t, hp, maxHp, parts, ... }; def lists the parts
//   stepBody(body, dt)                  advance everything (the key clock, the limbs, the mouth, breathing, hit flashes)
//   hitAt(body, x, y, r) / hitInfo      the part under a circle (capsule distance per segment), or null; hitInfo also says WHICH segment
//   reachPart / gripPart / releasePart  commands for a limb: pull back for ANTICIPATION s, then snap to the point (a grip keeps the tip glued)
//   severPart(body, part, i)            cut a limb at segment i: segments i.. leave (returned, for debris); the stump carries on
//   setMouth / damagePart / nearestFreeLimb / exposeHeart / setLit   small helpers
// A part is { id, kind ('tentacle'|'mantle'|'mouth'|'eye'|'heart'|...), hp, maxHp, dead, segs:[{x,y,ang,len,r,r1}], goal, lit, hit, ... }: a segment starts at (x,y),
// points along ang, is len long and tapers from radius r to r1.
// THE KEY CLOCK: every 1/STEP_FPS s a "key" fires and ONLY then may a limb's goal point change (a command waits for the next key). Between keys the goal is held; the
// drawn pose may ease toward it (view), but nothing wobbles: no sine anywhere. A strike pulls back for ANTICIPATION s (whole keys), then snaps to the target.
// Randomness comes from a seeded generator (opts.rng or opts.seed), never Math.random, so a run is repeatable.
import { config } from '../../config.js';

const C = config.CREATURES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Small seeded random numbers (mulberry32): the same seed always gives the same creature behaviour.
export function makeRng(seed) {
  let a = (seed | 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which part a shot meets first when several overlap: weak points before limbs before the big body.
const PRIO = { heart: 0, eye: 0, mouth: 0, tentacle: 1 };

export function createCreatureBody(def, opts = {}) {
  const rng = opts.rng || makeRng(opts.seed ?? def.seed ?? 1);
  const body = {
    kind: def.kind, x: opts.x || 0, y: opts.y || 0, vx: 0, vy: 0, f: opts.f === -1 ? -1 : 1, phase: 0, t: 0,
    hp: def.hp, maxHp: def.hp, parts: [], def, rng,
    stepFps: opts.stepFps || C.STEP_FPS,
    key: 0, acc: 0, // the key clock: how many keys have fired, and the time since the last one
    breath: 0, puff: 0, // idle breathing: the held value (0 or 1) and the eased value the picture uses
    puppet: null, // the demo puppet's own state (creatures/kraken.js)
  };
  def.parts.forEach((pd, i) => body.parts.push(buildPart(body, pd, i)));
  settle(body);
  return body;
}

function buildPart(body, pd, index) {
  const rng = body.rng;
  const p = {
    id: pd.id, kind: pd.kind, index, hp: pd.hp, maxHp: pd.hp, dead: false, segs: [], goal: { x: 0, y: 0 }, view: { x: 0, y: 0 },
    lit: true, hit: 0, hidden: !!pd.hidden, at: pd.at, layer: pd.layer || 'front', open: false, openAmt: 0, cmdOpen: null,
    grip: null, limb: !!pd.chain, severed: false, reach: 0, reach0: 0, bend: 0, side: 1, ctl: null,
  };
  if (pd.chain) {
    // A limb: a chain of rigid segments rooted on the body, chasing a goal point.
    for (const s of pd.chain) p.segs.push({ x: 0, y: 0, ang: 0, len: s.len, r: s.r, r1: s.r1 });
    p.reach = p.reach0 = p.segs.reduce((a, s) => a + s.len, 0);
    p.bend = (pd.bend || 0) * (0.8 + rng() * 0.4); // which way it arches (the sign) and how much; fixed for the limb
    p.side = p.bend >= 0 ? -1 : 1; // the sucker side: the inside of the arch
    p.ctl = { mode: 'idle', keys: Math.floor(rng() * C.SWAY.EVERY_KEYS), cmd: null, rest: pd.rest, sway: [0, 0], pull: null, target: null, grab: false, fast: false, hold: 0 };
    p.px = new Float64Array(p.segs.length + 1);
    p.py = new Float64Array(p.segs.length + 1);
  } else {
    // A rigid part (mantle, eye, mouth, heart): one capsule that rides the body.
    p.shape = pd.shape;
    p.segs.push({ x: 0, y: 0, ang: 0, len: pd.shape.len || 0, r: pd.shape.r, r1: pd.shape.r });
  }
  return p;
}

const rootOf = (body, p) => ({ x: body.x + p.at[0] * body.f, y: body.y + p.at[1] });
export const tipOf = (p) => {
  const s = p.segs[p.segs.length - 1];
  return s ? { x: s.x + Math.cos(s.ang) * s.len, y: s.y + Math.sin(s.ang) * s.len } : null;
};
// A limb's idle goal: its rest vector (scaled down on a stump) plus the current sway.
function restGoal(body, p) {
  const c = p.ctl;
  const root = rootOf(body, p);
  const k = p.reach0 > 0 ? p.reach / p.reach0 : 0;
  return { x: root.x + (c.rest[0] * body.f + c.sway[0]) * k, y: root.y + (c.rest[1] + c.sway[1]) * k };
}

// First pose: rigid parts on the body, every limb relaxed into its rest curve.
function settle(body) {
  for (const p of body.parts) {
    if (p.limb) {
      p.goal = restGoal(body, p);
      p.view.x = p.goal.x;
      p.view.y = p.goal.y;
      const root = rootOf(body, p);
      const a = Math.atan2(p.goal.y - root.y, p.goal.x - root.x);
      p.segs.forEach((s) => { s.ang = a; });
      layOut(p, root.x, root.y);
      for (let i = 0; i < 40; i++) solveLimb(body, p, 1 / 60, 24, true);
    } else placeRigid(body, p);
  }
}

function placeRigid(body, p) {
  const r = rootOf(body, p);
  const s = p.segs[0];
  s.x = r.x;
  s.y = r.y;
  s.ang = body.f > 0 ? p.shape.ang || 0 : Math.PI - (p.shape.ang || 0);
}

// ---- the chain solver (FABRIK) ----------------------------------------------------------------------------------------------------------------------------------
function layOut(p, rx, ry) { // joint positions from the segments' angles, from the root
  const n = p.segs.length;
  p.px[0] = rx;
  p.py[0] = ry;
  for (let i = 0; i < n; i++) {
    const s = p.segs[i];
    p.px[i + 1] = p.px[i] + Math.cos(s.ang) * s.len;
    p.py[i + 1] = p.py[i] + Math.sin(s.ang) * s.len;
  }
}

// Nudge the joints (not the root or the tip) toward the limb's curved shape: an arc from the root to the target that bows to the limb's bend side.
// It depends only on where the root and the target are, never on time.
function guide(p, tx, ty, blend) {
  const n = p.segs.length;
  if (n < 2 || blend <= 0) return;
  const rx = p.px[0], ry = p.py[0];
  const dx = tx - rx, dy = ty - ry;
  const c = Math.hypot(dx, dy) || 1e-6;
  const L = p.reach;
  const nx = -dy / c, ny = dx / c;
  const h = c >= L ? 0 : Math.min(L * 0.45, Math.sqrt((3 * Math.max(c, L * 0.25) * (L - c)) / 8)) * p.bend; // a parabola's sag for this much slack
  let s = 0;
  for (let i = 1; i < n; i++) {
    s += p.segs[i - 1].len;
    const u = s / L;
    const sag = 4 * u * (1 - u) * h;
    const gx = rx + dx * u + nx * sag;
    const gy = ry + dy * u + ny * sag;
    p.px[i] += (gx - p.px[i]) * blend;
    p.py[i] += (gy - p.py[i]) * blend;
  }
}

function fabrik(p, tx, ty, iters) {
  const n = p.segs.length;
  const rx = p.px[0], ry = p.py[0];
  const dx = tx - rx, dy = ty - ry;
  const d = Math.hypot(dx, dy);
  if (d >= p.reach - 1e-6) { // out of reach: a straight line at the target
    const ux = d > 1e-9 ? dx / d : Math.cos(p.segs[0].ang), uy = d > 1e-9 ? dy / d : Math.sin(p.segs[0].ang);
    for (let i = 0; i < n; i++) {
      p.px[i + 1] = p.px[i] + ux * p.segs[i].len;
      p.py[i + 1] = p.py[i] + uy * p.segs[i].len;
    }
    return;
  }
  for (let it = 0; it < iters; it++) {
    p.px[n] = tx;
    p.py[n] = ty;
    for (let i = n - 1; i >= 0; i--) { // tip to root: pin the tip, keep each length
      let ex = p.px[i] - p.px[i + 1], ey = p.py[i] - p.py[i + 1];
      const e = Math.hypot(ex, ey) || 1e-9;
      p.px[i] = p.px[i + 1] + (ex / e) * p.segs[i].len;
      p.py[i] = p.py[i + 1] + (ey / e) * p.segs[i].len;
    }
    p.px[0] = rx;
    p.py[0] = ry;
    for (let i = 0; i < n; i++) { // root to tip: pin the root
      let ex = p.px[i + 1] - p.px[i], ey = p.py[i + 1] - p.py[i];
      const e = Math.hypot(ex, ey) || 1e-9;
      p.px[i + 1] = p.px[i] + (ex / e) * p.segs[i].len;
      p.py[i + 1] = p.py[i] + (ey / e) * p.segs[i].len;
    }
  }
}

function writeBack(p) {
  for (let i = 0; i < p.segs.length; i++) {
    const s = p.segs[i];
    s.x = p.px[i];
    s.y = p.py[i];
    s.ang = Math.atan2(p.py[i + 1] - p.py[i], p.px[i + 1] - p.px[i]);
  }
}

// One frame of a limb: ease the picture's goal toward the held goal (a glued grip is exact), then guide + FABRIK from last frame's pose.
function solveLimb(body, p, dt, iters, instant) {
  if (!p.segs.length) return;
  const root = rootOf(body, p);
  let tx, ty;
  if (p.grip) {
    tx = p.view.x = p.grip.x;
    ty = p.view.y = p.grip.y;
    iters = Math.max(iters, C.IK.GRIP_ITER);
  } else {
    const rate = p.ctl.fast ? C.EASE.SNAP : C.EASE.IDLE;
    const k = instant ? 1 : 1 - Math.exp(-rate * dt);
    p.view.x += (p.goal.x - p.view.x) * k;
    p.view.y += (p.goal.y - p.view.y) * k;
    tx = p.view.x;
    ty = p.view.y;
  }
  layOut(p, root.x, root.y);
  guide(p, tx, ty, C.IK.GUIDE);
  fabrik(p, tx, ty, iters);
  writeBack(p);
}

// ---- the key clock -----------------------------------------------------------------------------------------------------------------------------------------------
export function stepBody(body, dt) {
  dt = clamp(dt, 0, 0.25);
  body.t += dt;
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.acc += dt;
  const KEY = 1 / body.stepFps;
  for (let n = 0; body.acc >= KEY - 1e-9 && n < 8; n++) {
    body.acc -= KEY;
    if (body.acc < 0) body.acc = 0;
    tickKeys(body);
  }
  body.puff += (body.breath - body.puff) * (1 - Math.exp(-C.EASE.BREATH * dt));
  for (const p of body.parts) {
    if (p.hit > 0) p.hit = Math.max(0, p.hit - dt);
    if (p.dead) continue;
    if (p.limb) solveLimb(body, p, dt, C.IK.ITER, false);
    else {
      placeRigid(body, p);
      if (p.kind === 'mouth') p.openAmt += ((p.open ? 1 : 0) - p.openAmt) * (1 - Math.exp(-C.EASE.MOUTH * dt));
    }
  }
}

// A key fires: this is the ONLY place a goal may change.
function tickKeys(body) {
  const k = ++body.key;
  if (k % C.BREATH.EVERY_KEYS === 0) body.breath = 1 - body.breath; // hold-and-snap breathing
  if (body.def.onKey) body.def.onKey(body, k);
  for (const p of body.parts) {
    if (p.dead) continue;
    if (p.limb) tickLimb(body, p);
    else if (p.kind === 'mouth' && p.cmdOpen !== null) {
      p.open = p.cmdOpen;
      p.cmdOpen = null;
    }
  }
}

const windKeys = (body) => Math.max(1, Math.round(C.ANTICIPATION * body.stepFps));
const holdKeys = (body) => Math.max(1, Math.round(C.HOLD * body.stepFps));

function tickLimb(body, p) {
  const c = p.ctl;
  const root = rootOf(body, p);
  if (c.cmd) { // a command waits for the next key, then starts
    const cmd = c.cmd;
    c.cmd = null;
    if (cmd.kind === 'release') {
      p.grip = null;
      c.mode = 'idle';
      c.keys = 0;
      c.fast = false;
      p.goal = restGoal(body, p);
      return;
    }
    const dx = cmd.x - root.x, dy = cmd.y - root.y;
    const d = Math.hypot(dx, dy) || 1;
    c.target = { x: cmd.x, y: cmd.y };
    c.grab = cmd.kind === 'grip';
    c.pull = { x: root.x - (dx / d) * C.PULL_BACK * p.reach, y: root.y - (dy / d) * C.PULL_BACK * p.reach - C.PULL_LIFT * p.reach };
    c.mode = 'wind';
    c.keys = 0;
    c.fast = false;
    p.grip = null;
    p.goal = { x: c.pull.x, y: c.pull.y }; // anticipation: draw back first
    return;
  }
  c.keys++;
  switch (c.mode) {
    case 'wind':
      if (c.keys >= windKeys(body)) {
        c.mode = c.grab ? 'seize' : 'strike';
        c.keys = 0;
        c.fast = true;
        p.goal = { x: c.target.x, y: c.target.y }; // ...then snap
      }
      break;
    case 'strike':
      if (c.keys >= holdKeys(body)) { // held long enough: back to rest
        c.mode = 'idle';
        c.keys = 0;
        c.fast = false;
        p.goal = restGoal(body, p);
      }
      break;
    case 'seize': {
      const t = tipOf(p);
      if (Math.hypot(t.x - c.target.x, t.y - c.target.y) <= C.GRIP_SNAP || c.keys >= C.GRIP_KEYS) {
        c.mode = 'grip';
        p.grip = { x: c.target.x, y: c.target.y }; // from here the tip is glued to the point
      }
      break;
    }
    case 'grip':
      break; // held until released
    default:
      if (c.keys >= C.SWAY.EVERY_KEYS) { // idle: a new stepped sway pose
        c.keys = 0;
        const amp = C.SWAY.AMOUNT * p.reach0;
        c.sway = [(body.rng() * 2 - 1) * amp, (body.rng() * 2 - 1) * amp * 0.6];
      }
      p.goal = restGoal(body, p);
  }
}

// ---- commands ---------------------------------------------------------------------------------------------------------------------------------------------------
export const isFree = (p) => p.limb && !p.dead && p.segs.length > 0 && p.ctl.mode === 'idle' && !p.ctl.cmd;
export function nearestFreeLimb(body, x, y) { // the idle limb whose root is nearest (limbs that can reach it first)
  let best = null, bd = Infinity;
  for (const p of body.parts) {
    if (!isFree(p)) continue;
    const r = rootOf(body, p);
    const d = Math.hypot(x - r.x, y - r.y) + (Math.hypot(x - r.x, y - r.y) > p.reach ? 1e6 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
export function reachPart(body, p, x, y) { // pull back, then snap to (x, y) and hold there
  if (!p.limb || p.dead) return false;
  p.ctl.cmd = { kind: 'reach', x, y };
  return true;
}
export function gripPart(body, p, x, y) { // pull back, snap to (x, y), then stay glued to it (moveGrip follows it)
  if (!p.limb || p.dead) return false;
  p.ctl.cmd = { kind: 'grip', x, y };
  return true;
}
export function moveGrip(p, x, y) { // the gripped thing moved: the tip goes with it
  if (p.grip) { p.grip.x = x; p.grip.y = y; }
}
export function releasePart(body, p) {
  if (!p.limb) return false;
  p.ctl.cmd = { kind: 'release' };
  return true;
}
export function setMouth(body, p, open) { // opens / closes on the next key
  p.cmdOpen = !!open;
}
export function setLit(body, lit) {
  for (const p of body.parts) p.lit = !!lit;
}
export function exposeHeart(body) {
  for (const p of body.parts) if (p.kind === 'heart') p.hidden = false;
}
export function damagePart(body, p, dmg) {
  if (p.dead) return;
  p.hp = Math.max(0, p.hp - dmg);
  p.hit = C.HIT_FLASH;
  if (p.hp <= 0) p.dead = true;
}

// Cut a limb at segment i: segments i.. go (returned as copies, with their world pose, for debris); the stump keeps its first i segments.
export function severPart(body, p, i) {
  if (!p.limb || p.dead || i < 0 || i >= p.segs.length) return [];
  const gone = p.segs.splice(i).map((s) => ({ ...s }));
  p.severed = true;
  p.reach = p.segs.reduce((a, s) => a + s.len, 0);
  p.grip = null;
  p.ctl.cmd = null;
  p.ctl.mode = 'idle';
  p.ctl.fast = false;
  p.ctl.keys = 0;
  p.hit = C.HIT_FLASH;
  if (!p.segs.length) {
    p.dead = true;
    p.hp = 0;
  } else {
    p.px = new Float64Array(p.segs.length + 1);
    p.py = new Float64Array(p.segs.length + 1);
    p.goal = restGoal(body, p);
  }
  return gone;
}

// ---- hit tests ---------------------------------------------------------------------------------------------------------------------------------------------------
// Distance from (x, y) to a segment's capsule surface (negative inside). The radius tapers from r to r1 along the segment.
export function segDist(s, x, y) {
  const ex = Math.cos(s.ang) * s.len, ey = Math.sin(s.ang) * s.len;
  const l2 = ex * ex + ey * ey;
  const t = l2 > 1e-9 ? clamp(((x - s.x) * ex + (y - s.y) * ey) / l2, 0, 1) : 0;
  const r = s.r + ((s.r1 ?? s.r) - s.r) * t;
  return Math.hypot(x - (s.x + ex * t), y - (s.y + ey * t)) - r;
}
export function hitInfo(body, x, y, r = 0) {
  let best = null, bd = Infinity, bp = 9, bi = -1;
  for (const p of body.parts) {
    if (p.dead || p.hidden) continue;
    const prio = PRIO[p.kind] ?? 2;
    for (let i = 0; i < p.segs.length; i++) {
      const d = segDist(p.segs[i], x, y);
      if (d > r) continue;
      if (prio < bp || (prio === bp && d < bd)) { best = p; bd = d; bp = prio; bi = i; }
    }
  }
  return best ? { part: best, seg: bi } : null;
}
export function hitAt(body, x, y, r = 0) {
  const h = hitInfo(body, x, y, r);
  if (!h) return null;
  h.part.hitSeg = h.seg;
  return h.part;
}
