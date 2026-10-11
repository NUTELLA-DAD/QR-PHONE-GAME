// Formation geometry for the enemy squadrons (squads.js): a formation is a list of slots, each an offset from the leader in the leader's own frame
// (fx along his heading, positive = ahead; fy across it, positive = to his right-hand side as he flies, i.e. below the line of flight for a plane flying right).
// Pure functions: no state, no random numbers, so the same squadron gives the same slots every time.
import { config } from '../../config.js';

export const FORMATIONS = ['vee', 'echelonL', 'echelonR', 'abreast', 'fingerFour', 'trail'];
export const FORMATION_NAMES = { vee: 'V FORMATION', echelonL: 'ECHELON LEFT', echelonR: 'ECHELON RIGHT', abreast: 'LINE ABREAST', fingerFour: 'FINGER-FOUR', trail: 'TRAIL', escort: 'BOMBER ESCORT' };
// The short names the bearing banner uses ("4 FIGHTERS, V FORMATION").
export const FORMATION_SHORT = { vee: 'V', echelonL: 'ECHELON LEFT', echelonR: 'ECHELON RIGHT', abreast: 'LINE ABREAST', fingerFour: 'FINGER-FOUR', trail: 'TRAIL', escort: 'BOMBER ESCORT' };

// The slots of n planes in a formation: [{ fx, fy }], slot 0 = the leader at (0, 0).
export function slotOffsets(formation, n) {
  const SQ = config.SQUADRONS;
  const S = SQ.SPACING;
  const W = SQ.WIDTH;
  const out = [];
  for (let i = 0; i < n; i++) {
    const rank = Math.ceil(i / 2);
    const side = i % 2 ? 1 : -1;
    let fx = 0;
    let fy = 0;
    if (i > 0) {
      if (formation === 'echelonR') [fx, fy] = [-i * S, i * W];
      else if (formation === 'echelonL') [fx, fy] = [-i * S, -i * W];
      else if (formation === 'abreast') [fx, fy] = [0, side * rank * W * 1.3];
      else if (formation === 'trail') [fx, fy] = [-i * S * 1.15, 0];
      else if (formation === 'fingerFour') [fx, fy] = i === 1 ? [-S, -W] : i === 2 ? [-S, W] : [-S * (i - 1), W * 2]; // lead, left, right, outer right (and any more astern of the outer one)
      else if (formation === 'escort') [fx, fy] = [SQ.ESCORT_SLOTS[(i - 1) % SQ.ESCORT_SLOTS.length].fx, SQ.ESCORT_SLOTS[(i - 1) % SQ.ESCORT_SLOTS.length].fy];
      else [fx, fy] = [-rank * S, side * rank * W]; // vee
    }
    out.push({ fx, fy });
  }
  return out;
}

// The world position of a slot for a leader frame { x, y, heading }; `flip` keeps "fy" the same side of the screen when the leader flies left (used for the escort, whose slots are above the bomber).
export function slotWorld(frame, slot, flip = false) {
  const c = Math.cos(frame.heading);
  const s = Math.sin(frame.heading);
  const fy = flip && c < 0 ? -slot.fy : slot.fy;
  return { x: frame.x + c * slot.fx - s * fy, y: frame.y + s * slot.fx + c * fy };
}

// Which formations a squadron of n may fly, weighted by the environment and the stop's danger: [[name, weight]].
export function formationChoices(n, envId, danger) {
  const SQ = config.SQUADRONS;
  const ew = SQ.ENV_WEIGHTS[envId] || {};
  const dw = SQ.DANGER_WEIGHTS[Math.min(3, Math.max(1, danger))] || {};
  const out = [];
  for (const f of FORMATIONS) {
    if (f === 'fingerFour' && n < 4) continue;
    const w = (SQ.WEIGHTS[f] || 0) * (ew[f] || 1) * (dw[f] || 1);
    if (w > 0) out.push([f, w]);
  }
  return out;
}

// Pairs of slot indexes for the break: the leader and his nearest slot, then the next unpaired slot and ITS nearest, and so on ([[0, 1], [2, 4], [3]] for a V of five); an odd one out flies alone.
export const pairsOf = (offsets) => {
  const left = offsets.map((_, i) => i);
  const out = [];
  while (left.length) {
    const a = left.shift();
    if (!left.length) {
      out.push([a]);
      break;
    }
    let best = 0;
    for (let k = 1; k < left.length; k++) if (Math.hypot(offsets[left[k]].fx - offsets[a].fx, offsets[left[k]].fy - offsets[a].fy) < Math.hypot(offsets[left[best]].fx - offsets[a].fx, offsets[left[best]].fy - offsets[a].fy) - 1e-6) best = k;
    out.push([a, left.splice(best, 1)[0]]);
  }
  return out;
};
