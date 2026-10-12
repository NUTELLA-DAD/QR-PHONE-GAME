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
//   THE GARRISON (CASTLE.md D1, garrison.js, config.GARRISON):
//   (j) archers: 2 posts a face; a 1.2 s tell (horn, flag, arc) then a 24-32 arrow volley, one telegraph at a time; weak arrows, 45% aimed to miss, marks in the hit log; counters: altitude, a searchlight (dazzle), the Deflector,
//       armour plate, shells and bombs on a post; a breach silences a face; fire arrows burn on the citadel and light a deck by igniteChance
//   (k) the ballista: a 1.5 s lock with an aim-line that freezes, then a straight bolt that bites a segment and makes a double gas hole; the helm's jink raises its miss
//   (l) manned guns and squads: gun crews (a dead crew slows its gun x2), plaza squads (shells take 2 men, a bomb kills a squad: salvage and a Book moment), cheer after a hit, flee on a breach, surrender on the crown
//   (m) grapples from below: the keel near a squad for 1.5 s -> a swing (the tell) -> a ring zip -> raiders aboard; cool-downs
//   (n) the catapult's stones (burning on the citadel, a flame where they land) and the boom chain (the lookout's call, snag + drag + bag ticks, snaps by strain / shells / bombs, diving under passes; the helm bots dive)
//   (o) fairness: the garrison's damage at most 60% of the face guns', on paper (config) and in play (8 bots, power landed)
//   (p) F12, small ships crack castles: a ship with no bomb bay (the Sparrow) has her guns' magazines filled as a shutter opens (RING.FAIR); the classic ship keeps the bay's refill; NO_RINGFAIR=1 is the old ring
//   (q) F12: a limp home keeps the gates the crew had breached (RING.FAIR.KEEP_GATES); the old castle's Flagship is not carried over to the new one
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
const { UPGRADE_BLOCKS } = await load('modules/host/upgrades.js');
const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
const UPGRADES0 = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]]))); // (F6: what the sky-dock's fittings change, as it was before any scenario: a stop that ends in a dock must not leave a better ship for the next)
const restoreUpgrades = (target, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreUpgrades(target[k], v); else target[k] = copyData(v); } };
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
  restoreUpgrades(config, UPGRADES0);
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
  let envo = null;
  const step = (n = 1, keep = true) => {
    for (let i = 0; i < n; i++) {
      if (envo && envo.hold) envo.park(envo.hold.x, envo.hold.y); // (a test can hold the ship where it put her: nobody is flying her)
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
  envo = { sim, st, step, sh, REF, park, ring: () => st.course.ring, map: () => st.course.map, hold: null };
  return envo;
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
  if (st.course.escape) step(Math.round((config.STOP_SHAPE.ESCAPE.TIME + 1) * 60)); // (F6: the escape calm comes before the scorecard)
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
  if (st.course.escape) step(Math.round((config.STOP_SHAPE.ESCAPE.TIME + 1) * 60)); // (F6: the escape calm comes before the scorecard)
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
  if (st.course.escape) step(Math.round((config.STOP_SHAPE.ESCAPE.TIME + 1) * 60)); // (F6: the escape calm comes before the scorecard)
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
    report(errors === 0 && nan === 0 && rows.filter((x) => !x.startsWith('0/')).length >= Math.ceil(rows.length * 0.6), `${v}: 3 seeds x 3 min, 8 bots (a face falls in at least 2 of 3 runs, the castle now shoots back): faces breached ${rows.join(', ')}; ${errors} errors, ${nan} NaN`);
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
    for (let i = 0; i < 8 * 3600 && t === null; i++) { step(1, false); if (r0.crown || (st.course.ring && st.course.ring.crown)) t = i / 3600; if (st.phase === 'lobby') break; } // (F5: a wreck that limps home on a spare remakes the ring: the tower won by the second attempt counts)
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

// ======================================================================================================================================================================
// THE GARRISON (CASTLE.md package D1; garrison.js, config.GARRISON). Every test below is on a fresh, seeded ring with nothing else in the sky.
// ======================================================================================================================================================================
const GA = config.GARRISON;
const PATROL0 = config.ESCORT.AUTO_PATROL;
config.ESCORT.AUTO_PATROL = false; // (no patrol planes strafing the posts while a test counts them; the bot runs at the end have them back)
const toWX = (sh, x) => x + sh.pose.x, toWY = (sh, y) => y + sh.pose.y; // (the ship faces right in these tests)
// Run a post's volley to its end (the other posts wait): returns the arrows it loosed. lit: hold a searchlight on the post.
function volley(env, p, lit = false) {
  const { step, st } = env;
  const out = [], seen = new Set();
  for (const q of env.ring().faces.flatMap((f) => f.posts)) if (q !== p) q.t = Math.max(q.t, 999);
  p.t = 0;
  for (let i = 0; i < 60 * 12; i++) {
    if (lit) p.lit = 1;
    step(1);
    for (const b of st.bullets) if (b.arrow && !seen.has(b)) { seen.add(b); out.push(b); }
    if (p.mode === 'idle' && p.t > 5 && out.length) break;
  }
  return out;
}

// ---- (j) the archers ----
{
  const env = boot(seed0, { variant: 'fortress', human: true });
  const { st, step, ring, park, sh } = env, A = GA.ARCHER;
  const r = ring(), f = r.faces[0];
  park(f.x, f.y - 1400);
  env.hold = { x: f.x, y: f.y - 1400 };
  const [p0, p1] = f.posts;
  report(f.posts.length === A.POSTS && f.posts.every((p) => p.hp === A.HP && !p.dead && p.y === f.y - A.UP) && ring().faces.every((q) => q.posts.length === A.POSTS), `every face has ${A.POSTS} archer posts on its wall walk (${A.UP} px up, hp ${A.HP})`);
  // the tell: the horn, the flag, the arc - one at a time
  p0.t = 0;
  p1.t = 0;
  step(2);
  const tellers = f.posts.filter((p) => p.mode === 'tell');
  report(tellers.length === 1 && r.gar.busy === tellers[0] && f.flag > 0 && f.horn > 0 && st.sfxQ.some((a) => a[0] === 'horn') && Math.abs(tellers[0].telegraph - (A.TELL - 2 / 60)) < 0.05 && !!tellers[0].aim, `a post tells for ${A.TELL} s with the horn and the flag up (p.telegraph ${tellers[0] && tellers[0].telegraph.toFixed(2)}, an aim point), and only ONE post tells at a time`);
  let n = 0;
  while (tellers[0].mode === 'tell' && n < 200) { step(1); n++; }
  report(Math.abs(n / 60 - A.TELL) < 0.1 && tellers[0].mode === 'loose', `...and looses after ${(n / 60).toFixed(2)} s`);
  // the volleys
  const a0 = r.gar.stats.arrows;
  const hitLog0 = st.hitLog.length;
  let hits = 0, hitPow = 0;
  st.onBulletHit = (b) => { if (b.arrow) { hits++; hitPow += b.dmg; } };
  const arrows = [];
  for (let v = 0; v < 8; v++) arrows.push(...volley(env, v % 2 ? p1 : p0));
  const per = (r.gar.stats.arrows - a0) / 8;
  const miss = arrows.filter((b) => b.miss).length / arrows.length;
  report(per >= A.COUNT[0] && per <= A.COUNT[1] && arrows.every((b) => b.ay > 0 && b.dmg === A.DMG && b.kind === 'arrow'), `a volley is ${A.COUNT[0]}-${A.COUNT[1]} lobbed arrows (${per.toFixed(1)} on average; ay ${A.GRAVITY}, power ${A.DMG} each)`);
  report(Math.abs(miss - A.MISS) < 0.1, `${(miss * 100).toFixed(0)}% of the arrows are aimed to miss (${(A.MISS * 100).toFixed(0)}%)`);
  const marks = st.hitLog.slice(hitLog0).filter((h) => h.kind === 'arrow');
  report(hits > 20 && marks.length > 5 && hitPow <= hits * A.DMG + 1e-6, `they pepper the ship: ${hits} arrows landed (${hitPow.toFixed(1)} power in all) and left ${marks.length} marks in the hit log (kind 'arrow')`);
  // the counters
  {
    // altitude: a ship far above the post is out of the arrows' climb
    env.hold = { x: f.x, y: f.y - 3000 };
    park(env.hold.x, env.hold.y);
    hits = 0;
    const high = [];
    for (let v = 0; v < 4; v++) high.push(...volley(env, v % 2 ? p1 : p0));
    report(high.length > 50 && hits === 0, `altitude: ${high.length} arrows at a ship 3000 px up (${A.CLIMB} px is their climb) hit ${hits} times`);
    env.hold = { x: f.x, y: f.y - 1400 };
    park(env.hold.x, env.hold.y);
  }
  {
    hits = 0;
    const dz = [];
    for (let v = 0; v < 6; v++) dz.push(...volley(env, v % 2 ? p1 : p0, true));
    const m = dz.filter((b) => b.miss).length / dz.length;
    report(m > 0.82, `a searchlight on the post dazzles it: ${(m * 100).toFixed(0)}% miss (${(A.DAZZLE_MISS * 100).toFixed(0)}%)`);
  }
  {
    const L = sh.layout.shield, x = toWX(sh, L.cx + L.rx), y = toWY(sh, L.cy); // (the bullet loop asks every ship's Deflector about every shot, arrows too: the arc is the same)
    st.shield.on = true;
    st.shield.ang = 0;
    const blocked = sh.sim.shieldBlocks(x, y);
    st.shield.on = false;
    report(blocked && !sh.sim.shieldBlocks(x, y), 'the Deflector stops an arrow (and only while it is up)');
  }
  {
    const y = sh.layout.platforms[3].y - 20, x = 700; // (the main deck)
    sh.layout.armour = [{ d: 3, x0: 0, x1: 1500 }];
    const s0 = st.ship.shake = 0, plated0 = st.fireStats.plated;
    sh.sim.impact(x, y, A.DMG, 1, 'arrow');
    const onPlate = st.ship.shake, platedAfter = st.fireStats.plated;
    sh.sim.impact(x, y, 1, 1, 'hit');
    const platedHit = st.fireStats.plated;
    sh.layout.armour = [];
    st.ship.shake = 0;
    sh.sim.impact(x, y, A.DMG, 1, 'arrow');
    report(onPlate === s0 && platedAfter === plated0 && platedHit === plated0 + 1 && st.ship.shake > 0, 'armour plate is immune to arrows (an ordinary shell on the same plate still counts), bare deck is not');
  }
  {
    // wreck: six shells (0.5 each) wreck a post; a bomb in flight wrecks the other
    const k0 = st.kills;
    for (let i = 0; i < 6; i++) st.shells.push({ x: p0.x, y: p0.y, vx: 0, vy: 0, life: 1, owner: 'h1', from: 'ship0' });
    step(2);
    st.shipBombs.push({ x: p1.x, y: p1.y - 20, vx: 0, vy: 0, owner: 'h1' });
    step(2);
    report(p0.dead && p1.dead && st.kills >= k0 + 2 && r.gar.stats.postsDown === 2, `shells (hp ${A.HP} = 6 plain shells) and a bomb wreck the posts (${r.gar.stats.postsDown} down, +${st.kills - k0} kills)`);
    const before = r.gar.stats.arrows;
    f.posts.forEach((p) => { p.t = 0; });
    step(120);
    report(r.gar.stats.arrows === before, 'a wrecked post never fires again');
  }
}
{
  // a breach silences the face's archers
  const env = boot(seed0 + 1, { variant: 'fortress', human: true });
  const { st, step, ring, park } = env, r = ring(), f = r.faces[1];
  env.hold = { x: f.x, y: f.y - 1400 };
  f.posts[0].t = 0;
  step(40);
  report(f.posts[0].mode === 'tell' && f.flag > 0, 'archers of another face tell too');
  f.open = 5;
  f.windows = 1;
  env.sim.course.ringSys.hitCore(f, 99, 'h1', 'bomb');
  step(2);
  report(f.down && f.posts.every((p) => p.dead) && f.flag === 0 && r.gar.busy === null, 'a breached gate silences its archers (and frees the castle to tell again)');
}
{
  // fire arrows: the citadel's burn (and the fortress's do not); a burning hit lights a deck by the spot's igniteChance
  const burn = (variant) => {
    const env = boot(seed0, { variant, human: true });
    const { st, step, ring, park } = env, r = ring(), f = r.faces[0];
    env.hold = { x: f.x, y: f.y - 1400 };
    const arrows = [];
    for (let v = 0; v < 4; v++) arrows.push(...volley(env, f.posts[v % 2]));
    return { arrows, f, env };
  };
  const cit = burn('citadel'), fort = burn('fortress');
  const share = cit.arrows.filter((b) => b.burn).length / cit.arrows.length;
  report(Math.abs(share - GA.ARCHER.FIRE.SHARE) < 0.1 && cit.arrows.filter((b) => b.burn).every((b) => b.fire === GA.ARCHER.FIRE.IGNITE) && !fort.arrows.some((b) => b.burn), `fire arrows: ${(share * 100).toFixed(0)}% on the citadel (${(GA.ARCHER.FIRE.SHARE * 100).toFixed(0)}%), none on the fortress`);
  const lit = (fire) => {
    const { st, sh } = boot(seed0 + 2, { variant: 'citadel', human: true });
    const y = sh.layout.platforms[3].y - 20;
    const l0 = st.fireStats.lit;
    for (let i = 0; i < 400; i++) { sh.sim.impact(300 + (i % 20) * 50, y, GA.ARCHER.DMG, 1, 'arrow', fire); st.fires.length = 0; }
    return st.fireStats.lit - l0;
  };
  const withFire = lit(1), without = lit(0);
  report(withFire > without + 3, `a burning arrow lights a deck through igniteChance (${withFire} fires from 400 burning hits, ${without} from 400 plain ones)`);
}

// ---- (k) the ballista ----
{
  const env = boot(seed0, { variant: 'fortress', human: true });
  const { st, step, ring, park, sh } = env, r = ring(), B = GA.BALLISTA;
  const f = r.faces.find((q) => q.special.kind === 'ballista');
  report(!!f && f.special.hp === B.HP && r.faces.map((q) => q.special.kind).join() === GA.SPECIALS.fortress.join(), `the fortress has a ballista as one of its specials (${r.faces.map((q) => q.special.kind).join('/')}, hp ${f && f.special.hp})`);
  const sp = f.special;
  env.hold = { x: sp.x - 900, y: sp.y - 1300 };
  for (const q of r.faces.flatMap((x) => x.posts)) q.t = 999;
  sp.t = 0;
  step(2);
  const L = sp.lock;
  report(!!L && Math.abs(L.t - (B.LOCK - 2 / 60)) < 0.05 && r.gar.busy === sp && f.flag > 0, `the ballista locks for ${B.LOCK} s with an aim-line (sp.lock from ${Math.round(L && L.x0)},${Math.round(L && L.y0)} to ${Math.round(L && L.x1)},${Math.round(L && L.y1)})`);
  while (sp.lock && sp.lock.t > B.FREEZE) step(1);
  const frozen = { x: sp.lock.x1, y: sp.lock.y1 };
  env.hold = { x: sp.x - 900 - 400, y: sp.y - 1300 }; // (she moves: the line has frozen for the last FREEZE s)
  step(Math.round(0.2 * 60));
  report(!!sp.lock && sp.lock.t <= B.FREEZE && sp.lock.x1 === frozen.x && sp.lock.y1 === frozen.y, `the aim-line freezes for the last ${B.FREEZE} s`);
  let bolt = null, i = 0;
  while (!bolt && i++ < 120) { step(1); bolt = st.bullets.find((b) => b.bolt); }
  report(!!bolt && bolt.kind === 'bolt' && !bolt.ay && Math.abs(Math.hypot(bolt.vx, bolt.vy) - B.SPEED) < 1 && bolt.dmg === B.POWER && !sp.lock && r.gar.busy === null, `then a straight bolt flies (kind 'bolt', ${B.SPEED} px/s, power ${B.POWER}) and the castle may tell again`);
  // what a bolt does: bites a segment harder than a plain shell; makes a double gas hole
  const S = sh.sim.structure;
  const bag = sh.layout.gasbags[0], deckY = sh.layout.platforms[3].y - 20;
  const dmg = (power, kind) => { const m0 = S.meanHp(); sh.sim.impact(700, deckY, power, 1, kind); return m0 - S.meanHp(); };
  const bite = dmg(B.POWER, 'bolt'), plain = dmg(1, 'hit');
  report(bite > plain * 1.8, `a bolt bites a structure segment harder than a shell (${(bite * 1000).toFixed(1)} against ${(plain * 1000).toFixed(1)} thousandths of the mean soundness)`);
  let holesBolt = 0, holesPlain = 0;
  for (let k = 0; k < 20; k++) {
    st.gasHoles.length = 0;
    sh.sim.impact(bag.cx, bag.cy, B.POWER, 1, 'bolt');
    holesBolt += st.gasHoles.length;
    st.gasHoles.length = 0;
    sh.sim.impact(bag.cx, bag.cy, 1, 1, 'hit');
    holesPlain += st.gasHoles.length;
  }
  report(holesBolt >= holesPlain + 10, `...and a bolt on the bag makes a double hole (${(holesBolt / 20).toFixed(2)} holes a bolt, ${(holesPlain / 20).toFixed(2)} a shell)`);
  // the jink raises the miss
  const missShare = (jink) => {
    const e2 = boot(seed0 + 3, { variant: 'fortress', human: true });
    const f2 = e2.ring().faces.find((q) => q.special.kind === 'ballista');
    e2.hold = { x: f2.special.x - 900, y: f2.special.y - 1300 };
    for (const q of e2.ring().faces.flatMap((x) => x.posts)) q.t = 999;
    const helm = e2.st.players.h1;
    helm.lock = e2.sh.layout.one('helm').n;
    helm.jy = jink ? 1 : 0;
    let miss = 0, tot = 0;
    for (let k = 0; k < 40; k++) {
      f2.special.t = 0;
      const seen = new Set();
      for (let i2 = 0; i2 < 60 * 4; i2++) { helm.jy = jink ? 1 : 0; e2.step(1); const b = e2.st.bullets.find((q) => q.bolt && !seen.has(q)); if (b) { seen.add(b); tot++; if (b.miss) miss++; e2.st.bullets.length = 0; break; } }
    }
    return miss / Math.max(1, tot);
  };
  const m0 = missShare(false), m1 = missShare(true);
  report(m1 > m0 + 0.2, `the helm's jink raises the ballista's miss (${(m0 * 100).toFixed(0)}% still, ${(m1 * 100).toFixed(0)}% jinking)`);
}

// ---- (l) the manned guns and the squads ----
{
  const env = boot(seed0, { variant: 'fortress', human: true });
  const { st, step, ring, park, sh } = env, r = ring(), f = r.faces[0], CR = GA.CREW, SQ = GA.SQUAD;
  const guns = st.course.turrets.filter((t) => t.outpost === f.i), crews = f.squads.filter((q) => q.kind === 'gun'), plaza = f.squads.filter((q) => q.kind === 'plaza');
  report(crews.length === guns.length && crews.every((q) => q.n === CR.MEN && q.state === 'man' && q.gun) && plaza.length === 2 * SQ.PER_PLAZA && plaza.every((q) => q.n === SQ.MEN && q.state === 'muster'), `${crews.length} gun crews of ${CR.MEN} man their guns; ${plaza.length} squads of ${SQ.MEN} muster on the plazas`);
  env.hold = { x: f.x, y: f.y - 1400 };
  for (const q of r.faces.flatMap((x) => x.posts)) q.t = 999;
  // the cannon's pace, crew alive or dead
  const t0 = guns[0], t1 = guns[1];
  const cdAfterFire = (t) => { t.cd = 0.02; let k = 0; const w = t.cd; void w; while (t.cd < 1 && k++ < 90) step(1); return t.cd; };
  // a shell takes SHELL_MEN men; the second kills the crew; its gun fires 2x slower
  const q0 = crews[0];
  st.shells.push({ x: q0.x, y: q0.y - 40, vx: 0, vy: 0, life: 1, owner: 'h1', from: 'ship0' });
  step(2);
  report(q0.n === CR.MEN - CR.SHELL_MEN && q0.state === 'man', `a shell takes ${CR.SHELL_MEN} men off a crew (${q0.n} left)`);
  st.shells.push({ x: q0.x, y: q0.y - 40, vx: 0, vy: 0, life: 1, owner: 'h1', from: 'ship0' });
  const k0 = st.kills;
  step(2);
  report(q0.state === 'dead' && q0.gun.slow === CR.SLOW && st.kills === k0 + 1, `a dead crew slows its gun x${q0.gun.slow} (and counts as a kill)`);
  const fireGap = (t) => { const cds = []; for (let k = 0; k < 6; k++) { t.cd = 0.02; let n = 0, prev = t.cd; while (n++ < 900) { step(1); if (t.cd > prev + 1) { cds.push(t.cd); break; } prev = t.cd; } } return cds; };
  void cdAfterFire;
  const slowCds = fireGap(q0.gun), normCds = fireGap(t1);
  const lo = (a) => Math.min(...a), hi = (a) => Math.max(...a);
  report(slowCds.length >= 3 && normCds.length >= 3 && lo(slowCds) > hi(normCds) * 0.99, `...its cool-down after a shot is ${lo(slowCds).toFixed(1)}-${hi(slowCds).toFixed(1)} s against ${lo(normCds).toFixed(1)}-${hi(normCds).toFixed(1)} s for a manned gun`);
  // cheering after a hit on the ship (the face's guns and its hangar are quiet for this)
  for (const t of guns) t.dead = true;
  f.special.dead = true;
  step(Math.round(4 * 60));
  const sq = plaza[0];
  sh.sim.impact(700, sh.layout.platforms[3].y - 20, 1, 1, 'hit');
  step(3);
  report(sq.state === 'cheer' && r.gar.stats.cheers > 0, 'the soldiers cheer when the ship is hit');
  step(Math.round((SQ.CHEER + 0.5) * 60));
  report(sq.state === 'muster', `...and settle again after ${SQ.CHEER} s`);
  // a shell takes men off a plaza squad; a bomb kills one (salvage +1, a Book moment)
  st.shells.push({ x: sq.x, y: sq.y - 40, vx: 0, vy: 0, life: 1, owner: 'h1', from: 'ship0' });
  step(2);
  report(sq.n === SQ.MEN - CR.SHELL_MEN, `a shell takes ${CR.SHELL_MEN} men off a plaza squad (${sq.n} of ${SQ.MEN} left)`);
  const sq2 = plaza[1], kk = st.kills;
  st.shipBombs.push({ x: sq2.x, y: sq2.y - 60, vx: 0, vy: 0, owner: 'h1' });
  step(45);
  const Mom = (st.moments || []).filter((m) => m.kind === 'ring-squad');
  report(sq2.state === 'dead' && st.kills > kk && r.gar.stats.squadsBombed >= 1 && Mom.length === 1 && Mom[0].who[0] === 'Mia', `a bomb kills a whole squad (+${st.kills - kk} kills) and the Ship's Book has it (ring-squad: ${Mom.map((m) => m.who).join()})`);
  // the banner and the white flag: states by the gate falling
  const sq3 = plaza[0];
  f.open = 5;
  f.windows = 1;
  env.sim.course.ringSys.hitCore(f, 99, 'h1', 'bomb');
  step(2);
  const gunCrew = crews[1];
  report(f.down && sq3.state === 'flee' && gunCrew.state === 'flee', 'they flee when their gate is breached');
  step(Math.round(6 * 60));
  const pl = st.course.map.ring.faces[0].plat;
  report(sq3.x < pl.x0 || sq3.x > pl.x1, `...off the platform (x ${Math.round(sq3.x)}, the platform ends ${Math.round(pl.x0)} / ${Math.round(pl.x1)})`);
}
{
  // surrender on the crown: the white flag (on the tower, one gate: its men fled, then come back to give up)
  const env = boot(seed0, { variant: 'tower', human: true });
  const { st, step, ring, park } = env, r = ring(), f = r.faces[0];
  env.hold = { x: f.x, y: f.y - 1400 };
  for (const t of st.course.turrets) if (t.outpost === 0) t.dead = true;
  step(2);
  const plaza = f.squads.filter((q) => q.kind === 'plaza');
  env.sim.course.ringSys.hitCore(f, 99, 'h1', 'bomb');
  step(2);
  report(!!r.crown && plaza.every((q) => q.state === 'surrender') && r.gar.stats.surrenders >= plaza.length && plaza.every((q) => q.x === q.home), `the crown falls and the garrison surrenders (${plaza.map((q) => q.state)}; white flags)`);
}

// ---- (m) grapples from below ----
{
  const env = boot(seed0, { variant: 'fortress', human: true });
  const { st, step, ring, sh } = env, r = ring(), f = r.faces[0], GR = GA.GRAPPLE;
  const q = f.squads.find((s) => s.kind === 'plaza');
  for (const p of r.faces.flatMap((x) => x.posts)) p.t = 999;
  const B = sh.layout.bounds;
  const lowOver = (gap) => { env.hold = { x: q.x, y: q.y - 60 - gap - B.y1 + sh.layout.refPoint.y }; env.park(env.hold.x, env.hold.y); }; // (the keel gap px over the squad's heads; held there)
  // high: nothing
  lowOver(GR.RANGE + 500);
  step(4 * 60);
  report(r.zips.length === 0 && r.gar.stats.grapples === 0 && !q.swing, `a ship ${GR.RANGE + 500} px over a squad is left alone`);
  // low: the soldiers swing a grapple, then throw
  lowOver(GR.RANGE - 100);
  step(Math.round(GR.NEED * 0.7 * 60));
  const swinging = q.swing;
  step(Math.round(GR.NEED * 0.5 * 60));
  const z = r.zips.find((x) => x.grapple);
  report(swinging && !!z && z.men === GR.MEN && r.gar.stats.grapples === 1 && q.n === (SQ().MEN - GR.MEN), `with the keel ${GR.RANGE - 100} px over a squad for ${GR.NEED} s the soldiers swing a grapple (a tell), then throw it (a ring zip with ${GR.MEN} climber)`);
  lowOver(GR.RANGE - 100);
  step(Math.round(GR.TIME * 60));
  report(st.boarders.length === GR.MEN && st.boarders.every((b) => b.type === 'grunt') && r.stats.raiders === 1, `the raiders are aboard ${GR.TIME} s later (${st.boarders.length} grunt)`);
  step(Math.round(10 * 60));
  lowOver(GR.RANGE - 100);
  step(Math.round(3 * 60));
  report(r.gar.stats.grapples === 1, `...and no second grapple while raiders are aboard or the squad is cooling (${GR.EVERY} s, the castle ${GR.GAP} s)`);
}
function SQ() { return GA.SQUAD; }

// ---- (n) the catapult's stones and the boom chain ----
{
  const stoneRun = (variant) => {
    const env = boot(seed0, { variant, human: true });
    const { st, step, ring, park } = env, r = ring();
    const f = r.faces.find((q) => q.special.kind === 'mortar');
    for (const p of r.faces.flatMap((x) => x.posts)) p.t = 999;
    env.hold = { x: f.special.x - 1200, y: f.special.y - 1400 };
    f.special.t = 0;
    const seen = [];
    for (let i = 0; i < 60 * 25 && seen.length < 3; i++) { step(1); for (const b of st.bullets) if (b.mortar && !seen.includes(b)) seen.push(b); f.special.t = Math.min(f.special.t, 1); }
    step(60 * 4);
    return { seen, r };
  };
  const cit = stoneRun('citadel'), fort = stoneRun('fortress');
  report(cit.seen.length >= 2 && cit.seen.every((b) => b.stone && b.kind === 'stone' && b.burn && b.fire === GA.STONE.FIRE) && fort.seen.length >= 2 && fort.seen.every((b) => b.stone && !b.burn), `the mortar throws stones: burning ones on the citadel (fire ${GA.STONE.FIRE}), plain ones on the fortress`);
  report(cit.r.gar.stats.stones >= 1, `...and a stone that lands makes a flame where it falls (${cit.r.gar.stats.stones} landed)`);
}
{
  const env = boot(seed0, { variant: 'fortress', human: true });
  const { st, step, ring, park, sh } = env, r = ring(), C = GA.CHAIN;
  const chains = r.gar.chains, m = st.course.map.ring;
  report(chains.length === C.AT.fortress.length && chains.every((c) => c.hp === C.HP && !c.broken && c.yLow === m.faces[0].y - C.LOW) && m.chains.length === chains.length && r.faces.every((fc) => chains.every((c) => Math.abs(c.x - fc.x) >= C.FACE_GAP)), `the fortress hangs ${chains.length} boom chains between its gates (hp ${C.HP}, ${C.LOW} px over the platforms); none near a face`);
  const c = chains[0], B = sh.layout.bounds;
  for (const p of r.faces.flatMap((x) => x.posts)) p.t = 999;
  const parkAt = (refX, topY) => { sh.pose.x = refX - sh.layout.refPoint.x; sh.pose.y = topY - B.y0; st.ship.vy = 0; st.ship.speed = 0.4; };
  // the lookout calls it
  parkAt(c.x - C.LOOKOUT + 100, c.yLow + 200);
  step(2);
  report(/BOOM CHAIN/.test(st.ev.warnText) && r.gar.stats.calls === 1, `the lookout calls it from ${C.LOOKOUT} px: "${st.ev.warnText}"`);
  // under it passes
  env.hold = { x: c.x, y: c.yLow + C.MARGIN - B.y0 + sh.layout.refPoint.y }; // (her whole body under the low end)
  step(3 * 60);
  env.hold = null;
  report(!c.snagging && c.snag === 0 && !c.broken, 'a ship under it passes freely');
  // snagged: drag, ticks on the bag, the strain snaps it after SNAP_AFTER s
  const p0x = (sh.pose.x = c.x - sh.layout.refPoint.x - 200, sh.pose.x);
  sh.pose.y = c.yLow - 500 - B.y0;
  const hp0 = st.bags.map((b) => b.hp ?? 1), log0 = st.hitLog.length;
  let maxSpeed = 0;
  for (let i = 0; i < 60 * 2; i++) { st.ship.speed = 0.4; step(1); maxSpeed = Math.max(maxSpeed, st.ship.speed); sh.pose.y = c.yLow - 500 - B.y0; st.ship.vy = 0; }
  const moved = sh.pose.x - p0x, free = 0.4 * config.SHIP.TOP_SPEED * 2; // (what 2 s at the speed she was driven at would have been)
  report(c.snagging && c.snag > 1.8 && moved < 0.4 * free, `a ship with her bag in it is snagged: the drag holds her (${moved.toFixed(0)} px in 2 s, ${free.toFixed(0)} free)`);
  const ticks = st.hitLog.slice(log0).filter((h) => h.kind === 'chain').length;
  report(ticks >= 1 && r.gar.stats.chainPower >= C.POWER && st.bags.some((b, i) => (b.hp ?? 1) < hp0[i]), `...and the bag takes a tick every ${C.TICK} s (${ticks} marks, ${r.gar.stats.chainPower} power, canvas ${st.bags.map((b) => ((b.hp ?? 1) * 100).toFixed(0)).join('/')}%)`);
  for (let i = 0; i < 60 * (C.SNAP_AFTER + 1); i++) { st.ship.speed = 0.4; step(1); sh.pose.y = c.yLow - 500 - B.y0; st.ship.vy = 0; }
  report(c.broken && r.gar.stats.snaps === 1 && !c.snagging, `it snaps by itself after ${C.SNAP_AFTER} s of strain`);
}
{
  const env = boot(seed0 + 1, { variant: 'fortress', human: true });
  const { st, step, ring, park } = env, r = ring(), c = r.gar.chains[0], C = GA.CHAIN;
  env.hold = { x: r.faces[0].x, y: r.faces[0].y - 1400 };
  for (let i = 0; i < 7; i++) st.shells.push({ x: c.x, y: c.yLow - 300 - i * 20, vx: 0, vy: 0, life: 1, owner: 'h1', from: 'ship0' });
  step(3);
  report(c.broken && r.gar.stats.snaps === 1, `shells break it: ${C.HP} hit points, a shell does ${C.SHELL_MUL} x ${config.GUNS.DAMAGE} (7 shells: ${c.hp <= 0 ? 'snapped' : 'holds'})`);
  // a bomb in flight through the chain (3 points) and a second one
  const c2 = r.gar.chains[1];
  st.shipBombs.push({ x: c2.x, y: c2.yLow - 200, vx: 0, vy: 0, owner: 'h1' });
  step(2);
  report(c2.hp === C.HP - C.BOMB, `a bomb through the chain takes ${C.BOMB} points off it (${c2.hp}/${C.HP})`);
}
{
  // the helm bots dive under it (4 bots; the ship placed short of the chain at the transit height)
  const env = boot(seed0 + 2, { variant: 'fortress', bots: 6 });
  const { st, step, ring, sh } = env, r = ring(), c = r.gar.chains[0], C = GA.CHAIN;
  for (const p of r.faces.flatMap((x) => x.posts)) p.t = 999;
  for (const t of st.course.turrets) t.dead = true;
  const f0 = r.faces[0];
  f0.open = 5;
  f0.windows = 1;
  env.sim.course.ringSys.hitCore(f0, 99, 'bot0', 'bomb'); // (the first gate is down: the way on leads past the chain)
  sh.pose.x = c.x - 2300 - sh.layout.refPoint.x;
  sh.pose.y = 5000 - sh.layout.refPoint.y;
  st.ship.vy = 0;
  st.ship.speed = 0;
  let snagged = 0, passed = false;
  for (let i = 0; i < 60 * 90 && !passed; i++) { step(1); if (c.snagging) snagged++; if (sh.pose.x + sh.layout.refPoint.x > c.x + 2200) passed = true; }
  report(passed && snagged < 90, `the helm bots (or the autopilot) dive under the chain and fly on (snagged ${snagged} steps; ref x ${Math.round(sh.pose.x + sh.layout.refPoint.x)} of chain ${Math.round(c.x)})`);
  void C;
}

// ---- (o) the fairness rule: the garrison's damage is at most 60% of the face guns' ----
{
  // On paper: per second against a ship in reach of one face, everything standing (config alone): the guns against the archers and (on its face) the ballista.
  const TC = config.COURSE;
  const gunsDps = (guns) => guns * (1 - TC.FLAK_MISS) * 1 / (((TC.TURRET_FIRE_MIN + TC.TURRET_FIRE_MAX) / 2) * 1.3); // (a flak shell is 1 power; an open map slows the guns x1.3)
  const A = GA.ARCHER, BA = GA.BALLISTA;
  const archers = (A.POSTS * ((A.COUNT[0] + A.COUNT[1]) / 2) * (1 - A.MISS) * A.DMG) / ((A.EVERY[0] + A.EVERY[1]) / 2 + A.TELL + A.LOOSE);
  const ballista = (BA.POWER * (1 - BA.MISS)) / (BA.EVERY + BA.LOCK);
  const rows = [];
  let worst = 0;
  for (const v of ['tower', 'fortress', 'citadel']) {
    const V = RG.VARIANTS[v], guns = gunsDps(V.TURRETS);
    const withB = (GA.SPECIALS[v] || V.SPECIALS).includes('ballista');
    const share = (archers + (withB ? ballista : 0)) / guns;
    worst = Math.max(worst, share);
    rows.push(`${v} ${(share * 100).toFixed(0)}%`);
  }
  report(worst <= 0.6, `fairness on paper, per face: the garrison (archers${'' } and ballista) at most 60% of the three guns' damage per second (${rows.join(', ')}; guns ${gunsDps(3).toFixed(2)}/s, archers ${archers.toFixed(2)}/s, ballista ${ballista.toFixed(2)}/s)`);
}
{
  // Landed: 8 bots, 2 seeds x 4 min on the fortress and the citadel: the power that landed on the ship from the garrison (arrows, bolts, the chain) against the castle's guns (flak, stones)
  const tally = { guns: 0, garr: 0 };
  config.ESCORT.AUTO_PATROL = PATROL0;
  config.PACING.RATE_START = config.PACING.RATE_END = 1;
  for (const v of ['fortress', 'citadel']) for (const sd of quick ? [1] : [1, 2]) {
    const { st, step } = boot(sd, { variant: v, bots: 8, keepSky: false });
    config.PACING.RATE_START = config.PACING.RATE_END = 1;
    const hp = { gun: 0, arrow: 0, bolt: 0 };
    st.onBulletHit = (b) => { hp[b.arrow ? 'arrow' : b.bolt ? 'bolt' : b.flak || b.mortar ? 'gun' : 'x'] = (hp[b.arrow ? 'arrow' : b.bolt ? 'bolt' : b.flak || b.mortar ? 'gun' : 'x'] || 0) + (b.dmg || 1); };
    const r0 = st.course.ring;
    for (let i = 0; i < 4 * 3600; i++) { step(1, false); if (st.phase === 'lobby') break; }
    tally.guns += hp.gun;
    tally.garr += hp.arrow + hp.bolt + r0.gar.stats.chainPower;
  }
  config.PACING.RATE_START = config.PACING.RATE_END = 0;
  report(tally.guns > 0 && tally.garr <= 0.6 * tally.guns, `fairness in play: what landed on the ship over those runs - garrison ${tally.garr.toFixed(1)} against the guns' ${tally.guns.toFixed(1)} (${((tally.garr / Math.max(0.01, tally.guns)) * 100).toFixed(0)}%, at most 60%)`);
}
// ---- (p) F12, small ships crack castles: a ship with no bomb bay has her magazines filled when a shutter opens (RING.FAIR), the classic ship keeps the bay's refill ----
{
  const { applyBuild } = await load('shipLayout.js');
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const open = (build, fair) => {
    applyBuild(BUILDS[build]);
    config.RING.FAIR.ENABLED = fair;
    const { st, step, ring, park } = boot(seed0, { variant: 'tower', human: true }), f = ring().faces[0];
    park(f.x, f.y - 1400);
    step(30);
    for (const g of Object.values(st.GUNS)) g.ammo = 2;
    if (st.bombBay) st.bombBay.bombs = 0;
    kill(st, f);
    step(2);
    const guns = Object.values(st.GUNS).filter((g) => g.type !== 'flame' && g.type !== 'mines' && g.type !== 'harpoon');
    return { open: f.open > 0, full: guns.every((g) => g.ammo >= g.max), low: guns.every((g) => g.ammo <= 4), bombs: st.bombBay ? st.bombBay.bombs : 0, bay: !!st.ships[0].layout.bombBay };
  };
  const sp = open('sparrow', true), spOff = open('sparrow', false), cl = open('classic', true);
  config.RING.FAIR.ENABLED = true;
  applyBuild(BUILDS.classic);
  report(!sp.bay && sp.open && sp.full, `F12: the Sparrow (no bomb bay) has every magazine full as the shutter opens (open ${sp.open}, full ${sp.full})`);
  report(spOff.open && spOff.low && !spOff.full, 'F12: with RING.FAIR off (NO_RINGFAIR=1) her magazines stay as they were');
  report(cl.bay && cl.open && cl.low && cl.bombs === config.BOMBS.MAX, `F12: the classic ship keeps the bay's refill (${cl.bombs} bombs) and her guns are left alone`);
}
// ---- (q) F12, a limp home keeps the breached gates (RING.FAIR.KEEP_GATES) and the Flagship of an old castle does not hang on ----
{
  const { st, step, ring, sim } = boot(seed0, { variant: 'fortress', human: true }), course = st.course, id = course.stop && course.stop.id, f0 = ring().faces[0];
  kill(st, f0);
  step(2);
  for (let i = 0; i < 20; i++) shellAt(st, f0.core.x, f0.core.y);
  step(2);
  report(f0.down && JSON.stringify(st.run.castle && st.run.castle[id]) === '[0]', `F12: a breached gate is remembered by the run (${JSON.stringify(st.run.castle)})`);
  const opts = { kind: 'ring', stop: course.stop, danger: 3, lengthMul: 1 };
  sim.course.startMission(course.lap, opts); // (a limp home, and the stop flown again on a new map)
  const r2 = ring();
  report(r2 !== f0 && r2.faces[0].down && r2.faces[0].how === 'kept' && r2.faces.slice(1).every((f) => !f.down) && course.map.outposts[0].done && course.turrets.filter((t) => t.outpost === 0).every((t) => t.dead), `F12: the stop flown again has that gate still breached (${r2.faces.map((f) => (f.down ? 'X ' + f.how : '-')).join(', ')}), its guns gone`);
  for (const f of r2.faces) kill(st, f);
  for (let k = 0; k < 5 && !r2.crown; k++) { step(2); for (const f of r2.faces) if (!f.down && f.open > 0) for (let i = 0; i < 20; i++) shellAt(st, f.core.x, f.core.y); step(2); }
  report(!!r2.crown && !(st.run.castle && st.run.castle[id]), 'F12: the crown falls and the run forgets the castle');
  config.RING.FAIR.KEEP_GATES = false;
  sim.course.startMission(course.lap, opts);
  const f1 = ring().faces[0];
  kill(st, f1);
  step(2);
  for (let i = 0; i < 20; i++) shellAt(st, f1.core.x, f1.core.y);
  step(2);
  sim.course.startMission(course.lap, opts);
  report(f1.down && ring().faces.every((f) => !f.down), 'F12: with KEEP_GATES off a new map is a whole castle');
  config.RING.FAIR.KEEP_GATES = true;
}
{
  // the Flagship hung on a citadel before a limp is not carried to the next one (squadrons.js updateBoss)
  const { st, step, ring, sim } = boot(seed0, { variant: 'citadel', human: true }), course = st.course;
  sim.squadrons.spawnBoss();
  const z0 = st.boss;
  report(!!z0 && z0.moor === ring().moor, 'F12: the Flagship hangs on the citadel\'s mooring');
  sim.squadrons.reset(); // (the limp home: reset() tells the boss to leave)
  sim.course.startMission(course.lap, { kind: 'ring', stop: course.stop, danger: 3, lengthMul: 1 });
  step(5);
  report(st.boss !== z0 && (!st.boss || st.boss.moor === ring().moor), 'F12: after a limp home the old Flagship is gone, the new castle hangs its own (' + (st.boss ? 'a new one' : 'none yet') + ')');
  config.RING.FAIR.ENABLED = false;
  const z1 = (st.boss = null, sim.squadrons.spawnBoss(), st.boss);
  sim.squadrons.reset();
  sim.course.startMission(course.lap, { kind: 'ring', stop: course.stop, danger: 3, lengthMul: 1 });
  step(5);
  report(st.boss === z1 && z1.leaving, 'F12: with NO_RINGFAIR the old Flagship hangs on (the old bug, kept for the baselines)');
  config.RING.FAIR.ENABLED = true;
  st.boss = null;
}
// the switch
{
  config.GARRISON.ENABLED = false;
  const env = boot(seed0, { variant: 'fortress', human: true });
  const { st, step, ring } = env, r = ring();
  const kinds = r.faces.map((f) => f.special.kind).join('/');
  step(60 * 20);
  report(!r.gar && !('chains' in st.course.map.ring) && r.faces.every((f) => !f.posts && !f.squads) && kinds === RG.VARIANTS.fortress.SPECIALS.join('/') && !st.bullets.some((b) => b.arrow || b.bolt || b.stone), `GARRISON.ENABLED false gives the R0 ring (no posts, squads or chains; specials ${kinds})`);
  config.GARRISON.ENABLED = true;
}

config.CREATURES.LAIR.COUNT = KEEP.LAIRS;
void PACING0;
console.log(ok ? 'ring check: PASS' : 'ring check: FAIL');
process.exit(ok ? 0 : 1);
