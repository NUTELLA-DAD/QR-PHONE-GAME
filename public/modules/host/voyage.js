// The Voyage: a branching route map of stops, generated from a seed at the start of a run,
// plus the little bit of saved progress (best run, total runs, unlocks) kept on the TV.
import { config } from '../../config.js';

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

// columns[c] = list of stops { id, col, row, env, play, kind, danger, reward, flagship, next: [ids] }.
// env = the planned environment (shown); play = what actually flies (Sky Isles until others exist).
// opts: { gentle: true = the first stop is never an outpost raid (the Sparrow's start, S.6), mode: a key of config.VOYAGE.MODES, voyageNo: 2 for the harder second voyage of a campaign, which
// starts at a harbour (a stop that is not flown: the crew is docked there, then votes where to go) }.
export function generateVoyage(seed, opts = {}) {
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
  // Connect each column to the next: every stop leads somewhere and every stop is reachable.
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
  return { seed, columns, mode: opts.mode, voyageNo: opts.voyageNo || 1 };
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
    s.creature = LR.BY_ENV[s.env]; // 'kraken' | 'drake'
    s.kind = 'lair';
    s.danger += LR.DANGER;
    s.reward = Math.round(s.reward * LR.REWARD_MUL);
  }
}

export const stopById = (voyage, id) => {
  for (const col of voyage.columns) for (const s of col) if (s.id === id) return s;
  return null;
};

// The look and words of a lair by its creature ('kraken' | 'drake'): { ICON, LABEL, NAME, KIND }.
export const lairOf = (creature) => (creature === 'drake' ? config.CREATURES.DRAKE.LAIR : config.CREATURES.LAIR);
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
const blank = () => ({ version: 2, bestStops: 0, bestSalvage: 0, totalRuns: 0, victories: 0, unlocks: [], daily: null, build: null });
export const validBuild = (b) => !!b && typeof b === 'object' && b.v === 1 && Array.isArray(b.parts) && b.parts.length > 0 && b.parts.every((p) => p && typeof p === 'object' && typeof p.part === 'string');
export function loadVoyageSave() {
  try {
    const v = { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
    if (!v.daily || typeof v.daily !== 'object' || !v.daily.best || typeof v.daily.best !== 'object') v.daily = null; // (tolerate odd saves)
    if (!Array.isArray(v.unlocks)) v.unlocks = [];
    if (!validBuild(v.build)) v.build = null;
    else if (!Array.isArray(v.build.log)) v.build.log = [];
    v.version = 2;
    return v;
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
export function saveStartBuild(id) {
  try {
    localStorage.setItem(SHIP_KEY, id);
  } catch {
    // ignore
  }
}
