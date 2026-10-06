// The ship's own escort fighter: a small biplane hanging under the hull on a hook, reached by the
// ladder down from the lower deck. Take the "Escort Fighter" station and she drops off the hook:
//   - point the stick where to fly (she always flies forward and turns in wide arcs, Bomber XXL
//     style); let go and she circles the ship on guard,
//   - her guns fire by themselves at anything in front of her nose,
//   - LEAVE (or walking away) flies her home to the hook.
// Enemy bullets and rock hurt her. Shot down, the pilot bails out and comes round in the medical
// bay, and the crew need a while to build another.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { flyPlane, smoke, shootDown, angDiff } from './planes.js';
import { targets } from './aim.js';
import { inRock } from './course.js';
import { pop } from './popups.js';

const E = config.ESCORT;
const B = SHIP_LAYOUT.bounds;
export const DOCK = SHIP_LAYOUT.escortDock; // where she hangs, in ship coordinates

export function createEscort({ state, puff, phoneFx }) {
  const reset = () => {
    state.escort = { docked: true, flying: false, returning: false, x: 0, y: 0, vx: 0, vy: 0, heading: 0, hp: E.HP, max: E.HP, rebuild: 0, gunCd: 0, trail: [] };
  };
  reset();

  const dockPoint = () => ({ x: DOCK.x, y: DOCK.y - state.ship.alt });
  const shipMid = () => ({ x: SHIP_LAYOUT.aimPoint.x, y: SHIP_LAYOUT.aimPoint.y - state.ship.alt });
  const nearShip = (x, y, pad) => x > B.x0 - pad && x < B.x1 + pad && y > B.y0 - state.ship.alt - pad && y < B.y1 - state.ship.alt + pad;
  const pilot = () => Object.values(state.players).find((p) => p.lock === 'Escort Fighter');

  // Ready to launch?
  const ready = () => state.escort.docked && state.escort.rebuild <= 0 && state.phase === 'flying';

  const launch = () => {
    const s = state.escort;
    const d = dockPoint();
    Object.assign(s, { docked: false, flying: true, returning: false, x: d.x, y: d.y + 20, heading: 0.5, trail: [], orbit: Math.PI / 2, air: null, stalled: false, bank: 0 });
    puff(d.x, d.y, '#ffffff', 10);
  };

  const crash = (s, why) => {
    shootDown(state, s, 'escort');
    puff(s.x, s.y, '#ff5a1f', 22);
    pop(state, s.x, s.y - 50, 'kill', '#ff5a5a', 1);
    const p = pilot();
    if (p) {
      p.lock = null;
      const mb = SHIP_LAYOUT.medbay;
      p.d = SHIP_LAYOUT.platforms.findIndex((q) => q.id === mb.p);
      p.x = mb.x;
      p.y = SHIP_LAYOUT.platforms[p.d].y;
      p.ko = config.GUNSHIP.RESPAWN_TIME;
      phoneFx?.(p, why + ' You bailed out - coming round in the medical bay...');
    }
    Object.assign(s, { docked: true, flying: false, returning: false, hp: E.HP, rebuild: E.REBUILD });
    state.ev.warn = 2.5;
    state.ev.warnText = 'ESCORT FIGHTER DOWN! A NEW ONE IN ' + E.REBUILD + 's';
  };

  const update = (dt) => {
    const s = state.escort;
    if (s.rebuild > 0) s.rebuild = Math.max(0, s.rebuild - dt);
    if (state.phase !== 'flying' || state.ship.down) {
      if (s.flying) Object.assign(s, { docked: true, flying: false, returning: false });
      return;
    }
    const p = pilot();
    if (s.docked) {
      if (p && ready()) launch();
      return;
    }
    if (!p) s.returning = true;

    const mid = shipMid();
    let tx;
    let ty;
    if (s.returning) {
      // Home to the hook: come in from behind and below, then latch on.
      const d = dockPoint();
      tx = d.x;
      ty = d.y + 40;
      if (Math.hypot(d.x - s.x, d.y - s.y) < E.DOCK_RANGE) {
        Object.assign(s, { docked: true, flying: false, returning: false });
        puff(d.x, d.y, '#ffffff', 8);
        return;
      }
    } else if (Math.hypot(p.jx || 0, p.jy || 0) > 0.3) {
      // Fly where the stick points.
      tx = s.x + p.jx * 1000;
      ty = s.y + p.jy * 1000;
    } else {
      // Hands off: circle the ship on guard.
      s.orbit = (s.orbit || 0) + E.ORBIT_SPEED * dt;
      tx = mid.x + Math.cos(s.orbit) * E.ORBIT * 1.3;
      ty = mid.y + Math.sin(s.orbit) * E.ORBIT * 0.7;
    }
    // Close in on the hook: slow right down so she can latch on.
    const homing = s.returning && Math.hypot(tx - s.x, ty - s.y) < 600;
    flyPlane(state, s, tx, ty, dt, {
      speed: homing ? E.SPEED * 0.6 : E.SPEED,
      turn: homing ? E.TURN * 1.8 : E.TURN,
      turnAvoid: E.TURN_AVOID,
      nearShip: s.returning ? null : nearShip,
      midY: mid.y,
      fm: E,
      max: s.max,
    });
    smoke(s, s.max, puff);

    // Guns: fire along the nose at anything in front.
    s.gunCd -= dt;
    if (!s.returning && s.gunCd <= 0) {
      const hit = targets(state).some((t) => {
        const q = t.at(0.3);
        const d = Math.hypot(q.x - s.x, q.y - s.y);
        return d < E.FIRE_RANGE && Math.abs(angDiff(Math.atan2(q.y - s.y, q.x - s.x), s.heading)) < E.FIRE_CONE;
      });
      if (hit) {
        s.gunCd = E.SHOT_EVERY;
        const nx = s.x + Math.cos(s.heading) * 34;
        const ny = s.y + Math.sin(s.heading) * 34;
        state.shells.push({ x: nx, y: ny, vx: Math.cos(s.heading) * 1100 + s.vx * 0.3, vy: Math.sin(s.heading) * 1100 + s.vy * 0.3, life: 1.0, owner: p && p.id });
        if (state.flashes) state.flashes.push({ x: nx, y: ny, ang: s.heading, t: 0.06, color: '#fff2b0', size: 0.7 });
      }
    }

    // Enemy fire hurts her.
    for (const b of state.bullets) {
      if (b.life > 0 && Math.hypot(b.x - s.x, b.y - s.y) < 34) {
        b.life = 0;
        s.hp -= 1;
        puff(s.x, s.y, '#ffcf40', 6);
      }
    }
    if (s.hp <= 0) return crash(s, 'Shot down!');
    if (inRock(state, s.x, s.y)) return crash(s, 'Crashed into the rock!');
    // Too far away: the radio's out of range, she comes home.
    if (Math.hypot(s.x - mid.x, s.y - mid.y) > E.LEASH) s.returning = true;
  };

  // What the phone's status line says at the station.
  const status = () => {
    const s = state.escort;
    if (s.rebuild > 0) return 'Building a new fighter - ' + Math.ceil(s.rebuild) + 's';
    if (s.returning) return 'Flying home to the hook...';
    if (s.flying) return 'Fighter ' + Math.max(0, Math.round((s.hp / s.max) * 100)) + '%';
    return '';
  };

  return { update, reset, ready, status };
}
