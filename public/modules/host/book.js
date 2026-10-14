// THE SHIP'S BOOK, the save side (SHIPS_BOOK.md L2): the ship's name and the names offered at the christening, and save v3 - her voyages (one page each: the postcard's data), the ships she followed (the lost ones
// get a black-bordered page), and a record for every crewman who has flown. Node-safe, no DOM, NO random numbers (the names come from a hash of the date and the book, so a seeded tool draws the same numbers
// with the book on or off). Everything is tolerant: an odd save gives a blank book, never an error, and the old fields of a save are never dropped.
//
//   shipNames(save, n, dateKey)       -> n different names for the christening vote (deterministic)
//   cleanName(text) / shipRef(name)   -> a name made safe / "the Brass Heron" for the middle of a sentence ("Lady Marmalade" stays as it is)
//   normalizeBook(v)                  -> fills v.ship / v.book / v.fleet / v.crew (v3) from whatever the save had (v1, v2 or v3), in place
//   newShip(name, dateKey)            -> { name, born, voyages, victories, stops, salvage }
//   recordVoyage(save, entry)         -> the voyage's page into save.book (the ship's tallies move on); returns the page
//   recordCrew(save, list, victory, dateKey, shipName)   list = [{ name, color, species, stats, pid?, stations?, deeds? }] (humans only; L3: roster.js reads a record back as a title)
//   findCrew(save, p)                 -> { key, rec }: the record of a person (L3): the one with this phone's id (p.pid), else the one kept under the name; null if there is none
//   pageCount(save) / crewPage(save)  the Ship's Book's pages: the cover, the crew roster page (once anybody has flown), then a postcard for each voyage (L3)
//   retireShip(save, fate, where, dateKey)  -> the ship afloat goes to save.fleet ('lost'), save.ship = null
import { config } from '../../config.js';
import { normalizeNemesis } from './nemesis.js'; // (L4: the save's `nemesis` field)

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
const next = (h) => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return { h, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 }; };
const BK = () => config.BOOK;

// ---- names ----
const ADJ = ['Brass', 'Gallant', 'Lucky', 'Dapper', 'Plucky', 'Gilded', 'Humble', 'Mighty', 'Jolly', 'Daring', 'Silver', 'Merry', 'Stubborn', 'Crimson', 'Patient', 'Wandering', 'Singing', 'Whistling', 'Windswept', 'Copper', 'Cloudy', 'Faithful', 'Nimble', 'Sturdy'];
const NOUN = ['Kettle', 'Teapot', 'Biscuit', 'Walrus', 'Sprocket', 'Trombone', 'Barnacle', 'Marmot', 'Gasket', 'Umbrella', 'Weathervane', 'Thimble', 'Lantern', 'Cuckoo', 'Haddock', 'Compass', 'Crumpet', 'Spanner', 'Kipper', 'Pudding'];
const BIRD = ['Heron', 'Lark', 'Kestrel', 'Magpie', 'Plover', 'Swift', 'Wren', 'Albatross', 'Curlew', 'Finch', 'Osprey', 'Starling', 'Pelican', 'Skylark'];
const LADY = ['Marmalade', 'Griselda', 'Hortense', 'Bluebell', 'Octavia', 'Marigold', 'Clementine', 'Philippa', 'Winifred', 'Primrose', 'Beatrice', 'Dorothea'];
const SURN = ['Thistlewick', 'Pettigrew', 'Hartley', 'Fogarty', 'Ambrose', 'Nightingale', 'Quimby', 'Featherstone', 'Merriweather', 'Tuppence', 'Bramblewood', 'Applegarth'];
const SUFF = ['Folly', 'Pride', 'Hope', 'Fancy', 'Delight', 'Revenge'];
const PLACE = ['Larkhill', 'Marrow Fen', 'Cobblegate', 'Windermoor', 'Brasswick', 'Highgate', 'Saltmarsh', 'Dovecote'];
// One form for each name offered, so the five are never five of a kind.
const FORMS = [
  (p) => 'The ' + p(ADJ) + ' ' + p(NOUN),
  (p) => 'Lady ' + p(LADY),
  (p) => p(SURN) + "'s " + p(SUFF),
  (p) => 'The ' + p(NOUN) + ' of ' + p(PLACE),
  (p) => 'The ' + p(ADJ) + ' ' + p(BIRD),
];
export const NAME_PARTS = { ADJ, NOUN, BIRD, LADY, SURN, SUFF, PLACE }; // (tools/book-check.mjs)
export const cleanName = (s) => String(typeof s === 'string' ? s : '').replace(/[^A-Za-z0-9' \-]/g, '').replace(/\s+/g, ' ').trim().slice(0, BK().NAME_MAX).trim();
export const shipRef = (name) => String(name || '').replace(/^The /, 'the ');
// n different names, the same ones for the same book on the same day. Not the names of a ship she followed.
export function shipNames(save, n, dateKey = '') {
  const count = n || BK().CHRISTEN.OPTIONS;
  const used = new Set(((save && save.fleet) || []).map((f) => String(f.name || '').toLowerCase()));
  let h = hash(`${dateKey}|${((save && save.fleet) || []).length}|${(save && save.totalRuns) | 0}|${((save && save.book) || []).length}`);
  const out = [];
  for (let k = 0; k < count; k++) {
    const form = FORMS[k % FORMS.length];
    let name = '';
    for (let tries = 0; tries < 30; tries++) {
      const pick = (list) => { const r = next(h); h = r.h; return list[Math.floor(r.v * list.length)]; };
      const raw = form(pick);
      name = raw.length <= BK().NAME_MAX ? cleanName(raw) : ''; // (too long is thrown back, never cut)
      if (name && !used.has(name.toLowerCase()) && !out.includes(name)) break;
      name = '';
    }
    if (!name) name = cleanName(FORMS[k % FORMS.length]((l) => l[k % l.length])) + (k >= FORMS.length ? ' II' : ''); // (a book with every name used: a plain one, which is still a name)
    out.push(name);
    used.add(name.toLowerCase());
  }
  return out;
}

// ---- save v3 ----
const num = (v, d = 0) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
export const newShip = (name, born) => ({ name: cleanName(name), born: str(born), voyages: 0, victories: 0, stops: 0, salvage: 0 });
const goodShip = (s) => (s && typeof s === 'object' && cleanName(s.name) ? { ...s, name: cleanName(s.name), born: str(s.born), voyages: num(s.voyages), victories: num(s.victories), stops: num(s.stops), salvage: num(s.salvage) } : null);
const goodPage = (p) => (p && typeof p === 'object' && Array.isArray(p.lines) ? { ...p, no: num(p.no), ship: p.ship == null ? null : str(p.ship), date: str(p.date), victory: !!p.victory, route: Array.isArray(p.route) ? p.route : [], rows: Array.isArray(p.rows) ? p.rows : [], colors: p.colors && typeof p.colors === 'object' ? p.colors : {} } : null);
const goodFleet = (f) => (f && typeof f === 'object' && cleanName(f.name) ? { ...f, name: cleanName(f.name), born: str(f.born), ended: str(f.ended), voyages: num(f.voyages), victories: num(f.victories), fate: str(f.fate, 'lost'), where: str(f.where) } : null);
const tally = (o) => { const r = {}; if (o && typeof o === 'object' && !Array.isArray(o)) for (const [k, n] of Object.entries(o)) if (Number.isFinite(n) && n > 0) r[k] = n; return r; };
// (L3: pid = the phone's own id, stations = seconds at each kind of station, deeds = Book moments by kind; an L2 record has none of them and gets them empty)
const goodCrew = (c) => (c && typeof c === 'object' && str(c.name) ? { ...c, name: str(c.name), color: str(c.color, '#cccccc'), species: str(c.species), voyages: num(c.voyages), victories: num(c.victories), first: str(c.first), last: str(c.last), stats: c.stats && typeof c.stats === 'object' ? c.stats : {}, pid: str(c.pid), stations: tally(c.stations), deeds: tally(c.deeds) } : null);
// v1 and v2 saves have none of this: they get a blank book. v3 saves are checked, bad entries are dropped, nothing else in the save is touched.
export function normalizeBook(v) {
  v.ship = goodShip(v.ship);
  v.book = (Array.isArray(v.book) ? v.book.map(goodPage).filter(Boolean) : []).slice(-BK().KEEP.VOYAGES);
  v.fleet = (Array.isArray(v.fleet) ? v.fleet.map(goodFleet).filter(Boolean) : []).slice(-BK().KEEP.FLEET);
  const crew = {};
  if (v.crew && typeof v.crew === 'object' && !Array.isArray(v.crew)) for (const [k, c] of Object.entries(v.crew)) { const g = goodCrew(c); if (g) crew[k] = g; }
  v.crew = crew;
  normalizeNemesis(v); // (L4: the Nemesis the book remembers: { n, cur, fallen })
  return v;
}

// A voyage's page. entry = the postcard's data (state.runEnd) with { shipName, date }: kept as it is, the lines and the route trimmed.
export function recordVoyage(save, entry) {
  const K = BK().KEEP;
  const no = (save.book.length ? save.book[save.book.length - 1].no : 0) + 1;
  const page = goodPage({ ...entry, no, route: (entry.route || []).slice(0, K.ROUTE), lines: (entry.lines || []).slice(0, config.LOG.POSTCARD_LINES) });
  if (!page) return null;
  save.book.push(page);
  while (save.book.length > K.VOYAGES) save.book.shift();
  const s = save.ship;
  if (s && s.name === page.ship) {
    s.voyages++;
    if (page.victory) s.victories++;
    s.stops += num(page.done);
    s.salvage += num(page.salvage);
  }
  return page;
}
// The record of a person (L3): the one that holds this phone's id; failing that, an older record kept under the same name and with no id yet (an L2 save, or a phone that has not been here before: recordCrew claims
// it); a person with no id (a tool, an old phone) is found by name.
export function findCrew(save, p) {
  const crew = (save && save.crew) || {};
  const pid = str(p && p.pid), name = str(p && p.name).trim();
  if (pid) {
    for (const [key, rec] of Object.entries(crew)) if (rec.pid === pid) return { key, rec };
    const old = crew[name];
    return old && !old.pid ? { key: name, rec: old } : null;
  }
  return crew[name] ? { key: name, rec: crew[name] } : null;
}
// The Ship's Book: page 0 is the cover, page 1 the crew roster once anybody has flown, then a postcard for each voyage.
export const crewPage = (save) => !!(save && save.crew && Object.keys(save.crew).length);
export const pageCount = (save) => 1 + (crewPage(save) ? 1 : 0) + (save && save.book ? save.book.length : 0);
// A record for each human who flew. L3: the key is the phone's id (a phone that comes back to a new TV session is the same person); with no id the name is the key, as in L2. The name on the record follows the phone's.
export function recordCrew(save, list, victory, dateKey, shipName) {
  for (const p of list || []) {
    const name = str(p && p.name).trim();
    if (!name) continue;
    const pid = str(p.pid);
    const found = findCrew(save, p);
    const c = found ? found.rec : (save.crew[pid || name] = { name, color: '#cccccc', species: '', voyages: 0, victories: 0, first: dateKey, last: dateKey, stats: {}, pid, stations: {}, deeds: {} });
    c.name = name;
    if (pid) c.pid = pid;
    c.color = str(p.color, c.color);
    c.species = str(p.species, c.species);
    c.voyages++;
    if (victory) c.victories++;
    c.last = dateKey;
    c.ship = shipName || c.ship || null;
    for (const [k, n] of Object.entries(p.stats || {})) if (Number.isFinite(n)) c.stats[k] = Math.round(((c.stats[k] || 0) + n) * 100) / 100;
    for (const [field, add] of [['stations', p.stations], ['deeds', p.deeds]]) { // (L3)
      c[field] = tally(c[field]);
      for (const [k, n] of Object.entries(add || {})) if (Number.isFinite(n) && n > 0) c[field][k] = Math.round(((c[field][k] || 0) + n) * 10) / 10;
    }
  }
  const names = Object.keys(save.crew);
  if (names.length > BK().KEEP.CREW) { // (too many: the ones who flew longest ago go)
    names.sort((a, b) => String(save.crew[a].last).localeCompare(String(save.crew[b].last)));
    for (const k of names.slice(0, names.length - BK().KEEP.CREW)) delete save.crew[k];
  }
}
// She is lost: her name goes into the fleet (the book's black-bordered page), and the next ship is christened fresh.
export function retireShip(save, fate, where, dateKey) {
  const s = save.ship;
  if (!s) return null;
  const f = goodFleet({ name: s.name, born: s.born, ended: dateKey, voyages: s.voyages, victories: s.victories, fate: fate || 'lost', where: where || '' });
  save.fleet.push(f);
  while (save.fleet.length > BK().KEEP.FLEET) save.fleet.shift();
  save.ship = null;
  return f;
}

// "2026-10-12" -> "12 Oct 2026"
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const prettyDate = (key) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || '')); return m ? `${+m[3]} ${MONTHS[+m[2] - 1] || ''} ${m[1]}` : ''; };
