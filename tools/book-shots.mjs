// L2 (SHIPS_BOOK.md) in a real headless Chrome: the christening vote (TV and phone), the ceremony (the bottle, the name painted), the name plate in flight, on the scorecard and on the postcard, and the Ship's Book
// (its cover, a voyage's page, the black-bordered page of a lost ship). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages.
//   node tools/book-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--suffix _x]
// Default DIR is ../3d-screenshots; files are named book_*.png. Exit 1 on any console error or a failed check.
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'book-chrome-'));
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
  // christen=1: the phone is a human, so the vote opens by itself (the default); the bots we add vote too.
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0`, 1600, 900, false);
  check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Pilot"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; window.__BK=await import("/modules/host/book.js"); window.__VY=await import("/modules/host/voyage.js"); return 1; })()');
  check(await host.ev('__cfg.BOOK.ENABLED === true && game.state.shipName === null && game.state.save.version === 3'), 'the Book is on in the browser, the TV starts with no ship named (save v3)');
  await host.ev('document.getElementById("bots").click(); 1'); // (a few bots, so the vote has dots)
  await sleep(1500);

  // 1. the lobby: the Ship's Book card
  await host.shot('book_1_lobby_tv.png');

  // 2. CAST OFF: the name vote on the TV and on the phone
  await phone.ev('document.getElementById("rcard").classList.remove("show"); 1'); // (the join card is not what this picture is about)
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('!!game.state.vote && game.state.vote.kind === "name" && game.state.phase === "lobby"', 5000), 'CAST OFF opens the NAME vote (the ship stays moored)');
  await sleep(1800);
  await phone.ev('(()=>{ const b=[...document.querySelectorAll("#vcards button")][2]; b.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); return 1 })()'); // (the phone taps the third name)
  await sleep(900);
  const names = await host.ev('JSON.stringify(game.state.vote.options.map(o=>o.name))');
  console.log('  names: ' + names);
  check(await host.ev('game.state.vote.options.length === 6 && game.state.vote.options[5].kind === "skip"'), 'five names and "Name her later"');
  check(await host.ev('Object.values(game.state.players).find(p=>!p.bot).vote === 2'), 'the phone\'s tap is the human\'s vote');
  await host.shot('book_2_vote_tv.png');
  await phone.shot('book_2_vote_phone.png');
  const phoneCards = await phone.ev('document.querySelectorAll("#vcards button").length');
  check(phoneCards === 6, 'the phone shows six big cards');

  // 3. the ceremony: freeze the clock at three moments (the bottle in flight, the glass, the name painted)
  check(await host.waitFor('!!game.state.christen', 20000), 'the vote closed on a name and the ceremony started');
  const name = await host.ev('game.state.shipName');
  console.log('  her name: ' + name);
  await host.ev('(()=>{ window.__upd = game.update; game.update = () => {}; return 1 })()');
  for (const [tag, e] of [['a_bottle', 0.9], ['b_glass', 1.65], ['c_name', 3.4]]) {
    await host.ev(`(()=>{ const c = game.state.christen; c.t = c.t0 - ${e}; return 1 })()`);
    await sleep(500);
    await host.shot(`book_3${tag}_tv.png`);
  }
  await phone.shot('book_3_phone_toast.png');
  await host.ev('(()=>{ game.update = window.__upd; return 1 })()');
  check(await host.waitFor('game.state.phase === "flying" && !game.state.christen', 20000), 'the ceremony ends and she casts off');
  check(await host.ev('JSON.parse(localStorage.getItem("airshipVoyage")).ship.name === game.state.shipName'), 'her name is in localStorage');
  await sleep(1200);
  await host.shot('book_4_flight_plate_tv.png');

  // 4. the scorecard (a stop cleared)
  await host.ev(`game.course.startMission(2, { kind: 'open', environment: 'skyisles', danger: 2, title: 'STOP 2: TEST', goal: 'DESTROY THE OUTPOSTS', heading: 'STOP 2: TEST', stop: { id: '1.0', col: 1, name: 'Test' } }); 1`);
  await sleep(1500);
  await host.ev('game.state.course.turrets.forEach(t=>{t.dead=true; t.hp=0}); 1');
  check(await host.waitFor('!!game.state.course.escape', 8000), 'all outposts down: the escape starts');
  await host.ev('game.state.course.escape.t = 0.2; 1');
  check(await host.waitFor('!!game.state.scorecard', 8000), 'the scorecard comes up');
  await sleep(600);
  await host.shot('book_5_scorecard_tv.png');

  // 5. the postcard of a victory
  await host.ev('(()=>{ game.state.scorecard = null; game.state.vote = null; game.closeStop("done"); game.endRun(true); return 1 })()');
  check(await host.waitFor('!!game.state.runEnd', 5000), 'the run ends');
  await sleep(900);
  await host.shot('book_6_postcard_tv.png');
  check(await host.ev('game.state.runEnd.shipName === game.state.shipName && JSON.parse(localStorage.getItem("airshipVoyage")).book.length === 1'), 'the postcard carries her name and the voyage is in the book');

  // 6. the Ship's Book: B opens it in the lobby; its cover, then a page
  await host.ev('(()=>{ game.restart(); return 1 })()');
  check(await host.waitFor('game.state.phase === "lobby" && !game.state.runEnd', 5000), 'back at the mast');
  await sleep(600);
  await host.key('b');
  check(await host.waitFor('game.state.bookView.open === true', 3000), 'B opens the Ship\'s Book');
  await sleep(600);
  await host.shot('book_7_cover_tv.png');
  await host.key('ArrowRight');
  await sleep(500);
  check(await host.ev('game.state.bookView.page === 1'), 'the right arrow turns to the crew roster page (L3)');
  await host.key('ArrowRight');
  await sleep(500);
  check(await host.ev('game.state.bookView.page === 2'), 'the right arrow again turns to the first voyage page');
  await host.shot('book_8_page_tv.png');
  await host.key('Escape');
  check(await host.waitFor('game.state.bookView.open === false', 3000) && await host.ev('!game.state.paused && getComputedStyle(document.getElementById("menu")).display === "none"'), 'Esc shuts the book and does not open the pause menu');

  // 7. she is lost: the black-bordered page and the fleet
  await host.ev('(()=>{ game.castOff(); return 1 })()');
  await sleep(800);
  check(await host.ev('game.state.phase === "flying"'), 'the next voyage flies at once (she is named)');
  await host.ev('(()=>{ game.endRun(false); return 1 })()');
  check(await host.waitFor('!!game.state.runEnd', 5000), 'the ship is lost');
  await sleep(1200);
  await host.shot('book_9_postcard_lost_tv.png');
  check(await host.ev('game.state.shipName === null && JSON.parse(localStorage.getItem("airshipVoyage")).fleet.length === 1'), 'a lost ship goes into the fleet; the TV is unnamed again');
  await host.ev('(()=>{ game.restart(); return 1 })()');
  await host.waitFor('game.state.phase === "lobby" && !game.state.runEnd', 5000);
  await sleep(500);
  await host.key('b');
  await sleep(600);
  await host.shot('book_10_cover_memorial_tv.png');
  await host.key('ArrowRight'); // (the crew roster page, L3)
  await sleep(300);
  await host.key('ArrowRight');
  await sleep(500);
  await host.shot('book_11_page_lost_tv.png');
  await host.key('Escape');

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
console.log(failed ? `book-shots: ${failed} FAILED` : 'book-shots: all ok');
process.exit(failed ? 1 : 0);
