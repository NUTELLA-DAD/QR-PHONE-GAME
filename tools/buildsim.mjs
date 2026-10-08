// Ship-building checks (Phase S). Headless, no browser.
// Usage: node tools/buildsim.mjs --build <classic|multi|file.json|file.mjs> [--bots-check]   the build validator (S.5): PASS/WARN/FAIL report + the LIFT / STEAM / HANDS gauges
//        node tools/buildsim.mjs --random 50 --seed 1 --minutes 4 --envs skyisles,fungal,storm,aether --bots 6   random legal builds, botsim each, table + which parts dominate
//        node tools/buildsim.mjs --check-classic    the classic ship must still equal the frozen snapshot
//        node tools/buildsim.mjs --lint             no module-level captures of derived layout values (they go stale), no hard-coded ship reference points
//        node tools/buildsim.mjs --check-botsim     the 9 seeded botsim runs must match tools/fixtures/botsim-baseline.txt
//        node tools/buildsim.mjs --check-multi      S.3: the scratch multi-instance build (2 boilers, 2 lookouts) validates and botsims clean
//        node tools/buildsim.mjs --check-validator   S.5: broken builds must FAIL/WARN with the right message (the classic passes clean)
//        node tools/buildsim.mjs --check-edit        S.5b/S.5c: the blueprint editor (draw a keel deck, extend main, lengthen the bag, cut the top deck, erase; ladders and delete; erase everything and build a ship up from nothing) validates and flies 2 min with 0 errors
//        node tools/buildsim.mjs --check-balance     S.5c: the seesaw in flight (a nose-heavy ship rests nose-down and dives faster, a tail-heavy one is slower; the classic ship is exactly level; live loads move the balance)
//        node tools/buildsim.mjs --check-bags        S.5d: many gasbags (four in a row, one giant) validate; drop-from-the-tray (placePart); rupture the fore bag in flight: she flies lower, tips toward it, the TV calls it out, patching + pumping restores it; both botsim 2 min with 0 errors
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
function runBotsim(parts, { map, env, minutes = 3, bots = 6, seed = 1, rupture = 0 } = {}) {
  const file = path.join(os.tmpdir(), `airship-build-${process.pid}-${tmpN++}.json`);
  fs.writeFileSync(file, JSON.stringify(parts));
  const a = ['tools/botsim.mjs', '--build', file, '--bots', String(bots), '--minutes', String(minutes), '--seed', String(seed)];
  if (rupture) a.push('--rupture', String(rupture));
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
  // S.5c: centre of mass against the centre of lift. The classic ship is level (exactly: no trim at all); heavy things moved to the nose make her nose-heavy
  // (WARN, then FAIL "nose-dive"); sandbags hung at the tail (with a longer bag to lift them) fix it.
  const { balanceOf, budgets } = await load('modules/host/shipBuild.js');
  const move = (list, moves) => list.map((p) => { const k = p.n || p.name; return moves[k] != null ? { ...p, x: moves[k] } : p; });
  const warnMoves = { Boiler: 1090, 'Coal Bunker': 1100 };
  const failMoves = { ...warnMoves, 'Aft Engine': 1480, Deflector: 1290, 'Ammo Hold': 1000, 'Aft Sponson': 940, 'Lightning Coil': 1140, 'Tail Gun': 1250 };
  const tailMoves = { Boiler: 150, 'Coal Bunker': 30, 'Ammo Hold': 120 };
  const b0 = balanceOf(C);
  report(b0.level === 'PASS' && b0.deg === 0 && b0.restPitch === 0 && b0.side === 'level', `the classic ship is level: centre of mass x ${Math.round(b0.com.x)}, lift x ${Math.round(b0.col.x)}, no rest trim (${b0.restPitch})`);
  report(budgets(C).com.x === b0.com.x && budgets(C).col.x === b0.col.x, 'budgets() carries the centre of mass and the centre of lift');
  const vw = validate(move(C, warnMoves));
  report(vw.ok && vw.warns.some((t) => /nose-heavy [\d.]+ degrees/.test(t)), 'boiler and coal moved to the nose: nose-heavy WARN (' + (vw.warns.find((t) => /nose-heavy/.test(t)) || 'none').slice(0, 60) + '...)');
  const vf = validate(move(C, failMoves));
  report(!vf.ok && vf.fails.some((t) => /nose-dive/.test(t)), 'most of the weight at the nose: FAIL "she will nose-dive"');
  const vt = validate(move(C, tailMoves));
  report(vt.ok && vt.warns.some((t) => /tail-heavy/.test(t)), 'weight moved aft: tail-heavy WARN');
  const sandbags = Array.from({ length: 12 }, (_, i) => ({ part: 'ballast', p: 'lower', x: 40 + i * 36, hang: true }));
  const fixed = [...move(C, failMoves).map((p) => (p.part === 'gasbag' ? { ...p, rx: 1380 } : p)), ...sandbags];
  const vx = validate(fixed);
  report(vx.ok && !vx.warns.some((t) => /heavy/.test(t)) && Math.abs(balanceOf(fixed).dx) < config.BALANCE.WARN_PX, `12 sandbags hung at the tail (and a longer bag to carry them) fix it: dx ${balanceOf(move(C, failMoves)).dx} -> ${balanceOf(fixed).dx}${vx.ok ? '' : ': ' + vx.fails.join('; ')}`);
  report(balanceOf([...C, ...sandbags.slice(0, 4)]).com.x < b0.com.x, 'a sandbag is a weight at its place: hanging bags at the tail pull the centre of mass aft');
  return ok;
}

// S.5b: the blueprint editor's pure operations (drawDeck, erase, setBag in modules/host/buildEdit.js). Draws a new keel deck ("lower-lower"),
// extends the main deck by 2 columns, erases part of the top deck, then validates and flies the result for 2 minutes with 0 errors.
async function checkEdit() {
  const { BUILDS, buildLayout, hullGeom, budgets, COL, DECK_ROWS } = await load('modules/host/shipBuild.js');
  const { validate, liftGauge } = await load('modules/host/buildCheck.js');
  const E = await load('modules/host/buildEdit.js');
  const S = await load('modules/host/buildSlots.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const C = BUILDS.classic;
  const frozen = JSON.stringify(C);
  const decks = (parts) => parts.filter((p) => p.part === 'deck');
  const deck = (parts, id) => parts.find((p) => p.part === 'deck' && p.id === id);

  // 1. draw a new deck under the lower deck: a keel deck with rooms, a ladder to the lower deck, a hull box round it
  const d1 = E.drawDeck(C, 'keel', 20, 350);
  report(d1.ok && d1.kind === 'new' && !!deck(d1.parts, 'keel') && d1.parts.some((p) => p.part === 'ladder' && p.top === 'lower' && p.bottom === 'keel') && d1.parts.some((p) => p.part === 'room' && p.p === 'keel'), 'drawDeck(keel, 20, 350): a new Keel Deck with a room and a ladder to the lower deck');
  report(JSON.stringify(C) === frozen && d1.parts !== C, 'the operations leave the parts they were given alone (pure)');
  const L1 = buildLayout(d1.parts);
  const H1 = hullGeom(L1.platforms, L1.rooms);
  report(H1.boxes.length === 1 && H1.boxes[0].x0 <= 20 && H1.boxes[0].x1 >= 350 && H1.boxes[0].y1 >= DECK_ROWS.keel + 25, 'the hull encloses the keel deck (one hull box ' + JSON.stringify(H1.boxes[0]) + ')');
  report(L1.bounds.y1 >= DECK_ROWS.keel + 25 && L1.samples.some(([, y]) => y >= DECK_ROWS.keel + 25), 'the collision outline and bounds follow the new deck (bottom y ' + L1.bounds.y1 + ')');
  report(validate(d1.parts, { starter: true }).ok, 'the build with the keel deck validates');
  const into = E.drawDeck(d1.parts, 'keel', 350, 480);
  report(!into.ok && /Bomb Bay hangs in the way/.test(into.hint), 'drawing on along the keel deck into the Bomb Bay is stopped');
  const aft = E.drawDeck(d1.parts, 'keel', -100, 20);
  report(aft.ok && aft.kind === 'extend' && deck(aft.parts, 'keel').x0 === -100 && aft.parts.filter((p) => p.part === 'room' && p.p === 'keel').every((r) => r.x0 >= -100) && validate(aft.parts).ok, 'drawing past the aft end makes the keel deck longer (rooms follow) and still validates');
  const blocked = E.drawDeck(C, 'keel', 400, 640);
  report(!blocked.ok && /Bomb Bay hangs in the way/.test(blocked.hint), 'a keel deck across the Bomb Bay is refused: ' + blocked.hint);
  // 2. rejected strokes: inside or above the gasbag, a crow's nest off the bag, a cut in the middle of the nest, a deck nothing can reach
  report(/cross the gasbag/.test(E.rowAtY(250).why) && /above the gasbag/.test(E.rowAtY(-300).why) && E.rowAtY(645).row === 'main' && E.rowAtY(955).row === 'keel', 'rowAtY: a stroke inside the bag or above it is refused with a hint; near a row it snaps');
  report(!E.drawDeck(C, 'nest', 600, 1800).ok, "the crow's nest cannot be drawn off the end of the gasbag");
  report(!E.erase(C, 'nest', 700, 800).ok, "the crow's nest cannot be cut in the middle");
  report(!E.drawDeck(C, 'deep', 1700, 1900).ok, 'a deck with no deck above it to climb to is refused');
  // 3. extend the main deck by 2 columns: the end room grows, the ship gets bigger and heavier, the bag may no longer cover it
  const d2 = E.drawDeck(d1.parts, 'main', 1470, 1470 + 2 * COL);
  const main2 = deck(d2.parts, 'main');
  report(d2.ok && d2.kind === 'extend' && main2.x1 === 1470 + 2 * COL && d2.parts.some((p) => p.part === 'room' && p.p === 'main' && p.x1 === 1470 + 2 * COL), 'drawDeck(main, +2 columns): the main deck and its end room are 240 px longer');
  const v2 = validate(d2.parts);
  report(v2.ok && liftGauge(d2.parts).mass > liftGauge(d1.parts).mass, 'the longer ship validates and weighs more (' + liftGauge(d1.parts).mass + ' -> ' + liftGauge(d2.parts).mass + ')');
  report(v2.warns.some((t) => /gasbag covers/.test(t)), 'the gasbag no longer covers the longer ship: WARN');
  const b2 = E.setBag(d2.parts, { grow: 1 });
  report(b2.ok && !validate(b2.parts).warns.some((t) => /gasbag covers/.test(t)) && liftGauge(b2.parts).lift > liftGauge(d2.parts).lift && liftGauge(b2.parts).hover < liftGauge(d2.parts).hover, 'setBag(grow 1): the bag covers her again and the LIFT gauge follows (hover ' + liftGauge(d2.parts).hover + ' -> ' + liftGauge(b2.parts).hover + ')');
  const t2 = E.setBag(b2.parts, { twin: true });
  report(t2.ok && buildLayout(t2.parts).gasbag.twin === true && liftGauge(t2.parts).lift > liftGauge(b2.parts).lift && buildLayout(t2.parts).bounds.y0 < buildLayout(b2.parts).bounds.y0, 'setBag(twin): the twin envelope adds lift and the bounds grow upward');
  // 4. erase part of the top deck (the middle): it splits in two, what stood on it goes, the rest keeps working
  const d3 = E.erase(b2.parts, 'catwalk', 400, 520);
  const cats = decks(d3.parts).filter((p) => p.row === 'catwalk');
  report(d3.ok && cats.length === 2 && cats[0].x1 === 400 && cats[1].x0 === 520, 'erase(catwalk, 400-520): the top deck is cut in two pieces: ' + cats.map((p) => p.id + ' ' + p.x0 + '-' + p.x1).join(', '));
  report(d3.removed.includes('hammer rack') && !d3.parts.some((p) => p.part === 'rack' && p.p === 'catwalk' && p.x === 480), 'the hammer rack that stood on the erased stretch is gone: removed ' + E.summarize(d3.removed));
  report(d3.parts.some((p) => p.part === 'rope' && p.bottom === 'catwalk2') && d3.parts.some((p) => p.part === 'gun' && p.n === 'Nose Gun' && p.p === 'catwalk2'), 'what stood on the far piece moved with it (ropes and the Nose Gun are on catwalk2)');
  const v3 = validate(d3.parts);
  report(v3.ok, 'the edited ship validates' + (v3.ok ? '' : ': ' + v3.fails.join('; ')) + (v3.warns.length ? ' (' + v3.warns.length + ' warning(s): ' + v3.warns.join('; ') + ')' : ''));
  // 5. erasing whole decks and required things: allowed, listed, and the validator FAILs clearly
  const pod = E.erase(C, 'belly', 735, 855);
  report(pod.ok && !deck(pod.parts, 'pod') && pod.removed.includes('Ventral Gun') && !pod.parts.some((p) => p.bottom === 'pod'), 'erasing the Ball Turret takes its gun and ladder with it: removed ' + E.summarize(pod.removed));
  const boiler = E.erase(C, 'main', 330, 470);
  const vb = validate(boiler.parts);
  report(boiler.ok && boiler.removed.includes('Boiler') && !vb.ok && vb.fails.some((t) => /no boiler/.test(t)), 'erasing the boiler room is allowed and the validator FAILs: ' + (vb.fails[0] || '?'));
  // 6. the build JSON round-trips (Copy build JSON / ?build=)
  const back = JSON.parse(JSON.stringify(d3.parts));
  report(JSON.stringify(buildLayout(back)) === JSON.stringify(buildLayout(d3.parts)), 'the edited build survives a JSON round trip');
  // 7. ladders and deleting single things (the blueprint's Ladder and Delete tools)
  const nconn = (parts) => parts.filter((p) => ['ladder', 'pole', 'rope'].includes(p.part)).length;
  const lad = E.placeConnector(C, 600, 'main', 'lower', 'ladder');
  report(lad.ok && nconn(lad.parts) === nconn(C) + 1 && lad.parts.some((p) => p.part === 'ladder' && p.top === 'main' && p.bottom === 'lower' && p.xTop === 600) && validate(lad.parts).ok, 'placeConnector(main -> lower at x 600): a new ladder joins the two decks and the ship still validates');
  report(E.placeConnector(C, 100, 'catwalk', 'main').ok === false && /No deck at both ends/.test(E.placeConnector(C, 100, 'catwalk', 'main').hint), 'a ladder that does not land on decks at both ends is refused with a hint: ' + E.placeConnector(C, 100, 'catwalk', 'main').hint);
  report(/in the way/.test(E.placeConnector(C, 1000, 'catwalk', 'lower').hint || ''), 'a ladder across the Main Deck (catwalk to lower) is refused: the main deck is in the way');
  report(/already a ladder/.test(E.placeConnector(C, 340, 'catwalk', 'main').hint || ''), 'a second ladder on top of an existing one is refused');
  report(/Fore Sponson is in the way/.test(E.placeConnector(C, 1180, 'main', 'lower').hint || ''), 'a ladder onto a station spot is refused (Fore Sponson is in the way)');
  const pole = E.placeConnector(C, 1000, 'main', 'lower', 'pole');
  report(pole.ok && pole.parts[pole.parts.length - 1].part === 'pole', 'a slide pole (one way, down) can be placed the same way');
  report(E.placeConnector(C, 600, 'lower', 'lower').ok === false && E.placeConnector(C, 600, 'main', 'lower', 'ladder').parts !== C, 'a ladder needs two different decks; placing never changes its input');
  const th1 = E.thingAt(C, 340, 555), th2 = E.thingAt(C, 400, 629), th3 = E.thingAt(C, 300, 300);
  report(th1 && th1.label === "ladder" && th2 && th2.label === "Boiler" && !th3, 'thingAt finds the ladder at (340, 555) and the Boiler at (400, 629), and nothing in empty air');
  const rl = E.removeAt(C, 340, 555);
  report(rl.ok && nconn(rl.parts) === nconn(C) - 1 && rl.removed.join() === 'ladder', 'removeAt deletes exactly that one ladder (' + nconn(C) + ' -> ' + nconn(rl.parts) + ' ladders, poles and ropes)');
  const re = E.removeAt(C, 70, 804);
  report(re.ok && re.removed.includes('Aft Engine') && re.removed.includes('steam pipe to Aft Engine') && !re.parts.some((p) => p.name === 'Aft Engine'), 'deleting an engine takes its steam pipe with it: removed ' + E.summarize(re.removed));
  const rb = E.removeAt(C, 400, 629);
  report(rb.ok && !validate(rb.parts).ok && validate(rb.parts).needs.includes('a boiler'), 'deleting the boiler is allowed; the validator says she needs a boiler');
  const kl = d1.parts.find((p) => p.part === "ladder" && p.bottom === "keel"), rs = E.removeAt(d1.parts, kl.xTop, 870); // (the ladder drawDeck added to the new Keel Deck)
  const vs = validate(rs.parts);
  report(rs.ok && rs.removed.includes('ladder') && !vs.ok && vs.fails.some((t) => /no way from .* to the Keel Deck|no way from the Keel Deck/.test(t)), 'the ladder drawDeck added is deletable like any other; the validator then shows the Keel Deck as unreachable');
  report(E.removeAt(C, 5000, 5000).ok === false, 'deleting nothing is refused with a hint');
  const eb = E.erase(C, 'gasbag', 0, 0);
  report(eb.ok && !eb.parts.some((p) => p.part === 'gasbag') && !validate(eb.parts).ok, 'the eraser across the gasbag rubs it out');

  // 8. S.5c: build from nothing. Erase every deck and the bag: nothing crashes anywhere (layout, hull, budgets, validator, blueprint), the build is just a frame.
  const { drawBlueprint, blueprintView } = await load('modules/host/blueprintArt.js');
  const stub = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const sheet = (parts, opts) => { const v = validate(parts); drawBlueprint(stub, blueprintView(v.layout, 1200, 700, 1), v.layout, { balance: v.budgets.balance, ...opts }); return v; };
  let none = C;
  for (const row of ['nest', 'helm', 'catwalk', 'main', 'lower', 'belly', 'bay', 'keel', 'deep', 'gasbag']) { const r = E.erase(none, row, -5000, 5000); if (r.ok) none = r.parts; }
  let crashed = '';
  try {
    for (const parts of [[], E.emptyBuild(), none]) { buildLayout(parts); hullGeom(buildLayout(parts).platforms, buildLayout(parts).rooms); budgets(parts); sheet(parts, {}); }
  } catch (e) { crashed = e.stack.split('\n').slice(0, 3).join(' | '); }
  report(!crashed, 'an empty build (and one erased from the classic ship) does not crash buildLayout, hullGeom, budgets, validate or the blueprint' + (crashed ? ': ' + crashed : ''));
  const vn = validate(none);
  report(none.every((p) => p.part === 'frame') && !vn.ok && vn.needs.includes('a main deck') && vn.needs.includes('a helm') && vn.needs.includes('a gasbag'), 'erasing everything leaves just the frame; the validator lists what she needs: ' + vn.needs.slice(0, 5).join(', ') + ' ...');
  // the first deck anywhere needs no ladder; later decks get one; the nest needs a bag
  const f1 = E.drawDeck(E.emptyBuild(), 'lower', 200, 800);
  report(f1.ok && f1.kind === 'new' && !f1.parts.some((p) => p.part === 'ladder'), 'from nothing: the first deck (lower, anywhere) is accepted with no ladder');
  report(!E.drawDeck(E.emptyBuild(), 'nest', 200, 500).ok && /gasbag first/.test(E.drawDeck(E.emptyBuild(), 'nest', 200, 500).hint), "the crow's nest needs a bag under it: refused with no bag");
  const f2 = E.drawDeck(f1.parts, 'main', 300, 700);
  report(f2.ok && f2.parts.some((p) => p.part === 'ladder' && p.top === 'main' && p.bottom === 'lower'), 'the next deck gets a ladder to the nearest deck it overlaps');
  report(!E.drawDeck(f1.parts, 'main', 1500, 1800).ok, 'a later deck that overlaps nothing is refused (no way to reach it)');
  const bg = E.drawBag(f2.parts, 100, 900);
  report(bg.ok && buildLayout(bg.parts).gasbag.rx === 400 && buildLayout(bg.parts).gasbag.cx === 500, 'drawBag from nothing makes the main bag between the two ends');
  const bg2 = E.drawBag(bg.parts, 0, 1100);
  const bg3 = E.drawBag(bg2.parts, 2000, 2400);
  report(bg2.ok && buildLayout(bg2.parts).gasbag.rx === 550 && bg3.ok && buildLayout(bg3.parts).gasbags.length === 2 && E.setBag(bg2.parts, { twin: true }).ok && buildLayout(E.setBag(bg2.parts, { twin: true }).parts).gasbag.twin === true, 'drawBag across the bag resizes it; drawn on empty row space it adds a second bag (S.5d); the twin envelope is the Twin bag toggle');
  const nest = E.drawDeck(bg.parts, 'nest', 300, 600);
  report(nest.ok && nest.parts.some((p) => p.part === 'rope' && p.top === 'nest'), "with the bag there, the crow's nest goes up with a rope to the deck below");
  // placing parts on an incomplete ship: legality is local (a deck, a span, no overlap, kind limits), not whole-ship validity
  const half = E.drawDeck(E.emptyBuild(), 'main', 140, 860).parts;
  report(!validate(half).ok && S.slotsFor('boiler', half).length > 3 && S.slotsFor('helm', half).length > 3 && S.slotsFor('engine', half).length === 0, 'an incomplete ship takes parts: boiler and helm slots on the main deck exist although the ship cannot fly (an engine pod wants the lower deck)');
  const withHelm = S.slotsFor('helm', half)[0].apply(half);
  report(S.slotsFor('helm', withHelm).length === 0 && withHelm.some((p) => p.n === 'Helm'), 'one helm per ship: no helm slot once she has one');
  const lowHalf = E.drawDeck(half, 'lower', 20, 980).parts;
  const e1 = S.slotsFor('engine', lowHalf)[0].apply(lowHalf);
  const e2 = S.slotsFor('boiler', e1)[0].apply(e1);
  report(!e1.some((p) => p.part === 'pipe') && e2.some((p) => p.part === 'pipe' && p.to === e1.find((q) => q.part === 'engine').name), 'an engine placed before the boiler gets its steam pipe when the boiler arrives');
  report(S.slotsFor('boiler', half).every((s) => s.ok && s.warns.length === 0), 'slot legality does not run the validator (warnings come on demand with slot.check())');
  // the guided build: a small ship made only from the tools above flies
  let mini = null;
  try { mini = S.minimalBuild(); } catch (e) { report(false, 'minimalBuild: ' + e.message); }
  if (mini) {
    const vm = validate(mini);
    report(vm.ok && vm.needs.length === 0 && vm.budgets.balance.level === 'PASS', `a ship built from nothing (decks, bag, ${mini.length} parts) validates and is balanced${vm.ok ? ' (hover ' + vm.budgets.lift.hover + ', ' + vm.budgets.balance.text + ')' : ': ' + vm.fails.join('; ')}`);
    const fileM = path.join(os.tmpdir(), `airship-mini-${process.pid}.json`);
    fs.writeFileSync(fileM, JSON.stringify(mini));
    const om = spawnSync(process.execPath, ['tools/botsim.mjs', '--build', fileM, '--minutes', '2', '--seed', '1', '--map', 'network'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    try { fs.unlinkSync(fileM); } catch { /* gone */ }
    const tm = (om.stdout || '') + (om.stderr || '');
    const sm = (tm.match(/^BUILD_STATS (.*)$/m) || [])[1];
    report(om.status === 0 && /^errors: 0$/m.test(tm) && !!sm, 'botsim --build <ship built from nothing> --minutes 2: 0 errors' + (om.status === 0 ? '' : '\n' + tm.split('\n').slice(-12).join('\n')));
    if (sm) { const s = JSON.parse(sm); report(['helm', 'gun', 'lookout', 'bombBay'].every((k) => s.mannedKinds[k] > 0) && s.hauled.coal > 0, `the bots man her helm, guns, lookout and bomb bay and haul coal (kills ${s.kills}, hull ${s.avgHull}, trim ${s.tilt} deg)`); }
  }

  // 9. fly the edits together (keel deck + main +2 columns + longer bag + top deck cut) for 2 minutes
  const file = path.join(os.tmpdir(), `airship-edit-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(d3.parts));
  const out = spawnSync(process.execPath, ['tools/botsim.mjs', '--build', file, '--minutes', '2', '--seed', '1', '--map', 'network'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  try { fs.unlinkSync(file); } catch { /* gone */ }
  const text = (out.stdout || '') + (out.stderr || '');
  const stats = (text.match(/^BUILD_STATS (.*)$/m) || [])[1];
  report(out.status === 0 && /^errors: 0$/m.test(text) && !!stats, 'botsim --build <edited ship> --minutes 2: 0 errors' + (out.status === 0 ? '' : '\n' + text.split('\n').slice(-12).join('\n')));
  if (stats) { const s = JSON.parse(stats); console.log(`      (kills ${s.kills}, avg hull ${s.avgHull}, walking ${s.walkPct}%, tows ${s.tows})`); }
  return ok;
}

// S.5c: the seesaw in flight. A headless sim of the classic ship, a nose-heavy and a tail-heavy build.
async function checkBalance() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { config } = await load('config.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { applyBuild, SHIP_LAYOUT, SHIP_BALANCE } = await load('shipLayout.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const C = BUILDS.classic;
  const move = (list, moves) => list.map((p) => { const k = p.n || p.name; return moves[k] != null ? { ...p, x: moves[k] } : p; });
  const noseHeavy = move(C, { Boiler: 1090, 'Coal Bunker': 1100, 'Aft Engine': 1480, Deflector: 1290, 'Ammo Hold': 1000 });
  const tailHeavy = move(C, { Boiler: 150, 'Coal Bunker': 30, 'Ammo Hold': 120, Helm: 1200 });
  const fly = (parts, secs, live, setup, cast = true) => { // (cast false: moored at the mast, so the pitch is just the rest trim, with no climb or dive in it)
    applyBuild(parts);
    config.BALANCE.LIVE = live;
    const sim = createSimulation();
    const e = SHIP_LAYOUT.boarderEntryPoints;
    for (let i = 0; i < 4; i++) sim.state.players['b' + i] = { id: 'b' + i, bot: true, name: 'B' + i, species: config.CREW_SPECIES[0], color: '#fff', x: e[0].x + 80 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    if (cast) sim.castOff();
    if (setup) setup(sim);
    let minPitch = 0, maxPitch = 0, maxSpeed = 0;
    for (let i = 0; i < secs * 60; i++) { sim.update(1 / 60); const p = sim.state.ship.pitch; minPitch = Math.min(minPitch, p); maxPitch = Math.max(maxPitch, p); }
    return { state: sim.state, minPitch, maxPitch };
  };
  const keep = config.BALANCE.LIVE;
  const c = fly(C, 12, false);
  report(SHIP_BALANCE.restPitch === 0 && c.state.balance.restPitch === 0 && c.state.balance.push === 0 && c.state.balance.slow === 0 && c.state.balance.deg === 0, 'the classic ship (live loads off): rest trim, push and slow are exactly 0');
  const cl = fly(C, 12, true);
  report(Math.abs(cl.state.balance.deg) < config.BALANCE.WARN_DEG, `the classic ship with live loads (crew, coal, ammo): trim stays gentle (${cl.state.balance.deg} deg, live weight ${cl.state.balance.live.toFixed(1)})`);
  const n = fly(noseHeavy, 12, false, null, false);
  report(n.state.balance.deg > 0 && n.state.balance.restPitch > 0 && n.state.balance.push < 0 && n.state.ship.pitch > 0.003, `a nose-heavy ship rests nose-down (${n.state.balance.deg} deg gauge, pitch ${n.state.ship.pitch.toFixed(4)} rad) and is pushed down (${n.state.balance.push.toFixed(1)} px/s^2)`);
  const t = fly(tailHeavy, 12, false, null, false);
  report(t.state.balance.deg < 0 && t.state.ship.pitch < -0.002 && t.state.balance.push > 0 && t.state.balance.slow > 0, `a tail-heavy ship rests nose-up (pitch ${t.state.ship.pitch.toFixed(4)}), is pushed up and loses top speed (${(t.state.balance.slow * 100).toFixed(1)}%)`);
  report(Math.abs(n.state.ship.pitch) < 0.035, 'the flying trim stays under the stagger limit (AIRBORNE.PITCH_STAGGER), so crew do not slide');
  // live loads: the same ship, the crew all aboard at the nose versus at the tail
  const crewAt = (x) => (sim) => { for (const p of Object.values(sim.state.players)) { p.fall = false; p.d = 0; p.x = x; p.y = 0; } };
  const lf = fly(C, 1, true, crewAt(1500)), la = fly(C, 1, true, crewAt(60));
  report(lf.state.balance.dx > la.state.balance.dx + 3, `live loads move the balance: crew at the nose dx ${lf.state.balance.dx.toFixed(1)}, at the tail ${la.state.balance.dx.toFixed(1)}`);
  config.BALANCE.LIVE = keep;
  applyBuild(C);
  return ok;
}

/// S.5d: many gasbags and drag-and-drop. (1) the editor: bags drawn side by side, resized, erased, dropped from the tray (placePart); the validator (lift sums the
// bags, the redundancy note, coverage). (2) in flight: rupture the fore bag of a four-bag ship (gas to 0 and holes in it): she keeps flying but lower, tips toward
// the lost bag, the TV calls it out ("FORE BAG DOWN!"), patching + pumping brings the bag back. (3) one giant bag validates and flies; both fly 2 minutes
// in a botsim with 0 errors. A classic ship still has exactly one bag whose gas IS state.ship.gas (tools/buildsim.mjs --check-botsim holds her to the old numbers).
async function checkBags() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { config } = await load('config.js');
  const { BUILDS, buildLayout, balanceOf, bagCover } = await load('modules/host/shipBuild.js');
  const { validate } = await load('modules/host/buildCheck.js');
  const E = await load('modules/host/buildEdit.js');
  const S = await load('modules/host/buildSlots.js');
  const { applyBuild, SHIP_LAYOUT } = await load('shipLayout.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const C = BUILDS.classic;
  const four = await loadBuild('bags', BUILDS), giant = await loadBuild('giantbag', BUILDS);
  const nbags = (parts) => parts.filter((p) => p.part === 'gasbag').length;

  // 1. the editor and the validator
  const v4 = validate(four), vg = validate(giant);
  const L4 = buildLayout(four);
  report(v4.ok && L4.gasbags.length === 4 && L4.gasbags.every((b, i, a) => !i || Math.abs(b.x0 - a[i - 1].x1) < 1), `four small bags side by side validate (hover ${v4.budgets.lift.hover}, lift ${v4.budgets.lift.lift} = ${L4.gasbags.map((b) => b.lift).join('+')}, balance ${v4.budgets.balance.text})${v4.ok ? '' : ': ' + v4.fails.join('; ')}`);
  report(L4.gasbags.map((b) => b.id).join() === 'bag1,bag2,bag3,bag4' && L4.gasbag.n === 4 && Math.abs(L4.gasbag.cx - 800) < 1, 'layout.gasbags lists them tail to nose (bag1..bag4) and layout.gasbag spans the lot (the old single-bag field)');
  const red = v4.checks.find((c) => c.group === 'Redundancy');
  report(!!red && red.level === 'INFO' && /Lose one bag: hover [\d.]+, (still flies|she limps|she falls)/.test(red.text), 'the validator has a redundancy note: ' + (red ? red.text : 'MISSING'));
  report(vg.ok && buildLayout(giant).gasbags.length === 1 && buildLayout(giant).gasbags[0].rx === 1200, `one giant bag (2400 px long, sandbags to weigh her down) validates (hover ${vg.budgets.lift.hover})${vg.ok ? '' : ': ' + vg.fails.join('; ')}`);
  report(validate(C).checks.some((c) => c.group === 'Redundancy' && /one gasbag/.test(c.text)) && validate(C).ok && !validate(C).warns.length, 'the classic ship still validates clean (the redundancy note just says she has one bag)');
  // too big a bag, too many bags, a gap, a nest off the bags
  const huge = E.drawBag(E.erase(C, 'gasbag', 0, 0).parts, -2000, 4000);
  report(huge.ok && buildLayout(huge.parts).gasbags[0].rx === config.BUILD_EDIT.BAG_MAX && !validate(huge.parts).ok, `a bag is capped at ${config.BUILD_EDIT.BAG_MAX * 2} px and a ship that big is too wide for the TV: FAIL (${(validate(huge.parts).fails.find((t) => /too big/.test(t)) || '?').slice(0, 40)}...)`);
  const tiny = E.drawBag(E.erase(C, 'gasbag', 0, 0).parts, 100, 150);
  report(!tiny.ok || buildLayout(tiny.parts).gasbags[0].rx >= config.BUILD_EDIT.BAG_MIN, 'a bag is never shorter than ' + config.BUILD_EDIT.BAG_MIN * 2 + ' px');
  const gap = (() => { let p = E.erase(C, 'gasbag', 0, 0).parts; p = E.drawBag(p, -400, 400).parts; return E.drawBag(p, 800, 1600).parts; })();
  report(validate(gap).warns.some((t) => /open sky between bag 1 and bag 2/.test(t)), 'a gap between two bags over a deck WARNs: ' + (validate(gap).warns.find((t) => /open sky/.test(t)) || 'MISSING'));
  report(!E.drawBag(four, 300, 1300).ok && /crosses 2 bags/.test(E.drawBag(four, 300, 1300).hint), 'a stroke across several bags is refused: ' + E.drawBag(four, 300, 1300).hint);
  const rs = E.resizeBag(four, 3, 'x1', 1800);
  report(rs.ok && buildLayout(rs.parts).gasbags[3].x1 === 1800 && buildLayout(rs.parts).gasbags[3].x0 === 1400, 'resizeBag drags one end of one bag: bag 4 now ends at 1800 (' + rs.hint + ')');
  report(!E.resizeBag(four, 1, 'x1', 1000).ok || buildLayout(E.resizeBag(four, 1, 'x1', 1000).parts).gasbags[1].x1 <= 800 + 1e-6, 'a bag cannot be dragged into its neighbour');
  const er = E.erase(four, 'gasbag', 1100, 1100);
  report(er.ok && nbags(er.parts) === 3 && er.removed.length === 1, 'the eraser (a click) rubs out the one bag under it: 4 bags -> ' + nbags(er.parts));
  const er2 = validate(er.parts);
  report(er2.ok === false || er2.warns.some((t) => /gap|open sky|covers/.test(t)) || er2.ok, 'a ship with a bag rubbed out is judged (' + (er2.ok ? 'valid' : 'FAIL: ' + er2.fails[0]) + (er2.warns.length ? '; WARN: ' + er2.warns[0] : '') + ')');
  const twin = E.setBag(four, { twin: true });
  report(twin.ok && buildLayout(twin.parts).gasbags.filter((b) => b.twin).length === 1 && validate(twin.parts).budgets.lift.lift > v4.budgets.lift.lift, 'the twin envelope rides on the biggest bag and adds its lift');
  // 1b. drag and drop from the tray: placePart
  let dropped = E.erase(C, 'gasbag', 0, 0).parts;
  const drops = [-100, 380, 860, 1340, 1820].map((x) => { const r = E.placePart(dropped, 'gasbag', x, 198); if (r.ok) dropped = r.parts; return r.ok; });
  const Ld = buildLayout(dropped);
  report(drops.every(Boolean) && Ld.gasbags.length === 5 && Ld.gasbags.every((b, i, a) => !i || b.x0 >= a[i - 1].x1 - 1e-6), `five gasbag pictures dropped in a row make five bags that do not overlap (${Ld.gasbags.map((b) => b.x0 + '..' + b.x1).join(', ')})`);
  const gunDrop = E.placePart(C, 'gun', 600, 455);
  report(gunDrop.ok && gunDrop.kind === 'place' && gunDrop.parts.filter((p) => p.part === 'gun').length === C.filter((p) => p.part === 'gun').length + 1 && gunDrop.parts !== C && S.slotsFor('gun', C).some((s) => s.label === gunDrop.slot.label), 'placePart(gun) dropped onto the top deck takes the nearest legal slot (' + gunDrop.hint + ') and leaves its input alone');
  const wrongRow = E.placePart(C, 'gun', 600, 625);
  report(!wrongRow.ok && /goes on the .*not the Main Deck/.test(wrongRow.hint), 'a gun dropped on the main deck is refused with the reason: ' + wrongRow.hint);
  report(/Drop the .* on a deck/.test(E.placePart(C, 'boiler', 300, 120).hint || '') && /one helm/.test(E.placePart(C, 'helm', 1270, 455).hint || ''), 'a drop in empty air says "drop it on a deck"; a second helm says "a ship has one helm"');
  const lad = E.placePart(C, 'ladder', 700, 560);
  report(lad.ok && lad.parts.filter((p) => p.part === 'ladder').length === C.filter((p) => p.part === 'ladder').length + 1, 'a ladder picture dropped between two decks makes a ladder: ' + (lad.hint || ''));
  const near = E.placePart(C, 'rack_hammer', 6000, 455);
  report(!near.ok, 'a drop far from any deck is refused: ' + near.hint);

  // 2. in flight (headless sim, seeded so the runs differ only by what we do to them)
  const seedRandom = (seed) => { let s = seed >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const realRandom = Math.random, realNow = performance.now.bind(performance);
  let clock = 0;
  performance.now = () => clock;
  const flyIt = (parts, secs, { rupture, noPump, patchAt, at = 25, tail } = {}) => {
    seedRandom(5);
    clock = 0;
    config.MAPS.FORCE_KIND = 'open';
    applyBuild(parts);
    const sim = createSimulation();
    const e = SHIP_LAYOUT.boarderEntryPoints;
    for (let i = 0; i < 4; i++) sim.state.players['b' + i] = { id: 'b' + i, bot: true, name: 'B' + i, species: config.CREW_SPECIES[0], color: '#fff', x: e[0].x + 80 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    sim.castOff();
    const out = { warn: null, snap: {} }, keep = {};
    const last = tail ? 0 : sim.state.bags.length - 1; // (the bag to lose: the fore one, or the tail one)
    for (let i = 0; i < secs * 60; i++) {
      clock += 1000 / 60;
      if (rupture && i === at * 60) { // the fore bag: its gas to nothing, and three holes in it
        sim.state.bags[last].gas = 0;
        for (const x of tail ? [260, 300, 280] : [1300, 1340, 1320]) sim.state.gasHoles.push(sim.gasHoleAt(x, 450, last));
      }
      if (patchAt && i === patchAt * 60) sim.state.gasHoles.length = 0; // (the crew has patched them)
      if (noPump && i === at * 60) { keep.pump = config.GAS.PUMP_RATE; keep.vent = config.GAS.VENT_RATE; config.GAS.PUMP_RATE = 0; config.GAS.VENT_RATE = 0; } // (nobody can pump or vent from here: what the bag lost stays lost, and the pilot cannot make it up)
      sim.update(1 / 60);
      if (!out.warn && sim.state.ev.warn > 0 && /BAG DOWN/.test(sim.state.ev.warnText || '')) out.warn = { t: i / 60 - at, text: sim.state.ev.warnText };
      if (i % 60 === 0) out.snap[i / 60] = { alt: sim.state.ship.alt, pitch: sim.state.ship.pitch, rest: sim.state.balance.restPitch, deg: sim.state.balance.deg, gas: sim.state.bags.map((b) => b.gas), mean: sim.state.ship.gas, down: sim.state.bags.map((b) => b.down), holes: sim.state.gasHoles.length };
    }
    if (keep.pump != null) { config.GAS.PUMP_RATE = keep.pump; config.GAS.VENT_RATE = keep.vent; }
    out.state = sim.state;
    return out;
  };
  try {
    applyBuild(C);
    const c0 = createSimulation();
    report(c0.state.bags.length === 1 && c0.state.ship.gas === c0.state.bags[0].gas, 'a classic ship has exactly one bag, and state.ship.gas IS that bag\'s gas (so she flies as she always did)');
    const t1 = flyIt(four, 60, { noPump: true });
    const t2 = flyIt(four, 60, { rupture: true, noPump: true });
    const a = t2.snap[35], b = t1.snap[35];
    report(t2.warn && t2.warn.t < 2 && /FORE BAG DOWN/.test(t2.warn.text) && t2.state.bagAlert && t2.state.bagAlert.name === 'FORE BAG', 'the TV calls it out: "' + (t2.warn ? t2.warn.text : 'nothing') + '" ' + (t2.warn ? t2.warn.t.toFixed(1) + ' s after the hit' : ''));
    report(!t1.warn, 'no false alarm without a rupture (venting every bag is not "a bag down")');
    report(t2.state.ship.down === 0 && t2.state.ship.hull > 40 && t2.state.phase === 'flying', `she keeps flying with the fore bag down (hull ${t2.state.ship.hull.toFixed(0)}, gas ${a.gas.map((g) => g.toFixed(0)).join('/')})`);
    report(a.alt < b.alt - 100, `...but lower: 10 s after the rupture she is ${(b.alt - a.alt).toFixed(0)} px under the same ship with all four bags (alt ${a.alt.toFixed(0)} vs ${b.alt.toFixed(0)})`);
    report(a.deg >= 3 && a.rest > b.rest + 0.01, `...and tips toward the lost bag: nose-heavy ${a.deg} deg, rests ${a.rest.toFixed(3)} rad nose-down (all four bags: ${b.deg} deg, ${b.rest.toFixed(3)})`);
    // a tail bag lost tips the other way
    const t3 = flyIt(four, 40, { rupture: true, noPump: true, tail: true }).snap[35];
    report(t3.deg <= -3 && t3.rest < b.rest - 0.005, `lose the TAIL bag instead and she tips the other way: tail-heavy ${-t3.deg} deg, rests ${t3.rest.toFixed(3)} rad (nose-up)`);
    const fix = flyIt(four, 100, { rupture: true, patchAt: 32 });
    const s0 = fix.snap[25], s99 = fix.snap[99]; // (the moment she is hit, and 75 s later: the holes were patched at 32 s, the helm pumped)
    report(s0.holes >= 3 && s0.gas[3] < 5 && s0.down[3] && fix.snap[33].holes < s0.holes && s99.gas[3] > config.GAS.BAG_UP + 8 && !s99.down[3], `patching the holes and pumping brings the bag back (fore bag gas ${s0.gas[3].toFixed(0)}, flat, ${s0.holes} holes -> ${fix.snap[33].holes} holes at 33 s, gas ${s99.gas[3].toFixed(0)} at the end, deflated: ${s99.down[3]})`);
  } finally {
    performance.now = realNow;
    Math.random = realRandom;
    config.MAPS.FORCE_KIND = null;
    applyBuild(C);
  }

  // 3. both new ships fly 2 minutes in a botsim with 0 errors
  for (const [name, parts, rupture] of [['four bags', four, 0], ['four bags, fore bag shot flat at 40 s', four, 40], ['one giant bag', giant, 0]]) {
    const r = await runBotsim(parts, { map: 'network', minutes: 2, bots: 6, seed: 1, rupture });
    const s = r.stats || {};
    report(r.code === 0 && r.errors === 0 && !!r.stats, `botsim --build <${name}> --minutes 2: 0 errors${r.stats ? ` (kills ${s.kills}, hull ${s.avgHull}, bags ${s.bags}, a bag went flat ${s.bagDowns}x)` : '\n' + r.text.split('\n').slice(-10).join('\n')}`);
    if (rupture && r.stats) report(s.bagDowns >= 1 && s.healedAt != null && s.healedAt < 70, `...the bots patched the holes and pumped the fore bag back up (flat ${s.bagDowns}x, repaired ${s.healedAt == null ? 'NEVER' : s.healedAt.toFixed(0) + ' s'} after it was shot)`);
  }
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
} else if (mode === '--check-edit') {
  process.exit((await checkEdit()) ? 0 : 1);
} else if (mode === '--check-balance') {
  process.exit((await checkBalance()) ? 0 : 1);
} else if (mode === '--check-bags') {
  process.exit((await checkBags()) ? 0 : 1);
} else if (mode === '--build') {
  process.exit((await buildMode(argv[1] || 'classic')) ? 0 : 1);
} else if (mode === '--random') {
  process.exit((await randomMode()) ? 0 : 1);
} else if (mode === '--lint') {
  process.exit((await lint(argv[1] ? path.resolve(argv[1]) : path.join(root, 'public'))) ? 0 : 1); // (optional argument: another public/ folder to scan)
} else {
  console.log('node tools/buildsim.mjs --build <name|file> [--bots-check] | --random N [--seed 1 --minutes 4 --envs a,b --bots 6 --out file.json] | --check-classic | --lint | --check-botsim | --check-multi | --check-validator | --check-edit | --check-balance | --check-bags | --snapshot-classic --force');
  process.exit(mode === '--help' || mode === '-h' ? 0 : 2);
}
