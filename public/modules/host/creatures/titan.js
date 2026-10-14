// THE ISLAND TITAN (BOSSES.md 2.7, C.6c), body data. The generic puppet is creature.js; the fight (walking, boulders, the gasbag grab, the roar, the island and the ways it ends) is creatureTitan.js.
// A slow stone colossus about 5000 px tall (twice the ship), standing on the plain. It is made of:
//   a TORSO (kind 'mantle': the body), a HEAD and a MOUTH on the front of the face (rigid; the mouth opens for the roar), two ARMS of three stone slabs each (kind 'tentacle': the generic limb code, grips and
//   severing already work on them; hit them with shells to shell them off), and the CRYSTAL (kind 'heart', hidden: only reachable on foot, on the island on its back, creatureIsland.js).
// The legs and the island are PICTURES (creatureArt.js drawTitan): the legs stride on the key clock while it walks, the island is a slab on its back (config.CREATURES.TITAN.ISLAND) that ground.js makes a walkable surface.
// Sizes are config.CREATURES.TITAN.BODY. Nothing wobbles: the arms ease between stepped goals (keys, 8 a second), the legs swap on keys.
import { config } from '../../../config.js';
import { createCreatureBody } from '../creature.js';

// The body definition (a function, so it always reads the live config).
export function titanDef() {
  const T = config.CREATURES.TITAN, B = T.BODY;
  const chain = (n, len, r) => { // lengths and radii taper root to tip
    const out = [];
    for (let j = 0; j < n; j++) {
      const u = j / n, u1 = (j + 1) / n;
      out.push({ len: len[0] + (len[1] - len[0]) * (j / Math.max(1, n - 1)), r: r[0] * Math.pow(r[1] / r[0], u), r1: r[0] * Math.pow(r[1] / r[0], u1) });
    }
    return out;
  };
  const arm = (id, i, layer) => ({ id, kind: 'tentacle', hp: B.ARM.HP, at: B.ARM.AT[i], chain: chain(B.ARM.SEGS, B.ARM.LEN, B.ARM.R), rest: B.ARM.REST[i], bend: B.ARM.BEND * (i ? -1 : 1), swayMul: B.ARM.SWAY, layer });
  const parts = [];
  parts.push(arm('armF', 1, 'back'));
  parts.push({ id: 'torso', kind: 'mantle', hp: B.TORSO.HP, at: B.TORSO.AT, shape: { ang: Math.PI / 2, len: B.TORSO.LEN, r: B.TORSO.R } });
  parts.push({ id: 'head', kind: 'head', hp: B.HEAD.HP, at: B.HEAD.AT, shape: { ang: 0, len: 0, r: B.HEAD.R } });
  parts.push({ id: 'mouth', kind: 'mouth', hp: B.MOUTH.HP, at: B.MOUTH.AT, shape: { ang: 0, len: 0, r: B.MOUTH.R } });
  parts.push({ id: 'crystal', kind: 'heart', hp: T.CRYSTAL.HP, at: [T.CRYSTAL.X, T.ISLAND.TOP - T.CRYSTAL.R * 0.7], shape: { ang: 0, len: 0, r: T.CRYSTAL.R }, hidden: true });
  parts.push(arm('armN', 0, 'front'));
  return { kind: 'titan', hp: T.HP, parts, onKey: titanKey };
}

// One key of the body (8 a second): while it walks the feet swap every other key. Only here may the picture's steps change.
function titanKey(body, key) {
  const tt = body.titan;
  if (!tt) return;
  if (tt.walking) { if (key % 2 === 0) tt.leg = tt.leg ? 0 : 1; } else tt.leg = 0;
}

// The body: created at x, y (its middle), facing f (1 = toward +x). The brain record tt rides along (body.titan).
export function createTitan(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(titanDef(), { x, y, seed, ...opts });
  body.puppet = { auto: false, closeAt: 0 };
  body.titan = { pose: 'stand', walking: false, leg: 0, roar: 0 };
  return body;
}

// ---- what it says in each phase (the bar, the banners) ----
export const TITAN_PHASES = {
  1: { name: 'IT WAKES', banner: null, hint: 'Boulders and a roar. Shell its arms off, bomb the roaring mouth, or land crew on its island and hack the crystal.' },
  2: { name: 'IT GRABS', banner: 'THE TITAN GRABS FOR THE GASBAG! SWORDS TO THE TOP DECK!', hint: 'A hand closes on the gasbag: pry the fingers off with swords, or shoot the arm.' },
  3: { name: 'IT ROARS', banner: 'THE TITAN IS FURIOUS! TWO BOULDERS AT ONCE!', hint: 'Faster, and two boulders at once. Finish the arms, the mouth or the crystal.' },
};
export const titanPhaseName = (n) => (TITAN_PHASES[n] || TITAN_PHASES[1]).name;
export const TITAN_MOUTH_TEXT = 'THE TITAN ROARS - MOUTH OPEN! DROP BOMBS!';
