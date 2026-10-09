// SHIP-SHIP COLLISION gate (public/modules/host/shipCollide.js, config.COLLIDE). Headless.
//   node tools/buildsim.mjs --check-collide        or directly:   node tools/collide-check.mjs [--seed 1] [--quick 1]
//
// Ships are solid to each other: every step, after the ships have moved, no two hulls overlap. The overlap is measured here the independent way - by asking each ship's hitsShip (what a shell hits)
// on a grid across the boxes' overlap - not with shipCollide.js's own shapes.
//   (a) two ships flown straight at each other at full speed never overlap by more than a few px in any step, never pass through, and bounce (their speeds reverse) and end touching;
//   (b) one ship ramming a stationary HEAVIER ship moves it less than itself (the position split and the speed change go by mass);
//   (c) a ship that comes about next to another is refused if her mirrored hull would sit in it, and if the other drifts in during the turn she is not left inside it at the flip;
//   (d) three ships in the ?ships=3 formation, bots aboard, fly 2 minutes (and a tight formation 1.5 minutes) and never overlap;
//   (e) a Versus round with bots: not one step with the hulls overlapping, and ships thrown into each other are pushed apart and counted as a bump;
//   (f) a high-speed ram hurts BOTH ships, kicks both about the place they touched (forces.js: the pitch swings) and clangs; a slow touch does not hurt;
//   (h) the ram prow is a big iron beak that is part of the hull (bounds, cave box, a collision shape of its own), a prow meeting is a RAM (stamp, boom, word, shake, scuff) that hurts the other ship much more;
//   (g) one ship: nothing runs; ENABLED false: the ships pass through each other (the control).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0; // (shorter long runs)
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { applyPlayerInput } = await load('modules/host/network.js');
const P = await load('modules/host/pose.js');
const { overlapsAnother } = await load('modules/host/shipCollide.js');
const { pivotOf: massOf } = await load('modules/host/forces.js');
const C = config.COLLIDE;
const TURN = config.SHIP.TURN;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];

// ---- helpers ----
// How deep two hulls overlap, measured with hitsShip on a grid (px; 0 = clear): the smaller side of the box round the points that are inside both, plus one grid step.
const GRID = 14;
const box = (sh) => { const b = sh.layout.bounds, a = P.toWorldX(sh, b.x0), c = P.toWorldX(sh, b.x1); return { x0: Math.min(a, c), x1: Math.max(a, c), y0: sh.pose.y + b.y0, y1: sh.pose.y + b.y1 }; };
function overlapDepth(A, B) {
  const a = box(A), b = box(B);
  const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), y0 = Math.max(a.y0, b.y0), y1 = Math.min(a.y1, b.y1);
  if (x0 >= x1 || y0 >= y1) return 0;
  let n = 0, lx = Infinity, hx = -Infinity, ly = Infinity, hy = -Infinity;
  for (let x = x0; x <= x1; x += GRID) {
    for (let y = y0; y <= y1; y += GRID) {
      if (A.sim.hitsShip(P.toShipX(A, x), P.toShipY(A, y)) && B.sim.hitsShip(P.toShipX(B, x), P.toShipY(B, y))) { n++; lx = Math.min(lx, x); hx = Math.max(hx, x); ly = Math.min(ly, y); hy = Math.max(hy, y); }
    }
  }
  return n ? Math.min(hx - lx, hy - ly) + GRID : 0;
}
const worstOverlap = (ships) => { let w = 0; for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) w = Math.max(w, overlapDepth(ships[i], ships[j])); return w; };

// A sim with calm skies, open sky (the rock cleared away in the scripted tests), `n` classic ships (or the given parts), a person at each helm (thr = the throttle) and bots if asked.
function boot({ n = 2, bots = 0, calm = true, clear = true, formation = null, parts = BUILDS.classic } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; }
  clock = seedRandom(seed);
  const sim = createSimulation();
  const st = sim.state;
  const ships = [st.ships[0]];
  for (let i = 1; i < n; i++) ships.push(sim.addShip(parts, { formation: formation ? formation(i) : { dx: -250 * i, dalt: -1150 * i } }));
  const humans = [];
  for (const sh of ships) {
    const multi = ships.length > 1;
    if (bots) {
      const e = sh.layout.boarderEntryPoints;
      for (let i = 0; i < bots; i++) {
        const id = sh.id + '_bot' + i;
        st.players[id] = { id, bot: true, ...(multi ? { ship: sh.id } : {}), name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
      }
    } else {
      const helm = sh.layout.one('helm');
      const h = { id: 'h_' + sh.id, ...(multi ? { ship: sh.id } : {}), name: 'Helm', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: sh.layout.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0, thr: 0 };
      st.players[h.id] = h;
      humans.push(h);
    }
  }
  sim.castOff();
  if (clear) st.course.map.solid.fill(0); // (nothing but the other ship to hit)
  return { sim, st, ships, humans };
}
const pins = new Map(); // ships held at one height (nothing holds a hovering ship up in a test sky with the gas left alone)
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    for (const sh of sim.state.ships) sh.state.press = Math.min(sh.state.press, 72);
    for (const [sh, y] of pins) { sh.pose.y = y; sh.pose.vy = 0; }
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    sim.state.ev.warn = Math.min(sim.state.ev.warn, 0.01);
    if (each) each(i);
  }
}
// Put a ship where her reference is clear of everything: pose set directly (no rock), speed 0.
function stand(sh, x, y, f = 1) {
  sh.pose.x = x; sh.pose.y = y; sh.pose.f = f; sh.pose.vy = 0; sh.state.speed = 0;
  pins.set(sh, y);
}
const mid = (sh) => P.toWorldX(sh, sh.layout.refPoint.x);
const kicksOf = (sh) => sh.ctx.forces.kicks;
const peakOf = (sh) => sh.ctx.forces.peak;

// ---- (a) + (f) two ships flown straight at each other at full speed ----
{
  pins.clear();
  const { sim, st, ships: [A, B], humans: [hA, hB] } = boot();
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 4200, 3000, -1);
  hA.thr = hB.thr = 1;
  A.state.speed = B.state.speed = 1; // (flown AT full speed)
  const hull0 = [A.state.hull, B.state.hull], k0 = [kicksOf(A), kicksOf(B)];
  let worst = 0, first = -1, crossed = false, clang = false, banner = false, speedA = null, speedB = null, preA = 1, preB = 1;
  const hits0 = sim.shipCollide.stats.hits;
  const total = 60 * 14;
  step(sim, total, (i) => {
    worst = Math.max(worst, overlapDepth(A, B));
    if (mid(B) < mid(A)) crossed = true;
    if (first < 0 && sim.shipCollide.stats.hits > hits0) { first = i; speedA = A.state.speed; speedB = B.state.speed; }
    if (first < 0) { preA = A.state.speed; preB = B.state.speed; }
    if (st.sfxQ.some((q) => q[0] === 'clang')) clang = true;
    if (st.ev.warnText === 'THE SHIPS COLLIDE!') banner = true;
    st.sfxQ.length = 0;
  });
  report(first >= 0 && worst <= 3, `(a) two ships flown straight at each other at full speed meet at step ${first} and never overlap by more than ${Math.max(0, worst)} px in any of ${total} steps`);
  report(!crossed && first >= 0 && speedA < 0 && speedB < 0, `(a) ...never pass through (A's middle stayed left of B's), and they bounce: their speeds (a share of top speed, along their own bows) went from ${preA.toFixed(2)} / ${preB.toFixed(2)} to ${speedA && speedA.toFixed(2)} / ${speedB && speedB.toFixed(2)} in the step they met`);
  report(overlapDepth(A, B) <= 3 && sim.shipCollide.stats.contacts > 5, `(a) ...and with their engines still pushing they end touching, not inside each other (${sim.shipCollide.stats.contacts} contacts, overlap now ${overlapDepth(A, B)} px)`);
  report(A.state.hull < hull0[0] && B.state.hull < hull0[1] && kicksOf(A) > k0[0] && kicksOf(B) > k0[1] && peakOf(A) > 0 && peakOf(B) > 0, `(f) a full-speed ram hurts BOTH (hull ${hull0[0]} -> ${A.state.hull.toFixed(1)} / ${hull0[1]} -> ${B.state.hull.toFixed(1)}) and kicks both about the place they touched (forces.js: ${kicksOf(A) - k0[0]} / ${kicksOf(B) - k0[1]} kicks, pitch swung ${(peakOf(A) * 57.3).toFixed(2)} / ${(peakOf(B) * 57.3).toFixed(2)} degrees)`);
  report(clang && banner, '(f) ...with the clang and the banner THE SHIPS COLLIDE!');
  const hurtOnce = sim.shipCollide.stats.hits - hits0;
  report(hurtOnce <= Math.ceil(14 / C.COOLDOWN) + 1, `(f) ...at most once per cooldown (${hurtOnce} hurting hits in 14 s, cooldown ${C.COOLDOWN} s)`);
  pins.clear();
}

// ---- (f) a slow touch only presses: no damage ----
{
  pins.clear();
  const { sim, ships: [A, B], humans: [hA] } = boot();
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 1500, 3000, 1);
  hA.thr = 0.06; // a creep: ~34 px/s
  const h0 = [A.state.hull, B.state.hull];
  let worst = 0;
  step(sim, 60 * 25, () => { worst = Math.max(worst, overlapDepth(A, B)); });
  report(sim.shipCollide.stats.contacts > 0 && A.state.hull === h0[0] && B.state.hull === h0[1] && worst <= 3, `(f) a slow touch (a creep of ${(0.06 * config.SHIP.TOP_SPEED).toFixed(0)} px/s) presses without a mark on either hull (${sim.shipCollide.stats.contacts} contacts, worst overlap ${worst} px)`);
  pins.clear();
}

// ---- (b) a stationary HEAVIER ship is moved less ----
{
  pins.clear();
  const { sim, ships: [A, B], humans: [hA] } = boot();
  const massB = 450;
  Object.defineProperty(B.ctx.balance, 'mass', { get: () => massB, set() {}, configurable: true });
  const massA = massOf(A.ctx).mass;
  // position: the same overlap, one step, nobody moving
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 1100, 3000, 1);
  step(sim, 2);
  const xa = A.pose.x, xb = B.pose.x;
  B.pose.x -= 60; // 60 px of overlap, in the nose
  const xb1 = B.pose.x;
  step(sim, 1);
  const dA = Math.abs(A.pose.x - xa), dB = Math.abs(B.pose.x - xb1);
  report(overlapDepth(A, B) <= 3 && dA > dB * 1.5 && dB > 0, `(b) the same overlap, one step, nobody moving: the light ship (mass ${massA.toFixed(0)}) is moved ${dA.toFixed(1)} px, the heavy one (${massB}) ${dB.toFixed(1)} px (about the mass ratio ${(massB / massA).toFixed(1)}), and the hulls just touch (${overlapDepth(A, B)} px)`);
  // velocity: A rams the stationary heavy B
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 3000, 3000, 1);
  hA.thr = 1;
  step(sim, 2);
  const hits0 = sim.shipCollide.stats.hits;
  let sA0 = 0, sB0 = 0, first = -1, sA1 = 0, sB1 = 0;
  step(sim, 60 * 10, (i) => {
    if (first < 0 && sim.shipCollide.stats.hits > hits0) { first = i; sA1 = A.state.speed; sB1 = B.state.speed; }
    if (first < 0) { sA0 = A.state.speed; sB0 = B.state.speed; }
  });
  const dvA = Math.abs(sA1 - sA0), dvB = Math.abs(sB1 - sB0);
  report(first >= 0 && dvA > dvB * 1.5 && sB1 > 0, `(b) ship A rams the stationary heavy ship B: A's speed changes by ${dvA.toFixed(2)} (to ${sA1.toFixed(2)}), B's only by ${dvB.toFixed(2)} (to ${sB1.toFixed(2)}): the heavy one is shoved less`);
  pins.clear();
}

// ---- (c) coming about next to another ship ----
{
  pins.clear();
  const { sim, st, ships: [A, B], humans: [hA] } = boot();
  const f = A.pose.f;
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 5000, 3000, 1);
  step(sim, 2);
  // find where B must sit so that A's MIRRORED hull is inside her and her ordinary hull is not
  let spot = null, spans = [];
  for (let dy = -1000; dy <= 1000 && !spot; dy += 100) {
    let run = null;
    for (let dx = -2600; dx <= 2600; dx += 10) {
      B.pose.x = A.pose.x + dx; B.pose.y = A.pose.y + dy;
      const now = overlapsAnother(st, A, A.pose.f), mir = overlapsAnother(st, A, -A.pose.f);
      if (mir && !now) { if (!run) run = { dy, from: dx, to: dx }; else run.to = dx; } else if (run) { spans.push(run); run = null; }
    }
    if (run) spans.push(run);
    const best = spans.filter((s) => s.to - s.from >= 60).sort((p, q) => (q.to - q.from) - (p.to - p.from))[0];
    if (best) spot = { dx: (best.from + best.to) / 2, dy: best.dy, width: best.to - best.from };
  }
  report(!!spot, `(c) there are places beside the ship where her mirrored hull would sit in another ship and her own does not${spot ? ` (e.g. ${Math.round(spot.dx)} px along and ${spot.dy} px down, a ${spot.width} px wide band)` : ''}`);
  if (spot) {
    // 1. the refusal
    B.pose.x = A.pose.x + spot.dx; B.pose.y = A.pose.y + spot.dy; pins.set(B, B.pose.y);
    step(sim, 1);
    B.pose.x = A.pose.x + spot.dx; B.pose.y = A.pose.y + spot.dy;
    A.state.speed = 0;
    const why = A.sim.comeAbout.why();
    report(why === 'Another ship is in the way', `(c) COME ABOUT is refused with "${why}" while the other ship sits where her mirrored hull would go`);
    // 2. she turns in clear air, and the other ship drifts into the place her mirrored hull will take
    B.pose.x = A.pose.x + 6000; pins.set(B, A.pose.y);
    step(sim, 30);
    A.state.speed = 0;
    applyPlayerInput(st, hA, { jx: 0, jy: 0, ca: 1 });
    let started = false, moved = false, worst = 0, flipAt = -1, contactsAtFlip = 0, t = 0;
    const c0 = sim.shipCollide.stats.contacts;
    step(sim, 60 * 8, (i) => {
      t += DT;
      if (!started && st.turning.t > 0) { started = true; applyPlayerInput(st, hA, { jx: 0, jy: 0, ca: 0 }); }
      if (started && !moved && st.turning.t > TURN.TIME * 0.15) { moved = true; B.pose.x = A.pose.x + spot.dx; B.pose.y = A.pose.y + spot.dy; pins.set(B, B.pose.y); B.state.speed = 0; } // (she drifts in)
      worst = Math.max(worst, overlapDepth(A, B));
      if (flipAt < 0 && A.pose.f === -1) { flipAt = i; contactsAtFlip = sim.shipCollide.stats.contacts - c0; }
    });
    report(started && moved && A.pose.f === -1 && A.pose.turn === 0, '(c) ...she comes about in the end (f -1) with the other ship beside her');
    report(worst <= 3 && contactsAtFlip > 0 && overlapDepth(A, B) <= 3, `(c) ...and at the flip the mirrored hull is not left inside the other ship: the two are pushed apart in that step (${contactsAtFlip} contact(s)), the worst overlap in the whole turn ${worst} px`);
  }
  pins.clear();
}

// ---- (d) the ?ships=3 formation, bots aboard ----
for (const [label, gap, drop, minutes] of [['the ?ships=3 formation (250 px behind, 1150 below)', 250, 1150, quick ? 1 : 2], ['a tight formation (120 px behind, 350 below)', 120, 350, quick ? 0.5 : 1.5]]) {
  pins.clear();
  const { sim, st, ships } = boot({ n: 3, bots: 4, calm: false, clear: false, formation: (i) => ({ dx: -gap * i, dalt: -drop * i }) });
  const e0 = errors.length;
  let worst = 0, bad = 0, contacts0 = sim.shipCollide.stats.contacts;
  const steps = Math.round(minutes * 3600);
  step(sim, steps, () => { const w = worstOverlap(ships); if (w > 3) bad++; worst = Math.max(worst, w); });
  const gone = ships.filter((s) => s.ctx.wreck || s.state.down > 0).length;
  report(bad === 0 && errors.length === e0, `(d) ${label}: 3 ships with bots fly ${minutes} min with ${bad} overlapping step(s) (worst ${worst} px), ${sim.shipCollide.stats.contacts - contacts0} contact step(s), ${sim.shipCollide.stats.hits} hurting hit(s), ${errors.length - e0} error(s)${gone ? ', ' + gone + ' wrecked' : ''}`);
}

// ---- (e) a Versus round with bots ----
{
  pins.clear();
  config.MAPS.FORCE_KIND = null;
  config.ENVIRONMENTS.FORCE = null;
  clock = seedRandom(seed);
  const sim = createSimulation();
  const st = sim.state;
  sim.setSession('versus');
  const M = sim.match;
  M.addBots('red', 3);
  M.addBots('blue', 3);
  M.begin({ shelf: false });
  const [red, blue] = [M.shipOfTeam('red'), M.shipOfTeam('blue')];
  const e0 = errors.length;
  let guard = 0;
  while (M.phase !== 'fight' && guard++ < 60 * 20) step(sim, 1);
  let bad = 0, worst = 0, steps = 0;
  const secs = quick ? 40 : 90;
  step(sim, 60 * secs, () => { if (M.phase !== 'fight' && M.phase !== 'finale') return; steps++; const w = overlapDepth(red, blue); if (w > 3) bad++; worst = Math.max(worst, w); });
  report(steps > 60 * 20 && bad === 0 && errors.length === e0, `(e) a Versus round with bots (${steps} fight steps): ${bad} step(s) with the hulls overlapping (worst ${worst} px), ${sim.shipCollide.stats.contacts} contact step(s), ${errors.length - e0} error(s)`);
  // thrown into each other at full tilt in the middle of the fight: pushed apart, counted
  if (M.phase === 'fight') {
    const bumps0 = M.stats.red.bumps + M.stats.blue.bumps;
    const [L, R] = mid(red) < mid(blue) ? [red, blue] : [blue, red]; // (thrown nose into nose: the left ship facing right, the right one left, 200 px of their boxes inside each other)
    L.pose.f = 1; R.pose.f = -1; R.pose.y = L.pose.y;
    R.pose.x += box(L).x1 - 200 - box(R).x0;
    L.state.speed = 1; R.state.speed = 1;
    let w = 0;
    const was = overlapDepth(red, blue);
    step(sim, 90, () => { if (M.phase === 'fight') w = Math.max(w, overlapDepth(red, blue)); });
    report(was > 100 && w <= 3 && M.stats.red.bumps + M.stats.blue.bumps > bumps0, `(e) two ships put ${was} px inside each other in the middle of the fight are pushed clear in one step (worst overlap afterwards ${w} px) and the bump is counted for the teams (${bumps0} -> ${M.stats.red.bumps + M.stats.blue.bumps})`);
  }
}

// ---- (h) the RAM PROW is a big iron beak, part of the hull ----
{
  pins.clear();
  const { buildShelf } = await load('modules/host/pvp/shelf.js');
  const { buildLayout, onRamProw } = await load('modules/host/shipBuild.js');
  const { hullShapes } = await load('modules/host/shipCollide.js');
  const R = config.RAM;
  const ramParts = buildShelf().find((e) => e.id === 'ram').parts;
  const L0 = buildLayout(BUILDS.classic), L1 = buildLayout(ramParts);
  const nose = Math.max(...L1.hitRects.map((r) => r.x1)); // (the hull's farthest nose, the outriggers')
  report(L1.ram && L1.ram.tipX - nose >= 250 && L1.ram.tipX - nose <= 450 && L1.bounds.x1 >= L1.ram.tipX && L1.fitBox.x1 >= L1.ram.tipX && L1.caveNeed.shaft >= L0.caveNeed.shaft, `(h) the prow sticks out ${Math.round(L1.ram ? L1.ram.tipX - nose : 0)} px past the hull's nose; the bounds (${L1.bounds.x1}) and the cave box (${L1.fitBox.x1}, ${L1.caveNeed.shaft} squares across against ${L0.caveNeed.shaft}) grow with it, and the classic ship is untouched (${L0.ram === undefined})`);
  report(L0.ram === undefined && L0.bounds.x1 === 1810, `(h) ...a ship without one has no ram field and her bounds are as ever (${L0.bounds.x1})`);
  const y = L1.ram.y;
  report(onRamProw(L1, L1.ram.tipX - 4, y) && !onRamProw(L1, L1.ram.tipX + 6, y) && !onRamProw(L1, L1.ram.x + 200, y - 120) && onRamProw(L1, L1.ram.x + 20, y + 40), '(h) a shell that lands on the prow strikes iron (onRamProw): the point and the collar yes, the air above the beak no');
  const { sim, st, ships: [A, B], humans: [hA, hB] } = boot({ parts: ramParts });
  report(hullShapes(B).filter((s) => s.ram).length === 1 && hullShapes(A).filter((s) => s.ram).length === 0, '(h) the prow is one of the hull shapes of the ship that has it (and the other has none)');
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 5200, 3000, -1); // B (the prow) comes about to face A, level with her
  hA.thr = hB.thr = 1;
  A.state.speed = B.state.speed = 1;
  const hull0 = [A.state.hull, B.state.hull];
  let banner = false, boom = false, word = false, shake = 0;
  step(sim, 60 * 8, () => {
    if ((st.ev.warnText || '').startsWith('RAMMED!')) banner = true;
    if (st.sfxQ.some((q) => q[0] === 'ramHit')) boom = true;
    if ((st.popups || []).some((p) => p.text === 'RAMMED!')) word = true;
    shake = Math.max(shake, A.ctx.ship.shake);
    st.sfxQ.length = 0;
  });
  const lostA = hull0[0] - A.state.hull, lostB = hull0[1] - B.state.hull;
  report(banner && boom && word && shake >= R.SHAKE * 0.9 && B.ramHits === 1 && !A.ramHits, `(h) a prow meeting lands as a RAM: the RAMMED! stamp, the iron boom, the word in the sky and a shake of ${shake.toFixed(2)}; the prow shows ${B.ramHits} scuff and the other ship none`);
  report(lostA > 2.5 * lostB && lostB >= 0, `(h) ...and the ship without a prow takes the brunt: hull lost ${lostA.toFixed(1)} against the rammer's ${lostB.toFixed(1)}`);
  pins.clear();
}

// ---- (g) the controls ----
{
  pins.clear();
  config.MAPS.FORCE_KIND = null;
  const solo = createSimulation();
  const s0 = solo.shipCollide.stats.contacts;
  for (let i = 0; i < 120; i++) { clock.ms += DT * 1000; solo.update(DT); }
  report(solo.state.ships.length === 1 && solo.shipCollide.stats.contacts === s0, '(g) with ONE ship (co-op) nothing runs');
  C.ENABLED = false;
  const { sim, ships: [A, B], humans: [hA, hB] } = boot();
  stand(A, 3000, 3000, 1);
  stand(B, 3000 + 4200, 3000, -1);
  hA.thr = hB.thr = 1;
  let worst = 0, crossed = false;
  step(sim, 60 * 12, () => { worst = Math.max(worst, overlapDepth(A, B)); if (mid(B) < mid(A)) crossed = true; });
  C.ENABLED = true;
  report(crossed && worst > 200, `(g) CONTROL: with COLLIDE.ENABLED false the same two ships pass straight through each other (overlap up to ${worst} px), so (a) is measuring the collision`);
  pins.clear();
}

report(errors.length === 0, `no game error in any of it (${errors.length})${errors.length ? ': ' + errors[0] : ''}`);
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
