// C.6f (BOSSES.md 2.6), THE VOID EEL in a real headless Chrome (the 2D view): it circles the ship, the gold lure, the lookout's warning, a coil on the deck, the swallow's ring and gaping mouth, a joint cut off, and the Flagship fleeing
// when the eel dies at the citadel. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). The host page is stepped faster than real time through window.game.
//   node tools/eel-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is the owner's screenshot folder next to the repo; files are named eel_*.png. Exit 1 on any console error or a failed check.
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
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
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
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&creature=eel`, 1600, 900);
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
  const run = (secs) => host.ev(`(()=>{ for (let i = 0; i < ${Math.round(secs * 60)}; i++) game.update(1/60); return 1; })()`);
  const runUntil = async (cond, secs = 120, chunk = 0.5) => { for (let t = 0; t < secs; t += chunk) { if (await host.ev(cond)) return true; await run(chunk); } return !!(await host.ev(cond)); };
  // a picture: the sim is held nearly still (state.slow) while the camera settles on it, then it runs on
  const snap = async (name, wait = Number(arg('wait', 12000))) => { await host.ev('game.state.slow = 0.00001; 1'); await sleep(wait); await host.shot(name); await host.ev('game.state.slow = 1; 1'); };
  const only = (w) => host.ev(`(()=>{ const c = game.state.creature; for (const k of [1, 2, 3]) __cfg.CREATURES.EEL.ATTACK.WEIGHTS[k] = ${JSON.stringify(w)}; c.eel.act = null; c.eel.lure = null; c.eel.ring = null; c.eel.nextT = 0; c.ai.breather = 0; return 1; })()`);
  check(await host.ev('game.state.course.map.creature === "eel"'), 'the map is the Eel\'s lair');
  check(await runUntil('!!game.state.creature', 150), 'the eel swims in');
  await host.ev('game.state.briefing = null; 1');
  await host.ev('(()=>{ for (const p of game.state.creature.parts) p.hp = p.maxHp = 1e9; game.state.creature.hp = game.state.creature.maxHp = 1e9; return 1; })()'); // (the pictures first: the bots cannot kill it)
  check(await runUntil('game.state.creature.eel.mode === "circle"', 40, 0.5), 'it has arrived and circles the ship');
  await host.ev('(()=>{ const c = game.state.creature; c.eel.nextT = 1e9; return 1; })()');
  await run(5);
  await sleep(2500);
  await snap('eel_circling.png', 11000);
  // the lure: a gold bulb hangs ahead of the ship, the head lying behind it in the dark
  await only({ lure: 1, swallow: 0, coil: 0 });
  check(await runUntil('game.state.creature.eel.lure && game.state.creature.eel.lure.live', 40, 0.25), 'a gold lure hangs ahead of the ship');
  await host.ev('(()=>{ const c = game.state.creature, sh = game.state.ships[0], a = c.eel.act; if (a && a.S) a.S.x = sh.pose.x + sh.layout.refPoint.x + (sh.pose.f || 1) * 3500; c.eel.lure.known = false; __cfg.CREATURES.EEL.LURE.RANGE = 0; for (const p of Object.values(game.state.players)) if (p.lock && game.state.ships[0].layout.kindOf(p.lock) === "lookout") p.lock = null; c.eel.nextT = 1e9; return 1; })()'); // (RANGE 0: no bot who wanders to the lookout seat calls it yet)
  await run(0.3);
  check(await host.ev('!game.state.creature.eel.lure.known'), 'nobody has called it: it looks like a pickup');
  await snap('eel_lure.png', 11000);
  // the lookout calls it
  await host.ev('__cfg.CREATURES.EEL.LURE.RANGE = 5600; 1');
  const lookout = await host.ev('(()=>{ const s = game.state, L = s.ships[0].layout, st = L.all("lookout")[0]; if (!st) return false; s.players.p1 = { id: "p1", bot: false, name: "Skipper", species: __cfg.CREW_SPECIES[0], color: "#e63946", x: 0, y: -60, jx: 0, jy: 0, t: 0, connected: true, lock: st.n }; return true; })()');
  check(lookout, 'a crewman takes the lookout seat');
  await run(0.6);
  check(await host.ev('game.state.creature.eel.lure && game.state.creature.eel.lure.known'), "the lookout calls it: IT'S A LURE!");
  await snap('eel_lookout_warning.png', 11000);
  // the lure bites a ship that flies into it (the ship is moved onto the bulb)
  await host.ev('(()=>{ const c = game.state.creature, sh = game.state.ships[0]; c.eel.lure.known = true; sh.pose.x += c.eel.lure.x - (sh.pose.x + sh.layout.refPoint.x) - 100; return 1; })()');
  await run(0.5);
  check(await host.ev('game.state.creature.stats.bites >= 1'), 'the lure bites the ship that flew into it');
  await snap('eel_bite.png', 9000);
  // the coil: the loop closes round the hull and a tail section reaches in
  await host.ev('(()=>{ for (const p of Object.values(game.state.players)) if (p.bot) { p.sword = true; } return 1; })()');
  await runUntil('!game.state.creature.eel.act', 40, 0.5);
  await only({ lure: 0, swallow: 0, coil: 1 });
  check(await runUntil('game.state.creature.grips.some((g) => g.mode === "hold")', 60, 0.25), 'a tail section coils round the hull');
  await host.ev('(()=>{ for (const g of game.state.creature.grips) g.left = Math.max(g.left, 60); return 1; })()');
  await run(2);
  await snap('eel_coil.png', 11000);
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) g.left = 0.01; return 1; })()');
  await runUntil('!game.state.creature.eel.act', 40, 0.5);
  // the swallow: the head swings ahead of the bow and gapes; the red ring follows her bow and locks
  await host.ev('(()=>{ for (const p of Object.values(game.state.players)) if (p.bot && p.lock && game.state.ships[0].layout.kindOf(p.lock) === "helm") p.lock = null; return 1; })()'); // (nobody at the helm: the picture is of a swallow nobody dodges)
  await only({ lure: 0, swallow: 1, coil: 0 });
  check(await runUntil('game.state.creature.eel.act && game.state.creature.eel.act.kind === "swallow" && game.state.creature.eel.act.sub === "wind"', 40, 0.1), 'the head gapes ahead of the bow');
  if (!(await host.ev('game.state.creature.eel.act && game.state.creature.eel.act.kind === "swallow"'))) console.log('   dbg', await host.ev('JSON.stringify({ act: game.state.creature.eel.act && [game.state.creature.eel.act.kind, game.state.creature.eel.act.sub], mode: game.state.creature.mode, em: game.state.creature.eel.mode, next: game.state.creature.eel.nextT, grips: game.state.creature.grips.length })'));
  await run(0.9);
  await snap('eel_swallow_ring.png', 11000);
  check(await runUntil('game.state.creature.eel.ring && game.state.creature.eel.ring.locked', 5, 0.1), 'the ring locks');
  await run(0.3);
  await snap('eel_swallow_locked.png', 9000);
  check(await runUntil('game.state.creature.eel.act && game.state.creature.eel.act.sub === "recover"', 8, 0.1), 'the head lunges and the maw hangs open');
  await run(1.0);
  await snap('eel_swallow_mouth.png', 11000);
  // a joint cut off: the tail section tumbles away and the eel is shorter
  await runUntil('!game.state.creature.eel.act', 20, 0.5);
  await host.ev('(()=>{ const c = game.state.creature; c.eel.nextT = 1e9; const e0 = c.parts.find((p) => p.id === "e0"); e0.hp = 1; c.hooks.hurt({ part: e0, seg: 0 }, 50, { who: "p1", src: "shell" }); return 1; })()');
  await run(0.8);
  check(await host.ev('game.state.creature.parts.find((p) => p.id === "e0").dead && game.state.creature.chunks.length > 0'), 'the joint is cut: the tail section tumbles away');
  await snap('eel_severed_joint.png', 11000);
  // the Flagship's stop: a second page with ?finale=eel (the citadel, the Flagship and the Void Eel together)
  await host.close();
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&finale=eel`, 1600, 900);
  check(await host.waitFor('!!window.game && !!document.getElementById("castoff")', 40000), 'the finale page is up');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CREATURES.EEL.FINALE.ENABLED === true && __cfg.MAPS.FORCE_KIND === "ring"'), '?finale=eel flies the citadel with the eel along');
  await host.ev('document.getElementById("bots").click(); document.getElementById("bots").click(); 1');
  await sleep(300);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 30000), 'cast off at the citadel');
  await host.waitFor('!game.state.briefing', 15000);
  check(await runUntil('!!game.state.creature && !!game.state.boss', 700, 1), 'the Flagship and the Void Eel come together');
  await host.ev('game.state.briefing = null; 1');
  await host.ev('(()=>{ const s = game.state, sh = s.ships[0]; sh.pose.x = s.boss.x - 3000 - sh.layout.refPoint.x; return 1; })()'); // (the ship is brought up to the Flagship so that both are in the picture)
  await run(6);
  await snap('eel_finale_flagship_and_eel.png', 14000);
  await host.ev('(()=>{ const c = game.state.creature; c.hooks.hurtPool(1e9, "shell", "p1"); return 1; })()');
  await run(1.0);
  check(await host.ev('!!game.state.boss && game.state.boss.fleeing === true'), 'the eel is dead: the Flagship cuts her moorings and flees');
  await snap('eel_flagship_flees.png', 9000);
  check(await runUntil('!game.state.boss', 30, 0.5) && await host.ev('!!game.state.course.ring.crown && game.state.bossDownLap === game.state.course.lap'), 'the Flagship is gone and the citadel falls: the stop is won');

  const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `eel-shots: ${failed} FAILED` : 'eel-shots: all ok');
process.exit(failed ? 1 : 0);
