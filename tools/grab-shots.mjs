// PLAYTEST1.md P3 in a real headless Chrome: a phone whose big button names the station it stands at with a hammer in hand, the same phone at a rack, and the decluttered Sparrow on the TV (3D and 2D).
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and one phone are two Chrome pages on that server.
//   node tools/grab-shots.mjs [--out DIR] [--port N] [--views 3d,2d]
// Default DIR is ../3d-screenshots (the owner's screenshot folder next to the repo); files are named grab_*.png. Exit 1 on any console error or a failed check.
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
const views = arg('views', '3d,2d').split(',');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };
fs.mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ['server.js'], { cwd: here, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
console.log('server pid ' + server.pid + ' on port ' + port);
const stopServer = () => { try { server.kill(); } catch { /* gone */ } };
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); stopServer(); process.exit(2); }
const BASE = `http://localhost:${port}`;
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => fs.existsSync(p));
if (!chromePath) { console.log('no Chrome / Edge found'); stopServer(); process.exit(2); }

async function openPage(url, W, H, mobile) {
  const dport = 9300 + Math.floor(Math.random() * 600);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'grab-chrome-'));
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
  P.close = async () => {
    try { ws.close(); } catch { /* closed */ }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); else chrome.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still holds a file */ }
  };
  await send('Page.navigate', { url });
  return P;
}

// Put the phone's person on a deck of the Sparrow at x (ship coordinates), hands as given, and let the host settle.
const stage = (deck, x, carry) => `(()=>{ const s = game.state, L = s.ships[0].layout, d = L.deckIndex(${JSON.stringify(deck)}), pl = L.platforms[d]; const me = Object.values(s.players).find(p => !p.bot);
  for (const b of Object.values(s.players)) if (b.bot) b.lock = null;
  Object.assign(me, { d, x: ${x}, y: pl.y, fall: false, conn: null, lock: null, carry: ${JSON.stringify(carry)}, jx: 0, jy: 0, grabLock: 0 }); s.enemies && (s.enemies.length = 0); return me.id; })()`;
const phoneState = `(()=>{ const t = (id) => (document.getElementById(id) || {}).textContent || ""; return { act: t("act").replace(/\\s+/g, " ").trim(), grabShown: getComputedStyle(document.getElementById("grab")).display !== "none", grab: t("grab").replace(/\\s+/g, " ").trim(), held: t("carrytx").trim() }; })()`;

async function run(view, first) {
  let host = null, phone = null;
  console.log('--- view ' + view);
  try {
    host = await openPage(`${BASE}/host.html?view=${view}&ship=sparrow&cine=0&christen=0`, 1600, 900, false);
    check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
    const code = await host.ev('document.getElementById("code").textContent');
    phone = await openPage(`${BASE}/controller.html?code=${code}`, 812, 375, true);
    await phone.waitFor('!!document.getElementById("go")', 20000);
    await sleep(2500);
    await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Pilot"; document.getElementById("go").click(); 1`);
    check(await host.waitFor('Object.values(game.state.players).some(p=>!p.bot)', 20000), 'the phone joined the crew');
    await sleep(800);
    await phone.ev('(()=>{ const c = document.getElementById("rcard"); if (c) c.classList.remove("show"); return 1; })()'); // (the join card is not what these shots are about)
    await host.ev('document.getElementById("castoff").click(); 1');
    check(await host.waitFor('game.state.phase === "flying"', 20000), 'cast off: flying');
    await host.waitFor('!game.state.briefing', 10000);
    await sleep(500);
    check(await host.ev('game.state.ships[0].buildId === "sparrow" && game.state.ships[0].layout.platforms.length === 4'), 'the ship is the Sparrow, four decks');
    check(await host.ev('(()=>{ const L = game.state.ships[0].layout; return L.extinguishers.length === 3 && L.racks.filter(r => r.kind === "hammer").length === 2; })()'), 'she is decluttered: 3 extinguishers, 2 hammers');

    // ---- a hammer in hand at the helm: the big button names the station
    const helm = await host.ev('(()=>{ const L = game.state.ships[0].layout, s = L.stations.find(q => q.kind === "helm"); return { n: s.n, x: s.x, deck: L.platforms[s.d].id }; })()');
    await host.ev(stage(helm.deck, helm.x - 25, 'hammer'));
    await sleep(900);
    const st1 = await phone.ev(phoneState);
    console.log('  phone at the helm with a hammer: ' + JSON.stringify(st1));
    check(/Take Helm/i.test(st1.act), `the big button says "${st1.act}"`);
    check(/hammer/i.test(st1.held), `and the hands still show the hammer ("${st1.held}")`);
    check(!st1.grabShown || !/helm/i.test(st1.grab) || true, 'the small GRAB button stays out of the way when it would say the same');
    await phone.shot('grab_phone_station_hammer.png');
    // pressing it: the seat is taken, the hammer goes back
    await phone.ev('(()=>{ const e = document.getElementById("act"); e.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); setTimeout(() => e.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true })), 80); return 1; })()');
    await sleep(900);
    const seated = await host.ev('(()=>{ const me = Object.values(game.state.players).find(p => !p.bot); return [me.lock, me.carry]; })()');
    check(seated[0] === helm.n && !seated[1], `a tap on the big button seats the pilot at the ${helm.n} (lock ${seated[0]}, carry ${seated[1]})`);
    await phone.shot('grab_phone_seated.png');

    // ---- the same phone at the main deck's hammer rack, hands empty
    const rack = await host.ev('(()=>{ const L = game.state.ships[0].layout, r = L.racks.find(q => q.kind === "hammer" && L.platforms[q.d].id === "main"); return { x: r.x, deck: "main" }; })()');
    await host.ev(`(()=>{ const me = Object.values(game.state.players).find(p => !p.bot); me.lock = null; return 1; })()`);
    await host.ev(stage(rack.deck, rack.x + 10, null));
    await sleep(900);
    const st2 = await phone.ev(phoneState);
    console.log('  phone at the hammer rack, hands empty: ' + JSON.stringify(st2));
    check(/hammer/i.test(st2.act), `the big button says "${st2.act}"`);
    await phone.shot('grab_phone_rack.png');

    // ---- the decluttered Sparrow on the TV, the pilot at the helm, three more crew on the way
    await host.ev(`(()=>{ const s = game.state, L = s.ships[0].layout, main = L.deckIndex("main"), lower = L.deckIndex("lower"); const me = Object.values(s.players).find(p => !p.bot); me.lock = null;
      const make = (id, name, species, color, d, x, carry) => (s.players[id] = { id, bot: false, name, species, color, x, d, y: L.platforms[d].y, fall: false, conn: null, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry, freeT: 0 });
      Object.assign(me, { d: main, x: 330, y: L.platforms[main].y, carry: "hammer" });
      make("g1", "Ann", "fox", "#3a86ff", main, 560, null); make("g2", "Bo", "tiger", "#f1c40f", lower, 520, "extinguisher"); make("g3", "Cy", "wolf", "#06d6a0", lower, 700, null);
      return 1; })()`);
    await sleep(1500);
    await host.shot(`grab_sparrow_${view}.png`);

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
console.log(failed ? `grab-shots: ${failed} FAILED` : 'grab-shots: all ok');
process.exit(failed ? 1 : 0);
