// Navigation on the ship: walking along platforms, climbing connectors (ladders, rope, stairs,
// lift), falling onto the ship, and route-finding for bots and raiders.
//
// A "walker" (player or raider) has: x, y, d (platform index it stands on), and while climbing
// conn (connector index) and s (0 = top end, 1 = bottom end).
//
// B1: createNav(layout) builds one ship's navigation (its own route tables and lift speeds), refreshed by layout.onChange. The functions exported at the bottom
// are COMPATIBILITY forwards to ship 0's nav (ships.js: ship0.nav === mainNav); walkers use them until they are routed per ship (MOVEMENT.md B2).
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { config } from '../../config.js';
import { crossesGap, inGap } from './shipBuild.js'; // (holes in decks: an open cargo drop hatch, hatch.js)

const GRAB = 38; // how close (px) to a connector end you must be to grab it
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const GRAB_COST = 0.25; // seconds to get onto a ladder
const isPole = (c) => c.type === 'pole';

export function createNav(layout) {
  const P = layout.platforms;
  const C = layout.connectors;
  const gaps = []; // the holes in this ship's decks the walkers keep out of, and
  const holes = []; // the ones really open (setGaps, below)

  // Per-connector speed multiplier (e.g. the lift crawls without steam). Set by the game each frame.
  const connScale = []; // (one entry per connector, filled by rebuildNav)

  // Route-finding by TIME (seconds). Every connector has two end nodes (2i = top end, 2i+1 = bottom
  // end). Walking between two nodes on the same platform costs distance / walk speed, climbing costs
  // height / climb speed (poles are one-way: top -> bottom only). Floyd-Warshall gives the quickest
  // time between every pair of nodes; plan() adds the walk at each end.
  // The tables depend on the layout, so rebuildNav() fills them; it runs at creation and whenever a new ship build is applied to this layout.
  const WALK = config.MOVE.WALK_SPEED;
  const nodeAt = (n) => ({ d: n % 2 ? C[n >> 1].bottom : C[n >> 1].top, x: n % 2 ? C[n >> 1].xBottom : C[n >> 1].xTop });
  const climbTime = (c) => (P[c.bottom].y - P[c.top].y) / c.speed + GRAB_COST;
  let nodes = [];
  let nodesOn = [];
  let tt = [];
  const walk = (d, a, b) => (crossesGap(gaps, d, a, b) ? Infinity : Math.abs(a - b) / WALK); // (seconds to walk along deck d from a to b: never across a hole)
  function rebuildNav() {
    connScale.length = C.length;
    connScale.fill(1);
    buildTables();
  }
  function buildTables() {
    const NN = C.length * 2;
    nodes = Array.from({ length: NN }, (_, n) => nodeAt(n));
    nodesOn = P.map((_, d) => nodes.map((nd, n) => (nd.d === d ? n : -1)).filter((n) => n >= 0));
    tt = Array.from({ length: NN }, () => Array(NN).fill(Infinity));
    for (let a = 0; a < NN; a++) {
      tt[a][a] = 0;
      for (const b of nodesOn[nodes[a].d]) tt[a][b] = Math.min(tt[a][b], walk(nodes[a].d, nodes[a].x, nodes[b].x));
    }
    C.forEach((c, i) => {
      tt[2 * i][2 * i + 1] = Math.min(tt[2 * i][2 * i + 1], climbTime(c));
      if (!isPole(c)) tt[2 * i + 1][2 * i] = Math.min(tt[2 * i + 1][2 * i], climbTime(c));
    });
    for (let k = 0; k < NN; k++) for (let a = 0; a < NN; a++) for (let b = 0; b < NN; b++) if (tt[a][k] + tt[k][b] < tt[a][b]) tt[a][b] = tt[a][k] + tt[k][b];
  }
  rebuildNav();
  layout.onChange(rebuildNav);

  // The holes in the decks now (hatch.js calls this when a hatch opens or shuts): [{ d, x0, x1 }]. The route tables follow; nothing else about the nav is reset.
  // `gaps` is what the walkers keep out of (a hatch whose lever is pulled blocks them at once, `soft: true` while the doors are still shut); `holes` is the floor really gone (airborne.js, cargo.js).
  function setGaps(list) {
    const next = list.map((g) => ({ d: g.d, x0: g.x0, x1: g.x1, soft: !!g.soft }));
    if (next.length === gaps.length && next.every((g, i) => g.d === gaps[i].d && g.x0 === gaps[i].x0 && g.x1 === gaps[i].x1 && g.soft === gaps[i].soft)) return false;
    gaps.length = 0;
    gaps.push(...next);
    holes.length = 0;
    holes.push(...next.filter((g) => !g.soft));
    buildTables();
    return true;
  }

  // Quickest way from (d1, x1) to (d2, x2): { cost (seconds), node (the connector end to head for first) }.
  // node is -1 when already on the same platform (or there is no way). With a hole in between on the same deck the way goes round by a ladder, if there is one.
  function plan(d1, x1, d2, x2) {
    if (d1 === d2) {
      const direct = walk(d1, x1, x2);
      if (direct < Infinity) return { cost: direct, node: -1 };
    }
    let best = { cost: Infinity, node: -1 };
    for (const a of nodesOn[d1]) {
      const c = C[a >> 1];
      if (a % 2 && isPole(c)) continue; // cannot climb a pole
      const there = a % 2 ? 2 * (a >> 1) : 2 * (a >> 1) + 1;
      const first = walk(d1, x1, nodes[a].x) + climbTime(c);
      for (const b of nodesOn[d2]) {
        const cost = first + tt[there][b] + walk(d2, nodes[b].x, x2);
        if (cost < best.cost) best = { cost, node: a };
      }
    }
    return best;
  }

  // Seconds for a walker to reach platform d at x (Infinity if it cannot).
  function travelTime(w, d, x) {
    if (w.conn != null) {
      const c = C[w.conn];
      const h = P[c.bottom].y - P[c.top].y;
      const viaBottom = ((1 - w.s) * h) / c.speed + plan(c.bottom, c.xBottom, d, x).cost;
      if (isPole(c)) return viaBottom;
      return Math.min(viaBottom, (w.s * h) / c.speed + plan(c.top, c.xTop, d, x).cost);
    }
    return plan(w.d, w.x, d, x).cost;
  }

  const connPoint = (c, s) => ({
    x: c.xTop + (c.xBottom - c.xTop) * s,
    y: P[c.top].y + (P[c.bottom].y - P[c.top].y) * s,
  });

  // Highest platform under (x, y) whose span includes x, or null.
  function platformBelow(x, y) {
    let best = null;
    P.forEach((p, d) => {
      if (x >= p.x0 && x <= p.x1 && p.y >= y - 2 && (best === null || p.y < P[best].y) && !(holes.length && inGap(holes, d, x))) best = d; // (a hole in a deck is no floor)
    });
    return best;
  }

  // Step off a connector onto the nearer end (used when knocked out mid-climb, etc).
  function detach(w) {
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
  function fall(w, dt, speed, onMiss) {
    const prevY = w.y;
    w.y += speed * dt;
    const d = platformBelow(w.x, prevY);
    if (d !== null && w.y >= P[d].y) {
      w.y = P[d].y;
      w.d = d;
      w.fall = false;
      return false;
    }
    if (w.y > 1600 && onMiss) {
      onMiss(w);
      return false;
    }
    if (w.y > 1600) {
      // Missed the ship: drop back onto the catwalk from above.
      const cat = layout.spawnPlatform;
      w.x = clamp(w.x, P[cat].x0 + 30, P[cat].x1 - 30);
      w.y = -60;
    }
    return true;
  }

  // Apply joystick input (jx, jy in -1..1) to a walker for one frame.
  function moveWalker(w, jx, jy, dt, walkSpeed, climbScale = 1) {
    if (w.conn != null) {
      const c = C[w.conn];
      const h = P[c.bottom].y - P[c.top].y;
      // A slide pole carries you down by itself (fast, no stopping, no climbing back up).
      if (isPole(c)) jy = 1;
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
      const i = C.findIndex((c) => (up ? c.bottom === w.d && !isPole(c) && Math.abs(w.x - c.xBottom) < GRAB : c.top === w.d && Math.abs(w.x - c.xTop) < GRAB));
      if (i >= 0) {
        w.conn = i;
        w.s = up ? 1 : 0;
        w.climb = true;
        w.vx = 0;
        return;
      }
    }
    w.climb = false;
    // Momentum: speed up quickly, stop even quicker.
    const want = jx * walkSpeed;
    const v = w.vx || 0;
    const speedingUp = Math.abs(want) > Math.abs(v) && Math.sign(want) === Math.sign(v || want);
    const rate = (speedingUp ? config.MOVE.ACCEL : config.MOVE.BRAKE) * dt;
    w.vx = v + clamp(want - v, -rate, rate);
    let nx = clamp(w.x + w.vx * dt, p.x0, p.x1);
    if (gaps.length) for (const g of gaps) { // held at the edge of an open hatch (unless he is already in it: then he is falling)
      if (g.d !== w.d) continue;
      if (w.x <= g.x0 && nx > g.x0) nx = g.x0 - config.HATCH.EDGE_PUSH;
      else if (w.x >= g.x1 && nx < g.x1) nx = g.x1 + config.HATCH.EDGE_PUSH;
    }
    if (nx !== w.x + w.vx * dt) w.vx = 0; // bumped into the end of the deck
    w.x = nx;
    w.y = p.y;
    if (Math.abs(jx) > 0.15) w.face = jx < 0 ? -1 : 1;
  }

  // Which way a walker should push right now to get to platform d at x: { dir, arrived }.
  // dir is 'left' | 'right' | 'up' | 'down' (or null when there already / no way).
  function direction(w, d, x, near = 12) {
    if (w.conn != null) {
      const c = C[w.conn];
      if (isPole(c)) return { dir: 'down', arrived: false };
      const h = P[c.bottom].y - P[c.top].y;
      const viaBottom = ((1 - w.s) * h) / c.speed + plan(c.bottom, c.xBottom, d, x).cost;
      const viaTop = (w.s * h) / c.speed + plan(c.top, c.xTop, d, x).cost;
      return { dir: viaTop < viaBottom || (viaTop === viaBottom && w.s < 0.5) ? 'up' : 'down', arrived: false };
    }
    if (w.d === d && !crossesGap(gaps, d, w.x, x)) {
      const dx = x - w.x;
      if (Math.abs(dx) <= near) return { dir: null, arrived: true };
      return { dir: dx < 0 ? 'left' : 'right', arrived: false };
    }
    const best = plan(w.d, w.x, d, x);
    if (best.node < 0) return { dir: null, arrived: false };
    const entry = nodes[best.node].x;
    const dx = entry - w.x;
    if (Math.abs(dx) < 10) return { dir: best.node % 2 ? 'up' : 'down', arrived: false };
    return { dir: dx < 0 ? 'left' : 'right', arrived: false };
  }

  // Joystick input that moves a walker toward platform d at x. Returns { jx, jy, arrived }.
  function steerTo(w, d, x, near = 12) {
    const { dir, arrived } = direction(w, d, x, near);
    if (dir === 'up' || dir === 'down') return { jx: 0, jy: dir === 'up' ? -1 : 1, arrived };
    if (dir === null) return { jx: 0, jy: 0, arrived };
    const dx = dir === 'left' ? -1 : 1;
    const goalX = w.d === d && !crossesGap(gaps, d, w.x, x) ? x : nodes[plan(w.d, w.x, d, x).node].x;
    return { jx: dx * clamp(Math.abs(goalX - w.x) / 60, 0.3, 1), jy: 0, arrived: false };
  }

  // Is a point within reach on the same platform?
  const samePlatform = (a, b) => a.conn == null && b.conn == null && !a.fall && !b.fall && a.d === b.d;

  return { layout, connScale, rebuildNav, plan, travelTime, connPoint, platformBelow, detach, fall, moveWalker, direction, steerTo, samePlatform, setGaps, gaps, holes };
}

// Ship 0's navigation (ships.js attaches it as ship0.nav) and the module-level forwards the walkers still use.
export const mainNav = createNav(SHIP_LAYOUT); // lint-ok (a nav refreshes itself on layout.onChange)
export const { connScale, rebuildNav, plan, travelTime, connPoint, platformBelow, detach, fall, moveWalker, direction, steerTo, samePlatform } = mainNav;
