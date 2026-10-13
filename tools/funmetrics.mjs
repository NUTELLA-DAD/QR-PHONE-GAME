// "Fun numbers" for the bot tools (FUN.md F8): counters that say how a run FELT, not only whether it won. Data only: nothing here touches the game.
//   const fun = createFunMetrics(state, { kindOf, targets, moments: sim.moments });  fun.step(dt) once per sim step, after sim.update;  fun.result() -> a plain object (JSON safe).
//   overrun     events where at least 3 crew were knocked out, 2 fires burned and 2 raiders were aboard, all at once (a new event after 5 s of calm)
//   idle        crew seat time with nothing to do (a gun with no target, a lamp with nothing to light: the bots' gunIdle), over all seats and over gun seats alone
//   menu        seconds of scorecard + dock + route votes, and how many scorecards there were (menu s/stop = secs / scorecards)
//   groundStill seconds sitting on the ground, not moving, with no FALLING alarm up (F5: the ground soft lock)
//   gap         the longest stretch of flight (s) without a named moment in the Ship's Book
//   threat      per stop (column): flight seconds until the first thing to shoot or fight showed up
//   falls       per stop (column): FALLING (GOING DOWN!) alarms
//   steam       (F13) flight seconds with the pressure under 30 / the firebox under 12 / a burst pipe open / the leaks over 3 / the boiler broken; and, for every FALLING alarm, the state of the steam at that moment
// Thresholds live here as plain constants: they define what the lines MEAN, they do not tune the game.
const STATIC = new Set(['turret', 'post', 'core', 'shutter', 'rspecial', 'laid', 'mine', 'para']); // (shootables that sit on the map from the start, or drift: not a threat showing up)
export const FUN = { KO: 3, FIRES: 2, BOARDERS: 2, OVERRUN_CALM: 5, SAMPLE: 10 };

export function createFunMetrics(state, { kindOf, targets, moments }) {
  const m = { flightSecs: 0, seatSecs: 0, idleSecs: 0, gunSecs: 0, gunIdleSecs: 0, overrun: 0, overrunSecs: 0, groundStillSecs: 0, menuSecs: 0, scorecards: 0, gapMax: 0, threat: {}, flown: {}, falls: {}, steam: { flight: 0, lowPress: 0, lowFuel: 0, pipe: 0, leaking: 0, boilerOut: 0, nobodyStoking: 0, bursts: 0, burstSecs: 0, burstMax: 0, burstStuck: 0, blowouts: 0, boilerBreaks: 0, over90: 0, why: {}, boilerWhy: {}, at: [] } };
  let overCalm = 1e9, gap = 0, lastNamed = moments ? moments.totals.named : 0, wasCard = false, wasDown = false, n = 0;
  const colOf = () => (state.run && state.run.stopId ? Number(String(state.run.stopId).split('.')[0]) : 0);
  const threatNow = () => targets(state).some((t) => !STATIC.has(t.kind)) || state.boarders.length > 0 || !!state.boss || !!state.creature;
  // F13: the steam, per second of flight, and at the start of every fall (which of the causes in goingDown.js stats.why it was, and what the steam was doing)
  let why0 = {}, prevPress = 0, boilerWas = false;
  const pipeBroken = {};
  const burstAt = {}; // pipe name -> seconds it has been burst with its valve open (F13: how long a leak runs before somebody shuts the valve)
  const steamStep = (dt, fell) => {
    const S = m.steam, mods = state.modules || [], P = state.steamParts || {}, press = state.ship.press, fuel = state.ship.fuel;
    const pipeOpen = mods.some((q) => q.kind === 'pipe' && q.broken && q.open), boilerOut = mods.some((q) => q.kind === 'boiler' && q.broken);
    const stoking = Object.values(state.players).some((q) => !q.enemy && !(q.ko > 0) && (q.carry === 'coal' || (q.botJob && q.botJob.kind === 'coal')));
    S.flight += dt;
    if (press === 75 && prevPress > 75) S.blowouts++; // (the boiler blowing sets the line to exactly 75)
    if (press >= 90) S.over90 += dt;
    prevPress = press;
    if (boilerOut && !boilerWas) { S.boilerBreaks++; const bm = mods.find((q) => q.kind === 'boiler' && q.broken), c = (press === 75 || prevPress === 75) ? 'blowout' : bm && state.fires.some((f) => f.d === bm.d && Math.abs(f.x - bm.x) < 160) ? 'fire' : 'hit'; S.boilerWhy[c] = (S.boilerWhy[c] || 0) + 1; }
    boilerWas = boilerOut;
    for (const q of mods) {
      if (q.kind !== 'pipe') continue;
      if (q.broken && !pipeBroken[q.name]) { // a pipe has just burst: what was going on (a fire beside it, the boiler blowing, rock under the keel, else a hit)
        const c = state.fires.some((f) => f.d === q.d && Math.abs(f.x - q.x) < 160) ? 'fire' : (press === 75 || prevPress === 75) ? 'blowout' : state.grounded ? 'rock' : 'hit';
        S.why[c] = (S.why[c] || 0) + 1;
      }
      pipeBroken[q.name] = !!q.broken;
      if (q.broken && q.open) { if (burstAt[q.name] == null) { burstAt[q.name] = 0; S.bursts++; } burstAt[q.name] += dt; if (burstAt[q.name] > 20 && burstAt[q.name] - dt <= 20) S.burstStuck++; }
      else if (burstAt[q.name] != null) { S.burstSecs += burstAt[q.name]; S.burstMax = Math.max(S.burstMax, burstAt[q.name]); delete burstAt[q.name]; }
    }
    if (press < 30) S.lowPress += dt;
    if (fuel < 12) S.lowFuel += dt;
    if (pipeOpen) S.pipe += dt;
    if ((P.leaks || 0) > 3) S.leaking += dt;
    if (boilerOut) S.boilerOut += dt;
    if (fuel < 30 && !stoking) S.nobodyStoking += dt;
    if (fell) {
      const why = (state.structStats && state.structStats.why) || {}, k = Object.keys(why).find((x) => (why[x] || 0) > (why0[x] || 0)) || '?';
      why0 = { ...why };
      if (S.at.length < 60) S.at.push({ why: k, col: colOf(), press: Math.round(press), fuel: Math.round(fuel), pump: +(P.pump || 0).toFixed(1), leaks: +(P.leaks || 0).toFixed(1), eng: +(P.engines || 0).toFixed(1), vents: +(P.vents || 0).toFixed(1), speed: +state.ship.speed.toFixed(2), pipe: pipeOpen, boilerOut, stoking, brokenMods: mods.filter((q) => q.broken).length, holes: (state.gasHoles || []).length, gas: Math.round(state.ship.gas), short: state.liftWeight ? Math.round(state.liftWeight.weight - state.liftWeight.lift) : null, input: +(state.gasValve ? state.gasValve.input : 0).toFixed(2), vy: Math.round(state.ship.vy || 0), grounded: !!state.grounded, helm: Object.values(state.players).some((q) => kindOf(q.lock) === 'helm'), map: state.course && state.course.map ? state.course.map.kind + (state.course.map.open ? '' : ':cave') : null, env: state.env && state.env.id, unstick: !!(state.course && state.course.unstick > 0), helmDark: mods.some((q) => (q.kind === 'helm' && q.broken) || (q.kind === 'pipe' && q.to && mods.some((h) => h.kind === 'helm' && h.name === q.to) && (q.broken || !q.open))), coalOut: (state.gdCoalOut || 0) > 0 || !!(state.goingDown && state.goingDown.coalGone), fires: state.fires.length, ko: Object.values(state.players).filter((q) => q.ko > 0).length });
    }
  };
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
      steamStep(dt, down && !wasDown);
      wasDown = down;
    },
    result: () => ({ ...m, threat: { ...m.threat }, flown: { ...m.flown }, falls: { ...m.falls }, steam: { ...m.steam, at: m.steam.at.slice() } }),
  };
}

// One line for a single run (botsim --fun).
export function funLine(r) {
  const pc = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(1) + '%' : 'n/a');
  const per = (o) => Object.keys(o).map(Number).sort((a, b) => a - b).map((c) => `${c + 1}:${typeof o[c] === 'number' ? +o[c].toFixed(1) : o[c]}`).join(' ') || 'none';
  return `fun: overrun ${r.overrun}x (${r.overrunSecs.toFixed(1)}s), idle ${pc(r.idleSecs, r.seatSecs)} of ${r.seatSecs.toFixed(0)}s seat time (gun seats ${pc(r.gunIdleSecs, r.gunSecs)}), menu ${r.menuSecs.toFixed(0)}s over ${r.scorecards} scorecards, longest no-moment gap ${r.gapMax.toFixed(0)}s, first threat by stop [${per(r.threat)}], falls by stop [${per(r.falls)}]`;
}
