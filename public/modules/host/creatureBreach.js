// THE BREACH (BOSSES.md 2.1, C.2): the Kraken's great-white-shark lunge. It only happens where there is a sea level (the Sunken Sea: state.env.seaY).
//   DIVE    it sinks under the surface and is gone (not a target, not a landing place, no boarders).
//   WARN    (config.CREATURES.BREACH.WARN, about 2 s) a dark shadow and ripples slide under the ship on the water, a TV banner "IT'S UNDER US! CLIMB!", a buzz on every phone. The shadow follows her, and
//           LOCK s before the lunge it stops and aims where she will be.
//   LEAP    it launches up out of the water and smashes into the hull. The blow lands if her middle is within HALF_W of the shadow and her keel is less than REACH px above the water: so the helm can
//           dodge by CLIMBING (breachClimbAlt tells the bots how high) or by getting out of the shadow. A hit: hull damage, a kick up and sideways (forces.js), every crewman near it loses a heart
//           (the ones at the impact are knocked out), the rest are thrown off their feet; on higher difficulties it may tear a section off (breakOff).
//   EXPOSED while it hangs in the air (EXPOSE s) the heart and the beak are open and everything that hits it does BONUS x the damage.
//   FALL    it drops back in with a huge splash and swims back to its place (RETURN s).
//   startBreach(state, cr, ship) / stepBreach(state, cr, ship, dt) (creatureSystem.js update) / breachReady / breachClimbAlt(state) -> the altitude (state.ship.alt) the helm must climb to, or null
//   cr.breach = { phase, t, x (the shadow, world x), locked, hit, exposed, ... }, cr.breachDy = how far the body is below (+) its usual place. While it runs cr.mode is 'breach'.
import { config } from '../../config.js';
import { exposeHeart, setMouth, reachPart, isFree } from './creature.js';
import { toWorldX, toWorldY, toShipX, driveGain } from './pose.js';
import { hitForce } from './forces.js';
import { hurt, knockOut } from './health.js';
import { pop } from './popups.js';
import { mainShip, shipOf } from './ships.js';
import { envIdOf } from './environments.js';

const CR = () => config.CREATURES;
const BR = () => config.CREATURES.BREACH;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

// The water line, or null where there is none (a creature only lives where there is one).
export const seaLevel = (state) => (envIdOf(state) === 'sea' && state.env && Number.isFinite(state.env.seaY) ? state.env.seaY : null);
// The lowest point of the hull, in ship coordinates (the keel under the lowest deck).
export const keelOf = (ship) => ship.layout.platforms.reduce((m, pl) => Math.max(m, pl.y), 0) + 40;
export const breachReady = (state) => seaLevel(state) !== null && state.phase === 'flying' && !state.goingDown;

function shove(sh, dx, dy) {
  const per = driveGain(sh);
  if (per) sh.ctx.ship.speed += dx / per;
  sh.pose.vy += dy;
}

export function startBreach(state, cr, ship) {
  if (cr.mode !== 'idle') return false;
  cr.mode = 'breach';
  cr.breachDy = 0;
  cr.breach = { phase: 'dive', t: 0, x: cr.base.x, tgtX: cr.base.x, locked: false, hit: null, exposed: false, exposeT: 0, exposeDone: false, impacted: false, splashUp: false, splashDown: false, bub: 0 };
  cr.puppet.auto = false;
  for (const p of cr.parts) if (p.kind === 'mouth') setMouth(cr, p, false);
  state.sfxQ.push(['roar']);
  cr.stats.breaches = (cr.stats.breaches || 0) + 1;
  void ship;
  return true;
}

// A big splash where the body meets the water: puffs, the sound, the ship shakes a little.
function splash(state, cr, x, sea, big = 1) {
  for (let k = 0; k < 8 * big; k++) cr.hooks.puff(x + (cr.hooks.rng() - 0.5) * 1800, sea - cr.hooks.rng() * 200, '#ffffff', 3);
  state.sfxQ.push(['splash']);
  state.ship.shake = Math.max(state.ship.shake || 0, 0.5 * big);
}

export function stepBreach(state, cr, ship, dt) {
  const B = BR(), S = CR().SPAWN, b = cr.breach, sea = seaLevel(state);
  if (!b || sea === null) return;
  b.t += dt;
  const mx = toWorldX(ship, ship.layout.refPoint.x);
  if (b.exposed) {
    b.exposeT += dt;
    if (b.exposeT >= B.EXPOSE) endExposure(cr, b);
  }
  switch (b.phase) {
    case 'dive':
      cr.breachDy = S.DEEP * smooth(b.t / B.DIVE);
      if (b.t >= B.DIVE) {
        b.phase = 'warn';
        b.t = 0;
        state.ev.warn = B.WARN;
        state.ev.warnText = "IT'S UNDER US! CLIMB!";
        state.sfxQ.push(['alarm']);
        for (const p of Object.values(state.players)) if (!p.bot && cr.hooks.phoneFx) cr.hooks.phoneFx(p, "IT'S UNDER US! CLIMB!", [200, 100, 200, 100, 300]);
      }
      break;
    case 'warn': {
      if (!b.locked && b.t >= B.WARN - B.LOCK) { // (it stops following and aims where she will be when it comes up)
        b.locked = true;
        b.tgtX = mx + ship.pose.vx * (B.LOCK + B.RISE * B.HIT_AT);
      } else if (!b.locked) b.tgtX = mx + ship.pose.vx * 0.3;
      const step = B.SHADOW_SPEED * dt;
      b.x += clamp(b.tgtX - b.x, -step, step);
      cr.base.x = b.x;
      if ((b.bub -= dt) <= 0) { // bubbles and ripples on the water over the shadow
        b.bub = 0.18;
        cr.hooks.puff(b.x + (cr.hooks.rng() - 0.5) * B.SHADOW_W * 0.7, sea, '#cfe8f4', 2);
      }
      if (b.t >= B.WARN) {
        b.phase = 'leap';
        b.t = 0;
        state.sfxQ.push(['roar']);
        flingLimbs(cr, b, sea);
      }
      break;
    }
    case 'leap': {
      const u = clamp(b.t / B.RISE, 0, 1);
      cr.breachDy = S.DEEP + (-B.APEX_UP - S.DEEP) * (1 - (1 - u) * (1 - u)); // (fast out of the water, slowing at the top)
      if (!b.splashUp && b.t >= B.RISE * 0.25) { b.splashUp = true; splash(state, cr, b.x, sea, 2); }
      if (!b.exposeDone && b.t >= B.RISE * B.EXPOSE_AT) startExposure(cr, b);
      if (!b.impacted && b.t >= B.RISE * B.HIT_AT) { b.impacted = true; impact(state, cr, ship, b, sea); }
      if (b.t >= B.RISE + B.HOLD) { b.phase = 'fall'; b.t = 0; }
      break;
    }
    case 'fall': {
      const u = clamp(b.t / B.FALL, 0, 1);
      cr.breachDy = -B.APEX_UP + (S.DEEP + B.APEX_UP) * u * u; // (it falls back faster and faster)
      if (!b.splashDown && u >= 0.55) { b.splashDown = true; splash(state, cr, b.x, sea, 3); state.ship.shake = Math.max(state.ship.shake || 0, 1); }
      if (b.t >= B.FALL) {
        b.phase = 'return';
        b.t = 0;
        endExposure(cr, b);
        cr.base.x = mx + cr.side * S.STANDOFF; // (it comes up again where it was, out of sight under the water)
      }
      break;
    }
    case 'return':
      cr.breachDy = S.DEEP * (1 - smooth(b.t / B.RETURN));
      cr.base.x += ship.pose.vx * dt;
      if (b.t >= B.RETURN) {
        cr.breachDy = 0;
        cr.mode = 'idle';
        cr.breach = null;
        const ai = cr.ai, G = CR().GRIP;
        ai.gripT = Math.max(ai.gripT || 0, B.GRACE);
        ai.slapT = Math.max(ai.slapT || 0, B.GRACE + G.COOLDOWN);
      }
      break;
    default:
  }
}

// The heart and the beak open while it hangs in the air.
function startExposure(cr, b) {
  b.exposeDone = true;
  b.exposed = true;
  b.exposeT = 0;
  exposeHeart(cr);
  for (const p of cr.parts) if (p.kind === 'mouth') setMouth(cr, p, true);
}
function endExposure(cr, b) {
  if (!b.exposed) return;
  b.exposed = false;
  if (!CR().BOARD.HEART_EXPOSED) for (const p of cr.parts) if (p.kind === 'heart') p.hidden = true;
  for (const p of cr.parts) if (p.kind === 'mouth') setMouth(cr, p, false);
}

// The limbs fling up and out as it leaps.
function flingLimbs(cr, b, sea) {
  void sea;
  const limbs = cr.parts.filter((p) => isFree(p));
  limbs.forEach((p, i) => {
    const a = -Math.PI / 2 + (i - (limbs.length - 1) / 2) * 0.4;
    reachPart(cr, p, b.x + Math.cos(a) * p.reach * 0.7, sea - 400 + Math.sin(a) * p.reach * 0.7);
  });
}

// The blow: does it meet the hull?
function impact(state, cr, ship, b, sea) {
  const B = BR(), G = CR().GRIP, h = cr.hooks;
  const keelY = toWorldY(ship, keelOf(ship)), gap = sea - keelY, mx = toWorldX(ship, ship.layout.refPoint.x), dx = mx - cr.base.x;
  const inZone = Math.abs(dx) <= B.HALF_W, clear = gap >= B.REACH;
  b.hit = inZone && !clear;
  b.gap = gap;
  b.dx = dx;
  const L = ship.layout, ix = clamp(toShipX(ship, cr.base.x), L.bounds ? L.bounds.x0 + 60 : 0, L.bounds ? L.bounds.x1 - 60 : 2600), iy = keelOf(ship);
  const wx = toWorldX(ship, ix), wy = toWorldY(ship, iy);
  // the tentacles smash at the hull (or at where it would be)
  const free = cr.parts.filter((p) => isFree(p)).slice(0, 3);
  free.forEach((p, i) => reachPart(cr, p, wx + (i - 1) * 260, wy - 120 - 90 * (i % 2)));
  if (!b.hit) {
    cr.stats.breachMiss = (cr.stats.breachMiss || 0) + 1;
    state.ev.warn = 3;
    state.ev.warnText = inZone ? 'IT MISSED! WE CLIMBED CLEAR!' : 'IT MISSED! IT CRASHES BACK INTO THE SEA!';
    pop(state, wx, wy - 200, 'MISSED!', '#8fe388', 1.6);
    return;
  }
  cr.stats.breachHits = (cr.stats.breachHits || 0) + 1;
  const sim = ship.sim, diff = state.difficulty || 'normal';
  state.ev.warn = 3.5;
  state.ev.warnText = 'IT SMASHES INTO THE HULL!';
  pop(state, wx, wy - 200, 'SMASH!', '#ff2a2a', 2.2);
  h.puff(wx, wy - 100, '#ffffff', 16);
  h.puff(wx, wy - 100, '#7a3a5a', 12);
  state.sfxQ.push(['impact']);
  state.ship.shake = Math.max(state.ship.shake || 0, 2);
  if (sim && sim.damageHull) sim.damageHull(B.HULL);
  hitForce(ship.ctx, ix, iy, B.POWER);
  shove(ship, Math.sign(mx - cr.base.x || 1) * B.KICK_X * ship.pose.f, -B.KICK_UP); // (flung up and a little sideways)
  // the crew: the ones at the impact are knocked out, those near it lose a heart, everyone is thrown about
  let hurtN = 0, flung = 0;
  for (const p of Object.values(state.players)) {
    if (shipOf(state, p) !== ship || p.fly || p.fall || p.on || p.d == null || p.ko > 0) continue;
    const d = Math.abs(p.x - ix), dir = Math.sign(p.x - ix) || 1;
    if (d <= B.CORE_R) {
      if (hurt(p, 99, { cause: 'breach', big: true }) === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
      hurtN++;
    } else if (d <= B.HURT_R) {
      if (hurt(p, 1, { cause: 'breach' }) === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
      else if (!p.lock && sim && sim.air) { p.tossed = true; sim.air.startFlight(p, dir * B.FLING, -B.FLING * 0.7); p.face = dir * ship.pose.f; flung++; }
      hurtN++;
    }
    if (h.phoneFx) h.phoneFx(p, d <= B.HURT_R ? 'THE KRAKEN SMASHES INTO THE SHIP!' : 'THE KRAKEN SMASHES INTO THE SHIP! Hold on!', [250, 60, 250]);
  }
  if (sim && sim.air) sim.air.shove(B.SHOVE, ix);
  cr.stats.breachCrew = (cr.stats.breachCrew || 0) + hurtN;
  void flung;
  if (h.rng() < (B.BREAK_CHANCE[diff] ?? 0) && sim && sim.breakOff) {
    const r = sim.breakOff({ kind: 'limb', x: ix, y: iy - 120, reach: G.RIP.REACH, len: G.RIP.LEN, cause: 'creature' }, { force: true });
    if (r) cr.stats.breachBroke = (cr.stats.breachBroke || 0) + 1;
  }
}

// What the helm must climb to (a state.ship.alt value) to be clear of the lunge, or null: only while it is coming, and only if she is in its path.
export function breachClimbAlt(state) {
  const cr = state.creature;
  if (!cr || cr.mode !== 'breach' || !cr.breach || cr.breach.impacted) return null;
  const sea = seaLevel(state);
  if (sea === null) return null;
  const ship = mainShip(state), B = BR(), b = cr.breach;
  const mx = toWorldX(ship, ship.layout.refPoint.x);
  if (Math.abs(mx - b.x) > B.HALF_W + 1800) return null;
  const poseY = sea - B.REACH - 200 - keelOf(ship); // (the pose.y at which her keel is REACH + 200 px above the water)
  return -poseY;
}
