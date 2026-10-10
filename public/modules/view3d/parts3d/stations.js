// Stations and fittings (WP2): what each kind of post looks like (boiler, helm, coal bunker, ammo, chart table, lookout, deflector, bomb bay, escort hook, coil base, swivel crank ...), the ways between decks
// (ladders, ropes, stairs, the lift cage, slide poles), steam pipes with their valves, racks, extinguishers, vents, the medical bay and the escort hooks. Moved from the old shipMesh.js with textures,
// brass and iron trims and a few more details; every function returns { key, batches, dyn, bounds } (registry.js).
import { THREE } from '../style.js';
import { config } from '../../../config.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// A5: every station kind carries ONE saturated accent (LOOK3D.STATIONS.ACCENT, the 2D game's own colours: brass, cream dials, green valve wheels, blue-grey pipes, red crosses and needles, an ember glow). Accents are
// flat ('plain' trim: no texture darkening) so they stay saturated against the brown timber.
const ACC_DEFAULT = { brass: '#deaa32', cream: '#f4e9c6', red: '#d44a3a', green: '#4fb06a', pipe: '#8eaabd', ember: '#ff8a2c', dark: '#3a3438', paper: '#f1e5bd', sea: '#7eb3d2', land: '#8cba76', steel: '#9fb2c0' };
export const accents = () => ({ ...ACC_DEFAULT, ...(((config.LOOK3D || {}).STATIONS || {}).ACCENT || {}) });
const PL = { tr: 'plain' };

// (fix_ship) Things hung on the FAR wall (pipes, racks, extinguishers, vents, valves, the sick bay) are written with the far wall at -z; farSides builds each piece twice, as given in the 'neg' layer and mirrored
// in z in the 'pos' layer, so the copy on the far side of the ship (whichever way she faces) is the one that shows, and nothing hangs on the near wall in front of the crew.
function farSides(b) {
  const flip = (v) => V(v.x, v.y, -v.z);
  return {
    box: (c, cx, cy, cz, ...r) => { b.neg.box(c, cx, cy, cz, ...r); b.pos.box(c, cx, cy, -cz, ...r); },
    cyl: (c, cx, cy, cz, ...r) => { b.neg.cyl(c, cx, cy, cz, ...r); b.pos.cyl(c, cx, cy, -cz, ...r); },
    cone: (c, cx, cy, cz, ...r) => { b.neg.cone(c, cx, cy, cz, ...r); b.pos.cone(c, cx, cy, -cz, ...r); },
    sphere: (c, cx, cy, cz, ...r) => { b.neg.sphere(c, cx, cy, cz, ...r); b.pos.sphere(c, cx, cy, -cz, ...r); },
    rod: (c, p, q, ...r) => { b.neg.rod(c, p, q, ...r); b.pos.rod(c, flip(p), flip(q), ...r); },
    geo: (c, g, m, ...r) => { b.neg.geo(c, g, m, ...r); const m2 = m.clone(); m2.elements[14] = -m2.elements[14]; b.pos.geo(c, g, m2, ...r); },
  };
}

export function buildStation(s, ctx) {
  const { T, W, X, Y, P, FZ } = ctx, A = accents();
  const key = 'station:' + s.n, b = ctx.part(key), dyn = [];
  const q = P[s.d];
  if (!q) return { key, batches: [b], dyn, bounds: null };
  const y = q.y, x = s.x, k = s.kind;
  if (k === 'boiler') {
    b.cyl(T.brass, X(x), Y(y - 56), FZ, 52, 112, 3.5, 0, 0, 0, undefined, { tr: 'brass' });
    b.sphere(T.brass, X(x), Y(y - 112), FZ, 52, 22, 52, 3.5, false, { tr: 'brass' });
    for (const dy of [22, 58, 94]) b.cyl('#7c7468', X(x), Y(y - dy), FZ, 53.6, 6, 1.2, 0, 0, 0, undefined, { tr: 'iron' }); // riveted bands
    b.cyl(T.iron, X(x), Y(y - 160), FZ, 12, 110, 2.5, 0, 0, 0, undefined, { tr: 'iron' }); // the stack
    b.cyl(T.brass, X(x), Y(y - 218), FZ, 15, 8, 1.4, 0, 0, 0, undefined, { tr: 'brass' });
    b.cyl(T.hullDark, X(x), Y(y - 4), FZ, 56, 8, 2.5, 0, 0, 0, undefined, { tr: 'iron' });
    b.box('#3a3032', X(x + 62), Y(y - 18), FZ, 36, 36, 40, 2.5, 0, 0, 0, { tr: 'iron' }); // the firebox
    for (const sg of [-1, 1]) {
      ctx.glowSpots.push([X(x), Y(y - 36), FZ + sg * 53, sg]);
      const gx = X(x + 22), gy = Y(y - 82);
      b.cyl(A.brass, gx, gy, FZ + sg * 52, 16, 5, 1.2, Math.PI / 2, 0, 0, undefined, PL); // the pressure gauge: a brass bezel,
      b.cyl(A.cream, gx, gy, FZ + sg * 54.8, 12.5, 1.2, 0, Math.PI / 2, 0, 0, undefined, PL); // a cream dial
      b.box(A.red, gx + 3.4, gy + 5, FZ + sg * 55.9, 2.8, 13, 1.2, 0, 0, 0, -0.55, PL); // and a red needle
    }
  } else if (k === 'helm') {
    b.box(T.hullDark, X(x), Y(y - 30), FZ, 18, 60, 18, 2.5, 0, 0, 0, { tr: 'woodC' });
    b.cyl(T.brass, X(x - 22), Y(y - 62), FZ, 8, 6, 1.2, 0, 0, 0, undefined, { tr: 'brass' }); // a binnacle with its compass
    b.sphere('#bcd9e3', X(x - 22), Y(y - 67), FZ, 6.4, 6.4, 6.4, 0.8, true);
    const w = ctx.dynBatch(key + ':wheel');
    w.geo(A.cream, new THREE.TorusGeometry(32, 4.8, 6, 14), null, 1.6, { tr: 'plain', uv: 'fit' }); // a cream rim,
    for (let i = 0; i < 4; i++) w.box(A.brass, 0, 0, 0, 66, 6, 6, 0, 0, 0, (i * Math.PI) / 4, PL); // brass spokes
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; if (i === 2) continue; w.box(A.brass, Math.cos(a) * 38, Math.sin(a) * 38, 0, 8, 8, 8, 0.6, 0, 0, a, PL); } // and handles
    w.cyl(A.brass, 0, 0, 0, 9, 14, 1.2, Math.PI / 2, 0, 0, undefined, PL); // the hub
    w.box(A.red, 0, 38, 0, 11, 14, 11, 0.8, 0, 0, 0, PL); // the red pin: the top handle, so a turn of the wheel shows
    const wg = w.buildGroup();
    wg.position.set(X(x), Y(y - 74), FZ);
    ctx.content.add(wg);
    dyn.push({ role: 'wheel', key, node: wg });
  } else if (k === 'coal') {
    b.box('#322a2e', X(x), Y(y - 24), FZ, 130, 48, 80, 3, 0, 0, 0, { tr: 'iron' }); // a black bunker
    b.box('#1d181c', X(x), Y(y - 48), FZ - 38, 134, 6, 6, 1, 0, 0, 0, { tr: 'iron' });
    for (let i = 0; i < 7; i++) b.box('#15111a', X(x - 54 + i * 18), Y(y - 54 + (i % 2) * 7), FZ + (i % 3) * 14 - 14, 19 + (i % 3) * 3, 15, 19, 1.2, 0.3 * i, 0.5 * i, 0.2 * i, { tr: 'plain' }); // coal lumps
    for (const [dx, dz, s] of [[-30, 8, 1], [4, -10, 1.2], [38, 6, 0.9]]) b.box(A.ember, X(x + dx), Y(y - 56), FZ + dz, 11 * s, 8 * s, 11 * s, 0.8, 0.4, 0.7, 0.3, PL); // embers among them
    for (const sg of [-1, 1]) ctx.glowSpots.push([X(x - 8), Y(y - 26), FZ + sg * 41.5, sg, 0.62]); // and a glow in the bunker's belly
  } else if (k === 'ammo') {
    b.box(A.dark, X(x), Y(y - 40), FZ - 22, 150, 80, 8, 2, 0, 0, 0, PL); // the rack: a back board,
    b.box(A.dark, X(x), Y(y - 4), FZ - 6, 150, 8, 40, 1.5, 0, 0, 0, PL); // a foot
    b.box(A.dark, X(x), Y(y - 44), FZ - 6, 150, 7, 40, 1.5, 0, 0, 0, PL); // and a shelf
    for (let i = 0; i < 4; i++) for (const [yy, kk] of [[8, 0], [48, 1]]) { // brass shells standing in two rows
      const sx = X(x - 51 + i * 34), sy = Y(y - yy);
      b.cyl(A.brass, sx, sy + 17, FZ - 6 + kk * 2, 8.5, 34, 1.2, 0, 0, 0, undefined, PL);
      b.cone('#cf9a2a', sx, sy + 40, FZ - 6 + kk * 2, 8.5, 14, 1.2, 0, 0, 0, PL);
    }
  } else if (k === 'navigator') {
    b.box(T.hullDark, X(x), Y(y - 35), FZ, 120, 8, 70, 2, 0, 0, 0, { tr: 'woodC' });
    for (const dx of [-50, 50]) b.box(T.hullDark, X(x + dx), Y(y - 17), FZ, 8, 34, 8, 1, 0, 0, 0, { tr: 'woodC' });
    b.box(A.paper, X(x), Y(y - 41), FZ, 100, 3, 56, 0, 0, 0, 0, PL); // the chart
    b.box(A.paper, X(x), Y(y - 66), FZ - 8, 96, 54, 3, 1.4, 0, 0, 0, PL); // a map sheet standing at the back of the table, painted on both faces: land, sea and a red course
    for (const sg of [-1, 1]) {
      const zz = FZ - 8 + sg * 1.9;
      b.box(A.sea, X(x + 24), Y(y - 58), zz, 40, 20, 0.8, 0, 0, 0, 0, PL);
      b.box(A.land, X(x - 22), Y(y - 72), zz, 38, 22, 0.8, 0, 0, 0, 0, PL);
      b.box(A.red, X(x), Y(y - 64), zz + sg * 0.5, 62, 3.4, 0.8, 0, 0, 0, -0.35, PL);
    }
    b.cyl('#d9ccaa', X(x + 40), Y(y - 45), FZ + 18, 4, 40, 0.8, 0, 0, Math.PI / 2, undefined, { tr: 'canvas2' }); // a rolled chart
    b.cyl(T.brass, X(x - 34), Y(y - 42), FZ - 10, 9, 3.4, 0.8, 0, 0, 0, undefined, { tr: 'brass' }); // dividers' compass
  } else if (k === 'lookout') {
    b.cyl(T.iron, X(x), Y(y - 35), 0, 5, 70, 1.5, 0, 0, 0, undefined, { tr: 'iron' });
    b.cyl(A.brass, X(x + 4), Y(y - 74), 0, 10, 46, 2, 0, 0, Math.PI / 2, undefined, PL); // the telescope: a bright brass tube,
    b.cone('#d29a2a', X(x + 36), Y(y - 74), 0, 15, 20, 1.6, 0, 0, Math.PI / 2, PL); // a flared objective,
    b.cyl(A.cream, X(x - 22), Y(y - 74), 0, 7, 8, 1, 0, 0, Math.PI / 2, undefined, PL); // and a cream eyepiece cup
  } else if (k === 'deflector') {
    b.cyl(T.iron, X(x), Y(y - 28), FZ, 5, 56, 1.5, 0, 0, 0, undefined, { tr: 'iron' });
    b.cone(T.brass, X(x), Y(y - 66), FZ, 36, 22, 2.5, Math.PI, 0, 0, { tr: 'brass' });
    b.sphere('#9dd6e3', X(x), Y(y - 60), FZ, 8, 8, 8, 0, true);
  } else if (k === 'bombBay') {
    for (const dx of [-60, 0, 60]) { b.sphere('#3a3032', X(x + dx), Y(y - 50), FZ, 20, 28, 20, 2.5, false, { tr: 'iron' }); b.box('#3a3032', X(x + dx), Y(y - 82), FZ, 4, 16, 4, 0, 0, 0, 0, { tr: 'iron' }); b.cone(A.red, X(x + dx), Y(y - 24), FZ, 11, 10, 0.8, Math.PI, 0, 0, PL); }
    b.rod(T.iron, V(X(x - 90), Y(y - 108), FZ), V(X(x + 90), Y(y - 108), FZ), 3, 1, { tr: 'iron' });
  } else if (k === 'escort') {
    b.box(T.iron, X(x), Y(y - 20), FZ, 30, 40, 30, 2, 0, 0, 0, { tr: 'iron' });
    b.cyl(T.brass, X(x), Y(y - 44), FZ, 6, 8, 1, 0, 0, 0, undefined, { tr: 'brass' });
  } else if (k === 'coil') {
    b.cyl(T.iron, X(x), Y(y - 60), FZ, 30, 120, 3, 0, 0, 0, undefined, { tr: 'iron' });
    for (const dy of [20, 50, 80, 110]) b.geo(T.brass, new THREE.TorusGeometry(34, 4, 6, 12), new THREE.Matrix4().compose(V(X(x), Y(y - dy), FZ), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), 1.5, { tr: 'brass', uv: 'fit' });
  } else if (k === 'gun') {
    b.box(T.hullDark, X(x), Y(y - 12), FZ, 36, 24, 36, 2, 0, 0, 0, { tr: 'woodC' }); // (the gunner's crate; the gun itself is built from gunMounts)
  } else if (k === 'swivel') { // the crank that turns an engine pod: a brass post with a handle on an arm
    b.cyl(T.brass, X(x), Y(y - 24), FZ, 10, 48, 1.5, 0, 0, 0, undefined, { tr: 'brass' });
    b.cyl(T.hullDark, X(x), Y(y - 3), FZ, 16, 6, 1.4, 0, 0, 0, undefined, { tr: 'iron' });
    b.rod(T.brass, V(X(x), Y(y - 44), FZ), V(X(x + 22), Y(y - 54), FZ + 14), 2.6, 1, { tr: 'brass' });
    b.sphere(T.rail, X(x + 24), Y(y - 55), FZ + 15, 4.4, 4.4, 4.4, 0.8, true, { tr: 'woodC' });
  } else if (k === 'cannon' || k === 'cannonSeat') { // (the crew cannon itself is the `crewCannon` part; its posts are a footstool and nothing)
    if (k === 'cannon') b.box(T.hullDark, X(x), Y(y - 7), FZ, 30, 14, 26, 1.4, 0, 0, 0, { tr: 'woodC' });
  } else if (!['searchlight', 'engine', 'sail'].includes(k)) {
    b.box('#9aa1a6', X(x), Y(y - 20), FZ, 36, 40, 36, 2, 0, 0, 0, { tr: 'iron' });
    ctx.note('station kind "' + k + '": generic box');
  }
  return { key, batches: [b], dyn, bounds: b.bounds };
}

// ---- the ways between decks (fix_ship) -----------------------------------------------------------------------------------------------------------------------------------------------------
// Every ladder, rope, pole and stair stands in its LANE (registry.js connLane: toward the camera, in front of the fittings and behind the crew) and is built twice, once on each side of the ship: the copy at local +z is
// in the 'neg' layer, the copy at -z in the 'pos' layer, and the ship's shader hides the one that would be on the far side (see kit.js), so the way is always on the camera's side whichever way she faces. Where it comes up
// through a floor the shader cuts a hatch (ctx.carves) and a low coaming runs round it. Nothing runs across the way: the rails, rungs and treads are the only things in its lane.
const copies = (b) => [[b.neg, 1], [b.pos, -1]];
function hatchHole(ctx, b, yDeck, xa, xb, lane, halfZ, below = 16) {
  const { T, X } = ctx;
  for (const [sink, s] of copies(b)) {
    ctx.carves.push({ box: [X(xa), -(yDeck + below), X(xb), -yDeck + 3, s * lane - halfZ, s * lane + halfZ], side: s });
    const cx = X((xa + xb) / 2), y = -yDeck + 2.2, w = xb - xa; // (WP15: only a thin flat lip round the hole: the raised coaming made the hatch with its ladder stub read like a small stool from afar)
    for (const dz of [-halfZ, halfZ]) sink.box(T.rail, cx, y, s * lane + dz, w + 4, 3.2, 3.4, 0.6, 0, 0, 0, { tr: 'woodC' });
    for (const x of [xa, xb]) sink.box(T.rail, X(x), y, s * lane, 3.4, 3.2, halfZ * 2 + 3.4, 0.6, 0, 0, 0, { tr: 'woodC' });
  }
}

export function buildConnector(c, ctx, i) {
  const { T, X, Y, platY } = ctx;
  const key = c.type + ':' + i, b = ctx.part(key), dyn = [];
  const yt = platY(c.top), yb = platY(c.bottom), lane = ctx.connLane(c);
  if (c.type === 'ladder' || c.type === 'rope') {
    const rope = c.type === 'rope', rail = rope ? T.rope : T.rail, rr = rope ? 2.4 : 2.6, tr = rope ? 'rope' : 'woodC';
    const dy = yb - yt, dxl = c.xBottom - c.xTop, ln = Math.hypot(dy, dxl) || 1, ext = rope ? 0 : 26; // (a ladder stands a hand-hold's height above the floor it comes up through; WP15: shorter, and no top rung, so it is not a stool)
    const xe = c.xTop - (dxl / ln) * ext, ye = yt - (dy / ln) * ext;
    const n = Math.max(2, Math.floor(Math.abs(dy) / (rope ? 44 : 32)));
    for (const [sink, s] of copies(b)) {
      const z = s * lane;
      for (const dx of [-16, 16]) sink.rod(rail, V(X(xe + dx), Y(ye), z), V(X(c.xBottom + dx), Y(yb), z), rr, rope ? 0 : 1, { tr });
      for (let k = 1; k < n; k++) { const t = k / n; sink.box(rail, X(c.xTop + dxl * t), Y(yt + dy * t), z, 34, rope ? 3 : 4, 4, 0, 0, 0, 0, { tr }); }

    }
    hatchHole(ctx, b, yt, c.xTop - 25, c.xTop + 25, lane, 30, 16);
  } else if (c.type === 'pole') {
    for (const [sink, s] of copies(b)) sink.rod(T.brass, V(X(c.xTop), Y(yt - 36), s * lane), V(X(c.xBottom), Y(yb), s * lane), 4.5, 1, { tr: 'brass' });
    hatchHole(ctx, b, yt, c.xTop - 14, c.xTop + 14, lane, 20, 16);
  } else if (c.type === 'stairs') {
    const n = Math.max(4, Math.round(Math.abs(c.xBottom - c.xTop) / 24)), depth = Math.min(90, lane * 1.5);
    for (const [sink, s] of copies(b)) {
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        sink.box(T.deckAlt, X(c.xTop + (c.xBottom - c.xTop) * t), Y(yt + (yb - yt) * t + 4), s * lane, Math.abs(c.xBottom - c.xTop) / n + 2, 8, depth, 1.5, 0, 0, 0, { tr: 'deck' });
      }
      sink.rod(T.rail, V(X(c.xTop), Y(yt - 40), s * (lane - depth / 2 + 3)), V(X(c.xBottom), Y(yb - 40), s * (lane - depth / 2 + 3)), 3, 1, { tr: 'woodC' }); // (the handrail on the far edge, so nothing stands in front of the treads)
      sink.rod(T.rail, V(X(c.xTop), Y(yt + 8), s * (lane - depth / 2 + 3)), V(X(c.xBottom), Y(yb + 8), s * (lane - depth / 2 + 3)), 3.4, 1, { tr: 'woodC' }); // the stringer under the treads
    }
    const dir = Math.sign(c.xBottom - c.xTop) || 1;
    hatchHole(ctx, b, yt, Math.min(c.xTop, c.xTop + dir * 90) - 12, Math.max(c.xTop, c.xTop + dir * 90) + 12, lane, depth / 2 + 4, 34);
  } else if (c.type === 'lift') {
    for (const [sink, s] of copies(b)) for (const dx of [-38, 38]) sink.rod(T.iron, V(X(c.xTop + dx), Y(yt - 10), s * (lane - 22)), V(X(c.xTop + dx), Y(yb + 5), s * (lane - 22)), 3.5, 1.5, { tr: 'iron' });
    const cage = ctx.dynBatch(key + ':cage');
    cage.box(T.brass, 0, 6, 0, 80, 10, 70, 2.5, 0, 0, 0, { tr: 'brass' });
    for (const dx of [-36, 36]) for (const dz of [-30, 30]) cage.box(T.brass, dx, 66, dz, 5, 120, 5, 1.5, 0, 0, 0, { tr: 'brass' });
    cage.box(T.brass, 0, 128, 0, 80, 8, 70, 2.5, 0, 0, 0, { tr: 'brass' });
    for (const yy of [40, 86]) cage.box(T.brass, 0, yy, -30, 70, 3, 3, 0.6, 0, 0, 0, { tr: 'brass' }); // a gate rail
    const cg = cage.buildGroup();
    cg.position.set(X(c.xTop), Y(yb), lane);
    ctx.content.add(cg);
    dyn.push({ role: 'liftCage', key, node: cg, lane });
    hatchHole(ctx, b, yt, c.xTop - 46, c.xTop + 46, lane, 42, 16);
  } else ctx.note('connector ' + c.type + ' (not drawn)');
  return { key, batches: [b], dyn, bounds: b.bounds };
}

export function buildPipe(p, ctx, i) {
  const { T, W, X, Y } = ctx, key = 'pipe:' + (p.to || i) + ':' + i, b = ctx.part(key), fb = farSides(b);
  const pts = p.points.map(([x, y]) => V(X(x), Y(y), -W + 26));
  const A = accents();
  for (let k = 0; k + 1 < pts.length; k++) {
    fb.rod(A.pipe, pts[k], pts[k + 1], 5.6, 1.2, PL); // (A5: a blue-grey pipe with brass joints and a brass collar now and then)
    const n = Math.floor(pts[k].distanceTo(pts[k + 1]) / 190);
    for (let j = 1; j <= n; j++) { const t = j / (n + 1), q = pts[k].clone().lerp(pts[k + 1], t); fb.box(A.brass, q.x, q.y, q.z, 9, 9, 8.5, 0.6, 0, 0, 0, PL); }
  }
  for (const q of pts) fb.box(A.brass, q.x, q.y, q.z, 12, 12, 12, 0.8, 0, 0, 0, PL);
  if (p.valve) { fb.cyl(A.green, X(p.valve[0]), Y(p.valve[1]), -W + 34, 14, 4.5, 1.2, Math.PI / 2, 0, 0, undefined, PL); fb.rod(A.brass, V(X(p.valve[0]), Y(p.valve[1]), -W + 26), V(X(p.valve[0]), Y(p.valve[1]), -W + 34), 2.6, 0, PL); }
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildRack(r, ctx, i) {
  const { T, W, X, Y, platY } = ctx, key = 'rack:' + i, b = ctx.part(key), fb = farSides(b), y = platY(r.d);
  const A = accents(), cx = X(r.x), cy = Y(y - 56), zb = -W + 22.5;
  fb.box(A.cream, cx, cy, -W + 18, 52, 62, 5, 1.5, 0, 0, 0, PL); // (A5: the board is cream and the tool is a dark silhouette on it, with one colour hint)
  if (r.kind === 'sword') {
    fb.box(A.steel, cx, cy + 4, zb, 7, 44, 3, 0.6, 0, 0, 0, PL); // the blade
    fb.box(A.dark, cx, cy - 20, zb, 24, 5, 3, 0.6, 0, 0, 0, PL); // the guard
    fb.box(A.dark, cx, cy - 28, zb, 6, 12, 3, 0.6, 0, 0, 0, PL); // the grip
  } else if (r.kind === 'hookshot') {
    fb.box(A.brass, cx + 2, cy + 6, zb, 34, 9, 3, 0.6, 0, 0, 0, PL); // the barrel
    fb.box(A.dark, cx - 14, cy - 6, zb, 9, 22, 3, 0.6, 0, 0, -0.3, PL); // the stock
    fb.box(A.dark, cx + 20, cy + 14, zb, 7, 10, 3, 0.6, 0, 0, 0.5, PL); // the hook
  } else {
    fb.box(A.dark, cx, cy - 4, zb, 7, 46, 3, 0.6, 0, 0, 0.18, PL); // the handle
    fb.box(A.red, cx + 3, cy + 18, zb, 26, 14, 3, 0.6, 0, 0, 0.18, PL); // the head
  }
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildExtinguisher(e, ctx, i) {
  const { W, X, Y, platY } = ctx, key = 'extinguisher:' + i, b = ctx.part(key), fb = farSides(b), y = platY(e.d);
  fb.cyl('#c4574d', X(e.x), Y(y - 30), -W + 24, 8, 36, 1.5, 0, 0, 0, undefined, { tr: 'plain' });
  fb.cyl('#2b2622', X(e.x), Y(y - 52), -W + 24, 4, 8, 0, 0, 0, 0, undefined, { tr: 'iron' });
  fb.rod('#6a6568', V(X(e.x), Y(y - 40), -W + 24), V(X(e.x + 14), Y(y - 32), -W + 24), 1.2, 0, { tr: 'iron' }); // the hose
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildVent(v, ctx, i) {
  const { T, W, X, Y, platY } = ctx, key = 'vent:' + i, b = ctx.part(key), fb = farSides(b), y = platY(v.d);
  fb.cyl(T.iron, X(v.x), Y(y - 45), -W + 52, 13, 90, 2, 0, 0, 0, undefined, { tr: 'iron' });
  fb.cyl(accents().green, X(v.x), Y(y - 70), -W + 66, 11, 4.5, 1, Math.PI / 2, 0, 0, undefined, PL);
  fb.cone(T.iron, X(v.x), Y(y - 96), -W + 52, 15, 12, 1.4, 0, 0, 0, { tr: 'iron' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildMedbay(q, ctx) {
  const { T, W, X, Y, P, platY } = ctx, key = 'medbay', b = ctx.part(key), fb = farSides(b), y = platY(P.findIndex((o) => o.id === q.p));
  const A = accents();
  fb.box(A.cream, X(q.x), Y(y - 45), -W + 40, 70, 90, 30, 2, 0, 0, 0, PL);
  fb.box(A.red, X(q.x), Y(y - 62), -W + 56.4, 46, 13, 1.4, 0, 0, 0, 0, PL); // the cross (A5: twice the size)
  fb.box(A.red, X(q.x), Y(y - 62), -W + 56.4, 13, 46, 1.4, 0, 0, 0, 0, PL);
  fb.box(A.pipe, X(q.x), Y(y - 18), -W + 56.4, 54, 5, 1.2, 0, 0, 0, 0, PL); // a drawer front
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildEscortDock(e, ctx, i) {
  const { T, X, Y } = ctx, key = 'escortDock:' + (e.n || i), b = ctx.part(key);
  b.box(T.iron, X(e.x), Y(e.y - 10), 0, 14, 22, 14, 1.5, 0, 0, 0, { tr: 'iron' });
  b.cyl(T.brass, X(e.x), Y(e.y + 3), 0, 6, 8, 1, Math.PI / 2, 0, 0, undefined, { tr: 'brass' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

// the little extras the old art skipped: a sandbag of ballast and a gas-valve wheel
export function buildBallast(o, ctx, i) {
  const { T, X, Y } = ctx, key = 'ballast:' + i, b = ctx.part(key), y = o.y != null ? o.y : ctx.platY(o.d);
  b.sphere('#b79a63', X(o.x), Y(y - 12), 0, 15, 12, 13, 1.5, true, { tr: 'canvas4' });
  b.cyl(T.rope, X(o.x), Y(y - 24), 0, 5, 3, 0.6, 0, 0, 0, undefined, { tr: 'rope' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}
export function buildGasValve(v, ctx, i) {
  const { T, W, X, Y } = ctx, key = 'gasValve:' + i, b = ctx.part(key), fb = farSides(b), y = ctx.platY(v.d);
  fb.cyl(T.iron, X(v.x), Y(y - 30), -W + 44, 3.4, 60, 1, 0, 0, 0, undefined, { tr: 'iron' });
  fb.geo(accents().green, new THREE.TorusGeometry(13, 3.6, 5, 12), new THREE.Matrix4().makeTranslation(X(v.x), Y(y - 62), -W + 44), 1.2, { tr: 'plain', uv: 'fit' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}
