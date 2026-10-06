// Enemy gunships you can board.
//
// A gunship comes alongside off the bow and holds station there, firing broadsides at the hull
// (it glows before each one). The crew can:
//   - shoot it down (slow - it's armoured), or
//   - fire the hookshot from the very front of the main deck: a rope bridge forms, and anyone can
//     run across, fight its crew, and hold Action at its boiler to plant a charge. Then get back
//     before it blows! Anyone still aboard (or on the rope) falls, and comes round in the medical
//     bay. Blowing it up brings supplies aboard.
// If nobody deals with it, it leaves after a while. Its crew will cut the rope if left alone.
//
// Everything here is in SHIP coordinates (the gunship is moored to us while it's alongside):
// its deck is level with our main deck, so the main deck is simply extended across the rope.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { inRock } from './course.js';
import { pop } from './popups.js';

const G = config.GUNSHIP;
const P = SHIP_LAYOUT.platforms;
const MAIN = P.findIndex((p) => p.id === 'main');
export const MAIN_X1 = P[MAIN].x1; // the bow end of our main deck
export const GS = { x0: 2050, x1: 3150, deckY: P[MAIN].y, boilerX: 2950 };
const rand = (a, b) => a + Math.random() * (b - a);

export function createGunship({ state, puff, impact, credit }) {
  state.gunship = null;
  let timer = G.FIRST_AFTER;
  const warn = (text, secs = 3.5) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const lap = () => (state.course ? state.course.lap : 1);

  // Is there open sky for a gunship alongside (ship coords x 1900..3400)?
  const roomAlongside = (offset = 0) => {
    for (let x = 1900; x <= 3400; x += 150) {
      for (const y of [260, 420, 600, 760]) if (inRock(state, x + offset, y - state.ship.alt)) return false;
    }
    return true;
  };

  const setRope = (on) => {
    const g = state.gunship;
    if (g) g.rope = on;
    P[MAIN].x1 = on ? GS.x1 : MAIN_X1;
    if (!on) {
      // Anyone out past our bow falls.
      for (const p of Object.values(state.players)) {
        if (p.d === MAIN && p.x > MAIN_X1 && !p.fall) {
          p.fall = true;
          p.lock = null;
          p.conn = null;
        }
      }
    }
  };

  const spawn = () => {
    const n = G.CREW + Math.floor(lap() / 2);
    state.gunship = {
      phase: 'approach',
      offset: 2600,
      hp: G.HP + (lap() - 1) * 6,
      max: G.HP + (lap() - 1) * 6,
      rope: false,
      fireCd: G.FIRE_EVERY,
      docked: 0,
      charge: null,
      hit: 0,
      crew: Array.from({ length: n }, (_, i) => ({ x: GS.x0 + 300 + i * ((GS.x1 - GS.x0 - 400) / Math.max(1, n - 1)), y: GS.deckY, d: MAIN, hp: G.CREW_HP, cd: rand(0.5, 1.5), face: -1, wind: 0, cutT: 0 })),
    };
    warn('ENEMY GUNSHIP! HOOKSHOT AT THE BOW - BOARD HER!', 4);
  };

  // The charge is set: run!
  const plant = (player) => {
    const g = state.gunship;
    if (!g || g.charge) return;
    g.charge = { t: G.FUSE, by: player && player.id };
    warn('CHARGE SET! GET BACK TO THE SHIP!', 3);
  };

  const explode = (byCrew) => {
    const g = state.gunship;
    if (!g) return;
    g.phase = 'sinking';
    g.sink = 0;
    setRope(false);
    for (let k = 0; k < 8; k++) puff(rand(GS.x0, GS.x1), rand(300, 760) - state.ship.alt, k % 2 ? '#ff5a1f' : '#555', 24);
    pop(state, (GS.x0 + GS.x1) / 2, 300 - state.ship.alt, 'boss', '#ff5a1f', 1.6);
    state.ship.shake = Math.max(state.ship.shake, 0.5);
    state.kills += 1 + g.crew.length;
    if (byCrew) {
      // Spoils: patch the hull, fill the firebox, top up guns and bombs.
      state.ship.hull = Math.min(100, state.ship.hull + G.REWARD_HULL);
      state.ship.fuel = Math.min(config.BOILER.FUEL_MAX, state.ship.fuel + G.REWARD_COAL);
      for (const gun of Object.values(state.GUNS)) gun.ammo = Math.min(gun.max, gun.ammo + 3);
      state.bombBay.bombs = Math.min(config.BOMBS.MAX, state.bombBay.bombs + 2);
      warn('GUNSHIP DESTROYED! SUPPLIES ABOARD: HULL, COAL AND AMMO', 4);
    } else warn('GUNSHIP SHOT DOWN!', 3);
    g.crew.length = 0;
  };

  const update = (dt) => {
    // Nobody can stand out past our bow without a rope to stand on.
    if (!(state.gunship && state.gunship.rope)) {
      for (const p of Object.values(state.players)) if (p.d === MAIN && p.x > MAIN_X1 + 5 && !p.fall) (p.fall = true), (p.lock = null), (p.conn = null);
    }
    let g = state.gunship;
    if (!g) {
      if (state.phase !== 'flying' || state.ship.down || state.boss || !Object.keys(state.players).length) return;
      if ((timer -= dt) > 0) return;
      if (!roomAlongside()) {
        timer = 6;
        return;
      }
      timer = rand(G.EVERY_MIN, G.EVERY_MAX);
      spawn();
      g = state.gunship;
    }
    g.hit = Math.max(0, g.hit - dt);
    if (g.phase === 'sinking') {
      g.sink += dt;
      if (g.sink > 4) state.gunship = null;
      return;
    }
    if (g.phase === 'leaving') {
      g.offset += 500 * dt;
      if (g.offset > 4000) state.gunship = null;
      return;
    }
    // Rock in her way for a moment? She breaks off.
    g.rockT = roomAlongside(g.offset) ? 0 : (g.rockT || 0) + dt;
    if (g.rockT > 1.5) {
      if (g.rope) setRope(false);
      g.phase = 'leaving';
      warn('THE GUNSHIP BREAKS OFF!', 2);
      return;
    }
    if (g.phase === 'approach') {
      g.offset = Math.max(0, g.offset - Math.max(120, g.offset * 1.2) * dt);
      if (g.offset === 0) g.phase = 'docked';
      return;
    }
    g.docked += dt;
    if (g.docked > G.STAY && !g.charge) {
      if (g.rope) setRope(false);
      g.phase = 'leaving';
      warn('THE GUNSHIP PULLS AWAY', 2);
      return;
    }
    // Broadsides at our hull (with a glow first), unless the charge is already set.
    if (!g.charge && !state.ship.down && (g.fireCd -= dt) <= 0) {
      g.fireCd = G.FIRE_EVERY * rand(0.85, 1.2);
      for (let k = 0; k < G.SHOTS; k++) {
        const fx = GS.x0 - 40;
        const fy = 560 + k * 70 - state.ship.alt;
        const tx = rand(700, 1500);
        const ty = rand(480, 820) - state.ship.alt;
        const d = Math.hypot(tx - fx, ty - fy) || 1;
        state.bullets.push({ x: fx, y: fy, vx: ((tx - fx) / d) * 620, vy: ((ty - fy) / d) * 620, life: 3, miss: Math.random() < 0.15 });
        state.flashes && state.flashes.push({ x: fx, y: fy, ang: Math.PI, t: 0.12, color: '#ffcf80', size: 1.6 });
      }
      state.sfxQ && state.sfxQ.push(['cannon']);
    }
    g.warnFire = !g.charge && g.fireCd < 1;
    // The fuse.
    if (g.charge && (g.charge.t -= dt) <= 0) return explode(true);
    // Crew: defend the deck, and cut the rope if nobody's coming.
    g.ropeT = g.rope ? (g.ropeT || 0) + dt : 0;
    const boarders = Object.values(state.players).filter((p) => p.d === MAIN && p.x > MAIN_X1 && !p.fall && !(p.ko > 0));
    for (const c of g.crew) {
      c.cd = Math.max(0, c.cd - dt);
      const foe = boarders.sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      if (foe && Math.abs(foe.x - c.x) < 700) {
        c.face = foe.x < c.x ? -1 : 1;
        if (Math.abs(foe.x - c.x) > 60) c.x += c.face * G.CREW_SPEED * dt;
        else if (c.cd <= 0 && !c.wind) c.wind = 0.5; // wind up (a readable tell)
        if (c.wind && (c.wind -= dt) <= 0) {
          c.wind = 0;
          c.cd = 1.2;
          if (Math.abs(foe.x - c.x) < 80) {
            foe.ko = config.RAIDERS.KO_TIME * 0.5;
            foe.x = Math.max(GS.x0 - 300, foe.x + c.face * 120);
            puff(foe.x, foe.y - 60 - state.ship.alt, '#ffffff', 8);
            pop(state, foe.x, foe.y - 150 - state.ship.alt, 'raider', '#ff5a5a', 0.9);
          }
        }
      } else if (g.rope && !boarders.length && g.ropeT > 3) {
        // Head for the rope and hack at it.
        c.face = -1;
        if (c.x > GS.x0 + 30) c.x -= G.CREW_SPEED * dt;
        else if ((c.cutT += dt) > G.CUT_TIME) {
          c.cutT = 0;
          setRope(false);
          warn('THEY CUT THE ROPE!', 2);
        }
      } else c.x += (GS.x0 + 400 - c.x) * Math.min(1, dt * 0.5);
      c.x = Math.max(GS.x0 + 20, Math.min(GS.x1 - 20, c.x));
    }
    // Crew shells hit her hull and gasbag.
    for (const sh of state.shells) {
      if (sh.life <= 0) continue;
      const sy = sh.y + state.ship.alt;
      const inHull = sh.x > GS.x0 - 60 && sh.x < GS.x1 + 80 && sy > 560 && sy < 780;
      const inBag = Math.hypot((sh.x - (GS.x0 + GS.x1) / 2) / 660, (sy - 380) / 160) < 1;
      if (!inHull && !inBag) continue;
      sh.life = 0;
      g.hp -= config.GUNS.DAMAGE;
      g.hit = 0.15;
      if (g.hp <= 0) {
        credit?.(sh);
        explode(false);
        return;
      }
    }
  };

  // A crew member's sword (or shove) against the gunship's crew.
  const hitCrew = (player, sword, range) => {
    const g = state.gunship;
    if (!g || g.phase !== 'docked') return false;
    const c = g.crew.filter((q) => Math.abs(q.x - player.x) < range && player.d === MAIN).sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    if (!c) return false;
    c.hp -= sword ? 2 : 1;
    c.wind = 0;
    c.x += (c.x > player.x ? 1 : -1) * (sword ? 90 : 60);
    puff(c.x, c.y - 50 - state.ship.alt, '#ffffff', 6);
    if (c.hp <= 0) {
      g.crew.splice(g.crew.indexOf(c), 1);
      state.kills += 1;
      pop(state, c.x, c.y - 140 - state.ship.alt, 'raider', '#ffd23f', 1);
      puff(c.x, c.y + 60 - state.ship.alt, '#c0392b', 10);
    }
    return true;
  };

  // What a player standing here could do with the gunship.
  const interaction = (player) => {
    const g = state.gunship;
    if (!g || g.phase !== 'docked' || player.d !== MAIN) return null;
    if (!g.rope && player.x > MAIN_X1 - 45) return { type: 'hook', label: 'Fire hookshot!' };
    if (g.rope && !g.charge && Math.abs(player.x - GS.boilerX) < 70) return { type: 'sabotage', obj: g, hold: true, time: G.PLANT_TIME, label: 'Plant charge!' };
    return null;
  };

  const reset = () => {
    if (state.gunship) setRope(false);
    state.gunship = null;
    timer = G.FIRST_AFTER;
  };

  return { update, reset, interaction, fireHook: () => setRope(true), plant, hitCrew, spawn: () => !state.gunship && spawn() };
}
