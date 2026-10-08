import { updateCrewScale, sparesFor, spawnPace, crewMul, crewHeads } from './crewscale.js';
import { updateMates } from './mates.js';
import { config } from '../../config.js';
import { createThreats } from './threats.js';
import { createCourse, inRock } from './course.js';
import { createSquadrons } from './squadrons.js';
import { createSpecials } from './specials.js';
import { createGunship } from './gunship.js';
import { createGunshipShip } from './gunshipShip.js';
import { createHijack } from './hijack.js';
import { pop, updatePopups } from './popups.js';
import { createWeather } from './weather.js';
import { createEnvironment, favour } from './environments.js';
import { createSpotter } from './spotter.js';
import { UPGRADES, UPGRADE_BLOCKS } from './upgrades.js';
import { refillBags } from './gasBags.js';
import { createMainShip, createShip, shipOf, eachShip, newGuns, transfer, areHostile } from './ships.js';
import { createMatch } from './pvp/match.js';
import { createShipCollide } from './shipCollide.js';
import { createTowing } from './towing.js';
import { stepThrown, cargoItem } from './cargo.js';
import { newBot } from './network.js';
import { BUILDS } from './shipBuild.js';
import { powerRatio } from './shipPower.js';
import { offerPart, partPrice, moduleNames, newModules, summaryOf, choiceScore } from './partsShop.js';
import { validate } from './buildCheck.js';
import { createShipSim, flushPresses } from './shipSim.js';
import { toWorld, toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { generateVoyage, stopById, stopName, stopNo, stopTotal, envInfo, modeInfo, dailyVoyage, dailyBest, recordDaily, loadModePrefs, saveModePrefs, loadVoyageSave, saveVoyageSave } from './voyage.js';

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
    ship: { alt: 0, speed: 0.3, order: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START },
    gasHoles: [],
    ventOpen: [], // which vent stacks are open (one flag per vent of the ship's layout, filled in below)
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
    vote: null, // a vote in progress: the sky-dock shop, where a bought part goes, or the route map
    startBuild: null, // the ship a new voyage starts with ('sparrow' | 'classic', setStartBuild; the browser host picks it from config.VOYAGE.START_BUILD); null = whatever ship 0 is (headless tools) and no PART cards in the shop
    yard: { built: null, newPart: null, hold: false, pull: 0 }, // the Shipwright's Yard (S.6b): the BUILT stamp, the "NEW: ..." call-out, the camera hold at the dock and the slow pull-back after cast off
    enemy: { x: -2000, y: 300, vx: 0, vy: 0, hp: 5, fire: 0, dead: 3, heading: null },
    shells: [],
    bullets: [],
    puffs: [],
    breaches: [],
    fires: [],
    boarders: [],
    ev: { t: 20, warn: 0 },
    kills: 0,
    thrown: [], // B.6: sandbags, crates and sacks of coal in the air (cargo.js; map coordinates like a shell)
    tows: [], // B.6: towlines made fast between two ships (towing.js)
    popups: [], // the words that pop up over a hit ("KABOOM"): made here so a ship's context never makes its own (popups.js)
    chutes: [], // parachutes drifting down from planes that were shot down (planes.js)
    scroll: 0,
    GUNS: {}, // (name -> { bx, by, aim, home, arc, cd, ammo ... }: one per gun mount of the ship's layout, filled in below)
  };
  state.ships = []; // (the ships in this sky, ships.js: ships[0] is the main ship and wraps state.ship, her layout and course.dist by reference; addShip below makes them)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // puff() is at a point in the WORLD (map coordinates; the sky is stored in the world since M.1). A ship's shipPuff() / shipPop() take a point in SHIP coordinates.
  const puff = (x, y, color, count = 6) => {
    for (let i = 0; i < count; i++) {
      state.puffs.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, life: 0.5, max: 0.5, c: color });
    }
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
  const emitPlayerUi = (playerId, ui) => {
    if (socket && !state.players[playerId]?.bot) socket.emit('host:ui', { id: playerId, ui });
  };
  // What a ship's systems may ask of the world: the helpers above, and (filled in as they are made) the world's systems and the run-level rules.
  const W = { puff, phoneFx, stat, credit, emitPlayerUi, wreck: (text) => wreck(text), finishLimp: () => finishLimp(), restartGame: () => restartGame() };
  W.towing = createTowing({ world: state, puff, phoneFx }); // (B.6: towlines between ships - every ship's ATTACK asks it)

  // Add a ship to this sky and give her her systems (shipSim.js). The first is the main ship: her body, layout and course position are the world state's own (parts = null).
  // Another ship (the dev flag ?ships=2, the --check-two-ships gate; PvP and the gunship come later) takes her build (a parts list; opts.layout = a ready Layout), her `id`
  // ('ship1' ...) and `formation` ({ dx, dalt }: how far along the sky she keeps station from ship 0, and the altitude she is held at relative to hers). Her crew are the
  // players with player.ship = her id (ships.js transfer()). She gets the same systems as ship 0 (the sky's hazards run for her too, B.3) except the gunship, which hunts ship 0 only. opts.team ('red' ...) and opts.name dress her for the TV.
  let hijack = null; // (made below, once the world's systems exist; every ship's hookshot needs it)
  const addShip = (parts, opts = {}) => {
    const sh = state.ships.length === 0 ? createMainShip(state) : createShip(state, { id: opts.id || 'ship' + state.ships.length, parts, layout: opts.layout, formation: opts.formation || { dx: -250, dalt: -1150 }, team: opts.team, name: opts.name, ai: opts.ai });
    state.ships.push(sh);
    if (sh.main) {
      state.ventOpen = sh.layout.vents.map(() => false);
      state.GUNS = newGuns(sh.layout);
    }
    sh.sim = createShipSim(state, sh, W);
    if (hijack) sh.sim.attach({ hijack });
    if (!sh.main && W.course && opts.place !== false) W.course.place(sh); // (M.2: another ship flies from her own pose; she starts at her station, in open air. The enemy gunship is put where she appears by her own code: opts.place false)
    for (const o of state.ships) if (o !== sh) { sh.sim.air.addProvider(rivalDecks(sh, o)); o.sim.air.addProvider(rivalDecks(o, sh)); sh.sim.air.addProvider(fleetDecks(sh, o)); o.sim.air.addProvider(fleetDecks(o, sh)); } // (Versus: each ship's crew can leap onto the other's decks; B.6: a crewman fired from a crew cannon lands on any ship's)
    return sh;
  };
  // Versus (B.4): the decks of a ship of ANOTHER team are landing places (and hook anchors) for a crewman of `me` in the air - a leap, a parachute or a swing across and he is aboard her
  // (shipOf / transfer: from then on he lives by HER rules as a boarder, shipSim.js isHostile). The surfaces are in `me`'s ship coordinates, like all of airborne.js's.
  const rivalDecks = (me, rv) => () => {
    if (!state.ships.includes(rv) || !areHostile(me, rv) || rv.state.down > 0) return []; // (Versus: the other team's ship; B.5: the enemy gunship, and she can board us the same way)
    return rv.layout.platforms.map((pl, d) => {
      const a = toShipX(me, toWorldX(rv, pl.x0)), b = toShipX(me, toWorldX(rv, pl.x1));
      return { id: 'rival:' + rv.id + ':' + d, y: toShipY(me, toWorldY(rv, pl.y)), x0: Math.min(a, b), x1: Math.max(a, b), onLand: (player) => boardShip(player, me, rv, d) };
    });
  };
  // B.6: a ship that is NOT an enemy of `me` (a Versus teammate, a co-op fleet ship): her decks catch only a crewman fired from a crew cannon (`only`), who walks off as her crew.
  const fleetDecks = (me, rv) => () => {
    if (!state.ships.includes(rv) || areHostile(me, rv) || rv.state.down > 0 || rv.ai) return [];
    return rv.layout.platforms.map((pl, d) => {
      const a = toShipX(me, toWorldX(rv, pl.x0)), b = toShipX(me, toWorldX(rv, pl.x1));
      return { id: 'fleet:' + rv.id + ':' + d, y: toShipY(me, toWorldY(rv, pl.y)), x0: Math.min(a, b), x1: Math.max(a, b), only: (p) => !!p.cannon, onLand: (player) => {
        const rx = toShipX(rv, toWorldX(me, player.x));
        transfer(state, player, rv, d, rx);
        player.chute = 0; player.chuteOpen = false; player.tumble = false;
        phoneFx(player, "You're aboard " + (rv.name || 'the other ship') + '!', [60, 40, 60]);
      } };
    });
  };
  const boardShip = (player, me, rv, d) => {
    transfer(state, player, rv, d, toShipX(rv, toWorldX(me, player.x)));
    player.hook = null;
    if (!cargoItem(player.carry)) player.carry = null; // (the hookshot stays on the ship he left: aboard her he fights with his hands; a sack of coal he lifted from her does not)
    player.chute = 0;
    player.chuteOpen = false;
    player.tumble = false;
    if (state.match && player.team) state.match.count(player.team, 'boardings');
    if (rv.ai) { // (B.5: our crew landing on the enemy gunship: she stomps, her own director tells the TV and the phone)
      rv.ai.onBoard(player);
      return;
    }
    state.ev.warn = 3.5;
    state.ev.warnText = 'BOARDERS ON THE ' + String(rv.layout.platforms[d].name || 'DECK').toUpperCase() + '!';
    state.sfxQ.push(['alarm']);
    phoneFx(player, "You're aboard the " + (rv.team ? rv.team.name + ' ' : '') + 'ship! Fight, sabotage the boiler or take the helm', [60, 40, 60]);
  };
  // Take a ship out of the sky (Versus: the lobby's second ship when the mode changes, and a team's ship when a new one is picked from the shelf). Her crew are handed to ship 0;
  // whoever asked drops them aboard where they belong.
  const removeShip = (sh) => {
    const i = state.ships.indexOf(sh);
    if (i <= 0) return;
    for (const player of Object.values(state.players)) if (shipOf(state, player) === sh) transfer(state, player, state.ships[0]);
    state.ships.splice(i, 1);
  };
  Object.defineProperty(state, 'rival', { get: () => (state.ships[0] && state.ships[0].rival) || null, enumerable: false, configurable: true }); // (Versus: ship 0's rival, ships.js; every ship's context answers its own)
  const main = addShip(null); // (B.2: this file is the WORLD. What belongs to one ship is shipSim.js; the voyage, the pacing director, the wreck and restart rules below work on the main ship, ships[0])
  const layout = main.layout;
  main.buildId = 'classic'; // (which build she wears: 'classic' | 'sparrow' | 'yard' = a start build that parts have been added to; Versus' shelf sets its own)
  // (the world's rules below that reach into the main ship: the wreck and restart, the supply balloon, the sky-dock shop, what the world's enemies shoot at)
  const { modules, engines, forces, raiders, escort, coil, searchlights, goingDown, fireSys, air, hitsShip, gasHoleAt, impact, damageHull, shieldBlocks, gnaw, interaction, taken, getHelm, prime } = main.sim;

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
    Object.assign(state.ship, { hull: config.LIMP.HULL, speed: 0.3, order: 0.3, shake: 0, press: 65, fuel: Math.max(state.ship.fuel, config.BOILER.START_FUEL), gas: config.GAS.START, pitch: 0, vy: 0, trim: 0 }); forces.reset();
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
      const [e0, e1] = shipOf(state, player).layout.boarderEntryPoints; // (back aboard their own ship)
      Object.assign(player, { ko: 0, lock: null, carry: null, conn: null, climb: false, fall: true, y: -60, x: e0.x + Math.random() * (e1.x - e0.x) });
      player.uk = null;
    }
    const loose = shakeLoose(run);
    state.ev.warn = 4;
    state.ev.warnText = 'PATCHED UP - ' + run.spares + ' SPARE GASBAG' + (run.spares === 1 ? '' : 'S') + ' LEFT' + (loose ? ' - THE NEW ' + loose.toUpperCase() + ' SHOOK LOOSE' : '');
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
    if (match.on) return match.toLobby(); // (Versus: the match starts over from its lobby; the voyage is not touched)
    restoreData(config, pristine);
    Object.assign(state.ship, { alt: 0, speed: 0.3, order: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START, pitch: 0, vy: 0, trim: 0 }); forces.reset();
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
    state.thrown.length = 0; state.tows.length = 0; // (B.6: loads in the air and towlines are gone with the voyage, and so are the ship's own loads, cannon records and rack stocks)
    if (state.loads) state.loads.length = 0;
    if (state.cannons) state.cannons = {};
    if (state.rackStock) state.rackStock = {};
    for (const list of [state.gasHoles, state.breaches, state.fires, state.shells, state.bullets, state.bombs || [], state.rockets || []]) list.length = 0;
    for (const [name, m] of Object.entries(layout.gunMounts)) Object.assign(state.GUNS[name], { aim: m.aim, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0, auto: 0, prime: 0, primed: false });
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
    eachShip(state, (sh) => { if (!sh.main) sh.sim.respawn({ crew: false }); }); // (another ship is rebuilt with the new game)
    if (state.weather) Object.assign(state.weather, { storm: 0, gust: 0, flash: 0, bolt: null });
    for (const player of Object.values(state.players)) {
      // Drop everyone back aboard from above, as when joining.
      const [e0, e1] = shipOf(state, player).layout.boarderEntryPoints;
      Object.assign(player, { ko: 0, lock: null, carry: null, conn: null, climb: false, fall: true, y: -60, x: e0.x + Math.random() * (e1.x - e0.x), stats: {} });
      player.uk = null; // resend the phone's buttons
    }
    state.ev.warn = 5;
    state.ev.warnText = 'A NEW SHIP IS READY!';
  }

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
      const wx = sp.mx; // (the balloon hangs in the world)
      const wy = sp.my + Math.sin(sp.bob * 1.3) * 30;
      if (Math.hypot(wx - toWorldX(main, layout.midPoint.x), wy - toWorldY(main, layout.midPoint.y)) < PC.SUPPLY_REACH) {
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
      const wx = toWorldX(main, layout.midPoint.x + dx);
      const wy = toWorldY(main, layout.midPoint.y) + dy;
      let clear = true;
      for (const [ox, oy] of [[0, 0], [150, 0], [-150, 0], [0, 150], [0, -150]]) if (inRock(state, wx + ox, wy + oy)) clear = false;
      if (clear) {
        state.supply = { mx: wx, my: wy, t: config.PACING.CALM + 12 };
        return;
      }
    }
  };

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
    const voyage = generateVoyage(daily ? daily.seed : (Math.random() * 2 ** 31) | 0, { mode: state.mode, gentle: !!state.startBuild && state.startBuild !== 'classic' });
    const first = voyage.columns[0][0];
    const M = modeInfo(state.mode);
    state.run = { voyage, stopId: first.id, visited: [first.id], salvage: 0, earned: 0, gain: {}, gunships: 0, kills: 0, crew: {}, bought: [], spares: sparesFor(state), sparesMax: sparesFor(state), limps: 0,
      mode: state.mode, key: sessionKey(), daily: daily && { key: daily.key, name: daily.name }, voyageNo: 1, voyages: M.voyages, base: 0, rival: M.rival,
      build: null, parts: [], lastPart: null }; // (build: this voyage's ship as a parts list; parts: what the crew has bought, newest last: { id, name, names, bag }; lastPart: the card of the last dock)
    const start = state.startBuild && BUILDS[state.startBuild];
    state.run.build = copyData(start || layout.parts || BUILDS.classic);
    if (start && main.buildId !== state.startBuild) fitShip(state.run.build, state.startBuild); // (a new voyage starts with the start build, whatever the last one grew into)
    refreshPower();
    Object.assign(state.yard, { built: null, newPart: null, hold: false, pull: 0 });
    state.runEnd = null;
    state.salvagePop = null;
  };
  const curStop = () => stopById(state.run.voyage, state.run.stopId);
  // Fit a parts list to ship 0 AT THE DOCK (or in the lobby): her layout is replaced in place, what is made from it is made again (shipSim.js fitBuild). id = which build she wears.
  function fitShip(parts, id) {
    main.sim.fitBuild(parts);
    main.buildId = id;
    refreshPower();
  }
  // The ship's fighting strength as a share of the classic ship's (shipPower.js), worked out once per build: crewscale.js makes the voyage's danger follow it (YARD.POWER_SCALE).
  // Only a voyage that started with a build has one; the headless tools without a start build keep the old numbers.
  function refreshPower() {
    if (state.run) state.run.power = state.startBuild ? powerRatio(layout) : null;
  }
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
    if (main.buildId === 'yard' && layout.parts !== run.build) fitShip(run.build, 'yard'); // (the second voyage flies the ship the first one built)
    persistBuild();
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
      if (g.charge || g.captured) addSalvage(SV.GUNSHIP_BOARDED, 'gunships', g.captured ? 'Gunship captured by boarders!' : 'Gunship blown up by boarders!');
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
  // ---- The Shipwright's Yard (S.6): ship PARTS in the shop (partsShop.js) ----
  const YD = config.YARD;
  const PS = config.PARTS_SHOP;
  const ownedParts = () => { const o = {}; for (const p of state.run.parts) o[p.id] = (o[p.id] || 0) + 1; return o; };
  // The leg of the voyage a stop is (the first stop flown is leg 1, in the second voyage of a campaign too): after the legs in PARTS_SHOP.DERELICT_STOPS a derelict is found and its part is free.
  const legNo = (stop) => stop.col + (state.run.voyageNo > 1 ? 0 : 1);
  // At most ONE part card per dock: a part this build can take, with up to YARD.SLOT_MAX places it can go (each already checked: never a FAIL).
  const partCard = () => {
    if (!state.startBuild) return null; // (headless tools without a start build keep the old shop)
    const run = state.run, found = PS.DERELICT_STOPS.includes(legNo(curStop()));
    if (!found && !state.yardOnly && Math.random() >= PS.CARD_CHANCE) return null; // (not every dock has a part for sale)
    const ahead = run.voyage.columns.slice(curStop().col + 1).flat(); // (what is still on the route: raids need a bomb bay, the Aether is the Flagship's sky)
    const offer = offerPart(run.build, { owned: ownedParts(), crew: crewHeads(state), avoid: run.lastPart, only: state.yardOnly || null, route: { raids: ahead.filter((x) => x.kind === 'open').length, aether: ahead.some((x) => x.env === 'aether') } });
    if (!offer) return null;
    const e = offer.entry;
    run.lastPart = e.id;
    state.yard.sum = offer.base.sum; // (the TV's gauges: the ship as she is)
    return { id: 'part-' + e.id, kind: 'part', entry: e.id, baseName: e.name, name: e.name, icon: e.icon, pic: e.pic, picDir: e.picDir, desc: e.blurb, cost: found ? 0 : partPrice(e, run.parts.length, crewHeads(state)),
      derelict: found, badge: found ? 'FREE: found in a wreck' : 'NEW PART' + (offer.fit.hint ? ': ' + offer.fit.hint : ''), rec: offer.fit.score >= YD.REC.MIN, choices: offer.choices, now: offer.base.sum, baseWarns: offer.base.res.warns, spots: offer.choices.length }; // (rec: it answers what she lacks, partsShop.js fitOf: the tag says what, the bots vote for it more often)
  };
  const persistBuild = () => { // the run's ship, kept in the voyage save (versioned, tolerant: voyage.js)
    const run = state.run;
    if (!run || !state.startBuild) return;
    state.save.build = { v: 1, parts: run.build, log: run.parts.map((p) => ({ id: p.id, name: p.name })), voyageNo: run.voyageNo };
    saveVoyageSave(state.save);
  };
  // Put a chosen place of a part on the ship: the build is the choice's parts list (already validated), fitted to ship 0 at the dock.
  const buildPart = (o, index) => {
    const run = state.run, c = o.choices[index];
    const before = moduleNames(layout);
    run.build = c.parts;
    fitShip(run.build, 'yard');
    run.parts.push({ id: o.entry, name: o.baseName, names: newModules(before, moduleNames(layout)), bag: o.entry === 'gasbag' });
    Object.assign(state.yard, { built: { t: YD.BUILT_STAMP, name: o.baseName, letter: c.letter, where: c.where }, newPart: { name: o.baseName.toUpperCase(), x: c.x, y: c.y, t: 0 }, hold: true });
    state.yard.sum = summaryOf(validate(run.build));
    persistBuild();
    state.ev.warn = 3;
    state.ev.warnText = `BUILT: ${o.baseName.toUpperCase()}!`;
  };
  // A limp home shakes the newest part loose: its modules start broken (a hammer mends them), a new gasbag starts with a hole. No part is ever lost. Returns its name.
  const shakeLoose = (run) => {
    const last = run.parts[run.parts.length - 1];
    if (!last) return null;
    for (const name of last.names) {
      const m = modules.list.find((q) => q.name === name);
      if (!m) continue;
      m.hp = m.max * YD.SHAKEN_HP;
      m.broken = YD.SHAKEN_HP <= 0;
    }
    if (last.bag) for (let i = 0; i < YD.SHAKEN_HOLES; i++) state.gasHoles.push(gasHoleAt(layout.gasbags[layout.gasbags.length - 1].cx, layout.gasbags[layout.gasbags.length - 1].cy, layout.gasbags.length - 1));
    return last.name.toLowerCase();
  };

  const buildOffers = () => {
    const offers = [];
    if (needsHull()) offers.push({ id: 'repair-hull', kind: 'repair', name: 'Full Repair', icon: '🔧', desc: 'Hull, holes, fires and every broken part, as good as new.', cost: SH.REPAIR_HULL });
    if (needsGas()) offers.push({ id: 'repair-gas', kind: 'repair', name: 'New Gas', icon: '🎈', desc: 'Patch the gasbag and fill it up.', cost: SH.REPAIR_GAS });
    if (needsCoal()) offers.push({ id: 'repair-coal', kind: 'repair', name: 'Coal and Shells', icon: '⛏️', desc: 'Stoke the boiler, fill every gun and the bomb bay.', cost: SH.REPAIR_COAL });
    const part = partCard();
    if (part) offers.push(part);
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
    const prize = state.gunship && state.gunship.prize && state.tows.find((t) => t.b === state.gunship.ship); // (B.6: a captured gunship still in tow when we reach the dock: a salvage bonus, and she is released and goes down)
    if (prize) { addSalvage(config.CROSS.TOW.PRIZE, 'gunships', 'PRIZE IN TOW!'); W.towing.cut(prize, ''); state.gunship.prize = false; }
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
    state.yard.hold = false; // (the camera lets go: if the ship grew, the pull-back starts now, and the new part gets its call-out)
    if (state.yard.newPart) { state.yard.newPart.t = YD.NEW_CALLOUT; state.yard.pull = YD.PULL_TIME; }
    course.startMission(missionNo(curStop()), missionOpts(curStop()));
  };

  // Bots vote sensibly: the dock - repair what's broken, else something they can afford, sometimes cast off.
  const botChoice = (v, p) => {
    const ok = v.options.map((o, i) => i).filter((i) => !cardOff(v.options[i]) && v.options[i].kind !== 'cast');
    const cast = v.options.findIndex((o) => o.kind === 'cast');
    if (v.kind === 'route' && state.startBuild) { // (the Yard's crews read the route map: an outpost raid is bombs-or-nothing, so a ship without a bomb bay goes round it; fewer skulls first)
      const score = (o) => o.danger + (o.kindName === VY.KIND_NAMES.open && !layout.bombBay ? 3 : 0) + Math.random() * 0.9;
      return v.options.reduce((best, o, i) => (score(o) < score(v.options[best]) ? i : best), 0);
    }
    if (v.kind === 'slot' && v.part && v.part.choices && Math.random() < YD.BOT_SLOT_PICK) { // (the best place by the validator's numbers: no new warnings, hover and trim towards the middle; the rest is chance)
      const sc = v.part.choices.map((c) => choiceScore(c, v.part.now, v.part.baseWarns));
      return sc.indexOf(Math.max(...sc));
    }
    if (v.kind === 'route' || v.kind === 'shelf' || v.kind === 'slot') return (Math.random() * v.options.length) | 0;
    if (v.kind === 'rematch') return 0;
    if (!ok.length) return cast;
    // A sensible crew fixes what is badly hurt first: the hull, then the gasbag, then coal and shells.
    const want = (id) => ok.find((i) => v.options[i].id === id);
    if (state.ship.hull < SH.BOT_REPAIR_HULL && want('repair-hull') != null) return want('repair-hull');
    if ((state.gasHoles.length >= 2 || state.ship.gas < 30) && want('repair-gas') != null) return want('repair-gas');
    const part = ok.find((i) => v.options[i].kind === 'part');
    if (part != null && Math.random() < (v.options[part].rec ? YD.BOT_REC_CHANCE : YD.BOT_PART_CHANCE)) return part; // (a crew that can afford a part card likes to build)
    if (Math.random() < SH.BOT_CAST_CHANCE) return cast;
    const rep = ok.filter((i) => v.options[i].kind === 'repair');
    if (rep.length && Math.random() < 0.7) return rep[(Math.random() * rep.length) | 0];
    return ok[(Math.random() * ok.length) | 0];
  };

  // A part with several places: a short second vote picks the spot (A / B / C). The dock vote waits (v.back) and comes back when the part is placed.
  const startSlotVote = (back, o) => {
    closeVote();
    const mark = o.dealt ? ' (CREW DEAL: 25% off)' : '';
    state.ev.warn = 3;
    state.ev.warnText = `BOUGHT: ${o.name.toUpperCase()}!${mark}`;
    openVote({ kind: 'slot', title: `WHERE DOES THE ${o.baseName.toUpperCase()} GO?`, t: YD.SLOT_TIME, part: o, back,
      options: o.choices.map((c) => ({ kind: 'slot', name: c.where, icon: c.letter, desc: c.note, letter: c.letter })) });
  };
  const resumeDock = (back) => {
    const left = !back.options.every((x) => x.kind === 'cast' || cardOff(x));
    openVote({ ...back, t: left ? SH.TIME : YD.BUILT_STAMP });
    state.vote.total = Math.min(back.total, SH.MAX_TIME - YD.BUILT_STAMP);
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
          title: v.kind === 'dock' ? `SKY-DOCK - ${state.run.salvage} salvage` : v.kind === 'shelf' && p.team ? `${v.title} - ${p.team.toUpperCase()}` : v.title,
          t: Math.max(0, Math.ceil(v.t)),
          mine: valid(p.vote) ? p.vote : null,
          options: v.options.map((o) => ({ name: o.name, icon: o.icon, desc: o.desc, cost: o.kind === 'cast' || o.kind === 'stop' || v.kind === 'slot' ? null : o.cost, off: v.kind === 'dock' && cardOff(o), sold: !!o.sold, badge: o.kind === 'part' ? o.badge + (o.spots > 1 ? ` - ${o.spots} places` : '') : null })),
        },
      };
      const key = 'vote|' + ui.vote.title + '|' + ui.vote.t + '|' + ui.vote.mine + '|' + ui.vote.options.map((o) => o.name + o.off + o.sold + o.desc + o.cost).join();
      if (key !== p.uk) {
        p.uk = key;
        emitPlayerUi(p.id, ui);
      }
    }
    const wait = v.kind === 'dock' ? SH.ALL_VOTED_WAIT : VY.ROUTE_ALL_VOTED_WAIT;
    if (voters.length && voters.every((p) => p.vote != null)) v.t = Math.min(v.t, wait);
    if (v.kind === 'dock' && v.total > SH.MAX_TIME) v.t = Math.min(v.t, 0);
    if (v.t > 0) return;
    if (v.onDone) { // (Versus: the shelf is tallied a team at a time, the rematch all together; the match decides what follows)
      const tally = (list, none) => {
        const c = v.options.map((_, i) => list.filter((q) => q.vote === i && valid(i)).length);
        const top = Math.max(...c);
        const tied = c.map((_, i) => i).filter((i) => c[i] === top);
        return top === 0 ? none : tied[(Math.random() * tied.length) | 0];
      };
      const result = v.kind === 'shelf' ? { red: tally(voters.filter((q) => q.team === 'red'), 0), blue: tally(voters.filter((q) => q.team === 'blue'), 0) } : { all: tally(voters, 2) };
      closeVote();
      return v.onDone(result);
    }
    // Count the votes; ties are settled at random. Nobody voting: the dock closes, the route picks at random.
    const counts = v.options.map((_, i) => voters.filter((p) => p.vote === i && valid(i)).length);
    const best = Math.max(...counts);
    const idx = v.options.map((_, i) => i);
    let pick;
    if (best === 0) pick = v.kind === 'dock' ? v.options.findIndex((o) => o.kind === 'cast') : v.kind === 'slot' ? 0 : (Math.random() * v.options.length) | 0;
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
    if (v.kind === 'slot') { // where the part goes: the place with the most votes (nobody voting: A), then back to the dock
      closeVote();
      buildPart(v.part, pick);
      return resumeDock(v.back);
    }
    if (o.kind === 'cast') {
      closeVote();
      return startRoute();
    }
    // Buy it, then keep shopping while there is anything left to afford.
    let price = o.cost;
    if (o.kind === 'part') { // crew deal: everybody voted for the part (two or more of them): a quarter off
      const deal = price > 0 && voters.length >= YD.DEAL_VOTERS && voters.every((q) => q.vote === pick);
      if (deal) price = Math.round((price * (1 - YD.DEAL)) / 5) * 5;
      o.dealt = deal;
    }
    state.run.salvage -= price;
    if (o.kind === 'part') {
      o.sold = true;
      state.run.bought.push(o.id);
      if (o.choices.length > 1) return startSlotVote(v, o); // (several places: the crew picks A / B / C)
      buildPart(o, 0);
      if (o.dealt) state.ev.warnText += ' CREW DEAL: ALL AGREED, 25% OFF';
    } else applyOffer(o);
    o.sold = true;
    if (o.kind !== 'part') {
      state.ev.warn = 3;
      state.ev.warnText = `BOUGHT: ${o.name.toUpperCase()}!`;
    }
    if (v.options.every((x) => x.kind === 'cast' || cardOff(x))) {
      if (o.kind !== 'part') {
        closeVote();
        return startRoute();
      }
      v.t = YD.BUILT_STAMP; // (a part was just built: the dock stays open while the BUILT stamp shows, then she casts off)
      v.total = Math.min(v.total, SH.MAX_TIME - YD.BUILT_STAMP);
    } else v.t = SH.TIME;
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
  const squadrons = createSquadrons({ state, puff, impact, hitsShip, dropSquad: raiders.dropSquad, credit, gnaw, damageHull });
  const specials = createSpecials({ state, puff, impact, hitsShip, credit, shieldBlocks });
  const gunshipDeps = { state, puff, impact, credit, dropOne: raiders.dropOne, pickType: raiders.pickType, spawnBats: (from, n) => squadrons.spawnBats(from, n) };
  const gunship = config.GUNSHIP.AS_SHIP ? createGunshipShip({ ...gunshipDeps, addShip: (...a) => addShip(...a), removeShip: (...a) => removeShip(...a), W }) : createGunship(gunshipDeps); // (B.5: the gunship as a Ship, gunshipShip.js, when the flag is on; else the old offset-from-our-ship one)
  const weather = createWeather({ state, impact, puff });
  const env = createEnvironment({ state, puff, phoneFx, impact, damageHull, ignite: fireSys.ignite }); // ice, thermals, blizzards (rules in environments.js)
  const airFor = { startFlight: (player, ...a) => shipOf(state, player).sim.air.startFlight(player, ...a) }; // (a stolen plane's rider bails out of it from the ship they belong to)
  hijack = createHijack({ state, puff, phoneFx, air: airFor }); // stolen dogfighters
  Object.assign(W, { course, env, gunship, hijack });
  main.sim.attach({ hijack }); // (the personal grappling hook needs the hijack: shipSim.js)
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

  const spotter = createSpotter({ state, emit: emitPlayerUi, phoneFx }); // phone radar, spotting and HELP! (spotter.js)

  const setSocket = (nextSocket) => {
    socket = nextSocket;
  };

  const flushAll = () => { for (const p of Object.values(state.players)) flushPresses(p); };

  // One step of the whole sky. The world's systems run once; each ship's stages (shipSim.js) run for every ship, in the places the single-ship order had them:
  // with ONE ship this is the old order exactly. (A1 crew, popups + spotter, A2 modules / steam / flight, then the world's enemies, hits, then B upkeep.)
  const stepWorld = (dt) => {
    eachShip(state, (sh) => sh.sim.preStep());
    updateMates(state, dt); // (ship's mates come aboard or go home before the crew count is read)
    eachShip(state, (sh) => updateCrewScale(sh.ctx, dt)); // (each ship counts HER crew: her scale is her own; ship 0's is the world's, the enemies' numbers follow it)
    eachShip(state, (sh) => sh.sim.trimOff());
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
    { const Y = state.yard; if (Y.built && (Y.built.t -= dt) <= 0) Y.built = null; if (Y.newPart && Y.newPart.t > 0) Y.newPart.t -= dt; if (Y.pull > 0) Y.pull -= dt; }
    // While the crew votes on an upgrade, the action is paused.
    if (state.vote) {
      flushAll();
      updateVote(dt);
      return;
    }
    if (state.phase !== 'lobby') course.advance(dt); // (she moves first: see course.js advance)
    eachShip(state, (sh) => sh.sim.stepCrew(dt));

    updatePopups(state, dt);
    spotter.update(dt);
    eachShip(state, (sh) => sh.sim.stepSystems(dt));

    if (state.phase === 'lobby') {
      eachShip(state, (sh) => sh.sim.moor());
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
        eachShip(state, (sh) => sh.sim.goingDown.newMission()); // (the last stand is back for the new mission)
      }
      if (config.PVP.ENABLED) state.tempo.rate = 0; // (Versus: no pacing director and no AI enemies, only the other ship)
      else updateTempo(dt);
      if (goingDown.active()) state.tempo.rate = Math.min(state.tempo.rate, config.GOING_DOWN.ENEMY_RATE); // (few new enemies while she falls)
      if (!config.PVP.ENABLED) squadrons.update(dt);
      eachShip(state, (sh) => sh.sim.escort.update(dt));
      hijack.update(dt);
      if (!config.PVP.ENABLED) specials.update(dt);
      if (!config.PVP.ENABLED) gunship.update(dt);
      course.update(dt);
      weather.update(dt);
      env.update(dt);
      eachShip(state, (sh, i) => { if (i > 0 && !sh.ai) sh.sim.env.update(dt); }); // (every other ship has the sky's hazards of her own: ice, thermals, spores, oxygen, storm rods, the sea; the enemy gunship flies in none of them)
      gunship.settle(dt);
      salvageWatch();
    }

    shipCollide.step(dt); // (every ship has moved: two hulls that overlap are pushed apart, bounce and hurt - shipCollide.js)
    if (state.tows.length) W.towing.step(dt); // (B.6: a towline pulls both ships and twists them)
    if (state.thrown.length) stepThrown(state, dt, puff); // (B.6: thrown sandbags, crates and sacks land on the first deck they cross)

    // Enemy fire against every ship: rock gives cover, a Deflector stops it, a hit on the hull is that ship's impact.
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
      for (const sh of state.ships) {
        if (sh.ai) continue; // (the enemy gunship is on the enemies' side: their fire passes through her)
        if (sh.sim.shieldBlocks(bullet.x, bullet.y)) {
          bullet.life = 0;
          break;
        }
        const sx = toShipX(sh, bullet.x); // (hitsShip and impact work in ship coordinates)
        const sy = toShipY(sh, bullet.y);
        if (!bullet.miss && sh.sim.hitsShip(sx, sy)) {
          bullet.life = 0;
          puff(bullet.x, bullet.y, '#ff7b00', 8);
          sh.sim.impact(sx, sy, bullet.dmg || 1);
          break;
        }
      }
    }

    if (match.on) match.crossFire(); // (Versus: every shell and bomb against every other ship)

    eachShip(state, (sh) => sh.sim.stepShield(dt));

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

    eachShip(state, (sh) => sh.sim.stepUpkeep(dt));
  };
  // One step. (Since M.4 pose.vx is the ship's integrated velocity, flight.js: nothing is measured here any more.)
  const update = (dt) => {
    if (match.on) match.pre(dt); // (Versus: each ship's view of her rival)
    stepWorld(dt);
    if (match.on) match.post(dt); // (...and the rules of the round, a vote open or not)
  };

  // CAST OFF without the voyage's rules (the voyage starts a map when the lobby changed the session: Versus has its own sky): the crew factors settle, the ships fly.
  const launch = () => {
    eachShip(state, (sh) => updateCrewScale(sh.ctx, 0)); // (settle the spare gasbags and crew factors for the chosen difficulty)
    state.phase = 'flying';
    state.ev.warn = 4;
    state.ev.warnText = 'CAST OFF!';
  };
  const shipCollide = createShipCollide({ world: state, puff });
  const match = createMatch({ world: state, addShip: (...a) => addShip(...a), removeShip: (...a) => removeShip(...a), course: () => course, launch, restart: () => restartGame(), openVote, newBot, puff, phoneFx, emitUi: emitPlayerUi });

  return {
    state,
    update,
    clamp,
    taken,
    getHelm,
    impact, // (a hit on the ship at ship coordinates; the gasbag gate in tools/buildsim.mjs shoots her with it)
    fire: fireSys, // (fire.js: ignite() / update(); the --check-fire gate lights fires with it)
    gasHoleAt,
    engines, // (pointed engines, swivel turning: engines.js)
    ships: state.ships,
    addShip,
    removeShip,
    shipCollide, // (ship-ship collision, shipCollide.js: stats = { contacts, hits } for the gates)
    towing: W.towing, // (B.6: towlines, towing.js)
    match, // (Versus, pvp/match.js: the lobby's two teams, the shelf, the rounds; match.on while Versus is selected)
    forces, // (forces at places: forces.js)
    interaction,
    modules,
    startDock,
    startRoute,
    castOff: () => {
      if (state.phase !== 'lobby') return;
      if (match.on) { match.begin(); return; } // (Versus: CAST OFF starts the match - the shelf, then the rounds)
      if (state.run.key !== sessionKey()) { // (the lobby changed the mode or the daily voyage after the route was made)
        newRun();
        course.startMission(1, firstMission());
      }
      launch();
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
      if (mode === 'versus') { // (the lobby's Mode button: VERSUS is the last of the session lengths; only from the lobby, and not in the middle of a match)
        if (state.phase !== 'lobby' || state.mode === 'versus') return;
        state.mode = 'versus';
        if (main.buildId !== 'classic') fitShip(BUILDS.classic, 'classic'); // (Versus' own ships: the classic one, then the shelf)
        match.enter();
      } else if (mode && config.VOYAGE.MODES[mode]) {
        if (state.mode === 'versus') {
          if (match.phase !== 'lobby') return;
          state.mode = mode;
          match.leave();
        } else state.mode = mode;
      }
      if (daily != null) state.daily = !!daily;
      saveModePrefs(state);
    },
    // The ship a new voyage starts with: 'sparrow', 'classic' or null (= whatever ship 0 is; no parts in the shop). In the lobby the new voyage is made now (with that ship, with the first
    // mission's map made for her); mid-voyage it is the next voyage's.
    setStartBuild: (id) => {
      if (id != null && !BUILDS[id]) return;
      state.startBuild = id || null;
      if (state.phase === 'lobby' && !match.on) {
        newRun();
        course.startMission(1, firstMission());
      }
    },
    fitShip,
    dailyInfo: () => {
      const d = dailyVoyage();
      return { ...d, best: dailyBest(state.save, d.key, state.mode) };
    },
    puff,
    setSocket,
    countPlayers: () => Object.keys(state.players).length,
  };
}
