// THE CINDER DRAKE (BOSSES.md 2.2, C.6a), body data and its stepped poses. The generic puppet is creature.js; the fight (flight, breath, swoop, perch, crash and crawl, the wins) is creatureDrake.js.
// It is made of:
//   a TORSO (kind 'mantle', so boarding and the hook treat it as the body), a NECK of six rigid segments (a driven limb), a HEAD that rides the neck's tip and a MOUTH (the snout, where the throat glows),
//   two WINGS of five membrane segments each (driven limbs, each with its own hp: tear one off and it crashes), a TAIL of six segments, and the HEART behind the breast scales (hidden until opened).
// Every limb is DRIVEN (creature.js pd.drive): there is no sway; the whole pose is chosen on the key clock (8 a second) from a named pose below and held until the next key, so nothing wobbles. The picture eases
// toward the held pose a little (the same as the Kraken's limbs). Sizes are config.CREATURES.DRAKE: with its wings spread it spans about 8000 px, three times the classic ship.
import { config } from '../../../config.js';
import { createCreatureBody, setMouth } from '../creature.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The body definition (a function, so it always reads the live config).
export function drakeDef() {
  const D = config.CREATURES.DRAKE;
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
  parts.push({ id: 'tail', kind: 'tail', hp: D.TAIL.HP, at: D.TAIL.AT, chain: chain(D.TAIL.SEGS, D.TAIL.LEN, D.TAIL.R), drive: true, rest: [-0.95, 0.12], bend: -0.25, layer: 'back' });
  parts.push({ id: 'torso', kind: 'mantle', hp: D.TORSO.HP, at: D.TORSO.AT, shape: { ang: 0, len: D.TORSO.LEN, r: D.TORSO.R } });
  parts.push({ id: 'neck', kind: 'neck', hp: D.NECK.HP, at: D.NECK.AT, chain: chain(D.NECK.SEGS, D.NECK.LEN, D.NECK.R), drive: true, rest: [0.93, -0.3], bend: 0.35, layer: 'front' });
  parts.push({ id: 'head', kind: 'head', hp: D.HEAD.HP, at: [0, 0], shape: { ang: 0, len: D.HEAD.LEN, r: D.HEAD.R }, attach: { to: 'neck', fwd: 0, side: 0 } });
  parts.push({ id: 'mouth', kind: 'mouth', hp: D.MOUTH.HP, at: [0, 0], shape: { ang: 0, len: 0, r: D.MOUTH.R }, attach: { to: 'head', fwd: -D.MOUTH.R * 0.3, side: 0 } });
  parts.push({ id: 'heart', kind: 'heart', hp: D.HEART.HP, at: D.HEART.AT, shape: { ang: 0, len: 0, r: D.HEART.R }, hidden: true });
  parts.push({ id: 'wingN', kind: 'wing', hp: D.WING.HP, at: D.WING.AT[0], chain: chain(D.WING.SEGS, D.WING.LEN, D.WING.R), drive: true, rest: [-0.5, -0.8], bend: 0.3, layer: 'front' });
  return { kind: 'drake', hp: D.HP, parts, onKey: drakeKey };
}

// The wing's beat, one vector (forward, down; fractions of the wing's reach) a key: up, a half stroke, down, down, a half stroke back, ... The far wing follows a key behind and a little shorter.
const FLAP = [[-0.2, -0.97], [-0.5, -0.65], [-0.45, 0.5], [-0.25, 0.95], [-0.5, 0.45], [-0.6, -0.5]];

// The named poses: rot (the torso's pitch, nose up positive), neck / tail ([forward, down] in fractions of their reach; 'aim' = along dk.aim), wings ('flap' | 'slow' | a vector), head (how far the head is tipped up, rad),
// ext (the neck's stretch when aimed), fast (limbs snap to the pose instead of easing).
export const POSES = {
  cruise: { rot: 0.06, neck: [0.93, -0.3], tail: [-0.95, 0.12], wings: 'flap', head: 0.15 },
  glow: { rot: 0.12, neck: 'aim', ext: 0.85, tail: [-0.8, -0.35], wings: 'flap', head: 0.4 }, // the breath is drawn in: the neck draws back toward the target, the head tipped up, the throat glowing
  breath: { rot: -0.02, neck: 'aim', ext: 0.85, tail: [-0.93, 0.2], wings: 'flap', head: 0, fast: true },
  recover: { rot: 0.1, neck: [0.7, 0.55], tail: [-0.9, 0.1], wings: 'flap', head: -0.25 },
  cough: { rot: 0.4, neck: [-0.1, -0.98], tail: [-0.7, -0.6], wings: [-0.3, -0.9], head: 0.8 },
  wind: { rot: 0.45, neck: [0.5, -0.9], tail: [-0.8, -0.5], wings: [-0.15, -0.98], head: 0.3 }, // the swoop's start: wings held high
  dive: { rot: 0, neck: 'aim', ext: 0.99, tail: [-0.92, -0.1], wings: [-0.9, 0.3], head: 0, fast: true }, // wings swept back
  perch: { rot: 1.05, neck: [0.5, -0.86], tail: [-0.8, 0.45], wings: 'slow', head: 0.25 },
  lash: { rot: 1.05, neck: [0.5, -0.86], tail: 'aim', ext: 1, wings: 'slow', head: 0.25, fast: true },
  liftoff: { rot: 0.7, neck: [0.6, -0.8], tail: [-0.8, 0.3], wings: 'flap', head: 0.3 },
  crash: { rot: -0.6, neck: [0.45, 0.6], tail: [-0.55, 0.65], wings: [-0.25, -0.9], head: -0.3 },
  crawl: { rot: -0.1, neck: [0.85, -0.3], tail: [-0.97, 0.06], wings: [-0.92, -0.22], head: 0.55 }, // lying on the ground, the neck raised, the wings folded along its back
  gape: { rot: 0.05, neck: [0.8, -0.45], tail: [-0.97, 0.06], wings: [-0.92, -0.22], head: 1.1 }, // the head thrown back, the mouth wide to the sky
  rear: { rot: 0.6, neck: [0.14, -0.99], tail: [-0.9, 0.2], wings: [-0.2, -0.97], head: 0.9 },
  lunge: { rot: -0.05, neck: 'aim', ext: 1, tail: [-0.97, 0.06], wings: [-0.92, -0.22], head: 0, fast: true },
  dying: { rot: -0.7, neck: [0.3, 0.8], tail: [-0.4, 0.8], wings: [-0.2, 0.6], head: -0.6 },
};

// One key of the body: choose every limb's goal vector from the pose the fight asked for (body.drake.pose), and the torso's pitch. Only here may a goal change.
export function drakeKey(body, key) {
  const dk = body.drake;
  if (!dk) return;
  const P = POSES[dk.pose] || POSES.cruise;
  body.rot = clamp((dk.pitch || 0) * (P.pitch === undefined ? 1 : P.pitch) + (P.rot || 0) + (dk.rotAdd || 0), -1.5, 1.5);
  if (key % 6 === 0) dk.sway = [(body.rng() * 2 - 1) * 0.07, (body.rng() * 2 - 1) * 0.05]; // a new stepped drift of the tail and neck every 6 keys (never a sine)
  const sw = dk.sway || [0, 0];
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
      if (P.neck === 'aim') v = [Math.cos(dk.aim || 0) * P.ext, Math.sin(dk.aim || 0) * P.ext];
      else v = [P.neck[0] + sw[0], P.neck[1] + sw[1] * 0.6];
    } else {
      if (P.tail === 'aim') v = [Math.cos(dk.tailAim || 0) * P.ext, Math.sin(dk.tailAim || 0) * P.ext];
      else v = [P.tail[0] + sw[1], P.tail[1] + sw[0]];
    }
    p.rel.x = v[0];
    p.rel.y = v[1];
  }
  const head = body.parts.find((q) => q.kind === 'head');
  if (head) head.rotOff = -(P.head || 0) * body.f + (dk.headAdd || 0);
}

// The body: created at x, y, facing f (1 = toward +x). The brain record dk rides along (body.drake).
export function createDrake(x = 0, y = 0, seed = 1, opts = {}) {
  const body = createCreatureBody(drakeDef(), { x, y, seed, ...opts });
  body.puppet = { auto: false, closeAt: 0 };
  body.drake = { pose: 'cruise', pitch: 0, aim: 0, tailAim: 0, rotAdd: 0, headAdd: 0, sway: [0, 0] };
  return body;
}

export const openMouth = (body, open) => { const m = body.parts.find((p) => p.kind === 'mouth'); if (m) setMouth(body, m, open); };

// ---- what it says in each phase (the bar, the banners) ----
export const DRAKE_PHASES = {
  1: { name: 'IT FLIES', banner: null, hint: 'Breath, swoops and perches. Shells into the glowing mouth choke it; flak tears the wings.' },
  2: { name: 'IT CRAWLS', banner: 'THE DRAKE CRASHES! IT CRAWLS - BOMBS IN ITS MOUTH!', hint: 'Grounded: breath upward, lunges, a gaping mouth. Bomb it, harpoon it into a lava spout.' },
  3: { name: 'DESPERATE', banner: "THE DRAKE IS DESPERATE - ITS HEART IS OPEN WHEN IT REARS!", hint: 'Faster breath. While it rears the heart shows.' },
};
export const drakePhaseName = (n) => (DRAKE_PHASES[n] || DRAKE_PHASES[1]).name;
export const DRAKE_MOUTH_TEXT = 'MOUTH GAPES - BOMBS IN!';
