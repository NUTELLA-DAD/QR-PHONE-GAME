// F3 (FUN.md): THE HELM FOR ONE THUMB in a real headless Chrome: the TV and a phone (812 x 375) on the helm seat - a real pointer drag on the stick pumps and vents, the gas gauge with the hover mark, the one-line hint, the EXPERT HELM toggle on the TV and the SPLIT engine panel it brings.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server.
//   node tools/helm-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named helm_*.png. Exit 1 on any console error or a failed check.
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-chrome-'));
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
  P.send = send;
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
  check(await host.ev('!!document.getElementById("expert") && /easy/.test(document.getElementById("expert").textContent)'), 'the lobby has the Helm: easy button');
  await host.shot('helm_0_lobby_tv.png');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 812, 375, true);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Pilot"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CONTROLS.HELM_V2 === true && __cfg.CONTROLS.EXPERT === false'), 'HELM_V2 on, EXPERT off in the browser');
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 20000), 'cast off');
  // put the phone's player on the helm seat (the bots leave a taken station alone)
  await host.ev(`(()=>{ const p = Object.values(game.state.players).find(q => !q.bot); const A = game.state.ships[0]; const hs = A.layout.one('helm'); Object.assign(p, { lock: hs.n, x: hs.x, y: A.layout.platforms[hs.d].y, d: hs.d, fall: false }); window.__me = p; return 1; })()`);
  check(await phone.waitFor('document.body.classList.contains("helm")', 8000), 'the phone shows the helm controls');
  await sleep(1200);
  const info = await phone.ev('document.getElementById("info").textContent');
  console.log('  info line: ' + info);
  check(/Stick: steer & climb\. Lever: cruise speed\./.test(info || ''), 'the one-line hint');
  check(await phone.ev('document.getElementById("plever").classList.contains("gauge") && document.body.classList.contains("gaugeon")'), 'the pressure lever is a gauge');
  check(await phone.ev('getComputedStyle(document.getElementById("eng")).display === "none"'), 'no SPLIT engine panel in normal mode');
  await phone.shot('helm_1_normal_phone.png');

  // a real drag on the stick: straight up pumps, straight down vents, let go holds
  const pad = JSON.parse(await phone.ev('JSON.stringify((()=>{ const r = document.getElementById("pad").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }; })())'));
  const mouse = (type, x, y) => phone.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await mouse('mousePressed', pad.x, pad.y);
  await mouse('mouseMoved', pad.x, pad.y - pad.r * 0.9);
  await sleep(1500);
  check(await host.ev('game.state.gasValve.input > 0.6'), 'stick up on the phone opens the pump (valve ' + (await host.ev('game.state.gasValve.input.toFixed(2)')) + ')');
  await phone.shot('helm_2_stick_up_phone.png');
  check(await phone.ev('/RISE/.test(document.querySelector("#plever .tag").textContent)'), 'the gauge says RISE');
  await mouse('mouseMoved', pad.x, pad.y + pad.r * 0.9);
  await sleep(2500);
  check(await host.ev('game.state.gasValve.input < -0.6'), 'stick down vents (valve ' + (await host.ev('game.state.gasValve.input.toFixed(2)')) + ')');
  await phone.shot('helm_3_stick_down_phone.png');
  await mouse('mouseReleased', pad.x, pad.y + pad.r * 0.9);
  await sleep(600);
  check(await host.ev('Math.abs(__me.jy) < 0.01'), 'let go: the stick is back in the middle');

  // EXPERT: the toggle on the TV, then the engine panel on the phone
  await host.ev('document.getElementById("expert").click(); 1');
  check(await host.ev('__cfg.CONTROLS.EXPERT === true && /EXPERT/.test(document.getElementById("expert").textContent)'), 'the TV button turns EXPERT on');
  check(await phone.waitFor('getComputedStyle(document.getElementById("eng")).display !== "none"', 8000), 'the SPLIT engine panel shows on the phone');
  await sleep(500);
  await phone.shot('helm_4_expert_phone.png');
  await host.shot('helm_5_expert_tv.png');
  await host.ev('document.getElementById("expert").click(); 1');
  check(await phone.waitFor('getComputedStyle(document.getElementById("eng")).display === "none"', 8000), 'EXPERT off again: the panel goes away');

  // a small phone
  await phone.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 320, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  await phone.shot('helm_6_small_phone.png');

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
console.log(failed ? `helm-shots: ${failed} FAILED` : 'helm-shots: all ok');
process.exit(failed ? 1 : 0);
