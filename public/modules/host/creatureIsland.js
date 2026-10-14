// THE ISLAND ON THE TITAN'S BACK (BOSSES.md 2.7, C.6c): the novel part of the Island Titan. The island is a walkable GROUND that MOVES with the creature. ground.js (CASTLE.md A0) keeps it as a deck
// ({ island: true, moves: true, x0, x1, y }) in its list of decks, so everything the away team already does works on it: landing from a parachute, a hookshot swing, the crew cannon or a vault (the airborne provider),
// the rope ladder (it hangs down to the island's top when the ship hovers over it), walking (a man on it is carried by its movement every step), JUMP to leap off, the flare and the walk home.
//   islandOf(state)            the island as a deck record (null while the Titan is not up: arriving, dead, or not a Titan at all)
//   crystalOf(state)           the crystal on it: { part, x, y, alive }
//   islandAct(state, p, dt, ctl) / islandUi / islandJob     the Action button for a man on the island: HACK THE CRYSTAL (a hold: a sword is quickest), his phone's hint and gold arrow
//   islandBotGoal / islandTrip   what a tripping bot does there (tools: config.AWAY.BOT_TRIPS) and whether a trip is worth making
// The crystal is the Titan's heart (kind 'heart', hidden): no gun can touch it. Each completed hold is a STRIKE (config.CREATURES.TITAN.CRYSTAL); the last one wins the fight ('crystal').
import { config } from '../../config.js';
import { pop } from './popups.js';

const TT = () => config.CREATURES.TITAN;
const diffOf = (state) => state.difficulty || 'normal';
const isTitan = (cr) => !!cr && cr.kind === 'titan';
const up = (cr) => isTitan(cr) && !cr.dying && cr.mode === 'idle';

// The island as a deck: world x0..x1 and y (its walking surface), refreshed every step from the Titan's body.
export function islandOf(state) {
  const cr = state.creature;
  if (!up(cr)) return null;
  const I = TT().ISLAND, xa = cr.x + cr.f * I.X0, xb = cr.x + cr.f * I.X1;
  return { id: 'island', island: true, moves: true, x0: Math.min(xa, xb), x1: Math.max(xa, xb), y: cr.y + I.TOP, depth: I.DEPTH, cr };
}
export function crystalOf(state) {
  const cr = state.creature;
  if (!isTitan(cr)) return null;
  const part = cr.parts.find((q) => q.id === 'crystal');
  if (!part) return null;
  return { part, x: cr.x + cr.f * TT().CRYSTAL.X, y: cr.y + TT().ISLAND.TOP, alive: !part.dead && part.hp > 0 && !cr.dying };
}
const strikesOf = (state) => TT().CRYSTAL.STRIKES_BY_DIFF[diffOf(state)] ?? TT().CRYSTAL.STRIKES;

// The crystal is hurt by one stroke (a completed hold): STRIKES strokes break it. hurtCreature does the rest (the pool, the win 'crystal').
function strike(state, cr, c, p) {
  const C = TT().CRYSTAL, n = strikesOf(state), part = c.part;
  const before = part.hp;
  cr.hooks.hurt({ part, seg: 0 }, (part.maxHp / n) * 1.001, { who: p.id, src: 'sword' });
  cr.stats.struck = (cr.stats.struck || 0) + 1;
  const left = part.hp <= 0 ? 0 : Math.ceil(part.hp / (part.maxHp / n) - 0.01), done = n - left;
  pop(state, c.x, c.y - 360, part.hp <= 0 ? 'SHATTERED!' : 'CRACK! ' + done + '/' + n, '#7fe8ff', 1.8);
  cr.hooks.puff(c.x, c.y - 200, '#bff6ff', 14);
  state.sfxQ.push([part.hp <= 0 ? 'sever' : 'clang']);
  state.ship.shake = Math.max(state.ship.shake || 0, C.SHAKE);
  cr.titan.tremor = C.TREMOR;
  if (part.hp > 0) {
    state.say('objective', 'THE CRYSTAL CRACKS! ' + done + '/' + n, null, 2.2);
    if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'CRACK! ' + done + '/' + n + ' - keep hacking!', [60, 30, 60]);
  }
  void before;
}

// The Action button for a man standing on the island (ground.js step): a hold at the crystal, or null (then it is the flare). ctl = { holdOk }.
export function islandAct(state, p, dt, ctl) {
  const cr = state.creature, c = crystalOf(state), C = TT().CRYSTAL;
  if (!up(cr) || !c || !c.alive || Math.abs(p.x - c.x) > C.REACH) return null;
  const job = c.part.job || (c.part.job = { name: 'crystal', prog: 0, worked: false });
  const sword = p.carry === 'sword', hammer = p.carry === 'hammer';
  const time = sword ? C.TIME : hammer ? C.TIME_HAMMER : C.TIME_BARE;
  const a = { type: 'crystal', obj: job, hold: true, time, label: sword ? 'HACK THE CRYSTAL!' : hammer ? 'HACK THE CRYSTAL! (hammer: slow)' : 'CHIP THE CRYSTAL! (a sword is faster)' };
  if (p.fire && ctl.holdOk(p)) {
    job.worked = true;
    job.prog += dt / time;
    if (job.prog >= 1) { job.prog = 0; strike(state, cr, c, p); }
  }
  return a;
}
// The phone's hint line and the gold arrow for a man on the island.
export function islandUi(state, p) {
  const c = crystalOf(state);
  if (!c || !c.alive) return { hint: "You are on the Titan's back. JUMP leaps off; FIRE FLARE calls the ship.", verb: 'LEAP' };
  if (Math.abs(p.x - c.x) <= TT().CRYSTAL.REACH) return { hint: 'HOLD the big button: hack the crystal! (a sword is quickest)', verb: 'HACK' };
  return { hint: "You are on the Titan's back! Walk to the glowing CRYSTAL and hack it. JUMP leaps off.", verb: 'HACK' };
}
export function islandJob(state, p, f) {
  const c = crystalOf(state);
  if (!c || !c.alive || !p.on || !p.on.deck || !p.on.deck.island || p.ko > 0) return null;
  const dx = c.x - p.x, near = Math.abs(dx) < TT().CRYSTAL.REACH * 0.6;
  return { kind: 'hack', label: 'HACK THE CRYSTAL', dir: near ? null : dx * f > 0 ? 'right' : 'left', color: '#7fe8ff', verb: 'HACK', away: true };
}
// A tripping bot on the island: walk to the crystal and hold; done when it is broken or the Titan is gone.
export function islandBotGoal(state, p) {
  const c = crystalOf(state);
  if (!c || !c.alive) return { x: p.x, fire: false, done: true };
  return { x: c.x, fire: Math.abs(p.x - c.x) < TT().CRYSTAL.REACH * 0.6, done: false };
}
// Is a crystal trip worth making now (the tools' bots: config.AWAY.BOT_TRIPS)? The Titan is up, the crystal whole, and the dev flag leaves the crystal to the crew (null or 'crystal').
export function islandTrip(state) {
  const f = config.CREATURES.FORCE_WIN;
  const c = crystalOf(state);
  return !!islandOf(state) && !!c && c.alive && (!f || f === 'crystal');
}
