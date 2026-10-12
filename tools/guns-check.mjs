// GUNS THAT MATTER gate (FUN.md F4; gunsMatter.js, links.js, jobs.js, squadrons.js, squads.js, simulation.js pacing, threats.js, config.PACING / JOBS / CREW_SEATS / MINES / SQUADRONS). Headless, seeded.
//   node tools/buildsim.mjs --check-guns        or directly:   node tools/guns-check.mjs [--seed 1]
//
//   1  the numbers
//   2  the director aims: guns manned on the fore side only -> state.links.aim.side +1 (aft only -> -1); a swarm, a bomber, a squadron and imps come in on that side (AIM_CHANCE 1)
//   3  the tempo: from stop 3 the calm is 24 s and a trickle starts at 0.6 (stop 2: 34 s / 0.45); two set pieces at once from stop 5 (never the gunship, never on stops before)
//   4  no mines before stop 3
//   5  the seated gunner: no target for SEATED_IDLE s -> the job arrow on the phone while still seated (ui.seated); a target comes -> the arrow goes
//   6  CREW_SEATS: under 8 crew the Aft Dorsal Gun and the Deflector are mothballed (nobody takes them, no repair arrow, no bot); 8 or more, they are not; 14 crew still get job arrows
//   7  the lone fighter is a squadron of one (state.enemy never flies), comes again RESPAWN s after it is gone, and not on top of another squadron
//   8  the bots man no gun with nothing to shoot (BOTS.FILL_GUNS 0) and none in a calm
//   9  the switch: NO_GUNS=1 gives the old game
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyBuild } = await load('shipLayout.js');
const PC = config.PACING;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
const secs = (s) => Math.round(s * 60);
const SAVE = JSON.stringify({ PC: { RATE_START: PC.RATE_START, RATE_END: PC.RATE_END, PEAK_RATE: PC.PEAK_RATE, BUILD: PC.BUILD, GUNSHIP_FIRST: PC.GUNSHIP_FIRST }, SP: config.SPECIALS.FIRST_AFTER });

// humans: seated/free human crew (bot: false); bots: bot crew. rate: the pacing director's trickle (0 = nothing spawns by itself).
function boot({ humans = 0, bots = 0, rate = 0, col = 0, s = seed } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.PACING.FORCE_COLUMN = col;
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = rate;
  config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(s);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < humans + bots; i++) {
    const id = 'p' + i, bot = i >= humans;
    st.players[id] = { id, bot, name: 'Crew' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry: null };
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
// Sit a human at a station, as the game does (locked, on the station's deck and spot).
function seat(t, p, name) {
  const s = t.ours.layout.stations.find((q) => q.n === name) || t.ours.layout.gunMounts[name];
  const pl = t.ours.layout.platforms[s.d];
  Object.assign(p, { fall: false, lock: name, d: s.d, x: s.x, y: pl.y, conn: null, ko: 0 });
}
const free = (t, p, d, x) => { const pl = t.ours.layout.platforms[d]; Object.assign(p, { fall: false, lock: null, d, x, y: pl.y, conn: null, ko: 0 }); };
const humansOf = (t) => Object.values(t.st.players).filter((p) => !p.bot);
const midX = (t) => t.st.ships[0].pose.x + t.ours.layout.refPoint.x;

// ---------------------------------------------------------------- 1. the numbers
report(PC.AIM_AT_GUNS === true && PC.HARD.RATE_START === 0.6 && PC.HARD.CALM === 34 && PC.HARD.PEAK_MAX === 40 && PC.HARD.FROM_COLUMN === 3 && PC.MULTI.FROM_COLUMN === 5 && config.MINES.FIRST_COLUMN === 3 && config.JOBS.SEATED_IDLE === 6 && config.CREW_SEATS.UNDER === 8 && config.CREW_SEATS.MOTHBALL.length === 2 && config.SQUADRONS.FOLD_LONE === true && config.ESCORT.CRASH_ON_SHIPS !== false,
  `the numbers: tempo ${PC.HARD.RATE_START}/${PC.HARD.CALM}/${PC.HARD.PEAK_MAX} from stop ${PC.HARD.FROM_COLUMN}, two set pieces from stop ${PC.MULTI.FROM_COLUMN}, mines from stop ${config.MINES.FIRST_COLUMN}, seated idle ${config.JOBS.SEATED_IDLE} s, mothball under ${config.CREW_SEATS.UNDER}, the lone fighter folded, ESCORT.CRASH_ON_SHIPS untouched (${config.ESCORT.CRASH_ON_SHIPS})`);

// ---------------------------------------------------------------- 2. the director aims at the manned guns
{
  config.PACING.AIM_CHANCE = 1;
  const side = (names) => {
    const t = boot({ humans: 8 });
    step(t.sim, secs(2));
    humansOf(t).forEach((p, i) => (i < names.length ? seat(t, p, names[i]) : free(t, p, t.ours.layout.deckIndex('main'), 700)));
    step(t.sim, secs(2));
    return t;
  };
  const fore = side(['Nose Gun', 'Fore Sponson']);
  report(fore.st.links.aim.side === 1, `only the fore guns manned: aim ${fore.st.links.aim.side} (fore ${fore.st.links.aim.fore.toFixed(1)}, aft ${fore.st.links.aim.aft.toFixed(1)})`);
  report(fore.st.links.idle['Nose Gun'] > 1, `...and the Nose Gun's idle clock runs: ${fore.st.links.idle['Nose Gun'].toFixed(1)} s`);
  const aft = side(['Tail Gun', 'Aft Sponson']);
  report(aft.st.links.aim.side === -1, `only the aft guns manned: aim ${aft.st.links.aim.side}`);
  const mid = (t) => midX(t);
  // a swarm / a bomber / a squadron / imps on the manned side (several spawns each: AIM_CHANCE is 1)
  const sideCount = {};
  for (const [t, want, tag] of [[fore, 1, 'fore'], [aft, -1, 'aft']]) {
    t.st.bats.length = 0;
    for (let i = 0; i < 3; i++) t.sim.squadrons.spawnBats(null, 3);
    report(t.st.bats.every((b) => (b.x - mid(t)) * want > 0), `a swarm comes in from the ${tag} side (${t.st.bats.length} bats)`);
    t.st.bombers.length = 0;
    for (let i = 0; i < 4; i++) t.sim.squadrons.spawnBomber();
    report(t.st.bombers.every((b) => (b.x - mid(t)) * want > 0), `bombers come in from the ${tag} side (${t.st.bombers.length})`);
    t.st.strafers.length = 0;
    t.st.squadrons.length = 0;
    for (let i = 0; i < 4; i++) t.sim.squadrons.spawnStrafers();
    const home = t.st.squadrons.filter((q) => (q.leader.x - mid(t)) * want > 0).length; // (a squadron takes the other side when rock fills this one - squads.js looks for clear air - which the aft side of this start often does: only the fore side is held to all four)
    sideCount[tag] = home;
    report(t.st.strafers.length > 0 && (want > 0 ? home === t.st.squadrons.length : true), `squadrons come in from the ${tag} side (${home} of ${t.st.squadrons.length})`);
    t.st.specials.imps.length = 0;
    for (let i = 0; i < 3; i++) t.sim.specials.spawn.imps();
    const sd = t.st.specials.imps.filter((b) => (b.x - mid(t)) * want > 0).length;
    report(sd >= t.st.specials.imps.length * 0.6, `imps come in mostly from the ${tag} side (${sd} of ${t.st.specials.imps.length})`);
  }
  config.PACING.AIM_CHANCE = 0.85;
}

// ---------------------------------------------------------------- 3. the tempo and two set pieces
{
  // a peak that is over: the next step calls the calm, whose length is the stop's
  const calmLen = (col) => {
    const t = boot({ bots: 8, col });
    step(t.sim, secs(2));
    Object.assign(t.st.tempo, { phase: 'peak', kind: 'swarm', spawned: true, el: PC.PEAK_MIN + 1, t: 10, big: 1 });
    t.st.bats.length = 0;
    step(t.sim, 2);
    return t.st.tempo.phase === 'calm' ? t.st.tempo.t : null;
  };
  const c2 = calmLen(2), c3 = calmLen(3);
  report(c2 !== null && c3 !== null && Math.abs(c2 - PC.PEAK_MAX) < 1 && Math.abs(c3 - PC.HARD.CALM) < 1, `the calm after a set piece (stop 2 keeps what it always lasted: the peak's length): ${c2 && c2.toFixed(1)} s on stop 2, ${c3 && c3.toFixed(1)} s on stop 3`);
  const rateAt = (col) => {
    const t = boot({ bots: 8, col, rate: 0 });
    config.PACING.RATE_START = 0.45; config.PACING.RATE_END = 0.45;
    step(t.sim, secs(2));
    Object.assign(t.st.tempo, { phase: 'build', t: 100, el: 0 });
    step(t.sim, 2);
    const r = t.st.tempo.rate;
    return r;
  };
  const r2 = rateAt(2), r3 = rateAt(3);
  report(Math.abs(r2 - 0.45) < 0.01 && r3 > r2 + 0.05, `a build-up's trickle starts at ${r2.toFixed(2)} on stop 2 and ${r3.toFixed(2)} on stop 3`);
  // two set pieces at once
  const second = (col, kind) => {
    const t = boot({ bots: 8, col });
    step(t.sim, secs(2));
    Object.assign(t.st.tempo, { phase: 'peak', kind, spawned: false, el: 0, t: 40, tries: 0, second: undefined });
    step(t.sim, secs(PC.MULTI.DELAY + 3));
    return { second: t.st.tempo.second, kind: t.st.tempo.kind };
  };
  const s4 = second(4, 'strafers'), s5 = second(5, 'strafers'), g5 = second(5, 'gunship');
  report(s4.second === undefined, 'stop 4: one set piece at a time');
  report(!!s5.second && s5.second !== 'strafers' && s5.second !== 'gunship', `stop 5: a second set piece follows the first (${s5.kind} + ${s5.second})`);
  report(!g5.second, 'the gunship never has company');
}

// ---------------------------------------------------------------- 4. mines
{
  config.MINES.FIRST_AFTER = 0.5;
  const minesBy = (col) => {
    const t = boot({ bots: 6, rate: 1, col });
    let n = 0;
    step(t.sim, secs(50), () => { n = Math.max(n, t.st.mines.length); });
    return n;
  };
  const m1 = minesBy(2), m3 = minesBy(3);
  report(m1 === 0 && m3 >= 1, `mines in 50 s of flight: ${m1} on stop 2, ${m3} on stop 3`);
  config.MINES.FIRST_AFTER = 30;
}

// ---------------------------------------------------------------- 5. the seated gunner's arrow
{
  const t = boot({ humans: 8 });
  step(t.sim, secs(2));
  const hs = humansOf(t);
  hs.forEach((p, i) => (i === 0 ? seat(t, p, 'Nose Gun') : free(t, p, t.ours.layout.deckIndex('main'), 700 + 40 * i)));
  const gunner = hs[0];
  const ui = () => t.ours.sim.jobFinder.ui(gunner);
  const mainD = t.ours.layout.deckIndex('main');
  t.st.fires.length = 0;
  t.sim.fire.ignite(mainD, 800, 'hit'); // a job to point at
  step(t.sim, secs(config.JOBS.SEATED_IDLE - 2));
  report(!ui(), `seated ${config.JOBS.SEATED_IDLE - 2} s with nothing to shoot: no arrow yet (idle ${(gunner.gunIdle || 0).toFixed(1)} s)`);
  step(t.sim, secs(5));
  const j = ui();
  report(gunner.lock === 'Nose Gun' && !!j && j.seated === true && !!j.dir, `after ${config.JOBS.SEATED_IDLE} s with no target, the arrow shows while he is still seated: ${j && j.label} (${j && j.dir})`);
  // a target arrives in the Nose Gun's arc and range
  const gun = t.st.GUNS['Nose Gun'];
  const pose = t.ours.pose;
  const gx = pose.x + gun.bx, gy = pose.y + gun.by;
  t.st.bats.push({ x: gx + 500, y: gy - 250, vx: pose.vx, vy: 0, tx: 800, ty: 400, hp: 1, phase: 0, delay: 0 });
  step(t.sim, 20);
  report(!ui() && (gunner.gunIdle || 0) === 0, `a bat in the Nose Gun's arc: his clock is back to ${(gunner.gunIdle || 0).toFixed(1)} and the arrow is gone`);
  // off: SEATED_IDLE 0
  config.JOBS.SEATED_IDLE = 0;
  const t2 = boot({ humans: 4 });
  step(t2.sim, secs(2));
  const g2 = humansOf(t2)[0];
  seat(t2, g2, 'Nose Gun');
  t2.sim.fire.ignite(t2.ours.layout.deckIndex('main'), 800, 'hit');
  step(t2.sim, secs(14));
  report(!t2.ours.sim.jobFinder.ui(g2), 'JOBS.SEATED_IDLE 0: a seated gunner never gets the arrow');
  config.JOBS.SEATED_IDLE = 6;
}

// ---------------------------------------------------------------- 6. mothballed seats
{
  const moth = (n) => { const t = boot({ humans: n }); step(t.sim, secs(2)); return { t, m: Object.keys(t.st.links.moth) }; };
  const a = moth(5), b = moth(8), c = moth(14);
  report(a.m.includes('Aft Dorsal Gun') && a.m.includes('Deflector') && a.m.length === 2, `5 crew: mothballed ${a.m.join(', ')}`);
  report(b.m.length === 0 && c.m.length === 0, `8 and 14 crew: nothing mothballed`);
  // nobody sits there, bots included (the Deflector and the Aft Dorsal Gun are free of the stations the bots rotate through)
  const t = boot({ bots: 6 });
  let sat = 0;
  step(t.sim, secs(90), () => { for (const p of Object.values(t.st.players)) if (p.lock === 'Aft Dorsal Gun' || p.lock === 'Deflector') sat++; });
  report(sat === 0, `6 bots, 90 s: nobody took a mothballed seat (${sat} seat-frames)`);
  // a human cannot take it either; a broken one draws no repair arrow
  const h = boot({ humans: 4 });
  step(h.sim, secs(2));
  const p = humansOf(h)[0];
  const stn = h.ours.layout.stations.find((q) => q.n === 'Aft Dorsal Gun') || h.ours.layout.gunMounts['Aft Dorsal Gun'];
  free(h, p, stn.d, stn.x);
  const mod = h.st.modules.find((m) => m.name === 'Aft Dorsal Gun');
  if (mod) { mod.broken = true; mod.hp = 0; }
  step(h.sim, secs(3));
  report(!p.lock && !(p.job && /Aft Dorsal/.test(p.job.label)), `a human beside the covered gun does not take it, and a broken one draws no arrow (job: ${p.job ? p.job.label : 'none'})`);
  // 14 crew: the arrows still point at repairs, hauls and fires
  const big = boot({ humans: 14 });
  step(big.sim, secs(2));
  const hs = humansOf(big);
  hs.forEach((q, i) => free(big, q, big.ours.layout.deckIndex('main'), 500 + 60 * i));
  big.sim.fire.ignite(big.ours.layout.deckIndex('main'), 1000, 'hit');
  const bm = big.st.modules.find((m) => m.name === 'Aft Dorsal Gun');
  if (bm) { bm.broken = true; bm.hp = 0; }
  step(big.sim, secs(3));
  const arrows = hs.filter((q) => q.job).length;
  report(arrows >= 10 && hs.some((q) => q.job && /Aft Dorsal Gun/.test(q.job.label)), `14 crew: ${arrows} of 14 free hands have an arrow, and a broken Aft Dorsal Gun is one of them`);
}

// ---------------------------------------------------------------- 7. the lone fighter is a squadron of one
{
  const run = (fold) => {
    config.SQUADRONS.FOLD_LONE = fold;
    const t = boot({ bots: 8, rate: 1 });
    let enemyFlew = false, lone = null, loneSeen = 0, pairs = 0;
    step(t.sim, secs(120), () => {
      if (t.st.enemy.dead <= 0 && t.st.enemy.heading != null) enemyFlew = true;
      const sq = t.st.squadrons.find((q) => q.lone);
      if (sq) { lone = lone || sq; if (sq !== lone) loneSeen++; }
      if (t.st.squadrons.filter((q) => q.lone).length > 1) pairs++;
    });
    return { enemyFlew, lone, loneSeen, pairs, t };
  };
  const on = run(true), off = run(false);
  report(on.lone && on.lone.n0 === 1 && !on.enemyFlew && on.pairs === 0, `folded: the lone fighter came as a squadron of ${on.lone && on.lone.n0} (formation ${on.lone && on.lone.formation}), state.enemy never flew, never two lone at once; ${on.loneSeen + 1} of them in 120 s`);
  report(off.enemyFlew && !off.lone, 'FOLD_LONE off: the big fighter flies as before');
  config.SQUADRONS.FOLD_LONE = true;
  // its toughness is the old fighter's, it can be shot down, and it comes again
  const t = boot({ bots: 8, rate: 1 });
  let sq = null;
  step(t.sim, secs(60), () => { sq = t.st.squadrons.find((q) => q.lone); if (sq) return 'stop'; });
  const plane = sq && sq.leader;
  report(!!plane && plane.max >= 2 && plane.hp === plane.max && !plane.ace, `the lone plane has the old fighter's toughness (${plane && plane.max} hp), no ace`);
  if (plane) {
    plane.hp = 0;
    t.st.strafers = t.st.strafers.filter((q) => q !== plane);
    let again = false;
    step(t.sim, secs(60), () => { if (t.st.squadrons.some((q) => q.lone && q !== sq)) { again = true; return 'stop'; } });
    report(again, 'after it is gone another comes');
  }
}

// ---------------------------------------------------------------- 8. the bots do not sit at guns with nothing to shoot
{
  const t = boot({ bots: 8, rate: 0 });
  const guns = Object.keys(t.st.GUNS);
  let seats = 0, frames = 0;
  step(t.sim, secs(60), () => { frames++; for (const p of Object.values(t.st.players)) if (guns.includes(p.lock) && (p.gunIdle || 0) > 0) seats++; });
  report(seats / frames < 0.2, `8 bots, nothing to shoot, 60 s: ${(seats / frames).toFixed(2)} bots at an idle gun on average (BOTS.FILL_GUNS ${config.BOTS.FILL_GUNS})`);
}
report(errors.length === 0, `0 errors in all of the above${errors.length ? ': ' + errors[0] : ''}`);

// ---------------------------------------------------------------- 9. the switch
{
  const r = spawnSync(process.execPath, ['-e', "import('" + pathToFileURL(path.join(publicDir, 'config.js')).href + "').then(({config:c})=>console.log(JSON.stringify([c.PACING.AIM_AT_GUNS,c.PACING.HARD.ENABLED,c.PACING.MULTI.ENABLED,c.MINES.FIRST_COLUMN,c.JOBS.SEATED_IDLE,c.CREW_SEATS.ENABLED,c.SQUADRONS.FOLD_LONE,c.BOTS.FILL_GUNS,c.BOTS.GUN_IDLE_LEAVE])))"], { encoding: 'utf8', env: { ...process.env, NO_GUNS: '1' } });
  report((r.stdout || '').trim() === '[false,false,false,0,0,false,false,99,6]', `NO_GUNS=1 gives the old game: ${(r.stdout || '').trim()}`);
}
void SAVE;
console.log(ok ? 'guns check: PASS' : 'guns check: FAIL');
process.exit(ok ? 0 : 1);
