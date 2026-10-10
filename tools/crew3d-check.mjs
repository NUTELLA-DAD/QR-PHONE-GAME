// CREW v2 (WP7) gate: the 3D crew in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/crew3d-check.mjs [--port N (default: a random one in 4200-4599)] [--quick]      (--quick skips the 30 s host runs)
// Checks (each must print 0 console errors, and the crew numbers must make sense):
//   1. the dev page's crew LINE-UP (every species, the raiders, hurt crew, parachute, hookshot, tumble, ko ...): all figures fit the buffer, 4 crew draw calls
//   2. the KEY STRIP (page 2: the walk, the climb, the jump, the squash, the swing ...)
//   3. host.html?view=3d with 16 bot crew casting off (stations, ladders, coal and shells, ...): 16 figures, <= 6 crew draw calls, the crew's own JS under 2 ms
//   4. host.html?view=3d&versus=1&bots=4 (two ships, team colours)
//   5. the no-wobble lint (tools/lint3d.mjs)
// Screenshots go to a temp folder (printed), not into the repo.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const port = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 4200 + Math.floor(Math.random() * 400));
const quick = argv.includes('--quick');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'crew3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };

const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: argv.includes('--verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/three3d.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }

function shot(name, url, statsJs, extra = []) {
  const args = ['tools/shot3d.mjs', '--url', `http://localhost:${port}/${url}`, '--out', path.join(out, name + '.png'), '--gl', 'default', '--wait', '1500', ...extra];
  if (statsJs) args.push('--stats-js', statsJs);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 240000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  return { text, errs, data };
}

try {
  const SLEEP = (ms) => `await new Promise(r=>setTimeout(r,${ms}));`;
  console.log('1. crew line-up (dev page)');
  let r = shot('lineup', 'three3d.html?shot=1&seed=5&warm=10&lineup=1&bots=2', 'JSON.stringify(window.__t3d.view.stats().crew)');
  console.log('  errors ' + r.errs + '  ' + JSON.stringify(r.data));
  if (r.errs !== 0) fail('console errors in the line-up');
  if (!r.data || r.data.figs < 30 || r.data.overflow !== 0) fail('the line-up did not fit the buffer');
  if (r.data && r.data.calls > 6) fail('more than 6 crew draw calls');

  console.log('2. key strip (dev page, page 2)');
  r = shot('keys', 'three3d.html?shot=1&seed=5&warm=10&lineup=2&bots=2', 'JSON.stringify(window.__t3d.view.stats().crew)');
  console.log('  errors ' + r.errs + '  ' + JSON.stringify(r.data));
  if (r.errs !== 0) fail('console errors in the key strip');
  if (!r.data || r.data.figs < 20) fail('the key strip is missing figures');

  if (!quick) {
    console.log('3. host, 16 bots');
    const host16 = `(async()=>{ const b=document.getElementById('bots'); for(let i=0;i<4;i++) b.click(); ${SLEEP(500)} document.getElementById('castoff').click(); ${SLEEP(30000)} const st=window.view3dDebug().view.stats(); return JSON.stringify({crew:st.crew, sceneCalls:st.sceneCalls, jsMs:st.jsMs, errors:window.gameErrors||[]}); })()`;
    r = shot('host16', 'host.html?view=3d', host16, ['--ready', 'window.__meter!==undefined']);
    console.log('  errors ' + r.errs + '  ' + JSON.stringify(r.data));
    if (r.errs !== 0) fail('console errors in the 16-bot host run');
    if (!r.data || r.data.crew.figs !== 16) fail('expected 16 crew figures');
    if (r.data && r.data.crew.calls > 6) fail('more than 6 crew draw calls');
    if (r.data && r.data.crew.ms > 2) fail('the crew layer took more than 2 ms a frame');
    if (r.data && r.data.errors.length) fail('game errors: ' + r.data.errors.join(' | '));

    console.log('4. host, Versus');
    const vs = `(async()=>{ ${SLEEP(20000)} const st=window.view3dDebug().view.stats(); return JSON.stringify({crew:st.crew, sceneCalls:st.sceneCalls, errors:window.gameErrors||[]}); })()`;
    r = shot('versus', 'host.html?view=3d&versus=1&bots=4', vs, ['--ready', 'window.__meter!==undefined']);
    console.log('  errors ' + r.errs + '  ' + JSON.stringify(r.data));
    if (r.errs !== 0) fail('console errors in Versus');
    if (!r.data || r.data.crew.figs < 4) fail('Versus: too few crew figures');
    if (r.data && r.data.errors.length) fail('game errors: ' + r.data.errors.join(' | '));
  }

  console.log('5. no-wobble lint');
  const l = spawnSync(process.execPath, ['tools/lint3d.mjs'], { cwd: root, encoding: 'utf8' });
  console.log('  ' + l.stdout.trim().split('\n').join('\n  '));
  if (l.status !== 0) fail('the no-wobble lint');
} finally {
  server.kill();
}
console.log(failed ? `\nCREW 3D CHECK FAILED (${failed})  screenshots: ${out}` : `\nCREW 3D CHECK PASSED  screenshots: ${out}`);
process.exit(failed ? 1 : 0);
