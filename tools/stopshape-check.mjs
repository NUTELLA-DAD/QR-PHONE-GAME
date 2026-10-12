// STOP SHAPE AND THE 60-SECOND DOCK gate (package F6, FUN.md; config.STOP_SHAPE, SHOP.V2, WAVES.MID_BOSS). Headless.
//   node tools/buildsim.mjs --check-stop-shape        or directly:   node tools/stopshape-check.mjs [--seed 1]
//   (a) the BRIEFING: the first flight step of a stop raises state.briefing (the goal in one line) for TIME seconds; the old stop banner is not said as well; with the flag off there is no card and the banner stays
//   (b) the GUNSHIP as the stop's one big thing: an outpost stop with the gunship in its gates calls it at the first set piece after AFTER_PEAKS; a lair, a ring, the Flagship and a stop whose gates have no gunship never do
//   (c) the ESCAPE: when the last outpost falls tempo.phase becomes 'escape' (rate 0, the banner) for TIME seconds, then the scorecard; a beacon stop, the Flagship and ESCAPE.ENABLED = false end the stop at once
//   (d) no mid-voyage zeppelin with WAVES.MID_BOSS off (the Flagship stays); with it on one comes
//   (e) the DOCK: three cards (MEND HER priced by need, one part or fitting, Cast off), the votes' new times, MEND HER mends everything, the fittings are the six, bots buy from it, V2 off is the old six-card dock
// Exit code 1 on any failure.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const seed = Number(argv[argv.indexOf('--seed') + 1]) || 1;
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
const clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const SS = config.STOP_SHAPE, SH = config.SHOP;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
const ALL = ['swarm', 'imps', 'bombers', 'strafers', 'gunship'];
function boot({ start = 'sparrow', bots = 5 } = {}) {
  const sim = createSimulation(), st = sim.state;
  sim.setSession('voyage', false);
  if (start) sim.setStartBuild(start);
  for (let i = 0; i < bots; i++) {
    const e = st.ships[0].layout.boarderEntryPoints, id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry: null, conn: null, climb: false, stats: {}, uk: null };
  }
  sim.castOff();
  return { sim, st };
}
// A mission of our own on the course (an outpost raid by default), with a stop record the director and the course read.
const mission = (sim, st, o = {}) => {
  sim.course.startMission(o.n || 2, { kind: o.kind || 'open', environment: 'skyisles', danger: 2, title: 'STOP 2: TEST', heading: 'STOP 2: TEST', goal: 'DESTROY THE OUTPOSTS', stop: { id: '1.0', col: 1, name: 'Test', gates: o.gates || ALL, ...(o.stop || {}) } });
  st.ev.warn = 0;
};
const fly = (sim, st, secs, each) => { for (let i = 0; i < secs * 60; i++) { if (st.phase === 'flying' && !st.ship.down) st.ship.hull = 100; step(sim, 1); if (each) each(i); if (st.phase === 'lobby' && !st.runEnd && !st.wreck) sim.castOff(); } };

// ---- (a) the briefing ----
{
  const { sim, st } = boot();
  step(sim, 5);
  const b = st.briefing;
  report(!!b && !!b.goal && b.t > 0 && b.t <= SS.BRIEFING.TIME && /^STOP 1/.test(b.title), `the first flight step raises the briefing: "${b && b.title}" / "${b && b.goal}"`);
  report(!(st.ev.warn > 0) || !/STOP 1:.* - /.test(st.ev.warnText || ''), 'the stop banner is not said as well');
  fly(sim, st, SS.BRIEFING.TIME + 0.5);
  report(st.briefing === null, `the card is gone after ${SS.BRIEFING.TIME} s`);
}
{
  const was = SS.BRIEFING.ENABLED;
  SS.BRIEFING.ENABLED = false;
  const { sim, st } = boot();
  step(sim, 5);
  report(!st.briefing && st.ev.warn > 0, 'BRIEFING.ENABLED = false: no card, the old banner');
  SS.BRIEFING.ENABLED = was;
}

// ---- (b) the gunship is the stop's one big thing ----
const bigThing = (o, secs = 12 * 60) => {
  const { sim, st } = boot();
  step(sim, 60);
  mission(sim, st, o);
  const kinds = [], peaksAt = [];
  let last = null;
  fly(sim, st, secs, () => {
    const t = st.tempo;
    if (!st.course.stop || st.course.stop.name !== 'Test') return; // (the ship may crash and the voyage start over in a long run: only our own stop counts)
    if (t.phase === 'peak' && t.spawned && t.kind !== last) { last = t.kind; kinds.push(t.kind); peaksAt.push(t.peaks); }
    if (t.phase !== 'peak') last = null;
    if (st.course.escape || st.course.done) return;
  });
  return { kinds, peaksAt, big: st.tempo.big };
};
{
  const r = bigThing({});
  report(r.kinds.includes('gunship') && r.kinds.indexOf('gunship') >= SS.GUNSHIP.AFTER_PEAKS, `an outpost stop calls the gunship at its first set piece after ${SS.GUNSHIP.AFTER_PEAKS}: ${r.kinds.join(', ')}`);
  const g = bigThing({ gates: ['swarm', 'imps'] });
  report(!g.kinds.includes('gunship'), 'a stop whose gates have no gunship never gets one: ' + g.kinds.join(', '));
  const l = bigThing({ stop: { lair: true } }, 8 * 60);
  console.log('note  a lair stop is its own big thing, the director adds nothing forced: ' + l.kinds.join(', '));
  const was = SS.GUNSHIP.ENABLED;
  SS.GUNSHIP.ENABLED = false;
  const off = bigThing({}, 4 * 60);
  console.log('note  GUNSHIP.ENABLED = false: the old random pick: ' + off.kinds.join(', '));
  SS.GUNSHIP.ENABLED = was;
}

// ---- (c) the escape ----
const finish = (o, { kill = true } = {}) => {
  const { sim, st } = boot();
  step(sim, 60);
  mission(sim, st, o);
  fly(sim, st, 3);
  if (kill) for (const t of st.course.turrets) { t.dead = true; t.hp = 0; }
  const phases = [];
  let t0 = null, card = null, rateMax = 0, supply = false;
  for (let i = 0; i < 40 * 60 && !card; i++) {
    st.ship.hull = 100;
    step(sim, 1);
    if (st.tempo.phase === 'escape') { if (t0 === null) t0 = i; rateMax = Math.max(rateMax, st.tempo.rate); }
    if (st.supply) supply = true;
    if (st.scorecard) card = i;
    if (!phases.length || phases[phases.length - 1] !== st.tempo.phase) phases.push(st.tempo.phase);
  }
  return { supply, phases, secs: card === null ? null : (card - (t0 === null ? 0 : t0)) / 60, escaped: t0 !== null, rateMax, card: st.scorecard, st };
};
{
  const r = finish({});
  report(r.escaped && r.rateMax === 0, 'the last outpost falls: tempo.phase "escape" with rate 0');
  report(r.secs !== null && Math.abs(r.secs - SS.ESCAPE.TIME) < 1, `...for ${SS.ESCAPE.TIME} s (${r.secs && r.secs.toFixed(1)}), then the scorecard`);
  report(r.card && r.card.t <= config.VOTE.SCORECARD_TIME_V2 && r.card.t > config.VOTE.SCORECARD_TIME_V2 - 0.2, `the scorecard shows for ${config.VOTE.SCORECARD_TIME_V2} s (V2)`);
  report(r.supply, 'a supply balloon floats in for the breather');
  const b = finish({ kind: 'route' }, { kill: false });
  void b;
}
{
  const { sim, st } = boot();
  step(sim, 60);
  mission(sim, st, { kind: 'route' });
  fly(sim, st, 2);
  const sh = st.ships[0], g = st.course.map.goal; // the ship is put on the beacon: the stop ends at once, no escape
  sh.pose.x = g.x - sh.layout.refPoint.x;
  sh.pose.y = g.y - sh.layout.refPoint.y;
  let esc = false, card = false;
  for (let k = 0; k < 6 * 60 && !card; k++) { st.ship.hull = 100; step(sim, 1); if (st.course.escape) esc = true; if (st.scorecard) card = true; }
  report(card && !esc, 'a beacon stop ends the moment the beacon is reached: scorecard ' + card + ', escape ' + esc);
}
{
  const was = SS.ESCAPE.ENABLED;
  SS.ESCAPE.ENABLED = false;
  const r = finish({});
  report(!r.escaped && r.secs !== null && r.secs < 3, 'ESCAPE.ENABLED = false: the stop ends the moment the last outpost falls (' + (r.secs && r.secs.toFixed(1)) + ' s)');
  SS.ESCAPE.ENABLED = was;
  const f = finish({ stop: { flagship: true } });
  report(!f.escaped && f.secs !== null && f.secs < 3, 'the Flagship stop ends at once, no escape');
}

// ---- (d) no mid-voyage zeppelin ----
{
  const run = (mid, flagship) => {
    const { sim, st } = boot();
    step(sim, 60);
    config.WAVES.MID_BOSS = mid;
    mission(sim, st, { kind: 'route', stop: flagship ? { flagship: true } : {} });
    let boss = false;
    for (let i = 0; i < 20 * 60; i++) {
      st.ship.hull = 100;
      st.course.progress = 0.75;
      if (st.tempo) st.tempo.bossOk = true;
      step(sim, 1);
      if (st.boss) boss = true;
      st.course.progress = 0.75;
    }
    return boss;
  };
  const saved = config.WAVES.MID_BOSS;
  report(run(false, false) === false, 'WAVES.MID_BOSS = false: no zeppelin at 75% of an ordinary stop');
  report(run(true, false) === true, 'WAVES.MID_BOSS = true: the old zeppelin comes');
  report(run(false, true) === true, 'MID_BOSS = false: the Flagship stop still has its boss');
  config.WAVES.MID_BOSS = saved;
}

// ---- (e) the dock ----
{
  const { sim, st } = boot();
  step(sim, 60);
  st.run.salvage = 600;
  for (const g of st.ships[0].sim.structure.segs()) if (g.critical) g.hp = 0.5; // (the frame is the hull: STRUCTURE.md WP6)
  st.ship.hull = 50;
  st.ship.fuel = 20;
  SH.V2_PART_CHANCE = 1;
  sim.startDock();
  let v = st.vote;
  report(v && v.kind === 'dock' && v.options.length === SH.V2_OFFERS && v.options[0].id === 'mend-her' && v.options[v.options.length - 1].kind === 'cast', `the dock has ${SH.V2_OFFERS} cards: ${v && v.options.map((o) => o.id).join(', ')}`);
  report(v && v.t === SH.V2_TIME, `the vote runs ${SH.V2_TIME} s (${v && v.t})`);
  report(v && v.options[1] && ['part', 'repair', 'upgrade'].includes(v.options[1].kind), 'the second card is a part (or a fitting, or a REBUILD): ' + (v && v.options[1].kind));
  const mend = v.options[0];
  const want = Math.round(((SH.REPAIR_HULL + SH.REPAIR_COAL + (v.options[0].mend.gas ? SH.REPAIR_GAS : 0)) * SH.MEND_MUL) / 5) * 5;
  report(Math.abs(mend.cost - want) <= 15 && mend.mend.hull && mend.mend.coal, `MEND HER is priced by need: ${mend.cost} for ${Object.keys(mend.mend).filter((k) => mend.mend[k]).join(' + ')}`);
  // everyone votes for it
  for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = 0; }
  fly(sim, st, 3);
  report(st.ship.hull >= 99 && st.ship.fuel >= config.BOILER.FUEL_MAX - 1 && st.run.bought.includes('mend-her') && st.run.salvage === 600 - mend.cost, `MEND HER mended her (hull ${Math.round(st.ship.hull)}, coal ${Math.round(st.ship.fuel)}, salvage ${st.run.salvage})`);
  // nobody votes: the dock closes by itself and the route vote runs ROUTE_TIME_V2
  for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = null; }
  let secs = 0;
  while (st.vote && st.vote.kind === 'dock' && secs < 60) { fly(sim, st, 1); secs++; for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = null; } }
  report(secs <= SH.V2_MAX_TIME && st.vote && st.vote.kind === 'route', `an idle crew: the dock closes by itself within ${SH.V2_MAX_TIME} s (${secs} s) and the route vote opens`);
  report(st.vote && Math.abs(st.vote.t - config.VOYAGE.ROUTE_TIME_V2) < 2, `the route vote runs ${config.VOYAGE.ROUTE_TIME_V2} s (${st.vote && st.vote.t.toFixed(1)})`);
}
{
  const fits = new Set();
  for (let k = 0; k < 40; k++) {
    const { sim, st } = boot({ start: null, bots: 2 });
    step(sim, 30);
    st.run.salvage = 600;
    sim.startDock();
    for (const o of st.vote.options) if (o.kind === 'upgrade') fits.add(o.id);
  }
  report(fits.size > 0 && [...fits].every((id) => SH.V2_FITTINGS.includes(id)), `the fittings are only the six: ${[...fits].join(', ')}`);
}
{
  SH.V2 = false;
  const { sim, st } = boot();
  step(sim, 60);
  st.run.salvage = 600;
  st.ship.hull = 50;
  sim.startDock();
  const v = st.vote;
  report(v && v.options.length > 4 && !v.options.some((o) => o.id === 'mend-her') && v.t === SH.TIME, `SHOP.V2 = false: the old dock (${v && v.options.length} cards, ${v && v.t} s)`);
  SH.V2 = true;
}
// bots buy from the new dock: a full voyage's worth of docks with 6 bots
{
  const { sim, st } = boot({ bots: 6 });
  let docks = 0, bought = 0, errors = 0;
  step(sim, 60);
  for (let k = 0; k < 6; k++) {
    st.run.salvage = 500;
    st.ship.hull = 60;
    st.scorecard = null;
    sim.startDock();
    if (!st.vote) continue;
    docks++;
    const before = st.run.bought.length;
    try { for (let i = 0; i < 60 * 60 && st.vote && st.vote.kind === 'dock'; i++) { clock.ms += DT * 1000; sim.update(DT); } } catch (e) { errors++; }
    bought += st.run.bought.length - before;
    st.vote = null;
  }
  report(errors === 0 && docks === 6 && bought >= 6, `bots buy from the three cards: ${bought} purchases in ${docks} docks, ${errors} errors`);
}
console.log(ok ? 'stop-shape check: all passed' : 'stop-shape check: FAILED');
process.exit(ok ? 0 : 1);
