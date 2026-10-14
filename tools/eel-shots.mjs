// C.6f (BOSSES.md 2.6), THE VOID EEL in a real headless Chrome (the 2D view, or the 3D view with --view 3d): it circles the ship, the gold lure, the lookout's warning, a coil on the deck, the swallow's ring and gaping mouth, a joint cut
// off, the death, and the Flagship fleeing when the eel dies at the citadel. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). The host page is stepped faster than real time through window.game.
//   node tools/eel-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--until NAME] [--size WxH]
// Default DIR is the owner's screenshot folder next to the repo; files are named eel_*.png (2D) or eel3d_*.png (--view 3d, 3D.md section 42: the camera is aimed at each moment, the sim is held still while the picture is taken).
// --until NAME stops after the shot whose name contains NAME. Exit 1 on any console error or a failed check.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const out = path.resolve(arg('out', 'C:/Users/kenny/Downloads/AIRSHIP/airship/3d-screenshots'));
const port = Number(arg('port', 5900 + Math.floor(Math.random() * 90)));
const view = arg('view', '2d');
const is3d = view === '3d';
const pre = is3d ? 'eel3d_' : 'eel_'; // (the file names)
const until = arg('until', '');
const [SW, SH] = arg('size', is3d ? '1600x900' : '1600x900').split('x').map(Number);
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
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }

async function openPage(url, W, H) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'eel-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', ...(is3d ? ['--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])];
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
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); return; }
    const q = d.params || {};
    if (d.method === 'Runtime.consoleAPICalled' && q.type === 'error') { const t = q.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300); if (!/favicon/.test(t)) P.errors.push('console.error: ' + t); }
    else if (d.method === 'Runtime.exceptionThrown') P.errors.push('EXCEPTION: ' + ((q.exceptionDetails.exception && q.exceptionDetails.exception.description) || q.exceptionDetails.text).slice(0, 400));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); return undefined; }
    return r.result.value;
  };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.shot = async (name) => { fs.writeFileSync(path.join(out, name), await P.png()); console.log('  shot ' + name); };
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(200); } return false; };
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file */ }
  };
  await send('Page.navigate', { url });
  return P;
}

let host = null;
let earlier = []; // (the first page's errors, kept when the finale page replaces it)
class Stop extends Error {}
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&creature=eel`, SW, SH);
  check(await host.waitFor('!!window.game && !!document.getElementById("castoff")', 40000), 'the host page is up');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CREATURES.DEV_LAIR === true && __cfg.CREATURES.DEV_LAIR_AS === "eel"'), '?creature=eel makes every stop the Eel\'s lair');
  await host.ev('document.getElementById("bots").click(); document.getElementById("bots").click(); 1');
  await sleep(300);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 30000), 'cast off: flying');
  await host.waitFor('!game.state.briefing', 15000);
  // fast-forward (the page's own loop keeps running; this just adds simulated seconds)
  await host.ev('window.__upd = game.update.bind(game); 1');
  const run = (secs) => host.ev(`(()=>{ for (let i = 0; i < ${Math.round(secs * 60)}; i++) window.__upd(1/60); return 1; })()`);
  const runUntil = async (cond, secs = 120, chunk = 0.5) => { for (let t = 0; t < secs; t += chunk) { if (await host.ev(cond)) return true; await run(chunk); } return !!(await host.ev(cond)); };
  // (3D) cam = { part, dx, dy, zoom }: aim the camera at a part of the eel (game px offsets, dy DOWN) at a zoom (1 = the game's own framing is not used: the dev camera); no cam = the game's own framing
  const aim = (c) => (!c ? '(()=>{ const S = window.view3dDebug().view.S; S.focus = null; S.zoom = undefined; return 1; })()' : c.chunk ? `(()=>{ const S = window.view3dDebug().view.S, cr = game.state.creature, k = cr.chunks[0]; S.focus = k ? { dx: k.cx - cr.x + ${c.dx || 0}, dy: k.cy - cr.y + ${c.dy || 0} } : null; S.zoom = ${c.zoom || 1}; return 1; })()` : c.grip ? `(()=>{ const S = window.view3dDebug().view.S, cr = game.state.creature, g = cr.grips.find((q) => q.mode === 'hold') || cr.grips[0]; S.focus = g ? { dx: g.ex - cr.x + ${c.dx || 0}, dy: g.ey - cr.y + ${c.dy || 0} } : null; S.zoom = ${c.zoom || 1}; return 1; })()` : c.between ? `(()=>{ const S = window.view3dDebug().view.S, cr = game.state.creature, b = game.state.boss, sh = game.state.ships[0], tx = b ? b.x : sh.pose.x, ty = b ? b.y : sh.pose.y; S.focus = { dx: (tx - cr.x) / 2 + ${c.dx || 0}, dy: (ty - cr.y) / 2 + ${c.dy || 0} }; S.zoom = ${c.zoom || 0.5}; return 1; })()` : `(()=>{ const S = window.view3dDebug().view.S, cr = game.state.creature, ids = ${JSON.stringify(c.part || 'head')}, p = cr.parts.find((q) => q.id === ids), g = p ? (p.segs.length > 1 && ${c.end ? 'true' : 'false'} ? p.segs[p.segs.length - 1] : p.segs[0]) : { x: cr.x, y: cr.y }, ex = ${c.end ? 'true' : 'false'} && p && p.segs.length > 1 ? [Math.cos(g.ang) * g.len, Math.sin(g.ang) * g.len] : [0, 0]; S.focus = { dx: g.x + ex[0] - cr.x + ${c.dx || 0}, dy: g.y + ex[1] - cr.y + ${c.dy || 0} }; S.zoom = ${c.zoom || 1}; return 1; })()`);
  // a picture: the sim is held still while the camera settles on it, then it runs on (2D: state.slow; 3D: the update is switched off, so the VFX and the camera still run but the eel does not move)
  const snap = async (name, cam = null, wait = Number(arg('wait', is3d ? 2500 : 12000))) => {
    if (is3d) { await host.ev('game.update = () => {}; 1'); await host.ev(aim(cam)); } else await host.ev('game.state.slow = 0.00001; 1');
    await sleep(wait);
    await host.shot(pre + name + '.png');
    if (is3d) await host.ev('game.update = window.__upd; 1'); else await host.ev('game.state.slow = 1; 1');
    if (until && name.includes(until)) throw new Stop();
  };
  const only = (w) => host.ev(`(()=>{ const c = game.state.creature; for (const k of [1, 2, 3]) __cfg.CREATURES.EEL.ATTACK.WEIGHTS[k] = ${JSON.stringify(w)}; c.eel.act = null; c.eel.lure = null; c.eel.ring = null; c.eel.nextT = 0; c.ai.breather = 0; const s = game.state; if (s.goingDown) { s.goingDown = null; if (s.gasHoles) s.gasHoles.length = 0; } return 1; })()`); // (a patrol plane's fire can tip the ship into GOING DOWN!, and then the eel does not attack: the pictures are of the eel, so the ship is mended)
  check(await host.ev('game.state.course.map.creature === "eel"'), 'the map is the Eel\'s lair');
  check(await runUntil('!!game.state.creature', 150), 'the eel swims in');
  await host.ev('game.state.briefing = null; 1');
  await host.ev('(()=>{ for (const p of game.state.creature.parts) p.hp = p.maxHp = 1e9; game.state.creature.hp = game.state.creature.maxHp = 1e9; __cfg.CREATURES.EEL.MOUTH.FED = 1e9; const E = __cfg.CREATURES.EEL; E.BITE.HULL = 0; E.SWALLOW.HULL = 0; E.COIL.RIP.HULL = 0; return 1; })()'); // (the pictures first: the bots cannot kill it, not even by bombing the maw, and it cannot sink the ship before the picture is taken)
  check(await runUntil('game.state.creature.eel.mode === "circle"', 40, 0.5), 'it has arrived and circles the ship');
  await host.ev('(()=>{ const c = game.state.creature; c.eel.nextT = 1e9; return 1; })()');
  await run(5);
  if (is3d) await runUntil('(() => { const c = game.state.creature, sh = game.state.ships[0], sx = sh.pose.x + sh.layout.refPoint.x; return Math.abs(c.x - sx) < 500 && c.y < sh.pose.y - 700; })()', 60, 0.2); // (the head at the top of its loop, over the ship: clear of the HUD)
  await sleep(2500);
  await snap('circling', null, is3d ? 3500 : 11000);
  if (is3d) { // the hero picture: the head heading right at the top of its loop, the maw shut, every part lit, the crown and the lantern in the frame
    await host.ev('(()=>{ game.update = window.__upd; return 1; })()');
    await runUntil('game.state.creature.eel.hd.x > 0.985 && game.state.creature.y < game.state.ships[0].pose.y', 60, 0.2);
    await host.ev('(()=>{ game.update = () => {}; for (const p of game.state.creature.parts) p.lit = true; game.state.creature.eel.lampLit = 1; return 1; })()'); // (held first, or the page's own loop would put the lantern back)
    await host.ev('(()=>{ for (const e of document.body.children) if (e.tagName !== "CANVAS") { e.dataset.vis = e.style.visibility; e.style.visibility = "hidden"; } document.getElementById("c").style.visibility = "hidden"; return 1; })()'); // (a clean picture: the 3D canvas only, no HUD)
    await snap('hero', { part: 'head', dx: -120, dy: -330, zoom: 1.0 }, 2500);
    await host.ev('(()=>{ for (const e of document.body.children) if (e.tagName !== "CANVAS") e.style.visibility = e.dataset.vis || ""; document.getElementById("c").style.visibility = ""; game.state.creature.eel.lampLit = 0; return 1; })()');
  }
  // boarders on the crown (3D): three crew stand on its outline (a left side, the round top, the right side)
  if (is3d) {
    await host.ev('(async()=>{ const B = await import("/modules/host/creatureBoard.js"), s = game.state, cr = s.creature, c = cr.parts.find((p) => p.id === "crown").segs[0], ps = Object.values(s.players).filter((p) => p.bot).slice(0, 3); const at = [[c.x - 210, c.y - 300], [c.x, c.y - 640], [c.x + 210, c.y - 300]]; ps.forEach((p, i) => { p.lock = null; B.boardAt(s, s.ships[0], p, at[i][0], at[i][1]); }); window.__boarded = ps.map((p) => !!p.on); return 1; })()');
    await sleep(300);
    check(await host.ev('window.__boarded.filter(Boolean).length >= 2'), 'crew stand on the crown');
    await snap('boarders_crown', { part: 'crown', dx: 0, dy: -380, zoom: 1.9 }, 2500);
    await host.ev('(async()=>{ const B = await import("/modules/host/creatureBoard.js"), s = game.state; for (const p of Object.values(s.players)) if (p.on) B.dismount(s, p, "gone"); return 1; })()');
  }
  // the lure: a gold bulb hangs ahead of the ship, the head lying behind it in the dark
  await only({ lure: 1, swallow: 0, coil: 0 });
  check(await runUntil('game.state.creature.eel.lure && game.state.creature.eel.lure.live', 40, 0.25), 'a gold lure hangs ahead of the ship');
  await host.ev('(()=>{ const c = game.state.creature, sh = game.state.ships[0], a = c.eel.act; if (a && a.S) a.S.x = sh.pose.x + sh.layout.refPoint.x + (sh.pose.f || 1) * 3500; c.eel.lure.known = false; __cfg.CREATURES.EEL.LURE.RANGE = 0; for (const p of Object.values(game.state.players)) if (p.lock && game.state.ships[0].layout.kindOf(p.lock) === "lookout") p.lock = null; c.eel.nextT = 1e9; return 1; })()'); // (RANGE 0: no bot who wanders to the lookout seat calls it yet)
  await run(0.3);
  check(await host.ev('!game.state.creature.eel.lure.known'), 'nobody has called it: it looks like a pickup');
  await snap('lure', null, is3d ? 3500 : 11000);
  if (is3d) await snap('lure_close', { part: 'lamp', dx: 0, dy: 60, zoom: 1.5 }, 2500);
  // the lookout calls it
  await host.ev('__cfg.CREATURES.EEL.LURE.RANGE = 5600; 1');
  const lookout = await host.ev('(()=>{ const s = game.state, L = s.ships[0].layout, st = L.all("lookout")[0]; if (!st) return false; s.players.p1 = { id: "p1", bot: false, name: "Skipper", species: __cfg.CREW_SPECIES[0], color: "#e63946", x: 0, y: -60, jx: 0, jy: 0, t: 0, connected: true, lock: st.n }; return true; })()');
  check(lookout, 'a crewman takes the lookout seat');
  await run(0.6);
  check(await host.ev('game.state.creature.eel.lure && game.state.creature.eel.lure.known'), "the lookout calls it: IT'S A LURE!");
  await snap(is3d ? 'lure_called' : 'lookout_warning', null, is3d ? 3000 : 11000);
  // the lure bites a ship that flies into it (the ship is moved onto the bulb)
  await host.ev('(()=>{ const c = game.state.creature, sh = game.state.ships[0]; c.eel.lure.known = true; sh.pose.x += c.eel.lure.x - (sh.pose.x + sh.layout.refPoint.x) - 100; return 1; })()');
  await run(0.5);
  check(await host.ev('game.state.creature.stats.bites >= 1'), 'the lure bites the ship that flew into it');
  await snap('bite', null, is3d ? 2500 : 9000);
  // the coil: the loop closes round the hull and a tail section reaches in
  await host.ev('(()=>{ for (const p of Object.values(game.state.players)) if (p.bot) { p.sword = true; } return 1; })()');
  await runUntil('!game.state.creature.eel.act', 40, 0.5);
  await only({ lure: 0, swallow: 0, coil: 1 });
  check(await runUntil('game.state.creature.grips.some((g) => g.mode === "hold")', 60, 0.25), 'a tail section coils round the hull');
  await host.ev('(()=>{ for (const g of game.state.creature.grips) g.left = Math.max(g.left, 60); return 1; })()');
  await run(2);
  await snap('coil', null, is3d ? 3500 : 11000);
  if (is3d) await snap('coil_close', { grip: true, dx: 0, dy: 0, zoom: 1.1 }, 2500);
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) g.left = 0.01; return 1; })()');
  await runUntil('!game.state.creature.eel.act', 40, 0.5);
  // the swallow: the head swings ahead of the bow and gapes; the red ring follows her bow and locks
  await host.ev('(()=>{ for (const p of Object.values(game.state.players)) if (p.bot && p.lock && game.state.ships[0].layout.kindOf(p.lock) === "helm") p.lock = null; return 1; })()'); // (nobody at the helm: the picture is of a swallow nobody dodges)
  await only({ lure: 0, swallow: 1, coil: 0 });
  check(await runUntil('game.state.creature.eel.act && game.state.creature.eel.act.kind === "swallow" && game.state.creature.eel.act.sub === "wind"', 40, 0.1), 'the head gapes ahead of the bow');
  if (!(await host.ev('game.state.creature.eel.act && game.state.creature.eel.act.kind === "swallow"'))) console.log('   dbg', await host.ev('JSON.stringify({ act: game.state.creature.eel.act && [game.state.creature.eel.act.kind, game.state.creature.eel.act.sub], mode: game.state.creature.mode, em: game.state.creature.eel.mode, next: game.state.creature.eel.nextT, grips: game.state.creature.grips.length, phase: game.state.phase, down: game.state.ship.down, going: game.state.goingDown, breather: game.state.creature.ai.breather, cphase: game.state.creature.phase, last: game.state.creature.eel.lastKind })'));
  await run(0.9);
  await snap('swallow_ring', null, is3d ? 3500 : 11000);
  check(await runUntil('game.state.creature.eel.ring && game.state.creature.eel.ring.locked', 5, 0.1), 'the ring locks');
  await run(0.3);
  await snap('swallow_locked', null, is3d ? 2500 : 9000);
  check(await runUntil('game.state.creature.eel.act && game.state.creature.eel.act.sub === "recover"', 8, 0.1), 'the head lunges and the maw hangs open');
  await run(1.0);
  await snap(is3d ? 'swallow_maw_open' : 'swallow_mouth', null, is3d ? 3500 : 11000);
  if (is3d) await snap('swallow_maw_close', { part: 'head', dx: 250, dy: 0, zoom: 1.1 }, 2500);
  // a joint cut off: the tail section tumbles away and the eel is shorter (nothing else going on: no act, no coil)
  await only({ lure: 0, swallow: 0, coil: 0 });
  await host.ev('(()=>{ for (const g of game.state.creature.grips) g.left = 0.01; return 1; })()');
  await runUntil('!game.state.creature.eel.act && !game.state.creature.grips.length', 30, 0.5);
  await run(9); // (the loop opens again: nothing is round the ship when the section is cut)
  await host.ev('(()=>{ const c = game.state.creature; c.eel.nextT = 1e9; const e0 = c.parts.find((p) => p.id === "e0"); e0.hp = 1; c.hooks.hurt({ part: e0, seg: 0 }, 50, { who: "p1", src: "shell" }); return 1; })()');
  await run(is3d ? 0.45 : 0.8);
  check(await host.ev('game.state.creature.parts.find((p) => p.id === "e0").dead && game.state.creature.chunks.length > 0'), 'the joint is cut: the tail section tumbles away');
  await snap('severed_joint', is3d ? { chunk: true, dx: 600, dy: -300, zoom: 0.55 } : null, is3d ? 2500 : 11000);
  if (is3d) await snap('severed_close', { part: 'e1', end: true, dx: 0, dy: 0, zoom: 1.2 }, 2500);
  // the death (3D): it goes limp and dissolves into stardust, the tail first, the lantern last
  if (is3d) {
    await host.ev('(()=>{ const c = game.state.creature; c.hooks.hurtPool(1e9, "shell", "p1"); return 1; })()');
    check(await runUntil('game.state.creature && game.state.creature.mode === "dying"', 5, 0.1), 'the eel dies');
    await run(0.6);
    await snap('death', null, 2500);
    await run(2.6);
    await snap('death_dissolving', null, 2500);
    await run(2.4);
    await snap('death_late', { part: 'head', dx: 0, dy: -200, zoom: 0.8 }, 2500);
  }
  // the Flagship's stop: a second page with ?finale=eel (the citadel, the Flagship and the Void Eel together)
  earlier = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  await host.close();
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&finale=eel`, SW, SH);
  check(await host.waitFor('!!window.game && !!document.getElementById("castoff")', 40000), 'the finale page is up');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CREATURES.EEL.FINALE.ENABLED === true && __cfg.MAPS.FORCE_KIND === "ring"'), '?finale=eel flies the citadel with the eel along');
  await host.ev('document.getElementById("bots").click(); document.getElementById("bots").click(); 1');
  await sleep(300);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 30000), 'cast off at the citadel');
  await host.waitFor('!game.state.briefing', 15000);
  await host.ev('window.__upd = game.update.bind(game); 1');
  check(await runUntil('!!game.state.creature && !!game.state.boss', 700, 1), 'the Flagship and the Void Eel come together');
  await host.ev('game.state.briefing = null; 1');
  await host.ev('(()=>{ const s = game.state, sh = s.ships[0]; sh.pose.x = s.boss.x - 3000 - sh.layout.refPoint.x; return 1; })()'); // (the ship is brought up to the Flagship so that both are in the picture)
  await run(6);
  if (is3d) await runUntil('(() => { const c = game.state.creature, sh = game.state.ships[0], sx = sh.pose.x + sh.layout.refPoint.x; return Math.abs(c.x - sx - 900) < 500 && c.y < sh.pose.y - 700; })()', 14, 0.2); // (the head at the top of its loop on the Flagship's side of our ship; not for long: the Flagship's raiders are about)
  await host.ev('(()=>{ const s = game.state; if (s.goingDown) { s.goingDown = null; if (s.gasHoles) s.gasHoles.length = 0; } return 1; })()'); // (the picture is of the eel: a ship in GOING DOWN! would hide it behind the call-out)
  await snap('finale_flagship_and_eel', null, is3d ? 4500 : 14000);
  if (is3d) { // the dev camera: the Eel and the Flagship in one frame (the middle of the two), every part lit
    await host.ev('(()=>{ const s = game.state; for (const p of s.creature.parts) p.lit = true; return 1; })()');
    await snap('finale_wide', { between: 'boss', dx: 0, dy: -150, zoom: 0.8 }, 3500);
  }
  await host.ev('(()=>{ const c = game.state.creature; c.hooks.hurtPool(1e9, "shell", "p1"); return 1; })()');
  await run(1.0);
  check(await host.ev('!!game.state.boss && game.state.boss.fleeing === true'), 'the eel is dead: the Flagship cuts her moorings and flees');
  await snap('flagship_flees', null, is3d ? 3000 : 9000);
  check(await runUntil('!game.state.boss', 30, 0.5) && await host.ev('!!game.state.course.ring.crown && game.state.bossDownLap === game.state.course.lap'), 'the Flagship is gone and the citadel falls: the stop is won');

  const errs = [...earlier, ...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  if (!(e instanceof Stop)) { failed++; console.log('ERROR ' + (e && e.stack || e)); }
  else { const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])]; for (const x of errs.slice(0, 6)) console.log('  ' + x); check(errs.length === 0, '0 console errors, 0 game errors (stopped after ' + until + ')'); }
} finally {
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `eel-shots: ${failed} FAILED` : 'eel-shots: all ok');
process.exit(failed ? 1 : 0);
