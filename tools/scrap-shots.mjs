// LOOP.md G2 + the scrap patch (FUN.md F7) in a real headless Chrome: a crewman with empty hands and scrap in the hold gets the gold arrow to the bin, takes a bundle (GRAB), the phone says PATCH for a failing segment, the
// bar fills while he holds Action, the riveted plate stays on the hull (2D look), and the sky-dock shows the Yard's prices in scrap ("Salvage 45 + 2 scrap", one bundle for each the card asks) with a full hold and with an empty one.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server. The sim is stepped by hand (frozen otherwise).
//   node tools/scrap-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named scrap_<view>_*.png. Exit 1 on any console error or a failed check.
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
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261012);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W, H, mobile, frozen) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scrap-chrome-'));
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
  P.png = async (clip) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) })).data, 'base64'); // (clip { x, y, width, height, scale }: a close-up)
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
  str() { return window.game.state.ships[0].sim.structure; },
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
  check(await host.ev('game.state.phase === "flying"'), 'cast off');
  check(await host.ev('(async () => { const { config } = await import("/config.js"); return config.SCRAP.ENABLED === true })()'), 'SCRAP.ENABLED is on in the browser');
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)

  // the scene: the ship parked in calm sky, her main deck aft segment failing, Mia on it with empty hands, four bundles in the hold
  await host.ev(`(async () => { const a = window.__a, st = a.st(); st.course.danger = 1; a.step(10); const sh = st.ships[0]; a.park(sh.pose.x + sh.layout.refPoint.x, sh.pose.y + sh.layout.refPoint.y);
    st.strafers.length = 0; st.bombers.length = 0; st.bats.length = 0; st.boarders.length = 0;
    const L = sh.layout, d = L.deckIndex('main'), segs = a.str().segs().filter((g) => g.d === d && !g.nest);
    const seg = segs.find((g) => g.critical) || segs[0], p = a.me();
    window.__seg = seg; seg.hp = 0.2; st.scrapHold = { count: 4 };
    for (const b of Object.values(st.players)) if (b.bot) { b.d = d; b.x = seg.x - 500; b.botJob = null; }
    p.fall = false; p.fly = false; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.carry = null; p.d = d; p.x = seg.x - 230; p.y = L.platforms[d].y; p.jx = p.jy = 0; p.freeT = 6; p.jobT = 0;
    a.step(20); return 1 })()`);
  await host.ev('window.__a.step(40); window.__a.settle(60)');
  await sleep(600);
  const seg0 = await host.ev('JSON.stringify({ hp: window.__seg.hp, name: window.__a.str().nameOf(window.__seg), worst: window.game.state.structWorst })');
  console.log('  segment: ' + seg0);
  const job0 = await host.ev('JSON.stringify(window.__a.me().job)');
  console.log('  the arrow: ' + job0);
  check(await host.ev('window.__a.me().job && window.__a.me().job.kind === "scrapgrab"'), 'empty hands, scrap in the hold, a failing segment: the gold arrow is TAKE SCRAP OUT OF THE HOLD');
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent'));
  await host.shot(`scrap_${view}_tv_failing.png`);
  await phone.shot(`scrap_${view}_phone_arrow.png`);

  // at the bin: GRAB takes a bundle out
  await host.ev(`(async () => { const { holdSpot } = await import('/modules/host/scrap.js'); const a = window.__a, p = a.me(), L = a.st().ships[0].layout, sp = holdSpot(L); p.d = sp.d; p.x = sp.x + 14; p.y = L.platforms[sp.d].y; p.jobT = 0; a.step(12); return 1 })()`);
  await sleep(500);
  console.log('  phone at the bin: ' + await phone.ev('document.getElementById("info").textContent') + ' | big button: ' + await phone.ev('document.getElementById("act").textContent'));
  await phone.shot(`scrap_${view}_phone_bin.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.grabLock = 0; p.grabQ = true; a.step(6); return 1 })()');
  check(await host.ev('window.__a.me().carry === "scrap" && window.game.state.scrapHold.count === 3'), 'GRAB at the bin took a bundle out (hold 4 -> 3)');

  // he walks to the segment: the phone says PATCH
  await host.ev(`(()=>{ const a = window.__a, p = a.me(), seg = window.__seg, L = a.st().ships[0].layout; p.d = seg.d; p.x = seg.x - 40; p.y = L.platforms[seg.d].y; p.jobT = 0; p.jobAge = 99; p.freeT = 6; a.step(20); return 1 })()`);
  await sleep(500);
  const btn = await phone.ev('document.getElementById("act").textContent');
  console.log('  phone: ' + await phone.ev('document.getElementById("info").textContent') + ' | big button: ' + btn);
  check(/PATCH/i.test(btn), 'the big button says PATCH ... (scrap) at the failing segment');
  console.log('  role verb: ' + await host.ev('window.__a.me().job && window.__a.me().job.verb'));
  await phone.shot(`scrap_${view}_phone_patch.png`);

  // holding Action: the bar fills, then the plate is on
  await host.ev('(()=>{ const a = window.__a, p = a.me(); p.fire = true; a.step(70); return 1 })()');
  await host.ev('window.__a.settle(40)');
  await host.shot(`scrap_${view}_tv_patching.png`);
  await host.ev('(()=>{ const a = window.__a, p = a.me(); a.step(70); p.fire = false; a.step(10); return 1 })()');
  const after = await host.ev('JSON.stringify({ hp: Math.round(window.__seg.hp * 100) / 100, plates: window.__seg.plates, carry: window.__a.me().carry, hold: window.game.state.scrapHold.count })');
  console.log('  after: ' + after);
  check(await host.ev('window.__seg.plates === 1 && window.__seg.hp > 0.45 && window.__a.me().carry === null'), 'one bundle riveted on: +0.3 soundness, a plate on the hull, hands empty');
  await host.ev('window.__a.settle(90)');
  await host.shot(`scrap_${view}_tv_plated.png`);
  // a second bundle: two plates side by side
  await host.ev('(()=>{ const a = window.__a, p = a.me(); window.__seg.hp = 0.3; p.carry = "scrap"; p.fire = true; a.step(140); p.fire = false; a.step(10); return 1 })()');
  check(await host.ev('window.__seg.plates === 2'), 'a second bundle: two plates');
  await host.ev('window.__a.settle(90)');
  await host.shot(`scrap_${view}_tv_plated2.png`);
  await host.shot(`scrap_${view}_tv_plates_closeup.png`, { x: 560, y: 470, width: 480, height: 220, scale: 3 });

  // the sky-dock: prices in scrap (a full-ish hold, then an empty one)
  for (const [tag, hold, partChance] of [['dock_hold', 6, 1], ['dock_empty', 0, 1], ['dock_fitting', 6, 0]]) {
    await host.ev(`(async()=>{ const { config } = await import('/config.js'); config.SHOP.V2_PART_CHANCE = ${partChance}; const st = game.state; st.scorecard = null; st.vote = null; st.run.salvage = 420; st.scrapHold = { count: ${hold} }; st.ship.fuel = 20; for (const g of st.ships[0].sim.structure.segs()) g.hp = Math.min(g.hp, 0.8); game.startDock(); return 1 })()`);
    check(await host.waitFor('!!game.state.vote && game.state.vote.kind === "dock"', 5000), `the ${tag} opens`);
    console.log('  cards: ' + await host.ev('JSON.stringify(game.state.vote.options.map(o => [o.id, o.cost, o.scrap, o.scrapPay]))'));
    await host.ev('window.__a.step(30); window.__a.settle(90)');
    await sleep(900);
    await host.shot(`scrap_${view}_tv_${tag}.png`);
    await phone.shot(`scrap_${view}_phone_${tag}.png`);
    if (hold === 6 && partChance === 1) {
      check(await host.ev('game.state.vote.options.some(o => o.scrap > 0 && o.scrapPay === o.scrap && o.cost < o.base)'), 'with scrap in the hold a card costs half in cash plus its bundles');
    }
    if (hold === 0) check(await host.ev('game.state.vote.options.filter(o => o.scrap).every(o => o.scrapPay === 0 && o.cost === o.base)'), 'with an empty hold the card costs the old price in cash');
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
console.log(failed ? `scrap-shots (${view}): ${failed} FAILED` : `scrap-shots (${view}): all ok`);
process.exit(failed ? 1 : 0);
