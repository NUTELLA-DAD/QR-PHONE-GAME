// Shared flying for enemy planes (after Bomber XXL): a plane always flies forward at speed and can
// only turn so fast, so it swoops in wide arcs, loops, and overshoots. It looks ahead along its nose
// and pulls up from the ground, dives away from rock above, and swerves off the ship - but it can
// still misjudge a mountain. It leaves contrails in hard turns and smoke when it's hurt; shot down,
// it spirals into the ground trailing smoke while the pilot bails out under a parachute.
import { groundAt, ceilAt, inRock, scrollSpeed } from './course.js';

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export { angDiff };

// Fly plane e one step toward (tx, ty). o = { speed, turn, turnAvoid, nearShip(x, y, pad), midY }.
// o.forceTurn (radians/s) overrides the steering - used for loops.
export function flyPlane(state, e, tx, ty, dt, o) {
  let want = Math.atan2(ty - e.y, tx - e.x);
  let turn = o.turn;
  const course = state.course;
  for (const t of [0.5, 1.0]) {
    const px = e.x + Math.cos(e.heading) * o.speed * t;
    const py = e.y + Math.sin(e.heading) * o.speed * t;
    const g = course ? groundAt(course, px, true, py) : Infinity;
    const c = course ? ceilAt(course, px, py) : -Infinity;
    const fwd = Math.cos(e.heading) >= 0 ? 1 : -1;
    if (py > g - 160) {
      want = Math.atan2(-1.2, fwd * 0.6); // climb!
      turn = o.turnAvoid;
      break;
    }
    if (py < c + 160) {
      want = Math.atan2(1.2, fwd * 0.6); // dive!
      turn = o.turnAvoid;
      break;
    }
    if (o.nearShip && o.nearShip(px, py, 200)) {
      want = Math.atan2(py < o.midY ? -1.2 : 1.2, fwd * 0.6);
      turn = o.turnAvoid;
      break;
    }
  }
  const before = e.heading;
  if (o.forceTurn && turn === o.turn) e.heading += o.forceTurn * dt;
  else e.heading += Math.max(-turn * dt, Math.min(turn * dt, angDiff(want, e.heading)));
  e.heading = Math.atan2(Math.sin(e.heading), Math.cos(e.heading));
  e.turning = Math.abs(angDiff(e.heading, before)) / Math.max(dt, 1e-3) / o.turn; // 1 = turning flat out
  // Faster in a dive, slower in a climb.
  const speed = o.speed * (1 + 0.18 * Math.sin(e.heading));
  // On screen the ship's own motion carries everything else backward.
  e.vx = Math.cos(e.heading) * speed - scrollSpeed(state);
  e.vy = Math.sin(e.heading) * speed;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  trail(state, e, dt);
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
