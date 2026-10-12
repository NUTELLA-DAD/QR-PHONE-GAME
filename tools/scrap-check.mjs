// SCRAP, FLOTSAM AND THE HOLD gate (LOOP.md G1; public/modules/host/scrap.js, cargo.js, hookshot.js, towing.js, goingDown.js, config.SCRAP). Headless.
//   node tools/buildsim.mjs --check-scrap        or directly:   node tools/scrap-check.mjs [--seed 1] [--quick 1]
//
//   1  the item: a bundle is a cargo kind (ITEMS.scrap, weight SCRAP.BUNDLE_W); the hold bin stands in the Hold room of the classic ship and of the Sparrow, clear of everything, derived without a new part;
//   2  what falls: a dogfighter by chance, a bomber always, the last plane of a squadron two more, the big fighter by chance, a gunship's two bundles and her hulk of four, the zeppelin six, a creature eight and one for
//      each limb cut off, the supply balloon's crate two on her deck; nothing from a plane that merely withdrew; nothing at all with SCRAP off, in Versus, or with NO_SCRAP;
//   3  the fall: the chute settles to SCRAP.FLOTSAM.FALL, the bundle drifts with the wind, lands on a deck as a LOAD (weight counted), is given up after LIFE seconds, never lands on the enemy gunship;
//   4  the hookshot: a bundle in reach is a light anchor, reeled to the hand and landed at the thrower's feet (hooked counted, a moment written), the thrower stays on his deck;
//   5  the hulk: a harpoon line hooks it and hauls it alongside; Action from an open deck takes a bundle at a time; stripped = a moment, and it is gone; a free hulk sinks;
//   6  the hold: a bundle on the deck is picked up (Action), stowed (Action at the bin), the hold takes HOLD_CAP and refuses more, its weight is in the balance and on the LIFT / WEIGHT gauge, STOW job arrows on the phones;
//   7  GOING DOWN!: hold Action at the bin dumps the scrap (the gauge drops by its weight, a moment), the bots do it before they cut a section away;
//   8  limp home keeps the hold;  9  a person carrying scrap can dump it at the rail (it lifts like a sandbag);  10  the helm's plan under flotsam;
//  11  botsim: NO_SCRAP and SCRAP.ENABLED=false print no scrap line and play the same; 3 minutes with 8 bots on two maps: 0 errors, bundles stowed; the same seed plays the same twice.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0;
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyBuild, createLayout } = await load('shipLayout.js');
const { toWorldX, toWorldY, toShipX } = await load('modules/host/pose.js');
const SC = await load('modules/host/scrap.js');
const { cargoItem } = await load('modules/host/cargo.js');
const { windSpeed } = await load('modules/host/sails.js');
const S = config.SCRAP;
const hw = (n) => Math.max(0, n - (S.HOLD_FREE || 0)) * S.BUNDLE_W; // (what n bundles in the hold weigh: the first HOLD_FREE are ballast, balance pass)
const DT = 1 / 60;
const errors = [];
const secs = (s) => Math.round(s * 60);
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

function boot({ bots = 0, startBuild = null, calm = true, s = seed } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.SCRAP.ENABLED = true;
  config.PVP.ENABLED = false;
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9; }
  clock = seedRandom(s);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  if (startBuild) sim.setStartBuild(startBuild);
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  return { sim, st, ours, fl: sim.flotsam };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const person = (st, ours, id, deck, x, carry = null) => {
  const d = typeof deck === 'number' ? deck : ours.layout.platforms.findIndex((q) => q.id === deck);
  st.players[id] = { id, name: id, species: 'fox', color: '#fff', x, y: ours.layout.platforms[d].y, d, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry, fire: false, uk: null };
  return st.players[id];
};
const scrapIn = (st) => (st.thrown || []).filter((q) => q.kind === 'scrap');
const loadsOf = (ours) => (ours.ctx.loads || []).filter((l) => l.kind === 'scrap');
const clean = (st) => { st.strafers.length = 0; st.bombers.length = 0; st.thrown.length = 0; st.hulks.length = 0; st.boss = null; st.creature = null; st.gunship = null; };
const by = (st, k) => (st.scrapStats.by[k] || 0);
const momentsOf = (st, kind) => (st.moments || []).filter((m) => m.kind === kind);

// ---------------------------------------------------------------- 1. the item and the bin
{
  report(cargoItem('scrap') && cargoItem('scrap').w === S.BUNDLE_W && S.BUNDLE_W === 1 && S.HOLD_FREE === 2 && S.HOLD_CAP === 8, `a bundle is a cargo kind: ${S.BUNDLE_W} points a bundle, the hold takes ${S.HOLD_CAP}`);
  for (const name of ['classic', 'sparrow']) {
    const L = createLayout(BUILDS[name]);
    const sp = SC.holdSpot(L), room = sp && L.rooms.find((r) => r.d === sp.d && /hold/i.test(r.name) && sp.x >= r.x0 && sp.x <= r.x1);
    const things = [...L.stations, ...L.racks, ...L.extinguishers, ...L.vents].filter((o) => o.d === (sp && sp.d)).map((o) => Math.abs(o.x - (sp ? sp.x : 0)));
    report(!!sp && !!room && Math.min(...things, 999) >= 25, `the ${name} ship's hold bin stands in her ${room ? room.name : '-'} room at x ${sp ? sp.x : '-'} on deck ${sp ? sp.p : '-'}, ${Math.min(...things, 999).toFixed(0)} px clear of anything (no new part: ${L.racks.length} racks as built)`);
  }
}

// ---------------------------------------------------------------- 2. what falls
{
  const { sim, st, ours, fl } = boot();
  step(sim, secs(2));
  const at = { x: ours.pose.x + 900, y: ours.pose.y - 300 };
  const base = () => st.scrapStats.spawned;
  const kill = (list, n, mk) => { const objs = Array.from({ length: n }, (_, i) => mk(i)); list.push(...objs); fl.step(DT); for (const o of objs) o.hp = 0; list.length = 0; fl.step(DT); };
  // dogfighters: by chance
  clean(st);
  let b0 = base();
  kill(st.strafers, 60, (i) => ({ x: at.x + i * 20, y: at.y, vx: 100, vy: 0, hp: 3, max: 3 }));
  const n1 = base() - b0;
  report(n1 >= 10 && n1 <= 32, `60 dogfighters shot down drop ${n1} bundles (chance ${S.FLOTSAM.FIGHTER} each)`);
  // a plane that withdrew (hit points left) drops nothing
  clean(st); b0 = base();
  { const p = { x: at.x, y: at.y, vx: 0, vy: 0, hp: 3, max: 3 }; st.strafers.push(p); fl.step(DT); st.strafers.length = 0; fl.step(DT); }
  report(base() === b0, 'a plane that left with hit points drops nothing');
  // bombers: always
  clean(st); b0 = base();
  kill(st.bombers, 10, (i) => ({ x: at.x + i * 40, y: at.y, vx: 100, vy: 0, hp: 9, max: 9 }));
  report(base() - b0 === 10 * S.FLOTSAM.BOMBER, `10 bombers shot down drop ${base() - b0} bundles (${S.FLOTSAM.BOMBER} each)`);
  // a squadron: the last plane brings two more
  clean(st); b0 = base();
  { const sq = Array.from({ length: 4 }, (_, i) => ({ x: at.x + i * 30, y: at.y, vx: 0, vy: 0, hp: 3, max: 3, squadronId: 7 })); st.strafers.push(...sq); fl.step(DT);
    for (let i = 0; i < 3; i++) sq[i].hp = 0; st.strafers.splice(0, 3); fl.step(DT);
    const wipeBefore = by(st, 'squadron'); sq[3].hp = 0; st.strafers.length = 0; fl.step(DT);
    report(wipeBefore === 0 && by(st, 'squadron') === S.FLOTSAM.SQUADRON, `three of four squadron planes down: no bonus; the last one: ${by(st, 'squadron')} more bundles`); }
  // the big fighter
  clean(st); b0 = base();
  { const e = st.enemy; let n = 0;
    for (let i = 0; i < 60; i++) { Object.assign(e, { x: at.x, y: at.y, vx: 0, vy: 0, hp: 5, dead: 0, heading: 0 }); fl.step(DT); e.hp = 0; e.dead = 4; fl.step(DT); n = base() - b0; }
    Object.assign(e, { dead: 6, hp: 5, heading: null });
    report(n >= 10 && n <= 32, `the big fighter shot down 60 times drops ${n} bundles`); }
  // a gunship: two loose and a hulk of four
  clean(st); b0 = base();
  { st.gunship = { phase: 'hunt', bp: { cx: 0, hullTop: 0, hullBot: 0, name: 'THE IRON WIDOW' }, dx: toShipX(ours, at.x), dy: at.y - ours.pose.y };
    fl.step(DT); st.gunship.phase = 'sinking'; fl.step(DT); fl.step(DT);
    report(by(st, 'gunship') === S.FLOTSAM.GUNSHIP && st.hulks.length === 1 && st.hulks[0].left === S.FLOTSAM.HULK, `a gunship sinking drops ${by(st, 'gunship')} bundles and a hulk worth ${st.hulks[0] ? st.hulks[0].left : '-'} (once, not every step)`);
    st.gunship = null; }
  // the zeppelin
  clean(st); b0 = base();
  { st.boss = { x: at.x, y: at.y, hp: 9, vx: 0 }; fl.step(DT); st.boss.hp = 0; const z = st.boss; st.boss = null; fl.step(DT);
    report(by(st, 'boss') === S.FLOTSAM.BOSS && z.hp === 0, `the zeppelin shot down drops ${by(st, 'boss')} bundles`); }
  // a creature: a bundle for each limb cut off, a field when it dies
  clean(st);
  { const cr = { x: at.x, y: at.y + 600, dying: false, stats: { severed: 0 }, chunks: [] }; st.creature = cr; fl.step(DT);
    cr.stats.severed = 2; cr.chunks.push({ cx: at.x, cy: at.y }); fl.step(DT);
    const sev = by(st, 'creature'); cr.dying = true; fl.step(DT); fl.step(DT);
    report(sev === 2 * S.FLOTSAM.SEVER && by(st, 'creature') - sev === S.FLOTSAM.CREATURE, `a creature: ${sev} bundles for two severed limbs, then ${by(st, 'creature') - sev} when it dies`);
    st.creature = null; }
  // the supply balloon: a crate with scrap on her deck
  clean(st); ours.ctx.loads && (ours.ctx.loads.length = 0);
  { b0 = base(); const l0 = loadsOf(ours).length;
    st.supply = { mx: toWorldX(ours, ours.layout.midPoint.x), my: toWorldY(ours, ours.layout.midPoint.y), t: 99, bob: 0 };
    step(sim, secs(1));
    report(!st.supply && loadsOf(ours).length - l0 === S.FLOTSAM.SUPPLY && /SCRAP/.test(st.ev.warnText || ''), `the supply balloon is a scrap-and-coal crate: ${loadsOf(ours).length - l0} bundles land on her deck ("${st.ev.warnText}")`); }
  // off: SCRAP.ENABLED false, Versus, and the tools' NO_SCRAP all leave the sky empty
  clean(st);
  { config.SCRAP.ENABLED = false; b0 = base(); kill(st.bombers, 5, (i) => ({ x: at.x + i, y: at.y, vx: 0, vy: 0, hp: 5, max: 5 }));
    report(base() === b0 && scrapIn(st).length === 0 && !SC.scrapOn(), 'SCRAP.ENABLED false: bombers die and nothing falls');
    config.SCRAP.ENABLED = true; config.PVP.ENABLED = true; kill(st.bombers, 5, (i) => ({ x: at.x + i, y: at.y, vx: 0, vy: 0, hp: 5, max: 5 }));
    report(base() === b0 && !SC.scrapOn(), 'Versus (PVP.ENABLED): no scrap at all');
    config.PVP.ENABLED = false; }
}

// ---------------------------------------------------------------- 3. the fall: chute, drift, landing, the lost
{
  const { sim, st, ours, fl } = boot();
  step(sim, secs(2));
  const td = SC.topDeck(ours.layout), di = ours.layout.platforms.indexOf(td), w = windSpeed(st) * config.SHIP.TOP_SPEED;
  clean(st);
  const mid = toWorldX(ours, (td.x0 + td.x1) / 2), y0 = toWorldY(ours, td.y) - 420;
  st.thrown.push({ id: 9001, kind: 'scrap', x: mid - 200, y: y0, vx: w + 250, vy: -60, t: 0, from: null, spin: 0, rot: 0, chute: true, src: 'test' });
  let vyMax = 0, vxEnd = null, t = 0, l0 = loadsOf(ours).length;
  step(sim, secs(14), (i) => { const it = st.thrown[0]; if (!it) return 'stop'; t = i / 60; vyMax = Math.max(vyMax, it.vy); vxEnd = it.vx; });
  const lds = loadsOf(ours);
  report(vyMax > S.FLOTSAM.FALL * 0.9 && vyMax <= S.FLOTSAM.FALL * 1.02 && Math.abs(vxEnd - w) < 60, `the chute settles to ${vyMax.toFixed(0)} px/s (FALL ${S.FLOTSAM.FALL}) and the bundle drifts with the wind (${vxEnd == null ? '-' : vxEnd.toFixed(0)} against ${w.toFixed(0)} px/s)`);
  report(lds.length - l0 === 1 && lds[lds.length - 1].d === di && lds[lds.length - 1].w === S.BUNDLE_W && st.scrapStats.landed >= 1, `it lands on the top deck as a LOAD that weighs ${lds.length ? lds[lds.length - 1].w : '-'} (after ${t.toFixed(1)} s); landed ${st.scrapStats.landed}`);
  // the balance counts it
  report(st.balance.live > 0 && ours.ctx.loads.some((l) => l.kind === 'scrap'), 'the balance counts the bundle lying on her deck like any load');
  // given up after LIFE seconds
  clean(st); const lost0 = st.scrapStats.lost;
  st.thrown.push({ id: 9002, kind: 'scrap', x: mid + 9000, y: y0 - 3000, vx: 0, vy: 0, t: 0, from: null, spin: 0, rot: 0, chute: true, src: 'test' });
  step(sim, secs(S.FLOTSAM.LIFE + 2));
  report(st.thrown.length === 0 && st.scrapStats.lost === lost0 + 1, `a bundle nobody catches is given up after ${S.FLOTSAM.LIFE} s (lost ${st.scrapStats.lost - lost0})`);
  // a sandbag still falls the old way
  clean(st); st.thrown.push({ id: 9003, kind: 'sandbag', x: mid, y: y0, vx: 0, vy: 0, t: 0, from: 'player', spin: 0, rot: 0 });
  step(sim, secs(1));
  report(st.thrown[0] && st.thrown[0].vy > 800 * 0.5, 'a thrown sandbag still falls at its own gravity (the cargo physics are untouched)');
}

// ---------------------------------------------------------------- 4. the hookshot
{
  const { sim, st, ours, fl } = boot();
  step(sim, secs(2));
  clean(st);
  const cw = ours.layout.platforms.findIndex((q) => q.id === 'catwalk'), deck = ours.layout.platforms[cw];
  const p = person(st, ours, 'hook', cw, deck.x1 - 30, 'hookshot');
  step(sim, secs(0.5));
  const o = sim.ships[0].sim.hookshot.origin(p), w = windSpeed(st) * config.SHIP.TOP_SPEED;
  st.thrown.push({ id: 9100, kind: 'scrap', x: o.x + 520, y: o.y - 20, vx: ours.pose.vx, vy: 0, t: 0, from: null, spin: 0, rot: 0, chute: true, src: 'test' });
  const it = st.thrown[0];
  p.jx = 1; p.jy = 0; p.atkQ = true;
  let phase = null, reeled = false, loadsBefore = loadsOf(ours).length;
  step(sim, 1);
  p.jx = 0;
  step(sim, secs(3), () => { if (p.hook) { phase = p.hook.phase; if (p.hook.phase === 'haul') reeled = true; } });
  const l = loadsOf(ours);
  report(reeled && !p.hook && !p.fly && p.d === cw && l.length - loadsBefore === 1 && Math.abs(l[l.length - 1].x - p.x) < 60, `the hook catches the bundle in the air, reels it in on the line and lands it at the thrower's feet (x ${l.length ? l[l.length - 1].x.toFixed(0) : '-'} against ${p.x.toFixed(0)}); he never left his deck`);
  report(st.scrapStats.hooked === 1 && momentsOf(st, 'scrap-hook').length === 1 && !st.thrown.length, `counted: hooked ${st.scrapStats.hooked}, a "scrap-hook" moment written (${momentsOf(st, 'scrap-hook').length}), nothing left in the air`);
  // a bundle behind our own gasbag is not caught (the cast stops on the bag first) - the bots' aim relies on it
  clean(st);
  st.thrown.push({ id: 9101, kind: 'scrap', x: o.x + 100, y: o.y - 830, vx: 0, vy: 0, t: 0, from: null, spin: 0, rot: 0, chute: true, src: 'test' });
  const c = sim.ships[0].sim.hookshot.cast(o, 0.12, -0.99);
  report(!c.anchor || c.anchor.kind !== 'scrap', 'a ray up through her own gasbag is stopped by it, not by the bundle beyond');
}

// ---------------------------------------------------------------- 5. the hulk
{
  const { sim, st, ours, fl } = boot();
  step(sim, secs(2));
  clean(st);
  const cw = ours.layout.platforms.findIndex((q) => q.id === 'catwalk'), deck = ours.layout.platforms[cw];
  const muzzle = { x: deck.x1 - 20, y: deck.y - 70 };
  const mw = { x: toWorldX(ours, muzzle.x), y: toWorldY(ours, muzzle.y) };
  const hulk = fl.makeHulk(mw.x + 900, mw.y + 120, ours.pose.vx, 0, S.FLOTSAM.HULK, 'THE IRON WIDOW');
  const gone = sim.towing.fireHarpoon(ours, 0.1, mw.x, mw.y, null);
  report(!!gone && gone.hulk === hulk && hulk.tow, 'a harpoon line fired along the barrel hooks the hulk (no tow spring: a hauled hulk)');
  let d0 = Math.hypot(hulk.x - mw.x, hulk.y - mw.y);
  step(sim, secs(10));
  const m1 = { x: toWorldX(ours, muzzle.x), y: toWorldY(ours, muzzle.y) }, d1 = Math.hypot(hulk.x - m1.x, hulk.y - m1.y);
  report(d1 < S.HULK.HOLD_DIST + 90 && d1 > S.HULK.HOLD_DIST - 90 && d0 > d1, `she hauls it alongside: ${d0.toFixed(0)} px away at first, ${d1.toFixed(0)} px after 10 s (HOLD_DIST ${S.HULK.HOLD_DIST})`);
  // crew on the open deck take a bundle at a time
  const p = person(st, ours, 'crew', cw, deck.x1 - 60);
  let taken = 0, label = '';
  for (let i = 0; i < S.FLOTSAM.HULK + 1; i++) {
    p.carry = null; step(sim, 3);
    const u = ours.sim.interaction(p, null).use; if (i === 0) label = u && u.label;
    p.actQ = true; step(sim, 3);
    if (p.carry === 'scrap') taken++;
  }
  report(taken === S.FLOTSAM.HULK && /hulk/i.test(label || '') && !st.hulks.includes(hulk), `Action beside the hulk takes one bundle a time ("${label}"): ${taken} taken, then the hulk is stripped and gone`);
  report(momentsOf(st, 'hulk-hauled').length === 1 && st.scrapStats.hulks === 1 && st.scrapStats.taken === S.FLOTSAM.HULK, `a "hulk-hauled" moment is written, the stats say ${st.scrapStats.hulks} hulk and ${st.scrapStats.taken} bundles taken`);
  // a hulk nobody reaches sinks
  clean(st);
  const h2 = fl.makeHulk(mw.x + 3000, mw.y + 800, 0, 0, 4, 'X'), lost0 = st.scrapStats.lost;
  step(sim, secs(S.HULK.LIFE + 2));
  report(!st.hulks.includes(h2) && st.scrapStats.lost === lost0 + 4, `a hulk nobody reaches sinks after ${S.HULK.LIFE} s (lost ${st.scrapStats.lost - lost0} bundles with it)`);
}

// ---------------------------------------------------------------- 6. the hold: pick up, stow, weight
{
  const { sim, st, ours } = boot();
  step(sim, secs(2));
  clean(st);
  const sp = SC.holdSpot(ours.layout), P = ours.layout.platforms[sp.d];
  const p = person(st, ours, 'hand', sp.d, sp.x - 200);
  // a bundle lying on the deck beside him
  ours.sim.cargo.place('scrap', sp.d, p.x + 20);
  step(sim, secs(0.5));
  const jobs = ours.sim.jobFinder; // (the phone arrow)
  p.freeT = 5; p.jobT = 0; jobs.update(p, 0.1);
  report(p.job && p.job.kind === 'stow' && /PICK UP THE SCRAP/.test(p.job.label), `an idle crewman's arrow says "${p.job ? p.job.label : '-'}"`);
  let u = ours.sim.interaction(p, null).use;
  report(u && u.type === 'pickup', `Action beside it: "${u && u.label}"`);
  p.actQ = true; step(sim, 3);
  report(p.carry === 'scrap' && loadsOf(ours).length === 0, 'he picks it up: it is in his hands and off the deck');
  p.freeT = 5; p.jobT = 0; jobs.update(p, 0.1);
  report(p.job && p.job.kind === 'stow' && /STOW THE SCRAP/.test(p.job.label), `carrying it, the arrow says "${p.job ? p.job.label : '-'}"`);
  p.x = sp.x; step(sim, 3);
  u = ours.sim.interaction(p, null).use;
  report(u && u.type === 'stow' && /1\/8/.test(u.label), `at the bin: "${u && u.label}"`);
  p.actQ = true; step(sim, secs(3));
  report(p.carry === null && st.scrapHold.count === 1 && st.scrapStats.stowed === 1 && st.run.scrapStowed === 1 && momentsOf(st, 'scrap-first').length === 1, `stowed: the hold has ${st.scrapHold.count}, run.scrapStowed ${st.run.scrapStowed}, a "scrap-first" moment`);
  { const hold = st.scrapHold.count; st.scrapHold.count = 0; step(sim, 3); const l0 = st.balance.live; st.scrapHold.count = 3; step(sim, 3); const l1 = st.balance.live; st.scrapHold.count = hold;
    report(l1 - l0 > hw(3) - 0.5 && l1 - l0 < hw(3) + 0.5, `the hold weighs: three bundles in it move the live balance by ${(l1 - l0).toFixed(1)} (${hw(3)}; the first ${S.HOLD_FREE} are ballast)`); }
  step(sim, 3);
  const wt1 = st.liftWeight.weight;
  // fill it, then one too many
  for (let i = 0; i < S.HOLD_CAP + 1; i++) { p.carry = 'scrap'; p.actQ = true; step(sim, 4); }
  report(st.scrapHold.count === S.HOLD_CAP && p.carry === 'scrap', `the hold takes ${st.scrapHold.count} and no more (the ninth stays in his hands)`);
  u = ours.sim.interaction(p, null).use;
  report(u && u.type === 'need' && /full/.test(u.label), `a full hold says so: "${u && u.label}"`);
  step(sim, secs(2));
  const wt2 = st.liftWeight.weight;
  report(wt2 - wt1 > hw(S.HOLD_CAP) - hw(1) - 2 && wt2 - wt1 < hw(S.HOLD_CAP) - hw(1) + 2, `a full hold shows on the LIFT / WEIGHT gauge: weight ${wt1.toFixed(1)} -> ${wt2.toFixed(1)} (+${(wt2 - wt1).toFixed(1)}, seven bundles more at ${S.BUNDLE_W})`);
  // not in Versus, not with the switch off: the hold is a thing of the game only
  config.SCRAP.ENABLED = false; step(sim, secs(1));
  const wt3 = st.liftWeight.weight;
  config.SCRAP.ENABLED = true;
  report(wt2 - wt3 > hw(S.HOLD_CAP) - 2, 'with the switch off the hold weighs nothing');
  // GRAB at the bin takes one out again (for G4's frames); the purse helpers G2 prices from
  p.carry = null; p.x = sp.x; step(sim, 3);
  const n0 = st.scrapHold.count, gr = ours.sim.interaction(p, null).grab;
  report(gr && gr.type === 'unstow' && /Take scrap out/.test(gr.label), `GRAB at the bin with empty hands: "${gr && gr.label}"`);
  p.grabLock = 0; p.grabQ = true; step(sim, 3);
  report(p.carry === 'scrap' && st.scrapHold.count === n0 - 1, `...takes one out (${n0} -> ${st.scrapHold.count}, in his hands)`);
  p.carry = null;
  const h0 = st.scrapHold.count, ok1 = SC.holdSpend(ours.ctx, 3), left = st.scrapHold.count, fit = SC.holdAdd(ours.ctx, 99), no = SC.holdSpend(ours.ctx, 99);
  report(ok1 && left === h0 - 3 && fit === S.HOLD_CAP - left && st.scrapHold.count === S.HOLD_CAP && !no, `holdSpend takes 3 (${h0} -> ${left}), holdAdd fits ${fit} and stops at the cap (${st.scrapHold.count}), holdSpend refuses more than it has`);
}

// ---------------------------------------------------------------- 7. GOING DOWN!: dump the scrap
{
  const { sim, st, ours } = boot();
  step(sim, secs(2));
  clean(st);
  const sp = SC.holdSpot(ours.layout);
  st.scrapHold = { count: S.HOLD_CAP };
  const p = person(st, ours, 'dump', sp.d, sp.x);
  step(sim, secs(1));
  const w0 = st.liftWeight.weight;
  for (const b of st.bags) b.gas = 8;
  st.ship.press = 0; st.ship.fuel = 12;
  for (let k = 0; k < 4; k++) st.gasHoles.push(ours.sim.gasHoleAt(ours.layout.gasbags[0].cx + (k - 1.5) * 150, ours.layout.gasbags[0].cy, 0));
  let fell = false;
  step(sim, secs(40), () => { if (st.goingDown) { fell = true; return 'stop'; } });
  report(fell, 'lift short of weight: FALLING starts');
  const w1 = st.liftWeight.weight;
  p.x = sp.x; p.d = sp.d; step(sim, 6);
  const u = ours.sim.interaction(p, null).use;
  report(u && u.type === 'dumpscrap' && u.hold && /SCRAP/.test(u.label), `at the bin the Action button says "${u && u.label}" (hold)`);
  p.fire = true; step(sim, secs(4)); p.fire = false; step(sim, secs(1));
  report(st.scrapHold.count === 0 && st.scrapStats.dumped >= S.HOLD_CAP && momentsOf(st, 'scrap-dumped').length === 1, `held Action throws the whole hold overboard (hold ${st.scrapHold.count}, dumped ${st.scrapStats.dumped}, a "scrap-dumped" moment)`);
  report(st.liftWeight.weight < w1 - hw(S.HOLD_CAP) + 6, `the gauge drops with it: weight ${w1.toFixed(1)} -> ${st.liftWeight.weight.toFixed(1)}`);
  // the bots do it before they cut a section away
  const r = boot({ bots: 8, s: seed + 3 });
  step(r.sim, secs(8));
  clean(r.st);
  r.st.scrapHold = { count: S.HOLD_CAP };
  for (const b of r.st.bags) b.gas = 8;
  r.st.ship.press = 0; r.st.ship.fuel = 12;
  for (let k = 0; k < 4; k++) r.st.gasHoles.push(r.ours.sim.gasHoleAt(r.ours.layout.gasbags[0].cx + (k - 1.5) * 150, r.ours.layout.gasbags[0].cy, 0));
  let dumpedAt = null, cutsAtDump = null;
  step(r.sim, secs(90), (i) => { r.st.ship.press = 0; r.st.ship.fuel = 0; if (r.st.goingDown && r.st.scrapHold.count === 0 && dumpedAt == null) { dumpedAt = i / 60; cutsAtDump = r.st.goingDown.cuts; return 'stop'; } });
  report(dumpedAt != null && cutsAtDump === 0, `bots dump the scrap while she falls, before any section is cut (${dumpedAt == null ? 'never' : dumpedAt.toFixed(0) + ' s in'}, cuts so far ${cutsAtDump})`);
}

// ---------------------------------------------------------------- 8. limp home keeps the hold; 9. a hand dump at the rail
{
  const { sim, st, ours } = boot();
  step(sim, secs(2));
  clean(st);
  st.scrapHold = { count: 5 };
  ours.sim.wreck('TEST');
  report(!!st.limp, `a wreck with a spare gasbag: she limps (${st.limp ? st.limp.spares : '-'} spares left)`);
  step(sim, secs(config.LIMP.TIME + 3));
  report(!st.limp && !st.ship.down && st.scrapHold.count === 5 && SC.holdWeight(ours.ctx) === hw(5), `limped home: the hold still has ${st.scrapHold.count} bundles (and weighs ${SC.holdWeight(ours.ctx)})`);
}
{
  const { sim, st, ours } = boot();
  step(sim, secs(2));
  clean(st);
  const cw = ours.layout.platforms.findIndex((q) => q.id === 'catwalk'), deck = ours.layout.platforms[cw];
  const p = person(st, ours, 'rail', cw, deck.x0 + 40, 'scrap');
  step(sim, 3);
  const u = ours.sim.interaction(p, null).use;
  report(u && u.type === 'dump', `carrying a bundle at the rail: "${u && u.label}"`);
  const lost0 = st.scrapStats.lost;
  p.actQ = true; step(sim, 3);
  report(p.carry === null && st.scrapStats.lost === lost0 + 1 && st.scrapStats.dumped >= 1, 'dumped over the side: it is gone and counted as lost');
}

// ---------------------------------------------------------------- 10. the helm's plan
{
  const { sim, st, ours } = boot({ bots: 0 });
  step(sim, secs(2));
  clean(st);
  const td = SC.topDeck(ours.layout), mid = toWorldX(ours, (td.x0 + td.x1) / 2), dy = toWorldY(ours, td.y);
  const w = windSpeed(st) * config.SHIP.TOP_SPEED;
  st.thrown.push({ id: 9300, kind: 'scrap', x: mid + 900, y: dy - 600, vx: w, vy: 85, t: 0, from: null, spin: 0, rot: 0, chute: true, src: 'test' });
  const a = SC.helmPlan(st);
  report(a && a.speed > windSpeed(st) && a.item === st.thrown[0], `bundle 900 px ahead: the helm speeds up (lever ${a ? a.speed.toFixed(2) : '-'} against the wind's ${windSpeed(st).toFixed(2)})`);
  st.thrown[0].x = mid - 900;
  const b = SC.helmPlan(st);
  report(b && b.speed < windSpeed(st), `bundle 900 px astern: the helm slows (lever ${b ? b.speed.toFixed(2) : '-'})`);
  st.thrown[0].x = mid; st.thrown[0].y = dy + 100;
  const c = SC.helmPlan(st);
  report(c && c.alt != null && c.alt < ours.state.alt, `bundle below her deck: the helm dives under it (altitude ${c && c.alt != null ? c.alt.toFixed(0) : '-'} against ${ours.state.alt.toFixed(0)})`);
  st.bullets.push({ x: mid, y: dy, vx: 0, vy: 0, life: 3 });
  st.strafers.push({ x: mid + 300, y: dy - 100, hp: 3, vx: 0, vy: 0 });
  report(SC.helmPlan(st) === null, 'with a fighter close by there is no detour (a calm only)');
  clean(st);
}

// ---------------------------------------------------------------- 11. the tools: off means off, bots stow, the same seed twice
{
  const run = (args, env = {}) => {
    const e = { ...process.env, ...env };
    delete e.NO_STRUCTURE;
    if (!env.NO_SCRAP) delete e.NO_SCRAP;
    const r = spawnSync(process.execPath, [path.join(here, 'botsim.mjs'), ...args], { encoding: 'utf8', maxBuffer: 1 << 26, env: e });
    const out = r.stdout || '';
    return { out, errors: Number((/errors: (\d+)/.exec(out) || [])[1] ?? -1), scrap: (out.split('\n').find((l) => l.startsWith('scrap:')) || null), summary: out.slice(out.indexOf('--- botsim summary ---')).replace(/real time:.*/, '') };
  };
  const off1 = run(['--minutes', '1', '--seed', '4', '--map', 'open'], { NO_SCRAP: '1' });
  const off2 = run(['--minutes', '1', '--seed', '4', '--map', 'open'], { BATCH_SET: 'SCRAP.ENABLED=false' });
  report(!off1.scrap && !off2.scrap && off1.summary === off2.summary && off1.errors === 0, 'NO_SCRAP=1 and SCRAP.ENABLED=false play the same game and print no scrap line');
  for (const map of quick ? ['network'] : ['network', 'route']) {
    const a = run(['--minutes', '3', '--bots', '8', '--seed', '5', '--map', map]);
    const m = a.scrap && /stowed (\d+)/.exec(a.scrap);
    report(a.errors === 0 && !!m, `botsim 3 min, 8 bots, ${map}: 0 errors, ${a.scrap || 'no scrap line'}`);
    if (map === 'network') { const b = run(['--minutes', '3', '--bots', '8', '--seed', '5', '--map', map]); report(a.scrap === b.scrap && a.summary === b.summary, 'the same seed plays the same twice, scrap line and all'); }
  }
}

report(errors.length === 0, `no game error logged${errors.length ? ': ' + errors.slice(0, 2).join(' || ') : ''}`);
console.log(ok ? 'SCRAP GATE: ALL PASSED' : 'SCRAP GATE: FAILED');
process.exit(ok ? 0 : 1);
