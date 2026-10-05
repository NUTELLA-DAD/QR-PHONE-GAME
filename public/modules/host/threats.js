// Threats from outside the ship: the fighter, the raider cargo plane, floating mines, falling
// wrecks, plus the crew's shells hitting them. Anything that touches the ship crashes into it.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { enemyPath } from './enemy.js';
import { keepClear, inRock } from './course.js';

const B = SHIP_LAYOUT.bounds;
const rand = (a, b) => a + Math.random() * (b - a);

export function createThreats({ state, puff, impact, hitsShip, dropSquad, getHelm, credit }) {
  state.cargo = [];
  state.mines = [];
  state.wrecks = [];
  state.ev = { t: config.CARGO.FIRST_AFTER, warn: 0, warnText: '' };
  let mineT = config.MINES.FIRST_AFTER;

  const crew = () => Object.keys(state.players).length;
  const warn = (text, secs = 3.5) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  // Does a round thing at world (x, y) with radius r touch the ship?
  const touches = (x, y, r) => {
    const sy = y + state.ship.alt;
    return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => hitsShip(x + dx, sy + dy));
  };
  // A falling wreck that can crash into the ship.
  const wreck = (x, y, vx, kind) => state.wrecks.push({ x, y, vx, vy: -60, spin: 0, kind });

  const updateFighter = (dt) => {
    const e = state.enemy;
    if (e.dead > 0) {
      e.dead -= dt;
      if (e.dead <= 0) {
        e.hp = 5 + Math.floor(crew() / 4);
        e.ang = Math.random() * 6.28;
        e.cy = -state.ship.alt;
        const p = enemyPath(e.ang);
        e.x = p.x;
        e.y = p.y + e.cy;
      }
      return;
    }
    e.ang += dt * config.ENEMY.TURN_SPEED;
    // The loop follows the ship's altitude, a little late: sharp climbs/dives can still meet it.
    e.cy = e.cy ?? -state.ship.alt;
    e.cy += (-state.ship.alt - e.cy) * Math.min(1, dt * 0.8);
    const next = enemyPath(e.ang);
    next.y += e.cy;
    next.y = keepClear(state, next.x, next.y, 70); // fly over mountains, under overhangs
    e.vx = next.x - e.x;
    e.vy = next.y - e.y;
    e.x = next.x;
    e.y = next.y;
    if (e.hp <= 2 && Math.random() < 0.5) puff(e.x, e.y, '#555', 1);
    // Flew into the ship (e.g. the helm climbed into its path): it crashes.
    if (!state.ship.down && touches(e.x, e.y, 30)) {
      impact(e.x, e.y + state.ship.alt, config.IMPACT.PLANE_CRASH);
      puff(e.x, e.y, '#ff5a1f', 24);
      e.dead = 5;
      warn('ENEMY PLANE CRASHED INTO US!');
      return;
    }
    if ((e.fire -= dt) <= 0 && !state.ship.down) {
      const lapRate = config.LAP_FIRE_RATE[Math.min(config.LAP_FIRE_RATE.length - 1, ((state.course && state.course.lap) || 1) - 1)];
      const pace = (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).pace;
      e.fire = ((2 + Math.random() * 1.5) * (1.2 - Math.min(0.5, crew() * 0.04))) / lapRate / pace;
      const helm = getHelm();
      const evading = helm && (Math.abs(helm.jy) > 0.2 || state.ship.speed > 0.3);
      const miss = evading && Math.random() < 0.5;
      const tx = SHIP_LAYOUT.aimPoint.x + (Math.random() - 0.5) * 900;
      const ty = SHIP_LAYOUT.aimPoint.y - state.ship.alt + (Math.random() - 0.5) * 200 + (miss ? (Math.random() < 0.5 ? -1 : 1) * 700 : 0);
      const d = Math.hypot(tx - e.x, ty - e.y) || 1;
      state.bullets.push({ x: e.x, y: e.y, vx: ((tx - e.x) / d) * 430, vy: ((ty - e.y) / d) * 430, miss, life: 4 });
    }
  };

  const updateCargo = (dt) => {
    const C = config.CARGO;
    state.ev.t -= dt;
    if (state.ev.t <= 0) {
      if (crew() && !state.ship.down && !state.cargo.length && !state.boarders.length) {
        const fromLeft = Math.random() < 0.5;
        const entry = SHIP_LAYOUT.boarderEntryPoints[fromLeft ? 0 : SHIP_LAYOUT.boarderEntryPoints.length - 1];
        state.cargo.push({
          x: fromLeft ? B.x0 - C.START_DISTANCE : B.x1 + C.START_DISTANCE,
          y: B.y0 - C.HEIGHT - state.ship.alt,
          baseY: B.y0 - C.HEIGHT - state.ship.alt, // the height it wants to fly at
          vx: fromLeft ? C.SPEED : -C.SPEED,
          hp: C.HP + Math.floor(crew() / 4),
          dropX: entry.x,
          dropped: false,
          hit: 0,
        });
        warn('CARGO PLANE INCOMING - SHOOT IT DOWN!');
        state.ev.t = rand(C.EVERY_MIN, C.EVERY_MAX);
      } else state.ev.t = 5;
    }
    for (const c of state.cargo) {
      c.x += c.vx * dt;
      // Climb over / duck under terrain, smoothly.
      c.y += (keepClear(state, c.x, c.baseY, 120, 0, 450) - c.y) * Math.min(1, dt * 3);
      c.y = keepClear(state, c.x, c.y, 50, 0, 120); // and never inside rock
      c.hit = Math.max(0, c.hit - dt);
      if (!c.dropped && (c.vx > 0 ? c.x >= c.dropX : c.x <= c.dropX)) {
        c.dropped = true;
        dropSquad(c.x, c.y + 40);
        warn('RAIDERS ON THE CATWALK!');
      }
    }
    state.cargo = state.cargo.filter((c) => c.hp > 0 && c.x > B.x0 - C.START_DISTANCE - 200 && c.x < B.x1 + C.START_DISTANCE + 200);
  };

  const updateMines = (dt) => {
    const M = config.MINES;
    if ((mineT -= dt) <= 0) {
      mineT = rand(M.EVERY_MIN, M.EVERY_MAX);
      if (crew() && !state.ship.down) {
        // Skim the top (gasbag) or bottom (keel/turret) so the helm can dodge, or come dead centre.
        let shipY;
        if (Math.random() < M.EDGE_CHANCE) shipY = Math.random() < 0.5 ? rand(70, 150) : rand(800, 900);
        else shipY = rand(320, 680);
        state.mines.push({ x: B.x1 + 1500, y: shipY - state.ship.alt, baseY: shipY - state.ship.alt, vx: 0, bob: Math.random() * 6 });
      }
    }
    for (const m of state.mines) {
      m.vx = -(40 + state.ship.speed * 520); // the ship flies into them
      m.x += m.vx * dt;
      // Mines float in open air, never inside rock.
      m.y += (keepClear(state, m.x, m.baseY, M.RADIUS + 40, 0, 250) - m.y) * Math.min(1, dt * 3);
      m.y = keepClear(state, m.x, m.y, M.RADIUS + 5, 0, 60); // and never inside rock
      m.bob += dt;
      if (!m.dead && !state.ship.down && touches(m.x, m.y, M.RADIUS)) {
        m.dead = true;
        puff(m.x, m.y, '#ff5a1f', 24);
        impact(m.x, m.y + state.ship.alt, config.IMPACT.MINE);
        warn('MINE HIT!', 2);
      }
    }
    state.mines = state.mines.filter((m) => !m.dead && m.x > B.x0 - 600);
  };

  const updateWrecks = (dt) => {
    for (const w of state.wrecks) {
      w.vy += 500 * dt;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      if (!w.dead && inRock(state, w.x, w.y)) {
        // Smashes into the ground (or a rock ceiling).
        w.dead = true;
        puff(w.x, w.y, '#8b6b4a', 16);
        puff(w.x, w.y, '#ff5a1f', 10);
      }
      w.spin += dt * 4;
      if (Math.random() < 0.6) puff(w.x, w.y, '#444', 1);
      if (!w.dead && !state.ship.down && touches(w.x, w.y, 30)) {
        w.dead = true;
        puff(w.x, w.y, '#ff5a1f', 24);
        impact(w.x, w.y + state.ship.alt, config.IMPACT.PLANE_CRASH);
        warn('WRECKAGE CRASHED ONTO US!');
      }
    }
    state.wrecks = state.wrecks.filter((w) => !w.dead && w.y < 2500);
  };

  const updateShells = (dt) => {
    for (const shell of state.shells) {
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      shell.life -= dt;
      if (inRock(state, shell.x, shell.y)) {
        shell.life = 0; // hit the rock
        puff(shell.x, shell.y, '#8b6b4a', 4);
        continue;
      }
      const e = state.enemy;
      if (e.dead <= 0 && Math.hypot(shell.x - e.x, shell.y - e.y) < 46) {
        shell.life = 0;
        e.hp -= config.GUNS.DAMAGE;
        puff(e.x, e.y, '#ffcf40', 8);
        if (e.hp <= 0) {
          e.dead = 4;
          state.kills += 1;
          credit?.(shell);
          puff(e.x, e.y, '#ff5a1f', 24);
          wreck(e.x, e.y, e.vx / Math.max(dt, 1e-3), 'fighter');
        }
        continue;
      }
      for (const c of state.cargo) {
        if (Math.abs(shell.x - c.x) < 90 && Math.abs(shell.y - c.y) < 40) {
          shell.life = 0;
          c.hp -= config.GUNS.DAMAGE;
          c.hit = 0.15;
          puff(shell.x, shell.y, '#ffcf40', 8);
          if (c.hp <= 0) {
            state.kills += 1;
            credit?.(shell);
            puff(c.x, c.y, '#ff5a1f', 30);
            wreck(c.x, c.y, c.vx, 'cargo');
            warn(c.dropped ? 'CARGO PLANE DOWN!' : 'CARGO PLANE DOWN - NO RAIDERS THIS TIME!', 2.5);
          }
          break;
        }
      }
      for (const m of state.mines) {
        if (!m.dead && Math.hypot(shell.x - m.x, shell.y - m.y) < config.MINES.RADIUS + 8) {
          shell.life = 0;
          m.dead = true;
          puff(m.x, m.y, '#ff5a1f', 18);
        }
      }
    }
  };

  const reset = () => {
    state.cargo.length = 0;
    state.mines.length = 0;
    state.wrecks.length = 0;
  };

  const update = (dt) => {
    updateFighter(dt);
    updateCargo(dt);
    updateMines(dt);
    updateWrecks(dt);
    updateShells(dt);
    state.ev.warn = Math.max(0, state.ev.warn - dt);
  };

  return { update, reset };
}
