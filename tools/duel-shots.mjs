// CASTLE.md A4, GROUND SWORD FIGHTS in a real headless Chrome: a picture of the TV for a soldier telegraphing, a crewman swinging, a parry stagger, a soldier KO'd and two crew flanking, and of the phone with its parry cue.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise), so
// every picture is the same each time.
//   node tools/duel-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named duel_<view>_<what>.png (tv shots and the phone's). Exit 1 on any console error or a failed check.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', 'C:/Users/kenny/Downloads/AIRSHIP/airship/3d-screenshots'));
const port = Number(arg('port', 6600 + Math.floor(Math.random() * 300)));
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-chrome-'));
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
  P.shotClip = async (name, clip) => { fs.writeFileSync(path.join(out, name), Buffer.from((await send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 2 } })).data, 'base64')); console.log('  shot ' + name); }; // (a close-up of the TV: the same frame, a part of it at twice the size)
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

// In the host page: helpers that hold the ship where a shot wants her while the sim is stepped by hand, and stage Mia and the squad's soldiers.
const PRE = `
window.__a = {
  hold: null,
  st: () => window.game.state,
  // where a world point is on the TV screen: the 2D camera's own mapping, or the 3D camera's projection
  screen(x, y) { const W = window.innerWidth, H = window.innerHeight; if ('${view}' === '3d') { const V = window.view3dDebug().view, q = V && V.hud3d.project(x, -y, 60); return q ? { x: q.x * W, y: q.y * H } : null; } const lv = window.__lastView; return { x: W / 2 + (x - lv.cx) * lv.zoom, y: H / 2 + (y - lv.cy) * lv.zoom }; },
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  park(x, y) { this.hold = { x, y }; this.pin(); },
  pin() { if (!this.hold) return; const st = window.game.state, sh = st.ships[0], R = sh.layout.refPoint; sh.pose.x = this.hold.x - R.x; sh.pose.y = this.hold.y - R.y; sh.pose.vy = 0; sh.pose.f = 1; st.ship.speed = 0; st.ship.order = 0; st.ship.hull = 100; },
  step(n) { for (let i = 0; i < n; i++) { this.pin(); window.__upd(1/60); } },
  me() { return Object.values(window.game.state.players).find((q) => !q.bot); },
  bots() { return Object.values(window.game.state.players).filter((q) => q.bot); },
  face(i = 0) { return window.game.state.course.ring.faces[i]; },
  D() { return window.game.state.away.duel; },
  squad() { return this.face().squads.find((s) => s.kind === 'plaza'); },
  foe() { return this.D().foes.find((F) => ['run', 'ready', 'draw', 'tell', 'recover', 'stagger', 'down'].includes(F.st)); },
  async settle(n = 60) { for (let i = 0; i < n; i++) await this.frame(); },
  stand(p, x, face = 0) { const f = this.face(face); p.fall = false; p.fly = true; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.koGrace = 0; p.carry = null; p.hearts = 3; p.hurtT = 0; p.on = { away: true, mode: 'walk', deck: null, gy: f.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 }; p.x = x; p.y = f.y; p.jx = p.jy = 0; p.face = 1; return p; },
  until(fn, n = 900) { for (let i = 0; i < n; i++) { if (fn()) return i; this.step(1); } return fn() ? n : -1; },
  // a fresh fight: the first plaza squad notices Mia 380 px away on its outer side; returns once its first soldier stands off her
  fight(n = 1) { const a = this, f = a.face(), q = a.squad(); for (const s of f.squads) if (s.kind === 'plaza' && s !== q) s.huntCd = 1e9; q.huntCd = 0; q.hunt = null; q.state = 'muster'; q.x = q.home; q.n = q.max = n; a.D().foes.length = 0; a.D().fx.length = 0; a.park(q.home + (q.home < f.x ? 120 : -120), f.y - 760); a.step(30); const p = a.stand(a.me(), q.home + (q.home < f.x ? -380 : 380)); a.step(5); return a.until(() => { const F = a.foe(); return F && F.st === 'ready'; }); },
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
  await host.ev('(async()=>{ const m = await import("/config.js"); m.config.AWAY.OBJECTIVES.FORCE = ["winch"]; const st = window.game.state; st.groundSys.obj.begin(st.course.map); return 1 })()'); // (only the winch at the gate: no other marker in the way of the fight)
  await host.ev('window.__a.step(30); 1');
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)
  await host.ev('(async()=>{ const m = await import("/config.js"); m.config.AWAY.DUEL.FOE.TELL = 3.2; return 1 })()'); // (a slow telegraph, so a still picture catches the ring half closed and the phone's cue is still on)
  const phoneLine = async () => console.log('  phone: ' + (await phone.ev('document.getElementById("info").textContent')) + ' | left: ' + (await phone.ev('document.getElementById("atk").textContent')) + ' | second: ' + (await phone.ev('document.getElementById("jump").textContent')));
  // the whole TV, and a close-up of the fight (640 x 360 round the man, shifted up a little)
  const take = async (name, settle = 6) => {
    await host.ev(`window.__a.settle(${settle})`);
    await host.shot(`duel_${view}_${name}.png`);
    const at = await host.ev('(()=>{ const p = window.__a.me(); return window.__a.screen(p.x, p.y - 60) })()');
    if (at) await host.shotClip(`duel_${view}_${name}_close.png`, { x: Math.max(0, Math.min(1600 - 640, at.x - 320)), y: Math.max(0, Math.min(900 - 360, at.y - 180)), width: 640, height: 360 });
  };
  const quiet = () => phone.ev("document.getElementById('toast').style.display = 'none'; 1"); // (the notice's toast would cover the buttons)

  // 1. a soldier telegraphing: sword raised, the "!" and the closing ring
  check((await host.ev('window.__a.fight()')) >= 0, 'a squad notices Mia, the first soldier stands off her');
  check((await host.ev('window.__a.until(() => { const F = window.__a.foe(); return F && F.st === "tell" && F.t < 1.2 })')) >= 0, 'he raises his sword: the telegraph');
  await take('telegraph');
  await sleep(300);
  await quiet();
  await phoneLine();
  await phone.shot(`duel_${view}_phone_cue.png`); // (the amber frame, the ring, BLOCK pulsing)
  check(await phone.ev('document.body.classList.contains("duel") && document.getElementById("jump").textContent.includes("BLOCK") && document.getElementById("atk").textContent.includes("Swing")'), 'the phone: the second button says BLOCK, the left one Swing');
  check(await phone.ev('document.getElementById("jump").classList.contains("cue")'), 'the phone: the BLOCK button is pulsing (the cue)');
  // the NOW buzz: the second cue, gold
  await host.ev('window.__a.until(() => { const F = window.__a.foe(); return F && F.st === "tell" && F.t < 0.5 })');
  await sleep(300);
  await quiet();
  await phone.shot(`duel_${view}_phone_now.png`);
  check(await phone.ev('document.getElementById("jump").classList.contains("now")'), 'the phone: the second buzz turns BLOCK gold (a press now parries)');

  // 2. the PARRY: a press within 0.3 s of the blow staggers him (stars)
  await host.ev('(()=>{ const a = window.__a; a.me().hearts = 3; a.until(() => a.foe() && a.foe().st === "tell" && a.foe().t < 0.28); a.me().jumpQ = true; a.until(() => a.foe() && a.foe().st === "stagger", 120); a.step(4); return 1 })()');
  check(await host.ev('(()=>{ const F = window.__a.foe(); return !!F && F.st === "stagger" && window.__a.D().stats.parries >= 1 })()'), 'the parry: the soldier is staggered');
  await take('parry');
  await phoneLine();
  await phone.shot(`duel_${view}_phone_parry.png`);

  // 3. a crewman swinging: the counter blow, a moment after it lands
  await host.ev('(()=>{ const a = window.__a, p = a.me(), F = a.foe(); a.until(() => Math.abs(F.x - p.x) <= 115 || (p.jxs = p.jx = Math.sign(F.x - p.x), false), 60); p.jxs = p.jx = 0; a.until(() => p.on.dl.cd <= 0, 60); p.atkQ = true; a.step(11); return 1 })()');
  check(await host.ev('window.__a.D().stats.counters >= 1'), 'the swing: a counter hit on the staggered soldier');
  await host.ev('window.__a.frame()');
  await take('swing', 0);

  // 4. the third hit: the soldier is down
  await host.ev('(()=>{ const a = window.__a, p = a.me(), F = a.foe(); for (let k = 0; k < 4 && F.st !== "down"; k++) { a.until(() => p.on.dl.cd <= 0, 60); p.atkQ = true; a.step(11); } a.step(6); return 1 })()');
  check(await host.ev('window.__a.D().foes.some((F) => F.st === "down")'), 'the soldier is KO\'d: he lies down');
  await take('ko');

  // 5. two crew flanking: Mia in front of a soldier, Bot1 behind him
  await host.ev('(async()=>{ const m = await import("/config.js"); m.config.AWAY.DUEL.FOE.TELL = 1.6; return 1 })()');
  check((await host.ev('window.__a.fight(1)')) >= 0, 'a fresh fight for the flank');
  await host.ev('(()=>{ const a = window.__a, p = a.me(), F = a.foe(), b = a.bots()[0]; a.stand(b, F.x + Math.sign(F.x - p.x) * 110); b.face = -Math.sign(F.x - p.x); b.hearts = 1e6; b.trip = { t: 0, goal: b.x, ready: false, flared: false }; a.step(2); b.atkQ = true; a.step(11); return 1 })()');
  check(await host.ev('window.__a.D().stats.flanks >= 1'), 'the flank: a hit from behind took the bonus');
  await host.ev('window.__a.frame()');
  await take('flank', 0);
  await phoneLine();

  // 6. a whole squad: three soldiers at once round a lone man
  await host.ev('(async()=>{ const m = await import("/config.js"); m.config.AWAY.DUEL.FOE.TELL = 1.0; return 1 })()');
  await host.ev('(()=>{ const a = window.__a; const b = a.bots()[0]; if (b.on && b.on.away) a.st().groundSys.rejoin(b, true, true); return 1 })()');
  check((await host.ev('window.__a.fight(7)')) >= 0, 'a fresh fight against a full squad');
  await host.ev('(()=>{ const a = window.__a; a.me().hearts = 1e6; a.until(() => a.D().foes.filter((F) => ["ready", "tell", "recover", "stagger"].includes(F.st)).length >= 3, 1200); a.until(() => a.D().foes.some((F) => F.st === "tell"), 300); return 1 })()');
  check(await host.ev('window.__a.D().foes.length >= 3'), 'three soldiers stand round her (' + (await host.ev('window.__a.D().foes.length')) + ')');
  await take('squad');

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
console.log(failed ? `duel-shots (${view}): ${failed} FAILED` : `duel-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
