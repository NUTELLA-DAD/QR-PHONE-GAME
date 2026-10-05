import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { updateBot } from './bots.js';
import { moveWalker, steerTo, fall, detach, platformBelow } from './nav.js';
import { createModules } from './modules.js';
import { createThreats } from './threats.js';
import { createRaiders } from './raiders.js';
import { createCourse, inRock, altWindow } from './course.js';
import { createSquadrons } from './squadrons.js';
import { pop, updatePopups } from './popups.js';
import { createWeather } from './weather.js';
import { assistAim } from './aim.js';
import { UPGRADES, pickOffer } from './upgrades.js';

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

const GB = SHIP_LAYOUT.gasbag;
const onGasbag = (x, y) => ((x - GB.cx) / GB.rx) ** 2 + ((y - GB.cy) / GB.ry) ** 2 < 1 && y < 455;

// A gasbag hole where the crew can reach it: on top near the crow's nest, or on the underside
// above the catwalk. (x, y) is the hole's drawn position on the envelope.
function gasHoleAt(x, y) {
  const nest = PLATFORMS.findIndex((p) => p.id === 'nest');
  const cat = PLATFORMS.findIndex((p) => p.id === 'catwalk');
  const edge = (hx, top) => GB.cy + (top ? -1 : 1) * GB.ry * Math.sqrt(Math.max(0, 1 - ((hx - GB.cx) / GB.rx) ** 2));
  if (y < GB.cy && x > PLATFORMS[nest].x0 - 60 && x < PLATFORMS[nest].x1 + 60) {
    const hx = Math.max(PLATFORMS[nest].x0 + 15, Math.min(PLATFORMS[nest].x1 - 15, x));
    return { x: hx, d: nest, y: edge(hx, true) + 34, prog: 0 };
  }
  const hx = Math.max(PLATFORMS[cat].x0 + 20, Math.min(PLATFORMS[cat].x1 - 20, x));
  return { x: hx, d: cat, y: edge(hx, false) - 22, prog: 0 };
}

// Which indoor/outdoor floor a hit at (x, y) lands on (holes and fires go there), or null (e.g. gasbag).
function roomPlatformAt(x, y) {
  const d = PLATFORMS.findIndex((p) => p.id !== 'nest' && x >= p.x0 && x <= p.x1 && y <= p.y + 15 && y >= p.y - 170);
  return d < 0 ? null : d;
}

// Best run, remembered by this browser (the TV). Never let storage problems break the game.
function loadRecord() {
  try {
    return JSON.parse(localStorage.getItem('airshipRecord')) || { laps: 0, kills: 0 };
  } catch {
    return { laps: 0, kills: 0 };
  }
}
function saveRecord(r) {
  try {
    localStorage.setItem('airshipRecord', JSON.stringify(r));
  } catch {
    // ignore
  }
}

export function createSimulation() {
  let socket = null;
  const state = {
    players: {},
    ship: { alt: 0, speed: 0.3, hull: 100, shake: 0, down: 0, press: 70, fuel: config.BOILER.START_FUEL, gas: 100 },
    gasHoles: [],
    upgrades: {}, // id -> times taken
    difficulty: config.START_DIFFICULTY,
    phase: 'lobby', // 'lobby' = moored at the mast while the crew joins; 'flying' after CAST OFF
    record: loadRecord(), // best run on this TV: { laps, kills }
    vote: null, // an upgrade vote in progress
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
  const LOCKABLE = (name) => name === 'Helm' || name === 'Lookout' || !!state.GUNS[name];

  // What the Action button does for this player right now (or null).
  // hold = keep the button held to make progress; otherwise a tap does it.
  const interaction = (player, station) => {
    if (player.lock || player.conn != null || player.fall) return null;
    const here = (o, r) => o.d === player.d && Math.abs(o.x - player.x) < r;
    const tool = player.carry;
    const revive = Object.values(state.players).find((q) => q !== player && q.ko > 0 && !q.fall && q.conn == null && here(q, 65));
    if (revive) return { type: 'revive', obj: revive, hold: true, time: T.REVIVE_TIME, label: `Revive ${revive.name}` };
    const bomb = state.bombs.find((o) => here(o, 60));
    if (bomb) return { type: 'defuse', obj: bomb, hold: true, time: config.RAIDERS.DEFUSE_TIME, label: 'Defuse bomb' };
    const fire = state.fires.find((o) => here(o, 70));
    if (fire && tool === 'extinguisher') return { type: 'fire', obj: fire, hold: true, time: T.EXTINGUISH_TIME, label: 'Spray fire' };
    const hole = state.breaches.find((o) => here(o, 70));
    if (hole && tool === 'hammer') return { type: 'hole', obj: hole, hold: true, time: T.PATCH_TIME, label: 'Patch hole' };
    // Standing right at a rack or hook always means take / put back.
    const pickup = PICKUPS.find((r) => here(r, T.REACH));
    if (pickup) return { type: 'rack', obj: pickup, label: tool === pickup.kind ? `Put back ${pickup.kind}` : `Take ${pickup.kind}` };
    const gasHole = state.gasHoles.find((o) => here(o, 60));
    if (gasHole && tool === 'hammer') return { type: 'gas', obj: gasHole, hold: true, time: T.PATCH_TIME, label: 'Patch gasbag' };
    const hurt = modules.list.find((m) => m.hp < m.max && here(m, T.REACH + 15));
    if (hurt && tool === 'hammer') return { type: 'repair', obj: hurt, hold: true, label: `Repair ${hurt.name}` };
    const vent = SHIP_LAYOUT.vents.find((v) => here(v, T.REACH));
    if (vent) return { type: 'vent', obj: vent, hold: true, label: 'Vent steam' };
    const valve = modules.list.find((m) => m.kind === 'pipe' && here(m, T.REACH));
    if (valve) return { type: 'valve', obj: valve, label: valve.open ? 'Close valve' : 'Open valve' };
    if (station) {
      const gun = state.GUNS[station.n];
      if (gun && tool === 'ammo' && gun.ammo < gun.max) return { type: 'load', obj: gun, station, label: 'Load ' + station.n };
      if (station.n === 'Ammo Hold' && tool !== 'ammo') return { type: 'ammo', station, label: 'Grab ammo' };
      if (station.n === 'Coal Bunker' && tool !== 'coal') return { type: 'coal', station, label: 'Grab coal' };
      if (station.n === 'Boiler' && tool === 'coal') {
        const full = state.ship.fuel > config.BOILER.FUEL_MAX - config.BOILER.COAL_FUEL;
        return full ? { type: 'need', label: 'Firebox is full' } : { type: 'stoke', station, label: 'Load coal' };
      }
      if (LOCKABLE(station.n) && !taken(station.n)) return { type: 'station', station, label: 'Take ' + station.n };
    }
    if (fire) return { type: 'need', label: 'Need an extinguisher' };
    if (hole || hurt || gasHole) return { type: 'need', label: 'Need a hammer' };
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
    puff(target.x, target.y - 40, '#fff', 6);
    if (sword) pop(state, target.x, target.y - 110 - state.ship.alt, 'whack', '#ffffff', 0.8);
    raiders.onHit(target, sword, player.face * (sword ? T.SWORD_KNOCKBACK : T.SHOVE_KNOCKBACK));
    if (!state.boarders.includes(target)) {
      stat(player, 'raiders');
      phoneFx(player, '+1 Raider beaten!', [30, 40, 30]);
      pop(state, target.x, target.y - 130 - state.ship.alt, 'raider', '#ffd23f', 1);
    }
  };

  // puff() at a point given in ship coordinates.
  const shipPuff = (x, y, color, count) => puff(x, y - state.ship.alt, color, count);

  const damageHull = (amount) => {
    const diff = config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal;
    if (!state.ship.down && (state.ship.hull -= amount * config.SHIP.HULL_DAMAGE * diff.damage) <= 0) {
      state.ship.hull = 0;
      state.ship.down = 6;
    }
  };

  // Something exploded against the ship at (x, y) in ship coordinates. power 1 = one enemy bullet.
  const impact = (x, y, power) => {
    state.ship.shake = Math.min(1, 0.35 * power);
    if (power >= 1.5) {
      pop(state, x, y - 40 - state.ship.alt, 'bigHit', '#ff7b00', Math.min(1.6, 0.6 + power * 0.3));
      // Every phone feels the big ones.
      if (performance.now() - lastJolt > 1000) {
        lastJolt = performance.now();
        for (const p of Object.values(state.players)) phoneFx(p, null, [80]);
      }
    }
    shipPuff(x, y, '#ff7b00', Math.round(8 * power));
    modules.hitAt(x, y, shipPuff, power);
    if (onGasbag(x, y)) {
      if (state.gasHoles.length < config.GAS.MAX_HOLES && Math.random() < config.GAS.HOLE_CHANCE) state.gasHoles.push(gasHoleAt(x, y));
      damageHull(2 * power);
      return;
    }
    const d = roomPlatformAt(x, y);
    if (d !== null) {
      const p = PLATFORMS[d];
      const holes = power >= 2 ? 2 : Math.random() < config.SHIP.HOLE_CHANCE ? 1 : 0;
      for (let i = 0; i < holes && state.breaches.length < 10; i++) state.breaches.push({ x: clamp(x + (i - 0.5) * 70 * (holes - 1), p.x0 + 20, p.x1 - 20), d, prog: 0 });
      if ((power >= 2 || Math.random() < 0.35) && state.fires.length < 8) state.fires.push({ x: clamp(x + (Math.random() - 0.5) * 80, p.x0 + 20, p.x1 - 20), d, t: 0, prog: 0 });
    }
    damageHull(config.SHIP.HIT_DAMAGE * power);
  };

  // Per-player stats for the lap scorecard.
  const stat = (player, key, n = 1) => {
    if (!player) return;
    player.stats = player.stats || {};
    player.stats[key] = (player.stats[key] || 0) + n;
  };
  // A quick message and buzz on one player's phone (doesn't change their buttons).
  const phoneFx = (player, toast, buzz) => {
    if (player && !player.bot && socket) socket.emit('host:ui', { id: player.id, ui: { fx: { toast, buzz } } });
  };
  // Kill credit goes to whoever fired the shell.
  const credit = (shell) => {
    const p = shell && state.players[shell.owner];
    stat(p, 'kills');
    phoneFx(p, '+1 Shot down!', [30, 40, 30]);
  };
  let lastJolt = 0;

  const raiders = createRaiders({ state, modules, puff, impact });
  const threats = createThreats({ state, puff, impact, hitsShip, dropSquad: raiders.dropSquad, getHelm, credit });
  // ---- Upgrade votes (at the turning beacon and back home) ----
  const startVote = (marker) => {
    const offer = pickOffer(state.upgrades);
    if (!offer.length) return;
    state.vote = {
      options: offer.map((u) => u.id),
      t: config.VOTE.TIME,
      title: marker.kind === 'beacon' ? 'Turning beacon! Pick an upgrade' : `Lap ${marker.lap - 1} complete! Pick an upgrade`,
    };
    for (const p of Object.values(state.players)) {
      p.vote = null;
      p.voteAt = 1.5 + Math.random() * 4; // bots take a moment to "think"
      p.fire = false;
    }
  };

  const updateVote = (dt) => {
    const v = state.vote;
    v.t -= dt;
    const voters = Object.values(state.players).filter((p) => p.connected !== false);
    for (const p of voters) {
      if (p.bot && p.vote == null && (p.voteAt -= dt) <= 0) p.vote = (Math.random() * v.options.length) | 0;
      if (p.bot) continue;
      // Tell each phone what's on offer and what it picked.
      const ui = {
        vote: {
          title: v.title,
          t: Math.max(0, Math.ceil(v.t)),
          mine: p.vote ?? null,
          options: v.options.map((id) => {
            const u = UPGRADES.find((x) => x.id === id);
            return { name: u.name, icon: u.icon, desc: u.desc };
          }),
        },
      };
      const key = 'vote|' + ui.vote.t + '|' + ui.vote.mine + '|' + v.options.join();
      if (key !== p.uk) {
        p.uk = key;
        emitPlayerUi(p.id, ui);
      }
    }
    if (voters.length && voters.every((p) => p.vote != null)) v.t = Math.min(v.t, config.VOTE.ALL_VOTED_WAIT);
    if (v.t > 0) return;
    // Count the votes; ties (or no votes at all) are settled at random.
    const counts = v.options.map((_, i) => voters.filter((p) => p.vote === i).length);
    const best = Math.max(...counts);
    const tied = v.options.filter((_, i) => counts[i] === best);
    const id = tied[(Math.random() * tied.length) | 0];
    const up = UPGRADES.find((x) => x.id === id);
    up.apply({ state, modules });
    state.upgrades[id] = (state.upgrades[id] || 0) + 1;
    state.vote = null;
    state.ev.warn = 3.5;
    state.ev.warnText = `UPGRADE: ${up.name.toUpperCase()}!`;
    for (const p of Object.values(state.players)) {
      p.vote = null;
      p.uk = null; // resend normal button labels
      if (!p.bot) emitPlayerUi(p.id, {}); // close the vote screen right away
    }
  };

  // Back home: show the lap scorecard for a few seconds, then vote on an upgrade.
  const AWARDS = [
    { key: 'kills', title: 'Ace Gunner', icon: '🎯', unit: 'shot down' },
    { key: 'raiders', title: 'Swashbuckler', icon: '🗡️', unit: 'raiders beaten' },
    { key: 'holes', title: 'Patch Master', icon: '🔨', unit: 'holes patched' },
    { key: 'fires', title: 'Firefighter', icon: '🧯', unit: 'fires out' },
    { key: 'repairs', title: 'Grease Monkey', icon: '🔧', unit: 'repairs' },
    { key: 'ammo', title: 'Quartermaster', icon: '📦', unit: 'ammo runs' },
    { key: 'coal', title: 'Stoker', icon: '⚫', unit: 'coal loads' },
    { key: 'revives', title: 'Medic', icon: '💫', unit: 'revives' },
    { key: 'defused', title: 'Bomb Squad', icon: '💣', unit: 'bombs defused' },
    { key: 'vent', title: 'Steam Valve', icon: '💨', unit: 'seconds venting' },
  ];
  let pendingVote = null;
  const onMarker = (m) => {
    if (m.kind !== 'home') return startVote(m);
    // A new record for this TV?
    const laps = m.lap - 1;
    if (laps > state.record.laps || (laps === state.record.laps && state.kills > state.record.kills)) {
      state.record = { laps, kills: state.kills };
      saveRecord(state.record);
      state.newRecord = true;
    }
    const players = Object.values(state.players);
    const rows = [];
    for (const a of AWARDS) {
      const best = players.reduce((b, p) => ((p.stats?.[a.key] || 0) > (b?.stats?.[a.key] || 0) ? p : b), null);
      const value = best?.stats?.[a.key] || 0;
      if (value > 0) {
        rows.push({ ...a, name: best.name, color: best.color, value: Math.round(value) });
        phoneFx(best, `🏆 You're the ${a.title}!`, [60, 60, 60, 60, 120]);
      }
    }
    state.scorecard = { lap: m.lap - 1, rows, t: config.VOTE.SCORECARD_TIME };
    pendingVote = m;
    for (const p of players) p.stats = {};
  };

  const course = createCourse({ state, impact, puff, onMarker, credit, hitsShip });

  const squadrons = createSquadrons({ state, puff, impact, hitsShip, dropSquad: raiders.dropSquad, credit });
  const weather = createWeather({ state, impact, puff });

  const emitPlayerUi = (playerId, ui) => {
    if (socket && !state.players[playerId]?.bot) socket.emit('host:ui', { id: playerId, ui });
  };

  const setSocket = (nextSocket) => {
    socket = nextSocket;
  };

  const update = (dt) => {
    // The lap scorecard pauses the action, then the upgrade vote starts.
    if (state.scorecard) {
      if ((state.scorecard.t -= dt) <= 0) {
        state.scorecard = null;
        state.newRecord = false;
        if (pendingVote) startVote(pendingVote);
        pendingVote = null;
      }
      return;
    }
    // While the crew votes on an upgrade, the action is paused.
    if (state.vote) {
      updateVote(dt);
      return;
    }
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
            // Throttle: the phone's lever if used, otherwise the stick left/right.
            if (player.thr != null) state.ship.speed += (clamp(player.thr, 0, 1) - state.ship.speed) * Math.min(1, dt * 1.5);
            else state.ship.speed = clamp(state.ship.speed + player.jx * dt * 0.6, 0, 1);
            const climb = config.SHIP.CLIMB_SPEED * (0.4 + 0.6 * Math.min(1, state.ship.press / 50));
            state.ship.alt = clamp(state.ship.alt - player.jy * climb * dt, -config.SHIP.ALT_RANGE, config.SHIP.ALT_RANGE);
          }
        } else if (gun) {
          gun.cd = Math.max(0, gun.cd - dt);
          // Turn toward the stick, but only within this gun's firing arc (a broken gun is jammed).
          if (working && Math.hypot(player.jx, player.jy) > 0.25) {
            const A = config.AIM_ASSIST;
            const wanted = assistAim(state, gun, Math.atan2(player.jy, player.jx), A.ANGLE, A.STRENGTH);
            gun.aim = gun.home + clamp(angleDiff(wanted, gun.home), -gun.arc, gun.arc);
          }
          if ((player.actQ || player.fire) && gun.cd <= 0 && !state.ship.down) {
            if (!working || gun.ammo <= 0) {
              gun.cd = 0.5;
              gun.empty = 0.8;
              gun.emptyText = working ? 'EMPTY!' : 'BROKEN!';
            } else {
              gun.ammo -= 1;
              gun.cd = config.GUNS.COOLDOWN;
              const angle = gun.aim;
              state.shells.push({
                x: gun.bx + Math.cos(angle) * 60,
                y: gun.by - state.ship.alt + Math.sin(angle) * 60,
                vx: Math.cos(angle) * 950,
                vy: Math.sin(angle) * 950,
                life: 1.6,
                owner: player.id,
              });
              puff(gun.bx + Math.cos(angle) * 64, gun.by - state.ship.alt + Math.sin(angle) * 64, '#ffe9a8', 4);
            }
          }
        }
        if (gun) player.face = Math.cos(gun.aim) < 0 ? -1 : 1;
        player.actQ = false;
        player.act = null;
      } else {
        moveWalker(player, player.jx || 0, player.jy || 0, dt, config.MOVE.WALK_SPEED);
        player.moving = !player.climb && Math.abs(player.jx) > 0.15;
        const act = interaction(player, station);
        player.act = act;

        // Holding the button: revive, spray, patch or repair.
        if (act && act.hold && player.fire) {
          const object = act.obj;
          if (act.type === 'repair') {
            if (modules.repair(object, dt)) {
              puff(object.pos.x, object.pos.y - state.ship.alt, '#8fe388', 10);
              stat(player, 'repairs');
              pop(state, object.pos.x, object.pos.y - 50 - state.ship.alt, 'repair', '#8fe388', 0.8);
            }
          } else if (act.type === 'vent') {
            state.ship.press = Math.max(0, state.ship.press - config.BOILER.VENT_RATE * dt);
            stat(player, 'vent', dt);
            if (Math.random() < dt * 12) shipPuff(object.x + (Math.random() - 0.5) * 20, PLATFORMS[object.d].y - 150, '#ffffff', 2);
          } else {
            object.worked = true;
            object.prog = (object.prog || 0) + dt / act.time;
            if (object.prog >= 1) {
              object.prog = 0;
              stat(player, { fire: 'fires', hole: 'holes', gas: 'holes', defuse: 'defused', revive: 'revives' }[act.type]);
              if (act.type === 'fire') pop(state, object.x, player.y - 120 - state.ship.alt, 'fireOut', '#9fd3e6', 0.8);
              if (act.type === 'hole' || act.type === 'gas') pop(state, object.x, player.y - 120 - state.ship.alt, 'patch', '#8fe388', 0.8);
              if (act.type === 'fire') state.fires.splice(state.fires.indexOf(object), 1);
              else if (act.type === 'hole') {
                state.breaches.splice(state.breaches.indexOf(object), 1);
                state.ship.hull = Math.min(100, state.ship.hull + 3);
              } else if (act.type === 'defuse') state.bombs.splice(state.bombs.indexOf(object), 1);
              else if (act.type === 'gas') state.gasHoles.splice(state.gasHoles.indexOf(object), 1);
              else object.ko = 0;
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
            act.obj.ammo = Math.min(act.obj.max, act.obj.ammo + config.GUNS.LOAD);
            stat(player, 'ammo');
            player.carry = null;
            puff(act.station.x, player.y - 60, '#ffd23f', 8);
          } else if (type === 'ammo') player.carry = 'ammo';
          else if (type === 'coal') player.carry = 'coal';
          else if (type === 'stoke') {
            state.ship.fuel = Math.min(config.BOILER.FUEL_MAX, state.ship.fuel + config.BOILER.COAL_FUEL);
            stat(player, 'coal');
            player.carry = null;
            shipPuff(act.station.x - 30, PLATFORMS[act.station.d].y - 50, '#ff8c42', 8);
          }
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
      const kind = stationName === 'Helm' ? 'helm' : gun ? 'gun' : stationName === 'Boiler' ? 'boiler' : stationName === 'Lookout' ? 'lookout' : null;
      const takenBySomeone = !player.lock && !!stationName && LOCKABLE(stationName) && taken(stationName);
      let label = 'Hey!';
      let hold = false;
      if (player.lock) {
        const working = modules.works(state, player.lock);
        label = !working && kind !== 'helm' && kind !== 'lookout' ? 'BROKEN' : kind === 'gun' ? 'FIRE!' : kind === 'boiler' ? 'SHOVEL!' : kind === 'lookout' ? 'Ahoy!' : 'Honk!';
        hold = kind === 'gun';
      } else if (player.act) {
        label = player.act.label;
        hold = !!player.act.hold;
      }
      const actModule = player.act && player.act.obj && modules.byName[player.act.obj.name] === player.act.obj ? player.act.obj.name : null;
      let status = stationName ? modules.status(state, stationName) : actModule ? modules.status(state, actModule) : '';
      if (stationName === 'Helm' && player.lock && !status) status = course.helmHint();
      if (stationName === 'Boiler' && !status) status = `Pressure ${Math.round(state.ship.press / 5) * 5}% - coal ${Math.round(state.ship.fuel / 5) * 5}%`;
      if (!status && state.ship.press >= config.BOILER.WARN_AT) status = 'PRESSURE HIGH - vent steam!';
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
    }

    state.lookout = state.periscope || Object.values(state.players).some((q) => q.lock === 'Lookout');
    updatePopups(state, dt);
    modules.update(state, dt);
    const BO = config.BOILER;
    if (state.ship.fuel > 0 && !modules.byName.Boiler.broken) {
      state.ship.fuel = Math.max(0, state.ship.fuel - BO.BURN_RATE * dt);
      state.ship.press += BO.HEAT_RATE * dt;
    }
    state.ship.press = clamp(state.ship.press - modules.pressureDrain(state) * dt, 0, 100);
    if (state.ship.press >= BO.WARN_AT && !state.pressureWarned && !state.ship.down) {
      state.pressureWarned = true;
      state.ev.warn = 3;
      state.ev.warnText = 'PRESSURE HIGH - VENT STEAM!';
    }
    if (state.ship.press < BO.WARN_AT - 10) state.pressureWarned = false;
    if (state.ship.press >= BO.BLOWOUT_AT) {
      // The boiler blows: damage it and burst a random steam pipe.
      state.ship.press = 75;
      const boiler = SHIP_LAYOUT.stations.find((s) => s.n === 'Boiler');
      puff(boiler.x, platformY(boiler.d) - 70 - state.ship.alt, '#fff', 20);
      pop(state, boiler.x, platformY(boiler.d) - 160 - state.ship.alt, 'boiler', '#ff5a1f', 1.6);
      modules.damage(modules.byName.Boiler, config.MODULES.BOILER_BLOWOUT_DAMAGE, shipPuff);
      const pipes = modules.list.filter((m) => m.kind === 'pipe' && !m.broken);
      if (pipes.length) modules.damage(pipes[(Math.random() * pipes.length) | 0], 999, shipPuff);
      state.ship.shake = 0.6;
      state.ev.warn = 3;
      state.ev.warnText = 'THE BOILER BLEW! A PIPE BURST!';
    }

    const G = config.GAS;
    if (!state.ship.down) {
      state.ship.gas += (G.REFILL_RATE * (state.ship.press / 100) - G.LEAK_PER_HOLE * state.gasHoles.length) * dt;
      state.ship.gas = clamp(state.ship.gas, 0, 100);
      if (state.ship.gas <= 0) {
        state.ship.down = 6;
        state.ship.hull = 0;
      }
    }
    const maxSpeed = clamp(state.ship.press / 50, 0.05, 1) * modules.engineFactor(state);
    if (state.ship.speed > maxSpeed) state.ship.speed += (maxSpeed - state.ship.speed) * Math.min(1, dt * 2);

    for (const gun of Object.values(state.GUNS)) {
      gun.empty = Math.max(0, gun.empty - dt);
      // Auto-Loader upgrade: a free shell every so often.
      if (config.GUNS.AUTOLOAD_EVERY && gun.ammo < gun.max && (gun.auto = (gun.auto || 0) + dt) >= config.GUNS.AUTOLOAD_EVERY) {
        gun.auto = 0;
        gun.ammo += 1;
      }
    }
    state.autopilot = false;
    if (!getHelm()) {
      state.ship.speed += (0.3 - state.ship.speed) * dt * 0.5;
      const diff = config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal;
      if (diff.autopilot && state.phase === 'flying' && modules.works(state, 'Helm')) {
        // Autopilot: ease into the safe gap ahead, slower than a real helmsman.
        state.autopilot = true;
        const w = altWindow(state, 5);
        const R = config.SHIP.ALT_RANGE;
        const lo = Math.max(w.min, -R);
        const hi = Math.min(w.max, R);
        const target = lo > hi ? (w.min + w.max) / 2 : Math.max(lo + 30, Math.min(hi - 30, 0));
        const step = config.SHIP.CLIMB_SPEED * config.AUTOPILOT_SPEED * dt;
        state.ship.alt += Math.max(-step, Math.min(step, target - state.ship.alt));
      } else state.ship.alt *= 1 - dt * 0.4;
    }
    // Losing gas: the ship sinks, and scrapes along the bottom if it's very low.
    state.sinking = state.ship.gas < G.SINK_BELOW;
    if (state.sinking && !state.ship.down) {
      state.ship.alt = Math.max(-config.SHIP.ALT_RANGE, state.ship.alt - (G.SINK_BELOW - state.ship.gas) * G.SINK_SPEED * dt);
      if (state.ship.alt <= -config.SHIP.ALT_RANGE + 1 && state.ship.gas < G.SCRAPE_BELOW) damageHull(G.SCRAPE_DAMAGE * dt);
    }
    state.ship.shake = Math.max(0, state.ship.shake - dt);

    if (state.ship.down > 0) {
      state.ship.down -= dt;
      if (state.ship.down <= 0) {
        state.ship.down = 0; // exactly 0, or "!ship.down" checks think we're still crashed
        state.ship.hull = 100;
        state.breaches.length = 0;
        state.fires.length = 0;
        raiders.reset();
        threats.reset();
        squadrons.reset();
        course.reset();
        state.ship.alt = 0;
        modules.reset();
        state.gasHoles.length = 0;
        state.ship.gas = 100;
        state.ship.fuel = config.BOILER.START_FUEL;
        state.ship.press = 70;
        for (const player of Object.values(state.players)) player.ko = 0;
      }
    }

    if (state.phase === 'lobby') {
      // Moored at the home mast: no enemies, the boiler and gasbag are kept topped up.
      state.ship.press = 70;
      state.ship.fuel = Math.max(state.ship.fuel, config.BOILER.START_FUEL);
      state.ship.gas = 100;
    } else {
      threats.update(dt);
      squadrons.update(dt);
      course.update(dt);
      weather.update(dt);
    }

    for (const bullet of state.bullets) {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      bullet.life -= dt;
      if (inRock(state, bullet.x, bullet.y) && bullet.life < 4.8) {
        bullet.life = 0; // mountains give cover (flak gets a moment to leave its turret)
        puff(bullet.x, bullet.y, '#8b6b4a', 4);
        continue;
      }
      const sy = bullet.y + state.ship.alt;
      if (!bullet.miss && hitsShip(bullet.x, sy)) {
        bullet.life = 0;
        puff(bullet.x, bullet.y, '#ff7b00', 8);
        impact(bullet.x, sy, 1);
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
    for (const object of [...state.breaches, ...state.fires, ...state.bombs, ...state.gasHoles]) {
      if (!object.worked) object.prog = Math.max(0, (object.prog || 0) - dt * 0.4);
      object.worked = false;
    }
    for (const fire of state.fires) {
      if ((fire.t += dt) > config.FIRE.SPREAD_EVERY && state.fires.length < 8) {
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

    raiders.update(dt);
  };

  return {
    state,
    update,
    clamp,
    taken,
    getHelm,
    interaction,
    modules,
    startVote,
    castOff: () => {
      if (state.phase !== 'lobby') return;
      state.phase = 'flying';
      state.ev.warn = 4;
      state.ev.warnText = 'CAST OFF! NEXT STOP: THE TURNING BEACON';
    },
    onMarker,
    squadrons,
    puff,
    setSocket,
    countPlayers: () => Object.keys(state.players).length,
  };
}
