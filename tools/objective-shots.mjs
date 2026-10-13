// CASTLE.md A1, THE CASTLE OBJECTIVES in a real headless Chrome: for each objective (winch, charge, ballista, beacon, cage, banner) and for the soldiers against a crewman, a picture of the TV and one of the phone.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise), so
// every picture is the same each time.
//   node tools/objective-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--only winch,cage ...]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named objective_<view>_<what>_tv.png / _phone.png. Exit 1 on any console error or a failed check.
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
const only = arg('only', 'winch,charge,ballista,beacon,cage,banner,soldiers').split(',');
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
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261013);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'objective-chrome-'));
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

// In the host page: helpers that hold the ship where a shot wants her while the sim is stepped by hand, and stage Mia on the ground.
const PRE = `
window.__a = {
  hold: null,
  st: () => window.game.state,
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  park(x, y) { this.hold = { x, y }; this.pin(); },
  pin() { if (!this.hold) return; const st = window.game.state, sh = st.ships[0], R = sh.layout.refPoint; sh.pose.x = this.hold.x - R.x; sh.pose.y = this.hold.y - R.y; sh.pose.vy = 0; sh.pose.f = 1; st.ship.speed = 0; st.ship.order = 0; st.ship.hull = 100; },
  step(n) { for (let i = 0; i < n; i++) { this.pin(); window.__upd(1/60); } },
  me() { return Object.values(window.game.state.players).find((q) => !q.bot); },
  face(i = 0) { return window.game.state.course.ring.faces[i]; },
  O() { return window.game.state.away.obj; },
  ob(kind, face = 0) { return this.O().list.find((q) => q.kind === kind && q.face === face); },
  calm(on) { for (const f of this.st().course.ring.faces) for (const q of f.squads) if (q.kind === 'plaza') q.huntCd = on ? 1e9 : 0; },
  async settle(n = 60) { for (let i = 0; i < n; i++) await this.frame(); },
  // offer just this kind on every face that can have it, and stand Mia on the ground at x
  async offer(kind) { const m = await import('/config.js'); m.config.AWAY.OBJECTIVES.FORCE = [kind]; const st = this.st(); st.groundSys.obj.begin(st.course.map); this.calm(true); },
  stand(x, face = 0) { const p = this.me(), f = this.face(face); p.fall = false; p.fly = true; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.koGrace = 0; p.carry = null; p.on = { away: true, mode: 'walk', deck: null, gy: f.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 }; p.x = x; p.y = f.y; p.jx = p.jy = 0; p.face = 1; return p; },
  holdFor(ob, secs) { const p = this.me(); p.fire = true; for (let i = 0; i < secs * 60 && ob.state === 'ready'; i++) this.step(1); },
};
`;

let host = null, phone = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&kind=ring&variant=fortress&tier=medium&cine=0&christen=0`, 1600, 900, false, true);
  check(await host.waitFor('window.__meter!==undefined', 60000), 'the host page is up');
  await host.ev(PRE);
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true, false);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev(`(async()=>{ const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('bots').click(); await sl(300); document.getElementById('castoff').click(); window.__step(120); await sl(300); return 1 })()`);
  check(await host.ev('game.state.phase === "flying" && game.state.course.map.kind === "ring"'), 'cast off over a ring map (fortress)');
  check(await host.ev('Object.values(game.state.players).length >= 3'), '3 or more crew: the away team exists');
  const zoom3d = (z) => host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.zoom = ' + z + '); 1');
  await zoom3d(0.8);
  await host.ev('window.__a.step(30); 1');
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)
  const take = async (name, settle = 90) => {
    await host.ev(`window.__a.settle(${settle})`);
    await host.shot(`objective_${view}_${name}_tv.png`);
    await host.ev('window.__a.step(2); 1');
    await sleep(700);
    console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent') + ' | button: ' + await phone.ev('document.getElementById("act").textContent'));
    await phone.shot(`objective_${view}_${name}_phone.png`);
  };

  // WINCH: Mia cranking at the gatehouse, the bar part full
  if (only.includes('winch')) {
    await host.ev('(async()=>{ await window.__a.offer("winch"); const a = window.__a, ob = a.ob("winch"); a.park(ob.x, a.face().y - 700); a.step(30); a.stand(ob.x - 60); a.step(5); a.me().fire = true; a.step(110); return 1 })()');
    check(await host.ev('window.__a.ob("winch").prog > 0.2 && window.__a.ob("winch").state === "ready"'), 'WINCH: the bar is filling');
    await take('winch');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("winch"); a.holdFor(ob, 6); a.me().fire = false; a.step(5); return 1 })()');
    check(await host.ev('window.__a.face().winch === true'), 'WINCH: cranked - the gate stays open twice as long');
    await host.ev('window.__a.me().fire = false; 1');
  }
  // CHARGE: the keg, the powder crate, the charge ticking at the tower while Mia runs
  if (only.includes('charge')) {
    await host.ev('(async()=>{ await window.__a.offer("charge"); const a = window.__a, ob = a.ob("charge"), keg = a.ob("keg"); a.park(ob.x - 300, a.face().y - 700); a.step(30); a.stand(keg.x); a.step(5); a.holdFor(keg, 3); a.me().fire = false; a.step(3); a.stand(ob.x); a.me().carry = "crate"; a.step(3); a.holdFor(ob, 6); a.me().fire = false; a.me().x = ob.x + 420; a.step(150); return 1 })()');
    check(await host.ev('window.__a.ob("charge").state === "fuse"'), 'CHARGE: planted, the fuse burns');
    await take('charge');
    await host.ev('(()=>{ const a = window.__a; a.me().x = a.ob("charge").x + 1400; a.step(60 * 8); return 1 })()');
  }
  // BALLISTA (the fortress's third face)
  if (only.includes('ballista')) {
    await host.ev('(async()=>{ window.__face = 2; await window.__a.offer("ballista"); const a = window.__a, ob = a.ob("ballista", 2); a.park(ob.x, a.face(2).y - 700); a.step(30); a.stand(ob.x - 50, 2); a.step(5); a.me().fire = true; a.step(120); return 1 })()');
    check(await host.ev('window.__a.ob("ballista", 2).prog > 0.2 && window.__a.ob("ballista", 2).state === "ready"'), 'BALLISTA: the bar is filling');
    await take('ballista');
    await host.ev('(()=>{ const a = window.__a; a.holdFor(a.ob("ballista", 2), 6); a.me().fire = false; a.step(5); window.__face = 0; return 1 })()');
    check(await host.ev('window.__a.face(2).special.silent === true'), 'BALLISTA: jammed for the stop');
  }
  // BEACON
  if (only.includes('beacon')) {
    await host.ev('(async()=>{ await window.__a.offer("beacon"); const a = window.__a, ob = a.ob("beacon"); a.park(ob.x + (ob.x < a.face().x ? 400 : -400), a.face().y - 700); a.step(30); a.stand(ob.x - 40); a.step(5); a.me().fire = true; a.step(100); return 1 })()');
    check(await host.ev('window.__a.ob("beacon").prog > 0.2'), 'BEACON: the bar is filling');
    await take('beacon');
    await host.ev('(()=>{ const a = window.__a; a.holdFor(a.ob("beacon"), 6); a.me().fire = false; a.step(120); return 1 })()');
    check(await host.ev('window.__a.ob("beacon").state === "done" && !!window.game.state.supply'), 'BEACON: lit, a supply balloon comes');
    await take('beacon_lit', 60);
  }
  // CAGE: the prisoners walking to the rope ladder
  if (only.includes('cage')) {
    await host.ev('(async()=>{ await window.__a.offer("cage"); const a = window.__a, ob = a.ob("cage"), G = a.st().groundSys, R0 = a.st().ships[0].layout.refPoint; const x = ob.x + 560; a.park(x, a.face().y - 640); a.step(20); const sp = G.ropeSpot(); a.park(x + (R0.x - sp.x), a.face().y - 640); a.step(30); a.stand(ob.x + 20); a.step(5); a.holdFor(ob, 5); a.me().fire = false; a.step(100); return 1 })()');
    check(await host.ev('window.__a.O().prisoners.length === 3'), 'CAGE: three prisoners are out');
    await take('cage', 60);
    await host.ev('(()=>{ const a = window.__a; a.step(60 * 25); return 1 })()');
    check(await host.ev('window.__a.O().stats.aboard === 3'), 'CAGE: all three climbed aboard (' + await host.ev('window.__a.O().stats.aboard') + ')');
  }
  // BANNER: Mia carries the great banner to the rope
  if (only.includes('banner')) {
    await host.ev('(async()=>{ await window.__a.offer("banner"); const a = window.__a, ob = a.ob("banner"), G = a.st().groundSys, R0 = a.st().ships[0].layout.refPoint; a.park(ob.x + 700, a.face().y - 640); a.step(20); const sp = G.ropeSpot(); a.park(ob.x + 700 + (R0.x - sp.x), a.face().y - 640); a.step(30); a.stand(ob.x); a.step(5); a.holdFor(ob, 6); a.me().fire = false; a.step(5); G.lowerRope(a.me()); a.step(30); const p = a.me(); p.x = a.st().away.rope.x - 330; p.jx = 1; a.step(30); p.jx = 0; a.step(2); return 1 })()');
    check(await host.ev('window.__a.O().banner && window.__a.O().banner.carrier === window.__a.me().id'), 'BANNER: Mia carries it');
    await take('banner', 60);
  }
  // SOLDIERS: the squad shouts "!" and runs at Mia
  if (only.includes('soldiers')) {
    await host.ev('(async()=>{ await window.__a.offer("winch"); const a = window.__a, f = a.face(), q = f.squads.find((s) => s.kind === "plaza"); a.calm(false); a.st().alarmClear && a.st().alarmClear(); a.park(q.x + (q.x < f.x ? 250 : -250), f.y - 700); a.step(30); a.stand(q.x + (q.x < f.x ? 300 : -300)); a.step(35); return 1 })()');
    check(await host.ev('(()=>{ const f = window.__a.face(); return f.squads.some((q) => q.hunt) })()'), 'SOLDIERS: a squad has noticed her');
    await take('soldiers_notice', 2);
    await host.ev('window.__a.step(50); 1');
    await take('soldiers_run', 2);
    await host.ev('(()=>{ const a = window.__a; a.step(60 * 4); return 1 })()');
    check(await host.ev('window.__a.me().ko > 0 || window.__a.O().stats.strikes >= 1'), 'SOLDIERS: the strike lands (knocked out)');
    await take('soldiers_ko', 2);
  }

  const errs = [...host.errors, ...phone.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 8)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (phone) await phone.close();
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `objective-shots (${view}): ${failed} FAILED` : `objective-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
