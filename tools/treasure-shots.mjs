// CASTLE.md A2, THE OUTPOSTS' TREASURE in a real headless Chrome: the vault that opens when an outpost falls, a crewman grabbing a chest (the bar, the phone's GRAB THE CHEST), carrying it with the vault guards aiming at her,
// climbing the rope ladder with it, the STOW button at the hold bin, the hold's count on the TV, the scorecard's treasure row and the dock. Starts its OWN server on a free port and stops it by its PID at the end
// (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise), so every picture is the same each time.
//   node tools/treasure-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named treasure_<view>_*.png. Exit 1 on any console error or a failed check.
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
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261012);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'treasure-chrome-'));
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
  park(x, y) { this.hold = { x, y }; this.pin(); },
  pin() { if (!this.hold) return; const st = window.game.state, sh = st.ships[0], R = sh.layout.refPoint; sh.pose.x = this.hold.x - R.x; sh.pose.y = this.hold.y - R.y; sh.pose.vy = 0; sh.pose.f = 1; st.ship.speed = 0; st.ship.order = 0; st.ship.hull = 100; },
  step(n) { for (let i = 0; i < n; i++) { this.pin(); window.__upd(1/60); } },
  me() { return Object.values(window.game.state.players).find((q) => !q.bot); },
  tre() { return window.game.state.away.tre; },
  map() { return window.game.state.course.map; },
  fell(k) { for (const t of window.game.state.course.turrets) if (t.outpost === k) t.dead = true; },
  // park so the rope's top hangs gap px over the ground of outpost k, its foot beside the vault
  over(k, gap, dx = 0) {
    const st = window.game.state, S = st.away, out = this.map().outposts[k];
    this.park(out.x + dx, this.hold ? this.hold.y : out.y - 1500); this.step(2);
    for (let n = 0; n < 4; n++) { this.park(this.hold.x + (out.x + dx - S.rope.x), this.hold.y + (out.y - gap - S.rope.y)); this.step(2); }
  },
  stand(p, x) { // on the ground at x, as a landing makes him
    const G = window.game.state.groundSys, v = this.tre().vaults[0], gy = G.groundAt(x, v.y - 100);
    p.fall = false; p.fly = true; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.koGrace = 0; p.carry = null; p.hearts = 3;
    p.on = { away: true, mode: 'walk', deck: null, gy, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
    p.x = x; p.y = gy; p.jx = p.jy = 0;
  },
  async settle(n = 60) { for (let i = 0; i < n; i++) await this.frame(); },
};
`;

let host = null, phone = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&kind=open&tier=medium&cine=0&christen=0`, 1600, 900, false, true);
  check(await host.waitFor('window.__meter!==undefined', 60000), 'the host page is up');
  await host.ev(PRE);
  const code = await host.ev('document.getElementById("code").textContent');
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true, false);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
  await host.ev(`(async()=>{ const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('bots').click(); await sl(300); document.getElementById('castoff').click(); window.__step(120); await sl(300); return 1 })()`);
  check(await host.ev('game.state.phase === "flying" && game.state.course.map.kind === "open"'), 'cast off over an open-sky raid');
  check(await host.ev('Object.values(game.state.players).length >= 3'), '3 or more crew: the away team exists');
  const zoom3d = (z) => host.ev('window.view3dDebug && window.view3dDebug().view && (window.view3dDebug().view.S.zoom = ' + z + '); 1'); // (the 3D camera's own zoom; the 2D view frames itself)
  await zoom3d(0.8);
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)

  // the first outpost falls: its vault opens beneath the ship, three chests (danger 4)
  await host.ev('(()=>{ const a = window.__a; a.st().course.danger = 4; a.step(10); a.over(0, 620, 0); a.fell(0); a.step(20); return 1 })()');
  const vs = await host.ev('JSON.stringify({ n: window.__a.tre().chests.length, open: window.__a.tre().vaults[0].state, gap: Math.round(game.state.away.rope.gap), banner: game.state.ev.warnText })');
  console.log('  vault: ' + vs);
  check(await host.ev('window.__a.tre().vaults[0].state === "open" && window.__a.tre().chests.filter((c) => c.kind === "chest").length === 3'), 'the outpost fell: its vault is open with 3 chests');
  await host.ev('(()=>{ const a = window.__a, p = a.me(), v = a.tre().vaults[0]; a.stand(p, v.x - 380); a.step(30); return 1 })()');
  await host.ev('window.__a.settle(90)');
  await host.shot(`treasure_${view}_tv_vault.png`);

  // Mia walks to a chest and holds the button: the bar fills
  await host.ev('(()=>{ const a = window.__a, p = a.me(), c = a.tre().chests.find((q) => q.kind === "chest"); a.stand(p, c.x); a.step(8); return 1 })()');
  await sleep(500);
  const btn0 = await phone.ev('document.getElementById("act").textContent');
  const info0 = await phone.ev('document.getElementById("info").textContent');
  console.log('  phone: ' + info0 + ' | button: ' + btn0);
  check(/GRAB THE CHEST/i.test(btn0), 'the big button says GRAB THE CHEST at a chest');
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.fire = true; a.step(40); return 1 })()'); // (the bar is part-way)
  await host.ev('window.__a.settle(60)');
  await host.shot(`treasure_${view}_tv_grab.png`);
  await phone.shot(`treasure_${view}_phone_grab.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); a.step(60); p.fire = false; a.step(4); return 1 })()');
  check(await host.ev('window.__a.me().carry === "chest"'), 'Mia has the chest in her arms');
  await sleep(500);
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent'));
  await phone.shot(`treasure_${view}_phone_carry.png`);

  // a carrier, and the guards that come for her: the tell
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.jx = 0; for (let i = 0; i < 60 * 12 && !a.tre().guards.some((g) => g.state === "aim"); i++) a.step(1); return 1 })()');
  check(await host.ev('window.__a.tre().guards.some((g) => g.state === "aim")'), 'the vault guards have come and one is aiming at her');
  await host.ev('window.__a.step(2); window.__a.settle(30)');
  await host.shot(`treasure_${view}_tv_carrier_guards.png`);

  // she puts it down, the guards are driven off; a second chest is carried by a pair? (one man here: the rope instead)
  await host.ev('(()=>{ const a = window.__a, p = a.me(), t = a.tre(); for (const g of t.guards) g.state = "gone"; const G = a.st().groundSys; G.lowerRope(p); a.step(20); const R = a.st().away.rope; p.jx = Math.sign(R.x - p.x); for (let i = 0; i < 1500 && Math.abs(p.x - R.x) > 20; i++) a.step(1); p.jx = 0; p.jy = -1; a.step(60); return 1 })()');
  await host.ev('window.__a.settle(60)');
  await host.shot(`treasure_${view}_tv_rope_climb.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); for (let i = 0; i < 1500 && p.on; i++) a.step(1); p.jy = 0; a.step(4); return 1 })()');
  check(await host.ev('(()=>{ const p = window.__a.me(); return !p.on && p.carry === "chest" })()'), 'she climbed the rope ladder and still has the chest');

  // aboard: to the hold bin, the STOW button
  await host.ev(`(async()=>{ const { holdSpot } = await import('/modules/host/scrap.js'); const a = window.__a, p = a.me(), st = a.st(), L = st.ships[0].layout; const sp = holdSpot(L); p.d = sp.d; p.x = sp.x + 12; p.y = L.platforms[sp.d].y; a.step(10); return 1 })()`);
  await sleep(500);
  const btn1 = await phone.ev('document.getElementById("act").textContent');
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent') + ' | button: ' + btn1);
  check(/STOW THE CHEST/i.test(btn1), 'at the hold the big button says STOW THE CHEST');
  await phone.shot(`treasure_${view}_phone_stow.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.actQ = true; a.step(6); return 1 })()');
  check(await host.ev('window.game.state.chestHold && window.game.state.chestHold.list.length === 1'), 'the chest is stowed in the hold');
  await host.ev('window.__a.settle(90)');
  await host.shot(`treasure_${view}_tv_stowed.png`);

  // the stop ends: the scorecard has a treasure row, then the dock
  await host.ev('(()=>{ const a = window.__a, t = a.st().course; for (const o of a.map().outposts) o.done = true; for (const g of t.turrets) g.dead = true; for (let i = 0; i < 60 * 40 && !a.st().scorecard; i++) a.step(1); return 1 })()');
  check(await host.ev('!!(window.game.state.scorecard && window.game.state.scorecard.gain && window.game.state.scorecard.gain.treasure > 0)'), 'the scorecard has a treasure row (' + await host.ev('window.game.state.scorecard && window.game.state.scorecard.gain && window.game.state.scorecard.gain.treasure') + ' salvage)');
  await host.ev('window.__a.step(30); window.__a.settle(90)');
  await host.shot(`treasure_${view}_tv_payout.png`);
  await host.ev('(()=>{ const a = window.__a; for (let i = 0; i < 60 * 30 && a.st().scorecard; i++) a.step(1); a.step(120); return 1 })()');
  await host.ev('window.__a.settle(90)');
  await host.shot(`treasure_${view}_tv_dock.png`);

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
console.log(failed ? `treasure-shots (${view}): ${failed} FAILED` : `treasure-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
