// Crew-size scaling: the number of crew aboard (connected players, bots included) sets a multiplier
// for enemy numbers, fire rate, damage taken and so on, on top of the difficulty (config.CREW_SCALE).
// state.crewScale holds the live, smoothed numbers; the other modules read them through the helpers
// below so one place decides how difficulty and crew size combine.
import { config } from '../../config.js';

const CS = () => config.CREW_SCALE;
const KEYS = ['spawn', 'count', 'fire', 'damage', 'raiders', 'hp', 'spread', 'collateral'];

// (Ship's mates, see mates.js, are helpers and never count as crew.)
export const crewAboard = (state) => Object.values(state.players).filter((p) => p.connected !== false && !p.mate).length;
// Everyone on the roster (connected or not) except the mates: for tweaks that depend on the crew's size.
export const crewHeads = (state) => Object.values(state.players).filter((p) => !p.mate).length;

// The multiplier set for n crew (interpolated between the table rows; n may be fractional).
export function scaleFor(n) {
  const rows = Object.keys(CS().TABLE).map(Number).sort((a, b) => a - b);
  const out = { n };
  const x = Math.max(rows[0], Math.min(rows[rows.length - 1], n));
  let lo = rows[0];
  let hi = rows[0];
  for (const r of rows) {
    if (r <= x) lo = r;
    if (r >= x) { hi = r; break; }
  }
  const t = hi === lo ? 0 : (x - lo) / (hi - lo);
  for (const k of KEYS) out[k] = CS().TABLE[lo][k] + (CS().TABLE[hi][k] - CS().TABLE[lo][k]) * t;
  return out;
}

const NEUTRAL = scaleFor(8);

// Call every frame: eases the effective crew number toward the real one (instantly in the lobby).
export function updateCrewScale(state, dt) {
  const real = Math.max(1, crewAboard(state) || 8);
  const cs = state.crewScale || (state.crewScale = { ...NEUTRAL, eff: real });
  if (cs.eff == null || state.phase === 'lobby') cs.eff = real;
  else cs.eff += Math.max(-CS().RAMP * dt, Math.min(CS().RAMP * dt, real - cs.eff));
  Object.assign(cs, CS().ENABLED ? scaleFor(cs.eff) : NEUTRAL);
  cs.real = real;
  // (the difficulty button can change the spare gasbags until the first limp)
  const run = state.run;
  if (state.phase === 'lobby' && run && !run.limps) run.spares = run.sparesMax = sparesFor(state);
}

const scale = (state) => (CS().ENABLED && state.crewScale) || NEUTRAL;
const diffOf = (state) => config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal;

// Spare gasbags (limp-home lives) for this difficulty.
export const sparesFor = (state) => diffOf(state).spares ?? config.LIMP.SPARES;

// How fast waves and specials arrive (difficulty pace x crew spawn rate).
export const spawnPace = (state) => diffOf(state).pace * scale(state).spawn;
// How fast the enemy shoots (difficulty pace x crew fire rate).
export const firePace = (state) => diffOf(state).pace * scale(state).fire;
export const damageMul = (state) => diffOf(state).damage * scale(state).damage;
export const crewMul = (state, key) => scale(state)[key];
// Does the helm fly itself when nobody is at the wheel? (Easy/Normal, and any difficulty for a tiny crew.)
export const autopilotOn = (state) => diffOf(state).autopilot || (CS().ENABLED && crewAboard(state) <= CS().AUTOPILOT_MAX_CREW);
