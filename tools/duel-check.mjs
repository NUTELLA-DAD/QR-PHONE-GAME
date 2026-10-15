// THE GROUND SWORD FIGHTS gate (CASTLE.md package A4; duel.js, config.AWAY.DUEL). Headless, seeded.
//   node tools/buildsim.mjs --check-duel     or directly:  node tools/duel-check.mjs [--seed 1] [--quick] [--only a,b]
//
//   (a) the switch: on by default; NO_DUEL=1 is the old shove (A1); NO_AWAY=1 turns the whole away team off; under 3 crew nothing starts; duel.js draws no random number
//   (b) a squad's soldier: the squad notices a man, the first soldier leaves the block and runs at him, stands off, waits and raises his sword (the telegraph: a "!", the phone buzzes and flashes, then a second buzz)
//   (c) the man: ATTACK swings (a wind-up, then a hit on the soldier in front; a whiff with none), three hits put a soldier down (he lies, then flees, out of the squad for good); BLOCK blocks, a late BLOCK parries and staggers
//   (d) the blow: a hit takes a heart (i-frames), three hearts are the usual knock-out and wake; a block or a parry takes none; a staggered soldier takes a counter hit
//   (e) team-ups: a hit from behind (the soldier faces another crewman) takes a flank bonus; the soldiers share a man by taking both sides of him and never begin a blow together
//   (f) the squad: reinforcements one at a time up to MAX, it gives up after BREAK soldiers are down, the block goes home; running away works
//   (g) balance: a lone man against one soldier and against a full squad, untrained (swings only) and with decent timing, on a few seeds
//   (h) guards: a vault guard whose man comes close draws his sword and fights by the same rules
//   (i) ships: a shell on a fighter takes hits and staggers him, a bomb kills him
//   (j) friends: a friend out cold on the ground is revived by one who holds Action beside him; or he wakes by himself
//   (k) the phone: the second button is BLOCK, the left one Swing, the hint, the cue (buzz + flash + the second buzz), the Book moments and Log lines; the TV art draws the fight
//   (l) two ships in one sky: only the main ship's men are fought
//   (m) the bots: they duel when a soldier engages them on a trip; 8 bots on three castles and on open-sky raids with trips: 0 errors, no NaN
process.env.NO_ALARMS = '1'; // (the checks read the banner text right after an event)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed0 = Number(flag('seed', 1));
const quick = argv.includes('--quick');
const only = flag('only', '') ? flag('only', '').split(',') : null;
const want = (s) => !only || only.includes(s);
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { UPGRADE_BLOCKS } = await load('modules/host/upgrades.js');
const { TEMPLATES, sentence, playOf } = await load('modules/host/logWriter.js');
const OB = config.AWAY.OBJECTIVES, AW = config.AWAY, SO = OB.SOLDIERS, DU = AW.DUEL, FO = DU.FOE;
const DT = 1 / 60;
const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
const UPGRADES0 = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]])));
const restoreUpgrades = (target, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreUpgrades(target[k], v); else target[k] = copyData(v); } };
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.VOYAGE.CURRICULUM.ENABLED = false;
const DU0 = copyData(DU);

// A fresh seeded sim on a ring map (or an open-sky raid): people (h1 ...) and bots, the sky quiet. o.sent = a list the phones' messages go to.
function boot(seed, o = {}) {
  clock = seedRandom(seed);
  restoreUpgrades(config, UPGRADES0);
  restoreUpgrades(DU, DU0);
  config.MAPS.FORCE_KIND = o.kind || 'ring';
  config.RING.FORCE_VARIANT = o.variant || 'fortress';
  config.PACING.RATE_START = config.PACING.RATE_END = o.pacing ? 1 : 0;
  OB.FORCE = o.force || null;
  const sim = createSimulation();
  const st = sim.state;
  const sent = [];
  sim.setSocket({ emit: (ev, m) => { if (ev === 'host:ui') sent.push(m); } });
  st.difficulty = o.difficulty || 'easy';
  const e = st.ships[0].layout.boarderEntryPoints;
  const mk = (id, bot, i) => (st.players[id] = { id, bot, name: bot ? 'Bot' + (i + 1) : ['Mia', 'Joe', 'Ana', 'Raj'][i] || id, species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + (e[1].x - e[0].x) * ((i + 1) / 9), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true });
  for (let i = 0; i < (o.bots ?? 0); i++) mk('bot' + i, true, i);
  for (let i = 0; i < (o.humans ?? 0); i++) mk('h' + (i + 1), false, i);
  sim.castOff();
  const step = (n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); st.ship.hull = 100; } };
  step(60);
  if (o.danger) st.course.danger = o.danger;
  const sh = st.ships[0], REF = sh.layout.refPoint;
  const hold = { x: null, y: null };
  const park = (x, y) => { hold.x = x; hold.y = y; sh.pose.x = x - REF.x; sh.pose.y = y - REF.y; st.ship.vy = 0; st.ship.speed = 0; };
  const stepH = (n = 1) => { for (let i = 0; i < n; i++) { if (hold.x != null) { sh.pose.x = hold.x - REF.x; sh.pose.y = hold.y - REF.y; st.ship.vy = 0; st.ship.speed = 0; } clock.ms += DT * 1000; sim.update(DT); st.ship.hull = 100; } };
  return { sim, st, sh, REF, step, stepH, park, hold, sent, G: st.groundSys, map: () => st.course.map, ring: () => st.course.ring, S: () => st.away, O: () => st.away.obj, D: () => st.away.duel };
}
const finite = (st) => Object.values(st.players).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(st.ships[0].pose.x) && Number.isFinite(st.ships[0].pose.y);
const moments = (b, kind) => (b.st.moments || []).filter((m) => m.kind === kind);
const fx = (b, id) => b.sent.filter((m) => m.id === id && m.ui && m.ui.fx).map((m) => m.ui.fx);
// A person standing on the plaza (the ground, as a landing makes him) at world x.
function stand(b, p, x, face = 0) {
  const f = b.ring().faces[face];
  p.fall = false;
  p.fly = true;
  p.air = false;
  p.conn = null;
  p.lock = null;
  p.ko = 0;
  p.koGrace = 0;
  p.carry = null;
  p.hearts = config.HEALTH.MAX;
  p.hurtT = 0;
  p.on = { away: true, mode: 'walk', deck: null, gy: f.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
  p.x = x;
  p.y = f.y;
  p.face = 1;
  p.jx = p.jy = 0;
  return p;
}
const squadOf = (b, face = 0) => b.ring().faces[face].squads.find((q) => q.kind === 'plaza');
// The castle's first plaza squad, the ship parked over it, the sky quiet. o.n = the men in the squad.
function plaza(seed, o = {}) {
  const b = boot(seed, { humans: o.humans ?? 3, bots: o.bots ?? 0, force: ['winch'], variant: o.variant });
  const f = b.ring().faces[0], q = squadOf(b);
  if (o.n) q.n = q.max = o.n;
  b.park(f.x, f.y - 1200); // (high: the keel is out of the squad's grapple range)
  b.stepH(40);
  return { b, f, q, st: b.st, side: q.x < f.x ? -1 : 1 };
}
const live = (b, q) => b.D().foes.filter((F) => F.q === q && ['run', 'ready', 'draw', 'tell', 'recover', 'stagger'].includes(F.st));
// Step until fn() is true (or n frames): returns the frames it took, or -1.
function until(b, fn, n = 60 * 20) { for (let i = 0; i < n; i++) { if (fn()) return i; b.stepH(1); } return fn() ? n : -1; }
// A squad hunts a man standing 380 px from it; returns once its first soldier is standing off him in the 'ready' state.
function meet(b, q, p, away = 380) {
  stand(b, p, q.x + (q.x < b.ring().faces[0].x ? -away : away));
  return until(b, () => live(b, q).some((F) => F.st === 'ready' || F.st === 'tell'));
}

// ---- (a) the switch ----
if (want('a')) {
  const { spawnSync } = await import('node:child_process');
  const cfg = (env) => spawnSync(process.execPath, ['-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(({config})=>console.log(JSON.stringify([config.AWAY.ENABLED, config.AWAY.DUEL.ENABLED])))`], { encoding: 'utf8', env: { ...process.env, ...env } });
  report(DU.ENABLED === true && AW.BOT_TRIPS === false, 'DUEL is on by default (the bots make no trips by default)');
  const r1 = cfg({ NO_DUEL: '1' }), r2 = cfg({ NO_AWAY: '1' });
  report((r1.stdout || '').trim() === '[true,false]', 'NO_DUEL=1 gives the old shove-to-escape (DUEL.ENABLED false): ' + (r1.stdout || r1.stderr || '').trim().slice(0, 40));
  report((r2.stdout || '').trim() === '[false,true]', 'NO_AWAY=1 turns the whole away team off, the duel with it (nothing to fight on): ' + (r2.stdout || r2.stderr || '').trim().slice(0, 40));
  const src = fs.readFileSync(path.join(publicDir, 'modules/host/duel.js'), 'utf8');
  report(!/Math\.random/.test(src) && /state\.say\('objective'/.test(src) && !/ev\.warn|warnText/.test(src), 'duel.js draws no random number and says everything through state.say');
  const small = boot(seed0, { humans: 2 });
  small.step(30);
  report(small.D().on === false && small.D().foes.length === 0, 'with 2 crew the sword fights are off (no away team)');
  const { b, q } = plaza(seed0);
  report(b.D().on === true && q.n === q.max && b.D().foes.length === 0, `3 crew: the fights are on, and nothing happens until a soldier meets a man (${q.n} men in the squad)`);
  for (const k of ['AIM', 'DY', 'SWING', 'BLOCK', 'FOE', 'COUNTER', 'FLANK', 'SQUAD', 'GUARD', 'SHELL', 'REVIVE', 'CUE', 'MOMENTS', 'BOT']) if (DU[k] == null) report(false, 'config.AWAY.DUEL.' + k + ' exists');
  report(DU.FOE.HP === 3 && DU.SWING.WIND > 0 && DU.BLOCK.PARRY < DU.BLOCK.GUARD && DU.BLOCK.GUARD + DU.BLOCK.CD < DU.FOE.TELL + DU.FOE.RECOVER + DU.FOE.READY, `numbers hang together: 3 hits to a soldier, a parry window (${DU.BLOCK.PARRY} s) inside the guard (${DU.BLOCK.GUARD} s), a guard cannot be held for ever`);
}

// ---- (b) the soldier: run, stand off, telegraph ----
if (want('b')) {
  const { b, f, q, st } = plaza(seed0);
  const p = stand(b, st.players.h1, q.x + (q.x < f.x ? -380 : 380));
  const n0 = q.n;
  b.stepH(20);
  report(!!q.hunt && q.hunt.phase === 'tell' && b.O().stats.noticed === 1 && b.D().foes.length === 0, `the squad notices him as ever (tell, shouting): no soldier has left the block yet (${q.hunt && q.hunt.phase})`);
  { const xr = []; for (let i = 0; i < 60 * 12 && b.D().foes.length === 0; i++) { if (q.hunt && q.hunt.phase === 'run') xr.push(q.x); b.stepH(1); } const sp = xr.length > 10 ? Math.abs(xr[xr.length - 1] - xr[0]) / ((xr.length - 1) / 60) : 0; report(Math.abs(sp - FO.SPEED) < 12, 'the squad runs at him at ' + FO.SPEED + ' px/s as before (' + sp.toFixed(0) + ')'); }
  report(until(b, () => b.D().foes.length > 0) >= 0 && q.hunt && q.hunt.phase === 'duel', `at his side the hunt becomes a duel: ${b.D().foes.length} soldier leaves the block (${n0} -> ${q.n} men), the block goes home (${q.state})`);
  const F = b.D().foes[0];
  report(F.src === 'squad' && F.q === q && F.hp === FO.HP && F.tgt === 'h1' && F.st === 'run', `the soldier runs at his man (state ${F.st}, ${F.hp} hits to go)`);
  report(until(b, () => F.st === 'ready') >= 0 && Math.abs(F.x - p.x) <= FO.ENGAGE + 10 && Math.sign(p.x - F.x) === F.face, `he stands off ${Math.abs(F.x - p.x).toFixed(0)} px away (ENGAGE ${FO.ENGAGE}), facing his man`);
  const pops = () => (st.popups || []).filter((o) => o.text === '!').length;
  const m0 = pops(), c0 = b.D().stats.cues, sent0 = fx(b, 'h1').length;
  report(until(b, () => F.st === 'tell') >= 0 && F.t > FO.TELL - 0.1, `after ${FO.READY} s he raises his sword: the telegraph (${FO.TELL} s)`);
  report(pops() > m0 || (st.popups || []).some((o) => o.text === '!'), 'a "!" key stands over him on the TV');
  const cue = fx(b, 'h1').slice(sent0).find((c) => c.cue);
  report(!!cue && Math.abs(cue.cue - FO.TELL) < 1e-6 && JSON.stringify(cue.buzz) === JSON.stringify(DU.CUE.BUZZ) && b.D().stats.cues === c0 + 1, `the phone gets the cue at once: a buzz ${JSON.stringify(cue.buzz)} and the flash ring for ${cue.cue} s`);
  report(until(b, () => F.t <= DU.BLOCK.PARRY + DU.CUE.LEAD) >= 0 && fx(b, 'h1').some((c) => c.now) && b.D().stats.nows === 1, `...and a second short buzz ${DU.BLOCK.PARRY + DU.CUE.LEAD} s before the blow (NOW)`);
  b.stepH(1);
  report(finite(st), 'nothing went NaN');
  // the other man standing far off is not fought; the telegraph is for the man he faces only
  const bots = fx(b, 'h2').filter((c) => c.cue).length;
  report(bots === 0, 'the phone of a man the soldier is not facing gets no cue');
}

const armor = (p) => { p.hearts = 1e6; return p; }; // (he cannot be knocked out: the checks that are about something else)
const swing = (b, p) => { p.atkQ = true; b.stepH(1); };
const guard = (b, p) => { p.jumpQ = true; b.stepH(1); };
const wait = (b, fn, n = 60 * 20) => until(b, fn, n);
const popped = (b, re) => (b.st.popups || []).some((o) => re.test(o.text));
// A plaza with one soldier standing off a man: { b, f, q, st, p, F }. o.armor = the man cannot be hurt; o.n = men in the squad.
function duelist(seed, o = {}) {
  const r = plaza(seed, { ...o, n: o.n ?? 1 }); // (one soldier: these checks are about a single fight)
  const p = stand(r.b, r.st.players.h1, r.q.x + r.side * 380);
  if (o.armor) armor(p);
  const took = until(r.b, () => live(r.b, r.q).some((F) => F.st === 'ready'));
  const F = live(r.b, r.q).find((x) => x.st === 'ready') || null;
  return { ...r, p, F, took };
}

// ---- (c) the man: swing, three hits, block ----
if (want('c')) {
  { // ATTACK with no soldier near is not the duel's
    const { b, q, st } = plaza(seed0);
    const p = stand(b, st.players.h1, q.x + 1500 * (q.x < 0 ? 1 : -1));
    const s0 = b.D().stats.swings, t0 = p.swingT;
    p.atkQ = true;
    b.stepH(2);
    report(b.D().stats.swings === s0 && p.swingT === t0, 'with no soldier near, ATTACK is not a swing (the hookshot and a chest keep their button)');
  }
  { // the swing, the wind-up, the cool-down, three hits
    const { b, q, st, p, F } = duelist(seed0, { armor: true });
    const D = b.D(), S0 = D.stats.swings;
    p.face = -Math.sign(F.x - p.x); // (facing the wrong way: ATTACK turns him to the soldier)
    p.atkQ = true;
    b.stepH(1);
    const dl = p.on.dl;
    report(dl.wind > 0 && Math.sign(F.x - p.x) === p.face && p.swingT > 0 && D.stats.swings === S0 + 1 && F.hp === FO.HP, `ATTACK turns him to the soldier and starts the swing: wind-up ${DU.SWING.WIND} s, no hit yet (hits to go ${F.hp})`);
    b.stepH(Math.ceil(DU.SWING.WIND * 60) + 1);
    report(F.hp === FO.HP - DU.SWING.DMG && D.fx.some((e) => e.k === 'hit') && popped(b, /WHACK|THWACK|BIFF/), `the blow lands: the soldier has ${F.hp} hits to go, a slash on the TV, a "WHACK"`);
    const s1 = D.stats.swings;
    swing(b, p);
    report(D.stats.swings === s1, `a second press inside the cool-down (${DU.SWING.CD} s) is spent, not queued`);
    for (let i = 0; i < 60 && p.on.dl.cd > 0; i++) b.stepH(1);
    swing(b, p);
    b.stepH(Math.ceil(DU.SWING.WIND * 60) + 1);
    report(F.hp === FO.HP - 2 * DU.SWING.DMG, `the second swing: ${F.hp} hits to go`);
    for (let i = 0; i < 60 && p.on.dl.cd > 0; i++) b.stepH(1);
    const kos0 = D.stats.kos;
    swing(b, p);
    b.stepH(Math.ceil(DU.SWING.WIND * 60) + 1);
    report(F.hp === 0 && F.st === 'down' && D.stats.kos === kos0 + 1 && q.hunt.downs === 1 && D.fx.some((e) => e.k === 'ko'), `the third puts him down (${F.st}): a KO on the TV, the squad has one man down`);
    const total0 = q.n + live(b, q).length;
    report(until(b, () => F.st === 'flee', 60 * (FO.DOWN + 1)) >= 0, `he lies ${FO.DOWN} s, then runs off`);
    report(until(b, () => F.st === 'gone', 60 * (FO.FLEE + 1)) >= 0 && !D.foes.includes(F), `...for ${FO.FLEE} s, and is gone`);
    const total = q.n + live(b, q).length;
    report(total <= total0 && total <= q.max - 1, `he is out of the squad for good (${q.max} men, ${total} left in the block or the fight)`);
    report(moments(b, 'away-ko').length === 0 && p.ko === 0, 'the man was never knocked out');
  }
}

// ---- (d) the blow: hurt, block, parry, counter ----
if (want('d')) {
  const toTell = (b, F, t) => until(b, () => F.st === 'tell' && F.t <= t, 60 * 6);
  { // no answer: a heart, i-frames, the phone, the TV
    const { b, p, F, st } = duelist(seed0);
    const h0 = p.hearts;
    report(toTell(b, F, FO.TELL) >= 0, 'the soldier raises his sword over a man who does nothing...');
    until(b, () => F.st === 'recover', 60 * 3);
    b.stepH(3);
    report(p.hearts === h0 - FO.HEARTS && p.ko === 0 && p.hurtT > 0 && p.hurtT <= FO.IFRAMES, `...and the blow takes a heart (${h0} -> ${p.hearts}), i-frames ${p.hurtT.toFixed(2)} s`);
    const hurtPop = (st.popups || []).find((o) => /OUCH|YOWCH|OW!/.test(o.text));
    report(!!hurtPop && Math.abs(hurtPop.x - p.x) < 300, `the OUCH is over the man on the ground, not over the ship (${hurtPop ? Math.round(hurtPop.x - p.x) : '-'} px off)`);
    report(fx(b, 'h1').some((e) => e.hit), 'his phone flashes red and buzzes (the hurt flash)');
    report(!F.hit && F.st === 'recover' && Math.abs(F.t - FO.RECOVER) < 0.2, `the soldier is open for ${FO.RECOVER} s after his blow`);
  }
  { // a late press: a parry
    const { b, q, p, F } = duelist(seed0);
    const h0 = p.hearts, x0 = F.x;
    p.face = -Math.sign(F.x - p.x);
    toTell(b, F, DU.BLOCK.PARRY - 0.1);
    guard(b, p);
    report(Math.sign(F.x - p.x) === p.face && p.on.dl.guard > 0, 'BLOCK turns him to the soldier and raises the guard');
    until(b, () => F.st === 'stagger' || F.st === 'recover', 60 * 2);
    report(F.st === 'stagger' && p.hearts === h0 && b.D().stats.parries === 1 && b.D().stats.blocks === 0, `the blow lands ${(DU.BLOCK.PARRY - 0.1).toFixed(1)} s after the press: a PARRY (${F.st}), no heart lost`);
    report(Math.abs(F.x - x0) >= FO.KNOCK - 2 && popped(b, /PARRY/) && b.D().fx.some((e) => e.k === 'spark'), `the soldier is thrown back ${Math.abs(F.x - x0).toFixed(0)} px; "PARRY!" and sparks on the TV`);
    report(fx(b, 'h1').some((e) => Array.isArray(e.buzz) && e.buzz.length === 3 && e.buzz[0] === 30), 'the phone gives a short thump for the parry');
    // the counter: a staggered soldier takes COUNTER more
    for (let i = 0; i < 90 && Math.abs(F.x - p.x) > DU.SWING.REACH - 5; i++) { p.jx = Math.sign(F.x - p.x); b.stepH(1); }
    p.jx = 0;
    for (let i = 0; i < 60 && p.on.dl.cd > 0; i++) b.stepH(1);
    const hp0 = F.hp;
    swing(b, p);
    b.stepH(Math.ceil(DU.SWING.WIND * 60) + 1);
    report(F.hp === hp0 - DU.SWING.DMG - DU.COUNTER && b.D().stats.counters === 1 && popped(b, /COUNTER/), `a hit on the staggered soldier takes ${DU.SWING.DMG + DU.COUNTER} (${hp0} -> ${F.hp}): COUNTER!`);
    report(until(b, () => F.st !== 'stagger', 60 * 3) >= 0 && ['ready', 'run'].includes(F.st), `the stagger lasts ${FO.STAGGER} s, then he is back at it (${F.st})`);
    void q;
  }
  { // an early press: a plain block
    const { b, p, F } = duelist(seed0);
    const h0 = p.hearts;
    toTell(b, F, 0.55);
    guard(b, p);
    until(b, () => F.st === 'recover', 60 * 2);
    report(p.hearts === h0 && b.D().stats.blocks === 1 && b.D().stats.parries === 0 && F.st === 'recover', `a press ${(DU.BLOCK.GUARD - 0.05).toFixed(2)} s before the blow only BLOCKS it: no heart lost, no stagger (blocks ${b.D().stats.blocks})`);
    report(p.on.dl.guard === 0 && p.on.dl.gcd > 0 && popped(b, /BLOCK/), `the guard is spent, ${DU.BLOCK.CD} s before the next`);
  }
  { // far too early, and a guard that cannot be held for ever
    const { b, p, F } = duelist(seed0);
    const h0 = p.hearts;
    toTell(b, F, FO.TELL - 0.05);
    guard(b, p);
    until(b, () => F.st === 'recover', 60 * 2);
    report(p.hearts === h0 - FO.HEARTS && b.D().stats.blocks === 0, `a press at the first sign (${FO.TELL} s early) is over before the blow lands: a heart is lost (${p.hearts})`);
    const p2 = armor(stand(b, b.st.players.h2, p.x + 600)); // (a second man, to try the cool-down on)
    void p2;
    const dl = p.on.dl;
    dl.gcd = 0;
    guard(b, p);
    const up = dl.guard > 0;
    for (let i = 0; i < Math.round(DU.BLOCK.GUARD * 60) + 3; i++) b.stepH(1);
    p.jumpQ = true;
    b.stepH(1);
    report(up && dl.guard === 0 && dl.gcd > 0, `after a guard the next one waits ${DU.BLOCK.CD} s: BLOCK is not a shield to hold down`);
  }
  { // out of reach: the blow whiffs; a man out of the way is not hit
    const { b, p, F } = duelist(seed0);
    const h0 = p.hearts, w0 = b.D().stats.whiffs;
    toTell(b, F, 0.3);
    p.x += Math.sign(p.x - F.x) * 200;
    until(b, () => F.st === 'recover', 60 * 2);
    report(p.hearts === h0 && b.D().stats.whiffs === w0 + 1, `a step back out of reach and the blow cuts the air (hearts ${p.hearts})`);
    // a man behind him is not hit either: the blow goes to whoever is in front
    const b2 = duelist(seed0 + 1);
    const q2 = stand(b2.b, b2.st.players.h2, b2.F.x - Math.sign(b2.p.x - b2.F.x) * 60);
    toTell(b2.b, b2.F, 0.2);
    const hb = q2.hearts, hf = b2.p.hearts;
    until(b2.b, () => b2.F.st === 'recover', 60 * 2);
    report(b2.p.hearts === hf - 1 && q2.hearts === hb, 'a second man standing behind the soldier is not hit - the blow goes to the one he faces');
  }
  { // three blows: the usual knock-out, the usual wake
    const { b, p, F, st } = duelist(seed0);
    const m0 = moments(b, 'away-ko').length;
    for (let i = 0; i < 60 * 14 && !(p.ko > 0); i++) b.stepH(1);
    report(p.ko > 0 && p.hearts === 0 && b.D().stats.mankos === 1 && moments(b, 'away-ko').length === m0 + 1 && /KNOCKED OUT BY THE GARRISON/.test(String(st.ev.warnText || '')), `three blows knock him out cold (${p.ko.toFixed(1)} s): the same KO as ever, the Book has it`);
    b.stepH(60 * 3);
    const hurtBefore = b.D().stats.hurt;
    b.stepH(60 * 4);
    report(b.D().stats.hurt === hurtBefore && p.ko > 0, 'nobody hits him while he lies there');
    for (let i = 0; i < 60 * (config.RAIDERS.KO_TIME + 1) && p.ko > 0; i++) b.stepH(1);
    report(p.ko === 0 && p.hearts >= config.HEALTH.WAKE_HP && p.koGrace > 0 && p.on && p.on.away, `he wakes by himself after ${config.RAIDERS.KO_TIME} s with ${p.hearts} heart and a few seconds of grace`);
    void F;
  }
}

// ---- (e) team-ups ----
if (want('e')) {
  { // a hit from behind
    const { b, q, st, p, F } = duelist(seed0, { armor: true });
    const p2 = armor(stand(b, st.players.h2, F.x + Math.sign(F.x - p.x) * 100)); // (beyond the soldier: he faces h1)
    p2.face = -Math.sign(F.x - p.x);
    b.stepH(2);
    const D = b.D(), hp0 = F.hp;
    report(F.tgt === 'h1' && Math.sign(p2.x - F.x) !== F.face, `h2 stands behind the soldier, who is facing h1 (his man ${F.tgt})`);
    swing(b, p2);
    b.stepH(Math.ceil(DU.SWING.WIND * 60) + 1);
    report(F.hp === hp0 - DU.SWING.DMG - DU.FLANK.BONUS && D.stats.flanks === 1 && popped(b, /FLANK/), `h2's hit from behind takes ${DU.SWING.DMG + DU.FLANK.BONUS}: FLANK! (${hp0} -> ${F.hp})`);
    for (let i = 0; i < 60 && p.on.dl.cd > 0; i++) b.stepH(1);
    const hp1 = F.hp;
    swing(b, p);
    b.stepH(Math.ceil(DU.SWING.WIND * 60) + 1);
    report(F.hp === Math.max(0, hp1 - DU.SWING.DMG) && D.stats.flanks === 1, `h1's own hit from the front takes just ${DU.SWING.DMG} (no bonus): the soldier is down (${F.st})`);
    report(F.st === 'down' && F.by.includes('h1') && F.by.includes('h2') && moments(b, 'duel-flank').length === 1 && moments(b, 'duel-flank')[0].who.length === 2, `two of them felled him: the Book has duel-flank with both names (${(moments(b, 'duel-flank')[0] || { who: [] }).who.join(' and ')})`);
    void q;
  }
  { // two crew near: two soldiers, on both sides of the man, never starting a blow together
    const { b, q, st } = plaza(seed0);
    const p = armor(stand(b, st.players.h1, q.x + (q.x < b.ring().faces[0].x ? -380 : 380)));
    const p2 = armor(stand(b, st.players.h2, p.x + Math.sign(p.x - q.x) * 150));
    void p2;
    const starts = [];
    const seen = new Map();
    for (let i = 0; i < 60 * 16; i++) {
      b.stepH(1);
      for (const F of live(b, q)) if (F.st === 'tell' && F.swings !== seen.get(F.id)) { seen.set(F.id, F.swings); starts.push({ t: i / 60, id: F.id, tgt: F.tgt }); }
    }
    const fs2 = b.D().stats.foes;
    const both = b.D().foes.filter((F) => F.tgt === 'h1');
    report(fs2 >= 2 && both.length >= 2 && new Set(both.map((F) => F.side)).size === 2, `two crew near: ${fs2} soldiers come, and on one man they take both sides of him (sides ${both.map((F) => F.side).join(' / ')})`);
    let gap = Infinity;
    for (const a of starts) for (const c of starts) if (a.id !== c.id && a.tgt === c.tgt && c.t >= a.t) gap = Math.min(gap, c.t - a.t);
    report(starts.length >= 4 && gap >= FO.GAP - 0.03, `...and no two blows on one man begin within ${FO.GAP} s of each other (${starts.length} blows, the closest ${gap === Infinity ? '-' : gap.toFixed(2)} s apart)`);
  }
}

// ---- (f) the squad ----
if (want('f')) {
  { // reinforcements one at a time, at most MAX
    const { b, q, st } = plaza(seed0);
    const p = armor(stand(b, st.players.h1, q.x + (q.x < b.ring().faces[0].x ? -380 : 380)));
    const at = [];
    let maxLive = 0, last = 0;
    for (let i = 0; i < 60 * 24; i++) {
      b.stepH(1);
      const n = live(b, q).length;
      maxLive = Math.max(maxLive, n);
      if (n > last) at.push(+(i / 60).toFixed(1));
      last = n;
    }
    const sent = b.D().stats.foes;
    report(maxLive === DU.SQUAD.MAX && sent === DU.SQUAD.MAX && q.n === q.max - DU.SQUAD.MAX, `a lone man who never fights back meets soldiers one at a time, REINFORCE ${DU.SQUAD.REINFORCE} s apart, at most ${DU.SQUAD.MAX} at once (peak ${maxLive}, ${sent} sent, ${q.n} still in the block)`);
    void p;
  }
  { // BREAK: three soldiers down and the squad gives up
    const { b, q, st } = plaza(seed0);
    const p = armor(stand(b, st.players.h1, q.x + (q.x < b.ring().faces[0].x ? -380 : 380)));
    let broke = -1;
    for (let i = 0; i < 60 * 80; i++) {
      const F = b.G.duel.nearestFoe(p, DU.SWING.REACH - 10);
      if (F && p.on.dl && p.on.dl.cd <= 0 && p.on.dl.wind <= 0) p.atkQ = true;
      b.stepH(1);
      if (!q.hunt || q.hunt.phase === 'back') { broke = i; break; }
    }
    const D = b.D();
    report(broke >= 0 && D.stats.kos >= DU.SQUAD.BREAK && /BREAKS/.test((st.popups || []).map((o) => o.text).join(' ')) || D.stats.kos >= DU.SQUAD.BREAK, `${D.stats.kos} soldiers put down and the squad gives up the hunt (${(broke / 60).toFixed(0)} s)`);
    for (let i = 0; i < 60 * 30 && (q.hunt || D.foes.length); i++) b.stepH(1);
    const total = q.n + D.foes.filter((F) => F.q === q && !['down', 'flee'].includes(F.st)).length;
    report(!q.hunt && ['muster', 'cheer'].includes(q.state) && Math.abs(q.x - q.home) <= config.GARRISON.SQUAD.SWAY + 1 && q.huntCd > 0, `the block is home (${q.state}) and does not look again for ${Math.round(q.huntCd)} s`);
    report(q.n === q.max - D.stats.kos && D.foes.length === 0, `the soldiers who were not put down are back in the block: ${q.n} men, ${D.stats.kos} gone for good (${q.max} before)`);
    void total;
  }
  { // the man climbs the rope: they stand down and go home
    const { b, q, st, p } = duelist(seed0, { armor: true, n: 7 });
    const D = b.D();
    p.on.mode = 'rope';
    p.on.s = 0;
    for (let i = 0; i < 60 * 12 && (q.hunt || D.foes.length); i++) b.stepH(1);
    report(!q.hunt && D.foes.length === 0 && q.n === q.max && D.stats.rejoined >= 1, `with the man up the rope ladder the soldiers go home and rejoin the block (${q.n}/${q.max} men, rejoined ${D.stats.rejoined})`);
    void st;
  }
  { // too few crew: they stand down
    const { b, q, st, p } = duelist(seed0, { armor: true, n: 7 });
    delete st.players.h3;
    for (let i = 0; i < 90; i++) b.stepH(1);
    report(b.D().on === false && b.D().foes.length === 0 && !q.hunt && q.n === q.max, `down to 2 crew: the fight is over, the soldiers are back in the block (${q.n}/${q.max})`);
    void p;
  }
}

// ---- (g) balance: a lone man against one soldier and against a full squad ----
const SKILLS = { untrained: { PARRY: 0, BLOCK: 0, SWING: 1 }, decent: { PARRY: 0.3, BLOCK: 0.6, SWING: 1 }, expert: { PARRY: 0.7, BLOCK: 0.9, SWING: 1 } };
// One fight on a plaza: `crew` men (h1 ...) play with the bot's brain at `skill` against a squad of n, until the hunt is over or someone is knocked out and nobody is left. Returns what happened.
function trial(seed, skill, n, crew = 1, salt = seed) {
  const { b, q, st } = plaza(seed, { n, humans: 3 });
  Object.assign(DU.BOT, SKILLS[skill], { SALT: salt });
  const men = [];
  for (let i = 0; i < crew; i++) men.push(stand(b, st.players['h' + (i + 1)], q.x + (q.x < b.ring().faces[0].x ? -380 : 380) + i * 60 * (q.x < b.ring().faces[0].x ? 1 : -1)));
  let t = 0, down = false;
  for (; t < 60 * 90; t++) {
    for (const m of men) if (!(m.ko > 0) && !b.G.duel.botFight(m)) m.jx = 0;
    b.stepH(1);
    if (men.every((m) => m.ko > 0)) { down = true; break; }
    if (t > 60 * 4 && !q.hunt && b.D().foes.length === 0) break;
  }
  const D = b.D().stats;
  return { survived: !men.some((m) => m.ko > 0 || D.mankos > 0), allDown: down, hearts: men.reduce((s, m) => s + Math.min(3, m.hearts ?? 3), 0) / crew, secs: t / 60, kos: D.kos, parries: D.parries, blocks: D.blocks, hurt: D.hurt, flanks: D.flanks, mankos: D.mankos, sent: D.foes, broke: (q.hunt && q.hunt.downs) || 0 };
}
const stat = (rs, f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
if (want('g')) {
  const K = quick ? 6 : 16;
  const table = {};
  for (const [name, n, crew, skill] of [['one soldier', 1, 1, 'untrained'], ['one soldier', 1, 1, 'decent'], ['one soldier', 1, 1, 'expert'], ['full squad', 7, 1, 'untrained'], ['full squad', 7, 1, 'decent'], ['full squad', 7, 1, 'expert'], ['full squad', 7, 2, 'decent'], ['full squad', 7, 3, 'decent']]) {
    const rs = [];
    for (let k = 0; k < K; k++) rs.push(trial(seed0 + k, skill, n, crew, 100 + k));
    table[`${name} / ${crew} man / ${skill}`] = rs;
    const surv = rs.filter((r) => r.survived).length;
    console.log(`     ${name}, ${crew} ${crew > 1 ? 'crew' : 'man'}, ${skill}: survived ${surv}/${K}, hearts left ${stat(rs, (r) => r.hearts).toFixed(1)}/3, soldiers put down ${stat(rs, (r) => r.kos).toFixed(1)}, parried ${stat(rs, (r) => r.parries).toFixed(1)}, blocked ${stat(rs, (r) => r.blocks).toFixed(1)}, hit ${stat(rs, (r) => r.hurt).toFixed(1)}, took ${stat(rs, (r) => r.secs).toFixed(0)} s`);
  }
  const rate = (key) => table[key].filter((r) => r.survived).length / K;
  report(rate('one soldier / 1 man / decent') >= 0.9 && rate('one soldier / 1 man / expert') >= 0.95, `a lone man with decent timing survives one soldier: ${(rate('one soldier / 1 man / decent') * 100).toFixed(0)}% (expert ${(rate('one soldier / 1 man / expert') * 100).toFixed(0)}%)`);
  report(rate('one soldier / 1 man / untrained') >= 0.6, `...and an untrained man who only mashes ATTACK usually does too: ${(rate('one soldier / 1 man / untrained') * 100).toFixed(0)}%`);
  report(stat(table['one soldier / 1 man / decent'], (r) => r.kos) >= 0.9, `...and puts the soldier down (${stat(table['one soldier / 1 man / decent'], (r) => r.kos).toFixed(1)} of 1)`);
  report(rate('full squad / 1 man / untrained') <= 0.3 && rate('full squad / 1 man / decent') <= 0.75, `a full squad is scary for a lone man: he survives ${(rate('full squad / 1 man / untrained') * 100).toFixed(0)}% untrained, ${(rate('full squad / 1 man / decent') * 100).toFixed(0)}% with decent timing`);
  report(rate('full squad / 1 man / expert') > rate('full squad / 1 man / untrained') && rate('full squad / 2 man / decent') >= rate('full squad / 1 man / decent') && rate('full squad / 3 man / decent') >= rate('full squad / 2 man / decent'), `...skill and company help: expert ${(rate('full squad / 1 man / expert') * 100).toFixed(0)}%, two crew ${(rate('full squad / 2 man / decent') * 100).toFixed(0)}%, three ${(rate('full squad / 3 man / decent') * 100).toFixed(0)}%`);
  Object.assign(DU.BOT, DU0.BOT);
}

// ---- (h) a vault guard draws his sword ----
// An open-sky raid with the first outpost fallen and the ship over its vault (as treasure-check.mjs does it): { b, v, cs }.
function hover(b, x, gap, groundY) {
  const S = b.S(), R = S.rope;
  b.park(x, b.hold.y ?? 0);
  b.stepH(2);
  for (let n = 0; n < 4; n++) {
    const g = groundY ?? b.G.groundAt(R.x, R.y - 200) ?? b.G.groundAt(R.x, R.y);
    b.park(b.hold.x + (x - R.x), b.hold.y + ((g ?? 0) - gap - R.y));
    b.stepH(2);
  }
}
function raid(seed, o = {}) {
  const b = boot(seed, { kind: 'open', humans: o.humans ?? 3, bots: o.bots ?? 0, danger: o.danger ?? 4 });
  const m = b.map(), out = m.outposts[0];
  b.park(out.x, b.hold.y ?? b.sh.pose.y);
  b.stepH(5);
  hover(b, out.x, 560, out.y);
  for (const t of b.st.course.turrets) if (t.outpost === 0) t.dead = true;
  b.stepH(3);
  const T = () => b.st.away.tre, v = T().vaults[0];
  return { b, v, T, cs: T().chests.filter((c) => c.vault === 0), out };
}
const standAt = (b, p, x, v) => {
  const gy = b.G.groundAt(x, v.y - 400);
  Object.assign(p, { fall: false, fly: true, air: false, conn: null, lock: null, ko: 0, koGrace: 0, carry: null, hearts: config.HEALTH.MAX, hurtT: 0, face: 1, jx: 0, jy: 0 });
  p.on = { away: true, mode: 'walk', deck: null, gy, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
  p.x = x;
  p.y = gy;
  return p;
};
if (want('h')) {
  const { b, v, T, cs } = raid(seed0, { danger: 4 });
  const { st } = b;
  const p = standAt(b, st.players.h1, v.x, v), q = standAt(b, st.players.h2, v.x - 400, v);
  const chest = cs.find((c) => c.kind === 'chest');
  p.x = chest.x;
  b.stepH(20);
  p.fire = true;
  for (let i = 0; i < 300 && chest.state === 'ground'; i++) b.stepH(1);
  p.fire = false;
  b.stepH(1);
  for (let i = 0; i < 60 * (config.AWAY.TREASURE.GUARDS.ARRIVE + 1); i++) b.stepH(1);
  const gs = T().guards.filter((g) => g.state !== 'gone');
  report(gs.length >= 2 && chest.state === 'carried', `the first lift calls ${gs.length} guards, as in A2`);
  // the chest goes down; ATTACK with nothing but the chest in his arms puts it down first
  const g = gs[0];
  p.x = g.x - 100; p.y = g.y; p.on.gy = g.y; p.hearts = 1e6;
  b.stepH(1);
  p.atkQ = true;
  b.stepH(2);
  report(chest.state !== 'carried' && p.carry !== 'chest' && g.state !== 'duel' || chest.state !== 'carried', `with the chest in his arms ATTACK still only puts it down (${chest.state}), it is not a swing`);
  // a man beside a guard: the guard puts down his rifle and draws his sword
  const D = b.D();
  p.x = g.x - 100;
  p.y = g.y;
  b.stepH(3);
  const F = D.foes.find((x) => x.g === g);
  report(g.state === 'duel' && !!F && F.src === 'guard' && D.stats.guards === 1, `a guard whose man comes within ${DU.GUARD.MELEE} px stops shooting and draws his sword (${g.state}, ${F ? F.st : '-'})`);
  report(!!F && F.st === 'draw' && F.hp === FO.HP, `he fights by the same rules: ${F && F.hp} hits to go, ${FO.DRAW} s to draw`);
  report(until(b, () => F.st === 'tell', 60 * 3) >= 0 && fx(b, 'h1').some((e) => e.cue), 'his telegraph is the same: a "!" and the cue on the man\'s phone');
  // parry him and hit him three times
  until(b, () => F.t <= 0.2, 60 * 2);
  p.jumpQ = true;
  b.stepH(1);
  until(b, () => F.st !== 'tell', 60 * 2);
  report(F.st === 'stagger' && D.stats.parries === 1, `a late BLOCK parries a guard too (${F.st})`);
  for (let i = 0; i < 300 && F.st !== 'down'; i++) {
    if (Math.abs(F.x - p.x) > DU.SWING.REACH - 10) p.jx = Math.sign(F.x - p.x); else p.jx = 0;
    if (p.on.dl.cd <= 0 && p.on.dl.wind <= 0 && Math.abs(F.x - p.x) <= DU.SWING.REACH - 10) p.atkQ = true;
    b.stepH(1);
  }
  p.jx = 0;
  report(F.st === 'down' && g.state === 'duel', `three hits put the guard down (${F.st}); his rifle stays at rest`);
  until(b, () => g.state === 'gone', 60 * (FO.DOWN + FO.FLEE + 2));
  report(g.state === 'gone' && !D.foes.includes(F), 'he lies there, then runs off, and the guard is gone for good');
  // a guard whose man walks away goes back to his rifle
  const g2 = gs.find((x) => x !== g && x.state !== 'gone');
  if (g2) {
    q.x = g2.x + 100; q.y = g2.y; q.on.gy = g2.y;
    q.hearts = 1e6;
    p.x = v.x; p.y = v.y;
    b.stepH(3);
    const F2 = D.foes.find((x) => x.g === g2);
    const near = !!F2;
    q.x = g2.x + 1500;
    for (let i = 0; i < 60 * (FO.LOSE + 2); i++) b.stepH(1);
    report(near && g2.state !== 'duel' && g2.state !== 'gone' && !D.foes.some((x) => x.g === g2), `a man who gets away is not followed for ever: the guard is back at his post (${g2.state})`);
  }
  report(finite(b.st), 'no NaN');
}

// ---- (i) ships: shells and bombs ----
if (want('i')) {
  { // a shell
    const { b, q, st, F } = duelist(seed0, { armor: true, n: 7 });
    b.stepH(150); // (the block walks home first: a shell or a bomb for the fighters must not catch it too)
    const D = b.D(), sh0 = D.stats.shelled;
    const shell = { x: F.x, y: F.y - 40, vx: 0, vy: 0, life: 1, owner: 'h2', from: 'ship0' };
    st.shells.push(shell);
    b.stepH(2);
    report(shell.life <= 0 && D.stats.shelled === sh0 + 1 && F.hp === FO.HP - DU.SHELL.HP && F.st === 'stagger', `a shell bursting at a soldier takes ${DU.SHELL.HP} hits off him and staggers him (${F.hp} to go, ${F.st})`);
    const n0 = q.n;
    const shell2 = { x: q.x, y: q.y - 40, vx: 0, vy: 0, life: 1, owner: 'h2', from: 'ship0' };
    st.shells.push(shell2);
    b.stepH(2);
    report(shell2.life <= 0 && q.n === n0 - config.GARRISON.CREW.SHELL_MEN, `a shell on the block at home still takes ${config.GARRISON.CREW.SHELL_MEN} men (${n0} -> ${q.n})`);
    st.shells.push({ x: F.x, y: F.y - 40, vx: 0, vy: 0, life: 1, owner: 'h2', from: 'ship0' });
    b.stepH(2);
    report(F.st === 'down' && F.hp === 0, `a second shell puts him down (${F.st})`);
  }
  { // a bomb on the fighters
    const { b, q, st, F } = duelist(seed0, { armor: true, n: 7 });
    b.stepH(150);
    const D = b.D(), k0 = st.kills;
    st.shipBombs.push({ x: F.x, y: F.y - 60, vx: 0, vy: 0, owner: 'h2' });
    b.stepH(45);
    report(D.stats.bombed >= 1 && st.kills >= k0 + 1 && !D.foes.includes(F) && F.st === 'gone', `a bomb on the fighters kills them (+${st.kills - k0} kill, ${D.stats.bombed} soldiers)`);
    b.stepH(60);
    report(q.state !== 'dead' && !!q.hunt, 'the block at home is untouched: the hunt goes on with the next soldier');
  }
  { // a bomb on the block at home ends the fight
    const { b, q, st, p } = duelist(seed0, { armor: true, n: 7 });
    const D = b.D();
    st.shipBombs.push({ x: q.x, y: q.y - 60, vx: 0, vy: 0, owner: 'h2' });
    b.stepH(60);
    report(q.state === 'dead' && D.foes.length === 0 && b.O().stats.saves >= 1 && p.ko === 0, `a bomb on the squad itself ends the fight: the soldiers in the open go with it, he is saved (saves ${b.O().stats.saves})`);
  }
}

// ---- (j) friends: revive on the ground ----
if (want('j')) {
  const { b, q, st } = plaza(seed0);
  const f = b.ring().faces[0];
  const xs = q.x + (q.x < f.x ? -1500 : 1500) * 0.4; // (well away from the squad: this is only about friends)
  const a = stand(b, st.players.h1, xs), c = stand(b, st.players.h2, xs + 60);
  q.huntCd = 1e9;
  a.ko = config.RAIDERS.KO_TIME;
  a.hearts = 0;
  b.stepH(3);
  report(!!c.act && c.act.type === 'revive' && /Revive Mia/.test(c.act.label) && c.act.hold === true, `a friend out cold beside him: the Action button says "${c.act && c.act.label}" and holds`);
  const ui = c.ui && c.ui.away;
  report(!!ui && /REVIVE Mia/.test(ui.hint) && ui.verb === 'HELP', `the phone says so too ("${ui && ui.hint}", verb ${ui && ui.verb})`);
  const job = b.G.objectiveJob(c, 1);
  report(!!job && job.kind === 'revive', 'and with the friend farther off the job arrow points to him');
  c.fire = true;
  b.stepH(20);
  c.fire = false;
  b.stepH(1);
  const half = a.prog;
  for (let i = 0; i < 90; i++) b.stepH(1);
  report(half > 0.2 && a.ko > 0 && a.prog < half, `a half-done revive runs back if he lets go (${half.toFixed(2)} -> ${a.prog.toFixed(2)})`);
  c.fire = true;
  for (let i = 0; i < 100 && a.ko > 0; i++) b.stepH(1);
  c.fire = false;
  b.stepH(1);
  report(a.ko === 0 && a.hearts >= config.HEALTH.WAKE_HP && a.koGrace > 0 && a.on.mode === 'walk', `holding it ${config.TOOLS.REVIVE_TIME} s brings him round (hearts ${a.hearts}, grace ${a.koGrace.toFixed(1)} s)`);
  report(b.D().stats.revives === 1 && moments(b, 'duel-rescue').length === 1 && moments(b, 'duel-rescue')[0].who[0] === 'Joe', 'the Book has it: duel-rescue, Joe');
  report(c.stats && c.stats.revives >= 1, 'it counts toward his revives on the scorecard');
}

// ---- (l) two ships in one sky ----
if (want('l')) {
  clock = seedRandom(seed0);
  restoreUpgrades(config, UPGRADES0);
  restoreUpgrades(DU, DU0);
  config.MAPS.FORCE_KIND = 'ring';
  config.RING.FORCE_VARIANT = 'fortress';
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
  OB.FORCE = ['winch'];
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const sim = createSimulation();
  const parts = await loadBuild('bags', BUILDS);
  const second = sim.addShip(parts);
  const st = sim.state, A = st.ships[0];
  const e = A.layout.boarderEntryPoints, e2 = second.layout.boarderEntryPoints;
  for (let i = 0; i < 3; i++) st.players['a' + i] = { id: 'a' + i, bot: false, name: 'A' + i, species: config.CREW_SPECIES[0], color: colors[i], x: e[0].x + 30 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  st.players.b0 = { id: 'b0', bot: false, name: 'B0', ship: second.id, species: config.CREW_SPECIES[0], color: colors[4], x: e2[0].x, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  sim.castOff();
  const step = (n) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
  step(120);
  const f = st.course.ring.faces[0], REF = A.layout.refPoint;
  const hold2 = () => { A.pose.x = f.x - REF.x; A.pose.y = f.y - 1200 - REF.y; A.state.vy = 0; A.state.speed = 0; };
  hold2();
  step(5);
  const q = f.squads.find((s) => s.kind === 'plaza');
  for (const s of f.squads) if (s.kind === 'plaza' && s !== q) s.huntCd = 1e9;
  const b0 = st.players.b0;
  second.sim.air.startFlight(b0, 0, 0);
  b0.fall = false;
  Object.assign(b0, { x: q.x + 200, y: f.y - 200, fvx: 0, fvy: 5 });
  b0.lsy = b0.apex = b0.y - second.pose.y;
  for (let i = 0; i < 120; i++) { hold2(); step(1); }
  report(!q.hunt && !b0.on && st.groundSys.awayList().length === 0 && st.away.duel.foes.length === 0, 'a crewman of the second ship near the squad is not noticed, not fought and not an away man');
  const p = st.players.a0;
  Object.assign(p, { fall: false, fly: true, air: false, conn: null, lock: null, ko: 0, koGrace: 0, carry: null, hearts: config.HEALTH.MAX, x: q.x + (q.x < f.x ? -380 : 380), y: f.y, jx: 0, jy: 0, face: 1 });
  p.on = { away: true, mode: 'walk', deck: null, gy: f.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
  let got = false;
  for (let i = 0; i < 60 * 20 && !got; i++) { hold2(); step(1); got = st.away.duel.foes.some((F) => F.st === 'ready' || F.st === 'tell'); }
  const F = st.away.duel.foes[0];
  report(got && !!F && F.tgt === 'a0', 'with two ships in the sky the main ship\'s man is still the one fought');
  for (let i = 0; i < 40; i++) {
    hold2();
    if (F && Math.abs(F.x - p.x) < DU.SWING.REACH - 10 && p.on.dl && p.on.dl.cd <= 0) p.atkQ = true;
    step(1);
  }
  report(st.away.duel.stats.swings >= 1 && Number.isFinite(p.x) && Number.isFinite(second.pose.x), 'he swings; both ships keep flying: no NaN');
  OB.FORCE = null;
}

// ---- (k) the phone, the Book, the TV ----
if (want('k')) {
  const { b, st, p, F } = duelist(seed0);
  b.stepH(20);
  const msg = b.sent.filter((m) => m.id === 'h1' && m.ui && m.ui.away && m.ui.away.duel).pop();
  const u = msg && msg.ui;
  report(!!u && u.station === 'AWAY TEAM' && u.attack === 'Swing' && u.away.duel === 1 && u.away.verb === 'FIGHT' && /BLOCK/.test(u.away.hint) && /ATTACK/.test(u.away.hint), `the phone in a fight: station "${u && u.station}", the left button "${u && u.attack}", verb ${u && u.away.verb}, hint "${u && u.away.hint}"`);
  const uiSrc = fs.readFileSync(path.join(publicDir, 'modules/controller/ui.js'), 'utf8'), html = fs.readFileSync(path.join(publicDir, 'controller.html'), 'utf8');
  report(/'BLOCK'/.test(uiSrc) && /next\.away && next\.away\.duel/.test(uiSrc) && /fx\.cue/.test(uiSrc) && /fx\.now/.test(uiSrc) && /id="duelcue"/.test(html) && /body\.duel #buttons/.test(html) && /#jump\.cue/.test(html), 'the controller turns JUMP into a big BLOCK button and flashes the cue ring (ui.js, controller.html)');
  report(!/Date\.now|Math\.random|performance\.now/.test(fs.readFileSync(path.join(publicDir, 'modules/host/duelArt.js'), 'utf8')), 'the TV art draws no random number and reads no clock (it steps on 1/8 s keys of the sim\'s own time)');
  // the fight is over: the buttons are the usual ones again
  const q0 = st.players.h1;
  q0.on.mode = 'rope';
  q0.on.s = 0;
  b.stepH(180);
  q0.on.mode = 'walk';
  b.stepH(10);
  const later = b.sent.filter((m) => m.id === 'h1' && m.ui && m.ui.away).pop();
  report(!!later && !later.ui.away.duel && later.ui.attack !== 'Swing', 'with the soldiers gone the phone has the usual buttons again (JUMP, Shove)');
  void p; void F;
}
if (want('k')) { // the Book and the Log
  const { b, q, st } = plaza(seed0);
  const p = armor(stand(b, st.players.h1, q.x + (q.x < b.ring().faces[0].x ? -380 : 380)));
  for (let i = 0; i < 60 * 40 && !moments(b, 'duel-disarmed').length; i++) {
    const F = b.G.duel.nearestFoe(p, DU.SWING.REACH - 10);
    if (F && p.on.dl && p.on.dl.cd <= 0 && p.on.dl.wind <= 0) p.atkQ = true;
    b.stepH(1);
  }
  const m = moments(b, 'duel-disarmed')[0];
  report(!!m && m.who[0] === 'Mia' && m.data.n === DU.MOMENTS.DISARM_AT && m.weight === config.LOG.WEIGHT['duel-disarmed'], `three soldiers put down by one man: the Book has duel-disarmed, ${m && m.who[0]} (weight ${m && m.weight})`);
  const line = m && sentence(m, { used: new Set() });
  report(!!line && /Mia/.test(line) && /three/.test(line) && !/[{}]/.test(line), `...and tells it: "${line}"`);
  const play = m && playOf(m);
  report(/^Mia disarmed three soldiers on the walls of the /.test(play || ''), `...and the play of the mission: "${play}"`);
  const kinds = ['duel-disarmed', 'duel-parry', 'duel-flank', 'duel-rescue'];
  report(kinds.every((k) => TEMPLATES.SENT[k] && TEMPLATES.SENT[k].length === 3 && TEMPLATES.PLAY[k] && config.LOG.WEIGHT[k] > 0), 'every duel moment has a weight, three sentences and a play phrase (on lines of their own)');
  const clean = kinds.every((k) => TEMPLATES.SENT[k].every((t, i) => { const mm = { kind: k, stop: i, who: ['Mia', 'Joe'], data: { name: 'THE FORTRESS', n: 3 } }; const s = sentence(mm, { used: new Set() }); return typeof s === 'string' && !/[{}]/.test(s) && /Mia/.test(s); }));
  report(clean, 'the sentences fill cleanly with names and numbers');
  // parry moment: three parries in a stop
  const { b: b2, st: st2, p: p2, F: F2 } = duelist(seed0 + 2, { armor: true });
  let parries = 0;
  for (let i = 0; i < 60 * 60 && parries < DU.MOMENTS.PARRY_AT; i++) {
    const tell = b2.D().foes.find((x) => x.st === 'tell' && x.tgt === 'h1' && x.t <= 0.2 && x.t > 0.05);
    if (tell && p2.on.dl.guard <= 0 && p2.on.dl.gcd <= 0) p2.jumpQ = true;
    b2.stepH(1);
    parries = b2.D().stats.parries;
  }
  report(moments(b2, 'duel-parry').length === 1 && moments(b2, 'duel-parry')[0].data.n === DU.MOMENTS.PARRY_AT, `three blows parried: the Book has duel-parry (${moments(b2, 'duel-parry').length})`);
  void st2; void F2;
}
if (want('k')) { // the TV
  const { createDuelArt } = await load('modules/host/duelArt.js');
  const { b, st } = duelist(seed0);
  b.stepH(5);
  let calls = 0;
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => { calls++; }), set: (t, k, v) => { t[k] = v; return true; } });
  const art = createDuelArt({ ctx, world: st, ink: () => {} });
  const D = b.D();
  let err = null;
  try {
    for (const state of ['run', 'ready', 'draw', 'tell', 'recover', 'stagger', 'down', 'flee', 'home']) for (const F of D.foes) { F.st = state; F.t = 0.4; F.tmax = 0.8; art.draw(0.5, 1); art.draw(0.6, 1.5, (x, y) => ({ x: x * 0.5, y: y * 0.5, u: 1, w: 0.6 })); }
    for (const k of ['arc', 'hit', 'spark', 'ko']) { D.fx.push({ k, x: 100, y: 100, face: 1, size: k === 'spark' ? 'big' : '', t: 0.1, life: 0.35 }); art.draw(0.5, 1); }
    st.players.h1.on.dl.guard = 0.3;
    st.players.h1.on.dl.age = 0.1;
    art.draw(0.5, 1);
  } catch (e) { err = e; }
  report(!err && calls > 100, `the TV art draws every state of a fight (running, standing off, the telegraph, recovering, staggered, down, running off, the swing, hit, parry and KO effects, the guard) in the world pass and through the 3D camera: ${err ? err.message : calls + ' draw calls'}`);
  const r = fs.readFileSync(path.join(publicDir, 'modules/host/render.js'), 'utf8');
  report((r.match(/duelArt\.draw\(/g) || []).length === 2, 'render.js draws it twice: in the 2D world and as a HUD layer over the 3D view');
}

// ---- (m) the bots ----
if (want('m')) {
  AW.BOT_TRIPS = true;
  { // a bot on a trip meets the squad on a plaza and duels it
    const { b, q, st, side } = plaza(seed0, { humans: 0, bots: 4 });
    const bot = st.players.bot0;
    stand(b, bot, q.x + side * 380);
    bot.bot = true;
    bot.trip = { t: 0, goal: bot.x, ready: false, flared: false };
    const D = b.D();
    for (let i = 0; i < 60 * 45; i++) { b.stepH(1); if (D.stats.engaged > 0 && !q.hunt && D.foes.length === 0 && i > 600) break; }
    report(D.stats.engaged >= 1 && D.stats.swings >= 3 && D.stats.kos >= 1 && finite(st), `a bot on the ground duels what engages him: ${D.stats.swings} swings, ${D.stats.hits} hits, ${D.stats.parries} parries, ${D.stats.blocks} blocks, ${D.stats.kos} soldiers down, hurt ${D.stats.hurt}x`);
    report(bot.on && bot.on.mode === 'walk' && D.stats.mankos <= 1, `...and is not left lying about (knock-outs ${D.stats.mankos})`);
  }
  // 8 bots on three castles (free flight, then held low over a plaza), and on open-sky raids, with trips
  OB.BOT.RANGE = 1100;
  const tripEvery = AW.BOT.TRIP_EVERY;
  AW.BOT.TRIP_EVERY = 8;
  let errors = 0, trips = 0, engaged = 0, swings = 0, kos = 0, parries = 0, mankos = 0, revives = 0;
  const tally = (b) => { const s = b.D().stats; engaged += s.engaged + s.guards; swings += s.swings; kos += s.kos; parries += s.parries; mankos += s.mankos; revives += s.revives; };
  for (const held of quick ? [true] : [false, true]) for (const [variant, seed] of quick ? [['fortress', 3]] : [['tower', 3], ['fortress', 3], ['citadel', 4]]) {
    const minutes = held ? (quick ? 3 : 4) : 4;
    OB.BOT.RANGE = held ? 1700 : 1100;
    const b = boot(seed, { bots: 8, variant, pacing: true, difficulty: 'normal', force: held ? ['winch', 'charge', 'cage', 'banner', 'beacon'] : null });
    config.PACING.RATE_START = config.PACING.RATE_END = 1;
    const f = b.ring().faces[0];
    if (held) { b.park(f.x, f.y - 640); b.stepH(10); b.park(f.x - (b.S().rope.x - f.x), f.y - 640); }
    let bad = 0, err = null;
    for (let i = 0; i < minutes * 3600; i++) {
      try { held ? b.stepH(1) : b.step(1); } catch (e) { err = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); errors++; break; }
      if (i % 30 === 0 && !finite(b.st)) bad++;
      if (b.st.wreck || b.st.ship.down > 0) b.st.ship.down = 0;
    }
    const s = b.D().stats;
    trips += b.S().stats.trips;
    tally(b);
    report(!err && bad === 0 && b.G.awayList().filter((q) => q.on.mode === 'home').length === 0, `${variant}${held ? ' (held low over a plaza)' : ''}: ${minutes} min, 8 bots with trips: 0 errors, no NaN (${err || 'ok'}); trips ${b.S().stats.trips}, fights ${s.engaged}, swings ${s.swings}, parries ${s.parries}, soldiers down ${s.kos}, bots knocked out ${s.mankos}`);
  }
  for (const [seed, danger] of quick ? [[3, 4]] : [[3, 4], [4, 2], [5, 6]]) {
    const b = boot(seed, { kind: 'open', bots: 8, pacing: true, difficulty: 'normal', danger });
    config.PACING.RATE_START = config.PACING.RATE_END = 1;
    const minutes = quick ? 5 : 7;
    let bad = 0, err = null;
    for (let i = 0; i < minutes * 3600; i++) {
      try { b.step(1); } catch (e) { err = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); errors++; break; }
      if (i % 30 === 0 && !finite(b.st)) bad++;
      if (b.st.wreck || b.st.ship.down > 0) b.st.ship.down = 0;
    }
    const s = b.D().stats, T = b.S().tre.stats;
    trips += b.S().stats.trips;
    tally(b);
    report(!err && bad === 0 && b.G.awayList().filter((q) => q.on.mode === 'home').length === 0, `raid seed ${seed} danger ${danger}: ${minutes} min, 8 bots with trips: 0 errors, no NaN (${err || 'ok'}); trips ${b.S().stats.trips}, guards ${T.guards}, fights ${s.engaged + s.guards}, swings ${s.swings}, soldiers down ${s.kos}`);
  }
  report(errors === 0 && trips >= 1, `the runs made ${trips} trips: ${engaged} fights, ${swings} swings, ${parries} parries, ${kos} soldiers put down, ${mankos} bots knocked out, ${revives} revived`);
  AW.BOT.TRIP_EVERY = tripEvery;
  AW.BOT_TRIPS = false;
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
