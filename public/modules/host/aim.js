// What the guns can shoot at, and where to point to hit it (leading moving targets).
// Shared by the game (aim assist) and the test bots.

import { config } from '../../config.js';

import { portPos } from './gunshipBlueprint.js'; // (pure geometry: no import cycle)
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, aimToShip, aimToWorld } from './pose.js';
import { solidAt } from './maps.js';
import { typedSolution } from './gunTypes.js';

export const SHELL_SPEED = config.GUNS.SHELL_SPEED;
export const SHELL_LIFE = config.GUNS.SHELL_LIFE;
const RANGE = SHELL_SPEED * SHELL_LIFE;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Damage one crew shell does to something: normal, x PRIME.DAMAGE_MUL if the shell was primed (prime.js),
// and +SPOT.BONUS if a crewmate has spotted the target from the radar (spotter.js sets obj.spotT).
export const isSpotted = (obj) => !!obj && obj.spotT > 0;
export const shellDmg = (shell, obj) => config.GUNS.DAMAGE * ((shell && shell.mul) || 1) * (isSpotted(obj) ? 1 + config.SPOT.BONUS : 1);

// Versus (pvp/match.js, B.4): the other team's ship, in WORLD coordinates (state.rival: her aim point, guns, gasbags, helm and boiler, and how her middle moves). The parts of her worth
// a shell, in the order the bot gunners want them (bestTarget's `order`): her manned guns that point at us, her gasbags, her boiler and helm, then her hull. A rock island between the
// two ships hides her (a shell dies in rock), so there is nothing to aim at.
function rivalTargets(list, state, ship, rv, vs) {
  const B = config.PVP.BOT;
  const mx = toWorldX(ship, ship.layout.aimPoint.x), my = toWorldY(ship, ship.layout.aimPoint.y);
  const map = state.course && state.course.map;
  if (!rv.los || rv.los.stamp !== rv.stamp) { // is there open sky between the two middles? (once a step, for everyone)
    let shut = 0;
    if (map) for (let k = 1; k <= 12; k++) if (solidAt(map, mx + ((rv.mid.x - mx) * k) / 13, my + ((rv.mid.y - my) * k) / 13)) shut++;
    rv.los = { stamp: rv.stamp, open: shut < 2 };
  }
  if (!rv.los.open) return;
  const at = (px, py) => (t) => ({ x: px + (rv.vx - vs) * t, y: py + rv.vy * t });
  for (const g of rv.guns) {
    if (!g.manned || g.ammo <= 0) continue;
    const a = aimToWorld(rv.ship, g.aim + (rv.ship.ctx.ship.pitch || 0));
    if (Math.abs(angleDiff(a, Math.atan2(my - g.y, mx - g.x))) > B.BEARING) continue; // (it is not pointing at us)
    list.push({ kind: 'rivalGun', obj: rv, r: 60, at: at(g.x, g.y) });
  }
  for (const b of rv.bags) if (b.gas > 3) list.push({ kind: 'rivalBag', obj: rv, r: 90, at: at(b.x, b.y) });
  if (rv.helm) list.push({ kind: 'rivalCore', obj: rv, r: 70, at: at(rv.helm.x, rv.helm.y) });
  if (rv.boiler) list.push({ kind: 'rivalCore', obj: rv, r: 70, at: at(rv.boiler.x, rv.boiler.y) });
  list.push({ kind: 'rival', obj: rv, r: 220, at: at(rv.mid.x, rv.mid.y) });
}

// Everything currently shootable, with a way to predict where it will be in t seconds.
// at(t) is a WORLD position (at(0) is where it is), but looked at from the ship: a shell leaves the barrel at SHELL_SPEED relative to her, so a target that
// moves at v in the world is led by (v - her speed) x t. (Things that keep station on her carry her speed, so they come out still.)
export function targets(state) {
  const list = [];
  const ship = mainShip(state);
  const vs = ship.pose.vx;
  if (ship.ai) { // the enemy gunship's guns see only our ship (B.5): the sky's enemies are her friends
    const rv = state.rival;
    if (rv && !rv.down) rivalTargets(list, state, ship, rv, vs);
    return list.filter((t) => t.kind === 'rival'); // (her cannonballs go for our hull, as ever: not for our guns, our gasbag or our helm - that is what the Versus gunners pick)
  }
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
  const rv = state.rival;
  if (rv && !rv.down) rivalTargets(list, state, ship, rv, vs);
  for (const m of state.mines || []) list.push({ kind: 'mine', obj: m, r: 40, at: (t) => ({ x: m.x + (m.vx - vs) * t, y: m.y }) });
  // Laid mines (minefield.js) that lie in the way: another crew's, or any in co-op, within MINE_SHOOT px and ahead of her (or very close). Shooting them blows them up where they float.
  if (state.laid && state.laid.length) {
    const ax = toWorldX(ship, ship.layout.aimPoint.x), ay = toWorldY(ship, ship.layout.aimPoint.y), S = config.MINEFIELD;
    for (const m of state.laid) {
      if (m.dead || (ship.team && m.team === ship.team.id)) continue;
      const d = Math.hypot(m.x - ax, m.y - ay);
      if (d > S.SHOOT_RANGE || (d > S.SHOOT_NEAR && (m.x - ax) * (ship.pose.vx || 0) <= 0)) continue; // (a mine astern of her is no danger)
      list.push({ kind: 'laid', obj: m, r: 44, at: (t) => ({ x: m.x + (m.vx - vs) * t, y: m.y + m.vy * t }) });
    }
  }
  // An enemy crewman in the air (a boarder's leap, a crew cannon's shot): flak shells burst on him (bestTarget lets only a flak gun aim at him).
  for (const q of Object.values(state.players)) if (q.fly && q.team && ship.team && q.team !== ship.team.id) list.push({ kind: 'flier', obj: q, r: 60, at: (t) => ({ x: q.x + ((q.fvx || 0) - vs) * t, y: q.y + (q.fvy || 0) * t }) });
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
  if (gun.type) return typedSolution(state, ship, gun, target, gx, gy); // (a long gun, a mortar ...: gunTypes.js)
  let p = target.at(0);
  for (let i = 0; i < 3; i++) p = target.at(Math.hypot(p.x - gx, p.y - gy) / SHELL_SPEED);
  if (Math.hypot(p.x - gx, p.y - gy) > RANGE * (gun.reach || 1)) return null; // (a gun on a high crow's nest reaches further: config.NEST)
  const angle = aimToShip(ship, Math.atan2(p.y - gy, p.x - gx)); // (the world direction as the ship sees it: a ship facing left mirrors it; gun.home / gun.arc are in ship space)
  return Math.abs(angleDiff(angle, gun.home)) <= gun.arc ? angle : null;
}

// The most useful target this gun can hit right now (mines, turrets, cargo, then fighter).
export function bestTarget(state, gun) {
  const order = { flier: -2, cable: -1, bomb: 0, rocket: 1, saw: 1.5, laid: 1.8, mine: 2, bat: 3, imp: 3, strafer: 4, tug: 4.5, turret: 5, gport: 5.5, bomber: 6, sniper: 6.5, bossgun: 7, para: 4.2, boss: 9, gunship: 9.5, fighter: 10, rivalGun: 8, rivalBag: 8.4, rivalCore: 8.8, rival: 9.2 };
  let best = null;
  for (const t of targets(state)) {
    if (t.kind === 'flier' && gun.type !== 'flak') continue; // (only flak shells burst on a man in the air)
    if (t.kind === 'laid' && (gun.type === 'mortar' || gun.type === 'harpoon')) continue; // (a lob is no way to hit a mine, and a harpoon is for ships)
    if (gun.type === 'harpoon' && !t.kind.startsWith('rival') && t.kind !== 'gunship') continue;
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
    if ((t.kind === 'flier' && gun.type !== 'flak') || (t.kind === 'laid' && gun.type === 'mortar') || (gun.type === 'harpoon' && !t.kind.startsWith('rival') && t.kind !== 'gunship')) continue;
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
