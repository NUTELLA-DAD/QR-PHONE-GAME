// Mission maps: a grid of rock and open air the ship flies through in any direction - caverns
// joined by tunnels and vertical shafts, with side branches that dead-end.
//
// Map coordinates (mx, my) are pixels, and they ARE the world coordinates (M.1: wx = mx, wy = my; the ship's pose says where she is in them).
//
// Two kinds of map:
//   'network' - a branching cave network: find your way through to the goal.
//   'route'   - one winding passage that climbs, drops and doubles back (no wrong turns).
import { config } from '../../config.js';

// The ship's box around its centre point (the layout's refPoint: 800, 500 on the classic ship), in pixels. (B1: the maps are fitted to the ship whose `layout` is passed.)
export function shipBox(layout) {
  const F = layout.fitBox;
  const R = layout.refPoint;
  return { left: F.x0 - R.x, right: F.x1 - R.x, up: F.y0 - R.y, down: F.y1 - R.y };
}

// Build a map, checking the ship really can get from the start to the beacon (try again if not).
export function makeMap(kind, level, rand, lengthMul = 1, layout, creature = null) { // (lengthMul: a session mode's map length factor, config.VOYAGE.MODES; creature: which lair a 'lair' map is, 'kraken' or 'drake')
  let map = null;
  for (let tries = 0; tries < 40; tries++) {
    // (Late-voyage open maps are so crowded with peaks and islands that no layout may pass the checks below; rather than
    // settle for the last, unplayable try, ease off one level every few failures so a playable map always comes out.)
    map = kind === 'lair' ? (creature === 'drake' ? buildDrakeLairMap(level, rand, lengthMul, layout) : buildLairMap(level, rand, lengthMul, layout)) : kind === 'open' ? buildOpenMap(Math.max(1, level - Math.floor(tries / config.MAPS.EASE_EVERY)), rand, lengthMul, layout) : buildMap(kind, level, rand, lengthMul, layout);
    if (map.startDist >= 1e9) continue;
    if (map.lair) return map; // (no outposts to reach: the lair's middle is the goal)
    if (map.open) {
      // Every outpost must be reachable too.
      const C = map.CELL;
      const si = Math.floor(map.start.x / C);
      const sj = Math.floor(map.start.y / C);
      // The ship must really be able to hover over every gun so the bomb bay can reach it: a spot
      // it fits exactly at the station square (not in a pocket or valley it can never enter),
      // not far below it, and a way there from the start.
      const M = config.MAPS;
      const stations = []; // the fit cell over the first gun of each outpost
      let ok = map.outposts.every((o) => o.guns.every((g, gi) => {
        const st = stationCell(map, { x: g.mx, y: g.my - 20 });
        setGoal(map, st);
        const dj = Math.floor(map.goal.y / C) - st.j;
        const di = Math.abs(Math.floor(map.goal.x / C) - st.i);
        if (gi === 0) stations.push({ i: Math.floor(map.goal.x / C), j: Math.floor(map.goal.y / C) });
        // ...and nothing (a floating island, an overhang) between the bomb bay and the gun.
        const gcol = Math.floor(g.mx / C);
        let clear = true;
        for (let j = Math.floor(map.goal.y / C) + 2; j < Math.floor(g.my / C) && clear; j++) if (map.solid[j * map.W + gcol] || (map.solid[j * map.W + gcol - 1] && map.solid[j * map.W + gcol + 1])) clear = false;
        return clear && map.dist[sj * map.W + si] < 1e9 && dj <= M.STATION_SLACK && dj >= -12 && di === 0;
      }));
      // No huge detours over mountains: the way from the start to an outpost, and from one outpost
      // to the next, stays close to the straight-line trip (this is what sets how long it takes).
      const longWay = (from, to) => map.dist[from.j * map.W + from.i] > M.DETOUR * (Math.abs(from.i - to.i) + Math.abs(from.j - to.j)) + 12;
      for (let k = 0; k < stations.length && ok; k++) {
        const g0 = map.outposts[k].guns[0];
        setGoal(map, stationCell(map, { x: g0.mx, y: g0.my - 20 }));
        if (longWay({ i: si, j: sj }, stations[k])) ok = false;
        for (let m = 0; m < stations.length && ok; m++) if (m !== k && longWay(stations[m], stations[k])) ok = false;
      }
      setGoal(map, stationCell(map, map.outposts[0]));
      map.startDist = map.dist[sj * map.W + si];
      if (!ok) continue;
    }
    return map;
  }
  return map;
}

function buildMap(kind, level, rand, lengthMul = 1, layout) {
  const M = config.MAPS;
  const C = M.CELL;
  const r = (a, b) => a + rand() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const W = Math.round((M.WIDTH + M.WIDTH_PER_LEVEL * (level - 1)) * M.LENGTH[kind] * lengthMul);
  const H = Math.round(M.HEIGHT + M.HEIGHT_PER_LEVEL * (level - 1));
  const solid = new Uint8Array(W * H).fill(1);
  const idx = (i, j) => j * W + i;
  const carve = (i0, j0, i1, j1) => {
    for (let j = Math.max(2, Math.min(j0, j1)); j <= Math.min(H - 3, Math.max(j0, j1)); j++) {
      for (let i = Math.max(2, Math.min(i0, i1)); i <= Math.min(W - 3, Math.max(i0, i1)); i++) solid[idx(i, j)] = 0;
    }
  };
  const TUN = layout.caveNeed.tunnel + M.TUNNEL_SLACK; // tunnel height (cells)
  const SHAFT = layout.caveNeed.shaft + M.SHAFT_SLACK; // shaft width (cells)
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
  const map = { kind, level, CELL: C, W, H, solid, turrets, outposts: [] };
  finishMap(map, rooms[0], rooms[rooms.length - 1], layout);
  return map;
}

// Open sky: hills and mountains below, floating rock islands, and enemy outposts (gun nests and
// rocket batteries) to destroy in any order.
function buildOpenMap(level, rand, lengthMul = 1, layout) {
  const M = config.MAPS;
  const C = M.CELL;
  const r = (a, b) => a + rand() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const W = Math.round((M.OPEN_WIDTH + M.WIDTH_PER_LEVEL * (level - 1)) * M.LENGTH.open * lengthMul);
  const H = Math.round(M.OPEN_HEIGHT + M.HEIGHT_PER_LEVEL * (level - 1));
  const solid = new Uint8Array(W * H);
  const idx = (i, j) => j * W + i;
  // Ground: rolling hills with a few tall mountains.
  const s1 = r(0, 6);
  const s2 = r(0, 6);
  const peaks = Array.from({ length: 3 + level }, () => ({ i: ri(30, W - 20), h: r(10, H * 0.55), w: r(6, 14) }));
  const groundTop = (i) => {
    let h = 5 + 3 * Math.sin(i * 0.07 + s1) + 2 * Math.sin(i * 0.19 + s2);
    for (const p of peaks) h = Math.max(h, p.h * Math.max(0, 1 - Math.abs(i - p.i) / p.w));
    return Math.round(H - 3 - h);
  };
  const tops = [];
  for (let i = 0; i < W; i++) {
    const t = i < 26 ? H - 6 : groundTop(i); // flat ground under the start
    tops.push(t);
    for (let j = t; j < H; j++) solid[idx(i, j)] = 1;
  }
  // Floating islands.
  const islands = [];
  for (let k = 0; k < 5 + level; k++) {
    const ci = ri(34, W - 16);
    const cj = ri(8, Math.max(9, tops[ci] - 18));
    const rx = r(4, 9);
    const ry = r(2.5, 4.5);
    islands.push({ i: ci, j: cj, rx, ry });
    for (let j = Math.floor(cj - ry); j <= Math.ceil(cj + ry * 1.8); j++) {
      for (let i = Math.floor(ci - rx); i <= Math.ceil(ci + rx); i++) {
        if (i < 0 || j < 2 || i >= W || j >= H) continue;
        const u = (i - ci) / rx;
        const v = j < cj ? (j - cj) / ry : (j - cj) / (ry * 1.8); // rounded top, pointy bottom
        if (u * u + v * v <= 1) solid[idx(i, j)] = 1;
      }
    }
  }
  // Outposts: gun nests on the ground or on island tops, spread along the map.
  const outposts = [];
  const n = M.OUTPOSTS + Math.floor(level / 2);
  for (let k = 0; k < n; k++) {
    const want = Math.round(40 + ((W - 55) * (k + 0.5)) / n);
    let ci = want;
    let surface = tops[ci];
    const isl = islands.find((q) => Math.abs(q.i - want) < 12 && rand() < 0.5);
    if (isl) {
      ci = isl.i;
      surface = Math.floor(isl.j - isl.ry) + 1;
      while (surface > 2 && solid[idx(ci, surface - 1)]) surface--;
    }
    const guns = [];
    for (const di of (level >= 5 ? [-3, 0, 3] : [-2, 2])) {
      const i = ci + di;
      if (i < 0 || i >= W) continue;
      let j = surface - 3;
      while (j < H - 1 && !solid[idx(i, j + 1)]) j++;
      if (j > surface + 1) continue; // (the ground drops away here: keep the guns together)
      guns.push({ mx: (i + 0.5) * C, my: (j + 1) * C, outpost: k });
    }
    if (!guns.length) {
      let j = surface - 3;
      while (j < H - 1 && !solid[idx(ci, j + 1)]) j++;
      guns.push({ mx: (ci + 0.5) * C, my: (j + 1) * C, outpost: k });
    }
    outposts.push({ x: (ci + 0.5) * C, y: surface * C, done: false });
    for (const g of guns) g.outpost = outposts.length - 1;
    outposts[outposts.length - 1].guns = guns;
  }
  const turrets = outposts.flatMap((o) => o.guns);
  const map = { kind: 'open', level, CELL: C, W, H, solid, turrets, outposts, open: true };
  // Aim first for the station above the first outpost.
  finishMap(map, { i: 12, j: H - 14 }, stationCell(map, outposts[0]), layout);
  return map;
}

// THE KRAKEN'S LAIR (config.CREATURES.LAIR, voyage.js markLairs, course.js startMission): open sky over a sea, no outposts and no guns. A flat sea floor deep under the waves, and a few ROCK SPIRES standing out of the water
// (the one at the lair's middle is right under her when she hovers there: the TOW win drags the exhausted creature onto it). The route runs level from the launch to the lair's middle, RUN px on; the sea lies SEA_BELOW px
// under the launch height (map.seaY is set here, so the Sunken Sea does not work it out from the route). map.spires lists them: { x, w (width at the sea line), top } in map pixels.
function buildLairMap(level, rand, lengthMul = 1, layout) {
  const M = config.MAPS, LR = config.CREATURES.LAIR, C = M.CELL;
  const r = (a, b) => a + rand() * (b - a);
  const startI = 12, goalI = startI + Math.round((LR.RUN * lengthMul) / C);
  const W = goalI + Math.round(LR.BEYOND / C) + 20, H = M.OPEN_HEIGHT;
  const sj = 28, seaRow = sj + Math.round(LR.SEA_BELOW / C), floorRow = H - 3;
  const solid = new Uint8Array(W * H);
  const idx = (i, j) => j * W + i;
  for (let i = 0; i < W; i++) for (let j = floorRow; j < H; j++) solid[idx(i, j)] = 1;
  const spires = [];
  for (const [dc, jit] of LR.SPIRES) {
    const ci = Math.max(startI + 25, Math.min(W - 14, goalI + dc + Math.round(r(-jit, jit))));
    const topRow = seaRow - Math.max(2, Math.round(r(LR.SPIRE_UP[0], LR.SPIRE_UP[1]) / C));
    const seaHalf = LR.SPIRE_W / 2 / C; // half the width at the sea line, in cells
    const baseHalf = Math.ceil((seaHalf * (floorRow - topRow)) / (seaRow - topRow));
    for (let i = ci - baseHalf; i <= ci + baseHalf; i++) {
      if (i < 0 || i >= W) continue;
      const top = Math.round(topRow + (Math.abs(i - ci) / baseHalf) * (floorRow - topRow));
      for (let j = top; j < floorRow; j++) solid[idx(i, j)] = 1;
    }
    spires.push({ x: (ci + 0.5) * C, w: LR.SPIRE_W, top: topRow * C });
  }
  const map = { kind: 'lair', level, CELL: C, W, H, solid, turrets: [], outposts: [], open: true, lair: true, seaY: seaRow * C, spires };
  finishMap(map, { i: startI, j: sj }, { i: goalI, j: sj }, layout);
  return map;
}

// THE CINDER DRAKE'S LAIR (config.CREATURES.DRAKE.LAIR, C.6a): open sky over a lake of lava (map.lavaY, so the Ember Forge's own rules apply: LAVA_BELOW px under the launch height, far out of the thermals), a wide ROCK
// SHELF under the lair's middle standing SHELF_UP px above the lava (where the torn drake crashes and crawls, and where the bomb bay can reach it), two small ledges, and LAVA SPOUTS: vents on the shelf that erupt in
// turn (map.spouts: { x, y (the shelf top) }; the harpoon tow into an erupting one is a win). Nothing else: no outposts, no guns. map.shelf = { x0, x1, top } in map pixels.
function buildDrakeLairMap(level, rand, lengthMul = 1, layout) {
  const M = config.MAPS, LR = config.CREATURES.LAIR, DL = config.CREATURES.DRAKE.LAIR, C = M.CELL;
  const startI = 12, goalI = startI + Math.round((LR.RUN * lengthMul) / C);
  const W = goalI + Math.round(LR.BEYOND / C) + 20, H = M.OPEN_HEIGHT;
  const sj = 28, lavaRow = Math.min(H - 6, sj + Math.round(DL.LAVA_BELOW / C)), floorRow = H - 3;
  const solid = new Uint8Array(W * H);
  const idx = (i, j) => j * W + i;
  for (let i = 0; i < W; i++) for (let j = floorRow; j < H; j++) solid[idx(i, j)] = 1;
  const topRow = lavaRow - Math.max(1, Math.round(DL.SHELF_UP / C)), half = Math.round(DL.SHELF_HALF / C), slope = 2; // (the shelf's flat top, and its sides falling a row for every `slope` columns... steeper than a hill)
  for (let i = goalI - half - 6; i <= goalI + half + 6; i++) {
    if (i < 0 || i >= W) continue;
    const out = Math.max(0, Math.abs(i - goalI) - half);
    for (let j = topRow + Math.floor(out * slope); j < floorRow; j++) solid[idx(i, j)] = 1;
  }
  for (const [dc, width, up] of DL.LEDGES) { // small ledges to the sides of the shelf: rock for it to be shot against
    const ci = goalI + dc, hw = Math.max(1, Math.round(width / 2 / C)), top = lavaRow - Math.max(1, Math.round(up / C));
    for (let i = ci - hw - 1; i <= ci + hw + 1; i++) {
      if (i < 0 || i >= W) continue;
      for (let j = top + (Math.abs(i - ci) > hw ? 1 : 0); j < floorRow; j++) solid[idx(i, j)] = 1;
    }
  }
  const spouts = DL.SPOUTS.map((dx) => ({ x: (goalI + 0.5) * C + dx, y: topRow * C }));
  const shelf = { x0: (goalI - half) * C, x1: (goalI + half + 1) * C, top: topRow * C };
  const map = { kind: 'lair', level, CELL: C, W, H, solid, turrets: [], outposts: [], open: true, lair: true, creature: 'drake', lavaY: lavaRow * C, shelf, spouts };
  finishMap(map, { i: startI, j: sj }, { i: goalI, j: sj }, layout);
  return map;
}

// THE VERSUS ARENA (config.PVP.ARENA, pvp/match.js): a big open sky, the same on the left and the right (the left half is made, the right half is its mirror, so neither side has the better
// ground). Rolling hills and a few tall spires on the ground, floating islands of every size, and one hollow island on each side (a pocket with its mouth toward the middle: somewhere to
// hide and shoot from). The two launch points are START_GAP apart in the middle of the sky, clear of rock. No outposts and no flak: the one dummy outpost is already "done".
// A = config.PVP.ARENA (SIZE [cells wide, cells high], ISLANDS, SPIRES, POCKETS, START_Y share of the height); gap = the distance between the two launch points (px).
function buildArenaOnce(rand, layout, A, gap) {
  const C = config.MAPS.CELL;
  const [W, H] = A.SIZE;
  const r = (a, b) => a + rand() * (b - a);
  const ri = (a, b) => Math.floor(r(a, b + 1));
  const solid = new Uint8Array(W * H);
  const half = Math.floor(W / 2);
  const idx = (i, j) => j * W + i;
  const sj = Math.round(H * A.START_Y); // the row the ships start on
  const spawnI = [Math.floor((W * C / 2 - gap / 2) / C), Math.floor((W * C / 2 + gap / 2) / C)]; // the cells of the two launch points
  const keepOut = (ci, cj, rx, ry) => spawnI.some((si) => Math.abs(ci - si) < rx + 9) && Math.abs(cj - sj) < ry * 1.8 + 8; // (an island never sits on a launch point)
  // Ground: rolling hills with spires (the left half; the right is mirrored below).
  const s1 = r(0, 6), s2 = r(0, 6);
  const peaks = Array.from({ length: A.SPIRES }, () => ({ i: ri(8, half - 6), h: r(0.2, 0.42) * H, w: r(5, 10) }));
  const tops = [];
  for (let i = 0; i < W; i++) {
    const li = i < half ? i : W - 1 - i;
    let h = 4 + 2.5 * Math.sin(li * 0.07 + s1) + 1.8 * Math.sin(li * 0.19 + s2);
    for (const p of peaks) h = Math.max(h, p.h * Math.max(0, 1 - Math.abs(li - p.i) / p.w));
    tops.push(Math.round(H - 2 - h));
    for (let j = tops[i]; j < H; j++) solid[idx(i, j)] = 1;
  }
  // Floating islands (rounded top, pointy bottom), each also set at its mirror image.
  const blob = (ci, cj, rx, ry) => {
    for (const c of [ci, W - 1 - ci]) {
      for (let j = Math.floor(cj - ry); j <= Math.ceil(cj + ry * 1.8); j++) {
        for (let i = Math.floor(c - rx); i <= Math.ceil(c + rx); i++) {
          if (i < 0 || j < 2 || i >= W || j >= H) continue;
          const u = (i - c) / rx, v = j < cj ? (j - cj) / ry : (j - cj) / (ry * 1.8);
          if (u * u + v * v <= 1) solid[idx(i, j)] = 1;
        }
      }
    }
  };
  for (let k = 0, tries = 0; k < A.ISLANDS && tries < 400; tries++) {
    const rx = r(3, 12), ry = r(2, 5), ci = ri(8, half + 2), cj = ri(10, H - 22);
    if (keepOut(ci, cj, rx, ry) || tops[Math.min(W - 1, ci)] - cj < ry * 2.8 + 6) continue; // (not on the ground either)
    blob(ci, cj, rx, ry);
    k++;
  }
  // Hollow islands: a thick shell of rock round a cavity with its mouth toward the middle of the map.
  for (let k = 0; k < A.POCKETS; k++) {
    const rx = 14, ry = 9, ci = Math.round(W * 0.2) + k * 9, cj = ri(Math.round(H * 0.25), Math.round(H * 0.45));
    for (const side of [1, -1]) { // 1: the left pocket (mouth to the right), -1: its mirror
      const c = side > 0 ? ci : W - 1 - ci;
      for (let j = cj - ry; j <= cj + ry; j++) for (let i = c - rx; i <= c + rx; i++) {
        if (i < 0 || j < 2 || i >= W || j >= H) continue;
        const u = (i - c) / rx, v = (j - cj) / ry;
        const inner = ((i - c) / (rx * 0.62)) ** 2 + ((j - cj) / (ry * 0.55)) ** 2 < 1;
        const mouth = side * (i - c) > 0 && Math.abs(j - cj) <= 4;
        solid[idx(i, j)] = u * u + v * v <= 1 && !inner && !mouth ? 1 : 0;
      }
    }
  }
  // Clear the launch points (a generous box of open sky round each).
  for (const si of spawnI) for (let j = sj - 8; j <= sj + 8; j++) for (let i = si - 14; i <= si + 14; i++) if (i >= 0 && j >= 0 && i < W && j < H) solid[idx(i, j)] = 0;
  const outposts = [{ x: half * C, y: sj * C, done: true, guns: [] }]; // (a dummy: course.js divides by the outpost count)
  const map = { kind: 'open', level: 1, CELL: C, W, H, solid, turrets: [], outposts, open: true, arena: { x0: 0, x1: W * C, y0: 0, y1: H * C, cx: (W * C) / 2, cy: (sj + 0.5) * C, fitTop: Math.ceil((A.CEILING + 600) / C) } };
  finishMap(map, { i: spawnI[0], j: sj }, { i: half, j: sj }, layout, A.PAD || 0);
  map.start = { x: (W * C) / 2 - gap / 2, y: (sj + 0.5) * C }; // (the left ship's launch point; the right one is START_GAP further on)
  return map;
}

// The arena, checked: each ship's launch point must have a way to the middle of the sky (and so, the sky being the same on both sides, to the other ship) for a hull with room to spare. A sky that
// walls the two ships off from each other is built again with fewer islands.
export function buildArenaMap(rand, layout, A, gap = 9000) {
  let map = null;
  for (let tries = 0; tries < 16; tries++) {
    map = buildArenaOnce(rand, layout, { ...A, ISLANDS: Math.max(2, A.ISLANDS - Math.floor(tries / 2)), SPIRES: Math.max(1, A.SPIRES - Math.floor(tries / 4)) }, gap);
    const C = map.CELL, sj = Math.floor(map.start.y / C);
    if (map.dist[sj * map.W + Math.floor(map.start.x / C)] < 1e9 && map.dist[sj * map.W + Math.floor((map.start.x + gap) / C)] < 1e9) return map;
  }
  return map;
}

// Path length (squares) from a point to an outpost's station (sets the route goal as a side effect).
export function stationDist(map, o, mx, my) {
  setGoal(map, stationCell(map, o));
  return distToGoal(map, mx, my);
}

// Where the ship should hover to attack an outpost: high above it, in open air.
export function stationCell(map, o) {
  const C = map.CELL;
  // (Shifted so the bomb bay, which is behind the ship's middle, sits right over the outpost.)
  return { i: Math.floor((o.x + 265) / C), j: Math.max(4, Math.floor(o.y / C) - 7) };
}

// Work out where the ship fits, then the route to the goal from everywhere.
function finishMap(map, startCell, goalCell, layout, pad = 0) {
  const { W, H, CELL: C, solid } = map;
  const idx = (i, j) => j * W + i;
  const pre = new Int32Array((W + 1) * (H + 1));
  for (let jj = 0; jj < H; jj++) {
    for (let ii = 0; ii < W; ii++) pre[(jj + 1) * (W + 1) + ii + 1] = solid[idx(ii, jj)] + pre[jj * (W + 1) + ii + 1] + pre[(jj + 1) * (W + 1) + ii] - pre[jj * (W + 1) + ii];
  }
  const rockIn = (i0, j0, i1, j1) => {
    if (i0 < 0 || i1 >= W || j1 >= H) return 1;
    if (j0 < 0) {
      if (!map.open) return 1;
      j0 = 0; // open sky above the map top
    }
    return pre[(j1 + 1) * (W + 1) + i1 + 1] - pre[j0 * (W + 1) + i1 + 1] - pre[(j1 + 1) * (W + 1) + i0] + pre[j0 * (W + 1) + i0];
  };
  const box = shipBox(layout);
  const wide = pad ? Math.max(Math.ceil(-box.left / C), Math.ceil(box.right / C)) + pad : 0; // (the arena: room both ways along her, she may face either way, and extra round her)
  const bl = pad ? wide : Math.ceil(-box.left / C);
  const br = pad ? wide : Math.ceil(box.right / C);
  const bu = Math.ceil(-box.up / C) + pad;
  const bd = Math.ceil(box.down / C) + pad;
  map.fit = new Uint8Array(W * H);
  for (let jj = 0; jj < H; jj++) for (let ii = 0; ii < W; ii++) map.fit[idx(ii, jj)] = rockIn(ii - bl, jj - bu, ii + br, jj + bd) === 0 ? 1 : 0;
  if (map.arena && map.arena.fitTop) for (let jj = 0; jj < map.arena.fitTop; jj++) for (let ii = 0; ii < W; ii++) map.fit[idx(ii, jj)] = 0; // (the arena: the route never climbs into the wind wall at the top)
  const s = nearestFit(map, startCell.i, startCell.j);
  map.start = { x: (s.i + 0.5) * C, y: (s.j + 0.5) * C };
  setGoal(map, goalCell);
  map.startDist = map.dist[idx(s.i, s.j)];
}

function nearestFit(map, ci, cj) {
  for (let d = 0; d < 30; d++) {
    for (let dj = -d; dj <= d; dj++) {
      for (let di = -d; di <= d; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i >= 0 && j >= 0 && i < map.W && j < map.H && map.fit[j * map.W + i]) return { i, j };
      }
    }
  }
  return { i: ci, j: cj };
}

// Point the route at a new goal cell (distance field from there to everywhere the ship fits).
export function setGoal(map, goalCell) {
  const { W, H, CELL: C } = map;
  const g = nearestFit(map, goalCell.i, goalCell.j);
  map.goal = { x: (g.i + 0.5) * C, y: (g.j + 0.5) * C };
  const dist = (map.dist = new Int32Array(W * H).fill(1e9));
  const queue = [g.j * W + g.i];
  dist[queue[0]] = 0;
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q];
    const ci = c % W;
    const cj = (c - ci) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nc = nj * W + ni;
      if (!map.fit[nc] || dist[nc] <= dist[c] + 1) continue;
      dist[nc] = dist[c] + 1;
      queue.push(nc);
    }
  }
}

// ---------- Queries (map coordinates) ----------
export function solidAt(map, mx, my) {
  const i = Math.floor(mx / map.CELL);
  const j = Math.floor(my / map.CELL);
  if (j < 0 && map.open && i >= 0 && i < map.W) return false; // open sky above
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
