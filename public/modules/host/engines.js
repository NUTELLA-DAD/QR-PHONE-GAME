// Pointed engines (Phase S.5h). Every engine pod has a direction (shipBuild.js thrustVec: 0 forward, -PI/2 up, PI/2 down, PI back); a swivel mount lets a crew member turn it in flight.
//   state.engines   one { name, dir (now), home (as built), swivel, fwd, up (shares of its thrust, -1..1), x, d } per engine of the layout
//   state.thrust    { factor, back, drive } what the engines make of the helm's throttle:
//                     factor  top speed as a share of full (the old "working engines / engines"): the forward thrust of the working engines over the drive engines (those built to push
//                             forward, config.ENGINES.DRIVE_COS), at least NO_ENGINE_SPEED. Engines pointing back take thrust away. Up / down engines do not count (nor cost speed).
//                     back    the share of full power pushing astern (back-pointing engines): stronger reverse
//                     drive   some engine still points ahead (otherwise she goes where the wind does)
//   vertical thrust a working engine pointing up (or down) pushes her up (down) by ENGINES.LIFT_GAS gas points of lift at full steam, whatever the throttle: climb without gas. It is applied as a
//                   force at the engine's place (forces.js), so an engine at the nose pointing up lifts the nose too. It burns steam (modules.js drainParts, shipBuild.js engineUse).
//   swivel          a station of kind 'swivel' beside an engine: the stick turns the engine (ENGINES.SWIVEL_RATE) within SWIVEL_ARC of the way it was built.
// A ship whose engines all point forward is exactly the old ship (factor = working / engines, no vertical thrust).
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { thrustVec, dirName } from './shipBuild.js';
import { applyForce } from './forces.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createEngines({ state, modules }) {
  const E = config.ENGINES;
  const layout = mainShip(state).layout; // (this ship's own layout)
  state.engines = [];
  state.thrust = { factor: 1, back: 0, drive: true, drivers: 2 };
  state.engineStats = { turnSecs: 0, mannedSecs: 0 }; // (botsim and the gate: how much the swivels were used)
  let version = -1, drivers = 1;

  const sync = () => {
    const L = layout;
    if (version === L.version && state.engines.length === L.engines.length) return;
    version = L.version;
    const old = new Map(state.engines.map((q) => [q.name, q])); // (an engine that is still there after a build change - a part broke off, S.5i - stays pointed where the crew turned it)
    state.engines = L.engines.map((e, i) => ({ name: e.name, i, d: e.d, x: e.x, dir: old.has(e.name) && old.get(e.name).home === (e.dir || 0) ? old.get(e.name).dir : e.dir || 0, home: e.dir || 0, swivel: !!e.swivel, fwd: 1, up: 0 }));
    drivers = Math.max(1, state.engines.filter((e) => thrustVec(e.home).fwd >= E.DRIVE_COS).length); // (counted as built: turning one up does not make the others "all there is")
  };
  const byName = (name) => state.engines.find((e) => e.name === name);

  // Every frame: the thrust of the working engines. Called just before the balance / forces update, so the speed cap and the climb are ready for this frame.
  const update = (dt) => {
    sync();
    const T = state.thrust, flying = state.phase === 'flying' && !state.ship.down;
    if (!state.engines.length) { T.factor = 1; T.back = 0; T.drive = false; return; }
    let fwd = 0, back = 0, drive = false;
    const pf = clamp(state.ship.press / 50, 0.05, 1);
    const eng = (state.env && state.env.engine) || 1; // (spores clog engines: fungal)
    for (const e of state.engines) {
      const v = thrustVec(e.dir);
      e.fwd = v.fwd;
      e.up = v.up;
      if (Math.abs(v.fwd) > 0.05) drive = true; // (an engine pointing back still gives her a throttle: astern)
      const works = modules.works(state, e.name);
      e.works = works;
      if (!works) continue;
      if (v.fwd > 0) fwd += v.fwd; else back -= v.fwd;
      if (v.up && flying) {
        const accel = v.up * E.LIFT_GAS * config.GAS.LIFT * pf * eng; // up positive
        applyForce(state, { x: e.x, y: layout.platforms[e.d].y + E.BODY_DY, fx: 0, fy: -accel, linear: true, balanced: true, source: 'engine' });
      }
    }
    T.factor = Math.max(config.MODULES.NO_ENGINE_SPEED, Math.min(1, (fwd - back) / drivers)); // (engines pointing back take thrust away)
    T.back = Math.min(1, back / drivers);
    T.drivers = drivers; // (how many engines were built to push ahead: flight.js gives a ship with more than two of them the push to match)
    T.drive = drive;
  };

  // A person (or a bot) at a swivel crank: the stick turns the engine toward where it points, within the mount's arc.
  const turn = (player, dt) => {
    const st = layout.stations.find((s) => s.n === player.lock);
    const e = st && byName(st.eng);
    if (!e) return;
    state.engineStats.mannedSecs += dt;
    if (Math.hypot(player.jx || 0, player.jy || 0) < E.SWIVEL_STICK) return;
    const want = e.home + clamp(angleDiff(Math.atan2(player.jy, player.jx), e.home), -E.SWIVEL_ARC, E.SWIVEL_ARC);
    const step = clamp(angleDiff(want, e.dir), -E.SWIVEL_RATE * dt, E.SWIVEL_RATE * dt);
    e.dir = Math.atan2(Math.sin(e.dir + step), Math.cos(e.dir + step));
    state.engineStats.turnSecs += Math.abs(step) / E.SWIVEL_RATE;
  };

  // The phone's status line at a swivel crank.
  const status = (name) => {
    const st = layout.stations.find((s) => s.n === name);
    const e = st && byName(st.eng);
    if (!e) return '';
    if (!e.works) return `${e.name} is out (no steam or broken): it does not push`;
    return `${e.name} points ${dirName(e.dir).toUpperCase()}${e.fwd > 0.05 ? ` - ahead ${Math.round(e.fwd * 100)}%` : ''}${e.up > 0.05 ? ` - lifting ${Math.round(e.up * 100)}%` : e.up < -0.05 ? ` - diving ${Math.round(-e.up * 100)}%` : ''}. Stick: point it`;
  };

  return { update, turn, status, byName, sync };
}
