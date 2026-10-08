// Ship-building checks (Phase S). Headless, no browser.
// Usage: node tools/buildsim.mjs --build <classic|multi|file.json|file.mjs> [--bots-check]   the build validator (S.5): PASS/WARN/FAIL report + the LIFT / STEAM / HANDS gauges
//        node tools/buildsim.mjs --random 50 --seed 1 --minutes 4 --envs skyisles,fungal,storm,aether --bots 6   random legal builds, botsim each, table + which parts dominate
//        node tools/buildsim.mjs --check-classic    the classic ship must still equal the frozen snapshot
//        node tools/buildsim.mjs --lint             no module-level captures of derived layout values (they go stale), no hard-coded ship reference points
//        node tools/buildsim.mjs --check-botsim     the 9 seeded botsim runs must match tools/fixtures/botsim-baseline.txt
//        node tools/buildsim.mjs --check-multi      S.3: the scratch multi-instance build (2 boilers, 2 lookouts) validates and botsims clean
//        node tools/buildsim.mjs --check-validator   S.5: broken builds must FAIL/WARN with the right message (the classic passes clean)
//        node tools/buildsim.mjs --snapshot-classic --force   (S.0 only) rewrite tools/fixtures/classic-layout.json
// Exit code 1 on any failure.
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const FIXTURE = path.join(root, 'tools', 'fixtures', 'classic-layout.json');
const load = (p) => import(pathToFileURL(path.join(root, 'public', p)).href);

// Deep compare that returns the path of the first difference (or null). Key order does not matter.
function firstDiff(a, b, where = 'layout') {
  if (a === b) return null;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return `${where}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${where}: array vs object`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${where}: length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) { const d = firstDiff(a[i], b[i], `${where}[${i}]`); if (d) return d; }
    return null;
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `${where}: keys [${ka}] vs [${kb}]`;
  for (const k of ka) { const d = firstDiff(a[k], b[k], `${where}.${k}`); if (d) return d; }
  return null;
}
// Layout data as plain JSON (what the fixture holds); `version` is bookkeeping, not layout.
const plain = (layout) => { const o = JSON.parse(JSON.stringify(layout)); delete o.version; return o; };

// The classic ship, two ways: generated from its parts, and as live in the game. Both must equal the frozen
// fixture, and the keyed collections must keep their key order (the game iterates them in order).
async function checkClassic() {
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const { BUILDS, buildLayout } = await load('modules/host/shipBuild.js');
  const { validate, makePlanner } = await load('modules/host/buildCheck.js');
  const { SHIP_LAYOUT } = await load('shipLayout.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  for (const [name, got] of [['buildLayout(BUILDS.classic)', plain(buildLayout(BUILDS.classic))], ['live SHIP_LAYOUT', plain(SHIP_LAYOUT)]]) {
    const d = firstDiff(got, fixture);
    report(!d, d ? name + ' differs from the classic fixture at ' + d : name + ' equals the classic fixture');
    for (const k of ['gunMounts', 'searchlights']) {
      if (Object.keys(got[k]).join('|') !== Object.keys(fixture[k]).join('|')) report(false, name + ': ' + k + ' key order differs');
    }
  }
  const v = validate(BUILDS.classic, { starter: true });
  report(v.ok, 'validate(BUILDS.classic)' + (v.ok ? '' : ': ' + v.fails.join('; ')));
  // The validator's own route planner must agree with the game's (nav.js) on the live classic ship, for every pair of stations.
  const nav = await load('modules/host/nav.js');
  const mine = makePlanner(SHIP_LAYOUT);
  const spots = [...SHIP_LAYOUT.stations, ...SHIP_LAYOUT.engines.map((e) => ({ d: e.d, x: e.x }))];
  let off = 0, pairs = 0;
  for (const a of spots) for (const b of spots) { pairs++; if (Math.abs(nav.plan(a.d, a.x, b.d, b.x).cost - mine.plan(a.d, a.x, b.d, b.x).cost) > 1e-9) off++; }
  report(off === 0, `buildCheck route planner agrees with nav.js on ${pairs} station pairs${off ? ' (' + off + ' differ)' : ''}`);
  // Station kinds: every station and engine has one, names are unique (validate), and one()/all()/kindOf() agree with the classic ship.
  const { one, all, kindOf } = await load('shipLayout.js');
  const count = (kind) => all(kind).length;
  const want = { helm: 1, boiler: 1, lookout: 1, coal: 1, ammo: 1, gun: 7, searchlight: 2, coil: 1, deflector: 1, bombBay: 1, navigator: 1, escort: 2, engine: 2 };
  const got = Object.fromEntries(Object.keys(want).map((k) => [k, count(k)]));
  report(JSON.stringify(got) === JSON.stringify(want), 'classic station kinds: ' + Object.entries(got).map(([k, n]) => k + ' x' + n).join(', '));
  report(one('boiler').n === 'Boiler' && one('helm').n === 'Helm' && kindOf('Nest Searchlight') === 'searchlight' && kindOf('Aft Engine') === 'engine' && one('nothing') === undefined, 'one() / kindOf() answers on the classic ship');
  return ok;
}

// S.3: the scratch multi-instance build (classic + a second boiler + a second lookout, tools/fixtures/multi-build.mjs) must
// validate, and a 2-minute botsim of it must run with 0 errors with the bots using BOTH boilers (coal loaded) and BOTH lookouts.
async function checkMulti() {
  const { BUILDS, buildLayout } = await load('modules/host/shipBuild.js');
  const { validate } = await load('modules/host/buildCheck.js');
  const multi = (await import(pathToFileURL(path.join(root, 'tools', 'fixtures', 'multi-build.mjs')).href)).default(BUILDS);
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const v = validate(multi);
  report(v.ok, 'validate(multi build)' + (v.ok ? '' : ': ' + v.fails.join('; ')));
  const layout = buildLayout(multi);
  report(layout.stations.filter((s) => s.kind === 'boiler').length === 2 && layout.stations.filter((s) => s.kind === 'lookout').length === 2, 'multi build has 2 boilers and 2 lookouts');
  // The validator must reject broken kinds / duplicate names / a second helm.
  const bad = (extra) => validate([...multi, ...extra]);
  report(!bad([{ part: 'station', n: 'Fore Boiler', kind: 'boiler', p: 'main', x: 300 }]).ok, 'validate rejects a duplicate station name');
  report(!bad([{ part: 'station', n: 'Mystery', p: 'main', x: 300 }]).ok, 'validate rejects a station with no kind');
  report(!bad([{ part: 'station', n: 'Second Helm', kind: 'helm', p: 'main', x: 300 }]).ok, 'validate rejects a second helm');
  const out = spawnSync(process.execPath, ['tools/botsim.mjs', '--build', 'multi', '--minutes', '2', '--seed', '1', '--map', 'network'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const text = (out.stdout || '') + (out.stderr || '');
  const stats = (text.match(/^BUILD_STATS (.*)$/m) || [])[1];
  report(out.status === 0 && /^errors: 0$/m.test(text) && !!stats, 'botsim --build multi --minutes 2: 0 errors' + (out.status === 0 ? '' : '\n' + text.split('\n').slice(-12).join('\n')));
  if (stats) {
    const { manned, boilerLoads } = JSON.parse(stats);
    report((boilerLoads['Boiler'] || 0) > 0 && (boilerLoads['Fore Boiler'] || 0) > 0, `bots shovelled coal into both boilers (${JSON.stringify(boilerLoads)})`);
    report((manned['Lookout'] || 0) > 0 && (manned['Aft Lookout'] || 0) > 0, `bots manned both lookouts (Lookout ${manned['Lookout'] || 0}s, Aft Lookout ${manned['Aft Lookout'] || 0}s)`);
  }
  return ok;
}

// The 9 seeded botsim runs must give the same summaries as the baseline captured before Phase S.1.
function checkBotsim() {
  const text = fs.readFileSync(path.join(root, 'tools', 'fixtures', 'botsim-baseline.txt'), 'utf8').replace(/\r/g, '');
  const blocks = text.split(/^\$ /m).slice(1).map((b) => { const [cmd, ...rest] = b.split('\n'); return { cmd: cmd.trim(), want: rest.join('\n').trim() }; });
  let ok = true;
  for (const { cmd, want } of blocks) {
    const out = spawnSync(process.execPath, cmd.replace(/^node /, '').split(' '), { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    const got = (out.stdout || '').replace(/\r/g, '').split('\n').filter((l) => !l.startsWith('real time')).join('\n');
    const gotSummary = got.slice(got.indexOf('--- botsim summary ---')).trim();
    const same = gotSummary === want;
    console.log((same ? 'PASS ' : 'FAIL ') + cmd);
    if (!same) {
      ok = false;
      const a = want.split('\n'), b = gotSummary.split('\n');
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) console.log('  baseline: ' + a[i] + '\n  now:      ' + b[i]);
    }
  }
  return ok;
}

// Lint: a value worked out from the layout at import time goes stale when a new build is applied. At module level
// (column 0) a declaration may only ALIAS the layout (`const P = SHIP_LAYOUT.platforms;` is updated in place, so it stays
// fresh), or be a function. Anything else that reads the layout (an index, a .find, a scalar like nestRise ...) is a
// "capture" and must be recomputed in an onLayoutChange(fn) hook instead (mark a deliberate exception with // lint-ok).
async function lint(publicDir) {
  const { SHIP_LAYOUT } = await load('shipLayout.js');
  const containers = Object.keys(SHIP_LAYOUT).filter((k) => SHIP_LAYOUT[k] && typeof SHIP_LAYOUT[k] === 'object');
  const dirs = [publicDir, path.join(publicDir, 'modules', 'host')];
  const skip = new Set(['shipLayout.js', 'shipBuild.js']);
  let bad = 0;
  for (const dir of dirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js') && !skip.has(f))) {
      const lines = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r/g, '').split('\n');
      const whole = new Set(['SHIP_LAYOUT']); // names for the whole layout (L, SHIP_LAYOUT)
      const parts = new Set(); // names for one of its arrays/objects (P = L.platforms)
      const aliasRe = () => new RegExp('\\b(' + [...whole, ...parts].join('|') + ')\\b');
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(.*)$/);
        if (!m) continue;
        let rhs = m[2];
        for (let j = i + 1; j < lines.length && !/;\s*(\/\/.*)?$/.test(rhs) && j < i + 15; j++) rhs += ' ' + lines[j].trim();
        const code = rhs.replace(/\/\/.*$/, '').trim();
        if (/lint-ok/.test(lines[i])) continue;
        if (!aliasRe().test(code)) continue;
        if (/^(\([^)]*\)|\w+)\s*=>/.test(code) || /^(async\s+)?function\b/.test(code)) continue; // a function definition is lazy, so fine
        const pure = code.match(new RegExp('^(' + [...whole, ...parts].join('|') + ')(?:\\.(\\w+))?\\s*;?$'));
        if (pure && whole.has(pure[1]) && !pure[2]) { whole.add(m[1]); continue; }
        if (pure && whole.has(pure[1]) && containers.includes(pure[2])) { parts.add(m[1]); continue; }
        if (pure && parts.has(pure[1]) && !pure[2]) { parts.add(m[1]); continue; }
        bad++;
        console.log(`FAIL ${path.relative(root, path.join(dir, file))}:${i + 1}: module-level capture of the layout: ${lines[i].trim().slice(0, 110)}`);
      }
    }
  }
  // Second rule (S.2): the ship's reference points are layout fields (refPoint, midPoint, aimPoint), not numbers in the code.
  // These spellings are how the classic ship's middle was hard-coded; use SHIP_LAYOUT.refPoint / midPoint / aimPoint instead.
  const coords = [/\.dist\s*[+-]\s*800\b/, /\b(500|470|640)\s*-\s*(state\.ship\.alt|p\.y|t\.y|map\.start\.y)/, /\bTILT_PIVOT\b.*\[\s*800/, /\bSHIP_SAMPLES\s*=\s*\[/];
  const hostDir = path.join(publicDir, 'modules', 'host');
  for (const file of fs.readdirSync(hostDir).filter((f) => f.endsWith('.js') && !skip.has(f))) {
    fs.readFileSync(path.join(hostDir, file), 'utf8').replace(/\r/g, '').split('\n').forEach((line, i) => {
      if (/lint-ok/.test(line) || !coords.some((re) => re.test(line.replace(/\/\/.*$/, '')))) return;
      bad++;
      console.log(`FAIL ${path.relative(root, path.join(hostDir, file))}:${i + 1}: hard-coded ship reference point: ${line.trim().slice(0, 110)}`);
    });
  }
  console.log(bad ? `FAIL lint: ${bad} problem(s)` : 'PASS lint: no module-level captures of derived layout values, no hard-coded ship reference points');
  return !bad;
}

// ---- S.5: the validator CLI and the random-build batch -------------------------------------------------------------
const flag = (name, def) => { const i = argv.indexOf('--' + name); return i < 0 || argv[i + 1] === undefined ? def : argv[i + 1]; };
const has = (name) => argv.includes('--' + name);
const pad = (v, n) => String(v).padEnd(n);
const num = (v, d = 1) => (v == null || Number.isNaN(v) ? 'n/a' : (+v).toFixed(d));

// Run tools/botsim.mjs on a build in a child process. Resolves { stats (BUILD_STATS or null), errors, text }.
let tmpN = 0;
function runBotsim(parts, { map, env, minutes = 3, bots = 6, seed = 1 } = {}) {
  const file = path.join(os.tmpdir(), `airship-build-${process.pid}-${tmpN++}.json`);
  fs.writeFileSync(file, JSON.stringify(parts));
  const a = ['tools/botsim.mjs', '--build', file, '--bots', String(bots), '--minutes', String(minutes), '--seed', String(seed)];
  if (map) a.push('--map', map);
  if (env) a.push('--env', env);
  return new Promise((resolve) => {
    const c = spawn(process.execPath, a, { cwd: root });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => {
      try { fs.unlinkSync(file); } catch { /* already gone */ }
      let stats = null;
      try { const m = out.match(/^BUILD_STATS (.*)$/m); stats = m && JSON.parse(m[1]); } catch { /* no stats: the run crashed */ }
      resolve({ stats, code, errors: stats ? stats.errors : 1, text: out });
    });
  });
}
// Run async jobs (functions returning promises) at most n at a time; results keep their order.
async function pool(jobs, n) {
  const results = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, async () => { while (next < jobs.length) { const i = next++; results[i] = await jobs[i](); } }));
  return results;
}
const printChecks = (checks) => { for (const c of checks) console.log(`  ${c.level.padEnd(4)}  ${c.group.padEnd(14)} ${c.text}`); };

// node tools/buildsim.mjs --build <name|path.json|path.mjs> [--bots-check]
async function buildMode(spec) {
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { validate, formatReport, judgeBotRuns } = await load('modules/host/buildCheck.js');
  const { config } = await load('config.js');
  const parts = await loadBuild(spec, BUILDS);
  if (!parts) throw new Error('Could not read a list of parts from ' + spec);
  const res = validate(parts, { starter: spec === 'classic' || spec === 'sparrow' });
  console.log(formatReport(res, spec));
  let ok = res.ok;
  if (has('bots-check') && res.layout) {
    const BC = config.BUILD_CHECK;
    console.log(`\n  bot run: ${BC.BOT_BOTS} bots, ${BC.BOT_MINUTES} min each on a cave map and an open-sky map...`);
    const runs = await Promise.all(['network', 'open'].map((map) => runBotsim(parts, { map, minutes: BC.BOT_MINUTES, bots: BC.BOT_BOTS })));
    const stats = runs.map((r) => r.stats).filter(Boolean);
    const checks = [];
    if (stats.length < runs.length) checks.push({ group: 'Bot run', level: 'FAIL', text: 'a botsim run crashed: ' + runs.find((r) => !r.stats).text.split('\n').slice(-6).join(' | ') });
    else checks.push(...judgeBotRuns(stats, res.layout));
    printChecks(checks);
    if (checks.some((c) => c.level === 'FAIL')) ok = false;
  }
  console.log(ok ? '\nRESULT: PASS' : '\nRESULT: FAIL');
  return ok;
}

// S.5: the validator must catch what it claims to: each broken build below must FAIL (or WARN) with the named problem, and the classic must pass.
async function checkValidator() {
  const { BUILDS, COL } = await load('modules/host/shipBuild.js');
  const { validate } = await load('modules/host/buildCheck.js');
  const { config } = await load('config.js');
  const C = BUILDS.classic;
  const plus = (...extra) => [...C, ...extra];
  const without = (fn) => C.filter((p) => !fn(p));
  const wider = (id, side, cols) => C.map((p) => (p.part === 'deck' && p.id === id ? { ...p, [side]: p[side] + (side === 'x0' ? -1 : 1) * cols * COL } : p.part === 'frame' ? { part: 'frame', nestRise: p.nestRise, shield: p.shield } : p));
  const lamp = (n, x) => ({ part: 'searchlight', n, p: 'catwalk', x, bx: x, by: 370, aim: -Math.PI / 2, arc: 1.5, len: 44 });
  const cases = [
    ['a station off the end of its deck', plus({ part: 'station', n: 'Lost', kind: 'lookout', p: 'nest', x: 2000 }), 'FAIL', /Lost is off the end/],
    ['a station on a deck that is not there', plus({ part: 'station', n: 'Lost', kind: 'lookout', p: 'nowhere', x: 700 }), 'FAIL', /does not exist/],
    ['two stations on top of each other', plus({ part: 'station', n: 'Twin', kind: 'lookout', p: 'nest', x: 780 }), 'FAIL', /overlap/],
    ['a ladder that goes up', plus({ part: 'ladder', top: 'lower', bottom: 'main', xTop: 400, xBottom: 400 }), 'FAIL', /does not go downward/],
    ['a deck nobody can reach', plus({ part: 'deck', id: 'attic', row: 'belly', name: 'Attic', x0: 100, x1: 200 }), 'FAIL', /no way from/],
    ['a deck nobody can leave (poles only down)', plus({ part: 'deck', id: 'pit', row: 'belly', name: 'Pit', x0: 100, x1: 200 }, { part: 'pole', top: 'lower', bottom: 'pit', xTop: 150, xBottom: 150 }), 'FAIL', /no way from the Pit/],
    ['one boarding point', without((p) => p.part === 'boarderEntry' && p.x === 290), 'FAIL', /boarding point/],
    ['no medbay', without((p) => p.part === 'medbay'), 'FAIL', /no medbay/],
    ['no coal bunker', without((p) => p.n === 'Coal Bunker'), 'FAIL', /no coal/],
    ['no bomb bay (the game still needs one)', without((p) => p.n === 'Bomb Bay'), 'FAIL', /bomb bay/],
    ['a gasbag too small to lift her', C.map((p) => (p.part === 'gasbag' ? { ...p, rx: 700 } : p)), 'FAIL', /too heavy/],
    ['two more engines and no more steam', plus({ part: 'engine', name: 'E3', p: 'lower', x: 170 }, { part: 'engine', name: 'E4', p: 'lower', x: 1430 }, { part: 'pipe', to: 'E3', p: 'lower', points: [[400, 610], [400, 700], [200, 700], [200, 765]], valve: [300, 700] }, { part: 'pipe', to: 'E4', p: 'lower', points: [[430, 610], [430, 710], [1450, 710], [1450, 765]], valve: [800, 710] }), 'FAIL', /cannot keep up/],
    ['a ship far too long', wider('lower', 'x1', 12), 'FAIL', /too big to read/],
    ['a long ship in caves (a player build)', wider('lower', 'x1', 3), 'WARN', /wedges in caves/],
    ['a long ship in caves (a starter ship)', wider('lower', 'x1', 3), 'FAIL', /wedges in caves/, { starter: true }],
    ['too many manned stations for the crew', plus(...Array.from({ length: 8 }, (_, i) => lamp('Extra lamp ' + i, 400 + i * 60))), 'WARN', /manned stations/],
  ];
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const base = validate(C, { starter: true });
  report(base.ok && !base.warns.length, 'the classic ship passes with no warnings');
  for (const [name, parts, want, re, opts] of cases) {
    const v = validate(parts, opts || {});
    const list = want === 'FAIL' ? v.fails : v.warns;
    report(list.some((t) => re.test(t)) && (want === 'FAIL' ? !v.ok : v.ok), `${name}: ${want} ${re}${list.some((t) => re.test(t)) ? '' : ' (got: ' + (v.fails.concat(v.warns).join(' | ') || 'nothing') + ')'}`);
  }
  // A walk over 1.5x its budget FAILs, over the budget WARNs (squeeze the budgets to see both).
  const keep = { ...config.BUILD_CHECK };
  config.BUILD_CHECK.WALK_COAL = 2.0; // the classic coal walk is 2.5 s: over the budget, under 1.5x
  report(validate(C).warns.some((t) => /coal bunker to its boiler/.test(t)), 'a coal walk over its budget WARNs');
  config.BUILD_CHECK.WALK_COAL = 1.0;
  report(validate(C).fails.some((t) => /coal bunker to its boiler/.test(t)), 'a coal walk over 1.5x its budget FAILs');
  Object.assign(config.BUILD_CHECK, keep);
  return ok;
}

// ---- --random: grow random legal builds from the classic ship, botsim each, compare ---------------------------------
const mulberry = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const pearson = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
};
// One run's score: kills per minute, plus missions, minus wrecks, plus hull (the batch compares builds on this).
const scoreOf = (s) => s.killsPerMin + 4 * s.missions - 6 * s.wrecks + s.avgHull / 20;

async function randomMode() {
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { validate, liftGauge } = await load('modules/host/buildCheck.js');
  const { randomMutation } = await load('modules/host/buildSlots.js');
  const count = Number(flag('random', 10)), seed = Number(flag('seed', 1)), minutes = Number(flag('minutes', 4)), bots = Number(flag('bots', 6));
  const envs = flag('envs', 'skyisles,fungal,storm,aether').split(',');
  const par = Number(flag('parallel', Math.max(2, Math.min(8, os.cpus().length - 1))));
  const rng = mulberry(seed);
  // 1. the builds: the classic ship as the reference, then random ones (1-3 mutations each, every step legal; identical builds are skipped)
  const builds = [{ id: 'classic', muts: [], tags: [], parts: BUILDS.classic }];
  const seenKeys = new Set([JSON.stringify(BUILDS.classic)]);
  for (let tries = 0; builds.length <= count && tries < count * 20; tries++) {
    let parts = BUILDS.classic;
    const muts = [], tags = [];
    for (let k = 1 + Math.floor(rng() * 3); k > 0; k--) {
      const m = randomMutation(parts, rng, tags[tags.length - 1] === 'boiler' ? 'engine' : null);
      if (!m) break;
      parts = m.parts;
      muts.push(m.label);
      tags.push(m.tag);
    }
    const key = JSON.stringify(parts);
    if (!muts.length || seenKeys.has(key)) continue;
    seenKeys.add(key);
    builds.push({ id: 'b' + String(builds.length).padStart(2, '0'), muts, tags, parts });
  }
  for (const b of builds) { b.v = validate(b.parts); b.lift = liftGauge(b.parts); }
  console.log(`--- buildsim batch: ${builds.length - 1} random builds (+ classic), seed ${seed}, ${minutes} min, envs ${envs.join(',')}, ${bots} bots, ${par} at a time ---`);
  // 2. botsim every build in every environment, in child processes
  const jobs = [];
  for (const b of builds) { b.runs = {}; for (const env of envs) jobs.push(async () => { b.runs[env] = await runBotsim(b.parts, { env, minutes, bots, seed: 1 }); }); }
  const t0 = Date.now();
  await pool(jobs, par);
  // 3. the table
  const fmtEnv = (r) => (r && r.stats ? `${num(r.stats.killsPerMin)}k ${num(r.stats.avgHull, 0)}h ${r.stats.missions}m ${r.stats.wrecks}w ${num(r.stats.walkPct, 0)}% ${r.stats.tows}t` : 'CRASHED');
  console.log('\ncolumns per environment: kills/min, avg hull, missions, wrecks, walking %, tug rescues');
  console.log(pad('build', 8) + pad('mass/lift/hover', 17) + pad('P cruise/idle', 14) + pad('hands', 7) + pad('validator', 10) + envs.map((e) => pad(e, 24)).join('') + 'err');
  let errTotal = 0, failTotal = 0;
  for (const b of builds) {
    const st = b.v.budgets.steam, hd = b.v.budgets.hands;
    const errs = envs.reduce((n, e) => n + (b.runs[e].errors || 0), 0);
    errTotal += errs;
    if (!b.v.ok) failTotal++;
    console.log(pad(b.id, 8) + pad(`${num(b.lift.mass, 0)}/${num(b.lift.lift, 0)}/${num(b.lift.hover, 0)}`, 17) + pad(`${num(st.cruise, 0)}/${num(st.idle, 0)}`, 14) + pad(hd.stations, 7) + pad(b.v.ok ? (b.v.warns.length ? 'WARN x' + b.v.warns.length : 'PASS') : 'FAIL', 10) + envs.map((e) => pad(fmtEnv(b.runs[e]), 24)).join('') + errs);
    if (b.muts.length) console.log('      + ' + b.muts.join('; '));
    for (const w of b.v.warns) console.log('      ! ' + w);
    for (const e of envs) if (b.runs[e].errors) console.log(`      ERRORS in ${e}: ${(b.runs[e].text.match(/^  - .*$/gm) || b.runs[e].text.split('\n').slice(-4)).slice(0, 3).join(' | ')}`);
  }
  // 4. which parts help or hurt: correlation of "build has this mutation" with the score, per environment
  const tags = [...new Set(builds.flatMap((b) => b.tags))].sort();
  console.log('\nscore = kills/min + 4 x missions - 6 x wrecks + hull/20.  Correlation of each mutation with the score (builds with it vs without), per environment:');
  console.log(pad('mutation', 14) + pad('builds', 8) + envs.map((e) => pad(e, 10)).join('') + 'verdict');
  for (const tag of tags) {
    const has1 = builds.map((b) => (b.tags.includes(tag) ? 1 : 0));
    const n = has1.reduce((a, b) => a + b, 0);
    const rs = envs.map((e) => (builds.every((b) => b.runs[e].stats) ? pearson(has1, builds.map((b) => scoreOf(b.runs[e].stats))) : null));
    const valid = rs.filter((r) => r != null);
    let verdict = 'n/a (too few builds)';
    if (valid.length && n >= 3 && n <= builds.length - 3) {
      verdict = valid.every((r) => r > 0.25) ? 'DOMINANT (helps everywhere)' : valid.every((r) => r < -0.25) ? 'TRAP (hurts everywhere)' : Math.max(...valid) > 0.1 && Math.min(...valid) < -0.1 ? 'situational (sign flips)' : 'neutral';
    }
    console.log(pad(tag, 14) + pad(n, 8) + rs.map((r) => pad(r == null ? 'n/a' : (r >= 0 ? '+' : '') + r.toFixed(2), 10)).join('') + verdict);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n${builds.length} builds x ${envs.length} envs = ${jobs.length} botsim runs in ${secs} s. Validator FAILs: ${failTotal}, botsim errors: ${errTotal}`);
  if (flag('out')) fs.writeFileSync(path.resolve(flag('out')), JSON.stringify(builds.map((b) => ({ id: b.id, muts: b.muts, parts: b.parts, lift: b.lift, runs: Object.fromEntries(envs.map((e) => [e, b.runs[e].stats])) })), null, 1));
  return failTotal === 0 && errTotal === 0;
}

const mode = argv[0];
if (mode === '--snapshot-classic') {
  // Only meaningful before S.1 (when the layout was hand-written); after that it would snapshot the generated layout.
  if (argv[1] !== '--force') { console.log('The fixture is frozen (S.0). Pass --force to rewrite it from the current layout.'); process.exit(2); }
  const { SHIP_LAYOUT } = await load('shipLayout.js');
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(plain(SHIP_LAYOUT), null, 1) + '\n');
  console.log('wrote ' + FIXTURE);
} else if (mode === '--check-classic') {
  process.exit((await checkClassic()) ? 0 : 1);
} else if (mode === '--check-botsim') {
  process.exit(checkBotsim() ? 0 : 1);
} else if (mode === '--check-multi') {
  process.exit((await checkMulti()) ? 0 : 1);
} else if (mode === '--check-validator') {
  process.exit((await checkValidator()) ? 0 : 1);
} else if (mode === '--build') {
  process.exit((await buildMode(argv[1] || 'classic')) ? 0 : 1);
} else if (mode === '--random') {
  process.exit((await randomMode()) ? 0 : 1);
} else if (mode === '--lint') {
  process.exit((await lint(argv[1] ? path.resolve(argv[1]) : path.join(root, 'public'))) ? 0 : 1); // (optional argument: another public/ folder to scan)
} else {
  console.log('node tools/buildsim.mjs --build <name|file> [--bots-check] | --random N [--seed 1 --minutes 4 --envs a,b --bots 6 --out file.json] | --check-classic | --lint | --check-botsim | --check-multi | --check-validator | --snapshot-classic --force');
  process.exit(mode === '--help' || mode === '-h' ? 0 : 2);
}
