// C.6e (BOSSES.md 2.5), THE MYCELIAL MOTHER in a real headless Chrome (the 2D view, or the 3D view with --view 3d): the dark cave, the nest lamp finding her, her lit eyes, a tendril grab, tendrils burning, the cap puffing up, a spore burst, the wing beat, the spore heart open, an eye put out, her death and one hero picture of her lit in full. Starts its OWN
// server on a free port and stops it by its PID at the end (never kills node globally). The host page is stepped faster than real time through window.game.
//   node tools/mother-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--until NAME] [--size WxH]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named mother_*.png (2D) or mother3d_*.png (--view 3d, 3D.md section 41: the camera is aimed at each moment). --until NAME stops after the shot whose name contains NAME. Exit 1 on any console error or a failed check.
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
const pre = is3d ? 'mother3d_' : 'mother_'; // (the file names)
const until = arg('until', '');
const [SW, SH] = arg('size', '1600x900').split('x').map(Number);
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mother-chrome-'));
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
class Stop extends Error {}
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&creature=mother`, SW, SH);
  check(await host.waitFor('!!window.game && !!document.getElementById("castoff")', 40000), 'the host page is up');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CREATURES.DEV_LAIR === true && __cfg.CREATURES.DEV_LAIR_AS === "mother"'), '?creature=mother makes every stop the Mother\'s lair');
  await host.ev('document.getElementById("bots").click(); document.getElementById("bots").click(); 1');
  await sleep(300);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 30000), 'cast off: flying');
  await host.waitFor('!game.state.briefing', 15000);
  // fast-forward (the page's own loop keeps running; this just adds simulated seconds)
  await host.ev('window.__upd = game.update.bind(game); 1');
  const run = (secs) => host.ev(`(()=>{ for (let i = 0; i < ${Math.round(secs * 60)}; i++) window.__upd(1/60); return 1; })()`);
  const runUntil = async (cond, secs = 120, chunk = 0.5) => { for (let t = 0; t < secs; t += chunk) { if (await host.ev(cond)) return true; await run(chunk); } return !!(await host.ev(cond)); };
  // a picture: the sim is held nearly still (state.slow) while the camera settles on it, then it runs on
  // (3D) c = [dx, dy, zoom]: aim the camera at a point of her frame (game px from her cap's top: dx right, dy DOWN) at a zoom (1 = the game's own framing); no c = the game's own framing
  const snap = async (name, c, wait = Number(arg('wait', is3d ? 1500 : 14000))) => {
    await host.ev('game.state.slow = 0.00001; 1');
    if (is3d) await host.ev(c ? `(()=>{ const S = window.view3dDebug().view.S; S.focus = { dx: ${c[0]}, dy: ${c[1]} }; S.zoom = ${c[2]}; return 1; })()` : '(()=>{ const S = window.view3dDebug().view.S; S.focus = null; S.zoom = undefined; return 1; })()');
    await sleep(wait);
    await host.shot(pre + name + '.png');
    await host.ev('game.state.slow = 1; 1');
    if (until && name.includes(until)) throw new Stop();
  };
  // (3D) hold the sim still (the page's own loop calls game.update, so a no-op freezes it) and make her lit in every part for a picture, then let it run again
  const lightAll = (on) => host.ev(on ? '(()=>{ game.update = () => {}; for (const p of game.state.creature.parts) p.lit = true; return 1; })()' : '(()=>{ game.update = window.__upd; return 1; })()');
  check(await host.ev('game.state.course.map.creature === "mother" && !!game.state.course.map.dome'), 'the map is the Mother\'s cavern');
  check(await runUntil('!!game.state.creature', 150), 'she clings to the roof');
  await host.ev('game.state.briefing = null; 1');
  // the dark cave: she is asleep up in the roof, nobody has a lamp on her
  await runUntil('game.state.creature.mother.mode === "asleep"', 5, 0.5);
  await run(1);
  await sleep(2500); // (the first picture of the page: let the canvas draw a few frames before the sim is held)
  await snap('dark_cave', [0, 800, 0.7], is3d ? 2500 : 9000);
  // before the lamps: the dark cave. The crew is told to keep off the lamps until the picture is taken (bots man them at once).
  check(await runUntil(`game.state.creature.mother.mode !== "asleep"`, 150, 0.25), "she wakes when the ship comes near");
  await host.ev('(()=>{ for (const p of Object.values(game.state.players)) if (p.bot && p.lock && /Searchlight/.test(p.lock)) { p.lock = null; } return 1; })()');
  // the lamp finds her
  check(await runUntil('game.state.creature.mother.lamp === true', 60, 0.25), 'a searchlight beam finds her');
  await run(1.2);
  await snap('lamp_finds_her', [0, 1500, 0.55]);
  // the lit eyes
  const eyes = await runUntil('game.state.creature.parts.some((p) => p.kind === "eye" && p.tgt && p.tgt.lit > 0)', 20, 0.25);
  check(eyes, 'her eyes are lit');
  await snap('lit_eyes', [0, 900, 1.4], is3d ? 2000 : 9000);
  if (is3d) { // the hero picture: her wings spread (the beat's own pose), lit in every part, nothing burning, nothing in the way
    await lightAll(true);
    await host.ev('(()=>{ game.state.creature.mother.beat = 2; return 1; })()');
    await snap('hero', [0, 1150, 0.62], 1500);
    await host.ev('(()=>{ game.state.creature.mother.beat = 0; return 1; })()');
    await lightAll(false);
  }
  // a tendril grabs
  await host.ev('(()=>{ const c = game.state.creature; c.mother.nextT = 0; return 1; })()');
  check(await runUntil('game.state.creature.grips.some((g) => g.mode === "hold")', 40, 0.25), 'a tendril takes hold of the ship');
  await run(1.5);
  { const g = JSON.parse(await host.ev('(()=>{ const c = game.state.creature, g = c.grips.find((q) => q.mode === "hold") || c.grips[0]; return JSON.stringify(g ? [g.ex - c.x, g.ey - c.y] : [0, 2500]); })()')); await snap('tendril_grab', [Math.round(g[0] * 0.62), Math.round(g[1] * 0.62 + 200), 0.8]); }
  // flame: tendrils burning (set alight directly: the classic ship has no burner)
  await host.ev('(async()=>{ const M = await import("/modules/host/creatureMother.js"); const c = game.state.creature; for (const g of c.grips) g.left = Math.max(g.left, 40); const ts = c.parts.filter((p) => p.kind === "tentacle"); for (const t of ts.slice(0, 3)) M.igniteTendril(game.state, c, t, 2, "p1"); return 1; })()');
  await run(1.2);
  await snap('tendrils_burning', [0, 1700, 0.7], is3d ? 1000 : 9000);
  // a spore burst: the cap puffs up, then a cloud falls on the ship
  await host.ev('(()=>{ const c = game.state.creature; __cfg.CREATURES.MOTHER.ATTACK.WEIGHTS[1] = { grab: 0, spores: 1, beat: 0 }; c.mother.act = null; c.mother.nextT = 0; c.ai.breather = 0; for (const g of c.grips) g.left = 0.01; return 1; })()');
  check(await runUntil('game.state.creature.mother.act && game.state.creature.mother.act.kind === "spores"', 20, 0.25), 'the cap puffs up');
  await runUntil('game.state.creature.mother.puff === 3', 3, 0.1);
  await snap(is3d ? 'spore_puff' : 'spore_ring', [0, 1000, 0.95], is3d ? 1000 : 9000);
  check(await runUntil('game.state.creature.mother.clouds.some((c) => c.mode === "linger")', 20, 0.25), 'the spore cloud lands on the ship');
  await run(1.0);
  await snap('spore_burst', [0, 1900, 0.5]);
  // the wing beat
  await host.ev('(()=>{ const c = game.state.creature; c.phase = 2; __cfg.CREATURES.MOTHER.ATTACK.WEIGHTS[2] = { grab: 0, spores: 0, beat: 1 }; c.mother.clouds.length = 0; c.mother.act = null; c.mother.nextT = 0; c.ai.breather = 0; return 1; })()');
  check(await runUntil('!!game.state.creature.mother.gust', 30, 0.25), 'the wings spread');
  await run(1.2);
  await snap('wing_beat_windup', [0, 1500, 0.55], is3d ? 1000 : 9000);
  check(await runUntil('game.state.creature.mother.gust && game.state.creature.mother.gust.beat', 5, 0.1), 'the wing beat');
  await run(0.5);
  await snap('wing_beat', [0, 1500, 0.55], is3d ? 1000 : 9000);
  // phase 3: the spore heart opens
  await host.ev('(()=>{ const c = game.state.creature; __cfg.CREATURES.MOTHER.ATTACK.WEIGHTS[2] = { grab: 0, spores: 0, beat: 0 }; __cfg.CREATURES.MOTHER.ATTACK.WEIGHTS[3] = { grab: 0, spores: 0, beat: 0 }; c.mother.act = null; c.mother.gust = null; c.hp = c.maxHp * 0.3; return 1; })()');
  check(await runUntil('game.state.creature.phase === 3 && !game.state.creature.parts.find((p) => p.id === "heart").hidden', 20, 0.25), 'phase 3: the spore heart opens');
  await run(1.0);
  await snap('heart_open', [0, 1000, 1.5], is3d ? 1500 : 9000);
  // an eye put out
  await host.ev('(async()=>{ const cs = await import("/modules/host/creatureSystem.js"), s = game.state, c = s.creature, e = c.parts.find((p) => p.id === "eyeN"); c.hp = c.maxHp * 0.9; cs.hurtCreature(s, { part: e, seg: 0 }, e.hp + 1, { who: null, src: "shell" }); return 1; })()');
  await run(0.8);
  await snap('eyes_out', [0, 900, 1.4], is3d ? 1200 : 9000);
  // her death
  await host.ev('(()=>{ const c = game.state.creature; c.hooks.hurtPool(1e9, "shell", "p1"); return 1; })()');
  await run(1.5);
  await snap('dying', [0, 1200, 0.6], 1000);
  if (is3d) {
    await run(3.0);
    await snap('death_fall', [0, 1700, 0.45], 1000);
  }

  const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  if (!(e instanceof Stop)) { failed++; console.log('ERROR ' + (e && e.stack || e)); }
  else { const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])]; for (const x of errs.slice(0, 6)) console.log('  ' + x); check(errs.length === 0, '0 console errors, 0 game errors (stopped after ' + until + ')'); }
} finally {
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `mother-shots: ${failed} FAILED` : 'mother-shots: all ok');
process.exit(failed ? 1 : 0);
