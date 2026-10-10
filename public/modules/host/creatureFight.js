// THE FIGHT AS A WHOLE (BOSSES.md 2.1 and 3.1, C.3): the phases, the beak's windows, the tow onto rock, and the rules the bots follow. The attacks themselves are creatureGrip.js (grab, slap, dive),
// creatureBreach.js (the lunge), the weapons' damage and the five ways it ends are creatureSystem.js (hurtCreature, die). The numbers are config.CREATURES.PHASE / MOUTH / DIVE / TOW_ROCK.
//   PHASES   1 "IT RISES" (slaps, single grabs), 2 "IT GRABS" (below PHASE.TWO.HP of the pool, or TWO.LOST tentacles gone: grabs as many as the crew can bear, and the lunge), 3 "EXHAUSTED" (below THREE.HP, or THREE.LOST
//            tentacles gone: it surfaces half out of the water, the heart is exposed, the harpoon can tow it onto rock, and it DIVES: several grips at once, pulling her down hard). Each change is a TV banner, a roar, a
//            phone buzz and a BREATHER (cr.ai.breather s without new attacks). cr.phase is 1, 2 or 3.
//   THE BEAK a window opens on a roar every PHASE.P[n].mouthEvery s and stays open mouthFor s (cr.mouthWin): the body swims to put the beak under her bomb bay and a bomb let go inside the FUNNEL falls in.
//            FED bombs (a crate counts half) while it is open is a win (cr.fed).
//   ROCK     in phase 3, while a harpoon line holds it and its body touches rock at the water line, the pool loses TOW_ROCK.RATE hp for every px/s the line hauls it (hurtPool, src 'rock'): a win.
//   stepFight(state, cr, ship, dt)      once a step from creatureSystem.update (not while it sinks)
//   phaseP(cr) / inFunnel / bombInMouth(state) / mouthWindowSoon(state) / forcedSkip(cr, part, gunType)      what the guns, the bomb bay and the bots ask
import { config } from '../../config.js';
import { exposeHeart } from './creature.js';
import { krakenMouth, KRAKEN_PHASES, KRAKEN_MOUTH_TEXT } from './creatures/kraken.js';
import { seaLevel } from './creatureBreach.js';
import { inRock } from './course.js';
import { toWorldX, toWorldY } from './pose.js';
import { mainShip, shipOf } from './ships.js';
import { pop } from './popups.js';

const CR = () => config.CREATURES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const phaseP = (cr) => CR().PHASE.P[(cr && cr.phase) || 1];
const mouthOf = (cr) => cr.parts.find((p) => p.kind === 'mouth');
const tentaclesLost = (cr) => cr.parts.filter((p) => p.kind === 'tentacle' && (p.severed || p.dead)).length;

// ---- the funnel: the beak gapes up through the mantle, so a bomb or crate inside this column falls into it ----
export function inFunnel(cr, x, y) {
  const m = cr && mouthOf(cr);
  if (!m || !m.open || m.dead || !m.segs[0] || cr.mode !== 'idle' || (cr.kind === 'drake' && cr.drake.mode !== 'crawl')) return false; // (the Drake's mouth takes bombs from above only while it crawls)
  const s = m.segs[0], F = CR().MOUTH;
  return Math.abs(x - s.x) <= F.FUNNEL_W && y >= s.y - F.FUNNEL_UP && y <= s.y + s.r;
}
export const mouthOpenNow = (state) => !!state.creature && !state.creature.dying && state.creature.mode === 'idle' && !!mouthOf(state.creature) && mouthOf(state.creature).open && (state.creature.kind !== 'drake' || state.creature.drake.mode === 'crawl');
export const mouthKey = (cr) => (cr && cr.kind === 'drake' ? 'bombs' : 'mouth'); // the FORCE_WIN word for "feed it bombs"

// Where a bomb let go at (x, y) with the ship's speed is after t seconds (course.js stepBomb: the ship's speed is lost to drag, gravity pulls it down).
function bombAt(x, y, vx, t) {
  const B = config.BOMBS, dt = 1 / 30;
  let vy = 60;
  for (let s = 0; s < t; s += dt) { vx += (0 - vx) * Math.min(1, dt * B.DRAG); vy += B.GRAVITY * dt; x += vx * dt; y += vy * dt; }
  return { x, y };
}
// Where the bomb bay's doors are in the world (or, with no bomb bay, the middle of the ship).
function bayPoint(state, ship, live = false) { // (live: the drop line the station keeps current while somebody holds it)
  const bay = ship.layout.bombBay;
  return live && state.bombBay && state.bombBay.from ? state.bombBay.from : bay ? { x: toWorldX(ship, bay.x), y: toWorldY(ship, bay.y) + 20 } : { x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) + 400 };
}
// Would a bomb let go from the bay this moment fall into the open beak? (the bots drop on this; the beak is taken as standing still, as the lure keeps it under her)
export function bombInMouth(state) {
  const cr = state.creature;
  if (!mouthOpenNow(state)) return false;
  const ship = mainShip(state), g = bayPoint(state, ship, true), m = mouthOf(cr).segs[0], vx = ship.pose.vx;
  let x = g.x, y = g.y, v = vx, vy = 60;
  const B = config.BOMBS, dt = 1 / 30;
  for (let s = 0; s < 6; s += dt) {
    v += (0 - v) * Math.min(1, dt * B.DRAG);
    vy += B.GRAVITY * dt;
    x += v * dt;
    y += vy * dt;
    if (inFunnel(cr, x, y)) return true;
    if (y > m.y + m.r + 200) return false;
  }
  return false;
}
// Is a window open, or about to be (within `secs`)? Whoever has the bomb bay should be at it.
export function mouthWindowSoon(state, secs = 4) {
  const cr = state.creature;
  if (!cr || cr.dying || cr.mode === 'surfacing') return false;
  return !!cr.mouthWin || (cr.ai.mouthT !== undefined && cr.ai.mouthT <= secs && !(cr.ai.breather > 0));
}

// Is this aim target (creatureTargets) worth a harpoon? The exhausted creature's body: the harpoon gun may aim at it in phase 3 (aim.js), the bots man it then.
export const towTarget = (cr, t) => !!cr && !cr.dying && (cr.kind === 'drake' ? cr.drake.mode === 'crawl' : cr.phase >= 3) && t.kind === 'creaturePart' && t.part.kind === 'mantle'; // (the Drake: once it crawls)

// The dev / test flag (config.CREATURES.FORCE_WIN): does a bot gun of this type hold its fire at this part? (sever: only tentacles; hp: never tentacles; mouth: nothing, only bombs; tow and board: tentacles
// until phase 3, then nothing - except the harpoon, which hooks the mantle - so the fight can only end the way it was asked to.)
export function forcedSkip(cr, part, gunType) {
  const f = CR().FORCE_WIN;
  if (!f || !cr) return false;
  if (cr.kind === 'drake') { // the Cinder Drake (C.6a): choke = only the glowing mouth; bombs / tow = wings until it crashes, then only bombs / the harpoon; board = nothing (people and one bot board it); flak = only flak guns; hp = anything
    if (f === 'choke') return !(part.kind === 'mouth' && part.open);
    if (f === 'bombs') return cr.phase >= 2 || part.kind !== 'wing';
    if (f === 'tow') return gunType === 'harpoon' ? !(cr.drake.mode === 'crawl' && part.kind === 'mantle') : cr.phase >= 2 || part.kind !== 'wing';
    if (f === 'board') return true;
    if (f === 'flak') return gunType !== 'flak'; // (the flak guns get their own list: aim.js bestTarget)
    return false;
  }
  if (f === 'sever') return part.kind !== 'tentacle';
  if (f === 'hp') return part.kind === 'tentacle';
  if (f === 'mouth') return true;
  if (f === 'tow' && gunType === 'harpoon') return !(cr.phase >= 3 && part.kind === 'mantle');
  if (f === 'tow' || f === 'board') return cr.phase >= 3 || part.kind !== 'tentacle';
  return false;
}

// ---- phases ----
function enterPhase(state, cr, ph) {
  const F = CR().PHASE, D = CR().DIVE, d = KRAKEN_PHASES[ph], ai = cr.ai, h = cr.hooks;
  cr.phase = ph;
  ai.breather = F.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (ph === 2) ai.breachT = Math.max(ai.breachT || 0, F.BREATHER + F.BREACH_FIRST);
  if (ph === 3) {
    exposeHeart(cr);
    ai.diveT = F.BREATHER + D.FIRST;
    ai.mouthT = Math.min(ai.mouthT ?? 1e9, F.BREATHER + phaseP(cr).mouthEvery * CR().MOUTH.P3_FIRST);
  }
  if (d.banner) {
    state.ev.warn = F.BANNER;
    state.ev.warnText = d.banner;
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['roar']);
  if (ph === 3) state.sfxQ.push(['splash']);
  state.ship.shake = Math.max(state.ship.shake || 0, F.SHAKE);
  pop(state, cr.x, cr.y - 1500, d.name, '#ff5a1f', 2.2);
  h.puff(cr.x, cr.y - 600, '#ffffff', 16);
}
function checkPhase(state, cr) {
  const F = CR().PHASE, frac = cr.hp / cr.maxHp, lost = tentaclesLost(cr);
  let want = 1;
  if (frac < F.TWO.HP || lost >= F.TWO.LOST) want = 2;
  if (frac < F.THREE.HP || lost >= F.THREE.LOST) want = 3;
  if (want > (cr.phase || 1)) enterPhase(state, cr, want);
}

// ---- the beak's windows ----
function openWindow(state, cr, P) {
  const M = CR().MOUTH, h = cr.hooks;
  krakenMouth(cr, P.mouthFor);
  cr.mouthWin = { t: 0, left: P.mouthFor };
  cr.stats.windows = (cr.stats.windows || 0) + 1;
  state.sfxQ.push(['roar']);
  state.ev.warn = P.mouthFor; // (the call to the bomb bay beats any lesser banner)
  state.ev.warnText = KRAKEN_MOUTH_TEXT + ' (' + Math.floor(cr.fed) + '/' + M.FED + ')';
  const ship = mainShip(state);
  for (const p of Object.values(state.players)) {
    if (p.bot || p.fly || p.fall || shipOf(state, p) !== ship || !ship.layout.kindOf || ship.layout.kindOf(p.lock) !== 'bombBay') continue;
    if (h.phoneFx) h.phoneFx(p, 'MOUTH OPEN! Hold Action to DROP BOMBS!', [90, 40, 90]);
  }
}
// Swim to put the beak under her bomb bay: the point where a bomb let go now comes down to the beak's height (a ship with no bay: under her middle).
export function lureX(state, cr, ship) {
  const M = CR().MOUTH, m = mouthOf(cr).segs[0], g = bayPoint(state, ship);
  if (!ship.layout.bombBay) return g.x + ship.pose.vx * M.LURE_LEAD;
  const a = config.BOMBS.GRAVITY / 2, dy = Math.max(0, m.y - g.y), t = (-60 + Math.sqrt(3600 + 4 * a * dy)) / (2 * a); // (the fall time from the bay down to the beak)
  return bombAt(g.x, g.y, ship.pose.vx, t).x;
}
function stepMouth(state, cr, ship, dt, P) {
  const ai = cr.ai, M = CR().MOUTH, S = CR().SPAWN, mouth = mouthOf(cr);
  cr.puppet.auto = false; // (the beak opens on roars now, not on the demo puppet's timer)
  const w = cr.mouthWin;
  if (!w) {
    if (cr.mode !== 'idle' || cr.age < S.SURFACE_TIME + CR().BEHAVE.MOUTH_AFTER || ai.breather > 0 || state.phase !== 'flying') return;
    if (ai.mouthT === undefined) ai.mouthT = P.mouthEvery * M.FIRST;
    if ((ai.mouthT -= dt) > 0) return;
    openWindow(state, cr, P);
    return;
  }
  w.t += dt;
  w.left -= dt;
  if (w.gulp > 0 && (w.gulp -= dt) <= 0 && w.left > M.REOPEN) krakenMouth(cr, w.left); // (it swallowed a bomb: shut a moment, then open again for what is left of the window)
  if (cr.mode === 'idle' && !cr.hooked && w.t >= M.LURE_AFTER) {
    const step = M.LURE_SPEED * dt;
    cr.base.x += clamp(lureX(state, cr, ship) - cr.base.x, -step, step);
  }
  if ((w.left <= 0 && !mouth.open && !(w.gulp > 0)) || w.t > P.mouthFor + M.GULP * 3 + M.SLACK || cr.mode === 'breach') endWindow(cr, P);
}
function endWindow(cr, P) {
  cr.mouthWin = null;
  cr.ai.mouthT = P.mouthEvery * (1 + (cr.hooks.rng() * 2 - 1) * CR().MOUTH.JITTER);
}

// ---- the tow onto rock (phase 3) ----
function stepRock(state, cr, dt) {
  const T = CR().TOW_ROCK, sea = seaLevel(state);
  if (cr.phase < 3 || !cr.hooked || sea === null) return;
  const speed = Math.abs(cr.tvx || 0) + T.GRIND; // (a body the line holds against the rock keeps grinding on it, even when it has stopped moving)
  if (speed < T.MIN_SPEED) return;
  if (!T.SAMPLES.some((dx) => inRock(state, cr.x + dx, sea - T.ABOVE))) return;
  cr.hooks.hurtPool(speed * T.RATE * dt, 'rock');
  cr.stats.rockT = (cr.stats.rockT || 0) + dt;
  state.ship.shake = Math.max(state.ship.shake || 0, T.SHAKE);
  if ((cr.ai.rockPop = (cr.ai.rockPop || 0) - dt) <= 0) {
    cr.ai.rockPop = T.POP_EVERY;
    pop(state, cr.x, sea - 400, 'CRUNCH!', '#ff9a2e', 1.8);
    cr.hooks.puff(cr.x + (cr.hooks.rng() - 0.5) * 1200, sea - 300, '#8a847c', 12);
    state.sfxQ.push(['impact']);
    if (!(state.ev.warn > 1)) { state.ev.warn = 1.8; state.ev.warnText = T.TEXT; }
  }
}

// ---- once a step ----
export function stepFight(state, cr, ship, dt) {
  const F = CR().PHASE, ai = cr.ai;
  if (cr.dying) return;
  if (cr.mode !== 'surfacing') checkPhase(state, cr);
  const P = phaseP(cr);
  if (ai.breather > 0) ai.breather -= dt;
  cr.phaseDy += (-P.up - cr.phaseDy) * Math.min(1, F.RISE * dt); // (phase 3: it surfaces, half out of the water)
  stepMouth(state, cr, ship, dt, P);
  stepRock(state, cr, dt);
}
