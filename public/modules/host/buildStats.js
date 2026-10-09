// Run statistics for a ship build, collected while bots fly her (tools/botsim.mjs --build ..., tools/buildsim.mjs, public/buildtest.html).
// Call stats.step(dt) after every sim.update(dt); stats.result() gives the numbers buildCheck.js judges and the batch table prints.
import { mainShip } from './ships.js';

export function createRunStats(state) {
  const R = { steps: 0, flightSteps: 0, hullSum: 0, kills: 0, wrecks: 0, missions: 0, walkSteps: 0, crewSteps: 0 };
  const manned = {}; // station name -> steps somebody stood at it
  const hauled = { ammo: 0, coal: 0, holes: 0, fires: 0 };
  const seen = new Map(); // player id -> the stat counts last time (the counters reset with the lap, so only increases count)
  let lastKills = 0, lastLap = state.course ? state.course.lap : 1, lastPhase = state.phase;
  let dtSum = 0;
  let tiltSum = 0, tiltMax = 0; // the trim angle while flying (balance.js): mean |degrees| and the worst
  return {
    step(dt) {
      R.steps++;
      dtSum += dt;
      if (state.kills < lastKills) lastKills = 0; // (kills reset on a wreck)
      R.kills += state.kills - lastKills;
      lastKills = state.kills;
      if (state.course && state.course.lap > lastLap) { R.missions += state.course.lap - lastLap; lastLap = state.course.lap; }
      if (state.phase === 'lobby' && lastPhase !== 'lobby') { R.wrecks++; lastKills = 0; lastLap = state.course ? state.course.lap : lastLap; }
      lastPhase = state.phase;
      for (const q of Object.values(state.players)) {
        const st = q.stats || {};
        const was = seen.get(q.id) || {};
        for (const k of Object.keys(hauled)) {
          const d = (st[k] || 0) - (was[k] || 0);
          if (d > 0) hauled[k] += d;
          was[k] = st[k] || 0;
        }
        seen.set(q.id, was);
      }
      if (state.phase !== 'flying') return;
      R.flightSteps++;
      R.hullSum += state.ship.hull;
      if (state.balance) { const a = Math.abs(state.balance.deg); tiltSum += a; if (a > tiltMax) tiltMax = a; }
      for (const q of Object.values(state.players)) {
        if (q.lock) manned[q.lock] = (manned[q.lock] || 0) + 1;
        if (!q.bot || q.fall) continue;
        R.crewSteps++;
        if (q.conn != null || Math.abs(q.vx || 0) > 40) R.walkSteps++; // (on its feet and going somewhere: walking or climbing)
      }
    },
    result() {
      const flightMin = (R.flightSteps * (dtSum / Math.max(1, R.steps))) / 60;
      const mannedKinds = {};
      const mannedNames = {};
      for (const [name, n] of Object.entries(manned)) {
        const s = Math.round((n * dtSum) / Math.max(1, R.steps));
        mannedNames[name] = s;
        const kind = mainShip(state).layout.kindOf(name) || 'other';
        mannedKinds[kind] = (mannedKinds[kind] || 0) + s;
      }
      return {
        flightMin: +flightMin.toFixed(2), kills: R.kills, killsPerMin: flightMin ? +(R.kills / flightMin).toFixed(2) : 0,
        missions: R.missions, wrecks: R.wrecks, avgHull: R.flightSteps ? +(R.hullSum / R.flightSteps).toFixed(1) : 0,
        walkPct: R.crewSteps ? +((100 * R.walkSteps) / R.crewSteps).toFixed(1) : 0, hauled: { ...hauled },
        tilt: R.flightSteps ? +(tiltSum / R.flightSteps).toFixed(2) : 0, tiltMax: +tiltMax.toFixed(2),
        mannedKinds, mannedNames, tows: state.tugHauls || 0, boilerLoads: { ...(state.boilerLoads || {}) },
      };
    },
  };
}
