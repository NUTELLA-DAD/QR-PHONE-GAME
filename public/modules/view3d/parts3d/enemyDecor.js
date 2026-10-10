// THE ENEMY GUNSHIP'S MENACE (WP9). The gunship is built by the same ship builder as ours (registry.js, the charcoal and oxblood enemy theme); this adds what makes her HERS:
//   * a row of iron spikes down the ridge of every gasbag, and a bowsprit ram (a spiked iron horn) off the nose bag;
//   * her emblem (horns, an eye, a band, chevrons or fangs: bp.emblem) on both flanks of the bag, in cream and oxblood: an invented sign of the raiders, never a real national one;
//   * the mast on the bag, with HER pennant (cloth, trim and pattern from bp.flag; the cream badge shows what her captain intends: bp.intent), fluttering on three held keys (8 fps);
//   * red lanterns hung from the gunwale, a boiler stack with a soot-black cap, and a bone-white skull on the horn.
// Everything here is rigid. The pieces on the bag are children of the bag's own node, so they swell with it and sag with it when she is hurt.
//   buildEnemyDecor(ctx, model, { bp, gunship }) -> { update(t), setIntent(name), flag }
import { THREE, Batch, tagSmall, glowMat, G } from '../style.js';
import { BAG_RZ } from './bag.js';

const PI = Math.PI;
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const FLAG_KEYS = [[0.06, 0.18, 0.26, 0.28], [0, -0.12, -0.2, -0.14], [-0.07, 0.08, 0.18, 0.14]];
const CREAM = '#ebdfc0', OX = '#8c2f2f', OXD = '#5c1e1e', IRON = '#2f2a2e', IRON2 = '#4a4346';
const profile = (b, u) => { const p = u < 0 ? 1.75 : 2.0; return b.ry * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), p)), 1 / p); }; // the bag's own profile (bag.js)

function emblemParts(kind, b, z, s) { // the emblem flat on a flank at depth z, s = its size; dir = +1 (viewer's side) or -1
  const face = z > 0 ? 1 : -1;
  const fz = z + face * 1.4;
  if (kind === 'eye') {
    b.sphere(CREAM, 0, 0, fz, s * 0.62, s * 0.34, 2.2, 1.4, true);
    b.sphere(OX, 0, 0, fz + face * 1.6, s * 0.2, s * 0.2, 2, 1, true);
    b.sphere(IRON, 0, 0, fz + face * 3, s * 0.08, s * 0.14, 1.6, 0, true);
    for (const x of [-1, 1]) b.box(OXD, x * s * 0.68, 0, fz, s * 0.2, 5, 2, 0);
    for (const x of [-1, 1]) b.box(IRON, x * s * 0.3, s * 0.36, fz + face * 1.2, s * 0.62, s * 0.1, 2.4, 1, 0, 0, -x * 0.42); // the angry brows
  } else if (kind === 'band') {
    b.box(CREAM, 0, 0, fz, s * 1.4, s * 0.3, 2.4, 1.2);
    b.box(OX, 0, 0, fz + face * 1.4, s * 1.4, s * 0.12, 2, 0);
  } else if (kind === 'chevrons') {
    for (let i = -1; i <= 1; i++) { b.box(CREAM, i * s * 0.42 - s * 0.1, s * 0.2, fz, s * 0.52, s * 0.14, 2.4, 1, 0, 0, -0.7); b.box(CREAM, i * s * 0.42 - s * 0.1, -s * 0.2, fz, s * 0.52, s * 0.14, 2.4, 1, 0, 0, 0.7); }
  } else if (kind === 'fangs') {
    b.box(OXD, 0, s * 0.18, fz, s * 1.3, s * 0.2, 2.2, 1.2);
    for (let i = -3; i <= 3; i++) b.cone(CREAM, i * s * 0.18, -s * 0.0, fz + face * 0.6, s * 0.07, s * 0.34, 0.8, 0, 0, PI);
  } else { // 'horns': two curved horns over a bone-white skull
    b.sphere(CREAM, 0, -s * 0.12, fz, s * 0.3, s * 0.34, 2.4, 1.4, true);
    for (const x of [-1, 1]) { b.cone(CREAM, x * s * 0.46, s * 0.32, fz, s * 0.1, s * 0.62, 1, 0, 0, -x * 0.5); b.cone(OX, x * s * 0.55, s * 0.58, fz + face * 0.8, s * 0.07, s * 0.3, 0.8, 0, 0, -x * 0.8); }
    for (const x of [-1, 1]) b.sphere(IRON, x * s * 0.12, -s * 0.12, fz + face * 2.2, s * 0.07, s * 0.09, 1.4, 0, true);
    b.box(IRON, 0, -s * 0.3, fz + face * 1.8, s * 0.2, s * 0.08, 1.4, 0);
  }
}

// the cream badge on the pennant: what her captain intends. Drawn in the flag's own frame (the flag is mirrored: its +x runs toward the stern).
function badgeFor(intent) {
  const b = new Batch();
  const r = (x1, y1, x2, y2, w = 2.2) => b.rod(CREAM, V(x1, y1, 2.4), V(x2, y2, 2.4), w, 0);
  if (intent === 'attack' || intent === 'strafe') { r(-12, 12, 12, -12, 2.6); r(-12, -12, 12, 12, 2.6); if (intent === 'strafe') { r(18, 5, 28, 5, 1.6); r(18, -5, 28, -5, 1.6); } }
  else if (intent === 'retreat' || intent === 'flee') { r(-12, 0, 14, 0, 2.4); r(14, 0, 4, 9, 2.4); r(14, 0, 4, -9, 2.4); } // an arrow pointing to the stern
  else if (intent === 'latch') { r(0, 12, 0, -6, 2.4); r(-8, 8, 8, 8, 2); b.geo(CREAM, new THREE.TorusGeometry(6, 1.2, 4, 10, PI), new THREE.Matrix4().compose(V(-4, -6, 2.4), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, PI)), V(1, 1, 1)), 0); }
  else if (intent === 'climb') { r(-6, -12, -6, 8, 2.4); r(-14, 0, -6, 10, 2.4); r(2, 0, -6, 10, 2.4); b.geo(CREAM, new THREE.SphereGeometry(7, 8, 4, 0, PI * 2, 0, PI / 2), new THREE.Matrix4().makeTranslation(14, 0, 2.4), 0); }
  else for (const k of [-12, 0, 12]) { r(k + 6, 10, k - 3, 0, 2.2); r(k - 3, 0, k + 6, -10, 2.2); } // 'approach': chevrons (pointing to the bow)
  return b.build({ cast: false, receive: false });
}

export function buildEnemyDecor(ctx, model, o = {}) {
  const bp = o.bp || null, bags = model.dyn.bags || [];
  const { X, Y } = ctx;
  const parts = [];
  const bagRec = (i) => ctx.bags[i] || ctx.bags[0];
  // ---- on each bag: the spiny back, the emblem, and on the first the mast and pennant; on the last the bowsprit ----------------------------------------------------------------------------------------
  const emblemKind = (bp && bp.emblem) || 'horns';
  const flagDef = bp && bp.flag ? bp.flag : { a: OX, b: '#f2d36b', pattern: 'band' };
  let flag = null;
  const badges = {};
  const intents = ['attack', 'strafe', 'retreat', 'flee', 'latch', 'climb', 'approach'];
  bags.forEach((bg, i) => {
    const G0 = bagRec(bg.i != null ? bg.i : i);
    if (!G0) return;
    const node = bg.node, rx = G0.rx, ry = G0.ry;
    const grp = new THREE.Group();
    const b = new Batch();
    // iron spikes along the ridge: tall at the middle, small toward the ends
    for (let k = -3; k <= 3; k++) { const u = k * 0.2, top = profile(G0, u), h = 54 - Math.abs(k) * 7; b.cone(IRON, u * rx, top - 5 + h / 2, 0, 12 - Math.abs(k) * 1.2, h, 2.2, 0, 0, 0); }
    // her emblem on both flanks (A4: the bag is the squat oval of bag.js, BAG_RZ deep, so the emblem lies on ITS skin, not 0.96 ry out in front of it)
    const zf = profile(G0, 0.12) * BAG_RZ + 2;
    for (const sgn of [1, -1]) { const e = new Batch(); emblemParts(emblemKind, e, sgn * (zf + 1), Math.min(150, ry * 0.9)); const eg = e.build({ cast: false, receive: false }); eg.position.x = rx * 0.12; eg.position.y = ry * 0.02; grp.add(eg); }
    // an iron band round the bag at each end (armour straps in charcoal)
    for (const u of [-0.55, 0.55]) { const r = profile(G0, u); b.geo(IRON, new THREE.TorusGeometry(1, 0.022, 6, 28), new THREE.Matrix4().compose(V(u * rx, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI / 2, 0)), V(r * 0.97 * BAG_RZ + 3, r * 0.97, r * 0.97 * 0.96)), 0); }
    grp.add(tagSmall(b.build({ cast: false })));
    node.add(grp);
    parts.push(grp);
    if (i === 0) { // the mast and the pennant
      const mx = bp && bp.mast ? clamp(bp.mast.x - G0.cx, -rx * 0.8, rx * 0.8) : rx * 0.3, topAt = profile(G0, mx / rx);
      const mb = new Batch();
      mb.rod('#2b2622', V(mx, topAt - 6, 0), V(mx, topAt + 150, 0), 3.4, 1.6);
      mb.sphere('#c9a85a', mx, topAt + 154, 0, 6, 6, 6, 1.2, true);
      mb.rod('#2b2622', V(mx, topAt + 2, 0), V(mx - 30, topAt - 30, 0), 1.6, 0);
      grp.add(mb.build({ cast: false }));
      const colsFor = (si) => { // the cloth's three rows for flag segment si, with her pattern on the outer part
        const a = flagDef.a, b2 = flagDef.b, p = flagDef.pattern;
        if (si < 2) return [a, a, a];
        if (p === 'band') return [a, b2, a];
        if (p === 'diagonal') return si === 2 ? [a, a, b2] : [a, b2, b2];
        if (p === 'chevron') return si === 2 ? [b2, a, b2] : [a, b2, a];
        if (p === 'split') return si === 3 ? [b2, b2, b2] : [a, a, a];
        return [0, 1, 2].map((j) => ((si + j) % 2 ? b2 : a));
      };
      flag = new THREE.Group();
      const segs = [];
      for (let si = 0; si < 4; si++) {
        const sg = new THREE.Group(), fb = new Batch(), cols = colsFor(si);
        cols.forEach((c, j) => fb.box(c, 14.5, -(j + 0.5) * 22, 0, 29, 22, 3, 1.4));
        sg.add(tagSmall(fb.build({ cast: false })));
        sg.position.x = si * 29;
        flag.add(sg);
        segs.push(sg);
      }
      flag.userData.segs = segs;
      for (const name of intents) { const bd = badgeFor(name); bd.position.set(34, -33, 0); bd.visible = false; flag.add(bd); badges[name] = bd; }
      flag.scale.x = -1; // (streams toward the stern, the way she flies)
      flag.position.set(mx, topAt + 150, 0);
      grp.add(flag);
    }
    if (i === bags.length - 1) { // the bowsprit: a spiked iron horn off the nose, with a skull on it
      const hb = new Batch(), nx = rx - 14;
      hb.cone(IRON2, nx + 70, 0, 0, 20, 150, 3, 0, 0, -PI / 2);
      hb.geo('#c9a85a', new THREE.TorusGeometry(1, 0.1, 6, 16), new THREE.Matrix4().compose(V(nx + 20, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PI / 2, 0)), V(15, 15, 15)), 1);
      hb.sphere(CREAM, nx + 2, 26, 0, 12, 13, 11, 1.8, true);
      for (const z of [-4.4, 4.4]) hb.sphere('#14110f', nx + 8, 28, z, 3, 3.6, 2, 0, true);
      grp.add(hb.build({ cast: false }));
    }
  });
  // ---- on the hull: red lanterns along the gunwale, a boiler stack -----------------------------------------------------------------------------------------------------------------------------------
  const body = new THREE.Group();
  const lampM = glowMat('#ff4a1e', 2.1);
  const hb = new Batch();
  const decks = (ctx.P || []).filter((q) => q.x1 - q.x0 > 120);
  const top = decks.length ? decks.reduce((a, q) => (q.y < a.y ? q : a), decks[0]) : null;
  const lampPts = [];
  for (const q of decks) {
    const n = Math.max(1, Math.round((q.x1 - q.x0) / 260));
    for (let k = 0; k < n; k++) { const x = q.x0 + ((k + 0.5) * (q.x1 - q.x0)) / n; lampPts.push([x, q.y - 84]); hb.rod('#2b2622', V(X(x), Y(q.y - 66), ctx.W * 0.88), V(X(x), Y(q.y - 82), ctx.W * 0.88), 1.2, 0); }
  }
  body.add(hb.build({ cast: false }));
  if (lampPts.length) {
    const gs = lampPts.map(([x, y]) => { const g = G.sphereLo.clone(); g.applyMatrix4(new THREE.Matrix4().compose(V(X(x), Y(y), ctx.W * 0.88), new THREE.Quaternion(), V(7, 8.4, 7))); return g; });
    const merged = new THREE.Mesh(mergeG(gs), lampM);
    body.add(merged);
  }
  const gsP = ctx.glowSpots && ctx.glowSpots[0];
  if (gsP) { // the boiler's stack: a soot-black funnel standing out of the deck above the boiler
    const sb = new Batch(), sx = gsP[0], sy = gsP[1];
    sb.cyl('#3a3638', sx, sy + 56, -ctx.W * 0.3, 15, 90, 2.6);
    sb.cyl('#14110f', sx, sy + 106, -ctx.W * 0.3, 18, 8, 1.6);
    sb.cyl(OX, sx, sy + 62, -ctx.W * 0.3, 16.5, 7, 0);
    body.add(sb.build({ cast: false }));
  }
  void top;
  model.content.add(body);
  parts.push(body);
  const D = {
    flag, parts,
    update(t, intent, gale = 0) {
      const K = Math.floor(t * 8);
      if (flag) { flag.userData.segs.forEach((sg, i) => { sg.rotation.y = FLAG_KEYS[K % 3][i] * (1 + 1.8 * gale) + 0.16 * gale * (i + 1); }); }  // (WP12: a gust makes it snap harder and stand out, on the same stepped keys)
      D.setIntent(intent);
    },
    setIntent(name) { const n = intents.includes(name) ? name : 'approach'; for (const k of intents) if (badges[k]) badges[k].visible = k === n; },
  };
  return D;
}
function mergeG(list) { // (a tiny local merge: BufferGeometryUtils is already imported by the ship builder, this avoids a second import path)
  const pos = [], nor = [];
  for (const g of list) { const ng = g.index ? g.toNonIndexed() : g; pos.push(...ng.attributes.position.array); nor.push(...ng.attributes.normal.array); g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
