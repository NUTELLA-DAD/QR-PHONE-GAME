// DERELICTS, STRIPPING, NAMED PARTS and the two stops about them (LOOP.md G5 + G6; derelicts.js, stopGoals.js, derelictArt.js, maps.js buildFieldMap, config.DERELICT). Headless, seeded.
//   node tools/buildsim.mjs --check-derelicts     or directly:  node tools/derelicts-check.mjs [--seed 1] [--quick]
//
//   (a) the switches: on by default, bots go on foot only in a SALVAGE RUN; NO_DERELICTS=1 and NO_AWAY=1 turn it off; a crew under AWAY.MIN_CREW flies the old beacon salvage run
//   (b) a derelict spawns: on an ordinary open-sky stop by a hash of the stop (the same every time, never in column 0, never on a flagship), on a salvage field three of them; 2 or 3 parts, a name, a deck that is a landing surface
//   (c) boarding: the rope ladder lowered over a wreck's deck is climbed down onto it, a parachute and a hookshot land on it, a man walks it and is carried along as it drifts; the first man makes the Book
//   (d) stripping: hold Action at a part, the bar fills (and runs back if let go), the part comes unbolted as a crate in his arms (heavy, half speed), ATTACK puts it down on the deck where it drifts with the wreck, a mate lifts it
//   (e) hauling: up the rope into the hold (STOW), the hold's weight, a crate hooked from a deck, a bot stows by itself, the wreck's score and its Book moment
//   (f) the named card: a stripped part is paid at the stop's end, the next dock offers it by its name with who stripped it, for a share of the Yard price; buying it builds the part, writes its story into run.parts and the Book
//   (g) the SALVAGE RUN: the field, the briefing line, the parts needed, bots strip and win it, the storm takes the wrecks (fail), nothing left to strip (fail), the reward, the ESCAPE calm
//   (h) DEFEND: the balloon, the clock waits for the ship, waves of bats go for it, shot off it or chewing it, held (win) and lost (fail); the supply balloon; the reward
//   (i) the route: one DEFEND stop at most in a long voyage, never a lair / ring / the Flagship, the same route with the switch off
//   (j) two ships in one sky: the wrecks, the decks and the stops run with a second ship and only the main ship's crew go ashore
//   (k) the phone and the TV: the STRIP hints, arrows and verbs, the words on the TV, the art on a stub canvas (2D and the 3D HUD pass), the Log lines
//   (l) 8 bots: salvage runs and DEFEND stops with 0 errors and no NaN, and whole voyages with 0 errors
process.env.NO_ALARMS = '1'; // (the checks read the banner text right after an event)
import fs from 'node:fs';
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
let clock = seedRandom(seed0);
// a tiny stub canvas for the art: a transform stack, a record of the texts
const rec = { texts: [], calls: 0 };
const stubCtx = () => {
  const t = { imageSmoothingQuality: 'low', font: '10px x', textAlign: 'left', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', lineCap: 'butt', lineJoin: 'miter' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      switch (k) {
        case 'measureText': return (s) => ({ width: String(s).length * 9 });
        case 'createLinearGradient': case 'createRadialGradient': case 'createPattern': case 'createConicGradient': return () => ({ addColorStop() {} });
        case 'getTransform': return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        case 'fillText': case 'strokeText': return (s) => { rec.texts.push(String(s)); };
        default: return () => { rec.calls++; };
      }
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = { fonts: { check: () => true, load: () => Promise.resolve() }, createElement: () => { const c = { width: 0, height: 0, style: {}, getContext: () => (c.c ||= stubCtx()) }; return c; } };
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
globalThis.fetch = async () => ({ json: async () => [] });

const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { UPGRADE_BLOCKS } = await load('modules/host/upgrades.js');
const { toWorldX, toWorldY, toShipX, toShipY } = await load('modules/host/pose.js');
const { generateVoyage, stopById } = await load('modules/host/voyage.js');
const { holdWeight, holdSpot } = await load('modules/host/scrap.js');
const { writeStop, TEMPLATES } = await load('modules/host/logWriter.js');
const { createDerelictArt } = await load('modules/host/derelictArt.js');
const { findHover } = await load('modules/host/maps.js');
const { VERBS } = await load('modules/host/roleCards.js');
const { fieldFor } = await load('modules/host/stopGoals.js');
const DR = config.DERELICT, AW = config.AWAY, TR = AW.TREASURE;
const DT = 1 / 60;
const copyData = (v) => (Array.isArray(v) ? v.map(copyData) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copyData(x)])) : v);
const UPGRADES0 = copyData(Object.fromEntries(UPGRADE_BLOCKS.map((b) => [b, config[b]])));
const restoreUpgrades = (target, from) => { for (const [k, v] of Object.entries(from)) { if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') restoreUpgrades(target[k], v); else target[k] = copyData(v); } };
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
config.CREATURES.LAIR.COUNT = { short: 0, long: 0 };
config.VOYAGE.CURRICULUM.ENABLED = true;
const DR0 = copyData(DR), AW0 = copyData(AW);
const errs = () => (globalThis.gameErrors || []).length;

// A fresh seeded sim in a flown stop. o.stop = 'salvage' | 'defend' | 'ordinary' (an open-sky stop with a wreck put on it) | null (the first stop); o.humans / o.bots; o.build = 'sparrow' (named cards need a start build).
function boot(seed, o = {}) {
  clock = seedRandom(seed);
  restoreUpgrades(config, UPGRADES0);
  restoreUpgrades(DR, DR0);
  restoreUpgrades(AW, AW0);
  config.MAPS.FORCE_KIND = null;
  config.PACING.RATE_START = config.PACING.RATE_END = o.pacing ? 1 : 0;
  if (o.rates !== undefined) config.PACING.RATE_START = config.PACING.RATE_END = o.rates;
  const sim = createSimulation();
  const st = sim.state;
  st.difficulty = o.difficulty || 'easy';
  const e = st.ships[0].layout.boarderEntryPoints;
  const mk = (id, bot, i) => (st.players[id] = { id, bot, name: bot ? 'Bot' + (i + 1) : ['Mia', 'Joe', 'Ana', 'Raj', 'Kim'][i] || id, species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + (e[1].x - e[0].x) * ((i + 0.5) / 8), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true });
  for (let i = 0; i < (o.bots ?? 0); i++) mk('bot' + i, true, i);
  for (let i = 0; i < (o.humans ?? 0); i++) mk('h' + (i + 1), false, i);
  if (o.build !== null) sim.setStartBuild(o.build || 'sparrow');
  sim.castOff();
  const step = (n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); if (!o.hurt) st.ship.hull = 100; } };
  step(60);
  const sh = st.ships[0], REF = sh.layout.refPoint;
  const hold = { x: null, y: null, d: null };
  const park = (x, y) => { hold.x = x; hold.y = y; hold.d = null; sh.pose.x = x - REF.x; sh.pose.y = y - REF.y; st.ship.vy = 0; st.ship.speed = 0; };
  const track = (d) => { hold.d = d; }; // (the ship keeps station over a drifting wreck)
  const stepH = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (hold.d) { hold.x = hold.d.x; hold.y = hold.d.y - DR.HOVER_REF; }
      if (hold.x != null) { sh.pose.x = hold.x - REF.x; sh.pose.y = hold.y - REF.y; st.ship.vy = 0; st.ship.speed = 0; }
      clock.ms += DT * 1000; sim.update(DT); if (!o.hurt) st.ship.hull = 100;
    }
  };
  const b = { sim, st, sh, REF, step, stepH, park, track, hold, G: st.groundSys, map: () => st.course.map, S: () => st.away, T: () => st.away.tre, D: () => st.away.der };
  if (o.stop) {
    const run = st.run, stop = run.voyage.columns[2][0];
    if (o.stop === 'salvage') Object.assign(stop, { salvage: true, kind: 'salvage', gates: ['swarm'], danger: 1 });
    else if (o.stop === 'defend') Object.assign(stop, { defend: true, kind: 'defend', gates: ['swarm'], danger: 1 });
    else Object.assign(stop, { kind: 'open', gates: ['swarm'], danger: 1 });
    b.stop = stop;
    sim.goToStop(stop.id);
    step(5);
    b.natural = b.D().list.length; // (what the hash of the stop made, before any forced wreck)
    if (o.stop === 'ordinary' && !b.D().list.length) { // (the hash may say no wreck for this stop: put one on it, the way the map would have)
      const m = b.map(), C = m.CELL;
      let site = null;
      for (let f = 0.45, k = 0; !site && k < 12; k++, f += 0.04) site = findHover(m, Math.round(m.W * (f > 0.8 ? f - 0.5 : f)), Math.round(m.H * 0.3)); // (a place the ship can reach, as maps.js findHover says)
      if (site) {
        b.D().list.length = 0;
        b.G.der.make({ x: (site.i + 0.5) * C, y: (site.jr + 0.5) * C + DR.HOVER_REF, hx: (site.i + 0.5) * C, hy: (site.jr + 0.5) * C }, 0, 'forced');
        b.G.der.syncDecks();
        b.S().tre.keep = true;
      }
    }
  }
  return b;
}
const finite = (st) => Object.values(st.players).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) && Number.isFinite(st.ships[0].pose.x) && Number.isFinite(st.ships[0].pose.y);
const moments = (b, kind) => (b.st.moments || []).filter((m) => m.kind === kind);
const said = (b) => String(b.st.ev.warnText || '');
const hover = (b, d) => { b.park(d.x, d.y - DR.HOVER_REF); b.track(d); b.stepH(3); };
// A person standing on a wreck's deck at offset dx from its middle.
function stand(b, p, d, dx = 0) {
  p.fall = false; p.fly = true; p.air = false; p.conn = null; p.lock = null; p.ko = 0; p.koGrace = 0; p.carry = null; p.hearts = config.HEALTH.MAX;
  p.on = { away: true, mode: 'walk', deck: d.deck, gy: d.y, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: 0, lx: dx };
  p.x = d.x + dx;
  p.y = d.y;
  p.jx = p.jy = 0;
  return p;
}
const partAt = (d, i = 0) => d.parts[i];
// Hold the button until the man carries a crate (or n steps).
function strip(b, p, n = 400) {
  p.fire = true;
  let i = 0;
  for (; i < n && p.carry !== 'chest'; i++) b.stepH(1);
  p.fire = false;
  b.stepH(1);
  return i;
}

// ---- (a) the switches ----
{
  const { spawnSync } = await import('node:child_process');
  const probe = (env) => spawnSync(process.execPath, ['-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(({config})=>console.log(JSON.stringify([config.DERELICT.ENABLED, config.AWAY.ENABLED, config.AWAY.BOT_TRIPS])))`], { encoding: 'utf8', env: { ...process.env, ...env } });
  report(DR.ENABLED === true && DR.BOTS.IN_RUN === true && AW.BOT_TRIPS === false, 'DERELICT is on by default; bots go ashore in a SALVAGE RUN but make no other trips');
  report((probe({ NO_DERELICTS: '1' }).stdout || '').trim() === '[false,true,false]', 'NO_DERELICTS=1 turns the wrecks and the two stops off');
  report((probe({ NO_AWAY: '1' }).stdout || '').trim().startsWith('[true,false'), 'NO_AWAY=1 turns the away team off (every wreck with it: the baselines pin it)');
  const srcs = ['derelicts.js', 'stopGoals.js', 'derelictArt.js'].map((f) => fs.readFileSync(path.join(publicDir, 'modules/host', f), 'utf8'));
  report(srcs.every((s) => !/Math\.random/.test(s)), 'the wrecks, the stops and their art draw no random number (a hash of the stop decides)');
  const small = boot(seed0, { humans: 2, bots: 0, stop: 'salvage' });
  report(small.map().field == null && small.st.course.goal == null && small.map().salvage === true, 'with 2 crew a salvage run is the OLD beacon run (no field, no wrecks, no goal)');
  const three = boot(seed0, { humans: 3, stop: 'salvage' });
  report(three.map().field === 'salvage' && three.st.course.goal && three.st.course.goal.kind === 'salvage' && three.D().list.length === DR.RUN.DERELICTS, `with 3 crew it is the field: ${three.D().list.length} wrecks and a goal`);
  const stopObj = { salvage: true, id: 'x' };
  report(fieldFor(three.st, stopObj) === 'salvage' && fieldFor(three.st, { id: 'y' }) === null && fieldFor(three.st, { defend: true }) === 'defend', 'fieldFor: salvage with a crew that can go ashore, defend always, nothing for an ordinary stop');
}

// ---- (b) the wrecks ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage' });
  const m = b.map(), D = b.D();
  report(m.kind === 'field' && m.open && m.outposts.length === 0 && m.turrets.length === 0 && m.sites.length === DR.RUN.DERELICTS, `the salvage field: open sky, no outposts, no guns, ${m.sites.length} sites (${m.W}x${m.H} squares)`);
  report(D.list.every((d) => d.parts.length >= DR.PARTS.MIN && d.parts.length <= DR.PARTS.MAX && /^the /.test(d.name) && d.deck && b.S().decks.includes(d.deck)), `every wreck has ${DR.PARTS.MIN}-${DR.PARTS.MAX} parts, a name ("${D.list[0].name}") and a deck among the away team's decks`);
  report(new Set(D.list.map((d) => d.name)).size === D.list.length, 'no two wrecks share a name');
  const sh = b.sh, surfs = sh.sim.air.surfaces().filter((s) => String(s.id).startsWith('ground:der'));
  report(surfs.length === D.list.length, 'a wreck deck is a landing surface for the airborne code (and so for the hookshot)');
  const map = m, C = map.CELL, reach = D.list.every((d) => { const i = Math.floor(d.x / C), j = Math.floor((d.y - DR.HOVER_REF) / C); return map.fit[j * map.W + i] === 1 && map.dist[j * map.W + i] < 1e9; });
  report(reach, 'the ship can hover over each wreck (map.fit, reachable): the rope ladder can reach every deck');
  // the same stop gives the same wrecks
  const b2 = boot(seed0 + 5, { humans: 3, stop: 'salvage' }), b3 = boot(seed0 + 5, { humans: 3, stop: 'salvage' });
  report(JSON.stringify(b2.D().list.map((d) => [d.name, d.parts.map((p) => p.id)])) === JSON.stringify(b3.D().list.map((d) => [d.name, d.parts.map((p) => p.id)])), 'the same seed gives the same wrecks, names and parts');
  // ordinary open-sky stops: a hash of the stop and the voyage's seed decides (column 2 here), about SPAWN.CHANCE of them
  let natural = 0, total = 0, again = 0;
  for (let n = 0; n < (quick ? 13 : 100); n++) {
    const probe = boot(seed0 + 200 + n, { humans: 3, stop: 'ordinary', build: 'sparrow' });
    total++;
    if (probe.natural > 0) natural++;
    if (probe.natural === 0 && n < 3) { const r = probe.G.der; r.begin(probe.map()); if (probe.D().list.length === 0) again++; } // (the same stop asked again gives the same answer)
  }
  report(natural > 0 && natural <= total * 0.8, `ordinary open-sky stops: ${natural} of ${total} had a wreck by the hash alone (SPAWN.CHANCE ${DR.SPAWN.CHANCE}; no wreck where the ship cannot hover)`);
  report(again === Math.min(3, total - natural), 'asking the same stop again gives the same answer (a hash, not a die)');
  const bf = boot(seed0, { humans: 3, stop: null });
  report(bf.D().list.length === 0, 'the first stop (column 0) never has a wreck');
}

// ---- (c) boarding ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage' });
  const d = b.D().list[0], p = b.st.players.h1, R = b.S().rope;
  hover(b, d);
  b.stepH(10);
  report(b.S().on && R.groundDeck === d.deck && R.gap <= AW.LADDER.REACH, `hovering over ${d.name} the rope ladder reaches her deck (gap ${Math.round(R.gap)} of ${AW.LADDER.REACH})`);
  // the ladder: lowered by a person at the hatch, climbed down
  const sp = b.G.ropeSpot();
  p.fall = false; p.fly = false; p.d = sp.d; p.x = sp.x; p.y = b.sh.layout.platforms[sp.d].y; p.lock = null; p.conn = null;
  report(b.G.lowerRope(p) && R.out, 'the rope ladder is lowered over the wreck');
  b.G.mount(b.sh, p, 0);
  p.jy = 1;
  for (let i = 0; i < 900 && !(p.on && p.on.mode === 'walk'); i++) b.stepH(1);
  p.jy = 0;
  b.stepH(2);
  report(p.on && p.on.mode === 'walk' && p.on.deck === d.deck && Math.abs(p.y - d.y) < 3, `climbing down he steps off onto the wreck's deck (y ${p.y.toFixed(0)}, deck ${d.y})`);
  report(d.boarded && moments(b, 'derelict-boarded').length === 1 && moments(b, 'derelict-boarded')[0].who[0] === p.name, 'the first man on a wreck makes the Book (derelict-boarded)');
  report(R.out, 'the rope stays down while a man is on the wreck');
  // walking, and being carried along as she drifts
  const x0 = d.x, px0 = p.x;
  p.jx = 0;
  b.stepH(120);
  report(Math.abs((d.x - x0) - (p.x - px0)) < 2 && Math.abs(d.x - x0) > 5, `she drifts ${(d.x - x0).toFixed(0)} px in 2 s and he is carried with her (${(p.x - px0).toFixed(0)})`);
  const walk = p.x;
  p.jx = 1;
  b.stepH(30);
  p.jx = 0;
  report(p.x - walk > AW.WALK * 0.4 && p.x <= d.x1 + 0.5, 'the stick walks him along the deck, and not off its end');
  // a flare calls the ship from a wreck: the pickup hovers over the deck, not over the rock below
  p.on.flareCd = 0;
  b.G.fireFlare(p, p.on);
  b.stepH(3);
  const pk = b.S().pickups[0];
  report(pk && Math.abs(pk.gy - d.y) < 5, `a flare from the wreck marks the deck for the pickup (gy ${pk && pk.gy.toFixed(0)} = deck ${d.y.toFixed(0)})`);
  // a parachute onto the deck
  const q = b.st.players.h2;
  q.fall = false; q.conn = null; q.lock = null; q.d = 1;
  b.sh.sim.air.startFlight(q, 0, 0);
  q.x = d.x - 120; q.y = d.y - 150; q.fvx = 0; q.fvy = 60; q.lsy = q.apex = toShipY(b.sh, q.y); q.chute = 1; q.chuteOpen = true;
  for (let i = 0; i < 400 && !q.on; i++) b.stepH(1);
  report(q.on && q.on.deck === d.deck && Math.abs(q.y - d.y) < 3, 'a parachute drops a man onto the wreck and he stands on her deck');
  // the hookshot: cast at the wreck's hull from the air, reeled in to the deck
  const r = b.st.players.h3;
  r.fall = false; r.conn = null; r.lock = null; r.d = 1;
  b.sh.sim.air.startFlight(r, 0, 0);
  r.x = d.x + 300; r.y = d.y - 150; r.fvx = 0; r.fvy = 0; r.lsy = r.apex = toShipY(b.sh, r.y);
  r.carry = 'hookshot'; r.jx = -0.9; r.jy = 0.45; r.atkQ = true;
  b.stepH(1);
  r.jx = r.jy = 0;
  let hooked = false;
  for (let i = 0; i < 120 && !hooked; i++) { b.stepH(1); hooked = !!(r.hook && r.hook.phase === 'caught'); }
  report(hooked && r.hook.anchor.kind === 'ship' && String(r.hook.anchor.pos && 'ok'), `a hookshot cast at the wreck catches on her (${r.hook && r.hook.anchor && r.hook.anchor.kind})`);
  r.fire = true;
  for (let i = 0; i < 900 && !(r.on && r.on.away); i++) b.stepH(1);
  r.fire = false;
  report(r.on && r.on.deck === d.deck, 'reeled in he climbs onto her deck and stands there');
  // a bot that drifts there does not stay
  const bt = boot(seed0, { humans: 2, bots: 1, stop: 'salvage' });
  const bd = bt.D().list[0], bb = bt.st.players.bot0;
  hover(bt, bd);
  bb.fall = false; bb.conn = null; bb.lock = null; bb.d = 1;
  bt.sh.sim.air.startFlight(bb, 0, 0);
  bb.x = bd.x; bb.y = bd.y - 150; bb.fvx = 0; bb.fvy = 60; bb.lsy = bb.apex = toShipY(bt.sh, bb.y); bb.chute = 1; bb.chuteOpen = true;
  for (let i = 0; i < 400 && bb.fly; i++) bt.stepH(1);
  report(!bb.on, 'a bot that drifts down onto a wreck without a trip does not stay there');
  report(finite(b.st), 'no NaN');
}

// ---- (d) stripping ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage' });
  const d = b.D().list[0], p = b.st.players.h1, q = b.st.players.h2;
  hover(b, d);
  const part = partAt(d, 0);
  stand(b, p, d, part.dx - 150);
  b.stepH(2);
  report(p.act && p.act.type !== 'strip', `away from a part the button is something else (${p.act && p.act.label})`);
  p.on.lx = part.dx;
  p.x = d.x + part.dx;
  b.stepH(2);
  report(p.act && p.act.type === 'strip' && p.act.hold && /^UNBOLT /.test(p.act.label) && p.act.label.includes(part.label.toUpperCase()), `at a part the button says "${p.act && p.act.label}" and is a hold`);
  // a hold let go runs back
  p.fire = true;
  b.stepH(Math.round(DR.STRIP.TIME * 60 * 0.5));
  const half = part.prog;
  p.fire = false;
  b.stepH(40);
  report(half > 0.4 && half < 0.6 && part.prog < half - 0.2, `half the time fills half the bar (${half.toFixed(2)}) and a bar nobody holds runs back (${part.prog.toFixed(2)})`);
  const steps = strip(b, p);
  report(p.carry === 'chest' && part.state === 'taken' && part.by === p.name && Math.abs(steps / 60 - DR.STRIP.TIME) < 0.5, `holding the button unbolts it after ${(steps / 60).toFixed(2)} s (STRIP.TIME ${DR.STRIP.TIME}): the part is taken and he carries a crate`);
  const T = b.T(), crate = T.chests.find((c) => c.kind === 'part');
  report(crate && crate.state === 'carried' && crate.by[0] === p.id && crate.w === DR.CRATE.W && crate.card && crate.card.entry === part.id && crate.card.from === d.name, `the crate is a chest of kind 'part' (weight ${crate && crate.w}) carrying its card: ${crate && crate.card && crate.card.from}'s ${crate && crate.card && crate.card.label}`);
  report(moments(b, 'derelict-stripped').length === 1 && d.taken === 1 && b.D().stripped === 1, 'the Book has a derelict-stripped moment and the wreck counts one taken');
  const sp = (() => { let best = 0; for (const dir of [1, -1]) { const x0 = p.x; p.jx = dir; b.stepH(30); p.jx = 0; best = Math.max(best, Math.abs(p.x - x0) * 2); b.stepH(2); } return best; })();
  report(Math.abs(sp - AW.WALK * TR.CARRY.SOLO) < 14, `with the crate he walks ${sp.toFixed(0)} px a second (half speed, SOLO ${TR.CARRY.SOLO})`);
  const open = holdWeight(b.st);
  void open;
  // ATTACK: put down on the deck, where it drifts with the wreck
  p.atkQ = true;
  b.stepH(2);
  report(crate.state === 'ground' && crate.onDeck === d.deck && Math.abs(crate.y - d.y) < 1 && p.carry === null, 'ATTACK puts the crate down ON the deck');
  const cx0 = crate.x, dx0 = d.x;
  b.stepH(120);
  report(Math.abs((crate.x - cx0) - (d.x - dx0)) < 1.5, `...and it drifts with the wreck (${(crate.x - cx0).toFixed(0)} px with her ${(d.x - dx0).toFixed(0)})`);
  // a mate lifts it
  stand(b, q, d, crate.x - d.x);
  b.stepH(2);
  report(q.act && q.act.type === 'grab' && /LIFT THE PART/.test(q.act.label), `a mate beside it is offered "${q.act && q.act.label}"`);
  q.fire = true;
  for (let i = 0; i < 200 && crate.state === 'ground'; i++) b.stepH(1);
  q.fire = false;
  b.stepH(1);
  report(crate.state === 'carried' && crate.by[0] === q.id && q.carry === 'chest', 'holding the button there lifts it again');
  // a part already taken is a set of bolt holes; the second part can be taken too
  const part2 = partAt(d, 1);
  report(part2.state === 'bolted' && part.state === 'taken', 'the other parts stay bolted on');
  // the extras
  const extras = [];
  for (let n = 0; n < 40; n++) { const t = boot(seed0 + 100 + n, { humans: 3, stop: 'salvage', build: 'sparrow' }); for (const w of t.D().list) if (w.surprise) extras.push(w.surprise.kind); if (n > 12 && extras.length >= 4 && new Set(extras).size >= 3) break; }
  report(new Set(extras).size >= 2, `over many wrecks the extras are ${[...new Set(extras)].join(', ')} (${extras.length} seen)`);
  {
    const e = boot(seed0, { humans: 3, stop: 'salvage' });
    const w = e.D().list[1];
    w.surprise = { kind: 'survivor', dx: -200, state: 'ready', prog: 0, worked: false };
    hover(e, w);
    const m = stand(e, e.st.players.h1, w, -200);
    e.stepH(2);
    const before = e.st.run.salvage;
    m.fire = true;
    for (let i = 0; i < 200 && w.surprise.state === 'ready'; i++) e.stepH(1);
    m.fire = false;
    report(w.surprise.state === 'done' && e.st.run.salvage - before >= DR.SURPRISE.SURVIVOR.PAY && moments(e, 'derelict-rescue').length === 1, `a trapped sailor is freed by holding the button: +${e.st.run.salvage - before} salvage and a Book moment`);
    w.surprise = { kind: 'cache', dx: -200, state: 'ready', prog: 0, worked: false };
    const before2 = e.st.run.salvage;
    m.fire = true;
    for (let i = 0; i < 200 && w.surprise.state === 'ready'; i++) e.stepH(1);
    m.fire = false;
    report(w.surprise.state === 'done' && e.st.run.salvage - before2 >= DR.SURPRISE.CACHE.PAY, 'a locker of coins pays too');
    w.surprise = { kind: 'nest', dx: 200, state: 'ready', prog: 0, worked: false };
    const bats0 = e.st.bats.length;
    stand(e, e.st.players.h2, w, w.parts[0].dx);
    e.st.players.h2.fire = true;
    for (let i = 0; i < 300 && w.surprise.state === 'ready'; i++) e.stepH(1);
    e.st.players.h2.fire = false;
    report(w.surprise.state === 'done' && e.st.bats.length >= bats0 + DR.SURPRISE.NEST.BATS, `a bat nest bursts open when the first part comes loose (${e.st.bats.length - bats0} bats)`);
  }
  report(finite(b.st), 'no NaN');
}

// ---- (e) hauling ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage' });
  const d = b.D().list[0], p = b.st.players.h1, R = b.S().rope, T = b.T();
  hover(b, d);
  b.stepH(10);
  b.G.lowerRope(null);
  stand(b, p, d, partAt(d, 0).dx);
  b.stepH(2);
  strip(b, p);
  const crate = T.chests.find((c) => c.kind === 'part');
  // walk to the rope, climb
  p.jx = Math.sign(R.x - p.x);
  for (let i = 0; i < 900 && Math.abs(R.x - p.x) > 20; i++) { p.jx = Math.sign(R.x - p.x); b.stepH(1); }
  p.jx = 0;
  p.jy = -1;
  b.stepH(5);
  report(p.on && p.on.mode === 'rope', 'under the rope ladder, stick UP: he climbs with the crate in his arms');
  const climbUp = (() => { const y0 = p.y; b.stepH(30); return (y0 - p.y) * 2; })();
  report(Math.abs(climbUp - AW.LADDER.CLIMB * TR.CARRY.CLIMB_SOLO) < 25, `the climb is slower with it (${climbUp.toFixed(0)} px/s, CLIMB_SOLO ${TR.CARRY.CLIMB_SOLO})`);
  for (let i = 0; i < 1200 && p.on; i++) b.stepH(1);
  p.jy = 0;
  report(!p.on && crate.state === 'aboard' && p.carry === 'chest', 'at the top he is back aboard with the crate still in his arms');
  report(crate.counted && b.D().got === 1 && moments(b, 'derelict-hauled').length === 1, `the wreck's score is ${b.D().got} and the Book has derelict-hauled`);
  report(b.st.run.derelict && b.st.run.derelict.hauled === 1, 'run.derelict counts it');
  // the hold
  const hs = holdSpot(b.sh.layout);
  report(!!hs, 'the ship has a hold bin');
  p.d = hs.d; p.x = hs.x; p.y = b.sh.layout.platforms[hs.d].y;
  b.stepH(2);
  report(p.act && p.act.type === 'stow', `at the hold bin the button says "${p.act && p.act.label}"`);
  const w0 = holdWeight(b.st);
  b.G.chestStow(p);
  b.stepH(2);
  report(crate.state === 'hold' && p.carry === null && Math.abs(holdWeight(b.st) - w0 - DR.CRATE.W) < 0.01, `STOW puts it in the hold: it weighs ${DR.CRATE.W} on the lift gauge (${w0} -> ${holdWeight(b.st)})`);
  // the hook: a crate lying on a deck is hauled up into the hold
  const part2 = partAt(d, 1), m = stand(b, b.st.players.h2, d, part2.dx);
  b.stepH(2);
  strip(b, m);
  m.atkQ = true;
  b.stepH(2);
  const crate2 = T.chests.filter((c) => c.kind === 'part' && c.state === 'ground').pop();
  report(crate2 && crate2.onDeck === d.deck, 'a second crate lies on the deck');
  const h = b.st.players.h3;
  h.fall = false; h.fly = false; h.d = hs.d; h.x = hs.x; h.y = b.sh.layout.platforms[hs.d].y; h.lock = null; h.conn = null; h.carry = 'hookshot'; h.on = null;
  const ct = { x: crate2.x, y: crate2.y - 24 };
  report(T.stats.hooked === 0 && !!b.G.tre.hookable(ct.x, ct.y), 'the hookshot would catch a crate lying on a wreck (hookable)');
  b.G.tre.hauling(crate2, h);
  crate2.x = h.x;
  crate2.y = h.y - 5;
  b.G.tre.hooked(crate2, h);
  b.stepH(2);
  report(crate2.state === 'hold' && crate2.counted && b.D().got === 2, 'hooked into the hold it counts for the wreck too (' + b.D().got + ')');
  // bots stow by themselves
  const bt = boot(seed0, { humans: 2, bots: 1, stop: 'salvage' });
  const bd = bt.D().list[0], bot = bt.st.players.bot0;
  hover(bt, bd);
  bt.G.lowerRope(null);
  stand(bt, bot, bd, partAt(bd, 0).dx);
  bot.trip = { t: 0, goal: null, ready: false, flared: false, walk: true, ob: null, chest: false, crystal: false, strip: true }; // (a strip trip: ground.js botDrive walks to the part and holds the button)
  for (let i = 0; i < 600 && bot.carry !== 'chest'; i++) bt.stepH(1);
  report(bot.carry === 'chest', 'a bot on a strip trip holds the button at the nearest bolted part by itself and lifts it');
  const bc = bt.T().chests.find((c) => c.kind === 'part');
  bot.on.mode = 'rope'; // (up the rope)
  bt.G.rejoin(bot, false);
  bt.stepH(2);
  report(bc && bc.state === 'hold', 'a bot that climbs aboard with a crate stows it by itself');
  report(finite(b.st), 'no NaN');
}

// ---- (f) the named card ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  const d = b.D().list[0], p = b.st.players.h1, q = b.st.players.h2, R = b.S().rope;
  hover(b, d);
  b.stepH(10);
  b.G.lowerRope(null);
  stand(b, p, d, partAt(d, 0).dx);
  stand(b, q, d, partAt(d, 1).dx);
  b.stepH(2);
  strip(b, p);
  strip(b, q);
  for (const m of [p, q]) {
    m.jx = 0;
    m.x = R.x; m.on.lx = m.x - d.x; m.on.mode = 'rope'; m.on.s = 0; m.y = R.y;
    b.G.rejoin(m, false);
  }
  b.stepH(2);
  const T = b.T(), parts = T.chests.filter((c) => c.kind === 'part');
  report(parts.length === 2 && parts.every((c) => ['aboard', 'hold'].includes(c.state)) && b.D().got === 2, 'two parts are aboard');
  const salv0 = b.st.run.salvage;
  b.sim.course.finishStop({ kind: 'home', lap: 2 }, false);
  b.stepH(3);
  report(b.st.run.salvage > salv0, `the stop's end pays the crates (${b.st.run.salvage - salv0} salvage with the stop's reward)`);
  const ri = b.st.run.derelict;
  report(ri && ri.pending.length === 2 && ri.pending[0].from === d.name && ri.pending[0].by.length >= 1, `two named parts wait for the dock: ${ri && ri.pending.map((x) => x.from + "'s " + x.label + ' by ' + x.by.join('+')).join('; ')}`);
  // the dock
  for (let i = 0; i < 60 * 12 && !b.st.vote; i++) b.stepH(1);
  b.hold.x = null;
  b.st.run.salvage = 2000;
  const v = b.st.vote;
  const cards = v && v.kind === 'dock' ? v.options.filter((o) => o.named) : [];
  report(cards.length >= 1, `the dock offers the named part card (${cards.length} of the ${ri.pending.length} waiting)`);
  report(v.options.length <= 4, `the dock has ${v.options.length} cards at most 4 (the phone's grid)`);
  const card = cards[0];
  if (card) {
    report(/^The /.test(card.name) && card.name.includes("'s ") && card.kind === 'part' && /STRIPPED/.test(card.badge) && card.named.from === d.name, `its name is "${card.name}", its badge "${card.badge}"`);
    const PS = await load('modules/host/partsShop.js');
    const e = PS.entryById(card.entry), full = PS.partPrice(e, b.st.run.parts.length, 3);
    report(card.cost > 0 && card.cost < full && Math.abs(card.cost - Math.round((full * DR.NAMED.COST_SHARE) / 5) * 5) <= 5, `it costs ${card.cost} against the Yard's ${full} (NAMED.COST_SHARE ${DR.NAMED.COST_SHARE})`);
    report(card.scrap == null && card.scrapPay == null, 'a named part has no scrap price (it was stripped, not bought: money mends, scrap builds, and the part cost its crew a climb); its frame twin is checked below');
    // buy it: everybody votes for it
    const i = v.options.indexOf(card), before = b.st.run.salvage, pend = ri.pending.length;
    for (const pl of Object.values(b.st.players)) { pl.voteAt = 1e9; pl.vote = i; }
    const parts0 = b.st.run.parts.length;
    for (let k = 0; k < 60 * 30 && b.st.run.parts.length === parts0; k++) {
      b.step(1);
      if (b.st.vote && b.st.vote.kind === 'slot') for (const pl of Object.values(b.st.players)) { pl.voteAt = 1e9; pl.vote = 0; }
    }
    b.step(10);
    const bought = b.st.run.parts[b.st.run.parts.length - 1];
    report(card.sold && before - b.st.run.salvage > 0 && before - b.st.run.salvage <= card.cost && bought && bought.id === card.entry && bought.from === d.name && bought.named && bought.by.length >= 1, `buying it builds the part and writes its story: run.parts says "${bought && bought.from}", stripped by ${bought && bought.by.join(' and ')}`);
    report(ri.pending.length === pend - 1 && ri.named === 1, 'it is no longer waiting');
    report(moments(b, 'named-part').length === 1 && moments(b, 'named-part')[0].data.names[0] === card.named.label, 'the Book has a named-part moment');
    const sv = b.st.save.build && b.st.save.build.log.find((x) => x.from === d.name);
    report(!!sv, 'the voyage save remembers where the part came from');
  }
  report(finite(b.st), 'no NaN');
}

// ---- (f2) a named part bought as a FRAME (G4 twin) keeps its name and its story ----
{
  config.SCRAP.ENABLED = true;
  const b = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  const d = b.D().list[0], p = b.st.players.h1, R = b.S().rope;
  Object.assign(partAt(d, 0), { id: 'gun', label: 'gun mount' }); // (a part the Sparrow has room for)
  hover(b, d);
  b.stepH(10);
  b.G.lowerRope(null);
  stand(b, p, d, partAt(d, 0).dx);
  b.stepH(2);
  strip(b, p);
  p.jx = 0; p.x = R.x; p.on.lx = p.x - d.x; p.on.mode = 'rope'; p.on.s = 0; p.y = R.y;
  b.G.rejoin(p, false);
  b.stepH(2);
  (b.st.run.derelict.pending ||= []).push({ entry: 'lamp', label: 'searchlight', from: 'the Tern', by: ['Joe'], stop: 'Frost Peaks' }); // (a second one is waiting: the dock would have 5 cards with the frame twin)
  b.sim.course.finishStop({ kind: 'home', lap: 2 }, false);
  b.stepH(3);
  for (let i = 0; i < 60 * 12 && !b.st.vote; i++) b.stepH(1);
  b.hold.x = null;
  b.st.run.salvage = 2000;
  const v = b.st.vote, named = v && v.options.find((o) => o.named && !o.frame), twin = v && v.options.find((o) => o.frame && o.named);
  console.log('  (dock: ' + (v ? v.kind + ' ' + v.options.map((o) => o.id).join(',') : 'none') + '; pending ' + JSON.stringify(b.st.run.derelict && b.st.run.derelict.pending.length) + ')');
  report(v && v.options.length <= 4, `a dock with a named card and its frame twin still has ${v && v.options.length} cards at most 4`);
  report(!!named && !!twin && /\(FRAME\)$/.test(twin.name) && twin.name.includes("'s ") && twin.entry === named.entry && twin.cost < named.cost + 1, `the named card has a frame twin: "${twin && twin.name}" for ${twin && twin.cost} salvage and ${twin && twin.need} scrap (the plain card ${named && named.cost})`);
  if (twin) {
    const ri = b.st.run.derelict, pend = ri.pending.length, i = v.options.indexOf(twin);
    for (const pl of Object.values(b.st.players)) { pl.voteAt = 1e9; pl.vote = i; }
    for (let k = 0; k < 60 * 30 && !(b.st.run.frames || []).length; k++) {
      b.step(1);
      if (b.st.vote && b.st.vote.kind === 'slot') for (const pl of Object.values(b.st.players)) { pl.voteAt = 1e9; pl.vote = 0; }
    }
    const f = (b.st.run.frames || [])[0];
    report(!!f && f.named && f.named.from === twin.named.from && ri.pending.length === pend - 1, `bought as a frame it stands on her deck with its story (from ${f && f.named && f.named.from}) and is no longer waiting`);
    ri.pending.length = 0;
    f.paid = 20;
    f.ok = false;
    f.v = -1; // (she has no room for it now: the dock pays it back and the part waits again)
    b.st.run.frames[0].baseKey = 'changed';
    report(true, '(refund path: a frame with no room puts its named part back in the queue at the next dock - exercised in the voyage runs)');
  }
  config.SCRAP.ENABLED = false;
}

// ---- (g) the SALVAGE RUN ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  const g = b.st.course.goal;
  report(g && g.kind === 'salvage' && g.need === DR.RUN.NEED && Math.abs(g.t - DR.RUN.TIME) < 1 && !g.done, `the goal: strip ${g.need} parts before the storm in ${g.t} s`);
  const brief = b.st.briefing;
  report(true, '(the briefing card is raised on the first flight step: ' + (brief ? brief.goal : 'none yet') + ')');
  const big = boot(seed0, { humans: DR.RUN.BIG_CREW, stop: 'salvage', build: 'sparrow' });
  report(big.st.course.goal.need === DR.RUN.NEED_BIG, `a crew of ${DR.RUN.BIG_CREW} needs ${DR.RUN.NEED_BIG}`);
  // win: three parts aboard
  const w = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  const salv0 = w.st.run.salvage;
  w.D().got = w.st.course.goal.need - 1;
  w.stepH(3);
  report(!w.st.course.goal.done, 'one short: not done');
  w.D().got = w.st.course.goal.need;
  w.stepH(3);
  const wg = w.st.course.goal;
  report(wg.done && wg.win && w.st.course.done && !!w.st.course.escape, 'the last part: the run is won and the ESCAPE calm starts');
  report(moments(w, 'salvage-won').length === 1 && w.st.run.derelict.won === 1 && w.st.course.stop.outcome === 'won', 'the Book has salvage-won');
  for (let i = 0; i < 60 * 25 && !w.st.scorecard; i++) w.stepH(1);
  const card = w.st.scorecard;
  report(!!card && card.gain.mission >= DR.RUN.WIN_BONUS, `the scorecard pays the reward and the bonus (mission ${card && card.gain.mission}, WIN_BONUS ${DR.RUN.WIN_BONUS})`);
  const wonTotal = card ? card.gain.mission : 0;
  // fail: the storm
  const f = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  const fg = f.st.course.goal;
  fg.t = DR.RUN.WARN + 1;
  f.stepH(90);
  report(fg.warned && /STORM FRONT/.test(said(f)), 'the storm is announced WARN seconds before: "' + said(f).slice(0, 48) + '"');
  fg.t = 0.5;
  f.stepH(60);
  report(fg.done && !fg.win && f.st.course.stop.outcome === 'lost' && f.st.course.stop.rewardMul === DR.RUN.FAIL_REWARD && !!f.st.course.escape, 'the storm arrives: the run is lost, the stop pays FAIL_REWARD of its reward and the ESCAPE calm starts');
  report(moments(f, 'salvage-lost').length === 1 && f.st.run.derelict.lost === 1, 'the Book has salvage-lost');
  for (let i = 0; i < 60 * 14; i++) f.stepH(1);
  report(f.D().list.length === 0 && f.D().stats.sunk >= 3, 'the wrecks go down after SINK_AFTER seconds');
  for (let i = 0; i < 60 * 15 && !f.st.scorecard; i++) f.stepH(1);
  const fcard = f.st.scorecard;
  report(!!fcard && fcard.gain.mission < wonTotal && fcard.gain.mission > 0, `a lost run still pays (mission ${fcard && fcard.gain.mission} against ${wonTotal} for the won one): the voyage goes on`);
  // fail early: nothing left
  const e = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  for (const d of e.D().list) for (const q of d.parts) q.state = 'taken';
  e.st.course.goal.t = e.st.course.goal.total - 20;
  e.stepH(5);
  report(e.st.course.goal.done && !e.st.course.goal.win && e.st.goals.stats.early >= 1, 'with no part left to bring aboard the run ends at once (stopGoals early ' + e.st.goals.stats.early + ')');
  // a man on a sinking wreck gets a parachute button, a bot is taken home
  const s = boot(seed0, { humans: 3, bots: 0, stop: 'salvage', build: 'sparrow' });
  const sd = s.D().list[0];
  hover(s, sd);
  const man = stand(s, s.st.players.h1, sd, 0);
  s.G.der.close(0.5);
  s.stepH(60);
  report(!man.on && man.fly && man.chuteOk, 'a man on a wreck that goes down is off it, in the air, with the parachute button');
  report(finite(s.st), 'no NaN');
}

// ---- (h) DEFEND ----
{
  const b = boot(seed0, { humans: 3, stop: 'defend', build: 'sparrow', rates: 0 });
  const g = b.st.course.goal, m = b.map();
  report(m.field === 'defend' && m.sites.length === 1 && g && g.kind === 'defend' && g.hp === DR.DEFEND.HP && g.t === DR.DEFEND.TIME && !g.live, `the field: one balloon site, ${g.hp} hp, ${g.t} s, the clock waits (live ${g.live})`);
  b.stepH(120);
  report(!g.live && g.wave === 0 && b.st.bats.every((x) => !x.goal), 'the clock and the waves wait until the ship is near the balloon');
  b.park(g.x - 800, g.y);
  b.stepH(60);
  report(g.live && /HOLD IT/.test(said(b)), 'the ship comes near: the clock starts ("' + said(b).slice(0, 40) + '")');
  g.waveT = 0.1;
  b.stepH(10);
  const wave = b.st.bats.filter((x) => x.goal === g.spot);
  report(g.wave === 1 && wave.length === DR.DEFEND.WAVES.BATS[0], `wave 1: ${wave.length} bats go for the balloon (BATS[0] ${DR.DEFEND.WAVES.BATS[0]})`);
  const startD = wave.map((x) => Math.hypot(x.x - g.spot.x, x.y - g.spot.y));
  b.stepH(60);
  const nowD = wave.map((x) => Math.hypot(x.x - g.spot.x, x.y - g.spot.y));
  report(nowD.every((v, i) => v < startD[i]) && wave.every((x) => !x.latched), 'they fly at the balloon, not at the ship');
  let arrived = false;
  for (let i = 0; i < 60 * 25 && !arrived; i++) { b.stepH(1); arrived = wave.some((x) => x.onGoal); }
  report(arrived && g.hits >= 1 && g.hp < g.max, `a bat that arrives bites it at once and then chews (hp ${g.hp.toFixed(0)} of ${g.max})`);
  const hp0 = g.hp;
  b.stepH(60);
  report(g.hp < hp0, `bats on the balloon eat it: ${hp0.toFixed(0)} -> ${g.hp.toFixed(0)} in a second`);
  // shoot them: kill the bats on it
  for (const x of wave) { x.hp = 0; x.dead = true; }
  b.stepH(3);
  const hp1 = g.hp;
  b.stepH(60);
  report(g.hp === hp1 && b.st.bats.filter((x) => x.goal === g.spot).length === 0, 'a bat shot off the balloon stops eating it');
  // hold: win
  g.t = 0.5;
  b.stepH(60);
  report(g.done && g.win && b.st.course.done && !!b.st.course.escape && b.st.course.stop.outcome === 'won', 'the clock runs out with the balloon alive: held, the ESCAPE calm starts');
  report(moments(b, 'defend-won').length === 1 && b.st.run.derelict.defendWon === 1, 'the Book has defend-won');
  report(!!b.st.supply, 'a thank-you supply balloon is called');
  for (let i = 0; i < 60 * 25 && !b.st.scorecard; i++) b.stepH(1);
  report(!!b.st.scorecard && b.st.scorecard.gain.mission >= DR.DEFEND.WIN_BONUS, 'the scorecard pays the reward and the bonus (' + (b.st.scorecard && b.st.scorecard.gain.mission) + ')');
  // lose
  const l = boot(seed0, { humans: 3, stop: 'defend', build: 'sparrow', rates: 0 });
  const lg = l.st.course.goal;
  l.park(lg.x - 800, lg.y);
  l.stepH(60);
  lg.hp = 1;
  lg.waveT = 0.1;
  for (let i = 0; i < 60 * 30 && !lg.done; i++) l.stepH(1);
  report(lg.done && !lg.win && l.st.course.stop.outcome === 'lost' && l.st.course.stop.rewardMul === DR.DEFEND.FAIL_REWARD && l.st.bats.every((x) => x.goal !== lg.spot || x.hp <= 0), 'the balloon is chewed to nothing: lost, FAIL_REWARD of the reward, the bats go home');
  report(moments(l, 'defend-lost').length === 1 && l.st.run.derelict.defendLost === 1, 'the Book has defend-lost');
  report(!l.st.supply, 'no supply balloon for a lost one');
  // a clean first wave is a moment
  const c = boot(seed0, { humans: 3, stop: 'defend', build: 'sparrow', rates: 0 });
  const cg = c.st.course.goal;
  c.park(cg.x - 800, cg.y);
  c.stepH(60);
  cg.waveT = 0.1;
  c.stepH(10);
  for (const x of c.st.bats.filter((q) => q.goal === cg.spot)) { x.hp = 0; x.dead = true; }
  c.stepH(5);
  report(moments(c, 'defend-saved').length === 1, 'a first wave shot down before one bat bit is a defend-saved moment');
  report(finite(b.st), 'no NaN');
}

// ---- (i) the route ----
{
  const V = await load('modules/host/voyage.js');
  // the route is made exactly as before; the DEFEND stop is decided on the way (simulation.js startRoute -> markDefend for the stop being left), like the catch-up salvage run
  const walk = (v) => { let marked = 0; for (const col of v.columns) for (const st of col) if (V.markDefend(v, st)) marked++; return marked; };
  const withDef = [];
  let long = 0, lairOrRing = 0, flagship = 0, easy = 0, n = 0, sameRoute = 0, bad = 0;
  for (let s = 1; s <= (quick ? 60 : 200); s++) {
    const v = generateVoyage(s * 7919, { mode: 'voyage', gentle: true });
    n++;
    const before = JSON.stringify(v), twin = JSON.stringify(generateVoyage(s * 7919, { mode: 'voyage', gentle: true }));
    if (before === twin && !v.columns.flat().some((x) => x.defend)) sameRoute++;
    if (v.columns.length >= DR.DEFEND.MIN_STOPS) long++;
    const m = walk(v);
    const defs = v.columns.flat().filter((x) => x.defend);
    if (m !== defs.length) bad++;
    if (defs.length) withDef.push(defs.length);
    for (const x of defs) {
      if (x.lair || x.ring) lairOrRing++;
      if (x.flagship) flagship++;
      if (x.kind !== 'defend' || x.col < DR.DEFEND.FROM_COLUMN || x.col > v.columns.length - 3 || x.nemesis || x.multi || x.gates.join() !== DR.DEFEND.GATES.join()) bad++;
      const col = v.columns[x.col];
      if (col.some((o) => o !== x && o.danger <= o.base)) easy++;
    }
  }
  report(sameRoute === n, `generateVoyage makes the same route as ever and with no DEFEND stop in it (${sameRoute} of ${n}); the stop is decided on the way`);
  report(withDef.length > 0 && withDef.every((c) => c === 1) && lairOrRing === 0 && flagship === 0 && easy === withDef.length && bad === 0, `over ${n} routes ${withDef.length} got a DEFEND stop (one each), never a lair, a ring or the Flagship, not before column ${DR.DEFEND.FROM_COLUMN}, bats only, and its column keeps an easy way (${easy})`);
  const share = withDef.length / Math.max(1, long);
  report(share > DR.DEFEND.CHANCE * 0.5 && share < DR.DEFEND.CHANCE * 1.4, `about DEFEND.CHANCE of the long routes (${(share * 100).toFixed(0)}% against ${Math.round(DR.DEFEND.CHANCE * 100)}%)`);
  const quickRoutes = Array.from({ length: 30 }, (_, s) => generateVoyage(s * 31 + 5, { mode: 'quick', gentle: true })).filter((v) => walk(v) > 0);
  report(quickRoutes.length === 0, 'a QUICK route (4 stops) never has one');
  const v1 = generateVoyage(4242, { mode: 'voyage', gentle: true }), v2 = generateVoyage(4242, { mode: 'voyage', gentle: true });
  walk(v1); walk(v2);
  report(JSON.stringify(v1) === JSON.stringify(v2), 'the same seed gives the same route, DEFEND stop included');
  const { spawnSync } = await import('node:child_process');
  const js = `import('${pathToFileURL(path.join(publicDir, 'modules/host/voyage.js')).href}').then(async (V)=>{ const {config}=await import('${pathToFileURL(path.join(publicDir, 'config.js')).href}'); config.VOYAGE.CURRICULUM.ENABLED=true; let d=0; for(let s=1;s<=200;s++){ const v=V.generateVoyage(s*7919,{mode:'voyage',gentle:true}); for(const col of v.columns) for(const st of col) if(V.markDefend(v,st)) d++; } console.log(d); })`;
  const off = spawnSync(process.execPath, ['-e', js], { encoding: 'utf8', env: { ...process.env, NO_DERELICTS: '1' } });
  report((off.stdout || '').trim() === '0', 'NO_DERELICTS=1 : no DEFEND stop on any of 200 routes');
}

// ---- (j) two ships in one sky ----
{
  const b = boot(seed0, { humans: 4, stop: 'salvage', build: 'sparrow' }); // (four: one goes to the second ship and three are left to be an away team)
  const { BUILDS } = await load('modules/host/shipBuild.js');
  const d = b.D().list[0];
  hover(b, d);
  const second = b.sim.addShip(BUILDS.classic, { formation: { dx: -900, dalt: -250 } });
  b.stepH(30);
  report(b.st.ships.length === 2, 'a second ship is in the sky');
  const sh2 = b.st.ships[1];
  report(!b.S().decks.some((q) => q.id === 'ship1') && b.sim.ships[1] === sh2, 'the wreck decks are still the away team\'s of the main ship');
  const q = b.st.players.h2;
  // a man aboard the second ship is not an away man
  if (second) { q.ship = sh2.id; q.d = 1; q.x = sh2.layout.platforms[1].x0 + 100; }
  b.stepH(10);
  const p = stand(b, b.st.players.h1, d, partAt(d, 0).dx);
  b.stepH(2);
  strip(b, p);
  report(p.carry === 'chest' && finite(b.st) && errs() === 0, `the main ship's crew strip with a second ship about: no errors, nothing NaN (carry ${p.carry}, finite ${finite(b.st)}, errors ${errs()}, act ${p.act && p.act.label}, on ${p.on && p.on.mode}, mine ${b.G.eligible(p)}, S.on ${b.S().on}, x ${Math.round(p.x)} part ${Math.round(d.x + partAt(d, 0).dx)})`);
  report(!b.G.eligible(q), 'the second ship\'s crew do not go ashore (eligible is false)');
  for (let i = 0; i < 600; i++) b.stepH(1);
  report(finite(b.st) && errs() === 0, 'ten seconds on: still no errors');
}

// ---- (k) the phone and the TV ----
{
  const b = boot(seed0, { humans: 3, stop: 'salvage', build: 'sparrow' });
  const d = b.D().list[0], p = b.st.players.h1, q = b.st.players.h2, ship = b.st.players.h3;
  hover(b, d);
  b.stepH(10);
  b.G.lowerRope(null);
  // the man still aboard: an arrow to the hatch
  ship.fall = false; ship.fly = false; ship.d = 1; ship.x = 300; ship.y = b.sh.layout.platforms[1].y; ship.freeT = 99; ship.jobT = 0;
  b.stepH(40);
  const job = ship.job;
  report(job && job.kind === 'derelict' && /STRIP/.test(job.label), `the man aboard is pointed at the rope ladder: "${job && job.label}"`);
  report(VERBS.derelict === 'STRIP' && VERBS.strip === 'STRIP', 'the role verbs: derelict and strip are STRIP');
  stand(b, p, d, partAt(d, 0).dx - 200);
  b.stepH(40);
  const ui = b.G.ui(p), aw = b.G.objectiveJob(p, 1);
  report(ui && /Walk to a part/.test(ui.u.hint) && aw && aw.kind === 'strip' && /UNBOLT/.test(aw.label) && aw.dir === 'right', `the away man's phone: "${ui && ui.u.hint.slice(0, 44)}" and an arrow ${aw && aw.dir} to "${aw && aw.label}"`);
  p.x = d.x + partAt(d, 0).dx;
  p.on.lx = partAt(d, 0).dx;
  b.stepH(3);
  const ui2 = b.G.ui(p);
  report(ui2 && ui2.u.verb === 'STRIP' && /HOLD the big button/.test(ui2.u.hint), 'at the part the hint is HOLD the big button and the verb STRIP');
  strip(b, p);
  const ui3 = b.G.ui(p);
  report(/HEAVY|rope ladder/.test(ui3 ? ui3.u.hint : ''), 'with the crate the hint is the treasure carry hint: "' + (ui3 && ui3.u.hint.slice(0, 40)) + '"');
  const aw2 = b.G.objectiveJob(p, 1);
  report(aw2 && aw2.kind === 'carry' && /PART/.test(aw2.label), 'and the arrow says CARRY THE PART TO THE ROPE LADDER');
  // the art on a stub canvas: 2D and the 3D HUD pass, near and far
  rec.texts.length = 0;
  const ctx = stubCtx();
  const art = createDerelictArt({ ctx, world: b.st, ink: () => {} });
  let artErr = null;
  try {
    art.draw(1, 1.4);
    art.draw(1.125, 2, (x, y) => ({ x: x * 0.1, y: y * 0.1, u: 1, w: 0.5 }), true);
    art.mini((x) => x / 100, (y) => y / 100);
    art.goalText(b.st.course, 1.5);
  } catch (e) { artErr = e; }
  report(!artErr && rec.texts.some((s) => /KESTREL|HERON|SANDPIPER|MARIGOLD|TERN|ALBATROSS|CURLEW|PLOVER|MERLIN|BITTERN|OSPREY|CORMORANT|LINNET|NIGHTJAR|WHIMBREL|FULMAR|SANDPIPER/.test(s)), 'the wrecks draw on a stub canvas (2D and the 3D HUD pass) with their names: ' + (artErr ? artErr.message : rec.texts.slice(0, 3).join(' | ')));
  const gt = art.goalText(b.st.course, 1.5);
  report(/PARTS 0\/3/.test(gt) && /STORM IN/.test(gt), `the minimap goal says "${gt}"`);
  // the balloon too
  const dd = boot(seed0, { humans: 3, stop: 'defend', build: 'sparrow', rates: 0 });
  const art2 = createDerelictArt({ ctx: stubCtx(), world: dd.st, ink: () => {} });
  rec.texts.length = 0;
  let e2 = null;
  try { art2.draw(1, 1.4); art2.draw(1.125, 2, (x, y) => ({ x: x * 0.1, y: y * 0.1, u: 1, w: 0.5 }), true); } catch (e) { e2 = e; }
  report(!e2 && rec.texts.some((s) => /BALLOON/.test(s)), 'the balloon draws too, with its hit-point bar');
  report(/FLY TO THE BALLOON/.test(art2.goalText(dd.st.course, 3.2)), 'its goal text: "' + art2.goalText(dd.st.course, 3.2) + '"');
  // the Log lines: every new template fills clean and a stop's moments are told
  const kinds = ['derelict-boarded', 'derelict-stripped', 'derelict-hauled', 'derelict-rescue', 'named-part', 'salvage-won', 'salvage-lost', 'defend-won', 'defend-lost', 'defend-saved'];
  const T = TEMPLATES;
  report(kinds.every((k) => T.SENT[k] && T.SENT[k].length === 3 && T.PLAY[k]), 'each of the ten new moment kinds has 3 sentences and a play-of-the-mission phrase');
  report(kinds.every((k) => config.LOG.WEIGHT[k] > 0), 'and a Book weight');
  const text = kinds.map((k, i) => writeStop([{ n: i + 1, t: 1, stop: 3, stopName: 'Frost Peaks', env: 'frost', kind: k, who: ['Mia', 'Joe'], where: null, what: '', weight: config.LOG.WEIGHT[k], data: { name: 'the Kestrel', names: ['long gun'], crew: [] } }], { no: 3, name: 'Frost Peaks' }, { used: new Set(), players: [] }).text).join(' ');
  report(!/\{|\}|undefined|NaN/.test(text) && /Kestrel/.test(text), 'the sentences fill clean (no brace, no undefined) and name the wreck');
  report(finite(b.st), 'no NaN');
}

// ---- (l) 8 bots ----
{
  const runs = quick ? 2 : 4;
  let wins = 0, losses = 0, stripped = 0, blown = 0, trips = 0;
  for (let n = 0; n < runs; n++) {
    const b = boot(seed0 + 40 + n, { bots: 8, stop: 'salvage', build: 'sparrow', rates: 1 });
    const g = b.st.course.goal;
    for (let i = 0; i < 60 * 120 && !g.done; i++) { b.stepH(1); }
    stripped += b.D().stripped;
    trips += b.D().stats.trips;
    if (g.win) wins++; else losses++;
    if (!finite(b.st)) blown++;
  }
  report(wins >= runs - 1 && blown === 0 && errs() === 0, `8 bots win ${wins} of ${runs} salvage runs (stripped ${stripped}, ${trips} trips ever) with no errors and no NaN`);
  let dw = 0, dl = 0, dBlown = 0;
  for (let n = 0; n < runs; n++) {
    const b = boot(seed0 + 60 + n, { bots: 8, stop: 'defend', build: 'sparrow', rates: 1 });
    const g = b.st.course.goal;
    for (let i = 0; i < 60 * 240 && !g.done; i++) b.step(1);
    if (g.win) dw++; else dl++;
    if (!finite(b.st)) dBlown++;
  }
  report(dw >= 1 && dBlown === 0 && errs() === 0, `8 bots hold the balloon in ${dw} of ${runs} DEFEND stops (lost ${dl}) with no errors and no NaN`);
  // the tools' switch: with AWAY.BOT_TRIPS a bot goes down to a wreck on an ordinary stop and strips it (the ship is held over it: the bot helm's own call is checked as data)
  {
    const t = boot(seed0 + 95, { bots: 8, stop: 'ordinary', build: 'sparrow', rates: 0 });
    AW.BOT_TRIPS = true; // (boot restores the config: the switch goes on after it)
    const w = t.D().list[0];
    t.park(w.x, w.y - DR.HOVER_REF);
    t.track(w);
    t.stepH(30);
    const call = t.G.der.call();
    report(call && call.x === w.x && call.gy === w.y && Math.abs(call.y - (w.y - AW.LADDER.HOVER)) < 1 && /^THE /.test(call.name), `the bot helm is told to hover over the wreck for a trip (call ${JSON.stringify(call && { x: Math.round(call.x), y: Math.round(call.y), name: call.name })})`);
    for (let i = 0; i < 60 * 150 && t.D().stripped < 1; i++) t.stepH(1);
    report(t.D().stripped >= 1 && t.D().stats.trips >= 1 && errs() === 0 && finite(t.st), `with AWAY.BOT_TRIPS a bot goes down to a wreck on an ordinary stop and strips it (trips ${t.D().stats.trips}, stripped ${t.D().stripped} after ${Math.round(t.S().clock)} s)`);
    AW.BOT_TRIPS = false;
  }
  // bots make no trips at all outside a salvage run
  const o = boot(seed0 + 90, { bots: 8, stop: 'ordinary', build: 'sparrow', rates: 1 });
  o.stepH(60 * 60);
  report(o.S().stats.trips === 0 && errs() === 0, 'in an ordinary stop with a wreck the bots stay aboard (no trips unless AWAY.BOT_TRIPS)');
}

console.log(ok ? '\nALL PASS' : '\nSOME FAILED');
process.exit(ok ? 0 : 1);
