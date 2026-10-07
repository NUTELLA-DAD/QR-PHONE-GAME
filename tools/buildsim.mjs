// Ship-building checks (Phase S). Headless, no browser.
// Usage: node tools/buildsim.mjs --check-classic    the classic ship must still equal the frozen snapshot
//        node tools/buildsim.mjs --snapshot-classic  (S.0 only) write tools/fixtures/classic-layout.json from the layout file
// Exit code 1 on any failure.
import { pathToFileURL } from 'node:url';
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
  return ok;
}

const mode = argv[0];
if (mode === '--snapshot-classic') {
  const { SHIP_LAYOUT } = await load('shipLayout.js');
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
  fs.writeFileSync(FIXTURE, JSON.stringify(plain(SHIP_LAYOUT), null, 1) + '\n');
  console.log('wrote ' + FIXTURE);
} else if (mode === '--check-classic') {
  process.exit((await checkClassic()) ? 0 : 1);
} else {
  console.log('node tools/buildsim.mjs --check-classic | --snapshot-classic');
  process.exit(mode === '--help' || mode === '-h' ? 0 : 2);
}
