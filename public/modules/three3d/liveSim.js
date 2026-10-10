// The REAL 2D simulation, run headlessly inside this page (the way tools/botsim.mjs runs it): bots aboard, cast off, stepped at 60 Hz. The 3D page only reads
// its state; nothing here changes the game. Builds come from shipBuild.js (classic, sparrow), shipGen.js (random ships) and My Ships (playtest.js storage).
import { config } from '../../config.js';
import { applyBuild } from '../../shipLayout.js';
import { BUILDS } from '../host/shipBuild.js';
import { createSimulation } from '../host/simulation.js';
import { newBot } from '../host/network.js';
import { listDesigns, getDesign } from '../host/playtest.js';
import { generateShip } from '../host/shipGen.js';

export const RANDOM_SEEDS = [3, 7, 11, 19];

// 'classic' | 'sparrow' | 'gen:SEED' | 'my:ID' -> { parts, name }
export function resolveBuild(spec) {
  try {
    if (!spec || spec === 'classic') return { parts: BUILDS.classic, name: 'Classic' };
    if (spec === 'sparrow') return { parts: BUILDS.sparrow, name: 'Sparrow' };
    if (spec.startsWith('gen:')) {
      const g = generateShip(Number(spec.slice(4)) || 1);
      if (g) return { parts: g.parts, name: g.name };
    }
    if (spec.startsWith('my:')) {
      const d = getDesign(spec.slice(3));
      if (d) return { parts: d.parts, name: d.name };
    }
  } catch (e) { console.warn('could not resolve build', spec, e); }
  return { parts: BUILDS.classic, name: 'Classic' };
}

// The choices for the Build dropdown.
export function buildChoices() {
  const out = [{ value: 'classic', label: 'Classic (the real ship)' }, { value: 'sparrow', label: 'Sparrow (starter)' }];
  for (const s of RANDOM_SEEDS) {
    let name = 'random ship ' + s;
    try { const g = generateShip(s); if (g) name = 'random: ' + g.name; } catch { /* keep the plain label */ }
    out.push({ value: 'gen:' + s, label: name });
  }
  try { for (const d of listDesigns()) out.push({ value: 'my:' + d.id, label: 'My Ships: ' + d.name }); } catch { /* no storage */ }
  return out;
}

// opts: { build, env, map, creature, bots, seed, warm (seconds of game time to run before the first frame) }
export function startLive(opts = {}) {
  if (opts.env) config.ENVIRONMENTS.FORCE = opts.env;
  if (opts.map) config.MAPS.FORCE_KIND = opts.map;
  if (opts.creature === 'kraken') config.CREATURES.DEV_SPAWN = 'kraken';
  if (opts.seed != null) { // repeatable runs (screenshots): the same seeded random numbers as botsim
    let s = opts.seed >>> 0;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const built = resolveBuild(opts.build);
  if (built.parts !== BUILDS.classic) applyBuild(built.parts);
  const sim = createSimulation();
  const state = sim.state;
  const n = Math.max(1, Math.min(8, opts.bots || 6));
  for (let i = 0; i < n; i++) {
    const bot = newBot(state, state.ships[0], 'Bot' + (i + 1));
    state.players[bot.id] = bot;
  }
  sim.castOff();
  const STEP = config.LOOP.STEP;
  let acc = 0, lobbyFor = 0;
  // The page's COME ABOUT button: the game's own rules decide (the same why() the helm asks), except that she may start at any speed here, so the demo works whatever the bots are doing.
  config.SHIP.TURN.MAX_SPEED = Math.max(config.SHIP.TURN.MAX_SPEED, 1.3);
  const live = {
    sim, state, buildName: built.name,
    steps: 0,
    comeAbout() {
      const ca = state.ships[0] && state.ships[0].sim && state.ships[0].sim.comeAbout;
      if (!ca) return 'no come-about system';
      const why = ca.why();
      if (why) return why;
      if (!ca.patched) { // hold the helm's COME ABOUT command for its hold time, the way a phone's held button does
        const begin = ca.begin;
        ca.begin = () => { begin(); if (live.askFor > 0) { live.askFor -= STEP; ca.ask(null); } };
        ca.patched = true;
      }
      live.askFor = config.SHIP.TURN.HOLD + 0.15;
      return 'ok';
    },
    askFor: 0,
    // Run the simulation for `real` seconds of real time (fixed 60 Hz steps, like the host).
    advance(real) {
      acc += Math.min(config.LOOP.MAX_FRAME, Math.max(0, real));
      let k = 0;
      while (acc >= STEP && k < config.LOOP.MAX_STEPS) {
        try { sim.update(STEP); } catch (e) { (window.gameErrors = window.gameErrors || []).push(String(e && e.message)); if (window.gameErrors.length > 20) window.gameErrors.shift(); console.error(e); }
        state.sfxQ.length = 0; // (nobody plays the sounds here: keep the queue from growing)
        acc -= STEP;
        k++;
        live.steps++;
      }
      if (acc >= STEP) acc = 0;
      if (state.phase === 'lobby') { // she was wrecked and the run ended: cast off again after a moment
        lobbyFor += real;
        if (lobbyFor > 3) { lobbyFor = 0; try { sim.castOff(); } catch (e) { console.error(e); } }
      } else lobbyFor = 0;
    },
    // Run `seconds` of game time right now (a warm-up).
    warm(seconds) {
      const steps = Math.round(seconds / STEP);
      for (let i = 0; i < steps; i++) {
        try { sim.update(STEP); } catch (e) { console.error(e); break; }
        state.sfxQ.length = 0;
        live.steps++;
        if (state.phase === 'lobby') sim.castOff();
      }
    },
  };
  if (opts.warm) live.warm(opts.warm);
  return live;
}
