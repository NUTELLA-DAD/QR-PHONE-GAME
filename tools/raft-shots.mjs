// PLAYTEST1.md P5, THE RAFT in a real headless Chrome (3D by default): the raft at cast off with her two gift frames, the crew carrying scrap to them (the phone's BUILD ENGINE POD button), NEW: ENGINE POD,
// stripping the first wreck of the Breaker's Yard, dock 1 with the hull bay card (and the phone's dock), and the grown ship at stop 2. Starts its OWN server on a free port and stops it by its PID at the end
// (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise), so every picture is the same each time.
//   node tools/raft-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named raft_<view>_*.png. Exit 1 on any console error or a failed check.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', 'C:/Users/kenny/Downloads/AIRSHIP/airship/3d-screenshots'));
const port = Number(arg('port', 6300 + Math.floor(Math.random() * 300)));
const view = arg('view', '3d');
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
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261014);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'raft-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
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
  const isFav = (s) => /favicon|navigator.vibrate/.test(s || ''); // (a headless phone has had no tap: the browser blocks its buzz)
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    const q = d.params || {};
    if (d.method === 'Runtime.consoleAPICalled') {
      const text = q.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400);
      if (q.type === 'error' && !isFav(text)) P.errors.push('console.error: ' + text);
      else if (q.type === 'warning' && /^(view3d |3D view problem|3D view stopped)/.test(text)) P.errors.push(text);
    } else if (d.method === 'Runtime.exceptionThrown') P.errors.push('EXCEPTION: ' + ((q.exceptionDetails.exception && q.exceptionDetails.exception.description) || q.exceptionDetails.text).slice(0, 500));
    else if (d.method === 'Log.entryAdded') { if (q.entry.level === 'error' && !isFav(q.entry.url) && !isFav(q.entry.text)) P.errors.push('log: ' + q.entry.text.slice(0, 200)); }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  if (frozen) await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED + FREEZE });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500)); return undefined; }
    return r.result.value;
  };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.shot = async (name) => { fs.writeFileSync(path.join(out, name), await P.png()); console.log('  shot ' + name); };
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(250); } return false; };
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file: leave it */ }
  };
  await send('Page.navigate', { url });
  return P;
}


// In the host page: helpers that hold the ship where a shot wants her while the sim is stepped by hand.
const PRE = `
window.__a = {
  hold: null, track: null, hover: 600, // (hover = config.DERELICT.HOVER_REF)
  st: () => window.game.state,
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  park(x, y) { this.hold = { x, y }; this.track = null; this.pin(); },
  over(d) { this.track = d; this.pin(); }, // hover over a wreck, drifting with it
  pin() {
    const st = window.game.state, sh = st.ships[0], R = sh.layout.refPoint;
    if (this.track) this.hold = { x: this.track.x, y: this.track.y - this.hover };
    if (!this.hold) return;
    sh.pose.x = this.hold.x - R.x; sh.pose.y = this.hold.y - R.y; sh.pose.vy = 0; sh.pose.f = 1; st.ship.speed = 0; st.ship.order = 0; st.ship.hull = 100;
  },
  step(n) { for (let i = 0; i < n; i++) { this.pin(); window.__upd(1/60); } },
  me() { return Object.values(window.game.state.players).find((q) => !q.bot); },
  bots() { return Object.values(window.game.state.players).filter((q) => q.bot); },
  der() { return window.game.state.away.der; },
  vote(i) { for (const q of Object.values(window.game.state.players)) { q.vote = i; q.voteAt = 1e9; } },
  stand(p, d, dx) { // on the wreck's deck at dx from its middle, as a landing makes him
    p.fall = false; p.fly = true; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.koGrace = 0; p.carry = null; p.hearts = 3;
    p.on = { away: true, mode: 'walk', deck: d.deck, gy: d.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0, lx: dx };
    p.x = d.x + dx; p.y = d.y; p.jx = p.jy = 0;
  },
  async settle(n = 60) { for (let i = 0; i < n; i++) await this.frame(); },
};
`;

let host = null, phone = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&tier=medium&cine=0&christen=0&ship=raft`, 1600, 900, false, true);
  check(await host.waitFor('window.__meter!==undefined', 60000), 'the host page is up');
  await host.ev(PRE);
  const zoom3d = (z) => host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.zoom = ' + z + '); 1'); // (the 3D camera's own zoom; the 2D view frames itself)
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true, false);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev(`(async()=>{ const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('bots').click(); await sl(300); document.getElementById('castoff').click(); window.__step(120); await sl(300); return 1 })()`);
  check(await host.ev('game.state.phase === "flying"'), 'cast off');
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)
  const S = (expr) => host.ev(expr);

  // ---- 1. the raft at cast off, with its two frames ----
  check(await S('game.state.ships[0].buildId === "raft" && game.state.run.raft'), 'the ship is the raft');
  check(await S('game.state.run.frames.length === 2 && game.state.run.frames.map(f => f.entry).join() === "engine,gun"'), 'two frames stand on her: the engine pod and the gun mount');
  console.log('  hold: ' + await S('game.state.scrapHold.count') + ' bundles; briefing: ' + JSON.stringify(await S('game.state.briefing && game.state.briefing.goal')));
  check(await S('game.state.course.map.field === "salvage" && game.state.course.map.yard'), "stop 1 is the Breaker's Yard (a salvage field)");
  await S('(()=>{ const a = window.__a, st = a.st(); a.park(st.course.map.start.x + 380, st.course.map.start.y - 400); a.step(30); st.briefing = null; return 1 })()');
  await host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.lift = -170); 1'); // (a one-deck raft hangs low under her balloon: the picture is lifted so the deck and its two frames stand clear of the banners)
  await S('window.__a.settle(150)');
  await host.shot(`raft_${view}_cast_off.png`);

  // ---- 2. the crew carrying scrap to the frames ----
  await S(`(()=>{ const a = window.__a, st = a.st(), L = st.ships[0].layout; const bots = a.bots(); const p = a.me();
    // Mia takes a bundle out of the hold and carries it aft to the engine frame; two bots follow her with bundles
    p.d = 0; p.x = 330; p.carry = 'scrap'; p.fall = false; p.lock = null;
    bots.slice(0, 2).forEach((b, i) => { b.carry = 'scrap'; b.botJob = null; b.d = 0; b.x = 285 + 40 * i; b.fall = false; });
    a.step(20); return 1 })()`);
  await sleep(400);
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent') + ' | button: ' + await phone.ev('document.getElementById("act").textContent'));
  await S('window.__a.settle(90)');
  await host.shot(`raft_${view}_carrying_scrap.png`);
  await S(`(()=>{ const a = window.__a, st = a.st(), p = a.me(), f = st.run.frames.find((q) => q.entry === 'engine'); p.x = 186; p.d = 0; p.carry = 'scrap'; a.step(6); return 1 })()`);
  await sleep(500);
  const btn = await phone.ev('document.getElementById("act").textContent');
  console.log('  phone at the engine frame: ' + await phone.ev('document.getElementById("info").textContent') + ' | button: ' + btn);
  check(/BUILD ENGINE POD/i.test(btn), 'the big button at the frame says BUILD ENGINE POD (n/m): ' + btn);
  await S('(()=>{ const a = window.__a, p = a.me(); p.fire = true; a.step(100); return 1 })()'); // (the bar is part-way)
  await S('window.__a.settle(60)');
  await host.shot(`raft_${view}_building_the_engine.png`);
  await phone.shot(`raft_${view}_phone_build.png`);

  // ---- 3. the engine pod comes alive: NEW: ENGINE POD ----
  await S(`(()=>{ const a = window.__a, st = a.st(), p = a.me(), f = st.run.frames.find((q) => q.entry === 'engine'); for (let g = 0; g < 10 && !f.done; g++) { p.carry = 'scrap'; p.fire = true; a.step(60 * 3); } p.fire = false; a.step(20); return 1 })()`);
  check(await S('game.state.ships[0].layout.engines.length === 1 && !!game.state.yard.newPart'), 'the last bundle: the engine pod is alive (NEW: ' + await S('game.state.yard.newPart && game.state.yard.newPart.name') + ')');
  await S('window.__a.settle(40)');
  await host.shot(`raft_${view}_new_engine_pod.png`);
  // the gun frame is raised quickly too (the bots' work)
  await S(`(()=>{ const a = window.__a, st = a.st(), f = st.run.frames.find((q) => q.entry === 'gun'); const p = a.me(); const spot = f.spot || { x: 560 }; p.x = spot.x; p.d = 0; for (let g = 0; g < 10 && !f.done; g++) { p.carry = 'scrap'; p.fire = true; a.step(60 * 3); } p.fire = false; a.step(20); st.yard.newPart = null; return 1 })()`);
  check(await S('game.state.run.frames.every(f => f.done)'), 'both frames are built');

  // ---- 4. stripping the first wreck ----
  await S('(()=>{ const a = window.__a, d = a.der().list[0]; a.over(d); a.step(60); return 1 })()');
  await zoom3d(1.0);
  await S('(()=>{ const a = window.__a, p = a.me(), d = a.der().list[0], G = a.st().groundSys; G.lowerRope(p); a.step(20); a.stand(p, d, d.parts[0].dx - 140); a.step(30); p.on.lx = d.parts[0].dx; p.x = d.x + d.parts[0].dx; a.step(8); return 1 })()');
  await sleep(500);
  const ub = await phone.ev('document.getElementById("act").textContent');
  console.log('  phone at the wreck: ' + await phone.ev('document.getElementById("info").textContent') + ' | button: ' + ub);
  check(/UNBOLT/i.test(ub), 'the big button at a part says UNBOLT: ' + ub);
  await S('(()=>{ const a = window.__a, p = a.me(); p.fire = true; a.step(100); return 1 })()');
  await S('window.__a.settle(60)');
  await host.shot(`raft_${view}_stripping_the_wreck.png`);
  await S('(()=>{ const a = window.__a, p = a.me(); a.step(100); p.fire = false; a.step(4); return 1 })()');
  check(await S('window.__a.me().carry === "chest"'), 'Mia has the first part in her arms');
  await S(`(()=>{ const a = window.__a, p = a.me(), L = a.st().ships[0].layout; p.on = null; p.fly = false; p.fall = false; p.carry = null; p.d = 0; p.x = 400; p.y = L.platforms[0].y; a.step(10); return 1 })()`); // (hauled up the rope and stowed: the stop's own rules are the derelict gate's work)

  // ---- 5. the yard is won, the scorecard, dock 1 with the hull / deck cards ----
  await S(`(()=>{ const a = window.__a, st = a.st(); a.der().got = st.course.goal.need; a.step(5); return 1 })()`);
  check(await S('game.state.course.goal.done && game.state.course.goal.win'), 'two parts aboard: the yard is won');
  await S('(()=>{ const a = window.__a; a.hold = null; a.track = null; const st = a.st(); for (let i = 0; i < 60 * 40 && !st.scorecard; i++) window.__upd(1/60); return 1 })()');
  await S('(()=>{ const a = window.__a, st = a.st(); for (let i = 0; i < 60 * 30 && st.scorecard; i++) window.__upd(1/60); window.__upd(1/60); return 1 })()');
  await S('(()=>{ const st = window.game.state; st.run.salvage = Math.max(st.run.salvage, 300); for (let i = 0; i < 120; i++) window.__upd(1/60); return 1 })()');
  await S('window.__a.settle(90)');
  const cards = await S('game.state.vote && game.state.vote.kind === "dock" && game.state.vote.options.map((o) => o.name + (o.frame ? " [frame]" : "") + (o.named ? " [stripped]" : "") + " | " + (o.badge || "") + " | " + o.cost)');
  console.log('  dock 1 cards: ' + JSON.stringify(cards));
  check(Array.isArray(cards) && cards.some((c) => /hull bay/i.test(c)), 'dock 1 offers the HULL BAY (the card that grows her)');
  await host.shot(`raft_${view}_dock_1.png`);
  await phone.ev('1');
  await sleep(500);
  await phone.shot(`raft_${view}_phone_dock.png`);

  // ---- 6. the hull bay is bought, the ship is grown, stop 2 ----
  await S('(()=>{ const a = window.__a, v = a.st().vote; a.vote(v.options.findIndex(o => /hull bay/i.test(o.name))); a.step(60 * 3); return 1 })()');
  for (let k = 0; k < 4 && await S('game.state.vote && game.state.vote.kind === "slot"'); k++) { await S('(()=>{ const a = window.__a; a.vote(0); a.step(60 * 4); return 1 })()'); }
  for (let k = 0; k < 10 && await S('!!game.state.vote'); k++) { await S('(()=>{ const a = window.__a, v = a.st().vote; a.vote(v.kind === "dock" ? v.options.findIndex(o => o.kind === "cast") : 0); a.step(60 * 3); return 1 })()'); }
  await S('(()=>{ const a = window.__a, st = a.st(); for (let i = 0; i < 60 * 3 && st.vote; i++) a.step(1); return 1 })()');
  console.log('  platforms: ' + await S('game.state.ships[0].layout.platforms.map(q => q.id + " " + (q.x1 - q.x0)).join(", ")') + '; parts: ' + await S('game.state.run.parts.map(p => p.id).join(",")'));
  check(await S('game.state.ships[0].layout.platforms[0].x1 - game.state.ships[0].layout.platforms[0].x0 >= 600'), 'the hull bay: the deck is a room longer');
  await S('(()=>{ const a = window.__a, st = a.st(); for (let i = 0; i < 60 * 12 && st.vote; i++) a.step(1); const g = st.run.voyage; return 1 })()');
  console.log('  stop now: ' + await S('game.state.run.stopId + " " + game.state.course.map.kind'));
  await S('(()=>{ const a = window.__a, st = a.st(); a.hold = null; a.track = null; st.briefing = null; for (let i = 0; i < 60 * 14; i++) a.step(1); return 1 })()');
  await host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.lift = -150); 1');
  await S('window.__a.settle(120)');
  await host.shot(`raft_${view}_grown_stop_2.png`);

  const errs = [...host.errors, ...phone.errors, ...(await S('window.gameErrors||[]') || [])];
  for (const e of [...new Set(errs)].slice(0, 8)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (phone) await phone.close();
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `raft-shots (${view}): ${failed} FAILED` : `raft-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
