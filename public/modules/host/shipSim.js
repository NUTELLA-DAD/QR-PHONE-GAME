// SHIP SIM: everything that belongs to ONE ship (MOVEMENT.md, Option B, stage B.2): her crew's rules and buttons, her modules, steam, gasbags, guns, fires and holes,
// her flight and her upkeep, and the hits she takes. simulation.js is the WORLD (the sky, the enemies, the voyage); it makes one of these per ship (addShip) and
// steps every ship's stages between the world's own, so with ONE ship the order of everything, and of every Math.random call, is the old single-ship order.
//
// Everything here is written against `state = ship.ctx`, the ship's CONTEXT VIEW (ships.js): her own ship-scoped keys (state.ship, state.GUNS, state.bags, state.fires ...)
// and the world's shared things (state.shells, state.tempo, state.weather, state.sfxQ ...) by the prototype. Ship 0's context forwards to the world state, so for her
// `state.X` here IS `world.X`. The world's systems are made after this ship's, so they are asked for when used (W.course ...); a ship that is not the main one has no
// gunship (she hunts ship 0 only until B.5: the stand-in below) but runs the sky's hazards on her own copy of the environment rules (B.3: state.env, icing, spores ... are hers).
import { createJobFinder } from './jobs.js';
import { damageMul, crewMul, autopilotOn } from './crewscale.js';
import { config } from '../../config.js';
import { updateBot } from './bots.js';
import { createModules } from './modules.js';
import { createRaiders } from './raiders.js';
import { tilt, pilotPlan, gasFor } from './course.js';
import { createEscort, isEscortStation, escortFor } from './escort.js';
import { createCoil } from './coil.js';
import { createEnvironment } from './environments.js';
import { createSearchlights, isSearchlight } from './searchlight.js';
import { shipGeom } from './gunship.js';
import { createAirborne } from './airborne.js';
import { createHookshot } from './hookshot.js';
import { createCannon } from './cannon.js';
import { createCargo, cargoItem, isStocked } from './cargo.js';
import { pop } from './popups.js';
import { assistAim } from './aim.js';
import { gunStock, loadOf, autoloadOf, specOf } from './gunTypes.js';
import { fireTyped } from './weapons.js';
import { stepFlame } from './flame.js';
import { createPrime } from './prime.js';
import { createLinks } from './links.js';
import { createGoingDown, bunkerEmpty } from './goingDown.js';
import { createComeAbout } from './comeAbout.js';
import { createBalance } from './balance.js';
import { createFlight } from './flight.js';
import { createSails, windSpeed } from './sails.js';
import { createFire } from './fire.js';
import { createHealth, hurt as hurtCrew, knockOut, wake, revived, hearts as heartsOf } from './health.js';
import { armourOn, bagFireSpots } from './fireModel.js';
import { createEngines } from './engines.js';
import { createForces, hitForce } from './forces.js';
import { installBags, syncBags, stepBags, watchBags, holesPerBag, liftGas, stepHotAir } from './gasBags.js';
import { createHydrogen } from './hydrogen.js';
import { toWorldX, toWorldY, toShipX, toShipY, aimToWorld, pivotOf } from './pose.js';
import { planBreak, makeRng, rebuildPrice, hoverOf, brokenOf } from './breakOff.js';
import { bagNearX, bagEdgeY, bagName, rowOf } from './shipBuild.js';
import { transfer, newGuns, teamOf, hostileTo, foeOf, shipOf } from './ships.js';

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// The questions the simulation asks of a ship's body (where a hit lands, which bag, which floor): one set per layout, so nothing here is shared between two ships
// (B.1b: no module-level capture of the layout).
function shipQueries(layout) {
  const PLATFORMS = layout.platforms;
  const BAGS = layout.gasbags; // the gasbags side by side (S.5d), tail to nose
  const { deckIndex, isNestDeck } = layout; // (the station-kind helpers, bound to this ship's layout)
  // Does a point (in ship coordinates) touch the ship? Gasbag, gondola, outriggers or ball turret.
  function hitsShip(x, y) {
    for (const b of BAGS) if (((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2 < 1) return true;
    for (const r of layout.hitRects) if (x > r.x0 && x < r.x1 && y > r.y0 && y <= r.y1) return true; // gondola, outriggers, top deck, belly compartments (from the build)
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
  return { hitsShip, onGasbag, gasHoleAt, roomPlatformAt };
}

// Throw away the presses and holds a person's phone queued up, so they can't fire later when the game is taking input again
// (scorecard, votes, the run-end screen, the pause menu, being knocked out or falling). Bots manage their own button state.
export function flushPresses(p) {
  if (p.bot) return;
  p.actQ = p.atkQ = p.jumpQ = p.grabQ = false;
  p.fire = false;
  p.prime = false;
}

// What a ship that is not the main one gets in place of the gunship (she hunts ship 0 only, until B.5): nothing to board.
const NO_GUNSHIP = { interaction: () => null, hitCrew: () => false, fireHook: () => false, swing: () => {}, swingStep: () => {}, walk: () => {}, plant: () => {}, cutLine: () => {} };
// A stand-in for a world system that is made after this ship: every use looks it up in W when it happens.
const late = (get) => new Proxy({}, { get: (_, k) => get()[k] });

// Make the systems and rules of `ship`. W = the world's services (simulation.js): the helpers made before any ship (puff, phoneFx, stat, credit, emitPlayerUi)
// and, filled in as they are made, the world systems (course, env, gunship, hijack ...) and the run-level rules (wreck, finishLimp, restartGame).
export function createShipSim(world, ship, W) {
  const state = ship.ctx; // (the context view: this ship's own keys, the world's everything else)
  const layout = ship.layout;
  const { one, all, kindOf, hasKind, nestTier, reviveSpot } = layout; // (the station-kind helpers, bound to it)
  const { puff, phoneFx, stat, credit, emitPlayerUi } = W;
  const { moveWalker, steerTo, fall, detach, platformBelow } = ship.nav; // (walkers use THEIR ship's navigation)
  const gunship = ship.main || ship.ai ? late(() => W.gunship) : NO_GUNSHIP; // (B.5: the enemy gunship's own ship asks the director too: swinging back, the charge, the helm)
  const dmgMul = () => (ship.ai ? ship.ai.damageMul() : damageMul(state)); // (the gunship's hull is tuned by her own multiplier, not by the difficulty button and her crew's size)
  let ownEnv = null; // (another ship's own copy of the sky's hazards, made below; ship 0's is the world's, made in simulation.js)
  const env = ship.main ? late(() => W.env) : late(() => ownEnv);
  const course = ship.main ? late(() => W.course) : { dropBomb: (...a) => W.course.dropBomb(...a), predictBomb: (...a) => W.course.predictBomb(...a), helmHint: () => '' }; // (the helm's hint about the rock ahead is about ship 0's course)
  const hijack = late(() => W.hijack);
  const PLATFORMS = layout.platforms;
  const platformY = (d) => PLATFORMS[d].y;
  let BAY_D; // the bomb bay's platform index (refreshed when a new ship build is applied)
  const rebuildBayD = () => { BAY_D = PLATFORMS.findIndex((p) => p.id === 'bay'); };
  rebuildBayD();
  layout.onChange(rebuildBayD);
  const { hitsShip, onGasbag, gasHoleAt, roomPlatformAt } = shipQueries(layout);
  installBags(state); // the gasbags side by side: state.bags, and state.ship.gas as their mean (gasBags.js)
  let hookshot = null; // made by attach() once the world's hijack exists
  const wreck = (text) => (ship.main && !config.PVP.ENABLED ? W.wreck(text) : wreckAside(text)); // (the run ends with the main ship; another ship just breaks up and is rebuilt; in Versus a wreck ends the ROUND, whichever ship it is)

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---- Versus (B.4, pvp/match.js): a crewman whose TEAM is not this ship's is a boarder. He fights, sabotages the boiler (hold) or takes the helm (hold); falling overboard or being
  // knocked out carries him back to his own ship's medical bay. Co-op players have no team: none of this runs. ----
  const isHostile = (p) => hostileTo(p, ship); // (ships.js: different teams in Versus; the enemy gunship's side against everyone else's)
  const homeOf = (p) => world.ships.find((q) => q.team && q.team.id === p.team) || (!p.team && !ship.main ? world.ships[0] : ship); // (the ship a crewman belongs to: his team's, or, with no team, the main ship - our crew who boarded the gunship go home to ours)
  const hostileJobs = [{ name: 'capture', prog: 0 }, { name: 'sabotage', prog: 0 }]; // the two hold actions of a boarder (stepUpkeep lets their progress wear off)
  const [captureJob, sabotageJob] = hostileJobs;
  const tally = (p, key) => { if (state.match && p && p.team) state.match.count(p.team, key); };

  const taken = (name) => Object.values(state.players).some((q) => q.lock === name);

  // Stations are asked for by KIND (shipLayout.js: one/all/kindOf); player.lock holds the station's name.
  const holder = (kind) => Object.values(state.players).find((q) => kindOf(q.lock) === kind); // whoever is on a station of this kind
  const worksKind = (kind) => { const s = one(kind); return !!s && modules.works(state, s.n); }; // is "the" station of this kind in working order
  const getHelm = () => holder('helm');

  const T = config.TOOLS;
  const CTL = config.CONTROLS; // phone controls: grab lockout, hold-to-swap, hysteresis (Phase C)
  const modules = createModules(ship);
  const jobFinder = createJobFinder(state);
  state.modules = modules.list;
  const PICKUPS = [];
  const rebuildPickups = () => { PICKUPS.length = 0; PICKUPS.push(...layout.racks, ...layout.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))); };
  rebuildPickups();
  layout.onChange(rebuildPickups);
  const LOCKABLE_KINDS = ['helm', 'lookout', 'bombBay', 'deflector', 'coil', 'searchlight', 'escort', 'gun', 'swivel', 'cannon', 'cannonSeat'];
  const LOCKABLE = (name) => LOCKABLE_KINDS.includes(kindOf(name)) || isSearchlight(name, layout) || isEscortStation(name, layout) || !!state.GUNS[name];
  // What the phone calls each kind of station (its button set and label).
  const PHONE_KIND = { helm: 'helm', gun: 'gun', boiler: 'boiler', lookout: 'lookout', bombBay: 'bombbay', deflector: 'shield', coil: 'coil', searchlight: 'light', escort: 'escort', swivel: 'swivel', cannon: 'cannon', cannonSeat: 'cannonseat' };

  // Sunken Sea: crew on the lower decks wade slowly while the ship is flooded.
  const wadeMul = (p) => (p.d != null && PLATFORMS[p.d] && PLATFORMS[p.d].y >= layout.lowDeckY && state.sea && state.sea.flood > 0 ? 1 - state.sea.flood * config.ENVIRONMENTS.sea.FLOOD.SLOW_CREW : 1);

  // What the Action button does for this player right now (or null) - the "use" half of interaction() below.
  // hold = keep the button held to make progress; otherwise a tap does it.
  // legacy (bots): one combined button, so racks, ammo, coal and stations are decided here too; people get those on GRAB (grabsFor).
  const takeLabel = (s) => (s.kind === 'cannonSeat' ? 'Climb into the cannon' : s.kind === 'cannon' ? 'Man the cannon' : 'Take ' + s.n);
  const useFor = (player, station, legacy) => {
    if (player.fly && (player.cannon || player.tossed) && !player.chute && !player.hj && player.ko <= 0) return { type: 'chute', label: 'PARACHUTE!' }; // (B.6: fired from the crew cannon - Action opens the parachute; S.5i: so does a crewman thrown off a part that broke off)
    if (player.lock || player.conn != null || player.fall || player.swing || player.air) return null;
    const here = (o, r) => o.d === player.d && Math.abs(o.x - player.x) < r;
    const tool = player.carry;
    if (isHostile(player)) return hostileUse(player, here);
    const revive = Object.values(state.players).find((q) => q !== player && q.ko > 0 && !q.fall && q.conn == null && here(q, 65));
    if (revive) return { type: 'revive', obj: revive, hold: true, time: T.REVIVE_TIME, label: `Revive ${revive.name}` };
    const gdHold = goingDown.holdAction(player, here); // GOING DOWN!: hold Action to cut a section away, dump the coal bunker or drop the bombs
    if (gdHold) return gdHold;
    // Crew health: a hurt crewmate beside you (awake, same side): hold Action to bandage him, a heart back. (A bot sent to bandage somebody does it before anything else; for people it is the last thing the button offers.)
    const HB = config.HEALTH;
    const sore = HB.ENABLED && HB.BANDAGE.ENABLED && Object.values(state.players).find((q) => q !== player && !q.enemy && heartsOf(q) < HB.MAX && !(q.ko > 0) && !q.fall && !q.fly && q.conn == null && !isHostile(q) && !foeOf(q, player) && here(q, 65));
    const bandageAct = sore && { type: 'bandage', obj: sore, hold: true, time: HB.BANDAGE.TIME, label: `Bandage ${sore.name}` };
    if (sore && legacy && player.botJob && player.botJob.kind === 'bandage' && player.botJob.obj === sore) return bandageAct;
    const boarding = gunship.interaction(player);
    if (boarding) return boarding;
    // Standing over the open bomb bay doors: jump out (parachute). Not while carrying ammo - that loads the bombs. (B.6: carrying a sandbag or crate there, Action lets IT fall through the belly instead.)
    const dropC = cargo.dropAction(player);
    if (dropC && player.d === BAY_D && Math.abs(player.x - layout.bombBay.jumpX) < CTL.BAY_JUMP_ZONE) return dropC;
    if ((!player.bot || (player.dare && player.dare.kind === 'drop')) && player.d === BAY_D && tool !== 'ammo' && Math.abs(player.x - layout.bombBay.jumpX) < CTL.BAY_JUMP_ZONE) return { type: 'jump', label: 'Jump!' };
    // B.6: at the rail with a sandbag or crate in your hands, Action dumps it overboard for a quick lift; a load lying on the deck by your feet wants shovelling off.
    const dumpC = cargo.dumpAction(player) || cargo.shovelAction(player, here);
    if (dumpC) return dumpC;
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
    if (fire && tool === 'extinguisher') return { type: 'fire', obj: fire, hold: true, time: T.EXTINGUISH_TIME * (fire.big ? config.FIRE.BLAZE.EXTINGUISH_MUL : 1), label: fire.big ? 'Spray the blaze' : 'Spray fire' };
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
    const gv = (layout.gasValves || []).find((v) => here(v, T.VALVE_REACH));
    if (gv) { const i = layout.gasValves.indexOf(gv); return { type: 'gasvalve', obj: gv, label: `${state.gasValveOpen[i] === false ? 'Open' : 'Close'} ${bagName(gv.bag, layout.gasbags.length).toLowerCase()} valve` }; }
    // A mast and sail (S.5e): hold Action to haul the sail up, tap it to let it down.
    const sl = sails.actionFor(player, here);
    if (sl) return sl;
    // Otherwise standing at a rack or hook means take / swap / put back.
    const pickup = legacy ? PICKUPS.find((r) => here(r, T.REACH)) : null;
    // (carrying ammo or coal next to a gun or the boiler means load it, not swap it for a tool)
    if (pickup && !(station && (tool === 'ammo' || tool === 'coal'))) return { type: 'rack', obj: pickup, label: tool === pickup.kind ? `Put back ${pickup.kind}` : tool && tool !== 'ammo' && tool !== 'coal' ? `Swap to ${pickup.kind}` : `Take ${pickup.kind}` };
    const vent = layout.vents.find((v) => here(v, T.REACH));
    if (vent) return { type: 'vent', obj: vent, label: state.ventOpen[layout.vents.indexOf(vent)] ? 'Close vent' : 'Open vent' };
    const valve = modules.list.find((m) => m.kind === 'pipe' && here(m, T.REACH));
    if (valve) return { type: 'valve', obj: valve, label: valve.open ? 'Close valve' : 'Open valve' };
    if (station) {
      const gun = state.GUNS[station.n];
      if (gun && tool === (gun.type === 'flame' ? 'coal' : 'ammo') && gun.ammo < gun.max) return { type: 'load', obj: gun, station, label: (gun.type === 'flame' ? 'Fuel ' : 'Load ') + station.n }; // (a flamethrower's tank takes a sack of coal, not shells)
      if (station.kind === 'bombBay' && tool === 'ammo' && state.bombBay.bombs < config.BOMBS.MAX) return { type: 'loadBombs', station, label: 'Load bombs' };
      if (legacy && station.kind === 'ammo' && tool !== 'ammo') return { type: 'ammo', station, label: 'Grab ammo' };
      if (legacy && station.kind === 'coal' && tool !== 'coal') return bunkerEmpty(state) ? { type: 'need', label: 'Coal bunker is empty - restocking' } : { type: 'coal', station, label: 'Grab coal' };
      if (!legacy && station.kind === 'coal' && tool !== 'coal' && bunkerEmpty(state)) return { type: 'need', label: 'Coal bunker is empty - restocking' };
      if (station.kind === 'boiler' && tool === 'coal') {
        const full = state.ship.fuel > config.BOILER.FUEL_MAX - config.BOILER.COAL_FUEL && !goingDown.active(); // (while she falls, every load counts: it kicks the steam up)
        return full ? { type: 'need', label: 'Firebox is full' } : { type: 'stoke', station, label: goingDown.active() ? 'STOKE - FULL STEAM!' : 'Load coal' };
      }
      if (station.kind === 'boiler' && tool !== 'coal' && !player.mate) {
        const surge = links.surgeAction(station); // steam is up: hold Action to push it into the engines (or the coil)
        if (surge) return surge;
      }
      const loader = !player.mate && links.loaderAction(player, station); // a manned gun: hold Action to prime the shell for the gunner
      if (loader) return loader;
      if (legacy && LOCKABLE(station.n) && !taken(station.n) && !player.mate) return { type: 'station', station, label: takeLabel(station) }; // (a ship's mate never takes a station)
      // (people can always bump a bot off a station: that is a GRAB action too, see grabsFor)
    }
    if (sore) return bandageAct;
    if (fire) return { type: 'need', label: 'Need an extinguisher' };
    if (hole || hurt || gasHole) return { type: 'need', label: 'Need a hammer' };
    return null;
  };

  // What a boarder's Action button does (Versus): at the helm, TAKE THE HELM (hold; not while a defender stands by it); at the boiler, SABOTAGE (hold). Fighting is the ATTACK button.
  const hostileUse = (player, here) => {
    const V = config.PVP;
    const helm = one('helm'), boiler = one('boiler');
    // B.6: a boarder at the enemy's coal bunker can lift a sack of her coal and carry it off: her firebox is the lighter for it (and so is her steam), and his own boiler eats it.
    const bunker = (!player.bot || player.stealNow) && player.carry !== 'coal' && state.ship.fuel > 0 && all('coal').find((s) => here(s, V.HAND_REACH)); // (a bot only after it has sabotaged her boiler: sabotageBoiler sets stealNow)
    const steal = bunker ? { type: 'steal', station: bunker, label: 'Steal her coal!' } : null;
    if (ship.ai) { // the enemy gunship: the rope's swing back across (at her stern), the charge at her boiler (hold), her helm (hold: she surrenders)
      const back = gunship.interaction(player);
      if (back) return back;
      if (helm && here(helm, V.HAND_REACH)) {
        const defender = Object.values(state.players).some((q) => q !== player && !isHostile(q) && !q.fall && !(q.ko > 0) && q.conn == null && q.d === helm.d && Math.abs(q.x - helm.x) < V.DEFEND_REACH);
        return defender ? { type: 'need', label: 'Her helmsman is in the way!' } : { type: 'capture', obj: captureJob, hold: true, time: V.CAPTURE_TIME, label: 'TAKE HER HELM!' };
      }
      if (boiler && here(boiler, V.HAND_REACH) && !ship.ai.g.charge) return { type: 'sabotage', obj: sabotageJob, hold: true, time: ship.ai.plantTime(), label: ship.ai.plantLabel() };
      return steal;
    }
    if (helm && here(helm, V.HAND_REACH)) {
      const defender = Object.values(state.players).some((q) => q !== player && !isHostile(q) && !q.fall && !(q.ko > 0) && q.conn == null && q.d === helm.d && Math.abs(q.x - helm.x) < V.DEFEND_REACH);
      return defender ? { type: 'need', label: 'Defenders in the way!' } : { type: 'capture', obj: captureJob, hold: true, time: V.CAPTURE_TIME, label: 'TAKE THE HELM!' };
    }
    if (boiler && here(boiler, V.HAND_REACH)) return { type: 'sabotage', obj: sabotageJob, hold: true, time: V.SABOTAGE_TIME, label: 'Sabotage the boiler' };
    return steal;
  };

  // The GRAB half (people only): take a tool, swap or put one back, grab ammo / coal / ice, hop onto a station.
  // Everything in reach is a candidate; the NEAREST wins, and the one you already had keeps the button until another is
  // CTL.HYSTERESIS closer (so labels don't flicker where two racks overlap). swap = it costs what is in your hands (hold GRAB).
  const grabsFor = (player, station) => {
    if (player.lock || player.conn != null || player.fall || player.swing || player.air || isHostile(player)) return null;
    const tool = player.carry;
    const out = [];
    const add = (act, x, key) => out.push({ act: { ...act, grab: true, swap: act.swap ?? !!tool }, x, key });
    if (!(station && (tool === 'ammo' || tool === 'coal'))) {
      // (carrying ammo or coal next to a station means use it there, not swap it for a tool)
      for (const r of PICKUPS) {
        if (r.d !== player.d || Math.abs(r.x - player.x) >= T.REACH) continue;
        add({ type: 'rack', obj: r, label: tool === r.kind ? `Put back ${r.kind}` : tool ? `Swap to ${r.kind}` : `Take ${r.kind}`, swap: !!tool }, r.x, 'rack|' + r.kind + '|' + r.x);
      }
    }
    if (station) {
      if (station.kind === 'ammo' && tool !== 'ammo') add({ type: 'ammo', station, label: 'Grab ammo' }, station.x, 'ammo|' + station.n);
      if (station.kind === 'coal' && tool !== 'coal' && !bunkerEmpty(state)) add({ type: 'coal', station, label: 'Grab coal' }, station.x, 'coal|' + station.n);
      if (LOCKABLE(station.n) && !taken(station.n) && !player.mate) add({ type: 'station', station, label: takeLabel(station), swap: false }, station.x, 'station|' + station.n); // (a ship's mate never takes a station)
      else {
        const botThere = !player.mate && Object.values(state.players).find((q) => q.bot && q.lock === station.n); // (people can always bump a bot off a station)
        if (botThere) add({ type: 'station', station, bump: botThere, label: takeLabel(station), swap: false }, station.x, 'station|' + station.n);
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

  // Versus: the nearest awake crewman of another team on this player's deck within range.
  const foeInReach = (player, range) => {
    if (!player.team && !ship.ai) return null; // (co-op people have no team: no foes - except aboard the enemy gunship, whose crew are theirs)
    return Object.values(state.players)
      .filter((q) => q !== player && foeOf(q, player) && !q.fall && !q.fly && q.conn == null && !(q.ko > 0) && q.d === player.d && Math.abs(q.x - player.x) < range)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0] || null;
  };
  // ...and a blow at him: a shove or a sword knocks him back and wears down his hit points; at zero he is out for a while (a boarder is carried home).
  const hitCrew = (player, victim, sword) => {
    const F = config.PVP.FIGHT;
    player.face = victim.x < player.x ? -1 : 1;
    if (victim.team === 'enemy' && ship.ai) { // (a gunship's crewman has her old hit points: three, a sword takes two; at zero he is dead - the director counts him and the TV shows it)
      const pl = PLATFORMS[victim.d];
      if (pl) victim.x = clamp(victim.x + player.face * F.KNOCK, pl.x0 + 10, pl.x1 - 10);
      victim.wind = 0;
      shipPuff(victim.x, victim.y - 40, '#fff', 6);
      if (sword) shipPop(victim.x, victim.y - 110, 'whack', '#ffffff', 0.8);
      ship.ai.hurt(victim, sword ? 2 : 1, player);
      stat(player, 'raiders');
      return;
    }
    const HC = config.HEALTH;
    let down;
    if (HC.ENABLED) { // (crew health: the blow takes hearts; sword 1.5, shove 0.5)
      const res = hurtCrew(victim, sword ? HC.SWORD : HC.SHOVE, { cause: 'melee', old: true, melee: true, iframes: HC.MELEE_IFRAMES });
      down = res === 'ko';
    } else down = (victim.pvpHp = (victim.pvpHp ?? F.HP) - (sword ? F.SWORD : F.SHOVE)) <= 0;
    const pl = PLATFORMS[victim.d];
    if (pl) victim.x = clamp(victim.x + player.face * F.KNOCK, pl.x0 + 10, pl.x1 - 10);
    shipPuff(victim.x, victim.y - 40, '#fff', 6);
    if (sword) shipPop(victim.x, victim.y - 110, 'whack', '#ffffff', 0.8);
    if (!down) return;
    victim.pvpHp = F.HP;
    if (HC.ENABLED && config.PVP.ENABLED) victim.hearts = HC.MAX; // (Versus: a crewman knocked out in a fight comes round whole, as he always did; co-op boarders wake with a heart and heal)
    knockOut(victim, F.KO_TIME);
    stat(player, 'raiders');
    stat(victim, 'ko');
    tally(player, 'knockouts');
    phoneFx(player, 'Knocked out ' + victim.name + '!', [30, 40, 30]);
    phoneFx(victim, 'You were knocked out!', [120, 50, 120]);
    shipPop(victim.x, victim.y - 130, 'KO', '#ffd23f', 1);
  };

  // Is there something here a shove would hit (a raider, a foe, a latched bat)? Then ATTACK shoves, even with a sandbag in your hands.
  const shoveNear = (player) => state.boarders.some((b) => !b.fall && b.conn == null && b.d === player.d && Math.abs(b.x - player.x) < T.SHOVE_RANGE) || !!foeInReach(player, T.SHOVE_RANGE) || !!batInReach(player, T.SHOVE_RANGE);
  // Attack button: a sword hurts raiders; bare hands only shove them back.
  const attack = (player) => {
    if (hookshot.onAttack(player)) return; // carrying the hookshot: fire it (or let go of the rope)
    if ((player.atkCd || 0) > 0 || player.lock || player.conn != null) return;
    if (cargo.wantsThrow(player, () => shoveNear(player))) return cargo.throwItem(player); // (B.6: on an open deck, ATTACK throws the sandbag, crate or sack of coal you carry - unless there is something to shove)
    if (player.carry === 'towline' && W.towing && W.towing.throwLine(ship, player)) return; // (B.6: ATTACK throws the towline's grapple at another ship)
    if (player.carry === 'sword' && W.towing && W.towing.cutNear(ship, player)) return; // (...and a sword cuts a line where it is made fast to this ship)
    const sword = player.carry === 'sword';
    player.atkCd = sword ? T.SWORD_COOLDOWN : T.SHOVE_COOLDOWN;
    player.swingT = performance.now();
    const range = sword ? T.SWORD_RANGE : T.SHOVE_RANGE;
    const target = state.boarders
      .filter((b) => !b.fall && b.conn == null && b.d === player.d && Math.abs(b.x - player.x) < range)
      .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
    if (!target) {
      const foe = foeInReach(player, range); // (Versus: a crewman of the other team on this deck)
      if (foe) return hitCrew(player, foe, sword);
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
        if (sword) shipPop(player.x + player.face * 60, player.y - 110, 'whack', '#ffffff', 0.8);
      }
      return;
    }
    player.face = target.x < player.x ? -1 : 1;
    shipPuff(target.x, target.y - 40, '#fff', 6);
    if (sword) shipPop(target.x, target.y - 110, 'whack', '#ffffff', 0.8);
    raiders.onHit(target, sword, player.face * (sword ? T.SWORD_KNOCKBACK : T.SHOVE_KNOCKBACK));
    if (!state.boarders.includes(target)) {
      stat(player, 'raiders');
      phoneFx(player, '+1 Raider beaten!', [30, 40, 30]);
      shipPop(target.x, target.y - 130, 'raider', '#ffd23f', 1);
    }
  };

  // puff() / pop() at a point given in ship coordinates.
  const shipPuff = (x, y, color, count) => puff(toWorldX(ship, x), toWorldY(ship, y), color, count);
  const shipPop = (x, y, kind, color, size) => pop(state, toWorldX(ship, x), toWorldY(ship, y), kind, color, size);

  const damageHull = (amount) => {
    const danger = 1 + (((state.course && state.course.danger) || 2) - 2) * config.VOYAGE.DANGER_DAMAGE; // skulls on the stop
    if (goingDown.protect()) return; // falling (the last stand) or just saved: nothing can hurt her
    if (!state.ship.down && (state.ship.hull -= amount * config.SHIP.HULL_DAMAGE * dmgMul() * danger) <= 0) wreck();
  };

  // Is world point (x, y) on the Deflector's arc right now? (Sparks and a flash if so.)
  const shieldBlocks = (x, y) => {
    const S = state.shield;
    if (!S.on) return false;
    const L = layout.shield;
    const u = (toShipX(ship, x) - L.cx) / L.rx; // (the arc is part of the ship)
    const v = (toShipY(ship, y) - L.cy) / L.ry;
    const r = Math.hypot(u, v);
    if (r < 0.88 || r > 1.12 || Math.abs(angleDiff(Math.atan2(v, u), S.ang)) > config.SHIELD.SPAN) return false;
    puff(x, y, '#9fe8ff', 6);
    S.flash = 1;
    return true;
  };

  // The helm's lever (or the autopilot, or nobody) orders a speed; the engines chase it with the push they have, so a heavy ship builds speed slowly and a light one quickly (flight.js).
  const driveSpeed = (want) => flight.order(want);

  // The helm is out in the open on the top deck: a hit right next to whoever is standing at it can
  // knock them out for a few seconds (red flash + HELMSMAN HIT!).
  const helmsmanHit = (x, y, power) => {
    const H = config.HELM_EXPOSED;
    const st = one('helm');
    if (!st) return;
    if (!PLATFORMS[st.d].outside) return; // a helm on a covered deck (S.5g) is under a roof: nothing out in the open to hit
    const cy = PLATFORMS[st.d].y - H.HIT_CY;
    if (Math.hypot(x - st.x, y - cy) > H.HIT_RADIUS * Math.min(2, Math.max(1, power))) return;
    const victim = Object.values(state.players).find((q) => !q.fall && !q.fly && !(q.ko > 0) && q.conn == null && q.d === st.d && (kindOf(q.lock) === 'helm' || Math.abs(q.x - st.x) < 45));
    state.helmHit = H.WARN_TIME; // flash even if nobody is home
    if (!victim || Math.random() >= H.KO_CHANCE) return;
    const res = hurtCrew(victim, power >= config.HEALTH.SHELL.BIG_POWER ? config.HEALTH.BIG : config.HEALTH.HELM_HEARTS, { cause: 'shell', old: true }); // (crew health: a heart, or all of them for a heavy hit)
    if (res === 'ko') {
      knockOut(victim, H.KO_TIME, { keepCarry: true });
      stat(victim, 'ko');
    }
    if (res) phoneFx(victim, 'You were hit at the helm!', [120, 50, 120]);
    shipPop(st.x, cy - 70, 'bigHit', '#e63946', 1.1);
    shipPuff(st.x, cy, '#e63946', 8);
  };

  // A shell bursting in or against the ship hurts the crew standing near it (crew health): a heart each, or every heart for a heavy hit right beside you (a mine, a rocket, a crash).
  const crewHit = (x, y, power) => {
    const K = config.HEALTH, S = K.SHELL;
    if (!K.ENABLED || power < S.MIN_POWER) return;
    if (power >= S.BIG_POWER) health.blast(x, y, S.BIG_RADIUS, { big: true, cause: 'blast' });
    health.blast(x, y, S.RADIUS * Math.min(1.5, 0.6 + 0.4 * power), { hearts: K.SHELL_HEARTS, cause: 'shell' });
  };

  // Something exploded against the ship at (x, y) in ship coordinates. power 1 = one enemy bullet.
  const impactBody = (x, y, power, hullMul = 1) => { // (hullMul: the hull a blow costs, apart from the size of the blow: our shells on the enemy gunship, gunshipShip.js)
    // Riveted plate (S.5g) on this stretch of hull wall or rail: the hit counts for much less, and rarely punches through.
    const d = onGasbag(x, y) < 0 ? roomPlatformAt(x, y) : null;
    const plate = d !== null && !!armourOn(layout, d, x);
    if (plate) {
      power *= config.ARMOUR.POWER_MUL;
      state.fireStats.plated++;
      shipPuff(x, y, '#cfd8dc', 5);
      state.sfxQ.push(['impact']);
    }
    state.ship.shake = Math.max(state.ship.shake, Math.min(0.6, 0.22 * power));
    air.shove(power, x);
    hitForce(state, x, y, power); // (a burst against the hull kicks her about the place it struck: forces.js)
    if (power >= 1.5) {
      shipPop(x, y - 40, 'bigHit', '#ff7b00', Math.min(1.6, 0.6 + power * 0.3));
      // Every phone feels the big ones.
      if (performance.now() - lastJolt > 1000) {
        lastJolt = performance.now();
        for (const p of Object.values(state.players)) phoneFx(p, null, [80]);
      }
    }
    shipPuff(x, y, '#ff7b00', Math.round(8 * power));
    const coll = crewMul(state, 'collateral'); // (small crews: hits break fewer things)
    const pm = config.PVP.ENABLED || ship.ai ? Math.min(1, power) : 1; // (the enemy gunship too: our shells are small blows on her, as on a rival ship. Versus: a crew shell is a small blow - it chips the hull and only now and then breaks something or lights a fire, in proportion to its power)
    modules.hitAt(x, y, shipPuff, power, coll);
    helmsmanHit(x, y, power);
    crewHit(x, y, power);
    const hitBag = onGasbag(x, y);
    if (hitBag >= 0) {
      if (state.bags[hitBag] && state.bags[hitBag].type === 'hydrogen') hydrogen.hit(hitBag, power * pm); // (a shell into a hydrogen bag: a spark can light it)
      if (state.gasHoles.length < config.GAS.MAX_HOLES && Math.random() < config.GAS.HOLE_CHANCE * coll * pm) state.gasHoles.push(gasHoleAt(x, y, hitBag));
      damageHull(2 * power * hullMul);
      return;
    }
    if (d !== null) {
      const p = PLATFORMS[d];
      const holes = power >= 2 ? (Math.random() < coll ? 2 : 1) : Math.random() < config.SHIP.HOLE_CHANCE * coll * pm * (plate ? config.ARMOUR.HOLE_MUL : 1) ? 1 : 0;
      for (let i = 0; i < holes && state.breaches.length < 10; i++) state.breaches.push({ x: clamp(x + (i - 0.5) * 70 * (holes - 1), p.x0 + 20, (p.id === 'main' ? shipGeom(layout).MAIN_X1 : p.x1) - 20), d, prog: 0 });
      // (a fire starts more readily on tinder (the coal), and not at all on plate: the spot's flammability scales the chance, 1 on a plain deck)
      const ig = fireSys.igniteChance(d, x);
      if ((power >= 2 && Math.random() < coll * Math.min(1, ig)) || Math.random() < 0.35 * coll * ig * pm) fireSys.ignite(d, x + (Math.random() - 0.5) * 80, 'hit');
    }
    damageHull(config.SHIP.HIT_DAMAGE * power * hullMul);
  };

  // ---- PARTS BREAK OFF FOR REAL (S.5i; breakOff.js plans it, debris.js tumbles the pieces, config.BREAKOFF) ----
  const BOC = () => config.BREAKOFF;
  let breakRng = makeRng((0x9e3779b1 + 0x85ebca6b * (world.ships.indexOf(ship) + 1)) | 0); // (its own random source: a run in which nothing breaks off draws exactly the random numbers it always did)
  let breakCd = 0; // seconds before a hit, crash or ram may break another part off
  let bayHeat = 0; // seconds of fire that has burned in the bomb bay's compartment with bombs aboard
  let bagTear = []; // per gasbag: seconds it has been flat and ripped
  state.breakStats = { events: 0, bay: 0, hit: 0, crash: 0, ram: 0, bag: 0, parts: 0, fell: 0, scars: 0 }; // (read by botsim and the --check-breakoff gate)
  state.liftDeficit = 0;
  const lostList = () => (ship.main && world.run ? (world.run.lost ||= []) : (ship.lost ||= [])); // (what has broken off and not been rebuilt, oldest first: { id, cause, label, before, price ... })
  // The chance multiplier of a cause: the difficulty button (co-op), and the armour plate on the spot that was struck.
  const chanceMul = (x, y) => {
    const diff = ship.ai || config.PVP.ENABLED ? 1 : BOC().DIFFICULTY[world.difficulty] ?? 1;
    const d = x == null ? null : onGasbag(x, y) < 0 ? roomPlatformAt(x, y) : null;
    return diff * (d !== null && !!armourOn(layout, d, x) ? BOC().ARMOUR_MUL : 1);
  };

  // Take parts off this ship NOW (spec: see breakOff.js planBreak; opts.force works with BREAKOFF.ENABLED off, for tests). The layout is replaced in place, so everything made from it follows: the
  // modules keep their hit points by name, the guns / lamps / coil / bags / valves / vents are made again keeping what they hold, the nav tables, balance, forces, flight mass and the art follow the
  // layout version. Crew standing on what went FALL (into the air, to land on a deck below or to parachute), walkers keep their deck and climbers their ladder if it is still there; holes, fires, breaches,
  // ice and loads on a lost stretch go with it. She keeps flying with whatever is left. Returns { plan, entry } or null (nothing happened).
  function breakOff(spec, opts = {}) {
    const B = BOC();
    if ((!B.ENABLED && !opts.force) || state.ship.down || state.wreck || !layout.parts) return null;
    const plan = planBreak(layout.parts, spec, breakRng);
    if (!plan.ok) return null;
    const P = PLATFORMS;
    const wearing = layout.parts;
    const before = JSON.parse(JSON.stringify(wearing)); // (kept for the REBUILD card: the parts as they were)
    const oldP = P.map((q) => ({ id: q.id, y: q.y, x0: q.x0, x1: q.x1 }));
    const oldC = layout.connectors.map((c) => ({ type: c.type, xTop: c.xTop, xBottom: c.xBottom, yTop: P[c.top].y, yBottom: P[c.bottom].y }));
    const oldBags = layout.gasbags.map((b, i) => ({ cx: b.cx, gas: state.bags[i] ? state.bags[i].gas : state.ship.gas, down: state.bags[i] ? state.bags[i].down : false, scorch: state.bags[i] ? state.bags[i].scorch : 0, burn: state.bags[i] ? state.bags[i].burn : 0, fireT: state.bags[i] ? state.bags[i].fireT : 0 }));
    const oldValves = (layout.gasValves || []).map((v, i) => ({ x: v.x, p: v.p, open: state.gasValveOpen[i] !== false }));
    const oldVents = layout.vents.map((v, i) => ({ x: v.x, p: v.p, open: !!state.ventOpen[i] }));
    const keptGuns = Object.fromEntries(Object.entries(state.GUNS).map(([k, g]) => [k, { aim: g.aim, cd: g.cd, ammo: g.ammo, max: g.max, empty: g.empty, auto: g.auto, prime: g.prime, primed: g.primed }]));
    const docks = layout.escortDocks.map((e) => e.n).join('|');
    const pivot0 = pivotOf(ship);
    const blast = spec.kind === 'blast';
    const bx = spec.x ?? plan.pieces[0].box.x0, by = spec.y ?? plan.pieces[0].box.y0;
    const pics = ship.snapshotArt ? plan.pieces.map((pc) => { try { return ship.snapshotArt(pc); } catch { return null; } }) : []; // (the picture of each piece, taken while the old ship is still what is drawn)
    const crew = Object.values(state.players);
    const onCut = (p) => { const q = oldP[p.d]; return !!q && plan.cuts.some((c) => c.id === q.id && p.x >= c.a - 24 && p.x <= c.b + 24); };
    const falls = new Set(crew.filter((p) => !p.fly && !p.fall && !p.onGunship && !p.hj && p.conn == null && p.d != null && onCut(p)));

    layout.applyBuild(plan.parts);
    const was = brokenOf.get(layout);
    brokenOf.set(layout, { broken: layout.parts, intact: was && was.broken === wearing ? was.intact : before }); // (the next simulation made in this process mends her: ships.js createMainShip)

    if (ship.pose.f !== 1) ship.pose.x += 2 * (pivot0 - pivotOf(ship)); // (a ship facing left is mirrored about the middle of her bounds: keep her hull where it was)
    const newDeck = (y, x) => P.findIndex((q) => q.y === y && x >= q.x0 - 2 && x <= q.x1 + 2);
    const newConn = (i) => layout.connectors.findIndex((c) => c.type === oldC[i].type && c.xTop === oldC[i].xTop && c.xBottom === oldC[i].xBottom && P[c.top].y === oldC[i].yTop && P[c.bottom].y === oldC[i].yBottom);
    // lists of things standing on a deck ({ d, x }): follow their deck, or go with it
    const remap = (list) => {
      if (!list) return;
      for (let i = list.length - 1; i >= 0; i--) {
        const o = list[i];
        if (o == null || o.d == null || !oldP[o.d]) continue;
        const d = newDeck(oldP[o.d].y, o.x);
        if (d < 0) list.splice(i, 1); else o.d = d;
      }
    };
    // the crew
    const toss = (p) => {
      const away = Math.sign(p.x - bx) || (breakRng() < 0.5 ? -1 : 1);
      p.lock = null;
      p.fire = false;
      p.prog = 0;
      p.tossed = true; // (Action opens his parachute while he falls)
      const keep = oldP[p.d] ? nearestDeck(oldP[p.d].y, p.x) : 0; // (p.d stays a real deck of what is left: the bots' routing reads it while they fall)
      air.startFlight(p, away * (blast ? B.BAY.THROW : 140) * (0.5 + breakRng() * 0.6), blast ? -240 : 60);
      p.d = keep;
      p.face = away * ship.pose.f;
      state.breakStats.fell++;
      phoneFx(p, 'The deck is gone! You are falling - open the parachute or grab a ladder!', [120, 60, 120]);
    };
    const nearestDeck = (y, x) => P.reduce((best, q, d) => { const c = Math.abs(q.y - y) + (x == null ? 0 : 0.3 * Math.max(0, q.x0 - x, x - q.x1)); return c < best.c ? { c, d } : best; }, { c: Infinity, d: 0 }).d;
    for (const p of crew) {
      p.botJob = null; p.job = null; p.wanderTo = null; p.uk = null; // (walkers re-plan their routes against the new nav tables, the phones get their new buttons)
      if (p.fly || p.fall || p.d == null || p.onGunship || p.hj) { // (somebody already in the air or falling keeps a valid deck number: the bots' routing reads it)
        if (p.d != null && oldP[p.d] && !p.onGunship) p.d = nearestDeck(oldP[p.d].y, null); // (x is a world x in the air)
        continue;
      }
      if (p.conn != null) {
        const k = oldC[p.conn] ? newConn(p.conn) : -1;
        if (k >= 0) { p.conn = k; const nd = oldP[p.d] ? newDeck(oldP[p.d].y, p.x) : -1; p.d = nd >= 0 ? nd : layout.connectors[k].top; } else { p.climb = false; toss(p); } // (a climber keeps his ladder if it is still there; his deck index follows too)
        continue;
      }
      if (falls.has(p)) { toss(p); continue; }
      const nd = oldP[p.d] ? newDeck(oldP[p.d].y, p.x) : -1;
      if (nd < 0) toss(p); else p.d = nd;
    }
    for (const list of [state.breaches, state.fires, state.bombs, state.boarders, state.icing, state.loads]) remap(list);
    for (const b of state.bats || []) if (b.latched && b.d != null && oldP[b.d]) { const d = newDeck(oldP[b.d].y, b.lx); if (d < 0) { b.latched = false; b.landed = false; } else b.d = d; }
    if (state.cannons) for (const k of Object.keys(state.cannons)) if (!(layout.cannons || []).some((c) => c.n === k)) delete state.cannons[k];
    // the guns, lamps, coil and escorts are made again from the layout, keeping what the survivors hold
    for (const k of Object.keys(state.GUNS)) delete state.GUNS[k];
    Object.assign(state.GUNS, newGuns(layout));
    for (const [k, g] of Object.entries(state.GUNS)) if (keptGuns[k]) Object.assign(g, keptGuns[k]);
    searchlights.refit();
    coil.refit();
    if (layout.escortDocks.map((e) => e.n).join('|') !== docks) escort.reset();
    // whoever was on a station that is gone steps off it
    for (const p of crew) if (p.lock && !LOCKABLE(p.lock)) { p.lock = null; p.fire = false; }
    // the gasbags: each keeps its own gas (by where it hangs), valves and vents keep their setting, holes stay in their bag
    syncBags(state);
    layout.gasbags.forEach((b, i) => {
      const o = oldBags.find((q) => Math.abs(q.cx - b.cx) < 1.5);
      if (o && state.bags[i]) { state.bags[i].gas = o.gas; state.bags[i].down = o.down; state.bags[i].scorch = o.scorch; state.bags[i].burn = o.burn; state.bags[i].fireT = o.fireT; } // (a neighbour that is scorched or alight stays so)
    });
    state.gasValveOpen = (layout.gasValves || []).map((v) => { const o = oldValves.find((q) => q.x === v.x && q.p === v.p); return o ? o.open : true; });
    state.ventOpen = layout.vents.map((v) => { const o = oldVents.find((q) => q.x === v.x && q.p === v.p); return o ? o.open : false; });
    syncBags(state);
    for (let i = state.gasHoles.length - 1; i >= 0; i--) {
      const h = state.gasHoles[i];
      const o = oldBags[h.bag | 0];
      const nb = o ? layout.gasbags.findIndex((b) => Math.abs(b.cx - o.cx) < 1.5) : -1;
      if (nb < 0) { state.gasHoles.splice(i, 1); continue; }
      const nh = gasHoleAt(h.x, h.y, nb);
      Object.assign(h, { bag: nb, d: nh.d, x: nh.x, y: nh.y });
    }
    bagTear = [];
    // she is as heavy as she was but has less to lift her: the hover level rises, and past what the pump can hold she sinks (flight uses liftDeficit)
    const intact = lostList().length ? lostList()[0].before : before;
    state.liftDeficit = Math.max(0, hoverOf(plan.parts) - Math.max(config.BUILD_CHECK.HOVER_MAX, hoverOf(intact)));

    // the ledger: what broke off, what it will cost to mend, and the parts as they were (a sky-dock REBUILD card brings them back)
    const lost = lostList();
    const entry = { id: 'lost' + (lost.length ? Math.max(...lost.map((e) => +e.id.slice(4) || 0)) + 1 : 1), cause: spec.cause || spec.kind, label: plan.summary, names: plan.names, before, price: rebuildPrice(plan), mass: plan.mass, lift: plan.lift, buildId: lost.length ? lost[0].buildId : ship.buildId };
    lost.push(entry);
    ship.buildId = 'broken';
    const S = state.breakStats;
    S.events++; S.parts += plan.labels.length; S.scars += plan.scars.length;
    (S.causes ||= []).push(entry.cause + '@' + Math.round(world.ev ? world.ev.t || 0 : 0)); // (what broke her, and when on the director's clock: botsim prints it)
    S[spec.cause === 'ram' ? 'ram' : spec.cause === 'crash' ? 'crash' : spec.kind === 'blast' ? 'bay' : spec.kind === 'bag' ? 'bag' : 'hit']++;
    breakCd = B.GRACE;
    // show it: smoke and sparks, the word, the shake, the kick, the pieces
    shipPop(bx, by - 90, blast ? 'bayBoom' : 'snap', blast ? '#ff7b00' : '#e8d8b0', blast ? 1.8 : 1.3);
    for (const pc of plan.pieces) for (let k = 0; k < (blast ? 14 : 8); k++) shipPuff(pc.box.x0 + breakRng() * (pc.box.x1 - pc.box.x0), pc.box.y0 + breakRng() * (pc.box.y1 - pc.box.y0), k % 3 ? '#555' : '#ff8c42', 1);
    state.ship.shake = Math.max(state.ship.shake, blast ? B.BAY.SHAKE : 0.7);
    hitForce(state, bx, by, blast ? B.BAY.POWER : 3);
    state.sfxQ.push([blast ? 'alarm' : 'impact']);
    for (const p of crew) phoneFx(p, null, blast ? [200, 60, 200] : [120, 40, 80]);
    if (ship.main) {
      state.ev.warn = 5;
      const nm = plan.names.length ? plan.names.slice(0, 3).join(', ') + (plan.names.length > 3 ? ' +' + (plan.names.length - 3) + ' MORE' : '') : plan.summary.split(',')[0];
      state.ev.warnText = (blast ? 'THE BOMB BAY EXPLODED! ' : spec.cause === 'hydrogen' ? 'THE HYDROGEN BAG EXPLODED! ' : spec.cause === 'bag' ? 'A GASBAG TORE AWAY! ' : 'PARTS BROKE OFF! ') + (nm ? 'LOST: ' + nm.toUpperCase() : '');
    }
    if (W.debris) W.debris.spawn(ship, plan, pics, { origin: { x: bx, y: by }, blast });
    if (W.afterBreak) W.afterBreak(ship); // (the world: the danger of the voyage follows her strength, shipPower.js)
    return { plan, entry };
  }

  // The loaded bomb bay goes up: the bombs are gone, the blast takes the parts round it (BREAKOFF.BAY), hurts the hull, and sets fire to the coal, ammunition and boiler within reach.
  function explodeBay(cause = 'hit') {
    const B = BOC().BAY, bay = layout.bombBay;
    if (!bay) return null;
    state.bombBay.bombs = 0;
    bayHeat = 0;
    const bx = bay.x, by = bay.y - 30;
    health.blast(bx, by, config.HEALTH.BAY_RADIUS, { big: true, cause: 'blast' }); // (crew health: whoever is close to the bay when it goes up is knocked out at once)
    const r = breakOff({ kind: 'blast', x: bx, y: by, r: B.RADIUS, cause: 'bombbay-' + cause });
    damageHull(B.HULL);
    modules.hitAt(bx, by, shipPuff, 3, 1);
    let lit = 0;
    const near = [...all('coal'), ...all('ammo'), ...all('boiler')].map((s) => ({ s, d: Math.hypot(s.x - bx, PLATFORMS[s.d].y - by) })).filter((o) => o.d < B.CHAIN_RADIUS).sort((a, b) => a.d - b.d);
    for (const { s } of near) {
      if (lit >= B.FIRES) break;
      if (fireSys.ignite(s.d, s.x + (breakRng() - 0.5) * 80, 'hit', { over: true })) lit++; // (chain reaction: the coal flares into a blaze, fire.js)
    }
    if (!r) { // nothing came off (armour, or too little left to take): she is shaken and burned all the same
      shipPop(bx, by - 90, 'bayBoom', '#ff7b00', 1.8);
      state.ship.shake = Math.max(state.ship.shake, B.SHAKE);
      hitForce(state, bx, by, B.POWER);
      if (ship.main) { state.ev.warn = 4; state.ev.warnText = 'THE BOMB BAY EXPLODED!'; }
    }
    return r;
  }

  // A hydrogen bag goes up (hydrogen.js, config.GASES.HYDROGEN): bag i tears away (breakOff: the bag, and the crow's nests it carried), fires start on the decks under it, the crew near it are blasted, hull is lost,
  // and a hydrogen bag touching it catches too. blast = false: it had burnt down to nothing and only fizzles (it still tears away). The ship's ONLY bag cannot tear away (planBreak keeps the biggest bag): she is
  // ripped open instead - empty and full of holes - and falls.
  function explodeBag(i, blast = true) {
    const H = config.GASES.HYDROGEN, bag = layout.gasbags[i], mine = state.bags[i];
    if (!bag || !mine || state.ship.down) return null;
    const fill = Math.max(0.2, Math.min(1, mine.gas / 100 + 0.2));
    const bx = bag.cx, by = bag.cy + bag.ry + 40;
    state.gasStats[blast ? 'exploded' : 'fizzled']++;
    // the neighbours it touches catch (before the bags are made again: breakOff keeps what burns)
    layout.gasbags.forEach((o, j) => {
      const nb = state.bags[j];
      if (j === i || !nb || nb.type !== 'hydrogen' || nb.burn > 0) return;
      if (Math.max(o.x0 - bag.x1, bag.x0 - o.x1) <= H.CHAIN_GAP && breakRng() < H.CHAIN && hydrogen.light(j, H.CHAIN_FUSE, 'chain')) state.gasStats.chained++;
    });
    if (blast) {
      health.blast(bx, by, H.BLAST_RADIUS, { big: H.BLAST_BIG, hearts: H.BLAST_HEARTS, cause: 'blast' });
      damageHull(H.HULL * fill);
    }
    const r = layout.gasbags.length > 1 ? breakOff({ kind: 'bag', index: i, cause: 'hydrogen' }, { force: true }) : null; // (her only bag stays: planBreak keeps the biggest)
    if (blast) {
      let lit = 0;
      const decks = bagFireSpots(layout, bag);
      for (let k = 0; k < H.FIRES * 3 && lit < H.FIRES && decks.length; k++) {
        const sp = decks[(breakRng() * decks.length) | 0];
        if (fireSys.ignite(sp.d, sp.lo + breakRng() * (sp.hi - sp.lo), 'hit', { over: true, big: true })) lit++;
      }
      shipPop(bx, by - 120, 'bayBoom', '#ff7b00', 1.8);
      for (let k = 0; k < 14; k++) shipPuff(bx + (breakRng() - 0.5) * bag.rx * 1.6, bag.cy + (breakRng() - 0.5) * bag.ry, k % 3 ? '#555' : '#ff8c42', 1);
      state.ship.shake = Math.max(state.ship.shake, H.SHAKE);
      hitForce(state, bx, by, H.POWER);
      state.sfxQ.push(['alarm']);
    }
    if (!r) { // the only bag (or the ship is going down): it stays on her, burnt out
      const now = state.bags[i];
      if (now) { now.burn = 0; now.scorch = 0; if (blast) { now.gas = 0; now.cool = H.RELIGHT; } }
    }
    if (!r && blast) { // ...and ripped open: no gas, holes everywhere
      for (let k = state.gasHoles.length; k < config.GAS.MAX_HOLES; k++) state.gasHoles.push(gasHoleAt(bag.cx + (k - 4) * 60, bag.cy, i));
      if (ship.main) { state.ev.warn = 4; state.ev.warnText = 'THE HYDROGEN BAG EXPLODED! PATCH AND PUMP!'; }
    }
    return r;
  }

  // A hit at (x, y) of this power (before armour): can it set off a loaded bomb bay, or break off the end or limb it struck?
  function hardHit(x, y, power) {
    const B = BOC();
    if (!B.ENABLED || state.ship.down || goingDown.protect()) return;
    const bay = layout.bombBay;
    if (bay && state.bombBay.bombs >= 1 && power >= B.BAY.MIN_POWER && Math.hypot(x - bay.x, y - bay.y) < B.BAY.HIT_RADIUS) {
      const p = B.BAY.HIT_CHANCE * Math.min(1, state.bombBay.bombs / config.BOMBS.START) * chanceMul(x, y);
      if (breakRng() < p) { explodeBay('hit'); return; }
    }
    if (breakCd > 0 || power < B.HIT.MIN_POWER) return;
    const chance = Math.min(B.HIT.MAX, B.HIT.CHANCE + (power - B.HIT.MIN_POWER) * B.HIT.PER_POWER) * chanceMul(x, y);
    if (breakRng() < chance) breakOff({ kind: 'limb', x, y, reach: B.HIT.END_REACH, len: B.HIT.LIMB, cause: 'hit' });
  }

  // The hull met rock (kind 'crash') or another ship (kind 'ram') at (x, y) with this closing speed (px/s): the faster, the likelier the part at the contact breaks off.
  function crash(x, y, closing, kind = 'crash', mul = 1) { // (mul: a ram prow, config.RAM, lowers the rammer's chance and raises the other ship's)
    const B = BOC(), C = kind === 'ram' ? B.RAM : B.CRASH;
    if (!B.ENABLED || breakCd > 0 || state.ship.down || closing < C.MIN_CLOSING || goingDown.protect()) return false;
    const chance = (C.CHANCE + (C.MAX - C.CHANCE) * Math.max(0, Math.min(1, (closing - C.MIN_CLOSING) / (C.FULL_CLOSING - C.MIN_CLOSING)))) * chanceMul(x, y) * mul;
    if (breakRng() >= chance) return false;
    return !!(breakOff({ kind: 'limb', x, y, reach: C.END_REACH ?? B.HIT.END_REACH, len: B.HIT.LIMB, cause: kind }) || breakOff({ kind: 'limb', x, y, reach: C.FAR, len: B.HIT.LIMB, cause: kind })); // (nothing near the contact - the nose of the gasbag took the rock - and the bow crumples instead)
  }

  const impact = (x, y, power, hullMul = 1) => {
    impactBody(x, y, power, hullMul);
    if (power >= 2 && BOC().ENABLED) hardHit(x, y, power); // (the blow as it was struck: plate on the spot lowers the chance inside hardHit)
  };

  let lastJolt = 0;
  const prime = createPrime({ state, phoneFx }); // primed shells: hold PRIME on a gun to charge the loaded shell (prime.js)
  const links = createLinks({ state, modules, shipPuff }); // linked stations: gun + loader, helm + lookout, boiler surge (links.js)
  const sails = createSails({ state, modules }); // wind and sails: the extra speed of raised sails, gust tears (sails.js)
  const engines = createEngines({ state, modules }); // pointed engines: the thrust of each, swivel mounts (engines.js)
  const forces = createForces(state); // forces at places: engines, sails, gusts, hits ... twist her about her centre of mass (forces.js)
  const balance = createBalance(state); // the seesaw: live centre of mass against the bag's lift (balance.js)
  const flight = createFlight({ state, ship }); // the forces on her drive her pose: engines, sails, drag, buoyancy, weight (flight.js)
  const fireSys = createFire({ state, shipPuff }); // fire that cares where things are: flammability, spreading, the coal blaze (fire.js, fireModel.js)
  const goingDown = createGoingDown({ state, phoneFx, puff, shipPuff, wreck: (t) => wreck(t), gasHoleAt, getCargo: () => cargo, breakOff: (spec, opts) => breakOff(spec, opts) }); // GOING DOWN! last stand: her lift against her weight (goingDown.js)
  state.gdJobs = goingDown.jobsFor; // (read by jobs.js)
  const comeAbout = createComeAbout(ship, W, { goingDown, flight }); // turning her round on the helm's command (comeAbout.js)

  const health = createHealth({ state, ship, phoneFx, emitPlayerUi, shipPuff, shipPop }); // crew health: hearts, burns, the medical bay (health.js)
  const hydrogen = createHydrogen({ state, ship, fireSys, explode: (i, blast) => explodeBag(i, blast), shipPuff, rng: () => breakRng() }); // hydrogen bags: scorched by fire, alight, exploding (hydrogen.js, config.GASES.HYDROGEN)
  const raiders = createRaiders({ state, modules, puff, impact });
  const escort = createEscort({ state, puff, phoneFx });

  // A latched bat chews a hole: a gasbag leak, or a breach in the deck it sits on (ship coordinates).
  const gnaw = (kind, x, y, d) => {
    shipPuff(x, y, '#4a3b5c', 6);
    if (kind === 'gas') {
      if (state.gasHoles.length < config.GAS.MAX_HOLES) state.gasHoles.push(gasHoleAt(x, y));
    } else if (state.breaches.length < 10) {
      const p = PLATFORMS[d];
      state.breaches.push({ x: clamp(x, p.x0 + 20, (p.id === 'main' ? shipGeom(layout).MAIN_X1 : p.x1) - 20), d, prog: 0 });
    }
  };

  const coil = createCoil({ state, puff, credit });
  const searchlights = createSearchlights({ state });
  // B.3: another ship has the sky's hazards of her own (ice, lava thermals, spores, oxygen, storm rods, the sea): the same rules, made with HER context and stepped from the world's step.
  // (Ship 0's copy is the world's: simulation.js makes it, and her context forwards state.env, icing ... to it.) What stays shared is the sky itself: one weather record, one lightning bolt, one sea level.
  if (!ship.main) ownEnv = createEnvironment({ state, puff, phoneFx, impact, damageHull, ignite: fireSys.ignite });
  const air = createAirborne({ state, puff, phoneFx });
  const cannon = createCannon({ state, ship, air, modules, puff, phoneFx, stat }); // the crew cannon's two stations (cannon.js)
  const cargo = createCargo({ state, ship, air, puff, phoneFx, stat }); // thrown ballast, loads on her decks, shovelling and dumping (cargo.js)

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

  // A boarder who is out cold is carried to his own ship's medical bay, where he wakes (dazed) among his crewmates.
  const sendHome = (p) => {
    const home = homeOf(p);
    if (home === ship) return;
    detach(p);
    const rv = home.layout.reviveSpot();
    transfer(world, p, home, rv.d, rv.medbay ? rv.x + (Math.random() - 0.5) * 60 : rv.x);
    p.carry = null;
    p.hook = null;
    phoneFx(p, 'Carried back to your own ship...', [60, 40, 60]);
  };
  // The boarder's two hold actions have run their course: the boiler sabotaged, the helm taken.
  const sabotageBoiler = (player) => {
    const boiler = one('boiler');
    if (!boiler) return;
    if (ship.ai) return gunship.plant(player); // (the gunship: the charge is set, run!)
    fireSys.lightBoiler(boiler, 2);
    const pipes = modules.list.filter((m) => m.kind === 'pipe' && !m.broken);
    if (pipes.length) modules.damage(pipes[(Math.random() * pipes.length) | 0], 999, shipPuff);
    modules.damage(modules.byName[boiler.n], config.MODULES.BOILER_BLOWOUT_DAMAGE, shipPuff);
    shipPuff(boiler.x, platformY(boiler.d) - 70, '#fff', 20);
    shipPop(boiler.x, platformY(boiler.d) - 160, 'boiler', '#ff5a1f', 1.6);
    state.ship.shake = Math.max(state.ship.shake, 0.6);
    state.ev.warn = 3;
    state.ev.warnText = 'THE ' + (ship.team ? ship.team.name + ' ' : '') + 'BOILER IS SABOTAGED!';
    tally(player, 'sabotage');
    if (player.bot && all('coal').length) player.stealNow = true; // (B.6: ...and now he loots her bunker)
    phoneFx(player, 'Boiler sabotaged!', [60, 60, 60]);
  };
  const takeHelm = (player) => {
    const helm = one('helm');
    if (!helm) return;
    if (ship.ai) return gunship.captured(player); // (the gunship: her helm is taken, she surrenders)
    const old = holder('helm');
    if (old && old !== player) { old.lock = null; old.fire = false; old.restCd = 4; old.x = helm.x + 60; }
    player.lock = helm.n; // (he is at the wheel now: whoever is on the other end of the ship's team is flying her until he lets go)
    player.x = helm.x;
    state.ev.warn = 4;
    state.ev.warnText = 'HELM TAKEN BY ' + (player.team || '').toUpperCase() + '!';
    tally(player, 'captures');
    if (world.match && world.match.captured) world.match.captured(ship, player);
  };

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
        shipPuff(player.x + 200, player.y - 60, '#ffe9a8', 8);
        phoneFx(player, 'Hooked! Press Action at the bow to swing across!', [40, 30, 40]);
      } else phoneFx(player, 'Too far - the hook falls short! Get closer.', [40, 30, 40]);
    } else if (type === 'swing') gunship.swing(player);
    else if (type === 'rack') {
      const put = player.carry === act.obj.kind;
      if (isStocked(act.obj.kind)) { if (cargo.rack(player, act.obj)) grabbed(player, put); } // (B.6: sandbags and crates come from a finite stock)
      else {
        player.carry = put ? null : act.obj.kind;
        grabbed(player, put);
      }
    } else if (type === 'dump') cargo.dump(player);
    else if (type === 'dropcargo') cargo.drop(player);
    else if (type === 'chute') {
      if (air.popChute(player)) phoneFx(player, 'Parachute coming out - steer with the stick!', [40]);
    } else if (type === 'steal') {
      state.ship.fuel = Math.max(0, state.ship.fuel - config.CROSS.CARGO.STEAL_FUEL); // her coal bunker is the lighter for it: the sack goes with the thief
      player.carry = 'coal';
      player.stealNow = false;
      grabbed(player, false);
      stat(player, 'stolen');
      shipPuff(act.station.x, PLATFORMS[act.station.d].y - 50, '#2b2b2b', 8);
      tally(player, 'stolen');
      phoneFx(player, 'Coal sack lifted! Get it home to YOUR boiler', [50, 30, 50]);
    } else if (type === 'vent') {
      const i = layout.vents.indexOf(act.obj);
      state.ventOpen[i] = !state.ventOpen[i];
      stat(player, 'vent');
      shipPuff(act.obj.x, PLATFORMS[act.obj.d].y - 150, '#ffffff', 8);
    } else if (type === 'gasvalve') {
      const i = layout.gasValves.indexOf(act.obj);
      state.gasValveOpen[i] = !state.gasValveOpen[i];
      syncBags(state); // (the bag is cut off, or fed again, from this moment)
      shipPuff(act.obj.x, PLATFORMS[act.obj.d].y - 60, state.gasValveOpen[i] ? '#9cc99a' : '#e2a24a', 7);
      shipPop(act.obj.x, PLATFORMS[act.obj.d].y - 140, `${bagName(act.obj.bag, state.bags.length)} VALVE ${state.gasValveOpen[i] ? 'OPEN' : 'SHUT'}`, state.gasValveOpen[i] ? '#9cc99a' : '#e2a24a', 0.9);
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
      shipPuff(act.obj.pos.x, act.obj.pos.y, '#ffffff', 6);
    } else if (type === 'load') {
      act.obj.ammo = Math.min(act.obj.max, act.obj.ammo + loadOf(act.obj));
      stat(player, 'ammo');
      player.carry = null;
      shipPuff(act.station.x, player.y - 60, '#ffd23f', 8);
    } else if (type === 'loadBombs') {
      state.bombBay.bombs = Math.min(config.BOMBS.MAX, state.bombBay.bombs + config.BOMBS.LOAD);
      stat(player, 'ammo');
      player.carry = null;
      shipPuff(act.station.x, player.y - 60, '#ffd23f', 8);
    } else if (type === 'ammo') {
      player.carry = 'ammo';
      grabbed(player, false);
    } else if (type === 'coal') {
      player.carry = 'coal';
      grabbed(player, false);
    } else if (type === 'stoke') {
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

  // ---- One step of THIS ship, in the stages simulation.js interleaves with the world's (MOVEMENT.md B.2). With one ship the order is the old one exactly. ----
  let gasManned = false; // is someone working the gas (the helm's PRESSURE lever)
  let helmFlown = false; // did someone steer this frame

  // Before the step: fit the gasbags to a new build, and the trim engine is off until the helmsman asks.
  const preStep = () => syncBags(state); // (a new build was applied at the dock: fit the gasbags to it)
  const trimOff = () => { state.ship.trim = 0; };

  // A1: the crew: bots think, everyone walks, climbs, mans stations and presses buttons; the phones are told what their buttons do now.
  const stepCrew = (dt) => {
    helmFlown = false;
    gasManned = false;
    comeAbout.begin();
    for (const player of Object.values(state.players)) {
      if (world.ships.length > 1 && shipOf(world, player) !== ship) continue; // (carried to another ship earlier in this very loop: a captured gunship sends everyone aboard her home)
      if (player.bot) updateBot(player, state, dt);
      if (player.koGrace > 0) player.koGrace -= dt;
      health.step(player, dt); // (crew health: i-frames, burns, the medical bay, the flashes)
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
          const overboard = !!w.tumble; // (blown or thrown off the ship; a crewman dropping in from the sky to join does not tumble)
          air.clear(w);
          // Fell off the ship (or off a gunship): back aboard in the medical bay, dazed (no medbay: on the spawn deck at a boarding point).
          // (A boarder who falls off the RIVAL's deck wakes in his own ship's medical bay.)
          const dest = isHostile(w) ? homeOf(w) : ship;
          const rv = dest === ship ? reviveSpot() : dest.layout.reviveSpot();
          if (dest !== ship) transfer(world, w, dest, rv.d, rv.medbay ? rv.x + (Math.random() - 0.5) * 60 : rv.x);
          w.d = rv.d;
          w.x = rv.medbay ? rv.x + (Math.random() - 0.5) * 60 : rv.x;
          w.y = dest.layout.platforms[w.d].y;
          w.fall = false;
          w.ko = config.GUNSHIP.RESPAWN_TIME;
          if (overboard && config.HEALTH.ENABLED && !w.enemy) w.hearts = Math.max(Math.min(1, heartsOf(w)), heartsOf(w) - config.HEALTH.OVERBOARD); // (crew health: a fall overboard costs a heart, but never the last one)
          w.carry = null;
          phoneFx(w, rv.medbay ? 'You fell! Coming round in the medical bay...' : 'You fell! You scramble back aboard, dazed...', [80, 40, 80]);
        });
        continue;
      }
      if (player.d == null) player.d = platformBelow(player.x, player.y) ?? 1;
      if (player.ko > 0) {
        if (isHostile(player) && !player.fly) { sendHome(player); continue; } // (a boarder knocked out is carried back to his own ship)
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
          wake(player); // (crew health: he comes round with a heart at least)
        }
        const hpNow = config.HEALTH.ENABLED ? Math.round(heartsOf(player) * 2) / 2 : null;
        if (player.uk !== 'ko' + hpNow) {
          player.uk = 'ko' + hpNow;
          if (!player.bot) {
            player.ui = { ko: true, hp: hpNow, hpMax: config.HEALTH.MAX, jat: config.HEALTH.JOB_AT };
            emitPlayerUi(player.id, player.ui); // (it was never sent before: the phone kept its old buttons while knocked out)
          }
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
      const nearStations = !player.lock && player.conn == null ? layout.stations.filter((s) => s.d === player.d && Math.abs(player.x - s.x) < T.STATION_REACH) : [];
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
            const want = player.jx > 0.25 ? player.jx : player.jx < -0.25 ? player.jx * SH.REVERSE : player.thr != null ? clamp(player.thr, REV, 1) : flight.order(); // (the lever stays where it was)
            driveSpeed(want);
            state.ship.trim = Math.abs(player.jy) > 0.15 ? -player.jy : 0;
            state.gasValve.input = goingDown.active() ? 1 : clamp(player.gas || 0, -1, 1); // (GOING DOWN!: the hand at the helm pumps flat out)
            gasManned = true;
            helmFlown = true;
            if (player.ca || (!player.bot && player.jx < -SH.TURN.STICK)) comeAbout.ask(player); // COME ABOUT: the phone's button held, or the stick held hard astern (people only)
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
        } else if (kindOf(player.lock) === 'swivel') {
          engines.turn(player, dt); // the stick turns the engine (engines.js)
        } else if (kindOf(player.lock) === 'cannon') {
          cannon.gunner(player, dt); // the crew cannon's gunner: the stick aims the barrel, hold to charge, let go to fire (cannon.js)
        } else if (kindOf(player.lock) === 'cannonSeat') {
          cannon.seat(player, dt); // ...and the one in the barrel: with nobody at the post he aims and fires himself
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
              const [bx, by] = tilt(state, layout.bombBay.x, layout.bombBay.y);
              course.dropBomb(toWorldX(ship, bx), toWorldY(ship, by) + 20, player.id);
            }
          }
        } else if (gun) {
          gun.cd = Math.max(0, gun.cd - dt);
          prime.charge(player, gun, working, dt);
          // Turn toward the stick, but only within this gun's firing arc (a broken gun is jammed).
          if (working && Math.hypot(player.jx, player.jy) > 0.25) {
            const A = config.AIM_ASSIST;
            const wanted = assistAim(state, gun, Math.atan2(player.jy, player.jx), A.ANGLE * (gun.type === 'mortar' ? config.GUN_TYPES.mortar.ASSIST : 1), A.STRENGTH); // (a mortar's angle is its range: the assist reaches wider)
            gun.aim = gun.home + clamp(angleDiff(wanted, gun.home), -gun.arc, gun.arc);
          }
          if (gun.type === 'flame') {
            // The flamethrower burns while the button is held (a tap gives a short burst); the tank, the steam, the heat and the cone are flame.js, once a frame in the gun upkeep below.
            if ((player.actQ || player.fire) && !state.ship.down) {
              if (ship.pose.turn > 0 || !working) {
                gun.empty = 0.8;
                gun.emptyText = ship.pose.turn > 0 ? 'TURNING!' : 'BROKEN!';
              } else {
                gun.flameHold = Math.max(gun.flameHold || 0, player.actQ ? config.FLAME.TAP : 0.12);
                gun.flameWho = player;
              }
            }
          } else if ((player.actQ || player.fire) && gun.cd <= 0 && !state.ship.down) {
            if (ship.pose.turn > 0) {
              gun.cd = 0.3; // (the guns cannot fire while she comes about)
              gun.empty = 0.6;
              gun.emptyText = 'TURNING!';
            } else if (!working || gun.ammo <= 0 || env.gunJammed(player.lock)) {
              gun.cd = 0.5;
              gun.empty = 0.8;
              gun.emptyText = !working ? 'BROKEN!' : gun.ammo <= 0 ? 'EMPTY!' : 'ICED - CHIP IT!';
            } else {
              gun.ammo -= 1;
              gun.cd = (gun.type ? specOf(gun).cd : config.GUNS.COOLDOWN) * env.gunCooldownMul(player.lock);
              if (ship.ai) ship.ai.shoot(player, gun, player.lock); // (the enemy gunship's guns fire her own slow cannonballs, which hit the main ship and nothing else: gunshipShip.js)
              else {
              const angle = aimToWorld(ship, gun.aim + (state.ship.pitch || 0)); // (gun.aim is in ship space, the shell flies along the world)
              const [gx, gy] = tilt(state, gun.bx, gun.by);
              const primed = prime.take(gun); // a fully primed shell: harder hit, bigger blast (config PRIME)
              const wgx = toWorldX(ship, gx); // (the muzzle, in the world; a shell leaves at SHELL_SPEED relative to the ship and keeps her speed)
              const wgy = toWorldY(ship, gy);
              if (gun.type) {
                if (!fireTyped({ ship, state, gun, player, angle, wx: wgx, wy: wgy, primed, puff, W })) { gun.ammo += 1; gun.cd = 0.8; gun.empty = 0.8; gun.emptyText = 'NO TARGET'; } // (a typed gun: weapons.js; a harpoon that found no deck in its line gives the shot back)
              } else {
              state.shells.push({
                x: wgx + Math.cos(angle) * 60,
                y: wgy + Math.sin(angle) * 60,
                vx: Math.cos(angle) * config.GUNS.SHELL_SPEED + ship.pose.vx,
                vy: Math.sin(angle) * config.GUNS.SHELL_SPEED,
                life: config.GUNS.SHELL_LIFE * (gun.reach || 1),
                owner: player.id,
                from: ship.id, // (the ship that fired it: Versus shells hit every OTHER ship, pvp/match.js)
                ...(primed ? { mul: config.PRIME.DAMAGE_MUL, primed: true } : {}),
              });
              puff(wgx + Math.cos(angle) * 64, wgy + Math.sin(angle) * 64, primed ? '#ff9a2e' : '#ffe9a8', primed ? 12 : 4);
              state.flashes.push({ x: wgx + Math.cos(angle) * 70, y: wgy + Math.sin(angle) * 70, ang: angle, t: primed ? 0.17 : 0.09, color: primed ? '#ff9a2e' : '#fff2b0', size: primed ? 2.7 : 1.3 });
              if (primed) {
                state.rings.push({ x: wgx + Math.cos(angle) * 64, y: wgy + Math.sin(angle) * 64, t: 0.3, max: 0.3, color: '#ffd23f', size: 110 });
                state.sfxQ.push(['bigshot']);
              }
              }
              }
            }
          }
        }
        if (gun) player.face = Math.cos(gun.aim) < 0 ? -1 : 1;
        else if (isSearchlight(player.lock, layout)) player.face = Math.cos(state.searchlights.find((l) => l.n === player.lock).aim) < 0 ? -1 : 1;
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
              shipPuff(player.x, player.y - 4, '#d9cbb0', 3);
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
              shipPuff(object.pos.x, object.pos.y, '#8fe388', 10);
              stat(player, 'repairs');
              shipPop(object.pos.x, object.pos.y - 50, 'repair', '#8fe388', 0.8);
            }
          } else if (act.type === 'rod') env.stormSea.rodHold(object);
          else if (act.type === 'pump') env.stormSea.pumpWork(dt);
          else if (act.type === 'winch') env.stormSea.winchWork(object, dt);
          else if (act.type === 'prime') prime.assist(player, object, act.gunner, dt);
          else if (act.type === 'surge') links.surgeHold(player);
          else if (act.type === 'sail') {
            const before = object.hoist;
            sails.haul(object, dt);
            if (before < 1 && object.hoist >= 1) { stat(player, 'sails'); state.sailStats.raised++; shipPop(player.x, player.y - 150, 'SAIL UP!', '#e9dcc0', 0.8); }
          } else {
            object.worked = true;
            object.prog = (object.prog || 0) + dt / act.time;
            if (object.prog >= 1) {
              object.prog = 0;
              stat(player, { fire: 'fires', hole: 'holes', gas: 'holes', ice: 'ice', unclog: 'clears', oxygen: 'oxygen', defuse: 'defused', revive: 'revives', bandage: 'revives', sabotage: 'sabotage', cutline: 'boarding', capture: 'captures', shovel: 'shovels', cut: 'cuts', dumpcoal: 'dumped', dumpbombs: 'dumped' }[act.type]);
              if (act.type === 'fire') shipPop(object.x, player.y - 120, 'fireOut', '#9fd3e6', 0.8);
              if (act.type === 'hole' || act.type === 'gas') shipPop(object.x, player.y - 120, 'patch', '#8fe388', 0.8);
              if (act.type === 'fire') state.fires.splice(state.fires.indexOf(object), 1);
              else if (act.type === 'hole') {
                state.breaches.splice(state.breaches.indexOf(object), 1);
                state.ship.hull = Math.min(100, state.ship.hull + 3);
              } else if (act.type === 'defuse') state.bombs.splice(state.bombs.indexOf(object), 1);
              else if (act.type === 'gas') state.gasHoles.splice(state.gasHoles.indexOf(object), 1);
              else if (act.type === 'ice') env.chip(object);
              else if (act.type === 'unclog') env.deep.unclog(object);
              else if (act.type === 'oxygen') env.deep.refill();
              else if (act.type === 'sabotage') (isHostile(player) ? sabotageBoiler(player) : gunship.plant(player));
              else if (act.type === 'capture') takeHelm(player);
              else if (act.type === 'cutline') gunship.cutLine(player);
              else if (act.type === 'shovel') cargo.shovel(object, player); // (B.6: a load goes over the rail)
              else if (act.type === 'cut' || act.type === 'dumpcoal' || act.type === 'dumpbombs') goingDown.perform(act.type, object, player); // (GOING DOWN!: weight overboard)
              else if (act.type === 'bandage') health.bandage(object); // (crew health: a crewmate's bandage: a heart back)
              else { object.ko = 0; revived(object); } // (a revive: he comes round with a heart)
              shipPuff(object.x, player.y - 50, '#8fe388', 10);
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
      const jobShip = player.bot || player.hj ? null : jobFinder.ui(player);
      const jobUi = jobShip && ship.pose.f < 0 && (jobShip.dir === 'left' || jobShip.dir === 'right') ? { ...jobShip, dir: jobShip.dir === 'left' ? 'right' : 'left' } : jobShip; // (the phone shows the way on the SCREEN: a ship facing left has her left and right the other way round)

      // Tell the phone what its buttons do now.
      const stationName = player.lock || (station && station.n) || null;
      const gun = state.GUNS[stationName];
      const stKind = kindOf(stationName); // (the station's kind from the layout; `kind` below is the phone's name for it)
      const kind = PHONE_KIND[stKind] || (gun ? 'gun' : isSearchlight(stationName, layout) ? 'light' : isEscortStation(stationName, layout) ? 'escort' : null);
      const takenBySomeone = !player.lock && !!stationName && LOCKABLE(stationName) && Object.values(state.players).some((q) => q.lock === stationName && (q.bot ? player.bot : true));
      let label = 'Hey!';
      let hold = false;
      let cannonStatus = '';
      if (player.lock) {
        const working = modules.works(state, player.lock);
        label = !working && kind !== 'helm' && kind !== 'lookout' && kind !== 'light' && kind !== 'escort' && kind !== 'swivel' ? 'BROKEN' : kind === 'swivel' ? 'Swivel engine' : kind === 'gun' ? 'FIRE!' : kind === 'bombbay' ? 'DROP!' : kind === 'shield' ? 'Swing!' : kind === 'escort' ? ((escortFor(state, player.lock) || {}).flying ? 'Auto guns' : 'Wait...') : kind === 'coil' ? (state.coil.cd > 0 ? 'Cooling...' : 'CHARGE!') : kind === 'boiler' ? 'SHOVEL!' : kind === 'lookout' ? 'Ahoy!' : kind === 'light' ? 'FOCUS!' : 'Honk!';
        hold = kind === 'gun' || kind === 'bombbay' || kind === 'coil' || kind === 'light';
        const cph = kind === 'cannon' || kind === 'cannonseat' ? cannon.phone(player) : null; // (B.6: the crew cannon's own words)
        if (cph) { label = cph.label; hold = cph.hold; cannonStatus = cph.status; }
      } else if (player.act) {
        label = player.act.label;
        hold = !!player.act.hold;
      }
      if (player.fly) label = player.chuteOpen ? 'Steer!' : player.chute ? 'Chute...' : player.cannon ? 'PARACHUTE!' : player.fvy > 0 ? 'Falling!' : 'Airborne';
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
      if (!status && cannonStatus) status = cannonStatus;
      if (kind === 'helm' && player.lock && !status && goingDown.active()) status = `PUMPING FLAT OUT! Gas ${Math.round(state.ship.gas)}% - ${goingDown.status()}`; // (GOING DOWN!: the hand at the helm is the pump)
      if (kind === 'helm' && player.lock && !status) status = course.helmHint();
      if (isEscortStation(stationName, layout) && !status) status = escort.status(stationName);
      if (kind === 'light' && player.lock && !status) status = searchlights.status(stationName);
      if (kind === 'swivel' && player.lock && !status) status = engines.status(stationName);
      const feel = state.buoyancy > 0 ? 'RISING' : state.buoyancy < 0 ? 'FALLING' : 'holding';
      const leakNow = modules.leaks()[0];
      const leakText = leakNow ? (leakNow.pipe && leakNow.pipe.open ? `${leakNow.m.name} pipe leaking - close the valve or repair` : `${leakNow.m.name} leaking steam - repair it`) : '';
      if (kind === 'helm' && player.lock && !status && state.rig && !state.rig.boiler) status = `Hand wheel - no boiler, no steam: the lever can only VENT gas (down), the trim is weak${state.rig.engine ? ', the engines are dead' : ''}. The wind carries her.`;
      if (kind === 'boiler' && !status && leakText) status = `Steam ${Math.round(state.ship.press / 5) * 5}% - ${leakText}`;
      if (kind === 'boiler' && !status) status = `Steam ${Math.round(state.ship.press / 5) * 5}% - coal ${Math.round(state.ship.fuel / 5) * 5}%`;
      if (kind === 'helm' && player.lock && !status && (state.ship.press < config.GAS.PUMP_MIN_PRESS || state.gasHoles.length)) status = `Gas ${Math.round(state.ship.gas)}% - ${feel}${state.ship.press < config.GAS.PUMP_MIN_PRESS ? ' - NO STEAM TO PUMP!' : ''}${state.gasHoles.length ? ' - ' + state.gasHoles.length + ' holes leaking' : ''}`;
      if (kind === 'helm' && player.lock && !status && state.buoyancy) status = state.buoyancy > 0 ? 'Gasbag full - she is rising' : 'Gasbag low - she is dropping';
      if (gun && gun.type === 'flame' && player.lock && !status) status = gun.overheat ? 'OVERHEATED - let it cool' : state.ship.press < config.FLAME.MIN_PRESS ? 'No steam - stoke the boiler' : gun.ammo <= 0 ? 'Tank empty - bring COAL' : `Burner heat ${Math.round((gun.heat || 0) * 5) * 20}% - fuel ${gun.ammo}`;
      if (gun && !status && env.gunIce(stationName) > 0.35) status = env.gunJammed(stationName) ? 'ICED - CHIP IT! (hammer)' : 'Gun is icing up - chip it (hammer)';
      if (!status && !player.lock && goingDown.active()) status = goingDown.status();
      if (!status && state.ship.press >= config.BOILER.WARN_AT) status = 'PRESSURE HIGH - open a vent!';
      if (!status && !player.bot) status = env.deep.status(player) || ''; // spores (cough), clogged engines, oxygen
      const ammoText = gun ? gun.ammo : kind === 'bombbay' ? state.bombBay.bombs : null;
      let attackLabel = !player.lock && player.conn == null && batInReach(player, config.WAVES.BAT_NOTICE) ? 'Swat bat!' : player.carry === 'sword' ? 'Swing' : player.carry === 'hookshot' ? 'Hook!' : player.carry === 'towline' ? 'Hook a ship!' : !player.bot && cargo.wantsThrow(player, () => shoveNear(player)) ? 'Throw!' : 'Shove';
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
      const hp = config.HEALTH.ENABLED && !player.enemy ? Math.round(heartsOf(player) * 2) / 2 : null; // (crew health: hearts, in halves; the phone draws them)
      // (the two buttons: Action = label / id, Grab = the small amber button; ids go back with each press, see aidOf)
      const grabNow = player.bot || player.lock || player.hj || player.fly ? null : player.grabAct;
      const aid = player.bot || player.lock || player.hj ? '' : aidOf(player.act, player.carry);
      const gaid = grabNow ? aidOf(grabNow, player.carry) : '';
      const glock = !!(grabNow && player.grabLock > 0);
      const progNow = !player.lock && player.act && player.act.hold && player.act.obj && typeof player.act.obj.prog === 'number' ? Math.round(player.act.obj.prog * 10) : -1; // (how far a hold action has got)
      const key = [player.hj ? 'hj' + player.hj.phase : stationName, player.hj ? 'hijack' : kind, !!(player.lock || player.hj), takenBySomeone, label, ammoText, player.carry || '', hold, status, attackLabel, hull, primePct, loadPct, jobUi ? jobUi.label + '|' + jobUi.dir : '', aid, gaid, grabNow ? grabNow.label + grabNow.swap : '', glock, progNow, ship.pose.f, state.turning.t > 0 ? 1 : 0, hp, player.team ? player.team + (state.match && state.match.phase === 'lobby' ? 's' : '') : ''].join('|');
      if (key !== player.uk) {
        player.uk = key;
        if (!player.bot) {
          player.ui = { station: player.hj ? 'Stolen Fighter' : stationName, kind: player.hj ? 'hijack' : kind, locked: !!(player.lock || player.hj), taken: takenBySomeone, label, ammo: ammoText, carry: player.carry || null, hold, status, attack: attackLabel, hull, prime: primePct, load: loadPct, job: jobUi, aid, grab: grabNow ? grabNow.label : null, gaid, gswap: !!(grabNow && grabNow.swap), glock, prog: progNow, hp, hpMax: config.HEALTH.MAX, jat: config.HEALTH.JOB_AT, med: !!health.medbay(), fc: ship.pose.f, tn: state.turning.t > 0, tm: player.team ? { id: player.team, name: teamOf(player.team).name, color: teamOf(player.team).color, swap: !!(state.match && state.match.on && state.match.phase === 'lobby') } : null }; // (tm: Versus - the side the phone is on, and whether it may still swap)
          emitPlayerUi(player.id, player.ui);
        }
      }
    }

    comeAbout.hold(dt); // (the COME ABOUT command counts up, and goes through once it has been held long enough)
    state.lookout = state.periscope || Object.values(state.players).some((q) => kindOf(q.lock) === 'lookout');
    state.lookoutBonus = Object.values(state.players).some((q) => kindOf(q.lock) === 'lookout' && nestTier((layout.stations.find((s) => s.n === q.lock) || {}).p)) ? config.NEST.TIER_BONUS : 0; // (a lookout up on the high nest sees further ahead)
  };

  // A2: modules, steam, the engines and the gasbag, the flight, the wreck.
  const stepSystems = (dt) => {
    links.update(dt);
    if (state.cannons) cannon.update(dt); // (B.6: the crew cannon reloads; a ship with none skips both)
    if (state.loads || state.rackStock) cargo.update(dt);
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
      shipPuff(boiler.x, platformY(boiler.d) - 70, '#fff', 20);
      shipPop(boiler.x, platformY(boiler.d) - 160, 'boiler', '#ff5a1f', 1.6);
      modules.damage(modules.byName[boiler.n], config.MODULES.BOILER_BLOWOUT_DAMAGE, shipPuff);
      if (config.HEALTH.ENABLED) health.blast(boiler.x, platformY(boiler.d) - 40, config.HEALTH.BLOWOUT.RADIUS, { hearts: config.HEALTH.BLOWOUT.HEARTS, cause: 'blast' }); // (crew health: whoever stands at the boiler when it blows loses a heart)
      // The blowout throws flames about the firebox: a fire beside the boiler (and maybe a second), which spreads to whatever is near (the coal!).
      if (Math.random() < config.FIRE.BOILER_BLOWOUT_FIRES) fireSys.lightBoiler(boiler, Math.random() < 0.6 ? 2 : 1);
      const pipes = modules.list.filter((m) => m.kind === 'pipe' && !m.broken);
      if (pipes.length) modules.damage(pipes[(Math.random() * pipes.length) | 0], 999, shipPuff);
      state.ship.shake = 0.6;
      state.ev.warn = 3;
      state.ev.warnText = 'THE BOILER BLEW! A PIPE BURST!';
    }

    engines.update(dt); // (pointed engines: the speed they allow, the lift they make, engines.js)
    balance.update(dt);
    forces.update(dt); // (everything that pushed her at a place this frame twists her: forces.js)
    const wind = windSpeed(state); // (the wind alone: what a ship with no engines, no steam or nobody steering makes)
    const driven = rig.powered && state.thrust.drive; // (engines all pointing up, down or back do not push her ahead: the wind does)

    const bay = state.bombBay;
    bay.cd = Math.max(0, bay.cd - dt);
    bay.empty = Math.max(0, bay.empty - dt);
    bay.open = Math.max(0, (bay.open || 0) - dt);
    state.helmHit = Math.max(0, (state.helmHit || 0) - dt);
    if (holder('bombBay') && state.phase === 'flying') {
      const [bx, by] = tilt(state, layout.bombBay.x, layout.bombBay.y);
      bay.from = { x: toWorldX(ship, bx), y: toWorldY(ship, by) + 20 }; // (the drop line, in the world)
      bay.aim = course.predictBomb(bay.from.x, bay.from.y);
    } else bay.aim = null;
    for (const [gunName, gun] of Object.entries(state.GUNS)) {
      gun.empty = Math.max(0, gun.empty - dt);
      if (!taken(gunName)) prime.idle(gun, dt); // (a half-charge fades when nobody is holding it; the glow timer always runs)
      else gun.primedFlash = Math.max(0, (gun.primedFlash || 0) - dt);
      if (gun.type === 'flame') { // a flamethrower: the button, the tank, the steam, the heat, the cone and what it burns (flame.js)
        const [fx, fy] = tilt(state, gun.bx, gun.by);
        stepFlame({ ship, state, gun, name: gunName, wx: toWorldX(ship, fx), wy: toWorldY(ship, fy), angle: aimToWorld(ship, gun.aim + (state.ship.pitch || 0)), dt, puff, W });
      }
      // Auto-Loader upgrade: a free shell every so often.
      if (config.GUNS.AUTOLOAD_EVERY && gun.ammo < gun.max && (gun.auto = (gun.auto || 0) + dt) >= autoloadOf(gun)) {
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
    const assist = autopilotOn(state) && flying && !ship.ai && !goingDown.active(); // (the gunship has no autopilot: with no helmsman she drifts; falling, nobody pumps for her)
    const plan = assist && rig.helm && (!getHelm() || !gasManned) ? pilotPlan(state, 4, 0.3) : null;
    if (!getHelm()) {
      if (plan && worksKind('helm')) {
        state.autopilot = true;
        driveSpeed(plan.speed);
        state.ship.trim = clamp((plan.target - state.ship.alt) / 150, -1, 1) * 0.6;
      } else driveSpeed(flying ? (rig.helm ? 0.2 : wind * ship.pose.f) : 0.3); // (no helm at all: nobody can steer, she goes where the wind takes her)
    }
    // Along her bow: the engines chase the speed the helm ordered, the sails push, the air drags (flight.js); a turn in progress holds her speed down and flips the facing at the middle.
    flight.surge(dt, { wind, driven, helm: env.deep.helmMul() });
    comeAbout.fly(dt);
    if (!gasManned) valve.input = plan ? gasFor(state, plan.target) * 0.6 : 0;
    valve.auto = !gasManned && !!plan;

    // Gas: the valve pumps hot steam in (costs pressure; needs steam) or vents it. Hot gas slowly
    // cools and seeps out, and holes leak more.
    if (flying) {
      state.noPump = !rig.pump; // (no helm or no boiler: nobody can ever top her up, so the bag only seeps very slowly, see gasBags.js)
      const pumping = Math.max(0, valve.input) * (state.ship.press > G.PUMP_MIN_PRESS && modules.boilerUp() ? Math.min(1, state.ship.press / 60) : 0);
      state.steamParts.pump = pumping * G.PUMP_STEAM;
      // The pump and the vent act on every gasbag at once; seepage and holes are per bag (gasBags.js: with one bag this is the old single gas value).
      stepBags(state, pumping * G.PUMP_RATE * goingDown.pumpMul() * (1 + config.BOILER.OD_PUMP * state.overdrive) * state.links.helmMul + Math.min(0, valve.input) * G.VENT_RATE * state.links.helmMul, dt);
      state.ship.press = Math.max(0, state.ship.press - pumping * G.PUMP_STEAM * dt);
      watchBags(state); // a bag going flat: "FORE BAG DOWN!"
      stepHotAir(state, dt, hasKind('boiler') && modules.boilerUp()); // (hot-air bags: the burner's heat follows the boiler, gasBags.js)
      breakCd = Math.max(0, breakCd - dt);
      if (state.bags.length >= BOC().BAG.MIN_BAGS && BOC().ENABLED) { // a bag that is flat and ripped to rags for long enough tears away (S.5i)
        const holes = holesPerBag(state);
        state.bags.forEach((b, i) => { bagTear[i] = holes[i] >= BOC().BAG.HOLES && b.gas <= BOC().BAG.FLAT ? (bagTear[i] || 0) + dt : Math.max(0, (bagTear[i] || 0) - dt); });
        const torn = bagTear.findIndex((t) => t >= BOC().BAG.TEAR_TIME);
        if (torn >= 0) { bagTear = []; breakOff({ kind: 'bag', index: torn, cause: 'bag' }); }
      }
      // Emergency ballast: the gasbag is empty and the ship is dropping - the crew cuts loose ballast so she hovers for a
      // moment (time to patch and pump). Once in a while only; it is a lifeline, not a fix.
      const BL = G.BALLAST;
      state.ballastCd = Math.max(0, (state.ballastCd || 0) - dt);
      if (BL && state.ship.gas < BL.BELOW && state.ballastCd <= 0 && !goingDown.active()) { // (falling, the crew's own dumping is the ballast)
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
    const effGas = liftGas(state) - state.env.sink - state.liftDeficit + state.env.lift / G.LIFT; // (liftDeficit: gasbags torn away leave her heavy for the lift she has left, S.5i)
    const lift = (effGas - G.NEUTRAL) * G.LIFT;
    const trim = state.ship.trim * SHM.TRIM_ACCEL * (worksKind('helm') ? (modules.handWheel() ? config.WIND.HAND_TRIM : 1) : 0) * env.deep.helmMul() * state.links.helmMul; // (a lookout in the nest sharpens the helm: links.js)
    state.buoyancy = effGas > G.NEUTRAL + 5 ? 1 : effGas < G.NEUTRAL - 5 ? -1 : 0;
    state.sinking = state.buoyancy < 0;
    if (flying) {
      if (!goingDown.active()) flight.climb(dt, lift + trim + state.balance.push + state.forces.vyAcc); // (falling, goingDown.js sinks her by how far her lift is short of her weight) (the bags' buoyancy, the trim engine, the balance push, vyAcc: lift engines pointing up / dive engines down, forces.js; less the air's drag, over her weight)
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
      const home = ship.moorAlt != null ? ship.moorAlt : ((state.course && state.course.homeAlt) || 0); // (a second ship is moored where course.js place() put her, below or above the lead's mast height)
      ship.pose.y -= (home - state.ship.alt) * Math.min(1, dt * 0.4);
    }
    state.ship.shake = Math.max(0, state.ship.shake - dt);
    goingDown.update(dt); // the last stand: sinking, lift against weight, the leaks (goingDown.js)
    // Nose up while climbing, nose down while diving, a touch up when she speeds up and down when she brakes; the trim of an unbalanced ship (balance.js restPitch), the going-down tilt and what the forces
    // on her twist her by (forces.js theta) add (flight.js).
    flight.pitch(dt, goingDown.pitch());

    // Breaking apart: pieces fall, explosions go off, then the whole game starts over.
    if (state.ship.down > 0) {
      state.ship.down -= dt;
      state.wreck.t += dt;
      if ((!config.PVP.ENABLED || state.wreck.t < config.WRECK.TIME) && Math.random() < dt * 6) {
        const x = 100 + Math.random() * 1400;
        const y = 200 + Math.random() * 700;
        shipPuff(x, y + state.wreck.t * state.wreck.t * 60, Math.random() < 0.5 ? '#ff8c42' : '#555', 12);
      }
      if (state.ship.down <= 0) {
        if (config.PVP.ENABLED) state.ship.down = 1e-3; // (Versus: a wreck stays a wreck until the match builds the next round)
        else !ship.main ? respawn() : state.limp ? W.finishLimp() : W.restartGame();
      }
    }
  };

  // Moored at the home mast: no enemies, the boiler and gasbag are kept topped up.
  const moor = () => {
      state.ship.press = 65;
      state.ship.fuel = Math.max(state.ship.fuel, config.BOILER.START_FUEL);
      state.ship.gas = config.GAS.START;
  };

  // B1: the Deflector swats bats, rockets and falling bombs.
  const stepShield = (dt) => {
    if (state.shield.on) {
      for (const b of state.bats) if (b.delay <= 0 && !b.dead && !b.latched && shieldBlocks(b.x, b.y)) (b.dead = true), (state.kills += 1);
      for (const k of state.rockets || []) if (k.hp > 0 && shieldBlocks(k.x, k.y)) k.hp = 0;
      for (const b of state.enemyBombs) if (!b.dead && shieldBlocks(b.x, b.y)) b.dead = true;
    }
    state.shield.flash = Math.max(0, state.shield.flash - dt * 3);
  };

  // B2: holes, fires and bombs wear off when nobody works on them; fire spreads; the hull takes what burns and leaks; raiders.
  const stepUpkeep = (dt) => {
    // Progress drains only while nobody is working on it.
    for (const object of [...state.breaches, ...state.fires, ...state.bombs, ...state.gasHoles, ...state.icing, ...state.clogs, state.o2tank, ...hostileJobs, ...(state.loads || [])]) {
      if (!object.worked) object.prog = Math.max(0, (object.prog || 0) - dt * 0.4);
      object.worked = false;
    }
    fireSys.update(dt); // (fires spread towards what burns best, big ones smoke, an overheating boiler throws sparks: fire.js)
    if (!state.ship.down) hydrogen.update(dt); // (a fire under a hydrogen bag scorches it; alight, it burns and explodes: hydrogen.js)
    const bay = layout.bombBay;
    if (bay && BOC().ENABLED && BAY_D >= 0 && state.bombBay.bombs > 0 && !state.ship.down) { // fire in the bomb bay's compartment heats the bombs; long enough and they cook off (S.5i)
      const burning = state.fires.filter((f) => f.d === BAY_D && Math.abs(f.x - bay.x) < BOC().BAY.FIRE_RADIUS).length;
      bayHeat = burning ? bayHeat + dt * Math.min(2, 1 + 0.25 * (burning - 1)) : Math.max(0, bayHeat - dt * 0.5);
      if (bayHeat >= BOC().BAY.COOKOFF / (ship.ai || config.PVP.ENABLED ? 1 : BOC().DIFFICULTY[world.difficulty] ?? 1)) explodeBay('fire');
    } else bayHeat = 0;

    if (!state.ship.down && !goingDown.protect()) {
      state.ship.hull -= (state.breaches.length * 0.5 + fireSys.load() * 0.35) * (ship.ai ? ship.ai.drainMul() : damageMul(state)) * 2 * dt;
      if (state.ship.hull <= 0) wreck();
    }

    raiders.update(dt);
  };

  // The world's hijack exists now: the hookshot needs it (and the bots' stunts read the hook and the landing surfaces).
  const attach = ({ hijack: hj }) => {
    hookshot = createHookshot({ state, puff, phoneFx, air, hijack: hj });
    state.stunts = { cast: hookshot.cast, origin: hookshot.origin, surfaces: air.surfaces, bigFighter: hj.bigFighter }; // (read by the bots' daring stunts, bots.js)
  };

  // A ship that is not the main one gives out: she breaks apart (the first time in a mission GOING DOWN! instead) and is rebuilt after WRECK.TIME. The run, the
  // record and the limp rules belong to the main ship.
  function wreckAside() {
    if (state.ship.down) return;
    if (goingDown.active()) return;
    if (!ship.ai && goingDown.tryStart()) return; // (the enemy gunship has no last stand)
    state.ship.hull = 0;
    state.ship.down = config.WRECK.TIME;
    state.wreck = { t: 0, lap: state.course ? state.course.lap : 1, kills: state.kills };
    state.ship.shake = 1.5;
  }
  // ... and rebuilt: a fresh ship with her crew dropped back aboard from above, as restartGame does for the main one.
  function respawn({ crew = true } = {}) {
    if (!ship.main && ship.lost && ship.lost.length) { const first = ship.lost[0]; ship.lost.length = 0; fitBuild(first.before, { crew: false }); ship.buildId = first.buildId; } // (a ship that lost parts is rebuilt whole with the new game, S.5i)
    state.liftDeficit = 0; bayHeat = 0; bagTear = []; breakCd = 0;
    if (state.hotAir) state.hotAir.heat = 1; // (a new ship: the burner is lit and no hydrogen bag is scorched)
    for (const b of state.bags) { b.scorch = 0; b.burn = 0; b.cool = 0; }
    if (ship.ramHits) ship.ramHits = 0; // (the ram prow is mended: weaponsArt.js drawRam)
    Object.assign(state.ship, { alt: 0, speed: 0.3, order: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START, pitch: 0, vy: 0, trim: 0 });
    if (!ship.main) W.course.place(ship); // (back at her station in open air; her pose is her own)
    forces.reset();
    Object.assign(state.gasValve, { input: 0, auto: false });
    state.lastAlt = state.ship.alt;
    state.wreck = null;
    state.ventOpen.fill(false);
    state.gasValveOpen.fill(true);
    Object.assign(state.bombBay, { bombs: config.BOMBS.START, cd: 0, empty: 0, aim: null, open: 0 });
    state.helmHit = 0;
    Object.assign(state.shield, { ang: -Math.PI / 2, on: false, flash: 0 });
    for (const list of [state.gasHoles, state.breaches, state.fires, state.bombs]) list.length = 0;
    for (const [name, m] of Object.entries(layout.gunMounts)) Object.assign(state.GUNS[name], { aim: m.aim, cd: 0, ...gunStock(m), empty: 0, auto: 0, prime: 0, primed: false, flame: 0, heat: 0, overheat: false, flameHold: 0 });
    raiders.reset();
    escort.reset();
    coil.reset();
    searchlights.reset();
    modules.reset();
    goingDown.reset();
    comeAbout.reset();
    if (state.loads) state.loads.length = 0; // (B.6: a rebuilt ship carries no one else's loads, and her cannons and racks start fresh)
    if (state.cannons) state.cannons = {};
    if (state.rackStock) state.rackStock = {};
    for (const player of crew ? Object.values(state.players) : []) {
      const [e0, e1] = layout.boarderEntryPoints;
      Object.assign(player, { ko: 0, lock: null, carry: null, conn: null, climb: false, fall: true, y: -60, x: e0.x + Math.random() * (e1.x - e0.x) });
      player.uk = null;
    }
  }

  // A new build was applied to this ship's layout while she sat moored (Versus' shelf, pvp/match.js): what was made from the old layout is made again - her guns, her bomb bay, her
  // lamps, her coil and her patrol planes - and she starts over. (Everything that watches layout.version follows by itself: the bags, valves and vents (preStep), the engines,
  // sails, modules, nav, fire and the art.)
  function refit() {
    if (ship.lost) ship.lost.length = 0; // (a new build: nothing that broke off before is owed to anyone)
    if (ship.main && world.run && world.run.lost) world.run.lost.length = 0;
    for (const k of Object.keys(state.GUNS)) delete state.GUNS[k];
    Object.assign(state.GUNS, newGuns(layout));
    searchlights.refit();
    coil.refit();
    respawn({ crew: false });
  }

  // A build was fitted to this ship AT THE SKY-DOCK (the Shipwright's Yard, S.6, simulation.js fitShip): unlike refit() above (a whole new ship that starts over) she keeps what she is
  // carrying - hull, gas, coal, shells, bombs and the damage the crew has not mended - and everything made from the layout is made again: the guns (their shells and magazines kept
  // by name), the lamps, the coil, the patrol planes. Breaches, fires and holes keep their place on the deck or bag they were on; the crew are put back on their feet aboard her.
  // The modules, the bags, the vents and valves, the engines, the nav tables and the art follow layout.version by themselves. Returns what is new: { newBomb }.
  function fitBuild(parts, { crew = true } = {}) {
    const ids = layout.platforms.map((q) => q.id), bagX = layout.gasbags.map((b) => b.cx), hadBay = !!layout.bombBay;
    const kept = Object.fromEntries(Object.entries(state.GUNS).map(([k, g]) => [k, { ammo: g.ammo, max: g.max }]));
    layout.applyBuild(parts);
    const moved = (d) => (ids[d] != null ? layout.platforms.findIndex((q) => q.id === ids[d]) : -1);
    for (const list of [state.breaches, state.fires]) {
      for (let i = list.length - 1; i >= 0; i--) { const d = moved(list[i].d); if (d < 0) list.splice(i, 1); else list[i].d = d; }
    }
    const bags = layout.gasbags;
    for (const h of state.gasHoles) { // a hole stays in the bag it was in (by the bag's middle), wherever that bag is in the list now
      const at = bagX[h.bag | 0];
      let best = 0;
      bags.forEach((b, i) => { if (Math.abs(b.cx - at) < Math.abs(bags[best].cx - at)) best = i; });
      h.bag = best;
    }
    for (const k of Object.keys(state.GUNS)) delete state.GUNS[k];
    Object.assign(state.GUNS, newGuns(layout));
    for (const [k, g] of Object.entries(state.GUNS)) if (kept[k]) Object.assign(g, kept[k]);
    searchlights.refit();
    coil.refit();
    escort.reset();
    forces.reset();
    state.liftDeficit = 0; bayHeat = 0; bagTear = []; breakCd = 0; // (a build fitted at the dock starts clean: whatever had broken off is rebuilt or counted into it)
    const newBomb = !!layout.bombBay && !hadBay;
    if (newBomb) state.bombBay.bombs = Math.max(state.bombBay.bombs, config.BOMBS.START);
    if (crew) {
      for (const player of Object.values(state.players)) {
        if (shipOf(world, player) !== ship) continue; // (another ship's crew are not touched)
        const [e0, e1] = layout.boarderEntryPoints;
        Object.assign(player, { ko: 0, lock: null, carry: null, conn: null, climb: false, fall: true, y: -60, x: e0.x + Math.random() * (e1.x - e0.x) });
        player.uk = null; // (resend the phone's buttons: the stations have changed)
      }
    }
    return { newBomb };
  }

  return {
    ship, layout, walkers: { moveWalker, steerTo, fall, detach, platformBelow }, modules, jobFinder, prime, links, sails, engines, forces, balance, flight, fireSys, health, goingDown, raiders, escort, coil, searchlights, air, cannon, cargo,
    get hookshot() { return hookshot; },
    get env() { return ship.main ? W.env : ownEnv; }, // (the sky's hazards on her: ice, thermals, spores, oxygen, storm rods, the sea)
    hitsShip, onGasbag, gasHoleAt, roomPlatformAt, impact, damageHull, shieldBlocks, gnaw, shipPuff, shipPop, breakOff, explodeBay, explodeBag, hydrogen, crash, seedBreak: (n) => { breakRng = makeRng(n); }, // (the gate reseeds the break-off rolls)
    interaction, taken, holder, getHelm, worksKind, isHostile, homeOf, sendHome,
    preStep, trimOff, stepCrew, stepSystems, moor, stepShield, stepUpkeep, attach, respawn, refit, fitBuild, comeAbout,
  };
}