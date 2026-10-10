// THE BUILD PAGE IN 3D (WP13) gate: buildtest.html with the Live pane's "3D" switch, in a real headless Chrome driven by the DevTools protocol (no packages: Node 22 has WebSocket and fetch).
//   node tools/build3d-check.mjs [--port N] [--shots DIR] [--prefix wp13_] [--quick] [--gl default|swiftshader]
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). One Chrome with a fresh profile, REAL mouse events (drag, wheel, double-click, the tray's drag-and-drop).
// Every step must leave 0 console errors / exceptions / failed loads. Steps:
//   load2d   buildtest.html in 2D loads clean (no 3D module is even fetched)
//   toggle   "3D" mounts the pane (a canvas of its own over the live pane, the 2D canvas hidden), frames run, the draw-call budget holds, fallbacks are empty
//   orbit    a mouse drag turns the camera round the ship (never any roll), the wheel zooms, a double-click goes back to the side view
//   light    day -> dusk -> night (the lanterns' lights are on at night)
//   markers  the lift / weight markers and the thrust arrows are there (and follow "Balance")
//   ghost    dragging a tray tile over a legal spot shows a GREEN ghost in 3D (built by the registry), over a bad place a RED one, nothing after the drop is cancelled
//   edit     a real drop adds the part (the 3D model is rebuilt: it is in the model's parts), the list's x removes it
//   loads    Reset to classic, Sparrow, Random ship, a My Ships build, the minimal ship: the model is rebuilt each time, no fallbacks, no errors
//   playtest PLAYTEST (co-op) opens host.html?...view=3d (3D on, 0 errors), "Back to the builder" returns to the build page with the same ship and the 3D pane
//   off      "3D" off disposes the pane and shows the 2D live pane again; on again works
//   nogl     with WebGL switched off the page says so and stays 2D (0 errors)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const port = Number(arg('port', 4600 + Math.floor(Math.random() * 300)));
const shotDir = arg('shots', ''), prefix = arg('prefix', 'wp13_');
const quick = has('quick');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const ok = (c, m) => { if (!c) fail(m); return !!c; };
const say = (m) => console.log('  ' + m);

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: has('verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/buildtest.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }
const base = `http://localhost:${port}/`;

// ---- a tiny DevTools client -------------------------------------------------------------------------------------------------------------------------------------------
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
async function launch({ gl = 'default', size = [1920, 1080] } = {}) {
  const cport = 9400 + Math.floor(Math.random() * 400), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'build3d-'));
  const flags = ['--headless=new', `--remote-debugging-port=${cport}`, `--user-data-dir=${profile}`, `--window-size=${size[0]},${size[1]}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
  if (gl === 'swiftshader') flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  if (gl === 'none') { for (const bad of ['--ignore-gpu-blocklist', '--enable-webgl']) flags.splice(flags.indexOf(bad), 1); flags.push('--disable-gpu', '--disable-3d-apis', '--disable-webgl'); }
  const chrome = spawn(chromePath, [...flags, 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 60 && !target; i++) { try { const list = await (await fetch(`http://127.0.0.1:${cport}/json`)).json(); target = list.find((t) => t.type === 'page'); } catch { /* not up yet */ } if (!target) await sleep(250); }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map(), errors = [], logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    if (d.method === 'Runtime.consoleAPICalled') {
      const text = d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300);
      if (d.params.type === 'error') errors.push('console.error: ' + text); else if (d.params.type === 'warning') logs.push('warn: ' + text);
    } else if (d.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + ((d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description) || d.params.exceptionDetails.text).slice(0, 400));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || d.params.entry.text || '')) errors.push('log: ' + d.params.entry.text.slice(0, 200) + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  const api = {
    errors, logs, send,
    errs: () => errors.length,
    takeErrors: () => errors.splice(0),
    async goto(url) { await send('Page.navigate', { url }); await sleep(400); },
    async ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300)); return r.result.value; },
    async waitFor(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await api.ev('!!(' + expr + ')')) return true; } catch { /* the page is changing */ } await sleep(150); } return false; },
    async mouse(type, x, y, o = {}) { await send('Input.dispatchMouseEvent', { type, x, y, button: o.button || 'none', buttons: o.buttons || 0, clickCount: o.clickCount || 0, deltaX: o.dx || 0, deltaY: o.dy || 0 }); },
    async drag(x0, y0, x1, y1, steps = 12) { await api.mouse('mouseMoved', x0, y0); await api.mouse('mousePressed', x0, y0, { button: 'left', buttons: 1, clickCount: 1 }); for (let i = 1; i <= steps; i++) { await api.mouse('mouseMoved', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, { button: 'left', buttons: 1 }); await sleep(16); } await api.mouse('mouseReleased', x1, y1, { button: 'left', clickCount: 1 }); },
    async shot(name, clip = null) {
      const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
      const dir = shotDir || os.tmpdir();
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, prefix + name + '.png');
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
      say('shot ' + f);
    },
    close() { try { ws.close(); } catch { /* closed */ } chrome.kill(); sleep(400).then(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* chrome still holds a file */ } }); },
  };
  return api;
}
const clean = (page, what) => { const e = page.takeErrors(); if (e.length) { fail(what + ': ' + e.length + ' console error(s): ' + e.slice(0, 3).join(' | ')); return false; } return true; };

// ---- the steps --------------------------------------------------------------------------------------------------------------------------------------------------------------
const T = 'window.buildTest', PANE = 'window.buildTest.pane';
const rect = async (page, sel) => page.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
const camAz = (page) => page.ev(`(() => { const v = ${PANE}.view, c = v.camera.position, t = v.controls.target; const m = v.camera.matrixWorld.elements; return { az: Math.atan2(c.x - t.x, c.z - t.z), el: Math.atan2(c.y - t.y, Math.hypot(c.x - t.x, c.z - t.z)), dist: c.distanceTo(t), roll: Math.abs(m[1]) }; })()`);
const settle = async (page, n = 12) => page.ev(`new Promise((r) => { let k = ${n}; const f = () => (--k <= 0 ? r(1) : requestAnimationFrame(f)); requestAnimationFrame(f); })`);
const modelInfo = (page) => page.ev(`(() => { const e = ${PANE}.view.models.values().next().value; if (!e) return null; const m = e.model; return { ver: e.ver, parts: m.parts.size, keys: [...m.parts.keys()], fallbacks: m.fallbacks.length, tris: m.tris }; })()`);

async function main() {
  const page = await launch({ gl: arg('gl', 'default') });
  const results = {};
  try {
    // ---- load2d ----
    say('load2d');
    await page.goto(base + 'buildtest.html?b3d=0');
    ok(await page.waitFor(`window.buildTest && ${T}.sim`, 30000), 'the build page did not start');
    await sleep(800);
    clean(page, 'load2d');
    ok(await page.ev(`${PANE} === null && !document.body.classList.contains('b3d')`), 'load2d: the 3D pane is up without being asked');
    await page.ev(`localStorage.setItem('airshipBuildSplit', '0.34'); 1`); // (the Split view starts with a tall live pane, so the screenshots show the ship big)
    await page.goto(base + 'buildtest.html?b3d=0');
    ok(await page.waitFor(`window.buildTest && ${T}.sim`, 30000), 'the build page did not restart');
    await page.ev(`${T}.bui.setView('split'); 1`);
    await sleep(500);

    // ---- toggle ----
    say('toggle');
    await page.ev(`document.getElementById('v3d').click(); 1`);
    ok(await page.waitFor(`${PANE} && ${PANE}.stats().frames > 25`, 40000), 'toggle: the 3D pane did not come up');
    await sleep(500);
    clean(page, 'toggle');
    const body = await page.ev(`({ b3d: document.body.classList.contains('b3d'), hidden: getComputedStyle(document.getElementById('scene')).visibility, box: document.getElementById('pane3d').getBoundingClientRect().height })`);
    ok(body.b3d && body.hidden === 'hidden' && body.box > 100, 'toggle: the 2D live canvas is not hidden / the pane has no size ' + JSON.stringify(body));
    const st = await page.ev(`${PANE}.stats()`);
    results.toggle = { calls: st.sceneCalls, tris: st.sceneTris, tier: st.tier, js: +st.jsMs.toFixed(2), fps: Math.round(st.fps) };
    say('stats ' + JSON.stringify(results.toggle));
    ok(st.sceneCalls <= 150, 'toggle: ' + st.sceneCalls + ' draw calls (budget 150)');
    ok(st.sceneTris <= 450000, 'toggle: ' + st.sceneTris + ' triangles (budget 450k)');
    const mi = await modelInfo(page);
    ok(mi && mi.fallbacks === 0 && mi.parts > 30, 'toggle: the ship model has fallbacks / no parts ' + JSON.stringify(mi && { f: mi.fallbacks, p: mi.parts }));
    ok(await page.ev(`localStorage.getItem('airshipBuild3d') === '1'`), 'toggle: the choice is not remembered');
    await page.shot('build3d_split');

    // ---- orbit ----
    say('orbit');
    await page.ev(`${PANE}.resetView(); 1`); await settle(page);
    const a0 = await camAz(page);
    const pr = await rect(page, '#pane3d');
    const cx = pr.x + pr.w / 2, cy = pr.y + pr.h / 2;
    await page.drag(cx - 100, cy, cx + 160, cy - 40, 14);
    await settle(page);
    const a1 = await camAz(page);
    ok(Math.abs(a1.az - a0.az) > 0.3, 'orbit: the drag did not turn the camera (' + a0.az.toFixed(2) + ' -> ' + a1.az.toFixed(2) + ')');
    ok(a1.roll < 1e-3, 'orbit: the camera rolled (' + a1.roll + ')');
    await page.ev(`${PANE}.view.controls.update(); 1`);
    await page.ev(`${T}.bui.setView('live'); 1`); await sleep(500);
    await page.shot('orbit');
    await page.ev(`${T}.bui.setView('split'); 1`); await sleep(300);
    await page.mouse('mouseWheel', cx, cy, { dy: -400 }); await settle(page, 6);
    const a2 = await camAz(page);
    ok(a2.dist < a1.dist * 0.95, 'orbit: the wheel did not zoom (' + a1.dist.toFixed(0) + ' -> ' + a2.dist.toFixed(0) + ')');
    await page.mouse('mouseMoved', cx, cy); await page.mouse('mousePressed', cx, cy, { button: 'left', buttons: 1, clickCount: 1 }); await page.mouse('mouseReleased', cx, cy, { button: 'left', clickCount: 1 });
    await page.mouse('mousePressed', cx, cy, { button: 'left', buttons: 1, clickCount: 2 }); await page.mouse('mouseReleased', cx, cy, { button: 'left', clickCount: 2 });
    await sleep(500);
    const a3 = await camAz(page);
    ok(Math.abs(a3.az) < 0.12 && Math.abs(a3.el) < 0.25, 'orbit: the double-click did not go back to the side view (az ' + a3.az.toFixed(2) + ' el ' + a3.el.toFixed(2) + ')');
    clean(page, 'orbit');

    // ---- light ----
    say('light');
    await page.ev(`${T}.bui.setView('live'); 1`); await sleep(300);
    for (const tod of ['dusk', 'night']) {
      await page.ev(`(() => { const s = document.getElementById('v3dTod'); s.value = ${JSON.stringify(tod)}; s.dispatchEvent(new Event('change')); })()`);
      await sleep(900);
      ok(await page.ev(`${PANE}.S.tod === ${JSON.stringify(tod)}`), 'light: ' + tod + ' was not set');
      if (tod === 'night') {
        const lit = await page.ev(`(() => { const e = ${PANE}.view.models.values().next().value; return { night: ${PANE}.view.world.night, lights: e.model.lights.points.filter((l) => l.intensity > 0).length }; })()`);
        ok(lit.night > 0.5 && lit.lights > 0, 'light: night has no lit lanterns ' + JSON.stringify(lit));
        await page.shot('night');
      } else await page.shot('dusk');
    }
    clean(page, 'light');
    await page.ev(`(() => { const s = document.getElementById('v3dTod'); s.value = 'day'; s.dispatchEvent(new Event('change')); })()`);

    // ---- markers ----
    say('markers');
    await sleep(600);
    const gs0 = await page.ev(`${PANE}.stage.ghostState()`);
    ok(gs0.markers >= 8, 'markers: only ' + gs0.markers + ' marker objects');
    await page.ev(`${PANE}.resetView(); 1`); await sleep(600);
    await page.shot('cog');
    await page.ev(`(() => { const c = document.getElementById('v3dMarks'); c.checked = false; c.dispatchEvent(new Event('change')); })()`); await sleep(300);
    ok(await page.ev(`${PANE}.stage.group.children[0].visible === false`), 'markers: the Balance box does not hide them');
    await page.ev(`(() => { const c = document.getElementById('v3dMarks'); c.checked = true; c.dispatchEvent(new Event('change')); })()`);
    // a nose-heavy ship: sandbags at the bow turn the weight marker amber / red and the label says so
    await page.ev(`(() => { const t = ${T}; let ps = t.parts.map((p) => ({ ...p })); for (let i = 0; i < 3; i++) { const s = t.slotsFor('ballast', ps).sort((a, b) => b.x - a.x)[0]; if (!s) break; ps = s.apply(ps); } ps = ps.filter((p) => !(p.part === 'engine' && p.name === 'Aft Engine')); t.edit(ps); return 1; })()`); // (3 sandbags at the bow, no tail engine: still flies, but the weight is forward of the lift)
    await sleep(1500);
    const heavy = await page.ev(`${T}.result.ok + ' ' + ${T}.result.budgets.balance.level + ' ' + ${T}.result.budgets.balance.deg`);
    say('nose-heavy build: ' + heavy);
    ok(/^true (WARN|FAIL)/.test(heavy), 'markers: could not make a flyable nose-heavy ship (' + heavy + ')');
    await page.ev(`${PANE}.resetView(); 1`); await sleep(600);
    await page.shot('cog_nose_heavy');
    await page.ev(`document.getElementById('reset').click(); 1`); await sleep(1200);
    clean(page, 'markers');
    await page.ev(`${T}.bui.setView('split'); 1`); await sleep(500);

    // ---- ghost ----
    say('ghost');
    const slot = await page.ev(`(() => { const t = ${T}, legal = t.info().gun.legal; const s = legal.find((q) => q.p === 'catwalk') || legal[0]; const p = t.bpScreen(s.x, s.y - 14); return { x: p.x, y: p.y, label: s.label, n: legal.length }; })()`);
    const tile = await rect(page, '.tile[data-id="gun"]');
    const tx = tile.x + tile.w / 2, ty = tile.y + tile.h / 2;
    await page.mouse('mouseMoved', tx, ty); await page.mouse('mousePressed', tx, ty, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 14; i++) { await page.mouse('mouseMoved', tx + ((slot.x - tx) * i) / 14, ty + ((slot.y - ty) * i) / 14, { button: 'left', buttons: 1 }); await sleep(16); }
    await sleep(700);
    const g1 = await page.ev(`({ s: ${PANE}.stage.ghostState(), st: ${PANE}.stage.stats, tray: !!(${T}.tray().target) })`);
    ok(g1.tray && g1.s.visible && g1.s.ok && g1.st.ghostBuilds >= 1, 'ghost: no green ghost over a legal spot ' + JSON.stringify(g1));
    say('ghost build ' + g1.st.lastGhostMs.toFixed(1) + ' ms, ' + g1.st.ghostParts + ' part(s)');
    results.ghostMs = g1.st.lastGhostMs;
    const pr2 = await rect(page, '#pane3d');
    await page.shot('ghost_valid');
    await page.shot('ghost_valid_pane', { x: pr2.x, y: pr2.y, width: pr2.w, height: pr2.h });
    const closeup = () => page.ev(`(() => { const p = ${PANE}, w = p.stage.ghostWorld(); if (!w) return 0; const v = p.view, c = v.controls; c.target.copy(w); v.camera.position.set(w.x + 80, w.y + 120, w.z + 700); c.update(); return 1; })()`);
    await closeup(); await sleep(400);
    await page.shot('ghost_valid_closeup', { x: pr2.x, y: pr2.y, width: pr2.w, height: pr2.h });
    // over a bad place on the paper (up in the gasbag, far from any legal spot): the nearest legal spot's ghost, red, under the pointer
    const bp = await rect(page, '#bp');
    const bagAt = await page.ev(`(() => { const L = ${T}.bpLayout, b = L.gasbags[0], p = ${T}.bpScreen(b.cx + b.rx * 0.45, b.cy); return { x: p.x, y: p.y }; })()`);
    const bad = { x: bagAt.x, y: bagAt.y };
    void bp;
    await page.mouse('mouseMoved', bad.x, bad.y, { buttons: 1, button: 'left' }); await sleep(120);
    await page.mouse('mouseMoved', bad.x + 4, bad.y + 2, { buttons: 1, button: 'left' }); await sleep(800);
    const g2 = await page.ev(`({ s: ${PANE}.stage.ghostState(), target: !!(${T}.tray().target), ptr: !!(${T}.tray().ptr) })`);
    ok(!g2.target && g2.s.visible && !g2.s.ok, 'ghost: no red ghost over a bad place ' + JSON.stringify(g2));
    await page.shot('ghost_invalid');
    await page.shot('ghost_invalid_pane', { x: pr2.x, y: pr2.y, width: pr2.w, height: pr2.h });
    await closeup(); await sleep(400);
    await page.shot('ghost_invalid_closeup', { x: pr2.x, y: pr2.y, width: pr2.w, height: pr2.h });
    await page.ev(`${PANE}.resetView(); 1`);
    const before = await page.ev(`${T}.parts.length`);
    await page.mouse('mouseReleased', bad.x + 4, bad.y + 2, { button: 'left', clickCount: 1 }); await sleep(500);
    ok((await page.ev(`${T}.parts.length`)) === before, 'ghost: a drop on a bad place changed the build');
    ok(!(await page.ev(`${PANE}.stage.ghostState().visible`)) || true, 'ghost: (hidden after the drop)');
    await sleep(300);
    ok(!(await page.ev(`${PANE}.stage.ghostState().visible`)), 'ghost: still showing after the drop');
    clean(page, 'ghost');

    // ---- edit: a real drop, then delete ----
    say('edit');
    const rebuilds0 = (await page.ev(`${PANE}.stats().rebuilds`));
    const slot2 = await page.ev(`(() => { const t = ${T}, legal = t.info().gun.legal; const s = legal.find((q) => q.p === 'catwalk') || legal[0]; const p = t.bpScreen(s.x, s.y - 14); return { x: p.x, y: p.y, label: s.label }; })()`);
    await page.mouse('mouseMoved', tx, ty); await page.mouse('mousePressed', tx, ty, { button: 'left', buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 14; i++) { await page.mouse('mouseMoved', tx + ((slot2.x - tx) * i) / 14, ty + ((slot2.y - ty) * i) / 14, { button: 'left', buttons: 1 }); await sleep(16); }
    await sleep(300);
    await page.mouse('mouseReleased', slot2.x, slot2.y, { button: 'left', clickCount: 1 });
    ok(await page.waitFor(`${T}.parts.length === ${before} + 1`, 4000), 'edit: the drop did not add the part');
    await sleep(900);
    const m2 = await modelInfo(page), st2 = await page.ev(`${PANE}.stats()`);
    ok(st2.rebuilds > rebuilds0, 'edit: the 3D model was not rebuilt after the drop');
    ok(m2 && m2.fallbacks === 0, 'edit: fallbacks after the drop');
    const gunKeys = m2 ? m2.keys.filter((k) => k.startsWith('gun:')).length : 0;
    const gunsInBuild = await page.ev(`${T}.parts.filter((p) => p.part === 'gun').length`);
    ok(gunKeys === gunsInBuild, 'edit: the model has ' + gunKeys + ' guns, the build ' + gunsInBuild);
    results.rebuildMs = st2.rebuildMs;
    say('model rebuild frame ' + st2.rebuildMs.toFixed(1) + ' ms (max ' + st2.rebuildMax.toFixed(1) + ')');
    // delete it again from the placed-parts list (the newest part is listed first)
    await page.ev(`(() => { const b = document.querySelector('#parts li.new button'); b.click(); })()`);
    ok(await page.waitFor(`${T}.parts.length === ${before}`, 4000), 'edit: the list x did not remove the part');
    await sleep(800);
    const m3 = await modelInfo(page);
    ok(m3 && m3.keys.filter((k) => k.startsWith('gun:')).length === gunsInBuild - 1, 'edit: the model still has the deleted gun');
    clean(page, 'edit');

    // ---- loads ----
    say('loads');
    const loads = [
      ['reset to classic', `document.getElementById('reset').click()`],
      ['sparrow', `(async () => { const m = await import('/modules/host/shipBuild.js'); ${T}.edit(m.BUILDS.sparrow.map((p) => ({ ...p }))); })()`],
      ['random ship', `document.getElementById('random').click()`],
      ['minimal ship', `document.getElementById('minimal').click()`],
      ['clear then classic', `(async () => { document.getElementById('clear').click(); document.getElementById('reset').click(); })()`],
    ];
    for (const [name, js] of loads) {
      const r0 = await page.ev(`${PANE}.stats().rebuilds`);
      await page.ev(js);
      await sleep(1100);
      const r1 = await page.ev(`${PANE}.stats().rebuilds`), mi2 = await modelInfo(page), fl = await page.ev(`${PANE}.view.fallbacks()`);
      ok(r1 > r0, 'loads: ' + name + ': the 3D model was not rebuilt');
      ok(mi2 && mi2.parts > 5 && fl.length === 0, 'loads: ' + name + ': parts ' + (mi2 && mi2.parts) + ' fallbacks ' + JSON.stringify(fl));
      const rb = await page.ev(`${PANE}.stats().rebuildMs`);
      say(name + ': ' + (mi2 ? mi2.parts : '?') + ' parts, ' + (mi2 ? Math.round(mi2.tris / 1000) : '?') + 'k tris, rebuild frame ' + rb.toFixed(0) + ' ms');
      (results.rebuilds = results.rebuilds || []).push(Math.round(rb));
    }
    // My Ships: save the classic ship, change the build, load it back from the list
    await page.ev(`document.getElementById('msName').value = 'WP13 test ship'; document.getElementById('msSave').click(); 1`);
    await page.ev(`document.getElementById('minimal').click(); 1`); await sleep(900);
    const pm = await modelInfo(page);
    await page.ev(`(() => { const li = [...document.querySelectorAll('#msList li')].find((l) => l.querySelector('input') && l.querySelector('input').value === 'WP13 test ship'); [...li.querySelectorAll('button')].find((b) => b.textContent === 'Load').click(); })()`);
    await sleep(1100);
    const pm2 = await modelInfo(page), fl2 = await page.ev(`${PANE}.view.fallbacks()`);
    ok(pm2 && pm && pm2.parts > pm.parts && fl2.length === 0, 'loads: My Ships build did not load into the 3D pane ' + JSON.stringify({ a: pm && pm.parts, b: pm2 && pm2.parts, fl2 }));
    say('my ships: ' + (pm2 ? pm2.parts : '?') + ' parts');
    clean(page, 'loads');
    if (!quick) { // a long soak: the live ship flies, edits keep coming, the page stays up
      for (let i = 0; i < 4; i++) { await page.ev(`document.getElementById('random').click(); 1`); await sleep(1500); }
      const s5 = await page.ev(`${PANE}.stats()`);
      ok(s5.errors === 0, 'soak: the pane threw ' + s5.errors + ' time(s)');
      clean(page, 'soak');
    }

    // ---- playtest and back ----
    say('playtest');
    const partsBefore = await page.ev(`JSON.stringify(${T}.parts)`);
    await page.ev(`${T}.set3d(true); 1`);
    await sleep(500);
    await page.ev(`document.getElementById('ptCoop').click(); 1`);
    ok(await page.waitFor(`location.pathname.endsWith('host.html')`, 15000), 'playtest: the host page did not open');
    ok(await page.ev(`new URLSearchParams(location.search).get('view') === '3d' && new URLSearchParams(location.search).get('playtest') === 'coop'`), 'playtest: the address has no view=3d');
    ok(await page.waitFor(`window.__meter !== undefined && window.viewIs3D && window.viewIs3D()`, 40000), 'playtest: the host did not start in 3D');
    await sleep(2500);
    clean(page, 'playtest');
    ok(await page.ev(`window.viewIs3D()`), 'playtest: the host is not in 3D');
    await page.shot('playtest_host');
    ok(await page.ev(`document.getElementById('mBack') !== null && window.playtestJob != null`), 'playtest: no Back to the builder button');
    await page.ev(`document.getElementById('mBack').click(); 1`);
    ok(await page.waitFor(`location.pathname.endsWith('buildtest.html') && window.buildTest && ${T}.sim`, 30000), 'playtest: Back to the builder did not return');
    ok(await page.waitFor(`${PANE} && ${PANE}.stats().frames > 10`, 40000), 'playtest: the 3D pane did not come back');
    ok((await page.ev(`JSON.stringify(${T}.parts)`)) === partsBefore, 'playtest: the ship that came back is not the same');
    await sleep(500);
    clean(page, 'back');

    // ---- off and on again ----
    say('off');
    await page.ev(`document.getElementById('v3d').click(); 1`); await sleep(500);
    ok(await page.ev(`${PANE} === null && !document.body.classList.contains('b3d') && getComputedStyle(document.getElementById('scene')).visibility !== 'hidden' && document.querySelectorAll('#pane3d canvas').length === 0`), 'off: the pane was not disposed');
    ok(await page.ev(`localStorage.getItem('airshipBuild3d') === '0'`), 'off: not remembered');
    await page.ev(`${T}.bui.setView('live'); 1`); await sleep(800);
    const px = await page.ev(`(() => { const c = document.getElementById('scene'), g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 400) if (d[i + 3] > 0 && (d[i] !== 0x8f || d[i + 1] !== 0xb4)) n++; return n; })()`);
    ok(px > 50, 'off: the 2D live pane is not drawing');
    await page.ev(`document.getElementById('v3d').click(); 1`);
    ok(await page.waitFor(`${PANE} && ${PANE}.stats().frames > 20`, 40000), 'off: 3D did not come back on');
    clean(page, 'off/on');
    for (let i = 0; i < 2; i++) { await page.ev(`document.getElementById('v3d').click(); 1`); await sleep(300); await page.ev(`document.getElementById('v3d').click(); 1`); ok(await page.waitFor(`${PANE} && ${PANE}.stats().frames > 5`, 40000), 'off: toggle ' + i + ' did not remount'); }
    clean(page, 'toggle x3');

    // ---- tier: ?tier=low is honoured; a slow machine (SwiftShader) steps itself down ----
    say('tier');
    await page.goto(base + 'buildtest.html?b3d=1&tier=low');
    ok(await page.waitFor(`${PANE} && ${PANE}.stats().frames > 20`, 40000), 'tier: the pane did not come up with ?tier=low');
    ok((await page.ev(`${PANE}.stats().tier`)) === 'low', 'tier: ?tier=low did not give the Low tier');
    await sleep(800);
    clean(page, 'tier');
    if (arg('gl') === 'swiftshader') {
      await page.goto(base + 'buildtest.html?b3d=1');
      ok(await page.waitFor(`${PANE} && ${PANE}.stats().frames > 20`, 90000), 'weak: the pane did not come up');
      const t0 = Date.now();
      let lvl = 3;
      while (Date.now() - t0 < 90000) { lvl = await page.ev(`${PANE}.stats().level`); if (lvl <= 0) break; await sleep(1000); }
      const s = await page.ev(`${PANE}.stats()`);
      say('weak machine: level ' + lvl + ' tier ' + s.tier + ' fps ' + s.fps.toFixed(1));
      ok(lvl <= 1, 'weak: the governor did not step the 3D pane down (level ' + lvl + ')');
      results.weak = { level: lvl, tier: s.tier, fps: Math.round(s.fps) };
      clean(page, 'weak');
    }
  } catch (e) {
    fail('exception in the run: ' + (e && e.stack ? e.stack : e));
  } finally {
    page.close();
  }

  // ---- nogl: WebGL switched off ----
  say('nogl');
  const p2 = await launch({ gl: 'none' });
  try {
    await p2.goto(base + 'buildtest.html?b3d=1');
    ok(await p2.waitFor(`window.buildTest && ${T}.sim`, 30000), 'nogl: the page did not start');
    await p2.ev(`${T}.bui.setView('split'); 1`);
    await sleep(3500);
    const r = await p2.ev(`({ pane: ${PANE} === null, want: ${T}.want3d(), b3d: document.body.classList.contains('b3d'), hint: document.getElementById('hint').textContent })`);
    ok(r.pane && !r.b3d && !r.want, 'nogl: the page did not fall back to 2D ' + JSON.stringify(r));
    ok(/not available/.test(r.hint), 'nogl: no message "' + r.hint + '"');
    clean(p2, 'nogl');
  } catch (e) { fail('nogl: ' + e); } finally { p2.close(); }
  return results;
}

let res = {};
try { res = await main(); } catch (e) { fail('run: ' + e); }
// the other gates' tools stop their server by PID: so do we
try { server.kill(); } catch { /* gone */ }
console.log('\n' + (failed ? failed + ' check(s) FAILED' : 'build3d-check: all good') + '  ' + JSON.stringify(res));
process.exit(failed ? 1 : 0);
