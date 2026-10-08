// Ship-building checks (Phase S). Headless, no browser.
// Usage: node tools/buildsim.mjs --build <classic|multi|file.json|file.mjs> [--bots-check]   the build validator (S.5): PASS/WARN/FAIL report + the LIFT / STEAM / HANDS gauges
//        node tools/buildsim.mjs --random 50 --seed 1 --minutes 4 --envs skyisles,fungal,storm,aether --bots 6   random legal builds, botsim each, table + which parts dominate
//        node tools/buildsim.mjs --check-classic    the classic ship must still equal the frozen snapshot
//        node tools/buildsim.mjs --lint             no module-level captures of derived layout values (they go stale), no hard-coded ship reference points
//        node tools/buildsim.mjs --lint-pose        (also part of --lint) B0: no NEW single-ship spellings (+course.dist, +-state.ship.alt, scrollSpeed, SHIP_LAYOUT imports, module-level per-ship captures) against tools/fixtures/pose-lint-allow.json
//        node tools/buildsim.mjs --check-golden     B0: re-run the golden behaviour baseline (voyagesim, botsim 3x3, cave contacts, capability) against tools/fixtures/golden.json; --snapshot-golden --force re-captures it
//        node tools/buildsim.mjs --check-frames     B0: frame-by-frame old vs new (world x/y, hull, kills; tolerance 1e-6 -> 2% over 3 min) + noise bands; --snapshot-frames --force re-captures
//        node tools/buildsim.mjs --check-pose       B0: pose.js / ships.js / layout-parameter helper unit checks (and B1's --check-layouts)
//        node tools/buildsim.mjs --check-layouts    B1/B.1b: several Layout + Nav instances side by side (classic, a copy, four bags, two boilers, a tiny ship) answer on their own, and three more whole ship contexts (modules, balance, forces, bags, sails, engines, airborne, art bake) run next to a real ship 0; applyBuild/onChange never cross
//        node tools/buildsim.mjs --check-two-ships  B.2: the classic ship and a second build (the four-bag ship, then the minimum two-engine one) in ONE simulation, six bots each assigned by player.ship, 2 minutes, 0 errors; hull / gas / fires / holes / steam / bags / balance never cross between them, each crewman walks HIS ship's nav, the camera frames both (tools/two-ships-check.mjs)
//        node tools/buildsim.mjs --check-botsim     the 9 seeded botsim runs must match tools/fixtures/botsim-baseline.txt
//        node tools/buildsim.mjs --check-multi      S.3: the scratch multi-instance build (2 boilers, 2 lookouts) validates and botsims clean
//        node tools/buildsim.mjs --check-validator   S.5: broken builds must FAIL/WARN with the right message (the classic passes clean)
//        node tools/buildsim.mjs --check-edit        S.5b/S.5c: the blueprint editor (draw a keel deck, extend main, lengthen the bag, cut the top deck, erase; ladders and delete; erase everything and build a ship up from nothing) validates and flies 2 min with 0 errors
//        node tools/buildsim.mjs --check-balance     S.5c: the seesaw in flight (a nose-heavy ship rests nose-down and dives faster, a tail-heavy one is slower; the classic ship is exactly level; live loads move the balance)
//        node tools/buildsim.mjs --check-bags        S.5d: many gasbags (four in a row, one giant) validate; drop-from-the-tray (placePart); rupture the fore bag in flight: she flies lower, tips toward it, the TV calls it out, patching + pumping restores it; both botsim 2 min with 0 errors
//        node tools/buildsim.mjs --check-minimum    S.5e: a ship needs only a gasbag and a deck; the steps up from that (helm, boiler and coal, engines, a sail) validate, fly 2 minutes with 0 errors and each buys her something; a person raises and lowers a sail, a storm gust tears one left up
//        node tools/buildsim.mjs --check-fire       S.5f/S.5g: fire cares where things are (coal is tinder, a fire that reaches it flares into a blaze, the boiler lights fires, the validator warns "coal bunker beside the boiler"), armour plate stops fire and cuts damage; coal beside the boiler burns more over seeded runs
//        node tools/buildsim.mjs --check-arena      V.2: the PvP bridge, two classic ships with bot crews (tools/arena-check.mjs: one sky, cross-fire, rounds, score, wreck and cap endings, no co-op saves) AND co-op botsim still identical
//        node tools/buildsim.mjs --check-engines    S.5h: pointed engines: forward = classic speed, back reduces / reverses, up climbs with no gas, down dives, a nose engine up lifts the nose, a person turns a swivel engine with the stick and the thrust follows, the bots use the swivel (2 min, 0 errors)
//        node tools/buildsim.mjs --check-forces     S.5h: forces at places (forces.js): a nose hit kicks the nose, a tail hit the tail, a tall sail tips her nose down, an engine at the nose pointing up cancels it, gusts rock her and she settles, crew walking to the bow tip her
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
  const dirs = [publicDir, path.join(publicDir, 'modules', 'host'), path.join(publicDir, 'modules', 'host', 'pvp')].filter((d) => fs.existsSync(d));
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
  const poseOk = await lintPose(publicDir);
  return !bad && poseOk;
}

// ---- B0 lint: the multi-ship rules (MOVEMENT.md "Multi-ship architecture rules", public/modules/host/ships.js) -------------------------------------
// Counts, per file, the spellings that tie code to ONE ship at a time, and fails when a count goes UP against tools/fixtures/pose-lint-allow.json (a
// snapshot of today). So the counts can only go down: convert a site to pose.js / a ship handle, then lower the allow-list with
//   node tools/buildsim.mjs --snapshot-pose-lint --force
// Categories: dist  world<->ship conversions through course.dist     alt  ... through the ship's altitude     scroll  scrollSpeed (the strip being pulled past)
//             layoutImport  import { SHIP_LAYOUT / SHIP_BALANCE }     capture  module-level (column 0) value taken from a per-ship helper such as one('helm')
// (comments are ignored; the pose.js / ships.js files are where the conversions are ALLOWED to live, but they are counted too so nothing hides)
const POSE_ALLOW = path.join(root, 'tools', 'fixtures', 'pose-lint-allow.json');
const POSE_RULES = {
  dist: [/[+-]=?\s*(?:\w+\.)*(?:course|c)\.dist\b/, /\b(?:course|c)\.dist\s*[+-]/],
  alt: [/[+-]=?\s*(?:\w+\.)*ship\.alt\b/, /\b(?:\w+\.)*ship\.alt\s*[+-]/, /(?:^|[^\w.])alt\s*[+-]/, /[+-]\s*alt\b/],
  scroll: [/\bscrollSpeed\b/],
  layoutImport: [/^\s*import\s*\{[^}]*\b(?:SHIP_LAYOUT|SHIP_BALANCE)\b[^}]*\}/],
  capture: [/^(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:one|all|hasKind|deckIndex|kindOf|reviveSpot|nearest|isNestDeck|nestTier)\(/],
};
function poseCounts(publicDir) {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['audio', 'fonts'].includes(e.name)) walk(path.join(dir, e.name)); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(publicDir, path.join(dir, e.name)).replace(/\\/g, '/');
      const lines = fs.readFileSync(path.join(dir, e.name), 'utf8').replace(/\r/g, '').split('\n');
      let inBlock = false;
      for (const raw of lines) {
        let line = raw;
        if (inBlock) { if (line.includes('*/')) { inBlock = false; line = line.slice(line.indexOf('*/') + 2); } else continue; }
        if (/^\s*\/\*/.test(line) && !line.includes('*/')) { inBlock = true; continue; }
        line = line.replace(/\/\*.*?\*\//g, '').replace(/(^|\s)\/\/.*$/, '$1');
        for (const [cat, res] of Object.entries(POSE_RULES)) {
          const n = res.reduce((k, re) => k + (re.test(line) ? 1 : 0), 0) > 0 ? 1 : 0; // (a line counts once per category)
          if (n) ((out[cat] ??= {})[rel] ??= 0), out[cat][rel]++;
        }
      }
    }
  };
  walk(publicDir);
  return out;
}
async function lintPose(publicDir) {
  const now = poseCounts(publicDir);
  if (!fs.existsSync(POSE_ALLOW)) { console.log('FAIL lint-pose: ' + path.relative(root, POSE_ALLOW) + ' is missing (node tools/buildsim.mjs --snapshot-pose-lint --force)'); return false; }
  const allow = JSON.parse(fs.readFileSync(POSE_ALLOW, 'utf8'));
  let bad = 0, spare = 0;
  const totals = {};
  for (const cat of Object.keys(POSE_RULES)) {
    const files = new Set([...Object.keys(now[cat] || {}), ...Object.keys((allow[cat]) || {})]);
    for (const file of [...files].sort()) {
      const n = (now[cat] && now[cat][file]) || 0, a = (allow[cat] && allow[cat][file]) || 0;
      totals[cat] = (totals[cat] || 0) + n;
      if (n > a) { bad++; console.log(`FAIL lint-pose ${cat}: ${file} has ${n}, allowed ${a} (new code: use pose.js toWorld/toShip, a ship handle from ships.js, no module-level captures; see MOVEMENT.md)`); }
      else if (n < a) spare += a - n;
    }
  }
  const summary = Object.entries(totals).map(([k, v]) => k + ' ' + v).join(', ');
  console.log(bad ? `FAIL lint-pose: ${bad} file(s) over the allow-list` : `PASS lint-pose: no new single-ship spellings (now: ${summary}${spare ? `; ${spare} below the allow-list, lower it with --snapshot-pose-lint --force` : ''})`);
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
    ['one boarding point', without((p) => p.part === 'boarderEntry' && p.x === 290), 'WARN', /boarding points/],
    ['no medbay', without((p) => p.part === 'medbay'), 'WARN', /No medbay/],
    ['no coal bunker', without((p) => p.n === 'Coal Bunker'), 'WARN', /No coal bunker/],
    ['no bomb bay: she flies without one', without((p) => p.n === 'Bomb Bay' || p.part === 'bombBay'), 'OK', /./],
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
    const list = want === 'FAIL' ? v.fails : want === 'OK' ? ['ok'] : v.warns;
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
  const { config } = await load('config.js');
  const drawBagOnly = () => E.drawBag(E.drawDeck(E.emptyBuild(), 'main', 140, 860).parts, -30, 1030).parts; // (a main deck and a bag, no crow's nest)
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
  const nc = E.erase(C, 'nest', 850, 880);
  const nests = nc.parts.filter((p) => p.part === 'deck' && p.row === 'nest');
  const vnc = validate(nc.parts);
  report(nc.ok && nests.length === 2 && nests.every((d) => nc.parts.some((p) => p.part === 'rope' && (p.top === d.id || p.bottom === d.id))) && nc.parts.some((p) => p.part === 'station' && p.n === 'Lookout' && p.p === nests[0].id) && nc.parts.some((p) => p.part === 'gun' && p.n === 'Dorsal Gun' && p.p === nests[1].id) && vnc.ok, "the crow's nest cut in the middle: two nests " + nests.map((d) => d.id + ' ' + d.x0 + '-' + d.x1).join(', ') + ', each with its rope and stations, and it validates' + (vnc.ok ? '' : ': ' + vnc.fails.join('; ')));
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
  report(boiler.ok && boiler.removed.includes('Boiler') && vb.ok && vb.warns.some((t) => /No boiler/.test(t)), 'erasing the boiler room is allowed; she still flies, with a strong WARN: ' + (vb.warns.find((t) => /No boiler/.test(t)) || '?').slice(0, 60));
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
  report(rb.ok && validate(rb.parts).ok && validate(rb.parts).advice.some((a) => a.key === 'boiler'), 'deleting the boiler is allowed; she still flies, and the validator advises a boiler');
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
  report(none.every((p) => p.part === 'frame') && !vn.ok && vn.needs.includes('a deck to stand on') && vn.needs.includes('a gasbag') && vn.needs.length === 2, 'erasing everything leaves just the frame; the validator lists the only two needs: ' + vn.needs.join(', '));
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
  report(!validate(half).ok && S.slotsFor('boiler', half).length > 3 && S.slotsFor('helm', half).length > 3 && S.slotsFor('engine', half).length > 0, 'an incomplete ship takes parts: boiler, helm and engine slots on the main deck exist although the ship cannot fly yet');
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

  // 10. S.5e: the crow's nest in two heights. A high tier is drawn on a mast above the nest: a rope up from the nest, a longer view for whoever stands there, weight and a bigger
  // target up high. It must stand over a nest, and a nest on the bag.
  const hi = E.drawDeck(C, 'crow2', 700, 940);
  const crow = hi.ok && deck(hi.parts, 'crow2');
  const vh = validate(hi.parts);
  report(hi.ok && hi.kind === 'new' && !!crow && crow.y === undefined && hi.parts.some((p) => p.part === 'rope' && p.top === 'crow2' && p.bottom === 'nest') && vh.ok, 'drawDeck(crow2, 700, 940): a high nest with a rope down to the nest, and it validates' + (vh.ok ? '' : ': ' + vh.fails.join('; ')));
  const Lh = buildLayout(hi.parts);
  report(Lh.platforms.find((q) => q.id === 'crow2').y === DECK_ROWS.crow2 && Lh.bounds.y0 < buildLayout(C).bounds.y0 - 100 && Lh.hitRects.length > buildLayout(C).hitRects.length, 'the ship grows upward: taller bounds and a bigger target (hit box) for the high nest');
  report(budgets(hi.parts).mass > budgets(C).mass + config.BALANCE.MASS.mast, 'the high nest is weight up high (mast ' + config.BALANCE.MASS.mast + ' + deck): ' + budgets(C).mass.toFixed(1) + ' -> ' + budgets(hi.parts).mass.toFixed(1));
  report(!E.drawDeck(E.emptyBuild(), 'crow2', 200, 500).ok && !E.drawDeck(drawBagOnly(), 'crow2', 200, 500).ok && /nest/.test(E.drawDeck(drawBagOnly(), 'crow2', 200, 500).hint), "a high nest needs a crow's nest below it: refused without one: " + E.drawDeck(drawBagOnly(), 'crow2', 200, 500).hint.slice(0, 60));
  report(!E.drawDeck(C, 'crow2', 100, 400).ok, "a high nest cannot be drawn off the crow's nest (over open sky): refused");
  const up = E.placePart(hi.parts, 'gun', 800, DECK_ROWS.crow2 - 14);
  const vu = validate(up.parts);
  report(up.ok && up.parts.some((p) => p.part === 'gun' && p.p === 'crow2') && vu.ok, 'a gun and a lamp can be dropped on the high nest' + (up.ok ? '' : ': ' + up.hint));
  const hi2 = E.drawDeck(C, 'crow2', 620, 980);
  const cut2 = E.erase(hi2.parts, 'crow2', 790, 830);
  const pieces2 = cut2.parts.filter((p) => p.part === 'deck' && p.row === 'crow2');
  report(cut2.ok && pieces2.length === 2 && pieces2.every((d) => cut2.parts.some((p) => p.part === 'rope' && (p.top === d.id || p.bottom === d.id))) && validate(cut2.parts).ok, 'the high nest can be cut in two as well, each piece with its own rope: still valid' + (cut2.ok ? '' : ': ' + cut2.hint));
  report(E.erase(up.parts, 'nest', 600, 1000).ok && !validate(E.erase(up.parts, 'nest', 600, 1000).parts).ok, 'rubbing out the nest under a high nest leaves it hanging: the validator FAILs (no way up)');
  {
    const f2 = path.join(os.tmpdir(), `airship-crow-${process.pid}.json`);
    fs.writeFileSync(f2, JSON.stringify(up.parts));
    const o2 = spawnSync(process.execPath, ['tools/botsim.mjs', '--build', f2, '--minutes', '2', '--seed', '1', '--map', 'open'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    try { fs.unlinkSync(f2); } catch { /* gone */ }
    const t2 = (o2.stdout || '') + (o2.stderr || '');
    report(o2.status === 0 && /^errors: 0$/m.test(t2), 'botsim --build <ship with a high nest and a gun on it> --minutes 2: 0 errors' + (o2.status === 0 ? '' : '\n' + t2.split('\n').slice(-12).join('\n')));
  }

  // 11. S.5g: OUTDOOR / COVERED decks and ARMOUR plate. The pencil's toggle (drawDeck's 5th argument), turning a deck over, what follows the flag (the guns' mounts, the rooms, the mass, the
  // boarding points, the validator, weather, raiders landing, crew thrown overboard), and riveted plate (addArmour: snaps, merges, weighs, is cut by the eraser and removed by Delete).
  {
    globalThis.window ??= globalThis;
    const store = new Map();
    globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
    const { applyBuild, SHIP_LAYOUT, outdoorDecks } = await load('shipLayout.js');
    const { createSimulation } = await load('modules/host/simulation.js');
    const sameAsBefore = JSON.stringify(E.drawDeck(C, 'keel', 20, 350).parts.filter((p) => p.part === 'deck'));
    report(!/"outside"/.test(JSON.stringify(deck(E.drawDeck(C, 'keel', 20, 350).parts, 'keel'))) && !/"outside"/.test(JSON.stringify(deck(E.drawDeck(C, 'main', 1470, 1590).parts, 'main'))) && sameAsBefore.includes('keel'), 'drawing without the toggle leaves the parts exactly as before: a new keel deck or a longer main deck carries no outdoor / covered field (the classic ship is unchanged)');
    report(!E.drawDeck(C, 'catwalk', 400, 800).ok && /already the Top Deck/.test(E.drawDeck(C, 'catwalk', 400, 800).hint) && !E.drawDeck(C, 'catwalk', 400, 800, { covered: false }).ok, 'drawing along the top deck with its own kind (outdoor) changes nothing: refused with a hint');
    // a new OUTDOOR deck in a hull row: open air, no rooms; and a new COVERED top deck
    const keelOut = E.drawDeck(C, 'keel', 20, 350, { covered: false });
    const kd = deck(keelOut.parts, 'keel');
    report(keelOut.ok && keelOut.kind === 'new' && kd.outside === true && !keelOut.parts.some((p) => p.part === 'room' && p.p === 'keel') && /outdoor/.test(keelOut.hint) && validate(keelOut.parts).ok, 'drawDeck(keel, covered: false): a new OUTDOOR keel deck with no rooms, ' + keelOut.hint);
    const Lk = buildLayout(keelOut.parts);
    report(Lk.platforms.find((q) => q.id === 'keel').outside === true && hullGeom(Lk.platforms, Lk.rooms).boxes.length === 0 && Lk.hitRects.length > buildLayout(C).hitRects.length && Lk.samples.length > buildLayout(C).samples.length, 'the hull follows the flag: no hull box round an open keel deck, but it is a target of its own and has collision samples');
    // turning decks over
    const lowOut = E.drawDeck(C, 'lower', 100, 1500, { covered: false });
    const Lo = buildLayout(lowOut.parts);
    const vOut = validate(lowOut.parts);
    report(lowOut.ok && lowOut.kind === 'convert' && Lo.platforms.find((q) => q.id === 'lower').outside === true && !lowOut.parts.some((p) => p.part === 'room' && p.p === 'lower' && !p.outside) && vOut.ok && validate(C).budgets.lift.mass > vOut.budgets.lift.mass, `the Lower Deck turned OUTDOOR: its rooms go, the deck is lighter (${validate(C).budgets.lift.mass.toFixed(1)} -> ${vOut.budgets.lift.mass.toFixed(1)}), it validates${vOut.ok ? '' : ': ' + vOut.fails.join('; ')}`);
    const catIn = E.drawDeck(C, 'catwalk', 400, 800, { covered: true });
    const vIn = validate(catIn.parts);
    const gunsIn = catIn.parts.filter((p) => p.part === 'gun' && p.p === 'catwalk');
    report(catIn.ok && catIn.kind === 'convert' && deck(catIn.parts, 'catwalk').outside === false && catIn.parts.some((p) => p.part === 'room' && p.p === 'catwalk') && gunsIn.length === 2 && gunsIn.every((g) => g.arc <= 0.7) && vIn.ok && vIn.warns.some((t) => /boarding point on the Top Deck, a covered deck/.test(t)) && vIn.budgets.lift.mass > validate(C).budgets.lift.mass, `the Top Deck turned COVERED: rooms inside, its ${gunsIn.length} guns become ports (arc ${gunsIn.map((g) => g.arc).join(', ')}), it weighs more, and the validator warns about the boarding points under the roof${vIn.ok ? '' : ': ' + vIn.fails.join('; ')}`);
    const back = E.drawDeck(catIn.parts, 'catwalk', 400, 800, { covered: false });
    report(back.ok && deck(back.parts, 'catwalk').outside === true && !back.parts.some((p) => p.part === 'room' && p.p === 'catwalk') && back.parts.filter((p) => p.part === 'gun' && p.p === 'catwalk').every((g) => g.arc > 1), 'and back to OUTDOOR: rooms gone, the guns wide again (the toggle is its own undo)');
    report(!E.drawDeck(C, 'nest', 700, 900, { covered: true }).ok, "a crow's nest is always open air: the toggle does nothing to it");
    // what the editor lets stand where
    report(S.slotsFor('boarding', C).every((s) => s.p === 'catwalk') && !S.slotsFor('boarding', catIn.parts).some((s) => s.p === 'catwalk') && /needs the open air/.test(S.whyNot(catIn.parts, 'sail', 600, 470)), 'a mast, a lamp or a boarding point needs the open air: no slots on a covered top deck (' + S.whyNot(catIn.parts, 'sail', 600, 470).slice(0, 70) + '...)');
    const boardLow = S.slotsFor('boarding', lowOut.parts).filter((s) => s.p === 'lower');
    report(boardLow.length > 3 && S.slotsFor('boarding', C).every((s) => s.p !== 'lower'), `an outdoor lower deck takes boarding points (${boardLow.length} spots); a covered one does not`);
    const mainOut = E.drawDeck(C, 'main', 200, 1400, { covered: false });
    const gunLow = S.slotsFor('gun', C).filter((s) => s.p === 'lower'), gunMainOut = S.slotsFor('gun', mainOut.parts).filter((s) => s.p === 'main');
    report(gunLow.length > 3 && gunLow.every((s) => s.apply(C).find((p) => p.part === 'gun' && p.p === 'lower' && p.n === 'Extra Gun 1').arc <= 0.7) && S.slotsFor('gun', C).every((s) => s.p !== 'main') && gunMainOut.length > 3 && gunMainOut.every((s) => s.apply(mainOut.parts).find((p) => p.n === 'Extra Gun 1').arc > 1), 'a gun on a covered deck is a port or sponson with a narrow arc (the lower deck); the covered main deck takes none; turned outdoor it takes guns on rail posts with a wide arc');
    // a raider lands on an outdoor lower deck, and crew are thrown off outdoor decks only
    const entryLow = lowOut.parts.filter((p) => p.part !== 'boarderEntry').concat([{ part: 'boarderEntry', p: 'lower', x: 1520 }, { part: 'boarderEntry', p: 'lower', x: 60 }]);
    const calmCfg = JSON.stringify([config.PACING, config.SPECIALS.FIRST_AFTER, config.MAPS.FORCE_KIND, config.ENVIRONMENTS.FORCE]);
    const calm = () => { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.MAPS.FORCE_KIND = 'open'; config.ENVIRONMENTS.FORCE = 'skyisles'; };
    const uncalm = () => { const [p, fa, m, e] = JSON.parse(calmCfg); Object.assign(config.PACING, p); config.SPECIALS.FIRST_AFTER = fa; config.MAPS.FORCE_KIND = m; config.ENVIRONMENTS.FORCE = e; };
    const boot = (parts) => { applyBuild(parts); calm(); const sim = createSimulation(); sim.castOff(); return sim; };
    {
      const vEntry = validate(entryLow);
      report(vEntry.ok && !vEntry.warns.some((t) => /boarding point.*covered/.test(t)) && buildLayout(entryLow).boarderEntryPoints.every((e) => e.p === 'lower'), 'boarding points on the outdoor lower deck validate with no covered-deck warning');
      const sim = boot(entryLow);
      const lowD = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'lower');
      const g = config.RAIDERS.grunt;
      const landed = [1520, 60].map((x) => { const b = { id: 'rt' + x, type: 'grunt', name: g.name, species: g.species, color: g.color, scale: g.scale, x, y: -60, fall: true, hp: g.hp, hit: 0, cd: 0, windup: 0, face: 1 }; sim.state.boarders.push(b); return b; });
      for (let i = 0; i < 8 * 60; i++) sim.update(1 / 60);
      report(landed.every((b) => !b.fall && b.d === lowD), `raiders dropped over the outdoor lower deck's boarding points land on it (${landed.map((b) => 'x ' + b.x + ' on deck ' + SHIP_LAYOUT.platforms[b.d].id).join(', ')})`);
      // thrown overboard
      const thrown = (parts) => {
        const sm = boot(parts);
        const lowIdx = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'lower'), y = SHIP_LAYOUT.platforms[lowIdx].y;
        const p = { id: 'h', name: 'Human', species: config.CREW_SPECIES[0], color: '#fff', x: 700, y, d: lowIdx, jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0 };
        sm.state.players.h = p;
        let n = 0;
        for (let i = 0; i < 250; i++) { Object.assign(p, { x: 700, y, d: lowIdx, fly: false, air: false, vx: 0, stag: 0, lock: null, conn: null }); sm.impact(700, y - 30, 3); if (p.fly) n++; }
        return n;
      };
      const realRandom = Math.random;
      Math.random = ((s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(5);
      const outN = thrown(lowOut.parts), inN = thrown(C);
      report(outN >= 15 && inN === 0, `big hits throw crew off an OUTDOOR deck (${outN} of 250 hits knock the man on the lower deck overboard) and never off a covered one (${inN})`);
      // weather follows the flag: ice settles on the open lower deck only, never on the covered top deck's guns
      const mixed = E.drawDeck(lowOut.parts, 'catwalk', 400, 800, { covered: true }).parts;
      applyBuild(mixed);
      const open = outdoorDecks();
      const lowIdx2 = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'lower');
      const deckCrusts = [], gunCrusts = [];
      for (let k = 1; k <= 5; k++) { // (a few seeded frost runs: where the ice settles is chance)
        calm();
        config.ENVIRONMENTS.FORCE = 'frost';
        const sf = createSimulation();
        sf.castOff();
        for (let i = 0; i < 120 * 60; i++) sf.update(1 / 60);
        deckCrusts.push(...sf.state.icing.filter((c) => c.area === 'topdeck'));
        gunCrusts.push(...sf.state.icing.filter((c) => c.area === 'gun'));
      }
      report(open.length === 1 && open[0] === lowIdx2 && deckCrusts.length > 0 && deckCrusts.every((c) => c.d === lowIdx2) && gunCrusts.length > 0 && gunCrusts.every((c) => !/Tail Gun|Nose Gun/.test(c.gun)), `weather follows the flag (lower deck outdoor, top deck covered): outdoorDecks() = ${open.map((d) => SHIP_LAYOUT.platforms[d].id).join()}, ${deckCrusts.length} frost crusts on decks, all on it; ${gunCrusts.length} on guns (${[...new Set(gunCrusts.map((c) => c.gun))].join(', ')}), none on the covered top deck's Tail Gun or Nose Gun`);
      Math.random = realRandom;
      uncalm();
      applyBuild(C);
    }
    // ARMOUR plate
    const ar = E.addArmour(C, 'main', 150, 500);
    const plate = ar.ok && ar.parts.find((p) => p.part === 'armour');
    report(ar.ok && ar.kind === 'armour' && plate.p === 'main' && plate.x0 === 140 && plate.x1 === 500 && JSON.stringify(C) === frozen && validate(ar.parts).ok, `addArmour(main, 150, 500): a stretch of plate, its end snapped to the deck's end (${plate && plate.x0}-${plate && plate.x1}), the input untouched, and it validates`);
    const ar2 = E.addArmour(ar.parts, 'main', 400, 700);
    report(ar2.ok && ar2.parts.filter((p) => p.part === 'armour').length === 1 && ar2.parts.find((p) => p.part === 'armour').x1 === 700 && !E.addArmour(ar2.parts, 'main', 200, 600).ok, 'plate drawn over plate joins into one stretch (140-700); drawing on an already plated stretch is refused: ' + E.addArmour(ar2.parts, 'main', 200, 600).hint);
    report(!E.addArmour(C, 'nest', 600, 900).ok && !E.addArmour(C, 'main', 1200, 1250).ok, 'plate goes on a deck row only (not the crow\'s nest), and not in a stretch shorter than ' + config.ARMOUR.MIN_LEN + ' px');
    const Lp = buildLayout(ar2.parts);
    report(Lp.armour.length === 1 && Lp.armour[0].d === Lp.platforms.findIndex((q) => q.id === 'main') && !('armour' in buildLayout(C)), 'layout.armour lists the plate with its deck index (and the classic layout has no such field)');
    const dm = validate(ar2.parts).budgets.lift.mass - validate(C).budgets.lift.mass;
    report(dm > 15 && Math.abs(dm - (560 / 100) * config.BALANCE.MASS.armour) < 0.6, `plate is very heavy: 560 px of it adds ${dm.toFixed(1)} (about ${(dm / config.BALANCE.MASS.kind.boiler).toFixed(1)} boilers)`);
    const cutA = E.erase(ar2.parts, 'main', 300, 420);
    const plates = cutA.parts.filter((p) => p.part === 'armour');
    report(cutA.ok && plates.length === 2 && plates[0].x1 === 300 && plates[1].x0 === 420 && plates.every((a) => cutA.parts.some((d) => d.part === 'deck' && d.id === a.p && a.x0 >= d.x0 && a.x1 <= d.x1)), 'the eraser cuts plate with the deck (two stretches left, each on its own piece of deck)');
    const goneA = E.erase(ar2.parts, 'main', 100, 800);
    report(goneA.ok && !goneA.parts.some((p) => p.part === 'armour') && goneA.removed.includes('armour plate'), 'rubbing out the whole deck takes the plate with it: removed ' + E.summarize(goneA.removed));
    const mainY = DECK_ROWS.main;
    const th = E.thingAt(ar2.parts, 320, mainY + 30), thStation = E.thingAt(ar2.parts, 400, mainY - 11);
    const delA = E.removeAt(ar2.parts, 320, mainY + 30);
    report(th && th.label === 'armour plate' && thStation && thStation.label === 'Boiler' && delA.ok && !delA.parts.some((p) => p.part === 'armour') && delA.removed.join() === 'armour plate', 'the Delete tool finds a stretch of plate anywhere along it (but a station standing on it wins) and removes the whole stretch');
    const dropA = E.placePart(C, 'armour', 700, mainY);
    report(dropA.ok && dropA.parts.some((p) => p.part === 'armour' && p.p === 'main') && /Armour plate on the Main Deck/.test(dropA.hint), 'dropping the Armour picture from the tray on the main deck plates the stretch (' + dropA.hint + ')');
    // mixed builds fly: armour on the main deck and top deck rail, the lower deck turned outdoor; and a covered top deck with plate on the lower deck
    const biggerBag = (parts, n) => { for (let i = 0; i < n; i++) parts = E.setBag(parts, { grow: 1 }).parts; return parts; }; // (plate is heavy: a longer bag carries it)
    const mixA = biggerBag(E.addArmour(E.addArmour(lowOut.parts, 'main', 240, 620).parts, 'catwalk', 240, 600).parts, 4);
    const mixB = biggerBag(E.addArmour(E.drawDeck(C, 'catwalk', 400, 800, { covered: true }).parts, 'lower', 20, 400).parts, 2);
    for (const [name, parts, map] of [['mixed A (armour on main and top deck, lower deck outdoor)', mixA, 'network'], ['mixed B (covered top deck, plate on the lower deck)', mixB, 'open']]) {
      const v = validate(parts);
      const fileX = path.join(os.tmpdir(), `airship-mix-${process.pid}.json`);
      fs.writeFileSync(fileX, JSON.stringify(parts));
      const ox = spawnSync(process.execPath, ['tools/botsim.mjs', '--build', fileX, '--minutes', '2', '--seed', '1', '--map', map], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
      try { fs.unlinkSync(fileX); } catch { /* gone */ }
      const tx = (ox.stdout || '') + (ox.stderr || '');
      const sx = (tx.match(/^BUILD_STATS (.*)$/m) || [])[1];
      report(v.ok && ox.status === 0 && /^errors: 0$/m.test(tx) && !!sx, `${name}: validates, botsim 2 min on the ${map} map: 0 errors` + (v.ok ? '' : ' [' + v.fails.join('; ') + ']') + (ox.status === 0 ? '' : '\n' + tx.split('\n').slice(-12).join('\n')));
    }
  }
  return ok;
}

// S.5f: fire that cares where things are, and S.5g's armour plate. (1) the model: flammability of coal, wood, iron and plate; the fire cap scales with ship size; the validator's
// "coal bunker beside the boiler" WARN and fire-risk score. (2) in a calm headless sim: a fire that reaches the coal flares into a blaze with the TV call-out, one beside the coal
// finds it by itself, the boiler lights fires (blowout, overheating), the fire cap holds, the bots run to a coal fire first. (3) armour plate stops a fire spreading onto it and
// cuts the damage and the breaches a hit does. (4) over seeded runs (botsim, the boiler over-pressured every 15 s) a ship with the coal bunker beside the boiler burns far more than the classic
// one, whose bunker is a deck below.
async function checkFire() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { config } = await load('config.js');
  const { BUILDS, buildLayout } = await load('modules/host/shipBuild.js');
  const { validate } = await load('modules/host/buildCheck.js');
  const FM = await load('modules/host/fireModel.js');
  const E = await load('modules/host/buildEdit.js');
  const { applyBuild, SHIP_LAYOUT } = await load('shipLayout.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const C = BUILDS.classic;
  const near = await loadBuild('coalnear', BUILDS);
  const realRandom = Math.random;
  const seed = (s) => { s >>>= 0; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const F = config.FIRE;

  // 1. the model
  const LC = buildLayout(C), LN = buildLayout(near);
  const di = (L, id) => L.platforms.findIndex((q) => q.id === id);
  const coalX = LC.stations.find((s) => s.kind === 'coal').x, boilerX = LC.stations.find((s) => s.kind === 'boiler').x;
  const f = (L, id, x) => FM.flamAt(L, di(L, id), x);
  report(f(LC, 'lower', coalX) === F.FLAMMABILITY.kind.coal.f && f(LC, 'main', 1000) === F.FLAMMABILITY.deck && f(LC, 'main', boilerX) === F.FLAMMABILITY.kind.boiler.f && f(LC, 'catwalk', 500) === F.FLAMMABILITY.outdoor && f(LC, 'bay', 520) === F.FLAMMABILITY.kind.bombBay.f, `flammability: coal ${f(LC, 'lower', coalX)}, a covered wooden deck ${f(LC, 'main', 1000)}, the open top deck ${f(LC, 'catwalk', 500)}, the bomb bay ${f(LC, 'bay', 520)}, beside the boiler (iron) ${f(LC, 'main', boilerX)}`);
  const plated = [...C, { part: 'armour', p: 'main', x0: 200, x1: 700 }];
  report(f(buildLayout(plated), 'main', 400) === 0 && f(buildLayout(plated), 'main', 1000) === F.FLAMMABILITY.deck, 'armour plate does not burn (flammability 0 under it, the rest of the deck unchanged)');
  const minimal = E.drawBag(E.drawDeck(E.emptyBuild(), 'main', 140, 860).parts, -30, 1030).parts;
  const bigger = E.drawDeck(C, 'main', 1470, 1470 + 8 * 120).parts;
  report(FM.fireCap(LC) === F.CAP_BASE && FM.fireCap(buildLayout(minimal)) < F.CAP_BASE && FM.fireCap(buildLayout(bigger)) > F.CAP_BASE, `the fire cap scales with ship size: classic ${FM.fireCap(LC)}, one small deck ${FM.fireCap(buildLayout(minimal))}, classic + 8 columns of main deck ${FM.fireCap(buildLayout(bigger))}`);
  const vc = validate(C), vn = validate(near);
  report(vc.ok && !vc.warns.some((t) => /coal bunker beside the boiler/.test(t)) && vc.checks.some((c) => c.group === 'Fire' && c.level === 'INFO' && /fire risk [\d.]+\/10/.test(c.text)), 'the classic ship (bunker a deck below the boiler, ' + vc.budgets.fire.coalBoiler + ' px of fire path) has no fire WARN, only an INFO fire-risk score: ' + (vc.checks.find((c) => c.group === 'Fire') || { text: 'MISSING' }).text.slice(0, 70));
  report(vn.ok && vn.warns.some((t) => /coal bunker beside the boiler: fire risk/.test(t)) && vn.budgets.fire.score > vc.budgets.fire.score, `coal beside the boiler: WARN "coal bunker beside the boiler: fire risk" and a higher score (${vn.budgets.fire.score} against ${vc.budgets.fire.score})`);
  const moreExt = validate([...near, { part: 'extinguisher', p: 'main', x: 440 }, { part: 'extinguisher', p: 'main', x: 480 }]);
  report(moreExt.budgets.fire.score < vn.budgets.fire.score, `extinguishers by the coal take the risk down (${vn.budgets.fire.score} -> ${moreExt.budgets.fire.score})`);
  report(FM.fireDistance(LC, { d: di(LC, 'main'), x: boilerX }, { d: di(LC, 'lower'), x: coalX }) > config.BUILD_CHECK.FIRE_NEAR && FM.fireDistance(LN, { d: di(LN, 'main'), x: boilerX }, { d: di(LN, 'main'), x: 460 }) < config.BUILD_CHECK.FIRE_NEAR, 'fire path distance: along a deck it is the distance, through a ladder it costs 150 more (classic boiler to coal ' + FM.fireDistance(LC, { d: di(LC, 'main'), x: boilerX }, { d: di(LC, 'lower'), x: coalX }) + ' px)');

  // 2. a calm headless sim (nobody shoots, no enemies): fires are only the ones we light
  const calm = () => { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.MAPS.FORCE_KIND = 'open'; config.ENVIRONMENTS.FORCE = 'skyisles'; };
  const keep = JSON.stringify([config.PACING, config.SPECIALS.FIRST_AFTER, config.MAPS.FORCE_KIND, config.ENVIRONMENTS.FORCE]);
  const restore = () => { const [p, fa, m, e] = JSON.parse(keep); Object.assign(config.PACING, p); config.SPECIALS.FIRST_AFTER = fa; config.MAPS.FORCE_KIND = m; config.ENVIRONMENTS.FORCE = e; };
  const boot = (parts) => { applyBuild(parts); calm(); const sim = createSimulation(); sim.castOff(); return sim; };
  const run = (sim, secs) => { for (let i = 0; i < secs * 60; i++) sim.update(1 / 60); };
  const clearFires = (sim) => { sim.state.fires.length = 0; sim.state.blaze = null; sim.state.blazeCd = 0; };
  seed(11);
  {
    const sim = boot(C);
    const S = sim.state, lowD = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'lower'), mainD = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'main');
    const fire = sim.fire.ignite(lowD, coalX, 'hit');
    report(!!fire && fire.big && !!S.blaze && S.fireStats.blazes === 1 && S.fires.length === 1 + F.BLAZE.FIRES && S.fires.every((q) => q.big) && S.ev.warnText === F.BLAZE.CALL, `a fire that reaches the coal flares into a blaze: ${S.fires.length} big fires at once and the TV says "${S.ev.warnText}"`);
    const t0 = S.fires.length;
    run(sim, 20);
    report(S.fires.length > t0 || S.fires.length === FM.fireCap(SHIP_LAYOUT) + F.BLAZE.EXTRA_CAP || S.fires.length >= t0, `an unattended blaze keeps spreading (${t0} -> ${S.fires.length} fires after 20 s; the cap with a blaze is ${FM.fireCap(SHIP_LAYOUT) + F.BLAZE.EXTRA_CAP})`);
    report(S.fires.length <= FM.fireCap(SHIP_LAYOUT) + F.BLAZE.EXTRA_CAP, 'the fire count never passes the cap (+ the blaze allowance)');
    // hull loss is faster in a blaze than from the same number of ordinary fires
    clearFires(sim);
    S.ship.hull = 100; S.fires.push(...Array.from({ length: 4 }, (_, i) => ({ x: 300 + i * 40, d: mainD, t: -999, prog: 0 }))); run(sim, 10); const plain = 100 - S.ship.hull;
    clearFires(sim);
    S.ship.hull = 100; S.fires.push(...Array.from({ length: 4 }, (_, i) => ({ x: 300 + i * 40, d: mainD, t: -999, prog: 0, big: true }))); S.blaze = { d: mainD, x: 300 }; run(sim, 10); const big = 100 - S.ship.hull;
    report(big > plain * 1.2, `four big fires eat the hull faster than four plain ones (${big.toFixed(1)} against ${plain.toFixed(1)} in 10 s)`);
    clearFires(sim);
    // a fire beside the coal finds it by itself
    const trial = (build, id, x) => { let n = 0; for (let k = 0; k < 12; k++) { seed(100 + k); const sm = boot(build); const d = SHIP_LAYOUT.platforms.findIndex((q) => q.id === id); sm.fire.ignite(d, x, 'hit'); run(sm, 60); if (sm.state.fireStats.blazes > 0) n++; } return n; };
    const toCoal = trial(C, 'lower', coalX - 200), toFar = trial(C, 'main', 1200);
    report(toCoal >= 9 && toFar <= 3, `a fire 200 px from the coal spreads towards it and flares it (${toCoal} of 12 runs in 60 s); a fire far away on another deck rarely does (${toFar} of 12)`);
    // the boiler is where fires start
    let blow = 0;
    for (let k = 0; k < 20; k++) { seed(300 + k); const sm = boot(C); sm.state.ship.press = 100; run(sm, 1); if (sm.state.fireStats.boiler > 0) blow++; }
    report(blow >= 8 && blow < 20, `a boiler blowout lights a fire beside the boiler (${blow} of 20 blowouts, the chance is ${F.BOILER_BLOWOUT_FIRES})`);
    let hot = 0;
    for (let k = 0; k < 8; k++) { seed(400 + k); const sm = boot(C); for (let i = 0; i < 40 * 60; i++) { sm.state.ship.press = Math.max(sm.state.ship.press, 96); sm.update(1 / 60); if (sm.state.fireStats.boiler > 0) { hot++; break; } } }
    report(hot >= 3, `an over-pressured boiler throws sparks that light fires (${hot} of 8 runs of 40 s at pressure 96+)`);
    // cap
    clearFires(sim);
    for (let i = 0; i < 40; i++) sim.fire.ignite(mainD, 200 + i * 20, 'hit');
    report(S.fires.length === FM.fireCap(SHIP_LAYOUT), `ignite() stops at the cap (${S.fires.length} of ${FM.fireCap(SHIP_LAYOUT)})`);
    clearFires(sim);
  }
  // the bots run to a coal fire first
  {
    seed(21);
    const sim = boot(C);
    const S = sim.state, e = SHIP_LAYOUT.boarderEntryPoints;
    for (let i = 0; i < 6; i++) S.players['b' + i] = { id: 'b' + i, bot: true, name: 'Bot' + i, species: config.CREW_SPECIES[0], color: '#fff', x: e[0].x + i * 60, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    run(sim, 12);
    const lowD = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'lower'), mainD = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'main');
    const ordinary = { x: 1200, d: mainD, t: -999, prog: 0 };
    S.fires.push(ordinary);
    const coal = sim.fire.ignite(lowD, coalX, 'hit');
    run(sim, 8);
    const bots = Object.values(S.players).filter((q) => q.bot);
    const onCoal = bots.filter((q) => q.botJob && q.botJob.kind === 'fire' && S.fires.includes(q.botJob.obj) && q.botJob.obj.big).length;
    report(!!coal && onCoal >= 2, `six bots run to the fires in the coal first (${onCoal} are on them 8 s after it flares; the ordinary fire on the main deck waits)`);
  }
  // 3. armour plate: a fire cannot spread onto it, and a hit on it does far less
  {
    const bare = C, shielded = [...C, { part: 'armour', p: 'main', x0: 480, x1: 700 }, { part: 'armour', p: 'main', x0: 140, x1: 360 }];
    const spread = (build, secs) => { seed(55); const sm = boot(build); const d = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'main'); const o = sm.fire.ignite(d, 420, 'hit'); for (let i = 0; i < secs * 60; i++) { sm.state.ship.press = 50; sm.update(1 / 60); } return { n: sm.state.fires.filter((q) => q.d === d).length, all: sm.state.fires.length, o }; }; // (the steam is held low so no over-pressure sparks light other fires)
    const a = spread(bare, 30), b = spread(shielded, 30);
    report(a.n > 1 && b.n === 1, `a fire at the boiler spreads along the deck (${a.n} fires on the main deck after 30 s) but not onto armour plate either side of it (${b.n} fire there; ladders can still carry it up: ${b.all} in all)`);
    const pound = (build, x) => {
      seed(77);
      const sm = boot(build);
      const S = sm.state;
      let lost = 0, holes = 0, fires = 0;
      for (let i = 0; i < 300; i++) {
        S.ship.hull = 100; S.breaches.length = 0; S.fires.length = 0; S.ship.down = 0;
        sm.impact(x, 620, 1);
        lost += 100 - S.ship.hull; holes += S.breaches.length; fires += S.fires.length;
      }
      return { lost, holes, fires, plated: S.fireStats.plated };
    };
    const open = pound(bare, 600), armoured = pound([...C, { part: 'armour', p: 'main', x0: 480, x1: 700 }], 600);
    report(armoured.lost < open.lost * 0.5 && armoured.holes < open.holes * 0.5 && armoured.fires < Math.max(1, open.fires) * 0.5 && armoured.plated === 300, `300 hits on the main deck: bare ${open.lost.toFixed(0)} hull, ${open.holes} breaches, ${open.fires} fires; behind armour plate ${armoured.lost.toFixed(0)} hull, ${armoured.holes} breaches, ${armoured.fires} fires`);
    const heavier = validate([...C, { part: 'armour', p: 'main', x0: 480, x1: 840 }]);
    report(heavier.ok && heavier.budgets.lift.mass - validate(C).budgets.lift.mass > config.BALANCE.MASS.kind.boiler * 0.8 && heavier.checks.some((c) => c.group === 'Armour' && c.level === 'INFO'), `a 360 px stretch of plate weighs about a boiler (+${(heavier.budgets.lift.mass - validate(C).budgets.lift.mass).toFixed(1)}; a boiler is ${config.BALANCE.MASS.kind.boiler}) and the validator says so`);
  }
  restore();
  Math.random = realRandom;
  applyBuild(C);

  // 4. over seeded runs: coal beside the boiler burns more (the boiler is over-pressured every 15 s so it blows and lights fires)
  const runs = (build, label) => {
    const rows = [];
    for (let s = 1; s <= 6; s++) {
      const out = spawnSync(process.execPath, ['tools/botsim.mjs', ...(build ? ['--build', build] : []), '--blowout', '15', '--minutes', '3', '--seed', String(s), '--map', 'open'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
      const t = out.stdout || '';
      const m = t.match(/^fires: burning avg ([\d.]+), on fire ([\d.]+)% of flight, lit (\d+), hull eaten ~([\d.]+); by hit (\d+), spread (\d+), boiler (\d+), other (\d+); blazes (\d+)/m);
      const h = t.match(/^average hull: ([\d.]+)/m), er = t.match(/^errors: (\d+)/m);
      rows.push({ burn: m ? +m[1] : NaN, lit: m ? +m[3] : NaN, eaten: m ? +m[4] : NaN, blazes: m ? +m[9] : NaN, hull: h ? +h[1] : NaN, errors: er ? +er[1] : 1 });
    }
    const mean = (k) => rows.reduce((n, r) => n + r[k], 0) / rows.length;
    const o = { rows, burn: mean('burn'), lit: mean('lit'), eaten: mean('eaten'), blazes: mean('blazes'), hull: mean('hull'), errors: rows.reduce((n, r) => n + r.errors, 0) };
    console.log(`      ${label}: ${rows.length} runs, fires burning avg ${o.burn.toFixed(2)}, lit ${o.lit.toFixed(1)}, hull eaten ~${o.eaten.toFixed(0)}, blazes ${o.blazes.toFixed(1)}, average hull ${o.hull.toFixed(1)}, errors ${o.errors}`);
    return o;
  };
  const apart = runs(null, 'coal a deck below the boiler (classic)'), beside = runs('coalnear', 'coal beside the boiler');
  report(apart.errors === 0 && beside.errors === 0, 'both fly with 0 errors');
  report(beside.lit > apart.lit * 1.5 && beside.burn > apart.burn * 1.5 && beside.eaten > apart.eaten * 1.5 && beside.blazes > apart.blazes && beside.hull < apart.hull - 3, `coal beside the boiler burns measurably more: fires lit ${apart.lit.toFixed(1)} -> ${beside.lit.toFixed(1)}, burning ${apart.burn.toFixed(2)} -> ${beside.burn.toFixed(2)}, hull eaten ${apart.eaten.toFixed(0)} -> ${beside.eaten.toFixed(0)}, blazes ${apart.blazes.toFixed(1)} -> ${beside.blazes.toFixed(1)}, average hull ${apart.hull.toFixed(1)} -> ${beside.hull.toFixed(1)}`);
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
    const helm = SHIP_LAYOUT.stations.find((s) => s.kind === 'helm'); // (a quiet ship: just a helmsman, holding the pump lever still, and pumping after the rupture unless nobody can)
    const helmsman = { id: 'h', name: 'Helmsman', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: SHIP_LAYOUT.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0 };
    sim.state.players.h = helmsman;
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
  // gas valves and vents dropped from the tray: a valve links to the bag over it (the nearest), the end bags get spots too; a vent can go on any full deck and is tied to a boiler
  const noValves = four.filter((p) => p.part !== 'gasValve');
  const vs = S.slotsFor('gasValve', noValves);
  report(new Set(vs.map((s) => s.feeds)).size === 4 && vs.every((s) => /feeds the (aft|fore|bag \d) bag/i.test(s.label) || /feeds the (aft|fore) bag|feeds the bag \d/i.test(s.label) || /feeds/.test(s.label)), `the gas valve slots reach every bag of the four-bag ship (${vs.length} spots; bags ${[...new Set(vs.map((s) => s.feeds + 1))].sort().join(', ')})`);
  const vslot = vs.find((s) => s.feeds === 3);
  const vdrop = E.placePart(noValves, 'gasValve', vslot.x, vslot.y - 14);
  const Lv = buildLayout(vdrop.parts);
  report(vdrop.ok && Lv.gasValves.length === 1 && Lv.gasValves[0].bag === 3 && /valve/.test(vdrop.hint) && validate(vdrop.parts).checks.some((c) => c.group === 'Gas valves' && c.level === 'INFO'), 'a gas valve dropped on a spot under the nose links to the fore bag: ' + vdrop.hint);
  report(!E.placePart(C, 'gasValve', 900, 455).ok || buildLayout(C).gasbags.length > 0, 'a gas valve needs a bag (the classic ship takes one: it feeds her one bag)');
  const noBag = E.erase(C, 'gasbag', 0, 0).parts;
  report(/draw or drop a gasbag first/.test(E.placePart(noBag, 'gasValve', 900, 455).hint || ''), 'a gas valve on a ship with no bag says why: ' + E.placePart(noBag, 'gasValve', 900, 455).hint);
  const ventSlots = S.slotsFor('vent', C);
  report(new Set(ventSlots.map((s) => s.p)).size >= 3 && ventSlots.every((s) => /steam line/.test(s.label)), `steam vent spots are on every full deck (${[...new Set(ventSlots.map((s) => s.p))].join(', ')}) and each says whose steam line it is on: ${ventSlots[0].label}`);
  const withKeel = E.drawDeck(C, 'keel', 20, 350).parts;
  const vk = E.placePart(withKeel, 'vent', 150, 950 - 14);
  report(vk.ok && buildLayout(vk.parts).vents.some((v) => v.p === 'keel') && validate(vk.parts).checks.some((c) => c.group === 'Steam vents' && /Boiler x4/.test(c.text)), 'a vent dropped on the new keel deck works, and the validator ties all four vents to the boiler: ' + (validate(vk.parts).checks.find((c) => c.group === 'Steam vents') || {}).text);
  const near = E.placePart(C, 'rack_hammer', 6000, 455);
  report(!near.ok, 'a drop far from any deck is refused: ' + near.hint);

  // 2. in flight (headless sim, seeded so the runs differ only by what we do to them)
  const seedRandom = (seed) => { let s = seed >>> 0; Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const realRandom = Math.random, realNow = performance.now.bind(performance);
  let clock = 0;
  performance.now = () => clock;
  const flyIt = (parts, secs, { rupture, noPump, patchAt, at = 25, tail } = {}) => {
    seedRandom(6); // (S.5f: a seed whose quiet ship is still in the air when the bag goes; with most seeds a chance burst pipe drops her onto the floor first, with or without a rupture)
    clock = 0;
    config.MAPS.FORCE_KIND = 'open';
    applyBuild(parts);
    const sim = createSimulation();
    const helm = SHIP_LAYOUT.stations.find((s) => s.kind === 'helm'); // (a quiet ship: just a helmsman holding the pump lever still, who pumps after the rupture unless nobody can)
    const helmsman = { id: 'h', name: 'Helmsman', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: SHIP_LAYOUT.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0 };
    sim.state.players.h = helmsman;
    sim.castOff();
    const out = { warn: null, snap: {} }, keep = {};
    const last = tail ? 0 : sim.state.bags.length - 1; // (the bag to lose: the fore one, or the tail one)
    for (let i = 0; i < secs * 60; i++) {
      clock += 1000 / 60;
      if (rupture && i === at * 60) { // the fore bag: its gas to nothing, and three holes in it
        sim.state.bags[last].gas = 0;
        for (const x of tail ? [260, 300, 280] : [1300, 1340, 1320]) sim.state.gasHoles.push(sim.gasHoleAt(x, 450, last));
      }
      if (rupture && i === at * 60 && !noPump) helmsman.gas = 1;
      if (rupture && i === at * 60 && !noPump) helmsman.gas = 1;
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

    // 2b. gas valves: rupture the fore bag while the helm pumps. With its valve OPEN the holes bleed the shared feed (the healthy bags fill slower); a crewman shuts the
    // valve (a real tap on the Action button) and the feed is whole again; patch the holes, open the valve, and the bag fills.
    const { applyPlayerInput } = await load('modules/host/network.js');
    const valveRun = ({ close, patch, reopen, pumpOff }) => {
      seedRandom(5);
      clock = 0;
      config.MAPS.FORCE_KIND = 'open';
      applyBuild(four);
      const sim = createSimulation();
      const st = sim.state, L = SHIP_LAYOUT, fore = st.bags.length - 1;
      const helm = L.stations.find((s) => s.kind === 'helm');
      const gv = L.gasValves.find((v) => v.bag === fore);
      const helmsman = { id: 'h', name: 'Helmsman', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: L.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0 };
      const me = { id: 'me', name: 'Valve', species: config.CREW_SPECIES[0], color: '#e63946', x: gv.x, y: L.platforms[gv.d].y, d: gv.d, jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0 };
      st.players.h = helmsman; st.players.me = me;
      sim.castOff();
      const out = { taps: [], label: null, valveIndex: L.gasValves.indexOf(gv) };
      const tap = () => { const u = sim.interaction(me, null).use; out.taps.push(u && u.type); if (!out.label && u) out.label = u.label; applyPlayerInput(st, me, { jx: 0, jy: 0, act: 1, aid: me.ui && me.ui.aid }); };
      const at = (t) => Math.round(t * 60);
      const total = () => st.bags.reduce((n, b) => n + b.gas, 0);
      for (let i = 0; i <= at(24); i++) {
        clock += 1000 / 60;
        me.x = gv.x; me.d = gv.d; me.jx = 0; me.fall = false; me.grabLock = 0; // (the crewman stays at the valve)
        if (i === at(8)) { for (let k = 0; k < fore; k++) st.bags[k].gas = 30; st.bags[fore].gas = 0; for (const x of [1300, 1340, 1320]) st.gasHoles.push(sim.gasHoleAt(x, 450, fore)); helmsman.gas = pumpOff ? 0 : 1; out.before = { healthy: st.bags.slice(0, fore).reduce((n, b) => n + b.gas, 0) / fore, total: total() }; }
        if (close && i === at(8.4)) tap();
        if (patch && i === at(11.5)) st.gasHoles.length = 0;
        if (reopen && i === at(11.9)) tap();
        sim.update(1 / 60);
        if (i === at(10.5)) out.mid = { healthy: st.bags.slice(0, fore).reduce((n, b) => n + b.gas, 0) / fore, ruptured: st.bags[fore].gas, total: total(), closed: st.bags[fore].closed, valves: st.gasValveOpen.slice() };
        if (i === at(24)) out.end = { ruptured: st.bags[fore].gas, closed: st.bags[fore].closed, down: st.bags[fore].down, valves: st.gasValveOpen.slice(), healthy: st.bags.slice(0, fore).reduce((n, b) => n + b.gas, 0) / fore };
      }
      return out;
    };
    const vOpen = valveRun({}), vShut = valveRun({ close: true }), vFull = valveRun({ close: true, patch: true, reopen: true });
    const Lf = buildLayout(four);
    report(Lf.gasValves.length === 4 && new Set(Lf.gasValves.map((v) => v.bag)).size === 4 && !buildLayout(C).gasValves, 'the four-bag test ship has a gas valve for every bag, each linked to the bag over it (feeds ' + Lf.gasValves.map((v) => 'bag ' + (v.bag + 1)).join(', ') + '); the classic ship has none (every bag always open)');
    report(vShut.taps[0] === 'gasvalve' && /^Close (aft|fore|bag \d)/i.test(vShut.label || '') && /valve$/.test(vShut.label), 'the crewman at the fore valve is offered "' + vShut.label + '" and a tap turns it (the action is a normal Action-button tap)');
    report(vShut.mid.closed === true && vShut.mid.valves[vShut.valveIndex] === false && vOpen.mid.closed === false, 'a SHUT valve cuts its bag off (state.bags[3].closed); open, it is fed');
    report(vShut.mid.healthy > vOpen.mid.healthy + 8, `while the helm pumps, the ruptured bag's open holes bleed the shared feed: the three healthy bags are at ${vOpen.mid.healthy.toFixed(0)} with the valve open but ${vShut.mid.healthy.toFixed(0)} once it is shut (they fill at the whole pump rate again)`);
    report(vShut.mid.ruptured < vOpen.mid.ruptured - 8, `the shut bag is cut off from the pump (gas ${vShut.mid.ruptured.toFixed(0)}, only its own leak) while the open one is fed (${vOpen.mid.ruptured.toFixed(0)}): the gas goes to the bags that hold it, not out of the holes`);
    report(vFull.taps.length === 2 && vFull.end.valves[vFull.valveIndex] === true && !vFull.end.closed && vFull.end.ruptured > config.GAS.BAG_UP + 15 && !vFull.end.down, `patch the holes, open the valve again, and the bag recovers: fore bag gas ${vFull.end.ruptured.toFixed(0)} at the end (valve ${vFull.end.valves[vFull.valveIndex] ? 'open' : 'SHUT'})`);
    const vStay = valveRun({ close: true, patch: true });
    report(vStay.end.closed && vStay.end.ruptured < config.GAS.BAG_UP, `a bag whose valve stays shut is not refilled after patching (gas ${vStay.end.ruptured.toFixed(0)}): it needs the valve opened`);
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

// S.5e: the minimum ship. A gasbag and one deck are all she needs; everything else is advice. Builds her up step by step with the editor's own operations
// (tools/fixtures/minimum-lib.mjs): 1 deck + bag, 2 + helm, 3 + boiler and coal, 4 + engines, 5 + a top deck with a mast and sail. Each step: validates (WARNs listed,
// no FAILs) and flies 2 minutes with 0 errors on three maps and three seeds. Prints a table of what each step buys her:
//   capability (clean air, no enemies): top speed, climb and dive rate with the helm worked flat out
//   a botsim average (what the bots made of her): net speed, how far she moved up and down, furthest progress, time on the rocks
// then: a person raises and lowers a sail through the Action button (hold to haul, tap to lower), and a storm gust tears a sail left up (a hammer mends it; reefing in
// time saves it).
async function checkMinimum() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { config } = await load('config.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { validate } = await load('modules/host/buildCheck.js');
  const { applyBuild, SHIP_LAYOUT } = await load('shipLayout.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  const { scrollSpeed } = await load('modules/host/course.js');
  const { minimumBuild } = await import(pathToFileURL(path.join(root, 'tools', 'fixtures', 'minimum-lib.mjs')).href);
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const steps = [1, 2, 3, 4, 5].map((s) => ({ step: s, parts: minimumBuild(s) }));
  const names = ['1 deck + bag', '2 + helm', '3 + boiler, coal', '4 + engines', '5 + mast and sail'];

  // 1. every step validates: no FAIL, the missing parts listed as WARNs
  steps.forEach((s) => {
    const v = validate(s.parts);
    s.v = v;
    report(v.ok && v.needs.length === 0, `step ${names[s.step - 1]}: validates (${v.warns.length} warnings, no FAIL)${v.ok ? '' : ': ' + v.fails.join('; ')}`);
  });
  const w1 = steps[0].v.warns.filter((t) => /^No |^Fewer/.test(t));
  report(w1.length >= 8 && ['helm', 'boiler', 'engine', 'guns', 'medbay', 'extinguisher', 'lookout', 'hammer'].every((k) => w1.some((t) => t.toLowerCase().includes(k))), `step 1 lists what she lacks as strong WARNs (${w1.length}): ${w1.map((t) => t.split(':')[0]).join(' | ')}`);
  report(steps[4].v.checks.some((c) => c.group === 'Sails' && c.level === 'INFO'), 'step 5 reports her sail (validator INFO)');
  const empty = validate([]);
  report(!empty.ok && empty.needs.join() === 'a deck to stand on,a gasbag', 'with no deck and no gasbag she cannot fly: the only two needs are "' + empty.needs.join('", "') + '"');

  // 2. capability: a calm sky, nobody shooting. A person works the helm flat out (if there is one) and we read what she can do.
  const keep = JSON.stringify([config.PACING, config.SPECIALS.FIRST_AFTER, config.MAPS.FORCE_KIND, config.ENVIRONMENTS.FORCE]);
  const calm = () => { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.MAPS.FORCE_KIND = 'open'; config.ENVIRONMENTS.FORCE = 'skyisles'; };
  const restore = () => { const [p, f, m, e] = JSON.parse(keep); Object.assign(config.PACING, p); config.SPECIALS.FIRST_AFTER = f; config.MAPS.FORCE_KIND = m; config.ENVIRONMENTS.FORCE = e; };
  const human = (sim, o) => { const q = { id: o.id, name: o.id, species: config.CREW_SPECIES[0], color: '#fff', jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0, ...o }; sim.state.players[o.id] = q; return q; };
  const boot = (parts) => { applyBuild(parts); calm(); const sim = createSimulation(); sim.castOff(); return sim; };
  const helmOf = () => SHIP_LAYOUT.stations.find((s) => s.kind === 'helm');
  const capability = (parts, sailsUp) => {
    // (a fresh calm ship for each measurement: the helm is worked flat out for a few seconds and we read the best she did; for a dive she first climbs 5 s so there is air below)
    const measure = (secs, prelude, set) => {
      const sim = boot(parts);
      const hs = helmOf();
      const p = hs ? human(sim, { id: 'h', x: hs.x, y: SHIP_LAYOUT.platforms[hs.d].y, d: hs.d, lock: hs.n, gas: 0 }) : null;
      sim.update(1 / 60); // (the sails are fitted on the first frame)
      if (sailsUp) for (const s of sim.state.sails) s.hoist = 1;
      const best = { speed: 0, up: 0, down: 0 };
      const go = (n, f, rec) => {
        for (let i = 0; i < n * 60; i++) {
          if (p) f(p);
          sim.state.ship.press = Math.min(Math.max(sim.state.ship.press, 55), 80); // (a boiler hand keeps the steam up and the vents open)
          sim.update(1 / 60);
          const st = sim.state;
          if (rec) { best.speed = Math.max(best.speed, scrollSpeed(st)); best.up = Math.max(best.up, st.ship.vy || 0); best.down = Math.max(best.down, -(st.ship.vy || 0)); }
        }
      };
      go(2, (q) => { q.jx = 0; q.jy = 0; q.gas = 0; }, false); // settle
      if (prelude) go(5, prelude, false);
      go(secs, set, true);
      return best;
    };
    const up = (q) => { q.jx = 0; q.jy = -1; q.gas = 1; };
    return {
      speed: measure(8, null, (q) => { q.jx = 1; q.jy = 0; q.gas = 0; }).speed,
      climb: measure(6, null, up).up,
      dive: measure(6, up, (q) => { q.jx = 0; q.jy = 1; q.gas = -1; }).down,
    };
  };
  const caps = steps.map((s) => capability(s.parts, s.step === 5));
  restore();
  applyBuild(BUILDS.classic);
  console.log('\n  capability (calm sky, helm flat out; sail fully raised at step 5)');
  console.log('  step                 top speed px/s   climb px/s   dive px/s');
  steps.forEach((s, i) => console.log('  ' + names[i].padEnd(20) + String(Math.round(caps[i].speed)).padStart(10) + String(Math.round(caps[i].climb)).padStart(14) + String(Math.round(caps[i].dive)).padStart(13)));
  if (has('caps-only')) { console.log('CAPS ' + JSON.stringify(caps)); return ok; } // (B0: tools/buildsim.mjs --check-golden reads the capability table only)
  report(caps[1].speed >= caps[0].speed - 1 && caps[2].speed >= caps[1].speed - 1, 'a helm and a boiler do not slow her: the wind alone (' + Math.round(caps[0].speed) + ' px/s) is her top speed until she has engines');
  report(caps[3].speed > caps[2].speed * 1.5, `engines make her much faster (${Math.round(caps[2].speed)} -> ${Math.round(caps[3].speed)} px/s)`);
  report(caps[4].speed > caps[3].speed * 1.05, `a raised sail adds speed on top (${Math.round(caps[3].speed)} -> ${Math.round(caps[4].speed)} px/s)`);
  report(caps[0].climb < 5 && caps[0].dive < 5, `step 1 has no control: she neither climbs nor dives on command (${Math.round(caps[0].climb)} / ${Math.round(caps[0].dive)} px/s)`);
  report(caps[1].dive > caps[0].dive + 20 && caps[1].climb > caps[0].climb + 15, `a helm gives control without steam: the hand trim climbs slowly (${Math.round(caps[1].climb)} px/s), venting drops her (${Math.round(caps[1].dive)} px/s)`);
  report(caps[2].climb > caps[1].climb * 1.5, `a boiler and coal give her the pump: she climbs much better (${Math.round(caps[1].climb)} -> ${Math.round(caps[2].climb)} px/s)`);

  // 3. flight: 2 minutes on three maps and three seeds each: 0 errors; a table of what the bots made of her
  console.log('\n  2-minute botsim, 3 maps x 3 seeds (route, open, network) per step: ');
  const jobs = [];
  for (const s of steps) for (const map of ['route', 'open', 'network']) for (const seed of [1, 2, 3]) jobs.push(() => runBotsim(s.parts, { map, minutes: 2, bots: 6, seed }).then((r) => ({ step: s.step, map, seed, r })));
  const res = await pool(jobs, 4);
  const avg = (list, f) => (list.length ? list.reduce((n, x) => n + f(x), 0) / list.length : 0);
  console.log('  step                 net speed px/s   altitude span px   progress %   on the rocks %   tows   avg hull   errors');
  const rows = steps.map((s) => {
    const mine = res.filter((x) => x.step === s.step), st = mine.map((x) => x.r.stats).filter(Boolean);
    const row = { speed: avg(st, (q) => q.flight.speed), span: avg(st, (q) => q.flight.altMax - q.flight.altMin), prog: avg(st, (q) => q.flight.progress * 100), rocks: avg(st, (q) => q.flight.rocks * 100), tows: avg(st, (q) => q.tows), hull: avg(st, (q) => q.avgHull), errors: mine.reduce((n, x) => n + (x.r.stats ? x.r.stats.errors : 1), 0), crashed: mine.length - st.length };
    console.log('  ' + names[s.step - 1].padEnd(20) + [row.speed, row.span, row.prog, row.rocks].map((v) => String(Math.round(v)).padStart(12)).join('  ') + row.tows.toFixed(1).padStart(9) + String(Math.round(row.hull)).padStart(10) + String(row.errors).padStart(9));
    return row;
  });
  steps.forEach((s, i) => report(rows[i].errors === 0 && rows[i].crashed === 0, `step ${names[i]}: 9 botsim runs of 2 minutes, 0 errors`));
  report(rows[4].speed > rows[0].speed && rows[3].speed > rows[0].speed, `flown by the bots, the engines and the sail get her further than the bare bag (net ${Math.round(rows[0].speed)} -> ${Math.round(rows[3].speed)} -> ${Math.round(rows[4].speed)} px/s)`);
  report(rows[4].prog > rows[0].prog && rows[4].prog >= rows[3].prog, `... and further along the route (progress ${rows[0].prog.toFixed(0)}% -> ${rows[4].prog.toFixed(0)}%)`);

  // 3b. a person mashing every button on each step (the Action / Grab / attack / jump presses, the stick, climbing, walking off the ends): nothing may throw
  for (const s of steps) {
    calm();
    applyBuild(s.parts);
    let msg = null;
    try {
      const sim = createSimulation();
      const q = { id: 'm', name: 'Masher', species: config.CREW_SPECIES[0], color: '#fff', x: SHIP_LAYOUT.boarderEntryPoints[0].x, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
      sim.state.players.m = q;
      sim.castOff();
      let seed = 7 * s.step;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 60 * 45; i++) {
        if (i % 20 === 0) { q.jx = rnd() * 2 - 1; q.jy = rnd() < 0.3 ? rnd() * 2 - 1 : 0; q.fire = rnd() < 0.4; }
        if (rnd() < 0.03) q.actQ = true;
        if (rnd() < 0.02) q.grabQ = true;
        if (rnd() < 0.02) q.atkQ = true;
        if (rnd() < 0.01) q.jumpQ = true;
        if (rnd() < 0.004) q.leaveQ = true;
        sim.update(1 / 60);
      }
    } catch (e) { msg = (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); }
    report(msg === null, `step ${names[s.step - 1]}: a person mashing every button for 45 s: no errors${msg ? ': ' + msg : ''}`);
    restore();
  }
  applyBuild(BUILDS.classic);

  // 4. a person works the sail through the Action button; the gust test
  {
    calm();
    applyBuild(steps[4].parts);
    const sim = createSimulation();
    sim.castOff();
    const mast = SHIP_LAYOUT.sails[0];
    const p = human(sim, { id: 's', x: mast.x, y: SHIP_LAYOUT.platforms[mast.d].y, d: mast.d });
    const tick = () => { p.x = mast.x; sim.update(1 / 60); }; // (the crew member keeps her feet at the mast, as a person walking back would)
    for (let i = 0; i < 30; i++) tick();
    report(p.ui && p.ui.label === 'Raise sail' && p.ui.hold === true, `at the mast the phone says "${p.ui && p.ui.label}" (hold the big button)`);
    const sail = sim.state.sails[0];
    p.fire = true;
    let half = 0;
    for (let i = 0; i < Math.round((config.SAIL.HAUL_TIME + 0.5) * 60); i++) { tick(); if (i === Math.round(config.SAIL.HAUL_TIME * 30)) half = sail.hoist; }
    p.fire = false;
    for (let i = 0; i < 20; i++) tick();
    report(sail.hoist >= 0.99 && half > 0.3 && half < 0.7, `holding Action for ${config.SAIL.HAUL_TIME} s hauls the sail up (half way after half the time: ${half.toFixed(2)}; now ${sail.hoist.toFixed(2)})`);
    report(p.ui.label === 'Lower sail' && !p.ui.hold, `with the sail up the button says "${p.ui.label}" (a tap)`);
    for (let i = 0; i < 240; i++) tick();
    const pushed = sim.state.sailPush;
    report(pushed > 0.05, `a raised sail pulls: +${(pushed * 100).toFixed(0)}% of top speed (${Math.round(pushed * config.SHIP.TOP_SPEED)} px/s)`);
    p.actQ = true;
    p.actAid = p.ui.aid;
    tick();
    for (let i = 0; i < Math.round((config.SAIL.LOWER_TIME + 0.5) * 60); i++) tick();
    report(sail.hoist === 0 && p.ui.label === 'Raise sail', 'a tap lets the sail down again (' + sail.hoist.toFixed(2) + '), the button is back to "Raise sail"');
    // let go half way: it slips back
    p.fire = true;
    for (let i = 0; i < 90; i++) tick();
    p.fire = false;
    const mid = sail.hoist;
    for (let i = 0; i < Math.round(config.SAIL.LOWER_TIME * 2.5 * 60); i++) tick();
    report(mid > 0.2 && sail.hoist === 0, `let go half way (${mid.toFixed(2)}) the sail slips back down`);
    restore();
  }
  {
    // gusts: a Storm Front. Sail up and nobody about: the gusts tear it. With the bots about it is reefed in time (they lower it when the warning shows).
    const gust = (crew) => {
      calm();
      config.ENVIRONMENTS.FORCE = 'storm';
      applyBuild(steps[4].parts);
      const sim = createSimulation();
      if (crew) for (let i = 0; i < 4; i++) sim.state.players['b' + i] = { id: 'b' + i, bot: true, name: 'Bot' + i, species: config.CREW_SPECIES[0], color: '#fff', x: SHIP_LAYOUT.boarderEntryPoints[0].x + i * 40, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
      sim.castOff();
      sim.update(1 / 60); // (the sails are fitted on the first frame)
      let warned = 0, torn = 0;
      for (let i = 0; i < 150 * 60; i++) {
        if (!crew && !sim.state.sails[0].torn && sim.state.sails[0].hoist < 1) sim.state.sails[0].hoist = 1; // (nobody reefs: keep her flying the sail)
        sim.update(1 / 60);
        if (sim.state.sailWarn) warned++;
        torn = sim.state.sailStats.torn;
      }
      const m = sim.state.modules.find((q) => q.kind === 'sail');
      const out = { warned, torn, brokenAtEnd: !!(m && m.broken), up: sim.state.sailStats.upSecs };
      restore();
      return out;
    };
    const left = gust(false);
    report(left.warned > 60 && left.torn >= 1, `Storm Front, sail left up for 150 s: the TV warns of the gust (${left.warned} frames of "REEF!") and a gust tears the sail (${left.torn} tear${left.torn === 1 ? '' : 's'})`);
    const tended = gust(true);
    report(tended.torn <= left.torn, `with a crew about the sail is reefed before gusts: ${tended.torn} tear${tended.torn === 1 ? '' : 's'} (against ${left.torn} for the unattended one), up ${tended.up.toFixed(0)} s`);
    // mending: a person with a hammer fixes a torn sail
    calm();
    config.ENVIRONMENTS.FORCE = 'storm';
    applyBuild(steps[4].parts);
    const sim = createSimulation();
    sim.castOff();
    const m = sim.state.modules.find((q) => q.kind === 'sail');
    sim.modules.damage(m, 999);
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
    const mast = SHIP_LAYOUT.sails[0];
    const p = human(sim, { id: 'r', x: mast.x, y: SHIP_LAYOUT.platforms[mast.d].y, d: mast.d, carry: 'hammer' });
    p.fire = true;
    for (let i = 0; i < 20 * 60 && m.broken; i++) sim.update(1 / 60);
    report(!m.broken && sim.state.sails[0].hoist === 0, 'a torn sail is mended with a hammer (hold Action at the mast) and can be raised again');
    restore();
  }
  applyBuild(BUILDS.classic);
  return ok;
}

// ---- S.5h: pointed engines, and forces at places -------------------------------------------------------------------------
// A calm sim to measure with: nobody shooting, an open sky, a person at the helm if the test wants one. Each helper boots a fresh ship from a list of parts.
async function forceLab() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { config } = await load('config.js');
  const shipBuild = await load('modules/host/shipBuild.js');
  const slots = await load('modules/host/buildSlots.js');
  const edit = await load('modules/host/buildEdit.js');
  const { validate } = await load('modules/host/buildCheck.js');
  const { applyBuild, SHIP_LAYOUT, SHIP_BALANCE } = await load('shipLayout.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  const { scrollSpeed } = await load('modules/host/course.js');
  const { applyForce, forcesOf } = await load('modules/host/forces.js');
  const keep = JSON.stringify([config.PACING, config.SPECIALS.FIRST_AFTER, config.MAPS.FORCE_KIND, config.ENVIRONMENTS.FORCE, config.FORCES.LIVE]);
  const lab = { config, ...shipBuild, ...slots, ...edit, validate, applyBuild, SHIP_LAYOUT, SHIP_BALANCE, createSimulation, scrollSpeed, applyForce, forcesOf };
  lab.calm = (env = 'skyisles') => { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.MAPS.FORCE_KIND = 'open'; config.ENVIRONMENTS.FORCE = env; };
  lab.restore = () => { const [p, f, m, e, l] = JSON.parse(keep); Object.assign(config.PACING, p); config.SPECIALS.FIRST_AFTER = f; config.MAPS.FORCE_KIND = m; config.ENVIRONMENTS.FORCE = e; config.FORCES.LIVE = l; applyBuild(shipBuild.BUILDS.classic); lab.unseed(); };
  lab.human = (sim, o) => { const q = { id: o.id, name: o.id, species: config.CREW_SPECIES[0], color: '#fff', jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0, ...o }; sim.state.players[o.id] = q; return q; };
  // (every ship is booted on the same seeded sky, so a comparison between two builds is between the builds, not between two random maps)
  const realRandom = Math.random, realNow = Date.now;
  lab.boot = (parts, env, seed = 1) => {
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    Date.now = () => 1700000000000 + seed;
    applyBuild(parts); lab.calm(env);
    const sim = createSimulation(); sim.castOff(); sim.update(1 / 60);
    return sim;
  };
  lab.unseed = () => { Math.random = realRandom; Date.now = realNow; };
  // A person at the helm or at a station of this kind (stick jx / jy set by the caller each frame through `each`).
  lab.at = (sim, kind, id = 'p') => { const s = SHIP_LAYOUT.stations.find((q) => q.kind === kind); return s ? lab.human(sim, { id, x: s.x, y: SHIP_LAYOUT.platforms[s.d].y, d: s.d, lock: s.n, gas: 0 }) : null; };
  // Run secs of flight; `each(i, t)` runs before every frame. The steam is kept up (a boiler hand) so thrust is not what is being measured.
  lab.run = (sim, secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { if (each) each(i, i / 60); sim.state.ship.press = Math.min(Math.max(sim.state.ship.press, 60), 80); sim.state.ship.fuel = Math.max(sim.state.ship.fuel, 60); sim.update(1 / 60); } };
  lab.withEngines = (parts, dirs) => parts.map((p) => (p.part === 'engine' && dirs[p.name] !== undefined ? { ...p, dir: dirs[p.name] } : { ...p }));
  return lab;
}
const PI = Math.PI;

async function checkEngines() {
  const lab = await forceLab();
  const { config, BUILDS, SHIP_LAYOUT } = lab;
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const C = BUILDS.classic;
  const both = (d) => lab.withEngines(C, { 'Aft Engine': d, 'Fore Engine': d });
  const only = (name, d) => lab.withEngines(C, { [name]: d });
  const near = (a, b, e) => Math.abs(a - b) <= e;

  // ---- the pure operations and the validator
  {
    const before = JSON.stringify(C);
    const r = lab.setEngineDir(C, 'Fore Engine', -PI / 2);
    report(r.ok && r.parts.find((p) => p.name === 'Fore Engine').dir === -1.5708 && JSON.stringify(C) === before && !C.find((p) => p.name === 'Fore Engine').dir, `setEngineDir(parts, id, angle) points the engine on a copy and leaves the input alone: ${r.hint}`);
    report(!lab.setEngineDir(C, 'No Such Engine', 0).ok && !lab.setEngineDir(C, 'Fore Engine', NaN).ok, 'setEngineDir refuses an engine that does not exist and an angle that is not a number');
    const sw = lab.setEngineSwivel(C, 'Aft Engine', true);
    const L = lab.buildLayout(sw.parts);
    report(sw.ok && L.engines.find((e) => e.name === 'Aft Engine').swivel && L.stations.some((s) => s.kind === 'swivel' && s.eng === 'Aft Engine'), 'setEngineSwivel adds a crew station of kind "swivel" beside the engine: ' + sw.hint);
    const off = lab.setEngineSwivel(sw.parts, 'Aft Engine', false);
    report(off.ok && !lab.buildLayout(off.parts).stations.some((s) => s.kind === 'swivel'), 'and takes it away again');
    const gone = lab.removeAt(sw.parts, L.engines.find((e) => e.name === 'Aft Engine').x, L.platforms[L.engines.find((e) => e.name === 'Aft Engine').d].y + 14);
    report(gone.ok && !gone.parts.some((p) => p.name === 'Aft Engine') && !lab.buildLayout(gone.parts).stations.some((s) => s.kind === 'swivel'), 'deleting a swivel engine takes its crank with it');
    const drop = lab.placePart(lab.withEngines(C, {}).filter((p) => !(p.part === 'engine' && p.name === 'Fore Engine') && !(p.part === 'pipe' && p.to === 'Fore Engine')), 'engine', 1500, 800, { dir: -PI / 2 });
    report(drop.ok && drop.parts.some((p) => p.part === 'engine' && p.dir === -1.5708), `dropping an engine with a direction (placePart ..., { dir }) places it pointing up: ${drop.hint}`);
    const v0 = lab.validate(C), vUp = lab.validate(only('Fore Engine', -PI / 2)), vOpp = lab.validate(only('Fore Engine', PI)), vSw = lab.validate(lab.setEngineSwivel(only('Fore Engine', -PI / 2), 'Fore Engine', true).parts);
    const thrust = (v) => v.checks.filter((c) => c.group === 'Thrust');
    report(thrust(v0).length === 1 && thrust(v0)[0].level === 'INFO' && v0.warns.length === 0, `the classic ship: one INFO line on thrust and no warning: "${thrust(v0)[0].text}"`);
    report(thrust(vUp).some((c) => c.level === 'INFO' && /up 16 gas points/.test(c.text) && /nose up/.test(c.text)) && thrust(vUp).some((c) => c.level === 'WARN' && /nothing can turn them back/.test(c.text)), 'a nose engine pointing up: INFO (lift 16 gas points, nose-up torque) and a WARN that nothing can counter the tilt');
    report(!thrust(vSw).some((c) => c.level === 'WARN'), 'the same engine with a swivel mount: no tilt WARN (a crew member can turn it)');
    report(thrust(vOpp).some((c) => c.level === 'WARN' && /push against each other/.test(c.text)), 'one engine pushing ahead and one astern: WARN that they cancel out');
    report(vUp.budgets.lift.lift > v0.budgets.lift.lift + 15, `an up-pointing engine counts as lift in the LIFT gauge (hover ${v0.budgets.lift.hover} -> ${vUp.budgets.lift.hover})`);
  }

  // ---- (a) forward engines give the classic speed; (b) back-pointing ones reduce it / reverse
  const speeds = (parts) => { // the best scroll speed ahead (stick right) and astern (stick left) with the helm flat out
    const out = {};
    for (const [name, jx] of [['ahead', 1], ['astern', -1]]) {
      const sim = lab.boot(parts);
      const p = lab.at(sim, 'helm');
      let best = 0;
      lab.run(sim, 8, (i, t) => { p.jx = jx; p.jy = 0; p.gas = 0; if (t > 4.5 && sim.state.ship.speed * jx > 0) { const v = lab.scrollSpeed(sim.state); if (Math.abs(v) > Math.abs(best)) best = v; } }); // (the best she does between 4.5 and 8 s, once the start-up speed has died away: after about 10 s the mission map ends)
      out[name] = best;
    }
    return out;
  };
  const sClassic = speeds(C), sZero = speeds(both(0)), sThree = speeds([...C, ...lab.setEngineDir(lab.slotsFor('engine', C)[0].apply(C), 'Pod Engine 1', 0).parts.filter((p) => p.name === 'Pod Engine 1' || (p.part === 'pipe' && p.to === 'Pod Engine 1'))]);
  report(near(sClassic.ahead, config.SHIP.TOP_SPEED, 20), `classic top speed ${Math.round(sClassic.ahead)} px/s (full ahead is ${config.SHIP.TOP_SPEED})`);
  report(sZero.ahead === sClassic.ahead && sZero.astern === sClassic.astern, `engines given dir 0 (forward) are exactly the classic ship (${Math.round(sZero.ahead)} / ${Math.round(sZero.astern)} px/s)`);
  report(near(sThree.ahead, sClassic.ahead, 1), `a third forward engine adds safety, not speed (${Math.round(sThree.ahead)} px/s)`);
  const sOne = speeds(only('Fore Engine', PI)), sBack = speeds(both(PI));
  report(sOne.ahead < sClassic.ahead * 0.35, `one engine pushing astern cancels the other: top speed ${Math.round(sClassic.ahead)} -> ${Math.round(sOne.ahead)} px/s`);
  report(sBack.ahead < sClassic.ahead * 0.4 && -sBack.astern >= -sClassic.astern, `both engines pointing back: only ${Math.round(sBack.ahead)} px/s ahead, but ${Math.round(-sBack.astern)} px/s astern (classic ${Math.round(-sClassic.astern)})`);
  const sHalf = speeds(only('Fore Engine', -PI / 4));
  report(sHalf.ahead < sClassic.ahead && sHalf.ahead > sClassic.ahead * 0.6, `an engine at 45 degrees gives a mix: ${Math.round(sHalf.ahead)} px/s ahead (and lift)`);
  const sUp = speeds(both(-PI / 2));
  report(sUp.ahead < sClassic.ahead * 0.4, `engines all pointing up do not push her ahead: ${Math.round(sUp.ahead)} px/s (the wind and the idle drift)`);

  // ---- (c) up climbs with no gas, (d) down dives, (e) pitch
  const climb = (parts, secs = 3) => {
    const sim = lab.boot(parts);
    const p = lab.at(sim, 'helm');
    const g0 = sim.state.ship.gas, a0 = sim.state.ship.alt;
    let vyMax = -1e9, vyMin = 1e9, pitchMin = 0, pitchMax = 0, steamUp = 0;
    lab.run(sim, secs, () => { p.jx = 0; p.jy = 0; p.gas = 0; vyMax = Math.max(vyMax, sim.state.ship.vy || 0); vyMin = Math.min(vyMin, sim.state.ship.vy || 0); pitchMin = Math.min(pitchMin, sim.state.ship.pitch); pitchMax = Math.max(pitchMax, sim.state.ship.pitch); });
    return { alt: sim.state.ship.alt - a0, gas: sim.state.ship.gas - g0, vyMax, vyMin, pitch: sim.state.ship.pitch, pitchMin, pitchMax, theta: sim.state.forces.theta, steam: sim.state.steamUse, press: sim.state.ship.press };
  };
  const cC = climb(C), cU = climb(both(-PI / 2)), cD = climb(both(PI / 2));
  report(cU.alt > cC.alt + 80 && Math.abs(cU.gas - cC.gas) < 0.5, `engines pointing up climb with no gas change: +${Math.round(cU.alt)} px in 3 s against ${Math.round(cC.alt)} for the classic ship (gas ${cU.gas.toFixed(1)} vs ${cC.gas.toFixed(1)}), climb ${Math.round(cU.vyMax)} px/s`);
  report(cD.alt < cC.alt - 80, `engines pointing down dive: ${Math.round(cD.alt)} px in 3 s against ${Math.round(cC.alt)} (dive ${Math.round(cD.vyMin)} px/s)`);
  report(cU.steam > cC.steam + 1, `lift thrust costs steam (use ${cC.steam.toFixed(1)} -> ${cU.steam.toFixed(1)} per second at the same throttle)`);
  const nose = climb(only('Fore Engine', -PI / 2), 5), tail = climb(only('Aft Engine', -PI / 2), 5), plain = climb(C, 5);
  report(plain.theta === 0 && nose.theta < -0.002 && nose.pitch < plain.pitch - 0.002, `a nose engine pointing up lifts the nose: pitch ${(nose.pitch * 57.3).toFixed(2)} degrees against ${(plain.pitch * 57.3).toFixed(2)} (the forces tilt ${(nose.theta * 57.3).toFixed(2)})`);
  report(tail.theta > 0.001, `a tail engine pointing up lifts the tail, nose down: tilt ${(tail.theta * 57.3).toFixed(2)} degrees`);
  const bothUp = climb(both(-PI / 2), 5);
  report(Math.abs(bothUp.theta) < Math.abs(nose.theta) * 0.7, `a pair at the two ends lift evenly: tilt ${(bothUp.theta * 57.3).toFixed(2)} degrees against ${(nose.theta * 57.3).toFixed(2)} for the nose engine alone`);

  // ---- (f) a person turns a swivel engine with the stick; the thrust follows
  {
    const parts = await loadBuild('swivel', BUILDS);
    const v = lab.validate(parts);
    report(v.ok && v.checks.some((c) => c.group === 'Thrust' && /swivel mount/.test(c.text)), 'the swivel test ship validates and the report lists her swivel mount');
    const sim = lab.boot(parts);
    const st = SHIP_LAYOUT.stations.find((s) => s.kind === 'swivel');
    const p = lab.at(sim, 'swivel'), h = lab.at(sim, 'helm', 'h'); // (a second person holds the helm still: no throttle, no trim, no pump)
    const eng = () => sim.engines.byName(st.eng);
    p.jx = p.jy = 0;
    lab.run(sim, 1, () => { h.jx = h.jy = 0; });
    report(p.ui && p.ui.label === 'Swivel engine' && p.ui.kind === 'swivel' && /points FORWARD/.test(p.ui.status || ''), `at the crank the phone says "${p.ui && p.ui.label}" (${p.ui && p.ui.status})`);
    const f0 = sim.state.thrust.factor;
    lab.run(sim, 2.5, () => { p.jx = 0; p.jy = -1; });
    report(near(eng().dir, -PI / 2, 0.05) && eng().up > 0.99 && sim.state.forces.vyAcc > 50, `stick UP: the engine turns up (${(eng().dir * 57.3).toFixed(0)} degrees) and its lift follows (${sim.state.forces.vyAcc.toFixed(0)} px/s^2)`);
    report(sim.state.thrust.factor < f0 * 0.6 && sim.state.ship.vy > 10, `...she loses forward thrust (${f0.toFixed(2)} -> ${sim.state.thrust.factor.toFixed(2)}) and climbs (${Math.round(sim.state.ship.vy)} px/s)`);
    lab.run(sim, 2.5, () => { p.jx = 1; p.jy = 0; });
    report(near(eng().dir, 0, 0.05) && eng().up === 0 && sim.state.forces.vyAcc === 0 && sim.state.thrust.factor === f0, 'stick forward: the engine turns back ahead, the lift stops, the speed is back');
    lab.run(sim, 0.5, () => { p.jx = 0; p.jy = 1; });
    const mid = eng().dir;
    lab.run(sim, 3, () => { p.jx = 0; p.jy = 1; });
    report(near(eng().dir, PI / 2, 0.05) && eng().up < -0.99 && mid > 0.3 && mid < PI / 2 - 0.1, `stick DOWN: it swings smoothly (${(mid * 57.3).toFixed(0)} degrees after 0.5 s) to straight down (${(eng().dir * 57.3).toFixed(0)}) and pushes her down (${sim.state.forces.vyAcc.toFixed(0)} px/s^2)`);
    lab.run(sim, 4, () => { p.jx = -1; p.jy = 0; });
    report(Math.abs(eng().dir) <= config.ENGINES.SWIVEL_ARC + 0.02 && Math.abs(eng().dir) > config.ENGINES.SWIVEL_ARC - 0.1, `the arc is limited: the stick pushed back stops at ${(eng().dir * 57.3).toFixed(0)} degrees (limit ${(config.ENGINES.SWIVEL_ARC * 57.3).toFixed(0)})`);
    lab.restore();
  }

  // ---- (g) the bots fly the swivel ship for 2 minutes and use the crank
  {
    const parts = await loadBuild('swivel', BUILDS);
    const runs = await Promise.all([1, 2, 3].map((seed) => runBotsim(parts, { map: ['route', 'open', 'network'][seed - 1], minutes: 2, bots: 6, seed })));
    const st = runs.map((r) => r.stats);
    const errors = runs.reduce((n, r) => n + (r.stats ? r.stats.errors : 1), 0);
    const manned = st.reduce((n, s) => n + (s ? s.flight.engineMannedSecs : 0), 0), turned = st.reduce((n, s) => n + (s ? s.flight.engineTurnSecs : 0), 0);
    report(errors === 0 && st.every(Boolean), `the swivel ship flown by 6 bots for 2 minutes on 3 maps: ${errors} errors`);
    report(manned > 0 && turned > 0, `the bots use the swivel: crank manned ${manned.toFixed(0)} s, engine turned ${turned.toFixed(0)} s in all`);
  }
  lab.restore();
  return ok;
}

async function checkForces() {
  const lab = await forceLab();
  const { config, BUILDS, SHIP_LAYOUT, SHIP_BALANCE } = lab;
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const F = config.FORCES, C = BUILDS.classic, deg = (r) => (r * 180 / Math.PI).toFixed(2);
  // A quiet ship: nobody aboard that moves, steam held. Returns { sim, peak (largest tilt in each direction while running) }.
  const watch = (sim, secs, each) => { let hi = 0, lo = 0; lab.run(sim, secs, (i, t) => { if (each) each(i, t); hi = Math.max(hi, sim.state.forces.theta); lo = Math.min(lo, sim.state.forces.theta); }); return { hi, lo }; };
  const hit = (x, y, power) => { const sim = lab.boot(C); lab.run(sim, 2); sim.impact(x, y, power); const w = watch(sim, 2); lab.run(sim, 8); return { ...w, after: sim.state.forces.theta, sim }; };

  // ---- the classic ship is untouched until something pushes her
  { const sim = lab.boot(C); lab.run(sim, 10); report(sim.state.forces.theta === 0 && sim.state.forces.omega === 0 && sim.state.forces.vyAcc === 0, 'a classic ship nobody shoots at sits at exactly 0 tilt from forces (her two forward engines twist nothing)'); }
  // ---- hits kick the part of the ship they strike
  const nose = hit(1500, 250, 2), tail = hit(110, 250, 2), noseLow = hit(1500, 900, 2);
  report(nose.hi > 0.002 && nose.lo > -nose.hi * 0.3, `a hit on the top of the nose tips the nose down (peak ${deg(nose.hi)} degrees)`);
  report(tail.lo < -0.002 && tail.hi < -tail.lo * 0.3, `a hit on the top of the tail lifts the nose (${deg(tail.lo)} degrees)`);
  report(noseLow.lo < -0.002, `a hit on the belly of the nose kicks it up (${deg(noseLow.lo)} degrees)`);
  report(Math.abs(nose.after) < 0.0006 && Math.abs(tail.after) < 0.0006, `she swings back and settles (after 8 s: ${deg(nose.after)} / ${deg(tail.after)} degrees)`);
  { const mid = hit(800, 500, 2); report(Math.max(mid.hi, -mid.lo) < Math.max(nose.hi, -tail.lo) * 0.4, `a hit by her middle hardly twists her (${deg(Math.max(mid.hi, -mid.lo))} degrees against ${deg(nose.hi)})`); }
  { const big = hit(1500, 250, 3); report(Math.max(big.hi, -big.lo) <= (F.MAX_DEG * Math.PI) / 180 + 1e-6, `however hard the blow, the tilt stays inside the cap (${deg(big.hi)} degrees; cap ${F.MAX_DEG}) and the crew-slide limit holds (AIRBORNE.PITCH_STAGGER ${(config.AIR.PITCH_STAGGER * 57.3).toFixed(1)} degrees)`); }
  // a heavier ship is shoved less
  {
    const ps = [...C.map((p) => ({ ...p })), ...Array.from({ length: 10 }, (_, i) => ({ part: 'ballast', p: 'main', x: 700 + i * 40 }))]; // (ten sandbags by her middle: heavier, with the centre of mass about where it was)
    const sim = lab.boot(ps);
    lab.run(sim, 2); sim.impact(1500, 250, 2);
    const w = watch(sim, 2);
    report(w.hi < nose.hi * 0.97, `a heavier ship (+${(lab.balanceOf(ps).mass - lab.balanceOf(C).mass).toFixed(0)} weight in sandbags) is shoved less by the same blow (${deg(w.hi)} degrees against ${deg(nose.hi)})`);
  }
  // ---- FORCES.LIVE off: hits do not twist her
  { config.FORCES.LIVE = false; const off = hit(1500, 250, 2); config.FORCES.LIVE = true; report(off.hi === 0 && off.lo === 0, 'with FORCES.LIVE off a hit twists nothing (the S.5c ship)'); }
  // ---- forces at places: the direction of the twist
  {
    const probe = (x, y, fx, fy, extra = {}) => { const sim = lab.boot(C); lab.run(sim, 1); for (let i = 0; i < 90; i++) { lab.applyForce(sim.state, { x, y, fx, fy, source: 'scrape', ...extra }); lab.run(sim, 1 / 60); } return sim.state.forces.theta; };
    const c = { x: 783, y: 654 };
    report(probe(1500, c.y, 0, -150) < -0.002 && probe(100, c.y, 0, -150) > 0.002, 'a push UP at the nose lifts the nose; the same push at the tail lifts the tail');
    report(probe(c.x, 200, 150, 0) > 0.002 && probe(c.x, 900, 150, 0) < -0.002, 'a push AHEAD high up (the gasbag) tips the nose down, low down (the keel) lifts it');
    report(probe(c.x, 200, 150, 0, { balanced: true }) === 0, 'a "balanced" push (engine thrust held by drag along its line) has no sideways torque');
    { // forcesOf(state): the ship's own body-frame totals (what the pose will integrate), read without changing anything
      const s2 = lab.boot(C);
      lab.run(s2, 1);
      lab.applyForce(s2.state, { x: 1500, y: 654, fx: 30, fy: -100, source: 'scrape' });
      lab.applyForce(s2.state, { x: 100, y: 654, fx: 0, fy: -100, impulse: true, source: 'hit' });
      const tot = lab.forcesOf(s2.state);
      report(tot.fwd === 30 && tot.up === 100 && tot.torque < 0 && tot.spin > 0 && tot.items.length === 2 && s2.state.forces.queue.length === 2, `forcesOf(state) gives the ship's own body-frame totals and changes nothing: ahead ${tot.fwd}, up ${tot.up}, torque ${tot.torque.toFixed(4)} rad/s^2, kick spin ${tot.spin.toFixed(4)} rad/s`);
    }
    report(probe(1500, c.y, 0, -150) < 0 && Math.abs(probe(c.x, c.y, 0, -150)) < Math.abs(probe(1500, c.y, 0, -150)) * 0.15, 'a push through the centre of mass twists nothing');
  }
  // ---- sails: a raised sail's wind pushes high on the mast
  {
    const withSail = (deck, x) => [...C.map((p) => ({ ...p })), { part: 'sail', n: 'Mainsail', p: deck, x }]; // (a mast stood on the deck where the classic ship has room: no slot is free on her crowded decks)
    const flyWith = (parts, hoist, secs = 10) => {
      const sim = lab.boot(parts);
      lab.run(sim, 1);
      for (const s of sim.state.sails) { s.hoist = hoist; s.lowering = hoist === 0; }
      lab.run(sim, secs, () => { for (const s of sim.state.sails) { s.hoist = hoist; s.lowering = false; } });
      return sim;
    };
    const top = withSail('catwalk', 720), nest = withSail('nest', 715);
    report(!!top && !!nest, 'a sail fits on the top deck and on the crow\'s nest');
    if (top && nest) {
      const down = flyWith(top, 0), sTop = flyWith(top, 1), sNest = flyWith(nest, 1);
      report(sTop.state.forces.theta > 0.002 && sTop.state.sailPush > 0.05, `a raised sail on the top deck pushes the nose down (${deg(sTop.state.forces.theta)} degrees, pull ${(sTop.state.sailPush * 100).toFixed(0)}%)`);
      report(sNest.state.forces.theta > sTop.state.forces.theta * 1.15, `a sail up on the crow's nest tips her more (${deg(sNest.state.forces.theta)} degrees against ${deg(sTop.state.forces.theta)}): force times height`);
      report(Math.abs(down.state.forces.theta) < 0.0004, `reefed (hoist 0) she sits level (${deg(down.state.forces.theta)})`);
      { // the sail comes down: she returns
        const sim = flyWith(top, 1, 8);
        for (const s of sim.state.sails) s.lowering = true;
        lab.run(sim, 8, () => { for (const s of sim.state.sails) s.lowering = true; });
        report(Math.abs(sim.state.forces.theta) < 0.0006 && sim.state.sails[0].hoist === 0, `let down again she returns to level (${deg(sim.state.forces.theta)} degrees)`);
      }
      // an engine at the nose pointing up cancels it
      const cancel = flyWith(lab.withEngines(top, { 'Fore Engine': -PI / 4 }), 1);
      report(Math.abs(cancel.state.forces.theta) < Math.abs(sTop.state.forces.theta) * 0.35, `a nose engine pointing up and ahead (45 degrees) cancels the sail's tipping (${deg(sTop.state.forces.theta)} -> ${deg(cancel.state.forces.theta)} degrees)`);
      const { sailPush } = await load('modules/host/forces.js');
      report(sailPush(0.13, true) === sailPush(0.13, false) * config.SAIL.GUST_FORCE, `a gust blows the sail's push up ${config.SAIL.GUST_FORCE} times (SAIL.GUST_FORCE), on top of the gust shove and tearing she already had`);
      const v = lab.validate(top);
      report(v.checks.some((c) => c.group === 'Sails' && /sails up: nose-down/.test(c.text)), 'the validator says what the sail does: "' + ((v.checks.find((c) => c.group === 'Sails' && /nose-down/.test(c.text)) || {}).text || '').slice(0, 150) + '..."');
    }
  }
  // ---- gusts: a push at the bag tips her and she settles; a real Storm Front stays inside the cap
  {
    const sim = lab.boot(C);
    lab.run(sim, 1);
    let hi = 0;
    lab.run(sim, 1.6, () => { lab.applyForce(sim.state, { x: SHIP_LAYOUT.gasbag.cx, y: SHIP_LAYOUT.gasbag.cy, fx: F.GUST_WIND, fy: 0, source: 'gust' }); hi = Math.max(hi, sim.state.forces.theta); });
    lab.run(sim, 8);
    report(hi > 0.003 && Math.abs(sim.state.forces.theta) < 0.0006, `a side gust on the tall gasbag tips her nose down (${deg(hi)} degrees) and she settles back (${deg(sim.state.forces.theta)} after 8 s)`);
    const top = [...C.map((p) => ({ ...p })), { part: 'sail', n: 'Mainsail', p: 'catwalk', x: 720 }];
    const st = lab.boot(top, 'storm');
    st.state.players.b0 = { id: 'b0', bot: true, name: 'Bot', species: config.CREW_SPECIES[0], color: '#fff', x: SHIP_LAYOUT.boarderEntryPoints[0].x, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    let peak = 0, gusts = 0, errs = 0;
    for (let i = 0; i < 150 * 60; i++) { try { for (const s of st.state.sails) if (!s.torn && s.hoist < 1) s.hoist = 1; st.update(1 / 60); } catch (e) { errs++; } peak = Math.max(peak, Math.abs(st.state.forces.theta)); if (st.state.weather && st.state.weather.gusting) gusts++; }
    report(errs === 0 && gusts > 60 && peak > 0.003 && peak <= (F.MAX_DEG * Math.PI) / 180 + 1e-6, `a Storm Front with a sail up (150 s, ${gusts} gust frames): the gusts rock her up to ${deg(peak)} degrees, inside the cap, ${errs} errors`);
  }
  // ---- crew and raiders walking about move the centre of mass (and the way she twists)
  {
    const crew = (x) => (sim) => { const d = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'main'); Object.values(sim.state.players).forEach((q, i) => { q.fall = false; q.fly = false; q.air = false; q.d = d; q.x = x + i * 10; q.y = SHIP_LAYOUT.platforms[d].y; q.conn = null; q.lock = null; }); };
    const sim = lab.boot(C);
    for (let i = 0; i < 6; i++) lab.human(sim, { id: 'c' + i, x: 60, y: 640, d: 3 });
    const place = (x) => crew(x)(sim);
    const at = (x, secs) => { lab.run(sim, secs, () => place(x)); return { pitch: sim.state.balance.restPitch, dx: sim.state.balance.dx, k2: sim.state.balance.k2 }; }; // (the rest trim from her weight: the climb tilt of the unmanned helm would only add noise)
    const stern = at(200, 8), bow = at(1380, 10), back = at(200, 10);
    report(bow.pitch > stern.pitch + 0.006 && Math.abs(back.pitch - stern.pitch) < 0.002, `6 crew walk stern to bow: she tips nose-down (rest trim ${(stern.pitch * 57.3).toFixed(2)} -> ${(bow.pitch * 57.3).toFixed(2)} degrees) and comes back when they return (${(back.pitch * 57.3).toFixed(2)})`);
    report(bow.dx > stern.dx + 20 && bow.k2 > 0, `the live centre of mass moves ${(bow.dx - stern.dx).toFixed(0)} px toward the bow, and the live radius of gyration follows the crowd (k2 ${stern.k2.toFixed(0)} at the stern, ${bow.k2.toFixed(0)} at the bow)`);
    // raiders on deck weigh too
    const main = SHIP_LAYOUT.platforms.findIndex((q) => q.id === 'main');
    const base = lab.boot(C), raided = lab.boot(C);
    for (let i = 0; i < 4; i++) raided.state.boarders.push({ id: 'r' + i, type: 'grunt', name: 'Raider', species: config.CREW_SPECIES[0], color: '#a33', scale: 1, x: 1450, y: 640, d: main, fall: false, hp: 5, hit: 0, cd: 0, windup: 0, face: 1 });
    lab.run(base, 1); lab.run(raided, 1);
    report(raided.state.balance.live > base.state.balance.live + 3, `raiders on deck weigh too: live load ${base.state.balance.live.toFixed(1)} -> ${raided.state.balance.live.toFixed(1)} with 4 at the bow`);
  }
  // ---- the engines' own twist is in the same model (and not a second one)
  {
    const fore = lab.boot(lab.withEngines(C, { 'Fore Engine': -PI / 2 }));
    lab.run(fore, 6);
    report(fore.state.forces.theta < -0.002 && Math.abs(fore.state.forces.torque) > 0, `engine thrust goes through applyForce too: the nose engine pointing up tilts her ${deg(fore.state.forces.theta)} degrees`);
  }
  lab.restore();
  return ok;
}

// ---- B0: the GOLDEN behaviour baseline, the frame-equivalence harness and the pose checks (MOVEMENT.md) --------------------------------------------------
// --snapshot-golden --force   record what the game does today (tools/fixtures/golden.json + golden-table.txt): voyagesim win rate and median minutes (Normal and
//                             Easy, 10 runs), botsim 3 seeds x 3 maps (missions, minutes per mission, hull, kills, wrecks, hauls, blowouts, cave contacts and tows),
//                             the --check-minimum capability table (top speed, climb, dive) and 3 seeded cave runs' contact counts
// --check-golden [--skip-voyage]   re-run all of it and compare, with tolerances: missions and wrecks exact, minutes +-15%, win rate inside a 10-run binomial
//                             band, contacts +-20%, capability +-10%, the rest +-15% (each with a small absolute allowance). Prints a table; exit 1 on a miss.
//                             Re-capture with --snapshot-golden --force when a PLANNED change moves the numbers (fire S.5f/g, engines S.5h, M.1 ...).
// --snapshot-frames --force   record 3-minute traces (botsim --trace) of three maps and the summary noise bands over 5 extra seeds (tools/fixtures/frames/)
// --check-frames              re-run and compare old vs new frame by frame: ship world x/y, hull, kills; the tolerance grows from 1e-6 at t=0 to 2% at 3 min;
//                             and the summaries of seeds 1-3 must sit inside the noise bands. This is the gate once byte-identical output is retired (M.1+).
// --check-pose                unit checks of pose.js / ships.js / the layout-param helpers, then --check-layouts (B1)
const GOLDEN = path.join(root, 'tools', 'fixtures', 'golden.json');
const FRAMES = path.join(root, 'tools', 'fixtures', 'frames');
const nodeOut = (args, env = {}) => new Promise((resolve) => {
  const c = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env } });
  let out = '';
  c.stdout.on('data', (d) => (out += d));
  c.stderr.on('data', (d) => (out += d));
  c.on('close', (code) => resolve({ code, out }));
});
const GOLD_MAPS = ['network', 'route', 'open'];

// voyagesim --runs 10 for one difficulty -> { wins, runs, medianMin }
async function goldVoyage(difficulty) {
  const r = await nodeOut(['tools/voyagesim.mjs', '--runs', '10', '--difficulty', difficulty]);
  const m = r.out.match(/MODE \w+: median ([\d.]+) min .*victory rate (\d+)\/(\d+)/);
  if (!m) throw new Error('voyagesim ' + difficulty + ' gave no MODE line:\n' + r.out.slice(-400));
  return { medianMin: +m[1], wins: +m[2], runs: +m[3] };
}
// one botsim (classic, via --build classic so BUILD_STATS comes with it) -> the numbers the golden keeps
async function goldBotsim({ map, seed, minutes }) {
  const r = await nodeOut(['tools/botsim.mjs', '--build', 'classic', '--bots', '8', '--minutes', String(minutes), '--seed', String(seed), '--map', map]);
  const j = r.out.match(/^BUILD_STATS (.*)$/m);
  if (!j) throw new Error(`botsim ${map} seed ${seed} crashed:\n` + r.out.slice(-400));
  const s = JSON.parse(j[1]);
  const each = r.out.match(/minutes each: ([\d. ]+), average ([\d.]+)/);
  const blow = r.out.match(/blowouts (\d+)/);
  return {
    missions: s.missions, minPerMission: each ? +each[2] : null, hull: s.avgHull, kills: s.kills, wrecks: s.wrecks,
    hauls: s.hauled.ammo + s.hauled.coal + s.hauled.holes + s.hauled.fires, blowouts: blow ? +blow[1] : 0,
    contacts: s.flight.contacts, tows: s.tows, errors: s.errors,
  };
}
// the capability table of --check-minimum (calm sky, helm flat out)
async function goldCaps() {
  const r = await nodeOut(['tools/buildsim.mjs', '--check-minimum', '--caps-only']);
  const m = r.out.match(/^CAPS (.*)$/m);
  if (!m) throw new Error('--check-minimum --caps-only gave no CAPS line:\n' + r.out.slice(-400));
  return JSON.parse(m[1]);
}
async function captureGolden({ skipVoyage = false } = {}) {
  const g = { captured: new Date().toISOString().slice(0, 10), voyage: {}, botsim: {}, caves: {}, caps: null };
  if (!skipVoyage) for (const d of ['normal', 'easy']) g.voyage[d] = await goldVoyage(d);
  const jobs = [];
  for (const map of GOLD_MAPS) for (const seed of [1, 2, 3]) jobs.push(async () => { g.botsim[map + '-' + seed] = await goldBotsim({ map, seed, minutes: 10 }); });
  for (const seed of [11, 12, 13]) jobs.push(async () => { g.caves['network-' + seed] = await goldBotsim({ map: 'network', seed, minutes: 4 }); });
  jobs.push(async () => { g.caps = await goldCaps(); });
  await pool(jobs, 4);
  g.botsim = Object.fromEntries(Object.entries(g.botsim).sort());
  g.caves = Object.fromEntries(Object.entries(g.caves).sort());
  return g;
}
const goldTable = (g) => {
  const L = [];
  L.push('GOLDEN behaviour baseline captured ' + g.captured + ' (node tools/buildsim.mjs --snapshot-golden --force to re-capture)');
  for (const [d, v] of Object.entries(g.voyage || {})) L.push(`voyagesim ${d}: ${v.wins}/${v.runs} victories, median ${v.medianMin} min`);
  L.push('botsim 10 min, 8 bots: run          missions  min/mission   hull  kills wrecks hauls blowouts contacts tows');
  for (const [k, b] of Object.entries(g.botsim)) L.push('  ' + k.padEnd(28) + [b.missions, b.minPerMission == null ? '-' : b.minPerMission.toFixed(1), b.hull, b.kills, b.wrecks, b.hauls, b.blowouts, b.contacts, b.tows].map((v) => String(v).padStart(10)).join(''));
  L.push('cave runs (network, 4 min):  contacts / tows ' + Object.entries(g.caves).map(([k, b]) => `${k} ${b.contacts}/${b.tows}`).join(', '));
  if (g.caps) { L.push('capability px/s (speed climb dive): ' + g.caps.map((c, i) => `step${i + 1} ${Math.round(c.speed)}/${Math.round(c.climb)}/${Math.round(c.dive)}`).join(', ')); }
  return L.join('\n') + '\n';
};
async function snapshotGolden() {
  const g = await captureGolden();
  fs.writeFileSync(GOLDEN, JSON.stringify(g, null, 1) + '\n');
  fs.writeFileSync(path.join(root, 'tools', 'fixtures', 'golden-table.txt'), goldTable(g));
  console.log(goldTable(g));
  console.log('wrote ' + GOLDEN);
}
// tolerance helper: ok when |new-old| <= max(abs, rel * |old|)
const within = (nu, old, rel, abs = 0) => Math.abs(nu - old) <= Math.max(abs, rel * Math.abs(old)) + 1e-9;
async function checkGolden() {
  if (!fs.existsSync(GOLDEN)) { console.log('FAIL no golden: run node tools/buildsim.mjs --snapshot-golden --force first'); return false; }
  const old = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const skipVoyage = has('skip-voyage') || !Object.keys(old.voyage || {}).length;
  const nu = await captureGolden({ skipVoyage });
  let ok = true;
  const rows = [];
  const row = (what, o, n, band, good) => { rows.push({ what, o, n, band, good }); if (!good) ok = false; };
  for (const [d, o] of Object.entries(old.voyage || {})) {
    const n = nu.voyage[d];
    if (!n) { console.log(`SKIP voyagesim ${d}`); continue; }
    const p = Math.min(0.95, Math.max(0.05, o.wins / o.runs)); // (two 10-run samples differ by ~ sqrt(2 n p q); 2 sigma, at least 1 win)
    const band = Math.max(1, Math.ceil(2 * Math.sqrt(2 * o.runs * p * (1 - p))));
    row(`voyage ${d} victories /${o.runs}`, o.wins, n.wins, `+-${band}`, Math.abs(n.wins - o.wins) <= band);
    row(`voyage ${d} median minutes`, o.medianMin, n.medianMin, '+-15%', within(n.medianMin, o.medianMin, 0.15, 0.3));
  }
  const cmp = (set, label) => {
    for (const k of Object.keys(old[set])) {
      const o = old[set][k], n = nu[set][k], tag = `${label} ${k}`;
      row(tag + ' missions', o.missions, n.missions, 'exact', n.missions === o.missions);
      if (o.minPerMission != null || n.minPerMission != null) row(tag + ' min/mission', o.minPerMission, n.minPerMission, '+-15%', o.minPerMission != null && n.minPerMission != null && within(n.minPerMission, o.minPerMission, 0.15, 0.2));
      row(tag + ' wrecks', o.wrecks, n.wrecks, 'exact', n.wrecks === o.wrecks);
      for (const f of ['hull', 'kills', 'hauls']) row(`${tag} ${f}`, o[f], n[f], '+-15%', within(n[f], o[f], 0.15, f === 'hull' ? 2 : 2));
      row(tag + ' blowouts', o.blowouts, n.blowouts, 'exact', n.blowouts === o.blowouts);
      row(tag + ' contacts', o.contacts, n.contacts, '+-20%', within(n.contacts, o.contacts, 0.2, 2));
      row(tag + ' tows', o.tows, n.tows, '+-20%', within(n.tows, o.tows, 0.2, 1));
      row(tag + ' errors', 0, n.errors, 'exact', n.errors === 0);
    }
  };
  cmp('botsim', 'botsim');
  cmp('caves', 'cave');
  (old.caps || []).forEach((o, i) => ['speed', 'climb', 'dive'].forEach((f) => row(`capability step ${i + 1} ${f}`, Math.round(o[f]), Math.round(nu.caps[i][f]), '+-10%', within(nu.caps[i][f], o[f], 0.1, 3))));
  const w = Math.max(...rows.map((r) => r.what.length));
  if (has('verbose') || rows.some((r) => !r.good)) console.log(`${pad('check', w)}  ${pad('golden', 9)} ${pad('now', 9)} ${pad('band', 7)} result`);
  for (const r of rows) if (!r.good || has('verbose')) console.log(`${pad(r.what, w)}  ${pad(r.o == null ? '-' : r.o, 9)} ${pad(r.n == null ? '-' : r.n, 9)} ${pad(r.band, 7)} ${r.good ? 'ok' : 'MISS'}`);
  const bad = rows.filter((r) => !r.good).length;
  console.log(`${bad ? 'FAIL' : 'PASS'} golden: ${rows.length - bad}/${rows.length} within their bands (captured ${old.captured}${skipVoyage ? '; voyagesim skipped' : ''}); add --verbose to list every row`);
  return ok;
}

// ---- frame equivalence ----
const FRAME_RUNS = GOLD_MAPS.map((map) => ({ map, seed: 1 }));
const FRAME_MIN = 3;
const NOISE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8]; // (the 3 golden seeds + 5 extra)
async function traceRun({ map, seed }, file) {
  const r = await nodeOut(['tools/botsim.mjs', '--build', 'classic', '--bots', '8', '--minutes', String(FRAME_MIN), '--seed', String(seed), '--map', map, '--trace', file, '--trace-every', '30']);
  const j = r.out.match(/^BUILD_STATS (.*)$/m);
  if (!j) throw new Error(`botsim ${map} seed ${seed} crashed:\n` + r.out.slice(-400));
  const s = JSON.parse(j[1]);
  return { kills: s.kills, hull: s.avgHull, hauls: s.hauled.ammo + s.hauled.coal + s.hauled.holes + s.hauled.fires, missions: s.missions, wrecks: s.wrecks, contacts: s.flight.contacts, dist: Math.round(s.flight.speed) };
}
const readTrace = (file) => fs.readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => { const c = l.split('\t'); return { step: +c[0], phase: c[1], x: +c[3], y: +c[4], hull: +c[10], kills: +c[12] }; });
async function snapshotFrames() {
  fs.mkdirSync(FRAMES, { recursive: true });
  const summaries = {}, jobs = [];
  for (const r of FRAME_RUNS) jobs.push(async () => { await traceRun(r, path.join(FRAMES, `ref-${r.map}-${r.seed}.tsv`)); });
  for (const map of GOLD_MAPS) for (const seed of NOISE_SEEDS) jobs.push(async () => { (summaries[map] ??= {})[seed] = await traceRun({ map, seed }, path.join(os.tmpdir(), `airship-frames-${process.pid}-${map}-${seed}.tsv`)); });
  await pool(jobs, 4);
  const bands = {};
  for (const map of GOLD_MAPS) {
    bands[map] = {};
    for (const f of ['kills', 'hull', 'hauls', 'missions', 'wrecks', 'contacts']) {
      const v = NOISE_SEEDS.map((s) => summaries[map][s][f]);
      bands[map][f] = { min: Math.min(...v), max: Math.max(...v) };
    }
  }
  fs.writeFileSync(path.join(FRAMES, 'bands.json'), JSON.stringify({ captured: new Date().toISOString().slice(0, 10), seeds: NOISE_SEEDS, minutes: FRAME_MIN, bands, summaries }, null, 1) + '\n');
  console.log('wrote ' + FRAMES + ' (3 reference traces + noise bands over seeds ' + NOISE_SEEDS.join(',') + ')');
  for (const map of GOLD_MAPS) console.log('  ' + map.padEnd(8) + Object.entries(bands[map]).map(([f, b]) => `${f} ${b.min}..${b.max}`).join('  '));
}
async function checkFrames() {
  const bandFile = path.join(FRAMES, 'bands.json');
  if (!fs.existsSync(bandFile)) { console.log('FAIL no frame reference: run node tools/buildsim.mjs --snapshot-frames --force first'); return false; }
  const ref = JSON.parse(fs.readFileSync(bandFile, 'utf8'));
  let ok = true;
  const jobs = [];
  const res = {};
  for (const r of FRAME_RUNS) jobs.push(async () => { const f = path.join(os.tmpdir(), `airship-frames-now-${process.pid}-${r.map}.tsv`); res[r.map] = { sum: await traceRun(r, f), file: f }; });
  await pool(jobs, 3);
  const T = FRAME_MIN * 60 * 60; // steps in the run
  for (const r of FRAME_RUNS) {
    const A = readTrace(path.join(FRAMES, `ref-${r.map}-${r.seed}.tsv`)), B = readTrace(res[r.map].file);
    fs.unlinkSync(res[r.map].file);
    // tolerance (relative to the value, with a floor of 1 so zeros and small counts do not blow up) grows linearly from 1e-6 to 2% over the run
    let first = null, worst = 0, n = Math.min(A.length, B.length);
    for (let i = 0; i < n && !first; i++) {
      const tol = 1e-6 + (0.02 - 1e-6) * (A[i].step / T);
      for (const f of ['x', 'y', 'hull', 'kills']) {
        const e = Math.abs(A[i][f] - B[i][f]) / Math.max(1, Math.abs(A[i][f]));
        worst = Math.max(worst, e / tol);
        if (e > tol) { first = { i, f, a: A[i][f], b: B[i][f], step: A[i].step, tol }; break; }
      }
    }
    const good = !first && A.length === B.length;
    if (!good) ok = false;
    console.log(`${good ? 'PASS' : 'FAIL'} frames ${r.map} seed ${r.seed}: ${n} frames compared (${A.length} reference, ${B.length} now), worst error ${(worst * 100).toFixed(0)}% of the tolerance${first ? `; first miss at step ${first.step} (${(first.step / 3600).toFixed(2)} min): ${first.f} ${first.a} -> ${first.b}, tolerance ${first.tol.toExponential(1)}` : ''}`);
    // the summary of this run must sit inside the noise band of 8 seeds (a quarter of the spread, and 2, as allowance)
    const s = res[r.map].sum;
    const bad = [];
    for (const [f, b] of Object.entries(ref.bands[r.map])) { const pad2 = Math.max(2, 0.25 * (b.max - b.min)); if (s[f] < b.min - pad2 || s[f] > b.max + pad2) bad.push(`${f} ${s[f]} outside ${b.min}..${b.max}`); }
    if (bad.length) ok = false;
    console.log(`${bad.length ? 'FAIL' : 'PASS'} noise bands ${r.map}: ${Object.entries(ref.bands[r.map]).map(([f, b]) => `${f} ${s[f]} in ${b.min}..${b.max}`).join(', ')}${bad.length ? '  <-- ' + bad.join('; ') : ''}`);
  }
  return ok;
}

// ---- pose / ship scaffolding checks ----
async function checkPose() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { createSimulation } = await load('modules/host/simulation.js');
  const { SHIP_LAYOUT, all, one, kindOf, is, hasKind, nearest, deckIndex, isNestDeck, reviveSpot } = await load('shipLayout.js');
  const P = await load('modules/host/pose.js');
  const S = await load('modules/host/ships.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const sim = createSimulation(), st = sim.state;
  sim.castOff();
  for (let i = 0; i < 600; i++) sim.update(1 / 60);
  const ship = S.mainShip(st);
  report(st.ships.length === 1 && ship === st.ships[0] && ship.id === 'player', 'state.ships = [the main ship, id "player"]');
  report(ship.state === st.ship && ship.layout === SHIP_LAYOUT && ship.world === st, 'the main ship wraps state.ship, SHIP_LAYOUT and the host state by reference');
  report(S.shipOf(st, {}) === ship && S.shipOf(st, { ship: 'player' }) === ship && S.shipOf(st, { ship: 'nobody' }) === ship && S.shipOf(st, null) === ship, 'shipOf: no ship / "player" / an unknown id all give the main ship');
  let count = 0; S.eachShip(st, (s, i) => { if (s === ship && i === 0) count++; });
  report(count === 1, 'eachShip visits the one ship');
  const p = ship.pose;
  report(p.x === st.course.dist && p.y === -st.ship.alt && p.f === 1 && p.pitch === (st.ship.pitch || 0) && p.turn === 0 && P.poseOf(ship) === p, `pose reads the old numbers (x ${p.x.toFixed(1)} = course.dist, y ${p.y.toFixed(1)} = -alt, f +1)`);
  const scroll = (await load('modules/host/course.js')).scrollSpeed(st);
  report(p.vx === st.shipVx && p.vy === -(st.ship.vy || 0) && Math.abs(p.vx - scroll) < 40, `pose.vx is the speed she really moved at in the last step (${p.vx.toFixed(1)} px/s; the engines ask ${scroll.toFixed(1)}), vy the climb rate`);
  const fresh = createSimulation();
  report(fresh.state.ships[0].pose.vx === (await load('modules/host/course.js')).scrollSpeed(fresh.state),'before her first step pose.vx is the speed the engines ask');
  let exact = true;
  for (let i = 0; i < 2000; i++) {
    const sx = (Math.random() - 0.5) * 3000, sy = (Math.random() - 0.5) * 3000;
    const w = P.toWorld(ship, sx, sy);
    if (w.x !== sx + st.course.dist || w.y !== sy - st.ship.alt) exact = false;
    const b = P.toShip(ship, w.x, w.y);
    if (b.x !== w.x - st.course.dist || b.y !== w.y + st.ship.alt) exact = false;
    if (P.aimToWorld(ship, sx) !== sx || P.aimToShip(ship, sy) !== sy) exact = false;
  }
  report(exact, 'toWorld / toShip / aimTo* are bit-identical to the old inline arithmetic (2000 random points)');
  const d0 = st.course.dist; p.x = d0 + 5; const moved = st.course.dist === d0 + 5; p.x = d0;
  report(moved && st.course.dist === d0, 'writing pose.x moves course.dist');
  let threw = false; try { p.f = -1; } catch { threw = true; }
  report(threw && p.f === 1, 'pose.f is fixed at +1 until COME ABOUT exists');
  // the mirror maths, on a stand-in ship (f = -1 about midPoint.x = 200)
  const fake = { pose: { x: 1000, y: -50, f: -1 }, layout: { midPoint: { x: 200 } } };
  const fw = P.toWorld(fake, 250, 30), fb = P.toShip(fake, fw.x, fw.y);
  report(fw.x === 1150 && fw.y === -20 && fb.x === 250 && fb.y === 30 && Math.abs(P.aimToWorld(fake, 0) - Math.PI) < 1e-12 && Math.abs(P.aimToShip(fake, P.aimToWorld(fake, 0.7)) - 0.7) < 1e-12, 'a facing-left stand-in ship mirrors about her middle and round-trips');
  // layout-param helpers: the default is the global layout; a second layout is answered on its own
  const L2 = { version: 1, engines: [], stations: [{ n: 'Tiller', kind: 'helm', x: 10, d: 0 }, { n: 'Tiller 2', kind: 'helm', x: 90, d: 0 }], platforms: [{ id: 'main' }], spawnPlatform: 0, boarderEntryPoints: [{ x: 0 }, { x: 50 }] };
  report(all('gun').length === all('gun', SHIP_LAYOUT).length && one('helm') === one('helm', SHIP_LAYOUT) && kindOf('Helm') === kindOf('Helm', SHIP_LAYOUT) && hasKind('engine') === hasKind('engine', SHIP_LAYOUT) && deckIndex('main') === deckIndex('main', SHIP_LAYOUT), 'the layout argument defaults to the global SHIP_LAYOUT');
  report(one('helm', L2).n === 'Tiller' && all('helm', L2).length === 2 && kindOf('Tiller 2', L2) === 'helm' && kindOf('Tiller 2') === undefined && is('Tiller', 'helm', L2) && !hasKind('engine', L2) && hasKind('helm', L2) && nearest('helm', { d: 0, x: 80 }, L2).n === 'Tiller 2' && deckIndex('main', L2) === 0 && !isNestDeck('main', L2) && reviveSpot(L2).d === 0, 'a second layout is answered on its own (and does not leak into the global one)');
  return (await checkLayouts()) && ok;
}

// ---- B.1b: whole SHIP CONTEXTS side by side ----
// Besides ship 0 (a real simulation of the classic ship), three more ships are built in the same module graph from different builds (the four-bag ship, the two-boiler ship, the
// tiny ship with a sail), each with its OWN Layout, Nav, modules, balance, forces, gasbags, sails, engines, airborne surfaces and art bake (a stub canvas). Every system reads its
// ship through the handle it was created with, so each must answer for its own ship and nothing may reach another one or ship 0.
async function checkShipContexts(report) {
  const had = ['window', 'localStorage', 'requestAnimationFrame', 'document'].map((k) => [k, k in globalThis]);
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
  const { config } = await load('config.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const { SHIP_LAYOUT, SHIP_BALANCE, createLayout } = await load('shipLayout.js');
  const { createNav, mainNav } = await load('modules/host/nav.js');
  const { createSimulation } = await load('modules/host/simulation.js');
  const { createModules } = await load('modules/host/modules.js');
  const { createBalance } = await load('modules/host/balance.js');
  const FC = await load('modules/host/forces.js');
  const GB = await load('modules/host/gasBags.js');
  const { createSails } = await load('modules/host/sails.js');
  const { createEngines } = await load('modules/host/engines.js');
  const { createAirborne } = await load('modules/host/airborne.js');
  const { createShipArt } = await load('modules/host/shipArt.js');
  const { mainShip } = await load('modules/host/ships.js');
  const bagsParts = await loadBuild('bags', BUILDS), multiParts = await loadBuild('multi', BUILDS), minParts = await loadBuild('min5', BUILDS);
  const errorsBefore = (globalThis.gameErrors || []).length;

  // ship 0: a real simulation of the classic ship, flown a few seconds
  const sim0 = createSimulation();
  const helm0 = SHIP_LAYOUT.stations.find((s) => s.kind === 'helm');
  sim0.state.players.h = { id: 'h', name: 'Helmsman', species: config.CREW_SPECIES[0], color: '#fff', x: helm0.x, y: SHIP_LAYOUT.platforms[helm0.d].y, d: helm0.d, jx: 0, jy: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm0.n, gas: 0 };
  sim0.castOff();
  for (let i = 0; i < 180; i++) sim0.update(1 / 60);
  const s0 = sim0.state, ship0 = mainShip(s0);
  const snap0 = () => JSON.stringify({ layout: SHIP_LAYOUT, bal: SHIP_BALANCE, balance: s0.balance, bags: s0.bags, ship: { gas: s0.ship.gas, hull: s0.ship.hull }, modules: s0.modules.map((m) => [m.name, m.hp, m.broken]), forces: { q: s0.forces.queue.length, th: s0.forces.theta }, sails: s0.sails, engines: s0.engines.map((e) => e.name), conn: [...mainNav.connScale], ventOpen: s0.ventOpen, guns: Object.keys(s0.GUNS) });
  const before0 = snap0();

  // a ship context from a parts list
  const gunsOf = (L) => Object.fromEntries(Object.entries(L.gunMounts).map(([name, m]) => [name, { bx: m.bx, by: m.by, aim: m.aim, home: m.aim, arc: m.arc, cd: 0, ammo: config.GUNS.START_AMMO, max: config.GUNS.MAX_AMMO, empty: 0, reach: 1 }]));
  const makeCtx = (id, parts) => {
    const layout = createLayout(parts), nav = createNav(layout);
    const body = { alt: 0, speed: 0.3, hull: 100, shake: 0, down: 0, press: 65, fuel: config.BOILER.START_FUEL, gas: config.GAS.START };
    const ship = { id, team: null, layout, nav, state: body, world: null, pose: null };
    const state = { ...s0, ship: body, ships: [ship], players: {}, gasHoles: [], fires: [], breaches: [], boarders: [], sfxQ: [], flashes: [], rings: [], puffs: [], popups: [], ev: { t: 20, warn: 0 }, upgrades: {}, ventOpen: layout.vents.map(() => false), GUNS: gunsOf(layout), bombBay: { bombs: config.BOMBS.START, cd: 0, empty: 0, aim: null }, phase: 'flying', scroll: 0 };
    ship.world = state;
    GB.installBags(state);
    const modules = createModules(ship);
    state.modules = modules.list;
    const balance = createBalance(state);
    const forces = FC.createForces(state);
    const sails = createSails({ state, modules });
    const engines = createEngines({ state, modules });
    const air = createAirborne({ state, puff() {}, phoneFx() {} });
    return { id, layout, nav, ship, state, modules, balance, forces, sails, engines, air };
  };
  const ctxs = [makeCtx('bags', bagsParts), makeCtx('multi', multiParts), makeCtx('tiny', minParts)];
  const by = Object.fromEntries(ctxs.map((c) => [c.id, c]));
  report(ctxs.every((c) => mainShip(c.state) === c.ship && c.ship.layout === c.layout && c.layout !== SHIP_LAYOUT && c.nav !== mainNav && c.nav.layout === c.layout) && snap0() === before0, 'three more ship contexts (four-bag, two-boiler, tiny) were built next to ship 0: each ship handle has its own Layout and Nav, ship 0 is untouched');

  // modules: built from the ship's own layout
  const names = (c) => c.modules.list.map((m) => m.name);
  const wanted = (c) => [...Object.keys(c.layout.gunMounts), ...c.layout.engines.map((e) => e.name), ...(c.layout.sails || []).map((s) => s.n), ...c.layout.stations.filter((s) => s.kind === 'boiler').map((s) => s.n)];
  report(ctxs.every((c) => wanted(c).every((n) => names(c).includes(n)) && c.modules.list.length === new Set(names(c)).size)
    && names(by.multi).includes('Fore Boiler') && !names(by.bags).includes('Fore Boiler') && !s0.modules.some((m) => m.name === 'Fore Boiler')
    && names(by.tiny).length !== s0.modules.length && (by.tiny.layout.sails || []).length > 0 && by.tiny.modules.list.some((m) => m.kind === 'sail') && !s0.modules.some((m) => m.kind === 'sail'),
  `createModules(ship) builds each ship's modules from her own layout (bags ship ${names(by.bags).length}, two-boiler ship ${names(by.multi).length} incl. the Fore Boiler, tiny ship ${names(by.tiny).length} incl. a sail; ship 0 ${s0.modules.length}, with neither the Fore Boiler nor a sail)`);

  // modules and the lift speed go to the ship's own nav
  const liftIdx = (c) => c.layout.connectors.findIndex((q) => q.type === 'lift');
  const conn0 = JSON.stringify(mainNav.connScale), navs = ctxs.map((c) => JSON.stringify(c.nav.connScale));
  const lifted = ctxs.filter((c) => liftIdx(c) >= 0);
  let liftOk = lifted.length >= 2;
  for (const c of lifted) {
    c.modules.damage(c.modules.byName.Lift, 999);
    c.modules.update(c.state, 1 / 60);
    const own = c.nav.connScale[liftIdx(c)] === config.MODULES.UNPOWERED_LIFT;
    const others = ctxs.filter((q) => q !== c).every((q, i) => JSON.stringify(q.nav.connScale) === navs[ctxs.indexOf(q)] || lifted.includes(q));
    liftOk = liftOk && own && others && JSON.stringify(mainNav.connScale) === conn0;
    c.modules.byName.Lift.broken = false; c.modules.byName.Lift.hp = c.modules.byName.Lift.max;
  }
  report(liftOk, `a broken Lift slows only its own ship's lift (${lifted.map((c) => c.id).join(', ')} each in turn; ship 0's nav and the other navs kept their speeds)`);

  // balance, forces
  for (const c of ctxs) c.balance.update(1 / 60);
  const masses = ctxs.map((c) => c.state.balance.mass);
  report(ctxs.every((c) => c.state.balance.mass === c.layout.balance.mass && c.state.balance.comY === c.layout.balance.comY) && s0.balance.mass === SHIP_BALANCE.mass && new Set([...masses, s0.balance.mass]).size === 4,
    `createBalance(state) reads her own static balance (masses ${masses.map((m) => Math.round(m)).join(' / ')} against ship 0's ${Math.round(s0.balance.mass)}: four different ships, four different weights)`);
  report(ctxs.every((c) => FC.pivotOf(c.state).mass === c.layout.balance.mass && FC.pivotOf(c.state).x === c.state.balance.comX) && FC.pivotOf(s0).mass === SHIP_BALANCE.mass, 'forces.js pivotOf(state): every ship turns about her own centre of mass and weighs her own weight');
  const q0 = s0.forces.queue.length;
  let fOk = true;
  for (const c of ctxs) {
    const cx = c.state.balance.comX, cy = c.state.balance.comY;
    FC.applyForce(c.state, { x: cx + 200, y: cy, fx: 0, fy: 100, source: 'engine' });
    FC.applyForce(c.state, { x: cx - 200, y: cy, fx: 0, fy: 100, source: 'engine' });
    const it = FC.forcesOf(c.state).items;
    fOk = fOk && c.state.forces.queue.length === 2 && it[0].torque > 0 && it[1].torque < 0 && Math.abs(it[0].torque + it[1].torque) < 1e-9;
    c.forces.update(1 / 60);
    fOk = fOk && c.state.forces.queue.length === 0;
  }
  report(fOk && s0.forces.queue.length === q0, 'a push ahead of her own centre of mass tips her nose down and one behind it nose up, on each ship (the pivot is hers); the other ships\' force queues did not move');

  // gasbags
  const lx = ctxs.map((c) => GB.liveLiftX(c.state));
  report(by.bags.state.bags.length === 4 && by.multi.state.bags.length === 1 && s0.bags.length === 1 && by.bags.state.bags.every((b, i) => b.w === Math.max(1, by.bags.layout.gasbags[i].lift)), `installBags(state): ${by.bags.state.bags.length} bags on the four-bag ship, 1 on the others, weighted by her own bags' lift`);
  by.bags.state.bags[0].gas = 0;
  const lift0 = JSON.stringify(s0.bags);
  const lxAfter = GB.liveLiftX(by.bags.state);
  report(lx[0] !== null && lxAfter !== null && lxAfter !== lx[0] && lx[1] === null && GB.liveLiftX(s0) === null && by.bags.state.ship.gas < config.GAS.START && lift0 === JSON.stringify(s0.bags), 'liveLiftX / the mean gas follow the ship\'s own bags: a flat tail bag moves the four-bag ship\'s centre of lift, a one-bag ship has none, ship 0\'s bags did not change');
  // sails, engines, airborne surfaces
  for (const c of ctxs) { c.sails.update(1 / 60); c.engines.update(1 / 60); }
  report(ctxs.every((c) => c.state.sails.length === (c.layout.sails || []).length && c.state.engines.length === c.layout.engines.length) && by.tiny.state.sails.length > 0 && s0.sails.length === 0 && by.multi.state.engines.length === by.multi.layout.engines.length,
    `createSails / createEngines mirror their own ship (sails: tiny ${by.tiny.state.sails.length}, others 0; engines: ${ctxs.map((c) => c.state.engines.length).join(' / ')}, ship 0 ${s0.engines.length})`);
  report(ctxs.every((c) => c.air.surfaces().filter((q) => String(q.id).startsWith('ship:')).length === c.layout.platforms.length) && sim0.air.surfaces().filter((q) => String(q.id).startsWith('ship:')).length === SHIP_LAYOUT.platforms.length && by.tiny.layout.platforms.length !== SHIP_LAYOUT.platforms.length,
    `createAirborne lands a flyer on the platforms of the ship she belongs to (${ctxs.map((c) => c.layout.platforms.length).join(' / ')} decks against ship 0's ${SHIP_LAYOUT.platforms.length})`);

  // art: the bake of each ship is her own, keyed on her layout's version
  const canvases = [];
  let owner = null;
  const fnv = (h, s) => { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };
  const fmt = (a) => (typeof a === 'number' ? a.toFixed(2) : typeof a === 'string' ? a : a && a.__id != null ? 'cv' + a.__id : typeof a);
  const stubCtx = (rec) => new Proxy({ imageSmoothingQuality: 'low' }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (k === 'measureText') return (s) => ({ width: String(s).length * 9 });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' || k === 'createConicGradient') return () => ({ addColorStop() {} });
      if (k === 'isPointInPath' || k === 'isPointInStroke') return () => false;
      return (...args) => { rec.n++; rec.h = fnv(rec.h, k + ':' + args.map(fmt).join(',')); };
    },
    set(t, k, v) { t[k] = v; rec.h = fnv(rec.h, k + '=' + fmt(v)); return true; },
  });
  globalThis.document = {
    fonts: { check: () => true },
    createElement: () => {
      const rec = { n: 0, h: 2166136261 };
      const cv = { width: 0, height: 0, __id: owner.made++, owner, rec, getContext: () => (cv.c ||= stubCtx(rec)) };
      owner.canvases.push(cv);
      canvases.push(cv);
      return cv;
    },
  };
  const sprites = new Proxy({}, { get: (t, k) => (k === 'has' ? () => false : () => undefined) });
  const mkArt = (state, ship) => {
    const me = { made: 0, canvases: [], rec: { n: 0, h: 2166136261 }, errs: 0 };
    owner = me;
    me.draw = createShipArt({ ctx: stubCtx(me.rec), state, sprites, ship });
    me.frame = (t) => { owner = me; me.rec.n = 0; me.rec.h = 2166136261; const e0 = (globalThis.gameErrors || []).length; me.draw(t); me.errs += (globalThis.gameErrors || []).length - e0; return me.rec.h; };
    return me;
  };
  const a0 = mkArt(s0, ship0);
  a0.frame(0.5);
  const h0 = a0.frame(0.5), made0 = a0.canvases.length;
  const aBags = mkArt(by.bags.state, by.bags.ship), aTiny = mkArt(by.tiny.state, by.tiny.ship);
  aBags.frame(0.5); aTiny.frame(0.5);
  report(made0 >= 3 && aBags.canvases.length >= made0 + 3 && aTiny.canvases.length >= 3 && aBags.canvases.length > aTiny.canvases.length, `createShipArt(ship) bakes her own layers (ship 0 ${made0} pictures, four-bag ship ${aBags.canvases.length}, tiny ship ${aTiny.canvases.length}: one per bag)`);
  const sizes = (a) => a.canvases.slice(0, 2).map((c) => c.width + 'x' + c.height).join(',');
  report(sizes(a0) !== sizes(aBags) && sizes(aBags) !== sizes(aTiny) && sizes(a0) !== sizes(aTiny), `each bake covers her own hull (back/front pictures ${sizes(a0)} / ${sizes(aBags)} / ${sizes(aTiny)})`);
  const hAfter = a0.frame(0.5);
  report(hAfter === h0 && a0.canvases.length === made0, 'ship 0\'s next frame is exactly the same drawing, with no re-bake, after the other ships were baked and drawn');
  const sizesBags4 = sizes(aBags), sizes0 = sizes(a0), sizesTiny = sizes(aTiny), nTiny = aTiny.canvases.length;
  by.bags.layout.applyBuild(BUILDS.classic);
  GB.syncBags(by.bags.state);
  aBags.frame(0.5); a0.frame(0.5); aTiny.frame(0.5);
  report(sizesBags4 !== sizes(aBags) && sizes(aBags) === sizes0 && sizes(a0) === sizes0 && sizes(aTiny) === sizesTiny && a0.canvases.length === made0 && aTiny.canvases.length === nTiny && by.bags.state.bags.length === 1, 'a new build on the four-bag ship (she became the classic ship) re-bakes HER art because her layout version changed, and fits her bags; ship 0\'s and the tiny ship\'s art kept their bakes');
  report((globalThis.gameErrors || []).length === errorsBefore && a0.errs + aBags.errs + aTiny.errs === 0, 'none of it logged a game error (every read found its own ship)');
  report(snap0() === before0, 'ship 0\'s layout, balance, bags, modules, forces and lift speeds are exactly as before all the other ships were flown');
  for (const [k, was] of had) if (!was) delete globalThis[k];
  void globalThis.document;
}

// ---- B1: one Layout (and one Nav) per ship ----
// Several layout instances live side by side (the classic ship, a copy of it, the four-bag ship, the two-boiler ship and the tiny two-deck ship), and each must answer
// the helpers, the derived tables and the navigation on its OWN, with no cross-talk; applyBuild / onChange on one must never touch another. Also: the exported
// SHIP_LAYOUT / SHIP_BALANCE / onLayoutChange / applyBuild are forwards to ship 0's layout.
async function checkLayouts() {
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const LM = await load('shipLayout.js');
  const { SHIP_LAYOUT, SHIP_BALANCE, createLayout, layoutTables } = LM;
  const { createNav, mainNav } = await load('modules/host/nav.js');
  const S = await load('modules/host/ships.js');
  const G = await load('modules/host/gunship.js');
  const SL = await load('modules/host/searchlight.js');
  const ES = await load('modules/host/escort.js');
  const { config } = await load('config.js');
  let ok = true;
  const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
  const bagsParts = await loadBuild('bags', BUILDS), multiParts = await loadBuild('multi', BUILDS), minParts = await loadBuild('min5', BUILDS);
  const globalBefore = JSON.stringify(SHIP_LAYOUT), balBefore = JSON.stringify(SHIP_BALANCE), versionBefore = SHIP_LAYOUT.version;
  const navDump = (nav, L) => JSON.stringify(L.platforms.flatMap((_, a) => L.platforms.map((__, b) => nav.plan(a, 300, b, 900))));
  const nav0Before = navDump(mainNav, SHIP_LAYOUT);

  // ship 0
  report(SHIP_BALANCE === SHIP_LAYOUT.balance && !Object.keys(SHIP_LAYOUT).includes('balance') && !Object.keys(SHIP_LAYOUT).includes('one'), 'SHIP_BALANCE is ship 0 layout.balance, and the methods and balance are not enumerable (the layout stays pure data)');
  const fakeState = { ship: {}, ships: [] };
  const fakeShip = S.createMainShip(fakeState);
  report(fakeShip.layout === SHIP_LAYOUT && fakeShip.nav === mainNav, 'ships.js: ship 0 has layout === SHIP_LAYOUT and nav === the nav.js mainNav');

  // instances
  const classic2 = createLayout(BUILDS.classic), bags = createLayout(bagsParts), multi = createLayout(multiParts), mini = createLayout(minParts);
  report(firstDiff(plain(classic2), plain(SHIP_LAYOUT)) === null && Object.keys(classic2).join() === Object.keys(SHIP_LAYOUT).join(), 'a second classic Layout instance equals ship 0 (data and key order)');
  report(classic2 !== SHIP_LAYOUT && ['platforms', 'stations', 'connectors', 'engines', 'bounds', 'gunMounts', 'refPoint', 'balance'].every((k) => classic2[k] !== SHIP_LAYOUT[k]), 'it has its own arrays and objects (platforms, stations, bounds, balance ...)');
  report(JSON.stringify(SHIP_LAYOUT) === globalBefore && JSON.stringify(SHIP_BALANCE) === balBefore && SHIP_LAYOUT.version === versionBefore, 'creating four more layouts left ship 0 untouched (layout, balance, version)');
  report(bags.gasbags.length === 4 && SHIP_LAYOUT.gasbags.length === 1 && bags.balance.mass !== SHIP_BALANCE.mass && bags.balance.bagLift !== SHIP_BALANCE.bagLift, `each layout has its own build and balance (bags ship ${bags.gasbags.length} bags, mass ${bags.balance.mass.toFixed(0)}; classic ${SHIP_LAYOUT.gasbags.length} bag, mass ${SHIP_BALANCE.mass.toFixed(0)})`);

  // helpers as methods and as layout-parameter functions
  const mainIdx = (L) => L.deckIndex('main');
  report(SHIP_LAYOUT.all('boiler').length === 1 && multi.all('boiler').length === 2 && classic2.all('boiler').length === 1 && mini.all('boiler').length === 1 && LM.all('boiler', multi).length === 2 && LM.all('boiler').length === 1, 'all(kind): the two-boiler ship has 2, the others 1 (method and layout-argument forms agree, the default is ship 0)');
  report(multi.kindOf('Fore Boiler') === 'boiler' && SHIP_LAYOUT.kindOf('Fore Boiler') === undefined && multi.is('Fore Boiler', 'boiler') && !classic2.is('Fore Boiler', 'boiler') && LM.kindOf('Fore Boiler') === undefined, 'kindOf / is know a name only on the ship that has it (the kind tables are per layout)');
  const at = { d: mainIdx(multi), x: 1100 }, atC = { d: mainIdx(SHIP_LAYOUT), x: 1100 };
  report(multi.nearest('boiler', at).n === 'Fore Boiler' && SHIP_LAYOUT.nearest('boiler', atC).n === one0(SHIP_LAYOUT, 'boiler') && multi.all('lookout').length === 2 && SHIP_LAYOUT.all('lookout').length === 1, 'nearest / one / all pick from this layout only (the Fore Boiler is nearest on the multi ship; ship 0 has just her own)');
  report(mini.deckIndex('main') === 0 && mini.deckIndex('catwalk') === 1 && mini.deckIndex('lower') === 0 && mini.deckIndex('nest') === -1 && SHIP_LAYOUT.deckIndex('nest') >= 0 && SHIP_LAYOUT.deckIndex('lower') !== SHIP_LAYOUT.deckIndex('main'), 'deckIndex: the tiny ship lends its roles (lower = main) and has no nest; the classic ship has them all');
  report(mini.isNestDeck('nest') === false && SHIP_LAYOUT.isNestDeck('nest') === true && SHIP_LAYOUT.reviveSpot().medbay === true && mini.reviveSpot().medbay === false && mini.hasKind('gun') === false && SHIP_LAYOUT.hasKind('gun') === true && mini.hasKind('sail') === true && !SHIP_LAYOUT.hasKind('sail'), 'isNestDeck / reviveSpot / hasKind answer for their own ship (the tiny one: no nest, no medbay, no gun, a sail; the classic one the opposite)');

  // derived tables
  let builds = 0;
  const tables = layoutTables((L) => { builds++; return { decks: L.platforms.length, tag: {} }; });
  const tClassic = tables(SHIP_LAYOUT), tMini = tables(mini);
  report(tClassic.decks === 10 && tMini.decks === 2 && tables() === tClassic && tables(SHIP_LAYOUT) === tClassic && tables(mini) === tMini && builds === 2, 'layoutTables: one table per layout, no argument = ship 0, memoised (2 builds for 5 calls)');
  mini.applyBuild(BUILDS.classic);
  const tMini2 = tables(mini);
  report(tMini2 !== tMini && tMini2.decks === 10 && tables(SHIP_LAYOUT) === tClassic && builds === 3, 'applyBuild on one layout rebuilds only that layout\'s tables');
  mini.applyBuild(minParts);

  // listeners and applyBuild
  const hits = { g: 0, g2: 0, c2: 0, bags: 0, multi: 0, mini: 0 }, got = {};
  const offs = [SHIP_LAYOUT.onChange(() => hits.g++), LM.onLayoutChange(() => hits.g2++), classic2.onChange(() => hits.c2++), bags.onChange((l) => { hits.bags++; got.bags = l; }), multi.onChange(() => hits.multi++), mini.onChange(() => hits.mini++)];
  const bagPlat = bags.platforms, bagVer = bags.version;
  bags.applyBuild(BUILDS.classic);
  report(hits.bags === 1 && got.bags === bags && hits.g + hits.g2 + hits.c2 + hits.multi + hits.mini === 0, 'applyBuild on one layout fires only its own listeners (given that layout), not ship 0\'s or the others\'');
  report(bags.version === bagVer + 1 && SHIP_LAYOUT.version === versionBefore && bags.platforms === bagPlat && bags.gasbags.length === 1 && firstDiff(plain(bags), plain(SHIP_LAYOUT)) === null && bags.balance.mass === SHIP_BALANCE.mass, 'it applied in place (same arrays), bumped only its own version, and now equals the classic ship, balance included');
  report(JSON.stringify(SHIP_LAYOUT) === globalBefore && JSON.stringify(SHIP_BALANCE) === balBefore, 'ship 0 and her balance did not change');
  offs[3]();
  bags.applyBuild(bagsParts);
  report(hits.bags === 1 && bags.gasbags.length === 4, 'the unsubscribe function returned by onChange works');
  classic2.applyBuild(multiParts);
  report(hits.c2 === 1 && hits.g + hits.g2 + hits.bags + hits.multi + hits.mini === 1 && classic2.all('boiler').length === 2 && SHIP_LAYOUT.all('boiler').length === 1, 'the same for another layout; ship 0 still has one boiler');
  classic2.applyBuild(BUILDS.classic);
  SHIP_LAYOUT.applyBuild(BUILDS.classic); // (the same build again: the content stays, the listeners run)
  const plat0 = SHIP_LAYOUT.platforms;
  LM.applyBuild(BUILDS.classic);
  report(hits.g === 2 && hits.g2 === 2 && plat0 === SHIP_LAYOUT.platforms && hits.multi === 0 && hits.mini === 0 && hits.bags === 1, 'the exported applyBuild / onLayoutChange are forwards to ship 0 (both listener styles fire, in place, nobody else notified)');
  const before0 = JSON.parse(globalBefore);
  delete before0.version;
  report(firstDiff(plain(SHIP_LAYOUT), before0) === null, 'ship 0 is still the classic ship');
  for (const off of offs) off();

  // navigation
  const refBelow = (L, x, y) => { let best = null; L.platforms.forEach((p, d) => { if (x >= p.x0 && x <= p.x1 && p.y >= y - 2 && (best === null || p.y < L.platforms[best].y)) best = d; }); return best; };
  const navC2 = createNav(classic2), navBags = createNav(bags), navMini = createNav(mini);
  const mc = mini.connectors[0];
  const WALK = config.MOVE.WALK_SPEED;
  const want = Math.abs(300 - mc.xBottom) / WALK + (mini.platforms[mc.bottom].y - mini.platforms[mc.top].y) / mc.speed + 0.25 + Math.abs(mc.xTop - 700) / WALK;
  const got2 = navMini.plan(mc.bottom, 300, mc.top, 700);
  report(Math.abs(got2.cost - want) < 1e-9 && got2.node >= 0 && navMini.plan(mc.top, 300, mc.bottom, 700).cost < Infinity, `createNav(layout): the tiny ship's one ladder plans correctly (${got2.cost.toFixed(3)} s, expected ${want.toFixed(3)})`);
  report(navDump(navC2, classic2) === nav0Before && navDump(navBags, bags) === navDump(mainNav, SHIP_LAYOUT) && navDump(mainNav, SHIP_LAYOUT) === nav0Before, 'a nav built on a classic-shaped layout plans exactly like ship 0\'s, and ship 0\'s plans did not change');
  report(navMini.connScale.length === 1 && mainNav.connScale.length === 20 && navBags.connScale !== mainNav.connScale, 'each nav has its own connector speed table');
  navMini.connScale[0] = 0.25; navBags.connScale.fill(0.5);
  report(mainNav.connScale.every((v) => v === 1) && navC2.connScale.every((v) => v === 1), 'changing one nav\'s lift speeds does not change the others\'');
  let pb = true;
  for (const [nav, L] of [[mainNav, SHIP_LAYOUT], [navMini, mini], [navBags, bags], [navC2, classic2]]) for (const x of [100, 300, 500, 700, 900, 1100, 1300, 1450]) for (const y of [-500, 100, 400, 700, 1000]) if (nav.platformBelow(x, y) !== refBelow(L, x, y)) pb = false;
  report(pb, 'platformBelow answers from the nav\'s own platforms on all four layouts (96 points each)');
  const wMini = { d: 0, x: 850, y: 0 }, wMain = { d: SHIP_LAYOUT.deckIndex('main'), x: 850, y: 0 };
  for (let i = 0; i < 600; i++) { navMini.moveWalker(wMini, 1, 0, 1 / 60, 300); mainNav.moveWalker(wMain, 1, 0, 1 / 60, 300); }
  report(wMini.x === mini.platforms[0].x1 && wMini.y === mini.platforms[0].y && wMain.x === SHIP_LAYOUT.platforms[wMain.d].x1 && wMain.y === SHIP_LAYOUT.platforms[wMain.d].y && wMini.x !== wMain.x, 'moveWalker clamps to the walker\'s own ship\'s deck (tiny ship ends at ' + wMini.x + ', classic main deck carries on to ' + wMain.x + ')');
  const f1 = { x: 900, y: -200, d: 0 }, f2 = { x: 900, y: -200, d: 0 }; // (x 900 is past the tiny ship's decks: she misses and is dropped back onto HER spawn deck)
  let n1 = 0, n2 = 0;
  while (navMini.fall(f1, 1 / 60, 300) && n1++ < 2000);
  while (mainNav.fall(f2, 1 / 60, 300) && n2++ < 2000);
  report(f1.y === mini.platforms[f1.d].y && f2.y === SHIP_LAYOUT.platforms[f2.d].y && f2.x === 900 && f1.x <= mini.platforms[mini.spawnPlatform].x1 - 30 && f1.x >= mini.platforms[mini.spawnPlatform].x0 + 30, `fall lands on the walker's own ship (the tiny ship misses at x 900 and drops him back on her spawn deck at x ${f1.x}; the classic ship catches him at x ${f2.x})`);
  mini.applyBuild(BUILDS.classic);
  report(navMini.connScale.length === 20 && navMini.connScale.every((v) => v === 1) && navDump(navMini, mini) === nav0Before && navMini.layout === mini, 'a nav rebuilds when ITS layout gets a new build (the tiny ship became the classic one: 20 connectors, same plans)');
  report(mainNav.connScale.length === 20 && navDump(mainNav, SHIP_LAYOUT) === nav0Before, 'and ship 0\'s nav did not');

  // converted systems read their own layout
  const tiny = createLayout(minParts);
  report(G.shipGeom(tiny).MAIN_X1 === tiny.platforms[tiny.deckIndex('main')].x1 && G.shipGeom(SHIP_LAYOUT).MAIN_X1 === SHIP_LAYOUT.platforms[SHIP_LAYOUT.deckIndex('main')].x1 && G.shipGeom(tiny).MAIN_X1 !== G.shipGeom(SHIP_LAYOUT).MAIN_X1 && G.shipGeom(tiny).BOW.x === tiny.platforms[0].x1 + 10 && G.MAIN_X1 === undefined && G.BOW === undefined, 'gunship.js shipGeom(layout): the rope\'s bow point and main deck end are per ship (no ship-0 MAIN_X1 / BOW exports left)');
  report(SL.lightNames(SHIP_LAYOUT).length === 2 && SL.lightNames(tiny).length === 0 && SL.isSearchlight(SL.lightNames(SHIP_LAYOUT)[0]) && !SL.isSearchlight(SL.lightNames(SHIP_LAYOUT)[0], tiny), 'searchlight.js lightNames / isSearchlight are per layout');
  report(ES.isEscortStation('Escort Fighter', SHIP_LAYOUT) && !ES.isEscortStation('Escort Fighter', tiny), 'escort.js isEscortStation is per layout');
  await checkShipContexts(report); // (B.1b: whole ship contexts side by side)
  return ok;
}
const one0 = (L, kind) => L.one(kind).n;

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
} else if (mode === '--check-fire') {
  process.exit((await checkFire()) ? 0 : 1);
} else if (mode === '--check-balance') {
  process.exit((await checkBalance()) ? 0 : 1);
} else if (mode === '--check-minimum') {
  process.exit((await checkMinimum()) ? 0 : 1);
} else if (mode === '--check-arena') {
  const arena = spawnSync(process.execPath, [path.join(root, 'tools', 'arena-check.mjs')], { cwd: root, stdio: 'inherit' });
  process.exit(arena.status === 0 && checkBotsim() ? 0 : 1);
} else if (mode === '--check-two-ships') {
  const run = (args) => spawnSync(process.execPath, [path.join(root, 'tools', 'two-ships-check.mjs'), ...args], { cwd: root, stdio: 'inherit' }).status === 0;
  const bags = run(['--build', 'bags', '--minutes', '2']); // (the classic ship + the four-bag ship: the same decks, another gasbag layout)
  const small = run(['--build', 'min4', '--minutes', '1']); // (the classic ship + the one-deck helm, boiler and two engines: a different Nav, no guns)
  process.exit(bags && small ? 0 : 1);
} else if (mode === '--check-engines') {
  process.exit((await checkEngines()) ? 0 : 1);
} else if (mode === '--check-forces') {
  process.exit((await checkForces()) ? 0 : 1);
} else if (mode === '--check-bags') {
  process.exit((await checkBags()) ? 0 : 1);
} else if (mode === '--build') {
  process.exit((await buildMode(argv[1] || 'classic')) ? 0 : 1);
} else if (mode === '--random') {
  process.exit((await randomMode()) ? 0 : 1);
} else if (mode === '--snapshot-pose-lint') {
  if (argv[1] !== '--force') { console.log('Pass --force to rewrite tools/fixtures/pose-lint-allow.json from the current code (do this only when the counts went DOWN).'); process.exit(2); }
  fs.writeFileSync(POSE_ALLOW, JSON.stringify(poseCounts(path.join(root, 'public')), null, 1) + '\n');
  console.log('wrote ' + POSE_ALLOW);
} else if (mode === '--snapshot-golden') {
  if (argv[1] !== '--force') { console.log('Pass --force to rewrite tools/fixtures/golden.json from the current code (do it when a PLANNED change legitimately moves the numbers).'); process.exit(2); }
  await snapshotGolden();
} else if (mode === '--check-golden') {
  process.exit((await checkGolden()) ? 0 : 1);
} else if (mode === '--snapshot-frames') {
  if (argv[1] !== '--force') { console.log('Pass --force to rewrite tools/fixtures/frames/ from the current code.'); process.exit(2); }
  await snapshotFrames();
} else if (mode === '--check-frames') {
  process.exit((await checkFrames()) ? 0 : 1);
} else if (mode === '--check-pose') {
  process.exit((await checkPose()) ? 0 : 1);
} else if (mode === '--check-layouts') {
  process.exit((await checkLayouts()) ? 0 : 1);
} else if (mode === '--lint-pose') {
  process.exit((await lintPose(path.join(root, 'public'))) ? 0 : 1);
} else if (mode === '--lint') {
  process.exit((await lint(argv[1] ? path.resolve(argv[1]) : path.join(root, 'public'))) ? 0 : 1); // (optional argument: another public/ folder to scan)
} else {
  console.log('node tools/buildsim.mjs --build <name|file> [--bots-check] | --random N [--seed 1 --minutes 4 --envs a,b --bots 6 --out file.json] | --check-classic | --lint | --check-botsim | --check-multi | --check-validator | --check-edit | --check-balance | --check-bags | --check-minimum | --check-fire | --check-arena | --check-two-ships | --snapshot-classic --force');
  process.exit(mode === '--help' || mode === '-h' ? 0 : 2);
}
