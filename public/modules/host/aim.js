// What the guns can shoot at, and where to point to hit it (leading moving targets).
// Shared by the game (aim assist) and the test bots.
import { enemyAt } from './enemy.js';
import { keepClear } from './course.js';

export const SHELL_SPEED = 950;
export const SHELL_LIFE = 1.6;
const RANGE = SHELL_SPEED * SHELL_LIFE;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Everything currently shootable, with a way to predict where it will be in t seconds.
export function targets(state) {
  const list = [];
  const e = state.enemy;
  if (e.dead <= 0) {
    list.push({ kind: 'fighter', obj: e, r: 46, at: (t) => {
      const p = enemyAt(e, t);
      return { x: p.x, y: keepClear(state, p.x, p.y + (e.cy || 0), 70, t) };
    } });
  }
  for (const c of state.cargo || []) list.push({ kind: 'cargo', obj: c, r: 75, at: (t) => ({ x: c.x + c.vx * t, y: c.y }) });
  for (const m of state.mines || []) list.push({ kind: 'mine', obj: m, r: 40, at: (t) => ({ x: m.x + m.vx * t, y: m.y }) });
  for (const b of state.bats || []) if (b.delay <= 0) list.push({ kind: 'bat', obj: b, r: 26, at: (t) => ({ x: b.x + b.vx * t, y: b.y + b.vy * t }) });
  for (const p of state.strafers || []) list.push({ kind: 'strafer', obj: p, r: 40, at: (t) => ({ x: p.x + p.vx * t, y: p.y }) });
  for (const k of state.rockets || []) list.push({ kind: 'rocket', obj: k, r: 24, at: (t) => ({ x: k.x + k.vx * t, y: k.y + k.vy * t }) });
  for (const p of state.bombers || []) list.push({ kind: 'bomber', obj: p, r: 80, at: (t) => ({ x: p.x + p.vx * t, y: p.y }) });
  for (const b of state.enemyBombs || []) list.push({ kind: 'bomb', obj: b, r: 22, at: (t) => ({ x: b.x + b.vx * t, y: b.y + b.vy * t + 210 * t * t }) });
  if (state.boss) {
    const z = state.boss;
    for (const g of z.guns) if (!g.dead) list.push({ kind: 'bossgun', obj: g, r: 30, at: () => ({ x: z.x + g.dx, y: z.y + 168 }) });
    list.push({ kind: 'boss', obj: z, r: 200, at: () => ({ x: z.x, y: z.y + 20 }) });
  }
  for (const g of (state.course && state.course.turrets) || []) {
    if (!g.dead && g.x != null) list.push({ kind: 'turret', obj: g, r: 40, at: (t) => ({ x: g.x + g.vx * t, y: g.y }) });
  }
  return list;
}

// Angle a gun must point to hit this target, or null if it's out of the gun's arc or range.
export function solution(state, gun, target) {
  const gx = gun.bx;
  const gy = gun.by - state.ship.alt;
  let p = target.at(0);
  for (let i = 0; i < 3; i++) p = target.at(Math.hypot(p.x - gx, p.y - gy) / SHELL_SPEED);
  if (Math.hypot(p.x - gx, p.y - gy) > RANGE) return null;
  const angle = Math.atan2(p.y - gy, p.x - gx);
  return Math.abs(angleDiff(angle, gun.home)) <= gun.arc ? angle : null;
}

// The most useful target this gun can hit right now (mines, turrets, cargo, then fighter).
export function bestTarget(state, gun) {
  const order = { bomb: 0, rocket: 1, mine: 2, bat: 3, strafer: 4, turret: 5, bomber: 6, bossgun: 7, cargo: 8, boss: 9, fighter: 10 };
  let best = null;
  for (const t of targets(state)) {
    const angle = solution(state, gun, t);
    if (angle === null) continue;
    if (!best || order[t.kind] < order[best.target.kind]) best = { target: t, angle };
  }
  return best;
}

// Aim assist: if the stick points close to a target, bend the aim toward it.
export function assistAim(state, gun, wanted, maxAngle, strength) {
  let best = null;
  for (const t of targets(state)) {
    const angle = solution(state, gun, t);
    if (angle === null) continue;
    const off = Math.abs(angleDiff(angle, wanted));
    if (off < maxAngle && (!best || off < best.off)) best = { angle, off };
  }
  return best ? wanted + angleDiff(best.angle, wanted) * strength : wanted;
}
