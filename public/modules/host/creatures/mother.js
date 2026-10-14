// THE MYCELIAL MOTHER (BOSSES.md 2.5, C.6e), body data. The generic puppet is creature.js; the fight (the dark, the lit eyes, the tendril grabs, the burning, the spores, the wing beat, the wins) is creatureMother.js.
// A giant spore-moth clinging to the roof of a dark cavern. She is made of:
//   the CAP (kind 'mantle': a vertical capsule hanging from the roof; a boarder walks its underside), two EYES (kind 'eye'), the SPORE HEART (kind 'heart': on the cap's underside, hidden until phase 3), and five TENDRILS
//   (kind 'tentacle': chains of rigid segments rooted on the cap's underside, so the generic grip, hack, sever, radar and aim code works on them). Her wings are only a picture (cr.mother.beat, creatureArt.js).
// Sizes are config.CREATURES.MOTHER.BODY. Nothing wobbles: the tendrils ease between stepped goals (keys, 8 a second).
import { config } from '../../../config.js';
import { createCreatureBody } from '../creature.js';

// The body definition (a function, so it always reads the live config).
export function motherDef() {
  const M = config.CREATURES.MOTHER, B = M.BODY, T = B.TENDRILS;
  const chain = (n, len, r) => { // lengths and radii taper root to tip
    const out = [];
    for (let j = 0; j < n; j++) {
      const u = j / n, u1 = (j + 1) / n;
      out.push({ len: len[0] + (len[1] - len[0]) * (j / Math.max(1, n - 1)), r: r[0] * Math.pow(r[1] / r[0], u), r1: r[0] * Math.pow(r[1] / r[0], u1) });
    }
    return out;
  };
  const parts = [];
  parts.push({ id: 'cap', kind: 'mantle', hp: B.CAP.HP, at: B.CAP.AT, shape: { ang: Math.PI / 2, len: B.CAP.LEN, r: B.CAP.R } });
  B.EYES.AT.forEach((at, i) => parts.push({ id: i ? 'eyeF' : 'eyeN', kind: 'eye', hp: B.EYES.HP, at, shape: { ang: 0, len: 0, r: B.EYES.R } }));
  parts.push({ id: 'heart', kind: 'heart', hp: B.HEART.HP, at: B.HEART.AT, shape: { ang: 0, len: 0, r: B.HEART.R }, hidden: true });
  for (let i = 0; i < T.N; i++) {
    parts.push({ id: 't' + i, kind: 'tentacle', hp: T.HP, at: T.ROOTS[i], chain: chain(T.SEGS, T.LEN, T.R), rest: [0, T.REST_DOWN], bend: (i % 2 ? 1 : -1) * T.BEND, swayMul: 0.5, pullBack: 0.1, pullLift: 0.04, layer: 'front' });
  }
  return { kind: 'mother', hp: M.HP, parts };
}

// The body: created at x, y (the middle of the cap's top, where it clings to the roof). The brain record mt rides along (body.mother).
export function createMother(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(motherDef(), { x, y, seed, ...opts });
  body.puppet = { auto: false, closeAt: 0 };
  body.mother = { beat: 0 };
  return body;
}

// ---- what it says in each phase (the bar, the banners) ----
export const MOTHER_PHASES = {
  1: { name: 'IT STIRS', banner: null, hint: 'Light her up with the nest lamp. Burn the tendrils, shell the lit eyes, mortar the cap.' },
  2: { name: 'IT BEATS', banner: 'THE MOTHER IS ANGRY! HER WINGS BEAT - WATCH THE PILLARS!', hint: 'Her wings shove the ship toward the rock. Brake, or climb over the pillars.' },
  3: { name: 'IT THRASHES', banner: 'THE MOTHER THRASHES! HER SPORE HEART IS OPEN - BOARD HER CAP!', hint: 'Two grabs at once, and the spore heart opens for a boarder on her cap.' },
};
export const motherPhaseName = (n) => (MOTHER_PHASES[n] || MOTHER_PHASES[1]).name;
