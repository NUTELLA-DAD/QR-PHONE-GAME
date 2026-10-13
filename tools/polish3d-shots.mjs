// 3D.md section 34, THE 3D POLISH PASS (the treasure's vault and chests, the scrap patch's rivet plates, flotsam bundles) in a real headless Chrome: close-up shots of each new 3D look, the draw calls they add and the
// console errors. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). The sim is stepped by hand (frozen otherwise), so every picture is the same each time.
//   node tools/polish3d-shots.mjs [--out DIR] [--port N] [--only treasure,scrap] [--tier low|medium|high]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named polish3d_*.png. Exit 1 on any console error or failed check.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', 'C:/Users/kenny/Downloads/AIRSHIP/airship/3d-screenshots'));
const port = Number(arg('port', 6900 + Math.floor(Math.random() * 200)));
const only = String(arg('only', 'treasure,scrap')).split(',');
const tier = arg('tier', 'medium');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'polish3d-chrome-'));
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
  bots() { return Object.values(window.game.state.players).filter((q) => q.bot); },
  tre() { return window.game.state.away.tre; },
  map() { return window.game.state.course.map; },
  fell(k) { for (const t of window.game.state.course.turrets) if (t.outpost === k) t.dead = true; },
  over(k, gap, dx = 0) { // park so the rope's top hangs gap px over the ground of outpost k
    const st = window.game.state, S = st.away, out = this.map().outposts[k];
    this.park(out.x + dx, this.hold ? this.hold.y : out.y - 1500); this.step(2);
    for (let n = 0; n < 4; n++) { this.park(this.hold.x + (out.x + dx - S.rope.x), this.hold.y + (out.y - gap - S.rope.y)); this.step(2); }
  },
  stand(p, x) { // on the ground at x, as a landing makes him
    const G = window.game.state.groundSys, v = this.tre().vaults[0], gy = G.groundAt(x, v.y - 100);
    p.fall = false; p.fly = true; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.koGrace = 0; p.carry = null; p.hearts = 3;
    p.on = { away: true, mode: 'walk', deck: null, gy, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
    p.x = x; p.y = gy; p.jx = p.jy = 0; p.face = 1;
  },
  async settle(n = 40) { for (let i = 0; i < n; i++) await this.frame(); },
  V() { return window.view3dDebug().view; },
  look(x, y, z) { const S = this.V().S; S.look = { x, y }; S.zoom = z; },
  unlook(z = 0.8) { const S = this.V().S; S.look = null; S.zoom = z; },
  shipPt(sx, sy) { const st = window.game.state, p = this.V().hud3d.shipPt(st.ships[0], sx, sy, 0); return p ? { x: p[0], y: -p[1] } : null; }, // a ship-layout point -> map coordinates (y down)
  calls() { const V = this.V(), st = V.stats(); const ct = (root) => { let n = 0; if (!root) return 0; root.traverse((o) => { if (o.isMesh && o.visible && (o.count === undefined || o.count > 0)) { let p = o.parent, ok = true; while (p) { if (p.visible === false) ok = false; p = p.parent; } if (ok) n++; } }); return n; }; const sc = V.scrap, tr = V.treasure; let plates = 0; V.scene.traverse((o) => { if (o.name === 'scrapPlates' && o.visible) plates++; }); return { all: st.calls, treasure: ct(tr && tr.root), plates, tris: st.tris }; },
};
`;

let host = null, phone = null;
const peak = { all: 0, treasure: 0, plates: 0 };
try {
  host = await openPage(`${BASE}/host.html?view=3d&kind=open&tier=${tier}&cine=0&christen=0`, 1600, 900, false, true);
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
  await phone.ev("document.getElementById('rcard').dispatchEvent(new PointerEvent('pointerdown')); 1"); // (close the join card)
  check(await host.ev('window.view3dDebug && !!window.view3dDebug().view && !!window.view3dDebug().view.treasure && !!window.view3dDebug().view.scrap'), 'the 3D view has the treasure and scrap layers');
  const deltas = [];
  const delta = async (label) => { // the same picture with the treasure and scrap layers off, then on: what they add (flyers.js hands its old scrap boxes over while scrap3d is live)
    const set = (on) => host.ev(`(async () => { const { config } = await import('/config.js'); config.TREASURE3D.ENABLED = ${on}; config.SCRAP3D.ENABLED = ${on}; await window.__a.settle(14); return 1 })()`);
    await set(false); const off = await host.ev('window.__a.calls()');
    await set(true); const on = await host.ev('window.__a.calls()');
    if (off && on) { deltas.push(on.all - off.all); console.log(`    calls with the layers off ${off.all}, on ${on.all}: +${on.all - off.all}  (${label})`); }
  };
  const shot = async (name, settle = 40) => {
    await host.ev(`window.game.state.briefing = null; window.__a.settle(${settle})`);
    const c = await host.ev('window.__a.calls()');
    if (c) { for (const k of Object.keys(peak)) peak[k] = Math.max(peak[k], c[k] || 0); console.log(`    ${name}: ${c.all} calls (treasure layer ${c.treasure}, plate meshes ${c.plates}), ${Math.round((c.tris || 0) / 1000)}k tris`); }
    await host.shot(`polish3d_${name}.png`);
  };

  if (only.includes('treasure')) {
    console.log('-- treasure');
    // the first outpost falls: its vault opens beneath the ship, three chests (danger 4)
    await host.ev('(()=>{ const a = window.__a; a.st().course.danger = 4; a.step(10); a.over(0, 620, 0); return 1 })()');
    await host.ev('(()=>{ const a = window.__a; a.fell(0); a.step(1); return 1 })()');
    const vx = await host.ev('window.__a.map().outposts[0].x'), vy = await host.ev('window.__a.map().outposts[0].y');
    await host.ev(`window.__a.look(${vx}, ${vy} - 120, 2.2)`);
    // the door, key by key (the sim's clock: one key is 7.5 steps)
    let opened = false;
    for (let i = 0; i < 30 && !opened; i++) { await host.ev('window.__a.step(1)'); opened = await host.ev('window.__a.tre().vaults[0].state === "open"'); }
    check(opened, 'the vault opened');
    await shot('vault_door_0', 3);
    await host.ev('window.__a.step(15)');
    await shot('vault_door_2', 3);
    await host.ev('window.__a.step(15)');
    await shot('vault_door_4', 3);
    await host.ev('window.__a.step(30)');
    await shot('vault_open', 50);
    await delta('the vault open, three chests on the ground');
    // chests on the ground, close
    await host.ev(`window.__a.look(${vx}, ${vy} - 60, 3.0)`);
    await shot('chests_ground', 40);
    // a sack of gold lies in this vault too (for the picture: the hash decides in a real game)
    await host.ev(`(()=>{ const a = window.__a, t = a.tre(), v = t.vaults[0], G = window.game.state.groundSys; const x = v.x + 300, gy = G.groundAt(x, v.y - 100); t.chests.push({ id: 99, vault: 0, kind: 'gold', x, y: gy, state: 'ground', by: [], lifters: [], w: 2, pay: 4, prog: 0, worked: false, heist: false, label: 'GOLD', color: '#ffe27a' }); return 1 })()`);
    await host.ev(`window.__a.look(${vx} + 120, ${vy} - 60, 2.4)`);
    await shot('chests_and_sack', 40);
    // a man at a chest: the bar fills, the chest lifts a little
    await host.ev(`(()=>{ const a = window.__a, p = a.me(), c = a.tre().chests.find((q) => q.kind === 'chest'); a.stand(p, c.x - 50); a.step(8); p.fire = true; a.step(40); return 1 })()`);
    await host.ev(`window.__a.look(${vx}, ${vy} - 100, 2.4)`);
    await shot('chest_lift', 40);
    // Mia carries it alone
    await host.ev(`(()=>{ const a = window.__a, p = a.me(); a.step(60); p.fire = false; a.step(4); p.face = -1; p.jx = -1; a.step(260); p.jx = 0; a.step(2); return 1 })()`); // (she walks away from the vault, to the left)
    check(await host.ev('window.__a.me().carry === "chest"'), 'Mia carries a chest');
    await host.ev(`(()=>{ const p = window.__a.me(); window.__a.look(p.x, p.y - 80, 3.4); return 1 })()`);
    await shot('chest_carried_alone', 30);
    // a second man takes the other handle: a PAIR (the sim's own move, set directly: a bot on the ground)
    await host.ev(`(()=>{ const a = window.__a, me = a.me(), c = a.tre().chests.find((q) => q.state === 'carried'), b = a.bots()[0]; a.stand(b, me.x + 70); b.carry = "chest"; c.by.push(b.id); if (!c.lifters.includes(b.id)) c.lifters.push(b.id); b.face = -1; me.face = -1; a.step(4); window.__pair = c.id; return 1 })()`);
    check(await host.ev('window.__a.tre().chests.some((c) => c.state === "carried" && c.by.length === 2)'), 'two men carry one chest');
    await host.ev(`(()=>{ const p = window.__a.me(); window.__a.look(p.x + 35, p.y - 80, 3.0); return 1 })()`);
    await shot('chest_carried_pair', 30);
    // the sack of gold in his arms
    await host.ev(`(()=>{ const a = window.__a, me = a.me(), t = a.tre(), c = t.chests.find((q) => q.state === 'carried'), b = a.bots()[0]; c.by.splice(c.by.indexOf(b.id), 1); b.carry = null; b.on = null; b.fly = false; /* back aboard */ c.state = 'ground'; c.by = []; me.carry = null; const g = t.chests.find((q) => q.kind === 'gold'); g.state = 'carried'; g.by = [me.id]; me.carry = 'chest'; a.step(3); return 1 })()`);
    await host.ev(`(()=>{ const p = window.__a.me(); window.__a.look(p.x, p.y - 80, 3.4); return 1 })()`);
    await shot('sack_carried', 30);
    // up the rope and into the hold: three chests and a sack stacked behind the bin (put there directly for the picture)
    await host.ev(`(async()=>{ const a = window.__a, st = a.st(), t = a.tre(), me = a.me(); me.on = null; me.carry = null; me.fly = false; me.d = st.ships[0].layout.deckIndex('main'); me.x = st.ships[0].layout.refPoint.x - 400; me.y = st.ships[0].layout.platforms[me.d].y;
      const hold = (st.chestHold ||= { list: [], w: 0 }); hold.list.length = 0; for (const c of t.chests) { if (hold.list.length < 5) { c.state = 'hold'; c.by = []; hold.list.push(c); } } hold.w = hold.list.length * 6; a.step(4); return 1 })()`);
    await host.ev(`(async () => { const { holdSpot } = await import('/modules/host/scrap.js'); const a = window.__a, L = a.st().ships[0].layout, sp = holdSpot(L), q = a.shipPt(sp.x, L.platforms[sp.d].y - 40); window.__hold = q; a.look(q.x, q.y, 3.0); return 1 })()`);
    await shot('chests_in_hold', 50);
    await host.ev('window.__a.unlook(0.8)');
    await shot('hold_wide', 40);
    await delta('a hold with chests in it');
    await host.ev('window.__a.unlook(0.8)');
  }

  if (only.includes('scrap')) {
    console.log('-- scrap');
    await host.ev(`(async () => { const a = window.__a, st = a.st(); st.course.danger = 1; for (const o of a.map().outposts) o.done = false; if (st.chestHold) { st.chestHold.list.length = 0; st.chestHold.w = 0; } a.step(10); const sh = st.ships[0]; a.park(sh.pose.x + sh.layout.refPoint.x, sh.pose.y + sh.layout.refPoint.y - 500);
      st.strafers.length = 0; st.bombers.length = 0; st.bats.length = 0; st.boarders.length = 0; st.scrapHold = { count: 5 }; a.step(10); return 1 })()`);
    // plates: 1, 2 and 3 on the main deck's aft segment (as the patch would leave them)
    await host.ev(`(async () => { const a = window.__a, st = a.st(), sh = st.ships[0], L = sh.layout, d = L.deckIndex('main'); const segs = sh.sim.structure.segs().filter((g) => g.d === d && !g.nest); window.__seg = segs.find((g) => g.critical) || segs[0]; window.__seg2 = segs.find((g) => g !== window.__seg) || segs[0]; for (const b of a.bots()) { b.d = d; b.x = window.__seg.x - 300; b.botJob = null; } a.step(2); return 1 })()`);
    for (const n of [1, 2, 3]) {
      await host.ev(`(() => { const a = window.__a, st = a.st(), L = st.ships[0].layout; window.__seg.plates = ${n}; window.__seg.hp = 0.6; a.step(2); const q = a.shipPt(window.__seg.x, L.platforms[window.__seg.d].y + 20); a.look(q.x, q.y, 2.3); return 1 })()`);
      await shot(`plates_${n}`, 40);
    }
    // two segments plated at once, seen at the plain zoom (the sofa's view)
    await host.ev(`(() => { const a = window.__a, st = a.st(), L = st.ships[0].layout; window.__seg2.plates = 2; a.step(2); a.unlook(0.8); return 1 })()`);
    await shot('plates_wide', 40);
    await delta('five plates on two segments, the hold bin with 5 bundles');
    await host.ev(`(() => { const a = window.__a, st = a.st(), L = st.ships[0].layout; const q = a.shipPt(L.refPoint.x, L.platforms[window.__seg.d].y - 120); a.look(q.x, q.y, 1.5); return 1 })()`);
    await shot('plates_ship', 40);
    // flotsam on chutes above the ship, bundles lying on two decks, the hold bin with 5 of 8
    await host.ev(`(() => { const a = window.__a, st = a.st(), sh = st.ships[0], L = sh.layout, R = L.refPoint, ox = sh.pose.x + R.x, oy = sh.pose.y + R.y;
      st.thrown.length = 0; let id = 9000; for (const [dx, dy] of [[-260, -820], [-120, -940], [60, -780], [220, -900]]) st.thrown.push({ id: ++id, kind: 'scrap', x: ox + dx, y: oy + dy, vx: 0, vy: 0, t: 0, from: null, spin: 0, rot: (dx % 3) * 0.05, chute: true, src: 'x' });
      st.thrown.push({ id: ++id, kind: 'scrap', x: ox + 360, y: oy - 700, vx: 0, vy: 0, t: 0, from: null, spin: 0, rot: 0.3, chute: false, src: 'x' });
      const ld = (st.loads ||= []); ld.length = 0; const d = L.deckIndex('main'), d2 = L.deckIndex('lower'); const P = L.platforms; for (const [dd, x] of [[d, R.x - 60], [d, R.x + 160], [d2, R.x + 20]]) if (P[dd]) ld.push({ id: ++id, kind: 'scrap', w: 1, d: dd, x, t: 5, from: sh.id, owner: null, prog: 0 });
      window.__ox = ox; window.__oy = oy; a.look(ox, oy - 520, 1.0); return 1 })()`);
    await shot('bundles_chutes', 40);
    await delta('four bundles on chutes and one tumbling, three on the decks, the bin');
    await host.ev(`(() => { const a = window.__a, st = a.st(), L = st.ships[0].layout, R = L.refPoint, d = L.deckIndex('main'); const q = a.shipPt(R.x + 50, L.platforms[d].y - 60); a.look(q.x, q.y, 2.6); return 1 })()`);
    await shot('bundles_decks', 40);
    await host.ev(`(async () => { const { holdSpot } = await import('/modules/host/scrap.js'); const a = window.__a, st = a.st(), L = st.ships[0].layout, sp = holdSpot(L), q = a.shipPt(sp.x, L.platforms[sp.d].y - 40); a.look(q.x, q.y, 3.2); return 1 })()`);
    await shot('bundles_hold', 40);
    await host.ev('window.__a.st().scrapHold = { count: 8 }');
    await shot('bundles_hold_full', 30);
    await host.ev('(() => { const st = window.__a.st(); st.thrown.length = 0; st.loads.length = 0; window.__a.unlook(0.8); return 1 })()');
  }

  console.log('  the layers\' own JS, last frame: ' + await host.ev('(() => { const V = window.view3dDebug().view; return `scrap ${V.scrap.stats.ms.toFixed(2)} ms (${V.scrap.stats.bundles} bundles, ${V.scrap.stats.plates} plates, ${V.scrap.stats.rebuilds} rebuilds), treasure ${V.treasure.stats.ms.toFixed(2)} ms (${V.treasure.stats.chests} chests, ${V.treasure.stats.rebuilds} rebuilds)`; })()'));
  console.log(`  what the layers add: ${deltas.map((d) => (d > 0 ? '+' : '') + d).join(', ')} draw calls`);
  check(deltas.every((d) => d <= 6), 'the layers add at most 6 draw calls in any of those scenes');
  console.log(`  peak: ${peak.all} calls in a scene, the treasure layer at most ${peak.treasure}, ${peak.plates} plate mesh`);
  check(peak.all <= 150, 'no scene over 150 draw calls');
  check(peak.treasure <= 3, 'the treasure layer adds at most 3 draw calls');
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
console.log(failed ? `polish3d-shots: ${failed} FAILED` : 'polish3d-shots: all ok');
process.exit(failed ? 1 : 0);
