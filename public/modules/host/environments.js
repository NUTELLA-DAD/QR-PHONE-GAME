// Environments: Sky Isles (the original), Frost Peaks (ice builds up on the ship) and Ember Forge
// (lava thermals, scorching, smoke). state.course.environment holds the id for the current mission
// (set by course.startMission); config.ENVIRONMENTS holds each one's numbers and palette.
// This file is the RULES side (host simulation); envArt.js draws the look.
//
// What the simulation reads each frame (all on state.env, zero in Sky Isles):
//   sink  - gas points the ship needs MORE to hover (ice weight)      -> simulation.js lift
//   lift  - extra upward push (px/s^2) from lava thermals              -> simulation.js lift
//   wind  - sideways shove (px/s) during a blizzard gust               -> applied here to course.dist
//   heat/burn/blizzard/smoke - 0..1 amounts for the art and the TV
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { floorBelow } from './maps.js';
import { createStormSea } from './envStormSea.js'; // Storm Front + Sunken Sea rules

const P = SHIP_LAYOUT.platforms;
const IDX = (id) => P.findIndex((p) => p.id === id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export const envIdOf = (state) => {
  const id = state && state.course && state.course.environment;
  return id && config.ENVIRONMENTS[id] ? id : config.ENVIRONMENTS.DEFAULT;
};
export const envOf = (state) => config.ENVIRONMENTS[envIdOf(state)];
export const ENV_IDS = Object.keys(config.ENVIRONMENTS).filter((k) => config.ENVIRONMENTS[k] && config.ENVIRONMENTS[k].name);

// The y (map pixels) of the lava surface on a map: deep enough that about OPEN_SHARE of the columns
// have open air below it. Cached on the map.
export function lavaLevel(map, L = config.ENVIRONMENTS.ember.LAVA) {
  if (!map) return null;
  if (map.lavaY != null) return map.lavaY;
  let open = 0;
  let rows = L.ROWS_MAX;
  for (let k = 1; k <= L.ROWS_MAX; k++) {
    const j = map.H - k;
    for (let i = 0; i < map.W; i++) if (!map.solid[j * map.W + i]) open++;
    if (open >= map.W * L.OPEN_SHARE) {
      rows = k;
      break;
    }
  }
  rows = clamp(rows, L.ROWS_MIN, L.ROWS_MAX);
  map.lavaY = (map.H - rows) * map.CELL;
  return map.lavaY;
}

// Which environment a mission uses: an explicit one, the forced one (tests), or the default.
export function pickEnvironment(requested) {
  const E = config.ENVIRONMENTS;
  const id = E.FORCE || requested || E.DEFAULT; // (FORCE - e.g. botsim --env - wins over the voyage's choice)
  return E[id] && E[id].name ? id : E.DEFAULT;
}

// Weight of an enemy set piece in this environment (1 = unchanged).
export const favour = (state, kind) => {
  const f = envOf(state).favour;
  return f && f[kind] != null ? f[kind] : 1;
};

export function createEnvironment({ state, puff, impact, damageHull }) {
  state.icing = []; // ice crusts: { area: 'gasbag'|'topdeck'|'gun', gun?, x, d, lvl, prog }
  state.ice = { gasbag: 0, topdeck: 0, guns: 0 }; // how iced each area is (0-1)
  state.env = { id: 'skyisles', sink: 0, lift: 0, wind: 0, blizzard: 0, smoke: 0, heat: 0, burn: 0, lavaY: null, thermalAt: 0, drag: 0, gale: 0 };
  const ss = createStormSea({ state, puff, impact, damageHull }); // storm + sea rules (envStormSea.js)
  const CAT = IDX('catwalk');
  const LOWER = IDX('lower');
  const GUN_SPOTS = ['Tail Gun', 'Nose Gun', 'Dorsal Gun', 'Aft Dorsal Gun'].map((n) => {
    const s = SHIP_LAYOUT.stations.find((q) => q.n === n);
    return { gun: n, d: s.d, x: s.x };
  });
  let seenMap = null;
  let blizzT = 0;
  let blizzLeft = 0;
  let smokeT = 0;
  let smokeLeft = 0;
  let iceT = 0;
  let burnT = 0;
  let warned = { blizzard: false, thermal: false, burn: false };

  const clear = () => {
    state.icing.length = 0;
    Object.assign(state.ice, { gasbag: 0, topdeck: 0, guns: 0 });
    Object.assign(state.env, { sink: 0, lift: 0, wind: 0, blizzard: 0, smoke: 0, heat: 0, burn: 0, lavaY: null, drag: 0, gale: 0 });
    ss.clear();
    blizzLeft = smokeLeft = burnT = 0;
    warned = { blizzard: false, thermal: false, burn: false };
  };

  const spawnCrust = (F) => {
    const I = F.ICE;
    if (state.icing.length >= I.MAX_CRUSTS) return;
    const r = Math.random();
    const A = I.AREAS;
    const area = r < A.gasbag ? 'gasbag' : r < A.gasbag + A.topdeck ? 'topdeck' : 'gun';
    let crust;
    if (area === 'gun') {
      const free = GUN_SPOTS.filter((g) => !state.icing.some((c) => c.gun === g.gun));
      if (!free.length) return;
      const g = free[(Math.random() * free.length) | 0];
      crust = { area, gun: g.gun, x: g.x, d: g.d };
    } else {
      const cat = P[CAT];
      let x = 0;
      for (let k = 0; k < 8; k++) {
        x = rand(cat.x0 + 80, cat.x1 - 80);
        if (!state.icing.some((c) => c.d === CAT && Math.abs(c.x - x) < 130)) break;
      }
      crust = { area, x, d: CAT };
    }
    crust.lvl = I.START;
    crust.prog = 0;
    state.icing.push(crust);
  };

  const iceUpdate = (dt, F, flying) => {
    const I = F.ICE;
    const E = state.env;
    if (flying) {
      iceT -= dt * (1 + E.blizzard);
      if (iceT <= 0) {
        iceT = I.SPAWN_EVERY * rand(0.8, 1.2);
        spawnCrust(F);
      }
      for (const c of state.icing) {
        c.lvl = Math.min(1, c.lvl + I.GROW * dt * (1 + E.blizzard * 0.5)); // (hammer progress drains in simulation.js with the other jobs)
      }
    }
    let g = 0;
    let d = 0;
    let guns = 0;
    for (const c of state.icing) {
      if (c.area === 'gasbag') g += c.lvl;
      else if (c.area === 'topdeck') d += c.lvl;
      else guns = Math.max(guns, c.lvl);
    }
    state.ice.gasbag = Math.min(1, g / I.GASBAG_CAP);
    state.ice.topdeck = Math.min(1, d / I.DECK_CAP);
    state.ice.guns = guns;
    E.sink = state.ice.gasbag * I.SINK + state.ice.topdeck * I.DECK_SINK;
  };

  const blizzardUpdate = (dt, F, flying) => {
    const B = F.BLIZZARD;
    const E = state.env;
    if (flying) {
      if (blizzT <= 0 && blizzLeft <= 0) blizzT = B.FIRST;
      if (blizzLeft > 0) {
        blizzLeft -= dt;
        if (blizzLeft <= 0) blizzT = rand(B.EVERY_MIN, B.EVERY_MAX);
      } else if ((blizzT -= dt) <= 0) {
        blizzLeft = B.TIME;
        E.windDir = Math.random() < 0.5 ? -1 : 1;
        if (!warned.blizzard) {
          warned.blizzard = true;
          state.ev.warn = 3;
          state.ev.warnText = 'BLIZZARD GUST - HOLD ON!';
        }
      }
    }
    const want = blizzLeft > 0 ? 1 : 0;
    E.blizzard += (want - E.blizzard) * Math.min(1, dt * 0.6);
    if (!want && E.blizzard < 0.01) {
      E.blizzard = 0;
      warned.blizzard = false;
    }
    E.wind = (E.windDir || 1) * B.WIND * E.blizzard;
    if (E.wind && flying && !state.ship.down && state.course) state.course.dist += E.wind * dt; // (the rock collision shoves her back out)
  };

  const lavaUpdate = (dt, F, flying) => {
    const L = F.LAVA;
    const E = state.env;
    const c = state.course;
    if (!c || !c.map) {
      E.heat = E.burn = E.lift = 0;
      return;
    }
    E.lavaY = lavaLevel(c.map, L);
    let heat = 0;
    let burn = 0;
    if (flying && !state.ship.down) {
      const keel = (c.refY != null ? c.refY : 500 - state.ship.alt) + L.KEEL;
      const mx = c.dist + 800;
      // Is there lava under the hull? (a column whose floor is below the lava surface)
      let over = false;
      for (const dx of [-500, -150, 150, 500]) if (floorBelow(c.map, mx + dx, Math.min(keel, E.lavaY - 1)) > E.lavaY + 1) over = true;
      if (over) {
        const gap = E.lavaY - keel; // negative = sunk into it
        heat = clamp(1 - gap / L.THERMAL_RANGE, 0, 1);
        if (gap < L.BURN_MARGIN) burn = clamp(1 - gap / (L.BURN_MARGIN + 250), 0.3, 1);
      }
    }
    E.heat += (heat - E.heat) * Math.min(1, dt * 2.5);
    E.burn += (burn - E.burn) * Math.min(1, dt * 3);
    if (E.heat < 0.005) E.heat = 0;
    if (E.burn < 0.005) E.burn = 0;
    E.lift = E.heat * L.THERMAL_LIFT;
    if (flying && !state.ship.down) {
      state.ship.press = Math.min(100, state.ship.press + (E.heat * L.PRESS_RATE + E.burn * L.BURN_PRESS) * dt);
      if (E.heat > 0.35 && !warned.thermal) {
        warned.thermal = true;
        state.ev.warn = 2.5;
        state.ev.warnText = 'LAVA THERMAL - VENT GAS TO STAY LOW!';
      }
      if (E.heat < 0.1) warned.thermal = false;
      if (E.burn > 0.2) {
        if (!warned.burn) {
          warned.burn = true;
          state.ev.warn = 2.5;
          state.ev.warnText = 'TOO LOW - THE LAVA IS SCORCHING THE HULL!';
        }
        if ((burnT -= dt * E.burn) <= 0) {
          burnT = L.FIRE_EVERY;
          if (state.fires.length < L.MAX_FIRES) {
            const lo = P[LOWER];
            state.fires.push({ x: rand(lo.x0 + 80, lo.x1 - 80), d: LOWER, t: 0, prog: 0 });
            puff(rand(lo.x0 + 80, lo.x1 - 80), 790 - state.ship.alt, '#ff8a34', 8);
          }
        }
      } else if (E.burn < 0.05) warned.burn = false;
    }
  };

  const smokeUpdate = (dt, F, flying) => {
    const S = F.SMOKE;
    const E = state.env;
    if (flying) {
      if (smokeT <= 0 && smokeLeft <= 0) smokeT = S.FIRST;
      if (smokeLeft > 0) {
        smokeLeft -= dt;
        if (smokeLeft <= 0) smokeT = rand(S.EVERY_MIN, S.EVERY_MAX);
      } else if ((smokeT -= dt) <= 0) smokeLeft = S.TIME;
    }
    E.smoke += ((smokeLeft > 0 ? 1 : 0) - E.smoke) * Math.min(1, dt * 0.5);
    if (smokeLeft <= 0 && E.smoke < 0.01) E.smoke = 0;
  };

  const update = (dt) => {
    const c = state.course;
    const id = envIdOf(state);
    const E = state.env;
    if (!c || c.map !== seenMap || E.id !== id) {
      seenMap = c ? c.map : null;
      clear();
      E.id = id;
      iceT = (config.ENVIRONMENTS.frost.ICE.SPAWN_EVERY || 10) * 0.8;
      blizzT = 0;
      smokeT = 0;
    }
    const flying = state.phase === 'flying';
    if (id === 'frost') {
      const F = config.ENVIRONMENTS.frost;
      blizzardUpdate(dt, F, flying);
      iceUpdate(dt, F, flying);
    } else if (id === 'ember') {
      const F = config.ENVIRONMENTS.ember;
      lavaUpdate(dt, F, flying);
      smokeUpdate(dt, F, flying);
    } else if (id === 'storm') ss.storm(dt, config.ENVIRONMENTS.storm, flying);
    else if (id === 'sea') ss.sea(dt, config.ENVIRONMENTS.sea, flying);
  };

  // ---- ice, as the rest of the game asks about it ----
  const crustOf = (gunName) => state.icing.find((c) => c.gun === gunName) || null;
  const gunIce = (name) => (crustOf(name) ? crustOf(name).lvl : 0);
  const gunJammed = (name) => gunIce(name) >= config.ENVIRONMENTS.frost.ICE.JAM_AT;
  const gunCooldownMul = (name) => 1 + gunIce(name) * config.ENVIRONMENTS.frost.ICE.GUN_SLOW;
  const chip = (crust) => {
    const i = state.icing.indexOf(crust);
    if (i >= 0) state.icing.splice(i, 1);
  };

  return { update, stormSea: ss, gunIce, gunJammed, gunCooldownMul, chip, clear };
}
