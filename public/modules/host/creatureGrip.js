// THE GIANT CREATURE'S ATTACKS ON THE SHIP (BOSSES.md 3.1 "Grips", C.2): GRAB and SLAP, and how the crew gets free. Called by creatureSystem.js (think / hurtCreature), shipSim.js (the hack action) and bots.js.
//   GRAB   WIND (a limb rears beside the ship, a TV banner, a phone buzz for whoever stands there) -> SEIZE (it strikes; the tip is homed on the grip point) -> HOLD (the tip is glued to the grip point of the
//          ship, converted with pose.js every step: the ship is shoved down and toward the creature, twisted at the grip, config.CREATURES.GRIP) -> after TIME it RIPS that section off (ship.sim.breakOff).
//          It lets go early if the crew HACK it (sword / hammer, 3 blows or a 1.5 s hold at the grip point), if shells or the coil take RELEASE_DMG off the limb, if flame touches it, or if it is cut off.
//   SLAP   a limb rears high over the top deck (WINDUP), then whips along it: crew there lose hearts and are flung off (a jump clears it).
//   cr.grips = [grip]          grip = { limb, ship, mode ('wind' | 'seize' | 'hold' | 'recoil'), t, x, y (the grip point, SHIP coordinates), wx, wy (the same in the world, for the TV), left, total, dmg, job, ... }
//   grip.job = { name: 'hack', prog, worked, live, d, x }     the hold action's progress (shipSim.js drains it like the other jobs); d and x say where it is, for the job arrow and the bots
//   thinkAttacks(state, cr, ship, dt)       once a step (creatureSystem.js think): the timers, every grip and slap, new attacks
//   hurtGrips(cr, part, dmg, src)           a hit on a limb (creatureSystem.js hurtCreature)
//   actionFor(state, ship, player) / blow(...) / hacked(...)         the crew's side: the HACK action, an ATTACK blow, the finished hold
//   gripJobs(state, ship)                   the live grips as job records (jobs.js arrows, the bots)
//   gripped(ship)                           is some limb holding (or about to hold) this ship? COME ABOUT is refused while it is
import { config } from '../../config.js';
import { isFree, gripPart, moveGrip, releasePart, reachPart, setWrap } from './creature.js';
import { tilt } from './course.js';
import { startBreach, breachReady } from './creatureBreach.js';
import { phaseP } from './creatureFight.js';
import { crewAboard } from './crewscale.js';
import { toWorldX, toWorldY, driveGain } from './pose.js';
import { applyForce, hitForce } from './forces.js';
import { hurt, knockOut } from './health.js';
import { pop } from './popups.js';
import { shipOf } from './ships.js';
import { creatureHit } from './structure.js';

const CR = () => config.CREATURES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const diffOf = (state) => state.difficulty || 'normal';
const rootOf = (cr, p) => ({ x: cr.x + p.at[0] * cr.f, y: cr.y + p.at[1] });
// C.6c: the Island Titan's hand on the gasbag is the same grip with its own numbers (config.CREATURES.TITAN.GRAB overrides GRIP: a mostly sideways pull, a longer hold, a gentler squeeze).
// C.6d: the Rime Wyrm's coil is the Kraken's grab with config.CREATURES.WYRM.COIL merged over it (a longer hold, a wider helix, and ANCHOR: it stops the ship).
const gripCfg = (cr) => (cr && cr.kind === 'titan' ? { ...CR().GRIP, ...CR().TITAN.GRAB } : cr && cr.kind === 'wyrm' ? { ...CR().GRIP, ...CR().WYRM.COIL } : CR().GRIP);
const isTitan = (cr) => !!cr && cr.kind === 'titan';
const isWyrm = (cr) => !!cr && cr.kind === 'wyrm';

// How many tentacles may hold at once: by crew size (GRIPS_BY_CREW), fewer while it is blinded.
const blindCount = (cr) => cr.parts.filter((p) => p.kind === 'eye' && p.blindT > 0).length;
export const blindMul = (cr) => CR().BOARD.BLIND_RATE ** blindCount(cr);
export function gripCap(state, cr) {
  const n = crewAboard(state);
  let cap = 1;
  for (const [from, c] of CR().GRIPS_BY_CREW) if (n >= from) cap = c;
  const ph = phaseP(cr).grips; // (phase 1: single grabs, whatever the crew; later phases follow the crew)
  if (ph > 0) cap = Math.min(cap, ph);
  return Math.max(1, Math.round(cap * blindMul(cr)));
}

// ---- small helpers ----
const platformAt = (ship, y, x) => ship.layout.platforms.findIndex((pl) => Math.abs(pl.y - y) < 8 && x >= pl.x0 - 40 && x <= pl.x1 + 40);
const live = (g) => g.mode === 'wind' || g.mode === 'seize' || g.mode === 'hold';
export const gripped = (ship) => !!ship.ctx.creature && (ship.ctx.creature.grips || []).some((g) => g.ship === ship && live(g));
// C.6d, the Rime Wyrm: the coil holds her fast. Her speed along the sky is braked at BRAKE px/s^2 toward a slow DRIFT (px/s) toward the cliff (dx: the way to the cliff); her climb is left alone, so she can still dodge up or down.
function anchor(sh, dx, A, dt, t) {
  const per = driveGain(sh);
  if (!per) return;
  const want = (Math.sign(dx) || 1) * A.DRIFT * clamp(t / 1.2, 0, 1), dv = clamp(want - sh.pose.vx, -A.BRAKE * dt, A.BRAKE * dt);
  sh.ctx.ship.speed += dv / per;
}
// A shove of (dx, dy) px/s onto a ship's speed and climb (the way towing.js pushes: shipCollide.js does the same).
function shove(sh, dx, dy) {
  const per = driveGain(sh);
  if (per) sh.ctx.ship.speed += dx / per;
  sh.pose.vy += dy;
}

// ---- the coil ----
// Where the tip is glued (just over the deck at the grip point) and the helix the outer segments follow round the hull: from the top (over the gunwale), down the FRONT of her, under the keel and up the BACK
// (z > 0 in front of her, < 0 behind). Both come from the ship's own coordinates through her tilt and pose.js, so the coil moves and tips with her.
function entryOf(ship, g, G = CR().GRIP) {
  if (g.bag) { const [bx, by] = tilt(ship.ctx, g.bx, g.by); return { x: toWorldX(ship, bx), y: toWorldY(ship, by) }; } // (C.6c: the Titan's hand lies on the side of the gasbag)
  const [tx, ty] = tilt(ship.ctx, g.x, g.y - G.WRAP.LIFT);
  return { x: toWorldX(ship, tx), y: toWorldY(ship, ty) };
}
function coilPath(ship, g, prog, G = CR().GRIP) {
  const W = G.WRAP, L = ship.layout;
  let low = g.y;
  for (const pl of L.platforms) low = Math.max(low, pl.y);
  const top = g.y - W.LIFT, ry = Math.max(W.MIN_RY, (low + W.UNDER - top) / 2), cy = top + ry, inward = g.x > L.refPoint.x ? -1 : 1;
  const turns = (W.START_TURNS + (W.TURNS - W.START_TURNS) * prog) * Math.PI * 2, pts = [];
  for (let i = 0; i <= W.N; i++) {
    const a = (i / W.N) * turns, [tx, ty] = tilt(ship.ctx, g.x + (inward * W.PITCH * a) / (Math.PI * 2), cy - ry * Math.cos(a));
    pts.push({ x: toWorldX(ship, tx), y: toWorldY(ship, ty), z: Math.sin(a) });
  }
  return pts;
}

// ---- starting a grab ----
export function startGrip(state, cr, ship, dive = false) { // dive: one of the several grips of a phase-3 DIVE (holds a little shorter, pulls harder)
  const G = gripCfg(cr), h = cr.hooks, L = ship.layout;
  const cands = [];
  L.platforms.forEach((pl, d) => {
    if (pl.x1 - pl.x0 < G.MIN_DECK) return;
    for (const end of [0, 1]) {
      const x = end ? pl.x1 - 30 : pl.x0 + 30;
      const wx = toWorldX(ship, x), wy = toWorldY(ship, pl.y);
      if (cr.grips.some((g) => g.ship === ship && live(g) && Math.hypot(g.wx - wx, g.wy - wy) < G.SEP)) continue; // (not on top of another grip)
      let limb = null, bd = Infinity;
      for (const p of cr.parts) {
        if (!isFree(p)) continue;
        const r = rootOf(cr, p), dist = Math.hypot(wx - r.x, wy - r.y);
        if (dist > p.reach * G.REACH_SHARE || dist >= bd) continue;
        bd = dist;
        limb = p;
      }
      if (limb) cands.push({ d, x, y: pl.y, wx, wy, limb, score: Math.hypot(wx - cr.x, wy - cr.y) + h.rng() * 1500, fore: x > (pl.x0 + pl.x1) / 2, name: pl.name || 'DECK' });
    }
  });
  if (!cands.length) return null;
  cands.sort((a, b) => a.score - b.score);
  const c = cands[0], limb = c.limb;
  const total = G.TIME * (G.TIME_BY_DIFF[diffOf(state)] ?? 1) * (dive ? CR().DIVE.TIME_MUL : 1);
  const g = { dive, limb, ship, mode: 'wind', t: 0, x: c.x, y: c.y, wx: c.wx, wy: c.wy, left: total, total, dmg: 0, end: c.fore ? 'FORE' : 'AFT', deck: String(c.name).toUpperCase(), job: { name: 'hack', prog: 0, worked: false, live: true, d: c.d, x: c.x }, stat: { tilt: 0, secs: 0 } };
  cr.grips.push(g);
  limb.gripCd = 999; // (busy: nothing else uses this limb until the grip lets go)
  // the limb rears up beside the ship's end (a reach that holds), then the strike follows after WINDUP
  const root = rootOf(cr, limb), rx = c.wx + cr.side * 350, ry = c.wy - 500, d = Math.hypot(rx - root.x, ry - root.y), k = d > limb.reach * 0.97 ? (limb.reach * 0.97) / d : 1;
  reachPart(cr, limb, root.x + (rx - root.x) * k, root.y + (ry - root.y) * k);
  state.say('setpiece', dive ? CR().DIVE.TEXT : isWyrm(cr) ? 'THE WYRM COILS! ' + g.end + ' ' + g.deck + '!' : 'TENTACLE! ' + g.end + ' ' + g.deck + '!', 6, 2.6);
  state.sfxQ.push(['roar']);
  warnCrew(state, cr, ship, g, 'GET OFF THE ' + g.end + ' ' + g.deck + '!');
  return g;
}

// C.6c, THE TITAN'S HAND ON THE GASBAG: the same grip record as a tentacle's (cr.grips). The grip point g.x, g.y is the end of the top deck nearest the Titan (where swords pry the fingers off), the hand itself lies on the
// side of the gasbag (g.bx, g.by, ship coordinates; entryOf). Returns the grip, or null if no free arm can reach the bag or the ship has no bag or no top deck.
export function startBagGrip(state, cr, ship) {
  const G = gripCfg(cr), h = cr.hooks, L = ship.layout, d = topDeck(ship);
  if (d < 0 || !L.gasbags.length) return null;
  const pl = L.platforms[d];
  const sd = (Math.sign(cr.x - toWorldX(ship, L.refPoint.x)) || 1) * (ship.pose.f || 1); // (the way along the ship, in her own coordinates, toward the Titan)
  const bag = L.gasbags.reduce((best, b) => (!best || sd * (b.cx + sd * b.rx) > sd * (best.cx + sd * best.rx) ? b : best), null);
  const x = sd > 0 ? pl.x1 - 30 : pl.x0 + 30, bx = bag.cx + sd * bag.rx * 0.9, by = bag.cy - bag.ry * 0.3;
  const wx = toWorldX(ship, bx), wy = toWorldY(ship, by);
  let limb = null, bd = Infinity;
  for (const p of cr.parts) {
    if (!isFree(p) || p.severed) continue; // (a stump has no hand)
    const r = rootOf(cr, p), dist = Math.hypot(wx - r.x, wy - r.y);
    if (dist > p.reach * G.REACH_SHARE || dist >= bd) continue;
    bd = dist;
    limb = p;
  }
  if (!limb) return null;
  const total = G.TIME * (G.TIME_BY_DIFF[diffOf(state)] ?? 1);
  const gwx = toWorldX(ship, x), gwy = toWorldY(ship, pl.y);
  const g = { bag: true, bagI: L.gasbags.indexOf(bag), bx, by, dive: false, limb, ship, mode: 'wind', t: 0, x, y: pl.y, wx: gwx, wy: gwy, left: total, total, dmg: 0, end: sd > 0 ? 'FORE' : 'AFT', deck: String(pl.name || 'TOP DECK').toUpperCase(), job: { name: 'hack', prog: 0, worked: false, live: true, d, x }, stat: { tilt: 0, secs: 0 } };
  cr.grips.push(g);
  limb.gripCd = 999;
  const root = rootOf(cr, limb), rx = wx + cr.side * 400, ry = wy - 700, dd = Math.hypot(rx - root.x, ry - root.y), k = dd > limb.reach * 0.97 ? (limb.reach * 0.97) / dd : 1;
  reachPart(cr, limb, root.x + (rx - root.x) * k, root.y + (ry - root.y) * k); // (the hand rears over the bag first)
  state.say('setpiece', 'THE TITAN GRABS THE GASBAG! SWORDS TO THE ' + g.end + ' TOP DECK!', 6, 3);
  state.sfxQ.push(['roar']);
  warnCrew(state, cr, ship, g, 'ITS HAND IS ON THE GASBAG! Take a sword to the ' + g.end + ' TOP DECK and pry the fingers off!', [150, 60, 150, 60, 250]);
  return g;
}

// The crew standing near the spot (same deck, within WARN_REACH) feel it on their phones.
function warnCrew(state, cr, ship, g, text, buzz = [120, 60, 120, 60, 200]) {
  const R = gripCfg(cr).WARN_REACH, pl = ship.layout.platforms;
  for (const p of Object.values(state.players)) {
    if (p.bot || p.fly || p.fall || p.d == null || shipOf(state, p) !== ship || !pl[p.d] || Math.abs(pl[p.d].y - g.y) > 8 || Math.abs(p.x - g.x) > R) continue;
    if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, text, buzz);
  }
}

// ---- one grip, one step ----
export function releaseGrip(cr, g, why) {
  if (g.mode === 'recoil') return;
  const G = gripCfg(cr);
  g.mode = 'recoil';
  g.t = 0;
  g.why = why;
  g.job.live = false;
  g.job.prog = 0;
  if (!g.limb.dead) releasePart(cr, g.limb);
  setWrap(g.limb, null);
  g.limb.gripCd = G.COOLDOWN;
  cr.stats.grips = (cr.stats.grips || 0) + 1;
  cr.stats.freed = cr.stats.freed || {};
  cr.stats.freed[why] = (cr.stats.freed[why] || 0) + 1;
}

function stepGrip(state, cr, g, dt) {
  const G = gripCfg(cr), ship = g.ship, limb = g.limb;
  g.t += dt;
  if (g.mode === 'recoil') {
    if (!limb.dead && limb.ctl.mode === 'idle') limb.ctl.fast = true; // (it snaps back, not lazily)
    return g.t >= G.RECOIL;
  }
  if (limb.dead || limb.severed) { g.job.live = false; g.mode = 'recoil'; g.why = 'severed'; limb.gripCd = G.COOLDOWN; cr.stats.freed = cr.stats.freed || {}; cr.stats.freed.severed = (cr.stats.freed.severed || 0) + 1; cr.stats.grips = (cr.stats.grips || 0) + 1; return true; }
  if (!state.ships.includes(ship) || ship.state.down > 0 || ship.ctx.wreck || cr.mode !== 'idle') { releaseGrip(cr, g, 'gone'); return false; }
  const pi = platformAt(ship, g.y, g.x);
  if (pi < 0) { releaseGrip(cr, g, 'gone'); return false; } // (that section broke off or was rebuilt)
  g.job.d = pi;
  if (g.job.hot > 0) { g.job.hot -= dt; g.job.worked = true; } // (a blow keeps the hack from wearing off for a moment)
  g.wx = toWorldX(ship, g.x);
  g.wy = toWorldY(ship, g.y);
  const en = entryOf(ship, g, G);
  g.ex = en.x;
  g.ey = en.y;
  if (g.mode === 'wind') {
    if (limb.ctl.target) { limb.ctl.target.x = en.x; limb.ctl.target.y = en.y; }
    if (g.t >= G.WINDUP) {
      gripPart(cr, limb, en.x, en.y);
      g.mode = 'seize';
      g.t = 0;
    }
    return false;
  }
  if (g.mode === 'seize') {
    if (limb.ctl.target) { limb.ctl.target.x = en.x; limb.ctl.target.y = en.y; } // (the strike homes on the spot as she flies on)
    if (limb.grip) {
      g.mode = 'hold';
      g.t = 0;
      moveGrip(limb, en.x, en.y);
      state.sfxQ.push(['grip']);
      pop(state, g.wx, g.wy - 140, 'GRABBED!', '#ff5a1f', 1.6);
      cr.hooks.puff(g.wx, g.wy, '#7a3a5a', 10);
      state.ship.shake = Math.max(state.ship.shake || 0, 0.6);
      if (ship.sim && ship.sim.air) ship.sim.air.shove(G.SHOVE_POWER, g.x); // (the crew on the open decks stagger toward the low end)
      warnCrew(state, cr, ship, g, isTitan(cr) ? 'PRY ITS FINGERS OFF! (sword, hold Action)' : isWyrm(cr) ? 'THE WYRM HAS YOU! Chip its ice with a hammer, shell it - or HACK THE COIL (sword)!' : 'HACK THE TENTACLE! (sword, hold Action)', [200, 60, 200]);
    } else if (g.t > G.SEIZE_MAX) releaseGrip(cr, g, 'missed');
    return false;
  }
  // HOLD: the tip goes with the ship; she is dragged down and toward it; the timer runs
  moveGrip(limb, en.x, en.y);
  if (!isTitan(cr)) setWrap(limb, coilPath(ship, g, Math.min(1, Math.floor(g.t * 8) / G.WRAP.KEYS), G), G.WRAP.SEGS); // (the coil tightens in stepped keys, no wobble; a stone hand does not coil)
  const root = rootOf(cr, limb);
  const dx = root.x - g.wx, dy = root.y - g.wy, d = Math.hypot(dx, dy) || 1;
  const sx = (dx / d) * G.SIDEWAYS, sy = 1, sm = Math.hypot(sx, sy), px = sx / sm, py = sy / sm;
  const stretch = Math.max(0, d - limb.reach * G.SLACK);
  const holders = cr.grips.filter((q) => q.ship === ship && q.mode === 'hold');
  const holding = holders.length || 1, D = CR().DIVE, diving = holders.some((q) => q.dive); // (a DIVE: the grips pull harder, and all together up to MAX_TOTAL x TOTAL_MUL)
  const a = Math.min(G.MAX_ACC * (g.dive ? D.PULL_MUL : 1), (G.BASE_ACC + G.K * stretch) * (g.dive ? D.PULL_MUL : 1), (G.MAX_TOTAL * (diving ? D.TOTAL_MUL : 1)) / holding) * clamp(g.t / G.RAMP, 0.15, 1); // (every grip pulls: the pull grows with their number, up to MAX_TOTAL)
  g.acc = a; // (px/s^2 this grip pulls with right now: the gate adds them up)
  shove(ship, px * a * dt, py * a * dt);
  if (G.ANCHOR) anchor(ship, dx, G.ANCHOR, dt, g.t); // (C.6d: the Rime Wyrm STOPS her)
  applyForce(ship.ctx, { x: g.bag ? g.bx : g.x, y: g.bag ? g.by : g.y, fx: px * ship.pose.f * a * G.TORQUE, fy: py * a * G.TORQUE, source: 'grab' });
  state.ship.shake = Math.max(state.ship.shake || 0, G.SHAKE);
  g.stat.secs += dt;
  const fo = ship.ctx.forces;
  if (fo) g.stat.tilt = Math.max(g.stat.tilt, Math.abs(fo.theta));
  g.left -= dt;
  if (g.left <= 0) rip(state, cr, g);
  return false;
}

// The time is up: the section is torn off (a ship with nothing that can break takes a big hull hit), and the limb lets go.
function rip(state, cr, g) {
  const G = gripCfg(cr), ship = g.ship, sim = ship.sim;
  const wx = g.wx, wy = g.wy;
  if (g.bag) return squeeze(state, cr, g);
  let r = null;
  if (sim && sim.breakOff) r = sim.breakOff({ kind: 'limb', x: g.x, y: g.y, reach: G.RIP.REACH, len: G.RIP.LEN, cause: 'creature' }, { force: true });
  if (r) cr.stats.ripped = (cr.stats.ripped || 0) + 1;
  else {
    creatureHit(ship, g.x, g.y, G.RIP.HULL); // (STRUCTURE.md WP2: the segment under the grip)
    cr.stats.hulled = (cr.stats.hulled || 0) + 1;
    if (ship.main) { state.say('setpiece', 'THE TENTACLE CRUSHES HER HULL!', null, 3.5); }
    hitForce(ship.ctx, g.x, g.y, 4);
  }
  pop(state, wx, wy - 140, 'RIPPED!', '#ff2a2a', 1.8);
  cr.hooks.puff(wx, wy, '#7a3a5a', 14);
  state.sfxQ.push(['impact']);
  state.ship.shake = Math.max(state.ship.shake || 0, 1.2);
  releaseGrip(cr, g, 'rip');
}

// C.6c: the Titan's time is up: it SQUEEZES the gasbag (holes in the bag, a blow on the frame under it) and lets go. Nothing is torn off the decks.
function squeeze(state, cr, g) {
  const R = gripCfg(cr).RIP, ship = g.ship, bag = ship.layout.gasbags[g.bagI];
  let n = 0;
  if (bag && ship.sim && ship.sim.gasHoleAt) {
    for (let k = 0; k < R.HOLES && ship.ctx.gasHoles.length < config.GAS.MAX_HOLES; k++) {
      const sx = bag.cx + (cr.hooks.rng() - 0.5) * bag.rx * 1.2, u = clamp((sx - bag.cx) / bag.rx, -0.95, 0.95), sy = bag.cy - bag.ry * Math.sqrt(Math.max(0, 1 - u * u)) + 40;
      ship.ctx.gasHoles.push(ship.sim.gasHoleAt(sx, sy, g.bagI));
      n++;
    }
  }
  creatureHit(ship, g.x, g.y, R.HULL, { power: R.POWER }); // (STRUCTURE.md WP2: the segment under the bag)
  hitForce(ship.ctx, g.bx, g.by, R.POWER * 2);
  cr.stats.hulled = (cr.stats.hulled || 0) + 1;
  cr.stats.squeezed = (cr.stats.squeezed || 0) + 1;
  cr.stats.holes = (cr.stats.holes || 0) + n;
  pop(state, g.wx, g.wy - 160, 'SQUEEZED!', '#ff2a2a', 1.8);
  cr.hooks.puff(g.wx, g.wy - 300, '#d9cbb0', 14);
  state.sfxQ.push(['impact']);
  state.ship.shake = Math.max(state.ship.shake || 0, 1);
  if (ship.main) state.say('setpiece', 'THE TITAN SQUEEZED THE GASBAG!', null, 3);
  releaseGrip(cr, g, 'rip');
}

// A hit on a limb (hurtCreature): flame makes it let go at once, shells or the coil once it has taken RELEASE_DMG of its health since it seized.
export function hurtGrips(cr, part, dmg, src) {
  for (const g of cr.grips) {
    if (g.limb !== part || !live(g)) continue;
    g.dmg += dmg;
    if (src === 'flame' && !isWyrm(cr)) releaseGrip(cr, g, 'flame'); // (the Rime Wyrm's ice melts under flame: that is no reason for it to let go)
    else if (part.hp <= 0) releaseGrip(cr, g, 'severed');
    else if (g.dmg >= gripCfg(cr).RELEASE_DMG * part.maxHp) releaseGrip(cr, g, 'shot');
    else continue;
    cr.hooks.puff(g.wx, g.wy, '#ffffff', 6);
  }
}

// ---- the crew's side ----
// The grip this crewman can hack: same deck, within CUT_REACH of the grip point, the grip glued (HOLD).
export function gripNear(state, ship, p) {
  const cr = state.creature;
  if (!cr || p.d == null || p.fly || p.fall || p.conn != null) return null;
  const pl = ship.layout.platforms[p.d];
  if (!pl) return null;
  return cr.grips.find((g) => g.ship === ship && g.mode === 'hold' && Math.abs(pl.y - g.y) < 8 && Math.abs(p.x - g.x) <= gripCfg(cr).CUT_REACH) || null;
}
// The Action button: HACK THE TENTACLE! with a sword (or, slower, a hammer); anything else near it says what is missing. (The Titan's hand: PRY ITS FINGERS OFF!)
export function actionFor(state, ship, p) {
  const g = gripNear(state, ship, p), cr = state.creature, G = gripCfg(cr), what = isTitan(cr) ? 'PRY ITS FINGERS OFF!' : isWyrm(cr) ? 'HACK THE COIL!' : 'HACK THE TENTACLE!';
  if (!g) return null;
  if (p.carry === 'sword') return { type: 'hack', obj: g.job, hold: true, time: G.SWORD_TIME, label: what };
  if (p.carry === 'hammer') return { type: 'hack', obj: g.job, hold: true, time: G.HAMMER_TIME, label: what.replace(/!$/, '') + '! (hammer: slow)' };
  return { type: 'need', label: isTitan(cr) ? 'Need a sword to pry its fingers off!' : 'Need a sword to hack the tentacle!' };
}
// ATTACK with a sword (or a hammer) beside the grip point: one blow of BLOWS. True = it was a blow at the tentacle.
export function blow(state, ship, p) {
  const g = gripNear(state, ship, p), G = gripCfg(state.creature);
  if (!g || (p.carry !== 'sword' && p.carry !== 'hammer')) return false;
  g.job.prog += (p.carry === 'sword' ? 1 : G.HAMMER_BLOW) / G.BLOWS;
  g.job.worked = true;
  g.job.hot = G.BLOW_HOLD;
  p.face = g.x < p.x ? -1 : 1;
  p.atkCd = config.TOOLS.SWORD_COOLDOWN;
  p.swingT = performance.now();
  state.creature.hooks.puff(g.wx, g.wy, '#ffffff', 4);
  pop(state, g.wx, g.wy - 100, 'whack', '#ffffff', 0.8);
  state.sfxQ.push(['hit']);
  if (g.job.prog >= 1) hacked(state, ship, p, g.job);
  return true;
}
// The hold (or the blows) finished: the tentacle lets go.
export function hacked(state, ship, p, job) {
  const cr = state.creature;
  const g = cr && cr.grips.find((q) => q.job === job);
  if (!g || !live(g)) return;
  releaseGrip(cr, g, 'hack');
  cr.stats.hacks = (cr.stats.hacks || 0) + 1;
  if (state.moment && p) state.moment('creature-freed', { who: [p], data: { creature: cr.name, how: isTitan(cr) ? 'pry' : 'hack' } }); // (the Ship's Book)
  pop(state, g.wx, g.wy - 140, 'FREE!', '#8fe388', 1.6);
  cr.hooks.puff(g.wx, g.wy, '#8fe388', 8);
  state.sfxQ.push(['clang']);
  if (cr.hooks.phoneFx && p) cr.hooks.phoneFx(p, 'You hacked it free!', [30, 40, 30]);
}
// The live grips on a ship as job records for the finder and the bots: { kind: 'hack', obj: job, d, x }.
export function gripJobs(state, ship) {
  const cr = state.creature;
  if (!cr || !cr.grips) return [];
  const more = cr.hooks && cr.hooks.moreJobs ? cr.hooks.moreJobs(ship) : []; // (the Cinder Drake on her bag: DRIVE IT OFF, a hold-action job at the deck under it, creatureDrake.js)
  const hold = cr.hooks && cr.hooks.holdBack ? cr.hooks.holdBack : () => false; // (C.6d: the Rime Wyrm's crew chips and shoots first and hacks last: the hack arrow waits until HACK_AT s are left)
  return [...cr.grips.filter((g) => g.ship === ship && live(g) && g.job.live && !hold(g)).map((g) => ({ kind: 'hack', obj: g.job, d: g.job.d, x: g.x })), ...more];
}
export const jobsOf = (state, ship) => (state.creature && state.creature.grips ? state.creature.grips.filter((g) => g.ship === ship).map((g) => g.job) : []);

// ---- SLAP ----
// The top deck: the highest open deck that is long enough (the crow's nests are too small to count).
export function topDeck(ship) {
  let best = -1;
  ship.layout.platforms.forEach((pl, d) => {
    if (pl.x1 - pl.x0 < CR().GRIP.MIN_DECK) return;
    if (best < 0 || pl.y < ship.layout.platforms[best].y) best = d;
  });
  return best;
}
function startSlap(state, cr, ship) {
  const S = CR().SLAP, d = topDeck(ship);
  if (d < 0) return null;
  const pl = ship.layout.platforms[d];
  const nearX = cr.side * ship.pose.f > 0 ? pl.x1 - 40 : pl.x0 + 40; // (the end toward the creature, in ship coordinates)
  const wx = toWorldX(ship, nearX), wy = toWorldY(ship, pl.y) - S.RISE;
  let limb = null, bd = Infinity;
  for (const p of cr.parts) {
    if (!isFree(p)) continue;
    const r = rootOf(cr, p), dist = Math.hypot(wx - r.x, wy - r.y);
    if (dist < bd && dist < p.reach) { bd = dist; limb = p; }
  }
  if (!limb) return null;
  const root = rootOf(cr, limb), k = bd > limb.reach * 0.97 ? (limb.reach * 0.97) / bd : 1;
  reachPart(cr, limb, root.x + (wx - root.x) * k, root.y + (wy - root.y) * k);
  const s = { limb, ship, mode: 'wind', t: 0, nearX, y: pl.y, farX: nearX === pl.x1 - 40 ? pl.x0 + 40 : pl.x1 - 40 };
  cr.slap = s;
  limb.gripCd = 999;
  state.say('setpiece', 'TENTACLE RISING! GET OFF THE TOP DECK!', 6, 2.4);
  state.sfxQ.push(['roar']);
  for (const p of Object.values(state.players)) if (!p.bot && shipOf(state, p) === ship && p.d === d && !p.fly && cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'SLAP! GET OFF THE TOP DECK - or JUMP!', [150, 60, 150]);
  return s;
}
function stepSlap(state, cr, s, dt) {
  const S = CR().SLAP, ship = s.ship, limb = s.limb;
  s.t += dt;
  if (limb.dead || limb.severed || !state.ships.includes(ship)) return true;
  const d = ship.layout.platforms.findIndex((pl) => Math.abs(pl.y - s.y) < 8);
  if (d < 0) return true;
  if (s.mode === 'wind') {
    if (s.t >= S.WINDUP) {
      const wx = toWorldX(ship, s.farX), wy = toWorldY(ship, s.y) - 80;
      reachPart(cr, limb, wx, wy);
      s.mode = 'whip';
      s.t = 0;
    }
    return false;
  }
  if (s.t < S.WHIP_DELAY) return false;
  lashDeck(state, cr, ship, d, s);
  limb.gripCd = S.COOLDOWN;
  return true;
}
// The whip lands: hull damage, a kick, and everyone on the top deck is hurt and (unless he sits at a station) flung along it; a hop clears it.
function lashDeck(state, cr, ship, d, s) {
  const S = CR().SLAP, sim = ship.sim;
  const dir = Math.sign(s.farX - s.nearX) || 1;
  let hit = 0, dodged = 0;
  for (const p of Object.values(state.players)) {
    if (shipOf(state, p) !== ship || p.d !== d || p.fly || p.fall || p.conn != null || p.ko > 0 || p.on) continue;
    if (p.air && (p.jz || 0) > S.DUCK_JZ) { dodged++; if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'You jumped it!', [30, 40, 30]); continue; }
    const res = hurt(p, S.HEARTS, { cause: 'slap' });
    hit++;
    if (res === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
    else if (!p.lock && sim && sim.air) {
      p.tossed = true; // (Action opens his parachute)
      sim.air.startFlight(p, dir * S.VX, -S.VY);
      p.face = dir * ship.pose.f;
      if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'SLAPPED OFF THE DECK! Open the parachute or grab a ladder!', [200, 60, 200]);
    } else if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'SLAPPED!', [200, 60, 200]);
  }
  creatureHit(ship, (s.nearX + s.farX) / 2, s.y, S.HULL, { power: S.POWER }); // (the segment the whip lands on)
  hitForce(ship.ctx, (s.nearX + s.farX) / 2, s.y, S.POWER);
  state.ship.shake = Math.max(state.ship.shake || 0, 1);
  const wx = toWorldX(ship, (s.nearX + s.farX) / 2), wy = toWorldY(ship, s.y);
  pop(state, wx, wy - 160, 'SLAP!', '#ff5a1f', 1.8);
  cr.hooks.puff(wx, wy - 60, '#d9cbb0', 14);
  state.sfxQ.push(['slap']);
  cr.stats.slaps = (cr.stats.slaps || 0) + 1;
  cr.stats.slapHits = (cr.stats.slapHits || 0) + hit;
  cr.stats.slapDodged = (cr.stats.slapDodged || 0) + dodged;
}

// ---- the attack director ----
// C.6c: for a creature with its own director (the Titan, creatureTitan.js): the limbs' rest timers and every grip under way, once a step; nothing new starts here.
export function tickGrips(state, cr, dt) {
  for (const p of cr.parts) {
    if (p.gripCd > 0) p.gripCd -= dt;
    if (p.blindT > 0) p.blindT -= dt;
  }
  cr.grips = cr.grips.filter((g) => !stepGrip(state, cr, g, dt));
}
export function thinkAttacks(state, cr, ship, dt) {
  const G = CR().GRIP, S = CR().SLAP, ai = cr.ai, h = cr.hooks;
  if (ai.gripT === undefined) {
    ai.gripT = G.FIRST;
    ai.slapT = S.FIRST;
  }
  for (const p of cr.parts) {
    if (p.gripCd > 0) p.gripCd -= dt;
    if (p.blindT > 0) p.blindT -= dt;
  }
  cr.grips = cr.grips.filter((g) => !stepGrip(state, cr, g, dt));
  if (cr.slap && stepSlap(state, cr, cr.slap, dt)) cr.slap = null;
  if (cr.mode !== 'idle') return; // (rising or sinking: no new attacks)
  // C.3: the phase says how it attacks (creatureFight.js, config.CREATURES.PHASE.P): single grabs or as many as the crew can bear, whether it lunges, how fast, and (phase 3) the DIVE. A phase change
  // is followed by a BREATHER (ai.breather s) in which the timers stand still and nothing new starts.
  const P = phaseP(cr), calm = ai.breather > 0, run = dt;
  const liveN = cr.grips.filter((g) => g.mode !== 'recoil').length;
  const dm = G.EVERY_BY_DIFF[diffOf(state)] ?? 1;
  const jitter = () => 1 + (h.rng() * 2 - 1) * G.JITTER;
  const D = CR().DIVE;
  if (!calm && P.dive && ai.diveT !== undefined && (ai.diveT -= run) <= 0) { // DIVE: it dives and grips her with several limbs at once, pulling her down hard
    if (state.phase === 'flying' && !state.goingDown && !cr.slap && liveN === 0 && !(ai.diving > 0)) {
      ai.diving = Math.min(D.GRIPS, gripCap(state, cr) + D.EXTRA);
      ai.gripT = 0;
      ai.diveT = D.EVERY * dm * jitter();
      cr.stats.dives = (cr.stats.dives || 0) + 1;
    } else ai.diveT = 1.5;
  }
  if (!calm && (ai.gripT -= run) <= 0 && state.phase === 'flying') {
    if (ai.diving > 0) {
      const g = !state.goingDown ? startGrip(state, cr, ship, true) : null;
      if (g) { ai.diving -= 1; ai.gripT = ai.diving > 0 ? D.SPREAD : G.EVERY * dm * jitter() * P.gripMul; } // (the dive's grips seize close together)
      else { ai.diving = 0; ai.gripT = 1.5; }
    } else if (liveN < gripCap(state, cr) && !state.goingDown) {
      const g = startGrip(state, cr, ship);
      if (!g) ai.gripT = 1.5;
      else { // one attack is a burst of as many grips as the crew size allows (SPREAD s apart), then a pause of EVERY
        if (!(ai.burst >= 0)) ai.burst = gripCap(state, cr) - 1;
        else ai.burst -= 1;
        if (ai.burst > 0) ai.gripT = G.SPREAD;
        else { ai.burst = -1; ai.gripT = (G.EVERY * dm * jitter() * P.gripMul) / blindMul(cr); }
      }
    } else ai.gripT = 1.5;
  }
  if (ai.breachT === undefined) ai.breachT = CR().BREACH.FIRST;
  if (!calm && P.breach && (ai.breachT -= run) <= 0 && !cr.slap && liveN === 0 && cr.grips.length === 0 && !(ai.diving > 0)) {
    const B = CR().BREACH;
    if (breachReady(state, cr) && startBreach(state, cr, ship)) ai.breachT = B.EVERY * (G.EVERY_BY_DIFF[diffOf(state)] ?? 1) * (1 + (h.rng() * 2 - 1) * B.JITTER);
    else ai.breachT = 2;
  }
  if (!calm && (ai.slapT -= run) <= 0 && !cr.slap && liveN === 0 && cr.mode === 'idle' && !(ai.diving > 0)) {
    const s = startSlap(state, cr, ship);
    ai.slapT = s ? (S.EVERY * (G.EVERY_BY_DIFF[diffOf(state)] ?? 1) * P.slapMul * (1 + (h.rng() * 2 - 1) * S.JITTER)) : 2;
  }
}
