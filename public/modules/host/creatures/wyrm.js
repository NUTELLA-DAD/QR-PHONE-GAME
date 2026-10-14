// THE RIME WYRM (BOSSES.md 2.4, C.6d), body data. The generic puppet is creature.js; the fight (the cracking cliff, the eruption, the coil, the ice armour, the frost breath, the gape, the sun, the wins) is creatureWyrm.js.
// A serpent about 7000 px long that comes out of an ice cliff. It is made of:
//   a COLLAR (kind 'mantle': the thick neck standing out of the rock, a landing strip for boarders), the BODY (one long limb of rigid segments, kind 'tentacle': the generic grip, coil, hack, radar and aim code works on
//   it), a HEAD that rides the body's tip, a MOUTH (the snout; the maw opens for bombs) and the BELLY (kind 'heart': the soft underbelly patch on the collar's flank, hidden until phase 3).
// Every part but the maw and the belly wears ICE (part.ice: one number per segment, creatureWyrm.js). Sizes are config.CREATURES.WYRM.BODY. Nothing wobbles: the body eases between stepped goals (keys, 8 a second);
// the head's pitch (the maw turned up for bombs, the head thrown back for the breath) changes only on keys.
import { config } from '../../../config.js';
import { createCreatureBody } from '../creature.js';

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// The body definition (a function, so it always reads the live config).
export function wyrmDef() {
  const W = config.CREATURES.WYRM, B = W.BODY;
  const chain = (n, len, r) => { // lengths and radii taper root to tip
    const out = [];
    for (let j = 0; j < n; j++) {
      const u = j / n, u1 = (j + 1) / n;
      out.push({ len: len[0] + (len[1] - len[0]) * (j / Math.max(1, n - 1)), r: r[0] * Math.pow(r[1] / r[0], u), r1: r[0] * Math.pow(r[1] / r[0], u1) });
    }
    return out;
  };
  const parts = [];
  parts.push({ id: 'collar', kind: 'mantle', hp: B.COLLAR.HP, at: B.COLLAR.AT, shape: { ang: Math.PI / 2, len: B.COLLAR.LEN, r: B.COLLAR.R } });
  parts.push({ id: 'wyrm', kind: 'tentacle', hp: B.LIMB.HP, at: B.LIMB.AT, chain: chain(B.LIMB.SEGS, B.LIMB.LEN, B.LIMB.R), rest: [W.SUN.STATION_DX, W.SUN.STATION_DY], bend: -B.LIMB.ARCH, swayMul: 0, pullBack: 0.1, pullLift: 0.06, layer: 'front' });
  parts.push({ id: 'head', kind: 'head', hp: B.HEAD.HP, at: [0, 0], shape: { ang: 0, len: B.HEAD.LEN, r: B.HEAD.R }, attach: { to: 'wyrm', fwd: 0, side: 0 } });
  parts.push({ id: 'mouth', kind: 'mouth', hp: B.MOUTH.HP, at: [0, 0], shape: { ang: 0, len: 0, r: B.MOUTH.R }, attach: { to: 'head', fwd: -B.MOUTH.R * 0.3, side: 0 } });
  parts.push({ id: 'belly', kind: 'heart', hp: B.BELLY.HP, at: B.BELLY.AT, shape: { ang: 0, len: 0, r: B.BELLY.R }, hidden: true });
  return { kind: 'wyrm', hp: W.HP, parts, onKey: wyrmKey };
}

// One key of the body (8 a second): the body bows upward whichever way it faces, and the head is pitched for what it is doing (rotOff changes only here): the maw turned up while it gapes, thrown back for the breath.
function wyrmKey(body) {
  const wy = body.wyrm;
  if (!wy) return;
  const arch = config.CREATURES.WYRM.BODY.LIMB.ARCH;
  for (const p of body.parts) if (p.limb) p.bend = -arch * body.f;
  const limb = body.parts.find((p) => p.id === 'wyrm'), head = body.parts.find((p) => p.id === 'head'), mouth = body.parts.find((p) => p.id === 'mouth');
  if (!limb || !head || !limb.segs.length) return;
  const g = limb.segs[limb.segs.length - 1];
  head.rotOff = wy.headUp ? wrapPi(-Math.PI / 2 - g.ang) : -(wy.tilt || 0) * body.f;
  if (mouth) mouth.rotOff = 0;
}

// The body: created at x, y (the cliff top it comes out of), facing f (1 = toward +x). The brain record wy rides along (body.wyrm).
export function createWyrm(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(wyrmDef(), { x, y, seed, ...opts });
  body.puppet = { auto: false, closeAt: 0 };
  body.wyrm = { headUp: false, tilt: 0 };
  return body;
}

// ---- what it says in each phase (the bar, the banners) ----
export const WYRM_PHASES = {
  1: { name: 'IT ERUPTS', banner: null, hint: 'Cracks in a cliff, then a coil round the hull. Chip the ice with hammers, then shell it; bomb the gaping maw.' },
  2: { name: 'FROST BREATH', banner: 'THE WYRM BREATHES FROST! IT FREEZES THE GUNS - CHIP THEM CLEAR!', hint: 'Its breath freezes the guns. Hammers (or flame) thaw them.' },
  3: { name: 'EXHAUSTED', banner: 'THE WYRM IS HURT - IT CANNOT BURROW! TOW ITS HEAD INTO THE SUN OR BOARD ITS UNDERBELLY!', hint: 'It stays out: haul its head into the sun, or strike its underbelly.' },
};
export const wyrmPhaseName = (n) => (WYRM_PHASES[n] || WYRM_PHASES[1]).name;
export const WYRM_MOUTH_TEXT = 'THE WYRM GAPES - DROP BOMBS IN ITS MAW!';
