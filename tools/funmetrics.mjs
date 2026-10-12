// "Fun numbers" for the bot tools (FUN.md F8): counters that say how a run FELT, not only whether it won. Data only: nothing here touches the game.
//   const fun = createFunMetrics(state, { kindOf, targets, moments: sim.moments });  fun.step(dt) once per sim step, after sim.update;  fun.result() -> a plain object (JSON safe).
//   overrun     events where at least 3 crew were knocked out, 2 fires burned and 2 raiders were aboard, all at once (a new event after 5 s of calm)
//   idle        crew seat time with nothing to do (a gun with no target, a lamp with nothing to light: the bots' gunIdle), over all seats and over gun seats alone
//   menu        seconds of scorecard + dock + route votes, and how many scorecards there were (menu s/stop = secs / scorecards)
//   groundStill seconds sitting on the ground, not moving, with no FALLING alarm up (F5: the ground soft lock)
//   gap         the longest stretch of flight (s) without a named moment in the Ship's Book
//   threat      per stop (column): flight seconds until the first thing to shoot or fight showed up
//   falls       per stop (column): FALLING (GOING DOWN!) alarms
// Thresholds live here as plain constants: they define what the lines MEAN, they do not tune the game.
const STATIC = new Set(['turret', 'post', 'core', 'shutter', 'rspecial', 'laid', 'mine', 'para']); // (shootables that sit on the map from the start, or drift: not a threat showing up)
export const FUN = { KO: 3, FIRES: 2, BOARDERS: 2, OVERRUN_CALM: 5, SAMPLE: 10 };

export function createFunMetrics(state, { kindOf, targets, moments }) {
  const m = { flightSecs: 0, seatSecs: 0, idleSecs: 0, gunSecs: 0, gunIdleSecs: 0, overrun: 0, overrunSecs: 0, groundStillSecs: 0, menuSecs: 0, scorecards: 0, gapMax: 0, threat: {}, flown: {}, falls: {} };
  let overCalm = 1e9, gap = 0, lastNamed = moments ? moments.totals.named : 0, wasCard = false, wasDown = false, n = 0;
  const colOf = () => (state.run && state.run.stopId ? Number(String(state.run.stopId).split('.')[0]) : 0);
  const threatNow = () => targets(state).some((t) => !STATIC.has(t.kind)) || state.boarders.length > 0 || !!state.boss || !!state.creature;
  return {
    step(dt) {
      n++;
      const card = !!state.scorecard;
      if (card && !wasCard) m.scorecards++;
      wasCard = card;
      if (card || state.vote) { m.menuSecs += dt; return; }
      if (state.phase !== 'flying' || state.ship.down) { gap = 0; return; }
      const col = colOf();
      m.flightSecs += dt;
      m.flown[col] = (m.flown[col] || 0) + dt;
      // the longest dull stretch: flight time since the last named moment
      if (moments && moments.totals.named !== lastNamed) { lastNamed = moments.totals.named; gap = 0; }
      gap += dt;
      if (gap > m.gapMax) m.gapMax = gap;
      if (state.grounded && Math.abs(state.ship.speed) < 0.05 && !state.goingDown) m.groundStillSecs += dt; // (F5)
      // seats with nothing to do
      for (const q of Object.values(state.players)) {
        if (!q.lock || q.mate || q.enemy || q.ko > 0 || q.fall) continue;
        m.seatSecs += dt;
        const idle = (q.gunIdle || 0) > 0;
        if (idle) m.idleSecs += dt;
        if (kindOf(q.lock) === 'gun') { m.gunSecs += dt; if (idle) m.gunIdleSecs += dt; }
      }
      // an overrun: crew down, fires and raiders, all at once
      const ko = Object.values(state.players).filter((q) => !q.enemy && q.ko > 0).length;
      if (ko >= FUN.KO && state.fires.length >= FUN.FIRES && state.boarders.length >= FUN.BOARDERS) {
        if (overCalm >= FUN.OVERRUN_CALM) m.overrun++;
        overCalm = 0;
        m.overrunSecs += dt;
      } else overCalm += dt;
      // the first threat of the stop
      if (m.threat[col] == null && n % FUN.SAMPLE === 0 && threatNow()) m.threat[col] = m.flown[col];
      // a fall
      const down = !!state.goingDown;
      if (down && !wasDown) m.falls[col] = (m.falls[col] || 0) + 1;
      wasDown = down;
    },
    result: () => ({ ...m, threat: { ...m.threat }, flown: { ...m.flown }, falls: { ...m.falls } }),
  };
}

// One line for a single run (botsim --fun).
export function funLine(r) {
  const pc = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
  const per = (o) => Object.keys(o).map(Number).sort((a, b) => a - b).map((c) => `${c + 1}:${typeof o[c] === 'number' ? +o[c].toFixed(1) : o[c]}`).join(' ') || 'none';
  return `fun: overrun ${r.overrun}x (${r.overrunSecs.toFixed(1)}s), idle ${pc(r.idleSecs, r.seatSecs)} of ${r.seatSecs.toFixed(0)}s seat time (gun seats ${pc(r.gunIdleSecs, r.gunSecs)}), menu ${r.menuSecs.toFixed(0)}s over ${r.scorecards} scorecards, longest no-moment gap ${r.gapMax.toFixed(0)}s, first threat by stop [${per(r.threat)}], falls by stop [${per(r.falls)}]`;
}
