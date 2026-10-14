// THE RIME WYRM'S FIGHT (BOSSES.md 2.4, C.6d): a burrower that erupts out of the ice cliffs of the Frost Peaks lair. creatures/wyrm.js is its body, creatureSystem.js the world around it (damage, targets, death),
// creatureGrip.js the coil (the Kraken's grab with its own numbers, config.CREATURES.WYRM.COIL), creatureFight.js the funnel and the lure. The numbers are config.CREATURES.WYRM.
//   MODES (cr.wyrm.mode)    'buried' (under the rock, untouchable; cr.mode 'surfacing') -> 'crack' (CRACK s of cracks spreading on the cliff face: the telegraph) -> 'out' (it has erupted; cr.mode 'idle') -> 'buried' again | 'dying'
//   SUBS (cr.wyrm.sub)      while out: 'rise' (the collar comes up) -> 'strike' (the coil is started) -> 'coil' (it holds the hull and STOPS her) -> 'gape' (the maw open for bombs) -> 'retreat' (it burrows)
//                           | 'miss' (nothing in reach) | 'idle' (phase 3 only: it cannot burrow, it waits for its next coil, gape or breath)
//   ICE ARMOUR              part.ice[segment] (collar, body, head): shells bounce until a hammer chips the segment bare (wyrmAction / wyrmBlow), flame or the sun melts it (wyrmArmour); it freezes over again each eruption
//   FROST BREATH            a wind-up and then the guns nearest the head are frozen (state.icing crusts at level 1: the frost environment's own jam, hammer or flame thaws them)
//   THE SUN                 phase 3: a shaft of sun on the ship's side of the cliff; the harpoon hauls the head into it and the pool melts (a win)
//   stepWyrm(state, cr, ship, dt)       once a step (creatureSystem.js update)
//   wyrmArmour / wyrmWays / wyrmDied    what a blow does against the ice, the ways it ends, its death;  wyrmAction / wyrmBlow / wyrmHacked / wyrmChipJobs / wyrmChipObjects / wyrmHoldBack    the crew's side of the ice
import { config } from '../../config.js';
import { snapPose, tipOf, setMouth, segDist } from './creature.js';
import { WYRM_PHASES, WYRM_MOUTH_TEXT } from './creatures/wyrm.js';
import { warnCrew } from './creatureBreath.js';
import { tickGrips, startGrip } from './creatureGrip.js';
import { lureX } from './creatureFight.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { gunSpotsOf } from './environments.js';
import { pop } from './popups.js';

const WD = () => config.CREATURES.WYRM;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const diffOf = (state) => state.difficulty || 'normal';
const pauseOf = (state) => (config.CREATURES.GRIP.EVERY_BY_DIFF[diffOf(state)] ?? 1);
const rand = (cr, a, b) => a + cr.hooks.rng() * (b - a);
const banner = (state, text, secs = 2.6) => { state.say('setpiece', text, null, secs); };
const canAttack = (state) => state.phase === 'flying' && !state.ship.down && !state.goingDown;
const shipMid = (ship) => ({ x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) });
const partOf = (cr, id) => cr.parts.find((p) => p.id === id);
const limbOf = (cr) => partOf(cr, 'wyrm');
const mouthOf = (cr) => partOf(cr, 'mouth');
const segMid = (s, u = 0.5) => ({ x: s.x + Math.cos(s.ang) * s.len * u, y: s.y + Math.sin(s.ang) * s.len * u });
const icedParts = (cr) => ['collar', 'wyrm', 'head'].map((id) => partOf(cr, id)).filter((p) => p && !p.dead);
const liveGrips = (cr) => cr.grips.filter((g) => g.mode !== 'recoil').length;
const cliffsOf = (state) => (state.course && state.course.map && state.course.map.cliffs) || [];

// ---- setting it up (creatureSystem.js spawnWyrm) ----
export function setupWyrm(state, cr, ship) {
  const W = WD(), CY = W.CYCLE;
  Object.assign(cr.wyrm, {
    mode: 'buried', sub: null, t: 0, age: 0, nextT: CY.FIRST, cliff: null, crack: null, shown: false, dive: CY.RISE_DEEP, side: ship.pose.f || 1,
    breath: null, breathT: 0, gape: null, coilT: 0, gapeT: 0, sun: null, haul: 0, lure: null, bounceAt: -9, chipSeen: {}, chipOn: {},
  });
  Object.assign(cr.stats, { erupts: 0, coils: 0, misses: 0, chips: 0, bounces: 0, breaths: 0, gunsIced: 0, windows: 0, sunSecs: 0, struck: 0, melted: 0, vented: 0 });
  cr.fed = 0;
  cr.mouthWin = null;
  cr.ai.mouthT = undefined;
  cr.mode = 'surfacing';
  freeze(cr);
}

// ---- the ice ----
function freeze(cr, keep = false) { // every iced part gets a fresh coat (keep: only the segments with none yet)
  const I = WD().ICE, k = cr.phase >= 3 ? I.P3_MUL : 1;
  for (const p of icedParts(cr)) {
    const m = (p.kind === 'mantle' ? I.COLLAR_MUL : p.kind === 'head' ? I.HEAD_MUL : 1) * I.HP * k;
    if (!p.ice) { p.ice = []; p.iceMax = []; p.iceAge = []; }
    p.segs.forEach((_, i) => {
      p.iceMax[i] = m;
      if (!keep || p.ice[i] === undefined) p.ice[i] = m;
      p.iceAge[i] = 0;
    });
  }
}
export const iceLeft = (cr) => icedParts(cr).reduce((n, p) => n + (p.ice || []).filter((v) => v > 0).length, 0);
function stepIce(state, cr, ship, dt) {
  const I = WD().ICE, wy = cr.wyrm;
  if (!wy.shown) return;
  const vents = ship.layout.vents || [], open = state.ventOpen || []; // an open steam vent beside a segment melts it (the crew's third answer to the ice, after hammer and flame)
  vents.forEach((v, k) => {
    const pl = open[k] && ship.layout.platforms[v.d];
    if (!pl || cr.mode !== 'idle') return;
    const wx = toWorldX(ship, v.x), wy2 = toWorldY(ship, pl.y - 40);
    for (const q of icedSegs(cr)) {
      if (segDist(q.s, wx, wy2) > I.VENT_REACH) continue;
      q.p.ice[q.i] = Math.max(0, q.p.ice[q.i] - I.VENT_MELT * dt);
      q.p.iceAge[q.i] = 0;
      cr.stats.vented += dt;
    }
  });
  for (const p of icedParts(cr)) {
    if (p.iceFlash > 0) p.iceFlash = Math.max(0, p.iceFlash - dt);
    if (!p.ice) continue;
    for (let i = 0; i < p.ice.length; i++) {
      p.iceAge[i] += dt;
      if (p.iceAge[i] > I.REGROW_AFTER && p.ice[i] < p.iceMax[i]) p.ice[i] = Math.min(p.iceMax[i], p.ice[i] + I.REGROW * dt);
    }
  }
}
const bounceAt = (state, cr, p, seg) => {
  const wy = cr.wyrm, s = p.segs[clamp(seg | 0, 0, p.segs.length - 1)];
  cr.stats.bounces += 1;
  if (!s || cr.age - wy.bounceAt < WD().ICE.BOUNCE_EVERY) return;
  wy.bounceAt = cr.age;
  const m = segMid(s);
  pop(state, m.x, m.y - s.r - 60, 'PING!', '#bfe6ff', 0.9);
  cr.hooks.puff(m.x, m.y, '#e6f4ff', 3);
  state.sfxQ.push(['clang']);
};
// A blow of `dmg` (src: 'shell' 'bomb' 'flame' 'coil' 'mine' 'cargo' 'sword' ...) on segment `seg` of part p. Returns the damage that gets through: an iced segment bounces shells (0), a bomb or mine cracks the ice,
// flame melts it; a bare segment, the open maw and the belly take it all. (creatureSystem.js hurtCreature)
export function wyrmArmour(state, cr, p, seg, dmg, src) {
  const I = WD().ICE;
  if (p.kind === 'mouth') { // the shut maw is frost-lipped: only an open one can be hurt
    if (p.open) return dmg;
    bounceAt(state, cr, p, 0);
    return 0;
  }
  if (!p.ice) return dmg;
  const i = clamp(seg | 0, 0, p.ice.length - 1);
  if (!(p.ice[i] > 0)) return src === 'shell' || src === 'mortar' ? dmg * I.BARE_MUL : dmg; // (a shell through the cracked scales goes deep)
  p.iceAge[i] = 0;
  p.iceFlash = 0.15;
  if (src === 'flame') {
    p.ice[i] = Math.max(0, p.ice[i] - dmg * I.FLAME_MUL);
    cr.stats.melted += dmg * I.FLAME_MUL;
    if (p.ice[i] <= 0) { const m = segMid(p.segs[i]); cr.hooks.puff(m.x, m.y, '#ffffff', 6); pop(state, m.x, m.y - 160, 'MELTED!', '#ffb347', 1.1); }
    return 0;
  }
  if (src === 'bomb' || src === 'mine') { // a blast cracks the frost but does not hurt through it
    p.ice[i] = Math.max(0, p.ice[i] - I.BOMB_CHIP * p.iceMax[i]);
    return 0;
  }
  p.ice[i] = Math.max(0, p.ice[i] - I.SHELL_CHIP); // (it bounces, but a hundred shells wear a hole in the frost)
  if (p.ice[i] <= 0) { const m = segMid(p.segs[i]); pop(state, m.x, m.y - 160, 'ICE CRACKED!', '#bfe6ff', 1.2); }
  bounceAt(state, cr, p, i);
  return 0;
}

// ---- the crew's side: CHIP THE ICE (a hammer, hold Action beside a segment, or three ATTACK blows) ----
const chipJob = (p, i) => {
  const jobs = (p.chip ||= []);
  if (!jobs[i]) { jobs[i] = { name: 'chip', prog: 0, worked: false, live: true, seg: i, d: 0, x: 0, tool: 'hammer' }; Object.defineProperty(jobs[i], 'part', { value: p, enumerable: false }); } // (the part is not data: the job record stays plain)
  return jobs[i];
};
function* icedSegs(cr) {
  for (const p of icedParts(cr)) for (let i = 0; i < p.segs.length; i++) if (p.ice && p.ice[i] > 0) yield { p, i, s: p.segs[i] };
}
// The nearest iced segment within ICE.REACH of a crewman standing on a deck.
export function chipTarget(state, ship, pl) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'wyrm' || cr.mode !== 'idle' || cr.dying || pl.d == null) return null;
  const deck = ship.layout.platforms[pl.d];
  if (!deck) return null;
  const wx = toWorldX(ship, pl.x), wy = toWorldY(ship, deck.y - 40), R = WD().ICE.REACH;
  let best = null, bd = R;
  const on = cr.wyrm.chipOn || (cr.wyrm.chipOn = {}), keep = on[pl.id]; // (the segment he is working stays his target while it is in reach, however the coil sways: the hold must not jump from one to the next)
  if (keep && keep.part.ice && keep.part.ice[keep.seg] > 0 && keep.part.segs[keep.seg] && segDist(keep.part.segs[keep.seg], wx, wy) <= R * 1.15) best = { p: keep.part, i: keep.seg };
  else for (const q of icedSegs(cr)) {
    const d = segDist(q.s, wx, wy);
    if (d <= bd) { bd = d; best = q; }
  }
  if (best) on[pl.id] = { part: best.p, seg: best.i };
  else delete on[pl.id];
  return best ? { part: best.p, seg: best.i, job: chipJob(best.p, best.i) } : null;
}
export function wyrmAction(state, ship, pl) {
  if (pl.carry !== 'hammer') return null;
  if ((ship.layout.racks || []).some((r) => r.d === pl.d && Math.abs(r.x - pl.x) < config.TOOLS.REACH)) return null; // (beside a rack the button takes a tool: a man with a hammer must be able to swap it for a sword)
  if ((state.icing || []).some((c) => c.d === pl.d && Math.abs(c.x - pl.x) < 80)) return null; // (and beside a crust of ice on a gun or the deck the button chips THAT: the frozen gun first)
  const t = chipTarget(state, ship, pl);
  return t ? { type: 'hack', obj: t.job, hold: true, time: WD().ICE.CHIP_TIME, label: 'CHIP THE ICE!' } : null;
}
export function wyrmBlow(state, ship, pl) {
  if (pl.carry !== 'hammer') return false;
  const t = chipTarget(state, ship, pl), cr = state.creature;
  if (!t) return false;
  t.job.prog += 1 / WD().ICE.BLOWS;
  t.job.worked = true;
  pl.atkCd = config.TOOLS.SWORD_COOLDOWN;
  pl.swingT = performance.now();
  const m = segMid(t.part.segs[t.seg]);
  cr.hooks.puff(m.x, m.y, '#e6f4ff', 3);
  pop(state, m.x, m.y - 100, 'chip', '#ffffff', 0.7);
  state.sfxQ.push(['hit']);
  if (t.job.prog >= 1) chipDone(state, cr, pl, t.job);
  return true;
}
// The hold (or the blows) finished: that segment is bare. (shipSim.js: act.type 'hack' -> creatures.hacked)
export function wyrmHacked(state, pl, job) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'wyrm' || !job || job.name !== 'chip') return false;
  chipDone(state, cr, pl, job);
  return true;
}
function chipDone(state, cr, pl, job) {
  const p = job.part, i = job.seg;
  job.prog = 0;
  if (!p.ice || !(p.ice[i] > 0)) return;
  p.ice[i] = 0;
  p.iceAge[i] = 0;
  for (const k of [i - 1, i + 1]) if (p.ice[k] > 0) { p.ice[k] = Math.max(0, p.ice[k] - WD().ICE.SPREAD * p.iceMax[k]); p.iceAge[k] = 0; } // (the frost cracks along the body)
  cr.stats.chips += 1;
  const m = segMid(p.segs[i]);
  if (WD().ICE.CHIP_DMG > 0 && cr.mode === 'idle') cr.hooks.hurt({ part: p, seg: i }, WD().ICE.CHIP_DMG, { who: pl && pl.id, src: 'hammer' }); // (the hammer that cracks the ice bites the scale beneath)
  cr.hooks.puff(m.x, m.y, '#e6f4ff', 10);
  pop(state, m.x, m.y - 160, 'ICE OFF!', '#7fe8ff', 1.4);
  state.sfxQ.push(['clang']);
  if (cr.hooks.phoneFx && pl) cr.hooks.phoneFx(pl, 'You chipped it bare! Shell that spot!', [30, 40, 30]);
  if (state.moment && pl && !cr.wyrm.chipSeen[pl.id]) { cr.wyrm.chipSeen[pl.id] = true; state.moment('creature-chip', { who: [pl], where: null, data: { creature: cr.name } }); } // (the Ship's Book: the first chip of each hammer)
}
// Every chip job object (shipSim.js drains their progress like the other jobs).
export function wyrmChipObjects(cr) {
  const out = [];
  for (const p of icedParts(cr)) for (const j of p.chip || []) if (j) out.push(j);
  return out;
}
const jobCache = new WeakMap(); // (the chip spots worked out for this step: not part of the creature's data)
// The chip spots on a ship's decks as job records for the phones' arrows and the bots: { kind: 'hack', obj: job, d, x, tool: 'hammer', label }. The segment's middle in ship coordinates, the nearest deck that can reach it.
export function wyrmChipJobs(state, ship) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'wyrm' || cr.mode !== 'idle' || cr.dying) return [];
  const cache = jobCache.get(cr);
  if (cache && cache.at === cr.age && cache.ship === ship) return cache.list;
  const I = WD().ICE, L = ship.layout, list = [];
  for (const q of icedSegs(cr)) {
    const m = segMid(q.s), sx = toShipX(ship, m.x), sy = toShipY(ship, m.y);
    let best = null;
    L.platforms.forEach((pl, d) => {
      if (pl.x1 - pl.x0 < config.CREATURES.GRIP.MIN_DECK) return;
      const x = clamp(sx, pl.x0 + 30, pl.x1 - 30), dist = Math.hypot(x - sx, pl.y - 40 - sy) - q.s.r;
      if (!best || dist < best.dist) best = { d, x, dist };
    });
    if (!best || best.dist > I.REACH * 0.85) continue;
    const job = chipJob(q.p, q.i);
    job.d = best.d;
    job.x = best.x;
    job.live = true;
    list.push({ kind: 'hack', obj: job, d: best.d, x: best.x, tool: 'hammer', label: 'CHIP THE ICE!', dist: best.dist });
  }
  list.sort((a, b) => a.dist - b.dist);
  list.length = Math.min(list.length, I.JOBS);
  jobCache.set(cr, { at: cr.age, ship, list });
  return list;
}
// Should the hack arrow wait? (creatureGrip.js gripJobs) Yes until the last HACK_AT s of the coil: chip and shoot first.
export const wyrmHoldBack = (cr, g) => g.left > WD().COIL.HACK_AT;

// ---- the ways it ends (creatureSystem.js hurtCreature) ----
const shellShare = (cr) => ((cr.stats.by.shell || 0) + (cr.stats.by.mortar || 0)) / Math.max(1, cr.stats.dmg);
export function wyrmWays(cr, p, src) {
  const ways = [];
  if (cr.fed >= WD().MOUTH.FED) ways.push('mouth');
  if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
  if (cr.hp <= 0) { if (shellShare(cr) >= 0.5) ways.push('shell'); ways.push('hp'); }
  return ways;
}
export function wyrmDied(state, cr) {
  const wy = cr.wyrm;
  wy.mode = 'dying';
  wy.sub = null;
  wy.breath = null;
  wy.gape = null;
  wy.crack = null;
  wy.headUp = false;
  wy.tilt = 0;
  cr.mouthWin = null;
  setRest(cr, WD().SUN.STATION_DX * 0.4, 1500);
}

// ---- the head's pose: the limb's idle goal is its rest vector from the root (px, forward = toward the ship), changed only on keys ----
function setRest(cr, fwd, down) {
  const limb = limbOf(cr);
  if (limb && limb.ctl) limb.ctl.rest = [fwd, down];
}
function setRestWorld(cr, tx, ty) { // the head toward a world point (never beyond 0.85 of the body's reach from its root)
  const limb = limbOf(cr), root = { x: cr.x + limb.at[0] * cr.f, y: cr.y + limb.at[1] };
  let dx = tx - root.x, dy = ty - root.y;
  const d = Math.hypot(dx, dy), max = limb.reach * 0.85;
  if (d > max) { dx *= max / d; dy *= max / d; }
  setRest(cr, dx * cr.f, dy);
  return { x: root.x + dx, y: root.y + dy };
}
const rootOf = (cr) => { const limb = limbOf(cr); return { x: cr.x + limb.at[0] * cr.f, y: cr.y + limb.at[1] }; };

// ---- the phases ----
function enterPhase(state, cr, ph) {
  const W = WD(), CY = W.CYCLE, d = WYRM_PHASES[ph], h = cr.hooks, wy = cr.wyrm;
  cr.phase = ph;
  cr.ai.breather = CY.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (ph >= 2) wy.breathT = Math.max(wy.breathT, W.BREATH.FIRST);
  if (ph === 3) {
    const belly = partOf(cr, 'belly');
    if (belly) belly.hidden = false; // the underbelly is open to boarders
    wy.coilT = CY.P3_FIRST + CY.BREATHER;
    wy.gapeT = CY.P3_FIRST + CY.BREATHER + 6;
    freeze(cr, true); // (thinner armour from now on)
    for (const p of icedParts(cr)) if (p.ice) p.ice = p.ice.map((v, i) => Math.min(v, p.iceMax[i]));
    if (wy.shown) ensureSun(state, cr);
  }
  if (d.banner) {
    banner(state, d.banner, CY.BANNER);
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, config.CREATURES.PHASE.SHAKE);
  if (wy.shown) {
    pop(state, cr.x, cr.y - 2600, d.name, '#7fe8ff', 2.2);
    h.puff(cr.x, cr.y - 2200, '#e6f4ff', 16);
  }
}
function checkPhase(state, cr) {
  const P = WD().PHASE, frac = cr.hp / cr.maxHp;
  let want = 1;
  if (frac < P.TWO_HP) want = 2;
  if (frac < P.THREE_HP) want = 3;
  if (want > cr.phase) enterPhase(state, cr, want);
}
// The shaft of sun (phase 3): on the ship's side of the cliff it is out of. Its x is fixed once it breaks through.
function ensureSun(state, cr) {
  const wy = cr.wyrm, S = WD().SUN;
  if (wy.sun) return;
  wy.sun = { x: cr.base.x + cr.f * S.DIST, w: S.W };
  pop(state, wy.sun.x, cr.base.y - 3000, 'SUNLIGHT!', '#ffe27a', 2);
}

// ---- the eruption ----
function pickCliff(state, ship) {
  const K = WD().CLIFF, mid = shipMid(ship);
  let best = null, bs = Infinity;
  for (const c of cliffsOf(state)) {
    const dx = Math.abs(c.x - mid.x);
    if (dx < K.MIN_DX || dx > K.MAX_DX) continue;
    const s = Math.abs(dx - K.PREFER_DX) + ((c.x - mid.x) * (ship.pose.f || 1) < 0 ? K.BEHIND_PENALTY : 0); // (a cliff ahead of her bow is the better stage: her bow guns and harpoon bear on it)
    if (s < bs) { bs = s; best = c; }
  }
  return best;
}
function beginCrack(state, cr, ship, cliff) {
  const W = WD(), wy = cr.wyrm, h = cr.hooks, CY = W.CYCLE;
  wy.mode = 'crack';
  wy.t = 0;
  wy.cliff = cliff;
  wy.crack = { x: cliff.x, y: cliff.top, w: cliff.w, t: 0, T: CY.CRACK, seed: (cr.stats.erupts * 7 + 3) | 0 };
  banner(state, 'THE CLIFF IS CRACKING! THE RIME WYRM IS COMING!', CY.CRACK + 1.2);
  state.sfxQ.push(['impact']);
  for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, 'THE CLIFF IS CRACKING! The Rime Wyrm erupts in 2 seconds and COILS the ship!', [100, 50, 100, 50, 200]);
  h.puff(cliff.x, cliff.top - 100, '#e6f4ff', 8);
}
function erupt(state, cr, ship) {
  const W = WD(), wy = cr.wyrm, h = cr.hooks, CY = W.CYCLE, cl = wy.cliff, mid = shipMid(ship);
  cr.base.x = cl.x;
  cr.base.y = cl.top;
  cr.x = cl.x;
  cr.y = cl.top;
  cr.f = mid.x >= cl.x ? 1 : -1;
  cr.side = -cr.f; // (the way from her to it, as for the Kraken)
  wy.side = cr.side;
  wy.crack = null;
  wy.mode = 'out';
  wy.sub = 'rise';
  wy.t = 0;
  wy.shown = true;
  wy.dive = CY.RISE_DEEP;
  wy.headUp = false;
  wy.tilt = 0;
  wy.lure = null;
  wy.haul = 0;
  wy.breath = null;
  wy.breathT = 1e9;
  cr.mode = 'idle';
  cr.stats.erupts += 1;
  const limb = limbOf(cr);
  limb.hp = limb.maxHp;
  limb.gripCd = 0;
  freeze(cr);
  setRest(cr, W.SUN.STATION_DX, W.SUN.STATION_DY);
  snapPose(cr);
  if (cr.phase >= 3) { ensureSun(state, cr); partOf(cr, 'belly').hidden = false; }
  state.sfxQ.push(['roar']);
  state.sfxQ.push(['impact']);
  state.ship.shake = Math.max(state.ship.shake || 0, 1.3);
  pop(state, cl.x, cl.top - 2600, 'ERUPTS!', '#7fe8ff', 1.8);
  for (let k = 0; k < 5; k++) h.puff(cl.x + (h.rng() - 0.5) * 1400, cl.top - 150 - h.rng() * 700, k % 2 ? '#e6f4ff' : '#c9d8e6', 14);
}

// ---- the main step ----
export function stepWyrm(state, cr, ship, dt) {
  const W = WD(), CY = W.CYCLE, wy = cr.wyrm, mid = shipMid(ship);
  wy.age += dt;
  wy.t += dt;
  if (cr.ai.breather > 0) cr.ai.breather -= dt;
  if (cr.dying) {
    tickGrips(state, cr, dt);
    return;
  }
  checkPhase(state, cr);
  tickGrips(state, cr, dt);
  stepIce(state, cr, ship, dt);
  if (wy.mode === 'buried') {
    cr.mode = 'surfacing';
    wy.dive = CY.RISE_DEEP;
    if (cr.ai.breather > 0 || !canAttack(state)) return;
    if ((wy.nextT -= dt) > 0) return;
    const c = pickCliff(state, ship);
    if (c) beginCrack(state, cr, ship, c);
    else wy.nextT = 0; // (no cliff within her reach: the cracking waits for her)
    return;
  }
  if (wy.mode === 'crack') {
    cr.mode = 'surfacing';
    wy.crack.t += dt;
    if (Math.floor(wy.crack.t * 4) !== Math.floor((wy.crack.t - dt) * 4)) { state.sfxQ.push(['impact']); state.ship.shake = Math.max(state.ship.shake || 0, 0.25); }
    if (wy.crack.t >= CY.CRACK) erupt(state, cr, ship);
    return;
  }
  // ---- out ----
  if (wy.sub === 'rise') {
    wy.dive = CY.RISE_DEEP * (1 - smooth(Math.floor((wy.t / CY.RISE) * 4) / 4)); // (it comes up in four steps)
    if (wy.t >= CY.RISE) { wy.dive = 0; wy.sub = 'strike'; wy.t = 0; }
    return;
  }
  wy.dive = 0;
  stepBreath(state, cr, ship, dt);
  if (cr.phase >= 3 && wy.shown) stepSun(state, cr, dt);
  if (wy.sub === 'strike') {
    if (!canAttack(state)) { wy.sub = cr.phase >= 3 ? 'idle' : 'retreat'; wy.t = 0; return; }
    const g = startGrip(state, cr, ship);
    if (g) {
      wy.sub = 'coil';
      wy.t = 0;
      cr.stats.coils += 1;
      wy.breathT = W.BREATH.FIRST; // (the first breath comes FIRST s after it has her)
    } else {
      wy.sub = 'miss';
      wy.t = 0;
      cr.stats.misses += 1;
      const tip = { x: mid.x - cr.side * 600, y: mid.y - 200 };
      setRestWorld(cr, tip.x, tip.y); // (it lunges at where she is, short)
      pop(state, mid.x, mid.y - 700, 'MISSED!', '#ffffff', 1.4);
    }
    return;
  }
  if (wy.sub === 'coil') {
    if (wy.t > 0.5 && cr.grips.length === 0) { // the coil is over (hacked, shot free, ripped, or she is gone): gape
      if (state.ship.down || state.goingDown) endOut(state, cr);
      else startGape(state, cr, ship);
    }
    return;
  }
  if (wy.sub === 'miss') {
    if (wy.t >= CY.MISS_FOR) endOut(state, cr);
    return;
  }
  if (wy.sub === 'gape') {
    stepGape(state, cr, ship, dt);
    return;
  }
  if (wy.sub === 'retreat') {
    const u = clamp(wy.t / CY.RETREAT, 0, 1);
    wy.dive = CY.RISE_DEEP * smooth(Math.floor(u * 4) / 4);
    setRest(cr, -W.SUN.STATION_DX * 0.2, 900);
    if (u >= 1) bury(state, cr);
    return;
  }
  if (wy.sub === 'idle') { // phase 3 only: out for good, waiting for the next coil, gape or breath
    stationHead(state, cr, ship, dt);
    if (!canAttack(state) || cr.ai.breather > 0) return;
    if ((wy.coilT -= dt) <= 0) { wy.sub = 'strike'; wy.t = 0; wy.coilT = rand(cr, CY.P3_COIL_EVERY[0], CY.P3_COIL_EVERY[1]) * pauseOf(state); return; }
    if ((wy.gapeT -= dt) <= 0) { wy.gapeT = rand(cr, CY.P3_GAPE_EVERY[0], CY.P3_GAPE_EVERY[1]) * pauseOf(state); startGape(state, cr, ship); }
  }
}

// A burst of out-time is over: dive back in (phases 1, 2) or wait where it is (phase 3).
function endOut(state, cr) {
  const wy = cr.wyrm, mouth = mouthOf(cr);
  cr.mouthWin = null;
  if (mouth && mouth.open) setMouth(cr, mouth, false); // (the maw shuts whichever way the window ended)
  wy.headUp = false;
  wy.tilt = 0;
  wy.gape = null;
  wy.sub = cr.phase >= 3 ? 'idle' : 'retreat';
  wy.t = 0;
}
function bury(state, cr) {
  const CY = WD().CYCLE, wy = cr.wyrm, h = cr.hooks;
  wy.mode = 'buried';
  wy.sub = null;
  wy.shown = false;
  wy.dive = CY.RISE_DEEP;
  wy.breath = null;
  wy.nextT = rand(cr, CY.BURROW[0], CY.BURROW[1]) * (CY.BURROW_PHASE_MUL[Math.min(3, cr.phase)] || 1) * pauseOf(state);
  cr.mode = 'surfacing';
  h.puff(cr.base.x, cr.base.y - 100, '#e6f4ff', 10);
  state.sfxQ.push(['impact']);
  freeze(cr);
}
// Phase 3: the head rests STATION_DX px out of the cliff; a line on it hauls it (cr.tvx), and it drifts back when nothing holds it.
function stationHead(state, cr, ship, dt) {
  const S = WD().SUN, wy = cr.wyrm;
  if (cr.hooked && cr.phase >= 3) wy.haul += (cr.tvx || 0) * dt;
  else wy.haul -= clamp(wy.haul, -S.RETURN * dt, S.RETURN * dt);
  const root = rootOf(cr), maxF = limbOf(cr).reach * 0.85, f = cr.f;
  const fwd = clamp(S.STATION_DX + wy.haul * f, 300, maxF - 400);
  wy.haul = (fwd - S.STATION_DX) * f;
  setRestWorld(cr, root.x + f * fwd, root.y + S.STATION_DY);
  void ship;
}
function stepSun(state, cr, dt) {
  const wy = cr.wyrm, S = WD().SUN, sun = wy.sun, limb = limbOf(cr), head = partOf(cr, 'head');
  if (!sun || !limb || !head || !head.segs[0] || cr.dying || cr.grips.length) return;
  const hx = tipOf(limb) ? tipOf(limb).x : head.segs[0].x;
  if (Math.abs(hx - sun.x) > sun.w / 2) { wy.inSun = false; return; }
  wy.inSun = true;
  cr.stats.sunSecs += dt;
  for (const p of icedParts(cr)) if (p.ice) for (let i = 0; i < p.ice.length; i++) { const m = segMid(p.segs[i]); if (p.ice[i] > 0 && Math.abs(m.x - sun.x) <= sun.w / 2) p.ice[i] = Math.max(0, p.ice[i] - S.ICE_RATE * dt); }
  cr.hooks.hurtPool(S.POOL_RATE * (cr.hooked ? S.HOOKED_MUL : 1) * dt, 'sun');
  if (Math.floor(wy.age * 4) !== Math.floor((wy.age - dt) * 4)) { cr.hooks.puff(hx + (cr.hooks.rng() - 0.5) * 400, tipOf(limb).y - 200, '#ffffff', 6); pop(state, hx, tipOf(limb).y - 500, 'MELTING!', '#ffe27a', 0.9); }
}

// ---- the GAPE: the maw opens, bombs fall in ----
function startGape(state, cr, ship) {
  const W = WD(), M = W.MOUTH, wy = cr.wyrm, h = cr.hooks, limb = limbOf(cr), tip = tipOf(limb) || rootOf(cr);
  wy.sub = 'gape';
  wy.t = 0;
  wy.gape = { t: 0, left: M.FOR, open: false };
  wy.lure = { x: tip.x, y: shipMid(ship).y + M.BELOW };
  wy.headUp = true;
  cr.stats.windows += 1;
  banner(state, 'THE WYRM RAISES ITS HEAD - ITS MAW IS ABOUT TO GAPE!' + (ship.layout.bombBay ? ' READY THE BOMB BAY!' : ''), M.WIND + 1.4);
  state.sfxQ.push(['roar']);
  for (const p of Object.values(state.players)) {
    if (p.bot || p.fly || p.fall || !h.phoneFx || !ship.layout.kindOf || ship.layout.kindOf(p.lock) !== 'bombBay') continue;
    h.phoneFx(p, 'ITS MAW IS OPENING! Hold Action to DROP BOMBS into it!', [90, 40, 90]);
  }
}
function stepGape(state, cr, ship, dt) {
  const W = WD(), M = W.MOUTH, wy = cr.wyrm, w = wy.gape, mouth = mouthOf(cr);
  if (!w || !mouth || mouth.dead) { endOut(state, cr); return; }
  w.t += dt;
  // the head swims to put the maw under her bomb bay (it keeps to its own reach)
  const lx = lureX(state, cr, ship), step = M.LURE_SPEED * dt;
  wy.lure.x += clamp(lx - wy.lure.x, -step, step);
  wy.lure.y = shipMid(ship).y + M.BELOW;
  setRestWorld(cr, wy.lure.x, wy.lure.y);
  if (!w.open) {
    if (w.t >= M.WIND) {
      w.open = true;
      setMouth(cr, mouth, true);
      cr.mouthWin = { t: 0, left: M.FOR };
      state.sfxQ.push(['roar']);
      state.ship.shake = Math.max(state.ship.shake || 0, 0.6);
      banner(state, WYRM_MOUTH_TEXT + ' (' + Math.floor(cr.fed) + '/' + M.FED + ')', M.FOR);
      cr.hooks.puff(mouth.segs[0].x, mouth.segs[0].y, '#ffffff', 10);
    }
    return;
  }
  const mw = cr.mouthWin;
  if (!mw) { endOut(state, cr); return; }
  mw.t += dt;
  mw.left -= dt;
  if (mw.gulp > 0 && (mw.gulp -= dt) <= 0 && mw.left > M.REOPEN) setMouth(cr, mouth, true); // (it swallowed a bomb: shut a moment, then open again for what is left of the window)
  if (mw.left <= 0 && mouth.open && !(mw.gulp > 0)) setMouth(cr, mouth, false);
  if ((mw.left <= 0 && !mouth.open && !(mw.gulp > 0)) || mw.t > M.FOR + M.GULP * 3 + M.SLACK) endOut(state, cr);
}

// ---- the FROST BREATH: the throat glows, then the guns nearest the head freeze ----
function stepBreath(state, cr, ship, dt) {
  const W = WD(), B = W.BREATH, wy = cr.wyrm;
  const holding = wy.sub === 'coil' && cr.grips.some((g) => g.mode === 'hold');
  const free = wy.sub === 'idle' && cr.phase >= 3;
  if (!wy.breath) {
    if (!(holding || free) || !canAttack(state) || cr.ai.breather > 0) return;
    if ((wy.breathT -= dt) > 0) return;
    wy.breath = { sub: 'wind', t: 0 };
    wy.tilt = 0.7;
    banner(state, 'THE WYRM DRAWS A FROZEN BREATH! GUNNERS - IT WILL FREEZE THE GUNS!', B.WIND + 1.2);
    state.sfxQ.push(['roar']);
    warnCrew(state, cr, ship, (p) => !!ship.layout.kindOf && ship.layout.kindOf(p.lock) === 'gun', 'FROST BREATH COMING! Your gun will freeze - hammer it clear!', [150, 60, 150, 60, 150]);
    return;
  }
  const br = wy.breath;
  br.t += dt;
  if (br.sub === 'wind') {
    if (br.t >= B.WIND) {
      br.sub = 'blow';
      br.t = 0;
      const m = mouthOf(cr) && mouthOf(cr).segs[0] ? { x: mouthOf(cr).segs[0].x, y: mouthOf(cr).segs[0].y } : rootOf(cr), mid = shipMid(ship);
      br.x = m.x;
      br.y = m.y;
      br.ang = Math.atan2(mid.y - m.y, mid.x - m.x);
      br.len = B.LEN;
      freezeGuns(state, cr, ship, B.GUNS[Math.min(3, cr.phase)] || 1, m);
      cr.stats.breaths += 1;
      state.sfxQ.push(['whoosh']);
      state.ship.shake = Math.max(state.ship.shake || 0, 0.5);
    }
    return;
  }
  if (br.t >= B.TIME) {
    wy.breath = null;
    wy.tilt = 0;
    wy.breathT = B.EVERY[Math.min(3, cr.phase)] * pauseOf(state);
  }
}
// Freeze the n open guns nearest `from`: a crust at level LVL on each (the frost environment's own: jammed from JAM_AT, a hammer chips it off, flame thaws it).
function freezeGuns(state, cr, ship, n, from) {
  const B = WD().BREATH, spots = gunSpotsOf(ship.layout), P = ship.layout.platforms;
  if (!state.icing) return 0;
  const near = (s) => Math.hypot(toWorldX(ship, s.x) - from.x, toWorldY(ship, P[s.d].y) - from.y);
  spots.sort((a, b) => near(a) - near(b));
  let k = 0;
  for (const s of spots) {
    if (k >= n) break;
    let c = state.icing.find((q) => q.gun === s.gun);
    if (!c) { c = { area: 'gun', gun: s.gun, x: s.x, d: s.d, lvl: 0, prog: 0 }; state.icing.push(c); }
    c.lvl = Math.max(c.lvl, B.LVL);
    c.prog = 0;
    c.wyrm = true;
    k++;
    const wx = toWorldX(ship, s.x), wy = toWorldY(ship, P[s.d].y - 70);
    cr.hooks.puff(wx, wy, '#e6f4ff', 8);
    pop(state, wx, wy - 90, 'FROZEN!', '#7fe8ff', 1.6);
  }
  cr.stats.gunsIced += k;
  if (k === 0) state.say('info', 'ITS BREATH ONLY FROSTS THE RAILS - NO GUN IS OPEN TO IT.', null, 2.5);
  return k;
}
