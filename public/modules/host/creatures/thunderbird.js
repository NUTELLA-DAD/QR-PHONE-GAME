// THE THUNDERBIRD (BOSSES.md 2.3, C.6b), body data and its stepped poses. The generic puppet is creature.js; the fight (flight, gusts, passes, perch, lightning dive, swallow, roost, the wins) is creatureBird.js.
// It is made of:
//   a TORSO (kind 'mantle', so boarding and the hook treat it as the body), a NECK of three feathered segments (a driven limb), a HEAD that rides the neck's tip and a BEAK on the head's tip,
//   two WINGS of five feather segments each (driven limbs, each with its own hp: pluck both and it falls), a TAIL FAN of three broad segments, two TALONS (driven limbs of two segments), and the GIZZARD
//   (kind 'heart': the weak point, hidden behind the breast feathers except while it glows after a swallowed bolt).
// The same recipe as the Drake: every limb is DRIVEN (creature.js pd.drive), the whole pose is chosen on the key clock (8 a second) from a named pose below and held until the next key, nothing wobbles.
// Sizes are config.CREATURES.THUNDERBIRD: with its wings spread it spans about 8000 px, three times the classic ship.
import { config } from '../../../config.js';
import { createCreatureBody, bodyVec } from '../creature.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The body definition (a function, so it always reads the live config).
export function birdDef() {
  const D = config.CREATURES.THUNDERBIRD;
  const chain = (n, len, r) => { // lengths and radii taper root to tip
    const out = [];
    for (let j = 0; j < n; j++) {
      const u = j / n, u1 = (j + 1) / n;
      out.push({ len: len[0] + (len[1] - len[0]) * (j / Math.max(1, n - 1)), r: r[0] * Math.pow(r[1] / r[0], u), r1: r[0] * Math.pow(r[1] / r[0], u1) });
    }
    return out;
  };
  const parts = [];
  parts.push({ id: 'wingF', kind: 'wing', hp: D.WING.HP, at: D.WING.AT[1], chain: chain(D.WING.SEGS, D.WING.LEN, D.WING.R), drive: true, rest: [-0.5, -0.8], bend: 0.3, layer: 'back' });
  parts.push({ id: 'talonF', kind: 'talon', hp: D.TALON.HP, at: D.TALON.AT[1], chain: chain(D.TALON.SEGS, D.TALON.LEN, D.TALON.R), drive: true, rest: [-0.6, 0.75], bend: -0.25, layer: 'back' });
  parts.push({ id: 'tail', kind: 'tail', hp: D.TAIL.HP, at: D.TAIL.AT, chain: chain(D.TAIL.SEGS, D.TAIL.LEN, D.TAIL.R), drive: true, rest: [-0.95, 0.12], bend: -0.2, layer: 'back' });
  parts.push({ id: 'torso', kind: 'mantle', hp: D.TORSO.HP, at: D.TORSO.AT, shape: { ang: 0, len: D.TORSO.LEN, r: D.TORSO.R } });
  parts.push({ id: 'neck', kind: 'neck', hp: D.NECK.HP, at: D.NECK.AT, chain: chain(D.NECK.SEGS, D.NECK.LEN, D.NECK.R), drive: true, rest: [0.9, -0.35], bend: 0.3, layer: 'front' });
  parts.push({ id: 'head', kind: 'head', hp: D.HEAD.HP, at: [0, 0], shape: { ang: 0, len: D.HEAD.LEN, r: D.HEAD.R }, attach: { to: 'neck', fwd: 0, side: 0 } });
  parts.push({ id: 'beak', kind: 'beak', hp: D.BEAK.HP, at: [0, 0], shape: { ang: 0, len: 0, r: D.BEAK.R }, attach: { to: 'head', fwd: D.HEAD.LEN - D.BEAK.R * 0.2, side: 0 } });
  parts.push({ id: 'gizzard', kind: 'heart', hp: D.GIZZARD.HP, at: D.GIZZARD.AT, shape: { ang: 0, len: 0, r: D.GIZZARD.R }, hidden: true });
  parts.push({ id: 'talonN', kind: 'talon', hp: D.TALON.HP, at: D.TALON.AT[0], chain: chain(D.TALON.SEGS, D.TALON.LEN, D.TALON.R), drive: true, rest: [-0.6, 0.75], bend: -0.25, layer: 'front' });
  parts.push({ id: 'wingN', kind: 'wing', hp: D.WING.HP, at: D.WING.AT[0], chain: chain(D.WING.SEGS, D.WING.LEN, D.WING.R), drive: true, rest: [-0.5, -0.8], bend: 0.3, layer: 'front' });
  return { kind: 'thunderbird', hp: D.HP, parts, onKey: birdKey };
}

// The wing's beat, one vector (forward, down; fractions of the wing's reach) a key: up, a half stroke, down, down, a half stroke back, ... The far wing follows a key behind and a little shorter.
const FLAP = [[-0.2, -0.97], [-0.5, -0.65], [-0.45, 0.5], [-0.25, 0.95], [-0.5, 0.45], [-0.6, -0.5]];

// The named poses: rot (the torso's pitch, nose up positive), neck / tail / talons ([forward, down] in fractions of their reach; 'aim' = along bd.aim), wings ('flap' | 'slow' | a vector),
// head (how far the head is tipped up, rad), fast (limbs snap to the pose instead of easing).
export const POSES = {
  cruise: { rot: 0.05, neck: [0.9, -0.35], tail: [-0.95, 0.1], talons: [-0.6, 0.75], wings: 'flap', head: 0.1 },
  rear: { rot: 0.3, neck: [0.45, -0.9], tail: [-0.8, -0.4], talons: [-0.5, 0.8], wings: [-0.35, -0.95], head: 0.5 }, // the wings rear back and up: a gust is coming, or it is calling the lightning down
  beat: { rot: -0.12, neck: [0.9, -0.1], tail: [-0.9, 0.35], talons: [-0.6, 0.75], wings: [-0.2, 0.97], head: -0.1, fast: true }, // the downstroke that makes the gust
  wind: { rot: 0.45, neck: [0.5, -0.9], tail: [-0.8, -0.5], talons: [-0.5, 0.8], wings: [-0.15, -0.98], head: 0.3 }, // the pass's start: wings held high
  dive: { rot: 0, neck: 'aim', ext: 0.99, tail: [-0.92, -0.1], talons: [0.5, 0.85], wings: [-0.9, 0.3], head: 0, fast: true }, // wings swept back, talons forward
  swallow: { rot: 0.6, neck: [0.12, -0.99], tail: [-0.8, 0.1], talons: [-0.5, 0.8], wings: [-0.3, -0.95], head: 1.1 }, // the head thrown back to the sky
  perch: { rot: 0.7, neck: [0.55, -0.8], tail: [-0.8, 0.5], talons: [0.2, 0.97], wings: 'slow', head: 0.25 },
  roost: { rot: 0.5, neck: [0.8, -0.45], tail: [-0.9, 0.3], talons: [0.12, 0.97], wings: [-0.92, -0.2], head: 0.2 }, // standing on its spire, the wings folded along the back
  liftoff: { rot: 0.7, neck: [0.6, -0.8], tail: [-0.8, 0.3], talons: [-0.3, 0.9], wings: 'flap', head: 0.3 },
  dying: { rot: -0.9, neck: [0.3, 0.8], tail: [-0.4, 0.8], talons: [0.3, 0.9], wings: [-0.2, 0.7], head: -0.6 },
};

// Where the tips of its talons hang from the body's centre in a standing pose, for a bird facing +x ({ x forward, y down }, px): it must be placed so that its feet touch the bag or the spire.
export function standOffset(poseName) {
  const D = config.CREATURES.THUNDERBIRD, P = POSES[poseName] || POSES.perch, reach = chainReach(D.TALON);
  let y = 0, x = 0;
  for (const at of D.TALON.AT) {
    const b = { f: 1, rot: P.rot }, root = bodyVec(b, at[0], at[1]), tip = bodyVec(b, P.talons[0] * reach, P.talons[1] * reach);
    y = Math.max(y, root.y + tip.y);
    x += (root.x + tip.x) / D.TALON.AT.length;
  }
  return { x, y };
}
const chainReach = (W) => { let r = 0; for (let j = 0; j < W.SEGS; j++) r += W.LEN[0] + (W.LEN[1] - W.LEN[0]) * (j / Math.max(1, W.SEGS - 1)); return r; };

// One key of the body: choose every limb's goal vector from the pose the fight asked for (body.bird.pose), and the torso's pitch. Only here may a goal change.
export function birdKey(body, key) {
  const bd = body.bird;
  if (!bd) return;
  const P = POSES[bd.pose] || POSES.cruise;
  body.rot = clamp((bd.pitch || 0) * (P.pitch === undefined ? 1 : P.pitch) + (P.rot || 0) + (bd.rotAdd || 0), -1.5, 1.5);
  if (key % 6 === 0) bd.sway = [(body.rng() * 2 - 1) * 0.07, (body.rng() * 2 - 1) * 0.05]; // a new stepped drift of the tail and neck every 6 keys (never a sine)
  const sw = bd.sway || [0, 0];
  const beat = P.wings === 'slow' ? Math.floor(key / 3) : key;
  for (const p of body.parts) {
    if (!p.limb || p.dead) continue;
    if (p.bend0 === undefined) p.bend0 = p.bend;
    p.bend = p.bend0 * body.f;
    p.ctl.fast = !!P.fast;
    let v;
    if (p.kind === 'wing') {
      const far = p.id === 'wingF';
      if (P.wings === 'flap' || P.wings === 'slow') {
        const f = FLAP[(beat + (far ? 5 : 0)) % FLAP.length];
        v = far ? [f[0] * 0.92, f[1] * 0.92] : f;
      } else v = far ? [P.wings[0] * 0.9, P.wings[1] * 0.9 - 0.06] : P.wings;
    } else if (p.kind === 'neck') {
      if (P.neck === 'aim') v = [Math.cos(bd.aim || 0) * P.ext, Math.sin(bd.aim || 0) * P.ext];
      else v = [P.neck[0] + sw[0], P.neck[1] + sw[1] * 0.6];
    } else if (p.kind === 'talon') {
      v = P.talons;
    } else {
      v = [P.tail[0] + sw[1], P.tail[1] + sw[0]];
    }
    p.rel.x = v[0];
    p.rel.y = v[1];
  }
  const head = body.parts.find((q) => q.kind === 'head');
  if (head) head.rotOff = -(P.head || 0) * body.f + (bd.headAdd || 0);
}

// The body: created at x, y, facing f (1 = toward +x). The brain record bd rides along (body.bird).
export function createBird(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(birdDef(), { x, y, seed, ...opts });
  body.puppet = { auto: false, closeAt: 0 };
  body.bird = { pose: 'cruise', pitch: 0, aim: 0, rotAdd: 0, headAdd: 0, sway: [0, 0] };
  return body;
}

// ---- what it says in each phase (the bar, the banners) ----
export const BIRD_PHASES = {
  1: { name: 'IT CIRCLES', banner: null, hint: 'Gusts, passes and perches. Pluck its wings; mortar it while it rests on a spire.' },
  2: { name: 'IT CALLS LIGHTNING', banner: 'THE THUNDERBIRD CALLS DOWN LIGHTNING! HOLD A ROD - MAN THE COIL!', hint: 'Lightning dives and swallowed bolts. Ground the bolts; a coil that drinks one fires it back, and the glowing gizzard is the weak point.' },
  3: { name: 'FRENZY', banner: 'THE THUNDERBIRD IS IN A FRENZY! FASTER BOLTS!', hint: 'Faster strikes; the gizzard glows longer.' },
};
export const birdPhaseName = (n) => (BIRD_PHASES[n] || BIRD_PHASES[1]).name;
