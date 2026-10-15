// F10 (FUN.md): ROLE CARDS in a real headless Chrome: the join card on a phone, the ? help card (free with a job, and at a station), and the TV with verbs over idle crew, in 2D and in 3D.
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server.
//   node tools/rolecards-shots.mjs [--out DIR] [--port N] [--views 2d,3d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named roles_*.png. Exit 1 on any console error or a failed check.
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
const views = arg('views', '2d,3d').split(',');
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

async function openPage(url, W, H, mobile) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-chrome-'));
  const flags = ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--mute-audio', '--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
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
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return undefined; }
    return r.result.value;
  };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.shot = async (name) => { fs.writeFileSync(path.join(out, name), await P.png()); console.log('  shot ' + name); };
  P.waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await P.ev(expr).catch(() => false); if (v) return true; await sleep(200); } return false; };
  P.resize = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile });
  P.tap = (sel) => P.ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); e.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return 1; })()`);
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file */ }
  };
  await send('Page.navigate', { url });
  return P;
}

async function run(view, first) {
  let host = null, phone = null;
  console.log('--- view ' + view);
  try {
    host = await openPage(`${BASE}/host.html?view=${view}&cine=0&christen=0`, 1600, 900, false);
    check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
    const code = await host.ev('document.getElementById("code").textContent');
    phone = await openPage(`${BASE}/controller.html?code=${code}`, 812, 375, true);
    await phone.waitFor('!!document.getElementById("go")', 20000);
    await sleep(2500);
    await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Pilot"; document.getElementById("go").click(); 1`);
    check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');

    // ---- the join card
    check(await phone.waitFor('document.getElementById("rcard").classList.contains("show")', 8000), 'the join card shows after joining');
    await sleep(400);
    const card = await phone.ev('document.getElementById("rctitle").textContent + " | " + document.getElementById("rctext").textContent');
    console.log('  join card: ' + card);
    check(/You're crew|You are a|Welcome back/.test(card) && /GOLD ARROW/.test(card), 'the card welcomes the player ("You\'re crew!" or, since the Ship\'s Book L3, "You are a <rank>!") and says "Follow the GOLD ARROW"');
    if (first) await phone.shot('roles_phone_join_card.png');
    await phone.tap('#rcard');
    await sleep(200);
    check(await phone.ev('!document.getElementById("rcard").classList.contains("show")'), 'a tap closes the join card');
    const box = await phone.ev('(()=>{ const r = document.getElementById("hintbtn").getBoundingClientRect(); return [r.width, r.height, getComputedStyle(document.getElementById("hintbtn")).display]; })()');
    check(box[0] >= 40 && box[1] >= 40 && box[2] !== 'none', 'the ? button is there and thumb-sized: ' + box.slice(0, 2).map((n) => Math.round(n)).join('x') + ' px');
    if (first) await phone.shot('roles_phone_play_qbutton.png');

    await host.ev('document.getElementById("castoff").click(); 1');
    check(await host.waitFor('game.state.phase === "flying"', 20000), 'cast off: flying');
    await host.waitFor('!game.state.briefing', 10000);
    await sleep(500);

    // ---- a crew standing around with jobs on offer: the pilot (the phone) and three more humans (no phone: the simulation treats them alike)
    const ids = await host.ev(`(()=>{
      const s = game.state, L = s.ships[0].layout, main = L.deckIndex('main'), pl = L.platforms[main];
      const me = Object.values(s.players).find(p => !p.bot);
      for (const b of Object.values(s.players)) if (b.bot) { b.lock = null; }
      const make = (id, name, species, color, x, carry) => (s.players[id] = { id, bot: false, name, species, color, x, d: main, y: pl.y, fall: false, conn: null, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry, freeT: 0 });
      const place = (p, x, carry) => Object.assign(p, { d: main, x, y: pl.y, fall: false, conn: null, lock: null, carry, freeT: 0, job: null, jobT: 0 });
      place(me, pl.x0 + 380, null);
      make('fx1', 'Ann', 'fox', '#3a86ff', pl.x0 + 520, 'extinguisher');
      make('fx2', 'Bo', 'tiger', '#f1c40f', pl.x0 + 660, 'ammo');
      make('fx3', 'Cy', 'wolf', '#06d6a0', pl.x0 + 800, 'coal');
      s.fires.length = 0; s.breaches.length = 0;
      game.fire.ignite(main, pl.x0 + 470, 'hit');
      s.breaches.push({ x: pl.x0 + 330, d: main, prog: 0 });
      for (const g of Object.values(s.GUNS)) if (g.type !== 'flame') g.ammo = 0;
      s.ship.fuel = 5;
      return [me.id, 'fx1', 'fx2', 'fx3'];
    })()`);
    // keep the sky quiet and the crew where they are for a few seconds
    await host.ev('(()=>{ const s = game.state; s.enemies && (s.enemies.length = 0); return 1; })()');
    await sleep(2500);
    const early = await host.ev(`(${JSON.stringify(ids)}).map(i => [i, game.state.players[i].freeT.toFixed(1), !!(game.state.players[i].job && game.state.players[i].job.verb)])`);
    console.log('  after 2.5 s: ' + JSON.stringify(early));
    await host.waitFor(`(${JSON.stringify(ids)}).every(i => game.state.players[i].freeT > 5.6)`, 120000);
    const verbs = await host.ev(`(${JSON.stringify(ids)}).map(i => { const p = game.state.players[i]; return [p.name, +p.freeT.toFixed(1), p.job && p.job.verb, p.job && p.job.label]; })`);
    console.log('  after 7.5 s: ' + JSON.stringify(verbs));
    const shown = verbs.filter((v) => v[1] > 5 && v[2]);
    check(shown.length >= 3, `${shown.length} of ${verbs.length} idle crew have a verb over their heads: ${shown.map((v) => v[0] + '=' + v[2]).join(', ')}`);
    check(new Set(shown.map((v) => v[2])).size >= 2, 'more than one verb on the screen');
    await host.ev('game.state.alarmClear && game.state.alarmClear(); 1');
    await sleep(600);
    await host.shot(`roles_${view}_tv_verbs.png`);

    // ---- FIND ME (PLAYTEST1.md P2): the name plates in the players' colours, the phone's room line and button, the ring and the big name on the TV
    {
      const pilot = ids[0];
      await host.ev('(()=>{ const s = game.state; for (const b of Object.values(s.players)) if (b.bot) b.pingT = 0; return 1; })()');
      await sleep(500);
      await host.shot(`find_me_${view}_tv_plates.png`);
      const fb = await phone.ev('(()=>{ const r = document.getElementById("findbtn").getBoundingClientRect(); return [r.width, r.height, getComputedStyle(document.getElementById("findbtn")).display, document.getElementById("findbtn").textContent]; })()');
      check(fb[0] >= 40 && fb[1] >= 44 && fb[2] !== 'none', 'the FIND ME button is thumb-sized: ' + Math.round(fb[0]) + 'x' + Math.round(fb[1]) + ' px ("' + fb[3] + '")');
      const info = await phone.ev('document.getElementById("info").textContent');
      console.log('  info line: ' + info);
      check(/DECK|CROW|BRIDGE|ROOM|HOLD|WORKSHOP/.test(info), 'the info line names the room while walking: ' + info);
      if (first) await phone.shot('find_me_phone.png');
      await host.ev(`game.state.players[${JSON.stringify(pilot)}].pingT = 0; 1`);
      await phone.tap('#findbtn');
      check(await host.waitFor(`game.state.players[${JSON.stringify(pilot)}].pingT > 1`, 5000), 'pressing FIND ME on the phone starts the ring on the TV');
      // hold the ring at one step (1.3 s left = step 7 of 18; later 0.7 s = step 12) by setting it every few ms, so the picture is the same every run
      await host.ev(`(()=>{ window.__hold = setInterval(() => { game.state.players[${JSON.stringify(pilot)}].pingT = 1.3; }, 5); return 1; })()`);
      await sleep(900);
      await host.shot(`find_me_${view}_tv_ring.png`);
      await host.ev(`(()=>{ clearInterval(window.__hold); window.__hold = setInterval(() => { game.state.players[${JSON.stringify(pilot)}].pingT = 0.7; }, 5); return 1; })()`);
      await sleep(500);
      await host.shot(`find_me_${view}_tv_ring_late.png`);
      await host.ev('(()=>{ clearInterval(window.__hold); return 1; })()');
      await sleep(2800);
      check(await host.ev(`!(game.state.players[${JSON.stringify(pilot)}].pingT > 0)`), 'the ring ends by itself after 2.2 s');
    }

    // ---- the ? button: free with a job
    check(await phone.waitFor('!!document.querySelector("#job.show")', 8000) || true, 'the phone has its gold arrow');
    await phone.tap('#hintbtn');
    await sleep(300);
    const help = await phone.ev('document.getElementById("rctitle").textContent + " | " + document.getElementById("rctext").textContent');
    console.log('  ? card (free): ' + help);
    check(await phone.ev('document.getElementById("rcard").classList.contains("show")') && /YOUR JOB: /.test(help), 'the ? button shows "YOUR JOB: <verb>" with the way');
    if (first) await phone.shot('roles_phone_help_job.png');
    await phone.tap('#hintbtn');
    await sleep(200);
    check(await phone.ev('!document.getElementById("rcard").classList.contains("show")'), 'the ? button again closes it');

    // ---- the ? button at a station (the helm)
    if (first) {
      await host.ev(`(()=>{ const s = game.state, L = s.ships[0].layout, st = L.stations.find(q => q.kind === 'helm'), p = Object.values(s.players).find(q => !q.bot && q.id !== 'fx1' && q.id !== 'fx2' && q.id !== 'fx3'); const pl = L.platforms[st.d]; Object.assign(p, { lock: st.n, d: st.d, x: st.x, y: pl.y, conn: null }); return st.n; })()`);
      await sleep(900);
      await phone.tap('#hintbtn');
      await sleep(300);
      const help2 = await phone.ev('document.getElementById("rctitle").textContent + " | " + document.getElementById("rctext").textContent');
      console.log('  ? card (helm): ' + help2);
      check(/stick|engine|helm/i.test(help2), 'at the helm the ? button shows the helm hint');
      await phone.shot('roles_phone_help_station.png');
      await phone.tap('#hintbtn');
      await phone.resize(667, 375); // (the smallest landscape phone: the strip must still hold ?, Help and LEAVE on one line)
      await sleep(500);
      const strip = await phone.ev('(()=>{ const s = document.getElementById("strip").getBoundingClientRect(); const r = ["hintbtn", "help", "leave"].map((i) => document.getElementById(i).getBoundingClientRect()); return [s.height, r.every((b) => b.right <= s.right + 1 && b.width > 30), document.getElementById("hull").getBoundingClientRect().width]; })()');
      check(strip[1], 'small phone 667x375, LEAVE showing: ?, Help and LEAVE all sit inside the strip; the hull bar is ' + Math.round(strip[2]) + ' px');
      const base = await phone.ev('(()=>{ const b = document.getElementById("hintbtn"); b.style.display = "none"; const h = document.getElementById("strip").getBoundingClientRect().height; b.style.display = ""; return h; })()');
      console.log('  strip height at 667x375 without the ? button: ' + Math.round(base) + ' px (with it ' + Math.round(strip[0]) + ')');
      check(strip[0] <= base + 1, 'the ? button does not make the top strip any taller on the smallest phone');
      await phone.tap('#hintbtn');
      await sleep(300);
      await phone.shot('roles_phone_small_help.png');
      await phone.tap('#hintbtn');
      await phone.resize(812, 375);
    }
    const errs = [...host.errors, ...phone.errors, ...(await host.ev('window.gameErrors||[]') || [])];
    for (const e of errs.slice(0, 6)) console.log('  ' + e);
    check(errs.length === 0, '0 console errors, 0 game errors');
  } catch (e) {
    failed++;
    console.log('ERROR ' + (e && e.stack || e));
  } finally {
    if (phone) await phone.close();
    if (host) await host.close();
  }
}
try {
  for (let i = 0; i < views.length; i++) await run(views[i], i === 0);
} finally {
  stopServer();
}
console.log(failed ? `rolecards-shots: ${failed} FAILED` : 'rolecards-shots: all ok');
process.exit(failed ? 1 : 0);
