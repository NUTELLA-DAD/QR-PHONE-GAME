// CASTLE.md A3, THE AWAY TEAM IN 3D in a real headless Chrome (3D only): the rope ladder and a man climbing it, a wall ladder and the wall walk's plank, the flare rising and hanging and the pickup ring, and each objective's prop
// (the winch idle and cranked, the powder keg piled and carried and planted with its fuse, the ballista's sign and jammed, the beacon unlit and lit, the prisoner cage shut and open, the prisoners walking and climbing, the great
// banner planted and carried). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand
// (frozen otherwise), so every picture is the same each time.
//   node tools/away3d-shots.mjs [--out DIR] [--port N] [--tier low|medium|high] [--only rope,wall,flare,winch,charge,ballista,beacon,cage,banner,night]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named away3d_<what>.png. Exit 1 on any console error or a failed check.
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
const view = '3d';
const only = arg('only', 'rope,wall,flare,winch,charge,ballista,beacon,cage,banner,night').split(',');
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
  plazaMid() { const pz = window.game.state.course.map.ring.faces[0].plazas[0]; return (pz.x0 + pz.x1) / 2; },
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
  host = await openPage(`${BASE}/host.html?view=${view}&kind=ring&variant=fortress&tier=${arg("tier", "medium")}&cine=0`, 1600, 900, false, true);
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
  const view3d = (js) => host.ev('(()=>{ const v = window.view3dDebug().view.S; ' + js + '; return 1 })()');
  const look = (x, y, z) => view3d(`v.look = { x: ${x}, y: ${y} }; v.zoom = ${z}`);
  const unlook = (z = 0.8) => view3d(`v.look = null; v.zoom = ${z}`);
  let maxCalls = 0, maxAway = 0;
  const shot = async (name, settle = 50) => {
    await host.ev(`window.__a.settle(${settle})`);
    const m = await host.ev('(()=>{ const V = window.view3dDebug().view, st = V.stats(); let n = 0, tris = 0; V.away.root.traverse((o) => { if (o.isMesh && o.visible && (o.count === undefined || o.count > 0) && o.parent && o.parent.visible !== false) { n++; const g = o.geometry, c = g.index ? g.index.count : g.attributes.position.count; tris += (o.isInstancedMesh ? o.count : 1) * c / 3; } }); return { calls: st.calls, away: n, tris: Math.round(tris), live: !!V.away.live }; })()');
    if (m) { maxCalls = Math.max(maxCalls, m.calls); maxAway = Math.max(maxAway, m.away); console.log('    ' + name + ': ' + m.calls + ' calls, away team ' + m.away + ' meshes, ' + Math.round(m.tris / 1000) + 'k tris'); }
    await host.shot(`away3d_${name}.png`);
  };
  const want = (k) => only.includes(k);

  // ROPE: the ship hovers low over a plaza and the rope ladder hangs; then Mia climbs it
  if (want('rope')) {
    await host.ev('(async()=>{ const a = window.__a, st = a.st(), f = a.face(), G = st.groundSys, R0 = st.ships[0].layout.refPoint, px = a.plazaMid(); await a.offer("winch"); a.park(px + 400, f.y - 640); a.step(20); const sp = G.ropeSpot(); a.park(px + (R0.x - sp.x), f.y - 640); a.step(30); a.stand(px + 150); a.step(5); G.lowerRope(a.me()); a.step(40); return 1 })()');
    check(await host.ev('window.game.state.away.rope.out && window.game.state.away.rope.len > 100'), 'ROPE: the ladder hangs (' + Math.round(await host.ev('window.game.state.away.rope.len')) + ' px)');
    await look(await host.ev('window.game.state.away.rope.x'), await host.ev('window.game.state.away.rope.y + 150'), 1.5);
    await shot('rope_ladder');
    await host.ev('(()=>{ const a = window.__a, st = a.st(), G = st.groundSys, p = a.me(), R = st.away.rope; a.stand(R.x); p.x = R.x; G.mount(st.ships[0], p, R.len * 0.55); p.jy = -1; a.step(14); return 1 })()');
    check(await host.ev('window.__a.me().on.mode === "rope"'), 'ROPE: Mia is climbing it');
    await shot('climb_rope', 8);
    await host.ev('(()=>{ const a = window.__a; a.me().jy = 0; a.step(10); return 1 })()');
    await shot('climb_rope_hold', 8);
    await host.ev('(()=>{ const a = window.__a, p = a.me(); p.jy = 1; a.step(260); p.jy = 0; return 1 })()');
    await unlook();
  }
  // WALL: a wall ladder (mid-climb) and the wall walk's plank
  if (want('wall')) {
    await host.ev('(()=>{ const a = window.__a, st = a.st(), f = a.face(), l = st.away.ladders[0], p = a.stand(l.x + 40); a.park(l.x + 900, f.y - 900); a.step(30); p.on.mode = "ladder"; p.on.lad = l; p.on.s = 0.45; p.on.deck = l.deck; p.climb = true; p.x = l.x; p.y = l.y0 + 0.45 * (l.y1 - l.y0); p.jy = -1; a.step(8); return 1 })()');
    check(await host.ev('window.__a.me().on.mode === "ladder"'), 'WALL: Mia climbs a wall ladder');
    await look(await host.ev('window.__a.me().x'), await host.ev('window.__a.me().y'), 1.5);
    await shot('wall_ladder', 8);
    await host.ev('(()=>{ const a = window.__a, st = a.st(), dk = st.away.decks[0], p = a.me(); p.jy = 0; p.on.mode = "walk"; p.on.deck = dk; p.on.gy = dk.y; p.climb = false; p.x = dk.x0 + 420; p.y = dk.y; p.jx = 1; a.step(50); p.jx = 0; a.step(5); return 1 })()');
    await look(await host.ev('window.__a.me().x'), await host.ev('window.__a.me().y + 40'), 1.4);
    await shot('wall_walk', 20);
    await unlook();
  }
  // FLARE: rising (half a second), hanging (six seconds), the pickup ring and arrow on the ground
  if (want('flare')) {
    await host.ev('(()=>{ const a = window.__a, st = a.st(), f = a.face(), p = a.me(), px = a.plazaMid(); a.calm(true); a.stand(px + 120); a.park(px - 1500, f.y - 700); a.step(40); p.actQ = true; a.step(31); return 1 })()');
    check(await host.ev('window.game.state.away.flares.length === 1 && window.game.state.away.pickups.length === 1'), 'FLARE: lit, the pickup is called');
    await look(await host.ev('window.__a.me().x'), await host.ev('window.__a.me().y - 330'), 1.1);
    await shot('flare_rise', 2);
    await host.ev('window.__a.step(60 * 6); 1');
    await shot('flare_hang', 2);
    await look(await host.ev('window.__a.me().x'), await host.ev('window.__a.me().y - 100'), 1.9);
    await shot('pickup_ring', 2);
    await unlook();
  }
  // WINCH: idle, then being cranked
  if (want('winch')) {
    await host.ev('(async()=>{ await window.__a.offer("winch"); const a = window.__a, ob = a.ob("winch"); a.park(ob.x, a.face().y - 700); a.step(30); a.stand(ob.x - 140); a.step(5); return 1 })()');
    await look(await host.ev('window.__a.ob("winch").x'), await host.ev('window.__a.ob("winch").y - 160'), 1.7);
    await shot('winch');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("winch"); a.stand(ob.x - 60); a.step(5); a.me().fire = true; a.step(100); return 1 })()');
    check(await host.ev('window.__a.ob("winch").prog > 0.2'), 'WINCH: held');
    await shot('winch_held', 1);
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("winch"); a.holdFor(ob, 6); a.me().fire = false; a.step(5); return 1 })()');
    await shot('winch_done');
    await unlook();
  }
  // CHARGE: the keg pile, the keg carried, the charge planted with its fuse burning
  if (want('charge')) {
    await host.ev('(async()=>{ await window.__a.offer("charge"); const a = window.__a, ob = a.ob("charge"), keg = a.ob("keg"); a.park(ob.x - 300, a.face().y - 700); a.step(30); a.stand(keg.x - 130); a.step(5); return 1 })()');
    await look(await host.ev('window.__a.ob("keg").x'), await host.ev('window.__a.ob("keg").y - 120'), 1.9);
    await shot('keg');
    await host.ev('(()=>{ const a = window.__a, keg = a.ob("keg"); a.stand(keg.x - 20); a.step(5); a.holdFor(keg, 3); a.me().fire = false; a.step(40); return 1 })()');
    await look(await host.ev('window.__a.me().x'), await host.ev('window.__a.me().y - 120'), 2.4);
    await shot('keg_carried');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("charge"); a.stand(ob.x); a.me().carry = "crate"; a.step(3); a.holdFor(ob, 6); a.me().fire = false; a.me().x = ob.x + 420; a.step(110); return 1 })()');
    check(await host.ev('window.__a.ob("charge").state === "fuse"'), 'CHARGE: the fuse burns');
    await look(await host.ev('window.__a.ob("charge").x + 60'), await host.ev('window.__a.ob("charge").y - 140'), 1.9);
    await shot('charge_fuse', 1);
    await host.ev('(()=>{ const a = window.__a; a.me().x = a.ob("charge").x + 1400; a.step(60 * 8); return 1 })()');
    await unlook();
  }
  // BALLISTA: the sign at its tower, then jammed and smoking
  if (want('ballista')) {
    await host.ev('(async()=>{ window.__face = 2; await window.__a.offer("ballista"); const a = window.__a, ob = a.ob("ballista", 2); a.park(ob.x, a.face(2).y - 700); a.step(30); a.stand(ob.x - 150, 2); a.step(5); return 1 })()');
    await look(await host.ev('window.__a.ob("ballista", 2).x'), await host.ev('window.__a.ob("ballista", 2).y - 330'), 1.3);
    await shot('ballista');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("ballista", 2); a.stand(ob.x - 50, 2); a.step(5); a.holdFor(ob, 6); a.me().fire = false; a.step(60); window.__face = 0; return 1 })()');
    check(await host.ev('window.__a.face(2).special.silent === true'), 'BALLISTA: jammed');
    await shot('ballista_jam', 30);
    await unlook();
  }
  // BEACON: the brazier with its sign, then lit
  if (want('beacon')) {
    await host.ev('(async()=>{ await window.__a.offer("beacon"); const a = window.__a, ob = a.ob("beacon"); a.park(ob.x + (ob.x < a.face().x ? 400 : -400), a.face().y - 700); a.step(30); a.stand(ob.x - 150); a.step(5); return 1 })()');
    await look(await host.ev('window.__a.ob("beacon").x'), await host.ev('window.__a.ob("beacon").y - 200'), 1.6);
    await shot('beacon');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("beacon"); a.stand(ob.x - 60); a.step(5); a.holdFor(ob, 6); a.me().fire = false; a.step(100); return 1 })()');
    check(await host.ev('window.__a.ob("beacon").state === "done"'), 'BEACON: lit');
    await shot('beacon_lit', 1);
    await unlook();
  }
  // CAGE: closed with the three prisoners inside, open with them walking out and then climbing the rope
  if (want('cage')) {
    await host.ev('(async()=>{ await window.__a.offer("cage"); const a = window.__a, ob = a.ob("cage"), G = a.st().groundSys, R0 = a.st().ships[0].layout.refPoint; const x = ob.x + 560; a.park(x, a.face().y - 640); a.step(20); const sp = G.ropeSpot(); a.park(x + (R0.x - sp.x), a.face().y - 640); a.step(30); a.stand(ob.x - 140); a.step(5); return 1 })()');
    await look(await host.ev('window.__a.ob("cage").x'), await host.ev('window.__a.ob("cage").y - 150'), 1.8);
    await shot('cage');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("cage"); a.stand(ob.x - 70); a.step(5); a.holdFor(ob, 5); a.me().fire = false; a.step(36); return 1 })()');
    check(await host.ev('window.__a.O().prisoners.length === 3'), 'CAGE: three prisoners are out');
    await look(await host.ev('window.__a.ob("cage").x + 150'), await host.ev('window.__a.ob("cage").y - 150'), 1.5);
    await shot('prisoners_walk', 1);
    for (let i = 0; i < 40 && !(await host.ev('window.__a.O().prisoners.some((q) => q.state === "climb" && q.s < 150)')); i++) await host.ev('window.__a.step(20); 1');
    check(await host.ev('window.__a.O().prisoners.some((q) => q.state === "climb")'), 'CAGE: a prisoner climbs the rope');
    await look(await host.ev('window.game.state.away.rope.x'), await host.ev('window.game.state.away.rope.y + 130'), 1.6);
    await shot('prisoners_climb', 1);
    await unlook();
  }
  // BANNER: planted on its footing, then on Mia's back
  if (want('banner')) {
    await host.ev('(async()=>{ await window.__a.offer("banner"); const a = window.__a, ob = a.ob("banner"), G = a.st().groundSys, R0 = a.st().ships[0].layout.refPoint; a.park(ob.x + 700, a.face().y - 640); a.step(20); const sp = G.ropeSpot(); a.park(ob.x + 700 + (R0.x - sp.x), a.face().y - 640); a.step(30); a.stand(ob.x - 170); a.step(5); return 1 })()');
    await look(await host.ev('window.__a.ob("banner").x'), await host.ev('window.__a.ob("banner").y - 220'), 1.3);
    await shot('banner');
    await host.ev('(()=>{ const a = window.__a, ob = a.ob("banner"), G = a.st().groundSys; a.stand(ob.x - 40); a.step(5); a.holdFor(ob, 6); a.me().fire = false; a.step(5); G.lowerRope(a.me()); a.step(30); const p = a.me(); p.x = a.st().away.rope.x - 330; p.jx = 1; a.step(40); p.jx = 0; a.step(2); return 1 })()');
    check(await host.ev('window.__a.O().banner && window.__a.O().banner.carrier === window.__a.me().id'), 'BANNER: Mia carries it');
    await look(await host.ev('window.__a.me().x'), await host.ev('window.__a.me().y - 130'), 2.2);
    await shot('banner_carried', 1);
    await unlook();
  }

  check(maxCalls <= 150, 'the scene stays within 150 draw calls (max ' + maxCalls + '); the away team adds at most ' + maxAway + ' meshes (budget 8)');
  check(maxAway <= 8, 'the away team draws at most 8 meshes');
  // NIGHT: a lit beacon and a flare in the dark (the halos), and the wall ladder and plank lit by the lamps
  if (want('night')) {
    await host.ev('(async()=>{ await window.__a.offer("beacon"); const a = window.__a, ob = a.ob("beacon"); a.calm(true); a.park(ob.x + (ob.x < a.face().x ? 500 : -500), a.face().y - 700); a.step(30); a.stand(ob.x - 70); a.step(5); a.holdFor(ob, 6); a.me().fire = false; a.step(60); a.me().actQ = true; a.step(40); return 1 })()');
    await view3d('window.view3dDebug().view.setTod("night")');
    await host.ev('window.__a.settle(30)');
    await look(await host.ev('window.__a.ob("beacon").x + 80'), await host.ev('window.__a.ob("beacon").y - 260'), 1.1);
    await shot('night_beacon_flare', 60);
    await view3d('window.view3dDebug().view.setTod("day")');
    await unlook();
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
console.log(failed ? `away3d-shots: ${failed} FAILED` : `away3d-shots: all ok`);
process.exit(failed ? 1 : 0);
