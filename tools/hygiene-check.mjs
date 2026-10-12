// CONFIG HYGIENE gate (FUN.md F9 + F11): the tunables that were moved to public/config.js stay there, and the retired switches stay gone. A grep over public/ and tools/, no simulation.
//   node tools/buildsim.mjs --check-hygiene        or directly:   node tools/hygiene-check.mjs
//
// Each rule is { what, re, files, why }: `re` must NOT match any line of the files (comments are skipped unless the rule says so).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'vendor' || e.name === 'fixtures') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(m?js)$/.test(e.name)) out.push(p);
  }
  return out;
};
const rel = (p) => path.relative(root, p).replace(/\\/g, '/');
const all = [...walk(path.join(root, 'public')), ...walk(path.join(root, 'tools'))];
const only = (re) => all.filter((p) => re.test(rel(p)));
const self = 'tools/hygiene-check.mjs';

const RULES = [
  { what: 'supply balloon ammo', re: /gun\.ammo \+ \d/, files: only(/^public\/modules\/host\/simulation\.js$/), why: 'config.PACING.SUPPLY_AMMO' },
  { what: 'fighter spawn band', re: /mid\.y \+ rand\(-?\d/, files: only(/^public\/modules\/host\/threats\.js$/), why: 'config.ENEMY.SPAWN_BAND' },
  { what: 'hull drain by breaches and fires', re: /(breaches\.length|nb|nf) \* 0\.[35]5?\b|fireSys\.load\(\) \* 0\.35|\* 0\.35 \* 2|\* 0\.5 \* 2 \*/, files: [...only(/^public\/modules\/host\/shipSim\.js$/), ...only(/^tools\/(botsim|voyagesim)\.mjs$/)], why: 'config.SHIP.DRAIN' },
  { what: 'raider strike cooldown', re: /\.cd = 1\.5\b/, files: only(/^public\/modules\/host\/raiders\.js$/), why: 'config.RAIDERS.STRIKE_CD' },
  { what: 'bot surge limits', re: /press <= 78|fuel > 25 &&/, files: only(/^public\/modules\/host\/bots\.js$/), why: 'config.BOTS.SURGE_MAX_PRESS / SURGE_MIN_FUEL' },
  { what: 'the NO_STRUCTURE switch', re: /NO_STRUCTURE|STRUCTURE\.ENABLED/, files: all.filter((p) => rel(p) !== self), why: 'STRUCTURE.md WP6: the structure game is the only rule set' },
  { what: 'the legacy last stand', re: /goingDown\.tryStart|\.tryStart\(\)|pumpMul|GOING_DOWN\.(PUMP_MUL|SURVIVE_HULL|HOLD_HULL)/, files: all.filter((p) => rel(p) !== self), why: 'STRUCTURE.md WP6: FALLING is the one rule (goingDown.startFall for the gates)' },
  { what: 'creatures hurting the hull through the shim', re: /sim\.damageHull\(/, files: only(/^public\/modules\/host\/creature(Grip|Breach|Drake|Bird|Breath)\.js$/), why: 'structure.js creatureHit (the segment under the blow)' },
];

let ok = true;
const strip = (line) => line.replace(/\/\/.*$/, ''); // (a rule is about code, not about a comment that says where a number went)
for (const r of RULES) {
  const hits = [];
  for (const f of r.files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => { if (r.re.test(strip(l))) hits.push(`${rel(f)}:${i + 1}`); });
  }
  console.log((hits.length ? 'FAIL ' : 'PASS ') + r.what + (hits.length ? ` - ${hits.slice(0, 4).join(', ')}${hits.length > 4 ? ` (+${hits.length - 4})` : ''} (use ${r.why})` : ` (${r.files.length} file${r.files.length === 1 ? '' : 's'}, now ${r.why})`));
  if (hits.length) ok = false;
}
// the moved numbers are in the config
const cfg = fs.readFileSync(path.join(root, 'public', 'config.js'), 'utf8');
for (const k of ['SUPPLY_AMMO:', 'SPAWN_BAND:', 'DRAIN:', 'STRIKE_CD:', 'SURGE_MAX_PRESS:', 'SURGE_MIN_FUEL:', 'PROFILES:']) {
  const has = cfg.includes(k);
  console.log((has ? 'PASS ' : 'FAIL ') + `config.js has ${k.replace(':', '')}`);
  if (!has) ok = false;
}
console.log(ok ? 'config hygiene: all passed' : 'config hygiene: FAILED');
process.exit(ok ? 0 : 1);
