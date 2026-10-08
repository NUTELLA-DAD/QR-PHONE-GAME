import { createJobFinder } from './jobs.js';
import { updateCrewScale, sparesFor, spawnPace, damageMul, crewMul, autopilotOn, crewHeads } from './crewscale.js';
import { updateMates } from './mates.js';
import { config } from '../../config.js';
import { SHIP_LAYOUT, onLayoutChange, one, all, kindOf, deckIndex, hasKind, isNestDeck, nestTier, reviveSpot } from '../../shipLayout.js';
import { updateBot } from './bots.js';
import { moveWalker, steerTo, fall, detach, platformBelow } from './nav.js';
import { createModules } from './modules.js';
import { createThreats } from './threats.js';
import { createRaiders } from './raiders.js';
import { createCourse, inRock, tilt, altBounds, pilotPlan, gasFor } from './course.js';
import { createSquadrons } from './squadrons.js';
import { createEscort, isEscortStation, escortFor } from './escort.js';
import { createSpecials } from './specials.js';
import { createCoil } from './coil.js';
import { createSearchlights, isSearchlight } from './searchlight.js';
import { createGunship, MAIN_X1 } from './gunship.js';
import { createAirborne } from './airborne.js';
import { createHookshot } from './hookshot.js';
import { createHijack } from './hijack.js';
import { pop, updatePopups } from './popups.js';
import { createWeather } from './weather.js';
import { createEnvironment, favour } from './environments.js';
import { assistAim } from './aim.js';
import { createPrime } from './prime.js';
import { createLinks } from './links.js';
import { createSpotter } from './spotter.js';
import { UPGRADES, UPGRADE_BLOCKS } from './upgrades.js';
import { createGoingDown } from './goingDown.js';
import { createBalance } from './balance.js';
import { createSails, windSpeed } from './sails.js';
import { installBags, syncBags, refillBags, stepBags, watchBags } from './gasBags.js';
import { createMainShip, mainShip } from './ships.js';
import { toWorld, toShipX } from './pose.js';
import { bagNearX, bagEdgeY, bagName, rowOf } from './shipBuild.js';
import { generateVoyage, stopById, stopName, stopNo, stopTotal, envInfo, modeInfo, dailyVoyage, dailyBest, recordDaily, loadModePrefs, saveModePrefs, loadVoyageSave, saveVoyageSave } from './voyage.js';

const PLATFORMS = SHIP_LAYOUT.platforms;
const platformY = (d) => PLATFORMS[d].y;
let BAY_D; // the bomb bay's platform index (refreshed when a new ship build is applied)
const rebuildBayD = () => { BAY_D = PLATFORMS.findIndex((p) => p.id === 'bay'); };
rebuildBayD();
onLayoutChange(rebuildBayD);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Does a point (in ship coordinates) touch the ship? Gasbag, gondola, outriggers or ball turret.
const BAGS = SHIP_LAYOUT.gasbags; // the gasbags side by side (S.5d), tail to nose
function hitsShip(x, y) {
  for (const b of BAGS) if (((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2 < 1) return true;
  for (const r of SHIP_LAYOUT.hitRects) if (x > r.x0 && x < r.x1 && y > r.y0 && y <= r.y1) return true; // gondola, outriggers, top deck, belly compartments (from the build)
  return false;
}

// Which gasbag a hit at (x, y) lands on (its index, tail to nose), or -1: inside an envelope and above the gondola.
const onGasbag = (x, y) => (y < 455 ? BAGS.findIndex((b) => ((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2 < 1) : -1);

// A gasbag hole where the crew can reach it: on top near the crow's nest, or on the underside
// above the catwalk. (x, y) is the hole's drawn position on the envelope; bi = the bag it is in (the nearest, when not given).
// The hole remembers its bag (hole.bag): it leaks from that bag only.
function gasHoleAt(x, y, bi) {
  const nest = PLATFORMS.findIndex((p) => rowOf(p) === 'nest' && x > p.x0 - 60 && x < p.x1 + 60); // (a crow's nest over the hit, if there is one: a cut nest has two)
  const cat = deckIndex('catwalk');
  const bag = bi != null && BAGS[bi] ? bi : Math.max(0, bagNearX(BAGS, x));
  const GB = BAGS[bag];
  const edge = (hx, top) => bagEdgeY(GB, hx, top);
  if (y < GB.cy && nest >= 0) {
    const hx = Math.max(PLATFORMS[nest].x0 + 15, Math.min(PLATFORMS[nest].x1 - 15, x));
    return { x: hx, d: nest, y: edge(hx, true) + 34, prog: 0, bag };
  }
  let hx = Math.max(PLATFORMS[cat].x0 + 20, Math.min(PLATFORMS[cat].x1 - 20, x));
  let ex = hx; // where on the envelope the hole is drawn
  if (BAGS.length > 1) { // keep the hole under ITS bag when that bag is within reach of the top deck
    const lo = Math.max(PLATFORMS[cat].x0 + 20, GB.x0 + 20), hi = Math.min(PLATFORMS[cat].x1 - 20, GB.x1 - 20);
    if (lo <= hi) ex = hx = Math.max(lo, Math.min(hi, hx));
    else ex = Math.max(GB.x0 + 40, Math.min(GB.x1 - 40, hx)); // a bag beyond the end of the top deck: patched from the deck's end, drawn on the bag's nearest edge
  }
  return { x: hx, d: cat, y: edge(ex, false) - 22, prog: 0, bag };
}

// Which indoor/outdoor floor a hit at (x, y) lands on (holes and fires go there), or null (e.g. gasbag).
function roomPlatformAt(x, y) {
  const d = PLATFORMS.findIndex((p) => !isNestDeck(p.id) && x >= p.x0 && x <= p.x1 && y <= p.y + 15 && y >= p.y - 170);
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
  if (config.PVP.ENABLED) return; // (a Versus game never writes the co-op saves)
  try {
    localStorage.setItem('airshipRecord', JSON.stringify(r));
  } catch {
    // ignore
  }
}

// Fresh pacing-director state (see updateTempo).
const newTempo = () => ({ phase: 'build', t: config.PACING.BUILD, el: 0, mt: 0, rate: config.PACING.RATE_START, kind: null, last: null, spawned: false, tries: 0, peaks: 0, gunshipEnd: -999 });

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
    tempo: newTempo(), // build-up -> peak -> calm (breather)
    supply: null, // a supply balloon to catch during a calm { mx, my, t }
    gasValve: { input: 0, auto: false }, // +1 = pumping hot steam into the gasbag, -1 = venting
    shield: { ang: -Math.PI / 2, on: false, flash: 0 }, // the Deflector's arc (angle around the ship)
    upgrades: {}, // id -> times taken
    difficulty: config.START_DIFFICULTY,
    mode: config.VOYAGE.START_MODE, // session length (config.VOYAGE.MODES), picked in the lobby
    daily: false, // fly today's daily voyage (route seeded by the date)
    phase: 'lobby', // 'lobby' = moored at the mast while the crew joins; 'flying' after CAST OFF
    record: loadRecord(), // best run on this TV: { laps, kills }
    vote: null, // a vote in progress: the sky-dock shop or the route map
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
      Object.entries(SHIP_LAYOUT.gunMounts).map(([name, m]) => [name, { bx: m.bx, by: m.by, aim: m.aim, home: m.aim, arc: m.arc, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0, reach: 1 + config.NEST.TIER_BONUS * nestTier((SHIP_LAYOUT.stations.find((s) => s.n === name) || {}).p) }]),
    ),
  };
  state.ships = [createMainShip(state)]; // (B0: the ships in this sky; ships[0] wraps state.ship, SHIP_LAYOUT and course.dist by reference: ships.js, pose.js)
  installBags(state); // the gasbags side by side: state.bags, and state.ship.gas as their mean (gasBags.js)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const taken = (name) => Object.values(state.players).some((q) => q.lock === name);

  // Stations are asked for by KIND (shipLayout.js: one/all/kindOf); player.lock holds the station's name.
  const holder = (kind) => Object.values(state.players).find((q) => kindOf(q.lock) === kind); // whoever is on a station of this kind
  const worksKind = (kind) => { const s = one(kind); return !!s && modules.works(state, s.n); }; // is "the" station of this kind in working order
  const getHelm = () => holder('helm');

  const puff = (x, y, color, count = 6) => {
    for (let i = 0; i < count; i++) {
      state.puffs.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, max: 0.5, c: color });
    }
  };

  const T = config.TOOLS;
  const CTL = config.CONTROLS; // phone controls: grab lockout, hold-to-swap, hysteresis (Phase C)
  const modules = createModules();
  const jobFinder = createJobFinder(state);
  state.modules = modules.list;
  const PICKUPS = [];
  const rebuildPickups = () => { PICKUPS.length = 0; PICKUPS.push(...SHIP_LAYOUT.racks, ...SHIP_LAYOUT.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))); };
  rebuildPickups();
  onLayoutChange(rebuildPickups);
  const LOCKABLE_KINDS = ['helm', 'lookout', 'bombBay', 'deflector', 'coil', 'searchlight', 'escort', 'gun'];
  const LOCKABLE = (name) => LOCKABLE_KINDS.includes(kindOf(name)) || isSearchlight(name) || isEscortStation(name) || !!state.GUNS[name];
  // What the phone calls each kind of station (its button set and label).
  const PHONE_KIND = { helm: 'helm', gun: 'gun', boiler: 'boiler', lookout: 'lookout', bombBay: 'bombbay', deflector: 'shield', coil: 'coil', searchlight: 'light', escort: 'escort' };

  // Sunken Sea: crew on the lower decks wade slowly while the ship is flooded.
  const wadeMul = (p) => (p.d != null && PLATFORMS[p.d] && PLATFORMS[p.d].y >= SHIP_LAYOUT.lowDeckY && state.sea && state.sea.flood > 0 ? 1 - state.sea.flood * config.ENVIRONMENTS.sea.FLOOD.SLOW_CREW : 1);

  // What the Action button does for this player right now (or null) - the "use" half of interaction() below.
  // hold = keep the button held to make progress; otherwise a tap does it.
  // legacy (bots): one combined button, so racks, ammo, coal and stations are decided here too; people get those on GRAB (grabsFor).
  const useFor = (player, station, legacy) => {
    if (player.lock || player.conn != null || player.fall || player.swing || player.air) return null;
    const here = (o, r) => o.d === player.d && Math.abs(o.x - player.x) < r;
    const tool = player.carry;
    const revive = Object.values(state.players).find((q) => q !== player && q.ko > 0 && !q.fall && q.conn == null && here(q, 65));
    if (revive) return { type: 'revive', obj: revive, hold: true, time: T.REVIVE_TIME, label: `Revive ${revive.name}` };
    const boarding = gunship.interaction(player);
    if (boarding) return boarding;
    // Standing over the open bomb bay doors: jump out (parachute). Not while carrying ammo - that loads the bombs.
    if (!player.bot && player.d === BAY_D && tool !== 'ammo' && Math.abs(player.x - SHIP_LAYOUT.bombBay.jumpX) < CTL.BAY_JUMP_ZONE) return { type: 'jump', label: 'Jump!' };
    // Storm Front: while a bolt is charging, a lightning rod in reach comes first (hold Action = grounded).
    const rod = state.stormJob.charge && state.stormJob.rods.find((o) => here(o, 75));
    if (rod) return { type: 'rod', obj: rod, hold: true, time: 1, label: 'HOLD THE ROD!' };
    // Sunken Sea: the rescue winch in the bomb bay (a survivor is on the rope) and the bilge pump.
    const wi = state.sea.winch;
    if (wi && tool !== 'ammo' && here(wi, 75)) return { type: 'winch', obj: wi.obj, hold: true, time: 1, label: state.sea.hook === wi.obj ? 'WINCH UP THE SURVIVOR!' : 'Stand by the winch' };
    const pu = state.sea.pump;
    if (pu && state.sea.flood > 0.01 && here(pu, 75)) return { type: 'pump', obj: pu, hold: true, time: 1, label: 'Pump out the bilge' };
    const bomb = state.bombs.find((o) => here(o, 60));
    if (bomb) return { type: 'defuse', obj: bomb, hold: true, time: config.RAIDERS.DEFUSE_TIME, label: 'Defuse bomb' };
    const fire = state.fires.find((o) => here(o, 70));
    if (fire && tool === 'extinguisher') return { type: 'fire', obj: fire, hold: true, time: T.EXTINGUISH_TIME, label: 'Spray fire' };
    const hole = state.breaches.find((o) => here(o, 70));
    if (hole && tool === 'hammer') return { type: 'hole', obj: hole, hold: true, time: T.PATCH_TIME, label: 'Patch hole' };
    // Holding the right tool for a job in reach: the job wins over a nearby rack.
    const gasHole = state.gasHoles.find((o) => here(o, 60));
    if (gasHole && tool === 'hammer') return { type: 'gas', obj: gasHole, hold: true, time: T.PATCH_TIME, label: 'Patch gasbag' };
    const ice = state.icing.find((o) => here(o, 80));
    if (ice && tool === 'hammer') return { type: 'ice', obj: ice, hold: true, time: config.ENVIRONMENTS.frost.ICE.CHIP_TIME, label: 'Chip ice' };
    const clog = env.deep.clogNear(player); // Fungal Depths: spores on an engine (hold Action to clear)
    if (clog) return { type: 'unclog', obj: clog, hold: true, time: config.ENVIRONMENTS.fungal.CLOG.CLEAR_TIME, label: 'Clear spores' };
    const tank = env.deep.tankNear(player); // The Aether: the oxygen tank
    if (tank) return { type: 'oxygen', obj: tank, hold: true, time: config.ENVIRONMENTS.aether.OXYGEN.REFILL_TIME, label: 'Refill oxygen' };
    const hurt = modules.list.find((m) => m.hp < m.max && here(m, T.REACH + 15));
    if (hurt && tool === 'hammer') return { type: 'repair', obj: hurt, hold: true, label: `Repair ${hurt.name}` };
    // A gas valve (S.5d): shut or open the feed to its gasbag. Turned from VALVE_REACH, closer than a rack's reach, so it still works on a crowded deck.
    const gv = (SHIP_LAYOUT.gasValves || []).find((v) => here(v, T.VALVE_REACH));
    if (gv) { const i = SHIP_LAYOUT.gasValves.indexOf(gv); return { type: 'gasvalve', obj: gv, label: `${state.gasValveOpen[i] === false ? 'Open' : 'Close'} ${bagName(gv.bag, SHIP_LAYOUT.gasbags.length).toLowerCase()} valve` }; }
    // A mast and sail (S.5e): hold Action to haul the sail up, tap it to let it down.
    const sl = sails.actionFor(player, here);
    if (sl) return sl;
    // Otherwise standing at a rack or hook means take / swap / put back.
    const pickup = legacy ? PICKUPS.find((r) => here(r, T.REACH)) : null;
    // (carrying ammo or coal next to a gun or the boiler means load it, not swap it for a tool)
    if (pickup && pickup.kind === 'ice' && !(station && station.kind === 'boiler' && tool === 'ice')) return goingDown.lockerAction(player); // the ice locker
    if (!legacy && !(station && (tool === 'ammo' || tool === 'coal' || tool === 'ice')) && tool !== 'ice' && PICKUPS.some((r) => r.kind === 'ice' && here(r, T.REACH))) {
      const empty = goingDown.lockerAction(player); // (people: an empty ice locker still says so; taking ice is a GRAB action)
      if (empty.type === 'need') return empty;
    }
    if (pickup && !(station && (tool === 'ammo' || tool === 'coal' || tool === 'ice'))) return { type: 'rack', obj: pickup, label: tool === pickup.kind ? `Put back ${pickup.kind}` : tool && tool !== 'ammo' && tool !== 'coal' ? `Swap to ${pickup.kind}` : `Take ${pickup.kind}` };
    const vent = SHIP_LAYOUT.vents.find((v) => here(v, T.REACH));
    if (vent) return { type: 'vent', obj: vent, label: state.ventOpen[SHIP_LAYOUT.vents.indexOf(vent)] ? 'Close vent' : 'Open vent' };
    const valve = modules.list.find((m) => m.kind === 'pipe' && here(m, T.REACH));
    if (valve) return { type: 'valve', obj: valve, label: valve.open ? 'Close valve' : 'Open valve' };
    if (station) {
      const gun = state.GUNS[station.n];
      if (gun && tool === 'ammo' && gun.ammo < gun.max) return { type: 'load', obj: gun, station, label: 'Load ' + station.n };
      if (station.kind === 'bombBay' && tool === 'ammo' && state.bombBay.bombs < config.BOMBS.MAX) return { type: 'loadBombs', station, label: 'Load bombs' };
      if (legacy && station.kind === 'ammo' && tool !== 'ammo') return { type: 'ammo', station, label: 'Grab ammo' };
      if (legacy && station.kind === 'coal' && tool !== 'coal') return { type: 'coal', station, label: 'Grab coal' };
      if (station.kind === 'boiler' && tool === 'coal') {
        const full = state.ship.fuel > config.BOILER.FUEL_MAX - config.BOILER.COAL_FUEL && !goingDown.active(); // (while she falls, every load counts)
        return full ? { type: 'need', label: 'Firebox is full' } : { type: 'stoke', station, label: goingDown.active() ? 'LOAD COAL - LIFT!' : 'Load coal' };
      }
      if (station.kind === 'boiler' && tool === 'ice') return goingDown.coolAction(station);
      if (station.kind === 'boiler' && tool !== 'coal' && !player.mate) {
        const surge = links.surgeAction(station); // steam is up: hold Action to push it into the engines (or the coil)
        if (surge) return surge;
      }
      const loader = !player.mate && links.loaderAction(player, station); // a manned gun: hold Action to prime the shell for the gunner
      if (loader) return loader;
      if (legacy && LOCKABLE(station.n) && !taken(station.n) && !player.mate) return { type: 'station', station, label: 'Take ' + station.n }; // (a ship's mate never takes a station)
      // (people can always bump a bot off a station: that is a GRAB action too, see grabsFor)
    }
    if (fire) return { type: 'need', label: 'Need an extinguisher' };
    if (hole || hurt || gasHole) return { type: 'need', label: 'Need a hammer' };
    return null;
  };

  // The GRAB half (people only): take a tool, swap or put one back, grab ammo / coal / ice, hop onto a station.
  // Everything in reach is a candidate; the NEAREST wins, and the one you already had keeps the button until another is
  // CTL.HYSTERESIS closer (so labels don't flicker where two racks overlap). swap = it costs what is in your hands (hold GRAB).
  const grabsFor = (player, station) => {
    if (player.lock || player.conn != null || player.fall || player.swing || player.air) return null;
    const tool = player.carry;
    const out = [];
    const add = (act, x, key) => out.push({ act: { ...act, grab: true, swap: act.swap ?? !!tool }, x, key });
    if (!(station && (tool === 'ammo' || tool === 'coal' || tool === 'ice'))) {
      // (carrying ammo, coal or ice next to a station means use it there, not swap it for a tool)
      for (const r of PICKUPS) {
        if (r.d !== player.d || Math.abs(r.x - player.x) >= T.REACH) continue;
        if (r.kind === 'ice') {
          const a = goingDown.lockerAction(player); // the ice locker
          if (a.type !== 'need') add(a, r.x, 'locker');
        } else add({ type: 'rack', obj: r, label: tool === r.kind ? `Put back ${r.kind}` : tool ? `Swap to ${r.kind}` : `Take ${r.kind}`, swap: !!tool }, r.x, 'rack|' + r.kind + '|' + r.x);
      }
    }
    if (station) {
      if (station.kind === 'ammo' && tool !== 'ammo') add({ type: 'ammo', station, label: 'Grab ammo' }, station.x, 'ammo|' + station.n);
      if (station.kind === 'coal' && tool !== 'coal') add({ type: 'coal', station, label: 'Grab coal' }, station.x, 'coal|' + station.n);
      if (LOCKABLE(station.n) && !taken(station.n) && !player.mate) add({ type: 'station', station, label: 'Take ' + station.n, swap: false }, station.x, 'station|' + station.n); // (a ship's mate never takes a station)
      else {
        const botThere = !player.mate && Object.values(state.players).find((q) => q.bot && q.lock === station.n); // (people can always bump a bot off a station)
        if (botThere) add({ type: 'station', station, bump: botThere, label: 'Take ' + station.n, swap: false }, station.x, 'station|' + station.n);
      }
    }
    const best = sticky(player, 'grabKey', out, (o) => Math.abs(o.x - player.x), (o) => o.key);
    return best ? best.act : null;
  };

  // Nearest of list (smaller distOf wins), but the one remembered in player[field] keeps it until another is CTL.HYSTERESIS closer.
  const sticky = (player, field, list, distOf, keyOf) => {
    if (!list.length) {
      player[field] = null;
      return null;
    }
    let best = list[0];
    for (const o of list) if (distOf(o) < distOf(best)) best = o;
    const prev = list.find((o) => keyOf(o) === player[field]);
    if (prev && distOf(prev) <= distOf(best) + CTL.HYSTERESIS) best = prev;
    player[field] = keyOf(best);
    return best;
  };

  // What the two buttons do for this player right now: { use, grab } (grab is always null for bots, whose use is the old combined button).
  const interaction = (player, station) => ({ use: useFor(player, station, !!player.bot), grab: player.bot ? null : grabsFor(player, station) });

  // An id for a button action: the phone sends the id it was showing with each press, so the host can tell a press made on
  // an old label from one made on the current label (walking changes labels fast). Grabs include what is in hand (take vs put back).
  const aidOf = (act, carry) => (act ? act.type + '|' + (act.obj ? act.obj.name || act.obj.kind || act.obj.id || '' : act.station ? act.station.n : '') + (act.grab ? '|' + (carry || '') : '') : '');

  // The nearest latched bat this player can swat (same deck; gasbag bats are swatted from the catwalk), or null.
  const batInReach = (player, range, extra = 0) =>
    state.bats
      .filter((b) => b.latched && b.landed && b.hp > 0 && b.d === player.d && Math.abs(b.lx - player.x) < range + extra + (b.kind === 'gas' ? config.WAVES.BAT_SWAT_REACH : 0))
      .sort((a, b) => Math.abs(a.lx - player.x) - Math.abs(b.lx - player.x))[0] || null;

  // Attack button: a sword hurts raiders; bare hands only shove them back.
  const attack = (player) => {
    if (hookshot.onAttack(player)) return; // carrying the hookshot: fire it (or let go of the rope)
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
    const danger = 1 + (((state.course && state.course.danger) || 2) - 2) * config.VOYAGE.DANGER_DAMAGE; // skulls on the stop
    if (goingDown.protect()) return; // falling (the last stand) or just saved: nothing can hurt her
    if (!state.ship.down && (state.ship.hull -= amount * config.SHIP.HULL_DAMAGE * damageMul(state) * danger) <= 0) wreck();
  };

  // The hull gave out: the ship breaks apart, then the whole game starts over.
  function wreck(text = "SHE'S BREAKING UP!") {
    if (state.ship.down) return;
    if (goingDown.active()) return; // (she is already falling: the fall decides)
    if (goingDown.tryStart()) return; // the first time in a mission: GOING DOWN! - a last stand instead
    state.ship.hull = 0;
    const limp = canLimp(); // a spare gasbag takes the blow: the voyage goes on
    state.ship.down = limp ? config.LIMP.TIME : Math.max(config.WRECK.TIME, config.VOYAGE.WRECK_SUMMARY_TIME);
    state.wreck = { t: 0, lap: state.course ? state.course.lap : 1, kills: state.kills };
    state.ship.shake = 1.5;
    state.ev.warn = config.WRECK.TIME;
    state.ev.warnText = text;
    if (limp) return startLimp();
    // Laps fully flown still count toward this TV's record.
    const laps = state.wreck.lap - 1;
    if (laps > state.record.laps || (laps === state.record.laps && state.kills > state.record.kills)) {
      state.record = { laps, kills: state.kills };
      saveRecord(state.record);
      state.newRecord = true;
    }
    endRun(false);
  }

  // ---- Limp home: a wreck in a voyage costs a spare gasbag, not the voyage ----
  const canLimp = () => !!(state.run && state.run.spares > 0 && state.course && state.course.stop && !state.runEnd);
  // The break-up starts: the spare is used, some salvage is lost, the card says where she is limping to.
  function startLimp() {
    const run = state.run;
    run.spares -= 1;
    run.limps = (run.limps || 0) + 1;
    const lost = Math.round(run.salvage * config.LIMP.SALVAGE_LOSS);
    run.salvage -= lost;
    const prev = run.visited.length > 1 ? stopById(run.voyage, run.visited[run.visited.length - 2]) : null;
    state.limp = { spares: run.spares, max: run.sparesMax, lost, back: prev ? stopName(prev) : null };
    bankStats(true); // (what the crew did still counts for the awards)
  }
  // The break-up is over: patch her up and put her back at the last stop on the route (the first stop restarts itself).
  function finishLimp() {
    const run = state.run;
    state.limp = null;
    state.wreck = null;
    state.ship.down = 0;
    UPGRADES.find((u) => u.id === 'spare-parts').apply({ state, modules });
    Object.assign(state.ship, { hull: config.LIMP.HULL, speed: 0.3, shake: 0, press: 65, fuel: Math.max(state.ship.fuel, config.BOILER.START_FUEL), gas: config.GAS.START, pitch: 0, vy: 0, trim: 0 });
    Object.assign(state.gasValve, { input: 0, auto: false });
    state.ventOpen.fill(false);
    state.gasValveOpen.fill(true); // (every gas valve open again)
    Object.assign(state.bombBay, { cd: 0, empty: 0, aim: null, open: 0 });
    Object.assign(state.shield, { on: false, flash: 0 });
    state.tempo = newTempo();
    state.supply = null;
    for (const list of [state.shells, state.bullets, state.bombs || [], state.rockets || []]) list.length = 0;
    raiders.reset();
    threats.reset();
    squadrons.reset();
    escort.reset();
    hijack.reset();
    specials.reset();
    coil.reset();
    gunship.reset();
    goingDown.reset();
    for (const player of Object.values(state.players)) {
      const [e0, e1] = SHIP_LAYOUT.boarderEntryPoints;
      Object.assign(player, { ko: 0, lock: null, carry: null, conn: null, climb: false, fall: true, y: -60, x: e0.x + Math.random() * (e1.x - e0.x) });
      player.uk = null;
    }
    state.ev.warn = 4;
    state.ev.warnText = 'PATCHED UP - ' + run.spares + ' SPARE GASBAG' + (run.spares === 1 ? '' : 'S') + ' LEFT';
    const back = run.visited.length > 1;
    run.visited.pop(); // the stop she wrecked on does not count
    if (run.visited.length) run.stopId = run.visited[run.visited.length - 1];
    if (back) startDock(); // (the sky-dock of the stop she limps back to, then the route map)
    else goToStop(run.stopId); // (the very first stop: just try it again)
  }

  // The settings upgrades change, as they were at the start (only those blocks: see UPGRADE_BLOCKS).
  const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
  const pristine = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]])));
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
    state.limp = null;
    state.phase = 'lobby';
    state.upgrades = {};
    state.periscope = false;
    state.vote = null;
    state.scorecard = null;
    pendingVote = null;
    state.kills = 0;
    watch.kills = 0;
    watch.boss = null;
    newRun();
    state.ventOpen.fill(false);
    state.gasValveOpen.fill(true); // (every gas valve open again)
    Object.assign(state.bombBay, { bombs: config.BOMBS.START, cd: 0, empty: 0, aim: null, open: 0 });
    state.helmHit = 0;
    Object.assign(state.shield, { ang: -Math.PI / 2, on: false, flash: 0 });
    state.tempo = newTempo();
    state.supply = null;
    for (const list of [state.gasHoles, state.breaches, state.fires, state.shells, state.bullets, state.bombs || [], state.rockets || []]) list.length = 0;
    for (const [name, m] of Object.entries(SHIP_LAYOUT.gunMounts)) Object.assign(state.GUNS[name], { aim: m.aim, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0, auto: 0, prime: 0, primed: false });
    spotter.reset();
    raiders.reset();
    threats.reset();
    squadrons.restart();
    escort.reset();
    hijack.reset();
    specials.reset();
    coil.reset();
    searchlights.reset();
    gunship.reset();
    course.restart();
    modules.reset();
    goingDown.reset();
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

  // ---- The pacing director ----
  // One rhythm per mission: BUILD (a small trickle, rising) -> PEAK (one big set piece) -> CALM (nothing
  // new; stragglers leave; supply balloon; "ALL CLEAR") -> BUILD again. Every spawner runs its clock at
  // state.tempo.rate (0 = nothing spawns) and the director itself calls the set pieces.
  const missionPace = () => spawnPace(state);
  const lapNo = () => (state.course ? state.course.lap : 1);
  const buildTime = () => Math.max(config.PACING.BUILD_MIN, (config.PACING.BUILD * (1 - Math.min(0.5, (lapNo() - 1) * config.PACING.BUILD_PER_MISSION))) / missionPace());
  const sayBanner = (text, secs = 4) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const setPieces = {
    gunship: { text: 'GUNSHIP ON THE HORIZON!', go: () => gunship.spawn(), alive: () => !!state.gunship, max: () => config.PACING.GUNSHIP_PEAK_MAX },
    bombers: { text: 'BOMBER RAID INCOMING!', go: () => { const n = Math.max(1, Math.round((1 + (lapNo() > 1 ? 1 : 0) + (crewHeads(state) >= 10 ? 1 : 0)) * crewMul(state, 'count'))); for (let i = 0; i < n; i++) squadrons.spawnBomber(); return true; }, alive: () => state.bombers.length > 0 },
    strafers: { text: 'ENEMY SQUADRON - DOGFIGHTERS!', go: () => { squadrons.spawnStrafers(); return true; }, alive: () => state.strafers.length > 0 },
    swarm: { text: 'HUGE BAT SWARM!', go: () => { squadrons.spawnBigSwarm(); return true; }, alive: () => state.bats.some((b) => !b.dead && b.hp > 0 && !b.leaving) },
    imps: { text: 'IMP SWARM - GUNS AND SHIELD!', go: () => { specials.spawn.imps(); return true; }, alive: () => state.specials.imps.length > 0 },
  };
  const pickSetPiece = (tp) => {
    const pool = [];
    const add = (k, w) => { if (k !== tp.last) for (let i = 0; i < Math.round(w * favour(state, k)); i++) pool.push(k); }; // (the environment's enemy flavour scales each weight)
    add('swarm', 2);
    add('imps', 1);
    if (tp.peaks >= 1 || lapNo() > 1) {
      add('bombers', 2);
      add('strafers', 2);
      if (tp.mt > config.PACING.GUNSHIP_FIRST && tp.mt - tp.gunshipEnd > config.PACING.GUNSHIP_GAP && !state.gunship) add('gunship', 4);
    }
    return pool[(Math.random() * pool.length) | 0] || 'swarm';
  };
  const enterPhase = (tp, phase) => {
    const PC = config.PACING;
    tp.phase = phase;
    tp.el = 0;
    if (phase === 'build') {
      tp.t = buildTime();
      tp.rate = PC.RATE_START;
    } else if (phase === 'peak') {
      tp.kind = pickSetPiece(tp);
      tp.spawned = false;
      tp.tries = 0;
      tp.t = PC.PEAK_MAX;
      tp.peaks++;
    } else {
      tp.t = PC.CALM;
      tp.rate = 0;
      sayBanner('ALL CLEAR - REPAIR AND RESUPPLY', 5);
      spawnSupply();
    }
  };
  const updateTempo = (dt) => {
    const PC = config.PACING;
    const tp = state.tempo;
    if (state.ship.down) return;
    tp.mt += dt;
    tp.el += dt;
    tp.bossOk = tp.phase === 'build' || (tp.phase === 'calm' && tp.el > PC.CALM * 0.5); // (the boss never arrives in the middle of a set piece or straight after one)
    if (state.gunship) tp.gunshipEnd = tp.mt; // (the gap counts from when she is gone)
    // The mission boss is its own big moment: it holds the peak until it is gone, then the calm comes.
    if (state.boss) {
      if (tp.phase !== 'peak' || tp.kind !== 'boss') {
        tp.phase = 'peak';
        tp.kind = 'boss';
        tp.spawned = true;
        tp.el = 0;
        tp.peaks++;
      }
      tp.rate = 0;
      tp.t = PC.PEAK_MAX;
    } else if (tp.kind === 'boss' && tp.phase === 'peak') {
      tp.kind = null;
      enterPhase(tp, 'calm');
    } else if (tp.phase === 'build') {
      tp.t -= dt;
      tp.rate = PC.RATE_START + (PC.RATE_END - PC.RATE_START) * Math.min(1, tp.el / buildTime());
      if (tp.t <= 0 && !squadrons.bossSoon()) enterPhase(tp, 'peak'); // (the boss is the next set piece when it is close)
    } else if (tp.phase === 'peak') {
      const SP = setPieces[tp.kind] || setPieces.swarm;
      tp.rate = PC.PEAK_RATE;
      if (!tp.spawned) {
        // (the gunship needs clear sky off the bow: if she can't come, fall back to a swarm)
        if (tp.kind === 'gunship' && !SP.go()) {
          if ((tp.tries += dt) > 4) tp.kind = 'swarm';
        } else {
          if (tp.kind !== 'gunship') SP.go();
          tp.spawned = true;
          tp.last = tp.kind;
          tp.el = 0;
          sayBanner(SP.text, 4.5);
        }
        tp.t = PC.PEAK_MAX;
      } else {
        const over = (!SP.alive() || squadrons.bossSoon()) && tp.el >= PC.PEAK_MIN;
        const cap = tp.el >= (SP.max ? SP.max() : PC.PEAK_MAX);
        if (over || cap) enterPhase(tp, 'calm');
        tp.t = Math.max(0, (SP.max ? SP.max() : PC.PEAK_MAX) - tp.el);
      }
    } else {
      // CALM: nothing new; stragglers go home; then the next build-up.
      tp.rate = 0;
      tp.t -= dt;
      if (tp.el > PC.CALM_LEAVE) {
        const force = tp.el > PC.CALM_FORCE;
        const far = PC.CALM_FAR;
        gunship.retire();
        squadrons.withdraw(far, force);
        specials.withdraw(far, force);
        threats.withdraw(far, force);
      }
      if (tp.t <= 0) enterPhase(tp, 'build');
    }
    const sp = state.supply;
    if (sp) {
      sp.t -= dt;
      sp.bob = (sp.bob || 0) + dt;
      const wx = toShipX(mainShip(state), sp.mx);
      const wy = sp.my + Math.sin(sp.bob * 1.3) * 30;
      if (Math.hypot(wx - SHIP_LAYOUT.midPoint.x, wy - (SHIP_LAYOUT.midPoint.y - state.ship.alt)) < PC.SUPPLY_REACH) {
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
      const wx = SHIP_LAYOUT.midPoint.x + dx;
      const wy = SHIP_LAYOUT.midPoint.y - state.ship.alt + dy;
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
    const rate = (braking ? SH.BRAKE : SH.ACCEL) * Math.min(1, Math.abs(want - sp) * 4 + 0.25) * env.deep.helmMul() * state.env.accel * state.links.helmMul; // (The Aether: strong engines, thin air for the helmsman)
    state.ship.speed = sp + clamp(want - sp, -rate * dt, rate * dt);
    state.ship.accelX = dt > 0 ? (state.ship.speed - sp) / dt : 0;
  };

  // The helm is out in the open on the top deck: a hit right next to whoever is standing at it can
  // knock them out for a few seconds (red flash + HELMSMAN HIT!).
  const helmsmanHit = (x, y, power) => {
    const H = config.HELM_EXPOSED;
    const st = one('helm');
    if (!st) return;
    const cy = PLATFORMS[st.d].y - H.HIT_CY;
    if (Math.hypot(x - st.x, y - cy) > H.HIT_RADIUS * Math.min(2, Math.max(1, power))) return;
    const victim = Object.values(state.players).find((q) => !q.fall && !q.fly && !(q.ko > 0) && q.conn == null && q.d === st.d && (kindOf(q.lock) === 'helm' || Math.abs(q.x - st.x) < 45));
    state.helmHit = H.WARN_TIME; // flash even if nobody is home
    if (!victim || Math.random() >= H.KO_CHANCE) return;
    victim.ko = H.KO_TIME;
    victim.prog = 0;
    victim.lock = null;
    victim.fire = false;
    stat(victim, 'ko');
    phoneFx(victim, 'You were hit at the helm!', [120, 50, 120]);
    pop(state, st.x, cy - 70 - state.ship.alt, 'bigHit', '#e63946', 1.1);
    shipPuff(st.x, cy, '#e63946', 8);
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
    const coll = crewMul(state, 'collateral'); // (small crews: hits break fewer things)
    modules.hitAt(x, y, shipPuff, power, coll);
    helmsmanHit(x, y, power);
    const hitBag = onGasbag(x, y);
    if (hitBag >= 0) {
      if (state.gasHoles.length < config.GAS.MAX_HOLES && Math.random() < config.GAS.HOLE_CHANCE * coll) state.gasHoles.push(gasHoleAt(x, y, hitBag));
      damageHull(2 * power);
      return;
    }
    const d = roomPlatformAt(x, y);
    if (d !== null) {
      const p = PLATFORMS[d];
      const holes = power >= 2 ? (Math.random() < coll ? 2 : 1) : Math.random() < config.SHIP.HOLE_CHANCE * coll ? 1 : 0;
      for (let i = 0; i < holes && state.breaches.length < 10; i++) state.breaches.push({ x: clamp(x + (i - 0.5) * 70 * (holes - 1), p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d, prog: 0 });
      if (((power >= 2 && Math.random() < coll) || Math.random() < 0.35 * coll) && state.fires.length < 8) state.fires.push({ x: clamp(x + (Math.random() - 0.5) * 80, p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d, t: 0, prog: 0 });
    }
    damageHull(config.SHIP.HIT_DAMAGE * power);
  };

  // Per-player stats for the lap scorecard.
  const stat = (player, key, n = 1) => {
    if (!player || player.mate) return; // (ship's mates win no awards)
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
  const prime = createPrime({ state, phoneFx }); // primed shells: hold PRIME on a gun to charge the loaded shell (prime.js)
  const links = createLinks({ state, modules, shipPuff }); // linked stations: gun + loader, helm + lookout, boiler surge (links.js)
  const sails = createSails({ state, modules }); // wind and sails: the extra speed of raised sails, gust tears (sails.js)
  const balance = createBalance(state); // the seesaw: live centre of mass against the bag's lift (balance.js)
  const goingDown = createGoingDown({ state, phoneFx, puff, shipPuff, wreck: (t) => wreck(t), gasHoleAt }); // GOING DOWN! last stand + the ice locker (goingDown.js)
  state.gdJobs = goingDown.jobsFor; // (read by jobs.js)

  const raiders = createRaiders({ state, modules, puff, impact });
  const escort = createEscort({ state, puff, phoneFx });
  const threats = createThreats({ state, puff, impact, hitsShip, dropSquad: raiders.dropSquad, getHelm, credit });
  // ---- The Voyage: salvage, the sky-dock shop, the route map, and how a run ends ----
  const SV = config.SALVAGE;
  const SH = config.SHOP;
  const VY = config.VOYAGE;
  state.save = loadVoyageSave(); // best run, total runs, unlocks (this TV)
  Object.assign(state, loadModePrefs()); // the session mode picked last time (mode, daily)

  // What the lobby has picked, as a text: when it differs from the route already made, the route is made again at CAST OFF.
  const sessionKey = () => state.mode + '|' + (state.daily ? dailyVoyage().key : '');
  // A fresh voyage: a new route map from a new seed (or from today's date), an empty purse.
  const newRun = () => {
    const daily = state.daily ? dailyVoyage() : null;
    const voyage = generateVoyage(daily ? daily.seed : (Math.random() * 2 ** 31) | 0, { mode: state.mode });
    const first = voyage.columns[0][0];
    const M = modeInfo(state.mode);
    state.run = { voyage, stopId: first.id, visited: [first.id], salvage: 0, earned: 0, gain: {}, gunships: 0, kills: 0, crew: {}, bought: [], spares: sparesFor(state), sparesMax: sparesFor(state), limps: 0,
      mode: state.mode, key: sessionKey(), daily: daily && { key: daily.key, name: daily.name }, voyageNo: 1, voyages: M.voyages, base: 0, rival: M.rival };
    state.runEnd = null;
    state.salvagePop = null;
  };
  const curStop = () => stopById(state.run.voyage, state.run.stopId);
  // The mission number of a stop (bigger maps and tougher gunships as it grows).
  const missionNo = (stop) => stop.col + 1 + (state.run.voyageNo > 1 ? VY.SECOND.LEVEL_BONUS : 0);

  // The Evening Campaign: the first Flagship is down, so the crew docks at a harbour (keeping salvage and upgrades)
  // and a second, harder voyage is laid out from there.
  const nextVoyage = () => {
    const run = state.run;
    run.base += run.voyage.columns.length - 1;
    run.voyageNo++;
    const seed = run.daily ? (dailyVoyage().seed ^ 0x5bd1e995) & 0x7fffffff : (Math.random() * 2 ** 31) | 0;
    run.voyage = generateVoyage(seed, { mode: run.mode, voyageNo: run.voyageNo });
    run.stopId = run.voyage.columns[0][0].id;
    run.visited = [run.stopId];
    run.spares = run.sparesMax;
    addSalvage(VY.SECOND.SALVAGE_BONUS, 'mission');
    state.ship.hull = Math.min(100, state.ship.hull + VY.SECOND.HARBOUR_REPAIR);
    state.ev.warn = 5;
    state.ev.warnText = 'FIRST VOYAGE COMPLETE - THE CREW DOCKS!';
  };

  // What a stop asks of the course (see startMission in course.js).
  const missionOpts = (stop) => ({
    environment: stop.play,
    kind: stop.kind,
    danger: stop.danger,
    stop: { id: stop.id, col: stop.col, name: stopName(stop), env: stop.env, reward: stop.reward, flagship: stop.flagship },
    lengthMul: modeInfo(state.run.mode).lengthMul,
    title: `STOP ${stopNo(state.run, stop)}: ${stopName(stop).toUpperCase()} - ${stop.flagship ? 'SINK THE FLAGSHIP' : stop.kind === 'open' ? 'DESTROY THE OUTPOSTS' : 'REACH THE BEACON'}!`,
  });
  const firstMission = () => missionOpts(curStop());

  // Salvage in: kind is for the scorecard breakdown ('kills', 'outposts', 'gunships', 'boss', 'mission').
  const addSalvage = (n, kind, label) => {
    const run = state.run;
    n = Math.round(n);
    if (!run || n <= 0) return;
    run.salvage += n;
    run.earned += n;
    run.gain[kind] = (run.gain[kind] || 0) + n;
    if (label) state.salvagePop = { n, label, t: 3 };
  };

  // Watch for things worth salvage (kills, outposts, gunships, the boss) without touching those modules.
  const watch = { kills: 0, map: null, outposts: 0, boss: null };
  const salvageWatch = () => {
    if (state.kills < watch.kills) watch.kills = state.kills;
    if (state.kills > watch.kills) {
      const d = state.kills - watch.kills;
      watch.kills = state.kills;
      state.run.kills += d;
      addSalvage(d * SV.PER_KILL, 'kills');
    }
    if (state.rescueAward) { // Sunken Sea survivors winched aboard (envStormSea.js)
      addSalvage(state.rescueAward * SV.RESCUE, 'rescue', 'Survivor rescued!');
      state.run.rescued = (state.run.rescued || 0) + state.rescueAward;
      state.rescueAward = 0;
    }
    const map = state.course && state.course.map;
    if (map !== watch.map) {
      watch.map = map;
      watch.outposts = map ? map.outposts.filter((o) => o.done).length : 0;
    } else if (map) {
      const done = map.outposts.filter((o) => o.done).length;
      if (done > watch.outposts) addSalvage((done - watch.outposts) * SV.OUTPOST, 'outposts', 'Outpost destroyed');
      watch.outposts = done;
    }
    const g = state.gunship;
    if (g && g.phase === 'sinking' && !g.paid) {
      g.paid = true;
      state.run.gunships++;
      if (g.charge) addSalvage(SV.GUNSHIP_BOARDED, 'gunships', 'Gunship blown up by boarders!');
      else addSalvage(SV.GUNSHIP_SHOT, 'gunships', 'Gunship shot down');
    }
    if (state.boss) watch.boss = state.boss;
    else if (watch.boss) {
      if (watch.boss.hp <= 0) addSalvage(SV.BOSS, 'boss', 'Boss destroyed!');
      watch.boss = null;
    }
  };

  // Fold each player's per-mission stats into the run totals (for the end-of-run awards).
  const bankStats = (reset) => {
    for (const p of Object.values(state.players)) {
      if (p.mate) continue;
      const c = (state.run.crew[p.id] = state.run.crew[p.id] || { name: p.name, color: p.color, stats: {} });
      c.name = p.name;
      c.color = p.color;
      for (const [k, v] of Object.entries(p.stats || {})) c.stats[k] = (c.stats[k] || 0) + v;
      if (reset) p.stats = {};
    }
  };
  const awardRows = (list, wired) => {
    const rows = [];
    for (const a of AWARDS) {
      const best = list.reduce((b, p) => ((p.stats?.[a.key] || 0) > (b?.stats?.[a.key] || 0) ? p : b), null);
      const value = best?.stats?.[a.key] || 0;
      if (value > 0) {
        rows.push({ ...a, name: best.name, color: best.color, value: Math.round(value) });
        if (wired) phoneFx(best, `🏆 You're the ${a.title}!`, [60, 60, 60, 60, 120]);
      }
    }
    return rows;
  };

  // The run is over (ship lost, or the Flagship beaten): a summary for the TV, and the saved progress.
  const endRun = (victory) => {
    if (state.runEnd) return;
    const run = state.run;
    const stop = curStop();
    bankStats(false);
    const done = run.base + (victory ? stop.col + 1 : stop.col); // stops finished
    state.runEnd = {
      victory,
      reached: stopNo(run, stop),
      total: stopTotal(run),
      modeLabel: modeInfo(run.mode).label,
      voyageNo: run.voyageNo,
      voyages: run.voyages,
      daily: run.daily && run.daily.name,
      stopName: stopName(stop),
      done,
      salvage: run.earned,
      kills: run.kills,
      gunships: run.gunships,
      rows: awardRows(Object.values(run.crew), false).slice(0, 6),
      t: VY.VICTORY_TIME,
    };
    const s = state.save;
    s.totalRuns++;
    s.bestStops = Math.max(s.bestStops, done);
    s.bestSalvage = Math.max(s.bestSalvage, run.earned);
    if (victory) {
      s.victories++;
      if (!s.unlocks.includes('flagship-medal')) s.unlocks.push('flagship-medal');
    }
    if (run.daily) state.runEnd.dailyBest = recordDaily(s, run.daily.key, run.mode, { stops: done, victory, salvage: run.earned });
    saveVoyageSave(s);
    if (victory) {
      state.ev.warn = 6;
      state.ev.warnText = 'THE FLAGSHIP IS DOWN - VICTORY!';
    }
  };

  // ---- Votes (the sky-dock shop and the route map share this) ----
  const openVote = (v) => {
    state.vote = { ...v, total: 0 };
    for (const p of Object.values(state.players)) {
      p.vote = null;
      p.uk = null;
      p.voteAt = 1.5 + Math.random() * 3.5; // bots take a moment to "think"
      p.fire = false;
    }
  };
  const closeVote = () => {
    state.vote = null;
    for (const p of Object.values(state.players)) {
      p.vote = null;
      p.uk = null; // resend normal button labels
      if (!p.bot) emitPlayerUi(p.id, {}); // close the vote screen right away
    }
  };

  // Sky-dock offers: repairs that are actually needed, then random upgrades, then 'Cast off!'.
  const needsHull = () => state.ship.hull < 99 || state.breaches.length || state.fires.length || modules.list.some((m) => m.broken || m.hp < m.max - 0.5);
  const needsGas = () => state.bags.some((b) => b.gas < config.GAS.START * 0.95) || state.gasHoles.length;
  const needsCoal = () => state.ship.fuel < config.BOILER.FUEL_MAX * 0.85 || Object.values(state.GUNS).some((g) => g.ammo < g.max * 0.7) || state.bombBay.bombs < config.BOMBS.MAX;
  const upgradePrice = (u) => Math.round((SH.PRICES[u.id] || SH.PRICE_DEFAULT) * (1 + SH.REPEAT_PRICE * (state.upgrades[u.id] || 0)) / 5) * 5;
  const buildOffers = () => {
    const offers = [];
    if (needsHull()) offers.push({ id: 'repair-hull', kind: 'repair', name: 'Full Repair', icon: '🔧', desc: 'Hull, holes, fires and every broken part, as good as new.', cost: SH.REPAIR_HULL });
    if (needsGas()) offers.push({ id: 'repair-gas', kind: 'repair', name: 'New Gas', icon: '🎈', desc: 'Patch the gasbag and fill it up.', cost: SH.REPAIR_GAS });
    if (needsCoal()) offers.push({ id: 'repair-coal', kind: 'repair', name: 'Coal and Shells', icon: '⛏️', desc: 'Stoke the boiler, fill every gun and the bomb bay.', cost: SH.REPAIR_COAL });
    const open = UPGRADES.filter((u) => u.id !== 'spare-parts' && (state.upgrades[u.id] || 0) < u.max);
    while (offers.length < SH.OFFERS && open.length) {
      const u = open.splice((Math.random() * open.length) | 0, 1)[0];
      offers.push({ id: u.id, kind: 'upgrade', name: u.name, icon: u.icon, desc: u.desc, cost: upgradePrice(u), level: (state.upgrades[u.id] || 0) + 1, max: u.max });
    }
    offers.push({ id: 'cast', kind: 'cast', name: 'Cast off!', icon: '🚀', desc: 'Leave the dock and choose the next stop.', cost: 0 });
    return offers;
  };
  const applyOffer = (o) => {
    if (o.kind === 'upgrade') {
      UPGRADES.find((u) => u.id === o.id).apply({ state, modules });
      state.upgrades[o.id] = (state.upgrades[o.id] || 0) + 1;
    } else if (o.id === 'repair-hull') UPGRADES.find((u) => u.id === 'spare-parts').apply({ state, modules });
    else if (o.id === 'repair-gas') {
      refillBags(state, config.GAS.START);
      state.gasHoles.length = 0;
    } else if (o.id === 'repair-coal') {
      state.ship.fuel = config.BOILER.FUEL_MAX;
      for (const g of Object.values(state.GUNS)) g.ammo = g.max;
      state.bombBay.bombs = Math.max(state.bombBay.bombs, config.BOMBS.MAX);
    }
    state.run.bought.push(o.id);
  };
  // Is this card unavailable right now (bought already, or too dear)?
  const cardOff = (o) => o.kind !== 'cast' && (o.sold || o.cost > state.run.salvage);

  const startDock = () => {
    const options = buildOffers();
    if (options.every((o) => o.kind === 'cast' || cardOff(o))) return startRoute(); // nothing affordable: straight on
    openVote({ kind: 'dock', title: 'SKY-DOCK', options, t: SH.TIME });
  };

  const startRoute = () => {
    const stop = curStop();
    const options = stop.next.map((id) => {
      const s = stopById(state.run.voyage, id);
      const env = envInfo(s.env);
      return { id, kind: 'stop', name: stopName(s), icon: s.flagship ? '🚩' : env.icon, desc: `${VY.KIND_NAMES[s.kind] || s.kind} - ${'💀'.repeat(s.danger)} - reward ${s.reward}`, danger: s.danger, reward: s.reward, envName: env.name, color: env.color, kindName: VY.KIND_NAMES[s.kind] };
    });
    openVote({ kind: 'route', title: 'WHERE TO NEXT?', options, t: VY.ROUTE_TIME });
  };

  const goToStop = (id) => {
    const run = state.run;
    run.stopId = id;
    run.visited.push(id);
    course.startMission(missionNo(curStop()), missionOpts(curStop()));
  };

  // Bots vote sensibly: the dock - repair what's broken, else something they can afford, sometimes cast off.
  const botChoice = (v, p) => {
    const ok = v.options.map((o, i) => i).filter((i) => !cardOff(v.options[i]) && v.options[i].kind !== 'cast');
    const cast = v.options.findIndex((o) => o.kind === 'cast');
    if (v.kind === 'route') return (Math.random() * v.options.length) | 0;
    if (!ok.length) return cast;
    // A sensible crew fixes what is badly hurt first: the hull, then the gasbag, then coal and shells.
    const want = (id) => ok.find((i) => v.options[i].id === id);
    if (state.ship.hull < SH.BOT_REPAIR_HULL && want('repair-hull') != null) return want('repair-hull');
    if ((state.gasHoles.length >= 2 || state.ship.gas < 30) && want('repair-gas') != null) return want('repair-gas');
    if (Math.random() < SH.BOT_CAST_CHANCE) return cast;
    const rep = ok.filter((i) => v.options[i].kind === 'repair');
    if (rep.length && Math.random() < 0.7) return rep[(Math.random() * rep.length) | 0];
    return ok[(Math.random() * ok.length) | 0];
  };

  const updateVote = (dt) => {
    const v = state.vote;
    v.t -= dt;
    v.total += dt;
    const voters = Object.values(state.players).filter((p) => p.connected !== false && !p.mate);
    const valid = (i) => Number.isInteger(i) && i >= 0 && i < v.options.length && !(v.kind === 'dock' && cardOff(v.options[i]));
    for (const p of voters) {
      if (p.bot && p.vote == null && (p.voteAt -= dt) <= 0) p.vote = botChoice(v, p);
      if (p.bot) continue;
      // Tell each phone what's on offer and what it picked.
      const ui = {
        vote: {
          kind: v.kind,
          title: v.kind === 'dock' ? `SKY-DOCK - ${state.run.salvage} salvage` : v.title,
          t: Math.max(0, Math.ceil(v.t)),
          mine: valid(p.vote) ? p.vote : null,
          options: v.options.map((o) => ({ name: o.name, icon: o.icon, desc: o.desc, cost: o.kind === 'cast' || o.kind === 'stop' ? null : o.cost, off: v.kind === 'dock' && cardOff(o), sold: !!o.sold })),
        },
      };
      const key = 'vote|' + ui.vote.title + '|' + ui.vote.t + '|' + ui.vote.mine + '|' + ui.vote.options.map((o) => o.name + o.off + o.sold).join();
      if (key !== p.uk) {
        p.uk = key;
        emitPlayerUi(p.id, ui);
      }
    }
    const wait = v.kind === 'dock' ? SH.ALL_VOTED_WAIT : VY.ROUTE_ALL_VOTED_WAIT;
    if (voters.length && voters.every((p) => p.vote != null)) v.t = Math.min(v.t, wait);
    if (v.kind === 'dock' && v.total > SH.MAX_TIME) v.t = Math.min(v.t, 0);
    if (v.t > 0) return;
    // Count the votes; ties are settled at random. Nobody voting: the dock closes, the route picks at random.
    const counts = v.options.map((_, i) => voters.filter((p) => p.vote === i && valid(i)).length);
    const best = Math.max(...counts);
    const idx = v.options.map((_, i) => i);
    let pick;
    if (best === 0) pick = v.kind === 'dock' ? v.options.findIndex((o) => o.kind === 'cast') : (Math.random() * v.options.length) | 0;
    else {
      const tied = idx.filter((i) => counts[i] === best);
      pick = tied[(Math.random() * tied.length) | 0];
    }
    if (v.total > SH.MAX_TIME && v.kind === 'dock') pick = v.options.findIndex((o) => o.kind === 'cast');
    const o = v.options[pick];
    if (v.kind === 'route') {
      closeVote();
      return goToStop(o.id);
    }
    if (o.kind === 'cast') {
      closeVote();
      return startRoute();
    }
    // Buy it, then keep shopping while there is anything left to afford.
    state.run.salvage -= o.cost;
    applyOffer(o);
    o.sold = true;
    state.ev.warn = 3;
    state.ev.warnText = `BOUGHT: ${o.name.toUpperCase()}!`;
    if (v.options.every((x) => x.kind === 'cast' || cardOff(x))) {
      closeVote();
      return startRoute();
    }
    v.t = SH.TIME;
    for (const p of Object.values(state.players)) {
      p.vote = null;
      p.uk = null;
      p.voteAt = 1 + Math.random() * 3;
    }
  };

  // Back home: show the mission scorecard for a few seconds, then the sky-dock (or the victory screen).
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
    if (m.kind !== 'home') return;
    goingDown.missionDone(); // (reaching home while falling: she limps in)
    // A new record for this TV?
    const laps = m.lap - 1;
    if (laps > state.record.laps || (laps === state.record.laps && state.kills > state.record.kills)) {
      state.record = { laps, kills: state.kills };
      saveRecord(state.record);
      state.newRecord = true;
    }
    const run = state.run;
    const stop = curStop();
    addSalvage(SV.MISSION + stop.reward, 'mission');
    const rows = awardRows(Object.values(state.players).filter((p) => !p.mate), true);
    bankStats(true);
    state.scorecard = {
      lap: m.lap - 1,
      stopName: stopName(stop),
      flagship: stop.flagship,
      rows,
      t: config.VOTE.SCORECARD_TIME,
      gain: { ...run.gain },
      gained: Object.values(run.gain).reduce((a, b) => a + b, 0),
      total: run.salvage,
    };
    run.gain = {};
    pendingVote = stop.flagship ? 'victory' : 'dock';
  };

  newRun();
  const course = createCourse({ state, impact, puff, onMarker, credit, hitsShip, firstMission });

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
  const searchlights = createSearchlights({ state });
  const gunship = createGunship({ state, puff, impact, credit, dropOne: raiders.dropOne, pickType: raiders.pickType, spawnBats: (from, n) => squadrons.spawnBats(from, n) });
  const weather = createWeather({ state, impact, puff });
  const env = createEnvironment({ state, puff, phoneFx, impact, damageHull }); // ice, thermals, blizzards (rules in environments.js)
  const air = createAirborne({ state, puff, phoneFx });
  const hijack = createHijack({ state, puff, phoneFx, air }); // stolen dogfighters
  const hookshot = createHookshot({ state, puff, phoneFx, air, hijack }); // personal grappling hook
  state.stunts = { cast: hookshot.cast, origin: hookshot.origin, surfaces: air.surfaces, bigFighter: hijack.bigFighter }; // (read by the bots' daring stunts, bots.js)
  // Her deck is somewhere to land too: leap (or get thrown) across and you're aboard.
  // Every deck of hers is a landing surface (she can have up to 4 stepped decks; the deck numbers run left to right as she is now).
  for (let k = 0; k < 4; k++) {
    air.addSurface({
      id: 'gunship' + k,
      y: () => { const s = gunship.surface(k); return s ? s.y : null; },
      x0: () => { const s = gunship.surface(k); return s ? s.x0 : 0; },
      x1: () => { const s = gunship.surface(k); return s ? s.x1 : 0; },
      onLand: (p) => gunship.land(p, k),
    });
  }

  const emitPlayerUi = (playerId, ui) => {
    if (socket && !state.players[playerId]?.bot) socket.emit('host:ui', { id: playerId, ui });
  };

  const spotter = createSpotter({ state, emit: emitPlayerUi, phoneFx }); // phone radar, spotting and HELP! (spotter.js)

  const setSocket = (nextSocket) => {
    socket = nextSocket;
  };

  // After any pickup / put-back / swap / station take: a short buzz (two pulses for letting go) and the grab lockout, so a
  // second press right behind the first (a double tap) can't undo it. Bots have no phone and no lockout.
  const grabbed = (player, drop) => {
    if (player.bot) return;
    player.grabLock = CTL.GRAB_LOCK;
    phoneFx(player, null, drop ? [30, 50, 30] : [25]);
  };

  // The phone sends the id of the label it was showing with each press (see aidOf). trackAid remembers the ids the two
  // buttons show now and just before, with the actions behind them; slot 'a' = Action, 'g' = Grab.
  const trackAid = (player, slot, act) => {
    const m = ((player.aids ??= {})[slot] ??= { cur: '', act: null, prev: null, prevAct: null, t: 0 });
    const aid = aidOf(act, player.carry);
    if (m.cur !== aid) {
      m.prev = m.cur;
      m.prevAct = m.act;
      m.t = performance.now();
      m.cur = aid;
    }
    m.act = act;
  };
  // Actions that are safe to run a moment after their label went away (static things: racks, vents, valves, crates).
  const REPLAY = ['rack', 'vent', 'valve', 'gasvalve', 'ammo', 'coal'];
  // What a tapped button should run for a person: { ok, act }. Not ok = drop the press: its label is out of date, or it is a grab
  // inside the lockout. A press with no id (an old page, a test) is trusted. The big button never grabs with something in hand.
  const pressAct = (player, slot, aid, act) => {
    const m = player.aids && player.aids[slot];
    let run = act;
    if (aid !== undefined && m && aid !== m.cur) {
      const grace = aid === m.prev && performance.now() - m.t < CTL.AID_GRACE * 1000 && m.prevAct && REPLAY.includes(m.prevAct.type);
      if (!grace) return { ok: false };
      run = m.prevAct;
    }
    if (run && run.grab && ((player.grabLock || 0) > 0 || (slot === 'a' && player.carry))) return { ok: false };
    return { ok: true, act: run };
  };
  // Hold actions (fire:1) count only while the id the phone held on is still what the button shows.
  const holdOk = (player) => player.bot || player.fireAid === undefined || !player.aids || !player.aids.a || player.fireAid === player.aids.a.cur;

  // Run what a tapped button does (act may be null: a shout). The chain is one list for bots and people.
  const doTap = (player, act) => {
    const type = act ? act.type : null;
    if (type === 'jump') {
      state.bombBay.open = Math.max(state.bombBay.open || 0, 1.6); // the doors swing open under you
      air.jumpChute(player);
      stat(player, 'jumps');
      phoneFx(player, 'Jumping! Steer with the stick - the chute opens in a moment', [60, 40, 60]);
    } else if (type === 'hook') {
      if (gunship.fireHook()) {
        stat(player, 'boarding');
        puff(player.x + 200, player.y - 60 - state.ship.alt, '#ffe9a8', 8);
        phoneFx(player, 'Hooked! Press Action at the bow to swing across!', [40, 30, 40]);
      } else phoneFx(player, 'Too far - the hook falls short! Get closer.', [40, 30, 40]);
    } else if (type === 'swing') gunship.swing(player);
    else if (type === 'rack') {
      const put = player.carry === act.obj.kind;
      player.carry = put ? null : act.obj.kind;
      grabbed(player, put);
    } else if (type === 'vent') {
      const i = SHIP_LAYOUT.vents.indexOf(act.obj);
      state.ventOpen[i] = !state.ventOpen[i];
      stat(player, 'vent');
      shipPuff(act.obj.x, PLATFORMS[act.obj.d].y - 150, '#ffffff', 8);
    } else if (type === 'gasvalve') {
      const i = SHIP_LAYOUT.gasValves.indexOf(act.obj);
      state.gasValveOpen[i] = !state.gasValveOpen[i];
      syncBags(state); // (the bag is cut off, or fed again, from this moment)
      shipPuff(act.obj.x, PLATFORMS[act.obj.d].y - 60, state.gasValveOpen[i] ? '#9cc99a' : '#e2a24a', 7);
      pop(state, act.obj.x, PLATFORMS[act.obj.d].y - 140 - state.ship.alt, `${bagName(act.obj.bag, state.bags.length)} VALVE ${state.gasValveOpen[i] ? 'OPEN' : 'SHUT'}`, state.gasValveOpen[i] ? '#9cc99a' : '#e2a24a', 0.9);
      state.valveLog = (state.valveLog || 0) + 1; // (how many times a gas valve was turned: botsim reports it)
      if (!state.gasValveOpen[i]) state.valveShuts = (state.valveShuts || 0) + 1;
    } else if (type === 'sail') {
      if (!act.hold) {
        sails.lower(act.obj);
        stat(player, 'sails');
        phoneFx(player, 'Sail coming down', [30]);
      }
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
    } else if (type === 'ammo') {
      player.carry = 'ammo';
      grabbed(player, false);
    } else if (type === 'coal') {
      player.carry = 'coal';
      grabbed(player, false);
    } else if (type === 'icetake') {
      if (goingDown.takeIce(player)) grabbed(player, false);
    } else if (type === 'icegive') {
      goingDown.giveIce(player);
      grabbed(player, true);
    } else if (type === 'cool') goingDown.throwIce(player);
    else if (type === 'stoke') {
      state.ship.fuel = Math.min(config.BOILER.FUEL_MAX, state.ship.fuel + config.BOILER.COAL_FUEL);
      stat(player, 'coal');
      (state.boilerLoads ??= {})[act.station.n] = (state.boilerLoads[act.station.n] || 0) + 1; // (loads per boiler: bots spread coal between boilers, tools/buildsim.mjs checks both are used)
      goingDown.onStoke(player);
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
      grabbed(player, false);
      player.x = act.station.x;
    } else if (!act || !act.hold) player.actT = performance.now();
  };

  // Throw away the presses and holds a person's phone queued up, so they can't fire later when the game is taking input again
  // (scorecard, votes, the run-end screen, the pause menu, being knocked out or falling). Bots manage their own button state.
  const flushPresses = (p) => {
    if (p.bot) return;
    p.actQ = p.atkQ = p.jumpQ = p.grabQ = false;
    p.fire = false;
    p.prime = false;
  };
  const flushAll = () => { for (const p of Object.values(state.players)) flushPresses(p); };

  const update = (dt) => {
    syncBags(state); // (a new build was applied at the dock: fit the gasbags to it)
    updateMates(state, dt); // (ship's mates come aboard or go home before the crew count is read)
    updateCrewScale(state, dt);
    let helmFlown = false; // did someone steer this frame
    let gasManned = false; // is someone working the gas (the helm's PRESSURE lever)
    state.ship.trim = 0;
    // The lap scorecard pauses the action, then the upgrade vote starts.
    if (state.scorecard) {
      flushAll();
      if ((state.scorecard.t -= dt) <= 0) {
        state.scorecard = null;
        state.newRecord = false;
        const next = pendingVote;
        pendingVote = null;
        if (next === 'victory' && state.run.voyageNo < state.run.voyages) {
          nextVoyage();
          startDock();
        } else if (next === 'victory') endRun(true);
        else if (next === 'dock') startDock();
      }
      return;
    }
    // The victory screen holds the game, then a new voyage starts back at the mast.
    if (state.runEnd && !state.wreck) {
      flushAll();
      if ((state.runEnd.t -= dt) <= 0) restartGame();
      return;
    }
    if (state.salvagePop && (state.salvagePop.t -= dt) <= 0) state.salvagePop = null;
    // While the crew votes on an upgrade, the action is paused.
    if (state.vote) {
      flushAll();
      updateVote(dt);
      return;
    }
    for (const player of Object.values(state.players)) {
      if (player.bot) updateBot(player, state, dt);
      if (player.koGrace > 0) player.koGrace -= dt;
      if (player.hook && (player.fall || player.ko > 0 || player.lock || player.swing || player.conn != null || player.connected === false)) hookshot.clear(player);
      if (player.swing) {
        gunship.swingStep(player, dt);
        player.actQ = false;
        player.jumpQ = false;
        flushPresses(player);
        continue;
      }
      if (player.fall) {
        player.jumpQ = false;
        flushPresses(player);
        player.air = false;
        player.jz = 0;
        player.fly = false;
        fall(player, dt, player.tumble ? air.tumble(player, dt) : 260, (w) => {
          air.clear(w);
          // Fell off the ship (or off a gunship): back aboard in the medical bay, dazed (no medbay: on the spawn deck at a boarding point).
          const rv = reviveSpot();
          w.d = rv.d;
          w.x = rv.medbay ? rv.x + (Math.random() - 0.5) * 60 : rv.x;
          w.y = PLATFORMS[w.d].y;
          w.fall = false;
          w.ko = config.GUNSHIP.RESPAWN_TIME;
          w.carry = null;
          phoneFx(w, rv.medbay ? 'You fell! Coming round in the medical bay...' : 'You fell! You scramble back aboard, dazed...', [80, 40, 80]);
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
        flushPresses(player);
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
          player.koGrace = config.RAIDERS.WAKE_GRACE;
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
        if (player.hj) hijack.leave(player); // LEAVE in a stolen plane: bail out under a parachute
      }
      if (player.connected === false) {
        player.lock = null;
        player.fire = false;
      }
      const nearStations = !player.lock && player.conn == null ? SHIP_LAYOUT.stations.filter((s) => s.d === player.d && Math.abs(player.x - s.x) < T.STATION_REACH) : [];
      // (people keep the station they were already at until another is clearly closer; bots just take the nearest)
      const station = player.bot ? nearStations.sort((a, b) => Math.abs(player.x - a.x) - Math.abs(player.x - b.x))[0] || null : sticky(player, 'stKey', nearStations, (s) => Math.abs(player.x - s.x), (s) => s.n);

      if (!player.lock) player.prime = false;
      if (player.hj) {
        hijack.rider(player, dt); // flying a stolen dogfighter (kick the pilot out, then steer)
        if (!player.bot) player.act = player.grabAct = null;
      } else if (player.lock) {
        player.moving = false;
        player.climb = false;
        const gun = state.GUNS[player.lock];
        const working = modules.works(state, player.lock);
        if (kindOf(player.lock) === 'helm') {
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
        } else if (kindOf(player.lock) === 'deflector') {
          // Swing the shield round toward where the stick points.
          if (working && Math.hypot(player.jx, player.jy) > 0.3) {
            const want = Math.atan2(player.jy, player.jx);
            const d = angleDiff(want, state.shield.ang);
            const step = config.SHIELD.TURN * dt;
            state.shield.ang += Math.max(-step, Math.min(step, d));
            state.shield.ang = Math.atan2(Math.sin(state.shield.ang), Math.cos(state.shield.ang));
          }
        } else if (kindOf(player.lock) === 'bombBay') {
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
          prime.charge(player, gun, working, dt);
          // Turn toward the stick, but only within this gun's firing arc (a broken gun is jammed).
          if (working && Math.hypot(player.jx, player.jy) > 0.25) {
            const A = config.AIM_ASSIST;
            const wanted = assistAim(state, gun, Math.atan2(player.jy, player.jx), A.ANGLE, A.STRENGTH);
            gun.aim = gun.home + clamp(angleDiff(wanted, gun.home), -gun.arc, gun.arc);
          }
          if ((player.actQ || player.fire) && gun.cd <= 0 && !state.ship.down) {
            if (!working || gun.ammo <= 0 || env.gunJammed(player.lock)) {
              gun.cd = 0.5;
              gun.empty = 0.8;
              gun.emptyText = !working ? 'BROKEN!' : gun.ammo <= 0 ? 'EMPTY!' : 'ICED - CHIP IT!';
            } else {
              gun.ammo -= 1;
              gun.cd = config.GUNS.COOLDOWN * env.gunCooldownMul(player.lock);
              const angle = gun.aim + (state.ship.pitch || 0);
              const [gx, gy] = tilt(state, gun.bx, gun.by);
              const primed = prime.take(gun); // a fully primed shell: harder hit, bigger blast (config PRIME)
              state.shells.push({
                x: gx + Math.cos(angle) * 60,
                y: gy - state.ship.alt + Math.sin(angle) * 60,
                vx: Math.cos(angle) * config.GUNS.SHELL_SPEED,
                vy: Math.sin(angle) * config.GUNS.SHELL_SPEED,
                life: config.GUNS.SHELL_LIFE * (gun.reach || 1),
                owner: player.id,
                ...(primed ? { mul: config.PRIME.DAMAGE_MUL, primed: true } : {}),
              });
              puff(gx + Math.cos(angle) * 64, gy - state.ship.alt + Math.sin(angle) * 64, primed ? '#ff9a2e' : '#ffe9a8', primed ? 12 : 4);
              state.flashes.push({ x: gx + Math.cos(angle) * 70, y: gy - state.ship.alt + Math.sin(angle) * 70, ang: angle, t: primed ? 0.17 : 0.09, color: primed ? '#ff9a2e' : '#fff2b0', size: primed ? 2.7 : 1.3 });
              if (primed) {
                state.rings.push({ x: gx + Math.cos(angle) * 64, y: gy - state.ship.alt + Math.sin(angle) * 64, t: 0.3, max: 0.3, color: '#ffd23f', size: 110 });
                state.sfxQ.push(['bigshot']);
              }
            }
          }
        }
        if (gun) player.face = Math.cos(gun.aim) < 0 ? -1 : 1;
        else if (isSearchlight(player.lock)) player.face = Math.cos(state.searchlights.find((l) => l.n === player.lock).aim) < 0 ? -1 : 1;
        player.actQ = false;
        player.jumpQ = false;
        player.act = null;
        player.grabAct = null;
      } else {
        // Hop: a short arc over the deck (jz = height above it, vy = upward speed). Not on ladders
        // or at a station. Kept simple so airborne play (jumping overboard) can extend it later.
        const M = config.MOVE;
        player.jumpCd = Math.max(0, (player.jumpCd || 0) - dt);
        if (player.hook && player.jumpQ && hookshot.onJump(player)) player.jumpQ = false; // JUMP lets go of the rope
        hookshot.fly(player, dt); // the hook's own flight (and its cooldown)
        if (player.jumpQ && player.conn != null && !player.air) air.jumpOff(player); // leap off a ladder into free flight
        if (player.jumpQ && !player.air && player.conn == null && player.jumpCd <= 0) {
          player.air = true;
          player.vy = M.JUMP_VY;
          player.jz = 0;
          if (!player.onGunship) air.vault(player); // outside deck + stick held down: hop over the rail into free flight
        }
        player.jumpQ = false;
        hookshot.pre(player, dt); // rope and reel (only if hooked on)
        if (player.fly) {
          if (air.step(player, dt)) {
            hookshot.post(player, dt);
            // free flight (off a deck end, over the rail, thrown, or swinging): may land on a plane, or catch a ladder
            if (!hijack.touch(player) && player.fly && air.grab(player)) hookshot.clear(player);
          }
        } else if (player.air) {
          // Steer (a bit less than on the ground), no ladders while airborne.
          (player.onGunship ? gunship.walk : moveWalker)(player, (player.jx || 0) * M.JUMP_AIR_CONTROL, 0, dt, M.WALK_SPEED * env.deep.walkMul(player) * wadeMul(player));
          player.vy -= M.JUMP_GRAVITY * state.env.gravity * dt; // (low gravity in The Aether: higher, longer hops)
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
          gunship.walk(player, player.jx || 0, player.jy || 0, dt, M.WALK_SPEED * env.deep.walkMul(player)); // aboard a gunship she carries them
        } else {
          moveWalker(player, player.jx || 0, player.jy || 0, dt, M.WALK_SPEED * env.deep.walkMul(player) * wadeMul(player), player.conn != null && !player.bot && Math.abs(player.jy || 0) > 0.9 ? config.AIR.CLIMB_FAST : 1);
          air.edgeCheck(player, dt, false); // walking off the end of an outside deck
        }
        if (!player.fly && !player.onGunship) air.standing(player, dt);
        player.moving = !player.climb && Math.abs(player.jx) > 0.15;
        const sel = interaction(player, station);
        let act = sel.use;
        const grabAct = sel.grab;
        if (!player.bot) {
          // Empty hands and nothing to use: the first pickup is on the big button too (with something in hand it never swaps or drops).
          if ((!act || act.type === 'need') && !player.carry && grabAct) act = grabAct;
          trackAid(player, 'a', act);
          trackAid(player, 'g', grabAct);
        }
        player.act = act;
        player.grabAct = grabAct;

        // Holding the button: revive, spray, patch or repair.
        if (act && act.hold && player.fire && holdOk(player)) {
          const object = act.obj;
          if (act.type === 'repair') {
            if (modules.repair(object, dt)) {
              puff(object.pos.x, object.pos.y - state.ship.alt, '#8fe388', 10);
              stat(player, 'repairs');
              pop(state, object.pos.x, object.pos.y - 50 - state.ship.alt, 'repair', '#8fe388', 0.8);
            }
          } else if (act.type === 'rod') env.stormSea.rodHold(object);
          else if (act.type === 'pump') env.stormSea.pumpWork(dt);
          else if (act.type === 'winch') env.stormSea.winchWork(object, dt);
          else if (act.type === 'prime') prime.assist(player, object, act.gunner, dt);
          else if (act.type === 'surge') links.surgeHold(player);
          else if (act.type === 'sail') {
            const before = object.hoist;
            sails.haul(object, dt);
            if (before < 1 && object.hoist >= 1) { stat(player, 'sails'); state.sailStats.raised++; pop(state, player.x, player.y - 150 - state.ship.alt, 'SAIL UP!', '#e9dcc0', 0.8); }
          } else {
            object.worked = true;
            object.prog = (object.prog || 0) + dt / act.time;
            if (object.prog >= 1) {
              object.prog = 0;
              stat(player, { fire: 'fires', hole: 'holes', gas: 'holes', ice: 'ice', unclog: 'clears', oxygen: 'oxygen', defuse: 'defused', revive: 'revives', sabotage: 'sabotage', cutline: 'boarding' }[act.type]);
              if (act.type === 'fire') pop(state, object.x, player.y - 120 - state.ship.alt, 'fireOut', '#9fd3e6', 0.8);
              if (act.type === 'hole' || act.type === 'gas') pop(state, object.x, player.y - 120 - state.ship.alt, 'patch', '#8fe388', 0.8);
              if (act.type === 'fire') state.fires.splice(state.fires.indexOf(object), 1);
              else if (act.type === 'hole') {
                state.breaches.splice(state.breaches.indexOf(object), 1);
                state.ship.hull = Math.min(100, state.ship.hull + 3);
              } else if (act.type === 'defuse') state.bombs.splice(state.bombs.indexOf(object), 1);
              else if (act.type === 'gas') state.gasHoles.splice(state.gasHoles.indexOf(object), 1);
              else if (act.type === 'ice') env.chip(object);
              else if (act.type === 'unclog') env.deep.unclog(object);
              else if (act.type === 'oxygen') env.deep.refill();
              else if (act.type === 'sabotage') gunship.plant(player);
              else if (act.type === 'cutline') gunship.cutLine(player);
              else object.ko = 0;
              puff(object.x, player.y - 50, '#8fe388', 10);
            }
          }
        }

        // Tapping the button (people: only if the id the phone sent matches what the button shows; GRAB has its own button).
        if (player.actQ) {
          player.actQ = false;
          const run = player.bot ? { ok: true, act } : pressAct(player, 'a', player.actAid, act);
          if (run.ok) doTap(player, run.act);
          else player.uk = null; // (stale label: resend the phone's buttons)
        }
        if (player.grabQ) {
          player.grabQ = false;
          const run = pressAct(player, 'g', player.grabAid, grabAct);
          if (run.ok && run.act) doTap(player, run.act);
        }
        if (player.atkQ) attack(player);
      }
      player.atkQ = false;
      player.grabQ = false;
      if (player.grabLock > 0) player.grabLock = Math.max(0, player.grabLock - dt);
      player.atkCd = Math.max(0, (player.atkCd || 0) - dt);

      // Idle crew get an arrow to the most useful nearby job (phone + a chevron on the TV).
      if (!player.bot && !player.hj) jobFinder.update(player, dt);
      const jobUi = player.bot || player.hj ? null : jobFinder.ui(player);

      // Tell the phone what its buttons do now.
      const stationName = player.lock || (station && station.n) || null;
      const gun = state.GUNS[stationName];
      const stKind = kindOf(stationName); // (the station's kind from the layout; `kind` below is the phone's name for it)
      const kind = PHONE_KIND[stKind] || (gun ? 'gun' : isSearchlight(stationName) ? 'light' : isEscortStation(stationName) ? 'escort' : null);
      const takenBySomeone = !player.lock && !!stationName && LOCKABLE(stationName) && Object.values(state.players).some((q) => q.lock === stationName && (q.bot ? player.bot : true));
      let label = 'Hey!';
      let hold = false;
      if (player.lock) {
        const working = modules.works(state, player.lock);
        label = !working && kind !== 'helm' && kind !== 'lookout' && kind !== 'light' && kind !== 'escort' ? 'BROKEN' : kind === 'gun' ? 'FIRE!' : kind === 'bombbay' ? 'DROP!' : kind === 'shield' ? 'Swing!' : kind === 'escort' ? ((escortFor(state, player.lock) || {}).flying ? 'Auto guns' : 'Wait...') : kind === 'coil' ? (state.coil.cd > 0 ? 'Cooling...' : 'CHARGE!') : kind === 'boiler' ? 'SHOVEL!' : kind === 'lookout' ? 'Ahoy!' : kind === 'light' ? 'FOCUS!' : 'Honk!';
        hold = kind === 'gun' || kind === 'bombbay' || kind === 'coil' || kind === 'light';
      } else if (player.act) {
        label = player.act.label;
        hold = !!player.act.hold;
      }
      if (player.fly) label = player.chuteOpen ? 'Steer!' : player.chute ? 'Chute...' : player.fvy > 0 ? 'Falling!' : 'Airborne';
      if (player.hook && player.hook.phase === 'caught') {
        label = 'Reel in (hold)';
        hold = true;
      }
      if (player.hj) {
        label = hijack.kickText(player);
        hold = player.hj.phase === 'kick';
      }
      const actModule = player.act && player.act.obj && modules.byName[player.act.obj.name] === player.act.obj ? player.act.obj.name : null;
      let status = stationName ? modules.status(state, stationName) : actModule ? modules.status(state, actModule) : '';
      if (kind === 'helm' && player.lock && !status) status = course.helmHint();
      if (isEscortStation(stationName) && !status) status = escort.status(stationName);
      if (kind === 'light' && player.lock && !status) status = searchlights.status(stationName);
      const feel = state.buoyancy > 0 ? 'RISING' : state.buoyancy < 0 ? 'FALLING' : 'holding';
      const leakNow = modules.leaks()[0];
      const leakText = leakNow ? (leakNow.pipe && leakNow.pipe.open ? `${leakNow.m.name} pipe leaking - close the valve or repair` : `${leakNow.m.name} leaking steam - repair it`) : '';
      if (kind === 'helm' && player.lock && !status && state.rig && !state.rig.boiler) status = `Hand wheel - no boiler, no steam: the lever can only VENT gas (down), the trim is weak${state.rig.engine ? ', the engines are dead' : ''}. The wind carries her.`;
      if (kind === 'boiler' && !status && leakText) status = `Steam ${Math.round(state.ship.press / 5) * 5}% - ${leakText}`;
      if (kind === 'boiler' && !status) status = `Steam ${Math.round(state.ship.press / 5) * 5}% - coal ${Math.round(state.ship.fuel / 5) * 5}%`;
      if (kind === 'helm' && player.lock && !status && (state.ship.press < config.GAS.PUMP_MIN_PRESS || state.gasHoles.length)) status = `Gas ${Math.round(state.ship.gas)}% - ${feel}${state.ship.press < config.GAS.PUMP_MIN_PRESS ? ' - NO STEAM TO PUMP!' : ''}${state.gasHoles.length ? ' - ' + state.gasHoles.length + ' holes leaking' : ''}`;
      if (kind === 'helm' && player.lock && !status && state.buoyancy) status = state.buoyancy > 0 ? 'Gasbag full - she is rising' : 'Gasbag low - she is dropping';
      if (gun && !status && env.gunIce(stationName) > 0.35) status = env.gunJammed(stationName) ? 'ICED - CHIP IT! (hammer)' : 'Gun is icing up - chip it (hammer)';
      if (!status && !player.lock && goingDown.active()) status = goingDown.status();
      if (!status && state.ship.press >= config.BOILER.WARN_AT) status = 'PRESSURE HIGH - open a vent!';
      if (!status && !player.bot) status = env.deep.status(player) || ''; // spores (cough), clogged engines, oxygen
      const ammoText = gun ? gun.ammo : kind === 'bombbay' ? state.bombBay.bombs : null;
      let attackLabel = !player.lock && player.conn == null && batInReach(player, config.WAVES.BAT_NOTICE) ? 'Swat bat!' : player.carry === 'sword' ? 'Swing' : player.carry === 'hookshot' ? 'Hook!' : 'Shove';
      if (player.hook && player.hook.phase === 'caught') attackLabel = 'Let go!';
      if (player.lock && gun && !player.hj) attackLabel = 'Prime'; // (on a gun the left button charges the shell)
      const primePct = player.lock && gun ? (gun.primed ? 10 : Math.round((gun.prime || 0) * 10)) : 0;
      const loadAct = !player.lock && player.act && player.act.type === 'prime' ? player.act : null; // loading for a gunner: the Action button shows the meter
      const loadPct = loadAct ? Math.round((loadAct.obj.prime || 0) * 10) : -1;
      if (gun && player.lock && !status && (gun.loadT || 0) > 0 && state.players[gun.loaderId]) status = state.players[gun.loaderId].name + ' is loading for you!';
      if (player.hj) {
        attackLabel = player.hj.phase === 'kick' ? 'Kick!' : 'Guns auto';
        if (player.hj.phase === 'kick') status = 'Tap any button 3 times (or hold Action) to throw the pilot out - LEAVE to jump off';
        else status = 'Fuel ' + Math.max(0, Math.round(player.hj.fuel / 5) * 5) + 's - hull ' + Math.max(0, player.hj.hp) + '/' + player.hj.max;
      }
      const hull = Math.round(state.ship.hull / 5) * 5;
      // (the two buttons: Action = label / id, Grab = the small amber button; ids go back with each press, see aidOf)
      const grabNow = player.bot || player.lock || player.hj || player.fly ? null : player.grabAct;
      const aid = player.bot || player.lock || player.hj ? '' : aidOf(player.act, player.carry);
      const gaid = grabNow ? aidOf(grabNow, player.carry) : '';
      const glock = !!(grabNow && player.grabLock > 0);
      const progNow = !player.lock && player.act && player.act.hold && player.act.obj && typeof player.act.obj.prog === 'number' ? Math.round(player.act.obj.prog * 10) : -1; // (how far a hold action has got)
      const key = [player.hj ? 'hj' + player.hj.phase : stationName, player.hj ? 'hijack' : kind, !!(player.lock || player.hj), takenBySomeone, label, ammoText, player.carry || '', hold, status, attackLabel, hull, primePct, loadPct, jobUi ? jobUi.label + '|' + jobUi.dir : '', aid, gaid, grabNow ? grabNow.label + grabNow.swap : '', glock, progNow].join('|');
      if (key !== player.uk) {
        player.uk = key;
        if (!player.bot) {
          player.ui = { station: player.hj ? 'Stolen Fighter' : stationName, kind: player.hj ? 'hijack' : kind, locked: !!(player.lock || player.hj), taken: takenBySomeone, label, ammo: ammoText, carry: player.carry || null, hold, status, attack: attackLabel, hull, prime: primePct, load: loadPct, job: jobUi, aid, grab: grabNow ? grabNow.label : null, gaid, gswap: !!(grabNow && grabNow.swap), glock, prog: progNow };
          emitPlayerUi(player.id, player.ui);
        }
      }
    }

    state.lookout = state.periscope || Object.values(state.players).some((q) => kindOf(q.lock) === 'lookout');
    state.lookoutBonus = Object.values(state.players).some((q) => kindOf(q.lock) === 'lookout' && nestTier((SHIP_LAYOUT.stations.find((s) => s.n === q.lock) || {}).p)) ? config.NEST.TIER_BONUS : 0; // (a lookout up on the high nest sees further ahead)
    updatePopups(state, dt);
    spotter.update(dt);
    links.update(dt);
    modules.update(state, dt);
    sails.update(dt); // (raised sails: the extra speed, gust tears)
    // What the ship has to fly with (S.5e): none of these is needed to fly, each one missing just takes some control away.
    const rig = { helm: hasKind('helm'), boiler: hasKind('boiler'), engine: hasKind('engine') };
    rig.powered = rig.boiler && rig.engine; // (engines to push her and steam to drive them; otherwise the wind alone carries her, plus her sails)
    rig.pump = rig.boiler && rig.helm; // (the helm's pressure lever works the pump and the vent)
    state.rig = rig;
    // Steam pressure: heat from the coal in the firebox in, steam used by everything powered,
    // open vents and burst pipes out (all using more at higher pressure).
    const BO = config.BOILER;
    let heat = 0;
    // (Several boilers share one firebox pool and one steam pool: each extra working boiler burns and heats BO.EXTRA_BOILER more.)
    const lit = modules.boilers().filter((m) => !m.broken).length;
    if (state.ship.fuel > 0 && lit > 0) {
      const boost = 1 + (lit - 1) * BO.EXTRA_BOILER;
      state.ship.fuel = Math.max(0, state.ship.fuel - BO.BURN_RATE * boost * dt);
      // More coal = hotter fire, but with diminishing returns (a load lasts about a minute).
      heat = ((BO.HEAT_MAX * state.ship.fuel) / (state.ship.fuel + BO.HEAT_HALF)) * boost;
    }
    const openVents = state.ventOpen.filter(Boolean).length;
    state.shield.on = !!holder('deflector') && worksKind('deflector') && state.phase === 'flying';
    const coilOp = holder('coil');
    coil.update(dt, coilOp || null, worksKind('coil'));
    searchlights.update(dt);
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
    if (rig.boiler && (state.ship.press >= BO.BLOWOUT_AT || (hot > 0 && Math.random() < BO.BLOWOUT_RATE * hot * dt))) {
      // The boiler blows: damage it and burst a random steam pipe.
      state.ship.press = 75;
      state.boilerBlew = true; // (read by tools/botsim.mjs)
      const hotBoilers = all('boiler'); // (with several boilers, one of them blows)
      const boiler = hotBoilers.length > 1 ? hotBoilers[(Math.random() * hotBoilers.length) | 0] : hotBoilers[0];
      puff(boiler.x, platformY(boiler.d) - 70 - state.ship.alt, '#fff', 20);
      pop(state, boiler.x, platformY(boiler.d) - 160 - state.ship.alt, 'boiler', '#ff5a1f', 1.6);
      modules.damage(modules.byName[boiler.n], config.MODULES.BOILER_BLOWOUT_DAMAGE, shipPuff);
      const pipes = modules.list.filter((m) => m.kind === 'pipe' && !m.broken);
      if (pipes.length) modules.damage(pipes[(Math.random() * pipes.length) | 0], 999, shipPuff);
      state.ship.shake = 0.6;
      state.ev.warn = 3;
      state.ev.warnText = 'THE BOILER BLEW! A PIPE BURST!';
    }

    balance.update(dt);
    const wind = windSpeed(state); // (the wind alone: what a ship with no engines, no steam or nobody steering makes)
    const maxSpeed = rig.powered ? clamp(state.ship.press / 50, 0.05, 1) * modules.engineFactor(state) * (1 - state.balance.slow) : wind * (1 - state.balance.slow); // (a tail-heavy ship drags her tail)
    if (state.ship.speed > maxSpeed) state.ship.speed = rig.powered ? state.ship.speed + (maxSpeed - state.ship.speed) * Math.min(1, dt * 2) : maxSpeed; // (nothing pushes a ship with no engines or no steam faster than the wind, whatever the lever says)
    const maxReverse = -maxSpeed * config.SHIP.REVERSE;
    if (state.ship.speed < maxReverse) state.ship.speed += (maxReverse - state.ship.speed) * Math.min(1, dt * 2);

    const bay = state.bombBay;
    bay.cd = Math.max(0, bay.cd - dt);
    bay.empty = Math.max(0, bay.empty - dt);
    bay.open = Math.max(0, (bay.open || 0) - dt);
    state.helmHit = Math.max(0, (state.helmHit || 0) - dt);
    if (holder('bombBay') && state.phase === 'flying') {
      const [bx, by] = tilt(state, SHIP_LAYOUT.bombBay.x, SHIP_LAYOUT.bombBay.y);
      bay.from = { x: bx, y: by - state.ship.alt + 20 };
      bay.aim = course.predictBomb(bx, by - state.ship.alt + 20);
    } else bay.aim = null;
    for (const [gunName, gun] of Object.entries(state.GUNS)) {
      gun.empty = Math.max(0, gun.empty - dt);
      if (!taken(gunName)) prime.idle(gun, dt); // (a half-charge fades when nobody is holding it; the glow timer always runs)
      else gun.primedFlash = Math.max(0, (gun.primedFlash || 0) - dt);
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
    const flying = state.phase === 'flying' && !state.ship.down;
    state.autopilot = false;
    // Easy/Normal: with nobody at the helm the ship flies itself, gently.
    const assist = autopilotOn(state) && flying;
    const plan = assist && rig.helm && (!getHelm() || !gasManned) ? pilotPlan(state, 4, 0.3) : null;
    if (!getHelm()) {
      if (plan && worksKind('helm')) {
        state.autopilot = true;
        driveSpeed(plan.speed, dt);
        state.ship.trim = clamp((plan.target - state.ship.alt) / 150, -1, 1) * 0.6;
      } else driveSpeed(flying ? (rig.helm ? 0.2 : wind) : 0.3, dt); // (no helm at all: nobody can steer, she goes where the wind takes her)
    }
    if (!gasManned) valve.input = plan ? gasFor(state, plan.target) * 0.6 : 0;
    valve.auto = !gasManned && !!plan;

    // Gas: the valve pumps hot steam in (costs pressure; needs steam) or vents it. Hot gas slowly
    // cools and seeps out, and holes leak more.
    if (flying) {
      state.noPump = !rig.pump; // (no helm or no boiler: nobody can ever top her up, so the bag only seeps very slowly, see gasBags.js)
      const pumping = Math.max(0, valve.input) * (state.ship.press > G.PUMP_MIN_PRESS && modules.boilerUp() ? Math.min(1, state.ship.press / 60) : 0);
      state.steamParts.pump = pumping * G.PUMP_STEAM;
      // The pump and the vent act on every gasbag at once; seepage and holes are per bag (gasBags.js: with one bag this is the old single gas value).
      stepBags(state, pumping * G.PUMP_RATE * (1 + config.BOILER.OD_PUMP * state.overdrive) * state.links.helmMul + Math.min(0, valve.input) * G.VENT_RATE * state.links.helmMul, dt);
      state.ship.press = Math.max(0, state.ship.press - pumping * G.PUMP_STEAM * dt);
      watchBags(state); // a bag going flat: "FORE BAG DOWN!"
      // Emergency ballast: the gasbag is empty and the ship is dropping - the crew cuts loose ballast so she hovers for a
      // moment (time to patch and pump). Once in a while only; it is a lifeline, not a fix.
      const BL = G.BALLAST;
      state.ballastCd = Math.max(0, (state.ballastCd || 0) - dt);
      if (BL && state.ship.gas < BL.BELOW && state.ballastCd <= 0) {
        state.ship.gas = BL.TO;
        state.ship.vy = Math.max(state.ship.vy || 0, 0);
        state.ballastCd = BL.COOLDOWN;
        state.ev.warn = 3;
        state.ev.warnText = 'BALLAST DROPPED! PATCH THE BAG AND PUMP!';
        shipPuff(800, 700, '#c9a85a', 14);
      }
    }
    // Lift: above the neutral fill she accelerates up, below it she drops (fast at the extremes).
    // The helm's little trim engine adds a nudge.
    // (ice weight shifts the level she needs to hover; lava thermals push her up - state.env, environments.js)
    const effGas = state.ship.gas - state.env.sink + state.env.lift / G.LIFT;
    const lift = (effGas - G.NEUTRAL) * G.LIFT;
    const trim = state.ship.trim * SHM.TRIM_ACCEL * (worksKind('helm') ? (modules.handWheel() ? config.WIND.HAND_TRIM : 1) : 0) * env.deep.helmMul() * state.links.helmMul; // (a lookout in the nest sharpens the helm: links.js)
    state.buoyancy = effGas > G.NEUTRAL + 5 ? 1 : effGas < G.NEUTRAL - 5 ? -1 : 0;
    state.sinking = state.buoyancy < 0;
    if (flying) {
      state.ship.vy = (state.ship.vy || 0) + (lift + trim + state.balance.push - (state.ship.vy || 0) * G.DRAG) * dt;
      const bounds = altBounds(state);
      const hi = Math.max(bounds.hi, state.ship.alt);
      state.ship.alt += state.ship.vy * dt;
      if (state.ship.alt > hi) {
        state.ship.alt = hi;
        state.ship.vy = Math.min(0, state.ship.vy);
      }
      // Nearly out of gas on the ground: the hull grinds.
      if (state.course && state.course.scraping && state.ship.gas < G.SCRAPE_BELOW) damageHull(G.SCRAPE_DAMAGE * dt);
      if (state.course && state.course.scraping && state.balance.scrape) damageHull(state.balance.scrape * dt); // a nose-heavy bow digs in
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
    goingDown.update(dt); // the last stand: sinking, the meters, the ice locker (goingDown.js)
    // Nose up while climbing, nose down while diving.
    const SH = config.SHIP;
    const climbRate = dt > 0 && state.lastAlt != null ? (state.ship.alt - state.lastAlt) / dt : 0;
    state.lastAlt = state.ship.alt;
    // (Speeding up lifts the nose a touch, braking dips it: she has weight.)
    const wantPitch = state.ship.down ? 0 : clamp(-climbRate * SH.TILT_PER_SPEED - (state.ship.accelX || 0) * SH.PITCH_PER_ACCEL, -SH.TILT_MAX, SH.TILT_MAX) + goingDown.pitch() + state.balance.restPitch; // (restPitch: the trim of an unbalanced ship, balance.js)
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
      if (state.ship.down <= 0) (state.limp ? finishLimp() : restartGame());
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
        state.tempo = newTempo();
        state.enemy.dead = Math.max(state.enemy.dead, 6);
        goingDown.newMission(); // (the last stand is back for the new mission)
      }
      if (config.PVP.ENABLED) state.tempo.rate = 0; // (Versus: no pacing director and no AI enemies, only the other ship)
      else updateTempo(dt);
      if (goingDown.active()) state.tempo.rate = Math.min(state.tempo.rate, config.GOING_DOWN.ENEMY_RATE); // (few new enemies while she falls)
      if (!config.PVP.ENABLED) squadrons.update(dt);
      escort.update(dt);
      hijack.update(dt);
      if (!config.PVP.ENABLED) specials.update(dt);
      if (!config.PVP.ENABLED) gunship.update(dt);
      course.update(dt);
      weather.update(dt);
      env.update(dt);
      gunship.settle(dt);
      salvageWatch();
    }

    for (const bullet of state.bullets) {
      if (bullet.ay) bullet.vy += bullet.ay * dt; // (a mortar shell lobs in an arc)
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
        impact(bullet.x, sy, bullet.dmg || 1);
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
    for (const sh of [...state.shells]) if (sh.life === 0 && sh.primed) prime.burst(sh); // (a primed shell bursts into splinters)
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
    for (const object of [...state.breaches, ...state.fires, ...state.bombs, ...state.gasHoles, ...state.icing, ...state.clogs, state.o2tank]) {
      if (!object.worked) object.prog = Math.max(0, (object.prog || 0) - dt * 0.4);
      object.worked = false;
    }
    for (const fire of state.fires) {
      if ((fire.t += dt) > config.FIRE.SPREAD_EVERY / crewMul(state, 'spread') && state.fires.length < 8) {
        fire.t = 0;
        const p = PLATFORMS[fire.d];
        state.fires.push({ x: clamp(fire.x + (Math.random() < 0.5 ? -1 : 1) * (100 + Math.random() * 60), p.x0 + 20, (p.id === 'main' ? MAIN_X1 : p.x1) - 20), d: fire.d, t: 0, prog: 0 });
        break;
      }
    }

    if (!state.ship.down && !goingDown.protect()) {
      state.ship.hull -= (state.breaches.length * 0.5 + state.fires.length * 0.35) * damageMul(state) * 2 * dt;
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
    impact, // (a hit on the ship at ship coordinates; the gasbag gate in tools/buildsim.mjs shoots her with it)
    gasHoleAt,
    // What the PvP bridge may do to this ship from outside (pvp/bridge.js; ship coordinates, like impact): is a point on the ship,
    // hit it, open a gasbag hole, and where a ship point is in the world (world x along the course, world y downward: the same frame as shells and the map).
    external: { hitsShip, impact, gasHoleAt, worldPos: (x, y) => toWorld(mainShip(state), x, y) },
    interaction,
    modules,
    startDock,
    startRoute,
    castOff: () => {
      if (state.phase !== 'lobby') return;
      if (state.run.key !== sessionKey()) { // (the lobby changed the mode or the daily voyage after the route was made)
        newRun();
        course.startMission(1, firstMission());
      }
      updateCrewScale(state, 0); // (settle the spare gasbags and crew factors for the chosen difficulty)
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
    flushPresses: flushAll, // (the pause menu: presses made while paused must not fire on resume)
    // Pick the session mode / daily voyage (lobby and pause menu); remembered on this TV. Flying runs finish as they are.
    setSession: (mode, daily) => {
      if (config.VOYAGE.MODES[mode]) state.mode = mode;
      if (daily != null) state.daily = !!daily;
      saveModePrefs(state);
    },
    dailyInfo: () => {
      const d = dailyVoyage();
      return { ...d, best: dailyBest(state.save, d.key, state.mode) };
    },
    puff,
    setSocket,
    countPlayers: () => Object.keys(state.players).length,
  };
}
