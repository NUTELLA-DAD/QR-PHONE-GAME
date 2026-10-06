// Test bot "brain". Bots press the same virtual buttons a phone does
// (jx/jy joystick, actQ = tap Action, fire = hold Action), so they test the real game rules.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { steerTo, travelTime } from './nav.js';
import { bestTarget, targets } from './aim.js';
import { altWindow, altBounds, pilotPlan, gasFor } from './course.js';
import { GS, MAIN_X1, landX, boilerX } from './gunship.js';
import { isEscortStation, escortFor } from './escort.js';

const MAIN = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'main');

const L = SHIP_LAYOUT;
const B = config.BOTS;
const GUN_STATIONS = Object.keys(L.gunMounts);
const MANNED_STATIONS = ['Helm', 'Escort Fighter', 'Escort Fighter 2', 'Deflector', 'Lightning Coil', ...GUN_STATIONS, 'Bomb Bay', 'Lookout'];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const stationNamed = (name) => L.stations.find((s) => s.n === name);

let world = null; // the game state (set each bot update), so steer() knows about the gunship

// Walk/climb toward platform d at position x. Returns true when there.
// To get to (or back from) a gunship alongside, swing across the gap on the line.
function steer(p, d, x, near = 12) {
  const g = world && world.gunship;
  if (g && d === MAIN && p.d === MAIN && !p.swing) {
    const mid = (MAIN_X1 + GS.x0) / 2; // targets past this are on her deck (her home frame)
    if (x > mid !== !!p.onGunship) {
      // Wrong side: walk to the swing spot, and swing only while the rope is hooked and in range.
      const edge = p.onGunship ? landX(g) : MAIN_X1 - 15;
      const step = steerTo(p, MAIN, edge, 12);
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
  const M = L.coil;
  const ex = M.x;
  const ey = M.y - 60 - state.ship.alt;
  const angles = [];
  for (const t of targets(state)) {
    const p = t.at(0);
    if (Math.hypot(p.x - ex, p.y - ey) > config.COIL.RANGE) continue;
    const a = Math.atan2(p.y - ey, p.x - ex);
    if (Math.abs(Math.atan2(Math.sin(a - M.aim), Math.cos(a - M.aim))) <= M.arc) angles.push(a);
  }
  let best = { angle: M.aim, count: 0 };
  for (const a of angles) {
    const count = angles.filter((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.09).length;
    if (count > best.count) best = { angle: a, count };
  }
  return best;
}

// The nearest bullet, bat, rocket or bomb coming at the ship (for the Deflector), or null.
function incoming(state) {
  const S = L.shield;
  let best = null;
  let bestD = 1600;
  const consider = (x, y) => {
    const d = Math.hypot((x - S.cx) * 0.7, y + state.ship.alt - S.cy);
    if (d < bestD) (bestD = d), (best = { x, y });
  };
  for (const b of state.bullets) if (!b.miss) consider(b.x, b.y);
  for (const b of state.bats || []) if (b.delay <= 0 && !b.dead && !b.latched) consider(b.x, b.y);
  for (const k of state.rockets || []) if (k.hp > 0) consider(k.x, k.y);
  for (const b of state.enemyBombs || []) if (!b.dead) consider(b.x, b.y);
  return best;
}

// How useful manning a gun is right now: one that can hit a ground target (outposts) ranks
// highest, then any gun with something in reach.
function gunReach(state, n) {
  const best = bestTarget(state, state.GUNS[n]);
  // Paratroopers are about to jump (or are in the air): get up to the dorsal gun, it covers their approach.
  if (!best && n === 'Dorsal Gun' && state.gunship && (state.paras.length || state.gunship.paraDue)) return 0.7;
  if (!best) return 2;
  if (best.target.kind === 'para' || best.target.kind === 'gport') return 0.6; // paratroopers and gunship gun ports are worth manning a gun for
  return best.target.kind === 'turret' ? 0.8 : 1;
}

// Things below and ahead worth bombing, as world x ranges: live turrets and buildings.
function groundTargets(state) {
  const c = state.course;
  if (!c) return [];
  const out = [];
  for (const t of c.turrets) if (!t.dead && t.x != null && t.x > -600 && t.x < 3200) out.push([t.x - 30, t.x + 30]);
  for (const f of c.features) for (const b of f.blocks || []) if (b.x1 - c.dist > -600 && b.x0 - c.dist < 3200) out.push([b.x0 - c.dist, b.x1 - c.dist]);
  return out;
}

// A sniper about to fire with its line across the ship: climb or dive out of it.
function beamDodge(state) {
  for (const z of (state.specials && state.specials.snipers) || []) {
    if (!(z.mode === 'lock' || (z.mode === 'charge' && z.t < 1.2))) continue;
    const cy = L.shield.cy - state.ship.alt;
    const lineY = z.y + Math.tan(z.aim) * (L.shield.cx - z.x);
    if (Math.abs(Math.cos(z.aim)) < 0.2 || Math.abs(lineY - cy) > 520) continue;
    return state.ship.alt + (lineY > cy ? 380 : -380);
  }
  return null;
}

function dodgeAltitude(state) {
  const R = config.MINES.RADIUS;
  let soonest = null;
  for (const m of state.mines || []) {
    if (m.x < L.bounds.x0 || m.vx >= 0) continue;
    const t = (m.x - L.bounds.x1) / -m.vx;
    if (t > 6) continue;
    const rel = m.y + state.ship.alt;
    let target = null;
    if (rel > -10 - R && rel < 330) target = -10 - R - 30 - m.y; // dive under it
    else if (rel > 700 && rel < L.bounds.y1 + R) target = L.bounds.y1 + R + 30 - m.y; // climb over it
    const bounds = altBounds(state);
    if (target !== null && target >= bounds.lo && target <= bounds.hi && (!soonest || t < soonest.t)) soonest = { t, target };
  }
  return soonest && soonest.target;
}

// List every job on the ship, most urgent first.
function listJobs(state, bot) {
  const jobs = [];
  const players = Object.values(state.players);
  const mods = state.modules || [];
  for (const b of state.boarders) if (!b.fall) jobs.push({ kind: 'fight', obj: b, max: 2 });
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall) jobs.push({ kind: 'revive', obj: q, max: 1 });
  // Bats latched on the ship: swat them before they chew holes (bare hands are enough).
  for (const b of state.bats || []) if (b.latched && b.landed && b.hp > 0) jobs.push({ kind: 'swat', obj: b, max: 1 });
  // Vents: open one when the pressure is near the top; close them when it's calm again.
  const ventWanted = state.ship.press > config.BOILER.WARN_AT - 3;
  const ventCalm = state.ship.press < config.BOILER.WARN_AT - 14;
  const ventIdx = state.ventOpen.findIndex((open) => (ventWanted ? !open : ventCalm && open));
  if ((ventWanted || ventCalm) && ventIdx >= 0) jobs.push({ kind: 'vent', obj: L.vents[ventIdx], max: 1 });
  for (const bomb of state.bombs || []) jobs.push({ kind: 'defuse', obj: bomb, max: 1 });
  const fires = state.fires.map((f) => ({ kind: 'fire', obj: f, max: 1 }));
  const holes = [...state.breaches, ...(state.gasHoles || [])].map((h) => ({ kind: 'patch', obj: h, max: 1 }));
  // Burst pipes with their valve open leak steam: shut the valve, then fix what's broken.
  const leaks = mods.filter((m) => m.kind === 'pipe' && m.broken && m.open).map((m) => ({ kind: 'valve', obj: m, max: 1 }));
  // Steam is short and a damaged module is leaking it? Shut that module's valve - unless it is
  // vital while flying (helm, engines). It is reopened once the module is repaired.
  const leaky = (m) => m.kind === 'pipe' && !m.broken && mods.some((t) => t.name === m.to && t.hp < t.max * config.MODULES.LEAK_BELOW);
  const flying = state.phase === 'flying';
  if (state.ship.press < B.ENGINEER_PRESS) {
    for (const m of mods) if (m.open && leaky(m) && !(flying && (m.to === 'Helm' || /Engine/.test(m.to)))) leaks.push({ kind: 'valve', obj: m, max: 1 });
  }
  const broken = mods.filter((m) => m.broken).map((m) => ({ kind: 'repair', obj: m, max: 1 }));
  // Use the tool already in hand first.
  if (bot.carry === 'hammer') jobs.push(...leaks, ...broken, ...holes, ...fires);
  else jobs.push(...fires, ...leaks, ...broken, ...holes);
  for (const m of mods) if (m.kind === 'pipe' && !m.broken && !m.open && (!leaky(m) || state.ship.press >= B.ENGINEER_PRESS + 25)) jobs.push({ kind: 'valve', obj: m, max: 1 });
  // Stations, most useful first. The vital ones (helm, gas valve, a gun or weapon with a target
  // right now) come before chores like topping up coal or patching dents.
  const isBroken = (n) => mods.some((m) => m.name === n && m.broken);
  const botPlanes = players.filter((q) => q.bot && isEscortStation(q.lock)).length; // the crew can only spare so many for the patrol planes
  const reach = (n) => (isEscortStation(n) ? ((e) => (e && e.rebuild <= 0 && (e.docked || e.auto) && botPlanes < config.ESCORT.BOT_MAX && !state.escortCramped && targets(state).length ? 0.6 : 4))(escortFor(state, n)) : n === 'Lookout' ? 3 : n === 'Deflector' ? (incoming(state) ? 0.6 : 4) : n === 'Lightning Coil' ? (coilShot(state).count >= 3 ? 0.7 : 4) : n === 'Bomb Bay' ? (groundTargets(state).length && state.bombBay.bombs > 0 ? 0.5 : 4) : !GUN_STATIONS.includes(n) ? 0 : gunReach(state, n));
  const open = MANNED_STATIONS.filter((n) => !isBroken(n) && !players.some((q) => q.lock === n)).sort((a, b) => reach(a) - reach(b));
  for (const n of open) if (reach(n) <= 0.8) jobs.push({ kind: 'station', obj: n, max: 1, tier: reach(n) });
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
  if ((state.ship.fuel < (pushing ? 60 : 25) && state.ship.press < config.BOILER.WARN_AT - (pushing ? 10 : 25)) || bot.carry === 'coal') jobs.push({ kind: 'coal', obj: 'coal', max: state.ship.press < 30 ? 2 : 1 });
  for (const m of mods) if (!m.broken && m.hp < (['engine', 'helm', 'lift', 'shield', 'coil'].includes(m.kind) ? m.max * config.MODULES.LEAK_BELOW - 1 : 60)) jobs.push({ kind: 'repair', obj: m, max: 1 });
  const guns = GUN_STATIONS.filter((n) => state.GUNS[n].ammo < state.GUNS[n].max && (bot.carry === 'ammo' || state.GUNS[n].ammo <= B.AMMO_LOW));
  guns.sort((a, b) => state.GUNS[a].ammo - state.GUNS[b].ammo);
  // Bombing run coming up (an outpost to destroy is near): bombs are the weapon that matters,
  // so loading the bay comes before topping up the guns.
  const c = state.course;
  const bombRun = !!(c && c.map && c.map.open && !c.done && c.target && Math.hypot(c.target.x - (c.dist + 800), c.target.y - (500 - state.ship.alt)) < config.MAPS.BOMB_RUN_RANGE);
  if (bombRun && state.bombBay && state.bombBay.bombs < config.MAPS.BOMB_RUN_STOCK) jobs.push({ kind: 'ammo', obj: 'Bomb Bay', max: 1 });
  for (const n of guns) jobs.push({ kind: 'ammo', obj: n, max: 1 });
  if (!bombRun && state.bombBay && state.bombBay.bombs < 2 && (!guns.length || bot.carry === 'ammo')) jobs.push({ kind: 'ammo', obj: 'Bomb Bay', max: 1 });
  for (const n of open) if (reach(n) > 0.8) jobs.push({ kind: 'station', obj: n, max: 1, tier: reach(n) });
  // Hovering over an outpost with bombs aboard: one bot drops everything and mans the bomb bay.
  if (bombRun && c.target && Math.hypot(c.target.x - (c.dist + 800), c.target.y - (500 - state.ship.alt)) < config.MAPS.BOMB_RUN_MAN && state.bombBay.bombs > 0 && !isBroken('Bomb Bay') && !players.some((q) => q.lock === 'Bomb Bay')) jobs.unshift({ kind: 'station', obj: 'Bomb Bay', max: 1 });
  return jobs;
}

function isEmergency(job) {
  return job.kind !== 'ammo' && job.kind !== 'station' && job.kind !== 'coal' && !(job.kind === 'repair' && !job.obj.broken);
}

function chooseJob(state, bot, bots) {
  const claims = (job) => bots.filter((o) => o !== bot && o.botJob && o.botJob.kind === job.kind && o.botJob.obj === job.obj).length;
  const jobs = listJobs(state, bot).filter((j) => claims(j) < j.max);
  // Among the most urgent kind, prefer the closest.
  if (!jobs.length) return null;
  const kind = jobs[0].kind;
  // Walking time (slide poles, ladders and stairs included) to the job, as pixels of walking.
  const dist = (j) => {
    let o = j.obj;
    if (typeof o === 'string') o = j.kind === 'station' ? stationNamed(o) : null;
    if (!o) return 0;
    if (o.d == null) return Math.abs(o.x - bot.x) + Math.abs(o.y - bot.y) * 3;
    if (bot.d == null) return 0;
    return travelTime(bot, o.d, o.x) * config.MOVE.WALK_SPEED;
  };
  // (Stations come in order of usefulness: weigh that over walking distance.)
  // (how useful it is counts for more than how far it is - but stations of EQUAL use go to whoever is nearest.)
  const rank = (j) => (kind === 'station' ? (j.tier ?? 1) * B.STATION_TIER_PX : 0);
  return jobs.filter((j) => j.kind === kind).sort((a, b) => rank(a) + dist(a) - rank(b) - dist(b))[0];
}

// Work a manned station (bot is locked in).
function operate(p, state, dt) {
  p.jx = 0;
  p.jy = 0;
  p.fire = false;
  const ship = state.ship;
  if (isEscortStation(p.lock)) {
    // Fly the escort fighter at the nearest enemy (or let her circle the ship if there's none).
    const esc = escortFor(state, p.lock);
    const list = esc && esc.flying ? targets(state).map((t) => ({ t, q: t.at(0.4) })).sort((a, b) => Math.hypot(a.q.x - esc.x, a.q.y - esc.y) - Math.hypot(b.q.x - esc.x, b.q.y - esc.y)) : [];
    if (list.length) {
      const q = list[0].q;
      const d = Math.hypot(q.x - esc.x, q.y - esc.y) || 1;
      p.jx = (q.x - esc.x) / d;
      p.jy = (q.y - esc.y) / d;
    } else p.jx = p.jy = 0;
    p.gunIdle = list.length ? 0 : (p.gunIdle || 0) + dt;
    return;
  }
  if (p.lock === 'Helm') {
    // Terrain first: keep inside the safe altitude window, stopping to climb cliffs.
    const plan = pilotPlan(state, 2.5, B.HELM_SPEED);
    p.jx = clamp((plan.speed - ship.speed) * 4, -1, 1);
    const w = altWindow(state, 2.5);
    const bounds = altBounds(state);
    const lo = Math.max(w.min, bounds.lo);
    const hi = Math.min(w.max, bounds.hi);
    let target = null;
    const dodge = beamDodge(state) ?? dodgeAltitude(state);
    if (lo > hi || Math.abs(plan.target - ship.alt) > 120) target = plan.target;
    else if (dodge !== null && dodge > lo && dodge < hi) target = dodge;
    else if (ship.alt < lo + 15 || ship.alt > hi - 15) target = plan.target;
    // (Gentle enough not to overshoot now that she glides with momentum.)
    if (target !== null) p.jy = clamp((ship.alt - target) / 90 + (ship.vy || 0) / 260, -1, 1);
    else if (hi - lo > 250 && enemyActive(state)) p.jy = Math.sin(performance.now() / 700 + p.phase) * 0.7;
    else p.jy = 0;
    // The PRESSURE lever: pump or vent the gasbag toward the altitude the plan wants.
    p.gas = gasFor(state, beamDodge(state) ?? plan.target);
  } else if (p.lock === 'Lightning Coil') {
    // Aim at the thickest bunch of enemies and charge while lined up.
    const shot = coilShot(state);
    p.gunIdle = shot.count >= 2 ? 0 : (p.gunIdle || 0) + dt;
    if (shot.count) {
      p.jx = Math.cos(shot.angle);
      p.jy = Math.sin(shot.angle);
      const off = Math.abs(Math.atan2(Math.sin(shot.angle - state.coil.aim), Math.cos(shot.angle - state.coil.aim)));
      p.fire = off < 0.1 && state.coil.cd <= 0;
    }
  } else if (p.lock === 'Deflector') {
    // Swing the shield toward the nearest thing heading for the ship.
    const t = incoming(state);
    p.gunIdle = t ? 0 : (p.gunIdle || 0) + dt;
    if (t) {
      const S = L.shield;
      const a = Math.atan2((t.y + state.ship.alt - S.cy) / S.ry, (t.x - S.cx) / S.rx);
      p.jx = Math.cos(a);
      p.jy = Math.sin(a);
    }
  } else if (p.lock === 'Bomb Bay') {
    // Drop when the aiming ring sits on a turret or building; leave when there's nothing to bomb.
    const aim = state.bombBay.aim;
    const targets = groundTargets(state);
    p.gunIdle = targets.length && state.bombBay.bombs > 0 ? 0 : (p.gunIdle || 0) + dt;
    p.fire = !!aim && targets.some(([x0, x1]) => aim.x > x0 - 70 && aim.x < x1 + 70);
  } else {
    const gun = state.GUNS[p.lock];
    if (!gun) return;
    const angle = firingSolution(state, gun);
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
function getTool(p, kind, to) {
  if (p.carry === kind) return true;
  // (the rack that makes the whole trip - rack, then the job - shortest)
  const cost = (r) => (p.d == null ? 0 : travelTime(p, r.d, r.x) + (to && to.d != null ? travelTime({ d: r.d, x: r.x, conn: null }, to.d, to.x) : 0));
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
  if (job.kind === 'hook') {
    if (steer(p, MAIN, MAIN_X1 - 15, 12)) press(p);
    return;
  }
  if (job.kind === 'cutline') {
    if (steer(p, MAIN, MAIN_X1 - 110, 25)) p.fire = true; // hold Action at the bow to hack her line
    return;
  }
  if (job.kind === 'raid') {
    if (steer(p, MAIN, boilerX(state.gunship), 30)) p.fire = true;
    return;
  }
  if (job.kind === 'flee') {
    steer(p, MAIN, 1250, 30);
    return;
  }
  if (job.kind === 'fight') {
    const crew = state.gunship && state.gunship.crew.includes(o);
    if (o.fall || !(state.boarders.includes(o) || crew) || !getTool(p, 'sword')) return;
    if (steer(p, goalOf(o), o.x, 45) || (Math.abs(o.y - p.y) < 20 && Math.abs(o.x - p.x) < 70)) {
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
  } else if (job.kind === 'vent') {
    // Walk to the vent and flip it.
    if (steer(p, o.d, o.x, 10)) press(p);
  } else if (job.kind === 'coal') {
    const s = p.carry === 'coal' ? stationNamed('Boiler') : stationNamed('Coal Bunker');
    if (steer(p, s.d, s.x)) press(p);
  } else if (job.kind === 'defuse') {
    if (steer(p, o.d, o.x, 25)) p.fire = true;
  } else if (job.kind === 'revive') {
    if (steer(p, goalOf(o), o.x, 30)) p.fire = true;
  } else if (job.kind === 'fire') {
    if (getTool(p, 'extinguisher', o) && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'patch') {
    if (getTool(p, 'hammer', o) && steer(p, o.d, o.x, 30)) p.fire = true;
  } else if (job.kind === 'repair') {
    if (getTool(p, 'hammer', o) && steer(p, o.d, o.x, 20)) p.fire = true;
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
    // Mostly amble about the deck they are on (less pointless walking), now and then go somewhere else.
    const d = p.d != null && Math.random() < 0.75 ? p.d : (Math.random() * L.platforms.length) | 0;
    const plat = L.platforms[d];
    p.wanderTo = { d, x: plat.x0 + 20 + Math.random() * ((plat.id === 'main' ? MAIN_X1 : plat.x1) - plat.x0 - 40) };
    p.wanderWait = undefined;
  }
  if (steer(p, p.wanderTo.d, p.wanderTo.x) && p.wanderWait === undefined) p.wanderWait = 1 + Math.random() * 2;
}

// Called once per frame for each bot, before the game applies its input.
export function updateBot(p, state, dt) {
  world = state;
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

  // Hop over a fire that is in the way (not the one they are going to put out).
  if (!p.lock && !p.air && p.conn == null && Math.abs(p.jx) > 0.3 && state.fires.some((f) => f.d === p.d && f !== (p.botJob && p.botJob.obj) && (f.x - p.x) * p.jx > 0 && Math.abs(f.x - p.x) < 90 && Math.abs(f.x - p.x) > 50)) p.jumpQ = true;

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
      // Never wander off the helm while there's terrain to steer through.
      if (p.lock === 'Helm' && config.COURSE.ENABLED) p.lockLeft = Math.max(p.lockLeft, 1);
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
