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

// columns[c] = list of stops { id, col, row, env, play, kind, danger, reward, flagship, next: [ids] }.
// env = the planned environment (shown); play = what actually flies (Sky Isles until others exist).
export function generateVoyage(seed) {
  const V = config.VOYAGE;
  const rand = mulberry(seed);
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const n = ri(V.STOPS_MIN, V.STOPS_MAX);
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
      const danger = last ? 3 : c === 0 ? 1 : Math.max(1, Math.min(3, Math.round(1 + (c / (n - 2)) * 1.6 + (rand() - 0.5) * 1.4)));
      col.push({
        id: c + '.' + r,
        col: c,
        row: r,
        env,
        play: V.ENVIRONMENTS[env] && V.ENVIRONMENTS[env].ready ? env : 'skyisles',
        kind: last ? 'network' : kinds[ri(0, kinds.length - 1)],
        danger,
        reward: V.REWARD_BASE + danger * V.REWARD_PER_DANGER + ri(0, V.REWARD_RANDOM),
        flagship: last,
        next: [],
      });
    }
    columns.push(col);
  }
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
  return { seed, columns };
}

export const stopById = (voyage, id) => {
  for (const col of voyage.columns) for (const s of col) if (s.id === id) return s;
  return null;
};

export const stopName = (s) => (s.flagship ? 'The Flagship' : envInfo(s.env).name);

// ---- Saved progress on this TV (never let storage problems break the game) ----
const KEY = 'airshipVoyage';
const blank = () => ({ bestStops: 0, bestSalvage: 0, totalRuns: 0, victories: 0, unlocks: [] });
export function loadVoyageSave() {
  try {
    return { ...blank(), ...(JSON.parse(localStorage.getItem(KEY)) || {}) };
  } catch {
    return blank();
  }
}
export function saveVoyageSave(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
}
