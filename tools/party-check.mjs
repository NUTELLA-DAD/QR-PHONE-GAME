// RAIDERS AND FIRE AS A PARTY gate (FUN.md F5; raiders.js, fire.js, fireModel.js, goingDown.js, structure.js, config.RAIDERS / FIRE / GOING_DOWN / STRUCTURE). Headless.
//   node tools/buildsim.mjs --check-party        or directly:   node tools/party-check.mjs [--seed 1]
//
//   1  the numbers: KO_TIME 8, STRIKE_CD, ALL_HANDS 20, BREACH_RATE 0.007, FIRE_RATE 0.006, GRACE_END_KEY 8, GROUND_STALL 40
//   2  an announced boarding: the boss's lines hang the raiders in sight for WARN_TIME, a BOARDERS AFT / FORE banner, then they drop; none are aboard before and they land after
//   3  at most 1 + floor(crew / 3) aboard (hanging ones count), a floor of 2 on Veteran / Hard; none while FALLING or within HOLD_CALM seconds of SHE HOLDS; the gunships ask canBoard()
//   4  a cutter with a station to hack leaves the crew alone; a grunt hits him; the swing cooldown is STRIKE_CD
//   5  fire: the cap is CAP_FLAT + crew x CAP_PER_CREW (a crew of 3 holds fewer than a crew of 12), nothing ignites while FALLING, and a fire spreads slower on column 1 than on column 5
//   6  an end segment that carries the helm or the boiler holds GRACE_END_KEY seconds (a plain end GRACE_END) and cannot break off before stop KEY_NO_BREAK_BEFORE
//   7  the ground soft lock: a ship sitting grounded and still GROUND_STALL seconds with no alarm raises FALLING, and the crash clock then runs
//   8  the switch: NO_PARTY=1 gives the old numbers (KO_TIME 12, no hanging boarders, no cap)
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
const R = config.RAIDERS, F = config.FIRE, SC = config.STRUCTURE;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
const secs = (s) => Math.round(s * 60);
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

function boot({ bots = 8, difficulty = null, startBuild = null, s = seed } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(s);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  if (difficulty) st.difficulty = difficulty;
  if (startBuild) sim.setStartBuild(startBuild);
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: false, name: 'Crew' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry: null };
  }
  sim.castOff();
  return { sim, st, ours, raiders: ours.sim.raiders, S: ours.sim.structure };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const FAKE_FALL = () => ({ t: 0, joints: [], holes: [], time: 20, need: 5, hold: 0 }); // (a FALLING alarm in name: raiders and fire only ask whether state.goingDown is there)
const entryX = (ours) => ours.layout.boarderEntryPoints[ours.layout.boarderEntryPoints.length - 1].x;

// ---------------------------------------------------------------- 1. the numbers
report(R.KO_TIME === 8 && R.STRIKE_CD === 1.5 && config.GOING_DOWN.ALL_HANDS === 20 && SC.BREACH_RATE === 0.007 && SC.FIRE_RATE === 0.006 && SC.GRACE_END_KEY === 8 && SC.LIFT.GROUND_STALL === 40 && F.CAP_FLAT === 3 && F.SPREAD_EARLY === 10, `the numbers: KO ${R.KO_TIME} s, strike cooldown ${R.STRIKE_CD}, ALL_HANDS ${config.GOING_DOWN.ALL_HANDS}, breach ${SC.BREACH_RATE}, fire ${SC.FIRE_RATE}, end grace ${SC.GRACE_END_KEY}, stall ${SC.LIFT.GROUND_STALL} s, fire cap ${F.CAP_FLAT} + crew x ${F.CAP_PER_CREW.toFixed(2)}`);
report(R.PARTY === true && F.PARTY === true, 'RAIDERS.PARTY and FIRE.PARTY are on');

// ---------------------------------------------------------------- 2. an announced boarding
{
  const { sim, st, ours, raiders } = boot({ bots: 8 });
  step(sim, secs(5));
  const before = st.boarders.length;
  const r = raiders.dropSquad(entryX(ours), -200 - st.ship.alt);
  const hung = st.boarders.filter((b) => b.hang > 0);
  report(before === 0 && r === 'announced' && hung.length === st.boarders.length && hung.length >= 1, `the boss's lines are ANNOUNCED: ${hung.length} raiders hang on their ropes (return value ${r})`);
  report(/^BOARDERS (AFT|FORE)!$/.test(st.ev.warnText || '') && st.ev.warn > 2, `the banner reads "${st.ev.warnText}"`);
  report(hung.every((b) => b.fall && b.landD != null), 'each knows the deck he will land on (the TV marks it)');
  const y0 = hung.map((b) => b.y);
  step(sim, secs(R.WARN_TIME - 0.5));
  report(st.boarders.every((b) => b.hang > 0) && hung.every((b, i) => b.y === y0[i]), `they are still hanging, still in the air, just before ${R.WARN_TIME} s`);
  step(sim, secs(1));
  report(st.boarders.every((b) => !(b.hang > 0)) && st.boarders.some((b) => b.y > y0[0]), 'then the lines pay out and they drop');
  step(sim, secs(4));
  report(st.boarders.length === 0 || st.boarders.some((b) => !b.fall), 'and land on a deck');
}

// ---------------------------------------------------------------- 3. the cap, the calm
{
  const { sim, st, ours, raiders } = boot({ bots: 8 });
  step(sim, secs(3));
  raiders.dropSquad(entryX(ours), -300);
  const max8 = 1 + Math.floor(8 / R.ABOARD_CREW_DIV);
  report(st.boarders.length <= max8 && st.boarders.length >= 1, `8 crew: at most ${max8} aboard (${st.boarders.length} came)`);
  const again = raiders.dropSquad(entryX(ours), -300);
  report(st.boarders.length <= max8 && (again === 'blocked' || st.boarders.length <= max8), `a second squad cannot pass the cap (${again}, ${st.boarders.length} aboard)`);
  st.boarders.length = 0;
  report(raiders.canBoard() === true, 'with room and calm, canBoard() says yes');
  st.goingDown = FAKE_FALL();
  report(raiders.dropSquad(entryX(ours), -300) === 'blocked' && raiders.canBoard() === false && st.boarders.length === 0, 'none while she is FALLING');
  st.goingDown = null;
  ours.ctx.gdSince = 3;
  report(raiders.dropSquad(entryX(ours), -300) === 'blocked' && raiders.canBoard() === false, 'none 3 s after SHE HOLDS');
  ours.ctx.gdSince = R.HOLD_CALM + 1;
  report(raiders.canBoard() === true && raiders.dropSquad(entryX(ours), -300) === 'announced', `and again ${R.HOLD_CALM} s after`);
  // hanging raiders wait for the fall to end
  st.goingDown = FAKE_FALL();
  const h0 = st.boarders.map((b) => b.hang);
  step(sim, secs(2));
  report(st.boarders.every((b, i) => b.hang === h0[i]), 'raiders already on their ropes wait while she falls');
  st.goingDown = null;
  // small crews, harder difficulties
  const t3 = boot({ bots: 3 });
  step(t3.sim, secs(2));
  t3.raiders.dropSquad(entryX(t3.ours), -300, 6);
  report(t3.st.boarders.length === 1 + Math.floor(3 / R.ABOARD_CREW_DIV), `3 crew: ${t3.st.boarders.length} aboard of the 6 asked (1 + floor(3/3) = 2)`);
  const t1 = boot({ bots: 1, difficulty: 'normal' });
  step(t1.sim, secs(2));
  t1.raiders.dropSquad(entryX(t1.ours), -300, 6);
  const n1 = t1.st.boarders.length;
  const t1v = boot({ bots: 1, difficulty: 'veteran' });
  step(t1v.sim, secs(2));
  t1v.raiders.dropSquad(entryX(t1v.ours), -300, 6);
  report(n1 === 1 && t1v.st.boarders.length === 2, `1 crew: ${n1} aboard on Normal, ${t1v.st.boarders.length} on Veteran (the floor of 2)`);
}

// ---------------------------------------------------------------- 4. cutters and the swing cooldown
{
  const { sim, st, ours, raiders } = boot({ bots: 1 });
  step(sim, secs(4));
  const P = ours.layout.platforms, md = ours.layout.deckIndex('main');
  const p = Object.values(st.players)[0];
  const place = (b, x) => { b.fall = false; b.hang = 0; b.d = md; b.y = P[md].y; b.x = x; };
  p.d = md; p.x = 900; p.y = P[md].y; p.fall = false; p.lock = null;
  const hearts0 = p.hp;
  const cut = raiders.dropOne(900 + 30, P[md].y, 'cutter');
  place(cut, 930);
  step(sim, secs(2));
  report(cut.windup === 0 && p.hp === hearts0 && !(p.ko > 0), `a cutter standing beside a crewman hacks a station instead (crew hearts ${p.hp}/${hearts0}, windup ${cut.windup})`);
  st.boarders.length = 0;
  const grunt = raiders.dropOne(930, P[md].y, 'grunt');
  place(grunt, 930);
  step(sim, secs(1));
  report(grunt.windup > 0 || grunt.cd > 0, `a grunt beside him winds up and strikes (cooldown ${grunt.cd.toFixed(2)} of ${R.STRIKE_CD})`);
}

// ---------------------------------------------------------------- 5. fire
{
  const a = boot({ bots: 3 }), b = boot({ bots: 12 });
  step(a.sim, secs(2)); step(b.sim, secs(2));
  const ca = a.sim.fire.cap(), cb = b.sim.fire.cap();
  report(ca < cb && ca >= F.CAP_MIN, `the fire cap follows the crew: ${ca} for 3, ${cb} for 12 (the classic held ${F.CAP_BASE} for everyone)`);
  const mainD = a.ours.layout.deckIndex('main');
  a.st.fires.length = 0;
  a.st.goingDown = FAKE_FALL();
  const lit = a.sim.fire.ignite(mainD, 800, 'hit');
  report(lit === null && a.st.fires.length === 0, 'nothing ignites while she is FALLING');
  a.st.goingDown = null;
  report(!!a.sim.fire.ignite(mainD, 800, 'hit'), '...and a fire catches again after');
  // the spread clock: column 1 slower than column 5 (counted over a few seconds of the same fire)
  const spreads = (col, seedNo) => {
    const t = boot({ bots: 8, s: 100 + seedNo });
    step(t.sim, secs(2));
    t.st.course.stop = { col: col - 1 };
    const md = t.ours.layout.deckIndex('main');
    t.st.fires.length = 0;
    t.sim.fire.ignite(md, 800, 'hit');
    let at = 60;
    step(t.sim, secs(60), (i) => { t.st.ship.hull = 100; t.st.goingDown = null; if (t.st.fireStats.spread > 0) { at = i / 60; return 'stop'; } });
    return at;
  };
  let early = 0, late = 0;
  for (let k = 0; k < 10; k++) { early += spreads(1, k); late += spreads(5, k); }
  report(early > late, `a lone fire takes longer to spread on column 1 (${(early / 10).toFixed(1)} s on average) than on column 5 (${(late / 10).toFixed(1)} s)`);
}

// ---------------------------------------------------------------- 6. the end segments with the boiler or the helm
{
  const { sim, st, ours, S } = boot({ bots: 8 });
  step(sim, secs(2));
  const L = ours.layout;
  const segs = S.segs();
  const key = segs.filter((g) => !g.critical && ['boiler', 'helm'].some((k) => L.all(k).some((s) => s.d === g.d && s.x >= g.x0 && s.x <= g.x1)));
  const plain = segs.filter((g) => !g.critical && !g.nest && !key.includes(g));
  report(plain.length > 0, `the classic has ${key.length} end segments with the boiler or the helm and ${plain.length} plain ones`);
  const zero = (g) => { g.hp = 0; };
  if (key.length) {
    const g = key[0];
    st.course.stop = { col: 4 };
    zero(g);
    step(sim, 2);
    report(!!g.hold && g.hold.max === SC.GRACE_END_KEY, `a key end segment holds ${g.hold && g.hold.max} s (GRACE_END_KEY ${SC.GRACE_END_KEY})`);
  }
  if (plain.length) {
    const g = plain[0];
    zero(g);
    step(sim, 2);
    report(!!g.hold && g.hold.max === SC.GRACE_END, `a plain end segment holds ${g.hold && g.hold.max} s (GRACE_END ${SC.GRACE_END})`);
  }
  // before stop 3 a key end cannot break off: it holds at HELD_HP instead
  const t = boot({ bots: 8 });
  step(t.sim, secs(2));
  const L2 = t.ours.layout, k2 = t.S.segs().filter((g) => !g.critical && ['boiler', 'helm'].some((k) => L2.all(k).some((s) => s.d === g.d && s.x >= g.x0 && s.x <= g.x1)));
  if (k2.length) {
    const g = k2[0];
    t.st.course.stop = { col: 0 };
    g.hp = 0;
    step(t.sim, secs(SC.GRACE_END_KEY + 3));
    report(g.hp >= SC.HELD_HP - 0.01 && !t.st.breakEvents?.length && t.ours.layout.platforms.length === L2.platforms.length, `on stop 1 the key end does not break off: it is left at ${g.hp.toFixed(2)} soundness`);
  }
}

// ---------------------------------------------------------------- 7. the ground soft lock
{
  // (a ship sitting on the ground with lift to spare, so the ordinary FALLING rule stays quiet: only the stall rule can raise the alarm)
  const sitFor = (speed, secsN) => {
    const { sim, st } = boot({ bots: 0 });
    step(sim, secs(3));
    let fell = null, crashed = null;
    step(sim, secs(secsN), (i) => {
      st.course.scraping = true; st.course.lastContact = { dy: -1 }; st.ship.speed = speed; st.ship.gas = 75; st.ship.vy = 0;
      if (fell === null && st.goingDown) fell = i / 60;
      if (crashed === null && (st.ship.down || (st.run && st.run.limps))) { crashed = i / 60; return 'stop'; }
    });
    return { fell, crashed, stall: st.goingDown && st.goingDown.stall };
  };
  const still = sitFor(0, SC.LIFT.GROUND_STALL + SC.CRASH.TIME.normal + 8 + 40);
  report(still.fell !== null && Math.abs(still.fell - SC.LIFT.GROUND_STALL) < 6, `grounded and still with lift to spare, FALLING is raised after ${still.fell && still.fell.toFixed(0)} s (GROUND_STALL ${SC.LIFT.GROUND_STALL})`);
  report(still.crashed !== null, `...and the crash clock then runs out: wrecked after ${still.crashed && still.crashed.toFixed(0)} s`);
  const moving = sitFor(0.4, SC.LIFT.GROUND_STALL + 15);
  report(moving.fell === null, 'a grounded ship that is still moving (speed 0.4) raises no stall alarm');
}
report(errors.length === 0, `0 errors in all of the above${errors.length ? ': ' + errors[0] : ''}`);

// ---------------------------------------------------------------- 8. the switch
{
  const r = spawnSync(process.execPath, ['-e', "import('" + pathToFileURL(path.join(publicDir, 'config.js')).href + "').then(({config:c})=>console.log(JSON.stringify([c.RAIDERS.PARTY,c.FIRE.PARTY,c.RAIDERS.KO_TIME])))"], { encoding: 'utf8', env: { ...process.env, NO_PARTY: '1' } });
  report((r.stdout || '').trim() === '[false,false,12]', `NO_PARTY=1 gives the old numbers: ${(r.stdout || '').trim()}`);
}
console.log(ok ? 'party check: PASS' : 'party check: FAIL');
process.exit(ok ? 0 : 1);
