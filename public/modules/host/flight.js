// FLIGHT (MOVEMENT.md, M.4): forces drive every ship's pose. One integrator per ship, used by co-op ship 0, any extra ship and every Versus ship alike (shipSim.js makes one for each).
// Node-safe: no DOM. Everything is PER SHIP and reads only her own context (`state` = ship.ctx) and handle.
//
//   Along her bow (state.ship.speed is the body-frame velocity u as a share of SHIP.TOP_SPEED, the one number the HUD, the bots and the rock code read and write):
//       a = ( engines + sails - drag ) / weight          (accelerations quoted at MOTION.REF_MASS; a heavier ship is slower to respond, a lighter one quicker)
//     engines  the helm's lever is a speed ORDER (state.ship.order, a share of full speed: ahead is positive, astern negative). The engines open until she holds it: the push that
//              cancels the drag at that speed, plus MOTION.GOVERN times the speed error, within what the working engines can make (MOTION.THRUST ahead at full steam, BRAKE astern).
//              Which engines work, how much steam there is, a tail-heavy drag, overdrive, a spore-clogged engine and the Aether's strong ones are all in the figures
//              (engines.js `thrust`, balance.js `slow`, the boiler's overdrive, state.env). The order itself cannot be more than the working engines allow.
//     sails    each raised sail pushes with its pull (sails.js sailPush) x MOTION.SAIL_PUSH; the helm's order allows for the canvas, so the sails add their speed on top.
//     drag     partly linear, partly quadratic in the speed relative to the AIR, which the wind carries along the world (sails.js windSpeed): a ship with no engines, no steam or no
//              engine pointing ahead has nothing to push back and settles at the speed of the wind. A ship facing left meets the wind from the other side (f).
//   Up and down (state.ship.vy, the climb): the gasbags' buoyancy (per bag, as the lift-weighted gas), the trim engine, the balance push, engines pointing up or down (forces.js vyAcc),
//     less the drag on the climb (GAS.DRAG) - all divided by her weight too.
//   Pitch: the climb and the speeding up tilt the nose, the rest trim, the going-down tilt and the forces at places (engines, sails, hits, a crowd: forces.js theta, which swings on its
//     own spring) add; the nose follows at TILT_SMOOTH.
//   Weight: the build's own (balance.js mass: parts, in gas points) plus what moves (crew, coal, shells, bombs: balance.js live). A giant build is heavy, a Sparrow nimble.
// The position and the world velocity follow: course.js `advance` moves pose.x by f * u every step, pose.y by the climb here, and pose.vx is f * u (pose.js), continuous through a
// COME ABOUT because u flips sign at the flip.
import { config } from '../../config.js';
import { altBounds } from './course.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createFlight({ state, ship }) {
  const pose = ship.pose;
  const body = state.ship;

  // How much she weighs (gas points) and how quickly she responds compared with the figures' ship: 1 at REF_MASS, more for a lighter ship, less for a heavier.
  const massOf = () => { const b = state.balance || {}; return Math.max(1, (b.mass || config.SHIP.MOTION.REF_MASS) + (b.live || 0)); };
  const respond = () => { const P = config.SHIP.MOTION; return clamp(P.REF_MASS / massOf(), P.MASS_SCALE_MIN, P.MASS_SCALE_MAX); };
  // A COME ABOUT takes longer for a heavy ship (comeAbout.js).
  const turnScale = () => { const P = config.SHIP.MOTION; return clamp(Math.pow(massOf() / P.REF_MASS, P.TURN_MASS), P.TURN_MIN, P.TURN_MAX); };

  // The speed ordered (a share of full speed). Until the helm is touched she holds the speed she has.
  const order = (want) => {
    if (want === undefined) return body.order !== undefined ? body.order : body.speed;
    body.order = want;
    return want;
  };

  // The air drag on her at body-frame velocity `rel` (px/s) relative to the air, as an acceleration (positive = against motion ahead).
  const dragAcc = (rel) => {
    const P = config.SHIP.MOTION, TOP = config.SHIP.TOP_SPEED, x = rel / TOP;
    return P.DRAG * (P.DRAG_LIN * Math.abs(x) + (1 - P.DRAG_LIN) * x * x) * Math.sign(x);
  };

  // One step along her bow. wind: how fast the wind carries a ship (a share of top speed, sails.js windSpeed); driven: some working engine pushes ahead or astern (otherwise nothing but
  // the air and the sails move her); helm: how well the helmsman can work the engines (envDeep.js helmMul).
  const surge = (dt, { wind, driven, helm = 1 }) => {
    const P = config.SHIP.MOTION, SH = config.SHIP, TOP = SH.TOP_SPEED;
    const T = state.thrust, bal = state.balance, env = state.env || {};
    const v0 = body.speed * TOP;
    const sc = respond();
    const pf = clamp(body.press / 50, 0.05, 1); // (steam: the engines make less below half pressure)
    const avail = driven ? pf * T.factor * (1 - bal.slow) : 0; // (the share of full power the working engines can make; a tail-heavy ship drags her tail)
    const boost = 1 + config.BOILER.OD_ENGINE * (state.overdrive || 0) + config.LINKS.SURGE.ENGINE * (state.surgeEngine || 0); // (overdrive steam and a boiler surge: faster engines)
    const sky = ((state.rig && !state.rig.powered ? 1 : env.engine) || 1) * (1 - (env.drag || 0)); // (spores clog the engines, the sea drags the whole ship)
    const sail = state.sailPush || 0; // (the sails' pull, a share of top speed)
    const gain = (env.accel ?? 1) * (state.links ? state.links.helmMul : 1) * helm; // (the Aether's engines are strong but its thin air weakens the helmsman; a lookout in the nest sharpens the helm)
    const airV = driven ? 0 : pose.f * wind * sky * TOP; // (the wind along the world, in her own frame. A ship with her engines going is a ship that fights it: the helm's order is her speed over the ground whichever way she faces, so a mirror ship is a fair ship; a ship with none is carried)
    const turning = state.turning && state.turning.t > 0;
    let aEng = 0;
    let target = v0;
    const fSail = sail * P.SAIL_PUSH;
    if (driven) {
      const maxRev = T.back > 0 ? Math.max(avail * SH.REVERSE, pf * T.back * (1 - bal.slow)) : avail * SH.REVERSE;
      const ordered = clamp(order(), -maxRev, avail); // (the helm cannot order more than the engines can make)
      target = (ordered * boost + sail) * sky * TOP;
      if (turning) target = clamp(target, -SH.TURN.MAX_SPEED * TOP, SH.TURN.MAX_SPEED * TOP); // (she brakes to the speed a turn is allowed at, comeAbout.js)
      const cap = P.THRUST * Math.max(1, (T.drivers || 2) / P.REF_ENGINES) * avail * boost * boost * sky * sky * gain; // (more steam, a faster engine: a push that grows with the square of the speed it is asked for; a ship built with more than REF_ENGINES engines has the push to match)
      aEng = clamp(dragAcc(target - airV) - fSail + P.GOVERN * gain * (target - v0), -P.BRAKE * gain, cap);
    }
    const k = (aEng + fSail - dragAcc(v0 - airV)) * sc;
    const v1 = v0 + k * dt;
    body.speed = v1 / TOP;
    body.accelX = dt > 0 ? (body.speed - v0 / TOP) / dt : 0;
    body.pace = (body.speed / (sky || 1) - sail) / boost; // (what the lever alone makes of her, without the sails, overdrive or the sky: the scale the helm's order is in; bots steer by it)
    return aEng;
  };

  // One step up and down. acc: everything that pushes her up (the gasbags' lift above or below the neutral fill, the trim engine, the balance push, engines pointing up or down), px/s^2
  // at the figures' weight. The climb's drag is the air's (GAS.DRAG). Keeps her inside the altitude window.
  const climb = (dt, acc) => {
    body.vy = (body.vy || 0) + (acc - (body.vy || 0) * config.GAS.DRAG) * respond() * dt;
    const bounds = altBounds(state);
    const hi = Math.max(bounds.hi, body.alt);
    pose.y -= body.vy * dt;
    if (body.alt > hi) {
      pose.y = -hi;
      body.vy = Math.min(0, body.vy);
    }
  };

  // The nose: up while climbing, down while diving; speeding up lifts it a touch, braking dips it (she has weight); plus the trim, the going-down tilt and what the forces at places
  // twist her by (forces.js theta). The tilt follows at TILT_SMOOTH, slower for a heavier ship.
  const pitch = (dt, extra = 0) => {
    const SH = config.SHIP;
    const climbRate = dt > 0 && state.lastAlt != null ? (body.alt - state.lastAlt) / dt : 0;
    state.lastAlt = body.alt;
    const want = body.down ? 0 : clamp(-climbRate * SH.TILT_PER_SPEED - (body.accelX || 0) * SH.PITCH_PER_ACCEL, -SH.TILT_MAX, SH.TILT_MAX) + extra + state.balance.restPitch + state.forces.theta;
    body.pitch = (body.pitch || 0) + (want - (body.pitch || 0)) * Math.min(1, dt * SH.TILT_SMOOTH * Math.pow(respond(), SH.MOTION.PITCH_RESPONSE));
  };

  return { order, surge, climb, pitch, massOf, respond, turnScale, dragAcc };
}
