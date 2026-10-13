// CASTLE.md A0, THE AWAY TEAM in a real headless Chrome: a crewman on a castle plaza with the AWAY TEAM label, the rope ladder hanging, a flare with the pickup marker, the edge porthole for a man off screen, and his phone.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise), so
// every picture is the same each time.
//   node tools/away-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--variant fortress]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named away_<view>_*.png. Exit 1 on any console error or a failed check.
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
const variant = arg('variant', 'fortress');
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
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261012);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'away-chrome-'));
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
  hold: null,
  st: () => window.game.state,
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  park(x, y) { const sh = window.game.state.ships[0]; this.hold = { x, y }; this.pin(); },
  pin() { if (!this.hold) return; const st = window.game.state, sh = st.ships[0], R = sh.layout.refPoint; sh.pose.x = this.hold.x - R.x; sh.pose.y = this.hold.y - R.y; sh.pose.vy = 0; sh.pose.f = 1; st.ship.speed = 0; st.ship.order = 0; st.ship.hull = 100; },
  step(n) { for (let i = 0; i < n; i++) { this.pin(); window.__upd(1/60); } },
  me() { return Object.values(window.game.state.players).find((q) => !q.bot); },
  face() { return window.game.state.course.ring.faces[0]; },
  calm(on) { for (const f of this.st().course.ring.faces) for (const q of f.squads) if (q.kind === 'plaza') q.huntCd = on ? 1e9 : 0; }, // (A1: the plaza squads do not notice a man on the ground while a shot is taken)
  plazaMid() { const f = this.face(), pz = window.game.state.course.map.ring.faces[0].plazas[0]; return (pz.x0 + pz.x1) / 2; },
  async settle(n = 60) { for (let i = 0; i < n; i++) await this.frame(); },
};
`;

let host = null, phone = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&kind=ring&variant=${variant}&tier=medium&cine=0&christen=0`, 1600, 900, false, true);
  check(await host.waitFor('window.__meter!==undefined', 60000), 'the host page is up');
  await host.ev(PRE);
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true, false);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev(`(async()=>{ const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('bots').click(); await sl(300); document.getElementById('castoff').click(); window.__step(120); await sl(300); return 1 })()`);
  check(await host.ev('game.state.phase === "flying" && game.state.course.map.kind === "ring"'), 'cast off over a ring map (' + variant + ')');
  check(await host.ev('Object.values(game.state.players).length >= 3'), '3 or more crew: the away team exists');
  const zoom3d = (z) => host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.zoom = ' + z + '); 1'); // (the 3D camera's own zoom; the 2D view frames itself)
  await zoom3d(0.8);
  // Mia drops by parachute onto the plaza of the first gate; the ship waits well to the left
  await host.ev(`(()=>{ const a = window.__a, st = a.st(), sh = st.ships[0], f = a.face(), px = a.plazaMid(), p = a.me(); a.park(px - 1500, f.y - 700); a.step(40); sh.sim.air.startFlight(p, 0, 0); p.fall = false; p.conn = null; p.lock = null; p.d = p.d ?? 1; p.x = px + 200; p.y = f.y - 420; p.fvx = 0; p.fvy = 60; p.lsy = p.apex = p.y - sh.pose.y; p.chute = 1; p.chuteOpen = true; return 1 })()`);
  await host.ev('window.__a.calm(true); 1');
  await host.ev('window.__a.step(240); 1');
  check(await host.ev('(()=>{ const p = window.__a.me(); return !!p.on && p.on.away && p.on.mode === "walk" && Math.abs(p.y - window.__a.face().y) < 3 })()'), 'Mia landed on the plaza by parachute (on the ground)');
  await host.ev('(()=>{ const a = window.__a, p = a.me(); a.park(p.x - 1200, a.face().y - 620); a.step(60); return 1 })()');
  await host.ev('window.__a.settle(90)');
  console.log('  view: ' + await host.ev('(()=>{ const v = window.__lastView || {}, p = window.__a.me(), sh = game.state.ships[0]; return JSON.stringify({ cx: Math.round(v.cx), cy: Math.round(v.cy), zoom: v.zoom, mia: [Math.round(p.x), Math.round(p.y)], shipRef: [Math.round(sh.pose.x + sh.layout.refPoint.x), Math.round(sh.pose.y + sh.layout.refPoint.y)] }) })()'));
  await host.shot(`away_${view}_tv_plaza_label.png`);
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)
  await sleep(600);
  const line = await phone.ev('document.getElementById("info").textContent');
  const btn = await phone.ev('document.getElementById("act").textContent');
  console.log('  phone: ' + line + ' | button: ' + btn);
  check(/AWAY TEAM/.test(line) && /FLARE|CLIMB|Objective/.test(line) && /FIRE FLARE/.test(btn), 'the phone says AWAY TEAM with a ground hint, and the big button is FIRE FLARE');
  await phone.shot(`away_${view}_phone_ground.png`);

  // the ship comes over her and lowers the rope ladder
  await host.ev(`(()=>{ const a = window.__a, st = a.st(), p = a.me(), f = a.face(); const G = st.groundSys; const sp = G.ropeSpot(); const R0 = st.ships[0].layout.refPoint; a.park(p.x + (R0.x - sp.x), f.y - 640); a.step(30); G.lowerRope(p); a.step(30); return 1 })()`);
  check(await host.ev('window.game.state.away.rope.out && window.game.state.away.rope.len > 100'), 'the rope ladder hangs from the keel (' + Math.round(await host.ev('window.game.state.away.rope.len')) + ' px)');
  await zoom3d(1.15);
  await host.ev('window.__a.settle(90)');
  await host.shot(`away_${view}_tv_rope_ladder.png`);

  // a flare, and the ship away: the pickup marker
  await zoom3d(0.8);
  await host.ev(`(()=>{ const a = window.__a, p = a.me(); a.st().away.rope.out = false; a.park(p.x - 1200, a.face().y - 620); a.step(60); p.actQ = true; a.step(10); return 1 })()`);
  check(await host.ev('window.game.state.away.flares.length === 1 && window.game.state.away.pickups.length === 1'), 'the flare is lit and the pickup is called');
  await host.ev('window.__a.settle(90)');
  await host.shot(`away_${view}_tv_flare_marker.png`);
  const status = await phone.ev('document.getElementById("info").textContent');
  console.log('  phone: ' + status);
  await phone.shot(`away_${view}_phone_flare.png`);

  // a man off screen: the edge porthole
  await host.ev(`(()=>{ const a = window.__a, p = a.me(); a.park(p.x + 4200, a.face().y - 900); a.step(30); return 1 })()`);
  await host.ev('window.__a.settle(120)');
  await host.shot(`away_${view}_tv_edge_porthole.png`);

  // the stranded warning
  await host.ev(`(()=>{ const a = window.__a, p = a.me(); a.park(p.x + 5200, a.face().y - 900); a.step(60 * 6); return 1 })()`);
  check(await host.ev('window.__a.me().on.strand > 0'), 'STRANDED: the countdown runs (' + Math.round(await host.ev('window.__a.me().on.strand')) + ' s)');
  await host.ev('window.__a.settle(60)');
  await host.shot(`away_${view}_tv_stranded.png`);
  await sleep(400);
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent'));
  await phone.shot(`away_${view}_phone_stranded.png`);

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
console.log(failed ? `away-shots (${view}): ${failed} FAILED` : `away-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
