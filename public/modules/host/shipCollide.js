// SHIP-SHIP COLLISION: two ships in one sky are solid to each other. Node-safe: no DOM.
//
// ONE step of it runs from the world's step (simulation.js stepWorld), after every ship has moved (her engines, her lift, the rock pushing her clear), so no two hulls END a step overlapping.
// It works for EVERY pair of ships in the world: the co-op ?ships=N fleet, Versus (every phase while flying), later the gunship as a ship. With one ship nothing runs.
//   * NARROW PHASE  the hull is what a shell hits (shipSim.js hitsShip): the gasbag ellipses and the hit boxes (layout.hitRects), plus the ram prow's wedge when she has one (layout.ram.pts: config.RAM), put into the world through the ship's pose, mirrored when
//                   she faces left (so a ship half way through a COME ABOUT is in her mirrored place). A cheap bounds check goes first. The ellipses become 24-sided polygons that are
//                   a hair BIGGER than the ellipse (with a flat side at the nose, so a nose-to-nose ram pushes straight back), so a pair of polygons that no longer overlap leaves two hulls
//                   that do not overlap either. Two convex shapes are tested with the separating-axis method, which tells whether they overlap and where (the box of the overlap: the contact point).
//   * POSITION      a hull is several shapes, so the way apart is found for all the overlapping pairs together: every side of every shape is tried as the direction, and the one that clears them
//                   all with the least travel is the contact normal. The two ships are moved apart along it by that FULL distance (plus SLOP), split by mass (the heavy one moves less); if the move
//                   brought a new pair into contact it goes round again, up to ITER times. So after the step they just touch.
//   * VELOCITY      the closing speed along the normal is taken out of both (an impulse by mass, a small RESTITUTION bounce only for a hard hit). A ship's velocity is what the movement model reads:
//                   x is her speed along the bow (ship.speed, a share of TOP_SPEED, through pose.js driveVx and her facing f), y is her climb (ship.vy, up is positive; pose.vy is it negated).
//                   Both are written back, so the bounce sticks until her engines and her lift bring her back to speed.
//   * HURT          a hard hit (closing speed over MIN_CLOSING) hurts both (impact at the contact point), kicks both about it (forces.js kickForce: a nose-first ram tips the nose), clangs, puffs
//                   sparks and puts up a banner; the same two ships cannot do it again for COOLDOWN seconds. Versus counts it as a bump for both teams (match.count).
// Ships that are down (patching, wrecked) are not solid: the old Versus rule, a wreck is out of the fight. A ship that is moored (the lobby) is not moving, so nothing runs before CAST OFF.
// Tunables: config.COLLIDE.
import { config } from '../../config.js';
import { pivotOf as mirrorPivot, toShipX, toShipY, toWorldX, toWorldY, driveVx, driveGain } from './pose.js';
import { pivotOf as massOf, kickForce } from './forces.js';
import { pop } from './popups.js';

const SIDES = 24; // the ellipses become 24-sided polygons...
const TANGENT = 1 / Math.cos(Math.PI / SIDES); // ...with their edges lying ON the ellipse (the corners stick out by under 1 per cent)
const RECT_AXES = [[1, 0], [0, 1]];

// ---- the hull as convex shapes in the world ----
// A convex shape: pts [[x, y] ...] (a polygon), ax = its edge normals worth testing, and its box and middle. rect: true for a box (two axes).
function shape(pts, rect, any) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let ax = RECT_AXES;
  if (!rect) { // (the polygon has parallel opposite edges: half of them are enough. any: it has not, as the ram prow's wedge: every edge)
    ax = [];
    for (let i = 0; i < (any ? pts.length : pts.length / 2); i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      ax.push([dy / l, -dx / l]);
    }
  }
  return { pts, ax, rect, x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
// (the corners sit half a step round, so the polygon has a flat side at the nose, the tail, the top and the bottom: nose to nose is a straight push along x, not a glancing one)
const ELLIPSE = Array.from({ length: SIDES }, (_, i) => [Math.cos((2 * Math.PI * (i + 0.5)) / SIDES) * TANGENT, Math.sin((2 * Math.PI * (i + 0.5)) / SIDES) * TANGENT]);

// The shapes of a ship facing f (+1 or -1) where her pose says: her gasbags and her hit boxes (what hitsShip tests), in world coordinates.
export function hullShapes(ship, f = ship.pose.f) {
  const p = ship.pose, L = ship.layout, pv = mirrorPivot(ship);
  const wx = (sx) => (f === 1 ? sx + p.x : p.x + pv + f * (sx - pv)); // (the same sums as pose.js toWorldX)
  const out = [];
  for (const b of L.gasbags) {
    const cx = wx(b.cx), cy = b.cy + p.y;
    out.push(shape(ELLIPSE.map(([ux, uy]) => [cx + ux * b.rx, cy + uy * b.ry]), false));
  }
  for (const r of L.hitRects) {
    const a = wx(r.x0), b = wx(r.x1), x0 = Math.min(a, b), x1 = Math.max(a, b), y0 = r.y0 + p.y, y1 = r.y1 + p.y;
    out.push(shape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true));
  }
  if (L.ram && L.ram.pts) { // the ram prow is part of the hull, and the first thing to touch (config.RAM): its own wedge, marked so a contact knows it was the prow
    const s = shape(L.ram.pts.map(([x, y]) => [wx(x), y + p.y]), false, true);
    s.ram = true;
    out.push(s);
  }
  return out;
}

// The box of the whole ship in the world, facing f.
function hullBox(ship, f) {
  const b = ship.layout.bounds, p = ship.pose, pv = mirrorPivot(ship);
  const a = f === 1 ? b.x0 + p.x : p.x + pv + f * (b.x0 - pv), c = f === 1 ? b.x1 + p.x : p.x + pv + f * (b.x1 - pv);
  return { x0: Math.min(a, c), x1: Math.max(a, c), y0: b.y0 + p.y, y1: b.y1 + p.y };
}
const boxesTouch = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// Separating axes: do P and Q overlap? null, or { depth, nx, ny, x, y }: the shortest way to push P clear of Q (along n, away from Q) and the middle of the overlap's box.
function sat(P, Q) {
  if (!(P.x0 < Q.x1 && Q.x0 < P.x1 && P.y0 < Q.y1 && Q.y0 < P.y1)) return null;
  let best = Infinity, bx = 0, by = 0;
  const test = (nx, ny) => {
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, y] of P.pts) { const d = x * nx + y * ny; if (d < p0) p0 = d; if (d > p1) p1 = d; }
    for (const [x, y] of Q.pts) { const d = x * nx + y * ny; if (d < q0) q0 = d; if (d > q1) q1 = d; }
    let o = Math.min(p1, q1) - Math.max(p0, q0);
    if (o <= 0) return false;
    if ((p0 >= q0 && p1 <= q1) || (q0 >= p0 && q1 <= p1)) o += Math.min(Math.abs(p0 - q0), Math.abs(p1 - q1)); // (one inside the other along this axis: out the nearer end)
    if (o < best) { best = o; bx = nx; by = ny; }
    return true;
  };
  for (const [nx, ny] of P.rect && Q.rect ? RECT_AXES : P.ax) if (!test(nx, ny)) return null;
  if (!(P.rect && Q.rect)) for (const [nx, ny] of Q.ax) if (!test(nx, ny)) return null;
  if ((P.cx - Q.cx) * bx + (P.cy - Q.cy) * by < 0) { bx = -bx; by = -by; }
  return { depth: best, nx: bx, ny: by, x: (Math.max(P.x0, Q.x0) + Math.min(P.x1, Q.x1)) / 2, y: (Math.max(P.y0, Q.y0) + Math.min(P.y1, Q.y1)) / 2 };
}

// Every pair of shapes of two hulls that overlap: { pairs: [[P, Q] ...], deepest } (deepest = the sat() result with the greatest depth: the place the contact is reported at), or null.
function contact(SA, SB) {
  const pairs = [];
  let deepest = null;
  for (const P of SA) {
    for (const Q of SB) {
      const c = sat(P, Q);
      if (!c) continue;
      pairs.push([P, Q]);
      if (!deepest || c.depth > deepest.depth) deepest = c;
    }
  }
  return pairs.length ? { pairs, deepest } : null;
}

// The shortest way to take the first hull clear of the second: the direction n (from the second toward the first) and the distance t that clears EVERY overlapping pair at once. A hull is
// several shapes and they overlap differently (a gondola up here, a bag down there), so the way out of one pair alone is often the way into another: instead each side of every shape is tried
// as the direction, and the one that needs the least travel wins. (A shape moved along n by t is clear of the other when its lowest point along n is past the other's highest.)
function escape(pairs) {
  const seen = new Set();
  let best = null;
  for (const [P, Q] of pairs) {
    for (const S of [P, Q]) {
      for (const [ax, ay] of S.ax) {
        const key = Math.round(ax * 1000) + ',' + Math.round(ay * 1000);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const sign of [1, -1]) {
          const nx = ax * sign, ny = ay * sign;
          let t = 0;
          for (const [p, q] of pairs) {
            let pLow = Infinity, qHigh = -Infinity;
            for (const [x, y] of p.pts) { const d = x * nx + y * ny; if (d < pLow) pLow = d; }
            for (const [x, y] of q.pts) { const d = x * nx + y * ny; if (d > qHigh) qHigh = d; }
            if (qHigh - pLow > t) t = qHigh - pLow;
            if (best && t >= best.t) break;
          }
          if (!best || t < best.t) best = { t, nx, ny };
        }
      }
    }
  }
  return best;
}

// Would `ship`, facing f, overlap any other solid ship? (COME ABOUT asks with the mirrored facing before it starts; the bots and a person get "Another ship is in the way".)
export function overlapsAnother(world, ship, f = ship.pose.f) {
  if (!config.COLLIDE.ENABLED || !world.ships || world.ships.length < 2) return false;
  const mine = hullBox(ship, f);
  let SA = null;
  for (const o of world.ships) {
    if (o === ship || !solid(o) || !boxesTouch(mine, hullBox(o, o.pose.f))) continue;
    if (contact(SA || (SA = hullShapes(ship, f)), hullShapes(o))) return true;
  }
  return false;
}

const solid = (sh) => !(sh.state.down > 0) && !sh.ctx.wreck;
const massOfShip = (sh) => Math.max(1, massOf(sh.ctx).mass);

// A ship's velocity in the world as the movement model has it (px/s, y down): along her bow by her speed and facing, and her climb.
const velocity = (sh) => ({ x: driveVx(sh), y: sh.pose.vy });
// Add dx, dy (world px/s) to it: her speed is a share of TOP_SPEED (pose.js driveGain: the sails, overdrive and the sky are in it), her climb is ship.vy (up is positive).
function addVelocity(sh, dx, dy) {
  const per = driveGain(sh); // (world px/s along x per unit of speed: negative for a ship facing left)
  if (per) sh.ctx.ship.speed += dx / per;
  sh.pose.vy += dy;
}

// A ship level with another meets her gasbag-first (the bag's nose is 320 px out, the gondola's 120 behind that), and the prow below it would never get to touch. So a NOSE-ON meeting also counts as the prow's
// when the contact is within RAM.REACH of her point and the way out is along her bow (no more than RAM.SIDE across it): she was driving the prow at the other ship. sign: +1 for the pair's A, -1 for B.
function noseOn(S, c, sign) {
  const r = S.layout.ram;
  if (!r || r.tipX == null) return false;
  const R = config.RAM, ahead = -sign * c.nx * S.pose.f; // (n points from B to A: the other ship lies the way A is NOT pushed, and the way B IS)
  if (ahead <= 0 || Math.abs(c.ny) > R.SIDE) return false;
  return Math.hypot(c.x - toWorldX(S, r.tipX), c.y - toWorldY(S, r.y)) < R.REACH;
}

// D = { world, puff(x, y, colour, n) }
export function createShipCollide(D) {
  const world = D.world;
  const cool = new Map(); // 'idA|idB' -> { clang, hurt }: seconds left before this pair can do it again
  const K = () => config.COLLIDE;
  const stats = { contacts: 0, hits: 0 }; // (for the gates)

  // One pair: resolve up to ITER contacts; returns the first (the deepest, before any push) with the closing speed it had, or null.
  function pair(A, B, shapesA, shapesB) {
    const C = K();
    const ia = 1 / massOfShip(A), ib = 1 / massOfShip(B), w = ia + ib;
    let first = null;
    for (let it = 0; it < C.ITER; it++) {
      const hit = contact(shapesA, shapesB);
      if (!hit) break;
      const way = escape(hit.pairs);
      const c = { ...hit.deepest, depth: way.t, nx: way.nx, ny: way.ny }; // (the place of the deepest overlap, the way out of all of them)
      const push = c.depth + C.SLOP;
      A.pose.x += c.nx * push * (ia / w); A.pose.y += c.ny * push * (ia / w);
      B.pose.x -= c.nx * push * (ib / w); B.pose.y -= c.ny * push * (ib / w);
      const va = velocity(A), vb = velocity(B);
      const closing = -((va.x - vb.x) * c.nx + (va.y - vb.y) * c.ny); // (n points from B to A: negative means they are coming together)
      if (closing > 0) {
        const j = ((1 + (closing >= C.MIN_CLOSING ? C.RESTITUTION : 0)) * closing) / w;
        addVelocity(A, c.nx * j * ia, c.ny * j * ia);
        addVelocity(B, -c.nx * j * ib, -c.ny * j * ib);
      }
      if (!first) first = { ...c, closing: Math.max(0, closing), prowA: hit.pairs.some(([P]) => P.ram) || noseOn(A, c, 1), prowB: hit.pairs.some(([, Q]) => Q.ram) || noseOn(B, c, -1) }; // (prowA / prowB: A's / B's ram prow is one of the shapes that touched, or it was a nose-on meeting at its point: PVP.md "Space and range", config.RAM)
      // the shapes moved: bring them along (the ships' own shapes are rebuilt from the poses)
      shapesA = hullShapes(A); shapesB = hullShapes(B);
    }
    return first;
  }

  // What a contact does besides moving the ships: a clang and sparks, the bump count, the hurt, the kick, the banner.
  function effects(A, B, c) {
    const C = K();
    const key = A.id + '|' + B.id;
    let k = cool.get(key);
    if (!k) cool.set(key, (k = { clang: 0, hurt: 0 }));
    const hard = c.closing >= C.MIN_CLOSING;
    if ((hard || c.closing >= C.CLANG_CLOSING) && k.clang <= 0) {
      k.clang = C.COOLDOWN;
      const M = world.match;
      if (M && M.on) for (const s of [A, B]) if (s.team) M.count(s.team.id, 'bumps');
      world.sfxQ.push(['clang', true]);
      for (let i = 0; i < 4; i++) D.puff(c.x, c.y, i % 2 ? '#ffe9a8' : '#ffffff', 5);
    }
    if (!hard || k.hurt > 0) return;
    k.hurt = C.COOLDOWN;
    stats.hits++;
    const base = (C.DAMAGE * c.closing) / 100;
    // A RAM is a contact where a ram prow touched (c.prowA / c.prowB: the wedge is one of the shapes in contact, not just anywhere near it): the ship without a prow takes the brunt, PVP.md "Space and range".
    const R = config.RAM, M = world.match, prow =(S) => (S === A ? c.prowA : c.prowB), ram = c.prowA || c.prowB;
    if (ram) {
      for (const S of [A, B]) {
        if (!prow(S)) continue;
        S.ramHits = Math.min(R.SCUFF_MAX, (S.ramHits || 0) + 1); // (the prow shows a new dent: weaponsArt.js drawRam)
        if (M && M.on && S.team) { M.count(S.team.id, 'rams'); if (!prow(S === A ? B : A)) M.count(S.team.id, 'ramDmg', Math.min(R.MAX_POWER, base * R.MUL) * 3); }
      }
      world.sfxQ.push(['clang', true], ['ramHit']); // a heavy iron boom on top of the clang, a ring and sparks, the word, the shake
      const cols = ['#ffe9a8', '#ffffff', '#ff9a3c'];
      for (let i = 0; i < R.SPARKS; i++) D.puff(c.x, c.y, cols[i % 3], 5);
      world.rings.push({ x: c.x, y: c.y, t: 0.55, max: 0.55, color: '#ffd23f', size: 300 });
      pop(world, c.x, c.y - 210, 'ram', '#ff4a2a', 2.1); // (above the usual CRUNCH! of the blow)
      for (const sh of new Set([A.ctx.ship, B.ctx.ship, world.ship])) if (sh) sh.shake = Math.max(sh.shake || 0, R.SHAKE);
    }
    for (const [S, sign] of [[A, 1], [B, -1]]) {
      const sx = toShipX(S, c.x), sy = toShipY(S, c.y);
      S.sim.impact(sx, sy, ram ? (prow(S) ? base * R.SELF : Math.min(R.MAX_POWER, base * R.MUL)) : Math.min(C.MAX_POWER, base), 1, 'ram');
      kickForce(S.ctx, { x: sx, y: sy }, sign * c.nx * S.pose.f, sign * c.ny, C.KICK * Math.min(3, c.closing / 150)); // (her bow's x: the world's times her facing)
    }
    for (const S of [A, B]) S.sim.crash(toShipX(S, c.x), toShipY(S, c.y), c.closing, 'ram', ram ? (prow(S) ? R.BREAK_SELF : R.BREAK_OTHER) : 1); // (a hard ram can break off the part at the contact point, S.5i; shipSim.js crash. A ram prow keeps the rammer's own parts on and breaks the other ship's more)
    if (ram) { // the red-ink stamp (a "parts broke off" banner from the crash above rides along behind it)
      const broke = world.ev.warn > 0 && /BROKE OFF/.test(world.ev.warnText || '') ? ' ' + world.ev.warnText : '';
      world.ev.warn = Math.max(world.ev.warn, 2.2);
      world.ev.warnText = 'RAMMED!' + broke;
    } else { world.ev.warn = 1.5; world.ev.warnText = 'THE SHIPS COLLIDE!'; }
  }

  // The world's once-a-step call, after the ships have moved.
  function step(dt) {
    for (const k of cool.values()) { k.clang = Math.max(0, k.clang - dt); k.hurt = Math.max(0, k.hurt - dt); }
    const C = K();
    if (!C.ENABLED || world.phase !== 'flying' || world.ships.length < 2) return;
    const ships = world.ships.filter(solid);
    if (ships.length < 2) return;
    const done = new Set(); // (pairs whose effects have been made this step)
    for (let pass = 0; pass < C.PASSES; pass++) {
      let any = false;
      for (let i = 0; i < ships.length; i++) {
        for (let j = i + 1; j < ships.length; j++) {
          const A = ships[i], B = ships[j];
          if (!boxesTouch(hullBox(A, A.pose.f), hullBox(B, B.pose.f))) continue;
          const c = pair(A, B, hullShapes(A), hullShapes(B));
          if (!c) continue;
          any = true;
          stats.contacts++;
          if (!done.has(A.id + B.id)) { done.add(A.id + B.id); effects(A, B, c); }
        }
      }
      if (!any) break;
    }
  }

  return { step, stats };
}
