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

// Ground surface (world y) at world x. Buildings (castle towers, smokestacks) count as solid
// unless solid = false (the terrain art draws bare rock and then the buildings on top).
export function groundAt(course, wx, solid = true) {
  let y = K.GROUND;
  const cx = wx + course.dist;
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
    for (const [sx0, sy0] of SHIP_SAMPLES) {
      const [sx, sy] = tilt(state, sx0, sy0);
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
    const keep = Math.min(course.dist, course.lastMarker.cx) - 4000;
    course.features = course.features.filter((f) => f.x1 > keep);
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
        factory: 'SMOKESTACKS AHEAD - CLIMB!',
      }[next.type];
    }
  };

  // Rock contact: push the ship clear and take scrape damage.
  const collide = (dt) => {
    let push = 0; // + = needs to go up
    let worst = null;
    for (const [sx0, sy0] of SHIP_SAMPLES) {
      const [sx, sy] = tilt(state, sx0, sy0);
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
        t.cd = r(K.TURRET_FIRE_MIN, K.TURRET_FIRE_MAX) / (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).pace;
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
    state.rockets.length = 0;
    const m = course.lastMarker;
    course.dist = m.cx - 800 - K.REWIND_BEFORE;
    course.warned = null;
    for (const t of course.turrets) t.cd = Math.max(t.cd, 2);
    state.ev.warn = 3;
    state.ev.warnText = m.kind === 'home' ? 'BACK TO THE MOORING MAST - TRY AGAIN!' : 'BACK TO THE LAST ' + (m.kind === 'beacon' ? 'BEACON' : 'CHECKPOINT') + '!';
  };

  // A brand-new game: fresh terrain from the home mast, lap 1.
  const restart = () => {
    state.rockets.length = 0;
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
    });
    addLapMarkers(1);
    course.markers[0].passed = true;
  };

  return { update, reset, restart, helmHint };
}
