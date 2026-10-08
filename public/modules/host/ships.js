// SHIPS: the multi-ship machinery (MOVEMENT.md, Option B, stages B0 and B.2). Node-safe: no DOM.
//
// The game is ONE simulation that understands MANY ships (the player's, a PvP rival, later the enemy gunship), so more airships can always be added.
//
//   ship = { id,        'player' for the main ship (ships[0]); 'ship1', 'ship2' ... for the others
//            main,      true for ships[0], the one the sky scrolls past and the enemies hunt (until B7)
//            team,      the PvP team object (state.team) or null (a getter: the bridge sets it after the sim is made)
//            layout,    the ship's Layout instance (shipLayout.js createLayout; ship 0's is SHIP_LAYOUT, updated in place by applyBuild)
//            nav,       the ship's navigation (nav.js createNav(layout): route tables, lift speeds; ship 0's is nav.js mainNav)
//            state,     the ship's BODY: hull, gas, alt, speed, pitch ... (ship 0: today's state.ship, the same object)
//            world,     the host state it lives in (map, weather, enemies, players ...; a handle for the pose and the accessors)
//            pose,      pose.js: where she is and which way she faces
//            ctx,       her CONTEXT VIEW (below): what her subsystems are handed instead of the world state
//            sim }      her systems (shipSim.js createShipSim): modules, bags, guns, fires, crew handling ... set by simulation.js addShip
//
//   mainShip(state)           the ship `state` is about: the world answers ships[0], a ship's context answers that ship (so a subsystem built on ctx finds its OWN)
//   shipOf(state, player)     the ship a player is aboard (player.ship = a ship id; none = the main ship)
//   eachShip(state, fn)       fn(ship, index) for every ship
//   crewOf(state, ship)       the players aboard her (player.ship === ship.id; none = ships[0])
//   transfer(state, player, ship, platform, x)   the only way a player changes ship
//
// ---- THE CONTEXT VIEW ------------------------------------------------------------------------------------------------------------------------------
// ship.ctx = Object.create(world). It looks exactly like today's `state` to a subsystem (modules, bags, fires, jobs, bots ... all read `state.X`), but the
// SHIP-SCOPED keys (SHIP_KEYS: ship, GUNS, bags, fires, gasHoles, bombBay, balance ...) are the ship's own, and everything shared (tempo, shells, bullets, env, weather,
// save, sfxQ, ev, phase, the course map ...) falls through to the world by the prototype. ctx.players is the crew of THIS ship (every player, while there is one ship),
// and ctx.course is the world's course with this ship's own terrain-contact fields.
//   Ship 0's context forwards each ship key to the world state (state.ship IS ctx.ship, same object), so the 589 existing `state.X` reads, the tools and the
//   update order are unchanged. A second ship's context OWNS its keys. A subsystem is created with and run against ship.ctx; a key it writes that is not
//   in SHIP_KEYS would land on the context only: tools/buildsim.mjs --check-two-ships lists such leaks.
//
// ---- THE RULES (all new code, from now on) ------------------------------------------------------------------------------------------------------
//  1. No new module-level captures of per-ship data (layout-derived tables, SHIP_LAYOUT.x arrays copied at import, GUNS, bags, balance ...).
//     tools/buildsim.mjs --lint fails new ones. Build them in a factory taking the ship, or recompute in a function.
//  2. New code takes a ship HANDLE (a parameter), or gets one from shipOf / mainShip. It does not `import { SHIP_LAYOUT }` (the lint counts those down).
//  3. World <-> ship conversions happen ONLY in pose.js: toWorld / toShip / aimToWorld / aimToShip. No `x + course.dist`, no `y - state.ship.alt`,
//     no new `scrollSpeed` reads (the lint counts those down; use pose.vx). Ship space is never mirrored; only the boundary (rock tests, hits, guns, lamps, camera, art) uses f.
//     Since M.1 everything in the sky (shells, planes, bats, mines, puffs, crew in the air, hooks) is stored in WORLD (map) coordinates with world velocities:
//     hitsShip / impact / the crew / the layout stay in ship coordinates, so a hit test is `hitsShip(toShipX(ship, x), toShipY(ship, y))` and a launch is toWorld.
//  4. Per-ship things live UNDER the ship object (layout, nav, ctx, sim). A new per-ship key on the state goes in SHIP_KEYS below (with a default if it is not made by a factory).
//     The shipLayout.js helpers (all/one/kindOf/is/nearest/hasKind/deckIndex/reviveSpot/isNestDeck/nestTier/isNestStation) take an optional layout last
//     and are methods of the Layout (ship.layout.one('helm')); derived tables are built with layoutTables(fn) (per layout, rebuilt when its version changes).
//  5. Keep the update order and the Math.random order unchanged when you route something through here; the botsim baseline must stay byte-identical.
import { SHIP_LAYOUT, createLayout } from '../../shipLayout.js';
import { config } from '../../config.js';
import { createPose, bindBody } from './pose.js';
import { mainNav, createNav } from './nav.js';

// The state keys that belong to ONE ship. Ship 0's context forwards them to the world state; another ship's context owns them (undefined until its factory, or
// shipInit below, makes them). A key a ship's subsystems write must be listed, or it is written to the context only (see the check in --check-two-ships).
export const SHIP_KEYS = [
  // the body and what hangs on it (made by createSimulation / shipInit)
  'ship', 'GUNS', 'bombBay', 'gasValve', 'gasValveOpen', 'ventOpen', 'shield', 'gasHoles', 'breaches', 'fires', 'boarders', 'bombs', 'wreck',
  // made by the subsystem factories
  'modules', 'bags', 'bagsVersion', 'bagAlert', 'balance', 'forces', 'engines', 'engineStats', 'thrust',
  'sails', 'sailPush', 'sailWarn', 'sailWarned', 'sailStats', 'links', 'linkStats', 'surgeEngine', 'surgeCoil', 'surgeBotAt',
  'coil', 'searchlights', 'litTargets', 'dimTargets', 'darkNow', 'fireStats', 'blaze', 'blazeCd',
  'turning', 'goingDown', 'goingDownRate', 'iceLocker', 'iceFlights', 'gdBanner', 'gdGrace', 'gdJobs',
  'escorts', 'escort', 'escortCramped', 'stunts', 'stuntEnd', 'stuntLog', 'stuntPlane', 'stuntStats',
  // worked out every step
  'rig', 'steamParts', 'steamUse', 'overdrive', 'buoyancy', 'sinking', 'autopilot', 'pressureWarned', 'warnBeep', 'boilerBlew', 'helmHit', 'ballastCd', 'gasWarned', 'lastAlt', 'noPump',
  'lookout', 'lookoutBonus', 'valveLog', 'valveShuts', 'boilerLoads',
  // the environment's hazards that ride on her (the rules run for ship 0 only: another ship has them neutral, shipInit)
  'icing', 'ice', 'clogs', 'spores', 'o2tank', 'stormJob', 'sea',
];
// The world keys a second ship's code is allowed to READ through the prototype: the sky she shares (the enemies and shots and wrecks in it, the weather and the
// environment, the clock and the banner, the sound queue, the difficulty and the crew scale). Every other key a ship needs is her own (SHIP_KEYS), or tools/buildsim.mjs
// --check-two-ships fails and names it: a read that quietly fell through to ship 0 would be a cross-talk bug.
export const WORLD_SHARED = ['bats', 'bombers', 'boss', 'bullets', 'crewScale', 'difficulty', 'enemy', 'enemyBombs', 'env', 'ev', 'flashes', 'mines', 'paras', 'periscope', 'phase', 'popups', 'rings', 'rival', 'rockets', 'sfxQ', 'shells', 'specials', 'strafers', 'tempo', 'weather', 'wrecks', 'hijacks', 'chutes', 'shipBombs', 'puffs', 'kills', 'scroll', 'ships', 'paused', 'mode'];
// World keys a ship's code WRITES as a plain number (a context would shadow them): they pass through to the world on every context.
export const WORLD_WRITES = ['kills'];

// The body of a fresh ship (today's state.ship at the start).
export const newBody = () => ({ alt: 0, speed: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START });

// One gun record per mount of the layout (name -> { bx, by, aim, home, arc, cd, ammo ... }).
export const newGuns = (layout) =>
  Object.fromEntries(
    Object.entries(layout.gunMounts).map(([name, m]) => [name, { bx: m.bx, by: m.by, aim: m.aim, home: m.aim, arc: m.arc, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0, reach: 1 + config.NEST.TIER_BONUS * layout.nestTier((layout.stations.find((s) => s.n === name) || {}).p) }]),
  );

// The starting values of a ship's own keys (ship 0 gets its from createSimulation's state literal; another ship's context is filled from here).
function shipInit(layout) {
  return {
    ship: newBody(),
    GUNS: newGuns(layout),
    ventOpen: layout.vents.map(() => false),
    gasHoles: [], breaches: [], fires: [], boarders: [], bombs: [],
    wreck: null,
    bombBay: { bombs: config.BOMBS.START, cd: 0, empty: 0, aim: null },
    gasValve: { input: 0, auto: false },
    shield: { ang: -Math.PI / 2, on: false, flash: 0 },
    // hazards: nothing is on her (the environment systems run for the main ship only)
    icing: [], ice: { gasbag: 0, topdeck: 0, guns: 0 }, clogs: [], spores: [],
    o2tank: { name: 'Oxygen Tank', d: layout.deckIndex('main'), x: config.ENVIRONMENTS.aether.OXYGEN.TANK_X, prog: 0 },
    stormJob: { rods: [], charge: null, caught: 0, struck: 0, drank: 0, nextT: 0 },
    sea: { y: null, flood: 0, spouts: [], survivors: [], hook: null, winch: null, pump: null, rescued: 0, scrapes: 0, t: 0, spray: 0, scrapeT: 0, floodMax: 0, hitT: 0 },
  };
}

// The terrain-contact fields of the course (what scraping the rock does to ONE ship): a second ship has her own copy over the shared course.
const contactFields = () => ({ scraping: false, wasScraping: false, near: [], lastContact: null, scrapeCd: 0, unstick: 0, stuckT: 0, stuckBest: null, refY: null });

// The players aboard `ship`: a live read-only view of the registry (world.players) for a ship that is not alone in the sky. With ONE ship the view is the registry itself.
function crewView(world, ship) {
  const mine = (id) => { const p = world.players[id]; return !!p && shipOf(world, p) === ship; };
  return new Proxy(world.players, {
    get: (t, k) => (typeof k === 'string' && !mine(k) ? undefined : t[k]),
    has: (t, k) => typeof k === 'string' && mine(k),
    ownKeys: (t) => Reflect.ownKeys(t).filter((k) => typeof k !== 'string' || mine(k)),
    getOwnPropertyDescriptor: (t, k) => (typeof k === 'string' && !mine(k) ? undefined : Reflect.getOwnPropertyDescriptor(t, k)),
    set: (t, k, v) => { t[k] = v; return true; }, // (a view owns nothing: a player added or removed through it is added to / removed from the registry)
    deleteProperty: (t, k) => delete t[k],
  });
}

// ship.ctx: the context view (see the top of this file).
function makeContext(ship) {
  const world = ship.world;
  const ctx = Object.create(world);
  Object.defineProperty(ctx, 'self', { value: ship, enumerable: false });
  const def = (k, d) => Object.defineProperty(ctx, k, { enumerable: true, configurable: true, ...d });
  for (const k of WORLD_WRITES) def(k, { get: () => world[k], set: (v) => { world[k] = v; } });
  let view = null; // this ship's crew view, made once there is another ship
  def('players', { get: () => (world.ships.length > 1 ? (view ||= crewView(world, ship)) : world.players) });
  if (ship.main) {
    for (const k of SHIP_KEYS) def(k, { get: () => world[k], set: (v) => { world[k] = v; } }); // (ship 0: the existing `state.X` names are the same objects)
    return ctx;
  }
  const init = shipInit(ship.layout);
  init.ship = ship.state; // (the body the pose already reads)
  for (const k of SHIP_KEYS) def(k, { value: init[k], writable: true });
  def('gunship', { value: null, writable: true }); // (the gunship hunts the main ship: another ship has none in her sky until B8)
  let base = null, copy = null;
  def('course', { get: () => { const c = world.course; if (c && base !== c) { base = c; copy = Object.assign(Object.create(c), contactFields()); } return c ? copy : c; } });
  return ctx;
}

// Make a ship. `main`: ships[0], wrapping the world's own body, layout and course position by reference. Another ship takes `formation` ({ dx, dalt }: how far along
// the sky from ship 0 she keeps station, and how far above her altitude she is held; dalt < 0 = below) and a `parts` list (or a layout) of her own.
export function createShip(world, { id, main = false, layout = null, parts = null, nav = null, body = null, formation = null } = {}) {
  const lay = layout || (parts ? createLayout(parts) : SHIP_LAYOUT);
  const ship = {
    id,
    main,
    get team() { return world.team || null; },
    layout: lay,
    nav: nav || createNav(lay),
    state: body || newBody(),
    world,
    pose: null,
    ctx: null,
    sim: null,
    formation,
  };
  // (her pose owns her position, M.2: a second ship starts at her formation station from ship 0, course.js place() then moves her to open air; her body's alt / vy / pitch are views of the pose)
  const lead = main ? null : world.ships[0];
  ship.pose = createPose(ship, main ? {} : { x: lead.pose.x + formation.dx, y: lead.pose.y - formation.dalt });
  if (!main) ship.state.alt = -ship.pose.y;
  bindBody(ship.state, ship.pose);
  ship.ctx = makeContext(ship);
  return ship;
}

// The main ship, wrapping today's singletons: ship.state === state.ship, ship.layout === SHIP_LAYOUT.
export const createMainShip = (state) => createShip(state, { id: 'player', main: true, layout: SHIP_LAYOUT, nav: mainNav, body: state.ship });

export const mainShip = (state) => state.self || state.ships[0];
export function shipOf(state, player) {
  const id = player && player.ship;
  if (id == null || id === 'player') return state.ships[0];
  return state.ships.find((s) => s.id === id) || state.ships[0];
}
export function eachShip(state, fn) {
  const list = state.ships;
  for (let i = 0; i < list.length; i++) fn(list[i], i);
}
export const crewOf = (state, ship) => Object.values(state.players).filter((p) => shipOf(state, p) === ship);

// A player changes ship (boarding, a transfer, a respawn on the other ship): the only place `player.ship` is written. They stand on `platform` of the new
// ship at `x` (ship coordinates), or keep their place when none is given. Whatever they were doing on the old ship ends.
export function transfer(state, player, ship, platform, x) {
  player.ship = ship.id;
  player.lock = null;
  player.conn = null;
  player.climb = false;
  player.fire = false;
  player.onGunship = false;
  if (platform != null) {
    const P = ship.layout.platforms[platform];
    player.d = platform;
    player.x = Math.max(P.x0, Math.min(P.x1, x != null ? x : player.x));
    player.y = P.y;
    player.fall = false;
    player.fly = false;
  }
  player.uk = null; // (resend the phone's buttons)
  return ship;
}

