// Enemy gunships you can board.
//
// A gunship comes alongside off the bow and holds station there, firing broadsides at the hull
// (it glows before each one). The crew can:
//   - shoot it down (slow - it's armoured), or
//   - fire the hookshot from the very front of the main deck: a swing line catches her yardarm.
//     Press Action at our bow to swing across (landing with a stomp that knocks her crew back),
//     fight her crew, and hold Action at her boiler to plant a charge. Then swing back before it
//     blows! Anyone still aboard falls, and comes round in the medical bay. Blowing her up brings
//     supplies aboard. The gap between the ships can't be walked.
// Her crew run her systems, and each one matters:
//   gunners  - man the gun ports; no gunners = no broadsides (each gunner adds a shot)
//   stoker   - feeds her boiler; without one her guns reload at half speed
//   helmsman - holds her alongside; without one she drifts away once nobody's aboard
//   guards   - fight boarders, cut the line, patch her hull, and refill empty posts
// If nobody deals with it, it leaves after a while.
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
// Where each job stands on her deck (gunners stack up by the gun ports).
export const POSTS = { gunner: [GS.x0 + 60, GS.x0 + 150], helm: [GS.x0 + 560], stoker: [GS.boilerX - 110] };
const ROLES = ['gunner', 'helm', 'stoker', 'guard', 'gunner', 'guard', 'guard', 'guard'];
export const ANCHOR = { x: GS.x0 - 170, y: GS.deckY - 330 }; // her yardarm, where the swing line hangs
const GAP_MID = (MAIN_X1 + GS.x0) / 2;
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
    const n = Math.min(ROLES.length, G.CREW + Math.floor(lap() / 2));
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
      adrift: 0,
      refill: 0,
      crew: [],
    };
    for (const role of ROLES.slice(0, n)) {
      const post = postFor(role);
      state.gunship.crew.push({ role, post, x: post, y: GS.deckY, d: MAIN, hp: G.CREW_HP, cd: rand(0.5, 1.5), face: -1, wind: 0, cutT: 0 });
    }
    warn('ENEMY GUNSHIP! HOOKSHOT AT THE BOW - BOARD HER!', 4);
  };

  // Where a crew member taking this job should stand (the first free spot).
  const postFor = (role) => {
    const g = state.gunship;
    const used = g ? g.crew.filter((c) => c.role === role).map((c) => c.post) : [];
    const list = POSTS[role] || [GS.x0 + 330, GS.x0 + 470, GS.x0 + 760, GS.x0 + 860, GS.x0 + 400];
    return list.find((x) => !used.includes(x)) ?? list[0];
  };
  const atPost = (role) => (state.gunship ? state.gunship.crew.filter((c) => c.role === role && Math.abs(c.x - c.post) < 25 && !c.wind) : []);

  // Swinging across on the line (and back).
  const swing = (player) => {
    if (!state.gunship || !state.gunship.rope || player.swing) return;
    const out = player.x < GAP_MID;
    player.swing = { t: 0, from: player.x, to: out ? GS.x0 + 40 : MAIN_X1 - 30 };
    player.lock = null;
    state.sfxQ && state.sfxQ.push(['swing']);
  };
  const swingStep = (p, dt) => {
    const s = p.swing;
    const g = state.gunship;
    if (!g || !g.rope) {
      // The line was cut (or she broke off) mid-swing.
      p.swing = null;
      p.fall = true;
      return;
    }
    s.t += dt / G.SWING_TIME;
    const k = Math.min(1, s.t);
    const e = k * k * (3 - 2 * k);
    p.x = s.from + (s.to - s.from) * e;
    p.y = P[MAIN].y + G.SWING_DIP * Math.sin(Math.PI * k) - 40 * Math.sin(Math.PI * Math.min(1, k * 4)); // a hop off, then the dip
    p.face = s.to > s.from ? 1 : -1;
    p.moving = false;
    if (k >= 1) {
      p.swing = null;
      p.y = P[MAIN].y;
      if (s.to > s.from) stomp(p);
    }
  };
  // Landing on her deck knocks the nearby crew flying.
  const stomp = (p) => {
    const g = state.gunship;
    puff(p.x, p.y - 10 - state.ship.alt, '#ffffff', 12);
    state.rings && state.rings.push({ x: p.x, y: p.y - 20 - state.ship.alt, t: 0.3, max: 0.3, r: G.STOMP_RANGE, color: '#ffffff' });
    state.sfxQ && state.sfxQ.push(['hit', true]);
    for (const c of [...g.crew]) {
      if (Math.abs(c.x - p.x) > G.STOMP_RANGE) continue;
      c.wind = 0;
      c.cd = 1.2;
      c.x += 150;
      hurt(c, 1);
    }
  };
  const hurt = (c, dmg) => {
    const g = state.gunship;
    c.hp -= dmg;
    puff(c.x, c.y - 50 - state.ship.alt, '#ffffff', 6);
    if (c.hp > 0) return;
    g.crew.splice(g.crew.indexOf(c), 1);
    state.kills += 1;
    pop(state, c.x, c.y - 140 - state.ship.alt, 'raider', '#ffd23f', 1);
    puff(c.x, c.y + 60 - state.ship.alt, '#c0392b', 10);
    const lastGunner = c.role === 'gunner' && !g.crew.some((q) => q.role === 'gunner');
    const what = { gunner: lastGunner ? 'GUNNERS DOWN - HER GUNS ARE SILENT!' : '', stoker: 'STOKER DOWN - HER GUNS RELOAD SLOWLY', helm: 'HELMSMAN DOWN - SHE DRIFTS OFF ONCE YOU LEAVE HER' }[c.role];
    if (what) warn(what, 2.5);
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
    // The gap between the ships can't be walked: walkers stop at the edge.
    if (g && g.rope) {
      for (const p of Object.values(state.players)) {
        if (p.d !== MAIN || p.fall || p.swing || p.x <= MAIN_X1 || p.x >= GS.x0 - 20) continue;
        p.x = p.x < GAP_MID ? MAIN_X1 : GS.x0 - 20;
      }
    }
    if (!g) {
      if (state.phase !== 'flying' || state.ship.down || state.boss || !Object.keys(state.players).length) return;
      if ((timer -= dt * (state.tempo && state.tempo.phase === 'calm' ? 0 : state.tempo && state.tempo.phase === 'peak' ? 1.7 : 1)) > 0) return;
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
    // Her systems: who's at their post?
    const gunners = atPost('gunner').length;
    const steam = atPost('stoker').length > 0;
    const helm = g.crew.some((c) => c.role === 'helm');
    g.posts = { guns: gunners, steam, helm };
    // No helmsman: once nobody's aboard her, she drifts off.
    const aboard = Object.values(state.players).some((p) => p.d === MAIN && p.x > GAP_MID && !p.fall);
    g.adrift = helm ? 0 : aboard ? g.adrift : g.adrift + dt;
    if (g.adrift > G.DRIFT_TIME && !g.charge) {
      if (g.rope) setRope(false);
      g.phase = 'leaving';
      warn('NOBODY AT HER HELM - THE GUNSHIP DRIFTS AWAY', 2.5);
      return;
    }
    // Broadsides at our hull (with a glow first) - only while her gunners are at the guns.
    if (gunners && !g.charge && !state.ship.down && (g.fireCd -= dt * (steam ? 1 : 0.5)) <= 0) {
      g.fireCd = G.FIRE_EVERY * rand(0.85, 1.2);
      for (let k = 0; k < Math.min(G.SHOTS, gunners + 1); k++) {
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
    if (!gunners) g.fireCd = Math.max(g.fireCd, 1.5); // a fresh gunner needs a moment to fire
    g.warnFire = !!gunners && !g.charge && g.fireCd < 1;
    // The fuse.
    if (g.charge && (g.charge.t -= dt) <= 0) return explode(true);
    // Crew: defend the deck, and cut the rope if nobody's coming.
    g.ropeT = g.rope ? (g.ropeT || 0) + dt : 0;
    const boarders = Object.values(state.players).filter((p) => p.d === MAIN && p.x > GAP_MID && !p.fall && !p.swing && !(p.ko > 0));
    // With nobody aboard, a guard takes over an empty post after a few seconds.
    const guards = g.crew.filter((c) => c.role === 'guard');
    const empty = ['helm', 'gunner', 'stoker'].find((r) => !g.crew.some((c) => c.role === r));
    g.refill = empty && guards.length && !boarders.length ? g.refill + dt : 0;
    if (g.refill > G.REFILL_TIME) {
      g.refill = 0;
      const c = guards[0];
      c.role = empty;
      c.post = postFor(empty);
      guards.shift();
    }
    // Guards patch her hull while nobody's aboard.
    if (!boarders.length && guards.length && g.hp < g.max) g.hp = Math.min(g.max, g.hp + G.REPAIR_RATE * guards.length * dt);
    for (const c of g.crew) {
      c.cd = Math.max(0, c.cd - dt);
      const foe = boarders.sort((a, b) => Math.abs(a.x - c.x) - Math.abs(b.x - c.x))[0];
      // Guards chase boarders anywhere; the others only fight back when someone's right on them.
      if (foe && Math.abs(foe.x - c.x) < (c.role === 'guard' ? 700 : 200)) {
        c.face = foe.x < c.x ? -1 : 1;
        if (Math.abs(foe.x - c.x) > 60) c.x += c.face * G.CREW_SPEED * dt;
        else if (c.cd <= 0 && !c.wind) c.wind = 0.5; // wind up (a readable tell)
        if (c.wind && (c.wind -= dt) <= 0) {
          c.wind = 0;
          c.cd = 1.2;
          if (Math.abs(foe.x - c.x) < 80) {
            foe.ko = config.RAIDERS.KO_TIME * 0.5;
            foe.x += c.face * 120;
            if (foe.x < GS.x0 - 20) foe.fall = true; // knocked off her deck!
            puff(foe.x, foe.y - 60 - state.ship.alt, '#ffffff', 8);
            pop(state, foe.x, foe.y - 150 - state.ship.alt, 'raider', '#ff5a5a', 0.9);
          }
        }
      } else if (c === guards[0] && g.rope && !boarders.length && g.ropeT > 3) {
        // Head for the rope and hack at it.
        c.face = -1;
        if (c.x > GS.x0 + 30) c.x -= G.CREW_SPEED * dt;
        else if ((c.cutT += dt) > G.CUT_TIME) {
          c.cutT = 0;
          setRope(false);
          warn('THEY CUT THE ROPE!', 2);
        }
      } else {
        // Back to their post.
        const d = c.post - c.x;
        c.face = Math.abs(d) > 5 ? Math.sign(d) : c.role === 'gunner' ? -1 : c.face;
        c.x += Math.sign(d) * Math.min(Math.abs(d), G.CREW_SPEED * dt);
      }
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
    c.wind = 0;
    c.x += (c.x > player.x ? 1 : -1) * (sword ? 90 : 60);
    hurt(c, sword ? 2 : 1);
    return true;
  };

  // What a player standing here could do with the gunship.
  const interaction = (player) => {
    const g = state.gunship;
    if (!g || g.phase !== 'docked' || player.d !== MAIN) return null;
    if (!g.rope && player.x > MAIN_X1 - 45) return { type: 'hook', label: 'Fire hookshot!' };
    if (g.rope && player.x > MAIN_X1 - 45 && player.x < GAP_MID) return { type: 'swing', label: 'Swing across!' };
    if (g.rope && player.x > GAP_MID && player.x < GS.x0 + 110) return { type: 'swing', label: 'Swing back!' };
    if (g.rope && !g.charge && Math.abs(player.x - GS.boilerX) < 70) return { type: 'sabotage', obj: g, hold: true, time: G.PLANT_TIME, label: 'Plant charge!' };
    return null;
  };

  const reset = () => {
    if (state.gunship) setRope(false);
    state.gunship = null;
    timer = G.FIRST_AFTER;
  };

  return { update, reset, interaction, fireHook: () => setRope(true), plant, hitCrew, swing, swingStep, spawn: () => !state.gunship && spawn() };
}
