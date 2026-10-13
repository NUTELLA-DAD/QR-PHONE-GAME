// THE CREW ROSTER (SHIPS_BOOK.md L3): the TV keeps a service record for every human who flies (save.crew, book.js: voyages, wins, stat totals, seconds at each kind of station, the Book's notable deeds),
// the record earns a TITLE ("Old Salt", "Stoker of the Year", "Gun Captain" ...), and a veteran who scans in is welcomed by it within a step: "Mia the Old Salt returns!" on the TV lobby and on the phone's join card.
// A person is the PHONE (it keeps its own random id, sent when it joins: p.pid) so a new TV session knows the same phone; with no id (a tool, an old phone) the typed name is the key. Bots and ship's mates never
// have a record. Node-safe, no DOM, NO random numbers; the numbers and names are config.BOOK.ROSTER.
//
//   titleFor(rec)              -> { name, id, deed, also: [names], voyages }  the headline title of a record (null record = a new player, "Deckhand")
//   favouriteStation(rec)      -> { kind, secs, share } | null              where they spent most of their flying time
//   notable(rec, n)            -> up to n short phrases of what they did most ("38 fires out", "fell overboard 5 times")
//   welcomeOf(rec, name)       -> { vet, line, sub, phone: { title, text } } what a scan-in says
//   const roster = createRoster({ state, emitUi })
//   roster.update(dt)          every step: the scan-in welcomes, the stations' clock, state.titles (name -> headline), state.welcomes (the TV lobby's banners)
//   roster.collect(p)          { pid, stations, deeds } of one human for the voyage that has ended (christen.js endRun)
//   roster.restart()           a new voyage: the clocks start again
import { config } from '../../config.js';
import { shipOf } from './ships.js';
import { findCrew } from './book.js';

const RO = () => config.BOOK.ROSTER;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const stat = (rec, key) => (Array.isArray(key) ? key : [key]).reduce((s, k) => s + ((rec && rec.stats && rec.stats[k]) || 0), 0);
const sum = (o) => Object.values(o || {}).reduce((s, n) => s + n, 0);

// Where they spent most of their flying time, or null.
export function favouriteStation(rec) {
  const st = (rec && rec.stations) || {};
  let best = null;
  for (const [kind, secs] of Object.entries(st)) if (!best || secs > best.secs) best = { kind, secs };
  const all = sum(st);
  return best && all > 0 ? { kind: best.kind, secs: best.secs, share: best.secs / all } : null;
}

// How far past its number a record is for one deed title (0 = not earned; 1 = just earned; 2 = twice the number ...).
function reach(rec, T) {
  if (T.station) {
    const fav = (rec.stations && rec.stations[T.station]) || 0, all = sum(rec.stations);
    return fav >= T.secs && all > 0 && fav / all >= T.share ? fav / T.secs : 0;
  }
  const v = T.deed ? (rec.deeds && rec.deeds[T.deed]) || 0 : stat(rec, T.stat);
  return v >= T.min ? v / T.min : 0;
}
// The headline title of a record: the deed title it is furthest past (a tie: the higher `rank`, then the list order), else the rank by voyages. `also` = the other titles it has earned, best first.
export function titleFor(rec) {
  const R = RO();
  const voyages = rec ? rec.voyages | 0 : 0;
  const rank = (R.RANKS.find((r) => voyages >= r.voyages) || R.RANKS[R.RANKS.length - 1]).name;
  const earned = [];
  if (rec && voyages >= R.MIN_VOYAGES) {
    R.TITLES.forEach((T, i) => {
      const r = reach(rec, T);
      if (r > 0) earned.push({ T, r, i });
    });
    earned.sort((a, b) => b.r - a.r || (b.T.rank || 0) - (a.T.rank || 0) || a.i - b.i);
  }
  if (!earned.length) return { name: rank, id: 'rank', deed: false, also: [], voyages };
  const top = earned[0];
  return { name: top.T.name, id: top.T.id, deed: true, also: [...earned.slice(1).map((e) => e.T.name), ...(rank !== R.RANKS[R.RANKS.length - 1].name ? [rank] : [])], voyages };
}

// What a person did most, in a few words, for the Book's roster page.
const PHRASE = {
  kills: (n) => `${n} shot down`, raiders: (n) => `${plural(n, 'raider', 'raiders')} beaten`, coal: (n) => `${plural(n, 'coal load', 'coal loads')}`, fires: (n) => `${plural(n, 'fire', 'fires')} out`, holes: (n) => `${plural(n, 'hole', 'holes')} patched`,
  revives: (n) => `${plural(n, 'crewmate', 'crewmates')} revived`, stowed: (n) => `${n} stowed in the hold`, ammo: (n) => `${plural(n, 'ammo run', 'ammo runs')}`, defused: (n) => `${plural(n, 'bomb', 'bombs')} defused`, sabotage: (n) => `${plural(n, 'gunship', 'gunships')} blown up`,
  framed: (n) => `${n} frames built`, patched: (n) => `${n} scrap patches`,
};
export function notable(rec, n = 2) {
  if (!rec) return [];
  const R = RO(), floor = {};
  for (const T of R.TITLES) if (T.stat) for (const k of Array.isArray(T.stat) ? T.stat : [T.stat]) floor[k] = Math.min(floor[k] || 1e9, T.min);
  const out = [];
  for (const [k, f] of Object.entries(PHRASE)) {
    const v = Math.round(stat(rec, k));
    if (v > 0) out.push({ r: v / (floor[k] || 20), s: f(v) });
  }
  const falls = ((rec.deeds && rec.deeds.overboard) || 0) + ((rec.deeds && rec.deeds['overboard-lunatic']) || 0);
  if (falls >= 2) out.push({ r: falls / 6, s: `fell overboard ${falls} times` });
  const saves = (rec.deeds && rec.deeds['going-down-saved']) || 0;
  if (saves >= 1) out.push({ r: saves / 2, s: plural(saves, 'fall stopped', 'falls stopped') });
  return out.sort((a, b) => b.r - a.r).slice(0, n).map((o) => o.s);
}

// What a scan-in says: the TV line and the phone's card. rec = the person's record, or null for a new face.
export function welcomeOf(rec, name) {
  const t = titleFor(rec);
  const vet = !!rec && (rec.voyages | 0) >= 1;
  if (!vet) return { vet: false, title: t.name, line: `Welcome aboard, ${name} - ${t.name}!`, sub: 'first voyage on this TV', phone: { title: `You are a ${t.name}!`, text: '', vet: false } };
  const sub = `${plural(rec.voyages, 'voyage', 'voyages')}, ${rec.victories | 0} won`;
  return { vet: true, title: t.name, line: `${name} the ${t.name} returns!`, sub, phone: { title: `Welcome back, ${name}!`, text: `${t.name} - ${sub}.`, vet: true } };
}

export function createRoster({ state, emitUi }) {
  const greeted = new WeakSet(); // the player objects already welcomed (a socket blip or a reconnect is not a new scan-in)
  let secs = {}; // player id -> { station kind -> seconds this voyage }
  let acc = 1; // seconds until the titles are worked out again
  // (state.titles = name -> headline title for the humans on the TV now, the scorecard reads it; state.welcomes = the TV lobby's banners { id, name, color, line, sub, vet, t }: both made on the first step with the Book on)
  const on = () => config.BOOK.ENABLED;
  const human = (p) => p && !p.bot && !p.mate && !p.enemy && p.name;
  const recOf = (p) => { const f = findCrew(state.save, p); return f ? f.rec : null; };
  const refresh = () => {
    const t = {};
    for (const p of Object.values(state.players)) if (human(p)) t[p.name] = titleFor(recOf(p)).name;
    state.titles = t;
  };

  const update = (dt) => {
    if (!on() || !state.save) return;
    state.titles = state.titles || {};
    state.welcomes = state.welcomes || [];
    for (const p of Object.values(state.players)) {
      if (!human(p) || greeted.has(p)) continue;
      greeted.add(p);
      const w = welcomeOf(recOf(p), p.name);
      if (w.vet || RO().WELCOME.NEW) state.welcomes.push({ id: p.id, name: p.name, color: p.color, line: w.line, sub: w.sub, vet: w.vet, t: RO().WELCOME.SECS });
      while (state.welcomes.length > RO().WELCOME.MAX) state.welcomes.shift();
      if (emitUi && (w.vet || RO().WELCOME.NEW)) emitUi(p.id, { welcome: w.phone });
      acc = 0; // (the new face's title is worked out now)
    }
    for (const w of state.welcomes) w.t -= dt;
    if (state.welcomes.length && state.welcomes[0].t <= 0) state.welcomes = state.welcomes.filter((w) => w.t > 0);
    if ((acc -= dt) <= 0) { acc = 1; refresh(); }
    // the clock at the stations: who spent the voyage where
    if (state.phase === 'flying' && !state.vote && !state.scorecard && !state.runEnd && !state.christen) {
      for (const p of Object.values(state.players)) {
        if (!human(p) || !p.lock || p.fall || p.fly) continue;
        const kind = shipOf(state, p).layout.kindOf(p.lock);
        if (kind) { const m = (secs[p.id] ||= {}); m[kind] = (m[kind] || 0) + dt; }
      }
    }
  };

  // The voyage has ended: this human's seconds at each station, and the Book's notable deeds of the voyage (the moments that name him).
  const collect = (p) => {
    const stations = {};
    for (const [k, s] of Object.entries(secs[p.id] || {})) if (s >= 1) stations[k] = Math.round(s);
    const deeds = {};
    const kinds = RO().DEED_KINDS;
    for (const m of state.moments || []) if (m.weight > 0 && kinds.includes(m.kind) && (m.who || []).includes(p.name)) deeds[m.kind] = (deeds[m.kind] || 0) + 1;
    return { pid: p.pid || '', stations, deeds };
  };
  const restart = () => { secs = {}; };
  return { update, collect, restart, refresh };
}
