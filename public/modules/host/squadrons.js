// More enemy types, sent in waves that ramp up with each lap:
//   Bat swarm   - small fast bats that dive at the ship and burst on contact.
//   Bomber      - slow heavy plane crossing overhead, dropping bombs (shoot them down, or the bombs).
//   Strafers    - pairs of fast skeleton fighters making straight passes above or below the ship.
//   Dread Zeppelin - boss airship on the way home each lap: parks ahead, three turrets, and sends
//                    boarders down grapple lines. Shooting it down patches your ship up.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { keepClear, inRock, scrollSpeed } from './course.js';
import { SHIP_SAMPLES } from './course.js';
import { pop } from './popups.js';

const W = config.WAVES;
const B = SHIP_LAYOUT.bounds;
const rand = (a, b) => a + Math.random() * (b - a);

export function createSquadrons({ state, puff, impact, hitsShip, dropSquad, credit }) {
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
  const spawnBoss = () => {
    const kind = lap() === 1 ? 'dread' : lap() === 2 ? 'carrier' : 'iron';
    const hp = W.BOSS_HP + (lap() - 1) * W.BOSS_HP_PER_LAP;
    state.boss = {
      kind,
      ...BOSSES[kind],
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

  const spawnStrafers = () => {
    const fromLeft = Math.random() < 0.5;
    const above = Math.random() < 0.6;
    const y = (above ? B.y0 - 220 : B.y1 + 200) - state.ship.alt;
    for (let i = 0; i < 2; i++) {
      state.strafers.push({
        x: (fromLeft ? B.x0 - 2600 : B.x1 + 2600) - (fromLeft ? 1 : -1) * i * 320,
        y: y + i * (above ? -70 : 70),
        offY: (above ? B.y0 - 220 : B.y1 + 200) + i * (above ? -70 : 70), // height relative to the ship
        vx: (fromLeft ? 1 : -1) * W.STRAFER_SPEED,
        hp: W.STRAFER_HP,
        above,
        gunCd: 0,
      });
    }
    warn(above ? 'STRAFERS - HIGH! DORSAL GUN!' : 'STRAFERS - LOW! VENTRAL GUN!');
  };

  const director = (dt) => {
    if (state.ship.down || !Object.keys(state.players).length) return;
    const c = state.course;
    // Boss: once per lap, on the way home.
    if (c && c.progress > W.BOSS_AT && c.progress < 0.9 && bossLap !== lap() && !state.boss) spawnBoss();
    // Waves of bats and bombers, coming faster each lap.
    if ((waveT -= dt * (state.tempo && state.tempo.phase === 'calm' ? 0 : state.tempo && state.tempo.phase === 'peak' ? 1.7 : 1)) > 0) return;
    const pace = Math.max(0.45, 1 - (lap() - 1) * 0.18) / (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).pace;
    // (Open-sky missions already have the outposts shooting: waves come less often.)
    waveT = rand(W.EVERY_MIN, W.EVERY_MAX) * pace * (c && c.map && c.map.open ? 2 : 1);
    if (state.boss) return; // the boss fight is enough on its own
    const bomberOk = lap() > 1 || (c && c.progress > 0.25);
    const strafersOk = lap() > 1 || (c && c.progress > 0.5);
    if (nextWave === 'bomber' && bomberOk && !state.bombers.length) spawnBomber();
    else if (nextWave === 'strafers' && strafersOk && !state.strafers.length) spawnStrafers();
    else spawnBats();
    nextWave = nextWave === 'bats' ? 'bomber' : nextWave === 'bomber' ? 'strafers' : 'bats';
  };

  // ---- Movement and attacks ----
  const updateBats = (dt) => {
    for (const b of state.bats) {
      if ((b.delay -= dt) > 0) continue;
      b.phase += dt * 14;
      // Steer toward their chosen spot on the ship, fluttering.
      const tx = b.tx;
      const ty = b.ty - state.ship.alt;
      const dx = tx - b.x;
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const speed = W.BAT_SPEED + (lap() - 1) * 25;
      b.vx += ((dx / d) * speed - b.vx) * Math.min(1, dt * 2.5);
      b.vy += ((dy / d) * speed - b.vy) * Math.min(1, dt * 2.5);
      b.x += b.vx * dt;
      b.y += b.vy * dt + Math.sin(b.phase) * 40 * dt;
      b.y = keepClear(state, b.x, b.y, 30);
      if (!b.dead && !state.ship.down && touches(b.x, b.y, 14)) {
        b.dead = true;
        puff(b.x, b.y, '#4a3b5c', 10);
        impact(b.x, b.y + state.ship.alt, W.BAT_IMPACT);
      }
    }
    state.bats = state.bats.filter((b) => !b.dead && b.hp > 0 && Math.abs(b.x - 800) < 6000);
  };

  const updateBombers = (dt) => {
    for (const p of state.bombers) {
      p.x += p.vx * dt;
      p.hit = Math.max(0, p.hit - dt);
      p.y += (keepClear(state, p.x, p.baseY, 140, 0, 400) - p.y) * Math.min(1, dt * 2);
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
    state.enemyBombs = state.enemyBombs.filter((b) => !b.dead && b.hp > 0 && b.y < 2500);
  };

  const updateStrafers = (dt) => {
    for (const p of state.strafers) {
      // They track the ship's height and swoop in toward it as they pass, but can only climb or
      // dive so fast: if the ground rises too steeply they fly into it.
      // (On screen the ship's own speed is subtracted, but they always cross at a decent clip.)
      let rel = p.vx - scrollSpeed(state);
      if (Math.sign(rel) !== Math.sign(p.vx) || Math.abs(rel) < 300) rel = Math.sign(p.vx) * 300;
      p.x += rel * dt;
      const swoop = (p.above ? 1 : -1) * 160 * Math.exp(-(((p.x - 800) / 900) ** 2));
      const want = keepClear(state, p.x + Math.sign(p.vx) * 250, p.offY - state.ship.alt + swoop, 90, 0, 300);
      const climb = W.STRAFER_CLIMB * dt;
      p.y += Math.max(-climb, Math.min(climb, want - p.y));
      p.vy = Math.max(-W.STRAFER_CLIMB, Math.min(W.STRAFER_CLIMB, (want - p.y) / Math.max(dt, 1e-3)));
      if (inRock(state, p.x, p.y)) {
        p.hp = 0;
        state.kills += 1;
        puff(p.x, p.y, '#ff5a1f', 22);
        puff(p.x, p.y, '#555', 10);
        pop(state, p.x, p.y - 50, 'kill');
        continue;
      }
      // Spray bullets at the ship while passing over/under it.
      if (Math.abs(p.x - 800) < 1000 && !state.ship.down && (p.gunCd -= dt) <= 0) {
        p.gunCd = W.STRAFER_FIRE_EVERY;
        const tx = p.x + p.vx * 0.5;
        const ty = (p.above ? 260 : 820) - state.ship.alt;
        const d = Math.hypot(tx - p.x, ty - p.y) || 1;
        const helm = Object.values(state.players).find((q) => q.lock === 'Helm');
        const miss = Math.random() < 0.35 || (helm && Math.abs(helm.jy) > 0.3 && Math.random() < 0.35);
        state.bullets.push({ x: p.x, y: p.y, vx: ((tx - p.x) / d) * 520, vy: ((ty - p.y) / d) * 520 + (miss ? (p.above ? -260 : 260) : 0), miss, life: 3 });
      }
    }
    state.strafers = state.strafers.filter((p) => p.hp > 0 && Math.abs(p.x - 800) < 3200);
  };

  const updateBoss = (dt) => {
    const z = state.boss;
    if (!z) return;
    z.hit = Math.max(0, z.hit - dt);
    z.bob += dt;
    // Leave when the ship gets home, or after a crash.
    const c = state.course;
    if (c && (c.progress < 0.5 || c.progress > 0.97)) z.leaving = true;
    const homeX = z.leaving ? B.x1 + 4000 : W.BOSS_STATION_X;
    z.x += Math.sign(homeX - z.x) * Math.min(Math.abs(homeX - z.x), 220 * dt);
    const wantY = keepClear(state, z.x, 250 - state.ship.alt + Math.sin(z.bob * 0.6) * 60, 260, 0, 500);
    z.y += (wantY - z.y) * Math.min(1, dt * 1.2);
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
        if (b.hp > 0 && Math.hypot(s.x - b.x, s.y - b.y) < 26) {
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
        if (p.hp > 0 && Math.abs(s.x - p.x) < 60 && Math.abs(s.y - p.y) < 28) {
          s.life = 0;
          p.hp -= dmg;
          puff(s.x, s.y, '#ffcf40', 6);
          if (p.hp <= 0) {
            state.kills += 1;
            credit(s);
            puff(p.x, p.y, '#ff5a1f', 22);
            pop(state, p.x, p.y - 40, 'kill');
            state.wrecks.push({ x: p.x, y: p.y, vx: p.vx * 0.5, vy: -40, spin: 0, kind: 'fighter' });
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
    waveT = W.FIRST_AFTER;
    nextWave = 'bats';
  };

  return { update, reset, restart, spawnBats, spawnBomber, spawnBoss, spawnStrafers };
}
