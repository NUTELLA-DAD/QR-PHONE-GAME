import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { updateBot } from './bots.js';
import { moveWalker, steerTo, fall, detach, platformBelow } from './nav.js';
import { createModules } from './modules.js';
import { createThreats } from './threats.js';
import { createRaiders } from './raiders.js';
import { createCourse, inRock, tilt, altBounds, pilotPlan, gasFor } from './course.js';
import { createSquadrons } from './squadrons.js';
import { createEscort } from './escort.js';
import { createSpecials } from './specials.js';
import { createCoil } from './coil.js';
import { createGunship, MAIN_X1, GS } from './gunship.js';
import { createAirborne } from './airborne.js';
import { pop, updatePopups } from './popups.js';
import { createWeather } from './weather.js';
import { assistAim } from './aim.js';
import { UPGRADES, pickOffer } from './upgrades.js';

const PLATFORMS = SHIP_LAYOUT.platforms;
const platformY = (d) => PLATFORMS[d].y;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Does a point (in ship coordinates) touch the ship? Gasbag, gondola, outriggers or ball turret.
function hitsShip(x, y) {
  const gas = ((x - SHIP_LAYOUT.gasbag.cx) / SHIP_LAYOUT.gasbag.rx) ** 2 + ((y - SHIP_LAYOUT.gasbag.cy) / SHIP_LAYOUT.gasbag.ry) ** 2 < 1;
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
    ship: { alt: 0, speed: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START },
    gasHoles: [],
    ventOpen: SHIP_LAYOUT.vents.map(() => false), // which vent stacks are open
    wreck: null, // { t } while the ship is breaking apart
    bombBay: { bombs: config.BOMBS.START, cd: 0, empty: 0, aim: null },
    sfxQ: [], // sounds asked for by name: [name, arg]
    flashes: [], // muzzle flashes { x, y, ang, t, color }
    rings: [], // impact rings { x, y, t, max, color, size }
    tempo: { phase: 'build', t: config.PACING.BUILD }, // build-up -> peak -> calm (breather)
    supply: null, // a supply balloon to catch during a calm { mx, my, t }
    gasValve: { input: 0, auto: false }, // +1 = pumping hot steam into the gasbag, -1 = venting
    shield: { ang: -Math.PI / 2, on: false, flash: 0 }, // the Deflector's arc (angle around the ship)
    upgrades: {}, // id -> times taken
    difficulty: config.START_DIFFICULTY,
    phase: 'lobby', // 'lobby' = moored at the mast while the crew joins; 'flying' after CAST OFF
    record: loadRecord(), // best run on this TV: { laps, kills }
    vote: null, // an upgrade vote in progress
    enemy: { x: -2000, y: 300, vx: 0, vy: 0, hp: 5, fire: 0, dead: 3, heading: null },
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
      Object.entries(SHIP_LAYOUT.gunMounts).map(([name, m]) => [name, { bx: m.bx, by: m.by, aim: m.aim, home: m.aim, arc: m.arc, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0 }]),
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
  const LOCKABLE = (name) => name === 'Helm' || name === 'Lookout' || name === 'Bomb Bay' || name === 'Deflector' || name === 'Lightning Coil' || name === 'Escort Fighter' || !!state.GUNS[name];

  // What the Action button does for this player right now (or null).
  // hold = keep the button held to make progress; otherwise a tap does it.
  const interaction = (player, station) => {
    if (player.lock || player.conn != null || player.fall || player.swing || player.air) return null;
    const here = (o, r) => o.d === player.d && Math.abs(o.x - player.x) < r;
    const tool = player.carry;
    const revive = Object.values(state.players).find((q) => q !== player && q.ko > 0 && !q.fall && q.conn == null && here(q, 65));
    if (revive) return { type: 'revive', obj: revive, hold: true, time: T.REVIVE_TIME, label: `Revive ${revive.name}` };
    const boarding = gunship.interaction(player);
    if (boarding) return boarding;
    const bomb = state.bombs.find((o) => here(o, 60));
    if (bomb) return { type: 'defuse', obj: bomb, hold: true, time: config.RAIDERS.DEFUSE_TIME, label: 'Defuse bomb' };
    const fire = state.fires.find((o) => here(o, 70));
    if (fire && tool === 'extinguisher') return { type: 'fire', obj: fire, hold: true, time: T.EXTINGUISH_TIME, label: 'Spray fire' };
    const hole = state.breaches.find((o) => here(o, 70));
    if (hole && tool === 'hammer') return { type: 'hole', obj: hole, hold: true, time: T.PATCH_TIME, label: 'Patch hole' };
    // Holding the right tool for a job in reach: the job wins over a nearby rack.
    const gasHole = state.gasHoles.find((o) => here(o, 60));
    if (gasHole && tool === 'hammer') return { type: 'gas', obj: gasHole, hold: true, time: T.PATCH_TIME, label: 'Patch gasbag' };
    const hurt = modules.list.find((m) => m.hp < m.max && here(m, T.REACH + 15));
    if (hurt && tool === 'hammer') return { type: 'repair', obj: hurt, hold: true, label: `Repair ${hurt.name}` };
    // Otherwise standing at a rack or hook means take / swap / put back.
    const pickup = PICKUPS.find((r) => here(r, T.REACH));
    // (carrying ammo or coal next to a gun or the boiler means load it, not swap it for a tool)
    if (pickup && !(station && (tool === 'ammo' || tool === 'coal'))) return { type: 'rack', obj: pickup, label: tool === pickup.kind ? `Put back ${pickup.kind}` : tool && tool !== 'ammo' && tool !== 'coal' ? `Swap to ${pickup.kind}` : `Take ${pickup.kind}` };
    const vent = SHIP_LAYOUT.vents.find((v) => here(v, T.REACH));
    if (vent) return { type: 'vent', obj: vent, label: state.ventOpen[SHIP_LAYOUT.vents.indexOf(vent)] ? 'Close vent' : 'Open vent' };
    const valve = modules.list.find((m) => m.kind === 'pipe' && here(m, T.REACH));
    if (valve) return { type: 'valve', obj: valve, label: valve.open ? 'Close valve' : 'Open valve' };
    if (station) {
      const gun = state.GUNS[station.n];
      if (gun && tool === 'ammo' && gun.ammo < gun.max) return { type: 'load', obj: gun, station, label: 'Load ' + station.n };
      if (station.n === 'Bomb Bay' && tool === 'ammo' && state.bombBay.bombs < config.BOMBS.MAX) return { type: 'loadBombs', station, label: 'Load bombs' };
      if (station.n === 'Ammo Hold' && tool !== 'ammo') return { type: 'ammo', station, label: 'Grab ammo' };
      if (station.n === 'Coal Bunker' && tool !== 'coal') return { type: 'coal', station, label: 'Grab coal' };
      if (station.n === 'Boiler' && tool === 'coal') {
        const full = state.ship.fuel > config.BOILER.FUEL_MAX - config.BOILER.COAL_FUEL;
        return full ? { type: 'need', label: 'Firebox is full' } : { type: 'stoke', station, label: 'Load coal' };
      }
      if (LOCKABLE(station.n) && !taken(station.n)) return { type: 'station', station, label: 'Take ' + station.n };
      // Players can always bump a bot off a station.
      const botThere = !player.bot && Object.values(state.players).find((q) => q.bot && q.lock === station.n);
      if (botThere) return { type: 'station', station, bump: botThere, label: 'Take ' + station.n };
    }
    if (fire) return { type: 'need', label: 'Need an extinguisher' };
    if (hole || hurt || gasHole) return { type: 'need', label: 'Need a hammer' };
    return null;
  };

  // The nearest latched bat this player can swat (same deck; gasbag bats are swatted from the catwalk), or null.
  const batInReach = (player, range, extra = 0) =>
    state.bats
      .filter((b) => b.latched && b.landed && b.hp > 0 && b.d === player.d && Math.abs(b.lx - player.x) < range + extra + (b.kind === 'gas' ? config.WAVES.BAT_SWAT_REACH : 0))
      .sort((a, b) => Math.abs(a.lx - player.x) - Math.abs(b.lx - player.x))[0] || null;

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
    if (!target) {
      // A bat latched on this deck (or hanging under the gasbag, above the catwalk): one hit is enough.
      const bat = batInReach(player, range);
      if (bat) {
        bat.hp = 0;
        state.kills += 1;
        player.face = bat.x < player.x ? -1 : 1;
        puff(bat.x, bat.y, '#4a3b5c', 10);
        pop(state, bat.x, bat.y - 30, 'bat', '#c9a0ff', 0.9);
        stat(player, 'bats');
        phoneFx(player, '+1 Bat swatted!', [30, 40, 30]);
        return;
      }
      if (gunship.hitCrew(player, sword, range)) {
        stat(player, 'raiders');
        if (sword) pop(state, player.x + player.face * 60, player.y - 110 - state.ship.alt, 'whack', '#ffffff', 0.8);
      }
      return;
    }
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
    if (!state.ship.down && (state.ship.hull -= amount * config.SHIP.HULL_DAMAGE * diff.damage) <= 0) wreck();
  };

  // The hull gave out: the ship breaks apart, then the whole game starts over.
  function wreck(text = "SHE'S BREAKING UP!") {
    if (state.ship.down) return;
    state.ship.hull = 0;
    state.ship.down = config.WRECK.TIME;
    state.wreck = { t: 0, lap: state.course ? state.course.lap : 1, kills: state.kills };
    state.ship.shake = 1.5;
    state.ev.warn = config.WRECK.TIME;
    state.ev.warnText = text;
    // Laps fully flown still count toward this TV's record.
    const laps = state.wreck.lap - 1;
    if (laps > state.record.laps || (laps === state.record.laps && state.kills > state.record.kills)) {
      state.record = { laps, kills: state.kills };
      saveRecord(state.record);
      state.newRecord = true;
    }
  }

  // Settings as they were at the start (upgrades change them during a run).
  const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
  const pristine = copyData(config);
  const restoreData = (target, from) => {
    for (const [k, v] of Object.entries(from)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreData(target[k], v);
      else target[k] = copyData(v);
    }
  };

  // Start the whole game over, moored at the mast (players stay connected).
  function restartGame() {
    restoreData(config, pristine);
    Object.assign(state.ship, { alt: 0, speed: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START, pitch: 0, vy: 0, trim: 0 });
    Object.assign(state.gasValve, { input: 0, auto: false });
    state.lastAlt = 0;
    state.wreck = null;
    state.phase = 'lobby';
    state.upgrades = {};
    state.periscope = false;
    state.vote = null;
    state.scorecard = null;
    state.kills = 0;
    state.ventOpen.fill(false);
    Object.assign(state.bombBay, { bombs: config.BOMBS.START, cd: 0, empty: 0, aim: null });
    Object.assign(state.shield, { ang: -Math.PI / 2, on: false, flash: 0 });
    state.tempo = { phase: 'build', t: config.PACING.BUILD };
    state.supply = null;
    for (const list of [state.gasHoles, state.breaches, state.fires, state.shells, state.bullets, state.bombs || [], state.rockets || []]) list.length = 0;
    for (const [name, m] of Object.entries(SHIP_LAYOUT.gunMounts)) Object.assign(state.GUNS[name], { aim: m.aim, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0, auto: 0 });
    raiders.reset();
    threats.reset();
    squadrons.restart();
    escort.reset();
    specials.reset();
    coil.reset();
    gunship.reset();
    course.restart();
    modules.reset();
    if (state.weather) Object.assign(state.weather, { storm: 0, gust: 0, flash: 0, bolt: null });
    for (const player of Object.values(state.players)) {
      // Drop everyone back aboard from above, as when joining.
      const [e0, e1] = SHIP_LAYOUT.boarderEntryPoints;
      Object.assign(player, { ko: 0, lock: null, carry: null, conn: null, climb: false, fall: true, y: -60, x: e0.x + Math.random() * (e1.x - e0.x), stats: {} });
      player.uk = null; // resend the phone's buttons
    }
    state.ev.warn = 5;
    state.ev.warnText = 'A NEW SHIP IS READY!';
  }

  // Is world point (x, y) on the Deflector's arc right now? (Sparks and a flash if so.)
  const shieldBlocks = (x, y) => {
    const S = state.shield;
    if (!S.on) return false;
    const L = SHIP_LAYOUT.shield;
    const u = (x - L.cx) / L.rx;
    const v = (y + state.ship.alt - L.cy) / L.ry;
    const r = Math.hypot(u, v);
    if (r < 0.88 || r > 1.12 || Math.abs(angleDiff(Math.atan2(v, u), S.ang)) > config.SHIELD.SPAN) return false;
    puff(x, y, '#9fe8ff', 6);
    S.flash = 1;
    return true;
  };

  // Pacing: a build-up, then a peak (they come thick and fast), then a calm to catch your breath -
  // with a supply balloon drifting nearby to fly into.
  const updateTempo = (dt) => {
    const PC = config.PACING;
    const tp = state.tempo;
    if (state.ship.down || state.boss) return;
    if ((tp.t -= dt) <= 0) {
      tp.phase = tp.phase === 'build' ? 'peak' : tp.phase === 'peak' ? 'calm' : 'build';
      tp.t = PC[tp.phase.toUpperCase()];
      state.ev.warn = 3;
      if (tp.phase === 'peak') state.ev.warnText = 'HERE THEY COME!';
      if (tp.phase === 'calm') {
        state.ev.warnText = 'ALL CLEAR - SUPPLY BALLOON SPOTTED! FLY INTO IT!';
        spawnSupply();
      }
      if (tp.phase === 'build') state.ev.warn = 0;
    }
    const sp = state.supply;
    if (sp) {
      sp.t -= dt;
      sp.bob = (sp.bob || 0) + dt;
      const wx = sp.mx - state.course.dist;
      const wy = sp.my + Math.sin(sp.bob * 1.3) * 30;
      if (Math.hypot(wx - 800, wy - (470 - state.ship.alt)) < PC.SUPPLY_REACH) {
        state.ship.hull = Math.min(100, state.ship.hull + PC.SUPPLY_HULL);
        state.ship.fuel = Math.min(config.BOILER.FUEL_MAX, state.ship.fuel + PC.SUPPLY_COAL);
        for (const gun of Object.values(state.GUNS)) gun.ammo = Math.min(gun.max, gun.ammo + 8);
        state.bombBay.bombs = Math.min(config.BOMBS.MAX, state.bombBay.bombs + 1);
        puff(wx, wy, '#ffd23f', 20);
        pop(state, wx, wy - 120, 'SUPPLIES!', '#ffd23f', 1.4);
        state.ev.warn = 2.5;
        state.ev.warnText = 'SUPPLIES ABOARD: HULL, COAL AND AMMO!';
        state.sfxQ.push(['bell']);
        state.supply = null;
      } else if (sp.t <= 0) state.supply = null;
    }
  };
  // A balloon in open air a little ahead of the ship (searching for a clear spot).
  const spawnSupply = () => {
    const c = state.course;
    if (!c) return;
    for (const [dx, dy] of [[1400, -500], [1800, 0], [1200, 400], [-600, -700], [2200, -300]]) {
      const wx = 800 + dx;
      const wy = 470 - state.ship.alt + dy;
      let clear = true;
      for (const [ox, oy] of [[0, 0], [150, 0], [-150, 0], [0, 150], [0, -150]]) if (inRock(state, wx + ox, wy + oy)) clear = false;
      if (clear) {
        state.supply = { mx: wx + c.dist, my: wy, t: config.PACING.CALM + 12 };
        return;
      }
    }
  };

  // Speed changes with weight: she builds speed gradually and brakes harder than she accelerates,
  // easing in as she nears the speed asked for.
  const driveSpeed = (want, dt) => {
    const SH = config.SHIP;
    const sp = state.ship.speed;
    const braking = Math.abs(want) < Math.abs(sp) || (Math.sign(want) !== Math.sign(sp) && Math.abs(sp) > 0.02);
    const rate = (braking ? SH.BRAKE : SH.ACCEL) * Math.min(1, Math.abs(want - sp) * 4 + 0.25);
    state.ship.speed = sp + clamp(want - sp, -rate * dt, rate * dt);
    state.ship.accelX = dt > 0 ? (state.ship.speed - sp) / dt : 0;
  };

  // Something exploded against the ship at (x, y) in ship coordinates. power 1 = one enemy bullet.
  const impact = (x, y, power) => {
    state.ship.shake = Math.max(state.ship.shake, Math.min(0.6, 0.22 * power));
    air.shove(power, x);
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
      for (let i = 0; i < holes && state.breaches.length < 10; i++) state.breaches.push({ x: clamp(x + (i - 0.5) * 70 * (holes - 1), p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d, prog: 0 });
      if ((power >= 2 || Math.random() < 0.35) && state.fires.length < 8) state.fires.push({ x: clamp(x + (Math.random() - 0.5) * 80, p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d, t: 0, prog: 0 });
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
  const escort = createEscort({ state, puff, phoneFx });
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
    { key: 'vent', title: 'Steam Valve', icon: '💨', unit: 'vents worked' },
    { key: 'demolished', title: 'Bombardier', icon: '🎯', unit: 'buildings flattened' },
    { key: 'sabotage', title: 'Saboteur', icon: '🧨', unit: 'gunships blown up' },
    { key: 'boarding', title: 'Boarding Party', icon: '🪝', unit: 'hookshots fired' },
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

  // A latched bat chews a hole: a gasbag leak, or a breach in the deck it sits on (ship coordinates).
  const gnaw = (kind, x, y, d) => {
    shipPuff(x, y, '#4a3b5c', 6);
    if (kind === 'gas') {
      if (state.gasHoles.length < config.GAS.MAX_HOLES) state.gasHoles.push(gasHoleAt(x, y));
    } else if (state.breaches.length < 10) {
      const p = PLATFORMS[d];
      state.breaches.push({ x: clamp(x, p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d, prog: 0 });
    }
  };
  const squadrons = createSquadrons({ state, puff, impact, hitsShip, dropSquad: raiders.dropSquad, credit, gnaw, damageHull });
  const specials = createSpecials({ state, puff, impact, hitsShip, credit, shieldBlocks });
  const coil = createCoil({ state, puff, credit });
  const gunship = createGunship({ state, puff, impact, credit, dropOne: raiders.dropOne, pickType: raiders.pickType });
  const weather = createWeather({ state, impact, puff });
  const air = createAirborne({ state, puff, phoneFx });
  // Her deck is somewhere to land too: leap (or get thrown) across and you're aboard.
  const onDeck = () => state.gunship && state.gunship.phase !== 'sinking' && state.gunship.phase !== 'leaving';
  air.addSurface({
    id: 'gunship',
    y: () => (onDeck() ? GS.deckY + state.gunship.dy : null),
    x0: () => (onDeck() ? GS.x0 - 30 + state.gunship.dx : 0),
    x1: () => (onDeck() ? GS.x1 + 30 + state.gunship.dx : 0),
    onLand: (p) => gunship.land(p),
  });

  const emitPlayerUi = (playerId, ui) => {
    if (socket && !state.players[playerId]?.bot) socket.emit('host:ui', { id: playerId, ui });
  };

  const setSocket = (nextSocket) => {
    socket = nextSocket;
  };

  const update = (dt) => {
    let helmFlown = false; // did someone steer this frame
    let gasManned = false; // is someone working the gas (the helm's PRESSURE lever)
    state.ship.trim = 0;
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
      if (player.swing) {
        gunship.swingStep(player, dt);
        player.actQ = false;
        player.jumpQ = false;
        continue;
      }
      if (player.fall) {
        player.jumpQ = false;
        player.air = false;
        player.jz = 0;
        player.fly = false;
        fall(player, dt, player.tumble ? air.tumble(player, dt) : 260, (w) => {
          air.clear(w);
          // Fell off the ship (or off a gunship): back aboard in the medical bay, dazed.
          const mb = SHIP_LAYOUT.medbay;
          w.d = PLATFORMS.findIndex((p) => p.id === mb.p);
          w.x = mb.x + (Math.random() - 0.5) * 60;
          w.y = PLATFORMS[w.d].y;
          w.fall = false;
          w.ko = config.GUNSHIP.RESPAWN_TIME;
          w.carry = null;
          phoneFx(w, 'You fell! Coming round in the medical bay...', [80, 40, 80]);
        });
        continue;
      }
      if (player.d == null) player.d = platformBelow(player.x, player.y) ?? 1;
      if (player.ko > 0) {
        detach(player);
        player.lock = null;
        player.fire = false;
        player.actQ = false;
        player.jumpQ = false;
        if (player.fly) air.step(player, dt, false); // knocked out mid-air: still falls
        else {
          player.air = false;
          player.jz = 0;
          air.standing(player, dt);
        }
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
      const station = !player.lock && player.conn == null ? SHIP_LAYOUT.stations.filter((s) => s.d === player.d && Math.abs(player.x - s.x) < T.STATION_REACH).sort((a, b) => Math.abs(player.x - a.x) - Math.abs(player.x - b.x))[0] || null : null;

      if (player.lock) {
        player.moving = false;
        player.climb = false;
        const gun = state.GUNS[player.lock];
        const working = modules.works(state, player.lock);
        if (player.lock === 'Helm') {
          if (working) {
            // The helm works the front/back engines (stick left/right; the lever sets the cruise
            // speed) and the small up/down trim engine (stick up/down). Big climbs and drops come
            // from the gasbag: the PRESSURE lever pumps hot steam in (up) or vents it (down).
            const SH = config.SHIP;
            const REV = -SH.REVERSE;
            // Stick left/right asks for full ahead / full reverse; let go and she goes back to the
            // lever's cruise speed (or holds her speed if the lever isn't used).
            const want = player.jx > 0.25 ? player.jx : player.jx < -0.25 ? player.jx * SH.REVERSE : player.thr != null ? clamp(player.thr, REV, 1) : state.ship.speed;
            driveSpeed(want, dt);
            state.ship.trim = Math.abs(player.jy) > 0.15 ? -player.jy : 0;
            state.gasValve.input = clamp(player.gas || 0, -1, 1);
            gasManned = true;
            helmFlown = true;
          }
        } else if (player.lock === 'Deflector') {
          // Swing the shield round toward where the stick points.
          if (working && Math.hypot(player.jx, player.jy) > 0.3) {
            const want = Math.atan2(player.jy, player.jx);
            const d = angleDiff(want, state.shield.ang);
            const step = config.SHIELD.TURN * dt;
            state.shield.ang += Math.max(-step, Math.min(step, d));
            state.shield.ang = Math.atan2(Math.sin(state.shield.ang), Math.cos(state.shield.ang));
          }
        } else if (player.lock === 'Bomb Bay') {
          // Bombardier: FIRE drops a bomb through the belly doors.
          const bay = state.bombBay;
          if ((player.actQ || player.fire) && bay.cd <= 0 && !state.ship.down) {
            if (!working || bay.bombs <= 0) {
              bay.cd = 0.5;
              bay.empty = 0.8;
              bay.emptyText = working ? 'NO BOMBS!' : 'BROKEN!';
            } else {
              bay.bombs -= 1;
              bay.cd = config.BOMBS.COOLDOWN;
              bay.open = 0.6;
              const [bx, by] = tilt(state, SHIP_LAYOUT.bombBay.x, SHIP_LAYOUT.bombBay.y);
              course.dropBomb(bx, by - state.ship.alt + 20, player.id);
            }
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
              const angle = gun.aim + (state.ship.pitch || 0);
              const [gx, gy] = tilt(state, gun.bx, gun.by);
              state.shells.push({
                x: gx + Math.cos(angle) * 60,
                y: gy - state.ship.alt + Math.sin(angle) * 60,
                vx: Math.cos(angle) * config.GUNS.SHELL_SPEED,
                vy: Math.sin(angle) * config.GUNS.SHELL_SPEED,
                life: config.GUNS.SHELL_LIFE,
                owner: player.id,
              });
              puff(gx + Math.cos(angle) * 64, gy - state.ship.alt + Math.sin(angle) * 64, '#ffe9a8', 4);
              state.flashes.push({ x: gx + Math.cos(angle) * 70, y: gy - state.ship.alt + Math.sin(angle) * 70, ang: angle, t: 0.09, color: '#fff2b0', size: 1.3 });
            }
          }
        }
        if (gun) player.face = Math.cos(gun.aim) < 0 ? -1 : 1;
        player.actQ = false;
        player.jumpQ = false;
        player.act = null;
      } else {
        // Hop: a short arc over the deck (jz = height above it, vy = upward speed). Not on ladders
        // or at a station. Kept simple so airborne play (jumping overboard) can extend it later.
        const M = config.MOVE;
        player.jumpCd = Math.max(0, (player.jumpCd || 0) - dt);
        if (player.jumpQ && player.conn != null && !player.air) air.jumpOff(player); // leap off a ladder into free flight
        if (player.jumpQ && !player.air && player.conn == null && player.jumpCd <= 0) {
          player.air = true;
          player.vy = M.JUMP_VY;
          player.jz = 0;
          if (!player.onGunship) air.vault(player); // outside deck + stick held down: hop over the rail into free flight
        }
        player.jumpQ = false;
        if (player.fly) {
          if (air.step(player, dt)) air.grab(player); // free flight (off a deck end, over the rail, or thrown); may catch a ladder
        } else if (player.air) {
          // Steer (a bit less than on the ground), no ladders while airborne.
          (player.onGunship ? gunship.walk : moveWalker)(player, (player.jx || 0) * M.JUMP_AIR_CONTROL, 0, dt, M.WALK_SPEED);
          player.vy -= M.JUMP_GRAVITY * dt;
          player.jz += player.vy * dt;
          if (player.onGunship || !air.edgeCheck(player, dt, true)) {
            if (player.jz <= 0) {
              player.jz = 0;
              player.vy = 0;
              player.air = false;
              player.jumpCd = M.JUMP_COOLDOWN;
              player.squash = 0.4;
              puff(player.x, player.y - 4, '#d9cbb0', 3);
            }
          }
          if (player.air && !player.onGunship) air.grab(player); // a hop can catch a ladder
        } else if (player.onGunship) {
          gunship.walk(player, player.jx || 0, player.jy || 0, dt, M.WALK_SPEED); // aboard a gunship she carries them
        } else {
          moveWalker(player, player.jx || 0, player.jy || 0, dt, M.WALK_SPEED, player.conn != null && !player.bot && Math.abs(player.jy || 0) > 0.9 ? config.AIR.CLIMB_FAST : 1);
          air.edgeCheck(player, dt, false); // walking off the end of an outside deck
        }
        if (!player.fly && !player.onGunship) air.standing(player, dt);
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
          } else {
            object.worked = true;
            object.prog = (object.prog || 0) + dt / act.time;
            if (object.prog >= 1) {
              object.prog = 0;
              stat(player, { fire: 'fires', hole: 'holes', gas: 'holes', defuse: 'defused', revive: 'revives', sabotage: 'sabotage', cutline: 'boarding' }[act.type]);
              if (act.type === 'fire') pop(state, object.x, player.y - 120 - state.ship.alt, 'fireOut', '#9fd3e6', 0.8);
              if (act.type === 'hole' || act.type === 'gas') pop(state, object.x, player.y - 120 - state.ship.alt, 'patch', '#8fe388', 0.8);
              if (act.type === 'fire') state.fires.splice(state.fires.indexOf(object), 1);
              else if (act.type === 'hole') {
                state.breaches.splice(state.breaches.indexOf(object), 1);
                state.ship.hull = Math.min(100, state.ship.hull + 3);
              } else if (act.type === 'defuse') state.bombs.splice(state.bombs.indexOf(object), 1);
              else if (act.type === 'gas') state.gasHoles.splice(state.gasHoles.indexOf(object), 1);
              else if (act.type === 'sabotage') gunship.plant(player);
              else if (act.type === 'cutline') gunship.cutLine(player);
              else object.ko = 0;
              puff(object.x, player.y - 50, '#8fe388', 10);
            }
          }
        }

        // Tapping the button.
        if (player.actQ) {
          player.actQ = false;
          const type = act ? act.type : null;
          if (type === 'hook') {
            if (gunship.fireHook()) {
              stat(player, 'boarding');
              puff(player.x + 200, player.y - 60 - state.ship.alt, '#ffe9a8', 8);
              phoneFx(player, 'Hooked! Press Action at the bow to swing across!', [40, 30, 40]);
            } else phoneFx(player, 'Too far - the hook falls short! Get closer.', [40, 30, 40]);
          } else if (type === 'swing') gunship.swing(player);
          else if (type === 'rack') player.carry = player.carry === act.obj.kind ? null : act.obj.kind;
          else if (type === 'vent') {
            const i = SHIP_LAYOUT.vents.indexOf(act.obj);
            state.ventOpen[i] = !state.ventOpen[i];
            stat(player, 'vent');
            shipPuff(act.obj.x, PLATFORMS[act.obj.d].y - 150, '#ffffff', 8);
          } else if (type === 'valve') {
            act.obj.open = !act.obj.open;
            puff(act.obj.pos.x, act.obj.pos.y - state.ship.alt, '#ffffff', 6);
          } else if (type === 'load') {
            act.obj.ammo = Math.min(act.obj.max, act.obj.ammo + config.GUNS.LOAD);
            stat(player, 'ammo');
            player.carry = null;
            puff(act.station.x, player.y - 60, '#ffd23f', 8);
          } else if (type === 'loadBombs') {
            state.bombBay.bombs = Math.min(config.BOMBS.MAX, state.bombBay.bombs + config.BOMBS.LOAD);
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
            if (act.bump) {
              act.bump.lock = null;
              act.bump.lockLeft = undefined;
              act.bump.restCd = 4;
              act.bump.fire = false;
              act.bump.x = act.station.x + 50;
            }
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
      const kind = stationName === 'Helm' ? 'helm' : gun ? 'gun' : stationName === 'Boiler' ? 'boiler' : stationName === 'Lookout' ? 'lookout' : stationName === 'Bomb Bay' ? 'bombbay' : stationName === 'Deflector' ? 'shield' : stationName === 'Lightning Coil' ? 'coil' : stationName === 'Escort Fighter' ? 'escort' : null;
      const takenBySomeone = !player.lock && !!stationName && LOCKABLE(stationName) && Object.values(state.players).some((q) => q.lock === stationName && (q.bot ? player.bot : true));
      let label = 'Hey!';
      let hold = false;
      if (player.lock) {
        const working = modules.works(state, player.lock);
        label = !working && kind !== 'helm' && kind !== 'lookout' && kind !== 'escort' ? 'BROKEN' : kind === 'gun' ? 'FIRE!' : kind === 'bombbay' ? 'DROP!' : kind === 'shield' ? 'Swing!' : kind === 'escort' ? (state.escort.flying ? 'Auto guns' : 'Wait...') : kind === 'coil' ? (state.coil.cd > 0 ? 'Cooling...' : 'CHARGE!') : kind === 'boiler' ? 'SHOVEL!' : kind === 'lookout' ? 'Ahoy!' : 'Honk!';
        hold = kind === 'gun' || kind === 'bombbay' || kind === 'coil';
      } else if (player.act) {
        label = player.act.label;
        hold = !!player.act.hold;
      }
      if (player.fly) label = player.fvy > 0 ? 'Falling!' : 'Airborne';
      const actModule = player.act && player.act.obj && modules.byName[player.act.obj.name] === player.act.obj ? player.act.obj.name : null;
      let status = stationName ? modules.status(state, stationName) : actModule ? modules.status(state, actModule) : '';
      if (stationName === 'Helm' && player.lock && !status) status = course.helmHint();
      if (stationName === 'Escort Fighter' && !status) status = escort.status();
      const feel = state.buoyancy > 0 ? 'RISING' : state.buoyancy < 0 ? 'FALLING' : 'holding';
      const leakNow = modules.leaks()[0];
      const leakText = leakNow ? (leakNow.pipe && leakNow.pipe.open ? `${leakNow.m.name} pipe leaking - close the valve or repair` : `${leakNow.m.name} leaking steam - repair it`) : '';
      if (stationName === 'Boiler' && !status && leakText) status = `Steam ${Math.round(state.ship.press / 5) * 5}% - ${leakText}`;
      if (stationName === 'Boiler' && !status) status = `Steam ${Math.round(state.ship.press / 5) * 5}% - coal ${Math.round(state.ship.fuel / 5) * 5}%`;
      if (stationName === 'Helm' && player.lock && !status && (state.ship.press < config.GAS.PUMP_MIN_PRESS || state.gasHoles.length)) status = `Gas ${Math.round(state.ship.gas)}% - ${feel}${state.ship.press < config.GAS.PUMP_MIN_PRESS ? ' - NO STEAM TO PUMP!' : ''}${state.gasHoles.length ? ' - ' + state.gasHoles.length + ' holes leaking' : ''}`;
      if (stationName === 'Helm' && player.lock && !status && state.buoyancy) status = state.buoyancy > 0 ? 'Gasbag full - she is rising' : 'Gasbag low - she is dropping';
      if (!status && state.ship.press >= config.BOILER.WARN_AT) status = 'PRESSURE HIGH - open a vent!';
      const ammoText = gun ? gun.ammo : stationName === 'Bomb Bay' ? state.bombBay.bombs : null;
      const attackLabel = !player.lock && player.conn == null && batInReach(player, config.WAVES.BAT_NOTICE) ? 'Swat bat!' : player.carry === 'sword' ? 'Swing' : 'Shove';
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
    // Steam pressure: heat from the coal in the firebox in, steam used by everything powered,
    // open vents and burst pipes out (all using more at higher pressure).
    const BO = config.BOILER;
    let heat = 0;
    if (state.ship.fuel > 0 && !modules.byName.Boiler.broken) {
      state.ship.fuel = Math.max(0, state.ship.fuel - BO.BURN_RATE * dt);
      // More coal = hotter fire, but with diminishing returns (a load lasts about a minute).
      heat = (BO.HEAT_MAX * state.ship.fuel) / (state.ship.fuel + BO.HEAT_HALF);
    }
    const openVents = state.ventOpen.filter(Boolean).length;
    state.shield.on = taken('Deflector') && modules.works(state, 'Deflector') && state.phase === 'flying';
    const coilOp = Object.values(state.players).find((q) => q.lock === 'Lightning Coil');
    coil.update(dt, coilOp || null, modules.works(state, 'Lightning Coil'));
    const parts = modules.drainParts(state);
    parts.vents = openVents * BO.VENT_RATE;
    parts.shield = state.shield.on ? config.SHIELD.STEAM_USE : 0;
    parts.coil = state.coil.charging ? config.COIL.STEAM_USE : 0;
    parts.pump = state.steamParts ? state.steamParts.pump || 0 : 0; // (set below, while pumping)
    state.steamParts = parts; // where the steam goes: read by the HUD gauge
    state.steamUse = parts.other + parts.engines + parts.leaks + parts.vents + parts.shield + parts.coil;
    // Leaking modules puff steam so the crew can see where it's going.
    for (const l of modules.leaks()) {
      if (Math.random() < dt * (2 + 10 * (l.rate / config.MODULES.LEAK_FULL))) shipPuff(l.m.pos.x + (Math.random() - 0.5) * 30, l.m.pos.y - 20, '#ffffff', 1);
    }
    state.ship.press = clamp(state.ship.press + (heat - (state.steamUse * state.ship.press) / BO.USE_REF) * dt, 0, 100);
    if (state.ship.press >= BO.WARN_AT && !state.pressureWarned && !state.ship.down) {
      state.pressureWarned = true;
      state.ev.warn = 3;
      state.ev.warnText = 'PRESSURE HIGH - OPEN A VENT!';
    }
    if (state.ship.press < BO.WARN_AT - 10) state.pressureWarned = false;
    // Overdrive: 0 at OVERDRIVE_AT up to 1 at 100 pressure (engines, pump and coil get faster).
    state.overdrive = clamp((state.ship.press - BO.OVERDRIVE_AT) / (100 - BO.OVERDRIVE_AT), 0, 1);
    // Over WARN_AT the boiler rattles and each second there is a growing chance it blows.
    const hot = clamp((state.ship.press - BO.WARN_AT) / (100 - BO.WARN_AT), 0, 1);
    if (hot > 0 && !state.ship.down) {
      state.ship.shake = Math.max(state.ship.shake, BO.WARN_SHAKE * (0.5 + hot));
      state.warnBeep = (state.warnBeep || 0) - dt;
      if (state.warnBeep <= 0) {
        state.warnBeep = 2.5 - hot * 1.5;
        state.sfxQ.push(['alarm']);
      }
    }
    if (state.ship.press >= BO.BLOWOUT_AT || (hot > 0 && Math.random() < BO.BLOWOUT_RATE * hot * dt)) {
      // The boiler blows: damage it and burst a random steam pipe.
      state.ship.press = 75;
      state.boilerBlew = true; // (read by tools/botsim.mjs)
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

    const maxSpeed = clamp(state.ship.press / 50, 0.05, 1) * modules.engineFactor(state);
    if (state.ship.speed > maxSpeed) state.ship.speed += (maxSpeed - state.ship.speed) * Math.min(1, dt * 2);
    const maxReverse = -maxSpeed * config.SHIP.REVERSE;
    if (state.ship.speed < maxReverse) state.ship.speed += (maxReverse - state.ship.speed) * Math.min(1, dt * 2);

    const bay = state.bombBay;
    bay.cd = Math.max(0, bay.cd - dt);
    bay.empty = Math.max(0, bay.empty - dt);
    bay.open = Math.max(0, (bay.open || 0) - dt);
    if (taken('Bomb Bay') && state.phase === 'flying') {
      const [bx, by] = tilt(state, SHIP_LAYOUT.bombBay.x, SHIP_LAYOUT.bombBay.y);
      bay.from = { x: bx, y: by - state.ship.alt + 20 };
      bay.aim = course.predictBomb(bx, by - state.ship.alt + 20);
    } else bay.aim = null;
    for (const gun of Object.values(state.GUNS)) {
      gun.empty = Math.max(0, gun.empty - dt);
      // Auto-Loader upgrade: a free shell every so often.
      if (config.GUNS.AUTOLOAD_EVERY && gun.ammo < gun.max && (gun.auto = (gun.auto || 0) + dt) >= config.GUNS.AUTOLOAD_EVERY) {
        gun.auto = 0;
        gun.ammo += 1;
      }
    }
    // ---------- Flight: engines, the gasbag and the trim engine ----------
    const G = config.GAS;
    const SHM = config.SHIP;
    const valve = state.gasValve;
    const diff = config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal;
    const flying = state.phase === 'flying' && !state.ship.down;
    state.autopilot = false;
    // Easy/Normal: with nobody at the helm the ship flies itself, gently.
    const assist = diff.autopilot && flying;
    const plan = assist && (!getHelm() || !gasManned) ? pilotPlan(state, 4, 0.3) : null;
    if (!getHelm()) {
      if (plan && modules.works(state, 'Helm')) {
        state.autopilot = true;
        driveSpeed(plan.speed, dt);
        state.ship.trim = clamp((plan.target - state.ship.alt) / 150, -1, 1) * 0.6;
      } else driveSpeed(flying ? 0.2 : 0.3, dt);
    }
    if (!gasManned) valve.input = plan ? gasFor(state, plan.target) * 0.6 : 0;
    valve.auto = !gasManned && !!plan;

    // Gas: the valve pumps hot steam in (costs pressure; needs steam) or vents it. Hot gas slowly
    // cools and seeps out, and holes leak more.
    if (flying) {
      const pumping = Math.max(0, valve.input) * (state.ship.press > G.PUMP_MIN_PRESS && !modules.byName.Boiler.broken ? Math.min(1, state.ship.press / 60) : 0);
      state.steamParts.pump = pumping * G.PUMP_STEAM;
      state.ship.gas += (pumping * G.PUMP_RATE * (1 + config.BOILER.OD_PUMP * state.overdrive) + Math.min(0, valve.input) * G.VENT_RATE - G.SEEP - G.LEAK_PER_HOLE * state.gasHoles.length) * dt;
      state.ship.press = Math.max(0, state.ship.press - pumping * G.PUMP_STEAM * dt);
      state.ship.gas = clamp(state.ship.gas, 0, 100);
    }
    // Lift: above the neutral fill she accelerates up, below it she drops (fast at the extremes).
    // The helm's little trim engine adds a nudge.
    const lift = (state.ship.gas - G.NEUTRAL) * G.LIFT;
    const trim = state.ship.trim * SHM.TRIM_ACCEL * (modules.works(state, 'Helm') ? 1 : 0);
    state.buoyancy = state.ship.gas > G.NEUTRAL + 5 ? 1 : state.ship.gas < G.NEUTRAL - 5 ? -1 : 0;
    state.sinking = state.buoyancy < 0;
    if (flying) {
      state.ship.vy = (state.ship.vy || 0) + (lift + trim - (state.ship.vy || 0) * G.DRAG) * dt;
      const bounds = altBounds(state);
      const hi = Math.max(bounds.hi, state.ship.alt);
      state.ship.alt += state.ship.vy * dt;
      if (state.ship.alt > hi) {
        state.ship.alt = hi;
        state.ship.vy = Math.min(0, state.ship.vy);
      }
      // Nearly out of gas on the ground: the hull grinds.
      if (state.course && state.course.scraping && state.ship.gas < G.SCRAPE_BELOW) damageHull(G.SCRAPE_DAMAGE * dt);
      if (state.ship.gas < 12 && !state.gasWarned) {
        state.gasWarned = true;
        state.ev.warn = 2.5;
        state.ev.warnText = state.gasHoles.length ? 'GASBAG EMPTY - PATCH IT AND PUMP!' : 'GASBAG EMPTY - PUMP IT UP!';
      } else if (state.ship.gas > 25) state.gasWarned = false;
    } else if (state.phase !== 'flying') {
      // Moored at the mast.
      state.ship.vy = 0;
      const home = (state.course && state.course.homeAlt) || 0;
      state.ship.alt += (home - state.ship.alt) * Math.min(1, dt * 0.4);
    }
    state.ship.shake = Math.max(0, state.ship.shake - dt);
    // Nose up while climbing, nose down while diving.
    const SH = config.SHIP;
    const climbRate = dt > 0 && state.lastAlt != null ? (state.ship.alt - state.lastAlt) / dt : 0;
    state.lastAlt = state.ship.alt;
    // (Speeding up lifts the nose a touch, braking dips it: she has weight.)
    const wantPitch = state.ship.down ? 0 : clamp(-climbRate * SH.TILT_PER_SPEED - (state.ship.accelX || 0) * SH.PITCH_PER_ACCEL, -SH.TILT_MAX, SH.TILT_MAX);
    state.ship.pitch = (state.ship.pitch || 0) + (wantPitch - (state.ship.pitch || 0)) * Math.min(1, dt * SH.TILT_SMOOTH);

    // Breaking apart: pieces fall, explosions go off, then the whole game starts over.
    if (state.ship.down > 0) {
      state.ship.down -= dt;
      state.wreck.t += dt;
      if (Math.random() < dt * 6) {
        const x = 100 + Math.random() * 1400;
        const y = 200 + Math.random() * 700;
        shipPuff(x, y + state.wreck.t * state.wreck.t * 60, Math.random() < 0.5 ? '#ff8c42' : '#555', 12);
      }
      if (state.ship.down <= 0) restartGame();
    }

    if (state.phase === 'lobby') {
      // Moored at the home mast: no enemies, the boiler and gasbag are kept topped up.
      state.ship.press = 65;
      state.ship.fuel = Math.max(state.ship.fuel, config.BOILER.START_FUEL);
      state.ship.gas = config.GAS.START;
    } else {
      threats.update(dt);
      // A new mission map: clear away the last one's enemies.
      if (state.course.justStarted) {
        state.course.justStarted = false;
        threats.reset();
        squadrons.reset();
        specials.reset();
        gunship.reset();
        state.enemy.dead = Math.max(state.enemy.dead, 6);
      }
      updateTempo(dt);
      squadrons.update(dt);
      escort.update(dt);
      specials.update(dt);
      gunship.update(dt);
      course.update(dt);
      weather.update(dt);
      gunship.settle(dt);
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
      if (shieldBlocks(bullet.x, bullet.y)) {
        bullet.life = 0;
        continue;
      }
      const sy = bullet.y + state.ship.alt;
      if (!bullet.miss && hitsShip(bullet.x, sy)) {
        bullet.life = 0;
        puff(bullet.x, bullet.y, '#ff7b00', 8);
        impact(bullet.x, sy, 1);
      }
    }

    // The shield also swats bats, rockets and falling bombs.
    if (state.shield.on) {
      for (const b of state.bats) if (b.delay <= 0 && !b.dead && !b.latched && shieldBlocks(b.x, b.y)) (b.dead = true), (state.kills += 1);
      for (const k of state.rockets || []) if (k.hp > 0 && shieldBlocks(k.x, k.y)) k.hp = 0;
      for (const b of state.enemyBombs) if (!b.dead && shieldBlocks(b.x, b.y)) b.dead = true;
    }
    state.shield.flash = Math.max(0, state.shield.flash - dt * 3);

    // Shots that hit something (life set to exactly 0) leave an impact ring; expired ones just go.
    for (const sh of state.shells) if (sh.life === 0) state.rings.push({ x: sh.x, y: sh.y, t: 0.3, max: 0.3, color: '#ffd23f', size: 90 });
    for (const b of state.bullets) if (b.life === 0) state.rings.push({ x: b.x, y: b.y, t: 0.25, max: 0.25, color: '#ff7b4a', size: 70 });
    if (state.shells.some((sh) => sh.life === 0)) state.sfxQ.push(['impact']);
    for (const arr of [state.bullets, state.shells]) {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i].life <= 0) arr.splice(i, 1);
    }
    for (const list of [state.flashes, state.rings]) {
      for (let i = list.length - 1; i >= 0; i--) if ((list[i].t -= dt) <= 0) list.splice(i, 1);
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
        state.fires.push({ x: clamp(fire.x + (Math.random() < 0.5 ? -1 : 1) * (100 + Math.random() * 60), p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d: fire.d, t: 0, prog: 0 });
        break;
      }
    }

    if (!state.ship.down) {
      const diff = config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal;
      state.ship.hull -= (state.breaches.length * 0.5 + state.fires.length * 0.35) * diff.damage * 2 * dt;
      if (state.ship.hull <= 0) wreck();
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
      state.ev.warnText = 'CAST OFF!';
    },
    onMarker,
    squadrons,
    specials,
    course,
    gunship,
    air,
    restart: () => restartGame(),
    puff,
    setSocket,
    countPlayers: () => Object.keys(state.players).length,
  };
}
