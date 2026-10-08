// What the guns can shoot at, and where to point to hit it (leading moving targets).
// Shared by the game (aim assist) and the test bots.

import { config } from '../../config.js';

import { portPos } from './gunshipBlueprint.js'; // (pure geometry: no import cycle)
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, aimToShip } from './pose.js';

export const SHELL_SPEED = config.GUNS.SHELL_SPEED;
export const SHELL_LIFE = config.GUNS.SHELL_LIFE;
const RANGE = SHELL_SPEED * SHELL_LIFE;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Damage one crew shell does to something: normal, x PRIME.DAMAGE_MUL if the shell was primed (prime.js),
// and +SPOT.BONUS if a crewmate has spotted the target from the radar (spotter.js sets obj.spotT).
export const isSpotted = (obj) => !!obj && obj.spotT > 0;
export const shellDmg = (shell, obj) => config.GUNS.DAMAGE * ((shell && shell.mul) || 1) * (isSpotted(obj) ? 1 + config.SPOT.BONUS : 1);

// Everything currently shootable, with a way to predict where it will be in t seconds.
// at(t) is a WORLD position (at(0) is where it is), but looked at from the ship: a shell leaves the barrel at SHELL_SPEED relative to her, so a target that
// moves at v in the world is led by (v - her speed) x t. (Things that keep station on her carry her speed, so they come out still.)
export function targets(state) {
  const list = [];
  const ship = mainShip(state);
  const vs = ship.pose.vx;
  const e = state.enemy;
  if (e.dead <= 0 && e !== state.stuntPlane) {
    list.push({ kind: 'fighter', obj: e, r: 46, at: (t) => ({ x: e.x + (e.vx - vs) * t, y: e.y + e.vy * t }) });
  }
  for (const p of state.paras || []) list.push({ kind: 'para', obj: p, r: 42, at: (t) => ({ x: p.x + (p.vx - vs) * t, y: p.y + p.vy * t }) });
  // The enemy gunship: her gun ports (to bring her guns down) and her gasbag/hull.
  const gs = state.gunship;
  if (gs && gs.ports && gs.phase !== 'sinking' && gs.phase !== 'leaving') {
    gs.ports.forEach((pt, k) => {
      if (!pt.dead) list.push({ kind: 'gport', obj: gs, r: 50, at: () => { const pp = portPos(gs, k); return { x: toWorldX(ship, pp.x + gs.dx), y: toWorldY(ship, pp.y + gs.dy) }; } });
    });
    list.push({ kind: 'gunship', obj: gs, r: 200, at: () => ({ x: toWorldX(ship, gs.bp.cx + gs.dx), y: toWorldY(ship, (gs.bp.hullTop + gs.bp.hullBot) / 2 - 40 + gs.dy) }) });
  }
  // Versus (pvp/bridge.js): the rival airship's middle. rival.mid is in our ship coordinates (y downward, incl. our altitude); vx / vy = how her middle moves in our view.
  const rv = state.rival;
  if (rv && !rv.down) list.push({ kind: 'rival', obj: rv, r: 220, at: (t) => ({ x: toWorldX(ship, rv.mid.x + rv.vx * t), y: toWorldY(ship, rv.mid.y) + rv.vy * t }) });
  for (const m of state.mines || []) list.push({ kind: 'mine', obj: m, r: 40, at: (t) => ({ x: m.x + (m.vx - vs) * t, y: m.y }) });
  for (const b of state.bats || []) if (b.delay <= 0 && !b.latched) list.push({ kind: 'bat', obj: b, r: 26, at: (t) => ({ x: b.x + (b.vx - vs) * t, y: b.y + b.vy * t }) });
  for (const p of state.strafers || []) if (p !== state.stuntPlane) list.push({ kind: 'strafer', obj: p, r: 40, at: (t) => ({ x: p.x + (p.vx - vs) * t, y: p.y + p.vy * t }) });
  const SP = state.specials;
  if (SP) {
    for (const s of SP.saws) list.push({ kind: 'saw', obj: s, r: 52, at: (t) => ({ x: s.x + (s.vx - vs) * t, y: s.y + s.vy * t }) });
    for (const b of SP.imps) if (b.delay <= 0) list.push({ kind: 'imp', obj: b, r: 22, at: (t) => ({ x: b.x + (b.vx - vs) * t, y: b.y + b.vy * t }) });
    for (const z of SP.snipers) list.push({ kind: 'sniper', obj: z, r: 60, at: () => ({ x: z.x, y: z.y }) });
    for (const g of SP.tugs) {
      list.push({ kind: 'tug', obj: g, r: 50, at: () => ({ x: g.x, y: g.y }) });
      if (g.mode === 'pull' && g.hook) list.push({ kind: 'cable', obj: g, r: 20, at: () => ({ x: (g.x + toWorldX(ship, g.hook.x)) / 2, y: (g.y + toWorldY(ship, g.hook.y)) / 2 }) });
    }
  }
  for (const k of state.rockets || []) list.push({ kind: 'rocket', obj: k, r: 24, at: (t) => ({ x: k.x + (k.vx - vs) * t, y: k.y + k.vy * t }) });
  for (const p of state.bombers || []) list.push({ kind: 'bomber', obj: p, r: 80, at: (t) => ({ x: p.x + (p.vx - vs) * t, y: p.y + (p.vy || 0) * t }) });
  for (const b of state.enemyBombs || []) list.push({ kind: 'bomb', obj: b, r: 22, at: (t) => ({ x: b.x + (b.vx - vs) * t, y: b.y + b.vy * t + 210 * t * t }) });
  if (state.boss) {
    const z = state.boss;
    for (const g of z.guns) if (!g.dead) list.push({ kind: 'bossgun', obj: g, r: 30, at: () => ({ x: z.x + g.dx, y: z.y + 168 }) });
    list.push({ kind: 'boss', obj: z, r: 200, at: () => ({ x: z.x, y: z.y + 20 }) });
  }
  for (const g of (state.course && state.course.turrets) || []) {
    if (!g.dead && g.x != null) list.push({ kind: 'turret', obj: g, r: 40, at: (t) => ({ x: g.x + (g.vx - vs) * t, y: g.y }) });
  }
  return list;
}

// Angle a gun must point to hit this target (in SHIP space, like gun.aim), or null if it's out of the gun's arc or range.
export function solution(state, gun, target) {
  const ship = mainShip(state);
  const gx = toWorldX(ship, gun.bx);
  const gy = toWorldY(ship, gun.by);
  let p = target.at(0);
  for (let i = 0; i < 3; i++) p = target.at(Math.hypot(p.x - gx, p.y - gy) / SHELL_SPEED);
  if (Math.hypot(p.x - gx, p.y - gy) > RANGE * (gun.reach || 1)) return null; // (a gun on a high crow's nest reaches further: config.NEST)
  const angle = aimToShip(ship, Math.atan2(p.y - gy, p.x - gx)); // (the world direction as the ship sees it: a ship facing left mirrors it; gun.home / gun.arc are in ship space)
  return Math.abs(angleDiff(angle, gun.home)) <= gun.arc ? angle : null;
}

// The most useful target this gun can hit right now (mines, turrets, cargo, then fighter).
export function bestTarget(state, gun) {
  const order = { cable: -1, bomb: 0, rocket: 1, saw: 1.5, mine: 2, bat: 3, imp: 3, strafer: 4, tug: 4.5, turret: 5, gport: 5.5, bomber: 6, sniper: 6.5, bossgun: 7, para: 4.2, boss: 9, gunship: 9.5, fighter: 10, rival: 9.2 };
  let best = null;
  for (const t of targets(state)) {
    const angle = solution(state, gun, t);
    if (angle === null) continue;
    const rank = (u) => (isSpotted(u.obj) ? order[u.kind] - 20 : order[u.kind]); // (spotted targets come first)
    if (!best || rank(t) < rank(best.target)) best = { target: t, angle };
  }
  return best;
}

// Aim assist: if the stick points close to a target, bend the aim toward it.
// A plane caught in a searchlight beam is dazzled: most of its shots go wide (config.SEARCHLIGHT.DAZZLE_MISS).
export const dazzled = (o) => !!o && o.lit > 0 && Math.random() < (config.SEARCHLIGHT.DAZZLE_MISS || 0);

export function assistAim(state, gun, wanted, maxAngle, strength) {
  let best = null;
  const SL = config.SEARCHLIGHT;
  for (const t of targets(state)) {
    const angle = solution(state, gun, t);
    if (angle === null) continue;
    const spotted = isSpotted(t.obj); // (a spotted target is easier to lock onto: wider reach, counts as closer)
    // Anything caught in a searchlight beam (obj.lit, set by searchlight.js) is easier to hit: wider and stronger snap.
    const lit = !!t.obj && t.obj.lit > 0;
    const raw = Math.abs(angleDiff(angle, wanted));
    const off = spotted ? raw * config.SPOT.ASSIST_PULL : raw;
    const reach = maxAngle * Math.max(spotted ? config.SPOT.ASSIST_ANGLE : 1, lit ? SL.LIT_AIM_ANGLE : 1);
    if (raw < reach && (!best || off < best.off)) best = { angle, off, lit };
  }
  // In the dark the gunners can only lock onto what a searchlight shows them.
  const blind = 1 - Math.min(1, (state.darkNow || 0) * (SL.DARK_ASSIST || 0));
  return best ? wanted + angleDiff(best.angle, wanted) * (best.lit ? Math.max(strength, SL.LIT_AIM_STRENGTH) : strength * blind) : wanted;
}
