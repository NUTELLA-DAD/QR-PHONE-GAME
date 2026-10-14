// C.6d (BOSSES.md 2.4), THE RIME WYRM in a real headless Chrome (the 2D view): the cliff cracking, the eruption, the coil, the frozen guns, a hammer on the ice, the open maw with its bomb funnel, the sun in phase 3 and the
// Wyrm collapsing. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). The host page is stepped faster than real time through window.game.
//   node tools/wyrm-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named wyrm_*.png. Exit 1 on any console error or a failed check.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', 'C:/Users/kenny/Downloads/AIRSHIP/airship/3d-screenshots'));
const port = Number(arg('port', 5900 + Math.floor(Math.random() * 90)));
const view = arg('view', '2d');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };
fs.mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); stopServer(); process.exit(2); }
const BASE = `http://localhost:${port}`;
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }

async function openPage(url, W, H) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wyrm-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
  const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: 'ignore' });
  const P = { errors: [] };
  let ws, id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${dport}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { /* not up yet */ }
    if (!target) await sleep(250);
  }
  if (!target) { chrome.kill(); throw new Error('Chrome did not start'); }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    const q = d.params || {};
    if (d.method === 'Runtime.consoleAPICalled' && q.type === 'error') { const t = q.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300); if (!/favicon/.test(t)) P.errors.push('console.error: ' + t); }
    else if (d.method === 'Runtime.exceptionThrown') P.errors.push('EXCEPTION: ' + ((q.exceptionDetails.exception && q.exceptionDetails.exception.description) || q.exceptionDetails.text).slice(0, 400));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); return undefined; }
    return r.result.value;
  };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.shot = async (name) => { fs.writeFileSync(path.join(out, name), await P.png()); console.log('  shot ' + name); };
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(200); } return false; };
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file */ }
  };
  await send('Page.navigate', { url });
  return P;
}

let host = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&creature=wyrm`, 1600, 900);
  check(await host.waitFor('!!window.game && !!document.getElementById("castoff")', 40000), 'the host page is up');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CREATURES.DEV_LAIR === true && __cfg.CREATURES.DEV_LAIR_AS === "wyrm"'), '?creature=wyrm makes every stop the Wyrm\'s lair');
  await host.ev('document.getElementById("bots").click(); document.getElementById("bots").click(); 1');
  await sleep(300);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 30000), 'cast off: flying');
  await host.waitFor('!game.state.briefing', 15000);
  // fast-forward (the page's own loop keeps running; this just adds simulated seconds)
  const run = (secs) => host.ev(`(()=>{ for (let i = 0; i < ${Math.round(secs * 60)}; i++) game.update(1/60); return 1; })()`);
  const runUntil = async (cond, secs = 120, chunk = 0.5) => { for (let t = 0; t < secs; t += chunk) { if (await host.ev(cond)) return true; await run(chunk); } return !!(await host.ev(cond)); };
  // a picture: the sim is held nearly still (state.slow) while the camera settles on it, then it runs on
  const snap = async (name, wait = Number(arg('wait', 14000))) => { await host.ev('game.state.slow = 0.00001; 1'); await sleep(wait); await host.shot(name); await host.ev('game.state.slow = 1; 1'); };
  check(await host.ev('game.state.course.map.creature === "wyrm" && game.state.course.map.cliffs.length === 4'), 'the map is the Wyrm\'s lair with its ice cliffs');
  check(await runUntil('!!game.state.creature', 150), 'the Wyrm stirs under the ice');
  await host.ev('game.state.briefing = null; 1');
  // slow the first eruption down to a clean look at the cracks
  check(await runUntil('game.state.creature.wyrm.mode === "crack" && game.state.creature.wyrm.crack.t > 1.2', 150, 0.25), 'a cliff cracks (the telegraph)');
  await snap('wyrm_cliff_cracking.png');
  check(await runUntil('game.state.creature.wyrm.mode === "out"', 8, 0.1), 'it erupts');
  await run(0.4);
  await snap('wyrm_eruption.png');
  check(await runUntil('game.state.creature.grips.some((g) => g.mode === "hold")', 20, 0.25), 'it coils the hull');
  await run(2.0);
  await snap('wyrm_coil.png');
  const info = await host.ev('(()=>{ const c = game.state.creature, sh = game.state.ships[0]; return JSON.stringify({ kind: c.kind, phase: c.phase, hp: Math.round(c.hp), f: c.f, x: Math.round(c.x), y: Math.round(c.y), shipMid: [Math.round(sh.pose.x + sh.layout.refPoint.x), Math.round(sh.pose.y + sh.layout.refPoint.y)], iced: c.parts.find((p) => p.id === "wyrm").ice.filter((v) => v > 0).length, grip: c.grips.map((g) => [g.mode, +g.left.toFixed(1)]) }); })()');
  console.log('  ' + info);
  // iced guns: the frost breath
  await host.ev('(()=>{ const c = game.state.creature; c.wyrm.breathT = 0; c.ai.breather = 0; return 1; })()');
  check(await runUntil('!!game.state.creature.wyrm.breath && game.state.creature.wyrm.breath.sub === "blow"', 12, 0.1), 'the frost breath blows');
  await snap('wyrm_frost_breath.png');
  await run(1.5);
  check(await host.ev('game.state.icing.some((c) => c.wyrm && c.lvl >= 0.8)'), 'a gun is frozen solid');
  // a hammer on the ice: the bots chip it
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) g.left = Math.max(g.left, 40); return 1; })()');
  const chipping = await runUntil('(()=>{ const p = game.state.creature.parts.find((q) => q.id === "wyrm"); return (p.chip || []).some((j) => j && j.prog > 0.4); })()', 40, 0.25);
  check(chipping, 'a crewman hammers a segment of its ice');
  await snap('wyrm_hammering_ice.png');
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) g.left = Math.max(g.left, 40); return 1; })()');
  await snap('wyrm_iced_guns.png', 6000);
  // let go, then the open maw
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) g.left = 0.01; return 1; })()');
  check(await runUntil('!!game.state.creature.mouthWin', 60, 0.25), 'its maw gapes');
  await run(0.8);
  await snap('wyrm_open_maw.png');
  // phase 3: the sun (the bots are told to leave it alive: only a tow could end it)
  await host.ev('(()=>{ __cfg.CREATURES.FORCE_WIN = "tow"; const c = game.state.creature; c.hp = c.maxHp * 0.3; return 1; })()');
  check(await runUntil('game.state.creature.phase === 3 && !!game.state.creature.wyrm.sun', 90, 0.5), 'phase 3: a shaft of sun breaks through');
  await runUntil('game.state.creature.wyrm.mode === "out" && game.state.creature.wyrm.sub === "idle"', 90, 0.5);
  await snap('wyrm_sun.png');
  await host.ev('(()=>{ __cfg.CREATURES.FORCE_WIN = null; const c = game.state.creature; c.hp = 1; c.hooks.hurtPool(5, "sun"); return 1; })()');
  await run(1.5);
  await snap('wyrm_dying.png', 1500);

  const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `wyrm-shots: ${failed} FAILED` : 'wyrm-shots: all ok');
process.exit(failed ? 1 : 0);
