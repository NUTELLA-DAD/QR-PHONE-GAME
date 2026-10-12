// F4 "Guns that matter" (FUN.md): the small shared helpers. Pure reads of the state, no state of their own.
//   stopColumn(state)           the number of the stop in the voyage, from 1 (a single mission, as the tools fly it, has no stop and counts as late: 99), as fire.js counts it
//   aimedSide(state, fb, mirror) the side of the ship where the most guns are manned and have been idle longest (links.js state.links.aim), as -1 / +1 in SHIP space (times `mirror`, e.g. ship.pose.f for
//                                a world side), else `fb`; PACING.AIM_CHANCE of the time, so the odd one still comes from the other side
//   isMothballed(state, name)   a station left under its cover for a small crew (CREW_SEATS, links.js state.links.moth)
import { config } from '../../config.js';

export const stopColumn = (state) => config.PACING.FORCE_COLUMN || (state.course && state.course.stop ? state.course.stop.col + 1 + ((state.run && state.run.base) || 0) : 99);

export function aimedSide(state, fb, mirror = 1) {
  const PC = config.PACING;
  const a = PC.AIM_AT_GUNS && state.links && state.links.aim ? state.links.aim.side : 0;
  if (!a || Math.random() >= PC.AIM_CHANCE) return fb;
  return a * mirror;
}

export const isMothballed = (state, name) => !!(state.links && state.links.moth && state.links.moth[name]);
