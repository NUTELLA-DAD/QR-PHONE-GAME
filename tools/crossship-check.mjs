// CROSS-SHIP PLAY gate (MOVEMENT.md B.6; cannon.js, cargo.js, towing.js; config.CROSS). Headless.
//   node tools/buildsim.mjs --check-crossship        or directly:   node tools/crossship-check.mjs [--seed 1] [--quick 1]
//
//   (a) THE CREW CANNON, built as a part (validator INFO, weight, two stations, palette slots on a roomy ship): a crewman in the barrel and a gunner at the post (stick aims, hold charges,
//       let go fires) is launched as an AIRBORNE world object with the cannon's world velocity plus the aimed launch speed (also from a ship facing LEFT), flies the arc the bots' solver
//       works out, and lands on the first deck of the ENEMY ship (the real gunship too): he is `transfer`red to her and is a boarder; the cooldown, the steam cost and the recoil;
//   (b) the solo shot (nobody at the post: the one in the barrel aims with the stick and fires himself, weaker), a miss falls overboard (wakes in the medical bay), the parachute (Action),
//       a friendly ship's deck catches him too (he walks off as her crew);
//   (c) THROWABLE BALLAST: a rack hands out sandbags (a finite stock), ATTACK on an open deck throws one in an arc, it lands on a RIVAL ship's deck as a live load: she tips toward it
//       measurably (balance.js) and a SHOVEL job shows up for her crew (phones + bots); shovelled off, she rights herself; a crate dropped from the bomb bay lands on the ship below;
//   (d) DUMPING your own ballast at the rail makes her climb; (e) TOWING: a line hooked to a disabled ship drags her, both ships twist, a sword cuts it, it snaps when too far;
//   (f) STOLEN COAL: a boarder lifts a sack of her coal (her fuel goes down, and her steam with it) and carries it home to his own boiler;
//   (g) bots use all of it in a Versus round (the cannon, the throws, the shovelling), a natural run, 0 errors.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0;
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS, buildLayout, cannonSeatName } = await load('modules/host/shipBuild.js');
const { validate } = await load('modules/host/buildCheck.js');
const S = await load('modules/host/buildSlots.js');
const P = await load('modules/host/pose.js');
const { transfer, shipOf } = await load('modules/host/ships.js');
const { solveShot, shotLands, cannonRange } = await load('modules/host/cannon.js');
const K = config.CROSS.CANNON;
const DT = 1 / 60;
const errors = [];
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// ---- the builds: the classic ship with the parts added by hand where the classic deck has room (a cannon at x = 1500 on a lengthened top deck, its post at 1415) ----
const LONGER = S.drawDeck(BUILDS.classic, 'catwalk', 1360, 1600).parts; // (the classic top deck has no stretch clear of vents, racks and ladders: lengthen it by two columns, and stand the cannon out on the new end)
const CANNON = { part: 'crewCannon', n: 'Crew Cannon', p: 'catwalk', x: 1500, aim: K.AIM, arc: K.ARC };
const withCannon = [...LONGER, CANNON];
const rack = (kind, p, x) => ({ part: 'rack', kind, p, x });
const withCargo = [...BUILDS.classic, rack('sandbag', 'catwalk', 400), rack('crate', 'catwalk', 760), rack('towline', 'catwalk', 1210), rack('sword', 'catwalk', 1100)];

// ---- helpers ----
const disabled = new Set();
const pins = new Map(); // ships held at one height (nothing holds a hovering ship up in a test sky with the gas left alone)
function boot({ parts = null, others = [], calm = true, clear = true, bots = 0 } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9; }
  clock = seedRandom(seed);
  pins.clear();
  const sim = createSimulation();
  const st = sim.state;
  if (parts) sim.fitShip(parts, 'yard');
  const ships = [st.ships[0]];
  for (const o of others) ships.push(sim.addShip(o.parts || BUILDS.classic, { id: o.id, team: o.team, formation: { dx: -250, dalt: -1150 } }));
  const e = ships[0].layout.boarderEntryPoints;
  for (let i = 0; i < Math.max(bots, ...others.map((o) => o.bots || 0)); i++) { // (bots: aboard ours; others[k].bots: aboard that ship, who are her own side)
    for (const [k, sh] of ships.entries()) {
      if (i >= (k === 0 ? bots : others[k - 1].bots || 0)) continue;
      const id = sh.id + '_bot' + i;
      st.players[id] = { id, bot: true, ship: sh.id, ...(sh.team ? { team: sh.team.id } : {}), name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    }
  }
  sim.castOff();
  if (clear) st.course.map.solid.fill(0); // (nothing but the other ships to hit)
  return { sim, st, ships };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    for (const sh of sim.state.ships) if (!disabled.has(sh)) sh.state.press = Math.min(Math.max(sh.state.press, 45), 72); // (steam stays where the cannon can use it)
    for (const [sh, at] of pins) { sh.pose.x = at.x; sh.pose.y = at.y; sh.pose.vy = 0; sh.state.speed = 0; }
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    sim.state.ev.warn = Math.min(sim.state.ev.warn, 0.01);
    if (each && each(i) === 'stop') break;
  }
}
const seconds = (n) => Math.round(n * 60);
function stand(sh, x, y, f = 1, pin = true) {
  sh.pose.x = x; sh.pose.y = y; sh.pose.f = f; sh.pose.vy = 0; sh.state.speed = 0; sh.state.order = 0;
  if (pin) pins.set(sh, { x, y });
}
// A person (not a bot) on a ship at a place: the script holds his buttons.
function person(st, id, ship, d, x, extra = {}) {
  const p = { id, name: id, species: config.CREW_SPECIES[0], color: '#fff', x, y: ship.layout.platforms[d].y, d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: null, ...extra };
  st.players[id] = p;
  transfer(st, p, ship, d, x);
  if (extra.lock) p.lock = extra.lock; // (transfer() lets go of whatever he was doing)
  return p;
}
const deckOf = (sh, id) => sh.layout.platforms.findIndex((q) => q.id === id);
const mid = (sh) => P.toWorldX(sh, sh.layout.refPoint.x);

console.log('crossship-check: range of a full-power 45 degree shot ' + Math.round(cannonRange()) + ' px');

// ---------------------------------------------------------------- (a) the crew cannon as a part
{
  const L = buildLayout(withCannon), v = validate(withCannon), base = buildLayout(BUILDS.classic);
  const seat = L.stations.find((s) => s.kind === 'cannonSeat'), post = L.stations.find((s) => s.kind === 'cannon');
  report(v.ok && (L.cannons || []).length === 1 && !!seat && !!post && seat.n === cannonSeatName(post.n) && post.x === 1500 - K.GUNNER_DX && seat.x === 1500 && L.cannons[0].d === deckOf({ layout: L }, 'catwalk') && !base.cannons,
    `(a) the crew cannon is a part: two stations (the post ${post && post.x}, the seat ${seat && seat.x}) and the cannon itself on the top deck; the classic layout has none (validator OK)`);
  report(JSON.stringify(v.layout.cannons) === JSON.stringify(L.cannons) && Math.abs(v.budgets.lift.mass - validate(LONGER).budgets.lift.mass - config.BALANCE.MASS.kind.cannon) < 0.01, `(a) it weighs ${config.BALANCE.MASS.kind.cannon} gas points more than the same ship without it`);
  const info = JSON.stringify(v.checks || v);
  report(/Crew cannon/.test(info) && /across the sky/.test(info), '(a) the validator has an INFO line about it (range, steam, weight)');
  const covered = withCannon.map((p) => (p.part === 'deck' && p.id === 'catwalk' ? { ...p, outside: false } : p));
  report(validate(covered).warns.some((w) => /Crew cannon|covered deck/.test(w) && /cannon/i.test(w)), '(a) a cannon on a covered deck is a WARN (the barrel needs the open air)');
  const longer = S.drawDeck(BUILDS.classic, 'catwalk', 1360, 1600).parts; // (the classic top deck has no stretch clear of ladders and racks: lengthen it by two columns)
  const roomy = S.slotsFor('crewCannon', longer);
  report(roomy.length > 0 && S.slotsFor('crewCannon', BUILDS.classic).length === 0, `(a) the palette finds ${roomy.length} slots for it on a ship with room (none on the crowded classic top deck)`);
  const placed = roomy.length ? roomy[0].apply(longer) : longer, LL = buildLayout(placed);
  report(LL.stations.some((s) => s.kind === 'cannon') && LL.stations.some((s) => s.kind === 'cannonSeat') && validate(placed).ok, '(a) ...it places both stations and the result validates');
}

// ---------------------------------------------------------------- (a) a shot across the sky
// Ours with the cannon (x = 1500 on the lengthened top deck), an enemy-team ship 1700 px ahead of her and a little below; a rider locked in the seat, a gunner at the post.
function cannonScene({ f = 1, twoCrew = true, parts = withCannon, foe = { id: 'foe', team: 'enemy' }, dx = 1850, dy = 140 } = {}) {
  const g = boot({ parts, others: foe ? [foe] : [] });
  const [A, B] = g.ships;
  stand(A, 3000, 3000, f);
  if (B) stand(B, 3000 + f * dx, 3000 + dy, f);
  const c = A.layout.cannons[0], d = deckOf(A, 'catwalk');
  const rider = person(g.st, 'rider', A, d, c.x, { lock: cannonSeatName(c.n) });
  const gunner = twoCrew ? person(g.st, 'gunner', A, d, c.x - K.GUNNER_DX * Math.sign(Math.cos(c.aim)), { lock: c.n }) : null;
  return { ...g, A, B, c, d, rider, gunner };
}
// Hold the post's stick at the plan's aim and the fire button down until the charge reaches the plan's, then let go: returns the frame it fired on (-1 never).
function aimAndFire(sc, plan, secs = 8, who = 'gunner') {
  const p = sc[who], r = () => sc.A.ctx.cannons && sc.A.ctx.cannons[sc.c.n];
  let fired = -1;
  step(sc.sim, seconds(secs), (i) => {
    p.jx = Math.cos(plan.aim); p.jy = Math.sin(plan.aim);
    const rec = r();
    const aligned = rec && Math.abs(Math.atan2(Math.sin(plan.aim - rec.aim), Math.cos(plan.aim - rec.aim))) < 0.02;
    const ready = aligned && rec.charge >= plan.charge;
    p.fire = !ready && !sc.rider.fly;
    if (sc.rider.fly || sc.rider.lock == null) { fired = i; return 'stop'; }
  });
  p.fire = false;
  return fired;
}
for (const f of quick ? [1] : [1, -1]) {
  const sc = cannonScene({ f });
  const { sim, st, A, B, c, rider, gunner } = sc;
  const plan = solveShot(A, c, B);
  report(!!plan && plan.power > K.MIN_POWER && plan.power <= 1, `(a${f < 0 ? ', ship facing LEFT' : ''}) the solver finds a barrel angle and power that put a crewman on the enemy's deck (aim ${plan && plan.aim.toFixed(2)}, power ${plan && plan.power.toFixed(2)}, flight ${plan && plan.t.toFixed(2)} s)`);
  if (!plan) continue;
  const press0 = A.state.press, kicks0 = A.ctx.forces.kicks;
  const fired = aimAndFire(sc, plan, 8);
  report(fired >= 0 && rider.fly === true && rider.cannon === true && !rider.lock, `(a) hold to charge, let go: the crewman leaves the barrel as an airborne world object (frame ${fired})`);
  // launch velocity: the cannon's world velocity + speed along the aimed direction
  const rec = A.ctx.cannons[c.n];
  const ang = P.aimToWorld(A, rec.aim + (A.state.pitch || 0));
  const speed = K.SPEED * (K.MIN_POWER + (1 - K.MIN_POWER) * plan.charge);
  const ex = Math.cos(ang) * speed + A.pose.vx, ey = Math.sin(ang) * speed + A.pose.vy;
  report(Math.hypot(rider.fvx - ex, rider.fvy - ey) < 0.06 * speed + 80, `(a) ...with the cannon's world velocity plus the launch speed along the aimed direction (${rider.fvx.toFixed(0)}, ${rider.fvy.toFixed(0)} against ${ex.toFixed(0)}, ${ey.toFixed(0)})`);
  report(A.state.press < press0 - K.STEAM * 0.5 && A.ctx.forces.kicks > kicks0 && rec.cd > K.COOLDOWN - 1, `(a) ...it cost steam pressure (${press0.toFixed(0)} to ${A.state.press.toFixed(0)}), kicked the ship (forces.js) and started the cooldown`);
  const air = [];
  step(sim, seconds(6), (i) => { if (rider.fly) air.push([rider.x, rider.y]); if (!rider.fly) return 'stop'; });
  report(!rider.fly && rider.ship === 'foe' && rider.d != null && air.length > 20, `(a) ...he flew ${air.length} frames and landed on the ENEMY ship: transferred to her (${rider.ship}, deck ${rider.d != null && B.layout.platforms[rider.d] ? B.layout.platforms[rider.d].id : '?'})`);
  report(B.sim.isHostile(rider) && rider.x >= B.layout.platforms[rider.d].x0 && rider.x <= B.layout.platforms[rider.d].x1 && !rider.cannon && !rider.trail, '(a) ...a boarder on her deck (hostile to her, on her platform, no longer a cannon flyer)');
  // reload: the cannon will not fire again for COOLDOWN seconds
  const r2 = person(st, 'rider2', A, sc.d, c.x, { lock: cannonSeatName(c.n) });
  gunner.fire = true; step(sim, 20); gunner.fire = false; step(sim, 5);
  report(r2.lock === cannonSeatName(c.n) && !r2.fly, '(a) ...while the cannon reloads a second shot does not go (Reloading)');
}

// ---------------------------------------------------------------- (b) solo, a miss, the parachute, a friendly deck, the real gunship
{
  // SOLO: nobody at the post; the one in the barrel aims with the stick and fires himself with Action - a weaker shot (SOLO_POWER) that needs the target nearer
  let sc = null, plan = null;
  for (let dx = 1100; dx <= 2000 && !plan; dx += 50) {
    sc = cannonScene({ twoCrew: false, dx, dy: 140 });
    plan = solveShot(sc.A, sc.c, sc.B, { solo: true });
  }
  const { sim, A, B, c, rider } = sc;
  report(!!plan, `(b) the solo shot has a solution when the enemy is near enough (aim ${plan && plan.aim.toFixed(2)})`);
  if (plan) {
    let fired = -1;
    step(sim, seconds(6), (i) => {
      rider.jx = Math.cos(plan.aim); rider.jy = Math.sin(plan.aim);
      const rec = A.ctx.cannons[c.n];
      if (rec && Math.abs(Math.atan2(Math.sin(plan.aim - rec.aim), Math.cos(plan.aim - rec.aim))) < 0.02) rider.actQ = true;
      if (rider.fly) { fired = i; return 'stop'; }
    });
    const speed = Math.hypot(rider.fvx - A.pose.vx, rider.fvy - A.pose.vy);
    report(fired >= 0 && Math.abs(speed - K.SOLO_POWER * K.SPEED) < 0.05 * K.SPEED + 40, `(b) alone in the barrel, Action fires him himself at the weak solo power (${speed.toFixed(0)} px/s against ${K.SOLO_POWER * K.SPEED})`);
    step(sim, seconds(6), () => (rider.fly ? null : 'stop'));
    report(!rider.fly && rider.ship === 'foe', '(b) ...and he lands on the enemy ship all the same');
  }
}
{
  // A MISS: fired into empty sky he falls past everything, goes overboard and wakes in the medical bay (as ever); the PARACHUTE (Action) slows his fall
  const base = (chute) => {
    const sc = cannonScene({ twoCrew: false, foe: null });
    const { sim, A, c, rider } = sc;
    let fired = false, t = 0, opened = false, maxFall = 0;
    step(sim, seconds(14), (i) => {
      rider.jx = Math.cos(K.AIM); rider.jy = Math.sin(K.AIM);
      if (!fired) { if (rider.fly) fired = true; else rider.actQ = true; }
      else {
        t++;
        if (chute && rider.fly && !rider.chute && t > 20) rider.actQ = true;
        if (rider.chuteOpen) opened = true;
        if (rider.fly) maxFall = Math.max(maxFall, rider.fvy);
      }
      if (fired && !rider.fly && !rider.fall && t > 10) return 'stop';
    });
    return { t, opened, maxFall, rider, A };
  };
  const plain = base(false), withChute = base(true);
  report(!plain.rider.fly && !plain.rider.fall && plain.rider.ship === 'player' && plain.rider.d === plain.A.layout.reviveSpot().d, `(b) a miss: he fell overboard and woke in the medical bay of his own ship (deck ${plain.rider.d})`);
  report(withChute.opened && withChute.maxFall < plain.maxFall && withChute.t > plain.t, `(b) the parachute (Action in the air) opens and slows him: fastest fall ${withChute.maxFall.toFixed(0)} against ${plain.maxFall.toFixed(0)} px/s, ${withChute.t} frames in the air against ${plain.t}`);
}
{
  // A FRIENDLY ship (no team, in a co-op fleet): a crewman fired from the cannon lands on her deck and walks off as her crew; a plain jumper's hook does not use it
  const sc = cannonScene({ foe: { id: 'ally' }, twoCrew: true });
  const { sim, A, B, c, rider } = sc;
  const plan = solveShot(A, c, B);
  report(!!plan, `(b) the solver also works on a friendly ship (aim ${plan && plan.aim.toFixed(2)})`);
  if (plan) {
    aimAndFire(sc, plan, 8);
    step(sim, seconds(6), () => (rider.fly ? null : 'stop'));
    report(!rider.fly && rider.ship === 'ally' && !B.sim.isHostile(rider) && rider.d != null, `(b) he lands on the friendly ship and is her crew (${rider.ship}, not a boarder)`);
  }
}
{
  // THE REAL GUNSHIP: the enemy gunship as a Ship (B.5); a crewman fired at her lands on her decks and is a boarder aboard her (her director is told)
  config.GUNSHIP.AS_SHIP = true;
  const sc = cannonScene({ foe: null });
  const { sim, st, A, c, rider } = sc;
  step(sim, 5); // (the first step clears the new mission's sky)
  let spawned = false;
  for (let k = 0; k < 20 && !spawned; k++) { spawned = sim.gunship.spawn({ seed: 3, hull: 'frigate', mission: 2, special: null, personality: 'aggressive' }); if (!spawned) step(sim, 60); }
  const g = st.gunship, h = g && g.ship;
  if (h) {
    h.state.speed = 0;
    let plan = null;
    for (let dx = 1100; dx <= 2000 && !plan; dx += 100) { // (her hull is not the classic ship's: find a station she can be hit from)
      for (const dy of [0, 100, 200, 300, -100]) {
        stand(A, 3000, 3000); stand(h, 3000 + dx - h.layout.platforms[0].x0, 3000 + dy);
        plan = solveShot(A, c, h);
        if (plan) break;
      }
    }
    step(sim, 2);
    report(!!plan, `(b) a solution to the real gunship's deck (aim ${plan && plan.aim.toFixed(2)}, power ${plan && plan.power.toFixed(2)})`);
    if (plan) {
      aimAndFire(sc, plan, 8);
      step(sim, seconds(6), () => (rider.fly ? null : 'stop'));
      report(!rider.fly && rider.ship === 'gunship' && h.sim.isHostile(rider), `(b) ...he landed on the GUNSHIP: transferred to her, a boarder (${rider.ship})`);
    }
  } else report(false, '(b) the gunship did not spawn');
}

// ---------------------------------------------------------------- (c) throwable ballast
const { solveThrow } = await load('modules/host/cargo.js');
const press = (sim, p, n = 3) => { p.actQ = true; step(sim, n); p.actQ = false; };
{
  const g = boot({ parts: withCargo, others: [{ id: 'rival', team: 'enemy' }] });
  const { sim, st } = g;
  const [A, B] = g.ships;
  stand(A, 3000, 3000); stand(B, 4200, 4150); // (the rival hangs below and ahead of us: her top deck is a long throw down from ours)
  const thrower = person(st, 'thrower', A, deckOf(A, 'catwalk'), 400);
  const mate = person(st, 'mate', B, deckOf(B, 'catwalk'), 650, { team: 'enemy' }); // (her own crew: the rival is the enemy side)
  step(sim, 30);
  const rack0 = A.layout.racks.find((r) => r.kind === 'sandbag');
  // the rack's stock is finite: four sandbags, then it is empty
  let taken = 0, refused = false;
  const bal0 = { dx: B.ctx.balance.dx, live: B.ctx.balance.live, pitch: B.pose.pitch };
  const throwOne = () => {
    thrower.x = rack0.x; thrower.d = rack0.d; step(sim, 3);
    press(sim, thrower, 2);
    if (thrower.carry !== 'sandbag') return false;
    taken++;
    thrower.x = A.layout.platforms[deckOf(A, 'catwalk')].x1 - 30; // (carried to the fore end of the top deck: the load must clear the thrower's own ship)
    step(sim, 2);
    const o ={ x: P.toWorldX(A, thrower.x), y: P.toWorldY(A, thrower.y - 70) };
    const sol = solveThrow(A, o, B, 1);
    if (!sol) return null;
    thrower.jx = sol.jx; thrower.jy = sol.jy;
    thrower.atkQ = true;
    step(sim, 3);
    thrower.jx = thrower.jy = 0;
    step(sim, seconds(3.2), () => (st.thrown.length ? null : 'stop'));
    step(sim, 40);
    return true;
  };
  let results = [];
  for (let k = 0; k < 5; k++) { const r = throwOne(); results.push(r); if (r === false) { refused = true; break; } if (r === null) break; }
  report(taken === 4 && refused && results.every((r) => r !== null), `(c) a sandbag rack hands out a finite stock (${taken} taken, then it says empty)`);
  const loads = B.ctx.loads || [];
  report(loads.length >= 3 && loads.every((l) => l.kind === 'sandbag' && l.d >= 0 && l.x >= B.layout.platforms[l.d].x0 && l.x <= B.layout.platforms[l.d].x1), `(c) ATTACK threw them in an arc: ${loads.length} sandbags landed on the RIVAL's decks as live loads (at ship-space x ${loads.map((l) => Math.round(l.x)).join(', ')}) - none left in the air (${st.thrown.length})`);
  step(sim, seconds(4));
  const bal1 = B.ctx.balance;
  const added = loads.reduce((n, l) => n + l.w, 0);
  report(Math.abs(bal1.live - bal0.live - added) < 1.5 && Math.abs(bal1.dx - bal0.dx) > 4 && Math.abs(B.pose.pitch - bal0.pitch) > 0.0004, `(c) she TIPS: ${added} gas points of dead weight moved her centre of mass ${(bal1.dx - bal0.dx).toFixed(1)} px and her trim ${(((B.pose.pitch - bal0.pitch) * 180) / Math.PI).toFixed(2)} degrees (the thrower's own ship is unchanged: ${A.ctx.loads ? A.ctx.loads.length : 0} loads)`);
  report((A.ctx.loads || []).length === 0, '(c) ...and the thrower\'s own ship carries none of it');
  // a SHOVEL job appears for the crew of the ship it landed on
  step(sim, seconds(3));
  report(mate.job && mate.job.kind === 'shovel', `(c) a "shovel it overboard" job shows up for her crew's phone (${mate.job ? mate.job.label : 'none'})`);
  // ...and clearing it: hold Action beside a load
  const target = (B.ctx.loads || [])[0];
  if (target) {
    mate.d = target.d; mate.x = target.x;
    mate.fire = true;
    const n0 = B.ctx.loads.length;
    step(sim, seconds(2.6));
    mate.fire = false;
    report(B.ctx.loads.length === n0 - 1 && !B.ctx.loads.includes(target) && st.thrown.some((t) => t.ghost), '(c) holding Action beside a load shovels it over the rail (it falls away) - one fewer load');
  }
  // her bots do it too
  const e = B.layout.boarderEntryPoints;
  for (let i = 0; i < 3; i++) { const id = 'bb' + i; st.players[id] = { id, bot: true, ship: B.id, name: 'BB' + i, team: 'enemy', species: config.CREW_SPECIES[i], color: '#fff', x: e[0].x + 40 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true }; }
  const before = B.ctx.loads.length;
  step(sim, seconds(45), () => (B.ctx.loads.length === 0 ? 'stop' : null));
  report(before > 0 && B.ctx.loads.length === 0 && B.ctx.balance.live < added, `(c) with bots aboard her, the rest of the loads are shovelled off (${before} to ${B.ctx.loads.length}); the dead weight is gone from her trim (${B.ctx.balance.live.toFixed(1)})`);
}
{
  // a CRATE dropped from the bomb bay falls through the belly onto the ship below
  const g = boot({ parts: withCargo, others: [{ id: 'below', team: 'enemy' }] });
  const { sim, st } = g;
  const [A, B] = g.ships;
  stand(A, 3000, 3000); stand(B, 3000 + 40, 3000 + 1250);
  const bay = A.layout.bombBay, bd = deckOf(A, 'bay');
  const p = person(st, 'dropper', A, bd, bay.jumpX, { carry: 'crate' });
  step(sim, 30);
  p.x = bay.jumpX;
  step(sim, 2);
  report(p.act && p.act.type === 'dropcargo', `(c) over the bomb bay hatch with a crate in hand the Action button says "${p.act ? p.act.label : '-'}"`);
  p.actQ = true; step(sim, 3);
  const fell = st.thrown.length;
  step(sim, seconds(4), () => ((B.ctx.loads || []).length ? 'stop' : null));
  report(fell === 1 && p.carry === null && (B.ctx.loads || []).length === 1 && B.ctx.loads[0].kind === 'crate', '(c) ...the crate fell away from the belly and landed on the ship BELOW as a live load');
}

// ---------------------------------------------------------------- (d) dumping your own ballast makes her climb
{
  const run = (dump) => {
    const g = boot({ parts: withCargo, others: [] });
    const { sim, st } = g;
    const A = g.ships[0];
    A.pose.y = 3000; A.pose.vy = 0;
    const d = deckOf(A, 'catwalk');
    const p = person(st, 'dumper', A, d, A.layout.platforms[d].x1 - 40, { carry: 'sandbag' });
    step(sim, seconds(3));
    const y0 = A.pose.y, gas0 = A.state.gas;
    let pre = '';
    if (dump) { p.x = A.layout.platforms[d].x1 - 40; step(sim, 2); pre = p.act ? p.act.label : ''; press(sim, p, 3); }
    else step(sim, 5);
    const label = p.act ? p.act.label : '';
    let peak = 0;
    step(sim, seconds(6), () => { peak = Math.max(peak, y0 - A.pose.y); });
    return { climb: y0 - A.pose.y, peak, carry: p.carry, label, pre, gas: A.state.gas - gas0 };
  };
  const control = run(false), dumped = run(true);
  report(dumped.carry === null && /Dump/.test(dumped.pre), `(d) at the rail, Action reads "${dumped.pre}" and dumps the sandbag overboard`);
  report(dumped.peak > control.peak + 12, `(d) ...and she CLIMBS for it: peak rise ${dumped.peak.toFixed(0)} px against ${control.peak.toFixed(0)} px without the dump`);
}

// ---------------------------------------------------------------- (e) towing

{
  const run = (tow) => {
    disabled.clear();
    const g = boot({ parts: withCargo, others: [{ id: 'prize', team: 'enemy' }] });
    const { sim, st } = g;
    const [A, B] = g.ships;
    stand(A, 3000, 3000, 1, false); stand(B, 3000 - 1950, 3000, 1, false);
    B.state.fuel = 0; B.state.press = 0; disabled.add(B); // (a disabled ship: cold boiler, nobody aboard)
    const helm = A.layout.one('helm');
    const hm = person(st, 'helm', A, helm.d, helm.x, { lock: helm.n, thr: 0, gas: 0 });
    const d = deckOf(A, 'catwalk'), pl = A.layout.platforms[d];
    const p = person(st, 'tower', A, d, pl.x0 + 60, { carry: tow ? 'towline' : null });
    step(sim, 20);
    const x0 = [A.pose.x, B.pose.x]; // (hung still: the line goes out first)
    let made = null, twistA = 0, twistB = 0, tension = 0;
    if (tow) { p.jx = -1; p.jy = 0.1; p.atkQ = true; step(sim, 3); p.atkQ = false; p.jx = 0; made = sim.towing.tows[0] || null; }
    step(sim, 30); hm.thr = 0.3; // (the towing ship gets under way, gently, once the line is out)
    step(sim, seconds(14), () => {
      twistA = Math.max(twistA, Math.abs(A.ctx.forces.theta)); twistB = Math.max(twistB, Math.abs(B.ctx.forces.theta));
      if (sim.towing.tows[0]) tension = Math.max(tension, sim.towing.tows[0].tension || 0);
    });
    return { g, sim, st, A, B, p, made, dA: A.pose.x - x0[0], dB: B.pose.x - x0[1], twistA, twistB, tension, still: sim.towing.tows.length };
  };
  const free = run(false), towed = run(true);
  report(!!towed.made && towed.made.a === towed.A && towed.made.b === towed.B && towed.p.carry === null, '(e) ATTACK with a towline in hand throws the grapple at the ship behind (it takes a moment to fly, then she is made fast)');
  report(towed.dB > free.dB + 150, `(e) the line DRAGS the disabled ship: she moved ${towed.dB.toFixed(0)} px along the sky against ${free.dB.toFixed(0)} px drifting alone`);
  report(towed.dA < free.dA - 20, `(e) ...and the tug holds the towing ship back (${towed.dA.toFixed(0)} px against ${free.dA.toFixed(0)} px free)`);
  report(towed.twistA > free.twistA + 0.0008 && towed.twistB > free.twistB + 0.0008 && towed.tension > 0, `(e) both ships TWIST about their centres of mass at the places the line is made fast (peak tilt ${((towed.twistA * 180) / Math.PI).toFixed(2)} and ${((towed.twistB * 180) / Math.PI).toFixed(2)} degrees against ${((free.twistA * 180) / Math.PI).toFixed(2)} / ${((free.twistB * 180) / Math.PI).toFixed(2)} free)`);
  // cut it with a sword where it is made fast
  const { sim, A, B, p } = towed;
  const tow = sim.towing.tows[0];
  report(!!tow, '(e) the line is still made fast after 14 s');
  if (tow) {
    p.carry = 'sword'; p.x = tow.from.x; p.d = deckOf(A, 'catwalk');
    step(sim, 3);
    p.atkQ = true; step(sim, 3);
    report(sim.towing.tows.length === 0, '(e) a sword (ATTACK at the end of the line) cuts it: the ships are free');
    const v0 = B.pose.vx;
    step(sim, seconds(6));
    report(Math.abs(B.pose.vx) <= Math.abs(v0) + 1, `(e) ...and she slows again once the line is gone (${v0.toFixed(0)} to ${B.pose.vx.toFixed(0)} px/s)`);
  }
  // it snaps when the ships are too far apart
  const snap = run(true);
  snap.B.pose.x -= config.CROSS.TOW.SNAP + 200;
  step(snap.sim, 3);
  report(snap.sim.towing.tows.length === 0, '(e) too far apart and the line snaps');
}

// ...a captured gunship in tow is a PRIZE
{
  config.GUNSHIP.AS_SHIP = true;
  const run = (tow) => {
    disabled.clear();
    const g = boot({ parts: withCargo, others: [] });
    const { sim, st } = g;
    const A = g.ships[0];
    stand(A, 3000, 3000, 1, false);
    step(sim, 5);
    let spawned = false;
    for (let k = 0; k < 20 && !spawned; k++) { spawned = sim.gunship.spawn({ seed: 3, hull: 'frigate', mission: 2, special: null, personality: 'aggressive' }); if (!spawned) step(sim, 60); }
    const gs = st.gunship, h = gs && gs.ship;
    if (!h) return null;
    const d = deckOf(A, 'catwalk'), pl = A.layout.platforms[d];
    stand(h, 3000 + pl.x1 + 700 - h.layout.platforms[0].x0, 3000 - 100, 1, false);
    h.state.press = 0;
    const p = person(st, 'tower', A, d, pl.x1 - 120, { carry: tow ? 'towline' : null });
    step(sim, 2);
    if (tow) { p.jx = 1; p.jy = 0.2; p.atkQ = true; step(sim, 3); p.atkQ = false; }
    step(sim, seconds(1.5));
    const salvage0 = st.run.salvage;
    sim.gunship.captured(p); // (her helm is taken)
    step(sim, seconds(2));
    return { sim, st, A, h, gs, p, salvage0, tow };
  };
  const ctl = run(false), pr = run(true);
  if (ctl && pr) {
    report(ctl.gs.phase === 'sinking' || !ctl.st.gunship, '(e) control: a captured gunship with no line on her is scuttled at once (she strikes her colours and sinks)');
    report(pr.st.gunship === pr.gs && pr.gs.prize === true && pr.st.ships.includes(pr.h) && pr.sim.towing.tows.length === 1 && Object.keys(pr.h.crewReg).length === 0 && pr.gs.phase !== 'sinking', '(e) with our towline on her she is a PRIZE instead: still in the sky, her crew gone from her, the line made fast');
    pr.sim.startDock();
    const paid = pr.st.run.salvage - pr.salvage0;
    report(paid >= config.CROSS.TOW.PRIZE && pr.sim.towing.tows.length === 0, `(e) reaching the sky-dock with her in tow pays the PRIZE bonus (${paid} salvage), then she is released`);
    pr.st.vote = null; // (the dock's vote would hold the sky: the crew vote and cast off)
    step(pr.sim, seconds(8));
    report(!pr.st.gunship, '(e) ...and she goes down quietly afterwards');
  } else report(false, '(e) the gunship did not spawn for the prize check');
}

// ---------------------------------------------------------------- (f) stolen coal
{
  const run = (steal) => {
    const g = boot({ parts: BUILDS.classic, others: [{ id: 'foe', team: 'enemy' }] });
    const { sim, st } = g;
    const [A, B] = g.ships;
    stand(A, 3000, 3000); stand(B, 3000 + 1850, 3000 + 140);
    B.state.fuel = 20; disabled.add(B); // (her firebox: low, and nobody stokes it)
    const coalSt = B.layout.one('coal'), boiler = A.layout.one('boiler');
    const thief = person(st, 'thief', B, coalSt.d, coalSt.x);
    A.state.fuel = 30;
    step(sim, 20);
    const f0 = B.state.fuel, live0 = B.ctx.balance.live;
    let label = '';
    if (steal) { thief.x = coalSt.x; step(sim, 2); label = thief.act ? thief.act.label : ''; press(sim, thief, 3); }
    const f1 = B.state.fuel;
    step(sim, seconds(20));
    return { sim, st, A, B, thief, boiler, f0, f1, fuel: B.state.fuel, press: B.state.press, live: B.ctx.balance.live, live0, label, coalSt };
  };
  disabled.clear();
  const ctl = run(false), r = run(true);
  report(/Steal/.test(r.label) && r.thief.carry === 'coal' && r.f0 - r.f1 > config.CROSS.CARGO.STEAL_FUEL - 1, `(f) a boarder at the enemy's coal bunker: Action says "${r.label}"; he carries a sack away and her firebox is ${(r.f0 - r.f1).toFixed(1)} fuel lighter`);
  report(r.fuel < ctl.fuel - 3 && r.press < ctl.press - 0.5, `(f) ...her fuel is ${r.fuel.toFixed(1)} against ${ctl.fuel.toFixed(1)} and her STEAM ${r.press.toFixed(1)} against ${ctl.press.toFixed(1)} 20 s later (the control, nobody steals)`);
  // carry it home: the boarder drops from her deck onto ours with the sack, and his own boiler eats it
  const { sim, st, A, B, thief, boiler } = r;
  const landing = B.sim.air;
  const catwalk = deckOf(A, 'catwalk'), x = 700;
  thief.d = deckOf(B, 'main'); thief.x = 900; thief.y = B.layout.platforms[thief.d].y;
  thief.y = P.toShipY(B, P.toWorldY(A, A.layout.platforms[catwalk].y - 500));
  thief.x = P.toShipX(B, P.toWorldX(A, x));
  landing.startFlight(thief, 0, 0);
  step(sim, seconds(4), () => (thief.fly ? null : 'stop'));
  report(!thief.fly && thief.ship === 'player' && thief.carry === 'coal', `(f) he dropped back onto his own ship carrying the SACK (cross-ship item transfer: ${thief.ship}, carrying ${thief.carry})`);
  thief.d = boiler.d; thief.x = boiler.x; thief.y = A.layout.platforms[boiler.d].y; thief.lock = null;
  const fuelA = A.state.fuel;
  step(sim, 3);
  press(sim, thief, 3);
  step(sim, 5);
  report(A.state.fuel > fuelA + 5 - 6 && thief.carry === null, `(f) ...and his own boiler eats it: fuel ${fuelA.toFixed(0)} to ${A.state.fuel.toFixed(0)}`);
}

// ---------------------------------------------------------------- (g) bots use all of it
{
  // the cannon: a bot crew with the cannon aboard, an enemy ship in reach, hands to spare: they man the barrel and the post, aim with the solver and fire; the crewman boards her
  disabled.clear();
  const g = boot({ parts: withCannon, others: [{ id: 'foe', team: 'enemy', bots: 2 }], bots: 6 });
  const { sim, st } = g;
  const [A, B] = g.ships;
  stand(A, 3000, 3000); stand(B, 3000 + 1850, 3000 + 140);
  const c = A.layout.cannons[0];
  let shotAt = -1, landedAt = -1, boarder = null;
  step(sim, seconds(quick ? 100 : 160), (i) => {
    A.state.hull = 100;
    const r = A.ctx.cannons && A.ctx.cannons[c.n];
    if (r && r.shots > 0 && shotAt < 0) shotAt = i;
    if (!boarder) boarder = Object.values(st.players).find((q) => q.bot && q.ship === 'foe' && q.id.startsWith('player_bot')) || null;
    if (boarder && landedAt < 0) { landedAt = i; return 'stop'; }
  });
  const r = A.ctx.cannons && A.ctx.cannons[c.n];
  report(shotAt >= 0 && r && r.shots >= 1, `(g) bots man the cannon (a gunner at the post, one in the barrel) and fire it: ${r ? r.shots : 0} shot(s), the first after ${(shotAt / 60).toFixed(0)} s`);
  report(!!boarder && boarder.ship === 'foe', `(g) ...a bot crewman landed on the enemy ship and boards her (${boarder ? boarder.name + ' is aboard ' + boarder.ship : 'nobody'})`);
}
{
  // thrown ballast: bots with a sandbag rack and a rival close below throw sandbags onto her; her bots shovel them off
  disabled.clear();
  const g = boot({ parts: withCargo, others: [{ id: 'rival', team: 'enemy', bots: 3 }], bots: 6 });
  const { sim, st } = g;
  const [A, B] = g.ships;
  stand(A, 3000, 3000); stand(B, 4200, 4150);
  let peak = 0, thrown = 0, shoveled = 0;
  step(sim, seconds(quick ? 110 : 180), () => {
    A.state.hull = 100;
    peak = Math.max(peak, (B.ctx.loads || []).length);
    thrown = Object.values(st.players).reduce((n, q) => n + ((q.stats && q.stats.thrown) || 0), 0);
    shoveled = Object.values(st.players).reduce((n, q) => n + ((q.stats && q.stats.shovels) || 0), 0);
    if (peak > 0 && shoveled > 0) return 'stop';
  });
  report(thrown >= 1 && peak >= 1, `(g) bots fetch sandbags from the rack and throw them at the rival close below: ${thrown} thrown, up to ${peak} loads lying on her at once`);
  report(shoveled >= 1, `(g) ...and her bots shovel them off (${shoveled} shovelled)`);
}

// @@SECTIONS@@

for (const e of errors) console.log('ERROR ' + e);
report(errors.length === 0, errors.length ? errors.length + ' errors' : '0 errors');
console.log(ok ? 'crossship-check: ALL PASS' : 'crossship-check: FAILURES');
process.exit(ok ? 0 : 1);
