// Hijack a plane (H5): the small dogfighters, and the big enemy fighter (state.enemy). An airborne player who touches an enemy dogfighter (or reels one in
// on the hookshot) climbs aboard: the plane slows and wobbles, the phone says KICK THE PILOT!,
// and a few taps (or a short hold) of ACTION throw him out - he parachutes. Then the player FLIES
// the plane like the escort fighter: the stick steers, the guns fire by themselves at anything in
// front, LEAVE bails out (parachute, into normal airborne flight). She is OURS now: our guns and
// bots ignore her, enemy bullets can shoot her down (the player bails out), and she runs dry after
// a while. The plane is moved out of state.strafers into state.hijacks while stolen. The big fighter (a bigger,
// slower plane that keeps its ENEMY stats) is swapped out of state.enemy for a dead placeholder, so the enemy AI
// stops flying her and the normal respawn timer runs once she is gone (it is held while she is stolen).
// Bots only take part while they are on a daring stunt (p.daring, see bots.js).
// Player fields: p.hj = the plane while riding (then p.x / p.y are the plane's place in the WORLD). Plane fields: rider (player id), phase 'kick'|'fly'.
import { config } from '../../config.js';
import { flyPlane, smoke, shootDown, angDiff } from './planes.js';
import { targets } from './aim.js';
import { inRock } from './course.js';
import { pop } from './popups.js';
import { targetShip } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';

const H = config.HIJACK;
const E = config.ESCORT;
const D = config.DOGFIGHT;
const F = config.ENEMY;
const HF = H.FIGHTER;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createHijack({ state, puff, phoneFx, air }) {
  const ship = targetShip(state, null); // (B.3: the ship this system hunts and flies round: ships.js targetShip, ships[0] today; B.4 chooses per enemy)
  const layout = ship.layout;
  const B = layout.bounds;
  state.hijacks = state.hijacks || [];
  const shipMid = () => ({ x: toWorldX(ship, layout.aimPoint.x), y: toWorldY(ship, layout.aimPoint.y) });
  const nearShip = (x, y, pad) => {
    const sx = toShipX(ship, x);
    const sy = toShipY(ship, y);
    return sx > B.x0 - pad && sx < B.x1 + pad && sy > B.y0 - pad && sy < B.y1 + pad;
  };

  const canRide = (p) => !!p && (!p.bot || p.daring) && !p.hj;
  // The big enemy fighter, if she is flying (not shot down, not stolen).
  const bigFighter = () => (state.enemy && state.enemy.dead <= 0 && state.enemy.heading != null && state.enemy.hp > 0 ? state.enemy : null);

  // Climb aboard plane s (an enemy dogfighter in state.strafers, or the big fighter state.enemy).
  const board = (p, s) => {
    if (!canRide(p) || !s || !(s.hp > 0)) return false;
    if (s === state.enemy) {
      if (!bigFighter()) return false;
      // Swap a dead placeholder into state.enemy: the AI stops flying her, and she is not a live enemy any more.
      state.enemy = { x: -2000, y: 300, vx: 0, vy: 0, hp: 5, fire: 0, dead: F.RESPAWN, heading: null };
      Object.assign(s, { big: true, origHp: s.hp, origMax: s.max, rider: p.id, phase: 'kick', kickP: 0, kickIdle: 0, fuel: HF.FUEL_TIME, max: HF.HP, hp: HF.HP, gunCd: 0, orbit: Math.atan2(s.y - shipMid().y, s.x - shipMid().x), t: 0 });
    } else {
      if (!state.strafers.includes(s)) return false;
      state.strafers = state.strafers.filter((q) => q !== s);
      Object.assign(s, { rider: p.id, phase: 'kick', kickP: 0, kickIdle: 0, fuel: H.FUEL_TIME, max: H.HP, hp: H.HP, gunCd: 0, orbit: Math.atan2(s.y - shipMid().y, s.x - shipMid().x), t: 0 });
    }
    state.hijacks.push(s);
    p.hj = s;
    p.fly = false;
    p.air = false;
    p.hook = null;
    p.conn = null;
    p.climb = false;
    p.chute = 0;
    p.chuteOpen = false;
    p.jz = 0;
    p.fvx = p.fvy = 0;
    p.rot = 0;
    p.x = s.x;
    p.y = s.y;
    puff(s.x, s.y, '#ffffff', 8);
    pop(state, s.x, s.y - 60, 'WHUMP!', '#ffffff', 0.9);
    phoneFx(p, s.big ? 'You landed on the big fighter! KICK THE PILOT OUT - tap any button!' : 'You landed on a dogfighter! KICK THE PILOT OUT - tap any button!', null);
    return true;
  };

  // Called each frame for an airborne human: touching a dogfighter climbs aboard.
  const touch = (p) => {
    if (!canRide(p) || !p.fly || performance.now() < (p.noBoardUntil || 0)) return false;
    for (const s of state.strafers) {
      if (s.hp > 0 && Math.hypot(p.x - s.x, p.y - s.y) < H.RADIUS) return board(p, s);
    }
    const e = bigFighter();
    if (e && Math.hypot(p.x - e.x, p.y - e.y) < HF.RADIUS) return board(p, e);
    return false;
  };

  // The rider leaves the plane under a parachute (into normal airborne flight).
  const bail = (p, why, wreckPlane = false) => {
    const s = p.hj;
    if (!s) return;
    p.hj = null;
    p.fire = false;
    p.noBoardUntil = performance.now() + 1500; // (jumping off must not land you straight back on the same plane)
    state.hijacks = state.hijacks.filter((q) => q !== s);
    const vrel = (s.vx || 0) - ship.pose.vx; // (the plane's speed as seen from the ship: the jump is made at half of it)
    p.x = toShipX(ship, s.x); // (startFlight takes a place on the ship and a velocity relative to her)
    p.y = toShipY(ship, s.y - 20);
    air.startFlight(p, vrel * 0.5 * ship.pose.f, -220); // (the jump is along the world; startFlight takes it along the ship)
    p.chute = 0.001;
    p.chuteOpen = false;
    p.face = vrel < 0 ? -1 : 1;
    if (wreckPlane || s.phase === 'fly') {
      // An empty plane just drops away in flames.
      shootDown(state, s, s.big ? 'fighter' : 'biplane');
      state.chutes.pop(); // (no pilot to bail out)
      puff(s.x, s.y, '#ff5a1f', 14);
    } else {
      // We backed out before kicking him out: he flies on as an enemy.
      for (const k of ['rider', 'phase', 'kickP', 'kickIdle', 'fuel', 'orbit', 't']) delete s[k];
      if (s.big) {
        // The big fighter goes back to the enemy AI (the placeholder is still waiting to respawn).
        const side = Math.sign(s.x - shipMid().x) || 1;
        delete s.big;
        s.max = s.origMax;
        s.hp = Math.max(1, Math.min(s.hp, s.origHp));
        s.mode = 'extend';
        s.wp = { x: shipMid().x + side * F.RUN_FROM, y: shipMid().y - 600 };
        s.side = -side;
        s.dead = 0;
        state.enemy = s;
      } else {
        s.max = D.HP;
        s.hp = Math.min(s.hp, D.HP);
        s.mode = 'extend';
        s.modeT = 1.5;
        state.strafers.push(s);
      }
    }
    if (why) phoneFx(p, why, null);
  };

  // LEAVE: jump off (before the pilot is out) or bail out (after).
  const leave = (p) => {
    if (p.hj) bail(p, p.hj.phase === 'kick' ? 'You jumped off the plane!' : 'You bailed out!');
  };

  // Kick progress: a tap adds 1/KICKS; ACTION held adds 1/KICK_HOLD per second.
  const rider = (p, dt) => {
    const s = p.hj;
    p.moving = false;
    p.climb = false;
    p.lock = null;
    if (p.leaveQ) {
      p.leaveQ = false;
      leave(p);
      return;
    }
    const tap = p.actQ || p.atkQ || p.jumpQ || p.grabQ; // (any button counts)
    p.actQ = p.atkQ = p.jumpQ = p.grabQ = false;
    if (s.phase === 'kick') {
      let add = 0;
      if (tap) add += 1 / H.KICKS;
      if (p.fire) add += dt / H.KICK_HOLD;
      if (add > 0) {
        s.kickP += add;
        s.kickIdle = 0;
        if (tap) puff(s.x, s.y - 20, '#ffe9a8', 3);
      } else {
        s.kickIdle += dt;
        s.kickP = Math.max(0, s.kickP - H.KICK_DECAY * dt);
      }
      if (s.kickP >= 1) {
        s.phase = 'fly';
        s.kickP = 1;
        state.chutes ||= [];
        state.chutes.push({ x: s.x, y: s.y - 20, vx: ((s.vx || 0) - ship.pose.vx) * 0.2, vy: -260, t: 0 });
        puff(s.x, s.y, '#ffffff', 10);
        pop(state, s.x, s.y - 70, 'OUT YOU GO!', '#ffd23f', 1.1);
        state.ev.warn = 2.5;
        state.ev.warnText = (p.name || 'A CREWMATE').toUpperCase() + ' STOLE A FIGHTER!';
        phoneFx(p, 'She is yours! Stick steers, guns fire on their own. LEAVE bails out.', null);
        p.fire = false;
      }
    }
    p.x = s.x;
    p.y = s.y;
    p.face = Math.cos(s.heading || 0) < 0 ? -1 : 1;
  };

  const kickText = (p) => (p.hj.phase === 'kick' ? 'KICK THE PILOT!' : 'Auto guns');

  const update = (dt) => {
    for (const s of [...state.hijacks]) {
      const p = state.players[s.rider];
      if (!p || p.hj !== s) {
        // The rider is gone (left the game): the plane just goes down.
        state.hijacks = state.hijacks.filter((q) => q !== s);
        shootDown(state, s, 'biplane');
        state.chutes.pop();
        continue;
      }
      if (state.phase !== 'flying' || state.ship.down || p.connected === false || p.ko > 0) {
        bail(p, 'Back to the ship!');
        continue;
      }
      s.t += dt;
      const mid = shipMid();
      if (s.big && state.enemy !== s) state.enemy.dead = Math.max(state.enemy.dead, F.RESPAWN); // (no new enemy fighter while she is stolen)
      if (s.phase === 'kick') {
        // A stranger on the wing: she slows down and wobbles, but her pilot keeps flying her on.
        const tx = s.x + Math.cos(s.heading) * 800;
        const ty = s.y + Math.sin(s.heading) * 800;
        if (s.big) flyPlane(state, s, tx, ty, dt, { speed: F.SPEED * HF.BOARD_SPEED, turn: F.TURN * 0.6, turnAvoid: F.TURN_AVOID, nearShip, midY: mid.y, forceTurn: Math.sin(s.t * 3.1) * H.BOARD_WOBBLE * 0.7, fm: { ...F, STALL_SPEED: 120 }, max: s.max });
        else flyPlane(state, s, tx, ty, dt, { speed: H.BOARD_SPEED, turn: D.TURN * 0.6, turnAvoid: D.TURN_AVOID, nearShip, midY: mid.y, forceTurn: Math.sin(s.t * 3.1) * H.BOARD_WOBBLE, fm: { ...D, STALL_SPEED: 120 }, max: s.max });
      } else {
        s.fuel -= dt;
        let tx;
        let ty;
        const far = Math.hypot(s.x - mid.x, s.y - mid.y) > H.LEASH;
        if (far) {
          tx = mid.x;
          ty = mid.y;
        } else if (Math.hypot(p.jx || 0, p.jy || 0) > 0.3) {
          tx = s.x + p.jx * ship.pose.f * 1000; // (the stick is along the ship; the plane flies along the world)
          ty = s.y + p.jy * 1000;
        } else {
          s.orbit = (s.orbit || 0) + E.ORBIT_SPEED * dt;
          const wide = s.big ? HF.ORBIT : 1;
          tx = mid.x + Math.cos(s.orbit) * E.ORBIT * 1.3 * wide;
          ty = mid.y + Math.sin(s.orbit) * E.ORBIT * 0.7 * wide;
        }
        if (s.big) flyPlane(state, s, tx, ty, dt, { speed: F.SPEED * HF.SPEED, turn: F.TURN * HF.TURN, turnAvoid: F.TURN_AVOID, nearShip, midY: mid.y, fm: { ...F, THRUST: HF.THRUST, GRAVITY: HF.GRAVITY, STALL_SPEED: HF.STALL_SPEED }, max: s.max });
        else flyPlane(state, s, tx, ty, dt, { speed: E.SPEED, turn: E.TURN, turnAvoid: E.TURN_AVOID, nearShip, midY: mid.y, fm: E, max: s.max });
        // Guns along the nose at anything in front (like the escort fighter, human accuracy).
        s.gunCd -= dt;
        if (s.gunCd <= 0 && s.big) {
          // Two guns on the big fighter.
          const hit = targets(state).some((t) => {
            const q = t.at(0.3);
            return Math.hypot(q.x - s.x, q.y - s.y) < E.FIRE_RANGE * 1.2 && Math.abs(angDiff(Math.atan2(q.y - s.y, q.x - s.x), s.heading)) < E.FIRE_CONE;
          });
          if (hit) {
            s.gunCd = HF.SHOT_EVERY;
            for (const off of [-12, 12]) {
              const nx = s.x + Math.cos(s.heading) * 44 - Math.sin(s.heading) * off;
              const ny = s.y + Math.sin(s.heading) * 44 + Math.cos(s.heading) * off;
              state.shells.push({ x: nx, y: ny, vx: Math.cos(s.heading) * 1100 + (s.vx - ship.pose.vx) * 0.3 + ship.pose.vx, vy: Math.sin(s.heading) * 1100 + s.vy * 0.3, life: 1.1, owner: p.id });
              if (state.flashes) state.flashes.push({ x: nx, y: ny, ang: s.heading, t: 0.06, color: '#fff2b0', size: 0.8 });
            }
          }
        } else if (s.gunCd <= 0) {
          const hit = targets(state).some((t) => {
            const q = t.at(0.3);
            return Math.hypot(q.x - s.x, q.y - s.y) < E.FIRE_RANGE && Math.abs(angDiff(Math.atan2(q.y - s.y, q.x - s.x), s.heading)) < E.FIRE_CONE;
          });
          if (hit) {
            s.gunCd = E.SHOT_EVERY;
            const nx = s.x + Math.cos(s.heading) * 34;
            const ny = s.y + Math.sin(s.heading) * 34;
            state.shells.push({ x: nx, y: ny, vx: Math.cos(s.heading) * 1100 + (s.vx - ship.pose.vx) * 0.3 + ship.pose.vx, vy: Math.sin(s.heading) * 1100 + s.vy * 0.3, life: 1.0, owner: p.id });
            if (state.flashes) state.flashes.push({ x: nx, y: ny, ang: s.heading, t: 0.06, color: '#fff2b0', size: 0.7 });
          }
        }
        if (s.fuel <= 0) {
          bail(p, 'Out of fuel - you bailed out!');
          continue;
        }
      }
      smoke(s, s.max, puff);
      // Enemy fire hurts her, rock kills her.
      for (const b of state.bullets) {
        if (b.life > 0 && Math.hypot(b.x - s.x, b.y - s.y) < (s.big ? 50 : 34)) {
          b.life = 0;
          s.hp -= 1;
          puff(s.x, s.y, '#ffcf40', 6);
        }
      }
      if (s.hp <= 0 || inRock(state, s.x, s.y)) {
        puff(s.x, s.y, '#ff5a1f', 20);
        pop(state, s.x, s.y - 50, 'kill', '#ff5a5a', 1);
        bail(p, s.hp <= 0 ? 'Shot down! You bailed out.' : 'Crashed! You bailed out.', true);
        continue;
      }
      p.x = s.x;
      p.y = s.y;
    }
  };

  // Everybody out (new game, wreck): plane and rider are released.
  const reset = () => {
    for (const p of Object.values(state.players)) {
      if (p.hj) {
        p.hj = null;
        p.fly = false;
        p.fall = true; // (the existing fall -> medical bay path, which works in ship coordinates)
        p.x = toShipX(ship, p.x);
        p.y = clamp(toShipY(ship, p.y), -100, 900);
      }
    }
    state.hijacks = [];
  };

  return { board, touch, bail, leave, rider, update, reset, kickText, bigFighter };
}
