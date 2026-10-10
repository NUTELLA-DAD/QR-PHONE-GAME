// CREW v2 (WP7): the POSES. Pure functions: a crewman's state (what the simulation says he is doing) -> one STEPPED pose (3D.md section 1: pose keys at 8 fps, held, then snapped; nothing
// here reads a sine of the time). crew.js asks for a new pose only when the key number changes (stepKey), so a limb holds its angle for 1/8 s and then jumps to the next key; the figure's
// POSITION is the simulation's own and moves smoothly.
//
// Angles are in radians in the figure's own frame (it faces +x, y up, rotations about the z axis, which points at the viewer in profile):
//   arms: 0 = hanging straight down, + swings FORWARD, up to ~2.9 (straight up);  legs: 0 = straight down, + forward;
//   lean: the torso leaning forward (+);  roll: the whole body turned about its middle (a stagger, a tumble, knocked out, a cannon flight);  tail / scarf: + droops (the scarf hangs at ~1.2, streams at ~0.1).
import { CHEST_ITEMS } from './crewParts.js';
import { config } from '../../config.js';

// THE one place the time becomes a key. 8 frames a second for everything that moves a limb.
export const stepKey = (t, fps = 8) => Math.floor(t * fps);

const PI = Math.PI;
const fin = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// the 4-key walk cycle (contact, passing, contact, passing: A is the leg on the viewer's side of a figure that faces right), the 4-key ladder climb
const WALK = [
  { lA: 0.62, lB: -0.62, aA: -0.55, aB: 0.55, bob: -1.5, lean: 0.07 },
  { lA: -0.1, lB: 0.2, aA: 0.1, aB: -0.1, bob: 3, lean: 0.05 },
  { lA: -0.62, lB: 0.62, aA: 0.55, aB: -0.55, bob: -1.5, lean: 0.07 },
  { lA: 0.2, lB: -0.1, aA: -0.1, aB: 0.1, bob: 3, lean: 0.05 },
];
const CLIMB = [
  { aA: 2.9, aB: 2.2, lA: 0.55, lB: 0, bob: 2 },
  { aA: 2.6, aB: 2.6, lA: 0.3, lB: 0.3, bob: 0 },
  { aA: 2.2, aB: 2.9, lA: 0, lB: 0.55, bob: 2 },
  { aA: 2.6, aB: 2.6, lA: 0.3, lB: 0.3, bob: 0 },
];
// how an item sits in the hand: its angle relative to the forearm (item +y = its long axis; see crewParts.js) and the arm angle that carries it at rest
const HAND = { sword: [-1.5, 0.9], cutlass: [-1.45, 0.6], hammer: [-1.35, 0.8], club: [-1.15, 0.45], cleaver: [-1.4, 0.6], extinguisher: [-0.8, 0.8], towline: [-0.6, 0.7], bomb: [-0.5, 0.8], hookshot: [-PI, 1.45] };
export const MELEE = new Set(['sword', 'cutlass', 'hammer', 'club', 'cleaver']);

export function newPose() {
  return {
    aA: 0, aB: 0, lA: 0, lB: 0, lean: 0, bob: 0, headTilt: 0, tail: 0.45, scarf: 1.15, roll: 0, pivotY: 30, up: 0, sx: 1, sy: 1,
    itemRel: 0, swoosh: 0, open: 0, facing: 'idle', mode: 'idle', key: -1, hearts: 3, flash: 0, shudder: 0,
  };
}

// c = { p (the record), item (what is in hand: a carry kind or a raider's weapon), holder ('A' | 'B': the arm on the viewer's side), K (the key), ph (0..3 phase), now (ms),
//       moving (bool), st (the figure's own memory: airK0, squashK, wasAir, lastSquash), aim (hookshot aim, radians above the horizontal), sgn (+1 / -1: local z toward the viewer) }
export function computePose(o, c) {
  const p = c.p, K = c.K, st = c.st, item = c.item || null;
  const chest = !!item && CHEST_ITEMS.has(item), tool = !!item && !chest;
  const H = c.holder === 'B' ? 'aB' : 'aA', O = c.holder === 'B' ? 'aA' : 'aB';
  const kk = c.ph + K, k4 = kk & 3, k2 = kk & 1;
  const swingAge = p.swingT ? c.now - p.swingT : 1e9;
  const ko = p.ko > 0;
  o.key = K;
  o.aA = o.aB = 0.06; o.lA = o.lB = 0; o.lean = 0; o.bob = 0; o.headTilt = 0; o.tail = 0.45; o.scarf = 1.15; o.roll = 0; o.pivotY = 30; o.up = 0; o.sx = o.sy = 1;
  o.itemRel = 0; o.swoosh = 0; o.open = 0; o.facing = 'idle'; o.mode = 'idle'; o.shudder = 0; o.spread = 1;
  o.flash = p.hurtT > 0 && !p.type && (K & 1) === 0 ? 1 : 0; // (just hit: he blinks, a stepped flash at 4 a second)
  if (p.hurtT > 0 && !p.type) o.shudder = (K & 1) ? 2.2 : -2.2;
  const hand = item && HAND[item];
  if (hand) o.itemRel = hand[0];

  // landing squash: 2 keys of 1.15 wide / 0.85 tall after a landing (a fresh squash value, or the end of a hop)
  const sq = fin(p.squash);
  if (sq > 0.05 && sq > st.lastSquash + 0.05) st.squashK = K + 2;
  st.lastSquash = sq;
  const air = !!(p.air || p.fly);
  if (st.wasAir && !air) st.squashK = Math.max(st.squashK || 0, K + 2);
  if (air && !st.wasAir) st.airK0 = K;
  st.wasAir = air;
  const squashing = K < (st.squashK || 0) && !ko;

  // ---- whole-body states first ----
  if (ko) { // tipped over on the floor, limp
    o.mode = 'ko'; o.facing = 'side'; o.roll = -PI / 2; o.pivotY = 0; o.up = 13; o.aA = 0.4; o.aB = 0.9; o.lA = 0.15; o.lB = -0.2; o.headTilt = -0.35; o.tail = 0.9; o.scarf = 1.3;
    return o;
  }
  if (p.fall && p.tumble) { // overboard: a stepped tumble (the spin is sampled at the key and held)
    o.mode = 'tumble'; o.facing = 'side'; o.roll = -fin(p.rot); o.pivotY = 30;
    o.aA = o.aB = k2 ? 2.9 : 2.4; o.lA = k2 ? 0.5 : -0.4; o.lB = -o.lA; o.scarf = k2 ? -0.5 : -0.1; o.tail = k2 ? -0.3 : 0.2;
    return o;
  }
  if (p.fall && !p.tumble && !p.fly) { // a paratrooper from a gunship (a raider dropping aboard) hangs under his canopy
    o.mode = 'chute'; o.facing = 'side'; o.aA = o.aB = 2.55; o.lA = 0.22; o.lB = -0.1; o.open = 1; o.scarf = -0.3;
    return o;
  }
  if (p.fly) {
    o.facing = 'side';
    if (p.cannon) { // fired from the crew cannon: flies like a bullet, head first, arms ahead
      o.mode = 'cannon'; o.roll = c.heading || 0; o.pivotY = 30;
      o.aA = o.aB = 1.57; o.lA = -0.3; o.lB = -0.45; o.scarf = 0.05; o.tail = 0.1; o.lean = 0;
    } else if (p.chuteOpen) { // hanging under the canopy (it opens in three steps: 0.35, 0.7, full)
      o.mode = 'chute'; o.roll = -fin(p.rot) * 0.6; o.aA = o.aB = 2.55; o.lA = 0.22; o.lB = -0.1; o.scarf = -0.3; o.tail = 0.5;
      const since = (p.chute || 0) - (config.AIR ? config.AIR.CHUTE_DELAY : 0.5);
      o.open = since < 0.12 ? 0.35 : since < 0.25 ? 0.7 : 1;
    } else if (p.hook && p.hook.phase === 'caught') { // swinging on his own hookshot rope
      o.mode = 'swing'; o.roll = -fin(p.rot) * 0.5; o.aA = 2.75; o.aB = 2.7; o.lA = 0.45; o.lB = 0.15; o.scarf = -0.2;
    } else { // thrown or jumped: arms up, flailing
      o.mode = 'flail'; o.roll = -fin(p.rot); o.aA = o.aB = k2 ? 2.9 : 2.5; o.lA = k2 ? 0.5 : -0.4; o.lB = -o.lA; o.scarf = k2 ? -0.3 : 0.1; o.tail = k2 ? 0.2 : 0.6;
      if (p.chute > 0 && !p.chuteOpen) o.aA = o.aB = 2.9;
    }
    return o;
  }
  // stagger on a heaving deck: the sim's lean, held per key
  if (fin(p.rot) !== 0 && !air) o.roll = -fin(p.rot);

  // ---- on the deck ----
  if (p.climb) { // 4 keys, hand over hand (held still when he is not moving)
    const k = c.moving ? CLIMB[k4] : CLIMB[1];
    o.mode = 'climb'; o.facing = 'wall'; o.spread = 1.6; o.aA = k.aA; o.aB = k.aB; o.lA = k.lA; o.lB = k.lB; o.bob = k.bob; o.scarf = 0.7; o.tail = 0.3;
    return o;
  }
  if (squashing) { // landing: the squash (1.15 wide, 0.85 tall) held for 2 keys, knees bent, arms out
    o.mode = 'land'; o.facing = 'side'; o.sx = 1.15; o.sy = 0.85; o.aA = o.aB = 0.55; o.lA = 0.35; o.lB = 0.25; o.lean = 0.12; o.scarf = 0.6;
    if (chest) o.aA = o.aB = 1.1;
    return o;
  }
  if (p.air) { // a jump on the deck: crouch / tuck on the first key, stretch on the second, then the air pose
    const n = p.jumpKey != null ? p.jumpKey : K - (st.airK0 || 0); // (jumpKey: the dev page's key strip)
    o.mode = 'jump'; o.facing = 'side';
    if (n <= 0) { o.lA = o.lB = 0.85; o.aA = o.aB = 0.3; o.lean = 0.18; o.sy = 0.92; o.sx = 1.06; o.scarf = 0.8; }
    else if (n === 1) { o.lA = o.lB = 0.1; o.aA = o.aB = 2.4; o.lean = -0.05; o.sy = 1.06; o.sx = 0.96; o.scarf = 0.1; }
    else { o.aA = o.aB = 2.6; o.lA = 0.45; o.lB = -0.15; o.scarf = 0.2; o.tail = 0.7; }
    return o;
  }
  const hopAge = p.actT ? c.now - p.actT : 1e9; // the "Hey!" hop of an Action press: a 2-key CROUCH, then up, up, down (each key held 1/8 s)
  if (hopAge < 625 && !p.lock && !c.moving) {
    const n = (hopAge / 125) | 0;
    o.mode = 'hop'; o.facing = 'side';
    if (n <= 1) { o.sy = n ? 0.86 : 0.92; o.sx = n ? 1.12 : 1.07; o.aA = o.aB = n ? -0.4 : 0.5; o.lA = o.lB = n ? 0.8 : 0.5; o.lean = n ? 0.2 : 0.12; o.up = n ? -4 : -2; o.scarf = 0.8; }
    else { o.aA = o.aB = 2.6; o.lA = 0.35; o.lB = -0.1; o.up = n === 2 ? 26 : n === 3 ? 36 : 14; o.scarf = 0.1; }
    return o;
  }
  const walking = c.moving;
  const w = WALK[k4];
  if (walking) { o.lA = w.lA; o.lB = w.lB; o.aA = w.aA; o.aB = w.aB; o.bob = w.bob; o.lean = w.lean; o.facing = 'side'; o.mode = 'walk'; o.scarf = k2 ? 0.1 : 0.35; o.tail = k2 ? 0.25 : 0.65; }

  // arms by what he is doing (the legs keep the walk)
  if (p.windup > 0) { o.mode = 'windup'; o.facing = 'side'; o[H] = 2.9; o.lean = -0.1; }
  else if (swingAge < 250) { o.mode = 'swing'; o.facing = 'side'; o[H] = swingAge < 125 ? 2.7 : 0.55; o.lean = swingAge < 125 ? -0.12 : 0.18; if (MELEE.has(item)) o.swoosh = swingAge < 200 ? (item === 'sword' || item === 'cutlass' ? 70 : 45) : 0; }
  else if (p.lock) { // manning a station: hands on the controls; working it (firing, cranking) alternates the hands every key
    o.mode = 'station'; o.facing = 'side'; o.aA = o.aB = 1.3;
    if (p.fire || (p.act && p.act.hold)) { o.aA = k2 ? 1.55 : 1.1; o.aB = k2 ? 1.1 : 1.55; o.lean = k2 ? 0.1 : 0.04; o.mode = 'work'; }
  } else if (chest) { o.aA = o.aB = 1.1; o.facing = 'side'; o.mode = walking ? 'walk' : 'carry'; if (!walking) o.lean = -0.05; }
  else if (tool) {
    o[H] = item === 'hookshot' ? 1.57 + clamp(fin(c.aim, 0.3), -1.2, 1.5) : hand[1];
    o.facing = 'side'; if (!walking) o.mode = 'tool';
  } else if (p.fire && p.act && p.act.hold) { o.mode = 'work'; o.facing = 'side'; o.aA = k2 ? 1.25 : 0.9; o.aB = k2 ? 0.9 : 1.25; o.lean = k2 ? 0.1 : 0.03; } // working away (hammering, bailing)
  if (item === 'hookshot' && p.hook) o.itemRel = -PI;
  // the held arm's tool keeps its angle in the walk
  if (tool && walking && !(swingAge < 250) && !(p.windup > 0)) o[O] = w[O];
  o.headTilt = 0;
  return o;
}

// hearts above a hurt crewman: 'f' full, 'h' half, 'e' empty for each of 3
export function heartsOf(hp, max) {
  if (!(hp < max) || !Number.isFinite(hp)) return '';
  let s = '';
  for (let i = 0; i < 3; i++) { const v = clamp(hp - i, 0, 1); s += v >= 0.75 ? 'f' : v >= 0.25 ? 'h' : 'e'; }
  return s;
}
