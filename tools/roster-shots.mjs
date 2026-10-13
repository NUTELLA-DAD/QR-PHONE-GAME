// L3 (SHIPS_BOOK.md) in a real headless Chrome: a veteran scans in (the title on the TV lobby and on the phone's join card, timed), a new face is a Deckhand, the scorecard with titles under the names,
// and the Ship's Book's crew roster page. Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally); the host and two phones are three Chrome pages.
// The TV is given a save of an earlier evening first (a named ship, two voyages, six crew records).
//   node tools/roster-shots.mjs [--out DIR] [--port N] [--view 2d|3d] [--suffix _x]
// Default DIR is ../3d-screenshots; files are named roster_*.png. Exit 1 on any console error or a failed check.
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
const sfx = arg('suffix', view === '3d' ? '_3d' : '');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-chrome-'));
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
  P.key = (key, code) => send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: code || key, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : ({ ArrowRight: 39, ArrowLeft: 37, Escape: 27 })[key] || 0 }).then(() => send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: code || key }));
  P.ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) { P.errors.push('EVAL ERROR: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return undefined; }
    return r.result.value;
  };
  P.png = async () => Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
  P.shot = async (name) => { const f = name.replace(/\.png$/, sfx + '.png'); fs.writeFileSync(path.join(out, f), await P.png()); console.log('  shot ' + f); };
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

// A TV that has been flown before: a named ship, two voyages in the book, and a crew record for the phone we are about to scan in (its id is PIDVET) and for five others who are not here tonight.
const rec = (name, color, species, voyages, victories, stats, stations, deeds, pid) => ({ name, color, species, voyages, victories, first: '2026-09-02', last: '2026-10-11', stats, pid, stations, deeds, ship: 'The Brass Heron' });
const seedSave = () => ({
  version: 3, bestStops: 6, bestSalvage: 900, totalRuns: 11, victories: 4, unlocks: ['flagship-medal'],
  ship: { name: 'The Brass Heron', born: '2026-09-02', voyages: 9, victories: 4, stops: 41, salvage: 5200 },
  book: [1, 2].map((no) => ({ no, shipName: 'The Brass Heron', ship: 'The Brass Heron', date: '2026-10-0' + (7 + no), victory: no === 2, modeLabel: 'VOYAGE', voyages: 1, voyageNo: 1, done: 3 + no, total: 7, salvage: 300 * no, kills: 20, gunships: 1,
    route: [{ no: 1, name: 'Sky Isles', icon: '☁', env: 'skyisles', end: 'done' }, { no: 2, name: 'Ember Forge', icon: '\u{1F525}', env: 'ember', end: no === 2 ? 'done' : 'lost' }],
    lines: [{ no: 1, name: 'Sky Isles', first: true, text: 'Mia put out the first fire of the evening.', kind: 'x', who: ['Mia'] }, { no: 2, name: 'Ember Forge', first: true, text: 'Bob shovelled coal for three whole minutes.', kind: 'x', who: ['Bob'] }],
    rows: [{ icon: '⚫', title: 'Stoker', name: 'Bob', color: '#3a86ff', value: 12, unit: 'coal loads' }], colors: { Mia: '#06d6a0', Bob: '#3a86ff' } })),
  fleet: [],
  crew: {
    PIDVET: rec('Mia', '#06d6a0', 'fox', 9, 4, { kills: 40, fires: 8, holes: 12, coal: 10 }, { helm: 500, gun: 400, boiler: 200 }, { overboard: 1 }, 'PIDVET'),
    PIDBOB: rec('Bob', '#3a86ff', 'bulldog', 6, 3, { coal: 80, holes: 10, kills: 20 }, { boiler: 2400, coal: 300 }, {}, 'PIDBOB'),
    PIDCAL: rec('Cal', '#f1c40f', 'frog', 8, 4, { kills: 310, ammo: 50, raiders: 6 }, { gun: 3000, ammo: 600 }, {}, 'PIDCAL'),
    PIDDEE: rec('Dee', '#ff7b00', 'cat', 5, 2, { fires: 52, revives: 5, holes: 9 }, { helm: 300, engine: 200 }, { 'revive-fire': 2 }, 'PIDDEE'),
    PIDELI: rec('Eli', '#8338ec', 'owl', 4, 1, { raiders: 41, kills: 33 }, { gun: 400 }, { 'gunship-charge': 1 }, 'PIDELI'),
    PIDFAY: rec('Fay', '#e63946', 'bear', 3, 0, { stowed: 18, patched: 3 }, { helm: 2000, lookout: 300 }, { 'overboard-lunatic': 2, overboard: 4 }, 'PIDFAY'),
  },
});

let host = null, phone = null, phone2 = null;
try {
  host = await openPage(`${BASE}/host.html?view=${view}&cine=0`, 1600, 900, false);
  check(await host.waitFor('!!window.game && !!document.getElementById("code") && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent)', 40000), 'the host page is up with a room code');
  await host.ev(`localStorage.setItem('airshipVoyage', ${JSON.stringify(JSON.stringify(seedSave()))}); location.reload(); 1`);
  await sleep(1500);
  check(await host.waitFor('!!window.game && /^[A-Z0-9]{4}$/.test(document.getElementById("code").textContent) && game.state.save.crew.PIDVET', 40000), 'the TV has been flown before (a named ship, a book, six crew records)');
  const code = await host.ev('document.getElementById("code").textContent');
  check(await host.ev('game.state.shipName === "The Brass Heron" && game.state.save.version === 3'), 'the ship is named, so CAST OFF will not open a vote');

  // 1. a veteran scans in: the phone has the id PIDVET (as it would from an earlier evening); time the title on the TV
  phone = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true);
  await phone.waitFor('!!document.getElementById("go")', 20000);
  await sleep(1500);
  await phone.ev(`localStorage.airshipPid = "PIDVET"; document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; 1`);
  const t0 = Date.now();
  await phone.ev('document.getElementById("go").click(); 1');
  const onTv = await host.waitFor('game.state.welcomes && game.state.welcomes.length > 0', 5000);
  const tv = Date.now() - t0;
  console.log(`  the title was on the TV ${tv} ms after the tap`);
  check(onTv && tv < 2000, 'a veteran\'s title is on the TV within 2 s of scanning in');
  check(await host.ev('game.state.welcomes[0].line === "Mia the Old Salt returns!"'), 'it reads "Mia the Old Salt returns!"');
  const onPhone = await phone.waitFor('document.getElementById("rcard").classList.contains("show") && /Welcome back, Mia/.test(document.getElementById("rctitle").textContent)', 4000);
  const ph = Date.now() - t0;
  console.log(`  the join card said so ${ph} ms after the tap`);
  check(onPhone && ph < 2000, 'the phone\'s join card says "Welcome back, Mia!" within 2 s');
  console.log('  card: ' + await phone.ev('document.getElementById("rctitle").textContent + " / " + document.getElementById("rctext").textContent'));
  await sleep(500);
  await host.shot('roster_1_lobby_tv.png');
  await phone.shot('roster_1_join_phone.png');

  // a new face joins too (a phone this TV has never seen)
  phone2 = await openPage(`${BASE}/controller.html?code=${code}`, 780, 360, true);
  await phone2.waitFor('!!document.getElementById("go")', 20000);
  await sleep(1500);
  await phone2.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Zed"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('game.state.welcomes.some(w=>w.name==="Zed")', 5000), 'a new face is welcomed too');
  await sleep(800);
  await host.ev('document.getElementById("bots").click(); 1');
  await sleep(1200);
  await host.shot('roster_1b_lobby_two_tv.png');
  await phone2.shot('roster_1b_join_phone_new.png');
  check(await host.ev('game.state.titles.Mia === "Old Salt" && game.state.titles.Zed === "Deckhand" && !Object.keys(game.state.titles).some(n=>/^Bot/.test(n))'), 'titles: Mia Old Salt, Zed Deckhand, no bot has one');

  // 2. a stop cleared: the scorecard has the titles under the names
  await phone.ev('document.getElementById("rcard").classList.remove("show"); 1');
  await host.ev('document.getElementById("castoff").click(); 1');
  check(await host.waitFor('game.state.phase === "flying" && !game.state.vote', 8000), 'CAST OFF flies at once (she is named)');
  await host.ev(`game.course.startMission(2, { kind: 'open', environment: 'skyisles', danger: 2, title: 'STOP 2: TEST', goal: 'DESTROY THE OUTPOSTS', heading: 'STOP 2: TEST', stop: { id: '1.0', col: 1, name: 'Test' } }); 1`);
  await sleep(1500);
  await host.ev('Object.values(game.state.players).forEach(p=>{ if(!p.bot) p.stats = Object.assign(p.stats||{}, p.name==="Mia" ? {fires:5, holes:2} : {kills:7, coal:2}); }); game.state.course.turrets.forEach(t=>{t.dead=true; t.hp=0}); 1');
  check(await host.waitFor('!!game.state.course.escape', 8000), 'all outposts down: the escape starts');
  await host.ev('game.state.course.escape.t = 0.2; 1');
  check(await host.waitFor('!!game.state.scorecard', 8000), 'the scorecard comes up');
  await sleep(600);
  await host.shot('roster_2_scorecard_tv.png');

  // 3. the voyage ends in victory: the records grow, and the Book has a crew page
  await host.ev('(()=>{ game.state.scorecard = null; game.state.vote = null; game.closeStop("done"); game.endRun(true); return 1 })()');
  check(await host.waitFor('!!game.state.runEnd', 5000), 'the run ends');
  const sv = await host.ev('JSON.parse(localStorage.getItem("airshipVoyage")).crew');
  check(sv.PIDVET && sv.PIDVET.voyages === 10 && sv.PIDVET.pid === 'PIDVET' && Object.keys(sv).length === 7, 'Mia\'s record (found by her phone\'s id) has 10 voyages; the new face has a record too (7 in all)');
  console.log('  Zed\'s record: ' + JSON.stringify(Object.values(sv).find((r) => r.name === 'Zed')));
  await host.ev('(()=>{ game.restart(); return 1 })()');
  check(await host.waitFor('game.state.phase === "lobby" && !game.state.runEnd', 5000), 'back at the mast');
  await sleep(600);
  await host.key('b');
  check(await host.waitFor('game.state.bookView.open === true', 3000), 'B opens the Ship\'s Book');
  await sleep(500);
  await host.shot('roster_3_book_cover_tv.png');
  await host.key('ArrowRight');
  check(await host.waitFor('game.state.bookView.page === 1', 3000), 'the right arrow turns to the crew roster page');
  await sleep(500);
  await host.shot('roster_3_book_roster_tv.png');
  await host.key('Escape');
  await sleep(300);

  // 4. the veteran's phone reloads (a new page, the same saved id): her record is still hers
  await phone.ev('location.reload(); 1');
  await sleep(2500);
  await phone.ev(`document.getElementById("code").value="${code}"; document.getElementById("name").value="Mia"; document.getElementById("go").click(); 1`);
  check(await host.waitFor('Object.values(game.state.players).filter(p=>p.name==="Mia").length === 1', 6000), 'the same token after a reload: still one Mia aboard');

  const errs = [...host.errors, ...phone.errors, ...phone2.errors, ...(await host.ev('window.gameErrors||[]') || [])];
  for (const e of errs.slice(0, 6)) console.log('  ' + e);
  check(errs.length === 0, '0 console errors, 0 game errors');
} catch (e) {
  failed++;
  console.log('ERROR ' + (e && e.stack || e));
} finally {
  if (phone2) await phone2.close();
  if (phone) await phone.close();
  if (host) await host.close();
  stopServer();
}
console.log(failed ? `roster-shots: ${failed} FAILED` : 'roster-shots: all ok');
process.exit(failed ? 1 : 0);
