// The ship's two patrol planes ("escort fighters"): small biplanes hanging under the hull on hooks,
// each reached by a ladder down from the lower deck. Take a plane's station and she drops off her hook:
//   - point the stick where to fly (she always flies forward and turns in wide arcs, Bomber XXL
//     style); let go and she circles the ship on guard,
//   - her guns fire by themselves at anything in front of her nose,
//   - LEAVE (or walking away) hands her back to the AUTO PATROL pilot (config ESCORT.AUTO_PATROL),
//     or flies her home to the hook if she is badly hurt (or the patrol is off).
// With nobody at the station an auto pilot flies her out when enemies come near the ship: she is
// a worse shot than a human, so flying one yourself is still worth it. Docked planes repair.
// Enemy bullets and rock hurt her. Shot down, the pilot bails out and comes round in the medical
// bay, and the crew need a while to build another.
import { config } from '../../config.js';
import { flyPlane, smoke, shootDown, angDiff } from './planes.js';
import { targets } from './aim.js';
import { inRock, groundAt, ceilAt } from './course.js';
import { pop } from './popups.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';

const E = config.ESCORT;

// Is this station name one of the patrol planes? (of `layout`'s ship)
export const isEscortStation = (n, layout) => typeof n === 'string' && layout.escortDocks.some((d) => d.n === n);
// The plane belonging to a station name (or undefined).
export const escortFor = (state, n) => (state.escorts || []).find((e) => e.name === n);

export function createEscort({ state, puff, phoneFx }) {
  const ship = mainShip(state); // (B1: the ship the patrol planes hang under; B2 makes this one per ship)
  const layout = ship.layout;
  const DOCKS = layout.escortDocks; // (filled in place when a new ship build is applied, so this stays current)
  const B = layout.bounds;
  const reset = () => {
    state.escorts = DOCKS.map((d, i) => ({ name: d.n, num: d.num || i + 1, idx: i, dock: d, docked: true, flying: false, returning: false, auto: false, idle: 0, x: 0, y: 0, vx: 0, vy: 0, heading: 0, hp: E.HP, max: E.HP, rebuild: 0, gunCd: 0, trail: [] }));
    state.escort = state.escorts[0]; // plane 1 (older code reads this)
  };
  reset();

  const dockPoint = (s) => ({ x: toWorldX(ship, s.dock.x), y: toWorldY(ship, s.dock.y) }); // (the hook, in the world)
  const shipMid = () => ({ x: toWorldX(ship, layout.aimPoint.x), y: toWorldY(ship, layout.aimPoint.y) });
  const nearShip = (x, y, pad) => {
    const sx = toShipX(ship, x);
    const sy = toShipY(ship, y);
    return sx > B.x0 - pad && sx < B.x1 + pad && sy > B.y0 - pad && sy < B.y1 + pad;
  };
  const pilot = (s) => Object.values(state.players).find((p) => p.lock === s.name);

  // Ready to launch?
  // Room to drop off the hook? (With rock right under the hull she stays hooked on: "Wait...".)
  const clearBelow = (s) => { const d = dockPoint(s); return !state.course || [-300, 0, 300, 600].every((dx) => groundAt(state.course, d.x + dx, true, d.y) > d.y + 430) && !inRock(state, d.x, d.y + 30); };
  const ready = (s) => s.docked && s.rebuild <= 0 && state.phase === 'flying' && clearBelow(s);
  const readyByName = (n) => { const s = escortFor(state, n); return !!s && ready(s); };

  // Enemies close enough to the ship for the auto pilot to care about.
  const threats = (mid) => targets(state).map((t) => ({ t, q: t.at(0.4) })).filter((o) => Math.hypot(o.q.x - mid.x, o.q.y - mid.y) < E.PATROL_ENGAGE);

  const launch = (s) => {
    const d = dockPoint(s);
    Object.assign(s, { docked: false, flying: true, returning: false, x: d.x, y: d.y + 20, heading: 0.5, trail: [], orbit: s.idx ? -Math.PI / 2 : Math.PI / 2, air: null, stalled: false, bank: 0, idle: 0 });
    puff(d.x, d.y, '#ffffff', 10);
  };

  const crash = (s, why) => {
    shootDown(state, s, 'escort');
    puff(s.x, s.y, '#ff5a1f', 22);
    pop(state, s.x, s.y - 50, 'kill', '#ff5a5a', 1);
    const p = pilot(s);
    if (p) {
      p.lock = null;
      const rv = layout.reviveSpot();
      p.d = rv.d;
      p.x = rv.x;
      p.y = layout.platforms[p.d].y;
      p.ko = config.GUNSHIP.RESPAWN_TIME;
      phoneFx?.(p, why + (rv.medbay ? ' You bailed out - coming round in the medical bay...' : ' You bailed out - you come round on deck...'));
    }
    Object.assign(s, { docked: true, flying: false, returning: false, auto: false, hp: E.HP, rebuild: E.REBUILD });
    state.ev.warn = 2.5;
    state.ev.warnText = 'PATROL PLANE ' + s.num + ' DOWN! A NEW ONE IN ' + E.REBUILD + 's';
  };

  const updateOne = (s, dt) => {
    if (s.rebuild > 0) s.rebuild = Math.max(0, s.rebuild - dt);
    if (state.phase !== 'flying' || state.ship.down) {
      if (s.flying) Object.assign(s, { docked: true, flying: false, returning: false });
      return;
    }
    const p = pilot(s);
    const mid = shipMid();
    if (s.docked) {
      // Hooked on: the crew patch her up.
      if (s.hp < s.max) s.hp = Math.min(s.max, s.hp + E.REPAIR_RATE * dt);
      if (!ready(s)) return;
      if (p) launch(s);
      else if (E.AUTO_PATROL && !state.escortCramped && s.hp >= s.max * E.PATROL_MIN_HP && threats(mid).length) {
        s.auto = true;
        launch(s);
      }
      return;
    }
    s.auto = !p;

    const hurt = s.hp < s.max * E.PATROL_RETURN_HP;
    let hunt = null;
    if (!p) {
      // Nobody at the stick: auto patrol, or straight home if she is hurt / the patrol is off.
      if (!E.AUTO_PATROL || hurt || state.escortCramped) s.returning = true;
      else {
        const list = threats(mid).sort((a, b) => Math.hypot(a.q.x - s.x, a.q.y - s.y) - Math.hypot(b.q.x - s.x, b.q.y - s.y));
        hunt = list[0] || null;
        s.idle = hunt ? 0 : s.idle + dt;
        if (s.idle > E.PATROL_IDLE) s.returning = true;
      }
    } else s.returning = false; // a pilot took over: cancel the trip home
    // A pilot who walks off hands over to the auto pilot (above) next frame.

    let tx;
    let ty;
    if (s.returning) {
      // Home to the hook: come in from behind and below, then latch on.
      const d = dockPoint(s);
      tx = d.x;
      ty = inRock(state, d.x, d.y + 80) ? d.y - 10 : d.y + 40;
      if (Math.hypot(d.x - s.x, d.y - s.y) < E.DOCK_RANGE) {
        Object.assign(s, { docked: true, flying: false, returning: false, auto: false });
        puff(d.x, d.y, '#ffffff', 8);
        return;
      }
    } else if (p && Math.hypot(p.jx || 0, p.jy || 0) > 0.3) {
      // Fly where the stick points.
      tx = s.x + p.jx * ship.pose.f * 1000; // (the stick is along the ship; the plane flies along the world)
      ty = s.y + p.jy * 1000;
    } else if (hunt) {
      tx = hunt.q.x;
      ty = hunt.q.y;
    } else {
      // Hands off: circle the ship on guard (the second plane flies a wider, opposite loop).
      const r = 1 + E.ORBIT_SPREAD * s.idx;
      s.orbit = (s.orbit || 0) + E.ORBIT_SPEED * dt * (s.idx ? -1 : 1) / r;
      tx = mid.x + Math.cos(s.orbit) * E.ORBIT * 1.3 * r;
      ty = mid.y + Math.sin(s.orbit) * E.ORBIT * 0.7 * r;
    }
    // The auto pilot never aims her at rock: keep the target clear of the ground and the ceiling.
    if (!p && !s.returning && state.course) {
      const g = groundAt(state.course, tx, true, mid.y);
      const c = ceilAt(state.course, tx, mid.y);
      if (Number.isFinite(g)) ty = Math.min(ty, g - 420);
      if (Number.isFinite(c)) ty = Math.max(ty, c + 300);
    }
    // Rock ahead (cave walls too): the auto pilot feels along her nose and swings to the clear side.
    const dockD = s.returning ? Math.hypot(s.x - dockPoint(s).x, s.y - dockPoint(s).y) : Infinity;
    if (!p && dockD > 350) {
      const probe = (a) => [140, 280, 440, 600].some((r) => inRock(state, s.x + Math.cos(a) * r, s.y + Math.sin(a) * r));
      if (probe(s.heading)) {
        for (const da of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6]) {
          if (!probe(s.heading + da)) {
            tx = s.x + Math.cos(s.heading + da) * 1000;
            ty = s.y + Math.sin(s.heading + da) * 1000;
            break;
          }
        }
      }
    }
    // Keep clear of the other plane.
    for (const o of state.escorts) {
      if (o !== s && o.flying && Math.hypot(o.x - s.x, o.y - s.y) < 170) {
        tx = s.x + (s.x - o.x) * 5;
        ty = s.y + (s.y - o.y) * 5;
      }
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

    // Guns: fire along the nose at anything in front (the auto pilot aims worse and fires slower).
    s.gunCd -= dt;
    if (!s.returning && s.gunCd <= 0) {
      const cone = p ? E.FIRE_CONE : E.PATROL_FIRE_CONE;
      const hit = targets(state).some((t) => {
        const q = t.at(0.3);
        const d = Math.hypot(q.x - s.x, q.y - s.y);
        return d < E.FIRE_RANGE && Math.abs(angDiff(Math.atan2(q.y - s.y, q.x - s.x), s.heading)) < cone;
      });
      if (hit) {
        s.gunCd = p ? E.SHOT_EVERY : E.PATROL_SHOT_EVERY;
        const nx = s.x + Math.cos(s.heading) * 34;
        const ny = s.y + Math.sin(s.heading) * 34;
        state.shells.push({ x: nx, y: ny, vx: Math.cos(s.heading) * 1100 + (s.vx - ship.pose.vx) * 0.3 + ship.pose.vx, vy: Math.sin(s.heading) * 1100 + s.vy * 0.3, life: 1.0, owner: p && p.id });
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

  // Is the ship squeezed between rock (a canyon, a cave)? Then the auto pilot stays hooked on.
  let roomT = 0;
  const checkRoom = (dt) => {
    if ((roomT -= dt) > 0) return;
    roomT = 0.5;
    const mid = shipMid();
    let hits = 0;
    let n = 0;
    for (const r of [550, 950]) for (let k = 0; k < 16; k++, n++) if (inRock(state, mid.x + Math.cos(k * Math.PI / 8) * r, mid.y + Math.sin(k * Math.PI / 8) * r)) hits++;
    state.escortCramped = hits / n > E.CRAMPED;
  };

  const update = (dt) => {
    checkRoom(dt);
    for (const s of state.escorts) updateOne(s, dt);
    state.escort = state.escorts[0];
  };

  // What the phone's status line says at a station.
  const status = (name) => {
    const s = escortFor(state, name || DOCKS[0].n);
    if (!s) return '';
    if (s.rebuild > 0) return 'Building a new fighter - ' + Math.ceil(s.rebuild) + 's';
    if (s.returning) return 'Flying home to the hook...';
    if (s.docked && !clearBelow(s)) return 'Rock under the hook - waiting for clear sky';
    if (s.flying) return 'Fighter ' + s.num + ': ' + Math.max(0, Math.round((s.hp / s.max) * 100)) + '%';
    if (s.hp < s.max) return 'Repairing - ' + Math.max(0, Math.round((s.hp / s.max) * 100)) + '%';
    return '';
  };

  return { update, reset, ready: readyByName, status };
}
