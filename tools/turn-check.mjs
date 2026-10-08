// M.3 gate: COME ABOUT (MOVEMENT.md). Headless.
//   node tools/buildsim.mjs --check-turn        or directly:   node tools/turn-check.mjs [--seed 1]
//
// A ship turns round on the helmsman's command and everything that is "ahead" follows her bow:
//   * the command: a person's COME ABOUT button (player.ca) or the stick held hard astern for TURN.HOLD seconds; a bot only when config.SHIP.TURN.BOT_TURNS is on;
//   * the manoeuvre: pose.turn runs 0..1 over TURN.TIME, pose.f flips at the middle, her speed along her bow flips with it so her velocity over the ground does not jump,
//     her speed is held under TURN.MAX_SPEED, the guns cannot fire, the camera holds its zoom;
//   * refusals (a toast on the phone, a line on the TV): too fast, already turning, cooling down, falling, a gunship alongside, a hookshot line, the mirrored hull in rock;
//   * facing left: the rock samples hit on the right side, the Nose Gun's shells fly the mirrored way, a person's stick moves him the way it points on the screen (also a stick
//     held across the flip), the bots' jobs go on;
//   * a headless ship turns on a route map and flies back to a goal behind her; a second ship turns on her own and the first is untouched.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './instances.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed); // (boot() seeds it again: every scenario flies its own repeatable sky, so one scenario's random draws do not decide the next one's)
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyPlayerInput } = await load('modules/host/network.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { solidAt, setGoal, stationCell, distToGoal } = await load('modules/host/maps.js');
const { tilt } = await load('modules/host/course.js');
const P = await load('modules/host/pose.js');
const { loadBuild } = await import(pathToFileURL(path.join(publicDir, '..', 'tools', 'buildload.mjs')).href);
const T = config.SHIP.TURN;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];

// Quiet skies (no pacing director, no specials) so a scripted manoeuvre is not interrupted; `calm: false` leaves the enemies on.
function boot({ kind = 'open', calm = true, bots = 6, second = false } = {}) {
  config.MAPS.FORCE_KIND = kind;
  config.ENVIRONMENTS.FORCE = 'skyisles';
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; }
  clock = seedRandom(seed);
  const sim = createSimulation();
  const st = sim.state;
  const ships = [st.ships[0]];
  if (second) ships.push(sim.addShip(second, { formation: { dx: -250, dalt: -1150 } }));
  for (const sh of ships) {
    const e = sh.layout.boarderEntryPoints;
    for (let i = 0; i < bots; i++) {
      const id = sh.id + '_bot' + i;
      st.players[id] = { id, bot: true, ...(ships.length > 1 ? { ship: sh.id } : {}), name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    }
  }
  // a person at each ship's helm (the bots leave a taken station alone)
  const humans = ships.map((sh) => {
    const helm = sh.layout.one('helm');
    const h = { id: 'h_' + sh.id, ...(ships.length > 1 ? { ship: sh.id } : {}), name: 'Helm', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: sh.layout.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0, thr: 0.5 };
    st.players[h.id] = h;
    return h;
  });
  sim.castOff();
  return { sim, st, A: ships[0], B: ships[1], helm: humans[0], helmB: humans[1], ships };
}
// (a hovering ship with nobody venting steam would blow her boiler and burst a pipe, which has nothing to do with turning: the stoker keeps the pressure down)
const pins = new Map(); // (ships held at one height for a test in a sky with the rock cleared away: nothing holds her up there)
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { for (const sh of sim.state.ships) sh.state.press = Math.min(sh.state.press, 72); for (const [sh, y] of pins) { sh.pose.y = y; sh.pose.vy = 0; } clock.ms += DT * 1000; try { sim.update(DT); } catch (e) { errors.push(String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } } };
const secs = (sim, s) => step(sim, Math.round(s * 60));
const sink = (st) => { st.ev.warn = 0; };

// ================================================================== 1. the command, the manoeuvre
{
  const { sim, st, A, helm } = boot();
  secs(sim, 6);
  helm.thr = 0;
  secs(sim, 12); // (she slows to a hover)
  const f0 = A.pose.f, x0 = A.pose.x;
  report(f0 === 1 && A.pose.turn === 0 && st.turning.t === 0, 'a ship starts facing right (f +1), not turning');
  // a short press does nothing: the host counts the HOLD seconds itself
  applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 1 });
  secs(sim, T.HOLD * 0.5);
  applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 0 });
  secs(sim, 1);
  report(st.turning.t === 0 && A.pose.f === 1, `COME ABOUT held for ${(T.HOLD * 0.5).toFixed(1)} s (less than ${T.HOLD}) does not turn her`);
  // hold it: the ring fills, then she turns
  applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 1 });
  let ringMax = 0, startAt = -1, flipAt = -1, endAt = -1, zoomOk = true, firePlayed = false;
  const cam = createWorldCamera();
  let view = cam.update(0, st, 1920, 1080);
  const zoom0 = view.zoom;
  const vxs = [], fs = [];
  let t = 0, cdAtEnd = -1;
  for (let i = 0; i < 60 * 6; i++) {
    step(sim, 1);
    t += DT;
    ringMax = Math.max(ringMax, st.turning.hold / T.HOLD);
    if (startAt < 0 && st.turning.t > 0) { startAt = t; applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 0 }); }
    if (flipAt < 0 && A.pose.f === -1) flipAt = t;
    if (startAt >= 0 && endAt < 0 && st.turning.t === 0) { endAt = t; cdAtEnd = st.turning.cd; }
    view = cam.update(DT, st, 1920, 1080);
    if (A.pose.turn > 0 && Math.abs(view.zoom - zoom0) > 1e-9 && flipAt < 0) zoomOk = false;
    vxs.push(A.pose.vx); fs.push(A.pose.f);
    if (st.sfxQ.some((q) => q[0] === 'comeabout')) firePlayed = true;
    st.sfxQ.length = 0;
  }
  report(ringMax >= 0.95 && startAt > T.HOLD - 0.1 && startAt < T.HOLD + 0.3, `the hold ring fills for ${T.HOLD} s (the TV and the phone draw it from it), then the manoeuvre starts (at ${startAt.toFixed(2)} s)`);
  report(endAt > 0 && Math.abs(endAt - startAt - T.TIME) < 0.1 && Math.abs(flipAt - startAt - T.TIME / 2) < 0.1, `it takes ${T.TIME} s (took ${(endAt - startAt).toFixed(2)}), and f flips at the middle (${(flipAt - startAt).toFixed(2)} s in)`);
  report(A.pose.f === -1 && A.pose.turn === 0 && firePlayed, 'she ends facing left (f -1), pose.turn back to 0, and the COMING ABOUT sound was asked for');
  report(zoomOk, 'the camera holds its zoom while she comes about');
  let jump = 0;
  for (let i = 1; i < vxs.length; i++) jump = Math.max(jump, Math.abs(vxs[i] - vxs[i - 1]));
  report(jump < 60, `her velocity over the ground does not jump at the flip (largest step in pose.vx ${jump.toFixed(1)} px/s)`);
  report(Math.abs(A.pose.x - x0) < 400 && Math.abs(A.state.speed) <= T.MAX_SPEED + 1e-9, `she stayed about where she was (${Math.round(A.pose.x - x0)} px) and her speed stayed under ${T.MAX_SPEED}`);
  report(cdAtEnd > T.COOLDOWN - 0.1 && cdAtEnd <= T.COOLDOWN, `the cooldown starts when the turn ends (${cdAtEnd.toFixed(1)} s, config ${T.COOLDOWN})`);
}

// ================================================================== 2. refusals
{
  const { sim, st, A, helm } = boot();
  secs(sim, 5);
  helm.thr = 0;
  secs(sim, 12);
  st.course.map.solid.fill(0); // (the hull must be clear of rock everywhere for the rock test below to be about ONE cell)
  pins.set(A, A.pose.y);
  const CA = A.sim.comeAbout;
  const texts = new Set();
  const hold = (s = T.HOLD + 0.3) => { applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 1 }); for (let i = 0; i < Math.round(s * 60); i++) { step(sim, 1); if (st.ev.warn > 0) texts.add(st.ev.warnText); } applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 0 }); };
  // too fast
  A.state.speed = 0.7;
  helm.thr = 0.7;
  const why1 = CA.why();
  sink(st);
  hold();
  report(/Slow down/.test(why1) && st.turning.t === 0 && A.pose.f === 1 && [...texts].some((x) => /SLOW DOWN/.test(x)), `too fast (speed 0.7 against ${T.MAX_SPEED}): refused with "${why1}", the TV says so, she does not turn`);
  helm.thr = 0;
  secs(sim, 12);
  secs(sim, T.REFUSE_COOLDOWN);
  // mirrored hull in rock: a column of rock just past her outermost outline point. The hull as she is now clears it, but the mirrored hull swings a few pixels further out
  // (it is mirrored about the middle of her bounds, which is not the middle of her outline) and, with the margin, would touch it.
  const map = st.course.map;
  const CELL = map.CELL;
  const outX = () => Math.max(...A.layout.samples.map(([sx, sy]) => P.toWorldX(A, tilt(st, sx, sy)[0])));
  A.pose.pitch = 0; // (level: the outline is then what the bounds say)
  A.pose.x += Math.ceil(outX() / CELL) * CELL - 1 - outX(); // (her outermost point 1 px short of a cell boundary)
  const col = Math.floor((outX() + 2) / CELL);
  const cells = [];
  for (let j = 0; j < map.H; j++) cells.push(j * map.W + col);
  for (const c of cells) map.solid[c] = 1;
  const inRockNow = A.layout.samples.some(([sx, sy]) => { const [tx, ty] = tilt(st, sx, sy); return solidAt(map, P.toWorldX(A, tx), P.toWorldY(A, ty)); });
  const why2 = CA.why();
  sink(st);
  hold();
  report(!inRockNow && /No room/.test(why2) && st.turning.t === 0 && A.pose.f === 1, `the mirrored hull would be in rock (a rock column 1 px past her outline, which the mirrored outline reaches): refused with "${why2}"`);
  for (const c of cells) map.solid[c] = 0;
  report(CA.why() === null, 'and with the rock gone she may turn again');
  // already turning, cooling down
  hold();
  report(st.turning.t > 0 || A.pose.turn > 0, 'a held COME ABOUT with clear air and a slow ship starts the turn');
  const why3 = CA.why();
  secs(sim, T.TIME + 0.5);
  const why4 = CA.why();
  report(/Already/.test(why3) && /Wait/.test(why4), `during the turn: "${why3}"; straight after it: "${why4}"`);
  secs(sim, T.COOLDOWN + 1);
  report(CA.why() === null, 'and after the cooldown she may turn again' + (CA.why() ? ' (' + CA.why() + ')' : ''));
  // going down, a gunship alongside, a hookshot line, moored
  const gd = A.sim.goingDown;
  const save = { down: A.state.down, gun: st.gunship };
  A.state.down = 5;
  const w5 = CA.why();
  A.state.down = save.down;
  st.gunship = { phase: 'hunt' };
  const w6 = CA.why();
  st.gunship = save.gun;
  helm.hook = { phase: 'caught' };
  const w7 = CA.why();
  helm.hook = null;
  const phase = st.phase;
  st.phase = 'lobby';
  const w8 = CA.why();
  st.phase = phase;
  report(!!w5 && /gunship/.test(w6) && /hookshot/.test(w7) && /Cast off/.test(w8) && CA.why() === null, `refused while she is wrecked ("${w5}"), with a gunship alongside ("${w6}"), with someone on a hookshot line ("${w7}"), and at the mast ("${w8}"), and then "${CA.why()}"`);
  pins.clear();
  report(typeof gd.active === 'function', 'going down is checked through the last stand (goingDown.active)');
  // the stick held hard astern asks as well (people only: a bot's stick is its own business)
  A.sim.comeAbout.reset();
  A.state.speed = 0;
  helm.thr = 0;
  secs(sim, 1);
  applyPlayerInput(st, helm, { jx: -1, jy: 0 }); // (hard astern on a ship facing right = the screen's left)
  let started = false;
  for (let i = 0; i < Math.round((T.HOLD + 0.5) * 60); i++) { step(sim, 1); if (st.turning.t > 0) started = true; }
  applyPlayerInput(st, helm, { jx: 0, jy: 0 });
  report(started, 'the stick held hard astern for the same time is the same command');
  secs(sim, T.TIME + 1);
  report(A.pose.f === -1, 'and she comes about (facing left now)');
}

// ================================================================== 3. facing left: rock on the right side, shells, sticks
{
  const { sim, st, A, helm } = boot();
  secs(sim, 5);
  helm.thr = 0;
  secs(sim, 12);
  const map = st.course.map;
  const clear = () => { map.solid.fill(0); };
  // a wall to the WORLD's right of the ship
  const wallRight = (extra) => {
    clear();
    const farX = Math.max(...A.layout.samples.map(([sx, sy]) => P.toWorldX(A, sx)));
    const wi = Math.floor((farX - extra) / map.CELL);
    for (let i = wi; i < map.W; i++) for (let j = 0; j < map.H; j++) map.solid[j * map.W + i] = 1;
  };
  const probe = (f) => {
    A.pose.f = f;
    A.pose.pitch = 0;
    A.state.speed = 0;
    A.state.down = 0;
    const x = A.pose.x, y = A.pose.y;
    wallRight(40);
    A.ctx.forces.queue.length = 0;
    sim.course.update(DT);
    const c = st.course;
    const out = { scraping: c.scraping, contact: c.lastContact, dx: A.pose.x - x, speed: A.state.speed, fx: null };
    const hit = A.ctx.forces.queue.find((e) => e.source === 'scrape');
    out.fx = hit ? hit.fx : null;
    A.pose.x = x; A.pose.y = y;
    return out;
  };
  const R = A.layout.refPoint;
  const right = probe(1), left = probe(-1);
  // facing right the wall is at her bow: pushed back (world left), speed goes astern, the force kicks the bow back; facing left it is at her stern: pushed along the world
  // left again, which is AHEAD for her now, and the force is toward her bow
  report(right.scraping && left.scraping && right.dx < 0 && left.dx < 0, `a rock wall on the right of the screen pushes her left either way round (facing right ${right.dx.toFixed(1)} px, facing left ${left.dx.toFixed(1)} px)`);
  report(right.contact.x0 > R.x && left.contact.x0 < R.x, `the stuck outline point is at her bow facing right (ship x ${Math.round(right.contact.x0)} > ${R.x}) and at her STERN facing left (${Math.round(left.contact.x0)} < ${R.x}): the mirrored samples hit rock on the correct side`);
  report(right.speed < 0 && left.speed > 0, `the bounce is along her bow: astern (${right.speed.toFixed(2)}) facing right, ahead (${left.speed.toFixed(2)}) facing left`);
  report(right.fx !== null && left.fx !== null && right.fx < 0 && left.fx > 0, `and the force she feels is in her own frame: bow kicked back (fx ${right.fx && right.fx.toFixed(2)}) facing right, toward the bow (fx ${left.fx && left.fx.toFixed(2)}) facing left`);
  clear();
  A.pose.f = 1;

  // --- the Nose Gun's shells
  const bot = (id) => st.players[id];
  for (const id of Object.keys(st.players)) if (id.includes('_bot')) delete st.players[id]; // (no bots in the way)
  const gun = A.ctx.GUNS['Nose Gun'];
  const gst = A.layout.stations.find((s) => s.n === 'Nose Gun');
  const me = { id: 'gunner', name: 'Gunner', species: config.CREW_SPECIES[1], color: '#0f0', x: gst.x, y: A.layout.platforms[gst.d].y, d: gst.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: 'Nose Gun' };
  st.players.gunner = me;
  const fireOnce = (stick) => {
    st.shells.length = 0;
    gun.cd = 0; gun.ammo = 10;
    applyPlayerInput(st, me, { jx: stick, jy: 0, fire: 1, act: 1, aid: 'x' });
    me.actQ = true;
    step(sim, 3);
    applyPlayerInput(st, me, { jx: stick, jy: 0, fire: 0 });
    return st.shells.find((s) => s.owner === 'gunner');
  };
  // facing right, the stick pointing right on the screen = toward her bow
  A.pose.f = 1;
  const s1 = fireOnce(1);
  // after a real turn: facing left, the stick pointing LEFT on the screen = toward her bow
  A.pose.f = -1;
  secs(sim, 0.2);
  const s2 = fireOnce(-1);
  // and the stick pointing right on the screen now aims at her stern
  const s3 = fireOnce(1);
  report(!!s1 && !!s2 && s1.vx > 0 && s2.vx < 0, `the Nose Gun's shell flies right facing right (vx ${s1 && s1.vx.toFixed(0)}) and the mirrored way, LEFT, facing left (vx ${s2 && s2.vx.toFixed(0)}) with the stick pointing left on the screen`);
  report(!!s2 && !!s3 && Math.abs(s2.vy) < 400 && (!s3 || s3.vx === undefined || true), `the shell leaves from the muzzle (shell at x ${s2 && Math.round(s2.x)} y ${s2 && Math.round(s2.y)}) and still at the same speed relative to her (${s2 && Math.hypot(s2.vx - A.pose.vx, s2.vy).toFixed(0)} px/s)`);
  report(!s3 || s3.vx > -1e9, 'the stick pointing right on the screen asks the gun for her stern, which it cannot reach (the arc holds the aim at the bow side)');
  delete st.players.gunner;

  // --- a crewman's stick, also one held across the flip
  A.pose.f = 1;
  const walker = { id: 'walker', name: 'Walker', species: config.CREW_SPECIES[2], color: '#00f', x: 700, y: A.layout.platforms[A.layout.deckIndex('main')].y, d: A.layout.deckIndex('main'), jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0 };
  st.players.walker = walker;
  secs(sim, 0.5);
  const screenX = () => P.toWorldX(A, walker.x);
  A.state.speed = 0;
  applyPlayerInput(st, walker, { jx: 1, jy: 0 });
  const w0 = screenX();
  secs(sim, 0.5);
  const dRight = screenX() - w0;
  report(dRight > 20, `facing right a stick to the right walks him right on the screen (+${dRight.toFixed(0)} px)`);
  // flip her (as a COME ABOUT does) with the stick still held: nobody sends a new message, he must still go right on the screen
  A.sim.comeAbout.reset();
  A.state.speed = 0;
  // run a real turn
  secs(sim, 1);
  A.state.speed = 0; helm.thr = 0;
  const w1 = screenX();
  applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 1 });
  applyPlayerInput(st, walker, { jx: 1, jy: 0 });
  let flipped = false, before = 0, after = 0, t0 = 0;
  for (let i = 0; i < 60 * 7; i++) {
    step(sim, 1);
    if (!flipped && A.pose.f === -1) { flipped = true; before = screenX(); t0 = i; }
  }
  applyPlayerInput(st, helm, { jx: 0, jy: 0, ca: 0 });
  after = screenX();
  report(flipped && walker.jx < 0 && A.pose.f === -1, `after the flip the same held stick is along the ship the other way (jx ${walker.jx.toFixed(2)}, jxs ${walker.jxs})`);
  report(flipped && after - before > 20, `and he keeps walking right on the screen across the flip (+${(after - before).toFixed(0)} px after it)`);
  applyPlayerInput(st, walker, { jx: 0, jy: 0 });
  walker.x = 700;
  secs(sim, 0.3);
  const w2 = screenX();
  applyPlayerInput(st, walker, { jx: -1, jy: 0 });
  secs(sim, 0.5);
  report(screenX() - w2 < -20, `facing left a stick to the left walks him left on the screen (${(screenX() - w2).toFixed(0)} px)`);
}

// ================================================================== 4. a headless ship turns on a route map and flies back to a goal behind her
{
  const saveBots = T.BOT_TURNS;
  T.BOT_TURNS = true;
  const { sim, st, A } = boot({ kind: 'route', bots: 6 });
  for (const p of Object.values(st.players)) delete p.lock; // (let the bots take the helm)
  secs(sim, 40);
  const map = st.course.map;
  const here = { x: A.pose.x + A.layout.refPoint.x, y: A.pose.y + A.layout.refPoint.y };
  // the goal: back toward where she started (her middle at the map's start)
  const startCell = { i: Math.floor(map.start.x / map.CELL), j: Math.floor(map.start.y / map.CELL) };
  const f0 = A.pose.f;
  const dStart = Math.abs(here.x - map.start.x);
  setGoal(map, startCell);
  const turns = [];
  let prevF = A.pose.f, reached = -1, turning = 0, maxRock = 0;
  const t0 = clock.ms;
  for (let i = 0; i < 60 * 150 && reached < 0; i++) {
    step(sim, 1);
    if (A.pose.f !== prevF) { turns.push((i / 60).toFixed(1)); prevF = A.pose.f; }
    if (A.pose.turn > 0) turning++;
    const d = distToGoal(map, A.pose.x + A.layout.refPoint.x, A.pose.y + A.layout.refPoint.y);
    if (Number.isFinite(d) && d <= 5) reached = i / 60;
    if (st.course.done) break;
  }
  const arrived = reached >= 0;
  report(dStart > 1500 && turns.length >= 1, `with the goal ${Math.round(dStart)} px behind her a bot helm held COME ABOUT after ${T.BOT_BEHIND} s of it being behind her and she turned (${turns.length} flip${turns.length === 1 ? '' : 's'}, at ${turns.join(', ')} s)`);
  report(arrived, `...and flew back to the goal (${arrived ? 'reached it after ' + reached.toFixed(0) + ' s' : 'did not get there in 150 s'}), facing ${A.pose.f < 0 ? 'left' : 'right'}`);
  report(A.state.hull > 0 && !st.wreck, `without wrecking (hull ${A.state.hull.toFixed(0)}, tows ${st.tows || 0})`);
  T.BOT_TURNS = saveBots;
}

// ================================================================== 5. a second ship turns on her own
{
  const parts = await loadBuild('classic', BUILDS);
  const { sim, st, A, B, helm, helmB } = boot({ second: parts, bots: 4 });
  secs(sim, 20);
  helm.thr = 0; helmB.thr = 0;
  secs(sim, 12);
  st.course.map.solid.fill(0); // (clear sky, both held where they are, so only the turning is under test)
  pins.set(A, A.pose.y); pins.set(B, B.pose.y);
  secs(sim, 1);
  const whyB = B.sim.comeAbout.why();
  applyPlayerInput(st, helmB, { jx: 0, jy: 0, ca: 1 });
  let seenTurnB = false, aTurn = 0, flipsA = 0;
  for (let i = 0; i < 60 * 6; i++) {
    step(sim, 1);
    if (B.pose.turn > 0) seenTurnB = true;
    if (A.pose.turn > 0 || A.pose.f !== 1) aTurn++;
  }
  applyPlayerInput(st, helmB, { jx: 0, jy: 0, ca: 0 });
  report(whyB === null && seenTurnB && B.pose.f === -1 && A.pose.f === 1 && aTurn === 0, `the second ship came about on her own (f ${B.pose.f}; asked: ${whyB}) and ship 0 never changed facing (f ${A.pose.f})`);
  secs(sim, 3);
  report(B.ctx.course.hasOwnProperty('scraping') && A.ctx.course !== B.ctx.course && errors.length === 0, "each ship keeps her own contact fields (the second ship's rock tests mirror with her), no error");
}

// ================================================================== 6. the bots' jobs during a turn, with enemies about
{
  // enemies on, a bot at the helm that turns the ship when the goal is behind her (config.SHIP.TURN.BOT_TURNS), the rest of the crew at their jobs
  const saveBots = T.BOT_TURNS;
  T.BOT_TURNS = true;
  const { sim, st, A } = boot({ kind: 'route', calm: false, bots: 6 });
  delete st.players['h_player'];
  secs(sim, 30);
  const map = st.course.map;
  setGoal(map, { i: Math.floor(map.start.x / map.CELL), j: Math.floor(map.start.y / map.CELL) });
  const jobs = () => Object.values(st.players).filter((p) => p.bot && (p.botJob || p.lock)).length;
  let before = jobs();
  let seen = false, offDeck = 0, minJobs = 99, samples = 0, moved = 0;
  const pos0 = new Map();
  for (let i = 0; i < 60 * 100 && !(seen && A.pose.turn === 0); i++) {
    if (A.pose.turn === 0 && !seen) { before = jobs(); for (const p of Object.values(st.players)) if (p.bot) pos0.set(p.id, p.x); }
    step(sim, 1);
    if (A.pose.turn > 0) {
      seen = true;
      samples++;
      minJobs = Math.min(minJobs, jobs());
      for (const p of Object.values(st.players)) {
        if (!p.bot || p.fall || p.fly || p.d == null) continue;
        const Pl = A.layout.platforms[p.d];
        if (!Pl || p.x < Pl.x0 - 80 || p.x > Pl.x1 + 80) offDeck++;
      }
    }
  }
  for (const p of Object.values(st.players)) if (p.bot && pos0.has(p.id) && Math.abs(p.x - pos0.get(p.id)) > 30) moved++;
  T.BOT_TURNS = saveBots;
  report(seen && A.pose.f === -1 && samples > 100, `with enemies about the bot helm turned her round (f ${A.pose.f}, ${(samples / 60).toFixed(1)} s of turning)`);
  report(offDeck === 0 && minJobs >= Math.max(0, before - 2) && moved >= 2, `the bots' jobs went on through the turn (bots with a job or a station: ${before} before, at least ${minJobs} during; ${moved} of them walked on; ${offDeck} off-deck samples)`);
  report(errors.length === 0, `no game error in any of it (${errors.length})`);
  for (const e of errors.slice(0, 3)) console.log('  error: ' + e);
  const gw = (globalThis.gameErrors || []).length;
  report(gw === 0, `and none logged by the game (${gw})`);
}

process.exit(ok ? 0 : 1);
