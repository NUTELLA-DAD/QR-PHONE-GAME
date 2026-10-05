// Test bot "brain". Bots press the same virtual buttons a phone does
// (jx/jy joystick, actQ = tap Action, fire = hold Action), so they test the real game rules.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const L = SHIP_LAYOUT;
const B = config.BOTS;
const SHELL_SPEED = 950;
const GUN_STATIONS = ['Port Cannon', 'Roof Gun'];
const MANNED_STATIONS = ['Helm', 'Boiler', ...GUN_STATIONS];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const stationNamed = (name) => L.stations.find((s) => s.n === name);
const nearestFloor = (y) => L.floors.reduce((best, f, i) => (Math.abs(f - y) < Math.abs(L.floors[best] - y) ? i : best), 0);
const floorOfY = (y) => nearestFloor(y);

// Walk/climb toward floor d at position x. Returns true when there.
function steer(p, d, x, near = 12) {
  const fy = L.floors[d];
  p.jx = 0;
  p.jy = 0;
  if (p.climb) {
    if (Math.abs(p.y - fy) > 3) p.jy = Math.sign(fy - p.y);
    return false;
  }
  if (nearestFloor(p.y) === d) {
    const dx = x - p.x;
    if (Math.abs(dx) <= near) return true;
    p.jx = Math.sign(dx) * clamp(Math.abs(dx) / 60, 0.3, 1);
    return false;
  }
  const ladder = L.ladders.reduce((best, l) => (Math.abs(p.x - l) + Math.abs(x - l) < Math.abs(p.x - best) + Math.abs(x - best) ? l : best));
  if (Math.abs(p.x - ladder) < 12) p.jy = Math.sign(fy - p.y);
  else p.jx = Math.sign(ladder - p.x) * clamp(Math.abs(ladder - p.x) / 60, 0.3, 1);
  return false;
}

// Where the enemy plane will be in t seconds (it flies a fixed looping path).
function enemyAt(enemy, t) {
  const ang = enemy.ang + 0.55 * t;
  return { x: 800 + Math.cos(ang) * 820, y: 380 + Math.sin(ang * 1.3) * 330 };
}

function enemyActive(state) {
  const e = state.enemy;
  return e.dead <= 0 && e.x > -40 && e.x < config.W + 40 && e.y > -40 && e.y < config.H;
}

// List every job on the ship, most urgent first.
function listJobs(state, bot) {
  const jobs = [];
  const players = Object.values(state.players);
  for (const b of state.boarders) if (!b.fall) jobs.push({ kind: 'fight', obj: b, max: 2 });
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall) jobs.push({ kind: 'revive', obj: q, max: 1 });
  // A bot already holding a patch kit fixes holes before fires.
  const fires = state.fires.map((f) => ({ kind: 'fire', obj: f, max: 1 }));
  const holes = bot.carry === 'ammo' ? [] : state.breaches.map((h) => ({ kind: 'patch', obj: h, max: 1 }));
  jobs.push(...(bot.carry === 'patch' ? [...holes, ...fires] : [...fires, ...holes]));
  if (bot.carry !== 'patch') {
    const guns = GUN_STATIONS.filter((n) => state.GUNS[n].ammo < state.GUNS[n].max && (bot.carry === 'ammo' || state.GUNS[n].ammo <= B.AMMO_LOW));
    guns.sort((a, b) => state.GUNS[a].ammo - state.GUNS[b].ammo);
    for (const n of guns) jobs.push({ kind: 'ammo', obj: n, max: 1 });
  }
  for (const n of MANNED_STATIONS) if (!players.some((q) => q.lock === n)) jobs.push({ kind: 'station', obj: n, max: 1 });
  return jobs;
}

function isEmergency(job) {
  return job.kind === 'fight' || job.kind === 'revive' || job.kind === 'fire' || job.kind === 'patch';
}

function chooseJob(state, bot, bots) {
  const claims = (job) => bots.filter((o) => o !== bot && o.botJob && o.botJob.kind === job.kind && o.botJob.obj === job.obj).length;
  const jobs = listJobs(state, bot).filter((j) => claims(j) < j.max);
  // Among the most urgent kind, prefer the closest.
  if (!jobs.length) return null;
  const kind = jobs[0].kind;
  const dist = (j) => {
    const o = j.obj;
    if (typeof o === 'string') return 0;
    const y = o.d !== undefined ? L.floors[o.d] : o.y;
    return Math.abs(o.x - bot.x) + Math.abs(y - bot.y) * 3;
  };
  return jobs.filter((j) => j.kind === kind).sort((a, b) => dist(a) - dist(b))[0];
}

// Work a manned station (bot is locked in).
function operate(p, state, dt) {
  p.jx = 0;
  p.jy = 0;
  p.fire = false;
  const ship = state.ship;
  if (p.lock === 'Helm') {
    p.jx = clamp((B.HELM_SPEED - ship.speed) * 4, -1, 1);
    p.jy = enemyActive(state) ? Math.sin(performance.now() / 700 + p.phase) * 0.7 : clamp(ship.alt / 40, -1, 1);
  } else if (p.lock === 'Boiler') {
    if (ship.press < B.BOILER_LOW) p.stoking = true;
    if (ship.press > B.BOILER_HIGH) p.stoking = false;
    p.fire = !!p.stoking;
  } else {
    const gun = state.GUNS[p.lock];
    if (!gun || !enemyActive(state)) return;
    const gx = gun.bx;
    const gy = gun.by - ship.alt;
    // Lead the target: guess flight time, predict, refine once.
    let target = state.enemy;
    for (let i = 0; i < 2; i++) target = enemyAt(state.enemy, Math.hypot(target.x - gx, target.y - gy) / SHELL_SPEED);
    const angle = Math.atan2(target.y - gy, target.x - gx);
    p.jx = Math.cos(angle);
    p.jy = Math.sin(angle);
    const off = Math.abs(Math.atan2(Math.sin(angle - gun.aim), Math.cos(angle - gun.aim)));
    p.fire = gun.ammo > 0 && off < B.AIM_TOLERANCE;
  }
}

function press(p) {
  if ((p.pressCd || 0) <= 0) {
    p.actQ = true;
    p.pressCd = 0.4;
  }
}

// Carry out the current job for one frame.
function work(p, state) {
  const job = p.botJob;
  p.fire = false;
  if (!job) return wander(p);
  const o = job.obj;
  if (job.kind === 'fight') {
    if (steer(p, floorOfY(o.y), o.x, 45) || (Math.abs(o.y - p.y) < 20 && Math.abs(o.x - p.x) < 70)) {
      p.jx = 0;
      p.face = o.x < p.x ? -1 : 1;
      if ((p.whackCd || 0) <= 0) {
        p.actQ = true;
        p.whackCd = B.WHACK_EVERY;
      }
    }
  } else if (job.kind === 'revive') {
    if (steer(p, floorOfY(o.y), o.x, 30)) p.fire = true;
  } else if (job.kind === 'fire') {
    if (steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'patch') {
    if (p.carry !== 'patch') {
      const s = stationNamed('Repairs');
      if (steer(p, s.d, s.x)) press(p);
    } else if (steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'ammo') {
    const s = p.carry === 'ammo' ? stationNamed(o) : stationNamed('Ammo Hold');
    if (steer(p, s.d, s.x)) press(p);
  } else if (job.kind === 'station') {
    const s = stationNamed(o);
    if (steer(p, s.d, s.x)) press(p);
  }
}

function wander(p) {
  if (!p.wanderTo || (p.wanderWait !== undefined && p.wanderWait <= 0)) {
    p.wanderTo = { d: (Math.random() * L.floors.length) | 0, x: L.hull.x0 + 40 + Math.random() * (L.hull.x1 - L.hull.x0 - 80) };
    p.wanderWait = undefined;
  }
  if (steer(p, p.wanderTo.d, p.wanderTo.x) && p.wanderWait === undefined) p.wanderWait = 1 + Math.random() * 2;
}

// Called once per frame for each bot, before the game applies its input.
export function updateBot(p, state, dt) {
  p.pressCd = (p.pressCd || 0) - dt;
  p.whackCd = (p.whackCd || 0) - dt;
  if (p.wanderWait !== undefined) p.wanderWait -= dt;
  if (p.phase === undefined) p.phase = Math.random() * 6.28;
  if (p.fall || p.ko > 0) {
    p.botJob = null;
    p.jx = p.jy = 0;
    p.fire = false;
    return;
  }

  const bots = Object.values(state.players).filter((q) => q.bot);
  if ((p.think = (p.think || 0) - dt) <= 0) {
    p.think = B.THINK_EVERY;
    if (p.lock) {
      // Rotate off stations now and then, and leave early if fires/holes/raiders outnumber free hands.
      const free = bots.filter((q) => !q.lock && !(q.ko > 0)).length;
      const urgent = listJobs(state, p).filter(isEmergency).length;
      if (p.lockLeft === undefined) p.lockLeft = B.STATION_MIN + Math.random() * (B.STATION_MAX - B.STATION_MIN);
      if (p.lockLeft <= 0 || (urgent > free && p.lock !== 'Helm' && Math.random() < B.LEAVE_FOR_EMERGENCY)) {
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
      if (job && job.kind === 'station' && p.restCd > 0) job = null;
      if (job) p.wanderTo = null;
      p.botJob = job;
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
