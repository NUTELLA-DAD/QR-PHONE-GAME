// THE NEMESIS (SHIPS_BOOK.md L4): one named enemy captain that the Ship's Book remembers. "THE RED KESTREL IS HUNTING YOU."
//   * WHO: a colour and a beast, from a seed (makeNemesis). Her name, flag colours, emblem, hull layout and captain's nature never change; the crew learn her by sight. Deterministic: no Math.random anywhere in this file.
//   * WHEN: she IS the stop's gunship set piece at the planned stops of a voyage (config.NEMESIS: column 1, then every GAP columns, never a lair / ring / salvage / Flagship stop, never more than MEETINGS times). The
//     third meeting - or the last stop before the Flagship that can host her - is the FINAL showdown.
//   * THE ARC: beaten (under ESCAPE_AT of her hull, nobody on her) she limps away with a vow, until the final showdown; a boarding charge or her taken helm ends her for good at any meeting. Every meeting she is a level
//     stronger (hull, reload, and from level 2 a better-armed ship). A voyage that ends with her alive says so on the postcard, the lobby and the next voyage's first briefing.
//   * MEMORY: save v3 `nemesis` = { n, cur, fallen }: the live captain with her tallies (meets, escapes, ours = times she beat the ship, voyages) and the flags of those who were sunk (the lobby shows them).
//   * THE LOG: moments nemesis-met / -scar / -escape / -down / -won (logWriter.js tells them), in the one-headline banner voice (alarms.js: kind setpiece / objective).
// The top half of the file is pure (generation, words, the save's shape: book.js uses it); createNemesis() is the director simulation.js drives. Behind config.NEMESIS.ENABLED (the Book's switch, NO_NEMESIS=1).
import { config } from '../../config.js';

// ---- hashing: the same numbers for the same book, on every machine ----
const hash = (s) => { let h = 2166136261; for (let i = 0; i < String(s).length; i++) h = Math.imul(h ^ String(s).charCodeAt(i), 16777619) >>> 0; return h; };
const pick = (list, seed, salt) => list[hash(seed + '|' + salt) % list.length];
const NM = () => config.NEMESIS;

// Colour words with the flag they paint. Cloths are dark enough for the cream badge; each word is also the first word of her name, so "the red one" and "the Red Kestrel" are the same ship.
export const PALETTES = [
  { word: 'Red', a: '#b3302a', b: '#f2d36b', hull: '#4a2626', bag: '#7a2a24', badge: '#c4574d' },
  { word: 'Black', a: '#2e2a30', b: '#ebdfc0', hull: '#2a2428', bag: '#3a343c', badge: '#4a4346' },
  { word: 'Green', a: '#3f6b3c', b: '#f2d36b', hull: '#2f3a2a', bag: '#3f5a38', badge: '#5f9a5a' },
  { word: 'Violet', a: '#6a3d8f', b: '#ebdfc0', hull: '#3a2a46', bag: '#55407a', badge: '#8a6fb0' },
  { word: 'Rust', a: '#a8501f', b: '#ebdfc0', hull: '#4a3020', bag: '#7a4524', badge: '#d2793a' },
  { word: 'Blue', a: '#2f5d8f', b: '#ebdfc0', hull: '#27333f', bag: '#34506f', badge: '#4d7fb3' },
];
export const BEASTS = ['Kestrel', 'Widow', 'Jackal', 'Mantis', 'Shrike', 'Hornet', 'Harrier', 'Adder', 'Raven', 'Falcon', 'Viper', 'Magpie', 'Wolverine', 'Cormorant', 'Marten', 'Heron'];
const NATURES = ['aggressive', 'boarder', 'cautious']; // (never the coward: she is the one who does not run until the end)
const VOWS = ['WE WILL MEET AGAIN!', "THIS ISN'T OVER!", 'I WILL REMEMBER THIS SHIP!', 'YOU WILL PAY FOR THIS!', 'NEXT TIME, NO MERCY!', 'THE SKY IS NOT BIG ENOUGH FOR YOU!'];
const TAUNTS = ['She remembers every shot.', 'She has had time to think about it.', 'She has been mending her guns.', 'She has a long memory.', 'She learned something last time.', 'She wants her flag back.'];

export const levelOf = (foe) => Math.max(0, Math.min(NM().MAX_LEVEL, (foe && foe.meets) | 0));
export const nameWords = (foe) => String(foe.name || '').replace(/^The /, '').toUpperCase(); // "RED KESTREL"

// A new captain. n counts the captains the book has known; the seed is hers.
export function makeNemesis(seed, n = 1, born = '') {
  const P = pick(PALETTES, seed, 'colour'), beast = pick(BEASTS, seed, 'beast');
  const GP = config.GUNSHIP_PARTS;
  const layouts = GP.HULLS[NM().HULL].layouts;
  return {
    n, seed, word: P.word, beast, name: `The ${P.word} ${beast}`, handle: `${P.word.toUpperCase()} ${beast.toUpperCase()}`,
    look: { a: P.a, b: P.b, pattern: pick(GP.PATTERNS || ['band'], seed, 'pattern'), hullColor: P.hull, bagColor: P.bag, emblem: pick(GP.EMBLEMS || ['horns'], seed, 'emblem'), badge: P.badge },
    layout: pick(layouts, seed, 'layout'), personality: pick(NATURES, seed, 'nature'), vow: hash(seed + '|vow') % VOWS.length, taunt: hash(seed + '|taunt') % TAUNTS.length,
    meets: 0, escapes: 0, ours: 0, voyages: 0, born: String(born || ''), last: '', lastStop: '',
  };
}
// The seed of the next captain: the same book offers the same one (it mixes in the ship's christening date, so two TVs meet different captains, and no clock: a tool gets the same captain every day).
export const nemesisSeed = (save) => hash(`nemesis|${(save && save.nemesis && save.nemesis.n) | 0}|${(save && save.totalRuns) | 0}|${((save && save.book) || []).length}|${(save && save.ship && save.ship.born) || ''}`) % 0x7fffffff;

// ---- her words (banners are upper case; the ship's name, when she has one, makes it personal) ----
export function wordsOf(foe, plan, shipName) {
  const H = 'THE ' + nameWords(foe), S = shipName ? String(shipName).toUpperCase() : null;
  const vow = VOWS[(foe.vow + (foe.meets | 0)) % VOWS.length];
  const first = !(foe.meets | 0);
  return {
    approach: plan.final ? `${H} - THE LAST FIGHT!` : first ? `${H} IS HUNTING YOU!` : `${H} IS BACK - SHE REMEMBERS ${S || 'YOU'}!`,
    escape: `${H} LIMPS AWAY: "${vow}"`,
    blast: `${H} SURVIVES THE BLAST AND LIMPS AWAY: "${vow}"`,
    left: `${H} WITHDRAWS - SHE WILL BE BACK!`,
    down: `${H} IS DOWN FOR GOOD - HER FLAG IS YOURS!`,
    captured: `${H} STRIKES HER COLOURS - HER HELM IS YOURS!`,
    taunt: TAUNTS[(foe.taunt + (foe.meets | 0)) % TAUNTS.length],
    vow,
  };
}
// The strength she flies with this meeting (level = the meetings she has already had).
export function strengthOf(foe, final) {
  const lv = levelOf(foe), N = NM(), base = (config.GUNSHIP_PARTS.PERSONALITY[foe.personality] || config.GUNSHIP_PARTS.PERSONALITY.aggressive).fireMul;
  const fireMul = Math.round(base * (1 - N.FIRE_STEP * lv) * 1000) / 1000;
  return { level: lv, hpMul: N.HP_MUL + N.HP_STEP * lv, cap: final ? { fleeAt: 0, fireMul } : { fleeAt: N.ESCAPE_AT, retreats: 0, fireMul } };
}

// ---- the plan: which stops she flies in ----
// Can this stop host her? Not a lair, a ring, a salvage run, the harbour or the Flagship, and its set pieces must allow a gunship.
export const hosts = (stop, course) => !!stop && !stop.lair && !stop.ring && !stop.salvage && !stop.flagship && !stop.harbour && !(course && course.ring) && (!stop.gates || stop.gates.includes('gunship'));
// Is this the stop for her? r = the voyage's state { dueCol, meetings }; returns { col, n, final } or null.
export function planFor(r, stop, lastCol, course) {
  const N = NM();
  if (!r || !hosts(stop, course) || stop.col < r.dueCol || r.meetings >= N.MEETINGS) return null;
  return { stopId: stop.id, stopName: stop.name || '', col: stop.col, n: r.meetings + 1, final: r.meetings + 1 >= N.MEETINGS || stop.col + N.GAP >= lastCol, met: false, done: false };
}
// The columns she would visit on an undisturbed route of this many columns (the Flagship is the last): [1, 3, 5] on eight stops. For tools and the plan's tests.
export function plannedColumns(columns) {
  const N = NM(), out = [];
  for (let c = N.FIRST_COL; c < columns - 1 && out.length < N.MEETINGS; c += N.GAP) out.push(c);
  return out;
}

// ---- save v3: save.nemesis = { n, cur, fallen } ----
const num = (v, d = 0) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : d);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const goodFoe = (f) => {
  if (!f || typeof f !== 'object' || !Number.isFinite(f.seed)) return null;
  const fresh = makeNemesis(f.seed | 0, num(f.n, 1), str(f.born)); // (a damaged entry is rebuilt from its seed: the name, colours and layout come back; the tallies are kept)
  return { ...fresh, ...f, n: num(f.n, 1), seed: f.seed | 0, name: str(f.name) || fresh.name, handle: str(f.handle) || fresh.handle, look: f.look && typeof f.look === 'object' && f.look.a ? { ...fresh.look, ...f.look } : fresh.look,
    meets: num(f.meets), escapes: num(f.escapes), ours: num(f.ours), voyages: num(f.voyages), last: str(f.last), lastStop: str(f.lastStop), born: str(f.born) };
};
const goodFallen = (f) => (f && typeof f === 'object' && str(f.name) ? { ...f, name: str(f.name), handle: str(f.handle), look: f.look && typeof f.look === 'object' ? f.look : null, meets: num(f.meets), date: str(f.date), ship: f.ship == null ? null : str(f.ship), stop: str(f.stop) } : null);
export function normalizeNemesis(v) {
  const n = v.nemesis && typeof v.nemesis === 'object' && !Array.isArray(v.nemesis) ? v.nemesis : {};
  v.nemesis = { ...n, n: num(n.n), cur: goodFoe(n.cur), fallen: (Array.isArray(n.fallen) ? n.fallen.map(goodFallen).filter(Boolean) : []).slice(-NM().KEEP.FALLEN) };
  return v;
}
// She was sunk for good: her flag goes into the book, and the next voyage meets a new captain.
export function slayFoe(save, shipName, stopName, key) {
  const N = save.nemesis, f = N && N.cur;
  if (!f) return null;
  const flag = goodFallen({ name: f.name, handle: f.handle, look: f.look, meets: f.meets, date: key, ship: shipName || null, stop: stopName || '' });
  N.fallen.push(flag);
  while (N.fallen.length > NM().KEEP.FALLEN) N.fallen.shift();
  N.cur = null;
  return flag;
}
// The captain a voyage meets: the one the book remembers, or a new one.
export function ensureFoe(save, key) {
  if (!save.nemesis) normalizeNemesis(save);
  const N = save.nemesis;
  if (!N.cur) { N.n++; N.cur = makeNemesis(nemesisSeed(save), N.n, key); }
  return N.cur;
}

// ---- the director ----
// deps: state (the world), persist() (writes the save), dateKey(), addSalvage(n, kind, label), phoneFx, hullNow() (the main ship's hull %), curStop(), stopName(stop)
export function createNemesis({ state, persist, dateKey, addSalvage, phoneFx, hullNow, stopNameOf }) {
  const on = () => NM().ENABLED && config.BOOK.ENABLED && !!state.run && !config.PVP.ENABLED && state.mode !== 'versus';
  const foe = () => (state.save && state.save.nemesis && state.save.nemesis.cur) || null;
  const mom = (kind, o) => (state.moment ? state.moment(kind, o) : null);
  const R = () => (state.run && state.run.nemesis) || null;
  const lastCol = () => state.run.voyage.columns.length - 1;

  // A new voyage: the captain the Book remembers (or a new one) and a fresh arc.
  const begin = () => {
    const run = state.run;
    if (!on()) { run.nemesis = null; return null; }
    const f = ensureFoe(state.save, dateKey());
    run.nemesis = { voyageNo: run.voyageNo, dueCol: NM().FIRST_COL, meetings: 0, plan: null, rumour: false, watch: null, slain: false, escapes: 0, ours: 0, final: false };
    return run.nemesis;
  };

  // A stop begins: is she here? Returns the plan or null; r.rumour says the first stop should name her ("still out there").
  const stopPlan = (stop) => {
    const r = R();
    if (!r || !on() || !stop) return null;
    if (r.voyageNo !== state.run.voyageNo) Object.assign(r, { voyageNo: state.run.voyageNo, dueCol: NM().FIRST_COL, meetings: 0 }); // (the second voyage of a campaign: a fresh arc)
    finish(); // (a watch left open by a stop that ended without her leaving)
    r.plan = null;
    r.rumour = false;
    const f = foe();
    if (!f) return null;
    if (NM().BRIEF.RUMOUR && (f.meets | 0) > 0 && r.meetings === 0 && stop.col === (state.run.voyageNo > 1 ? 1 : 0)) r.rumour = true;
    r.plan = planFor(r, stop, lastCol(), state.course);
    return r.plan;
  };

  // The pacing director asks: should the next set piece be HER (instead of the ordinary gunship)?
  const wants = (tp) => {
    const r = R(), p = r && r.plan;
    return !!p && !p.met && !state.gunship && !tp.big && tp.peaks >= NM().AFTER_PEAKS;
  };

  // The words of her briefing card: the headline, and a smaller line (what she remembers). plan null = the rumour at a voyage's first stop.
  const briefLines = (plan) => {
    const f = foe(), r = R();
    if (!f) return { level: 0, line: '', sub: '' };
    const s = wordsOf(f, plan || { final: false }, state.shipName), m = f.meets | 0;
    const times = m === 1 ? 'once' : m === 2 ? 'twice' : m + ' times';
    if (!plan) return { level: levelOf(f), line: `THE ${nameWords(f)} IS STILL OUT THERE`, sub: `The Book says: met ${times}, ${f.escapes | 0} driven off, ${f.ours | 0} ship${(f.ours | 0) === 1 ? '' : 's'} bested. ${s.taunt}` };
    return { level: levelOf(f), line: s.approach, sub: m ? `Met ${times} before. ${s.taunt}` : `A new captain. Learn her colours: ${f.word.toLowerCase()} and a ${f.beast.toLowerCase()}.` };
  };

  // What to hand gunship.spawn() for her: her seed, her look, her hull class, her strength and her words. undefined when it is an ordinary gunship.
  const spawnOpts = () => {
    const r = R(), p = r && r.plan, f = foe();
    if (!p || p.met || !f || !on()) return undefined;
    const S = strengthOf(f, p.final), say = wordsOf(f, p, state.shipName);
    const lap = state.course ? state.course.lap || 1 : 1;
    return { seed: f.seed, hull: NM().HULL, layout: f.layout, personality: f.personality, look: f.look, name: f.name, mission: lap + Math.floor(S.level / 2),
      nemesis: { id: f.n, name: f.name, handle: f.handle, level: S.level, n: p.n, final: p.final, hpMul: S.hpMul, cap: S.cap, say, look: f.look } };
  };

  // She has appeared (the spawn worked): the meeting counts, the save remembers, the Log and the phones are told.
  const met = (o) => {
    const r = R(), p = r.plan, f = foe(), nm = o.nemesis;
    p.met = true;
    r.meetings++;
    r.dueCol = p.col + NM().GAP;
    r.final = p.final;
    f.meets = (f.meets | 0) + 1;
    f.last = dateKey();
    f.lastStop = p.stopName || stopNameOf(p.stopId);
    persist();
    r.watch = { hull0: hullNow(), min: hullNow(), holes: state.gasHoles.length, breaches: state.breaches.length, newHoles: 0, newBreach: 0, hole: null, breach: null, out: null, final: p.final, n: p.n };
    mom('nemesis-met', { where: null, data: { name: f.name, n: nm.n, level: nm.level, again: nm.level > 0 ? 1 : 0, final: p.final ? 1 : 0 } });
    for (const pl of Object.values(state.players)) if (!pl.bot && !pl.mate && phoneFx) phoneFx(pl, nm.say.approach, [80, 50, 80], NM().PHONE_MS);
  };

  // The headline of the set piece: hers once she is on stage (the same words the spawn said, so the arbiter merges them).
  const headline = () => { const r = R(); return r && r.plan && r.plan.met && state.gunship && state.gunship.nemesis ? state.gunship.nemesis.say.approach : null; };

  const hullFloor = (g) => { // before the final showdown a shell cannot sink her: her hull stops at FLOOR (a charge or her taken helm still can)
    const st = g.asShip ? g.ship.state : null, f = NM().FLOOR * 100;
    if (st) { if (st.hull < f && st.hull > 0 && !(st.down > 0)) st.hull = f; } else if (g.hp != null && g.hp < f * g.max / 100 && g.hp > 0) g.hp = f * g.max / 100;
  };

  // Once per flying step, after gunship.update: watch her visit.
  const update = () => {
    const r = R();
    if (!r || !on()) return;
    const w = r.watch, g = state.gunship;
    if (!w) return;
    if (!g || !g.nemesis) { finish(); return; }
    const h = hullNow();
    if (h < w.min) w.min = h;
    const hn = state.gasHoles.length, bn = state.breaches.length;
    if (hn > w.holes) { w.newHoles += hn - w.holes; w.hole = state.gasHoles[hn - 1] || w.hole; }
    if (bn > w.breaches) { w.newBreach += bn - w.breaches; w.breach = state.breaches[bn - 1] || w.breach; }
    w.holes = hn;
    w.breaches = bn;
    if (!w.final && !g.charge && !g.captured && g.phase !== 'sinking') hullFloor(g);
    if (!w.out && g.phase === 'leaving') {
      w.out = g.fled ? 'escape' : 'left';
      if (g.fled) escaped(g);
    } else if (!w.out && g.phase === 'sinking') {
      w.out = 'down';
      slain(g);
    }
  };

  const escaped = (g) => {
    const f = foe(), r = R();
    if (!f) return;
    f.escapes = (f.escapes | 0) + 1;
    r.escapes++;
    persist();
    mom('nemesis-escape', { who: g.escapedBy ? [g.escapedBy] : undefined, where: null, data: { name: f.name, vow: g.nemesis.say.vow, how: g.blast ? 'charge' : 'run' } });
    if (state.run) state.run.gunships++;
    addSalvage(g.blast ? config.SALVAGE.GUNSHIP_BOARDED * NM().BLAST_PAY : config.SALVAGE.GUNSHIP_SHOT * NM().ESCAPE_PAY, 'gunships', `${f.name} driven off`);
  };

  const slain = (g) => {
    const r = R();
    const flag = slayFoe(state.save, state.shipName, (r.plan && (r.plan.stopName || stopNameOf(r.plan.stopId))), dateKey());
    r.slain = true;
    persist();
    if (flag) state.lastFlag = flag;
  };

  // Her visit is over (she is gone, or the stop ended): a scar for the Log if she hurt the ship.
  function finish() {
    const r = R(), w = r && r.watch;
    if (!w) return;
    r.watch = null;
    if (r.plan) r.plan.done = true;
    const N = NM().SCAR, loss = Math.round(w.hull0 - w.min), f = foe() || (state.save.nemesis.fallen.slice(-1)[0]) || null;
    if (!f || (loss < N.HULL && w.newHoles < N.HOLES)) return;
    mom('nemesis-scar', { where: null, data: { name: f.name, names: [scarOf(w)], loss, holes: w.newHoles } });
  }
  // Where she hurt the ship: "the aft bag", "the fore bag" (a hole in the canvas), or a deck ("the main deck").
  function scarOf(w) {
    try {
      const L = state.ships[0].layout, mid = L.midPoint.x;
      if (w.newHoles >= 1 && w.hole) return L.gasbags.length > 1 ? (w.hole.x >= mid ? 'fore bag' : 'aft bag') : 'gasbag';
      const d = w.breach && L.platforms[w.breach.d];
      if (d && d.name) return d.name.toLowerCase();
    } catch { /* fall through */ }
    return 'hull';
  }

  // The ship was lost or limped home while she was still about: she beat the ship this time.
  const bested = (how) => {
    const r = R(), w = r && r.watch, g = state.gunship, f = foe();
    if (!r || !f || !w || w.out === 'down' || w.out === 'escape') return;
    if (!g || !g.nemesis) return;
    f.ours = (f.ours | 0) + 1;
    r.ours++;
    persist();
    mom('nemesis-won', { where: null, data: { name: f.name, how } });
  };

  // A stop ended (the scorecard): her visit is closed for the Log.
  const endStop = () => finish();

  // The voyage is over (victory or lost): her tally, the postcard line, the save.
  const endRun = (e) => {
    const r = R();
    if (!r || !on()) return;
    finish();
    const f = foe(), last = state.save.nemesis.fallen.slice(-1)[0];
    if (f) { f.voyages = (f.voyages | 0) + 1; f.last = dateKey(); }
    if (r.meetings === 0 && !r.slain) return persist();
    const who = f || (r.slain ? last : null);
    if (who) {
      e.nemesis = { name: who.name, handle: who.handle, look: who.look, out: !!f, met: r.meetings, escapes: r.escapes, ours: r.ours, slain: r.slain, final: r.final, meets: who.meets | 0 };
      const text = r.slain ? `${who.name} went down for good, and the crew hung her flag in the book.` : `${who.name} is still out there, and she has not forgotten this ship.`;
      const last2 = e.lines && e.lines.length ? e.lines[e.lines.length - 1] : null;
      (e.lines ||= []).push({ no: last2 ? last2.no : e.reached, name: last2 ? last2.name : e.stopName, first: false, text, kind: r.slain ? 'nemesis-slain' : 'nemesis-out', who: [] });
    }
    persist();
  };

  return { begin, stopPlan, wants, briefLines, spawnOpts, met, headline, update, bested, endStop, endRun, foe, on, finish, plan: () => (R() ? R().plan : null) };
}
