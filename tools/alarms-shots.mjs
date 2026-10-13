// F2 (FUN.md): ONE VOICE in a real headless Chrome: a busy banner with the "also" ticker on the TV, the phone with one line (the boarders on its own deck), and FALLING cutting in.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server.
//   node tools/alarms-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named alarms_*.png. Exit 1 on any console error or a failed check.
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

async function openPage(url, W, H, mobile) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dock-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return undefined; }
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
let host = null, phone = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0`, 1600, 900, false);
  check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500); // (the page's modules run after the markup: wait for setup() to fill the form and hang the button)
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Pilot"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.ALARMS.ENABLED === true && typeof game.state.say === "function"'), 'the alarm arbiter is on in the browser (world.say)');

  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 20000), 'cast off: flying');
  await host.waitFor('!game.state.briefing', 10000);
  await sleep(500);
  await host.ev('game.state.alarmClear(); 1');

  // A busy moment: a stop goal on screen, then boarders on the pilot's own deck and two small things behind it.
  const deck = await host.ev('Object.values(game.state.players).find(p=>!p.bot).d');
  await host.ev(`(()=>{ const s = game.state; s.say('objective', 'DESTROY ALL THE OUTPOSTS!', null, 6); s.say('boarders', 'BOARDERS ON THE ' + (game.state.ships[0].layout.platforms[${deck}].name || 'DECK').toUpperCase() + '!', null, 5, { deck: ${deck} }); s.say('fire', 'PRESSURE HIGH - OPEN A VENT!', null, 4, { role: 'boiler' }); s.say('info', 'SCRAP! GET UNDER IT', null, 3); return 1; })()`);
  await sleep(900);
  const shown = await host.ev('game.state.ev.warnText + " | also: " + game.state.ev.q.map(q=>q.text).join(" / ")');
  console.log('  TV: ' + shown);
  check(await host.ev('game.state.ev.warnText === "DESTROY ALL THE OUTPOSTS!" && game.state.ev.q.length === 3 && game.state.ev.q[0].text.startsWith("BOARDERS ON THE")'), 'the TV says the goal and has the next three waiting, the boarders first');
  await host.shot(`alarms_${view}_tv_banner_also.png`);
  const line = await phone.ev('document.getElementById("info").textContent');
  console.log('  phone line: ' + line);
  check(/BOARDERS ON THE/.test(line) && !/PRESSURE|SCRAP|OUTPOSTS/.test(line), 'the phone shows ONE line: the boarders on its own deck (not the goal, the vent or the scrap)');
  await phone.shot(`alarms_${view}_phone_one_line.png`);

  // FALLING cuts in over everything at once
  await host.ev('game.state.say("falling", "FALLING! PATCH THE LEAKS - PUMP - DUMP THE WEIGHT!", null, 4); 1');
  await sleep(300);
  check(await host.ev('/^FALLING/.test(game.state.ev.warnText)'), 'FALLING cut in at once');
  await host.shot(`alarms_${view}_tv_falling.png`);
  await phone.shot(`alarms_${view}_phone_falling.png`);
  const errs = [...host.errors, ...phone.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (phone) await phone.close();
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `alarms-shots: ${failed} FAILED` : 'alarms-shots: all ok');
process.exit(failed ? 1 : 0);
