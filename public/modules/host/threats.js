// Threats from outside the ship: the fighter, floating mines, falling
// wrecks, plus the crew's shells hitting them. Anything that touches the ship crashes into it.
import { firePace, spawnPace, crewMul } from './crewscale.js';
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { keepClear, inRock, groundAt, ceilAt, scrollSpeed } from './course.js';
import { pop } from './popups.js';
import { flyPlane, smoke, shootDown, updateChutes, shoveShip, bumpShip, bounceStep } from './planes.js';

const B = SHIP_LAYOUT.bounds;
const rand = (a, b) => a + Math.random() * (b - a);

export function createThreats({ state, puff, impact, hitsShip, dropSquad, getHelm, credit }) {
  state.mines = [];
  state.wrecks = [];
  state.ev = { t: 0, warn: 0, warnText: '' };
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

  // ---------- The fighter: a real plane with momentum ----------
  // It flies at speed with a limited turn rate, so its turns are wide. It lines up far off to
  // one side, makes a long strafing run at the ship firing along its nose, breaks away past it,
  // extends out the other side and swings round for another pass. It tries to dodge rock it sees
  // ahead, but it can't turn on a sixpence: misjudge a mountain and it crashes.
  const F = config.ENEMY;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  const shipMid = () => ({ x: SHIP_LAYOUT.aimPoint.x, y: SHIP_LAYOUT.aimPoint.y - state.ship.alt });
  const nearShip = (x, y, pad) => x > B.x0 - pad && x < B.x1 + pad && y > B.y0 - state.ship.alt - pad && y < B.y1 - state.ship.alt + pad;

  const startRun = (e) => {
    const mid = shipMid();
    e.mode = 'run';
    e.aim = { dx: rand(-500, 500), dy: rand(-120, 160) };
    const lapRate = config.LAP_FIRE_RATE[Math.min(config.LAP_FIRE_RATE.length - 1, ((state.course && state.course.lap) || 1) - 1)] * (1 + (((state.course && state.course.danger) || 2) - 2) * config.VOYAGE.DANGER_FIRE);
    const pace = firePace(state);
    e.shots = Math.max(2, Math.min(6, Math.round(F.SHOTS * lapRate * pace * (0.8 + Math.min(0.5, crew() * 0.04)))));
    e.side = Math.sign(e.x - mid.x) || 1;
  };

  const spawnFighter = (e) => {
    const mid = shipMid();
    const side = Math.random() < 0.5 ? -1 : 1;
    e.hp = e.max = Math.max(2, Math.round((5 + Math.floor(crew() / 4)) * crewMul(state, 'hp')));
    e.trail = [];
    e.air = e.stalled = e.pullDir = null;
    e.bank = 0;
    e.x = mid.x + side * F.RUN_FROM;
    e.y = mid.y + rand(-700, 200);
    e.heading = side > 0 ? Math.PI : 0;
    e.fire = 0;
    startRun(e);
  };

  // Break off past the ship: go over it (or under, if there's room) and extend to the far side.
  const breakAway = (e) => {
    const mid = shipMid();
    const groundGap = groundAt(state.course, mid.x) - (B.y1 - state.ship.alt);
    const over = e.y < mid.y || groundGap < 700 || Math.random() < 0.5;
    e.mode = 'extend';
    e.wp = { x: mid.x - e.side * F.RUN_FROM, y: over ? B.y0 - state.ship.alt - rand(500, 900) - F.ZOOM : B.y1 - state.ship.alt + rand(350, 550) };
  };

  const crashFighter = (e, text) => {
    puff(e.x, e.y, '#ff5a1f', 26);
    puff(e.x, e.y, '#555', 14);
    pop(state, e.x, e.y - 50, 'kill', '#ffd23f', 1.2);
    e.dead = F.RESPAWN;
    warn(text, 2.5);
  };

  const rate = () => (state.tempo ? state.tempo.rate : 1) * spawnPace(state); // the pacing director's spawn speed (0 in a calm)
  const updateFighter = (dt) => {
    const e = state.enemy;
    if (rate() <= 0 && (e.dead > 0 || e.heading == null)) return; // calm: no new fighter
    if (e.dead > 0) {
      e.dead -= dt * rate();
      if (e.dead <= 0) spawnFighter(e);
      return;
    }
    if (e.heading == null) spawnFighter(e);
    const mid = shipMid();
    // Where it wants to go.
    let tx;
    let ty;
    if (e.mode === 'run') {
      tx = mid.x + e.aim.dx;
      ty = mid.y + e.aim.dy;
      const dist = Math.hypot(tx - e.x, ty - e.y);
      const passed = Math.cos(e.heading) * (tx - e.x) + Math.sin(e.heading) * (ty - e.y) < 0;
      // Break off before its path reaches the hull (it can't turn tighter than this).
      const ahead = F.BREAK_LOOKAHEAD * F.SPEED;
      const soon = nearShip(e.x + Math.cos(e.heading) * ahead, e.y + Math.sin(e.heading) * ahead, 230);
      if (soon || dist < F.BREAK_AT || (passed && dist < 1400)) breakAway(e);
    } else {
      tx = e.wp.x;
      ty = e.wp.y;
      if (Math.hypot(tx - e.x, ty - e.y) < 350 || Math.abs(e.x - mid.x) > F.RUN_FROM + 400) startRun(e);
    }
    const px0 = e.x;
    const py0 = e.y;
    flyPlane(state, e, tx, ty, dt, { speed: F.SPEED, turn: F.TURN, turnAvoid: F.TURN_AVOID, nearShip, midY: mid.y, fm: F, max: e.max });
    const course = state.course;
    smoke(e, e.max || 5, puff);
    // Flew into the rock: it crashes.
    if (course && inRock(state, e.x, e.y)) {
      state.kills += 1;
      wreck(e.x, e.y - 20, e.vx * 0.3, 'fighter');
      crashFighter(e, 'ENEMY FIGHTER FLEW INTO THE ROCKS!');
      return;
    }
    // Flew into the ship: it crashes, and that hurts.
    if (!state.ship.down && (touches(e.x, e.y, 30) || touches((e.x + px0) / 2, (e.y + py0) / 2, 30))) {
      impact(e.x, e.y + state.ship.alt, config.IMPACT.PLANE_CRASH);
      shoveShip(state, e, 1.5);
      crashFighter(e, 'ENEMY PLANE CRASHED INTO US!');
      return;
    }
    // Guns fire along the nose during a run, in short bursts.
    e.fire = Math.max(0, (e.fire || 0) - dt);
    if (e.mode === 'run' && e.shots > 0 && e.fire <= 0 && !state.ship.down) {
      const aimAt = Math.atan2(ty - e.y, tx - e.x);
      const off = angDiff(aimAt, e.heading);
      if (Math.abs(off) < 0.5 && Math.hypot(tx - e.x, ty - e.y) < F.FIRE_RANGE) {
        e.shots -= 1;
        e.fire = F.SHOT_EVERY;
        const helm = getHelm();
        const evading = helm && (Math.abs(helm.jy) > 0.2 || Math.abs(state.ship.speed) > 0.3);
        const miss = evading && Math.random() < 0.5;
        const dir = e.heading + Math.max(-0.2, Math.min(0.2, off)) + (miss ? (Math.random() < 0.5 ? -1 : 1) * 0.3 : rand(-0.05, 0.05));
        const nx = e.x + Math.cos(e.heading) * 40;
        const ny = e.y + Math.sin(e.heading) * 40;
        state.bullets.push({ x: nx, y: ny, vx: Math.cos(dir) * F.BULLET_SPEED, vy: Math.sin(dir) * F.BULLET_SPEED, miss, life: 3 });
        puff(nx, ny, '#ffe9a8', 2);
        if (state.flashes) state.flashes.push({ x: nx, y: ny, ang: dir, t: 0.07, color: '#ffb3b3', size: 0.8 });
      }
    }
  };

  const updateMines = (dt) => {
    const M = config.MINES;
    if ((mineT -= dt * rate()) <= 0) {
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
      if (w.spiral) {
        // A shot-down plane corkscrews away: still flying, nose spinning round, losing height.
        w.spin += w.spiral * 3.2 * dt;
        w.vx += (Math.cos(w.spin) * 260 - w.vx) * Math.min(1, dt * 2);
        w.vy += (Math.sin(w.spin) * 200 + 260 - w.vy) * Math.min(1, dt * 2);
        w.x += (w.vx - scrollSpeed(state)) * dt;
        w.y += w.vy * dt;
        if (Math.random() < 0.9) puff(w.x, w.y, '#333', 1);
      } else {
        w.vy += 500 * dt;
        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.spin += dt * 4;
      }
      if (!w.dead && inRock(state, w.x, w.y)) {
        // Smashes into the ground (or a rock ceiling).
        w.dead = true;
        puff(w.x, w.y, '#8b6b4a', 16);
        puff(w.x, w.y, '#ff5a1f', 10);
      }
      if (Math.random() < 0.6) puff(w.x, w.y, '#444', 1);
      if (w.grace > 0) w.grace -= dt;
      else if (!w.dead && !state.ship.down && touches(w.x, w.y, 30)) {
        w.dead = true;
        puff(w.x, w.y, '#ff5a1f', 24);
        impact(w.x, w.y + state.ship.alt, w.kind !== 'cargo' ? config.IMPACT.WRECK_SMALL : config.IMPACT.PLANE_CRASH);
        warn('WRECKAGE CRASHED ONTO US!');
      }
    }
    state.wrecks = state.wrecks.filter((w) => !w.dead && w.y + state.ship.alt < 2500); // (measured from the ship: maps can be very deep)
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
          pop(state, e.x, e.y - 40, 'kill');
          shootDown(state, e);
        }
        continue;
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
    state.mines.length = 0;
    state.wrecks.length = 0;
  };

  // Calm: the fighter breaks off when it is far away (or at once when `force`); mines still far off are cleared.
  // Returns how many are left.
  const withdraw = (far, force) => {
    const e = state.enemy;
    const m = shipMid();
    if (e.heading != null && e.dead <= 0 && (force || Math.hypot(e.x - m.x, e.y - m.y) > far)) e.dead = F.RESPAWN;
    state.mines = state.mines.filter((o) => !force && o.x < B.x1 + 700);
    return (e.heading != null && e.dead <= 0 ? 1 : 0) + state.mines.length;
  };

  const update = (dt) => {
    updateFighter(dt);
    updateMines(dt);
    updateWrecks(dt);
    updateChutes(state, dt);
    updateShells(dt);
    state.ev.warn = Math.max(0, state.ev.warn - dt);
  };

  return { update, reset, withdraw };
}
