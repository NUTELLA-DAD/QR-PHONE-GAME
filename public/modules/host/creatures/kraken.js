// THE KRAKEN (BOSSES.md 2.1), body data only for now: a mantle, a beak that opens, two eyes, six tentacles of eight tapering rigid segments, and a heart.
// The generic puppet (the IK limbs, the stepped key clock, hit tests) is creature.js; this file says what the Kraken is made of and gives the demo puppet its few
// behaviours: idle sway (stepped keys, from creature.js), REACH toward a point, GRAB (the tip glued to a point), and the mouth opening and closing on a timer.
// Sizes live in config.CREATURES.KRAKEN: with its limbs spread it spans about 6600 px, around 2.5 times the classic ship's 2700.
import { config } from '../../../config.js';
import { createCreatureBody, nearestFreeLimb, reachPart, gripPart, releasePart, setMouth, stepBody } from '../creature.js';

// The body definition (a function, so it always reads the live config).
export function krakenDef() {
  const K = config.CREATURES.KRAKEN;
  const parts = [];
  // Limbs: lengths taper linearly, radii geometrically, root to tip.
  for (let i = 0; i < K.TENTACLES; i++) {
    const chain = [];
    for (let j = 0; j < K.SEGS; j++) {
      const u = j / K.SEGS, u1 = (j + 1) / K.SEGS;
      chain.push({
        len: K.LEN[0] + (K.LEN[1] - K.LEN[0]) * (j / (K.SEGS - 1)),
        r: K.R[0] * Math.pow(K.R[1] / K.R[0], u),
        r1: K.R[0] * Math.pow(K.R[1] / K.R[0], u1),
      });
    }
    const reach = chain.reduce((a, s) => a + s.len, 0);
    const a = (-1 + (2 * i) / (K.TENTACLES - 1)) * K.FAN; // lean from straight up: leftmost ... rightmost
    const rest = K.REST[i % K.REST.length] * reach;
    parts.push({
      id: 'tentacle' + (i + 1), kind: 'tentacle', hp: K.TENTACLE_HP, at: [K.ROOT_X[i], K.ROOT_Y], chain,
      rest: [Math.sin(a) * rest, -Math.cos(a) * rest], bend: (a < 0 ? K.BEND : -K.BEND) * (Math.abs(a) < 0.9 ? -1 : 1), // (the flat outer limbs arch upward; the steeper ones bow outward so they do not cross over the head) layer: K.FRONT.includes(i) ? 'front' : 'back',
    });
  }
  parts.push({ id: 'mantle', kind: 'mantle', hp: K.MANTLE.HP, at: K.MANTLE.AT, shape: { ang: Math.PI / 2 + K.MANTLE.LEAN, len: K.MANTLE.LEN, r: K.MANTLE.R } });
  K.EYES.AT.forEach((at, i) => parts.push({ id: 'eye' + (i + 1), kind: 'eye', hp: K.EYES.HP, at, shape: { ang: 0, len: 0, r: K.EYES.R } }));
  parts.push({ id: 'mouth', kind: 'mouth', hp: K.MOUTH.HP, at: K.MOUTH.AT, shape: { ang: 0, len: 0, r: K.MOUTH.R } });
  parts.push({ id: 'heart', kind: 'heart', hp: K.HEART.HP, at: K.HEART.AT, shape: { ang: 0, len: 0, r: K.HEART.R }, hidden: true });
  return { kind: 'kraken', hp: K.HP, parts, onKey: puppetKey };
}

// The demo puppet, on the key clock: the beak opens every EVERY s for OPEN_FOR s (while puppet.auto is on).
function puppetKey(body, key) {
  const pu = body.puppet;
  if (!pu) return;
  const M = config.CREATURES.KRAKEN.MOUTH;
  const mouth = body.parts.find((p) => p.kind === 'mouth');
  if (pu.closeAt && key >= pu.closeAt) {
    setMouth(body, mouth, false);
    pu.closeAt = 0;
  }
  if (pu.auto && key % Math.round(M.EVERY * body.stepFps) === 0 && !pu.closeAt) krakenMouth(body);
}

export function createKraken(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(krakenDef(), { x, y, seed, ...opts });
  body.puppet = { auto: true, closeAt: 0 };
  return body;
}

// Demo behaviours. Each limb command waits for the next key (see creature.js), then pulls back 0.4 s and snaps.
export function krakenReach(body, x, y) { // the nearest free tentacle reaches for (x, y); returns it, or null if none is free
  const p = nearestFreeLimb(body, x, y);
  return p && reachPart(body, p, x, y) ? p : null;
}
export function krakenGrab(body, x, y) { // the nearest free tentacle seizes (x, y) and stays glued to it (creature.moveGrip follows it)
  const p = nearestFreeLimb(body, x, y);
  return p && gripPart(body, p, x, y) ? p : null;
}
export function krakenLetGo(body) {
  for (const p of body.parts) if (p.grip || p.ctl?.mode === 'grip' || p.ctl?.mode === 'seize') releasePart(body, p);
}
export function krakenMouth(body, secs = config.CREATURES.KRAKEN.MOUTH.OPEN_FOR) { // the beak opens now (next key) and shuts after secs
  const mouth = body.parts.find((p) => p.kind === 'mouth');
  setMouth(body, mouth, true);
  if (body.puppet) body.puppet.closeAt = body.key + 1 + Math.max(1, Math.round(secs * body.stepFps));
}
export const stepKraken = stepBody;

// ---- THE FIGHT (BOSSES.md 2.1, C.3): what the Kraken says in each phase. The runner is creatureFight.js; the numbers (thresholds, paces, windows) are config.CREATURES.PHASE / MOUTH / DIVE / TOW_ROCK. ----
export const KRAKEN_PHASES = {
  1: { name: 'IT RISES', banner: null, hint: 'Slaps and single grabs. The beak gapes on a roar: bombs in!' },
  2: { name: 'IT GRABS', banner: 'IT GRABS!', hint: 'Grabs as many as the crew can bear, and lunges up from below: climb!' },
  3: { name: 'EXHAUSTED', banner: "IT'S EXHAUSTED - STRIKE THE HEART!", hint: 'Half out of the water: board it, harpoon it onto the rocks, or hold on when it dives.' },
};
export const krakenPhaseName = (n) => (KRAKEN_PHASES[n] || KRAKEN_PHASES[1]).name;
export const KRAKEN_MOUTH_TEXT = 'MOUTH OPEN - DROP BOMBS!';
