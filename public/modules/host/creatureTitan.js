// THE ISLAND TITAN'S FIGHT (BOSSES.md 2.7, C.6c): a slow stone colossus on the lair's plain. creatures/titan.js is its body, creatureSystem.js the world around it (damage, targets, death), creatureGrip.js the hand on the
// gasbag, creatureIsland.js the island and the crystal (ground.js), creatureFight.js the funnel and the lure. The numbers are config.CREATURES.TITAN. It is the tutorial boss: slow telegraphs, low damage, nothing it does kills.
//   MODES (cr.titan.mode)   'arrive' (it strides in, untouchable) -> 'stand' (it walks after the ship and stands OFFSET px ahead of her) | 'dying' (it kneels and crumbles into the plain).
//   ACTS                    BOULDER (cr.titan.act: PICK a rock from the plain, AIM it overhead with a ring on the TV, the ring LOCKs, THROW, RECOVER), the GRAB (creatureGrip.js startBagGrip: not an act, a grip record),
//                           the ROAR (cr.titan.roar: head back, then the mouth is open for a window, cr.mouthWin, and bombs fall in).
//   Every attack has the three beats: a banner on the TV and a buzz on the phones of the crew in its way; then the hit; then a rest.
//   stepTitan(state, cr, ship, dt)       once a step (creatureSystem.js update)
//   titanHit / titanWays / titanDied     what a blow does beyond its damage (an arm shelled off), the ways it ends, its death
import { config } from '../../config.js';
import { snapPose, reachPart, gripPart, tipOf, setMouth, isFree } from './creature.js';
import { TITAN_PHASES, TITAN_MOUTH_TEXT } from './creatures/titan.js';
import { warnCrew } from './creatureBreath.js';
import { tickGrips, startBagGrip, gripCap } from './creatureGrip.js';
import { lureX } from './creatureFight.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { hitForce } from './forces.js';
import { creatureHit } from './structure.js';
import { pop } from './popups.js';
import { shipOf } from './ships.js';

const TD = () => config.CREATURES.TITAN;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const sgn = (v) => (v < 0 ? -1 : 1);
const diffOf = (state) => state.difficulty || 'normal';
const shipMid = (ship) => ({ x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) });
const partOf = (cr, id) => cr.parts.find((p) => p.id === id);
const mouthOf = (cr) => cr.parts.find((p) => p.kind === 'mouth');
const armsOf = (cr) => cr.parts.filter((p) => p.kind === 'tentacle');
const banner = (state, text, secs = 2.6) => { state.say('setpiece', text, null, secs); };
const rand = (cr, a, b) => a + cr.hooks.rng() * (b - a);
const pauseOf = (state) => (config.CREATURES.GRIP.EVERY_BY_DIFF[diffOf(state)] ?? 1);
const canAttack = (state) => state.phase === 'flying' && !state.ship.down && !state.goingDown;
const everyone = () => true;

export const armsLost = (cr) => armsOf(cr).filter((p) => p.severed || p.dead).length;
const liveGrips = (cr) => cr.grips.filter((g) => g.mode !== 'recoil').length;
const homeOf = (state, tt) => state.course.map.goal.x + tt.side * TD().STAND.OFFSET; // (the lair's middle is where she hovers to fight: it waits OFFSET px beyond it, facing her)

// ---- setting it up (creatureSystem.js spawnTitan) ----
export function setupTitan(state, cr, ship) {
  const T = TD(), tt = cr.titan, side = ship.pose.f || 1;
  Object.assign(tt, { mode: 'arrive', age: 0, side, act: null, roar: null, nextT: T.SPAWN.FIRST, act2: null, busy: false, dbl: null, boulders: [], tremor: 0, floorY: cr.base.y + T.BODY.FEET, ring: null, rings: [], pose: 'stand', lastAct: '' });
  Object.assign(cr.stats, { throws: 0, boulderHits: 0, boulderMiss: 0, shattered: 0, grabs: 0, windows: 0, struck: 0 });
  cr.boulders = tt.boulders;
  cr.fed = 0;
  cr.mouthWin = null;
  cr.ai.mouthT = undefined;
}

// ---- hits and the ways it ends (creatureSystem.js hurtCreature) ----
export function titanHit(state, cr, p, dmg, src) {
  void dmg; void src;
  if (p.kind === 'tentacle' && p.severed && !p.announced) { // an arm shelled off
    p.announced = true;
    const left = 2 - armsLost(cr);
    if (!cr.dying) {
      if (left > 0) banner(state, 'AN ARM IS SHELLED OFF! ONE TO GO!', 2.8);
      pop(state, cr.x, cr.y - 1500, 'ARM OFF!', '#ffd23f', 1.8);
      state.sfxQ.push(['roar']);
    }
  }
}
export function titanWays(cr, p, src) {
  const ways = [];
  if (armsLost(cr) >= 2) ways.push('arms');
  if (cr.fed >= TD().MOUTH.FED) ways.push('mouth');
  if (p.kind === 'heart' && p.hp <= 0) ways.push('crystal');
  if (cr.hp <= 0) ways.push('hp');
  void src;
  return ways;
}
export function titanDied(state, cr) {
  const tt = cr.titan;
  tt.mode = 'dying';
  tt.act = tt.act2 = null;
  tt.roar = null;
  tt.ring = null;
  tt.rings = [];
  tt.boulders.length = 0;
  tt.pose = 'dying';
  cr.mouthWin = null;
}

// ---- the phases ----
function enterPhase(state, cr, ph) {
  const T = TD(), A = T.ATTACK, d = TITAN_PHASES[ph], h = cr.hooks;
  cr.phase = ph;
  cr.ai.breather = A.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (ph >= 2 && cr.titan.grabT === undefined) cr.titan.grabT = T.GRAB.FIRST + A.BREATHER;
  if (d.banner) {
    banner(state, d.banner, A.BANNER);
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, config.CREATURES.PHASE.SHAKE);
  pop(state, cr.x, cr.y - 2900, d.name, '#ffd23f', 2.2);
  h.puff(cr.x, cr.y - 2400, '#d9cbb0', 16);
}
function checkPhase(state, cr) {
  const P = TD().PHASE, frac = cr.hp / cr.maxHp;
  let want = 1;
  if (frac < P.TWO_HP || armsLost(cr) >= 1) want = 2;
  if (frac < P.THREE_HP) want = 3;
  if (want > cr.phase) enterPhase(state, cr, want);
}

// ---- movement ----
function face(cr, f) { // turning round is a snap of the whole pose (nothing sweeps across)
  if (f && f !== cr.f) { cr.f = f; snapPose(cr); }
}
function walkTo(cr, tx, dt, speed, band) { // true while it is on the move
  const dx = tx - cr.base.x;
  if (Math.abs(dx) <= band) return false;
  cr.base.x += sgn(dx) * Math.min(Math.abs(dx) - band, speed * dt);
  return true;
}
function schedule(state, cr) {
  const A = TD().ATTACK;
  cr.titan.nextT = rand(cr, A.EVERY[0], A.EVERY[1]) * pauseOf(state) * (A.PHASE_MUL[Math.min(3, cr.phase)] || 1);
}

// ---- the main step ----
export function stepTitan(state, cr, ship, dt) {
  const T = TD(), tt = cr.titan, mid = shipMid(ship);
  tt.age += dt;
  if (tt.tremor > 0) tt.tremor = Math.max(0, tt.tremor - dt);
  if (cr.ai.breather > 0) cr.ai.breather -= dt;
  if (cr.dying) {
    tt.walking = false;
    tickGrips(state, cr, dt);
    return;
  }
  if (tt.mode === 'arrive') {
    const u = smooth(tt.age / T.SPAWN.ARRIVE);
    face(cr, -tt.side);
    cr.base.x = homeOf(state, tt) + tt.side * T.SPAWN.FROM * (1 - u);
    tt.walking = u < 1;
    if (tt.age >= T.SPAWN.ARRIVE) {
      cr.mode = 'idle';
      tt.mode = 'stand';
      tt.walking = false;
      state.sfxQ.push(['roar']);
      banner(state, cr.name + ' WAKES! SHELL ITS ARMS, BOMB ITS ROAR, DODGE THE BOULDERS!', 3.5);
    }
    return;
  }
  checkPhase(state, cr);
  tickGrips(state, cr, dt);
  // walking: it waits at its HOME (OFFSET px beyond the lair's middle, where she hovers to fight) while she is within ZONE of it, and strides after her when she is not; it turns round only when she is well behind it
  const S = T.STAND, still = [tt.act, tt.act2].some((q) => q && (q.sub === 'aim' || q.sub === 'throw')) || cr.mouthWin || tt.roar;
  if ((mid.x - cr.base.x) * cr.f < -S.FLIP_DX && !tt.act && !tt.act2 && !liveGrips(cr)) face(cr, sgn(mid.x - cr.base.x));
  const home = homeOf(state, tt), tx = Math.abs(mid.x - home) <= S.ZONE ? home : mid.x - cr.f * S.OFFSET;
  tt.walking = !still && walkTo(cr, tx, dt, Math.abs(tx - cr.base.x) > S.FAR ? S.CATCH : S.WALK, S.BAND);
  stepActs(state, cr, ship, dt, mid);
  stepRoar(state, cr, ship, dt);
  stepBoulders(state, cr, ship, dt);
  // a new attack
  if (!tt.act && !tt.act2 && !liveGrips(cr) && cr.ai.breather <= 0 && canAttack(state)) {
    if (cr.phase >= 2 && tt.grabT !== undefined && (tt.grabT -= dt) <= 0) tt.wantGrab = true;
    if ((tt.nextT -= dt) <= 0 || tt.wantGrab) startAttack(state, cr, ship, mid);
  }
  tt.pose = tt.roar || cr.mouthWin ? 'roar' : 'stand';
}

function startAttack(state, cr, ship, mid) {
  const T = TD(), A = T.ATTACK, tt = cr.titan;
  const grabOk = cr.phase >= 2 && liveGrips(cr) < Math.min(gripCap(state, cr), T.GRAB.MAX[Math.min(3, cr.phase)] || 0);
  const wts = { ...A.WEIGHTS[Math.min(3, cr.phase)] };
  if (!grabOk) wts.grab = 0;
  if (tt.wantGrab && grabOk) { wts.throw = 0; wts.grab = 1; }
  tt.wantGrab = false;
  const total = Object.values(wts).reduce((s, v) => s + v, 0);
  if (total <= 0) { tt.nextT = 2; return; }
  let r = cr.hooks.rng() * total, kind = 'throw';
  for (const [k, w] of Object.entries(wts)) { if ((r -= w) <= 0) { kind = k; break; } }
  if (kind === 'grab') {
    if (startBagGrip(state, cr, ship)) { cr.stats.grabs += 1; tt.lastAct = 'grab'; tt.grabT = rand(cr, T.GRAB.TIME + 8, T.GRAB.TIME + 18) * pauseOf(state); schedule(state, cr); }
    else { tt.nextT = 2; tt.grabT = 1.5; } // (no free arm in reach of the bag: try again soon)
    return;
  }
  if (!startThrow(state, cr, ship, mid)) tt.nextT = 2;
}

// ---- the BOULDER ----
const pickArm = (cr) => {
  const arms = armsOf(cr).filter((p) => isFree(p) && !p.severed);
  arms.sort((a, b) => (a.id === 'armN' ? 0 : 1) - (b.id === 'armN' ? 0 : 1)); // (the near arm first)
  return arms[0] || null;
};
const rootOf = (cr, p) => ({ x: cr.x + p.at[0] * cr.f, y: cr.y + p.at[1] });
const flightOf = (state) => TD().BOULDER.FLIGHT * (TD().BOULDER.FLIGHT_BY_DIFF[diffOf(state)] ?? 1);
// Where the arm reaches to pick a rock up, to heft it, and (from the root toward a target) to throw.
const pickPoint = (cr) => ({ x: cr.x + cr.f * 900, y: cr.y + 1000 }); // (a heap of rubble against its legs: its arms do not reach the plain itself)
const hoistPoint = (cr) => ({ x: cr.x - cr.f * 350, y: cr.y - 3300 });

function startThrow(state, cr, ship, mid, second = false) {
  const B = TD().BOULDER, tt = cr.titan, arm = pickArm(cr);
  if (!arm) return false;
  const b = { mode: 'held', x: 0, y: 0, vx: 0, vy: 0, r: B.R, hp: B.HP, rot: 0, t: 0, arm, born: tt.age };
  tt.boulders.push(b);
  const a = { kind: 'throw', sub: 'pick', t: 0, arm, b, second, target: null, released: false, ring: null };
  if (second) tt.act2 = a; else { tt.act = a; if (cr.phase >= 3) tt.dbl = { t: B.DOUBLE }; } // (phase 3: the other arm follows DOUBLE s later, so two rocks are in the air together)
  tt.busy = true;
  arm.gripCd = 999;
  const pk = pickPoint(cr);
  gripPart(cr, arm, pk.x, pk.y);
  cr.stats.throws += 1;
  tt.lastAct = 'throw';
  if (!second) banner(state, 'THE TITAN REACHES FOR A BOULDER!', B.PICK + B.AIM * 0.5);
  state.sfxQ.push(['roar']);
  void mid;
  return true;
}
// Both throws (the second only in phase 3) once a step; the rings are what the TV and the bots read (tt.rings; tt.ring is the first).
function stepActs(state, cr, ship, dt, mid) {
  const tt = cr.titan;
  for (const slot of ['act', 'act2']) {
    const a = tt[slot];
    if (a && stepOne(state, cr, ship, dt, mid, a)) tt[slot] = null;
  }
  tt.rings = [tt.act, tt.act2].filter((q) => q && q.ring).map((q) => q.ring);
  tt.ring = tt.rings[0] || null;
  if (tt.busy && !tt.act && !tt.act2) { tt.busy = false; schedule(state, cr); }
}
// One throw, one step: true when it is over.
function stepOne(state, cr, ship, dt, mid, a) {
  const B = TD().BOULDER, arm = a.arm, b = a.b;
  a.t += dt;
  if (arm.dead || arm.severed || b.mode === 'gone') { // its arm was shelled off (or the rock shot to gravel) mid-throw
    if (b.mode !== 'fly') b.mode = 'gone';
    a.ring = null;
    return true;
  }
  const tip = tipOf(arm);
  if (b.mode === 'held' && tip) { b.x = tip.x; b.y = tip.y; }
  if (a.sub === 'pick') {
    if (a.t >= B.PICK) {
      a.sub = 'aim';
      a.t = 0;
      const hp = hoistPoint(cr);
      gripPart(cr, arm, hp.x, hp.y);
      banner(state, 'THE TITAN HEFTS A BOULDER! MOVE OUT OF THE RING - OR SHOOT IT!', B.AIM + 1.2);
      state.sfxQ.push(['roar']);
      warnCrew(state, cr, ship, everyone, 'BOULDER COMING! Fly clear of the red ring - or shoot the rock!', [200, 60, 200, 60, 200]);
    }
    return false;
  }
  if (a.sub === 'aim') {
    if (!a.target || a.t < B.AIM - B.LOCK) { a.target = { x: mid.x, y: mid.y + B.AIM_DY }; } // (the ring follows her until it locks; it is aimed a little under her middle, at the lower decks: a climb clears it)
    a.ring = { x: a.target.x, y: a.target.y, r: B.R * 1.7, locked: a.t >= B.AIM - B.LOCK, t: a.t };
    if (a.t >= B.AIM) {
      a.sub = 'throw';
      a.t = 0;
      const root = rootOf(cr, arm), dx = a.target.x - root.x, dy = a.target.y - root.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, (arm.reach * 0.95) / d);
      reachPart(cr, arm, root.x + dx * k, root.y + dy * k - 400); // (the swing: pull back, then snap forward)
    }
    return false;
  }
  if (a.sub === 'throw') {
    a.ring = { x: a.target.x, y: a.target.y, r: B.R * 1.7, locked: true, t: a.t };
    if (!a.released && (arm.ctl.mode === 'strike' || a.t > 0.9)) release(state, cr, a);
    if (a.released && a.t >= B.RECOVER) { a.sub = 'recover'; a.t = 0; }
    return false;
  }
  return a.t >= 0.3; // recover
}
// Let go: the boulder flies from the hand to the ring along an arc FLIGHT s long.
function release(state, cr, a) {
  const B = TD().BOULDER, b = a.b, T = flightOf(state), tip = tipOf(a.arm) || { x: b.x, y: b.y };
  a.released = true;
  b.mode = 'fly';
  b.x = tip.x;
  b.y = tip.y;
  b.t = 0;
  b.vx = (a.target.x - b.x) / T;
  b.vy = (a.target.y - b.y - 0.5 * B.GRAVITY * T * T) / T;
  b.spin = (cr.hooks.rng() < 0.5 ? -1 : 1) * 3;
  b.T = T;
  b.tx = a.target.x; // (where it will come down: the bots' helm climbs clear of it)
  b.ty = a.target.y;
  state.sfxQ.push(['whoosh']);
  state.sfxQ.push(['whoosh']);
  state.ship.shake = Math.max(state.ship.shake || 0, 0.4);
  a.arm.gripCd = TD().GRAB.COOLDOWN;
  a.ring = null;
}
function stepBoulders(state, cr, ship, dt) {
  const B = TD().BOULDER, tt = cr.titan;
  if (tt.dbl && !tt.act2 && (tt.dbl.t -= dt) <= 0) { // the second of a pair
    tt.dbl = null;
    if (cr.phase >= 3 && tt.act) startThrow(state, cr, ship, shipMid(ship), true);
  }
  for (const b of tt.boulders) {
    if (b.mode !== 'fly') continue;
    b.t += dt;
    b.vy += B.GRAVITY * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.rot += b.spin * dt;
    let shot = null;
    for (const s of state.shells) {
      if (s.life <= 0 || s.frag) continue;
      if (Math.hypot(s.x - b.x, s.y - b.y) > b.r + 18) continue;
      s.life = 0;
      b.hp -= config.GUNS.DAMAGE * config.CREATURES.HURT.SHELL_MUL;
      cr.hooks.puff(s.x, s.y, '#d9cbb0', 4);
      if (b.hp <= 0) { shot = s; break; }
    }
    if (shot) { shatter(state, cr, b, shot); continue; }
    if (state.ships.includes(ship) && !ship.ctx.wreck && touches(ship, b)) { hit(state, cr, ship, b); continue; }
    if (b.y >= tt.floorY - b.r * 0.6 || b.t > b.T + B.MISS_AFTER) thud(state, cr, b);
  }
  tt.boulders = tt.boulders.filter((b) => b.mode !== 'gone');
  cr.boulders = tt.boulders;
}
// Is the rock touching the hull? The centre and a ring of points on its face, in ship coordinates.
function touches(ship, b) {
  const sim = ship.sim;
  if (!sim || !sim.hitsShip) return false;
  const r = b.r * 0.85;
  if (sim.hitsShip(toShipX(ship, b.x), toShipY(ship, b.y))) return true;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    if (sim.hitsShip(toShipX(ship, b.x + Math.cos(a) * r), toShipY(ship, b.y + Math.sin(a) * r))) return true;
  }
  return false;
}
function hit(state, cr, ship, b) {
  const B = TD().BOULDER, sx = toShipX(ship, b.x), sy = toShipY(ship, b.y), sim = ship.sim;
  b.mode = 'gone';
  cr.stats.boulderHits += 1;
  creatureHit(ship, sx, sy, B.HULL, { power: B.POWER }); // (STRUCTURE.md WP2: the segment under the rock)
  hitForce(ship.ctx, sx, sy, B.POWER);
  if (sim && sim.air) sim.air.shove(B.SHOVE, sx);
  state.ship.shake = Math.max(state.ship.shake || 0, B.SHAKE);
  pop(state, b.x, b.y - 260, 'BOULDER!', '#ff5a1f', 1.8);
  cr.hooks.puff(b.x, b.y, '#d9cbb0', 18);
  cr.hooks.puff(b.x, b.y, '#ffe9a8', 8);
  state.sfxQ.push(['impact']);
  state.say('info', 'A BOULDER HIT THE SHIP!', null, 2);
  for (const p of Object.values(state.players)) if (!p.bot && cr.hooks.phoneFx && !p.fly && !p.fall && p.conn == null && state.ships.includes(ship)) cr.hooks.phoneFx(p, 'BOULDER HIT THE SHIP!', [200, 60, 200]);
}
function shatter(state, cr, b, shell) {
  b.mode = 'gone';
  cr.stats.shattered += 1;
  pop(state, b.x, b.y - 240, 'SHATTERED!', '#8fe388', 1.8);
  for (let k = 0; k < 3; k++) cr.hooks.puff(b.x + (cr.hooks.rng() - 0.5) * 300, b.y + (cr.hooks.rng() - 0.5) * 300, '#d9cbb0', 10);
  state.sfxQ.push(['hit']);
  state.say('info', 'SHOT THE BOULDER TO GRAVEL!', null, 2);
  if (state.moment && shell.owner) state.moment('creature-boulder', { who: [shell.owner], where: null, data: { creature: cr.name } }); // (the Ship's Book)
}
function thud(state, cr, b) {
  b.mode = 'gone';
  cr.stats.boulderMiss += 1;
  pop(state, b.x, cr.titan.floorY - 500, 'MISSED!', '#ffffff', 1.4);
  cr.hooks.puff(b.x, cr.titan.floorY - 100, '#b9a888', 14);
  state.sfxQ.push(['impact']);
}

// ---- the ROAR: the mouth opens, bombs fall in ----
function stepRoar(state, cr, ship, dt) {
  const T = TD(), M = T.MOUTH, tt = cr.titan, ai = cr.ai, mouth = mouthOf(cr);
  if (!mouth || mouth.dead) return;
  const w = cr.mouthWin;
  if (!w && !tt.roar) {
    if (cr.mode !== 'idle' || ai.breather > 0 || state.phase !== 'flying' || (tt.act && tt.act.sub !== 'recover')) return;
    if (ai.mouthT === undefined) ai.mouthT = M.FIRST;
    if ((ai.mouthT -= dt) > 0) return;
    tt.roar = { t: 0 };
    banner(state, 'THE TITAN THROWS BACK ITS HEAD - IT IS ABOUT TO ROAR!' + (ship.layout.bombBay ? ' READY THE BOMB BAY!' : ''), M.WIND + 1.4);
    state.sfxQ.push(['roar']);
    for (const p of Object.values(state.players)) {
      if (p.bot || p.fly || p.fall || shipOf(state, p) !== ship || !ship.layout.kindOf || ship.layout.kindOf(p.lock) !== 'bombBay') continue;
      if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'IT IS ABOUT TO ROAR! Hold Action to DROP BOMBS into its mouth!', [90, 40, 90]);
    }
    return;
  }
  if (tt.roar) {
    tt.roar.t += dt;
    cr.ai.mouthT = Math.min(cr.ai.mouthT ?? 0, 0);
    if (tt.roar.t >= M.WIND) {
      tt.roar = null;
      setMouth(cr, mouth, true);
      cr.mouthWin = { t: 0, left: M.FOR };
      cr.stats.windows += 1;
      state.sfxQ.push(['roar']);
      state.ship.shake = Math.max(state.ship.shake || 0, 0.7);
      banner(state, TITAN_MOUTH_TEXT + ' (' + Math.floor(cr.fed) + '/' + M.FED + ')', M.FOR);
      cr.hooks.puff(mouth.segs[0].x, mouth.segs[0].y, '#ffffff', 10);
    }
    return;
  }
  w.t += dt;
  w.left -= dt;
  if (w.gulp > 0 && (w.gulp -= dt) <= 0 && w.left > M.REOPEN) setMouth(cr, mouth, true); // (it swallowed a bomb: shut a moment, then open again for what is left of the window)
  if (cr.mode === 'idle') {
    const step = M.LURE_SPEED * dt, target = lureX(state, cr, ship) - cr.f * T.BODY.MOUTH.AT[0]; // (it strides to put its mouth under her bomb bay)
    cr.base.x += clamp(target - cr.base.x, -step, step);
    tt.walking = Math.abs(target - cr.base.x) > 30;
  }
  if (w.left <= 0 && mouth.open && !(w.gulp > 0)) setMouth(cr, mouth, false);
  if ((w.left <= 0 && !mouth.open && !(w.gulp > 0)) || w.t > M.FOR + M.GULP * 3 + M.SLACK) {
    cr.mouthWin = null;
    setMouth(cr, mouth, false);
    ai.mouthT = rand(cr, M.EVERY[0], M.EVERY[1]) * pauseOf(state) * (M.PHASE_MUL[Math.min(3, cr.phase)] || 1);
  }
}
