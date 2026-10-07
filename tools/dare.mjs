// Scratch test for hijack + daring bots, headless (same recipe as botsim.mjs).
//   node tools/dare.mjs [seed]
// Part A: a bot is made daring while dogfighters are about: it must take a hookshot, hook a plane, kick the pilot out,
//         fly her and bail out over the ship, landing aboard (stunt ends with the bot on a deck, not KO).
// Part B: a human (airborne, no phone) touches the BIG fighter (state.enemy): the AI must let go of her, she must not
//         count as a live enemy, she can be kicked and flown, and after bail-out the enemy respawns normally.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const seed = Number(process.argv[2] || 7);
globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
let s0 = seed >>> 0;
Math.random = () => {
  s0 = (s0 + 0x6d2b79f5) | 0;
  let t = Math.imul(s0 ^ (s0 >>> 15), 1 | s0);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
Date.now = () => 1700000000000 + seed;
let simClock = 0;
performance.now = () => simClock;

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
const { SHIP_LAYOUT } = await load('shipLayout.js');
const { targets } = await load('modules/host/aim.js');
config.MAPS.FORCE_KIND = 'open';
const { createSimulation } = await load('modules/host/simulation.js');

const dt = 1 / 60;
let fails = 0;
const check = (ok, msg) => {
  console.log((ok ? 'PASS ' : 'FAIL ') + msg);
  if (!ok) fails++;
};
const errs = [];
function mk(nBots, withHuman) {
  const sim = createSimulation();
  const state = sim.state;
  const e = SHIP_LAYOUT.boarderEntryPoints;
  for (let i = 0; i < nBots; i++) {
    const id = 'bot' + i;
    state.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[0], color: '#3a86ff', x: e[0].x + i * 40, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  if (withHuman) state.players.human = { id: 'human', name: 'Human', species: config.CREW_SPECIES[0], color: '#e63946', x: e[0].x + 300, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  sim.castOff();
  sim0 = sim;
  return sim;
}
const nearShip = (e) => e.dead <= 0 && e.heading != null && Math.abs(e.x - 800) < 1200 && e.y + (sim0.state.ship.alt) > -100 && e.y + (sim0.state.ship.alt) < 900;
let sim0 = null;
const placeNear = (e) => {
  e.x = 1950; // just past the bow, outside the hull
  e.y = 300 - sim0.state.ship.alt;
  e.heading = 0;
  e.air = 560;
};
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) {
    simClock += dt * 1000;
    try { sim.update(dt); } catch (err) { errs.push(String(err.stack).split('\n').slice(0, 3).join(' | ')); }
  }
};

// ---------------- Part A: a bot hijacks a dogfighter and comes home ----------------
{
  const sim = mk(8, false);
  const st = sim.state;
  step(sim, 60 * 12);
  let stolen = 0;
  let forced = 0;
  let ko = 0;
  let maxFly = 0;
  const pl = () => Object.values(st.players);
  const startT = simClock;
  let lastForce = -1e9;
  let lastSpawn = -1e9;
  let wasHj = false;
  // (keep forcing stunts until one steals a plane; a plane can be shot down or leave before the hook gets it)
  for (let i = 0; i < 60 * 60 * 10 && forced < 8 && !((st.stuntLog || []).some((e) => /-> fly$/.test(e.text)) && !pl().some((p) => p.dare)); i++) {
    step(sim);
    const busy = pl().some((p) => p.dare);
    // (the crew's guns are quiet while the stunt waits for a plane: otherwise they shoot every plane down before it gets close)
    if (pl().some((p) => p.dare && ['aim', 'hooked', 'kick'].includes(p.dare.phase))) for (const g of Object.values(st.GUNS)) g.ammo = 0;
    else if (busy) for (const g of Object.values(st.GUNS)) g.ammo = g.max;
    if (!st.strafers.length && simClock - lastSpawn > 5000 && (!busy || pl().some((p) => p.dare && p.dare.phase === 'aim'))) {
      sim.squadrons.spawnStrafers();
      lastSpawn = simClock;
    }
    if (!busy && st.strafers.length && simClock - lastForce > 15000) {
      // Make an idle bot daring (the same thing maybeDare does, without the dice).
      const bot = pl().find((p) => !p.lock && !p.fall && !(p.ko > 0) && !p.carry && !p.onGunship);
      if (bot) {
        bot.dare = { kind: 'plane', phase: 'get', t: 0, pt: 0, tries: 0, aimCd: 0 };
        bot.daring = true;
        forced++;
        lastForce = simClock;
        console.log(`  forced plane stunt on ${bot.name} at ${((simClock - startT) / 1000).toFixed(0)}s`);
      }
    }
    for (const p of pl()) {
      if (p.hj && !wasHj) { /* boarded */ }
      if (p.dare && p.ko > 0) ko++;
    }
    wasHj = pl().some((p) => p.hj);
    if (process.env.DBG2) {
      const b = pl().find((p) => p.dare && ['hooked', 'land', 'kick'].includes(p.dare.phase));
      if (b) console.log(`   f${i} ${b.name} ${b.dare.phase} fly ${b.fly} hook ${b.hook ? b.hook.phase + ' len' + b.hook.len.toFixed(0) : '-'} fire ${b.fire} pos ${b.x.toFixed(0)},${b.y.toFixed(0)} v ${(b.fvx || 0).toFixed(0)},${(b.fvy || 0).toFixed(0)} planes ${st.strafers.map((s) => s.x.toFixed(0) + ',' + (s.y + st.ship.alt).toFixed(0) + ' hp' + s.hp).join(' | ')} ko ${b.ko}`);
    }
    // The dogfighters here circle far below the hull, behind the decks: bring one past the end of the top deck, where a hook can reach it.
    {
      const b = pl().find((p) => p.dare && p.dare.kind === 'plane' && p.dare.phase === 'aim' && p.d === 1 && (p.x > 1250 || p.x < 330) && !p.fly);
      if (b && st.strafers.length && !st.strafers.some((s) => Math.abs(s.x - b.x) < 900 && Math.abs(s.y + st.ship.alt - b.y) < 400)) {
        const side = b.x > 800 ? 1 : -1;
        const s = st.strafers[0];
        s.x = b.x + side * 520;
        s.y = b.y - 150 - st.ship.alt;
        s.heading = side > 0 ? Math.PI + 0.35 : -0.35; // coming in past the end of the top deck (heading toward the ship, climbing a little)
        s.air = 470;
        s.mode = 'circle';
        s.modeT = 5;
      }
    }
    if (process.env.DBG && i % 30 === 0) {
      const b = pl().find((p) => p.dare);
      if (b && b.dare.phase !== 'get') {
        const o = st.stunts.origin(b);
        for (const s of st.strafers) {
          const dd = Math.hypot(s.x - o.x, s.y + st.ship.alt - o.y);
          if (dd < 1100) {
            const c = st.stunts.cast(o, (s.x - o.x) / dd, (s.y + st.ship.alt - o.y) / dd);
            console.log(`   cand d=${dd.toFixed(0)} plane@${s.x.toFixed(0)},${(s.y + st.ship.alt).toFixed(0)} cast -> ${c.anchor ? c.anchor.kind + (c.anchor.plane === s ? '(plane!)' : '') : 'miss'} dist ${c.dist.toFixed(0)}`);
          }
        }
        console.log(`   ${b.name} ${b.dare.phase} d${b.d} x${b.x.toFixed(0)} y${b.y.toFixed(0)} carry ${b.carry} planes: ${st.strafers.map((s) => Math.hypot(s.x - o.x, s.y + st.ship.alt - o.y).toFixed(0)).join(',')} hook ${b.hook && b.hook.phase} hj ${!!b.hj} fly ${b.fly}`);
      }
    }
    if (st.hijacks.some((h) => h.phase === 'fly')) maxFly = Math.max(maxFly, st.hijacks.length);
  }
  // Let any stunt in progress finish.
  for (let i = 0; i < 60 * 90 && pl().some((p) => p.dare); i++) step(sim);
  const log = st.stuntLog || [];
  for (const e of log) console.log(`    ${e.t}s ${e.bot}: ${e.text}`);
  stolen = log.filter((e) => /-> fly$/.test(e.text)).length;
  const ends = log.filter((e) => /^end/.test(e.text));
  check(stolen >= 1, `a bot stole a dogfighter and flew it (${stolen} stolen)`);
  check(ends.some((e) => /landed/.test(e.text)), 'a stunt ended with the bot landed');
  check(!pl().some((p) => p.dare || p.daring || p.hj || p.fly || p.fall), 'no bot left mid-stunt, flying, riding or overboard at the end');
  check(st.hijacks.length === 0, 'no stolen plane left');
  const kos = pl().filter((p) => p.ko > 0).length;
  console.log(`  bots KO at end: ${kos}; stunts ended: ${ends.length}; reasons: ${ends.map((e) => e.text.replace(/^end (\w+) \(([^)]*)\).*/, '$1:$2')).join(', ')}`);
}

// ---------------- Part B: a player hijacks the BIG fighter ----------------
{
  const sim = mk(4, true);
  const st = sim.state;
  const h = st.players.human;
  step(sim, 60 * 8);
  const alive = () => st.enemy.dead <= 0 && st.enemy.heading != null && st.phase === 'flying';
  const waitAlive = () => { for (let i = 0; i < 60 * 90 && !alive(); i++) step(sim); return alive(); };
  // The human jumps off the ship right at the fighter (ship coordinates): free flight, touching her.
  const flyAt = (e) => {
    placeNear(e);
    Object.assign(h, { hj: null, fall: false, ko: 0, lock: null, chute: 0, chuteOpen: false, d: 1 });
    sim.air.startFlight(h, 0, 0);
    h.x = e.x;
    h.y = e.y + st.ship.alt;
    h.jx = h.jy = 0;
    step(sim);
  };
  check(waitAlive(), 'the big fighter is flying');
  const big = st.enemy;
  check(!h.fall && !h.fly, 'human is aboard');
  flyAt(big);
  check(st.hijacks.length === 1 && st.hijacks[0] === big && h.hj === big && big.phase === 'kick', 'touching the big fighter boards her (phase kick)');
  check(st.enemy !== big && st.enemy.dead > 0, 'state.enemy is now a dead placeholder (the AI let go of her)');
  check(!st.hijacks.includes(st.enemy), 'the placeholder is not the stolen plane');
  check(!targets(st).some((t) => t.obj === big), 'her own guns / the bots do not target her (not a live enemy)');
  // Kick: hold action.
  for (let i = 0; i < 60 * 3 && big.phase === 'kick'; i++) { h.fire = true; step(sim); }
  h.fire = false;
  check(big.phase === 'fly', 'the pilot is kicked out (she is ours)');
  // Fly for a while: no new enemy fighter while she is stolen, she keeps flying, she shoots at enemies in front of her.
  let respawnedWhileStolen = false;
  let sawShell = false;
  for (let i = 0; i < 60 * 10 && h.hj; i++) {
    h.jx = h.jy = 0;
    step(sim);
    if (st.enemy.dead <= 0) respawnedWhileStolen = true;
    if (st.shells.some((s) => s.owner === 'human')) sawShell = true;
  }
  check(!respawnedWhileStolen, 'no new enemy fighter spawns while she is stolen');
  check(h.hj === big && big.fuel < config.HIJACK.FIGHTER.FUEL_TIME, 'player is flying her (fuel burning)');
  console.log(`  big fighter air speed ${big.air.toFixed(0)} (enemy cruise ${config.ENEMY.SPEED}, x${config.HIJACK.FIGHTER.SPEED}), hp ${big.hp}/${big.max}; auto guns fired: ${sawShell}`);
  // Bail out.
  h.leaveQ = true;
  step(sim);
  check(!h.hj && (h.fly || h.fall), 'LEAVE bails out');
  check(!st.hijacks.length, 'plane released from hijacks (wrecked, empty)');
  // Enemy respawn continues normally.
  let respawned = false;
  for (let i = 0; i < 60 * 40 && !respawned; i++) {
    step(sim);
    respawned = alive() && st.enemy !== big;
  }
  check(respawned, 'a new enemy fighter respawns after the bail-out (normal respawn logic)');

  // Also: jumping off before the kick gives her straight back to the AI.
  waitAlive();
  const e2 = st.enemy;
  flyAt(e2);
  check(h.hj === e2 && st.enemy !== e2, 'boarded the (next) big fighter');
  h.leaveQ = true;
  step(sim);
  check(!h.hj && st.enemy === e2 && e2.dead <= 0 && !e2.big, 'jumping off before the kick returns her to the enemy AI as state.enemy');
  const hpBefore = e2.hp;
  step(sim, 120);
  check(st.enemy === e2 && e2.dead <= 0 && Math.hypot(e2.vx, e2.vy) > 50 && !h.hj, 'the enemy AI flies her again (and the jumper does not re-board at once)');
}

console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no runtime errors');
console.log(fails || errs.length ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(fails || errs.length ? 1 : 0);
