// Test bot "brain". Bots press the same virtual buttons a phone does
// (jx/jy joystick, actQ = tap Action, fire = hold Action), so they test the real game rules.
import { config } from '../../config.js';
import { layoutTables, walkCost } from '../../shipLayout.js';
import { bestTarget, targets } from './aim.js';
import { altWindow, altBounds, pilotPlan, gasFor } from './course.js';
import { shipGeom, landX, boilerX, routeStep } from './gunship.js';
import { X0 as GUNSHIP_X0 } from './gunshipBlueprint.js';
import { isEscortStation, escortFor } from './escort.js';
import { lightNames, isSearchlight, darkTarget } from './searchlight.js';
import { botJobs as goingDownJobs } from './goingDown.js';
import { autopilotOn } from './crewscale.js';
import { flamAt } from './fireModel.js';
import { mainShip, hostileTo, foeOf, areHostile } from './ships.js';
import { cannonPlan } from './cannon.js';
import { solveThrow } from './cargo.js';
import { cannonSeatName } from './shipBuild.js';
import { toWorldX, toWorldY, toShipX, toShipY, aimToShip } from './pose.js';
import { captainFly, captainOf, callout, bombFalls, dropPossible } from './pvp/captainAI.js';

const B = config.BOTS;
// Tables worked out per ship layout (rebuilt when a new ship build is applied to it): `tables(L).MAIN` ... Every function below gets its layout as
// `const L = mainShip(state).layout` (B1; B2 passes each bot's own ship).
const tables = layoutTables((L) => {
  const GUN_STATIONS = Object.keys(L.gunMounts);
  return {
    MAIN: L.deckIndex('main'),
    CATWALK: L.deckIndex('catwalk'),
    LOWER: L.deckIndex('lower'),
    GUN_STATIONS,
    // (every station a bot may man, by kind, most useful kinds first)
    MANNED_STATIONS: [...L.all('helm'), ...L.all('escort'), ...L.all('deflector'), ...L.all('coil'), ...GUN_STATIONS, ...L.all('bombBay'), ...L.all('lookout'), ...L.all('swivel'), ...L.all('cannon'), ...L.all('cannonSeat'), ...lightNames(L)].map((s) => (typeof s === 'string' ? s : s.n)),
    PICKUPS: [...L.racks, ...L.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))],
  };
});

// How useful manning a searchlight is: in the dark (or with several enemies about) a lamp is worth a hand; otherwise it is the last resort.
function lightReach(state, n) {
  const L = mainShip(state).layout;
  const threats = (state.litTargets ? state.litTargets.length : 0) + (state.dimTargets ? state.dimTargets.length : 0);
  if (state.phase !== 'flying') return 5;
  const nest = L.isNestStation(n) ? 0.3 : 0; // (a nest lamp sees more of the sky: slightly preferred)
  if (darkTarget(state) > 0.3) return (threats ? 2.2 : 3.4) - nest; // (after the guns that have a target, ahead of an idle gun or the lookout when there is something to light)
  return (threats >= 2 ? 3.2 : 5) - nest;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const stationNamed = (L, name) => L.stations.find((s) => s.n === name);
const isHelm = (L, name) => L.kindOf(name) === 'helm';
const bayName = (L) => (L.one('bombBay') || {}).n; // (the bomb bay's station name: obj of the 'Bomb Bay' ammo/station jobs)
// Parts everything hangs on: the helm, the boilers, the lift, and the steam pipes that feed the helm and the lift (config.BOTS.CRITICAL lists module kinds).
const critical = (mods, m) => B.CRITICAL.includes(m.kind) || (m.kind === 'pipe' && ((t) => !!t && B.CRITICAL.includes(t.kind))(mods.find((q) => q.name === m.to)));
// Which boiler a bot shovels coal into: the nearest to `from`, nudged toward the one that has had fewer loads (B.BOILER_SPREAD px per load).
const boilerFor = (state, from) => {
  const L = mainShip(state).layout;
  const list = L.all('boiler');
  if (list.length < 2) return list[0];
  const loads = state.boilerLoads || {};
  const broken = (s) => (state.modules || []).some((m) => m.name === s.n && m.broken);
  const cost = (s) => walkCost(s, from) + (loads[s.n] || 0) * B.BOILER_SPREAD + (broken(s) ? 1e6 : 0);
  return list.reduce((best, s) => (cost(s) < cost(best) ? s : best));
};

let world = null; // the game state (set each bot update), so steer() knows about the gunship

// Walk/climb toward platform d at position x. Returns true when there.
// To get to (or back from) a gunship alongside, swing across the gap on the line.
function steer(p, d, x, near = 12) {
  const g = world && world.gunship;
  const L = world && mainShip(world).layout;
  const { steerTo } = mainShip(world).nav; // (a bot walks on ITS ship)
  if (g && d === tables(L).MAIN && p.d === tables(L).MAIN && !p.swing) {
    const MAIN = tables(L).MAIN, MAIN_X1 = shipGeom(L).MAIN_X1;
    const mid = (MAIN_X1 + GUNSHIP_X0) / 2; // targets past this are on her deck (her home frame)
    if (x > mid && p.onGunship) {
      // Aboard her and the job is on her deck too: walk there, using the ladders between her decks.
      const rs = routeStep(g, p, x, near);
      p.jx = rs.jx;
      p.jy = rs.jy;
      return rs.arrived;
    }
    if (x > mid !== !!p.onGunship) {
      // Wrong side: walk to the swing spot, and swing only while the rope is hooked and in range.
      const edge = p.onGunship ? landX(g) : MAIN_X1 - 15;
      const step = p.onGunship ? routeStep(g, p, edge, 12) : steerTo(p, MAIN, edge, 12);
      p.jx = step.jx;
      p.jy = step.jy;
      if (step.arrived && g.rope) press(p); // (does nothing while she is out of swing range)
      return false;
    }
  }
  const step = steerTo(p, d, x, near);
  p.jx = step.jx;
  p.jy = step.jy;
  return step.arrived;
}

const enemyActive = (state) => state.enemy.dead <= 0;

// Where a gun must point to hit something useful right now, or null.
function firingSolution(state, gun) {
  const best = bestTarget(state, gun);
  return best ? best.angle : null;
}

// Helm: altitude that dodges the next mine skimming the top or bottom of the ship (or null).
// Best direction for the Lightning Coil: the angle (within its arc) that lines up the most targets.
function coilShot(state) {
  const ship = mainShip(state);
  const L = ship.layout;
  const M = L.coil;
  const ex = toWorldX(ship, M.x); // (targets are in the world)
  const ey = toWorldY(ship, M.y - 60);
  const angles = [];
  for (const t of targets(state)) {
    const p = t.at(0);
    if (Math.hypot(p.x - ex, p.y - ey) > config.COIL.RANGE) continue;
    const a = aimToShip(ship, Math.atan2(p.y - ey, p.x - ex)); // (the angle as the ship sees it: coil.aim and the arc are in ship space)
    if (Math.abs(Math.atan2(Math.sin(a - M.aim), Math.cos(a - M.aim))) <= M.arc) angles.push(a);
  }
  let best = { angle: M.aim, count: 0 };
  for (const a of angles) {
    const count = angles.filter((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.09).length;
    if (count > best.count) best = { angle: a, count };
  }
  return best;
}

// Swivel engines (S.5h): the way a bot at the crank wants its engine to point. Forward in cruise; UP when she is sinking (the gasbag low, falling, the last stand); DOWN on a bombing
// run or when the helm wants to be well below where she is. Returns an angle (radians); the mount's arc limits how far it really turns. null = no such engine.
function swivelWant(state, name) {
  const L = mainShip(state).layout;
  const st = stationNamed(L, name), e = st && state.engines && state.engines.find((q) => q.name === st.eng);
  if (!e) return null;
  const E = config.ENGINES, ship = state.ship;
  if (state.phase !== 'flying' || ship.down) return e.home;
  if (state.buoyancy < 0 || ship.gas < E.BOT_CLIMB_GAS || state.goingDown) return -Math.PI / 2;
  const bombing = state.bombBay && state.bombBay.bombs > 0 && groundTargets(state).length > 0;
  if (bombing || pilotPlan(state, 2.5, B.HELM_SPEED).target < ship.alt - E.BOT_DIVE_DY) return Math.PI / 2;
  return e.home;
}
// How far an engine is from the way a bot would point it (radians; 0 when it is right).
const swivelOff = (state, name) => {
  const L = mainShip(state).layout;
  const want = swivelWant(state, name), st = stationNamed(L, name), e = st && state.engines.find((q) => q.name === st.eng);
  if (want == null || !e) return 0;
  const lim = e.home + Math.max(-config.ENGINES.SWIVEL_ARC, Math.min(config.ENGINES.SWIVEL_ARC, angleDiff(want, e.home)));
  return Math.abs(angleDiff(lim, e.dir));
};

// The nearest bullet, bat, rocket or bomb coming at the ship (for the Deflector), or null.
function incoming(state) {
  const ship = mainShip(state);
  const S = ship.layout.shield;
  let best = null;
  let bestD = 1600;
  const consider = (x, y) => {
    const d = Math.hypot((toShipX(ship, x) - S.cx) * 0.7, toShipY(ship, y) - S.cy);
    if (d < bestD) (bestD = d), (best = { x, y });
  };
  for (const b of state.bullets) if (!b.miss) consider(b.x, b.y);
  for (const b of state.bats || []) if (b.delay <= 0 && !b.dead && !b.latched) consider(b.x, b.y);
  for (const k of state.rockets || []) if (k.hp > 0) consider(k.x, k.y);
  for (const b of state.enemyBombs || []) if (!b.dead) consider(b.x, b.y);
  return best;
}

// Versus: the captain is on a high pass over the rival and wants the bombs dropped (pvp/captainAI.js sets ship.captain.bombRun).
const bombRunOn = (state) => !!state.rival && !!mainShip(state).captain && mainShip(state).captain.bombRun;

// The gun that covers the paratroopers' approach: the most forward gun up on the crow's nest.
const paraGun = (L) => {
  const nest = L.all('gun').filter((s) => L.isNestDeck(s.p));
  return nest.length ? nest.reduce((a, b) => (b.x > a.x ? b : a)).n : null;
};

// How useful manning a gun is right now: one that can hit a ground target (outposts) ranks
// highest, then any gun with something in reach.
function gunReach(state, n) {
  const L = mainShip(state).layout;
  const best = bestTarget(state, state.GUNS[n]);
  // Paratroopers are about to jump (or are in the air): get up to the dorsal gun, it covers their approach.
  if (!best && n === paraGun(L) && state.gunship && (state.paras.length || state.gunship.paraDue)) return 0.7;
  if (!best) return 2;
  if (best.target.kind === 'para' || best.target.kind === 'gport') return 0.6; // paratroopers and gunship gun ports are worth manning a gun for
  if (best.target.kind.startsWith('rival')) return 0.6; // Versus: the other airship in range is what the guns are for (aim.js targets(): her guns, her bags, her boiler and helm, her hull)
  return best.target.kind === 'turret' ? 0.8 : 1;
}

// Things below and ahead worth bombing, as x ranges in SHIP coordinates (where the bomb bay is): live turrets and buildings.
function groundTargets(state) {
  const c = state.course;
  if (!c) return [];
  const ship = mainShip(state);
  const out = [];
  for (const t of c.turrets) if (!t.dead && t.x != null && toShipX(ship, t.x) > -600 && toShipX(ship, t.x) < 3200) out.push([toShipX(ship, t.x) - 30, toShipX(ship, t.x) + 30]);
  for (const f of c.features) for (const b of f.blocks || []) if (toShipX(ship, b.x1) > -600 && toShipX(ship, b.x0) < 3200) out.push([toShipX(ship, b.x0), toShipX(ship, b.x1)]);
  return out;
}

// A sniper about to fire with its line across the ship: climb or dive out of it.
function beamDodge(state) {
  const ship = mainShip(state);
  const L = ship.layout;
  for (const z of (state.specials && state.specials.snipers) || []) {
    if (!(z.mode === 'lock' || (z.mode === 'charge' && z.t < 1.2))) continue;
    const cy = toWorldY(ship, L.shield.cy);
    const lineY = z.y + Math.tan(z.aim) * (toWorldX(ship, L.shield.cx) - z.x);
    if (Math.abs(Math.cos(z.aim)) < 0.2 || Math.abs(lineY - cy) > 520) continue;
    return state.ship.alt + (lineY > cy ? 380 : -380);
  }
  return null;
}

// Sunken Sea: the altitude that puts the bomb-bay rope just above the next survivor ahead (null = none worth a dip).
function rescueAltitude(state) {
  const ship = mainShip(state);
  const L = ship.layout;
  const s = state.sea;
  const c = state.course;
  if (!s || !c || !c.map || !L.bombBay || s.y == null || state.env.id !== 'sea' || state.ship.hull < 40 || s.flood > 0.5) return null; // (no bomb bay, no rope to rescue anyone with)
  const R = config.ENVIRONMENTS.sea.RESCUE;
  const bx = toWorldX(ship, L.bombBay.x);
  for (const sv of s.survivors) {
    if (sv.saved || sv.lost) continue;
    const dx = sv.mx - bx;
    if (dx < -R.CATCH || dx > R.SPOT) continue;
    const ropeAbove = L.bombBay.y - L.refPoint.y; // the doors hang this far below the ship's reference point (425 on the classic ship)
    return L.refPoint.y - (sv.y - R.ROPE * 0.45 - ropeAbove); // alt = ref y - refY, and refY = (rope height) - ropeAbove
  }
  return null;
}

function dodgeAltitude(state) {
  const ship = mainShip(state);
  const L = ship.layout;
  const R = config.MINES.RADIUS;
  let soonest = null;
  for (const m of state.mines || []) {
    const mx = toShipX(ship, m.x); // (how far along her, and how fast it closes on her)
    const closing = m.vx - ship.pose.vx;
    if (mx < L.bounds.x0 || closing >= 0) continue;
    const t = (mx - L.bounds.x1) / -closing;
    if (t > 6) continue;
    const rel = toShipY(ship, m.y);
    let target = null;
    if (rel > -10 - R && rel < 330) target = -10 - R - 30 - m.y; // dive under it
    else if (rel > 700 && rel < L.bounds.y1 + R) target = L.bounds.y1 + R + 30 - m.y; // climb over it
    const bounds = altBounds(state);
    if (target !== null && target >= bounds.lo && target <= bounds.hi && (!soonest || t < soonest.t)) soonest = { t, target };
  }
  return soonest && soonest.target;
}

// Versus (B.4): a bot of the OTHER team standing on this ship is a boarder. He does not mend her: he fights her crew, sabotages her boiler (hold) and takes her helm (hold) - never both
// at once: the nearer defender first, then whichever of the two the rules of the round want (Capture: the helm).
const hostile = (p, state) => hostileTo(p, mainShip(state)); // (ships.js: different teams in Versus, the enemy gunship's side against ours)
function boarderJobs(state, bot) {
  const ship = mainShip(state);
  const L = ship.layout;
  const V = config.PVP;
  const jobs = [];
  const foes = Object.values(state.players).filter((q) => foeOf(q, bot) && !q.fall && !(q.ko > 0) && q.d != null && q.conn == null);
  const helm = L.one('helm'), boiler = L.one('boiler');
  // the enemy gunship (B.5): the charge is set - everybody back across the rope before it blows
  if (ship.ai && ship.ai.g.charge) jobs.push({ kind: 'swingback', obj: 'swingback', max: 8 });
  // a defender at the helm stops the capture, and one beside us stops everything: they come first
  for (const q of foes) if ((helm && q.d === helm.d && Math.abs(q.x - helm.x) < V.DEFEND_REACH * 1.5) || (q.d === bot.d && Math.abs(q.x - bot.x) < 260)) jobs.push({ kind: 'fight', obj: q, max: 2 });
  if (bot.stealNow && bot.carry !== 'coal' && L.hasKind('coal')) jobs.unshift({ kind: 'steal', obj: 'steal', max: 1 }); // (B.6: sabotaged her boiler - now her coal)
  const holds = V.MODE === 'capture' && !ship.ai ? [helm && 'capture', boiler && 'sabotage'] : [boiler && 'sabotage', helm && 'capture']; // (the gunship: the charge first, as it always was)
  for (const k of holds) if (k && !(k === 'sabotage' && ship.ai && ship.ai.g.charge)) jobs.push({ kind: k, obj: k, max: 1 });
  for (const q of foes) jobs.push({ kind: 'fight', obj: q, max: 2 });
  return jobs;
}

// ---------- Cross-ship play (B.6, config.CROSS.BOTS): the crew cannon, thrown ballast, shovelling ----------
const XB = config.CROSS.BOTS;
// Are the cannon's two stations worth a bot's time right now? Rarely: when a hostile ship is in reach of a shot the solver can make, the cannon is loaded, there are hands to spare and a roll comes up.
// The wish lasts 25 s (r.goUntil) so both stations get filled. 0.6 = a station worth taking, 4 = not now.
function cannonReach(state, n) {
  const ship = mainShip(state), L = ship.layout;
  const c = (L.cannons || []).find((q) => q.n === n || cannonSeatName(q.n) === n);
  if (!c || state.phase !== 'flying' || state.ship.down || state.goingDown) return 4;
  const r = ship.sim.cannon.rec(c), now = performance.now();
  if (r.cd > 0 || state.ship.press < config.CROSS.CANNON.MIN_PRESS) return 4;
  if (r.goUntil > now) return 0.6;
  if (now - (r.tryAt || 0) < 1000) return 4;
  r.tryAt = now;
  if (Object.values(state.players).filter((q) => q.bot && !q.mate && !(q.ko > 0)).length < XB.CANNON_MIN_CREW || state.ship.hull < config.BOTS.DARING.MIN_HULL) return 4;
  if (!(cannonPlan(ship, c, r) || cannonPlan(ship, c, r, { solo: true })) || Math.random() >= XB.CANNON_CHANCE / 60) return 4;
  r.goUntil = now + 25000;
  return 0.6;
}
// A bot at one of the cannon's stations: the one at the post aims the solved angle and holds until the charge is right, then lets go; the one in the barrel waits for a gunner, and fires himself after a while.
function cannonOperate(p, state, dt) {
  const ship = mainShip(state), cn = ship.sim.cannon, c = cn.cannonOf(p.lock);
  if (!c) return;
  const r = cn.rec(c), seat = p.lock === cannonSeatName(c.n);
  if (seat && cn.gunnerOf(c)) { r.seatT = 0; p.gunIdle = 0; return; } // (hold on: the gunner fires)
  if (seat) r.seatT = (r.seatT || 0) + dt;
  const plan = cannonPlan(ship, c, r, { solo: seat });
  if (!plan) { p.gunIdle = (p.gunIdle || 0) + dt; return; }
  p.gunIdle = 0;
  p.jx = Math.cos(plan.aim);
  p.jy = Math.sin(plan.aim);
  const off = Math.abs(angleDiff(plan.aim, r.aim));
  if (seat) { if (r.seatT > XB.CANNON_WAIT && off < 0.05 && r.cd <= 0) p.actQ = true; return; }
  if (!cn.riderOf(c)) { p.gunIdle += dt; return; }
  p.fire = r.cd <= 0 && !(off < 0.05 && r.charge >= plan.charge);
}
// Shovel jobs for the loads lying on the ship; and now and then a throw at a hostile ship that is close (from the nearest sandbag or crate rack, off the end of an open deck).
function crossJobs(state, bot, early) {
  const ship = mainShip(state), L = ship.layout, out = [];
  if (early) { for (const ld of state.loads || []) out.push({ kind: 'shovel', obj: ld, max: 1 }); return out; }
  const kind = tables(L).PICKUPS.some((r) => r.kind === 'sandbag') ? 'sandbag' : tables(L).PICKUPS.some((r) => r.kind === 'crate') ? 'crate' : null;
  if (!kind || state.phase !== 'flying' || state.ship.down || state.goingDown || bot.mate || bot.team === 'enemy' || ship.ai) return out;
  const now = performance.now();
  const foe = ship.world.ships.filter((o) => o !== ship && areHostile(ship, o) && !(o.state.down > 0)).map((o) => ({ o, d: Math.hypot(o.pose.x - ship.pose.x, o.pose.y - ship.pose.y) })).sort((a, b) => a.d - b.d)[0];
  if (!foe || foe.d > XB.THROW_RANGE * 2.2) { bot.throwUntil = 0; return out; }
  if (!(bot.throwUntil > now) && (bot.carry === 'sandbag' || bot.carry === 'crate' || Math.random() < (XB.THROW_CHANCE * B.THINK_EVERY) / 60)) bot.throwUntil = now + 18000;
  if (bot.throwUntil > now) out.push({ kind: 'throw', obj: foe.o, max: 2, throwKind: kind });
  return out;
}
// Carry out a throw job: fetch a sandbag, walk to the end of the top deck that faces the target, and throw when the arc lands on her deck.
function throwWork(p, state, job) {
  const ship = mainShip(state), L = ship.layout, target = job.obj;
  if (target.state.down > 0 || !ship.world.ships.includes(target)) { p.botJob = null; return; }
  if (p.carry !== 'sandbag' && p.carry !== 'crate') { getTool(state, p, job.throwKind); return; }
  const deck = L.platforms[tables(L).CATWALK];
  const side = toWorldX(target, target.layout.refPoint.x) > toWorldX(ship, L.refPoint.x) ? 1 : -1; // (world side the target lies on)
  const sx = side * ship.pose.f > 0 ? deck.x1 - 30 : deck.x0 + 30;
  if (!steer(p, tables(L).CATWALK, sx, 14)) return;
  const o = { x: toWorldX(ship, p.x), y: toWorldY(ship, p.y - 70) };
  const sol = solveThrow(ship, o, target, side);
  p.jx = 0;
  p.jy = 0;
  if (!sol) { job.wait = (job.wait || 0) + 0.01; if (job.wait > 8) { p.carry = null; p.botJob = null; p.throwUntil = 0; } return; }
  p.jx = sol.jx * ship.pose.f; // (the stick is along the ship; the load flies along the world)
  p.jy = sol.jy;
  p.throwNow = true;
  p.atkQ = true;
}

// List every job on the ship, most urgent first.
function listJobs(state, bot) {
  const L = mainShip(state).layout;
  if (hostile(bot, state)) return boarderJobs(state, bot);
  if (state.goingDown) return goingDownJobs(state, bot); // GOING DOWN!: split across coal, ice and leaks (goingDown.js)
  const jobs = [];
  const players = Object.values(state.players);
  const mods = state.modules || [];
  // (no hammer rack, no extinguisher on the ship: nobody can be sent to patch or spray, S.5e; a bot that already carries the tool still can)
  const hasTool = (kind) => bot.carry === kind || tables(L).PICKUPS.some((r) => r.kind === kind);
  const canHammer = hasTool('hammer'), canSpray = hasTool('extinguisher');
  // Nobody at the wheel in flight is the worst emergency of all: someone takes the helm first.
  const helmSt = L.one('helm');
  if (state.phase === 'flying' && helmSt && !players.some((q) => isHelm(L, q.lock)) && !mods.some((m) => m.name === helmSt.n && m.broken)) jobs.push({ kind: 'station', obj: helmSt.n, max: 1 });
  jobs.push(...sailJobs(state, bot, true)); // (a gust is coming or she is in a cave: reef any sail that is up)
  // A fire in the coal (S.5f: a big fire, or one on ground as flammable as the coal) is the worst fire aboard: a blaze there feeds itself and spreads fast. Everyone near
  // runs to it at once, ahead of the other chores.
  const hotFires = !canSpray ? [] : state.fires.filter((f) => f.big || flamAt(L, f.d, f.x) >= config.FIRE.BLAZE.FLAME_AT);
  for (const f of hotFires) jobs.push({ kind: 'fire', obj: f, max: 2, cap: B.HOT_FIRE_CAP, urgent: true });
  // Versus: a boarder at the wheel or the boiler is the worst thing aboard (he is taking the ship): the defenders go for him before anything else, up to half the crew.
  if ((config.PVP.ENABLED || mainShip(state).ai) && bot.team) {
    const vsH = L.one('helm'), vsB = L.one('boiler');
    for (const q of players) {
      if (!foeOf(q, bot) || q.fall || q.ko > 0 || q.d == null || q.conn != null) continue;
      const atCore = (vsH && q.d === vsH.d && Math.abs(q.x - vsH.x) < config.PVP.HAND_REACH * 4) || (vsB && q.d === vsB.d && Math.abs(q.x - vsB.x) < config.PVP.HAND_REACH * 4);
      if (atCore) jobs.push({ kind: 'fight', obj: q, max: 3, urgent: true, cap: Math.max(2, Math.ceil(players.filter((r) => r.bot).length / 2)) });
    }
  }
  // Outpost raid: the bomb bay is how outposts die. Bombs run out while the ship hovers over a gun: someone fetches more, now.
  const c = state.course;
  const shipH = mainShip(state);
  const refX = toWorldX(shipH, L.refPoint.x); // (the middle of the ship, in the world: the outposts are in map coordinates)
  const refY = toWorldY(shipH, L.refPoint.y);
  const bombRun = !!(c && c.map && c.map.open && !c.done && c.target && Math.hypot(c.target.x - refX, c.target.y - refY) < config.MAPS.BOMB_RUN_RANGE);
  const bay = bayName(L);
  const bombStarved = bombRun && !!bay && L.hasKind('ammo') && state.bombBay && state.bombBay.bombs <= 0 && !mods.some((m) => m.name === bay && m.broken) && Math.hypot(c.target.x - refX, c.target.y - refY) < config.MAPS.BOMB_RUN_MAN * 2;
  // The boiler is dying (no coal, or the pressure has collapsed): nothing else works without steam - stoke it right away.
  const ship = state.ship;
  if (state.phase === 'flying' && L.hasKind('boiler') && L.hasKind('coal') && ((ship.fuel < B.COAL_EMERGENCY && ship.press < 60) || (ship.press < B.PRESS_EMERGENCY && ship.fuel < 45))) jobs.push({ kind: 'coal', obj: 'coal', max: 2, urgent: true });
  // The parts everything else hangs on (the helm and its steam pipe, the boiler, the lift): a broken one is fixed first,
  // otherwise the gasbag can never be pumped up again and the ship just sits there burning.
  for (const m of mods) if (canHammer && m.broken && critical(mods, m)) jobs.push({ kind: 'repair', obj: m, max: 1, cap: 3, urgent: true });
  // Storm Front: a bolt is charging - one crew member holds a lightning rod (grounds it, the coil may drink it).
  const sj = state.stormJob;
  if (sj && sj.charge && !players.some((q) => q !== bot && q.botJob && q.botJob.kind === 'rod' && !q.lock)) for (const r of sj.rods) jobs.push({ kind: 'rod', obj: r, max: 1 });
  // Raiders: fight them, but never with more than about half the crew (the rest keep the ship going).
  for (const b of state.boarders) if (!b.fall) jobs.push({ kind: 'fight', obj: b, max: 2, cap: Math.max(2, Math.ceil(players.filter((q) => q.bot).length / 2)) });
  for (const q of players) if (foeOf(q, bot) && !q.fall && !(q.ko > 0)) jobs.push({ kind: 'fight', obj: q, max: 2, cap: Math.max(2, Math.ceil(players.filter((r) => r.bot).length / 2)) }); // (Versus: boarders from the other ship; the gunship's crew against ours)
  // Sunken Sea: pump out a flooded hull (an emergency), winch up a survivor on the rope (a salvage bonus).
  const sea = state.sea;
  if (sea && sea.pump && sea.flood > config.ENVIRONMENTS.sea.FLOOD.JOB_AT) jobs.push({ kind: 'pump', obj: sea.pump, max: 1 });
  if (sea && sea.winch) jobs.push({ kind: 'winch', obj: sea.winch, max: 1 });
  // A gasbag shot full of holes sinks the ship: patching it comes before swatting and repairs.
  // (Only when the gas is actually running out or the bag is in ruins, and never more than a few hands at once.)
  const gasHoles = state.gasHoles || [];
  const gasCrisis = (gasHoles.length >= B.GAS_EMERGENCY && (ship.gas < B.GAS_LOW || gasHoles.length >= B.GAS_RUIN)) || (gasHoles.length > 0 && (state.bags || []).some((b) => b.down)); // (a flat bag in a row of bags: patch its holes)
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall && !foeOf(q, bot)) jobs.push({ kind: 'revive', obj: q, max: 1 }); // (nobody revives the other side's boarder)
  if (bombStarved) jobs.push({ kind: 'ammo', obj: bay, max: 2, cap: 2 });
  // A real blaze (fires spread and eat the hull) comes before patching holes in the gasbag.
  if (canSpray && state.fires.length >= B.FIRE_BLAZE) for (const f of state.fires) if (!hotFires.includes(f)) jobs.push({ kind: 'fire', obj: f, max: 1, cap: B.FIRE_CAP });
  // Gas valves (S.5d): shut the valve of a ruptured bag (holes in it, or flat) so it stops draining the feed, before patching; open it again once the holes are patched.
  (L.gasValves || []).forEach((v, i) => {
    const holes = gasHoles.filter((h) => (h.bag | 0) === v.bag).length, bag = (state.bags || [])[v.bag];
    const open = state.gasValveOpen[i] !== false;
    if (open && bag && state.bags.length > 1 && (holes >= 2 || (bag.down && holes))) jobs.push({ kind: 'gasvalve', obj: v, max: 1 });
    else if (!open && holes === 0) jobs.push({ kind: 'gasvalve', obj: v, max: 1 });
  });
  if (gasCrisis && canHammer) for (const h of gasHoles) jobs.push({ kind: 'patch', obj: h, max: 1, cap: B.GAS_CAP });
  // Bats latched on the ship: swat them before they chew holes (bare hands are enough).
  if (!mainShip(state).ai) for (const b of state.bats || []) if (b.latched && b.landed && b.hp > 0) jobs.push({ kind: 'swat', obj: b, max: 1 }); // (the bats are on our ship, not on the gunship)
  // Vents: open one when the pressure is near the top; close them when it's calm again.
  const ventWanted = state.ship.press > config.BOILER.WARN_AT - 3;
  const ventCalm = state.ship.press < config.BOILER.WARN_AT - 14;
  const ventIdx = state.ventOpen.findIndex((open) => (ventWanted ? !open : ventCalm && open));
  if ((ventWanted || ventCalm) && ventIdx >= 0) jobs.push({ kind: 'vent', obj: L.vents[ventIdx], max: 1 });
  for (const bomb of state.bombs || []) jobs.push({ kind: 'defuse', obj: bomb, max: 1 });
  const fires = !canSpray ? [] : state.fires.filter((f) => !hotFires.includes(f)).map((f) => ({ kind: 'fire', obj: f, max: 1 }));
  const holes = !canHammer ? [] : (state.gasHoles || []).map((h) => ({ kind: "patch", obj: h, max: 1 }));
  const hullHoles = !canHammer ? [] : state.breaches.map((h) => ({ kind: "patch", obj: h, max: 1 })); // (each open hull hole costs hull every second: patch them before repairing guns)
  const icy = !canHammer ? [] : (state.icing || []).filter((q) => q.lvl >= B.ICE_AT).map((q) => ({ kind: 'ice', obj: q, max: 1 })); // frost: crusts to chip with the hammer
  // Fungal Depths: spores clogging an engine; The Aether: the oxygen tank running low (bare hands, hold Action at the spot).
  const deep = (state.clogs || []).filter((c) => c.lvl >= config.ENVIRONMENTS.fungal.CLOG.BOT_AT).map((c) => ({ kind: 'unclog', obj: c, max: 1 }));
  if (state.env && state.env.id === 'aether' && state.env.o2 < config.ENVIRONMENTS.aether.OXYGEN.BOT_AT) deep.push({ kind: 'oxygen', obj: state.o2tank, max: 1 });
  // Burst pipes with their valve open leak steam: shut the valve, then fix what's broken.
  const leaks = mods.filter((m) => m.kind === 'pipe' && m.broken && m.open).map((m) => ({ kind: 'valve', obj: m, max: 1 }));
  // Steam is short and a damaged module is leaking it? Shut that module's valve - unless it is
  // vital while flying (helm, engines). It is reopened once the module is repaired.
  const leaky = (m) => m.kind === 'pipe' && !m.broken && mods.some((t) => t.name === m.to && t.hp < t.max * config.MODULES.LEAK_BELOW);
  const flying = state.phase === 'flying';
  if (state.ship.press < B.ENGINEER_PRESS) {
    const vital = (m) => { const t = mods.find((q) => q.name === m.to); return !!t && (t.kind === 'helm' || t.kind === 'engine'); }; // (the helm and the engines stay on while flying)
    for (const m of mods) if (m.open && leaky(m) && !(flying && vital(m))) leaks.push({ kind: 'valve', obj: m, max: 1 });
  }
  const broken = !canHammer ? [] : mods.filter((m) => m.broken).map((m) => ({ kind: 'repair', obj: m, max: 1 }));
  // Use the tool already in hand first.
  if (bot.carry === "hammer") jobs.push(...hullHoles, ...leaks, ...broken, ...holes, ...icy, ...deep, ...fires);
  else jobs.push(...fires, ...hullHoles, ...leaks, ...broken, ...holes, ...icy, ...deep);
  for (const m of mods) if (m.kind === 'pipe' && !m.broken && !m.open && (!leaky(m) || state.ship.press >= B.ENGINEER_PRESS + 25)) jobs.push({ kind: 'valve', obj: m, max: 1 });
  // Stations, most useful first. The vital ones (helm, gas valve, a gun or weapon with a target
  // right now) come before chores like topping up coal or patching dents.
  const isBroken = (n) => mods.some((m) => m.name === n && m.broken);
  const botPlanes = players.filter((q) => q.bot && isEscortStation(q.lock, L)).length; // the crew can only spare so many for the patrol planes
  const reach = (n) => (isEscortStation(n, L) ? ((e) => (e && e.rebuild <= 0 && (e.docked || e.auto) && botPlanes < config.ESCORT.BOT_MAX && !state.escortCramped && targets(state).length ? 0.6 : 4))(escortFor(state, n)) : L.kindOf(n) === 'lookout' ? lookoutReach(state) : L.kindOf(n) === 'deflector' ? (incoming(state) ? 0.6 : 4) : L.kindOf(n) === 'coil' ? (coilShot(state).count >= 3 ? 0.7 : 4) : L.kindOf(n) === 'bombBay' ? ((groundTargets(state).length || bombRunOn(state)) && state.bombBay.bombs > 0 ? 0.5 : 4) : L.kindOf(n) === 'swivel' ? (swivelOff(state, n) > 0.3 ? 0.5 : 4) : L.kindOf(n) === 'cannon' || L.kindOf(n) === 'cannonSeat' ? cannonReach(state, n) : isSearchlight(n, L) ? lightReach(state, n) : !tables(L).GUN_STATIONS.includes(n) ? 0 : gunReach(state, n));
  const open = tables(L).MANNED_STATIONS.filter((n) => !isBroken(n) && !players.some((q) => q.lock === n)).sort((a, b) => reach(a) - reach(b));
  jobs.push(...crossJobs(state, bot, true)); // (B.6: loads thrown onto the deck: shovel them off)
  for (const n of open) if (reach(n) <= 0.8) jobs.push({ kind: 'station', obj: n, max: 1, tier: reach(n) });
  jobs.push(...linkJobs(state, bot, true)); // (LINKED STATIONS block at the end of this file: loaders for guns with a target)
  // A gunship alongside: hook on, run across, fight its crew, plant the charge - then run back.
  const gs = state.gunship;
  if (gs && gs.charge && bot.onGunship) jobs.unshift({ kind: 'flee', obj: 'flee', max: 8 });
  const engaged = gs && (gs.phase === 'hunt' || gs.phase === 'latch');
  // Her grapple is on our bow and raiders are piling over: someone hacks it through (the rest board her).
  if (engaged && gs.phase === 'latch' && gs.rope && !bot.onGunship && state.boarders.length >= 2) jobs.unshift({ kind: 'cutline', obj: 'cutline', max: 1 });
  if (engaged && !gs.charge && (gs.rope || bot.onGunship || (gs.gap || 9999) <= config.GUNSHIP.HOOK_RANGE)) {
    if (!gs.rope && !bot.onGunship) jobs.push({ kind: 'hook', obj: 'hook', max: 1 });
    else if (gs.rope || bot.onGunship) {
      for (const c of gs.crew) jobs.push({ kind: 'fight', obj: c, max: 1 });
      jobs.push({ kind: 'raid', obj: 'raid', max: 2 });
    }
    // Already aboard her? Finish the job there first: fight (if armed), then plant the charge.
    if (bot.onGunship) {
      jobs.unshift({ kind: 'raid', obj: 'raid', max: 8 });
      if (bot.carry === 'sword') for (const c of gs.crew) jobs.unshift({ kind: 'fight', obj: c, max: 2 });
    }
  }
  // Now and then the crew shovels extra coal to push into overdrive.
  const pushing = Math.floor(performance.now() / 1000 / B.OVERDRIVE_PUSH_EVERY) % 3 === 0;
  if (L.hasKind('boiler') && L.hasKind('coal') && (state.ship.fuel < (pushing ? 60 : 25) && state.ship.press < config.BOILER.WARN_AT - (pushing ? 10 : 25)) || bot.carry === 'coal') jobs.push({ kind: 'coal', obj: 'coal', max: state.ship.press < 30 ? 2 : 1 });
  if (canHammer) for (const m of mods) if (!m.broken && m.hp < (['engine', 'helm', 'lift', 'shield', 'coil'].includes(m.kind) ? m.max * config.MODULES.LEAK_BELOW - 1 : 60)) jobs.push({ kind: 'repair', obj: m, max: 1 });
  const guns = !L.hasKind('ammo') ? [] : tables(L).GUN_STATIONS.filter((n) => state.GUNS[n].ammo < state.GUNS[n].max && (bot.carry === 'ammo' || state.GUNS[n].ammo <= B.AMMO_LOW));
  guns.sort((a, b) => state.GUNS[a].ammo - state.GUNS[b].ammo);
  // Bombing run coming up (an outpost to destroy is near): bombs are the weapon that matters,
  // so loading the bay comes before topping up the guns.
  if (bombRun && bay && L.hasKind('ammo') && state.bombBay && state.bombBay.bombs < config.MAPS.BOMB_RUN_STOCK) jobs.push({ kind: 'ammo', obj: bay, max: 1 });
  for (const n of guns) jobs.push({ kind: 'ammo', obj: n, max: 1 });
  if (!bombRun && bay && L.hasKind('ammo') && state.bombBay && state.bombBay.bombs < 2 && (!guns.length || bot.carry === 'ammo')) jobs.push({ kind: 'ammo', obj: bay, max: 1 });
  jobs.push(...sailJobs(state, bot, false)); // (a sail to raise in a fair wind: after the chores, ahead of an idle gun post)
  jobs.push(...linkJobs(state, bot, false)); // (...and the quieter links: loaders for idle guns, the boiler surge)
  for (const n of open) if (reach(n) > 0.8) jobs.push({ kind: 'station', obj: n, max: 1, tier: reach(n) });
  // Hovering over an outpost with bombs aboard: one bot drops everything and mans the bomb bay.
  if (bay && bombRun && c.target && Math.hypot(c.target.x - toWorldX(mainShip(state), L.refPoint.x), c.target.y - toWorldY(mainShip(state), L.refPoint.y)) < config.MAPS.BOMB_RUN_MAN && state.bombBay.bombs > 0 && !isBroken(bay) && !players.some((q) => L.kindOf(q.lock) === 'bombBay')) jobs.unshift({ kind: 'station', obj: bay, max: 1 });
  jobs.push(...crossJobs(state, bot, false)); // (B.6: a throw at a rival that is close)
  return jobs;
}

// Sails (S.5e, low priority). Raise them in open sky when no gust is due; let them down before a gust and while she is in rock-walled caves (a sail only hauls her
// into the walls there). early = the reefing jobs, which come ahead of the stations; otherwise the raising jobs, which come after the chores.
function sailJobs(state, bot, early) {
  const L = mainShip(state).layout;
  const out = [];
  if (!(state.sails && state.sails.length) || state.phase !== 'flying' || state.ship.down || state.goingDown) return out;
  const c = state.course, cave = !!(c && c.map && !c.map.open);
  const wantUp = !state.sailWarn && !cave;
  state.sails.forEach((sl, i) => {
    const s = (L.sails || [])[i];
    if (!s || sl.torn || (state.modules || []).some((m) => m.name === s.n && m.broken)) return;
    if (early && !wantUp && sl.hoist > 0.1 && !sl.lowering) out.push({ kind: 'sail', obj: sl, up: false, max: 1 });
    else if (!early && wantUp && sl.hoist < 1 && !sl.lowering) out.push({ kind: 'sail', obj: sl, up: true, max: 1 });
  });
  return out;
}

function isEmergency(job) {
  return !!job.urgent || job.kind !== 'ammo' && job.kind !== 'link' && job.kind !== 'surge' && job.kind !== 'station' && job.kind !== 'coal' && job.kind !== 'winch' && !(job.kind === 'repair' && !job.obj.broken);
}

const HELP_KINDS = { fire: 1, patch: 1, revive: 1, swat: 1, fight: 1, defuse: 1, repair: 1, valve: 1, ice: 1, unclog: 1, oxygen: 1 };

function chooseJob(state, bot, bots) {
  const L = mainShip(state).layout;
  const { travelTime } = mainShip(state).nav;
  const claims = (job) => bots.filter((o) => o !== bot && o.botJob && o.botJob.kind === job.kind && o.botJob.obj === job.obj).length;
  // (a job with a cap: no more than that many crew on this KIND of job at once, e.g. patching gasbag holes)
  const onKind = (job) => bots.filter((o) => o !== bot && o.botJob && o.botJob.kind === job.kind && o.botJob.cap != null).length;
  // Chores (patching, fires, repairs, swatting...) can take only so many hands: the rest keep the guns manned and the
  // ship running. Without this a ship full of holes sends the WHOLE crew to patch and nobody shoots back (a death spiral).
  const CHORE = { fire: 1, patch: 1, repair: 1, swat: 1, valve: 1, ice: 1, unclog: 1, oxygen: 1 };
  const onChores = bots.filter((o) => o !== bot && !o.lock && !(o.ko > 0) && o.botJob && CHORE[o.botJob.kind] && !o.botJob.urgent).length;
  const choresFull = state.phase === 'flying' && onChores >= Math.max(3, Math.ceil(bots.length * B.CHORE_SHARE));
  const cur = bot.botJob;
  const isCur = (j) => !!cur && j.kind === cur.kind && j.obj === cur.obj;
  const jobs = roleJobs(state, bot, listJobs(state, bot)).filter((j) => claims(j) < j.max && (j.cap == null || onKind(j) < j.cap) && (isCur(j) || !(choresFull && CHORE[j.kind] && !j.urgent)));
  // Sent to help a crewmate who pressed HELP!: whatever needs doing near them, else just go and stand by.
  const hf = bot.helpFor;
  if (hf && hf.caller.d != null && !bot.onGunship) {
    const c = hf.caller;
    const near = jobs.filter((j) => HELP_KINDS[j.kind] && j.obj && j.obj.d != null && j.obj.conn == null && j.obj.d === c.d && Math.abs(j.obj.x - c.x) < config.HELP.NEAR).sort((a, b) => Math.abs(a.obj.x - c.x) - Math.abs(b.obj.x - c.x));
    return near[0] || { kind: 'help', obj: c, max: 3 };
  }
  // Among the most urgent kind, prefer the closest.
  if (!jobs.length) return null;
  const kind = jobs[0].kind;
  // Stick with the job in hand: without this the crew re-picks the "closest" job every 0.3 s, swaps targets
  // as they walk, and never actually finishes anything (a fire and a raider can keep eight bots busy for ever).
  const sticky = jobs.find(isCur);
  if (sticky && (sticky.kind === kind || sticky.urgent === undefined && performance.now() - (bot.jobSince || 0) < B.JOB_HOLD * 1000) && !(jobs[0].urgent && !sticky.urgent)) return sticky;
  // Walking time (slide poles, ladders and stairs included) to the job, as pixels of walking.
  const dist = (j) => {
    let o = j.obj;
    if (typeof o === 'string') o = j.kind === 'station' ? stationNamed(L, o) : null;
    if (!o) return 0;
    if (o.d == null) return Math.abs(o.x - bot.x) + Math.abs(o.y - bot.y) * 3;
    if (bot.d == null) return 0;
    return travelTime(bot, o.d, o.x) * config.MOVE.WALK_SPEED;
  };
  // (Stations come in order of usefulness: weigh that over walking distance.)
  // (how useful it is counts for more than how far it is - but stations of EQUAL use go to whoever is nearest.)
  const rank = (j) => (kind === 'station' ? (j.tier ?? 1) * B.STATION_TIER_PX : kind === 'fire' && j.urgent ? -B.HOT_FIRE_PX : 0); // (a fire in the coal counts as nearer than it is)
  return jobs.filter((j) => j.kind === kind).sort((a, b) => rank(a) + dist(a) - rank(b) - dist(b))[0];
}

// Work a manned station (bot is locked in).
function operate(p, state, dt) {
  const L = mainShip(state).layout;
  p.jx = 0;
  p.jy = 0;
  p.fire = false;
  p.prime = false;
  p.ca = false; // (COME ABOUT is held again below, by a helm bot that wants it)
  const ship = state.ship;
  if (isEscortStation(p.lock, L)) {
    // Fly the escort fighter at the nearest enemy (or let her circle the ship if there's none).
    const esc = escortFor(state, p.lock);
    const list = esc && esc.flying ? targets(state).map((t) => ({ t, q: t.at(0.4) })).sort((a, b) => Math.hypot(a.q.x - esc.x, a.q.y - esc.y) - Math.hypot(b.q.x - esc.x, b.q.y - esc.y)) : [];
    if (list.length) {
      const q = list[0].q;
      const d = Math.hypot(q.x - esc.x, q.y - esc.y) || 1;
      p.jx = ((q.x - esc.x) / d) * mainShip(state).pose.f; // (jx is along the ship; the plane flies along the world)
      p.jy = (q.y - esc.y) / d;
    } else p.jx = p.jy = 0;
    p.gunIdle = list.length ? 0 : (p.gunIdle || 0) + dt;
    return;
  }
  if (isHelm(L, p.lock)) {
    // Terrain first: keep inside the safe altitude window, stopping to climb cliffs.
    const plan = pilotPlan(state, 2.5, B.HELM_SPEED);
    const gunshipAi = mainShip(state).ai;
    const base = gunshipAi ? { target: plan.target, speed: plan.speed } : null;
    const cap = state.rival ? captainFly(state, p, plan, dt) : null; // (Versus: the lively captain weaves, dodges, passes and rams, pvp/captainAI.js; it changes the plan in place)
    if (gunshipAi && cap) { // (the enemy gunship: only the weave and the dodge, as strong as config.GUNSHIP_SHIP.WEAVE says; her ring spots and runs are her director's)
      const wv = config.GUNSHIP_SHIP.WEAVE;
      plan.target = base.target + (plan.target - base.target) * wv;
      plan.speed = base.speed + (plan.speed - base.speed) * wv;
    }
    p.jx = clamp((plan.speed - (ship.pace ?? ship.speed)) * 4, -1, 1); // (pace: her speed on the lever's scale, without the sails and overdrive, flight.js)
    // COME ABOUT (config.SHIP.TURN.BOT_TURNS): the way to the goal has been behind her for a while, so hold the turn command like a phone's button (plan.dx is how far the route point is ahead of her bow).
    const TN = config.SHIP.TURN;
    p.behindT = plan.dx < -TN.BOT_FAR && !(state.course.unstick > 0) ? (p.behindT || 0) + dt : 0;
    p.ca = (TN.BOT_TURNS || config.PVP.ENABLED) && p.behindT >= TN.BOT_BEHIND; // (Versus: the captain turns to face the rival)
    if (cap) p.ca = cap.ca; // (...sooner, and on her own terms: she knows when she has just passed the rival)
    if (mainShip(state).ai) p.ca = (cap ? cap.ca : false) || mainShip(state).ai.wantsTurn(); // (the gunship's captain turns her stern to us to bring her guns to bear, gunshipShip.js)
    const w = altWindow(state, 2.5);
    const bounds = altBounds(state);
    const lo = Math.max(w.min, bounds.lo);
    const hi = Math.min(w.max, bounds.hi);
    let target = null;
    const dodge = beamDodge(state) ?? dodgeAltitude(state);
    if (lo > hi || Math.abs(plan.target - ship.alt) > 120) target = plan.target;
    else if (dodge !== null && dodge > lo && dodge < hi) target = dodge;
    else if (ship.alt < lo + 15 || ship.alt > hi - 15 || cap) target = plan.target; // (the Versus captain always follows her plan: her jinks are small moves)
    // Sunken Sea: a survivor in the water ahead - dip to rope height (only if the terrain window allows it).
    // (Only while actually flying forward past it: hovering at rope height over a survivor the ship is not moving toward would hold the helm there for ever.)
    const dip = plan.speed > 0.05 && ship.speed > 0.05 ? rescueAltitude(state) : null;
    if (dip !== null && lo <= hi && dip > lo && dip < hi && (target === null || target === plan.target)) target = dip;
    // (Gentle enough not to overshoot now that she glides with momentum.)
    if (target !== null) p.jy = clamp((ship.alt - target) / 90 + (ship.vy || 0) / 260, -1, 1);
    else if (hi - lo > 250 && enemyActive(state)) p.jy = Math.sin(performance.now() / 700 + p.phase) * 0.7;
    else p.jy = 0;
    // The PRESSURE lever: pump or vent the gasbag toward the altitude the plan wants.
    p.gas = gasFor(state, beamDodge(state) ?? (dip !== null && target === dip ? dip : plan.target));
  } else if (L.kindOf(p.lock) === 'coil') {
    // Aim at the thickest bunch of enemies and charge while lined up.
    const shot = coilShot(state);
    p.gunIdle = shot.count >= 2 ? 0 : (p.gunIdle || 0) + dt;
    if (shot.count) {
      p.jx = Math.cos(shot.angle);
      p.jy = Math.sin(shot.angle);
      const off = Math.abs(Math.atan2(Math.sin(shot.angle - state.coil.aim), Math.cos(shot.angle - state.coil.aim)));
      p.fire = off < 0.1 && state.coil.cd <= 0;
    }
  } else if (L.kindOf(p.lock) === 'swivel') {
    // Turn the engine to where it is wanted (swivelWant) and stay until it is there and the wish has held a while.
    const want = swivelWant(state, p.lock), off = swivelOff(state, p.lock);
    p.gunIdle = off > 0.08 ? 0 : (p.gunIdle || 0) + dt;
    if (want != null && off > 0.02) {
      p.jx = Math.cos(want);
      p.jy = Math.sin(want);
    }
  } else if (L.kindOf(p.lock) === 'cannon' || L.kindOf(p.lock) === 'cannonSeat') {
    cannonOperate(p, state, dt); // (B.6: the crew cannon)
  } else if (L.kindOf(p.lock) === 'deflector') {
    // Swing the shield toward the nearest thing heading for the ship.
    const t = incoming(state);
    p.gunIdle = t ? 0 : (p.gunIdle || 0) + dt;
    if (t) {
      const S = L.shield;
      const a = Math.atan2((toShipY(mainShip(state), t.y) - S.cy) / S.ry, (toShipX(mainShip(state), t.x) - S.cx) / S.rx);
      p.jx = Math.cos(a);
      p.jy = Math.sin(a);
    }
  } else if (isSearchlight(p.lock, L)) {
    // Sweep the beam toward the enemy nearest the ship (in the dark with nothing about: a slow sweep); focus on it.
    const l = (state.searchlights || []).find((q) => q.n === p.lock);
    if (!l) return;
    const sx = toWorldX(mainShip(state), L.midPoint.x);
    const sy = toWorldY(mainShip(state), L.midPoint.y);
    const pitch = state.ship.pitch || 0;
    let best = null;
    for (const t of [...state.litTargets, ...state.dimTargets]) {
      const a = aimToShip(mainShip(state), Math.atan2(t.y - l.ey, t.x - l.ex)) - pitch;
      if (Math.abs(angleDiff(a, l.home)) > l.arc) continue;
      const d = Math.hypot(t.x - sx, t.y - sy);
      if (d < 2600 && (!best || d < best.d)) best = { a, d };
    }
    const dark = darkTarget(state) > 0.3;
    p.gunIdle = best || dark ? 0 : (p.gunIdle || 0) + dt;
    const a = best ? best.a : l.home + Math.sin(performance.now() / 1800 + p.phase) * l.arc * 0.8;
    if (best || dark) {
      p.jx = Math.cos(a);
      p.jy = Math.sin(a);
    }
    p.fire = !!best && Math.abs(angleDiff(best.a, l.aim)) < 0.15; // (hold Action: focus the beam on it)
  } else if (L.kindOf(p.lock) === 'bombBay') {
    // Drop when the aiming ring sits on a turret or building; leave when there's nothing to bomb.
    const aim = state.bombBay.aim;
    const targets = groundTargets(state);
    p.gunIdle = targets.length && state.bombBay.bombs > 0 ? 0 : (p.gunIdle || 0) + dt;
    const aimX = aim ? toShipX(mainShip(state), aim.x) : 0; // (the aiming ring is in the world, the ranges are along the ship)
    p.fire = !!aim && targets.some(([x0, x1]) => aimX > x0 - 70 && aimX < x1 + 70);
    if (bombRunOn(state) && state.bombBay.bombs > 0) { // (Versus: a high pass over the rival: drop when a bomb let go now falls through her hull)
      p.gunIdle = 0;
      p.fire = bombFalls(state);
    }
  } else {
    const gun = state.GUNS[p.lock];
    if (!gun) return;
    const angle = firingSolution(state, gun);
    // Count how long the enemy has been out of this gun's reach.
    p.gunIdle = angle === null ? (p.gunIdle || 0) + dt : 0;
    if (angle === null) {
      p.prime = gun.ammo > 0 && !gun.primed; // nothing to shoot: charge the loaded shell (hold PRIME)
      return;
    }
    p.jx = Math.cos(angle);
    p.jy = Math.sin(angle);
    const off = Math.abs(Math.atan2(Math.sin(angle - gun.aim), Math.cos(angle - gun.aim)));
    p.fire = gun.ammo > 0 && off < B.AIM_TOLERANCE && (!mainShip(state).ai || mainShip(state).ai.mayFire(p.lock)); // (the gunship fires broadsides from firing spots, with a glow first, not whenever a gun bears)
  }
}

// The platform someone is on (or the nearer end of what they're climbing).
function goalOf(L, o) {
  if (o.conn == null) return o.d;
  const c = L.connectors[o.conn];
  return o.s < 0.5 ? c.top : c.bottom;
}

function press(p) {
  if ((p.pressCd || 0) <= 0) {
    p.actQ = true;
    p.pressCd = 0.4;
  }
}

// Make sure the bot holds a tool; walks to the nearest rack/hook for it if not. True when held.
function getTool(state, p, kind, to) {
  const L = mainShip(state).layout;
  const { travelTime } = mainShip(state).nav;
  if (p.carry === kind) {
    p.rackT = undefined;
    return true;
  }
  // (the rack that makes the whole trip - rack, then the job - shortest)
  const cost = (r) => (p.d == null ? 0 : travelTime(p, r.d, r.x) + (to && to.d != null ? travelTime({ d: r.d, x: r.x, conn: null }, to.d, to.x) : 0));
  const rack = tables(L).PICKUPS.filter((r) => r.kind === kind).sort((a, b) => cost(a) - cost(b))[0];
  if (!rack) return false; // (a built ship may have none of this kind: the validator asks for one, but do not crash)
  if (steer(p, rack.d, rack.x)) {
    press(p);
    // A hole, fire or hurt module within reach of the rack wins over the rack while we hold the matching tool, so a tap
    // does nothing (the deadlock that left bots "fighting" with a hammer forever): hold Action to work it away.
    const now = performance.now();
    if (p.rackT === undefined) p.rackT = now;
    else if (now - p.rackT > 1200) p.fire = true;
  } else p.rackT = undefined;
  return false;
}

// Carry out the current job for one frame.
function work(p, state) {
  const L = mainShip(state).layout;
  const job = p.botJob;
  p.fire = false;
  if (!job) return wander(state, p);
  const o = job.obj;
  if (job.kind === 'hook') {
    if (steer(p, tables(L).MAIN, shipGeom(L).MAIN_X1 - 15, 12)) press(p);
    return;
  }
  if (job.kind === 'link' || job.kind === 'surge') return linkWork(p, state, job); // (LINKED STATIONS block at the end of this file)
  if (job.kind === 'throw') return throwWork(p, state, job); // (B.6)
  if (job.kind === 'shovel') { // (B.6: a load thrown onto the deck: hold Action beside it)
    if (!(state.loads || []).includes(o)) return;
    if (steer(p, o.d, o.x, 20)) {
      p.jx = 0;
      p.fire = true;
    }
    return;
  }
  if (job.kind === 'steal') { // (B.6: a boarder who has sabotaged her boiler lifts a sack from her coal bunker)
    const st = L.nearest('coal', p);
    if (!st || p.carry === 'coal') { p.stealNow = false; return; }
    if (steer(p, st.d, st.x, 20)) {
      p.jx = 0;
      press(p);
    }
    return;
  }
  if (job.kind === 'cutline') {
    if (steer(p, tables(L).MAIN, shipGeom(L).MAIN_X1 - 110, 25)) p.fire = true; // hold Action at the bow to hack her line
    return;
  }
  if (job.kind === 'raid') {
    if (steer(p, tables(L).MAIN, boilerX(state.gunship), 30)) p.fire = true;
    return;
  }
  if (job.kind === 'flee') {
    steer(p, tables(L).MAIN, 1250, 30);
    return;
  }
  if (job.kind === 'swingback') { // aboard the gunship with her charge set: to the stern where the rope is and swing back (the Action button says so when the rope is taut)
    const g = mainShip(state).ai.g;
    if (steer(p, 0, g.bp.landX, 40)) press(p);
    return;
  }
  if (job.kind === 'sabotage' || job.kind === 'capture') { // a boarder at the boiler / the helm: hold Action
    const st = L.one(job.kind === 'capture' ? 'helm' : 'boiler');
    if (st && steer(p, st.d, st.x, 20)) {
      p.jx = 0;
      p.fire = true;
    }
    return;
  }
  if (job.kind === 'fight') {
    const crew = state.gunship && state.gunship.crew.includes(o);
    const foe = foeOf(o, p); // (Versus: a crewman of the other team; B.5: the gunship's crew and ours)
    if (foe && !crew && !state.boarders.includes(o) && o.id != null && state.players[o.id] !== o) return; // (he left this ship - carried home, or swung back - since the job was picked)
    if (o.fall || !(state.boarders.includes(o) || crew || foe) || (!hostile(p, state) && !getTool(state, p, 'sword') && tables(L).PICKUPS.some((r) => r.kind === 'sword'))) return; // (no sword rack aboard: fight bare-handed, shoving them back; a boarder has no rack of his own to take a sword from)
    if (steer(p, goalOf(L, o), o.x, 45) || (Math.abs(o.y - p.y) < 20 && Math.abs(o.x - p.x) < 70)) {
      p.jx = 0;
      p.face = o.x < p.x ? -1 : 1;
      if ((p.whackCd || 0) <= 0) {
        p.atkQ = true;
        p.whackCd = B.WHACK_EVERY;
      }
    }
  } else if (job.kind === 'swat') {
    // Walk under/up to the bat and hit the attack button.
    if (o.hp <= 0 || !o.latched) return;
    if (steer(p, o.d, o.lx, 40)) {
      p.jx = 0;
      p.face = o.lx < p.x ? -1 : 1;
      if ((p.whackCd || 0) <= 0) {
        p.atkQ = true;
        p.whackCd = B.WHACK_EVERY;
      }
    }
  } else if (job.kind === 'sail') {
    // Walk to the mast: hold Action to haul the sail up, tap it to let it down.
    const s = (L.sails || [])[o.i];
    if (!s) return;
    if (steer(p, s.d, s.x, 15)) {
      p.jx = 0;
      if (job.up) p.fire = true;
      else press(p);
    }
  } else if (job.kind === 'rod' || job.kind === 'pump' || job.kind === 'winch') {
    // Stand at the rod / bilge pump / winch and hold Action (the job drops away once it is done).
    if (steer(p, o.d, o.x, 15)) p.fire = true;
  } else if (job.kind === 'vent' || job.kind === 'gasvalve') {
    // Walk to the vent (or the gas valve) and flip it.
    if (steer(p, o.d, o.x, 10)) press(p);
  } else if (job.kind === 'cool') {
    // GOING DOWN!: a block of ice from the locker, then onto the boiler
    const b = L.one('boiler'); // (GOING DOWN! is about the first boiler)
    if (getTool(state, p, 'ice', b) && steer(p, b.d, b.x, 40)) press(p);
  } else if (job.kind === 'coal' && p.carry === 'coal' && state.goingDown && state.goingDown.heat + state.goingDown.heatPer >= 0.97) {
    // GOING DOWN!: another load now would burst the boiler - wait by it with the coal until the ice has cooled it
    const b = L.one('boiler');
    steer(p, b.d, b.x - 50, 20);
  } else if (job.kind === 'coal') {
    const s = p.carry === 'coal' ? boilerFor(state, p) : L.nearest('coal', p);
    if (!s) { p.carry = null; return wander(state, p); } // (no coal bunker or boiler on this ship: nothing to haul)
    if (steer(p, s.d, s.x)) press(p);
  } else if (job.kind === 'defuse') {
    if (steer(p, o.d, o.x, 25)) p.fire = true;
  } else if (job.kind === 'help') {
    steer(p, goalOf(L, o), o.x, 70); // (walk over to whoever called, then stand by)
  } else if (job.kind === 'revive') {
    if (steer(p, goalOf(L, o), o.x, 30)) p.fire = true;
  } else if (job.kind === 'fire') {
    if (getTool(state, p, 'extinguisher', o) && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'patch') {
    if (getTool(state, p, 'hammer', o) && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'ice') {
    if (getTool(state, p, 'hammer', o) && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'unclog' || job.kind === 'oxygen') {
    if (steer(p, o.d, o.x, 25)) p.fire = true; // hold Action at the engine / the oxygen tank
  } else if (job.kind === 'repair') {
    if (getTool(state, p, 'hammer', o) && steer(p, o.d, o.x, 20)) p.fire = true;
  } else if (job.kind === 'valve') {
    if (steer(p, o.d, o.x, 10)) press(p);
  } else if (job.kind === 'ammo') {
    const s = p.carry === 'ammo' ? stationNamed(L, o) : L.nearest('ammo', p);
    if (!s) { p.carry = null; return wander(state, p); }
    if (steer(p, s.d, s.x)) press(p);
  } else if (job.kind === 'station') {
    const s = stationNamed(L, o);
    if (steer(p, s.d, s.x)) {
      // Fix it up on the way in if we happen to have a hammer.
      const m = (state.modules || []).find((q) => q.name === o);
      if (p.carry === 'hammer' && m && m.hp < m.max) p.fire = true;
      else press(p);
    }
  }
}

function wander(state, p) {
  const L = mainShip(state).layout;
  if (!p.wanderTo || (p.wanderWait !== undefined && p.wanderWait <= 0)) {
    // Mostly amble about the deck they are on (less pointless walking), now and then go somewhere else.
    const d = p.d != null && Math.random() < 0.75 ? p.d : (Math.random() * L.platforms.length) | 0;
    const plat = L.platforms[d];
    p.wanderTo = { d, x: plat.x0 + 20 + Math.random() * ((plat.id === 'main' ? shipGeom(L).MAIN_X1 : plat.x1) - plat.x0 - 40) };
    p.wanderWait = undefined;
  }
  if (steer(p, p.wanderTo.d, p.wanderTo.x) && p.wanderWait === undefined) p.wanderWait = 1 + Math.random() * 2;
}

// ---------- Daring stunts (config BOTS.DARING) ----------
// An otherwise idle bot now and then takes a hookshot from a rack and: hooks the enemy gunship's deck (only while her
// rope to our bow is tied, so the crew can swing back as usual), swings up onto another of our own decks, or hooks a fighter
// (a dogfighter or the big one), kicks the pilot out, flies her for a while and bails out over our ship. The stunt
// is a little state machine in p.dare = { kind, phase, t, ... }; p.daring is true while it runs (the game lets bots
// steer in the air, fire the hookshot and board planes only then). It always ends with the bot back on a deck.
const DR = B.DARING;
const val = (v) => (typeof v === 'function' ? v() : v);
const AIR_KINDS = ['fighter', 'strafer', 'bomber'];
const stuntLog = (state, p, text) => {
  const log = (state.stuntLog = state.stuntLog || []);
  log.push({ t: Math.round(performance.now() / 100) / 10, bot: p.name, text });
  if (log.length > 400) log.shift();
};

// Flying planes within hook reach of (world) o: [{ s, x, y (world), sx, sy (the same point in ship coordinates), d }], nearest first.
function planesNear(state, o, reach) {
  const ship = mainShip(state);
  const list = [...(state.strafers || []).filter((s) => s.hp > 0)];
  const big = state.stunts.bigFighter && state.stunts.bigFighter();
  if (big) list.push(big);
  return list
    .map((s) => ({ s, x: s.x, y: s.y, sx: toShipX(ship, s.x), sy: toShipY(ship, s.y), d: Math.hypot(s.x - o.x, s.y - o.y) }))
    // (over the ship, and not flying away from it: a bot dragged out past the ship's ends would go overboard)
    .filter((q) => q.d <= reach && q.sx > -250 && q.sx < 1900 && q.sy > -350 && q.sy < 880 && q.sx + ((q.s.vx || 0) - ship.pose.vx) * 1.5 > -250 && q.sx + ((q.s.vx || 0) - ship.pose.vx) * 1.5 < 1900 && q.sy + (q.s.vy || 0) * 1.5 > -350 && q.sy + (q.s.vy || 0) * 1.5 < 800)
    .sort((a, b) => a.d - b.d);
}

// Angle search for a show-off swing: a hook that catches a deck of ours above us.
function aimShow(state, p) {
  const S = state.stunts;
  const o = S.origin(p);
  let best = null;
  for (let a = -170; a <= -10; a += 10) {
    const dx = Math.cos((a * Math.PI) / 180);
    const dy = Math.sin((a * Math.PI) / 180);
    const c = S.cast(o, dx, dy);
    const an = c.anchor;
    if (!an || !an.surf || an.kind !== 'ship' || c.dist < 150 || c.dist > DR.SHOW_REACH) continue;
    const pos = an.pos();
    if (!pos || pos.y > o.y - 60) continue;
    const score = Math.random();
    if (!best || score > best.score) best = { dx, dy, score, landX: pos.x };
  }
  return best;
}

// A ray that catches one of the enemy gunship's decks.
function aimGun(state, p) {
  const S = state.stunts;
  const o = S.origin(p);
  let best = null;
  for (const s of S.surfaces()) {
    if (typeof s.id !== 'string' || !s.id.startsWith('gunship')) continue;
    const y = val(s.y);
    if (y == null) continue;
    const x0 = val(s.x0);
    const x1 = val(s.x1);
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const tx = toWorldX(mainShip(state), x0 + (x1 - x0) * f); // (the surfaces are on the ship; the hook flies in the world)
      const ty = toWorldY(mainShip(state), y + 4);
      const m = Math.hypot(tx - o.x, ty - o.y);
      if (m > DR.GUN_REACH || m < 90) continue;
      const c = S.cast(o, (tx - o.x) / m, (ty - o.y) / m);
      if (c.anchor && c.anchor.kind === 'gunship' && (!best || m < best.m)) best = { dx: (tx - o.x) / m, dy: (ty - o.y) / m, m, landX: tx };
    }
  }
  return best;
}

// Versus: a ray that catches one of the RIVAL's decks (config.BOTS.DARING.BOARD_REACH away at most); the hook must really end on her deck, not on one of ours on the way.
function aimRival(state, p) {
  const S = state.stunts;
  const ship = mainShip(state);
  const o = S.origin(p);
  let best = null;
  for (const s of S.surfaces()) {
    if (typeof s.id !== 'string' || !s.id.startsWith('rival:')) continue;
    const y = val(s.y);
    if (y == null) continue;
    const x0 = val(s.x0);
    const x1 = val(s.x1);
    for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
      const tx = toWorldX(ship, x0 + (x1 - x0) * f);
      const ty = toWorldY(ship, y + 4);
      const m = Math.hypot(tx - o.x, ty - o.y);
      if (m > DR.BOARD_REACH || m < 90) continue;
      const c = S.cast(o, (tx - o.x) / m, (ty - o.y) / m);
      const at = c.anchor && c.anchor.surf && c.anchor.pos();
      if (at && Math.hypot(at.x - tx, at.y - ty) < 160 && (!best || m < best.m)) best = { dx: (tx - o.x) / m, dy: (ty - o.y) / m, m, landX: tx };
    }
  }
  return best;
}

// Versus: is one of the rival's decks within a hook's throw of the end of our top deck that faces her?
export function rivalWithinHook(state) {
  const R = state.rival;
  if (!R || R.down || !state.stunts) return false;
  const ship = mainShip(state);
  const L = ship.layout;
  const deck = L.platforms[tables(L).CATWALK];
  const right = toShipX(ship, R.mid.x) > L.aimPoint.x;
  const ex = toWorldX(ship, right ? deck.x1 - 35 : deck.x0 + 35), ey = toWorldY(ship, deck.y);
  return state.stunts.surfaces().some((s) => {
    if (typeof s.id !== 'string' || !s.id.startsWith('rival:') || val(s.y) == null) return false;
    const a = toWorldX(ship, val(s.x0)), b = toWorldX(ship, val(s.x1)), wy = toWorldY(ship, val(s.y));
    return Math.hypot(Math.max(Math.min(a, b) - ex, 0, ex - Math.max(a, b)), wy - ey) <= DR.BOARD_REACH + config.PVP.BOT.BOARD_CLOSE - 100; // (the captain closes in by BOARD_CLOSE while he is on his way)
  });
}

// A ray that hits one of the flying planes in reach (the nearest first).
function aimPlane(state, p) {
  const S = state.stunts;
  const o = S.origin(p);
  for (const q of planesNear(state, o, DR.REACH)) {
    const dx = (q.x - o.x) / (q.d || 1);
    const dy = (q.y - o.y) / (q.d || 1);
    if (q.d < 90) continue;
    const c = S.cast(o, dx, dy);
    const stat = (state.stuntStats = state.stuntStats || {});
    const key = c.anchor && c.anchor.plane === q.s ? 'planeHit' : 'blocked by ' + (c.anchor ? c.anchor.kind : 'nothing');
    stat[key] = (stat[key] || 0) + 1;
    if (c.anchor && c.anchor.plane === q.s) return { dx, dy, plane: q.s };
  }
  return null;
}

// Which stunts are possible right now?
function dareKinds(state) {
  const ship = mainShip(state);
  const L = ship.layout;
  const kinds = [];
  const o = { x: toWorldX(ship, L.aimPoint.x), y: toWorldY(ship, L.aimPoint.y) };
  // (any plane about is a reason to go and wait for it out on the top deck; hooking it needs it to come close and clear)
  if ((state.strafers || []).some((s) => s.hp > 0 && Math.hypot(s.x - o.x, s.y - o.y) < 3000) || (state.stunts.bigFighter() && Math.hypot(state.enemy.x - o.x, state.enemy.y - o.y) < 3000)) kinds.push('plane');
  const gs = state.gunship;
  if (gs && gs.rope && !gs.charge && (gs.phase === 'hunt' || gs.phase === 'latch')) kinds.push('gun');
  if (config.PVP.ENABLED && state.ship.hull >= config.PVP.BOT.BOARD_CALM_HULL && rivalWithinHook(state)) kinds.push('board'); // Versus: a way across to the rival's decks
  kinds.push('show');
  return kinds;
}

// Should this idle bot (job = what it would do now) feel daring? If so, start a stunt.
function maybeDare(p, state, bots, job) {
  const L = mainShip(state).layout;
  const RD = config.PVP.ENABLED ? config.PVP.BOT.RAID : null; // (Versus: raids are bolder and more often than co-op stunts)
  if (!DR.ENABLED || p.mate || p.enemy || (mainShip(state).ai && hostile(p, state)) || p.dare || !state.stunts || state.phase !== 'flying' || state.ship.down || state.ship.hull < (RD ? RD.MIN_HULL : DR.MIN_HULL)) return; // (the gunship's crew are not daring; our boarders on her deck are busy)
  if (bots.length < DR.MIN_CREW || bots.filter((q) => q.dare).length >= (RD ? RD.MAX : DR.MAX_AT_ONCE)) return;
  if (state.stuntEnd !== undefined && performance.now() - state.stuntEnd < (RD ? RD.COOLDOWN : DR.COOLDOWN) * 1000) return;
  if (p.lock || p.carry === 'coal' || p.carry === 'ammo' || p.onGunship || p.fly || p.air || p.conn != null || p.swing || p.hj || p.d == null) return;
  if (RD) return pvpRaid(p, state, bots, job);
  if (job && !(job.kind === 'station' && !isHelm(L, job.obj) && (job.tier ?? 1) >= 1)) return; // (anything but a spare station is work)
  if (state.fires.length || state.breaches.length || (state.gasHoles || []).length || state.boarders.length || state.bats.some((b) => b.latched)) return;
  if (listJobs(state, p).some((j) => j.urgent || j.kind === 'revive' || j.kind === 'defuse' || j.kind === 'flee' || j.kind === 'cutline')) return;
  const kinds = dareKinds(state);
  // (a plane to steal or a gunship alongside is a better excuse than a quiet moment)
  if (Math.random() >= (DR.CHANCE_PER_MIN * (kinds.length > 1 ? DR.TARGET_BOOST : 1) * B.THINK_EVERY) / 60) return;
  let pick = Math.random() * kinds.reduce((a, k) => a + DR.KINDS[k], 0);
  let kind = kinds[0];
  for (const k of kinds) {
    pick -= DR.KINDS[k];
    if (pick <= 0) {
      kind = k;
      break;
    }
  }
  p.dare = { kind, phase: 'get', t: 0, pt: 0, tries: 0, aimCd: 0 };
  p.daring = true;
  p.botJob = null;
  stuntLog(state, p, 'start ' + kind);
}

// Versus: send a bot across to the rival (the hookshot, or a parachute from the bomb bay when she hangs below). Bolder than a co-op stunt: fires and holes do not stop it
// (the captain "accepts some risk"), a hand that is busy goes now and then anyway; but the ship is never left bare: the wheel, a gun and a lit boiler stay manned and KEEP hands stay home.
function pvpRaid(p, state, bots, job) {
  const L = mainShip(state).layout, RD = config.PVP.BOT.RAID;
  const m = state.match, R = state.rival;
  if (!R || R.down || !m || m.phase !== 'fight') return;
  const c = captainOf(state);
  const home = bots.filter((q) => q !== p && !q.dare && !q.fall && !(q.ko > 0) && !q.mate);
  if (home.length < RD.KEEP || !home.some((q) => isHelm(L, q.lock) || (q.botJob && q.botJob.kind === 'station' && isHelm(L, q.botJob.obj)))) return; // (the wheel stays manned, and so does a gun: the last gunner never leaves his post, see updateBot)
  if (state.ship.press < 18 && state.ship.fuel < 8) return; // (...and the boiler is lit)
  const spare = !job || (job.kind === 'station' && !isHelm(L, job.obj) && (job.tier ?? 1) >= 1);
  if (!spare && Math.random() >= RD.BUSY) return; // (a busy hand goes now and then, the fires can wait)
  if (listJobs(state, p).some((j) => j.kind === 'revive' || j.kind === 'defuse' || j.kind === 'flee' || j.kind === 'cutline')) return;
  const kinds = [];
  if (rivalWithinHook(state)) kinds.push('board');
  if (L.bombBay && dropPossible(state)) kinds.push('drop');
  if (!kinds.length) return;
  if (Math.random() >= (RD.CHANCE_PER_MIN * RD.BOOST * c.S.raid * B.THINK_EVERY) / 60) return;
  let pick = Math.random() * kinds.reduce((a, k) => a + DR.KINDS[k], 0);
  let kind = kinds[0];
  for (const k of kinds) {
    pick -= DR.KINDS[k];
    if (pick <= 0) { kind = k; break; }
  }
  p.dare = { kind, phase: kind === 'drop' ? 'walk' : 'get', t: 0, pt: 0, tries: 0, aimCd: 0 };
  p.daring = true;
  p.botJob = null;
  stuntLog(state, p, 'start ' + kind);
  callout(state, kind === 'drop' ? 'PARACHUTES IN!' : 'IS BOARDING!', 2);
}

function endDare(p, state, why) {
  if (!p.dare) return;
  stuntLog(state, p, 'end ' + p.dare.kind + ' (' + why + ') t=' + p.dare.t.toFixed(0));
  state.stuntPlane = null;
  p.dare = null;
  p.daring = false;
  p.fire = false;
  p.jx = p.jy = 0;
  p.botJob = null;
  p.jobSince = performance.now();
  state.stuntEnd = performance.now();
}

function setPhase(p, state, phase) {
  if (phase !== 'hooked' && state.stuntPlane && p.dare.phase === 'hooked') state.stuntPlane = null;
  p.dare.phase = phase;
  p.dare.pt = 0;
  stuntLog(state, p, p.dare.kind + ' -> ' + phase);
}

// Steer the stick toward a point (world x, horizontal only: the flyer is in the world).
const steerAirTo = (p, x) => {
  p.jx = clamp((x - p.x) / 120, -1, 1) * mainShip(world).pose.f; // (the stick is along the ship; the flyer is in the world)
  p.jy = 0;
};

// One frame of a stunt. Returns true while it is in charge of the bot.
function dareStep(p, state, dt) {
  const L = mainShip(state).layout;
  const d = p.dare;
  d.t += dt;
  d.pt += dt;
  d.aimCd -= dt;
  if (d.kind === 'board' || d.kind === 'drop') state.boardAt = performance.now(); // (the captain: bring her in close while a crewman crosses, course.js rivalPlan)
  p.botJob = null;
  p.fire = false;
  p.jx = p.jy = 0;
  if (state.phase !== 'flying' || state.ship.down || !state.stunts) {
    // The voyage ended under it: the game resets everyone; just stop.
    endDare(p, state, 'voyage over');
    return false;
  }
  if (d.t > DR.TOTAL_TIMEOUT + 45) {
    endDare(p, state, 'hard timeout');
    return false;
  }
  if (d.t > DR.TOTAL_TIMEOUT && d.phase !== 'return') {
    setPhase(p, state, 'return');
  }
  const grounded = !p.fly && !p.hj && !p.hook && !p.air;
  if (d.kind === 'drop' && d.phase === 'walk') { // Versus: to the hatch of the bomb bay, then Action jumps (the chute opens; the stick steers him onto her deck)
    const bay = L.bombBay, st = L.one('bombBay');
    if (!state.rival || state.rival.down || !bay || !st) return endDare(p, state, 'rival gone'), false;
    if (p.fly) return setPhase(p, state, 'land'), true;
    if (d.pt > DR.WAIT_TIMEOUT + 6 || p.carry === 'ammo') return endDare(p, state, 'no way to the hatch'), false;
    if (steer(p, st.d, bay.jumpX, 8)) {
      p.jx = 0;
      press(p);
    }
    return true;
  }
  switch (d.phase) {
    case 'get': {
      if (p.carry === 'hookshot') return setPhase(p, state, 'aim'), true;
      if (d.t > DR.GET_TIMEOUT || state.ship.hull < DR.MIN_HULL) return endDare(p, state, 'no hookshot'), false;
      getTool(state, p, 'hookshot');
      return true;
    }
    case 'aim': {
      if (p.carry !== 'hookshot') return setPhase(p, state, 'get'), true;
      if (p.fly || p.hj) return setPhase(p, state, p.hj ? 'kick' : 'land'), true;
      if (d.pt > (d.kind === 'plane' ? DR.WAIT_TIMEOUT * 2 : DR.WAIT_TIMEOUT)) return endDare(p, state, 'nothing to aim at'), false;
      if (!grounded || (p.hookCd || 0) > 0) return true;
      let aim = null;
      if (d.kind === 'gun') {
        const gs = state.gunship;
        if (!gs || !gs.rope || gs.charge) return endDare(p, state, 'gunship gone'), false;
        // Stand at our bow, then find a ray onto her deck.
        if (!steer(p, tables(L).MAIN, shipGeom(L).MAIN_X1 - 70, 25)) return true;
        if (d.aimCd <= 0) {
          d.aimCd = 0.3;
          aim = aimGun(state, p);
        }
      } else if (d.kind === 'plane') {
        // Wait out at the end of the top deck on the side the nearest plane is on: the hook goes through nothing
        // solid, but it catches the decks and the gasbag, so a clear shot is out past the ship's end.
        const near = planesNear(state, { x: toWorldX(mainShip(state), L.aimPoint.x), y: toWorldY(mainShip(state), L.aimPoint.y) }, 2200)[0];
        // (a plane level with or below the main deck is shot at from the end of the lower deck instead)
        const low = near && near.sy > 600;
        // The crew's guns spare the plane it has its eye on (the one nearest the ship), so it lives long enough to be hooked.
        if (!state.stuntPlane || !(state.stuntPlane.hp > 0) || !(state.strafers.includes(state.stuntPlane) || state.stuntPlane === state.enemy)) {
          const mid = { x: toWorldX(mainShip(state), L.aimPoint.x), y: toWorldY(mainShip(state), L.aimPoint.y) };
          state.stuntPlane = [...state.strafers.filter((s) => s.hp > 0)].sort((a, b) => Math.hypot(a.x - mid.x, a.y - mid.y) - Math.hypot(b.x - mid.x, b.y - mid.y))[0] || null;
        }
        const deck = L.platforms[low ? tables(L).LOWER : tables(L).CATWALK]; // (25 px in from the end of the lower deck, 35 from the end of the top deck)
        const there = steer(p, low ? tables(L).LOWER : tables(L).CATWALK, near && near.sx < L.aimPoint.x ? (low ? deck.x0 + 25 : deck.x0 + 35) : low ? deck.x1 - 25 : deck.x1 - 35, 30);
        if (there && d.aimCd <= 0) {
          // (only from the spot: shooting upward while walking past a ladder would climb it instead of firing)
          d.aimCd = 0.25;
          aim = aimPlane(state, p);
        }
      } else if (d.kind === 'board') {
        const R = state.rival;
        if (!R || R.down) return endDare(p, state, 'rival gone'), false;
        // Stand at the end of the top deck that faces her, then find a ray onto one of her decks.
        const deck = L.platforms[tables(L).CATWALK];
        const right = toShipX(mainShip(state), R.mid.x) > L.aimPoint.x;
        if (!steer(p, tables(L).CATWALK, right ? deck.x1 - 22 : deck.x0 + 22, 20)) return true; // (the very end: a slide pole starts a little further in, and a stick pushed down there would take it)
        if (d.aimCd <= 0) {
          d.aimCd = 0.3;
          aim = aimRival(state, p);
        }
      } else if (d.aimCd <= 0) {
        d.aimCd = 0.3;
        aim = aimShow(state, p);
        if (!aim) {
          // No deck in reach from here: amble somewhere else on this deck and look again.
          if (!d.walkTo || Math.abs(d.walkTo - p.x) < 20) {
            const pl = L.platforms[p.d];
            d.walkTo = pl.x0 + 40 + Math.random() * ((pl.id === 'main' ? shipGeom(L).MAIN_X1 : pl.x1) - pl.x0 - 80);
          }
        }
      }
      if (!aim && d.kind === 'show' && d.walkTo) steer(p, p.d, d.walkTo, 20);
      if (aim && (p.hookCd || 0) <= 0 && p.conn == null && !p.lock) { // (the hookshot will not fire on a ladder)
        const soft = d.kind === 'board' ? 0.4 : 1; // (a gentle stick still aims the hook, but does not push him down a pole or a ladder in the same frame)
        p.jx = aim.dx * mainShip(state).pose.f * soft; // (the hook flies along the world, jx is along the ship)
        p.jy = aim.dy * soft;
        p.atkQ = true;
        d.tries++;
        d.aim = aim;
        d.landX = aim.landX;
        if (aim.plane) state.stuntPlane = aim.plane; // (our own guns leave it alone while the bot is on the rope)
        setPhase(p, state, 'hooked');
      }
      return true;
    }
    case 'hooked': {
      const h = p.hook;
      if (p.hj) return setPhase(p, state, 'kick'), true;
      if (!h) {
        if (d.pt < 0.1) return true; // (the shot is being fired this frame)
        if (p.fly) return setPhase(p, state, 'land'), true; // (ledge climb / released: in the air now)
        // A miss (or it never left): try again, a few times.
        if (d.tries >= DR.HOOK_TRIES) return endDare(p, state, 'missed'), false;
        return setPhase(p, state, 'aim'), true;
      }
      if (d.aim) {
        p.jx = d.aim.dx * 0.5 * mainShip(state).pose.f; // (a gentle pump while the hook flies)
      }
      if (h.phase === 'caught') {
        p.fire = true; // reel in
        // Dragged out toward the ship's ends (a plane flying off with her)? Let go while there is still ship to come back to.
        const wayOut = d.kind === 'plane' && (toShipX(mainShip(state), p.x) < -330 || toShipX(mainShip(state), p.x) > 1980 || toShipY(mainShip(state), p.y) > 720);
        if ((d.pt > DR.REEL_TIMEOUT || wayOut) && h.t >= config.HOOKSHOT.RELEASE_LOCK) {
          p.fire = false;
          p.atkQ = true; // let go
          return setPhase(p, state, 'land'), true;
        }
      }
      return true;
    }
    case 'kick': {
      const s = p.hj;
      if (!s) return setPhase(p, state, 'land'), true;
      if (s.phase === 'kick') {
        p.fire = true; // hold Action: the pilot is booted out in under a second
        if (d.pt > DR.KICK_TIMEOUT) {
          p.leaveQ = true; // give up and jump off
          return setPhase(p, state, 'land'), true;
        }
        return true;
      }
      d.big = !!s.big;
      d.flyT = 0;
      return setPhase(p, state, 'fly'), true;
    }
    case 'fly': {
      const s = p.hj;
      if (!s) return setPhase(p, state, 'land'), true;
      d.flyT = (d.flyT || 0) + dt;
      const mid = { x: toWorldX(mainShip(state), L.aimPoint.x), y: toWorldY(mainShip(state), L.aimPoint.y) };
      const homeBound = d.flyT > (d.big ? DR.FLY_TIME_BIG : DR.FLY_TIME) || s.fuel < 9 || s.hp <= 2 || Math.hypot(s.x - mid.x, s.y - mid.y) > 1500;
      if (!homeBound) {
        // Hunt the nearest enemy plane near the ship; with none, the plane circles the ship by herself.
        let best = null;
        for (const t of targets(state)) {
          if (!AIR_KINDS.includes(t.kind)) continue;
          const q = t.at(0.3);
          const dm = Math.hypot(q.x - mid.x, q.y - mid.y);
          if (dm > 1100) continue;
          const ds = Math.hypot(q.x - s.x, q.y - s.y);
          if (!best || ds < best.ds) best = { q, ds };
        }
        if (best) {
          p.jx = ((best.q.x - s.x) / (best.ds || 1)) * mainShip(state).pose.f;
          p.jy = (best.q.y - s.y) / (best.ds || 1);
        }
        return true;
      }
      // Home: fly to the air above the ship's middle, and bail out when she is over it and clear of the hull.
      const tx = mid.x;
      const ty = toWorldY(mainShip(state), L.bounds.y0) - 520;
      const dm = Math.hypot(tx - s.x, ty - s.y) || 1;
      p.jx = ((tx - s.x) / dm) * mainShip(state).pose.f;
      p.jy = (ty - s.y) / dm;
      d.homeT = (d.homeT || 0) + dt;
      const above = toShipY(mainShip(state), s.y) < DR.BAIL_Y;
      // (Over the ship and clear of the hull is best; after a few seconds of trying, anywhere the parachute can still bring her home is fine.)
      const sx = s.x - mid.x;
      const chuteOk = Math.abs(sx) < 1200 && toShipY(mainShip(state), s.y) < 800;
      if ((Math.abs(sx) < DR.BAIL_OVER && above) || (d.homeT > 10 && chuteOk) || d.homeT > 30 || s.fuel < 2.5) {
        p.leaveQ = true;
        d.landX = mid.x;
        return setPhase(p, state, 'land'), true;
      }
      return true;
    }
    case 'land':
    case 'return': {
      if (p.hj) {
        if (d.phase === 'return') p.leaveQ = true;
        else return setPhase(p, state, 'kick'), true;
        return true;
      }
      if (p.hook) {
        const h = p.hook;
        if (h.phase === 'caught' && (d.phase === 'return' || d.pt > DR.REEL_TIMEOUT) && h.t >= config.HOOKSHOT.RELEASE_LOCK) p.atkQ = true;
        else p.fire = h.phase === 'caught';
        return true;
      }
      if (p.fly && d.kind === 'cannon') { // (B.6: fired from the crew cannon: drift onto the target ship's top deck, open the parachute above it)
        const tg = d.target;
        if (!tg || tg.state.down > 0) { if (!p.chute && p.fvy > 0) press(p); return true; }
        steerAirTo(p, toWorldX(tg, tg.layout.refPoint.x));
        const deckY = toWorldY(tg, Math.min(...tg.layout.platforms.map((q) => q.y)));
        if (!p.chute && p.fvy > 0 && p.y > deckY - 450 && d.pt > 0.8) press(p);
        return true;
      }
      if (p.fly) {
        // Drift toward where we want to come down (a deck of ours; the gunship's deck for that stunt).
        steerAirTo(p, (d.kind === 'board' || d.kind === 'drop') && state.rival ? state.rival.mid.x : d.kind === 'gun' && d.phase === 'land' && d.landX != null && state.gunship ? d.landX : toWorldX(mainShip(state), L.aimPoint.x));
        return true;
      }
      if (p.air) return true; // (a hop in the air)
      return endDare(p, state, p.onGunship ? 'landed on her deck' : 'landed'), false;
    }
  }
  return false;
}

// Is this bot free to be sent on an errand (HELP! calls)? Idle bots always are; with `loose`, so are bots on a
// job that is not an emergency (hauling, walking to a station).
export function botFree(p, loose) {
  if (p.helpFor || p.mate) return false; // (ship's mates keep to their chores: no errands)
  return !p.botJob || (!!loose && !isEmergency(p.botJob));
}

// ---------- Ship's mates (mates.js, config.MATES) ----------
// A mate runs the same brain as a bot but only sees the hauling and mending jobs: never a station (guns, helm, searchlights,
// bomb bay, lookout...), the hookshot and hijack stunts, or votes. Everything else is filtered out of its job list here.
function roleJobs(state, bot, jobs) {
  const L = mainShip(state).layout;
  if (bot.mate) return jobs.filter((j) => config.MATES.JOBS.includes(j.kind));
  if (bot.role) return enemyRoleJobs(state, bot, jobs, L);
  if (humanAutopilot(bot, state)) return jobs.filter((j) => !(j.kind === 'station' && isHelm(L, j.obj)));
  return jobs;
}
// The enemy gunship's crew (B.5, gunshipShip.js): each one has a ROLE from the old gunship (bot.role) and only sees the jobs of that role - the helmsman flies her, the gunners man the guns and
// haul their shells, the stoker feeds the boiler and mends her steam, the guards fight boarders and patch the hull. Nobody mends a shot-out gun (a gun port stays down, as it always did).
const ENEMY_KINDS = {
  helm: ['station'],
  gunner: ['station', 'ammo', 'fight', 'fire'],
  stoker: ['coal', 'valve', 'vent', 'repair', 'fire', 'patch', 'fight'],
  guard: ['fight', 'patch', 'fire', 'repair', 'revive', 'swat', 'defuse', 'vent', 'valve', 'coal', 'ammo'],
};
function enemyRoleJobs(state, bot, jobs, L) {
  const keep = ENEMY_KINDS[bot.role] || ENEMY_KINDS.guard;
  return jobs.filter((j) => {
    if (!keep.includes(j.kind)) return false;
    if (j.kind === 'station') return bot.role === 'helm' ? isHelm(L, j.obj) : tables(L).GUN_STATIONS.includes(j.obj);
    if (j.kind === 'repair') return !j.obj || j.obj.kind !== 'gun';
    return true;
  });
}
// (Test sims only: a bot flagged { human: true } stands in for a person. With the autopilot on, a person goes to the guns,
// not the wheel, so the stand-in leaves the helm alone too.)
const humanAutopilot = (p, state) => !!p.human && autopilotOn(state);

// Called once per frame for each bot, before the game applies its input.
export function updateBot(p, state, dt) {
  const L = mainShip(state).layout;
  world = state;
  p.pressCd = (p.pressCd || 0) - dt;
  p.whackCd = (p.whackCd || 0) - dt;
  if (p.wanderWait !== undefined) p.wanderWait -= dt;
  if (p.phase === undefined) p.phase = Math.random() * 6.28;
  if (p.fall || p.ko > 0) {
    if (p.dare) endDare(p, state, p.fall ? 'fell' : 'knocked out');
    p.botJob = null;
    p.jx = p.jy = 0;
    p.fire = false;
    return;
  }
  // A daring stunt takes over the bot until it is safely back on a deck.
  if (p.dare) {
    if (dareStep(p, state, dt)) return;
  } else if (p.hj) {
    p.leaveQ = true; // (never left flying a plane without a stunt in charge)
    return;
  }

  // Hop over a fire that is in the way (not the one they are going to put out).
  if (!p.lock && !p.air && p.conn == null && Math.abs(p.jx) > 0.3 && state.fires.some((f) => f.d === p.d && f !== (p.botJob && p.botJob.obj) && (f.x - p.x) * p.jx > 0 && Math.abs(f.x - p.x) < 90 && Math.abs(f.x - p.x) > 50)) p.jumpQ = true;

  const bots = Object.values(state.players).filter((q) => q.bot);
  if ((p.think = (p.think || 0) - dt) <= 0) {
    p.think = B.THINK_EVERY;
    if (p.lock) {
      // Rotate off stations now and then, and leave early if fires/holes/raiders outnumber free hands.
      const free = bots.filter((q) => !q.lock && !(q.ko > 0) && !q.mate).length; // (a mate cannot take the jobs a station-keeper would leave for)
      const urgent = (p.enemy ? enemyRoleJobs(state, p, listJobs(state, p), L) : listJobs(state, p)).filter(isEmergency).length; // (the gunship's crew only count the emergencies of their own role)
      if (p.lockLeft === undefined) p.lockLeft = B.STATION_MIN + Math.random() * (B.STATION_MAX - B.STATION_MIN);
      const mod = (state.modules || []).find((m) => m.name === p.lock);
      const gunUseless = (!p.enemy && (p.gunIdle || 0) > 6) || (mod && mod.broken);
      if (gunUseless) p.gunIdle = 0;
      // Never wander off the helm while there's terrain to steer through (nor the gunship's crew off their posts).
      if ((isHelm(L, p.lock) && config.COURSE.ENABLED) || p.enemy) p.lockLeft = Math.max(p.lockLeft, 1);
      // A lightning bolt is charging and nobody is on their way to a rod: leave the station (not the helm).
      const rodCall = !isHelm(L, p.lock) && state.stormJob && state.stormJob.charge && !bots.some((q) => q.botJob && q.botJob.kind === 'rod') && Math.random() < 0.9;
      // Nobody is at the wheel in flight and nobody is on the way: leave the station and take it.
      const helmCall = !isHelm(L, p.lock) && !humanAutopilot(p, state) && state.phase === 'flying' && !Object.values(state.players).some((q) => isHelm(L, q.lock) || (q.botJob && q.botJob.kind === 'station' && isHelm(L, q.botJob.obj))) && !(state.modules || []).some((m) => m.kind === 'helm' && m.broken) && Math.random() < B.HELM_CALL;
      const fallCall = !!state.goingDown; // GOING DOWN!: everybody off their stations
      const soleGun = config.PVP.ENABLED && tables(L).GUN_STATIONS.includes(p.lock) && !bots.some((q) => q !== p && q.lock && tables(L).GUN_STATIONS.includes(q.lock)); // (Versus: the last gunner keeps his gun, a ship needs one that shoots)
      if ((p.lockLeft <= 0 && !soleGun) || gunUseless || rodCall || helmCall || fallCall || (urgent > free && !isHelm(L, p.lock) && Math.random() < B.LEAVE_FOR_EMERGENCY)) {
        p.leaveQ = true;
        p.lockLeft = undefined;
        p.botJob = null;
        p.fire = false;
        p.restCd = 2; // don't jump straight back on
        return;
      }
    } else {
      p.restCd = (p.restCd || 0) - B.THINK_EVERY;
      let job = chooseJob(state, p, bots);
      if (job && job.kind === 'station' && !isHelm(L, job.obj) && p.restCd > 0) job = null; // (the helm is never "resting")
      if (job) p.wanderTo = null;
      if (!job || !p.botJob || job.kind !== p.botJob.kind || job.obj !== p.botJob.obj) p.jobSince = performance.now();
      p.botJob = job;
      if (DR.ENABLED) maybeDare(p, state, bots, job); // (idle? maybe feel daring)
      if (p.dare) return;
    }
  }

  if (p.lock) {
    p.lockLeft = (p.lockLeft ?? B.STATION_MAX) - dt;
    p.botJob = { kind: 'station', obj: p.lock };
    operate(p, state, dt);
  } else {
    work(p, state);
  }
}

// ===================== LINKED STATIONS (links.js, prime.js; config.LINKS) =====================
// An otherwise idle bot may (1) stand beside a manned gun holding Action to prime its shell for the gunner (job 'link'),
// (2) man the Lookout when the helm is manned (the helm answers faster; see lookoutReach, a station tier), and
// (3) now and then hold the boiler surge for a few seconds when steam is comfortably high (job 'surge'), letting go before it blows.
// All of these come after fires, breaches, the helm, gas emergencies and coal/ammo chores in listJobs.
const LK = config.LINKS;
const LINK_HOLD_MS = 25000; // a loader stays beside a busy gun (it has a target) whose shell is already primed for this long, then goes elsewhere
const SURGE_GAP_MS = 30000; // bots surge at most this often
const SURGE_STOP_PRESS = 85; // ...and let go when the pressure reaches this
const SURGE_MAX_MS = 4000; // ...or after this long

function lookoutReach(state) {
  const L = mainShip(state).layout;
  const helm = Object.values(state.players).some((q) => isHelm(L, q.lock));
  return LK.ENABLED && helm && state.phase === 'flying' ? 1.2 : 3; // (ahead of an idle gun, level with a gun that has a target, while the helm is manned)
}

function linkJobs(state, bot, early) {
  const L = mainShip(state).layout;
  const out = [];
  if (!LK.ENABLED || state.phase !== 'flying' || state.ship.down || state.goingDown) return out;
  const players = Object.values(state.players);
  const mods = state.modules || [];
  const now = performance.now();
  for (const n of tables(L).GUN_STATIONS) {
    const gun = state.GUNS[n];
    const gunner = players.find((q) => q.lock === n && !(q.ko > 0));
    if (!gunner || gunner === bot || gun.ammo <= 0 || mods.some((m) => m.name === n && m.broken)) continue;
    const staying = !!bot.botJob && bot.botJob.kind === 'link' && bot.botJob.obj === n && now - (bot.jobSince || 0) < LINK_HOLD_MS;
    const busy = !!bestTarget(state, gun); // (a gun with a target uses shell after shell: that is where a loader earns its keep)
    if (gun.primed && !(staying && busy)) continue;
    if (busy === early) out.push({ kind: 'link', obj: n, max: 1, cap: 2 });
  }
  if (early) return out;
  // Surge: steam is up, the helm is flying (engines matter), nothing is on fire.
  const ship = state.ship;
  if (bot.surgeStart > 0 && !(bot.botJob && bot.botJob.kind === 'surge')) bot.surgeStart = 0; // (interrupted: forget it)
  const surging = bot.botJob && bot.botJob.kind === 'surge' && (bot.surgeStart || 0) > 0;
  const calm = L.hasKind('boiler') && !state.fires.length && !mods.some((m) => m.broken && critical(mods, m)) && players.some((q) => isHelm(L, q.lock));
  if (surging ? ship.press < SURGE_STOP_PRESS + 1 : calm && ship.press >= LK.SURGE.MIN_PRESS + 4 && ship.press <= 78 && ship.fuel > 25 && now - (state.surgeBotAt || -1e9) > SURGE_GAP_MS && ship.speed > 0.25) out.push({ kind: 'surge', obj: 'surge', max: 1 });
  return out;
}

function linkWork(p, state, job) {
  const L = mainShip(state).layout;
  if (job.kind === 'link') {
    const s = stationNamed(L, job.obj);
    if (steer(p, s.d, s.x, 20)) {
      p.jx = 0;
      p.fire = true; // hold Action: prime the shell for the gunner
    }
    return;
  }
  const b = boilerFor(state, p);
  if (!steer(p, b.d, b.x, 25)) return;
  const now = performance.now();
  if (!(p.surgeStart > 0)) p.surgeStart = now;
  p.jx = 0;
  p.fire = state.ship.press < SURGE_STOP_PRESS && now - p.surgeStart < SURGE_MAX_MS;
  if (!p.fire) {
    // Done (or it got too hot): let go, and don't surge again for a while.
    state.surgeBotAt = now;
    p.surgeStart = 0;
    p.botJob = null;
  }
}
