// LOOP.md G4, FRAMES in a real headless Chrome: the sky-dock offers a gun twice (the plain card and the FRAME card), the crew buys the frame, the scaffold stands on its place, a crewman with empty hands gets the gold arrow to
// the hold bin, takes a bundle (GRAB), the phone says BUILD GUN MOUNT (n/m) at the frame, the bar fills while he holds Action, the part fills in as bundles go in, and the last one makes it come alive (NEW: call-out, the Log).
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise).
//   node tools/frames-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named frames_<view>_*.png. Exit 1 on any console error or a failed check. (The 3D look of the scaffold is R4: in 3d the HUD layer only.)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', 'C:/Users/kenny/Downloads/AIRSHIP/airship/3d-screenshots'));
const port = Number(arg('port', 6700 + Math.floor(Math.random() * 200)));
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
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261013);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-chrome-'));
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
  P.png = async (clip) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) })).data, 'base64');
  P.shot = async (name, clip) => { fs.writeFileSync(path.join(out, name), await P.png(clip)); console.log('  shot ' + name); };
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
  async settle(n = 60) { for (let i = 0; i < n; i++) await this.frame(); },
  vote(i) { for (const q of Object.values(window.game.state.players)) { q.vote = i; q.voteAt = 1e9; } },
  clear() { const st = window.game.state; st.strafers.length = 0; st.bombers.length = 0; st.bats.length = 0; st.boarders.length = 0; st.fires.length = 0; st.thrown.length = 0; },
};
`;

let host = null, phone = null;
// R4 (3d only): a close-up of the frame's place through the 3D view's own projection, saved as r4_<name>.png (the empty scaffold, half built, nearly full, the built moment, the finished part).
const R4Z = Math.max(1, Number(arg('r4zoom', 1)) || 1); // (--r4zoom 2 = the close-ups twice as close)
const r4 = async (name, w0 = 330, h0 = 210, clear = true) => {
  const w = Math.round(w0 / R4Z), h = Math.round(h0 / R4Z);
  if (view !== '3d') return;
  const c = await host.ev(`(()=>{ const V = window.view3dDebug().view, st = window.game.state, sh = st.ships[0], f = st.run.frames[0]; if (!V || !f) return null; const g = f.ghost || { x0: f.x - 44, x1: f.x + 44, y0: f.y - 74, y1: f.y + 12 }; const p = V.hud3d.shipPt(sh, (g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2, 0); const q = p && V.hud3d.project(p[0], p[1], p[2]); return q ? [q.x * innerWidth, q.y * innerHeight] : null })()`);
  if (!c) { check(false, 'r4 ' + name + ': the frame has no place on the screen'); return; }
  await host.shot(`r4_${name}.png`, { x: Math.max(0, Math.round(c[0] - w / 2)), y: Math.max(0, Math.round(c[1] - h / 2)), width: w, height: h, scale: 3 * R4Z });
  if (!clear) return;
  // ... and once more with the crewman stepped aside (he stands in front of the scaffold while he builds), then put back exactly
  const x0 = await host.ev('(()=>{ const p = window.__a.me(), x = p.x; p.x = x + 260; return x })()');
  await host.ev('window.__a.settle(14)');
  await host.shot(`r4_${name}_clear.png`, { x: Math.max(0, Math.round(c[0] - w / 2)), y: Math.max(0, Math.round(c[1] - h / 2)), width: w, height: h, scale: 3 * R4Z });
  await host.ev(`(()=>{ window.__a.me().x = ${x0}; return 1 })()`);
  await host.ev('window.__a.settle(10)');
};
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
  check(await host.ev('game.state.phase === "flying"'), 'cast off');
  check(await host.ev('(async () => { const { config } = await import("/config.js"); return config.SCRAP.ENABLED === true && config.FRAMES.ENABLED === true })()'), 'SCRAP and FRAMES are on in the browser');
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)

  // calm sky, the ship parked, three bundles in the hold, Mia on the main deck
  await host.ev(`(async () => { const { config } = await import('/config.js'); config.PARTS_SHOP.DERELICT_STOPS = []; config.SHOP.V2_PART_CHANCE = 1; const a = window.__a, st = a.st(); st.course.danger = 1; a.step(10); const sh = st.ships[0]; a.park(sh.pose.x + sh.layout.refPoint.x, sh.pose.y + sh.layout.refPoint.y); a.clear();
    st.scrapHold = { count: 3 }; st.run.salvage = 420; st.yardOnly = 'gun';
    for (const b of Object.values(st.players)) if (b.bot) { b.botJob = null; b.x = 200; }
    const p = a.me(), L = sh.layout, d = L.deckIndex('main');
    p.fall = false; p.fly = false; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.carry = null; p.d = d; p.x = 700; p.y = L.platforms[d].y; p.jx = p.jy = 0;
    a.step(20); return 1 })()`);

  // the sky-dock: the gun twice - the plain card (half cash, half bundles) and the FRAME card (a share of the salvage; carry the scrap yourself)
  await host.ev(`(async()=>{ const st = game.state; st.scorecard = null; st.vote = null; game.startDock(); return 1 })()`);
  check(await host.waitFor('!!game.state.vote && game.state.vote.kind === "dock"', 5000), 'the dock opens');
  console.log('  cards: ' + await host.ev('JSON.stringify(game.state.vote.options.map(o => [o.id, o.cost, o.scrap, o.need, o.frame]))'));
  check(await host.ev('game.state.vote.options.some(o => o.frame) && game.state.vote.options.some(o => o.kind === "part" && !o.frame)'), 'the gun is on offer twice: the plain card and its FRAME card');
  await host.ev('window.__a.step(30); window.__a.settle(90)');
  await sleep(900);
  await host.shot(`frames_${view}_tv_dock.png`);
  await phone.shot(`frames_${view}_phone_dock.png`);
  // buy the frame, vote for the first place
  await host.ev('(()=>{ const a = window.__a, v = a.st().vote; a.vote(v.options.findIndex(o => o.frame)); a.step(60 * 3); return 1 })()');
  for (let k = 0; k < 4 && await host.ev('game.state.vote && game.state.vote.kind === "slot"'); k++) {
    await host.ev('window.__a.step(30); window.__a.settle(60)');
    if (k === 0) { await sleep(500); await host.shot(`frames_${view}_tv_places.png`); }
    await host.ev('(()=>{ const a = window.__a; a.vote(0); a.step(60 * 4); return 1 })()');
  }
  check(await host.ev('game.state.run.frames.length === 1 && game.state.run.frames[0].fill === 0'), 'the frame was bought and stands on its place');
  await host.ev('window.__a.step(30); window.__a.settle(90)');
  await sleep(700);
  await host.shot(`frames_${view}_tv_dock_framed.png`);
  await phone.shot(`frames_${view}_phone_dock_framed.png`);
  console.log('  salvage ' + await host.ev('game.state.run.salvage') + ', hold ' + await host.ev('game.state.scrapHold.count'));
  // back to the sky: the dock closes
  await host.ev(`(()=>{ const a = window.__a, st = a.st(); st.vote = null; a.clear(); a.step(30); return 1 })()`);

  // Mia: empty hands, a bundle in the hold, a frame: the gold arrow to the bin (TAKE SCRAP OUT OF THE HOLD - TO BUILD THE GUN MOUNT)
  await host.ev(`(async () => { const a = window.__a, p = a.me(), st = a.st(), L = st.ships[0].layout; p.d = L.deckIndex('main'); p.x = 900; p.y = L.platforms[p.d].y; p.carry = null; p.freeT = 6; p.jobT = 0; p.jobAge = 99; a.step(40); return 1 })()`);
  await host.ev('window.__a.settle(60)');
  await sleep(500);
  console.log('  the arrow: ' + await host.ev('JSON.stringify(window.__a.me().job)'));
  check(await host.ev('window.__a.me().job && window.__a.me().job.kind === "buildgrab"'), 'empty hands, scrap in the hold, a frame waiting: the gold arrow is TAKE SCRAP OUT OF THE HOLD');
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent'));
  await host.shot(`frames_${view}_tv_arrow.png`);
  await phone.shot(`frames_${view}_phone_arrow.png`);

  // at the bin: GRAB takes a bundle out
  await host.ev(`(async () => { const { holdSpot } = await import('/modules/host/scrap.js'); const a = window.__a, p = a.me(), L = a.st().ships[0].layout, sp = holdSpot(L); p.d = sp.d; p.x = sp.x + 14; p.y = L.platforms[sp.d].y; p.jobT = 0; a.step(12); return 1 })()`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.grabLock = 0; p.grabQ = true; a.step(6); return 1 })()');
  check(await host.ev('window.__a.me().carry === "scrap" && window.game.state.scrapHold.count === 2'), 'GRAB at the bin took a bundle out (hold 3 -> 2)');
  // ... and carries it: the arrow now says BUILD GUN MOUNT
  await host.ev(`(async () => { const { frameSpot } = await import('/modules/host/buildFrames.js'); const a = window.__a, p = a.me(), st = a.st(), f = st.run.frames[0], sp = frameSpot(st.ships[0], f), L = st.ships[0].layout; p.d = sp.d; p.x = sp.x - 260; p.y = L.platforms[sp.d].y; p.jobT = 0; p.jobAge = 99; p.freeT = 6; a.step(20); return 1 })()`);
  await host.ev('window.__a.settle(60)');
  await sleep(500);
  console.log('  the arrow: ' + await host.ev('JSON.stringify(window.__a.me().job)') + ' | phone: ' + await phone.ev('document.getElementById("info").textContent'));
  check(await host.ev('window.__a.me().job && window.__a.me().job.kind === "buildframe" && /^BUILD /.test(window.__a.me().job.label)'), 'carrying a bundle: the gold arrow is BUILD GUN MOUNT (0/3)');
  await host.shot(`frames_${view}_tv_carry.png`);
  await phone.shot(`frames_${view}_phone_carry.png`);

  // at the frame: the big button reads BUILD GUN MOUNT (0/3)
  await host.ev(`(async () => { const { frameSpot } = await import('/modules/host/buildFrames.js'); const a = window.__a, p = a.me(), st = a.st(), f = st.run.frames[0], sp = frameSpot(st.ships[0], f); p.x = sp.x; p.jobT = 0; a.step(20); return 1 })()`);
  await sleep(500);
  const btn = await phone.ev('document.getElementById("act").textContent');
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent') + ' | big button: ' + btn);
  check(/BUILD GUN MOUNT \(0\/3\)/i.test(btn), 'the big button says BUILD GUN MOUNT (0/3)');
  console.log('  role verb: ' + await host.ev('window.__a.me().job && window.__a.me().job.verb'));
  await phone.shot(`frames_${view}_phone_build.png`);
  await host.ev('window.__a.settle(40)');
  await host.shot(`frames_${view}_tv_frame.png`);
  await r4('1_empty');

  // holding Action: the bar fills, the part fills in
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.fire = true; a.step(60); return 1 })()');
  await host.ev('window.__a.settle(30)');
  await phone.shot(`frames_${view}_phone_building.png`);
  await host.shot(`frames_${view}_tv_building.png`);
  await r4('2_first_bundle_going_in');
  await host.ev('(()=>{ const a = window.__a, p = a.me(); a.step(110); p.fire = false; a.step(10); return 1 })()');
  check(await host.ev('window.game.state.run.frames[0].fill === 1 && window.__a.me().carry === null'), 'one bundle in: the frame is 1/3, his hands are empty');
  await host.ev('window.__a.settle(60)');
  await host.shot(`frames_${view}_tv_frame1.png`);
  await r4('3_half_built');
  // two more bundles (from the hold, as another crewman would carry them)
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.carry = "scrap"; p.fire = true; a.step(170); p.fire = false; a.step(10); return 1 })()');
  check(await host.ev('window.game.state.run.frames[0].fill === 2 && !window.game.state.run.frames[0].done'), 'two bundles in: 2/3');
  await host.ev('window.__a.settle(60)');
  await host.shot(`frames_${view}_tv_frame2.png`);
  await host.shot(`frames_${view}_tv_frame2_closeup.png`, { x: 540, y: 520, width: 340, height: 190, scale: 4 });
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.carry = "scrap"; p.fire = true; a.step(95); return 1 })()'); // (the third bundle part way in: the band is high, nearly full)
  await host.ev('window.__a.settle(30)');
  await r4('4_nearly_full');
  if (view === '3d') { // R4: what the scaffold costs - the same frame drawn with it and without (config.FRAMES3D.ENABLED off for a moment)
    const calls = () => host.ev('(async () => { await window.__a.settle(6); const V = window.view3dDebug().view, i = V.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, own: V.frames3d.stats.calls, ms: +V.frames3d.stats.ms.toFixed(3) } })()');
    const withIt = await calls();
    await host.ev('(async () => { const { config } = await import("/config.js"); config.FRAMES3D.ENABLED = false; return 1 })()');
    const without = await calls();
    await host.ev('(async () => { const { config } = await import("/config.js"); config.FRAMES3D.ENABLED = true; return 1 })()');
    await host.ev('window.__a.settle(6)');
    console.log('  R4 cost: with ' + JSON.stringify(withIt) + ' without ' + JSON.stringify(without));
    check(withIt.calls - without.calls <= 3 && withIt.calls <= 150, 'the scaffold adds at most 3 draw calls (' + (withIt.calls - without.calls) + ') and the scene stays under 150 (' + withIt.calls + ')');
  }
  const modelGuns = () => host.ev('(()=>{ const V = window.view3dDebug().view, sh = game.state.ships[0], e = V && V.models.get(sh.id); return e ? { ver: e.ver, layoutVer: sh.layout.version, guns: [...e.model.parts.keys()].filter((k) => k.startsWith("gun:")).length, scaffold: !!(V.frames3d && V.frames3d.live) } : null })()');
  const mg0 = view === '3d' ? await modelGuns() : null;
  const guns0 = await host.ev('window.game.state.ships[0].layout.stations.filter(s => s.kind === "gun").length');
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.carry = "scrap"; p.fire = true; a.step(170); p.fire = false; a.step(10); return 1 })()');
  const guns1 = await host.ev('window.game.state.ships[0].layout.stations.filter(s => s.kind === "gun").length');
  check(await host.ev('window.game.state.run.frames[0].done') && guns1 === guns0 + 1, `the last bundle: the gun is alive (${guns0} -> ${guns1} guns)`);
  await host.ev('window.__a.settle(2)');
  await r4('5_built_moment_a', 330, 210, false);
  await host.ev('window.__a.settle(2)');
  await r4('5_built_moment_b', 330, 210, false);
  if (view === '3d') { // R4: growPart changed the layout's version, so the view built her model again and the new gun is in it; the scaffold is gone
    await host.ev('window.__a.settle(30)');
    const mg1 = await modelGuns();
    console.log('  3D model before ' + JSON.stringify(mg0) + ' after ' + JSON.stringify(mg1));
    check(mg0 && mg1 && mg1.ver === mg1.layoutVer && mg1.ver > mg0.ver && mg1.guns === mg0.guns + 1, 'the 3D ship was built again with the new gun (' + (mg0 && mg0.guns) + ' -> ' + (mg1 && mg1.guns) + ' gun parts)');
    check(mg0 && mg0.scaffold === true && mg1 && mg1.scaffold === false, 'the scaffold stood while it was built and is gone once the part is');
  }
  console.log('  built by: ' + await host.ev('JSON.stringify(window.game.state.run.parts.filter(p => p.frame))'));
  await host.ev('window.__a.step(40); window.__a.settle(60)');
  await sleep(500);
  await host.shot(`frames_${view}_tv_built.png`);
  await r4('6_finished_part');
  await host.shot(`frames_${view}_tv_built_closeup.png`, { x: 540, y: 520, width: 340, height: 190, scale: 4 });
  await phone.shot(`frames_${view}_phone_built.png`);
  console.log('  the Book: ' + await host.ev('JSON.stringify(game.state.moments.filter(m => m.kind === "frame-built").map(m => m.who))'));
  check(await host.ev('game.state.moments.some(m => m.kind === "frame-built" && m.who.includes("Mia"))'), 'the Book names Mia');

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
console.log(failed ? `frames-shots (${view}): ${failed} FAILED` : `frames-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
