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

// Smooth plateau 0..1..0 across a feature (t = 0..1).
const plateau = (t) => {
  if (t <= 0 || t >= 1) return 0;
  const ramp = 0.28;
  const u = t < ramp ? t / ramp : t > 1 - ramp ? (1 - t) / ramp : 1;
  return u * u * (3 - 2 * u);
};
const jag = (x, seed) => (Math.sin(x * 0.013 + seed) + Math.sin(x * 0.031 + seed * 2.1) * 0.6) * 14;

// Ground surface (world y) at world x.
export function groundAt(course, wx) {
  let y = K.GROUND;
  const cx = wx + course.dist;
  for (const f of course.features) {
    if (f.ground == null || cx < f.x0 || cx > f.x1) continue;
    const t = (cx - f.x0) / (f.x1 - f.x0);
    const h = plateau(t);
    const gy = K.GROUND - (K.GROUND - f.ground) * h + (f.rough ? Math.abs(jag(cx, f.seed)) * h : 0);
    y = Math.min(y, gy);
  }
  return y;
}

// Underside of any rock above (world y) at world x, or -Infinity for open sky.
export function ceilAt(course, wx) {
  let y = -Infinity;
  const cx = wx + course.dist;
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
  const v = scrollSpeed(state);
  let min = -Infinity;
  let max = Infinity;
  for (let t = 0; t <= ahead; t += 0.25) {
    for (const [sx, sy] of SHIP_SAMPLES) {
      const x = sx + v * t;
      min = Math.max(min, sy - groundAt(course, x) + MARGIN);
      max = Math.min(max, sy - ceilAt(course, x) - MARGIN);
    }
  }
  return { min, max };
}

// Keep something flying at (x, y) out of the rock, `margin` away from it, looking a little to
// either side (`reach`) so it rises before a slope. `ahead` = seconds into the future (for aiming).
export function keepClear(state, x, y, margin, ahead = 0, reach = 160) {
  const course = state.course;
  if (!course || !K.ENABLED) return y;
  const wx = x + scrollSpeed(state) * ahead;
  let g = Infinity;
  let c = -Infinity;
  for (const dx of [-reach, -reach / 2, 0, reach / 2, reach]) {
    g = Math.min(g, groundAt(course, wx + dx));
    c = Math.max(c, ceilAt(course, wx + dx));
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
  return y > groundAt(course, x) || y < ceilAt(course, x);
}

// How fast the scenery passes (same as the clouds and mines).
export const scrollSpeed = (state) => 40 + state.ship.speed * 520;

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

export function createCourse({ state, impact, puff }) {
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
      course.turrets.push({ cx, hp: K.TURRET_HP, cd: r(1, K.TURRET_FIRE_MAX), aim: -Math.PI / 2, dead: false });
    }
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
        continue;
      }
      const roll = course.rand();
      let f;
      if (roll < 0.3) {
        // Mountain: climb over it.
        f = { type: 'mountain', ground: groundFor(r(40, A * (0.55 + 0.45 * d))), rough: true, width: r(1600, 2600) };
      } else if (roll < 0.5) {
        // Rock overhang: dive under it.
        f = { type: 'overhang', ceil: ceilFor(-r(30, A * (0.5 + 0.5 * d))), width: r(1400, 2200) };
      } else if (roll < 0.78) {
        // Underpass: a gap you have to hold the ship inside.
        const room = K.UNDERPASS_GAP_START + (K.UNDERPASS_GAP_END - K.UNDERPASS_GAP_START) * d;
        const mid = r(-A + room / 2, A - room / 2);
        f = { type: 'underpass', ground: groundFor(mid - room / 2), ceil: ceilFor(mid + room / 2), rough: true, width: r(2000, 3200) };
      } else {
        // Rolling hills: no steering needed, but turrets love them.
        f = { type: 'hills', ground: r(1060, 1180), rough: true, width: r(1400, 2400) };
      }
      f.x0 = x0;
      f.x1 = x0 + Math.min(f.width, widthGuess);
      f.seed = course.rand() * 100;
      course.features.push(f);
      if (f.ground != null) addTurrets(f, course.rand() < 0.4 + 0.4 * d ? (course.rand() < d ? 2 : 1) : 0);
      course.nextX = f.x1 + r(K.GAP_MIN, K.GAP_MAX) * (1 - 0.4 * d);
    }
    // Forget what's well behind the last marker (we may need to rewind to it).
    const keep = Math.min(course.dist, course.lastMarker.cx) - 4000;
    course.features = course.features.filter((f) => f.x1 > keep);
    course.turrets = course.turrets.filter((t) => t.cx > keep);
    course.markers = course.markers.filter((m) => m.cx > keep - L);
  };

  const warnAhead = (dt) => {
    const lookout = Object.values(state.players).some((q) => q.lock === 'Lookout');
    const secs = lookout ? K.LOOKOUT_WARN_SECONDS : K.WARN_SECONDS;
    const v = scrollSpeed(state);
    const shipFront = 1670 + course.dist;
    const next = course.features.find((f) => f.type !== 'hills' && f.x0 > shipFront - 200 && f.x0 - shipFront < secs * v);
    if (next && course.warned !== next) {
      course.warned = next;
      state.ev.warn = 3;
      state.ev.warnText = next.type === 'mountain' ? 'MOUNTAIN AHEAD - CLIMB!' : next.type === 'overhang' ? 'LOW ROCK AHEAD - DIVE!' : 'UNDERPASS AHEAD - HOLD HER STEADY!';
    }
  };

  // Rock contact: push the ship clear and take scrape damage.
  const collide = (dt) => {
    let push = 0; // + = needs to go up
    let worst = null;
    for (const [sx, sy] of SHIP_SAMPLES) {
      const wy = sy - state.ship.alt;
      const down = wy - groundAt(course, sx);
      const up = ceilAt(course, sx) - wy;
      if (down > 0 && (!worst || down > worst.depth)) worst = { sx, sy, depth: down };
      if (up > 0 && (!worst || up > worst.depth)) worst = { sx, sy, depth: up };
      if (down > 0) push = Math.max(push, down);
      if (up > 0) push = Math.min(push, -up);
    }
    course.scrapeCd = Math.max(0, course.scrapeCd - dt);
    course.scraping = !!worst;
    if (!worst) return;
    // Shove the ship out of the rock (a hard bump), and slow it down.
    state.ship.alt += Math.sign(push) * Math.min(Math.abs(push), 600 * dt);
    state.ship.speed *= 1 - 0.8 * dt;
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
      if (t.dead) continue;
      const wx = t.cx - course.dist;
      const wy = groundAt(course, wx);
      t.x = wx;
      t.y = wy - 20;
      t.vx = -v;
      // Aim at the middle of the ship.
      const ty = 640 - state.ship.alt;
      t.aim = Math.atan2(ty - t.y, 800 - wx);
      if (Math.hypot(800 - wx, ty - t.y) > K.TURRET_RANGE || state.ship.down) continue;
      if ((t.cd -= dt) <= 0) {
        t.cd = r(K.TURRET_FIRE_MIN, K.TURRET_FIRE_MAX);
        const helm = Object.values(state.players).find((q) => q.lock === 'Helm');
        const miss = helm && Math.abs(helm.jy) > 0.3 && course.rand() < 0.4;
        const tx = 300 + course.rand() * 1000;
        const aimY = 400 + course.rand() * 400 - state.ship.alt + (miss ? -900 : 0);
        const d = Math.hypot(tx - t.x, aimY - t.y) || 1;
        state.bullets.push({ x: t.x, y: t.y, vx: ((tx - t.x) / d) * K.FLAK_SPEED, vy: ((aimY - t.y) / d) * K.FLAK_SPEED, miss, life: 5, flak: true });
        puff(t.x + Math.cos(t.aim) * 40, t.y + Math.sin(t.aim) * 40, '#555', 4);
      }
    }
    // Crew shells knock turrets out.
    for (const shell of state.shells) {
      for (const t of course.turrets) {
        if (t.dead || t.x == null || Math.hypot(shell.x - t.x, shell.y - t.y) > 42) continue;
        shell.life = 0;
        t.hp -= 1;
        puff(shell.x, shell.y, '#ffcf40', 8);
        if (t.hp <= 0) {
          t.dead = true;
          state.kills += 1;
          puff(t.x, t.y, '#ff5a1f', 22);
        }
        break;
      }
    }
  };

  // Passing a marker: checkpoint, beacon (turn for home) or home (lap complete).
  const passMarkers = () => {
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
      } else state.ev.warnText = 'CHECKPOINT!';
    }
    // Sunset on the return leg (fades in after the beacon, out before home).
    const p = (shipX % L) / L;
    course.progress = p;
    const target = p > 0.5 && p < 0.97 ? Math.min(1, (p - 0.5) / 0.08) * Math.min(1, (0.97 - p) / 0.06) : 0;
    course.dusk += (target - course.dusk) * 0.02;
  };

  // Hint for the helmsman's phone.
  const helmHint = () => {
    const w = altWindow(state, 2.5);
    const alt = state.ship.alt;
    if (w.min > w.max) return 'Squeeze through - hold the middle!';
    if (alt < w.min) return 'CLIMB! Push the stick up';
    if (alt > w.max) return 'DIVE! Pull the stick down';
    return '';
  };

  const update = (dt) => {
    if (!K.ENABLED) return;
    if (state.ship.down > 0) return; // the world waits while the crew patches up
    course.dist += scrollSpeed(state) * dt;
    generate();
    passMarkers();
    warnAhead(dt);
    collide(dt);
    updateTurrets(dt);
  };

  // After going down: rewind to just before the last marker passed (open sky, same terrain ahead).
  const reset = () => {
    const m = course.lastMarker;
    course.dist = m.cx - 800 - K.REWIND_BEFORE;
    course.warned = null;
    for (const t of course.turrets) t.cd = Math.max(t.cd, 2);
    state.ev.warn = 3;
    state.ev.warnText = m.kind === 'home' ? 'BACK TO THE MOORING MAST - TRY AGAIN!' : 'BACK TO THE LAST ' + (m.kind === 'beacon' ? 'BEACON' : 'CHECKPOINT') + '!';
  };

  return { update, reset, helmHint };
}
