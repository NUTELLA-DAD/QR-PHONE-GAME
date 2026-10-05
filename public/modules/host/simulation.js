import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

export function createSimulation() {
  let socket = null;
  const state = {
    players: {},
    ship: { alt: 0, speed: 0.3, hull: 100, shake: 0, down: 0, press: 70 },
    enemy: { ang: 0, x: -200, y: 300, vx: 1, vy: 0, hp: 5, fire: 2.5, dead: 0 },
    shells: [],
    bullets: [],
    puffs: [],
    breaches: [],
    fires: [],
    boarders: [],
    ev: { t: 20, warn: 0 },
    kills: 0,
    scroll: 0,
    GUNS: {
      'Port Cannon': { bx: SHIP_LAYOUT.gunMounts['Port Cannon'].bx, by: SHIP_LAYOUT.gunMounts['Port Cannon'].by, aim: Math.PI, cd: 0, ammo: 6, max: 8, empty: 0 },
      'Roof Gun': { bx: SHIP_LAYOUT.gunMounts['Roof Gun'].bx, by: SHIP_LAYOUT.gunMounts['Roof Gun'].by, aim: -Math.PI / 2, cd: 0, ammo: 6, max: 8, empty: 0 },
    },
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const taken = (name) => Object.values(state.players).some((q) => q.lock === name);

  const getHelm = () => Object.values(state.players).find((q) => q.lock === 'Helm');

  const workTarget = (player) => {
    if (player.lock || player.climb || player.fall) return null;
    const floorIndex = SHIP_LAYOUT.floors.findIndex((f) => Math.abs(player.y - f) < 6);
    if (floorIndex < 0) return null;
    const revived = Object.values(state.players).find((q) => q !== player && q.ko > 0 && !q.fall && Math.abs(q.y - player.y) < 8 && Math.abs(q.x - player.x) < 65);
    if (revived) return { kind: 'revive', obj: revived };
    const fire = state.fires.find((o) => o.d === floorIndex && Math.abs(o.x - player.x) < 70);
    if (fire) return { kind: 'fire', obj: fire };
    const breach = state.breaches.find((o) => o.d === floorIndex && Math.abs(o.x - player.x) < 70);
    if (breach) return { kind: 'breach', obj: breach, need: player.carry !== 'patch' };
    return null;
  };

  const puff = (x, y, color, count = 6) => {
    for (let i = 0; i < count; i++) {
      state.puffs.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, max: 0.5, c: color });
    }
  };

  const emitPlayerUi = (playerId, ui) => {
    if (socket && !state.players[playerId]?.bot) socket.emit('host:ui', { id: playerId, ui });
  };

  const setSocket = (nextSocket) => {
    socket = nextSocket;
  };

  const update = (dt) => {
    for (const player of Object.values(state.players)) {
      if (player.bot && (player.t -= dt) <= 0) {
        player.t = 1 + Math.random() * 2;
        player.jx = Math.random() < 0.3 ? 0 : Math.random() * 2 - 1;
        player.jy = Math.random() < 0.35 ? (Math.random() < 0.5 ? -1 : 1) : 0;
        if (Math.random() < 0.15) player.actT = performance.now();
      }
      if (player.fall) {
        player.y += 260 * dt;
        if (player.y >= SHIP_LAYOUT.floors[0]) {
          player.y = SHIP_LAYOUT.floors[0];
          player.fall = false;
        }
        continue;
      }
      if (player.ko > 0) {
        player.lock = null;
        player.fire = false;
        player.actQ = false;
        player.moving = false;
        player.climb = false;
        if ((player.ko -= dt) <= 0) {
          player.ko = 0;
          player.prog = 0;
        }
        if (player.uk !== 'ko') {
          player.uk = 'ko';
          if (!player.bot) player.ui = { ko: true };
        }
        continue;
      }
      if (player.leaveQ) {
        player.leaveQ = false;
        player.lock = null;
        player.fire = false;
      }
      if (player.connected === false) {
        player.lock = null;
        player.fire = false;
      }
      const station = !player.lock ? SHIP_LAYOUT.stations.find((s) => Math.abs(player.y - SHIP_LAYOUT.floors[s.d]) < 6 && Math.abs(player.x - s.x) < 55) : null;
      const target = player.lock ? null : workTarget(player);
      const boarder = player.lock ? null : state.boarders.find((b) => !b.fall && Math.abs(b.y - player.y) < 20 && Math.abs(b.x - player.x) < 80);

      if (player.lock) {
        player.moving = false;
        player.climb = false;
        const gun = state.GUNS[player.lock];
        if (player.lock === 'Helm') {
          state.ship.speed = clamp(state.ship.speed + player.jx * dt * 0.6, 0, 1);
          state.ship.alt = clamp(state.ship.alt - player.jy * 130 * (0.4 + 0.6 * Math.min(1, state.ship.press / 50)) * dt, -90, 90);
        } else if (player.lock === 'Boiler') {
          state.ship.press = clamp(state.ship.press + (player.fire ? 16 * dt : 0) + (player.actQ ? 5 : 0), 0, 100);
        } else if (gun) {
          gun.cd = Math.max(0, gun.cd - dt);
          if (Math.hypot(player.jx, player.jy) > 0.25) gun.aim = Math.atan2(player.jy, player.jx);
          if ((player.actQ || player.fire) && gun.cd <= 0 && !state.ship.down) {
            if (gun.ammo <= 0) {
              gun.cd = 0.5;
              gun.empty = 0.8;
            } else {
              gun.ammo -= 1;
              gun.cd = 0.55;
              const angle = gun.aim;
              state.shells.push({
                x: gun.bx + Math.cos(angle) * 60,
                y: gun.by - state.ship.alt + Math.sin(angle) * 60,
                vx: Math.cos(angle) * 950,
                vy: Math.sin(angle) * 950,
                life: 1.6,
              });
              puff(gun.bx + Math.cos(angle) * 64, gun.by - state.ship.alt + Math.sin(angle) * 64, '#ffe9a8', 4);
            }
          }
        }
        player.face = player.lock === 'Port Cannon' ? -1 : 1;
        player.actQ = false;
      } else {
        const ladder = SHIP_LAYOUT.ladders.find((l) => Math.abs(player.x - l) < 30);
        if (ladder && Math.abs(player.jy) > 0.4) {
          player.climb = true;
          player.x += (ladder - player.x) * Math.min(1, dt * 10);
          player.y = clamp(player.y + player.jy * 170 * dt, SHIP_LAYOUT.floors[0], SHIP_LAYOUT.floors[2]);
        } else {
          player.climb = false;
          player.x = clamp(player.x + player.jx * 230 * dt, SHIP_LAYOUT.hull.x0, SHIP_LAYOUT.hull.x1);
          if (Math.abs(player.jx) > 0.15) player.face = player.jx < 0 ? -1 : 1;
          const floor = SHIP_LAYOUT.floors.reduce((best, value) => Math.abs(value - player.y) < Math.abs(best - player.y) ? value : best);
          player.y += (floor - player.y) * Math.min(1, dt * 12);
        }
        player.moving = !player.climb && Math.abs(player.jx) > 0.15;

        if (target && !target.need && player.fire && !boarder) {
          const object = target.obj;
          object.prog = (object.prog || 0) + dt / (target.kind === 'fire' ? 2 : target.kind === 'breach' ? 1.5 : 1.2);
          if (object.prog >= 1) {
            object.prog = 0;
            if (target.kind === 'fire') state.fires.splice(state.fires.indexOf(object), 1);
            else if (target.kind === 'breach') {
              state.breaches.splice(state.breaches.indexOf(object), 1);
              player.carry = null;
              state.ship.hull = Math.min(100, state.ship.hull + 3);
            }
            puff(object.x, player.y - 50, '#8fe388', 10);
          }
        }

        if (player.actQ) {
          player.actQ = false;
          const gunAtStation = station && state.GUNS[station.n];
          if (boarder) {
            boarder.hp -= 1;
            boarder.hit = 0.25;
            boarder.x = clamp(boarder.x + Math.sign(boarder.x - player.x || 1) * 45, SHIP_LAYOUT.hull.x0, SHIP_LAYOUT.hull.x1);
            puff(boarder.x, boarder.y - 40, '#fff', 6);
            if (boarder.hp <= 0) {
              puff(boarder.x, boarder.y - 40, '#ffcf40', 14);
              state.boarders.splice(state.boarders.indexOf(boarder), 1);
            }
          } else if (target && !target.need) {
            // no-op, handled by fire interaction
          } else if (gunAtStation && player.carry === 'ammo' && gunAtStation.ammo < gunAtStation.max) {
            gunAtStation.ammo = Math.min(gunAtStation.max, gunAtStation.ammo + 4);
            player.carry = null;
            puff(station.x, player.y - 60, '#ffd23f', 8);
          } else if (station && station.n === 'Ammo Hold' && !player.carry) {
            player.carry = 'ammo';
          } else if (station && station.n === 'Repairs' && !player.carry) {
            player.carry = 'patch';
          } else if (station && !taken(station.n) && (station.n === 'Helm' || station.n === 'Boiler' || gunAtStation)) {
            player.lock = station.n;
            player.x = station.x;
          } else {
            player.actT = performance.now();
          }
        }
      }

      const stationName = player.lock || (station && station.n);
      const gun = state.GUNS[stationName];
      const kind = stationName === 'Helm' ? 'helm' : gun ? 'gun' : stationName === 'Boiler' ? 'boiler' : null;
      const takenBySomeone = !player.lock && !!stationName && taken(stationName);
      let label = 'Hey!';
      let hold = false;
      if (player.lock) {
        label = kind === 'gun' ? 'FIRE!' : kind === 'boiler' ? 'STOKE!' : 'Honk!';
        hold = kind === 'gun' || kind === 'boiler';
      } else if (boarder) {
        label = 'Whack!';
      } else if (target) {
        label = target.kind === 'revive' ? `Revive ${target.obj.name}` : target.kind === 'fire' ? 'Put out fire' : target.need ? 'Need a patch kit' : 'Patch hole';
        hold = !target.need;
      } else if (gun && player.carry === 'ammo' && gun.ammo < gun.max) {
        label = 'Load ' + stationName;
      } else if (stationName === 'Ammo Hold' && !player.carry) {
        label = 'Grab ammo';
      } else if (stationName === 'Repairs' && !player.carry) {
        label = 'Grab patch kit';
      } else if (kind && !takenBySomeone) {
        label = 'Take ' + stationName;
      }
      const ammoText = gun ? gun.ammo : null;
      const key = [stationName, kind, !!player.lock, takenBySomeone, label, ammoText, player.carry || '', hold].join('|');
      if (key !== player.uk) {
        player.uk = key;
        if (!player.bot) {
          player.ui = { station: stationName || null, kind, locked: !!player.lock, taken: takenBySomeone, label, ammo: ammoText, carry: player.carry || null, hold };
          emitPlayerUi(player.id, player.ui);
        }
      }
      if (player.lock === 'Boiler' && !player.bot && ((player.pt = (player.pt || 0) - dt) <= 0)) {
        player.pt = 0.2;
        player.ui = { ...(player.ui || {}), tick: 1, pressure: state.ship.press };
        emitPlayerUi(player.id, player.ui);
      }
    }

    state.ship.press = clamp(state.ship.press - (2 + state.ship.speed * 6) * dt, 0, 100);
    if (state.ship.press >= 96) {
      state.ship.press = 72;
      puff(425, SHIP_LAYOUT.floors[2] - 70, '#fff', 14);
    }
    const maxSpeed = clamp(state.ship.press / 50, 0.05, 1);
    if (state.ship.speed > maxSpeed) state.ship.speed += (maxSpeed - state.ship.speed) * Math.min(1, dt * 2);

    for (const gun of Object.values(state.GUNS)) gun.empty = Math.max(0, gun.empty - dt);
    if (!getHelm()) {
      state.ship.speed += (0.3 - state.ship.speed) * dt * 0.5;
      state.ship.alt *= 1 - dt * 0.4;
    }
    state.ship.shake = Math.max(0, state.ship.shake - dt);

    if (state.ship.down > 0) {
      state.ship.down -= dt;
      if (state.ship.down <= 0) {
        state.ship.hull = 100;
        state.breaches.length = 0;
        state.fires.length = 0;
        state.boarders.length = 0;
        for (const player of Object.values(state.players)) player.ko = 0;
      }
    }

    if (state.enemy.dead > 0) {
      state.enemy.dead -= dt;
      if (state.enemy.dead <= 0) {
        state.enemy.hp = 5 + Math.floor(Object.keys(state.players).length / 4);
        state.enemy.ang = Math.random() * 6.28;
      }
    } else {
      state.enemy.ang += dt * 0.55;
      const nx = 800 + Math.cos(state.enemy.ang) * 820;
      const ny = 380 + Math.sin(state.enemy.ang * 1.3) * 330;
      state.enemy.vx = nx - state.enemy.x;
      state.enemy.vy = ny - state.enemy.y;
      state.enemy.x = nx;
      state.enemy.y = ny;
      if (state.enemy.hp <= 2 && Math.random() < 0.5) puff(state.enemy.x, state.enemy.y, '#555', 1);
      if ((state.enemy.fire -= dt) <= 0 && !state.ship.down) {
        state.enemy.fire = (2 + Math.random() * 1.5) * (1.2 - Math.min(0.5, Object.keys(state.players).length * 0.04));
        const helm = getHelm();
        const evading = helm && (Math.abs(helm.jy) > 0.2 || state.ship.speed > 0.3);
        const miss = evading && Math.random() < 0.5;
        const tx = 800 + (Math.random() - 0.5) * 500;
        const ty = 560 - state.ship.alt + (miss ? (Math.random() < 0.5 ? -1 : 1) * 520 : 0);
        const d = Math.hypot(tx - state.enemy.x, ty - state.enemy.y) || 1;
        state.bullets.push({ x: state.enemy.x, y: state.enemy.y, vx: ((tx - state.enemy.x) / d) * 430, vy: ((ty - state.enemy.y) / d) * 430, miss, life: 4 });
      }
    }

    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (!bullet.miss && bullet.x > 250 && bullet.x < 1350 && bullet.y > 200 - state.ship.alt && bullet.y < 820 - state.ship.alt) {
        bullet.life = 0;
        state.ship.shake = 0.35;
        puff(bullet.x, bullet.y, '#ff7b00', 8);
        const sy = bullet.y + state.ship.alt;
        if (sy > 350) {
          const floorIndex = [0, 1, 2].reduce((best, i) => Math.abs(SHIP_LAYOUT.floors[i] - 60 - sy) < Math.abs(SHIP_LAYOUT.floors[best] - 60 - sy) ? i : best, 0);
          if (Math.random() < 0.8 && state.breaches.length < 8) state.breaches.push({ x: clamp(bullet.x, SHIP_LAYOUT.hull.x0 + 20, SHIP_LAYOUT.hull.x1 - 20), d: floorIndex, prog: 0 });
          if (Math.random() < 0.35 && state.fires.length < 6) state.fires.push({ x: clamp(bullet.x + (Math.random() - 0.5) * 80, SHIP_LAYOUT.hull.x0 + 20, SHIP_LAYOUT.hull.x1 - 20), d: floorIndex, t: 0, prog: 0 });
        }
        if (!state.ship.down && (state.ship.hull -= 5) <= 0) {
          state.ship.hull = 0;
          state.ship.down = 6;
        }
      }
    }

    for (const shell of state.shells) {
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      shell.life -= dt;
      if (state.enemy.dead <= 0 && Math.hypot(shell.x - state.enemy.x, shell.y - state.enemy.y) < 46) {
        shell.life = 0;
        state.enemy.hp -= 1;
        puff(state.enemy.x, state.enemy.y, '#ffcf40', 8);
        if (state.enemy.hp <= 0) {
          state.enemy.dead = 3;
          state.kills += 1;
          puff(state.enemy.x, state.enemy.y, '#ff5a1f', 24);
        }
      }
    }

    for (const arr of [state.bullets, state.shells]) {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) arr.splice(i, 1);
    }

    for (let i = state.puffs.length - 1; i >= 0; i--) {
      const puffItem = state.puffs[i];
      puffItem.x += puffItem.vx * dt;
      puffItem.y += puffItem.vy * dt;
      if ((puffItem.life -= dt) <= 0) state.puffs.splice(i, 1);
    }

    for (const object of [...state.breaches, ...state.fires]) object.prog = Math.max(0, (object.prog || 0) - dt * 0.4);
    for (const fire of state.fires) {
      if ((fire.t += dt) > 7 && state.fires.length < 8) {
        fire.t = 0;
        state.fires.push({ x: clamp(fire.x + (Math.random() < 0.5 ? -1 : 1) * (100 + Math.random() * 60), SHIP_LAYOUT.hull.x0 + 20, SHIP_LAYOUT.hull.x1 - 20), d: fire.d, t: 0, prog: 0 });
        break;
      }
    }

    if (!state.ship.down) {
      state.ship.hull -= (state.breaches.length * 0.5 + state.fires.length * 0.35) * dt;
      if (state.ship.hull <= 0) {
        state.ship.hull = 0;
        state.ship.down = 6;
      }
    }

    state.ev.t -= dt;
    state.ev.warn = Math.max(0, state.ev.warn - dt);
    const playerCount = Object.keys(state.players).length;
    if (state.ev.t <= 0 && playerCount && !state.ship.down && !state.boarders.length) {
      const count = clamp(1 + Math.floor(playerCount / 4), 1, 5);
      const side = Math.random() < 0.5 ? SHIP_LAYOUT.hull.x0 + 10 : SHIP_LAYOUT.hull.x1 - 10;
      for (let i = 0; i < count; i++) {
        state.boarders.push({ id: 'b' + i, name: 'Raider', species: 'fox', color: '#8c2f2f', x: clamp(side + (i - count / 2) * 50, SHIP_LAYOUT.hull.x0, SHIP_LAYOUT.hull.x1), y: -60 - i * 70, fall: true, hp: 3, hit: 0, cd: 0, face: side < 800 ? 1 : -1 });
      }
      state.ev.warn = 4;
      state.ev.t = 40 + Math.random() * 20;
    } else if (state.ev.t <= 0) {
      state.ev.t = 5;
    }

    const livePlayers = Object.values(state.players).filter((q) => !q.fall && !(q.ko > 0) && SHIP_LAYOUT.floors.some((floor) => Math.abs(q.y - floor) < 30));
    for (const boarder of state.boarders) {
      if (boarder.fall) {
        boarder.y += 300 * dt;
        if (boarder.y >= SHIP_LAYOUT.floors[0]) {
          boarder.y = SHIP_LAYOUT.floors[0];
          boarder.fall = false;
        }
        continue;
      }
      boarder.hit = Math.max(0, boarder.hit - dt);
      boarder.cd = Math.max(0, boarder.cd - dt);
      boarder.moving = false;
      boarder.climb = false;
      const targetPlayer = livePlayers.reduce((best, player) => !best || Math.abs(player.x - boarder.x) + Math.abs(player.y - boarder.y) * 2 < Math.abs(best.x - boarder.x) + Math.abs(best.y - boarder.y) * 2 ? player : best, null);
      if (!targetPlayer) continue;
      const targetFloor = SHIP_LAYOUT.floors.reduce((best, floor) => Math.abs(floor - targetPlayer.y) < Math.abs(best - targetPlayer.y) ? floor : best);
      if (Math.abs(boarder.y - targetFloor) < 4) {
        boarder.y = targetFloor;
        const dx = targetPlayer.x - boarder.x;
        boarder.moving = Math.abs(dx) > 5;
        boarder.face = dx < 0 ? -1 : 1;
        boarder.x += Math.sign(dx) * Math.min(85 * dt, Math.abs(dx));
        if (Math.abs(dx) < 36 && Math.abs(targetPlayer.y - boarder.y) < 20 && boarder.cd <= 0) {
          boarder.cd = 1.5;
          targetPlayer.ko = 12;
          targetPlayer.prog = 0;
          targetPlayer.lock = null;
          targetPlayer.carry = null;
          targetPlayer.fire = false;
          puff(targetPlayer.x, targetPlayer.y - 40, '#fff', 10);
        }
      } else {
        const ladder = SHIP_LAYOUT.ladders.reduce((best, x) => Math.abs(x - boarder.x) < Math.abs(best - boarder.x) ? x : best, SHIP_LAYOUT.ladders[0]);
        const dx = ladder - boarder.x;
        if (Math.abs(dx) > 4) {
          boarder.x += Math.sign(dx) * Math.min(85 * dt, Math.abs(dx));
          boarder.face = dx < 0 ? -1 : 1;
          boarder.moving = true;
        } else {
          boarder.climb = true;
          boarder.y += Math.sign(targetFloor - boarder.y) * Math.min(110 * dt, Math.abs(targetFloor - boarder.y));
        }
      }
    }
  };

  return {
    state,
    update,
    clamp,
    taken,
    getHelm,
    workTarget,
    puff,
    setSocket,
    countPlayers: () => Object.keys(state.players).length,
  };
}
