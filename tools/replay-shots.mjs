// L7 (SHIPS_BOOK.md) in a real headless Chrome: PLAY OF THE MISSION in slow motion (the film with its caption), the awards scorecard and a phone with the award it won. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages.
// A Kraken is staged in the Sunken Sea so the film has something to show; the human phone makes the play.
//   node tools/replay-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--suffix _x]
// Default DIR is ../3d-screenshots; files are named replay_*.png. Exit 1 on any console error or a failed check.
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

let host = null, phone = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&env=sea&kind=open`, 1600, 900, false);
  check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  check(await host.ev('__cfg.REPLAY.ENABLED === true && __cfg.AWARDS.ENABLED === true'), 'L7 is on in the browser');
  await host.ev('window.perfGov && perfGov.setMode("high"); 1'); // (a headless Chrome is slow: the governor would drop to the lowest tier, where the replay is skipped on purpose)
  await host.ev('document.getElementById("bots").click(); 1');
  await sleep(1200);
  await phone.ev('document.getElementById("rcard").classList.remove("show"); 1');
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 10000), 'she casts off (no christening: ?christen=0)');
  await sleep(2000);
  // a Kraken, then the human makes the play
  await host.ev('(()=>{ game.creatures.spawn("kraken"); return 1 })()');
  await sleep(14000);
  const made = await host.ev('(()=>{ const H = Object.values(game.state.players).find(p=>!p.bot); game.moments.moment("creature-win", { who: [H.id], data: { creature: "The Kraken", kind: "kraken", way: "mouth" } }); return !!game.state.creature })()');
  console.log('  the Kraken is ' + (made ? 'in the sky' : 'gone') + ' at the moment');
  await sleep(2600);
  await host.ev('(()=>{ const P = Object.values(game.state.players), H = P.find(p=>!p.bot), B = P.filter(p=>p.bot); H.stats = { coal: 9, kills: 4 }; B[0].stats = { boarding: 3, fires: 2 }; game.state.momentOverboard(B[1]); game.state.momentOverboard(B[1]); return 1 })()');
  check(await host.ev('game.replay.stats().best !== null || game.replay.stats().pending > 0'), 'the recorder has a clip of the moment');
  await host.ev('game.onMarker({ kind: "home", lap: 2 }); 1');
  check(await host.waitFor('!!game.state.scorecard && !!game.state.scorecard.film', 5000), 'the stop ends and the scorecard opens with a film');
  const info = await host.ev('JSON.stringify({ kind: game.state.scorecard.film.clip.kind, len: game.state.scorecard.film.clip.len, frames: game.state.scorecard.film.clip.frames.length, play: game.state.scorecard.play && game.state.scorecard.play.text, rows: game.state.scorecard.rows.map(r=>r.title+":"+r.name), kb: game.replay.stats().bytes/1024 })');
  console.log('  ' + info);
  check(await host.waitFor('game.state.scorecard.film.u > 0.9', 6000), 'the film plays');
  await host.shot('replay_1_film_early_tv.png');
  check(await host.waitFor('game.state.scorecard.film.u > game.state.scorecard.film.clip.mark / game.state.scorecard.film.clip.fps + 0.15', 25000), 'the film reaches the moment');
  await host.shot('replay_2_film_moment_tv.png');
  check(await host.waitFor('game.state.scorecard.film.u > game.state.scorecard.film.clip.len - 0.7', 25000), 'and runs on');
  await host.shot('replay_3_film_late_tv.png');
  const t0 = Date.now();
  check(await host.waitFor('game.state.scorecard.film.done', 10000), 'the film ends by itself');
  console.log('  the film took ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s more after the last shot');
  await sleep(700);
  await host.shot('replay_4_awards_tv.png');
  check(await phone.waitFor('document.getElementById("rcard").classList.contains("show")', 4000), 'the phone shows a card for its award');
  await sleep(300);
  console.log('  phone card: ' + await phone.ev('document.getElementById("rctitle").textContent + " - " + document.getElementById("rctext").textContent'));
  await phone.shot('replay_5_phone_award.png');

  // the second stop: skip with SPACE
  await host.ev('(()=>{ game.state.scorecard = null; game.state.vote = null; game.state.phase = "flying"; return 1 })()');
  await sleep(2500);
  await host.ev('(()=>{ const H = Object.values(game.state.players).find(p=>!p.bot); game.moments.moment("boss-down", { who: [H.id] }); return 1 })()');
  await sleep(2200);
  await host.ev('game.onMarker({ kind: "home", lap: 3 }); 1');
  console.log('  second stop: ' + await host.ev('JSON.stringify({ sc: !!game.state.scorecard, film: !!(game.state.scorecard && game.state.scorecard.film), phase: game.state.phase, vote: !!game.state.vote, rec: game.replay.stats() })'));
  check(await host.waitFor('!!game.state.scorecard && !!game.state.scorecard.film && !game.state.scorecard.film.done', 5000), 'a second stop: a second film');
  await sleep(900);
  await host.ev('window.dispatchEvent(new KeyboardEvent("keydown", { key: " " })); 1');
  check(await host.waitFor('game.state.scorecard && game.state.scorecard.film.skipped && game.state.scorecard.film.done', 3000), 'SPACE skips the replay');

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
console.log(failed ? `replay-shots: ${failed} FAILED` : 'replay-shots: all ok');
process.exit(failed ? 1 : 0);
