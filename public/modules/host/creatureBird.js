// THE THUNDERBIRD'S FIGHT (BOSSES.md 2.3, C.6b): its flight, its five attacks, the perch on the gasbag, the roost on a rock spire, the gizzard that glows, and the ways it ends. creatures/thunderbird.js is its body
// and poses, creatureSystem.js the world around it (damage, targets, death), envStormSea.js the storm's strike system it calls bolts through. The numbers are config.CREATURES.THUNDERBIRD.
//   MODES (cr.bird.mode)   'arrive' (flies in, untouchable) -> 'fly' (circles the ship in big loops; attacks leave the loop and rejoin it) <-> 'perch' (on her gasbag) | 'roost' (on a rock spire of the lair);
//                          'dying' when it has been beaten (both wings plucked, the gizzard zapped, a mortared roost, a cut gizzard, or the pool): it falls into the clouds.
//   ACTS (cr.bird.act)     GUST (fly beside her, REAR: the wings rear back, BEAT: the shove and the twist), PASS (WIND, LOCK, DIVE, ESCAPE: a hull bump), DIVE (the lightning dive: hover over her, CALL, then BOLTS
//                          bolts one after another through the storm's own strike system) and SWALLOW (hover over her, CALL, then the GIZZARD glows).
//   Every attack has the three beats: a banner on the TV, a buzz on the phones of the crew in its way, a screech or a thunderclap; then the hit; then a recovery in which it is dazed or open.
//   stepBird(state, cr, ship, dt)       once a step (creatureSystem.js update)
//   birdHit / birdMul / birdWays        what a blow does beyond its damage (zaps, mortar hits, a plucked wing, driving it off the perch), the damage multipliers, and the ways it ends
//   perch jobs                          the crew's side: DRIVE IT OFF (sword hold or blows)
import { config } from '../../config.js';
import { snapPose } from './creature.js';
import { BIRD_PHASES, standOffset } from './creatures/thunderbird.js';
import { warnCrew } from './creatureBreath.js';
import { topDeck } from './creatureGrip.js';
import { tilt } from './course.js';
import { floorBelow } from './maps.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { applyForce, hitForce } from './forces.js';
import { hurt, knockOut } from './health.js';
import { pop } from './popups.js';
import { shipOf } from './ships.js';
import { creatureHit } from './structure.js';

const BD = () => config.CREATURES.THUNDERBIRD;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const sgn = (v) => (v < 0 ? -1 : 1);
const diffOf = (state) => state.difficulty || 'normal';
const shipMid = (ship) => ({ x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) });
const partOf = (cr, kind) => cr.parts.find((p) => p.kind === kind);
const wingsOf = (cr) => cr.parts.filter((p) => p.kind === 'wing');
const banner = (state, text, secs = 2.6) => { state.say('setpiece', text, null, secs); };
const rand = (cr, a, b) => a + cr.hooks.rng() * (b - a);
const beakAt = (cr) => { const m = partOf(cr, 'beak'); return m && m.segs[0] ? { x: m.segs[0].x, y: m.segs[0].y } : { x: cr.x, y: cr.y }; };
// A point of the ship in ship coordinates -> the world, through her tilt (so it moves and tips with her).
const entry = (ship, x, y) => { const [tx, ty] = tilt(ship.ctx, x, y); return { x: toWorldX(ship, tx), y: toWorldY(ship, ty) }; };
const bagOf = (ship) => ship.layout.gasbag || ship.layout.gasbags[0] || null;
const forcedWin = () => config.CREATURES.FORCE_WIN;

export const pluckedCount = (cr) => wingsOf(cr).filter((w) => w.severed || w.dead).length;
export const birdOnBag = (cr) => !!cr && cr.kind === 'thunderbird' && !cr.dying && cr.bird.mode === 'perch' && !!cr.bird.perch && cr.bird.perch.landed && cr.bird.perch.sub !== 'lift';
export const birdOnSpire = (cr) => !!cr && cr.kind === 'thunderbird' && !cr.dying && cr.bird.mode === 'roost' && !!cr.bird.roost && cr.bird.roost.landed && cr.bird.roost.sub !== 'lift';
export const birdBoardable = (cr) => birdOnBag(cr) || birdOnSpire(cr);
export const gizzardGlowing = (cr) => !!cr && cr.kind === 'thunderbird' && !cr.dying && cr.bird.glow > 0;
export const birdDiving = (cr) => !!cr && cr.kind === 'thunderbird' && !cr.dying && !!cr.bird.act && cr.bird.act.kind === 'dive' && (cr.bird.act.sub === 'call' || cr.bird.act.sub === 'bolts'); // (it is calling bolts down: the rods are manned before the first one)
export const birdSwallowing = (cr) => !!cr && cr.kind === 'thunderbird' && !cr.dying && !!cr.bird.act && cr.bird.act.kind === 'swallow' && (cr.bird.act.sub === 'call' || cr.bird.act.sub === 'glow'); // (the head is back and the bolt is coming: the coil starts to charge)

// ---- setting it up (creatureSystem.js spawn) ----
export function setupBird(state, cr, ship) {
  const B = BD(), bd = cr.bird, mid = shipMid(ship), side = ship.pose.f || 1;
  const o0 = { x: mid.x + B.FLY.RX * (side > 0 ? 1 : -1), y: mid.y - B.FLY.UP };
  Object.assign(bd, {
    mode: 'arrive', act: null, age: 0, ang: side > 0 ? 0 : Math.PI, dir: side > 0 ? -1 : 1, off: { x: cr.x - o0.x, y: cr.y - o0.y },
    nextT: B.SPAWN.FIRST, lastPerch: B.ATTACK.FIRST_PERCH - B.ATTACK.PERCH_EVERY, lastRoost: B.ROOST.FIRST - B.ROOST.EVERY, lastAct: '', dazed: 0, glow: 0, glowMax: 1, perch: null, roost: null, prev: { x: cr.x, y: cr.y }, vx: 0, vy: 0, plucked: 0,
  });
  Object.assign(cr.stats, { gusts: 0, passes: 0, passHits: 0, dives: 0, bolts: 0, grounded: 0, drunk: 0, struck: 0, swallows: 0, zaps: 0, perches: 0, claws: 0, driven: {}, roosts: 0, mortar: 0, plucked: 0, windows: 0 });
  cr.zapped = 0;
  cr.mortared = 0;
  cr.swoop = null;
  cr.gust = null;
  cr.mvx = cr.mvy = 0;
  const gz = partOf(cr, 'heart');
  if (gz) gz.hidden = true;
}

// ---- the movement helpers ----
const oneWing = (cr) => pluckedCount(cr) >= 1;
const omega = (cr) => { const F = BD().FLY; return (F.SPEED * (oneWing(cr) ? BD().ONE_WING.SPEED_MUL : 1)) / ((F.RX + F.RY) / 2); };
const centreOf = (cr, mid) => ({ x: mid.x, y: mid.y - BD().FLY.UP * (oneWing(cr) ? BD().ONE_WING.UP_MUL : 1) });
const orbitPos = (cr, C) => { const F = BD().FLY; return { x: C.x + F.RX * Math.cos(cr.bird.ang), y: C.y + F.RY * Math.sin(cr.bird.ang) }; };
// Ease toward a point, never faster than maxSpeed px/s.
function follow(cr, tx, ty, k, dt, maxSpeed = BD().FLY.SPEED * 2.4) {
  const e = 1 - Math.exp(-k * dt);
  let dx = (tx - cr.base.x) * e, dy = (ty - cr.base.y) * e;
  const d = Math.hypot(dx, dy), lim = maxSpeed * dt;
  if (d > lim) { dx *= lim / d; dy *= lim / d; }
  cr.base.x += dx;
  cr.base.y += dy;
}
// Fly straight at a point at `speed` px/s; returns the distance still to go.
function flyTo(cr, tx, ty, speed, dt) {
  const dx = tx - cr.base.x, dy = ty - cr.base.y, d = Math.hypot(dx, dy) || 1, s = Math.min(d, speed * dt);
  cr.base.x += (dx / d) * s;
  cr.base.y += (dy / d) * s;
  return d - s;
}
function face(cr, f) { // turning round is a snap of the whole pose (nothing sweeps across)
  if (f && f !== cr.f) { cr.f = f; snapPose(cr); }
}
// A world vector as an angle in the bird's own frame (facing +x, y down): where its neck must point.
function toBodyAngle(cr, wx, wy) {
  const th = cr.rot ? -cr.rot * cr.f : 0, c = Math.cos(th), s = Math.sin(th);
  return Math.atan2(-wx * s + wy * c, (wx * c + wy * s) * cr.f);
}
// Back onto the circling loop from wherever an attack ended: the nearest angle, going the way it is already flying.
function rejoin(cr, mid) {
  const bd = cr.bird, F = BD().FLY, C = centreOf(cr, mid);
  bd.ang = Math.atan2((cr.base.y - C.y) / F.RY, (cr.base.x - C.x) / F.RX);
  const tx = -F.RX * Math.sin(bd.ang), ty = F.RY * Math.cos(bd.ang);
  if (Math.abs(bd.vx || 0) + Math.abs(bd.vy || 0) > 100) bd.dir = (tx * (bd.vx || 0) + ty * (bd.vy || 0)) >= 0 ? 1 : -1;
}
const pauseOf = (state) => (config.CREATURES.GRIP.EVERY_BY_DIFF[diffOf(state)] ?? 1);
function schedule(state, cr) {
  const A = BD().ATTACK, P = BD().PHASE;
  cr.bird.nextT = rand(cr, A.EVERY[0], A.EVERY[1]) * pauseOf(state) * (cr.phase >= 3 ? P.PAUSE_MUL : 1);
}
const canAttack = (state) => state.phase === 'flying' && !state.ship.down && !state.goingDown;
const aboardNow = (state, cr) => Object.values(state.players).some((q) => q.on && q.on.cr === cr);
const everyone = () => true; // (a telegraph for every phone: warnCrew's test)

// ---- the phases ----
function enterPhase(state, cr, ph) {
  const A = BD().ATTACK, d = BIRD_PHASES[ph], h = cr.hooks;
  cr.phase = ph;
  cr.ai.breather = A.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (d.banner) {
    banner(state, d.banner, A.BANNER);
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['thunder']);
  state.ship.shake = Math.max(state.ship.shake || 0, config.CREATURES.PHASE.SHAKE);
  pop(state, cr.x, cr.y - 1300, d.name, '#9fd8ff', 2.2);
  h.puff(cr.x, cr.y - 400, '#ffffff', 16);
}
function checkPhase(state, cr) {
  const P = BD().PHASE, frac = cr.hp / cr.maxHp;
  let want = 1;
  if (frac < P.TWO_HP || pluckedCount(cr) >= 1) want = 2;
  if (frac < P.THREE_HP) want = 3;
  if (want > cr.phase) enterPhase(state, cr, want);
}

// ---- hits: what a blow does beyond its damage (creatureSystem.js hurtCreature) ----
export function birdMul(state, cr, p, src) {
  const B = BD(), bd = cr.bird;
  let m = 1;
  if (bd.dazed > 0) m *= B.PASS.DAZED_MUL; // knocked silly by its own pass
  if (p.kind === 'heart' && bd.glow > 0) m *= B.SWALLOW.GLOW_MUL; // the open gizzard
  if (src === 'coil' && state.coil && state.coil.drunk > 0) m *= B.DRINK.MUL; // the coil is firing a lightning bolt back at it
  return m;
}
export function birdHit(state, cr, p, dmg, src, opts = {}) {
  const B = BD(), bd = cr.bird;
  if (bd.mode === 'perch' && bd.perch && bd.perch.landed && bd.perch.sub !== 'lift' && src !== 'sword') { // hurt enough on the bag and it leaves (a boarder's blows at the gizzard do not count)
    bd.perch.dmg += dmg * (src === 'flame' ? B.PERCH.FLAME_DRIVE : 1);
    if (bd.perch.dmg >= B.PERCH.DRIVE_DMG * cr.maxHp) driveOff(state, cr, src === 'flame' ? 'flame' : 'shot');
  }
  if (p.kind === 'heart' && bd.glow > 0 && src === 'coil' && !cr.dying) { // a coil bolt into the glowing gizzard (a drunk bolt counts more)
    const drunk = !!(state.coil && state.coil.drunk > 0);
    cr.zapped += drunk ? B.DRINK.HITS : 1;
    cr.stats.zaps = cr.zapped;
    const g = p.segs[0];
    pop(state, g.x, g.y - 220, 'ZAPPED! ' + Math.min(B.ZAP.HITS, cr.zapped) + '/' + B.ZAP.HITS, '#ffe97a', 1.8);
    cr.hooks.puff(g.x, g.y, '#fff7a8', 12);
    state.sfxQ.push(['thunder']);
    if (cr.zapped < B.ZAP.HITS) banner(state, 'BOLT IN THE GIZZARD! ' + Math.min(B.ZAP.HITS, cr.zapped) + '/' + B.ZAP.HITS, 2.2);
    for (const q of Object.values(state.players)) if (!q.bot && cr.hooks.phoneFx && q.id === opts.who) cr.hooks.phoneFx(q, 'ZAPPED IT! ' + Math.min(B.ZAP.HITS, cr.zapped) + '/' + B.ZAP.HITS, [40, 30, 40]);
  }
  if (src === 'mortar' && birdOnSpire(cr) && !cr.dying) { // a mortar shell on the resting bird
    cr.mortared += 1;
    cr.stats.mortar = cr.mortared;
    const m = cr.parts.find((q) => q.kind === 'mantle').segs[0];
    pop(state, m.x, m.y - 420, 'MORTAR HIT! ' + Math.min(B.ROOST.MORTAR_HITS, cr.mortared) + '/' + B.ROOST.MORTAR_HITS, '#ff9a2e', 1.8);
    cr.hooks.puff(m.x, m.y, '#ffd9a0', 12);
    state.sfxQ.push(['impact']);
    if (cr.mortared < B.ROOST.MORTAR_HITS) banner(state, 'MORTAR HIT! ' + cr.mortared + '/' + B.ROOST.MORTAR_HITS, 2);
  }
  if (p.kind === 'wing' && p.severed && !p.plucked) { // a wing plucked bare
    p.plucked = true;
    cr.stats.plucked = pluckedCount(cr);
    const w = p.segs[0] || cr;
    if (!cr.dying) {
      if (pluckedCount(cr) < 2) banner(state, 'A WING IS PLUCKED! IT FLIES LOPSIDED!', 2.8);
      pop(state, (w.x ?? cr.x), (w.y ?? cr.y) - 300, 'PLUCKED!', '#9fd8ff', 1.8);
      state.sfxQ.push(['screech']);
    }
  }
}
export function birdWays(cr, p, src) {
  const B = BD(), ways = [];
  if (pluckedCount(cr) >= 2) ways.push('pluck');
  if (cr.zapped >= B.ZAP.HITS) ways.push('gizzard');
  if (cr.mortared >= B.ROOST.MORTAR_HITS) ways.push('mortar');
  if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
  if (cr.hp <= 0) ways.push('hp');
  return ways;
}

// ---- the main step ----
export function stepBird(state, cr, ship, dt) {
  const B = BD(), bd = cr.bird, mid = shipMid(ship);
  bd.age += dt;
  bd.dazed = Math.max(0, bd.dazed - dt);
  if (cr.ai.breather > 0) cr.ai.breather -= dt;
  if (cr.dying) { stepDying(state, cr, dt); return; }
  if (bd.mode === 'arrive') stepArrive(state, cr, ship, dt, mid);
  else {
    checkPhase(state, cr);
    if (bd.mode === 'fly') stepFly(state, cr, ship, dt, mid);
    else if (bd.mode === 'perch') stepPerch(state, cr, ship, dt, mid);
    else if (bd.mode === 'roost') stepRoost(state, cr, ship, dt, mid);
  }
  if (bd.glow > 0 && (bd.glow -= dt) <= 0) { bd.glow = 0; hideGizzard(cr); }
  if (bd.glow > 0) { const gs = partOf(cr, 'heart') && partOf(cr, 'heart').segs[0]; if (gs) state.flashes.push({ x: gs.x, y: gs.y, ang: 0, t: dt * 1.6, color: '#9fe8ff', size: config.FLAME.GLOW * 1.6, glow: true }); } // (the swallowed bolt lights the dark round the gizzard)
  // the picture's inputs: pitch from the flight, the velocity (for the guns' lead)
  const v = { x: (cr.base.x - bd.prev.x) / Math.max(dt, 1e-4), y: (cr.base.y - bd.prev.y) / Math.max(dt, 1e-4) };
  if (Math.hypot(v.x, v.y) > 6000) { v.x = v.y = 0; } // (a snap, not a flight)
  bd.vx = v.x;
  bd.vy = v.y;
  cr.mvx = v.x;
  cr.mvy = v.y;
  bd.prev.x = cr.base.x;
  bd.prev.y = cr.base.y;
  const flying = bd.mode === 'fly' || bd.mode === 'arrive';
  const moving = Math.hypot(v.x, v.y) > 220;
  bd.pitch = flying && moving ? clamp(Math.atan2(-v.y, Math.max(180, Math.abs(v.x))), -(bd.act && bd.act.kind === 'pass' && bd.act.sub === 'dive' ? 1.3 : B.FLY.MAX_PITCH), B.FLY.MAX_PITCH) : 0;
  bd.rotAdd = oneWing(cr) && flying ? B.ONE_WING.ROT : 0;
}
function hideGizzard(cr) { const g = partOf(cr, 'heart'); if (g) g.hidden = true; }
function showGizzard(cr) { const g = partOf(cr, 'heart'); if (g) g.hidden = false; }

function stepDying(state, cr, dt) {
  const bd = cr.bird;
  bd.pose = 'dying';
  bd.act = null;
  bd.glow = 0;
  cr.swoop = cr.gust = null;
  if (bd.perch) releasePerch(state, cr);
  if (bd.roost) releaseRoost(cr);
  void dt;
}
// It has died (creatureSystem.js die): no more weight on her bag, nothing to rest on.
export function birdDied(state, cr) {
  const bd = cr.bird;
  bd.mode = 'dying';
  bd.act = null;
  bd.glow = 0;
  cr.swoop = cr.gust = null;
  hideGizzard(cr);
  if (bd.perch) releasePerch(state, cr);
  if (bd.roost) releaseRoost(cr);
  if (state.ships) for (const sh of state.ships) if (sh.ctx.stormJob && sh.ctx.stormJob.charge && sh.ctx.stormJob.charge.bird) sh.ctx.stormJob.charge = null; // (a bolt it had called is called off)
}

// ---- arriving ----
function stepArrive(state, cr, ship, dt, mid) {
  const B = BD(), bd = cr.bird, S = B.SPAWN;
  bd.ang += bd.dir * omega(cr) * dt;
  const o = orbitPos(cr, centreOf(cr, mid)), k = 1 - smooth(bd.age / S.ARRIVE);
  cr.base.x = o.x + bd.off.x * k;
  cr.base.y = o.y + bd.off.y * k;
  bd.pose = 'cruise';
  face(cr, sgn(mid.x - cr.base.x));
  if (bd.age >= S.ARRIVE) {
    cr.mode = 'idle';
    bd.mode = 'fly';
    rejoin(cr, mid);
    state.sfxQ.push(['screech']);
    banner(state, cr.name + ' CIRCLES THE SHIP!', 3);
  }
}

// ---- flying: the loop and the attacks that leave it ----
function stepFly(state, cr, ship, dt, mid) {
  const B = BD(), bd = cr.bird, a = bd.act;
  if (a) {
    if (a.kind === 'gust') return stepGust(state, cr, ship, dt, mid, a);
    if (a.kind === 'pass') return stepPass(state, cr, ship, dt, mid, a);
    if (a.kind === 'dive') return stepDive(state, cr, ship, dt, mid, a);
    if (a.kind === 'swallow') return stepSwallow(state, cr, ship, dt, mid, a);
  }
  bd.ang += bd.dir * omega(cr) * dt;
  const o = orbitPos(cr, centreOf(cr, mid)), map = state.course && state.course.map;
  follow(cr, o.x, map ? Math.min(o.y, floorBelow(map, o.x, o.y) - B.FLY.CLEAR) : o.y, B.FLY.FOLLOW, dt);
  bd.pose = 'cruise';
  if (Math.abs(bd.vx || 0) > B.FLY.FLIP_VX) face(cr, sgn(bd.vx));
  if ((bd.nextT -= dt) > 0 || cr.ai.breather > 0 || !canAttack(state)) return;
  startAttack(state, cr, ship, mid);
}
const spiresOf = (state) => (state.course && state.course.map && state.course.map.spires) || [];
// The rock spire nearest the ship that is within the roost's REACH sideways (so a mortar on her deck can reach the bird), or null.
function pickSpire(state, mid) {
  let best = null, bd = Infinity;
  for (const sp of spiresOf(state)) {
    const d = Math.abs(sp.x - mid.x);
    if (d <= BD().ROOST.REACH && d < bd) { bd = d; best = sp; }
  }
  return best;
}
function startAttack(state, cr, ship, mid) {
  const B = BD(), A = B.ATTACK, R = B.ROOST, bd = cr.bird, f = forcedWin();
  const spire = pickSpire(state, mid);
  const perchOk = cr.age >= A.FIRST_PERCH && cr.age - bd.lastPerch >= A.PERCH_EVERY && !!ship.layout.gasbags.length;
  if (f === 'mortar') { // the gate's dev flag: nothing but roosts, soon and often, so a mortar has something to shoot at
    if (spire && cr.age >= R.FIRST_IF_FORCED && cr.age - bd.lastRoost >= R.EVERY_IF_FORCED) startRoost(state, cr, ship, mid, spire);
    else bd.nextT = 1;
    return;
  }
  if (f === 'board') { // ...and for boarding: perches on her bag and roosts on the spire
    if (spire && cr.age >= R.FIRST_IF_FORCED && cr.age - bd.lastRoost >= R.EVERY_IF_FORCED && (cr.age - bd.lastPerch < B.PERCH.EVERY_IF_FORCED || !ship.layout.gasbags.length)) startRoost(state, cr, ship, mid, spire);
    else if (cr.age >= B.PERCH.FIRST_IF_FORCED && cr.age - bd.lastPerch >= B.PERCH.EVERY_IF_FORCED && ship.layout.gasbags.length) startPerch(state, cr, ship, mid);
    else bd.nextT = 1;
    return;
  }
  if (spire && f !== 'gizzard' && cr.age >= R.FIRST && cr.age - bd.lastRoost >= R.EVERY) { startRoost(state, cr, ship, mid, spire); return; }
  const wts = { ...A.WEIGHTS[Math.min(3, cr.phase)] };
  if (!perchOk) wts.perch = 0;
  if (f === 'gizzard') { wts.swallow = 4; wts.dive = 2; wts.gust = 1; wts.pass = 0; wts.perch = 0; }
  const total = Object.values(wts).reduce((s, v) => s + v, 0);
  if (total <= 0) { bd.nextT = 2; return; }
  let r = cr.hooks.rng() * total, kind = 'gust';
  for (const [k, w] of Object.entries(wts)) { if ((r -= w) <= 0) { kind = k; break; } }
  if (kind === 'gust') startGust(state, cr, ship, mid);
  else if (kind === 'pass') startPass(state, cr, ship, mid);
  else if (kind === 'dive') { if (!startDive(state, cr, ship, mid)) schedule(state, cr); }
  else if (kind === 'swallow') startSwallow(state, cr, ship, mid);
  else if (!startPerch(state, cr, ship, mid)) schedule(state, cr);
}

// ---- GUST ----
function startGust(state, cr, ship, mid) {
  const bd = cr.bird, sd = sgn(cr.base.x - mid.x);
  bd.act = { kind: 'gust', sub: 'move', t: 0, sd };
  cr.stats.gusts += 1;
  bd.lastAct = 'gust';
}
function stepGust(state, cr, ship, dt, mid, a) {
  const B = BD(), G = B.GUST, bd = cr.bird;
  a.t += dt;
  const tx = mid.x + a.sd * G.STAND[0], ty = mid.y - G.STAND[1];
  if (a.sub === 'move') {
    bd.pose = 'cruise';
    const left = flyTo(cr, tx, ty, G.STAND_SPEED, dt);
    if (Math.abs(bd.vx || 0) > B.FLY.FLIP_VX) face(cr, sgn(bd.vx));
    if (left < 140 || a.t > 4) { // in place: the wings rear back (the telegraph: banner, a buzz on every phone, a screech)
      a.sub = 'rear';
      a.t = 0;
      face(cr, sgn(mid.x - cr.base.x));
      banner(state, 'THE THUNDERBIRD REARS ITS WINGS! BRACE FOR A GUST!', G.WIND + 0.8);
      state.sfxQ.push(['screech']);
      warnCrew(state, cr, ship, everyone, 'GUST COMING! Hold on - get off the open decks!', [200, 60, 200, 60, 200]);
      cr.gust = { x: cr.base.x, y: cr.base.y, dir: -a.sd, t: 0, beat: false };
    }
    return;
  }
  follow(cr, tx, ty, 5, dt, 1600); // (hovering beside her as she flies on)
  face(cr, sgn(mid.x - cr.base.x));
  if (cr.gust) { cr.gust.x = cr.base.x; cr.gust.y = cr.base.y; cr.gust.t = a.t; }
  if (a.sub === 'rear') {
    bd.pose = 'rear';
    if (a.t >= G.WIND) { // the downstroke: the shove
      a.sub = 'beat';
      a.t = 0;
      bd.pose = 'beat';
      state.sfxQ.push(['whoosh']);
      state.sfxQ.push(['whoosh']);
      state.ship.shake = Math.max(state.ship.shake || 0, G.SHAKE);
      if (cr.gust) cr.gust.beat = true;
      if (ship.sim && ship.sim.air) ship.sim.air.shove(G.SHOVE, ship.layout.refPoint.x);
      ship.pose.vy = (ship.pose.vy || 0) + G.VY;
    }
    return;
  }
  if (a.sub === 'beat') {
    bd.pose = 'beat';
    const dir = -a.sd, bag = bagOf(ship);
    ship.pose.x += dir * G.PUSH * dt; // (the rock collision shoves her back out, as the storm's own wind does)
    if (bag) applyForce(ship.ctx, { x: bag.cx, y: bag.cy - bag.ry * 0.3, fx: dir * ship.pose.f * G.FX, fy: G.FX * G.DOWN, source: 'gust' }); // (it leans on the top of the bag: forces.js twists her, kept under FORCES.MAX_DEG)
    cr.stats.gustPush = (cr.stats.gustPush || 0) + G.PUSH * dt;
    if (a.t >= G.BEAT) { a.sub = 'recover'; a.t = 0; cr.gust = null; }
    return;
  }
  bd.pose = 'cruise';
  if (a.t >= G.RECOVER) { bd.act = null; rejoin(cr, mid); schedule(state, cr); }
}

// ---- PASS: a diving pass at the hull ----
function startPass(state, cr, ship, mid) {
  const B = BD(), S = B.PASS, bd = cr.bird, b = ship.layout.bounds;
  const sd = sgn(cr.base.x - mid.x), nearRight = sd * ship.pose.f > 0;
  const sx = nearRight ? b.x1 - 120 : b.x0 + 120, sy = (b.y0 + b.y1) / 2 - 80;
  bd.act = { kind: 'pass', sub: 'wind', t: 0, sd, sx, sy, lock: null, dir: null, hit: false, esc: null };
  cr.stats.passes += 1;
  bd.lastAct = 'pass';
  const q = entry(ship, sx, sy);
  banner(state, 'THE THUNDERBIRD DIVES! BRACE FOR IMPACT!', S.WIND + 0.8);
  state.sfxQ.push(['screech']);
  warnCrew(state, cr, ship, (p) => Math.abs(p.x - sx) <= 700, 'DIVING PASS! HOLD ON!', [200, 60, 200, 60, 200]);
  cr.swoop = { x: q.x, y: q.y, t: 0, locked: false };
}
function stepPass(state, cr, ship, dt, mid, a) {
  const B = BD(), S = B.PASS, bd = cr.bird;
  a.t += dt;
  const q = entry(ship, a.sx, a.sy);
  if (a.sub === 'wind' || a.sub === 'lock') {
    if (cr.swoop) { cr.swoop.x = q.x; cr.swoop.y = q.y; cr.swoop.t = a.t; }
    const tx = q.x + a.sd * S.START[0], ty = q.y - S.START[1];
    bd.pose = 'wind';
    flyTo(cr, tx, ty, B.GUST.STAND_SPEED, dt);
    if (Math.abs(bd.vx || 0) > B.FLY.FLIP_VX) face(cr, sgn(bd.vx)); else face(cr, -a.sd);
    if (a.sub === 'wind' && a.t >= S.WIND - S.LOCK) { // locks on: she can still dodge, but not by much
      a.sub = 'lock';
      const t = Math.max(0.3, Math.hypot(q.x - cr.base.x, q.y - cr.base.y) / S.DIVE);
      a.lock = { x: q.x + ship.pose.vx * t * S.LEAD * 3, y: q.y + (ship.pose.vy || 0) * t * S.LEAD * 3 };
      if (cr.swoop) cr.swoop.locked = true;
    }
    if (a.t >= S.WIND) {
      a.sub = 'dive';
      a.t = 0;
      const dx = a.lock.x - cr.base.x, dy = a.lock.y - cr.base.y, d = Math.hypot(dx, dy) || 1;
      a.dir = { x: dx / d, y: dy / d };
      face(cr, sgn(a.dir.x));
      state.sfxQ.push(['whoosh']);
    }
    return;
  }
  if (a.sub === 'dive') {
    bd.pose = 'dive';
    cr.base.x += a.dir.x * S.DIVE * dt;
    cr.base.y += a.dir.y * S.DIVE * dt;
    bd.aim = toBodyAngle(cr, a.dir.x, a.dir.y);
    if (cr.swoop) { cr.swoop.x = a.lock.x; cr.swoop.y = a.lock.y; cr.swoop.t = a.t; }
    if (passTouches(state, cr, ship, a)) passHit(state, cr, ship, a, q);
    else if (a.t > S.MISS_AFTER || (a.lock.x - cr.base.x) * a.dir.x + (a.lock.y - cr.base.y) * a.dir.y < -900) { // it flew through where she was
      pop(state, cr.base.x, cr.base.y - 300, 'MISSED!', '#ffffff', 1.2);
      a.sub = 'escape';
      a.t = 0;
      a.esc = { x: a.dir.x * 0.6, y: -0.8 };
    }
    return;
  }
  // escape: climb away, dazed if it hit
  bd.pose = 'cruise';
  cr.swoop = null;
  const e = a.esc || { x: a.dir.x * 0.6, y: -0.8 }, el = Math.hypot(e.x, e.y) || 1;
  cr.base.x += (e.x / el) * B.FLY.SPEED * 1.7 * dt;
  cr.base.y += (e.y / el) * B.FLY.SPEED * 1.7 * dt;
  if (a.t >= 1.7) { bd.act = null; rejoin(cr, mid); schedule(state, cr); }
}
function passTouches(state, cr, ship, a) {
  const S = BD().PASS, torso = partOf(cr, 'mantle');
  if (!torso || !torso.segs[0]) return false;
  const s = torso.segs[0];
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const x = s.x + Math.cos(s.ang) * s.len * u, y = s.y + Math.sin(s.ang) * s.len * u;
    if (ship.sim.hitsShip(toShipX(ship, x), toShipY(ship, y))) return true;
  }
  const m = beakAt(cr);
  return ship.sim.hitsShip(toShipX(ship, m.x), toShipY(ship, m.y)) || Math.hypot(a.lock.x - cr.base.x, a.lock.y - cr.base.y) < S.HIT_R * 0.5;
}
function passHit(state, cr, ship, a, q) {
  const S = BD().PASS, bd = cr.bird, sim = ship.sim, h = cr.hooks;
  a.hit = true;
  a.sub = 'escape';
  a.t = 0;
  a.esc = { x: -a.dir.x * 0.3, y: -0.95 };
  bd.dazed = S.DAZED;
  cr.stats.passHits += 1;
  creatureHit(ship, a.sx, a.sy, S.HULL, { power: S.POWER }); // (STRUCTURE.md WP2: the segment it strikes)
  hitForce(ship.ctx, a.sx, a.sy, S.POWER);
  ship.pose.vy = (ship.pose.vy || 0) + a.dir.y * 120;
  if (sim && sim.air) sim.air.shove(S.SHOVE, a.sx);
  state.ship.shake = Math.max(state.ship.shake || 0, S.SHAKE);
  for (const p of Object.values(state.players)) { // crew near the impact lose a heart (never a one-shot) and are thrown about
    if (shipOf(state, p) !== ship || p.fly || p.fall || p.conn != null || p.ko > 0 || p.d == null) continue;
    const px = toWorldX(ship, p.x), py = toWorldY(ship, p.y);
    if (Math.hypot(px - q.x, py - q.y) > S.HURT_R) continue;
    const res = hurt(p, 1, { cause: 'slap' });
    if (res === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
    else if (res && !p.lock && sim && sim.air) { p.tossed = true; sim.air.startFlight(p, -a.dir.x * S.FLING, -S.FLING); }
    if (res && h.phoneFx) h.phoneFx(p, 'THE THUNDERBIRD HIT THE SHIP!', [200, 60, 200]);
  }
  pop(state, q.x, q.y - 200, 'PASS!', '#9fd8ff', 1.8);
  h.puff(q.x, q.y, '#ffe9a8', 14);
  state.sfxQ.push(['impact']);
  banner(state, 'IT HIT US! IT IS DAZED - HIT IT NOW!', 2.4);
}

// ---- LIGHTNING DIVE: it calls bolts down through the storm's own strike system ----
const boltJob = (ship) => ship.ctx.stormJob;
function startDive(state, cr, ship, mid) {
  const bd = cr.bird, J = boltJob(ship);
  if (!J || !J.call) return false;
  bd.act = { kind: 'dive', sub: 'move', t: 0, n: 0, total: BD().DIVE.BOLTS[Math.min(3, cr.phase)] || 2, gap: 0, live: false, lastN: J.n || 0, sd: sgn(cr.base.x - mid.x) };
  cr.stats.dives += 1;
  bd.lastAct = 'dive';
  return true;
}
function stepDive(state, cr, ship, dt, mid, a) {
  const B = BD(), Dv = B.DIVE, bd = cr.bird, J = boltJob(ship), ph = Math.min(3, cr.phase);
  a.t += dt;
  const tx = mid.x + a.sd * 500, ty = mid.y - Dv.UP;
  if (a.sub === 'move') {
    bd.pose = 'cruise';
    const left = flyTo(cr, tx, ty, Dv.MOVE_SPEED, dt);
    if (Math.abs(bd.vx || 0) > B.FLY.FLIP_VX) face(cr, sgn(bd.vx));
    if (left < 140 || a.t > 4) { // over her: it rears and calls the lightning (the telegraph: a banner, a buzz on every phone, thunder)
      a.sub = 'call';
      a.t = 0;
      face(cr, sgn(mid.x - cr.base.x));
      banner(state, 'LIGHTNING DIVE! HOLD A LIGHTNING ROD - A MANNED COIL DRINKS THE BOLTS!', Dv.CALL + 1);
      state.sfxQ.push(['thunder']);
      warnCrew(state, cr, ship, everyone, 'LIGHTNING DIVE! Run to a ROD on the top deck and HOLD ACTION - or man the COIL!', [200, 60, 200, 60, 200]);
    }
    return;
  }
  follow(cr, tx, ty, 5, dt, 1600);
  face(cr, sgn(mid.x - cr.base.x));
  bd.pose = 'rear';
  if (a.sub === 'call') {
    if (a.t >= Dv.CALL) { a.sub = 'bolts'; a.t = 0; a.gap = 0; }
    return;
  }
  if (a.sub === 'bolts') {
    if (a.live) { // a bolt is charging: did it strike?
      if (J && J.last && J.last.n > a.lastN) {
        a.lastN = J.last.n;
        a.live = false;
        a.gap = Dv.GAP[ph];
        if (J.last.drank) { cr.stats.drunk += 1; banner(state, 'THE COIL DRANK THE BOLT! FIRE IT BACK!', 2.6); }
        else if (J.last.grounded) cr.stats.grounded += 1;
        else cr.stats.struck += 1;
      } else if (!J || !J.charge) { a.live = false; a.gap = 0.5; }
    } else if (a.n >= a.total) {
      a.sub = 'recover';
      a.t = 0;
      return;
    } else if ((a.gap -= dt) <= 0 && J && J.call({ warn: Dv.WARN[ph], pick: cr.hooks.rng(), power: Dv.POWER_MUL })) {
      a.live = true;
      a.n += 1;
      cr.stats.bolts += 1;
      banner(state, 'BOLT ' + a.n + '/' + a.total + '! HOLD A ROD!', Dv.WARN[ph] + 0.4);
      state.sfxQ.push(['thunder']);
      warnCrew(state, cr, ship, everyone, 'BOLT COMING! HOLD A ROD!', [120, 60, 120]);
    }
    if (a.t > 40) { a.sub = 'recover'; a.t = 0; }
    return;
  }
  bd.pose = 'cruise';
  if (a.t >= Dv.RECOVER) { bd.act = null; rejoin(cr, mid); schedule(state, cr); }
}

// ---- SWALLOW: it swallows a bolt of the storm and the gizzard glows ----
function startSwallow(state, cr, ship, mid) {
  const bd = cr.bird;
  bd.act = { kind: 'swallow', sub: 'move', t: 0, sd: sgn(cr.base.x - mid.x) };
  cr.stats.swallows += 1;
  bd.lastAct = 'swallow';
}
function stepSwallow(state, cr, ship, dt, mid, a) {
  const B = BD(), Sw = B.SWALLOW, bd = cr.bird, ph = Math.min(3, cr.phase);
  a.t += dt;
  const tx = mid.x + a.sd * 400, ty = mid.y - Sw.UP;
  if (a.sub === 'move') {
    bd.pose = 'cruise';
    const left = flyTo(cr, tx, ty, Sw.MOVE_SPEED, dt);
    if (Math.abs(bd.vx || 0) > B.FLY.FLIP_VX) face(cr, sgn(bd.vx));
    if (left < 140 || a.t > 4) {
      a.sub = 'call';
      a.t = 0;
      face(cr, sgn(mid.x - cr.base.x));
      banner(state, 'THE THUNDERBIRD THROWS BACK ITS HEAD - IT IS SWALLOWING A BOLT!', Sw.CALL + 1);
      state.sfxQ.push(['thunder']);
      warnCrew(state, cr, ship, everyone, 'IT IS SWALLOWING A BOLT! Its gizzard will glow - COIL IT!', [150, 60, 150, 60, 250]);
    }
    return;
  }
  follow(cr, tx, ty, 5, dt, 1600);
  face(cr, sgn(mid.x - cr.base.x));
  if (a.sub === 'call') {
    bd.pose = 'swallow';
    if (a.t >= Sw.CALL) { // down it goes: a bolt from the sky into its beak, and the gizzard glows
      a.sub = 'glow';
      a.t = 0;
      const m = beakAt(cr), w = state.weather;
      if (w) { w.bolt = { x: m.x, y: m.y, t: 0.35 }; w.flash = 1; }
      cr.hooks.puff(m.x, m.y, '#fff7a8', 14);
      state.sfxQ.push(['thunder']);
      bd.glowMax = Sw.GLOW[ph];
      bd.glow = bd.glowMax;
      showGizzard(cr);
      cr.stats.windows += 1;
      banner(state, 'THE GIZZARD GLOWS! COIL-BOLT IT! (' + Math.min(B.ZAP.HITS, cr.zapped) + '/' + B.ZAP.HITS + ')', Math.min(bd.glowMax, 5));
      for (const p of Object.values(state.players)) {
        if (p.bot || p.fly || p.fall || shipOf(state, p) !== ship || !ship.layout.kindOf || ship.layout.kindOf(p.lock) !== 'coil') continue;
        if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'GIZZARD GLOWING! Aim UP at the bird and FIRE the coil!', [90, 40, 90]);
      }
    }
    return;
  }
  if (a.sub === 'glow') {
    bd.pose = 'swallow';
    if (bd.glow <= 0 || a.t > Sw.GLOW[ph] + 1) { a.sub = 'recover'; a.t = 0; }
    return;
  }
  bd.pose = 'cruise';
  if (a.t >= Sw.RECOVER) { bd.act = null; rejoin(cr, mid); schedule(state, cr); }
}

// ---- PERCH (on her gasbag): the Drake's perch with a bird's feet ----
const biggestBag = (L) => L.gasbags.reduce((best, g) => (!best || g.rx * g.ry > best.rx * best.ry ? g : best), null);
function perchBase(ship, px, top) {
  const f = ship.pose.f || 1, e = entry(ship, px, top + BD().PERCH.ABOVE), o = standOffset('perch');
  return { x: e.x - o.x * f, y: e.y - o.y };
}
function startPerch(state, cr, ship, mid) {
  const B = BD(), P = B.PERCH, bd = cr.bird, bag = biggestBag(ship.layout);
  if (!bag) return false;
  const u = (cr.hooks.rng() * 2 - 1) * 0.35, px = bag.cx + u * bag.rx, top = bag.cy - bag.ry * Math.sqrt(Math.max(0, 1 - u * u));
  const pl = ship.layout.platforms[topDeck(ship)];
  bd.mode = 'perch';
  bd.act = null;
  bd.lastAct = 'perch';
  bd.perch = { sub: 'glide', t: 0, landed: false, left: P.TIME * (P.TIME_BY_DIFF[diffOf(state)] ?? 1), claw: P.CLAW * 0.6, dmg: 0, px, top, bag: ship.layout.gasbags.indexOf(bag), shakeT: 0, aboard: 0, driven: null,
    job: { name: 'hack', prog: 0, worked: false, live: false, d: topDeck(ship), x: pl ? clamp(px, pl.x0 + 60, pl.x1 - 60) : px, hot: 0 } };
  cr.perch = bd.perch;
  cr.stats.perches += 1;
  face(cr, ship.pose.f || 1);
  banner(state, 'THE THUNDERBIRD IS LANDING ON THE GASBAG!', P.WIND + 1);
  state.sfxQ.push(['screech']);
  warnCrew(state, cr, ship, everyone, 'IT IS LANDING ON THE BAG! Swords up on the top deck - or turn hard!', [150, 60, 150, 60, 250]);
  void mid;
  return true;
}
function releasePerch(state, cr) {
  const bd = cr.bird;
  for (const sh of state.ships) if (sh.ctx.perch) sh.ctx.perch = null;
  if (bd.perch) bd.perch.job.live = false;
  bd.perch = null;
  cr.perch = null;
  bd.lastPerch = cr.age;
}
function driveOff(state, cr, why) {
  const bd = cr.bird, pc = bd.perch;
  if (!pc || pc.sub === 'lift') return;
  pc.sub = 'lift';
  pc.t = 0;
  pc.driven = why;
  pc.job.live = false;
  cr.stats.driven[why] = (cr.stats.driven[why] || 0) + 1;
  const text = { sword: 'DRIVEN OFF BY SWORDS!', shot: 'DRIVEN OFF!', flame: 'BURNT OFF THE BAG!', shake: 'SHAKEN OFF!', time: 'IT FLIES OFF', gone: 'IT FLIES OFF' }[why] || 'DRIVEN OFF!';
  if (why !== 'time') banner(state, text, 2.2);
  pop(state, cr.x, cr.y - 700, text, '#8fe388', 1.6);
  state.sfxQ.push(['screech']);
}
function stepPerch(state, cr, ship, dt, mid) {
  const B = BD(), P = B.PERCH, bd = cr.bird, pc = bd.perch;
  if (!pc || !state.ships.includes(ship)) { bd.mode = 'fly'; bd.perch = null; rejoin(cr, mid); schedule(state, cr); return; }
  pc.t += dt;
  const bag = ship.layout.gasbags[pc.bag];
  const tgt = perchBase(ship, pc.px, pc.top);
  face(cr, ship.pose.f || 1);
  if (pc.sub === 'glide') {
    bd.pose = pc.t > P.WIND - 0.7 ? 'perch' : 'liftoff';
    follow(cr, tgt.x, tgt.y, 2.6, dt, 2200);
    if ((pc.t >= P.WIND && Math.hypot(cr.base.x - tgt.x, cr.base.y - tgt.y) < 200) || pc.t > P.WIND + 3) {
      pc.sub = 'on';
      pc.t = 0;
      pc.landed = true;
      pc.job.live = true;
      state.ship.shake = Math.max(state.ship.shake || 0, 1);
      hitForce(ship.ctx, pc.px, pc.top, 3);
      pop(state, cr.base.x, cr.base.y - 500, 'THUD!', '#9fd8ff', 1.6);
      cr.hooks.puff(cr.base.x, cr.base.y, '#d9cbb0', 14);
      state.sfxQ.push(['impact']);
      banner(state, 'THE THUNDERBIRD IS ON THE GASBAG! DRIVE IT OFF - OR TURN HARD!', 3.2);
    }
    return;
  }
  if (pc.sub === 'lift') {
    bd.pose = 'liftoff';
    ship.ctx.perch = null;
    pc.job.live = false;
    cr.base.x += (tgt.x - cr.base.x) * Math.min(1, 6 * dt);
    cr.base.y -= 1400 * dt * smooth(pc.t / P.LIFTOFF + 0.2);
    cr.base.x += ship.pose.f * 500 * dt;
    if (pc.t >= P.LIFTOFF) { releasePerch(state, cr); bd.mode = 'fly'; bd.pose = 'cruise'; rejoin(cr, mid); schedule(state, cr); }
    return;
  }
  // on the bag: it rides her, its weight tips her and pushes her down, it claws
  bd.pose = 'perch';
  cr.base.x = tgt.x;
  cr.base.y = tgt.y;
  ship.ctx.perch = { w: P.MASS, x: pc.px };
  { const e = entry(ship, pc.px, pc.top); pc.wx = e.x; pc.wy = e.y; } // (where it sits, for the TV's ring)
  const acc = P.ACC * clamp(pc.t / 1.2, 0.2, 1);
  applyForce(ship.ctx, { x: pc.px, y: pc.top, fx: 0, fy: acc * P.TORQUE, source: 'perch' });
  if (ship.pose.vy < P.MAX_SINK) ship.pose.vy = Math.min(P.MAX_SINK, ship.pose.vy + acc * dt); // (it sinks her, but never faster than a steady crawl: the helm and the gas can fight that)
  state.ship.shake = Math.max(state.ship.shake || 0, P.SHAKE);
  pc.aboard = aboardNow(state, cr) ? 1 : 0;
  pc.left -= dt * (pc.aboard ? B.BOARD.KEEP_PERCH : 1);
  const job = pc.job, pls = ship.layout.platforms;
  job.d = topDeck(ship);
  if (pls[job.d]) job.x = clamp(pc.px, pls[job.d].x0 + 60, pls[job.d].x1 - 60);
  if (job.hot > 0) { job.hot -= dt; job.worked = true; }
  // CLAW: a hole in the gasbag
  if ((pc.claw -= dt) <= 0 && bag && (pc.clawed || 0) < P.CLAWS) {
    pc.claw = P.CLAW;
    const sx = clamp(pc.px + (cr.hooks.rng() - 0.5) * 500, bag.cx - bag.rx * 0.8, bag.cx + bag.rx * 0.8);
    const u = (sx - bag.cx) / bag.rx, sy = bag.cy - bag.ry * Math.sqrt(Math.max(0, 1 - u * u)) + 36;
    if (ship.ctx.gasHoles.length < config.GAS.MAX_HOLES) {
      ship.ctx.gasHoles.push(ship.sim.gasHoleAt(sx, sy, pc.bag));
      cr.stats.claws += 1;
      pc.clawed = (pc.clawed || 0) + 1;
      pop(state, toWorldX(ship, sx), toWorldY(ship, sy) - 150, 'CLAW!', '#9fd8ff', 1.2);
      cr.hooks.puff(toWorldX(ship, sx), toWorldY(ship, sy), '#6b6258', 6);
      state.sfxQ.push(['impact']);
      if (cr.stats.claws === 1) banner(state, 'IT IS CLAWING THE GASBAG!', 2.4);
    }
  }
  // the ways it leaves: swords, the helm's hard turn, its own time
  if (job.prog >= 1) { job.prog = 0; driveOff(state, cr, 'sword'); return; }
  const turning = ship.ctx.turning && ship.ctx.turning.t > 0;
  pc.vyAvg = (pc.vyAvg ?? ship.pose.vy ?? 0) + ((ship.pose.vy || 0) - (pc.vyAvg ?? ship.pose.vy ?? 0)) * Math.min(1, dt / 1.5); // (what she has been doing for a moment: its own weight sinks her steadily, only a swing away from that is the helm)
  pc.shakeT = Math.abs((ship.pose.vy || 0) - pc.vyAvg) > P.SHAKE_VY ? pc.shakeT + dt : Math.max(0, pc.shakeT - dt * 2);
  if (turning || pc.shakeT >= P.SHAKE_TIME) { driveOff(state, cr, 'shake'); return; }
  if (pc.left <= 0) driveOff(state, cr, 'time');
}

// The crew's side of the perch: the DRIVE IT OFF action (a sword hold, or three blows), shaped like the Kraken's HACK.
function perchNear(state, ship, p) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'thunderbird' || !birdOnBag(cr) || p.d == null || p.fly || p.fall || p.conn != null) return null;
  const pl = ship.layout.platforms[p.d], pc = cr.bird.perch;
  if (!pl || pl.y - pc.top > BD().PERCH.REACH_V || Math.abs(p.x - pc.px) > BD().PERCH.REACH) return null;
  return pc;
}
export function birdPerchAction(state, ship, p) {
  const pc = perchNear(state, ship, p), P = BD().PERCH;
  if (!pc) return null;
  if (p.carry === 'sword') return { type: 'hack', obj: pc.job, hold: true, time: P.SWORD_TIME, label: 'DRIVE IT OFF!' };
  if (p.carry === 'hammer') return { type: 'hack', obj: pc.job, hold: true, time: P.HAMMER_TIME, label: 'DRIVE IT OFF! (hammer: slow)' };
  return { type: 'need', label: 'Need a sword to drive the Thunderbird off!' };
}
export function birdPerchBlow(state, ship, p) {
  const pc = perchNear(state, ship, p), P = BD().PERCH, cr = state.creature;
  if (!pc || (p.carry !== 'sword' && p.carry !== 'hammer')) return false;
  pc.job.prog += (p.carry === 'sword' ? 1 : P.HAMMER_BLOW) / P.BLOWS;
  pc.job.worked = true;
  pc.job.hot = P.BLOW_HOLD;
  p.face = pc.px < p.x ? -1 : 1;
  p.atkCd = config.TOOLS.SWORD_COOLDOWN;
  p.swingT = performance.now();
  const w = entry(ship, pc.px, pc.top);
  cr.hooks.puff(w.x, w.y, '#ffffff', 4);
  pop(state, w.x, w.y - 100, 'whack', '#ffffff', 0.8);
  state.sfxQ.push(['hit']);
  if (pc.job.prog >= 1) birdPerchHacked(state, ship, p, pc.job);
  return true;
}
export function birdPerchHacked(state, ship, p, job) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'thunderbird' || !cr.bird.perch || cr.bird.perch.job !== job) return false;
  job.prog = 0;
  if (state.moment && p) state.moment('creature-freed', { who: [p], data: { creature: cr.name, how: 'perch' } }); // (the Ship's Book)
  driveOff(state, cr, 'sword');
  if (cr.hooks.phoneFx && p) cr.hooks.phoneFx(p, 'You drove it off!', [30, 40, 30]);
  return true;
}
export const birdPerchJobs = (state, ship) => {
  const cr = state.creature;
  if (!cr || cr.kind !== 'thunderbird' || !birdOnBag(cr) || forcedWin() === 'board') return []; // (the gate's dev flag for boarding leaves it sitting there)
  const pc = cr.bird.perch;
  return pc.job.live ? [{ kind: 'hack', obj: pc.job, d: pc.job.d, x: pc.job.x, text: 'DRIVE THE THUNDERBIRD OFF' }] : [];
};
export const birdPerchObjects = (state, ship) => (state.creature && state.creature.kind === 'thunderbird' && state.creature.bird.perch ? [state.creature.bird.perch.job] : []);

// ---- ROOST (on a rock spire of the lair) ----
function startRoost(state, cr, ship, mid, sp) {
  const B = BD(), R = B.ROOST, bd = cr.bird;
  bd.mode = 'roost';
  bd.act = null;
  bd.lastAct = 'roost';
  bd.roost = { sp, sub: 'glide', t: 0, landed: false, left: R.TIME * (R.TIME_BY_DIFF[diffOf(state)] ?? 1), aboard: 0, f: sgn(mid.x - sp.x) }; // (f: which way it faces on the spire: toward her)
  cr.roost = bd.roost;
  cr.stats.roosts += 1;
  banner(state, 'THE THUNDERBIRD SETTLES ON A ROCK SPIRE!', 3);
  state.sfxQ.push(['screech']);
  void ship;
}
function releaseRoost(cr) {
  const bd = cr.bird;
  bd.roost = null;
  cr.roost = null;
  bd.lastRoost = cr.age;
}
function stepRoost(state, cr, ship, dt, mid) {
  const B = BD(), R = B.ROOST, bd = cr.bird, rs = bd.roost;
  if (!rs) { bd.mode = 'fly'; rejoin(cr, mid); schedule(state, cr); return; }
  rs.t += dt;
  const f = rs.f, o = standOffset('roost'), tgt = { x: rs.sp.x - o.x * f, y: rs.sp.top - o.y };
  face(cr, f);
  if (rs.sub === 'glide') {
    bd.pose = 'liftoff';
    const left = flyTo(cr, tgt.x, tgt.y, R.LAND_SPEED, dt);
    if (left < 40 || rs.t > 8) {
      rs.sub = 'on';
      rs.t = 0;
      rs.landed = true;
      cr.base.x = tgt.x;
      cr.base.y = tgt.y;
      state.ship.shake = Math.max(state.ship.shake || 0, 0.8);
      pop(state, cr.base.x, cr.base.y - 700, 'THUD!', '#9fd8ff', 1.6);
      cr.hooks.puff(rs.sp.x, rs.sp.top, '#d9cbb0', 14);
      state.sfxQ.push(['impact']);
      banner(state, 'IT IS RESTING ON THE SPIRE! MORTAR IT - OR BOARD IT!', 3.2);
      for (const p of Object.values(state.players)) if (!p.bot && cr.hooks.phoneFx && !p.fly && !p.fall) cr.hooks.phoneFx(p, 'THE THUNDERBIRD IS ON A ROCK SPIRE! Mortars: FIRE!', [90, 40, 90]);
    }
    return;
  }
  if (rs.sub === 'lift') {
    bd.pose = 'liftoff';
    cr.base.y -= 1400 * dt * smooth(rs.t / R.LIFTOFF + 0.2);
    cr.base.x += f * -300 * dt;
    if (rs.t >= R.LIFTOFF) { releaseRoost(cr); bd.mode = 'fly'; bd.pose = 'cruise'; rejoin(cr, mid); schedule(state, cr); }
    return;
  }
  bd.pose = 'roost';
  cr.base.x = tgt.x;
  cr.base.y = tgt.y;
  rs.aboard = aboardNow(state, cr) ? 1 : 0;
  rs.left -= dt * (rs.aboard ? B.BOARD.KEEP_PERCH : 1);
  rs.wx = rs.sp.x;
  rs.wy = rs.sp.top;
  if (rs.left <= 0 || !canAttack(state)) { rs.sub = 'lift'; rs.t = 0; if (rs.left <= 0) banner(state, 'IT TAKES OFF FROM THE SPIRE', 1.8); state.sfxQ.push(['screech']); }
}
