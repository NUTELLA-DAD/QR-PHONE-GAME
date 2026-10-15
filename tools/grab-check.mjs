// GRAB gate (PLAYTEST1.md P3 "The button says what's in front of you"; shipSim.js grabsFor / useFor / pressAct, config.CONTROLS.GRAB_V2, shipBuild.js BUILDS.sparrow). Headless.
//   node tools/buildsim.mjs --check-grab        or directly:   node tools/grab-check.mjs [--seed 1] [--step 10]
//
// A staged human (no phone) is put at every STEP px along every deck of the ship, walked there the way a person walks (a sweep each way, so the hysteresis has its memory), with empty hands, a hammer and a
// bundle of scrap in them; each sample reads what the host would tell the phone (player.act = the big button, player.grabAct = the small GRAB button).
//   1  the Sparrow's layout rule: 3 extinguishers, 2 hammers, 1 sword, nothing grabbable within 85 px of a station but its own ammo / coal; BUILDS.sparrow_v1 is the old 11-rack ship
//   2  within 40 px of a seat the big button names it (Take <station>), with empty hands and with a hammer in hand (a bundle may be STOW at the hold bin: a job); an ammo / coal station is named by the
//      big button with empty hands and by GRAB with a tool in hand (that is a swap). The boiler is no seat (coal goes in, SURGE holds) and a mothballed seat is nobody's: neither is graded
//   3  no label flickers: walking either way, every label (big button and GRAB) holds for at least 30 px between its neighbours, and none comes back within 60 px (A > B > A)
//   4  a rack is on GRAB within 60 px of it when no station is within 85 px
//   5  pressing: the big button with a hammer in hand takes the seat (the hammer goes back, nothing is lost); with scrap in hand it is set down as a load at his feet (and can be picked up again)
//   6  the classic ship's labels at her stations (this gate's own fixture: every seat of hers named within 25 px, with and without a hammer)
//   7  the switch: GRAB_V2 off and the old Sparrow = the old game (a hammer in hand never takes the seat); the old Sparrow's flickers are counted for the record
//   P4 (PLAYTEST1.md "Ladders that catch you"; nav.js moveWalker / ladderEnd, shipSim.js climbOffer, config.NAV.LADDER) adds sections 8-14 at the bottom:
//   8  a person at 0 / 30 / 60 px from a ladder's foot pushing straight up is on it inside 0.5 s; at 90 px he is not (and no ladder is a pole)
//   9  a diagonal push (as much up as sideways) from 60 px grabs; a mostly sideways one walks past
//  10  at the top of a ladder a sideways push lands him on that deck (and the ladder does not catch him straight back); the same at the bottom
//  11  the big button says CLIMB UP / CLIMB DOWN near a ladder and the phone's ui carries "up" (the hint "Push UP to climb")
//  12  a bot keeps the 38 px grab (30 px grabs, 60 px does not), a raider the same (nav.moveWalker without the person flag)
//  13  the pole still slides: pushing down near its top carries him to the deck below, and a pole cannot be climbed back up
//  14  the switch: NAV.LADDER.ENABLED off = the old 38 px grab, no CLIMB label, no step-off
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const STEP = Number(flag('step', 10)); // px between samples
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyBuild, createLayout } = await load('shipLayout.js');
const { holdSpot } = await load('modules/host/scrap.js');
const { isMothballed } = await load('modules/host/gunsMatter.js');
const G = config.CONTROLS.GRAB_V2;
const DT = 1 / 60;
const errors = [];
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// ---- the harness P4 reuses -------------------------------------------------------------------------------
// A calm sky and a started voyage on `startBuild` (null = the classic ship, as the tools default).
function boot({ startBuild = null, s = seed } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.MATES.ENABLED = false;
  config.SCRAP.ENABLED = true;
  config.PVP.ENABLED = false;
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(s);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  if (startBuild) sim.setStartBuild(startBuild);
  const ours = st.ships[0];
  sim.castOff();
  return { sim, st, ours };
}
function step(sim, n = 1) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
  }
}
// A person (not a bot) standing on a deck (id or index) at x.
function person(st, ours, id, deck, x, carry = null) {
  const d = typeof deck === 'number' ? deck : ours.layout.platforms.findIndex((q) => q.id === deck);
  st.players[id] = { id, name: id, species: 'fox', color: colors[0], x, y: ours.layout.platforms[d].y, d, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null, carry, fire: false, uk: null };
  return st.players[id];
}
// What a button does, as a short string: 'station:Helm', 'rack:hammer', 'vent', 'stow' ... or '-'.
const idOf = (a) => (a ? a.type + (a.station ? ':' + a.station.n : a.obj && (a.obj.kind || a.obj.name) ? ':' + (a.obj.kind || a.obj.name) : '') : '-');
// Walk a person along deck d between x0 and x1 in STEP px (dir 1 = x0 to x1, -1 = back), two frames a sample, the hands as given;
// returns [[x, big, grab], ...] and calls fn(x, big, grab, p) at each sample.
function sweep(sim, p, x0, x1, dir, carry, fn = null, stepPx = STEP) {
  const n = Math.floor((x1 - x0) / stepPx), log = [];
  p.x = dir > 0 ? x0 : x1;
  p.carry = carry;
  step(sim, 2);
  for (let i = 0; i <= n; i++) {
    p.x = dir > 0 ? x0 + i * stepPx : x1 - i * stepPx;
    p.carry = carry;
    step(sim, 2);
    const row = [p.x, idOf(p.act), idOf(p.grabAct)];
    row[3] = row[1]; // (the label as the phone has it, for the misses; the flicker count below sees a bundle's DUMP at a rail as no label: it is a rule of its own)
    if (carry === 'scrap' && row[1].startsWith('dump')) row[1] = '-';
    if (row[1] === 'climb') row[1] = '-'; // (P4: CLIMB is a hint for a ladder that fills an empty button; it is no job, and a seat or a rack beside a ladder takes it over)
    log.push(row);
    if (fn) fn(p.x, row[3], row[2], p);
  }
  return log;
}
const decksOf = (L) => L.platforms.map((pl, d) => ({ d, id: pl.id, x0: pl.x0 + 10, x1: pl.x1 - 10 }));
const stationsOn = (L, d) => L.stations.filter((s) => s.d === d);
const grabbables = (L) => [...L.racks.map((r) => ({ ...r, what: 'rack ' + r.kind })), ...L.extinguishers.map((r) => ({ ...r, what: 'extinguisher' }))];

// Label flicker in one sweep's column k (1 = big button, 2 = GRAB): an interior run shorter than 30 px, or A > B > A inside 60 px. Returns descriptions.
function flickersOf(log, k, tag) {
  const runs = []; // [label, from index, length]
  for (let i = 0; i < log.length; i++) { if (runs.length && runs[runs.length - 1][0] === log[i][k]) runs[runs.length - 1][2]++; else runs.push([log[i][k], i, 1]); }
  const out = [];
  for (let r = 1; r < runs.length - 1; r++) if (runs[r][2] * STEP < 30) out.push(`${tag}: "${runs[r][0]}" holds only ${runs[r][2] * STEP} px at ${log[runs[r][1]][0]} (${runs[r - 1][0]} > ${runs[r][0]} > ${runs[r + 1][0]})`);
  for (let r = 0; r + 2 < runs.length; r++) if (runs[r][0] !== '-' && runs[r][0] === runs[r + 2][0] && runs[r + 1][2] * STEP <= 60) out.push(`${tag}: "${runs[r][0]}" > "${runs[r + 1][0]}" > "${runs[r][0]}" at ${log[runs[r + 1][1]][0]}`);
  return out;
}

const HANDS = [['empty hands', null], ['a hammer', 'hammer'], ['scrap', 'scrap']];
// The whole survey of one ship: every deck, every hand state, both ways. Returns the counts and the lists of what went wrong.
function survey({ sim, st, ours }) {
  const L = ours.layout;
  const bin = holdSpot(L);
  const res = { samples: 0, graded: new Set(), misses: [], flicker: [], rackMiss: [] };
  step(sim, 60);
  for (const [hname, carry] of HANDS) {
    for (const dk of decksOf(L)) {
      for (const dir of [1, -1]) {
        const p = person(st, ours, 'sweeper', dk.d, dir > 0 ? dk.x0 : dk.x1, carry);
        const log = sweep(sim, p, dk.x0, dk.x1, dir, carry, (x, big, grab) => {
          res.samples++;
          if (dir < 0) return;
          const near = stationsOn(L, dk.d).filter((s) => Math.abs(s.x - x) < 40 && s.kind !== 'boiler' && !isMothballed(ours.ctx, s.n)).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
          if (near) {
            res.graded.add(near.n);
            const sup = near.kind === 'coal' || near.kind === 'ammo';
            const atBin = bin && bin.d === dk.d && Math.abs(bin.x - x) < 65;
            const good = sup ? (carry ? grab.endsWith(':' + near.n) : big.endsWith(':' + near.n)) : big === 'station:' + near.n || (carry === 'scrap' && ((atBin && big.startsWith('stow')) || big.startsWith('dump'))); // (a bundle in hand has two jobs of its own: STOW at the bin, DUMP at a rail)
            if (!good) res.misses.push(`${hname}, ${dk.id} deck x ${x} (${near.n}, ${Math.abs(near.x - x)} px off): big=${big} grab=${grab}`);
          }
          if (!carry && !stationsOn(L, dk.d).some((s) => Math.abs(s.x - x) < 85)) { // a rack within 60 px with no station within 85
            const r = grabbables(L).filter((o) => o.d === dk.d && Math.abs(o.x - x) <= 60).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
            const atBin = bin && bin.d === dk.d && Math.abs(bin.x - x) < 65;
            if (r && !atBin && !grab.startsWith('rack:')) res.rackMiss.push(`${r.what}@${r.x} not on GRAB at x ${x}, ${dk.id} deck: big=${big} grab=${grab}`);
          }
        });
        for (const k of [1, 2]) res.flicker.push(...flickersOf(log, k, `${hname}, ${dk.id}, ${dir > 0 ? 'aft to fore' : 'fore to aft'}, ${k === 1 ? 'big' : 'GRAB'}`));
        delete st.players.sweeper;
      }
    }
  }
  return res;
}
const listed = (xs, n = 8) => (xs.length ? '\n    ' + xs.slice(0, n).join('\n    ') : '');

// ---------------------------------------------------------------- 1. the layout rule
{
  const L = createLayout(BUILDS.sparrow), V1 = createLayout(BUILDS.sparrow_v1);
  const kinds = (l, k) => l.racks.filter((r) => r.kind === k).length;
  report(L.extinguishers.length === 3 && kinds(L, 'hammer') === 2 && kinds(L, 'sword') === 1, `the Sparrow has ${L.extinguishers.length} extinguishers, ${kinds(L, 'hammer')} hammers, ${kinds(L, 'sword')} sword (was ${V1.extinguishers.length} / ${kinds(V1, 'hammer')} / ${kinds(V1, 'sword')} in BUILDS.sparrow_v1)`);
  const bad = [];
  for (const o of grabbables(L)) for (const s of L.stations) if (s.d === o.d && Math.abs(s.x - o.x) < 85) bad.push(`${o.what}@${o.x} is ${Math.abs(s.x - o.x)} px from ${s.n}`);
  report(bad.length === 0, 'nothing grabbable within 85 px of a station' + (bad.length ? ': ' + bad.join('; ') : ''));
  const close = [];
  const things = [...grabbables(L), ...L.vents.map((v) => ({ ...v, what: 'vent' }))];
  for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) if (things[i].d === things[j].d && Math.abs(things[i].x - things[j].x) < 45) close.push(`${things[i].what}@${things[i].x} / ${things[j].what}@${things[j].x}`);
  report(close.length === 0, 'no two racks, hooks or vents within 45 px of each other' + (close.length ? ': ' + close.join('; ') : ''));
  report(V1.racks.length + V1.extinguishers.length === 11 && JSON.stringify(BUILDS.sparrow_v1).includes('"x":760'), 'BUILDS.sparrow_v1 is the old Sparrow (11 racks, the hammer at 760 still there)');
}

// ---------------------------------------------------------------- 2-4. the sweeps on the Sparrow
const sparrow = boot({ startBuild: 'sparrow' });
{
  const L = sparrow.ours.layout;
  report(sparrow.ours.buildId === 'sparrow' && L.platforms.length === 4, `the Sparrow is aboard (${L.platforms.map((q) => q.id).join(', ')})`);
  const r = survey(sparrow);
  report(r.graded.size >= 5 && r.misses.length === 0, `the big button names the seat within 40 px of it: ${r.samples} samples (4 decks, empty hands / hammer / scrap, both ways), ${r.graded.size} seats graded (${[...r.graded].join(', ')}), ${r.misses.length} misses` + listed(r.misses));
  report(r.flicker.length === 0, `no label flickers (every label holds 30 px, none comes back within 60 px): ${r.flicker.length}` + listed(r.flicker));
  report(r.rackMiss.length === 0, `a rack shows on GRAB within 60 px when no station is within 85 px: ${r.rackMiss.length} misses` + listed(r.rackMiss));
}

// ---------------------------------------------------------------- 4b. vents and valves are still reachable
{
  const { sim, st, ours } = sparrow;
  const L = ours.layout, miss = [];
  const things = [...L.vents.map((v) => ({ d: v.d, x: v.x, type: 'vent' })), ...L.pipes.filter((q) => q.valve).map((q) => ({ d: q.d, x: q.valve[0], type: 'valve' }))];
  for (const t of things) {
    const p = person(st, ours, 'vv', t.d, t.x);
    step(sim, 4);
    if (idOf(p.act) !== t.type + (t.type === 'vent' ? '' : ':pipe') && !(p.act && p.act.type === t.type)) miss.push(`${t.type} at ${t.x} on ${L.platforms[t.d].id}: big=${idOf(p.act)}`);
    delete st.players.vv;
  }
  report(things.length >= 5 && miss.length === 0, `standing on each of the ${things.length} vents and pipe valves the big button works it (VALVE_REACH ${G.VALVE_REACH}): ${miss.length} misses` + listed(miss));
}

// ---------------------------------------------------------------- 5. pressing
{
  const { sim, st, ours } = sparrow;
  const helm = ours.layout.stations.find((s) => s.kind === 'helm');
  const hd = helm.d;
  const p = person(st, ours, 'taker', hd, helm.x - 20, 'hammer');
  step(sim, 4);
  const label = p.act && p.act.label;
  report(p.act && p.act.type === 'station' && /Helm/.test(label), `a hammer in hand at the helm: the big button says "${label}"`);
  p.actQ = true; p.actAid = p.aids.a.cur;
  step(sim, 2);
  report(p.lock === helm.n && !p.carry, `pressing it seats him at the ${helm.n} and the hammer goes back on its rack (carry ${p.carry})`);
  p.lock = null; p.grabLock = 0;
  const before = (st.loads || []).length;
  p.carry = 'scrap';
  p.x = helm.x - 20;
  step(sim, 4);
  p.actQ = true; p.actAid = p.aids.a.cur;
  step(sim, 2);
  const ld = (st.loads || []).find((l) => l.kind === 'scrap' && l.d === hd);
  report(p.lock === helm.n && !p.carry && !!ld && (st.loads || []).length === before + 1, `a bundle of scrap in hand at the helm is set down at his feet as a load (x ${ld ? Math.round(ld.x) : '-'}), then he sits`);
  p.lock = null; p.grabLock = 0;
  p.x = ld ? ld.x : helm.x;
  step(sim, 4);
  report(p.act && p.act.type === 'pickup', `...and the bundle can be picked up again (button: ${idOf(p.act)})`);
  delete st.players.taker;
  st.loads.length = 0;
}

// ---------------------------------------------------------------- 6. the classic ship
{
  const { sim, st, ours } = boot();
  const L = ours.layout;
  step(sim, 60);
  const bin = holdSpot(L);
  const misses = [], graded = new Set();
  for (const [hname, carry] of HANDS.slice(0, 2)) {
    for (const s of L.stations) {
      if (s.kind === 'boiler' || isMothballed(ours.ctx, s.n) || L.stations.some((o) => o !== s && o.d === s.d && Math.abs(o.x - s.x) < 2 * G.HYSTERESIS + 40)) continue; // (the classic's Lookout and Nest Searchlight stand 45 px apart: the hysteresis cannot tell them apart; P7 would)
      const p = person(st, ours, 'walker', s.d, s.x - 25, carry);
      step(sim, 4);
      for (const off of [-25, -12, 0, 12, 25]) {
        p.x = s.x + off; p.carry = carry; step(sim, 2);
        graded.add(s.n);
        const big = idOf(p.act), grab = idOf(p.grabAct);
        const sup = s.kind === 'coal' || s.kind === 'ammo';
        const good = sup ? (carry ? grab.endsWith(':' + s.n) : big.endsWith(':' + s.n)) : big === 'station:' + s.n || (big.startsWith('stow') && bin && bin.d === s.d);
        if (!good) misses.push(`${hname}: ${s.n} (${s.kind}) at ${off >= 0 ? '+' : ''}${off} px: big=${big} grab=${grab}`);
      }
      delete st.players.walker;
    }
  }
  report(graded.size >= 8 && misses.length === 0, `the classic ship's labels at her stations: ${graded.size} seats named within 25 px, empty hands and a hammer: ${misses.length} misses` + listed(misses, 10));
}

// ---------------------------------------------------------------- 7. the switch (and the old Sparrow's flickers, for the record)
{
  G.ENABLED = false;
  const old = boot({ startBuild: 'sparrow_v1' });
  const { sim, st, ours } = old;
  const L = ours.layout;
  step(sim, 60);
  const helm = L.stations.find((s) => s.kind === 'helm');
  const p = person(st, ours, 'old', helm.d, helm.x, 'hammer');
  step(sim, 4);
  report(L.racks.length + L.extinguishers.length === 11 && !(p.act && p.act.type === 'station'), `GRAB_V2 off + sparrow_v1: 11 racks, and a hammer in hand at the helm never takes the seat (big: ${idOf(p.act)}, GRAB: ${idOf(p.grabAct)})`);
  p.actQ = true; p.actAid = p.aids.a.cur; step(sim, 2);
  report(p.lock !== helm.n, 'pressing the big button there does not seat him');
  delete st.players.old;
  const r = survey(old);
  console.log(`INFO the old Sparrow with the switch off: ${r.misses.length} station misses, ${r.flicker.length} flickers, ${r.rackMiss.length} rack misses in ${r.samples} samples`);
  G.ENABLED = true;
}

// ---------------------------------------------------------------- P4 (ladders that catch you)
const NL = config.NAV.LADDER;
{
  const { sim, st, ours } = boot({ startBuild: 'sparrow' });
  const L = ours.layout, nav = ours.nav;
  step(sim, 60);
  const lowerD = L.platforms.findIndex((q) => q.id === 'lower'), mainD = L.platforms.findIndex((q) => q.id === 'main');
  const foot = L.connectors.findIndex((c) => c.type === 'ladder' && c.bottom === lowerD && c.top === mainD); // (the Sparrow's ladder between her two big decks)
  const c = L.connectors[foot];
  // push (jx, jy) from `off` px beside the foot of ladder `foot` for up to `secs` seconds; returns { t (seconds until he is on it, or -1), p }
  const push = (off, jx, jy, secs = 0.5, id = 'climber') => {
    delete st.players[id];
    const p = person(st, ours, id, lowerD, c.xBottom + off);
    step(sim, 4);
    p.x = c.xBottom + off; p.jx = jx; p.jy = jy;
    let t = -1, gx = null, prev = p.x;
    for (let i = 0; i < secs * 60 && t < 0; i++) { step(sim, 1); if (p.conn === foot) { t = (i + 1) * DT; gx = prev; } prev = p.x; }
    return { t, p, start: c.xBottom + off, gx };
  };
  // ---- 8. straight up from 0 / 30 / 60 / 90 px
  const rows = [], bad = [];
  for (const off of [0, 30, 60, 90]) for (const side of off ? [-1, 1] : [1]) {
    const r = push(off * side, 0, -1);
    rows.push(`${off * side}px: ${r.t < 0 ? 'no' : r.t.toFixed(2) + 's'}`);
    if (off <= 60 ? r.t < 0 : r.t >= 0) bad.push(`${off * side} px: ${r.t < 0 ? 'not grabbed' : 'grabbed'}`);
    delete st.players.climber;
  }
  report(foot >= 0 && bad.length === 0, `pushing straight up at the foot of a ladder: grabbed inside 0.5 s from 0-60 px either side, not from 90 px (GRAB_HUMAN ${NL.GRAB_HUMAN}, MAGNET ${NL.MAGNET}): ${rows.join(', ')}` + listed(bad));
  // ---- 9. a diagonal push
  {
    const dg = push(-60, 0.7, -0.8), side = push(-60, 0.95, -0.5);
    report(dg.t >= 0 && (side.t < 0 || side.gx >= c.xBottom - 39), `a diagonal push (0.7 across, 0.8 up) from 60 px grabs in ${dg.t < 0 ? 'never' : dg.t.toFixed(2) + ' s'}; a mostly sideways one (0.95 across, 0.5 up) is not pulled in: it ${side.t < 0 ? 'walks past' : 'grabs only at ' + Math.round(c.xBottom - side.gx) + ' px (the old 38 px grab)'}`);
    delete st.players.climber;
  }
  // ---- 10. stepping off
  {
    const p = person(st, ours, 'stepper', lowerD, c.xBottom);
    step(sim, 4);
    nav.board(p, foot, true); // (on the ladder at its foot)
    p.jx = 1; p.jy = 0;
    step(sim, 2);
    const offBottom = p.conn == null && p.d === lowerD;
    p.jx = 0; step(sim, 2);
    // climb to the top, then sideways
    p.jy = -1; for (let i = 0; i < 900 && !(p.conn === foot && p.s <= 0.04); i++) step(sim, 1);
    p.s = 0; p.jy = 0; step(sim, 1);
    const atTop = p.conn === foot && p.s <= 0;
    p.jy = 0; p.jx = -1; step(sim, 3);
    const offTop = p.conn == null && p.d === mainD;
    const x0 = p.x;
    p.jx = -0.8; p.jy = 0.5; step(sim, 12); // (a diagonal push back toward the ladder's top: the step-off lock keeps it from snatching him straight back)
    const noSnatch = p.conn == null;
    report(offBottom && atTop && offTop && noSnatch, `a sideways push at the bottom steps off onto the lower deck (${offBottom}); climbed to the top (${atTop}) a sideways push lands him on the main deck (${offTop}, x ${Math.round(x0)}); the ladder does not snatch him straight back (${noSnatch})`);
    // a half-way push sideways does nothing
    delete st.players.stepper;
    const q = person(st, ours, 'mid', lowerD, c.xBottom);
    step(sim, 4);
    nav.board(q, foot, true); q.s = 0.5; q.jx = 1; q.jy = 0; step(sim, 3);
    report(q.conn === foot, 'half-way up a ladder a sideways push does nothing (he holds on)');
    delete st.players.mid;
  }
  // ---- 11. the phone's CLIMB and hint
  {
    const p = person(st, ours, 'phone', lowerD, c.xBottom);
    p.jx = 0; p.jy = 0;
    step(sim, 6);
    const a = idOf(p.act);
    report(a === 'climb' && /^CLIMB UP/.test(p.act.label) && p.ui && p.ui.climb === 'up', `beside a ladder's foot the big button says "${p.act && p.act.label}" and the phone's ui carries climb "${p.ui && p.ui.climb}" (the hint "Push UP to climb")`);
    p.actQ = true; p.actAid = p.aids.a.cur;
    step(sim, 2);
    report(p.conn === foot, 'pressing CLIMB takes hold of the ladder');
    delete st.players.phone;
    const c1 = L.connectors.findIndex((q) => q.type === 'ladder' && L.platforms[q.top].id === 'catwalk' && L.platforms[q.bottom].id === 'main');
    const top = person(st, ours, 'phone2', L.connectors[c1].top, L.connectors[c1].xTop + 30);
    step(sim, 6);
    report(top.act && top.act.type === 'climb' && /^CLIMB DOWN/.test(top.act.label) && top.ui && top.ui.climb === 'down', `at the top of the ladder it says "${top.act && top.act.label}" (climb ${top.ui && top.ui.climb})`);
    delete st.players.phone2;
    const far = person(st, ours, 'phone3', lowerD, c.xBottom - 200);
    step(sim, 6);
    report(!(far.act && far.act.type === 'climb') && !(far.ui && far.ui.climb), 'far from every ladder there is no CLIMB (' + idOf(far.act) + ')');
    delete st.players.phone3;
  }
  // ---- 12. bots and other walkers keep the old 38 px grab
  {
    const grabsAt = (off, human) => {
      const w = { x: c.xBottom + off, y: L.platforms[lowerD].y, d: lowerD, conn: null, vx: 0 };
      for (let i = 0; i < 30 && w.conn == null; i++) nav.moveWalker(w, 0, -1, DT, 230, 1, human);
      return w.conn === foot;
    };
    report(grabsAt(30, false) && !grabsAt(60, false) && grabsAt(60, true) && !grabsAt(90, true), `a bot or raider (human=false) grabs from 30 px, not 60; a person from 60, not 90 (moveWalker with the flag)`);
  }
  // ---- 14. the switch
  {
    NL.ENABLED = false;
    const r60 = push(60, 0, -1), r30 = push(30, 0, -1);
    delete st.players.climber;
    const p = person(st, ours, 'old', lowerD, c.xBottom - 20);
    step(sim, 6);
    report(r60.t < 0 && r30.t >= 0 && !(p.act && p.act.type === 'climb') && !(p.ui && p.ui.climb), `NAV.LADDER.ENABLED off: 60 px does not grab, 30 px does (the 38 px grab), no CLIMB label (${idOf(p.act)})`);
    delete st.players.old;
    NL.ENABLED = true;
  }
}
// ---- 13. the pole still slides (the classic ship has them)
{
  const { sim, st, ours } = boot();
  const L = ours.layout, nav = ours.nav;
  step(sim, 60);
  const poleI = L.connectors.findIndex((c) => c.type === 'pole' && L.platforms[c.top].id === 'catwalk' && L.platforms[c.bottom].id === 'main');
  const pc = L.connectors[poleI];
  const p = person(st, ours, 'slider', pc.top, pc.xTop - 60);
  step(sim, 4);
  p.jx = 0; p.jy = 1;
  let on = false, landed = -1;
  for (let i = 0; i < 360 && landed < 0; i++) { step(sim, 1); if (p.conn === poleI) on = true; if (on && p.conn == null) landed = i; }
  report(poleI >= 0 && on && landed >= 0 && p.d === pc.bottom, `pushing down 60 px from a pole's top: slides to it, rides it and lands on the ${L.platforms[p.d].id} deck (on it ${on})`);
  delete st.players.slider;
  const q = person(st, ours, 'climber', pc.bottom, pc.xBottom - 20);
  step(sim, 4);
  q.jx = 0; q.jy = -1; step(sim, 40);
  report(q.conn !== poleI, 'a pole cannot be climbed back up (it is one-way)');
  const seen = [];
  for (let off = -60; off <= 60; off += 10) { const cl = person(st, ours, 'dwn', pc.top, pc.xTop + off); step(sim, 6); if (cl.act && cl.act.type === 'climb') seen.push(off); delete st.players.dwn; }
  report(seen.length > 0, `near a pole's top the big button says SLIDE DOWN (at offsets ${seen.join(', ') || 'none'})`);
  delete st.players.climber;
}

report(errors.length === 0, `no errors (${errors.length})` + (errors.length ? '\n    ' + errors.join('\n    ') : ''));
console.log(ok ? 'grab-check: ALL PASS' : 'grab-check: FAILED');
process.exit(ok ? 0 : 1);
