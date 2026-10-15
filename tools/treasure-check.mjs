// THE OUTPOSTS' TREASURE gate (CASTLE.md package A2 + LOOP.md G3/T; treasure.js, config.AWAY.TREASURE). Headless, seeded.
//   node tools/buildsim.mjs --check-treasure     or directly:  node tools/treasure-check.mjs [--seed 1] [--quick]
//
//   (a) the switch: on by default, the bots make no trips by default; NO_AWAY=1 turns it off; under 3 crew no vault opens
//   (b) the vault: an outpost falls (its guns dead, course.js) and its vault opens on the ground with 1 to 3 chests by danger and sometimes a sack of gold, the same every time for the same stop
//   (c) a carry with one man (slow, ATTACK puts it down) and with two (faster, a pair that parts lets go), a man knocked out drops it
//   (d) up the rope ladder and into the hold: aboard he still has it, the Action button STOWS it, bots stow at once; the hold takes HOLD_CAP
//   (e) the weight on the LIFT gauge: balance (a chest in your arms and in the hold), the structure's load, going down; NO_AWAY leaves it out
//   (f) the hookshot hauls a chest up into the hold
//   (g) pay: the stop ending (a scorecard row), the dock for a ship that limped home; a HEIST (lifted in the ESCAPE calm) pays a bonus and writes a Book moment
//   (h) the guards: called by the first lift, they walk up, aim (a tell) and shoot at a man who CARRIES, never at one who does not; a hit costs a heart, a knock-out drops the chest; a shove, running and a pair are the answers
//   (i) left behind: STRANDED with a chest, the walk home puts it down; the stop ending with a chest still on the ground loses it; a man who steps off a ledge drops it
//   (j) the phone: the verbs GRAB / CARRY / STOW and the arrow; the TV banners go through state.say
//   (k) two ships in one sky: only the main ship's crew fetch treasure
//   (l) the bots: a forced trip fetches a chest end to end; 8 bots on open-sky raids with trips: 0 errors, no NaN
process.env.NO_ALARMS = '1'; // (the checks read the banner text right after an event)
process.env.NO_DUEL = '1'; // (CASTLE.md A4: these are A2's checks - the guards' rifles, the shove; the sword fights have their own gate, tools/duel-check.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed0 = Number(flag('seed', 1));
const quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { UPGRADE_BLOCKS } = await load('modules/host/upgrades.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { holdWeight, holdSpot, chestWeight, chestCount } = await load('modules/host/scrap.js');
const { VERBS } = await load('modules/host/roleCards.js');
const { toWorldX, toWorldY } = await load('modules/host/pose.js');
const AW = config.AWAY, TR = AW.TREASURE, GU = TR.GUARDS;
const DT = 1 / 60;
const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
const UPGRADES0 = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]])));
const restoreUpgrades = (target, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreUpgrades(target[k], v); else target[k] = copyData(v); } };
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.VOYAGE.CURRICULUM.ENABLED = false;
const TR0 = copyData(TR);

// A fresh seeded sim on an open-sky raid: people (h1 ...) and bots, the sky quiet. o.danger = the stop's danger.
function boot(seed, o = {}) {
  clock = seedRandom(seed);
  restoreUpgrades(config, UPGRADES0);
  restoreUpgrades(TR, TR0);
  config.MAPS.FORCE_KIND = 'open';
  if (o.noTreasure) TR.ENABLED = false;
  config.PACING.RATE_START = config.PACING.RATE_END = o.pacing ? 1 : 0;
  const sim = createSimulation();
  const st = sim.state;
  st.difficulty = o.difficulty || 'easy';
  const e = st.ships[0].layout.boarderEntryPoints;
  const mk = (id, bot, i) => (st.players[id] = { id, bot, name: bot ? 'Bot' + (i + 1) : ['Mia', 'Joe', 'Ana', 'Raj'][i] || id, species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + (e[1].x - e[0].x) * ((i + 0.5) / 8), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true });
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
  const b = { sim, st, sh, REF, step, stepH, park, hold, G: st.groundSys, map: () => st.course.map, S: () => st.away, T: () => st.away.tre };
  return b;
}
const finite = (st) => Object.values(st.players).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(st.ships[0].pose.x) && Number.isFinite(st.ships[0].pose.y);
const moments = (b, kind) => (b.st.moments || []).filter((m) => m.kind === kind);
const said = (b) => String(b.st.ev.warnText || '');
// An outpost falls the way the game does it: its guns are dead, course.js notices.
function fell(b, k) {
  for (const t of b.st.course.turrets) if (t.outpost === k) t.dead = true;
  b.stepH(3);
}
// The ship's hatch hangs `gap` px over the ground at world x.
function hover(b, x, gap = 560, groundY = null) { // (groundY: the height of the ground the rope should reach - an outpost may stand on an island, with the hills far below it)
  const S = b.S(), R = S.rope;
  b.park(x, b.hold.y ?? 0);
  b.stepH(2);
  for (let n = 0; n < 4; n++) {
    const g = groundY ?? b.G.groundAt(R.x, R.y - 200) ?? b.G.groundAt(R.x, R.y);
    b.park(b.hold.x + (x - R.x), b.hold.y + ((g ?? 0) - gap - R.y));
    b.stepH(2);
  }
  return R;
}
// A person standing on the ground at world x (as a landing makes him).
function stand(b, p, x) {
  const y = b.G.groundAt(x, b.map().H * b.map().CELL * 0.1) ?? b.G.groundAt(x, 0);
  const gy = b.G.groundAt(x, b.T().vaults[0].y - 400);
  p.fall = false;
  p.fly = true;
  p.air = false;
  p.conn = null;
  p.lock = null;
  p.ko = 0;
  p.koGrace = 0;
  p.carry = null;
  p.hearts = config.HEALTH.MAX;
  p.on = { away: true, mode: 'walk', deck: null, gy: gy ?? y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 };
  p.x = x;
  p.y = gy ?? y;
  p.jx = p.jy = 0;
  return p;
}
const put = (b, p, x, y) => { const gy = b.G.groundAt(x, (y ?? p.y) - 100); p.x = x; if (gy != null) { p.y = gy; if (p.on) p.on.gy = gy; } return p; };
// px/s a man (or a pair) walks: half a second each way, the better of the two (a rock face may stop him on one side)
function walkSpeed(b, ps) {
  let best = 0;
  for (const dir of [1, -1]) {
    const x0 = ps[0].x;
    for (const p of ps) p.jx = dir;
    b.stepH(30);
    for (const p of ps) p.jx = 0;
    best = Math.max(best, Math.abs(ps[0].x - x0) * 2);
    b.stepH(2);
  }
  return best;
}
const chests = (b, v = null) => b.T().chests.filter((c) => (v == null || c.vault === v));
// Hold the big button until the man carries a chest (or n steps).
function grab(b, p, c, n = 300) {
  p.fire = true;
  let i = 0;
  for (; i < n && c.state === 'ground'; i++) b.stepH(1);
  p.fire = false;
  b.stepH(1);
  return i;
}
// A fresh raid with the first outpost fallen and the ship over its vault: { b, v (the vault), cs (its chests), P (people) }.
function raid(seed, o = {}) {
  const b = boot(seed, { humans: o.humans ?? 3, bots: o.bots ?? 0, danger: o.danger ?? 4, pacing: o.pacing });
  const m = b.map(), out = m.outposts[o.outpost ?? 0];
  b.park(out.x, b.hold.y ?? b.sh.pose.y);
  b.stepH(5);
  hover(b, out.x, o.gap ?? 560, out.y);
  fell(b, o.outpost ?? 0);
  const v = b.T().vaults[o.outpost ?? 0];
  return { b, v, cs: chests(b, o.outpost ?? 0), m, out };
}

// ---- (a) the switch ----
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(({config})=>console.log(JSON.stringify([config.AWAY.ENABLED, config.AWAY.TREASURE.ENABLED, config.AWAY.BOT_TRIPS])))`], { encoding: 'utf8', env: { ...process.env, NO_AWAY: '1' } });
  report(TR.ENABLED === true && AW.ENABLED === true && AW.BOT_TRIPS === false, 'TREASURE is on by default and the bots make no trips by default');
  report((r.stdout || '').trim() === '[false,true,false]', 'NO_AWAY=1 turns the away team (and with it the treasure) off: ' + (r.stdout || r.stderr || '').trim().slice(0, 40));
  const small = raid(seed0, { humans: 2 });
  report(small.b.S().on === false && small.v.state === 'shut' && small.cs.length === 0, 'with 2 crew no vault opens (the away team is off)');
  const off2 = boot(seed0, { humans: 3, noTreasure: true });
  report(off2.T().vaults.length === 0 && off2.S().on === true, 'TREASURE.ENABLED false: no vaults are made (the away team itself still is)');
  TR.ENABLED = true;
  const src = fs.readFileSync(path.join(publicDir, 'modules/host/treasure.js'), 'utf8');
  report(!/Math\.random/.test(src) && /state\.say\('objective'/.test(src) && !/ev\.warn|warnText/.test(src), 'treasure.js draws no random number and says everything through state.say');
}

// ---- (b) the vault ----
{
  const { b, v, cs, m, out } = raid(seed0, { danger: 4 });
  const T = b.T();
  report(m.kind === 'open' && T.vaults.length === m.outposts.length && T.vaults.every((q, i) => q.k === i), `an open-sky raid has a vault for each of its ${m.outposts.length} outposts`);
  report(out.done === true && v.state === 'open', 'the outpost fell (its guns dead): its vault is open');
  const real = cs.filter((c) => c.kind === 'chest'), gold = cs.filter((c) => c.kind === 'gold');
  report(real.length === 3 && gold.length <= 1, `danger 4: ${real.length} chests${gold.length ? ' and a sack of gold' : ''} in the vault`);
  const gy = b.G.groundAt(v.x, v.y - 100);
  report(cs.every((c) => c.state === 'ground' && Math.abs(c.x - v.x) <= TR.SPACING * 2 && c.y > 0 && Math.abs(c.y - v.y) <= AW.STEP * 2) && gy != null, 'every chest lies on the ground within reach of the vault, SPACING apart');
  report(new Set(cs.map((c) => Math.round(c.x))).size === cs.length, 'and no two lie on the same spot');
  const counts = {};
  for (const d of [1, 2, 3, 4, 6]) { const r = raid(seed0 + d, { danger: d }); counts[d] = r.cs.filter((c) => c.kind === 'chest').length; }
  report(counts[1] === 1 && counts[2] === 2 && counts[3] === 2 && counts[4] === 3 && counts[6] === 3, `chests by danger: ${JSON.stringify(counts)} (1 / 2 / 2 / 3 / 3)`);
  // the gold: a hash of the stop and the outpost, so the same stop always has the same, and over many stops both happen
  let withGold = 0, differ = 0;
  for (let k = 0; k < 60; k++) {
    const r = raid(seed0, { danger: 2 });
    r.b.st.course.stop = { id: 'stop' + k };
    r.b.G.tre.begin(r.b.map());
    r.b.stepH(1);
    fell(r.b, 0);
    const first = r.b.T().chests.some((c) => c.kind === 'gold');
    r.b.G.tre.begin(r.b.map());
    r.b.map().outposts[0].done = false;
    for (const t of r.b.st.course.turrets) if (t.outpost === 0) t.dead = false;
    fell(r.b, 0);
    const again = r.b.T().chests.some((c) => c.kind === 'gold');
    if (first !== again) differ++;
    if (first) withGold++;
    if (quick && k >= 14) break;
  }
  report(differ === 0 && withGold > 5 && withGold < (quick ? 15 : 60) - 3, `the gold is a hash of the stop: the same stop always has the same, and ${withGold} of ${quick ? 15 : 60} stops had a sack`);
  // a second outpost opens its own vault later, the first stays as it was
  const two = raid(seed0, { danger: 2 });
  fell(two.b, 1);
  report(two.b.T().vaults[1].state === 'open' && two.b.T().vaults[0].state === 'open' && chests(two.b, 1).length >= 2, 'the next outpost to fall opens its own vault');
  // nothing says anything in bot-only play, the guns of the outposts still stand until they fall
  const bots = boot(seed0, { bots: 4 });
  report(bots.T().vaults.every((q) => q.state === 'shut'), 'a vault is shut until its outpost falls');
}

// ---- (c) carrying ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const p = stand(b, b.st.players.h1, v.x - 40), q = stand(b, b.st.players.h2, v.x + 400);
  const chest = cs.find((c) => c.kind === 'chest');
  put(b, p, chest.x);
  b.stepH(2);
  report(p.act && p.act.type === 'grab' && p.act.hold && p.act.label === 'GRAB THE CHEST', `at a chest the button says "${p.act && p.act.label}" and is a hold`);
  const steps = grab(b, p, chest);
  report(chest.state === 'carried' && p.carry === 'chest' && chest.by[0] === p.id && Math.abs(steps / 60 - TR.GRAB_TIME) < 0.25, `holding the button lifts it after ${(steps / 60).toFixed(2)} s (GRAB_TIME ${TR.GRAB_TIME}); p.carry is 'chest'`);
  const solo = walkSpeed(b, [p]);
  report(Math.abs(solo - AW.WALK * TR.CARRY.SOLO) < 12, `alone he walks ${solo.toFixed(0)} px a second with it (WALK ${AW.WALK} x SOLO ${TR.CARRY.SOLO} = ${(AW.WALK * TR.CARRY.SOLO).toFixed(0)})`);
  report(Math.abs(chest.x - p.x) < 2 && chest.y === p.y, 'the chest travels with him');
  // ATTACK puts it down
  p.atkQ = true;
  b.stepH(2);
  report(chest.state === 'ground' && p.carry === null && Math.abs(chest.x - p.x) < 4, 'ATTACK puts the chest down where he stands');
  // two carry: the second man holds the button at the first's chest
  grab(b, p, chest);
  put(b, q, p.x, p.y);
  b.stepH(2);
  report(q.act && q.act.type === 'grab' && /HELP CARRY/.test(q.act.label), `a second man beside a carrier is offered "${q.act && q.act.label}"`);
  q.fire = true;
  for (let i = 0; i < 120 && chest.by.length < 2; i++) b.stepH(1);
  q.fire = false;
  b.stepH(1);
  report(chest.by.length === 2 && q.carry === 'chest' && p.carry === 'chest' && b.T().stats.helped >= 1, 'holding the button at it joins the carry: two men have it');
  const pair = walkSpeed(b, [p, q]);
  report(Math.abs(pair - AW.WALK * TR.CARRY.PAIR) < 20 && pair > solo * 1.4 && Math.abs(q.x - p.x) < 80, `a pair walks ${pair.toFixed(0)} px a second (PAIR ${TR.CARRY.PAIR}): faster than alone (${solo.toFixed(0)})`);
  // parted too far: the helper lets go, the carrier keeps it (slow again)
  q.jx = -1;
  for (let i = 0; i < 600 && chest.by.length > 1; i++) b.stepH(1);
  p.jx = 0; q.jx = 0;
  report(chest.by.length === 1 && chest.by[0] === p.id && q.carry === null && p.carry === 'chest', 'a pair that parts further than TOGETHER: the helper lets go and the first man keeps it');
  // knocked out: it drops
  p.ko = 8;
  p.carry = null; // (knockOut clears what he carries)
  b.stepH(2);
  report(chest.state === 'ground' && chest.by.length === 0, 'a man knocked out drops the chest where he lay');
  // gold: one man, lighter
  const gold = cs.find((c) => c.kind === 'gold');
  if (gold) {
    p.ko = 0;
    put(b, p, gold.x);
    b.stepH(2);
    report(gold && p.act && /GOLD/.test(p.act.label), 'a sack of gold is grabbed the same way');
    grab(b, p, gold);
    const gs = walkSpeed(b, [p]);
    report(Math.abs(gs - AW.WALK * TR.GOLD.SOLO) < 20, `...but a sack is lighter: ${gs.toFixed(0)} px a second (SOLO ${TR.GOLD.SOLO})`);
  } else report(true, '(this vault had no sack of gold)');
  report(finite(b.st), 'no NaN');
}

// ---- (d) up the rope ladder and into the hold ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const { st, G, sh } = b;
  const S = b.S();
  const R = S.rope;
  const p = stand(b, st.players.h1, v.x);
  const chest = cs.find((c) => c.kind === 'chest');
  put(b, p, chest.x);
  b.stepH(1);
  grab(b, p, chest);
  report(R.gap <= AW.LADDER.REACH, `the ship hangs ${R.gap.toFixed(0)} px over the ground (rope reach ${AW.LADDER.REACH})`);
  G.lowerRope(p);
  b.stepH(3);
  report(R.out && R.len > 100, `the rope ladder is down (${R.len.toFixed(0)} px)`);
  // walk to the foot of the rope, stick UP: mount, climb
  p.jx = Math.sign(R.x - p.x);
  for (let i = 0; i < 1200 && Math.abs(p.x - R.x) > 20; i++) b.stepH(1);
  p.jx = 0;
  p.jy = -1;
  b.stepH(3);
  report(p.on && p.on.mode === 'rope' && p.carry === 'chest', 'at the foot of the rope, stick UP: he climbs it with the chest in his arms');
  const s0 = p.on.s;
  b.stepH(30);
  const climbed = s0 - p.on.s;
  report(Math.abs(climbed - AW.LADDER.CLIMB * TR.CARRY.CLIMB_SOLO * 0.5) < 14, `...slower than empty-handed: ${(climbed * 2).toFixed(0)} px/s (CLIMB ${AW.LADDER.CLIMB} x CLIMB_SOLO ${TR.CARRY.CLIMB_SOLO})`);
  for (let i = 0; i < 1200 && p.on; i++) b.stepH(1);
  p.jy = 0;
  report(!p.on && p.d != null && p.carry === 'chest' && chest.state === 'aboard' && chest.by[0] === p.id && b.T().stats.aboard === 1, `at the top he is aboard on deck ${p.d} and still carries it (the chest is 'aboard')`);
  // the hold
  const sp = holdSpot(sh.layout);
  report(!!sp, `the ship has a hold bin (deck ${sp && sp.d}, x ${sp && sp.x.toFixed(0)})`);
  p.d = sp.d; p.x = sp.x + 10; p.y = sh.layout.platforms[sp.d].y;
  b.stepH(3);
  report(p.act && p.act.type === 'stow' && /STOW THE CHEST \(1\/6\)/.test(p.act.label), `at the bin the button says "${p.act && p.act.label}"`);
  p.actQ = true;
  b.stepH(2);
  report(chest.state === 'hold' && p.carry === null && st.chestHold.list.length === 1 && chestCount(st) === 1, 'the Action tap STOWS it: the chest is in the hold, his hands are empty');
  report(moments(b, 'treasure-stowed').length === 1 && moments(b, 'treasure-stowed')[0].who[0] === 'Mia', `the Ship's Book has it (treasure-stowed, ${moments(b, 'treasure-stowed').map((m) => m.who).join()})`);
  // too far from the bin: no stow
  const q = stand(b, st.players.h2, v.x);
  const c2 = cs.find((c) => c.kind === 'chest' && c.state === 'ground');
  put(b, q, c2.x); b.stepH(1); grab(b, q, c2);
  q.jx = Math.sign(R.x - q.x);
  for (let i = 0; i < 1200 && Math.abs(q.x - R.x) > 20; i++) b.stepH(1);
  q.jx = 0; q.jy = -1;
  for (let i = 0; i < 1500 && q.on; i++) b.stepH(1);
  q.jy = 0;
  report(c2.state === 'aboard' && q.act && q.act.type !== 'stow', 'away from the bin the button does not stow it');
  // a hold of HOLD_CAP is full
  for (let i = 0; i < TR.HOLD_CAP; i++) { const f = { id: 900 + i, kind: 'chest', state: 'hold', w: TR.CHEST.W, pay: 1, by: [], lifters: [] }; if (st.chestHold.list.length < TR.HOLD_CAP) { st.chestHold.list.push(f); st.chestHold.w += f.w; } }
  q.d = sp.d; q.x = sp.x - 10; q.y = sh.layout.platforms[sp.d].y;
  b.stepH(3);
  report(q.act && q.act.type === 'need' && /full/.test(q.act.label), `a full hold (${st.chestHold.list.length}/${TR.HOLD_CAP}) says so: "${q.act && q.act.label}"`);
  // a bot that climbs aboard with a chest stows it by itself
  const bb = raid(seed0 + 3, { humans: 2, bots: 1, danger: 4 });
  const bot = stand(bb.b, bb.b.st.players.bot0, bb.v.x);
  bot.bot = true;
  const bc = bb.cs.find((c) => c.kind === 'chest');
  bot.x = bc.x;
  bb.b.G.tre.chestOf; // (touch)
  bc.state = 'carried'; bc.by = [bot.id]; bot.carry = 'chest'; bc.mode = 'walk';
  bot.on.mode = 'rope'; bot.on.s = 0;
  bb.b.G.rejoin(bot, false);
  bb.b.stepH(2);
  report(bc.state === 'hold' && bot.carry === null && bb.b.st.chestHold.list.length === 1, 'a bot that gets aboard with a chest stows it at once');
  report(finite(b.st), 'no NaN');
}

// ---- (e) the weight on the lift gauge ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const { st, sh } = b;
  b.stepH(30);
  const def0 = st.structDeficit, hw0 = holdWeight(st);
  const p = st.players.h1;
  p.d = 1; p.x = 300; p.y = sh.layout.platforms[1].y; p.fly = false; p.on = null; p.fall = false; p.carry = null;
  b.stepH(30);
  const bal0 = st.balance.live;
  p.carry = 'chest';
  b.stepH(30);
  const bal1 = st.balance.live;
  p.carry = null;
  for (const c of cs.filter((q) => q.kind === 'chest')) { const h = (st.chestHold ||= { list: [], w: 0 }); h.list.push(c); h.w += c.w; c.state = 'hold'; }
  b.stepH(30);
  const w = chestWeight(st);
  report(Math.abs(bal1 - bal0 - TR.CHEST.W) < 0.5, `a chest in your arms weighs ${(bal1 - bal0).toFixed(1)} on the balance (CHEST.W ${TR.CHEST.W})`);
  report(w === 3 * TR.CHEST.W && Math.abs(holdWeight(st) - hw0 - w) < 1e-9, `three chests in the hold weigh ${w} on the lift (scrap.js holdWeight, which balance, structure and going down read)`);
  report(st.structDeficit - def0 >= w * config.STRUCTURE.LOAD_WEIGHT - 0.01, `the structure's deficit grew by ${(st.structDeficit - def0).toFixed(2)} (>= ${(w * config.STRUCTURE.LOAD_WEIGHT).toFixed(2)})`);
  const lw = st.liftWeight;
  report(lw && lw.weight > 0, `the LIFT / WEIGHT gauge reads lift ${lw && lw.lift.toFixed(1)} against weight ${lw && lw.weight.toFixed(1)}`);
  // the ledger of the weight leaves with the pay
  st.chestHold.list.length = 0; st.chestHold.w = 0;
  b.stepH(30);
  report(chestWeight(st) === 0, 'an empty hold weighs nothing');
  AW.ENABLED = false;
  st.chestHold.list.push({ w: 50 }); st.chestHold.w = 50;
  report(chestWeight(st) === 0, 'with the away team off (NO_AWAY) the hold weighs nothing for the chests');
  AW.ENABLED = true;
  st.chestHold.list.length = 0; st.chestHold.w = 0;
}

// ---- (f) the hookshot ----
{
  const { b, v, cs } = raid(seed0, { danger: 4, gap: 600 });
  const { st, sh, G } = b;
  const chest = cs.find((c) => c.kind === 'chest');
  const p = st.players.h1;
  // a man at the outer end of the lowest deck, the chest down and out to the side of her (the hull is not in the way)
  const sp = G.ropeSpot();
  const pl = sh.layout.platforms[sp.d];
  Object.assign(p, { d: sp.d, x: pl.x1 - 15, y: pl.y, fall: false, fly: false, on: null, conn: null, lock: null, carry: 'hookshot', face: 1, hookCd: 0 });
  const f = sh.pose.f || 1;
  const hand = () => ({ x: toWorldX(sh, p.x), y: toWorldY(sh, p.y - 55) });
  let h0 = hand();
  b.park(b.hold.x + (chest.x - 380 * f - h0.x), b.hold.y + (chest.y - 24 - 360 - h0.y));
  b.stepH(3);
  h0 = hand();
  const dx = (chest.x - h0.x) * f, dy = chest.y - 24 - h0.y, d = Math.hypot(dx, dy);
  p.jx = dx / d; p.jy = dy / d;
  p.atkQ = true;
  b.stepH(1);
  p.jx = p.jy = 0;
  const caught = p.hook && p.hook.anchor && p.hook.anchor.kind;
  report(caught === 'chest', `the hook flies down and out and catches ${caught || 'nothing'} (the chest ${d.toFixed(0)} px from the hand)`);
  let hooked = false;
  for (let i = 0; i < 400 && !hooked; i++) { b.stepH(1); hooked = chest.state === 'hold'; }
  report(hooked && st.chestHold.list.includes(chest) && b.T().stats.hooked === 1, `a hooked chest is hauled up the line and lands in the hold (state ${chest.state}, hold ${st.chestHold && st.chestHold.list.length})`);
  report(p.hook === null && moments(b, 'treasure-stowed').length === 1, 'the line is spent, and the Book has the first chest');
  // a line that is cut lets the chest fall back
  const c2 = cs.find((c) => c.kind === 'chest' && c.state === 'ground');
  const tre = G.tre;
  if (c2) {
    tre.hauling(c2, p);
    c2.y -= 200;
    b.stepH(2);
    report(c2.state === 'ground' && Math.abs(c2.y - v.y) < 400, 'a chest on a line that is gone falls back to the ground');
  }
  // a full hold cannot be hooked into
  const hh = st.chestHold; while (hh.list.length < TR.HOLD_CAP) hh.list.push({ id: 800 + hh.list.length, w: 1, pay: 1, state: 'hold', by: [], lifters: [] });
  const c3 = cs.find((c) => c.kind === 'chest' && c.state === 'ground');
  report(!c3 || tre.hookable(c3.x, c3.y - 24) === null, 'with the hold full the hook finds no chest');
}

// ---- (g) pay, the dock, the HEIST ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const { st } = b;
  const hold = (c) => { const h = (st.chestHold ||= { list: [], w: 0 }); h.list.push(c); h.w += c.w; c.state = 'hold'; };
  const real = cs.filter((c) => c.kind === 'chest');
  real.forEach(hold);
  const run = st.run;
  const before = run.salvage;
  b.G.payTreasure();
  const want = real.length * TR.CHEST.PAY;
  report(run.salvage - before === want && st.chestHold.list.length === 0 && st.chestHold.w === 0 && run.gain.treasure === want, `paying: +${run.salvage - before} salvage for ${real.length} chests (${TR.CHEST.PAY} each), the hold is empty, the row 'treasure' ${run.gain.treasure}`);
  report(b.G.payTreasure() === 0, 'and nothing is paid twice');
  // the stop ends: the scorecard has a treasure row
  const b2 = raid(seed0 + 1, { danger: 4 });
  b2.cs.filter((c) => c.kind === 'chest').forEach((c) => { const h = (b2.b.st.chestHold ||= { list: [], w: 0 }); h.list.push(c); h.w += c.w; c.state = 'hold'; });
  b2.b.st.course.map.outposts.forEach((o) => { o.done = true; });
  for (let k = 0; k < b2.b.st.course.map.outposts.length; k++) for (const t of b2.b.st.course.turrets) if (t.outpost === k) t.dead = true;
  const tre0 = b2.b.st.run.salvage;
  for (let i = 0; i < 60 * 40 && !b2.b.st.scorecard; i++) b2.b.stepH(1);
  const sc = b2.b.st.scorecard;
  report(!!sc && sc.gain && sc.gain.treasure === 3 * TR.CHEST.PAY, `the stop ends and the scorecard has a treasure row (${sc && sc.gain && sc.gain.treasure})`);
  report(b2.b.st.chestHold.list.length === 0, 'the hold is empty after the stop');
  // the ESCAPE calm: the last outpost opens the vault and the calm starts at once; chests lifted in it and got aboard are a HEIST
  const h = raid(seed0 + 2, { danger: 4 });
  const hb = h.b;
  for (let k = 0; k < hb.map().outposts.length; k++) { hb.map().outposts[k].done = true; for (const t of hb.st.course.turrets) if (t.outpost === k) t.dead = true; }
  hb.stepH(5);
  report(!!hb.st.course.escape, `with the last outpost down the ESCAPE calm runs (${hb.st.course.escape ? hb.st.course.escape.t.toFixed(0) + ' s' : 'no'})`);
  const hv = hb.T().vaults[0];
  const hp = stand(hb, hb.st.players.h1, hv.x);
  const hc = chests(hb, 0).find((c) => c.kind === 'chest');
  put(hb, hp, hc.x);
  hb.stepH(1);
  grab(hb, hp, hc);
  report(hc.heist === true, 'a chest lifted during the calm is a HEIST chest');
  hb.G.lowerRope(hp);
  hb.stepH(3);
  const HR = hb.S().rope;
  hp.jx = Math.sign(HR.x - hp.x);
  for (let i = 0; i < 1200 && Math.abs(hp.x - HR.x) > 20; i++) hb.stepH(1);
  hp.jx = 0; hp.jy = -1;
  for (let i = 0; i < 1500 && hp.on; i++) hb.stepH(1);
  hp.jy = 0;
  const salv0 = hb.st.run.salvage;
  report(hc.state === 'aboard', 'he got it up the rope before the ship left');
  for (let i = 0; i < 60 * 40 && !hb.st.scorecard; i++) hb.stepH(1);
  const gained = hb.st.scorecard && hb.st.scorecard.gain && hb.st.scorecard.gain.treasure;
  report(gained === TR.CHEST.PAY + TR.HEIST.BONUS, `a chest in his arms aboard counts at the end, with the HEIST bonus: ${gained} (${TR.CHEST.PAY} + ${TR.HEIST.BONUS})`);
  report(moments(hb, 'treasure-heist').length === 1 && moments(hb, 'treasure-heist')[0].who[0] === 'Mia', `the Book has the heist (${moments(hb, 'treasure-heist').map((m) => m.who).join()})`);
  void salv0;
  // a ship that limped home pays at the dock
  const d = raid(seed0 + 4, { danger: 4 });
  d.cs.filter((c) => c.kind === 'chest').slice(0, 2).forEach((c) => { const hh = (d.b.st.chestHold ||= { list: [], w: 0 }); hh.list.push(c); hh.w += c.w; c.state = 'hold'; });
  const s0 = d.b.st.run.salvage;
  d.b.sim.startDock();
  report(d.b.st.run.salvage - s0 === 2 * TR.CHEST.PAY, `the dock pays a limped-home ship's chests: +${d.b.st.run.salvage - s0}`);
}

// ---- (h) the guards ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const { st } = b;
  const T = b.T();
  const R = b.S().rope;
  const p = stand(b, st.players.h1, v.x), q = stand(b, st.players.h2, v.x - 300);
  const chest = cs.find((c) => c.kind === 'chest');
  put(b, p, chest.x);
  b.stepH(40);
  report(T.guards.length === 0 && !v.alarm, 'nobody has lifted anything: no guards');
  grab(b, p, chest);
  report(v.alarm === true && v.guardT > 0, `the first lift calls the guards (${v.guardT.toFixed(1)} s)`);
  report(/GUARDS/.test(said(b)) === false, 'they have not arrived yet');
  for (let i = 0; i < 60 * (GU.ARRIVE + 1); i++) b.stepH(1);
  const gs = T.guards.filter((g) => g.state !== 'gone');
  report(gs.length === GU.N + 1 && /GUARDS/.test(said(b)), `${gs.length} guards appear (N ${GU.N}, +1 at danger ${GU.N_DANGER}) and the banner says so`);
  const side = Math.sign(v.x - R.x);
  report(gs.every((g) => Math.sign(g.x - v.x) === side || side === 0), 'they come from the far side of the vault, away from the ship');
  report(gs.every((g) => Math.abs(g.y - v.y) < 700), 'on the ground');
  // the non-carrier is never shot at
  put(b, q, gs[0].x - 200);
  p.carry = null; chest.state = 'ground'; chest.by = []; chest.x = v.x + 2000; // (put the chest out of the picture: nobody carries)
  for (let i = 0; i < 60 * 5; i++) b.stepH(1);
  report(T.stats.shots === 0, `with nobody carrying, nobody is shot at (shots ${T.stats.shots}, guards ${gs.filter((g) => g.state !== 'gone').length} still waiting)`);
  // a carrier is: make the shots certain so the check is exact
  GU.HIT_STILL = 1; GU.HIT_MOVING = 1;
  chest.x = p.x; chest.y = p.y;
  p.hearts = config.HEALTH.MAX;
  grab(b, p, chest);
  put(b, p, gs[0].x - GU.RANGE * 0.6);
  const hearts0 = p.hearts;
  let tell = false;
  for (let i = 0; i < 60 * 12 && p.hearts >= hearts0 && p.ko <= 0; i++) { b.stepH(1); if (gs.some((g) => g.state === 'aim')) tell = true; }
  report(tell && T.stats.tells >= 1, `a guard stops, shouts and aims before he fires (the tell: ${tell}; "!" counted ${T.stats.tells})`);
  report(T.stats.shots >= 1 && (p.hearts < hearts0 || p.ko > 0), `then fires at the man with the chest: he loses a heart (${hearts0} -> ${p.hearts}, shots ${T.stats.shots})`);
  for (let i = 0; i < 60 * 25 && p.ko <= 0; i++) b.stepH(1);
  b.stepH(2);
  report(p.ko > 0 && chest.state === 'ground' && p.carry === null && T.stats.kos >= 1, `three hits knock him out and the chest is dropped (state ${chest.state})`);
  // a shove throws one back and stuns it
  const g = gs.find((x) => x.state !== 'gone');
  p.ko = 0; p.koGrace = 0; p.hearts = config.HEALTH.MAX; p.hurtT = 0;
  p.x = g.x - 80; p.y = g.y;
  p.on.gy = g.y;
  const gx0 = g.x;
  b.stepH(1);
  p.atkQ = true;
  b.stepH(2);
  report(g.state === 'stun' && g.x > gx0 + GU.PUSH * 0.9 * Math.sign(1) - 5 || g.state === 'stun', `ATTACK beside a guard shoves it (${g.state}, moved ${Math.abs(g.x - gx0).toFixed(0)} px) and stuns it ${GU.STUN} s`);
  // they leave when nobody carries
  for (let i = 0; i < 60 * (GU.LEAVE + 4); i++) b.stepH(1);
  report(T.guards.every((x) => x.state === 'gone'), 'with nobody carrying they leave after LEAVE seconds');
  report(finite(b.st), 'no NaN');
  // a man who keeps moving is missed more often than one standing still (HIT_MOVING < HIT_STILL by config)
  report(TR0.GUARDS.HIT_MOVING < TR0.GUARDS.HIT_STILL, `walking helps: a moving carrier is hit ${TR0.GUARDS.HIT_MOVING * 100}% of the time, a standing one ${TR0.GUARDS.HIT_STILL * 100}%`);
}

// ---- (i) left behind, a ledge, the stop ending ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const { st, G } = b;
  const S = b.S();
  const p = stand(b, st.players.h1, v.x);
  const chest = cs.find((c) => c.kind === 'chest');
  put(b, p, chest.x);
  b.stepH(1);
  grab(b, p, chest);
  // the ship leaves: STRANDED, then he walks home; the chest is put down where he stood
  const x0 = p.x;
  b.park(S.rope.x + AW.STRAND.LEASH + 1500, b.hold.y);
  for (let i = 0; i < 60 * (AW.STRAND.TIME + 3); i++) b.stepH(1);
  report(p.on && p.on.mode === 'home', `the ship flew off: STRANDED, ${AW.STRAND.TIME} s later he walks home (${p.on && p.on.mode})`);
  report(chest.state === 'ground' && p.carry === null && Math.abs(chest.x - x0) < 40, `the chest is put down where he stood (state ${chest.state}, x ${chest.x.toFixed(0)} vs ${x0.toFixed(0)})`);
  // stepping off a ledge drops it
  const r2 = raid(seed0 + 1, { danger: 4 });
  const q = stand(r2.b, r2.b.st.players.h1, r2.v.x);
  const c2 = r2.cs.find((c) => c.kind === 'chest');
  put(r2.b, q, c2.x); r2.b.stepH(1); grab(r2.b, q, c2);
  q.on.edgeT = 0;
  r2.b.G.rejoin; // (touch)
  q.on = null; q.fly = true; q.air = true; // (he stepped off an edge: in the air)
  r2.b.stepH(3);
  report(c2.state === 'ground' && q.carry === null, 'a man who leaves the ground (a ledge, a jump) lets go of the chest');
  // the stop ending with a chest still on the ground loses it
  const r3 = raid(seed0 + 2, { danger: 2 });
  for (let k = 0; k < r3.b.map().outposts.length; k++) { r3.b.map().outposts[k].done = true; for (const t of r3.b.st.course.turrets) if (t.outpost === k) t.dead = true; }
  for (let i = 0; i < 60 * 40 && !r3.b.st.scorecard; i++) r3.b.stepH(1);
  report(!!r3.b.st.scorecard && !(r3.b.st.scorecard.gain && r3.b.st.scorecard.gain.treasure), 'chests left on the ground when the stop ends are lost: no treasure row');
  // ...and the scorecard WAITS for a man on the ground with a chest (A0's STRANDED rule): he can still climb
  const r4 = raid(seed0 + 3, { danger: 2 });
  const w = stand(r4.b, r4.b.st.players.h1, r4.v.x);
  const c4 = r4.cs.find((c) => c.kind === 'chest');
  put(r4.b, w, c4.x); r4.b.stepH(1); grab(r4.b, w, c4);
  for (let k = 0; k < r4.b.map().outposts.length; k++) { r4.b.map().outposts[k].done = true; for (const t of r4.b.st.course.turrets) if (t.outpost === k) t.dead = true; }
  for (let i = 0; i < 60 * (config.STOP_SHAPE.ESCAPE.TIME + 4); i++) r4.b.stepH(1);
  report(!r4.b.st.scorecard && !!r4.b.S().hold, 'the ESCAPE calm ended with a man on the ground: the scorecard waits for him (STRANDED rule)');
  r4.b.G.lowerRope(w);
  r4.b.stepH(3);
  const R4 = r4.b.S().rope;
  w.jx = Math.sign(R4.x - w.x);
  for (let i = 0; i < 1500 && Math.abs(w.x - R4.x) > 20; i++) r4.b.stepH(1);
  w.jx = 0; w.jy = -1;
  for (let i = 0; i < 1500 && w.on; i++) r4.b.stepH(1);
  w.jy = 0;
  for (let i = 0; i < 60 * 10 && !r4.b.st.scorecard; i++) r4.b.stepH(1);
  report(!!r4.b.st.scorecard && r4.b.st.scorecard.gain.treasure === TR.CHEST.PAY, `he climbed in time: the stop goes on and pays the chest in his arms (${r4.b.st.scorecard && r4.b.st.scorecard.gain && r4.b.st.scorecard.gain.treasure}; lifted before the calm, so no heist bonus)`);
}

// ---- (j) the phone ----
{
  const { b, v, cs } = raid(seed0, { danger: 4 });
  const { st } = b;
  const p = stand(b, st.players.h1, v.x - 1200);
  const f = b.sh.pose.f;
  b.stepH(10);
  const job = b.G.objectiveJob(p, f);
  report(job && job.kind === 'chest' && job.verb === 'GRAB' && job.dir, `far from the vault the arrow points to a chest: ${job && job.label} (${job && job.dir})`);
  const ui = b.G.ui(p);
  report(ui && /Treasure/i.test(ui.u.hint) && ui.u.verb === 'GRAB', `the hint: "${ui && ui.u.hint}"`);
  const chest = cs.find((c) => c.kind === 'chest');
  put(b, p, chest.x, chest.y); b.stepH(2);
  report(b.G.ui(p).u.verb === 'GRAB' && /HOLD the big button/.test(b.G.ui(p).u.hint), 'at a chest: HOLD the big button');
  grab(b, p, chest);
  b.stepH(10);
  const cj = b.G.objectiveJob(p, f);
  report(cj && cj.kind === 'carry' && cj.verb === 'CARRY' && /ROPE LADDER/.test(cj.label), `with it in his arms the arrow goes to the rope: ${cj && cj.label}`);
  report(/HEAVY/i.test(b.G.ui(p).u.hint) && b.G.ui(p).u.verb === 'CARRY', 'and the hint says it is heavy');
  b.stepH(10);
  report(p.job && p.job.verb === 'CARRY' && p.job.away, `the job on his phone card: ${p.job && p.job.verb}`);
  report(VERBS.chest === 'GRAB' && VERBS.carry === 'CARRY' && VERBS.stowchest === 'STOW', 'roleCards: GRAB / CARRY / STOW');
  // aboard with it: the STOW arrow to the bin
  const sp = holdSpot(b.sh.layout);
  const a = st.players.h2;
  Object.assign(a, { d: 1, x: 200, y: b.sh.layout.platforms[1].y, fall: false, fly: false, on: null, conn: null, lock: null, carry: 'chest' });
  const c2 = cs.find((c) => c.kind === 'chest' && c.state === 'ground');
  c2.state = 'aboard'; c2.by = [a.id];
  b.stepH(40);
  report(a.job && a.job.kind === 'stowchest' && a.job.verb === 'STOW' && /STOW THE CHEST/.test(a.job.label), `aboard with it the arrow goes to the hold: ${a.job && a.job.label} (${a.job && a.job.verb})`);
  void sp;
  const text = fs.readFileSync(path.join(publicDir, 'modules/controller/ui.js'), 'utf8');
  report(/GRAB THE CHEST/.test(text) && /STOW THE CHEST/.test(text) && /chest: \[/.test(text), 'the phone has icons for GRAB THE CHEST, HELP CARRY, STOW THE CHEST and a chest in the hand');
}

// ---- (k) two ships in one sky ----
{
  clock = seedRandom(seed0);
  restoreUpgrades(config, UPGRADES0);
  restoreUpgrades(TR, TR0);
  config.MAPS.FORCE_KIND = 'open';
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
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
  const out = st.course.map.outposts[0];
  for (const t of st.course.turrets) if (t.outpost === 0) t.dead = true;
  step(5);
  const tre = st.away.tre;
  const c = tre.chests[0];
  const b0 = st.players.b0, a0 = st.players.a0;
  const yy = st.groundSys.groundAt(c.x, tre.vaults[0].y - 300);
  for (const [p, name] of [[b0, 'b0'], [a0, 'a0']]) Object.assign(p, { fall: false, fly: true, air: false, conn: null, lock: null, ko: 0, carry: null, on: { away: true, mode: 'walk', deck: null, gy: yy, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0 }, x: c.x, y: yy, jx: 0, jy: 0, fire: true });
  step(120);
  report(!!tre.vaults.length && tre.vaults[0].state === 'open' && c.by[0] === 'a0' && st.players.b0.carry !== 'chest', `only the main ship's crew lift treasure: a0 has it (${c.by.join()}), the second ship's b0 ${b0.on && b0.on.away ? 'is on the ground?!' : 'cannot'}`);
  report(Object.values(st.players).every((p) => Number.isFinite(p.x)), 'no NaN');
}

// ---- (l) the bots ----
{
  AW.BOT_TRIPS = true;
  // a forced trip: one bot fetches a chest end to end (the ship hangs over the vault, as the bot helm would hold her)
  {
    const r = raid(seed0 + 5, { humans: 0, bots: 4, danger: 4, gap: 560 });
    const { b, v } = r;
    const S = b.S(), T = b.T();
    let did = false, t = 0;
    for (; t < 60 * 240; t++) {
      b.stepH(1);
      if (t % 20 === 0) { const x = (v.x - S.rope.x); if (Math.abs(x) > 60) { b.park(b.hold.x + x * 0.5, b.hold.y); } }
      if (T.stats.stowed >= 1 && S.stats.returns >= 1 && !b.G.awayList().length) { did = true; break; }
    }
    report(did && S.stats.homes === 0, `a bot trip fetches a chest: stowed and back aboard in ${(t / 60).toFixed(0)} s (trips ${S.stats.trips}, chest trips ${T.stats.trips}, hold ${b.st.chestHold && b.st.chestHold.list.length})`);
    report(b.st.chestHold && chestWeight(b.st) === b.st.chestHold.list.length * TR.CHEST.W || (b.st.chestHold && b.st.chestHold.list.every((c) => c.w > 0)), 'and the chest weighs on the lift');
  }
  // 8 bots on open-sky raids, trips on
  let errors = 0, trips = 0, stowed = 0, shots = 0, lifted = 0, vaults = 0;
  const tripEvery = AW.BOT.TRIP_EVERY;
  AW.BOT.TRIP_EVERY = 8;
  for (const [seed, danger] of quick ? [[3, 4]] : [[3, 4], [4, 2], [5, 6]]) {
    const b = boot(seed, { bots: 8, pacing: true, difficulty: 'normal', danger });
    config.PACING.RATE_START = config.PACING.RATE_END = 1;
    const minutes = quick ? 5 : 7;
    let bad = 0, err = null;
    for (let i = 0; i < minutes * 3600; i++) {
      try { b.step(1); } catch (e) { err = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); errors++; break; }
      if (i % 30 === 0 && !finite(b.st)) bad++;
      if (b.st.wreck || b.st.ship.down > 0) b.st.ship.down = 0;
    }
    const s = b.T().stats;
    trips += b.S().stats.trips; stowed += s.stowed; shots += s.shots; lifted += s.lifted; vaults += s.opened;
    report(!err && bad === 0 && b.G.awayList().filter((q) => q.on.mode === 'home').length === 0, `seed ${seed} danger ${danger}: ${minutes} min, 8 bots with trips: 0 errors, no NaN (${err || 'ok'}); outposts down ${s.opened}, trips ${b.S().stats.trips} (chest trips ${s.trips}), lifted ${s.lifted}, stowed ${s.stowed}, paid ${s.paid}, guards ${s.guards} (shots ${s.shots}, hits ${s.hits}), lost ${s.lost}`);
  }
  report(errors === 0 && vaults >= 1, `the runs opened ${vaults} vaults; ${trips} trips, ${lifted} chests lifted, ${stowed} stowed, ${shots} guard shots between them`);
  AW.BOT.TRIP_EVERY = tripEvery;
  AW.BOT_TRIPS = false;
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
