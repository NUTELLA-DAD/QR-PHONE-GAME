// THE GIANT CREATURE IN THE REAL GAME WORLD (BOSSES.md 3.1, C.1). creature.js is the generic body (a puppet of rigid segments), creatures/kraken.js its data; this file puts one in the sky:
// it is a WORLD thing (state.creature, one record or null, in ships.js WORLD_SHARED), stepped once in stepWorld next to squadrons and specials, and every weapon asks it.
//   createCreatureSystem({ state, puff, credit }) -> { update, reset, restart, spawn }      per world (simulation.js)
//   hurtCreature(state, hit, dmg, opts) / creatureHit(state, x, y, r)                       the damage path every weapon ends in (a part, the segment hit, severing, the health pool, death)
//   creatureShell / creatureBomb / creatureBurn / creatureBeam / creatureCargo / creatureBlast / creatureTouch     one per weapon: shells, our bombs, flame, the coil, thrown loads, mines
//   creatureTargets(state, list) / creatureRadar(state) / creaturePoints(state)             aim.js targets, the phone radar, the camera's framing
// C.2 adds its attacks (creatureGrip.js: GRAB, SLAP, the HACK that frees the ship), boarding (creatureBoard.js) and the harpoon (creatureTow.js).
// C.1 ONLY gave it a placeholder life: it rises (SURFACE_TIME, untouchable), idles, its tentacles reach at the ship (no grip yet: that is C.2) and the beak opens on a timer; it dies (sinks) when
// the health pool is empty or all six tentacles are severed. The fight proper (phases, attacks, wins) is C.3. Spawned only by the dev flag (config.CREATURES.DEV_SPAWN) for now.
// Its random numbers are its own seeded stream (config.CREATURES.SEED), never Math.random, so a run without a creature is untouched. Positions go through pose.js, the ship is mainShip(state).
import { config } from '../../config.js';
import { createKraken } from './creatures/kraken.js';
import { stepBody, hitInfo, severPart, setMouth, nearestFreeLimb, reachPart, releasePart, exposeHeart, makeRng, segDist } from './creature.js';
import { thinkAttacks, hurtGrips, actionFor, blow, hacked, jobsOf, gripJobs } from './creatureGrip.js';
import { creatureSurfaces, boardCheck, boarderStep, decayJobs } from './creatureBoard.js';
import { stepHarpoons } from './creatureTow.js';
import { stepBreach, seaLevel } from './creatureBreach.js';
import { stepFight, inFunnel, forcedSkip } from './creatureFight.js';
import { crewMul } from './crewscale.js';
import { mainShip } from './ships.js';
import { powerRatio } from './shipPower.js';
import { toWorldX, toWorldY } from './pose.js';
import { envIdOf } from './environments.js';
import { floorBelow } from './maps.js';
import { pop } from './popups.js';

const CR = () => config.CREATURES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const segMid = (s) => ({ x: s.x + Math.cos(s.ang) * s.len * 0.5, y: s.y + Math.sin(s.ang) * s.len * 0.5 });

export const creatureAlive = (state) => !!state.creature && !state.creature.dying; // (the pacing director and the boss director ask this)
const vulnerable = (cr) => !!cr && (cr.mode === 'idle' || (cr.mode === 'breach' && !!cr.breach && cr.breach.exposed)); // (not while it rises, nor while it sinks, nor while it is under water; in a breach only while it hangs open in the air)
// The thing the searchlight lights and the spotter spots (aim.js reads .lit and .spotT of a target's obj): one small record on each part.
export const tgtOf = (p) => p.tgt || (p.tgt = { part: p, lit: 0, spotT: 0 });
const tentacles = (cr) => cr.parts.filter((p) => p.kind === 'tentacle');
const tentaclesGone = (cr) => tentacles(cr).every((p) => p.severed || p.dead);

// ---- damage ---------------------------------------------------------------------------------------------------------------------------------------------------
// The part under a round thing of radius r at world (x, y): { part, seg } or null (only while it can be hurt).
export function creatureHit(state, x, y, r = 0) {
  const cr = state.creature;
  return vulnerable(cr) ? hitInfo(cr, x, y, r) : null;
}
// Is some part of it touching a round thing at (x, y)? (a mine's trigger)
export const creatureTouch = (state, x, y, r = 0) => !!creatureHit(state, x, y, r);

// Hurt the part in `hit` ({ part, seg }) by dmg. opts: who (player id, for credit), src ('shell' 'bomb' 'flame' 'coil' 'mine' 'cargo', for the stats), x, y (where it burst, for the puffs).
// Returns { part, dmg, sever, killed } or null if nothing was hurt.
export function hurtCreature(state, hit, dmg, opts = {}) {
  const cr = state.creature;
  if (!vulnerable(cr) || !hit || hit.part.dead || !(dmg > 0)) return null;
  const H = CR().HURT, p = hit.part, t = p.tgt;
  if (t && t.lit > 0) dmg *= 1 + config.SEARCHLIGHT.LIT_DAMAGE; // (anything in a searchlight beam takes more)
  if (cr.breach && cr.breach.exposed) dmg *= CR().BREACH.BONUS; // (hanging in the air with its heart and beak open)
  p.hp = Math.max(0, p.hp - dmg);
  p.hit = CR().HIT_FLASH;
  cr.hp = Math.max(0, cr.hp - dmg * (H.POOL[p.kind] ?? 1));
  const st = cr.stats, src = opts.src || 'shell';
  st.dmg += dmg;
  st.by[src] = (st.by[src] || 0) + dmg;
  st.parts[p.id] = (st.parts[p.id] || 0) + dmg;
  if (src === 'bomb' && p.kind === 'mouth') st.chomps += 1;
  if (p.kind === 'mouth' && p.open && (src === 'bomb' || src === 'cargo')) { // fed: a bomb in the open beak is one, a crate or sandbag half of one (HURT.CARGO_MOUTH)
    cr.fed += src === 'bomb' ? 1 : H.CARGO_MOUTH;
    st.fed = cr.fed;
    if (cr.mouthWin && src === 'bomb') { // it gulps and the beak snaps shut a moment (creatureFight.js reopens it if the window has time left)
      cr.mouthWin.gulp = CR().MOUTH.GULP;
      setMouth(cr, p, false);
    }
  }
  if (p.kind === 'tentacle') hurtGrips(cr, p, dmg, src); // (a limb that is gripping the ship may let go)
  const out = { part: p, dmg, sever: false, killed: false };
  if (p.kind === 'tentacle' && p.hp <= 0 && !p.severed) out.sever = sever(state, cr, p, hit.seg, opts);
  if (!cr.dying) { // how it ends (cr.stats.win): every tentacle cut off, fed enough bombs, the heart struck, or the pool empty
    const ways = [];
    if (tentaclesGone(cr)) ways.push('sever');
    if (cr.fed >= CR().MOUTH.FED) ways.push('mouth');
    if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
    if (cr.hp <= 0) ways.push(src === 'rock' ? 'tow' : 'hp');
    const why = ways.find((w) => !CR().FORCE_WIN || CR().FORCE_WIN === w); // (the gate's dev flag FORCE_WIN lets only that one way end it, so a stray shell cannot decide a test of another)
    if (why) {
      die(state, cr, why, opts);
      out.killed = true;
    }
  }
  return out;
}
// Hurt the health pool itself (not a part): the tow onto rock (creatureFight.js stepRock).
function hurtPool(state, dmg, src, opts = {}) {
  const cr = state.creature;
  if (!cr || cr.dying || !(dmg > 0)) return;
  cr.hp = Math.max(0, cr.hp - dmg);
  cr.stats.dmg += dmg;
  cr.stats.by[src] = (cr.stats.by[src] || 0) + dmg;
  const why = src === 'rock' ? 'tow' : 'hp';
  if (cr.hp <= 0 && (!CR().FORCE_WIN || CR().FORCE_WIN === why)) die(state, cr, why, opts);
}

// Cut a tentacle at segment i: what is outboard of it falls away as a tumbling chunk.
function sever(state, cr, p, i, opts) {
  const gone = severPart(cr, p, i);
  if (!gone.length) return false;
  const K = CR().CHUNK, h = cr.hooks, o = gone[0];
  cr.stats.severed += 1;
  cr.chunks.push({ cx: o.x, cy: o.y, a: 0, vx: (h.rng() - 0.5) * K.KICK * 2, vy: -K.KICK * 0.8, w: (h.rng() - 0.5) * K.SPIN * 2, t: 0, part: { segs: gone.map((s) => ({ ...s, x: s.x - o.x, y: s.y - o.y })), side: p.side, lit: p.lit, hit: 0, severed: false } });
  while (cr.chunks.length > K.MAX) cr.chunks.shift();
  h.puff(o.x, o.y, '#7a3a5a', 14);
  h.puff(o.x, o.y, '#e8dcc0', 6);
  pop(state, o.x, o.y - 120, 'snap', '#ff9a2e', 1.5);
  state.sfxQ.push(['sever']);
  state.kills += 1;
  if (h.credit) h.credit({ owner: opts.who });
  return true;
}

// It dies: the limbs let go, the beak shuts and it starts to sink (update() removes it when it is gone).
function die(state, cr, why, opts) {
  const h = cr.hooks;
  cr.dying = true;
  cr.mode = 'dying';
  cr.breach = null;
  cr.mouthWin = null;
  cr.diedBy = why;
  cr.stats.win = why; // 'sever' | 'mouth' | 'tow' | 'board' | 'hp' (config.CREATURES.WIN_TEXT is the banner)
  cr.stats.winAt = cr.age;
  cr.sinkT = 0;
  cr.puppet.auto = false;
  if (state.course) state.bossDownLap = state.course.lap; // (the boss is down: a lair, like the Flagship, is done when it is)
  for (const p of cr.parts) {
    if (p.limb && !p.dead) releasePart(cr, p);
    if (p.kind === 'mouth') setMouth(cr, p, false);
  }
  state.kills += 5;
  if (h.credit) h.credit({ owner: opts.who });
  pop(state, cr.x, cr.y - 700, 'boss', '#ff5a1f', 2.2);
  for (let k = 0; k < 6; k++) h.puff(cr.x + (h.rng() - 0.5) * 1800, cr.y - 300 + (h.rng() - 0.5) * 900, '#7a3a5a', 18);
  state.ev.warn = CR().FINALE.BANNER;
  state.ev.warnText = (CR().WIN_TEXT[why] || 'SLAIN!') + ' ' + cr.name + ' SINKS BENEATH THE WAVES!'; // the final banner: how it ended, then what happens to it
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, 1.5);
  for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, CR().WIN_TEXT[why] || 'SLAIN!', [60, 40, 60, 40, 300]);
}

// ---- one function per weapon ---------------------------------------------------------------------------------------------------------------------------------
const shellMul = (s, obj) => (s.mul || 1) * (obj && obj.spotT > 0 ? 1 + config.SPOT.BONUS : 1);
// Crew shells (squadrons.js shellHits style: a shell that hits dies; the shooter is credited). Called once a step.
export function creatureShell(state) {
  if (!vulnerable(state.creature)) return;
  const H = CR().HURT;
  for (const s of state.shells) {
    if (s.life <= 0 || s.frag) continue; // (the fake shells of flame, mines and flak bursts only mean something to planes)
    const hit = creatureHit(state, s.x, s.y, H.TOUCH) || creatureHit(state, s.x - (s.vx || 0) / 120, s.y - (s.vy || 0) / 120, H.TOUCH); // (and halfway back along the step it flew)
    if (!hit) continue;
    s.life = 0;
    hurtCreature(state, hit, config.GUNS.DAMAGE * H.SHELL_MUL * shellMul(s, tgtOf(hit.part)), { who: s.owner, src: 'shell' });
    state.puffs.push({ x: s.x, y: s.y, vx: 0, vy: -30, life: 0.3, max: 0.3, c: '#ffcf40' });
  }
}

// Our bomb (course.js updateBombs): 'mouth' = it fell into the OPEN beak (MOUTH_BOMB), 'closed' = it passed through the shut beak (nothing), 'burst' = it hit another part (BOMB, and the
// parts round it a share), null = it did not touch it. The caller blows up the bomb on 'mouth' and 'burst'.
export function creatureBomb(state, b) {
  const H = CR().HURT;
  const cr = state.creature;
  if (vulnerable(cr) && inFunnel(cr, b.x, b.y)) { // the open beak gapes up through the mantle (config.CREATURES.MOUTH.FUNNEL_*): a bomb coming down that column falls into it
    hurtCreature(state, { part: cr.parts.find((p) => p.kind === 'mouth'), seg: 0 }, H.MOUTH_BOMB, { who: b.owner, src: 'bomb' });
    cr.hooks.puff(b.x, b.y, '#c43a45', 18);
    pop(state, b.x, b.y - 140, 'CHOMP!', '#ffd23f', 1.5);
    state.sfxQ.push(['chomp']);
    return 'mouth';
  }
  const hit = creatureHit(state, b.x, b.y, 20);
  if (!hit) return null;
  const p = hit.part;
  if (p.kind === 'mouth') {
    if (!p.open) return 'closed';
    hurtCreature(state, hit, H.MOUTH_BOMB, { who: b.owner, src: 'bomb' });
    state.creature.hooks.puff(b.x, b.y, '#c43a45', 18);
    pop(state, b.x, b.y - 140, 'CHOMP!', '#ffd23f', 1.5);
    state.sfxQ.push(['chomp']);
    return 'mouth';
  }
  hurtCreature(state, hit, H.BOMB, { who: b.owner, src: 'bomb' });
  creatureBlast(state, b.x, b.y, H.BOMB_RADIUS, H.BOMB * H.BOMB_SPLASH, { who: b.owner, src: 'bomb', skip: p });
  return 'burst';
}

// Everything with a segment within `radius` of (x, y) takes dmg (down to half at the edge); opts.skip = a part already hurt.
export function creatureBlast(state, x, y, radius, dmg, opts = {}) {
  const cr = state.creature;
  if (!vulnerable(cr)) return 0;
  let n = 0;
  for (const p of [...cr.parts]) {
    if (p.dead || p.hidden || p === opts.skip) continue;
    let best = null, bd = Infinity;
    for (let i = 0; i < p.segs.length; i++) {
      const d = Math.max(0, segDist(p.segs[i], x, y));
      if (d < bd) { bd = d; best = i; }
    }
    if (best === null || bd > radius) continue;
    if (hurtCreature(state, { part: p, seg: best }, dmg * (1 - 0.5 * (bd / radius)), opts)) n++;
  }
  return n;
}

// Flame (flame.js burn, once a tick): every part with a segment in the cone burns for dps x dt (the segment nearest the nozzle is the one that gets cut).
export function creatureBurn(state, inCone, origin, dt, who) {
  const cr = state.creature;
  if (!vulnerable(cr)) return;
  const dmg = CR().HURT.FLAME_DPS * dt;
  for (const p of [...cr.parts]) {
    if (p.dead || p.hidden) continue;
    let best = null, bd = Infinity;
    for (let i = 0; i < p.segs.length; i++) {
      const s = p.segs[i], m = segMid(s);
      if (!inCone(m.x, m.y, s.r)) continue;
      const d = Math.hypot(m.x - origin.x, m.y - origin.y);
      if (d < bd) { bd = d; best = i; }
    }
    if (best !== null) hurtCreature(state, { part: p, seg: best }, dmg, { who, src: 'flame' });
  }
}

// The Lightning Coil's bolt (coil.js fire): from (ox, oy) along the unit vector (dx, dy), range px long, width px each side; each part it crosses is hurt once, at the first segment along the bolt.
export function creatureBeam(state, ox, oy, dx, dy, range, width, dmg, who) {
  const cr = state.creature;
  if (!vulnerable(cr)) return 0;
  let n = 0;
  for (const p of [...cr.parts]) {
    if (p.dead || p.hidden) continue;
    let best = null, ba = Infinity;
    for (let i = 0; i < p.segs.length; i++) {
      const s = p.segs[i];
      for (const u of [0, 0.5, 1]) {
        const px = s.x + Math.cos(s.ang) * s.len * u, py = s.y + Math.sin(s.ang) * s.len * u;
        const rx = px - ox, ry = py - oy, along = rx * dx + ry * dy;
        if (along < 0 || along > range || Math.abs(rx * dy - ry * dx) > width + s.r) continue;
        if (along < ba) { ba = along; best = i; }
      }
    }
    if (best !== null && hurtCreature(state, { part: p, seg: best }, dmg, { who, src: 'coil' })) n++;
  }
  return n;
}

// A thrown crate or sandbag in flight (cargo.js stepThrown): true = it hit (the caller removes it). In the OPEN beak it counts as half a bomb.
export function creatureCargo(state, it) {
  const H = CR().HURT, cr = state.creature;
  if (vulnerable(cr) && inFunnel(cr, it.x, it.y)) { // (into the gaping beak from above: half a bomb)
    hurtCreature(state, { part: cr.parts.find((p) => p.kind === 'mouth'), seg: 0 }, H.MOUTH_BOMB * H.CARGO_MOUTH, { who: it.owner, src: 'cargo' });
    state.sfxQ.push(['chomp']);
    cr.hooks.puff(it.x, it.y, '#d9cbb0', 8);
    return true;
  }
  const hit = creatureHit(state, it.x, it.y, 24);
  if (!hit) return false;
  if (hit.part.kind === 'mouth') {
    if (!hit.part.open) return false; // (it falls on through a shut beak)
    hurtCreature(state, hit, H.MOUTH_BOMB * H.CARGO_MOUTH, { who: it.owner, src: 'cargo' });
    state.sfxQ.push(['chomp']);
  } else hurtCreature(state, hit, H.CARGO, { who: it.owner, src: 'cargo' });
  state.creature.hooks.puff(it.x, it.y, '#d9cbb0', 8);
  return true;
}

// ---- what the rest of the game sees -------------------------------------------------------------------------------------------------------------------------
const alivePart = (p) => !p.dead && !p.hidden && p.segs.length > 0;
// aim.js targets: one per living part (a tentacle: the segment nearest the ship's aim point). Weak points rank higher (lower number) when the beak is open or an eye is lit.
// (the dev flag FORCE_WIN hides the parts the bots, the escort and the coil must leave alone from this list: creatureFight.js forcedSkip; the harpoon gets the exhausted body from creatureTowTargets)
export function creatureTargets(state, list = [], only = null) {
  const cr = state.creature;
  if (!vulnerable(cr)) return list;
  const ship = mainShip(state), L = ship.layout;
  const ax = toWorldX(ship, L.aimPoint.x), ay = toWorldY(ship, L.aimPoint.y);
  const dark = (state.darkNow || 0) > CR().DARK_AT;
  for (const p of cr.parts) {
    if (!alivePart(p) || (only ? p.kind !== only : forcedSkip(cr, p, 'any'))) continue;
    const t = tgtOf(p);
    if (p.kind === 'tentacle') {
      if (p.severed) continue; // (a stump is not worth a shell)
      let bi = 0, bd = Infinity;
      p.segs.forEach((s, i) => { const m = segMid(s), d = Math.hypot(m.x - ax, m.y - ay); if (d < bd) { bd = d; bi = i; } });
      const at = () => segMid(p.segs[Math.min(bi, p.segs.length - 1)]);
      list.push({ kind: 'creaturePart', obj: t, part: p, seg: bi, r: Math.max(30, p.segs[bi].r), rank: 8.8, at });
    } else {
      const open = p.kind === 'mouth' && p.open, lit = p.kind === 'eye' && (!dark || t.lit > 0);
      const rank = p.kind === 'mouth' ? (open ? 4.6 : 9.6) : p.kind === 'eye' ? (lit ? 5.6 : 9.3) : p.kind === 'heart' ? 5 : 9.4;
      list.push({ kind: 'creaturePart', obj: t, part: p, seg: 0, r: p.segs[0].r, rank, at: () => segMid(p.segs[0]) });
    }
  }
  return list;
}
// What a harpoon gun may aim at: the exhausted creature's body (phase 3), whatever FORCE_WIN hides from the other guns.
export const creatureTowTargets = (state) => (state.creature && state.creature.phase >= 3 ? creatureTargets(state, [], 'mantle') : []);
// The phone radar's blips (spotter.js): the body, the beak and every tentacle.
export function creatureRadar(state) {
  const cr = state.creature;
  if (!vulnerable(cr)) return [];
  const out = [];
  for (const p of cr.parts) {
    if (!alivePart(p) || (p.kind !== 'tentacle' && p.kind !== 'mantle' && p.kind !== 'mouth')) continue;
    out.push({ obj: tgtOf(p), pos: () => segMid(p.segs[p.kind === 'tentacle' ? p.segs.length >> 1 : 0] || p.segs[0]) });
  }
  return out;
}
// The camera's framing (camera.js): { x, y, r } for the living parts, once it has risen.
export function creaturePoints(state) {
  const cr = state.creature;
  if (cr && cr.mode === 'breach' && cr.breach && !vulnerable(cr)) { // (a breach under way: keep its shadow on the water in view)
    const sea = seaLevel(state);
    return sea === null ? [] : [{ x: cr.breach.x, y: sea, r: 400 }];
  }
  if (!vulnerable(cr)) return [];
  const out = [];
  for (const p of cr.parts) {
    if (!alivePart(p)) continue;
    if (p.limb) { for (let i = 0; i < p.segs.length; i += 2) out.push({ x: p.segs[i].x, y: p.segs[i].y, r: p.segs[i].r }); const s = p.segs[p.segs.length - 1]; out.push({ x: s.x + Math.cos(s.ang) * s.len, y: s.y + Math.sin(s.ang) * s.len, r: s.r1 }); }
    else { const m = segMid(p.segs[0]); out.push({ x: m.x, y: m.y, r: p.segs[0].r }); }
  }
  return out;
}

// ---- the system -------------------------------------------------------------------------------------------------------------------------------------------------
export function createCreatureSystem({ state, puff, credit, phoneFx = () => {} }) {
  state.creature = null;
  const rng = makeRng(CR().SEED);
  let done = false; // this mission's creature has been spawned (one a mission)

  // Part health and the pool follow the crew, the difficulty and (C.3) how much fight her ship has: a small ship with three guns (the Sparrow) meets a creature with about half the health (POWER), the classic ship a whole one.
  const hpMul = () => {
    const P = CR().POWER, r = powerRatio(mainShip(state).layout);
    return crewMul(state, 'hp') * (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).gunHp * Math.max(P.FLOOR, 1 - P.SCALE * (1 - r));
  };
  const seaY = () => seaLevel(state);
  // Where the body's centre sits (world y): on the sea line in the Sunken Sea; elsewhere BELOW the ship, but kept GROUND_CLEAR above the first rock under the limbs' roots (shells die in rock).
  const stationY = (ship, mid, x) => {
    const S = CR().SPAWN;
    if (seaY() !== null) return seaY() - S.SEA_RISE;
    let y = mid.y + S.BELOW;
    const map = state.course && state.course.map;
    if (map) {
      let floor = Infinity;
      for (const dx of [-700, 0, 700]) floor = Math.min(floor, floorBelow(map, x + dx, mid.y));
      if (floor > mid.y + 200) y = Math.min(y, floor - S.GROUND_CLEAR);
    }
    return y;
  };
  const shipMid = (ship) => ({ x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) });

  const spawn = (kind = 'kraken') => {
    if (state.creature || kind !== 'kraken' || seaY() === null) return state.creature || null; // (the Kraken lives at the water line: with no sea level it does not come)
    const ship = mainShip(state), S = CR().SPAWN, K = CR().KRAKEN, H = CR().HURT;
    const mid = shipMid(ship), side = ship.pose.f || 1;
    const base = { x: mid.x + side * S.STANDOFF, y: stationY(ship, mid, mid.x + side * S.STANDOFF) };
    const cr = createKraken(base.x, base.y + S.DEEP, CR().SEED, { f: -side });
    const m = hpMul();
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (H.PART_HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(K.HP * m * H.PART_HP_MUL.pool));
    Object.assign(cr, { name: 'THE KRAKEN', mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { reachT: CR().BEHAVE.FIRST_REACH + S.SURFACE_TIME, wasOpen: false, splashed: false, breather: 0, diveT: CR().DIVE.FIRST } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 }); // (C.3, creatureFight.js: the phase 1..3, the bombs it has been fed, the beak's open window, how far phase 3 has raised it)
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, opts) => hurtCreature(state, hit, dmg, opts), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }) }, enumerable: false }); // (functions: not part of the data)
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true }); // (the limbs holding the ship, creatureGrip.js)
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false }); // (harpoon lines made fast to it, creatureTow.js)
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    if (CR().BOARD.HEART_EXPOSED) exposeHeart(cr);
    cr.puppet.auto = false; // (the beak's timer starts after it has risen)
    state.creature = cr;
    state.ev.warn = 4;
    state.ev.warnText = cr.name + ' RISES FROM THE DEEP!';
    state.sfxQ.push(['splash']);
    return cr;
  };

  // The placeholder life: threatening reaches at the ship, the beak opening on its timer (kraken.js's puppet), a roar each time it opens.
  const think = (cr, dt, ship) => {
    const B = CR().BEHAVE, ai = cr.ai, L = ship.layout;
    thinkAttacks(state, cr, ship, dt);
    if ((ai.reachT -= dt) > 0) return;
    ai.reachT = B.REACH_EVERY * (1 + (rng() * 2 - 1) * B.REACH_JITTER);
    const b = L.bounds;
    const tx = toWorldX(ship, b.x0 + (0.4 + 0.6 * rng()) * (b.x1 - b.x0)), ty = toWorldY(ship, b.y0 + (0.15 + 0.7 * rng()) * (b.y1 - b.y0));
    const limb = nearestFreeLimb(cr, tx, ty);
    if (!limb) return;
    const rx = cr.x + limb.at[0] * cr.f, ry = cr.y + limb.at[1];
    const d = Math.hypot(tx - rx, ty - ry), max = limb.reach * B.REACH_SHORT, k = d > max ? max / d : 1;
    reachPart(cr, limb, rx + (tx - rx) * k, ry + (ty - ry) * k);
  };

  const update = (dt) => {
    if (!state.creature && !done && CR().DEV_SPAWN && state.phase === 'flying' && !state.ship.down && seaY() !== null) {
      done = true;
      spawn(CR().DEV_SPAWN);
    }
    // A LAIR (voyage.js, course.js startMission: course.stop.lair): the Kraken rises where the zeppelin boss would, at BOSS_AT of the way to the lair's middle when the pacing allows, and anyway at LAIR.RUNUP.
    const c = state.course;
    if (!state.creature && !done && c && c.stop && c.stop.lair && !c.done && state.phase === 'flying' && !state.ship.down && seaY() !== null && c.progress > config.WAVES.BOSS_AT && ((!state.tempo || state.tempo.bossOk) || c.progress > CR().LAIR.RUNUP)) {
      done = true;
      spawn('kraken');
    }
    const cr = state.creature;
    if (!cr) return;
    const ship = mainShip(state), S = CR().SPAWN, mid = shipMid(ship);
    cr.age += dt;
    // Hold station beside the ship (it swims along with her), rising out of the deep first and sinking away when it is dead.
    const k = Math.min(1, S.FOLLOW * dt);
    if (cr.hooked) cr.base.x += (cr.tvx || 0) * dt; // (a harpoon line holds it: it no longer swims along with her, it is hauled, creatureTow.js)
    else if (cr.mouthWin && cr.mode === 'idle') cr.base.x += ship.pose.vx * dt; // (a window is open: creatureFight.js swims it under her bomb bay)
    else if (cr.mode !== 'breach') cr.base.x += (mid.x + cr.side * S.STANDOFF - cr.base.x) * k + ship.pose.vx * dt; // (a breach moves it itself, creatureBreach.js)
    cr.base.y += (stationY(ship, mid, cr.base.x) - cr.base.y) * k;
    let dive = 0;
    if (cr.mode === 'surfacing') {
      dive = S.DEEP * (1 - smooth(cr.age / S.SURFACE_TIME));
      if (!cr.ai.splashed && cr.age >= S.SURFACE_TIME * 0.35) { cr.ai.splashed = true; state.sfxQ.push(['splash']); puff(cr.base.x, cr.base.y + 650, '#ffffff', 16); }
      if (cr.age >= S.SURFACE_TIME) { cr.mode = 'idle'; state.sfxQ.push(['roar']); state.sfxQ.push(['splash']); }
    } else if (cr.mode === 'dying') {
      cr.sinkT += dt;
      dive = S.DEEP * smooth(cr.sinkT / S.SINK_TIME);
    }
    if (cr.mode === 'breach') stepBreach(state, cr, ship, dt);
    else if (cr.breachDy) cr.breachDy = Math.abs(cr.breachDy) < 1 ? 0 : cr.breachDy * Math.exp(-3 * dt); // (it died in mid-leap: it drops back to where it floats, and sinks from there)
    stepFight(state, cr, ship, dt); // (C.3: the phases, the beak's windows, the tow onto rock)
    cr.x = cr.base.x;
    cr.y = cr.base.y + dive + (cr.breachDy || 0) + cr.phaseDy;
    cr.vx = cr.vy = 0;
    if (cr.mode === 'dying') state.slow = cr.sinkT < CR().FINALE.SLOW_FOR ? CR().FINALE.SLOW : 1; // (the last blow plays in slow motion: main.js runs the sim at this speed)
    if (vulnerable(cr)) creatureShell(state);
    if (cr.mode === 'idle') think(cr, dt, ship);
    else if (cr.grips.length || cr.slap) thinkAttacks(state, cr, ship, dt); // (sinking: the limbs that held her let go and the records are cleared)
    stepHarpoons(state, cr, dt);
    decayJobs(cr, dt);
    const dark = (state.darkNow || 0) > CR().DARK_AT; // (in the dark each part is dim unless a searchlight has it)
    for (const p of cr.parts) p.lit = !dark || (!!p.tgt && p.tgt.lit > 0);
    stepBody(cr, dt);
    for (const c of cr.chunks) {
      c.t += dt;
      c.vy += CR().CHUNK.GRAVITY * dt;
      c.cx += c.vx * dt;
      c.cy += c.vy * dt;
      c.a += c.w * dt;
      c.part.lit = cr.parts[0].lit;
    }
    cr.chunks = cr.chunks.filter((c) => c.t < CR().CHUNK.LIFE);
    if (cr.mode === 'dying' && cr.sinkT >= S.SINK_TIME && !cr.chunks.length) {
      state.creature = null;
      state.slow = 1;
    }
  };

  // A new mission (or a new game): the creature is gone and the dev flag may spawn a new one.
  const reset = () => {
    for (const p of Object.values(state.players)) if (p.on) p.on = null; // (a boarder is a flyer again: the airborne system takes him from here)
    state.creature = null;
    if (state.slow !== undefined) state.slow = 1;
    done = false;
  };
  // What the rest of the game asks of it (the ship sims and the bots hold W.creatures); all of them answer at once when there is no creature.
  return {
    update, reset, restart: reset, spawn,
    actionFor: (ship, p) => (state.creature ? actionFor(state, ship, p) : null), // the Action button beside a grip: HACK THE TENTACLE!
    blow: (ship, p) => (state.creature ? blow(state, ship, p) : false), // ATTACK with a sword beside a grip: one blow of three
    hacked: (ship, p, job) => hacked(state, ship, p, job),
    jobsOf: (ship) => (state.creature ? jobsOf(state, ship) : []), // the hold-action objects of this ship's grips (shipSim.js drains their progress)
    gripJobs: (ship) => (state.creature ? gripJobs(state, ship) : []),
    boardCheck: (p) => { if (p.on) boardCheck(state, p); },
    boarderStep: (ship, p, dt, holdOk) => boarderStep(state, ship, p, dt, holdOk),
    surfaces: (ship) => creatureSurfaces(state, ship),
  };
}
