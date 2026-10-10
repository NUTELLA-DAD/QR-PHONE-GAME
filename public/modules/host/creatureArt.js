// Drawing for the giant creatures (BOSSES.md 3.3), in the storybook gouache style: one ink colour (config.INK), flat fills, one soft highlight band, no gradients, no shadowBlur.
// Enemy shape language, like the gunships: angular, spiky and a bit lopsided, charcoal spikes, bone-coloured triangular suckers in rows.
//   createCreatureArt({ ctx, makeCanvas }) -> { draw(body, { zoom, dpr }), drawLimb(part, view), stats, clear }
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

  // ---- drawing ------------------------------------------------------------------------------------------------------------------------------------------------
  const lookOf = (p) => (p.hit > 0 ? 'flash' : p.lit ? 'lit' : 'dim');

  // A limb's segments, root to tip, in whatever transform the caller has set (also used for tumbling debris: a part-like { segs, side, lit, hit, severed }).
  function drawLimb(p) {
    const look = lookOf(p), n = p.segs.length;
    for (let i = 0; i < n; i++) {
      const s = p.segs[i];
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
    for (const p of body.parts) if (p.limb && !p.dead && p.layer === 'back') drawLimb(p);
    for (const p of body.parts) if (!p.limb && !p.dead && !p.hidden && p.kind === 'mantle') drawRigid(body, p);
    for (const p of body.parts) if (!p.limb && !p.dead && !p.hidden && p.kind !== 'mantle') drawRigid(body, p);
    for (const p of body.parts) if (p.limb && !p.dead && p.layer !== 'back') drawLimb(p);
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

  return { draw, drawLimb: drawLimbAt, stats, clear: () => buckets.clear() };
}
