// PARTS BREAK OFF FOR REAL gate (SHIP_BUILDING.md S.5i; public/modules/host/breakOff.js, debris.js, shipSim.js breakOff, config.BREAKOFF). Headless.
//   node tools/buildsim.mjs --check-breakoff        or directly:   node tools/breakoff-check.mjs [--seed 1] [--quick 1]
//
//   (a) THE PLANNER (pure): a blast at the bomb bay takes the bay, the parts round it and what hung from them (and not the helm, the boiler or the guns far away); a limb cut takes a deck end
//       with its engine; scars are left; the last deck and the last gasbag always stay; every random cut of 5 builds still builds; hit boxes and collision points leave the hole; the validator
//       WARNs "bomb bay beside the boiler / coal" and not on the classic ship;
//   (b) A BOMB BAY EXPLOSION in flight with bots aboard: the right parts go, she keeps flying with the new shape (weight, balance, lift, stations, modules, engines, nav tables updated, nothing
//       NaN, 20 s with 0 errors), crew standing on the lost stretch FALL (airborne: land lower or fall overboard), the debris tumbles and expires, the coal is alight, the bombs are gone, hull hurt;
//   (c) THE CAUSES: a hard hit on a loaded bay sets it off (and on an empty one does not), fire that burns in the bay long enough cooks it off, a heavy hit breaks the end it struck at the chance
//       the config says and ARMOUR PLATE on that stretch cuts it, a crash into rock and a ram break the part at the contact point (the first measured, the second with two ships flown head on),
//       a flat ripped bag tears away from a many-bag ship (never a single one) and the nest on it goes too;
//   (d) LOST UNTIL REBUILT: the ledger (run.lost), the REBUILD card at the next sky-dock (price, the cascade of older ones, paid, restores the parts exactly via the Yard's fit path), no new part
//       cards while sections are missing, a new voyage starts her whole;
//   (e) the enemy GUNSHIP (a real Ship) and a second ship in the fleet lose parts the same way, and are made whole again when rebuilt; a ship facing LEFT does not jump;
//   (f) a gasbag lost leaves each other bag its own gas, the lift deficit makes her heavy for what she has left;
//   (g) bots: 3 minutes of botsim on two maps with a forced break-off every 20 s: 0 errors, the crew rebuild at the dock.
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0;
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS, buildLayout, balanceOf } = await load('modules/host/shipBuild.js');
const { validate } = await load('modules/host/buildCheck.js');
const BO = await load('modules/host/breakOff.js');
const { applyBuild } = await load('shipLayout.js');
const BE = await load('modules/host/buildEdit.js');
const P = await load('modules/host/pose.js');
const { loadBuild } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'buildload.mjs')).href);
const BOC = config.BREAKOFF;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
const SAVED = JSON.stringify(config.BREAKOFF);
const restoreConfig = () => { const o = JSON.parse(SAVED); for (const k of Object.keys(config.BREAKOFF)) delete config.BREAKOFF[k]; Object.assign(config.BREAKOFF, o); };

// ---- helpers ----
function boot({ bots = 0, parts = null, startBuild = null, f = 1, calm = true, map = 'open' } = {}) {
  config.MAPS.FORCE_KIND = map;
  config.ENVIRONMENTS.FORCE = 'skyisles';
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9; }
  clock = seedRandom(seed);
  applyBuild(BUILDS.classic); // (ship 0's layout is the one global: a scene that broke parts off must not hand them on to the next)
  const sim = createSimulation();
  const st = sim.state;
  if (startBuild) sim.setStartBuild(startBuild);
  if (parts) sim.fitShip(parts, 'yard');
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  if (f === -1) ours.pose.f = -1;
  return { sim, st, ours };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const secs = (s) => Math.round(s * 60);
const finiteDeep = (o, depth = 0, seen = new Set()) => {
  if (o == null || typeof o === 'string' || typeof o === 'boolean' || typeof o === 'function') return true;
  if (typeof o === 'number') return Number.isFinite(o);
  if (typeof o !== 'object' || depth > 3 || seen.has(o)) return true;
  seen.add(o);
  for (const k of Object.keys(o)) { let v; try { v = o[k]; } catch { continue; } if (!finiteDeep(v, depth + 1, seen)) return false; }
  return true;
};
const namesOf = (L) => [...L.stations.map((s) => s.n), ...L.engines.map((s) => s.name)];
const sparrow = BUILDS.sparrow;
const bagsParts = await loadBuild('bags', BUILDS);
const multiParts = await loadBuild('multi', BUILDS);

// ---------------------------------------------------------------- (a) the planner
{
  const L0 = buildLayout(BUILDS.classic), rng = () => 1;
  const bay = L0.bombBay;
  const plan = BO.planBreak(BUILDS.classic, { kind: 'blast', x: bay.x, y: bay.y - 30, r: BOC.BAY.RADIUS }, rng);
  const L1 = buildLayout(plan.parts);
  const gone = plan.names;
  report(plan.ok && gone.includes('Bomb Bay') && gone.includes('Coal Bunker') && gone.includes('Ventral Gun'), `a blast at the bomb bay takes the bay, the coal bunker beside it and the ball turret's gun (lost: ${gone.join(', ')})`);
  report(['Helm', 'Boiler', 'Tail Gun', 'Nose Gun', 'Lookout', 'Fore Engine', 'Fore Sponson', 'Ammo Hold'].every((n) => namesOf(L1).includes(n)), 'what is far from the blast stays: the helm, the boiler, the top guns, the fore engine, the ammunition');
  report(plan.mass > 15 && balanceOf(plan.parts).mass < balanceOf(BUILDS.classic).mass - 15, `she weighs ${Math.round(plan.mass)} less, the ledger knows the mass and the lift lost`);
  report(L1.scars && L1.scars.length >= 2 && plan.scars.length === L1.scars.length && plan.pieces.length >= 1, `the holes are SCARS in the parts list (${L1.scars && L1.scars.length}) and make ${plan.pieces.length} piece(s) of debris`);
  const hr = (L, x, y) => L.hitRects.some((r) => x > r.x0 && x < r.x1 && y > r.y0 && y <= r.y1);
  const s0 = plan.scars[0];
  report(hr(L0, (s0.x0 + s0.x1) / 2, s0.y0 + 40) && !hr(L1, (s0.x0 + s0.x1) / 2, s0.y0 + 40), 'a shell goes through the hole (the hit boxes lost it) and the collision outline lost the points inside it');
  report(BO.rebuildPrice(plan) >= BOC.REBUILD.MIN && BO.rebuildPrice(plan) <= BOC.REBUILD.MAX, `mending it costs ${BO.rebuildPrice(plan)} salvage (between ${BOC.REBUILD.MIN} and ${BOC.REBUILD.MAX})`);

  const limb = BO.planBreak(BUILDS.classic, { kind: 'part', name: 'Aft Engine' }, rng);
  const L2 = buildLayout(limb.parts);
  report(limb.ok && !namesOf(L2).includes('Aft Engine') && namesOf(L2).includes('Fore Engine') && L2.platforms.find((q) => q.id === 'lower').x0 > 20, `the limb an engine stands on is the end of the lower deck: she loses the Aft Engine and ${limb.deckPx} px of deck (${limb.summary})`);
  const pod = BO.planBreak(BUILDS.classic, { kind: 'part', name: 'Ventral Gun' }, rng);
  report(pod.ok && !namesOf(buildLayout(pod.parts)).includes('Ventral Gun') && pod.cuts[0].whole, 'a small deck (the ball turret) goes whole');
  const helm = BO.planBreak(BUILDS.classic, { kind: 'part', name: 'Helm' }, rng);
  report(helm.ok && !buildLayout(helm.parts).stations.some((s) => s.kind === 'helm'), 'the helm mount can go (she keeps flying without a helm: S.5e): the plan still builds');

  // never the last deck, never the last gasbag
  const tiny = BE.emptyBuild();
  const oneDeck = BE.drawBag(BE.drawDeck(tiny, 'main', 140, 700).parts, 100, 800).parts;
  const wipe = BO.planBreak(oneDeck, { kind: 'blast', x: 420, y: 640, r: 2000 }, rng);
  report(!wipe.ok || (buildLayout(wipe.parts).platforms.length >= 1 && buildLayout(wipe.parts).gasbags.length >= 1), 'a blast that would take everything leaves a deck and a gasbag (the minimum ship drifts)');
  const bag1 = BO.planBreak(BUILDS.classic, { kind: 'bag', index: 0 }, rng);
  report(!bag1.ok || buildLayout(bag1.parts).gasbags.length >= 1, 'the only gasbag never tears away');
  const L4 = buildLayout(bagsParts);
  const tear = BO.planBreak(bagsParts, { kind: 'bag', index: 3 }, rng);
  report(tear.ok && buildLayout(tear.parts).gasbags.length === 3 && L4.gasbags.length === 4, `one of four bags tears away: three are left (${tear.summary})`);
  const tearMid = BO.planBreak(bagsParts, { kind: 'bag', index: 1 }, rng);
  report(tearMid.ok && buildLayout(tearMid.parts).platforms.every((q) => q.id !== 'nest' || q.x1 - q.x0 > 0), 'a bag torn from the middle plans cleanly (the nest on it is judged against the bags that are left)');

  // fuzz: random blasts and limbs on five builds always build, and each result is still a ship the sim accepts
  let fuzz = 0, bad = 0;
  const R = BO.makeRng(7);
  for (const [name, parts] of [['classic', BUILDS.classic], ['sparrow', sparrow], ['bags', bagsParts], ['multi', multiParts], ['classic+plate', BE.addArmour(BUILDS.classic, 'lower', 20, 600).parts]]) {
    for (let i = 0; i < (quick ? 40 : 120); i++) {
      const L = buildLayout(parts), b = L.bounds;
      const x = b.x0 + R() * (b.x1 - b.x0), y = b.y0 + R() * (b.y1 - b.y0);
      const spec = i % 3 === 0 ? { kind: 'blast', x, y, r: 100 + R() * 400 } : i % 3 === 1 ? { kind: 'limb', x, y, reach: 100 + R() * 300 } : { kind: 'bag', index: (R() * L.gasbags.length) | 0 };
      const pl = BO.planBreak(parts, spec, R);
      fuzz++;
      if (!pl.ok) continue;
      try { const L2 = buildLayout(pl.parts); if (!L2.platforms.length || !L2.gasbags.length || !Number.isFinite(balanceOf(pl.parts).mass)) bad++; validate(pl.parts); } catch { bad++; }
    }
  }
  report(bad === 0, `${fuzz} random blasts, limbs and torn bags on 5 builds: every result builds, has a deck and a gasbag, and validates without throwing`);

  // the validator: a bay beside the boiler WARNs, the classic ship does not
  const warnsOf = (parts) => validate(parts).checks.filter((c) => c.group === 'Break-off' && c.level === 'WARN');
  const near = BUILDS.classic.map((p) => (p.part === 'station' && p.kind === 'boiler' ? { ...p, p: 'lower', x: 470 } : p));
  report(warnsOf(BUILDS.classic).length === 0 && validate(BUILDS.classic).checks.some((c) => c.group === 'Break-off' && c.level === 'INFO'), 'the validator: the classic ship has no chain-reaction WARN, but an INFO on what a bay explosion would take and on break-off risk');
  report(warnsOf(near).length === 1 && /bomb bay beside the boiler/.test(warnsOf(near)[0].text), `the validator WARNs "bomb bay beside the boiler: chain-reaction risk" when they are close (${(warnsOf(near)[0] || {}).text ? warnsOf(near)[0].text.slice(0, 80) : 'no warning'}...)`);
}

// ---------------------------------------------------------------- (b) a bomb bay explosion in flight
{
  const { sim, st, ours } = boot({ bots: 6 });
  step(sim, secs(12));
  const L = ours.layout, before = { stations: L.stations.length, engines: L.engines.length, decks: L.platforms.length, mass: L.balance.mass, names: namesOf(L), modules: st.modules.map((m) => m.name) };
  // two crew stand on the lower deck stretch the blast will take (a person and a bot), one far away
  const lowD = L.deckIndex('lower');
  const victim = st.players.bot0, far = st.players.bot1;
  Object.assign(victim, { d: lowD, x: 480, y: L.platforms[lowD].y, fall: false, fly: false, conn: null, lock: null, vx: 0 });
  Object.assign(far, { d: lowD, x: 1450, y: L.platforms[lowD].y, fall: false, fly: false, conn: null, lock: null, vx: 0 });
  ours.pose.f === 1 && (st.bombBay.bombs = 4);
  const hull0 = st.ship.hull, fires0 = st.fires.length;
  const r = ours.sim.explodeBay('test');
  const firesNow = st.fires.length;
  report(!!r && st.bombBay.bombs === 0, 'the bomb bay goes up: the bombs are gone');
  const L2 = ours.layout;
  const after = namesOf(L2);
  report(!after.includes('Bomb Bay') && !after.includes('Coal Bunker') && after.includes('Helm') && after.includes('Boiler') && after.includes('Fore Engine'), 'the right parts are gone (the bay, the coal), the rest is still there');
  report(L2.platforms.length !== before.decks || L2.stations.length < before.stations, `the layout was replaced in place (${before.stations} stations -> ${L2.stations.length}, ${before.decks} decks -> ${L2.platforms.length}, version ${L2.version})`);
  report(L2.balance.mass < before.mass - 10 && Math.abs(L2.balance.mass - balanceOf(ours.layout.parts).mass) < 1e-6, `her weight and balance followed: ${before.mass.toFixed(0)} -> ${L2.balance.mass.toFixed(0)}, centre of mass x ${L2.balance.comX.toFixed(0)}`);
  step(sim, 2);
  const mods = st.modules.map((m) => m.name);
  report(!mods.includes('Bomb Bay') && !mods.includes('Ventral Gun') && mods.includes('Helm') && st.modules.every((m) => Number.isFinite(m.hp)), 'the modules of the lost stations are gone, the others kept their hit points');
  report(Object.keys(st.GUNS).length === L2.stations.filter((s) => s.kind === 'gun').length && !('Ventral Gun' in st.GUNS) && st.engines.length === L2.engines.length && st.bags.length === L2.gasbags.length, 'the guns, engines and bags were made again from the new layout');
  const nav = ours.nav;
  const dm = L2.deckIndex('main'), dc = L2.deckIndex('catwalk');
  report(Number.isFinite(nav.plan(dc, 400, dm, 300).cost) && L2.platforms.every((q, d) => d === dm || Number.isFinite(nav.plan(dm, 300, d, (q.x0 + q.x1) / 2).cost) || q.id.startsWith('lower')), 'the walking routes were planned again against the new decks (the nav tables answer)');
  report(victim.fly === true && victim.lock === null, 'a crewman standing on the stretch that went is FALLING (free flight)');
  report(!far.fly && far.d != null && Math.abs(L2.platforms[far.d].y - L.platforms[lowD].y) < 1, 'a crewman far from the blast keeps his deck (his deck index was followed)');
  report(st.debris.length >= 1 && st.debris.every((d) => d.ship === ours), `${st.debris.length} piece(s) of debris in the sky`);
  const d0 = st.debris.map((d) => ({ vy: d.vy, rot: d.rot, y: d.y }));
  step(sim, 60);
  const moved = st.debris.length && st.debris.every((d, i) => d.vy > d0[i].vy + 100 && Math.abs(d.rot - d0[i].rot) > 0.01 && d.y !== d0[i].y);
  report(moved, 'the debris falls and spins');
  step(sim, secs(BOC.DEBRIS.LIFE + 1));
  report(st.debris.length === 0, 'the debris is gone after its life');
  report(st.ship.hull < hull0 - 2 && firesNow > fires0, `the blast hurt the hull (${hull0.toFixed(0)} -> ${st.ship.hull.toFixed(0)}) and lit ${firesNow - fires0} fire(s) in the ammunition / boiler / coal that was left`);
  report(st.breakStats.events === 1 && st.breakStats.bay === 1 && st.breakStats.fell >= 1 && st.run.lost.length === 1 && st.run.lost[0].before.length === BUILDS.classic.length, `the ledger: ${st.run.lost[0].label.slice(0, 70)}... costs ${st.run.lost[0].price}`);
  step(sim, secs(20));
  report(errors.length === 0 && finiteDeep(st.ship) && finiteDeep(st.balance) && finiteDeep(st.forces.state || st.forces) && finiteDeep(st.thrust) && finiteDeep(ours.pose) && st.bags.every((b) => Number.isFinite(b.gas)), 'she keeps flying with the new shape: 20 s more, 0 errors, nothing NaN');
  const live = Object.values(st.players).filter((p) => !p.fall && !p.fly);
  report(live.length >= 4 && live.every((p) => p.d == null || (L2.platforms[p.d] && Number.isFinite(p.x))), `the crew are on her decks or have landed (${live.length} of ${Object.keys(st.players).length} on a deck)`);
  const lockedNames = Object.values(st.players).map((p) => p.lock).filter(Boolean);
  report(lockedNames.every((n) => after.includes(n) || n in st.GUNS || /Searchlight|Escort/.test(n)), 'nobody holds a station that is gone');
}

// ---------------------------------------------------------------- (c) the causes
{
  // a hard hit on a LOADED bomb bay sets it off; an empty bay does not
  restoreConfig();
  const { sim, st, ours } = boot();
  step(sim, secs(2));
  BOC.BAY.HIT_CHANCE = 1;
  const bay = ours.layout.bombBay;
  st.bombBay.bombs = 0;
  ours.sim.impact(bay.x, bay.y, 3);
  report(st.breakStats.events === 0 && ours.layout.stations.some((s) => s.kind === 'bombBay'), 'a hard hit on an EMPTY bomb bay does nothing more than hurt');
  st.bombBay.bombs = 3;
  ours.sim.impact(bay.x, bay.y, 1);
  report(st.breakStats.events === 0, 'a light hit (power 1) on a loaded bay does not set it off');
  ours.sim.impact(bay.x, bay.y, 3);
  report(st.breakStats.bay === 1 && !ours.layout.stations.some((s) => s.kind === 'bombBay') && st.bombBay.bombs === 0, 'a hard hit on a loaded bay sets it off (the bombs go, the bay goes)');
  restoreConfig();
}
{
  // fire in the bay cooks the bombs off
  const { sim, st, ours } = boot();
  step(sim, secs(2));
  const bay = ours.layout.bombBay, d = ours.layout.deckIndex('bay');
  st.bombBay.bombs = 3;
  let t = -1;
  for (let i = 0; i < secs(BOC.BAY.COOKOFF + 15) && t < 0; i++) {
    st.fires.splice(0, st.fires.length, { x: bay.x, d, t: 0, prog: 0 }); // (ONE fire, and the crew never get to it)
    step(sim, 1);
    if (st.breakStats.bay) t = i / 60;
  }
  report(t > BOC.BAY.COOKOFF - 2 && t < BOC.BAY.COOKOFF + 6, `fire in the bay cooks the bombs off after about ${BOC.BAY.COOKOFF} s (it took ${t.toFixed(1)} s)`);
  st.fires.length = 0;
  const { sim: sim2, st: st2, ours: o2 } = boot();
  step(sim2, secs(2));
  st2.bombBay.bombs = 0;
  for (let i = 0; i < secs(30); i++) { if (i % 30 === 0 && st2.fires.filter((f) => f.d === o2.layout.deckIndex('bay')).length < 1) st2.fires.push({ x: o2.layout.bombBay.x, d: o2.layout.deckIndex('bay'), t: 0, prog: 0 }); step(sim2, 1); }
  report(st2.breakStats.bay === 0, 'fire in an empty bay never goes off');
}
{
  // heavy hits and armour plate: the same blow at the same place, with and without plate
  restoreConfig();
  const trials = quick ? 150 : 300, power = 4;
  const run = (parts) => {
    const { sim, st, ours } = boot({ parts });
    step(sim, secs(1));
    let broke = 0;
    for (let t = 0; t < trials; t++) {
      sim.fitShip(parts, 'yard');
      ours.sim.seedBreak(1000 + t);
      st.ship.hull = 100; st.ship.down = 0; st.wreck = null; st.run.lost.length = 0;
      const n0 = st.breakStats.events;
      ours.sim.impact(70, 800, power);
      if (st.breakStats.events > n0) broke++;
    }
    return broke;
  };
  const plain = run(BUILDS.classic);
  const plated = run(BE.addArmour(BUILDS.classic, 'lower', 20, 500).parts);
  const expect = Math.min(BOC.HIT.MAX, BOC.HIT.CHANCE + (power - BOC.HIT.MIN_POWER) * BOC.HIT.PER_POWER);
  report(Math.abs(plain / trials - expect) < 0.09, `a power-${power} hit on the aft outrigger breaks it off ${plain} of ${trials} times (${(plain / trials * 100).toFixed(0)}%; config says ${(expect * 100).toFixed(0)}%)`);
  report(plated < plain * 0.5 && Math.abs(plated / trials - expect * BOC.ARMOUR_MUL) < 0.06, `with armour plate on that stretch it breaks off ${plated} of ${trials} times (${(plated / trials * 100).toFixed(0)}%; expected about ${(expect * BOC.ARMOUR_MUL * 100).toFixed(0)}%)`);
  const { sim, st, ours } = boot();
  step(sim, secs(1));
  let weak = 0;
  for (let t = 0; t < 100; t++) { sim.fitShip(BUILDS.classic, 'classic'); ours.sim.seedBreak(5000 + t); st.ship.hull = 100; st.run.lost.length = 0; const n0 = st.breakStats.events; ours.sim.impact(70, 800, 1.5); if (st.breakStats.events > n0) weak++; }
  report(weak === 0, 'a hit below the threshold power never breaks anything off (100 tries)');
  // a hit on the open gasbag / in the middle of a deck breaks nothing off (only ends and small decks go)
  let mid = 0;
  for (let t = 0; t < 100; t++) { sim.fitShip(BUILDS.classic, 'classic'); ours.sim.seedBreak(7000 + t); st.ship.hull = 100; st.run.lost.length = 0; const n0 = st.breakStats.events; ours.sim.impact(760, 700, 5); if (st.breakStats.events > n0) mid++; }
  report(mid === 0, 'a power-5 hit in the middle of the main deck breaks nothing off (only deck ends, belly pods and nests are limbs)');
  restoreConfig();
}
{
  // crash and ram chances
  restoreConfig();
  const { sim, st, ours } = boot();
  step(sim, secs(1));
  const rate = (kind, closing) => {
    let n = 0;
    const T = quick ? 100 : 200;
    for (let t = 0; t < T; t++) { sim.fitShip(BUILDS.classic, 'classic'); ours.sim.seedBreak(9000 + t); st.run.lost.length = 0; if (ours.sim.crash(70, 880, closing, kind)) n++; }
    return n / T;
  };
  const C = BOC.CRASH, Rm = BOC.RAM;
  report(rate('crash', C.MIN_CLOSING - 20) === 0 && rate('ram', Rm.MIN_CLOSING - 20) === 0, 'below the closing speed that hurts nothing breaks off');
  const hi = rate('crash', C.FULL_CLOSING), lo = rate('crash', C.MIN_CLOSING + 5);
  report(hi > lo && Math.abs(hi - C.MAX) < 0.12 && lo < 0.2, `a crash into rock: ${(lo * 100).toFixed(0)}% just above ${C.MIN_CLOSING} px/s, ${(hi * 100).toFixed(0)}% at ${C.FULL_CLOSING} (config ${(C.CHANCE * 100).toFixed(0)}% .. ${(C.MAX * 100).toFixed(0)}%)`);
  const rh = rate('ram', Rm.FULL_CLOSING);
  report(Math.abs(rh - Rm.MAX) < 0.12, `a ram at ${Rm.FULL_CLOSING} px/s breaks the contact part ${(rh * 100).toFixed(0)}% of the time (config ${(Rm.MAX * 100).toFixed(0)}%)`);
  restoreConfig();
}
{
  // a crash into rock (the real hook in course.js): a wall of rock across the sky ahead of a ship flown at speed breaks off the part that struck it; slowly it does not
  const crashAt = (thr, chance) => {
    restoreConfig();
    BOC.CRASH.MIN_CLOSING = 200; BOC.CRASH.CHANCE = BOC.CRASH.MAX = chance;
    const { sim, st, ours } = boot({ map: 'network' });
    const helm = ours.layout.one('helm');
    st.players.h = { id: 'h', name: 'Helm', species: 'fox', color: '#fff', x: helm.x, y: ours.layout.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0, thr };
    const map = st.course.map;
    map.solid.fill(0);
    ours.pose.x = 3000; ours.pose.y = 3000; ours.state.speed = thr;
    const farX = Math.max(...ours.layout.samples.map(([sx]) => P.toWorldX(ours, sx)));
    const wi = Math.floor((farX + 900) / map.CELL);
    for (let i = wi; i < map.W; i++) for (let j = 0; j < map.H; j++) map.solid[j * map.W + i] = 1;
    const mass0 = ours.layout.balance.mass;
    for (let i = 0; i < secs(10); i++) { ours.pose.y = 3000; ours.pose.vy = 0; ours.state.press = Math.min(ours.state.press, 72); step(sim, 1); }
    return { crash: st.breakStats.crash, lost: st.run.lost.length, label: st.run.lost[0] ? st.run.lost[0].label.slice(0, 70) : 'nothing', mass0, mass1: ours.layout.balance.mass }; // (read now: the next scene applies the classic ship to the same global layout)
  };
  const fast = crashAt(1, 1), slow = crashAt(0.15, 1);
  report(fast.crash >= 1 && fast.mass1 < fast.mass0 && fast.lost >= 1 && errors.length === 0, `a ship flown into a wall of rock at speed loses the part that struck it (${fast.label})`);
  report(slow.crash === 0, 'the same wall met slowly breaks nothing (the crash is about the closing speed)');
  restoreConfig();
}
{
  // a ram: two ships flown head on break off the part at the contact point
  restoreConfig();
  BOC.RAM.MIN_CLOSING = 50; BOC.RAM.CHANCE = BOC.RAM.MAX = 1;
  config.MAPS.FORCE_KIND = 'open'; config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(seed);
  applyBuild(BUILDS.classic);
  const sim = createSimulation(), st = sim.state;
  const A = st.ships[0], B = sim.addShip(BUILDS.classic, { id: 'ship1', formation: { dx: -250, dalt: -1150 } });
  const hum = (sh) => { const helm = sh.layout.one('helm'); const h = { id: 'h_' + sh.id, ship: sh.id, name: 'Helm', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: sh.layout.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0, thr: 1 }; st.players[h.id] = h; return h; };
  hum(A); hum(B);
  sim.castOff();
  st.course.map.solid.fill(0);
  const stand = (sh, x, y, f) => { sh.pose.x = x; sh.pose.y = y; sh.pose.f = f; sh.pose.vy = 0; sh.state.speed = 1; };
  stand(A, 3000, 3000, 1); stand(B, 7200, 3000 + 330, -1); // (B a little lower: A's bow meets her bag from the side, the gondolas of both near each other)
  for (let i = 0; i < secs(14); i++) {
    stand(A, A.pose.x, 3000, 1); stand(B, B.pose.x, 3330, -1);
    for (const sh of [A, B]) sh.state.press = Math.min(sh.state.press, 72);
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(String(e && e.stack).split('\n').slice(0, 3).join('|')); break; }
    st.ev.warn = Math.min(st.ev.warn, 0.01);
    if (A.sim && (A.ctx.breakStats.ram || B.ctx.breakStats.ram) && i > 60) break;
  }
  const rams = A.ctx.breakStats.ram + B.ctx.breakStats.ram;
  const lostBow = [A, B].some((sh) => sh.ctx.breakStats.ram && sh.lost && sh.lost.length >= 1 && sh.lost[0].cause === 'ram' && sh.layout.scars && sh.layout.scars.length >= 1);
  report(rams >= 1 && lostBow && errors.length === 0, `two ships flown head on: ${rams} of them lost the part at the contact point (ship 0 ${A.layout.stations.length} stations, ship 1 ${B.layout.stations.length},})`);
  restoreConfig();
}
{
  // a flat bag that is ripped to rags tears away from a ship with several bags (never from one with a single bag)
  restoreConfig();
  const { sim, st, ours } = boot({ parts: bagsParts });
  step(sim, secs(3));
  const last = st.bags.length - 1;
  const nest0 = ours.layout.platforms.filter((q) => q.id === 'nest').length;
  const gasMean0 = st.ship.gas;
  st.bags[last].gas = 0;
  for (let i = 0; i < 4; i++) st.gasHoles.push(sim.gasHoleAt(1700 + i * 10, 450, last));
  let t = -1;
  for (let i = 0; i < secs(BOC.BAG.TEAR_TIME + 8) && t < 0; i++) { st.bags[last] && (st.bags[last].gas = Math.min(st.bags[last].gas, 1)); step(sim, 1); if (st.breakStats.bag) t = i / 60; }
  report(t > BOC.BAG.TEAR_TIME - 1 && t < BOC.BAG.TEAR_TIME + 4 && ours.layout.gasbags.length === 3, `a flat bag with 4 holes tears away after ${t.toFixed(1)} s of it (config ${BOC.BAG.TEAR_TIME} s): ${ours.layout.gasbags.length} bags left`);
  report(st.bags.length === 3 && st.gasHoles.every((h) => h.bag < 3) && st.bags.slice(0, 2).every((b) => b.gas > 30), 'the other bags kept their own gas, the torn bag\'s holes went with it');
  report(st.liftDeficit >= 0 && Number.isFinite(st.liftDeficit), `the lift she has left is counted (deficit ${st.liftDeficit.toFixed(1)} gas points: she is heavy for her bags)`);
  step(sim, secs(10));
  report(errors.length === 0 && finiteDeep(st.ship), 'she flies on with three bags');
  const { sim: s1, st: t1, ours: o1 } = boot();
  step(s1, secs(2));
  t1.bags[0].gas = 0;
  for (let i = 0; i < 4; i++) t1.gasHoles.push(s1.gasHoleAt(900, 450, 0));
  step(s1, secs(BOC.BAG.TEAR_TIME + 6));
  report(t1.breakStats.bag === 0 && o1.layout.gasbags.length === 1, 'a ship with a single bag never loses it this way');
  restoreConfig();
}

// ---------------------------------------------------------------- (d) lost until rebuilt
{
  restoreConfig();
  const { sim, st, ours } = boot({ startBuild: 'classic', bots: 0 });
  st.players.h = { id: 'h', name: 'Pat', species: 'fox', color: '#fff', x: 300, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null };
  step(sim, secs(3));
  const classic = JSON.stringify(BUILDS.classic);
  st.bombBay.bombs = 3;
  ours.sim.explodeBay('test'); // (one break-off)
  step(sim, secs(BOC.GRACE + 1));
  ours.sim.breakOff({ kind: 'part', name: 'Fore Engine' }, { force: true }); // (and a second)
  const lost = st.run.lost;
  report(lost.length === 2 && ours.buildId === 'broken' && JSON.stringify(lost[0].before) === classic && JSON.stringify(lost[1].before) === JSON.stringify(ours.layout.parts) === false, 'two break-offs are two entries in run.lost (oldest first, each with the parts as they were before)');
  const damaged = JSON.stringify(ours.layout.parts);
  st.run.salvage = 2000;
  sim.startDock();
  const cards = st.vote ? st.vote.options.filter((o) => o.rebuild != null) : [];
  report(st.vote && st.vote.kind === 'dock' && cards.length === 2 && cards[0].cost > cards[1].cost && cards[1].cost === lost[1].price && cards[0].cost === lost[0].price + lost[1].price && cards[0].name.startsWith('Rebuild'), `the sky-dock offers a REBUILD card for each: "${cards[0] && cards[0].name}" ${cards[0] && cards[0].cost}, "${cards[1] && cards[1].name}" ${cards[1] && cards[1].cost} (the older one mends both)`);
  report(!st.vote.options.some((o) => o.kind === 'part'), 'no new part cards while sections are missing');
  // buy the newest one first: only the Fore Engine comes back
  const idx = st.vote.options.indexOf(cards[1]);
  const paid0 = st.run.salvage;
  st.players.h.vote = idx;
  step(sim, secs(12));
  report(st.run.lost.length === 1 && paid0 - st.run.salvage === cards[1].cost && ours.layout.engines.length === 2 && !ours.layout.stations.some((s) => s.kind === 'bombBay') && ours.buildId === 'broken', `buying the newer card (${cards[1].cost}) brings the Fore Engine back and leaves the bomb bay's wreckage (one entry left)`);
  // then the older: the whole ship is as she was
  const open = st.vote && st.vote.kind === 'dock' ? st.vote : null;
  report(!!open, 'the dock stays open for more shopping');
  const card0 = open && open.options.find((o) => o.rebuild === 0);
  if (open && card0) {
    const paid1 = st.run.salvage;
    st.players.h.vote = open.options.indexOf(card0);
    st.players.h.voteAt = 0;
    step(sim, secs(12));
    report(st.run.lost.length === 0 && paid1 - st.run.salvage === card0.cost && JSON.stringify(ours.layout.parts) === classic && ours.buildId === 'classic', 'buying the older card puts her back exactly as she was (parts identical to the classic ship, build id back to classic)');
    report(namesOf(ours.layout).length === namesOf(buildLayout(BUILDS.classic)).length && Object.keys(st.GUNS).length === 7 && st.modules.length > 5 && ours.layout.scars === undefined, 'her guns, modules and layout are the classic ship\'s again, with no scars');
  } else report(false, 'the older REBUILD card is there');
  void damaged;
  step(sim, secs(5));
  // a new voyage starts her whole
  const { sim: s2, st: t2, ours: o2 } = boot();
  step(s2, secs(2));
  o2.sim.breakOff({ kind: 'part', name: 'Fore Engine' }, { force: true });
  t2.run.lost.length === 1 && o2.layout.engines.length === 1 ? null : report(false, 'setup: the engine broke off');
  s2.restart();
  report(JSON.stringify(o2.layout.parts) === classic && t2.run.lost.length === 0 && o2.layout.engines.length === 2 && o2.buildId === 'classic', 'a new voyage (the run ends / restart) starts her whole again');
}

{
  // the Voyage's own ship, the Sparrow (what the browser game starts with): a limb breaks, the dock sells the rebuild (and no part card), she is the Sparrow again
  restoreConfig();
  const { sim, st, ours } = boot({ startBuild: 'sparrow', bots: 6 });
  step(sim, secs(6));
  const sparrowJson = JSON.stringify(BUILDS.sparrow);
  const r1 = ours.sim.breakOff({ kind: 'part', name: 'Fore Engine' }, { force: true });
  step(sim, secs(BOC.GRACE + 1));
  const r2 = ours.sim.breakOff({ kind: 'part', name: 'Tail Gun' }, { force: true });
  step(sim, secs(8));
  report(!!r1 && !!r2 && st.run.lost.length === 2 && ours.layout.engines.length === 1 && !ours.layout.stations.some((s) => s.n === 'Tail Gun') && errors.length === 0, `the Sparrow loses her Fore Engine and her Tail Gun in flight (${r1 && r1.plan.summary.slice(0, 40)} / ${r2 && r2.plan.summary.slice(0, 40)}) and flies on for 8 s with 0 errors`);
  st.players.h = { id: 'h', name: 'Pat', species: 'fox', color: '#fff', x: 300, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true, ko: 0, lock: null };
  for (const p of Object.values(st.players)) if (p.bot) p.connected = false;
  st.run.salvage = 2000;
  sim.startDock();
  const card = st.vote && st.vote.options.find((o) => o.rebuild === 0);
  report(!!card && !st.vote.options.some((o) => o.kind === 'part') && card.cost === st.run.lost[0].price + st.run.lost[1].price, `the dock sells the Sparrow's REBUILD ("${card && card.name}", ${card && card.cost}) and no part card`);
  if (card) {
    st.players.h.vote = st.vote.options.indexOf(card);
    step(sim, secs(12));
    report(st.run.lost.length === 0 && JSON.stringify(ours.layout.parts) === sparrowJson && ours.buildId === 'sparrow' && JSON.stringify(st.run.build) === sparrowJson, 'bought: she is exactly the Sparrow again (parts, build id, the voyage\'s build)');
  }
  step(sim, secs(4));
  report(errors.length === 0, 'and flies on');
}

// ---------------------------------------------------------------- (e) the gunship and a second ship; a ship facing left
{
  restoreConfig();
  config.GUNSHIP.AS_SHIP = true;
  const { sim, st, ours } = boot({ bots: 4 });
  let g = null;
  for (let k = 0; k < 20 && !g; k++) { if (sim.gunship.spawn({ seed: 3, hull: 'frigate', mission: 2, special: null, personality: 'aggressive' })) g = st.gunship; else step(sim, 60); }
  step(sim, secs(4));
  g = st.gunship;
  const hs = g && g.ship;
  report(!!hs && hs.ai && hs.layout.engines.length >= 1, 'the enemy gunship is a real Ship with a layout (engines, guns, decks)');
  if (hs) {
    const eng0 = hs.layout.engines.length, deck0 = hs.layout.platforms.length, guns0 = hs.layout.stations.filter((s) => s.kind === 'gun').length;
    const r = hs.sim.breakOff({ kind: 'part', name: hs.layout.engines[0].name }, { force: true });
    report(!!r && hs.layout.engines.length === eng0 - 1 && hs.lost && hs.lost.length === 1, `a part of the gunship breaks off (her ${hs.layout.engines[0] ? '' : 'engine'} lost: ${r ? r.plan.summary.slice(0, 60) : 'nothing'}); her ledger has it`);
    // a gun that broke off her while her other guns fire (a broadside is due every step): her port for it is down, nothing reads the missing gun
    const cannons = g.ports.map((pt, i) => (pt.kind === 'cannon' ? i : -1)).filter((i) => i >= 0);
    if (cannons.length >= 2) {
      const gone = g.info.guns[cannons[cannons.length - 1]];
      hs.sim.breakOff({ kind: 'part', name: gone, reach: 100, len: 100 }, { force: true });
      const other = g.info.guns[cannons[0]]; // (her gunner fires the broadside - with the guns gone from under him a stand-in record is enough: the balls are made at her live ports)
      try { hs.ai.shoot({ id: 'x' }, { cd: 0 }, other); } catch (e) { errors.push(String(e && e.stack).split('\n').slice(0, 3).join('|')); } // (her other gun fires the broadside: the port of the gun that broke off is down, and nothing reads the missing gun)
      step(sim, secs(12), () => { g.fireOk = true; });
      report(errors.length === 0 && !(gone in hs.ctx.GUNS), `a gun broke off the gunship while her broadside was due every step: 12 s, 0 errors${errors.length ? ' ' + errors[0] : ''}`);
    }
    // every one of her stations and engines, one after another (her captain, her gunners and her crew must cope with a ship that loses her guns, her helm, her boiler ...)
    const each = [...hs.layout.stations.map((s) => s.n), ...hs.layout.engines.map((e) => e.name)];
    let lostEach = 0;
    for (const n of each) {
      if (!st.ships.includes(hs)) break; // (she may be sunk meanwhile)
      if (hs.sim.breakOff({ kind: 'part', name: n }, { force: true })) lostEach++;
      step(sim, secs(4));
    }
    const r2 = st.ships.includes(hs) ? hs.sim.breakOff({ kind: 'blast', x: hs.layout.midPoint.x, y: hs.layout.platforms[0].y, r: 260 }, { force: true }) : null; // (...and then a blast through what is left of her)
    step(sim, secs(25));
    report(errors.length === 0, `she lost her stations one after another (${lostEach} break-offs: guns, helm, boiler, coal ...) and the director, her captain and her crew coped: 0 errors${errors.length ? ' ' + errors[0] : ''}`);
    report(errors.length === 0 && hs.layout.platforms.length >= 1 && finiteDeep(hs.state) && finiteDeep(hs.pose), `she keeps flying and fighting with what is left (${hs.layout.platforms.length} decks of ${deck0}, ${hs.layout.stations.filter((s) => s.kind === 'gun').length} guns of ${guns0}; a blast took ${r2 ? r2.plan.names.length : 0} more): 25 s with 0 errors${errors.length ? ' ' + errors[0] : ''}`);
  }
}
{
  // a second ship in the fleet: loses parts, and is made whole when she is rebuilt after a wreck
  restoreConfig();
  config.MAPS.FORCE_KIND = 'open'; config.ENVIRONMENTS.FORCE = 'skyisles';
  clock = seedRandom(seed);
  applyBuild(BUILDS.classic);
  const sim = createSimulation(), st = sim.state;
  const B = sim.addShip(BUILDS.classic, { id: 'ship1', formation: { dx: -250, dalt: -1150 } });
  for (let i = 0; i < 3; i++) { const id = 'b' + i; st.players[id] = { id, bot: true, ship: 'ship1', name: 'B' + i, species: 'fox', color: colors[i], x: 300 + i * 50, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true }; }
  sim.castOff();
  step(sim, secs(5));
  const r = B.sim.breakOff({ kind: 'part', name: 'Fore Engine' }, { force: true });
  step(sim, secs(5));
  report(!!r && B.layout.engines.length === 1 && B.lost.length === 1 && st.ships[0].layout.engines.length === 2 && st.ships[0].ctx.breakStats.events === 0, 'a second ship loses her engine and the first is untouched');
  B.sim.respawn({ crew: false });
  report(B.layout.engines.length === 2 && B.lost.length === 0 && JSON.stringify(B.layout.parts) === JSON.stringify(BUILDS.classic), 'a ship rebuilt after her wreck is whole again');
  step(sim, secs(5));
  report(errors.length === 0, 'and flies on (0 errors)');
  // Versus: a team ship that lost parts in a round starts the next round whole (the match fits the shelf's build and refits her: refit() forgets what broke off)
  B.team = 'blue';
  B.sim.breakOff({ kind: 'part', name: 'Aft Engine' }, { force: true });
  const lostIn = B.lost.length;
  B.layout.applyBuild(BUILDS.classic);
  B.sim.refit();
  report(lostIn === 1 && B.lost.length === 0 && B.ctx.liftDeficit === 0 && B.layout.engines.length === 2, 'a team ship that lost a part in a Versus round: the next round\'s refit forgets it');
  step(sim, secs(3));
  report(errors.length === 0, 'and she flies on');
}
{
  // a ship facing LEFT: breaking off her aft end does not make her hull jump
  const { sim, st, ours } = boot({ f: -1 });
  step(sim, secs(2));
  const helm = ours.layout.one('helm'), x0 = P.toWorldX(ours, helm.x), y0 = P.toWorldY(ours, 700);
  ours.sim.breakOff({ kind: 'part', name: 'Aft Engine' }, { force: true });
  const helm2 = ours.layout.one('helm');
  report(Math.abs(P.toWorldX(ours, helm2.x) - x0) < 3 && Math.abs(P.toWorldY(ours, 700) - y0) < 1, `a ship facing left: her helm stays where it was in the sky after her stern end broke off (${Math.abs(P.toWorldX(ours, helm2.x) - x0).toFixed(2)} px)`);
  step(sim, secs(5));
  report(errors.length === 0, 'and she flies on');
}

// ---------------------------------------------------------------- (f) a fuzz in the sim: break-offs all over, flying
{
  restoreConfig();
  const { sim, st, ours } = boot({ bots: 8, calm: false });
  const R = BO.makeRng(11);
  let events = 0;
  const T = quick ? 60 : 150;
  for (let t = 0; t < T; t++) {
    step(sim, secs(2.5));
    const L = ours.layout, b = L.bounds;
    const x = b.x0 + R() * (b.x1 - b.x0), y = b.y0 + R() * (b.y1 - b.y0);
    const spec = t % 3 === 0 ? { kind: 'blast', x, y, r: 120 + R() * 220 } : t % 3 === 1 ? { kind: 'limb', x, y, reach: 200 } : { kind: 'bag', index: 0 };
    if (ours.sim.breakOff(spec, { force: true })) events++;
    if (st.run.lost.length >= 4 || L.platforms.length <= 2) { sim.fitShip(JSON.parse(JSON.stringify(st.run.lost[0] ? st.run.lost[0].before : BUILDS.classic)), 'classic'); st.run.lost.length = 0; } // (worn down to a stub: rebuilt, so the fuzz keeps meeting whole ships too)
    if (st.phase !== 'flying' || st.ship.down) { st.ship.down = 0; st.wreck = null; st.ship.hull = Math.max(st.ship.hull, 60); }
    if (st.ship.hull < 40) st.ship.hull = 100;
    if (errors.length) break;
    if (st.vote) st.vote = null;
    if (!finiteDeep(st.ship) || !finiteDeep(st.balance)) { errors.push('NaN in the state after break-off ' + t); break; }
  }
  report(errors.length === 0 && events >= T / 4, `${events} forced break-offs in a ${T * 2.5} s flight with eight bots (blasts, limbs, bags): 0 errors, nothing NaN, ${ours.layout.platforms.length} decks and ${ours.layout.stations.length} stations left`);
}

// ---------------------------------------------------------------- (g) the bots, 3 minutes, high break-off settings
if (!quick) {
  for (const map of ['network', 'open']) {
    const r = spawnSync(process.execPath, ['tools/botsim.mjs', '--minutes', '3', '--seed', '4', '--map', map, '--breakoff', '20'], { cwd: path.resolve(publicDir, '..'), encoding: 'utf8', timeout: 280000 });
    const out = r.stdout || '';
    const line = (out.match(/breakoff: .*/) || [''])[0];
    const n = Number((line.match(/breakoff: (\d+)/) || [0, 0])[1]), rebuilt = Number((line.match(/(\d+) rebuilt/) || [0, 0])[1]);
    report(/errors: 0/.test(out) && n >= 4, `botsim ${map}, 3 min, a break-off every 20 s: ${line.slice(0, 160)}`);
    void rebuilt;
  }
  { // (and long enough to reach a sky-dock: the bots vote for the REBUILD cards)
    let out = '', line = '', rebuilt = 0, missions = 0;
    for (const seed of ['3', '2', '4']) { // (whether the bots can afford and vote for a REBUILD card in one particular run is chaos: the first seed that does it counts, every run must be error free)
      const r = spawnSync(process.execPath, ['tools/botsim.mjs', '--minutes', '7', '--seed', seed, '--map', 'network', '--breakoff', '40'], { cwd: path.resolve(publicDir, '..'), encoding: 'utf8', timeout: 400000 });
      out = r.stdout || '';
      line = (out.match(/breakoff: .*/) || [''])[0];
      rebuilt = Number((line.match(/(\d+) rebuilt/) || [0, 0])[1]);
      missions = Number((out.match(/missions completed: (\d+)/) || [0, 0])[1]);
      if (!/errors: 0/.test(out) || (missions >= 1 && rebuilt >= 1)) break;
    }
    report(/errors: 0/.test(out) && missions >= 1 && rebuilt >= 1, `botsim network, 7 min, a break-off every 40 s: ${missions} mission(s) done, the crew rebuilt at the sky-dock (${line.slice(0, 150)})`);
  }
}
report(errors.length === 0, 'no game errors in any scene' + (errors.length ? ': ' + errors.slice(0, 2).join(' || ') : ''));
console.log(ok ? 'BREAK-OFF CHECK: PASS' : 'BREAK-OFF CHECK: FAIL');
process.exit(ok ? 0 : 1);
