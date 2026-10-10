// THE CINDER DRAKE'S FIGHT (BOSSES.md 2.2, C.6a): its flight, its attacks, the perch, the crash and the crawl, the lava spouts, and the ways it ends. creatures/drake.js is its body and poses,
// creatureBreath.js the flame, creatureSystem.js the world around it (damage, targets, death). The numbers are config.CREATURES.DRAKE.
//   MODES (cr.drake.mode)   'arrive' (flies in, untouchable) -> 'fly' (circles the ship in big swooping loops; attacks leave the loop and rejoin it) <-> 'perch' (on her gasbag) ; a torn wing (or the pool
//                           under PHASE.TWO_HP) sends it to 'crash' (falls onto the ground below) and then 'crawl' for good ; 'dying' when it has been beaten.
//   ACTS (cr.drake.act)     BREATH (move to a spot beside her, GLOW: the throat glows and the mouth is a weak point, SWEEP: the cone, RECOVER) and SWOOP (WIND, LOCK, DIVE, ESCAPE) in the air; in the crawl also
//                           LUNGE (the neck snaps at her hull), GAPE (a mouth window for bombs, as the Kraken's beak) and REAR (phase 3: the heart shows); COUGH after a choke.
//   Every attack has the three beats: a banner on the TV, a buzz on the phones of the crew in its way, a roar; then the hit; then a recovery in which it is dazed or open.
//   stepDrake(state, cr, ship, dt)       once a step (creatureSystem.js update)
//   drakeHit / drakeMul / drakeWays      what a blow does beyond its damage (chokes, driving it off the perch, a torn wing), the damage multipliers, and the ways it ends
//   perch jobs / scales                  the crew's side: DRIVE IT OFF (sword hold or blows), HACK THE SCALES (a boarder opens the heart)
import { config } from '../../config.js';
import { snapPose, bodyVec, segDist, setMouth, exposeHeart } from './creature.js';
import { POSES, DRAKE_PHASES, DRAKE_MOUTH_TEXT } from './creatures/drake.js';
import { breathBurn, coneAt, warnCrew } from './creatureBreath.js';
import { lureX } from './creatureFight.js';
import { topDeck } from './creatureGrip.js';
import { tilt } from './course.js';
import { floorBelow } from './maps.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { applyForce, hitForce } from './forces.js';
import { hurt, knockOut } from './health.js';
import { pop } from './popups.js';
import { shipOf, mainShip } from './ships.js';

const DK = () => config.CREATURES.DRAKE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const sgn = (v) => (v < 0 ? -1 : 1);
const diffOf = (state) => state.difficulty || 'normal';
const shipMid = (ship) => ({ x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) });
const partOf = (cr, kind) => cr.parts.find((p) => p.kind === kind);
const wingsOf = (cr) => cr.parts.filter((p) => p.kind === 'wing');
const banner = (state, text, secs = 2.6) => { state.ev.warn = secs; state.ev.warnText = text; };
const rand = (cr, a, b) => a + cr.hooks.rng() * (b - a);
const mouthAt = (cr) => { const m = partOf(cr, 'mouth'); return m && m.segs[0] ? { x: m.segs[0].x, y: m.segs[0].y } : { x: cr.x, y: cr.y }; };
// A point of the ship in ship coordinates -> the world, through her tilt (so it moves and tips with her).
const entry = (ship, x, y) => { const [tx, ty] = tilt(ship.ctx, x, y); return { x: toWorldX(ship, tx), y: toWorldY(ship, ty) }; };

// ---- the ground and the lair ----
export const shelfOf = (state) => { const m = state.course && state.course.map; return m && m.shelf ? m.shelf : null; };
export function groundAt(state, x, y) {
  const map = state.course && state.course.map, lava = state.env && Number.isFinite(state.env.lavaY) ? state.env.lavaY : null;
  let g = map ? floorBelow(map, x, y) : y + 4000;
  if (lava !== null) g = Math.min(g, lava);
  return g;
}
export const drakeBoardable = (cr) => !!cr && cr.kind === 'drake' && !cr.dying && cr.drake.mode === 'perch' && !!cr.drake.perch && cr.drake.perch.landed && cr.drake.perch.sub !== 'lift';
export const drakeCrawling = (cr) => !!cr && cr.kind === 'drake' && cr.drake.mode === 'crawl';

// ---- setting it up (creatureSystem.js spawn) ----
export function setupDrake(state, cr, ship) {
  const D = DK(), dk = cr.drake, mid = shipMid(ship), side = ship.pose.f || 1;
  const o0 = { x: mid.x + D.FLY.RX * (side > 0 ? 1 : -1), y: mid.y - D.FLY.UP };
  Object.assign(dk, {
    mode: 'arrive', act: null, age: 0, ang: side > 0 ? 0 : Math.PI, dir: side > 0 ? -1 : 1, off: { x: cr.x - o0.x, y: cr.y - o0.y },
    nextT: D.SPAWN.FIRST, lastPerch: D.ATTACK.FIRST_PERCH - D.ATTACK.PERCH_EVERY, lastGape: 0, lastRear: 0, lastAct: '', dazed: 0, chokeHits: 0, glow: 0, perch: null, heartOpen: 0, spouts: buildSpouts(state),
    scales: { name: 'scales', prog: 0, worked: false }, prev: { x: cr.x, y: cr.y }, tearing: false,
  });
  Object.assign(cr.stats, { breaths: 0, fires: 0, hearts: 0, bags: 0, swoops: 0, swoopHits: 0, perches: 0, claws: 0, lashes: 0, driven: {}, chokes: 0, crashes: 0, gapes: 0, lunges: 0, lungeHits: 0, rears: 0, spouts: 0 });
  cr.choked = 0;
  cr.flame = null;
  cr.swoop = null;
  cr.lunge = null;
  cr.mvx = cr.mvy = 0;
}

// ---- the movement helpers ----
const omega = () => { const F = DK().FLY; return F.SPEED / ((F.RX + F.RY) / 2); };
const centreOf = (mid) => ({ x: mid.x, y: mid.y - DK().FLY.UP });
const orbitPos = (dk, C) => { const F = DK().FLY; return { x: C.x + F.RX * Math.cos(dk.ang), y: C.y + F.RY * Math.sin(dk.ang) }; };
// Ease toward a point, never faster than maxSpeed px/s.
function follow(cr, tx, ty, k, dt, maxSpeed = DK().FLY.SPEED * 2.4) {
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
// A world vector as an angle in the drake's own frame (facing +x, y down): where its neck must point.
function toBodyAngle(cr, wx, wy) {
  const th = cr.rot ? -cr.rot * cr.f : 0, c = Math.cos(th), s = Math.sin(th);
  return Math.atan2(-wx * s + wy * c, (wx * c + wy * s) * cr.f);
}
const neckRoot = (cr) => { const v = bodyVec(cr, DK().NECK.AT[0], DK().NECK.AT[1]); return { x: cr.x + v.x, y: cr.y + v.y }; };
// Back onto the circling loop from wherever an attack ended: the nearest angle, going the way it is already flying.
function rejoin(cr, mid) {
  const dk = cr.drake, F = DK().FLY, C = centreOf(mid);
  dk.ang = Math.atan2((cr.base.y - C.y) / F.RY, (cr.base.x - C.x) / F.RX);
  const tx = -F.RX * Math.sin(dk.ang), ty = F.RY * Math.cos(dk.ang);
  if (Math.abs(dk.vx || 0) + Math.abs(dk.vy || 0) > 100) dk.dir = (tx * (dk.vx || 0) + ty * (dk.vy || 0)) >= 0 ? 1 : -1;
}
const pauseOf = (state) => (config.CREATURES.GRIP.EVERY_BY_DIFF[diffOf(state)] ?? 1);
const forcedWin = () => config.CREATURES.FORCE_WIN;
function schedule(state, cr) {
  const A = DK().ATTACK, P = DK().PHASE, dk = cr.drake;
  dk.nextT = rand(cr, A.EVERY[0], A.EVERY[1]) * pauseOf(state) * (cr.phase >= 3 ? P.BREATH_MUL : 1);
  if (forcedWin() === 'board' && dk.mode === 'fly') dk.nextT = Math.min(dk.nextT, DK().PERCH.EVERY_IF_FORCED);
}
const canAttack = (state) => state.phase === 'flying' && !state.ship.down && !state.goingDown;

// ---- the phases ----
function enterPhase(state, cr, ph) {
  const A = DK().ATTACK, d = DRAKE_PHASES[ph], h = cr.hooks;
  cr.phase = ph;
  cr.ai.breather = A.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (d.banner) {
    banner(state, d.banner, A.BANNER);
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, config.CREATURES.PHASE.SHAKE);
  pop(state, cr.x, cr.y - 1300, d.name, '#ff5a1f', 2.2);
  h.puff(cr.x, cr.y - 400, '#ffffff', 16);
}
function checkPhase(state, cr, ship) {
  const P = DK().PHASE, dk = cr.drake, frac = cr.hp / cr.maxHp;
  if (dk.mode === 'crash' || dk.mode === 'crawl') {
    const want = frac < P.THREE_HP ? 3 : 2;
    if (want > cr.phase) enterPhase(state, cr, want);
  } else if (frac < P.TWO_HP && !dk.tearing && (dk.mode === 'fly' || dk.mode === 'perch')) { // wounded: a wing gives out
    const w = wingsOf(cr).filter((q) => !q.severed && !q.dead).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
    if (w) {
      dk.tearing = true;
      banner(state, 'ITS WING GIVES OUT!', 2.6);
      w.hp = 0;
      cr.hooks.sever(w, 2);
      wingTorn(state, cr, ship);
    }
  }
}

// ---- hits: what a blow does beyond its damage (creatureSystem.js hurtCreature) ----
export function drakeMul(cr, p, src) {
  const D = DK(), dk = cr.drake;
  let m = 1;
  if (dk.dazed > 0) m *= D.SWOOP.DAZED_MUL; // knocked silly by its own swoop
  if (dk.act && dk.act.kind === 'cough') m *= D.CHOKE.COUGH_MUL;
  if (src === 'flak' && p.kind === 'wing' && dk.mode !== 'crawl') m *= D.FLAK.WING_MUL; // flak was made for wings
  return m;
}
export function drakeHit(state, cr, p, dmg, src, opts = {}) {
  const D = DK(), dk = cr.drake;
  if (dk.mode === 'perch' && dk.perch && dk.perch.landed && dk.perch.sub !== 'lift' && src !== 'sword') { // hurt enough on the bag and it leaves (a boarder's blows at the heart do not count)
    dk.perch.dmg += dmg * (src === 'flame' ? D.PERCH.FLAME_DRIVE : 1);
    if (dk.perch.dmg >= D.PERCH.DRIVE_DMG * cr.maxHp) driveOff(state, cr, src === 'flame' ? 'flame' : 'shot');
  }
  if (p.kind === 'mouth') {
    const a = dk.act;
    cr.stats.mouthHits = (cr.stats.mouthHits || 0) + 1;
    if (typeof process !== 'undefined' && process.env && process.env.DRAKE_DEBUG) console.log('mouth hit', src, 'act', a ? a.kind + '/' + a.sub + ' t=' + a.t.toFixed(2) : 'none', 'age', cr.age.toFixed(1));
    if (a && a.kind === 'breath' && (a.sub === 'glow' || (a.sub === 'sweep' && a.t < D.CHOKE.GRACE)) && (src === 'shell' || src === 'bomb' || src === 'cargo' || src === 'coil' || src === 'flak' || src === 'mine')) { // CHOKE: into the glowing throat
      dk.chokeHits += src === 'bomb' || src === 'cargo' || src === 'coil' ? D.CHOKE.BOMB : 1;
      if (dk.chokeHits >= D.CHOKE.HITS) choke(state, cr, opts);
    }
  }
  if (p.kind === 'wing' && p.severed && dk.mode !== 'crash' && dk.mode !== 'crawl' && dk.mode !== 'dying') wingTorn(state, cr, mainShip(state));
}
function choke(state, cr, opts = {}) {
  const D = DK(), dk = cr.drake, h = cr.hooks;
  dk.act = { kind: 'cough', t: 0 };
  dk.chokeHits = 0;
  cr.flame = null;
  dk.glow = 0;
  cr.choked += 1;
  cr.stats.chokes = cr.choked;
  setMouth(cr, partOf(cr, 'mouth'), false);
  h.hurtPool(D.CHOKE.POOL_FRAC * cr.maxHp, 'choke', opts.who);
  const m = mouthAt(cr);
  pop(state, m.x, m.y - 200, 'CHOKED!', '#ffd23f', 1.8);
  h.puff(m.x, m.y, '#6b6258', 14);
  state.sfxQ.push(['chomp']);
  if (!cr.dying) banner(state, 'CHOKED IT! ' + cr.choked + '/' + D.CHOKE.WIN, 2.6);
  for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, 'CHOKED! ' + cr.choked + '/' + D.CHOKE.WIN, [40, 30, 40]);
}
export function drakeWays(cr, p, src) {
  const D = DK(), st = cr.stats, ways = [];
  if (cr.choked >= D.CHOKE.WIN) ways.push('choke');
  if (cr.fed >= D.FED) ways.push('bombs');
  if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
  if (cr.hp <= 0) ways.push(poolWhy(cr, src));
  return ways;
}
// How an empty pool is counted: the lava spout, flak (when most of the damage was flak) or plain hit points.
export function poolWhy(cr, src) {
  if (src === 'spout' || src === 'rock') return 'tow';
  const st = cr.stats;
  return (st.by.flak || 0) >= 0.5 * (st.dmg || 1) ? 'flak' : 'hp';
}

// ---- flak: a burst near a wing ----
export function drakeFlak(state, sh) {
  const cr = state.creature, F = DK().FLAK;
  if (!cr || cr.kind !== 'drake' || cr.mode !== 'idle') return false;
  let near = false;
  for (const p of cr.parts) {
    if ((p.kind !== 'wing' && cr.drake.mode !== 'crawl') || p.dead || p.hidden) continue; // (the wings while it flies; any part once it is down)
    for (const s of p.segs) if (segDist(s, sh.x, sh.y) < F.FUSE) { near = true; break; }
    if (near) break;
  }
  if (!near) return false;
  sh.life = 0;
  state.rings.push({ x: sh.x, y: sh.y, t: 0.35, max: 0.35, color: '#ffd23f', size: F.BURST });
  cr.hooks.puff(sh.x, sh.y, '#f2d36b', 14);
  state.sfxQ.push(['impact']);
  for (const p of [...cr.parts]) {
    if (p.dead || p.hidden) continue;
    let best = -1, bd = Infinity;
    p.segs.forEach((s, i) => { const d = Math.max(0, segDist(s, sh.x, sh.y)); if (d < bd) { bd = d; best = i; } });
    if (best >= 0 && bd <= F.BURST) cr.hooks.hurt({ part: p, seg: best }, F.DMG * (1 - 0.5 * (bd / F.BURST)), { who: sh.owner, src: 'flak' });
  }
  return true;
}

// ---- the main step ----
export function stepDrake(state, cr, ship, dt) {
  const D = DK(), dk = cr.drake, mid = shipMid(ship);
  dk.age += dt;
  dk.dazed = Math.max(0, dk.dazed - dt);
  if (cr.ai.breather > 0) cr.ai.breather -= dt;
  if (cr.dying) { stepDying(state, cr, dt); return; }
  if (dk.mode === 'arrive') stepArrive(state, cr, ship, dt, mid);
  else {
    checkPhase(state, cr, ship);
    if (dk.mode === 'fly') stepFly(state, cr, ship, dt, mid);
    else if (dk.mode === 'perch') stepPerch(state, cr, ship, dt, mid);
    else if (dk.mode === 'crash') stepCrash(state, cr, ship, dt, mid);
    else if (dk.mode === 'crawl') stepCrawl(state, cr, ship, dt, mid);
  }
  stepSpouts(state, cr, ship, dt);
  if (dk.heartOpen > 0 && (dk.heartOpen -= dt) <= 0) hideHeart(cr);
  // the picture's inputs: pitch from the flight, the throat's glow, the velocity (for the guns' lead)
  const v = { x: (cr.base.x - dk.prev.x) / Math.max(dt, 1e-4), y: (cr.base.y - dk.prev.y) / Math.max(dt, 1e-4) };
  if (Math.hypot(v.x, v.y) > 6000) { v.x = v.y = 0; } // (a snap, not a flight)
  dk.vx = v.x;
  dk.vy = v.y;
  cr.mvx = v.x;
  cr.mvy = v.y;
  dk.prev.x = cr.base.x;
  dk.prev.y = cr.base.y;
  const flying = dk.mode === 'fly' || dk.mode === 'arrive';
  const moving = Math.hypot(v.x, v.y) > 220;
  dk.pitch = flying && moving ? clamp(Math.atan2(-v.y, Math.max(180, Math.abs(v.x))), -(dk.act && dk.act.kind === 'swoop' && dk.act.sub === 'dive' ? 1.3 : D.FLY.MAX_PITCH), D.FLY.MAX_PITCH) : 0;
  const a = dk.act;
  dk.glow = a && a.kind === 'breath' ? (a.sub === 'glow' ? clamp(a.t / D.BREATH.GLOW, 0.1, 1) : a.sub === 'sweep' ? 1 : 0) : a && a.kind === 'gape' ? 0.35 : 0;
}

function stepDying(state, cr, dt) {
  const dk = cr.drake;
  dk.pose = 'dying';
  dk.act = null;
  dk.glow = 0;
  cr.flame = cr.swoop = cr.lunge = null;
  if (dk.perch) releasePerch(state, cr);
  void dt;
}
// It has died (creatureSystem.js die): no more fire, no more weight on her bag.
export function drakeDied(state, cr) {
  const dk = cr.drake;
  dk.mode = 'dying';
  dk.act = null;
  cr.flame = cr.swoop = cr.lunge = null;
  hideHeart(cr, true);
  if (dk.perch) releasePerch(state, cr);
}

// ---- arriving ----
function stepArrive(state, cr, ship, dt, mid) {
  const D = DK(), dk = cr.drake, S = D.SPAWN;
  dk.ang += dk.dir * omega() * dt;
  const o = orbitPos(dk, centreOf(mid)), k = 1 - smooth(dk.age / S.ARRIVE);
  cr.base.x = o.x + dk.off.x * k;
  cr.base.y = o.y + dk.off.y * k;
  dk.pose = 'cruise';
  face(cr, sgn(mid.x - cr.base.x));
  if (dk.age >= S.ARRIVE) {
    cr.mode = 'idle';
    dk.mode = 'fly';
    rejoin(cr, mid);
    state.sfxQ.push(['roar']);
    banner(state, cr.name + ' CIRCLES THE SHIP!', 3);
  }
}

// ---- flying: the loop and the attacks that leave it ----
function stepFly(state, cr, ship, dt, mid) {
  const D = DK(), dk = cr.drake, a = dk.act;
  if (a) {
    if (a.kind === 'breath') return stepBreath(state, cr, ship, dt, mid, a);
    if (a.kind === 'swoop') return stepSwoop(state, cr, ship, dt, mid, a);
    if (a.kind === 'cough') { // choked: it hangs in the air, hacking, and sinks a little
      a.t += dt;
      dk.pose = 'cough';
      cr.base.y += 160 * dt;
      if (a.t >= D.CHOKE.COUGH) { dk.act = null; rejoin(cr, mid); schedule(state, cr); }
      return;
    }
  }
  dk.ang += dk.dir * omega() * dt;
  const o = orbitPos(dk, centreOf(mid));
  follow(cr, o.x, Math.min(o.y, groundAt(state, o.x, o.y) - D.FLY.CLEAR), D.FLY.FOLLOW, dt);
  dk.pose = 'cruise';
  if (Math.abs(dk.vx || 0) > D.FLY.FLIP_VX) face(cr, sgn(dk.vx));
  if ((dk.nextT -= dt) > 0 || cr.ai.breather > 0 || !canAttack(state)) return;
  startAttack(state, cr, ship, mid);
}
function startAttack(state, cr, ship, mid) {
  const D = DK(), A = D.ATTACK, dk = cr.drake, f = forcedWin();
  const wts = { ...A.WEIGHTS };
  const perchOk = cr.age >= A.FIRST_PERCH && cr.age - dk.lastPerch >= A.PERCH_EVERY && !!ship.layout.gasbags.length;
  if (!perchOk) wts.perch = 0;
  let kind = 'breath';
  if (f === 'board') { // the gate's dev flag: nothing but perches, soon and often, so a boarder has something to board
    if (cr.age < D.PERCH.FIRST_IF_FORCED || cr.age - dk.lastPerch < D.PERCH.EVERY_IF_FORCED) { dk.nextT = 1; return; }
    kind = 'perch';
  } else {
    if (f === 'choke') { wts.breath = 1; wts.swoop = 0; wts.perch = 0; }
    const total = Object.values(wts).reduce((s, v) => s + v, 0);
    if (total <= 0) { dk.nextT = 2; return; }
    let r = cr.hooks.rng() * total;
    for (const [k, w] of Object.entries(wts)) { if ((r -= w) <= 0) { kind = k; break; } }
  }
  if (kind === 'breath') startBreath(state, cr, ship, mid, 'air');
  else if (kind === 'swoop') startSwoop(state, cr, ship, mid);
  else if (!startPerch(state, cr, ship, mid)) schedule(state, cr);
}

// ---- BREATH ----
// The path the cone's aim follows, in SHIP coordinates, and the words of the warning. pat: 'level' (beside her, sweeping down her near end), 'high' (above and beside, sweeping along the top of the
// gasbag) or 'up' (the crawling drake under her, sweeping along her keel).
function breathPath(ship, pat, nearRight) {
  const b = ship.layout.bounds, bags = ship.layout.gasbags;
  const xe = nearRight ? b.x1 - 200 : b.x0 + 200, xf = nearRight ? b.x0 + 300 : b.x1 - 300;
  const bagTop = bags.length ? Math.min(...bags.map((g) => g.cy - g.ry)) + 60 : b.y0 + 120;
  if (pat === 'high') return { from: { x: xe, y: bagTop }, to: { x: xf, y: bagTop }, text: 'FIRE OVER THE GASBAG!', zone: 'bag' };
  if (pat === 'up') return { from: { x: xe, y: b.y1 - 40 }, to: { x: xe + (xf - xe) * DK().BREATH.UP_SPAN, y: b.y1 - 40 }, up: true, text: 'FIRE FROM BELOW! GET OFF THE LOWER DECKS!', zone: 'low' };
  return { from: { x: xe, y: b.y0 + 40 }, to: { x: xe + (nearRight ? -500 : 500), y: b.y1 - 20 }, text: nearRight ? 'FIRE ON THE FORE DECKS!' : 'FIRE ON THE AFT DECKS!', zone: 'end', xe };
}
function startBreath(state, cr, ship, mid, where) {
  const D = DK(), dk = cr.drake, Bc = D.BREATH;
  const sd = where === 'crawl' ? sgn(cr.base.x - mid.x) : sgn(cr.base.x - mid.x), nearRight = sd * ship.pose.f > 0;
  const pat = where === 'crawl' ? 'up' : cr.hooks.rng() < Bc.HIGH_SHARE ? 'high' : 'level';
  const path = breathPath(ship, pat, nearRight);
  if (where === 'crawl') { // it must be near enough to reach her
    const q = entry(ship, path.from.x, path.from.y), m = mouthAt(cr);
    if (Math.hypot(q.x - m.x, q.y - m.y) > Bc.LEN * Bc.UPWARD + 900) { dk.nextT = 2.5; return false; }
  }
  dk.act = { kind: 'breath', sub: where === 'crawl' ? 'glow' : 'move', t: 0, pat, sd, path, tickT: 0, where, budget: { fires: Bc.MAX_FIRES } };
  cr.stats.breaths += 1;
  dk.lastAct = 'breath';
  if (where === 'crawl') announceBreath(state, cr, ship, dk.act);
  return true;
}
function announceBreath(state, cr, ship, a) { // the three beats: the banner, the phones, the roar
  const Bc = DK().BREATH, b = ship.layout.bounds;
  banner(state, 'THE DRAKE INHALES! ' + a.path.text, Bc.GLOW + 0.8);
  state.sfxQ.push(['roar']);
  const near = (p) => {
    if (a.path.zone === 'end') return Math.abs(p.x - a.path.xe) <= Bc.WARN_REACH;
    if (a.path.zone === 'bag') return ship.layout.platforms[p.d].y < b.y0 + (b.y1 - b.y0) * 0.55;
    return ship.layout.platforms[p.d].y > b.y0 + (b.y1 - b.y0) * 0.4;
  };
  warnCrew(state, cr, ship, near, 'FIRE! ' + a.path.text);
}
const aimPoint = (ship, a, u) => entry(ship, a.path.from.x + (a.path.to.x - a.path.from.x) * u, a.path.from.y + (a.path.to.y - a.path.from.y) * u);
function stepBreath(state, cr, ship, dt, mid, a) {
  const D = DK(), Bc = D.BREATH, dk = cr.drake;
  a.t += dt;
  const sd = a.where === 'crawl' ? sgn(mid.x - cr.base.x) : a.sd;
  if (a.where === 'air') {
    const stand = a.pat === 'high' ? Bc.HIGH : Bc.STAND;
    const tx = mid.x + sd * stand[0], ty = mid.y - stand[1];
    if (a.sub === 'move') {
      dk.pose = 'cruise';
      const left = flyTo(cr, tx, ty, Bc.STAND_SPEED, dt);
      if (Math.abs(dk.vx || 0) > D.FLY.FLIP_VX) face(cr, sgn(dk.vx));
      if (left < 600 && !a.opened) { a.opened = true; setMouth(cr, partOf(cr, 'mouth'), true); } // (the jaws open as it comes)
      if (left < 140 || a.t > 4) { a.sub = 'glow'; a.t = 0; dk.chokeHits = 0; face(cr, sgn(mid.x - cr.base.x)); setMouth(cr, partOf(cr, 'mouth'), true); announceBreath(state, cr, ship, a); }
      return;
    }
    follow(cr, tx, ty, 5, dt, 1600); // (hovering beside her as she flies on)
    face(cr, sgn(mid.x - cr.base.x));
  } else face(cr, sgn(mid.x - cr.base.x));
  if (a.sub === 'glow') {
    dk.pose = 'glow';
    { const q = aimPoint(ship, a, 0), root = neckRoot(cr); dk.aim = toBodyAngle(cr, q.x - root.x, q.y - root.y); }
    if (a.where === 'crawl' && a.t < dt * 1.5) setMouth(cr, partOf(cr, 'mouth'), true);
    if (a.t >= Bc.GLOW) { a.sub = 'sweep'; a.t = 0; state.sfxQ.push(['whoosh']); }
    return;
  }
  if (a.sub === 'sweep') {
    dk.pose = 'breath';
    const u = clamp(a.t / Bc.SWEEP, 0, 1), q = aimPoint(ship, a, u), m = mouthAt(cr);
    const ang = Math.atan2(q.y - m.y, q.x - m.x), root = neckRoot(cr);
    dk.aim = toBodyAngle(cr, q.x - root.x, q.y - root.y);
    cr.flame = { x: m.x, y: m.y, ang, half: Bc.HALF, len: Bc.LEN, t: a.t };
    if ((a.tickT -= dt) <= 0) {
      a.tickT += Bc.TICK;
      const o = breathBurn(state, cr, ship, coneAt(m.x, m.y, ang, 1, a.path.up ? Bc.UP_PEN : null), Bc.TICK, a.budget);
      cr.stats.fires += o.decks;
      cr.stats.hearts += o.hearts;
      cr.stats.bags += o.bags;
    }
    if (a.t >= Bc.SWEEP) { a.sub = 'recover'; a.t = 0; cr.flame = null; setMouth(cr, partOf(cr, 'mouth'), false); }
    return;
  }
  // recover
  dk.pose = 'recover';
  if (a.t >= Bc.RECOVER) { dk.act = null; if (a.where === 'air') rejoin(cr, mid); schedule(state, cr); if (a.where === 'crawl') crawlAfter(cr); }
}

// ---- SWOOP ----
function startSwoop(state, cr, ship, mid) {
  const D = DK(), S = D.SWOOP, dk = cr.drake, b = ship.layout.bounds;
  const sd = sgn(cr.base.x - mid.x), nearRight = sd * ship.pose.f > 0;
  const sx = nearRight ? b.x1 - 120 : b.x0 + 120, sy = (b.y0 + b.y1) / 2 - 80;
  dk.act = { kind: 'swoop', sub: 'wind', t: 0, sd, sx, sy, lock: null, dir: null, hit: false, esc: null };
  cr.stats.swoops += 1;
  dk.lastAct = 'swoop';
  const q = entry(ship, sx, sy);
  banner(state, 'SWOOP! BRACE FOR IMPACT!', S.WIND + 0.8);
  state.sfxQ.push(['roar']);
  warnCrew(state, cr, ship, (p) => Math.abs(p.x - sx) <= D.BREATH.WARN_REACH, 'SWOOP! HOLD ON!', [200, 60, 200, 60, 200]);
  cr.swoop = { x: q.x, y: q.y, t: 0, locked: false };
}
function stepSwoop(state, cr, ship, dt, mid, a) {
  const D = DK(), S = D.SWOOP, dk = cr.drake;
  a.t += dt;
  const q = entry(ship, a.sx, a.sy);
  if (a.sub === 'wind' || a.sub === 'lock') {
    if (cr.swoop) { cr.swoop.x = q.x; cr.swoop.y = q.y; cr.swoop.t = a.t; }
    const tx = q.x + a.sd * S.START[0], ty = q.y - S.START[1];
    dk.pose = 'wind';
    flyTo(cr, tx, ty, D.BREATH.STAND_SPEED, dt);
    if (Math.abs(dk.vx || 0) > D.FLY.FLIP_VX) face(cr, sgn(dk.vx)); else face(cr, -a.sd);
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
    dk.pose = 'dive';
    cr.base.x += a.dir.x * S.DIVE * dt;
    cr.base.y += a.dir.y * S.DIVE * dt;
    const root = neckRoot(cr);
    dk.aim = toBodyAngle(cr, a.dir.x, a.dir.y);
    void root;
    if (cr.swoop) { cr.swoop.x = a.lock.x; cr.swoop.y = a.lock.y; cr.swoop.t = a.t; }
    if (swoopTouches(state, cr, ship, a)) swoopHit(state, cr, ship, a, q);
    else if (a.t > S.MISS_AFTER || (a.lock.x - cr.base.x) * a.dir.x + (a.lock.y - cr.base.y) * a.dir.y < -900) { // it flew through where she was
      pop(state, cr.base.x, cr.base.y - 300, 'MISSED!', '#ffffff', 1.2);
      a.sub = 'escape';
      a.t = 0;
      a.esc = { x: a.dir.x * 0.6, y: -0.8 };
    }
    return;
  }
  // escape: climb away, dazed if it hit
  dk.pose = 'cruise';
  cr.swoop = null;
  const e = a.esc || { x: a.dir.x * 0.6, y: -0.8 }, el = Math.hypot(e.x, e.y) || 1;
  cr.base.x += (e.x / el) * D.FLY.SPEED * 1.7 * dt;
  cr.base.y += (e.y / el) * D.FLY.SPEED * 1.7 * dt;
  if (a.t >= 1.7) { dk.act = null; rejoin(cr, mid); schedule(state, cr); }
}
function swoopTouches(state, cr, ship, a) {
  const S = DK().SWOOP, torso = partOf(cr, 'mantle');
  if (!torso || !torso.segs[0]) return false;
  const s = torso.segs[0];
  for (const u of [0, 0.25, 0.5, 0.75, 1]) {
    const x = s.x + Math.cos(s.ang) * s.len * u, y = s.y + Math.sin(s.ang) * s.len * u;
    if (ship.sim.hitsShip(toShipX(ship, x), toShipY(ship, y))) return true;
  }
  const m = mouthAt(cr);
  return ship.sim.hitsShip(toShipX(ship, m.x), toShipY(ship, m.y)) || Math.hypot(a.lock.x - cr.base.x, a.lock.y - cr.base.y) < S.HIT_R * 0.5;
}
function swoopHit(state, cr, ship, a, q) {
  const D = DK(), S = D.SWOOP, dk = cr.drake, sim = ship.sim, h = cr.hooks;
  a.hit = true;
  a.sub = 'escape';
  a.t = 0;
  a.esc = { x: -a.dir.x * 0.3, y: -0.95 };
  dk.dazed = S.DAZED;
  cr.stats.swoopHits += 1;
  if (sim && sim.damageHull) sim.damageHull(S.HULL);
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
    if (res && h.phoneFx) h.phoneFx(p, 'THE DRAKE HIT THE SHIP!', [200, 60, 200]);
  }
  pop(state, q.x, q.y - 200, 'SWOOP!', '#ff5a1f', 1.8);
  h.puff(q.x, q.y, '#ffe9a8', 14);
  state.sfxQ.push(['impact']);
  banner(state, 'IT HIT US! IT IS DAZED - HIT IT NOW!', 2.4);
}

// ---- PERCH ----
const biggestBag = (L) => L.gasbags.reduce((best, g) => (!best || g.rx * g.ry > best.rx * best.ry ? g : best), null);
function perchBase(ship, px, top) {
  const D = DK(), f = ship.pose.f || 1, e = entry(ship, px, top + D.PERCH.ABOVE);
  const v = bodyVec({ f, rot: POSES.perch.rot }, D.TORSO.AT[0], D.TORSO.AT[1]); // (the torso's rear end is the foot)
  return { x: e.x - v.x, y: e.y - D.TORSO.R - v.y };
}
function startPerch(state, cr, ship, mid) {
  const D = DK(), P = D.PERCH, dk = cr.drake, bag = biggestBag(ship.layout);
  if (!bag) return false;
  const u = (cr.hooks.rng() * 2 - 1) * 0.35, px = bag.cx + u * bag.rx, top = bag.cy - bag.ry * Math.sqrt(Math.max(0, 1 - u * u));
  const pl = ship.layout.platforms[topDeck(ship)];
  dk.mode = 'perch';
  dk.act = null;
  dk.lastAct = 'perch';
  dk.perch = { sub: 'glide', t: 0, landed: false, left: P.TIME * (P.TIME_BY_DIFF[diffOf(state)] ?? 1), claw: P.CLAW * 0.6, lash: P.LASH, lashWarn: 0, dmg: 0, px, top, bag: ship.layout.gasbags.indexOf(bag), held: 0, shakeT: 0, aboard: 0, driven: null,
    job: { name: 'hack', prog: 0, worked: false, live: false, d: topDeck(ship), x: pl ? clamp(px, pl.x0 + 60, pl.x1 - 60) : px, hot: 0 } };
  cr.perch = dk.perch;
  cr.stats.perches += 1;
  face(cr, ship.pose.f || 1);
  banner(state, 'THE DRAKE IS LANDING ON THE GASBAG!', P.WIND + 1);
  state.sfxQ.push(['roar']);
  warnCrew(state, cr, ship, () => true, 'IT IS LANDING ON THE BAG! Swords up on the top deck - or turn hard!', [150, 60, 150, 60, 250]);
  void mid;
  return true;
}
function releasePerch(state, cr) {
  const dk = cr.drake;
  for (const sh of state.ships) if (sh.ctx.perch) sh.ctx.perch = null;
  if (dk.perch) dk.perch.job.live = false;
  dk.perch = null;
  cr.perch = null;
  dk.lastPerch = cr.age;
}
function driveOff(state, cr, why) {
  const dk = cr.drake, pc = dk.perch;
  if (!pc || pc.sub === 'lift') return;
  pc.sub = 'lift';
  pc.t = 0;
  pc.driven = why;
  pc.job.live = false;
  cr.stats.driven[why] = (cr.stats.driven[why] || 0) + 1;
  const text = { sword: 'DRIVEN OFF BY SWORDS!', shot: 'DRIVEN OFF!', flame: 'BURNT OFF THE BAG!', shake: 'SHAKEN OFF!', time: 'IT FLIES OFF', gone: 'IT FLIES OFF' }[why] || 'DRIVEN OFF!';
  if (why !== 'time') banner(state, text, 2.2);
  pop(state, cr.x, cr.y - 700, text, '#8fe388', 1.6);
  state.sfxQ.push(['roar']);
}
function stepPerch(state, cr, ship, dt, mid) {
  const D = DK(), P = D.PERCH, dk = cr.drake, pc = dk.perch;
  if (!pc || !state.ships.includes(ship)) { dk.mode = 'fly'; dk.perch = null; rejoin(cr, mid); schedule(state, cr); return; }
  pc.t += dt;
  const bag = ship.layout.gasbags[pc.bag];
  const tgt = perchBase(ship, pc.px, pc.top);
  face(cr, ship.pose.f || 1);
  if (pc.sub === 'glide') {
    dk.pose = pc.t > P.WIND - 0.7 ? 'perch' : 'liftoff';
    follow(cr, tgt.x, tgt.y, 2.6, dt, 2200);
    if ((pc.t >= P.WIND && Math.hypot(cr.base.x - tgt.x, cr.base.y - tgt.y) < 200) || pc.t > P.WIND + 3) {
      pc.sub = 'on';
      pc.t = 0;
      pc.landed = true;
      pc.job.live = true;
      state.ship.shake = Math.max(state.ship.shake || 0, 1);
      hitForce(ship.ctx, pc.px, pc.top, 3);
      pop(state, cr.base.x, cr.base.y - 500, 'THUD!', '#ff5a1f', 1.6);
      cr.hooks.puff(cr.base.x, cr.base.y, '#d9cbb0', 14);
      state.sfxQ.push(['impact']);
      banner(state, 'THE DRAKE IS ON THE GASBAG! DRIVE IT OFF - OR TURN HARD!', 3.2);
    }
    return;
  }
  if (pc.sub === 'lift') {
    dk.pose = 'liftoff';
    ship.ctx.perch = null;
    pc.job.live = false;
    cr.base.x += (tgt.x - cr.base.x) * Math.min(1, 6 * dt);
    cr.base.y -= 1400 * dt * smooth(pc.t / P.LIFTOFF + 0.2);
    cr.base.x += ship.pose.f * 500 * dt;
    if (pc.t >= P.LIFTOFF) { releasePerch(state, cr); dk.mode = 'fly'; dk.pose = 'cruise'; rejoin(cr, mid); schedule(state, cr); }
    return;
  }
  // on the bag: it rides her, its weight tips her and pushes her down, it claws and lashes
  dk.pose = pc.lashWarn > 0 ? 'lash' : 'perch';
  cr.base.x = tgt.x;
  cr.base.y = tgt.y;
  ship.ctx.perch = { w: P.MASS, x: pc.px };
  { const e = entry(ship, pc.px, pc.top); pc.wx = e.x; pc.wy = e.y; } // (where it sits, for the TV's ring)
  const acc = P.ACC * clamp(pc.t / 1.2, 0.2, 1);
  applyForce(ship.ctx, { x: pc.px, y: pc.top, fx: 0, fy: acc * P.TORQUE, source: 'perch' });
  if (ship.pose.vy < P.MAX_SINK) ship.pose.vy = Math.min(P.MAX_SINK, ship.pose.vy + acc * dt); // (it sinks her, but never faster than a steady crawl: the helm and the gas can fight that)
  state.ship.shake = Math.max(state.ship.shake || 0, P.SHAKE);
  pc.aboard = Object.values(state.players).some((q) => q.on && q.on.cr === cr) ? 1 : 0;
  pc.left -= dt * (pc.aboard ? D.BOARD.KEEP_PERCH : 1);
  // the job to drive it off (the sword holds, creatureGrip.js style): the deck under it, where the crew stand
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
      pop(state, toWorldX(ship, sx), toWorldY(ship, sy) - 150, 'CLAW!', '#ff5a1f', 1.2);
      cr.hooks.puff(toWorldX(ship, sx), toWorldY(ship, sy), '#6b6258', 6);
      state.sfxQ.push(['impact']);
      if (cr.stats.claws === 1) banner(state, 'IT IS CLAWING THE GASBAG!', 2.4);
    }
  }
  // TAIL LASH
  if (pc.lashWarn > 0) {
    if ((pc.lashWarn -= dt) <= 0) tailLash(state, cr, ship, pc);
  } else if ((pc.lash -= dt) <= 0) {
    pc.lash = P.LASH;
    pc.lashWarn = P.LASH_WARN;
    banner(state, 'TAIL LASH! GET OFF THE TOP DECK!', P.LASH_WARN + 0.6);
    state.sfxQ.push(['roar']);
    const d = topDeck(ship);
    warnCrew(state, cr, ship, (p) => p.d === d && Math.abs(p.x - pc.px) < 1000, 'TAIL LASH! GET OFF THE TOP DECK - or JUMP!', [150, 60, 150]);
  }
  // the ways it leaves: swords, the helm's hard turn, its own time
  if (job.prog >= 1) { job.prog = 0; driveOff(state, cr, 'sword'); return; }
  const turning = ship.ctx.turning && ship.ctx.turning.t > 0;
  pc.vyAvg = (pc.vyAvg ?? ship.pose.vy ?? 0) + ((ship.pose.vy || 0) - (pc.vyAvg ?? ship.pose.vy ?? 0)) * Math.min(1, dt / 1.5); // (what she has been doing for a moment: its own weight sinks her steadily, only a swing away from that is the helm)
  pc.shakeT = Math.abs((ship.pose.vy || 0) - pc.vyAvg) > P.SHAKE_VY ? pc.shakeT + dt : Math.max(0, pc.shakeT - dt * 2);
  if (turning || pc.shakeT >= P.SHAKE_TIME) { driveOff(state, cr, 'shake'); return; }
  if (pc.left <= 0) driveOff(state, cr, 'time');
}
function tailLash(state, cr, ship, pc) {
  const S = config.CREATURES.SLAP, P = DK().PERCH, sim = ship.sim, d = topDeck(ship), pl = ship.layout.platforms[d];
  if (!pl) return;
  let hit = 0;
  const dir = ship.pose.f * (pc.px > (pl.x0 + pl.x1) / 2 ? -1 : 1);
  for (const p of Object.values(state.players)) {
    if (shipOf(state, p) !== ship || p.d !== d || p.fly || p.fall || p.conn != null || p.ko > 0 || p.on || Math.abs(p.x - pc.px) > 1000) continue;
    if (p.air && (p.jz || 0) > S.DUCK_JZ) { if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'You jumped it!', [30, 40, 30]); continue; }
    const res = hurt(p, P.LASH_HEARTS, { cause: 'slap' });
    hit++;
    if (res === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
    else if (!p.lock && sim && sim.air) { p.tossed = true; sim.air.startFlight(p, dir * S.VX, -S.VY); if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'LASHED OFF THE DECK! Open the parachute or grab a ladder!', [200, 60, 200]); }
    else if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'LASHED!', [200, 60, 200]);
  }
  if (sim && sim.damageHull) sim.damageHull(P.LASH_HULL);
  hitForce(ship.ctx, pc.px, pl.y, S.POWER);
  state.ship.shake = Math.max(state.ship.shake || 0, 1);
  const w = entry(ship, pc.px, pl.y);
  pop(state, w.x, w.y - 160, 'LASH!', '#ff5a1f', 1.8);
  cr.hooks.puff(w.x, w.y - 60, '#d9cbb0', 14);
  state.sfxQ.push(['slap']);
  cr.stats.lashes += 1;
  cr.stats.slapHits = (cr.stats.slapHits || 0) + hit;
}

// The crew's side of the perch: the DRIVE IT OFF action (a sword hold, or three blows), shaped like the Kraken's HACK.
function perchNear(state, ship, p) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'drake' || !drakeBoardable(cr) || p.d == null || p.fly || p.fall || p.conn != null) return null;
  const pl = ship.layout.platforms[p.d], pc = cr.drake.perch;
  if (!pl || pl.y - pc.top > DK().PERCH.REACH_V || Math.abs(p.x - pc.px) > DK().PERCH.REACH) return null;
  return pc;
}
export function perchAction(state, ship, p) {
  const pc = perchNear(state, ship, p), P = DK().PERCH;
  if (!pc) return null;
  if (p.carry === 'sword') return { type: 'hack', obj: pc.job, hold: true, time: P.SWORD_TIME, label: 'DRIVE IT OFF!' };
  if (p.carry === 'hammer') return { type: 'hack', obj: pc.job, hold: true, time: P.HAMMER_TIME, label: 'DRIVE IT OFF! (hammer: slow)' };
  return { type: 'need', label: 'Need a sword to drive the drake off!' };
}
export function perchBlow(state, ship, p) {
  const pc = perchNear(state, ship, p), P = DK().PERCH, cr = state.creature;
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
  if (pc.job.prog >= 1) perchHacked(state, ship, p, pc.job);
  return true;
}
export function perchHacked(state, ship, p, job) {
  const cr = state.creature;
  if (!cr || !cr.drake.perch || cr.drake.perch.job !== job) return false;
  job.prog = 0;
  driveOff(state, cr, 'sword');
  if (cr.hooks.phoneFx && p) cr.hooks.phoneFx(p, 'You drove it off!', [30, 40, 30]);
  return true;
}
export const perchJobs = (state, ship) => {
  const cr = state.creature;
  if (!cr || cr.kind !== 'drake' || !drakeBoardable(cr) || config.CREATURES.FORCE_WIN === 'board') return []; // (the gate's dev flag for boarding leaves it sitting there)
  const pc = cr.drake.perch;
  return pc.job.live ? [{ kind: 'hack', obj: pc.job, d: pc.job.d, x: pc.job.x, text: 'DRIVE THE DRAKE OFF' }] : [];
};
export const perchObjects = (state, ship) => (state.creature && state.creature.kind === 'drake' && state.creature.drake.perch ? [state.creature.drake.perch.job] : []);

// HACK THE SCALES (creatureBoard.js actFor): a boarder with a sword near the hidden heart.
export function scalesAction(state, p) {
  const cr = state.creature, dk = cr.drake;
  const heart = partOf(cr, 'heart');
  if (!heart || heart.dead || !heart.hidden || !heart.segs[0]) return null;
  const s = heart.segs[0];
  if (Math.hypot(s.x - p.x, s.y - p.y) > config.CREATURES.BOARD.HEART_REACH + s.r) return null;
  if (p.carry !== 'sword') return { type: 'need', label: 'Need a sword to hack the scales!' };
  return { type: 'scales', obj: dk.scales, hold: true, time: DK().BOARD.SCALES_TIME, label: 'HACK THE SCALES!', part: heart };
}
export function scalesOpened(state, cr, p) {
  const D = DK();
  cr.drake.heartOpen = D.BOARD.OPEN_FOR;
  exposeHeart(cr);
  const s = partOf(cr, 'heart').segs[0];
  pop(state, s.x, s.y - 200, 'SCALES OFF!', '#ffd23f', 1.8);
  state.sfxQ.push(['sever']);
  cr.stats.scales = (cr.stats.scales || 0) + 1;
  banner(state, 'THE SCALES ARE OFF - STRIKE THE HEART!', 2.6);
  if (cr.hooks.phoneFx && p) cr.hooks.phoneFx(p, 'The scales are open! STRIKE THE HEART!', [60, 40, 60]);
}
function hideHeart(cr, force = false) {
  const h = partOf(cr, 'heart');
  if (!h) return;
  if (force || !(cr.drake.act && cr.drake.act.kind === 'rear')) h.hidden = true;
}

// ---- CRASH and CRAWL ----
function wingTorn(state, cr, ship) {
  const dk = cr.drake;
  if (dk.mode === 'crash' || dk.mode === 'crawl' || dk.mode === 'dying') return;
  if (forcedWin() === 'flak') return; // (the gate's dev flag: the flak guns on her nests cannot point down at a crawling drake, so a flak win is proved against one that keeps flying)
  const D = DK(), wasPerched = dk.mode === 'perch';
  if (dk.perch) releasePerch(state, cr);
  dk.mode = 'crash';
  dk.act = null;
  dk.crashT = 0;
  dk.vy = Math.max(wasPerched ? 300 : 0, dk.vy || 0);
  dk.cvx = wasPerched ? (cr.f || 1) * 260 : (dk.vx || 0) * 0.6;
  cr.flame = cr.swoop = null;
  dk.glow = 0;
  cr.mouthWin = null;
  setMouth(cr, partOf(cr, 'mouth'), false);
  cr.stats.crashes += 1;
  banner(state, 'WING TORN OFF! THE DRAKE CRASHES!', 3);
  state.sfxQ.push(['roar']);
  pop(state, cr.base.x, cr.base.y - 700, 'WING TORN!', '#ff5a1f', 2);
  cr.hooks.puff(cr.base.x, cr.base.y, '#8a847c', 14);
  for (const p of Object.values(state.players)) if (!p.bot && cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'THE DRAKE CRASHES! Bombs in its mouth!', [150, 60, 150, 60, 250]);
  void D;
  void ship;
}
function stepCrash(state, cr, ship, dt, mid) {
  const D = DK(), C = D.CRASH, dk = cr.drake, shelf = shelfOf(state);
  dk.crashT += dt;
  dk.pose = 'crash';
  dk.vy += C.GRAVITY * dt;
  dk.cvx *= Math.exp(-0.8 * dt);
  if (shelf) { const want = clamp(cr.base.x, shelf.x0 + 700, shelf.x1 - 700); dk.cvx += clamp(want - cr.base.x, -900, 900) * 1.5 * dt; cr.base.x += clamp(want - cr.base.x, -1800 * dt, 1800 * dt); } // (it comes down on the shelf, not beside it)
  cr.base.x += dk.cvx * dt;
  cr.base.y += dk.vy * dt;
  dk.rotAdd = clamp((dk.rotAdd || 0) - C.SPIN * dt, -1.1, 0);
  const landY = groundAt(state, cr.base.x, cr.base.y - D.TORSO.R - 700) - D.TORSO.R;
  if (cr.base.y >= landY) {
    cr.base.y = landY;
    dk.mode = 'crawl';
    dk.rotAdd = 0;
    dk.pose = 'crawl';
    dk.nextT = D.CRAWL.FIRST;
    dk.lastGape = cr.age - D.CRAWL.GAPE_EVERY + D.CRAWL.GAPE_FIRST * D.CRAWL.GAPE_EVERY;
    state.ship.shake = Math.max(state.ship.shake || 0, C.QUAKE);
    const lava = state.env && Number.isFinite(state.env.lavaY) && landY + D.TORSO.R >= state.env.lavaY - 4;
    cr.hooks.puff(cr.base.x, landY + D.TORSO.R, lava ? '#ff8a34' : '#8a847c', 18);
    pop(state, cr.base.x, landY - 500, 'CRASH!', '#ff5a1f', 2);
    state.sfxQ.push(['impact']);
    state.sfxQ.push(['roar']);
    cr.hooks.hurtPool(C.DAMAGE * cr.maxHp, 'crash');
    checkPhase(state, cr, ship);
  }
  void mid;
}
function crawlAfter(cr) { cr.drake.pose = 'crawl'; }

function stepCrawl(state, cr, ship, dt, mid) {
  const D = DK(), C = D.CRAWL, dk = cr.drake, shelf = shelfOf(state), a = dk.act;
  let gx = cr.base.x;
  if (cr.hooked) gx += (cr.tvx || 0) * dt; // a harpoon line hauls it (creatureTow.js)
  else if (cr.mouthWin && a && a.kind === 'gape') gx += clamp(lureX(state, cr, ship) - mouthAt(cr).x, -C.LURE_SPEED * dt, C.LURE_SPEED * dt); // (it scuttles to put its mouth under her bomb bay)
  else if (!a || a.kind !== 'lunge') { const dxm = mid.x - gx; if (Math.abs(dxm) > 500) gx += sgn(dxm) * C.SPEED * dt; }
  if (shelf) gx = clamp(gx, shelf.x0 + 600, shelf.x1 - 600);
  cr.base.x = gx;
  const gy = groundAt(state, gx, cr.base.y - D.TORSO.R - 500) - D.TORSO.R;
  cr.base.y += (gy - cr.base.y) * Math.min(1, 6 * dt);
  face(cr, sgn(mid.x - gx));
  dk.pose = 'crawl';
  cr.ai.mouthT = Math.max(0, dk.lastGape + C.GAPE_EVERY - cr.age); // (the bomb bay's crew read when the next window opens)
  if (a) {
    if (a.kind === 'breath') return stepBreath(state, cr, ship, dt, mid, a);
    if (a.kind === 'lunge') return stepLunge(state, cr, ship, dt, mid, a);
    if (a.kind === 'gape') return stepGape(state, cr, ship, dt, mid, a);
    if (a.kind === 'rear') return stepRear(state, cr, ship, dt, mid, a);
    if (a.kind === 'cough') {
      a.t += dt;
      dk.pose = 'cough';
      if (a.t >= D.CHOKE.COUGH) { dk.act = null; schedule2(state, cr); }
      return;
    }
  }
  if (cr.ai.breather > 0 || !canAttack(state)) return;
  const gapeDue = cr.age - dk.lastGape >= C.GAPE_EVERY;
  if (gapeDue) return startGape(state, cr, ship);
  if (cr.phase >= 3 && cr.age - dk.lastRear >= D.PHASE.REAR_EVERY && (dk.lastRear > 0 || cr.age - ((cr.stats.phaseAt || {})[3] || 0) >= D.PHASE.REAR_FIRST)) return startRear(state, cr);
  if ((dk.nextT -= dt) > 0) return;
  const f = forcedWin();
  if (f === 'choke' || (f !== 'bombs' && cr.hooks.rng() < 0.6)) { if (!startBreath(state, cr, ship, mid, 'crawl')) return; }
  else if (!startLunge(state, cr, ship)) schedule2(state, cr);
}
function schedule2(state, cr) {
  const C = DK().CRAWL, P = DK().PHASE;
  cr.drake.nextT = rand(cr, C.EVERY[0], C.EVERY[1]) * pauseOf(state) * (cr.phase >= 3 ? P.BREATH_MUL : 1);
}

// LUNGE: the neck snaps at the nearest part of the hull.
function startLunge(state, cr, ship) {
  const D = DK(), C = D.CRAWL, dk = cr.drake, b = ship.layout.bounds;
  const sx = clamp(toShipX(ship, cr.base.x), b.x0 + 100, b.x1 - 100), sy = b.y1 - 60;
  const root = neckRoot(cr), q = entry(ship, sx, sy);
  if (Math.hypot(q.x - root.x, q.y - root.y) > C.LUNGE_REACH) return false;
  dk.act = { kind: 'lunge', sub: 'wind', t: 0, sx, sy };
  cr.lunge = { x: q.x, y: q.y, t: 0 };
  cr.stats.lunges += 1;
  banner(state, 'THE DRAKE RISES TO LUNGE! ' + (sx > ship.layout.refPoint.x ? 'FORE' : 'AFT') + ' DECKS!', C.LUNGE_WARN + 0.8);
  state.sfxQ.push(['roar']);
  warnCrew(state, cr, ship, (p) => Math.abs(p.x - sx) <= D.BREATH.WARN_REACH && ship.layout.platforms[p.d].y > b.y0 + (b.y1 - b.y0) * 0.4, 'IT IS GOING TO LUNGE! GET OFF THE LOWER DECK!');
  return true;
}
function stepLunge(state, cr, ship, dt, mid, a) {
  const D = DK(), C = D.CRAWL, dk = cr.drake;
  a.t += dt;
  const q = entry(ship, a.sx, a.sy), root = neckRoot(cr);
  if (cr.lunge) { cr.lunge.x = q.x; cr.lunge.y = q.y; cr.lunge.t = a.t; }
  if (a.sub === 'wind') {
    dk.pose = 'gape';
    if (a.t >= C.LUNGE_WARN) { a.sub = 'strike'; a.t = 0; }
    return;
  }
  const d = Math.hypot(q.x - root.x, q.y - root.y), reach = cr.parts.find((p) => p.kind === 'neck').reach || 1;
  dk.pose = 'lunge';
  dk.aim = toBodyAngle(cr, q.x - root.x, q.y - root.y);
  if (a.sub === 'strike') {
    if (a.t >= 0.25) {
      a.sub = 'hold';
      a.t = 0;
      const sim = ship.sim;
      if (d <= C.LUNGE_REACH && sim) {
        cr.stats.lungeHits += 1;
        sim.damageHull(C.LUNGE_HULL);
        hitForce(ship.ctx, a.sx, a.sy, C.LUNGE_POWER);
        for (const p of Object.values(state.players)) {
          if (shipOf(state, p) !== ship || p.fly || p.fall || p.conn != null || p.ko > 0 || p.d == null) continue;
          if (Math.hypot(toWorldX(ship, p.x) - q.x, toWorldY(ship, p.y) - q.y) > C.LUNGE_HURT_R) continue;
          const res = hurt(p, C.LUNGE_HEARTS, { cause: 'slap' });
          if (res === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
          if (res && cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'THE DRAKE SNAPPED AT THE SHIP!', [200, 60, 200]);
        }
        pop(state, q.x, q.y - 160, 'SNAP!', '#ff5a1f', 1.6);
        state.ship.shake = Math.max(state.ship.shake || 0, 0.8);
        state.sfxQ.push(['impact']);
      } else pop(state, q.x, q.y - 160, 'MISSED!', '#ffffff', 1.2);
      cr.hooks.puff(q.x, q.y, '#ffe9a8', 10);
    }
    return;
  }
  void reach;
  if (a.t >= C.LUNGE_HOLD) { dk.act = null; cr.lunge = null; schedule2(state, cr); }
}

// GAPE: a mouth window, as the Kraken's beak (creatureFight.js): bombs into the gaping mouth feed it; FED of them win. It scuttles to put its mouth under her bomb bay.
function startGape(state, cr, ship) {
  const D = DK(), C = D.CRAWL, dk = cr.drake, h = cr.hooks;
  dk.act = { kind: 'gape', t: 0 };
  dk.lastGape = cr.age;
  const P = cr.phase >= 3 ? 1.2 : 1;
  cr.mouthWin = { t: 0, left: C.GAPE_FOR * P };
  cr.stats.gapes += 1;
  cr.stats.windows = (cr.stats.windows || 0) + 1;
  setMouth(cr, partOf(cr, 'mouth'), true);
  state.sfxQ.push(['roar']);
  banner(state, DRAKE_MOUTH_TEXT + ' (' + Math.floor(cr.fed) + '/' + D.FED + ')', C.GAPE_FOR);
  for (const p of Object.values(state.players)) {
    if (p.bot || p.fly || p.fall || shipOf(state, p) !== ship || !ship.layout.kindOf || ship.layout.kindOf(p.lock) !== 'bombBay') continue;
    if (h.phoneFx) h.phoneFx(p, 'MOUTH GAPES! Hold Action to DROP BOMBS!', [90, 40, 90]);
  }
}
function stepGape(state, cr, ship, dt, mid, a) {
  const M = config.CREATURES.MOUTH, dk = cr.drake, w = cr.mouthWin, mouth = partOf(cr, 'mouth');
  dk.pose = 'gape';
  a.t += dt;
  if (w) {
    w.t += dt;
    w.left -= dt;
    if (w.gulp > 0 && (w.gulp -= dt) <= 0 && w.left > M.REOPEN) setMouth(cr, mouth, true); // (it swallowed a bomb: shut a moment, then open again for what is left of the window)
  }
  if (!w || w.left <= 0) {
    cr.mouthWin = null;
    setMouth(cr, mouth, false);
    dk.act = null;
    schedule2(state, cr);
  }
}

// REAR (phase 3): it rears up, roaring, and the heart shows.
function startRear(state, cr) {
  const D = DK(), dk = cr.drake;
  dk.act = { kind: 'rear', t: 0 };
  dk.lastRear = cr.age;
  cr.stats.rears += 1;
  const h = partOf(cr, 'heart');
  if (h) h.hidden = false;
  setMouth(cr, partOf(cr, 'mouth'), true);
  banner(state, 'THE DRAKE REARS - ITS HEART SHOWS!', D.PHASE.REAR);
  state.sfxQ.push(['roar']);
}
function stepRear(state, cr, ship, dt, mid, a) {
  const D = DK(), dk = cr.drake;
  a.t += dt;
  dk.pose = 'rear';
  if (a.t >= D.PHASE.REAR) { dk.act = null; hideHeart(cr, dk.heartOpen <= 0); setMouth(cr, partOf(cr, 'mouth'), false); schedule2(state, cr); }
}

// ---- LAVA SPOUTS: vents on the lair's shelf that erupt in turn (and the tow into them is a win) ----
function buildSpouts(state) {
  const map = state.course && state.course.map, S = DK().SPOUT;
  if (!map || !map.spouts) return [];
  return map.spouts.map((s, i) => ({ x: s.x, w: S.W, y: s.y, off: (i * S.CYCLE) / Math.max(2, map.spouts.length), st: 'sleep', t: 0 }));
}
// Is any part of its body (torso, neck, head, tail) in the column of fire of an erupting spout?
function inColumn(cr, sp) {
  const H = DK().SPOUT.H;
  for (const p of cr.parts) {
    if (p.dead || p.hidden || p.kind === 'wing' || p.kind === 'mouth' || p.kind === 'heart') continue;
    for (const s of p.segs) {
      const ex = s.x + Math.cos(s.ang) * s.len, ey = s.y + Math.sin(s.ang) * s.len, pad = s.r * 0.4;
      if (Math.max(s.x, ex) + pad < sp.x - sp.w / 2 || Math.min(s.x, ex) - pad > sp.x + sp.w / 2 || Math.max(s.y, ey) < sp.y - H) continue;
      return true;
    }
  }
  return false;
}
function stepSpouts(state, cr, ship, dt) {
  const D = DK(), S = D.SPOUT, dk = cr.drake;
  for (const sp of dk.spouts) {
    const c = (cr.age + sp.off) % S.CYCLE, was = sp.st;
    sp.st = c < S.ERUPT ? 'erupt' : c >= S.CYCLE - S.WARN ? 'warn' : 'sleep';
    sp.t = c;
    if (sp.st === 'erupt' && was !== 'erupt') {
      state.sfxQ.push(['whoosh']);
      cr.hooks.puff(sp.x, sp.y - 300, '#ff8a34', 12);
      const near = Math.abs(shipMid(ship).x - sp.x) < S.W && ship.layout.bounds && toWorldY(ship, ship.layout.bounds.y1) > sp.y - S.H; // her keel in the column
      if (near && ship.sim && ship.sim.damageHull) { ship.sim.damageHull(S.HULL); banner(state, 'THE LAVA SPOUT SCORCHES THE HULL!', 2); state.ship.shake = Math.max(state.ship.shake || 0, 0.8); }
    }
  }
  // the tow: hauled over an erupting spout by a harpoon line, it is roasted (the Kraken's tow onto rock, creatureFight.js stepRock)
  if (cr.hooked && dk.mode === 'crawl' && !cr.dying) {
    const speed = Math.abs(cr.tvx || 0) + S.GRIND;
    const over = dk.spouts.find((sp) => sp.st === 'erupt' && inColumn(cr, sp));
    if (over && speed >= S.MIN_SPEED) {
      cr.hooks.hurtPool(speed * S.RATE * dt, 'spout');
      cr.stats.spouts += dt;
      state.ship.shake = Math.max(state.ship.shake || 0, S.SHAKE);
      if ((dk.popT = (dk.popT || 0) - dt) <= 0) {
        dk.popT = S.POP_EVERY;
        pop(state, cr.base.x, over.y - 500, 'ROASTED!', '#ff9a2e', 1.8);
        cr.hooks.puff(cr.base.x + (cr.hooks.rng() - 0.5) * 900, over.y - 300, '#ff8a34', 12);
        state.sfxQ.push(['impact']);
        if (!(state.ev.warn > 1)) banner(state, S.TEXT, 1.8);
      }
    }
  }
}
