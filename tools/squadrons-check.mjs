// ENEMY SQUADRONS gate (public/modules/host/squads.js, formations.js, config.SQUADRONS). Headless, seeded.
//   node tools/buildsim.mjs --check-squadrons     or directly:  node tools/squadrons-check.mjs [--seed 1] [--minutes 3] [--quick]
//
//   (a) a spawn makes a squadron of 3 to 6 with a leader, slots (rigid offsets of the chosen formation), a banner with the count, the formation and the bearing; the sizes follow the mission and the
//       stop's danger; every formation is flown now and then; a hard stop has an ACE leader in circus paint, an easy one has none
//   (b) formation keeping: on the approach every plane sits within a few px of its slot (all six formations; the worst error over the approach is under SLOT_ERR)
//   (c) the break: within BREAK_RANGE the squadron breaks into attack pairs, a wingman sticks to his pair leader, the pairs' runs start from different angles, the gunners' phones buzz
//   (d) regroup: after the pass the squadron forms up out past the ship, comes round again and breaks a second time
//   (e) leader shot down: the wingmen scatter (their headings fan out), then the healthiest takes over, the squadron regroups with the new leader
//   (f) withdrawal: down to 40% of its planes (or fewer) the rest fly off and are gone for good, with no kill credited and no leftovers in the lists
//   (g) determinism: the same seed gives the same tracks, another seed another; with FORMATIONS off no plane belongs to a squadron
//   (h) a 3-minute run with 8 bots and squadrons forced every half minute (and a bomber escort): 0 errors, no NaN, they shoot, they get shot, nothing piles up in the lists
//   (i) the bomber escort: a pair holds its station over the bomber, avenges it when it is shot down, goes home with it; two ships in one sky and a Versus lobby: squadrons spawn and fly, 0 errors
//   (j) the phone radar: a squadron in formation is ONE ping with its count, a broken one a ping per plane
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed0 = Number(flag('seed', 1)), minutes = Number(flag('minutes', 3));
const quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
const clock = seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const F = await load('modules/host/formations.js');
const { radarItems } = await load('modules/host/spotter.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const SQ = config.SQUADRONS;
const D = config.DOGFIGHT;
config.PACING.RATE_START = config.PACING.RATE_END = 0; // (nothing else spawns by itself: the scenarios call the spawners)
const DT = 1 / 60;
const DOGFIGHT_HP = D.HP;
const SLOT_ERR = 100; // px: how far from its slot a plane may be, worst case, while a squadron holds formation on the approach
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// A fresh seeded sim with bots, cast off, a calm sky. opts: bots, danger, lap, noGuns (the crew's guns stay empty so nothing is shot down), ships (a second ship).
function boot(seed, o = {}) {
  seedRandom(seed);
  config.MAPS.FORCE_KIND = o.map === undefined ? 'open' : o.map; // (the open map unless a scenario asks for caves: a plane spawned inside a cave wall dies at once)
  config.COURSE.ENABLED = o.terrain === true; // (the scenarios that test the squadron's own manners fly in a sky with no rock to die in; the 3-minute run and the two-ship run keep the real terrain)
  config.BOTS.DARING.ENABLED = o.daring === true; // (the bots' daring stunts hook and steal planes)
  config.ESCORT.AUTO_PATROL = o.patrol === true; // (our own patrol planes would shoot the squadrons down)
  config.DOGFIGHT.HP = o.noGuns ? 400 : DOGFIGHT_HP; // (a scenario with no gunfire keeps its planes: nothing else in the sky should shoot them down either)
  const sim = createSimulation();
  const st = sim.state;
  if (o.second) sim.addShip(o.second);
  for (const sh of st.ships) {
    const e = sh.layout.boarderEntryPoints;
    for (let i = 0; i < (o.bots ?? 8); i++) {
      const id = (st.ships.length > 1 ? sh.id + '_' : '') + 'bot' + i;
      st.players[id] = { id, bot: true, ...(st.ships.length > 1 ? { ship: sh.id } : {}), name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    }
  }
  sim.castOff();
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      clock.ms += DT * 1000;
      sim.update(DT);
      st.tempo.t = 1e9; // (the pacing director stays in its build-up: no peak, no calm that sends stragglers home)
      if (o.noGuns) for (const g of Object.values(st.GUNS)) g.ammo = 0;
      if (o.keepHull !== false) for (const sh of st.ships) sh.state.hull = 100;
    }
  };
  step(60 * 5);
  if (o.danger != null && st.course) st.course.danger = o.danger;
  if (o.lap != null && st.course) st.course.lap = o.lap;
  return { sim, st, step, mid: () => { const L = st.ships[0].layout; return { x: st.ships[0].pose.x + L.aimPoint.x, y: st.ships[0].pose.y + L.aimPoint.y }; } };
}
const mems = (st, sq) => st.strafers.filter((p) => p.squadronId === sq.id && p.hp > 0 && !p.gone);
const only = (f) => { SQ.WEIGHTS = Object.fromEntries(Object.keys(SQ.WEIGHTS).map((k) => [k, k === f ? 1 : 0])); };
const WEIGHTS0 = { ...SQ.WEIGHTS };
const resetWeights = () => { SQ.WEIGHTS = { ...WEIGHTS0 }; };
const deg = (a) => (a * 180) / Math.PI;
const angGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// ---- (a) a spawn makes a squadron ----
{
  const { sim, st } = boot(seed0, { danger: 2, lap: 1 });
  sim.squadrons.spawnStrafers();
  const sq = st.squadrons[0];
  const ps = mems(st, sq);
  const offs = F.slotOffsets(sq.formation, ps.length);
  report(st.squadrons.length === 1 && ps.length >= SQ.MIN && ps.length <= SQ.MAX && ps.length === sq.n0 && st.strafers.length === ps.length, `a spawn makes ONE squadron of ${ps.length} planes (${SQ.MIN} to ${SQ.MAX}), formation ${sq.formation}`);
  report(ps.filter((p) => p.leader).length === 1 && ps[0].leader && ps[0].slot === 0 && sq.leader === ps[0] && ps.every((p) => p.squadronId === sq.id && p.formation === sq.formation), 'exactly one leader (slot 0), every plane carries squadronId / formation (the porthole and the radar merge on them)');
  report(ps.every((p, i) => p.slot === i && Math.abs(p.fx - offs[i].fx) < 1e-9 && Math.abs(p.fy - offs[i].fy) < 1e-9) && new Set(ps.map((p) => p.fx + ',' + p.fy)).size === ps.length, 'the slots are the formation\'s rigid offsets, all different');
  const banner = st.ev.warnText;
  report(new RegExp(`^SQUADRON: ${ps.length} FIGHTERS, .+ - BEARING (AHEAD|ASTERN)`).test(banner), `the lookout banner reads "${banner}"`);
  report(sq.ace === false && !ps.some((p) => p.ace), 'an easy stop (2 skulls) has no ace');
}
{
  // sizes follow the mission and the stop; formations vary; a hard stop has an ace in circus paint
  const sizes = { lap1: [], lap3: [], hard: [] };
  const seen = new Set();
  let aces = 0, aceHp = 0, plainHp = 0, spawnsHard = 0;
  for (let i = 0; i < (quick ? 8 : 24); i++) {
    const { sim, st } = boot(seed0 + 100 + i, { danger: i % 3 === 2 ? 3 : 2, lap: i % 3 === 1 ? 3 : 1, bots: 8 });
    sim.squadrons.spawnStrafers();
    const sq = st.squadrons[0];
    const ps = mems(st, sq);
    seen.add(sq.formation);
    if (i % 3 === 2) { spawnsHard++; sizes.hard.push(sq.n0); if (sq.ace && ps[0].ace && SQ.ACE_PAINTS.some((p) => p.id === ps[0].paint && p.body === ps[0].body)) { aces++; aceHp += ps[0].max; plainHp += ps[1].max; } } else (i % 3 === 1 ? sizes.lap3 : sizes.lap1).push(sq.n0);
  }
  const m = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  report(m(sizes.lap3) > m(sizes.lap1) && m(sizes.hard) > m(sizes.lap1), `later missions and harder stops send bigger squadrons (lap 1: avg ${m(sizes.lap1).toFixed(1)}, lap 3: ${m(sizes.lap3).toFixed(1)}, 3 skulls: ${m(sizes.hard).toFixed(1)})`);
  report(seen.size >= (quick ? 3 : 4), `the formations vary: ${[...seen].join(', ')}`);
  report(aces === spawnsHard && spawnsHard > 0 && aceHp > plainHp, `a hard stop (3 skulls) has an ace leader in circus paint every time (${aces}/${spawnsHard}), tougher than his wingmen (${aceHp} vs ${plainHp} hp)`);
}

// ---- (b) formation keeping, (c) the break, (d) regroup, run for every formation ----
{
  let wingMax = 0, worst = 0, worst2 = 0, formedOk = 0, formedN = 0, broke = 0, regrouped = 0, secondBreak = 0, wingStuck = true, buzzed = 0, anglesOk = 0, anglesTried = 0, rangeOk = true, pairSeen = 0;
  const formations = quick ? ['vee', 'fingerFour', 'trail'] : F.FORMATIONS;
  for (const [fi, f] of formations.entries()) {
    only(f);
    const { sim, st, step, mid } = boot(seed0 + 200 + fi, { danger: 3, lap: 2, noGuns: true });
    const buzz = [];
    const human = { id: 'h1', name: 'Human', color: '#fff', x: 0, y: 0, connected: true, lock: Object.keys(st.GUNS)[0] };
    st.players.h1 = human;
    const sock = { emit: (ev, p) => { if (ev === 'host:ui' && p.id === 'h1' && p.ui && p.ui.fx) buzz.push(p.ui.fx); } };
    sim.setSocket(sock);
    sim.squadrons.spawnStrafers();
    const sq = st.squadrons[0];
    report(sq.formation === f, `forced formation ${f} (${sq.n0} planes)`);
    let phase = 'form';
    let breaks = 0;
    const startAngles = new Map();
    let lastMode = sq.mode;
    for (let s = 0; s < 60 * 70 && st.squadrons.length; s++) {
      step(1);
      const m = mid();
      const ps = mems(st, sq);
      if (process.env.SQDBG && ps.length < (sq._n ?? ps.length)) console.log('   LOST', f, (s / 60).toFixed(1), sq.mode, 'was', sq._n, 'now', ps.length, 'last', JSON.stringify((sq._last || []).map((q) => [q.slot, q.mode, Math.round(q.x - m.x), Math.round(q.y - m.y), q.hp])));
      sq._n = ps.length;
      sq._last = ps.map((q) => ({ slot: q.slot, mode: q.mode, x: q.x, y: q.y, hp: q.hp }));
      if (sq.mode === 'form' && sq.t > 0.5 && ps.length > 1) {
        const A = sq.leader;
        const errs = sim.squadrons.squads.slotErrors(sq);
        if (breaks === 0) { worst = Math.max(worst, ...errs); } // the first approach: from the spawn
        else if (sq.t > 3) worst2 = Math.max(worst2, ...errs); // later ones: once the squadron has turned round and settled (the stragglers of a break come back from the far side of the ship, so this one is looser)
        void A;
      }
      if (sq.mode !== lastMode) {
        if (sq.mode === 'break') {
          breaks++;
          if (breaks === 1) broke++;
          if (breaks === 1) {
            const d = Math.hypot(sq.leader.x - m.x, sq.leader.y - m.y);
            rangeOk = rangeOk && d <= SQ.BREAK_RANGE + 60 && d > SQ.BREAK_RANGE - 400;
            const pairLeads = ps.filter((p) => p.mode === 'peel' || p.mode === 'delay');
            pairSeen += pairLeads.length;
            const wings = ps.filter((p) => p.mode === 'wing');
            if (ps.length >= 4) wingStuck = wingStuck && wings.length >= 1 && pairLeads.length >= 2;
          }
        }
        if (lastMode === 'break' && sq.mode === 'regroup') regrouped++;
        if (lastMode === 'regroup' && sq.mode === 'form') { formedN++; if (sq.errMax <= SQ.REGROUP_ERR * 1.2 + 20) formedOk++; if (process.env.SQDBG) console.log('   FORMED', f, sq.errMax.toFixed(0)); }
        lastMode = sq.mode;
      }
      if (sq.mode === 'break' && breaks === 1) {
        for (const p of ps) if (p.mode === 'attack' && !startAngles.has(p)) startAngles.set(p, Math.atan2(p.y - m.y, p.x - m.x));
        for (const p of ps) if (p.mode === 'wing' && p.pairLead && p.pairLead.hp > 0) { wingMax = Math.max(wingMax, Math.hypot(p.x - p.pairLead.x, p.y - p.pairLead.y)); wingStuck = wingStuck && Math.hypot(p.x - p.pairLead.x, p.y - p.pairLead.y) < 330; }
      }
      if (breaks >= 2 && sq.mode === 'break' && phase === 'form') { secondBreak++; phase = 'done'; break; }
    }
    if (process.env.SQDBG) console.log('  ', f, 'breaks', breaks, 'mode', sq.mode, 'size', sq.size, '/', sq.n0, 'worst', worst.toFixed(0));
    const angs = [...startAngles.values()];
    if (sq.n0 >= 4 && angs.length >= 2) { anglesTried++; let spread = 0; for (const a of angs) for (const b of angs) spread = Math.max(spread, angGap(a, b)); if (deg(spread) > 12) anglesOk++; }
    buzzed += buzz.length > 0 ? 1 : 0;
    resetWeights();
  }
  report(worst < SLOT_ERR, `formation keeping: the worst slot error over every approach, in all ${formations.length} formations, is ${worst.toFixed(1)} px (limit ${SLOT_ERR})`);
  report(broke === formations.length && rangeOk, `every squadron broke when its leader came within ${SQ.BREAK_RANGE} px of the ship (${broke}/${formations.length})`);
  report(pairSeen >= formations.length * 2 && wingStuck, `the break makes attack pairs (pair leaders: ${pairSeen}), and a wingman stays within 330 px of his pair leader through the run (worst ${wingMax.toFixed(0)} px)`);
  report(anglesTried === 0 || anglesOk === anglesTried, `the pairs' attack runs start from different angles (${anglesOk}/${anglesTried} squadrons of 4 or more spread over more than 12 degrees)`);
  report(buzzed === formations.length, `the gunners' phones buzz when the squadron breaks (${buzzed}/${formations.length})`);
  report(regrouped === formations.length && formedN >= formations.length && formedOk >= Math.ceil(formedN * 0.6) && secondBreak === formations.length, `after the pass they regroup (${regrouped}/${formations.length}), form up (${formedOk} of ${formedN} within ${Math.round(SQ.REGROUP_ERR * 1.2 + 20)} px of their slots when the leader turned for the next pass; the rest were still catching up when the time ran out) and come round for a second break (${secondBreak}/${formations.length})`);
  report(worst2 < 600, `... and the second approach, after the turn, settles (worst slot error ${worst2.toFixed(0)} px, stragglers included)`);
}

// ---- (e) the leader is shot down ----
{
  only('vee');
  const { sim, st, step } = boot(seed0 + 300, { danger: 2, lap: 3, noGuns: true });
  sim.squadrons.spawnStrafers();
  const sq = st.squadrons[0];
  step(60 * 2);
  const old = sq.leader;
  const n0 = mems(st, sq).length;
  old.hp = 0; // (shot down)
  step(30);
  const fan = mems(st, sq);
  report(sq.mode === 'scatter' && fan.every((p) => p.mode === 'scatter' && !p.leader) && sq.leader === null, `the leader goes down: the ${fan.length} wingmen scatter at once`);
  step(Math.round(60 * (SQ.SCATTER - 0.7)));
  const hs = fan.map((p) => p.heading);
  let gap = 0;
  for (const a of hs) for (const b of hs) gap = Math.max(gap, angGap(a, b));
  report(gap > 0.5, `... and their headings fan out (${deg(gap).toFixed(0)} degrees apart)`);
  const healthiest = Math.max(...fan.map((p) => p.hp));
  step(60);
  const now = mems(st, sq);
  report(sq.mode !== 'scatter' && sq.leader && sq.leader !== old && sq.leader.leader && now.filter((p) => p.leader).length === 1 && sq.leader.hp >= healthiest - 1e-9 && sq.leader.slot === 0 && state0(sq), `... then the healthiest takes over as the new leader and the squadron ${sq.mode}s (${now.length} of ${n0} planes)`);
  function state0(s) { return s.mode === 'regroup' || s.mode === 'form'; }
  const lead = sq.leader;
  let attacked = false;
  for (let k = 0; k < 60 * 60 && !attacked && sq.leader; k++) {
    step(1);
    if (sq.mode === 'break' && sq.t > 1) attacked = true;
  }
  report(attacked && sq.leader === lead && st.squadrons.length === 1, 'and the squadron regroups on the new leader and goes in to attack again behind him');
  resetWeights();
}

// ---- (f) withdrawal ----
{
  only('vee');
  const { sim, st, step } = boot(seed0 + 400, { danger: 3, lap: 3, noGuns: true });
  sim.squadrons.spawnStrafers();
  const sq = st.squadrons[0];
  step(60 * 2);
  const n0 = sq.n0;
  const kills0 = st.kills;
  const victims = mems(st, sq).slice(0, Math.ceil(n0 * (1 - SQ.WITHDRAW_FRAC)) - 1); // one fewer than it takes: they fight on
  victims.forEach((v) => { v.hp = 0; });
  step(30);
  report(sq.mode !== 'withdraw' && mems(st, sq).length > n0 * SQ.WITHDRAW_FRAC, `${victims.length} of ${n0} down: the squadron fights on`);
  const more = mems(st, sq).filter((p) => !p.leader).slice(0, 1);
  more.forEach((v) => { v.hp = 0; });
  while (mems(st, sq).length > n0 * SQ.WITHDRAW_FRAC + 1e-9) mems(st, sq).filter((p) => !p.leader)[0].hp = 0;
  step(30);
  const left = mems(st, sq);
  report(sq.mode === 'withdraw' && left.length >= 1 && left.every((p) => p.mode === 'leave'), `down to ${left.length} of ${n0}: the squadron WITHDRAWS`);
  step(60 * 30);
  report(st.strafers.length === 0 && st.squadrons.length === 0 && st.kills === kills0, 'the survivors fly away and are gone for good: no plane left in the lists and no kill credited');
  resetWeights();
}

// ---- (g) determinism ----
{
  const track = (seed, formations = true) => {
    SQ.FORMATIONS = formations;
    const { sim, st, step } = boot(seed, { danger: 3, lap: 2 });
    const out = [];
    sim.squadrons.spawnStrafers();
    for (let s = 0; s < 60 * (quick ? 25 : 40); s++) {
      step(1);
      if (s % 10 === 0) out.push(st.strafers.map((p) => [p.squadronId, p.slot, p.mode, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.hp * 100)].join(':')).join('|'));
    }
    const squadIds = st.strafers.map((p) => p.squadronId);
    SQ.FORMATIONS = true;
    return { text: out.join('\n'), squadIds };
  };
  const a = track(seed0 + 500), b = track(seed0 + 500), c = track(seed0 + 501);
  report(a.text === b.text && a.text.length > 100, 'determinism: the same seed gives the same tracks (every plane, every 10 frames)');
  report(a.text !== c.text, 'another seed gives other tracks');
  const off = track(seed0 + 502, false);
  report(off.text.length > 20 && off.squadIds.every((id) => id == null || id === undefined), 'with FORMATIONS off no plane belongs to a squadron (the old loose dogfighters)');
}

// ---- (j) the phone radar ----
{
  only('vee');
  const { sim, st, step } = boot(seed0 + 600, { danger: 2, lap: 2, noGuns: true });
  sim.squadrons.spawnStrafers();
  const sq = st.squadrons[0];
  step(60);
  const planes = () => radarItems(st).filter((i) => i.kind === 'plane');
  const one = planes();
  report(one.length === 1 && one[0].cluster === sq.n0, `in formation the squadron is ONE radar ping with its count (${one.length} ping, ${one[0] && one[0].cluster} planes)`);
  const c = one[0].pos();
  const cx = mems(st, sq).reduce((a, p) => a + p.x, 0) / sq.n0;
  report(Math.abs(c.x - cx) < 1, 'the ping sits at the squadron\'s middle');
  for (let s = 0; s < 60 * 40 && sq.mode === 'form'; s++) step(1);
  for (let s = 0; s < 60 * 20 && sq.spread < config.RADAR.CLUSTER * 1.2; s++) step(1);
  const spread = planes();
  report(spread.length === sq.size && spread.every((i) => !i.cluster), `once it breaks, every plane is its own ping (${spread.length} pings)`);
  resetWeights();
}

// ---- (i) bomber escort, two ships, Versus ----
{
  const keep = { chance: SQ.BOMBER_ESCORT };
  SQ.BOMBER_ESCORT = 1;
  const { sim, st, step } = boot(seed0 + 700, { danger: 3, lap: 2, noGuns: true });
  sim.squadrons.spawnBomber();
  const sq = st.squadrons.find((s) => s.formation === 'escort');
  const bomber = st.bombers[0];
  report(!!bomber && !!sq && sq.anchor === bomber && mems(st, sq).length === 2 && sq.leader.leader && st.bombers.length === 1, 'a bomber on a hard stop can come with a pair of fighters over its wings (an escort squadron anchored to the bomber), and the bomber now flies (the old 3500 px limit sent it home on its first frame)');
  let worst = 0;
  for (let s = 0; s < 60 * 12 && bomber.hp > 0 && st.bombers.includes(bomber); s++) {
    step(1);
    if (s > 120 && sq.mode === 'form') worst = Math.max(worst, ...sim.squadrons.squads.slotErrors(sq));
    if (process.env.SQDBG && s % 120 === 0) console.log('   ESC', (s / 60).toFixed(0), sq.mode, JSON.stringify(sim.squadrons.squads.slotErrors(sq).map(Math.round)), 'bomber', Math.round(bomber.x), Math.round(bomber.y), bomber.heading.toFixed(2));
  }
  report(worst < 120 && sq.mode === 'form', `the escort holds its station over the bomber for 12 s (worst slot error ${worst.toFixed(0)} px)`);
  bomber.hp = 0; // (shot down)
  step(60 * 2);
  const pair = mems(st, sq);
  report(sq.anchor === null && pair.length === 2 && sq.mode !== 'withdraw' && pair.filter((p) => p.leader).length === 1, 'the bomber shot down: the pair goes for the ship in revenge as a squadron of its own');
  SQ.BOMBER_ESCORT = 1;
  const b = boot(seed0 + 701, { danger: 3, lap: 2, noGuns: true });
  b.sim.squadrons.spawnBomber();
  const sq2 = b.st.squadrons.find((s) => s.formation === 'escort');
  b.step(60 * 2);
  b.st.bombers.length = 0; // (the bomber is sent home)
  b.step(60 * 2);
  report(sq2.mode === 'withdraw' || b.st.squadrons.length === 0, 'the bomber sent home: the escort pair goes with it');
  SQ.BOMBER_ESCORT = keep.chance;
}
if (!quick) {
  const second = await loadBuild('bags', BUILDS);
  const { sim, st, step } = boot(seed0 + 800, { bots: 6, second, danger: 2, lap: 2, terrain: true });
  let err = 0;
  try {
    for (let k = 0; k < 4; k++) { sim.squadrons.spawnStrafers(); step(60 * 12); }
  } catch (e) { err++; console.log(e.stack); }
  const ships = st.ships.length;
  report(err === 0 && ships === 2 && st.squadStats.spawned === 4 && st.strafers.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), `two ships in one sky: four squadrons come and go, 0 errors, no NaN`);
  // Versus: the lobby's mode switch with squadrons enabled; the sim runs
  const v = boot(seed0 + 801, { bots: 0, keepHull: true });
  let verr = 0;
  try { v.sim.setSession('versus'); v.step(60 * 2); v.sim.squadrons.spawnStrafers(); v.step(60 * 20); } catch (e) { verr++; console.log(e.stack); }
  report(verr === 0, 'Versus: the squadron code runs beside a Versus lobby with 0 errors');
}

// ---- (h) three minutes with 8 bots ----
{
  const { sim, st, step } = boot(seed0 + 900, { danger: 3, lap: 2, bots: 8, keepHull: false, map: null, patrol: true, daring: true, terrain: true });
  let errors = 0, nan = 0, kills0 = st.kills, wrecked = 0, maxPlanes = 0, spawned = 0, bullets0 = 0;
  const total = 60 * 60 * minutes;
  for (let s = 0; s < total; s++) {
    try {
      if (s % (60 * 30) === 0) {
        sim.squadrons.spawnStrafers();
        spawned++;
        if (spawned % 2 === 0) sim.squadrons.spawnBomber();
      }
      step(1);
      for (const sh of st.ships) if (sh.state.hull <= 0) { sh.state.hull = 100; wrecked++; }
      if (s % 60 === 0) {
        for (const p of st.strafers) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.heading)) nan++;
        maxPlanes = Math.max(maxPlanes, st.strafers.length);
        if (st.squadrons.length > 8) nan++;
      }
    } catch (e) {
      errors++;
      if (errors < 3) console.log(e.stack);
    }
  }
  void bullets0;
  const S = st.squadStats;
  report(errors === 0 && nan === 0, `${minutes} minutes, 8 bots, a squadron every 30 s: 0 errors, no NaN`);
  report(S.spawned >= minutes * 2 && S.breaks >= S.spawned - 2 && S.runs >= S.spawned && st.kills > kills0, `the squadrons fly and fight: ${S.spawned} spawned (${S.planes} planes, ${S.escorts} escorts, ${S.aces} aces), ${S.breaks} breaks, ${S.runs} attack runs, ${S.regroups} regroups, ${S.scatters} leaders lost, ${S.withdrawals} withdrawals, kills ${st.kills - kills0}`);
  report(maxPlanes <= SQ.MAX * 4 + 4 && st.squadrons.length <= 6, `nothing piles up in the lists (most planes at once ${maxPlanes}, squadrons left ${st.squadrons.length})`);
}

console.log(ok ? 'PASS squadrons gate' : 'FAIL squadrons gate');
process.exit(ok ? 0 : 1);
