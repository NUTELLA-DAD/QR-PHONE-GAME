// Shared flying for enemy planes (after Bomber XXL): a plane always flies forward at speed and can
// only turn so fast, so it swoops in wide arcs, loops, and overshoots. It looks ahead along its nose
// and pulls up from the ground, dives away from rock above, and swerves off the ship - but it can
// still misjudge a mountain. It leaves contrails in hard turns and smoke when it's hurt; shot down,
// it spirals into the ground trailing smoke while the pilot bails out under a parachute.
import { config } from '../../config.js';
import { groundAt, ceilAt, inRock } from './course.js';
import { kickForce } from './forces.js';
import { mainShip } from './ships.js';
import { toShip, toShipX, toShipY } from './pose.js';
const hullPoint = (state, x, y) => toShip(mainShip(state), x, y); // (a plane's place in the world as a point on the ship: the one conversion the ram kicks need, as impact() callers make)

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export { angDiff };

// Fly plane e one step toward (tx, ty). o = { speed (cruise), turn, turnAvoid, nearShip(x, y, pad), midY }.
// o.forceTurn (radians/s) overrides the steering - used for loops. o.fm = the plane type's config block
// (THRUST, DRAG, STALL_SPEED, MAX_SPEED, GRAVITY, any of which falls back to config.FLIGHT), o.max = its
// full hp (for damage handling), o.noScroll = fly in the ship's own frame, carried along by her motion (bombers).
// Planes live in the WORLD (map coordinates): e.vx / e.vy are world velocities, nothing slides past.
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
  // (A plane that keeps station against the ship, like a bomber overhead, is carried along at her speed.)
  const carry = o.noScroll ? mainShip(state).pose.vx : 0;
  e.vx = Math.cos(e.heading) * e.air + carry;
  e.vy = Math.sin(e.heading) * e.air;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  trail(state, e, dt);
}

// A plane hitting the ship shoves her up or down (the way it came in) on top of the crash damage.
export function shoveShip(state, e, scale = 1) {
  const dir = -Math.max(-1, Math.min(1, (e.vy || 0) / Math.max(1, e.air || 400)));
  state.ship.vy = (state.ship.vy || 0) + dir * config.FLIGHT.RAM_KICK * scale;
  kickForce(state, hullPoint(state, e.x, e.y), 0, -dir, scale); // (and the blow twists her about the place it struck: forces.js)
}

// Big enemies (bombers, the cargo plane, the boss) don't crash into the ship, they bump off it.
// Call bounceStep every frame (counts the cooldown down and carries the bounce), then bumpShip:
// o = { hitsShip, impact, puff, hw, hh (half size), size (1 = bomber), hp: key of the hp field, dt }.
export function bounceStep(e, dt) {
  e.bumpCd = Math.max(0, (e.bumpCd || 0) - dt);
  if (!e.kx && !e.ky) return;
  e.x += (e.kx || 0) * dt;
  e.y += (e.ky || 0) * dt;
  const k = Math.max(0, 1 - config.BUMP.DECAY * dt);
  e.kx *= k;
  e.ky *= k;
  if (Math.abs(e.kx) + Math.abs(e.ky) < 5) e.kx = e.ky = 0;
}
export function bumpShip(state, e, o) {
  const B = config.BUMP;
  if (state.ship.down || (e.bumpCd || 0) > 0) return false;
  // Sample points across the body; any one inside the ship is a contact.
  let n = 0;
  let cx = 0;
  let cy = 0;
  for (const fx of [-1, -0.5, 0, 0.5, 1]) {
    for (const fy of [-1, 0, 1]) {
      const px = e.x + fx * o.hw;
      const py = e.y + fy * o.hh;
      if (o.hitsShip(toShipX(mainShip(state), px), toShipY(mainShip(state), py))) {
        n++;
        cx += px;
        cy += py;
      }
    }
  }
  if (!n) return false;
  cx /= n;
  cy /= n;
  let dx = e.x - cx;
  let dy = e.y - cy;
  const d = Math.hypot(dx, dy);
  if (d < 1) {
    dx = 0;
    dy = -1;
  } else {
    dx /= d;
    dy /= d;
  }
  e.bumpCd = B.COOLDOWN;
  e.x += dx * B.PUSH * o.size;
  e.y += dy * B.PUSH * o.size;
  e.kx = dx * B.BOUNCE;
  e.ky = dy * B.BOUNCE;
  // Our ship is shoved the other way, jolted and hurt; the enemy takes a knock too (never a kill).
  state.ship.vy = (state.ship.vy || 0) - dy * B.SHIP_KICK * o.size;
  state.ship.speed = Math.max(-0.4, Math.min(1, state.ship.speed - dx * B.SHIP_SPEED * o.size));
  kickForce(state, hullPoint(state, cx, cy), -dx, -dy, o.size); // (shoved the other way at the place they met: forces.js)
  o.impact(toShipX(mainShip(state), cx), toShipY(mainShip(state), cy), B.DAMAGE * o.size);
  o.puff(cx, cy, '#ffe9a8', 8);
  if (e[o.hp] != null) e[o.hp] = Math.max(1, e[o.hp] - B.SELF_DAMAGE);
  if (state.sfxQ) state.sfxQ.push(['clang', true]);
  return true;
}

// Contrail: a short line of points behind the plane, bright while it turns hard.
export function trail(state, e, dt) {
  const t = (e.trail = e.trail || []);
  for (const p of t) p.a -= dt * 1.4; // (the trail hangs in the air where it was drawn)
  t.push({ x: e.x, y: e.y, a: Math.min(1, 0.25 + (e.turning || 0) * 0.75) });
  while (t.length && (t.length > 40 || t[0].a <= 0)) t.shift();
}

// Hurt planes trail smoke (thicker the worse they are).
export function smoke(e, max, puff) {
  if (e.hp <= max * 0.5 && Math.random() < (e.hp <= max * 0.25 ? 0.9 : 0.4)) puff(e.x - Math.cos(e.heading) * 30, e.y - Math.sin(e.heading) * 30, '#555', 1);
}

// Shot down: the plane spirals away trailing smoke, and the pilot bails out.
export function shootDown(state, e, kind = 'fighter') {
  state.wrecks.push({ x: e.x, y: e.y, vx: (e.vx - mainShip(state).pose.vx) * 0.6, vy: e.vy * 0.4 - 60, spin: e.heading || 0, kind, spiral: Math.random() < 0.5 ? -1 : 1, grace: 0.8 }); // grace: can't hit the ship straight away (a plane that rammed us already did)
  (state.chutes = state.chutes || []).push({ x: e.x, y: e.y - 20, vx: (e.vx - mainShip(state).pose.vx) * 0.2, vy: -220, t: 0 });
}

// Parachutes drift down, sway, and are gone after a while (or on landing).
export function updateChutes(state, dt) {
  for (const c of state.chutes || []) {
    c.t += dt;
    c.vy += ((c.t > 0.6 ? 70 : 300) - c.vy) * Math.min(1, dt * 2);
    c.vx *= 1 - Math.min(1, dt);
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
  state.chutes = (state.chutes || []).filter((c) => c.t < 14 && !inRock(state, c.x, c.y + 20));
}
