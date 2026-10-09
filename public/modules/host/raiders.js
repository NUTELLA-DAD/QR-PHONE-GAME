// Raiders (boarders). Four types:
//   Grunt  - chases the nearest crew member.
//   Brute  - slow and tough, can't be shoved, knocks you flying.
//   Sapper - plants a bomb somewhere on board, then fights. Defuse it by holding Action.
//   Cutter - goes for the guns, pipes and engines and hacks them to bits.
// All of them wind up (a "!" over their head) before striking, so crew can step back or
// interrupt them with a hit.
import { crewMul, crewHeads } from './crewscale.js';
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';
import { hurt, knockOut } from './health.js';

const R = config.RAIDERS;
// Worked out per ship layout (rebuilt when a new ship build is applied to it): the platform indices of the decks inside the hull.
const tables = layoutTables((layout) => ({ INSIDE: [layout.deckIndex('main'), layout.deckIndex('lower')].filter((d, i, a) => d >= 0 && a.indexOf(d) === i) }));

export function createRaiders({ state, modules, puff, impact }) {
  const ship = mainShip(state); // (B1: the ship the raiders board; B2 makes this one per ship)
  const layout = ship.layout;
  const { moveWalker, steerTo, fall } = ship.nav; // (raiders walk on the ship they boarded)
  const P = layout.platforms;
  const shipPuff = (x, y, color, count) => puff(toWorldX(ship, x), toWorldY(ship, y), color, count); // (raiders are on the ship: a puff at a point in ship coordinates)
  state.bombs = [];
  let nextId = 0;

  const pickType = () => {
    let r = Math.random();
    for (const [type, chance] of Object.entries(R.MIX)) if ((r -= chance) <= 0) return type;
    return 'grunt';
  };

  // One raider arrives at (x, y) and falls to the deck below (a gunship paratrooper landing, or one crossing her rope).
  const dropOne = (x, y, type = pickType()) => {
    const t = R[type];
    const b = { id: 'r' + nextId++, type, name: t.name, species: t.species, color: t.color, scale: t.scale, x, y, fall: true, hp: t.hp, hit: 0, cd: 0, windup: 0, face: 1 };
    state.boarders.push(b);
    return b;
  };

  // A squad arrives at (x, y) (boarding lines from the boss).
  const dropSquad = (x, y) => {
    const crew = crewHeads(state);
    const count = Math.max(1, Math.min(6, Math.round((1 + Math.floor(crew / 4)) * crewMul(state, 'raiders'))));
    for (let i = 0; i < count; i++) {
      const type = i === 0 ? 'grunt' : pickType();
      const t = R[type];
      state.boarders.push({
        id: 'r' + nextId++,
        type,
        name: t.name,
        species: t.species,
        color: t.color,
        scale: t.scale,
        x: x + (i - (count - 1) / 2) * 45,
        y: y - i * 40,
        fall: true,
        hp: t.hp,
        hit: 0,
        cd: 0,
        windup: 0,
        face: 1,
      });
    }
  };

  const strike = (b, target) => {
    const t = R[b.type];
    b.cd = 1.5;
    // (just back on their feet? a moment's grace, so one raider can't keep a whole crew down)
    if (!target || target.ko > 0 || target.koGrace > 0 || target.d !== b.d || target.conn != null || (target.jz || 0) > config.MOVE.JUMP_DODGE || target.fly || Math.abs(target.x - b.x) > t.reach + 12) {
      shipPuff(b.x + b.face * 40, b.y - 50, '#ddd', 4); // swung at thin air
      return;
    }
    const res = hurt(target, config.HEALTH.BLOW[b.type] ?? config.HEALTH.BLOW.default, { cause: 'raider', old: true }); // (crew health: a blow takes hearts; the last one knocks him out)
    if (!res) { // (still in his i-frames: the blow glances off)
      shipPuff(b.x + b.face * 40, b.y - 50, '#ddd', 4);
      return;
    }
    if (res === 'ko') knockOut(target, R.KO_TIME);
    if (t.knockback) {
      const p = P[target.d];
      target.x = Math.max(p.x0, Math.min(p.x1, target.x + b.face * t.knockback));
    }
    shipPuff(target.x, target.y - 40, '#fff', 10);
  };

  // Cutters: the nearest module that still works.
  const cutterTarget = (b) => {
    let best = null;
    for (const m of modules.list) {
      if (m.broken) continue;
      const cost = Math.abs(m.x - b.x) + Math.abs(P[m.d].y - b.y) * 3;
      if (!best || cost < best.cost) best = { m, cost };
    }
    return best && best.m;
  };

  const update = (dt) => {
    const live = Object.values(state.players).filter((q) => !q.fall && !q.fly && !(q.ko > 0) && q.d != null);
    for (const b of state.boarders) {
      if (b.fall) {
        if (!b.tipped) fall(b, dt, 300); // (a raider tipped out of a cargo drop hatch falls by hatch.js's rules)
        continue;
      }
      const t = R[b.type];
      b.hit = Math.max(0, b.hit - dt);
      b.cd = Math.max(0, b.cd - dt);
      b.moving = false;
      b.cutting = null;

      // Nearest crew member on the same deck within reach: wind up, then strike.
      const near = live
        .filter((q) => q.conn == null && b.conn == null && q.d === b.d && Math.abs(q.x - b.x) < t.reach)
        .sort((q1, q2) => Math.abs(q1.x - b.x) - Math.abs(q2.x - b.x))[0];
      if (b.windup > 0) {
        b.windup -= dt;
        if (b.windup <= 0) {
          b.windup = 0;
          strike(b, near || b.victim);
        }
        continue;
      }
      if (near && b.cd <= 0) {
        b.victim = near;
        b.face = near.x < b.x ? -1 : 1;
        b.windup = t.windup;
        continue;
      }

      // Otherwise, move toward this raider's goal.
      let goalD = null;
      let goalX = 0;
      if (b.type === 'sapper' && !b.planted) {
        if (!b.plantAt) {
          const INSIDE = tables(layout).INSIDE;
          const d = INSIDE[(Math.random() * INSIDE.length) | 0];
          b.plantAt = { d, x: P[d].x0 + 120 + Math.random() * (P[d].x1 - P[d].x0 - 240) };
        }
        goalD = b.plantAt.d;
        goalX = b.plantAt.x;
        if (b.conn == null && b.d === goalD && Math.abs(b.x - goalX) < 20) {
          b.planted = true;
          state.bombs.push({ x: b.x, d: b.d, t: R.BOMB_FUSE, prog: 0 });
          shipPuff(b.x, b.y - 20, '#333', 8);
          state.ev.warn = 3;
          state.ev.warnText = 'A SAPPER PLANTED A BOMB!';
          continue;
        }
      } else if (b.type === 'cutter') {
        const m = cutterTarget(b);
        if (m) {
          goalD = m.d;
          goalX = m.x;
          if (b.conn == null && b.d === m.d && Math.abs(b.x - m.x) < 30) {
            b.cutting = m;
            b.face = m.pos.x < b.x ? -1 : 1;
            modules.damage(m, R.CUT_DAMAGE * dt, shipPuff);
            if (Math.random() < dt * 8) shipPuff(m.pos.x, m.pos.y, '#ffd23f', 2); // sparks
            continue;
          }
        }
      }
      if (goalD === null) {
        // Chase the nearest crew member.
        const target = live.reduce((best, q) => (!best || Math.abs(q.x - b.x) + Math.abs(q.y - b.y) * 2 < Math.abs(best.x - b.x) + Math.abs(best.y - b.y) * 2 ? q : best), null);
        if (!target) continue;
        goalD = target.conn == null ? target.d : layout.connectors[target.conn][target.s < 0.5 ? 'top' : 'bottom'];
        goalX = target.x;
      }
      const step = steerTo(b, goalD, goalX, 20);
      moveWalker(b, step.jx, step.jy, dt, t.speed, t.speed / 130);
      b.moving = !b.climb && Math.abs(step.jx) > 0.15;
    }

    // Bombs tick down and explode.
    for (const bomb of state.bombs) {
      bomb.t -= dt;
      if (bomb.t <= 0 && !bomb.done) {
        bomb.done = true;
        const y = P[bomb.d].y - 40;
        impact(bomb.x, y, config.IMPACT.BOMB);
        for (const q of Object.values(state.players)) {
          if (q.d === bomb.d && q.conn == null && Math.abs(q.x - bomb.x) < config.HEALTH.BOMB_RADIUS && !(q.ko > 0) && !(q.koGrace > 0)) {
            if (hurt(q, config.HEALTH.BIG, { big: true, cause: 'bomb', old: true }) === 'ko') knockOut(q, R.KO_TIME, { keepCarry: false }); // (a sapper's bomb is a BIG hit: knocked out at once)
          }
        }
      }
    }
    state.bombs = state.bombs.filter((bomb) => !bomb.done);
  };

  // A crew member hit this raider (sword = damage; shove = push only, not on brutes).
  const onHit = (b, sword, push) => {
    const t = R[b.type];
    b.windup = 0; // interrupted!
    b.hit = 0.25;
    if (sword) {
      b.hp -= config.TOOLS.SWORD_DAMAGE;
      b.cd = Math.max(b.cd, 0.5);
      if (b.conn == null) b.x = clampX(b, b.x + push);
    } else if (!t.noShove) {
      b.cd = Math.max(b.cd, 0.8);
      if (b.conn == null) b.x = clampX(b, b.x + push);
    }
    if (b.hp <= 0) {
      shipPuff(b.x, b.y - 40, '#ffcf40', 14);
      state.boarders.splice(state.boarders.indexOf(b), 1);
    }
  };
  const clampX = (b, x) => Math.max(P[b.d].x0, Math.min(P[b.d].x1, x));

  const reset = () => {
    state.boarders.length = 0;
    state.bombs.length = 0;
  };

  return { update, dropSquad, dropOne, pickType, onHit, reset };
}
