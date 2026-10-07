// Ship-building checks (Phase S). Headless, no browser.
// Usage: node tools/buildsim.mjs --check-classic    the classic ship must still equal the frozen snapshot
//        node tools/buildsim.mjs --lint             no module-level captures of derived layout values (they go stale)
//        node tools/buildsim.mjs --check-botsim     the 9 seeded botsim runs must match tools/fixtures/botsim-baseline.txt
//        node tools/buildsim.mjs --check-multi      S.3: the scratch multi-instance build (2 boilers, 2 lookouts) validates and botsims clean
//        node tools/buildsim.mjs --snapshot-classic --force   (S.0 only) rewrite tools/fixtures/classic-layout.json
// Exit code 1 on any failure.
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
  const { BUILDS, buildLayout, validate } = await load('modules/host/shipBuild.js');
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
  const v = validate(BUILDS.classic);
  report(v.ok, 'validate(BUILDS.classic)' + (v.ok ? '' : ': ' + v.fails.join('; ')));
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
  const { BUILDS, buildLayout, validate } = await load('modules/host/shipBuild.js');
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
  console.log(bad ? `FAIL lint: ${bad} capture(s)` : 'PASS lint: no module-level captures of derived layout values');
  return !bad;
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
} else if (mode === '--lint') {
  process.exit((await lint(argv[1] ? path.resolve(argv[1]) : path.join(root, 'public'))) ? 0 : 1); // (optional argument: another public/ folder to scan)
} else {
  console.log('node tools/buildsim.mjs --check-classic | --lint | --check-botsim | --check-multi | --snapshot-classic --force');
  process.exit(mode === '--help' || mode === '-h' ? 0 : 2);
}
