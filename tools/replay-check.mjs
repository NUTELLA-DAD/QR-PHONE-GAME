// PLAY OF THE MISSION and AWARDS v2 gate, L7 (SHIPS_BOOK.md; public/modules/host/replay.js, replayArt.js, awards.js; config.REPLAY, config.AWARDS). Headless, no browser.
//   node tools/buildsim.mjs --check-replay        or directly:   node tools/replay-check.mjs [--seed 1] [--quick]
//
//   (a) THE RECORDER stays inside its memory caps: the rolling buffer, a creature's segments, many moments at once, and a tiny MAX_BYTES that sheds frames instead of growing
//   (b) THE RIGHT MOMENT: with three moments in a stop the clip is the heaviest one's, it starts before the moment and ends after it, the caption names the player(s), the film is slow motion and
//       adds only a few seconds to the scorecard
//   (c) VIEW ONLY: the same seeded stop with the replay on and off ends in the same sim state (a hash of the ships, the crew, the sky and the random draws), up to the dock
//   (d) AWARDS v2 are chosen right from staged stats and moments: at most four, the hero first, Butterfingers, Fell Overboard Twice / N Times, Sky Pirate, Stoker of the Stop, nobody over
//       PER_PERSON, small counts earn nothing, ties go to the first; each human's phone gets one card
//   (e) SKIP: SPACE / CAST OFF ends the film at once and the awards follow; the scorecard's own clock is unchanged
//   (f) THE TV DRAWS the film (every 0.25 s of a clip, ships, crew, a creature, a gunship) and the awards scorecard on a stub canvas: 0 errors, nothing under 22 px, the caption and the names on it
//   (g) A STOP FLOWN BY BOTS ends in a scorecard (with its film when the stop had a heavy moment), 0 errors; the L7 switch off (NO_L7=1) is the old scorecard
// Exit code 1 on any failure.
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

process.env.BOOK_ON = '1'; // (the Book, and with it L7, is off in a Node tool unless asked for)
delete process.env.NO_BOOK2;
delete process.env.NO_L7;
installShims();
let clock = seedRandom(seed);

// ---- a stub canvas: a transform stack and a record of the text it was asked for ----
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
        case 'fillText': case 'strokeText': return (s, x, y) => { rec.texts.push({ kind: k, s: String(s), x, y, font: o.font, tx: m[4], ty: m[5] }); };
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
const RP = await load('modules/host/replay.js');
const AW = await load('modules/host/awards.js');
const { createLogbook } = await load('modules/host/logbookArt.js');
const { createLogArt } = await load('modules/host/logArt.js');
const { createReplayArt } = await load('modules/host/replayArt.js');
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
const until = (sim, cond, maxSec) => { let n = 0; for (; n < maxSec * 60 && !cond(); n++) step(sim); return cond() ? n / 60 : -1; };
const COLORS = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00', '#2a9d8f', '#e76f51'];
const R = config.REPLAY;

// A sim cast off: `humans` named phones (a fake socket records what they are sent) and `bots` bots, a named ship (no christening vote).
function boot({ humans = 0, bots = 8, env = null, map = 'open', seed: sd = seed } = {}) {
  clock = seedRandom(sd);
  config.MAPS.FORCE_KIND = map;
  config.ENVIRONMENTS.FORCE = env;
  config.ESCORT.AUTO_PATROL = false;
  config.SCRAP.ENABLED = false;
  const sim = createSimulation();
  const st = sim.state;
  const sent = [];
  sim.setSocket({ emit: (ev, payload) => sent.push({ ev, ...payload }) });
  st.shipName = 'The Brass Heron';
  const e = st.ships[0].layout.boarderEntryPoints;
  const who = ['Mia', 'Zed', 'Ola'];
  for (let i = 0; i < humans + bots; i++) {
    const human = i < humans, id = human ? 'h' + i : 'bot' + (i - humans);
    st.players[id] = { id, bot: !human, human, name: human ? who[i] : 'Bot' + (i - humans + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: COLORS[i % COLORS.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  step(sim, 5);
  return { sim, st, sent };
}
const pxOf = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(t.font || ''); return m ? +m[1] : 99; };
const g0 = () => (globalThis.gameErrors || []).length;

// ---- (a) the recorder stays inside its caps ----
console.log('--- (a) the recorder and its memory ---');
{
  const A = boot({ bots: 8 });
  const { sim, st } = A;
  step(sim, 60 * 40);
  const s = sim.replay.stats();
  const keep = Math.ceil((R.PRE + 0.4) * R.FPS);
  report(s.frames === keep && s.bytes > 0 && s.bytes <= R.MAX_BYTES, `40 s of flight: the rolling buffer holds ${s.frames} frames (${keep} = PRE + 0.4 s at ${R.FPS} a second), ${(s.bytes / 1024).toFixed(0)} KB of the ${(R.MAX_BYTES / 1024).toFixed(0)} KB cap`);
  const seconds = (() => { const c0 = s.clock; step(sim, 60 * 10); return sim.replay.stats().clock - c0; })();
  report(Math.abs(seconds - 10) < 0.05, `the recorder's clock follows the flying steps (${seconds.toFixed(2)} s for 10 s)`);
  void st;
}
{ // a creature: the Kraken's segments
  const A = boot({ bots: 8, env: 'sea', seed: 2 });
  const { sim, st } = A;
  const cr = sim.creatures.spawn('kraken');
  until(sim, () => cr.mode === 'idle', 20);
  step(sim, 60 * 6);
  sim.moments.moment('creature-win', { who: ['bot1'], data: { creature: 'The Kraken', kind: 'kraken', way: 'hp' } });
  sim.moments.moment('boss-down', { who: ['bot2'] });
  sim.moments.moment('flagship-down', { who: ['bot3'] });
  sim.moments.moment('ring-fall', { who: ['bot4'] });
  sim.moments.moment('nemesis-down', { who: ['bot5'] });
  const s = sim.replay.stats();
  report(s.pending <= R.MAX_PENDING, `five heavy moments at once: at most ${R.MAX_PENDING} clips are filmed together (${s.pending} pending)`);
  step(sim, 60 * 4);
  const s2 = sim.replay.stats();
  const f = (() => { let fr = null; sim.replay.mark = sim.replay.mark; return fr; })();
  void f;
  report(s2.bytes <= R.MAX_BYTES && s2.best && s2.best.frames >= 8, `with a Kraken in the sky: ${(s2.bytes / 1024).toFixed(0)} KB, within the cap; the best clip has ${s2.best && s2.best.frames} frames`);
  const clip = (() => { const m = sim.moments.best(st.moments.filter((q) => q.weight >= R.MIN_WEIGHT)); void m; return null; })();
  void clip;
  // the creature's bones are in the frames, within the caps
  sim.onMarker({ kind: 'home', lap: 2 });
  const film = st.scorecard && st.scorecard.film;
  const frame = film && film.clip.frames[film.clip.mark];
  const segs = frame && frame.R ? frame.R.p.reduce((a, r) => a + (r.length - 1) / 3, 0) : 0;
  report(!!film && !!frame && !!frame.R && frame.R.p.length >= 3 && segs <= R.CAPS.SEGS + R.CAPS.PARTS, `the Kraken is in the film: ${frame && frame.R ? frame.R.p.length : 0} limbs, ${segs} bones (cap ${R.CAPS.SEGS} + tips)`);
}
{ // a tiny cap sheds frames instead of growing
  const old = R.MAX_BYTES;
  R.MAX_BYTES = 6000;
  const A = boot({ bots: 8, seed: 3 });
  step(A.sim, 60 * 6);
  A.sim.moments.moment('boss-down', { who: ['bot1'] });
  step(A.sim, 60 * 3);
  const s = A.sim.replay.stats();
  report(s.bytes <= 6000 + 2000 && errors === 0, `with MAX_BYTES at 6 KB the recorder sheds frames: ${(s.bytes / 1024).toFixed(1)} KB held, ${s.frames} frames, ${s.pending} pending`);
  R.MAX_BYTES = old;
}

// ---- (b) the right moment, the caption, slow motion, the added seconds ----
console.log('--- (b) the right moment ---');
let stage = null;
{
  const A = boot({ humans: 1, bots: 7, seed: 5 });
  const { sim, st, sent } = A;
  step(sim, 60 * 12);
  const M = sim.moments;
  const m1 = M.moment('gunship-shot', { who: ['bot1'], data: { name: 'The Iron Widow' } });
  step(sim, 60 * 3);
  const m2 = M.moment('creature-win', { who: ['h0'], data: { creature: 'The Kraken', kind: 'kraken', way: 'mouth' } });
  step(sim, 60 * 3);
  const m3 = M.moment('gunship-fled', { who: ['bot2'], data: { name: 'The Black Harrier' } });
  step(sim, 60 * 1);
  // stats for the awards, a man who fell twice, a man who dropped two loads
  const P = st.players;
  P.h0.stats = { coal: 12 };
  P.bot3.stats = { boarding: 3, fires: 1 };
  P.bot0.stats = { fires: 3, kills: 2 };
  st.momentOverboard(P.bot4); st.momentOverboard(P.bot4);
  for (let k = 0; k < 2; k++) { P.bot5.carry = 'coal'; step(sim, 2); P.bot5.carry = null; P.bot5.ko = 3; step(sim, 2); P.bot5.ko = 0; step(sim, 2); }
  sim.onMarker({ kind: 'home', lap: 2 });
  const sc = st.scorecard;
  const film = sc && sc.film;
  const clip = film && film.clip;
  report(!!film && clip.kind === 'creature-win' && clip.n === m2.n && m1.weight < m2.weight && m3.weight < m2.weight, `three moments (weight ${m1.weight}, ${m2.weight}, ${m3.weight}): the film is the heaviest one's (${clip && clip.kind}, moment ${clip && clip.n})`);
  report(!!clip && clip.who.length === 1 && clip.who[0] === 'Mia' && !!sc.play && /Mia/.test(sc.play.text), `the caption names the player: PLAY OF THE MISSION: "${sc && sc.play && sc.play.text}"`);
  const before = clip.mark / clip.fps, after = clip.len - before;
  report(before >= R.PRE - 0.3 && before <= R.PRE + 0.1 && after >= R.POST - 0.3 && after <= R.POST + 0.1, `the clip starts ${before.toFixed(1)} s before the moment and runs ${after.toFixed(1)} s after it (PRE ${R.PRE}, POST ${R.POST})`);
  report(Math.abs(clip.frames[clip.mark].t - m2.t) <= 1 / R.FPS + 0.05, `the frame at the mark is the moment's own time (${clip.frames[clip.mark].t} s vs ${m2.t} s)`);
  report(clip.frames.length <= Math.ceil((R.PRE + R.POST) * R.FPS) + 2 && clip.cam.length === clip.frames.length, `${clip.frames.length} frames and a camera for each`);
  const sp = RP.speedAt(clip, clip.mark / clip.fps), sp0 = RP.speedAt(clip, 0);
  report(Math.abs(sp - R.SPEED.KEY) < 0.02 && Math.abs(sp0 - R.SPEED.LEAD) < 0.05, `slow motion: x${sp0.toFixed(2)} at the start, x${sp.toFixed(2)} at the moment`);
  const f2 = RP.createFilm(clip);
  let n = 0;
  while (!f2.done && n < 60 * 20) { RP.stepFilm(f2, DT); n++; }
  report(f2.done && f2.real > clip.len * 1.15 && f2.real <= 7, `the film plays ${clip.len.toFixed(1)} s of sky in ${f2.real.toFixed(1)} s (slower than real, and only ${f2.real.toFixed(1)} s added to the scorecard)`);
  // the stats and the moments became the awards
  const titles = sc.rows.map((r) => r.title + ' (' + r.name + ')');
  report(sc.rows.length <= config.AWARDS.MAX && sc.rows.length >= 3 && sc.rows[0].title === 'Hero' && sc.rows[0].name === 'Mia', `the scorecard has ${sc.rows.length} awards, the hero first: ${titles.join(', ')}`);
  report(sc.rows.some((r) => r.title === 'Fell Overboard Twice' && r.name === 'Bot5') && sc.rows.some((r) => r.title === 'Butterfingers' && r.name === 'Bot6') || sc.rows.length === config.AWARDS.MAX, 'a man who went over the side twice and a man who dropped two loads are on it (or the four best came first)');
  stage = { sim, st, sent, sc, film, clip, m2 };
}

{ // Butterfingers is read from real play: a load in his hands, gone because he was knocked out (or fell)
  const B = boot({ bots: 4, seed: 6 });
  const P = B.st.players;
  step(B.sim, 60 * 4);
  for (let k = 0; k < 2; k++) { P.bot1.carry = 'coal'; step(B.sim, 3); P.bot1.carry = null; P.bot1.ko = 3; step(B.sim, 3); P.bot1.ko = 0; step(B.sim, 3); }
  P.bot2.carry = 'sandbag'; step(B.sim, 3); P.bot2.carry = null; step(B.sim, 3); // (put down on purpose: nobody dropped it)
  P.bot3.carry = 'hammer'; step(B.sim, 3); P.bot3.carry = null; P.bot3.ko = 3; step(B.sim, 3); // (a tool is no load)
  const rows = B.sim.moments.takeTally('drops');
  report(rows.length === 1 && rows[0].ref.name === 'Bot2' && rows[0].n === 2, `Butterfingers counts the loads a man lost when knocked out (${rows.map((x) => x.ref.name + ' x' + x.n).join(', ')}); a load put down on purpose and a dropped tool do not count`);
}

// ---- (c) view only ----
console.log('--- (c) the replay is view only ---');
{
  const digest = (on) => {
    R.ENABLED = on;
    const A = boot({ humans: 1, bots: 7, seed: 7 });
    const { sim, st } = A;
    let draws = 0;
    const r0 = Math.random;
    Math.random = () => { draws++; return r0(); };
    step(sim, 60 * 10);
    sim.fire.ignite(st.ships[0].layout.deckIndex('main'), 700, 'hit');
    sim.moments.moment('boss-down', { who: ['bot1'] });
    step(sim, 60 * 6);
    sim.moments.moment('creature-win', { who: ['h0'], data: { creature: 'The Kraken', kind: 'kraken', way: 'hp' } });
    step(sim, 60 * 3);
    const frozen = () => JSON.stringify({
      draws, hull: st.ship.hull, kills: st.kills, alt: st.ship.alt, x: st.ships.map((s) => [s.pose.x, s.pose.y, s.pose.f]), gas: st.ship.gas, fuel: st.ship.fuel,
      crew: Object.values(st.players).map((p) => [p.id, Math.round(p.x), Math.round(p.y), p.d, p.carry || null, p.ko || 0, Object.entries(p.stats || {}).sort().join()]),
      shells: st.shells.length, bullets: st.bullets.length, fires: st.fires.length, enemy: [st.enemy.x, st.enemy.y, st.enemy.hp], moments: st.moments.length,
    });
    sim.onMarker({ kind: 'home', lap: 2 });
    const atCard = frozen();
    const film = st.scorecard && st.scorecard.film;
    const hasFilm = !!film;
    until(sim, () => !!st.vote, 40);
    const atDock = frozen();
    Math.random = r0;
    return { atCard, atDock, hasFilm, vote: !!st.vote, scTime: st.scorecard };
  };
  const a = digest(true), b = digest(false);
  R.ENABLED = true;
  report(a.hasFilm && !b.hasFilm, 'with the replay on the scorecard has a film, off it has none');
  report(a.atCard === b.atCard, `the sim state at the scorecard is identical with the replay on and off (${a.atCard.length} chars: ships, crew, the sky, ${JSON.parse(a.atCard).draws} random draws)`);
  report(a.atDock === b.atDock && a.vote && b.vote, 'and when the dock opens after it (the film is only a longer pause; nothing it did reached the sim)');
}

// ---- (d) the awards from staged stats ----
console.log('--- (d) awards v2 ---');
{
  const A = config.AWARDS;
  const mk = (name, stats = {}) => ({ name, color: '#e63946', stats });
  const pl = [mk('Ann', { coal: 5, fires: 1 }), mk('Ben', { fires: 3, kills: 2 }), mk('Cy', { boarding: 3, holes: 1 }), mk('Di')];
  let rows = AW.chooseAwards({ players: pl, falls: { Ben: 2 }, drops: [{ ref: { name: 'Cy', color: '#3a86ff' }, n: 3 }], play: { crew: [{ name: 'Ann', color: '#e63946' }], weight: 8 } });
  const t = rows.map((r) => r.title + ':' + r.name).join(' | ');
  report(rows.length === 4 && rows[0].title === 'Hero' && rows[0].name === 'Ann' && rows.some((r) => r.title === 'Sky Pirate' && r.name === 'Cy') && rows.some((r) => r.title === 'Butterfingers' && r.name === 'Cy') && rows.some((r) => r.title === 'Fell Overboard Twice' && r.name === 'Ben'), `staged stats pick: ${t}`);
  const perPerson = Object.values(rows.reduce((m, r) => ((m[r.name] = (m[r.name] || 0) + 1), m), {}));
  report(Math.max(...perPerson) <= A.PER_PERSON && rows.every((r) => r.icon && r.title && r.name && typeof r.unit === 'string' && Number.isFinite(r.score)), `nobody wins more than ${A.PER_PERSON}; every row has an icon, a title, a name and words`);
  rows = AW.chooseAwards({ players: pl, falls: { Ben: 3 }, drops: [], play: null });
  report(rows.some((r) => r.title === 'Fell Overboard 3 Times'), `three falls: "${(rows.find((r) => /Overboard/.test(r.title)) || {}).title}"`);
  rows = AW.chooseAwards({ players: [mk('Ann', { coal: 6 }), mk('Ben', { coal: 6 })], falls: {}, drops: [], play: null });
  report(rows.length === 1 && rows[0].title === 'Stoker of the Stop' && rows[0].name === 'Ann' && rows[0].value === 6, `a tie goes to the first aboard, and coal is "${rows[0] && rows[0].title}"`);
  rows = AW.chooseAwards({ players: [mk('Ann', { coal: 2, kills: 2, holes: 1, fires: 1 })], falls: { Ann: 1 }, drops: [{ ref: { name: 'Ann' }, n: 1 }], play: { crew: [{ name: 'Ann' }], weight: 3 } });
  report(rows.length === 0, 'small counts earn nothing (2 coal, 1 fall, 1 drop, a play of weight 3): no award is made up');
  const many = Object.fromEntries(Object.keys(A.STATS).map((k) => [k, 99]));
  rows = AW.chooseAwards({ players: [mk('Ann', many), mk('Ben', many), mk('Cy', many)], falls: { Ann: 5 }, drops: [{ ref: { name: 'Ben' }, n: 9 }], play: { crew: [{ name: 'Cy' }], weight: 10 } });
  report(rows.length === A.MAX && rows.every((r) => Number.isFinite(r.score)), `a stop where everybody did everything still shows only ${rows.length} awards`);
  report(AW.awardText({ value: null, unit: 'made the play of the mission', name: 'Mia' }).length > 10 && /5 coal loads/.test(AW.awardText({ value: 5, unit: 'coal loads', name: 'Mia' })), `the phone's words: "${AW.awardText({ value: 5, unit: 'coal loads', name: 'Mia' })}"`);
  // the titles named in the brief exist
  const names = Object.values(A.STATS).map((s) => s.title).concat([A.HERO.TITLE, A.BUTTER.TITLE, A.OVERBOARD.TITLE]);
  report(['Hero', 'Butterfingers', 'Firefighter', 'Sky Pirate', 'Stoker of the Stop', 'Fell Overboard Twice'].every((n) => names.includes(n)), 'Hero, Butterfingers, Firefighter, Sky Pirate, Stoker of the Stop and Fell Overboard Twice are all awards');
}

// ---- (e) skip, the phone, the scorecard's clock ----
console.log('--- (e) skip and the phones ---');
{
  const { sim, st, sent, sc, film } = stage;
  const t0 = sc.t;
  step(sim, 60 * 1);
  report(!film.done && sc.t === t0 && film.u > 0, `while the film plays the scorecard's clock waits (t ${sc.t}, film at ${film.u.toFixed(2)} s)`);
  report(!sent.some((x) => x.ui && x.ui.award), 'the phones are not told of their awards until the film is over');
  sim.castOff();
  report(film.done && film.skipped, 'CAST OFF (SPACE) skips the replay at once');
  step(sim, 2);
  const cards = sent.filter((x) => x.ev === 'host:ui' && x.ui && x.ui.award);
  report(cards.length === 1 && cards[0].id === 'h0' && cards[0].ui.award.title === 'Hero' && /Also: Stoker of the Stop/.test(cards[0].ui.award.text) && cards[0].ui.award.secs === config.AWARDS.PHONE_SECS, `Mia's phone gets one card: "${cards[0] && cards[0].ui.award.icon} ${cards[0] && cards[0].ui.award.title}" - ${cards[0] && cards[0].ui.award.text}`);
  report(sc.t > 0 && st.scorecard === sc, `the awards follow, with the scorecard's own ${config.VOTE.SCORECARD_TIME_V2} s clock (t ${sc.t.toFixed(2)})`);
  const before = sent.length;
  step(sim, 60 * 2);
  report(sent.filter((x) => x.ui && x.ui.award).length === 1 && sent.length >= before, 'the card is sent once');
  until(sim, () => !st.scorecard, 20);
  report(!st.scorecard && (!!st.vote || st.phase === 'flying'), 'the scorecard ends and the dock opens as before');
  // a second castOff outside a film does nothing to a scorecard without one
  const B = boot({ bots: 3, seed: 9 });
  B.sim.state.scorecard = { t: 5, rows: [], gain: {} };
  B.sim.castOff();
  report(B.sim.state.scorecard && B.sim.state.scorecard.t === 5, 'SPACE during a scorecard without a film does nothing');
}

// ---- (f) the TV draws it ----
console.log('--- (f) the TV draws the film and the awards ---');
{
  const { sim, st } = stage;
  void sim;
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const ctx = stubCtx();
  const book = createLogbook({ ctx });
  const logArt = createLogArt({ ctx, book, crewAt: () => {} });
  const art = createReplayArt({ ctx, book, logArt });
  const clip = stage.clip;
  const play = stage.sc.play;
  let bad = 0, smallest = 99, shown = 0, caption = false, names = false, tag = false;
  const e0 = g0();
  for (let u = 0; u <= clip.len + 0.01; u += 0.25) {
    rec.texts.length = 0;
    const film = { clip, u: Math.min(u, clip.len), done: false, real: u, skipped: false };
    try { art.draw(film, { play, shipName: st.shipName }); } catch (e) { bad++; }
    for (const t of rec.texts) if (t.s.trim()) smallest = Math.min(smallest, pxOf(t));
    if (rec.texts.some((t) => /PLAY OF THE MISSION/.test(t.s))) caption = true;
    if (rec.texts.some((t) => t.s === 'Mia')) names = true;
    if (rec.texts.some((t) => /SLOW MOTION/.test(t.s)) && rec.texts.some((t) => t.s === R.ART.HINT)) tag = true;
    shown++;
  }
  report(bad === 0 && g0() === e0 && shown >= 12, `the film draws at ${shown} points of the clip with 0 errors`);
  report(smallest >= R.ART.MIN_PX - 0.01, `...nothing under ${R.ART.MIN_PX} px (smallest ${smallest})`);
  report(caption && names && tag, '...with PLAY OF THE MISSION and the player\'s name on it, the SLOW MOTION tag and the skip hint');
  // other scenes: a gunship, a ship coming about, a flier, nothing at all
  const odd = (mut) => { const c = JSON.parse(JSON.stringify(clip)); mut(c); return c; };
  let oddBad = 0;
  for (const c of [
    odd((q) => q.frames.forEach((f) => { f.R = null; f.F = []; f.B = []; f.X = []; f.K = []; f.C = []; })),
    odd((q) => q.frames.forEach((f) => { f.S.forEach((s) => { s[3] = -1; s[4] = 0.2; s[5] = 0.2; }); })),
    odd((q) => { q.statics.push({ ...q.statics[0], main: false, foe: true }); q.frames.forEach((f) => f.S.push([q.statics.length - 1, f.S[0][1] + 2500, f.S[0][2] - 100, 1, 0, 1, 0])); }),
    odd((q) => q.frames.forEach((f) => { f.C.forEach((c2) => { c2[3] = 5; }); })),
  ]) {
    const e1 = g0();
    try { art.draw({ clip: c, u: c.len / 2, done: false, real: 1, skipped: false }, { play, shipName: null }); } catch (e) { oddBad++; }
    if (g0() !== e1) oddBad++;
  }
  report(oddBad === 0, 'an empty sky, a ship about to come about, a second ship and a man in the air all draw cleanly');
  // through the whole renderer, as the TV does it: the film, then the awards
  const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
  const cam = createWorldCamera();
  const draw = (n = 1) => { let exc = 0; for (let f = 0; f < n; f++) { rec.texts.length = 0; try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); } } return exc; };
  const B = boot({ humans: 1, bots: 7, seed: 5 });
  step(B.sim, 60 * 12);
  B.sim.moments.moment('creature-win', { who: ['h0'], data: { creature: 'The Kraken', kind: 'kraken', way: 'mouth' } });
  step(B.sim, 60 * 3);
  B.st.players.h0.stats = { coal: 4 };
  B.st.players.bot3.stats = { boarding: 3 };
  B.sim.onMarker({ kind: 'home', lap: 2 });
  const r2 = createRenderer({ ctx: stubCtx(), state: B.st, canvas });
  const drawB = (n = 1) => { let exc = 0; for (let f = 0; f < n; f++) { rec.texts.length = 0; try { r2.renderFrame(clock.ms, cam.update(1 / 60, B.st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); } } return exc; };
  void draw;
  step(B.sim, 60 * 2);
  let exc = drawB(2);
  const during = rec.texts.map((t) => t.s).join('|');
  report(exc === 0 && /PLAY OF THE MISSION/.test(during) && /THE REPLAY/.test(during) && !/Crew awards/.test(during), 'while the film plays the renderer draws the replay page (THE REPLAY, PLAY OF THE MISSION), not the awards');
  const pageOf = (name, end) => { const all = rec.texts.map((t) => t.s), at = all.lastIndexOf(name.toUpperCase()); if (at < 0) return []; const to = all.findIndex((s, i) => i > at && end.test(s)); return rec.texts.slice(at, to < 0 ? undefined : to + 1); }; // (the replay / scorecard page is drawn from the ship's name to its last line; the sky's own labels around it are not TV pages)
  const small1 = pageOf(B.st.shipName, /skip the replay/).filter((t) => pxOf(t) < 22 - 0.01 && t.s.trim());
  const page1 = pageOf(B.st.shipName, /skip the replay/).length;
  B.sim.castOff();
  step(B.sim, 3);
  exc += drawB(2);
  const after = rec.texts.map((t) => t.s).join('|');
  const small2 = pageOf(B.st.shipName, /^Salvage +/).filter((t) => pxOf(t) < 22 - 0.01 && t.s.trim());
  report(page1 > 8 && pageOf(B.st.shipName, /^Salvage +/).length > 8, `(the replay page has ${page1} texts, the awards page ${pageOf(B.st.shipName, /^Salvage +/).length})`);
  report(exc === 0 && /Crew awards/.test(after) && /Hero/.test(after) && /Stoker of the Stop/.test(after) && /Sky Pirate/.test(after), `after the film the scorecard shows the awards (${(after.match(/Hero|Stoker of the Stop|Sky Pirate|Butterfingers/g) || []).join(', ')})`);
  report(small1.length === 0 && small2.length === 0, `...and the TV pages have nothing under 22 px${small1[0] ? ' - e.g. "' + small1[0].s + '" at ' + pxOf(small1[0]) : ''}${small2[0] ? ' - "' + small2[0].s + '" at ' + pxOf(small2[0]) : ''}`);
}

// ---- (g) bots flying a stop; the switch ----
console.log('--- (g) bots flying a stop, and the switch ---');
{
  let films = 0, cards = 0, tried = 0, bad = 0;
  const seeds = quick ? [13] : [13, 14, 15];
  for (const sd of seeds) {
    const A = boot({ bots: 8, seed: sd });
    const { sim, st } = A;
    tried++;
    const t = until(sim, () => !!st.scorecard, 60 * 9);
    if (t < 0) continue;
    cards++;
    const film = st.scorecard.film;
    if (film) {
      films++;
      let n = 0;
      while (!film.done && n < 60 * 12) { RP.stepFilm(film, DT); n++; }
      if (!film.done || film.real > 7.5) bad++;
    }
    step(sim, 60 * 2);
    if (st.scorecard && st.scorecard.rows.length > config.AWARDS.MAX) bad++;
  }
  report(cards >= 1 && bad === 0 && errors === 0, `${cards} of ${tried} bot-flown stops reached a scorecard, ${films} with a film, 0 problems${firstErrors[0] ? ': ' + firstErrors[0] : ''}`);
  const off = (() => { R.ENABLED = false; config.AWARDS.ENABLED = false; const B = boot({ bots: 8, seed: 5 }); step(B.sim, 60 * 8); B.sim.moments.moment('creature-win', { who: ['bot1'], data: { creature: 'The Kraken', kind: 'kraken', way: 'hp' } }); step(B.sim, 60 * 3); B.st.players.bot2.stats = { coal: 1, fires: 1 }; B.sim.onMarker({ kind: 'home', lap: 2 }); R.ENABLED = true; config.AWARDS.ENABLED = true; return B.st.scorecard; })();
  report(!!off && !off.film && off.rows.some((r) => r.title === 'Firefighter' || r.title === 'Stoker') && off.rows.length === 2, `with L7 off the scorecard is the old one: no film, an award for every stat (${off && off.rows.map((r) => r.title).join(', ')})`);
  if (!quick) {
    const runBot = (env) => spawnSync(process.execPath, [path.join(root, 'tools', 'botsim.mjs'), '--minutes', '1', '--seed', '2', '--difficulty', 'normal'], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, ...env } });
    const strip = (s) => (s || '').split('\n').filter((l) => !/^\s*(time|elapsed|wall|real time)/i.test(l)).join('\n');
    const a = runBot({ BOOK_ON: '1' }), b = runBot({ BOOK_ON: '1', NO_L7: '1' });
    report(a.status === 0 && b.status === 0 && strip(a.stdout) === strip(b.stdout) && /errors: 0/.test(a.stdout), `botsim 1 min, seed 2: the same output with L7 on and with NO_L7=1 (${(a.stdout || '').length} bytes, 0 errors)`);
  }
}

report(errors === 0, `0 simulation errors overall${firstErrors.length ? ': ' + firstErrors[0] : ''}`);
console.log(ok ? '\nAll Ship\'s Book L7 checks passed.' : '\nSome Ship\'s Book L7 checks FAILED.');
process.exit(ok ? 0 : 1);
