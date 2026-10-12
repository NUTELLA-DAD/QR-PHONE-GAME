// CASTLE SHOTS (LOOP R2 / CASTLE.md; view3d/ringCastle.js): the ring castles in a real headless Chrome, for the eyes and for the budget. Starts its OWN server on a free port and stops it by its PID (never kills node globally).
//   node tools/castle-shots.mjs --shots DIR [--prefix castle_] [--variants tower,fortress,citadel] [--angles 0,90,180,270] [--extra] [--port N] [--verbose]
// For every variant: the ship placed at each ring angle (clear air picked near it) with the plain gameplay zoom -> <prefix><variant>_<angle>.png, the approach -> <prefix><variant>_approach.png, and with --extra a wide
// view and a close view of a gate -> _wide_<angle>, _gate. It prints the draw calls / triangles of the whole scene and of the castle alone (what the castle adds), and where the crown's top lands on the screen
// (normalised device y: it must stay under 0.85, the HUD's strip). Exit code 1 when the page logs an error, the crown leaves the picture or the castle goes over its budget (20 calls, 60k triangles).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const verbose = has('verbose'), extra = has('extra');
const port = Number(arg('port', 6800 + Math.floor(Math.random() * 400)));
const shotDir = arg('shots', ''), prefix = arg('prefix', 'castle_');
const VARIANTS = (arg('variants', 'tower,fortress,citadel') || '').split(',').filter(Boolean);
const ANGLES = (arg('angles', '0,90,180,270') || '').split(',').filter(Boolean).map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (c, good, bad) => { if (c) ok(good); else fail(bad || good); };

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: verbose ? 'inherit' : 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); stopServer(); process.exit(2); }
const BASE = `http://localhost:${port}`;
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261011);`;
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, W = 1600, H = 900) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'castle-chrome-'));
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
  const isFav = (s) => /favicon/.test(s || '');
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED + FREEZE });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500)); return undefined; }
    return r.result.value;
  };
  P.json = async (expr) => { const v = await P.ev(expr); try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(250); } return false; };
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file: leave it */ }
  };
  await send('Page.navigate', { url });
  P.ready = await P.waitFor('window.__meter!==undefined', 60000);
  return P;
}

const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
const PRE = `
window.__c = {
  V: () => window.view3dDebug().view,
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  tp(deg, dy = 0) { const st = window.game.state, sh = st.ships[0], r = st.course.ring, a = deg * Math.PI / 180; sh.pose.x = r.xRing + a * r.R - sh.layout.refPoint.x; sh.pose.y = r.axisY + dy - sh.layout.refPoint.y; sh.pose.vy = 0; sh.pose.f = 1; return deg; },
  clearAt(deg) { const st = window.game.state, sh = st.ships[0], r = st.course.ring, m = st.course.map, F = sh.layout.fitBox, P = sh.layout.refPoint, C = m.CELL; const x = r.xRing + deg * Math.PI / 180 * r.R, y = r.axisY;
    const x0 = Math.floor((x + F.x0 - P.x) / C), x1 = Math.floor((x + F.x1 - P.x) / C), y0 = Math.floor((y + F.y0 - P.y) / C), y1 = Math.floor((y + F.y1 - P.y) / C);
    for (let j = y0 - 2; j <= y1 + 2; j++) for (let i = x0 - 2; i <= x1 + 2; i++) if (i >= 0 && j >= 0 && i < m.W && j < m.H && m.solid[j * m.W + i]) return false; return true; },
  tpClear(deg, span = 30) { for (let d = 0; d <= span; d += 1) for (const s of [1, -1]) { if (this.clearAt(deg + s * d)) return this.tp(deg + s * d); } return this.tp(deg); },
  async settle(n = 100) { for (let i = 0; i < n; i++) await this.frame(); },
};
`;
// where the crown's top lands on the screen (NDC y), measured in the page
const CROWN = `(()=>{ const V=window.view3dDebug().view, C=V.castle, K=C&&C.keep; if(!K||!K.visible) return JSON.stringify({none:true});
  const Vec=V.camera.position.constructor; const top=new Vec(K.position.x, C.crownTopY, K.position.z).project(V.camera).y;
  return JSON.stringify({ crownTopY: top, keepX: new Vec(K.position.x, 1500, K.position.z).project(V.camera).x }) })()`;
// the castle's own draw calls and triangles: hide it and measure the difference
const BUDGET = `(async()=>{ const V=window.view3dDebug().view, C=V.castle; const read=async()=>{ await window.__c.frame(); await window.__c.frame(); const s=V.stats(); return [s.calls, s.tris]; };
  C.root.visible=true; const a=await read(); const prev=C.update; C.root.visible=false; const sv=C.root.visible;
  // (measure by hiding the root for a frame: update() would show it again, so stub it)
  C.update=()=>{ C.root.visible=false; }; const b=await read(); C.update=prev; C.root.visible=true; await window.__c.frame();
  const parts=[]; C.root.traverse((o)=>{ if(!o.isMesh||!o.visible) return; const g=o.geometry, n=g.index?g.index.count:g.attributes.position.count; const dr=g.drawRange; const cnt=Math.min(n-dr.start, dr.count===Infinity?n:dr.count); parts.push((o.name||o.parent.name||'?')+(o.userData.isOutline?'/ink':'')+':'+Math.round(cnt/3*(o.isInstancedMesh?o.count:1))); });
  return JSON.stringify({ calls:a[0]-b[0], tris:a[1]-b[1], allCalls:a[0], allTris:a[1], rebuilds:C.stats.rebuilds, ms:C.stats.ms, mapMs:C.stats.mapMs, staticMs:C.stats.staticMs, parts }) })()`;

const BOTS8 = `(async()=>{ ${sl} const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); window.__step(90); await sl(300); return 1 })()`;
const shotTo = async (P, file) => { if (!shotDir) return; fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, file), await P.png()); };

try {
  for (const v of VARIANTS) {
    console.log(`${v}:`);
    const P = await openPage(`${BASE}/host.html?view=3d&kind=ring&variant=${v}&tier=medium&cine=0`);
    await P.ev(PRE);
    await P.ev(BOTS8);
    const first = ANGLES.length ? ANGLES[0] : 0;
    let worstCrown = -9;
    for (const a of ANGLES) {
      await P.ev(`window.view3dDebug().view.S.zoom=1; window.__c.tpClear(${a}, 40)`);
      await P.ev(`window.__c.settle(100)`);
      await P.ev(`(async()=>{ const c=window.__c; c.tpClear(${a}, 40); await c.settle(40); return 1 })()`);
      const cr = await P.json(CROWN);
      if (cr && !cr.none && cr.crownTopY != null) worstCrown = Math.max(worstCrown, cr.crownTopY);
      await shotTo(P, `${prefix}${v}_${String(a).padStart(3, '0')}.png`);
      if (extra) {
        await P.ev(`window.view3dDebug().view.S.zoom=0.45; 1`);
        await P.ev(`window.__c.settle(60)`);
        await shotTo(P, `${prefix}${v}_wide_${String(a).padStart(3, '0')}.png`);
        await P.ev(`window.view3dDebug().view.S.zoom=1; 1`);
      }
    }
    if (arg('eval', '')) console.log('    eval: ' + JSON.stringify(await P.json('(async()=>{ ' + arg('eval', '') + ' })().then((r)=>JSON.stringify(r))')));
    if (arg('evalshot', '')) { await shotTo(P, prefix + v + '_' + arg('evalshot', '') + '.png'); }
    // the budget, measured at the first angle
    await P.ev(`window.view3dDebug().view.S.zoom=1; window.__c.tpClear(${first}, 40)`);
    await P.ev(`window.__c.settle(60)`);
    const bud = await P.json(BUDGET);
    if (bud) {
      if (verbose || has('parts')) console.log('    parts: ' + bud.parts.join(' '));
    console.log(`    the castle adds ${bud.calls} draw calls and ${Math.round(bud.tris / 1000)}k triangles (the whole scene: ${bud.allCalls} calls, ${Math.round(bud.allTris / 1000)}k) | static rebuilds ${bud.rebuilds} | update ${bud.ms.toFixed(2)} ms | built in ${bud.mapMs.toFixed(0)} + ${bud.staticMs.toFixed(0)} ms`);
      check(bud.calls <= 20, `${v}: castle draw calls ${bud.calls} <= 20`, `${v}: castle draw calls ${bud.calls} > 20`);
      check(bud.tris <= 60000, `${v}: castle triangles ${Math.round(bud.tris / 1000)}k <= 60k`, `${v}: castle triangles ${Math.round(bud.tris / 1000)}k > 60k`);
    } else fail(v + ': no budget numbers');
    console.log(`    the crown's top reaches NDC y ${worstCrown.toFixed(3)} at worst (the screen's top is 1)`);
    check(worstCrown < 0.85, `${v}: the crown stays in the picture`, `${v}: the crown is too high on the screen (${worstCrown.toFixed(3)})`);
    // the approach: the ship well before the ring
    await P.ev(`window.view3dDebug().view.S.zoom=1; window.__c.tp(-34)`);
    await P.ev(`window.__c.settle(120)`);
    await P.ev(`window.__c.tp(-34); window.__c.settle(30)`);
    await shotTo(P, `${prefix}${v}_approach.png`);
    if (extra) { // a close look at a gate: the ship at the first face
      const f0 = await P.json(`JSON.stringify(window.game.state.course.ring.faces[${arg('face', 0)}].angle * 180 / Math.PI)`);
      await P.ev(`window.view3dDebug().view.S.zoom=${arg('gatezoom', 0.55)}; window.__c.tp(${f0 == null ? 135 : f0}, ${arg('gatedy', 0)})`);
      await P.ev(`window.__c.settle(120)`);
      await shotTo(P, `${prefix}${v}_gate.png`);
    }
    if (extra) { // the two waterfalls, face on and from a distance
      const fa = await P.json('JSON.stringify(window.view3dDebug().view.castle.fallAngles)');
      for (const [k, a] of (fa || []).entries()) {
        await P.ev('window.view3dDebug().view.S.zoom=0.42; window.__c.tp(' + a * 180 + ', 1500)');
        await P.ev('window.__c.settle(100)');
        await shotTo(P, prefix + v + '_falls' + (k + 1) + '.png');
      }
    }
    if (extra) { // the gate in its two states: shut (portcullis down, bridge up) and open (portcullis up, bridge down)
      const f0 = await P.json(`JSON.stringify(window.game.state.course.ring.faces[${arg('face', 0)}].angle * 180 / Math.PI)`);
      await P.ev(`window.view3dDebug().view.S.zoom=0.4; window.__c.tp(${f0 == null ? 135 : f0}); window.game.state.course.ring.faces[${arg('face', 0)}].open=0; window.game.state.course.ring.faces[${arg('face', 0)}].windows=0; 1`);
      await P.ev(`window.__c.settle(100)`);
      await shotTo(P, `${prefix}${v}_gate_shut.png`);
      await P.ev(`window.game.state.course.ring.faces[${arg('face', 0)}].open=6; window.game.state.course.ring.faces[${arg('face', 0)}].windows=1; 1`);
      await P.ev(`window.__c.settle(100)`);
      await shotTo(P, `${prefix}${v}_gate_open.png`);
      // the breach: the gatehouse is rubble, its special wrecked (the static batch is rebuilt)
      await P.ev(`const r=window.game.state.course.ring; r.faces[${arg('face', 0)}].down=true; r.faces[${arg('face', 0)}].special.dead=true; r.faces[${arg('face', 0)}].open=0; 1`);
      await P.ev(`window.view3dDebug().view.S.zoom=0.5; window.__c.settle(60)`);
      await shotTo(P, `${prefix}${v}_gate_breached.png`);
      const reb = await P.json('JSON.stringify(window.view3dDebug().view.castle.stats)');
      check(reb && reb.rebuilds >= 2, `${v}: a breached face rebuilds the strip (${reb && reb.rebuilds} builds)`, `${v}: no rebuild after a breach ${JSON.stringify(reb)}`);
    }
    for (const e of P.errors.slice(0, 8)) console.log('    [' + v + '] ' + e);
    check(P.errors.length === 0, `${v}: 0 console errors`, `${v}: ${P.errors.length} console error(s)`);
    await P.close();
  }
} catch (e) {
  console.log('the shots crashed: ' + (e && e.stack ? e.stack : e));
  failed++;
} finally {
  stopServer();
}
console.log(failed ? `\n${failed} FAILED` : '\ncastle-shots: all clear');
process.exit(failed ? 1 : 0);
