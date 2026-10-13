// STEAM AND LIFT (FUN.md F13): the small rules that keep the one doom clock (LIFT) fair and readable. All of it sits behind config.STEAMFIX.ENABLED (NO_STEAMFIX=1 in a tool = the old game).
//   - a burst pipe whose valve is still open shuts itself after STEAMFIX.SEAL_AFTER seconds (modules.sealBursts) and says so; a hammer mends it and it opens again (modules.repair); an open burst pipe puffs steam so the leak can be seen
//   - the engines ease off while the helm pumps hard and the line is low: the pump is served first (easeEngines, read by shipSim.js where the steam use is added up)
//   - a warning ladder before FALLING, each rung said once in a while: LOW ON COAL -> LOW STEAM -> SINKING (NO STEAM / NOBODY AT THE HELM) -> FALLING (goingDown.js)
// It only says things and moves valves: nothing here changes how the ship flies except the pump and the engines' share of the steam (shipSim.js).
import { config } from '../../config.js';
import { bunkerEmpty } from './goingDown.js';

export function createSteamFix({ state, ship, modules, structure, goingDown, shipPuff, hasKind }) {
  const F = () => config.STEAMFIX;
  const on = () => F().ENABLED && !ship.ai && !ship.piece && !config.PVP.ENABLED && structure.on();
  let clock = 0;
  const rungs = { fuel: { at: -1e9, armed: true }, press: { at: -1e9, armed: true }, sink: { at: -1e9, armed: true } }; // (when each rung last spoke, and whether the reading has recovered since)
  state.steamWarn = { fuel: 0, press: 0, sink: 0, sealed: 0 }; // (how often each rung spoke, and how many burst pipes shut themselves: read by the tools)

  // One rung: speaks when `bad` and armed and its wait is over; re-arms when `good` (the reading has come back by REARM).
  const rung = (key, bad, good, kind, text, pri, at) => {
    const r = rungs[key], W = F().WARN;
    if (good) r.armed = true;
    if (!bad || !r.armed || clock - r.at < W.EVERY) return;
    r.armed = false;
    r.at = clock;
    state.steamWarn[key]++;
    state.say(kind, text, pri, W.HOLD, at);
  };

  // Where the steam is going to a pump that cannot have it: the engines take their share of the line (the pump comes first while she sinks and is being pumped).
  const easeEngines = () => {
    const E = F();
    return on() && state.gasValve && state.gasValve.input >= E.EASE_AT && state.ship.press < E.EASE_BELOW ? E.EASE : 1;
  };

  // The firebox damper: past DAMPER the fire is drawn down in proportion to how far the line is from 100, so an idle ship's boiler settles near the top of OVERDRIVE instead of running away to the blowout
  // (a burst pipe's leak used to hide this: with the leaks mended the pressure climbed and the boiler blew).
  const damper = () => { const E = F(); return on() && state.ship.press > E.DAMPER ? Math.max(0, (100 - state.ship.press) / (100 - E.DAMPER)) : 1; };

  const update = (dt) => {
    if (!on()) return;
    clock += dt;
    for (const m of modules.sealBursts(dt)) { // a pipe that has leaked SEAL_AFTER seconds shuts its own valve
      state.steamWarn.sealed++;
      shipPuff(m.pos.x, m.pos.y, '#ffffff', 8);
      state.sfxQ.push(['clang', false]);
      if (ship.main && !state.ship.down) state.say('steam', `${m.name.toUpperCase()} BURST! ITS VALVE SHUT ITSELF - MEND IT WITH A HAMMER`, 4, 3.5, { deck: m.d, role: 'boiler' });
    }
    for (const m of modules.list) if (m.kind === 'pipe' && m.broken && m.open && Math.random() < dt * 6) shipPuff(m.pos.x + (Math.random() - 0.5) * 24, m.pos.y - 10, '#ffffff', 2); // (a burst pipe jets steam: the leak can be seen)
    if (!ship.main || state.ship.down || state.phase !== 'flying' || goingDown.active()) return;
    const W = F().WARN, S = state.ship, lw = state.liftWeight, short = lw ? lw.weight - lw.lift : 0;
    const boilerLit = hasKind('boiler') && modules.boilerUp();
    rung('fuel', boilerLit && hasKind('coal') && !bunkerEmpty(state) && S.fuel < W.FUEL, S.fuel > W.FUEL + W.REARM || !boilerLit, 'steam', 'LOW ON COAL - STOKE THE BOILER!', 5, { role: 'boiler' });
    rung('press', boilerLit && S.press < W.PRESS, S.press > W.PRESS + W.REARM || !boilerLit, 'steam', (state.steamParts && state.steamParts.leaks > 3) ? 'STEAM LEAKING - SHUT THE VALVE OR MEND THE PIPE!' : 'LOW STEAM - STOKE THE BOILER!', 5, { role: 'boiler' });
    const helmIn = Object.values(state.players).some((p) => p.lock && !p.mate && p.connected !== false && p.lock === modules.list.find((m) => m.kind === 'helm')?.name);
    const sinking = short > W.SINK && (S.vy || 0) < -config.STRUCTURE.LIFT.SINK_VY;
    const starved = S.press < W.PRESS || !helmIn;
    rung('sink', sinking && starved, short < W.SINK / 2, 'helm', helmIn ? 'SINKING - NO STEAM TO PUMP! STOKE THE BOILER!' : 'SINKING - NOBODY AT THE HELM!', 6, { role: 'helm' });
  };

  // How fast the coal burns: a little slower than it used to (STEAMFIX.BURN_MUL), so a stoker who is busy for a minute does not find the firebox cold.
  const burnMul = () => (on() ? F().BURN_MUL : 1);

  return { update, easeEngines, damper, burnMul, on };
}
