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
import { createDrake } from './creatures/drake.js';
import { createBird } from './creatures/thunderbird.js';
import { createTitan } from './creatures/titan.js';
import { createWyrm } from './creatures/wyrm.js';
import { createMother } from './creatures/mother.js';
import { createEel } from './creatures/eel.js';
import { stepBody, hitInfo, severPart, setMouth, nearestFreeLimb, reachPart, releasePart, exposeHeart, makeRng, segDist } from './creature.js';
import { thinkAttacks, hurtGrips, actionFor, blow, hacked, jobsOf, gripJobs, gripNear } from './creatureGrip.js';
import { setupDrake, stepDrake, drakeHit, drakeMul, drakeWays, drakeDied, poolWhy, perchAction, perchBlow, perchHacked, perchJobs, perchObjects } from './creatureDrake.js';
import { setupBird, stepBird, birdHit, birdMul, birdWays, birdDied, birdPerchAction, birdPerchBlow, birdPerchHacked, birdPerchJobs, birdPerchObjects } from './creatureBird.js';
import { setupTitan, stepTitan, titanHit, titanWays, titanDied } from './creatureTitan.js';
import { setupWyrm, stepWyrm, wyrmArmour, wyrmWays, wyrmDied, wyrmAction, wyrmBlow, wyrmHacked, wyrmChipObjects, wyrmChipJobs, wyrmHoldBack } from './creatureWyrm.js';
import { setupMother, stepMother, burning, motherSeen, motherArmour, motherHit, motherWays, motherDied, motherFlame } from './creatureMother.js';
import { setupEel, stepEel, eelArmour, eelHit, eelWays, eelDied, eelCuttable, eelGone, eelSegVel } from './creatureEel.js';
import { creatureSurfaces, boardCheck, boarderStep, decayJobs } from './creatureBoard.js';
import { stepHarpoons } from './creatureTow.js';
import { stepBreach, seaLevel } from './creatureBreach.js';
import { stepFight, inFunnel, forcedSkip, mouthCfg } from './creatureFight.js';
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
  if (cr && cr.kind === 'mother') return vulnerable(cr) ? hitInfo(cr, x, y, r, (p, i) => motherSeen(state, cr, p, i)) : null; // (C.6e: in the dark a shell finds only what a beam holds, or a tendril in the ship's glow)
  return vulnerable(cr) ? hitInfo(cr, x, y, r) : null;
}
// Is some part of it touching a round thing at (x, y)? (a mine's trigger)
export const creatureTouch = (state, x, y, r = 0) => !!creatureHit(state, x, y, r);

// Hurt the part in `hit` ({ part, seg }) by dmg. opts: who (player id, for credit), src ('shell' 'bomb' 'flame' 'coil' 'mine' 'cargo', for the stats), x, y (where it burst, for the puffs).
// Returns { part, dmg, sever, killed } or null if nothing was hurt.
export function hurtCreature(state, hit, dmg, opts = {}) {
  const cr = state.creature;
  if (!vulnerable(cr) || !hit || hit.part.dead || !(dmg > 0)) return null;
  const H = CR().HURT, p = hit.part, t = p.tgt, drake = cr.kind === 'drake', bird = cr.kind === 'thunderbird', titan = cr.kind === 'titan', wyrm = cr.kind === 'wyrm', mother = cr.kind === 'mother', eel = cr.kind === 'eel';
  if (eel) dmg = eelArmour(state, cr, p, hit.seg, dmg, opts.src || 'shell'); // (C.6f: a shell on a glowing joint of the tail-most section does JOINT.MUL x, the sections behind it are armoured)
  if (wyrm) { dmg = wyrmArmour(state, cr, p, hit.seg, dmg, opts.src || 'shell'); if (!(dmg > 0)) return null; } // (C.6d: the Rime Wyrm's ice armour: shells bounce, flame melts, a bare segment takes it all)
  if (mother) dmg = motherArmour(state, cr, p, hit.seg, dmg, opts.src || 'shell'); // (C.6e: flame is triple against a tendril, a plain shell only a quarter against her spongy cap)
  if (t && t.lit > 0) dmg *= 1 + config.SEARCHLIGHT.LIT_DAMAGE; // (anything in a searchlight beam takes more)
  if (cr.breach && cr.breach.exposed) dmg *= CR().BREACH.BONUS; // (hanging in the air with its heart and beak open)
  if (drake) dmg *= drakeMul(cr, p, opts.src || 'shell'); // (dazed after a swoop, coughing after a choke, flak on a wing)
  if (bird) dmg *= birdMul(state, cr, p, opts.src || 'shell'); // (dazed after a pass, the glowing gizzard, a drunk lightning bolt fired back by the coil)
  p.hp = Math.max(0, p.hp - dmg);
  if (eel && p.kind === 'tentacle' && !eelCuttable(cr, p)) p.hp = Math.max(1, p.hp); // (only the tail-most section left can be cut off)
  p.hit = CR().HIT_FLASH;
  cr.hp = Math.max(0, cr.hp - (mother && opts.src === 'hack' ? 0 : dmg) * ((drake ? CR().DRAKE.POOL : bird ? CR().THUNDERBIRD.POOL : titan ? CR().TITAN.POOL : wyrm ? CR().WYRM.POOL : mother ? CR().MOTHER.POOL : eel ? CR().EEL.POOL : H.POOL)[p.kind] ?? 1));
  const st = cr.stats, src = opts.src || 'shell';
  st.dmg += dmg;
  st.by[src] = (st.by[src] || 0) + dmg;
  st.parts[p.id] = (st.parts[p.id] || 0) + dmg;
  if (src === 'bomb' && p.kind === 'mouth') st.chomps += 1;
  if (p.kind === 'mouth' && p.open && (src === 'bomb' || src === 'cargo') && (!drake || cr.mouthWin)) { // fed: a bomb in the open beak is one, a crate or sandbag half of one (HURT.CARGO_MOUTH); the Drake's mouth only counts in its gaping windows
    cr.fed += src === 'bomb' ? 1 : H.CARGO_MOUTH;
    st.fed = cr.fed;
    if (cr.mouthWin && src === 'bomb') { // it gulps and the beak snaps shut a moment (creatureFight.js reopens it if the window has time left)
      cr.mouthWin.gulp = mouthCfg(cr).GULP;
      setMouth(cr, p, false);
    }
  }
  if (p.kind === 'tentacle') hurtGrips(cr, p, dmg, src); // (a limb that is gripping the ship may let go)
  const out = { part: p, dmg, sever: false, killed: false };
  if ((p.kind === 'tentacle' || p.kind === 'wing') && p.hp <= 0 && !p.severed && !wyrm) out.sever = sever(state, cr, p, p.kind === 'wing' ? Math.max(1, hit.seg) : eel ? 0 : hit.seg, opts); // (a torn wing leaves a stump of at least one segment)
  if (drake) drakeHit(state, cr, p, dmg, src, opts); // (chokes, driving it off the perch, a torn wing sends it crashing)
  if (bird) birdHit(state, cr, p, dmg, src, opts); // (zaps at the gizzard, mortar hits on the spire, driving it off the perch, a plucked wing)
  if (titan) titanHit(state, cr, p, dmg, src, opts); // (an arm shelled off)
  if (mother) motherHit(state, cr, p, dmg, src, opts, hit.seg); // (C.6e: a tendril set alight, an eye put out, a mortar shell on her cap)
  if (eel) eelHit(state, cr, p, dmg, src, opts); // (C.6f: a section cut off)
  if (!cr.dying) { // how it ends (cr.stats.win): every tentacle cut off, fed enough bombs, the heart struck, or the pool empty
    const ways = drake ? drakeWays(cr, p, src) : bird ? birdWays(cr, p, src) : titan ? titanWays(cr, p, src) : wyrm ? wyrmWays(cr, p, src) : mother ? motherWays(cr, p, src) : eel ? eelWays(cr, p, src) : [];
    if (!drake && !bird && !titan && !wyrm && !mother && !eel) {
      if (tentaclesGone(cr)) ways.push('sever');
      if (cr.fed >= CR().MOUTH.FED) ways.push('mouth');
      if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
      if (cr.hp <= 0) ways.push(src === 'rock' ? 'tow' : 'hp');
    }
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
  const why = cr.kind === 'eel' ? 'hp' : cr.kind === 'wyrm' ? (src === 'sun' ? 'tow' : 'hp') : cr.kind === 'drake' ? poolWhy(cr, src) : cr.kind !== 'thunderbird' && cr.kind !== 'titan' && src === 'rock' ? 'tow' : 'hp';
  if (cr.hp <= 0 && (!CR().FORCE_WIN || CR().FORCE_WIN === why)) die(state, cr, why, opts);
}

// Cut a tentacle at segment i: what is outboard of it falls away as a tumbling chunk.
function sever(state, cr, p, i, opts) {
  const gone = severPart(cr, p, i);
  if (!gone.length) return false;
  const K = CR().CHUNK, h = cr.hooks, o = gone[0];
  cr.stats.severed += 1;
  cr.chunks.push({ cx: o.x, cy: o.y, a: 0, vx: (h.rng() - 0.5) * K.KICK * 2, vy: -K.KICK * 0.8, w: (h.rng() - 0.5) * K.SPIN * 2, t: 0, part: { kind: p.kind, segs: gone.map((s) => ({ ...s, x: s.x - o.x, y: s.y - o.y })), side: p.side, lit: p.lit, hit: 0, severed: false, ...(cr.kind === 'thunderbird' ? { art: 'thunderbird' } : cr.kind === 'titan' ? { art: 'titan' } : cr.kind === 'eel' ? { art: 'eel' } : cr.kind === 'mother' ? { art: 'mother', burn: p.burn ? gone.map((_, k) => p.burn[i + k] || 0) : null } : {}) } });
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
  if (state.moment) state.moment('creature-win', { who: opts.who ? [opts.who] : [], where: null, data: { creature: cr.name, kind: cr.kind, way: why } }); // (the Ship's Book: which creature, how it ended, and the final blow's owner)
  pop(state, cr.x, cr.y - 700, 'boss', '#ff5a1f', 2.2);
  for (let k = 0; k < 6; k++) h.puff(cr.x + (h.rng() - 0.5) * 1800, cr.y - 300 + (h.rng() - 0.5) * 900, '#7a3a5a', 18);
  const drake = cr.kind === 'drake', bird = cr.kind === 'thunderbird', titan = cr.kind === 'titan', wyrm = cr.kind === 'wyrm', mother = cr.kind === 'mother', eel = cr.kind === 'eel', WT = eel ? CR().EEL.WIN_TEXT : drake ? CR().DRAKE.WIN_TEXT : bird ? CR().THUNDERBIRD.WIN_TEXT : titan ? CR().TITAN.WIN_TEXT : wyrm ? CR().WYRM.WIN_TEXT : mother ? CR().MOTHER.WIN_TEXT : CR().WIN_TEXT;
  state.say('objective', (WT[why] || 'SLAIN!') + ' ' + cr.name + (drake ? CR().DRAKE.DEATH_TEXT : bird ? CR().THUNDERBIRD.DEATH_TEXT : titan ? CR().TITAN.DEATH_TEXT : wyrm ? CR().WYRM.DEATH_TEXT : mother ? CR().MOTHER.DEATH_TEXT : eel ? CR().EEL.DEATH_TEXT : ' SINKS BENEATH THE WAVES!'), eel ? 8 : null, CR().FINALE.BANNER); // the final banner: how it ended, then what happens to it
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, 1.5);
  for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, WT[why] || 'SLAIN!', [60, 40, 60, 40, 300]);
  if (drake) drakeDied(state, cr); // (no more fire, no more weight on her bag)
  if (bird) birdDied(state, cr); // (no more weight on her bag, no more bolts called)
  if (titan) titanDied(state, cr); // (the boulders are gone; ground.js drops whoever stands on its island)
  if (wyrm) wyrmDied(state, cr); // (no more breath, no more coil)
  if (mother) motherDied(state, cr); // (the spore clouds thin away; no more wing beats)
  if (eel) eelDied(state, cr, opts); // (C.6f: no more lure or ring; at the Flagship's stop she FLEES)
}

// ---- one function per weapon ---------------------------------------------------------------------------------------------------------------------------------
const shellMul = (s, obj) => (s.mul || 1) * (obj && obj.spotT > 0 ? 1 + config.SPOT.BONUS : 1);
// Crew shells (squadrons.js shellHits style: a shell that hits dies; the shooter is credited). Called once a step.
export function creatureShell(state) {
  if (!vulnerable(state.creature)) return;
  const H = CR().HURT;
  for (const s of state.shells) {
    if (s.life <= 0 || s.frag || (s.flak && (state.creature.kind === 'drake' || state.creature.kind === 'thunderbird'))) continue; // (the fake shells of flame, mines and flak bursts only mean something to planes; a flak shell bursts near the Drake's wings instead, creatureDrake.js drakeFlak)
    const hit = creatureHit(state, s.x, s.y, H.TOUCH) || creatureHit(state, s.x - (s.vx || 0) / 120, s.y - (s.vy || 0) / 120, H.TOUCH); // (and halfway back along the step it flew)
    if (!hit) continue;
    s.life = 0;
    hurtCreature(state, hit, config.GUNS.DAMAGE * H.SHELL_MUL * shellMul(s, tgtOf(hit.part)), { who: s.owner, src: s.kind === 'mortar' && (state.creature.kind === 'thunderbird' || state.creature.kind === 'mother') ? 'mortar' : 'shell' }); // (a mortar shell on the resting Thunderbird, or on the Mother's cap, is its own kind of blow)
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
  if (cr.kind === 'mother') motherFlame(state, cr, inCone, dt, who); // (C.6e: flame in a spore cloud burns it off, and lights the decks under it)
  for (const p of [...cr.parts]) {
    if (p.dead || p.hidden) continue;
    let best = null, bd = Infinity;
    for (let i = 0; i < p.segs.length; i++) {
      const s = p.segs[i], m = segMid(s);
      if (!inCone(m.x, m.y, s.r)) continue;
      if (cr.kind === 'mother' && !motherSeen(state, cr, p, i)) continue; // (in the dark flame finds only what a beam holds, or a tendril in the ship's glow)
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
export function creatureTargets(state, list = [], only = null, gunType = 'any') {
  const cr = state.creature;
  if (!vulnerable(cr)) return list;
  const ship = mainShip(state), L = ship.layout;
  const ax = toWorldX(ship, L.aimPoint.x), ay = toWorldY(ship, L.aimPoint.y);
  const dark = (state.darkNow || 0) > CR().DARK_AT;
  if (cr.kind === 'titan' && !only) { // C.6c: a boulder in the air is the first thing to shoot at (36 hp: a few shells shatter it); it flies a known arc
    const TB = CR().TITAN.BOULDER;
    for (const b of cr.titan.boulders) {
      if (b.mode !== 'fly') continue;
      const bt = b.tgt || (b.tgt = { lit: 0, spotT: 0 });
      list.push({ kind: 'boulder', obj: bt, b, r: b.r, rank: 2.6, at: (tt) => ({ x: b.x + b.vx * (tt || 0), y: b.y + b.vy * (tt || 0) + 0.5 * TB.GRAVITY * (tt || 0) * (tt || 0) }) });
    }
  }
  const bird = cr.kind === 'thunderbird', titan = cr.kind === 'titan', wyrm = cr.kind === 'wyrm', drake = cr.kind === 'drake' || bird, vs = ship.pose.vx || 0; // (drake: a flier -- the Drake or the Thunderbird; the Thunderbird has its own ranks below)
  // (the Drake flies fast: a shot leads it by where it will be, relative to the ship that fires)
  const led = (pt, tt) => ({ x: pt.x + ((cr.mvx || 0) - vs) * (tt || 0), y: pt.y + (cr.mvy || 0) * (tt || 0) });
  for (const p of cr.parts) {
    if (!alivePart(p) || (only ? p.kind !== only : forcedSkip(cr, p, gunType))) continue;
    const t = tgtOf(p);
    if (cr.kind === 'eel' && (p.kind === 'tentacle' || p.kind === 'neck')) { // C.6f: the glowing joints (the end segments) of the tail section that can be cut come first; the rest of the body is a poor mark. The body moves fast: a shot leads it
      if (p.severed) continue;
      const n = p.segs.length, cut = p.kind === 'tentacle' && eelCuttable(cr, p), led2 = (i) => (tt) => { const m = segMid(p.segs[Math.min(i, p.segs.length - 1)]), v = eelSegVel(cr, p, i); return { x: m.x + (v.x - vs) * (tt || 0), y: m.y + v.y * (tt || 0) }; };
      const add = cr.eel.finale ? CR().EEL.FINALE.RANK_ADD : 0; // (at the Flagship's stop the guns may be told to look at the castle first)
      if (cut) for (const i of [0, n - 1]) list.push({ kind: 'creaturePart', obj: t, part: p, seg: i, r: Math.max(40, p.segs[i].r), rank: 4.6 + add, at: led2(i) });
      else { let bi = 0, bd = Infinity; p.segs.forEach((s, i) => { const m = segMid(s), d = Math.hypot(m.x - ax, m.y - ay); if (d < bd) { bd = d; bi = i; } }); list.push({ kind: 'creaturePart', obj: t, part: p, seg: bi, r: Math.max(30, p.segs[bi].r), rank: (p.kind === 'neck' ? 7.6 : 8) + add, at: led2(bi) }); }
      continue;
    }
    if (cr.kind === 'mother') { // C.6e: every living bit is listed (the searchlight has to find it) but flagged dark until a beam holds it: aim.js lets no gun aim at a dark one
      let seg = 0, rank = p.kind === 'eye' ? 3 : p.kind === 'heart' ? 3.4 : 6;
      if (p.kind === 'tentacle') { // the seen segment nearest the aim point (else the nearest at all)
        if (p.severed) continue;
        let bd = Infinity;
        p.segs.forEach((s, i) => { const m = segMid(s), d = Math.hypot(m.x - ax, m.y - ay) + (motherSeen(state, cr, p, i) ? 0 : 1e5); if (d < bd) { bd = d; seg = i; } });
        rank = burning(p) ? 4 : p.ctl.mode !== 'idle' ? 4.4 : 6.8;
      }
      const n = p.segs.length, segsOf = p.kind === 'tentacle' && p.ctl.mode !== 'idle' ? [...new Set([Math.min(seg, n - 1), ...Array.from({ length: Math.min(n, 6) }, (_, k) => n - 1 - k)])] : [Math.min(seg, n - 1)]; // (a tendril that reaches or holds: its outer segments too - they lie along the hull in the coil - so the flamethrower at the deck end finds one)
      for (const i of segsOf) list.push({ kind: 'creaturePart', obj: t, part: p, seg: i, r: Math.max(30, p.segs[i].r), rank, dark: !motherSeen(state, cr, p, i), at: () => segMid(p.segs[Math.min(i, p.segs.length - 1)]) });
      continue;
    }
    if (p.kind === 'tentacle' || (drake && p.limb)) {
      if (p.severed) continue; // (a stump is not worth a shell)
      if (wyrm && p.ice) { // C.6d: the Rime Wyrm's body is armoured: a target for each of the nearest few BARE segments (a shell on ice only bounces), else the nearest iced one
        const dist = (i) => { const m = segMid(p.segs[i]); return Math.hypot(m.x - ax, m.y - ay); };
        const idx = p.segs.map((_, i) => i), bare = idx.filter((i) => !(p.ice[i] > 0)).sort((a, b) => dist(a) - dist(b)).slice(0, 5), pick = bare.length ? bare : [idx.sort((a, b) => dist(a) - dist(b))[0]];
        for (const i of pick) list.push({ kind: 'creaturePart', obj: t, part: p, seg: i, r: Math.max(30, p.segs[i].r), rank: bare.length ? 5.2 : 9.5, at: () => segMid(p.segs[Math.min(i, p.segs.length - 1)]) });
        continue;
      }
      let bi = 0, bd = Infinity;
      p.segs.forEach((s, i) => { const m = segMid(s), d = Math.hypot(m.x - ax, m.y - ay) + (wyrm && p.ice && p.ice[i] > 0 ? 1e5 : 0); if (d < bd) { bd = d; bi = i; } }); // (C.6d: the Wyrm's bare segments come first: a shell on ice only bounces)
      let rank = !drake ? (wyrm ? (p.ice && p.ice[bi] > 0 ? 9.5 : 5.2) : titan ? 6.6 : 8.8) : p.kind === 'wing' ? (!bird && cr.drake.mode === 'crawl' ? 9 : 6.4) : p.kind === 'neck' ? 8.4 : 9.1; // (wings first while it flies: tear one and it crashes; pluck both and the Thunderbird falls)
      if (bird && dark && !(t.lit > 0)) rank += 2; // (a dark sky: the parts a searchlight has come first)
      const at = drake ? (tt) => led(segMid(p.segs[Math.min(bi, p.segs.length - 1)]), tt) : () => segMid(p.segs[Math.min(bi, p.segs.length - 1)]);
      list.push({ kind: 'creaturePart', obj: t, part: p, seg: bi, r: Math.max(30, p.segs[bi].r), rank, at });
    } else {
      const open = p.kind === 'mouth' && p.open, lit = p.kind === 'eye' && (!dark || t.lit > 0);
      let rank = p.kind === 'mouth' ? (open ? (drake ? 3.6 : 4.6) : drake ? 9.7 : 9.6) : p.kind === 'eye' ? (lit ? 5.6 : 9.3) : p.kind === 'heart' ? (bird ? 3.4 : 5) : p.kind === 'head' ? (titan ? 8.2 : 7.2) : 9.4; // (the Thunderbird's gizzard is only a target while it glows; the Titan's arms are the better target than its head, 6.6 above)
      if (bird && p.kind !== 'heart' && dark && !(t.lit > 0)) rank += 2;
      if (wyrm && p.kind === 'head') rank = p.ice && p.ice[0] > 0 ? 9.6 : 5.6;
      if (cr.kind === 'eel' && cr.eel.finale) rank += CR().EEL.FINALE.RANK_ADD;
      list.push({ kind: 'creaturePart', obj: t, part: p, seg: 0, r: p.segs[0].r, rank, at: drake ? (tt) => led(segMid(p.segs[0]), tt) : cr.kind === 'eel' ? (tt) => { const m = segMid(p.segs[0]), v = eelSegVel(cr, p, 0); return { x: m.x + (v.x - vs) * (tt || 0), y: m.y + v.y * (tt || 0) }; } : () => segMid(p.segs[0]) });
    }
  }
  return list;
}
// What a harpoon gun may aim at: the exhausted creature's body (phase 3), whatever FORCE_WIN hides from the other guns.
export const creatureTowTargets = (state) => (state.creature && state.creature.kind !== 'eel' && state.creature.kind !== 'thunderbird' && state.creature.kind !== 'titan' && state.creature.kind !== 'mother' && (state.creature.kind === 'drake' ? state.creature.drake.mode === 'crawl' : state.creature.phase >= 3) ? creatureTargets(state, [], state.creature.kind === 'wyrm' ? 'head' : 'mantle') : []); // (the Drake: once it crawls; the Thunderbird is never towed)
// The phone radar's blips (spotter.js): the body, the beak and every tentacle.
export function creatureRadar(state) {
  const cr = state.creature;
  if (!vulnerable(cr)) return [];
  const out = [];
  for (const p of cr.parts) {
    if (!alivePart(p) || (p.kind !== 'tentacle' && p.kind !== 'mantle' && p.kind !== 'mouth' && p.kind !== 'wing')) continue;
    if (cr.kind === 'mother' && !motherSeen(state, cr, p, p.kind === 'tentacle' ? p.segs.length >> 1 : 0)) continue; // (the radar is no way around the dark: she must be lit)
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
  if (cr && cr.kind === 'wyrm' && cr.wyrm.crack) return [{ x: cr.wyrm.crack.x, y: cr.wyrm.crack.y + 500, r: 1800 }]; // (C.6d: the cliff that is cracking)
  if (!vulnerable(cr) && !(cr && cr.kind === 'titan' && cr.dying)) return []; // (the dying Titan stays in the picture: the finale is its crumbling)
  const out = [];
  for (const p of cr.parts) {
    if (!alivePart(p)) continue;
    if (p.limb) { for (let i = 0; i < p.segs.length; i += 2) out.push({ x: p.segs[i].x, y: p.segs[i].y, r: p.segs[i].r }); const s = p.segs[p.segs.length - 1]; out.push({ x: s.x + Math.cos(s.ang) * s.len, y: s.y + Math.sin(s.ang) * s.len, r: s.r1 }); }
    else { const m = segMid(p.segs[0]); out.push({ x: m.x, y: m.y, r: p.segs[0].r }); }
  }
  if (cr.kind === 'eel') { // (C.6f: the gold lure and the swallow's ring stay in the picture too)
    const lu = cr.eel.lure, rg = cr.eel.ring;
    if (lu && lu.live) out.push({ x: lu.x, y: lu.y, r: 500 });
    if (rg) out.push({ x: rg.x, y: rg.y, r: rg.r });
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

  // The Ember Forge has lava low in the map (state.env.lavaY): that is the Drake's sky.
  const lavaY = () => (state.env && Number.isFinite(state.env.lavaY) ? state.env.lavaY : null);
  const titanHome = () => envIdOf(state) === CR().TITAN.ENV && !!(state.course && state.course.map && state.course.map.creature === 'titan'); // (the Island Titan stands on the Titan lair's plain: maps.js buildTitanLairMap)
  const wyrmHome = () => envIdOf(state) === CR().WYRM.ENV && !!(state.course && state.course.map && state.course.map.creature === 'wyrm' && (state.course.map.cliffs || []).length); // (the Rime Wyrm lies under the ice cliffs of the Wyrm lair: maps.js buildWyrmLairMap)
  const motherHome = () => envIdOf(state) === CR().MOTHER.ENV && !!(state.course && state.course.map && state.course.map.creature === 'mother' && state.course.map.dome); // (the Mycelial Mother clings to the roof of the Mother lair's cavern: maps.js buildMotherLairMap)
  const eelHome = () => envIdOf(state) === CR().EEL.ENV || !!(state.course && state.course.ring && state.course.ring.moor); // (the Void Eel lives in the Aether, and joins the Flagship at the citadel wherever that is flown)
  const homeOk = (kind) => (kind === 'eel' ? eelHome() : kind === 'mother' ? motherHome() : kind === 'wyrm' ? wyrmHome() : kind === 'titan' ? titanHome() : kind === 'thunderbird' ? envIdOf(state) === CR().THUNDERBIRD.ENV : kind === 'drake' ? lavaY() !== null && envIdOf(state) === CR().DRAKE.ENV : seaY() !== null);
  // THE CINDER DRAKE (C.6a): it flies in from off screen, untouchable for SPAWN.ARRIVE s, then circles; creatureDrake.js is its brain.
  const spawnDrake = () => {
    if (state.creature || !homeOk('drake')) return state.creature || null;
    const ship = mainShip(state), D = CR().DRAKE;
    const mid = shipMid(ship), side = ship.pose.f || 1;
    const cr = createDrake(mid.x + side * D.SPAWN.FROM, mid.y - D.FLY.UP - 1200, CR().SEED, { f: -side });
    const m = hpMul();
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (D.HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(D.HP * m * D.HP_MUL.pool));
    Object.assign(cr, { name: D.NAME, mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base: { x: cr.x, y: cr.y }, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { breather: 0 } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 });
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, opts) => hurtCreature(state, hit, dmg, opts), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }), sever: (p, seg, opts = {}) => sever(state, cr, p, seg, opts), moreJobs: (ship) => perchJobs(state, ship) }, enumerable: false });
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true });
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false });
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    setupDrake(state, cr, ship);
    state.creature = cr;
    state.say('setpiece', cr.name + ' SWOOPS IN FROM THE SMOKE!', null, 4);
    state.sfxQ.push(['roar']);
    return cr;
  };

  // THE THUNDERBIRD (C.6b): the Storm Front's bird flies in out of the dark, untouchable for SPAWN.ARRIVE s, then circles; creatureBird.js is its brain.
  const spawnBird = () => {
    if (state.creature || !homeOk('thunderbird')) return state.creature || null;
    const ship = mainShip(state), D = CR().THUNDERBIRD;
    const mid = shipMid(ship), side = ship.pose.f || 1;
    const cr = createBird(mid.x + side * D.SPAWN.FROM, mid.y - D.FLY.UP - 1200, CR().SEED, { f: -side });
    const m = hpMul();
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (D.HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(D.HP * m * D.HP_MUL.pool));
    Object.assign(cr, { name: D.NAME, mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base: { x: cr.x, y: cr.y }, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { breather: 0 } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 });
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, opts) => hurtCreature(state, hit, dmg, opts), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }), sever: (p, seg, opts = {}) => sever(state, cr, p, seg, opts), moreJobs: (ship) => birdPerchJobs(state, ship) }, enumerable: false });
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true });
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false });
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    setupBird(state, cr, ship);
    state.creature = cr;
    state.say('setpiece', cr.name + ' SCREAMS OUT OF THE STORM!', null, 4);
    state.sfxQ.push(['screech']);
    return cr;
  };

  // THE ISLAND TITAN (C.6c): it strides in over the plain, untouchable for SPAWN.ARRIVE s, then stands ahead of the ship; creatureTitan.js is its brain.
  const spawnTitan = () => {
    if (state.creature || !homeOk('titan')) return state.creature || null;
    const ship = mainShip(state), D = CR().TITAN;
    const mid = shipMid(ship), side = ship.pose.f || 1;
    const cr = createTitan(mid.x + side * (D.STAND.OFFSET + D.SPAWN.FROM), state.course.map.floorY - D.BODY.FEET, CR().SEED, { f: -side });
    const m = hpMul();
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (D.HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(D.HP * m * D.HP_MUL.pool));
    Object.assign(cr, { name: D.NAME, mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base: { x: cr.x, y: cr.y }, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { breather: 0 } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 });
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, opts) => hurtCreature(state, hit, dmg, opts), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }), sever: (p, seg, opts = {}) => sever(state, cr, p, seg, opts) }, enumerable: false });
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true });
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false });
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    setupTitan(state, cr, ship);
    state.creature = cr;
    state.say('setpiece', cr.name + ' STRIDES OUT OF THE HAZE!', null, 4);
    state.sfxQ.push(['roar']);
    return cr;
  };

  // THE RIME WYRM (C.6d): it lies buried under the lair's ice cliffs, untouchable, until a cliff cracks; creatureWyrm.js is its brain.
  const spawnWyrm = () => {
    if (state.creature || !homeOk('wyrm')) return state.creature || null;
    const ship = mainShip(state), D = CR().WYRM, c0 = state.course.map.cliffs[0];
    const side = ship.pose.f || 1;
    const cr = createWyrm(c0.x, c0.top, CR().SEED, { f: -side });
    const m = hpMul();
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (D.HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(D.HP * m * D.HP_MUL.pool));
    Object.assign(cr, { name: D.NAME, mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base: { x: cr.x, y: cr.y }, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { breather: 0 } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 });
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, opts) => hurtCreature(state, hit, dmg, opts), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }), sever: (p, seg, opts = {}) => sever(state, cr, p, seg, opts), moreJobs: (sh) => wyrmChipJobs(state, sh), holdBack: (g) => wyrmHoldBack(cr, g) }, enumerable: false });
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true });
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false });
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    setupWyrm(state, cr, ship);
    state.creature = cr;
    state.say('setpiece', cr.name + ' STIRS UNDER THE ICE...', null, 4);
    state.sfxQ.push(['impact']);
    return cr;
  };

  // THE MYCELIAL MOTHER (C.6e): she clings to the roof of the lair's dark cavern, asleep and untouchable until the ship comes near; creatureMother.js is her brain.
  const spawnMother = () => {
    if (state.creature || !homeOk('mother')) return state.creature || null;
    const ship = mainShip(state), D = CR().MOTHER, dome = state.course.map.dome;
    const side = ship.pose.f || 1;
    const cr = createMother(dome.x, dome.roofY + D.CAP_DROP, CR().SEED, { f: 1 });
    const m = hpMul();
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (D.HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(D.HP * m * D.HP_MUL.pool));
    Object.assign(cr, { name: D.NAME, mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base: { x: cr.x, y: cr.y }, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { breather: 0 } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 });
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, opts) => hurtCreature(state, hit, dmg, opts), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }), sever: (p, seg, opts = {}) => sever(state, cr, p, seg, opts), hacked: (g, p) => { if (g.limb.dead || g.limb.severed) return; hurtCreature(state, { part: g.limb, seg: Math.max(1, Math.floor(g.limb.segs.length * 0.4)) }, g.limb.maxHp * D.GRAB.HACK_DMG, { who: p && p.id, src: 'hack' }); } }, enumerable: false });
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true });
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false });
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    setupMother(state, cr, ship);
    state.creature = cr;
    return cr;
  };

  // THE VOID EEL (C.6f): it swims in from far off, untouchable for ORBIT.ARRIVE s, then circles the ship; creatureEel.js is its brain. opts.finale: it comes with the Flagship (weaker, slower, fewer grips).
  const spawnEel = (opts = {}) => {
    if (state.creature || !homeOk('eel')) return state.creature || null;
    const ship = mainShip(state), D = CR().EEL, side = ship.pose.f || 1;
    const cr = createEel(0, 0, CR().SEED, { f: 1 });
    const m = hpMul() * (opts.finale ? D.FINALE.HP_MUL : 1);
    for (const p of cr.parts) {
      p.hp = p.maxHp = Math.max(1, Math.round(p.maxHp * m * (D.HP_MUL[p.kind] ?? 1)));
      p.lit = true;
    }
    cr.hp = cr.maxHp = Math.max(1, Math.round(D.HP * m * D.HP_MUL.pool));
    Object.assign(cr, { name: D.NAME, mode: 'surfacing', dying: false, age: 0, sinkT: 0, side, base: { x: cr.x, y: cr.y }, chunks: [], stats: { dmg: 0, by: {}, parts: {}, severed: 0, chomps: 0, fed: 0, win: null }, ai: { breather: 0 } });
    Object.assign(cr, { phase: 1, fed: 0, mouthWin: null, phaseDy: 0 });
    Object.defineProperty(cr, 'hooks', { value: { state, puff, credit, rng, phoneFx, hurt: (hit, dmg, o) => hurtCreature(state, hit, dmg, o), hurtPool: (dmg, src, who) => hurtPool(state, dmg, src, { who }), sever: (p, seg, o = {}) => sever(state, cr, p, seg, o) }, enumerable: false });
    Object.defineProperty(cr, 'grips', { value: [], enumerable: false, writable: true });
    Object.defineProperty(cr, 'harpoons', { value: [], enumerable: false });
    cr.slap = null;
    cr.breach = null;
    cr.breachDy = 0;
    cr.tvx = 0;
    cr.hooked = false;
    setupEel(state, cr, ship, opts);
    state.creature = cr;
    state.say('setpiece', opts.finale ? D.FINALE.ARRIVE_TEXT : 'SOMETHING LONG AND GOLD-LIT SLIDES OUT OF THE VOID...', null, 4);
    state.sfxQ.push(['roar']);
    return cr;
  };

  const spawn = (kind = 'kraken', opts = {}) => {
    if (kind === 'eel') return spawnEel(opts);
    if (kind === 'mother') return spawnMother();
    if (kind === 'wyrm') return spawnWyrm();
    if (kind === 'titan') return spawnTitan();
    if (kind === 'drake') return spawnDrake();
    if (kind === 'thunderbird') return spawnBird();
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
    state.say('setpiece', cr.name + ' RISES FROM THE DEEP!', null, 4);
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
    if (!state.creature && !done && CR().DEV_SPAWN && state.phase === 'flying' && !state.ship.down && homeOk(CR().DEV_SPAWN)) {
      done = true;
      spawn(CR().DEV_SPAWN);
    }
    // A LAIR (voyage.js, course.js startMission: course.stop.lair): the creature of that sky (config.CREATURES.LAIR.BY_ENV: a Kraken in the Sunken Sea, the Drake in the Ember Forge) rises where the zeppelin boss would,
    // at BOSS_AT of the way to the lair's middle when the pacing allows, and anyway at LAIR.RUNUP.
    const c = state.course;
    const lairKind = c && c.stop && c.stop.lair ? c.stop.creature || 'kraken' : null;
    if (!state.creature && !done && lairKind && !c.done && state.phase === 'flying' && !state.ship.down && homeOk(lairKind) && c.progress > config.WAVES.BOSS_AT && ((!state.tempo || state.tempo.bossOk) || c.progress > CR().LAIR.RUNUP)) {
      done = true;
      spawn(lairKind);
    }
    // C.6f, THE FLAGSHIP'S STOP: the Void Eel comes with the Flagship (config.CREATURES.EEL.FINALE): once she is moored and the citadel still stands.
    const FIN = CR().EEL.FINALE;
    if (!state.creature && !done && FIN.ENABLED && c && c.ring && c.ring.moor && c.ring.moor.spawned && state.boss && state.boss.moor && !c.ring.crown && !c.done && c.lap !== state.bossDownLap && state.phase === 'flying' && !state.ship.down && homeOk('eel')) {
      done = true;
      spawn('eel', { finale: true });
    }
    const cr = state.creature;
    if (!cr) return;
    const ship = mainShip(state), S = CR().SPAWN, mid = shipMid(ship), drake = cr.kind === 'drake', bird = cr.kind === 'thunderbird', titan = cr.kind === 'titan', wyrm = cr.kind === 'wyrm', mother = cr.kind === 'mother', eel = cr.kind === 'eel';
    cr.age += dt;
    let dive = 0;
    if (eel) { // the Void Eel circles the ship (creatureEel.js); dead, it goes limp and drifts away; with the Flagship down it swims off
      stepEel(state, cr, ship, dt);
      if (cr.mode === 'dying') cr.sinkT += dt;
      if (eelGone(cr)) { state.creature = null; return; }
    } else if (mother) { // the Mother clings to the roof (creatureMother.js); dead, she withers and falls
      stepMother(state, cr, ship, dt);
      if (cr.mode === 'dying') {
        cr.sinkT += dt;
        dive = CR().MOTHER.SPAWN.SINK_DEEP * smooth(cr.sinkT / CR().MOTHER.SPAWN.SINK);
      }
    } else if (wyrm) { // the Wyrm cracks a cliff and erupts (creatureWyrm.js); dead, it collapses into the cliff
      stepWyrm(state, cr, ship, dt);
      dive = cr.wyrm.dive;
      if (cr.mode === 'dying') {
        cr.sinkT += dt;
        dive = CR().WYRM.SPAWN.SINK_DEEP * smooth(cr.sinkT / CR().WYRM.SPAWN.SINK);
      }
    } else if (titan) { // the Titan strides about the plain (creatureTitan.js); dead, it crumbles into it
      stepTitan(state, cr, ship, dt);
      if (cr.mode === 'dying') {
        cr.sinkT += dt;
        dive = CR().TITAN.SPAWN.SINK_DEEP * smooth(cr.sinkT / CR().TITAN.SPAWN.SINK);
      }
    } else if (bird) { // the Thunderbird flies (creatureBird.js); dead, it falls into the clouds
      stepBird(state, cr, ship, dt);
      if (cr.mode === 'dying') {
        cr.sinkT += dt;
        dive = CR().THUNDERBIRD.SPAWN.SINK_DEEP * smooth(cr.sinkT / CR().THUNDERBIRD.SPAWN.SINK);
      }
    } else if (drake) { // the Drake flies (creatureDrake.js); dead, it falls into the lava
      stepDrake(state, cr, ship, dt);
      if (cr.mode === 'dying') {
        cr.sinkT += dt;
        dive = CR().DRAKE.SPAWN.SINK_DEEP * smooth(cr.sinkT / CR().DRAKE.SPAWN.SINK);
      }
    } else {
    // Hold station beside the ship (it swims along with her), rising out of the deep first and sinking away when it is dead.
    const k = Math.min(1, S.FOLLOW * dt);
    if (cr.hooked) cr.base.x += (cr.tvx || 0) * dt; // (a harpoon line holds it: it no longer swims along with her, it is hauled, creatureTow.js)
    else if (cr.mouthWin && cr.mode === 'idle') cr.base.x += ship.pose.vx * dt; // (a window is open: creatureFight.js swims it under her bomb bay)
    else if (cr.mode !== 'breach') cr.base.x += (mid.x + cr.side * S.STANDOFF - cr.base.x) * k + ship.pose.vx * dt; // (a breach moves it itself, creatureBreach.js)
    cr.base.y += (stationY(ship, mid, cr.base.x) - cr.base.y) * k;
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
    }
    cr.x = cr.base.x;
    cr.y = cr.base.y + dive + (cr.breachDy || 0) + cr.phaseDy;
    cr.vx = cr.vy = 0;
    if (cr.mode === 'dying') state.slow = cr.sinkT < CR().FINALE.SLOW_FOR ? CR().FINALE.SLOW : 1; // (the last blow plays in slow motion: main.js runs the sim at this speed)
    if (vulnerable(cr)) creatureShell(state);
    if (drake || bird || titan || wyrm || mother || eel) { /* (its attacks are in stepDrake / stepBird / stepTitan / stepWyrm / stepMother / stepEel) */ } else if (cr.mode === 'idle') think(cr, dt, ship);
    else if (cr.grips.length || cr.slap) thinkAttacks(state, cr, ship, dt); // (sinking: the limbs that held her let go and the records are cleared)
    stepHarpoons(state, cr, dt);
    decayJobs(cr, dt);
    const dark = (state.darkNow || 0) > CR().DARK_AT; // (in the dark each part is dim unless a searchlight has it)
    const flash = bird && !!state.weather && state.weather.flash > 0.45; // (a flash of lightning shows the Thunderbird for a moment: the picture only, the guns' aim assist still needs a beam)
    const eelDim = eel && !!cr.eel.lure && cr.eel.lure.live && !cr.eel.lure.known; // (the Void Eel's body is a glow in the dark, except while it hides behind its lure)
    for (const p of cr.parts) p.lit = eel ? !eelDim || (!!p.tgt && p.tgt.lit > 0) || p.id === 'lamp' : !dark || flash || (!!p.tgt && p.tgt.lit > 0) || (mother && motherSeen(state, cr, p, 0)); // (the Mother's tendrils show while they reach, hold, burn or stand in the ship's glow)
    if (bird && cr.bird.glow > 0) { // the swallowed bolt lights the gizzard from inside: it counts as lit (aim assist, the picture)
      const gz = cr.parts.find((p) => p.kind === 'heart');
      if (gz) { gz.lit = true; tgtOf(gz).lit = Math.max(tgtOf(gz).lit, 0.3); }
    }
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
    if (cr.mode === 'dying' && cr.sinkT >= (eel ? CR().EEL.SPAWN.SINK : mother ? CR().MOTHER.SPAWN.SINK : wyrm ? CR().WYRM.SPAWN.SINK : titan ? CR().TITAN.SPAWN.SINK : bird ? CR().THUNDERBIRD.SPAWN.SINK : drake ? CR().DRAKE.SPAWN.SINK : S.SINK_TIME) && !cr.chunks.length) {
      state.creature = null;
      state.slow = 1;
    }
  };

  // A new mission (or a new game): the creature is gone and the dev flag may spawn a new one.
  const reset = () => {
    for (const p of Object.values(state.players)) if (p.on && !p.on.away) p.on = null; // (a boarder is a flyer again: the airborne system takes him from here)
    state.creature = null;
    for (const sh of state.ships || []) if (sh.ctx && sh.ctx.perch) sh.ctx.perch = null; // (the Drake's weight is gone with it)
    if (state.slow !== undefined) state.slow = 1;
    done = false;
  };
  // C.6d: a hammer in the hands of a man beside the Wyrm's coil CHIPS the ice while the coil is young; in its last HACK_AT s (or with a sword in hand) the button hacks it free.
  const wyrmChipFirst = (ship, p) => { const cr = state.creature; if (!cr || cr.kind !== 'wyrm' || p.carry !== 'hammer') return false; const g = gripNear(state, ship, p); return !g || wyrmHoldBack(cr, g); };
  // What the rest of the game asks of it (the ship sims and the bots hold W.creatures); all of them answer at once when there is no creature.
  return {
    update, reset, restart: reset, spawn,
    actionFor: (ship, p) => (state.creature ? (wyrmChipFirst(ship, p) ? wyrmAction(state, ship, p) : null) || actionFor(state, ship, p) || (state.creature.kind === 'drake' ? perchAction(state, ship, p) : state.creature.kind === 'thunderbird' ? birdPerchAction(state, ship, p) : state.creature.kind === 'wyrm' ? wyrmAction(state, ship, p) : null) : null), // the Action button beside a grip: HACK THE TENTACLE! (the Drake or the Thunderbird on her bag: DRIVE IT OFF!)
    blow: (ship, p) => (state.creature ? (wyrmChipFirst(ship, p) && wyrmBlow(state, ship, p)) || blow(state, ship, p) || (state.creature.kind === 'drake' && perchBlow(state, ship, p)) || (state.creature.kind === 'thunderbird' && birdPerchBlow(state, ship, p)) || (state.creature.kind === 'wyrm' && wyrmBlow(state, ship, p)) : false), // ATTACK with a sword beside a grip: one blow of three
    hacked: (ship, p, job) => (state.creature && state.creature.kind === 'drake' && perchHacked(state, ship, p, job)) || (state.creature && state.creature.kind === 'thunderbird' && birdPerchHacked(state, ship, p, job)) || (state.creature && state.creature.kind === 'wyrm' && wyrmHacked(state, p, job)) || hacked(state, ship, p, job),
    jobsOf: (ship) => (state.creature ? [...jobsOf(state, ship), ...(state.creature.kind === 'drake' ? perchObjects(state, ship) : state.creature.kind === 'thunderbird' ? birdPerchObjects(state, ship) : state.creature.kind === 'wyrm' ? wyrmChipObjects(state.creature) : [])] : []), // the hold-action objects of this ship's grips (shipSim.js drains their progress)
    gripJobs: (ship) => (state.creature ? gripJobs(state, ship) : []),
    boardCheck: (p) => { if (p.on) boardCheck(state, p); },
    boarderStep: (ship, p, dt, holdOk) => boarderStep(state, ship, p, dt, holdOk),
    surfaces: (ship) => creatureSurfaces(state, ship),
  };
}
