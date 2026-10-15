// Replay recorder micro-benchmark (SHIPS_BOOK.md L7): how much main-thread time each way of copying the 3D canvas into a small JPEG costs in a real Chrome on the real graphics card, during a busy fight.
//   node tools/replay-bench.mjs [--gl gpu|swiftshader] [--port N]
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
const gl = arg('gl', 'gpu');
const sfx = arg('suffix', view === '3d' ? '_3d' : '');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'replay-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', ...(gl === 'gpu' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])]; // (--gl gpu: the machine's real graphics card, for the frame-time numbers)
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
  P.key = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ ArrowRight: 39, ArrowLeft: 37, Escape: 27 })[key] || 0 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key }));
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return undefined; }
    return r.result.value;
  };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.shot = async (name) => { const f = name.replace(/\.png$/, sfx + '.png'); fs.writeFileSync(path.join(out, f), await P.png()); console.log('  shot ' + f); };
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
  host = await openPage(`${BASE}/host.html?view=3d&cine=0&christen=0&env=sea&kind=open&bots=8&replaybench=1`, 1600, 900, false);
  await host.waitFor('!!window.game', 40000);
  console.log('  graphics: ' + await host.ev('(()=>{ const g = document.createElement("canvas").getContext("webgl"); const e = g && g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "unknown"; })()'));
  await host.ev('window.perfGov && perfGov.setMode("high"); 1');
  await host.ev('document.getElementById("bots").click(); 1');
  await sleep(1200);
  await host.ev('document.getElementById("castoff").click(); 1');
  console.log('  flying: ' + await host.waitFor('game.state.phase === "flying"', 30000));
  await sleep(3000);
  // A headless Chrome draws as fast as it can (hundreds of frames a second, the card never idle). A TV is held to its refresh rate, so by default the page's frames are paced to --cap (60) a second like a real screen: a hitch that
  // only shows when the card is saturated is not a hitch a player would see. --cap 0 leaves it uncapped.
  if (Number(arg('cap', 60)) > 0) await host.ev(`(() => { const raf = window.requestAnimationFrame.bind(window), every = 1000 / ${Number(arg('cap', 60))}; let lastRun = 0; window.requestAnimationFrame = (cb) => raf(() => { const wait = Math.max(0, every - 1 - (performance.now() - lastRun)); setTimeout(() => raf((t) => { lastRun = performance.now(); cb(t); }), wait); }); return 1; })()`);
  await host.ev('(()=>{ game.creatures.spawn("kraken"); return 1 })()');
  await sleep(6000);
  if (await host.ev('!!window.replayCam')) await host.ev('replayCam.hold = true; 1');
  const code = await (await fetch(BASE + '/modules/host/replayWorker.js').catch(() => ({ text: async () => '' }))).text();
  const res = await host.ev(`(async () => {
    const c3 = document.getElementById('c3d');
    const small = document.createElement('canvas'); small.width = 800; small.height = 450; const sctx = small.getContext('2d', { alpha: false });
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const out = {};
    const run = async (name, fn, n = 45) => {
      let tot = 0, max = 0; const pend = [];
      await frame();
      const w0 = performance.now();
      for (let i = 0; i < n; i++) { await frame(); const t0 = performance.now(); const p = fn(); const dt = performance.now() - t0; tot += dt; max = Math.max(max, dt); pend.push(p); }
      const wall = performance.now() - w0;
      const t1 = performance.now(); await Promise.all(pend);
      out[name] = { mainMs: +(tot / n).toFixed(2), maxMs: +max.toFixed(1), frameMs: +(wall / n).toFixed(2), settleMs: +(performance.now() - t1).toFixed(0) };
    };
    await run('baseline (nothing)', () => null);
    await run('drawImage only', () => { sctx.drawImage(c3, 0, 0, 800, 450); });
    await run('drawImage + toBlob', () => { sctx.drawImage(c3, 0, 0, 800, 450); return new Promise((r) => small.toBlob(r, 'image/jpeg', 0.72)); });
    await run('drawImage + createImageBitmap(small)', () => { sctx.drawImage(c3, 0, 0, 800, 450); return createImageBitmap(small); });
    await run('createImageBitmap(3d canvas, resized)', () => createImageBitmap(c3, { resizeWidth: 800, resizeHeight: 450, resizeQuality: 'low' }));
    const wsrc = ${JSON.stringify(code)};
    if (wsrc) {
      const w = new Worker(URL.createObjectURL(new Blob([wsrc], { type: 'text/javascript' })));
      let id = 0; const waits = new Map();
      w.onmessage = (e) => { const r = waits.get(e.data.id); if (r) { waits.delete(e.data.id); r(e.data.blob ? e.data.blob.size : -1); } };
      await run('drawImage + bitmap + worker encode', () => { sctx.drawImage(c3, 0, 0, 800, 450); return createImageBitmap(small).then((bm) => new Promise((r) => { const i = ++id; waits.set(i, r); w.postMessage({ id: i, bm, q: 0.72 }, [bm]); })); });
      await run('bitmap(3d resized) + worker encode', () => createImageBitmap(c3, { resizeWidth: 800, resizeHeight: 450, resizeQuality: 'low' }).then((bm) => new Promise((r) => { const i = ++id; waits.set(i, r); w.postMessage({ id: i, bm, q: 0.72 }, [bm]); })));
      w.terminate();
    }
    return JSON.stringify(out, null, 1);
  })()`);
  console.log(res);
  // the game's own frame time with the recorder on and off (replayCam.hold), alternating, in the same busy Kraken fight
  const seconds = Number(arg('secs', 6)), rounds = Number(arg('rounds', 3));
  if (arg('fps', null) || arg('w', null)) await host.ev(`(async () => { const { config } = await import('/config.js'); ${arg('fps', null) ? `config.REPLAY.FPS = ${Number(arg('fps'))};` : ''} ${arg('w', null) ? `config.REPLAY.CAP.W = ${Number(arg('w'))};` : ''} return 1; })()`); // (--fps N --w N: try other recorder settings)
  const sample = async (hold) => {
    await host.ev(`replayCam.hold = ${hold === true}; replayCam.debug = ${JSON.stringify(typeof hold === 'string' ? hold : '')}; 1`);
    await sleep(600);
    return JSON.parse(await host.ev(`new Promise((done) => { const gaps = []; let last = 0, t0 = performance.now(); const tick = (now) => { if (last) gaps.push(now - last); last = now; if (performance.now() - t0 < ${seconds * 1000}) requestAnimationFrame(tick); else { gaps.sort((a, b) => a - b); const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length; done(JSON.stringify({ frames: gaps.length, mean, over20: gaps.filter((g) => g >= 20).length / gaps.length, over33: gaps.filter((g) => g >= 33).length / gaps.length, median: gaps[Math.floor(gaps.length / 2)], p95: gaps[Math.floor(gaps.length * 0.95)], p99: gaps[Math.floor(gaps.length * 0.99)], max: gaps[gaps.length - 1], draw: window.__meter ? window.__meter.draw : null, heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null })); } }; requestAnimationFrame(tick); })`));
  };
  const MODES = arg('modes', 'off,draw,bitmap,full').split(','); // off = the recorder held; draw = the copy only; bitmap = the copy and an ImageBitmap; full = the real recorder (worker encoding)
  const rows = Object.fromEntries(MODES.map((m) => [m, []]));
  for (let r = 0; r < rounds; r++) for (const m of MODES) rows[m].push(await sample(m === 'off' ? true : m === 'full' ? false : m));
  const med = (list, k) => { const v = list.map((x) => x[k] || 0).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  console.log('frame time over ' + rounds + ' x ' + seconds + ' s windows, recorder held (off) vs running, interleaved; medians of the windows (ms; draw = the game\'s own draw time):');
  for (const k of MODES) console.log('  ' + k.padEnd(6) + ' median frame ' + med(rows[k], 'median').toFixed(2) + '  mean ' + med(rows[k], 'mean').toFixed(2) + '  p95 ' + med(rows[k], 'p95').toFixed(2) + '  p99 ' + med(rows[k], 'p99').toFixed(2) + '  frames >=20 ms ' + (100 * med(rows[k], 'over20')).toFixed(1) + '%  >=33 ms ' + (100 * med(rows[k], 'over33')).toFixed(1) + '%  worst ' + Math.max(...rows[k].map((x) => x.max)).toFixed(0) + '  draw ' + med(rows[k], 'draw').toFixed(2) + '  js heap ' + med(rows[k], 'heapMB').toFixed(0) + ' MB');
  console.log('  recorder: ' + await host.ev('JSON.stringify(replayCam.stats())'));
  console.log('  recorder memory: ' + await host.ev('JSON.stringify(game.replay.stats())'));
} catch (e) {
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (host) await host.close();
  stopServer();
}
process.exit(0);
