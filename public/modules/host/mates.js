// Ship's mates: helper NPCs for crews of three or fewer (config.MATES). They are players with { bot: true, mate: true }, so
// the bot brain (bots.js) walks and works them, but it hands them only the hauling and mending jobs (carry coal and ammo,
// patch, fire, revive). They man no stations, cast no votes, win no awards and never count as crew for crew scaling
// (crewscale.js). They come aboard once the voyage is under way and leave when a 4th human joins or the voyage ends.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

// A person at the table: a connected phone, or (in the test sims) a bot flagged { human: true } to stand in for one.
export const isHuman = (p) => !p.mate && (!p.bot || !!p.human);

// How many mates should be aboard right now (`current` = how many are, kept while every human is briefly disconnected).
// With `lobbyToo` it also answers for the moored lobby (to tell the players what is coming).
export function matesWanted(state, current = 0, lobbyToo = false) {
  const M = config.MATES;
  if (!M.ENABLED || (state.phase === 'lobby' && !lobbyToo) || !M.DIFFICULTIES.includes(state.difficulty)) return 0;
  const crew = Object.values(state.players).filter((p) => !p.mate);
  if (crew.some((p) => !isHuman(p))) return 0; // (test bots from the lobby button are crew: nobody is short-handed)
  const humans = crew.filter((p) => p.connected !== false).length;
  if (humans === 0) return crew.length ? current : 0; // (a phone that dropped out for a moment: the mates stay)
  return humans <= M.MAX_CREW ? M.COUNT[humans] || 0 : 0;
}

let nextId = 1;

// Call every frame: bring mates aboard or send them home.
export function updateMates(state, dt) {
  const mates = Object.values(state.players).filter((p) => p.mate);
  const want = matesWanted(state, mates.length);
  if (mates.length > want) {
    for (const m of mates.slice(want)) delete state.players[m.id];
    return;
  }
  state.mateT = (state.mateT || 0) - dt;
  if (mates.length < want && state.mateT <= 0) {
    state.mateT = config.MATES.SPAWN_GAP;
    const [e0, e1] = SHIP_LAYOUT.boarderEntryPoints;
    const id = 'mate' + nextId++;
    state.players[id] = {
      id, bot: true, mate: true, name: 'Mate', connected: true,
      species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0],
      color: config.MATES.COLOR,
      x: e0.x + Math.random() * (e1.x - e0.x), y: -60, fall: true, jx: 0, jy: 0, t: 0, // (dropped in from above, as when joining)
    };
  }
}
