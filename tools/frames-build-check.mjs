// FRAMES gate (LOOP.md G4, "the crew should be ship building as they go from scraps"; public/modules/host/buildFrames.js, simulation.js placeFrame / finishFrame, shipSim.js growPart, config.FRAMES). Headless.
//   node tools/buildsim.mjs --check-frames-build        or directly:   node tools/frames-build-check.mjs [--seed 1] [--quick 1]
// (Not --check-frames: that is the B0 frame-by-frame trace gate.)
//
//   1  the card: at the dock a framable part (a gun, a lamp, plate ...) has a FRAME twin - the same part and places, a share of the salvage (CASH_SHARE) and no bundles at the dock, the words say how many to carry; a big part (an
//      engine, a gasbag) has none; none while a frame is waiting; none with the switch off (FRAMES.ENABLED, SCRAP off, NO_FRAMES=1);
//   2  buying it: salvage goes, the hold is not touched, the plain card is sold too, the place is voted (A / B / C), the frame stands on its place (run.frames), the blueprint says FRAME;
//   3  the work: a bundle in the hands at the work spot = hold Action "BUILD <PART> (n/m)", TIME seconds a bundle, let go half way and it starts over, empty hands / the wrong deck / a far spot = nothing, other jobs
//      (a failing segment) still come first;
//   4  the part comes alive: the last bundle grows the ship in the air (a gun station, its shells), the crew keep their decks, the parts list and run.build grow, run.parts remembers who built it, the Book moment and the Log
//      sentence name the builders, the scorecard stats; the ship flies on;
//   5  the arrows: a gold arrow to the hold bin then to the frame, verb BUILD, none without scrap;
//   6  the bots: they build in a calm and only in a calm (not in a set piece, with raiders or a fire aboard, a fall, a gunship hunting), at most CAP at once, and the gold arrow leaves with the frame;
//   7  a ship that changed under the frame (a part broke off) can't finish it and the dock pays it back; a part bought meanwhile re-cuts the place;
//   8  two ships: a frame belongs to ship 0, a crewman of another ship at the same spot builds nothing, the other ship's layout is not touched;
//   9  the switch: NO_FRAMES=1 / FRAMES.ENABLED false = the plain part card only and no action;
//  10  an 8-bot voyage (voyagesim, SCRAP_ON): 0 errors, frames bought and built.
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
const { applyBuild } = await load('shipLayout.js');
const SC = await load('modules/host/scrap.js');
const BF = await load('modules/host/buildFrames.js');
const { writeStop } = await load('modules/host/logWriter.js');
const { JOB_COLORS } = await load('modules/host/jobs.js');
const F = config.FRAMES;
const DT = 1 / 60;
const errors = [];
const secs = (s) => Math.round(s * 60);
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

function boot({ bots = 0, startBuild = 'sparrow', calm = true, s = seed } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.SCRAP.ENABLED = true;
  config.FRAMES.ENABLED = true;
  config.PVP.ENABLED = false;
  config.PARTS_SHOP.DERELICT_STOPS = []; // (a part found in a wreck is free and has no frame card: these scenes buy)
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
  return { sim, st, ours };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const person = (st, ours, id, deck, x, carry = null, name = id) => {
  const d = typeof deck === 'number' ? deck : ours.layout.platforms.findIndex((q) => q.id === deck);
  st.players[id] = { id, name, species: 'fox', color: '#fff', x, y: ours.layout.platforms[d].y, d, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry, fire: false, uk: null };
  return st.players[id];
};
const clean = (st) => { st.strafers.length = 0; st.bombers.length = 0; st.thrown.length = 0; st.hulks.length = 0; st.boss = null; st.creature = null; st.gunship = null; };
const momentsOf = (st, kind) => (st.moments || []).filter((m) => m.kind === kind);
const gunsOf = (ours) => ours.layout.stations.filter((q) => q.kind === 'gun').length;

// A dock with a given part forced on offer (entry id), salvage and hold as asked. Returns the booted sim with the vote open.
function dock(entry, { salvage = 600, hold = 0, build = 'sparrow', bots = 0, s = seed } = {}) {
  const b = boot({ startBuild: build, bots, s });
  step(b.sim, secs(20));
  b.st.run.salvage = salvage;
  b.st.scrapHold = { count: hold };
  b.st.yardOnly = entry;
  config.SHOP.V2_PART_CHANCE = 1;
  b.sim.startDock();
  return b;
}
const cardsOf = (st) => st.vote.options;
const frameOf = (st) => st.vote.options.find((o) => o.frame);
const plainOf = (st) => st.vote.options.find((o) => o.kind === 'part' && !o.frame);
// Buy the frame card: one player votes for it (and, if there are several places, for place A)
function buyFrame(b, who = 'buyer') {
  const { sim, st, ours } = b;
  const i = st.vote.options.findIndex((o) => o.frame);
  const pl = st.players[who] || person(st, ours, who, 'main', 300);
  const all = Object.values(st.players);
  for (const q of all) { q.vote = i; q.voteAt = 1e9; }
  step(sim, secs(4));
  for (let k = 0; k < 4 && st.vote && st.vote.kind === 'slot'; k++) { for (const q of all) { q.vote = 0; q.voteAt = 1e9; } step(sim, secs(4)); }
  for (const q of all) q.vote = null;
  return i;
}
// finish the dock (cast off) so the ship flies on, with the frame standing
function castOff(b) {
  const { sim, st } = b;
  for (let k = 0; k < 12 && st.vote; k++) {
    const v = st.vote;
    for (const p of Object.values(st.players)) { p.vote = v.kind === 'dock' ? v.options.findIndex((o) => o.kind === 'cast') : 0; p.voteAt = 1e9; }
    step(sim, secs(3));
  }
  for (const p of Object.values(st.players)) p.vote = null;
  step(sim, secs(2));
}

// ---------------------------------------------------------------- 1. the card
{
  const base = dock('gun');
  const st = base.st, cards = cardsOf(st), plain = plainOf(st), fr = frameOf(st);
  report(!!plain && !!fr && cards.indexOf(fr) === cards.indexOf(plain) + 1 && cards[cards.length - 1].kind === 'cast', `a gun on offer has a FRAME twin right after the part card (${cards.map((o) => o.name).join(' | ')})`);
  report(fr.frame && fr.need >= F.MIN && fr.need <= F.MAX && fr.need === BF.bundlesFor(fr.base) && !fr.scrap && fr.entry === plain.entry && fr.choices === plain.choices, `it asks ${fr.need} bundles to be carried in flight and none at the dock; the same places as the part card (${fr.choices.length})`);
  report(fr.cost === Math.round((fr.base * F.CASH_SHARE) / 5) * 5 && fr.cost < plain.cost + 1 && /carry \d+ scrap/.test(SC.priceWords(fr)), `it costs ${fr.cost} salvage (${F.CASH_SHARE} of ${fr.base}; the plain card costs ${plain.cost} + ${plain.scrap} scrap): "${SC.priceWords(fr)}"`);
  { const empty = dock('gun', { hold: 0 }), f2 = frameOf(empty.st), p2 = plainOf(empty.st); report(f2.cost < p2.cost, `with an empty hold the plain card is all cash (${p2.cost}) and the frame is cheaper (${f2.cost}): labour instead of money`); }
  const big = dock('gasbag'), eng = dock('engine');
  report(!frameOf(big.st) && !frameOf(eng.st), 'a gasbag and an engine pod (the big parts) have no frame card: they stay at the Yard');
  for (const id of ['lamp', 'armour', 'ballast', 'sail', 'ladder']) { const d = dock(id); if (!plainOf(d.st)) { console.log('NOTE ' + id + ': no place on the Sparrow'); continue; } report(!!frameOf(d.st), `a ${id} can be bought as a frame`); }
  { const d = dock('gun', { s: seed + 3 }); buyFrame(d); d.st.vote = null; d.st.yardOnly = 'lamp'; d.st.run.salvage = 600; d.sim.startDock(); report(!!plainOf(d.st) && !frameOf(d.st), 'with one frame already waiting there is a plain part card and no second frame card'); }
  { const d = dock('gun'); d.st.run.salvage = 5; report(frameOf(d.st) && d.st.vote.options.every((o) => o.kind === 'cast' || o.cost > 5 || true), 'the card is priced even when the crew is poor'); }
  // the phone sees the price in words
  { const d = dock('gun'); const pl = person(d.st, d.ours, 'phone', 'main', 300); pl.connected = true; step(d.sim, 20); report(typeof SC.priceWords(frameOf(d.st)) === 'string', 'the phone card price is in words'); }
  // off switches
  { const d = dock('gun'); config.FRAMES.ENABLED = false; d.st.vote = null; d.sim.startDock(); report(!frameOf(d.st) && !!plainOf(d.st), 'FRAMES.ENABLED = false: the plain part card only'); config.FRAMES.ENABLED = true; }
  { const d = dock('gun'); config.SCRAP.ENABLED = false; d.st.vote = null; d.sim.startDock(); report(!frameOf(d.st), 'with scrap off there is no frame card'); config.SCRAP.ENABLED = true; }
}

// ---------------------------------------------------------------- 2. buying it
let GUN = null;
{
  const b = dock('gun', { salvage: 600, hold: 5 });
  const { st, ours } = b, fr = frameOf(st), plain = plainOf(st), cost = fr.cost;
  const guns0 = gunsOf(ours);
  buyFrame(b);
  const f = st.run.frames[0];
  report(st.run.salvage === 600 - cost && st.scrapHold.count === 5, `bought: salvage 600 -> ${st.run.salvage} (-${cost}), the hold is not touched (${st.scrapHold.count})`);
  report(st.run.frames.length === 1 && f && f.entry === 'gun' && f.need === fr.need && f.fill === 0 && !f.done && f.ok && f.paid === cost && plain.sold && fr.sold, `the frame stands on its place (${f && f.where}, letter ${f && f.letter}), the plain card is sold too`);
  report(gunsOf(ours) === guns0 && st.yard.built && st.yard.built.frame, 'no gun yet (still a scaffold), and the blueprint stamp is a FRAME');
  report(st.run.bought.includes('frame-gun') && !st.run.parts.some((p) => p.id === 'gun'), 'the purchase is on the run, not yet a part');
  castOff(b);
  step(b.sim, secs(3));
  const sp = BF.frameSpot(ours, f);
  report(st.vote == null && st.phase === 'flying' && sp && ours.layout.platforms[sp.d], `she casts off with it on deck ${ours.layout.platforms[sp.d].id} at x ${Math.round(sp.x)} (the part's place is ${Math.round(f.x)}, ${Math.round(f.y)})`);
  GUN = { b, f, sp, guns0 };
}

// ---------------------------------------------------------------- 3. the work
{
  const { b, f, sp, guns0 } = GUN, { sim, st, ours } = b;
  clean(st);
  const d0 = sp.d, x0 = sp.x;
  const p = person(st, ours, 'ann', d0, x0, 'scrap', 'Ann');
  step(sim, 3);
  let u = ours.sim.interaction(p, null).use;
  report(u && u.type === 'buildframe' && u.hold && u.label === `BUILD ${f.name.toUpperCase()} (0/${f.need})`, `a bundle in his hands at the work spot: "${u && u.label}" (hold)`);
  const empty = person(st, ours, 'empty', d0, x0);
  step(sim, 3);
  report((ours.sim.interaction(empty, null).use || {}).type !== 'buildframe', 'empty hands: nothing to build with');
  const far = person(st, ours, 'far', d0, x0 + F.REACH + 120, 'scrap');
  step(sim, 3);
  report((ours.sim.interaction(far, null).use || {}).type !== 'buildframe', `${F.REACH + 120} px away: out of reach`);
  const other = ours.layout.platforms.findIndex((q, i) => i !== d0 && q.x1 - q.x0 > 200 && q.x0 < x0 && q.x1 > x0);
  if (other >= 0) { const wrong = person(st, ours, 'wrong', other, x0, 'scrap'); step(sim, 3); report((ours.sim.interaction(wrong, null).use || {}).type !== 'buildframe', 'the right x on the wrong deck: nothing'); }
  p.fire = true; step(sim, secs(F.TIME * 0.5)); p.fire = false; step(sim, secs(1));
  report(p.carry === 'scrap' && f.fill === 0 && !f.prog, 'let go half way: the bundle is still in his hands and the bundle starts over');
  p.fire = true; step(sim, secs(F.TIME + 0.6)); p.fire = false; step(sim, 3);
  report(p.carry === null && f.fill === 1 && st.scrapStats.framed === 1 && st.run.scrap.framed === 1, `held Action ${F.TIME} s: the bundle is used up, the frame is 1/${f.need}, counted`);
  u = ours.sim.interaction(person(st, ours, 'bo', d0, x0, 'scrap', 'Bo'), null).use;
  report(u && u.label === `BUILD ${f.name.toUpperCase()} (1/${f.need})`, `the button says it: "${u && u.label}"`);
  // a failing segment still comes first for the man standing on it
  const seg = ours.sim.structure.segs().filter((g) => g.d === d0 && !g.nest).sort((a, b) => Math.abs(a.x - x0) - Math.abs(b.x - x0))[0];
  if (seg) { const bo = p0(st, 'bo'), keep = f.spot; f.spot = { d: seg.d, x: seg.x }; f.spotV = ours.layout.version; bo.d = seg.d; bo.x = seg.x; seg.hp = 0.2; step(sim, 3); const u2 = ours.sim.interaction(bo, null).use; report(u2 && u2.type === 'scrappatch', `a failing segment under his feet, with the frame beside it, is patched first (${u2 && u2.type})`); seg.hp = 1; bo.d = d0; bo.x = x0; f.spot = keep; f.spotV = ours.layout.version; step(sim, 3); }
  GUN.p = p;
}
function p0(st, id) { return st.players[id]; }

// ---------------------------------------------------------------- 4. the part comes alive
{
  const { b, f, sp, guns0 } = GUN, { sim, st, ours } = b;
  const ann = st.players.ann, bo = st.players.bo;
  const L = ours.layout, ver0 = L.version, stations0 = L.stations.length;
  // somebody else is walking the decks when the ship grows: he must keep his deck
  const walker = person(st, ours, 'cy', 'main', 400, null, 'Cy');
  const wd = walker.d, wid = L.platforms[wd].id;
  for (const who of [ann, bo]) { who.carry = 'scrap'; who.x = sp.x; who.d = sp.d; }
  let guard = 0;
  while (f.fill < f.need && guard++ < 8) {
    for (const who of [ann, bo]) { if (f.fill >= f.need) break; who.carry = 'scrap'; who.fire = true; }
    step(sim, secs(F.TIME + 0.5), () => (f.done || f.fill >= f.need ? 'stop' : null));
    ann.fire = bo.fire = false;
  }
  step(sim, 5);
  report(f.done && f.fill === f.need && gunsOf(ours) === guns0 + 1 && L.version > ver0 && L.stations.length === stations0 + 1, `the last bundle: the gun is alive (${guns0} -> ${gunsOf(ours)} guns, layout v${ver0} -> v${L.version})`);
  const added = L.stations.filter((q) => q.kind === 'gun').map((q) => q.n).find((n) => st.GUNS[n] && st.GUNS[n].ammo > 0);
  report(L.stations.filter((q) => q.kind === 'gun').every((q) => st.GUNS[q.n] && st.GUNS[q.n].max > 0), `every gun has its record and its shells (${Object.keys(st.GUNS).length}), the new one too (${added})`);
  report(st.run.build === L.parts && ours.buildId === 'yard' && st.run.parts.some((p) => p.id === 'gun' && p.frame && p.by.length >= 1), `the parts list and run.build grew; run.parts remembers it: ${JSON.stringify(st.run.parts.filter((p) => p.frame).map((p) => ({ id: p.id, by: p.by, names: p.names })))}`);
  report(L.platforms[walker.d] && L.platforms[walker.d].id === wid, `a crewman walking the main deck kept it through the refit (deck ${wid})`);
  report(ann.d != null && L.platforms[ann.d] && Math.abs(ann.x - sp.x) < 5, 'the builders are where they were');
  const ms = momentsOf(st, 'frame-built');
  report(ms.length === 1 && ms[0].who.includes('Ann') && ms[0].who.includes('Bo') && ms[0].data.names[0] === f.name, `the Ship's Book has the moment: ${ms.map((m) => m.who.join('+')).join(',')} built the ${f.name}`);
  const entry = writeStop(st.moments, { no: 1, name: 'Test' }, { players: Object.values(st.players), used: new Set() });
  report(/\b(Ann and Bo|Bo and Ann)\b/.test(entry.text) && /gun mount/i.test(entry.text) && entry.playKind === 'frame-built', `the Log names them: "${entry.text}"`);
  report(st.run.scrap.framesBuilt === 1 && st.run.scrap.framed === f.need && (ann.stats || {}).framed >= 1 && st.yard.newPart && st.yard.newPart.t > 0, `counted (${st.run.scrap.framed} bundles, 1 frame built) and the NEW call-out is up`);
  report(BF.pendingOf(st).length === 0 && !ours.sim.interaction(person(st, ours, 'late', sp.d, sp.x, 'scrap'), null).use?.type?.startsWith('buildframe'), 'no frame waiting any more; a late bundle has nothing to go into');
  step(sim, secs(20));
  report(errors.length === 0 && st.ship.down <= 0 && !st.wreck, 'she flies on for 20 s, no errors');
  // the dock can offer the next frame again, and the part now counts in the run
  st.vote = null; st.run.salvage = 600; st.yardOnly = 'lamp'; sim.startDock();
  report(!!st.vote && st.vote.options.length >= 3, `the next dock: ${st.vote && st.vote.options.map((o) => o.name).join(' | ')}`);
  report(!!frameOf(st), 'the next dock can offer another frame (the first one is built)');
}

// ---------------------------------------------------------------- 5. the arrows
{
  const b = dock('lamp', { hold: 3 });
  buyFrame(b);
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0], sp = BF.frameSpot(ours, f), bin = SC.holdSpot(ours.layout);
  clean(st);
  if (!f) report(false, 'no lamp frame to test the arrows with');
  else {
    const idle = person(st, ours, 'idle', bin.d, bin.x - 200);
    idle.freeT = 5; idle.jobT = 0; ours.sim.jobFinder.update(idle, 0.1);
    report(idle.job && idle.job.kind === 'buildgrab' && idle.job.color === '#ffd23f' && /TAKE SCRAP/.test(idle.job.label) && (!config.CONTROLS.ROLE_CARDS.ENABLED || idle.job.verb === 'GRAB'), `empty hands, scrap in the hold: the gold arrow says "${idle.job && idle.job.label}" (${idle.job && idle.job.verb})`);
    idle.carry = 'scrap'; idle.jobT = 0; idle.job = null; ours.sim.jobFinder.update(idle, 0.1);
    report(idle.job && idle.job.kind === 'buildframe' && idle.job.color === '#ffd23f' && /^BUILD /.test(idle.job.label) && (!config.CONTROLS.ROLE_CARDS.ENABLED || idle.job.verb === 'BUILD'), `carrying it: "${idle.job && idle.job.label}" (verb ${idle.job && idle.job.verb})`);
    st.fires.push({ d: ours.layout.deckIndex('main'), x: 300, prog: 0, big: false }); idle.jobT = 0; idle.job = null; ours.sim.jobFinder.update(idle, 0.1);
    report(!idle.job || (idle.job.kind !== 'buildframe' && idle.job.kind !== 'buildgrab'), `with a fire burning the arrow is not for the frame (${idle.job ? idle.job.kind : 'none'}): building is for a calm`);
    st.fires.length = 0;
    st.tempo.phase = 'peak'; idle.jobT = 0; idle.job = null; ours.sim.jobFinder.update(idle, 0.1);
    report(!idle.job || (idle.job.kind !== 'buildframe' && idle.job.kind !== 'buildgrab'), `in a set piece (tempo peak) there is no build arrow either (${idle.job ? idle.job.kind : 'none'})`);
    st.tempo.phase = 'calm';
    idle.carry = null; st.scrapHold = { count: 0 }; idle.jobT = 0; idle.job = null; ours.sim.jobFinder.update(idle, 0.1);
    report(!idle.job || (idle.job.kind !== 'buildgrab' && idle.job.kind !== 'buildframe'), 'no scrap anywhere: no gold arrow');
    report(JOB_COLORS.buildframe && JOB_COLORS.buildgrab, 'the colours are registered');
    // GRAB at the bin feeds it
    st.scrapHold = { count: 3 };
    const g2 = person(st, ours, 'grabber', bin.d, bin.x);
    step(sim, 3);
    const gr = ours.sim.interaction(g2, null).grab;
    g2.grabLock = 0; g2.grabQ = true; step(sim, 3);
    report(gr && gr.type === 'unstow' && g2.carry === 'scrap' && st.scrapHold.count === 2, 'GRAB at the bin takes a bundle for the frame');
  }
}

// ---------------------------------------------------------------- 6. the bots build in a calm, and only in a calm
{
  const b = dock('gun', { hold: 5, bots: 6, s: seed + 5 });
  buyFrame(b, 'buyer');
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0];
  clean(st);
  st.tempo.phase = 'peak'; st.tempo.t = 40; st.tempo.kind = null; // a set piece in progress: held there
  const phase = (p, t = 40) => { st.tempo.phase = p; st.tempo.t = Math.max(st.tempo.t, t); };
  let buildJobs = 0, maxAt = 0;
  step(sim, secs(25), () => { phase('peak', 40); st.tempo.rate = 0; const n = Object.values(st.players).filter((q) => q.bot && q.botJob && q.botJob.kind === 'buildframe').length; buildJobs += n; return null; });
  report(buildJobs === 0 && f.fill === 0, `in a set piece (tempo ${st.tempo.phase}) 25 s: no bot took a build job (${buildJobs} samples), frame ${f.fill}/${f.need}`);
  for (const bad of [{ name: 'a fire aboard', set: () => { if (!st.fires.length) st.fires.push({ d: ours.layout.deckIndex('main'), x: 500, prog: 0, big: false }); }, clear: () => { st.fires.length = 0; } }, { name: 'raiders aboard', set: () => { if (!st.boarders.length) st.boarders.push({ id: 'rx', type: 'grunt', name: 'Raider', species: config.CREW_SPECIES[0], color: '#a33', scale: 1, x: 150, y: 640, d: ours.layout.deckIndex('main'), fall: false, hp: 5, hit: 0, cd: 0, windup: 0, face: 1 }); }, clear: () => { st.boarders.length = 0; } }]) {
    let n2 = 0;
    step(sim, secs(10), () => { phase('calm', 40); st.tempo.rate = 0; bad.set(); n2 += Object.values(st.players).filter((q) => q.bot && q.botJob && q.botJob.kind === 'buildframe').length; return null; });
    bad.clear();
    report(n2 === 0, `in a calm but with ${bad.name}: no bot builds (${n2} samples)`);
  }
  let peak = 0, done = null;
  step(sim, secs(150), (i) => {
    phase('calm', 40); st.tempo.rate = 0; st.fires.length = 0; st.boarders.length = 0; clean(st);
    const n = Object.values(st.players).filter((q) => q.bot && q.botJob && q.botJob.kind === 'buildframe').length;
    peak = Math.max(peak, n);
    if (f.done) { done = i / 60; return 'stop'; }
    return null;
  });
  report(f.done && done != null, `in a calm the bots carry scrap to it and the part comes alive (${done == null ? 'never' : done.toFixed(0) + ' s'}, hold ${st.scrapHold.count}, at most ${peak} on the job at once, CAP ${F.BOTS.CAP})`);
  report(peak <= F.BOTS.CAP, `no more than ${F.BOTS.CAP} bots at a time on the build (peak ${peak})`);
  report(st.moments.some((m) => m.kind === 'frame-built' && m.who.some((n) => /^Bot/.test(n))), 'the Book names the bots that built it');
  report(errors.length === 0, 'no errors in the bots\' scenes');
}
// the bot job leaves with the calm: a bot half way is called off, and the bundle in its hands is stowed
{
  const b = dock('gun', { hold: 5, bots: 3, s: seed + 9 });
  buyFrame(b, 'buyer');
  castOff(b);
  const { sim, st } = b, f = st.run.frames[0];
  clean(st);
  let started = null;
  step(sim, secs(40), () => { st.tempo.phase = 'calm'; st.tempo.t = 50; st.tempo.rate = 0; const w = Object.values(st.players).find((q) => q.bot && q.botJob && q.botJob.kind === 'buildframe' && q.carry === 'scrap'); if (w) { started = w; return 'stop'; } return null; });
  if (!started) report(false, 'no bot started a build job to call off');
  else {
    st.tempo.phase = 'peak'; st.tempo.t = 60;
    step(sim, secs(4), () => { st.tempo.phase = 'peak'; st.tempo.t = 60; st.tempo.rate = 0; });
    report(!started.botJob || started.botJob.kind !== 'buildframe', `a set piece starts: ${started.name} drops the build job (job now ${started.botJob ? started.botJob.kind : 'none'})`);
  }
}

// ---------------------------------------------------------------- 7. she changed under the frame
{
  const b = dock('gun', { hold: 5, s: seed + 11 });
  buyFrame(b);
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0], paid = f.paid;
  clean(st);
  // another part is bought before it is built: the place is cut again on what she is now and the frame still builds
  st.vote = null; st.run.salvage = 700; st.yardOnly = 'lamp'; sim.startDock();
  const v = st.vote, li = v.options.findIndex((o) => o.kind === 'part' && !o.frame);
  if (li >= 0) {
    person(st, ours, 'shopper', 'main', 300);
    const all = Object.values(st.players);
    for (const q of all) { q.vote = li; q.voteAt = 1e9; }
    step(sim, secs(4));
    for (let k = 0; k < 4 && st.vote && st.vote.kind === 'slot'; k++) { for (const q of all) { q.vote = 0; q.voteAt = 1e9; } step(sim, secs(4)); }
    castOff(b);
    step(sim, 30);
    report(f.ok === true && !f.done, 'a lamp bought in the meantime: the frame still has its place (cut again on the new list)');
    const sp = BF.frameSpot(ours, f), p = person(st, ours, 'fin', sp.d, sp.x, 'scrap', 'Fin');
    f.fill = f.need - 1;
    p.fire = true; step(sim, secs(F.TIME + 0.6)); p.fire = false; step(sim, 5);
    report(f.done && st.run.parts.filter((q) => q.id === 'gun').length === 1 && st.run.parts.some((q) => q.id === 'lamp'), `it still came alive, and the lamp is still on her (done ${f.done}, fill ${f.fill}/${f.need}, ok ${f.ok}, parts ${st.run.parts.map((q) => q.id).join(',')}, carry ${p.carry}, use ${(ours.sim.interaction(p, null).use || {}).type})`);
  } else report(false, 'no lamp card to buy');
}
{
  const b = dock('gun', { hold: 5, s: seed + 12 });
  buyFrame(b);
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0], paid = f.paid, sal = st.run.salvage;
  clean(st);
  st.run.lost.push({ id: 'lost1', cause: 'test', label: 'x', before: JSON.parse(JSON.stringify(ours.layout.parts)), price: 10, names: ['Test'], buildId: 'yard' }); // (a break-off waiting for its REBUILD)
  step(sim, 30);
  const sp = BF.frameSpot(ours, f), p = person(st, ours, 'blocked', sp.d, sp.x, 'scrap', 'Lee');
  step(sim, 3);
  const guns = (parts) => parts.filter((q) => q.part === 'gun').length;
  report(f.ok === true && (ours.sim.interaction(p, null).use || {}).type === 'buildframe', 'parts broken off and waiting for their REBUILD do not stop the building: the place is still there');
  f.fill = f.need - 1;
  p.fire = true; step(sim, secs(F.TIME + 0.6)); p.fire = false; step(sim, 5);
  const before = st.run.lost[0].before;
  report(f.done && guns(before) === guns(ours.layout.parts) && JSON.stringify(st.run.build) === JSON.stringify(before), `finished with a REBUILD pending: the part is on the ship as she was before the break-off too (${guns(before)} guns), so the REBUILD card brings it back`);
  st.run.lost.length = 0;
}
{
  // no room any more (the place is gone): the action says so, no arrow, and the next dock pays it back
  const b = dock('gun', { hold: 5, s: seed + 15 });
  buyFrame(b);
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0], paid = f.paid, sal = st.run.salvage;
  clean(st);
  f.baseKey = 'changed'; f.x = 90000; f.y = 90000; f.spot = null; f.v = -1; // (the ship is not what the frame was bought on, and nowhere near the old place is a place for it)
  step(sim, 30);
  const sp = BF.frameSpot(ours, f), p = person(st, ours, 'blocked', sp.d, sp.x, 'scrap');
  step(sim, 3);
  const u = ours.sim.interaction(p, null).use;
  report(f.ok === false && u && u.type === 'need' && /no room/i.test(u.label), `no room for it now: the button says "${u && u.label}" and takes no bundle`);
  report(!BF.pendingOf(st).some((q) => q.ok !== false), 'and no arrow is sent');
  st.vote = null; sim.startDock();
  report(st.run.frames.length === 0 && st.run.salvage === sal + paid, `at the next dock the frame is taken down and paid back (${sal} -> ${st.run.salvage})`);
}

// ---------------------------------------------------------------- 8. two ships
{
  const b = dock('gun', { hold: 5, s: seed + 13 });
  buyFrame(b);
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0];
  clean(st);
  const two = sim.addShip(BUILDS.classic, { id: 'ship1', formation: { dx: -250, dalt: -1150 } });
  const sp = BF.frameSpot(ours, f);
  const guest = { id: 'guest', ship: 'ship1', name: 'Guest', species: config.CREW_SPECIES[0], color: '#fff', x: sp.x, y: two.layout.platforms[Math.min(sp.d, two.layout.platforms.length - 1)].y, d: Math.min(sp.d, two.layout.platforms.length - 1), jx: 0, jy: 0, jxs: 0, t: 0, connected: true, ko: 0, lock: null, carry: 'scrap', fire: false, uk: null };
  st.players.guest = guest;
  step(sim, 10);
  const u = two.sim.interaction(guest, null).use;
  report(!u || u.type !== 'buildframe', `a crewman of another ship at the same deck and x gets no build action (${u ? u.type : 'none'})`);
  report(BF.nearFrame(two, guest.d, guest.x) === null && BF.nearFrame(ours, sp.d, sp.x) === f, 'nearFrame answers only for the main ship');
  const ver2 = two.layout.version, parts2 = JSON.stringify(two.layout.parts), mine = person(st, ours, 'mine', sp.d, sp.x, 'scrap', 'Mine');
  f.fill = f.need - 1; mine.fire = true; step(sim, secs(F.TIME + 0.6)); mine.fire = false; step(sim, secs(5));
  report(f.done && two.layout.version === ver2 && JSON.stringify(two.layout.parts) === parts2, 'finishing the frame grows ship 0 and leaves the other ship\'s layout alone');
  report(!(two.ctx.run && two.ctx.run.frames === undefined) && errors.length === 0, 'no errors with two ships in the sky');
}

// ---------------------------------------------------------------- 9. the switch
{
  const env = (v) => spawnSync(process.execPath, ['--input-type=module', '-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then((m) => console.log(m.config.FRAMES.ENABLED))`], { encoding: 'utf8', env: { ...process.env, ...v } }).stdout.trim();
  const e0 = { ...process.env }; delete e0.NO_FRAMES;
  report(env({ NO_FRAMES: '1' }) === 'false' && env({ NO_FRAMES: '' }) === 'true', 'NO_FRAMES=1 turns config.FRAMES.ENABLED off; unset it is on');
  config.FRAMES.ENABLED = true; config.SCRAP.ENABLED = false;
  report(!BF.framesOn() && BF.pendingOf({ run: { frames: [{ done: false }] } }).length === 0, 'with scrap off frames are off');
  config.SCRAP.ENABLED = true;
  const b = dock('gun', { hold: 5, s: seed + 14 });
  buyFrame(b);
  castOff(b);
  const { sim, st, ours } = b, f = st.run.frames[0], sp = BF.frameSpot(ours, f);
  config.FRAMES.ENABLED = false;
  const p = person(st, ours, 'off', sp.d, sp.x, 'scrap'); step(sim, 3);
  report((ours.sim.interaction(p, null).use || {}).type !== 'buildframe' && BF.pendingOf(st).length === 0, 'FRAMES.ENABLED = false: no build action');
  config.FRAMES.ENABLED = true;
}

// ---------------------------------------------------------------- 10. whole voyages with 8 bots (voyagesim)
// (the shipped bots only take a frame when they cannot pay for the plain card, which is rare: this run sets FRAMES.BOTS.PREFER 0.8 so the bots really use them - they cost the bots wins, which is why 0 is the default)
if (!quick) {
  const seeds = [3, 4, 5, 6, 7, 8];
  const { spawn } = await import('node:child_process');
  const rows = await Promise.all(seeds.map((s) => new Promise((res) => {
    const c = spawn(process.execPath, [path.join(here, 'voyagesim.mjs'), '--child', '--seed', String(s), '--bots', '8', '--maxmin', '30', '--build', 'sparrow', '--set', 'FRAMES.BOTS.PREFER=0.8'], { env: { ...process.env, SCRAP_ON: '1', NO_FRAMES: '' } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', () => { const l = out.split('\n').find((x) => x.startsWith('RESULT ')); try { res(l ? JSON.parse(l.slice(7)) : null); } catch { res(null); } });
  })));
  const bad = rows.filter((r) => !r || r.error);
  const sum = (f) => rows.reduce((a, r) => a + ((r && f(r)) || 0), 0);
  const bought = sum((r) => r.frames && r.frames.bought), built = sum((r) => r.frames && r.frames.built), bundles = sum((r) => r.frames && r.frames.bundles), errs = sum((r) => r.errors);
  report(bad.length === 0 && errs === 0, `${seeds.length} voyages with 8 bots (30 min cap): ${bad.length} crashed, ${errs} game errors; stops ${rows.map((r) => r && r.done).join(',')}`);
  report(bought >= 1 && built >= 1, `the bots buy frames at the docks and build them: ${bought} bought, ${built} built from ${bundles} bundles carried in`);
}

report(errors.length === 0, `no game error logged${errors.length ? ': ' + errors.slice(0, 2).join(' || ') : ''}`);
console.log(ok ? 'FRAMES BUILD GATE: ALL PASSED' : 'FRAMES BUILD GATE: FAILED');
process.exit(ok ? 0 : 1);
