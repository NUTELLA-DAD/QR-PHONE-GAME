// C.6c (BOSSES.md 2.7), THE ISLAND TITAN in a real headless Chrome (the 2D view): the Titan standing on its plain, a boulder with its red ring, the hand on the gasbag, the roaring mouth with its bomb funnel, crew on its island at
// the crystal, and the Titan crumbling. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally). The host page is stepped faster than real time through window.game.
//   node tools/titan-shots.mjs [--out DIR] [--port N] [--view 2d|3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named titan_*.png (2D) or titan3d_*.png (--view 3d, on the real GPU where there is one: 3D.md section 38). Exit 1 on any console error or a failed check.
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
const pre = arg('prefix', view === '3d' ? 'titan3d_' : 'titan_'); // (the file names)
const only = arg('only', '').split(',').filter(Boolean); // (--only stands,grip: take just these pictures; the fight still runs through)
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', ...(view === '3d' ? ['--enable-webgl', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'])];
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: Number(arg('dpr', 1)), mobile: false });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); return undefined; }
    return r.result.value;
  };
  const clipArg = arg('clip', '').split(',').map(Number); // --clip x,y,w,h (css px): the picture is just that part (with --dpr 2, a close-up for the artist)
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clipArg.length === 4 ? { clip: { x: clipArg[0], y: clipArg[1], width: clipArg[2], height: clipArg[3], scale: 1 } } : {}) })).data, 'base64');
  P.shot = async (name) => { fs.writeFileSync(path.join(out, name), await P.png()); console.log('  shot ' + name); };
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(200); } return false; };
  P.dpr = (n) => send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: n, mobile: false }); // (a sharper picture for the hero shot)
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
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0&creature=titan`, 1600, 900);
  check(await host.waitFor('!!window.game && !!document.getElementById("castoff")', 40000), 'the host page is up');
  await host.ev('(async()=>{ const {config}=await import("/config.js"); window.__cfg=config; return 1; })()');
  await sleep(500);
  check(await host.ev('__cfg.CREATURES.DEV_LAIR === true && __cfg.CREATURES.DEV_LAIR_AS === "titan"'), '?creature=titan makes every stop the Titan\'s lair');
  await host.ev('document.getElementById("bots").click(); document.getElementById("bots").click(); 1');
  await sleep(300);
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying"', 30000), 'cast off: flying');
  await host.waitFor('!game.state.briefing', 15000);
  // fast-forward (the page's own loop keeps running; this just adds simulated seconds)
  const run = (secs) => host.ev(`(()=>{ for (let i = 0; i < ${Math.round(secs * 60)}; i++) game.update(1/60); return 1; })()`);
  const runUntil = async (cond, secs = 120, chunk = 0.5) => { for (let t = 0; t < secs; t += chunk) { if (await host.ev(cond)) return true; await run(chunk); } return !!(await host.ev(cond)); };
  // a picture: the sim is held nearly still (state.slow) while the camera settles on it, then it runs on
  const snap = async (name, wait = Number(arg('wait', view === '3d' ? 3000 : 16000))) => { if (only.length && !only.some((o) => name.includes(o))) return; await host.ev('game.state.slow = 0.00001; 1'); await sleep(wait); await host.shot(name); await host.ev('game.state.slow = 1; 1'); };
  check(await host.ev('game.state.course.map.creature === "titan"'), 'the map is the Titan\'s lair');
  check(await runUntil('!!game.state.creature && game.state.creature.mode === "idle"', 150), 'the Titan strides in and wakes');
  await host.ev('game.state.briefing = null; 1');
  await run(2);
  await snap(pre + 'stands.png');
  if (view === '3d') { // the whole colossus: pulled back to show the legs on the plain, the rubble heap and the island on its back (the camera goes back to the game's own framing afterwards)
    await host.ev('(()=>{ const S = window.view3dDebug().view.S; S.focus = { dx: -250, dy: -1150 }; S.zoom = 0.42; return 1; })()');
    await snap(pre + 'full.png', 2500);
    // the hero shot: the Titan full length in good light with the ship near it, at twice the pixels (the camera is nearer than the full shot)
    await host.ev('(()=>{ const S = window.view3dDebug().view.S; S.focus = { dx: -1000, dy: -1400 }; S.zoom = 0.56; return 1; })()');
    await host.dpr(2);
    await snap(pre + 'hero.png', 3500);
    await host.dpr(1);
    await host.ev('(()=>{ const S = window.view3dDebug().view.S; S.focus = null; S.zoom = undefined; return 1; })()');
    await sleep(1500);
  }
  const stopAt = (name) => { if (arg('until', '') === name) throw new Error('STOP'); }; // (--until full: end the run after that picture)
  stopAt('full');
  const focusArg = arg('focus', ''); // --focus dx,dy,zoom: one extra picture of that part (a close-up for the artist: dx, dy in world px from the Titan's origin, zoom as the camera's)
  if (view === '3d' && focusArg) {
    const [fx, fy, fz] = focusArg.split(',').map(Number);
    await host.ev(`(()=>{ const S = window.view3dDebug().view.S; S.focus = { dx: ${fx}, dy: ${fy} }; S.zoom = ${fz}; return 1; })()`);
    await snap(pre + 'focus.png', 2500);
    await host.ev('(()=>{ const S = window.view3dDebug().view.S; S.focus = null; S.zoom = undefined; return 1; })()');
    await sleep(1500);
    stopAt('focus');
  }
  const info = await host.ev('(()=>{ const c = game.state.creature, sh = game.state.ships[0]; return JSON.stringify({ kind: c.kind, phase: c.phase, hp: Math.round(c.hp), arms: c.parts.filter((p) => p.kind === "tentacle").length, f: c.f, x: Math.round(c.x), y: Math.round(c.y), shipMid: [Math.round(sh.pose.x + sh.layout.refPoint.x), Math.round(sh.pose.y + sh.layout.refPoint.y)], armHand: c.parts.filter((p) => p.kind === "tentacle").map((p) => { const s = p.segs[p.segs.length - 1]; return [Math.round(s.x), Math.round(s.y)]; }), torso: c.parts.find((p) => p.kind === "mantle").segs[0] }); })()');
  console.log('  ' + info);

  // a boulder: the ring on the TV, then the rock in the air
  await host.ev('(()=>{ const c = game.state.creature; c.titan.nextT = 0; c.ai.breather = 0; return 1; })()');
  check(await runUntil('!!game.state.creature.titan.ring && game.state.creature.titan.ring.locked', 40, 0.25), 'a boulder is aimed: the ring locks');
  console.log('  held: ' + await host.ev('JSON.stringify(game.state.creature.titan.boulders.map((b) => ({ m: b.mode, x: Math.round(b.x), y: Math.round(b.y), r: b.r })))'));
  await snap(pre + 'boulder_ring.png');
  check(await runUntil('game.state.creature.titan.boulders.some((b) => b.mode === "fly")', 20, 0.2), 'the boulder is thrown');
  await run(1.2);
  await snap(pre + 'boulder_flying.png');
  await runUntil('game.state.creature.titan.boulders.length === 0', 12, 0.5);

  // the hand on the gasbag (phase 2): force it
  await host.ev('(()=>{ const c = game.state.creature; c.hp = c.maxHp * 0.6; c.ai.breather = 0; c.titan.grabT = 0; c.titan.nextT = 99; return 1; })()');
  check(await runUntil('game.state.creature.grips.some((g) => g.mode === "hold")', 40, 0.25), 'the hand closes on the gasbag');
  await run(1.5);
  await snap(pre + 'grip.png');
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) g.left = Math.max(g.left, 60); return 1; })()');

  // the roaring mouth with its funnel
  await host.ev('(()=>{ const c = game.state.creature; for (const g of c.grips) { g.job.prog = 1; } c.ai.mouthT = 0; c.titan.nextT = 99; return 1; })()');
  check(await runUntil('!!game.state.creature.mouthWin', 40, 0.25), 'the Titan roars: the mouth is open');
  await run(1.0);
  await snap(pre + 'mouth_window.png');

  // an arm cracking: the near arm at a third of its health (two boulders cracked, the light flickering), the far arm at 60% (one)
  await host.ev(`(()=>{ const c = game.state.creature; c.mouthWin = null; c.ai.mouthT = 999; c.titan.nextT = 999; for (const g of c.grips) g.left = 0.01; const n = c.parts.find((p) => p.id === 'armN'), f = c.parts.find((p) => p.id === 'armF'); n.hp = n.maxHp * 0.3; f.hp = f.maxHp * 0.6; return 1; })()`);
  await run(2.5);
  await snap(pre + 'arm_cracking.png');

  // an arm shelled off: the stump and the slabs that fall (a Rapier body each in 3D, the sim's tumbling chunk in 2D)
  await host.ev(`(async()=>{ const cs = await import('/modules/host/creatureSystem.js'); const s = game.state, c = s.creature; c.mouthWin = null; c.ai.mouthT = 999; c.titan.nextT = 999; const a = c.parts.find((p) => p.id === 'armN'); cs.hurtCreature(s, { part: a, seg: 1 }, a.hp + 5, { who: null, src: 'shell' }); return 1; })()`);
  await run(0.25);
  check(await host.ev('game.state.creature.chunks.length > 0'), 'an arm is shelled off: a chunk falls');
  await snap(pre + 'arm_falling.png', view === '3d' ? 120 : 1500);

  // crew on the island at the crystal: a person is put on the rope's foot, walks to the crystal and hacks it
  await host.ev(`(()=>{
    const s = game.state, c = s.creature, ship = s.ships[0];
    for (const g of c.grips) g.left = 0.01;
    const id = Object.keys(s.players).find((k) => s.players[k].bot) ;
    const p = s.players[id];
    s.players.p1 = { ...p, id: 'p1', name: 'Mia', bot: false, human: true, connected: true };
    s.players[id].bot = true;
    return 1;
  })()`);
  await run(2);
  // fly her over the island (teleport the ship's x so the rope's hatch is above it)
  await host.ev(`(()=>{
    const s = game.state, c = s.creature, ship = s.ships[0], I = __cfg.CREATURES.TITAN.ISLAND;
    c.mouthWin = null; c.ai.mouthT = 999; c.titan.nextT = 999; c.titan.roar = null;
    const mid = c.x + c.f * (I.X0 + I.X1) / 2;
    ship.pose.x += mid - (ship.pose.x + ship.layout.refPoint.x);
    return 1;
  })()`);
  await run(1.0);
  const landed = await host.ev(`(()=>{
    const s = game.state, g = s.groundSys, p = s.players.p1;
    p.carry = 'sword'; p.fly = true; p.fall = false; p.d = null;
    const isl = g.island();
    if (!isl) return 'no island';
    p.x = isl.x0 + 400; p.y = isl.y - 300;
    return g.landOn(p) ? 'landed' : 'refused';
  })()`);
  check(landed === 'landed', 'a hookshot-style landing puts a person on the island: ' + landed);
  const cx = await host.ev('(()=>{ const c = game.state.creature; return Math.round(c.x + c.f * __cfg.CREATURES.TITAN.CRYSTAL.X); })()');
  await host.ev(`(()=>{ const p = game.state.players.p1; p.jx = 1; return 1; })()`);
  check(await runUntil(`(() => { const p = game.state.players.p1; return Math.abs(p.x - ${cx}) < 200; })()`, 30, 0.3), 'he walks along the island (carried by it) to the crystal');
  await host.ev(`(()=>{ const p = game.state.players.p1; p.jx = 0; p.jxs = 0; return 1; })()`);
  await host.ev(`(()=>{ const p = game.state.players.p1; p.jx = 0; p.fire = true; return 1; })()`);
  await run(2.0);
  await snap(pre + 'crystal_crew.png');
  const prog = await host.ev('(()=>{ const part = game.state.creature.parts.find((q) => q.id === "crystal"); return JSON.stringify({ prog: part.job && part.job.prog, hp: part.hp, struck: game.state.creature.stats.struck }); })()');
  console.log('  crystal: ' + prog);
  check(await runUntil('!game.state.creature || game.state.creature.dying', 60, 0.5), 'hacking the crystal (holding Action) brings the Titan down');
  await run(0.3);
  await snap(pre + 'dying.png', view === '3d' ? 250 : 1500);
  await run(1.2);
  await snap(pre + 'crumble.png', view === '3d' ? 250 : 1500); // (the island and its trees have broken up into falling stone)

  const errs = [...host.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  if (e && e.message === 'STOP') console.log('  (stopped as asked)'); else { failed++; console.log('ERROR ' + (e && e.stack || e)); }
} finally {
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `titan-shots: ${failed} FAILED` : 'titan-shots: all ok');
process.exit(failed ? 1 : 0);
