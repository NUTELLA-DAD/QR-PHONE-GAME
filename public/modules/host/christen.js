// THE CHRISTENING and the book-keeping of a voyage (SHIPS_BOOK.md L2). At the first CAST OFF of an unnamed ship the phones vote on a name (5 made-up names and "Name her later"), a bottle breaks on the bow on the TV
// (bookArt.js ceremony), and the name goes into the save (book.js) and onto everything the TV writes. All of it under config.BOOK.CHRISTEN's 20 seconds; CAST OFF again (Space) skips what is showing.
// No random draws except the vote's own tie-break (simulation.js updateVote). A bots-only crew never christens (config.BOOK.CHRISTEN.MIN_HUMANS) unless state.christenMode is 'always' (host.html?christen=1); 'off' (?christen=0) never.
//   const ch = createChristening({ state, openVote, closeVote, launch })
//   ch.wanted()        should CAST OFF open the vote now?       ch.start()       open it
//   ch.resolve(option) the vote ended on this option            ch.update(dt)    the ceremony's clock (casts off when it ends)
//   ch.skip()          CAST OFF pressed during the vote / the ceremony
//   ch.endRun(...)     the voyage is over: its page, the crew's records, a lost ship to the fleet
import { config } from '../../config.js';
import { shipNames, newShip, recordVoyage, recordCrew, retireShip } from './book.js';
import { dateKey, saveVoyageSave } from './voyage.js';

export function createChristening({ state, openVote, closeVote, launch, phoneFx }) {
  const BK = () => config.BOOK;
  const on = () => BK().ENABLED && !config.PVP.ENABLED && state.mode !== 'versus' && state.christenMode !== 'off';
  const humans = () => Object.values(state.players).filter((p) => !p.bot && !p.mate && p.connected !== false).length;
  const wanted = () => on() && state.shipName == null && !state.vote && !state.christen && (state.christenMode === 'always' ? Object.keys(state.players).length > 0 : humans() >= BK().CHRISTEN.MIN_HUMANS);
  const start = () => {
    const C = BK().CHRISTEN;
    const names = shipNames(state.save, C.OPTIONS, dateKey());
    openVote({ kind: 'name', title: 'NAME THE SHIP!', t: C.VOTE_TIME,
      options: [...names.map((n) => ({ kind: 'name', name: n, icon: '⚓', desc: '' })), { kind: 'skip', name: 'Name her later', icon: '⏭️', desc: 'cast off now' }] });
  };
  // The ship has her name: it is written into the save at once (a TV closed in the middle of the first voyage still knows her), the ceremony starts.
  const named = (name) => {
    state.shipName = name;
    state.save.ship = newShip(name, dateKey());
    saveVoyageSave(state.save);
    state.christen = { name, t: BK().CHRISTEN.CEREMONY, t0: BK().CHRISTEN.CEREMONY, broke: false };
    if (phoneFx) for (const p of Object.values(state.players)) if (!p.bot && !p.mate) phoneFx(p, `\u{1F37E} ${name}!`, [60, 40, 60], 3000); // (the phones say her name, too)
  };
  const resolve = (o) => {
    closeVote();
    if (!o || o.kind === 'skip') launch();
    else named(o.name);
  };
  const update = (dt) => {
    const c = state.christen;
    if (!c) return;
    c.t -= dt;
    if (!c.broke && c.t0 - c.t >= BK().CHRISTEN.BREAK_AT) { c.broke = true; state.sfxQ.push(['glass']); }
    if (c.t <= 0) { state.christen = null; launch(); }
  };
  const skip = () => {
    if (state.christen) { state.christen.t = Math.min(state.christen.t, 0); return true; }
    if (state.vote && state.vote.kind === 'name') { state.vote.skipped = true; state.vote.t = 0; return true; }
    return false;
  };
  // The voyage is over. The page (the postcard's data: state.runEnd), the crew's records; a ship that was lost goes into the fleet and the next one is christened fresh. Never throws.
  const endRun = (e, run) => {
    if (!on()) return;
    try {
      const save = state.save, key = dateKey(), ship = state.shipName;
      const humansList = Object.values(state.players).filter((p) => !p.bot && !p.mate && p.name);
      const { t, ...page } = e; // (the countdown to the next voyage is not part of the page)
      recordVoyage(save, { ...page, shipName: ship, ship, date: key, lost: !e.victory });
      recordCrew(save, humansList.map((p) => ({ name: p.name, color: p.color, species: p.species, stats: (run.crew[p.id] || {}).stats || {} })), e.victory, key, ship);
      if (!e.victory && save.ship) { retireShip(save, 'lost', e.stopName, key); state.shipName = null; }
    } catch (err) { (globalThis.gameErrors = globalThis.gameErrors || []).push('book: ' + err.message); }
  };
  return { wanted, start, resolve, update, skip, endRun };
}
