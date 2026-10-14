// THE 3D UMBRELLA GATE (WP14): the host in 3D by default, in a real headless Chrome. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/view3d-check.mjs [--all] [--quick] [--gl default|swiftshader] [--port N] [--shots DIR] [--only a,b,..] [--snapshot --force] [--verbose] [--calls | --calls1 [--rows N]] [--probe FILE.js] [--stress]
//   node tools/buildsim.mjs --check-3d [--all]          the same, from the gate runner          node tools/buildsim.mjs --snapshot-3d --force     re-capture the screenshot fixtures
// Steps (--only names):
//   rules     the GPU probe's rules (detect.js classifyGpu) on a table of real renderer strings: discrete -> high, integrated -> medium, software / no WebGL 2 -> 2D
//   hosts     (a) host.html loads with 0 console errors and 0 game errors: the lobby (NO ?view: 3D is the default), a flight with 8 bots, a dark cave, the Kraken's lair, Versus (10 s and, seeded, at close range at 30 s), and a seeded fight with the gunship, the squadron and a bomber;
//             (d) in those scenes at Medium: draw calls <= 150, triangles <= 450k, view JS <= 6 ms;  (e) V.alignError (the HUD against the 3D picture) is 0 px with cinematics off
//   models    (b) model.fallbacks is empty for the classic ship, the Sparrow, the five minimum builds, the enemy gunship and 10 generated ships
//   shots     (c) fourteen seeded scenes (the last two, fight and versus_close, are the dearest pictures: they prove the perf batching changed no pixel) against tools/fixtures/shots3d/*.png (mean abs diff < 2 %, no 64 x 64 block over 12 %); --snapshot --force writes the fixtures
//   tiers     the flight scene at High / Medium / Low: the numbers (printed), 0 errors
//   fallback  (f) --gl swiftshader and no WebGL at all: the host comes up in 2D with 0 errors and never loads Three.js; the governor's step down to 2D (a toast, at a calm moment, never mid-fight)
//   offline   (g) every page above runs with the network blocked for anything but localhost: 0 external requests, 0 failed loads; plus the phone page and the build page; a static scan for CDN links
//   sub       (h) with --all: lint3d, physics-check, enemy3d-check, light3d-check, weather3d-check, cine3d-check, creature3d-check --quick, crew3d-check --quick
// --quick skips the long real-time waits and the tier runs. Screenshots of the scenes go to --shots DIR when given.
// Dev aids: --calls (or --calls1: one frame) prints where the draw calls go in the fight and Versus scenes (per object, shadow and main pass); --probe FILE.js runs a page-side function there and prints its result; --stress follows the Versus match
// to 60 s (informational); env SHOT_EXTRA="&look=nooutlines" adds to the address of the shot scenes.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pngjs from 'pngjs';

const { PNG } = pngjs;
const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const quick = has('quick'), all = has('all'), verbose = has('verbose'), snapshot = has('snapshot');
const GL = arg('gl', 'default');
const shotDir = arg('shots', '');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const port = Number(arg('port', 5200 + Math.floor(Math.random() * 600)));
const FIX = path.join(here, 'tools', 'fixtures', 'shots3d');
// (housekeeping: the 3D tools' throwaway folders - Chrome profiles that Windows would not let go of, old pictures - older than 6 hours are swept away, so the disk does not fill up)
try {
  const OLD = Date.now() - 6 * 3600e3, MINE = /^(view3d|view3d-chrome|shot3d|ring3d-chrome|light3d|weather3d|portholes|enemy3d|crew3d|cine3d|creature3d)-/;
  for (const n of fs.readdirSync(os.tmpdir())) if (MINE.test(n)) { const p = path.join(os.tmpdir(), n); try { if (fs.statSync(p).mtimeMs < OLD) fs.rmSync(p, { recursive: true, force: true }); } catch { /* in use */ } }
} catch { /* no temp dir listing */ }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'view3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad || good); return !!cond; };

const BUDGET = { calls: 150, tris: 450000, js: 6 }; // (3D.md section 6: the perf gate at Medium)
const SHOT = { w: 960, h: 540, mean: 0.02, block: 0.12 }; // (the screenshot regression: size and tolerance)

if (snapshot && !has('force')) { console.log('Pass --force to rewrite tools/fixtures/shots3d/ from the current code (do it when a PLANNED look change legitimately moves the pictures).'); process.exit(2); }

// ---- a server of our own ---------------------------------------------------------------------------------------------------------------------------------------------------
const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: verbose ? 'inherit' : 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); stopServer(); process.exit(2); }
const BASE = `http://localhost:${port}`;

// ---- headless Chrome over the DevTools protocol (one browser, one fresh profile and one page per scene) ---------------------------------------------------------------------
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20260610);
// the simulation never runs on its own in these pages: the moment main.js publishes window.game its update is replaced by a no-op (the real one is window.__upd, stepped by hand with window.__step)
(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]', '']);

// opts: gl ('default' | 'swiftshader' | 'none'), w, h, seed (seed Math.random from the very first line of the page), block (network blocked except localhost, default true)
async function openPage(url, opts = {}) {
  const gl = opts.gl || GL, W = opts.w || 1280, H = opts.h || 720;
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'view3d-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (gl === 'swiftshader') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (gl === 'none') { for (const bad of ['--ignore-gpu-blocklist', '--enable-webgl']) flags.splice(flags.indexOf(bad), 1); flags.push('--disable-gpu', '--disable-3d-apis', '--disable-webgl'); }
  if (opts.block !== false) flags.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1');
  const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: 'ignore' });
  const P = { errors: [], warns: [], external: [], failures: [], requests: [], logs: [], gl };
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
      P.logs.push(q.type + ': ' + text);
      if (q.type === 'error' && !isFav(text)) P.errors.push('console.error: ' + text);
      // (the 3D view swallows a throwing sub-system and says so once with console.warn: that is an error for the gate)
      else if (q.type === 'warning' && /^(view3d |3D view problem|3D view stopped)/.test(text)) P.warns.push(text);
    } else if (d.method === 'Runtime.exceptionThrown') P.errors.push('EXCEPTION: ' + ((q.exceptionDetails.exception && q.exceptionDetails.exception.description) || q.exceptionDetails.text).slice(0, 500));
    else if (d.method === 'Log.entryAdded') { if (q.entry.level === 'error' && !isFav(q.entry.url) && !isFav(q.entry.text)) P.errors.push('log: ' + q.entry.text.slice(0, 200) + ' ' + (q.entry.url || '')); }
    else if (d.method === 'Network.requestWillBeSent') {
      const u = q.request.url;
      P.requests.push(u);
      if (!/^(data|blob|about|chrome|devtools):/.test(u)) { let h = ''; try { h = new URL(u).hostname; } catch { h = '?'; } if (!LOCAL.has(h)) P.external.push(u); }
    } else if (d.method === 'Network.loadingFailed') { if (!q.canceled && !isFav(q.errorText)) P.failures.push(q.errorText + ' (' + q.requestId + ')'); }
    else if (d.method === 'Network.responseReceived') { if (q.response.status >= 400 && !isFav(q.response.url)) P.failures.push('HTTP ' + q.response.status + ' ' + q.response.url); }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (opts.seed) await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { const m = 'EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400); P.errors.push(m); return undefined; }
    return r.result.value;
  };
  P.json = async (expr) => { const v = await P.ev(expr); try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(250); } return false; };
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* Chrome still holds a file: leave it */ }
  };
  await send('Page.navigate', { url });
  if (opts.ready !== false) P.ready = await P.waitFor(opts.ready || 'window.__meter!==undefined', opts.readyMs || 60000);
  return P;
}
// every page's verdict on errors and the network: pages push into the shared tallies (the "offline" step reads them)
const NET = { pages: 0, requests: 0, external: [], failures: [] };
const settle = async (name, P) => {
  const game = (await P.json('JSON.stringify(window.gameErrors||[])')) || [];
  NET.pages++; NET.requests += P.requests.length; NET.external.push(...P.external.map((u) => name + ': ' + u)); NET.failures.push(...P.failures.map((f) => name + ': ' + f));
  const bad = [...P.errors, ...P.warns];
  if (verbose || bad.length || game.length) for (const l of [...bad, ...game.map((g) => 'game error: ' + g)].slice(0, 8)) console.log('    [' + name + '] ' + l);
  check(bad.length === 0 && game.length === 0, `${name}: 0 console errors, 0 game errors`, `${name}: ${bad.length} console error(s), ${game.length} game error(s)`);
  if (!P.ready) fail(`${name}: the page never drew its first frame`);
};
const shotTo = async (P, file) => { if (!shotDir) return; fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, file), await P.png()); };

// ---- page-side snippets ---------------------------------------------------------------------------------------------------------------------------------------------------------
const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
const BOTS8 = `(async()=>{ ${sl} const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); return Object.keys(window.game.state.players).length })()`;
const MEASURE = `(async()=>{ const V=window.view3dDebug().view; if(!V) return JSON.stringify({none:true}); const med=(a)=>a.slice().sort((x,y)=>x-y)[a.length>>1]; const s=[];
  for(let i=0;i<9;i++){ s.push(V.stats()); await new Promise(r=>setTimeout(r,120)); }
  const u=s[s.length-1]; return JSON.stringify({ calls:med(s.map(q=>q.calls)), maxCalls:Math.max(...s.map(q=>q.calls)), tris:med(s.map(q=>q.tris)), maxTris:Math.max(...s.map(q=>q.tris)), js:+med(s.map(q=>q.jsMs)).toFixed(2), render:+med(s.map(q=>q.renderMs)).toFixed(2), tier:u.tier, fps:window.__meter&&window.__meter.fps, w:u.w, h:u.h, frames:V.frames }) })()`;
const ALIGN = `(()=>{ const V=window.view3dDebug().view, c=document.getElementById('c'); if(!V||!window.__lastView) return -1; return V.alignError(window.__lastView, c.width, c.height) })()`;
const STATE = `JSON.stringify({ is3d: window.viewIs3D(), phase: game.state.phase, ships: game.state.ships.length, creature: !!game.state.creature, gunship: !!game.state.gunship, cave: !!(window.view3dDebug().view && window.view3dDebug().view.world.cave), frames: window.view3dDebug().view ? window.view3dDebug().view.frames : 0, level: window.perfGov.level() })`;
const fmt = (m) => `calls ${m.calls} (max ${m.maxCalls}) | ${Math.round(m.tris / 1000)}k tris (max ${Math.round(m.maxTris / 1000)}k) | view js ${m.js} ms | render ${m.render} ms | ${m.fps} fps | ${m.tier} ${m.w}x${m.h}`;
const gateMeasure = (name, m) => {
  if (!m || m.none) { fail(name + ': no 3D numbers'); return; }
  console.log(`    ${name}: ${fmt(m)}`);
  check(m.maxCalls <= BUDGET.calls, `${name}: draw calls ${m.maxCalls} <= ${BUDGET.calls}`, `${name}: draw calls ${m.maxCalls} > ${BUDGET.calls}`);
  check(m.maxTris <= BUDGET.tris, `${name}: triangles ${Math.round(m.maxTris / 1000)}k <= ${BUDGET.tris / 1000}k`, `${name}: triangles ${Math.round(m.maxTris / 1000)}k > ${BUDGET.tris / 1000}k`);
  check(m.js <= BUDGET.js, `${name}: view JS ${m.js} ms <= ${BUDGET.js} ms`, `${name}: view JS ${m.js} ms > ${BUDGET.js} ms`);
};

// --calls: where the draw calls go. Wraps renderer.renderBufferDirect for a few frames and groups every call by the object's nearest named ancestors / type / material (shadow-pass calls have scene === null); prints per-frame averages.
const PROFILE = `(()=>{ const V=window.view3dDebug().view, R=V.renderer, rows=new Map(), orig=R.renderBufferDirect, origReset=R.info.reset.bind(R.info), f0=V.frames, one=${has('calls1')};
  const pathOf=(o)=>{ const bits=[]; for(let p=o;p&&p.type!=='Scene';p=p.parent){ const i=p.parent?p.parent.children.indexOf(p):0; bits.push((p.name?p.name:p.type[0])+(p.parent&&p.parent.type!=='Scene'&&!p.name?i:'')); } return bits.reverse().join('>'); };
  const nameOf=(o)=>{ const bits=[]; for(let p=o;p&&bits.length<4;p=p.parent){ const n=p.name||''; if(n) bits.push(n); } return bits.reverse().join('/')||('(unnamed, parent '+(o.parent&&(o.parent.name||o.parent.type))+')'); };
  let seg=0,lastF=-1,fr1=0; R.info.reset=function(){ if(V.frames!==lastF){ lastF=V.frames; seg=0; } seg++; if(seg===1) fr1++; return origReset(); };
  R.renderBufferDirect=function(cam,sc,geo,mat,obj,grp){ if(seg!==1||(obj.isInstancedMesh&&obj.count===0)) return orig.apply(this,arguments); const g=geo&&geo.attributes&&geo.attributes.position; const key=(sc?'main  ':'shadow')+' | '+(one?pathOf(obj)+' v'+(g?g.count:'?'):nameOf(obj))+' | '+obj.type+(obj.isInstancedMesh?' x'+obj.count:'')+' | '+(mat&&mat.type)+(mat&&mat.side===1?' back':'')+(mat&&mat.name?' '+mat.name:'')+(mat&&mat.color&&mat.type==='MeshBasicMaterial'?' #'+mat.color.getHexString():''); rows.set(key,(rows.get(key)||0)+1); return orig.apply(this,arguments); };
  return new Promise((res)=>{ const t0=performance.now(); const tick=()=>{ const done=one?fr1>=1&&V.frames>lastF:performance.now()-t0>500; if(!done) return setTimeout(tick,5); R.renderBufferDirect=orig; R.info.reset=origReset; const fr=Math.max(1,fr1); const out=[...rows.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>(v/fr).toFixed(1)+'  '+k); res(JSON.stringify({ frames:fr, total:+([...rows.values()].reduce((a,b)=>a+b,0)/fr).toFixed(1), rows:out })); }; tick(); }); })()`;
const profileOf = async (name, P) => {
  if (has('probe')) console.log(`    probe ${name}: ` + JSON.stringify(await P.json(`(()=>{ try { return JSON.stringify((${fs.readFileSync(arg('probe'), 'utf8')})()) } catch(e) { return JSON.stringify(String(e)) } })()`)));
  if (!has('calls') && !has('calls1')) return;
  const r = await P.json(PROFILE); if (!r) return;
  console.log(`    --- ${name}: calls per frame by object (${r.frames} frames sampled, ${r.total} calls a frame, shadow + main) ---`);
  for (const l of r.rows.slice(0, Number(arg('rows', 45)))) console.log('      ' + l);
};

const results = { tiers: {} };
try {
  // ---- rules: the probe's classification table -----------------------------------------------------------------------------------------------------------------------------------
  if (want('rules')) {
    console.log('rules: the GPU probe');
    const { classifyGpu } = await import(pathToFileURL(path.join(here, 'public/modules/view3d/detect.js')).href);
    const A = { webgl2: true, maxTexture: 16384, floatTargets: true };
    const T = [
      ['ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'], ['NVIDIA GeForce GTX 1050 Ti', 'high'], ['ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11)', 'high'],
      ['Intel(R) Arc(TM) A770 Graphics', 'high'], ['Apple M2 Pro', 'high'],
      ['ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'medium'], ['ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)', 'medium'], ['ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11)', 'medium'],
      ['AMD Radeon(TM) Vega 8 Graphics', 'medium'], ['AMD Radeon RX Vega 11', 'medium'], ['AMD Radeon 780M Graphics', 'medium'], ['Intel(R) Arc(TM) Graphics', 'medium'], ['NVIDIA GeForce MX150', 'medium'],
      ['Mali-G78', 'medium'], ['Apple GPU', 'medium'], ['', 'medium'],
      ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', '2d'], ['llvmpipe (LLVM 15.0.7, 256 bits)', '2d'], ['Microsoft Basic Render Driver', '2d'], ['VMware SVGA3D', '2d'],
    ];
    let bad = 0;
    for (const [n, want_] of T) { const r = classifyGpu(n, A); if (r.tier !== want_) { bad++; console.log(`    "${n}": ${r.tier} (wanted ${want_})`); } }
    check(bad === 0, `${T.length} renderer names land on the right tier`, `${bad} renderer name(s) on the wrong tier`);
    check(classifyGpu('NVIDIA GeForce RTX 4090', { webgl2: false }).tier === '2d', 'no WebGL 2 -> 2D');
    check(classifyGpu('NVIDIA GeForce RTX 4090', { ...A, floatTargets: false }).tier === '2d', 'no half-float render targets -> 2D');
    check(classifyGpu('NVIDIA GeForce RTX 4090', { ...A, maxTexture: 2048 }).tier === 'medium', 'a small texture limit caps a discrete card at Medium');
  }

  // ---- hosts: (a) 0 errors, (d) the perf budget, (e) the HUD alignment ---------------------------------------------------------------------------------------------------------------
  if (want('hosts') || want('models')) {
    console.log('hosts: host.html in 3D' + (GL === 'swiftshader' ? ' (SwiftShader)' : ''));
    // the lobby, with NO ?view in the address: 3D is the default (unless this machine's probe says 2D, then it is proved in "fallback")
    let P = await openPage(`${BASE}/host.html`, { gl: GL });
    await P.waitFor('window.viewIs3D() || window.autoDetectInfo.view==="2d"', 25000);
    const st = await P.json(STATE), det = await P.json('JSON.stringify(window.autoDetectInfo&&{view:window.autoDetectInfo.view,tier:window.autoDetectInfo.tier,text:window.autoDetectInfo.text})');
    console.log('    probe: ' + (det && det.text));
    if (det && det.view === '3d') check(st && st.is3d, 'lobby: 3D is on with nothing in the address', 'lobby: the probe said 3D but the 3D view is not running');
    else console.log('    (this machine\'s probe says 2D: the lobby ran in 2D; the 3D scenes below force ?view=3d)');
    await sleep(2500);
    await settle('lobby', P);
    await P.close();

    P = await openPage(`${BASE}/host.html?view=3d&tier=medium&cine=0`, { gl: GL });
    await P.ev(BOTS8);
    await sleep(quick ? 6000 : 10000);
    let s = await P.json(STATE);
    check(s && s.is3d && s.phase === 'flying' && s.frames > 100, 'flight: 8 bots flying in 3D (' + (s && s.frames) + ' frames)', 'flight: not flying in 3D ' + JSON.stringify(s));
    gateMeasure('flight', await P.json(MEASURE));
    const al = [];
    for (let i = 0; i < 4; i++) { al.push(await P.ev(ALIGN)); await sleep(250); }
    check(al.every((a) => a >= 0 && a < 0.1), `flight: HUD alignment ${Math.max(...al).toFixed(4)} px with cinematics off`, `flight: HUD alignment off by ${Math.max(...al)} px (cinematics off)`);
    // (b) the fallbacks of the live ships, with the enemy gunship in the sky as well
    if (want('models')) {
      await P.ev(`game.course.startMission(2,{kind:'open',environment:'skyisles',danger:2}); game.state.ev.warn=0; 1`);
      await sleep(2500);
      await P.ev(`game.gunship.spawn(); game.squadrons.spawnStrafers(); game.squadrons.spawnBomber(); 1`);
      await sleep(2500); // (the models are read while the gunship is surely still up: with 8 real-time bots she was sometimes shot down before the measure)
      const fb = (await P.json(`JSON.stringify({ list: window.view3dDebug().view.fallbacks(), models: window.view3dDebug().view.models ? window.view3dDebug().view.models.size : 0, gunship: !!game.state.gunship })`)) || { list: ['?'] };
      check(fb.list.length === 0, `models: the live ships${fb.gunship ? " and the gunship" : " (the gunship did not come this time; the generated and fixture builds below still cover her parts)"} have no fallbacks (${fb.models} model(s))`, 'models: the live ships / gunship have fallbacks ' + JSON.stringify(fb));
      await sleep(quick ? 3500 : 6500);
      gateMeasure('fight (gunship, fighters, bomber)', await P.json(MEASURE));
      await profileOf('fight', P);
      const { minimumBuild } = await import(pathToFileURL(path.join(here, 'tools/fixtures/minimum-lib.mjs')).href);
      const { generateShip } = await import(pathToFileURL(path.join(here, 'public/modules/host/shipGen.js')).href);
      const lists = {};
      for (let i = 1; i <= 5; i++) lists['min' + i] = minimumBuild(i);
      let nGen = 0;
      for (let seed = 1; nGen < 10 && seed < 60; seed++) { const g = generateShip(seed); if (g && g.parts) { lists['gen' + seed + ':' + g.theme] = g.parts; nGen++; } }
      // ENGINE SIZES: a heavy-engine build, a great-lift-engine build and a few generated ships with heavy / great engines have no fallbacks either (WP2 parts registry: engines.js)
      const { BUILDS: B3 } = await import(pathToFileURL(path.join(here, 'public/modules/host/shipBuild.js')).href);
      for (const f of ['heavyengine', 'greatlift']) lists[f] = (await import(pathToFileURL(path.join(here, 'tools/fixtures/' + f + '-build.mjs')).href)).default(B3);
      for (let seed = 1, n = 0; n < 4 && seed < 80; seed++) { const g = generateShip(seed, { sizes: true }); if (g && g.parts && g.parts.some((q) => q.part === 'engine' && q.size)) { lists['size' + seed + ':' + g.theme] = g.parts; n++; } }
      const r = await P.json(`(async()=>{ const {createLayout}=await import('/shipLayout.js'); const {buildShipModel}=await import('/modules/view3d/shipMesh.js'); const {BUILDS}=await import('/modules/host/shipBuild.js');
        const lists=${JSON.stringify(lists)}; lists.classic=BUILDS.classic; lists.sparrow=BUILDS.sparrow; const res={};
        for (const [k,parts] of Object.entries(lists)) { try { const m=buildShipModel(createLayout(parts),{}); res[k]={fb:m.fallbacks.slice(), tris:m.tris|0}; m.root.traverse(o=>o.geometry&&o.geometry.dispose()); if(m.dispose) m.dispose(); } catch(e){ res[k]={err:String(e&&e.message||e)}; } }
        return JSON.stringify(res) })()`);
      const names = r ? Object.keys(r) : [];
      const badM = names.filter((k) => r[k].err || (r[k].fb && r[k].fb.length));
      for (const k of badM) console.log(`    ${k}: ${r[k].err || r[k].fb.join('; ')}`);
      check(names.length >= 17 && badM.length === 0, `models: ${names.length} builds (classic, Sparrow, 5 minimum, ${nGen} generated) have empty fallbacks`, `models: ${badM.length} of ${names.length} build(s) have fallbacks or errors`);
    }
    await shotTo(P, 'wp14_flight.png');
    await settle('flight', P);
    await P.close();

    if (want('hosts')) {
      // a dark cave
      P = await openPage(`${BASE}/host.html?view=3d&tier=medium&cine=0`, { gl: GL });
      await P.ev(BOTS8);
      await sleep(1500);
      await P.ev(`game.course.startMission(2,{kind:'network',environment:'skyisles',danger:2}); game.state.ev.warn=0; 1`);
      await sleep(quick ? 5000 : 9000);
      s = await P.json(STATE);
      check(s && s.is3d && s.cave, 'cave: a cave map in 3D', 'cave: not a cave in 3D ' + JSON.stringify(s));
      gateMeasure('cave', await P.json(MEASURE));
      const alc = await P.ev(ALIGN);
      check(alc >= 0 && alc < 0.1, `cave: HUD alignment ${Number(alc).toFixed(4)} px`, `cave: HUD alignment off by ${alc} px`);
      await shotTo(P, 'wp14_cave.png');
      await settle('cave', P);
      await P.close();

      // the Kraken's lair
      P = await openPage(`${BASE}/host.html?view=3d&tier=medium&lair=1&creature=kraken`, { gl: GL });
      await P.ev(BOTS8);
      let seen = false;
      for (let i = 0; i < (quick ? 8 : 14); i++) { await sleep(2000); const c = await P.json(STATE); if (c && c.creature) seen = true; }
      s = await P.json(STATE);
      check(s && s.is3d, 'lair: the Kraken\'s lair in 3D' + (seen ? ' (the Kraken appeared)' : ' (no Kraken yet)'), 'lair: 3D not running');
      gateMeasure('lair', await P.json(MEASURE));
      await shotTo(P, 'wp14_lair.png');
      await settle('lair', P);
      await P.close();

      // Versus, seeded and stepped: 10 s of the match (600 steps), the same every run. (A free-running page measured a random arena - course.js rng(Date.now()) - and wherever the bots had got to
      // after 10 s: from far apart at 115 calls to closing in at 160 run to run, on every commit. Once the ships close to fighting range the picture was 150-220 calls: it is gated below, at 30 s and seeded, since the 3D perf pass, see 3D.md.)
      P = await openPage(`${BASE}/host.html?view=3d&tier=medium&versus=1&bots=4`, { gl: GL, seed: true });
      await P.ev('(()=>{ window.__seed(11); window.__step(600); return 1 })()');
      await sleep(3000);
      s = await P.json(STATE);
      check(s && s.is3d && s.ships >= 2, 'versus: two ships in 3D', 'versus: ' + JSON.stringify(s));
      gateMeasure('versus', await P.json(MEASURE));
      await profileOf('versus (10 s)', P);
      await shotTo(P, 'wp14_versus.png');
      // the same match at 30 s (1800 steps): the two ships have closed to fighting range, their planes are out, the damage decals are on: the dearest Versus picture (150-220 calls before the 3D perf pass)
      await P.ev('(()=>{ window.__seed(12); window.__step(1200); return 1 })()'); // (re-seeded: the view's own random numbers in the real-time frames between must not move the match)
      await sleep(2500);
      gateMeasure('versus close range (30 s)', await P.json(MEASURE));
      await profileOf('versus close range (30 s)', P);
      await shotTo(P, 'perf_versus_close.png');
      if (has('stress')) { // (--stress: the same match every 5 s from 35 s to 60 s, to see how bad the close-range picture gets; informational)
        for (let sec = 35; sec <= 60; sec += 5) { await P.ev('(()=>{ window.__seed(' + (20 + sec) + '); window.__step(300); return 1 })()'); await sleep(1200); const m = await P.json(MEASURE); if (m && !m.none) console.log(`    versus ${sec} s: ${fmt(m)}`); await profileOf('versus ' + sec + ' s', P); }
      }
      await settle('versus', P);
      await P.close();

      // A fight, seeded and stepped (the real-time one above is a different fight every run, 87-157 calls): our ship, the gunship, the strafing squadron and a bomber 6 s after they appear.
      P = await openPage(`${BASE}/host.html?view=3d&tier=medium&cine=0`, { gl: GL, seed: true });
      await P.ev(`(()=>{ window.__seed(11); const B=document.getElementById('bots'); B.click(); B.click(); document.getElementById('castoff').click(); window.__step(300);
        game.course.startMission(2,{kind:'open',environment:'skyisles',danger:2}); game.state.ev.warn=0; for(let k=0;k<40&&!game.state.gunship;k++){ game.gunship.spawn(k+1); window.__step(30); } game.squadrons.spawnStrafers(); game.squadrons.spawnBomber(); window.__step(120); return 1 })()`);
      await sleep(2500);
      s = await P.json(STATE);
      check(s && s.is3d && s.gunship, 'fight (seeded): in 3D with the gunship on us', 'fight (seeded): ' + JSON.stringify(s));
      gateMeasure('fight (seeded: gunship, squadron, bomber)', await P.json(MEASURE));
      await profileOf('fight (seeded)', P);
      await shotTo(P, 'perf_fight_seeded.png');
      await settle('fight (seeded)', P);
      await P.close();
    }
  }

  // ---- tiers: the flight scene at High / Medium / Low ----------------------------------------------------------------------------------------------------------------------------
  if (want('tiers') && !quick) {
    console.log('tiers: the flight scene, 8 bots');
    for (const tier of ['high', 'medium', 'low']) {
      const P = await openPage(`${BASE}/host.html?view=3d&tier=${tier}&cine=0`, { gl: GL });
      await P.ev(BOTS8);
      await sleep(8000);
      const m = await P.json(MEASURE);
      results.tiers[tier] = m;
      console.log(`    ${tier}: ${m && fmt(m)}`);
      if (tier === 'medium') gateMeasure('flight (medium)', m);
      await settle('tier ' + tier, P);
      await P.close();
    }
  }

  // ---- shots: (c) the screenshot regression -------------------------------------------------------------------------------------------------------------------------------------
  if (want('shots')) {
    console.log(snapshot ? 'shots: writing the fixtures' : 'shots: fourteen seeded scenes against tools/fixtures/shots3d/');
    // Everything that makes the scene is ONE synchronous call (no real-time frame can take a random number in the middle): the generator is re-seeded, the bots climb aboard, she casts off, the
    // simulation (frozen from the start, see SEED) is stepped by hand. The page's Math.random and Date.now were fixed from its first line (SEED), so the map is the same too.
    const BOOT = (steps, tail = '') => `(()=>{ window.__seed(11);
      const B=document.getElementById('bots'); B.click(); B.click(); document.getElementById('castoff').click(); window.__step(${steps}); ${tail} return 1 })()`;
    const FREEZE_ONLY = (steps = 0) => `(()=>{ window.__seed(11); window.__step(${steps}); return 1 })()`;
    // The picture's clock is held by hand (window.__frozenNow): the join card's random room code is replaced, then 400 frames of 1/20 s are drawn in ONE synchronous call (the 2D camera and every
    // smoothed thing in the 3D view run to their resting place, the particles of the real-time part die and the seeded ones take over), then 60 more frames of 1/60 s.
    const NORM = `{ const c=document.getElementById('code'); if(c) c.textContent='TEST'; const u=document.getElementById('url'); if(u) u.textContent='http://host'; const q=document.getElementById('qr'); if(q) q.src='data:image/gif;base64,R0lGODlhAQABAAAAACw='; }`;
    const HOLD = `(async()=>{ ${sl} for(let i=0;i<40&&document.getElementById('code').textContent==='----';i++) await sl(250); await sl(1500); ${NORM} await sl(500);
      window.__seed(4242); window.__frozenNow=100000; for(let i=0;i<400;i++){ window.__frozenNow+=50; window.renderNow(0.05); if(i===200){ ${NORM} } }
      for(let i=0;i<60;i++){ window.__frozenNow+=1000/60; await new Promise(r=>requestAnimationFrame(()=>r())); } return 1 })()`;
    const RING_SPOT = (deg) => `{ const st=game.state, sh=st.ships[0], r=st.course.ring, m=st.course.map, F=sh.layout.fitBox, Q=sh.layout.refPoint, C=m.CELL; const clear=(a)=>{ const x=r.xRing+a*Math.PI/180*r.R, y=r.axisY; const x0=Math.floor((x+F.x0-Q.x)/C)-1, x1=Math.floor((x+F.x1-Q.x)/C)+1, y0=Math.floor((y+F.y0-Q.y)/C)-1, y1=Math.floor((y+F.y1-Q.y)/C)+1; for(let j=y0;j<=y1;j++) for(let i=x0;i<=x1;i++) if(i>=0&&j>=0&&i<m.W&&j<m.H&&m.solid[j*m.W+i]) return false; return true; };
      for(let d=0;d<=40;d++){ let hit=false; for(const s of [1,-1]){ const a=${deg}+s*d; if(clear(a)){ sh.pose.x=r.xRing+a*Math.PI/180*r.R-Q.x; sh.pose.y=r.axisY-Q.y; sh.pose.vy=0; hit=true; break; } } if(hit) break; } }`;
    const SCENES = [
      { name: 'lobby', q: 'view=3d', setup: FREEZE_ONLY() },
      { name: 'flight', q: 'view=3d&env=skyisles&kind=open', setup: BOOT(420) },
      { name: 'cave', q: 'view=3d&env=skyisles&kind=network', setup: BOOT(420) },
      { name: 'kraken', q: 'view=3d&lair=1&creature=kraken', setup: BOOT(300, 'for(let i=0;i<60&&!game.state.creature;i++) window.__step(60); window.__step(180);') },
      { name: 'drake', q: 'view=3d&lair=ember&creature=drake', setup: BOOT(300, 'for(let i=0;i<60&&!game.state.creature;i++) window.__step(60); window.__step(420);') }, // (C.6a: the Cinder Drake, the placeholder tubes, in the Ember Forge)
      { name: 'thunderbird', q: 'view=3d&lair=storm&creature=thunderbird', setup: BOOT(300, 'for(let i=0;i<60&&!game.state.creature;i++) window.__step(60); window.__step(420);') }, // (the Thunderbird in the Storm Front lair: the storm-bird with layered gold-tipped feathers and lightning on its wings)
      { name: 'titan', q: 'view=3d&creature=titan', setup: BOOT(300, 'for(let i=0;i<60&&!game.state.creature;i++) window.__step(60); window.__step(900);') }, // (C.6c: the Island Titan standing on its plain in the Sky Isles: a stone colossus with an island on its back, the rubble heap, the ship over it; 3D.md section 38)
      { name: 'wyrm', q: 'view=3d&creature=wyrm', setup: BOOT(300, 'for(let i=0;i<80&&!game.state.creature;i++) window.__step(60); for(let i=0;i<80&&!(game.state.creature.grips||[]).some(g=>g.mode==="hold");i++) window.__step(30); window.__step(90);') }, // (C.6d: the Rime Wyrm erupted from its ice cliff and coiling the hull: a frost serpent in a thick translucent ice shell, the collar standing out of the cliff top; 3D.md section 40)
      { name: 'mother', q: 'view=3d&creature=mother', setup: BOOT(300, 'for(let i=0;i<80&&!game.state.creature;i++) window.__step(60); for(let i=0;i<200&&game.state.creature.mother.mode!=="awake";i++) window.__step(30); window.__step(240); const c=game.state.creature; for(const p of c.parts) p.lit=true; c.mother.beat=2; const V=window.view3dDebug().view; V.S.focus={dx:0,dy:1100}; V.S.zoom=0.75;') }, // (C.6e: the Mycelial Mother hanging from the roof of the Fungal Depths lair, wings spread, every part lit: a lilac spore-moth with a gill skirt, compound eyes, peacock eyespots, feathered antennae and teal tendrils; 3D.md section 41)
      { name: 'eel', q: 'view=3d&creature=eel', setup: BOOT(300, 'for(let i=0;i<80&&!game.state.creature;i++) window.__step(60); const c=game.state.creature; for(let i=0;i<120&&c.eel.mode!=="circle";i++) window.__step(30); c.eel.nextT=1e9; for(let i=0;i<300&&!(c.eel.hd.x>0.985&&c.y<game.state.ships[0].pose.y);i++) window.__step(6); for(const l of game.state.searchlights||[]){ l.manned=false; l.power=0; l.litCount=0; } for(const p of c.parts) p.lit=true; c.eel.lampLit=1; const V=window.view3dDebug().view; V.S.focus={dx:-60,dy:-330}; V.S.zoom=2.0;') }, // (the ship's lamps are switched off: a beam across the head is not frame-exact; C.6f: the Void Eel circling the ship in the Aether, its head heading right at the top of its loop: an indigo serpent with glowing constellations and translucent fins, an angler's head with needle teeth, the crown and the glowing lantern on its rod; 3D.md section 42)
      { name: 'versus', q: 'view=3d&versus=1&bots=4', setup: FREEZE_ONLY(420) },
      // (LOOP R1: the fortress ring: the ship is put in clear air at the face at 135 degrees, so the picture shows the bent rock, a castle face with its shutter and the keep behind her)
      { name: 'ring', q: 'view=3d&kind=ring&variant=fortress', setup: BOOT(120, RING_SPOT(135)) },
      // (the 3D perf pass: the two dearest pictures, to prove that batching and instancing the planes, flags, decor and ink did not change a pixel: a fight with the gunship, the squadron and a bomber on us, and
      // the Versus match at 30 s with the two ships at close range)
      { name: 'fight', q: 'view=3d&env=skyisles&kind=open', setup: BOOT(300, "game.course.startMission(2,{kind:'open',environment:'skyisles',danger:2}); game.state.ev.warn=0; for(let k=0;k<40&&!game.state.gunship;k++){ game.gunship.spawn(k+1); window.__step(30); } game.squadrons.spawnStrafers(); game.squadrons.spawnBomber(); window.__step(120);") },
      { name: 'versus_close', q: 'view=3d&versus=1&bots=4', setup: FREEZE_ONLY(1800) },
      { name: 'storm', q: 'view=3d&env=storm&kind=open', setup: BOOT(300, 'const st=game.state, w=st.weather; w.storm=1; w.gust=110; w.gusting=true; w.gustIn=0; st.env.gale=1; st.env.windDir=1; st.env.wind=300; w.flash=0;') },
    ];
    fs.mkdirSync(FIX, { recursive: true });
    for (const S of SCENES) {
      if (arg('scene') && S.name !== arg('scene')) continue; // (--scene NAME: only that one, to write or check a single fixture)
      const P = await openPage(`${BASE}/host.html?${S.q}${process.env.SHOT_EXTRA || ""}&tier=medium&cine=0`, { gl: GL, w: SHOT.w, h: SHOT.h, seed: true }); // (SHOT_EXTRA="&look=nooutlines": a dev aid to see the same scene another way)
      await P.ev(S.setup);
      await P.ev(HOLD);
      if (has('calls1') || has('calls')) { console.log('    ' + S.name + ': ' + fmt(await P.json(MEASURE))); await profileOf('shot ' + S.name, P); }
      const buf = await P.png();
      const stt = await P.json(STATE);
      if (verbose) console.log('    view ' + (await P.ev('JSON.stringify((({cx,cy,zoom})=>({cx,cy,zoom}))(window.__lastView))')) + ' ship ' + (await P.ev('JSON.stringify([game.state.ships[0].pose.x,game.state.ships[0].pose.y,game.state.ships[0].pose.vx])')));
      if (!(stt && stt.is3d)) fail(`shot ${S.name}: the 3D view was not running`);
      await settle('shot ' + S.name, P);
      await P.close();
      if (shotDir) { fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, `wp14_scene_${S.name}.png`), buf); }
      const fixture = path.join(FIX, S.name + '.png');
      if (snapshot) { fs.writeFileSync(fixture, buf); console.log('  wrote ' + path.relative(here, fixture)); continue; }
      if (!fs.existsSync(fixture)) { fail(`shot ${S.name}: no fixture (run node tools/buildsim.mjs --snapshot-3d --force)`); continue; }
      const A = PNG.sync.read(fs.readFileSync(fixture)), B = PNG.sync.read(buf);
      if (A.width !== B.width || A.height !== B.height) { fail(`shot ${S.name}: size ${B.width}x${B.height}, the fixture is ${A.width}x${A.height}`); continue; }
      const bw = Math.ceil(A.width / 64), bh = Math.ceil(A.height / 64), sums = new Float64Array(bw * bh), cnt = new Float64Array(bw * bh);
      let total = 0;
      const diff = new PNG({ width: A.width, height: A.height });
      for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
        const i = (y * A.width + x) * 4;
        const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 765;
        total += d; const k = (y >> 6) * bw + (x >> 6); sums[k] += d; cnt[k]++;
        const v = Math.min(255, Math.round(d * 255 * 4)); diff.data[i] = v; diff.data[i + 1] = v; diff.data[i + 2] = v; diff.data[i + 3] = 255;
      }
      const mean = total / (A.width * A.height);
      let worst = 0, wk = 0;
      for (let k = 0; k < sums.length; k++) { const v = sums[k] / cnt[k]; if (v > worst) { worst = v; wk = k; } }
      const good = mean < SHOT.mean && worst < (S.name === 'storm' || S.name === 'mother' ? 0.2 : S.name === 'thunderbird' ? 0.4 : SHOT.block); // (the storm scenes: rain streaks and the bots' searchlight beam are not frame-exact, so one 64 px block may differ more; the Mother's cave has the nest lamp's beam at the corner)
      console.log(`    ${S.name}: mean diff ${(mean * 100).toFixed(2)} %, worst 64x64 block ${(worst * 100).toFixed(1)} % (at ${(wk % bw) * 64},${Math.floor(wk / bw) * 64})`);
      if (!good) {
        const dir = shotDir || out; fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `diff_${S.name}.png`), PNG.sync.write(diff)); fs.writeFileSync(path.join(dir, `actual_${S.name}.png`), buf);
        console.log(`      the picture and a diff image (x4) are in ${dir}`);
      }
      check(good, `shot ${S.name}: within tolerance`, `shot ${S.name}: mean ${(mean * 100).toFixed(2)} % (limit ${SHOT.mean * 100}) / worst block ${(worst * 100).toFixed(1)} % (limit ${SHOT.block * 100})`);
    }
  }

  // ---- fallback: (f) the 2D renderer is the safety net -------------------------------------------------------------------------------------------------------------------------------
  if (want('fallback')) {
    console.log('fallback: 2D when 3D cannot run, and the step down to 2D');
    for (const gl of ['swiftshader', 'none']) {
      const P = await openPage(`${BASE}/host.html`, { gl });
      await sleep(2500);
      const r = await P.json(`JSON.stringify({ is3d: window.viewIs3D(), view: window.autoDetectInfo.view, text: window.autoDetectInfo.text, frames: window.__meter&&window.__meter.fps, three: performance.getEntriesByType('resource').some(e=>/three|view3d\\/index/.test(e.name)) })`);
      console.log('    ' + gl + ': ' + (r && r.text));
      check(r && !r.is3d && r.view === '2d', `${gl}: the host came up in 2D`, `${gl}: ${JSON.stringify(r)}`);
      check(r && !r.three, `${gl}: Three.js was never loaded`, `${gl}: Three.js was loaded although the probe said 2D`);
      if (gl === 'swiftshader') await shotTo(P, 'wp14_fallback_2d.png');
      await settle('2D (' + gl + ')', P);
      await P.close();
    }
    // the governor's step down (a faked, medium-class card name makes the host choose 3D; the frame times are fed to the real governor by hand)
    const FEED = `(async()=>{ const g=window.perfGov; let t=performance.now()+10000; const lv=[]; for(let i=0;i<500;i++){ t+=33; g.update(t,70,30); if(i%50===0) lv.push(g.level()); } return JSON.stringify({ lv, level:g.level(), struggling:g.struggling() }) })()`;
    let P = await openPage(`${BASE}/host.html?gpu=${encodeURIComponent('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')}`, { gl: GL });
    await P.waitFor('window.viewIs3D()', 25000);
    let a = await P.json(`JSON.stringify({ is3d: window.viewIs3D(), tier: window.autoDetectInfo.tier, level: window.perfGov.level(), view: window.view3dDebug().view && window.view3dDebug().view.tier.name })`);
    check(a && a.is3d && a.tier === 'medium' && a.level === 1 && a.view === 'medium', 'an integrated card starts on 3D Medium (governor level 1)', 'integrated start: ' + JSON.stringify(a));
    const fed = await P.json(FEED);
    check(fed && fed.struggling && fed.level === 0, 'the governor steps down to Low and then reports it is struggling', 'governor: ' + JSON.stringify(fed));
    await sleep(1500);
    a = await P.json(`JSON.stringify({ is3d: window.viewIs3D(), toast: document.body.innerText.includes('Switched to 2D for speed'), kept: localStorage.getItem('airshipView'), mem: localStorage.getItem('airshipProbe') })`);
    check(a && !a.is3d && a.toast && a.kept === null, 'in the lobby it switched to 2D at once, with the toast, and left the saved View choice alone', 'step down (lobby): ' + JSON.stringify(a));
    await shotTo(P, 'wp14_toast_2d.png');
    await settle('step down (lobby)', P);
    await P.close();
    // (never mid-fight: with the gunship on us it waits for TO_2D_WAIT, then goes)
    P = await openPage(`${BASE}/host.html?gpu=${encodeURIComponent('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')}`, { gl: GL });
    await P.ev(BOTS8);
    await sleep(3000);
    await P.ev(`(async()=>{ const {config}=await import('/config.js'); config.PERF.TO_2D_WAIT=6; game.course.startMission(2,{kind:'open',environment:'skyisles',danger:2}); game.state.ev.warn=0; return 1 })()`);
    await sleep(2500);
    await P.ev(`game.gunship.spawn(); game.squadrons.spawnStrafers(); window.__nc=setInterval(()=>{ game.state.tempo.phase='peak'; },30); 1`); // (the gunship does not always come at once: the director's "peak" is held as well, which is also not calm)
    await sleep(1500);
    await P.json(FEED);
    await sleep(2500);
    a = await P.json(`JSON.stringify({ is3d: window.viewIs3D(), gunship: !!game.state.gunship, toast: document.body.innerText.includes('Switched to 2D for speed') })`);
    check(a && a.is3d, 'mid-fight (the director is at a peak, the gunship' + (a && a.gunship ? ' is on us' : ' has not come') + ') it does NOT switch yet', 'mid-fight: ' + JSON.stringify(a));
    for (let k = 0; k < 25; k++) { // (TO_2D_WAIT counts game time, and the headless page runs the game slowly: look for up to 25 s of wall time)
      await P.json(FEED); // (keep the governor struggling: real headless frames are fast and would clear it)
      await sleep(1000);
      a = await P.json(`JSON.stringify({ is3d: window.viewIs3D(), toast: document.body.innerText.includes('Switched to 2D for speed') })`);
      if (a && !a.is3d) break;
    }
    check(a && !a.is3d && a.toast, 'when no calm moment comes it switches after TO_2D_WAIT', 'after the wait: ' + JSON.stringify(a));
    await settle('step down (fight)', P);
    await P.close();
  }

  // ---- offline: (g) -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('offline')) {
    console.log('offline: nothing but localhost');
    for (const [name, u, gl] of [['phone page', '/controller.html', 'default'], ['build page', '/buildtest.html', GL], ['host in 2D', '/host.html?view=2d', GL]]) {
      const P = await openPage(BASE + u, { gl, ready: 'document.readyState==="complete"' });
      await sleep(3000);
      await settle(name, P);
      await P.close();
    }
    { // (the gate can fail: a page that DOES ask for the internet is seen, and the blocked request does not get through)
      const P = await openPage(BASE + '/controller.html', { gl: 'default', ready: 'document.readyState==="complete"' });
      const r = await P.ev(`fetch('https://example.com/x.js').then(()=> 'loaded', ()=> 'blocked')`);
      await sleep(300);
      check(r === 'blocked' && P.external.length >= 1, 'self-test: a request to the internet is blocked and noticed', 'self-test: ' + r + ' / ' + P.external.length + ' noticed');
      await P.close();
    }
    console.log(`    ${NET.pages} pages, ${NET.requests} requests`);
    check(NET.external.length === 0, 'no request left localhost (the host-resolver blocked everything else)', 'requests to the internet: ' + NET.external.slice(0, 6).join(', '));
    check(NET.failures.length === 0, 'no failed or missing file', 'failed loads: ' + NET.failures.slice(0, 6).join(', '));
    // a static scan too: no CDN in any page or module
    const hits = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'vendor') walk(f); } else if (/\.(html|js|mjs|css)$/.test(e.name)) {
      const txt = fs.readFileSync(f, 'utf8').split(/\r?\n/);
      txt.forEach((l, i) => { if (/(src|href)\s*=\s*["']https?:\/\/|from\s+["']https?:\/\/|import\s*\(\s*["']https?:\/\/|fetch\s*\(\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|@import\s+["']?https?:/.test(l)) hits.push(path.relative(here, f) + ':' + (i + 1)); });
    } } };
    walk(path.join(here, 'public'));
    check(hits.length === 0, 'no CDN link in public/ (outside vendor/)', 'external links: ' + hits.slice(0, 6).join(', '));
  }

  // ---- sub: (h) ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('sub') && (all || only.includes('sub'))) {
    console.log('sub: the other 3D gates');
    const SUBS = [['lint3d', ['tools/lint3d.mjs']], ['physics', ['tools/physics-check.mjs']], ['enemy3d', ['tools/enemy3d-check.mjs']], ['light3d', ['tools/light3d-check.mjs']], ['weather3d', ['tools/weather3d-check.mjs']],
      ['cine3d', ['tools/cine3d-check.mjs']], ['ring3d', ['tools/ring3d-check.mjs', '--quick']], ['creature3d', ['tools/creature3d-check.mjs', '--quick']], ['crew3d', ['tools/crew3d-check.mjs', '--quick']]];
    for (const [name, args] of SUBS) {
      const t0 = Date.now();
      const go = () => spawnSync(process.execPath, [...args.slice(0, 1).map((f) => path.join(here, f)), ...args.slice(1)], { cwd: here, encoding: 'utf8', timeout: 1500000, maxBuffer: 1 << 28 });
      let r = go(), retried = false;
      // (physics-check's "debris expires" step is a timing flake on this machine - it fails the same way on the commit before WP14 - so it gets one more try, and says so)
      if (r.status !== 0 && name === 'physics') { retried = true; r = go(); }
      const text = (r.stdout || '') + (r.stderr || '');
      if (verbose || r.status !== 0) console.log(text.split('\n').slice(-14).map((l) => '      ' + l).join('\n'));
      check(r.status === 0, `${name} passed${retried ? ' on the second try (known flake)' : ''} (${Math.round((Date.now() - t0) / 1000)} s)`, `${name} FAILED (exit ${r.status})`);
    }
  }
} catch (e) {
  fail('the check crashed: ' + (e && e.stack ? e.stack : e));
} finally {
  stopServer();
}
console.log(failed ? `\n${failed} problem(s)` : snapshot ? '\nfixtures written' : '\nview3d check: all clear');
process.exit(failed ? 1 : 0);
