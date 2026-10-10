// Stations and fittings (WP2): what each kind of post looks like (boiler, helm, coal bunker, ammo, chart table, lookout, deflector, bomb bay, escort hook, coil base, swivel crank ...), the ways between decks
// (ladders, ropes, stairs, the lift cage, slide poles), steam pipes with their valves, racks, extinguishers, vents, the medical bay and the escort hooks. Moved from the old shipMesh.js with textures,
// brass and iron trims and a few more details; every function returns { key, batches, dyn, bounds } (registry.js).
import { THREE } from '../style.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

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
  const { T, W, X, Y, P, FZ } = ctx;
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
      b.cyl(T.brass, X(x + 22), Y(y - 82), FZ + sg * 52, 9.5, 4, 1, Math.PI / 2, 0, 0, undefined, { tr: 'brass' }); // the pressure gauge
      b.cyl('#f2e9d2', X(x + 22), Y(y - 82), FZ + sg * 54.2, 7, 1, 0, Math.PI / 2, 0, 0, undefined, { tr: 'plain' });
    }
  } else if (k === 'helm') {
    b.box(T.hullDark, X(x), Y(y - 30), FZ, 18, 60, 18, 2.5, 0, 0, 0, { tr: 'woodC' });
    b.cyl(T.brass, X(x - 22), Y(y - 62), FZ, 8, 6, 1.2, 0, 0, 0, undefined, { tr: 'brass' }); // a binnacle with its compass
    b.sphere('#bcd9e3', X(x - 22), Y(y - 67), FZ, 6.4, 6.4, 6.4, 0.8, true);
    const w = ctx.dynBatch(key + ':wheel');
    w.geo(T.brass, new THREE.TorusGeometry(32, 4, 6, 14), null, 1.5, { tr: 'brass', uv: 'fit' });
    for (let i = 0; i < 4; i++) w.box(T.brass, 0, 0, 0, 66, 5, 5, 0, 0, 0, (i * Math.PI) / 4, { tr: 'brass' });
    for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; w.box(T.rail, Math.cos(a) * 38, Math.sin(a) * 38, 0, 7, 7, 7, 0.6, 0, 0, a, { tr: 'woodC' }); } // the handles
    const wg = w.buildGroup();
    wg.position.set(X(x), Y(y - 74), FZ);
    ctx.content.add(wg);
    dyn.push({ role: 'wheel', key, node: wg });
  } else if (k === 'coal') {
    b.box('#6b4a32', X(x), Y(y - 24), FZ, 130, 48, 80, 3, 0, 0, 0, { tr: 'woodC' });
    b.box('#4e3524', X(x), Y(y - 48), FZ - 38, 134, 6, 6, 1, 0, 0, 0, { tr: 'woodC' });
    for (let i = 0; i < 6; i++) b.sphere('#2f2a2e', X(x - 45 + i * 18), Y(y - 54 + (i % 2) * 8), FZ + (i % 3) * 14 - 14, 15, 11, 15, 1.5, true, { tr: 'iron' });
  } else if (k === 'ammo') {
    for (const [dx, dy, dz] of [[-40, 0, -22], [10, 0, -12], [-12, 38, -17]]) {
      b.box('#8a6444', X(x + dx), Y(y - 20 - dy), FZ + dz, 52, 38, 48, 2.5, 0, 0, 0, { tr: 'woodC' });
      for (const sx of [-16, 16]) b.box(T.iron, X(x + dx + sx), Y(y - 20 - dy), FZ + dz, 5, 39.5, 49.5, 0.6, 0, 0, 0, { tr: 'iron' }); // iron straps round the crate
    }
    b.box(T.brass, X(x - 12), Y(y - 60), FZ - 17, 54, 4, 50, 0, 0, 0, 0, { tr: 'brass' });
  } else if (k === 'navigator') {
    b.box(T.hullDark, X(x), Y(y - 35), FZ, 120, 8, 70, 2, 0, 0, 0, { tr: 'woodC' });
    for (const dx of [-50, 50]) b.box(T.hullDark, X(x + dx), Y(y - 17), FZ, 8, 34, 8, 1, 0, 0, 0, { tr: 'woodC' });
    b.box('#ebdfc0', X(x), Y(y - 41), FZ, 100, 3, 56, 0, 0, 0, 0, { tr: 'canvas1' }); // the chart
    b.cyl('#d9ccaa', X(x + 40), Y(y - 45), FZ + 18, 4, 40, 0.8, 0, 0, Math.PI / 2, undefined, { tr: 'canvas2' }); // a rolled chart
    b.cyl(T.brass, X(x - 34), Y(y - 42), FZ - 10, 9, 3.4, 0.8, 0, 0, 0, undefined, { tr: 'brass' }); // dividers' compass
  } else if (k === 'lookout') {
    b.cyl(T.iron, X(x), Y(y - 35), 0, 5, 70, 1.5, 0, 0, 0, undefined, { tr: 'iron' });
    b.cyl(T.brass, X(x), Y(y - 72), 0, 11, 26, 2, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
    b.cyl(T.brass, X(x + 17), Y(y - 72), 0, 13, 5, 1, 0, 0, Math.PI / 2, undefined, { tr: 'brass' }); // the lens ring
  } else if (k === 'deflector') {
    b.cyl(T.iron, X(x), Y(y - 28), FZ, 5, 56, 1.5, 0, 0, 0, undefined, { tr: 'iron' });
    b.cone(T.brass, X(x), Y(y - 66), FZ, 36, 22, 2.5, Math.PI, 0, 0, { tr: 'brass' });
    b.sphere('#9dd6e3', X(x), Y(y - 60), FZ, 8, 8, 8, 0, true);
  } else if (k === 'bombBay') {
    for (const dx of [-60, 0, 60]) { b.sphere('#3a3032', X(x + dx), Y(y - 50), FZ, 20, 28, 20, 2.5, false, { tr: 'iron' }); b.box('#3a3032', X(x + dx), Y(y - 82), FZ, 4, 16, 4, 0, 0, 0, 0, { tr: 'iron' }); b.cone(T.iron, X(x + dx), Y(y - 24), FZ, 11, 10, 0.8, Math.PI, 0, 0, { tr: 'iron' }); }
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
  const pc = T.brass;
  for (let k = 0; k + 1 < pts.length; k++) {
    fb.rod(pc, pts[k], pts[k + 1], 5, 1.2, { tr: 'brass' });
    const n = Math.floor(pts[k].distanceTo(pts[k + 1]) / 90);
    for (let j = 1; j <= n; j++) { const t = j / (n + 1), q = pts[k].clone().lerp(pts[k + 1], t); fb.box(T.iron, q.x, q.y, q.z, 9, 9, 6.5, 0.6, 0, 0, 0, { tr: 'iron' }); } // pipe clamps
  }
  for (const q of pts) fb.box(T.brass, q.x, q.y, q.z, 11, 11, 11, 0.8, 0, 0, 0, { tr: 'brass' });
  if (p.valve) { fb.cyl('#c4574d', X(p.valve[0]), Y(p.valve[1]), -W + 34, 12, 4, 1.2, Math.PI / 2, 0, 0, undefined, { tr: 'plain' }); fb.rod(T.brass, V(X(p.valve[0]), Y(p.valve[1]), -W + 26), V(X(p.valve[0]), Y(p.valve[1]), -W + 34), 2.4, 0, { tr: 'brass' }); }
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildRack(r, ctx, i) {
  const { T, W, X, Y, platY } = ctx, key = 'rack:' + i, b = ctx.part(key), fb = farSides(b), y = platY(r.d);
  fb.box('#6b4a32', X(r.x), Y(y - 56), -W + 18, 44, 56, 6, 1.5, 0, 0, 0, { tr: 'woodC' });
  fb.box(r.kind === 'sword' ? '#9aa1a6' : r.kind === 'hookshot' ? T.brass : '#8a6444', X(r.x), Y(y - 56), -W + 23, r.kind === 'sword' ? 6 : 30, r.kind === 'sword' ? 48 : 8, 4, 0, 0, 0, 0, { tr: r.kind === 'hookshot' ? 'brass' : r.kind === 'sword' ? 'iron' : 'woodC' });
  if (r.kind === 'hammer') fb.box(T.iron, X(r.x), Y(y - 66), -W + 24, 18, 12, 6, 0.8, 0, 0, 0, { tr: 'iron' });
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
  fb.cyl('#c4574d', X(v.x), Y(y - 70), -W + 66, 9, 4, 1, Math.PI / 2, 0, 0, undefined, { tr: 'plain' });
  fb.cone(T.iron, X(v.x), Y(y - 96), -W + 52, 15, 12, 1.4, 0, 0, 0, { tr: 'iron' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}

export function buildMedbay(q, ctx) {
  const { T, W, X, Y, P, platY } = ctx, key = 'medbay', b = ctx.part(key), fb = farSides(b), y = platY(P.findIndex((o) => o.id === q.p));
  fb.box('#f3ead6', X(q.x), Y(y - 45), -W + 40, 70, 90, 30, 2, 0, 0, 0, { tr: 'canvas3' });
  fb.box(T.trim, X(q.x), Y(y - 60), -W + 56, 50, 14, 2, 0, 0, 0, 0, { tr: 'plain' });
  fb.box('#c4574d', X(q.x), Y(y - 60), -W + 57.4, 20, 4, 1, 0, 0, 0, 0, { tr: 'plain' }); // the cross
  fb.box('#c4574d', X(q.x), Y(y - 60), -W + 57.4, 4, 20, 1, 0, 0, 0, 0, { tr: 'plain' });
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
  fb.geo(T.brass, new THREE.TorusGeometry(12, 2.4, 5, 12), new THREE.Matrix4().makeTranslation(X(v.x), Y(y - 62), -W + 44), 1, { tr: 'brass', uv: 'fit' });
  return { key, batches: [b], dyn: [], bounds: b.bounds };
}
