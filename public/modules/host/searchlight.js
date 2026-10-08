// Searchlights: two crewed lamps (the crow's nest and the belly) whose beams help the whole ship.
// A crew member locks onto one like a gun: the stick sweeps the beam (inside the lamp's arc), HOLD Action
// focuses it (narrower, longer). Anything inside a manned beam is LIT: it takes bonus damage, the guns
// snap onto it more easily (aim.js reads obj.lit) and the TV draws a bracket round it. In dark places
// (searchlightArt.js) the beams are also what lets the crew see. Unmanned lamps idle at their home angle, dim.
//
// All the numbers live in config.SEARCHLIGHT; where each lamp sits is SHIP_LAYOUT.searchlights.
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { targets } from './aim.js';
import { tilt, inRock } from './course.js';
import { pop } from './popups.js';
import { envOf } from './environments.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, aimToWorld, aimToShip } from './pose.js';

const S = config.SEARCHLIGHT;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The lamp names of a ship layout (no layout = ship 0), rebuilt when a new ship build is applied to it.
const tables = layoutTables((layout) => { const LIGHT_NAMES = Object.keys(layout.searchlights); return { LIGHT_NAMES, SET: new Set(LIGHT_NAMES) }; });
export const lightNames = (layout) => tables(layout).LIGHT_NAMES;
export const isSearchlight = (name, layout) => tables(layout).SET.has(name);

// How dark the world is right now (0..1, before lightning flashes): the environment's DARK, the caves, and dusk, combined.
// (searchlightArt.js smooths this and draws it; the bots use it to decide whether to man a lamp.)
export function darkTarget(state) {
  const D = S.DARK;
  if (!D.ENABLED) return 0;
  const c = state.course;
  const env = envOf(state);
  const air = (env && env.DARK) || 0;
  const cave = c && c.map && !c.map.open ? D.CAVE : 0;
  const dusk = c ? (c.dusk || 0) * D.DUSK : 0;
  return Math.min(D.MAX, 1 - (1 - air) * (1 - cave) * (1 - dusk));
}

export function createSearchlights({ state }) {
  const ship = mainShip(state);
  const layout = ship.layout; // (B1: the ship the lamps are on; B2 makes this one per ship)
  const lights = (state.searchlights = lightNames(layout).map((n) => {
    const m = layout.searchlights[n];
    return { n, bx: m.bx, by: m.by, home: m.aim, arc: m.arc, len: m.len, aim: m.aim, power: S.UNMANNED, focus: 0, manned: false, reach: S.RANGE, litCount: 0, ex: m.bx, ey: m.by, half: S.HALF_ANGLE, tierMul: 1 + config.NEST.TIER_BONUS * layout.nestTier((layout.stations.find((s) => s.n === n) || {}).p) };
  }));
  state.litTargets = []; // [{ x, y, r, kind }] for the TV: brackets round everything lit
  state.dimTargets = []; // [{ x, y, r, kind }] hostile things NOT in a beam (the TV gives them glowing eyes in the dark)
  const litObjs = new Set();
  let lastHp = new Map();

  // Where the lens is in world coordinates (the same frame as the guns' shells) and which way the beam points.
  const emitter = (l) => {
    const a = l.aim + (state.ship.pitch || 0);
    const [x, y] = tilt(state, l.bx, l.by);
    return { x: toWorldX(ship, x + Math.cos(a) * l.len), y: toWorldY(ship, y + Math.sin(a) * l.len), a: aimToWorld(ship, a) }; // (a: which way the beam points in the WORLD; l.aim is in ship space)
  };

  const operatorOf = (l) => Object.values(state.players).find((q) => q.lock === l.n) || null;

  const update = (dt) => {
    const flying = state.phase === 'flying' || state.phase === 'lobby';
    const tgs = flying ? targets(state) : [];
    state.darkNow = darkTarget(state); // (aim.js: in the dark the guns only lock onto lit targets)
    state.litTargets.length = 0;
    state.dimTargets.length = 0;
    // 1. The lamps: swing, focus, power.
    for (const l of lights) {
      const op = operatorOf(l);
      l.manned = !!op && !state.ship.down;
      if (l.manned) {
        l.op = op.id;
        const e = emitter(l);
        if (Math.hypot(op.jx, op.jy) > 0.25) {
          let want = Math.atan2(op.jy, op.jx);
          // A little help: bend toward a target close to where the stick points.
          if (S.ASSIST_ANGLE > 0) {
            let best = null;
            for (const t of tgs) {
              const p = t.at(0);
              const a = aimToShip(ship, Math.atan2(p.y - e.y, p.x - e.x)) - (state.ship.pitch || 0);
              const off = Math.abs(angleDiff(a, want));
              if (off < S.ASSIST_ANGLE && (!best || off < best.off) && Math.abs(angleDiff(a, l.home)) <= l.arc) best = { a, off };
            }
            if (best) want += angleDiff(best.a, want) * S.ASSIST_STRENGTH;
          }
          const goal = l.home + clamp(angleDiff(want, l.home), -l.arc, l.arc);
          l.aim += clamp(angleDiff(goal, l.aim), -S.TURN * dt, S.TURN * dt);
        }
        l.focusWant = op.fire ? 1 : 0; // (hold Action; the tap flag is already cleared by now)
      } else {
        l.op = null;
        l.focusWant = 0;
        // Nobody on it: drift back to the home angle.
        l.aim += clamp(angleDiff(l.home, l.aim), -0.8 * dt, 0.8 * dt);
      }
      l.focus += clamp(l.focusWant - l.focus, -6 * dt, 6 * dt);
      const wantPower = l.manned ? 1 : S.UNMANNED;
      l.power += clamp(wantPower - l.power, -S.POWER_RISE * dt, S.POWER_RISE * dt);
      l.half = S.HALF_ANGLE + (S.FOCUS_HALF_ANGLE - S.HALF_ANGLE) * l.focus;
      const maxLen = (S.RANGE + (S.FOCUS_RANGE - S.RANGE) * l.focus) * (0.45 + 0.55 * l.power) * l.tierMul; // (a lamp on the high nest throws its beam further)
      // A cave wall stops the beam.
      l.reach = maxLen;
      if (state.course && state.course.map) {
        const e = emitter(l);
        for (let d = 120; d <= maxLen; d += 100) {
          if (inRock(state, e.x + Math.cos(e.a) * d, e.y + Math.sin(e.a) * d)) {
            l.reach = Math.max(80, d - 40);
            break;
          }
        }
      }
      l.litCount = 0;
      const lens = emitter(l);
      l.ex = lens.x; // where the lens is in the world (for the bots)
      l.ey = lens.y;
    }

    // 2. Who is in a manned beam?
    const nowLit = new Set();
    for (const t of tgs) {
      const p = t.at(0);
      let lit = false;
      for (const l of lights) {
        if (!l.manned || l.power < 0.6) continue;
        const e = emitter(l);
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist > l.reach + t.r) continue;
        const off = Math.abs(angleDiff(Math.atan2(dy, dx), e.a));
        if (off <= l.half + Math.atan2(t.r, Math.max(dist, 1))) {
          lit = true;
          l.litCount += 1;
        }
      }
      const o = t.obj;
      if (lit) {
        if (o && typeof o === 'object') {
          o.lit = S.LIT_HOLD;
          nowLit.add(o);
        }
        state.litTargets.push({ x: p.x, y: p.y, r: t.r, kind: t.kind });
      } else state.dimTargets.push({ x: p.x, y: p.y, r: t.r, kind: t.kind });
    }
    // The glow fades off things the beam left.
    for (const o of litObjs) {
      if (nowLit.has(o)) continue;
      o.lit = Math.max(0, (o.lit || 0) - dt);
      if (o.lit <= 0) litObjs.delete(o);
    }
    for (const o of nowLit) litObjs.add(o);

    // 3. Bonus damage: whatever lost hit points while lit loses a bit more (never the killing blow: the guns finish it).
    const hp = new Map();
    if (S.LIT_DAMAGE > 0) {
      for (const t of tgs) {
        const o = t.obj;
        if (!o || typeof o.hp !== 'number' || hp.has(o)) continue;
        const prev = lastHp.get(o);
        if (prev != null && o.hp < prev && o.hp > 0 && (o.lit || 0) > 0 && !o.dead) {
          o.slAcc = (o.slAcc || 0) + (prev - o.hp) * S.LIT_DAMAGE;
          const take = Math.floor(o.slAcc);
          if (take >= 1) {
            o.slAcc -= take;
            if (o.hp - take >= 1) {
              o.hp -= take;
              const p = t.at(0);
              pop(state, p.x, p.y - 50, 'LIT!', '#fff2b0', 0.8);
            }
          }
        }
        hp.set(o, o.hp);
      }
    }
    lastHp = hp;
  };

  const reset = () => {
    for (const l of lights) Object.assign(l, { aim: l.home, power: S.UNMANNED, focus: 0, manned: false, litCount: 0 });
    for (const o of litObjs) o.lit = 0;
    litObjs.clear();
    lastHp = new Map();
    state.litTargets.length = 0;
    state.dimTargets.length = 0;
  };

  // A line for the phone: what the beam is doing.
  const status = (name) => {
    const l = lights.find((q) => q.n === name);
    if (!l) return '';
    return l.litCount ? `${l.litCount} lit - the guns hit harder!` : '';
  };

  return { update, reset, emitter, status, lights };
}
