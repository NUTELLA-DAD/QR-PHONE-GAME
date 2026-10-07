// Linked stations: two crew at once matter more than two crew apart. Only ever bonuses: a lone crew member plays as before.
//  - GUN + LOADER (prime.js does the charging): loaderAction() offers "LOAD for <gunner>" to a second crew member beside a manned gun.
//  - HELM + LOOKOUT: while someone is in the crow's nest (Lookout / Nest Searchlight) the helm answers faster (state.links.helmMul),
//    more so when the nest has spotted something lately; the TV also shows gust warnings ahead of the ship (linkArt.js).
//  - BOILER SURGE: hold Action at the boiler (steam high) to push extra steam into the engines, or the Lightning Coil if it is
//    manned. Pressure climbs while you hold: let go in time or she blows (the existing blowout).
// Numbers live in config.LINKS. Also keeps state.linkStats (seconds of station time, paired and idle) for tools/botsim.mjs.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { bestTarget } from './aim.js';

const LK = config.LINKS;
const SG = LK.SURGE;
const NEST = ['Lookout', 'Nest Searchlight'];

const STATIONS = Object.fromEntries(SHIP_LAYOUT.stations.map((q) => [q.n, q]));
const BOILER = SHIP_LAYOUT.stations.find((q) => q.n === 'Boiler');
const BOILER_Y = SHIP_LAYOUT.platforms[BOILER.d].y;

export function createLinks({ state, modules, shipPuff }) {
  state.links = { helmMul: 1, nest: false, nestSpot: false, helmMan: false, loaders: [], surge: { level: 0, held: 0, to: 'engine', by: null } };
  state.surgeEngine = 0; // 0-1: how hard the engines are surging (read by course.js scrollSpeed and camera.js)
  state.surgeCoil = 0; // 0-1: how hard the coil is surging (read by coil.js)
  state.linkStats = { gunT: 0, gunPair: 0, gunIdle: 0, helmT: 0, helmPair: 0, nestT: 0, nestPair: 0, surgeT: 0 };

  const onStation = (n) => Object.values(state.players).find((q) => q.lock === n && !(q.ko > 0) && !q.fall && q.connected !== false) || null;

  // A second crew member beside a manned gun: hold Action to prime the shell for the gunner (prime.js assist).
  const loaderAction = (player, station) => {
    if (!LK.ENABLED) return null;
    const gun = state.GUNS[station.n];
    const gunner = gun && onStation(station.n);
    if (!gunner || gunner === player || (gunner.bot && !player.bot)) return null; // (humans can still bump a bot off its gun with a tap)
    if (gun.primed || gun.ammo <= 0 || !modules.works(state, station.n)) return null;
    return { type: 'prime', obj: gun, gunner, station, hold: true, time: 1, label: 'LOAD for ' + gunner.name };
  };

  // Which consumer a surge feeds: the Lightning Coil if someone is charging it, otherwise the engines.
  const surgeTarget = () => (onStation('Lightning Coil') && state.coil.cd <= 0 && modules.works(state, 'Lightning Coil') ? 'coil' : 'engine');

  // Standing at the boiler with steam up: hold Action to surge.
  const surgeAction = () => {
    if (!LK.ENABLED || state.phase !== 'flying' || state.ship.down || state.ship.press < SG.MIN_PRESS || !modules.works(state, 'Boiler')) return null;
    return { type: 'surge', hold: true, time: 1, label: 'SURGE ' + (surgeTarget() === 'coil' ? 'COIL' : 'ENGINES') };
  };

  // Called every frame the boiler hand holds the surge.
  const surgeHold = (player) => {
    const s = state.links.surge;
    s.held = 0.15;
    s.by = player.id;
    s.to = surgeTarget();
    if (!s.active) {
      s.active = true;
      state.sfxQ.push(['primed']);
    }
  };

  const update = (dt) => {
    const L = state.links;
    const S = state.linkStats;
    const flying = state.phase === 'flying' && !state.ship.down;
    const s = L.surge;
    if (!flying) {
      L.helmMul = 1;
      L.nest = L.nestSpot = L.helmMan = false;
      L.loaders.length = 0;
      s.level = s.held = 0;
      s.active = false;
      state.surgeEngine = state.surgeCoil = 0;
      return;
    }
    // ---- Helm + lookout ----
    const nestCrew = NEST.map(onStation).filter(Boolean);
    const helm = onStation('Helm');
    L.helmMan = !!helm && modules.works(state, 'Helm');
    L.nest = nestCrew.length > 0 && L.helmMan;
    L.nestSpot = L.nest && (nestCrew.some((q) => (q.spotRecent || 0) > 0) || (!!onStation('Nest Searchlight') && state.litTargets && state.litTargets.length > 0));
    L.helmMul = LK.ENABLED && L.nest ? 1 + (L.nestSpot ? LK.HELM_SPOT : LK.HELM_MAN) : 1;
    // ---- Gun + loader (who is loading which gun: read by linkArt.js) ----
    L.loaders.length = 0;
    for (const [name, gun] of Object.entries(state.GUNS)) {
      const gunner = onStation(name);
      if (!gunner) continue;
      S.gunT += dt;
      // (a loader is working when loadT is lit; one standing by with Action held counts as present too, e.g. waiting with the shell already primed)
      const st = STATIONS[name];
      const working = (gun.loadT || 0) > 0 && state.players[gun.loaderId];
      const waiting = st && Object.values(state.players).find((q) => q !== gunner && !q.lock && q.fire && !(q.ko > 0) && q.d === st.d && Math.abs(q.x - st.x) < config.TOOLS.STATION_REACH);
      const loader = working || waiting;
      if (loader) {
        S.gunPair += dt;
        if (working) L.loaders.push({ gunner, loader, gun });
      }
      if (!loader && !gunner.prime && !bestTarget(state, gun)) S.gunIdle += dt; // (nothing to shoot and not charging a shell)
    }
    if (L.helmMan) {
      S.helmT += dt;
      if (L.nest) S.helmPair += dt;
    }
    S.nestT += dt * nestCrew.length;
    if (L.helmMan) S.nestPair += dt * nestCrew.length;
    // ---- Boiler surge ----
    s.held = Math.max(0, s.held - dt);
    if (s.held > 0) {
      s.level = Math.min(1, s.level + dt / SG.RAMP);
      S.surgeT += dt;
      state.ship.press = Math.min(100, state.ship.press + SG.PRESS_RATE * s.level * dt); // (the pressure line in simulation.js does the blowout at 100)
      if (Math.random() < dt * 14) shipPuff(BOILER.x + (Math.random() - 0.5) * 70, BOILER_Y - 60, '#ffd23f', 2); // (gold sparks from the boiler)
    } else {
      s.level = Math.max(0, s.level - dt / SG.FALL);
      if (s.level <= 0) s.active = false;
    }
    state.surgeEngine = s.to === 'engine' ? s.level : 0;
    state.surgeCoil = s.to === 'coil' ? s.level : 0;
  };

  return { update, loaderAction, surgeAction, surgeHold };
}
