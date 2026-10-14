// The Voyage: a branching route map of stops, generated from a seed at the start of a run,
// plus the little bit of saved progress (best run, total runs, unlocks) kept on the TV.
import { config } from '../../config.js';
import { normalizeBook } from './book.js'; // (save v3: the ship's book, book.js)

const mulberry = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const envInfo = (id) => config.VOYAGE.ENVIRONMENTS[id] || config.VOYAGE.ENVIRONMENTS.skyisles;

export const modeInfo = (id) => config.VOYAGE.MODES[id] || config.VOYAGE.MODES[config.VOYAGE.START_MODE];

// Connect each column to the next: every stop leads somewhere and every stop is reachable.
function connectColumns(columns, rand, n) {
  for (let c = 0; c < n - 1; c++) {
    const a = columns[c];
    const b = columns[c + 1];
    const pos = (list, i) => (list.length === 1 ? 0.5 : i / (list.length - 1));
    a.forEach((s, i) => {
      const order = b.map((t, j) => ({ t, d: Math.abs(pos(b, j) - pos(a, i)) + rand() * 0.25 })).sort((x, y) => x.d - y.d);
      const links = Math.min(b.length, 1 + (rand() < 0.45 ? 1 : 0));
      for (let k = 0; k < links; k++) s.next.push(order[k].t.id);
    });
    b.forEach((t, j) => {
      if (a.some((s) => s.next.includes(t.id))) return;
      const s = a.reduce((best, x, i) => (Math.abs(pos(a, i) - pos(b, j)) < Math.abs(pos(a, best) - pos(b, j)) ? i : best), 0);
      a[s].next.push(t.id);
    });
  }
}

// columns[c] = list of stops { id, col, row, env, play, kind, danger, reward, flagship, next: [ids] }.
// env = the planned environment (shown); play = what actually flies (Sky Isles until others exist).
// opts: { gentle: true = the first stop is never an outpost raid (the Sparrow's start, S.6), mode: a key of config.VOYAGE.MODES, voyageNo: 2 for the harder second voyage of a campaign, which
// starts at a harbour (a stop that is not flown: the crew is docked there, then votes where to go) }.
function generateLegacy(seed, opts = {}) {
  const V = config.VOYAGE;
  const mode = modeInfo(opts.mode);
  const second = (opts.voyageNo || 1) > 1;
  const bonus = second ? V.SECOND.DANGER_BONUS : 0;
  const h = second ? 1 : 0; // (the harbour column)
  const rand = mulberry(seed);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const n = ri(mode.stopsMin, mode.stopsMax) + h;
  const envIds = Object.keys(V.ENVIRONMENTS).filter((e) => e !== 'skyisles' && e !== 'aether');
  const kinds = config.MAPS.KINDS;
  const columns = [];
  for (let c = 0; c < n; c++) {
    const count = c === 0 || c === n - 1 ? 1 : ri(V.CHOICES_MIN, V.CHOICES_MAX);
    const col = [];
    const used = new Set();
    for (let r = 0; r < count; r++) {
      const last = c === n - 1;
      let env = c === 0 ? 'skyisles' : last ? 'aether' : envIds[ri(0, envIds.length - 1)];
      for (let tries = 0; tries < 6 && used.has(env) && !last && c > 0; tries++) env = envIds[ri(0, envIds.length - 1)]; // (different choices in a column)
      used.add(env);
      const ramp = Math.max(0, Math.min(1, (c - h) / Math.max(1, n - h - 2))); // 0 at the first stop flown, 1 at the last before the Flagship
      const danger = last ? 3 + bonus : c === 0 ? 1 : Math.max(1, Math.min(3 + bonus, Math.round(1 + ramp * mode.dangerRamp + (rand() - 0.5) * 1.4) + bonus));
      col.push({
        id: c + '.' + r,
        col: c,
        row: r,
        env,
        play: V.ENVIRONMENTS[env] && V.ENVIRONMENTS[env].ready ? env : 'skyisles',
        kind: last ? 'network' : ((k) => (opts.gentle && c === h && k === 'open' ? 'network' : k))(kinds[ri(0, kinds.length - 1)]), // (gentle: the first stop flown is never an outpost raid - a small ship with no bomb bay learns the ropes in a cave run)
        danger,
        reward: V.REWARD_BASE + danger * V.REWARD_PER_DANGER + ri(0, V.REWARD_RANDOM),
        flagship: last,
        harbour: second && c === 0,
        next: [],
      });
    }
    columns.push(col);
  }
  markLairs(columns, seed, n, h);
  connectColumns(columns, rand, n);
  return { seed, columns, mode: opts.mode, voyageNo: opts.voyageNo || 1 };
}

// With config.VOYAGE.CURRICULUM.ENABLED the stops follow the teaching table (generateCurriculum); without it the old dice (generateLegacy, exactly as it was).
// A curriculum route adds to each stop: slot (its row in the table), share (0..1 along the route), base (the column's base skulls), gates (the set pieces the pacing director may call there), and the optional
// flags tag (the route map's "NEW: ..." text), ring ('tower' | 'fortress' | 'citadel'), nemesis (the Nemesis may appear) and multi (a multi-part objective, G6).
// F1: opts.gentle (a start ship with no bomb bay) gives every stop a slack (wider cave tunnels, config.VOYAGE.CURRICULUM.WIDE_CAVES); opts.classic (the full ship) adds a real set piece to stop 1 (CLASSIC_STOP1).
export function generateVoyage(seed, opts = {}) {
  return config.VOYAGE.CURRICULUM && config.VOYAGE.CURRICULUM.ENABLED ? generateCurriculum(seed, opts) : generateLegacy(seed, opts);
}

// ---- The teaching curriculum (config.VOYAGE.CURRICULUM, LOOP.md "The ramp") ----
const CU = () => config.VOYAGE.CURRICULUM;
// The table rows for a session mode (a mode may name another's table).
export const curriculumTable = (modeId) => {
  const T = CU().TABLES;
  let t = T[modeId] || T[config.VOYAGE.START_MODE];
  if (typeof t === 'string') t = T[t];
  return t;
};
// A row's env list as sky ids ('A' / 'B' name a tier).
export const envsOf = (list) => [...new Set(list.flatMap((e) => CU().TIERS[e] || [e]))];
// How deep into the skies an env is: 0 Sky Isles, 1 tier A, 2 tier B, 3 the Aether.
export const envTier = (env) => (env === 'skyisles' ? 0 : env === 'aether' ? 3 : CU().TIERS.A.includes(env) ? 1 : CU().TIERS.B.includes(env) ? 2 : 1);
// The ship power a crew should have arriving at a stop (CURRICULUM.POWER_CURVE, stretched over the route by the stop's share of it).
export const expectedPower = (stop) => { const c = CU().POWER_CURVE; return c[Math.round((stop.share || 0) * (c.length - 1))]; };

function generateCurriculum(seed, opts = {}) {
  const V = config.VOYAGE;
  const C = V.CURRICULUM;
  const mode = modeInfo(opts.mode);
  const table = curriculumTable(opts.mode);
  const second = (opts.voyageNo || 1) > 1;
  const bonus = second ? V.SECOND.DANGER_BONUS : 0;
  const h = second ? 1 : 0; // (the harbour column)
  const rand = mulberry(seed);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const n = ri(mode.stopsMin, mode.stopsMax) + h;
  const m = n - h; // (columns flown)
  const maxD = 3 + bonus;
  const s0 = second ? C.SECOND_START / (C.POWER_CURVE.length - 1) : 0; // (the second voyage starts partway along the table)
  const columns = [];
  for (let c = 0; c < n; c++) {
    const last = c === n - 1;
    const share = c < h ? 0 : s0 + ((c - h) / Math.max(1, m - 1)) * (1 - s0);
    const slot = Math.round(share * (table.length - 1));
    const e = table[slot];
    const base = last ? maxD : c < h ? 1 : Math.min(maxD, e.danger + bonus);
    const count = c === 0 || last ? 1 : ri(V.CHOICES_MIN, V.CHOICES_MAX);
    const easyRow = ri(0, count - 1); // (this branch is always at the column's base skulls)
    const envIds = envsOf(e.env);
    const col = [];
    const usedEnv = new Set();
    const usedKind = new Set();
    for (let r = 0; r < count; r++) {
      let env = c < h ? 'skyisles' : envIds[ri(0, envIds.length - 1)];
      for (let tries = 0; tries < 6 && usedEnv.has(env) && envIds.length > 1 && c >= h; tries++) env = envIds[ri(0, envIds.length - 1)]; // (different choices in a column)
      usedEnv.add(env);
      const danger = last || r === easyRow ? base : Math.min(maxD, base + (rand() < C.BRANCH_UP ? 1 : 0));
      let kinds = e.kinds;
      if (opts.classic && !second && c === h && C.CLASSIC_STOP1.ENABLED && C.CLASSIC_STOP1.KIND) kinds = [C.CLASSIC_STOP1.KIND]; // (F1: ...and a real map: an outpost raid, where the ground guns shoot back)
      if (opts.gentle && slot <= 1 && r === easyRow && kinds.includes('open')) kinds = kinds.filter((k) => k !== 'open'); // (gentle: a small ship with no bomb bay always has a way round an outpost raid in the first columns)
      let kind = kinds[ri(0, kinds.length - 1)];
      for (let tries = 0; tries < 4 && usedKind.has(kind) && kinds.length > 1; tries++) kind = kinds[ri(0, kinds.length - 1)];
      usedKind.add(kind);
      const stop = {
        id: c + '.' + r,
        col: c,
        row: r,
        env,
        play: V.ENVIRONMENTS[env] && V.ENVIRONMENTS[env].ready ? env : 'skyisles',
        kind: last ? 'network' : kind,
        danger,
        reward: V.REWARD_BASE + danger * V.REWARD_PER_DANGER + ri(0, V.REWARD_RANDOM),
        flagship: last,
        harbour: second && c === 0,
        next: [],
        slot,
        share: +share.toFixed(4),
        base,
        gates: e.gates.slice(),
      };
      if (opts.gentle && !second && C.WIDE_CAVES.ENABLED) stop.slack = C.WIDE_CAVES.SLACK[Math.round(share * (C.WIDE_CAVES.SLACK.length - 1))]; // (F1: a small ship's caves are wide at first and narrow down to the normal ones, so she is not grinding her keel on the way to the stops that teach)
      if (opts.classic && !second && c === h && C.CLASSIC_STOP1.ENABLED) { stop.gates = [...new Set([...stop.gates, ...C.CLASSIC_STOP1.GATES])]; stop.danger = Math.min(maxD, stop.danger + C.CLASSIC_STOP1.DANGER_ADD); stop.early = true; } // (F1: the classic ship keeps a real threat at stop 1)
      if (e.nemesis && !last) stop.nemesis = true;
      if (e.multi && !last) stop.multi = true;
      col.push(stop);
    }
    columns.push(col);
  }
  curriculumRings(columns, seed, table);
  curriculumLairs(columns, seed, n, h, table);
  titanLair(columns, seed, n, h, second);
  curriculumTags(columns, h);
  connectColumns(columns, rand, n);
  return { seed, columns, mode: opts.mode, voyageNo: opts.voyageNo || 1, curriculum: true };
}

// Lairs under the curriculum: only in a slot with lair: true, at LAIR_FROM of the route or later, as many as markLairs would (config.CREATURES.LAIR.COUNT), never two columns in a row, never the Flagship.
// Only a stop already in its creature's sky can hold one (Kraken in the sea, Drake in the Ember Forge, Thunderbird in the storm), never a ring stop, and a column always keeps a branch at or under its base skulls
// (the lair is never its only easy way). Like markLairs this has a random stream of its own and changes nothing but the lair stop, so a route without lairs is the same route (tools/creature-check.mjs holds it to that).
const lairHomes = (col) => col.filter((s) => config.CREATURES.LAIR.BY_ENV[s.env] && !s.ring && col.some((o) => o !== s && o.danger <= o.base));
function curriculumLairs(columns, seed, n, h, table) {
  const LR = config.CREATURES.LAIR;
  const rand = mulberry((seed ^ 0x6c616972) >>> 0);
  const count = n - h >= LR.LONG_STOPS ? LR.COUNT.long : LR.COUNT.short;
  const cols = [];
  for (let c = h; c <= n - 2; c++) {
    const s = columns[c][0];
    if (table[s.slot].lair && s.share >= CU().LAIR_FROM && lairHomes(columns[c]).length) cols.push(c);
  }
  for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; } // (shuffled)
  const chosen = [];
  for (const c of cols) {
    if (chosen.length >= count) break;
    if (chosen.every((x) => Math.abs(x - c) > 1)) chosen.push(c);
  }
  for (const c of chosen) {
    const homes = lairHomes(columns[c]);
    const s = homes[Math.floor(rand() * homes.length)];
    s.lair = true;
    s.creature = LR.BY_ENV[s.env];
    s.kind = 'lair';
    s.danger += LR.DANGER;
    s.reward = Math.round(s.reward * LR.REWARD_MUL);
    delete s.nemesis;
    delete s.multi;
  }
}

// THE ISLAND TITAN'S LAIR (BOSSES.md 2.7, C.6c; config.CREATURES.TITAN.LAIR): the gentle tutorial boss stands on an EARLY Sky Isles stop - ONE of the Sky Isles stops of the column COLUMN after the first stop flown (the second stop of the
// first voyage), guaranteed, in a route of MIN_STOPS flown stops or more (a 4-stop QUICK route keeps its late lair). It is a lair like the others (kind 'lair', its own map, no zeppelin) but only bats and imps fly with it, +DANGER skulls
// and x REWARD_MUL reward, and the column keeps a branch at or under its base skulls (a lair is never the only easy way). Its own random stream, so a route without it is the same route; no Titan next to another lair, and none
// in the second voyage of a campaign (that starts deeper in the table, with no Sky Isles).
function titanLair(columns, seed, n, h, second) {
  const TL = config.CREATURES.TITAN.LAIR;
  if (!TL.ENABLED || second || n - h < TL.MIN_STOPS) return;
  const c = h + TL.COLUMN, col = columns[c];
  if (!col || c >= n - 1 || [c - 1, c + 1].some((x) => columns[x] && columns[x].some((s) => s.lair))) return;
  const rand = mulberry((seed ^ 0x7469746e) >>> 0);
  const homes = col.filter((s) => s.env === 'skyisles' && !s.ring && !s.lair && !s.harbour && !s.flagship && col.some((o) => o !== s && o.danger <= o.base));
  if (!homes.length) return;
  const s = homes[Math.floor(rand() * homes.length)];
  s.lair = true;
  s.creature = 'titan';
  s.kind = 'lair';
  s.danger = Math.max(1, s.danger + TL.DANGER);
  s.reward = Math.round(s.reward * TL.REWARD_MUL);
  s.gates = ['swarm', 'imps'];
  delete s.nemesis;
  delete s.multi;
}

// The ring flags (LOOP.md 3D add-on): a slot with ring: 'tower' / 'fortress' flags one stop of its column (a lair never takes it), 'citadel' the Flagship. The stop is flown on the ring map (kind 'ring', maps.js
// buildRingMap; the Flagship's too); with config.RING.ENABLED false it keeps the old outpost raid ('open', the Flagship her cave run). Marked before the lairs, so a lair-free route has the same ring.
function curriculumRings(columns, seed, table) {
  const rand = mulberry((seed ^ 0x72696e67) >>> 0);
  for (const col of columns) {
    const e = table[col[0].slot];
    if (!e.ring || col[0].harbour) continue;
    const s = col[Math.floor(rand() * col.length)];
    s.ring = e.ring;
    if (config.RING.ENABLED) s.kind = 'ring';
    else if (!s.flagship) s.kind = 'open';
  }
}

// The route map's tiny tag per stop: a set piece first allowed in its column ("NEW: GUNSHIPS"), else a sky the route has not shown yet ("NEW: DARK"). Lairs and salvage runs have their own labels.
function curriculumTags(columns, h) {
  const C = CU();
  const seenEnv = new Set(['skyisles']);
  let prev = null;
  for (let c = h; c < columns.length; c++) {
    const col = columns[c];
    const newGate = prev && ['gunship', 'strafers', 'bombers'].find((g) => col[0].gates.includes(g) && !prev.includes(g));
    for (const s of col) {
      if (s.flagship || s.lair) continue;
      const tag = newGate ? C.GATE_TAGS[newGate] : seenEnv.has(s.env) ? '' : C.ENV_TAGS[s.env] || '';
      if (tag) s.tag = tag;
    }
    for (const s of col) seenEnv.add(s.env);
    prev = col[0].gates;
  }
}

// GIANT CREATURE LAIRS (config.CREATURES.LAIR, BOSSES.md 3.1 "Voyage"): 1 middle stop (2 when the voyage has config.CREATURES.LAIR.LONG_STOPS columns or more) holds a Kraken. ONLY a Sunken Sea stop can (the
// creature needs water), never the first stop flown (column h) nor the Flagship, never two columns in a row. A lair is +DANGER skulls and pays x REWARD_MUL; its kind is 'lair' (an open sky over the sea,
// maps.js buildLairMap). It has a random stream of its own, so the rest of a seeded route is exactly what it was before lairs existed.
function markLairs(columns, seed, n, h) {
  const LR = config.CREATURES.LAIR;
  const rand = mulberry((seed ^ 0x6c616972) >>> 0);
  const count = n - h >= LR.LONG_STOPS ? LR.COUNT.long : LR.COUNT.short;
  const cols = [];
  for (let c = h + 1; c <= n - 2; c++) if (columns[c].some((s) => LR.BY_ENV[s.env])) cols.push(c); // (a Sunken Sea stop holds the Kraken, an Ember Forge stop the Cinder Drake: C.6a)
  for (let i = cols.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cols[i], cols[j]] = [cols[j], cols[i]]; } // (shuffled)
  const chosen = [];
  for (const c of cols) {
    if (chosen.length >= count) break;
    if (chosen.every((x) => Math.abs(x - c) > 1)) chosen.push(c);
  }
  for (const c of chosen) {
    const seas = columns[c].filter((s) => LR.BY_ENV[s.env]);
    const s = seas[Math.floor(rand() * seas.length)];
    s.lair = true;
    s.creature = LR.BY_ENV[s.env]; // 'kraken' | 'drake' | 'thunderbird'
    s.kind = 'lair';
    s.danger += LR.DANGER;
    s.reward = Math.round(s.reward * LR.REWARD_MUL);
  }
}

export const stopById = (voyage, id) => {
  for (const col of voyage.columns) for (const s of col) if (s.id === id) return s;
  return null;
};

// The look and words of a lair by its creature ('kraken' | 'drake' | 'thunderbird'): { ICON, LABEL, NAME, KIND }.
export const lairOf = (creature) => (creature === 'wyrm' ? config.CREATURES.WYRM.LAIR : creature === 'titan' ? config.CREATURES.TITAN.LAIR : creature === 'thunderbird' ? config.CREATURES.THUNDERBIRD.LAIR : creature === 'drake' ? config.CREATURES.DRAKE.LAIR : config.CREATURES.LAIR);
export const stopName = (s) => (s.flagship ? 'The Flagship' : s.harbour ? 'The Harbour' : s.lair ? lairOf(s.creature).NAME : envInfo(s.env).name);

// Stop numbers run on across the voyages of a campaign: run.base = stops finished before this voyage's harbour.
export const stopNo = (run, s) => run.base + s.col + 1;
export const stopTotal = (run) => run.base + run.voyage.columns.length;

// ---- Daily voyage: the route seed and a playful 1930s name come from today's date ----
const NAME_ADJ = ['Rusty', 'Grumpy', 'Gallant', 'Dented', 'Wobbly', 'Singing', 'Brass', 'Sleepy', 'Daring', 'Lucky', 'Soggy', 'Whistling', 'Patched', 'Tipsy', 'Humble', 'Roaring', 'Peculiar', 'Gilded', 'Moth-Eaten', 'Bashful', 'Jolly', 'Cranky', 'Mighty', 'Hiccuping', 'Plucky', 'Dapper'];
const NAME_NOUN = ['Kettle', 'Teapot', 'Biscuit', 'Kipper', 'Crumpet', 'Walrus', 'Goose', 'Sprocket', 'Trombone', 'Pudding', 'Barnacle', 'Marmot', 'Gasket', 'Umbrella', 'Weathervane', 'Spanner', 'Pigeon', 'Teacup', 'Bloater', 'Cuckoo', 'Whisk', 'Lantern', 'Haddock', 'Bagpipe', 'Porridge', 'Thimble'];
const NAME_FORMS = [(a, n) => 'Voyage of the ' + a + ' ' + n, (a, n) => 'The ' + a + ' ' + n + ' Expedition', (a, n) => 'Flight of the ' + a + ' ' + n, (a, n) => 'The Great ' + n + ' Run'];
const pad2 = (v) => String(v).padStart(2, '0');
export const dateKey = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
// Everyone playing on the same day gets the same name and the same route map.
export function dailyVoyage(d = new Date()) {
  const key = dateKey(d);
  let seed = 2166136261; // (FNV hash of the date text)
  for (const ch of key) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rand = mulberry(seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  return { key, seed: seed & 0x7fffffff, name: pick(NAME_FORMS)(pick(NAME_ADJ), pick(NAME_NOUN)) };
}

// ---- Saved progress on this TV (never let storage problems break the game) ----
const KEY = 'airshipVoyage';
// daily: { date, best: { <mode>: { stops, victory, salvage } } } - the best result for today's daily voyage, per mode.
// build: the ship of the last voyage as a parts list ({ v: 1, parts: [...], log: [{ id, name }], voyageNo }): written at every part bought at the sky-dock (simulation.js persistBuild), so a campaign's second voyage
// keeps the ship it built (and the Captain's Log can show it). Tolerant: a save without it, or with a build that does not look like a parts list, just has none.
// SAVE v3 (SHIPS_BOOK.md L2, book.js): ship = the ship afloat { name, born, voyages, victories, stops, salvage } or null; book = one page per voyage (the postcard's data), oldest first; fleet = the ships she followed and lost;
// crew = a record for every human who has flown, by name. A v1 / v2 save has none of these and gets a blank book: the old fields are never dropped, and the old text is kept aside once (airshipVoyage.v1 / .v2, and .bad for a save that
// would not parse) so nothing can be lost by moving up.
const blank = () => ({ version: 3, bestStops: 0, bestSalvage: 0, totalRuns: 0, victories: 0, unlocks: [], daily: null, build: null, ship: null, book: [], fleet: [], crew: {} });
export const validBuild = (b) => !!b && typeof b === 'object' && b.v === 1 && Array.isArray(b.parts) && b.parts.length > 0 && b.parts.every((p) => p && typeof p === 'object' && typeof p.part === 'string');
const keepAside = (suffix, raw) => { try { const k = KEY + '.' + suffix; if (raw && localStorage.getItem(k) == null) localStorage.setItem(k, raw); } catch { /* (full or blocked) */ } };
// Any stored text -> a v3 save (also used by tools/book-check.mjs for the v1 / v2 fixtures).
export function upgradeSave(raw) {
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { keepAside('bad', raw); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};
  const was = Number.isFinite(parsed.version) ? parsed.version : 1;
  if (raw && was < 3) keepAside('v' + was, raw);
  const v = { ...blank(), ...parsed };
  if (!v.daily || typeof v.daily !== 'object' || !v.daily.best || typeof v.daily.best !== 'object') v.daily = null; // (tolerate odd saves)
  if (!Array.isArray(v.unlocks)) v.unlocks = [];
  if (!validBuild(v.build)) v.build = null;
  else if (!Array.isArray(v.build.log)) v.build.log = [];
  v.version = 3;
  return normalizeBook(v);
}
export function loadVoyageSave() {
  try {
    return upgradeSave(localStorage.getItem(KEY));
  } catch {
    return blank();
  }
}
export function saveVoyageSave(v) {
  if (config.PVP.ENABLED) return; // (a Versus game never writes the co-op saves)
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}

// Today's best daily result for a mode, or null.
export const dailyBest = (save, key, mode) => (save.daily && save.daily.date === key && save.daily.best[mode]) || null;
// Record a finished daily voyage: it counts as better with a victory, else more stops, else more salvage.
// Returns true when it is today's new best. (Yesterday's results are dropped.)
export function recordDaily(save, key, mode, r) {
  if (!save.daily || save.daily.date !== key) save.daily = { date: key, best: {} };
  const old = save.daily.best[mode];
  const score = (x) => (x.victory ? 1e6 : 0) + x.stops * 1000 + Math.min(999, x.salvage);
  if (old && score(old) >= score(r)) return false;
  save.daily.best[mode] = { stops: r.stops, victory: !!r.victory, salvage: r.salvage };
  return true;
}

// ---- Which session mode the lobby has chosen (remembered on this TV) ----
const PREF_KEY = 'airshipMode';
export function loadModePrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY)) || {};
    return { mode: config.VOYAGE.MODES[p.mode] ? p.mode : config.VOYAGE.START_MODE, daily: !!p.daily };
  } catch {
    return { mode: config.VOYAGE.START_MODE, daily: false };
  }
}
export function saveModePrefs(p) {
  if (config.PVP.ENABLED) return;
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ mode: p.mode, daily: !!p.daily }));
  } catch {
    // ignore
  }
}

// ---- Which ship a new voyage starts with (remembered on this TV): the Sparrow, or the classic full ship ----
const SHIP_KEY = 'airshipShip';
export const START_BUILDS = ['sparrow', 'classic'];
export function loadStartBuild() {
  try {
    const v = localStorage.getItem(SHIP_KEY);
    return START_BUILDS.includes(v) ? v : config.VOYAGE.START_BUILD;
  } catch {
    return config.VOYAGE.START_BUILD;
  }
}
// Has the host ever forced a ship with the Ship button (F1: if not, CAST OFF picks the ship by the crew size, config.VOYAGE.START_BUILD_BY_CREW)?
export function hasSavedBuild() {
  try {
    return START_BUILDS.includes(localStorage.getItem(SHIP_KEY));
  } catch {
    return false;
  }
}
export function saveStartBuild(id) { // (null = back to choosing by the crew size)
  try {
    if (id == null) localStorage.removeItem(SHIP_KEY);
    else localStorage.setItem(SHIP_KEY, id);
  } catch {
    // ignore
  }
}
