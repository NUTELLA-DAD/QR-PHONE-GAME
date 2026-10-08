// THE CREW CANNON (B.6, config.CROSS.CANNON): a big brass cannon on an open deck that fires a CREW MEMBER across the sky, to board an enemy ship (the gunship, a Versus rival), to reach a far deck, or just to be
// seen. The part (shipBuild.js crewCannon) is two stations and the cannon itself:
//   the SEAT  (kind 'cannonSeat', in the barrel)  one crewman climbs in: Action at the cannon while the seat is empty (the usual "Take <station>")
//   the POST  (kind 'cannon', behind the barrel)  a second crewman aims with the stick and HOLDS to charge; letting go fires. Nobody at the post: the one in the barrel aims with the stick and fires
//                                                 himself with Action (a weaker shot, CANNON.SOLO_POWER).
// The flyer leaves the muzzle as an AIRBORNE world object (airborne.js, p.cannon = true) with the cannon's world velocity (pose.vx / vy) plus the launch speed along the aimed direction (aimToWorld). He can steer a
// little with the stick, grab a ladder, and open his parachute with Action; he lands on the first deck of ANY ship he passes down through (the enemy gunship's or a Versus rival's means boarding her: simulation.js
// boardShip; a friendly ship's means he walks off her deck as her crew), or falls past and wakes in the medical bay as ever. A shot costs steam pressure and the cannon reloads (CANNON.COOLDOWN).
//   const cannon = createCannon({ state, ship, air, modules, puff, phoneFx, stat })   state = the ship's context
//   cannon.update(dt)                       per step: reload, the barrel's recoil, a stale charge
//   cannon.gunner(player, dt) / cannon.seat(player, dt)   the two stations, run from shipSim.js stepCrew for a locked player
//   cannon.phone(player)                    { label, hold, status } for the phone
//   solveShot(ship, c, target, opts)        the bots' aim: the barrel angle and power that put a crewman on a deck of `target` (pure: only reads poses)
import { config } from '../../config.js';
import { aimToWorld, toWorldX, toWorldY } from './pose.js';
import { kickForce } from './forces.js';
import { pop } from './popups.js';
import { cannonSeatName } from './shipBuild.js';
import { areHostile } from './ships.js';

const K = () => config.CROSS.CANNON;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Where the crewman leaves the barrel, in ship coordinates (the barrel's pivot stands 52 px above its deck).
export const muzzleOf = (ship, c, aim) => ({ x: c.x + Math.cos(aim) * K().MUZZLE, y: ship.layout.platforms[c.d].y - 52 + Math.sin(aim) * K().MUZZLE });

// Fly a crewman fired from cannon `c` of `sh` at barrel angle `aim` (ship space) and power 0..1 with the airborne.js physics (gravity, the cannon flyer's drag, the air streaming past the ship); returns the first deck of
// `target` he comes down on as { d, t, x, margin } (margin = px to the nearer end of that deck), or null. The target's own motion is carried along. Pure.
export function shotLands(sh, c, aim, power, target) {
  const k = K(), A = config.AIR, dt = 1 / 30;
  const m = muzzleOf(sh, c, aim);
  let x = toWorldX(sh, m.x), y = toWorldY(sh, m.y);
  const ang = aimToWorld(sh, aim + (sh.state.pitch || 0)), sp = k.SPEED * power;
  let vx = Math.cos(ang) * sp + sh.pose.vx, vy = Math.sin(ang) * sp + sh.pose.vy;
  const drift = sh.pose.vx - sh.pose.f * Math.max(0, sh.state.speed || 0) * A.SHIP_DRIFT;
  const decks = target.layout.platforms.map((pl, d) => { const a = toWorldX(target, pl.x0), b = toWorldX(target, pl.x1); return { d, lo: Math.min(a, b), hi: Math.max(a, b), y: toWorldY(target, pl.y) }; });
  for (let t = 0; t < 4.5; t += dt) {
    vx -= (vx - drift) * Math.min(1, k.DRAG * dt);
    vy = Math.min(A.MAX_FALL, vy + A.GRAVITY * dt);
    const py = y;
    x += vx * dt;
    y += vy * dt;
    if (t < k.NO_LAND || vy < 0) continue;
    const mv = target.pose.vx * (t + dt), mvy = target.pose.vy * (t + dt), pv = target.pose.vy * t;
    for (const D of decks) {
      if (!(py < D.y + pv && y >= D.y + mvy)) continue;
      const lo = D.lo + mv, hi = D.hi + mv;
      if (x >= lo && x <= hi) return { d: D.d, t, x, margin: Math.min(x - lo, hi - x) };
    }
  }
  return null;
}

// The barrel angle and power that put a crewman on a deck of `target`: { aim, power, charge (0..1 of the hold), t, d, x, margin } or null. solo: only the one-man shot's power. Searches the arc and the powers.
export function solveShot(sh, c, target, { solo = false } = {}) {
  const k = K();
  const powers = solo ? [k.SOLO_POWER] : Array.from({ length: k.SOLVE_POWERS }, (_, i) => k.MIN_POWER + ((1 - k.MIN_POWER) * i) / Math.max(1, k.SOLVE_POWERS - 1));
  let best = null;
  for (let i = 0; i <= k.SOLVE_ANGLES; i++) {
    const aim = c.aim - c.arc + (2 * c.arc * i) / k.SOLVE_ANGLES;
    for (const power of powers) {
      const hit = shotLands(sh, c, aim, power, target);
      if (!hit || hit.margin < 20) continue;
      const score = Math.min(hit.margin, 160) - power * 40;
      if (!best || score > best.score) best = { aim, power, charge: solo ? 0 : (power - k.MIN_POWER) / (1 - k.MIN_POWER), score, ...hit };
    }
  }
  return best;
}

// How far a full-power 45 degree shot carries on the level (px): the bots' first test of whether a ship is worth a closer look, and the validator's line.
export function cannonRange() {
  const k = K(), A = config.AIR, dt = 0.02;
  let x = 0, y = 0, vx = Math.cos(Math.PI / 4) * k.SPEED, vy = -Math.sin(Math.PI / 4) * k.SPEED;
  for (let t = 0; t < 8 && !(vy > 0 && y >= 0); t += dt) { vx -= vx * Math.min(1, k.DRAG * dt); vy = Math.min(A.MAX_FALL, vy + A.GRAVITY * dt); x += vx * dt; y += vy * dt; }
  return x;
}

// The ship a bot crew would fire at (and the plan for it): the nearest hostile ship that is flying and within reach. { target, plan } or null. Cached for a moment on the cannon's record.
export function cannonPlan(ship, c, r, { solo = false } = {}) {
  const world = ship.world, now = performance.now();
  const key = solo ? 'planSolo' : 'plan';
  const cached = r[key + 'At'] != null && now - r[key + 'At'] < 400;
  if (cached) return r[key];
  r[key + 'At'] = now;
  r[key] = null;
  if (ship.state.down > 0 || ship.ctx.wreck) return null;
  const reach = cannonRange() * 1.05;
  const mid = (s) => ({ x: s.pose.x + (s.layout.refPoint ? s.layout.refPoint.x : 0), y: s.pose.y + (s.layout.refPoint ? s.layout.refPoint.y : 0) });
  const me = mid(ship);
  const foes = world.ships.filter((o) => o !== ship && areHostile(ship, o) && !(o.state.down > 0) && !o.ctx.wreck).map((o) => ({ o, d: Math.hypot(mid(o).x - me.x, mid(o).y - me.y) })).filter((q) => q.d < reach + 600).sort((a, b) => a.d - b.d);
  for (const { o } of foes) {
    const plan = solveShot(ship, c, o, { solo });
    if (plan) return (r[key] = { target: o, ...plan });
  }
  return null;
}

export function createCannon({ state, ship, air, modules, puff, phoneFx, stat }) {
  const L = ship.layout;
  const cannonOf = (name) => (L.cannons || []).find((c) => c.n === name || cannonSeatName(c.n) === name) || null;
  const players = () => Object.values(state.players);
  const rec = (c) => {
    const all = (state.cannons ||= {});
    const r = (all[c.n] ||= { n: c.n, aim: c.aim, home: c.aim, arc: c.arc, charge: 0, held: false, cd: 0, recoil: 0, flash: 0, shots: 0, msg: '', msgT: 0 });
    if (r.home !== c.aim || r.arc !== c.arc) { r.home = c.aim; r.arc = c.arc; r.aim = clamp(r.aim, c.aim - c.arc, c.aim + c.arc); }
    return r;
  };
  const alive = (q) => q && !(q.ko > 0) && !q.fall && q.connected !== false;
  const riderOf = (c) => players().find((q) => q.lock === cannonSeatName(c.n) && alive(q)) || null;
  const gunnerOf = (c) => players().find((q) => q.lock === c.n && alive(q)) || null;

  // Why the cannon cannot fire now ('' = it can).
  const block = (c, r, rider) => {
    const k = K();
    if (!rider) return 'Nobody is in the barrel';
    if (state.ship.down > 0 || state.phase !== 'flying') return 'Not now';
    if (ship.pose.turn > 0) return 'TURNING!';
    if (!modules.works(state, c.n)) return 'The cannon is BROKEN';
    if (r.cd > 0) return `Reloading ${Math.ceil(r.cd)}`;
    if (state.ship.press < k.MIN_PRESS) return 'Not enough steam';
    return '';
  };

  // The stick swings the barrel within its arc.
  const swing = (c, r, p, dt) => {
    if (Math.hypot(p.jx || 0, p.jy || 0) < 0.25) return;
    const want = clamp(angleDiff(Math.atan2(p.jy, p.jx), c.aim) + c.aim, c.aim - c.arc, c.aim + c.arc);
    const d = angleDiff(want, r.aim), step = K().TURN * dt;
    r.aim = clamp(r.aim + clamp(d, -step, step), c.aim - c.arc, c.aim + c.arc);
  };

  // FIRE: the crewman in the seat leaves the muzzle at `power` (0..1 of CANNON.SPEED) along the barrel.
  const launch = (c, r, rider, power) => {
    const k = K(), pl = L.platforms[c.d];
    const a = r.aim, m = muzzleOf(ship, c, a), speed = k.SPEED * power, ang = a + (state.ship.pitch || 0);
    const bot = !!rider.bot;
    rider.lock = null;
    rider.lockLeft = undefined;
    rider.fire = false;
    rider.d = c.d;
    rider.x = m.x;
    rider.y = m.y;

    air.startFlight(rider, Math.cos(ang) * speed, Math.sin(ang) * speed);
    rider.cannon = true;
    rider.noLand = k.NO_LAND;
    rider.trail = [];
    rider.moving = false;
    rider.uk = null;
    if (rider.fvx) rider.face = rider.fvx < 0 ? -1 : 1;
    state.ship.press = Math.max(0, state.ship.press - k.STEAM);
    r.cd = k.COOLDOWN;
    r.charge = 0;
    r.held = false;
    r.recoil = 1;
    r.flash = 1;
    r.shots++;
    const wx = toWorldX(ship, m.x), wy = toWorldY(ship, m.y), wa = aimToWorld(ship, ang);
    puff(wx, wy, '#ffe9a8', 14);
    puff(wx, wy, '#cfc6b0', 10);
    state.flashes.push({ x: wx, y: wy, ang: wa, t: 0.2, color: '#ffd23f', size: 3.2 });
    state.rings.push({ x: wx, y: wy, t: 0.4, max: 0.4, color: '#ffd23f', size: 190 });
    pop(state, wx, wy - 70, 'BOOM!', '#ffd23f', 1.9);
    state.sfxQ.push(['bigshot']);
    state.ship.shake = Math.max(state.ship.shake || 0, 0.7);
    kickForce(state, { x: c.x, y: pl.y - 52 }, -Math.cos(a), -Math.sin(a), k.RECOIL, 'recoil');
    stat(rider, 'cannon');
    phoneFx(rider, 'FIRED! Steer with the stick, ACTION opens the parachute', [80, 40, 120]);
    if (bot) { // a bot in the air is steered by its stunt (bots.js dareStep 'land'): drift onto the deck, pop the chute above it
      const plan = r.plan || r.planSolo;
      rider.dare = { kind: 'cannon', phase: 'land', t: 0, pt: 0, tries: 0, aimCd: 0, target: plan ? plan.target : null };
      rider.daring = true;
      rider.botJob = null;
    }
  };

  // A tap or a hold, in the post: charge while held, fire on letting go.
  const gunner = (player, dt) => {
    const c = cannonOf(player.lock);
    if (!c) return;
    const r = rec(c), rider = riderOf(c), why = block(c, r, rider);
    swing(c, r, player, dt);
    if (player.fire && !why) {
      r.charge = Math.min(1, r.charge + dt / K().CHARGE_TIME);
      r.held = true;
    } else if (r.held && !player.fire) {
      if (!why) launch(c, r, rider, K().MIN_POWER + (1 - K().MIN_POWER) * r.charge);
      else { r.held = false; r.charge = 0; }
    } else if (player.fire || player.actQ) {
      if (why && r.msgT <= 0) { r.msg = why; r.msgT = 1.2; phoneFx(player, why + '!', [40]); }
      r.charge = 0;
    } else r.charge = 0;
  };

  // In the barrel: with a gunner at the post you hold on; alone, the stick aims and Action fires you (the weak solo shot).
  const seat = (player, dt) => {
    const c = cannonOf(player.lock);
    if (!c) return;
    const r = rec(c), gun = gunnerOf(c);
    if (gun) return;
    swing(c, r, player, dt);
    if (player.actQ || player.fire) {
      const why = block(c, r, player);
      if (!why) launch(c, r, player, K().SOLO_POWER);
      else if (r.msgT <= 0 && !player.fire) { r.msg = why; r.msgT = 1.2; phoneFx(player, why + '!', [40]); }
    }
  };

  const phone = (player) => {
    const c = cannonOf(player.lock);
    if (!c) return null;
    const r = rec(c), seatKind = player.lock === cannonSeatName(c.n), rider = seatKind ? player : riderOf(c), gun = seatKind ? gunnerOf(c) : player, why = block(c, r, rider);
    if (!seatKind) return { label: why ? why.toUpperCase() : r.held ? 'LET GO TO FIRE!' : 'HOLD TO CHARGE', hold: !why, status: why ? (rider ? why : 'Nobody is in the barrel yet: a crewmate climbs in at the cannon') : `${rider.name} is in the barrel - power ${Math.round(clamp((K().MIN_POWER + (1 - K().MIN_POWER) * r.charge) * 100, 0, 100))}%` };
    if (gun) return { label: why ? why.toUpperCase() : 'Brace!', hold: false, status: `${gun.name} aims and fires - hang on!` };
    return { label: why ? why.toUpperCase() : 'FIRE (solo)!', hold: false, status: why ? '' : `Alone in the barrel: stick aims, ACTION fires you (${Math.round(K().SOLO_POWER * 100)}% power)` };
  };

  const update = (dt) => {
    if (!state.cannons) return;
    for (const r of Object.values(state.cannons)) {
      r.cd = Math.max(0, r.cd - dt);
      r.recoil = Math.max(0, r.recoil - dt * 2.4);
      r.flash = Math.max(0, r.flash - dt * 3);
      r.msgT = Math.max(0, r.msgT - dt);
      const c = (L.cannons || []).find((q) => q.n === r.n);
      if (!c || !gunnerOf(c)) { r.charge = 0; r.held = false; }
    }
  };

  return { update, gunner, seat, phone, rec, cannonOf, riderOf, gunnerOf };
}
