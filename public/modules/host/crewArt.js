// Crew and raiders in the "1930s storybook gouache" style, drawn as vector shapes (no sprite files):
// flat matte fills, ONE shadow tone per shape, thin dark-brown ink outlines, a whisper of paper grain.
// Crew are animal aviators (player-coloured flight jacket, scarf, goggles pushed up, mitten hands).
// Raiders are enemy-palette (oxblood / charcoal / bone): skeleton grunts + sappers, devil brutes, bat cutters.
//
// draw(p, time, bob, hop, drawCarry) paints one character with its feet at p.x, p.y (everything is relative
// to the feet, facing right, flipped for face = -1). It does the whole-body transforms (size, tumble, squash,
// KO) itself. Fixed shapes only - nothing wobbles. It never throws.
import { config } from '../../config.js';
import { paintPath } from './textureArt.js';

const BROWN = '#33261f'; // ink: dark brown, not black
const OL = 1.25; // outline half-width (line = 2.5 px)
const PAPER = '#efe3c8';
const BONE = '#e6dcc4';
const OX = '#a8443f';
const OXL = '#c9706a';
const CHAR = '#4a4346';

const hex = (c) => {
  c = String(c || '#888');
  if (c[0] !== '#' || (c.length !== 7 && c.length !== 4)) return [136, 136, 136];
  if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16) || 0);
};
const mix = (a, b, t) => {
  const A = hex(a);
  const B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const shade = (c) => mix(c, '#3b2a3a', 0.26);
const light = (c) => mix(c, '#fff4dc', 0.3);

// Species looks (fur colour itself comes from config.SPECIES).
const SP = {
  bulldog: { muz: '#e8d6b8', ear: 'floppy', earCol: '#7d5a3d', snout: 9, jowl: 1 },
  wolf: { muz: '#dcdde0', ear: 'point', earIn: '#bf9a98', snout: 12, tail: 'bush' },
  tiger: { muz: '#f4e7cc', ear: 'point', earIn: '#f0c9a4', snout: 9, stripes: 1, tail: 'stripe' },
  shiba: { muz: '#f2e6cc', ear: 'point', earIn: '#f0d3b0', snout: 9, tail: 'curl', cheeks: 1 },
  fox: { muz: '#f4eadb', ear: 'point', earIn: '#4a3b36', snout: 12, tail: 'fox', cheeks: 1 },
  bear: { muz: '#cfae84', ear: 'round', earIn: '#b99870', snout: 8, tail: 'nub' },
  cat: { muz: '#dedad2', ear: 'point', earIn: '#e6b5b0', snout: 7, tail: 'long', whiskers: 1, stripes: 1 },
  rabbit: { muz: '#f7f0e6', ear: 'long', earIn: '#e8b0aa', snout: 6, tail: 'puff', buck: 1 },
};

export function createCrewArt({ ctx }) {
  const path = (fn) => () => {
    ctx.beginPath();
    fn();
  };

  // Fill (shade crescent underneath, flat colour on top shifted up-left), optional paper grain, then outline.
  const shape = (fn, fill, sh, tex, texA) => {
    const P = path(fn);
    P();
    ctx.fillStyle = sh || fill;
    ctx.fill();
    if (sh) {
      ctx.save();
      P();
      ctx.clip();
      ctx.translate(-2.4, -3);
      P();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.restore();
    }
    if (tex) {
      P();
      paintPath(ctx, tex, texA || 0.5);
    }
    P();
    ctx.stroke();
  };
  const ell = (x, y, rx, ry, rot = 0) => () => ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  const poly = (...pts) => () => {
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.closePath();
  };
  const rr = (x, y, w, h, r) => () => ctx.roundRect(x, y, w, h, r);

  // A thick round-capped limb with an ink outline.
  const limb = (x1, y1, x2, y2, w, col) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = w + OL * 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = 2.5;
  };
  const dot = (x, y, r, fill) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };

  // ---------- poses (angle 0 = hanging down, negative = swung forward/up) ----------
  const poseOf = (p, time) => {
    const now = performance.now();
    const swingAge = now - (p.swingT || -1e9);
    const walk = p.moving ? Math.sin(time * 11) : 0;
    const o = { fa: -walk * 0.5, ba: walk * 0.5, fl: walk * 0.55, bl: -walk * 0.55, swingAge, effort: !!((p.fire && p.act && p.act.hold) || swingAge < 300 || p.windup > 0), up: false };
    if (p.fly || p.tumble) {
      o.fa = o.ba = -2.9 + Math.sin(time * 14) * 0.25;
      o.fl = 0.5 + Math.sin(time * 14) * 0.2;
      o.bl = -0.4 - Math.sin(time * 14) * 0.2;
      o.up = true;
    } else if (p.air) {
      o.fa = o.ba = -2.6;
      o.up = true;
    } else if (p.climb) {
      o.fa = -2.8 + Math.sin(time * 10) * 0.4;
      o.ba = -2.8 - Math.sin(time * 10) * 0.4;
      o.fl = Math.sin(time * 10) * 0.3;
      o.bl = -o.fl;
      o.up = true;
    } else if (p.lock) o.fa = o.ba = -1.3;
    else if (p.windup > 0) o.fa = -2.9;
    else if (swingAge < 250) o.fa = -2.7 + (swingAge / 250) * 2.2;
    else if (p.carry === 'ammo' || p.carry === 'coal' || p.carry === 'ice') o.fa = o.ba = -1.1;
    else if (p.carry || p.weapon) o.fa = -0.6;
    else if (p.fire && p.act && p.act.hold) o.fa = -1.2 + Math.sin(time * 18) * 0.3;
    return o;
  };

  // ---------- raider weapons (point up from the fist, then are turned by the swing) ----------
  const weapon = (kind, x, y, a, time) => {
    ctx.save();
    ctx.translate(x, y);
    if (kind === 'bomb') {
      shape(ell(3, -5, 8.5, 8.5), '#58504f', '#3b3536');
      ctx.beginPath();
      ctx.moveTo(3, -13);
      ctx.quadraticCurveTo(7, -20, 12, -18);
      ctx.stroke();
      const f = 0.6 + 0.4 * Math.abs(Math.sin(time * 16));
      dot(12, -18, 2.4 * f + 1, '#e8884a');
      ctx.restore();
      return;
    }
    ctx.rotate(-0.4 + (a + 2.9) * 0.75);
    if (kind === 'sword') {
      shape(poly(-2.2, -8, 2.2, -8, 4, -30, 0.5, -42, -2.6, -30), '#cfd0c6', '#a9aba2'); // cutlass blade
      shape(rr(-6, -9, 12, 3.5, 1.5), '#c9a85a', '#a88b44'); // guard
      shape(rr(-2.2, -6, 4.4, 12, 2), '#6b4a32'); // grip
    } else if (kind === 'club') {
      shape(poly(-3, 4, 3, 4, 7, -30, 3, -38, -5, -36, -7, -28), '#8a6644', '#6b4a32', 'darkwood', 0.5);
      for (const [sx, sy] of [[-8, -26], [8, -22], [8, -33]]) shape(poly(sx * 0.7, sy - 3, sx * 1.35, sy, sx * 0.7, sy + 3), '#cfd0c6');
    } else {
      shape(poly(-2, -6, 2, -6, 3, -22, 10, -30, 12, -24, 6, -18, -1, -12), '#cfd0c6', '#a9aba2'); // hooked cleaver
      shape(rr(-2.2, -6, 4.4, 12, 2), '#6b4a32');
    }
    ctx.restore();
  };

  // ---------- crew / raider building blocks ----------
  const tailOf = (S, fur, time, mv) => {
    const wag = Math.sin(time * (mv ? 9 : 4)) * 0.18;
    ctx.save();
    ctx.translate(-11, -23);
    const t = S.tail || 'nub';
    if (t === 'puff') shape(ell(-4, 0, 6.5, 6.5), light(PAPER), shade(PAPER));
    else if (t === 'nub') shape(ell(-4, 0, 5, 4.5), fur, shade(fur));
    else if (t === 'curl') {
      ctx.rotate(wag);
      limb(0, 0, -9, -8, 8, fur);
      shape(ell(-9, -14, 6.5, 6.5), fur, shade(fur));
      shape(ell(-9, -14, 2.4, 2.4), PAPER);
    } else if (t === 'long') {
      ctx.rotate(wag * 1.4);
      limb(0, 0, -14, -6, 5.5, fur);
      limb(-14, -6, -20, -18, 5.5, fur);
    } else {
      ctx.rotate(-0.45 + wag);
      const big = t === 'fox' || t === 'bush';
      shape(ell(-14, 0, big ? 17 : 13, big ? 7.5 : 5.5), fur, shade(fur));
      if (t === 'fox') shape(() => { ctx.ellipse(-26, 0, 6, 6.2, 0, -Math.PI / 2, Math.PI / 2, true); ctx.closePath(); }, PAPER, shade(PAPER));
      if (t === 'stripe') {
        ctx.strokeStyle = '#5a3a28';
        ctx.lineWidth = 2.4;
        for (const x of [-9, -15, -21]) {
          ctx.beginPath();
          ctx.moveTo(x, -5);
          ctx.lineTo(x, 5);
          ctx.stroke();
        }
        ctx.strokeStyle = BROWN;
        ctx.lineWidth = 2.5;
      }
    }
    ctx.restore();
  };

  const eye = (x, y, p, o, ko, sock) => {
    if (ko) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y - 3.5);
      ctx.lineTo(x + 3.5, y + 3.5);
      ctx.moveTo(x + 3.5, y - 3.5);
      ctx.lineTo(x - 3.5, y + 3.5);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      return;
    }
    if (sock) {
      dot(x, y, 5.2, CHAR);
      dot(x + 1.2, y + 0.4, 1.7, o.effort ? '#e8884a' : '#f2d36b');
      return;
    }
    dot(x, y, 5.2, '#fbf7ea');
    ctx.fillStyle = BROWN;
    ctx.beginPath();
    ctx.arc(x + 1.8, y + 0.6, 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (o.effort) {
      // scrunched brow
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x - 5.5, y - 6.5);
      ctx.lineTo(x + 5, y - 3);
      ctx.stroke();
      ctx.lineWidth = 2.5;
    }
  };

  // The animal's head (centre ~ (2, -62)). Ears first (behind), then head, muzzle, face, goggles.
  const crewHead = (p, S, fur, o, time) => {
    const hx = 2;
    const hy = -62 + Math.sin(time * 3) * 0.5;
    const fs = shade(fur);
    const ko = p.ko > 0;
    ctx.save();
    ctx.translate(0, hy + 62);
    const earIn = S.earIn || '#d9a0a0';
    if (S.ear === 'point') {
      const tall = p.species === 'cat' ? 26 : 23;
      shape(poly(hx - 14, -70, hx - 2, -72, hx - 9, -62 - tall), mix(fur, '#3b2a3a', 0.12), fs);
      shape(poly(hx + 1, -73, hx + 14, -69, hx + 10, -62 - tall), fur, fs);
      ctx.fillStyle = earIn;
      ctx.beginPath();
      ctx.moveTo(hx + 4, -72);
      ctx.lineTo(hx + 11, -70);
      ctx.lineTo(hx + 9.5, -62 - tall + 7);
      ctx.fill();
    } else if (S.ear === 'long') {
      shape(ell(hx - 9, -90, 5.5, 18, -0.4), mix(fur, '#3b2a3a', 0.1), fs);
      shape(ell(hx + 5, -92, 6, 19, 0.12), fur, fs);
      ctx.fillStyle = earIn;
      ctx.beginPath();
      ctx.ellipse(hx + 5, -91, 2.8, 13, 0.12, 0, Math.PI * 2);
      ctx.fill();
    } else if (S.ear === 'round') {
      shape(ell(hx - 13, -78, 8, 8), mix(fur, '#3b2a3a', 0.12), fs);
      shape(ell(hx + 11, -79, 8, 8), fur, fs);
      dot(hx + 11, -79, 3.6, earIn);
    }
    // head
    shape(ell(hx, -62, 21.5, 19.5), fur, fs, 'canvas', 0.35);
    if (S.cheeks) shape(poly(hx - 20, -56, hx - 8, -50, hx - 14, -44), S.muz, shade(S.muz));
    if (S.stripes) {
      ctx.strokeStyle = p.species === 'cat' ? '#6f6f70' : '#5a3a28';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      for (const [x, y, l] of [[-8, -80, 8], [0, -81, 9], [8, -80, 8]]) {
        ctx.moveTo(hx + x, y);
        ctx.lineTo(hx + x * 0.8, y + l);
      }
      ctx.moveTo(hx - 20, -62);
      ctx.lineTo(hx - 13, -60);
      ctx.moveTo(hx - 19, -54);
      ctx.lineTo(hx - 12, -54);
      ctx.stroke();
      ctx.strokeStyle = BROWN;
      ctx.lineWidth = 2.5;
    }
    // muzzle
    const sn = S.snout;
    shape(ell(hx + 11 + sn * 0.35, -55, 5 + sn, 7.5), S.muz, shade(S.muz));
    if (S.jowl) shape(ell(hx + 15, -49, 8, 4.5), S.muz, shade(S.muz));
    shape(ell(hx + 14 + sn, -59.5, 3.2, 2.5), '#4a3b36');
    ctx.beginPath();
    ctx.moveTo(hx + 14 + sn, -57);
    ctx.lineTo(hx + 14 + sn, -53);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hx + 12 + sn * 0.7, -53, 3.5, 0.2, Math.PI - 0.5);
    ctx.stroke();
    if (ko) shape(ell(hx + 12 + sn * 0.7, -48, 2.6, 4), '#d88a8a');
    if (S.buck && !ko) shape(rr(hx + 11 + sn * 0.7, -52, 4, 6, 1), '#fbf7ea');
    if (S.whiskers) {
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const dy of [-2, 2]) {
        ctx.moveTo(hx + 16, -54 + dy);
        ctx.lineTo(hx + 30, -56 + dy * 2);
      }
      ctx.stroke();
      ctx.lineWidth = 2.5;
    }
    // goggles pushed up on the forehead: leather strap right round the head, one brass lens
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(hx, -62, 21.5, 19.5, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = 8.5;
    ctx.beginPath();
    ctx.moveTo(hx - 24, -69);
    ctx.quadraticCurveTo(hx, -75, hx + 24, -69);
    ctx.stroke();
    ctx.strokeStyle = '#7a5538';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(hx - 24, -69);
    ctx.quadraticCurveTo(hx, -75, hx + 24, -69);
    ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'round';
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = 2.5;
    shape(ell(hx + 6, -73.5, 7.4, 7.4), '#c9a85a', '#a88b44');
    shape(ell(hx + 6.3, -73.5, 4.6, 4.6), '#bcd6dc', '#97b9c2');
    ctx.fillStyle = '#f4fbfb';
    ctx.beginPath();
    ctx.arc(hx + 4.6, -75, 1.2, 0, Math.PI * 2);
    ctx.fill();
    // eye
    eye(hx + 8, -61, p, o, ko, false);
    // floppy bulldog ear hangs in front of the head
    if (S.ear === 'floppy') shape(ell(hx - 11, -56, 7.5, 14, 0.25), S.earCol, shade(S.earCol));
    ctx.restore();
  };

  const raiderHead = (p, type, o, time) => {
    const hx = 2;
    const ko = p.ko > 0;
    ctx.save();
    ctx.translate(0, Math.sin(time * 3) * 0.5);
    if (type === 'brute') {
      // devil: oxblood skin, charcoal horns, tusks, yellow eyes
      const skin = '#b4524a';
      shape(poly(hx - 8, -76, hx - 15, -90, hx - 20, -98, hx - 9, -92, hx - 2, -78), CHAR, '#352f32'); // far horn
      shape(poly(hx + 5, -78, hx + 6, -94, hx + 11, -104, hx + 14, -90, hx + 14, -76), CHAR, '#352f32'); // near horn
      shape(ell(hx, -62, 23, 19.5), skin, shade(skin), 'oxblood', 0.45);
      shape(poly(hx - 10, -75, hx - 3, -80, hx + 22, -70, hx + 22, -73, hx + 6, -84), shade(skin)); // heavy brow
      shape(ell(hx + 14, -52, 11, 8), '#c4655d', shade('#c4655d'));
      shape(poly(hx + 12, -50, hx + 15, -50, hx + 14, -42), BONE); // tusk
      shape(poly(hx + 22, -50, hx + 24, -48, hx + 21, -42), BONE);
      ctx.beginPath();
      ctx.moveTo(hx + 5, -47);
      ctx.lineTo(hx + 25, -49);
      ctx.stroke();
      dot(hx + 22, -58, 2, '#3b2a3a');
      if (ko) eye(hx + 8, -63, p, o, true, false);
      else {
        shape(ell(hx + 8, -63, 5.8, 5), '#f2d36b');
        ctx.fillStyle = BROWN;
        ctx.fillRect(hx + 8, -66, 2.4, 6);
        shape(poly(hx + 1, -71, hx + 14, -66, hx + 13, -68.5, hx + 1, -74), shade(skin));
      }
    } else if (type === 'cutter') {
      // bat: charcoal-plum fur, huge ears, red-gold eyes, little fangs
      const fur = '#5b4b60';
      shape(poly(hx - 14, -72, hx - 4, -76, hx - 12, -104), mix(fur, '#2b222c', 0.2), shade(fur));
      shape(poly(hx + 2, -78, hx + 14, -72, hx + 14, -106), fur, shade(fur));
      ctx.fillStyle = OXL;
      ctx.beginPath();
      ctx.moveTo(hx + 6, -78);
      ctx.lineTo(hx + 12, -75);
      ctx.lineTo(hx + 12, -98);
      ctx.fill();
      shape(ell(hx, -62, 20, 18.5), fur, shade(fur), 'charcoal', 0.4);
      shape(ell(hx + 14, -54, 9, 7), '#7d6a80', '#665669');
      dot(hx + 21, -58, 2.2, '#2b222c');
      ctx.beginPath();
      ctx.moveTo(hx + 7, -52);
      ctx.lineTo(hx + 22, -52);
      ctx.stroke();
      shape(poly(hx + 11, -52, hx + 14, -52, hx + 12.5, -46), '#fbf7ea');
      shape(poly(hx + 18, -52, hx + 21, -52, hx + 19.5, -46), '#fbf7ea');
      if (ko) eye(hx + 7, -63, p, o, true, false);
      else {
        shape(ell(hx + 7, -63, 5, 5.2), '#e8884a');
        ctx.fillStyle = BROWN;
        ctx.beginPath();
        ctx.arc(hx + 8.5, -63, 2, 0, Math.PI * 2);
        ctx.fill();
        if (o.effort) {
          ctx.beginPath();
          ctx.moveTo(hx + 1, -71);
          ctx.lineTo(hx + 12, -66);
          ctx.stroke();
        }
      }
    } else {
      // skeleton: bone skull, charcoal sockets, oxblood bandana with a flapping knot
      shape(ell(hx, -62, 19.5, 19), BONE, shade(BONE), 'canvas', 0.3);
      shape(rr(hx - 6, -50, 22, 11, 3), BONE, shade(BONE)); // jaw
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = hx - 1; x < hx + 16; x += 4.2) {
        ctx.moveTo(x, -50);
        ctx.lineTo(x, -40);
      }
      ctx.stroke();
      ctx.lineWidth = 2.5;
      shape(poly(hx + 14, -56, hx + 19, -53, hx + 12, -52), CHAR);
      eye(hx + 7, -62, p, o, ko, true);
      dot(hx - 8, -62, 3.6, CHAR);
      // bandana
      shape(() => {
        ctx.moveTo(hx - 20, -66);
        ctx.quadraticCurveTo(hx, -86, hx + 20, -68);
        ctx.lineTo(hx + 19, -74);
        ctx.quadraticCurveTo(hx, -90, hx - 19, -74);
        ctx.closePath();
      }, OX, shade(OX), 'oxblood', 0.5);
      const fl = Math.sin(time * 8) * 3;
      shape(poly(hx - 20, -72, hx - 30, -76 + fl, hx - 28, -68 + fl, hx - 21, -66), OX, shade(OX));
      shape(poly(hx - 20, -70, hx - 31, -66 + fl, hx - 24, -62 + fl, hx - 20, -65), OXL, OX);
    }
    ctx.restore();
  };

  // A small navy patch with a cream anchor (ship's mates only), centred on (x, y).
  const anchorBadge = (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = 1.5;
    dot(0, 0, 5.6, '#2f3b4a');
    ctx.strokeStyle = '#f2ead6';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(0, -3.4); // shank
    ctx.lineTo(0, 3);
    ctx.moveTo(-1.8, -1.8); // stock
    ctx.lineTo(1.8, -1.8);
    ctx.moveTo(-3, 0.6); // flukes
    ctx.arc(0, 0.2, 3, Math.PI * 0.85, Math.PI * 0.15, true);
    ctx.stroke();
    ctx.restore();
  };

  // ---------- whole character ----------
  const figure = (p, time) => {
    const type = p.type;
    const raider = !!type;
    const o = poseOf(p, time);
    const ko = p.ko > 0;
    const sp = config.SPECIES[p.species] || config.SPECIES.bulldog;
    const S = SP[p.species] || SP.bulldog;
    const fur = mix(sp.fur || '#b08a62', PAPER, 0.1);
    const cloth = p.color || '#3a86ff';
    const jacket = raider ? CHAR : mix(cloth, PAPER, 0.06);
    const pants = raider ? '#3a3437' : mix(cloth, '#4a3828', 0.5);
    const kind = type === 'cutter' ? 'bat' : type === 'brute' ? 'devil' : type ? 'skel' : 'crew';
    const bulk = kind === 'devil' ? 1.18 : 1;
    const skin = kind === 'devil' ? '#b4524a' : kind === 'bat' ? '#5b4b60' : kind === 'skel' ? BONE : fur;
    const sx = 0;
    const sy = -41; // shoulders
    const hipY = -17;
    const tip = (x, y, a, L) => [x - Math.sin(a) * L, y + Math.cos(a) * L];

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = BROWN;
    ctx.lineWidth = 2.5;

    // tail
    if (kind === 'crew') tailOf(S, fur, time, p.moving);
    else if (kind === 'devil') {
      ctx.save();
      ctx.translate(-10, -22);
      const w = Math.sin(time * 5) * 3;
      limb(0, 0, -14, -6 + w, 4, '#a24840');
      shape(poly(-14, -6 + w, -22, -12 + w, -18, -3 + w), '#a24840', '#7e3530');
      ctx.restore();
    } else if (kind === 'bat') {
      // bats hang a little tuft
    }

    // back limbs (a shade darker)
    const limbCol = kind === 'skel' ? BONE : kind === 'crew' ? fur : skin;
    const handR = kind === 'devil' ? 6.2 : 4.8;
    const armW = kind === 'skel' ? 5 : kind === 'devil' ? 10 : 7.5;
    const armL = 23;
    const batWing = (x, y, [hx, hy], col) => {
      shape(poly(x, y - 3, hx, hy, hx - 12, hy + 6, hx - 15, hy - 6, x - 22, y + 14, x - 12, y + 2), col, shade(col));
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - 12, hy + 6);
      ctx.moveTo(hx, hy);
      ctx.lineTo(x - 22, y + 14);
      ctx.stroke();
      ctx.lineWidth = 2.5;
    };
    const arm = (a, back) => {
      const [hx, hy] = tip(sx + (back ? -3 : 3), sy, a, armL);
      const col = back ? shade(limbCol) : limbCol;
      if (kind === 'bat') {
        batWing(sx + (back ? -3 : 3), sy, [hx, hy], back ? '#4a3d4e' : '#5b4b60');
        return [hx, hy];
      }
      const sleeve = kind === 'crew' ? (back ? shade(jacket) : jacket) : kind === 'skel' ? col : col;
      // upper arm (sleeve for crew), then mitten hand / bony fist
      limb(sx + (back ? -3 : 3), sy, hx, hy, armW, kind === 'crew' ? sleeve : col);
      if (kind === 'crew') {
        const [mx, my] = tip(sx + (back ? -3 : 3), sy, a, armL - 8);
        limb(mx, my, hx, hy, armW - 1, col);
      }
      dot(hx, hy, handR, kind === 'crew' ? (back ? shade(fur) : fur) : kind === 'skel' ? (back ? shade(BONE) : BONE) : col);
      return [hx, hy];
    };
    const leg = (a, back) => {
      const hxp = back ? -4.5 : 4.5;
      const [fx, fy] = tip(hxp, hipY, a, 15);
      const lw = kind === 'skel' ? 5.5 : kind === 'devil' ? 10 : 8.5;
      const col = kind === 'skel' ? (back ? shade(BONE) : BONE) : kind === 'crew' ? (back ? shade(pants) : pants) : kind === 'bat' ? (back ? '#4a3d4e' : '#5b4b60') : back ? shade(skin) : skin;
      limb(hxp, hipY, fx, fy, lw, col);
      const boot = kind === 'crew' ? '#6b4a32' : kind === 'skel' ? CHAR : '#3b3335';
      shape(ell(fx + 3.5, Math.min(-2.5, fy + 0.5), 7.5, 4.6), back ? shade(boot) : boot);
    };
    const backHand = arm(o.ba, true);
    leg(o.bl, true);
    leg(o.fl, false);

    // torso
    const tw = 13 * bulk;
    if (kind === 'crew') {
      shape(rr(-tw, -47, tw * 2, 32, 10), jacket, shade(jacket), 'canvas', 0.55);
      shape(rr(-tw, -22, tw * 2, 5.5, 2), '#7a5538', '#5e4029', 'wood', 0.4); // belt
      shape(rr(-2.5, -22.5, 6, 6.5, 1.5), '#c9a85a', '#a88b44'); // buckle
      ctx.beginPath(); // zip + pocket
      ctx.moveTo(4, -44);
      ctx.lineTo(4, -23);
      ctx.stroke();
      shape(rr(5.5, -38, 8, 8, 2), light(jacket), jacket);
      if (p.mate) anchorBadge(-6.5, -34); // ship's mate: a tiny anchor patch on the chest
    } else if (kind === 'skel') {
      shape(rr(-tw + 1, -46, tw * 2 - 2, 29, 7), CHAR, '#352f32', 'charcoal', 0.5);
      // ribs showing through the torn front
      shape(poly(2, -45, 11, -45, 9, -30, 4, -28), BONE, shade(BONE));
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const y of [-41, -36, -31]) {
        ctx.moveTo(3.5, y);
        ctx.lineTo(10, y - 0.5);
      }
      ctx.stroke();
      ctx.lineWidth = 2.5;
      // ragged hem
      shape(poly(-tw + 1, -22, tw - 1, -22, tw - 1, -14, tw - 5, -17, tw - 8, -12, -2, -17, -6, -11, -tw + 4, -16, -tw + 1, -13), CHAR, '#352f32');
      shape(rr(-tw + 1, -26, tw * 2 - 2, 4.5, 2), OX, shade(OX)); // oxblood sash
    } else if (kind === 'devil') {
      shape(rr(-tw, -48, tw * 2, 34, 12), skin, shade(skin), 'oxblood', 0.55);
      shape(poly(-tw + 1, -46, -3, -46, 3, -20, -tw + 1, -20), CHAR, '#352f32', 'charcoal', 0.5); // charcoal harness vest
      shape(rr(-tw, -23, tw * 2, 6.5, 2), CHAR, '#352f32');
      shape(ell(0, -20, 4.5, 3.8), '#c9a85a', '#a88b44');
    } else {
      shape(ell(0, -31, 12, 16.5), '#5b4b60', shade('#5b4b60'), 'charcoal', 0.5);
      shape(ell(3, -27, 6.5, 10), '#8b7790', '#74627a'); // lighter belly tuft
      shape(rr(-12, -24, 24, 5, 2), CHAR, '#352f32');
    }
    // sapper's satchel of bombs
    if (type === 'sapper') {
      shape(rr(-19, -38, 11, 16, 3), '#6b4a32', '#4f351f', 'darkwood', 0.5);
      dot(-14, -43, 3, '#58504f');
    }
    // scarf (crew): pale tint of the player's colour, tail streaming behind
    if (kind === 'crew') {
      const fl = Math.sin(time * 9) * 3;
      const sc = p.mate ? config.MATES.SCARF : mix(cloth, PAPER, 0.5); // (ship's mates wear a grey scarf)
      const lag = p.moving || p.fly || p.tumble ? 8 : 0;
      shape(poly(-8, -47, -26 - lag, -42 + fl, -28 - lag, -35 + fl, -22 - lag * 0.6, -33 + fl, -6, -40), sc, shade(sc));
      shape(rr(-11, -52, 22, 8.5, 4), sc, shade(sc), 'canvas', 0.5);
    } else if (kind === 'skel') {
      shape(rr(-9, -50, 18, 5.5, 2.5), BONE, shade(BONE));
    } else if (kind === 'devil') {
      shape(rr(-12, -52, 24, 7, 3), shade(skin), shade(shade(skin)));
    }

    // head
    if (kind === 'crew') crewHead(p, S, fur, o, time);
    else raiderHead(p, type, o, time);

    // front arm + what's in the hand
    const [hx, hy] = arm(o.fa, false);
    if (raider) {
      const wk = type === 'sapper' ? 'bomb' : type === 'brute' ? 'club' : type === 'cutter' ? 'cleaver' : 'sword';
      weapon(wk, hx, hy, o.fa, time);
    }
    return { hx, hy, o, ko, backHand };
  };

  const draw = (p, time, bob, hop, drawCarry) => {
    try {
      const face = p.face || 1;
      const size = p.scale || 1;
      ctx.save();
      ctx.translate(p.x, p.y - bob - hop);
      if (size !== 1) ctx.scale(size, size);
      if (p.rot) {
        ctx.translate(0, -30);
        ctx.rotate(p.rot);
        ctx.translate(0, 30);
      }
      if (p.squash > 0) ctx.scale(1 + 0.4 * p.squash, 1 - 0.35 * p.squash);
      if (p.ko > 0) {
        ctx.rotate(-1.4 * face);
        ctx.translate(0, 10);
      }
      // Gunship paratrooper: a little cream-and-sage canopy overhead.
      if (p.fall && !p.tumble) {
        ctx.strokeStyle = BROWN;
        ctx.lineWidth = 2.5;
        ctx.fillStyle = '#eee6d2';
        ctx.beginPath();
        ctx.arc(0, -120, 50, Math.PI, 0);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#8fb37a';
        ctx.beginPath();
        ctx.arc(0, -120, 50, Math.PI * 1.35, Math.PI * 1.65);
        ctx.lineTo(0, -120);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, -120, 50, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-50, -120);
        ctx.lineTo(-10, -50);
        ctx.moveTo(50, -120);
        ctx.lineTo(10, -50);
        ctx.stroke();
      }
      ctx.save();
      ctx.scale(face, 1);
      const f = figure(p, time);
      ctx.restore();
      if (!p.type && p.carry && drawCarry) {
        // Held tool/load: drawn by the game's item art, moved so it sits in the front hand.
        ctx.save();
        ctx.translate(face * f.hx - face * 16, f.hy + 24);
        drawCarry(p.carry, face, f.o.swingAge, !!p.hook);
        ctx.restore();
      }
      if (f.o.swingAge < 200) {
        // Swing: a paper-cream swoosh in front of the attacker.
        ctx.strokeStyle = 'rgba(255,248,226,.92)';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        const mid = face > 0 ? 0 : Math.PI;
        ctx.arc(face * 10, -40, p.carry === 'sword' ? 70 : 45, mid - 0.9, mid + 0.9);
        ctx.stroke();
      }
      ctx.restore();
    } catch (e) {
      try {
        ctx.restore();
      } catch {}
      const list = (globalThis.gameErrors = globalThis.gameErrors || []);
      if (list.length < 50) list.push('crewArt: ' + (e && e.message));
    }
    ctx.strokeStyle = config.INK;
    ctx.lineWidth = config.OUTLINE.MAIN;
  };

  return { draw };
}
