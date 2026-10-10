// Pointed engines (Phase S.5h). Every engine pod has a direction (shipBuild.js thrustVec: 0 forward, -PI/2 up, PI/2 down, PI back); a swivel mount lets a crew member turn it in flight.
//   state.engines   one { name, dir (now), home (as built), swivel, fwd, up (shares of its thrust, -1..1), x, d } per engine of the layout
//   state.thrust    { factor, back, drive } what the engines make of the helm's throttle:
//                     factor  top speed as a share of full (the old "working engines / engines"): the forward thrust of the working engines over the drive engines (those built to push
//                             forward, config.ENGINES.DRIVE_COS), at least NO_ENGINE_SPEED. Engines pointing back take thrust away. Up / down engines do not count (nor cost speed).
//                     back    the share of full power pushing astern (back-pointing engines): stronger reverse
//                     drive   some engine still points ahead (otherwise she goes where the wind does)
//   vertical thrust a working engine pointing up (or down) pushes her up (down) by ENGINES.LIFT_GAS gas points of lift at full steam TIMES ITS OWN THROTTLE (e.pow): climb without gas. It is applied as a
//                   force at the engine's place (forces.js), so an engine at the nose pointing up lifts the nose too. It burns steam (modules.js drainParts, shipBuild.js engineUse).
//   throttles       every engine has its own throttle: e.thr (what the helm set, -REVERSE..1) and e.pow (what it is running at; it chases the target at THR_RATE so the phone's levers glide).
//                   LINKED (state.thrust.split false, the default): the helm's lever (state.ship.order) is the throttle of every DRIVE engine (one pointing within DRIVE_COS of ahead and no more than LEVER_UP up or down); lift, dive and
//                   astern engines run flat out, as they always did. The speed model is the old one, unchanged. AUTO-TRIM: while the helm stick is up or down (state.ship.trim) the engines whose push
//                   tips the nose the way the stick says get TRIM_MIX more throttle and the others less (a zero-sum shift inside one kind of engine, lift or drive), so the speed stays and the nose follows.
//                   SPLIT (state.thrust.split true): each engine runs at its own e.thr, and the speed she is ordered is the sum of their forward parts over the drive engines (splitOrder).
//                   command() is the phone's SPLIT / LINK / lever messages (network.js). The throttles live on the SHIP, so a new helmsman inherits them.
//   thrust moment   every working engine also pushes forward (e.fwd x e.pow x THRUST_MOMENT px/s^2) AT ITS PLACE, with the sideways torque left in (forces.js, unbalanced): an engine hung below the
//                   centre of mass tips the nose UP when it pushes ahead, one above it tips the nose down. It adds no speed (the speed model above does that).
//   swivel          a station of kind 'swivel' beside an engine: the stick turns the engine (ENGINES.SWIVEL_RATE) within SWIVEL_ARC of the way it was built.
// A ship whose engines all point forward is exactly the old ship (factor = working / engines, no vertical thrust).
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { thrustVec, dirName } from './shipBuild.js';
import { applyForce, forcesOf } from './forces.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createEngines({ state, modules }) {
  const E = config.ENGINES;
  const layout = mainShip(state).layout; // (this ship's own layout)
  state.engines = [];
  state.thrust = { factor: 1, back: 0, drive: true, drivers: 2, split: false, trim: 0, botSplit: false }; // (split: each engine runs at its own throttle; trim: the auto-trim shift in use, -1..1; botSplit: a bot at the helm split them to level her)
  state.engineStats = { turnSecs: 0, mannedSecs: 0, splitSecs: 0 }; // (botsim and the gate: how much the swivels were used, how long the throttles were split)
  let version = -1, drivers = 1;

  const sync = () => {
    const L = layout;
    if (version === L.version && state.engines.length === L.engines.length) return;
    version = L.version;
    const old = new Map(state.engines.map((q) => [q.name, q])); // (an engine that is still there after a build change - a part broke off, S.5i - stays pointed where the crew turned it, and keeps its throttle)
    state.engines = L.engines.map((e, i) => { const o = old.get(e.name); return { name: e.name, i, d: e.d, x: e.x, dir: o && o.home === (e.dir || 0) ? o.dir : e.dir || 0, home: e.dir || 0, swivel: !!e.swivel, fwd: 1, up: 0, thr: o ? o.thr : 1, pow: o ? o.pow : null }; });
    drivers = Math.max(1, state.engines.filter((e) => thrustVec(e.home).fwd >= E.DRIVE_COS).length); // (counted as built: turning one up does not make the others "all there is")
  };
  const byName = (name) => state.engines.find((e) => e.name === name);
  const clampThr = (v) => clamp(v, -config.SHIP.REVERSE, 1);
  const isDrive = (e) => e.fwd >= E.DRIVE_COS && Math.abs(e.up) <= E.LEVER_UP; // (pointing ahead right now, and not much up or down: the helm's lever is its throttle; a lifting engine runs flat out)
  const leverNow = () => clampThr(state.ship.order !== undefined ? state.ship.order : state.ship.speed); // (the helm's lever: the speed ordered)

  // The forces one engine puts on the ship at throttle `pow` (`k`: steam and the sky's share of its lift): the lift of its vertical part and the forward push, both where the engine sits.
  const pushes = (e, pow, k) => {
    const v = thrustVec(e.dir), y = layout.platforms[e.d].y + E.BODY_DY, out = [];
    if (v.up) out.push({ x: e.x, y, fx: 0, fy: -v.up * pow * E.LIFT_GAS * config.GAS.LIFT * k, linear: true, balanced: true, source: 'engine' }); // (up positive: an acceleration)
    if (v.fwd) out.push({ x: e.x, y, fx: v.fwd * pow * E.THRUST_MOMENT, fy: 0, balanced: false, source: 'engine' }); // (speed is the flight model's; this one is the twist of pushing from a place off the centre of mass)
    return out;
  };

  // How much a unit of each engine's throttle tips the nose UP, -1..1 (from the same forces the ship feels, about her live centre of mass), centred inside each kind of engine (lift or drive) so that
  // shifting throttle by these weights moves the nose without adding or taking away push. All zero when the engines are alike (the classic pair).
  const noseWeights = () => {
    const raw = state.engines.map((e) => (e.works === false ? 0 : -forcesOf(state, pushes(e, 1, 1)).torque));
    const kind = state.engines.map((e) => (Math.abs(e.up) > Math.abs(e.fwd) ? 1 : 0));
    const w = raw.map((r, i) => {
      const mates = raw.filter((q, j) => kind[j] === kind[i] && state.engines[j].works !== false);
      return state.engines[i].works === false ? 0 : r - mates.reduce((n, q) => n + q, 0) / (mates.length || 1);
    });
    const top = Math.max(...w.map(Math.abs));
    return top < 1e-6 ? w.map(() => 0) : w.map((x) => x / top);
  };
  // The throttle each engine would run at if its lever stood at `base[i]` and the nose were asked to go `nose` (-1..1, + = up) by `mix`: the nose-up ones more, the others less, 0..1 (astern levers stay).
  const biased = (base, nose, mix) => {
    const w = nose ? noseWeights() : null;
    return base.map((b, i) => (w && b >= 0 ? clamp(b + mix * nose * w[i], 0, 1) : b));
  };
  // Where the levers stand with nobody fiddling: split = what the helm set; linked = the lever for the drive engines and flat out for the rest.
  const baseThr = () => state.engines.map((e) => (state.thrust.split ? e.thr : isDrive(e) ? leverNow() : 1));
  // The speed ordered by the engines' own throttles (SPLIT): the sum of their forward parts over the drive engines, the same scale as the helm's lever.
  const splitOrder = () => clampThr(state.engines.reduce((n, e) => n + (e.works === false ? 0 : e.thr * e.fwd), 0) / drivers);

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
    }
    T.factor = Math.max(config.MODULES.NO_ENGINE_SPEED, Math.min(1, (fwd - back) / drivers)); // (engines pointing back take thrust away)
    T.back = Math.min(1, back / drivers);
    T.drivers = drivers; // (how many engines were built to push ahead: flight.js gives a ship with more than two of them the push to match)
    T.drive = drive;
    // The throttles. Linked: the lever drives the drive engines and the rest run flat out, then the auto-trim shifts them (zero-sum); split: each runs at what the helm set.
    T.trim = T.split ? 0 : state.ship.trim || 0;
    if (!T.split) for (const e of state.engines) e.thr = isDrive(e) ? leverNow() : 1;
    else state.engineStats.splitSecs += dt;
    const goal = T.trim ? biased(baseThr(), T.trim, E.TRIM_MIX) : baseThr();
    const step = E.THR_RATE * dt;
    for (const e of state.engines) {
      e.pow = e.pow == null ? goal[e.i] : e.pow + clamp(goal[e.i] - e.pow, -step, step); // (the engine spools up and down; the phone's lever glides with it)
      if (e.works && flying) for (const f of pushes(e, e.pow, pf * eng)) applyForce(state, f);
    }
  };

  // The phone's engine messages (network.js): SPLIT / LINK and the levers. `lever` is the main lever's setting, which LINK sets every engine to.
  const command = ({ split, thrs, lever } = {}) => {
    const T = state.thrust;
    if (split === true && !T.split) { for (const e of state.engines) e.thr = e.pow != null ? e.pow : e.thr; T.split = true; } // (start from what they are doing)
    else if (split === false && T.split) { state.ship.order = Number.isFinite(lever) ? clampThr(lever) : splitOrder(); T.split = false; } // (back to following the lever)
    if (T.split && Array.isArray(thrs)) thrs.forEach((v, i) => { if (state.engines[i] && Number.isFinite(v)) state.engines[i].thr = clampThr(v); });
  };

  // What the helm's phone shows (ui.eng): null with fewer than two engines; else the throttle of each engine left to right as she looks on the screen (f: which way she faces, 1 = bow on the right),
  // with the way it points on the screen in degrees: [engine index, throttle (0.05 steps), angle, works].
  const panel = (f = 1) => {
    if (state.engines.length < 2) return null;
    const round = (v) => Math.round(v * 20) / 20;
    const list = state.engines.slice().sort((a, b) => (a.x - b.x) * f || a.i - b.i);
    return { s: state.thrust.split, lv: round(leverNow()), l: list.map((e) => [e.i, round(state.thrust.split || e.pow == null ? e.thr : e.pow), Math.round((Math.atan2(Math.sin(e.dir), Math.cos(e.dir) * f) * 180) / Math.PI), e.works === false ? 0 : 1]) };
  };

  // The throttles that tip the nose `nose` (-1..1, + = up) by `mix` from where the levers stand now (a bot levelling the ship): the nose-up engines more, the others less.
  const levelThrottles = (nose, mix = E.LEVEL_MIX) => biased(state.engines.map((e) => (isDrive(e) ? leverNow() : 1)), nose, mix); // (from where the LINKED levers would stand, so it is a steady push and not a ratchet)

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

  return { update, turn, status, byName, sync, command, panel, splitOrder, levelThrottles, noseWeights };
}
