// THE CREW ROSTER gate, L3 (SHIPS_BOOK.md; public/modules/host/roster.js, book.js findCrew / recordCrew, christen.js endRun, bookArt.js, render.js; config.BOOK.ROSTER). Headless, no browser.
//   node tools/buildsim.mjs --check-roster        or directly:   node tools/roster-check.mjs [--seed 1] [--quick]
//
//   (a) THE TITLE RULES: a new face is a Deckhand; the ranks by voyages; every deed title in config is earned at its number and not one below it; a deed title needs MIN_VOYAGES; the title furthest past its number
//       wins, a tie goes to the higher rank; the same record always gets the same title
//   (b) A RECORD GROWS: two voyages of one human add up (voyages, wins, stat totals, seconds at the helm, deeds from the Book's moments), keyed by the phone's id; a new title is told to the phone
//   (c) A VETERAN SCANS IN: a returning phone's title is on the TV lobby and on the phone's join card within 2 s (counted in sim steps), a new face is welcomed as a Deckhand, the TV draws it
//   (d) IDENTITY: a reconnect (the same player again) is not welcomed twice and keeps its record; a new TV session knows the same phone by its id under a new token; a changed name follows the id;
//       another phone with the same name is another record; an L2 record kept under a name is claimed by the first phone with that name
//   (e) NO BOTS: no welcome, no title, no record for a bot or a ship's mate
//   (f) THE SAVE: round-trip, an L2 save (crew by name, no ids) loads with the new fields and is kept; v1 and v2 fixtures still load
//   (g) THE TV DRAWS: the lobby banners, the scorecard with titles, the cover and the crew roster page: 0 errors, no text under 22 px; the book has a page for the roster
//   (h) THE BOOK OFF: no welcomes and no titles, and a bots-only botsim prints the same with the Book on
// Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const seed = flag('seed', 1), quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
const root = path.resolve(publicDir, '..');

process.env.BOOK_ON = '1';
delete process.env.NO_BOOK2;
installShims();
let clock = seedRandom(seed);

// ---- a stub canvas (as book-check.mjs) ----
const rec = { n: 0, texts: [] };
const stubCtx = () => {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const t = { imageSmoothingQuality: 'low', font: '10px x', textAlign: 'left', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      switch (k) {
        case 'getTransform': return () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
        case 'setTransform': return (a, b, c, d, e, f) => { m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; };
        case 'resetTransform': return () => { m = [1, 0, 0, 1, 0, 0]; };
        case 'save': return () => { stack.push(m.slice()); };
        case 'restore': return () => { if (stack.length) m = stack.pop(); };
        case 'translate': return (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); };
        case 'scale': return (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); };
        case 'rotate': return (a) => { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); };
        case 'transform': return (a, b, c, d, e, f) => { m = mul(m, [a, b, c, d, e, f]); };
        case 'measureText': return (s) => ({ width: String(s).length * (+(/(\d+(?:\.\d+)?)px/.exec(o.font) || [0, '10'])[1]) * 0.5 });
        case 'getImageData': return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        case 'createImageData': return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
        case 'createLinearGradient': case 'createRadialGradient': case 'createPattern': case 'createConicGradient': return () => ({ addColorStop() {} });
        case 'isPointInPath': case 'isPointInStroke': return () => false;
        case 'fillText': case 'strokeText': return (s, x, y) => { rec.texts.push({ kind: k, s: String(s), x, y, font: o.font }); };
        default: return () => { rec.n++; };
      }
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = {
  fonts: { check: () => true, load: () => Promise.resolve() },
  createElement: () => { const c = { width: 0, height: 0, style: {}, getContext: () => (c.c ||= stubCtx()) }; return c; },
};
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
globalThis.fetch = async () => ({ json: async () => [] });

const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const BK = await load('modules/host/book.js');
const RS = await load('modules/host/roster.js');
const VY = await load('modules/host/voyage.js');
const { createLogbook } = await load('modules/host/logbookArt.js');
const { createLogArt } = await load('modules/host/logArt.js');
const { createBookArt } = await load('modules/host/bookArt.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');

const RO = config.BOOK.ROSTER;
const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
  }
};
const until = (sim, cond, maxSec) => { let n = 0; for (; n < maxSec * 60 && !cond(); n++) step(sim); return cond() ? n : -1; }; // (sim steps it took, -1 = never)
const KEYS = ['airshipVoyage', 'airshipVoyage.v1', 'airshipVoyage.v2', 'airshipVoyage.bad', 'airshipMode'];
const wipe = () => { for (const k of KEYS) localStorage.removeItem(k); };
const savedOf = () => JSON.parse(localStorage.getItem('airshipVoyage') || 'null');
const COLORS = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// A sim at the mast. `humans` = [{ id, name, pid }], bots = n bots. A fake socket records what goes to the phones.
function boot({ humans = [], bots = 0, join = true } = {}) {
  clock = seedRandom(seed);
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = null;
  config.ESCORT.AUTO_PATROL = false;
  config.SCRAP.ENABLED = false;
  const sim = createSimulation();
  const st = sim.state;
  const sent = [];
  sim.setSocket({ emit: (ev, payload) => sent.push({ ev, ...payload }) });
  const e = st.ships[0].layout.boarderEntryPoints;
  const add = (h, i) => { st.players[h.id] = { id: h.id, bot: false, human: true, name: h.name, pid: h.pid, species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: COLORS[i % COLORS.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true }; return st.players[h.id]; };
  if (join) humans.forEach(add);
  for (let i = 0; i < bots; i++) { const id = 'bot' + i; st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: 'fox', color: COLORS[i % COLORS.length], x: e[0].x + 25 * (i + 5), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true }; }
  return { sim, st, sent, add };
}
// One voyage flown by the humans: they take `lock` for a while, do `stats`, the run ends. Returns the runEnd.
function fly(A, stats, { victory = true, secs = 20, lock = null } = {}) {
  const { sim, st } = A;
  if (!st.shipName) { st.shipName = 'The Brass Heron'; st.save.ship = BK.newShip(st.shipName, VY.dateKey()); } // (a ship with a name: no christening vote in the way of CAST OFF; the Book still writes the voyage)
  sim.castOff();
  until(sim, () => st.phase === 'flying', 20);
  const helm = st.ships[0].layout.one('helm');
  for (let s = 0; s < secs; s++) {
    for (const p of Object.values(st.players)) if (!p.bot && lock !== false) p.lock = lock || helm.n;
    step(sim, 60);
  }
  for (const [id, s] of Object.entries(stats || {})) st.players[id].stats = { ...(st.players[id].stats || {}), ...s };
  sim.endRun(victory);
  return st.runEnd;
}
const atEndOfRun = (A) => { A.sim.restart(); step(A.sim, 5); };

// ---- (a) the title rules ----
console.log('--- (a) the title rules ---');
{
  const R = (voyages, stats = {}, extra = {}) => ({ name: 'X', voyages, victories: 0, stats, stations: {}, deeds: {}, ...extra });
  report(RS.titleFor(null).name === 'Deckhand' && RS.titleFor(R(0)).name === 'Deckhand' && RS.titleFor(R(1)).name === 'Deckhand', 'a new face (no record, or no voyages, or one) is a Deckhand');
  report(RS.titleFor(R(2)).name === 'Deckhand' && RS.titleFor(R(3)).name === 'Able Hand' && RS.titleFor(R(7)).name === 'Able Hand' && RS.titleFor(R(8)).name === 'Old Salt' && RS.titleFor(R(40)).name === 'Old Salt', 'the ranks by voyages: Deckhand 0-2, Able Hand 3-7, Old Salt 8 and more');
  const names = RO.TITLES.map((T) => T.name);
  report(new Set(names).size === names.length && RO.TITLES.every((T) => T.name && (T.stat || T.deed || T.station) && T.rank > 0 && (T.min > 0 || T.secs > 0)), `${RO.TITLES.length} deed titles in config, every name different, each with a rule`);
  let allGood = true, msg = '';
  for (const T of RO.TITLES) {
    const at = T.station ? R(3, {}, { stations: { [T.station]: T.secs, other: T.secs * (1 / T.share - 1) } }) : T.deed ? R(3, {}, { deeds: { [T.deed]: T.min } }) : R(3, Object.fromEntries((Array.isArray(T.stat) ? T.stat : [T.stat]).map((k, i) => [k, i === 0 ? T.min : 0])));
    const below = T.station ? R(3, {}, { stations: { [T.station]: T.secs - 1, other: T.secs * (1 / T.share - 1) } }) : T.deed ? R(3, {}, { deeds: { [T.deed]: T.min - 1 } }) : R(3, Object.fromEntries((Array.isArray(T.stat) ? T.stat : [T.stat]).map((k, i) => [k, i === 0 ? T.min - 1 : 0])));
    const early = { ...at, voyages: 1 };
    const got = RS.titleFor(at).name, no = RS.titleFor(below).name, wait = RS.titleFor(early).name;
    if (got !== T.name || no === T.name || wait === T.name) { allGood = false; msg += ` ${T.id}: at ${got}, below ${no}, early ${wait};`; }
  }
  report(allGood, `every deed title is earned at its number and not one below it, and not before ${RO.MIN_VOYAGES} voyages${msg}`);
  // furthest past its number wins; a tie goes to the higher rank; the same record, the same answer
  const both = R(5, { coal: 100, fires: 20 });
  report(RS.titleFor(both).name === 'Stoker of the Year' && RS.titleFor(both).also.includes('Firefighter'), 'two titles earned: the one furthest past its number is the headline (coal 100/25 beats fires 20/20), the other is "also"');
  const tie = R(5, { holes: 30, fires: 20 }); // (both exactly at their number: Firefighter, rank 7, beats Patch Master, rank 4)
  report(RS.titleFor(tie).name === 'Firefighter', 'a tie goes to the higher rank');
  report([1, 2, 3].every(() => JSON.stringify(RS.titleFor(both)) === JSON.stringify(RS.titleFor(JSON.parse(JSON.stringify(both))))), 'the same record always gets the same title (no dice)');
  report(RS.titleFor(R(2, { kills: 10 }, { deeds: { 'overboard-lunatic': 2 } })).name === "Ship's Lunatic", 'a deed from the Book (overboard three times, twice over) earns a title too');
  report(RS.titleFor(R(9, { kills: 10 }, { deeds: {} })).name === 'Old Salt' && RS.titleFor(R(9, { kills: 10 })).also.length === 0, 'a veteran with no speciality is an Old Salt');
  const w1 = RS.welcomeOf(R(9, {}, { victories: 4 }), 'Mia'), w0 = RS.welcomeOf(null, 'Zed');
  report(w1.line === 'Mia the Old Salt returns!' && w1.vet && /9 voyages, 4 won/.test(w1.sub) && w1.phone.title === 'Welcome back, Mia!' && /Old Salt/.test(w1.phone.text), `the veteran's welcome: "${w1.line}" / "${w1.sub}" / phone "${w1.phone.title}"`);
  report(w0.line === 'Welcome aboard, Zed - Deckhand!' && !w0.vet && /Deckhand/.test(w0.phone.title), `a new face's welcome: "${w0.line}" / phone "${w0.phone.title}"`);
  report(RS.notable(R(5, { fires: 31, kills: 12 }, { deeds: { overboard: 3, 'overboard-lunatic': 1 } }), 3).join('|').includes('fires out') && RS.favouriteStation(R(3, {}, { stations: { helm: 300, gun: 100 } })).kind === 'helm' && RS.favouriteStation(R(3)) === null, 'notable deeds and the favourite station read from a record');
}

// ---- (b) a record grows over two voyages ----
console.log('--- (b) a record grows over two voyages ---');
{
  wipe();
  const A = boot({ humans: [{ id: 'tokM1', name: 'Mia', pid: 'PIDMIA' }, { id: 'tokZ1', name: 'Zed', pid: 'PIDZED' }], bots: 2 });
  const { st } = A;
  const e1 = fly(A, { tokM1: { coal: 20, kills: 5, fires: 3 }, tokZ1: { holes: 4 } }, { victory: true, secs: 20 });
  const s1 = savedOf();
  const m1 = s1.crew.PIDMIA;
  report(!!m1 && m1.name === 'Mia' && m1.pid === 'PIDMIA' && m1.voyages === 1 && m1.victories === 1 && m1.stats.coal === 20 && m1.stats.kills === 5, `voyage 1: Mia's record is keyed by her phone's id (voyages ${m1 && m1.voyages}, won ${m1 && m1.victories}, coal ${m1 && m1.stats.coal}, kills ${m1 && m1.stats.kills})`);
  report(m1 && m1.stations.helm >= 15 && m1.stations.helm <= 22, `...and the seconds she spent at a station are kept (${m1 && JSON.stringify(m1.stations)}; she held the helm for ~20 s)`);
  report(Object.keys(s1.crew).sort().join() === 'PIDMIA,PIDZED' && st.titles.Mia === 'Deckhand', `two humans, two records, no bots (${Object.keys(s1.crew).join(', ')}); Mia is still a ${st.titles.Mia}`);
  atEndOfRun(A);
  // a Book moment about Mia in the second voyage: she falls overboard three times
  const e2 = (() => { A.sim.castOff(); until(A.sim, () => st.phase === 'flying', 20); step(A.sim, 120); for (let i = 0; i < 3; i++) A.sim.moments.moment('overboard-lunatic', { who: ['Mia'], data: { n: 3 } }); return null; })();
  for (let s = 0; s < 20; s++) { st.players.tokM1.lock = st.ships[0].layout.one('helm').n; step(A.sim, 60); }
  st.players.tokM1.stats = { coal: 10, kills: 7 };
  A.sim.endRun(false);
  const s2 = savedOf(), m2 = s2.crew.PIDMIA;
  report(m2.voyages === 2 && m2.victories === 1 && m2.stats.coal === 30 && m2.stats.kills === 12 && m2.stats.fires === 3 && m2.last >= m2.first, `voyage 2 adds up: ${m2.voyages} voyages, ${m2.victories} won, coal ${m2.stats.coal}, kills ${m2.stats.kills}, fires ${m2.stats.fires}`);
  report(m2.stations.helm > m1.stations.helm && m2.deeds['overboard-lunatic'] === 3, `the station seconds grow (${m1.stations.helm} -> ${m2.stations.helm}) and the Book's deeds are kept (overboard-lunatic ${m2.deeds['overboard-lunatic']})`);
  report(RS.titleFor(m2).name === "Ship's Lunatic" && st.titles.Mia === "Ship's Lunatic", `after 2 voyages the headline title is "${st.titles.Mia}"`);
  const told = A.sent.filter((x) => x.ev === 'host:ui' && x.id === 'tokM1' && x.ui && x.ui.fx && /New title/.test(x.ui.fx.toast || ''));
  report(told.length === 1 && /Ship's Lunatic/.test(told[0].ui.fx.toast) && st.runEnd.titles && st.runEnd.titles[0].name === 'Mia', `the new title is told to her phone (${told[0] && told[0].ui.fx.toast}) and kept on the run end`);
  const zed = savedOf().crew.PIDZED;
  report(zed.voyages === 2 && zed.stats.holes === 4, `Zed flew both voyages too (${zed.voyages}); a second kind of title: stoker (coal ${m2.stats.coal} of ${RO.TITLES.find((T) => T.id === 'stoker').min}) waits for more coal`);
  // a stoker: five voyages of coal
  const need = RO.TITLES.find((T) => T.id === 'stoker').min;
  const save = savedOf();
  report(RS.titleFor({ ...save.crew.PIDMIA, deeds: {}, stats: { coal: need } }).name === 'Stoker of the Year', 'the same record with enough coal would be Stoker of the Year');
  report(errors === 0, `0 simulation errors${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);
}

// ---- (c) a veteran scans in ----
console.log('--- (c) a veteran scans in ---');
let veteranSave = null;
{
  wipe();
  // The save of an Old Salt, and of a Stoker.
  const v = VY.loadVoyageSave();
  v.crew.PIDMIA = { name: 'Mia', color: '#06d6a0', species: 'fox', voyages: 9, victories: 5, first: '2026-09-01', last: '2026-10-10', stats: { kills: 10 }, pid: 'PIDMIA', stations: { helm: 100 }, deeds: {} };
  v.crew.PIDBOB = { name: 'Bob', color: '#3a86ff', species: 'bulldog', voyages: 4, victories: 1, first: '2026-09-01', last: '2026-10-10', stats: { coal: 90 }, pid: 'PIDBOB', stations: {}, deeds: {} };
  VY.saveVoyageSave(v);
  veteranSave = localStorage.getItem('airshipVoyage');
  const A = boot({ join: false });
  const { sim, st, sent } = A;
  step(sim, 30);
  report(st.phase === 'lobby' && (!st.welcomes || st.welcomes.length === 0), 'an empty lobby has no banners');
  // the phone scans in: network.js does Object.assign(player, { id, name, species, color, pid }); the sim hears of it on its next step
  A.add({ id: 'tokNEW1', name: 'Mia', pid: 'PIDMIA' }, 0);
  const n = until(sim, () => st.welcomes && st.welcomes.length > 0, 5);
  const w = st.welcomes[0];
  report(n >= 0 && n <= 120 && w && w.line === 'Mia the Old Salt returns!', `the title is on the TV lobby after ${n} sim step${n === 1 ? '' : 's'} (${(n / 60).toFixed(2)} s; the gate is 2 s): "${w && w.line}"`);
  const ui = sent.filter((x) => x.ev === 'host:ui' && x.id === 'tokNEW1' && x.ui && x.ui.welcome);
  report(ui.length === 1 && ui[0].ui.welcome.vet === true && ui[0].ui.welcome.title === 'Welcome back, Mia!' && /Old Salt - 9 voyages, 5 won/.test(ui[0].ui.welcome.text), `...and on her phone's join card: "${ui[0] && ui[0].ui.welcome.title}" / "${ui[0] && ui[0].ui.welcome.text}"`);
  A.add({ id: 'tokNEW2', name: 'Bob', pid: 'PIDBOB' }, 1);
  A.add({ id: 'tokNEW3', name: 'Zed', pid: 'PIDNEWBIE' }, 2);
  step(sim, 5);
  const lines = st.welcomes.map((x) => x.line);
  report(lines.includes('Bob the Stoker of the Year returns!') && lines.includes('Welcome aboard, Zed - Deckhand!'), `a stoker is welcomed by his title and a new face as a Deckhand: ${lines.join(' | ')}`);
  const zui = sent.find((x) => x.ev === 'host:ui' && x.id === 'tokNEW3' && x.ui && x.ui.welcome);
  report(zui && zui.ui.welcome.vet === false && /Deckhand/.test(zui.ui.welcome.title), `the new face's phone card says "${zui && zui.ui.welcome.title}"`);
  report(st.titles.Mia === 'Old Salt' && st.titles.Bob === 'Stoker of the Year' && st.titles.Zed === 'Deckhand', `state.titles has the headline of each human (the scorecard reads it): ${JSON.stringify(st.titles)}`);
  // the TV draws it
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const cam = createWorldCamera();
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); }
  const pxOf = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(t.font || ''); return m ? +m[1] : 99; };
  const banner = rec.texts.filter((t) => t.s === 'Mia the Old Salt returns!' || t.s === 'Bob the Stoker of the Year returns!' || t.s === 'Welcome aboard, Zed - Deckhand!' || /voyages, \d+ won|first voyage on this TV/.test(t.s));
  report(exc === 0 && banner.length === 6 && banner.every((t) => pxOf(t) >= 22), `the lobby draws the banners (${banner.length} texts), none under 22 px`);
  // they go after SECS seconds
  step(sim, Math.round((RO.WELCOME.SECS + 1) * 60));
  report(st.welcomes.length === 0, `the banners are gone after ${RO.WELCOME.SECS} s`);
  report(errors === 0, `0 simulation errors${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);
}

// ---- (d) identity ----
console.log('--- (d) identity ---');
{
  localStorage.setItem('airshipVoyage', veteranSave);
  const A = boot({ join: false });
  const { sim, st, sent } = A;
  const p = A.add({ id: 'tokR', name: 'Mia', pid: 'PIDMIA' }, 0);
  step(sim, 5);
  const first = sent.filter((x) => x.ev === 'host:ui' && x.ui && x.ui.welcome).length;
  // a reconnect: network.js player:left then player:joined for the same token = the same object, assigned again
  p.connected = false; step(sim, 30);
  Object.assign(p, { id: 'tokR', name: 'Mia', pid: 'PIDMIA', connected: true, uk: null }); step(sim, 30);
  report(first === 1 && sent.filter((x) => x.ev === 'host:ui' && x.ui && x.ui.welcome).length === 1 && st.welcomes.length === 1, 'a reconnect (same token, same player) is not welcomed again');
  p.stats = { coal: 5 };
  fly(A, {}, { victory: true, secs: 3 });
  const s1 = savedOf();
  report(Object.keys(s1.crew).length === 2 && s1.crew.PIDMIA.voyages === 10 && s1.crew.PIDMIA.stats.coal === 5, `a reconnect keeps the identity: one record, now ${s1.crew.PIDMIA.voyages} voyages (no second Mia)`);
  // a new TV session (a new room, a new token): the phone's own id finds her
  const B = boot({ join: false });
  B.add({ id: 'tokOTHER', name: 'Mia', pid: 'PIDMIA' }, 0);
  step(B.sim, 3);
  report(B.st.welcomes.length === 1 && B.st.welcomes[0].line === 'Mia the Old Salt returns!' && B.st.welcomes[0].sub.startsWith('10 voyages'), `a new TV session under a new token knows the same phone: "${B.st.welcomes[0] && B.st.welcomes[0].line}" (${B.st.welcomes[0] && B.st.welcomes[0].sub})`);
  // a changed name follows the id
  B.st.players.tokOTHER.name = 'Mimi';
  step(B.sim, 70);
  report(B.st.titles.Mimi === 'Old Salt', 'she types another name: the same phone, the same title');
  fly(B, {}, { victory: false, secs: 2 });
  const s2 = savedOf();
  report(Object.keys(s2.crew).length === 2 && s2.crew.PIDMIA.name === 'Mimi' && s2.crew.PIDMIA.voyages === 11 && s2.crew.PIDMIA.victories === 6, `...and the record takes the new name (${s2.crew.PIDMIA.name}, ${s2.crew.PIDMIA.voyages} voyages), still one record`);
  // another phone with the same name is another record
  const C = boot({ join: false });
  C.add({ id: 'tokX', name: 'Mimi', pid: 'PIDOTHERMIMI' }, 0);
  step(C.sim, 3);
  report(C.st.welcomes[0].line === 'Welcome aboard, Mimi - Deckhand!', 'another phone with the same name is a new face (a Deckhand), not the veteran');
  fly(C, {}, { victory: true, secs: 2 });
  report(Object.keys(savedOf().crew).length === 3, 'and gets a record of its own');
  // an L2 save: crew by NAME, no ids
  wipe();
  const l2 = { version: 3, bestStops: 3, bestSalvage: 100, totalRuns: 5, victories: 1, unlocks: [], ship: null, book: [], fleet: [], crew: { Ola: { name: 'Ola', color: '#f1c40f', species: 'frog', voyages: 4, victories: 2, first: '2026-10-01', last: '2026-10-09', stats: { coal: 70 } } } };
  localStorage.setItem('airshipVoyage', JSON.stringify(l2));
  const D = boot({ join: false });
  D.add({ id: 'tokO', name: 'Ola', pid: 'PIDOLA' }, 0);
  step(D.sim, 3);
  report(D.st.welcomes[0].line === 'Ola the Stoker of the Year returns!', `an L2 record (by name, no ids) welcomes the first phone that types that name: "${D.st.welcomes[0].line}"`);
  fly(D, {}, { victory: true, secs: 2 });
  const s3 = savedOf();
  report(Object.keys(s3.crew).length === 1 && Object.values(s3.crew)[0].pid === 'PIDOLA' && Object.values(s3.crew)[0].voyages === 5, `...and claims it (one record, now with her phone's id, 5 voyages)`);
  // a human with no id (a tool, an old phone): the name is the key, as in L2
  wipe();
  const E = boot({ humans: [{ id: 'h0', name: 'Pat' }] });
  fly(E, { h0: { kills: 3 } }, { victory: true, secs: 2 });
  report(savedOf().crew.Pat && savedOf().crew.Pat.voyages === 1 && savedOf().crew.Pat.pid === '', 'a phone with no id is kept by its name (as in L2)');
  report(errors === 0, `0 simulation errors${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);
}

// ---- (e) no bots ----
console.log('--- (e) no bots ---');
{
  wipe();
  const A = boot({ humans: [{ id: 'tokH', name: 'Mia', pid: 'PIDMIA' }], bots: 4 });
  const { st, sent } = A;
  A.st.players.mate1 = { id: 'mate1', mate: true, bot: true, name: 'Mate', species: 'fox', color: '#fff', x: 0, y: 0, jx: 0, jy: 0, connected: true };
  step(A.sim, 30);
  const named = st.welcomes.map((w) => w.name);
  report(named.join() === 'Mia' && Object.keys(st.titles).join() === 'Mia' && !sent.some((x) => x.id && /^bot|^mate/.test(x.id) && x.ui && x.ui.welcome), 'bots and a ship\'s mate get no welcome, no title and no phone message');
  fly(A, { tokH: { kills: 4 }, bot0: { kills: 40 } }, { victory: true, secs: 3 });
  const crew = savedOf().crew;
  report(Object.keys(crew).join() === 'PIDMIA' && !JSON.stringify(crew).includes('Bot') && !JSON.stringify(crew).includes('Mate'), 'only the human has a record after the voyage');
  const bots = boot({ humans: [], bots: 6 });
  step(bots.sim, 60);
  report(Object.keys(bots.st.titles || {}).length === 0 && (bots.st.welcomes || []).length === 0, 'a crew of bots only: nothing in state.titles or state.welcomes');
}

// ---- (f) the save ----
console.log('--- (f) the save: round-trip and migration ---');
{
  wipe();
  const fx = (f) => fs.readFileSync(path.join(root, 'tools', 'fixtures', f), 'utf8').trim();
  const l2 = { version: 3, bestStops: 3, bestSalvage: 100, totalRuns: 5, victories: 1, unlocks: ['flagship-medal'], futureThing: { x: 1 }, ship: null, book: [], fleet: [], crew: { Ola: { name: 'Ola', color: '#f1c40f', species: 'frog', voyages: 4, victories: 2, first: '2026-10-01', last: '2026-10-09', stats: { coal: 70 }, ship: 'The Brass Heron' }, Bea: { name: 'Bea', voyages: 1 } } };
  localStorage.setItem('airshipVoyage', JSON.stringify(l2));
  const v = VY.loadVoyageSave();
  report(v.version === 3 && v.futureThing.x === 1 && v.crew.Ola.pid === '' && JSON.stringify(v.crew.Ola.stations) === '{}' && JSON.stringify(v.crew.Ola.deeds) === '{}' && v.crew.Ola.stats.coal === 70 && v.crew.Ola.ship === 'The Brass Heron' && v.crew.Bea.voyages === 1, 'an L2 save loads: the old crew fields are intact, pid / stations / deeds are added empty, unknown fields kept');
  VY.saveVoyageSave(v);
  const back = VY.loadVoyageSave();
  report(JSON.stringify(back) === JSON.stringify(v), 'saved and loaded again it is the same');
  // a record with the new fields round-trips, damage in them is mended
  v.crew.Ola.pid = 'PIDOLA'; v.crew.Ola.stations = { helm: 300.5, gun: 20 }; v.crew.Ola.deeds = { overboard: 2 };
  VY.saveVoyageSave(v);
  const w = VY.loadVoyageSave();
  report(JSON.stringify(w) === JSON.stringify(v) && w.crew.Ola.stations.helm === 300.5, 'a roster record round-trips unchanged');
  l2.crew.Ola.stations = { helm: 'x', gun: -4, bay: 12 }; l2.crew.Ola.deeds = [1, 2]; l2.crew.Ola.pid = 7;
  localStorage.setItem('airshipVoyage', JSON.stringify(l2));
  const m = VY.loadVoyageSave();
  report(JSON.stringify(m.crew.Ola.stations) === '{"bay":12}' && JSON.stringify(m.crew.Ola.deeds) === '{}' && m.crew.Ola.pid === '', 'odd stations, deeds and ids are mended, never thrown on');
  for (const [f, ver] of [['save-v1.json', 1], ['save-v2.json', 2]]) {
    wipe();
    localStorage.setItem('airshipVoyage', fx(f));
    const x = VY.loadVoyageSave();
    report(x.version === 3 && Object.keys(x.crew).length === 0 && BK.pageCount(x) === 1, `${f} (v${ver}) still loads as v3 with an empty roster (the book has ${BK.pageCount(x)} page)`);
  }
  const some = { crew: { a: { name: 'a' } }, book: [1, 2, 3] };
  report(BK.pageCount(some) === 5 && BK.crewPage(some) && BK.pageCount({ crew: {}, book: [1] }) === 2 && BK.pageCount(null) === 1, 'the book\'s pages: the cover, the roster once anybody has flown, a postcard for each voyage');
  wipe();
}

// ---- (g) the TV draws ----
console.log('--- (g) the TV draws the roster ---');
{
  const MIN = 22;
  const ctx = stubCtx();
  const book = createLogbook({ ctx });
  const logArt = createLogArt({ ctx, book, crewAt: () => {} });
  const art = createBookArt({ ctx, book, logArt, dots: () => {} });
  const pxOf = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(t.font || ''); return m ? +m[1] : 99; };
  const g0 = () => (globalThis.gameErrors || []).length;
  const check = (what, fn, need) => {
    rec.texts.length = 0;
    const e0 = g0();
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    const small = rec.texts.filter((t) => pxOf(t) < MIN - 0.01 && t.s.trim());
    const t = rec.texts.map((x) => x.s);
    report(!threw && g0() === e0 && need(t) && small.length === 0, `${what}: draws with 0 errors, ${rec.texts.length} texts, none under ${MIN} px${small[0] ? ' - e.g. "' + small[0].s + '" at ' + pxOf(small[0]) : ''}${threw ? ' - threw ' + threw.message : ''}`);
  };
  const names = ['Mia', 'Zed', 'Ola', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay', 'Gus', 'Hal'];
  const crew = Object.fromEntries(names.map((n, i) => [n + i, { name: n === 'Mia' ? 'Mia-Rose-Annabel' : n, color: COLORS[i % COLORS.length], voyages: 12 - i, victories: i, last: '2026-10-1' + (i % 9), stats: { coal: 20 * (i + 1), fires: 3 * i, kills: 40 * i, revives: i }, pid: 'P' + i, stations: i % 2 ? { helm: 600, gun: 100 } : { gun: 900, coal: 50 }, deeds: { overboard: i, 'overboard-lunatic': i % 3 } }]));
  const save = { ship: BK.newShip('The Brass Heron', '2026-10-01'), book: [], fleet: [], crew };
  save.book = [{ no: 1, shipName: 'The Brass Heron', ship: 'The Brass Heron', date: '2026-10-03', victory: true, modeLabel: 'VOYAGE', voyages: 1, voyageNo: 1, done: 3, total: 6, salvage: 100, kills: 3, gunships: 0, route: [{ no: 1, name: 'Sky Isles', icon: 'x', env: 'skyisles', end: 'done' }], lines: [{ no: 1, name: 'Sky Isles', first: true, text: 'Mia put out a fire.', kind: 'x', who: ['Mia'] }], rows: [], colors: { Mia: '#06d6a0' } }];
  check('the crew roster page (10 crew, one with a long name)', () => art.page({ page: 1 }, save), (t) => t.includes('THE CREW ROSTER') && t.some((s) => /Stoker of the Year|Gun Captain|Helmsman|Old Salt/.test(s)) && t.some((s) => /Page 2 of 3/.test(s)) && t.some((s) => /likes the (helm|guns)/.test(s)));
  check('the cover (with titles beside the crew)', () => art.page({ page: 0 }, save), (t) => t.some((s) => /Old Salt - 12 voyages/.test(s) || /- 1[0-2] voyages/.test(s)));
  check('the voyage page (after the roster)', () => art.page({ page: 2 }, save), (t) => t.some((s) => /THE LOG OF /.test(s)) && t.some((s) => /Page 3 of 3/.test(s)));
  check('the lobby banners (four at once, a long title)', () => art.welcomes([{ line: 'Mia the Stoker of the Year returns!', sub: '12 voyages, 7 won', color: '#06d6a0' }, { line: "Bob the Ship's Lunatic returns!", sub: '4 voyages, 1 won', color: '#3a86ff' }, { line: 'Welcome aboard, Zed - Deckhand!', sub: 'first voyage on this TV', color: '#f1c40f' }, { line: 'Ola the Old Salt returns!', sub: '9 voyages, 2 won', color: '#8338ec' }], 470, 226), (t) => t.length === 8);
  // the scorecard with titles, through the real renderer
  wipe();
  const A = boot({ humans: [{ id: 'tokM', name: 'Mia', pid: 'PIDMIA' }, { id: 'tokZ', name: 'Zed', pid: 'PIDZED' }], bots: 2 });
  const { st } = A;
  st.titles = { Mia: 'Stoker of the Year', Zed: 'Deckhand' };
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const cam = createWorldCamera();
  st.scorecard = { stopName: 'Ember Forge', rows: [{ icon: 'x', title: 'Stoker', name: 'Mia', color: '#06d6a0', value: 9, unit: 'coal loads' }, { icon: 'y', title: 'Ace Gunner', name: 'Zed', color: '#3a86ff', value: 12, unit: 'shot down' }, { icon: 'z', title: 'Medic', name: 'Bot1', color: '#f1c40f', value: 2, unit: 'revives' }], gain: {}, gained: 0, total: 0, t: 5 };
  rec.texts.length = 0;
  let exc = 0;
  try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); }
  const tt = rec.texts.filter((t) => t.s === 'Stoker of the Year' || t.s === 'Deckhand');
  const titleMia = rec.texts.find((t) => t.s === 'Stoker of the Year'), mia = rec.texts.filter((t) => t.s === 'Mia' && t.kind === 'fillText' && titleMia && titleMia.y - t.y > 0 && titleMia.y - t.y < 60)[0]; // (the award row's name)
  report(exc === 0 && tt.length === 2 && tt.every((t) => pxOf(t) >= 22) && mia && titleMia && titleMia.y > mia.y && titleMia.y - mia.y < 40 && !rec.texts.some((t) => t.s === 'Bot1' && false), `the scorecard prints each human's title under his name (Mia y ${mia && mia.y}, title y ${titleMia && titleMia.y}), none under 22 px; the bot has none`);
  report(!rec.texts.some((t) => ['Deckhand'].includes(t.s) && Math.abs(t.y - (rec.texts.find((q) => q.s === 'Bot1') || { y: -999 }).y) < 30), 'no title under a bot\'s name');
  report(errors === 0 && exc === 0, `0 draw errors, 0 sim errors (${exc} / ${errors})${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);
  wipe();
}

// ---- (h) the Book off ----
console.log('--- (h) the Book off changes nothing ---');
{
  wipe();
  config.BOOK.ENABLED = false;
  const A = boot({ humans: [{ id: 'tokM', name: 'Mia', pid: 'PIDMIA' }], bots: 2 });
  step(A.sim, 120);
  const off = !A.st.welcomes && !A.st.titles && A.sent.every((x) => !(x.ui && x.ui.welcome));
  config.BOOK.ENABLED = true;
  report(off, 'with the Book off there is no welcome, no title map and no phone message');
  const run = (env) => spawnSync(process.execPath, [path.join(root, 'tools', 'botsim.mjs'), '--minutes', quick ? '1' : '2', '--seed', '2', '--difficulty', 'normal'], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env } });
  const a = run({ BOOK_ON: '1' }), b = run({});
  const strip = (s) => (s || '').split('\n').filter((l) => !/^\s*(time|elapsed|wall|real time)/i.test(l)).join('\n');
  report(a.status === 0 && b.status === 0 && strip(a.stdout) === strip(b.stdout) && /errors: 0/.test(a.stdout), `botsim ${quick ? 1 : 2} min, seed 2: the same output with the Book on and off (0 errors)`);
  wipe();
}

report(errors === 0, `0 simulation errors overall${firstErrors.length ? ': ' + firstErrors[0] : ''}`);
console.log(ok ? '\nAll Ship\'s Book L3 (crew roster) checks passed.' : '\nSome Ship\'s Book L3 (crew roster) checks FAILED.');
process.exit(ok ? 0 : 1);
