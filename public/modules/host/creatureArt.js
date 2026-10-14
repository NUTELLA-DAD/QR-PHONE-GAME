// Drawing for the giant creatures (BOSSES.md 3.3), in the storybook gouache style: one ink colour (config.INK), flat fills, one soft highlight band, no gradients, no shadowBlur.
// Enemy shape language, like the gunships: angular, spiky and a bit lopsided, charcoal spikes, bone-coloured triangular suckers in rows.
//   createCreatureArt({ ctx, makeCanvas }) -> { draw(body, { zoom, dpr }), drawBehind(body, view), drawLimb(part, view), stats, clear }
// Each segment TYPE is baked ONCE per zoom bucket (half octaves) into an offscreen canvas and then blitted with translate / rotate (a Kraken is about 60 blits a frame).
// A limb's segments are drawn root to tip, each with a rounded base cap, so every joint reads as a ball-and-socket ring. A tentacle's sucker side is the inside of its curl.
// Three looks per picture: lit, dim (a part not lit by a searchlight in a dark sky: fills mix toward night blue) and flash (a hit: fills mix toward white).
// The ink is a WORLD-sized line (config.CREATURES.ART.INK_W): the creature is drawn far zoomed out, so it needs to be much thicker than OUTLINE.MAIN.
import { config } from '../../config.js';

const A = config.CREATURES.ART;
const INK = config.INK;
const BONE = '#e8dcc0'; // the same bone and charcoal the gunships use (gunshipArt.js)
const CHAR = '#2f2a2e';
const HI = [255, 250, 232, 0.45]; // the soft highlight band (shipArt.js)
// The Kraken's colours: a bruised purple skin, a pale belly, red mouth.
const SKIN = '#6a2d49', SKIN_DARK = '#46203a', BELLY = '#b9708a', FIN = '#52284a', EYE = '#f0c64a', MOUTH_IN = '#6e1a28', HEART = '#c43a45', FLESH = '#d98a95';
const NIGHT = '#141a2c', WHITE = '#fff4e0';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixCache = new Map();
function mix(hex, toward, t) { // hex -> toward by t, as a '#rrggbb'
  const key = hex + toward + t;
  let out = mixCache.get(key);
  if (!out) {
    const a = hexRgb(hex), b = hexRgb(toward);
    out = '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
    mixCache.set(key, out);
  }
  return out;
}
// A colour picker for a look: lit = as is, dim = toward night, flash = toward white.
const looks = {
  lit: (c) => c,
  dim: (c) => mix(c, NIGHT, A.DIM),
  flash: (c) => mix(c, WHITE, A.FLASH),
};
const hiColor = (look) => `rgba(${HI[0]},${HI[1]},${HI[2]},${look === 'dim' ? HI[3] * 0.4 : HI[3]})`;

const defaultCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// path helpers (on a baked canvas g, world units)
function poly(g, pts, fill, ink = true, lw = A.INK_W) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (ink) {
    g.lineWidth = lw;
    g.stroke();
  }
}
const tri = (g, x1, y1, x2, y2, x3, y3, fill, lw) => poly(g, [[x1, y1], [x2, y2], [x3, y3]], fill, true, lw);

export function createCreatureArt({ ctx, makeCanvas = defaultCanvas } = {}) {
  const stats = { blits: 0, bakes: 0 };
  const buckets = new Map(); // zoom bucket -> Map(key -> picture)
  let cache = null, scale = 1;

  // Bake a picture covering the rectangle (x0, y0)-(x1, y1) of the local frame at `scale` pixels per world unit.
  function bake(x0, y0, x1, y1, drawFn) {
    stats.bakes++;
    const w = x1 - x0, h = y1 - y0;
    const pw = Math.max(2, Math.ceil(w * scale)), ph = Math.max(2, Math.ceil(h * scale));
    const cv = makeCanvas(pw, ph);
    const g = cv.getContext('2d');
    g.scale(pw / w, ph / h);
    g.translate(-x0, -y0);
    g.strokeStyle = INK;
    g.lineWidth = A.INK_W;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    drawFn(g);
    return { cv, x: x0, y: y0, w, h };
  }
  const get = (key, make) => {
    let pic = cache.get(key);
    if (!pic) {
      pic = make();
      cache.set(key, pic);
    }
    return pic;
  };
  const blit = (pic) => {
    stats.blits++;
    ctx.drawImage(pic.cv, pic.x, pic.y, pic.w, pic.h);
  };

  // ---- the pictures ---------------------------------------------------------------------------------------------------------------------------------------------
  // One tentacle segment: local frame starts at the base joint, points along +x. mode: 'mid' | 'tip' (a spike) | 'cut' (a severed stump's flat end).
  function segPic(s, mode, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`seg|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${mode}|${look}`, () => {
      const col = looks[look];
      const rm = ((r0 + r1) / 2) * 1.12; // the swell in the middle
      const edge = (x) => { const u = clamp(x / L, 0, 1); return r0 + (r1 - r0) * u + (rm - (r0 + r1) / 2) * 4 * u * (1 - u); };
      const tipX = L + r1 * 2.8;
      const spike = Math.max(12, r0 * 0.55);
      const ns = clamp(Math.round(L / (rm * 1.3)), 1, 4);
      const pad = A.INK_W * 1.5;
      return bake(-r0 - pad, -rm - spike - pad, (mode === 'tip' ? tipX : L) + pad, rm + Math.max(10, rm * 0.4) + pad, (g) => {
        // the body: round base cap, ridged back, flat or pointed end
        g.beginPath();
        g.moveTo(0, -r0);
        g.lineTo(L * 0.5, -rm);
        g.lineTo(L, -r1);
        if (mode === 'tip') g.lineTo(tipX, 0);
        g.lineTo(L, r1);
        g.lineTo(L * 0.5, rm * 0.98);
        g.lineTo(0, r0);
        g.arc(0, 0, r0, Math.PI / 2, (Math.PI * 3) / 2);
        g.closePath();
        g.fillStyle = col(SKIN);
        g.fill();
        g.save();
        g.clip();
        g.fillStyle = col(BELLY); // the pale belly strip along the sucker side
        poly(g, [[-r0 * 1.2, r0 * 0.3], [L * 0.5, rm * 0.3], [L, r1 * 0.3], [tipX, r1 * 0.3], [tipX, rm * 3], [-r0 * 1.2, rm * 3]], col(BELLY), false);
        g.fillStyle = hiColor(look); // one highlight band along the back
        poly(g, [[r0 * 0.1, -0.8 * r0], [L * 0.5, -0.82 * rm], [L * 0.92, -0.8 * r1], [L * 0.92, -0.5 * r1], [L * 0.5, -0.55 * rm], [r0 * 0.1, -0.55 * r0]], hiColor(look), false);
        g.restore();
        g.beginPath();
        g.moveTo(0, -r0);
        g.lineTo(L * 0.5, -rm);
        g.lineTo(L, -r1);
        if (mode === 'tip') g.lineTo(tipX, 0);
        g.lineTo(L, r1);
        g.lineTo(L * 0.5, rm * 0.98);
        g.lineTo(0, r0);
        g.arc(0, 0, r0, Math.PI / 2, (Math.PI * 3) / 2);
        g.closePath();
        g.lineWidth = A.INK_W;
        g.stroke();
        // a charcoal back spike, swept toward the tip
        tri(g, L * 0.45, -edge(L * 0.45) + 2, L * 0.82, -edge(L * 0.82) + 2, L * 0.36, -edge(L * 0.45) - spike, col(CHAR), A.INK_W * 0.7);
        // suckers: a row of bone triangles on the inner edge, and a smaller row inside the belly
        for (let k = 0; k < ns; k++) {
          const x = (L * (k + 0.5)) / ns, e = edge(x), rs = Math.max(7, e * 0.36);
          tri(g, x - rs * 0.9, e - rs * 0.3, x + rs * 0.9, e - rs * 0.3, x + rs * 0.3, e + rs * 1.3, col(BONE), A.INK_W * 0.7);
          const x2 = x + L / ns / 2;
          if (x2 < L - rs) tri(g, x2 - rs * 0.5, e * 0.45, x2 + rs * 0.5, e * 0.45, x2 + rs * 0.1, e * 0.45 + rs * 0.8, col(BONE), A.INK_W * 0.55);
        }
        if (mode === 'cut') { // the cut end: raw flesh
          g.beginPath();
          g.ellipse(L, 0, Math.max(6, r1 * 0.35), r1, 0, 0, Math.PI * 2);
          g.fillStyle = col(FLESH);
          g.fill();
          g.lineWidth = A.INK_W * 0.8;
          g.stroke();
        }
      });
    });
  }

  // The mantle (the big head sack): local frame starts at the capsule's top end and points along +x (the axis, in the world it points down).
  // Angular, lopsided: a crown, two uneven fins, a ragged skirt, charcoal crest spikes, scale marks. +y is the lit (highlight) side.
  function mantlePic(s, look) {
    const L = s.len, W = s.r;
    return get(`mantle|${Math.round(L)}|${Math.round(W)}|${look}`, () => {
      const col = looks[look];
      const pad = A.INK_W * 1.5;
      return bake(-1.75 * W - pad, -2.05 * W - pad, L + 0.8 * W + pad, 1.85 * W + pad, (g) => {
        // fins first (behind)
        poly(g, [[0, -0.8 * W], [-0.55 * W, -1.95 * W], [0.35 * L, -0.95 * W]], col(FIN));
        poly(g, [[0.05 * L, 0.8 * W], [-0.2 * W, 1.7 * W], [0.4 * L, 0.95 * W]], col(FIN));
        poly(g, [[0.55 * L, -0.9 * W], [0.62 * L, -1.55 * W], [0.9 * L, -0.85 * W]], col(FIN));
        const body = [
          [-1.5 * W, 0.1 * W], [-0.9 * W, -0.45 * W], [-0.3 * W, -0.75 * W], [0.15 * L, -1.0 * W], [0.5 * L, -0.95 * W], [0.85 * L, -0.8 * W], [L + 0.1 * W, -0.9 * W],
          [L + 0.35 * W, -0.55 * W], [L + 0.05 * W, -0.4 * W], [L + 0.45 * W, -0.2 * W], [L + 0.1 * W, 0], [L + 0.55 * W, 0.2 * W], [L + 0.1 * W, 0.4 * W], [L + 0.4 * W, 0.55 * W], [L, 0.85 * W],
          [0.85 * L, 0.95 * W], [0.5 * L, 1.0 * W], [0.15 * L, 0.9 * W], [-0.3 * W, 0.7 * W], [-0.9 * W, 0.35 * W],
        ];
        poly(g, body, col(SKIN));
        g.save();
        g.beginPath();
        body.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[-2 * W, 0.2 * W], [L * 0.5, 0.25 * W], [L + W, 0.2 * W], [L + W, 1.4 * W], [-2 * W, 1.4 * W]], col(SKIN_DARK), false); // the shaded flank
        poly(g, [[-0.2 * W, 0.55 * W], [0.2 * L, 0.45 * W], [0.8 * L, 0.55 * W], [0.8 * L, 0.68 * W], [0.2 * L, 0.58 * W], [-0.2 * W, 0.68 * W]], hiColor(look), false); // the highlight band
        for (const [x, y, k] of [[0.2, -0.3, 0.16], [0.45, -0.1, 0.12], [0.62, -0.5, 0.18], [0.3, -0.62, 0.11], [0.75, 0.0, 0.14], [0.1, 0.0, 0.1], [0.55, 0.3, 0.1]]) { // scale marks
          tri(g, x * L - k * W, y * W + k * W * 0.6, x * L + k * W * 0.9, y * W - k * W * 0.2, x * L + k * W * 0.1, y * W - k * W * 0.9, col(SKIN_DARK), A.INK_W * 0.5);
        }
        g.restore();
        poly(g, body, null);
        for (const [x, k] of [[0.08, 0.34], [0.3, 0.3], [0.56, 0.36], [0.8, 0.26]]) { // charcoal crest spikes along the back
          const e = 1.0 * W;
          tri(g, x * L - k * W * 0.5, -e, x * L + k * W * 0.6, -e, x * L - k * W * 0.7, -e - k * W * 1.4, col(CHAR), A.INK_W * 0.7);
        }
      });
    });
  }

  // An eye: centred on its point, angry brow lid on the upper outer side. Unlit it is a dull dark disc (the dim look); the caller mirrors the other eye.
  function eyePic(R, look) {
    return get(`eye|${Math.round(R)}|${look}`, () => {
      const col = looks[look];
      const pad = A.INK_W * 1.5;
      return bake(-1.3 * R - pad, -1.35 * R - pad, 1.35 * R + pad, 1.2 * R + pad, (g) => {
        g.beginPath();
        g.arc(0, 0, R, 0, Math.PI * 2);
        g.fillStyle = col(EYE);
        g.fill();
        g.stroke();
        poly(g, [[0, -0.75 * R], [0.24 * R, 0], [0, 0.75 * R], [-0.24 * R, 0]], col(CHAR), false); // a slit pupil
        g.beginPath();
        g.arc(-0.4 * R, -0.3 * R, 0.14 * R, 0, Math.PI * 2);
        g.fillStyle = col('#fff6d8');
        g.fill();
        poly(g, [[-1.2 * R, -0.15 * R], [-0.7 * R, -1.3 * R], [1.3 * R, -0.95 * R], [0.2 * R, -0.5 * R]], col(CHAR)); // the angry brow lid
      });
    });
  }

  // The beak, pointing down (+y); state 0 shut, 1 half open, 2 wide open. Centred on the mouth point.
  function mouthPic(R, state, look) {
    return get(`mouth|${Math.round(R)}|${state}|${look}`, () => {
      const col = looks[look];
      const gap = [0, 0.35, 0.85][state] * R;
      const pad = A.INK_W * 1.5;
      return bake(-1.5 * R - pad, -1.3 * R - pad, 1.5 * R + pad, 2.3 * R + pad, (g) => {
        if (gap > 0) { // the dark throat, ringed with teeth
          poly(g, [[-0.85 * R, -0.25 * R], [0.9 * R, -0.25 * R], [0.7 * R, gap + 0.55 * R], [-0.7 * R, gap + 0.6 * R]], col(MOUTH_IN));
          for (let k = 0; k < 5; k++) {
            const x = (-0.72 + k * 0.36) * R;
            tri(g, x - 0.13 * R, -0.2 * R, x + 0.13 * R, -0.2 * R, x, 0.12 * R + gap * 0.4, col(BONE), A.INK_W * 0.6);
            if (gap > 0.5 * R) tri(g, x - 0.12 * R, gap + 0.5 * R, x + 0.12 * R, gap + 0.5 * R, x + 0.02 * R, gap + 0.2 * R, col(BONE), A.INK_W * 0.6);
          }
        }
        // lower mandible (drops with the gap), then the hooked upper beak (lifts a little)
        poly(g, [[-0.75 * R, gap + 0.1 * R], [0.8 * R, gap + 0.15 * R], [0.1 * R, gap + 0.95 * R]], col(BONE));
        const up = -gap * 0.3;
        poly(g, [[-1.1 * R, up - 0.55 * R], [1.2 * R, up - 0.5 * R], [0.9 * R, up + 0.3 * R], [0.15 * R, up + 1.2 * R], [-0.35 * R, up + 0.55 * R], [-0.95 * R, up + 0.2 * R]], col(BONE));
        poly(g, [[-0.9 * R, up - 0.3 * R], [0.95 * R, up - 0.25 * R], [0.8 * R, up - 0.05 * R], [-0.8 * R, up - 0.08 * R]], hiColor(look), false); // highlight band
        tri(g, -0.1 * R, up + 0.1 * R, 0.55 * R, up + 0.12 * R, 0.14 * R, up + 1.0 * R, col(CHAR), A.INK_W * 0.6); // dark hook inside
      });
    });
  }

  function heartPic(R, look) {
    return get(`heart|${Math.round(R)}|${look}`, () => {
      const col = looks[look];
      const pad = A.INK_W * 1.5;
      return bake(-1.2 * R - pad, -1.2 * R - pad, 1.2 * R + pad, 1.3 * R + pad, (g) => {
        poly(g, [[0, 1.2 * R], [-1.0 * R, 0.1 * R], [-0.8 * R, -0.7 * R], [-0.2 * R, -0.8 * R], [0, -0.35 * R], [0.25 * R, -0.85 * R], [0.9 * R, -0.65 * R], [1.0 * R, 0.15 * R]], col(HEART));
        poly(g, [[-0.6 * R, -0.45 * R], [-0.3 * R, -0.6 * R], [-0.25 * R, -0.3 * R]], hiColor(look), false);
      });
    });
  }

  // ================================================================ THE CINDER DRAKE (C.6a) ================================================================
  // The same recipe as the Kraken (rigid pictures baked once per zoom, blitted and rotated; stepped poses from the sim, nothing wobbles): charred red-brown scales, an ember-orange belly, charcoal horns and back
  // spikes, bat wings of five membrane panels on a bone, a head with a hinged lower jaw and a throat that glows before the breath. Facing +x in its own picture; the mirror (body.f) flips y.
  const D_SCALE = '#7a2e24', D_SCALE_DK = '#4e1c18', D_BELLY = '#e0a04a', D_WING = '#c9582e', D_WING_DK = '#7f2d20', D_BONE = '#4a2a2a', D_HORN = '#2f2a2e', D_TOOTH = '#efe2c0';
  const D_EYE = '#ffd23f', D_MOUTH = '#6e1a14', D_GLOW = '#ff8a1c', D_GLOW_IN = '#ffe27a', D_PLATE = '#5a2418', D_FLESH = '#d98a95';
  let curF = 1; // which way the body being drawn faces (the picture of a segment picks its sides by it)
  // Does a segment's local +y point backward (toward the tail) or forward in the world? flip = the picture must be mirrored so that its +y side faces the wanted way.
  const sideFlip = (s, wantBackward) => { const xc = -Math.sin(s.ang) * curF; return wantBackward ? xc > 0.05 : xc < -0.05; };

  // A wing panel: the leading bone along the top, the membrane hanging below it (the trailing edge scalloped), a darker fold.
  function wingPic(s, mode, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`dwing|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${mode}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-r0 * 0.5 - pad, -r0 * 1.0 - pad, L + r1 * 2.6 + pad, r0 * 1.5 + pad, (g) => {
        const mid = (r0 + r1) / 2;
        poly(g, [[0, -0.8 * r0], [L, -0.8 * r1], [L + 0.25 * r1, 0.5 * r1], [L * 0.8, 1.1 * mid], [L * 0.55, 0.7 * mid], [L * 0.3, 1.2 * mid], [0, 1.0 * r0]], col(D_WING));
        g.save();
        g.beginPath();
        g.rect(-r0, -r0 * 1.2, L + r1 * 2, r0 * 3);
        g.clip();
        poly(g, [[0, 0.35 * r0], [L * 0.5, 0.3 * mid], [L, 0.2 * r1], [L, 0.5 * r1], [L * 0.5, 0.7 * mid], [0, 1.0 * r0]], col(D_WING_DK), false); // the shaded fold
        poly(g, [[0, -0.7 * r0], [L, -0.7 * r1], [L, -0.45 * r1], [0, -0.45 * r0]], hiColor(look), false); // the highlight along the bone
        g.restore();
        g.strokeStyle = col(D_BONE); // the finger strut inside the membrane
        g.lineWidth = Math.max(8, r1 * 0.14);
        g.beginPath();
        g.moveTo(L * 0.1, -0.3 * r0);
        g.lineTo(L * 0.75, 0.9 * mid);
        g.stroke();
        g.strokeStyle = INK;
        g.beginPath(); // the leading bone: a thick inked rod, a knuckle at the joint
        g.lineWidth = Math.max(16, r1 * 0.5);
        g.moveTo(0, -0.8 * r0);
        g.lineTo(L, -0.8 * r1);
        g.stroke();
        g.strokeStyle = col(D_BONE);
        g.lineWidth = Math.max(9, r1 * 0.3);
        g.stroke();
        g.beginPath();
        g.arc(0, -0.8 * r0, Math.max(14, r0 * 0.3), 0, Math.PI * 2);
        g.fillStyle = col(D_BONE);
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = A.INK_W * 0.7;
        g.stroke();
        if (mode === 'tip') tri(g, L, -0.8 * r1 - 8, L + r1 * 2.2, -0.8 * r1 + 4, L, -0.8 * r1 + 22, col(D_HORN), A.INK_W * 0.7); // a claw at the wing tip
        if (mode === 'cut') { // the torn end: raw flesh
          g.beginPath();
          g.ellipse(L, 0.1 * r1, Math.max(8, r1 * 0.3), r1 * 0.9, 0, 0, Math.PI * 2);
          g.fillStyle = col(D_FLESH);
          g.fill();
          g.lineWidth = A.INK_W * 0.8;
          g.stroke();
        }
      });
    });
  }

  // A neck or tail segment: a tapering scaly tube with the belly (ember orange) on the +y side and charcoal spikes on the other.
  function bodySegPic(s, kind, mode, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`dseg|${kind}|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${mode}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5, spike = Math.max(20, r0 * 0.5);
      return bake(-r0 - pad, -r0 - spike - pad, L + (mode === 'tip' ? r1 * 2.6 : r1) + pad, r0 + pad, (g) => {
        const path = () => {
          g.beginPath();
          g.moveTo(0, -r0);
          g.lineTo(L * 0.5, -((r0 + r1) / 2) * 1.06);
          g.lineTo(L, -r1);
          if (mode === 'tip') g.lineTo(L + r1 * 2.6, 0);
          g.lineTo(L, r1);
          g.lineTo(L * 0.5, ((r0 + r1) / 2) * 1.04);
          g.lineTo(0, r0);
          g.arc(0, 0, r0, Math.PI / 2, (Math.PI * 3) / 2);
          g.closePath();
        };
        const ns = clamp(Math.round(L / (r0 * 1.5)), 1, 3); // charcoal back spikes first (behind the body)
        for (let k = 0; k < ns; k++) { const x = (L * (k + 0.55)) / ns; tri(g, x - r0 * 0.28, -((r0 + r1) / 2) + 3, x + r0 * 0.34, -((r0 + r1) / 2) + 3, x - r0 * 0.05, -((r0 + r1) / 2) - spike, col(D_HORN), A.INK_W * 0.7); }
        path();
        g.fillStyle = col(D_SCALE);
        g.fill();
        g.save();
        g.clip();
        poly(g, [[-r0 * 1.2, r0 * 0.25], [L * 0.5, ((r0 + r1) / 2) * 0.3], [L, r1 * 0.3], [L + r1 * 3, r1 * 0.3], [L + r1 * 3, r0 * 2], [-r0 * 1.2, r0 * 2]], col(D_BELLY), false); // the belly
        for (let k = 1; k < 4; k++) { const x = (L * k) / 4; poly(g, [[x - 6, ((r0 + r1) / 2) * 0.2], [x + 6, ((r0 + r1) / 2) * 0.2], [x + 6, r0 * 1.2], [x - 6, r0 * 1.2]], col(D_SCALE_DK), false); } // belly ribs
        poly(g, [[r0 * 0.1, -0.85 * r0], [L * 0.9, -0.85 * r1], [L * 0.9, -0.55 * r1], [r0 * 0.1, -0.55 * r0]], hiColor(look), false); // the highlight band along the back
        g.restore();
        path();
        g.lineWidth = A.INK_W;
        g.stroke();
        if (mode === 'cut') { g.beginPath(); g.ellipse(L, 0, Math.max(6, r1 * 0.35), r1, 0, 0, Math.PI * 2); g.fillStyle = col(D_FLESH); g.fill(); g.lineWidth = A.INK_W * 0.8; g.stroke(); }
      });
    });
  }

  // The torso: a capsule from its rear end (the local origin) along +x, LEN long, radius R.
  function drakeTorsoPic(s, look) {
    const L = s.len, R = s.r;
    return get(`dtorso|${Math.round(L)}|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-R - pad, -1.5 * R - pad, L + R + pad, R + pad, (g) => {
        for (const x of [0.12, 0.3, 0.5, 0.7, 0.88]) { const k = 0.34 - Math.abs(x - 0.5) * 0.3; tri(g, x * L - k * R * 0.5, -R + 8, x * L + k * R * 0.6, -R + 8, x * L - k * R * 0.6, -R - k * R * 1.5, col(D_HORN), A.INK_W * 0.8); } // back spikes
        const path = () => { g.beginPath(); g.arc(0, 0, R, Math.PI / 2, (Math.PI * 3) / 2); g.lineTo(L, -R); g.arc(L, 0, R, -Math.PI / 2, Math.PI / 2); g.closePath(); };
        path();
        g.fillStyle = col(D_SCALE);
        g.fill();
        g.save();
        g.clip();
        poly(g, [[-R, 0.28 * R], [0.3 * L, 0.34 * R], [0.7 * L, 0.3 * R], [L + R, 0.28 * R], [L + R, 2 * R], [-R, 2 * R]], col(D_BELLY), false); // the belly plates
        for (let k = 1; k < 9; k++) { const x = (L * k) / 9; poly(g, [[x - 8, 0.3 * R], [x + 8, 0.3 * R], [x + 8, 1.2 * R], [x - 8, 1.2 * R]], col(D_SCALE_DK), false); }
        for (const [x, y, k] of [[0.15, -0.35, 0.2], [0.32, -0.6, 0.17], [0.5, -0.25, 0.2], [0.68, -0.55, 0.17], [0.85, -0.3, 0.19], [0.4, 0.0, 0.14], [0.6, 0.02, 0.14]]) tri(g, x * L - k * R, y * R + k * R * 0.6, x * L + k * R * 0.9, y * R - k * R * 0.2, x * L + k * R * 0.1, y * R - k * R * 0.9, col(D_SCALE_DK), A.INK_W * 0.5); // scale marks
        poly(g, [[0.05 * L, -0.8 * R], [0.95 * L, -0.8 * R], [0.95 * L, -0.6 * R], [0.05 * L, -0.6 * R]], hiColor(look), false);
        g.restore();
        path();
        g.lineWidth = A.INK_W;
        g.stroke();
      });
    });
  }

  // The head: local origin at the neck's tip (the back of the skull), pointing +x, LEN long, radius R. The lower jaw hangs open by state 0 / 1 / 2.
  function drakeHeadPic(s, state, look) {
    const L = s.len, R = s.r;
    return get(`dhead|${Math.round(L)}|${Math.round(R)}|${state}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5, drop = [0, 0.35, 0.8][state] * R;
      return bake(-R * 1.3 - pad, -R * 2.2 - pad, L + R * 1.4 + pad, R * 2.1 + drop + pad, (g) => {
        tri(g, 0.1 * L, -0.8 * R, -0.5 * R, -2.0 * R, 0.4 * L, -1.0 * R, col(D_HORN), A.INK_W); // two horns swept back
        tri(g, 0.28 * L, -0.95 * R, -0.1 * R, -1.8 * R, 0.55 * L, -1.1 * R, col(D_HORN), A.INK_W * 0.8);
        poly(g, [[0.35 * L, 0.3 * R + drop], [L * 0.95, 0.45 * R + drop], [L * 1.02, 0.7 * R + drop], [0.5 * L, 1.0 * R + drop], [0.1 * L, 0.7 * R + drop]], col(D_SCALE_DK)); // the lower jaw
        if (state > 0) poly(g, [[0.35 * L, 0.25 * R], [L * 0.98, 0.4 * R], [L * 0.95, 0.5 * R + drop], [0.4 * L, 0.35 * R + drop]], col(D_MOUTH)); // the throat inside
        for (let k = 0; k < 5; k++) { const x = (0.45 + k * 0.1) * L; tri(g, x - 12, 0.42 * R + drop * 0.85, x + 12, 0.42 * R + drop * 0.85, x, 0.42 * R + drop * 0.85 - 40, col(D_TOOTH), A.INK_W * 0.4); } // lower teeth
        poly(g, [[-0.1 * L, -0.4 * R], [0.2 * L, -1.15 * R], [0.55 * L, -0.95 * R], [L * 0.98, -0.5 * R], [L * 1.06, -0.1 * R], [L * 0.98, 0.3 * R], [0.5 * L, 0.35 * R], [0.1 * L, 0.5 * R]], col(D_SCALE)); // the skull and upper jaw
        for (let k = 0; k < 5; k++) { const x = (0.5 + k * 0.1) * L; tri(g, x - 12, 0.3 * R, x + 12, 0.3 * R, x + 2, 0.3 * R + 42, col(D_TOOTH), A.INK_W * 0.4); } // upper fangs
        poly(g, [[0.3 * L, -0.95 * R], [0.8 * L, -0.55 * R], [0.8 * L, -0.4 * R], [0.3 * L, -0.8 * R]], hiColor(look), false);
        g.beginPath();
        g.ellipse(0.4 * L, -0.45 * R, 0.17 * R, 0.13 * R, 0.3, 0, Math.PI * 2); // the eye, with an angry brow
        g.fillStyle = col(D_EYE);
        g.fill();
        g.lineWidth = A.INK_W * 0.6;
        g.stroke();
        poly(g, [[0.28 * L, -0.62 * R], [0.5 * L, -0.45 * R], [0.5 * L, -0.7 * R]], col(D_HORN), true, A.INK_W * 0.6);
        g.beginPath();
        g.arc(0.93 * L, -0.28 * R, 0.07 * R, 0, Math.PI * 2); // a nostril
        g.fillStyle = col(D_SCALE_DK);
        g.fill();
      });
    });
  }

  // The breast scales: overlapping charcoal-red plates over the heart (shown while it is hidden).
  function scalesPic(R, look) {
    return get(`dscales|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-1.4 * R - pad, -1.3 * R - pad, 1.4 * R + pad, 1.3 * R + pad, (g) => {
        for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [0, -0.1], [-0.55, 0.45], [0.55, 0.45], [0, 0.8]]) poly(g, [[dx * R - 0.55 * R, dy * R - 0.35 * R], [dx * R + 0.55 * R, dy * R - 0.35 * R], [dx * R + 0.45 * R, dy * R + 0.35 * R], [dx * R, dy * R + 0.6 * R], [dx * R - 0.45 * R, dy * R + 0.35 * R]], col(D_PLATE), true, A.INK_W * 0.7);
        poly(g, [[-0.9 * R, -0.75 * R], [0.9 * R, -0.75 * R], [0.9 * R, -0.62 * R], [-0.9 * R, -0.62 * R]], hiColor(look), false);
      });
    });
  }

  // The throat's glow: two discs, an orange and a hot yellow core; `stage` 1..3 (1/4 to full).
  function glowPic(R, stage) {
    return get(`dglow|${Math.round(R)}|${stage}`, () => {
      const pad = A.INK_W * 1.5, k = [0, 0.45, 0.75, 1][stage];
      return bake(-1.5 * R - pad, -1.5 * R - pad, 1.5 * R + pad, 1.5 * R + pad, (g) => {
        g.beginPath();
        g.arc(0, 0, R * (0.55 + 0.7 * k), 0, Math.PI * 2);
        g.fillStyle = D_GLOW;
        g.globalAlpha = 0.85;
        g.fill();
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(0, 0, R * (0.25 + 0.5 * k), 0, Math.PI * 2);
        g.fillStyle = D_GLOW_IN;
        g.fill();
      });
    });
  }

  function drawDrakeLimb(p) {
    const look = lookOf(p), n = p.segs.length, kind = p.kind;
    for (let i = 0; i < n; i++) {
      const s = p.segs[i];
      if (!!s.behind !== behindPass) continue;
      const mode = i === n - 1 ? (p.severed ? 'cut' : kind === 'wing' || kind === 'tail' ? 'tip' : 'mid') : 'mid';
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (sideFlip(s, kind === 'wing')) ctx.scale(1, -1); // (wing membranes trail backward; a neck's or tail's belly faces forward)
      blit(kind === 'wing' ? wingPic(s, mode, look) : bodySegPic(s, kind, mode, look));
      ctx.restore();
    }
  }
  function drawDrake(body) {
    curF = body.f < 0 ? -1 : 1;
    const by = (id) => body.parts.find((q) => q.id === id);
    const wingF = by('wingF'), tail = by('tail'), torso = by('torso'), neck = by('neck'), head = by('head'), mouth = by('mouth'), heart = by('heart'), wingN = by('wingN');
    for (const p of [wingF, tail]) if (p && !p.dead) drawDrakeLimb(p);
    if (torso && !torso.dead) {
      const s = torso.segs[0], look = lookOf(torso), k = 1 + config.CREATURES.BREATH.AMOUNT * body.puff;
      ctx.save();
      const cx = s.x + Math.cos(s.ang) * s.len * 0.5, cy = s.y + Math.sin(s.ang) * s.len * 0.5;
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (body.f < 0) ctx.scale(1, -1);
      blit(drakeTorsoPic(s, look));
      ctx.restore();
    }
    if (neck && !neck.dead) drawDrakeLimb(neck);
    if (head && !head.dead) {
      const s = head.segs[0], look = lookOf(head), open = mouth ? mouth.openAmt : 0;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (body.f < 0) ctx.scale(1, -1);
      blit(drakeHeadPic(s, open < 0.25 ? 0 : open < 0.75 ? 1 : 2, look));
      ctx.restore();
    }
    const dk = body.drake;
    if (mouth && !mouth.dead && dk && dk.glow > 0.05 && mouth.openAmt > 0.2) { // the throat glows before the breath
      const s = mouth.segs[0], stage = dk.glow < 0.34 ? 1 : dk.glow < 0.7 ? 2 : 3;
      ctx.save();
      ctx.translate(s.x, s.y);
      blit(glowPic(s.r, stage));
      ctx.restore();
    }
    if (heart && !heart.dead && heart.segs[0]) {
      const s = heart.segs[0], look = lookOf(heart);
      ctx.save();
      ctx.translate(s.x, s.y);
      if (heart.hidden) {
        ctx.rotate(torso ? torso.segs[0].ang : 0);
        if (body.f < 0) ctx.scale(1, -1);
        blit(scalesPic(s.r, look));
      } else blit(heartPic(s.r, look));
      ctx.restore();
    }
    if (wingN && !wingN.dead) drawDrakeLimb(wingN);
  }

  // ================================================================ THE THUNDERBIRD (C.6b) ================================================================
  // The Drake's recipe again (rigid pictures baked once per zoom, blitted and rotated, stepped poses from the sim): a storm bird in slate-blue feathers with a pale breast, wings of feather segments (flight
  // feathers hang from each, gold-tipped like lightning), a broad tail fan, a crested head with a hooked golden beak, yellow talons, and the GIZZARD: hidden under the breast feathers until it swallows a bolt,
  // then a cyan-white glow (two stepped flicker frames). Facing +x in its own picture; the mirror (body.f) flips y.
  const T_BODY = '#3d4b6e', T_BODY_DK = '#262f4a', T_BREAST = '#c9d4e8', T_WING = '#4f6290', T_WING_LT = '#9bb2d6', T_QUILL = '#e8e2c8', T_GOLD = '#f0d24a', T_BEAK = '#e8b84a', T_BEAK_DK = '#8f5f24';
  const T_EYE = '#fff27a', T_LEG = '#d9b24a', T_CLAW = '#2f2a2e', T_GLOW = '#9fe8ff', T_GLOW_IN = '#ffffff', T_FLESH = '#d98a95';

  // A wing segment: the covert band along the leading edge (+y is the trailing side: sideFlip) and the flight feathers hanging from it, each a long blade swept a little back, a gold tip on every other one.
  function birdWingPic(s, mode, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`twing|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${mode}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5, f0 = r0 * 2.1, f1 = r1 * 2.1;
      return bake(-r0 * 0.5 - pad, -r0 * 0.9 - pad, L + r1 * 3 + pad, Math.max(f0, f1) + r0 * 0.4 + pad, (g) => {
        const n = 4, w = L / n;
        for (let k = 0; k < n; k++) {
          const u = (k + 0.5) / n, rr = r0 + (r1 - r0) * u, fl = f0 + (f1 - f0) * u, x0 = k * w;
          poly(g, [[x0, 0.1 * rr], [x0 + w * 1.15, 0.1 * rr], [x0 + w * 1.45, fl * 0.96], [x0 + w * 0.45, fl]], col(k % 2 ? T_WING : T_WING_LT));
          g.strokeStyle = col(T_QUILL);
          g.lineWidth = Math.max(7, w * 0.05);
          g.beginPath();
          g.moveTo(x0 + w * 0.6, 0.15 * rr);
          g.lineTo(x0 + w * 0.95, fl * 0.9);
          g.stroke();
          g.strokeStyle = INK;
          if (k % 2 === 0) tri(g, x0 + w * 0.45, fl, x0 + w * 1.45, fl * 0.96, x0 + w * 0.95, fl + w * 0.5, col(T_GOLD), A.INK_W * 0.7);
        }
        poly(g, [[0, -0.85 * r0], [L, -0.85 * r1], [L + 0.08 * r1, 0.3 * r1], [L * 0.5, 0.5 * ((r0 + r1) / 2) * 0.55], [0, 0.45 * r0]], col(T_BODY)); // the coverts along the arm
        poly(g, [[r0 * 0.1, -0.7 * r0], [L * 0.95, -0.7 * r1], [L * 0.95, -0.45 * r1], [r0 * 0.1, -0.45 * r0]], hiColor(look), false);
        for (let k = 0; k < 3; k++) { const x = L * (0.2 + 0.3 * k), rr = r0 + (r1 - r0) * (0.2 + 0.3 * k); tri(g, x - rr * 0.22, 0.05 * rr, x + rr * 0.22, 0.05 * rr, x, 0.4 * rr, col(T_BODY_DK), A.INK_W * 0.5); } // covert scallops
        g.beginPath();
        g.arc(0, -0.2 * r0, Math.max(14, r0 * 0.28), 0, Math.PI * 2);
        g.fillStyle = col(T_BODY_DK);
        g.fill();
        g.lineWidth = A.INK_W * 0.7;
        g.stroke();
        if (mode === 'tip') poly(g, [[L, -0.6 * r1], [L + r1 * 3, 0.15 * r1], [L, 0.5 * r1]], col(T_WING)); // the outermost primary
        if (mode === 'cut') { // plucked: bare quills
          for (let k = 0; k < 4; k++) { const y = -0.5 * r1 + k * 0.38 * r1; g.strokeStyle = col(T_QUILL); g.lineWidth = Math.max(9, r1 * 0.12); g.beginPath(); g.moveTo(L, y); g.lineTo(L + r1 * 0.9, y + r1 * 0.1); g.stroke(); }
          g.strokeStyle = INK;
        }
      });
    });
  }

  // A neck, tail or leg segment. NECK: a feathered tube, pale on the belly side. TAIL: a broad fan paddle (a spread of feathers ending in scallops, gold on the last). TALON: a scaly yellow leg; the last has three claws.
  function birdSegPic(s, kind, mode, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`tseg|${kind}|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${mode}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5, mid = (r0 + r1) / 2;
      return bake(-r0 - pad, -r0 - pad, L + (mode === 'tip' ? r1 * 2.4 : r1 * 1.4) + pad, r0 + pad, (g) => {
        if (kind === 'tail') {
          const n = 5;
          for (let k = 0; k < n; k++) { // a fan of feathers: each a blade from the base, spread across the segment's width
            const v = -1 + (2 * (k + 0.5)) / n, y = v * r0 * 0.9, y1 = v * r1 * 1.15;
            poly(g, [[0, y - r0 * 0.2], [L, y1 - r1 * 0.22], [L + r1 * 0.75, y1], [L, y1 + r1 * 0.22], [0, y + r0 * 0.2]], col(k % 2 ? T_BODY : T_WING));
          }
          poly(g, [[0, -0.2 * r0], [L, -0.25 * r1], [L, -0.05 * r1], [0, 0]], hiColor(look), false);
          if (mode === 'tip') for (let k = 0; k < n; k++) { const v = -1 + (2 * (k + 0.5)) / n; tri(g, L + r1 * 0.6, v * r1 * 1.15 - r1 * 0.2, L + r1 * 0.6, v * r1 * 1.15 + r1 * 0.2, L + r1 * 1.5, v * r1 * 1.15, col(T_GOLD), A.INK_W * 0.7); }
          if (mode === 'cut') { g.beginPath(); g.ellipse(L, 0, Math.max(6, r1 * 0.3), r1, 0, 0, Math.PI * 2); g.fillStyle = col(T_FLESH); g.fill(); g.lineWidth = A.INK_W * 0.8; g.stroke(); }
          return;
        }
        const path = () => {
          g.beginPath();
          g.moveTo(0, -r0);
          g.lineTo(L * 0.5, -mid * 1.05);
          g.lineTo(L, -r1);
          g.lineTo(L, r1);
          g.lineTo(L * 0.5, mid * 1.03);
          g.lineTo(0, r0);
          g.arc(0, 0, r0, Math.PI / 2, (Math.PI * 3) / 2);
          g.closePath();
        };
        path();
        g.fillStyle = col(kind === 'talon' ? T_LEG : T_BODY);
        g.fill();
        g.save();
        g.clip();
        if (kind === 'neck') {
          poly(g, [[-r0 * 1.2, r0 * 0.2], [L * 0.5, mid * 0.25], [L, r1 * 0.25], [L + r1 * 3, r1 * 0.25], [L + r1 * 3, r0 * 2], [-r0 * 1.2, r0 * 2]], col(T_BREAST), false); // the pale throat and breast
          for (let k = 0; k < 3; k++) { const x = (L * (k + 0.6)) / 3; tri(g, x - mid * 0.3, -mid * 0.5, x + mid * 0.3, -mid * 0.5, x, -mid * 0.05, col(T_BODY_DK), A.INK_W * 0.5); }
        } else for (let k = 1; k < 4; k++) { const x = (L * k) / 4; poly(g, [[x - 5, -r0], [x + 5, -r0], [x + 5, r0], [x - 5, r0]], col('#a6823a'), false); } // scales across the leg
        poly(g, [[r0 * 0.1, -0.85 * r0], [L * 0.9, -0.85 * r1], [L * 0.9, -0.55 * r1], [r0 * 0.1, -0.55 * r0]], hiColor(look), false);
        g.restore();
        path();
        g.lineWidth = A.INK_W;
        g.stroke();
        if (kind === 'talon' && mode === 'tip') for (const dy of [-0.55, 0, 0.55]) tri(g, L, dy * r1 - r1 * 0.22, L, dy * r1 + r1 * 0.22, L + r1 * 2.3, dy * r1 * 1.4 + r1 * 0.5, col(T_CLAW), A.INK_W * 0.6); // three claws
        if (mode === 'cut') { g.beginPath(); g.ellipse(L, 0, Math.max(6, r1 * 0.35), r1, 0, 0, Math.PI * 2); g.fillStyle = col(T_FLESH); g.fill(); g.lineWidth = A.INK_W * 0.8; g.stroke(); }
      });
    });
  }

  // The torso: a capsule from its rear end (the local origin) along +x: slate back, a pale breast of feather scallops below, a row of small crest feathers along the back.
  function birdTorsoPic(s, look) {
    const L = s.len, R = s.r;
    return get(`ttorso|${Math.round(L)}|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-R - pad, -1.4 * R - pad, L + R + pad, R + pad, (g) => {
        for (const x of [0.15, 0.32, 0.5, 0.68, 0.85]) tri(g, x * L - 0.12 * R, -R + 8, x * L + 0.16 * R, -R + 8, x * L - 0.1 * R, -R - 0.34 * R, col(T_BODY_DK), A.INK_W * 0.7);
        const path = () => { g.beginPath(); g.arc(0, 0, R, Math.PI / 2, (Math.PI * 3) / 2); g.lineTo(L, -R); g.arc(L, 0, R, -Math.PI / 2, Math.PI / 2); g.closePath(); };
        path();
        g.fillStyle = col(T_BODY);
        g.fill();
        g.save();
        g.clip();
        poly(g, [[-R, 0.2 * R], [0.3 * L, 0.3 * R], [0.75 * L, 0.2 * R], [L + R, 0.1 * R], [L + R, 2 * R], [-R, 2 * R]], col(T_BREAST), false); // the pale breast
        for (let k = 0; k < 8; k++) { const x = L * (0.04 + 0.12 * k); for (let j = 0; j < 2; j++) tri(g, x - 0.2 * R, (0.4 + 0.4 * j) * R, x + 0.2 * R, (0.4 + 0.4 * j) * R, x, (0.7 + 0.4 * j) * R, col('#9fb1d0'), A.INK_W * 0.45); } // feather scallops
        for (const [x, y, k] of [[0.2, -0.45, 0.17], [0.4, -0.6, 0.15], [0.6, -0.35, 0.17], [0.8, -0.55, 0.15], [0.5, -0.1, 0.13]]) tri(g, x * L - k * R, y * R + k * R * 0.6, x * L + k * R * 0.9, y * R - k * R * 0.2, x * L + k * R * 0.1, y * R - k * R * 0.9, col(T_BODY_DK), A.INK_W * 0.45);
        poly(g, [[0.05 * L, -0.82 * R], [0.95 * L, -0.82 * R], [0.95 * L, -0.62 * R], [0.05 * L, -0.62 * R]], hiColor(look), false);
        g.restore();
        path();
        g.lineWidth = A.INK_W;
        g.stroke();
      });
    });
  }

  // The head: local origin at the neck's tip (the back of the skull), pointing +x, LEN long, radius R: a crest of three swept-back feathers with gold tips, the cheek, a fierce yellow eye.
  function birdHeadPic(s, look) {
    const L = s.len, R = s.r;
    return get(`thead|${Math.round(L)}|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-R * 1.6 - pad, -R * 2.2 - pad, L + R * 0.4 + pad, R * 1.3 + pad, (g) => {
        tri(g, 0.2 * L, -0.8 * R, -0.9 * R, -1.9 * R, 0.45 * L, -1.0 * R, col(T_BODY_DK), A.INK_W); // the crest, swept back
        tri(g, 0.3 * L, -0.9 * R, -0.5 * R, -2.0 * R, 0.55 * L, -1.05 * R, col(T_WING), A.INK_W * 0.8);
        tri(g, -0.9 * R, -1.9 * R, -0.45 * R, -1.62 * R, -1.45 * R, -2.05 * R, col(T_GOLD), A.INK_W * 0.6);
        poly(g, [[-0.1 * L, -0.5 * R], [0.2 * L, -1.1 * R], [0.6 * L, -0.95 * R], [L * 0.95, -0.5 * R], [L, 0.0], [L * 0.95, 0.5 * R], [0.5 * L, 0.9 * R], [0.1 * L, 0.8 * R]], col(T_BODY)); // the skull
        poly(g, [[0.1 * L, 0.2 * R], [0.5 * L, 0.35 * R], [L * 0.95, 0.35 * R], [0.5 * L, 0.9 * R], [0.1 * L, 0.78 * R]], col(T_BREAST)); // the pale cheek and throat
        poly(g, [[0.3 * L, -0.95 * R], [0.8 * L, -0.55 * R], [0.8 * L, -0.4 * R], [0.3 * L, -0.8 * R]], hiColor(look), false);
        g.beginPath();
        g.ellipse(0.5 * L, -0.28 * R, 0.2 * R, 0.17 * R, 0, 0, Math.PI * 2);
        g.fillStyle = col(T_EYE);
        g.fill();
        g.lineWidth = A.INK_W * 0.6;
        g.stroke();
        poly(g, [[0.5 * L - 0.1 * R, -0.28 * R - 0.12 * R], [0.5 * L + 0.04 * R, -0.28 * R - 0.12 * R], [0.5 * L + 0.04 * R, -0.28 * R + 0.12 * R], [0.5 * L - 0.1 * R, -0.28 * R + 0.12 * R]], col(T_CLAW), false); // the pupil
        poly(g, [[0.38 * L, -0.62 * R], [0.7 * L, -0.4 * R], [0.7 * L, -0.55 * R], [0.4 * L, -0.78 * R]], col(T_CLAW), true, A.INK_W * 0.5); // the angry brow
      });
    });
  }

  // The beak: local origin at the head's tip, pointing +x: a hooked upper beak and a short lower one, in gold.
  function birdBeakPic(R, look) {
    return get(`tbeak|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-0.4 * R - pad, -1.0 * R - pad, 2.3 * R + pad, 1.7 * R + pad, (g) => {
        poly(g, [[0.1 * R, 0.1 * R], [1.5 * R, 0.25 * R], [0.5 * R, 0.8 * R]], col(T_BEAK_DK)); // the lower beak
        poly(g, [[0, -0.7 * R], [1.2 * R, -0.5 * R], [1.9 * R, 0.1 * R], [2.0 * R, 0.95 * R], [1.5 * R, 0.5 * R], [0.9 * R, 0.25 * R], [0, 0.3 * R]], col(T_BEAK)); // the upper, hooked
        poly(g, [[0.1 * R, -0.55 * R], [1.1 * R, -0.4 * R], [1.1 * R, -0.28 * R], [0.1 * R, -0.4 * R]], hiColor(look), false);
      });
    });
  }

  // The breast feathers over the gizzard (while it is hidden).
  function breastPic(R, look) {
    return get(`tbreast|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 1.5;
      return bake(-1.4 * R - pad, -1.3 * R - pad, 1.4 * R + pad, 1.3 * R + pad, (g) => {
        for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [0, -0.1], [-0.55, 0.45], [0.55, 0.45], [0, 0.8]]) poly(g, [[dx * R - 0.5 * R, dy * R - 0.35 * R], [dx * R + 0.5 * R, dy * R - 0.35 * R], [dx * R, dy * R + 0.6 * R]], col(T_BREAST), true, A.INK_W * 0.6);
        poly(g, [[-0.8 * R, -0.75 * R], [0.8 * R, -0.75 * R], [0.8 * R, -0.62 * R], [-0.8 * R, -0.62 * R]], hiColor(look), false);
      });
    });
  }

  // The glowing gizzard: a bright stone-like lump with a lightning zigzag through it; stage 1 and 2 flicker (swapped on the key clock).
  function gizzardPic(R, stage, look) {
    return get(`tgz|${Math.round(R)}|${stage}|${look}`, () => {
      const pad = A.INK_W * 1.5, k = stage === 1 ? 0.9 : 1.15;
      return bake(-1.9 * R - pad, -1.9 * R - pad, 1.9 * R + pad, 1.9 * R + pad, (g) => {
        g.beginPath();
        g.arc(0, 0, R * 1.5 * k, 0, Math.PI * 2);
        g.fillStyle = T_GLOW;
        g.globalAlpha = 0.5;
        g.fill();
        g.globalAlpha = 1;
        poly(g, [[0, -1.1 * R * k], [0.95 * R * k, -0.45 * R * k], [0.8 * R * k, 0.7 * R * k], [0, 1.1 * R * k], [-0.85 * R * k, 0.6 * R * k], [-0.95 * R * k, -0.5 * R * k]], T_GLOW);
        poly(g, [[0.15 * R, -0.95 * R * k], [-0.4 * R, -0.05 * R], [0.1 * R, 0.0], [-0.25 * R, 0.95 * R * k], [0.5 * R, -0.2 * R], [0.0, -0.2 * R]], T_GLOW_IN, false);
      });
    });
  }

  function drawBirdLimb(p) {
    const look = lookOf(p), n = p.segs.length, kind = p.kind;
    for (let i = 0; i < n; i++) {
      const s = p.segs[i];
      if (!!s.behind !== behindPass) continue;
      const mode = i === n - 1 ? (p.severed ? 'cut' : kind === 'wing' || kind === 'tail' || kind === 'talon' ? 'tip' : 'mid') : 'mid';
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (sideFlip(s, kind === 'wing' || kind === 'tail')) ctx.scale(1, -1); // (feathers trail backward; a neck's or leg's belly faces forward)
      blit(kind === 'wing' ? birdWingPic(s, mode, look) : birdSegPic(s, kind, mode, look));
      ctx.restore();
    }
  }
  function drawBird(body) {
    curF = body.f < 0 ? -1 : 1;
    const by = (id) => body.parts.find((q) => q.id === id);
    const wingF = by('wingF'), tail = by('tail'), torso = by('torso'), neck = by('neck'), head = by('head'), beak = by('beak'), gz = by('gizzard'), wingN = by('wingN'), talonF = by('talonF'), talonN = by('talonN');
    for (const p of [wingF, talonF, tail]) if (p && !p.dead) drawBirdLimb(p);
    if (torso && !torso.dead) {
      const s = torso.segs[0], look = lookOf(torso), k = 1 + config.CREATURES.BREATH.AMOUNT * body.puff;
      ctx.save();
      const cx = s.x + Math.cos(s.ang) * s.len * 0.5, cy = s.y + Math.sin(s.ang) * s.len * 0.5;
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (body.f < 0) ctx.scale(1, -1);
      blit(birdTorsoPic(s, look));
      ctx.restore();
    }
    if (neck && !neck.dead) drawBirdLimb(neck);
    if (head && !head.dead) {
      const s = head.segs[0], look = lookOf(head);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (body.f < 0) ctx.scale(1, -1);
      blit(birdHeadPic(s, look));
      ctx.restore();
    }
    if (beak && !beak.dead && beak.segs[0]) {
      const s = beak.segs[0], look = lookOf(beak);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (body.f < 0) ctx.scale(1, -1);
      blit(birdBeakPic(s.r, look));
      ctx.restore();
    }
    if (gz && !gz.dead && gz.segs[0]) {
      const s = gz.segs[0], look = lookOf(gz);
      ctx.save();
      ctx.translate(s.x, s.y);
      if (gz.hidden) {
        ctx.rotate(torso ? torso.segs[0].ang : 0);
        if (body.f < 0) ctx.scale(1, -1);
        blit(breastPic(s.r, look));
      } else blit(gizzardPic(s.r, body.key % 2 ? 1 : 2, look === 'flash' ? 'flash' : 'lit'));
      ctx.restore();
    }
    if (talonN && !talonN.dead) drawBirdLimb(talonN);
    if (wingN && !wingN.dead) drawBirdLimb(wingN);
  }

  // ================================================================ THE ISLAND TITAN (C.6c) ================================================================
  // The same recipe (pictures baked once per zoom and blitted; poses from the sim, nothing wobbles) in warm grey stone with moss, a cyan crystal and an amber eye. Everything but the arms is drawn in the Titan's own frame
  // (facing +x, origin at the middle of its torso; ctx is translated to the body and mirrored by body.f): the legs (a picture; they stride on the key clock while it walks), the heap of rubble it takes its boulders from, the torso with
  // the glowing heartstone in its chest, the head and the mouth (a hinged jaw that drops for the roar), the ISLAND on its back with the CRYSTAL growing from it (config.CREATURES.TITAN.ISLAND). The arms are the generic limbs
  // (three slabs and a hand, in world coordinates).
  const S_STONE = '#9a9384', S_STONE_DK = '#6b665c', S_STONE_LT = '#c4bca8', S_MOSS = '#6f8f4a', S_MOSS_DK = '#4d6b36', S_SOIL = '#7a5a3a', S_SOIL_DK = '#523a26', S_GRASS = '#7aa84e', S_GRASS_DK = '#4f7a3a', S_TRUNK = '#5a3f28', S_BOULDER = '#b08a5e';
  const S_CRYSTAL = '#7fe8ff', S_CRYSTAL_DK = '#2fa4c8', S_CRYSTAL_IN = '#e8ffff', S_EYE = '#ffc84a', S_MOUTH = '#3a2420', S_TOOTH = '#e8dcc0';
  const INK_B = A.INK_W * 1.3; // the big silhouettes get a heavier line

  function titanTorsoPic(look) {
    return get(`ttorso|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-1250 - pad, -2300 - pad, 1250 + pad, 800 + pad, (g) => {
        const body = [[-380, -2150], [-900, -1900], [-1000, -1500], [-870, -900], [-730, -300], [-770, 350], [-700, 650], [700, 650], [770, 350], [730, -300], [890, -900], [1010, -1500], [930, -1900], [440, -2150]];
        poly(g, body, col(S_STONE), true, INK_B);
        g.save();
        g.beginPath();
        body.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[-1100, -300], [0, -250], [1100, -300], [1100, 800], [-1100, 800]], col(S_STONE_DK), false); // the shaded belly
        poly(g, [[-380, -2100], [440, -2100], [700, -1700], [-100, -1650]], hiColor(look), false); // the light on the shoulders
        poly(g, [[-950, -1900], [-500, -1750], [-300, -1400], [-950, -1300]], col(S_MOSS), false); // moss on the back
        poly(g, [[500, -1980], [900, -1800], [850, -1640], [520, -1800]], col(S_MOSS), false);
        for (const [x1, y1, x2, y2] of [[-300, -1250, 200, -1180], [100, -700, 600, -600], [-600, -450, -100, -400], [300, -1650, 700, -1500]]) { // chest plates: heavy ink lines
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.lineWidth = A.INK_W * 0.8;
          g.stroke();
        }
        g.restore();
        poly(g, body, null, true, INK_B);
      });
    });
  }
  // The heartstone in its chest and the vein that climbs its back to the crystal on the island: cyan, drawn over the torso (it flickers in two stepped frames).
  function titanHeartPic(stage, look) {
    return get(`theart|${stage}|${look}`, () => {
      const pad = A.INK_W * 2;
      return bake(-1300 - pad, -2500 - pad, 700 + pad, -500 + pad, (g) => {
        const lit = stage ? S_CRYSTAL_IN : S_CRYSTAL, mid = looks[look](S_CRYSTAL);
        g.lineJoin = 'round';
        g.beginPath(); // the vein: from the chest, up the spine and across the shoulder to the island
        for (const [x, y] of [[330, -1000], [200, -1300], [60, -1480], [-120, -1750], [-380, -1950], [-700, -2150], [-1000, -2300]]) { if (x === 330) g.moveTo(x, y); else g.lineTo(x, y); }
        g.lineWidth = A.INK_W * 2.4;
        g.strokeStyle = INK;
        g.stroke();
        g.lineWidth = A.INK_W * 1.3;
        g.strokeStyle = mid;
        g.stroke();
        poly(g, [[330, -1250], [510, -1000], [330, -760], [150, -1000]], mid, true, A.INK_W); // the heartstone: a cut crystal in the chest
        poly(g, [[330, -1130], [420, -1000], [330, -880], [240, -1000]], looks[look](lit), false);
      });
    });
  }
  function titanLegPic(look) {
    return get(`tleg|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-700 - pad, -450 - pad, 1100 + pad, 2300 + pad, (g) => {
        const leg = [[-300, -420], [300, -420], [260, 900], [310, 1900], [820, 1950], [920, 2200], [-480, 2200], [-380, 1850], [-330, 900]];
        poly(g, leg, col(S_STONE), true, INK_B);
        g.save();
        g.beginPath();
        leg.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[-120, -500], [140, -500], [110, 2300], [-150, 2300]], col(S_STONE_DK), false); // the shaded stripe down the middle
        poly(g, [[-300, 700], [-80, 900], [-300, 1200]], col(S_MOSS), false);
        poly(g, [[-480, 1950], [920, 1950], [920, 2250], [-480, 2250]], col(S_STONE_DK), false); // the foot block
        g.beginPath();
        g.moveTo(-300, 300);
        g.lineTo(0, 520);
        g.lineTo(-120, 780);
        g.lineWidth = A.INK_W * 0.8;
        g.stroke();
        g.restore();
        poly(g, leg, null, true, INK_B);
      });
    });
  }
  function titanRubblePic(look) {
    return get(`trubble|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(300 - pad, 800 - pad, 2100 + pad, 2300 + pad, (g) => {
        poly(g, [[320, 2200], [560, 1550], [820, 1250], [1100, 1050], [1380, 1280], [1700, 1650], [2060, 2200]], col(S_STONE_DK), true, INK_B);
        for (const [x, y, r] of [[900, 1180, 230], [1250, 1300, 260], [1560, 1700, 220], [700, 1650, 200], [1100, 1850, 240]]) poly(g, [[x - r, y + r * 0.5], [x - r * 0.7, y - r * 0.6], [x + r * 0.2, y - r], [x + r, y - r * 0.2], [x + r * 0.8, y + r * 0.7]], col(S_STONE), true, A.INK_W);
        poly(g, [[820, 1100], [1040, 1020], [1060, 1080], [840, 1180]], hiColor(look), false);
      });
    });
  }
  function titanHeadPic(look) {
    return get(`thead|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-800 - pad, -800 - pad, 1100 + pad, 700 + pad, (g) => {
        const head = [[-480, -400], [-300, -620], [200, -680], [520, -520], [640, -120], [700, 220], [470, 520], [-250, 580], [-560, 260]];
        poly(g, head, col(S_STONE), true, INK_B);
        g.save();
        g.beginPath();
        head.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[-700, 100], [800, 60], [800, 800], [-700, 800]], col(S_STONE_DK), false);
        poly(g, [[-300, -650], [220, -700], [500, -520], [-100, -430]], hiColor(look), false);
        poly(g, [[-500, -450], [-100, -700], [100, -560], [-300, -330]], col(S_MOSS), false);
        g.restore();
        poly(g, [[60, -330], [640, -300], [660, -170], [80, -180]], col(S_STONE_DK), true, A.INK_W); // the heavy brow
        poly(g, [[250, -150], [480, -170], [440, 20], [270, 40]], looks[look](S_EYE), true, A.INK_W * 0.9); // the amber eye
        poly(g, [[330, -110], [400, -120], [390, -20], [340, -10]], looks[look](S_MOUTH), false);
        poly(g, [[560, -90], [760, 60], [620, 200]], col(S_STONE_LT), true, A.INK_W * 0.9); // a blocky nose
        poly(g, head, null, true, INK_B);
      });
    });
  }
  // The mouth on the front of the face: shut it is a heavy lip; open, the lower jaw drops and the dark throat shows between rows of stone teeth. state 0 shut, 1 half open, 2 wide open. Centred on the mouth point.
  function titanMouthPic(R, state, look) {
    return get(`tmouth|${Math.round(R)}|${state}|${look}`, () => {
      const col = looks[look], gap = [0, 0.55, 1.1][state] * R, pad = INK_B * 1.5;
      return bake(-1.3 * R - pad, -1.0 * R - pad, 1.5 * R + pad, 2.3 * R + pad, (g) => {
        if (gap > 0) {
          poly(g, [[-0.9 * R, -0.35 * R], [0.9 * R, -0.35 * R], [0.8 * R, gap + 0.5 * R], [-0.8 * R, gap + 0.55 * R]], col(S_MOUTH), true, A.INK_W);
          for (let k = 0; k < 4; k++) { const x = (-0.7 + k * 0.45) * R; poly(g, [[x - 0.17 * R, -0.35 * R], [x + 0.17 * R, -0.35 * R], [x + 0.1 * R, 0.1 * R + gap * 0.25], [x - 0.1 * R, 0.1 * R + gap * 0.25]], col(S_TOOTH), true, A.INK_W * 0.6); }
        }
        poly(g, [[-0.95 * R, gap + 0.15 * R], [0.95 * R, gap + 0.15 * R], [0.85 * R, gap + 0.8 * R], [-0.7 * R, gap + 0.85 * R]], col(S_STONE_DK), true, INK_B * 0.8); // the jaw (drops for the roar)
        poly(g, [[-1.1 * R, -0.75 * R], [1.2 * R, -0.7 * R], [1.1 * R, -0.3 * R], [-1.0 * R, -0.25 * R]], col(S_STONE), true, INK_B * 0.8); // the upper lip
        poly(g, [[-0.9 * R, -0.65 * R], [1.0 * R, -0.62 * R], [1.0 * R, -0.5 * R], [-0.9 * R, -0.5 * R]], hiColor(look), false);
        if (gap > 0) for (let k = 0; k < 3; k++) { const x = (-0.45 + k * 0.45) * R; poly(g, [[x - 0.13 * R, gap + 0.2 * R], [x + 0.13 * R, gap + 0.2 * R], [x, gap - 0.15 * R - 0.1 * R]], col(S_TOOTH), true, A.INK_W * 0.6); }
      });
    });
  }
  // The island: a slab of rock with grass on top, roots and a jagged underside, two round trees and a ruined arch. Its top edge is at y = TOP exactly (the crew stand on it: ground.js).
  function titanIslandPic(look) {
    return get(`tisland|${look}`, () => {
      const col = looks[look], I = config.CREATURES.TITAN.ISLAND, pad = INK_B * 1.5, x0 = I.X0, x1 = I.X1, top = I.TOP, d = I.DEPTH, w = x1 - x0, cx = (x0 + x1) / 2;
      return bake(x0 - 250 - pad, top - 520 - pad, x1 + 250 + pad, top + d + 150 + pad, (g) => {
        const rock = [[x0 - 120, top + 60], [x0 + 150, top + d * 0.45], [x0 + w * 0.22, top + d * 0.7], [cx - w * 0.12, top + d * 0.95], [cx + w * 0.06, top + d], [cx + w * 0.2, top + d * 0.82], [x1 - w * 0.18, top + d * 0.62], [x1 - 120, top + d * 0.35], [x1 + 120, top + 60], [x1, top], [x0, top]];
        poly(g, rock, col(S_STONE_DK), true, INK_B);
        poly(g, [[x0 - 120, top + 60], [x0, top], [x1, top], [x1 + 120, top + 60], [x1 - 100, top + 230], [cx, top + 300], [x0 + 100, top + 230]], col(S_SOIL), false); // the earth band under the grass
        poly(g, [[x0 + 150, top + 380], [x0 + w * 0.3, top + 560], [x0 + w * 0.22, top + 760]], col(S_STONE), false);
        poly(g, [[x0 - 90, top + 70], [x0, top], [x1, top], [x1 + 90, top + 70], [x1 - 60, top + 130], [x0 + 60, top + 130]], col(S_GRASS), true, INK_B); // the grass on top
        poly(g, [[x0 + 40, top + 40], [x1 - 40, top + 40], [x1 - 80, top + 90], [x0 + 80, top + 90]], col(S_GRASS_DK), false);
        poly(g, [[x0 + 200, top + 8], [x1 - 200, top + 8], [x1 - 260, top + 30], [x0 + 260, top + 30]], hiColor(look), false);
        g.lineWidth = A.INK_W * 0.8;
        for (const rx of [x0 + 300, cx - 200, cx + 150, x1 - 500]) { g.beginPath(); g.moveTo(rx, top + 220); g.lineTo(rx - 40, top + 520); g.lineTo(rx + 20, top + 700); g.stroke(); } // hanging roots
        for (const [tx, tr] of [[x0 + 420, 200], [x1 - 380, 170]]) { // two round trees
          poly(g, [[tx - 36, top], [tx + 36, top], [tx + 24, top - tr * 1.3], [tx - 24, top - tr * 1.3]], col(S_TRUNK), true, A.INK_W * 0.9);
          g.beginPath();
          g.arc(tx, top - tr * 1.6, tr, 0, Math.PI * 2);
          g.fillStyle = col(S_GRASS_DK);
          g.fill();
          g.lineWidth = A.INK_W;
          g.stroke();
          g.beginPath();
          g.arc(tx - tr * 0.3, top - tr * 1.8, tr * 0.5, 0, Math.PI * 2);
          g.fillStyle = col(S_GRASS);
          g.fill();
        }
        const ax = cx + 450; // a ruined arch
        poly(g, [[ax - 150, top], [ax - 80, top], [ax - 80, top - 330], [ax - 150, top - 300]], col(S_STONE_LT), true, A.INK_W * 0.9);
        poly(g, [[ax + 80, top], [ax + 150, top], [ax + 150, top - 240], [ax + 80, top - 330]], col(S_STONE_LT), true, A.INK_W * 0.9);
        poly(g, [[ax - 150, top - 300], [ax - 40, top - 400], [ax + 80, top - 340], [ax - 80, top - 300]], col(S_STONE), true, A.INK_W * 0.9);
      });
    });
  }
  // The crystal on the island: a cluster of cut spires, cyan with a pale heart, rooted at the island's top; stage = how many strokes have cracked it (0..3, more cracks), a hit flashes it white.
  function titanCrystalPic(R, stage, look) {
    return get(`tcrystal|${Math.round(R)}|${stage}|${look}`, () => {
      const col = looks[look], pad = A.INK_W * 2;
      return bake(-2.2 * R - pad, -2.7 * R - pad, 2.2 * R + pad, 0.9 * R + pad, (g) => {
        g.beginPath();
        g.arc(0, -0.8 * R, 1.9 * R, 0, Math.PI * 2); // a faint glow round it
        g.fillStyle = 'rgba(127,232,255,0.18)';
        g.fill();
        poly(g, [[-1.15 * R, 0.7 * R], [-1.0 * R, -0.3 * R], [-0.65 * R, -1.1 * R], [-0.3 * R, 0.7 * R]], col(S_CRYSTAL_DK), true, A.INK_W);
        poly(g, [[0.35 * R, 0.7 * R], [0.7 * R, -0.5 * R], [1.0 * R, -1.0 * R], [1.2 * R, 0.7 * R]], col(S_CRYSTAL_DK), true, A.INK_W);
        poly(g, [[-0.6 * R, 0.7 * R], [-0.4 * R, -1.3 * R], [0.05 * R, -2.4 * R], [0.5 * R, -1.2 * R], [0.7 * R, 0.7 * R]], col(S_CRYSTAL), true, A.INK_W * 1.1);
        poly(g, [[-0.2 * R, 0.5 * R], [-0.15 * R, -1.1 * R], [0.05 * R, -1.9 * R], [0.2 * R, -1.0 * R], [0.25 * R, 0.5 * R]], col(S_CRYSTAL_IN), false);
        poly(g, [[-0.5 * R, -0.9 * R], [-0.3 * R, -1.3 * R], [-0.15 * R, -0.5 * R]], hiColor(look), false);
        g.strokeStyle = INK;
        g.lineWidth = A.INK_W * 0.9;
        const cracks = [[[0.3, -1.6], [0.0, -1.1], [0.2, -0.7], [-0.1, -0.2]], [[-0.3, -1.0], [0.1, -0.6], [-0.2, -0.1], [0.1, 0.4]], [[0.45, -0.9], [0.1, -0.4], [0.35, 0.1]]];
        for (let c = 0; c < Math.min(stage, 3); c++) { g.beginPath(); cracks[c].forEach(([x, y], i) => (i ? g.lineTo(x * R, y * R) : g.moveTo(x * R, y * R))); g.stroke(); }
      });
    });
  }
  function titanBoulderPic(r, look) {
    return get(`tboulder|${Math.round(r)}|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-1.2 * r - pad, -1.2 * r - pad, 1.2 * r + pad, 1.2 * r + pad, (g) => {
        const pts = [[-1.0, -0.2], [-0.7, -0.8], [0.0, -1.05], [0.75, -0.7], [1.05, 0.1], [0.7, 0.85], [-0.1, 1.05], [-0.8, 0.7]].map(([x, y]) => [x * r, y * r]);
        poly(g, pts, col(S_BOULDER), true, INK_B);
        poly(g, [[-0.6 * r, -0.7 * r], [0.0, -0.95 * r], [0.6 * r, -0.65 * r], [0.1 * r, -0.4 * r]], hiColor(look), false);
        poly(g, [[0.2 * r, 0.1 * r], [0.9 * r, 0.1 * r], [0.7 * r, 0.8 * r], [0.0 * r, 0.9 * r]], col(S_STONE_DK), false);
        poly(g, [[-0.9 * r, 0.1 * r], [-0.4 * r, 0.0], [-0.3 * r, 0.5 * r], [-0.7 * r, 0.6 * r]], col(S_MOSS), false);
        poly(g, pts, null, true, INK_B);
      });
    });
  }
  // An arm segment: a slab of stone with a ball joint at its root and cracks; the last has a hand (four fingers and a thumb); a cut one ends in a broken face.
  function titanArmPic(s, mode, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`tarm|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${mode}|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5, mid = (r0 + r1) / 2;
      return bake(-r0 * 1.1 - pad, -r0 * 1.35 - pad, L + (mode === 'tip' ? r1 * 3.2 : r1 * 1.2) + pad, r0 * 1.35 + pad, (g) => {
        const slab = [[0, -r0 * 1.02], [L * 0.3, -r0 * 1.12], [L * 0.7, -mid * 1.08], [L, -r1], [L, r1], [L * 0.65, mid * 1.1], [L * 0.3, r0 * 1.06], [0, r0 * 1.02]];
        poly(g, slab, col(S_STONE), true, INK_B);
        g.save();
        g.beginPath();
        slab.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[0, r0 * 0.15], [L, r1 * 0.2], [L, r1 * 1.3], [0, r0 * 1.3]], col(S_STONE_DK), false);
        poly(g, [[r0 * 0.2, -r0 * 1.0], [L * 0.9, -r1 * 0.95], [L * 0.9, -r1 * 0.55], [r0 * 0.2, -r0 * 0.6]], hiColor(look), false);
        poly(g, [[L * 0.25, -r0 * 1.2], [L * 0.5, -mid * 1.2], [L * 0.45, -mid * 0.6], [L * 0.22, -r0 * 0.7]], col(S_MOSS), false);
        g.beginPath();
        g.moveTo(L * 0.35, -mid * 0.2);
        g.lineTo(L * 0.5, mid * 0.2);
        g.lineTo(L * 0.42, mid * 0.6);
        g.lineWidth = A.INK_W * 0.8;
        g.stroke();
        g.restore();
        poly(g, slab, null, true, INK_B);
        g.beginPath(); // the ball joint at the root
        g.arc(0, 0, r0 * 0.72, 0, Math.PI * 2);
        g.fillStyle = col(S_STONE_LT);
        g.fill();
        g.lineWidth = INK_B * 0.9;
        g.stroke();
        poly(g, [[-r0 * 0.4, -r0 * 0.3], [-r0 * 0.05, -r0 * 0.55], [r0 * 0.15, -r0 * 0.25]], hiColor(look), false);
        if (mode === 'tip') { // the hand
          for (const [dy, len] of [[-0.62, 1.75], [-0.22, 2.05], [0.18, 2.0], [0.58, 1.6]]) poly(g, [[L - r1 * 0.2, dy * r1 - r1 * 0.2], [L + r1 * len, dy * r1 - r1 * 0.17], [L + r1 * len + r1 * 0.12, dy * r1 + r1 * 0.12], [L - r1 * 0.2, dy * r1 + r1 * 0.2]], col(S_STONE_LT), true, A.INK_W * 0.9);
          poly(g, [[L, r1 * 0.8], [L + r1 * 0.9, r1 * 1.5], [L + r1 * 1.2, r1 * 1.25], [L + r1 * 0.3, r1 * 0.6]], col(S_STONE_LT), true, A.INK_W * 0.9); // the thumb
        }
        if (mode === 'cut') { // broken off: a jagged face of lighter stone
          poly(g, [[L - 10, -r1], [L + r1 * 0.35, -r1 * 0.5], [L + r1 * 0.1, -r1 * 0.1], [L + r1 * 0.45, r1 * 0.4], [L + r1 * 0.05, r1]], col(S_STONE_LT), true, A.INK_W * 0.9);
        }
      });
    });
  }
  function drawTitanLimb(p) {
    const look = lookOf(p), n = p.segs.length;
    for (let i = 0; i < n; i++) {
      const s = p.segs[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (Math.cos(s.ang) < 0) ctx.scale(1, -1); // (the light stays on top)
      blit(titanArmPic(s, i === n - 1 ? (p.severed ? 'cut' : 'tip') : 'mid', look));
      ctx.restore();
    }
  }
  function drawTitan(body) {
    const T = config.CREATURES.TITAN, tt = body.titan, by = (id) => body.parts.find((q) => q.id === id);
    const torso = by('torso'), head = by('head'), mouth = by('mouth'), armN = by('armN'), armF = by('armF'), crystal = by('crystal');
    const look = torso ? lookOf(torso) : 'lit', lift = T.BODY.LEGS.LIFT, walking = tt && tt.walking, leg = tt ? tt.leg : 0;
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(body.f, 1);
    // behind the body: the far leg, the island with its crystal
    ctx.save();
    ctx.translate(T.BODY.LEGS.AT[1], walking && leg === 0 ? -lift : 0);
    blit(titanLegPic(look === 'lit' ? 'dim' : look));
    ctx.restore();
    blit(titanIslandPic(look));
    if (crystal && !crystal.dead && crystal.segs[0]) {
      const frac = Math.max(0, crystal.hp) / Math.max(1, crystal.maxHp), stage = frac > 0.99 ? 0 : frac > 0.6 ? 1 : frac > 0.3 ? 2 : 3;
      ctx.save();
      ctx.translate(T.CRYSTAL.X, T.ISLAND.TOP - T.CRYSTAL.R * 0.7); // (the part's middle; its foot is on the island's top)
      blit(titanCrystalPic(T.CRYSTAL.R, stage, crystal.hit > 0 ? 'flash' : look === 'dim' ? 'dim' : 'lit'));
      ctx.restore();
    }
    ctx.restore();
    if (armF && !armF.dead) drawTitanLimb(armF);
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(body.f, 1);
    blit(titanRubblePic(look));
    ctx.save();
    ctx.translate(T.BODY.LEGS.AT[0], walking && leg === 1 ? -lift : 0);
    blit(titanLegPic(look));
    ctx.restore();
    if (torso && !torso.dead) {
      const k = 1 + config.CREATURES.BREATH.AMOUNT * body.puff; // the held breath: a snap, not a swell
      ctx.save();
      ctx.translate(0, T.BODY.TORSO.AT[1] + T.BODY.TORSO.LEN / 2);
      ctx.scale(k, k);
      ctx.translate(0, -(T.BODY.TORSO.AT[1] + T.BODY.TORSO.LEN / 2));
      blit(titanTorsoPic(look));
      blit(titanHeartPic(body.key % 2, look === 'dim' ? 'dim' : 'lit'));
      ctx.restore();
    }
    ctx.restore();
    if (armN && !armN.dead) drawTitanLimb(armN); // (the near arm passes in front of the chest but BEHIND the face: the mouth must always be seen)
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.scale(body.f, 1);
    if (head && !head.dead) {
      const hs = head.segs[0], hx = T.BODY.HEAD.AT[0], hy = T.BODY.HEAD.AT[1], rear = tt && tt.pose === 'roar';
      ctx.save();
      if (rear) { // the head tips back for the roar
        ctx.translate(hx, hy);
        ctx.rotate(-0.2);
        ctx.translate(-hx, -hy);
      }
      ctx.save();
      ctx.translate(hx, hy);
      blit(titanHeadPic(lookOf(head)));
      ctx.restore();
      if (mouth && !mouth.dead && mouth.segs[0]) {
        ctx.save();
        ctx.translate(T.BODY.MOUTH.AT[0], T.BODY.MOUTH.AT[1]);
        blit(titanMouthPic(T.BODY.MOUTH.R, mouth.openAmt < 0.25 ? 0 : mouth.openAmt < 0.75 ? 1 : 2, lookOf(mouth)));
        ctx.restore();
      }
      ctx.restore();
      void hs;
    }
    ctx.restore();
  }

  // ================================================================ THE RIME WYRM (C.6d) ================================================================
  // The same recipe (pictures baked once per zoom and blitted; poses from the sim, nothing wobbles) in slate-blue scales with a pale belly, charcoal horns, an icy cyan eye, and ICE ARMOUR: each body segment is drawn in one of
  // three states from its ice (part.ice[i] / part.iceMax[i], creatureWyrm.js): a full shell of faceted ice with icicles (armoured), frost patches (thin), or bare scale where a hammer has chipped it. The collar (the thick neck
  // standing out of the cliff) is drawn in its own frame (origin = the top of its straight part, ctx mirrored by body.f so +x points at the ship; the pale belly strip faces her). The head has horns and a hinged-jaw maw
  // (the mouth part): two jaws that part in a V for the gape, the dark throat between. The body is the generic limb, in world coordinates.
  const W_SCALE = '#4f6f8e', W_DARK = '#33506d', W_BELLY = '#d6e7f2', W_ICE = '#c9e9fa', W_ICE_LT = '#f3fcff', W_ICE_DK = '#8cc2de', W_EYE = '#7fe8ff', W_MAW = '#5b2347', W_FANG = '#f1f6fa', W_SOFT = '#f0b9c4', W_HORN = '#2b3446';
  const wyIce = (p, i) => (!p.ice || !(p.ice[i] > 0) ? 0 : p.ice[i] < p.iceMax[i] * 0.5 ? 1 : 2);

  // One body segment: base joint at the origin, along +x. stage 0 bare, 1 frosted, 2 armoured.
  function wyrmSegPic(s, stage, look) {
    const L = s.len, r0 = s.r, r1 = s.r1;
    return get(`wseg|${Math.round(L)}|${Math.round(r0)}|${Math.round(r1)}|${stage}|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5, rm = ((r0 + r1) / 2) * 1.08;
      const edge = (x) => { const u = clamp(x / L, 0, 1); return r0 + (r1 - r0) * u + (rm - (r0 + r1) / 2) * 4 * u * (1 - u); };
      return bake(-r0 * 1.2 - pad, -r0 * 1.9 - pad, L + r1 * 0.5 + pad, r0 * 1.9 + pad, (g) => {
        const body = [[0, -r0], [L * 0.5, -rm], [L, -r1], [L, r1], [L * 0.5, rm * 0.98], [0, r0]];
        for (const [x, k] of [[0.18, 0.34], [0.5, 0.4], [0.8, 0.3]]) tri(g, x * L - k * L * 0.28, -edge(x * L) + 4, x * L + k * L * 0.28, -edge(x * L) + 4, x * L - k * L * 0.1, -edge(x * L) - r0 * 0.55, col(W_HORN), A.INK_W * 0.8); // the back plates
        poly(g, body, col(W_SCALE), true, INK_B);
        g.beginPath();
        g.arc(0, 0, r0, Math.PI / 2, (Math.PI * 3) / 2);
        g.fillStyle = col(W_SCALE);
        g.fill();
        g.lineWidth = INK_B;
        g.stroke();
        g.save();
        g.beginPath();
        body.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[0, r0 * 0.25], [L * 0.5, rm * 0.3], [L, r1 * 0.3], [L, r1 * 1.4], [0, r0 * 1.4]], col(W_BELLY), false); // the pale belly strip
        poly(g, [[r0 * 0.1, -r0 * 0.85], [L * 0.5, -rm * 0.88], [L * 0.95, -r1 * 0.85], [L * 0.95, -r1 * 0.55], [L * 0.5, -rm * 0.58], [r0 * 0.1, -r0 * 0.55]], hiColor(look), false); // highlight band
        for (let k = 0; k < 3; k++) tri(g, L * (0.12 + 0.3 * k), -rm * 0.2, L * (0.12 + 0.3 * k) + rm * 0.35, -rm * 0.2 + rm * 0.25, L * (0.12 + 0.3 * k) + rm * 0.05, rm * 0.2, col(W_DARK), A.INK_W * 0.5); // scale marks
        if (stage === 1) { // frost: a few white patches on the back
          poly(g, [[L * 0.1, -r0 * 1.0], [L * 0.45, -rm * 1.05], [L * 0.4, -rm * 0.35], [L * 0.12, -r0 * 0.4]], col(W_ICE_LT), false);
          poly(g, [[L * 0.62, -rm * 1.0], [L * 0.95, -r1 * 1.0], [L * 0.92, -r1 * 0.3], [L * 0.66, -rm * 0.45]], col(W_ICE), false);
        }
        g.restore();
        poly(g, body, null, true, INK_B);
        if (stage === 1) {
          tri(g, L * 0.3, rm * 0.95, L * 0.4, rm * 0.95, L * 0.35, rm * 0.95 + r0 * 0.5, col(W_ICE), A.INK_W * 0.6);
        }
        if (stage === 2) { // the armour: a faceted shell of ice with icicles above and below
          const sh = [[-r0 * 0.15, -r0 * 1.12], [L * 0.3, -rm * 1.18], [L * 0.7, -rm * 1.14], [L * 1.04, -r1 * 1.12], [L * 1.06, r1 * 1.1], [L * 0.7, rm * 1.14], [L * 0.3, rm * 1.18], [-r0 * 0.15, r0 * 1.12]];
          for (let k = 0; k < 3; k++) { const x = L * (0.15 + 0.32 * k); tri(g, x - L * 0.07, rm * 1.1, x + L * 0.07, rm * 1.1, x, rm * 1.1 + r0 * (0.6 + 0.25 * (k % 2)), col(W_ICE), A.INK_W * 0.7); }
          for (let k = 0; k < 3; k++) { const x = L * (0.2 + 0.3 * k); tri(g, x - L * 0.06, -rm * 1.14, x + L * 0.06, -rm * 1.14, x, -rm * 1.14 - r0 * 0.5, col(W_ICE_LT), A.INK_W * 0.7); }
          poly(g, sh, col(W_ICE), true, INK_B);
          g.save();
          g.beginPath();
          sh.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
          g.closePath();
          g.clip();
          poly(g, [[0, r0 * 0.1], [L * 0.5, rm * 0.2], [L, r1 * 0.1], [L * 1.1, r1 * 1.3], [0, r0 * 1.3]], col(W_ICE_DK), false);
          poly(g, [[L * 0.06, -r0 * 1.0], [L * 0.52, -rm * 1.06], [L * 0.5, -rm * 0.5], [L * 0.1, -r0 * 0.46]], col(W_ICE_LT), false);
          g.beginPath(); // facet cracks
          g.moveTo(L * 0.28, -rm * 0.9);
          g.lineTo(L * 0.4, -rm * 0.1);
          g.lineTo(L * 0.3, rm * 0.5);
          g.moveTo(L * 0.7, -rm * 0.8);
          g.lineTo(L * 0.62, rm * 0.2);
          g.lineWidth = A.INK_W * 0.55;
          g.stroke();
          g.restore();
          poly(g, sh, null, true, INK_B);
        }
      });
    });
  }
  // The head: the neck joint at the origin, along +x. Horns swept back, an icy eye, a crest; the ice crown by stage.
  function wyrmHeadPic(len, r, stage, look) {
    return get(`whead|${Math.round(len)}|${Math.round(r)}|${stage}|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-r * 2 - pad, -r * 2.4 - pad, len + r * 0.8 + pad, r * 1.4 + pad, (g) => {
        poly(g, [[0.1 * len, -0.85 * r], [-1.5 * r, -1.9 * r], [0.3 * len, -1.25 * r]], col(W_HORN), true, INK_B * 0.8); // the far horn
        const skull = [[0, -0.85 * r], [0.3 * len, -1.0 * r], [0.78 * len, -0.6 * r], [len, -0.34 * r], [len, 0.3 * r], [0.74 * len, 0.5 * r], [0.3 * len, 0.95 * r], [0, 0.8 * r]];
        poly(g, skull, col(W_SCALE), true, INK_B);
        g.save();
        g.beginPath();
        skull.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
        g.closePath();
        g.clip();
        poly(g, [[0, 0.1 * r], [0.5 * len, 0.2 * r], [len, 0.1 * r], [len, 1.4 * r], [0, 1.4 * r]], col(W_BELLY), false);
        poly(g, [[0.05 * len, -0.8 * r], [0.5 * len, -0.9 * r], [0.9 * len, -0.5 * r], [0.9 * len, -0.38 * r], [0.5 * len, -0.7 * r], [0.05 * len, -0.62 * r]], hiColor(look), false);
        g.restore();
        poly(g, skull, null, true, INK_B);
        poly(g, [[0.12 * len, -0.9 * r], [-1.2 * r, -1.6 * r], [-1.0 * r, -2.2 * r], [0.34 * len, -1.15 * r]], col(W_HORN), true, INK_B * 0.8); // the near horn
        for (let k = 0; k < 3; k++) tri(g, 0.42 * len + k * 0.14 * len, -0.9 * r + k * 0.1 * r, 0.5 * len + k * 0.14 * len, -0.9 * r + k * 0.1 * r, 0.44 * len + k * 0.14 * len, -1.5 * r + k * 0.1 * r, col(W_HORN), A.INK_W * 0.7); // crest
        g.beginPath(); // the eye
        g.arc(0.45 * len, -0.32 * r, 0.2 * r, 0, Math.PI * 2);
        g.fillStyle = col(W_EYE);
        g.fill();
        g.lineWidth = A.INK_W * 0.8;
        g.stroke();
        poly(g, [[0.4 * len, -0.62 * r], [0.52 * len, -0.5 * r], [0.5 * len, -0.38 * r]], col(W_HORN), false);
        g.beginPath();
        g.arc(0.93 * len, -0.15 * r, 0.06 * r, 0, Math.PI * 2);
        g.fillStyle = col(W_DARK);
        g.fill();
        if (stage >= 1) { // the crown of ice
          const n = stage === 2 ? 5 : 3;
          for (let k = 0; k < n; k++) { const x = 0.12 * len + k * (0.6 * len) / n; tri(g, x - 0.06 * len, -0.95 * r, x + 0.06 * len, -0.95 * r, x, -0.95 * r - r * (stage === 2 ? 0.9 : 0.5) * (1 - 0.15 * (k % 2)), col(stage === 2 ? W_ICE : W_ICE_LT), A.INK_W * 0.7); }
          if (stage === 2) poly(g, [[0.04 * len, -0.9 * r], [0.55 * len, -1.05 * r], [0.78 * len, -0.6 * r], [0.5 * len, -0.5 * r], [0.06 * len, -0.5 * r]], col(W_ICE), true, A.INK_W);
        }
      });
    });
  }
  // The maw: centred on the mouth point, the axis along +x: the upper jaw and the lower jaw part in a V (state 0 shut, 1 half, 2 wide), the dark throat between, white fangs.
  function wyrmMouthPic(R, state, look) {
    return get(`wmouth|${Math.round(R)}|${state}|${look}`, () => {
      const col = looks[look], th = [0.04, 0.38, 0.8][state], pad = INK_B * 1.5, J = 2.1 * R;
      return bake(-1.2 * R - pad, -J * 1.05 - pad, J + 0.4 * R + pad, J * 1.05 + pad, (g) => {
        const jaw = (sgn) => { // a wedge hinged at the origin, turned by sgn * th (-1: the upper jaw, 1: the lower)
          g.save();
          g.rotate(sgn * th);
          const top = [[-0.5 * R, 0], [-0.5 * R, -0.5 * R], [J * 0.55, -0.42 * R], [J, -0.1 * R], [J, 0]];
          poly(g, top.map(([x, y]) => [x, sgn * -y]), col(sgn > 0 ? W_BELLY : W_SCALE), true, INK_B);
          for (let k = 0; k < 4; k++) { const x = (0.5 + k * 0.38) * R; tri(g, x - 0.1 * R, 0, x + 0.1 * R, 0, x, -sgn * 0.45 * R, col(W_FANG), A.INK_W * 0.6); } // fangs, pointing into the gap
          g.restore();
        };
        if (th > 0.2) poly(g, [[-0.4 * R, 0], [J * 0.9, -Math.sin(th) * J * 0.9], [J * 0.9, Math.sin(th) * J * 0.9]], col(W_MAW), true, INK_B * 0.7); // the dark throat
        jaw(-1);
        jaw(1);
      });
    });
  }
  // The collar: the top of its straight part at the origin, the axis down +y, +x toward the ship (the pale belly side). stage by its ice.
  function wyrmCollarPic(len, r, stage, look) {
    return get(`wcollar|${Math.round(len)}|${Math.round(r)}|${stage}|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-r * 1.35 - pad, -r * 1.9 - pad, r * 1.35 + pad, len + r + pad, (g) => {
        const cap = (x0, x1, y0, y1, fill, ink = true) => {
          g.beginPath();
          g.moveTo(x0, y1);
          g.lineTo(x0, y0);
          g.arc((x0 + x1) / 2, y0, (x1 - x0) / 2, Math.PI, 0);
          g.lineTo(x1, y1);
          g.closePath();
          if (fill) {
            g.fillStyle = fill;
            g.fill();
          }
          if (ink) { g.lineWidth = INK_B; g.stroke(); }
        };
        cap(-r, r, 0, len + r * 0.4, col(W_SCALE));
        g.save();
        g.beginPath();
        g.moveTo(-r, len + r);
        g.lineTo(-r, 0);
        g.arc(0, 0, r, Math.PI, 0);
        g.lineTo(r, len + r);
        g.closePath();
        g.clip();
        poly(g, [[r * 0.25, -r], [r * 1.2, -r], [r * 1.2, len + r], [r * 0.25, len + r]], col(W_BELLY), false); // the pale belly side, toward the ship
        for (let k = 0; k < 5; k++) poly(g, [[-r, len * (0.12 + 0.2 * k)], [r, len * (0.12 + 0.2 * k) - r * 0.1], [r, len * (0.12 + 0.2 * k) + r * 0.05], [-r, len * (0.12 + 0.2 * k) + r * 0.15]], col(W_DARK), false); // plate bands
        poly(g, [[-r * 0.8, -r * 0.8], [-r * 0.45, -r * 0.9], [-r * 0.4, len], [-r * 0.7, len]], hiColor(look), false);
        if (stage >= 1) poly(g, [[-r, -r * 0.2], [r * 0.2, -r * 1.1], [r * 0.2, len * 0.55], [-r, len * 0.5]], col(stage === 2 ? W_ICE : W_ICE_LT), false); // the ice on its back
        if (stage === 2) {
          poly(g, [[-r * 0.9, -r * 0.1], [-r * 0.3, -r * 0.9], [-r * 0.25, len * 0.35], [-r * 0.85, len * 0.3]], col(W_ICE_LT), false);
          g.beginPath();
          g.moveTo(-r * 0.5, len * 0.1);
          g.lineTo(-r * 0.2, len * 0.3);
          g.lineTo(-r * 0.55, len * 0.5);
          g.lineWidth = A.INK_W * 0.55;
          g.stroke();
        }
        g.restore();
        cap(-r, r, 0, len + r * 0.4, null, true);
        if (stage >= 1) for (let k = 0; k < (stage === 2 ? 4 : 2); k++) tri(g, -r + k * 0.5 * r + 0.1 * r, -0.2 * r, -r + k * 0.5 * r + 0.55 * r, -0.2 * r, -r + k * 0.5 * r + 0.3 * r, -r * (stage === 2 ? 1.5 : 1.15) + (k % 2) * 0.2 * r, col(W_ICE_LT), A.INK_W * 0.7); // icicles on the crown
      });
    });
  }
  // The underbelly (the heart, phase 3): a soft pale plate where the ice has fallen from its flank, a pink spot at its middle.
  function wyrmBellyPic(R, look) {
    return get(`wbelly|${Math.round(R)}|${look}`, () => {
      const col = looks[look], pad = INK_B * 1.5;
      return bake(-1.2 * R - pad, -1.2 * R - pad, 1.2 * R + pad, 1.2 * R + pad, (g) => {
        poly(g, [[0, -1.05 * R], [0.9 * R, -0.5 * R], [0.95 * R, 0.5 * R], [0, 1.05 * R], [-0.9 * R, 0.5 * R], [-0.95 * R, -0.5 * R]], col(W_BELLY), true, INK_B);
        g.beginPath();
        g.arc(0, 0, 0.5 * R, 0, Math.PI * 2);
        g.fillStyle = col(W_SOFT);
        g.fill();
        g.lineWidth = A.INK_W * 0.8;
        g.stroke();
        poly(g, [[-0.25 * R, -0.25 * R], [0.05 * R, -0.35 * R], [0.1 * R, -0.1 * R]], hiColor(look), false);
        for (const [x, y] of [[-0.7, -0.15], [0.7, -0.2], [-0.5, 0.6], [0.5, 0.65]]) tri(g, (x - 0.12) * R, y * R, (x + 0.12) * R, y * R, x * R, (y + 0.22) * R, col(W_DARK), A.INK_W * 0.5);
      });
    });
  }
  function drawWyrmLimb(p) {
    const look = lookOf(p), n = p.segs.length;
    for (let i = 0; i < n; i++) {
      const s = p.segs[i];
      if (!!s.behind !== behindPass) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (Math.cos(s.ang) < 0) ctx.scale(1, -1); // (the light stays on top)
      blit(wyrmSegPic(s, wyIce(p, i), look === 'lit' && p.iceFlash > 0 ? 'flash' : look));
      ctx.restore();
    }
  }
  function drawWyrm(body) {
    const wy = body.wyrm, by = (id) => body.parts.find((q) => q.id === id);
    if (!wy || !wy.shown) return;
    const collar = by('collar'), limb = by('wyrm'), head = by('head'), mouth = by('mouth'), belly = by('belly');
    const lk = (p) => (p.iceFlash > 0 && lookOf(p) === 'lit' ? 'flash' : lookOf(p));
    if (collar && !collar.dead && collar.segs[0]) {
      const s = collar.segs[0];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(body.f, 1);
      blit(wyrmCollarPic(s.len, s.r, wyIce(collar, 0), lk(collar)));
      ctx.restore();
    }
    if (belly && !belly.dead && !belly.hidden && belly.segs[0]) {
      const s = belly.segs[0];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.scale(body.f, 1);
      blit(wyrmBellyPic(s.r, lookOf(belly)));
      ctx.restore();
    }
    if (limb && !limb.dead) drawWyrmLimb(limb);
    if (head && !head.dead && head.segs[0]) {
      const s = head.segs[0];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (Math.cos(s.ang) < 0) ctx.scale(1, -1);
      blit(wyrmHeadPic(s.len, s.r, wyIce(head, 0), lk(head)));
      ctx.restore();
    }
    if (mouth && !mouth.dead && mouth.segs[0]) {
      const s = mouth.segs[0];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (Math.cos(s.ang) < 0) ctx.scale(1, -1);
      blit(wyrmMouthPic(s.r, mouth.openAmt < 0.25 ? 0 : mouth.openAmt < 0.75 ? 1 : 2, lookOf(mouth)));
      ctx.restore();
    }
  }

  // ---- drawing ------------------------------------------------------------------------------------------------------------------------------------------------
  const lookOf = (p) => (p.hit > 0 ? 'flash' : p.lit ? 'lit' : 'dim');

  // A limb's segments, root to tip, in whatever transform the caller has set (also used for tumbling debris: a part-like { segs, side, lit, hit, severed }).
  // (a limb wrapped round a ship has segments that pass BEHIND her hull: setWrap marks them s.behind; draw() leaves them out and drawBehind() draws only them, before the ship)
  let behindPass = false;
  function drawLimb(p) {
    if (p.art === 'thunderbird') return drawBirdLimb(p); // (C.6b: the Thunderbird's feathers, also a plucked wing tumbling)
    if (p.art === 'titan') return drawTitanLimb(p); // (C.6c: the Titan's stone arm, also an arm shelled off tumbling)
    if (p.id === 'wyrm') return drawWyrmLimb(p); // (C.6d: the Rime Wyrm's body, iced; also its coil passing behind the ship)
    if (p.kind === 'wing' || p.kind === 'neck' || p.kind === 'tail') return drawDrakeLimb(p); // (the Cinder Drake's limbs, also its torn-off wing tumbling)
    const look = lookOf(p), n = p.segs.length;
    for (let i = 0; i < n; i++) {
      const s = p.segs[i];
      if (!!s.behind !== behindPass) continue;
      const mode = i === n - 1 ? (p.severed ? 'cut' : 'tip') : 'mid';
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (p.side < 0) ctx.scale(1, -1);
      blit(segPic(s, mode, look));
      ctx.restore();
    }
  }

  function drawRigid(body, p) {
    const s = p.segs[0], look = lookOf(p);
    ctx.save();
    if (p.kind === 'mantle') {
      const k = 1 + config.CREATURES.BREATH.AMOUNT * body.puff; // the held breath: a snap, not a swell
      const cx = s.x + Math.cos(s.ang) * s.len * 0.5, cy = s.y + Math.sin(s.ang) * s.len * 0.5;
      ctx.translate(cx, cy);
      ctx.scale(k, k);
      ctx.translate(-cx, -cy);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (body.f < 0) ctx.scale(1, -1);
      blit(mantlePic(s, look));
    } else if (p.kind === 'eye') {
      ctx.translate(s.x, s.y);
      if (p.at[0] * body.f > 0) ctx.scale(-1, 1);
      blit(eyePic(s.r, look));
    } else if (p.kind === 'mouth') {
      ctx.translate(s.x, s.y);
      blit(mouthPic(s.r, p.openAmt < 0.25 ? 0 : p.openAmt < 0.75 ? 1 : 2, look));
    } else if (p.kind === 'heart') {
      ctx.translate(s.x, s.y);
      blit(heartPic(s.r, look));
    }
    ctx.restore();
  }

  function draw(body, view = {}) {
    const S = clamp((view.zoom || 1) * (view.dpr || 1) * A.SS, A.MIN_SCALE, A.MAX_SCALE);
    const bucket = Math.round(Math.log2(S) * 2) / 2;
    scale = Math.pow(2, bucket);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, new Map());
      while (buckets.size > A.BUCKETS_KEPT) buckets.delete(buckets.keys().next().value);
    }
    cache = buckets.get(bucket);
    stats.blits = 0;
    stats.bakes = 0;
    if (body.kind === 'drake') return drawDrake(body); // (C.6a)
    if (body.kind === 'thunderbird') return drawBird(body); // (C.6b)
    if (body.kind === 'titan') return drawTitan(body); // (C.6c)
    if (body.kind === 'wyrm') return drawWyrm(body); // (C.6d)
    for (const p of body.parts) if (p.limb && !p.dead && p.layer === 'back') drawLimb(p);
    for (const p of body.parts) if (!p.limb && !p.dead && !p.hidden && p.kind === 'mantle') drawRigid(body, p);
    for (const p of body.parts) if (!p.limb && !p.dead && !p.hidden && p.kind !== 'mantle') drawRigid(body, p);
    for (const p of body.parts) if (p.limb && !p.dead && p.layer !== 'back') drawLimb(p);
  }
  // The second pass of a wrapped limb: only its segments behind the ship (render.js calls this before the ships are drawn, and draw() after).
  function drawBehind(body, view = {}) {
    if (!body.parts.some((p) => p.wrap && !p.dead)) return;
    const S = clamp((view.zoom || 1) * (view.dpr || 1) * A.SS, A.MIN_SCALE, A.MAX_SCALE);
    const bucket = Math.round(Math.log2(S) * 2) / 2;
    scale = Math.pow(2, bucket);
    if (!buckets.has(bucket)) buckets.set(bucket, new Map());
    cache = buckets.get(bucket);
    behindPass = true;
    for (const p of body.parts) if (p.limb && !p.dead && p.wrap) drawLimb(p);
    behindPass = false;
  }
  // Debris and other callers draw limbs on their own: make sure there is a cache for the current scale first.
  function drawLimbAt(p, view = {}) {
    const S = clamp((view.zoom || 1) * (view.dpr || 1) * A.SS, A.MIN_SCALE, A.MAX_SCALE);
    const bucket = Math.round(Math.log2(S) * 2) / 2;
    scale = Math.pow(2, bucket);
    if (!buckets.has(bucket)) buckets.set(bucket, new Map());
    cache = buckets.get(bucket);
    drawLimb(p);
  }

  // C.6c: a Titan's boulder (radius r), centred on the current transform.
  function drawBoulderAt(r, view = {}) {
    const S = clamp((view.zoom || 1) * (view.dpr || 1) * A.SS, A.MIN_SCALE, A.MAX_SCALE);
    const bucket = Math.round(Math.log2(S) * 2) / 2;
    scale = Math.pow(2, bucket);
    if (!buckets.has(bucket)) buckets.set(bucket, new Map());
    cache = buckets.get(bucket);
    blit(titanBoulderPic(r, 'lit'));
  }

  return { draw, drawBehind, drawLimb: drawLimbAt, drawBoulder: drawBoulderAt, stats, clear: () => buckets.clear() };
}
