// THE NEMESIS gate, L4 (SHIPS_BOOK.md; public/modules/host/nemesis.js, config.NEMESIS, save v3 `nemesis`, logWriter.js, nemesisArt.js). Headless, no browser.
//   node tools/buildsim.mjs --check-nemesis [--quick]        or directly:   node tools/nemesis-check.mjs [--seed 1] [--quick]
//
//   (a) GENERATION: makeNemesis(seed) is deterministic and made of a colour and a beast ("The Red Kestrel"); 64 seeds give many different names, all with a flag, an emblem and a valid layout; the next captain's seed is a function of the book
//   (b) THE PLAN: she is planned for columns 1, 3, 5 of an 8-stop route (1 of 4, 1 and 3 of 6); never on a lair, ring, salvage, Flagship or no-gunship stop; the set piece IS her at the first peak of a planned stop, with her colours and name, and
//       nowhere else; a stop she cannot host leaves her due for the next that can
//   (c) THE ARC: driven off at ESCAPE_AT (not sunk, hull floor), a vow on the banner, salvage for it, back at the next planned stop with the same name / flag / layout and more hull, again at the final showdown where she does not run and goes down
//       for good: triple salvage, her flag in the book, a new captain next voyage; a boarding charge she survives until the final showdown, where it ends her
//   (d) MEMORY: save v3 round-trips her (tallies, fallen flags), a second voyage meets the same captain (the rumour on the first briefing, "BACK"), a ship lost to her is recorded, a damaged entry is rebuilt, v1 / v2 saves load
//   (e) THE LOG: nemesis-met / -scar / -escape / -down / -won reach the Log with her name and a crew name, every template fills clean, the postcard says she is still out there
//   (f) ONE HEADLINE: the arbiter shows one banner for her arrival and one for her escape (no "GUNSHIP ON THE HORIZON" beside it), at most one at a time
//   (g) SWITCHES: NO_NEMESIS=1, BOOK off, Versus and a stop with no gunship in its gates: the old game; 8 bots fly whole voyages with her, 0 errors
// Exit code 1 on any failure.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const seed = Number(argv[argv.indexOf('--seed') + 1]) || 1, quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };
const root = path.resolve(publicDir, '..');

process.env.BOOK_ON = '1'; // (the Book, and with it the Nemesis, is off in a Node tool unless asked for)
delete process.env.NO_BOOK2;
delete process.env.NO_NEMESIS;
installShims();
const clock = seedRandom(seed);
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
const NMS = await load('modules/host/nemesis.js');
const NART = await load('modules/host/nemesisArt.js');
const LW = await load('modules/host/logWriter.js');
const VY = await load('modules/host/voyage.js');
const BK = await load('modules/host/book.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');
const NM = config.NEMESIS;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
const ALL = ['swarm', 'imps', 'bombers', 'strafers', 'gunship'];
const fresh = () => globalThis.localStorage.removeItem('airshipVoyage');
const errs = () => (globalThis.gameErrors || []).length;

function boot({ bots = 5, start = 'sparrow', keepSave = false } = {}) {
  if (!keepSave) fresh();
  const sim = createSimulation(), st = sim.state;
  sim.setSession('voyage', false);
  if (start) sim.setStartBuild(start);
  for (let i = 0; i < bots; i++) {
    const e = st.ships[0].layout.boarderEntryPoints, id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry: null, conn: null, climb: false, stats: {}, uk: null };
  }
  sim.castOff();
  st.ev.log = []; // (the arbiter keeps a record of every banner it shows)
  return { sim, st };
}
// A mission of our own, with a stop record the director and the Nemesis read (col = its column of the route).
let stopNo = 0;
const mission = (sim, st, o = {}) => {
  stopNo++;
  sim.course.startMission(o.n || 2, { kind: o.kind || 'open', environment: 'skyisles', danger: 2, title: `STOP ${stopNo}: TEST`, heading: `STOP ${stopNo}: TEST`, goal: 'DESTROY THE OUTPOSTS', stop: { id: (o.col ?? 1) + '.0', col: o.col ?? 1, name: o.name || 'Test ' + stopNo, gates: o.gates || ALL, ...(o.stop || {}) } });
  for (const t of st.course.turrets || []) t.hp = 1e9; // (the stop is not over until the test says so: the bots cannot clear the outposts)
  st.ev.warn = 0;
  st.ev.log.length = 0;
};
const fly = (sim, st, secs, each) => { for (let i = 0; i < secs * 60; i++) { if (st.phase === 'flying' && !st.ship.down) st.ship.hull = Math.max(st.ship.hull, 60); step(sim, 1); if (each && each(i) === true) break; if (st.phase === 'lobby' && !st.runEnd && !st.wreck) sim.castOff(); } };
const flyUntil = (sim, st, pred, secs) => { let hit = false; fly(sim, st, secs, () => { if (pred()) { hit = true; return true; } }); return hit; };
// Fly a planned stop until her set piece is up (or the time runs out).
// (a map with rock in the way cannot host a gunship - the director falls back to a swarm and tries at the next peak - so a stop is flown again on a new map a few times)
const meet = (sim, st, o = {}, tries = 6) => { for (let k = 0; k < tries; k++) { mission(sim, st, o); if (flyUntil(sim, st, () => st.gunship && st.gunship.nemesis, 100)) return st.gunship; } return null; };
const banners = (st) => st.ev.log.map((b) => b.text);

// ---- (a) generation ----
{
  const a = NMS.makeNemesis(12345, 1, '2026-10-12'), b = NMS.makeNemesis(12345, 1, '2026-10-12');
  report(JSON.stringify(a) === JSON.stringify(b), `makeNemesis(seed) is deterministic: ${a.name} (${a.look.a} cloth, ${a.look.emblem} emblem, ${a.layout} deck, ${a.personality})`);
  const names = new Set(), words = new Set(NMS.PALETTES.map((p) => p.word));
  let good = true;
  for (let s = 1; s <= 64; s++) {
    const n = NMS.makeNemesis(s * 7919, s);
    names.add(n.name);
    const m = /^The (\w+) (\w+)$/.exec(n.name);
    if (!m || !words.has(m[1]) || !NMS.BEASTS.includes(m[2]) || !n.look.a || !n.look.b || !n.look.emblem || !n.look.pattern || !config.GUNSHIP_PARTS.HULLS[NM.HULL].layouts.includes(n.layout) || n.handle !== (m[1] + ' ' + m[2]).toUpperCase()) good = false;
  }
  report(good && names.size >= 30, `64 seeds make ${names.size} different "The <Colour> <Beast>" names, each with a flag, an emblem and a layout her hull can have`);
  const s1 = { nemesis: { n: 0 }, totalRuns: 3, book: [], ship: { born: '2026-10-12' } }, s2 = { nemesis: { n: 1 }, totalRuns: 3, book: [], ship: { born: '2026-10-12' } };
  report(NMS.nemesisSeed(s1) === NMS.nemesisSeed({ ...s1 }) && NMS.nemesisSeed(s1) !== NMS.nemesisSeed(s2), 'the next captain depends on the book (the same book, the same captain; one captain later, another)');
  // The blueprint she flies: the same hull, layout, flag and name every time, only her guns and crew grow with her level.
  const BP = await load('modules/host/gunshipBlueprint.js');
  const { SHIP_LAYOUT } = await load('shipLayout.js');
  const f = NMS.makeNemesis(777, 1);
  const bp = (lv) => BP.generateBlueprint(f.seed, { mission: 1 + Math.floor(lv / 2), difficulty: 'normal', shipLayout: SHIP_LAYOUT, hull: NM.HULL, layout: f.layout, personality: f.personality, look: f.look, name: f.name });
  const b0 = bp(0), b4 = bp(4), b0b = bp(0);
  report(JSON.stringify(b0.flag) === JSON.stringify(b4.flag) && b0.hull === b4.hull && b0.layout === b4.layout && b0.title === 'THE ' + NMS.nameWords(f) && b0.emblem === f.look.emblem && b0.len === b4.len, `her blueprint keeps the hull (${b0.hull}), layout (${b0.layout}), flag, emblem and name (${b0.title}) at every level`);
  report(JSON.stringify(b0) === JSON.stringify(b0b), 'the same seed and level make the same blueprint (deterministic)');
  report(b4.crew >= b0.crew && b4.weapons.length >= b0.weapons.length, `...and she is armed better at level 4: crew ${b0.crew} -> ${b4.crew}, guns ${b0.weapons.length} -> ${b4.weapons.length}`);
}

// ---- (b) the plan ----
{
  report(JSON.stringify(NMS.plannedColumns(8)) === '[1,3,5]' && JSON.stringify(NMS.plannedColumns(4)) === '[1]' && JSON.stringify(NMS.plannedColumns(6)) === '[1,3]', `planned columns: 8 stops ${JSON.stringify(NMS.plannedColumns(8))}, 4 stops ${JSON.stringify(NMS.plannedColumns(4))}, 6 stops ${JSON.stringify(NMS.plannedColumns(6))}`);
  const H = NMS.hosts;
  const bad = [{ lair: true }, { ring: 'tower' }, { salvage: true }, { flagship: true }, { harbour: true }, { gates: ['swarm', 'imps'] }].every((o) => !H({ col: 3, gates: ALL, ...o }));
  report(H({ col: 3, gates: ALL }) && H({ col: 3 }) && bad, 'a stop hosts her unless it is a lair, a ring, a salvage run, the harbour, the Flagship or has no gunship in its gates');
  const r = { dueCol: 1, meetings: 0 };
  const p = NMS.planFor(r, { id: '1.0', col: 1, gates: ALL }, 7), none = [NMS.planFor(r, { id: '0.0', col: 0, gates: ALL }, 7), NMS.planFor(r, { id: '1.1', col: 1, lair: true }, 7), NMS.planFor({ dueCol: 3, meetings: 1 }, { id: '2.0', col: 2, gates: ALL }, 7), NMS.planFor({ dueCol: 7, meetings: 3 }, { id: '7.0', col: 7, gates: ALL }, 8)];
  report(p && p.n === 1 && !p.final && none.every((x) => x === null), 'planFor: column 1 is meeting 1; column 0, a lair, an early column and a fourth meeting are not');
  report(NMS.planFor({ dueCol: 5, meetings: 1 }, { id: '5.0', col: 5, gates: ALL }, 7).final && NMS.planFor({ dueCol: 3, meetings: 1 }, { id: '3.0', col: 3, gates: ALL }, 7).final === false && NMS.planFor({ dueCol: 1, meetings: 0 }, { id: '1.0', col: 1, gates: ALL }, 3).final, 'the final showdown is the third meeting, or the last stop before the Flagship that can host her');
}
{
  // In the sim: a planned stop's first set piece is her; other stops never.
  const { sim, st } = boot();
  step(sim, 60);
  const foe = st.save.nemesis.cur;
  report(!!foe && foe.meets === 0 && /^The \w+ \w+$/.test(foe.name), `a new voyage meets "${foe && foe.name}" (the Book had none)`);
  const idle = meet(sim, st, { col: 0 });
  report(!idle && !(st.gunship && st.gunship.nemesis) && st.run.nemesis.meetings === 0, 'column 0: no Nemesis' + (st.gunship ? ' (an ordinary gunship came: ' + st.gunship.bp.title + ')' : ''));
  const g = meet(sim, st, { col: 1 });
  report(!!g && g.nemesis.name === foe.name && g.bp.title === 'THE ' + NMS.nameWords(foe) && g.bp.flag.a === foe.look.a && g.bp.hull === NM.HULL && g.bp.layout === foe.layout, `column 1: the gunship set piece is ${g && g.bp.title}, in her colours (${g && g.bp.flag.a}), ${g && g.bp.hull}, ${g && g.bp.layout}`);
  report(g && st.tempo.big === 1 && st.run.nemesis.meetings === 1 && foe.meets === 1 && st.run.nemesis.dueCol === 1 + NM.GAP, `...at the first set piece, the stop's one big thing; meetings 1, due again at column ${st.run.nemesis && st.run.nemesis.dueCol}`);
  report(g && g.nemesis.say.approach === `THE ${NMS.nameWords(foe)} IS HUNTING YOU!` && st.ev.log.some((b) => b.text === g.nemesis.say.approach), `the banner: "${g && g.nemesis.say.approach}"`);
  const lvl0 = g && g.max;
  // not on a lair / ring / salvage / Flagship stop, not on a stop without a gunship, not before the next due column
  const { sim: s2, st: t2 } = boot();
  step(s2, 60);
  const cases = [['lair', { col: 1, stop: { lair: true } }], ['ring', { col: 1, stop: { ring: 'tower' }, kind: 'ring' }], ['salvage', { col: 1, stop: { salvage: true } }], ['Flagship', { col: 1, stop: { flagship: true } }], ['no gunship in the gates', { col: 1, gates: ['swarm', 'imps'] }]];
  for (const [label, o] of cases) {
    mission(s2, t2, o);
    const hit = flyUntil(s2, t2, () => t2.gunship && t2.gunship.nemesis, label === 'lair' || label === 'Flagship' ? 4 * 60 : 3 * 60);
    report(!hit && t2.run.nemesis.meetings === 0, `${label} stop: she does not come${t2.gunship ? ' (an ordinary gunship may: ' + t2.gunship.bp.title + ')' : ''}`);
  }
  const wait = meet(s2, t2, { col: 1 });
  report(!!wait, 'after four stops she could not host, she is still due: the next stop that can has her');
  void lvl0;
}

// ---- (c) the arc: escape, return, the final showdown ----
const hullOf = (g) => g.ship.state.hull;
const shoot = (g, to) => { g.ship.state.hull = to; };
let arcFoe, arcSave;
{
  const { sim, st } = boot();
  step(sim, 60);
  const foe = st.save.nemesis.cur;
  arcFoe = foe.name;
  const A = {};
  // meeting 1: driven off
  let g = meet(sim, st, { col: 1, name: 'First Stop' });
  A.hp0 = g.max; A.cap0 = g.cap.fireMul; A.lay0 = g.bp.layout;
  const salvage0 = st.run.salvage;
  shoot(g, 24);
  const fled = flyUntil(sim, st, () => g.phase === 'leaving', 20);
  report(fled && g.fled && !g.paid, `meeting 1: below ${NM.ESCAPE_AT * 100}% hull she runs (phase ${g.phase}) instead of fighting on`);
  report(banners(st).some((t) => t.startsWith(`THE ${NMS.nameWords(foe)} LIMPS AWAY: "`)) && !banners(st).some((t) => /BADLY HIT/.test(t)), `...with her own banner and a vow: "${banners(st).find((t) => /LIMPS AWAY/.test(t))}"`);
  fly(sim, st, 3);
  report(st.run.salvage - salvage0 >= config.SALVAGE.GUNSHIP_SHOT * NM.ESCAPE_PAY && foe.escapes === 1, `...driven off: salvage +${st.run.salvage - salvage0}, escapes ${foe.escapes}`);
  g.ship.sim.damageHull(1e6); // (a broadside that would sink any other gunship)
  fly(sim, st, 5);
  report(st.gunship && hullOf(g) >= NM.FLOOR * 100 - 0.5 && g.phase !== 'sinking' && !(g.ship.state.down > 0), `a shell cannot sink her before the final showdown (hull ${hullOf(g).toFixed(1)}%)`);
  fly(sim, st, 40, () => !st.gunship);
  report(!st.gunship || st.gunship.phase === 'leaving', 'she limps out of the sky');
  report(st.save.nemesis.cur === st.save.nemesis.cur && foe.meets === 1, 'the Book still has her alive: meets 1');
  // between: column 2 is not hers
  mission(sim, st, { col: 2, name: 'Second' });
  fly(sim, st, 3 * 60);
  report(!(st.gunship && st.gunship.nemesis), 'column 2: not her turn (every GAP columns)');
  // meeting 2: back, stronger, the same ship
  g = meet(sim, st, { col: 3, name: 'Third Stop' });
  report(!!g && g.nemesis.name === foe.name && g.bp.layout === A.lay0 && g.bp.flag.a === foe.look.a, `column 3: ${g && g.bp.title} is back, same flag and layout`);
  report(g && g.nemesis.level === 1 && g.max > A.hp0 && g.cap.fireMul < A.cap0 + 1e-9, `...a level stronger: hull ${A.hp0} -> ${g && g.max}, reload x${A.cap0} -> x${g && g.cap.fireMul}`);
  report(g && /IS BACK - SHE REMEMBERS YOU!$/.test(g.nemesis.say.approach) && st.ev.log.some((b) => b.text === g.nemesis.say.approach), `...the banner: "${g && g.nemesis.say.approach}"`);
  shoot(g, 20);
  flyUntil(sim, st, () => g.phase === 'leaving', 20);
  fly(sim, st, 3);
  report(foe.escapes === 2 && foe.meets === 2, 'driven off again: escapes 2, meets 2');
  // the final showdown
  g = meet(sim, st, { col: 5, name: 'Fifth Stop' });
  report(!!g && g.nemesis.final && g.nemesis.level === 2 && g.cap.fleeAt === 0 && /THE LAST FIGHT!$/.test(g.nemesis.say.approach), `column 5: ${g && g.bp.title}, THE LAST FIGHT (level ${g && g.nemesis.level}, flee at ${g && g.cap.fleeAt})`);
  const salv = st.run.salvage;
  shoot(g, 10);
  flyUntil(sim, st, () => g.phase === 'sinking' || g.phase === 'leaving', 10);
  report(st.gunship === g && g.phase !== 'leaving', 'at the final showdown she does not run, however hurt (' + g.phase + ')');
  if (g.phase !== 'sinking') g.ship.sim.damageHull(1e6);
  const down = flyUntil(sim, st, () => g.phase === 'sinking', 20);
  fly(sim, st, 6); // (her banner waits its turn behind the one on screen)
  const pay = st.run.salvage - salv;
  report(down && pay >= config.SALVAGE.GUNSHIP_SHOT * NM.SALVAGE_MUL, `she goes down for good, worth triple salvage: +${pay} (a plain gunship shot down: ${config.SALVAGE.GUNSHIP_SHOT})`);
  report(banners(st).some((t) => t === `THE ${NMS.nameWords(foe)} IS DOWN FOR GOOD - HER FLAG IS YOURS!`), 'her own banner for the end: ' + JSON.stringify(st.ev.log.slice(-6).map((b) => [Math.round(b.t * 10) / 10, b.pri, b.text])) + ' queue ' + JSON.stringify(st.ev.q.map((m) => m.text)));
  report(st.save.nemesis.cur === null && st.save.nemesis.fallen.length === 1 && st.save.nemesis.fallen[0].name === foe.name, `her flag is in the book (fallen: ${st.save.nemesis.fallen.map((f) => f.name).join(', ')}), no live captain`);
  arcSave = JSON.parse(globalThis.localStorage.getItem('airshipVoyage'));
  // a new voyage meets a new captain
  const run = st.run;
  st.ship.down = 0;
  sim.endRun(true);
  report(!!st.runEnd && st.runEnd.nemesis && st.runEnd.nemesis.slain && st.runEnd.lines.some((l) => /went down for good/.test(l.text)), 'the postcard says she went down for good');
  void run;
}
{
  // a new sim from the same book: a new captain
  const { sim, st } = boot({ keepSave: true });
  step(sim, 60);
  const c = st.save.nemesis.cur;
  report(!!c && c.name !== arcFoe && c.meets === 0 && st.save.nemesis.fallen.length === 1, `the next voyage meets another captain: ${c && c.name} (not ${arcFoe}); the flag of ${arcFoe} still hangs`);
}
{
  // a boarding charge: before the final showdown she survives the blast and limps away (the crew still get the spoils); at the final showdown it ends her
  const { sim, st } = boot();
  step(sim, 60);
  const foe = st.save.nemesis.cur;
  let g = meet(sim, st, { col: 1 });
  const planter = 'bot2', hull0 = st.ship.hull;
  g.charge = { t: 0.01, by: planter };
  const left = flyUntil(sim, st, () => g.phase === 'leaving' || g.phase === 'sinking', 20);
  fly(sim, st, 6);
  report(left && g.phase === 'leaving' && g.blast && g.fled && st.save.nemesis.cur === foe && foe.escapes === 1, `a charge at meeting 1 does not finish her: she survives the blast and limps away (phase ${g.phase}), escapes ${foe.escapes}`);
  report(banners(st).some((t) => /SURVIVES THE BLAST AND LIMPS AWAY: "/.test(t)), `...her own banner: "${banners(st).find((t) => /SURVIVES THE BLAST/.test(t))}"`);
  const em = st.moments.find((m) => m.kind === 'nemesis-escape');
  report(em && em.data.how === 'charge' && em.who[0] === st.players[planter].name && LW.sentence(em, { used: new Set() }).includes(st.players[planter].name), `...and the Log credits the planter: "${em && LW.sentence(em, { used: new Set() })}"`);
  void hull0;
  // the final showdown: the same charge ends her
  st.run.nemesis.dueCol = 5; st.run.nemesis.meetings = 2;
  g = meet(sim, st, { col: 5, name: 'Last' });
  const salv = st.run.salvage;
  g.charge = { t: 0.01, by: planter };
  const down = flyUntil(sim, st, () => g.phase === 'sinking', 20);
  fly(sim, st, 1);
  report(g.nemesis.final && down && st.save.nemesis.cur === null && st.run.salvage - salv >= config.SALVAGE.GUNSHIP_BOARDED * NM.SALVAGE_MUL, `the same charge at the final showdown ends her for good: salvage +${st.run.salvage - salv}, flag in the book (${foe.name})`);
}

// ---- (d) memory across two voyages ----
{
  const { sim, st } = boot();
  step(sim, 60);
  const foe = st.save.nemesis.cur;
  let g = meet(sim, st, { col: 1, name: 'Memory Stop' });
  g.ship.state.hull = 22;
  flyUntil(sim, st, () => g.phase === 'leaving', 20);
  fly(sim, st, 2);
  // she beats the ship at the second meeting: the ship is lost
  g = meet(sim, st, { col: 3, name: 'Lost Stop' });
  st.ship.hull = 1;
  const ours0 = foe.ours;
  sim.endRun(false);
  report(foe.ours === ours0 + 1, `the ship is lost with her about: ours ${ours0} -> ${foe.ours} ("she beat us" is recorded)`);
  const raw = globalThis.localStorage.getItem('airshipVoyage');
  const save = JSON.parse(raw);
  report(save.version === 3 && save.nemesis && save.nemesis.cur && save.nemesis.cur.name === foe.name && save.nemesis.cur.meets === 2 && save.nemesis.cur.escapes === 1 && save.nemesis.cur.ours === 1 && save.nemesis.cur.voyages === 1, `save v3 keeps her: meets ${save.nemesis.cur.meets}, escapes ${save.nemesis.cur.escapes}, ours ${save.nemesis.cur.ours}, voyages ${save.nemesis.cur.voyages}`);
  report(st.runEnd.nemesis && st.runEnd.nemesis.out && st.runEnd.lines.some((l) => /still out there/.test(l.text) && l.text.includes(foe.name)), `the postcard: "${(st.runEnd.lines.slice(-1)[0] || {}).text}"`);
  report(save.book.slice(-1)[0] && save.book.slice(-1)[0].nemesis && save.book.slice(-1)[0].nemesis.out === true, "...and the voyage's page in the book carries it");
  // the second voyage (a new sim reads the same save)
  const s2 = boot({ keepSave: true });
  let b = null;
  for (let i = 0; i < 6 * 60 && !(b && b.nemesis); i++) { step(s2.sim, 1); b = s2.st.briefing || b; }
  const c2 = s2.st.save.nemesis.cur;
  report(c2 && c2.name === foe.name && c2.meets === 2 && c2.seed === foe.seed && c2.ours === 1, `voyage 2 meets the same captain: ${c2 && c2.name}, met ${c2 && c2.meets}, bested us ${c2 && c2.ours}`);
  report(b && b.nemesis && b.nemesis.rumour && /IS STILL OUT THERE$/.test(b.nemesis.line) && b.nemesis.handle === foe.handle, `the first briefing names her: "${b && b.nemesis && b.nemesis.line}" / "${b && b.nemesis && b.nemesis.sub}"`);
  const g2 = meet(s2.sim, s2.st, { col: 1, name: 'Again' });
  report(g2 && g2.nemesis.level === 2 && /IS BACK - SHE REMEMBERS YOU!$/.test(g2.nemesis.say.approach) && g2.max > 0, `...and flies at level ${g2 && g2.nemesis.level} with "${g2 && g2.nemesis.say.approach}" the first time this voyage`);
  // tolerance
  const damaged = { version: 3, nemesis: { n: 'x', cur: { seed: 99, meets: 'many', name: 5 }, fallen: [7, { name: 'The Old Heron' }, null] }, book: [], fleet: [], crew: {} };
  const up = VY.upgradeSave(JSON.stringify(damaged));
  report(up.nemesis.cur && up.nemesis.cur.seed === 99 && /^The \w+ \w+$/.test(up.nemesis.cur.name) && up.nemesis.cur.meets === 0 && up.nemesis.fallen.length === 1 && up.nemesis.fallen[0].name === 'The Old Heron', 'a damaged nemesis entry is rebuilt from its seed, odd flags dropped');
  for (const f of ['save-v1.json', 'save-v2.json']) {
    const up2 = VY.upgradeSave(fs.readFileSync(path.join(root, 'tools', 'fixtures', f), 'utf8'));
    report(up2.version === 3 && up2.nemesis && up2.nemesis.cur === null && Array.isArray(up2.nemesis.fallen), `${f} loads with an empty nemesis`);
  }
  report(JSON.stringify(arcSave.nemesis.fallen.length) === '1', 'the saved flags survive in the stored text (' + arcSave.nemesis.fallen.map((f) => f.name) + ')');
}

// ---- (e) the Log ----
{
  const { sim, st } = boot();
  step(sim, 60);
  const foe = st.save.nemesis.cur;
  const g = meet(sim, st, { col: 1, name: 'Log Stop' });
  // the ship takes a beating: holes in the canvas and hull lost while she is about
  st.gasHoles.push(st.ships[0].sim.gasHoleAt(st.ships[0].layout.midPoint.x - 200, st.ships[0].layout.midPoint.y - 150, 0));
  fly(sim, st, 2);
  st.ship.hull = 40;
  step(sim, 3);
  g.ship.state.hull = 22;
  flyUntil(sim, st, () => g.phase === 'leaving', 20);
  fly(sim, st, 2);
  // the stop's end: the dock's Log line carries it (the outposts fall, the ESCAPE calm runs, the scorecard comes)
  for (const t of st.course.turrets || []) { t.dead = true; t.hp = 0; }
  let card = null;
  for (let i = 0; i < 70 * 60 && !card; i++) { st.ship.hull = Math.max(st.ship.hull, 60); step(sim, 1); if (st.scorecard) card = st.scorecard; }
  const kinds = st.moments.filter((m) => /^nemesis-/.test(m.kind)).map((m) => m.kind);
  report(kinds.includes('nemesis-met') && kinds.includes('nemesis-escape') && kinds.includes('nemesis-scar'), `moments recorded: ${kinds.join(', ')}`);
  report(!st.moments.some((m) => m.kind === 'gunship-fled'), 'her flight is told once (nemesis-escape), not also as an ordinary gunship-fled');
  const w = LW.writeStop(st.moments.filter((m) => /^nemesis-/.test(m.kind)), { no: 2, name: 'Log Stop' }, { used: new Set(), players: Object.values(st.players), ship: null });
  const G = LW.titled(foe.name);
  report(w.cands.length >= 2 && w.cands.every((c) => c.text.toLowerCase().includes(G.toLowerCase()) && c.who.length >= 1 && !/undefined|\{|\}/.test(c.text)), `the Log tells it with her name and a crew name: "${w.text}"`);
  const scar = st.moments.find((m) => m.kind === 'nemesis-scar');
  report(scar && /bag|deck|hull/.test((scar.data.names || [''])[0]) && w.cands.some((c) => c.kind === 'nemesis-scar' && /scarred|mark|scar/.test(c.text)), `a scar line names a place: ${scar && scar.data.names} (${w.cands.find((c) => c.kind === 'nemesis-scar') && w.cands.find((c) => c.kind === 'nemesis-scar').text})`);
  // all the new templates fill clean with odd data
  const odd = { who: ['A B', 'C', 'D', 'E', 'F'], stopName: undefined, data: { name: undefined, names: [], how: 'weird' } };
  let clean = true;
  for (const kind of ['nemesis-met', 'nemesis-scar', 'nemesis-escape', 'nemesis-down', 'nemesis-won']) {
    for (const data of [{}, { again: 1 }, { final: 1 }, { how: 'charge' }, { how: 'captured' }, { how: 'limp' }, odd.data]) {
      for (const who of [[], ['Mia'], ['Mia', 'Bob'], odd.who]) {
        const used = new Set();
        for (let k = 0; k < 4; k++) {
          const t = LW.sentence({ kind, stop: 3, stopName: k % 2 ? 'Sky Isles' : undefined, who, data: { name: 'THE RED KESTREL', ...data } }, { used, again: true });
          if (!t || /undefined|\{|\}|\s\s/.test(t) || !/^[A-Z]/.test(t)) { clean = false; console.log('  odd sentence', kind, JSON.stringify(data), '->', t); }
        }
      }
    }
  }
  report(clean, 'every Nemesis sentence template fills clean with odd data (no braces, no "undefined", capital first)');
  report(['nemesis-met', 'nemesis-scar', 'nemesis-escape', 'nemesis-down', 'nemesis-won'].every((k) => LW.playOf({ kind: k, who: ['Mia'], data: { name: 'The Red Kestrel' } }).includes('Mia') && !/made the play/.test(LW.playOf({ kind: k, who: ['Mia'], data: { name: 'The Red Kestrel' } }))), 'PLAY OF THE MISSION has its own phrase for each');
  report(!!card && card.log && card.log.toLowerCase().includes(G.toLowerCase()), `the scorecard's Log line names her: "${card && card.log}"`);
  void foe;
}

// ---- (f) one headline ----
{
  const { sim, st } = boot();
  step(sim, 60);
  const g = meet(sim, st, { col: 1 });
  fly(sim, st, 8); // the next seconds after she appears
  const all = banners(st);
  const hers = all.filter((t) => t.includes(NMS.nameWords(st.save.nemesis.cur)));
  report(hers.length === 1 && !all.some((t) => /GUNSHIP ON THE HORIZON|APPROACHES - SHOOT/.test(t)), `her arrival is ONE banner (${hers.length}): ${JSON.stringify(all)}`);
  // no two banners on screen at once (the arbiter holds each for HOLD unless urgent)
  const bad = [];
  for (let i = 1; i < st.ev.log.length; i++) { const a = st.ev.log[i - 1], b = st.ev.log[i]; if (b.t - a.t < Math.min(a.hold, config.ALARMS.HOLD) - 0.05 && b.pri < config.ALARMS.PREEMPT) bad.push([a.text, b.text]); }
  report(bad.length === 0, 'the arbiter never cut a banner short for her (equal priority waits out the HOLD)');
  g.ship.state.hull = 20;
  st.ev.log.length = 0;
  flyUntil(sim, st, () => g.phase === 'leaving', 20);
  fly(sim, st, 6);
  const esc = banners(st);
  report(esc.length >= 1 && esc.filter((t) => /LIMPS AWAY/.test(t)).length === 1 && !esc.some((t) => /BADLY HIT|SHOT DOWN|BREAKS OFF/.test(t)), `her escape is ONE headline: ${JSON.stringify(esc)}`);
  const phone = Object.values(st.players)[0];
  void phone;
}

// ---- (h) the TV draws her ----
{
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const { sim, st } = boot();
  step(sim, 60);
  const foe = st.save.nemesis.cur;
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const cam = createWorldCamera();
  let exc = 0;
  const draw = (n = 2) => { for (let f = 0; f < n; f++) { rec.texts.length = 0; try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); } } };
  const px = (t) => +(/(\d+(?:\.\d+)?)px/.exec(t.font) || [0, 0])[1];
  const small = (re) => rec.texts.filter((t) => re.test(t.s) && px(t) < config.BOOK.ART.MIN_PX);
  // the briefing: her seal and her words under the goal
  st.briefing = { t: 2, title: 'STOP 3: TEST', goal: 'DESTROY THE OUTPOSTS', nemesis: { name: foe.name, handle: foe.handle, look: foe.look, level: 2, line: 'THE ' + NMS.nameWords(foe) + ' IS BACK - SHE REMEMBERS YOU!', sub: 'Met twice before. She has a long memory.', final: false, rumour: false } };
  draw();
  report(exc === 0 && rec.texts.some((t) => t.s === st.briefing.nemesis.line) && rec.texts.some((t) => t.s === 'THE NEMESIS') && small(/NEMESIS|REMEMBERS|Met twice/).length === 0, `the briefing card draws her headline and her line, none under ${config.BOOK.ART.MIN_PX} px`);
  st.briefing.nemesis.rumour = true; st.briefing.nemesis.line = 'THE ' + NMS.nameWords(foe) + ' IS STILL OUT THERE'; draw();
  report(exc === 0 && rec.texts.some((t) => t.s === 'THE BOOK REMEMBERS') && rec.texts.some((t) => /STILL OUT THERE$/.test(t.s)), 'the voyage-opening briefing draws "THE BOOK REMEMBERS" (the rumour)');
  st.briefing.nemesis.rumour = false; st.briefing.nemesis.final = true; draw();
  report(exc === 0 && rec.texts.some((t) => t.s === 'THE FINAL SHOWDOWN'), 'the final showdown has its own tag');
  st.briefing = null;
  // her on the stage: her seal beside her health bar
  const g = meet(sim, st, { col: 1 });
  draw();
  report(!!g && exc === 0 && rec.texts.some((t) => t.s === g.bp.title), `she draws in flight (name ${g && g.bp.title}), 0 errors`);
  // the lobby: the WANTED card and the flags
  const lob = boot();
  const R2 = createRenderer({ ctx: stubCtx(), state: lob.st, canvas });
  const c2 = createWorldCamera();
  const drawL = () => { rec.texts.length = 0; try { R2.renderFrame(clock.ms, c2.update(1 / 60, lob.st, canvas.width, canvas.height)); } catch (e) { exc++; console.log('  draw error: ' + e.stack); } };
  lob.st.phase = 'lobby';
  lob.st.save.nemesis.cur.meets = 3;
  lob.st.save.nemesis.fallen = [{ name: 'The Violet Heron', handle: 'VIOLET HERON', look: NMS.makeNemesis(5, 1).look, meets: 3, date: '2026-10-05', ship: null, stop: 'The Aether' }];
  drawL();
  const lt = rec.texts.map((t) => t.s);
  report(exc === 0 && lt.includes('STILL OUT THERE') && lt.includes(lob.st.save.nemesis.cur.name.toUpperCase()) && lt.some((s) => /^FLAGS WON: 1/.test(s)), `the lobby card: STILL OUT THERE, ${lob.st.save.nemesis.cur.name.toUpperCase()}, FLAGS WON: 1`);
  report(small(/STILL OUT THERE|FLAGS WON|met \d/).length === 0, 'the lobby card text is at least ' + config.BOOK.ART.MIN_PX + ' px');
  lob.st.save.nemesis.cur = null;
  drawL();
  report(exc === 0 && rec.texts.some((t) => /^FLAGS WON/.test(t.s)) && !rec.texts.some((t) => t.s === 'STILL OUT THERE'), 'a book with only flags still shows them (no live captain)');
  const emb = ['horns', 'eye', 'band', 'chevrons', 'fangs'];
  let boom = 0;
  for (const e of emb) { try { const c = stubCtx(); NART.drawBadge(c, 100, 100, 40, { a: "#8c2f2f", b: "#f2d36b", emblem: e }, 3); } catch { boom++; } }
  report(boom === 0, 'every emblem draws in the seal');
}

// ---- (g) switches and whole voyages ----
{
  const run = (env, args) => spawnSync(process.execPath, [path.join(root, 'tools', 'nemesis-check.mjs'), '--switch', ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  void run;
  const enabledIn = (env) => { const e = { ...process.env }; delete e.BOOK_ON; delete e.NO_BOOK2; delete e.NO_NEMESIS; return spawnSync(process.execPath, ['--input-type=module', '-e', `const { config } = await import(${JSON.stringify(pathToFileURL(path.join(publicDir, 'config.js')).href)}); console.log(config.NEMESIS.ENABLED);`], { encoding: 'utf8', env: { ...e, ...env } }).stdout.trim(); };
  const sw = { plain: enabledIn({}), on: enabledIn({ BOOK_ON: '1' }), no: enabledIn({ BOOK_ON: '1', NO_NEMESIS: '1' }), nobook: enabledIn({ BOOK_ON: '1', NO_BOOK2: '1' }) };
  report(sw.plain === 'false' && sw.on === 'true' && sw.no === 'false' && sw.nobook === 'false', `the switch: a Node tool has her off (${sw.plain}), BOOK_ON=1 turns her on (${sw.on}), NO_NEMESIS=1 off (${sw.no}), NO_BOOK2=1 off (${sw.nobook}); the browser has her on (no process)`);
  NM.ENABLED = false;
  const off = boot();
  step(off.sim, 60);
  const g0 = meet(off.sim, off.st, { col: 1 });
  report(!off.st.save.nemesis.cur && (!off.st.gunship || !off.st.gunship.nemesis) && !g0 && !off.st.run.nemesis, 'ENABLED false: no captain in the save, the stop flies as it always did (an ordinary gunship at most)');
  NM.ENABLED = true;
  config.PVP.ENABLED = true;
  const vs = boot();
  step(vs.sim, 30);
  report(!vs.st.run.nemesis, 'Versus: no Nemesis');
  config.PVP.ENABLED = false;
}
{
  const n = quick ? 2 : 4, maxmin = quick ? 14 : 30;
  const r = spawnSync(process.execPath, [path.join(root, 'tools', 'voyagesim.mjs'), '--runs', String(n), '--bots', '8', '--maxmin', String(maxmin), '--build', 'sparrow'], { encoding: 'utf8', env: { ...process.env, BOOK_ON: '1' }, cwd: root, maxBuffer: 1 << 26 });
  const out = r.stdout || '';
  const e = /errors (\d+)/.exec(out), line = out.split('\n').find((l) => l.startsWith('nemesis (L4)')) || '';
  report(r.status === 0 && e && Number(e[1]) === 0 && !/ERROR/.test(out), `${n} voyages of 8 bots (${maxmin} min cap): errors ${e && e[1]}`);
  report(/met \d+/.test(line) && Number((/met (\d+)/.exec(line) || [0, 0])[1]) > 0, `...and she flew in them: ${line || '(no nemesis line)'}`);
}
report(errs() === 0, `0 game errors in the checks (${errs()})`);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
