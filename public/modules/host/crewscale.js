// Crew-size scaling: the number of crew aboard (connected players, bots included) sets a multiplier
// for enemy numbers, fire rate, damage taken and so on, on top of the difficulty (config.CREW_SCALE).
// state.crewScale holds the live, smoothed numbers; the other modules read them through the helpers
// below so one place decides how difficulty and crew size combine.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { powerMul } from './shipPower.js';

const CS = () => config.CREW_SCALE;
const TABLE = () => (config.PVP.ENABLED ? config.PVP.HANDICAP : CS().TABLE); // (Versus has its own, gentler table: what a small or a big crew changes about the damage a ship takes)
const KEYS = ['spawn', 'count', 'fire', 'damage', 'raiders', 'hp', 'spread', 'collateral'];

// (Ship's mates, see mates.js, are helpers and never count as crew.)
export const crewAboard = (state) => Object.values(state.players).filter((p) => p.connected !== false && !p.mate).length;
// Everyone on the roster (connected or not) except the mates: for tweaks that depend on the crew's size.
export const crewHeads = (state) => Object.values(state.players).filter((p) => !p.mate).length;

// The multiplier set for n crew (interpolated between the table rows; n may be fractional).
export function scaleFor(n) {
  const rows = Object.keys(TABLE()).map(Number).sort((a, b) => a - b);
  const out = { n };
  const x = Math.max(rows[0], Math.min(rows[rows.length - 1], n));
  let lo = rows[0];
  let hi = rows[0];
  for (const r of rows) {
    if (r <= x) lo = r;
    if (r >= x) { hi = r; break; }
  }
  const t = hi === lo ? 0 : (x - lo) / (hi - lo);
  for (const k of KEYS) out[k] = TABLE()[lo][k] + (TABLE()[hi][k] - TABLE()[lo][k]) * t;
  return out;
}

const NEUTRAL = scaleFor(8);

// Call every frame, once for each ship (B.3: with the SHIP's context, so `state.players` is her crew and `state.crewScale` is hers): eases the effective crew number toward the real one
// (instantly in the lobby). Ship 0's is the world's (the enemies hunt her, so their numbers follow her crew); another ship's only scales what happens to HER.
export function updateCrewScale(state, dt) {
  const real = Math.max(1, crewAboard(state) || 8);
  const cs = state.crewScale || (state.crewScale = { ...NEUTRAL, eff: real });
  if (cs.eff == null || state.phase === 'lobby') cs.eff = real;
  else cs.eff += Math.max(-CS().RAMP * dt, Math.min(CS().RAMP * dt, real - cs.eff));
  Object.assign(cs, CS().ENABLED ? scaleFor(cs.eff) : NEUTRAL);
  cs.real = real;
  // (the difficulty button can change the spare gasbags until the first limp)
  const run = mainShip(state).main ? state.run : null; // (the run and its spare gasbags belong to the main ship)
  // (The Yard: the danger follows the ship's fighting strength too, shipPower.js: a small starting ship meets lighter enemies, a built-up one the classic danger. Only on a voyage that started
  // with a build, and only for ship 0, whose numbers the world's enemies use; the classic ship's ratio is 1, so her numbers are not touched.)
  if (run && run.power != null && CS().ENABLED && !config.PVP.ENABLED) for (const k of Object.keys(config.YARD.POWER.KEYS)) cs[k] *= powerMul(run.power, k);
  if (state.phase === 'lobby' && run && !run.limps) run.spares = run.sparesMax = sparesFor(state);
}

const scale = (state) => (CS().ENABLED && state.crewScale) || NEUTRAL;
const diffOf = (state) => config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal;

// Spare gasbags (limp-home lives) for this difficulty.
export const sparesFor = (state) => (config.PVP.ENABLED ? 0 : diffOf(state).spares ?? config.LIMP.SPARES); // (Versus: no limp-home, a wreck is final)

// How fast waves and specials arrive (difficulty pace x crew spawn rate).
export const spawnPace = (state) => diffOf(state).pace * scale(state).spawn;
// How fast the enemy shoots (difficulty pace x crew fire rate).
export const firePace = (state) => diffOf(state).pace * scale(state).fire;
export const damageMul = (state) => (config.PVP.ENABLED ? 1 : diffOf(state).damage) * scale(state).damage; // (Versus: the difficulty button is a co-op knob)
export const crewMul = (state, key) => scale(state)[key];
// Does the helm fly itself when nobody is at the wheel? (Easy/Normal, and any difficulty for a tiny crew.)
export const autopilotOn = (state) => diffOf(state).autopilot || (CS().ENABLED && crewAboard(state) <= CS().AUTOPILOT_MAX_CREW);
