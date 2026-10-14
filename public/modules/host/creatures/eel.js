// THE VOID EEL (BOSSES.md 2.6, C.6f), body data. The generic puppet is creature.js; the fight (the orbit, the lure, the bite, the coil, the swallow, the joints, the wins and the Flagship) is creatureEel.js.
// A serpent of 24 rigid segments (300 px each, about 7200 px) in four SECTIONS of six, tail first:
//   e0 e1 e2   the three TAIL SECTIONS (kind 'tentacle', so the generic grip, coil, hack, radar and aim code works on them); each is a chain from its ROOT (the joint on the head's side, on the loop round the ship) to its TIP (the tail's side: the end that coils
//              round a deck end); the glowing JOINTS at their ends are where a shell does most; cut one off and the eel is shorter
//   e3         the NECK section (kind 'neck': the head's, it is not cut off)
//   head       rides the neck's tip;  mouth  (kind 'mouth') rides the head's tip: the wide maw bombs fall into
//   crown      (kind 'mantle') a crest standing UP from the head: the landing strip a boarder walks in the Aether's low gravity
//   lamp       (kind 'heart', hidden from guns) the LANTERN at the crown's top: the lure, and the weak point a boarder strikes with a sword
// The body is laid out by creatureEel.js every step (follow-the-leader: `manual` parts are not solved by creature.js); a tail section that reaches into a grip is an ordinary IK limb until it lets go.
// Sizes are config.CREATURES.EEL.BODY. Nothing wobbles: no sine anywhere.
import { config } from '../../../config.js';
import { createCreatureBody } from '../creature.js';

// The body definition (a function, so it always reads the live config).
export function eelDef() {
  const E = config.CREATURES.EEL, B = E.BODY, n = B.SECTIONS * B.PER;
  const rad = (joint) => B.R[0] * Math.pow(B.R[1] / B.R[0], joint / n); // the body's radius at a joint: R[0] at the tail's tip, R[1] at the neck
  const chain = (k) => { // the segments of section k: the neck section runs tail -> head, a tail section from its root on the head's side to its tip (so it is thickest at the root)
    const out = [];
    for (let j = 0; j < B.PER; j++) {
      if (k === B.SECTIONS - 1) { const g = k * B.PER + j; out.push({ len: B.LEN, r: rad(g), r1: rad(g + 1) }); } else { const g = k * B.PER + (B.PER - 1 - j); out.push({ len: B.LEN, r: rad(g + 1), r1: rad(g) }); }
    }
    return out;
  };
  const parts = [];
  for (let k = 0; k < B.SECTIONS - 1; k++) parts.push({ id: 'e' + k, kind: 'tentacle', hp: B.SECTION_HP, at: [0, 0], chain: chain(k), rest: [B.LEN, 0], bend: 0, swayMul: 0, pullBack: 0.1, pullLift: 0.04, layer: 'front' });
  parts.push({ id: 'e' + (B.SECTIONS - 1), kind: 'neck', hp: B.NECK_HP, at: [0, 0], chain: chain(B.SECTIONS - 1), rest: [1, 0], drive: true, layer: 'front' });
  parts.push({ id: 'head', kind: 'head', hp: B.HEAD.HP, at: [0, 0], shape: { ang: 0, len: B.HEAD.LEN, r: B.HEAD.R }, attach: { to: 'e' + (B.SECTIONS - 1), fwd: 0, side: 0 } });
  parts.push({ id: 'mouth', kind: 'mouth', hp: B.MOUTH.HP, at: [0, 0], shape: { ang: 0, len: 0, r: B.MOUTH.R }, attach: { to: 'head', fwd: -B.MOUTH.R * 0.3, side: 0 } });
  parts.push({ id: 'crown', kind: 'mantle', hp: B.CROWN.HP, at: [0, 0], shape: { ang: -Math.PI / 2, len: B.CROWN.LEN, r: B.CROWN.R } });
  parts.push({ id: 'lamp', kind: 'heart', hp: B.LAMP.HP, at: [0, 0], shape: { ang: 0, len: 0, r: B.LAMP.R }, hidden: true });
  return { kind: 'eel', hp: E.HP, parts };
}

// The body: created at x, y (the head's first place). The brain record rides along (body.eel, set up by creatureEel.js setupEel).
export function createEel(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(eelDef(), { x, y, seed, ...opts });
  body.puppet = { auto: false, closeAt: 0 };
  body.eel = {};
  for (const p of body.parts) {
    if (p.kind === 'tentacle' || p.kind === 'neck') p.art = 'eel'; // (creatureArt.js draws the scaled body, also a cut-off section tumbling as a chunk)
    if (p.limb || p.id === 'crown' || p.id === 'lamp') p.manual = true; // (creatureEel.js lays these out; a section reaching into a grip is solved by creature.js meanwhile)
  }
  return body;
}

// ---- what it says in each phase (the bar, the banners) ----
export const EEL_PHASES = {
  1: { name: 'IT CIRCLES', banner: null, hint: 'It circles the ship. Beware the gold lure; shoot the glowing joints, bomb the gaping maw.' },
  2: { name: 'IT COILS', banner: 'THE EEL TIGHTENS ITS LOOP! WATCH THE DECK ENDS - HACK THE COILS OFF!', hint: 'Two coils at once, and it holds her still.' },
  3: { name: 'IT THRASHES', banner: 'THE EEL THRASHES! THREE COILS - AND IT GAPES AGAIN SOONER!', hint: 'Three coils, faster swallows. End it.' },
};
export const eelPhaseName = (n) => (EEL_PHASES[n] || EEL_PHASES[1]).name;
export const EEL_MOUTH_TEXT = 'THE EEL GAPES - DROP BOMBS IN ITS MAW!';
