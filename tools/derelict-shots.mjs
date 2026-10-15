// LOOP.md G5 + G6, DERELICTS, THE SALVAGE RUN and DEFEND in a real headless Chrome: the salvage run's briefing card, a wreck drifting in the sky, a crewman stripping a part (the bar on the wreck, the phone's UNBOLT button), the crate being hauled
// up the rope ladder, the hold, the scorecard and the dock with the NAMED part card; then a DEFEND stop: the balloon, a wave of bats, the hit-point bar. Starts its OWN server on a free port and stops it by its PID at the end (never kills node
// globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise), so every picture is the same each time.
//   node tools/derelict-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named derelict_<view>_*.png. Exit 1 on any console error or a failed check.
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
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261014);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'derelict-chrome-'));
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
  der() { return window.game.state.away.der; },
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
  host = await openPage(`${BASE}/host.html?view=${view}&tier=medium&cine=0&christen=0&ship=sparrow`, 1600, 900, false, true);
  check(await host.waitFor('window.__meter!==undefined', 60000), 'the host page is up');
  await host.ev(PRE);
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true, false);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev(`(async()=>{ const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('bots').click(); await sl(300); document.getElementById('castoff').click(); window.__step(120); await sl(300); return 1 })()`);
  check(await host.ev('game.state.phase === "flying"'), 'cast off');
  check(await host.ev('Object.values(game.state.players).length >= 3'), '3 or more crew: the away team exists');
  const zoom3d = (z) => host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.zoom = ' + z + '); 1'); // (the 3D camera's own zoom; the 2D view frames itself)
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)

  // ---- the SALVAGE RUN: the briefing card ----
  await host.ev(`(()=>{ const g = window.game, st = g.state; const stop = st.run.voyage.columns[2][0]; Object.assign(stop, { salvage: true, kind: 'salvage', gates: ['swarm'], danger: 1 }); g.goToStop(stop.id); window.__step(8); return 1 })()`);
  check(await host.ev('game.state.course.map.field === "salvage" && game.state.course.goal && game.state.course.goal.kind === "salvage"'), 'the stop is a salvage run on a field map');
  console.log('  briefing: ' + JSON.stringify(await host.ev('game.state.briefing && { goal: game.state.briefing.goal, title: game.state.briefing.title }')));
  check(await host.ev('!!game.state.briefing && /STRIP \\d PARTS/.test(game.state.briefing.goal)'), 'the briefing card says STRIP n PARTS FROM THE WRECKS');
  await host.ev('window.__a.settle(150)');
  await host.shot(`derelict_${view}_salvage_briefing.png`);

  // ---- a wreck in the sky ----
  await host.ev('(()=>{ const a = window.__a; a.st().briefing = null; const d = a.der().list[0]; a.park(d.x - 2300, d.y - 600); a.step(30); return 1 })()');
  await zoom3d(0.9);
  await host.ev('window.__a.settle(120)');
  await host.shot(`derelict_${view}_wreck_far.png`);
  await host.ev('(()=>{ const a = window.__a, d = a.der().list[0]; a.over(d); a.step(60); return 1 })()');
  const gap = await host.ev('Math.round(game.state.away.rope.gap)');
  console.log('  rope gap over the first wreck: ' + gap);
  check(await host.ev('!!(game.state.away.rope.groundDeck && game.state.away.rope.groundDeck.derelict)'), 'hovering over the wreck the rope ladder reaches her deck');

  // ---- Mia lowers the ladder, climbs down, walks to a part ----
  await host.ev('(()=>{ const a = window.__a, p = a.me(), d = a.der().list[0], G = a.st().groundSys; G.lowerRope(p); a.step(20); a.stand(p, d, d.parts[0].dx - 140); a.step(30); return 1 })()');
  await host.ev('window.__a.settle(100)');
  await host.shot(`derelict_${view}_on_the_wreck.png`);
  await sleep(500);
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent'));
  await host.ev('(()=>{ const a = window.__a, p = a.me(), d = a.der().list[0]; p.on.lx = d.parts[0].dx; p.x = d.x + d.parts[0].dx; a.step(8); return 1 })()');
  await sleep(500);
  const btn0 = await phone.ev('document.getElementById("act").textContent');
  const info0 = await phone.ev('document.getElementById("info").textContent');
  console.log('  phone: ' + info0 + ' | button: ' + btn0);
  check(/UNBOLT/i.test(btn0), 'the big button says UNBOLT THE ... at a part (' + btn0 + ')');
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.fire = true; a.step(100); return 1 })()'); // (the bar is part-way)
  await host.ev('window.__a.settle(60)');
  await host.shot(`derelict_${view}_stripping.png`);
  await phone.shot(`derelict_${view}_phone_strip.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); a.step(100); p.fire = false; a.step(4); return 1 })()');
  check(await host.ev('window.__a.me().carry === "chest"'), 'Mia has the part in her arms');
  await sleep(500);
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent'));
  await phone.shot(`derelict_${view}_phone_carry.png`);

  // ---- hauling it to the rope and up ----
  await host.ev('(()=>{ const a = window.__a, p = a.me(), R = a.st().away.rope; p.jx = Math.sign(R.x - p.x); for (let i = 0; i < 1500 && Math.abs(p.x - R.x) > 20; i++) { p.jx = Math.sign(R.x - p.x); a.step(1); } p.jx = 0; p.jy = -1; a.step(70); return 1 })()');
  await host.ev('window.__a.settle(60)');
  await host.shot(`derelict_${view}_hauling.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); for (let i = 0; i < 1500 && p.on; i++) a.step(1); p.jy = 0; a.step(4); return 1 })()');
  check(await host.ev('(()=>{ const p = window.__a.me(); return !p.on && p.carry === "chest" })()'), 'she climbed the rope ladder and still has the part');
  check(await host.ev('window.game.state.away.der.got === 1'), 'the wreck counts one part aboard');
  await host.ev(`(async()=>{ const { holdSpot } = await import('/modules/host/scrap.js'); const a = window.__a, p = a.me(), st = a.st(), L = st.ships[0].layout; const sp = holdSpot(L); p.d = sp.d; p.x = sp.x + 12; p.y = L.platforms[sp.d].y; a.step(10); p.actQ = true; a.step(6); return 1 })()`);
  check(await host.ev('window.game.state.chestHold && window.game.state.chestHold.list.length === 1'), 'the part is stowed in the hold');
  await host.ev('window.__a.settle(60)');
  await host.shot(`derelict_${view}_stowed.png`);

  // ---- two more parts (the bots' work), the run is won, the scorecard, the dock with the named card ----
  await host.ev(`(()=>{ const a = window.__a, st = a.st(), d = a.der().list[0]; const g = st.course.goal; a.der().got = g.need; a.step(5); return 1 })()`);
  check(await host.ev('game.state.course.goal.done && game.state.course.goal.win'), 'three parts aboard: the salvage run is won');
  await host.ev('window.__a.settle(60)');
  await host.shot(`derelict_${view}_salvage_won.png`);
  await host.ev('(()=>{ const a = window.__a; a.hold = null; a.track = null; const st = a.st(); for (let i = 0; i < 60 * 40 && !st.scorecard; i++) window.__upd(1/60); return 1 })()');
  await host.ev('window.__a.settle(60)');
  await host.shot(`derelict_${view}_scorecard.png`);
  await host.ev('(()=>{ const a = window.__a, st = a.st(); for (let i = 0; i < 60 * 30 && st.scorecard; i++) window.__upd(1/60); window.__upd(1/60); return 1 })()');
  // the pending named part: if the sim has none (only the stowed part came aboard and was paid), it is the one part
  console.log('  pending: ' + JSON.stringify(await host.ev('game.state.run.derelict && game.state.run.derelict.pending')));
  await host.ev('(()=>{ const st = window.game.state; st.run.salvage = Math.max(st.run.salvage, 400); for (let i = 0; i < 120; i++) window.__upd(1/60); return 1 })()');
  await host.ev('window.__a.settle(90)');
  const named = await host.ev('game.state.vote && game.state.vote.options.filter((o) => o.named).map((o) => o.name + " | " + o.badge + " | cost " + o.cost)');
  console.log('  dock named cards: ' + JSON.stringify(named));
  check(Array.isArray(named) && named.length >= 1, 'the dock offers the named part card');
  await host.shot(`derelict_${view}_dock_named.png`);
  await phone.ev('1');
  await sleep(500);
  await phone.shot(`derelict_${view}_phone_dock.png`);

  let errs = [...host.errors, ...phone.errors, ...(await host.ev('window.gameErrors||[]') || [])];

  // ---- a DEFEND stop: the balloon and a wave of bats ----
  await host.ev(`(()=>{ const g = window.game, st = g.state; st.vote = null; for (const p of Object.values(st.players)) { p.vote = null; p.uk = null; } const stop = st.run.voyage.columns[3][0]; Object.assign(stop, { defend: true, kind: 'defend', gates: ['swarm'], danger: 1 }); g.goToStop(stop.id); window.__step(8); return 1 })()`);
  check(await host.ev('game.state.course.map.field === "defend" && game.state.course.goal.kind === "defend"'), 'the next stop is a DEFEND stop on a field map');
  console.log('  briefing: ' + JSON.stringify(await host.ev('game.state.briefing && { goal: game.state.briefing.goal }')));
  await host.ev('window.__a.settle(150)');
  await host.shot(`derelict_${view}_defend_briefing.png`);
  await host.ev('(()=>{ const a = window.__a, st = a.st(), g = st.course.goal; st.briefing = null; a.park(g.x - 900, g.y); a.step(70); g.waveT = 0.1; a.step(10); return 1 })()');
  await zoom3d(0.7);
  await host.ev('(()=>{ const a = window.__a; a.step(200); return 1 })()'); // (the first wave flies in)
  await host.ev('window.__a.settle(90)');
  await host.shot(`derelict_${view}_defend_wave.png`);
  await host.ev('(()=>{ const a = window.__a, g = a.st().course.goal; for (let i = 0; i < 60 * 14 && !g.eating; i++) a.step(1); a.step(40); return 1 })()');
  console.log('  balloon: ' + JSON.stringify(await host.ev('(()=>{ const g = game.state.course.goal; return { hp: Math.round(g.hp), wave: g.wave, eating: g.eating, hits: g.hits, t: Math.round(g.t) } })()')));
  await host.ev('window.__a.settle(90)');
  await host.shot(`derelict_${view}_defend_bats_on_balloon.png`);
  errs = [...errs, ...host.errors, ...phone.errors, ...(await host.ev('window.gameErrors||[]') || [])];
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
console.log(failed ? `derelict-shots (${view}): ${failed} FAILED` : `derelict-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
