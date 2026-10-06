// The course: terrain scrolling past the ship (mountains to climb over, rock overhangs to dive
// under, underpasses to thread) plus ground turrets firing flak.
//
// It's a looping route. Each lap starts at the home mooring mast, passes checkpoint flags, turns at
// a beacon halfway (the sky goes to sunset for the trip home) and ends back at the mast, then the
// next, harder lap begins. If the ship goes down, the world pauses and the ship restarts just
// before the last marker it passed, with the same terrain ahead.
//
// Course position cx maps to world x as  wx = cx - dist  (dist = how far the ship has flown).
// World y grows downward; the ship is drawn shifted up by its altitude (alt).
import { config } from '../../config.js';
import { pop } from './popups.js';
import { makeMap, solidAt, floorBelow, roofAbove, distToGoal, routeAhead, setGoal, stationCell } from './maps.js';

const K = config.COURSE;
const TOP = -1400; // where ceilings start (far above the view)

// Points around the ship's outline (ship coordinates) used to test for terrain contact.
export const SHIP_SAMPLES = [
  // underside
  [-80, 410], [126, 662], [248, 815], [500, 815], [740, 935], [805, 975], [855, 935], [1100, 815], [1352, 815], [1470, 662],
  [20, 862], [140, 862], [1460, 862], [1580, 862], [1512, 620], [1660, 245],
  // top
  [-95, 70], [100, 160], [300, 95], [500, 70], [690, 8], [800, -60], [910, 8], [1100, 70], [1300, 110], [1500, 170],
];
const BOTTOM_Y = 975; // lowest point of the ship (ventral gun)
const TOP_Y = -60; // highest point (flag on the crow's nest)
const MARGIN = 25;

// A point on the ship (ship coordinates), tipped by the ship's current pitch.
export function tilt(state, x, y) {
  const a = state.ship.pitch || 0;
  if (!a) return [x, y];
  const [px, py] = config.SHIP.TILT_PIVOT;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c];
}

// Smooth plateau 0..1..0 across a feature (t = 0..1).
const plateau = (t) => {
  if (t <= 0 || t >= 1) return 0;
  const ramp = 0.28;
  const u = t < ramp ? t / ramp : t > 1 - ramp ? (1 - t) / ramp : 1;
  return u * u * (3 - 2 * u);
};
const jag = (x, seed) => (Math.sin(x * 0.013 + seed) + Math.sin(x * 0.031 + seed * 2.1) * 0.6) * 14;

// Height of the land at course position cx (cliffs raise it, drops lower it). Every feature,
// building and ceiling rides on top of this.
export function elevAt(course, cx) {
  if (course.map) return 0;
  let e = course.elev0 || 0;
  for (const s of course.elev || []) {
    if (cx < s.x0) break;
    if (cx >= s.x1) e = s.to;
    else {
      const t = (cx - s.x0) / (s.x1 - s.x0);
      return s.from + (s.to - s.from) * t * t * (3 - 2 * t);
    }
  }
  return e;
}

// Ground surface (world y) at world x. Buildings (castle towers, smokestacks) count as solid
// unless solid = false (the terrain art draws bare rock and then the buildings on top).
// On a mission map, "ground" means the rock floor below height y (default: the ship's middle).
export function groundAt(course, wx, solid = true, y) {
  const cx = wx + course.dist;
  if (course.map) return floorBelow(course.map, cx, y ?? course.refY);
  return groundFlat(course, cx, solid) - elevAt(course, cx);
}

// Ground before the land's elevation is added.
function groundFlat(course, cx, solid) {
  let y = K.GROUND;
  for (const f of course.features) {
    if (f.ground == null || cx < f.x0 || cx > f.x1) continue;
    const t = (cx - f.x0) / (f.x1 - f.x0);
    const h = plateau(t);
    const gy = K.GROUND - (K.GROUND - f.ground) * h + (f.rough ? Math.abs(jag(cx, f.seed)) * h : 0);
    y = Math.min(y, gy);
    if (solid && f.blocks) for (const b of f.blocks) if (cx >= b.x0 && cx <= b.x1) y = Math.min(y, b.top);
  }
  return y;
}

// Underside of any rock above (world y) at world x, or -Infinity for open sky.
// On a mission map, the rock roof above height y (default: the ship's middle).
export function ceilAt(course, wx, y) {
  const cx = wx + course.dist;
  if (course.map) return roofAbove(course.map, cx, y ?? course.refY);
  return ceilFlat(course, cx) - elevAt(course, cx);
}

function ceilFlat(course, cx) {
  let y = -Infinity;
  for (const f of course.features) {
    if (f.ceil == null || cx < f.x0 || cx > f.x1) continue;
    const t = (cx - f.x0) / (f.x1 - f.x0);
    const h = plateau(t);
    if (h <= 0) continue;
    const cy = TOP + (f.ceil - TOP) * h - Math.abs(jag(cx, f.seed + 7)) * h;
    y = Math.max(y, cy);
  }
  return y;
}

// The altitude range that keeps the whole ship clear of rock, looking ahead `ahead` seconds.
// Returns { min, max } (min > max means there's no way through).
export function altWindow(state, ahead = 2) {
  const course = state.course;
  // Even when hovering, look a little way ahead in the direction we're facing.
  const sp = scrollSpeed(state);
  const v = sp >= 0 ? Math.max(sp, 180) : Math.min(sp, -120);
  let min = -Infinity;
  let max = Infinity;
  for (let t = 0; t <= ahead; t += 0.25) {
    for (const [sx0, sy0] of SHIP_SAMPLES) {
      const [sx, sy] = tilt(state, sx0, sy0);
      const x = sx + v * t;
      const wy = sy - state.ship.alt;
      min = Math.max(min, sy - groundAt(course, x, true, wy) + MARGIN);
      max = Math.min(max, sy - ceilAt(course, x, wy) - MARGIN);
    }
  }
  return { min, max };
}

// What a sensible pilot would do now: the altitude to aim for and the throttle to use.
// Slows to a crawl when a big climb or dive is needed (cliffs), and creeps forward when the way
// ahead isn't open yet (e.g. the tail is still over a cliff edge).
export function pilotPlan(state, ahead, cruise) {
  const course = state.course;
  const alt = state.ship.alt;
  if (course && course.map) return mapPlan(state, cruise);
  const B = altBounds(state);
  const range = (w) => [Math.max(w.min, B.lo), Math.min(w.max, B.hi)];
  const [lo, hi] = range(altWindow(state, ahead));
  const fit = (a, b, want) => (a + 30 > b - 30 ? (a + b) / 2 : Math.max(a + 30, Math.min(b - 30, want)));
  if (lo > hi) {
    const [lo0, hi0] = range(altWindow(state, 0));
    return { target: fit(lo0, hi0, alt), speed: 0.12 };
  }
  const target = fit(lo, hi, course ? elevAt(course, course.dist + 800) : 0);
  return { target, speed: Math.abs(target - alt) > 120 ? 0.04 : cruise };
}

// On a mission map: follow the route to the goal. Aim for the height of a point a few steps along
// it, and drive toward it (forward, backward, or hover when the way goes straight up/down).
function mapPlan(state, cruise) {
  const course = state.course;
  const sx = course.dist + 800;
  const sy = 500 - state.ship.alt;
  const p = routeAhead(course.map, sx, sy, 7);
  if (!p) return { target: state.ship.alt, speed: 0, dx: 0, dy: 0 };
  const dx = p.x - sx;
  const dy = p.y - sy;
  const target = 500 - p.y;
  // Mostly vertical: hover and let the gas do the work.
  const speed = Math.abs(dx) < 120 ? 0 : Math.sign(dx) * (Math.abs(dy) > 350 ? 0.12 : cruise) * (dx < 0 ? 0.8 : 1);
  return { target, speed: Math.max(-config.SHIP.REVERSE, speed), dx, dy };
}

// The Gas Valve setting (-1 vent .. +1 pump) that brings the ship to altitude `target`.
export function gasFor(state, target) {
  const G = config.GAS;
  const vy = state.ship.vy || 0;
  const wantVy = Math.max(-320, Math.min(320, (target - state.ship.alt) * 1.3));
  const needAccel = (wantVy - vy) * 2.5 + vy * G.DRAG;
  const wantGas = G.NEUTRAL + needAccel / G.LIFT;
  return Math.max(-1, Math.min(1, (wantGas - state.ship.gas) / 8));
}

// Keep something flying at (x, y) out of the rock, `margin` away from it, looking a little to
// either side (`reach`) so it rises before a slope. `ahead` = seconds into the future (for aiming).
export function keepClear(state, x, y, margin, ahead = 0, reach = 160) {
  const course = state.course;
  if (!course || !K.ENABLED) return y;
  const wx = x + scrollSpeed(state) * ahead;
  // On a map, something inside the rock moves to the nearest open air in its column.
  if (course.map && solidAt(course.map, wx + course.dist, y)) {
    const C = course.map.CELL;
    for (let k = 1; k < 40; k++) {
      if (!solidAt(course.map, wx + course.dist, y - k * C)) return y - k * C - margin * 0.5;
      if (!solidAt(course.map, wx + course.dist, y + k * C)) return y + k * C + margin * 0.5;
    }
    return y;
  }
  let g = Infinity;
  let c = -Infinity;
  for (const dx of [-reach, -reach / 2, 0, reach / 2, reach]) {
    g = Math.min(g, groundAt(course, wx + dx, true, y));
    c = Math.max(c, ceilAt(course, wx + dx, y));
  }
  const lo = c + margin;
  const hi = g - margin;
  if (lo > hi) return (lo + hi) / 2; // squeezed: fly down the middle
  return Math.max(lo, Math.min(hi, y));
}

// Is a point inside the rock?
export function inRock(state, x, y) {
  const course = state.course;
  if (!course || !K.ENABLED) return false;
  if (course.map) return solidAt(course.map, x + course.dist, y);
  return y > groundAt(course, x) || y < ceilAt(course, x);
}

// How fast the ship moves along the course (negative = backing up; 0 = hovering).
export const scrollSpeed = (state) => state.ship.speed * config.SHIP.TOP_SPEED;

// How high and low the ship may fly here: up to ALT_RANGE above the highest land under and just
// ahead of it, and ALT_RANGE below the lowest.
export function altBounds(state) {
  const course = state.course;
  const R = config.SHIP.ALT_RANGE;
  if (!course) return { lo: -R, hi: R };
  if (course.map) return { lo: -Infinity, hi: Infinity }; // the rock itself is the limit
  let lo = Infinity;
  let hi = -Infinity;
  for (let dx = -200; dx <= 2600; dx += 200) {
    const e = elevAt(course, course.dist + dx);
    lo = Math.min(lo, e);
    hi = Math.max(hi, e);
  }
  return { lo: lo - R, hi: hi + R };
}

// Small seeded random generator so a course is repeatable.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// onMarker(marker) is called when the ship passes the beacon or arrives home.
export function createCourse({ state, impact, puff, onMarker, credit, hitsShip }) {
  state.rockets = [];
  const hitsShipNow = (x, y) => hitsShip && hitsShip(x, y + state.ship.alt);
  const A = config.SHIP.ALT_RANGE - 30; // the most altitude we'll ever ask the helm for
  const course = {
    dist: 0,
    features: [],
    turrets: [],
    markers: [], // home / checkpoint / beacon positions along the route
    nextX: K.FIRST_FEATURE,
    rand: rng(Date.now()),
    scrapeCd: 0,
    warned: null,
    lap: 1,
    leg: 'out', // 'out' or 'home'
    lastMarker: { cx: 0, kind: 'home', lap: 1 },
    dusk: 0, // 0 = day, 1 = sunset (return leg)
    elev: [], // height steps of the land (cliffs and drops)
    elev0: 0, // land height before the first remembered step
    maxDist: 0, // furthest the ship has got (backing up is limited)
  };
  state.course = course;

  const r = (a, b) => a + course.rand() * (b - a);
  // Harder along each lap and with every lap.
  const difficulty = () => Math.min(1, course.nextX / K.HARDEST_AT);

  // Route markers for lap n (1-based): home at the start, checkpoints, the beacon halfway.
  const L = K.LOOP_LENGTH;
  const addLapMarkers = (n) => {
    const start = (n - 1) * L;
    for (let k = 0; k < K.SECTIONS; k++) {
      const kind = k === 0 ? 'home' : k === K.SECTIONS / 2 ? 'beacon' : 'checkpoint';
      course.markers.push({ cx: start + (k * L) / K.SECTIONS, kind, lap: n, passed: false });
    }
  };
  addLapMarkers(1);
  course.markers[0].passed = true;
  // Keep terrain away from markers so each is a safe place to restart.
  const nearMarker = (x0, x1) => course.markers.find((m) => x1 > m.cx - K.MARKER_CLEAR && x0 < m.cx + K.MARKER_CLEAR);

  // Altitude the ship must be above to clear ground g / below to clear ceiling c.
  const groundFor = (needAlt) => BOTTOM_Y + MARGIN - needAlt; // need alt > needAlt
  const ceilFor = (maxAlt) => TOP_Y - MARGIN - maxAlt; // need alt < maxAlt

  const addTurrets = (f, n) => {
    for (let i = 0; i < n; i++) {
      const cx = f.x0 + (f.x1 - f.x0) * r(0.35, 0.65) + (i - (n - 1) / 2) * 220;
      const rocket = course.rand() < K.ROCKET_SHARE * difficulty() + (course.lap > 1 ? 0.15 : 0);
      course.turrets.push({ cx, hp: K.TURRET_HP, cd: r(1, K.TURRET_FIRE_MAX), aim: -Math.PI / 2, dead: false, rocket });
    }
  };

  // A turret standing on a building (so it fires from the battlements).
  const turretOn = (b) => {
    const rocket = course.rand() < K.ROCKET_SHARE * difficulty() + (course.lap > 1 ? 0.15 : 0);
    course.turrets.push({ cx: (b.x0 + b.x1) / 2, hp: K.TURRET_HP, cd: r(1, K.TURRET_FIRE_MAX), aim: -Math.PI / 2, dead: false, rocket });
  };

  // A castle on a mountain top: curtain wall, a keep and towers with guns. Building heights are
  // set from the altitude the ship needs to clear them (never more than A).
  const makeFortress = (d) => {
    const width = r(2700, 3200);
    const baseNeed = r(-A * 0.75, -A * 0.1);
    const f = { type: 'fortress', ground: groundFor(baseNeed), rough: true, width, blocks: [] };
    const room = A - 20 - baseNeed; // most a building may rise above the mountain top
    const c0 = width * 0.31;
    const c1 = width * 0.69;
    const block = (kind, a, b, h) => f.blocks.push({ kind, x0: a, x1: b, top: f.ground - Math.min(room, h), h: Math.min(room, h) });
    block('wall', c0, c1, r(140, 170));
    const towerH = () => r(270, 340 + 120 * d);
    block('tower', c0 - 30, c0 + 140, towerH());
    block('tower', c1 - 140, c1 + 30, towerH());
    const mid = (c0 + c1) / 2;
    block('keep', mid - 190, mid + 190, r(330, 420 + 120 * d));
    return f;
  };

  // A factory valley: sheds with saw-tooth roofs and tall smokestacks to climb over.
  const makeFactory = (d) => {
    const width = r(2600, 3200);
    const f = { type: 'factory', ground: K.GROUND - r(60, 140), rough: false, width, blocks: [] };
    const baseNeed = BOTTOM_Y + MARGIN - f.ground;
    let x = width * 0.28;
    const end = width * 0.72;
    let sheds = 1; // start with a stack
    while (x < end) {
      if (sheds < 2 && course.rand() < 0.5) {
        const w = r(300, 460);
        const h = r(140, 210);
        f.blocks.push({ kind: 'shed', x0: x, x1: x + w, top: f.ground - h, h });
        x += w + r(10, 40);
        sheds += 1;
      } else {
        const need = Math.min(A - 20, r(A * 0.1, A * (0.55 + 0.4 * d)));
        const h = Math.max(260, need - baseNeed);
        f.blocks.push({ kind: 'chimney', x0: x, x1: x + 70, top: f.ground - h, h });
        x += 70 + r(60, 140);
        sheds = 0;
      }
    }
    return f;
  };

  // Climb pocket: a low tunnel opens into a pocket below a cliff wall. Stop, climb straight up,
  // then carry on over the top. Returns where the next obstacle may start.
  const addClimb = (x0, d) => {
    const e = elevAt(course, x0);
    const H = r(900, 1300 + 900 * d);
    const tunnel = { type: 'tunnel', ceil: ceilFor(r(-120, 40)), x0, x1: x0 + 1800, seed: course.rand() * 100 };
    const wallX = tunnel.x1 + 2600;
    course.features.push(tunnel, { type: 'cliff', x0: wallX - 300, x1: wallX + 450 });
    course.elev.push({ x0: wallX, x1: wallX + 450, from: e, to: e + H });
    if (course.rand() < 0.3 + 0.6 * d) turretOn({ x0: wallX + 900, x1: wallX + 960 });
    return wallX + 450 + r(K.GAP_MIN, K.GAP_MAX);
  };

  // Drop: the land falls away, then a low cave mouth. Clear the edge, descend, then go in.
  const addDrop = (x0, d) => {
    const e = elevAt(course, x0);
    const H = r(900, 1300 + 900 * d);
    course.features.push({ type: 'drop', x0: x0 - 300, x1: x0 + 450 });
    course.elev.push({ x0, x1: x0 + 450, from: e, to: e - H });
    const cave = { type: 'cave', ceil: ceilFor(r(-160, 30)), x0: x0 + 2800, x1: x0 + 2800 + r(2200, 2800), seed: course.rand() * 100 };
    course.features.push(cave);
    return cave.x1 + r(K.GAP_MIN, K.GAP_MAX);
  };

  const generate = () => {
    while (course.markers[course.markers.length - 1].cx < course.dist + 12000) addLapMarkers(course.markers[course.markers.length - 1].lap + 1);
    while (course.nextX < course.dist + 9000) {
      const d = difficulty();
      const x0 = course.nextX;
      const widthGuess = 3200;
      const blocked = nearMarker(x0, x0 + widthGuess);
      if (blocked) {
        course.nextX = blocked.cx + K.MARKER_CLEAR;
        course.zig = 0;
        continue;
      }
      // Big height changes: climb a cliff or dive off one (keeping the land roughly in range).
      if (!(course.zig > 0) && course.rand() < K.CLIFF_SHARE) {
        const e = elevAt(course, x0);
        const up = e < -K.ELEV_LIMIT * 0.3 ? true : e > K.ELEV_LIMIT ? false : course.rand() < 0.55;
        if (!nearMarker(x0, x0 + 7800)) {
          course.nextX = up ? addClimb(x0, d) : addDrop(x0, d);
          continue;
        }
      }
      let f;
      if (course.zig > 0) {
        // Zig-zag: alternating rock spires (climb!) and hanging rock (dive!).
        course.zig -= 1;
        course.zigUp = !course.zigUp;
        const swing = course.zigSwing;
        f = course.zigUp
          ? { type: 'spire', ground: groundFor(swing), rough: true, width: r(800, 1100) }
          : { type: 'stalactite', ceil: ceilFor(-swing), width: r(800, 1100) };
      } else {
        const M = K.MIX;
        let roll = course.rand();
        const pick = (k) => (roll -= M[k]) < 0;
        if (pick('mountain')) {
          // Mountain: climb over it.
          f = { type: 'mountain', ground: groundFor(r(40, A * (0.55 + 0.45 * d))), rough: true, width: r(1600, 2600) };
        } else if (pick('overhang')) {
          // Rock overhang: dive under it.
          f = { type: 'overhang', ceil: ceilFor(-r(30, A * (0.5 + 0.5 * d))), width: r(1400, 2200) };
        } else if (pick('underpass')) {
          // Underpass: a gap you have to hold the ship inside.
          const room = K.UNDERPASS_GAP_START + (K.UNDERPASS_GAP_END - K.UNDERPASS_GAP_START) * d;
          const mid = r(-A + room / 2, A - room / 2);
          f = { type: 'underpass', ground: groundFor(mid - room / 2), ceil: ceilFor(mid + room / 2), rough: true, width: r(2000, 3200) };
        } else if (pick('zigzag')) {
          // Start a zig-zag run; the gates follow one by one.
          course.zig = Math.round(r(K.ZIGZAG_GATES[0], K.ZIGZAG_GATES[1] + 0.49)) - 1;
          course.zigUp = course.rand() < 0.5;
          const swing = (course.zigSwing = r(0.35, 0.5 + 0.3 * d) * A);
          f = course.zigUp
            ? { type: 'spire', ground: groundFor(swing), rough: true, width: r(800, 1100), first: true }
            : { type: 'stalactite', ceil: ceilFor(-swing), width: r(800, 1100), first: true };
        } else if (pick('fortress')) f = makeFortress(d);
        else if (pick('factory')) f = makeFactory(d);
        else {
          // Rolling hills: no steering needed, but turrets love them.
          f = { type: 'hills', ground: K.GROUND - r(170, 290), rough: true, width: r(1400, 2400) };
        }
      }
      f.x0 = x0;
      f.x1 = x0 + Math.min(f.width, widthGuess);
      f.seed = course.rand() * 100;
      // Buildings were laid out relative to the feature's start.
      if (f.blocks) for (const b of f.blocks) (b.x0 += x0), (b.x1 += x0);
      course.features.push(f);
      if (f.type === 'fortress') {
        // Guns on both towers, and on the keep later on.
        f.blocks.filter((b) => b.kind === 'tower' || (b.kind === 'keep' && course.rand() < d)).forEach(turretOn);
      } else if (f.type === 'factory') {
        const sheds = f.blocks.filter((b) => b.kind === 'shed');
        sheds.slice(0, course.rand() < d ? 2 : 1).forEach(turretOn);
      } else if (f.ground != null && f.type !== 'spire') addTurrets(f, course.rand() < 0.4 + 0.4 * d ? (course.rand() < d ? 2 : 1) : 0);
      course.nextX = f.x1 + (course.zig > 0 ? K.ZIGZAG_GAP + course.zigSwing * K.ZIGZAG_GAP_PER_SWING : r(K.GAP_MIN, K.GAP_MAX) * (1 - 0.4 * d));
    }
    // Forget what's well behind the last marker (we may need to rewind to it).
    const keep = Math.min(course.maxDist, course.lastMarker.cx) - 4000;
    course.features = course.features.filter((f) => f.x1 > keep);
    while (course.elev.length && course.elev[0].x1 < keep) course.elev0 = course.elev.shift().to;
    course.turrets = course.turrets.filter((t) => t.cx > keep);
    course.markers = course.markers.filter((m) => m.cx > keep - L);
  };

  const warnAhead = (dt) => {
    const lookout = state.lookout;
    const secs = lookout ? K.LOOKOUT_WARN_SECONDS : K.WARN_SECONDS;
    const v = scrollSpeed(state);
    const shipFront = 1670 + course.dist;
    const next = course.features.find((f) => f.type !== 'hills' && f.x0 > shipFront - 200 && f.x0 - shipFront < secs * v);
    if (next && course.warned !== next) {
      course.warned = next;
      state.ev.warn = 3;
      const zig = next.first ? 'ZIG-ZAG AHEAD - ' : '';
      state.ev.warnText = {
        mountain: 'MOUNTAIN AHEAD - CLIMB!',
        overhang: 'LOW ROCK AHEAD - DIVE!',
        underpass: 'UNDERPASS AHEAD - HOLD HER STEADY!',
        spire: zig + 'CLIMB!',
        stalactite: zig + 'DIVE!',
        fortress: 'FORTRESS AHEAD - CLIMB!',
        tunnel: 'LOW TUNNEL - GET DOWN!',
        cliff: 'CLIFF WALL - STOP AND CLIMB!',
        drop: 'CLIFF EDGE - CLEAR IT, THEN DIVE!',
        cave: 'CAVE MOUTH - GET LOW!',
        factory: 'SMOKESTACKS AHEAD - CLIMB!',
      }[next.type];
    }
  };

  // Rock contact on a mission map: each point of the ship stuck in rock is pushed out the shortest
  // way (up, down, back or forward), and scrapes.
  const mapCollide = (dt) => {
    const map = course.map;
    let pushUp = 0;
    let pushDown = 0;
    let pushBack = 0;
    let pushFwd = 0;
    let worst = null;
    for (const [sx0, sy0] of SHIP_SAMPLES) {
      const [sx, sy] = tilt(state, sx0, sy0);
      const mx = sx + course.dist;
      const my = sy - state.ship.alt;
      if (!solidAt(map, mx, my)) continue;
      let best = null;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        for (let k = 1; k <= 8; k++) {
          if (!solidAt(map, mx + dx * k * 30, my + dy * k * 30)) {
            if (!best || k * 30 < best.d) best = { dx, dy, d: k * 30 };
            break;
          }
        }
      }
      if (!best) continue;
      if (!worst || best.d > worst.depth) worst = { sx, sy, depth: best.d };
      if (best.dy < 0) pushUp = Math.max(pushUp, best.d);
      else if (best.dy > 0) pushDown = Math.max(pushDown, best.d);
      else if (best.dx < 0) pushBack = Math.max(pushBack, best.d);
      else pushFwd = Math.max(pushFwd, best.d);
    }
    course.scrapeCd = Math.max(0, course.scrapeCd - dt);
    course.scraping = !!worst;
    if (!worst) return;
    const step = 600 * dt;
    state.ship.alt += Math.min(pushUp, step) - Math.min(pushDown, step);
    if (pushUp && state.ship.vy < 0) state.ship.vy = 0;
    if (pushDown && state.ship.vy > 0) state.ship.vy = 0;
    if (pushBack) {
      course.dist -= Math.min(pushBack, step);
      if (state.ship.speed > -0.1) state.ship.speed = -0.1;
    }
    if (pushFwd) {
      course.dist += Math.min(pushFwd, step);
      if (state.ship.speed < 0.1) state.ship.speed = 0.1;
    }
    state.ship.speed *= 1 - 0.8 * dt;
    if (course.scrapeCd <= 0 && !state.ship.down) {
      course.scrapeCd = K.SCRAPE_COOLDOWN;
      impact(worst.sx, worst.sy, 1 + Math.min(2, worst.depth / 40));
      state.ev.warn = 1.5;
      state.ev.warnText = 'SCRAPING THE ROCKS!';
    }
  };

  // Rock contact: push the ship clear and take scrape damage.
  const collide = (dt) => {
    if (course.map) return mapCollide(dt);
    let push = 0; // + = needs to go up
    let worst = null;
    let wallAhead = false;
    let wallBehind = false;
    for (const [sx0, sy0] of SHIP_SAMPLES) {
      const [sx, sy] = tilt(state, sx0, sy0);
      const wy = sy - state.ship.alt;
      const down = wy - groundAt(course, sx);
      const up = ceilAt(course, sx) - wy;
      if (down <= 0 && up <= 0) continue;
      if (!worst || Math.max(down, up) > worst.depth) worst = { sx, sy, depth: Math.max(down, up) };
      // A wall face: a little way back toward the middle of the ship the rock isn't there, so
      // we flew into it sideways. Walls stop the ship instead of lifting it.
      const back = sx > 800 ? -60 : 60;
      const wall = down > 0 ? wy < groundAt(course, sx + back) && down > 30 : wy > ceilAt(course, sx + back) && up > 30;
      if (wall) {
        if (sx > 800) wallAhead = true;
        else wallBehind = true;
        continue;
      }
      if (down > 0) push = Math.max(push, down);
      if (up > 0) push = Math.min(push, -up);
    }
    course.scrapeCd = Math.max(0, course.scrapeCd - dt);
    course.scraping = !!worst;
    if (!worst) return;
    // Shove the ship out of the rock (a hard bump), and slow it down.
    state.ship.alt += Math.sign(push) * Math.min(Math.abs(push), 600 * dt);
    if ((push > 0 && state.ship.vy < 0) || (push < 0 && state.ship.vy > 0)) state.ship.vy = 0; // momentum stops on the rock
    state.ship.speed *= 1 - 0.8 * dt;
    // Bounce back off a wall.
    if (wallAhead && state.ship.speed >= -0.05) {
      course.dist -= 260 * dt;
      state.ship.speed = -0.12;
    } else if (wallBehind && state.ship.speed <= 0.05) {
      course.dist += 260 * dt;
      state.ship.speed = 0.12;
    }
    if (course.scrapeCd <= 0 && !state.ship.down) {
      course.scrapeCd = K.SCRAPE_COOLDOWN;
      impact(worst.sx, worst.sy, 1 + Math.min(2, worst.depth / 40));
      state.ev.warn = 1.5;
      state.ev.warnText = 'SCRAPING THE ROCKS!';
    }
  };

  const updateTurrets = (dt) => {
    const v = scrollSpeed(state);
    for (const t of course.turrets) {
      // Every turret (wrecked ones too) stays fixed to the ground as it scrolls past.
      const wx = (t.mx ?? t.cx) - course.dist;
      const wy = t.my ?? groundAt(course, wx);
      t.x = wx;
      t.y = wy - 20;
      t.vx = -v;
      if (t.dead) continue;
      // Aim at the middle of the ship.
      const ty = 640 - state.ship.alt;
      t.aim = Math.atan2(ty - t.y, 800 - wx);
      if (Math.hypot(800 - wx, ty - t.y) > K.TURRET_RANGE || state.ship.down) continue;
      if ((t.cd -= dt) <= 0) {
        t.cd = (r(K.TURRET_FIRE_MIN, K.TURRET_FIRE_MAX) / (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).pace) * (course.map && course.map.open ? 1.3 : 1);
        const helm = Object.values(state.players).find((q) => q.lock === 'Helm');
        const miss = course.rand() < K.FLAK_MISS || (helm && Math.abs(helm.jy) > 0.3 && course.rand() < 0.4);
        const tx = 300 + course.rand() * 1000;
        const aimY = 400 + course.rand() * 400 - state.ship.alt + (miss ? -900 : 0);
        const d = Math.hypot(tx - t.x, aimY - t.y) || 1;
        if (t.rocket) {
          // A slow homing rocket (gunners can shoot it down).
          t.cd *= 1.6;
          state.rockets.push({ x: t.x, y: t.y - 30, ang: -Math.PI / 2, life: K.ROCKET_LIFE, hp: 1 });
        } else state.bullets.push({ x: t.x, y: t.y, vx: ((tx - t.x) / d) * K.FLAK_SPEED, vy: ((aimY - t.y) / d) * K.FLAK_SPEED, miss, life: 5, flak: true });
        puff(t.x + Math.cos(t.aim) * 40, t.y + Math.sin(t.aim) * 40, '#555', 4);
      }
    }
    // Rockets turn toward the middle of the ship.
    for (const k of state.rockets) {
      const tx = 800;
      const ty = 600 - state.ship.alt;
      const want = Math.atan2(ty - k.y, tx - k.x);
      const diff = Math.atan2(Math.sin(want - k.ang), Math.cos(want - k.ang));
      k.ang += Math.max(-K.ROCKET_TURN * dt, Math.min(K.ROCKET_TURN * dt, diff));
      k.vx = Math.cos(k.ang) * K.ROCKET_SPEED - v; // the scenery is moving too
      k.vy = Math.sin(k.ang) * K.ROCKET_SPEED;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.life -= dt;
      if (course.rand() < 0.5) puff(k.x - Math.cos(k.ang) * 20, k.y - Math.sin(k.ang) * 20, '#bbb', 1);
      if (inRock(state, k.x, k.y) && k.life < K.ROCKET_LIFE - 0.5) {
        k.hp = 0;
        puff(k.x, k.y, '#ff7b00', 10);
      } else if (!state.ship.down && hitsShipNow(k.x, k.y)) {
        k.hp = 0;
        puff(k.x, k.y, '#ff5a1f', 16);
        impact(k.x, k.y + state.ship.alt, K.ROCKET_IMPACT);
      }
    }
    for (const shell of state.shells) {
      for (const k of state.rockets) {
        if (k.hp > 0 && Math.hypot(shell.x - k.x, shell.y - k.y) < 24) {
          shell.life = 0;
          k.hp = 0;
          puff(k.x, k.y, '#ff7b00', 12);
          pop(state, k.x, k.y - 30, 'rocket', '#ffd23f', 0.7);
          break;
        }
      }
    }
    state.rockets = state.rockets.filter((k) => k.hp > 0 && k.life > 0);

    // Crew shells knock turrets out.
    for (const shell of state.shells) {
      for (const t of course.turrets) {
        if (t.dead || t.x == null || Math.hypot(shell.x - t.x, shell.y - t.y) > 42) continue;
        shell.life = 0;
        t.hp -= config.GUNS.DAMAGE;
        puff(shell.x, shell.y, '#ffcf40', 8);
        if (t.hp <= 0) {
          t.dead = true;
          state.kills += 1;
          credit?.(shell);
          puff(t.x, t.y, '#ff5a1f', 22);
          pop(state, t.x, t.y - 60, 'kill');
        }
        break;
      }
    }
  };

  // ---------- Bombs from the bomb bay ----------
  // A bomb keeps the ship's forward speed at first (so it falls straight down below the ship)
  // and slowly loses it to drag, landing a little behind.
  state.shipBombs = [];
  const BOMB = config.BOMBS;
  const stepBomb = (b, dt) => {
    b.vx += (-scrollSpeed(state) - b.vx) * Math.min(1, dt * BOMB.DRAG);
    b.vy += BOMB.GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  };
  const dropBomb = (x, y, owner) => state.shipBombs.push({ x, y, vx: 0, vy: 60, owner });
  // Where a bomb dropped now would land (for the aiming ring).
  const predictBomb = (x, y) => {
    const b = { x, y, vx: 0, vy: 60 };
    for (let i = 0; i < 300; i++) {
      stepBomb(b, 1 / 30);
      if (course.map ? inRock(state, b.x, b.y) : b.y >= groundAt(course, b.x)) return { x: b.x, y: course.map ? b.y : groundAt(course, b.x) };
    }
    return null;
  };
  const blast = (b) => {
    const R = BOMB.RADIUS;
    puff(b.x, b.y, '#ff8c42', 26);
    puff(b.x, b.y - 40, '#555', 14);
    pop(state, b.x, b.y - 120, 'kill', '#ff5a1f', 1.3);
    state.ship.shake = Math.max(state.ship.shake, 0.15);
    const owner = state.players[b.owner];
    for (const t of course.turrets) {
      if (t.dead || t.x == null || Math.hypot(b.x - t.x, b.y - t.y) > R) continue;
      t.dead = true;
      state.kills += 1;
      credit?.(b);
      puff(t.x, t.y, '#ff5a1f', 22);
    }
    // Buildings: a hit knocks a chunk off; enough hits bring it down (and its gun with it).
    for (const f of course.features) {
      if (!f.blocks) continue;
      for (const blk of [...f.blocks]) {
        const x0 = blk.x0 - course.dist;
        const x1 = blk.x1 - course.dist;
        if (b.x < x0 - R * 0.6 || b.x > x1 + R * 0.6) continue;
        blk.hp = (blk.hp ?? (blk.kind === 'chimney' || blk.kind === 'tower' ? 2 : 3)) - 1;
        if (blk.hp > 0) continue;
        f.blocks.splice(f.blocks.indexOf(blk), 1);
        for (let k = 0; k < 6; k++) puff(x0 + ((x1 - x0) * k) / 5, groundAt(course, (x0 + x1) / 2) - k * 40, '#8a847c', 16);
        pop(state, (x0 + x1) / 2, groundAt(course, (x0 + x1) / 2) - 160, 'bigHit', '#ffd23f', 1.4);
        for (const t of course.turrets) if (!t.dead && t.cx >= blk.x0 - 20 && t.cx <= blk.x1 + 20) t.dead = true;
        if (owner) {
          owner.stats = owner.stats || {};
          owner.stats.demolished = (owner.stats.demolished || 0) + 1;
        }
      }
    }
  };
  const updateBombs = (dt) => {
    for (const b of state.shipBombs) {
      stepBomb(b, dt);
      if (course.map ? inRock(state, b.x, b.y) : b.y >= groundAt(course, b.x)) {
        b.done = true;
        blast(b);
      } else if (inRock(state, b.x, b.y)) b.done = true; // hit an overhang
    }
    state.shipBombs = state.shipBombs.filter((b) => !b.done && b.y < 8000);
  };

  // Passing a marker: checkpoint, beacon (turn for home) or home (lap complete).
  // On a mission map: how far along the route we are, and whether we've reached the beacon.
  const mapProgress = () => {
    const map = course.map;
    const sx = course.dist + 800;
    const sy = 500 - state.ship.alt;
    course.dusk += (0 - course.dusk) * 0.02;
    if (map.open) {
      // Open sky: knock out every outpost (all its guns), nearest first.
      for (const o of map.outposts) if (!o.done && course.turrets.filter((t) => t.outpost === map.outposts.indexOf(o)).every((t) => t.dead)) {
        o.done = true;
        state.ev.warn = 3;
        state.ev.warnText = 'OUTPOST DESTROYED!';
      }
      const left = map.outposts.filter((o) => !o.done);
      course.progress = Math.min(0.99, 1 - left.length / map.outposts.length);
      if (left.length && (!course.target || course.target.done)) {
        course.target = left.sort((a, b) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(b.x - sx, b.y - sy))[0];
        setGoal(map, stationCell(map, course.target));
      }
      if (!left.length && !course.done) {
        course.done = true;
        state.ship.hull = Math.min(100, state.ship.hull + K.CHECKPOINT_REPAIR);
        state.ev.warn = 4;
        state.ev.warnText = 'ALL OUTPOSTS DOWN! MISSION ' + course.lap + ' COMPLETE';
        course.pendingNext = true;
        if (onMarker) onMarker({ kind: 'home', lap: course.lap + 1 });
      }
      return;
    }
    const d = distToGoal(map, sx, sy);
    if (Number.isFinite(d)) course.progress = Math.max(0, Math.min(0.99, 1 - d / Math.max(1, map.startDist)));
    if (!course.done && Math.hypot(sx - map.goal.x, sy - map.goal.y) < config.MAPS.GOAL_RADIUS) {
      course.done = true;
      state.ship.hull = Math.min(100, state.ship.hull + K.CHECKPOINT_REPAIR);
      state.ev.warn = 4;
      state.ev.warnText = 'BEACON REACHED! MISSION ' + course.lap + ' COMPLETE';
      course.pendingNext = true;
      if (onMarker) onMarker({ kind: 'home', lap: course.lap + 1 });
    }
  };

  const passMarkers = () => {
    if (course.map) return mapProgress();
    const shipX = course.dist + 800;
    for (const m of course.markers) {
      if (m.passed || m.cx > shipX) continue;
      m.passed = true;
      course.lastMarker = m;
      state.ev.warn = 3.5;
      if (m.kind === 'home') {
        state.ev.warnText = `HOME! LAP ${m.lap - 1} COMPLETE - LAP ${m.lap} BEGINS`;
        course.lap = m.lap;
        course.leg = 'out';
      } else if (m.kind === 'beacon') {
        state.ev.warnText = 'TURNING BEACON - HEADING HOME!';
        course.leg = 'home';
      } else {
        // Supplies at every flag patch the hull up a little.
        state.ship.hull = Math.min(100, state.ship.hull + K.CHECKPOINT_REPAIR);
        state.ev.warnText = 'CHECKPOINT! SUPPLIES ABOARD: +' + K.CHECKPOINT_REPAIR + ' HULL';
      }
      if (m.kind !== 'checkpoint' && onMarker) onMarker(m);
    }
    // Sunset on the return leg (fades in after the beacon, out before home).
    const p = (shipX % L) / L;
    course.progress = p;
    const target = p > 0.5 && p < 0.97 ? Math.min(1, (p - 0.5) / 0.08) * Math.min(1, (0.97 - p) / 0.06) : 0;
    course.dusk += (target - course.dusk) * 0.02;
  };

  // Hint for the helmsman's phone.
  const helmHint = () => {
    if (course.map) {
      const p = mapPlan(state, 0.5);
      const h = p.dx > 300 ? 'AHEAD' : p.dx < -300 ? 'BACK' : '';
      const v = p.dy < -250 ? 'UP (pump the gas!)' : p.dy > 250 ? 'DOWN (vent the gas!)' : '';
      return h || v ? (course.map.open ? 'Next outpost: ' : 'Way to the beacon: ') + [v, h].filter(Boolean).join(' and ') : course.map.open ? 'Outpost below - guns and bombs!' : '';
    }
    const w = altWindow(state, 2.5);
    const alt = state.ship.alt;
    if (course.scraping && state.ship.speed < 0) return 'Backing off the wall - now climb or dive!';
    const plan = pilotPlan(state, 2.5, 0.5);
    if (plan.speed < 0.1 && plan.target - alt > 120) return 'STOP (lever to the line) - Gas Valve: PUMP to climb!';
    if (plan.speed < 0.1 && alt - plan.target > 120) return 'STOP (lever to the line) - Gas Valve: VENT to drop!';
    if (w.min > w.max) return 'Squeeze through - hold the middle!';
    if (alt < w.min) return 'CLIMB! (stick up - and pump the gas)';
    if (alt > w.max) return 'DIVE! (stick down - and vent the gas)';
    return '';
  };

  const update = (dt) => {
    if (!K.ENABLED) return;
    course.refY = 500 - state.ship.alt;
    if (state.ship.down > 0) return; // the world waits while the crew patches up
    // Mission done and the vote's over: on to the next map.
    if (course.pendingNext && !state.scorecard && !state.vote) startMission(course.lap + 1);
    course.dist += scrollSpeed(state) * dt;
    if (course.map) passMarkers();
    else {
      // You can back up, but only so far (the land behind is forgotten).
      course.maxDist = Math.max(course.maxDist, course.dist);
      if (course.dist < course.maxDist - K.MAX_REVERSE) {
        course.dist = course.maxDist - K.MAX_REVERSE;
        state.ship.speed = Math.max(0, state.ship.speed);
      }
      generate();
      passMarkers();
      warnAhead(dt);
    }
    collide(dt);
    updateBombs(dt);
    updateTurrets(dt);
  };

  // After going down: rewind to just before the last marker passed (open sky, same terrain ahead).
  const reset = () => {
    state.rockets.length = 0;
    const m = course.lastMarker;
    course.dist = m.cx - 800 - K.REWIND_BEFORE;
    course.warned = null;
    for (const t of course.turrets) t.cd = Math.max(t.cd, 2);
    state.ev.warn = 3;
    state.ev.warnText = m.kind === 'home' ? 'BACK TO THE MOORING MAST - TRY AGAIN!' : 'BACK TO THE LAST ' + (m.kind === 'beacon' ? 'BEACON' : 'CHECKPOINT') + '!';
  };

  // Start mission n on a fresh map: the ship at the start, the beacon somewhere ahead.
  function startMission(n) {
    const MP = config.MAPS;
    const kind = MP.KINDS[(n - 1) % MP.KINDS.length];
    const map = makeMap(kind, n, course.rand);
    const d = Math.min(1, (n - 1) / 4);
    Object.assign(course, {
      map,
      lap: n,
      leg: 'out',
      dist: map.start.x - 800,
      features: [],
      elev: [],
      elev0: 0,
      done: false,
      pendingNext: false,
      progress: 0,
      justStarted: true,
      turrets: map.turrets.map((t) => ({
        cx: t.mx,
        mx: t.mx,
        my: t.my,
        hp: map.open ? 2 : K.TURRET_HP,
        cd: r(2, K.TURRET_FIRE_MAX),
        aim: -Math.PI / 2,
        dead: false,
        rocket: course.rand() < K.ROCKET_SHARE * d + 0.1,
        outpost: t.outpost,
      })),
      target: map.open ? map.outposts[0] : null,
      markers: [
        { kind: 'home', mx: map.start.x, my: floorBelow(map, map.start.x, map.start.y), top: map.start.y + 300, passed: true },
        map.open ? null : { kind: 'beacon', mx: map.goal.x, my: floorBelow(map, map.goal.x, map.goal.y), passed: false },
        ...map.outposts.map((o) => ({ kind: 'outpost', mx: o.x, my: o.y, passed: false })),
      ].filter(Boolean),
    });
    course.lastMarker = course.markers[0];
    course.homeAlt = 500 - map.start.y;
    state.ship.alt = course.homeAlt;
    state.ship.vy = 0;
    state.ship.speed = 0;
    state.rockets.length = 0;
    if (state.shipBombs) state.shipBombs.length = 0;
    state.ev.warn = 4;
    state.ev.warnText = map.open ? 'MISSION ' + n + ': DESTROY ' + map.outposts.length + ' OUTPOSTS!' : 'MISSION ' + n + ': REACH THE BEACON!';
  }

  // A brand-new game: fresh terrain from the home mast, lap 1.
  const restart = () => {
    state.rockets.length = 0;
    state.shipBombs.length = 0;
    Object.assign(course, {
      dist: 0,
      features: [],
      turrets: [],
      markers: [],
      nextX: K.FIRST_FEATURE,
      rand: rng(Date.now()),
      scrapeCd: 0,
      scraping: false,
      warned: null,
      lap: 1,
      leg: 'out',
      lastMarker: { cx: 0, kind: 'home', lap: 1 },
      dusk: 0,
      zig: 0,
      elev: [],
      elev0: 0,
      maxDist: 0,
    });
    addLapMarkers(1);
    course.markers[0].passed = true;
    if (config.MAPS.ENABLED) startMission(1);
  };

  if (config.MAPS.ENABLED) startMission(1);

  return { update, reset, restart, helmHint, dropBomb, predictBomb, startMission };
}
