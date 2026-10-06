// Shared flying for enemy planes (after Bomber XXL): a plane always flies forward at speed and can
// only turn so fast, so it swoops in wide arcs, loops, and overshoots. It looks ahead along its nose
// and pulls up from the ground, dives away from rock above, and swerves off the ship - but it can
// still misjudge a mountain. It leaves contrails in hard turns and smoke when it's hurt; shot down,
// it spirals into the ground trailing smoke while the pilot bails out under a parachute.
import { config } from '../../config.js';
import { groundAt, ceilAt, inRock, scrollSpeed } from './course.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export { angDiff };

// Fly plane e one step toward (tx, ty). o = { speed (cruise), turn, turnAvoid, nearShip(x, y, pad), midY }.
// o.forceTurn (radians/s) overrides the steering - used for loops. o.fm = the plane type's config block
// (THRUST, DRAG, STALL_SPEED, MAX_SPEED, GRAVITY, any of which falls back to config.FLIGHT), o.max = its
// full hp (for damage handling), o.noScroll = don't subtract the ship's motion (bombers).
// The plane has an airspeed (e.air): thrust pulls it up to cruise, gravity trades it for height (climbs
// bleed it, dives gain it), drag caps a dive. Slow planes turn sluggishly, and below stall speed the
// nose drops until she picks up speed again (unless the rock is close - then she just keeps avoiding).
export function flyPlane(state, e, tx, ty, dt, o) {
  const FL = config.FLIGHT;
  const fm = o.fm || {};
  const cruise = o.speed;
  const stall = fm.STALL_SPEED != null ? fm.STALL_SPEED : cruise * FL.STALL_SHARE;
  const maxSpeed = fm.MAX_SPEED || cruise * FL.MAX_SHARE;
  if (e.air == null) e.air = cruise;
  const air = e.air;
  let want = Math.atan2(ty - e.y, tx - e.x);
  const agility = Math.max(FL.SLOW_TURN, Math.min(FL.FAST_TURN, FL.SLOW_TURN + (1 - FL.SLOW_TURN) * (air / cruise)));
  let turn = o.turn * agility;
  const course = state.course;
  let avoiding = false;
  for (const t of [0.5, 1.0]) {
    const px = e.x + Math.cos(e.heading) * air * t;
    const py = e.y + Math.sin(e.heading) * air * t;
    const g = course ? groundAt(course, px, true, py) : Infinity;
    const c = course ? ceilAt(course, px, py) : -Infinity;
    const fwd = Math.cos(e.heading) >= 0 ? 1 : -1;
    if (py > g - 160) {
      want = Math.atan2(-1.2, fwd * 0.6); // climb!
      turn = o.turnAvoid * agility;
      avoiding = true;
      break;
    }
    if (py < c + 160) {
      want = Math.atan2(1.2, fwd * 0.6); // dive!
      turn = o.turnAvoid * agility;
      avoiding = true;
      break;
    }
    if (o.nearShip && o.nearShip(px, py, 200)) {
      want = Math.atan2(py < o.midY ? -1.2 : 1.2, fwd * 0.6);
      turn = o.turnAvoid * agility;
      avoiding = true;
      break;
    }
  }
  // Stall: too slow to fly, the nose drops (only with room below; hysteresis so it's a readable dip).
  const room = course ? groundAt(course, e.x, true, e.y) - e.y : Infinity;
  if (e.stalled ? air > stall * 1.2 : air < stall) e.stalled = !e.stalled;
  if (e.stalled && !avoiding && room > FL.STALL_ROOM) {
    want = Math.atan2(1, Math.cos(e.heading) >= 0 ? 0.25 : -0.25);
    turn = FL.STALL_PITCH;
  }
  // Damage: below half hp she wobbles and pulls to one side.
  const frac = o.max && e.hp != null ? e.hp / o.max : 1;
  const hurt = frac < 0.5 ? (0.5 - frac) / 0.5 : 0;
  e.hurt = hurt;
  const before = e.heading;
  if (o.forceTurn && !avoiding && !e.stalled) e.heading += o.forceTurn * agility * dt;
  else e.heading += Math.max(-turn * dt, Math.min(turn * dt, angDiff(want, e.heading)));
  if (hurt > 0) {
    e.wobT = (e.wobT || Math.random() * 6) + dt;
    if (!e.pullDir) e.pullDir = Math.random() < 0.5 ? -1 : 1;
    e.heading += (Math.sin(e.wobT * 9) + Math.sin(e.wobT * 5.3)) * 0.5 * FL.WOBBLE * hurt * dt + e.pullDir * FL.PULL * hurt * dt;
  }
  e.heading = Math.atan2(Math.sin(e.heading), Math.cos(e.heading));
  const dHead = angDiff(e.heading, before) / Math.max(dt, 1e-3);
  e.turning = Math.abs(dHead) / o.turn; // 1 = turning flat out
  // Bank for drawing, smoothed: -1..1 from the turn rate.
  e.bank = (e.bank || 0) + (Math.max(-1, Math.min(1, dHead / o.turn)) - (e.bank || 0)) * Math.min(1, dt * 6);
  // Airspeed: thrust up to cruise, gravity along the flight path, drag when over-fast.
  const thrust = fm.THRUST != null ? fm.THRUST : FL.THRUST;
  const gov = air < cruise ? Math.min(1, (cruise - air) / (cruise * 0.25)) : 0;
  const acc = thrust * gov * (1 - 0.4 * hurt) + (fm.GRAVITY != null ? fm.GRAVITY : FL.GRAVITY) * Math.sin(e.heading) - (fm.DRAG != null ? fm.DRAG : FL.DRAG) * Math.max(0, air - cruise);
  e.air = Math.max(cruise * FL.MIN_SHARE, Math.min(maxSpeed, air + acc * dt));
  // On screen the ship's own motion carries everything else backward.
  const scroll = o.noScroll ? 0 : scrollSpeed(state);
  e.vx = Math.cos(e.heading) * e.air - scroll;
  e.vy = Math.sin(e.heading) * e.air;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  trail(state, e, dt);
}

// A plane hitting the ship shoves her up or down (the way it came in) on top of the crash damage.
export function shoveShip(state, e, scale = 1) {
  const dir = -Math.max(-1, Math.min(1, (e.vy || 0) / Math.max(1, e.air || 400)));
  state.ship.vy = (state.ship.vy || 0) + dir * config.FLIGHT.RAM_KICK * scale;
}

// Contrail: a short line of points behind the plane, bright while it turns hard.
export function trail(state, e, dt) {
  const t = (e.trail = e.trail || []);
  const drift = scrollSpeed(state) * dt;
  for (const p of t) {
    p.x -= drift; // the air (and the trail in it) streams past the moving ship
    p.a -= dt * 1.4;
  }
  t.push({ x: e.x, y: e.y, a: Math.min(1, 0.25 + (e.turning || 0) * 0.75) });
  while (t.length && (t.length > 40 || t[0].a <= 0)) t.shift();
}

// Hurt planes trail smoke (thicker the worse they are).
export function smoke(e, max, puff) {
  if (e.hp <= max * 0.5 && Math.random() < (e.hp <= max * 0.25 ? 0.9 : 0.4)) puff(e.x - Math.cos(e.heading) * 30, e.y - Math.sin(e.heading) * 30, '#555', 1);
}

// Shot down: the plane spirals away trailing smoke, and the pilot bails out.
export function shootDown(state, e, kind = 'fighter') {
  state.wrecks.push({ x: e.x, y: e.y, vx: e.vx * 0.6, vy: e.vy * 0.4 - 60, spin: e.heading || 0, kind, spiral: Math.random() < 0.5 ? -1 : 1 });
  (state.chutes = state.chutes || []).push({ x: e.x, y: e.y - 20, vx: e.vx * 0.2, vy: -220, t: 0 });
}

// Parachutes drift down, sway, and are gone after a while (or on landing).
export function updateChutes(state, dt) {
  const drift = scrollSpeed(state) * dt;
  for (const c of state.chutes || []) {
    c.t += dt;
    c.vy += ((c.t > 0.6 ? 70 : 300) - c.vy) * Math.min(1, dt * 2);
    c.vx *= 1 - Math.min(1, dt);
    c.x += c.vx * dt - drift;
    c.y += c.vy * dt;
  }
  state.chutes = (state.chutes || []).filter((c) => c.t < 14 && !inRock(state, c.x, c.y + 20));
}
