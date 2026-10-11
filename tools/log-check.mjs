// THE SHIP'S BOOK gate, L0 + L1 (SHIPS_BOOK.md; public/modules/host/moments.js, logWriter.js, logArt.js; config.LOG). Headless, no browser.
//   node tools/buildsim.mjs --check-log        or directly:   node tools/log-check.mjs [--seed 1] [--quick] [--samples]
//
//   (a) MOMENTS ARE RECORDED for the key events, in scripted runs with 8 bots: the first fire out, a patch (the stop-end leader), a creature win (who struck the last blow), a gunship shot down / blown up by a
//       charge / fled (her name, who fired), a break-off (what was lost), GOING DOWN saved (who patched), overboard falls (3 = the lunatic), a crew cannon miss, a sandbag carried all stop, the helm held
//   (b) EVERY LOG LINE NAMES SOMEONE: every template, filled with one name; every line the bot runs wrote (the dock lines, the run's Log, the postcard, the play of the mission)
//   (c) 8 BOTS, 10 MINUTES, NORMAL: at least 6 named moments per 10 minutes (botsim.mjs, seeds 1-3; --quick: one seed)
//   (d) THE POSTCARD draws on a stub canvas with 0 errors, for a lost ship and for a victory: VICTORY / SHIP LOST on it, the route, the Log lines, no text smaller than config.LOG.ART.MIN_PX; the scorecard
//       (PLAY OF THE MISSION, and never "Nobody did much") and the dock (the Log line) draw too
//   (e) NO LINE REPEATS within a run: the bot runs, and a made-up run of 14 stops where the same thing happens to the same people at every one
//   (f) TEMPLATES FILL CLEAN: no "undefined", "NaN", "null" or a stray brace, whatever the data (missing names, n = 0 / NaN, no creature, no gunship)
//   (g) DATA ONLY: the same seeded minute with the Book on and off draws the same random numbers and ends with the same hull and kills
// Exit code 1 on any failure.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const seed = flag('seed', 1), quick = argv.includes('--quick'), samples = argv.includes('--samples');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);

// ---- a stub canvas: a transform stack, and a record of the text it was asked for (with the font it was asked in) ----
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
const { createLogbook } = await load('modules/host/logbookArt.js');
const { createLogArt } = await load('modules/host/logArt.js');
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
const until = (sim, cond, maxSec) => { for (let i = 0; i < maxSec * 60; i++) { if (cond()) return true; step(sim); } return cond(); };

// A sim with n bots cast off (the recipe of tools/botsim.mjs).
function boot(n = 8, opts = {}) {
  clock = seedRandom(opts.seed ?? seed);
  config.MAPS.FORCE_KIND = opts.map || 'open';
  config.ENVIRONMENTS.FORCE = opts.env || null;
  config.ESCORT.AUTO_PATROL = false;
  config.SCRAP.ENABLED = false; // (the Ship's Book's scenes are seeded for the sky without flotsam: the helm's detours move her, and a gunship scene leaves before the hunt; tools/scrap-check.mjs covers scrap and its moments)
  const sim = createSimulation();
  const st = sim.state;
  const e = st.ships[0].layout.boarderEntryPoints;
  const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
  for (let i = 0; i < n; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  step(sim, 5);
  return { sim, st, ship: st.ships[0] };
}
const kinds = (sim) => sim.state.moments.map((m) => m.kind);
const find = (sim, kind, pred = () => true) => sim.state.moments.find((m) => m.kind === kind && pred(m));
const named = (m) => !!m && m.who.length > 0 && m.who.every((w) => /^Bot\d+$/.test(w));
const NAME = /Bot\d+|Zed|Mia|Kenny|Bob/;

// ---- (a) the key events leave a moment, with names ----
console.log('--- (a) moments are recorded ---');
{
  const A = boot(8);
  const { sim, st } = A;
  const main = st.ships[0].layout.deckIndex('main');
  // a fire, put out by the crew: the first fire out
  sim.fire.ignite(main, 700, 'hit');
  const out = until(sim, () => !!find(sim, 'fire-first'), 60);
  const ff = find(sim, 'fire-first');
  report(out && named(ff), `a fire put out: "fire-first" with the crewman's name (${ff ? ff.who.join('&') + ' in ' + ff.where : 'none'})`);
  // holes in the hull, patched; at the stop's end the busiest patcher earns a moment
  for (let i = 0; i < 6; i++) sim.impact(300 + i * 150, 650, 5);
  step(sim, 60 * 40);
  const holes = Object.values(st.players).reduce((a, p) => a + ((p.stats && p.stats.holes) || 0), 0);
  const entry = sim.closeStop('done');
  const lead = find(sim, 'leader', (m) => m.data.stat === 'holes' || m.data.stat === 'fires' || m.data.stat === 'repairs');
  report(holes > 0 && named(lead) && !!entry && NAME.test(entry.text), `holes patched (${holes}) become a stop-end moment: ${lead ? lead.data.stat + ' x' + lead.data.n + ' by ' + lead.who.join('&') : 'none'}; the stop's Log reads: "${entry && entry.text}"`);
  report(kinds(sim).every((k) => typeof k === 'string') && st.moments.every((m) => Number.isFinite(m.t) && m.stop >= 1 && m.who.length && Number.isFinite(m.weight) && m.data && Array.isArray(m.data.crew)), `every moment has t, stop, who, weight and data.crew (${st.moments.length} so far)`);

  // a break-off: what was lost
  const gun = st.ships[0].layout.stations.find((q) => q.kind === 'gun');
  const r = st.ships[0].sim.breakOff({ kind: 'part', name: gun.n, cause: 'test' }, { force: true });
  const bo = find(sim, 'breakoff');
  report(!!r && named(bo) && bo.data.names.length > 0, `a break-off: "breakoff" names what was lost (${bo ? bo.data.names.join(', ') : 'none'}) and who stood nearest (${bo ? bo.who : ''})`);

  // overboard: three falls by the same person
  const bot = st.players.bot3;
  for (let k = 0; k < 3; k++) {
    Object.assign(bot, { fall: true, tumble: true, fly: false, air: false, ko: 0, lock: null, conn: null, d: 1, x: 5000, y: 700, tvy: 900, tvx: 0, carry: null });
    until(sim, () => !bot.fall, 20);
  }
  const ob = st.moments.filter((m) => m.kind === 'overboard' || m.kind === 'overboard-lunatic');
  report(ob.length === 3 && ob[2].kind === 'overboard-lunatic' && ob[2].who[0] === 'Bot4' && ob[2].data.n === 3, `three falls overboard by one crewman: ${ob.map((m) => m.kind + '#' + m.data.n).join(', ')} (the third is the lunatic, weight ${ob[2] && ob[2].weight})`);

  // a crew cannon shot that missed everything
  Object.assign(bot, { fly: true, air: true, cannon: true, fall: false, ko: 0, lock: null, conn: null, d: 1, x: 4000, y: 3000, fvx: 0, fvy: 400, apex: 0, noLand: 0 });
  until(sim, () => !!find(sim, 'cannon-miss'), 20);
  report(named(find(sim, 'cannon-miss')), `a crew cannon miss: "cannon-miss" by ${find(sim, 'cannon-miss') && find(sim, 'cannon-miss').who}`);

  // a sandbag carried through a whole stop
  const e0 = st.ships[0].layout.boarderEntryPoints;
  st.players.mia = { id: 'mia', bot: false, name: 'Mia', species: 'fox', color: '#06d6a0', x: e0[0].x + 200, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, carry: 'sandbag' };
  for (let i = 0; i < 60 * (config.LOG.SANDBAG_SECS + 2); i++) { st.players.mia.carry = 'sandbag'; step(sim); }
  report(!!find(sim, 'sandbag') && find(sim, 'sandbag').who[0] === 'Mia', `a sandbag carried for ${config.LOG.SANDBAG_SECS} s: "sandbag" by ${find(sim, 'sandbag') && find(sim, 'sandbag').who}`);
  report(errors === 0, `0 errors so far${firstErrors.length ? ': ' + firstErrors[0] : ''}`);
}
{ // a giant creature: who struck the last blow, and how
  const CR = config.CREATURES;
  const A = boot(8, { env: 'sea', seed: 2 });
  const { sim, st } = A;
  const cr = sim.creatures.spawn('kraken');
  until(sim, () => cr.mode === 'idle', 20);
  cr.hooks.hurtPool(1e9, 'shell', 'bot2');
  step(sim, 5);
  const m = find(sim, 'creature-win');
  report(named(m) && m.who[0] === 'Bot3' && m.data.way === 'hp' && /kraken/i.test(m.data.creature), `a creature win: "creature-win" ${m ? m.data.creature + ' by ' + m.data.way + ', final blow ' + m.who : 'none'}`);
  const line = m && LW.sentence(m, { used: new Set() });
  report(!!line && /Bot3/.test(line) && /Kraken/.test(line), `...and the Log tells it: "${line}"`);
  void CR;
}
{ // the enemy gunship: shot down (who fired), blown up by a charge (who planted it), fled (her name)
  const A = boot(8, { seed: 3 });
  const { sim, st } = A;
  const spawn = () => { for (let i = 0; i < 60 && !st.gunship; i++) { sim.gunship.spawn((Math.random() * 1e6) | 0); step(sim, 3 * 60); } return st.gunship; }; // (she needs clear sky off the bow: try again every 3 s)
  const settle = () => { until(sim, () => !st.gunship, 30); step(sim, 10); };
  let g = spawn();
  report(!!g, 'a gunship is spawned');
  if (g) {
    const gname = g.bp.name;
    g.shotBy = 'bot1';
    g.ship.state.down = 1;
    g.ship.ctx.wreck = { t: 0, lap: 1, kills: 0 }; // (her hull gave out: the wreck the sinking code expects)
    until(sim, () => !!find(sim, 'gunship-shot'), 10);
    const m = find(sim, 'gunship-shot');
    report(named(m) && m.who[0] === 'Bot2' && m.data.name === gname, `a gunship shot down: "gunship-shot" ${m && m.data.name}, last shell by ${m && m.who} (weight ${m && m.weight})`);
    settle();
    g = spawn();
    if (g) {
      g.charge = { t: 0.01, by: 'bot3' };
      until(sim, () => !!find(sim, 'gunship-charge'), 10);
      const c = find(sim, 'gunship-charge');
      report(named(c) && c.who[0] === 'Bot4', `a gunship blown up by the charge: "gunship-charge" planted by ${c && c.who} (weight ${c && c.weight})`);
      settle();
    } else report(false, 'a second gunship to blow up');
    g = spawn();
    if (g) {
      until(sim, () => g.phase === 'hunt' || !st.gunship, 60);
      g.ship.state.hull = 3;
      g.retreats = 99;
      until(sim, () => !!find(sim, 'gunship-fled') || !st.gunship, 30);
      const f = find(sim, 'gunship-fled');
      report(named(f) && !!f.data.name, `a gunship that flees: "gunship-fled" with her name (${f && f.data.name})`);
    } else report(false, 'a third gunship to put to flight');
  }
}
{ // GOING DOWN! saved
  const A = boot(8, { seed: 4 });
  const { sim, st } = A;
  step(sim, 60 * 20);
  st.ship.hull = 0;
  step(sim);
  const started = !!st.goingDown;
  const saved = until(sim, () => !st.goingDown, 60);
  const m = find(sim, 'going-down-saved');
  report(started && saved && named(m), `GOING DOWN! saved: "going-down-saved" by ${m && m.who.join(' & ')} (weight ${m && m.weight})`);
}
{ // the helm held through a crisis
  const A = boot(8, { seed: 5 });
  const { sim, st } = A;
  step(sim, 60 * 20);
  const helm = Object.values(st.players).find((p) => sim.getHelm() === p) || null;
  const holder = helm || (() => { const p = st.players.bot0; return p; })();
  void holder;
  // a stretch of low hull: whoever is at the helm for all of it is named when it ends
  const who = sim.getHelm();
  for (let i = 0; i < 60 * 30; i++) { st.ship.hull = Math.min(st.ship.hull, 30); step(sim); if (!sim.getHelm()) break; }
  st.ship.hull = 90;
  step(sim, 5);
  const m = find(sim, 'helm-held');
  report(!!who && named(m) && m.who[0] === who.name, `the helm held through a crisis: "helm-held" ${m ? 'by ' + m.who + ' (' + m.data.secs + ' s)' : 'none (nobody at the helm: ' + !who + ')'}`);
}

// ---- (b) every line names someone; (f) templates fill clean ----
console.log('--- (b) every Log line names someone, (f) templates fill clean ---');
{
  const T = LW.TEMPLATES;
  const odd = [{ n: 0 }, { n: NaN }, { n: undefined }, {}, { n: 7, creature: undefined, name: null, names: [] }, { names: [undefined, 'Aft Gun Deck'], way: 'nope', how: 'x', stat: 'zzz', item: undefined }, { n: 2, creature: 'THE KRAKEN', name: 'IRON WIDOW', names: ['Tail Gun', 'Aft Engine', 'Bay'] }];
  const wheres = [null, undefined, '', 'Boiler Room'];
  const whos = [['Zed'], ['Zed', 'Mia'], ['Zed', 'Mia', 'Bob'], []];
  let bad = 0, unnamed = 0, total = 0, example = '';
  const check = (text, who) => { total++; if (!text || /undefined|NaN|null|[{}]|\[object/.test(text)) { bad++; example = example || text; } if (who.length && !who.some((w) => text.includes(w))) unnamed++; };
  for (const kind of [...Object.keys(T.SENT).map((k) => k.split(':')[0]), 'leader']) {
    const stats = kind === 'leader' ? Object.keys(T.LEADER).concat(['nope']) : [undefined];
    for (const stat of stats) for (const d of odd) for (const where of wheres) for (const who of whos) {
      const m = { n: 1, t: 1, stop: 3, stopName: 'Ember Forge', env: 'ember', kind, who, where, what: '', weight: 3, data: { ...d, ...(stat ? { stat } : {}), crew: [] } };
      const text = LW.sentence(m, { used: new Set() }) || LW.sentence(m, { used: new Set(), again: true });
      check(text, who);
      check(LW.playOf(m), who);
    }
  }
  report(bad === 0, `all templates and play phrases filled with odd data (${total} fills): no "undefined", "NaN", "null" or stray brace${example ? ' - e.g. ' + example : ''}`);
  report(unnamed === 0, `every sentence names the crewman it was about (${unnamed} did not)`);
  let tpl = 0, noName = 0;
  for (const tables of [T.SENT, T.LEADER]) for (const list of Object.values(tables)) for (const s of list) { tpl++; if (!/\{who1?\}/.test(s)) noName++; }
  report(noName === 0, `every one of the ${tpl} sentence variants has a {who} in it; 3 variants for each of ${Object.keys(T.SENT).length + Object.keys(T.LEADER).length} lines (${[...Object.values(T.SENT), ...Object.values(T.LEADER)].filter((l) => l.length !== 3).length} with another count)`);
  const gl = LW.gentleLine([{ name: 'Mia', stats: { holes: 2 } }, { name: 'Bob', stats: {} }], 3);
  report(/Mia/.test(gl) && !/nobody did much/i.test(gl), `the gentle line for a stop with no awards names whoever did the most: "${gl}"`);
  const g0 = LW.gentleLine([], 1), g1 = LW.gentleLine([{ name: 'Zed', stats: {} }], 1);
  report(!/undefined|NaN|nobody did much/i.test(g0 + g1), `...and with nobody to name it still reads well: "${g0}" / "${g1}"`);
}

// ---- (c), (b), (e) the bot runs ----
console.log('--- (c) 8 bots, 10 minutes, Normal: named moments; (b) (e) the lines of those runs ---');
const pages = [];
{
  const runs = quick ? [[3, []]] : [[3, []], [5, ['--breakoff', '100']], [7, ['--lair', '1']]];
  for (const [sd, extra] of runs) {
    const out = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'botsim.mjs'), '--minutes', '10', '--seed', String(sd), '--difficulty', 'normal', ...extra], { encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, LOG_PAGE: '1' } });
    const text = out.stdout || '';
    const mom = /moments: (\d+) \((\d+) named, ([\d.]+) per 10 min\), kinds: ([^;\n]*)/.exec(text);
    const lines = [...text.matchAll(/^ {2}(Stop \d+, .*)$/gm)].map((x) => x[1]);
    const post = [...text.matchAll(/^ {2}postcard> (.*)$/gm)].map((x) => x[1]);
    const errs = /errors: (\d+)/.exec(text);
    const namedN = mom ? +mom[2] : 0;
    report(!!mom && namedN >= 6 && errs && +errs[1] === 0, `seed ${sd}${extra.length ? ' ' + extra.join(' ') : ''}: ${namedN} named moments in 10 minutes (need 6), 0 errors; kinds: ${mom ? mom[4].slice(0, 150) : 'none'}`);
    const allLines = [...lines, ...post.map((p) => p.replace(/^\[[^\]]*\] /, ''))];
    const unnamed = allLines.filter((l) => !/Bot\d+/.test(l));
    report(allLines.length >= 3 && unnamed.length === 0, `seed ${sd}: ${lines.length} stop lines and ${post.length} postcard lines, every one names a crewman${unnamed.length ? ' - not: ' + unnamed[0] : ''}`);
    const pc = post.map((p) => p.replace(/^\[[^\]]*\] /, ''));
    report(new Set(pc).size === pc.length && new Set(lines).size === lines.length, `seed ${sd}: no line repeats (${pc.length} postcard lines, ${lines.length} stop lines)`);
    report(pc.length >= Math.min(6, 3 * lines.length) && pc.length <= config.LOG.POSTCARD_LINES, `seed ${sd}: the postcard has ${pc.length} lines (6 to ${config.LOG.POSTCARD_LINES} when the run is long enough)`);
    pages.push({ seed: sd, extra, lines, post, mom: mom && mom[0] });
  }
}

// ---- (e) a made-up run: the same things at every stop ----
{
  const used = new Set();
  const entries = [];
  const players = [{ name: 'Mia', stats: {} }, { name: 'Bob', stats: {} }];
  for (let no = 1; no <= 14; no++) {
    const ms = [
      { n: no * 10 + 1, kind: 'fire-first', who: ['Mia'], where: 'Boiler Room', weight: 2, stop: no, stopName: 'Ember Forge', data: {} },
      { n: no * 10 + 2, kind: 'leader', who: ['Bob'], where: null, weight: 3, stop: no, stopName: 'Ember Forge', data: { stat: 'holes', n: 5 } },
      { n: no * 10 + 3, kind: 'overboard', who: ['Bob'], where: null, weight: 3, stop: no, stopName: 'Ember Forge', data: { n: 1 } },
      { n: no * 10 + 4, kind: 'gunship-shot', who: ['Mia'], where: null, weight: 6, stop: no, stopName: 'Ember Forge', data: { name: 'The Iron Widow' } },
    ];
    entries.push({ ...LW.writeStop(ms, { no, name: 'Ember Forge' }, { used, players }), end: 'done' });
  }
  const lines = LW.postcard(entries);
  const all = entries.flatMap((e) => e.cands.map((c) => c.text));
  report(new Set(all).size === all.length && new Set(lines.map((l) => l.text)).size === lines.length && lines.length === config.LOG.POSTCARD_LINES, `a made-up run of 14 stops with the same events for the same people: all ${all.length} sentences differ, the postcard has ${lines.length} lines, none repeated`);
  const nameless = entries.filter((e) => !/Mia|Bob/.test(e.text));
  report(nameless.length === 0, `every one of those 14 stops still names someone${nameless[0] ? ' - not stop ' + nameless[0].no + ': ' + nameless[0].text : ''}`);
}

// ---- (d) the postcard, the scorecard and the dock on a stub canvas ----
console.log('--- (d) the TV draws the Book ---');
{
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const drawFrames = (st, n, renderer, cam) => { let exc = 0; for (let f = 0; f < n; f++) { rec.texts.length = 0; try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 4).join(' | ')); } } return exc; };
  const pxOf = (t) => { const m = /(\d+(?:\.\d+)?)px/.exec(t.font || ''); return m ? +m[1] : 99; };
  for (const victory of [false, true]) {
    const A = boot(8, { seed: victory ? 12 : 11 });
    const { sim, st } = A;
    step(sim, 60 * 60 * 4);
    sim.closeStop('done');
    if (victory) sim.endRun(true);
    else { // the real way a ship is lost: the hull gives out, the last stand (GOING DOWN!) runs out of time, no spare gasbag is left, she breaks up
      st.run.spares = 0;
      st.ship.hull = 0;
      step(sim);
      if (st.goingDown) st.goingDown.t = st.goingDown.time;
      step(sim, 60 * 3);
    }
    const e = st.runEnd;
    if (!e) { report(false, 'the run ended (state.runEnd)'); continue; }
    const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
    const cam = createWorldCamera();
    const exc = drawFrames(st, 3, renderer, cam);
    const at = rec.texts.findIndex((t) => t.s.includes("THE SHIP'S LOG"));
    const page = at < 0 ? [] : rec.texts.slice(at); // (the postcard is drawn last: its texts are the ones from its heading on)
    const texts = page.map((t) => t.s);
    const flat = texts.filter((s, i) => s !== texts[i - 1]).join(' ').replace(/\s/g, ''); // (a name is drawn twice, its ink outline and its colour: count it once)
    const word = victory ? 'VICTORY' : 'SHIP LOST';
    const small = page.filter((t) => pxOf(t) < config.LOG.ART.MIN_PX - 0.01 && t.s.trim());
    const lineHits = (e.lines || []).filter((l) => flat.includes(l.text.slice(0, 24).replace(/\s/g, ''))).length;
    report(exc === 0 && errors === 0, `${victory ? 'victory' : 'ship lost'}: the run-end page draws with 0 errors (${exc} draw errors, ${errors} sim errors${firstErrors[0] ? ': ' + firstErrors[0] : ''})`);
    report(texts.some((s) => s.includes(word)) && texts.some((s) => s.includes("THE SHIP'S LOG")), `...with ${word} stamped on it and the heading`);
    report(e.lines.length >= 1 && e.route.length >= 1 && lineHits >= Math.max(1, e.lines.length - 1), `...${e.route.length} stops on the route, ${e.lines.length} Log lines on the page (${lineHits} found among the drawn text), ${e.rows.length} awards`);
    report(small.length === 0, `...no text under ${config.LOG.ART.MIN_PX} px (26 px on a 1080p screen)${small[0] ? ' - e.g. "' + small[0].s + '" at ' + pxOf(small[0]) : ''}`);
  }
  { // the scorecard and the dock
    const A = boot(8, { seed: 13 });
    const { sim, st } = A;
    until(sim, () => !!st.scorecard, 60 * 8); // (the first stop is flown to its end: the scorecard comes up by itself)
    const sc = st.scorecard;
    const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
    const cam = createWorldCamera();
    let exc = drawFrames(st, 2, renderer, cam);
    const t1 = rec.texts.map((t) => t.s).join('|');
    report(exc === 0 && !!sc && !!sc.play && /PLAY OF THE MISSION/.test(t1), `the scorecard draws PLAY OF THE MISSION: "${sc && sc.play && sc.play.text}"`);
    report(!/nobody did much/i.test(t1), 'the scorecard never says "Nobody did much this mission"');
    sc.rows = []; sc.gentle = LW.gentleLine(Object.values(st.players), 1);
    exc += drawFrames(st, 1, renderer, cam);
    report(exc === 0 && rec.texts.some((t) => /Bot\d+/.test(t.s) && t.s === sc.gentle) && !rec.texts.some((t) => /nobody did much/i.test(t.s)), `a scorecard with no awards says "${sc.gentle}"`);
    st.scorecard.t = 0;
    step(sim, 3);
    const hasDock = !!st.vote && st.vote.kind === 'dock';
    exc += drawFrames(st, 2, renderer, cam);
    const log = st.run.lastLog;
    report(hasDock && exc === 0 && !!log && rec.texts.some((t) => /Bot\d+/.test(t.s)) && rec.texts.some((t) => t.s.includes('Stop 1,') || t.s.startsWith('Stop')), `the sky-dock draws the Log line of the stop just flown: "${log && log.text}"`);
    const near = LW.playOf({ kind: 'gunship-charge', who: ['Mia'], data: { name: 'The Iron Widow' } });
    report(near === 'Mia planted the charge', `a play reads as "PLAY OF THE MISSION: ${near}"`);
  }
  { // logArt on its own: the postcard in a very full run (14 stops, 10 long lines) and in a bare one (nothing)
    const ctx = stubCtx();
    const art = createLogArt({ ctx, book: createLogbook({ ctx }), crewAt: () => {} });
    const route = Array.from({ length: 14 }, (_, i) => ({ no: i + 1, name: i % 3 === 2 ? "The Kraken's Lair" : 'Fungal Depths', icon: '\u{1F344}', env: 'fungal', lair: i % 3 === 2, creature: i % 3 === 2 ? 'kraken' : null, flagship: i === 13, end: 'done' }));
    const long = 'Bot1 and Bot2 and Bot3 fought the great beast through three long storms and came out with only a little singed paint and no regrets at all.';
    const lines = Array.from({ length: 10 }, (_, i) => ({ no: i + 1, name: 'Fungal Depths', first: true, text: long, kind: 'x' }));
    for (const e of [{ victory: true, modeLabel: 'LONG VOYAGE', voyages: 2, voyageNo: 2, route, lines, rows: [], colors: { Bot1: '#e63946' }, salvage: 1, kills: 2, gunships: 3, done: 14, total: 14 }, { victory: false, modeLabel: 'QUICK', voyages: 1, voyageNo: 1, route: [], lines: [], rows: [], salvage: 0, kills: 0, gunships: 0, done: 0, total: 5 }]) {
      rec.texts.length = 0;
      const g0 = (globalThis.gameErrors || []).length;
      art.postcard(e, 9);
      const small = rec.texts.filter((t) => pxOf(t) < config.LOG.ART.MIN_PX - 0.01 && t.s.trim());
      report(rec.texts.length > 5 && (globalThis.gameErrors || []).length === g0 && small.length === 0, `the postcard of ${e.route.length} stops and ${e.lines.length} long lines draws (${rec.texts.length} texts, none under ${config.LOG.ART.MIN_PX} px, ${(globalThis.gameErrors || []).length - g0} errors)`);
    }
  }
}

// ---- (g) data only ----
console.log('--- (g) the Book is data only ---');
{
  const run = (on) => {
    config.LOG.ENABLED = on;
    const A = boot(8, { seed: 21 });
    let draws = 0;
    const r0 = Math.random;
    Math.random = () => { draws++; return r0(); };
    const { sim, st } = A;
    step(sim, 60 * 20);
    sim.fire.ignite(st.ships[0].layout.deckIndex('main'), 700, 'hit'); // (events that make moments: a fire the bots put out, a part breaking off, a crewman going over the side)
    const gun = st.ships[0].layout.stations.find((q) => q.kind === 'gun');
    st.ships[0].sim.breakOff({ kind: 'part', name: gun.n, cause: 'test' }, { force: true });
    Object.assign(st.players.bot2, { fall: true, tumble: true, fly: false, air: false, ko: 0, lock: null, conn: null, d: 1, x: 5000, y: 700, tvy: 900, tvx: 0, carry: null });
    step(sim, 60 * 40);
    sim.closeStop('done');
    Math.random = r0;
    return { draws, hull: A.st.ship.hull, kills: A.st.kills, alt: A.st.ship.alt, moments: A.sim.moments.totals.all };
  };
  const a = run(true), b = run(false);
  config.LOG.ENABLED = true;
  report(a.draws === b.draws && a.hull === b.hull && a.kills === b.kills && a.alt === b.alt && a.moments > 0 && b.moments === 0, `the same seeded minute (a fire, a break-off, a fall, the stop's end) with the Book on and off: ${a.draws} / ${b.draws} random draws, hull ${a.hull.toFixed(2)} / ${b.hull.toFixed(2)}, kills ${a.kills} / ${b.kills}, altitude ${a.alt.toFixed(1)} / ${b.alt.toFixed(1)} (${a.moments} / ${b.moments} moments)`);
}

report(errors === 0, `0 simulation errors overall${firstErrors.length ? ': ' + firstErrors[0] : ''}`);

if (samples) {
  for (const p of pages.slice(0, 3)) {
    console.log(`\n=== SAMPLE LOG PAGE: botsim seed ${p.seed} ${p.extra.join(' ')} (${p.mom || ''}) ===`);
    p.lines.forEach((l) => console.log('  ' + l));
    console.log('  --- the postcard ---');
    p.post.forEach((l) => console.log('  ' + l));
  }
}
console.log(ok ? '\nAll Ship\'s Book checks passed.' : '\nSome Ship\'s Book checks FAILED.');
process.exit(ok ? 0 : 1);
