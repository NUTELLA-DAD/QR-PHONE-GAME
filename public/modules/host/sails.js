// Wind and sails (Phase S.5e). A ship needs only a gasbag and a deck to fly; with nobody steering, no engines or no boiler she simply DRIFTS with the wind.
//   windSpeed(state)   how fast the wind carries a ship nobody drives (a share of top speed): config.WIND.BASE times how windy the environment is, less in rock-walled maps.
//   state.sails        one { n, hoist (0 furled .. 1 full), lowering, prog (= hoist, what the phone's meter shows), pull } per mast-and-sail part of the layout
//   state.sailPush     the forward speed all the raised sails add (a share of top speed): course.js scrollSpeed adds it to the ship's own speed
//   state.sailWarn     a gust is due (or blowing): a raised sail should be reefed now (the TV and the phones say so)
// A crew member stands at the mast and holds Action to haul the sail up (SAIL.HAUL_TIME), taps Action to let it down (SAIL.LOWER_TIME). Let go half way and it slips back.
// A raised sail in a gust (a Storm Front gust, a Frost blizzard) can TEAR: the sail's module breaks (a hammer mends it) and the canvas falls. In a gust it also shoves the ship harder.
// A ship with no sail part is untouched: nothing here runs for her (state.sailPush stays 0).
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { envIdOf } from './environments.js';
import { pop } from './popups.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The wind carrying a ship nobody drives (share of top speed). Windy places blow harder; rock-walled maps shelter her.
export function windFactor(state) {
  const W = config.WIND;
  return (W.ENV[envIdOf(state)] ?? 1) * (state.course && state.course.map && !state.course.map.open ? W.CAVE : 1);
}
export const windSpeed = (state) => config.WIND.BASE * windFactor(state);
// Is a gust blowing right now (or about to)? Returns 0 (calm), 1 (due soon) or 2 (blowing).
export function gustState(state) {
  const S = config.SAIL, w = state.weather, E = state.env || {};
  if ((w && w.gusting && w.storm > 0.15) || (E.gale || 0) > 0.25 || (E.blizzard || 0) > 0.3) return 2;
  if (w && w.storm > 0.15 && w.gustIn < S.GUST_WARN) return 1;
  return 0;
}

export function createSails({ state, modules }) {
  const S = config.SAIL;
  state.sails = [];
  state.sailPush = 0;
  state.sailWarn = false;
  state.sailStats = { raised: 0, torn: 0, upSecs: 0 };
  let version = -1;

  const sync = () => {
    if (version === SHIP_LAYOUT.version && state.sails.length === (SHIP_LAYOUT.sails || []).length) return;
    version = SHIP_LAYOUT.version;
    state.sails = (SHIP_LAYOUT.sails || []).map((s, i) => ({ n: s.n, i, hoist: 0, lowering: false, prog: 0, pull: 0, torn: false, worked: false, color: S.COLORS[i % S.COLORS.length] }));
  };
  const modOf = (sail) => modules.byName[sail.n];
  const isTorn = (sail) => { const m = modOf(sail); return !!m && m.broken; };

  // What Action does for a player standing at a mast (or null): hold to raise, tap to lower. `here(o, r)` is simulation.js's reach test.
  const actionFor = (player, here) => {
    const lay = SHIP_LAYOUT.sails;
    if (!lay || !lay.length) return null;
    sync();
    const i = lay.findIndex((s) => here(s, S.REACH));
    if (i < 0) return null;
    const sail = state.sails[i];
    if (!sail || isTorn(sail)) return null; // (a torn sail is mended with a hammer: the repair action takes over)
    if (sail.hoist >= 0.98 && !sail.lowering) return { type: 'sail', obj: sail, label: 'Lower sail' };
    if (sail.lowering) return { type: 'need', label: 'The sail is coming down...' };
    return { type: 'sail', obj: sail, hold: true, time: S.HAUL_TIME, label: 'Raise sail' };
  };
  // Holding Action at the mast: haul the sail up.
  const haul = (sail, dt) => {
    sail.worked = true;
    sail.lowering = false;
    sail.hoist = Math.min(1, sail.hoist + dt / S.HAUL_TIME);
    sail.prog = sail.hoist;
  };
  // Tap at a raised sail: let it down.
  const lower = (sail) => { sail.lowering = true; };

  const update = (dt) => {
    sync();
    const flying = state.phase === 'flying' && !state.ship.down;
    if (!state.sails.length) { state.sailPush = 0; state.sailWarn = false; return; }
    const gust = gustState(state);
    let up = 0;
    for (const sail of state.sails) {
      const torn = isTorn(sail);
      if (torn && sail.hoist > 0) { sail.lowering = true; if (!sail.torn) { sail.torn = true; sail.hoist = Math.min(sail.hoist, 0.5); } }
      if (!torn) sail.torn = false;
      if (sail.lowering) {
        sail.hoist = Math.max(0, sail.hoist - dt / (torn ? S.LOWER_TIME * 0.4 : S.LOWER_TIME));
        if (sail.hoist <= 0) sail.lowering = false;
      } else if (!sail.worked && sail.hoist > 0 && sail.hoist < 1) {
        sail.hoist = Math.max(0, sail.hoist - dt / (S.LOWER_TIME * 2)); // (let go half way: the sail slips back down)
      }
      sail.worked = false;
      sail.prog = sail.hoist;
      if (sail.hoist > 0.3 && !sail.lowering) up++;
      // A gust on a raised sail can tear it.
      if (flying && gust === 2 && sail.hoist > 0.25 && !torn && Math.random() < S.TEAR_CHANCE * sail.hoist * dt) {
        const m = modOf(sail), lay = SHIP_LAYOUT.sails[sail.i];
        if (m) {
          modules.damage(m, 999);
          sail.torn = true;
          sail.lowering = true;
          state.sailStats.torn++;
          state.ev.warn = 3;
          state.ev.warnText = 'THE GUST TORE THE SAIL! MEND IT WITH A HAMMER';
          pop(state, lay.x, SHIP_LAYOUT.platforms[lay.d].y - lay.h * 0.6 - state.ship.alt, 'RIIIP!', '#e63946', 1);
          state.sfxQ.push(['impact']);
        }
      }
    }
    state.sailWarn = gust > 0 && state.sails.some((s) => s.hoist > 0.05 && !s.lowering && !s.torn);
    if (flying && state.sailWarn && gust === 1 && !state.sailWarned) {
      state.sailWarned = true;
      state.ev.warn = 2.5;
      state.ev.warnText = 'GUST COMING - REEF THE SAILS!';
    }
    if (!state.sailWarn) state.sailWarned = false;
    // The pull: each raised sail adds BONUS x how windy it is, the later ones a little less (diminishing returns). Sails go slack against the rock.
    const slack = !flying || (state.course && (state.course.scraping || state.course.unstick > 0));
    let push = 0, k = 1;
    const wind = windFactor(state);
    for (const sail of [...state.sails].sort((a, b) => b.hoist - a.hoist)) {
      sail.pull = slack || sail.torn ? 0 : sail.hoist * S.BONUS * wind * k;
      if (sail.hoist > 0.05 && !sail.torn) k *= S.BONUS_DIM;
      push += sail.pull;
    }
    state.sailPush += (push - state.sailPush) * Math.min(1, dt * S.SPEED_RATE);
    if (Math.abs(state.sailPush) < 1e-4) state.sailPush = 0;
    if (up && flying) state.sailStats.upSecs += dt;
  };

  // A gust shoves a ship with her sails up harder (weather.js asks).
  const gustShove = () => 1 + S.GUST_SHOVE * state.sails.reduce((n, s) => n + (s.torn ? 0 : s.hoist), 0);

  return { update, actionFor, haul, lower, gustShove, sync };
}
