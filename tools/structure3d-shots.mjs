// STRUCTURE.md WP5, THE FRAME IN 3D, in a real headless Chrome: the soot and cracks of a hurt segment (100 / 70 / 40 / 15 %), a segment that is failing, the seam during the grace, the split, the falling half and its crash.
//   node tools/structure3d-shots.mjs [--out DIR] [--port N] [--only soot,failing,seam,split,crash-sea,crash-ground] [--tier medium|high|low] [--prefix wp5_]
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). The simulation is frozen and stepped by hand, and so is the 3D picture's clock (window.__frozenNow: one key of the view is
// 125 ms), so every shot is the same every time. Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named wp5_*.png. Exit 1 on a console error or a failed check.
// It also prints the draw calls the layer adds (with the layer's config.STRUCT3D.ENABLED off and on in the same frame) and fails over 4 extra calls or 150 in the scene.
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
const only = (arg('only', '') || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const tier = arg('tier', 'medium');
const prefix = arg('prefix', 'wp5_');
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

async function openPage(url, W, H) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot3d-struct-'));
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
  const isFav = (s) => /favicon|navigator.vibrate/.test(s || '');
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    const q = d.params || {};
    if (d.method === 'Runtime.consoleAPICalled') {
      const text = q.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400);
      if (q.type === 'error' && !isFav(text)) P.errors.push('console.error: ' + text);
      else if (q.type === 'warning' && /^(view3d |3D view problem|3D view stopped|wreckage|wreckage physics)/.test(text)) P.errors.push(text);
    } else if (d.method === 'Runtime.exceptionThrown') P.errors.push('EXCEPTION: ' + ((q.exceptionDetails.exception && q.exceptionDetails.exception.description) || q.exceptionDetails.text).slice(0, 500));
    else if (d.method === 'Log.entryAdded') { if (q.entry.level === 'error' && !isFav(q.entry.url) && !isFav(q.entry.text)) P.errors.push('log: ' + q.entry.text.slice(0, 200)); }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED + FREEZE });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500)); return undefined; }
    return r.result.value;
  };
  P.png = async (clip) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { scale: 1, ...clip } } : {}) })).data, 'base64');
  P.shot = async (name, clip) => { fs.writeFileSync(path.join(out, prefix + name + '.png'), await P.png(clip)); console.log('  shot ' + prefix + name + '.png'); };
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

// In the page: helpers that hold the ship where a shot wants her while the sim is stepped by hand, poke a segment, and move the 3D picture's clock by whole keys.
const PRE = `
window.__a = {
  hold: null,
  st: () => window.game.state,
  V: () => window.view3dDebug().view,
  ship: (i = 0) => window.game.state.ships[i],
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  park(x, y) { this.hold = { x, y }; this.pin(); },
  pin() { if (!this.hold) return; const st = window.game.state, sh = st.ships[0], R = sh.layout.refPoint; sh.pose.x = this.hold.x - R.x; sh.pose.y = this.hold.y - R.y; sh.pose.vy = 0; sh.pose.f = 1; st.ship.speed = 0; st.ship.order = 0; },
  step(n) { for (let i = 0; i < n; i++) { this.pin(); window.__upd(1/60); } },
  clear() { const st = window.game.state; st.strafers.length = 0; st.bombers.length = 0; st.bats.length = 0; st.boarders.length = 0; st.fires.length = 0; st.thrown.length = 0; st.breaches.length = 0; },
  segs() { return window.game.state.frames; },
  mid(row) { const f = window.game.state.frames.filter((g) => g.critical && (!row || g.row === row)); const gx = f.map((g) => g.x); const m = (Math.min(...gx) + Math.max(...gx)) / 2; return f.sort((a, b) => Math.abs(a.x - m) - Math.abs(b.x - m))[0]; },
  col(i) { const g = window.game.state.frames[i]; return window.game.state.frames.map((o, j) => (!o.nest && Math.min(o.x1, g.x1) - Math.max(o.x0, g.x0) > 30 ? j : -1)).filter((j) => j >= 0); }, // (the segments of every deck that stand over each other: a split needs the whole cross-section to fail)
  setAll(hp) { for (const g of window.game.state.frames) { g.hp = hp; g.hold = null; } },
  // the 3D clock: the picture is drawn at window.__frozenNow; keys(n) moves it n keys (125 ms) with a frame drawn at each, so what grows on the 8 fps key grows
  keys(n) { if (!Number.isFinite(window.__frozenNow)) window.__frozenNow = performance.now(); for (let i = 0; i < n; i++) { window.__frozenNow += 125; window.renderNow(0.125); } },
  async settle(n = 4) { for (let i = 0; i < n; i++) await this.frame(); },
  // where a ship point is on the screen (px), through the 3D view's own projection
  scr(x, y, i = 0) { const V = this.V(), sh = this.ship(i), p = V.hud3d.shipPt(sh, x, y, 0), q = p && V.hud3d.project(p[0], p[1], p[2]); return q ? [q.x * innerWidth, q.y * innerHeight] : null; },
  calls() { const V = this.V(), i = V.renderer.info; return { calls: V.stats().sceneCalls, tris: V.stats().sceneTris, own: V.struct ? V.struct.stats.calls : -1 }; },
};
`;

let host = null;
const W = 1600, H = 900;
async function boot(query) {
  host = await openPage(`${BASE}/host.html?view=3d&${query}&tier=${tier}&cine=0&christen=0`, W, H);
  check(await host.waitFor('window.__meter!==undefined', 60000), 'the host page is up');
  await host.ev(PRE);
  await host.ev(`(async()=>{ const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); document.getElementById('bots').click(); await sl(300); document.getElementById('castoff').click(); window.__step(180); await sl(300); return 1 })()`);
  check(await host.ev('game.state.phase === "flying"'), 'cast off');
  await host.ev(`(async () => { const a = window.__a, st = a.st(); st.course.danger = 1; a.step(10); const sh = st.ships[0]; a.park(sh.pose.x + sh.layout.refPoint.x, sh.pose.y + sh.layout.refPoint.y); a.clear();
    for (const b of Object.values(st.players)) if (b.bot) { b.botJob = null; b.x = 80 + Math.random() * 40; }
    a.step(20); window.__frozenNow = performance.now(); return 1 })()`);
  await host.ev('window.__a.settle(30)');
  check(await host.ev('window.__a.V() && window.__a.V().struct && true'), 'the 3D view and the structure layer are up');
}
async function finish() {
  const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 8)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
  await host.close();
  host = null;
}
// a crop around a segment (px of the screen) at 2x
const ZOOM = Math.max(1, Number(arg('zoom', 1)) || 1); // (--zoom 2: every close-up twice as close)
async function cropShot(name, x, y, w = 620, h = 360, scale = 2) {
  w = Math.round(w / ZOOM); h = Math.round(h / ZOOM); scale *= ZOOM;
  const c = await host.ev(`window.__a.scr(${x}, ${y})`);
  if (!c) { check(false, name + ': the spot has no place on the screen'); return; }
  await host.shot(name, { x: Math.max(0, Math.round(c[0] - w / 2)), y: Math.max(0, Math.round(c[1] - h / 2)), width: w, height: h, scale });
}
const SEGINFO = `(()=>{ const g = window.__a.mid('main'); return g ? { sig: g.sig, x: g.x, y: (g.y0 + g.y1) / 2, x0: g.x0, x1: g.x1, y0: g.y0, y1: g.y1, i: window.game.state.frames.indexOf(g), n: window.game.state.frames.length } : null })()`;

try {
  // ---- soot and cracks: one segment at 100 / 70 / 40 / 15 % ------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('soot') || want('failing') || want('seam') || want('split')) {
    await boot('env=skyisles&kind=open');
    const seg = await host.ev(SEGINFO);
    console.log('  the middle main-deck segment: ' + JSON.stringify(seg));
    check(!!seg && seg.n >= 6, 'the ship has a frame of segments (' + (seg && seg.n) + ')');
    const set = (i, hp) => host.ev(`(()=>{ const a = window.__a; a.setAll(1); const g = a.segs()[${i}]; g.hp = ${hp}; a.step(2); a.keys(14); return g.hp })()`);
    if (arg('probe')) { await host.ev(`(()=>{ const a = window.__a; a.setAll(1); const g = a.segs()[${seg.i}]; g.hp = ${Number(arg('probe-hp', 0.4))}; a.step(2); a.keys(14); return 1 })()`); console.log('  probe -> ' + JSON.stringify(await host.ev(arg('probe')))); }
    if (want('soot')) {
      for (const [name, hp] of [['100', 1], ['70', 0.7], ['40', 0.4], ['15', 0.15]]) {
        await set(seg.i, hp);
        await host.ev('window.__a.settle(3)');
        console.log('  soot ' + name + ' texel row 3: ' + await host.ev(`(()=>{ const m = window.__a.V().models.get(window.__a.ship(0).id).model.ctx.mats, d = m.dmgData; return JSON.stringify([...d.slice(3*512*4, 3*512*4+4)].map(v => +v.toFixed(2))) + ' n=' + m.uSegN.value })()`));
        await cropShot(`soot_${name}`, seg.x, seg.y);
      }
      // the whole ship with several segments hurt, and what it costs
      await host.ev(`(()=>{ const a = window.__a; a.setAll(1); const s = a.segs().filter((g) => !g.nest); s.forEach((g, i) => { g.hp = [1, 0.85, 0.62, 0.38, 1, 0.22, 0.7, 1][i % 8]; }); a.step(2); a.keys(14); return 1 })()`);
      await host.ev('window.__a.settle(3)');
      await host.shot('ship_hurt');
      const withIt = await host.ev('window.__a.calls()');
      await host.ev('(async () => { const { config } = await import("/config.js"); config.STRUCT3D.ENABLED = false; window.__a.setAll(1); window.__a.keys(2); return 1 })()');
      const without = await host.ev('window.__a.calls()');
      await host.ev('(async () => { const { config } = await import("/config.js"); config.STRUCT3D.ENABLED = true; return 1 })()');
      console.log('  cost: hurt ship ' + JSON.stringify(withIt) + ' | undamaged ' + JSON.stringify(without));
      check(withIt.calls === without.calls, 'soot and cracks add no draw call (' + withIt.calls + ' against ' + without.calls + ')');
    }
    // ---- a failing segment, then the seam of the grace ------------------------------------------------------------------------------------------------------------------------------------------------------
    if (want('failing') || want('seam') || want('split')) {
      await host.ev(`(()=>{ const a = window.__a; a.setAll(1); const col = a.col(${seg.i}); for (const j of col) { const g = a.segs()[j]; g.hp = 0.02; g.hold = { t: 0.5, max: 8 }; } a.segs().forEach((g, j) => { if (!col.includes(j) && !g.nest) g.hp = [0.62, 0.38, 0.8, 0.5][j % 4]; }); a.step(2); a.keys(12); return 1 })()`); // (the rest of her is hurt too: what the halves wear after the split)
      if (want('failing')) {
        for (const k of [0, 1]) { // an "on" key and an "off" key of the blink
          await host.ev(`(()=>{ const a = window.__a; let n = 0; while (n++ < 4 && ((Math.floor(window.__frozenNow / 125)) & 1) !== ${k}) a.keys(1); return 1 })()`);
          await cropShot(`failing_${k ? 'off' : 'on'}`, seg.x, seg.y, 760, 420);
        }
        await host.shot('failing_wide');
      }
      if (want('seam')) {
        for (const [name, t] of [['early', 2.4], ['late', 7.0]]) {
          await host.ev(`(()=>{ const a = window.__a; for (const j of a.col(${seg.i})) { const g = a.segs()[j]; g.hold.t = ${t}; g.hold.max = 8; } a.keys(4); let n = 0; while (n++ < 4 && ((Math.floor(window.__frozenNow / 125)) & 1) !== 0) a.keys(1); return 1 })()`);
          await cropShot(`seam_${name}`, seg.x, seg.y, 760, 460);
          if (name === 'late') await host.shot('seam_wide');
        }
        const withIt = await host.ev('window.__a.calls()');
        await host.ev('(async () => { const { config } = await import("/config.js"); config.STRUCT3D.ENABLED = false; window.__a.keys(2); return 1 })()');
        const without = await host.ev('window.__a.calls()');
        await host.ev('(async () => { const { config } = await import("/config.js"); config.STRUCT3D.ENABLED = true; window.__a.keys(2); return 1 })()');
        console.log('  cost: seam ' + JSON.stringify(withIt) + ' | off ' + JSON.stringify(without));
        check(withIt.calls - without.calls <= 4 && withIt.calls <= 150, 'the seam adds at most 4 draw calls (' + (withIt.calls - without.calls) + ') and the scene stays under 150 (' + withIt.calls + ')');
      }
      // ---- the split: step until she comes apart ----------------------------------------------------------------------------------------------------------------------------------------------------------
      if (want('split')) {
        await host.ev(`(()=>{ const a = window.__a; for (const j of a.col(${seg.i})) { const g = a.segs()[j]; g.hold.t = 7.6; g.hold.max = 8; } a.keys(2); return 1 })()`);
        const n0 = await host.ev('window.game.state.ships.length');
        const stepped = await host.ev(`(()=>{ const a = window.__a, st = window.game.state; let n = 0; while (n < 400 && st.ships.length === ${n0}) { a.step(1); n++; } return n })()`);
        const n1 = await host.ev('window.game.state.ships.length');
        console.log('  split after ' + stepped + ' steps: ships ' + n0 + ' -> ' + n1);
        check(n1 === n0 + 1, 'the segment gave way and she split in two (a piece ship appeared)');
        await host.ev('window.__a.hold = null; window.__a.keys(1)');
        await host.shot('split_a');
        await cropShot('split_a_close', seg.x, seg.y, 900, 520, 1.6);
        await host.ev('(()=>{ const a = window.__a; a.step(15); a.keys(2); return 1 })()');
        await host.shot('split_b');
        await host.ev('(()=>{ const a = window.__a; a.step(25); a.keys(4); return 1 })()');
        await host.shot('split_c');
        const info = await host.ev(`(()=>{ const V = window.__a.V(), st = window.game.state, p = st.ships.find((s) => s.piece); const e = p && V.models.get(p.id); return p ? { id: p.id, bags: p.layout.gasbags.length, splitT: p.splitT, teeth: V.struct.stats.teeth, shards: V.struct.shards, tilt: V.struct.tilt(p, e.model), drift: V.struct.drift(p) } : null })()`);
        console.log('  the piece: ' + JSON.stringify(info));
        check(info && info.teeth >= 1 && Math.abs(info.tilt) > 0.01, 'the cut ends grew torn teeth and the falling half is tipping');
        // the falling half
        await host.ev('(()=>{ const a = window.__a; a.step(30); a.keys(3); return 1 })()');
        await host.shot('falling_a');
        await host.ev('(()=>{ const a = window.__a; a.step(30); a.keys(3); return 1 })()');
        await host.shot('falling_b');
      }
    }
    await finish();
  }

  // ---- the crash: into the sea, and onto the rock --------------------------------------------------------------------------------------------------------------------------------------------------------------------
  for (const [name, query] of [['crash-sea', 'env=sea&kind=open'], ['crash-ground', 'env=skyisles&kind=open']]) {
    if (!want(name)) continue;
    await boot(query);
    // the ship is put over the water / over rock so that the half that falls hits it within a couple of seconds
    const where = await host.ev(`(async () => { const { groundAt } = await import('/modules/host/course.js'); const a = window.__a, st = a.st(), sh = a.ship(0), L = sh.layout, R = L.refPoint, b = L.bounds; a.hold = null;
      const sea = st.env && Number.isFinite(st.env.seaY) ? st.env.seaY : null; let wx = sh.pose.x + R.x, gy = sea;
      if (!${name === 'crash-sea'}) { let best = null; const m = st.course.map; for (let x = 1200; x < (m.W * m.CELL) - 1200 && !best; x += 150) { const gs = []; for (let k = -5; k <= 5; k++) gs.push(groundAt(st.course, x + k * 100)); if (gs.every(Number.isFinite) && Math.max(...gs) - Math.min(...gs) < 160 && Math.max(...gs) < m.H * m.CELL - 700) best = { x, g: Math.min(...gs) }; } if (best) { wx = best.x; gy = best.g; } }
      if (!Number.isFinite(gy)) return null;
      sh.pose.x = wx - R.x; sh.pose.y = gy - 520 - b.y1; sh.pose.vy = 0; a.hold = null; a.step(4); window.__frozenNow = performance.now(); return { gy, wx, keel: sh.pose.y + b.y1 } })()`);
    console.log('  ' + name + ': ' + JSON.stringify(where));
    if (!where) { check(false, name + ': no ground / sea to fall to on this map'); await finish(); continue; }
    await host.ev('window.__a.settle(40)');
    const seg = await host.ev(SEGINFO);
    await host.ev(`(async () => { const { config } = await import('/config.js'); config.STRUCTURE.GRACE_SPLIT.normal = 1; config.STRUCTURE.PIECE.LIFE = 40; const a = window.__a; for (const j of a.col(${seg.i})) { const g = a.segs()[j]; g.hp = 0.02; g.hold = { t: 0.9, max: 1 }; } return 1 })()`);
    const n0 = await host.ev('window.game.state.ships.length');
    if (arg('probe')) console.log('  probe before -> ' + JSON.stringify(await host.ev(arg('probe'))));
    await host.ev(`(()=>{ const a = window.__a, st = window.game.state; let n = 0; while (n < 400 && st.ships.length === ${n0}) { a.step(1); n++; } return n })()`);
    if (arg('probe')) console.log('  probe after -> ' + JSON.stringify(await host.ev(arg('probe'))));
    check(await host.ev('window.game.state.ships.length') === n0 + 1, name + ': she split');
    await host.ev('window.__a.keys(2)');
    // fall until the sim says the half has hit the ground / the sea (ship.ctx.ship.down turns positive), a frame at a time so the view sees it
    let hit = false, steps = 0;
    for (let i = 0; i < 600 && !hit; i++) {
      hit = await host.ev(`(()=>{ const a = window.__a, st = window.game.state, p = st.ships.find((s) => s.piece); if (!p) return false; a.step(3); a.keys(1); return !!(p.ctx.ship && p.ctx.ship.down > 0) })()`);
      steps = i;
    }
    console.log('  ' + name + ': the half hit after ' + steps * 3 + ' sim steps');
    check(hit, name + ': the half that fell crashed');
    const shot = async (tag) => { await host.shot(`${name}_${tag}`); };
    await shot('a');
    const calls = await host.ev('window.__a.calls()');
    await host.ev('window.__a.keys(2)');
    await shot('b');
    await host.ev('window.__a.keys(3)');
    await shot('c');
    await host.ev('window.__a.keys(6)');
    await shot('d');
    const st = await host.ev(`(()=>{ const V = window.__a.V(); return { pieces: V.destruction.pieces.length, chunks: V.destruction.chunks.length, shards: V.struct.shards, bodies: V.destruction.stats.bodies, fallback: V.destruction.stats.fallback, calls: V.stats().sceneCalls, shattered: [...V.models.values()].some((e) => e.model.shattered) } })()`);
    console.log('  ' + name + ': right after the crash ' + JSON.stringify(calls) + ', later ' + JSON.stringify(st));
    check(st.shattered && st.pieces >= 1, name + ': the half broke into Rapier pieces (' + st.pieces + ') and the whole model is hidden');
    check(calls.calls <= 150 && st.calls <= 150, name + ': the scene stays under 150 draw calls (' + Math.max(calls.calls, st.calls) + ')');
    await finish();
  }
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `structure3d-shots: ${failed} FAILED` : 'structure3d-shots: all ok');
process.exit(failed ? 1 : 0);
