// TOWING (B.6, config.CROSS.TOW): a TOWLINE is a tool off a rack (player.carry = 'towline'). ATTACK on an open deck throws its grapple at the nearest other ship in reach (the stick picks a
// side); it flies for a moment and catches on her deck. From then on the line is a spring between the two ships' poses: it pulls both toward each other (the heavier one moves less),
// twists both about their own centres of mass (forces.js 'tether', at the places the line is made fast), and snaps when they are too far apart. A sword cuts it where it is made fast to the
// ship you stand on (ATTACK within CUT_REACH of the end). Uses: drag a disabled ally or an enemy prize home (a captured gunship still in tow when you reach the sky-dock pays PRIZE
// salvage, simulation.js), or drag an enemy down with your weight.
//   const towing = createTowing({ world, puff, phoneFx })      world = the host state (world.tows is the list, world.ships the ships)
//   towing.throwLine(ship, player) -> bool              the ATTACK of a player carrying a towline (true: handled)
//   towing.cutNear(ship, player) -> bool                the ATTACK of a player carrying a sword (true: he cut a line)
//   towing.step(dt)                                     once a world step, after the ships have moved
//   towing.link(a, b, from, to) / towing.cut(tow)       the same thing without a player (the gates, the bots' errands)
//   towing.ends(tow) -> { a: {x, y}, b: {x, y} }        where the line is made fast, in the world (the TV draws it)
//   tow = { id, a (the towing ship), b (the towed one), from: {x, y} on a, to: {x, y} on b (ship coordinates), len, t (the grapple's flight so far), fly (its flight time, 0 = made fast), by (player id) }
import { config } from '../../config.js';
import { toWorldX, toWorldY, toShipX, driveVx, driveGain } from './pose.js';
import { applyForce, pivotOf as massOf } from './forces.js';
import { pop } from './popups.js';

const T = () => config.CROSS.TOW;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let seq = 0;

export function createTowing({ world, puff, phoneFx = () => {} }) {
  const tows = world.tows;
  const live = (sh) => world.ships.includes(sh);
  const mass = (sh) => Math.max(1, massOf(sh.ctx).mass);
  const worldOf = (sh, p) => ({ x: toWorldX(sh, p.x), y: toWorldY(sh, p.y) });
  const ends = (t) => ({ a: worldOf(t.a, t.from), b: worldOf(t.b, t.to) });

  // The nearest point of another ship's decks to a world point (the grapple's target): { ship, x, y (ship coordinates), d (px) }. dir: a unit vector the target must lie roughly toward (null: any way).
  const nearestDeck = (ship, o, dir) => {
    let best = null;
    for (const sh of world.ships) {
      if (sh === ship || sh.state.down > 0 || sh.ctx.wreck) continue;
      sh.layout.platforms.forEach((pl) => {
        const sx = clamp(toShipX(sh, o.x), pl.x0, pl.x1), wx = toWorldX(sh, sx), wy = toWorldY(sh, pl.y);
        const d = Math.hypot(wx - o.x, wy - o.y);
        if (d > T().RANGE || (dir && d > 1 && ((wx - o.x) * dir.x + (wy - o.y) * dir.y) / d < 0.35)) return;
        if (!best || d < best.d) best = { ship: sh, x: sx, y: pl.y, d };
      });
    }
    return best;
  };

  const exists = (a, b) => tows.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a));

  // Make a line fast: the towing ship `a` at `from`, the towed `b` at `to` (ship coordinates); fly: seconds the grapple takes to get there (0 = already made fast).
  const link = (a, b, from, to, fly = 0, by = null) => {
    if (a === b || !live(a) || !live(b) || exists(a, b)) return null;
    const A = worldOf(a, from), B = worldOf(b, to);
    const tow = { id: ++seq, a, b, from: { ...from }, to: { ...to }, len: Math.max(T().LEN, Math.hypot(B.x - A.x, B.y - A.y)), t: 0, fly, by };
    tows.push(tow);
    return tow;
  };

  const cut = (tow, text = 'THE TOWLINE IS CUT!') => {
    const i = tows.indexOf(tow);
    if (i < 0) return;
    tows.splice(i, 1);
    const e = ends(tow);
    puff((e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2, '#d8c79a', 12);
    world.sfxQ.push(['hit']);
    if (text) { world.ev.warn = 2.5; world.ev.warnText = text; }
  };

  const throwLine = (ship, p) => {
    if (p.d == null || p.fly || (p.bot && !p.throwNow)) return false;
    const pl = ship.layout.platforms[p.d];
    if (!pl) return false;
    const from = { x: p.x, y: pl.y - 70 };
    const o = worldOf(ship, from);
    const f = ship.pose.f;
    let dir = null;
    if (Math.hypot(p.jx || 0, p.jy || 0) > 0.3) { const m = Math.hypot(p.jx, p.jy); dir = { x: (p.jx * f) / m, y: p.jy / m }; }
    const hit = nearestDeck(ship, o, dir);
    if (!hit) { phoneFx(p, 'No ship in reach of the grapple - get closer', [40]); p.atkCd = 0.6; return true; }
    const tow = link(ship, hit.ship, from, { x: hit.x, y: hit.y - 10 }, hit.d / T().SPEED + 0.05, p.id);
    if (!tow) { phoneFx(p, 'Already hooked to her', [40]); p.atkCd = 0.6; return true; }
    p.carry = null;
    p.atkCd = 0.6;
    p.swingT = performance.now();
    p.throwNow = false;
    puff(o.x, o.y, '#ffffff', 3);
    pop(world, o.x, o.y - 60, 'HOOKED!', '#ffe9a8', 1);
    phoneFx(p, 'Grapple away! A sword cuts the line', [40, 30, 40]);
    return true;
  };

  const cutNear = (ship, p) => {
    for (const t of tows) {
      const end = t.a === ship ? t.from : t.b === ship && t.fly <= 0 ? t.to : null;
      if (!end) continue;
      const pl = ship.layout.platforms[p.d];
      if (!pl || Math.abs(end.y - pl.y) > 140 || Math.abs(end.x - p.x) > T().CUT_REACH) continue;
      cut(t, 'THE TOWLINE IS CUT!');
      return true;
    }
    return false;
  };

  // A ship's velocity in the world as the movement model has it (px/s, y down), and a shove of (dx, dy) px/s onto it (shipCollide.js does the same).
  const vel = (sh) => ({ x: driveVx(sh), y: sh.pose.vy });
  const shove = (sh, dx, dy) => {
    const per = driveGain(sh);
    if (per) sh.ctx.ship.speed += dx / per;
    sh.pose.vy += dy;
  };

  const step = (dt) => {
    for (let i = tows.length - 1; i >= 0; i--) {
      const t = tows[i], a = t.a, b = t.b;
      if (!live(a) || !live(b) || a.state.down > 0 || (b.state.down > 0 && !b.ai) || a.ctx.wreck) { cut(t, ''); continue; }
      if (t.fly > 0) { // the grapple is still in the air
        t.t += dt;
        if (t.t >= t.fly) { t.fly = 0; const e = ends(t); puff(e.b.x, e.b.y, '#ffe9a8', 5); world.sfxQ.push(['clang', true]); }
        continue;
      }
      const e = ends(t);
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1;
      t.len = Math.max(T().LEN * 0.55, t.len - T().REEL * dt); // she hauls the line in
      t.d = d;
      t.tension = 0;
      if (d > T().SNAP) { cut(t, 'THE TOWLINE SNAPS!'); continue; }
      if (d <= t.len) continue;
      const nx = dx / d, ny = dy / d; // from the towing ship toward the towed one
      const stretch = d - t.len, va = vel(a), vb = vel(b);
      const sep = (vb.x - va.x) * nx + (vb.y - va.y) * ny; // how fast they are moving apart along the line
      const acc = clamp(T().K * stretch + T().DAMP * Math.max(0, sep), 0, T().MAX_ACC);
      t.tension = clamp(stretch / (T().SNAP - t.len), 0, 1);
      const ma = mass(a), mb = mass(b), sa = mb / (ma + mb), sb = ma / (ma + mb); // (the heavier ship moves less)
      shove(a, nx * acc * sa * dt, ny * acc * sa * dt);
      shove(b, -nx * acc * sb * dt, -ny * acc * sb * dt);
      // ...and each is twisted about her own centre of mass where the line is made fast
      const F = config.FORCES.TETHER_ACC * T().TORQUE * (Math.min(stretch, 400) / 100);
      applyForce(a.ctx, { x: t.from.x, y: t.from.y, fx: nx * a.pose.f * F * sa * 2, fy: ny * F * sa * 2, source: 'tether' });
      applyForce(b.ctx, { x: t.to.x, y: t.to.y, fx: -nx * b.pose.f * F * sb * 2, fy: -ny * F * sb * 2, source: 'tether' });
    }
  };

  return { throwLine, cutNear, step, link, cut, ends, tows };
}
