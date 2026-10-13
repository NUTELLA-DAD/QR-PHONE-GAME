// THE AWAY TEAM gate (CASTLE.md package A0; ground.js, config.AWAY). Headless, seeded.
//   node tools/buildsim.mjs --check-away     or directly:  node tools/away-check.mjs [--seed 1] [--quick]
//
//   (a) the switch: ON by default, NO_AWAY=1 is the old game; bots make no trips unless AWAY.BOT_TRIPS; the ground is built from the ring map (a walkway and two wall ladders on every face)
//   (b) with fewer than MIN_CREW aboard there is no away team: no landing surface, no rope ladder action
//   (c) landing by PARACHUTE on a plaza: a person who falls onto the ground stands on it (a world object, player.on.away), the Action button is FIRE FLARE; a bot that drifts there does not stay
//   (d) landing by HOOKSHOT on rock: reeled in to a rock face he stands on top of it
//   (e) walking on the plaza (at WALK px/s, held at an edge, stepping off after EDGE_HOLD), climbing the wall ladder to the walkway and down again, JUMP off the wall
//   (f) the ROPE LADDER down and back up: the action on the lowest deck says what it can do (too high -> fly lower), lowers it within LADDER.REACH, he climbs down, steps off, walks back under it and climbs it to the hatch
//   (g) the FLARE calls the ship: a banner, a marker (state.away.pickups), PICK UP <name> on the helm man's phone, the bot helm flies over him and hovers, the ladder drops by itself
//   (h) the leash and the STRANDED rule: the ship far away -> STRANDED 40 s -> he walks home and is aboard again at the next dock for HOME.COST salvage; the stop ending with him on the ground holds the scorecard
//   (i) a man on the ground off screen has an edge porthole; (j) two ships in one sky: only the main ship has an away team
//   (k) 8 bots on a ring map for some minutes with AWAY.BOT_TRIPS: trips happen, bots come back, 0 errors
process.env.NO_ALARMS = '1'; // (the checks read the banner text right after an event: the old last-writer banner keeps it exact; the arbiter has its own gate)
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
const { createPortholes } = await load('modules/host/portholes.js');
const { toShipY, toWorldX, toWorldY } = await load('modules/host/pose.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const AW = config.AWAY;
const DT = 1 / 60;
const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
const UPGRADES0 = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]])));
const restoreUpgrades = (target, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreUpgrades(target[k], v); else target[k] = copyData(v); } };
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.VOYAGE.CURRICULUM.ENABLED = false;

// A fresh seeded sim on a ring map: people (h1 ...) and bots, the sky quiet (the scenarios put pacing back when they want enemies).
function boot(seed, o = {}) {
  clock = seedRandom(seed);
  restoreUpgrades(config, UPGRADES0);
  config.MAPS.FORCE_KIND = o.kind || 'ring';
  config.RING.FORCE_VARIANT = o.variant || 'fortress';
  config.PACING.RATE_START = config.PACING.RATE_END = o.pacing ? 1 : 0;
  const sim = createSimulation();
  const st = sim.state;
  st.difficulty = o.difficulty || 'easy';
  const e = st.ships[0].layout.boarderEntryPoints;
  const mk = (id, bot, i) => (st.players[id] = { id, bot, name: bot ? 'Bot' + (i + 1) : ['Mia', 'Joe', 'Ana', 'Raj'][i] || id, species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + (e[1].x - e[0].x) * ((i + 1) / 9), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true });
  for (let i = 0; i < (o.bots ?? 0); i++) mk('bot' + i, true, i);
  for (let i = 0; i < (o.humans ?? 0); i++) mk('h' + (i + 1), false, i);
  sim.castOff();
  const step = (n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); st.ship.hull = 100; } };
  step(60);
  const sh = st.ships[0], REF = sh.layout.refPoint;
  // Hold the ship where a test put her (nobody is flying her): park(x, y) puts her reference point at a world point.
  const hold = { x: null, y: null };
  const park = (x, y) => { hold.x = x; hold.y = y; sh.pose.x = x - REF.x; sh.pose.y = y - REF.y; st.ship.vy = 0; st.ship.speed = 0; };
  const stepH = (n = 1) => { for (let i = 0; i < n; i++) { if (hold.x != null) { sh.pose.x = hold.x - REF.x; sh.pose.y = hold.y - REF.y; st.ship.vy = 0; st.ship.speed = 0; } clock.ms += DT * 1000; sim.update(DT); st.ship.hull = 100; } };
  return { sim, st, sh, REF, step, stepH, park, hold, G: st.groundSys, S: st.away, map: () => st.course.map, ring: () => st.course.ring };
}
const faces = (m) => m.ring.faces;
const finite = (st) => Object.values(st.players).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(st.ships[0].pose.x) && Number.isFinite(st.ships[0].pose.y);

// ---- (a) the switch and the ground ----
{
  const { map, S, st } = boot(seed0, { humans: 3 });
  report(AW.ENABLED === true && AW.BOT_TRIPS === false, 'AWAY is on by default and the bots make no trips by default (NO_AWAY / AWAY_BOT_TRIPS not set)');
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(({config})=>console.log(JSON.stringify([config.AWAY.ENABLED, config.AWAY.BOT_TRIPS])))`], { encoding: 'utf8', env: { ...process.env, NO_AWAY: '1', AWAY_BOT_TRIPS: '1' } });
  report((r.stdout || '').trim() === '[false,true]', 'NO_AWAY=1 gives the old game (ENABLED false); AWAY_BOT_TRIPS=1 turns the bot trips on: ' + (r.stdout || r.stderr || '').trim().slice(0, 40));
  const m = map();
  const walls = faces(m).filter((f) => f.walk);
  report(m.kind === 'ring' && S.decks.length === walls.length && walls.length === 4 && S.ladders.length === 2 * walls.length, `the fortress's ground: a walkway on each of ${S.decks.length} faces, ${S.ladders.length} wall ladders (two a face)`);
  report(S.ladders.every((l) => l.y1 > l.y0 && l.y1 === faces(m)[l.face].y) && S.decks.every((d) => d.y < faces(m)[d.face].y), 'every wall ladder runs from the walkway down to the plaza');
  void st;
}

// ---- (b) fewer than MIN_CREW: no away team ----
{
  const small = boot(seed0, { humans: 2 });
  const f = faces(small.map())[0];
  small.park(f.x + 900, f.y - 700);
  small.step(30);
  report(small.S.on === false && small.sh.sim.air.surfaces().every((s) => !String(s.id).startsWith('ground:')), `2 crew aboard: the away team is off (no landing surfaces)`);
  const sp = small.G.ropeSpot();
  const p = small.st.players.h1;
  small.sim.state.players.h1.fall = false;
  Object.assign(p, { d: sp.d, x: sp.x, y: small.sh.layout.platforms[sp.d].y, fall: false, conn: null });
  small.step(10);
  report(small.G.ladderAction(p, false) === null && !(p.act && /ROPE/i.test(p.act.label || '')), 'with 2 crew the lowest deck offers no rope ladder');
  const full = boot(seed0, { humans: 3 });
  const f2 = faces(full.map())[0];
  full.park(f2.x + 900, f2.y - 700);
  full.step(30);
  report(full.S.on === true && full.sh.sim.air.surfaces().some((s) => String(s.id).startsWith('ground:wall')), '3 crew aboard: the away team is on (the castle walkways are landing surfaces)');
}

// Put a person in free flight over a world point, falling slowly.
function flyOver(b, p, x, y, vy = 120, chute = false) {
  p.fall = false;
  p.conn = null;
  p.lock = null;
  p.d = p.d ?? 1;
  b.sh.sim.air.startFlight(p, 0, 0);
  p.x = x;
  p.y = y;
  p.fvx = 0;
  p.fvy = vy;
  p.lsy = p.apex = toShipY(b.sh, y);
  if (chute) { p.chute = 1; p.chuteOpen = true; }
}

// A person drops from a ship parked 2400 px to one side (clear of her decks) onto the ground at x: returns once he stands there.
function landMan(b, p, x, f, chute = true) {
  b.park(x - 2400, f.y - 700);
  b.stepH(20);
  flyOver(b, p, x, f.y - 300, 60, chute);
  for (let i = 0; i < 400 && !p.on; i++) b.stepH(1);
  return !!p.on;
}

// ---- (c) the parachute on a plaza ----
{
  const b = boot(seed0, { humans: 3 });
  const { st, G, S } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
  const p = st.players.h1;
  let n = 0;
  landMan(b, p, px, f);
  b.stepH(3);
  report(!!p.on && p.on.away && p.on.mode === 'walk' && p.fly && Math.abs(p.y - f.y) < 2 && Math.abs(p.x - px) < 60, `a parachute lands on the plaza: he stands on the ground (on.away, y ${p.y && p.y.toFixed(0)} = platform ${f.y}, after ${n} steps)`);
  report(p.act && p.act.type === 'flare' && p.act.label === 'FIRE FLARE', `the Action button is FIRE FLARE (${p.act && p.act.label})`);
  report(S.stats.landings === 1 && finite(st), 'the landing is counted, nothing is NaN');
  // the soft landing under a canopy: no hearts lost
  report(p.hearts === undefined || p.hearts >= config.HEALTH.MAX, 'a parachute landing hurts nothing');
  // the crew cannon: a man shot out of it (p.cannon, no canopy) lands on the plaza too
  const cn = boot(seed0, { humans: 3 });
  const cf = faces(cn.map())[0], cpx = (cf.plazas[0].x0 + cf.plazas[0].x1) / 2, cm = cn.st.players.h2;
  cn.park(cpx - 2400, cf.y - 700);
  cn.stepH(20);
  flyOver(cn, cm, cpx, cf.y - 300, 400, false);
  cm.cannon = true;
  for (let i = 0; i < 400 && !cm.on; i++) cn.stepH(1);
  report(!!cm.on && cm.on.away && !cm.cannon && Math.abs(cm.y - cf.y) < 2, 'a man fired from the crew cannon lands on the plaza and stands there');
  // a bot that drifts there does not stay
  const bot = boot(seed0, { humans: 2, bots: 1 });
  const bf = faces(bot.map())[0], bpx = (bf.plazas[0].x0 + bf.plazas[0].x1) / 2;
  bot.park(bpx - 2400, bf.y - 700);
  bot.stepH(30);
  const bb = bot.st.players.bot0;
  flyOver(bot, bb, bpx, bf.y - 300, 60, true);
  for (let i = 0; i < 400 && bb.fly; i++) bot.stepH(1);
  report(!bb.on && bb.fall !== undefined, `a bot that drifts down onto the plaza does not stay there (on ${bb.on ? 'yes' : 'no'}, fall ${bb.fall})`);
}

// ---- (d) the hookshot on rock ----
{
  const b = boot(seed0, { humans: 3 });
  const { st } = b;
  const m = b.map(), f = faces(m)[0], px = f.x - 1200;
  b.park(px - 2400, f.y - 700);
  b.stepH(20);
  const p = st.players.h1;
  flyOver(b, p, px, f.y - 600, 0);
  p.carry = 'hookshot';
  p.jx = 0;
  p.jy = 1; // straight down
  p.fvy = 0;
  p.atkQ = true;
  b.stepH(1);
  p.jy = 0;
  let hooked = false;
  for (let i = 0; i < 120 && !hooked; i++) { b.stepH(1); hooked = !!(p.hook && p.hook.phase === 'caught'); }
  report(hooked && p.hook.anchor.kind === 'rock', `a hookshot cast down at the plaza catches on rock (${p.hook && p.hook.anchor && p.hook.anchor.kind})`);
  p.fire = true; // hold Action: reel in
  for (let i = 0; i < 600 && !(p.on && p.on.away); i++) b.stepH(1);
  p.fire = false;
  report(!!p.on && p.on.away && Math.abs(p.y - f.y) < 3, `reeled in to the rock he stands on top of it (y ${p.y.toFixed(0)}, ground ${f.y})`);
}

// ---- (e) walking, the edge, the wall ladder ----
{
  const b = boot(seed0, { humans: 3 });
  const { st, S, G } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0];
  const lad = S.ladders.find((l) => l.face === 0 && l.x < f.x);
  b.park(f.x - 2800, f.y - 1300);
  b.stepH(20);
  const p = st.players.h1;
  flyOver(b, p, lad.x + 300, f.y - 80, 100, true);
  for (let i = 0; i < 200 && !p.on; i++) b.stepH(1);
  report(!!p.on && p.on.mode === 'walk' && !p.on.deck, 'landed on the plaza beside the wall ladder');
  const x0 = p.x;
  p.jx = -1;
  b.stepH(60);
  report(Math.abs((x0 - p.x) - AW.WALK) < 12, `the stick walks him at ${AW.WALK} px/s (moved ${(x0 - p.x).toFixed(0)} px in a second)`);
  p.jx = Math.sign(lad.x - p.x);
  for (let i = 0; i < 400 && Math.abs(p.x - lad.x) > 20; i++) b.stepH(1);
  p.jx = 0;
  p.jy = -1;
  b.stepH(5);
  report(p.on.mode === 'ladder' && p.climb, 'at the foot of the wall ladder, stick UP: he climbs it');
  for (let i = 0; i < 400 && p.on.mode === 'ladder'; i++) b.stepH(1);
  p.jy = 0;
  report(p.on.mode === 'walk' && p.on.deck && Math.abs(p.y - p.on.deck.y) < 2, `at the top he walks the curtain wall (y ${p.y.toFixed(0)}, walkway ${p.on.deck && p.on.deck.y})`);
  const deck = p.on.deck;
  p.jx = 1;
  b.stepH(600);
  report(p.x <= deck.x1 + 0.5 && p.x >= deck.x1 - 40, `the walkway ends at its ends (x ${p.x.toFixed(0)} of ${deck.x1})`);
  p.jx = 0;
  // back down the other ladder
  const lad2 = S.ladders.find((l) => l.deck === deck && l.x > f.x);
  p.jx = -1;
  for (let i = 0; i < 400 && p.x > lad2.x; i++) b.stepH(1);
  p.jx = 0;
  p.jy = 1;
  b.stepH(5);
  report(p.on.mode === 'ladder', 'on the wall, stick DOWN at a ladder: he climbs down');
  for (let i = 0; i < 400 && p.on.mode === 'ladder'; i++) b.stepH(1);
  p.jy = 0;
  report(p.on.mode === 'walk' && !p.on.deck && Math.abs(p.y - f.y) < 3, 'and stands on the plaza again');
  // the edge: walk right to the platform's end; held, then he steps off
  p.jx = 1;
  let held = 0;
  for (let i = 0; i < 1500 && p.on; i++) { b.stepH(1); if (p.on && p.on.edgeT > 0) held = p.on.edgeT; }
  p.jx = 0;
  report(held > 0 && !p.on && p.fly, `at the platform's edge he is held ${held.toFixed(2)} s, then steps off into the air (chute button ${p.chuteOk})`);
  // JUMP off the wall
  const b2 = boot(seed0 + 1, { humans: 3 });
  const f3 = faces(b2.map())[0], l3 = b2.S.ladders.find((l) => l.face === 0);
  b2.park(f3.x - 2800, f3.y - 1300);
  b2.stepH(20);
  const q = b2.st.players.h1;
  flyOver(b2, q, l3.x, l3.deck ? l3.deck.y - 200 : f3.y - 800, 100, true);
  for (let i = 0; i < 300 && !q.on; i++) b2.stepH(1);
  report(!!q.on && q.on.deck && q.on.mode === 'walk', `a parachute can land on the wall walkway itself (stats wall ${b2.S.stats.wall})`);
  q.jumpQ = true;
  b2.stepH(2);
  report(!q.on && q.fly && q.fvy < 0, 'JUMP on the wall leaps off it');
}

// ---- (f) the rope ladder ----
{
  const b = boot(seed0, { humans: 3 });
  const { st, G, S, sh } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
  const sp = G.ropeSpot();
  const p = st.players.h1;
  const place = () => Object.assign(p, { d: sp.d, x: sp.x, y: sh.layout.platforms[sp.d].y, fall: false, fly: false, on: null, conn: null, lock: null, carry: null });
  b.park(px, f.y - 1900); // too high
  b.stepH(30);
  place();
  b.stepH(20);
  report(p.act && p.act.type === 'need' && /fly lower/i.test(p.act.label), `too high for the ladder: the hatch says "${p.act && p.act.label}"`);
  b.park(px, f.y - 700);
  b.stepH(20);
  place();
  b.stepH(20);
  report(p.act && p.act.type === 'ladder' && /LOWER THE ROPE LADDER/.test(p.act.label) && S.rope.gap <= AW.LADDER.REACH, `within reach (${S.rope.gap.toFixed(0)} px): the hatch says "${p.act && p.act.label}"`);
  p.actQ = true;
  b.stepH(2);
  report(S.rope.out && p.on && p.on.mode === 'rope' && S.rope.len > 100, `Action lowers the ladder (${S.rope.len.toFixed(0)} px) and he is on it`);
  p.jy = 1;
  for (let i = 0; i < 900 && p.on && p.on.mode === 'rope' && p.on.s < S.rope.len - 1; i++) b.stepH(1);
  b.stepH(2);
  p.jy = 1;
  b.stepH(10);
  p.jy = 0;
  report(!!p.on && p.on.mode === 'walk' && Math.abs(p.y - f.y) < 8, `down the rope and off its foot onto the plaza (y ${p.y.toFixed(0)})`);
  // walk under the rope and climb it back
  p.jx = Math.sign(S.rope.x - p.x) || 1;
  for (let i = 0; i < 300 && Math.abs(p.x - S.rope.x) > 20; i++) { p.jx = Math.sign(S.rope.x - p.x); b.stepH(1); }
  p.jx = 0;
  p.jy = -1;
  b.stepH(3);
  report(p.on && p.on.mode === 'rope', 'stick UP under the foot of the rope: he takes hold');
  for (let i = 0; i < 1500 && p.on; i++) b.stepH(1);
  p.jy = 0;
  report(!p.on && !p.fly && p.d === sp.d && Math.abs(p.x - sp.x) < 5, `climbed to the hatch: back aboard on the lowest deck (d ${p.d}, x ${p.x.toFixed(0)})`);
  // the rope is drawn up when nobody is on it
  b.stepH(Math.round((AW.LADDER.KEEP + 2) * 60));
  report(!S.rope.out, `the ladder is drawn up ${AW.LADDER.KEEP} s after the last man leaves it`);
}

// ---- (g) the flare calls the ship ----
{
  const b = boot(seed0, { humans: 3, bots: 3 });
  const { st, G, S, sh } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
  const p = st.players.h1;
  landMan(b, p, px + 200, f);
  b.stepH(5);
  p.actQ = true;
  b.stepH(2);
  report(S.flares.length === 1 && S.pickups.length === 1 && S.pickups[0].name === p.name, `FIRE FLARE lights a flare and calls for a pickup (${S.pickups.length} pickup, ${S.flares.length} flare)`);
  report(/FLARE/.test(st.ev.warnText) && /MIA/.test(st.ev.warnText), `the TV banner says it: "${st.ev.warnText}"`);
  report(p.on.flareCd > 0 && p.act.type === 'wait', `the flare has a cool-down (${p.on.flareCd.toFixed(0)} s: the button waits)`);
  // the helm man's phone: PICK UP
  const helm = st.players.h2;
  helm.fall = false;
  const hs = sh.layout.one('helm');
  Object.assign(helm, { d: hs.d, x: hs.x, y: sh.layout.platforms[hs.d].y, lock: hs.n, fly: false });
  b.stepH(30);
  report(helm.job && helm.job.kind === 'pickup' && /PICK UP MIA/.test(helm.job.label) && !!(helm.ui || helm.uk), `the helm man's phone says "${helm.job && helm.job.label}"`);
  { // the alarm arbiter (on, as in the game): the flare's banner is for the helm's phone (state.say kind 'away', at { role: 'helm' })
    config.ALARMS.ENABLED = true;
    st.alarmClear();
    p.on.flareCd = 0;
    p.actQ = true;
    b.stepH(2);
    const line = st.alarmPhone(helm, 'helm'), other = st.alarmPhone(st.players.bot1, 'gun');
    report(/PICK UP MIA/.test(line) && !/PICK UP/.test(other || ''), `the arbiter gives the helm's phone the alarm "${line}" and a gunner's phone none`);
    config.ALARMS.ENABLED = false;
  }
  helm.lock = null;
  helm.d = 1;
  // the bot helm comes and hovers: the ship starts 2400 px off and 1500 px high, nobody else flying her
  b.hold.x = null;
  b.hold.y = null;
  sh.pose.x = (px - 2300) - b.REF.x;
  sh.pose.y = (f.y - 1500) - b.REF.y;
  st.ship.speed = 0.3;
  st.ship.order = 0.3;
  const botHelm = st.players.bot0;
  botHelm.fall = false;
  Object.assign(botHelm, { d: hs.d, x: hs.x, y: sh.layout.platforms[hs.d].y, lock: hs.n, fly: false });
  const d0 = Math.abs(toWorldX(sh, G.ropeSpot().x) - p.x);
  let t = 0;
  p.on.flareT = 200; // (a long flare for the test)
  S.rope.out = false;
  S.rope.idle = 99;
  for (; t < 60 * 90 && !S.rope.out; t++) { b.step(1); if (p.on) p.on.strand = 0; }
  const d1 = Math.abs(toWorldX(sh, G.ropeSpot().x) - p.x);
  report(S.rope.out && d1 < 700, `the bot helm flew over the flare (${d0.toFixed(0)} px away -> ${d1.toFixed(0)} px) and the ladder dropped by itself after ${(t / 60).toFixed(0)} s`);
  report(S.rope.gap <= AW.LADDER.REACH, `she hovers low enough for the ladder (${S.rope.gap.toFixed(0)} px)`);
}

// ---- (h) the leash, STRANDED, the walk home, the stop that ends ----
{
  const b = boot(seed0, { humans: 3 });
  const { st, G, S, sh, sim } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
  const p = st.players.h1;
  landMan(b, p, px, f);
  const salvage0 = st.run.salvage = 100;
  b.park(px + AW.STRAND.LEASH + 800, f.y - 900); // the ship leaves
  b.stepH(30);
  report(p.on.gone === true && p.on.strand > 0 && /STRANDED/.test(st.ev.warnText || ''), `the ship leaves: STRANDED (${p.on.strand.toFixed(1)} s, banner "${st.ev.warnText}")`);
  const ui = G.ui(p);
  report(ui && ui.u.left > 0 && ui.u.left <= AW.STRAND.TIME && /STRANDED/.test(ui.status), `his phone shows the countdown ("${ui && ui.status}")`);
  // a flare starts the clock again
  b.stepH(60 * 20);
  const mid = p.on.strand;
  p.on.flareCd = 0;
  p.actQ = true;
  b.stepH(2);
  report(mid > 15 && p.on.strand < 2, `a flare starts the clock again (${mid.toFixed(0)} s -> ${p.on.strand.toFixed(1)} s)`);
  b.stepH(60 * (AW.STRAND.TIME + 2));
  report(p.on && p.on.mode === 'home' && S.stats.homes === 1 && /WALKED HOME/.test(st.ev.warnText || '') || (p.on && p.on.mode === 'home'), `after ${AW.STRAND.TIME} s he walks home (mode ${p.on && p.on.mode}); nobody died of it (hearts ${p.hearts})`);
  report(G.onGround().length === 0 && Number.isFinite(p.x) && Number.isFinite(p.y), 'a man who walked home is off the ground list and nobody else is touched');
  const before = st.run.salvage;
  sim.startDock();
  report(!p.on && !p.fly && p.d != null && st.run.salvage === Math.max(0, before - AW.HOME.COST), `at the dock he is aboard again and the ship pays ${AW.HOME.COST} salvage (${before} -> ${st.run.salvage})`);
  void salvage0;
}
{
  // the stop ends with him on the ground: the scorecard waits, STRANDED, then goes on
  const b = boot(seed0, { humans: 3 });
  const { st, G, S, sim } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
  const p = st.players.h1;
  landMan(b, p, px, f);
  sim.onMarker({ kind: 'home', lap: 2 });
  report(!st.scorecard && !!S.hold, 'the stop ends with a man on the ground: the scorecard waits (held)');
  b.stepH(30);
  report(p.on.strand > 0 && /STRANDED/.test(st.ev.warnText || ''), 'and he is STRANDED');
  b.stepH(60 * (AW.STRAND.TIME + 2));
  report(!S.hold && !!st.scorecard && p.on && p.on.mode === 'home', 'after STRAND.TIME s he walks home and the scorecard goes on');
  // a man who gets back up in time: released at once
  const c = boot(seed0, { humans: 3 });
  const cf = faces(c.map())[0], cpx = (cf.plazas[0].x0 + cf.plazas[0].x1) / 2;
  const q = c.st.players.h1;
  landMan(c, q, cpx, cf);
  c.park(cpx, cf.y - 700);
  c.stepH(10);
  c.sim.onMarker({ kind: 'home', lap: 2 });
  c.G.lowerRope(q);
  c.stepH(5);
  q.jx = Math.sign(c.S.rope.x - q.x);
  for (let i = 0; i < 400 && Math.abs(q.x - c.S.rope.x) > 15; i++) { q.jx = Math.sign(c.S.rope.x - q.x); c.stepH(1); }
  q.jx = 0;
  q.jy = -1;
  for (let i = 0; i < 1800 && q.on; i++) c.stepH(1);
  q.jy = 0;
  c.stepH(5);
  report(!q.on && !c.S.hold && !!c.st.scorecard && c.st.scorecard.t > 0, 'a man who climbs the rope in time lets the scorecard go on at once');
}

// ---- (i) the edge porthole ----
{
  const b = boot(seed0, { humans: 3 });
  const { st, S } = b;
  const m = b.map(), f = faces(m)[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
  const p = st.players.h1;
  landMan(b, p, px, f);
  b.park(px, f.y - 700);
  b.stepH(10);
  const P = createPortholes({ state: st });
  const mid = [toWorldX(b.sh, b.sh.layout.midPoint.x), toWorldY(b.sh, b.sh.layout.midPoint.y)];
  const view = { cx: mid[0], cy: mid[1], zoom: 0.5 };
  let plan = P.plan({ view, w: 1600, h: 900, dt: 0.1, tier: 'high', mode3d: false });
  report(plan.items.every((it) => it.sub !== 'MIA'), 'a man on screen has no porthole');
  b.park(px - 3200, f.y - 700); // the ship moves off: he is far off screen to the right
  b.stepH(10);
  const view2 = { cx: toWorldX(b.sh, b.sh.layout.midPoint.x), cy: toWorldY(b.sh, b.sh.layout.midPoint.y), zoom: 0.5 };
  for (let i = 0; i < 8; i++) plan = P.plan({ view: view2, w: 1600, h: 900, dt: 0.1, tier: 'high', mode3d: false });
  const it = plan.items.find((q) => q.sub === 'MIA');
  report(!!it && it.ring === 'friend' && it.a > 0 && it.x > 800, `an away man off screen gets a friendly edge porthole (${it ? it.sub + ' ' + it.label : 'none'})`);
  void S;
}

// ---- (i2) the rock of an open-sky map: the outposts' hills are ground too ----
{
  const b = boot(seed0, { humans: 3, kind: 'open' });
  const { st, G, S } = b;
  const m = b.map();
  report(m.kind === 'open' && m.open && !m.ring && S.decks.length === 0, `an outpost map: open sky, no castle walkways (${m.kind}), the rock is the ground`);
  const y0 = m.start.y;
  let gx = null;
  for (let x = m.start.x + 2500; x < m.start.x + 12000 && gx == null; x += 100) if (G.groundAt(x, y0 - 600) != null && G.groundAt(x + 400, y0 - 600) != null) gx = x;
  const gy = G.groundAt(gx, y0 - 600);
  b.park(gx - 2400, gy - 900);
  b.stepH(30);
  const p = st.players.h1;
  flyOver(b, p, gx, gy - 400, 80, true);
  for (let i = 0; i < 500 && !p.on; i++) b.stepH(1);
  report(!!p.on && p.on.away && Math.abs(p.y - gy) < 3, `a parachute lands on the hill (y ${p.y && p.y.toFixed(0)}, ground ${gy})`);
  let maxDy = 0;
  p.jx = 1;
  const y1 = p.y;
  for (let i = 0; i < 360 && p.on; i++) { b.stepH(1); if (p.on) maxDy = Math.max(maxDy, Math.abs(p.y - y1)); }
  p.jx = 0;
  const ground = p.on ? G.groundAt(p.x, p.y - 60) : null;
  report(!p.on || (ground != null && Math.abs(p.y - ground) < 12), `walking on the hill: he follows the ground (${p.on ? 'y ' + p.y.toFixed(0) + ', ground ' + ground : 'stepped off an edge'}; most height change ${maxDy.toFixed(0)} px)`);
}

// ---- (j) two ships in one sky ----
{
  clock = seedRandom(seed0);
  restoreUpgrades(config, UPGRADES0);
  config.MAPS.FORCE_KIND = 'ring';
  config.RING.FORCE_VARIANT = 'fortress';
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
  const sim = createSimulation();
  const { loadBuild: lb } = await import('./buildload.mjs');
  const parts = await lb('bags', BUILDS);
  const second = sim.addShip(parts);
  const st = sim.state, A = st.ships[0];
  const e = A.layout.boarderEntryPoints, e2 = second.layout.boarderEntryPoints;
  for (let i = 0; i < 3; i++) st.players['a' + i] = { id: 'a' + i, bot: false, name: 'A' + i, species: config.CREW_SPECIES[0], color: colors[i], x: e[0].x + 30 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  st.players.b0 = { id: 'b0', bot: false, name: 'B0', ship: second.id, species: config.CREW_SPECIES[0], color: colors[4], x: e2[0].x, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  sim.castOff();
  const step = (n) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };
  step(120);
  const m = st.course.map, f = m.ring.faces[0], px = (f.plazas[0].x0 + f.plazas[0].x1) / 2, REF = A.layout.refPoint;
  const hold = () => { A.pose.x = px - REF.x; A.pose.y = f.y - 700 - REF.y; A.state.vy = 0; A.state.speed = 0; };
  hold();
  step(5);
  const surfA = A.sim.air.surfaces().some((s) => String(s.id).startsWith('ground:')), surfB = second.sim.air.surfaces().some((s) => String(s.id).startsWith('ground:'));
  report(st.away.on && surfA && !surfB, 'two ships: the main ship has the ground to land on, the second ship has none');
  // a crewman of the second ship falling over the plaza is not an away man
  const q = st.players.b0;
  second.sim.air.startFlight(q, 0, 0);
  q.fall = false;
  q.x = px;
  q.y = f.y - 200;
  q.fvx = 0;
  q.fvy = 80;
  q.lsy = q.apex = q.y - second.pose.y;
  for (let i = 0; i < 400; i++) { hold(); step(1); }
  report(!q.on && st.groundSys.awayList().length === 0, 'a crewman of the second ship is never an away man');
  // an away man of the main ship stays his own ship's whatever the second does
  const p = st.players.a0;
  A.sim.air.startFlight(p, 0, 0);
  p.fall = false;
  p.x = px;
  p.y = f.y - 200;
  p.fvx = 0;
  p.fvy = 80;
  p.lsy = p.apex = p.y - A.pose.y;
  p.chute = 1; p.chuteOpen = true;
  for (let i = 0; i < 400 && !p.on; i++) { hold(); step(1); }
  report(!!p.on && p.on.away && (!p.ship || p.ship === A.id), 'a crewman of the main ship lands and is away');
  for (let i = 0; i < 300; i++) { hold(); step(1); }
  report(Number.isFinite(p.x) && Number.isFinite(second.pose.x) && st.groundSys.awayList().length === 1, 'two ships keep flying with an away man on the ground: no NaN, one away man');
}

// ---- (k) the bots: a trip, and 8 bots on a ring map with trips ----
{
  config.AWAY.BOT_TRIPS = true;
  // a forced trip: the ship hangs 600 px over a plaza; one bot walks to the hatch, lowers the ladder, climbs down, walks to the plaza's middle, looks round, fires a flare, walks back under the rope and climbs it
  {
    const b = boot(seed0, { bots: 4, humans: 0, variant: 'fortress' });
    const { st, G, S } = b;
    const f = faces(b.map())[0], pz = f.plazas[0], px = (pz.x0 + pz.x1) / 2;
    b.park(px - 400, f.y - 640);
    let t = 0, minDown = 1e9, flaredAt = -1, away = false;
    for (; t < 60 * 120 && !(S.stats.returns >= 1 && S.stats.trips >= 1); t++) {
      b.stepH(1);
      if (G.awayList().length) { away = true; if (S.stats.flares && flaredAt < 0) flaredAt = t; }
    }
    const trip = Object.values(st.players).find((q) => q.bot && q.trip);
    report(S.stats.trips === 1 && S.stats.ropes >= 1 && away && S.stats.flares === 1 && S.stats.returns === 1 && !trip && G.awayList().length === 0, `a bot trip: down the rope (${S.stats.ropeDown}), a flare (${S.stats.flares}), up the rope (${S.stats.ropeUp}) and back aboard in ${(t / 60).toFixed(0)} s, trips ${S.stats.trips}, returns ${S.stats.returns}`);
    report(S.stats.ropeUp >= 1 && S.stats.homes === 0, 'he climbed home, he was not taken home (' + S.stats.ropeUp + ' climbs)');
    void minDown;
  }
  const minutes = quick ? 4 : 6;
  let trips = 0, errors = 0;
  for (const [variant, seed] of quick ? [['fortress', 3]] : [['fortress', 3], ['citadel', 4], ['tower', 5]]) {
    const b = boot(seed, { bots: 8, variant, pacing: true, difficulty: 'normal' });
    const { st, S } = b;
    config.PACING.RATE_START = 1; config.PACING.RATE_END = 1;
    let bad = 0, awayMax = 0, err = null;
    for (let i = 0; i < minutes * 3600; i++) {
      try { b.step(1); } catch (e) { err = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); errors++; break; }
      if (i % 30 === 0) { if (!finite(st)) bad++; awayMax = Math.max(awayMax, b.G.awayList().length); }
      if (st.wreck || st.ship.down > 0) st.ship.down = 0;
    }
    trips += S.stats.trips;
    const homeBots = Object.values(st.players).filter((q) => q.bot && q.on && q.on.away && q.on.mode === 'home').length;
    report(!err && bad === 0, `${variant}: ${minutes} min, 8 bots with trips: 0 errors, no NaN (${err || 'ok'})`);
    report(homeBots === 0 && S.stats.homes === 0, `${variant}: trips ${S.stats.trips}, flares ${S.stats.flares}, ropes ${S.stats.ropes}, returns ${S.stats.returns}, most away at once ${awayMax}; bots never strand (walked home ${S.stats.homes})`);
  }
  report(errors === 0 && (quick || trips >= 1), `the free runs made ${trips} trip${trips === 1 ? '' : 's'} between them`);
  config.AWAY.BOT_TRIPS = false;
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
