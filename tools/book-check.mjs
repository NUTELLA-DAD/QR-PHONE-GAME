// THE SHIP'S BOOK gate, L2 (SHIPS_BOOK.md; public/modules/host/book.js, christen.js, bookArt.js, voyage.js save v3; config.BOOK). Headless, no browser.
//   node tools/buildsim.mjs --check-book        or directly:   node tools/book-check.mjs [--seed 1] [--quick]
//
//   (a) THE CHRISTENING: the first CAST OFF of an unnamed ship with a human aboard opens a NAME vote (five names and "Name her later"), the names are deterministic, short, never twice and never a lost ship's;
//       the phones vote (the human's pick wins alone; bots vote too), the name goes into the save, a ceremony follows and the ship casts off, all inside 20 s; CAST OFF again skips the vote or the ceremony;
//       a crew of bots never christens (unless host.html?christen=1), ?christen=0, Versus and NO_BOOK2=1 never do; a named ship is not asked again
//   (b) THE NAME EVERYWHERE: the Log's sentences, the postcard's heading, the scorecard, the lobby, the HUD plate; the NAMED templates fill clean
//   (c) A VOYAGE'S PAGE: endRun writes a page (the postcard's data), the humans' crew records (no bots), a victory keeps the ship (her tallies move on), a lost ship goes to the fleet and the next one is christened fresh
//   (d) SAVE v3: round-trip, migration from the v1 and v2 fixtures (nothing lost, the old text kept aside), a corrupt save kept aside, odd entries dropped, unknown fields kept, the caps
//   (e) THE TV DRAWS: the vote, the ceremony (every key), the plate, the lobby card, the book's cover (empty and full) and every page: 0 errors, no text under config.BOOK.ART.MIN_PX
//   (f) THE BOOK CHANGES NOTHING: botsim with BOOK_ON=1 and without prints the same, and a crew of bots flies the same seconds
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

process.env.BOOK_ON = '1'; // (the Book is off in a Node tool unless asked for: config.BOOK.ENABLED)
delete process.env.NO_BOOK2;
installShims();
let clock = seedRandom(seed);

// ---- a stub canvas (as tools/log-check.mjs): a transform stack and a record of the text it was asked for ----
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
const LW = await load('modules/host/logWriter.js');
const BK = await load('modules/host/book.js');
const VY = await load('modules/host/voyage.js');
const { createLogbook } = await load('modules/host/logbookArt.js');
const { createLogArt } = await load('modules/host/logArt.js');
const { createBookArt } = await load('modules/host/bookArt.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');

const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
  }
};
const until = (sim, cond, maxSec) => { let n = 0; for (; n < maxSec * 60 && !cond(); n++) step(sim); return cond() ? n / 60 : -1; }; // (seconds it took, -1 = never)
const KEYS = ['airshipVoyage', 'airshipVoyage.v1', 'airshipVoyage.v2', 'airshipVoyage.bad', 'airshipMode'];
const wipe = () => { for (const k of KEYS) localStorage.removeItem(k); };

// A sim at the mast: `humans` phones (named, bot:false) and `bots` bots aboard, not cast off yet.
function boot({ humans = 1, bots = 3, mode = null, seed: sd = seed } = {}) {
  clock = seedRandom(sd);
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = null;
  config.ESCORT.AUTO_PATROL = false;
  config.SCRAP.ENABLED = false;
  const sim = createSimulation();
  const st = sim.state;
  if (mode) st.christenMode = mode;
  const e = st.ships[0].layout.boarderEntryPoints;
  const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
  const who = ['Mia', 'Zed', 'Ola'];
  for (let i = 0; i < humans + bots; i++) {
    const human = i < humans, id = human ? 'h' + i : 'bot' + i;
    st.players[id] = { id, bot: !human, human, name: human ? who[i] : 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  step(sim, 2);
  return { sim, st };
}
const savedOf = () => JSON.parse(localStorage.getItem('airshipVoyage') || 'null');
const optionNames = (st) => st.vote.options.filter((o) => o.kind === 'name').map((o) => o.name);

// ---- (a) the christening ----
console.log('--- (a) the christening ---');
let theName = '';
{
  wipe();
  const A = boot({ humans: 1, bots: 0 });
  const { sim, st } = A;
  report(st.shipName === null && st.phase === 'lobby' && !!st.save && st.save.version === 3 && st.save.ship === null, 'a fresh TV: the ship has no name, the save is v3 with no ship');
  sim.castOff();
  const v = st.vote;
  report(!!v && v.kind === 'name' && st.phase === 'lobby', `the first CAST OFF with a human aboard opens the NAME vote and the ship stays moored (vote: ${v && v.kind}, phase ${st.phase})`);
  const names = v ? optionNames(st) : [];
  report(v && v.options.length === config.BOOK.CHRISTEN.OPTIONS + 1 && v.options[v.options.length - 1].kind === 'skip' && names.length === config.BOOK.CHRISTEN.OPTIONS, `${config.BOOK.CHRISTEN.OPTIONS} names and "Name her later": ${names.join(' | ')}`);
  report(new Set(names.map((n) => n.toLowerCase())).size === names.length && names.every((n) => n.length >= 5 && n.length <= config.BOOK.NAME_MAX && /^[A-Za-z0-9' \-]+$/.test(n)), `every name is different, 5 to ${config.BOOK.NAME_MAX} letters, plain characters only`);
  // the same TV on the same day offers the same names; another day, other names; a lost ship's name is not offered again
  const again = BK.shipNames(st.save, 5, VY.dateKey()), other = BK.shipNames(st.save, 5, '2031-01-01');
  report(JSON.stringify(again) === JSON.stringify(names) && JSON.stringify(other) !== JSON.stringify(names), 'the names are deterministic (same book, same day: the same five; another day: others)');
  const fleetSave = { fleet: names.map((n) => ({ name: n })), totalRuns: 0, book: [] };
  const fresh = BK.shipNames(fleetSave, 5, VY.dateKey());
  report(fresh.every((n) => !names.includes(n)), 'the names of ships she followed are not offered again');
  let manyOk = true;
  for (let d = 1; d <= 120 && manyOk; d++) { const l = BK.shipNames({ fleet: [], totalRuns: d, book: [] }, 5, '2030-01-' + d); manyOk = l.length === 5 && new Set(l).size === 5 && l.every((n) => n.length <= config.BOOK.NAME_MAX && n.length >= 5 && !/undefined/.test(n)); }
  report(manyOk, 'a hundred and twenty other days: always five different, short, clean names');
  const pick = 2;
  st.players.h0.vote = pick;
  const t0 = clock.ms;
  const toName = until(sim, () => !!st.christen, 20);
  theName = st.shipName;
  report(toName >= 0 && toName < 3 && theName === names[pick], `the human's pick wins: "${theName}" (vote ${toName.toFixed(1)} s: everyone voted, so it closes after ${config.BOOK.CHRISTEN.ALL_VOTED_WAIT} s)`);
  const sv = savedOf();
  report(!!sv && sv.version === 3 && sv.ship && sv.ship.name === theName && sv.ship.voyages === 0, `the name is in the save at once (airshipVoyage.ship = ${sv && sv.ship && sv.ship.name})`);
  report(!!st.christen && st.christen.name === theName && st.phase === 'lobby' && !st.vote, 'the ceremony runs on the moored ship (state.christen, the vote closed)');
  step(sim, Math.round((config.BOOK.CHRISTEN.BREAK_AT + 0.2) * 60));
  report(st.sfxQ.some((q) => q[0] === 'glass') && st.christen.broke, 'the bottle breaks on cue (the "glass" sound is asked for)');
  const toFly = until(sim, () => st.phase === 'flying', 20);
  const total = (clock.ms - t0) / 1000;
  report(toFly >= 0 && st.christen === null && total < 20, `the ceremony ends and she casts off: vote + ceremony took ${total.toFixed(1)} s (under 20 s)`);
  // a named ship is not asked again
  sim.restart();
  step(sim, 5);
  sim.castOff();
  report(st.shipName === theName && !st.vote && !st.christen && st.phase === 'flying', 'the next voyage: she keeps her name, CAST OFF flies at once');
}
{ // a new TV session: the name is read back from the save
  const sim2 = boot({ humans: 1, bots: 0 }).sim;
  report(sim2.state.shipName === theName, `a new session (page reload) reads her name back from the save: "${sim2.state.shipName}"`);
}
{ // skipping
  wipe();
  let A = boot({ humans: 1, bots: 2 });
  A.sim.castOff();
  const open = A.st.vote && A.st.vote.kind === 'name';
  A.sim.castOff(); // (CAST OFF again)
  step(A.sim, 3);
  report(open && A.st.phase === 'flying' && A.st.shipName === null && !A.st.vote && !A.st.christen && !(savedOf() && savedOf().ship), 'CAST OFF again during the vote skips it: she casts off unnamed and nothing is saved');
  A.sim.restart(); step(A.sim, 3); A.sim.castOff();
  report(!!A.st.vote && A.st.vote.kind === 'name', '...and the next voyage asks again');
  wipe();
  A = boot({ humans: 1, bots: 0 });
  A.sim.castOff();
  const skipIdx = A.st.vote.options.findIndex((o) => o.kind === 'skip');
  A.st.players.h0.vote = skipIdx;
  const t = until(A.sim, () => A.st.phase === 'flying', 20);
  report(t >= 0 && A.st.shipName === null && !A.st.christen, 'the "Name her later" card does the same');
  wipe();
  A = boot({ humans: 1, bots: 0 });
  A.sim.castOff();
  A.st.players.h0.vote = 0;
  until(A.sim, () => !!A.st.christen, 20);
  A.sim.castOff(); // (during the ceremony)
  step(A.sim, 3);
  report(A.st.phase === 'flying' && !!A.st.shipName && A.st.christen === null, 'CAST OFF during the ceremony skips the rest of it: she keeps her new name');
  wipe();
  A = boot({ humans: 1, bots: 0 });
  A.sim.castOff();
  const gone = until(A.sim, () => A.st.christen || A.st.phase === 'flying', 20);
  report(gone > 13 && gone < 15 && A.st.shipName === A.st.save.ship.name && !!A.st.shipName, `nobody votes: the first name is taken after ${gone.toFixed(1)} s (the vote's ${config.BOOK.CHRISTEN.VOTE_TIME} s)`);
}
{ // who christens
  wipe();
  let A = boot({ humans: 0, bots: 4 });
  A.sim.castOff();
  report(A.st.phase === 'flying' && !A.st.vote && A.st.shipName === null, 'a crew of bots only never christens (tools and solo tests fly at once)');
  wipe();
  A = boot({ humans: 0, bots: 4, mode: 'always' });
  A.sim.castOff();
  const open = !!A.st.vote && A.st.vote.kind === 'name';
  const t = until(A.sim, () => !!A.st.christen, 20);
  report(open && t >= 0 && t < 10 && !!A.st.shipName && optionNames({ vote: { options: [] } }).length === 0, `host.html?christen=1: even bots christen her - they vote, and "${A.st.shipName}" wins after ${t.toFixed(1)} s`);
  wipe();
  A = boot({ humans: 1, bots: 2, mode: 'off' });
  A.sim.castOff();
  report(A.st.phase === 'flying' && !A.st.vote, 'host.html?christen=0 never christens, with a human aboard too');
  wipe();
  A = boot({ humans: 1, bots: 2 });
  config.BOOK.ENABLED = false;
  A.sim.castOff();
  config.BOOK.ENABLED = true;
  report(A.st.phase === 'flying' && !A.st.vote && A.st.shipName === null, 'config.BOOK.ENABLED false: no vote');
  const enabledIn = (env) => { const e = { ...process.env }; delete e.BOOK_ON; delete e.NO_BOOK2; return spawnSync(process.execPath, ['--input-type=module', '-e', `const { config } = await import(${JSON.stringify(pathToFileURL(path.join(publicDir, 'config.js')).href)}); console.log(config.BOOK.ENABLED);`], { encoding: 'utf8', env: { ...e, ...env } }).stdout.trim(); };
  const sw = { plain: enabledIn({}), on: enabledIn({ BOOK_ON: '1' }), off: enabledIn({ BOOK_ON: '1', NO_BOOK2: '1' }) };
  report(sw.plain === 'false' && sw.on === 'true' && sw.off === 'false', `the switch: a Node tool has the Book off (${sw.plain}), BOOK_ON=1 turns it on (${sw.on}), NO_BOOK2=1 off again (${sw.off}); the browser has it on (no process)`);
  wipe();
  A = boot({ humans: 1, bots: 0 });
  A.sim.setSession('versus');
  A.sim.castOff();
  report(!A.st.vote || A.st.vote.kind !== 'name', 'Versus never christens');
  config.PVP.ENABLED = false; // (the match has begun: the sim is thrown away, the switch is put back)
  wipe();
}
report(errors === 0, `0 simulation errors in the christening runs${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);

// ---- (b) the name everywhere ----
console.log('--- (b) the name everywhere ---');
const NAME = 'The Brass Heron';
{
  const T = LW.TEMPLATES;
  report(!!T.NAMED && Object.keys(T.NAMED).length >= 5 && Object.values(T.NAMED).every((l) => l.length === 3 && l.every((s) => /\{ship\}/.test(s) && /\{who1?\}|\{stop\}/.test(s))), `${Object.keys(T.NAMED).length} lines have named variants (3 each), each says {ship} and names the crewman`);
  let bad = 0, total = 0, withName = 0;
  const datas = [{ n: 0 }, {}, { names: [undefined, 'Aft Gun Deck'] }, { n: 2, name: 'IRON WIDOW', names: ['Tail Gun', 'Bay'] }];
  for (const ship of [NAME, 'Lady Marmalade', "Thistlewick's Folly", 'The Teapot of Larkhill']) for (const kind of Object.keys(T.NAMED)) for (const data of datas) for (const who of [['Zed'], ['Zed', 'Mia'], []]) {
    const m = { n: 1, t: 1, stop: 3, stopName: 'Ember Forge', env: 'ember', kind, who, where: 'Boiler Room', weight: 3, data: { ...data, crew: [] } };
    const text = LW.sentence(m, { used: new Set(), ship }) || '';
    total++;
    if (!text || /undefined|NaN|null|[{}]|\[object/.test(text)) bad++;
    if (text.includes(ship.replace(/^The /, '')) || text.includes(ship)) withName++;
  }
  report(bad === 0 && withName === total, `the named sentences fill clean for odd data and four kinds of name (${total} fills, ${withName} say her name, ${bad} bad)`);
  const plain = LW.sentence({ n: 1, t: 1, stop: 3, stopName: 'X', kind: 'quiet', who: ['Zed'], weight: 1, data: {} }, { used: new Set() });
  const named = LW.sentence({ n: 1, t: 1, stop: 3, stopName: 'X', kind: 'quiet', who: ['Zed'], weight: 1, data: {} }, { used: new Set(), ship: NAME });
  report(!/Heron/.test(plain) && /Brass Heron/.test(named) && /^[A-Z]/.test(named), `with no name the Log reads as before ("${plain}"); with one it says her name ("${named}")`);
  const entry = LW.writeStop([], { no: 2, name: 'Sky Isles' }, { used: new Set(), players: [{ name: 'Mia', stats: { holes: 1 } }], ship: NAME });
  report(/Brass Heron/.test(entry.text) && /Mia/.test(entry.text), `a quiet stop's dock line names her: "${entry.text}"`);
  const lost = LW.sentence({ n: 1, t: 1, stop: 3, stopName: 'Ember Forge', kind: 'ship-lost', who: ['Mia'], weight: 9, data: {} }, { used: new Set(), ship: NAME });
  report(/Brass Heron/.test(lost) && /Mia/.test(lost) && /Ember Forge/.test(lost), `the last line of a lost ship: "${lost}"`);
}
{ // the run end, on the TV and in the save
  wipe();
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const A = boot({ humans: 2, bots: 3 });
  const { sim, st } = A;
  sim.castOff();
  st.players.h0.vote = 1; st.players.h1.vote = 1;
  until(sim, () => st.phase === 'flying', 20);
  const name = st.shipName;
  report(!!name, `christened for the run: "${name}"`);
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const cam = createWorldCamera();
  let exc = 0;
  const draw = (n = 2) => { for (let f = 0; f < n; f++) { rec.texts.length = 0; try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); } } };
  step(sim, 60 * 20);
  draw();
  report(exc === 0 && rec.texts.some((t) => t.s === name.toUpperCase()), `in flight the HUD wears her name plate ("${name.toUpperCase()}")`);
  st.scorecard = { stopName: 'Ember Forge', rows: [], gain: {}, gained: 0, total: 0, t: 5, gentle: 'A quiet one.' };
  draw();
  report(exc === 0 && rec.texts.some((t) => t.s === name.toUpperCase()) && rec.texts.some((t) => /Ember Forge cleared/.test(t.s)), 'the scorecard has her name over its title');
  st.scorecard = null;
  sim.closeStop('done');
  sim.endRun(true);
  const e = st.runEnd;
  draw();
  const heading = 'THE LOG OF ' + name.toUpperCase();
  report(!!e && e.shipName === name && rec.texts.some((t) => t.s === heading), `the postcard's heading reads "${heading}"`);
  const sv = savedOf();
  report(!!sv && sv.book.length === 1 && sv.book[0].ship === name && sv.book[0].victory === true && sv.book[0].lines.length >= 1 && sv.book[0].route.length >= 1 && sv.book[0].date === VY.dateKey(), `the voyage's page is in the book: ship, date, ${sv && sv.book[0].lines.length} Log lines, ${sv && sv.book[0].route.length} stops on the route`);
  report(sv.ship.name === name && sv.ship.voyages === 1 && sv.ship.victories === 1 && st.shipName === name && sv.fleet.length === 0, `a victory keeps her: ${sv.ship.voyages} voyage, ${sv.ship.victories} won, still "${st.shipName}"`);
  const crew = Object.keys(sv.crew);
  report(crew.includes('Mia') && crew.includes('Zed') && crew.every((k) => !/^Bot/.test(k)) && sv.crew.Mia.voyages === 1 && sv.crew.Mia.victories === 1 && sv.crew.Mia.ship === name, `the crew's records are the humans' only: ${crew.join(', ')} (no bots)`);
  // the next voyage: she is lost
  sim.restart();
  step(sim, 5);
  sim.castOff();
  step(sim, 60 * 30);
  st.run.spares = 0;
  st.ships[0].sim.wreck('SHE CRASHED INTO THE GROUND!');
  step(sim, 60 * 4);
  const e2 = st.runEnd;
  draw();
  const sv2 = savedOf();
  report(!!e2 && !e2.victory && e2.shipName === name && st.shipName === null && sv2.ship === null && sv2.fleet.length === 1 && sv2.fleet[0].name === name && sv2.fleet[0].voyages === 2, `a lost ship goes into the fleet ("${sv2 && sv2.fleet[0] && sv2.fleet[0].name}", ${sv2 && sv2.fleet[0] && sv2.fleet[0].voyages} voyages) and the TV is unnamed again`);
  report(sv2.book.length === 2 && sv2.book[1].victory === false && sv2.crew.Mia.voyages === 2 && sv2.crew.Mia.victories === 1, `her last page is in the book (${sv2.book.length} pages), Mia has flown ${sv2.crew.Mia.voyages} voyages and won ${sv2.crew.Mia.victories}`);
  report(rec.texts.some((t) => t.s === heading) && rec.texts.some((t) => /SHIP LOST/.test(t.s)), 'the lost ship\'s postcard still carries her name');
  sim.restart();
  step(sim, 5);
  sim.castOff();
  const asks = !!st.vote && st.vote.kind === 'name';
  const second = optionNames(st);
  report(asks && !second.includes(name), `the next ship is christened fresh (the vote opens again, and "${name}" is not on it)`);
  report(exc === 0 && errors === 0, `0 draw errors, 0 sim errors (${exc} / ${errors})${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);
  // the lobby: the book is the first thing you see
  const L = boot({ humans: 1, bots: 0 });
  const r2 = createRenderer({ ctx: stubCtx(), state: L.st, canvas });
  const c2 = createWorldCamera();
  rec.texts.length = 0;
  try { r2.renderFrame(clock.ms, c2.update(1 / 60, L.st, canvas.width, canvas.height)); } catch (x) { exc++; console.log('  draw error: ' + x.stack); }
  const ls = rec.texts.map((t) => t.s);
  report(exc === 0 && ls.includes("THE SHIP'S BOOK") && ls.some((s) => /christen/i.test(s) || /Not christened/.test(s)) && ls.some((s) => /Press B to read the book/.test(s)), 'the lobby shows the Ship\'s Book card (an empty book here: "Not christened yet", "Press B to read the book")');
  L.st.shipName = NAME; L.st.save.ship = BK.newShip(NAME, VY.dateKey());
  rec.texts.length = 0;
  r2.renderFrame(clock.ms, c2.update(1 / 60, L.st, canvas.width, canvas.height));
  const ls2 = rec.texts.map((t) => t.s);
  report(ls2.filter((s) => s === NAME.toUpperCase()).length >= 2, 'with a ship afloat the lobby says her name in the title and on the card');
  wipe();
}

// ---- (d) save v3 ----
console.log('--- (d) save v3 ---');
{
  const fx = (f) => fs.readFileSync(path.join(root, 'tools', 'fixtures', f), 'utf8').trim();
  for (const [f, ver, check] of [['save-v1.json', 1, (v) => v.bestStops === 4 && v.bestSalvage === 310 && v.totalRuns === 7 && v.victories === 1 && v.unlocks.includes('flagship-medal')], ['save-v2.json', 2, (v) => v.bestStops === 9 && v.totalRuns === 23 && v.victories === 4 && v.daily && v.daily.best.voyage.stops === 6 && VY.validBuild(v.build) && v.build.voyageNo === 2]]) {
    wipe();
    const raw = fx(f);
    localStorage.setItem('airshipVoyage', raw);
    const v = VY.loadVoyageSave();
    report(v.version === 3 && check(v) && v.ship === null && v.book.length === 0 && v.fleet.length === 0 && Object.keys(v.crew).length === 0, `${f} (v${ver}) loads as v3: every old field is intact (${Object.keys(JSON.parse(raw)).join(', ')}), a blank book is added`);
    report(localStorage.getItem('airshipVoyage.v' + ver) === raw, `...and the old text is kept aside (airshipVoyage.v${ver}) before anything is written`);
    VY.saveVoyageSave(v);
    const back = VY.loadVoyageSave();
    report(JSON.stringify(back) === JSON.stringify(v) && localStorage.getItem('airshipVoyage.v' + ver) === raw, '...saved and loaded again it is the same, and the aside copy is not overwritten');
  }
  wipe();
  { // a full round-trip
    const v = VY.loadVoyageSave();
    v.ship = BK.newShip(NAME, '2026-10-12');
    const page = { shipName: NAME, ship: NAME, date: '2026-10-12', victory: true, modeLabel: 'VOYAGE', voyages: 1, voyageNo: 1, done: 6, total: 6, salvage: 300, kills: 12, gunships: 1, route: [{ no: 1, name: 'Sky Isles', icon: 'x', env: 'skyisles', end: 'done' }], lines: [{ no: 1, name: 'Sky Isles', first: true, text: 'Mia did a thing.', kind: 'quiet', who: ['Mia'] }], rows: [{ icon: 'x', title: 'Medic', name: 'Mia', color: '#fff', value: 3, unit: 'revives' }], colors: { Mia: '#06d6a0' }, futureField: { keep: 1 } };
    BK.recordVoyage(v, page);
    BK.recordCrew(v, [{ name: 'Mia', color: '#06d6a0', species: 'fox', stats: { kills: 5, holes: 2 } }], true, '2026-10-12', NAME);
    BK.recordCrew(v, [{ name: 'Mia', color: '#06d6a0', species: 'fox', stats: { kills: 1 } }], false, '2026-10-13', NAME);
    v.futureThing = { x: [1, 2] };
    VY.saveVoyageSave(v);
    const w = VY.loadVoyageSave();
    report(JSON.stringify(w) === JSON.stringify(v) && w.futureThing.x[1] === 2 && w.book[0].futureField.keep === 1, 'a v3 save round-trips unchanged, unknown fields and all');
    report(w.ship.voyages === 1 && w.ship.stops === 6 && w.crew.Mia.voyages === 2 && w.crew.Mia.victories === 1 && w.crew.Mia.stats.kills === 6 && w.crew.Mia.first === '2026-10-12' && w.crew.Mia.last === '2026-10-13', `her tallies and Mia's record add up (${w.ship.voyages} voyage, ${w.crew.Mia.voyages} flown, ${w.crew.Mia.stats.kills} shot down)`);
    for (let i = 0; i < 50; i++) BK.recordVoyage(w, { ...page, shipName: null, ship: null, date: '2026-11-01' });
    report(w.book.length === config.BOOK.KEEP.VOYAGES && w.book[w.book.length - 1].no === 51 && w.book[0].no === 51 - config.BOOK.KEEP.VOYAGES + 1, `the book keeps the newest ${config.BOOK.KEEP.VOYAGES} pages (numbers ${w.book[0].no}..${w.book[w.book.length - 1].no})`);
    for (let i = 0; i < 80; i++) BK.recordCrew(w, [{ name: 'Crew' + i, stats: {} }], false, '2026-12-' + String(10 + (i % 18)), null);
    report(Object.keys(w.crew).length === config.BOOK.KEEP.CREW, `the crew records are capped at ${config.BOOK.KEEP.CREW}`);
    for (let i = 0; i < 20; i++) { w.ship = BK.newShip('Ship ' + i, '2026-12-01'); BK.retireShip(w, 'lost', 'Somewhere', '2026-12-02'); }
    report(w.fleet.length === config.BOOK.KEEP.FLEET && w.ship === null, `the fleet is capped at ${config.BOOK.KEEP.FLEET} and a retired ship is not afloat`);
  }
  wipe();
  { // damage
    localStorage.setItem('airshipVoyage', '{not json at all');
    const v = VY.loadVoyageSave();
    report(v.version === 3 && v.totalRuns === 0 && v.book.length === 0 && localStorage.getItem('airshipVoyage.bad') === '{not json at all', 'a corrupt save loads as a blank v3 and the broken text is kept aside (airshipVoyage.bad)');
    wipe();
    localStorage.setItem('airshipVoyage', JSON.stringify({ version: 3, totalRuns: 'x', ship: { name: 5 }, book: [1, null, { lines: 'x' }, { lines: [], victory: 1, route: 'no' }], fleet: [{ name: '' }, 4, { name: 'Old Tub', voyages: -3 }], crew: { a: 1, b: { name: 'Bea', voyages: 2, stats: 'x' }, c: null }, unlocks: 7, build: { parts: 3 } }));
    const w = VY.loadVoyageSave();
    report(w.version === 3 && w.ship === null && w.book.length === 1 && Array.isArray(w.book[0].route) && w.fleet.length === 1 && w.fleet[0].voyages === 0 && Object.keys(w.crew).join() === 'b' && w.crew.b.stats && Array.isArray(w.unlocks) && w.build === null, 'odd entries are dropped or mended, never thrown on: ship, 3 bad pages, 2 bad fleet entries, 2 bad crew, unlocks, build');
    wipe();
    localStorage.setItem('airshipVoyage', JSON.stringify([1, 2, 3]));
    report(VY.loadVoyageSave().version === 3, 'a save that is an array loads as a blank v3');
    wipe();
    const gone = globalThis.localStorage;
    delete globalThis.localStorage;
    const none = VY.loadVoyageSave();
    globalThis.localStorage = gone;
    report(none.version === 3 && none.book.length === 0 && none.ship === null, 'no localStorage at all (a tool, a private window): a blank v3, no error');
    VY.saveVoyageSave(none);
    const mp = VY.loadModePrefs();
    report(!!mp.mode, 'the mode preference (airshipMode) still loads');
  }
}

// ---- (e) the TV draws ----
console.log('--- (e) the TV draws the christening and the book ---');
{
  const ctx = stubCtx();
  const book = createLogbook({ ctx });
  const logArt = createLogArt({ ctx, book, crewAt: () => {} });
  const dots = () => {};
  const art = createBookArt({ ctx, book, logArt, dots });
  const MIN = config.BOOK.ART.MIN_PX;
  const pxOf = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(t.font || ''); return m ? +m[1] : 99; };
  const g0 = () => (globalThis.gameErrors || []).length;
  const check = (what, fn, need = (texts) => texts.length > 3) => {
    rec.texts.length = 0;
    const e0 = g0();
    let threw = null;
    try { fn(); } catch (e) { threw = e; }
    const small = rec.texts.filter((t) => pxOf(t) < MIN - 0.01 && t.s.trim());
    report(!threw && g0() === e0 && need(rec.texts.map((t) => t.s)) && small.length === 0, `${what}: draws with 0 errors, ${rec.texts.length} texts, none under ${MIN} px${small[0] ? ' - e.g. "' + small[0].s + '" at ' + pxOf(small[0]) : ''}${threw ? ' - threw ' + threw.message : ''}`);
  };
  const long = BK.shipNames({ fleet: [], totalRuns: 3, book: [] }, 5, '2030-02-02');
  const vote = { kind: 'name', title: 'NAME THE SHIP!', t: 11.2, options: [...long.map((n) => ({ kind: 'name', name: n, icon: '⚓', desc: '' })), { kind: 'skip', name: 'Name her later', icon: '⏭️', desc: 'cast off now' }] };
  check('the name vote', () => art.vote(vote, [{ vote: 1, color: '#e63946' }, { vote: 5, color: '#3a86ff' }]), (t) => t.some((s) => /NAME THE SHIP/.test(s)) && long.every((n) => t.some((s) => s.includes(n.toUpperCase().split(' ')[0]))));
  check('the name vote with the longest names', () => art.vote({ ...vote, options: vote.options.map((o, i) => (o.kind === 'name' ? { ...o, name: ['The Weathervane of Cobblegate', 'Featherstone\'s Revenge', 'The Windswept Albatross', 'The Merriweather Hortense Pelican', 'Lady Philippa'][i] } : o)) }, []));
  const C = config.BOOK.CHRISTEN;
  let all = true, sawName = false, sawWish = false;
  for (let k = 0; k <= Math.round(C.CEREMONY * 8); k++) {
    rec.texts.length = 0;
    const e0 = g0();
    art.ceremony({ name: NAME, t0: C.CEREMONY, t: C.CEREMONY - k / 8 + 0.01, broke: false });
    const small = rec.texts.filter((t) => pxOf(t) < MIN - 0.01 && t.s.trim());
    if (g0() !== e0 || small.length) all = false;
    if (rec.texts.some((t) => t.s === NAME.toUpperCase())) sawName = true;
    if (rec.texts.some((t) => /Fair winds/.test(t.s))) sawWish = true;
  }
  report(all && sawName && sawWish, `the ceremony draws at every pose key (${Math.round(C.CEREMONY * 8) + 1} of them): 0 errors, nothing under ${MIN} px, her name is painted on the plank and the wish follows`);
  let early = true;
  for (const k of [0, 4, 8]) { rec.texts.length = 0; art.ceremony({ name: NAME, t0: C.CEREMONY, t: C.CEREMONY - k / 8, broke: false }); if (rec.texts.some((t) => t.s === NAME.toUpperCase())) early = false; }
  report(early, 'her name is not on the plank before the bottle breaks');
  const lv = (b) => { for (const k of [0, 4, 8, 12, 16]) { rec.texts.length = 0; art.ceremony({ name: 'The Weathervane of Cobblegate', t0: C.CEREMONY, t: C.CEREMONY - (C.BREAK_AT + 0.6 + k / 8), broke: b }); } };
  check('the ceremony with a long name', lv, (t) => t.some((s) => /WEATHERVANE/.test(s)));
  check('the name plate', () => { const w = art.plate(NAME, 30, 258); if (!(w > 100 && w <= 440)) throw new Error('width ' + w); }, (t) => t.includes(NAME.toUpperCase()));
  const pageOf = (i) => ({ no: i + 1, shipName: i % 3 === 2 ? NAME : 'Lady Marmalade', ship: i % 3 === 2 ? NAME : 'Lady Marmalade', date: '2026-10-' + String(1 + i).padStart(2, '0'), victory: i % 3 !== 1, modeLabel: 'VOYAGE', voyages: 1, voyageNo: 1, done: 3 + i, total: 8, salvage: 100 * i, kills: i, gunships: 1,
    route: Array.from({ length: 3 + i }, (_, j) => ({ no: j + 1, name: 'Fungal Depths', icon: '\u{1F344}', env: 'fungal', lair: j === 2, creature: j === 2 ? 'kraken' : null, flagship: false, end: 'done' })),
    lines: Array.from({ length: 6 + (i % 4) }, (_, j) => ({ no: 1 + (j >> 1), name: 'Fungal Depths', first: j % 2 === 0, text: 'Mia and Zed put out the fire number ' + j + ' on the aft deck while the airship held together.', kind: 'x', who: ['Mia'] })), rows: [{ icon: '\u{1F528}', title: 'Patch Master', name: 'Mia', color: '#06d6a0', value: 4, unit: 'holes patched' }], colors: { Mia: '#06d6a0', Zed: '#3a86ff' } });
  const empty = { ship: null, book: [], fleet: [], crew: {} };
  const full = { ship: BK.newShip(NAME, '2026-10-01'), book: Array.from({ length: 9 }, (_, i) => pageOf(i)), fleet: [{ name: 'The Soggy Kettle', voyages: 2, where: 'Ember Forge' }, { name: 'Gallant Walrus', voyages: 1, where: '' }, { name: 'Lady Hortense', voyages: 5, where: 'The Kraken\'s Lair' }, { name: 'Fourth', voyages: 1, where: '' }], crew: Object.fromEntries(['Mia', 'Zed', 'Ola', 'Bea', 'Cal', 'Dee', 'Eli', 'Fay'].map((n, i) => [n, { name: n, color: '#06d6a0', voyages: 8 - i, victories: i, last: '2026-10-0' + (1 + i) }])) };
  full.ship.voyages = 9; full.ship.victories = 6; full.ship.stops = 51;
  check('the book\'s cover (an empty book)', () => art.page({ page: 0 }, empty), (t) => t.some((s) => /THE SHIP'S BOOK/.test(s)) && t.some((s) => /blank/.test(s)));
  check('the book\'s cover (a full book: ship, three lost ships, six voyages, six crew)', () => art.page({ page: 0 }, full), (t) => t.some((s) => /IN MEMORIAM/.test(s)) && t.some((s) => /THE CREW/.test(s)) && t.some((s) => s === NAME.toUpperCase()) && t.some((s) => /Page 1 of 11/.test(s)));
  check('the crew roster page (L3: page 2, after the cover, once anybody has flown)', () => art.page({ page: 1 }, full), (t) => t.some((s) => /THE CREW ROSTER/.test(s)) && t.some((s) => /Page 2 of 11/.test(s)));
  for (const i of [2, 3, 4, 10]) check(`the book, page ${i + 1} of 11 (a voyage, newest first)`, () => art.page({ page: i }, full), (t) => t.some((s) => /THE LOG OF /.test(s)) && t.some((s) => new RegExp('Page ' + (i + 1) + ' of 11').test(s)));
  const pgs = art.page({ page: 99 }, full);
  report(pgs === 11, `a page number past the end is held on the last page; the book says it has ${pgs} pages (cover, crew roster, 9 voyages)`);
  rec.texts.length = 0;
  art.page({ page: 2 }, full);
  report(rec.texts.some((t) => t.s === 'THE LOG OF ' + full.book[8].shipName.toUpperCase()), 'page 1 is the newest voyage (the last entry of the book)');
  rec.texts.length = 0; rec.n = 0;
  logArt.postcard({ ...pageOf(1), victory: false }, 0, { footer: 'x', noDim: true });
  report(rec.n > 20, 'a lost ship\'s page draws (the black border is part of it)');
}

// ---- (f) the book changes nothing ----
console.log('--- (f) the book changes nothing for the tools ---');
{
  const run = (env) => spawnSync(process.execPath, [path.join(root, 'tools', 'botsim.mjs'), '--minutes', quick ? '1' : '2', '--seed', '2', '--difficulty', 'normal'], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env } });
  const a = run({ BOOK_ON: '1' }), b = run({});
  const strip = (s) => (s || '').split('\n').filter((l) => !/^\s*(time|elapsed|wall|real time)/i.test(l)).join('\n');
  report(a.status === 0 && b.status === 0 && strip(a.stdout) === strip(b.stdout) && /errors: 0/.test(a.stdout), `botsim ${quick ? 1 : 2} min, seed 2: the same output with the Book on (BOOK_ON=1) and off (${(a.stdout || '').length} bytes, 0 errors)`);
  const flyTime = (mode) => { wipe(); const A = boot({ humans: 0, bots: 4, mode }); A.sim.castOff(); return { phase: A.st.phase, vote: !!A.st.vote }; };
  const x = flyTime(null), y = flyTime('off');
  report(x.phase === 'flying' && y.phase === 'flying' && !x.vote && !y.vote, 'a crew of bots casts off in the same call, with the Book on and off (no vote, no ceremony)');
  wipe();
}

report(errors === 0, `0 simulation errors overall${firstErrors.length ? ': ' + firstErrors[0] : ''}`);
console.log(ok ? "\nAll Ship's Book L2 checks passed." : "\nSome Ship's Book L2 checks FAILED.");
process.exit(ok ? 0 : 1);
