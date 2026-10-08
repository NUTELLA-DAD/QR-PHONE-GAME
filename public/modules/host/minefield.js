// LAID MINES (config.MINEFIELD; PVP.md "Space and range"). Node-safe: no DOM.
//
// A MINE LAYER is a gun-type station (weapons.js 'mines', a gun part with gtype 'mines') in the belly of a ship: a crew member there drops a floating iron mine out of the hull with FIRE. The mines are
// WORLD objects (world.laid: x, y in map coordinates like a shell), so they work the same in co-op (mines for the planes and the gunship that chase you) and in Versus (a field across the chaser's
// path, a choke point, a tunnel mouth). A mine:
//   * drifts slowly (a little way along the sky the way the layer was going, sinking a little), blinking its lamp (fast once it is armed);
//   * ARMS ARM seconds after it is dropped - it floats clear of the layer first;
//   * goes off against ANY ship whose hull touches it (the layer's own too), with POWER of a blow, a kick away from it, and a bang that also hurts a ship within BLAST of it;
//   * goes off when a plane, a bat or an enemy crewman in the air comes near (a plane takes PLANE_MUL shells' worth);
//   * can be SHOT (any shell that meets it): it goes off where it is - hurting whoever is within BLAST;
//   * dies in rock (a dud), and rusts away after LIFE seconds.
//   lay(ship, state, gun, player, puff) -> true           drop one (the caller has taken the shot from the gun)
//   stepMines(world, dt, puff)                            once per world step
import { config } from '../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { inRock } from './course.js';
import { kickForce } from './forces.js';

const M = () => config.MINEFIELD;
let seq = 0;

export function lay(ship, state, gun, player, puff) {
  const world = ship.world, K = M();
  const list = world.laid;
  const x = toWorldX(ship, gun.bx), y = toWorldY(ship, Math.max(gun.by, ship.layout.bounds.y1) + 50);
  const way = Math.sign(ship.pose.vx) || ship.pose.f; // (it drifts on the way the layer was going)
  list.push({ id: ++seq, x, y, vx: ship.pose.vx * 0.8, vy: ship.pose.vy + 60, age: 0, drift: way * K.DRIFT, from: ship.id, team: ship.team ? ship.team.id : (player.team || null), owner: player.id, bob: Math.random() * 6.28 });
  while (list.length > K.MAX) list.shift();
  puff(x, y, '#8a8f97', 5);
  if (world.match && world.match.on && player.team) world.match.count(player.team, 'minesLaid');
  return true;
}

// Does a round thing of radius r at world (x, y) touch this ship's hull? (hitsShip wants ship coordinates: the centre and eight points round it)
const touches = (ship, x, y, r) => {
  const sx = toShipX(ship, x), sy = toShipY(ship, y);
  if (ship.sim.hitsShip(sx, sy)) return true;
  for (let k = 0; k < 8; k++) if (ship.sim.hitsShip(sx + Math.cos(k * 0.7854) * r, sy + Math.sin(k * 0.7854) * r)) return true;
  return false;
};
const solid = (sh) => !sh.ctx.wreck && !(sh.state.down > 0);

export function stepMines(world, dt, puff) {
  const K = M(), list = world.laid;
  if (!list.length) return;
  const planes = () => {
    const out = [];
    const e = world.enemy;
    if (e && e.dead <= 0 && e !== world.stuntPlane) out.push(e);
    for (const p of world.strafers || []) if (p.hp > 0 && p !== world.stuntPlane) out.push(p);
    for (const p of world.bombers || []) if (p.hp > 0) out.push(p);
    for (const b of world.bats || []) if (!b.latched && b.hp > 0 && !(b.delay > 0)) out.push(b);
    return out;
  };
  let flying = null;
  const go = (m, how, victim, shooter) => { // the mine goes off
    m.dead = true;
    puff(m.x, m.y, '#ff5a1f', 24);
    puff(m.x, m.y, '#ffd23f', 10);
    world.rings.push({ x: m.x, y: m.y, t: 0.4, max: 0.4, color: '#ffb347', size: K.BLAST });
    world.sfxQ.push(['impact']);
    world.sfxQ.push(['bigshot']);
    for (const sh of world.ships) {
      if (!solid(sh)) continue;
      const direct = sh === victim;
      if (!direct && !touches(sh, m.x, m.y, K.BLAST)) continue;
      const sx = toShipX(sh, m.x), sy = toShipY(sh, m.y);
      sh.sim.impact(sx, sy, K.POWER * (direct ? 1 : K.BLAST_MUL));
      const a = sh.layout.aimPoint, dx = toWorldX(sh, a.x) - m.x, dy = toWorldY(sh, a.y) - m.y, n = Math.hypot(dx, dy) || 1;
      kickForce(sh.ctx, { x: sx, y: sy }, (dx / n) * sh.pose.f, dy / n, K.KICK * (direct ? 1 : 0.5));
      if (direct) { world.ev.warn = 2; world.ev.warnText = (sh.team ? sh.team.id.toUpperCase() + ' ' : '') + 'HIT A MINE!'; }
      if (world.match && world.match.on && m.team && sh.team && sh.team.id !== m.team) world.match.count(m.team, 'mineHits');
    }
    if (how === 'shot' && shooter && world.match && world.match.on && shooter.team) world.match.count(shooter.team, 'mineShot');
    for (const p of planes()) if (Math.hypot(p.x - m.x, p.y - m.y) < K.BLAST) world.shells.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.08, mul: K.PLANE_MUL, owner: m.owner, from: m.from, frag: true, kind: 'mineFrag' });
  };
  for (const m of list) {
    if (m.dead) continue;
    m.age += dt;
    if (m.age > K.LIFE) { m.dead = true; continue; }
    const k = 1 - Math.exp(-K.DRAG * dt);
    m.vx += (m.drift - m.vx) * k;
    m.vy += (K.SINK - m.vy) * k;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (inRock(world, m.x, m.y)) { m.dead = true; puff(m.x, m.y, '#8b6b4a', 6); continue; }
    // shot: any shell that crosses it (the segment it flew this step)
    for (const sh of world.shells) {
      if (sh.life <= 0 || sh.kind === 'flakFrag' || sh.kind === 'mineFrag') continue;
      const ax = sh.x - sh.vx * dt, ay = sh.y - sh.vy * dt, bx = sh.x - ax, by = sh.y - ay, l2 = bx * bx + by * by;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((m.x - ax) * bx + (m.y - ay) * by) / l2)) : 0;
      if (Math.hypot(ax + bx * t - m.x, ay + by * t - m.y) < K.RADIUS + 10) { sh.life = 0; go(m, 'shot', null, sh.owner ? world.players[sh.owner] : null); break; }
    }
    if (m.dead || m.age < K.ARM) continue;
    // armed: a ship's hull, or a plane or a flier
    for (const sh of world.ships) {
      if (!solid(sh)) continue;
      if (touches(sh, m.x, m.y, K.TRIGGER)) { go(m, 'touch', sh, null); break; }
    }
    if (m.dead) continue;
    if (planes().some((p) => Math.hypot(p.x - m.x, p.y - m.y) < K.PLANE)) { go(m, 'plane', null, null); continue; }
    flying = flying || Object.values(world.players).filter((q) => q.fly && q.team);
    if (flying.some((q) => q.team !== m.team && Math.hypot(q.x - m.x, q.y - m.y) < K.PLANE * 0.6)) go(m, 'flier', null, null);
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
}
