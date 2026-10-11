// THE RING gate (package R0, LOOP.md "The 3D add-on"; maps.js buildRingMap, ring.js, ringArt.js, config.RING). Headless, seeded.
//   node tools/buildsim.mjs --check-ring     or directly:  node tools/ring-check.mjs [--seed 1] [--quick]
//
//   (a) the ring maps build for each variant: C = 2 pi R, the faces (tower 1, fortress 4, citadel 2) with their guns, a core, a special; spires on the ring stretch; the approach about a third of the map;
//       every face has a station the ship can reach; the same seed builds the same map
//   (b) the shutter: shut while a face's guns stand; opens for OPEN_FOR s as the last gun falls, then every EVERY s; a shell takes points off the core only while it is open (a shut one chips the keep's pool)
//   (c) revolving turrets move round the ring at their speed and wrap at its end
//   (d) the gallery is a landing surface (and a hookshot anchor); a crewman who lands on it walks to the keep door, holds Action, and the charge breaches the face
//   (e) victory: every core down, or the keep's pool: the crown falls (slow motion, "THE TOWER FALLS!"), the stop completes, the reward is paid, the Ship's Book has the moments
//   (f) the citadel moors the Flagship; breaking the moorings at both faces drops her; the old hit-point path still sinks her
//   (g) 3 seeds x 3 minutes with 8 bots on every variant: the faces fall, 0 errors, no NaN
//   (h) the tower is won by 4 bots on Easy
//   (i) a curriculum stop flagged 'ring' flies the ring map (QUICK and VOYAGE); switching RING.ENABLED off gives back the raid
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed0 = Number(flag('seed', 1));
const quick = argv.includes('--quick');
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed0); // (each seedRandom makes a new clock: boot() takes it)
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const VG = await load('modules/host/voyage.js');
const { stationDist } = await load('modules/host/maps.js');
const { toShipY } = await load('modules/host/pose.js');
const RG = config.RING;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const KEEP = { VOYAGE: config.VOYAGE.CURRICULUM.ENABLED, LAIRS: config.CREATURES.LAIR.COUNT };
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.PACING.RATE_START = config.PACING.RATE_END = 0; // (nothing spawns by itself in the scenarios; the 3-minute runs put it back)
const PACING0 = { s: 1, e: 1 };

// A fresh seeded sim on a ring map. opts: bots (default 0), human (a person-like crewman), variant.
function boot(seed, o = {}) {
  clock = seedRandom(seed);
  config.VOYAGE.CURRICULUM.ENABLED = false;
  config.MAPS.FORCE_KIND = 'ring';
  config.RING.FORCE_VARIANT = o.variant || 'tower';
  config.RING.FORCE_BOARD = false;
  const sim = createSimulation();
  const st = sim.state;
  st.difficulty = o.difficulty || 'easy';
  const e = st.ships[0].layout.boarderEntryPoints;
  for (let i = 0; i < (o.bots ?? 0); i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  if (o.human) st.players.h1 = { id: 'h1', name: 'Mia', species: config.CREW_SPECIES[0], color: '#3a86ff', x: e[0].x, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  sim.castOff();
  const step = (n = 1, keep = true) => {
    for (let i = 0; i < n; i++) {
      clock.ms += DT * 1000;
      sim.update(DT);
      if (keep) st.ship.hull = 100;
    }
  };
  if (o.keepSky !== false) { config.PACING.RATE_START = config.PACING.RATE_END = 0; }
  step(60);
  const sh = st.ships[0], REF = sh.layout.refPoint;
  // Put the ship over a world point (her reference point there).
  const park = (x, y) => { sh.pose.x = x - REF.x; sh.pose.y = y - REF.y; st.ship.vy = 0; st.ship.speed = 0; };
  return { sim, st, step, sh, REF, park, ring: () => st.course.ring, map: () => st.course.map };
}
const kill = (st, f) => { for (const t of st.course.turrets) if (t.outpost === f.i) t.dead = true; };
const shellAt = (st, x, y, owner = 'h1') => st.shells.push({ x, y, vx: 0, vy: 0, life: 1, owner, from: 'ship0' });
const finite = (st) => { const r = st.course.ring, sh = st.ships[0]; return [sh.pose.x, sh.pose.y, st.ship.hull, ...(r ? [r.keep.hp, ...r.faces.map((f) => f.hp), ...st.course.turrets.map((t) => t.mx ?? 0)] : []), ...(st.boss ? [st.boss.x, st.boss.y] : [])].every((v) => Number.isFinite(v)); };

// ---- (a) the maps ----
{
  const want = { tower: 1, fortress: 4, citadel: 2 };
  for (const v of ['tower', 'fortress', 'citadel']) {
    const { st, map, ring } = boot(seed0, { variant: v });
    const m = map(), r = m.ring, V = RG.VARIANTS[v];
    const C = 2 * Math.PI * V.R;
    report(m.kind === 'ring' && m.open && r.variant === v && Math.abs(r.C - C) < 1 && r.R === V.R, `${v}: a ring map, R ${r.R}, C = ${Math.round(r.C)} px (2 pi R = ${Math.round(C)})`);
    report(r.faces.length === want[v] && m.outposts.length === want[v] && ring().faces.length === want[v], `${v}: ${r.faces.length} face${want[v] > 1 ? 's' : ''}, each an outpost`);
    const gunsOk = r.faces.every((f) => m.turrets.filter((t) => t.outpost === f.i).length === V.TURRETS) && r.faces.every((f) => f.core && f.special && f.core.w > 0);
    report(gunsOk, `${v}: ${V.TURRETS} guns, a core and a special on every face (specials ${r.faces.map((f) => f.special.kind).join('/')})`);
    const frac = r.xRing / (m.W * m.CELL);
    report(r.spires.length >= Math.round(V.SPIRES * 0.4) && frac > 0.22 && frac < 0.45, `${v}: ${r.spires.length} spires on the ring stretch, the approach is ${(frac * 100).toFixed(0)}% of the map (${m.W} x ${m.H} cells)`);
    const reach = m.outposts.every((o) => Number.isFinite(stationDist(m, o, m.start.x, m.start.y)) && stationDist(m, o, m.start.x, m.start.y) < 1e8);
    const platOk = r.faces.every((f) => { const i = Math.floor(f.x / m.CELL), j = Math.floor(f.y / m.CELL); return m.solid[j * m.W + i] === 1 && m.solid[(j - 1) * m.W + i] === 0; });
    report(reach && platOk && Number.isFinite(m.startDist) && m.startDist < 1e8, `${v}: every face has a platform and a station the ship can reach (route ${m.startDist} cells)`);
    const turretsRev = m.turrets.filter((t) => t.rev);
    report(turretsRev.length === V.REV && (v === 'tower' ? !r.faces.some((f) => f.gal) : true), `${v}: ${turretsRev.length} revolving turret${turretsRev.length === 1 ? '' : 's'}, ${r.faces.filter((f) => f.gallery).length} gallery`);
    void st;
  }
  const A = boot(5, { variant: 'fortress' }).map(), B = boot(5, { variant: 'fortress' }).map();
  const same = A.W === B.W && A.solid.every((v, i) => v === B.solid[i]) && JSON.stringify(A.ring.faces) === JSON.stringify(B.ring.faces);
  report(same, 'the same seed builds the same fortress');
}

// ---- (b) the shutter ----
{
  const { st, step, ring, map, park } = boot(seed0, { variant: 'tower', human: true });
  const f = ring().faces[0], c = f.core, O = RG.CORE;
  park(f.x, f.y - 1400);
  step(30);
  report(f.open === 0 && f.windows === 0, 'the shutter is shut while the face has guns standing');
  shellAt(st, c.x, c.y);
  const hp0 = f.hp, keep0 = ring().keep.hp;
  step(2);
  report(f.hp === hp0 && ring().keep.hp < keep0 && ring().keep.hp >= keep0 - 1, `a shell on the shut shutter does nothing to the core (${f.hp}/${f.max}) and chips the keep's pool a little (${keep0} -> ${ring().keep.hp})`);
  kill(st, f);
  step(2);
  let elapsed = 2; // (steps since the shutter first opened)
  const stepE = (k) => { elapsed += k; step(k); };
  report(f.open > 0 && f.open <= O.OPEN_FOR && f.windows === 1 && /SHUTTER OPEN/.test(st.ev.warnText), `the last gun falls and the shutter opens for ${O.OPEN_FOR} s (open ${f.open.toFixed(1)}; banner "${st.ev.warnText}")`);
  const aimed = st.shells.length;
  shellAt(st, c.x, c.y);
  stepE(2);
  report(f.hp === hp0 - O.SHELL && st.shells.length === aimed, `a shell on the open core takes ${O.SHELL} point off it (${f.hp}/${f.max}) and is spent`);
  stepE(Math.round(O.OPEN_FOR * 60));
  report(f.open === 0 && f.windows === 1, 'the shutter shuts again after the window');
  shellAt(st, c.x, c.y);
  const hp1 = f.hp;
  stepE(2);
  report(f.hp === hp1, 'a shell on the shut core takes nothing off it');
  // the next window: EVERY seconds after the first one opened
  while (f.windows < 2 && elapsed < O.EVERY * 60 + 600) stepE(1);
  report(f.windows === 2 && f.open > 0 && Math.abs(elapsed / 60 - O.EVERY) < 0.5, `it opens again every ${O.EVERY} s (the second window opened ${(elapsed / 60).toFixed(1)} s after the first)`);
  const bombs = st.shipBombs.length;
  st.shipBombs.push({ x: c.x, y: f.y + 5, vx: 0, vy: 0, owner: 'h1' });
  const before = f.hp;
  step(1);
  void bombs;
  // (a bomb blast on the open core)
  report(f.hp === before - O.BOMB, `bombs: ${f.hp}/${f.max} after a bomb falls on the open core (BOMB = ${O.BOMB})`);
  void map;
}

// ---- (c) revolving turrets ----
{
  const { st, step, ring, map } = boot(seed0, { variant: 'fortress', human: true });
  const revs = st.course.turrets.filter((t) => t.rev);
  const x0 = revs.map((t) => t.mx);
  step(300);
  const moved = revs.map((t, i) => t.mx - x0[i]);
  const speed = RG.VARIANTS.fortress.OMEGA * RG.VARIANTS.fortress.R;
  report(revs.length === 2 && moved.every((d) => Math.abs(d - speed * 5) < 2), `the revolving turrets move round the ring at ${speed.toFixed(0)} px/s (moved ${moved.map((d) => d.toFixed(0)).join(', ')} px in 5 s)`);
  const t = revs[0];
  t.mx = ring().xRing + ring().C - 10;
  const w0 = ring().stats.wraps;
  step(60);
  report(ring().stats.wraps === w0 + 1 && t.mx < ring().xRing + 400, 'at the end of the ring a revolving turret wraps round to its start');
  const aimX = (st.course.turrets.find((q) => q.rev) || {}).vx;
  report(aimX === speed, 'the gunners lead a revolving turret by its speed (aim.js sees vx = ' + aimX + ')');
  void map;
}

// ---- (d) the gallery ----
{
  const { sim, st, step, ring, park, REF, sh } = boot(seed0, { variant: 'fortress', human: true });
  const f = ring().faces.find((q) => q.gal);
  const g = f.gal;
  park(g.door - 1700, g.y - 500); // (the gallery out beyond her nose, clear of her own decks)
  step(30);
  const surf = sh.sim.air.surfaces().find((s) => s.id === 'ring:gallery' + f.i);
  report(!!surf && Number.isFinite(surf.y) && surf.onLand, `the gallery of face ${f.i + 1} is a landing surface (id ${surf && surf.id})`);
  const hook = st.stunts && st.stunts.cast({ x: g.door - 300, y: g.y - 300 }, 0, 1);
  report(!!hook && !!hook.anchor && hook.anchor.surf === true, 'a hookshot cast down at the gallery catches on it (an anchor you can reel up to)');
  const p = st.players.h1;
  p.fall = false;
  p.d = undefined;
  sh.sim.air.startFlight(p, 0, 0);
  p.x = g.door - 300;
  p.y = g.y - 120;
  p.fvy = 150;
  p.lsy = p.apex = toShipY(sh, p.y); // (where she was last step, on the ship: the landing test)
  step(40);
  report(!!p.on && p.on.ring === f.i && p.fly && Math.abs(p.y - g.y) < 2, `a crewman who falls onto the gallery lands on it (on ring ${p.on && p.on.ring})`);
  // walk to the door, hold Action
  p.jx = 1;
  for (let i = 0; i < 400 && Math.abs(p.on.x - g.door) > 60; i++) step(1);
  p.jx = 0;
  report(Math.abs(p.on.x - g.door) <= 90, `he walks the ledge to the keep door (x ${Math.round(p.on.x)} of ${Math.round(g.door)})`);
  p.fire = true;
  step(Math.round((RG.GALLERY.PLANT_TIME - 1) * 60));
  report(!f.charge && g.job.prog > 0.4, `holding Action plants the charge (${Math.round(g.job.prog * 100)}% after ${RG.GALLERY.PLANT_TIME - 1} s)`);
  step(Math.round(1.6 * 60));
  p.fire = false;
  report(!!f.charge && f.charge.by === 'h1' && /CHARGE SET/.test(st.ev.warnText), `the charge is set (fuse ${f.charge && f.charge.t.toFixed(1)} s; banner "${st.ev.warnText}")`);
  p.jumpQ = true;
  step(2);
  report(!p.on, 'JUMP leaves the gallery');
  step(Math.round((RG.GALLERY.FUSE + 1) * 60));
  report(f.down && f.how === 'charge' && st.course.map.outposts[f.i].done && ring().stats.charges === 1, 'the charge breaches the face (core gone, the outpost done)');
  const Mom = (st.moments || []).filter((m) => m.kind.startsWith('ring-'));
  report(Mom.some((m) => m.kind === 'ring-charge' && m.who[0] === 'Mia') && Mom.some((m) => m.kind === 'ring-breach' && m.who[0] === 'Mia'), `the Ship's Book has it: ${Mom.map((m) => m.kind + ' (' + m.who + ')').join(', ')}`);
  void sim; void REF;
}

// ---- (e) victory ----
{
  const { sim, st, step, ring, park } = boot(seed0, { variant: 'tower', human: true });
  const r = ring(), f = r.faces[0];
  park(f.x, f.y - 1400);
  kill(st, f);
  step(2);
  const salvage0 = st.run.salvage;
  const rs = sim.course.ringSys;
  f.hp = 1;
  rs.hitCore(f, 5, 'h1', 'shell');
  step(2);
  report(f.down && r.crown && r.crown.how === 'cores' && /THE TOWER FALLS!/.test(st.ev.warnText) && st.slow < 1, `all cores down: the crown falls ("${st.ev.warnText}"), slow motion x${st.slow}`);
  report(!st.course.done, 'the stop is not complete yet (the crown is falling)');
  step(Math.round((RG.CROWN.DONE_AFTER + 1) * 60));
  report(st.course.done && st.slow === 1 && !!st.scorecard && st.scorecard.stopName && st.run.salvage > salvage0, `then the stop completes: the scorecard is up (${st.scorecard && st.scorecard.stopName}), salvage ${salvage0} -> ${st.run.salvage}, slow motion over`);
  const kinds = (st.moments || []).map((m) => m.kind);
  report(kinds.includes('ring-breach') && kinds.includes('ring-fall'), `the Ship's Book has the moments (${[...new Set(kinds.filter((k) => k.startsWith('ring-')))]})`);
}
{
  const { sim, st, step, ring, park } = boot(seed0 + 1, { variant: 'fortress', human: true });
  const r = ring();
  park(r.faces[0].x, r.faces[0].y - 1400);
  r.keep.hp = 0.2;
  sim.course.ringSys.chip(0.5);
  step(2);
  report(r.crown && r.crown.how === 'keep' && r.faces.every((f) => f.down) && /THE FORTRESS FALLS!/.test(st.ev.warnText), `the keep's pool at 0 breaches every gate at once: "${st.ev.warnText}"`);
  step(Math.round((RG.CROWN.DONE_AFTER + 1) * 60));
  report(st.course.done, 'and the stop completes');
}

// ---- (f) the citadel ----
{
  const { sim, st, step, ring, park } = boot(seed0, { variant: 'citadel', human: true });
  const r = ring();
  park(r.moor.x, r.moor.y + 1900);
  step(120);
  const z = st.boss;
  report(!!z && z.flagship && z.moor === r.moor && Math.abs(z.x - r.moor.x) < 100 && Math.abs(z.y - r.moor.y) < 100, `the Flagship is moored at the citadel (${z && Math.round(z.x)},${z && Math.round(z.y)} of ${Math.round(r.moor.x)},${Math.round(r.moor.y)})`);
  step(300);
  report(z && Math.abs(z.x - r.moor.x) < 100, 'she stays on her mooring (no drifting off with the ship)');
  const [f0, f1] = r.faces;
  for (const f of r.faces) { f.open = 5; f.windows = 1; }
  sim.course.ringSys.hitCore(f0, 99, 'h1', 'bomb');
  step(2);
  report(f0.down && r.moor.cut[0] && !r.moor.cut[1] && !r.moor.falling && st.boss === z && !r.crown, `breaking one face cuts one mooring; she hangs on (${r.moor.cut.join('/')})`);
  sim.course.ringSys.hitCore(f1, 99, 'h1', 'bomb');
  step(2);
  report(r.moor.cut.every(Boolean) && r.moor.falling && st.boss === z, 'breaking the other cuts the last: she falls');
  for (let i = 0; i < (RG.MOOR.FALL_TIME + 3) * 60 && !r.crown; i++) step(1);
  report(!st.boss && st.bossDownLap === st.course.lap && !!r.crown && /THE CITADEL FALLS!/.test(st.ev.warnText), `she is sunk, the citadel falls ("${st.ev.warnText}", crown by ${r.crown && r.crown.how})`);
  step(Math.round((RG.CROWN.DONE_AFTER + 1) * 60));
  report(st.course.done && !!st.scorecard, 'and the Flagship stop completes (the scorecard is up)');
}
{
  const { sim, st, step, ring, park } = boot(seed0 + 2, { variant: 'citadel', human: true });
  const r = ring();
  park(r.moor.x, r.moor.y + 1900);
  step(120);
  const z = st.boss;
  z.hp = 0.2;
  shellAt(st, z.x, z.y);
  step(3);
  report(!st.boss && st.bossDownLap === st.course.lap && !!r.crown, 'the old hit-point path still sinks a moored Flagship (and the citadel falls with her)');
}

// ---- (g) bots, 3 seeds x 3 minutes ----
{
  config.PACING.RATE_START = 1;
  for (const v of ['tower', 'fortress', 'citadel']) {
    const seeds = quick ? [1] : [1, 2, 3];
    const rows = [];
    let errors = 0, nan = 0;
    for (const sd of seeds) {
      const { st, step } = boot(sd, { variant: v, bots: 8, keepSky: false });
      config.PACING.RATE_START = config.PACING.RATE_END = 1;
      const r0 = st.course.ring;
      for (let i = 0; i < 3 * 3600; i++) {
        try { step(1, false); } catch (e) { errors++; if (errors < 3) console.log('  error: ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
        if (i % 600 === 0 && !finite(st)) nan++;
        if (st.phase === 'lobby') break;
      }
      rows.push(r0.faces.filter((f) => f.down).length + '/' + r0.faces.length + (r0.crown ? ' fell' : ''));
    }
    report(errors === 0 && nan === 0 && rows.every((x) => !x.startsWith('0/')), `${v}: 3 seeds x 3 min, 8 bots: faces breached ${rows.join(', ')}; ${errors} errors, ${nan} NaN`);
  }
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
}

// ---- (h) the tower won by 4 bots on Easy ----
{
  config.PACING.RATE_START = 1;
  const won = [];
  for (const sd of quick ? [1, 2] : [1, 2, 3, 4]) {
    const { st, step } = boot(sd, { variant: 'tower', bots: 4, difficulty: 'easy', keepSky: false });
    config.PACING.RATE_START = config.PACING.RATE_END = 1;
    const r0 = st.course.ring;
    let t = null;
    for (let i = 0; i < 8 * 3600 && t === null; i++) { step(1, false); if (r0.crown) t = i / 3600; if (st.phase === 'lobby') break; }
    won.push(t === null ? 'no' : t.toFixed(1) + ' min');
  }
  report(won.every((x) => x !== 'no'), `the tower is won by 4 bots on Easy within 8 minutes on every seed: ${won.join(', ')}`);
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
}

// ---- (i) the curriculum ----
{
  clock = seedRandom(seed0);
  config.MAPS.FORCE_KIND = null;
  config.RING.FORCE_VARIANT = null;
  config.VOYAGE.CURRICULUM.ENABLED = true;
  const flown = [];
  for (const mode of ['quick', 'voyage']) {
    for (const sd of quick ? [11] : [11, 12]) {
      const sim = createSimulation();
      const st = sim.state;
      sim.setSession(mode, false);
      sim.setStartBuild('classic');
      const e = st.ships[0].layout.boarderEntryPoints;
      for (let i = 0; i < 4; i++) st.players['b' + i] = { id: 'b' + i, bot: true, name: 'B' + i, species: config.CREW_SPECIES[0], color: '#fff', x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
      sim.castOff();
      const v = VG.generateVoyage(sd * 7919, { mode });
      st.run.voyage = v; // (the voyage under test)
      st.run.stopId = v.columns[0][0].id;
      const ringStops = v.columns.flat().filter((s) => s.ring);
      let all = ringStops.length > 0;
      for (const s of ringStops) {
        if (s.kind !== 'ring') all = false;
        const prev = v.columns[s.col - 1].find((q) => q.next.includes(s.id)); // (a stop of the column before that leads to it)
        st.run.stopId = prev.id;
        sim.startRoute();
        const idx = st.vote.options.findIndex((o) => o.id === s.id);
        if (idx < 0) { all = false; continue; }
        for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = idx; }
        for (let i = 0; i < 60 * 3; i++) { clock.ms += DT * 1000; sim.update(DT); }
        const m = st.course.map;
        const okMap = st.course.stop.id === s.id && m.kind === 'ring' && m.ring.variant === s.ring;
        if (!okMap) all = false;
        flown.push(`${mode}:${s.ring}${okMap ? '' : '!'}`);
      }
      report(all, `${mode} (seed ${sd}): ${ringStops.length} ring stop${ringStops.length === 1 ? '' : 's'} (${ringStops.map((s) => s.ring).join(', ')}) fly the ring map${all ? '' : ' [' + flown.join(' ') + ']'}`);
    }
  }
  config.RING.ENABLED = false;
  const v = VG.generateVoyage(77, { mode: 'voyage' });
  const rs = v.columns.flat().filter((s) => s.ring);
  report(rs.length > 0 && rs.every((s) => (s.flagship ? s.kind === 'network' : s.kind === 'open')), 'with RING.ENABLED false the ring stops are the old raid again (the switch)');
  config.RING.ENABLED = true;
  config.VOYAGE.CURRICULUM.ENABLED = KEEP.VOYAGE;
  void flown;
}

config.CREATURES.LAIR.COUNT = KEEP.LAIRS;
void PACING0;
console.log(ok ? 'ring check: PASS' : 'ring check: FAIL');
process.exit(ok ? 0 : 1);
