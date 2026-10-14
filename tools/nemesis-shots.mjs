// L4 (SHIPS_BOOK.md, The Nemesis) in a real headless Chrome: the lobby's WANTED card, the briefing card ("THE <NAME> IS BACK - SHE REMEMBERS YOU!" with her seal), her arrival banner, the fight, the escape with a vow, the Log line on the scorecard, the postcard ("... is still out there") and the next voyage's first briefing. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). One Chrome page, a crew of bots.
//   node tools/nemesis-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--suffix _x]
// Default DIR is ../3d-screenshots; files are named nemesis_*.png. Exit 1 on any console error or a failed check.
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
const seed = arg('seed', null) == null ? null : Number(arg('seed', 0)) | 0; // (L4 3D follow-up: --seed N picks the captain; in 3D the fight also takes close-ups of her ship, nemesis3d_<name>_*.png)
const SLOW = view === '3d' ? 5 : 1; // (the 3D view runs the headless game several times slower: waits are stretched)
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nemesis-chrome-'));
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
  P.shot = async (name) => { const f = /^nemesis3d_/.test(name) ? name : name.replace(/\.png$/, sfx + '.png'); fs.writeFileSync(path.join(out, f), await P.png()); console.log('  shot ' + f); };
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
  // christen=0: the Book's christening vote never opens (this picture set is about the Nemesis); the crew is four bots.
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0`, 1600, 900, false);
  check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; window.__NM=await import("/modules/host/nemesis.js"); return 1; })()');
  check(await host.ev('__cfg.NEMESIS.ENABLED === true && !!game.state.save.nemesis && !!game.state.save.nemesis.cur'), 'the Nemesis is on in the browser and the Book has a captain for this voyage');
  if (seed != null) await host.ev(`(()=>{ const N = game.state.save.nemesis; N.cur = __NM.makeNemesis(${seed}, N.n || 1, 'shots'); return 1 })()`); // (--seed N: another captain, so the 3D shots show other colours)
  const foeName = await host.ev('game.state.save.nemesis.cur.name');
  console.log('  her name: ' + foeName);
  // A captain the Book remembers (she has met the crew twice), and a flag already won, so the lobby card has both.
  await host.ev(`(()=>{ const N = game.state.save.nemesis; Object.assign(N.cur, { meets: 2, escapes: 1, ours: 1, voyages: 1 }); N.fallen = [{ name: 'The Violet Heron', handle: 'VIOLET HERON', look: __NM.makeNemesis(5, 1).look, meets: 3, date: '2026-10-05', ship: null, stop: 'The Aether' }]; return 1 })()`);
  await host.ev('document.getElementById("bots").click(); 1');
  await sleep(1500);

  // 1. the lobby: the WANTED card under the Ship's Book
  await host.shot('nemesis_1_lobby_tv.png');

  // 2. a stop she is due at: the briefing card ("... IS BACK - SHE REMEMBERS YOU!"), then her arrival banner
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 8000), 'the crew casts off (no christening: ?christen=0)');
  await sleep(800);
  const GATES = '["swarm","imps","bombers","strafers","gunship"]';
  const stopAt = async (col, name) => {
    await host.ev(`(()=>{ game.state.run.nemesis.dueCol = ${col}; game.course.startMission(2, { kind: 'open', environment: 'skyisles', danger: 2, title: 'STOP ${col + 1}: ${name.toUpperCase()} - DESTROY THE OUTPOSTS!', goal: 'DESTROY THE OUTPOSTS', heading: 'STOP ${col + 1}: ${name.toUpperCase()}', stop: { id: '${col}.0', col: ${col}, name: '${name}', gates: ${GATES} } }); return 1 })()`);
  };
  // the voyage's first briefing names her (the Book remembers): a picture of its own, then the card of the stop she is due at
  check(await host.waitFor('!!game.state.briefing && !!game.state.briefing.nemesis && game.state.briefing.nemesis.rumour', 6000), 'the first briefing of the voyage carries the rumour');
  await sleep(300);
  await host.shot('nemesis_2a_rumour_briefing_tv.png');
  check(await host.waitFor('!game.state.briefing', 30000 * SLOW), 'the first briefing is over');
  await stopAt(1, 'Cinder Reach');
  check(await host.waitFor('!!game.state.briefing && !!game.state.briefing.nemesis', 4000), 'the briefing carries her card');
  await host.ev('(()=>{ window.__upd = game.update; game.update = () => {}; return 1 })()'); // (hold the briefing for the picture)
  await sleep(500);
  console.log('  briefing: ' + await host.ev('JSON.stringify(game.state.briefing.nemesis.line + " / " + game.state.briefing.nemesis.sub)'));
  await host.shot('nemesis_2b_intro_briefing_tv.png');
  await host.ev('(()=>{ game.update = window.__upd; return 1 })()');

  // 3. the fight: her arrival banner, then she hunts us with her seal on her health bar
  await host.ev('(()=>{ game.state.tempo.t = 0.01; return 1 })()'); // (the first set piece now)
  let met = await host.waitFor('!!game.state.gunship && !!game.state.gunship.nemesis', 25000 * SLOW);
  for (let k = 0; k < 4 && !met; k++) { await stopAt(1, 'Cinder Reach'); await host.ev('(()=>{ game.state.tempo.t = 0.01; return 1 })()'); met = await host.waitFor('!!game.state.gunship && !!game.state.gunship.nemesis', 25000 * SLOW); }
  check(met, 'the stop\'s gunship set piece is HER');
  await sleep(400);
  // (the picture of her arrival: the banner the game said when she spawned is put back on screen if another banner was ahead of it in the queue)
  await host.ev('(()=>{ const g = game.state.gunship, ev = game.state.ev; if (ev.warnText !== g.nemesis.say.approach) { ev.warn = 0; ev.q.length = 0; game.state.say("setpiece", g.nemesis.say.approach, 6, 4.5); } return 1 })()');
  await sleep(300);
  const banner = await host.ev('game.state.ev.warn > 0 ? game.state.ev.warnText : ""');
  console.log('  banner: ' + banner);
  check(/BACK - SHE REMEMBERS YOU!$/.test(banner), 'one headline: ' + banner);
  await host.shot('nemesis_3_arrival_banner_tv.png');
  check(await host.waitFor('game.state.gunship && game.state.gunship.phase === "hunt"', 60000 * SLOW), 'she closes in and hunts');
  await sleep(2500);
  await host.shot('nemesis_4_fight_tv.png');
  if (view === '3d') { // the 3D follow-up: her ship close up (the game held still): her colours on the bag, her seal on the flank, her name plate under the keel
    const slug = foeName.toLowerCase().replace(/[^a-z]+/g, '');
    check(await host.ev('(()=>{ const m = window.view3dDebug().view; return !!m && !!m.S; })()'), 'the 3D view is reachable for the close-ups');
    await host.ev('(()=>{ window.__upd = game.update; window.__z0 = window.view3dDebug().view.S.zoom; game.update = () => {}; return 1 })()');
    await sleep(400);
    const ZS = [['close', 2.4, 0], ['mid', 1.4, 0]];
    for (const [tag, z, dy] of ZS) {
      await host.ev(`(()=>{ const g = game.state.gunship, S = window.view3dDebug().view.S, sh = g.ship; S.look = { x: sh.pose.x + sh.layout.refPoint.x, y: sh.pose.y + sh.layout.refPoint.y + ${dy} }; S.zoom = ${z}; return 1 })()`);
      await sleep(1500);
      await host.shot(`nemesis3d_${slug}_${tag}.png`);
    }
    console.log('  3D marks: ' + await host.ev('(()=>{ const v = window.view3dDebug().view, st = v.stats ? v.stats() : null; return JSON.stringify(st && { calls: st.calls || st.drawCalls }) })()'));
    await host.ev('(()=>{ const S = window.view3dDebug().view.S; S.look = null; S.zoom = window.__z0; game.update = window.__upd; return 1 })()');
  }

  // 4. beaten: she limps away with a vow
  await host.ev('(()=>{ const g = game.state.gunship; g.ship.state.hull = 20; return 1 })()');
  check(await host.waitFor('game.state.gunship && game.state.gunship.phase === "leaving"', 30000 * SLOW), 'below a third of her hull she runs');
  await sleep(500);
  const esc = await host.ev('game.state.ev.warn > 0 ? game.state.ev.warnText : ""');
  console.log('  banner: ' + esc);
  check(/LIMPS AWAY: "/.test(esc), 'her escape is one headline with a vow');
  await host.shot('nemesis_5_escape_tv.png');

  // 5. the Log: the scorecard line, then the postcard ("... is still out there")
  await host.ev('game.state.course.turrets.forEach(t => { t.dead = true; t.hp = 0 }); 1');
  check(await host.waitFor('!!game.state.course.escape', 20000 * SLOW), 'all outposts down: the escape starts');
  await host.ev('game.state.course.escape.t = 0.2; 1');
  check(await host.waitFor('!!game.state.scorecard', 8000), 'the scorecard comes up');
  await sleep(600);
  const log = await host.ev('game.state.scorecard.log || ""');
  console.log('  log: ' + log);
  check(log.toLowerCase().includes(foeName.toLowerCase()), 'the Log line names her');
  await host.shot('nemesis_6_scorecard_log_tv.png');
  await host.ev('(()=>{ game.state.scorecard = null; game.state.vote = null; game.endRun(true); return 1 })()');
  check(await host.waitFor('!!game.state.runEnd', 5000), 'the run ends');
  await sleep(900);
  check(await host.ev('game.state.runEnd.lines.some(l => /still out there/.test(l.text))'), 'the postcard says she is still out there');
  await host.shot('nemesis_7_postcard_tv.png');
  check(await host.ev('(()=>{ const n = JSON.parse(localStorage.getItem("airshipVoyage")).nemesis; return n.cur && n.cur.meets === 3 && n.cur.escapes === 2 && n.fallen.length === 1 })()'), 'the save keeps her: met 3 times, driven off twice, one flag');

  // 6. the next voyage: the first briefing names her again
  await host.ev('(()=>{ game.restart(); return 1 })()');
  check(await host.waitFor('game.state.phase === "lobby" && !game.state.runEnd', 5000), 'back at the mast');
  await sleep(500);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('!!game.state.briefing && !!game.state.briefing.nemesis', 15000), 'the first briefing of the new voyage names her');
  await host.ev('(()=>{ window.__upd = game.update; game.update = () => {}; return 1 })()');
  await sleep(500);
  console.log('  briefing: ' + await host.ev('JSON.stringify(game.state.briefing.nemesis.line + " / " + game.state.briefing.nemesis.sub)'));
  await host.shot('nemesis_8_still_out_there_tv.png');

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
console.log(failed ? `nemesis-shots: ${failed} FAILED` : 'nemesis-shots: all ok');
process.exit(failed ? 1 : 0);
