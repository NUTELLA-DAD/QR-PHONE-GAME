// THE SHIP FORGE: a combo finder. Generates random valid ships, plays Versus bot matches between them (Swiss rounds, sides swapped, every environment), rates them (Elo), EVOLVES the best
// (crossover + mutation, re-validated, played in), optionally flies the champions through co-op voyages, and reports the Hall of Fame, a per-part statistics table (DOMINANT / TRAP /
// situational) and the champions as JSON.
//
//   node tools/shipforge.mjs [--pop 60] [--swiss 7] [--gens 4] [--children 20] [--opp 4] [--final 12] [--workers 6] [--bots 5] [--seed 1] [--cap 300]
//                            [--coop 0] [--coop-runs 2] [--coop-minutes 30] [--out tools/fixtures/forge] [--cache FILE] [--no-anchors] [--no-publish] [--quick]
//   --quick   a small run for checking the machinery (pop 12, 3 rounds, 1 generation of 6 children, final 4)
//   Default size (about 1500 games of ~5 s on 6 workers): 20-40 minutes.
//
// Outputs (in --out): REPORT.md (the full report), champions.json (the Hall of Fame with its parts), ratings.json (every ship with its numbers, no parts), games.json (every game, compact).
// The champions are also written to public/modules/host/pvp/champions.js (the Versus shelf's "Hall of Fame" ships) unless --no-publish.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (n) => argv.includes('--' + n);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const num = (n, d) => Number(val(n, d));
const quick = has('quick');
const A = {
  pop: num('pop', quick ? 12 : 60), swiss: num('swiss', quick ? 3 : 7), gens: num('gens', quick ? 1 : 4), children: num('children', quick ? 6 : 20), opp: num('opp', quick ? 2 : 4),
  final: num('final', quick ? 4 : 12), workers: num('workers', 6), bots: num('bots', 5), seed: num('seed', 1), cap: num('cap', quick ? 200 : 300),
  coop: num('coop', 0), coopRuns: num('coop-runs', 2), coopMinutes: num('coop-minutes', 30), coopMode: val('coop-mode', 'quick'),
  out: path.resolve(val('out', path.join(here, 'fixtures', 'forge'))), cache: val('cache', ''), anchors: !has('no-anchors'), publish: !has('no-publish'),
};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 60000).toFixed(1)} min]`, ...a);

// ---- load the game modules (for ship generation, the shelf and the validator; the games run in worker processes) -------------------------------------------
const F = await import(pathToUrl(path.join(here, 'forge-game.mjs')));
function pathToUrl(p) { return 'file:///' + p.replace(/\\/g, '/'); }
const { load, config, ENVS } = F;
const Gen = await load('modules/host/shipGen.js');
const { buildShelf } = await load('modules/host/pvp/shelf.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const CAP = Gen.weightCap();
const rngMain = Gen.makeRng(A.seed * 9973 + 1);
const stableKey = (parts) => JSON.stringify(parts);

// ---- the worker pool -------------------------------------------------------------------------------------------------------------------------------------
// One game per process: a game leaves state behind in the modules (counters, shared layouts), so a game played after others in the same process is not the game it would be alone. A fresh
// process loads the game in ~50 ms, so every game is hermetic and the whole forge is repeatable for a seed.
class Pool {
  constructor(n) { this.n = n; this.queue = []; this.active = 0; }
  start() {}
  run(game) { return new Promise((resolve) => { this.queue.push({ game, resolve, tries: 0 }); this.pump(); }); }
  pump() {
    while (this.active < this.n && this.queue.length) {
      const job = this.queue.shift();
      this.active++;
      let done = false;
      const proc = fork(path.join(here, 'forge-game.mjs'), ['--worker'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      const finish = (result) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.active--;
        try { proc.kill(); } catch { /* gone */ }
        if (result) job.resolve(result);
        else if (++job.tries > 2) job.resolve({ error: 'worker died on this game' });
        else this.queue.unshift(job); // (it died or hung: tried again, twice at most)
        this.pump();
      };
      const timer = setTimeout(() => finish(null), 300000);
      proc.on('message', (m) => { if (m.ready) proc.send({ type: 'game', id: 1, game: job.game }); else if (m.result) finish(m.result); });
      proc.on('exit', () => finish(null));
    }
  }
  stop() {}
}
const pool = new Pool(A.workers);

// ---- the game cache (the same game is never played twice, and a crashed run can be picked up) ------------------------------------------------------------------
const cache = new Map();
if (A.cache && fs.existsSync(A.cache)) { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(A.cache, 'utf8')))) cache.set(k, v); log(`game cache: ${cache.size} games loaded`); }
const flushCache = () => { if (A.cache) fs.writeFileSync(A.cache, JSON.stringify(Object.fromEntries(cache))); };
const gameKey = (g) => crypto.createHash('sha1').update(stableKey(g.red) + '|' + stableKey(g.blue) + `|${g.env}|${g.seed}|${g.cap}|${g.bots}`).digest('hex');
let gamesPlayed = 0, errorGames = 0, firstErrors = [];
async function playAll(games) {
  const out = await Promise.all(games.map(async (g) => {
    const k = gameKey(g);
    if (cache.has(k)) return cache.get(k);
    let r = await pool.run(g);
    if (r.error) { errorGames++; if (firstErrors.length < 3) firstErrors.push(r.error.slice(0, 400)); r = { winner: null, cause: 'crash', time: 0, hull: { red: 0, blue: 0 }, stats: { red: {}, blue: {} }, errors: 1 }; }
    if (r.errors && process.env.FORGE_DUMP) { fs.mkdirSync(process.env.FORGE_DUMP, { recursive: true }); fs.writeFileSync(path.join(process.env.FORGE_DUMP, `err-${gameKey(g).slice(0, 8)}.json`), JSON.stringify(g)); } // (debugging: FORGE_DUMP=dir keeps every game that threw, to replay with tools/forge-game.mjs)
    if (r.errors) { errorGames++; if (firstErrors.length < 3 && r.firstError) firstErrors.push(r.firstError); log(`ERROR in a game (${r.errors} errors): ${g.meta ? g.meta.red + ' (red) vs ' + g.meta.blue + ' (blue), ' + g.env + " seed " + g.seed : ''} ${(r.firstError || '').slice(0, 160)}`); }
    gamesPlayed++;
    const slim = { winner: r.winner, cause: r.cause, time: Math.round(r.time), hull: { red: Math.round(r.hull.red), blue: Math.round(r.hull.blue) }, errors: r.errors || 0, stats: { red: slimStats(r.stats.red), blue: slimStats(r.stats.blue) } };
    cache.set(k, slim);
    return slim;
  }));
  flushCache();
  return out;
}
const KEEP = ['shots', 'hits', 'dmg', 'boardings', 'secs', 'distSum', 'bandShort', 'bandMid', 'bandLong', 'bandFar', 'longShots', 'longHits', 'mortarShots', 'mortarHits', 'scatterShots', 'scatterHits', 'flakBursts', 'minesLaid', 'mineHits', 'rams', 'ramRuns', 'ramDmg', 'harpoons', 'harpoonHits', 'stormSecs', 'captures', 'sabotage'];
function slimStats(s = {}) { const o = {}; for (const k of KEEP) if (s[k]) o[k] = Math.round(s[k] * 100) / 100; return o; }

// ---- the ships -------------------------------------------------------------------------------------------------------------------------------------------------
const ships = []; // { id, name, summary, theme, parts, genome, tags, seed, gen, anchor, parents, mut, stats, games, ... }
const byKey = new Map();
function addShip(rec) {
  const k = stableKey(rec.parts);
  if (byKey.has(k)) return null;
  rec.idx = ships.length; rec.games = 0; rec.elo = 1500; rec.score = 0; rec.W = 0; rec.D = 0; rec.L = 0; rec.env = {}; rec.bands = { short: 0, mid: 0, long: 0, far: 0, secs: 0 }; rec.wep = {};
  ships.push(rec); byKey.set(k, rec);
  return rec;
}
const usedNames = new Set();
function uniqueName(name) { let n = name, k = 2; while (usedNames.has(n)) n = `${name} ${['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][k] || k}`, k++; usedNames.add(n); return n; }

function addAnchors() {
  const shelf = buildShelf();
  for (const e of shelf) {
    if (e.random) continue; // (the Surprise me! card is a placeholder, not a ship)
    const parts = e.parts;
    addShip({ id: 'anchor-' + e.id, name: e.name, summary: e.blurb, theme: 'anchor', parts, genome: null, tags: Gen.tagsOf(parts), seed: 0, gen: -1, anchor: true, stats: Gen.statsOf(parts), parents: [], mut: [] });
    usedNames.add(e.name);
  }
}
function addGenerated(seed, theme, gen, parents = [], mut = []) {
  const s = Gen.generateShip(seed, { theme, cap: CAP });
  if (!s) return null;
  const rec = addShip({ id: `g${gen}-${seed}`, name: uniqueName(s.name), summary: s.summary, theme: s.theme, parts: s.parts, genome: s.genome, tags: s.tags, seed, gen, anchor: false, stats: statSlim(s), parents, mut });
  return rec;
}
const statSlim = (s) => ({ mass: s.mass, lift: s.lift, hover: s.hover, hands: s.hands, warns: s.warns, width: s.width });

// A child: crossover and/or mutation of the best, repaired and re-validated. Returns the record, or null if it came out a copy / could not be made valid.
function makeChild(kind, parentA, parentB, seed, gen) {
  const rng = Gen.makeRng(seed * 2654435761 + 11);
  let g;
  if (kind === 'cross') { g = Gen.crossGenome(parentA.genome, parentB.genome, rng); if (rng.chance(0.5)) { const m = Gen.mutateGenome(g, rng); m.mut = [...g.mut, ...m.mut]; g = m; } }
  else g = Gen.mutateGenome(parentA.genome, rng);
  const r = Gen.repairedChild(g, rng, CAP);
  if (!r) return null;
  const parts = r.parts;
  const st = Gen.statsOf(parts);
  const gg = r.g;
  const theme = parentB && kind === 'cross' ? parentA.theme + 'x' + parentB.theme : parentA.theme;
  const pk = stableKey(parts);
  if (byKey.has(pk)) return null;
  const name = uniqueName(Gen.nameShip(seed, theme, parts));
  const rec = addShip({ id: `g${gen}-${seed}`, name, summary: Gen.describeShip(parts), theme, parts, genome: gg, tags: Gen.tagsOf(parts), seed, gen, anchor: false, stats: statSlim(st), parents: [parentA.name, ...(parentB && kind === 'cross' ? [parentB.name] : [])], mut: g.mut || [] });
  return rec;
}

// ---- Elo (sequential, for the Swiss pairing) and Bradley-Terry (the ratings reported) ------------------------------------------------------------------------------
const allGames = []; // { a, b (ship idx; a was red), env, seed, round, phase, w: 'a'|'b'|'d', cause, time, hullA, hullB, ... }
function record(spec, res, phase) {
  const w = res.winner === 'red' ? 'a' : res.winner === 'blue' ? 'b' : 'd';
  const gm = { a: spec.ia, b: spec.ib, env: spec.game.env, seed: spec.game.seed, phase, w, cause: res.cause, time: res.time, ha: res.hull.red, hb: res.hull.blue, err: res.errors || 0 };
  allGames.push(gm);
  const A_ = ships[spec.ia], B_ = ships[spec.ib];
  const sa = w === 'a' ? 1 : w === 'd' ? 0.5 : 0;
  const ea = 1 / (1 + 10 ** ((B_.elo - A_.elo) / 400));
  A_.elo += 24 * (sa - ea); B_.elo += 24 * ((1 - sa) - (1 - ea));
  for (const [s, side, sc] of [[A_, 'red', sa], [B_, 'blue', 1 - sa]]) {
    s.games++; s.score += sc; if (sc === 1) s.W++; else if (sc === 0) s.L++; else s.D++;
    const e = (s.env[spec.game.env] = s.env[spec.game.env] || { g: 0, s: 0 }); e.g++; e.s += sc;
    const st = res.stats[side] || {}, other = res.stats[side === 'red' ? 'blue' : 'red'] || {};
    s.bands.short += st.bandShort || 0; s.bands.mid += st.bandMid || 0; s.bands.long += st.bandLong || 0; s.bands.far += st.bandFar || 0; s.bands.secs += st.secs || 0;
    for (const k of ['shots', 'hits', 'longShots', 'longHits', 'mortarShots', 'mortarHits', 'scatterShots', 'flakBursts', 'minesLaid', 'mineHits', 'rams', 'harpoons', 'harpoonHits', 'boardings']) s.wep[k] = (s.wep[k] || 0) + (st[k] || 0);
    s.wep.dmgDealt = (s.wep.dmgDealt || 0) + (st.dmg || 0); s.wep.dmgTaken = (s.wep.dmgTaken || 0) + (other.dmg || 0);
  }
}
// Both sides of a pairing, in one environment and sky.
async function playPairs(pairs, phase, envFor) {
  const specs = [];
  pairs.forEach(([ia, ib], k) => {
    const env = envFor(k), seed = A.seed * 100003 + allGames.length + k * 7 + 1;
    for (const swap of [false, true]) {
      const [r, b] = swap ? [ib, ia] : [ia, ib];
      specs.push({ ia: r, ib: b, game: { red: ships[r].parts, blue: ships[b].parts, env, seed, cap: A.cap, bots: A.bots, meta: { red: ships[r].name + ' [' + ships[r].id + ']', blue: ships[b].name + ' [' + ships[b].id + ']' } } });
    }
  });
  const results = await playAll(specs.map((s) => s.game));
  specs.forEach((s, i) => record(s, results[i], phase));
}

function btRatings(filter = () => true) {
  const gs = allGames.filter(filter);
  const n = ships.length, pi = new Array(n).fill(1);
  const W = new Array(n).fill(0), pairs = new Map();
  for (const g of gs) {
    const sa = g.w === 'a' ? 1 : g.w === 'd' ? 0.5 : 0;
    W[g.a] += sa; W[g.b] += 1 - sa;
    const k = g.a < g.b ? g.a + ':' + g.b : g.b + ':' + g.a;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  const opp = Array.from({ length: n }, () => []);
  for (const [k, c] of pairs) { const [i, j] = k.split(':').map(Number); opp[i].push([j, c]); opp[j].push([i, c]); }
  for (let it = 0; it < 300; it++) {
    const next = pi.slice();
    for (let i = 0; i < n; i++) {
      let denom = 1 / (pi[i] + 1); // (a pseudo-draw against an average opponent: ships with one game are not rated 0 or infinity)
      for (const [j, c] of opp[i]) denom += c / (pi[i] + pi[j]);
      next[i] = (W[i] + 0.5) / denom;
    }
    const gm = Math.exp(next.reduce((a, v) => a + Math.log(v), 0) / n);
    for (let i = 0; i < n; i++) pi[i] = next[i] / gm;
  }
  const elo = pi.map((p) => 1500 + 400 * Math.log10(p));
  const ref = ships.find((s) => s.id === 'anchor-classic');
  const shift = ref ? 1500 - elo[ref.idx] : 0; // (classic = 1500)
  return elo.map((e) => e + shift);
}
function refreshRatings() { const e = btRatings(); ships.forEach((s, i) => { s.rating = e[i]; }); }

// ---- scheduling -------------------------------------------------------------------------------------------------------------------------------------------------------
const playedPair = new Set();
const pk = (i, j) => (i < j ? i + ':' + j : j + ':' + i);
function swissPairs(idxs) {
  const order = idxs.slice().sort((a, b) => ships[b].elo - ships[a].elo || a - b);
  const used = new Set(), pairs = [];
  for (let x = 0; x < order.length; x++) {
    const i = order[x];
    if (used.has(i)) continue;
    let j = order.slice(x + 1).find((c) => !used.has(c) && !playedPair.has(pk(i, c)));
    if (j == null) j = order.slice(x + 1).find((c) => !used.has(c));
    if (j == null) break;
    used.add(i); used.add(j); pairs.push([i, j]); playedPair.add(pk(i, j));
  }
  return pairs;
}
const envAt = (k) => ENVS[((k % ENVS.length) + ENVS.length) % ENVS.length];

// ---- the run ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const evoLog = [];
async function main() {
  pool.start();
  log(`forge: pop ${A.pop}, ${A.swiss} Swiss rounds, ${A.gens} generations of ${A.children}, final ${A.final}, ${A.workers} workers, ${A.bots} bots a side, weight cap ${CAP}, ${ENVS.length} environments (${ENVS.join(', ')})`);
  if (A.anchors) addAnchors();
  // generation 0: random ships, the themes in turn
  const themes = Gen.THEMES;
  for (let i = 0; ships.filter((s) => s.gen === 0).length < A.pop && i < A.pop * 3; i++) addGenerated(A.seed * 1000 + i, themes[i % themes.length], 0);
  log(`generation 0: ${ships.filter((s) => s.gen === 0).length} generated ships + ${ships.filter((s) => s.anchor).length} shelf ships; ${errorGames} errors so far`);
  // Swiss rounds: one environment per round (so every ship plays every environment), sides swapped inside each pairing
  const everyone = ships.map((s) => s.idx);
  for (let r = 0; r < A.swiss; r++) {
    const env = envAt(r);
    const pairs = swissPairs(everyone);
    await playPairs(pairs, 'swiss', () => env);
    log(`Swiss round ${r + 1}/${A.swiss} (${env}): ${pairs.length} pairings; ${gamesPlayed} games played, ${errorGames} with errors`);
  }
  refreshRatings();
  // evolution
  for (let gen = 1; gen <= A.gens; gen++) {
    refreshRatings();
    const field = ships.filter((s) => !s.anchor && s.genome && s.games >= 4).sort((a, b) => b.rating - a.rating);
    const top = field.slice(0, Math.max(4, Math.min(12, Math.round(field.length * 0.2))));
    const kids = [];
    for (let tries = 0; kids.length < A.children && tries < A.children * 6; tries++) {
      const seed = A.seed * 777000 + gen * 1000 + tries;
      const roll = rngMain();
      let kid;
      if (roll < 0.1) kid = addGenerated(seed, themes[Math.floor(rngMain() * themes.length)], gen, ['(new blood)'], ['fresh random ship']);
      else if (roll < 0.5 && top.length > 1) { const a = top[Math.floor(rngMain() * top.length)]; let b = top[Math.floor(rngMain() * top.length)]; if (b === a) b = top[(top.indexOf(a) + 1) % top.length]; kid = makeChild('cross', a, b, seed, gen); }
      else kid = makeChild('mutate', top[Math.floor(rngMain() * top.length)], null, seed, gen);
      if (kid) kids.push(kid);
    }
    // each child plays `opp` opponents: the classic ship (the common yardstick) and the strong ships
    const pairs = [];
    const strong = field.slice(0, 16);
    const classic = ships.find((s) => s.id === 'anchor-classic');
    for (const kid of kids) {
      const opps = new Set();
      if (classic) opps.add(classic.idx);
      for (let t = 0; opps.size < A.opp && t < 40; t++) { const c = strong[Math.floor(rngMain() * strong.length)]; if (c && c.idx !== kid.idx && !kid.parents.includes(c.name)) opps.add(c.idx); }
      for (const o of opps) pairs.push([kid.idx, o]);
    }
    await playPairs(pairs, 'gen' + gen, (k) => envAt(k + gen));
    refreshRatings();
    const best = kids.slice().sort((a, b) => b.rating - a.rating)[0];
    const meanKid = kids.reduce((n, s) => n + s.rating, 0) / Math.max(1, kids.length), meanTop = top.reduce((n, s) => n + s.rating, 0) / Math.max(1, top.length);
    evoLog.push({ gen, kids: kids.length, meanKid, meanTop, best: best ? `${best.name} (${best.rating.toFixed(0)}; ${best.parents.join(' x ')}: ${best.mut.join(', ')})` : '-' });
    log(`generation ${gen}: ${kids.length} children, mean Elo ${meanKid.toFixed(0)} (their parents ${meanTop.toFixed(0)}); best ${best ? best.name + ' ' + best.rating.toFixed(0) : '-'}; ${gamesPlayed} games, ${errorGames} errors`);
  }
  // final: the best ships play each other round robin, both sides, two environments
  refreshRatings();
  const finalists = ships.filter((s) => s.games >= 4).sort((a, b) => b.rating - a.rating).slice(0, A.final).map((s) => s.idx);
  const rr = [];
  for (let i = 0; i < finalists.length; i++) for (let j = i + 1; j < finalists.length; j++) rr.push([finalists[i], finalists[j]]);
  await playPairs(rr, 'final', (k) => envAt(k * 3 + 1));
  refreshRatings();
  log(`final round robin of ${finalists.length}: ${rr.length * 2} games. Total ${gamesPlayed} games played (${cache.size} in cache), ${errorGames} with errors`);
}

// ---- statistics: part presence against rating ----------------------------------------------------------------------------------------------------------------------------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function corr(xs, ys) {
  const n = xs.length; if (n < 3) return 0;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
// logistic regression of "red wins" on (tags of red - tags of blue) with a side term; ridge-penalised. Returns Elo points per tag (coef x 400/ln10) and the standard errors.
function logit(gs, tagNames, lambda = 2) {
  const d = tagNames.length + 1, X = [], Y = [];
  for (const g of gs) {
    const ta = new Set(ships[g.a].tags), tb = new Set(ships[g.b].tags);
    const x = tagNames.map((t) => (ta.has(t) ? 1 : 0) - (tb.has(t) ? 1 : 0)); x.push(1);
    X.push(x); Y.push(g.w === 'a' ? 1 : g.w === 'd' ? 0.5 : 0);
  }
  const beta = new Array(d).fill(0);
  let H = null;
  for (let it = 0; it < 25; it++) {
    const grad = new Array(d).fill(0); H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let n = 0; n < X.length; n++) {
      let z = 0; for (let k = 0; k < d; k++) z += beta[k] * X[n][k];
      const p = 1 / (1 + Math.exp(-z)), w = p * (1 - p);
      for (let k = 0; k < d; k++) { grad[k] += (Y[n] - p) * X[n][k]; for (let l = 0; l < d; l++) H[k][l] += w * X[n][k] * X[n][l]; }
    }
    for (let k = 0; k < d - 1; k++) { grad[k] -= lambda * beta[k]; H[k][k] += lambda; }
    H[d - 1][d - 1] += 1e-6;
    const step = solve(H, grad);
    let mx = 0; for (let k = 0; k < d; k++) { beta[k] += step[k]; mx = Math.max(mx, Math.abs(step[k])); }
    if (mx < 1e-5) break;
  }
  const inv = invert(H);
  const f = 400 / Math.LN10;
  return { eff: tagNames.map((_, k) => beta[k] * f), se: tagNames.map((_, k) => Math.sqrt(Math.max(0, inv[k][k])) * f), side: beta[d - 1] * f, n: X.length };
}
function solve(M, b) { const n = b.length, a = M.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c] || 1e-9; for (let k = c; k <= n; k++) a[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let k = c; k <= n; k++) a[r][k] -= f * a[c][k]; } } return a.map((r) => r[n]); }
function invert(M) { const n = M.length, a = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r; [a[c], a[p]] = [a[p], a[c]]; const d = a[c][c] || 1e-9; for (let k = 0; k < 2 * n; k++) a[c][k] /= d; for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let k = 0; k < 2 * n; k++) a[r][k] -= f * a[c][k]; } } return a.map((r) => r.slice(n)); }

function partStats() {
  const pop = ships.filter((s) => !s.anchor && s.games >= 4);
  const gen0 = pop.filter((s) => s.gen === 0);
  const envElo = {};
  for (const e of ENVS) envElo[e] = btRatings((g) => g.env === e);
  const rows = [];
  for (const tag of Gen.TAG_LIST) {
    const withT = pop.filter((s) => s.tags.includes(tag)), without = pop.filter((s) => !s.tags.includes(tag));
    const g0with = gen0.filter((s) => s.tags.includes(tag)), g0without = gen0.filter((s) => !s.tags.includes(tag));
    if (withT.length < 3 || without.length < 3) { rows.push({ tag, n: withT.length, skip: true }); continue; }
    const x = pop.map((s) => (s.tags.includes(tag) ? 1 : 0));
    const c = corr(x, pop.map((s) => s.rating));
    const perEnv = ENVS.map((e) => {
      const ok = pop.filter((s) => s.env[e] && s.env[e].g > 0);
      const inE = ok.filter((s) => s.tags.includes(tag)).length;
      if (inE < 3 || ok.length - inE < 3) return null;
      return corr(ok.map((s) => (s.tags.includes(tag) ? 1 : 0)), ok.map((s) => envElo[e][s.idx]));
    });
    const c0 = g0with.length >= 3 && g0without.length >= 3 ? corr(gen0.map((s) => (s.tags.includes(tag) ? 1 : 0)), gen0.map((s) => s.rating)) : null;
    rows.push({ tag, n: withT.length, nGen0: g0with.length, c, c0, perEnv, eloWith: mean(withT.map((s) => s.rating)), eloWithout: mean(without.map((s) => s.rating)) });
  }
  const gs = allGames.filter((g) => !ships[g.a].anchor || !ships[g.b].anchor);
  const live = rows.filter((r) => !r.skip).map((r) => r.tag);
  const L = logit(gs, live, 3);
  const LE = {};
  for (const e of ENVS) LE[e] = logit(gs.filter((g) => g.env === e), live, 8);
  for (const r of rows) {
    if (r.skip) continue;
    const k = live.indexOf(r.tag);
    r.eff = L.eff[k]; r.se = L.se[k];
    r.effEnv = ENVS.map((e) => LE[e].eff[k]);
    r.verdict = verdict(r);
  }
  return { rows, side: L.side, games: gs.length };
}
// DOMINANT: clearly better in (nearly) every environment; TRAP: clearly worse in (nearly) every one; situational: helps in some and hurts in others. The correlation of presence with the ship's rating
// (the overall one and each environment's own) and the logistic effect (Elo points a part is worth, with its standard error) have to agree.
function verdict(r) {
  const e = r.effEnv.filter((v) => v != null), cs = r.perEnv.filter((v) => v != null);
  const up = e.filter((v) => v >= 15).length, down = e.filter((v) => v <= -15).length;
  const sig = Math.abs(r.eff) > 1.64 * r.se;
  if (r.c >= 0.25 && r.eff >= 40 && sig && down <= 1 && cs.filter((v) => v > 0).length >= Math.ceil(cs.length * 0.7)) return 'DOMINANT';
  if (r.c <= -0.25 && r.eff <= -40 && sig && up <= 1 && cs.filter((v) => v < 0).length >= Math.ceil(cs.length * 0.7)) return 'TRAP';
  if (cs.length >= 4 && Math.max(...cs) >= 0.2 && Math.min(...cs) <= -0.2) return 'situational'; // (the sign flips between skies, by more than the noise)
  if (sig && Math.abs(r.eff) >= 30) return r.eff > 0 ? 'helps (not dominant)' : 'hurts (not a trap)'; // (the regression holds the other parts fixed, so its sign wins over the plain correlation's)
  return 'neutral';
}

// ---- co-op fitness (voyagesim) ---------------------------------------------------------------------------------------------------------------------------------------------------
function runVoyage(file, seed) {
  return new Promise((resolve) => {
    const a = [path.join(here, 'voyagesim.mjs'), '--child', '--seed', String(seed), '--difficulty', 'normal', '--mode', A.coopMode, '--bots', '8', '--maxmin', String(A.coopMinutes), '--build', file];
    const c = spawn(process.execPath, a);
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => { const l = out.split('\n').find((x) => x.startsWith('RESULT ')); resolve(l ? JSON.parse(l.slice(7)) : { seed, error: out.slice(-200) }); });
  });
}
async function coopFitness(list) {
  const tmp = path.join(A.out, '.coop'); fs.mkdirSync(tmp, { recursive: true });
  const jobs = [];
  for (const s of list) { const f = path.join(tmp, s.id + '.json'); fs.writeFileSync(f, JSON.stringify(s.parts)); for (let k = 0; k < A.coopRuns; k++) jobs.push({ s, f, seed: 100 + k }); }
  const classicF = path.join(tmp, 'classic.json'); fs.writeFileSync(classicF, JSON.stringify(BUILDS.classic));
  const cj = []; for (let k = 0; k < A.coopRuns; k++) cj.push({ s: { id: 'classic', name: 'Classic (reference)' }, f: classicF, seed: 100 + k });
  const all = [...jobs, ...cj], results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(A.workers, all.length) }, async () => { while (next < all.length) { const j = all[next++]; results.push({ id: j.s.id, r: await runVoyage(j.f, j.seed) }); log(`co-op voyage ${j.s.name} seed ${j.seed}`); } }));
  const out = {};
  for (const x of results) { const o = (out[x.id] = out[x.id] || { runs: 0, victories: 0, stops: 0, total: 0, minutes: 0, errors: 0 }); if (x.r.error) { o.errors++; continue; } o.runs++; o.victories += x.r.victory ? 1 : 0; o.stops += x.r.done; o.total = x.r.total; o.minutes += x.r.minutes || 0; o.errors += x.r.errors || 0; }
  return out;
}

// ---- the report ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
function invString(parts) {
  const c = Gen.inventory(parts), o = [];
  const add = (k, w) => { if (c[k]) o.push(`${c[k]} ${w}`); };
  add('long', 'long'); add('mortar', 'mortar'); add('scatter', 'grapeshot'); add('flak', 'flak'); add('harpoon', 'harpoon'); add('flame', 'flame'); add('mines', 'mines'); add('gun', 'plain guns'); add('ram', 'ram'); add('cannon', 'crew cannon'); add('bombBay', 'bomb bay'); add('sails', 'sails');
  if (c.armour) o.push(`armour ${c.armour.toFixed(1)}`);
  o.push(`${c.engines} engines${c.upEngines ? ' (' + c.upEngines + ' up)' : ''}${c.swivel ? ' (' + c.swivel + ' swivel)' : ''}`, `${c.bags} bag${c.bags > 1 ? 's' : ''}${c.twin ? ' twin' : ''}`);
  return o.join(', ');
}
const bandShare = (s) => (s.bands.secs ? `${pct(s.bands.short, s.bands.secs)} / ${pct(s.bands.mid, s.bands.secs)} / ${pct(s.bands.long, s.bands.secs)}` : '-');
const winPct = (s) => (s.games ? Math.round((100 * s.score) / s.games) : 0);

function hallOfFame(n = 10) {
  const seen = new Set(), out = [];
  for (const s of ships.filter((q) => !q.anchor && q.games >= 6).sort((a, b) => b.rating - a.rating)) {
    if (seen.has(s.name)) continue;
    seen.add(s.name); out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

function writeReport(stats, hof, coop, elapsedMin) {
  const L = [];
  const p = (s = '') => L.push(s);
  const gen0 = ships.filter((s) => s.gen === 0 && !s.anchor);
  p('# Ship forge report'); p();
  p(`Run: seed ${A.seed}, ${A.pop} random ships + ${ships.filter((s) => s.anchor).length} shelf ships, ${A.swiss} Swiss rounds, ${A.gens} generations of ${A.children} children, a round robin of the best ${A.final}; ${A.bots} bot crew a side, weight cap ${CAP}, ${ENVS.length} environments (${ENVS.join(', ')}). `
    + `${allGames.length} Versus games (one round each, both sides, the sky and the map seed changing), ${errorGames} with errors, ${elapsedMin.toFixed(1)} minutes on ${A.workers} workers.`);
  p(); p('Ratings are Bradley-Terry fits over every game (Elo scale, the classic ship = 1500, a pseudo-draw against an average ship keeps small samples near 1500). A game is one round of a Versus match; a draw counts half. '
    + `Red/left side advantage in these games: ${stats.side.toFixed(0)} Elo points.`); p();
  p('## Hall of Fame (generated and evolved ships)'); p();
  p('| # | Ship | What she is | Elo | Win % (W-D-L) | Weight | Parts | Time in bands short/mid/long | Gen | Co-op |'); p('|---|---|---|---|---|---|---|---|---|---|');
  hof.forEach((s, i) => {
    const c = coop && coop[s.id];
    p(`| ${i + 1} | **${s.name}** | ${s.summary} | ${s.rating.toFixed(0)} | ${winPct(s)}% (${s.W}-${s.D}-${s.L}) | ${s.stats.mass} | ${invString(s.parts)} | ${bandShare(s)} | ${s.gen === 0 ? 'random' : 'gen ' + s.gen + (s.parents.length ? ' (' + s.parents.join(' x ') + ')' : '')} | ${c ? `${c.victories}/${c.runs} won, ${(c.stops / Math.max(1, c.runs)).toFixed(1)}/${c.total} stops` : '-'} |`);
  });
  p();
  if (coop) { const c = coop.classic; if (c) p(`Co-op reference: the classic ship wins ${c.victories}/${c.runs} voyages, ${(c.stops / Math.max(1, c.runs)).toFixed(1)}/${c.total} stops (${A.coopMode} mode, 8 bots, Normal, ${A.coopMinutes} minute cap; the voyage starts on the ship and the sky-dock Yard builds on it).`); p(); }
  p('### Weapon use of the champions (per game, averaged)'); p();
  p('| Ship | shells | hits per shell | long gun hit % | mortar shells | mines laid / hit | rams | harpoons latched | boardings | damage dealt / taken |'); p('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of hof) { const g = Math.max(1, s.games), w = s.wep; p(`| ${s.name} | ${(w.shots / g).toFixed(0)} | ${w.shots ? (w.hits / w.shots).toFixed(2) : '-'} | ${pct(w.longHits, w.longShots)} | ${(w.mortarShots / g).toFixed(1)} | ${(w.minesLaid / g).toFixed(1)} / ${(w.mineHits / g).toFixed(2)} | ${(w.rams / g).toFixed(2)} | ${(w.harpoonHits / g).toFixed(2)} | ${(w.boardings / g).toFixed(2)} | ${(w.dmgDealt / g).toFixed(0)} / ${(w.dmgTaken / g).toFixed(0)} |`); }
  p();
  p('## The shelf ships and the generated field'); p();
  p('| Ship | Elo | Win % | Games | Parts |'); p('|---|---|---|---|---|');
  for (const s of ships.filter((q) => q.anchor).sort((a, b) => b.rating - a.rating)) p(`| ${s.name} | ${s.rating.toFixed(0)} | ${winPct(s)}% | ${s.games} | ${invString(s.parts)} |`);
  p();
  const gm = (arr) => (arr.length ? mean(arr.map((s) => s.rating)).toFixed(0) : '-');
  p(`Generation 0 (${gen0.length} random ships): mean Elo ${gm(gen0)}, best ${gen0.length ? Math.max(...gen0.map((s) => s.rating)).toFixed(0) : '-'}, worst ${gen0.length ? Math.min(...gen0.map((s) => s.rating)).toFixed(0) : '-'}. Evolved ships (${ships.filter((s) => s.gen > 0).length}): mean Elo ${gm(ships.filter((s) => s.gen > 0))}.`); p();
  p('### By theme (generation 0)'); p(); p('| Theme | Ships | Mean Elo | Best |'); p('|---|---|---|---|');
  for (const th of Gen.THEMES) { const l = gen0.filter((s) => s.theme === th); if (l.length) p(`| ${th} (${Gen.THEME_LABEL[th]}) | ${l.length} | ${gm(l)} | ${Math.max(...l.map((s) => s.rating)).toFixed(0)} |`); }
  p();
  p('## Evolution'); p(); p('| Gen | Children | Mean Elo of children | Mean Elo of the parent pool | Best child |'); p('|---|---|---|---|---|');
  for (const e of evoLog) p(`| ${e.gen} | ${e.kids} | ${e.meanKid.toFixed(0)} | ${e.meanTop.toFixed(0)} | ${e.best} |`);
  p();
  p('## Part statistics'); p();
  p('Each part tag against the ship ratings of every generated / evolved ship with 4+ games. **corr** = correlation of "has it" with Elo (all games; the per-environment columns use that environment\'s own rating); **effect** = what the part is worth in Elo points '
    + 'by a logistic regression over every game (red-minus-blue tag difference, ridge-penalised, +- one standard error); **verdict** = DOMINANT (corr 0.25+, effect 40+ and significant, good in nearly every environment), TRAP (the mirror image), situational (the per-environment correlation is +0.2 or more in one sky and -0.2 or less in another; the sign flips), helps / hurts (a significant effect of 30+ Elo that is not clear enough everywhere for the big words; the regression holds the other parts fixed, so where it disagrees with the plain correlation the part is riding on what it is usually built with) '
    + 'or neutral. The environment columns are noisy (each ship plays about two games in each); read them as a trend.'); p();
  p(`| Part | Ships with it | corr | ${ENVS.join(' | ')} | effect (Elo) | Mean Elo with / without | Verdict |`); p(`|---|---|---|${ENVS.map(() => '---').join('|')}|---|---|---|---|`);
  for (const r of stats.rows) {
    if (r.skip) { p(`| ${r.tag} | ${r.n} | - | ${ENVS.map(() => '-').join(' | ')} | too few | - | - |`); continue; }
    p(`| ${r.tag} | ${r.n} | ${r.c.toFixed(2)} | ${r.perEnv.map((v) => (v == null ? '-' : v.toFixed(2))).join(' | ')} | ${r.eff >= 0 ? '+' : ''}${r.eff.toFixed(0)} +- ${r.se.toFixed(0)} | ${r.eloWith.toFixed(0)} / ${r.eloWithout.toFixed(0)} | ${r.verdict === 'DOMINANT' || r.verdict === 'TRAP' ? '**' + r.verdict + '**' : r.verdict} |`);
  }
  p();
  const dom = stats.rows.filter((r) => r.verdict === 'DOMINANT'), trap = stats.rows.filter((r) => r.verdict === 'TRAP'), sit = stats.rows.filter((r) => r.verdict === 'situational'), strong = stats.rows.filter((r) => r.verdict === 'helps (not dominant)'), weak = stats.rows.filter((r) => r.verdict === 'hurts (not a trap)');
  p('### Reading it'); p();
  p(`- DOMINANT: ${dom.map((r) => r.tag).join(', ') || 'none'}.`); p(`- TRAP: ${trap.map((r) => r.tag).join(', ') || 'none'}.`); p(`- situational: ${sit.map((r) => r.tag).join(', ') || 'none'}.`);
  p(`- helps, not dominant: ${strong.map((r) => `${r.tag} (+${r.eff.toFixed(0)})`).join(', ') || 'none'}.`); p(`- hurts, not a trap: ${weak.map((r) => `${r.tag} (${r.eff.toFixed(0)})`).join(', ') || 'none'}.`);
  p();
  p('## Limits (read before rebalancing anything)'); p();
  p(`- The crews are bots, ${A.bots} a side. A ship with more manned stations than hands (two long guns, a mine layer, a crew cannon and its seat, a lamp and a mortar ...) leaves guns idle, so "more of it" can lose; with human crews of 6-8 a side the answers move.`);
  p('- The environments were written for ship 0 (the red ship): ice, spores, lightning, flooding and the oxygen tank hit the red ship only. Every pairing is played twice with the sides swapped, so a ship meets each hazard as the target and as the lucky one, but the per-environment columns mostly show how the hazard-carrying side fares.');
  p('- The shelf ships made from the classic ship carry things the editor cannot place (the deflector shield, two escort fighters, the lightning coil, the navigator), so the classic family out-rates a generated ship of the same weight; compare generated ships with each other first, and with the classic ship second.');
  p('- Part tags are confounded (a long hull, three bags and heavy armour usually come together in the fortress theme). The logistic effect holds the other tags fixed; the correlation does not. Where they disagree, trust neither without a targeted test (`tools/pvp-stats.mjs --set`).');
  p(`- Co-op fitness is ${A.coop ? `${A.coopRuns} ${A.coopMode}-mode voyages of 8 bots on Normal per ship (the voyage starts on the ship and the sky-dock Yard builds on it): a small sample, read it as "can she win a voyage at all"` : 'not measured in this run (--coop N)'}.`);
  p();
  return L.join('\n');
}

function championJson(s, coop) {
  const c = coop && coop[s.id];
  return { id: s.id, name: s.name, summary: s.summary, theme: s.theme, seed: s.seed, gen: s.gen, parents: s.parents, mutations: s.mut, elo: Math.round(s.rating), games: s.games, winPct: winPct(s), record: [s.W, s.D, s.L], weight: s.stats.mass, lift: s.stats.lift, hover: s.stats.hover, hands: s.stats.hands, warns: s.stats.warns,
    parts: invString(s.parts), tags: s.tags, bandShare: s.bands.secs ? { short: +(s.bands.short / s.bands.secs).toFixed(2), mid: +(s.bands.mid / s.bands.secs).toFixed(2), long: +(s.bands.long / s.bands.secs).toFixed(2), far: +(s.bands.far / s.bands.secs).toFixed(2) } : null,
    byEnvironment: Object.fromEntries(Object.entries(s.env).map(([e, v]) => [e, { games: v.g, winPct: Math.round((100 * v.s) / v.g) }])), coop: c || null, genome: s.genome, shipParts: s.parts };
}

// ---- go ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
await main();
pool.stop();
const stats = partStats();
const hof = hallOfFame(10);
let coop = null;
if (A.coop > 0) { log(`co-op fitness for the top ${A.coop}`); coop = await coopFitness(hof.slice(0, A.coop)); }
fs.mkdirSync(A.out, { recursive: true });
const elapsed = (Date.now() - t0) / 60000;
fs.writeFileSync(path.join(A.out, 'REPORT.md'), writeReport(stats, hof, coop, elapsed) + '\n');
const champs = hof.map((s) => championJson(s, coop));
fs.writeFileSync(path.join(A.out, 'champions.json'), JSON.stringify(champs, null, 1) + '\n');
fs.writeFileSync(path.join(A.out, 'ratings.json'), JSON.stringify(ships.map((s) => ({ id: s.id, name: s.name, summary: s.summary, theme: s.theme, gen: s.gen, anchor: s.anchor, elo: Math.round(s.rating), games: s.games, winPct: winPct(s), weight: s.stats && s.stats.mass, tags: s.tags, parents: s.parents, mutations: s.mut })), null, 1) + '\n');
fs.writeFileSync(path.join(A.out, 'games.json'), JSON.stringify({ ships: ships.map((s) => s.id), games: allGames.map((g) => [g.a, g.b, g.env, g.w, g.cause, g.time, g.ha, g.hb, g.phase, g.err]) }) + '\n');
if (A.publish && champs.length) {
  const pub = path.resolve(here, '..', 'public', 'modules', 'host', 'pvp', 'champions.js');
  const slim = champs.map((c) => ({ id: 'hof-' + c.id, name: c.name, summary: c.summary, elo: c.elo, winPct: c.winPct, weight: c.weight, parts: c.shipParts }));
  fs.writeFileSync(pub, `// The Hall of Fame of the ship forge (tools/shipforge.mjs): the strongest generated ships, as parts lists with their Versus record. Written by the forge; the Versus shelf (pvp/shelf.js) offers them.\nexport const CHAMPIONS = ${JSON.stringify(slim)};\n`);
  log('wrote ' + pub);
}
fs.rmSync(path.join(A.out, '.coop'), { recursive: true, force: true });
log(`done: ${allGames.length} games, ${errorGames} with errors${firstErrors.length ? ' - first: ' + firstErrors[0] : ''}; ${hof.length ? 'champion: ' + hof[0].name + ' (' + hof[0].rating.toFixed(0) + ')' : ''}`);
process.exit(errorGames ? 1 : 0);
