// THE RING IN 3D gate (LOOP.md R1: view3d/ringBend.js, ringCastle.js): a ring map (the tower, the fortress, the citadel) bent round its castle by the vertex shaders, in a real headless Chrome.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/ring3d-check.mjs [--quick] [--port N] [--shots DIR] [--prefix ring3d_] [--only scenes,parity,circle,comeabout,low,spy,twod,shots] [--variants tower,fortress,citadel] [--env storm|sea|ember|...] [--verbose]
// Steps (--only names):
//   scenes     8 bots on each ring in REAL TIME (host.html?view=3d&kind=ring&variant=V): the ship is put at the ring's start and flies it live: 0 console errors, 0 game errors, the ring is on, and the Medium
//              budgets hold (draw calls <= 150, triangles <= 450k, view JS <= 6 ms); the ring bend's own CPU cost per frame is printed
//   parity     the GLSL ringBend() (read back from a float render target) and RB.pt() (what the HUD labels use) agree to 0.5 world units (a quarter of a pixel at the usual zoom: that is the GPU's own sin / cos precision on a ring 4500 px wide; float32 arithmetic alone gives 0.003) over the approach, the lead-in and the whole circle
//   circle     the sim frozen, the ship stepped round a WHOLE CIRCLE (and the approach): at every angle the HUD is within 1 px at the ship (V.alignError over the flat zone, and the projected ship's anchors
//              against the 2D mapping of the same points), the camera never rolls, and on the ring the castle's keep stands in the middle of the picture (its NDC x within 0.08 of the middle)
//   comeabout  a COME ABOUT on the ring, cinematics off and on: the HUD within 1 px all through the turn with them off, the camera never rolls, the keep stays in the middle, and after it the camera is the plain lens
//   low        ?tier=low: the bend still works (the ring is on, 0 errors)
//   spy        the lookout's spyglass on the ring is drawn live in 3D, bent round its own look-at point, and the main picture stays exact
//   twod       ?view=2d on a ring: it plays and draws with 0 errors and never loads the 3D view (the 2D renderer is untouched)
//   shots      (with --shots DIR) the ship circling the tower and the fortress at 0 / 90 / 180 / 270 degrees (clear air picked near each), the citadel with the Flagship moored, and wide views
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const quick = has('quick'), verbose = has('verbose');
const port = Number(arg('port', 6400 + Math.floor(Math.random() * 400)));
const shotDir = arg('shots', ''), prefix = arg('prefix', 'ring3d_');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const VARIANTS = (arg('variants', 'tower,fortress,citadel') || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (cond, good, bad) => { if (cond) ok(good); else fail(bad || good); return !!cond; };
const BUDGET = { calls: 150, tris: 450000, js: 6 }; // (3D.md section 6, Medium)

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: verbose ? 'inherit' : 'ignore' });
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); stopServer(); process.exit(2); }
const BASE = `http://localhost:${port}`;

const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }
const SEED = `Date.now=()=>1750000000000; window.__seed=(n)=>{ let sd=n|0; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }; window.__seed(20261011);`;
// the simulation only runs when stepped by hand (window.__step), unless the page asks to run live (window.__live = true is set before main.js publishes the game)
const FREEZE = `(()=>{ let g; Object.defineProperty(window,'game',{configurable:true,get(){return g},set(v){ g=v; try{ window.__upd=v.update.bind(v); if(!window.__live) v.update=()=>{}; }catch(e){} }}); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); }; })();`;

async function openPage(url, opts = {}) {
  const W = opts.w || 1600, H = opts.h || 900;
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ring3d-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: 'ignore' });
  const P = { errors: [], warns: [], logs: [] };
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
      else if (q.type === 'warning' && /^(view3d |3D view problem|3D view stopped)/.test(text)) P.warns.push(text);
    } else if (d.method === 'Runtime.exceptionThrown') P.errors.push('EXCEPTION: ' + ((q.exceptionDetails.exception && q.exceptionDetails.exception.description) || q.exceptionDetails.text).slice(0, 500));
    else if (d.method === 'Log.entryAdded') { if (q.entry.level === 'error' && !isFav(q.entry.url) && !isFav(q.entry.text)) P.errors.push('log: ' + q.entry.text.slice(0, 200) + ' ' + (q.entry.url || '')); }
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SEED + (opts.live ? 'window.__live=true;' : '') + FREEZE });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { const m = 'EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 500); P.errors.push(m); return undefined; }
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
  P.ready = await P.waitFor('window.__meter!==undefined', 60000);
  return P;
}

// ---- page-side helpers ----------------------------------------------------------------------------------------------------------------------------------------------------------------
const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
const PRE = `
window.__ring = {
  V: () => window.view3dDebug().view,
  W: () => document.getElementById('c').width, H: () => document.getElementById('c').height,
  frame: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1)))),
  info() { const st = window.game.state, r = st.course && st.course.ring; return r ? { variant: r.variant, R: r.R, C: r.C, xRing: r.xRing, axisY: r.axisY, faces: r.faces.map((f) => ({ i: f.i, x: f.x, angle: f.angle })) } : null; },
  // put the ship at ring angle deg (radians * 180 / pi); tpClear searches round it (within +-span degrees) for air the ship's box fits in
  tp(deg) { const st = window.game.state, sh = st.ships[0], r = st.course.ring, a = deg * Math.PI / 180; sh.pose.x = r.xRing + a * r.R - sh.layout.refPoint.x; sh.pose.y = r.axisY - sh.layout.refPoint.y; sh.pose.vy = 0; sh.pose.f = 1; return deg; },
  clearAt(deg, dy = 0) { const st = window.game.state, sh = st.ships[0], r = st.course.ring, m = st.course.map, F = sh.layout.fitBox, P = sh.layout.refPoint, C = m.CELL; const x = r.xRing + deg * Math.PI / 180 * r.R, y = r.axisY + dy;
    const x0 = Math.floor((x + F.x0 - P.x) / C), x1 = Math.floor((x + F.x1 - P.x) / C), y0 = Math.floor((y + F.y0 - P.y) / C), y1 = Math.floor((y + F.y1 - P.y) / C);
    for (let j = y0 - 2; j <= y1 + 2; j++) for (let i = x0 - 2; i <= x1 + 2; i++) if (i >= 0 && j >= 0 && i < m.W && j < m.H && m.solid[j * m.W + i]) return false; return true; },
  tpClear(deg, span = 30) { for (let d = 0; d <= span; d += 1) for (const s of [1, -1]) { if (this.clearAt(deg + s * d)) return this.tp(deg + s * d); } return this.tp(deg); },
  sample() {
    const V = this.V(), st = window.game.state, sh = st.ships[0], lv = window.__lastView, w = this.W(), h = this.H();
    const m = V.camera.matrixWorld.elements;
    const out = { align: V.alignError(lv, w, h), alignWide: V.alignError(lv, w, h, 1), roll: Math.abs(m[1]), anchor: 0, keepX: null, ring: !!(V.stats().ring) };
    const L = sh.layout, b = L.bounds, pts = [[L.refPoint.x, L.refPoint.y], [b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1], [L.midPoint.x, L.midPoint.y]];
    for (const [px, py] of pts) {
      const p3 = V.hud3d.shipPt(sh, px, py, 0); if (!p3) continue;
      const q = V.hud3d.project(p3[0], p3[1], 0); if (!q) continue;
      const ex = w / 2 + (p3[0] - lv.cx) * lv.zoom, ey = h / 2 + (-p3[1] - lv.cy) * lv.zoom;
      out.anchor = Math.max(out.anchor, Math.hypot(q.x * w - ex, q.y * h - ey));
    }
    const k = V.castle && V.castle.keep;
    if (k && k.visible) { const P = new V.camera.position.constructor(k.position.x, k.position.y + 1500, k.position.z).project(V.camera); out.keepX = P.x; }
    out.xc = V.stats().ring ? V.stats().ring.xc : null; out.zoom = lv.zoom; out.onRing = out.xc != null && out.xc >= st.course.ring.xRing; // (the keep is only straight behind the ship once she is ON the ring; on the approach it swings in from the side)
    return out;
  },
};
window.__acc = (() => { const a = { n: 0, align: 0, alignWide: 0, roll: 0, anchor: 0, keepX: 0, keepN: 0, worstAt: '' }; return a; })();
window.__rec = (s, tag) => { const a = window.__acc; a.n++; if (s.align > a.align) { a.align = s.align; a.worstAt = tag; } a.alignWide = Math.max(a.alignWide, s.alignWide); a.roll = Math.max(a.roll, s.roll); a.anchor = Math.max(a.anchor, s.anchor); if (s.keepX != null && s.onRing) { a.keepX = Math.max(a.keepX, Math.abs(s.keepX)); a.keepN++; } };
window.__reset = () => { Object.assign(window.__acc, { n: 0, align: 0, alignWide: 0, roll: 0, anchor: 0, keepX: 0, keepN: 0, worstAt: '' }); };
`;
const BOTS8 = `(async()=>{ ${sl} const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); return Object.keys(window.game.state.players).length })()`;
const ENV = arg('env', ''); // (--env storm|sea|ember|frost|fungal|aether: fly the rings in that sky)
const urlOf = (variant, q = '') => `${BASE}/host.html?view=3d&kind=ring&variant=${variant}&tier=medium&cine=0${ENV ? '&env=' + ENV : ''}${q}`;
const fmtStat = (m) => `calls ${m.calls} (max ${m.maxCalls}) | ${Math.round(m.tris / 1000)}k tris | view js ${m.js} ms (max ${m.maxJs}) | ring ${m.ringMs} ms | ${m.fps} fps | ${m.tier}`;
const MEASURE = `(async()=>{ const V=window.view3dDebug().view; if(!V) return JSON.stringify({none:true}); const med=(a)=>a.slice().sort((x,y)=>x-y)[a.length>>1]; const s=[]; const t0=performance.now(), f0=V.frames;
  for(let i=0;i<14;i++){ s.push(V.stats()); await new Promise(r=>setTimeout(r,120)); }
  const dt=(performance.now()-t0)/1000; const u=s[s.length-1];
  return JSON.stringify({ calls:med(s.map(q=>q.calls)), maxCalls:Math.max(...s.map(q=>q.calls)), tris:med(s.map(q=>q.tris)), maxTris:Math.max(...s.map(q=>q.tris)), js:+med(s.map(q=>q.jsMs)).toFixed(2), maxJs:+Math.max(...s.map(q=>q.jsMs)).toFixed(2), ringMs:+med(s.map(q=>q.ring?q.ring.ms:0)).toFixed(3), fps:Math.round((V.frames-f0)/dt), tier:u.tier, ringOn:s.every(q=>!!q.ring) }) })()`;

// --calls (a dev aid, as in view3d-check.mjs): where one frame's draw calls go in each live scene, by object path (shadow and main pass apart)
const PROFILE = `(()=>{ const V=window.view3dDebug().view, R=V.renderer, rows=new Map(), orig=R.renderBufferDirect, origReset=R.info.reset.bind(R.info), f0=V.frames, one=true;
  const pathOf=(o)=>{ const bits=[]; for(let p=o;p&&p.type!=='Scene';p=p.parent){ const i=p.parent?p.parent.children.indexOf(p):0; bits.push((p.name?p.name:p.type[0])+(p.parent&&p.parent.type!=='Scene'&&!p.name?i:'')); } return bits.reverse().join('>'); };
  const nameOf=(o)=>{ const bits=[]; for(let p=o;p&&bits.length<4;p=p.parent){ const n=p.name||''; if(n) bits.push(n); } return bits.reverse().join('/')||('(unnamed, parent '+(o.parent&&(o.parent.name||o.parent.type))+')'); };
  let seg=0,lastF=-1,fr1=0; R.info.reset=function(){ if(V.frames!==lastF){ lastF=V.frames; seg=0; } seg++; if(seg===1) fr1++; return origReset(); };
  R.renderBufferDirect=function(cam,sc,geo,mat,obj,grp){ if(seg!==1||(obj.isInstancedMesh&&obj.count===0)) return orig.apply(this,arguments); const g=geo&&geo.attributes&&geo.attributes.position; const key=(sc?'main  ':'shadow')+' | '+(one?pathOf(obj)+' v'+(g?g.count:'?'):nameOf(obj))+' | '+obj.type+(obj.isInstancedMesh?' x'+obj.count:'')+' | '+(mat&&mat.type)+(mat&&mat.side===1?' back':'')+(mat&&mat.name?' '+mat.name:'')+(mat&&mat.color&&mat.type==='MeshBasicMaterial'?' #'+mat.color.getHexString():''); rows.set(key,(rows.get(key)||0)+1); return orig.apply(this,arguments); };
  return new Promise((res)=>{ const t0=performance.now(); const tick=()=>{ const done=one?fr1>=1&&V.frames>lastF:performance.now()-t0>500; if(!done) return setTimeout(tick,5); R.renderBufferDirect=orig; R.info.reset=origReset; const fr=Math.max(1,fr1); const out=[...rows.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>(v/fr).toFixed(1)+'  '+k); res(JSON.stringify({ frames:fr, total:+([...rows.values()].reduce((a,b)=>a+b,0)/fr).toFixed(1), rows:out })); }; tick(); }); })()`;
const settle = async (name, P) => {
  const game = (await P.json('JSON.stringify(window.gameErrors||[])')) || [];
  const bad = [...P.errors, ...P.warns];
  if (verbose || bad.length || game.length) for (const l of [...bad, ...game.map((g) => 'game error: ' + g)].slice(0, 8)) console.log('    [' + name + '] ' + l);
  check(bad.length === 0 && game.length === 0, `${name}: 0 console errors, 0 game errors`, `${name}: ${bad.length} console error(s), ${game.length} game error(s)`);
  if (!P.ready) fail(`${name}: the page never drew its first frame`);
};
const shotTo = async (P, file) => { if (!shotDir) return; fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, file), await P.png()); };
const settleCamera = (n = 90) => `(async()=>{ const c=window.__ring; for(let i=0;i<${n};i++) await c.frame(); return 1 })()`;

try {
  // ---- scenes: 8 bots live on every ring --------------------------------------------------------------------------------------------------------------------------------------------
  if (want('scenes')) {
    console.log('scenes: 8 bots in real time on the rings');
    for (const v of VARIANTS) {
      const P = await openPage(urlOf(v), { live: true });
      await P.ev(PRE);
      await P.ev(BOTS8);
      await sleep(2500);
      const info = await P.json('JSON.stringify(window.__ring.info())');
      check(info && info.variant === v, `${v}: the stop is the ${v} ring (R ${info && info.R})`, `${v}: not a ring map ${JSON.stringify(info)}`);
      await P.ev(`window.__ring.tpClear(-8, 20)`);
      await sleep(quick ? 5000 : 12000);
      const st = await P.json(`JSON.stringify({ phase: window.game.state.phase, frames: window.view3dDebug().view ? window.view3dDebug().view.frames : 0, is3d: window.viewIs3D(), ring: !!(window.view3dDebug().view && window.view3dDebug().view.stats().ring) })`);
      check(st && st.is3d && st.ring && st.frames > 100, `${v}: flying in 3D with the ring on (${st && st.frames} frames, phase ${st && st.phase})`, `${v}: not flying the ring in 3D ${JSON.stringify(st)}`);
      const m = await P.json(MEASURE);
      if (m && !m.none) {
        console.log(`    ${v}: ${fmtStat(m)}`);
        if (has('calls')) { const r = await P.json(PROFILE); if (r) for (const l of r.rows.slice(0, Number(arg('rows', 60)))) console.log('      ' + l); }
        check(m.maxCalls <= BUDGET.calls, `${v}: draw calls ${m.maxCalls} <= ${BUDGET.calls}`, `${v}: draw calls ${m.maxCalls} > ${BUDGET.calls}`);
        check(m.maxTris <= BUDGET.tris, `${v}: triangles ${Math.round(m.maxTris / 1000)}k <= ${BUDGET.tris / 1000}k`, `${v}: triangles ${Math.round(m.maxTris / 1000)}k > ${BUDGET.tris / 1000}k`);
        check(m.js <= BUDGET.js, `${v}: view JS ${m.js} ms <= ${BUDGET.js} ms (the ring bend itself: ${m.ringMs} ms)`, `${v}: view JS ${m.js} ms > ${BUDGET.js} ms`);
      } else fail(v + ': no 3D numbers');
      await shotTo(P, prefix + 'live_' + v + '.png');
      await settle(v + ' live', P);
      await P.close();
    }
  }

  // ---- parity: the shader's bend and the HUD's JavaScript bend are the same function ------------------------------------------------------------------------------------------------------------
  if (want('parity')) {
    console.log('parity: GLSL ringBend() against RB.pt() (what the HUD labels use), over the approach, the lead-in and the whole circle');
    for (const v of VARIANTS) {
      const P = await openPage(urlOf(v));
      await P.ev(PRE);
      await P.ev(BOTS8);
      await sleep(1500);
      const r = await P.json(`(async()=>{
        const S = await import('/modules/view3d/style.js'), M = await import('/modules/view3d/ringBend.js'), T = S.THREE, RB = M.RB;
        const map = window.game.state.course.map; RB.setMap(map);
        const N = 256, pts = [], pos = new Float32Array(N * 3), idx = new Float32Array(N);
        let sd = 12345; const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
        const r0 = map.ring;
        for (let i = 0; i < N; i++) { const x = r0.xRing - 0.9 * r0.R - 3000 + rnd() * (r0.C + 0.9 * r0.R + 6000), y = (rnd() - 0.5) * 6000, z = -700 + rnd() * 900; pts.push([x, y, z]); pos.set([x, y, z], i * 3); idx[i] = i; }
        const out = [];
        const canvas = new OffscreenCanvas(N, 1), renderer = new T.WebGLRenderer({ canvas, antialias: false });
        const rt = new T.WebGLRenderTarget(N, 1, { type: T.FloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter, depthBuffer: false });
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('aIdx', new T.BufferAttribute(idx, 1));
        const mat = new T.ShaderMaterial({ uniforms: RB.addUniforms({}), vertexShader: M.RING_GLSL + 'attribute float aIdx; varying vec3 vB; void main() { vB = ringBend( position ); gl_Position = vec4( ( aIdx + 0.5 ) / ' + N + '.0 * 2.0 - 1.0, 0.0, 0.0, 1.0 ); gl_PointSize = 1.0; }', fragmentShader: 'varying vec3 vB; void main() { gl_FragColor = vec4( vB, 1.0 ); }', depthTest: false, blending: T.NoBlending });
        const sc = new T.Scene(); sc.add(new T.Points(g, mat)); sc.children[0].frustumCulled = false;
        let worst = 0, worstAt = '', checked = 0;
        for (const xc of [r0.xRing - 4000, r0.xRing - 300, r0.xRing + 0.25 * r0.R, r0.xRing + 1.6 * r0.R, r0.xRing + r0.C - 500]) {
          RB.setFrame(xc, 600);
          renderer.setRenderTarget(rt); renderer.render(sc, new T.OrthographicCamera(-1, 1, 1, -1, 0, 1));
          const px = new Float32Array(N * 4); renderer.readRenderTargetPixels(rt, 0, 0, N, 1, px);
          for (let i = 0; i < N; i++) { const q = RB.pt(pts[i][0], pts[i][1], pts[i][2], {}); const d = Math.hypot(px[i * 4] - q.x, px[i * 4 + 1] - q.y, px[i * 4 + 2] - q.z); checked++; if (d > worst) { worst = d; worstAt = 'xc ' + Math.round(xc) + ' x ' + Math.round(pts[i][0]); } }
        }
        renderer.dispose(); rt.dispose();
        return JSON.stringify({ checked, worst, worstAt });
      })()`);
      if (r) {
        console.log(`    ${v}: ${r.checked} points x 5 frames | worst difference ${r.worst.toExponential(2)} world units (${r.worstAt})`);
        check(r.checked >= 1000 && r.worst < 0.5, `${v}: the shader and the HUD bend agree (worst ${r.worst.toExponential(1)} units)`, `${v}: the shader and RB.pt disagree by ${r.worst} units (${r.worstAt})`);
      } else fail(v + ': the parity run gave nothing');
      await settle(v + ' parity', P);
      await P.close();
    }
  }

  // ---- circle: the sim frozen, the ship stepped round the whole ring ------------------------------------------------------------------------------------------------------------------
  if (want('circle')) {
    console.log('circle: the HUD at the ship through a whole circle and the approach (the sim frozen, the ship placed at every angle)');
    for (const v of VARIANTS) {
      const P = await openPage(urlOf(v));
      await P.ev(PRE);
      await P.ev(`(async()=>{ ${sl} const g=window.game; const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); window.__step(60); await sl(300); return 1 })()`);
      const step = quick ? 30 : 10;
      const r = await P.json(`(async()=>{ const c=window.__ring; window.__reset(); const info=c.info(); const angles=[]; for(let a=-100;a<=370;a+=${step}) angles.push(a);
        // (a first settle at the start, so the 2D camera is near the ship)
        c.tp(-100); for(let i=0;i<60;i++) await c.frame();
        for(const a of angles){ c.tp(a); await c.frame(); await c.frame(); window.__rec(c.sample(), a+'deg'); }
        const a=window.__acc; return JSON.stringify({ n:a.n, align:a.align, worstAt:a.worstAt, alignWide:a.alignWide, roll:a.roll, anchor:a.anchor, keepX:a.keepX, keepN:a.keepN }) })()`);
      if (r) {
        console.log(`    ${v}: ${r.n} angles | HUD grid <= ${r.align.toFixed(4)} px (worst at ${r.worstAt}) | ship anchors <= ${r.anchor.toFixed(4)} px | whole screen <= ${r.alignWide.toFixed(0)} px (the ring curving away) | roll ${r.roll} | keep x <= ${r.keepX.toFixed(3)} of the middle (${r.keepN} samples on the ring)`);
        check(r.n >= 10 && r.align < 1 && r.anchor < 1, `${v}: the HUD is within 1 px at the ship through the whole circle`, `${v}: the HUD is off at the ship: grid ${r.align} px, anchors ${r.anchor} px (worst at ${r.worstAt})`);
        check(r.roll < 1e-6, `${v}: the camera never rolls`, `${v}: the camera rolled (${r.roll})`);
        check(r.keepN > 5 && r.keepX < 0.08, `${v}: the castle's keep stays in the middle of the picture (x within ${r.keepX.toFixed(3)} of it)`, `${v}: the keep wandered off the middle (${r.keepX}, ${r.keepN} samples)`);
      } else fail(v + ': the circle run gave nothing');
      await settle(v + ' circle', P);
      await P.close();
    }
  }

  // ---- come about on the ring ------------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('comeabout')) {
    console.log('comeabout: a COME ABOUT on the ring');
    for (const cine of [0, 1]) {
      const v = 'fortress';
      if (!VARIANTS.includes(v)) continue;
      const P = await openPage(urlOf(v).replace('cine=0', 'cine=' + cine));
      await P.ev(PRE);
      await P.ev(`(async()=>{ ${sl} const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); window.__step(60); await sl(300); window.__cfg=(await import('/config.js')).config; return 1 })()`);
      const r = await P.json(`(async()=>{ ${sl} const c=window.__ring, st=window.game.state, sh=st.ships[0], g=st.turning, T=window.__cfg.SHIP.TURN; window.__reset();
        c.tpClear(135, 20); for(let i=0;i<120;i++) await c.frame();
        g.t=1e-4; g.flipped=false; g.hold=0; g.dur=T.TIME; sh.pose.turn=g.t/g.dur;
        let k=0; while(sh.pose.turn>0 && k<500){ window.__step(1); await c.frame(); window.__rec(c.sample(), 'turn '+sh.pose.turn.toFixed(2)); k++; }
        const during={ ...window.__acc };
        let settled=false, after=null; for(let i=0;i<400 && !settled;i++){ await c.frame(); after=c.sample(); settled=!c.V().cinema.pose.active; }
        return JSON.stringify({ frames:k, during, settled, after, fired:c.V().cinema.stats.fired }) })()`);
      if (r) {
        const d = r.during;
        console.log(`    cine ${cine ? 'on ' : 'off'}: ${r.frames} frames | HUD grid <= ${d.align.toFixed(3)} px | anchors <= ${d.anchor.toFixed(3)} px | roll ${d.roll} | keep x <= ${d.keepX.toFixed(3)} | settled ${r.settled}, after: ${r.after ? r.after.align.toFixed(4) : '?'} px`);
        check(r.frames > 30, `cine ${cine}: the turn ran (${r.frames} frames)`, `cine ${cine}: the turn did not run`);
        if (!cine) check(d.align < 1 && d.anchor < 1, 'cine off: the HUD stays within 1 px through the turn', `cine off: the HUD is off during the turn (${d.align} / ${d.anchor} px)`);
        check(d.roll < 1e-6, `cine ${cine}: no roll`, `cine ${cine}: the camera rolled (${d.roll})`);
        check(d.keepX < (cine ? 0.35 : 0.08), `cine ${cine}: the keep stays near the middle (${d.keepX.toFixed(3)}; the come-about dolly swings the camera 10 degrees round the look-at point)`, `cine ${cine}: the keep wandered (${d.keepX})`);
        check(r.settled && r.after && r.after.align < 1 && r.after.anchor < 1, `cine ${cine}: after the turn the camera is the plain lens again (HUD within 1 px)`, `cine ${cine}: not aligned after the turn ${JSON.stringify(r.after)}`);
        if (cine) check(r.fired.come >= 1, 'cine on: the come-about dolly composed on the ring', 'cine on: the come-about dolly never started');
      } else fail('comeabout: no result');
      await settle('comeabout cine ' + cine, P);
      await P.close();
    }
  }

  // ---- low: the bend is just maths ------------------------------------------------------------------------------------------------------------------------------------------------------
  if (want('low')) {
    console.log('low: tier Low');
    const P = await openPage(`${BASE}/host.html?view=3d&kind=ring&variant=fortress&tier=low&cine=0`);
    await P.ev(PRE);
    await P.ev(BOTS8);
    await sleep(2500);
    await P.ev(`window.__step(120); window.__ring.tpClear(135, 20)`);
    await P.ev(settleCamera(60));
    const s = await P.json(`JSON.stringify({ tier: window.view3dDebug().view.tier.name, ring: !!window.view3dDebug().view.stats().ring, align: window.__ring.sample().align })`);
    check(s && s.tier === 'low' && s.ring && s.align < 1, `low: the ring is bent at tier Low (HUD ${s && s.align} px)`, `low: ${JSON.stringify(s)}`);
    await shotTo(P, prefix + 'low_fortress.png');
    await settle('low', P);
    await P.close();
  }

  // ---- spy: the lookout's spyglass on the ring (it bends the strip round ITS OWN look-at point) ------------------------------------------------------------------------------------------------
  if (want('spy')) {
    console.log('spy: the lookout\'s spyglass on the fortress ring');
    const P = await openPage(urlOf('fortress'));
    await P.ev(PRE);
    await P.ev(BOTS8);
    const n = await P.json(`(async()=>{ const st=window.game.state; let n=0; while(!(st.spy&&st.spy.on)&&n<12000){ window.__step(30); n+=30; } return JSON.stringify(n) })()`);
    await P.ev(`window.__ring.tpClear(70, 40)`);
    await P.ev(settleCamera(120));
    const s = await P.json(`JSON.stringify({ on: !!(window.game.state.spy && window.game.state.spy.on), live: [...window.view3dDebug().view.portholesLive], p: window.view3dDebug().view.stats().portholes, ring: !!window.view3dDebug().view.stats().ring, align: window.__ring.sample().align })`);
    check(s && s.on && s.ring, 'spy: a manned lookout shows the spyglass on the ring (' + n + ' steps)', 'spy: ' + JSON.stringify(s));
    check(s && s.live.includes('spy') && s.p && !s.p.error, 'spy: the spyglass is drawn live in 3D through its own bend (' + JSON.stringify(s && s.p) + ')', 'spy: not drawn live ' + JSON.stringify(s));
    check(s && s.align < 1, 'spy: the main picture is still exact after the spyglass pass (' + (s && s.align) + ' px)', 'spy: the main HUD is off after the spyglass pass ' + (s && s.align));
    await shotTo(P, prefix + 'spyglass.png');
    await settle('spy', P);
    await P.close();
  }

  // ---- twod: the flat game is untouched ------------------------------------------------------------------------------------------------------------------------------------------
  if (want('twod')) {
    console.log('twod: the 2D view on a ring');
    const P = await openPage(`${BASE}/host.html?view=2d&kind=ring&variant=tower`, { live: true });
    await P.ev(BOTS8);
    await sleep(quick ? 3000 : 6000);
    const s = await P.json(`JSON.stringify({ is3d: window.viewIs3D(), ring: !!(window.game.state.course && window.game.state.course.ring), phase: window.game.state.phase, view: !!(window.view3dDebug().view), three: !!document.querySelector('script[src*="three"]') })`);
    check(s && !s.is3d && s.ring && s.phase === 'flying' && !s.view, '2D: a ring plays flat, the 3D view never started', '2D: ' + JSON.stringify(s));
    await shotTo(P, prefix + '2d_tower.png');
    await settle('2D ring', P);
    await P.close();
  }

  // ---- shots: the ship circling the castle ------------------------------------------------------------------------------------------------------------------------------------------
  if (want('shots') && shotDir) {
    console.log('shots: the ship circling the castle -> ' + shotDir);
    for (const v of VARIANTS) {
      const P = await openPage(urlOf(v));
      await P.ev(PRE);
      await P.ev(`(async()=>{ ${sl} const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); window.__step(90); await sl(300); return 1 })()`);
      const angles = v === 'citadel' ? [0, 90, 150, 210, 270] : [0, 90, 180, 270];
      for (const wide of [0, 1]) {
        await P.ev(`window.view3dDebug().view.S.zoom=${wide ? 0.45 : 1}; 1`);
        for (const a of angles) {
          await P.ev(`window.__ring.tpClear(${a}, 40)`);
          await P.ev(settleCamera(100));
          await P.ev(`(async()=>{ const c=window.__ring; c.tpClear(${a}, 40); for(let i=0;i<40;i++) await c.frame(); return 1 })()`);
          const al = await P.json(`JSON.stringify(window.__ring.sample())`);
          await shotTo(P, `${prefix}${v}_${wide ? 'wide_' : ''}${String(a).padStart(3, '0')}.png`);
          if (al && !wide) check(al.align < 1, `${v} ${a} deg: shot taken, HUD ${al.align.toFixed(4)} px`, `${v} ${a} deg: HUD off ${al.align}`);
        }
      }
      await settle(v + ' shots', P);
      await P.close();
    }
  }
} catch (e) {
  console.log('the check crashed: ' + (e && e.stack ? e.stack : e));
  failed++;
} finally {
  stopServer();
}
console.log(failed ? `\n${failed} FAILED` : '\nring3d-check: all clear');
process.exit(failed ? 1 : 0);
