// (D3: --setpieces [--cine 1] [--scenes bridge,collapse,stone,chain,crown] runs the castle's big moments on a fake clock, see setpieceShots below)
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
const verbose = has('verbose'), extra = has('extra'), garrisonMode = has('garrison');
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
// ---- D2: the garrison (--garrison [--prefix garrison3d_]): a volley's telegraph and arrows, squads cheering and fleeing, the ballista's line, the boom chain whole and snapped, grapples, white flags at the crown, a night castle with fire arrows.
//   Prints the garrison's own draw calls / triangles (hide it and measure the difference) and its view cost. Each variant gets the scenes it has (the ballista is on the fortress, fire arrows on the citadel, the chain on both).
const GAR_PRE = `
window.__g = {
  st: () => window.game.state, ring: () => window.game.state.course.ring, V: () => window.view3dDebug().view,
  at(face, dx = 0, dy = 0) { const st = this.st(), sh = st.ships[0], r = this.ring(), f = r.faces[face]; sh.pose.x = f.x + dx - sh.layout.refPoint.x; sh.pose.y = r.axisY + dy - sh.layout.refPoint.y; sh.pose.vy = 0; sh.pose.vx = 0; sh.pose.f = 1; sh.ctx.ship.speed = 0; },
  atX(x, dy = 0) { const st = this.st(), sh = st.ships[0], r = this.ring(); sh.pose.x = x - sh.layout.refPoint.x; sh.pose.y = r.axisY + dy - sh.layout.refPoint.y; sh.pose.vy = 0; sh.pose.vx = 0; sh.pose.f = 1; sh.ctx.ship.speed = 0; },
  cam(z) { this.V().S.zoom = z; },
  look(x, y, z) { this.V().S.look = { x, y }; this.V().S.zoom = z; },
  unlook() { this.V().S.look = null; },
  async volley(face, dx, want) { // the real sim, the ship held at the face, until a post tells (want 'tell') or ten arrows are in the air (want 'arrows')
    const r = this.ring(), st = this.st();
    for (const p of r.faces[face].posts) p.t = 0;
    for (let i = 0; i < 700; i++) {
      this.at(face, dx, 450); window.__step(1);
      const tell = r.faces[face].posts.find((p) => p.mode === 'tell');
      if (want === 'tell' && tell && tell.telegraph < 0.8) return 'tell';
      if (want === 'arrows' && st.bullets.filter((b) => b.arrow).length >= 12) return 'arrows';
    }
    return 'timeout';
  },
  async lock(face, t) { const P = await import('/modules/host/pose.js'), st = this.st(), sh = st.ships[0], f = this.ring().faces[face], sp = f.special; const ax = P.toWorldX(sh, sh.layout.aimPoint.x), ay = P.toWorldY(sh, sh.layout.aimPoint.y); sp.lock = { t, max: 1.5, ship: sh, x0: sp.x, y0: sp.y - 100, x1: ax, y1: ay }; return [sp.x, sp.y, ax, ay]; },
  async grapple(face, k) { const P = await import('/modules/host/pose.js'), st = this.st(), sh = st.ships[0], r = this.ring(), q = r.faces[face].squads.filter((s) => s.kind === 'plaza')[k]; const x1 = P.toWorldX(sh, sh.layout.refPoint.x), y1 = P.toWorldY(sh, sh.layout.bounds.y1 - 30), s = 0.55; r.zips.push({ face, x0: q.x, y0: q.y - 80, ex: 0, t: 1.2, dur: 2.2, grapple: true, men: 1, x1, y1, x: q.x + (x1 - q.x) * s, y: q.y - 80 + (y1 - q.y + 80) * s + Math.sin(s * Math.PI) * 60 }); q.swing = false; return q.x; },
  squads(face) { return this.ring().faces[face].squads.map((q) => ({ kind: q.kind, x: q.x, n: q.n, state: q.state })); },
};`;
const GBUDGET = `(async()=>{ const V=window.view3dDebug().view, G=V.garrison; const read=async()=>{ await window.__c.frame(); await window.__c.frame(); const s=V.stats(); return [s.calls, s.tris]; };
  const a=await read(); const prev=G.update; G.update=()=>{ G.root.visible=false; }; const b=await read(); G.update=prev; await window.__c.frame();
  const parts=[]; G.root.traverse((o)=>{ if(!o.isMesh||!o.visible||!G.root.visible) return; const g=o.geometry, n=g.index?g.index.count:g.attributes.position.count; const dr=g.drawRange; const cnt=Math.min(n-dr.start, dr.count===Infinity?n:dr.count); parts.push((o.name||o.parent.name||'?')+':'+(o.isInstancedMesh?o.count+'x':'')+Math.round(cnt/3)); });
  return JSON.stringify({ calls:a[0]-b[0], tris:a[1]-b[1], allCalls:a[0], allTris:a[1], stats:G.stats, parts }) })()`;
async function garrisonShots(P, v) {
  const pre = has('prefix') ? prefix : 'garrison3d_';
  const shot = async (name, wait = 40) => { await P.ev(`window.__c.settle(${wait})`); await shotTo(P, `${pre}${v}_${name}.png`); };
  await P.ev(GAR_PRE);
  await P.ev(`(()=>{ window.game.state.briefing = null; const b = document.getElementById('castoff'); if (b && b.parentElement) b.parentElement.style.display = 'none'; return 1 })()`); // (no briefing card, no lobby buttons in the pictures)
  const g =(code) => P.ev(`(async()=>{ const g=window.__g; ${code} })()`);
  const gj = (code) => P.json(`(async()=>{ const g=window.__g; const r = await (async()=>{ ${code} })(); return JSON.stringify(r) })()`);
  const info = await gj('const r=g.ring(); return { variant: r.variant, faces: r.faces.length, specials: r.faces.map((f)=>f.special.kind), chains: (r.gar&&r.gar.chains||[]).map((c)=>c.x), posts: r.faces.map((f)=>f.posts.length), squads: r.faces.map((f)=>f.squads.length) }');
  console.log('    ' + JSON.stringify(info));
  check(info && info.posts && info.posts[0] > 0, `${v}: the ring has a garrison`, `${v}: no garrison in this ring`);
  const face = Math.min(1, (info && info.faces || 1) - 1);
  // 1. a volley: the telegraph, then the arrows in flight
  await g(`g.cam(1); g.at(${face}, -200, 450); await window.__c.settle(20); return 1`);
  const t1 = await g(`return await g.volley(${face}, -200, 'tell')`);
  await P.ev('window.__c.frame()'); await shot('telegraph', 30);
  const t2 = await g(`return await g.volley(${face}, -200, 'arrows')`);
  await shot('arrows', 4);
  check(t1 === 'tell' && t2 === 'arrows', `${v}: a volley reached its telegraph and its arrows`, `${v}: the volley did not start (${t1} / ${t2})`);
  const gs0 = await gj('const G=g.V().garrison; return G.stats');
  check(gs0 && gs0.arrows >= 8, `${v}: ${gs0 && gs0.arrows} arrows drawn in flight (fire ${gs0 && gs0.fire})`, `${v}: arrows not drawn ${JSON.stringify(gs0)}`);
  // measure the garrison's cost with the arrows in the air
  const gb = await P.json(GBUDGET);
  if (gb) {
    console.log(`    the garrison adds ${gb.calls} draw calls and ${Math.round(gb.tris / 100) / 10}k triangles (the whole scene ${gb.allCalls} calls, ${Math.round(gb.allTris / 1000)}k) | men ${gb.stats.men}/${gb.stats.menCap} banners ${gb.stats.banners} arrows ${gb.stats.arrows} | update ${gb.stats.ms.toFixed(2)} ms`);
    if (verbose || has('parts')) console.log('    parts: ' + gb.parts.join(' '));
    check(gb.calls <= 15, `${v}: garrison draw calls ${gb.calls} <= 15`, `${v}: garrison draw calls ${gb.calls} > 15`);
  } else fail(v + ': no garrison budget numbers');
  if (has('close')) { // close-ups (for the eyes while building): the archers' post, a squad in each pose, the ballista
    const post = await gj(`const f=g.ring().faces[${face}]; return { x: f.posts[0].x, y: f.posts[0].y, base: f.y }`);
    await g(`g.look(${post.x}, ${post.base - 560}, 2.2); return 1`);
    await shot('close_post', 30);
    const poses = [['stand', 'muster'], ['cheer', 'cheer'], ['flee', 'flee'], ['surrender', 'surrender']];
    for (const [name, st] of poses) {
      await g(`const r=g.ring(), f=r.faces[${face}], q=f.squads.filter((q)=>q.kind==='plaza')[0]; q.state='${st}'; q.cheer=60; q.fleeTo=q.x+900; g.look(q.x, q.y - 100, 2.6); return 1`);
      await shot('close_squad_' + name, 30);
    }
    await g(`const r=g.ring(), f=r.faces[${face}], q=f.squads.filter((q)=>q.kind==='plaza')[0]; q.state='muster'; return 1`);
    const gun = await gj(`const f=g.ring().faces[${face}], q=f.squads.find((q)=>q.kind==='gun'); return q ? q.x : null`);
    if (gun != null) { await g(`g.look(${gun}, ${post.base - 100}, 2.4); return 1`); await shot('close_gun', 30); }
    await g('g.unlook(); return 1');
  }
  // 2. squads: cheering and fleeing, with their banners (the sim is held; the states are set by hand)
  await g(`const r=g.ring(); g.cam(0.9); g.at(${face}, 0, 200); const qs=r.faces[${face}].squads.filter((q)=>q.kind==='plaza'); if (qs[0]) { qs[0].state='cheer'; qs[0].cheer=60; } if (qs[1]) { qs[1].state='flee'; qs[1].fleeTo=qs[1].x+900; } return 1`);
  await shot('squads');
  // 3. the ballista's line (the fortress), tracking and then frozen, and a bolt in flight
  if (info && info.specials.includes('ballista')) {
    const bf = info.specials.indexOf('ballista');
    const L = await gj(`g.at(${bf}, -900, 0); const r = await g.lock(${bf}, 1.0); g.look((r[0] + r[2]) / 2, (r[1] - 100 + r[3]) / 2, 0.7); return r`);
    await P.ev('window.__c.settle(30)'); await shotTo(P, `${pre}${v}_ballista_aim.png`);
    await gj(`const sp=g.ring().faces[${bf}].special; sp.lock.t=0.3; return 1`);
    await P.ev('window.__c.settle(30)'); await shotTo(P, `${pre}${v}_ballista_hot.png`);
    await g(`const r=g.ring(), sp=r.faces[${bf}].special, L=sp.lock; const d=Math.hypot(L.x1-L.x0, L.y1-L.y0); sp.lock=null; r.gar.busy=null; r.gar.stats; g.st().bullets.push({ x: L.x0+(L.x1-L.x0)*0.5, y: L.y0+(L.y1-L.y0)*0.5, vx: (L.x1-L.x0)/d*1700, vy: (L.y1-L.y0)/d*1700, life: 2, bolt: true, kind: 'bolt', dmg: 0 }); return 1`);
    await P.ev('window.__c.settle(6)'); await shotTo(P, `${pre}${v}_ballista_bolt.png`);
    await g(`g.st().bullets.length=0; return 1`);
    console.log('    ballista line ' + JSON.stringify(L));
  }
  // 4. the boom chain: whole, snagged, snapped (the top half hangs, the log falls)
  if (info && info.chains && info.chains.length) {
    await g(`const c=g.ring().gar.chains[0]; g.atX(c.x - 700, 1400); g.look(c.x, c.yLow + 450, 0.62); return 1`);
    await shot('chain_whole', 40);
    await g(`g.ring().gar.chains[0].snagging = true; return 1`);
    await shot('chain_snag', 8);
    await g(`const c=g.ring().gar.chains[0]; c.snagging=false; c.broken=true; return 1`);
    await shot('chain_snapped', 75);
    console.log('    chain after the snap: ' + JSON.stringify(await gj('const G=g.V().garrison; let falls=0; G.root.traverse((o)=>{ if(o.isMesh && o.parent && o.parent.parent===G.root && o.parent.position.y<0) falls++; }); return { stats: G.stats, falling: falls, c: g.ring().gar.chains.map((c)=>c.broken) }')));
    await P.ev('window.__c.settle(180)'); await shotTo(P, `${pre}${v}_chain_snapped_late.png`);
  }
  // 5. a grapple: the hook swung, then the rope up to the keel with a man on it
  await g(`const r=g.ring(), pl=r.faces[${face}].squads.filter((q)=>q.kind==='plaza'), q=pl[pl.length-1], sh=g.st().ships[0]; g.atX(q.x + 150, 1200); sh.pose.y = q.y - 250 - sh.layout.bounds.y1; g.look(q.x + 60, q.y - 330, 1.0); await g.grapple(${face}, pl.length - 1); q.swing = false; return 1`);
  await shot('grapple');
  await g(`const r=g.ring(), pl=r.faces[${face}].squads.filter((q)=>q.kind==='plaza'), q=pl[pl.length-1]; g.look(q.x + 120, q.y - 260, 1.9); return 1`);
  await shot('grapple_close', 20);
  await g(`g.ring().zips.length=0; g.unlook(); return 1`);
  // 6. the crown falls: white flags (the sim does it by onCrown; here by hand)
  await g(`const r=g.ring(); g.cam(0.8); g.at(${face}, 0, 100); for (const f of r.faces) for (const q of f.squads) { if (q.state!=='dead') { q.state='surrender'; q.x=q.home; } } r.crown={ how:'keep', t:0, done:false }; return 1`);
  await shot('white_flags');
  await g(`g.cam(0.9); return 1`);
  await shot('white_flags_close');
  await g(`const r=g.ring(); r.crown=null; for (const f of r.faces) for (const q of f.squads) if (q.state==='surrender') q.state = q.kind==='gun' ? 'man' : 'muster'; return 1`);
  // 7. a night castle with fire arrows (any variant; the citadel's volleys carry fire by themselves)
  await P.ev(`window.view3dDebug().view.setTod('night'); 1`);
  await g(`const f=g.ring().faces[${face}]; g.look(f.x - 150, f.y - 560, 0.85); return 1`);
  await P.ev('window.__c.settle(60)');
  if (info && info.variant === 'citadel') {
    // (force a fire share high enough to see: the sim's own is 20% of 24 to 32 arrows)
    await g(`const cfg=(await import('/config.js')).config; cfg.GARRISON.ARCHER.FIRE.SHARE=0.6; return 1`);
  }
  await g(`const r=g.ring(); g.at(${face}, -200, 450); for (const p of r.faces[${face}].posts) { p.dead=false; p.t=0; } r.gar.busy=null; return 1`);
  const t3 = await g(`return await g.volley(${face}, -200, 'arrows')`);
  await shot('night_arrows', 3);
  console.log('    night volley: ' + t3 + (info && info.variant === 'citadel' ? '' : ' (plain arrows: the fire arrows are the citadel\'s)'));
  await P.ev(`window.view3dDebug().view.setTod(''); 1`); await g('g.unlook(); return 1');
}

// ---- D3: the set pieces (--setpieces [--prefix setpiece_] [--cine 1]): a gatehouse collapsing over time, the crown falling (with the cinematic camera when --cine 1), the drawbridge dropping, stones in flight and landing,
//   the boom chain snapping. The view runs on a FAKE CLOCK (window.__s: every frame advances the view's own time by a fixed step, so the 8 fps keys land where the pictures are taken) and the sim is frozen: the set
//   pieces are driven by hand the way the sim would (face.down, ring.crown.t, a stone in state.bullets, chain.broken). Prints the peak draw calls and the chunk and body counts.
const SP_PRE = `
window.__s = {
  clock: { on: false, now: 0 }, wrapped: false, bul: [], peak: 0,
  V() { return window.view3dDebug().view; },
  start() { const V = this.V(); if (!this.wrapped) { const orig = V.renderFrame; V.renderFrame = (now, view, opts = {}) => (this.clock.on ? orig(this.clock.now, view, { ...opts, t: this.clock.now / 1000 }) : orig(now, view, opts)); this.wrapped = true; } this.clock.now = performance.now(); this.clock.on = true; },
  stop() { this.clock.on = false; },
  async adv(sec, each) { const n = Math.max(1, Math.round(sec / 0.03)); for (let i = 0; i < n; i++) { this.clock.now += sec / n * 1000; this.move(sec / n); if (each) each(sec / n); await window.__c.frame(); const c = this.V().stats().calls; if (c > this.peak) this.peak = c; } },
  move(dt) { const st = window.game.state; for (let i = this.bul.length - 1; i >= 0; i--) { const b = this.bul[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.vy += b.ay * dt; b.life -= dt; if (b.life <= 0) { const k = st.bullets.indexOf(b); if (k >= 0) st.bullets.splice(k, 1); this.bul.splice(i, 1); } } },
  stone(x0, y0, x1, y1, T, burn) { const st = window.game.state, K = 520; const b = { x: x0, y: y0, vx: (x1 - x0) / T, vy: (y1 - y0) / T - 0.5 * K * T, ay: K, life: T, mortar: true, stone: true, kind: 'stone', miss: true, dmg: 0, ...(burn ? { burn: true, fire: 0.5 } : {}) }; st.bullets.push(b); this.bul.push(b); return b; },
};`;
async function setpieceShots(P, v) {
  const pre = has('prefix') ? prefix : 'setpiece_';
  const S = (code) => P.ev(`(async()=>{ const s=window.__s, g=window.__g; ${code} })()`);
  const SJ = (code) => P.json(`(async()=>{ const s=window.__s, g=window.__g; const r = await (async()=>{ ${code} })(); return JSON.stringify(r) })()`);
  const shot = async (name) => shotTo(P, `${pre}${v}_${name}.png`);
  await P.ev(GAR_PRE); await P.ev(SP_PRE);
  await P.ev(`(()=>{ window.game.state.briefing = null; const b = document.getElementById('castoff'); if (b && b.parentElement) b.parentElement.style.display = 'none'; return 1 })()`);
  const info = await SJ('const r=g.ring(); return { variant: r.variant, faces: r.faces.length, specials: r.faces.map((f)=>f.special.kind), chains: (r.gar&&r.gar.chains||[]).map((c)=>c.x), R: r.R }');
  console.log('    ' + JSON.stringify(info));
  const face = Math.min(1, (info && info.faces || 1) - 1);
  await S('s.start(); g.cam(1); await window.__c.settle(20); return 1');
  const W = (n) => !has('scenes') || (arg('scenes', '') || '').split(',').includes(n); // (--scenes bridge,collapse,stone,chain,crown picks some of them)
  // 1. the drawbridge: the shutter opens on the first window, the leaf is let go (held steps at 8 fps)
  if (W('bridge')) {
  await S(`const r=g.ring(), f=r.faces[${face}]; f.windows=0; f.open=0; g.atX(f.x - 3300, 600); g.look(f.x, f.y - 330, 1.05); await s.adv(0.4); return 1`);
  await shot('bridge_0');
  await S(`const f=g.ring().faces[${face}]; f.windows=1; f.open=6; await s.adv(0.02); return 1`);
  const steps = [1, 2, 3, 4, 5, 6, 8];
  for (const [i, k] of steps.entries()) {
    await S(`await s.adv(${i ? (k - steps[i - 1]) * 0.125 : 0.11}); return 1`); await shot('bridge_' + (i + 1));
    if (verbose) console.log('    bridge key ' + k + ': ' + JSON.stringify(await SJ('const P=s.V().vfx.P; return { pool: P.stats().pool, drawn: P.stats().drawn, spawned: P.stats().spawned, idx: s.V().castle.stats.thuds }')));
  }
  const bs = await SJ('const c=s.V().castle; return { thuds: c.stats.thuds, dyn: c.stats.dynRebuilds, spawned: s.V().vfx.P.stats().spawned }');
  check(bs && bs.thuds >= 1, `${v}: the drawbridge landed with a thud (${JSON.stringify(bs)})`, `${v}: no thud ${JSON.stringify(bs)}`);
  }
  // 2. a gatehouse collapses
  if (W('collapse')) {
  const cf = Math.min(2, (info && info.faces || 1) - 1);
  await S(`const r=g.ring(), f=r.faces[${cf}]; g.atX(f.x - 3300, 600); g.look(f.x, f.y - 700, 0.78); f.open=0; await s.adv(0.5); return 1`);
  await shot('collapse_before');
  await S(`const r=g.ring(), f=r.faces[${cf}]; f.down=true; f.special.dead=true; f.open=0; f.hp=0; await s.adv(0.02); return 1`);
  const cks = [0.0, 0.14, 0.14, 0.14, 0.2, 0.3, 0.5, 1.2];
  for (const [i, dtc] of cks.entries()) {
    await S(`await s.adv(${dtc}); return 1`);
    await shot('collapse_' + (i + 1));
    if (i === 3) console.log('    collapse chunks at 4: ' + JSON.stringify(await SJ('const sp=s.V().setpieces; return { chunks: sp.chunkCount, stats: sp.stats, collapsing: sp.collapsing, peak: s.peak }')));
  }
  const cs = await SJ('const sp=s.V().setpieces; const d=s.V().destruction; return { stats: sp.stats, bodies: d.bodies.count, physics: d.ready, peak: s.peak, calls: s.V().stats().calls }');
  console.log('    after the collapse ' + JSON.stringify(cs));
  check(cs && cs.stats.collapses === 1 && cs.stats.chunks === ({ low: 10, medium: 26, high: 44 })[arg('tier', 'medium')], `${v}: the gatehouse collapsed into ${cs && cs.stats.chunks} chunks (${cs && cs.stats.bodies} bodies, ${cs && cs.stats.fakes} by hand)`, `${v}: no collapse ${JSON.stringify(cs)}`);
  await S('await s.adv(7); return 1'); // (the chunks fade away)
  }
  // 3. flaming stones: a plain one and a burning one, in flight and landing
  if (W('stone')) {
  const sf = Math.min(1, (info && info.faces || 1) - 1);
  for (const burn of [false, true]) {
    const tag = burn ? 'fire' : 'rock';
    const trk = 'const b=s.bul[0]; if (b) { g.look(b.x + 150, b.y + 60, 1.25); } await s.adv(0.04);'; // (the camera rides with the stone: close enough to see what it is)
    await S(`const f=g.ring().faces[${sf}]; g.atX(f.x - 3600, 900); g.look(f.x - 1500, f.y - 300, 1.25); s.stone(f.x - 2300, f.y - 120, f.x - 300, f.y - 20, 2.2, ${burn}); await s.adv(0.5); ${trk} return 1`);
    await shot('stone_' + tag + '_1');
    await S(`await s.adv(0.46); ${trk} return 1`); await shot('stone_' + tag + '_2');
    await S(`await s.adv(0.46); ${trk} return 1`); await shot('stone_' + tag + '_3');
    await S(`await s.adv(0.62); const f=g.ring().faces[${sf}]; g.look(f.x - 300, f.y - 120, 1.1); await s.adv(0.1); return 1`); await shot('stone_' + tag + '_land');
    await S('await s.adv(0.3); return 1'); await shot('stone_' + tag + '_after');
    await S('await s.adv(1.2); return 1');
  }
  const ss = await SJ('return s.V().setpieces.stats');
  check(ss && ss.landed >= 2, `${v}: both stones landed with a burst (${ss && ss.landed})`, `${v}: stones did not land ${JSON.stringify(ss)}`);
  }
  // 4. the boom chain snaps
  if (W('chain') && info && info.chains && info.chains.length) {
    await S(`const c=g.ring().gar.chains[0]; g.atX(c.x - 2500, 1400); g.look(c.x, c.yLow - 1000, 0.95); await s.adv(0.5); return 1`);
    await shot('chain_0');
    await S(`const c=g.ring().gar.chains[0]; c.broken=true; await s.adv(0.02); return 1`);
    for (const [i, dtc] of [0, 0.125, 0.125, 0.125, 0.25, 0.5].entries()) { await S(`await s.adv(${dtc}); return 1`); await shot('chain_' + (i + 1)); }
    console.log('    chain: ' + JSON.stringify(await SJ('return s.V().garrison.stats')));
  }
  // 5. the crown falls (the sim's slow-motion: ring.crown.t advances 0.35 of the real time)
  if (W('crown')) {
  await S(`const r=g.ring(); g.unlook(); g.cam(1); g.at(${face}, 0, 520); await s.adv(0.6); return 1`);
  await shot('crown_0');
  await S('const r=g.ring(); r.crown = { how: "keep", t: 0, done: false }; window.game.state.slow = 0.35; return 1');
  const marks = [0.3, 0.7, 1.1, 1.5, 1.9, 2.3, 2.6, 3.4];
  let T = 0;
  for (const [i, m] of marks.entries()) {
    const real = (m - T) / 0.35;
    await S(`const r=g.ring(); await s.adv(${real}, (d) => { r.crown.t += d * 0.35; }); return 1`);
    T = m;
    await shot('crown_' + (i + 1));
    if (m >= 2.3 && m < 2.7) console.log('    crown at ' + m + ': ' + JSON.stringify(await SJ('const sp=s.V().setpieces, c=s.V().cinema; return { cue: sp.cue, stats: sp.stats, cine: c.pose.why, peak: s.peak }')));
  }
  await S('const r=g.ring(); r.crown.t = 3.3; window.game.state.slow = 1; await s.adv(3); return 1');
  await shot('crown_after');
  const cr = await SJ('return { stats: s.V().setpieces.stats, fired: s.V().cinema.stats.fired, peak: s.peak }');
  console.log('    ' + JSON.stringify(cr));
  check(cr && cr.stats.crowns === 1 && cr.stats.landed >= 1, `${v}: the crown broke off and landed`, `${v}: the crown did not fall ${JSON.stringify(cr)}`);
  console.log(`    peak draw calls during the set pieces: ${cr && cr.peak}`);
  }
  const pk = await SJ('return { peak: s.peak, d: s.V().destruction.stats }');
  check(pk && pk.peak <= 150, `${v}: the whole scene peaked at ${pk && pk.peak} draw calls through the set pieces (<= 150)`, `${v}: the scene peaked at ${pk && pk.peak} draw calls (> 150)`);
  console.log(`    wreckage world: step ${pk && pk.d.stepMs.toFixed(2)} ms (worst ${pk && pk.d.maxStepMs.toFixed(2)} ms), ${pk && pk.d.bodies} bodies left`);
  await S('s.stop(); return 1');
}

const shotTo = async (P, file) => { if (!shotDir) return; fs.mkdirSync(shotDir, { recursive: true }); fs.writeFileSync(path.join(shotDir, file), await P.png()); };

try {
  for (const v of VARIANTS) {
    console.log(`${v}:`);
    const P = await openPage(`${BASE}/host.html?view=3d&kind=ring&variant=${v}&tier=${arg("tier", "medium")}&cine=${arg("cine", "0")}`);
    await P.ev(PRE);
    await P.ev(BOTS8);
    if (has('setpieces')) { await setpieceShots(P, v); for (const e of P.errors.slice(0, 8)) console.log('    [' + v + '] ' + e); check(P.errors.length === 0, `${v}: 0 console errors`, `${v}: ${P.errors.length} console error(s)`); await P.close(); continue; }
    if (garrisonMode) { await garrisonShots(P, v); for (const e of P.errors.slice(0, 8)) console.log('    [' + v + '] ' + e); check(P.errors.length === 0, `${v}: 0 console errors`, `${v}: ${P.errors.length} console error(s)`); await P.close(); continue; }
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
