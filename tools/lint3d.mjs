// The NO-WOBBLE lint for the 3D view (3D.md section 1: no idle sine, only stepped keys; WP7).
//   node tools/lint3d.mjs            exit 0 = clean, 1 = a new sine / cosine of the time was added
//   node tools/buildsim.mjs --check-3d-lint   the same, from the gate runner
// It reads every .js file under public/modules/view3d/ (and the dev page's public/modules/three3d/) and flags a Math.sin( / Math.cos( whose line also mentions the TIME
// (t, time, now, bt, ph, phase, clock, elapsed, age, bob ...), and a GLSL sin( / cos( on a time uniform. Allowed:
//   - anything under view3d/parts3d/ (geometry builders: angles round a ring, never the clock);
//   - a line that carries the comment   // wobble-ok: <why>   (the ship's own slow bob, a foam phase, a dev-page demo);
//   - lines that do not mention the time at all (the angle of a ring, a spray direction: geometry, not motion).
// A sine of the time is the one thing the owner dislikes (wobble); new motion uses stepKey(t, 8) (crewPose.js) and held keys instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRS = ['public/modules/view3d', 'public/modules/three3d'];
const ALLOW_DIRS = ['public/modules/view3d/parts3d/'];
const TIME = /\b(t|tt|time|now|bt|ph|phase|clock|elapsed|age|bob|uTime|simT|seconds|frame|performance)\b/;
const TRIG = /Math\.(sin|cos)\s*\(/;
const GLSL = /\b(sin|cos)\s*\(/;
const GLSL_TIME = /\b(uTime|uT|iTime|time)\b/;

const files = [];
const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const rel = d + '/' + e.name; if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.js')) files.push(rel); } };
for (const d of DIRS) if (fs.existsSync(path.join(root, d))) walk(d);

const bad = [], okd = [];
for (const rel of files) {
  if (ALLOW_DIRS.some((a) => rel.startsWith(a))) continue;
  const lines = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, (m) => (m.includes('wobble-ok:') ? m : '')); // (comments do not count, except the allow mark itself)
    const hit = (TRIG.test(code) && TIME.test(code.replace(/Math\.(sin|cos)\s*\(/g, '('))) || (GLSL.test(code) && GLSL_TIME.test(code));
    if (!hit) return;
    if (line.includes('wobble-ok:')) okd.push(rel + ':' + (i + 1)); else bad.push(rel + ':' + (i + 1) + '  ' + line.trim().slice(0, 150));
  });
}
if (process.argv.includes('--list')) console.log('allowed with // wobble-ok:\n  ' + okd.join('\n  '));
if (bad.length) {
  console.log('3D LINT FAIL: a sine / cosine of the time in the 3D view (add stepped keys instead, or mark a real exception with "// wobble-ok: <why>"):');
  for (const b of bad) console.log('  ' + b);
  process.exit(1);
}
console.log('3D lint pass: no new sine / cosine of the time in ' + files.length + ' files (' + okd.length + ' marked wobble-ok)');
