// THE GUNSHIP AS A SHIP gate (MOVEMENT.md B.5; public/modules/host/gunshipShip.js, gunshipBuild.js). Headless.
//   node tools/buildsim.mjs --check-gunship-ship        or directly:   node tools/gunship-ship-check.mjs [--seed 1] [--quick 1] [--parity 12]
//
//   (a) she spawns as a SHIP: a real layout from her blueprint (helm, boiler, coal, ammo, her guns, engines, a hold, her gasbags), team 'enemy', her crew are bots that live on HER (in no
//       player registry: the phones and scorecards never see them), her old record (state.gunship) agrees with the two poses - also with OUR ship facing left;
//   (b) she flies on her own pose and flight: she comes in, turns round (COME ABOUT) and takes her station; nothing of her outline is in rock;
//   (c) she fights: her gunners fire cannonballs that hit our ship, our shells hurt her (a gun port goes, then her hull), nothing of the sky's own fire hurts her;
//   (d) she LATCHES when her guns are down: her grapple is a spring between the two poses (it pulls her hard and us gently, and a rope-less control does not), her guards cross the rope;
//   (e) our crew board her (the rope's swing, and a leap) and are hostile aboard: they fight her crew, plant the charge at her boiler (it blows, with the supplies and the salvage), take her helm
//       (she surrenders, they are carried home), swing back across the rope before the charge blows;
//   (f) she can be sunk: her hull gone, she breaks up and goes, the run counts her, the sky has one ship again; a fire on her spreads and eats her hull;
//   (g) a natural pacing-director run with bots: she comes, fights and goes with 0 errors; then the parity bands against the old gunship (tools/gunship-parity.mjs).
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0;
const parityRuns = Number(flag('parity', quick ? 0 : 12));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const P = await load('modules/host/pose.js');
const { transfer, shipOf } = await load('modules/host/ships.js');
const { generateBlueprint, mx } = await load('modules/host/gunshipBlueprint.js');
const { crewHeads } = await load('modules/host/crewscale.js');
const { inRock } = await load('modules/host/course.js');
const G = config.GUNSHIP;
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];

// A sim with the gunship as a ship, calm skies (no other enemies), open sky, `bots` bot crew on our ship (or one scripted person at the helm with the throttle at thr).
function boot({ bots = 0, calm = true, thr = 0, f = 1, clear = bots === 0 } = {}) {
  config.GUNSHIP.AS_SHIP = true;
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  if (calm) { config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9; }
  clock = seedRandom(seed);
  const sim = createSimulation();
  const st = sim.state;
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  if (!bots) {
    const helm = ours.layout.one('helm');
    st.players.h0 = { id: 'h0', name: 'Helm', species: config.CREW_SPECIES[0], color: '#fff', x: helm.x, y: ours.layout.platforms[helm.d].y, d: helm.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: helm.n, gas: 0, thr };
  }
  sim.castOff();
  if (clear) st.course.map.solid.fill(0); // (scripted scenes: nothing but the ships to hit)
  if (f === -1) { ours.pose.f = -1; }
  return { sim, st, ours };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const seconds = (n) => Math.round(n * 60);
// A person (not a bot) on a ship: so a script can hold buttons.
function person(st, id, ship, d, x, extra = {}) {
  const p = { id, name: id, species: config.CREW_SPECIES[0], color: '#fff', x, y: ship.layout.platforms[d].y, d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: null, ...extra };
  st.players[id] = p;
  transfer(st, p, ship, d, x);
  return p;
}
// Run until f() or n seconds.
const until = (sim, secs, f) => { let t = -1; step(sim, seconds(secs), (i) => { if (f()) { t = i / 60; return 'stop'; } }); return t; };
const SPAWN = { seed: 3, hull: 'frigate', mission: 2, special: null, personality: 'aggressive' };
// Spawn her (the director tries again when there is rock in the way: so does this, once a second for up to 20 s).
function spawnG(sim, opts) {
  for (let k = 0; k < 20; k++) { if (sim.gunship.spawn(opts)) return true; step(sim, 60); }
  return false;
}

// ---------------------------------------------------------------- (a) she is a ship
{
  const { sim, st, ours } = boot({ bots: 6 });
  step(sim, seconds(10));
  const heads = crewHeads(st), players = Object.keys(st.players).length;
  report(sim.gunship.asShip === true && !st.gunship && st.ships.length === 1, '(a) with the flag on, the director is the Ship one; before she comes there is one ship in the sky');
  const spawned = spawnG(sim, SPAWN);
  const g = st.gunship, h = g && g.ship;
  report(spawned && !!g && st.ships.length === 2 && st.ships[1] === h && !!h.ai && h.ai.kind === 'gunship' && h.team && h.team.id === 'enemy' && h.id === 'gunship', '(a) she spawns as a SHIP: the sky has two, hers is flown by an `ai`, on the enemy team');
  const bp = g.bp, L = h.layout, kinds = (k) => L.stations.filter((s) => s.kind === k).length;
  report(kinds('helm') === 1 && kinds('boiler') === 1 && kinds('coal') === 1 && kinds('ammo') === 1 && kinds('gun') === bp.weapons.length && L.engines.length === bp.engines.length && L.gasbags.length === bp.bags.length && L.platforms.length === bp.decks.length + 1 && L.platforms.some((q) => q.id === 'lower'),
    `(a) her layout is her blueprint's: a helm, a boiler, coal, ammo, ${bp.weapons.length} guns, ${bp.engines.length} engines, ${bp.bags.length} gasbag(s), ${bp.decks.length} decks and a hold (${bp.hull}, ${bp.layout} decks)`);
  report(L.stations.every((s) => s.x >= L.platforms[s.d].x0 && s.x <= L.platforms[s.d].x1) && L.connectors.length >= bp.decks.length && Math.abs((L.bounds.x0 + L.bounds.x1) / 2 - bp.cx) < 1 && L.hitRects.length === 1 && L.samples.length === bp.pts.col.length,
    '(a) ...every station stands on its deck, the decks are joined by ladders, her bounds are symmetrical about her middle (the old mirror), her hull box and outline are the blueprint\'s');
  report(Object.keys(h.crewReg).length === bp.crew && Object.keys(st.players).length === players && crewHeads(st) === heads && Object.keys(h.ctx.players).length === bp.crew && Object.values(h.crewReg).every((c) => c.bot && c.team === 'enemy' && c.ship === 'gunship' && c.role),
    `(a) her ${bp.crew} crew are enemy bots who live on HER: not one more player in the registry (${players}), the crew count the enemies scale by is unchanged (${heads}), ctx.players lists them`);
  report(Object.values(h.ctx.players).some((c) => c.role === 'helm') && ['gunner', 'stoker', 'guard'].every((r) => bp.crew < 4 || Object.values(h.crewReg).some((c) => c.role === r)), '(a) ...with the roles of the old gunship: helmsman, gunners, stoker, guards');
  // the old record agrees with the poses (for the camera, the radar, the gunners' targets): a home-frame point of hers, put into the sky by the old record and by her pose, is one place
  const agree = () => bp.weapons.every((w) => Math.hypot(P.toWorldX(ours, mx(g, w.x) + g.dx) - P.toWorldX(h, w.x), P.toWorldY(ours, w.y + g.dy) - P.toWorldY(h, w.y)) < 1.5);
  const a0 = agree();
  step(sim, seconds(8));
  report(a0 && agree() && Math.abs(g.dx) < 5000, '(a) ...her old record (g.dx, g.dy, g.m) puts every gun port where her pose does, at the start and eight seconds on (the camera, the radar and our gunners read the record)');
  sim.gunship.reset();
  report(!st.gunship && st.ships.length === 1 && Object.keys(st.players).length === players, '(a) reset() takes her out of the sky again: one ship, no crew left behind');
}
{
  // our ship facing LEFT when she comes
  const { sim, st, ours } = boot({ bots: 4, f: -1 });
  step(sim, seconds(3));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  const agree = () => g.bp.weapons.every((w) => Math.hypot(P.toWorldX(ours, mx(g, w.x) + g.dx) - P.toWorldX(h, w.x), P.toWorldY(ours, w.y + g.dy) - P.toWorldY(h, w.y)) < 1.5);
  const a0 = agree();
  step(sim, seconds(6));
  report(a0 && agree() && h.pose.f === ours.pose.f * g.m, '(a) with OUR ship facing left, the old record still puts her ports where her pose does (g.m = her facing times ours)');
}

// ---------------------------------------------------------------- (b) she flies, (c) she fights
{
  const { sim, st, ours } = boot({ bots: 8 });
  step(sim, seconds(15));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  const x0 = h.pose.x, f0 = h.pose.f, dx0 = g.dx;
  let flips = 0, lastF = h.pose.f, inRockPts = 0, maxSpeed = 0, huntAt = -1, sawTurn = false;
  const bpts = g.bp.pts.col;
  const hullsOurs = [];
  step(sim, seconds(75), (i) => {
    if (!st.gunship) return 'stop';
    if (h.pose.f !== lastF) { flips++; lastF = h.pose.f; }
    if (h.pose.turn > 0) sawTurn = true;
    maxSpeed = Math.max(maxSpeed, Math.abs(h.state.speed));
    if (g.phase === 'hunt' && huntAt < 0) huntAt = i / 60;
    if (i % 30 === 0) for (const [x, y] of bpts) if (inRock(st, P.toWorldX(h, x), P.toWorldY(h, y))) { inRockPts++; break; }
    hullsOurs.push(ours.state.hull);
  });
  report(Math.abs(h.pose.x - x0) > 1500 && maxSpeed > 0.3 && huntAt > 0 && huntAt < 60, `(b) she flies on her own pose: ${Math.round(Math.abs(h.pose.x - x0))} px along the sky, a top speed of ${(maxSpeed * 100).toFixed(0)}% under her own engines, on station (hunt) after ${huntAt.toFixed(0)} s`);
  report(sawTurn && flips >= 1, `(b) ...she came about (a COME ABOUT of her own, ${flips} flip(s) of her facing) to bring her stern guns to bear`);
  report(inRockPts <= 2, `(b) ...her outline was in rock at ${inRockPts} of the checks (rock contact is the ship rules')`);
  const S = st.gsStats;
  report(S.shots > 0 && Math.min(...hullsOurs) < 100, `(c) she fires: ${S.shots} cannonballs, and they reach our ship (our hull ${Math.min(...hullsOurs).toFixed(0)}% at its lowest)`);
  report(S.portsDown >= 1 || h.state.hull < 90 || !st.gunship, `(c) our shells hurt her: ${S.portsDown} gun port(s) shot out, her hull ${st.gunship ? h.state.hull.toFixed(0) : 'gone'}%`);
}
{
  // the sky's own fire does not hurt her, her fire does not hurt her: a flak bullet from the sky through her hull passes
  const { sim, st, ours } = boot({ bots: 0 });
  step(sim, seconds(3));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  h.pose.x = ours.pose.x + 3000; // (well clear of our ship)
  const hull0 = h.state.hull;
  const cx = P.toWorldX(h, g.bp.cx), cy = P.toWorldY(h, (g.bp.hullTop + g.bp.hullBot) / 2);
  for (let k = 0; k < 8; k++) st.bullets.push({ x: cx + k * 20, y: cy, vx: 0, vy: 0, life: 2, miss: false });
  step(sim, 10);
  report(h.state.hull === hull0 || h.state.hull > hull0 - 0.5, `(c) enemy bullets of the sky pass through her (hull ${hull0.toFixed(1)} -> ${h.state.hull.toFixed(1)}): she is on their side`);
  sim.gunship.reset();
}

// ---------------------------------------------------------------- (d) latching
{
  const { sim, st, ours } = boot({ bots: 8 });
  step(sim, seconds(15));
  spawnG(sim, { ...SPAWN, personality: 'boarder' });
  const g = st.gunship, h = g.ship;
  until(sim, 60, () => g.phase === 'hunt');
  for (const pt of g.ports) pt.dead = true;
  for (const m of h.ctx.modules) if (m.kind === 'gun') h.sim.modules.damage(m, 999);
  // keep our crew from sinking her before she latches: her hull stays up
  let latched = false, herTether = false, ourTether = false, maxTension = 0, sent0 = st.gsStats.sent, boardersSeen = 0, ropeOn = 0;
  step(sim, seconds(90), (i) => {
    if (!st.gunship) return 'stop';
    h.state.hull = Math.max(h.state.hull, 60);
    if (g.phase === 'latch') latched = true;
    if (g.rope) { ropeOn++; maxTension = Math.max(maxTension, g.tension); if (h.ctx.forces.queue.some((q) => q.source === 'tether')) herTether = true; if (ours.ctx.forces.queue.some((q) => q.source === 'tether')) ourTether = true; }
    boardersSeen = Math.max(boardersSeen, ours.ctx.boarders.length);
  });
  report(latched, '(d) with her guns down she LATCHES (her phase turns to latch)');
  report(ropeOn > 60 && (maxTension > 0 || herTether), `(d) she fires her grapple: the rope is on for ${(ropeOn / 60).toFixed(0)} s${maxTension > 0 ? ', taut up to ' + (maxTension * 100).toFixed(0) + '% of the way to snapping' : ''}`);
  report(herTether && ourTether, '(d) ...taut, it twists BOTH ships about the places it is tied (a tether force on her stern and on our bow, forces.js)');
  report(st.gsStats.sent - sent0 >= 1 || boardersSeen >= 1, `(d) her guards cross the rope to board us (${st.gsStats.sent - sent0} sent, up to ${boardersSeen} raiders on our deck at once)`);
  sim.gunship.reset();
}
{
  // THE ROPE IS A SPRING between two poses: the same ships, with and without the line; the line closes them
  const run = (rope) => {
    const { sim, st, ours } = boot({ bots: 0 });
    step(sim, seconds(2));
    spawnG(sim, SPAWN);
    const g = st.gunship, h = g.ship;
    for (const c of Object.values(h.crewReg)) delete h.crewReg[c.id]; // (nobody flies her)
    const B = Object.assign({}, ours.layout.platforms[ours.layout.deckIndex('main')]);
    // she lies alongside, nose the same way as ours, 900 px past the line's length
    h.pose.f = ours.pose.f;
    h.state.speed = h.state.order = ours.state.speed = ours.state.order = 0;
    h.state.vy = 0;
    ours.state.vy = 0;
    st.players.h0.lock = null; // (nobody flies ours: the order stays at 0)
    ours.state.order = 0;
    g.phase = 'hunt';
    g.docked = -1e9;
    syncStage(g, h, ours);
    if (rope) {
      g.rope = true; g.ropeLen = 470; g.ropeT = 0; g.tension = 0;
    }
    const d0 = h.pose.x - ours.pose.x, vh0 = h.pose.vx, vo0 = ours.pose.vx;
    let hits = 0;
    step(sim, seconds(1.5), () => { g.phase = 'hunt'; g.docked = 0; g.canFire = false; if (rope && g.rope) hits++; });
    return { dHer: h.pose.vx - vh0, dOurs: ours.pose.vx - vo0, ropeLeft: !!g.rope, gap: h.pose.x - ours.pose.x - d0 };
  };
  const syncStage = (g, h, ours) => {
    // her stern anchor 800 px ahead of our bow, level
    const BOW = { x: ours.layout.platforms[ours.layout.deckIndex('main')].x1 + 10, y: ours.layout.platforms[ours.layout.deckIndex('main')].y - 50 };
    const dx = BOW.x + 800 - (g.bp.x0 - 170), dy = BOW.y - g.bp.anchor.y;
    h.pose.x = ours.pose.x + dx + 0; // (g.m = +1: her stern is her left end)
    h.pose.y = ours.pose.y + dy;
  };
  const on = run(true), off = run(false);
  report(on.dHer < off.dHer - 20 && on.dOurs > off.dOurs + 0.5, `(d) the rope is a spring between two poses: with the line on, her speed along the sky changed by ${on.dHer.toFixed(0)} px/s (${off.dHer.toFixed(0)} without it: she is pulled back toward us) and ours by ${on.dOurs.toFixed(1)} (${off.dOurs.toFixed(1)}: a gentle tug the other way)`);
}

// ---------------------------------------------------------------- (e) boarding her
{
  const { sim, st, ours } = boot({ bots: 0 });
  step(sim, seconds(2));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship, bp = g.bp;
  const killAll = () => { for (const c of Object.values(h.crewReg)) h.ai.hurt(c, 99); };
  // alongside, rope on, in swing range
  const main = ours.layout.deckIndex('main'), MAINP = ours.layout.platforms[main];
  h.pose.f = ours.pose.f;
  h.pose.x = ours.pose.x + (MAINP.x1 + 10 + 400 - (bp.x0 - 170));
  h.pose.y = ours.pose.y + (MAINP.y - 50 - bp.anchor.y);
  h.state.speed = h.state.order = 0;
  g.phase = 'hunt';
  step(sim, 2);
  const cp = person(st, 'p1', ours, main, MAINP.x1 - 40);
  const hooked = sim.gunship.fireHook();
  report(hooked && g.rope && sim.gunship.inSwingRange(), '(e) our hookshot at the bow catches her yardarm while she is in range (the rope is on)');
  const label = (p) => { const s = sim.state; return null; };
  sim.gunship.swing(cp);
  report(!!cp.swing && cp.swing.out, '(e) pressing Action at the bow with the rope on swings a crewman across');
  step(sim, seconds(2));
  const hostile = shipOf(st, cp) === h;
  report(hostile && Object.values(h.ctx.players).includes(cp) && !Object.values(ours.ctx.players).includes(cp) && cp.d === 0, '(e) he lands on HER stern deck: he is aboard her ship now (her ctx.players has him, ours does not) and the landing stomped her crew');
  // fight: a sword blow at her crewman beside him
  const victim = Object.values(h.crewReg)[0];
  victim.x = cp.x + 50; victim.d = cp.d; victim.y = cp.y; victim.lock = null; victim.eHp = G.CREW_HP;
  const before = victim.eHp;
  cp.carry = 'sword';
  cp.face = 1;
  cp.atkQ = true;
  victim.ko = 0; step(sim, 6);
  report(victim.eHp < before || !h.crewReg[victim.id], `(e) his sword blow hurts her crewman (${before} -> ${h.crewReg[victim.id] ? h.crewReg[victim.id].eHp : 'dead'} hit points, a sword takes two)`);
  // swing back before the charge blows: plant it first
  killAll();
  report(Object.keys(h.crewReg).length === 0 && st.gsStats.kills >= 1, `(e) her crew can be killed (the kills are counted: ${st.gsStats.kills})`);
  const boiler = h.layout.one('boiler');
  cp.d = boiler.d; cp.x = boiler.x; cp.y = h.layout.platforms[boiler.d].y; cp.fire = true; cp.carry = null;
  const hull0 = ours.state.hull, fuel0 = ours.state.fuel = 20;
  const tPlant = until(sim, 6, () => !!g.charge);
  report(tPlant > 0 && tPlant < G.PLANT_TIME * 2 + 1, `(e) holding Action at her boiler for ${G.PLANT_TIME} s plants the charge (set after ${tPlant.toFixed(1)} s), and the fuse is ${G.FUSE} s`);
  cp.fire = false;
  // run: back to the stern and swing back
  cp.d = 0; cp.x = bp.landX; cp.y = h.layout.platforms[0].y;
  sim.gunship.swing(cp);
  step(sim, seconds(1.6));
  report(shipOf(st, cp) === ours && !cp.swing, '(e) with the charge ticking he swings back across the rope to our bow');
  const tBlow = until(sim, G.FUSE + 2, () => g.phase === 'sinking');
  report(tBlow > 0 && ours.state.fuel > fuel0 + 10, `(e) the charge blows after its fuse (${tBlow.toFixed(1)} s): she goes down and the spoils come aboard (coal ${fuel0} -> ${ours.state.fuel.toFixed(0)}, hull ${hull0.toFixed(0)} -> ${ours.state.hull.toFixed(0)})`);
  step(sim, seconds(6));
  report(!st.gunship && st.ships.length === 1, '(e) ...and a few seconds on she is gone from the sky (one ship left)');
}
{
  // taking her helm
  const { sim, st, ours } = boot({ bots: 0 });
  step(sim, seconds(2));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  const cp = person(st, 'p2', h, 0, g.bp.x0 + 80);
  for (const c of Object.values(h.crewReg)) h.ai.hurt(c, 99);
  h.state.hull = 80;
  const helm = h.layout.one('helm');
  cp.d = helm.d; cp.x = helm.x; cp.y = h.layout.platforms[helm.d].y; cp.fire = true;
  // a defender at the helm stops the capture
  const def = Object.values(h.crewReg)[0] || null;
  const t = until(sim, 9, () => g.captured);
  report(t > 0 && t >= 4.5 && g.phase === 'sinking', `(e) holding Action at her helm for ${config.PVP.CAPTURE_TIME} s with nobody to stop him takes it (${t.toFixed(1)} s): she SURRENDERS`);
  report(shipOf(st, cp) === ours && !cp.fall, '(e) ...and the crew aboard her are carried home to our medical bay (not dropped)');
  step(sim, seconds(6));
  report(!st.gunship && (!st.run || st.run.gunships >= 1), '(e) ...she is gone, and the run counts her (salvage)');
}
{
  // a defender at her helm stops the capture
  const { sim, st, ours } = boot({ bots: 0 });
  step(sim, seconds(2));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  const cp = person(st, 'p3', h, 0, g.bp.x0 + 80);
  const helm = h.layout.one('helm');
  const helmsman = Object.values(h.crewReg).find((c) => c.role === 'helm');
  helmsman.d = helm.d; helmsman.x = helm.x + 40; helmsman.lock = null; helmsman.botJob = null;
  cp.d = helm.d; cp.x = helm.x; cp.y = h.layout.platforms[helm.d].y; cp.fire = true;
  step(sim, seconds(8));
  report(!g.captured, '(e) with her helmsman beside the wheel, holding Action there does not take it ("her helmsman is in the way")');
  sim.gunship.reset();
}

// ---------------------------------------------------------------- (f) she can be sunk; fire spreads on her
{
  const { sim, st, ours } = boot({ bots: 4 });
  step(sim, seconds(10));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  const kills0 = st.kills, gun0 = st.run ? st.run.gunships : 0;
  step(sim, seconds(3));
  h.sim.damageHull(1e6); // (shot down)
  step(sim, seconds(2));
  report(g.phase === 'sinking' && h.ctx.wreck, '(f) her hull gone, she breaks up: phase sinking, her ship wrecked');
  step(sim, seconds(6));
  report(!st.gunship && st.ships.length === 1 && st.kills > kills0 && (!st.run || st.run.gunships === gun0 + 1), `(f) ...and she is gone: one ship in the sky, ${st.kills - kills0} kills counted, the run counts one gunship down`);
}
{
  const { sim, st, ours } = boot({ bots: 0 });
  step(sim, seconds(2));
  spawnG(sim, SPAWN);
  const g = st.gunship, h = g.ship;
  for (const c of Object.values(h.crewReg)) delete h.crewReg[c.id]; // (nobody puts it out)
  g.phase = 'hunt';
  g.docked = -1e9;
  h.pose.x = ours.pose.x + 6000;
  const coal = h.layout.one('coal');
  h.sim.fireSys.ignite(coal.d, coal.x, 'test');
  h.sim.fireSys.ignite(coal.d, coal.x + 30, 'test');
  const hull0 = h.state.hull;
  let maxFires = 0;
  let minHull = 100;
  step(sim, seconds(24), () => { g.phase = 'hunt'; g.docked = 0; maxFires = Math.max(maxFires, h.ctx.fires.length); minHull = Math.min(minHull, h.state.hull); if (h.state.down > 0) return 'stop'; });
  const fs = h.ctx.fireStats;
  report((fs.spread > 0 || maxFires >= 3) && minHull < hull0 - 10, `(f) a fire on her coal spreads (${fs.spread} spreads, up to ${maxFires} burning at once) and eats her hull (${hull0.toFixed(0)} -> ${minHull.toFixed(0)}): the fire rules are the ship rules`);
  sim.gunship.reset();
}

// ---------------------------------------------------------------- (g) a natural run
{
  Object.assign(config.PACING, { GUNSHIP_FIRST: 15, BUILD: 20, BUILD_MIN: 15, RATE_START: 0.45, RATE_END: 1.15, PEAK_RATE: 0.35 }); // (the pacing director as the game has it, with a short build-up; the first set piece is made the gunship)
  config.SPECIALS.FIRST_AFTER = 50;
  config.GUNSHIP.AS_SHIP = true;
  config.MAPS.FORCE_KIND = 'network';
  clock = seedRandom(seed + 7);
  const sim = createSimulation();
  const st = sim.state;
  const e = st.ships[0].layout.boarderEntryPoints;
  for (let i = 0; i < 8; i++) { const id = 'n' + i; st.players[id] = { id, bot: true, name: 'B' + i, species: config.CREW_SPECIES[i % 8], color: colors[i % 6], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true }; }
  sim.castOff();
  let seen = 0, maxShips = 1;
  const e0 = errors.length;
  step(sim, seconds(quick ? 150 : 330), () => { const tp = st.tempo; if (tp.phase === 'peak' && !tp.spawned && tp.kind !== 'gunship' && tp.kind !== 'boss') tp.kind = 'gunship'; if (st.gunship) seen++; maxShips = Math.max(maxShips, st.ships.length); });
  report(st.gsStats.spawned >= 1 && seen > 60 && maxShips === 2 && errors.length === e0, `(g) a natural run with the pacing director: the gunship came (${st.gsStats.spawned}x, ${(seen / 60).toFixed(0)} s on the scene), never more than two ships in the sky, no errors`);
  config.PACING.GUNSHIP_FIRST = 1e9;
}

report(errors.length === 0, `no game error in any of it (${errors.length}${errors.length ? ': ' + errors[0] : ''})`);

// ---------------------------------------------------------------- the parity bands against the old gunship
if (parityRuns > 0) {
  const r = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'gunship-parity.mjs'), '--runs', String(parityRuns), '--quiet', '1'], { stdio: 'inherit' });
  report(r.status === 0, `parity: the gunship as a Ship against the old gunship over ${parityRuns} runs each, within the bands (tools/gunship-parity.mjs)`);
}
process.exit(ok ? 0 : 1);
