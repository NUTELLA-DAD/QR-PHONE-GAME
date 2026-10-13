// F10 (FUN.md, config.CONTROLS.ROLE_CARDS): the verb of a job - what the crewman has to DO, in one or two words - and the test for "show it over his head on the TV".
// The verb comes from the job's kind (the first word of the label says the same: FIRE -> SPRAY, HULL -> PATCH, AMMO -> LOAD, COAL -> STOKE ...); a job whose tool or load must be fetched first
// is GRAB until it is in hand. jobs.js sets p.job.verb; render.js (2D, and the 2D layer over the 3D view) draws it; the phone shows it in the ? card.
import { config } from '../../config.js';

export const VERBS = { fire: 'SPRAY', hole: 'PATCH', gas: 'PATCH', repair: 'PATCH', leak: 'PATCH', frame: 'PATCH', ice: 'PATCH', unclog: 'PATCH', ammo: 'LOAD', coal: 'STOKE', helm: 'TAKE THE HELM',
  revive: 'HELP', help: 'HELP', winch: 'HELP', heal: 'HEAL', fight: 'FIGHT', hack: 'FIGHT', swat: 'FIGHT', rod: 'GRAB', stow: 'GRAB', shovel: 'SHOVEL', dump: 'DUMP', vent: 'VENT', hatch: 'PULL', cut: 'CUT', pump: 'PUMP', oxygen: 'PUMP', trim: 'TRIM', sail: 'SAIL', reef: 'SAIL', abandon: 'JUMP', pickup: 'PICK UP',
  crank: 'CRANK', plant: 'PLANT', sabotage: 'SABOTAGE', light: 'LIGHT', free: 'FREE', steal: 'STEAL', // (CASTLE.md A1: the away team's objectives, objectives.js)
  chest: 'GRAB', carry: 'CARRY', stowchest: 'STOW', scrappatch: 'PATCH', scrapgrab: 'GRAB' }; // (CASTLE.md A2: the outposts' treasure, treasure.js: grab a chest, carry it to the rope, stow it in the hold)
export const FIRST_WORD = { FIRE: 'SPRAY', HULL: 'PATCH', REPAIR: 'PATCH', AMMO: 'LOAD', COAL: 'STOKE', STOKE: 'STOKE', HELP: 'HELP', REVIVE: 'HELP', TAKE: 'TAKE THE HELM', RAIDER: 'FIGHT' };

export function verbOf(kind, label, fetching) {
  if (fetching) return 'GRAB';
  return VERBS[kind] || FIRST_WORD[String(label || '').split(/[\s-]/)[0].toUpperCase()] || 'GRAB';
}

// The verb to draw over a crewman's head, or null: he has a job on offer and has been free (no station, nothing to work) for more than VERB_AFTER seconds.
export function idleVerb(p) {
  const R = config.CONTROLS.ROLE_CARDS;
  return R && R.ENABLED && !p.bot && !p.enemy && p.connected !== false && p.job && p.job.verb && (p.freeT || 0) > R.VERB_AFTER ? p.job.verb : null;
}
