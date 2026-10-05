// Test bot "brain". Bots press the same virtual buttons a phone does
// (jx/jy joystick, actQ = tap Action, fire = hold Action), so they test the real game rules.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { steerTo } from './nav.js';
import { enemyAt } from './enemy.js';

const L = SHIP_LAYOUT;
const B = config.BOTS;
const SHELL_SPEED = 950;
const GUN_STATIONS = Object.keys(L.gunMounts);
const MANNED_STATIONS = ['Helm', 'Boiler', ...GUN_STATIONS];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const stationNamed = (name) => L.stations.find((s) => s.n === name);

// Walk/climb toward platform d at position x. Returns true when there.
function steer(p, d, x, near = 12) {
  const step = steerTo(p, d, x, near);
  p.jx = step.jx;
  p.jy = step.jy;
  return step.arrived;
}

const enemyActive = (state) => state.enemy.dead <= 0;

// Where a gun must point to hit the enemy (leading the target). null if out of its arc.
function firingSolution(state, gun) {
  const gx = gun.bx;
  const gy = gun.by - state.ship.alt;
  let target = state.enemy;
  for (let i = 0; i < 2; i++) target = enemyAt(state.enemy, Math.hypot(target.x - gx, target.y - gy) / SHELL_SPEED);
  const angle = Math.atan2(target.y - gy, target.x - gx);
  return Math.abs(angleDiff(angle, gun.home)) <= gun.arc ? angle : null;
}

// List every job on the ship, most urgent first.
function listJobs(state, bot) {
  const jobs = [];
  const players = Object.values(state.players);
  const mods = state.modules || [];
  for (const b of state.boarders) if (!b.fall) jobs.push({ kind: 'fight', obj: b, max: 2 });
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall) jobs.push({ kind: 'revive', obj: q, max: 1 });
  const fires = state.fires.map((f) => ({ kind: 'fire', obj: f, max: 1 }));
  const holes = state.breaches.map((h) => ({ kind: 'patch', obj: h, max: 1 }));
  // Burst pipes with their valve open leak steam: shut the valve, then fix what's broken.
  const leaks = mods.filter((m) => m.kind === 'pipe' && m.broken && m.open).map((m) => ({ kind: 'valve', obj: m, max: 1 }));
  const broken = mods.filter((m) => m.broken).map((m) => ({ kind: 'repair', obj: m, max: 1 }));
  // Use the tool already in hand first.
  if (bot.carry === 'hammer') jobs.push(...leaks, ...broken, ...holes, ...fires);
  else jobs.push(...fires, ...leaks, ...broken, ...holes);
  for (const m of mods) if (m.kind === 'pipe' && !m.broken && !m.open) jobs.push({ kind: 'valve', obj: m, max: 1 });
  for (const m of mods) if (!m.broken && m.hp < 60) jobs.push({ kind: 'repair', obj: m, max: 1 });
  const guns = GUN_STATIONS.filter((n) => state.GUNS[n].ammo < state.GUNS[n].max && (bot.carry === 'ammo' || state.GUNS[n].ammo <= B.AMMO_LOW));
  guns.sort((a, b) => state.GUNS[a].ammo - state.GUNS[b].ammo);
  for (const n of guns) jobs.push({ kind: 'ammo', obj: n, max: 1 });
  // Helm and boiler first, then guns that can reach the enemy right now. Skip broken ones.
  const isBroken = (n) => mods.some((m) => m.name === n && m.broken);
  const reach = (n) => (!GUN_STATIONS.includes(n) ? 0 : enemyActive(state) && firingSolution(state, state.GUNS[n]) !== null ? 1 : 2);
  const open = MANNED_STATIONS.filter((n) => !isBroken(n) && !players.some((q) => q.lock === n)).sort((a, b) => reach(a) - reach(b));
  for (const n of open) jobs.push({ kind: 'station', obj: n, max: 1 });
  return jobs;
}

function isEmergency(job) {
  return job.kind !== 'ammo' && job.kind !== 'station' && !(job.kind === 'repair' && !job.obj.broken);
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
    const y = o.d != null ? L.platforms[o.d].y : o.y;
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
    if (!gun) return;
    const angle = enemyActive(state) ? firingSolution(state, gun) : null;
    // Count how long the enemy has been out of this gun's reach.
    p.gunIdle = angle === null ? (p.gunIdle || 0) + dt : 0;
    if (angle === null) return;
    p.jx = Math.cos(angle);
    p.jy = Math.sin(angle);
    const off = Math.abs(Math.atan2(Math.sin(angle - gun.aim), Math.cos(angle - gun.aim)));
    p.fire = gun.ammo > 0 && off < B.AIM_TOLERANCE;
  }
}

// The platform someone is on (or the nearer end of what they're climbing).
function goalOf(o) {
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

const PICKUPS = [...L.racks, ...L.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))];

// Make sure the bot holds a tool; walks to the nearest rack/hook for it if not. True when held.
function getTool(p, kind) {
  if (p.carry === kind) return true;
  const cost = (r) => Math.abs(r.x - p.x) + Math.abs(L.platforms[r.d].y - p.y) * 3;
  const rack = PICKUPS.filter((r) => r.kind === kind).sort((a, b) => cost(a) - cost(b))[0];
  if (steer(p, rack.d, rack.x)) press(p);
  return false;
}

// Carry out the current job for one frame.
function work(p, state) {
  const job = p.botJob;
  p.fire = false;
  if (!job) return wander(p);
  const o = job.obj;
  if (job.kind === 'fight') {
    if (o.fall || !getTool(p, 'sword')) return;
    if (steer(p, goalOf(o), o.x, 45) || (Math.abs(o.y - p.y) < 20 && Math.abs(o.x - p.x) < 70)) {
      p.jx = 0;
      p.face = o.x < p.x ? -1 : 1;
      if ((p.whackCd || 0) <= 0) {
        p.atkQ = true;
        p.whackCd = B.WHACK_EVERY;
      }
    }
  } else if (job.kind === 'revive') {
    if (steer(p, goalOf(o), o.x, 30)) p.fire = true;
  } else if (job.kind === 'fire') {
    if (getTool(p, 'extinguisher') && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'patch') {
    if (getTool(p, 'hammer') && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'repair') {
    if (getTool(p, 'hammer') && steer(p, o.d, o.x, 20)) p.fire = true;
  } else if (job.kind === 'valve') {
    if (steer(p, o.d, o.x, 10)) press(p);
  } else if (job.kind === 'ammo') {
    const s = p.carry === 'ammo' ? stationNamed(o) : stationNamed('Ammo Hold');
    if (steer(p, s.d, s.x)) press(p);
  } else if (job.kind === 'station') {
    const s = stationNamed(o);
    if (steer(p, s.d, s.x)) {
      // Fix it up on the way in if we happen to have a hammer.
      const m = (state.modules || []).find((q) => q.name === o);
      if (p.carry === 'hammer' && m && m.hp < m.max) p.fire = true;
      else press(p);
    }
  }
}

function wander(p) {
  if (!p.wanderTo || (p.wanderWait !== undefined && p.wanderWait <= 0)) {
    const d = (Math.random() * L.platforms.length) | 0;
    const plat = L.platforms[d];
    p.wanderTo = { d, x: plat.x0 + 20 + Math.random() * (plat.x1 - plat.x0 - 40) };
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
      const mod = (state.modules || []).find((m) => m.name === p.lock);
      const gunUseless = (p.gunIdle || 0) > 6 || (mod && mod.broken);
      if (gunUseless) p.gunIdle = 0;
      if (p.lockLeft <= 0 || gunUseless || (urgent > free && p.lock !== 'Helm' && Math.random() < B.LEAVE_FOR_EMERGENCY)) {
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
