// A ship's PARTS LIST (via its layout) turned into 3D, in the toon + ink look.
//   buildShipModel(layout, { enemy }) -> model
// Ship coordinates (x along the ship, y down) become 3D as X = x - pivot, Y = -y; Z is depth (the viewer is at +Z). The gondola is given a believable beam
// (about 18% of the ship's length), the rooms are a cut-away: the hull's wall that faces the viewer is hidden each frame (model.setView) so you can see the
// crew and fittings, and the far wall carries the room colours. Pitch is a rotation of `pitchG` about the ship's tilt pivot; the facing (and COME ABOUT) is a
// yaw of `root`. Anything the generator has no 3D version of yet is drawn as a plain box and listed in model.fallbacks.
import { THREE, Batch, G, mat, PAL, INK, look, applyLook } from './style.js';
import { hullGeom, rowOf, isNestRow, KEEL_ROWS } from '../host/shipBuild.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mix = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

export const THEMES = {
  ours: { hull: '#b98a5a', hullDark: '#8a6444', deck: '#c9a05f', deckAlt: '#bf9567', wall: '#d2b98e', rail: '#6b4a32', bag: '#ebdfc0', bagShade: '#d6c7a2', fin: '#c49a74', brass: '#c9a85a', iron: '#6a6568', trim: '#8fb37a', glass: '#bcd9e3', rope: '#a88a5a', roomTint: 0 },
  enemy: { hull: '#4a4346', hullDark: '#2f2a2e', deck: '#6a5f62', deckAlt: '#5e5457', wall: '#6a5a5c', rail: '#2f2a2e', bag: '#a8443f', bagShade: '#8c2f2f', fin: '#4a4346', brass: '#b08a4a', iron: '#4a4346', trim: '#e8dcc0', glass: '#c9706a', rope: '#6b5a4a', roomTint: 0.55 },
};

// A flat extrusion of a 2D shape (in 3D x,y) from z0 to z1.
function slab(shape, z0, z1, curve = 6) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1, z1 - z0), bevelEnabled: false, curveSegments: curve });
  g.translate(0, 0, z0);
  return g;
}
// Only the side faces of an extrusion: a hollow tube open at both ends (the hull skin).
function tube(shape, z0, z1, bev = 0) {
  const depth = Math.max(1, z1 - z0 - 2 * bev);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 2, curveSegments: 6 });
  const side = g.groups.find((q) => q.materialIndex === 1);
  const start = side ? side.start : 0, count = side ? side.count : g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const a = g.attributes[name], arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { arr[i * 3] = a.getX(start + i); arr[i * 3 + 1] = a.getY(start + i); arr[i * 3 + 2] = a.getZ(start + i); }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  out.translate(0, 0, z0 + bev);
  g.dispose();
  return out;
}

// The beam of a searchlight: an open cone from the lens along +x, brightest at the lens and fading to black (invisible when added) at the far end.
function beamGeo(len, half, color, a0) {
  const r = Math.tan(half) * len;
  const g = new THREE.ConeGeometry(r, len, 24, 1, true);
  g.translate(0, -len / 2, 0);
  g.rotateZ(Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getX(i) / len, 0, 1), k = a0 * (1 - t) * (1 - t * 0.3);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
const lampMat = new THREE.MeshBasicMaterial({ color: '#ffe9b0' });
const flameMats = { out: new THREE.MeshBasicMaterial({ color: PAL.fire }), inn: new THREE.MeshBasicMaterial({ color: '#ffd35c' }), ink: new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }) };

const GUN_LOOK = {
  long: { len: 118, r: 6.5 }, mortar: { len: 44, r: 15 }, scatter: { len: 70, r: 11 }, flak: { len: 78, r: 8 },
  harpoon: { len: 100, r: 5 }, flame: { len: 68, r: 10 }, mines: { len: 44, r: 12 },
};

export function buildShipModel(layout, opts = {}) {
  const L = layout, T = opts.enemy ? THEMES.enemy : THEMES.ours;
  const P = L.platforms || [];
  const b = L.bounds || { x0: 0, x1: 1500, y0: -300, y1: 900 };
  const pv = (b.x0 + b.x1) / 2;
  const len = b.x1 - b.x0;
  const W = clamp(len * 0.09, 90, 250); // the gondola's half-beam (about 18% of the ship's length across)
  const FZ = -W * 0.3; // the depth where fittings stand (crew walk in front of them, ladders behind)
  const laneZ = -W * 0.62; // ladders, ropes and poles
  const X = (x) => x - pv, Y = (y) => -y;
  const fallbacks = [];
  const note = (s) => { if (!fallbacks.includes(s)) fallbacks.push(s); };
  const safe = (name, fn) => { try { fn(); } catch (e) { note(name + ' failed: ' + (e && e.message)); console.warn('ship3d', name, e); } };

  const root = new THREE.Group(); // yaw (facing / COME ABOUT) is applied here; placed at the ship's pivot in the world
  const pitchG = new THREE.Group(); // pitch about the tilt pivot
  const content = new THREE.Group();
  root.add(pitchG);
  pitchG.add(content);
  const tp = L.tiltPivot || [pv, 520];
  pitchG.position.set(X(tp[0]), Y(tp[1]), 0);
  content.position.set(-X(tp[0]), -Y(tp[1]), 0);

  const main = new Batch(); // everything fixed to the hull that never hides
  const wallPos = new Batch(), wallNeg = new Batch(); // the two hull sides (local +Z faces the viewer when the ship faces right)
  const platY = (d) => (P[d] ? P[d].y : 0);
  const H = (() => { try { return hullGeom(P, L.rooms || []); } catch { return null; } })();
  const hx0 = H ? H.xL : P.length ? Math.min(...P.map((q) => q.x0)) : 0, hx1 = H ? H.xR : P.length ? Math.max(...P.map((q) => q.x1)) : 1000;
  const dyn = { guns: {}, lamps: [], bags: [], lanterns: [], boilerGlow: [], sails: [], engines: [], coil: null, liftCages: [], wheels: [], twins: [] };
  const lights = { points: [], boiler: [] };

  // ---- the hull ------------------------------------------------------------------------------------------------------------------------------
  safe('hull', () => {
    if (!H) { note('hull: no main / lower deck, bare decks only'); return; }
    const sh = new THREE.Shape();
    sh.moveTo(X(H.xL), Y(H.top));
    sh.lineTo(X(H.xTopR), Y(H.top));
    sh.quadraticCurveTo(X(H.xR), Y(H.top + 4), X(H.xR), Y(H.yShoulder));
    sh.quadraticCurveTo(X(H.xR - 4), Y(H.yTuck), X(H.xNose), Y(H.yTuck2));
    sh.lineTo(X(H.xKeelR), Y(H.yKeel));
    sh.lineTo(X(H.xKeelL), Y(H.yKeel));
    sh.lineTo(X(H.xL2), Y(H.yTuck2));
    sh.closePath();
    main.geo(T.hull, tube(sh, -W, W, 14), mat(), 6); // the skin: a hollow tube, open at both sides
    for (const [wb, z0] of [[wallNeg, -W], [wallPos, W - 12]]) {
      wb.geo(T.hullDark, slab(sh, z0, z0 + 12), mat(), 5); // the side wall (hidden on the viewer's side)
      const zOut = z0 < 0 ? z0 - 1.5 : z0 + 12 + 1.5;
      for (const dx of [-320, -220, -120]) wb.box(T.glass, X(H.xNose + dx + 40), Y(H.top + 48), zOut, 80, 56, 3, 2); // bridge windows
      const md = P.find((q) => q.id === 'main');
      if (md) for (const dx of [170, 420, 870, 1120]) { const x = md.x0 + dx; if (x < md.x1 - 40) wb.cyl(T.glass, X(x), Y(md.y + 50), zOut, 16, 3, 2, Math.PI / 2); } // portholes
    }
    for (const bx of H.boxes || []) { // full decks added under the lower deck: a box hull round each
      const s2 = new THREE.Shape();
      s2.moveTo(X(bx.x0), Y(bx.y0));
      s2.lineTo(X(bx.x1), Y(bx.y0));
      s2.lineTo(X(bx.x1), Y(bx.y1 - 26));
      s2.lineTo(X(bx.x1 - 26), Y(bx.y1));
      s2.lineTo(X(bx.x0 + 26), Y(bx.y1));
      s2.lineTo(X(bx.x0), Y(bx.y1 - 26));
      s2.closePath();
      main.geo(T.hullDark, tube(s2, -W * 0.92, W * 0.92, 8), mat(), 5);
      wallNeg.geo(T.hull, slab(s2, -W * 0.92, -W * 0.92 + 10), mat(), 4);
      wallPos.geo(T.hull, slab(s2, W * 0.92 - 10, W * 0.92), mat(), 4);
    }
  });

  // ---- decks, rails, the nest's basket, the wheelhouse --------------------------------------------------------------------------------------------
  const zOf = (q) => {
    const row = rowOf(q);
    if (isNestRow(row)) return 95;
    if (row === 'helm') return W * 0.6;
    if (row === 'bay') return W * 0.75;
    if (row === 'belly') return W * 0.4;
    return W * 0.97;
  };
  // [x0, x1, zHalf, rail?] pieces: the part inside the hull is full width, outriggers beyond it narrower (with rails)
  const deckSegs = (q) => {
    const row = rowOf(q), z = zOf(q);
    const rail = !!q.outside || isNestRow(row) || row === 'helm';
    if (!['main', 'lower'].includes(row)) return [[q.x0, q.x1, z, rail]];
    const out = [];
    if (q.x0 < hx0) out.push([q.x0, Math.min(q.x1, hx0), W * 0.5, true]);
    if (q.x1 > hx0 && q.x0 < hx1) out.push([Math.max(q.x0, hx0), Math.min(q.x1, hx1), q.outside ? W * 0.9 : z, !!q.outside]);
    if (q.x1 > hx1) out.push([Math.max(q.x0, hx1), q.x1, W * 0.5, true]);
    return out.filter((s) => s[1] - s[0] > 1);
  };
  safe('decks', () => {
    for (const q of P) {
      const row = rowOf(q), thick = 12;
      if (/^pod/.test(q.id)) { // the ball turret: a round pod under the belly
        const mid = (q.x0 + q.x1) / 2, rr = (q.x1 - q.x0) / 2 + 12;
        main.sphere(T.hullDark, X(mid), Y(q.y - 25), 0, rr, 58, rr * 0.95, 4);
        main.sphere(T.glass, X(mid + 35), Y(q.y - 25), rr * 0.7, 22, 22, 12, 2);
        main.box(T.rail, X(mid), Y(q.y + 2), 0, q.x1 - q.x0, 8, rr * 1.7, 2);
        continue;
      }
      const segs = deckSegs(q);
      for (const [a, c, z, rail] of segs) {
        main.box(T.hull, X((a + c) / 2), Y(q.y + thick / 2), 0, c - a, thick, z * 2, 3);
        for (let x = a, k = 0; x < c - 1; x += 70, k++) { // planks (flat colour bands on the top)
          const w = Math.min(70, c - x);
          main.box(k % 2 ? T.deckAlt : T.deck, X(x + w / 2), Y(q.y - 0.4), 0, w - 0.2, 0.8, z * 2 - 6, 0);
        }
        if (rail) {
          const hi = isNestRow(row) ? 56 : 46;
          for (const sgn of [-1, 1]) {
            for (let x = a + 10; x <= c - 5; x += 90) main.box(T.rail, X(x), Y(q.y - hi / 2), sgn * (z - 6), 6, hi, 6, 1.5);
            main.box(T.rail, X((a + c) / 2), Y(q.y - hi), sgn * (z - 6), c - a, 5, 5, 1.5);
          }
        }
        if (z === W * 0.5 && (q.x1 > hx1 || q.x0 < hx0)) { // struts holding an outrigger to the hull
          const near = a < hx0 ? c : a, far = a < hx0 ? a + 18 : c - 18;
          for (const sgn of [-1, 1]) main.rod(T.rail, V(X(far), Y(q.y + 12), sgn * z * 0.6), V(X(near), Y(q.y + 52), sgn * z * 0.6), 4, 1.2);
        }
      }
      const z0 = Math.max(...segs.map((s) => s[2]), 10);
      if (isNestRow(row)) { // the basket under the nest
        const mid = (q.x0 + q.x1) / 2;
        main.sphere(T.hullDark, X(mid), Y(q.y + 36), 0, (q.x1 - q.x0) / 2 + 6, 34, 100, 4);
      }
      if (row === 'helm') { // the wheelhouse: end walls, a back wall, a roof; glass facing the viewer's side
        const zh = z0, hh = 120, x0 = q.x0, x1 = q.x1;
        wallNeg.box(T.wall, X((x0 + x1) / 2), Y(q.y - hh / 2), -zh, x1 - x0, hh, 8, 3);
        wallPos.box(T.wall, X((x0 + x1) / 2), Y(q.y - hh / 2), zh, x1 - x0, hh, 8, 3);
        wallNeg.box(T.glass, X((x0 + x1) / 2), Y(q.y - hh * 0.6), -zh - 4.5, (x1 - x0) * 0.6, 40, 2, 1);
        wallPos.box(T.glass, X((x0 + x1) / 2), Y(q.y - hh * 0.6), zh + 4.5, (x1 - x0) * 0.6, 40, 2, 1);
        main.box(T.wall, X(x0), Y(q.y - hh / 2), 0, 8, hh, zh * 2, 3);
        main.box(T.wall, X(x1), Y(q.y - hh / 2), 0, 8, hh, zh * 2, 3);
        main.box(T.hullDark, X((x0 + x1) / 2), Y(q.y - hh - 6), 0, x1 - x0 + 24, 12, zh * 2 + 24, 3.5);
      }
      if (!q.outside && (row === 'bay' || KEEL_ROWS.includes(row))) { // a compartment under the hull: floor plate, ends, back wall
        const zh = z0, ceilY = q.y - 120;
        main.box(T.hullDark, X((q.x0 + q.x1) / 2), Y(q.y + 20), 0, q.x1 - q.x0 + 24, 14, zh * 2 + 20, 3.5);
        wallNeg.box(T.wall, X((q.x0 + q.x1) / 2), Y((q.y + ceilY) / 2), -zh, q.x1 - q.x0, q.y - ceilY, 8, 2);
        wallPos.box(T.wall, X((q.x0 + q.x1) / 2), Y((q.y + ceilY) / 2), zh, q.x1 - q.x0, q.y - ceilY, 8, 2);
        for (const x of [q.x0, q.x1]) main.box(T.hullDark, X(x), Y((q.y + ceilY) / 2), 0, 8, q.y - ceilY, zh * 2, 2.5);
      }
    }
  });

  // ---- room panels on the inside face of both hull walls ----------------------------------------------------------------------------------------
  safe('rooms', () => {
    const ceilingOf = (q, x0, x1) => {
      let best = q.y - 165;
      for (const o of P) {
        if (o === q || isNestRow(rowOf(o))) continue;
        if (o.y < q.y - 40 && o.y > q.y - 230 && o.x1 > x0 + 20 && o.x0 < x1 - 20) best = Math.max(best, o.y + 12);
      }
      return best;
    };
    for (const r of L.rooms || []) {
      const q = P[r.d];
      if (!q || r.outside || q.outside) continue;
      if (!['main', 'lower', 'keel', 'deep'].includes(rowOf(q))) continue;
      const top = ceilingOf(q, r.x0, r.x1), h = q.y - top;
      const col = mix(r.color || '#b08250', T.hullDark, T.roomTint);
      const dark = mix(col, '#000000', 0.25), cx = X((r.x0 + r.x1) / 2), ww = r.x1 - r.x0 - 4;
      wallNeg.box(col, cx, Y(q.y - h / 2), -W + 13.5, ww, h - 2, 3, 0);
      wallPos.box(col, cx, Y(q.y - h / 2), W - 13.5, ww, h - 2, 3, 0);
      wallNeg.box(dark, cx, Y(q.y - 8), -W + 14.5, ww, 14, 3.5, 0); // skirting
      wallPos.box(dark, cx, Y(q.y - 8), W - 14.5, ww, 14, 3.5, 0);
    }
  });

  // ---- connectors (ladders, ropes, stairs, lift, poles) --------------------------------------------------------------------------------------
  safe('connectors', () => {
    for (const c of L.connectors || []) {
      const yt = platY(c.top), yb = platY(c.bottom);
      if (c.type === 'ladder' || c.type === 'rope') {
        const rail = c.type === 'rope' ? T.rope : T.rail, rr = c.type === 'rope' ? 2.4 : 3.2;
        for (const dx of [-16, 16]) main.rod(rail, V(X(c.xTop + dx), Y(yt), laneZ), V(X(c.xBottom + dx), Y(yb), laneZ), rr, c.type === 'rope' ? 0 : 1);
        const n = Math.max(2, Math.floor(Math.abs(yb - yt) / 30));
        for (let i = 1; i < n; i++) { const t = i / n; main.box(rail, X(c.xTop + (c.xBottom - c.xTop) * t), Y(yt + (yb - yt) * t), laneZ, 34, c.type === 'rope' ? 3 : 4, 4, 0); }
      } else if (c.type === 'pole') {
        main.rod(T.brass, V(X(c.xTop), Y(yt), laneZ + 24), V(X(c.xBottom), Y(yb), laneZ + 24), 4.5, 1);
      } else if (c.type === 'stairs') {
        const n = Math.max(4, Math.round(Math.abs(c.xBottom - c.xTop) / 24));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          main.box(T.deckAlt, X(c.xTop + (c.xBottom - c.xTop) * t), Y(yt + (yb - yt) * t + 4), laneZ + 40, Math.abs(c.xBottom - c.xTop) / n + 2, 8, 90, 1.5);
        }
        main.rod(T.rail, V(X(c.xTop), Y(yt - 40), laneZ - 3), V(X(c.xBottom), Y(yb - 40), laneZ - 3), 3, 1);
      } else if (c.type === 'lift') {
        for (const dx of [-38, 38]) main.rod(T.iron, V(X(c.xTop + dx), Y(yt - 10), laneZ + 20), V(X(c.xTop + dx), Y(yb + 5), laneZ + 20), 3.5, 1.5);
        const cage = new Batch();
        cage.box(T.brass, 0, 6, 0, 80, 10, 70, 2.5);
        for (const dx of [-36, 36]) for (const dz of [-30, 30]) cage.box(T.brass, dx, 66, dz, 5, 120, 5, 1.5);
        cage.box(T.brass, 0, 128, 0, 80, 8, 70, 2.5);
        const cg = cage.build();
        cg.position.set(X(c.xTop), Y(yb), laneZ + 20);
        content.add(cg);
        dyn.liftCages.push(cg);
      } else note('connector ' + c.type + ' (not drawn)');
    }
  });

  // ---- pipes ---------------------------------------------------------------------------------------------------------------------------------
  safe('pipes', () => {
    for (const p of L.pipes || []) {
      const pts = p.points.map(([x, y]) => V(X(x), Y(y), -W + 26));
      for (let i = 0; i + 1 < pts.length; i++) main.rod(mix(T.brass, '#ffffff', 0.1), pts[i], pts[i + 1], 5, 1.2);
      for (const q of pts) main.sphere(T.brass, q.x, q.y, q.z, 7, 7, 7, 1.2, true);
      if (p.valve) main.cyl('#c4574d', X(p.valve[0]), Y(p.valve[1]), -W + 34, 12, 4, 1.2, Math.PI / 2);
    }
  });

  // ---- racks, extinguishers, vents, medbay, hatches ------------------------------------------------------------------------------------------------
  safe('small fittings', () => {
    for (const r of L.racks || []) {
      const y = platY(r.d);
      main.box('#6b4a32', X(r.x), Y(y - 56), -W + 18, 44, 56, 6, 1.5);
      main.box(r.kind === 'sword' ? '#9aa1a6' : r.kind === 'hookshot' ? T.brass : '#8a6444', X(r.x), Y(y - 56), -W + 23, r.kind === 'sword' ? 6 : 30, r.kind === 'sword' ? 48 : 8, 4, 0);
    }
    for (const e of L.extinguishers || []) {
      const y = platY(e.d);
      main.cyl('#c4574d', X(e.x), Y(y - 30), -W + 24, 8, 36, 1.5);
      main.cyl('#2b2622', X(e.x), Y(y - 52), -W + 24, 4, 8, 0);
    }
    for (const v of L.vents || []) {
      const y = platY(v.d);
      main.cyl(T.iron, X(v.x), Y(y - 45), -W + 52, 13, 90, 2);
      main.cyl('#c4574d', X(v.x), Y(y - 70), -W + 66, 9, 4, 1, Math.PI / 2);
    }
    if (L.medbay) {
      const q = L.medbay, y = platY(P.findIndex((o) => o.id === q.p));
      main.box('#f3ead6', X(q.x), Y(y - 45), -W + 40, 70, 90, 30, 2);
      main.box(T.trim, X(q.x), Y(y - 60), -W + 56, 50, 14, 2, 0);
    }
    for (const h of L.hatches || []) main.box('#2f2a2e', X((h.x0 + h.x1) / 2), Y(platY(h.d) - 1.3), 0, h.x1 - h.x0, 1.4, W * 1.4, 0);
    for (const e of L.escortDocks || []) main.box(T.iron, X(e.x), Y(e.y - 10), 0, 14, 22, 14, 1.5);
  });

  // ---- stations (what each kind of post looks like) --------------------------------------------------------------------------------------------
  const glowSpots = [];
  safe('stations', () => {
    for (const s of L.stations || []) {
      const q = P[s.d];
      if (!q) continue;
      const y = q.y, x = s.x, k = s.kind;
      if (k === 'boiler') {
        main.cyl(T.brass, X(x), Y(y - 56), FZ, 52, 112, 3.5);
        main.sphere(T.brass, X(x), Y(y - 112), FZ, 52, 22, 52, 3.5);
        main.cyl(T.iron, X(x), Y(y - 160), FZ, 12, 110, 2.5);
        main.cyl(T.hullDark, X(x), Y(y - 4), FZ, 56, 8, 2.5);
        main.box('#3a3032', X(x + 62), Y(y - 18), FZ, 36, 36, 40, 2.5);
        for (const sg of [-1, 1]) glowSpots.push([X(x), Y(y - 36), FZ + sg * 53, sg]);
      } else if (k === 'helm') {
        main.box(T.hullDark, X(x), Y(y - 30), FZ, 18, 60, 18, 2.5);
        const w = new Batch();
        w.geo(T.brass, new THREE.TorusGeometry(32, 4, 8, 20), mat(), 1.5);
        for (let i = 0; i < 4; i++) w.box(T.brass, 0, 0, 0, 66, 5, 5, 0, 0, 0, (i * Math.PI) / 4);
        const wg = w.build();
        wg.position.set(X(x), Y(y - 74), FZ);
        content.add(wg);
        dyn.wheels.push(wg);
      } else if (k === 'coal') {
        main.box('#6b4a32', X(x), Y(y - 24), FZ, 130, 48, 80, 3);
        for (let i = 0; i < 6; i++) main.sphere('#2f2a2e', X(x - 45 + i * 18), Y(y - 54 + (i % 2) * 8), FZ + (i % 3) * 14 - 14, 15, 11, 15, 1.5, true);
      } else if (k === 'ammo') {
        for (const [dx, dy, dz] of [[-40, 0, -22], [10, 0, -12], [-12, 38, -17]]) main.box('#8a6444', X(x + dx), Y(y - 20 - dy), FZ + dz, 52, 38, 48, 2.5);
        main.box(T.brass, X(x - 12), Y(y - 60), FZ - 17, 54, 4, 50, 0);
      } else if (k === 'navigator') {
        main.box(T.hullDark, X(x), Y(y - 35), FZ, 120, 8, 70, 2);
        for (const dx of [-50, 50]) main.box(T.hullDark, X(x + dx), Y(y - 17), FZ, 8, 34, 8, 1);
        main.box('#ebdfc0', X(x), Y(y - 41), FZ, 100, 3, 56, 0);
      } else if (k === 'lookout') {
        main.cyl(T.iron, X(x), Y(y - 35), 0, 5, 70, 1.5);
        main.cyl(T.brass, X(x), Y(y - 72), 0, 11, 26, 2, 0, 0, Math.PI / 2);
      } else if (k === 'deflector') {
        main.cyl(T.iron, X(x), Y(y - 28), FZ, 5, 56, 1.5);
        main.cone(T.brass, X(x), Y(y - 66), FZ, 36, 22, 2.5, Math.PI);
        main.sphere('#9dd6e3', X(x), Y(y - 60), FZ, 8, 8, 8, 0, true);
      } else if (k === 'bombBay') {
        for (const dx of [-60, 0, 60]) { main.sphere('#3a3032', X(x + dx), Y(y - 50), FZ, 20, 28, 20, 2.5); main.box('#3a3032', X(x + dx), Y(y - 82), FZ, 4, 16, 4, 0); }
        main.rod(T.iron, V(X(x - 90), Y(y - 108), FZ), V(X(x + 90), Y(y - 108), FZ), 3, 1);
      } else if (k === 'escort') {
        main.box(T.iron, X(x), Y(y - 20), FZ, 30, 40, 30, 2);
      } else if (k === 'coil') {
        main.cyl(T.iron, X(x), Y(y - 60), FZ, 30, 120, 3);
        for (const dy of [20, 50, 80, 110]) main.geo(T.brass, new THREE.TorusGeometry(34, 4, 8, 16), mat(X(x), Y(y - dy), FZ, 1, 1, 1, Math.PI / 2, 0, 0), 1.5);
      } else if (k === 'gun') {
        main.box(T.hullDark, X(x), Y(y - 12), FZ, 36, 24, 36, 2); // (the gunner's crate; the gun itself is built from gunMounts)
      } else if (k === 'swivel') {
        main.cyl(T.brass, X(x), Y(y - 24), FZ, 10, 48, 1.5);
        note('swivel crank: brass post only');
      } else if (k === 'cannon' || k === 'cannonSeat') {
        main.cyl(T.brass, X(x), Y(y - 24), 0, 24, 40, 2.5, 0, 0, Math.PI / 2);
        note('crew cannon: a plain brass barrel');
      } else if (!['searchlight', 'engine', 'sail'].includes(k)) {
        main.box('#9aa1a6', X(x), Y(y - 20), FZ, 36, 40, 36, 2);
        note('station kind "' + k + '": generic box');
      }
    }
  });

  // ---- guns and searchlights (their barrels / drums are animated) ---------------------------------------------------------------------------------
  safe('guns', () => {
    for (const [name, m] of Object.entries(L.gunMounts || {})) {
      const g = GUN_LOOK[m.type] || { len: 84, r: 8 };
      main.cyl(T.hullDark, X(m.bx), Y(m.by + 14), 0, 24, 22, 3);
      main.box(T.hullDark, X(m.bx), Y(m.by + 4), 0, 16, 28, 16, 1.5);
      const bar = new Batch();
      bar.cyl(T.iron, g.len / 2 - 8, 0, 0, g.r, g.len, 2.5, 0, 0, Math.PI / 2);
      bar.sphere(T.hullDark, 0, 0, 0, g.r + 7, g.r + 7, g.r + 7, 2.5, true);
      if (m.type === 'flame') bar.cone('#ffb347', g.len + 6, 0, 0, g.r * 1.4, 20, 1.5, 0, 0, -Math.PI / 2);
      const pivot = new THREE.Group();
      pivot.position.set(X(m.bx), Y(m.by), 0);
      pivot.rotation.z = -m.aim;
      pivot.add(bar.build());
      content.add(pivot);
      dyn.guns[name] = pivot;
    }
  });
  safe('searchlights', () => {
    for (const [name, s] of Object.entries(L.searchlights || {})) {
      const ll = s.len || 44;
      main.cyl(T.hullDark, X(s.bx), Y(s.by + 22), 0, 7, 44, 1.5);
      const lamp = new Batch();
      lamp.cyl(T.brass, ll / 2 - 10, 0, 0, 22, ll, 3, 0, 0, Math.PI / 2);
      lamp.cyl(T.iron, -6, 0, 0, 26, 16, 3, 0, 0, Math.PI / 2);
      const pivot = new THREE.Group();
      pivot.position.set(X(s.bx), Y(s.by), 0);
      pivot.rotation.z = -s.aim;
      pivot.add(lamp.build());
      const lens = new THREE.Mesh(new THREE.CircleGeometry(19, 16), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
      lens.rotation.y = Math.PI / 2;
      lens.position.set(ll + 0.5, 0, 0);
      pivot.add(lens);
      const reach = 1000, half = 0.26;
      const spot = new THREE.SpotLight('#fff0c8', 0, reach * 1.5, half, 0.35, 0);
      spot.position.set(ll, 0, 0);
      const target = new THREE.Object3D();
      target.position.set(reach, 0, 0);
      pivot.add(spot, target);
      spot.target = target;
      const outer = new THREE.Mesh(beamGeo(reach, half, '#fff0c8', 0.36), beamMat);
      const inner = new THREE.Mesh(beamGeo(reach * 0.8, half * 0.5, '#fffbe8', 0.55), beamMat);
      for (const m2 of [outer, inner]) { m2.position.x = ll; m2.renderOrder = 5; m2.frustumCulled = false; pivot.add(m2); }
      content.add(pivot);
      dyn.lamps.push({ name, pivot, spot, target, outer, inner, lens, reach, ll });
    }
  });

  // ---- engines -------------------------------------------------------------------------------------------------------------------------------
  safe('engines', () => {
    const lowQ = P.find((q) => q.id === 'lower') || P[0];
    const mid = lowQ ? (lowQ.x0 + lowQ.x1) / 2 : pv;
    for (const e of L.engines || []) {
      const y = platY(e.d) + 38, out = e.x < mid ? -1 : 1;
      const eg = new THREE.Group();
      eg.position.set(X(e.x), Y(y), 0);
      const nac = new Batch();
      nac.sphere('#6d7378', 0, 0, 0, 62, 24, 26, 3);
      nac.cyl(T.iron, out * 62, 0, 0, 12, 14, 2.5, 0, 0, Math.PI / 2);
      nac.box(T.hullDark, 0, 36, 0, 10, 30, 16, 1.5); // the strut up to the deck
      eg.add(nac.build());
      const prop = new Batch();
      prop.sphere(T.brass, 0, 0, 0, 8, 8, 8, 1.5, true);
      for (let i = 0; i < 3; i++) prop.box('#6b4a32', 0, 0, 0, 5, 82, 11, 1.8, (i * 2 * Math.PI) / 3, 0, 0);
      const pg = prop.build();
      pg.position.set(out * 72, 0, 0);
      eg.add(pg);
      if (e.dir) eg.rotation.z = -e.dir;
      content.add(eg);
      dyn.engines.push({ name: e.name, group: eg, prop: pg });
    }
  });

  // ---- sails, armour, ram, coil ----------------------------------------------------------------------------------------------------------------
  safe('sails', () => {
    for (const s of L.sails || []) {
      const y = platY(s.d);
      main.rod(T.rail, V(X(s.x), Y(y), 0), V(X(s.x), Y(y - s.h), 0), 5, 1.5);
      const sail = new Batch();
      sail.box('#ebdfc0', 0, -s.h * 0.4, 0, s.w, s.h * 0.78, 5, 2.5);
      sail.box(T.rail, 0, 0, 0, s.w + 10, 6, 8, 1.5);
      const sg = sail.build();
      sg.position.set(X(s.x), Y(y - s.h), 0);
      content.add(sg);
      dyn.sails.push({ node: sg, s });
    }
  });
  safe('armour', () => {
    for (const a of L.armour || []) {
      const q = P[a.d];
      if (!q) continue;
      const hgt = q.outside ? 40 : 90;
      for (const [wb, sgn] of [[wallNeg, -1], [wallPos, 1]]) {
        const zz = sgn * (q.outside ? W * 0.9 + 6 : W) + (sgn > 0 ? 6 : -6);
        wb.box('#8d969b', X((a.x0 + a.x1) / 2), Y(q.y - hgt / 2 + 10), zz, a.x1 - a.x0, hgt, 8, 3);
        for (let x = a.x0 + 14; x < a.x1; x += 40) wb.sphere('#6d7378', X(x), Y(q.y - hgt / 2 + 10), zz + sgn * 5, 3.5, 3.5, 3.5, 0, true);
      }
    }
  });
  safe('ram', () => {
    const r = L.ram;
    if (!r || !r.pts) return;
    const sh = new THREE.Shape();
    r.pts.forEach(([x, y], i) => (i ? sh.lineTo(X(x), Y(y)) : sh.moveTo(X(x), Y(y))));
    sh.closePath();
    main.geo(T.iron, slab(sh, -46, 46), mat(), 4);
    main.cone('#8d969b', X(r.tipX + 24), Y(r.y), 0, 26, 60, 3, 0, 0, -Math.PI / 2);
  });
  safe('coil', () => {
    const c = L.coil;
    if (!c) return;
    main.cyl(T.iron, X(c.x), Y(c.y + 32), 0, 18, 64, 2.5);
    for (const dy of [10, 30, 50]) main.geo(T.brass, new THREE.TorusGeometry(24, 3.5, 8, 16), mat(X(c.x), Y(c.y + dy), 0, 1, 1, 1, Math.PI / 2, 0, 0), 1.5);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), new THREE.MeshBasicMaterial({ color: '#9dd6e3' }));
    tip.position.set(X(c.x), Y(c.y - 10), 0);
    content.add(tip);
  });

  // ---- gasbags with rib bands, fins and rigging -------------------------------------------------------------------------------------------------
  const bags = L.gasbags && L.gasbags.length ? L.gasbags : L.gasbag ? [L.gasbag] : [];
  safe('gasbags', () => {
    // A fin: a triangle on the bag's surface, pointing up and back; four of them make the cross at the stern. sgn +1 = stern (left end), -1 = nose.
    const finGeo = (Gb, sgn, s, flip = 1) => {
      const fx = sgn > 0 ? -Gb.rx : Gb.rx, p = (dx, dy) => [fx + sgn * dx * s, dy * Gb.ry * flip];
      const shp = new THREE.Shape();
      const a = p(330, 0.74), c = p(60, 0.5), d = p(-70, 0.92);
      shp.moveTo(a[0], a[1]); shp.lineTo(c[0], c[1]); shp.lineTo(d[0], d[1]); shp.closePath();
      return slab(shp, -6, 6, 2);
    };
    bags.forEach((Gb, bi) => {
      const bag = new Batch();
      const rz = Gb.ry * 0.96;
      bag.sphere(T.bag, 0, 0, 0, Gb.rx, Gb.ry, rz, 6);
      const nb = Math.max(5, Math.round(Gb.rx / 95));
      for (let i = 1; i < nb; i++) {
        const u = -0.92 + (1.84 * i) / nb, f = Math.sqrt(Math.max(0, 1 - u * u)), mid = Math.abs(i - nb / 2) < 0.6;
        bag.geo(mid ? T.trim : T.bagShade, new THREE.TorusGeometry(1, mid ? 0.04 : 0.024, 6, 28), mat(u * Gb.rx, 0, 0, rz * f * 1.012, Gb.ry * f * 1.012, Gb.ry, 0, Math.PI / 2, 0), 0);
      }
      const addFins = (sgn, s) => {
        const g1 = finGeo(Gb, sgn, s);
        bag.geo(T.fin, g1, mat(), 3); // up
        bag.geo(T.fin, finGeo(Gb, sgn, s, -1), mat(), 3); // down
        bag.geo(T.fin, g1, mat(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), 3); // toward the viewer
        bag.geo(T.fin, g1, mat(0, 0, 0, 1, 1, 1, -Math.PI / 2, 0, 0), 3); // away
      };
      if (bi === 0) addFins(1, 1);
      if (bi === bags.length - 1) addFins(-1, 0.7);
      const grp = new THREE.Group();
      grp.position.set(X(Gb.cx), Y(Gb.cy), 0);
      grp.add(bag.build());
      if (Gb.twin) { // the twin envelope rides higher behind
        const tw = new Batch();
        tw.sphere(T.bag, 0, 0, 0, Gb.rx * 0.7, Gb.ry * 0.62, Gb.ry * 0.6, 5);
        for (let i = 1; i < 6; i++) { const u = -0.8 + (1.6 * i) / 6, f = Math.sqrt(1 - u * u); tw.geo(T.bagShade, new THREE.TorusGeometry(1, 0.03, 6, 24), mat(u * Gb.rx * 0.7, 0, 0, Gb.ry * 0.6 * f, Gb.ry * 0.62 * f, Gb.ry * 0.6, 0, Math.PI / 2, 0), 0); }
        const twg = tw.build();
        twg.position.set(-20, 258, 0);
        grp.add(twg);
      }
      content.add(grp);
      dyn.bags.push({ node: grp, G: Gb, i: bi });
    });
    const cat = P.find((q) => q.id === 'catwalk') || P.reduce((a, q) => (q.y < a.y ? q : a), P[0] || { y: 470 });
    for (const Gb of bags) for (const f of [-0.54, -0.28, 0, 0.28, 0.54]) for (const sgn of [-1, 1]) { // rigging down to the gondola
      const x = Gb.cx + f * Gb.rx, yTop = Gb.cy + Gb.ry * Math.sqrt(Math.max(0, 1 - f * f)) * 0.82;
      main.rod('#3a2c20', V(X(x - 30), Y(cat.y - 4), sgn * W * 0.85), V(X(x), Y(yTop), sgn * Gb.ry * 0.6), 2.4, 0);
    }
  });

  // ---- lanterns (small lights hung in the rooms) and the boiler glow ----------------------------------------------------------------------------
  safe('lanterns', () => {
    const hullRooms = (L.rooms || []).filter((r) => !r.outside && P[r.d] && !P[r.d].outside && ['main', 'lower'].includes(rowOf(P[r.d])));
    const picks = hullRooms.filter((_, i) => i % 2 === 0).slice(0, opts.enemy ? 2 : 4);
    for (const r of picks) {
      const q = P[r.d], x = (r.x0 + r.x1) / 2, y = q.y - 128;
      main.rod(T.rail, V(X(x), Y(y - 18), -W + 40), V(X(x), Y(y), -W + 40), 1.5, 0);
      dyn.lanterns.push([X(x), Y(y), -W + 40]);
    }
    for (const g of glowSpots) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(20, 14), new THREE.MeshBasicMaterial({ color: '#ff8a3a', side: THREE.DoubleSide }));
      m.position.set(g[0], g[1], g[2]);
      if (g[3] < 0) m.rotation.y = Math.PI;
      content.add(m);
      dyn.boilerGlow.push(m);
    }
  });
  for (const p of dyn.lanterns) {
    const m = new THREE.Mesh(G.sphereLo, lampMat);
    m.scale.setScalar(9);
    m.position.set(p[0], p[1], p[2]);
    content.add(m);
    const pl = new THREE.PointLight('#ffd9a0', 0, 420, 0);
    pl.position.set(p[0], p[1] - 6, p[2] + 50);
    content.add(pl);
    lights.points.push(pl);
  }
  if (dyn.boilerGlow.length) {
    const bl = new THREE.PointLight('#ff7a2a', 0, 380, 0);
    bl.position.copy(dyn.boilerGlow[0].position).add(V(0, 0, 60));
    content.add(bl);
    lights.boiler.push(bl);
  }

  // ---- put the batches in the tree ---------------------------------------------------------------------------------------------------------------------
  const posG = wallPos.build(), negG = wallNeg.build();
  content.add(main.build(), posG, negG);
  const tris = main.tris + wallPos.tris + wallNeg.tris;

  // ---- flames (a pool; stepped frames, no wobble) --------------------------------------------------------------------------------------------------
  const flamePool = [];
  const makeFlame = () => {
    const g = new THREE.Group();
    const a = new THREE.Mesh(G.cone, flameMats.out), inkM = new THREE.Mesh(G.cone, flameMats.ink), c = new THREE.Mesh(G.cone, flameMats.inn);
    a.scale.set(26, 70, 26); a.position.y = 35;
    inkM.scale.set(31, 78, 31); inkM.position.y = 36;
    c.scale.set(13, 38, 13); c.position.y = 20;
    g.add(inkM, a, c);
    return g;
  };

  // ---- the per-frame update ---------------------------------------------------------------------------------------------------------------------------
  const model = {
    root, pitchG, content, W, pv, X, Y, tris, fallbacks, layout: L, lights, dyn, enemy: !!opts.enemy, theme: T,
    // Hide the hull wall that faces the viewer: camSide > 0 when the camera is on the ship's local +Z side.
    setView(camSide) {
      posG.visible = camSide < 0;
      negG.visible = camSide >= 0;
    },
    // c: { t, ship (handle), world, night (0..1), lamps (the beams shine) }
    update(c) {
      const sh = c.ship, st = (sh && sh.ctx) || c.world, t = c.t, night = c.night || 0;
      dyn.bags.forEach((bg) => {
        const bs = st.bags && st.bags[bg.i];
        const gas = bs ? bs.gas : st.ship ? st.ship.gas : 50;
        const g = clamp((Number.isFinite(gas) ? gas : 50) / 100, 0, 1);
        bg.node.scale.set(0.78 + 0.44 * g, 0.9 + 0.2 * g, 0.9 + 0.2 * g);
      });
      const guns = st.GUNS || {};
      for (const [name, pivot] of Object.entries(dyn.guns)) { const live = guns[name]; if (live && Number.isFinite(live.aim)) pivot.rotation.z = -live.aim; }
      const sls = st.searchlights || [];
      dyn.lamps.forEach((lp, i) => {
        const live = sls.find((q) => q.n === lp.name) || sls[i];
        if (live && Number.isFinite(live.aim)) lp.pivot.rotation.z = -live.aim;
        const power = live && Number.isFinite(live.power) ? clamp(live.power, 0, 1) : 0.3;
        const on = !!c.lamps && night > 0.12;
        const reach = lp.reach * (0.65 + 0.35 * power);
        lp.spot.intensity = on ? 9 * (0.5 + 0.5 * power) * Math.min(1, night * 1.4) : 0;
        lp.spot.distance = reach * 1.5;
        lp.spot.angle = Math.max(0.2, (live && Number.isFinite(live.half) ? live.half : 0.24) * 1.15);
        lp.outer.visible = lp.inner.visible = on;
        lp.outer.scale.x = lp.inner.scale.x = reach / lp.reach;
        lp.target.position.x = reach;
        lp.lens.material.color.set(on ? '#fffbe0' : '#b9b09a');
      });
      const lampOn = night > 0.12 ? 1 : 0;
      for (const pl of lights.points) pl.intensity = lampOn * 5 * night;
      const press = st.ship ? clamp((Number.isFinite(st.ship.press) ? st.ship.press : 60) / 100, 0.2, 1) : 0.6;
      for (const pl of lights.boiler) pl.intensity = (0.8 + 5 * night) * press;
      for (const m of dyn.boilerGlow) m.material.color.set(press > 0.5 ? '#ff9a4a' : '#d9531a');
      const speed = st.ship && Number.isFinite(st.ship.speed) ? clamp(st.ship.speed, 0, 1.2) : 0.3;
      const live = st.engines || [];
      for (const e of dyn.engines) {
        e.prop.rotation.x = (t * (10 + 26 * speed)) % (Math.PI * 2); // spinning propellers
        const le = live.find((q) => q.name === e.name);
        if (le && Number.isFinite(le.dir)) e.group.rotation.z = -le.dir;
      }
      for (const w of dyn.wheels) w.rotation.z = (st.ship && Number.isFinite(st.ship.order) ? st.ship.order : 0) * 3;
      const fires = st.fires || [];
      while (flamePool.length < fires.length) { const f = makeFlame(); content.add(f); flamePool.push(f); }
      flamePool.forEach((f, i) => {
        const fr = fires[i], q = fr && P[fr.d];
        f.visible = !!q;
        if (!q) return;
        const k = fr.big ? 1.7 : 1, sc = [[1, 1], [1.08, 0.88], [0.92, 1.14], [1.04, 1.0]][Math.floor(t * 8 + fr.x) % 4];
        f.position.set(X(fr.x), Y(q.y), FZ + 40);
        f.scale.set(k * sc[0] * 1.15, k * sc[1] * 1.15, k * sc[0] * 1.15);
      });
    },
  };
  applyLook(root);
  return model;
}
