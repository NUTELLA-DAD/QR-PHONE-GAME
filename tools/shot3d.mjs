// Screenshots of the 3D test page (public/three3d.html) with headless Chrome over the DevTools protocol. No packages needed (Node 22+ has WebSocket and fetch).
// Usage: node tools/shot3d.mjs --url "http://localhost:3300/three3d.html?tod=night" --out shots/night.png [--size 1920x1080] [--wait 3000] [--eval "window.__t3d.warm(20)"] [--then-wait 1500] [--gl swiftshader|default] [--stats]
// Also: --ready "<js>" (what to wait for; default window.__ready3d === true; host.html needs --ready "window.__meter!==undefined"), --evals '[["js",waitMs],...]' (several steps before the shot),
//       --stats-js "<js>" (extra numbers to print).
// Start your own server first on a free port (PORT=3300 node server.js) and stop it by PID afterwards; never kill node globally.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const url = arg('url'), out = arg('out', 'shot.png');
if (!url) { console.error('need --url'); process.exit(2); }
const [W, H] = arg('size', '1920x1080').split('x').map(Number);
const wait = Number(arg('wait', 3000)), thenWait = Number(arg('then-wait', 1200)), port = Number(arg('port', 9333 + Math.floor(Math.random() * 300)));
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot3d-'));
const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
if (arg('gl', 'swiftshader') === 'swiftshader') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
if (arg('gl') === 'none') { for (const bad of ['--ignore-gpu-blocklist', '--enable-webgl']) flags.splice(flags.indexOf(bad), 1); flags.push('--disable-gpu', '--disable-3d-apis', '--disable-webgl'); } // (no WebGL at all: the 2D fallback test)
const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pending = new Map();
const logs = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { /* not up yet */ }
    if (!target) await sleep(250);
  }
  if (!target) throw new Error('Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
    else if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    else if (d.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + ((d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description) || d.params.exceptionDetails.text).slice(0, 500));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 120; i++) { // wait for the page to draw its first frame
    const r = await send('Runtime.evaluate', { expression: arg('ready', 'window.__ready3d === true'), returnByValue: true });
    if (r.result.value) break;
    await sleep(250);
  }
  await sleep(wait);
  if (arg('eval')) { const r = await send('Runtime.evaluate', { expression: arg('eval'), returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) logs.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); else if (r.result.value !== undefined) logs.push('eval -> ' + JSON.stringify(r.result.value).slice(0, 600)); await sleep(thenWait); }
  if (arg('evals')) for (const [js, ms] of JSON.parse(arg('evals'))) { const r = await send('Runtime.evaluate', { expression: js, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) logs.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); else if (r.result.value !== undefined) logs.push('eval -> ' + JSON.stringify(r.result.value).slice(0, 600)); await sleep(ms || 0); }
  if (arg('stats-js')) { const r = await send('Runtime.evaluate', { expression: arg('stats-js'), returnByValue: true, awaitPromise: true }); logs.push('stats-js ' + JSON.stringify(r.result.value)); }
  if (has('stats')) { const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__stats||null) + " " + JSON.stringify(window.__t3d && window.__t3d.info())', returnByValue: true }); logs.push('stats ' + r.result.value); }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('saved ' + out);
} catch (e) {
  console.error('FAILED: ' + e.message);
  process.exitCode = 1;
} finally {
  const bad = logs.filter((l) => /^(error|EXCEPTION|EVAL ERROR)/.test(l) && !/favicon/.test(l));
  console.log('  console errors: ' + bad.length);
  for (const l of logs.slice(0, 60)) console.log('  [page] ' + l);
  try { ws && ws.close(); } catch { /* closed */ }
  chrome.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* chrome still holds a file: leave it */ }
}
