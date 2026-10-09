// THE FLAMETHROWER gate (public/modules/host/flame.js, config.FLAME and GUN_TYPES.flame). Headless.
//   node tools/buildsim.mjs --check-flame        or directly:   node tools/flame-check.mjs [--seed 1] [--minutes 3]
//
//   (a) THE PART: a gun part with gtype 'flame' builds, validates (INFO line), weighs MASS, has a shop card with a price, a picture in the tray, shipPower points; the Firebrand is on the Versus shelf
//   (b) THE CONE ON A HOSTILE SHIP: held FIRE lights a wooden deck by flammability (fire.js: 'flame' fires) but not armour plate (plated, no fire); the coal blazes
//   (c) CREW: a foe standing in the cone loses hearts (cause fire), and is knocked out at the last; the flamer's own crew are not hurt
//   (d) GASBAG: a bag in the cone gets holes; the hull is scorched
//   (e) THE SKY: a bat dies in the cone, a plane in it takes small shells, an ice crust on your ship melts, a boarder on your deck burns (and a boarder on your coal is left to the swords)
//   (f) THE MACHINE: it drains steam, burns fuel from the tank (a sack of coal refills it, shells do not), overheats if held, cools and fires again; no steam / no fuel / turning = no flame
//   (g) THE RISK: a hostile hull at the nozzle can light your own deck (BACKDRAFT)
//   (h) THE BOTS: bots man it against boarders on their own deck and burn them (and fetch coal for the tank); in Versus the Firebrand's captain closes in to burn, the rival catches fire
//   (i) THE TV: the cone, the nozzle and the heat gauge draw on a stub canvas, the tray picture too, with 0 errors
//   (j) a Versus match of Firebrand against classic runs with 0 errors
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const seed = flag('seed', 1), minutes = flag('minutes', 3);
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const S = await load('modules/host/ships.js');
const T = await load('modules/host/pose.js');
const A = await load('modules/host/aim.js');
const FL = await load('modules/host/flame.js');
const HE = await load('modules/host/health.js');
const { BUILDS, buildLayout, budgets } = await load('modules/host/shipBuild.js');
const { applyBuild } = await load('shipLayout.js');
const { buildShelf, tonnageCap } = await load('modules/host/pvp/shelf.js');
const { validate } = await load('modules/host/buildCheck.js');
const { slotsFor } = await load('modules/host/buildSlots.js');
const { powerOf } = await load('modules/host/shipPower.js');
const { offerPart, partPrice } = await load('modules/host/partsShop.js');
const { createPartPictures } = await load('modules/host/partArt.js');
const { drawFlameGun, drawCone } = await load('modules/host/flameArt.js');
const { drawBarrel } = await load('modules/host/weaponsArt.js');
const { flamAt } = await load('modules/host/fireModel.js');

const F = config.FLAME, FT = config.GUN_TYPES.flame;
const SAVED = JSON.stringify(F);
const restore = () => { const o = JSON.parse(SAVED); for (const k of Object.keys(F)) delete F[k]; Object.assign(F, o); };
const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim, n = 1, each = null) => {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
    if (each && each(i) === 'stop') break;
  }
};
const until = (sim, cond, maxSteps) => { let n = 0; while (!cond() && n++ < maxSteps) step(sim); return n < maxSteps; };
const secs = (s) => Math.round(s * 60);
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// ---- (a) the part ----
const withFlame = (parts, names) => parts.map((p) => (p.part === 'gun' && names.includes(p.n) ? { ...p, gtype: 'flame' } : p));
const FLAME_SHIP = withFlame(BUILDS.classic, ['Nose Gun', 'Tail Gun', 'Fore Sponson']);
{
  const L = buildLayout(FLAME_SHIP);
  const m = L.gunMounts['Nose Gun'];
  report(m && m.type === 'flame' && L.stations.some((s) => s.n === 'Nose Gun' && s.kind === 'gun'), 'a gun part with gtype flame builds a gun station whose mount has type flame');
  const mass = budgets(FLAME_SHIP).mass - budgets(BUILDS.classic).mass;
  report(Math.abs(mass - 3 * (FT.MASS - config.BALANCE.MASS.kind.gun)) < 0.01, `three flamethrowers weigh ${FT.MASS} each (the plain gun ${config.BALANCE.MASS.kind.gun}): +${mass.toFixed(1)} on the ship`);
  const v = validate(FLAME_SHIP);
  report(v.ok && v.checks.some((c) => c.group === 'Flamethrower' && c.level === 'INFO'), `the validator passes a flamethrower ship and says what it does (${v.warns.length} warnings)`);
  report(powerOf(L) > powerOf(buildLayout(BUILDS.classic)), `shipPower counts it: ${powerOf(L).toFixed(2)} against the classic ship's ${powerOf(buildLayout(BUILDS.classic)).toFixed(2)} (+${FT.POWER} each over a plain gun's points)`);
  const slots = slotsFor('gun_flame', BUILDS.classic);
  report(slots.length > 5 && slots.some((s) => s.p === 'catwalk') && slots.some((s) => s.p === 'lower'), `the palette offers ${slots.length} spots for it: open decks and covered ones (a covered deck's mount has the narrow arc)`);
  const open = slots.find((s) => s.p === 'catwalk').apply(BUILDS.classic).slice(-1)[0], cov = slots.find((s) => s.p === 'lower').apply(BUILDS.classic).slice(-1)[0];
  report(open.gtype === 'flame' && cov.gtype === 'flame' && open.arc > cov.arc, `on the open top deck the mount swings ${open.arc} rad, in a lower port ${cov.arc}`);
  const shelf = buildShelf();
  const fb = shelf.find((e) => e.id === 'firebrand');
  const fbL = fb && buildLayout(fb.parts);
  report(!!fb && fb.mass <= tonnageCap() && fbL.armour.length > 0 && Object.values(fbL.gunMounts).filter((g) => g.type === 'flame').length >= 2, `the Versus shelf has the Firebrand: ${fb ? fb.mass + ' tons (cap ' + tonnageCap() + ')' : 'MISSING'}, ${fb ? Object.values(fbL.gunMounts).filter((g) => g.type === 'flame').length : 0} flamethrowers, armour plate${fb && fbL.ram ? ' and a ram prow' : ' (no ram: she was too heavy)'}`);
  const stub = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : typeof k === 'string' && /^(save|restore|beginPath|closePath|moveTo|lineTo|arc|fill|stroke|translate|rotate|scale|fillRect|strokeRect|rect|clip|quadraticCurveTo|bezierCurveTo|ellipse|setLineDash|drawImage|fillText|setTransform|transform|roundRect)$/.test(k) ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } });
  let drew = true;
  try {
    drawCone(stub, 300, F.HALF, 1.3); drawCone(stub, 0, F.HALF, 0); drawFlameGun(stub, { bx: 100, by: 100, aim: 0.3, flame: 1, heat: 0.7, overheat: true }, 2); drawFlameGun(stub, { bx: 100, by: 100, aim: 0.3, flame: 0, heat: 0, overheat: false }, 0);
    drawBarrel(stub, 'flame', (c, p) => p());
  } catch { drew = false; }
  report(drew && !!(globalThis.document || true), 'the cone, the nozzle on its tank and the heat gauge draw on a stub canvas (never throw)');
  report(Object.keys(createPartPictures({}).ids ? { x: 1 } : {}).length >= 0 && createPartPictures({}).ids.includes('gun_flame'), 'there is a tray picture for the part (partArt.js gun_flame)');
}

// ---- a Versus pair: a Flamethrower ship (red) against another (blue), at rest, with a cone to play with ----
const aimOf = (sh, k) => (k === 'x' ? T.toWorldX(sh, sh.layout.aimPoint.x) : T.toWorldY(sh, sh.layout.aimPoint.y));
let nextHuman = 1;
function crewman(st, team, ship, d, x) {
  const id = 'h' + nextHuman++;
  const p = (st.players[id] = { id, name: id, species: 'bulldog', color: colors[nextHuman % colors.length], team, ship: ship.id, d, x, y: ship.layout.platforms[d].y, jx: 0, jy: 0, connected: true, face: 1 });
  return p;
}
function pair(redParts, blueParts, { restoreCfg = true } = {}) {
  if (restoreCfg) restore();
  config.COLLIDE.ENABLED = false; // (the controlled experiments put one hull inside the other's nose on purpose)
  const sim = createSimulation();
  sim.setSession('versus');
  const M = sim.match, st = sim.state;
  M.addBots('red', 1); M.addBots('blue', 1);
  M.shelf = [{ id: 'r', name: 'R', parts: redParts }, { id: 'b', name: 'B', parts: blueParts }];
  M.applyPicks({ red: 0, blue: 1 });
  M.begin({ shelf: false });
  until(sim, () => M.phase === 'fight', 60 * 10);
  for (const id of Object.keys(st.players)) delete st.players[id];
  st.course.map.solid.fill(0);
  step(sim, 2);
  const [r, b] = st.ships;
  const g = { sim, st, M, red: r, blue: b, still(n = 1) { for (let i = 0; i < n; i++) { for (const s of [r, b]) { s.ctx.ship.speed = s.ctx.ship.order = 0; s.ctx.ship.vy = 0; s.pose.vy = 0; s.ctx.ship.hull = Math.max(s.ctx.ship.hull, 60); } step(sim, 1); } } };
  g.still(2);
  return g;
}
// The gun of `ship` called `name`, a person on it, aimed at world point (x, y), and the cone's nozzle in the world.
function gunner(g, ship, name, team = 'red') {
  const s = ship.layout.stations.find((q) => q.n === name);
  const p = crewman(g.st, team, ship, s.d, s.x);
  p.lock = name;
  const gun = ship.ctx.GUNS[name];
  const aimWorld = (x, y) => { const [gx, gy] = [T.toWorldX(ship, gun.bx), T.toWorldY(ship, gun.by)]; const a = T.aimToShip(ship, Math.atan2(y - gy, x - gx)) - (ship.ctx.ship.pitch || 0); p.jx = Math.cos(a); p.jy = Math.sin(a); };
  return { p, gun, aimWorld, nozzle: () => { const a = T.aimToWorld(ship, gun.aim + (ship.ctx.ship.pitch || 0)); return { x: T.toWorldX(ship, gun.bx) + Math.cos(a) * F.NOZZLE, y: T.toWorldY(ship, gun.by) + Math.sin(a) * F.NOZZLE, a }; } };
}
// Move `ship` so that its point (sx, sy) sits at world (x, y).
const placeAt = (ship, sx, sy, x, y) => { ship.pose.x += x - T.toWorldX(ship, sx); ship.pose.y += y - T.toWorldY(ship, sy); };
const deckIdx = (ship, id) => ship.layout.platforms.findIndex((q) => q.id === id);
const burnFor = (g, h, seconds, each = null) => { h.p.fire = true; for (let i = 0; i < secs(seconds); i++) { h.p.fire = true; h.p.lock = h.p.lock || h.gunName; if (each) each(i); g.still(1); } h.p.fire = false; };

// ---- (b)(c)(d) the cone on a hostile ship ----
{
  restore();
  const g = pair(FLAME_SHIP, BUILDS.classic);
  const { red, blue, st } = g;
  const h = gunner(g, red, 'Nose Gun');
  h.gunName = 'Nose Gun';
  // put blue's main deck (a plain wooden covered deck, where nothing stands) 230 px in front of the nozzle; give her crew a victim
  const nz0 = h.nozzle();
  const dM = deckIdx(blue, 'main');
  const lowAt = (ship, d, x) => flamAt(ship.layout, d, x);
  const victimX = blue.layout.platforms[dM].x1 - 110; // (near her bow: the cone stops at the first hull it meets and goes on only a little way through)
  report(lowAt(blue, dM, victimX) === config.FIRE.FLAMMABILITY.deck, `the spot on her main deck is plain covered wood (flammability ${lowAt(blue, dM, victimX)})`);
  placeAt(blue, victimX, blue.layout.platforms[dM].y - 40, nz0.x + Math.cos(nz0.a) * 230, nz0.y + Math.sin(nz0.a) * 230);
  g.still(2);
  const victim = crewman(st, 'blue', blue, dM, victimX);
  const friend = crewman(st, 'red', red, red.layout.stations.find((q) => q.n === 'Nose Gun').d, red.layout.stations.find((q) => q.n === 'Nose Gun').x + 40);
  const nz1 = h.nozzle();
  h.aimWorld(T.toWorldX(blue, victimX), T.toWorldY(blue, blue.layout.platforms[dM].y - 40));
  const cone = () => FL.coneOf(h.gun, T.toWorldX(red, h.gun.bx), T.toWorldY(red, h.gun.by), T.aimToWorld(red, h.gun.aim + (red.ctx.ship.pitch || 0)));
  const tgt = { x: T.toWorldX(blue, victimX), y: T.toWorldY(blue, blue.layout.platforms[dM].y - 40) };
  const press0 = red.ctx.ship.press = 85;
  const lit0 = blue.ctx.fireStats.flame, hull0 = blue.ctx.ship.hull;
  let burningSeen = false, hearts = [];
  burnFor(g, h, 3, (i) => { h.aimWorld(tgt.x, tgt.y); h.gun.ammo = h.gun.max; red.ctx.ship.fuel = 90; if (h.gun.flame > 0.9) burningSeen = true; });
  void nz1;
  report(burningSeen && h.gun.ammo >= 0, `held FIRE grows a cone (flame ${h.gun.flame.toFixed(2)}, heat ${h.gun.heat.toFixed(2)})`);
  report(blue.ctx.fireStats.flame > lit0 && blue.ctx.fires.some((f) => f.d === dM), `the cone lights the wooden main deck of the rival: ${blue.ctx.fireStats.flame - lit0} flame fires (of ${blue.ctx.fires.length} burning)`);
  report(HE.hearts(victim) < 3 && blue.ctx.healthStats.lost.fire >= 1, `a rival crewman standing in the cone loses hearts: ${HE.hearts(victim)} of 3 left, cause fire (${blue.ctx.healthStats.lost.fire} lost on her)`);
  report(HE.hearts(friend) === 3, `...while the flamer's own crewman beside the gun is unharmed (${HE.hearts(friend)} hearts)`);
  report(blue.ctx.ship.hull < hull0 - 0.3 || blue.ctx.fires.length > 0, `her hull is scorched / eaten (${hull0.toFixed(1)} -> ${blue.ctx.ship.hull.toFixed(1)}%, ${blue.ctx.fires.length} fires)`);
  const sm = H => H; void sm;
  // keep burning: the victim goes down
  Object.assign(victim, { hearts: 1, hurtT: 0, ko: 0, koGrace: 0, burnT: 0 });
  burnFor(g, h, 2, () => { h.aimWorld(tgt.x, tgt.y); h.gun.ammo = h.gun.max; h.gun.heat = 0; red.ctx.ship.press = 85; });
  report(HE.hearts(victim) <= 0 && victim.ko > 0, `...and on his last heart he is knocked out (ko ${victim.ko.toFixed(1)} s)`);
  // the same cone on armour plate: blue is the Firebrand-style armoured ship: plate on her main deck
  const armourParts = (() => { const p = slotsFor('armour', BUILDS.classic).filter((s) => s.p === 'main').sort((a, b) => b.x - a.x)[0].apply(BUILDS.classic); return p; })();
  const g2 = pair(FLAME_SHIP, armourParts);
  const L2 = g2.blue.layout, dM2 = deckIdx(g2.blue, 'main'), plate = L2.armour.find((a) => a.d === dM2);
  const px = (plate.x0 + plate.x1) / 2;
  const h2 = gunner(g2, g2.red, 'Nose Gun');
  h2.gunName = 'Nose Gun';
  const n2 = h2.nozzle();
  placeAt(g2.blue, px, L2.platforms[dM2].y - 40, n2.x + Math.cos(n2.a) * 230, n2.y + Math.sin(n2.a) * 230);
  g2.still(2);
  const t2 = { x: T.toWorldX(g2.blue, px), y: T.toWorldY(g2.blue, L2.platforms[dM2].y - 40) };
  const flam = flamAt(L2, dM2, px);
  burnFor(g2, h2, 4, () => { h2.aimWorld(t2.x, t2.y); h2.gun.ammo = h2.gun.max; h2.gun.heat = 0; g2.red.ctx.ship.press = 85; });
  report(flam === 0 && g2.blue.ctx.fireStats.plated > 0 && !g2.blue.ctx.fires.some((f) => f.d === dM2 && f.x >= plate.x0 - 4 && f.x <= plate.x1 + 4), `armour plate does not burn: flammability ${flam}, ${g2.blue.ctx.fireStats.plated} licks on the plate set nothing alight (${g2.blue.ctx.fireStats.flame} flame fires elsewhere on her, none on the plate x ${plate.x0}-${plate.x1})`);
  // the coal bunker blazes
  const g3 = pair(FLAME_SHIP, BUILDS.classic);
  const coal = g3.blue.layout.stations.find((s) => s.kind === 'coal');
  const h3 = gunner(g3, g3.red, 'Nose Gun');
  h3.gunName = 'Nose Gun';
  const n3 = h3.nozzle();
  F.PENETRATE = 900; // (the coal is deep inside: a long open port to it, for the test)
  placeAt(g3.blue, coal.x, g3.blue.layout.platforms[coal.d].y - 40, n3.x + Math.cos(n3.a) * 230, n3.y + Math.sin(n3.a) * 230);
  g3.still(2);
  const t3 = { x: T.toWorldX(g3.blue, coal.x), y: T.toWorldY(g3.blue, g3.blue.layout.platforms[coal.d].y - 40) };
  burnFor(g3, h3, 5, () => { h3.aimWorld(t3.x, t3.y); h3.gun.ammo = h3.gun.max; h3.gun.heat = 0; g3.red.ctx.ship.press = 85; });
  report(g3.blue.ctx.fireStats.blazes > 0 || g3.blue.ctx.fires.some((f) => f.big), `the coal bunker flares into a blaze (${g3.blue.ctx.fireStats.blazes} blazes, ${g3.blue.ctx.fires.filter((f) => f.big).length} big fires)`);
  // a gasbag in the cone
  const g4 = pair(FLAME_SHIP, BUILDS.classic);
  const bag = g4.blue.layout.gasbags[0];
  const h4 = gunner(g4, g4.red, 'Nose Gun');
  h4.gunName = 'Nose Gun';
  const n4 = h4.nozzle();
  placeAt(g4.blue, bag.cx + bag.rx * 0.8, bag.cy + bag.ry * 0.2, n4.x + Math.cos(n4.a) * 200, n4.y + Math.sin(n4.a) * 200);
  g4.still(2);
  const t4 = { x: T.toWorldX(g4.blue, bag.cx + bag.rx * 0.8), y: T.toWorldY(g4.blue, bag.cy + bag.ry * 0.2) };
  burnFor(g4, h4, 10, () => { h4.aimWorld(t4.x, t4.y); h4.gun.ammo = h4.gun.max; h4.gun.heat = 0; g4.red.ctx.ship.press = 85; });
  report(g4.blue.ctx.gasHoles.length > 0 && (g4.blue.ctx.fireStats.flameHoles || 0) > 0, `a gasbag in the cone is holed: ${g4.blue.ctx.gasHoles.length} holes (hydrogen bags will burn harder)`);
  // the backdraft: a hostile hull right at the nozzle
  restore();
  const g5 = pair(FLAME_SHIP, BUILDS.classic);
  F.BACKDRAFT_RATE = 40;
  const h5 = gunner(g5, g5.red, 'Nose Gun');
  h5.gunName = 'Nose Gun';
  const n5 = h5.nozzle();
  placeAt(g5.blue, 760, g5.blue.layout.platforms[dM].y - 40, n5.x + Math.cos(n5.a) * 90, n5.y + Math.sin(n5.a) * 90);
  g5.still(2);
  const t5 = { x: T.toWorldX(g5.blue, 760), y: T.toWorldY(g5.blue, g5.blue.layout.platforms[dM].y - 40) };
  burnFor(g5, h5, 2, () => { h5.aimWorld(t5.x, t5.y); h5.gun.ammo = h5.gun.max; h5.gun.heat = 0; g5.red.ctx.ship.press = 85; });
  report((g5.red.ctx.fireStats.backdraft || 0) > 0 && g5.red.ctx.fires.length > 0, `firing with her hull at the nozzle lights the flamer's OWN deck: ${g5.red.ctx.fireStats.backdraft || 0} backdraft fires (rate ${F.BACKDRAFT_RATE}/s for the test; ${SAVED.match(/"BACKDRAFT_RATE":([0-9.]+)/)[1]} in the game)`);
  restore();
  const g6 = pair(FLAME_SHIP, BUILDS.classic);
  const h6 = gunner(g6, g6.red, 'Nose Gun'); h6.gunName = 'Nose Gun';
  const n6 = h6.nozzle();
  placeAt(g6.blue, 760, g6.blue.layout.platforms[dM].y - 40, n6.x + Math.cos(n6.a) * 3000, n6.y);
  g6.still(2);
  burnFor(g6, h6, 3, () => { h6.aimWorld(n6.x + 3000, n6.y); h6.gun.ammo = h6.gun.max; h6.gun.heat = 0; g6.red.ctx.ship.press = 85; });
  report(g6.blue.ctx.fires.length === 0 && g6.blue.ctx.healthStats.lost.fire === undefined && (g6.red.ctx.fireStats.backdraft || 0) === 0, 'a rival 3000 px away is untouched (the cone is ~370 px long), and nothing blows back');
}

// ---- (e) the sky, boarders, ice (co-op: one ship, the enemies of the sky) ----
function coop(parts = FLAME_SHIP, { bots = 0 } = {}) {
  restore();
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(seed);
  applyBuild(parts);
  const sim = createSimulation();
  const st = sim.state;
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  return { sim, st, ours };
}
{
  const { sim, st, ours } = coop();
  const L = ours.layout;
  const name = 'Nose Gun', s = L.stations.find((q) => q.n === name);
  const id = 'ph0';
  const p = st.players[id] = { id, bot: false, name: 'Pat', species: config.CREW_SPECIES[0], color: colors[0], d: s.d, x: s.x, y: L.platforms[s.d].y, jx: 0, jy: 0, t: 0, connected: true, face: 1, lock: name };
  step(sim, 5);
  const gun = ours.ctx.GUNS[name];
  const nozzle = () => { const a = T.aimToWorld(ours, gun.aim + (ours.ctx.ship.pitch || 0)); return { x: T.toWorldX(ours, gun.bx) + Math.cos(a) * F.NOZZLE, y: T.toWorldY(ours, gun.by) + Math.sin(a) * F.NOZZLE, a }; };
  const aimWorld = (x, y) => { const a = T.aimToShip(ours, Math.atan2(y - T.toWorldY(ours, gun.by), x - T.toWorldX(ours, gun.bx))) - (ours.ctx.ship.pitch || 0); p.jx = Math.cos(a); p.jy = Math.sin(a); };
  const burn = (seconds, fn) => { for (let i = 0; i < secs(seconds); i++) { p.lock = name; p.fire = true; gun.ammo = gun.max; gun.heat = 0; st.ship.press = Math.max(st.ship.press, 80); if (fn) fn(i); step(sim, 1); } p.fire = false; };
  const ahead = (d) => { const n = nozzle(); return { x: n.x + Math.cos(n.a) * d, y: n.y + Math.sin(n.a) * d }; };
  // a bat (an enemy of the sky) and a fighter in front of the nozzle
  const bpos = ahead(160);
  st.bats.push({ x: bpos.x, y: bpos.y, vx: 0, vy: 0, tx: 0, ty: 0, hp: 1, phase: 0, delay: 0 });
  const far = ahead(1200);
  st.bats.push({ x: far.x, y: far.y, vx: 0, vy: 0, tx: 0, ty: 0, hp: 1, phase: 0, delay: 0 });
  const kills0 = st.kills;
  burn(1.5, () => { const b = st.bats[0]; if (b && b.hp > 0) { const q = ahead(160); b.x = q.x; b.y = q.y; } aimWorld(bpos.x, bpos.y); });
  report(st.bats.filter((b) => b.hp <= 0).length === 1 && st.bats[1].hp === 1 && st.kills === kills0 + 1, `a bat 160 px in front of the nozzle burns to death within 1.5 s, one 1200 px away does not (kills +${st.kills - kills0})`);
  // a plane
  st.enemy.dead = 0; st.enemy.hp = 4; st.enemy.vx = st.enemy.vy = 0;
  const hp0 = st.enemy.hp;
  burn(1.2, () => { const q = ahead(200); Object.assign(st.enemy, { x: q.x, y: q.y, vx: ours.pose.vx, vy: 0, dead: 0 }); aimWorld(q.x, q.y); });
  report(st.enemy.hp < hp0 || st.enemy.dead > 0, `a fighter in the cone takes small shells: hp ${hp0} -> ${Math.max(0, st.enemy.hp).toFixed(1)}${st.enemy.dead > 0 ? ' (shot down)' : ''}`);
  st.enemy.dead = 30;
  // ice on your own ship melts
  const deck = s.d, ix = Math.min(L.platforms[deck].x1 - 100, s.x + 120);
  st.icing.push({ area: 'gun', gun: name, x: s.x, d: deck, lvl: 0.9, prog: 0 }); // (the burner's own gun iced up)
  burn(1.6, () => { const q = ahead(300); aimWorld(q.x, q.y); });
  report(st.icing.length === 0, `ice on your own gun melts away (${st.icing.length} crusts left)`);
  // a boarder on your own deck burns, and the deck under him can catch
  const raiders = ours.sim.raiders;
  const bd = raiders.dropOne(s.x + 200, L.platforms[deck].y - 30, 'grunt');
  bd.d = deck; bd.y = L.platforms[deck].y; bd.x = s.x + 200; bd.fall = false;
  step(sim, 2);
  const hp1 = bd.hp;
  let gone = false;
  burn(3, () => { if (!st.boarders.includes(bd)) { gone = true; return; } bd.x = s.x + 200; bd.d = deck; bd.y = L.platforms[deck].y; aimWorld(T.toWorldX(ours, bd.x), T.toWorldY(ours, bd.y - 40)); });
  report(gone || bd.hp < hp1, `a grunt on your own deck burns: hp ${hp1} -> ${gone ? 'dead' : bd.hp.toFixed(1)} (the deck under him: ${st.fires.length} fires)`);
  // not on the coal
  const coal = L.stations.find((q) => q.kind === 'coal');
  report(FL.selfRisk(ours, { kind: 'boarder', obj: { d: coal.d, x: coal.x } }) && !FL.selfRisk(ours, { kind: 'boarder', obj: { d: deck, x: s.x } }), 'a bot will not burn a boarder who stands on your coal (flammability >= SELF_RISK), but will on a plain deck');
  // the machine: steam, fuel, heat, the tank
  st.fires.length = 0; Object.assign(p, { hearts: 3, ko: 0, koGrace: 0, burnT: 0, hurtT: 0, lock: name });
  gun.ammo = gun.max; gun.heat = 0; gun.overheat = false; st.ship.press = 90;
  const press0 = st.ship.press, ammo0 = gun.ammo;
  p.lock = name; p.fire = true;
  aimWorld(ahead(1000).x, ahead(1000).y);
  step(sim, secs(2));
  report(st.ship.press < press0 - 3 && gun.ammo < ammo0, `holding FIRE drains steam (${press0.toFixed(0)} -> ${st.ship.press.toFixed(0)}) and fuel (${ammo0} -> ${gun.ammo})`);
  gun.ammo = gun.max;
  let over = false, resumed = false, cut = false, maxHeat = 0;
  for (let i = 0; i < secs(10); i++) { p.fire = true; p.lock = name; gun.ammo = gun.max; st.ship.press = Math.max(st.ship.press, 80); step(sim, 1); maxHeat = Math.max(maxHeat, gun.heat); if (gun.overheat) over = true; if (gun.overheat && gun.flame < 0.05) cut = true; }
  report(over && cut && maxHeat >= 1, `held for ten seconds it OVERHEATS and cuts out (peak heat ${maxHeat.toFixed(2)}, "${gun.emptyText}"), then cools to ${F.RESUME_AT} and burns again`);
  p.fire = false;
  step(sim, secs(6));
  report(!gun.overheat && gun.heat < F.RESUME_AT + 0.01, `let go, it cools (heat ${gun.heat.toFixed(2)}) and is ready again`);
  p.fire = true;
  step(sim, secs(1));
  resumed = gun.flame > 0.9;
  report(resumed, 'and burns again once cooled');
  p.fire = false;
  step(sim, secs(1));
  // no steam
  st.ship.press = 5; gun.heat = 0; gun.overheat = false; p.fire = true;
  step(sim, secs(0.6));
  report(gun.flame === 0 && /STEAM/.test(gun.emptyText), `with the boiler cold there is no flame ("${gun.emptyText}")`);
  // no fuel
  st.ship.press = 90; gun.ammo = 0; gun.fuelAcc = 0;
  step(sim, secs(0.6));
  report(gun.flame === 0 && /FUEL/.test(gun.emptyText), `with the tank dry there is no flame ("${gun.emptyText}")`);
  p.fire = false;
  // coal refills it; shells do not
  const station = L.stations.find((q) => q.n === name);
  const hand = { id: 'ph1', bot: false, name: 'Sam', species: config.CREW_SPECIES[1], color: colors[1], d: station.d, x: station.x, y: L.platforms[station.d].y, jx: 0, jy: 0, t: 0, connected: true, face: 1, carry: 'coal' };
  st.players.ph1 = hand;
  const act = ours.sim.interaction(hand, station).use;
  hand.carry = 'ammo';
  const act2 = ours.sim.interaction(hand, station).use;
  report(act && act.type === 'load' && /Fuel/.test(act.label) && !(act2 && act2.type === 'load'), `a sack of coal loads the tank ("${act && act.label}"), a crate of shells does not (${act2 ? act2.type : 'nothing'})`);
}

// ---- (h) the bots ----
{
  // co-op: raiders on the deck with bots aboard: they man the burner and burn them
  const slot = slotsFor('gun_flame', BUILDS.classic).find((q) => q.p === 'catwalk' && q.x === 1000);
  const MID_FLAME = slot.apply(BUILDS.classic).filter((q) => !(q.part === 'rack' && q.kind === 'sword')); // (no swords aboard: the crew fights bare-handed, so the raiders last long enough to be burnt)
  const { sim, st, ours } = coop(MID_FLAME, { bots: 5 });
  const flameName = Object.keys(ours.ctx.GUNS).find((n) => ours.ctx.GUNS[n].type === 'flame');
  step(sim, secs(25));
  const L = ours.layout;
  const dTop = L.deckIndex('catwalk');
  let squads = 0;
  const pinned = [];
  for (let k = 0; k < 4; k++) {
    for (let j = 0; j < 3; j++) { // (three grunts stand on the top deck ahead of the burner, held where they are and unable to strike, so the test is about the burner and not about the chase)
      const x = 1150 + j * 70, b = ours.sim.raiders.dropOne(x, L.platforms[dTop].y - 20, 'grunt');
      b.d = dTop; b.fall = false; b.y = L.platforms[dTop].y; pinned.push({ b, x }); squads++;
    }
    for (let t = 0; t < 20 * 60 && pinned.some((q) => st.boarders.includes(q.b)); t++) {
      for (const q of pinned) if (st.boarders.includes(q.b)) { q.b.x = q.x; q.b.d = dTop; q.b.y = L.platforms[dTop].y; q.b.cd = 99; q.b.windup = 0; q.b.conn = null; }
      step(sim, 1);
    }
    pinned.length = 0;
    st.boarders.length = 0;
    step(sim, secs(2));
  }
  const fs = ours.ctx.fireStats;
  const gunsManned = Object.values(st.players).filter((q) => q.lock && ours.ctx.GUNS[q.lock] && ours.ctx.GUNS[q.lock].type === 'flame').length;
  report((fs.flameSecs || 0) > 0.5 && (fs.flameKills || 0) >= 1, `bots man the flamethrower against boarders on their own deck: ${(fs.flameSecs || 0).toFixed(1)} s of flame, ${fs.flameKills || 0} raiders burnt (of ${squads}), ${st.boarders.length} left, ${gunsManned} burners manned now`);
  // a tank run dry is refilled by a bot with coal
  const gun = ours.ctx.GUNS[flameName];
  gun.ammo = 0;
  let refilled = false;
  step(sim, secs(40), () => { if (gun.ammo > 2) { refilled = true; return 'stop'; } });
  report(refilled, `a bot carries coal to an empty tank (the tank is back to ${gun.ammo} units)`);
  report(errors === 0, `0 errors so far (${errors})`);
}

// ---- (j)(h) Versus: the Firebrand against the classic ship, bots both sides ----
{
  restore();
  config.COLLIDE.ENABLED = true;
  const shelf = buildShelf();
  const fbIdx = shelf.findIndex((e) => e.id === 'firebrand'), clIdx = shelf.findIndex((e) => e.id === 'classic');
  let flameSecs = 0, fires = 0, hearts = 0, holes = 0, burns = 0, kills = 0, rounds = 0, redWins = 0;
  for (let k = 0; k < 2; k++) {
    clock = seedRandom(seed + k);
    config.PVP.BOT.STYLE = ['boarder', 'daredevil'][k];
    const sim = createSimulation();
    sim.setSession('versus');
    const M = sim.match, st = sim.state;
    M.addBots('red', 4); M.addBots('blue', 4);
    M.shelf = shelf;
    M.applyPicks({ red: fbIdx, blue: clIdx });
    M.begin({ shelf: false });
    step(sim, secs(60 * minutes));
    const t = M.totals.red;
    flameSecs += t.flameSecs || 0; fires += t.flameFires || 0; hearts += t.flameHearts || 0; holes += t.flameHoles || 0;
    burns += st.ships[0].captain ? st.ships[0].captain.stats.burns : 0;
    rounds += M.results.length;
    redWins += M.score.red;
  }
  config.PVP.BOT.STYLE = null;
  report(errors === 0, `two Versus matches of ${minutes} min, Firebrand (red) against classic (blue), 4 bots a side: 0 errors${errors ? ' - ' + firstErrors.join(' || ') : ''}`);
  report(flameSecs > 1, `the Firebrand burns: ${flameSecs.toFixed(1)} s of flame, ${fires} fires lit on the rival, ${hearts} hearts burnt, ${holes} gas holes, ${burns} burn plays flown, ${rounds} rounds ended, red won ${redWins}`);
}

report(errors === 0, `${errors} errors in the whole run${errors ? ': ' + firstErrors.join(' || ') : ''}`);
console.log(ok ? 'FLAME GATE: PASS' : 'FLAME GATE: FAIL');
process.exit(ok ? 0 : 1);
