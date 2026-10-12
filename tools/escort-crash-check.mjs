// PATROL PLANES AND AIRSHIPS gate (config.ESCORT.CRASH_ON_SHIPS; public/modules/host/escort.js, planes.js shipTouched, hijack.js). Headless, seeded.
//   node tools/buildsim.mjs --check-escort-crash     or directly:   node tools/escort-crash-check.mjs [--seed 1] [--minutes 3]
//
// A flying escort fighter that touches ANY airship's hull or gasbag crashes (like one shot down: the pilot bails out, the crew rebuild her) and the ship she hit takes a small knock there.
//   (a) her own ship: a plane flown into the hull crashes - but not in the grace after launch, and not when she is homing in on her hook; the ship takes a CRASH_POWER knock where she struck, the pilot
//       bails out, the rebuild timer starts, "CRASHED!" pops, the Ship's Book gets an 'escort-crash' moment; a gasbag counts as well as the hull; a docked plane never crashes;
//   (b) another ship (a second ship in the sky) and the enemy gunship (a Ship since B.5): the plane crashes and THAT ship takes the knock; a ship that is down is not solid;
//   (c) Versus: a red plane flown into the blue ship crashes and blue takes the knock (and the other way round);
//   (d) the auto pilot steers clear: a patrol plane aimed square at another ship's hull swings away and flies on, while a person's plane (or the old game, CRASH_ON_SHIPS off) goes in;
//   (e) a stolen plane (hijack) crashes into an airship after its grace;
//   (f) the switch: CRASH_ON_SHIPS off = planes pass through ships (the old game);
//   (g) a 3-minute run with 8 bots on two ships in one sky: 0 errors, the auto planes rarely crash.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1)), minutes = Number(flag('minutes', 3));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const P = await load('modules/host/pose.js');
const { transfer } = await load('modules/host/ships.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const E = config.ESCORT;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];

function step(sim, n = 1) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
  }
}
// A person (not a bot) on a ship, standing at the escort station of that name.
function person(st, id, ship, extra = {}) {
  const d = ship.layout.deckIndex('main');
  const p = { id, name: id, species: config.CREW_SPECIES[0], color: '#fff', x: ship.layout.platforms[d].x0 + 200, y: ship.layout.platforms[d].y, d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: null, ...extra };
  st.players[id] = p;
  transfer(st, p, ship, d, p.x);
  return p;
}
// Calm open sky, nothing but the ships to hit; one person on the ship (the helm is left alone: the throttle stays where the lobby left it). opts: second (a build), patrol (auto patrol on).
function boot(o = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0;
  config.PACING.BUILD = 1e6;
  config.SPECIALS.FIRST_AFTER = 1e9;
  config.PACING.GUNSHIP_FIRST = 1e9;
  config.ESCORT.AUTO_PATROL = o.patrol === true;
  clock = seedRandom(seed);
  const sim = createSimulation();
  const st = sim.state;
  if (o.second) sim.addShip(o.second);
  const ours = st.ships[0];
  const pl = person(st, 'p1', ours);
  sim.castOff();
  st.course.map.solid.fill(0);
  step(sim, 60 * 3);
  return { sim, st, ours, pl };
}
// Take the station of a ship's plane i and wait for her to drop off the hook. Returns the plane.
function launched(sim, ship, p, i = 0) {
  const s = ship.ctx.escorts[i];
  p.lock = s.name;
  for (let k = 0; k < 200 && !s.flying; k++) step(sim);
  return s;
}
// A point on a ship (world coordinates): hull = the middle of her first hit box; bag = the centre of her first gasbag.
const hullPoint = (ship) => { const r = ship.layout.hitRects[0]; return { x: P.toWorldX(ship, (r.x0 + r.x1) / 2), y: P.toWorldY(ship, (r.y0 + r.y1) / 2) }; };
const bagPoint = (ship) => { const b = ship.layout.gasbags[0]; return { x: P.toWorldX(ship, b.cx), y: P.toWorldY(ship, b.cy) }; };
// Put a flying plane at a world point, flying level; the next step finds her inside whatever is there.
function place(s, pt, heading = 0) { Object.assign(s, { x: pt.x, y: pt.y, heading, air: E.SPEED, vx: Math.cos(heading) * E.SPEED, vy: Math.sin(heading) * E.SPEED }); }
const knocks = (ship) => ship.ctx.hitLog.filter((h) => Math.abs(h.power - E.CRASH_POWER) < 1e-6);
const popped = (st) => (st.popups || []).some((q) => q.text === 'CRASHED!');
const book = (st, kind) => (st.moments || []).filter((m) => m.kind === kind);

// ---- (a) her own ship ----
{
  const { sim, st, ours, pl } = boot();
  const s = launched(sim, ours, pl);
  report(s.flying && s.launchT > 0 && E.CRASH_ON_SHIPS, `(a) a person takes the station and she drops off the hook (grace ${s.launchT.toFixed(2)} s left of ${E.DOCK_GRACE})`);
  // inside the grace: through her own ship, nothing happens
  place(s, hullPoint(ours));
  s.launchT = E.DOCK_GRACE;
  step(sim);
  report(s.flying && !s.docked && s.rebuild === 0, '(a) in the grace after launch her own hull does not crash her');
  // a docked plane is never in danger
  const s2 = ours.ctx.escorts[1];
  step(sim, 5);
  report(s2.docked && s2.rebuild === 0 && s2.hp === s2.max, '(a) the plane still on her hook is untouched');
  // the grace is over: the same place crashes her
  s.launchT = 0;
  place(s, hullPoint(ours));
  const before = knocks(ours).length;
  step(sim);
  const k = knocks(ours);
  report(!s.flying && s.docked && s.rebuild > E.REBUILD - 0.5 && s.hp === s.max, `(a) into her own hull after the grace: she crashes, the rebuild timer starts (${s.rebuild.toFixed(1)} s of ${E.REBUILD})`);
  report(k.length === before + 1 && k[k.length - 1].power === E.CRASH_POWER && ours.sim.hitsShip(k[k.length - 1].x, k[k.length - 1].y), `(a) the ship took ONE small knock (power ${E.CRASH_POWER}) at the contact point, on her hull`);
  report(!pl.lock && pl.ko > 0, '(a) the pilot bailed out (station released, knocked out until he comes round)');
  report(st.wrecks.some((w) => w.kind === 'escort') && popped(st) && /CRASHED/.test(st.ev.warnText), '(a) a wreck falls, "CRASHED!" pops and the banner says the plane crashed');
  const m = book(st, 'escort-crash');
  report(m.length === 1 && m[0].who[0] === 'p1', "(a) the Ship's Book has an 'escort-crash' moment naming the pilot");
  // she comes back after the timer, flies, and a gasbag counts too
  step(sim, 60 * (E.REBUILD + 1));
  report(s.rebuild === 0 && s.docked, '(a) the rebuild timer runs out and she is ready again');
  const t = launched(sim, ours, pl);
  t.launchT = 0;
  place(t, bagPoint(ours));
  step(sim);
  report(!t.flying && t.rebuild > 0 && knocks(ours).length === before + 2, '(a) a gasbag crashes her too, and the ship takes the knock');
  // homing in on her hook: close to it her own ship is let be
  step(sim, 60 * E.REBUILD);
  const u = launched(sim, ours, pl);
  u.launchT = 0;
  pl.lock = null;
  Object.assign(u, { returning: true });
  const d = { x: P.toWorldX(ours, u.dock.x), y: P.toWorldY(ours, u.dock.y) };
  place(u, d);
  u.s = 0;
  const hullHere = ours.sim.hitsShip(u.dock.x, u.dock.y);
  step(sim);
  report(u.docked && u.rebuild === 0, `(a) coming home to the hook (hull there: ${hullHere}) she latches on, no crash`);
}

// ---- (b) another ship, the enemy gunship, a ship that is down ----
{
  const { sim, st, ours, pl } = boot({ second: BUILDS.classic });
  const other = st.ships[1];
  report(st.ships.length === 2 && !!other, '(b) a second ship shares the sky');
  const s = launched(sim, ours, pl);
  s.launchT = 0;
  const kb = knocks(other).length, ko = knocks(ours).length;
  place(s, hullPoint(other));
  step(sim);
  report(!s.flying && s.rebuild > 0 && knocks(other).length === kb + 1 && knocks(ours).length === ko, "(b) into ANOTHER ship's hull: she crashes and THAT ship takes the knock, not her own");
  const m = book(st, 'escort-crash');
  report(m.length === 1 && m[0].data.own === false, "(b) the moment says it was not her own ship");
  step(sim, 60 * (E.REBUILD + 1));
  const t = launched(sim, ours, pl);
  t.launchT = 0;
  other.state.down = 5;
  other.ctx.wreck = { t: 0, lap: 1, kills: 0 };
  place(t, hullPoint(other));
  step(sim);
  report(t.flying, '(b) a ship that is down (patching) is not solid');
  other.state.down = 0;
  other.ctx.wreck = null;
  place(t, hullPoint(other));
  step(sim);
  report(!t.flying, '(b) ...and is again when she is back up');
}
{
  const { sim, st, ours, pl } = boot();
  config.GUNSHIP.AS_SHIP = true;
  let g = null;
  for (let k = 0; k < 20 && !g; k++) { sim.gunship.spawn({ seed: 3, hull: 'frigate', mission: 2, special: null, personality: 'aggressive' }); g = st.ships.find((q) => q.ai); if (!g) step(sim, 60); }
  report(!!g, '(b) the enemy gunship comes as a Ship');
  if (g) {
    const s = launched(sim, ours, pl);
    s.launchT = 0;
    const kg = knocks(g).length;
    place(s, hullPoint(g));
    step(sim);
    report(!s.flying && s.rebuild > 0 && knocks(g).length === kg + 1, '(b) into the enemy gunship: she crashes and the gunship takes the knock');
  }
  config.GUNSHIP.AS_SHIP = false;
}

// ---- (c) Versus ----
{
  config.ESCORT.AUTO_PATROL = false;
  clock = seedRandom(seed);
  const sim = createSimulation();
  sim.setSession('versus');
  const M = sim.match;
  M.addBots('red', 2);
  M.addBots('blue', 2);
  M.begin({ shelf: false });
  for (let k = 0; k < 600 && M.phase !== 'fight'; k++) step(sim);
  const st = sim.state;
  const [red, blue] = st.ships;
  report(M.phase === 'fight' && st.ships.length === 2 && red.ctx.escorts.length > 0 && blue.ctx.escorts.length > 0, "(c) Versus: two ships, each with her own patrol planes");
  for (const [a, b, name] of [[red, blue, 'red into blue'], [blue, red, 'blue into red']]) {
    const s = a.ctx.escorts[0];
    Object.assign(s, { docked: false, flying: true, returning: false, auto: true, launchT: 0, hp: s.max, rebuild: 0 });
    const kb = knocks(b).length, ka = knocks(a).length;
    place(s, hullPoint(b));
    step(sim);
    report(!s.flying && s.docked && s.rebuild > 0 && knocks(b).length === kb + 1 && knocks(a).length === ka, `(c) ${name}: the plane crashes, the rival ship takes the knock and her own team's ship does not`);
  }
}

// ---- (d) the auto pilot steers clear ----
{
  const run = (who, on) => {
    const { sim, st, ours, pl } = boot({ second: BUILDS.classic, patrol: true });
    config.ESCORT.CRASH_ON_SHIPS = on;
    const other = st.ships[1];
    const s = ours.ctx.escorts[0];
    // a patrol plane (nobody at the station) diving at the other ship's gasbag from above, 420 px over its top (0.75 s away), nowhere near her own ship
    const bag = other.layout.gasbags[0];
    const top = { x: P.toWorldX(other, bag.cx), y: P.toWorldY(other, bag.cy - bag.ry) };
    Object.assign(s, { docked: false, flying: true, returning: false, auto: true, launchT: 0, idle: 0 });
    place(s, { x: top.x, y: top.y - 420 }, Math.PI / 2);
    const hp = { x: P.toWorldX(other, bag.cx), y: P.toWorldY(other, bag.cy) };
    // keep the plane out on patrol (as if enemies were about): a long idle allowance, and pull the orbit target through the other ship
    config.ESCORT.PATROL_IDLE = 1e9;
    if (who === 'person') { pl.lock = s.name; pl.jx = 0; pl.jy = 1; }
    let crashed = false, minGap = Infinity;
    for (let k = 0; k < 60 * 3 && !crashed; k++) {
      step(sim);
      if (!s.flying) crashed = true;
      if (s.flying) minGap = Math.min(minGap, Math.hypot(s.x - hp.x, s.y - hp.y));
    }
    config.ESCORT.CRASH_ON_SHIPS = true;
    return { crashed, minGap, knocked: knocks(other).length };
  };
  const auto = run('auto', true), person1 = run('person', true);
  report(!auto.crashed && auto.knocked === 0, `(d) the auto pilot, aimed at another ship's hull, swings clear and flies on (no crash in 3 s; closest ${auto.minGap.toFixed(0)} px of her middle)`);
  report(person1.crashed && person1.knocked === 1, "(d) a person at the stick flying straight at it crashes (bad piloting is punished)");
  config.ESCORT.PATROL_IDLE = 10;
}

// (d2) the same from every side: eight approaches (from above, below, ahead, astern and between) at the other ship's middle, a patrol plane on auto each time
{
  let crashes = 0, ran = 0;
  config.ESCORT.PATROL_IDLE = 1e9;
  for (let i = 0; i < 8; i++) {
    const { sim, st, ours } = boot({ second: BUILDS.classic, patrol: true });
    const other = st.ships[1];
    other.pose.y -= 1800; // (the second ship starts almost on top of the first: lift her clear, so there is sky all round her and the plane is not squeezed between two hulls)
    const s = ours.ctx.escorts[0];
    const bag = other.layout.gasbags[0];
    const mid = { x: P.toWorldX(other, bag.cx), y: P.toWorldY(other, bag.cy) };
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const from = { x: mid.x + Math.cos(a) * 1500, y: mid.y + Math.sin(a) * 1100 };
    Object.assign(s, { docked: false, flying: true, returning: false, auto: true, launchT: 0, idle: 0 });
    place(s, from, Math.atan2(mid.y - from.y, mid.x - from.x));
    if (ours.sim.hitsShip(P.toShipX(ours, from.x), P.toShipY(ours, from.y)) || other.sim.hitsShip(P.toShipX(other, from.x), P.toShipY(other, from.y))) continue; // (a start inside a hull would be no test)
    ran++;
    for (let k = 0; k < 60 * 4 && s.flying; k++) step(sim);
    if (!s.flying && s.rebuild > 0) crashes++;
  }
  config.ESCORT.PATROL_IDLE = 10;
  report(ran >= 6 && crashes === 0, `(d) the auto pilot, aimed at another ship's middle from ${ran} sides, flew 4 s each and crashed ${crashes} times`);
}

// ---- (e) a stolen plane ----
{
  const { sim, st, ours, pl } = boot({ second: BUILDS.classic ? BUILDS.classic : undefined });
  const other = st.ships[1];
  const hj = { x: 0, y: 0, vx: 0, vy: 0, hp: 5, max: 5, heading: 0, air: 400, rider: pl.id, phase: 'fly', flyT: E.DOCK_GRACE + 1, fuel: 99, big: false, gunCd: 0, t: 5, trail: [], orbit: 0 };
  st.hijacks = st.hijacks || [];
  st.hijacks.push(hj);
  pl.hj = hj;
  pl.fly = true;
  place(hj, hullPoint(other));
  const kb = knocks(other).length;
  step(sim);
  report(!st.hijacks.includes(hj) && knocks(other).length === kb + 1 && !pl.hj, '(e) a stolen plane flown into an airship crashes (the rider bails out) and the ship takes the knock');
}

// ---- (f) the switch ----
{
  const { sim, st, ours, pl } = boot();
  config.ESCORT.CRASH_ON_SHIPS = false;
  const s = launched(sim, ours, pl);
  s.launchT = 0;
  place(s, hullPoint(ours));
  step(sim);
  const through = s.flying && knocks(ours).length === 0;
  config.ESCORT.CRASH_ON_SHIPS = true;
  report(through, '(f) CRASH_ON_SHIPS off: the plane flies through the hull (the old game)');
}

// ---- (g) a long run with bots on two ships ----
{
  config.ESCORT.AUTO_PATROL = true;
  config.PACING.RATE_START = 1; // (the default sky: enemies come, the patrol planes go out)
  clock = seedRandom(seed + 7);
  const sim = createSimulation();
  const st = sim.state;
  sim.addShip(BUILDS.classic);
  for (const sh of st.ships) {
    const e = sh.layout.boarderEntryPoints;
    for (let i = 0; i < 8; i++) {
      const id = sh.id + '_bot' + i;
      st.players[id] = { id, bot: true, ship: sh.id, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -80, jx: 0, jy: 0, t: 0, connected: true, fall: true, ko: 0 };
    }
  }
  sim.castOff();
  let crashes = 0, flights = 0, wasFlying = new Map();
  for (const sh of st.ships) { const imp = sh.sim.impact; sh.sim.impact = (x, y, pw, ...r) => { if (pw === E.CRASH_POWER) crashes++; return imp(x, y, pw, ...r); }; }
  const e0 = errors.length;
  for (let k = 0; k < 60 * 60 * minutes; k++) {
    step(sim);
    for (const sh of st.ships) for (const s of sh.ctx.escorts || []) { const was = wasFlying.get(s); if (s.flying && !was) flights++; wasFlying.set(s, s.flying); }
    for (const sh of st.ships) sh.state.hull = 100;
  }
  report(errors.length === e0 && flights > 0, `(g) ${minutes} minutes, 8 bots on each of two ships: ${flights} patrol flights, ${crashes} crashed into a ship, 0 errors`);
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors logged');
if (errors.length) ok = false;
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
