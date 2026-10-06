// Mission maps: a grid of rock and open air the ship flies through in any direction - caverns
// joined by tunnels and vertical shafts, with side branches that dead-end.
//
// Map coordinates (mx, my) are pixels; the course turns them into world coordinates with
// wx = mx - course.dist (the world scrolls past the ship), wy = my.
//
// Two kinds of map:
//   'network' - a branching cave network: find your way through to the goal.
//   'route'   - one winding passage that climbs, drops and doubles back (no wrong turns).
import { config } from '../../config.js';

// The ship's box around its centre point (ship coords centre = 800, 500), in pixels.
export const SHIP_BOX = { left: -900, right: 870, up: -570, down: 485 };

// Build a map, checking the ship really can get from the start to the beacon (try again if not).
export function makeMap(kind, level, rand) {
  let map = null;
  for (let tries = 0; tries < 12; tries++) {
    map = buildMap(kind, level, rand);
    if (map.startDist < 1e9) return map;
  }
  return map;
}

function buildMap(kind, level, rand) {
  const M = config.MAPS;
  const C = M.CELL;
  const r = (a, b) => a + rand() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const W = Math.round(M.WIDTH + M.WIDTH_PER_LEVEL * (level - 1));
  const H = Math.round(M.HEIGHT + M.HEIGHT_PER_LEVEL * (level - 1));
  const solid = new Uint8Array(W * H).fill(1);
  const idx = (i, j) => j * W + i;
  const carve = (i0, j0, i1, j1) => {
    for (let j = Math.max(2, Math.min(j0, j1)); j <= Math.min(H - 3, Math.max(j0, j1)); j++) {
      for (let i = Math.max(2, Math.min(i0, i1)); i <= Math.min(W - 3, Math.max(i0, i1)); i++) solid[idx(i, j)] = 0;
    }
  };
  const TUN = M.TUNNEL_CELLS; // tunnel height (cells)
  const SHAFT = M.SHAFT_CELLS; // shaft width (cells)
  // Join two room centres: along, then up/down (or the other way round), wide enough for the ship.
  const join = (a, b) => {
    const hFirst = rand() < 0.5;
    const mid = hFirst ? { i: b.i, j: a.j } : { i: a.i, j: b.j };
    const leg = (p, q) => {
      if (p.j === q.j) carve(p.i, p.j - Math.floor(TUN / 2), q.i, p.j + Math.ceil(TUN / 2));
      else carve(p.i - Math.floor(SHAFT / 2), p.j, p.i + Math.ceil(SHAFT / 2), q.j);
    };
    leg(a, mid);
    leg(mid, b);
    // Round the corner so the ship can make the turn.
    carve(mid.i - Math.floor(SHAFT / 2), mid.j - Math.floor(TUN / 2), mid.i + Math.ceil(SHAFT / 2), mid.j + Math.ceil(TUN / 2));
  };
  const room = (i, j, w, h) => {
    carve(i - Math.floor(w / 2), j - Math.floor(h / 2), i + Math.ceil(w / 2), j + Math.ceil(h / 2));
    return { i, j, w, h };
  };

  // The main path of caverns from start (left) to goal.
  const rooms = [];
  const n = M.ROOMS + Math.floor(level / 2);
  let j = ri(Math.floor(H * 0.35), Math.floor(H * 0.65));
  for (let k = 0; k < n; k++) {
    const i = Math.round(12 + ((W - 26) * k) / (n - 1));
    if (kind === 'route') {
      // A winding route swings hard up and down between caverns.
      j = k === 0 ? j : j + (rand() < 0.5 ? -1 : 1) * ri(Math.floor(H * 0.25), Math.floor(H * 0.45));
    } else j += ri(-Math.floor(H * 0.3), Math.floor(H * 0.3));
    j = Math.max(9, Math.min(H - 10, j));
    rooms.push(room(i, j, k === 0 || k === n - 1 ? 22 : ri(14, 22), k === 0 || k === n - 1 ? 13 : ri(10, 15)));
  }
  for (let k = 1; k < rooms.length; k++) {
    if (kind === 'route' && rand() < 0.5) {
      // Double back: go past, loop round and come back to it.
      const a = rooms[k - 1];
      const b = rooms[k];
      const detour = { i: b.i + ri(6, 10), j: Math.max(9, Math.min(H - 10, a.j + (b.j > a.j ? -1 : 1) * ri(6, 10))) };
      room(detour.i, detour.j, 14, 11);
      join(a, detour);
      join(detour, b);
    } else join(rooms[k - 1], rooms[k]);
  }
  // Side branches that dead-end (network maps), sometimes looping back in.
  if (kind === 'network') {
    const branches = M.BRANCHES + level;
    for (let k = 0; k < branches; k++) {
      const from = rooms[ri(1, rooms.length - 2)];
      const to = { i: Math.max(14, Math.min(W - 15, from.i + ri(-14, 14))), j: Math.max(9, Math.min(H - 10, from.j + (rand() < 0.5 ? -1 : 1) * ri(10, 20))) };
      room(to.i, to.j, ri(12, 18), ri(9, 13));
      join(from, to);
      if (rand() < 0.3) join(to, rooms[Math.min(rooms.length - 1, rooms.indexOf(from) + 1)]);
    }
  }

  // Roughen the walls: nibble rock that's mostly surrounded by air (never adds rock, so the
  // passages stay wide enough).
  for (let pass = 0; pass < 2; pass++) {
    const copy = solid.slice();
    for (let jj = 3; jj < H - 3; jj++) {
      for (let ii = 3; ii < W - 3; ii++) {
        if (!copy[idx(ii, jj)]) continue;
        let air = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) air += 1 - copy[idx(ii + di, jj + dj)];
        if (air >= 4 && rand() < 0.45) solid[idx(ii, jj)] = 0;
      }
    }
  }

  // Where the ship's centre can be (its whole box clear of rock), and the distance from there to
  // the goal along the way the ship fits (for the autopilot, bots, minimap and hints).
  const pre = new Int32Array((W + 1) * (H + 1));
  for (let jj = 0; jj < H; jj++) {
    for (let ii = 0; ii < W; ii++) pre[(jj + 1) * (W + 1) + ii + 1] = solid[idx(ii, jj)] + pre[jj * (W + 1) + ii + 1] + pre[(jj + 1) * (W + 1) + ii] - pre[jj * (W + 1) + ii];
  }
  const rockIn = (i0, j0, i1, j1) => {
    if (i0 < 0 || j0 < 0 || i1 >= W || j1 >= H) return 1;
    return pre[(j1 + 1) * (W + 1) + i1 + 1] - pre[j0 * (W + 1) + i1 + 1] - pre[(j1 + 1) * (W + 1) + i0] + pre[j0 * (W + 1) + i0];
  };
  const bl = Math.ceil(-SHIP_BOX.left / C);
  const br = Math.ceil(SHIP_BOX.right / C);
  const bu = Math.ceil(-SHIP_BOX.up / C);
  const bd = Math.ceil(SHIP_BOX.down / C);
  const fit = new Uint8Array(W * H);
  for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) fit[idx(ii, jj)] = rockIn(ii - bl, jj - bu, ii + br, jj + bd) === 0 ? 1 : 0;

  const start = rooms[0];
  const goal = rooms[rooms.length - 1];
  const nearestFit = (ci, cj) => {
    let best = null;
    for (let d = 0; d < 20 && !best; d++) {
      for (let dj = -d; dj <= d && !best; dj++) for (let di = -d; di <= d; di++) if (fit[idx(Math.max(0, Math.min(W - 1, ci + di)), Math.max(0, Math.min(H - 1, cj + dj)))]) { best = { i: ci + di, j: cj + dj }; break; }
    }
    return best || { i: ci, j: cj };
  };
  const s = nearestFit(start.i, start.j);
  const g = nearestFit(goal.i, goal.j);
  const dist = new Int32Array(W * H).fill(1e9);
  const queue = [idx(g.i, g.j)];
  dist[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const ci = c % W;
    const cj = (c - ci) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nc = idx(ni, nj);
      if (!fit[nc] || dist[nc] <= dist[c] + 1) continue;
      dist[nc] = dist[c] + 1;
      queue.push(nc);
    }
  }

  // Floor guns around the caverns (not in the start cavern).
  const turrets = [];
  for (const rm of rooms.slice(1)) {
    const tries = Math.round(r(0, 1.2 + level * 0.5));
    for (let k = 0; k < tries; k++) {
      const ii = ri(rm.i - Math.floor(rm.w / 2), rm.i + Math.floor(rm.w / 2));
      // Drop down to the floor.
      let jj = rm.j;
      while (jj < H - 2 && !solid[idx(ii, jj + 1)]) jj++;
      if (jj >= H - 3) continue;
      turrets.push({ mx: (ii + 0.5) * C, my: (jj + 1) * C });
    }
  }

  return {
    kind,
    level,
    CELL: C,
    W,
    H,
    solid,
    fit,
    dist,
    start: { x: (s.i + 0.5) * C, y: (s.j + 0.5) * C },
    goal: { x: (g.i + 0.5) * C, y: (g.j + 0.5) * C },
    startDist: dist[idx(s.i, s.j)],
    turrets,
    rooms: rooms.map((q) => ({ x: q.i * C, y: q.j * C })),
  };
}

// ---------- Queries (map coordinates) ----------
export function solidAt(map, mx, my) {
  const i = Math.floor(mx / map.CELL);
  const j = Math.floor(my / map.CELL);
  if (i < 0 || j < 0 || i >= map.W || j >= map.H) return true;
  return map.solid[j * map.W + i] === 1;
}

// The rock surface below / above a point (or far away if open for a long way).
export function floorBelow(map, mx, my) {
  const C = map.CELL;
  const i = Math.floor(mx / C);
  let j = Math.floor(my / C);
  if (i < 0 || i >= map.W) return my;
  if (solidAt(map, mx, my)) return my; // already inside rock
  for (let k = 0; k < 60 && j < map.H; k++, j++) if (map.solid[(j + 1) * map.W + i]) return (j + 1) * C;
  return map.H * C;
}
export function roofAbove(map, mx, my) {
  const C = map.CELL;
  const i = Math.floor(mx / C);
  let j = Math.floor(my / C);
  if (i < 0 || i >= map.W) return my;
  if (solidAt(map, mx, my)) return my;
  for (let k = 0; k < 60 && j > 0; k++, j--) if (map.solid[(j - 1) * map.W + i]) return j * C;
  return 0;
}

// Distance (in cells) to the goal from the ship centre at (mx, my); Infinity if unknown.
export function distToGoal(map, mx, my) {
  const i = Math.floor(mx / map.CELL);
  const j = Math.floor(my / map.CELL);
  if (i < 0 || j < 0 || i >= map.W || j >= map.H) return Infinity;
  const d = map.dist[j * map.W + i];
  return d >= 1e9 ? Infinity : d;
}

// The way to go: a point a few steps further along the route to the goal from (mx, my).
export function routeAhead(map, mx, my, steps = 6) {
  const C = map.CELL;
  let i = Math.floor(mx / C);
  let j = Math.floor(my / C);
  // If the ship's centre isn't on a spot where it fits, find the nearest one that is.
  if (!(i >= 0 && j >= 0 && i < map.W && j < map.H) || map.dist[j * map.W + i] >= 1e9) {
    let best = null;
    for (let d = 1; d < 12 && !best; d++) {
      for (let dj = -d; dj <= d; dj++) {
        for (let di = -d; di <= d; di++) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= map.W || nj >= map.H || map.dist[nj * map.W + ni] >= 1e9) continue;
          if (!best || map.dist[nj * map.W + ni] < map.dist[best.j * map.W + best.i]) best = { i: ni, j: nj };
        }
      }
    }
    if (!best) return null;
    i = best.i;
    j = best.j;
  }
  for (let k = 0; k < steps; k++) {
    let best = null;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= map.W || nj >= map.H) continue;
      const d = map.dist[nj * map.W + ni];
      if (d < map.dist[j * map.W + i] && (!best || d < best.d)) best = { i: ni, j: nj, d };
    }
    if (!best) break;
    i = best.i;
    j = best.j;
  }
  return { x: (i + 0.5) * C, y: (j + 0.5) * C };
}
