import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { updateBot } from './bots.js';
import { moveWalker, steerTo, fall, detach, platformBelow } from './nav.js';
import { enemyPath } from './enemy.js';
import { createModules } from './modules.js';

const PLATFORMS = SHIP_LAYOUT.platforms;
const platformY = (d) => PLATFORMS[d].y;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Does a point (in ship coordinates) touch the ship? Gasbag, gondola, outriggers or ball turret.
function hitsShip(x, y) {
  const gas = ((x - 800) / 860) ** 2 + ((y - 245) / 185) ** 2 < 1;
  const gondola = x > 125 && x < 1500 && y > 475 && y < 815;
  const outriggers = x > 20 && x < 1580 && y > 745 && y < 800;
  const pod = x > 735 && x < 855 && y > 815 && y < 935;
  return gas || gondola || outriggers || pod;
}

// Which indoor/outdoor floor a hit at (x, y) lands on (holes and fires go there), or null (e.g. gasbag).
function roomPlatformAt(x, y) {
  const d = PLATFORMS.findIndex((p) => p.id !== 'nest' && x >= p.x0 && x <= p.x1 && y <= p.y + 15 && y >= p.y - 170);
  return d < 0 ? null : d;
}

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
    GUNS: Object.fromEntries(
      Object.entries(SHIP_LAYOUT.gunMounts).map(([name, m]) => [name, { bx: m.bx, by: m.by, aim: m.aim, home: m.aim, arc: m.arc, cd: 0, ammo: 6, max: 8, empty: 0 }]),
    ),
  };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const taken = (name) => Object.values(state.players).some((q) => q.lock === name);

  const getHelm = () => Object.values(state.players).find((q) => q.lock === 'Helm');

  const puff = (x, y, color, count = 6) => {
    for (let i = 0; i < count; i++) {
      state.puffs.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, max: 0.5, c: color });
    }
  };

  const T = config.TOOLS;
  const modules = createModules();
  state.modules = modules.list;
  const PICKUPS = [...SHIP_LAYOUT.racks, ...SHIP_LAYOUT.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))];
  const LOCKABLE = (name) => name === 'Helm' || name === 'Boiler' || !!state.GUNS[name];

  // What the Action button does for this player right now (or null).
  // hold = keep the button held to make progress; otherwise a tap does it.
  const interaction = (player, station) => {
    if (player.lock || player.conn != null || player.fall) return null;
    const here = (o, r) => o.d === player.d && Math.abs(o.x - player.x) < r;
    const tool = player.carry;
    const revive = Object.values(state.players).find((q) => q !== player && q.ko > 0 && !q.fall && q.conn == null && here(q, 65));
    if (revive) return { type: 'revive', obj: revive, hold: true, time: T.REVIVE_TIME, label: `Revive ${revive.name}` };
    const fire = state.fires.find((o) => here(o, 70));
    if (fire && tool === 'extinguisher') return { type: 'fire', obj: fire, hold: true, time: T.EXTINGUISH_TIME, label: 'Spray fire' };
    const hole = state.breaches.find((o) => here(o, 70));
    if (hole && tool === 'hammer') return { type: 'hole', obj: hole, hold: true, time: T.PATCH_TIME, label: 'Patch hole' };
    // Standing right at a rack or hook always means take / put back.
    const pickup = PICKUPS.find((r) => here(r, T.REACH));
    if (pickup) return { type: 'rack', obj: pickup, label: tool === pickup.kind ? `Put back ${pickup.kind}` : `Take ${pickup.kind}` };
    const hurt = modules.list.find((m) => m.hp < m.max && here(m, T.REACH + 15));
    if (hurt && tool === 'hammer') return { type: 'repair', obj: hurt, hold: true, label: `Repair ${hurt.name}` };
    const valve = modules.list.find((m) => m.kind === 'pipe' && here(m, T.REACH));
    if (valve) return { type: 'valve', obj: valve, label: valve.open ? 'Close valve' : 'Open valve' };
    if (station) {
      const gun = state.GUNS[station.n];
      if (gun && tool === 'ammo' && gun.ammo < gun.max) return { type: 'load', obj: gun, station, label: 'Load ' + station.n };
      if (station.n === 'Ammo Hold' && tool !== 'ammo') return { type: 'ammo', station, label: 'Grab ammo' };
      if (LOCKABLE(station.n) && !taken(station.n)) return { type: 'station', station, label: 'Take ' + station.n };
    }
    if (fire) return { type: 'need', label: 'Need an extinguisher' };
    if (hole || hurt) return { type: 'need', label: 'Need a hammer' };
    return null;
  };

  // Attack button: a sword hurts raiders; bare hands only shove them back.
  const attack = (player) => {
    if ((player.atkCd || 0) > 0 || player.lock || player.conn != null) return;
    const sword = player.carry === 'sword';
    player.atkCd = sword ? T.SWORD_COOLDOWN : T.SHOVE_COOLDOWN;
    player.swingT = performance.now();
    const range = sword ? T.SWORD_RANGE : T.SHOVE_RANGE;
    const target = state.boarders
      .filter((b) => !b.fall && b.conn == null && b.d === player.d && Math.abs(b.x - player.x) < range)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    if (!target) return;
    player.face = target.x < player.x ? -1 : 1;
    const p = PLATFORMS[target.d];
    target.x = clamp(target.x + player.face * (sword ? T.SWORD_KNOCKBACK : T.SHOVE_KNOCKBACK), p.x0, p.x1);
    target.hit = 0.25;
    puff(target.x, target.y - 40, '#fff', 6);
    if (sword) {
      target.hp -= 1;
      if (target.hp <= 0) {
        puff(target.x, target.y - 40, '#ffcf40', 14);
        state.boarders.splice(state.boarders.indexOf(target), 1);
      }
    } else {
      target.cd = Math.max(target.cd, 0.6); // staggered: can't strike for a moment
    }
  };

  // puff() at a point given in ship coordinates.
  const shipPuff = (x, y, color, count) => puff(x, y - state.ship.alt, color, count);

  const emitPlayerUi = (playerId, ui) => {
    if (socket && !state.players[playerId]?.bot) socket.emit('host:ui', { id: playerId, ui });
  };

  const setSocket = (nextSocket) => {
    socket = nextSocket;
  };

  const update = (dt) => {
    for (const player of Object.values(state.players)) {
      if (player.bot) updateBot(player, state, dt);
      if (player.fall) {
        fall(player, dt, 260);
        continue;
      }
      if (player.d == null) player.d = platformBelow(player.x, player.y) ?? 1;
      if (player.ko > 0) {
        detach(player);
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
      const station = !player.lock && player.conn == null ? SHIP_LAYOUT.stations.find((s) => s.d === player.d && Math.abs(player.x - s.x) < 55) : null;

      if (player.lock) {
        player.moving = false;
        player.climb = false;
        const gun = state.GUNS[player.lock];
        const working = modules.works(state, player.lock);
        if (player.lock === 'Helm') {
          if (working) {
            state.ship.speed = clamp(state.ship.speed + player.jx * dt * 0.6, 0, 1);
            state.ship.alt = clamp(state.ship.alt - player.jy * 130 * (0.4 + 0.6 * Math.min(1, state.ship.press / 50)) * dt, -90, 90);
          }
        } else if (player.lock === 'Boiler') {
          if (working) state.ship.press = clamp(state.ship.press + (player.fire ? 16 * dt : 0) + (player.actQ ? 5 : 0), 0, 100);
        } else if (gun) {
          gun.cd = Math.max(0, gun.cd - dt);
          // Turn toward the stick, but only within this gun's firing arc (a broken gun is jammed).
          if (working && Math.hypot(player.jx, player.jy) > 0.25) gun.aim = gun.home + clamp(angleDiff(Math.atan2(player.jy, player.jx), gun.home), -gun.arc, gun.arc);
          if ((player.actQ || player.fire) && gun.cd <= 0 && !state.ship.down) {
            if (!working || gun.ammo <= 0) {
              gun.cd = 0.5;
              gun.empty = 0.8;
              gun.emptyText = working ? 'EMPTY!' : 'BROKEN!';
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
        if (gun) player.face = Math.cos(gun.aim) < 0 ? -1 : 1;
        player.actQ = false;
        player.act = null;
      } else {
        moveWalker(player, player.jx || 0, player.jy || 0, dt, 230);
        player.moving = !player.climb && Math.abs(player.jx) > 0.15;
        const act = interaction(player, station);
        player.act = act;

        // Holding the button: revive, spray, patch or repair.
        if (act && act.hold && player.fire) {
          const object = act.obj;
          if (act.type === 'repair') {
            if (modules.repair(object, dt)) puff(object.pos.x, object.pos.y - state.ship.alt, '#8fe388', 10);
          } else {
            object.worked = true;
            object.prog = (object.prog || 0) + dt / act.time;
            if (object.prog >= 1) {
              object.prog = 0;
              if (act.type === 'fire') state.fires.splice(state.fires.indexOf(object), 1);
              else if (act.type === 'hole') {
                state.breaches.splice(state.breaches.indexOf(object), 1);
                state.ship.hull = Math.min(100, state.ship.hull + 3);
              } else object.ko = 0;
              puff(object.x, player.y - 50, '#8fe388', 10);
            }
          }
        }

        // Tapping the button.
        if (player.actQ) {
          player.actQ = false;
          const type = act ? act.type : null;
          if (type === 'rack') player.carry = player.carry === act.obj.kind ? null : act.obj.kind;
          else if (type === 'valve') {
            act.obj.open = !act.obj.open;
            puff(act.obj.pos.x, act.obj.pos.y - state.ship.alt, '#ffffff', 6);
          } else if (type === 'load') {
            act.obj.ammo = Math.min(act.obj.max, act.obj.ammo + 4);
            player.carry = null;
            puff(act.station.x, player.y - 60, '#ffd23f', 8);
          } else if (type === 'ammo') player.carry = 'ammo';
          else if (type === 'station') {
            player.lock = act.station.n;
            player.x = act.station.x;
          } else if (!act || !act.hold) player.actT = performance.now();
        }
        if (player.atkQ) attack(player);
      }
      player.atkQ = false;
      player.atkCd = Math.max(0, (player.atkCd || 0) - dt);

      // Tell the phone what its buttons do now.
      const stationName = player.lock || (station && station.n) || null;
      const gun = state.GUNS[stationName];
      const kind = stationName === 'Helm' ? 'helm' : gun ? 'gun' : stationName === 'Boiler' ? 'boiler' : null;
      const takenBySomeone = !player.lock && !!stationName && LOCKABLE(stationName) && taken(stationName);
      let label = 'Hey!';
      let hold = false;
      if (player.lock) {
        const working = modules.works(state, player.lock);
        label = !working && kind !== 'helm' ? 'BROKEN' : kind === 'gun' ? 'FIRE!' : kind === 'boiler' ? 'STOKE!' : 'Honk!';
        hold = kind === 'gun' || kind === 'boiler';
      } else if (player.act) {
        label = player.act.label;
        hold = !!player.act.hold;
      }
      const actModule = player.act && player.act.obj && modules.byName[player.act.obj.name] === player.act.obj ? player.act.obj.name : null;
      const status = stationName ? modules.status(state, stationName) : actModule ? modules.status(state, actModule) : '';
      const ammoText = gun ? gun.ammo : null;
      const attackLabel = player.carry === 'sword' ? 'Swing' : 'Shove';
      const hull = Math.round(state.ship.hull / 5) * 5;
      const key = [stationName, kind, !!player.lock, takenBySomeone, label, ammoText, player.carry || '', hold, status, attackLabel, hull].join('|');
      if (key !== player.uk) {
        player.uk = key;
        if (!player.bot) {
          player.ui = { station: stationName, kind, locked: !!player.lock, taken: takenBySomeone, label, ammo: ammoText, carry: player.carry || null, hold, status, attack: attackLabel, hull };
          emitPlayerUi(player.id, player.ui);
        }
      }
      if (player.lock === 'Boiler' && !player.bot && ((player.pt = (player.pt || 0) - dt) <= 0)) {
        player.pt = 0.2;
        player.ui = { ...(player.ui || {}), tick: 1, pressure: state.ship.press };
        emitPlayerUi(player.id, player.ui);
      }
    }

    modules.update(state, dt);
    state.ship.press = clamp(state.ship.press - modules.pressureDrain(state) * dt, 0, 100);
    if (state.ship.press >= 96) {
      state.ship.press = 72;
      const boiler = SHIP_LAYOUT.stations.find((s) => s.n === 'Boiler');
      puff(boiler.x, platformY(boiler.d) - 70 - state.ship.alt, '#fff', 14);
      modules.damage(modules.byName.Boiler, config.MODULES.BOILER_BLOWOUT_DAMAGE, shipPuff);
    }
    const maxSpeed = clamp(state.ship.press / 50, 0.05, 1) * modules.engineFactor(state);
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
        state.ship.down = 0; // exactly 0, or "!ship.down" checks think we're still crashed
        state.ship.hull = 100;
        state.breaches.length = 0;
        state.fires.length = 0;
        state.boarders.length = 0;
        modules.reset();
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
      state.enemy.ang += dt * config.ENEMY.TURN_SPEED;
      const next = enemyPath(state.enemy.ang);
      state.enemy.vx = next.x - state.enemy.x;
      state.enemy.vy = next.y - state.enemy.y;
      state.enemy.x = next.x;
      state.enemy.y = next.y;
      if (state.enemy.hp <= 2 && Math.random() < 0.5) puff(state.enemy.x, state.enemy.y, '#555', 1);
      if ((state.enemy.fire -= dt) <= 0 && !state.ship.down) {
        state.enemy.fire = (2 + Math.random() * 1.5) * (1.2 - Math.min(0.5, Object.keys(state.players).length * 0.04));
        const helm = getHelm();
        const evading = helm && (Math.abs(helm.jy) > 0.2 || state.ship.speed > 0.3);
        const miss = evading && Math.random() < 0.5;
        const tx = SHIP_LAYOUT.aimPoint.x + (Math.random() - 0.5) * 900;
        const ty = SHIP_LAYOUT.aimPoint.y - state.ship.alt + (Math.random() - 0.5) * 200 + (miss ? (Math.random() < 0.5 ? -1 : 1) * 700 : 0);
        const d = Math.hypot(tx - state.enemy.x, ty - state.enemy.y) || 1;
        state.bullets.push({ x: state.enemy.x, y: state.enemy.y, vx: ((tx - state.enemy.x) / d) * 430, vy: ((ty - state.enemy.y) / d) * 430, miss, life: 4 });
      }
    }

    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      const sy = bullet.y + state.ship.alt;
      if (!bullet.miss && hitsShip(bullet.x, sy)) {
        bullet.life = 0;
        state.ship.shake = 0.35;
        puff(bullet.x, bullet.y, '#ff7b00', 8);
        modules.hitAt(bullet.x, sy, shipPuff);
        const d = roomPlatformAt(bullet.x, sy);
        if (d !== null) {
          const p = PLATFORMS[d];
          if (Math.random() < 0.8 && state.breaches.length < 8) state.breaches.push({ x: clamp(bullet.x, p.x0 + 20, p.x1 - 20), d, prog: 0 });
          if (Math.random() < 0.35 && state.fires.length < 6) state.fires.push({ x: clamp(bullet.x + (Math.random() - 0.5) * 80, p.x0 + 20, p.x1 - 20), d, t: 0, prog: 0 });
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

    // Progress drains only while nobody is working on it.
    for (const object of [...state.breaches, ...state.fires]) {
      if (!object.worked) object.prog = Math.max(0, (object.prog || 0) - dt * 0.4);
      object.worked = false;
    }
    for (const fire of state.fires) {
      if ((fire.t += dt) > 7 && state.fires.length < 8) {
        fire.t = 0;
        const p = PLATFORMS[fire.d];
        state.fires.push({ x: clamp(fire.x + (Math.random() < 0.5 ? -1 : 1) * (100 + Math.random() * 60), p.x0 + 20, p.x1 - 20), d: fire.d, t: 0, prog: 0 });
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
      const entry = SHIP_LAYOUT.boarderEntryPoints[(Math.random() * SHIP_LAYOUT.boarderEntryPoints.length) | 0];
      for (let i = 0; i < count; i++) {
        state.boarders.push({ id: 'b' + i, name: 'Raider', species: 'fox', color: '#8c2f2f', x: entry.x + (i - count / 2) * 40, y: -60 - i * 70, fall: true, hp: 3, hit: 0, cd: 0, face: entry.x < 800 ? 1 : -1 });
      }
      state.ev.warn = 4;
      state.ev.t = 40 + Math.random() * 20;
    } else if (state.ev.t <= 0) {
      state.ev.t = 5;
    }

    const livePlayers = Object.values(state.players).filter((q) => !q.fall && !(q.ko > 0) && q.d != null);
    for (const boarder of state.boarders) {
      if (boarder.fall) {
        fall(boarder, dt, 300);
        continue;
      }
      boarder.hit = Math.max(0, boarder.hit - dt);
      boarder.cd = Math.max(0, boarder.cd - dt);
      boarder.moving = false;
      const targetPlayer = livePlayers.reduce((best, player) => !best || Math.abs(player.x - boarder.x) + Math.abs(player.y - boarder.y) * 2 < Math.abs(best.x - boarder.x) + Math.abs(best.y - boarder.y) * 2 ? player : best, null);
      if (!targetPlayer) continue;
      // Chase the target's platform (or where they are climbing from).
      const goal = targetPlayer.conn == null ? targetPlayer.d : SHIP_LAYOUT.connectors[targetPlayer.conn][targetPlayer.s < 0.5 ? 'top' : 'bottom'];
      const step = steerTo(boarder, goal, targetPlayer.x, 30);
      moveWalker(boarder, step.jx, step.jy, dt, 85, 0.65);
      boarder.moving = !boarder.climb && Math.abs(step.jx) > 0.15;
      if (boarder.conn == null && boarder.d === targetPlayer.d && targetPlayer.conn == null) {
        const dx = targetPlayer.x - boarder.x;
        boarder.face = dx < 0 ? -1 : 1;
        if (Math.abs(dx) < 36 && boarder.cd <= 0) {
          boarder.cd = 1.5;
          targetPlayer.ko = 12;
          targetPlayer.prog = 0;
          targetPlayer.lock = null;
          targetPlayer.carry = null;
          targetPlayer.fire = false;
          puff(targetPlayer.x, targetPlayer.y - 40, '#fff', 10);
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
    interaction,
    modules,
    puff,
    setSocket,
    countPlayers: () => Object.keys(state.players).length,
  };
}
