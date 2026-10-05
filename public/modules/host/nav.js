// Navigation on the ship: walking along platforms, climbing connectors (ladders, rope, stairs,
// lift), falling onto the ship, and route-finding for bots and raiders.
//
// A "walker" (player or raider) has: x, y, d (platform index it stands on), and while climbing
// conn (connector index) and s (0 = top end, 1 = bottom end).
import { SHIP_LAYOUT } from '../../shipLayout.js';

const P = SHIP_LAYOUT.platforms;
const C = SHIP_LAYOUT.connectors;
const GRAB = 30; // how close (px) to a connector end you must be to grab it
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Per-connector speed multiplier (e.g. the lift crawls without steam). Set by the game each frame.
export const connScale = C.map(() => 1);

// Number of connector hops between every pair of platforms.
const hops = P.map((_, from) => {
  const dist = P.map(() => Infinity);
  dist[from] = 0;
  const queue = [from];
  while (queue.length) {
    const d = queue.shift();
    for (const c of C) {
      const next = c.top === d ? c.bottom : c.bottom === d ? c.top : -1;
      if (next >= 0 && dist[next] === Infinity) {
        dist[next] = dist[d] + 1;
        queue.push(next);
      }
    }
  }
  return dist;
});

export const connPoint = (c, s) => ({
  x: c.xTop + (c.xBottom - c.xTop) * s,
  y: P[c.top].y + (P[c.bottom].y - P[c.top].y) * s,
});

// Highest platform under (x, y) whose span includes x, or null.
export function platformBelow(x, y) {
  let best = null;
  P.forEach((p, d) => {
    if (x >= p.x0 && x <= p.x1 && p.y >= y - 2 && (best === null || p.y < P[best].y)) best = d;
  });
  return best;
}

// Step off a connector onto the nearer end (used when knocked out mid-climb, etc).
export function detach(w) {
  if (w.conn == null) return;
  const c = C[w.conn];
  const top = w.s < 0.5;
  w.d = top ? c.top : c.bottom;
  w.x = top ? c.xTop : c.xBottom;
  w.y = P[w.d].y;
  w.conn = null;
  w.climb = false;
}

// Drop from the sky until landing on a platform. Returns true while still falling.
export function fall(w, dt, speed) {
  const prevY = w.y;
  w.y += speed * dt;
  const d = platformBelow(w.x, prevY);
  if (d !== null && w.y >= P[d].y) {
    w.y = P[d].y;
    w.d = d;
    w.fall = false;
    return false;
  }
  if (w.y > 1600) {
    // Missed the ship: drop back onto the catwalk from above.
    const cat = P.findIndex((p) => p.id === 'catwalk');
    w.x = clamp(w.x, P[cat].x0 + 30, P[cat].x1 - 30);
    w.y = -60;
  }
  return true;
}

// Apply joystick input (jx, jy in -1..1) to a walker for one frame.
export function moveWalker(w, jx, jy, dt, walkSpeed, climbScale = 1) {
  if (w.conn != null) {
    const c = C[w.conn];
    const h = P[c.bottom].y - P[c.top].y;
    if (Math.abs(jy) > 0.4) w.s = clamp(w.s + (jy * c.speed * connScale[w.conn] * climbScale * dt) / h, 0, 1);
    const pt = connPoint(c, w.s);
    w.x = pt.x;
    w.y = pt.y;
    if (w.s <= 0 && jy < -0.4) {
      w.conn = null;
      w.d = c.top;
    } else if (w.s >= 1 && jy > 0.4) {
      w.conn = null;
      w.d = c.bottom;
    }
    w.climb = w.conn != null;
    if (w.climb && c.xBottom !== c.xTop) w.face = (c.xBottom - c.xTop) * jy > 0 ? 1 : -1;
    return;
  }
  const p = P[w.d];
  if (Math.abs(jy) > 0.4) {
    const up = jy < 0;
    const i = C.findIndex((c) => (up ? c.bottom === w.d && Math.abs(w.x - c.xBottom) < GRAB : c.top === w.d && Math.abs(w.x - c.xTop) < GRAB));
    if (i >= 0) {
      w.conn = i;
      w.s = up ? 1 : 0;
      w.climb = true;
      return;
    }
  }
  w.climb = false;
  w.x = clamp(w.x + jx * walkSpeed * dt, p.x0, p.x1);
  w.y = p.y;
  if (Math.abs(jx) > 0.15) w.face = jx < 0 ? -1 : 1;
}

// Joystick input that moves a walker toward platform d at x. Returns { jx, jy, arrived }.
export function steerTo(w, d, x, near = 12) {
  if (w.conn != null) {
    const c = C[w.conn];
    const goUp = hops[c.top][d] < hops[c.bottom][d] || (hops[c.top][d] === hops[c.bottom][d] && w.s < 0.5);
    return { jx: 0, jy: goUp ? -1 : 1, arrived: false };
  }
  if (w.d === d) {
    const dx = x - w.x;
    if (Math.abs(dx) <= near) return { jx: 0, jy: 0, arrived: true };
    return { jx: Math.sign(dx) * clamp(Math.abs(dx) / 60, 0.3, 1), jy: 0, arrived: false };
  }
  // Pick the connector from here that gets closest to the goal, preferring shorter walks.
  let best = null;
  for (const c of C) {
    const down = c.top === w.d;
    if (!down && c.bottom !== w.d) continue;
    const other = down ? c.bottom : c.top;
    const entry = down ? c.xTop : c.xBottom;
    const exit = down ? c.xBottom : c.xTop;
    const cost = hops[other][d] * 2000 + Math.abs(w.x - entry) + (other === d ? Math.abs(exit - x) : 0);
    if (!best || cost < best.cost) best = { cost, entry, down };
  }
  if (!best) return { jx: 0, jy: 0, arrived: false };
  const dx = best.entry - w.x;
  if (Math.abs(dx) < 10) return { jx: 0, jy: best.down ? 1 : -1, arrived: false };
  return { jx: Math.sign(dx) * clamp(Math.abs(dx) / 60, 0.3, 1), jy: 0, arrived: false };
}

// Is a point within reach on the same platform?
export const samePlatform = (a, b) => a.conn == null && b.conn == null && !a.fall && !b.fall && a.d === b.d;
