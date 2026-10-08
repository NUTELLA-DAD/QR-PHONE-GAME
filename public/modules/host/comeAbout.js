// COME ABOUT (MOVEMENT.md, M.3): turning the ship round. Node-safe: no DOM.
//
// Only on the helmsman's command: the phone's COME ABOUT button held for config.SHIP.TURN.HOLD seconds, or the stick held hard astern for as long (people only; a bot
// holds the same command from bots.js when config.SHIP.TURN.BOT_TURNS is on). Refused (a toast on the helm's phone, a line on the TV for the main ship) when she is
// going too fast, already turning or cooling down, falling, has a gunship alongside, has someone on a hookshot line, or would turn her hull into rock or into another ship.
//
// The manoeuvre takes TURN.TIME seconds. pose.turn runs 0..1; the picture squashes through zero width (render.js) and comes out mirrored. At the middle pose.f flips and
// her speed along her bow flips with it, so her velocity over the ground (f * speed) stays the same and she carries on drifting the way she was going while the bow comes
// round. Her speed is held under TURN.MAX_SPEED throughout, the guns cannot fire (shipSim.js), the camera holds its zoom (camera.js). Her crew keep walking: ship space is
// never mirrored; a person's stick is screen-relative (network.js keeps the raw stick in player.jxs and this file redoes player.jx = jxs * f at the flip).
//
// State: state.turning = { hold, ask, who, t, cd, msgCd, flipped }
//   hold     seconds the command has been held (0..HOLD): the TV and the phone draw a ring from it
//   ask/who  someone is asking this step (set by ask() in the crew stage), and who
//   t        seconds into the manoeuvre (0 = not turning)
//   cd       seconds until she may turn again
import { config } from '../../config.js';
import { tilt } from './course.js';
import { solidAt } from './maps.js';
import { overlapsAnother } from './shipCollide.js';
import { pivotOf } from './pose.js';

export function createComeAbout(ship, W, { goingDown }) {
  const state = ship.ctx;
  const T = config.SHIP.TURN;
  const g = (state.turning = { hold: 0, ask: false, who: null, t: 0, cd: 0, msgCd: 0, flipped: false });
  const pose = ship.pose;
  const say = (who, text) => {
    if (who) W.phoneFx(who, text, [60, 60, 60]);
    if (ship.main && (!who || !who.bot)) {
      state.ev.warn = 1.8;
      state.ev.warnText = text.toUpperCase();
    }
  };

  // Would the hull sit in rock once the ship faced the other way? (the outline points, mirrored about the middle of her bounds, each with a little clear air round it)
  const mirroredInRock = () => {
    const map = state.course && state.course.map;
    if (!map) return false;
    const P = pivotOf(ship);
    const fn = -pose.f;
    const m = T.MARGIN;
    for (const [sx0, sy0] of ship.layout.samples) {
      const [sx, sy] = tilt(state, sx0, sy0);
      const x = pose.x + P + fn * (sx - P);
      const y = pose.y + sy;
      if (solidAt(map, x, y) || solidAt(map, x - m, y) || solidAt(map, x + m, y) || solidAt(map, x, y - m) || solidAt(map, x, y + m)) return true;
    }
    return false;
  };

  // Why she may not turn now (or null).
  const why = () => {
    if (g.t > 0) return 'Already coming about';
    if (state.ship.down > 0 || state.wreck) return 'Not now';
    if (state.phase !== 'flying') return 'Cast off first';
    if (goingDown.active()) return "Can't come about while she is falling";
    if (!(state.course && state.course.map)) return 'No room to come about here';
    if (g.cd > 0) return 'Wait - she is still settling';
    if (state.gunship) return "Can't come about with the gunship alongside";
    if (Object.values(state.players).some((p) => p.hook)) return 'Someone is on a hookshot line';
    if (Math.abs(state.ship.speed) > T.MAX_SPEED) return 'Slow down to come about';
    if (mirroredInRock()) return 'No room to come about here';
    if (overlapsAnother(state, ship, -pose.f)) return 'Another ship is in the way'; // (her mirrored hull would sit inside another ship: shipCollide.js)
    return null;
  };

  const start = (who) => {
    g.t = 1e-4;
    g.flipped = false;
    g.hold = 0;
    pose.turn = g.t / T.TIME;
    if (ship.main) {
      state.ev.warn = T.TIME;
      state.ev.warnText = 'COMING ABOUT!';
    }
    state.sfxQ.push(['comeabout']);
    if (who) W.phoneFx(who, 'Coming about!', [40, 40, 120]);
  };

  // The crew stage: someone is asking for the turn this step (a held button, or the stick held astern).
  const ask = (player) => {
    g.ask = true;
    g.who = player;
  };
  // ...called at the start of the crew stage (nobody has asked yet) and at the end (the hold counts up, and the command goes through when it has been held long enough).
  const begin = () => {
    g.ask = false;
  };
  const hold = (dt) => {
    g.msgCd = Math.max(0, g.msgCd - dt);
    if (g.t === 0) g.cd = Math.max(0, g.cd - dt);
    if (g.ask && g.t === 0) {
      g.hold = Math.min(T.HOLD, g.hold + dt);
      if (g.hold >= T.HOLD) {
        const reason = why();
        if (reason) {
          g.hold = 0;
          if (g.msgCd <= 0) {
            g.msgCd = T.REFUSE_COOLDOWN;
            say(g.who, reason);
          }
        } else start(g.who);
      }
    } else g.hold = Math.max(0, g.hold - dt * 3);
  };

  // The systems stage, after her speed has been worked out: hold her speed down, flip at the middle, finish.
  const fly = (dt) => {
    if (g.t === 0) return;
    g.t += dt;
    const sh = state.ship;
    sh.speed = Math.max(-T.MAX_SPEED, Math.min(T.MAX_SPEED, sh.speed)); // (she brakes to the speed a turn is allowed at)
    if (!g.flipped && (g.t >= T.TIME / 2 || sh.down > 0)) {
      g.flipped = true;
      pose.f = -pose.f;
      sh.speed = 0 - sh.speed - 2 * (state.sailPush || 0); // (what she covers over the ground, f * (speed + sails), is the same either side of the flip)
      sh.accelX = 0 - (sh.accelX || 0);
      for (const p of Object.values(state.players)) if (!p.bot) p.jx = (p.jxs || 0) * pose.f; // (a person's stick is on the screen: along the ship it is the other way now)
    }
    pose.turn = Math.min(1, g.t / T.TIME);
    if (g.t >= T.TIME || sh.down > 0) {
      g.t = 0;
      g.cd = T.COOLDOWN;
      g.hold = 0;
      pose.turn = 0;
    }
  };

  // A new game, mission or rebuilt ship: facing right, not turning.
  const reset = () => {
    Object.assign(g, { hold: 0, ask: false, who: null, t: 0, cd: 0, msgCd: 0, flipped: false });
    pose.f = 1;
    pose.turn = 0;
  };

  return { ask, begin, hold, fly, reset, why, active: () => g.t > 0 };
}
