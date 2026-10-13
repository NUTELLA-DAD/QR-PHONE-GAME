// F6 (FUN.md): the stop shape and the 60-second dock in a real headless Chrome: the BRIEFING card (TV and phone toast), the ESCAPE banner, the scorecard and the 3-card dock (the Yard's blueprint screen and the plain
// cards, TV and phone). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server.
//   node tools/dock-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named dock_*.png. Exit 1 on any console error or a failed check.
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
  check(await host.ev('__cfg.SHOP.V2 === true && __cfg.STOP_SHAPE.BRIEFING.ENABLED === true'), 'F6 flags are on in the browser');

  // 1. the BRIEFING card: cast off, then the card and the phone's toast
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying" && !!game.state.briefing', 20000), 'cast off: the briefing starts with the first flight step');
  await sleep(700);
  check(await host.ev('!!game.state.briefing'), 'the briefing is still up after 0.7 s');
  await host.shot('dock_1_briefing_tv.png');
  await phone.shot('dock_1_briefing_phone.png');
  const toast = await phone.ev('(()=>{ const t=document.getElementById("toast"); return t && t.style.display!=="none" ? t.textContent : "" })()');
  console.log('  phone toast: ' + toast);
  check(/YOUR JOB: /.test(toast || ''), 'the phone toast carries the goal and the verb of the nearest seat');
  await sleep(3400);
  check(await host.ev('!game.state.briefing'), 'the briefing is gone after about 3 s');

  // 2. the ESCAPE: an outpost raid with every gun dead
  await host.ev(`game.course.startMission(2, { kind: 'open', environment: 'skyisles', danger: 2, title: 'STOP 2: TEST', goal: 'DESTROY THE OUTPOSTS', heading: 'STOP 2: TEST', stop: { id: '1.0', col: 1, name: 'Test' } }); 1`);
  await sleep(1500);
  await host.ev('game.state.course.turrets.forEach(t=>{t.dead=true; t.hp=0}); 1');
  check(await host.waitFor('!!game.state.course.escape && game.state.tempo.phase === "escape"', 8000), 'all outposts down: the escape starts (tempo.phase "escape")');
  await sleep(900);
  await host.shot('dock_2_escape_tv.png');
  check(await host.ev('game.state.tempo.rate === 0 && game.state.ev.warnText === __cfg.STOP_SHAPE.ESCAPE.TEXT'), 'rate 0 and the banner says ' + (await host.ev('__cfg.STOP_SHAPE.ESCAPE.TEXT')));

  // 3. the scorecard (the escape timer cut short)
  await host.ev('game.state.course.escape.t = 0.2; 1');
  check(await host.waitFor('!!game.state.scorecard', 5000), 'the escape ends in the scorecard');
  await sleep(500);
  await host.shot('dock_3_scorecard_tv.png');

  // 4. the dock with a Yard part card (the blueprint screen), then without
  for (const [tag, partChance] of [['yard', 1], ['plain', 0]]) {
    await host.ev(`(async()=>{ __cfg.SHOP.V2_PART_CHANCE = ${partChance}; game.state.scorecard = null; game.state.vote = null; game.state.run.salvage = 420; game.state.ship.hull = 52; game.state.ship.fuel = 20; game.startDock(); return 1 })()`);
    check(await host.waitFor('!!game.state.vote && game.state.vote.kind === "dock"', 5000), `the ${tag} dock opens`);
    const cards = await host.ev('JSON.stringify(game.state.vote.options.map(o => o.id + " " + o.cost))');
    console.log('  cards: ' + cards);
    check(await host.ev(`game.state.vote.options.length === 3 && game.state.vote.options[0].id === "mend-her" && game.state.vote.options[2].kind === "cast" && ${partChance ? 'game.state.vote.options[1].kind === "part"' : 'game.state.vote.options[1].kind === "upgrade"'}`), `${tag} dock: MEND HER, ${partChance ? 'a Yard part' : 'a fitting'}, Cast off`);
    await sleep(1200);
    await host.shot(`dock_4_${tag}_tv.png`);
    await phone.shot(`dock_4_${tag}_phone.png`);
  }
  // the route vote
  await host.ev('(()=>{ game.state.vote = null; game.state.vote = null; 1 })()');
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
console.log(failed ? `dock-shots: ${failed} FAILED` : 'dock-shots: all ok');
process.exit(failed ? 1 : 0);
