// The course: terrain scrolling past the ship (mountains to climb over, rock overhangs to dive
// under, underpasses to thread) plus ground turrets firing flak.
//
// It's a looping route. Each lap starts at the home mooring mast, passes checkpoint flags, turns at
// a beacon halfway (the sky goes to sunset for the trip home) and ends back at the mast, then the
// next, harder lap begins. If the ship goes down, the world pauses and the ship restarts just
// before the last marker it passed, with the same terrain ahead.
//
// Course position cx IS world x (M.1: everything in the sky is stored in map coordinates; the ship's pose.x = course.dist is where she is).
// World y grows downward; the ship's pose.y = -alt (she is drawn under translate(pose.x, pose.y)).
import { firePace } from './crewscale.js';
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY, pivotOf, driveVx } from './pose.js';
import { pop } from './popups.js';
import { shellDmg } from './aim.js';
import { pickEnvironment } from './environments.js';
import { makeMap, buildArenaMap, solidAt, floorBelow, roofAbove, distToGoal, routeAhead, setGoal, stationCell, stationDist } from './maps.js';
import { applyForce } from './forces.js';

const K = config.COURSE;
const TOP = -1400; // where ceilings start (far above the view)

// Points around the ship's outline (ship coordinates) used to test for terrain contact (from the build; the lowest and
// highest of them are layout.bottomY / topY). REF = where the ship's middle is (world x = pose.x + REF.x,
// world y = pose.y + REF.y); AIM = where enemy fire is aimed. All are the layout's own fields (layout.samples / refPoint / aimPoint), updated in place when a
// new build is applied; each function below takes them from mainShip(state).layout (B1: ship 0; B2 passes the ship).
const MARGIN = 25;

// A point on the ship (ship coordinates), tipped by the ship's current pitch.
export function tilt(state, x, y) {
  const a = state.ship.pitch || 0;
  if (!a) return [x, y];
  const [px, py] = config.SHIP.TILT_PIVOT || mainShip(state).layout.tiltPivot;
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

// Ground surface (world y) at world (map) x. Buildings (castle towers, smokestacks) count as solid
// unless solid = false (the terrain art draws bare rock and then the buildings on top).
// On a mission map, "ground" means the rock floor below height y (default: the ship's middle).
export function groundAt(course, wx, solid = true, y) {
  const cx = wx;
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
  const cx = wx;
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
  const ship = mainShip(state);
  const SHIP_SAMPLES = ship.layout.samples;
  // Even when hovering, look a little way ahead in the direction we're facing (f: along the world, the way her bow points).
  const sp = scrollSpeed(state);
  const v = ship.pose.f * (sp >= 0 ? Math.max(sp, 180) : Math.min(sp, -120));
  let min = -Infinity;
  let max = Infinity;
  for (let t = 0; t <= ahead; t += 0.25) {
    for (const [sx0, sy0] of SHIP_SAMPLES) {
      const [sx, sy] = tilt(state, sx0, sy0);
      const x = toWorldX(ship, sx) + v * t;
      const wy = toWorldY(ship, sy);
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
  const ship = mainShip(state);
  const alt = state.ship.alt;
  if (ship.ai) return ship.ai.plan(state); // (the enemy gunship: her captain's ring spots, strafing runs and retreats, gunshipShip.js)
  if (state.rival) return rivalPlan(state); // (Versus: the rival, not the beacon, is the goal; every ship has her own)
  if (course && course.map) return giveWay(state, ship, mapPlan(state, cruise));
  const B = altBounds(state);
  const range = (w) => [Math.max(w.min, B.lo), Math.min(w.max, B.hi)];
  const [lo, hi] = range(altWindow(state, ahead));
  const fit = (a, b, want) => (a + 30 > b - 30 ? (a + b) / 2 : Math.max(a + 30, Math.min(b - 30, want)));
  if (lo > hi) {
    const [lo0, hi0] = range(altWindow(state, 0));
    return { target: fit(lo0, hi0, alt), speed: 0.12 };
  }
  const target = fit(lo, hi, course ? elevAt(course, toWorldX(ship, ship.layout.refPoint.x)) : 0);
  return { target, speed: Math.abs(target - alt) > 120 ? 0.04 : cruise };
}

// Versus (pvp/match.js sets ctx.rival every step: the other team's nearest ship in WORLD coordinates): the bot captain's plan, which the autopilot flies too.
//   * holds PVP.STANDOFF px of sky between the two aim points (nose to nose at gun range), closing or backing off by how far out it is (APPROACH);
//   * keeps an altitude edge: the ship that started on the left holds ALT_EDGE above the other, the one on the right ALT_EDGE below (they swap each round with the sides);
//   * uses rock as cover: a ship that is losing (or hurt) picks, among a few heights, the one with rock across the line to the rival, as far as the edge allows;
//   * retreats to repair: hull under BOT.RETREAT_HULL with more than BOT.RETREAT_HOLES holes in her, she backs off to twice the standoff (out of gun range) until the crew has patched her;
//   * `dx` is how far AHEAD of her bow the rival is (behind = negative; while retreating, the way AWAY), so the helm bot comes about when the rival is behind (bots.js, TURN.BOT_TURNS or Versus).
// rival.mid is the rival's aim point in the world; our own aim point is toWorld of layout.aimPoint.
function rivalPlan(state) {
  const R = state.rival;
  const P = config.PVP;
  const B = P.BOT;
  const ship = mainShip(state);
  const f = ship.pose.f;
  const AIM = ship.layout.aimPoint;
  const mx = toWorldX(ship, AIM.x);
  const my = toWorldY(ship, AIM.y);
  const gap = R.mid.x - mx; // along the sky, + = she is to the right of us
  const dir = gap < 0 ? -1 : 1;
  // Wedged against a rock island (the hull has been grinding on it for most of a second): back out the way the rock pushes, and climb or dive out of it. For a few seconds after, the
  // plan will not push into the side that rock was on.
  const now = performance.now();
  const cc = state.course;
  if (cc && cc.scraping && cc.lastContact) {
    const c = cc.lastContact;
    if (!state.scrapeSince) state.scrapeSince = now;
    if (c.dx) state.rockSide = { dir: -c.dx, until: now + 3500 };
    if (now - state.scrapeSince > 700) return { target: state.ship.alt + (c.dy < 0 ? 350 : c.dy > 0 ? -350 : 120), speed: Math.max(-config.SHIP.REVERSE, Math.min(0.6, c.dx * f * 0.6)), dx: gap * f, dy: R.mid.y - my, wedged: true };
  } else state.scrapeSince = 0;
  const holes = state.breaches.length + state.gasHoles.length;
  const hurt = state.ship.hull < B.RETREAT_HULL && holes > B.RETREAT_HOLES;
  const hooking = performance.now() - (state.boardAt || -1e9) < 1200; // (a crewman of hers is going across on a hook: close in so her decks are within his reach)
  const stand = P.STANDOFF + ((ship.captain && ship.captain.rangeAdj) || 0) + (ship.layout.bounds.x1 - ship.layout.bounds.x0) / 2 + (R.layout.bounds.x1 - R.layout.bounds.x0) / 2 - 2 * P.REF_HALF; // (PVP.STANDOFF is for two classic hulls: longer ships keep further apart so their noses are as far from each other)
  const kite = !!(ship.captain && ship.captain.play === 'kite'); // (a long-band captain closed on: run from the rival, like the retreat, but only to a little past her hold)
  const err = gap - dir * (hurt ? stand * 2 : kite ? stand * 1.4 : stand - (hooking ? B.BOARD_CLOSE : 0)); // + = too far (or too close) to close the range by going on
  let w = Math.max(-1, Math.min(1, err / P.APPROACH)); // the speed we want along the world's x (+ = to the right)
  if (state.rockSide && now < state.rockSide.until && Math.sign(w) === state.rockSide.dir) w = 0; // (not into the rock that just had us)
  const m = state.match;
  const high = m && m.left && ship.team && R.team ? ship.team.id === m.left : String(ship.id) < String(R.ship.id); // (the left-hand ship at the start of the round holds the high ground)
  const yWant = R.mid.y + (high ? -P.ALT_EDGE : P.ALT_EDGE);
  let y = keepClear(state, mx, yWant, P.ROCK_MARGIN, 2.5);
  const map = state.course && state.course.map;
  if (map && (hurt || state.ship.hull + 10 < R.hull)) { // losing: look for a height with rock between us and her (worked out twice a second, not every frame)
    const c = R.cover || (R.cover = { stamp: -1e9, y });
    if (R.stamp - c.stamp >= 30) {
      c.stamp = R.stamp;
      let best = -Infinity;
      for (const d of [0, -300, 300, -600, 600, -900, 900]) {
        const yy = keepClear(state, mx, yWant + d, P.ROCK_MARGIN, 2.5);
        let shut = 0;
        for (let k = 1; k <= 10; k++) if (solidAt(map, mx + ((R.mid.x - mx) * k) / 11, yy + ((R.mid.y - yy) * k) / 11)) shut++;
        const score = (shut / 10) * B.COVER_WEIGHT * 1000 - Math.abs(yy - yWant);
        if (score > best) { best = score; c.y = yy; }
      }
    }
    y = c.y;
  }
  let target = AIM.y - y;
  const win = altWindow(state, 2); // (the altitudes where the whole hull clears the rock under and over the next two seconds of flight: the plan never asks for one outside it)
  target = win.min <= win.max ? Math.max(win.min + 20, Math.min(win.max - 20, target)) : (win.min + win.max) / 2;
  return { target, speed: Math.max(-config.SHIP.REVERSE, Math.min(0.6, w * f)), dx: (hurt || kite ? -1 : 1) * gap * f, dy: R.mid.y - my };
}

// Manners in a fleet (co-op ?ships=N): shipCollide.js is the wall, this is what a pilot does before it. A ship does not carry on while another ship is AHEAD of her (in the way she is going) inside the
// box she sweeps over the next GIVE_WAY.TIME seconds, grown by MARGIN: she hovers until the box is clear, so the ship behind never grinds the one in front into the rock. One ship: untouched.
function giveWay(state, ship, plan) {
  const ships = state.ships;
  if (!ships || ships.length < 2 || !config.COLLIDE.ENABLED || !plan.speed) return plan;
  const G = config.COLLIDE.GIVE_WAY, b = ship.layout.bounds, p = ship.pose;
  const dir = Math.sign(plan.speed) * p.f; // (the way along the sky she means to go)
  const ex = driveVx(ship) * G.TIME; // (how far she sweeps: her engines' speed along the world, a ship facing left goes the other way)
  const wa = toWorldX(ship, b.x0), wb = toWorldX(ship, b.x1);
  const mine = { x0: Math.min(wa, wb) + Math.min(0, ex) - G.MARGIN, x1: Math.max(wa, wb) + Math.max(0, ex) + G.MARGIN, y0: p.y + b.y0 - G.MARGIN, y1: p.y + b.y1 + G.MARGIN };
  for (const o of ships) {
    if (o === ship || o.state.down > 0 || o.ctx.wreck || o.ai) continue; // (the gunship gives way to us, not we to her)
    const ob = o.layout.bounds, oa = toWorldX(o, ob.x0), oc = toWorldX(o, ob.x1);
    const ox0 = Math.min(oa, oc), ox1 = Math.max(oa, oc), oy0 = o.pose.y + ob.y0, oy1 = o.pose.y + ob.y1;
    if (ox0 >= mine.x1 || mine.x0 >= ox1 || oy0 >= mine.y1 || mine.y0 >= oy1) continue;
    if (((ox0 + ox1) / 2 - (Math.min(wa, wb) + Math.max(wa, wb)) / 2) * dir > 0) return { ...plan, speed: 0 };
  }
  return plan;
}

// On a mission map: follow the route to the goal. Aim for the height of a point a few steps along
// it, and drive toward it (forward, backward, or hover when the way goes straight up/down).
function mapPlan(state, cruise) {
  const course = state.course;
  const ship = mainShip(state);
  const REF = ship.layout.refPoint;
  const sx = toWorldX(ship, REF.x);
  const sy = toWorldY(ship, REF.y);
  // Unsticking (the ship made no headway for a while): look further along the route, and for the
  // first moments back away from whatever is holding it.
  const un = course.unstick > 0;
  const p = routeAhead(course.map, sx, sy, un ? 14 : 7);
  if (!p) return { target: state.ship.alt, speed: 0, dx: 0, dy: 0 };
  // (Back off and rise: a ship wedged on a ledge must climb off it, whatever the route says.)
  if (un && course.unstick > config.MAPS.UNSTICK_TIME / 2) return { target: Math.max(REF.y - p.y, state.ship.alt + config.MAPS.UNSTICK_RISE), speed: -0.4, dx: -300, dy: p.y - sy };
  const dx = (p.x - sx) * ship.pose.f; // (how far the route point is AHEAD of her: + = along her bow, so a ship facing left reads the world mirrored)
  const dy = p.y - sy;
  const target = REF.y - p.y;
  // Mostly vertical: hover and let the gas do the work.
  const speed = Math.abs(dx) < 120 ? 0 : Math.sign(dx) * (Math.abs(dy) > 350 ? 0.12 : cruise) * (dx < 0 ? 0.8 : 1);
  return { target, speed: Math.max(-config.SHIP.REVERSE, speed), dx, dy };
}

// The PRESSURE lever setting (-1 vent .. +1 pump) that brings the ship to altitude `target`.
export function gasFor(state, target) {
  const G = config.GAS;
  const vy = state.ship.vy || 0;
  const wantVy = Math.max(-320, Math.min(320, (target - state.ship.alt) * 1.3));
  const needAccel = (wantVy - vy) * 2.5 + vy * G.DRAG;
  const env = state.env; // ice weight and lava thermals shift the gas level she needs to hover (environments.js)
  const wantGas = G.NEUTRAL + needAccel / G.LIFT + (env ? env.sink - env.lift / G.LIFT : 0);
  return Math.max(-1, Math.min(1, (wantGas - state.ship.gas) / 8));
}

// Keep something flying at world (x, y) out of the rock, `margin` away from it, looking a little to
// either side (`reach`) so it rises before a slope. `ahead` = seconds into the future (for aiming).
export function keepClear(state, x, y, margin, ahead = 0, reach = 160) {
  const course = state.course;
  if (!course || !K.ENABLED) return y;
  const wx = x + mainShip(state).pose.f * scrollSpeed(state) * ahead; // (her engines carry her along her bow, which points along the world by f)
  // On a map, something inside the rock moves to the nearest open air in its column.
  if (course.map && solidAt(course.map, wx, y)) {
    const C = course.map.CELL;
    for (let k = 1; k < 40; k++) {
      if (!solidAt(course.map, wx, y - k * C)) return y - k * C - margin * 0.5;
      if (!solidAt(course.map, wx, y + k * C)) return y + k * C + margin * 0.5;
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

// Is a world point inside the rock?
export function inRock(state, x, y) {
  const course = state.course;
  if (!course || !K.ENABLED) return false;
  if (course.map) return solidAt(course.map, x, y);
  return y > groundAt(course, x) || y < ceilAt(course, x);
}

// How fast the ship moves along her bow, px/s (negative = backing up; 0 = hovering): her body-frame velocity u, which flight.js integrates from the forces on her (state.ship.speed is it as a share of TOP_SPEED).
export const scrollSpeed = (state) => state.ship.speed * config.SHIP.TOP_SPEED * (state.ship.topMul || 1); // (the enemy gunship's engines are quicker than ours: her body's topMul, B.5)

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
    const e = elevAt(course, toWorldX(mainShip(state), dx));
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
export function createCourse({ state, impact, puff, onMarker, credit, hitsShip, firstMission }) {
  const layout = mainShip(state).layout; // (B1: the ship this course is flown by; B2 makes it one per ship)
  const REF = layout.refPoint;
  const AIM = layout.aimPoint;
  state.rockets = [];
  const ship = mainShip(state);
  const hitsShipNow = (x, y) => hitsShip && hitsShip(toShipX(ship, x), toShipY(ship, y)); // (a world point -> ship coordinates, which is where hitsShip lives)
  const A = config.SHIP.ALT_RANGE - 30; // the most altitude we'll ever ask the helm for
  const course = {
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
  Object.defineProperty(course, 'dist', { enumerable: true, get: () => ship.pose.x, set: (v) => { ship.pose.x = v; } }); // (where ship 0 is along the sky: the POSE owns it since M.2; this is the old name for it)
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
  const groundFor = (needAlt) => layout.bottomY + MARGIN - needAlt; // need alt > needAlt
  const ceilFor = (maxAlt) => layout.topY - MARGIN - maxAlt; // need alt < maxAlt

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
    const baseNeed = layout.bottomY + MARGIN - f.ground;
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
    while (course.markers[course.markers.length - 1].cx < ship.pose.x + 12000) addLapMarkers(course.markers[course.markers.length - 1].lap + 1);
    while (course.nextX < ship.pose.x + 9000) {
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
    const secs = (lookout ? K.LOOKOUT_WARN_SECONDS : K.WARN_SECONDS) * (1 + (state.lookoutBonus || 0));
    const v = scrollSpeed(state);
    const shipFront = toWorldX(ship, 1670);
    const fa = ship.pose.f; // (the classic scrolling course only runs bow-right; a ship facing left looks the other way for its features)
    const next = course.features.find((f) => f.type !== 'hills' && (fa === 1 ? f.x0 > shipFront - 200 && f.x0 - shipFront < secs * v : (f.x0 - shipFront) * fa > -200 && (f.x0 - shipFront) * fa < secs * v));
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

  // The rock pushes back on the hull point that is stuck in it, along the way out (forces.js): rock under the nose lifts the nose, a wall ahead kicks the bow back.
  // (w.dx is the way out in the WORLD; the force acts in the ship's own frame, so a ship facing left gets it mirrored: f)
  const scrapeForce = (st, f, w) => applyForce(st, { x: w.x0, y: w.y0, fx: w.dx * f * config.FORCES.SCRAPE_ACC * Math.min(1, w.depth / 60), fy: w.dy * config.FORCES.SCRAPE_ACC * Math.min(1, w.depth / 60), source: 'scrape' });

  // ---- Rock contact (one ship at a time since M.2: every ship pushes on the rock with her own samples, pose and body, and keeps her own contact fields on her
  // context's course view: scraping, near, lastContact, scrapeCd ...; ship 0's are the course's own) ----
  // Rock contact on a mission map: each point of the ship stuck in rock is pushed out the shortest
  // way (up, down, back or forward), and scrapes.
  const mapCollide = (sh, dt) => {
    const st = sh.ctx;
    const cc = st.course;
    const pose = sh.pose;
    const f = pose.f;
    const map = cc.map;
    let pushUp = 0;
    let pushDown = 0;
    let pushBack = 0; // (along the world: toward -x, and pushFwd toward +x; the speed that goes with it is her bow's, so times f)
    let pushFwd = 0;
    let worst = null;
    for (const [sx0, sy0] of sh.layout.samples) {
      const [sx, sy] = tilt(st, sx0, sy0);
      const mx = toWorldX(sh, sx);
      const my = toWorldY(sh, sy);
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
      if (!worst || best.d > worst.depth) worst = { sx, sy, depth: best.d, x0: sx0, y0: sy0, dx: best.dx, dy: best.dy };
      if (best.dy < 0) pushUp = Math.max(pushUp, best.d);
      else if (best.dy > 0) pushDown = Math.max(pushDown, best.d);
      else if (best.dx < 0) pushBack = Math.max(pushBack, best.d);
      else pushFwd = Math.max(pushFwd, best.d);
    }
    cc.scrapeCd = Math.max(0, cc.scrapeCd - dt);
    cc.scraping = !!worst;
    cc.lastContact = worst;
    if (!worst) return;
    scrapeForce(st, f, worst);
    const step = 600 * dt;
    pose.y -= Math.min(pushUp, step) - Math.min(pushDown, step);
    if (pushUp && st.ship.vy < 0) st.ship.vy = 0;
    if (pushDown && st.ship.vy > 0) st.ship.vy = 0;
    if (pushBack) {
      pose.x -= Math.min(pushBack, step);
      if (st.ship.speed * f > -0.1) st.ship.speed = -0.1 * f;
    }
    if (pushFwd) {
      pose.x += Math.min(pushFwd, step);
      if (st.ship.speed * f < 0.1) st.ship.speed = 0.1 * f;
    }
    st.ship.speed *= 1 - 0.8 * dt;
    if (cc.scrapeCd <= 0 && !st.ship.down) {
      cc.scrapeCd = K.SCRAPE_COOLDOWN;
      sh.sim.impact(worst.sx, worst.sy, 1 + Math.min(2, worst.depth / 40));
      if (sh.main) {
        st.ev.warn = 1.5;
        st.ev.warnText = 'SCRAPING THE ROCKS!'; // (the TV's banner is about the main ship)
      }
    }
  };

  // Close calls: which points of the hull have rock near them, and which way (so the TV can light
  // up that edge before you hit). Also the first touch of rock: a clang, sparks and a small bounce.
  // (`near` entries are in SHIP space: x, y the sample, dx the way to the rock along her own x, so the ship layer draws them as they are, mirrored with her.)
  const proximity = (sh) => {
    const st = sh.ctx;
    const cc = st.course;
    const f = sh.pose.f;
    const near = [];
    for (const [sx0, sy0] of sh.layout.samples) {
      const [sx, sy] = tilt(st, sx0, sy0);
      const wx = toWorldX(sh, sx);
      const wy = toWorldY(sh, sy);
      if (inRock(st, wx, wy)) continue;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        for (let k = 1; k <= 4; k++) {
          if (inRock(st, wx + dx * k * 55, wy + dy * k * 55)) {
            near.push({ x: sx0, y: sy0, dx: dx * f, dy, close: 1 - (k - 1) / 4 });
            break;
          }
        }
      }
    }
    cc.near = near;
    if (cc.scraping && !cc.wasScraping) {
      const w = cc.lastContact;
      if (w) {
        st.sfxQ.push(['clang', w.depth > 40]);
        for (let k = 0; k < 3; k++) puff(toWorldX(sh, w.sx), toWorldY(sh, w.sy), k ? '#ffe9a8' : '#ffffff', 5);
      }
      st.ship.vy = -(st.ship.vy || 0) * 0.3; // a small bounce off the rock
    }
    cc.wasScraping = cc.scraping;
  };

  // Rock contact: push the ship clear and take scrape damage.
  const collide = (sh, dt) => {
    const st = sh.ctx;
    const cc = st.course;
    if (cc.map) return mapCollide(sh, dt);
    const pose = sh.pose;
    const f = pose.f;
    const REFX = sh.layout.refPoint.x;
    let push = 0; // + = needs to go up
    let worst = null;
    let wallAhead = false;
    let wallBehind = false;
    for (const [sx0, sy0] of sh.layout.samples) {
      const [sx, sy] = tilt(st, sx0, sy0);
      const wx = toWorldX(sh, sx);
      const wy = toWorldY(sh, sy);
      const down = wy - groundAt(cc, wx);
      const up = ceilAt(cc, wx) - wy;
      if (down <= 0 && up <= 0) continue;
      if (!worst || Math.max(down, up) > worst.depth) worst = { sx, sy, depth: Math.max(down, up), x0: sx0, y0: sy0, dx: 0, dy: down > 0 ? -1 : 1 };
      // A wall face: a little way back toward the middle of the ship the rock isn't there, so
      // we flew into it sideways. Walls stop the ship instead of lifting it. (-60 / 60 are ship distances: a ship facing left looks the other way in the world.)
      const back = (sx > REFX ? -60 : 60) * f;
      const wall = down > 0 ? wy < groundAt(cc, wx + back) && down > 30 : wy > ceilAt(cc, wx + back) && up > 30;
      if (wall) {
        if (sx > REFX) wallAhead = true;
        else wallBehind = true;
        continue;
      }
      if (down > 0) push = Math.max(push, down);
      if (up > 0) push = Math.min(push, -up);
    }
    cc.scrapeCd = Math.max(0, cc.scrapeCd - dt);
    cc.scraping = !!worst;
    cc.lastContact = worst;
    if (!worst) return;
    scrapeForce(st, f, worst);
    // Shove the ship out of the rock (a hard bump), and slow it down.
    pose.y -= Math.sign(push) * Math.min(Math.abs(push), 600 * dt);
    if ((push > 0 && st.ship.vy < 0) || (push < 0 && st.ship.vy > 0)) st.ship.vy = 0; // momentum stops on the rock
    st.ship.speed *= 1 - 0.8 * dt;
    // Bounce back off a wall (back along her own x: astern of her bow, which is the world's x times f).
    if (wallAhead && st.ship.speed >= -0.05) {
      pose.x -= 260 * dt * f;
      st.ship.speed = -0.12;
    } else if (wallBehind && st.ship.speed <= 0.05) {
      pose.x += 260 * dt * f;
      st.ship.speed = 0.12;
    }
    if (cc.scrapeCd <= 0 && !st.ship.down) {
      cc.scrapeCd = K.SCRAPE_COOLDOWN;
      sh.sim.impact(worst.sx, worst.sy, 1 + Math.min(2, worst.depth / 40));
      if (sh.main) {
        st.ev.warn = 1.5;
        st.ev.warnText = 'SCRAPING THE ROCKS!';
      }
    }
  };

  const updateTurrets = (dt) => {
    const aimX = toWorldX(ship, AIM.x); // (the middle of the ship, in the world)
    const aimY = toWorldY(ship, AIM.y);
    for (const t of course.turrets) {
      // Every turret (wrecked ones too) stands where the map put it.
      const wx = t.mx ?? t.cx;
      const wy = t.my ?? groundAt(course, wx);
      t.x = wx;
      t.y = wy - 20;
      t.vx = 0;
      if (t.dead) continue;
      // Aim at the middle of the ship.
      const ty = aimY;
      t.aim = Math.atan2(ty - t.y, aimX - wx);
      t.charging = false;
      if (Math.hypot(aimX - wx, ty - t.y) > K.TURRET_RANGE || state.ship.down) continue;
      // Rock in the way? Then it can't see us - terrain is cover.
      let clear = true;
      for (let k = 1; k < 12 && clear; k++) if (inRock(state, t.x + ((aimX - t.x) * k) / 12, t.y - 30 + ((ty - t.y + 30) * k) / 12)) clear = false;
      if (!clear) {
        t.cd = Math.max(t.cd, 0.9);
        continue;
      }
      // Warn before firing: it glows and shows its line for the last moment.
      if (t.cd < K.TURRET_WARN) {
        if (!t.warned) state.sfxQ && state.sfxQ.push(['charge']);
        t.warned = true;
        t.charging = true;
      }
      if ((t.cd -= dt) <= 0) {
        t.warned = false;
        t.cd = (r(K.TURRET_FIRE_MIN, K.TURRET_FIRE_MAX) / firePace(state)) * (course.map && course.map.open ? 1.3 : 1);
        const helm = Object.values(state.players).find((q) => layout.kindOf(q.lock) === 'helm');
        const miss = course.rand() < K.FLAK_MISS || (helm && Math.abs(helm.jy) > 0.3 && course.rand() < 0.4);
        const tx = toWorldX(ship, REF.x - 500 + course.rand() * 1000);
        const shotY = toWorldY(ship, REF.y - 100 + course.rand() * 400) + (miss ? -900 : 0);
        const d = Math.hypot(tx - t.x, shotY - t.y) || 1;
        if (t.rocket) {
          // A slow homing rocket (gunners can shoot it down).
          t.cd *= 1.6;
          state.rockets.push({ x: t.x, y: t.y - 30, ang: -Math.PI / 2, life: K.ROCKET_LIFE, hp: 1 });
        } else state.bullets.push({ x: t.x, y: t.y, vx: ((tx - t.x) / d) * K.FLAK_SPEED + ship.pose.vx, vy: ((shotY - t.y) / d) * K.FLAK_SPEED, miss, life: 5, flak: true });
        puff(t.x + Math.cos(t.aim) * 40, t.y + Math.sin(t.aim) * 40, '#555', 4);
        if (state.flashes) state.flashes.push({ x: t.x + Math.cos(t.aim) * 60, y: t.y - 26 + Math.sin(t.aim) * 60, ang: t.aim, t: 0.1, color: '#ffcf80', size: 1.4 });
      }
    }
    // Rockets turn toward the middle of the ship.
    for (const k of state.rockets) {
      const tx = aimX;
      const ty = aimY - 40;
      const want = Math.atan2(ty - k.y, tx - k.x);
      const diff = Math.atan2(Math.sin(want - k.ang), Math.cos(want - k.ang));
      k.ang += Math.max(-K.ROCKET_TURN * dt, Math.min(K.ROCKET_TURN * dt, diff));
      k.vx = Math.cos(k.ang) * K.ROCKET_SPEED;
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
        impact(toShipX(ship, k.x), toShipY(ship, k.y), K.ROCKET_IMPACT);
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
        t.hp -= shellDmg(shell, t);
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
  // and slowly loses it to drag, landing a little behind (its velocity is the world's: drag pulls it toward 0).
  state.shipBombs = [];
  const BOMB = config.BOMBS;
  const stepBomb = (b, dt) => {
    b.vx += (0 - b.vx) * Math.min(1, dt * BOMB.DRAG);
    b.vy += BOMB.GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  };
  const dropBomb = (x, y, owner) => state.shipBombs.push({ x, y, vx: ship.pose.vx, vy: 60, owner }); // (x, y: the world)
  // Where a bomb dropped now at world (x, y) would land (for the aiming ring).
  const predictBomb = (x, y) => {
    const b = { x, y, vx: ship.pose.vx, vy: 60 };
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
        const x0 = blk.x0;
        const x1 = blk.x1;
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
  const mapProgress = (dt = 0) => {
    const map = course.map;
    const sx = toWorldX(ship, REF.x);
    const sy = toWorldY(ship, REF.y);
    course.dusk += (0 - course.dusk) * 0.02;
    // Stuck check: no real headway toward the goal for a while (pinned on rock, wedged, drifting).
    // Hovering right over the goal (bombing an outpost) doesn't count.
    const dNow = distToGoal(map, sx, sy);
    if (course.unstick > 0) course.unstick -= dt;
    // (A ship resting somewhere it does not "fit" - on a ledge after running out of gas - has no distance to the goal at all:
    // that counts as no headway too, otherwise nothing ever tries to unstick it.)
    if (Number.isFinite(dNow) && (dNow <= 3 || !(dNow > (course.stuckBest ?? Infinity) - 2))) {
      course.stuckBest = dNow;
      course.stuckT = 0;
    } else if ((course.stuckT += dt) > config.MAPS.STUCK_AFTER) {
      course.stuckT = 0;
      course.unstick = config.MAPS.UNSTICK_TIME;
      course.unstuck = (course.unstuck || 0) + 1;
      if (!layout.hasKind('helm')) course.tugNow = true; // (nobody can steer her off the rock: a drifting ship with no helm is not left there)
    }
    // Lost for good: wedged where the ship does not fit (a trench or slot after sinking) and not getting out by itself -
    // a tug hauls it to the nearest open water of sky, so one bad moment is never the end of the run.
    let tow = false;
    if (Number.isFinite(dNow)) course.lostT = 0;
    else if (state.phase === 'flying' && !state.ship.down && (course.lostT = (course.lostT || 0) + dt) > config.MAPS.TOW_AFTER) {
      course.lostT = 0;
      tow = true;
    }
    if (course.tugNow && state.phase === 'flying' && !state.ship.down) { course.tugNow = false; tow = true; }
    if (tow) {
      const t = routeAhead(map, sx, sy, 0);
      if (t) {
        ship.pose.x = t.x - REF.x;
        ship.pose.y = t.y - REF.y;
        state.ship.vy = 0;
        state.ship.speed = Math.max(0, state.ship.speed);
        course.stuckBest = null;
        state.tows = (state.tows || 0) + 1; // (counted for tools/buildsim.mjs: a build that wedges in caves)
        state.ev.warn = 3.5;
        state.ev.warnText = 'STUCK FAST! A TUG HAULS YOU CLEAR';
      }
    }
    if (map.open) {
      // Open sky: knock out every outpost (all its guns), nearest first.
      for (const o of map.outposts) if (!o.done && course.turrets.filter((t) => t.outpost === map.outposts.indexOf(o)).every((t) => t.dead)) {
        o.done = true;
        state.ev.warn = 3;
        state.ev.warnText = 'OUTPOST DESTROYED!' + (config.MAPS.OUTPOST_REFILL ? ' BOMB BAY RESTOCKED' : '');
        if (config.MAPS.OUTPOST_REFILL && state.bombBay) state.bombBay.bombs = Math.max(state.bombBay.bombs, config.BOMBS.MAX); // their stores are ours
      }
      const left = map.outposts.filter((o) => !o.done);
      course.progress = Math.min(0.99, 1 - left.length / map.outposts.length);
      if (left.length && (!course.target || course.target.done)) {
        // The one with the shortest flight (by the route, not as the crow flies).
        course.target = left.map((o) => ({ o, d: stationDist(map, o, sx, sy) })).sort((a, b) => a.d - b.d)[0].o;
        course.stationGun = null;
        course.stuckBest = null;
        setGoal(map, stationCell(map, course.target));
      }
      // Hover right over the nearest gun still standing (the bomb bay can only hit what's under it).
      if (course.target && !course.target.done && (!course.stationGun || course.stationGun.dead)) {
        const live = course.turrets.filter((t) => t.outpost === map.outposts.indexOf(course.target) && !t.dead);
        course.stationGun = live.sort((a, b) => Math.abs(a.mx - sx) - Math.abs(b.mx - sx))[0] || null;
        if (course.stationGun) setGoal(map, stationCell(map, { x: course.stationGun.mx, y: course.stationGun.my - 20 }));
        course.stuckBest = null;
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
    // At the Flagship the beacon only counts once she has been sunk.
    const flagshipAlive = course.stop && course.stop.flagship && state.bossDownLap !== course.lap;
    if (flagshipAlive && Math.hypot(sx - map.goal.x, sy - map.goal.y) < config.MAPS.GOAL_RADIUS && !(state.ev.warn > 0)) {
      state.ev.warn = 2;
      state.ev.warnText = 'SINK THE FLAGSHIP FIRST!';
    }
    if (!course.done && !flagshipAlive && Math.hypot(sx - map.goal.x, sy - map.goal.y) < config.MAPS.GOAL_RADIUS) {
      course.done = true;
      state.ship.hull = Math.min(100, state.ship.hull + K.CHECKPOINT_REPAIR);
      state.ev.warn = 4;
      state.ev.warnText = 'BEACON REACHED! MISSION ' + course.lap + ' COMPLETE';
      course.pendingNext = true;
      if (onMarker) onMarker({ kind: 'home', lap: course.lap + 1 });
    }
  };

  const passMarkers = (dt = 0) => {
    if (course.map) return mapProgress(dt);
    const shipX = toWorldX(ship, REF.x);
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
      const h = p.dx > 300 ? 'AHEAD' : p.dx < -300 ? 'BEHIND - COME ABOUT!' : ''; // (p.dx: how far ahead of her bow the way goes; behind her, turning round is quicker than backing up)
      const v = p.dy < -250 ? 'UP (pump the gas!)' : p.dy > 250 ? 'DOWN (vent the gas!)' : '';
      return h || v ? (course.map.open ? 'Next outpost: ' : 'Way to the beacon: ') + [v, h].filter(Boolean).join(' and ') : course.map.open ? 'Outpost below - guns and bombs!' : '';
    }
    const w = altWindow(state, 2.5);
    const alt = state.ship.alt;
    if (course.scraping && state.ship.speed < 0) return 'Backing off the wall - now climb or dive!';
    const plan = pilotPlan(state, 2.5, 0.5);
    if (plan.speed < 0.1 && plan.target - alt > 120) return 'STOP (lever to the line) - PRESSURE lever UP to climb!';
    if (plan.speed < 0.1 && alt - plan.target > 120) return 'STOP (lever to the line) - PRESSURE lever DOWN to drop!';
    if (w.min > w.max) return 'Squeeze through - hold the middle!';
    if (alt < w.min) return 'CLIMB! (stick up - and pump the gas)';
    if (alt > w.max) return 'DIVE! (stick down - and vent the gas)';
    return '';
  };

  // The ship's own move along the sky for this step. simulation.js calls it FIRST in every step, so everything else that happens in the step (her guns
  // firing, enemies reaching her, the shield, the hit tests) sees her where she ends the step: the same geometry between her and the sky's things as
  // when the world was drawn sliding past a ship that stood still.
  // (Every ship flies on her own pose: her engines move her along her bow, which points the way f says. Another ship moves the same way, with her own speed.)
  const advance = (dt) => {
    if (!K.ENABLED) return;
    for (const sh of state.ships) {
      if (sh.ctx.ship.down > 0) continue; // (the world waits while the crew patches up)
      sh.pose.x += sh.pose.f * scrollSpeed(sh.ctx) * dt;
      if (sh.main && !course.map) {
        // You can back up, but only so far (the land behind is forgotten).
        course.maxDist = Math.max(course.maxDist, ship.pose.x);
        if (ship.pose.x < course.maxDist - K.MAX_REVERSE) {
          ship.pose.x = course.maxDist - K.MAX_REVERSE;
          state.ship.speed = Math.max(0, state.ship.speed);
        }
      }
    }
  };

  // Another ship's turn in the course's step: her rock contact (the same rules as the main ship's, on her own pose and samples) and, on a map, her own stuck check
  // so that her pilot (mapPlan, on her context) backs off and rises when she has made no headway.
  const updateAside = (sh, dt) => {
    const st = sh.ctx;
    const cc = st.course;
    if (st.ship.down > 0) return;
    cc.refY = toWorldY(sh, sh.layout.refPoint.y);
    if (cc.map) {
      const sx = toWorldX(sh, sh.layout.refPoint.x);
      const dNow = distToGoal(cc.map, sx, cc.refY);
      if (cc.unstick > 0) cc.unstick -= dt;
      if (Number.isFinite(dNow) && (dNow <= 3 || !(dNow > (cc.stuckBest ?? Infinity) - 2))) {
        cc.stuckBest = dNow;
        cc.stuckT = 0;
      } else if ((cc.stuckT += dt) > config.MAPS.STUCK_AFTER) {
        cc.stuckT = 0;
        cc.unstick = config.MAPS.UNSTICK_TIME;
      }
    }
    collide(sh, dt);
    proximity(sh);
  };

  const update = (dt) => {
    if (!K.ENABLED) return;
    for (const sh of state.ships) if (!sh.main) updateAside(sh, dt);
    course.refY = toWorldY(ship, REF.y);
    if (state.ship.down > 0) return; // the world waits while the crew patches up
    // (After a mission, the sky-dock and route votes in simulation.js pick the next one and call startMission.)
    if (course.map) passMarkers(dt);
    else {
      generate();
      passMarkers();
      warnAhead(dt);
    }
    collide(ship, dt);
    proximity(ship);
    updateBombs(dt);
    updateTurrets(dt);
  };

  // Put a second ship at her station from ship 0 (formation.dx along the sky, dalt above), then into the nearest open air where all of her fits: the formation
  // point can be inside the rock on a mission map. Called when she joins the sky, when a mission starts and when she is rebuilt. She is then moored there (shipSim.js
  // reads sh.moorAlt) until CAST OFF.
  // (Versus, pvp/match.js: `at` = { x, y, f } puts ANY ship, the main one too, at that spot - the nearest open air where all of her fits - facing f.)
  const place = (sh, at) => {
    if (!at && (sh.main || !sh.formation)) return;
    const map = course.map;
    const face = at && at.f === -1 ? -1 : 1;
    const pv = pivotOf(sh);
    const x0 = at ? at.x : ship.pose.x + sh.formation.dx;
    const y0 = at ? at.y : ship.pose.y - sh.formation.dalt;
    const mine = sh.layout.bounds, idx = state.ships.indexOf(sh);
    const others = state.ships.filter((o) => o !== sh && (o.main || state.ships.indexOf(o) < idx)); // (the ships already in the sky: she is put clear of them)
    const clear = (x, y) => others.every((o) => { const b = o.layout.bounds; return x + mine.x0 >= o.pose.x + b.x1 + 150 || x + mine.x1 <= o.pose.x + b.x0 - 150 || y + mine.y0 >= o.pose.y + b.y1 + 100 || y + mine.y1 <= o.pose.y + b.y0 - 100; });
    const fits = (x, y) => {
      if (!clear(x, y)) return false;
      if (!map) return true;
      for (const [sx, sy] of sh.layout.samples) for (const [ox, oy] of [[0, 0], [0, -70], [0, 70], [-70, 0], [70, 0]]) if (solidAt(map, x + (face === 1 ? sx : 2 * pv - sx) + ox, y + sy + oy)) return false;
      return true;
    };
    let found = null;
    for (let r = 0; r <= 6000 && !found; r += r < 600 ? 100 : 200) { // (the first ships take the near open air: a third has to look further)
      const n = r ? Math.max(8, Math.round(r / 60)) : 1;
      for (let k = 0; k < n && !found; k++) {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2; // (up first: she is moored above a pit rather than inside one)
        const x = x0 + Math.cos(a) * r;
        const y = y0 + Math.sin(a) * r;
        if (fits(x, y)) found = { x, y };
      }
    }
    found = found || { x: x0, y: y0 };
    sh.pose.x = found.x;
    sh.pose.y = found.y;
    sh.pose.f = face;
    sh.pose.turn = 0;
    sh.ctx.ship.vy = 0;
    sh.ctx.ship.speed = sh.ctx.ship.order = 0;
    sh.moorAlt = -found.y;
    Object.assign(sh.ctx.course, { scraping: false, wasScraping: false, near: [], lastContact: null, scrapeCd: 0, unstick: 0, stuckT: 0, stuckBest: null });
  };

  // After going down: rewind to just before the last marker passed (open sky, same terrain ahead).
  const reset = () => {
    state.rockets.length = 0;
    const m = course.lastMarker;
    ship.pose.x = m.cx - REF.x - K.REWIND_BEFORE;
    course.warned = null;
    for (const t of course.turrets) t.cd = Math.max(t.cd, 2);
    state.ev.warn = 3;
    state.ev.warnText = m.kind === 'home' ? 'BACK TO THE MOORING MAST - TRY AGAIN!' : 'BACK TO THE LAST ' + (m.kind === 'beacon' ? 'BEACON' : 'CHECKPOINT') + '!';
  };

  // Start mission n on a fresh map: the ship at the start, the beacon somewhere ahead.
  // opts (from the voyage): { environment, kind, danger, modifiers, stop, title }. environment is the id of
  // the look/hazards to use ('skyisles' for now); the map is also tagged with it (map.environment).
  function startMission(n, opts = {}) {
    const MP = config.MAPS;
    const kind = MP.FORCE_KIND || opts.kind || MP.KINDS[(n - 1) % MP.KINDS.length];
    const map = opts.arena ? buildArenaMap(course.rand, layout, opts.arena, opts.arenaGap) : makeMap(kind, n, course.rand, opts.lengthMul || 1, layout); // (Versus: the big arena sky, maps.js buildArenaMap)
    map.environment = pickEnvironment(opts.environment); // 'skyisles' (the original look and rules), 'frost', 'ember'...
    const d = Math.min(1, (n - 1) / 4);
    Object.assign(course, {
      map,
      lap: n,
      environment: map.environment,
      danger: opts.danger || 2,
      modifiers: opts.modifiers || [],
      stop: opts.stop || null,
      leg: 'out',
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
      stationGun: null,
      stuckBest: null,
      stuckT: 0,
      unstick: 0,
      markers: [
        { kind: 'home', mx: map.start.x, my: floorBelow(map, map.start.x, map.start.y), top: map.start.y + 300, passed: true },
        map.open ? null : { kind: 'beacon', mx: map.goal.x, my: floorBelow(map, map.goal.x, map.goal.y), passed: false },
        ...map.outposts.map((o) => ({ kind: 'outpost', mx: o.x, my: o.y, passed: false })),
      ].filter(Boolean),
    });
    course.lastMarker = course.markers[0];
    ship.pose.x = map.start.x - REF.x;
    course.homeAlt = REF.y - map.start.y;
    ship.pose.y = -course.homeAlt;
    state.ship.vy = 0;
    state.ship.speed = state.ship.order = 0;
    for (const sh of state.ships) sh.sim && sh.sim.comeAbout.reset(); // (a new mission starts bow to the right, whichever way she finished the last)
    for (const sh of state.ships) place(sh); // (any other ship goes back to her station beside ours)
    if (map.open && state.bombBay) state.bombBay.bombs = Math.max(state.bombBay.bombs, config.BOMBS.MAX); // a full bay for the raid
    state.rockets.length = 0;
    if (state.shipBombs) state.shipBombs.length = 0;
    state.ev.warn = 4;
    state.ev.warnText = opts.title ? opts.title : map.open ? 'MISSION ' + n + ': DESTROY ' + map.outposts.length + ' OUTPOSTS!' : 'MISSION ' + n + ': REACH THE BEACON!';
  }

  // A brand-new game: fresh terrain from the home mast, lap 1.
  const restart = () => {
    state.rockets.length = 0;
    state.shipBombs.length = 0;
    ship.pose.x = 0;
    Object.assign(course, {
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
    if (config.MAPS.ENABLED) startMission(1, firstMission && firstMission());
  };

  if (config.MAPS.ENABLED) startMission(1, firstMission && firstMission());

  return { advance, update, reset, restart, helmHint, dropBomb, predictBomb, startMission, place };
}
