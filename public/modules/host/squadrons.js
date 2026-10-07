// More enemy types, sent in waves that ramp up with each lap:
//   Bat swarm   - small fast bats that dive at the ship and LATCH ON (gasbag or a deck), gnawing
//                 holes until the crew swat them (attack button) or they flap away.
//   Bomber      - slow heavy plane crossing overhead, dropping bombs (shoot them down, or the bombs).
//   Dogfighters - a squadron of small skeleton biplanes (after Bomber XXL): they circle the ship in
//                 wide arcs, peel off one at a time for a diving gun pass, loop away and come round
//                 again. Shot down, they spiral into the ground and the pilot bails out.
//   Dread Zeppelin - boss airship on the way home each lap: parks ahead, three turrets, and sends
//                    boarders down grapple lines. Shooting it down patches your ship up.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { keepClear, inRock, scrollSpeed } from './course.js';
import { SHIP_SAMPLES } from './course.js';
import { pop } from './popups.js';
import { flyPlane, smoke, shootDown, angDiff, shoveShip, bumpShip, bounceStep } from './planes.js';

const W = config.WAVES;
const B = SHIP_LAYOUT.bounds;
const rand = (a, b) => a + Math.random() * (b - a);

export function createSquadrons({ state, puff, impact, hitsShip, dropSquad, credit, gnaw, damageHull }) {
  state.bats = [];
  state.bombers = [];
  state.enemyBombs = [];
  state.strafers = [];
  state.boss = null;
  let waveT = W.FIRST_AFTER;
  let nextWave = 'bats';
  let bossLap = 0; // lap the boss last appeared on

  const lap = () => (state.course ? state.course.lap : 1);
  const crew = () => Object.keys(state.players).length;
  const warn = (text, secs = 3) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const touches = (x, y, r) => {
    const sy = y + state.ship.alt;
    return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => hitsShip(x + dx, sy + dy));
  };

  // ---- Spawning ----
  // from = { x, y } to launch from a point (the boss's hangar), and n to set the swarm size.
  const spawnBats = (from = null, count = 0) => {
    const n = count || Math.min(W.BATS_MAX, W.BATS_BASE + (lap() - 1) * W.BATS_PER_LAP + Math.floor(crew() / 4));
    const fromRight = Math.random() < 0.65;
    for (let i = 0; i < n; i++) {
      const [sx, sy] = SHIP_SAMPLES[(Math.random() * SHIP_SAMPLES.length) | 0];
      state.bats.push({
        x: from ? from.x + rand(-40, 40) : fromRight ? B.x1 + 1500 + i * 70 : B.x0 - 1500 - i * 70,
        y: from ? from.y + rand(-30, 30) : rand(-300, 1000) - state.ship.alt,
        vx: 0,
        vy: 0,
        tx: sx,
        ty: sy,
        hp: 1,
        phase: Math.random() * 6,
        delay: i * 0.25,
      });
    }
    warn('BAT SWARM INCOMING!');
  };

  const spawnBomber = () => {
    const fromLeft = Math.random() < 0.5;
    const y = B.y0 - 320 - state.ship.alt;
    state.bombers.push({
      x: fromLeft ? B.x0 - 2600 : B.x1 + 2600,
      y,
      baseY: y,
      vx: (fromLeft ? 1 : -1) * W.BOMBER_SPEED,
      vy: 0,
      heading: fromLeft ? 0 : Math.PI,
      hp: W.BOMBER_HP + (lap() - 1) * 3,
      maxHp: W.BOMBER_HP + (lap() - 1) * 3,
      dropCd: 0,
      hit: 0,
    });
    warn('BOMBER OVERHEAD SOON - DORSAL GUN!');
  };

  // A different boss each lap: Dread Zeppelin, Bat Carrier, then the Iron Dreadnought.
  const BOSSES = {
    dread: { name: 'THE DREAD ZEPPELIN', body: '#3a3036', fin: '#5c1e1e' },
    carrier: { name: 'THE BAT CARRIER', body: '#3b2c4c', fin: '#6a3a8c' },
    iron: { name: 'THE IRON DREADNOUGHT', body: '#4a5056', fin: '#2a2e33' },
  };
  const flagshipStop = () => !!(state.course && state.course.stop && state.course.stop.flagship);
  const spawnBoss = () => {
    // The last stop of a voyage is the Flagship: the Iron Dreadnought at her toughest.
    const flagship = !!(state.course && state.course.stop && state.course.stop.flagship);
    const kind = flagship ? 'iron' : lap() === 1 ? 'dread' : lap() === 2 ? 'carrier' : 'iron';
    const hp = flagship ? W.BOSS_FLAGSHIP_HP : W.BOSS_HP + Math.min(lap() - 1, W.BOSS_HP_LAPS) * W.BOSS_HP_PER_LAP;
    state.boss = {
      kind,
      ...BOSSES[kind],
      ...(flagship ? { name: 'THE FLAGSHIP' } : {}),
      flagship,
      x: B.x1 + 3000,
      y: 250 - state.ship.alt,
      hp,
      maxHp: hp,
      hit: 0,
      bob: 0,
      guns: [0, 1, 2].map((i) => ({ dx: -200 + i * 200, cd: 2 + i * 0.7, hp: W.BOSS_GUN_HP, dead: false })),
      batCd: W.BOSS_BATS_EVERY * 0.5,
      boardCd: W.BOSS_BOARD_EVERY * 0.6,
      leaving: false,
    };
    bossLap = lap();
    warn(BOSSES[kind].name + ' APPROACHES!', 4);
  };

  const D = config.DOGFIGHT;
  const shipMid = () => ({ x: SHIP_LAYOUT.aimPoint.x, y: SHIP_LAYOUT.aimPoint.y - state.ship.alt });
  const nearShip = (x, y, pad) => x > B.x0 - pad && x < B.x1 + pad && y > B.y0 - state.ship.alt - pad && y < B.y1 - state.ship.alt + pad;
  const spawnStrafers = () => {
    const n = Math.min(D.MAX, D.COUNT + (lap() - 1) * D.PER_LAP);
    const side = Math.random() < 0.5 ? -1 : 1;
    const mid = shipMid();
    const dir = Math.random() < 0.5 ? -1 : 1; // which way round they circle
    for (let i = 0; i < n; i++) {
      state.strafers.push({
        x: mid.x + side * (D.ORBIT + 1400 + i * 260),
        y: mid.y - 300 + i * 120 + rand(-80, 80),
        heading: side > 0 ? Math.PI : 0,
        vx: 0,
        vy: 0,
        hp: D.HP,
        max: D.HP,
        mode: 'circle',
        modeT: rand(D.CIRCLE_MIN, D.CIRCLE_MAX) + i * 1.5, // they take turns to attack
        orbit: Math.atan2(-1, side) + i * 0.6,
        dir,
        gunCd: 0,
        shots: 0,
        trail: [],
        bank: 0,
      });
    }
    warn('ENEMY SQUADRON - DOGFIGHTERS INCOMING!');
  };

  const director = (dt) => {
    if (state.ship.down || !Object.keys(state.players).length) return;
    const c = state.course;
    // Boss: once per lap, on the way home.
    if (c && c.progress > W.BOSS_AT && (c.progress < 0.9 || flagshipStop()) && bossLap !== lap() && !state.boss && (!state.tempo || state.tempo.bossOk)) spawnBoss();
    // The trickle between set pieces: small bat swarms. The pacing director (simulation.js) sets how
    // fast this clock runs (0 in a calm) and calls the bigger set pieces itself.
    if ((waveT -= dt * (state.tempo ? state.tempo.rate : 1)) > 0) return;
    const pace = Math.max(0.45, 1 - (lap() - 1) * 0.18) / (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).pace;
    // (Open-sky missions already have the outposts shooting: waves come less often.)
    waveT = rand(W.EVERY_MIN, W.EVERY_MAX) * pace * (c && c.map && c.map.open ? 2 : 1);
    if (state.boss) return; // the boss fight is enough on its own
    spawnBats();
  };

  // ---- Movement and attacks ----
  const updateBats = (dt) => {
    for (const b of state.bats) {
      if ((b.delay -= dt) > 0) continue;
      if (b.latched) {
        updateLatched(b, dt);
        continue;
      }
      b.phase += dt * 14;
      if (b.leaving) {
        b.age += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        continue;
      }
      // Steer toward their chosen spot on the ship, fluttering.
      const tx = b.tx;
      const ty = b.ty - state.ship.alt;
      const dx = tx - b.x;
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = W.BAT_SPEED + (lap() - 1) * 25;
      // Boids: bats nearby push apart (separation), drift to the flock's middle (cohesion) and match
      // each other's heading (alignment) on top of heading for the ship.
      let sx = 0;
      let sy = 0;
      let cx = 0;
      let cy = 0;
      let ax = 0;
      let ay = 0;
      let n = 0;
      for (const o of state.bats) {
        if (o === b || o.delay > 0 || o.latched || o.leaving) continue;
        const ox = o.x - b.x;
        const oy = o.y - b.y;
        const od = Math.hypot(ox, oy);
        if (od > W.BAT_FLOCK_RANGE) continue;
        n++;
        cx += ox;
        cy += oy;
        ax += o.vx;
        ay += o.vy;
        if (od < W.BAT_SEPARATE) {
          sx -= (ox / (od || 1)) * (1 - od / W.BAT_SEPARATE);
          sy -= (oy / (od || 1)) * (1 - od / W.BAT_SEPARATE);
        }
      }
      let wx = (dx / d) * W.BAT_SEEK + sx * 1.4;
      let wy = (dy / d) * W.BAT_SEEK + sy * 1.4;
      if (n) {
        const cd = Math.hypot(cx, cy) || 1;
        const ad = Math.hypot(ax, ay) || 1;
        wx += (cx / cd) * W.BAT_COHESION * 0.5 + (ax / ad) * W.BAT_ALIGN * 0.5;
        wy += (cy / cd) * W.BAT_COHESION * 0.5 + (ay / ad) * W.BAT_ALIGN * 0.5;
      }
      const wd = Math.hypot(wx, wy) || 1;
      b.vx += ((wx / wd) * speed - b.vx) * Math.min(1, dt * 2.5);
      b.vy += ((wy / wd) * speed - b.vy) * Math.min(1, dt * 2.5);
      b.x += b.vx * dt;
      b.y += b.vy * dt + Math.sin(b.phase) * 40 * dt;
      b.y = keepClear(state, b.x, b.y, 30);
      if (!b.dead && !state.ship.down && touches(b.x, b.y, 14)) latchOn(b);
    }
    state.bats = state.bats.filter((b) => !b.dead && b.hp > 0 && Math.abs(b.x - 800) < 6000 && !(b.leaving && b.age > W.BAT_LIFE + 4));
  };

  // A bat that reached the ship picks a landing spot (ship coordinates: lx, ls) and crawls to it:
  // the gasbag's underside (above the catwalk) or the nearest deck floor.
  const latchOn = (b) => {
    const P = SHIP_LAYOUT.platforms;
    const GB = SHIP_LAYOUT.gasbag;
    const cat = P.findIndex((p) => p.id === 'catwalk');
    const sx = b.x;
    const sy = b.y + state.ship.alt;
    // (a little generous: a bat grazing the envelope's skin counts as hitting the gasbag)
    const hitGas = ((sx - GB.cx) / (GB.rx * 1.15)) ** 2 + ((sy - GB.cy) / (GB.ry * 1.2)) ** 2 < 1 && sy < 455;
    b.latched = true;
    b.age = 0;
    b.gnawT = 0;
    b.vx = 0;
    b.vy = 0;
    if (hitGas && Math.random() < W.BAT_GAS_CHANCE) {
      b.kind = 'gas';
      b.d = cat;
      b.lx = Math.max(P[cat].x0 + 40, Math.min(P[cat].x1 - 40, sx));
      b.ls = GB.cy + GB.ry * Math.sqrt(Math.max(0, 1 - ((b.lx - GB.cx) / GB.rx) ** 2)) - 18;
    } else {
      let best = -1;
      P.forEach((p, i) => {
        if (p.id === 'nest' || p.id === 'pod' || p.id === 'hangar' || p.id === 'lamp') return;
        if (best < 0 || Math.abs(p.y - sy) < Math.abs(P[best].y - sy)) best = i;
      });
      b.kind = 'deck';
      b.d = best;
      b.lx = Math.max(P[best].x0 + 40, Math.min(P[best].x1 - 40, sx));
      b.ls = P[best].y - 16;
    }
  };

  // Latched bats live in ship coordinates (lx, ls) and are mirrored into b.x / b.y each frame.
  const updateLatched = (b, dt) => {
    b.phase += dt * 14;
    b.age += dt;
    if (state.ship.down || b.age > W.BAT_LIFE) {
      b.latched = false;
      b.leaving = true;
      b.vx = (Math.random() < 0.5 ? -1 : 1) * W.BAT_SPEED;
      b.vy = -W.BAT_SPEED * 0.6;
      b.age = W.BAT_LIFE;
      return;
    }
    if (!b.landed) {
      const dx = b.lx - b.x;
      const dy = b.ls - (b.y + state.ship.alt);
      const d = Math.hypot(dx, dy);
      const step = Math.min(W.BAT_LATCH_SPEED * dt, d);
      if (d > 4) {
        b.x += (dx / d) * step;
        b.y += (dy / d) * step;
        return;
      }
      b.landed = true;
    }
    // Settled: stuck to the ship (follows its altitude) and gnawing.
    b.x = b.lx;
    b.y = b.ls - state.ship.alt;
    b.gnawT += dt;
    if (b.kind === 'gas' && b.gnawT >= W.BAT_GNAW_GAS) {
      gnaw('gas', b.lx, b.ls, b.d);
      b.age = Math.max(b.age, W.BAT_LIFE - 1.5); // job done: it flaps off soon
      b.gnawT = -999;
    } else if (b.kind === 'deck') {
      damageHull(W.BAT_DECK_DPS * dt);
      if (b.gnawT >= W.BAT_GNAW_DECK) {
        b.gnawT = 0;
        gnaw('deck', b.lx, b.ls, b.d);
      }
    }
  };

  const updateBombers = (dt) => {
    for (const p of state.bombers) {
      p.hit = Math.max(0, p.hit - dt);
      // A heavy plane: it holds its course with very wide, slow turns, climbing and dipping over the terrain.
      const dir = Math.cos(p.heading) >= 0 ? 1 : -1;
      const ax = p.x + dir * 700;
      flyPlane(state, p, ax, keepClear(state, ax, p.baseY, 140, 0, 400), dt, { speed: W.BOMBER_SPEED, turn: W.BOMBER_TURN, turnAvoid: W.BOMBER_TURN * 1.5, fm: W.BOMBER_FM, noScroll: true });
      bounceStep(p, dt);
      bumpShip(state, p, { hitsShip, impact, puff, hw: 150, hh: 25, size: config.BUMP.BOMBER_SIZE, hp: 'hp' });
      // Bombs away while over the ship.
      if (Math.abs(p.x - 800) < 950 && (p.dropCd -= dt) <= 0 && !state.ship.down) {
        p.dropCd = W.BOMB_EVERY;
        state.enemyBombs.push({ x: p.x, y: p.y + 30, vx: p.vx * 0.4, vy: 40, hp: 1 });
      }
    }
    state.bombers = state.bombers.filter((p) => p.hp > 0 && Math.abs(p.x - 800) < 3500);
    for (const b of state.enemyBombs) {
      b.vy += 420 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (inRock(state, b.x, b.y)) {
        b.dead = true;
        puff(b.x, b.y, '#ff7b00', 10);
      } else if (!state.ship.down && touches(b.x, b.y, 12)) {
        b.dead = true;
        puff(b.x, b.y, '#ff5a1f', 16);
        impact(b.x, b.y + state.ship.alt, W.BOMB_IMPACT);
      }
    }
    state.enemyBombs = state.enemyBombs.filter((b) => !b.dead && b.hp > 0 && b.y + state.ship.alt < 2500); // (from the ship: maps can be deep)
  };

  const updateStrafers = (dt) => {
    const mid = shipMid();
    for (const p of state.strafers) {
      p.modeT -= dt;
      let tx;
      let ty;
      let forceTurn = 0;
      if (p.mode === 'circle') {
        // Swing round the ship in a wide circle, chasing a point that runs ahead round it.
        p.orbit += p.dir * D.ORBIT_SPEED * dt;
        tx = mid.x + Math.cos(p.orbit) * D.ORBIT * 1.4;
        ty = mid.y + Math.sin(p.orbit) * D.ORBIT * 0.75 - 150;
        if (p.modeT <= 0) {
          p.mode = 'attack';
          p.shots = D.BURST;
          // A nearly dead dogfighter sometimes gives up on the pass and rams.
          p.ram = p.hp <= 1 && p.hp < p.max * 0.5 && Math.random() < config.FLIGHT.RAM_CHANCE;
          p.aim = p.ram ? { dx: 0, dy: 0 } : { dx: rand(-450, 450), dy: rand(-150, 150) };
        }
      } else if (p.mode === 'attack') {
        // Dive at the ship, guns blazing, then break off before hitting it.
        tx = mid.x + p.aim.dx;
        ty = mid.y + p.aim.dy;
        const dist = Math.hypot(tx - p.x, ty - p.y);
        const ahead = 1.0 * D.SPEED;
        const soon = nearShip(p.x + Math.cos(p.heading) * ahead, p.y + Math.sin(p.heading) * ahead, 200);
        const passed = Math.cos(p.heading) * (tx - p.x) + Math.sin(p.heading) * (ty - p.y) < 0;
        if (p.ram ? passed && dist > 500 : soon || dist < 420) {
          p.ram = false;
          p.mode = Math.random() < D.LOOP_CHANCE ? 'loop' : 'extend';
          p.modeT = p.mode === 'loop' ? (Math.PI * 2) / D.TURN : 1.6;
          p.loopDir = Math.cos(p.heading) >= 0 ? -1 : 1; // pull up and over
        }
        // Guns along the nose, in a short burst.
        p.gunCd -= dt;
        const off = angDiff(Math.atan2(ty - p.y, tx - p.x), p.heading);
        if (p.shots > 0 && p.gunCd <= 0 && Math.abs(off) < 0.35 && dist < D.FIRE_RANGE && !state.ship.down) {
          p.shots -= 1;
          p.gunCd = D.SHOT_EVERY;
          const helm = Object.values(state.players).find((q) => q.lock === 'Helm');
          const evading = helm && (Math.abs(helm.jy) > 0.2 || Math.abs(state.ship.speed) > 0.3);
          const miss = Math.random() < 0.25 || (evading && Math.random() < 0.4);
          const dir = p.heading + Math.max(-0.15, Math.min(0.15, off)) + (miss ? (Math.random() < 0.5 ? -1 : 1) * 0.3 : rand(-0.05, 0.05));
          const nx = p.x + Math.cos(p.heading) * 30;
          const ny = p.y + Math.sin(p.heading) * 30;
          state.bullets.push({ x: nx, y: ny, vx: Math.cos(dir) * D.BULLET_SPEED, vy: Math.sin(dir) * D.BULLET_SPEED, miss, life: 3 });
          if (state.flashes) state.flashes.push({ x: nx, y: ny, ang: dir, t: 0.06, color: '#ffb3b3', size: 0.6 });
        }
      } else if (p.mode === 'loop') {
        // A loop-the-loop away from the ship.
        forceTurn = p.loopDir * D.TURN;
        tx = p.x + Math.cos(p.heading) * 500;
        ty = p.y + Math.sin(p.heading) * 500;
        if (p.modeT <= 0) p.mode = 'extend', (p.modeT = 1.2);
      } else {
        // Extend away past the ship, then rejoin the circle.
        tx = p.x + Math.cos(p.heading) * 800;
        ty = p.y + Math.sin(p.heading) * 800 - 200;
        if (p.modeT <= 0) {
          p.mode = 'circle';
          p.modeT = rand(D.CIRCLE_MIN, D.CIRCLE_MAX) + (state.strafers.length - 1) * 1.2;
          p.orbit = Math.atan2((p.y - mid.y) / 0.75, (p.x - mid.x) / 1.4);
        }
      }
      const px0 = p.x;
      const py0 = p.y;
      flyPlane(state, p, tx, ty, dt, { speed: D.SPEED, turn: D.TURN, turnAvoid: D.TURN_AVOID, nearShip: p.ram ? null : nearShip, midY: mid.y, forceTurn, fm: D, max: p.max });
      smoke(p, p.max, puff);
      if (inRock(state, p.x, p.y)) {
        p.hp = 0;
        state.kills += 1;
        puff(p.x, p.y, '#ff5a1f', 22);
        puff(p.x, p.y, '#555', 10);
        pop(state, p.x, p.y - 50, 'kill');
        continue;
      }
      // Flew into the ship.
      if (!state.ship.down && (touches(p.x, p.y, 24) || touches((p.x + px0) / 2, (p.y + py0) / 2, 24))) {
        p.hp = 0;
        shootDown(state, p, 'biplane');
        puff(p.x, p.y, '#ff5a1f', 22);
        impact(p.x, p.y + state.ship.alt, config.IMPACT.WRECK_SMALL);
        shoveShip(state, p, p.ram ? 1.5 : 1);
        warn('A DOGFIGHTER RAMMED US!', 2);
      }
    }
    state.strafers = state.strafers.filter((p) => p.hp > 0 && Math.abs(p.x - 800) < 7000);
  };

  const updateBoss = (dt) => {
    const z = state.boss;
    if (!z) return;
    z.hit = Math.max(0, z.hit - dt);
    z.bob += dt;
    // Leave when the ship gets home, or after a crash.
    const c = state.course;
    if (c && (c.progress < 0.5 || c.progress > 0.97) && !z.flagship) z.leaving = true; // (the Flagship never leaves)
    const homeX = z.leaving ? B.x1 + 4000 : W.BOSS_STATION_X;
    z.x += Math.sign(homeX - z.x) * Math.min(Math.abs(homeX - z.x), 220 * dt);
    const wantY = keepClear(state, z.x, 250 - state.ship.alt + Math.sin(z.bob * 0.6) * 60, 260, 0, 500);
    z.y += (wantY - z.y) * Math.min(1, dt * 1.2);
    bounceStep(z, dt);
    bumpShip(state, z, { hitsShip, impact, puff, hw: 330, hh: 150, size: config.BUMP.BOSS_SIZE, hp: 'hp' });
    if (z.leaving && z.x > B.x1 + 3800) {
      state.boss = null;
      return;
    }
    if (z.x > W.BOSS_STATION_X + 400 || state.ship.down) return; // not in range yet
    // Turrets.
    for (const g of z.guns) {
      if (g.dead || (g.cd -= dt) > 0) continue;
      g.cd = W.BOSS_FIRE_EVERY * rand(0.8, 1.2);
      const gx = z.x + g.dx;
      const gy = z.y + 150;
      const tx = rand(300, 1400);
      const ty = rand(200, 800) - state.ship.alt;
      const d = Math.hypot(tx - gx, ty - gy) || 1;
      const helm = Object.values(state.players).find((q) => q.lock === 'Helm');
      const miss = helm && Math.abs(helm.jy) > 0.3 && Math.random() < 0.35;
      if (z.kind === 'iron' && Math.random() < 0.5) {
        // The Iron Dreadnought's turrets also fire homing rockets.
        state.rockets.push({ x: gx, y: gy, ang: Math.atan2(ty - gy, tx - gx), life: config.COURSE.ROCKET_LIFE, hp: 1 });
      } else state.bullets.push({ x: gx, y: gy, vx: ((tx - gx) / d) * 470, vy: ((ty - gy) / d) * 470 + (miss ? -200 : 0), miss, life: 4 });
      puff(gx, gy, '#555', 4);
    }
    // The Bat Carrier (and the Dreadnought, less often) launch bat swarms from the hangar.
    if (z.kind !== 'dread' && (z.batCd -= dt) <= 0) {
      z.batCd = W.BOSS_BATS_EVERY * (z.kind === 'carrier' ? 0.6 : 1.4);
      spawnBats({ x: z.x, y: z.y + 120 }, 3 + lap());
      warn('BATS FROM THE ZEPPELIN!');
    }
    // Boarding lines.
    if ((z.boardCd -= dt) <= 0 && !state.boarders.length) {
      z.boardCd = W.BOSS_BOARD_EVERY;
      dropSquad(SHIP_LAYOUT.boarderEntryPoints[SHIP_LAYOUT.boarderEntryPoints.length - 1].x, -200 - state.ship.alt);
      warn('BOARDING LINES! RAIDERS INCOMING!');
    }
  };

  // ---- Crew shells ----
  const shellHits = () => {
    const dmg = config.GUNS.DAMAGE;
    for (const s of state.shells) {
      if (s.life <= 0) continue;
      for (const b of state.bats) {
        if (b.hp > 0 && !b.latched && Math.hypot(s.x - b.x, s.y - b.y) < 26) {
          s.life = 0;
          b.hp = 0;
          state.kills += 1;
          credit(s, 'bat');
          puff(b.x, b.y, '#4a3b5c', 8);
          pop(state, b.x, b.y - 20, 'bat', '#c9a0ff', 0.7);
          break;
        }
      }
      if (s.life <= 0) continue;
      for (const b of state.enemyBombs) {
        if (b.hp > 0 && Math.hypot(s.x - b.x, s.y - b.y) < 22) {
          s.life = 0;
          b.hp = 0;
          puff(b.x, b.y, '#ff7b00', 12);
          break;
        }
      }
      if (s.life <= 0) continue;
      for (const p of state.strafers) {
        if (p.hp > 0 && Math.hypot(s.x - p.x, s.y - p.y) < 44) {
          s.life = 0;
          p.hp -= dmg;
          puff(s.x, s.y, '#ffcf40', 6);
          if (p.hp <= 0) {
            state.kills += 1;
            credit(s);
            puff(p.x, p.y, '#ff5a1f', 22);
            pop(state, p.x, p.y - 40, 'kill');
            shootDown(state, p, 'biplane');
          }
          break;
        }
      }
      if (s.life <= 0) continue;
      for (const p of state.bombers) {
        if (p.hp > 0 && Math.abs(s.x - p.x) < 120 && Math.abs(s.y - p.y) < 40) {
          s.life = 0;
          p.hp -= dmg;
          p.hit = 0.15;
          puff(s.x, s.y, '#ffcf40', 8);
          if (p.hp <= 0) {
            state.kills += 1;
            credit(s, 'bomber');
            puff(p.x, p.y, '#ff5a1f', 30);
            pop(state, p.x, p.y - 60, 'kill', '#ffd23f', 1.4);
            state.wrecks.push({ x: p.x, y: p.y, vx: p.vx, vy: -40, spin: 0, kind: 'cargo' });
            warn('BOMBER DOWN!', 2);
          }
          break;
        }
      }
      const z = state.boss;
      // Its turrets can be shot off one at a time.
      const gun = z && s.life > 0 && z.guns.find((g) => !g.dead && Math.hypot(s.x - (z.x + g.dx), s.y - (z.y + 168)) < 36);
      if (gun) {
        s.life = 0;
        gun.hp -= dmg;
        puff(s.x, s.y, '#ffcf40', 8);
        if (gun.hp <= 0) {
          gun.dead = true;
          z.hp -= W.BOSS_GUN_BONUS;
          puff(z.x + gun.dx, z.y + 168, '#ff5a1f', 18);
          pop(state, z.x + gun.dx, z.y + 120, 'kill', '#ffd23f', 1);
          credit(s);
        }
      }
      if (s.life > 0 && z && Math.abs(s.x - z.x) < 330 && s.y > z.y - 150 && s.y < z.y + 190) {
        s.life = 0;
        z.hp -= dmg;
        z.hit = 0.12;
        puff(s.x, s.y, '#ffcf40', 8);
        if (z.hp <= 0) {
          state.kills += 5;
          credit(s, 'boss');
          for (let k = 0; k < 6; k++) puff(z.x + rand(-250, 250), z.y + rand(-120, 150), '#ff5a1f', 20);
          pop(state, z.x, z.y - 160, 'boss', '#ff5a1f', 2.2);
          state.wrecks.push({ x: z.x, y: z.y, vx: -60, vy: -20, spin: 0, kind: 'cargo' });
          state.boss = null;
          state.bossDownLap = lap(); // (the Flagship stop needs her sunk before the beacon counts)
          // Spoils of war: patch the ship up.
          state.ship.hull = Math.min(100, state.ship.hull + W.BOSS_REWARD_HULL);
          state.ship.gas = Math.min(100, state.ship.gas + 30);
          warn(z.name.replace('THE ', '') + ' DOWN! SALVAGE PATCHES THE HULL!', 4);
        }
      }
    }
  };

  const update = (dt) => {
    director(dt);
    updateBats(dt);
    updateBombers(dt);
    updateStrafers(dt);
    updateBoss(dt);
    shellHits();
  };

  const reset = () => {
    state.bats.length = 0;
    state.bombers.length = 0;
    state.enemyBombs.length = 0;
    state.strafers.length = 0;
    if (state.boss) state.boss.leaving = true;
    waveT = Math.max(waveT, 12);
  };

  // A brand-new game: no boss yet, first wave after the usual wait.
  const restart = () => {
    reset();
    state.boss = null;
    bossLap = 0;
    state.bossDownLap = 0;
    waveT = W.FIRST_AFTER;
    nextWave = 'bats';
  };

  // A set piece: a big swarm (the director picks when).
  const spawnBigSwarm = () => spawnBats(null, Math.min(W.BATS_MAX * 2, Math.round((W.BATS_BASE + (lap() - 1) * W.BATS_PER_LAP + Math.floor(crew() / 4)) * config.PACING.SWARM_MULT)));
  // Calm: unlatched bats fly off; bombers and dogfighters further than `far` from the ship (or all of
  // them when `force`) go. Returns how many bombers and dogfighters are still about.
  const withdraw = (far, force) => {
    const m = shipMid();
    for (const b of state.bats) {
      if (b.latched || b.leaving || b.delay > 0) continue;
      b.leaving = true;
      b.age = W.BAT_LIFE;
      b.vx = (b.x < m.x ? -1 : 1) * W.BAT_SPEED;
      b.vy = -W.BAT_SPEED * 0.5;
    }
    const stays = (p) => !force && Math.hypot(p.x - m.x, p.y - m.y) < far;
    state.bombers = state.bombers.filter(stays);
    state.strafers = state.strafers.filter(stays);
    return state.bombers.length + state.strafers.length;
  };
  // Is this mission's boss still to come, and close? (The director holds its next set piece for the boss.)
  const bossSoon = () => {
    const c = state.course;
    return !!c && !state.boss && bossLap !== lap() && c.progress > W.BOSS_AT - config.PACING.BOSS_LEAD && (c.progress < 0.9 || flagshipStop());
  };
  return { update, reset, restart, bossSoon, withdraw, spawnBigSwarm, spawnBats, spawnBomber, spawnBoss, spawnStrafers };
}
