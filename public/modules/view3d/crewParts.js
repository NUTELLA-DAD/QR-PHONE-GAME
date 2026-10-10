// CREW v2 (WP7), the PART LIBRARY: every piece a crewman, a raider or one of their props is made of, as small vertex-coloured geometries (the same inverted-hull ink as the ship: style.js
// piece()), grouped by BONE. crew.js merges the parts of every figure into ONE big mesh and moves each bone with a matrix from a data texture, so 16 crew + raiders cost 2-3 draw calls.
//
// Rig space: feet at the origin (y up), the figure FACES +x, z is toward the viewer when it stands in profile (the camera sees the z+ side of a figure that faces right). Units are the game's
// pixels (the 2D crew is ~100 tall with a head 40% of that; ears and the marker stand above).
// A vertex's colour is either FIXED (baked here: fur, brass, bone ...) or a ROLE (R.*: the player's jacket / trousers / scarf / marker, the fur of the arms): the role's colour for each figure
// comes from the tint texture, so one geometry serves every player.
// Everything is rigid. Nothing here animates; crewPose.js picks the angles, crew.js writes the bone matrices.
import { THREE, piece, mat, G } from './style.js';
import { config } from '../../config.js';

export const NB = 18; // bones per figure
export const B = { TORSO: 0, HEAD: 1, ARM_A: 2, ARM_B: 3, LEG_A: 4, LEG_B: 5, SCARF: 6, TAIL: 7, ITEM: 8, MARK: 9, H0: 10, H1: 11, H2: 12, CHUTE: 13, ROPE: 14, HOOK: 15, SWOOSH: 16, ITEMC: 17 };
export const R = { NONE: 0, JACKET: 1, PANTS: 2, SCARF: 3, MARK: 4, FUR: 5, LIGHT: 6, TEAM: 7, SHADE: 8 };
export const NTINT = 9; // texels per figure in the tint block: slot 0 = the hit flash, 1..8 = the roles

const PAPER = '#efe3c8', BROWN = '#33261f', BONE = '#e6dcc4', OX = '#a8443f', OXL = '#c9706a', CHAR = '#4a4346';
const hex = (c) => { c = String(c || '#888'); if (c[0] !== '#' || (c.length !== 7 && c.length !== 4)) return [136, 136, 136]; if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [1, 3, 5].map((i) => parseInt(c.substr(i, 2), 16) || 0); };
export const mix = (a, b, t) => { const A = hex(a), Bb = hex(b); return '#' + A.map((v, i) => Math.round(v + (Bb[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
export const shade = (c) => mix(c, '#3b2a3a', 0.26);
export const light = (c) => mix(c, '#fff4dc', 0.3);
export { PAPER, BONE, OX, CHAR };

const OW = 2.2, OWS = 1.4; // ink width: body, small things

// ---- shared unit shapes (low polygon: ~1000 triangles a figure in all, ink shells included in the ONE draw) ------------------------------------------------------------
const SP_XS = new THREE.SphereGeometry(1, 6, 4); // 36 triangles
const SP_T = new THREE.SphereGeometry(1, 8, 5); // 64
const SP_L = new THREE.SphereGeometry(1, 9, 6); // 90
const SP_M = new THREE.SphereGeometry(1, 12, 8); // 160 (the head)
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8); // 32
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6); // 24
const CONE = new THREE.ConeGeometry(1, 1, 8);
const BOX = G.box;
const capCache = new Map();
const capsule = (r, totalH) => { const k = r + '|' + totalH; if (!capCache.has(k)) capCache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.1, totalH - 2 * r), 1, 8)); return capCache.get(k); };

// ---- the part collector: pieces by bone -> merged records { bone, n, pos, nor, col, onr, role } ---------------------------------------------------------------------------
class PartSet {
  constructor() { this.by = new Map(); }
  add(bone, geo, color, matrix, ow = 0, role = 0) {
    const g = piece(geo, role ? '#ffffff' : color, matrix, ow);
    const n = g.attributes.position.count;
    g.setAttribute('aRole', new THREE.BufferAttribute(new Float32Array(n).fill(role), 1));
    if (!this.by.has(bone)) this.by.set(bone, []);
    this.by.get(bone).push(g);
    return this;
  }
  box(bone, color, cx, cy, cz, w, h, d, ow = OWS, role = 0, rx = 0, ry = 0, rz = 0) { return this.add(bone, BOX, color, mat(cx, cy, cz, w, h, d, rx, ry, rz), ow, role); }
  sph(bone, color, cx, cy, cz, rx, ry, rz, ow = OWS, role = 0, geo = SP_T, ex = 0, ey = 0, ez = 0) { return this.add(bone, geo, color, mat(cx, cy, cz, rx, ry, rz, ex, ey, ez), ow, role); }
  cyl(bone, color, cx, cy, cz, r, h, ow = OWS, role = 0, rx = 0, ry = 0, rz = 0) { return this.add(bone, CYL, color, mat(cx, cy, cz, r, h, r, rx, ry, rz), ow, role); }
  cone(bone, color, cx, cy, cz, r, h, ow = OWS, role = 0, rx = 0, ry = 0, rz = 0, sz = 1) { return this.add(bone, CONE, color, mat(cx, cy, cz, r, h, r * sz, rx, ry, rz), ow, role); }
  rod(bone, color, a, b, r, ow = 0, role = 0) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    if (len < 1e-3) return this;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    return this.add(bone, CYL6, color, m, ow, role);
  }
  // -> [{ bone, n, pos, nor, col, onr, role }] (typed arrays, copied into the big buffer by crew.js)
  finish() {
    const out = [];
    for (const [bone, list] of this.by) {
      const geo = list.length === 1 ? list[0].clone() : mergeList(list);
      const a = geo.attributes;
      out.push({ bone, n: a.position.count, pos: new Float32Array(a.position.array), nor: new Float32Array(a.normal.array), col: new Float32Array(a.color.array), onr: new Float32Array(a.onormal.array), role: new Float32Array(a.aRole.array) });
      geo.dispose();
      for (const g of list) g.dispose();
    }
    return out;
  }
}
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const mergeList = (list) => mergeGeometries(list, false);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- species -------------------------------------------------------------------------------------------------------------------------------------------------------------------
// (the 2D crewArt's table: what makes each animal itself)
export const SP = {
  bulldog: { muz: '#e8d6b8', ear: 'floppy', earCol: '#7d5a3d', snout: 9, jowl: 1, tail: 'nub' },
  wolf: { muz: '#dcdde0', ear: 'point', earIn: '#bf9a98', snout: 12, tail: 'bush' },
  tiger: { muz: '#f4e7cc', ear: 'point', earIn: '#f0c9a4', snout: 9, stripes: 1, tail: 'stripe' },
  shiba: { muz: '#f2e6cc', ear: 'point', earIn: '#f0d3b0', snout: 9, tail: 'curl', cheeks: 1 },
  fox: { muz: '#f4eadb', ear: 'point', earIn: '#4a3b36', snout: 12, tail: 'fox', cheeks: 1 },
  bear: { muz: '#cfae84', ear: 'round', earIn: '#b99870', snout: 8, tail: 'nub' },
  cat: { muz: '#dedad2', ear: 'point', earIn: '#e6b5b0', snout: 7, tail: 'long', whiskers: 1, stripes: 1 },
  rabbit: { muz: '#f7f0e6', ear: 'long', earIn: '#e8b0aa', snout: 6, tail: 'puff', buck: 1 },
};
export const furOf = (species) => { const sp = config.SPECIES[species] || config.SPECIES.bulldog; return mix(sp.fur || '#b08a62', PAPER, 0.1); };

// What KIND of figure a record is: 'crew' (an animal), or a raider's skeleton / devil / bat.
export const kindOf = (type) => (!type ? 'crew' : type === 'brute' ? 'devil' : type === 'cutter' ? 'bat' : 'skel');
export const BULK = { crew: 1, skel: 1, devil: 1.18, bat: 1 };
// the colours behind each role (crew.js fills the tint texture from this + the player's colour)
export function rolesFor(kind, rec, fur) {
  if (kind === 'crew') {
    const cloth = rec.color || '#3a86ff';
    const jacket = mix(cloth, PAPER, 0.06);
    return { [R.JACKET]: jacket, [R.PANTS]: mix(cloth, '#4a3828', 0.5), [R.SCARF]: rec.mate ? config.MATES.SCARF : mix(cloth, PAPER, 0.5), [R.MARK]: cloth, [R.FUR]: fur, [R.LIGHT]: light(jacket), [R.TEAM]: rec.teamColor || cloth, [R.SHADE]: shade(fur) };
  }
  if (kind === 'devil') { const skin = '#b4524a'; return { [R.JACKET]: skin, [R.PANTS]: shade(skin), [R.SCARF]: shade(skin), [R.MARK]: skin, [R.FUR]: skin, [R.LIGHT]: light(skin), [R.TEAM]: skin, [R.SHADE]: shade(skin) }; }
  if (kind === 'bat') { const f = '#5b4b60'; return { [R.JACKET]: f, [R.PANTS]: '#4a3d4e', [R.SCARF]: f, [R.MARK]: f, [R.FUR]: f, [R.LIGHT]: '#8b7790', [R.TEAM]: f, [R.SHADE]: shade(f) }; }
  return { [R.JACKET]: CHAR, [R.PANTS]: '#3a3437', [R.SCARF]: OX, [R.MARK]: OX, [R.FUR]: BONE, [R.LIGHT]: '#5a5256', [R.TEAM]: OX, [R.SHADE]: shade(BONE) }; // skeletons
}

// ---- cache helper --------------------------------------------------------------------------------------------------------------------------------------------------------------
const cache = new Map();
const memo = (key, make) => { let v = cache.get(key); if (!v) { v = make(); cache.set(key, v); } return v; };

// ---- the body: torso, belt, arms, legs, boots (shared by every humanoid; the roles colour it) ---------------------------------------------------------------------------------
// acc = the accessories are on (false on the Low tier: no pocket / buckle / collar)
export function bodyParts(kind, acc, extra = {}) {
  return memo('body|' + kind + '|' + acc + '|' + (extra.satchel ? 1 : 0), () => {
    const P = new PartSet();
    if (kind === 'bat') {
      P.sph(B.TORSO, '#5b4b60', 0, 33, 0, 13, 17, 11.5, OW, R.JACKET, SP_L);
      P.sph(B.TORSO, '#8b7790', 4, 29, 0, 8, 11, 11.6, 0, R.LIGHT, SP_T); // the lighter belly tuft
      P.box(B.TORSO, CHAR, 0, 24.5, 0, 24.5, 5, 22, OWS);
      // wings instead of arms: a plum membrane on a bony fan, hanging from the shoulder and swung like an arm
      for (const [bone, sgn] of [[B.ARM_A, 1], [B.ARM_B, -1]]) {
        P.add(bone, wingGeo(), '#ffffff', mat(0, 0, sgn * 3), OWS, R.JACKET);
        P.rod(bone, '#4a3d4e', V(0, 0, sgn * 3), V(-2, -26, sgn * 4), 1.6, 0, 0);
      }
    } else {
      P.add(B.TORSO, capsule(13, 32), '#fff', mat(0, 33, 0, 1, 1, 0.92), OW, R.JACKET); // the jacket
      P.box(B.TORSO, kind === 'devil' ? CHAR : '#7a5538', 0, 25.5, 0, 27.5, 5, 24.8, OWS); // belt
      if (acc) P.box(B.TORSO, '#c9a85a', 13.8, 25.5, 0, 3, 6, 6.5, OWS); // buckle
      // arms: sleeve (jacket) from the shoulder, the hand and forearm in fur / bone / skin, a fist at the end
      for (const bone of [B.ARM_A, B.ARM_B]) {
        const th = kind === 'skel' ? 0.78 : kind === 'devil' ? 1.35 : 1;
        P.add(bone, capsule(5.6 * th, 17), '#fff', mat(0, -8, 0), OWS + 0.6, R.JACKET);
        P.cyl(bone, '#fff', 0, -18.5, 0, 4.7 * th, 14, OWS + 0.4, R.FUR);
        P.sph(bone, '#fff', 0, -26, 0, 5.4 * th, 5.4 * th, 5.4 * th, OWS + 0.4, R.FUR, SP_XS);
      }
      if (acc && kind === 'crew') {
        P.box(B.TORSO, '#fff', 3, 33, 11.6, 9, 8, 1.6, OWS, R.LIGHT); // the pocket (on both sides: it is on the jacket's flank)
        P.box(B.TORSO, '#fff', 3, 33, -11.6, 9, 8, 1.6, OWS, R.LIGHT);
      }
    }
    // legs and boots
    for (const bone of [B.LEG_A, B.LEG_B]) {
      const th = kind === 'skel' ? 0.78 : kind === 'devil' ? 1.3 : 1;
      P.add(bone, capsule(6 * th, 20), '#fff', mat(0, -8, 0), OW, R.PANTS);
      P.sph(bone, kind === 'skel' ? CHAR : kind === 'devil' ? '#3b3335' : '#6b4a32', 3.5, -16.5, 0, 9, 5.5, 6.8 * th, OW, 0, SP_T);
    }
    if (kind === 'skel') {
      for (const s of [1, -1]) { P.box(B.TORSO, BONE, 2, 38, s * 11.4, 11, 13, 1.5, 0.8); for (const y of [42, 38, 34]) P.box(B.TORSO, '#4a4346', 2, y, s * 12.3, 9, 1.1, 0.6, 0); } // ribs showing through the torn tunic
      P.box(B.TORSO, OX, 0, 29, 0, 28, 4.6, 25.6, OWS); // oxblood sash
      for (const [x, y, w] of [[-8, 19, 7], [2, 18, 8], [10, 19, 6]]) P.box(B.TORSO, '#3a3437', x, y, 0, w, 5, 24.6, 0.9); // the ragged hem
      if (extra.satchel) { P.box(B.TORSO, '#6b4a32', -14, 31, 0, 8, 15, 20, OWS); P.sph(B.TORSO, '#58504f', -14, 41, 4, 4.4, 4.4, 4.4, OWS, 0, SP_T); } // a sapper's satchel of bombs
    } else if (kind === 'devil') {
      P.box(B.TORSO, CHAR, -1, 38, 0, 14, 20, 25.5, OWS); // the charcoal harness vest
      P.sph(B.TORSO, '#c9a85a', 13, 25.5, 0, 4.5, 3.8, 4.5, OWS);
    }
    return P.finish();
  });
}

// the bat's wing: an extruded membrane (the shape hangs from the shoulder, points are the fingers)
let wingG = null;
function wingGeo() {
  if (wingG) return wingG;
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(8, -22); s.lineTo(3, -34); s.lineTo(-6, -24); s.lineTo(-12, -36); s.lineTo(-17, -16); s.lineTo(-6, -2); s.closePath();
  wingG = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: false });
  wingG.translate(0, 0, -1.1);
  return wingG;
}

// ---- tails (one per species; the bone TAIL turns at the root) ---------------------------------------------------------------------------------------------------------------------
export function tailParts(species) {
  const S = SP[species] || SP.bulldog;
  return memo('tail|' + species, () => {
    const P = new PartSet(), fur = furOf(species), t = S.tail;
    const T = B.TAIL;
    if (t === 'puff') P.sph(T, light(PAPER), -4.5, 0, 0, 6.5, 6.5, 6.5, OWS, 0, SP_T);
    else if (t === 'nub') P.sph(T, fur, -4, 0, 0, 5.4, 4.8, 4.8, OWS, 0, SP_T);
    else if (t === 'curl') { P.rod(T, fur, V(0, 0, 0), V(-9, 8, 0), 4, OWS); P.sph(T, fur, -9, 14, 0, 6.5, 6.5, 6.5, OWS, 0, SP_T); P.sph(T, PAPER, -9, 14, 5.2, 2.6, 2.6, 1.6, 0); }
    else if (t === 'long') { P.rod(T, fur, V(0, 0, 0), V(-14, 6, 0), 2.9, OWS); P.rod(T, fur, V(-14, 6, 0), V(-20, 18, 0), 2.9, OWS); P.sph(T, fur, -20, 18.5, 0, 3.2, 3.2, 3.2, OWS); }
    else {
      const big = t === 'fox' || t === 'bush', rx = big ? 17 : 13, ry = big ? 7.5 : 5.6;
      P.sph(T, fur, -14, 0, 0, rx, ry, ry, OW, 0, SP_T);
      if (t === 'fox') P.sph(T, PAPER, -26.5, 0, 0, 6.5, 6.4, 6.4, OWS, 0, SP_T);
      if (t === 'stripe') for (const x of [-9, -15, -21]) P.cyl(T, '#5a3a28', x, 0, 0, ry + 0.5, 2.3, 0, 0, 0, 0, Math.PI / 2);
    }
    return P.finish();
  });
}

// ---- heads -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// head space: the origin is the neck, +x forward, the skull's centre is (3, 19.5, 0).
const HX = 3, HY = 19.5;
function xEyes(P, x, y, z) { // knocked out: an X on each side of the face
  for (const s of [1, -1]) { P.box(B.HEAD, BROWN, x, y, s * z, 8, 1.6, 1.6, 0, 0, 0, 0, Math.PI / 4); P.box(B.HEAD, BROWN, x, y, s * z, 8, 1.6, 1.6, 0, 0, 0, 0, -Math.PI / 4); }
}
export function headParts(kind, species, ko, acc) {
  return memo('head|' + kind + '|' + species + '|' + ko + '|' + acc, () => {
    const P = new PartSet(), H = B.HEAD;
    if (kind === 'crew') {
      const S = SP[species] || SP.bulldog, fur = furOf(species), fs = shade(fur), sn = S.snout;
      P.add(H, SP_M, fur, mat(HX, HY, 0, 21, 19.5, 19), OW);
      // ears first
      if (S.ear === 'point') {
        const tall = species === 'cat' ? 26 : 22;
        for (const s of [1, -1]) {
          P.cone(H, s > 0 ? fur : mix(fur, '#3b2a3a', 0.12), -1, 35 + tall / 2, s * 11, 7.2, tall, OW - 0.4, 0, s * 0.16, 0, 0, 0.62);
          P.cone(H, S.earIn, 0.5, 35 + tall / 2 - 2, s * 12.3, 4.2, tall * 0.72, 0, 0, s * 0.16, 0, 0, 0.4);
        }
      } else if (S.ear === 'long') {
        for (const s of [1, -1]) {
          P.sph(H, s > 0 ? fur : mix(fur, '#3b2a3a', 0.1), -5, 52, s * 8, 5.6, 18.5, 4.6, OW - 0.4, 0, SP_T, 0, 0, s * 0.12);
          P.sph(H, S.earIn, -4.4, 51, s * 10.6, 2.8, 13, 1.7, 0, 0, SP_XS, 0, 0, s * 0.12);
        }
      } else if (S.ear === 'round') {
        for (const s of [1, -1]) { P.sph(H, s > 0 ? fur : mix(fur, '#3b2a3a', 0.12), -3, 37, s * 14, 8, 8, 5.4, OW - 0.4, 0, SP_T); P.sph(H, S.earIn, -2.4, 37, s * 17.4, 4.4, 4.4, 2.4, 0, 0, SP_XS); }
      } else if (S.ear === 'floppy') {
        for (const s of [1, -1]) P.sph(H, S.earCol, -1, 16, s * 18, 7, 13.5, 3.6, OW - 0.4, 0, SP_T, 0, 0, s * 0.25);
      }
      if (S.cheeks) for (const s of [1, -1]) P.sph(H, S.muz, 5, 10, s * 15.5, 9, 5.5, 4.4, OWS, 0, SP_T, 0, 0, 0);
      if (S.stripes) {
        const sc = species === 'cat' ? '#6f6f70' : '#5a3a28';
        for (const z of [-6.5, 0, 6.5]) P.box(H, sc, 4, 37.2, z, 2.6, 8, 1.7, 0, 0, 0, 0, 0);
        for (const s of [1, -1]) { P.box(H, sc, -9, 22, s * 16.7, 8, 1.8, 1.4, 0); P.box(H, sc, -8.5, 16.5, s * 16.5, 8, 1.8, 1.4, 0); }
      }
      // muzzle, nose, mouth
      P.sph(H, S.muz, HX + 9.5 + sn * 0.35, 13.2, 0, 5.2 + sn, 7.2, 8.4, OW - 0.5, 0, SP_T);
      if (S.jowl) P.sph(H, S.muz, HX + 13, 7.4, 0, 8, 4.4, 9.4, OWS, 0, SP_T);
      P.sph(H, '#4a3b36', HX + 14.5 + sn * 1.2, 16.4, 0, 3.4, 2.7, 3.6, 0.8, 0, SP_XS);
      if (S.buck && !ko) P.box(H, '#fbf7ea', HX + 11 + sn * 0.7, 7, 0, 3.4, 5, 5.2, 0.9);
      if (S.whiskers) for (const s of [1, -1]) for (const dy of [-1.5, 2]) P.box(H, BROWN, HX + 19, 13 + dy, s * 8, 14, 0.9, 0.9, 0, 0, 0, 0, dy * 0.06);
      // eyes (X's when knocked out)
      if (ko) xEyes(P, 11, 21.5, 17.4);
      else for (const s of [1, -1]) { P.sph(H, '#fbf7ea', 11, 21, s * 16.4, 4.4, 5.2, 3, OWS, 0, SP_XS); P.sph(H, BROWN, 13.2, 20.4, s * 18.2, 2.3, 2.9, 1.3, 0, 0, SP_XS); }
      if (acc) {
        // goggles pushed up on the forehead: a leather band right round the head, two brass lenses, and a little cap
        P.add(H, CYL, '#7a5538', mat(HX, 33, 0, 16.4, 5, 14.6), OWS);
        for (const s of [1, -1]) { P.add(H, CYL6, '#c9a85a', mat(19.6, 34, s * 6.4, 6.3, 4, 6.3, 0, 0, Math.PI / 2), OWS); P.add(H, CYL6, '#bcd6dc', mat(21.7, 34, s * 6.4, 4.1, 1.6, 4.1, 0, 0, Math.PI / 2), 0); }
        P.add(H, SP_T, '#fff', mat(-2, 38, 0, 12.5, 7.6, 10.2), OW - 0.4, R.JACKET); // the flight cap in the player's colour
      }
    } else if (kind === 'skel') {
      P.add(H, SP_M, BONE, mat(HX, HY, 0, 19.5, 19, 18.5), OW);
      P.box(H, BONE, 10, 5, 0, 20, 9, 16, OW - 0.6); // the jaw
      for (let x = 2; x < 18; x += 4.2) P.box(H, '#4a4346', x, 5.5, 0, 1.2, 7, 17, 0); // teeth
      for (const s of [1, -1]) {
        if (ko) continue;
        P.sph(H, CHAR, 11.5, 21, s * 15.6, 5.6, 5.6, 3.2, OWS, 0, SP_XS);
        P.sph(H, '#f2d36b', 13.2, 21, s * 17.4, 1.9, 1.9, 1, 0, 0, SP_XS);
      }
      if (ko) xEyes(P, 11, 21.5, 17);
      P.box(H, CHAR, 21.5, 14.5, 0, 2.5, 5, 4.4, 0);
      P.add(H, SP_L, OX, mat(HX - 1, 30, 0, 20.4, 11.5, 19.6), OW - 0.4); // the oxblood bandana
      P.box(H, OX, -21, 27, 5, 11, 3.6, 3.2, OWS, 0, 0, 0, 0.25); P.box(H, OXL, -21.5, 21, -5, 11, 3.6, 3.2, OWS, 0, 0, 0, -0.3);
    } else if (kind === 'devil') {
      const skin = '#b4524a';
      P.add(H, SP_M, skin, mat(HX, HY, 0, 23, 19.5, 19.5), OW);
      for (const s of [1, -1]) {
        P.cone(H, CHAR, -2, 46, s * 9, 4.8, 20, OW - 0.4, 0, s * 0.3, 0, 0.25, 1); // horns
        P.cone(H, BONE, 25, 5, s * 5.5, 2.2, 8, 0.8); // tusks
      }
      P.sph(H, '#c4655d', HX + 17, 9, 0, 10, 7.5, 11, OWS, 0, SP_L); // the snout
      P.box(H, '#8a3b34', 17, 31, 0, 12, 4, 30, OWS, 0, 0, 0, -0.18); // a heavy brow
      for (const s of [1, -1]) {
        if (ko) continue;
        P.sph(H, '#f2d36b', 13, 21, s * 16.6, 5, 4.6, 3, OWS, 0, SP_XS);
        P.box(H, BROWN, 14.6, 21, s * 18.4, 2, 6, 1.2, 0);
      }
      if (ko) xEyes(P, 12, 21.5, 17.4);
    } else { // bat
      const fur = '#5b4b60';
      P.add(H, SP_M, fur, mat(HX, HY, 0, 20, 18.5, 18.5), OW);
      for (const s of [1, -1]) {
        P.cone(H, s > 0 ? fur : '#4a3d4e', -2, 50, s * 9.5, 7, 30, OW - 0.4, 0, s * 0.18, 0, 0.1, 0.6);
        P.cone(H, OXL, -1, 49, s * 11, 4, 22, 0, 0, s * 0.18, 0, 0.1, 0.4);
        P.cone(H, '#fbf7ea', 22, 7, s * 4, 1.8, 6, 0.6, 0, 0, 0, Math.PI); // fangs
      }
      P.sph(H, '#7d6a80', HX + 15, 12, 0, 9, 7, 9, OWS, 0, SP_L);
      P.sph(H, '#2b222c', HX + 22.5, 14, 0, 2.6, 2.4, 2.8, 0);
      for (const s of [1, -1]) { if (ko) continue; P.sph(H, '#e8884a', 11, 21, s * 15.6, 4.6, 4.8, 3, OWS, 0, SP_XS); P.sph(H, BROWN, 12.8, 21, s * 17.2, 1.8, 2.2, 1, 0, 0, SP_XS); }
      if (ko) xEyes(P, 11, 21.5, 16.6);
    }
    return P.finish();
  });
}

// ---- the scarf: a collar ring (on the torso) + a rigid TWO-PLANE flag streaming behind (its own bone) ------------------------------------------------------------------------------
export function scarfParts() {
  return memo('scarf', () => {
    const P = new PartSet();
    P.add(B.TORSO, new THREE.TorusGeometry(10.8, 4, 4, 8), '#fff', mat(0, 47, 0, 1, 1, 1, Math.PI / 2, 0, 0), OWS, R.SCARF);
    P.box(B.SCARF, '#fff', -13, -1, 0, 26, 8, 1.8, OWS, R.SCARF); // plane one (seen from the side)
    P.box(B.SCARF, '#fff', -13, -1, 0, 26, 1.8, 8, OWS, R.SCARF); // plane two (crossing it: seen from the front)
    return P.finish();
  });
}

// ---- items ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
// hand items are authored in the hand's frame (origin = the fist, +y = the item's long axis); chest items in the torso frame (the load hugged in front: ITEMC).
export const CHEST_ITEMS = new Set(['coal', 'ammo', 'sandbag', 'crate']);
export function itemParts(kind, opt = '') {
  if (!kind) return [];
  return memo('item|' + kind + '|' + opt, () => {
    const P = new PartSet(), I = B.ITEM, C = B.ITEMC;
    if (kind === 'sword' || kind === 'cutlass') {
      P.box(I, '#cfd0c6', 0, 25, 0, 6.2, 34, 1.8, OWS);
      P.cone(I, '#cfd0c6', kind === 'cutlass' ? 2 : 0, 46, 0, 3.1, 9, OWS, 0, 0, 0, kind === 'cutlass' ? -0.25 : 0, 0.55);
      P.box(I, '#c9a85a', 0, 7.5, 0, 15, 3.2, 4.6, OWS);
      P.cyl(I, '#6b4a32', 0, 1.2, 0, 1.9, 10, OWS);
      P.sph(I, '#c9a85a', 0, -4.6, 0, 2.6, 2.6, 2.6, OWS);
    } else if (kind === 'hammer') {
      P.cyl(I, '#7a4a24', 0, 14, 0, 2.4, 44, OWS);
      P.box(I, '#5a5558', 0, 37, 0, 22, 13, 13, OWS + 0.4);
    } else if (kind === 'extinguisher') {
      P.cyl(I, '#a8443f', 0, 8, 0, 6.6, 26, OWS + 0.4);
      P.cyl(I, '#6b4a32', 0, -3.4, 0, 6.9, 3.4, 0.8);
      P.cyl(I, '#c9a85a', 0, 22, 0, 4.2, 3.6, OWS);
      P.box(I, '#3a3436', 0, 25.5, 0, 6, 5, 5, OWS);
      P.rod(I, '#3a3436', V(0, 25.5, 0), V(11, 19, 0), 1.7, 0.8);
    } else if (kind === 'hookshot') { // the harpoon gun: a brass barrel, a wooden stock and a coil of rope; the hook sits in the muzzle until it is fired
      P.cyl(I, '#c9a54a', 0, 22, 0, 4.2, 32, OWS);
      P.cyl(I, '#8a6a2a', 0, 14, 0, 4.9, 2.6, 0.8);
      P.cyl(I, '#a8863a', 0, 39, 0, 5.8, 6, OWS);
      P.box(I, '#9a6a3e', 0, -3, 0, 5.5, 17, 7.4, OWS);
      P.box(I, '#6b4a32', 3.6, -9, 0, 4, 9, 5, OWS);
      P.add(I, new THREE.TorusGeometry(5.6, 2.3, 5, 9), '#d6bf8a', mat(-5, 14, 5.6), OWS);
      if (opt !== 'fired') { P.rod(I, '#8a8588', V(0, 42, 0), V(0, 53, 0), 1.9, OWS); for (const [dx, dz] of [[-7, 0], [7, 0], [0, 7]]) P.rod(I, '#8a8588', V(0, 53, 0), V(dx, 59, dz), 1.7, OWS); }
    } else if (kind === 'towline') {
      P.add(I, new THREE.TorusGeometry(8.4, 3.6, 5, 10), '#d6bf8a', mat(0, 4, 0), OWS);
      P.add(I, new THREE.TorusGeometry(4.4, 2.4, 4, 8), '#b98a5a', mat(0, 4, 0), 0);
    } else if (kind === 'bomb') { // a sapper's bomb with its burning fuse
      P.sph(I, '#58504f', 0, 8, 0, 8.5, 8.5, 8.5, OW, 0, SP_L);
      P.rod(I, '#2b2622', V(0, 16, 0), V(4, 22, 0), 1, 0.6); P.rod(I, '#2b2622', V(4, 22, 0), V(9, 20, 0), 1, 0.6);
      P.sph(I, '#e8884a', 9.6, 20, 0, 2.6, 2.6, 2.6, 0.6);
    } else if (kind === 'club') {
      P.cyl(I, '#8a6644', 0, 12, 0, 3.3, 30, OWS);
      P.sph(I, '#6b4a32', 0, 33, 0, 7.5, 10.5, 7.5, OW, 0, SP_L);
      for (const [x, z, rx, rz] of [[8, 0, 0, -Math.PI / 2], [-8, 0, 0, Math.PI / 2], [0, 8, Math.PI / 2, 0], [0, -8, -Math.PI / 2, 0]]) P.cone(I, '#cfd0c6', x, 33, z, 1.9, 6, 0.6, 0, rx, 0, rz);
    } else if (kind === 'cleaver') {
      P.box(I, '#cfd0c6', 0, 18, 0, 7.4, 24, 1.8, OWS);
      P.box(I, '#cfd0c6', 5, 30, 0, 6, 7, 1.8, OWS, 0, 0, 0, -0.5);
      P.cyl(I, '#6b4a32', 0, -2, 0, 2, 11, OWS);
    } else if (kind === 'coal') { // a lumpy black sack
      P.sph(C, '#3a3a3d', 17, 31, 0, 11, 10, 10.5, OW, 0, SP_L);
      P.sph(C, '#2b2b2e', 19, 37, 3.5, 5, 4, 4, 0.8, 0, SP_T);
      P.sph(C, '#2b2b2e', 14, 26, -4.5, 5, 4, 4, 0.8, 0, SP_T);
      P.cone(C, '#4a4346', 17, 42.5, 0, 3.4, 6, OWS);
    } else if (kind === 'ammo') { // a brass shell with a dark nose and a copper band
      P.cyl(C, '#c9a54a', 17, 29, 0, 6, 22, OW);
      P.cone(C, '#5a5558', 17, 45, 0, 6, 11, OWS);
      P.cyl(C, '#b5633f', 17, 24, 0, 6.3, 3, 0.8);
      P.cyl(C, '#8a6a2a', 17, 18.4, 0, 6.6, 2.4, 0.8);
    } else if (kind === 'sandbag') {
      P.sph(C, '#b79a63', 17, 31, 0, 14, 10, 10, OW, 0, SP_L);
      P.box(C, '#8a7448', 17, 31, 0, 2.6, 21, 10.4, 0, 0, 0, 0, 0.35);
      P.cone(C, '#b79a63', 17, 41, 0, 3.4, 5, OWS);
    } else if (kind === 'crate') {
      P.box(C, '#c9a05f', 18, 31, 0, 25, 25, 25, OW);
      for (const s of [1, -1]) P.box(C, '#8a6644', 18, 31, s * 12.9, 31, 3, 1.4, 0, 0, 0, 0, 0.78);
      for (const s of [1, -1]) P.box(C, '#8a6644', 18, 31, s * 12.9, 31, 3, 1.4, 0, 0, 0, 0, -0.78);
    } else return [];
    return P.finish();
  });
}

// ---- hearts, the marker, the parachute, the hookshot rope and hook, the swing swoosh ----------------------------------------------------------------------------------------------------------
function heartShape(s, half) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.95 * s);
  sh.bezierCurveTo(-1.25 * s, -0.1 * s, -0.85 * s, 0.8 * s, 0, 0.3 * s);
  if (half) sh.lineTo(0, -0.95 * s);
  else { sh.bezierCurveTo(0.85 * s, 0.8 * s, 1.25 * s, -0.1 * s, 0, -0.95 * s); }
  return sh;
}
const heartGeo = memoGeo((half) => { const g = new THREE.ExtrudeGeometry(heartShape(9.5, half), { depth: half ? 6.2 : 5, bevelEnabled: false, curveSegments: 3 }); g.translate(0, 0, half ? -2.6 : -2.5); return g; });
function memoGeo(fn) { const c = new Map(); return (k) => { if (!c.has(k)) c.set(k, fn(k)); return c.get(k); }; }
// state: 'f' full, 'h' half, 'e' empty
export function heartParts(state, bone) {
  return memo('heart|' + state + '|' + bone, () => {
    const P = new PartSet();
    if (state === 'f') P.add(bone, heartGeo(false), '#e63946', mat(0, 0, 0), OWS);
    else { P.add(bone, heartGeo(false), '#4a3d38', mat(0, 0, 0), OWS); if (state === 'h') P.add(bone, heartGeo(true), '#e63946', mat(0, 0, 0), 0); }
    return P.finish();
  });
}
export function markParts(team) {
  return memo('mark|' + (team ? 1 : 0), () => {
    const P = new PartSet();
    P.add(B.MARK, CONE, '#fff', mat(0, 8.5, 0, 11, 17, 11, Math.PI, 0, 0), 2.4, R.MARK); // a cone pointing down at the crewman, in his colour
    if (team) P.box(B.MARK, '#fff', 0, 21.5, 0, 24, 5, 3, OWS, R.TEAM); // Versus: his side's colour as a band over it
    return P.finish();
  });
}
export function chuteParts() {
  return memo('chute', () => {
    const P = new PartSet(), C = B.CHUTE;
    const dome = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    P.add(C, dome, '#eee6d2', mat(0, 0, 0, 62, 40, 36), 2.2);
    P.add(C, new THREE.SphereGeometry(1, 6, 8, Math.PI / 2 - 0.55, 1.1, 0, Math.PI / 2), '#8fb37a', mat(0, 0, 0, 62.6, 40.6, 36.6), 0);
    for (const [x, z] of [[-60, 0], [60, 0], [-27, 25], [27, -25]]) P.rod(C, '#33261f', V(x, 1, z), V(0, -62, 0), 0.9, 0);
    return P.finish();
  });
}
export function packParts() { // the bundled parachute on a crewman's back
  return memo('pack', () => { const P = new PartSet(); P.box(B.TORSO, '#eee6d2', -15, 36, 0, 8, 22, 17, OWS); P.box(B.TORSO, '#8fb37a', -15.4, 36, 0, 8.6, 6, 17.6, 0); return P.finish(); });
}
export function ropeParts() { // a unit-long rope along +y (crew.js stretches it): a dark rod with a lighter one inside it, so it reads as a line with an ink edge
  return memo('rope', () => { const P = new PartSet(); P.rod(B.ROPE, '#2b2118', V(0, 0, 0), V(0, 1, 0), 2.5, 0); P.rod(B.ROPE, '#b89968', V(0, 0, 0), V(0, 1, 0), 1.3, 0); return P.finish(); });
}
export function hookParts() { // the grapple, pointing along +y (away from the hand)
  return memo('hook', () => {
    const P = new PartSet(), H = B.HOOK;
    P.rod(H, '#8a8f94', V(0, -2, 0), V(0, 12, 0), 2.7, OWS);
    for (const [dx, dz] of [[-9, 0], [9, 0], [0, 9]]) P.rod(H, '#8a8f94', V(0, 12, 0), V(dx, 2, dz), 2, OWS);
    return P.finish();
  });
}
export function swooshParts() { // the cream crescent of a swing (unit radius; crew.js scales it)
  return memo('swoosh', () => {
    const P = new PartSet();
    P.add(B.SWOOSH, new THREE.TorusGeometry(1, 0.045, 4, 14, 1.9), '#fff4dc', mat(0, 0, 0, 1, 1, 1, 0, 0, -0.95), 0);
    return P.finish();
  });
}
