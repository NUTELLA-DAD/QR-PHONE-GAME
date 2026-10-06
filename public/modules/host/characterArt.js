// Builds and animates a character from separate sprite pieces (see art/ART_SPEC.md section 3):
// head, head_effort, head_ko, torso, arm, leg, tail, scarf, climb, ko, weapon, windup.
// Walking, carrying, swinging, station poses etc. are done here by rotating the arms and legs.
//
// Joint positions are in world units relative to the character's feet (0, 0), facing right.
// Each can be overridden per character in art/sprites/rig.json, e.g.
//   "crew/bulldog": { "scale": 0.5, "neck": { "x": 3, "y": -60 }, "armLength": 30 }

// Where each raider type's art lives (first folder that has art wins).
export const ENEMY_FOLDERS = {
  grunt: ['enemies/skeleton'],
  brute: ['enemies/devil'],
  sapper: ['enemies/skeleton-bomber', 'enemies/skeleton'],
  cutter: ['enemies/bat'],
};

const DEFAULT_RIG = {
  scale: 0.5, // world units per image pixel (art is 2x)
  hip: { x: 0, y: -28 }, // legs hang from here
  legSpread: 5, // front/back leg sideways offset
  torso: { x: 0, y: -44, px: 0.5, py: 0.5 }, // torso image centre
  shoulder: { x: 0, y: -56 }, // arms hang from here
  armSpread: 5,
  armLength: 32, // shoulder to hand, for placing held items
  neck: { x: 2, y: -58 }, // head sits on this (bottom-centre of the head image)
  headScale: 1, // make the head bigger/smaller than drawn (rubber-hose = big heads)
  tail: { x: -16, y: -36, px: 0.95, py: 0.6 },
  scarf: { x: -2, y: -62, px: 0.92, py: 0.3 },
  item: { px: 0.5, py: 0.85 }, // held tools are gripped near their bottom
};

const merge = (base, over) => {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(base[k] || {}), ...v } : v;
  return out;
};

// drawItem(item, x, y, swingAge): draws a placeholder held item when there's no item art.
export function createCharacterArt({ ctx, sprites, drawItem }) {
  const folderFor = (p) => {
    if (!p.type) return 'crew/' + p.species;
    return (ENEMY_FOLDERS[p.type] || []).find((f) => sprites.has(f + '/head')) || null;
  };

  // Draws the character if its art exists. Returns { top } (y of the head top, relative to the
  // feet) or null so the caller can draw the placeholder instead.
  const draw = (p, time, lift) => {
    const f = folderFor(p);
    if (!f || !sprites.has(f + '/head') || !sprites.has(f + '/torso')) return null;
    const R = merge(DEFAULT_RIG, sprites.rigFor(f));
    const s = R.scale;
    const face = p.face || 1;
    const now = performance.now();
    const swingAge = now - (p.swingT || -1e9);
    const effort = (p.fire && p.act && p.act.hold) || swingAge < 300 || p.windup > 0;
    const head = sprites.get(f + '/head');
    const headH = head.height * s * R.headScale;

    ctx.save();
    ctx.translate(p.x, p.y - lift);
    ctx.scale(face * (p.scale || 1), p.scale || 1);
    // Airborne / staggering / landing: lean or tumble about the middle of the body, squash on landing.
    if (p.rot) {
      ctx.translate(0, -30);
      ctx.rotate(p.rot * face);
      ctx.translate(0, 30);
    }
    if (p.squash > 0) ctx.scale(1 + 0.4 * p.squash, 1 - 0.35 * p.squash);

    // Whole-body poses, if drawn.
    const whole = p.ko > 0 ? 'ko' : p.climb ? 'climb' : p.windup > 0 ? 'windup' : null;
    if (whole && sprites.has(`${f}/${whole}`)) {
      const img = sprites.get(`${f}/${whole}`);
      const bob = whole === 'climb' ? Math.sin(time * 10) * 3 : 0;
      ctx.drawImage(img, (-img.width * s) / 2, -img.height * s + bob, img.width * s, img.height * s);
      ctx.restore();
      return { top: -img.height * s * (p.scale || 1) };
    }
    if (p.ko > 0) ctx.rotate(-1.4); // no ko.png: tip the assembled body over

    // Limb angles (radians; negative swings an arm/leg forward).
    const walk = p.moving ? Math.sin(time * 11) : 0;
    let frontLeg = walk * 0.55;
    let backLeg = -walk * 0.55;
    let frontArm = -walk * 0.5;
    let backArm = walk * 0.5;
    if (p.fly || p.tumble) {
      frontArm = backArm = -2.9 + Math.sin(time * 14) * 0.25; // arms up, flailing
      frontLeg = 0.5 + Math.sin(time * 14) * 0.2;
      backLeg = -0.4 - Math.sin(time * 14) * 0.2;
    } else if (p.air) {
      frontArm = backArm = -2.6; // mid-hop: arms up
    } else if (p.climb) {
      frontArm = -2.8 + Math.sin(time * 10) * 0.4;
      backArm = -2.8 - Math.sin(time * 10) * 0.4;
      frontLeg = Math.sin(time * 10) * 0.3;
      backLeg = -frontLeg;
    } else if (p.lock) {
      frontArm = backArm = -1.3; // hands on the controls
    } else if (p.windup > 0) {
      frontArm = -2.9;
    } else if (swingAge < 250) {
      frontArm = -2.7 + (swingAge / 250) * 2.2; // big overhead chop
    } else if (p.carry === 'ammo' || p.carry === 'coal') {
      frontArm = backArm = -1.1; // hugging a load
    } else if (p.carry || p.weapon) {
      frontArm = -0.6; // holding a tool ready
    } else if (p.fire && p.act && p.act.hold) {
      frontArm = -1.2 + Math.sin(time * 18) * 0.3; // working away
    }
    const bob = p.moving ? Math.abs(walk) * 3 : Math.sin(time * 3) * 0.8;

    const dark = (k) => sprites.tinted(f + '/' + k, '#a8a8a8');
    const limb = (k, x, y, rot, darker) => {
      const img = darker ? dark(k) : sprites.get(f + '/' + k);
      if (img) sprites.pivot(ctx, null, x, y, 0.5, 0.06, rot, s, img);
    };
    const hip = R.hip;
    const sh = { x: R.shoulder.x, y: R.shoulder.y - bob };

    limb('arm', sh.x - R.armSpread, sh.y, backArm, true);
    limb('leg', hip.x - R.legSpread, hip.y, backLeg, true);
    if (sprites.has(f + '/tail')) sprites.pivot(ctx, f + '/tail', R.tail.x, R.tail.y - bob, R.tail.px, R.tail.py, Math.sin(time * 6) * 0.15, s);
    limb('leg', hip.x + R.legSpread, hip.y, frontLeg, false);
    sprites.pivot(ctx, f + '/torso', R.torso.x, R.torso.y - bob, R.torso.px, R.torso.py, 0, s);
    const scarf = p.color && !p.type ? sprites.tinted(f + '/scarf', p.color) : sprites.get(f + '/scarf');
    if (scarf) sprites.pivot(ctx, null, R.scarf.x, R.scarf.y - bob, R.scarf.px, R.scarf.py, Math.sin(time * 9) * 0.08, s, scarf);
    const headKey = p.ko > 0 && sprites.has(f + '/head_ko') ? '/head_ko' : effort && sprites.has(f + '/head_effort') ? '/head_effort' : '/head';
    sprites.pivot(ctx, f + headKey, R.neck.x, R.neck.y - bob, 0.5, 0.92, 0, s * R.headScale);

    // Front arm, with whatever is in hand.
    const hx = sh.x + R.armSpread - Math.sin(frontArm) * R.armLength;
    const hy = sh.y + Math.cos(frontArm) * R.armLength;
    const held = p.type ? (sprites.has(f + '/weapon') ? f + '/weapon' : null) : p.carry ? 'items/' + p.carry : null;
    const load = p.carry === 'ammo' || p.carry === 'coal';
    const placeholder = held && !sprites.has(held) && !p.type;
    if (held && load && !placeholder) sprites.pivot(ctx, held, hx + 4, hy - 4, 0.5, 0.5, 0, s);
    limb('arm', sh.x + R.armSpread, sh.y, frontArm, false);
    if (held && !load && !placeholder) sprites.pivot(ctx, held, hx, hy, R.item.px, R.item.py, frontArm + Math.PI, s);
    if (placeholder && drawItem) drawItem(p.carry, hx, hy, swingAge);

    ctx.restore();
    return { top: (R.neck.y - bob - headH * 0.92) * (p.scale || 1) };
  };

  return { draw, folderFor };
}
