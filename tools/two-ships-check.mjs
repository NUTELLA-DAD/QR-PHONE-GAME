// B.2 gate: TWO ships in ONE simulation (MOVEMENT.md, Option B). Headless.
//   node tools/buildsim.mjs --check-two-ships     (runs this with the four-bag build, then the minimum two-engine build)   or directly:
//   node tools/two-ships-check.mjs [--build bags] [--minutes 2] [--bots 6] [--seed 1]
//
// The classic ship (ships[0]) and a second ship built from another build fly in the same sky, six bots each, assigned by player.ship. The check proves they NEVER cross-talk:
//   * their contexts (ship.ctx) own every ship-scoped key: no object is shared, ship 0's names still are the world state's, nothing leaked onto a context;
//   * everything a second ship's code reads through the prototype is a key she legitimately shares with the sky (ships.js WORLD_SHARED), not ship 0's data;
//   * damage one, the other is unchanged; a fire / a hole / a flat bag on one is not on the other; a wreck of one does not end the run, and she is rebuilt;
//   * every crewman walks HIS ship's navigation (his deck and place are on his own ship, the whole run), a transfer() moves him over, ctx.players is the crew of that ship;
//   * the camera frames both ships, both are crewed and fly 2 minutes with 0 errors.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './instances.mjs';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const buildName = flag('build', 'bags'), minutes = Number(flag('minutes', 2)), nBots = Number(flag('bots', 6)), seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
const clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const S = await load('modules/host/ships.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const parts = await loadBuild(buildName, BUILDS);
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];

// A sim with the classic ship and the second one, nBots bots each (assigned by player.ship), cast off.
function boot({ bots = nBots, flying = true } = {}) {
  const sim = createSimulation();
  const second = sim.addShip({ parts });
  const st = sim.state;
  for (const sh of st.ships) {
    const e = sh.layout.boarderEntryPoints;
    for (let i = 0; i < bots; i++) {
      const id = sh.id + '_bot' + i;
      st.players[id] = { id, bot: true, ship: sh.id, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    }
  }
  if (flying) sim.castOff();
  return { sim, st, A: st.ships[0], B: second };
}
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };

// Everything about a ship that another ship's trouble must not touch.
const snap = (sh) => JSON.stringify({
  body: { ...sh.state }, fires: sh.ctx.fires, breaches: sh.ctx.breaches, gasHoles: sh.ctx.gasHoles, bags: sh.ctx.bags, valves: sh.ctx.gasValveOpen, vents: sh.ctx.ventOpen,
  ammo: Object.values(sh.ctx.GUNS).map((g) => g.ammo), bay: sh.ctx.bombBay, shield: sh.ctx.shield, modules: sh.ctx.modules.map((m) => [m.name, m.hp, m.broken]),
  balance: sh.ctx.balance, steam: sh.ctx.steamParts, forces: sh.ctx.forces,
});

// ---- 1. the contexts ----
{
  const { st, A, B } = boot({ bots: 0 });
  report(st.ships.length === 2 && A.id === 'player' && B.id === 'ship1' && A.main && !B.main && S.shipOf(st, { ship: 'ship1' }) === B && S.shipOf(st, {}) === A, 'two ships in one sky: "player" (main) and "ship1"');
  report(A.layout !== B.layout && A.nav !== B.nav && A.pose !== B.pose && A.ctx !== B.ctx && A.state !== B.state && A.layout.gasbags.length === 1 && B.layout.gasbags.length === (buildName === 'bags' ? 4 : B.layout.gasbags.length), `each has her own layout, nav, pose, context and body (second ship: ${B.layout.platforms.length} decks, ${B.layout.gasbags.length} bag(s); ship 0: ${A.layout.platforms.length} decks, 1 bag)`);
  let wrong = [];
  for (const k of S.SHIP_KEYS) if (A.ctx[k] !== st[k]) wrong.push(k);
  report(wrong.length === 0 && A.ctx.ship === st.ship && A.state === st.ship && A.ctx.GUNS === st.GUNS && A.ctx.bags === st.bags && A.ctx.fires === st.fires, `ship 0's context forwards every ship key to the world state (state.ship IS ctx.ship, state.GUNS IS ctx.GUNS ...)${wrong.length ? ' - differs: ' + wrong.join(' ') : ''}`);
  const shared = S.SHIP_KEYS.filter((k) => A.ctx[k] && typeof A.ctx[k] === 'object' && A.ctx[k] === B.ctx[k]);
  report(shared.length === 0, `no object is shared between the two ships' contexts (${S.SHIP_KEYS.length} ship keys checked)${shared.length ? ': ' + shared.join(' ') : ''}`);
  const own = (sh) => Object.keys(sh.ctx).filter((k) => !S.SHIP_KEYS.includes(k) && !S.WORLD_WRITES.includes(k) && !['players', 'course', 'gunship'].includes(k));
  report(own(A).length === 0 && own(B).length === 0, `nothing but ship keys is written on a context at creation${own(A).concat(own(B)).length ? ': ' + own(A).concat(own(B)).join(' ') : ''}`);
  report(Object.keys(B.ctx.GUNS).join() === Object.keys(B.layout.gunMounts).join() && B.ctx.bags.length === B.layout.gasbags.length && B.ctx.ventOpen.length === B.layout.vents.length, 'the second ship has her own guns, bags and vents, made from HER layout');
  report(Object.entries(B.sim.walkers).every(([k, f]) => f === B.nav[k] && f !== A.nav[k]) && Object.entries(A.sim.walkers).every(([k, f]) => f === A.nav[k]) && S.mainShip(B.ctx).nav === B.nav && S.mainShip(A.ctx).nav === A.nav && S.mainShip(st).nav === A.nav, 'the crew of each ship walk (moveWalker, steerTo, fall ...) by THAT ship\'s navigation, and her context answers mainShip(state) with herself');
  report(B.ctx.modules !== A.ctx.modules && B.ctx.balance.mass !== undefined && A.ctx.balance !== B.ctx.balance && B.ctx.forces !== A.ctx.forces && B.ctx.links !== A.ctx.links && B.ctx.sails !== A.ctx.sails, 'modules, balance, forces, links, sails are each ship\'s own');
  report(B.pose.x - A.pose.x === B.formation.dx && B.pose.y === -B.state.alt && Math.abs(B.pose.y - A.pose.y - 1150) < 1, `the pose follows: ship1 keeps station ${B.formation.dx} px along the sky and ${-B.formation.dalt} px below ship 0 (pose y ${B.pose.y.toFixed(0)} against ${A.pose.y.toFixed(0)})`);
  A.ctx.kills = 0;
  B.ctx.kills += 5;
  report(st.kills === 5 && !Object.getOwnPropertyDescriptor(B.ctx, 'kills').hasOwnProperty('value'), 'kills written through a context land on the world\'s count');
  st.kills = 0;
}

// ---- 2. crews: ctx.players is the ship's crew; transfer() ----
{
  const { sim, st, A, B } = boot();
  const names = (sh) => Object.values(sh.ctx.players).map((p) => p.id).sort();
  report(Object.keys(st.players).length === 2 * nBots && names(A).length === nBots && names(B).length === nBots && names(A).every((id) => id.startsWith('player')) && names(B).every((id) => id.startsWith('ship1')) && S.crewOf(st, B).length === nBots, `ctx.players is the crew of that ship (${nBots} + ${nBots} of the ${Object.keys(st.players).length} players)`);
  const p = st.players['player_bot0'];
  const to = B.layout.deckIndex('main');
  S.transfer(st, p, B, to, 300);
  report(p.ship === 'ship1' && names(A).length === nBots - 1 && names(B).length === nBots + 1 && p.d === to && p.y === B.layout.platforms[to].y && !('player_bot0' in A.ctx.players) && ('player_bot0' in B.ctx.players), 'transfer(): the player is now aboard ship1, on her deck, and in her crew only');
  step(sim, 600);
  const P = B.layout.platforms[p.d];
  report(p.ship === 'ship1' && p.d != null && !!P && p.x >= P.x0 - 80 && p.x <= P.x1 + 80 && names(A).length === nBots - 1, 'and he goes on walking ship1\'s navigation after the move (10 s later he is on her deck ' + p.d + ' at ' + Math.round(p.x) + ')');
}

// ---- 3. controlled experiments: no crew, no enemies yet ----
{
  const { sim, st, A, B } = boot({ bots: 0 });
  step(sim, 5);
  const hullA = A.state.hull;
  // damage one -> the other is unchanged
  let before = snap(A);
  const bagAt = B.layout.gasbags[0], deck = B.layout.platforms[B.layout.deckIndex('main')];
  for (let i = 0; i < 12; i++) {
    B.sim.impact(deck.x0 + 200 + i * 60, deck.y - 60, 2);
    B.sim.impact(bagAt.cx, bagAt.cy, 2);
  }
  report(snap(A) === before, 'hits on ship1 leave ship 0 exactly as she was (body, fires, holes, bags, guns, modules, balance, steam)');
  report(B.state.hull < 100 && (B.ctx.breaches.length > 0 || B.ctx.gasHoles.length > 0) && A.ctx.breaches.length === 0 && A.ctx.gasHoles.length === 0 && A.ctx.fires.length === 0, `... and ship1 took them (hull ${B.state.hull.toFixed(0)}, ${B.ctx.breaches.length} holes in the hull, ${B.ctx.gasHoles.length} in the bags)`);
  before = snap(B);
  for (let i = 0; i < 12; i++) A.sim.impact(700 + i * 40, 520, 2);
  report(snap(B) === before && A.state.hull < 100, 'and hits on ship 0 leave ship1 exactly as she was');
  // a fire on one is not on the other
  const { sim: sim2, st: st2, A: A2, B: B2 } = boot({ bots: 0 });
  step(sim2, 5);
  const d2 = B2.layout.deckIndex('main');
  B2.sim.fireSys.ignite(d2, B2.layout.platforms[d2].x0 + 400, 'hit');
  report(B2.ctx.fires.length >= 1 && A2.ctx.fires.length === 0, 'a fire lit on ship1 burns on ship1 only');
  step(sim2, 600);
  report(A2.ctx.fires.length === 0 && A2.state.hull === 100 && B2.state.hull < 100 && A2.ctx.breaches.length === 0, `after 10 s ship 0 has no fire and her hull is untouched (100), ship1\'s hull is ${B2.state.hull.toFixed(1)} and burning (${B2.ctx.fires.length} fires)`);
  const { sim: sim3, A: A3, B: B3 } = boot({ bots: 0 });
  A3.sim.fireSys.ignite(A3.layout.deckIndex('main'), 700, 'hit');
  step(sim3, 600);
  report(B3.ctx.fires.length === 0 && B3.state.hull === 100 && A3.ctx.fires.length >= 1, 'and a fire on ship 0 never reaches ship1');
  // a flat bag, a hole in the bag, steam
  const { sim: sim4, A: A4, B: B4 } = boot({ bots: 0 });
  step(sim4, 5);
  const gasA = A4.state.gas, pressA = A4.state.press, bagsA = JSON.stringify(A4.ctx.bags);
  for (const b of B4.ctx.bags) b.gas = 5;
  B4.ctx.gasHoles.push(B4.sim.gasHoleAt(B4.layout.gasbags[0].cx, B4.layout.gasbags[0].cy - 40, 0));
  B4.state.press = 95;
  report(A4.state.gas === gasA && A4.state.press === pressA && JSON.stringify(A4.ctx.bags) === bagsA && A4.ctx.gasHoles.length === 0, 'a flat bag, a hole in it and 95 steam on ship1 do not move ship 0\'s gas, bags, holes or steam');
  step(sim4, 240);
  report(A4.ctx.gasHoles.length === 0 && A4.state.gas > 25, `4 s later ship 0 still has no hole and her gas is ${A4.state.gas.toFixed(1)}; ship1\'s steam went its own way (${B4.state.press.toFixed(0)})`);
  // a wreck of one does not end the run, she is rebuilt, the other is not wrecked
  const { sim: sim5, st: st5, A: A5, B: B5 } = boot({ bots: 0 });
  step(sim5, 5);
  B5.sim.goingDown.tryStart(); // (the last stand is used up, so the next wreck is a real one)
  B5.ctx.goingDown = null;
  B5.ctx.gdGrace = 0;
  B5.sim.damageHull(1000);
  report(!!B5.ctx.wreck && B5.state.down > 0 && !A5.ctx.wreck && A5.state.down === 0 && A5.state.hull === 100 && st5.runEnd == null && st5.limp == null, 'ship1 breaks up while ship 0 flies on and the run does not end');
  step(sim5, Math.ceil((config.WRECK.TIME + 1) * 60));
  report(B5.ctx.wreck == null && B5.state.down === 0 && B5.state.hull === 100 && st5.runEnd == null, 'and she is rebuilt afterwards (hull 100, crew dropped back aboard)');
}

// ---- 4. the long run: both crewed, 0 errors, nobody walks the wrong ship ----
{
  const { sim, st, A, B } = boot();
  // every world key a second ship reads through the prototype is one she legitimately shares
  const reads = new Set();
  const base = Object.getPrototypeOf(B.ctx);
  Object.setPrototypeOf(B.ctx, new Proxy(base, { get(t, k, r) { if (typeof k === 'string') reads.add(k); return Reflect.get(t, k, r); } }));
  const steps = Math.round(minutes * 3600);
  const errors = new Map();
  const wrongWalk = { A: 0, B: 0 };
  let conn = { A: 0, B: 0 }, crewSteps = 0, camBad = 0, hullMin = { A: 100, B: 100 };
  let view = null;
  const ships = [['A', A], ['B', B]];
  for (let i = 0; i < steps; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { const k = e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e); errors.set(k, (errors.get(k) || 0) + 1); if (errors.size > 4) break; }
    if (i % 10 === 0) {
      for (const [tag, sh] of ships) {
        hullMin[tag] = Math.min(hullMin[tag], sh.state.hull);
        for (const p of Object.values(sh.ctx.players)) {
          if (p.d == null || p.fall || p.fly || p.onGunship || p.hj) continue;
          const P = sh.layout.platforms[p.d];
          if (!P || p.x < P.x0 - 80 || p.x > P.x1 + 80) wrongWalk[tag]++;
          if (p.conn != null) conn[tag]++;
          crewSteps++;
        }
      }
      view = createWorldCamera().update(0, st, 1920, 1080); // (a fresh camera each time: its first view IS the target framing, without the glide)
      const half = { w: 1920 / 2 / view.zoom, h: 1080 / 2 / view.zoom };
      for (const sh of st.ships) {
        const b = sh.layout.bounds;
        if (!view.clipped && (sh.pose.x + b.x0 < view.cx - half.w - 1 || sh.pose.x + b.x1 > view.cx + half.w + 1 || sh.pose.y + b.y0 < view.cy - half.h - 1 || sh.pose.y + b.y1 > view.cy + half.h + 1)) camBad++;
      }
    }
  }
  for (const [k, n] of errors) console.log(`  error x${n}: ${k}`);
  report(errors.size === 0, `${minutes} min with ${nBots} bots on each ship: ${errors.size} errors`);
  report(wrongWalk.A === 0 && wrongWalk.B === 0 && crewSteps > 0, `every crewman stood on HIS ship's decks the whole run (${crewSteps} samples; off-deck: ship 0 ${wrongWalk.A}, ship1 ${wrongWalk.B})`);
  report(conn.B > 0 || B.layout.connectors.length === 0, `ship1's crew climbed her own ladders and lifts (${conn.B} samples on a connector; ship 0 ${conn.A})`);
  report(camBad === 0 && view && view.zoom > 0, `the camera framed both ships all along (zoom ${view && view.zoom.toFixed(2)}, floor ${view && view.minZoom.toFixed(2)}${view && view.clipped ? ', CLIPPED' : ''})`);
  const unknown = [...reads].filter((k) => !S.WORLD_SHARED.includes(k) && !['players', 'course', 'ships', 'self'].includes(k));
  report(unknown.length === 0, `everything ship1's code read through the prototype is shared sky (${[...reads].length} keys)${unknown.length ? ' - NOT shared: ' + unknown.join(' ') : ''}`);
  Object.setPrototypeOf(B.ctx, base);
  const leaked = (sh) => Object.keys(sh.ctx).filter((k) => !S.SHIP_KEYS.includes(k) && !S.WORLD_WRITES.includes(k) && !['players', 'course', 'gunship'].includes(k));
  report(leaked(A).length === 0 && leaked(B).length === 0, `nothing leaked onto either context in ${minutes} minutes of play${leaked(A).concat(leaked(B)).length ? ': ' + leaked(A).concat(leaked(B)).join(' ') : ''}`);
  report(A.state.hull > 0 && B.state.hull > 0 && A.ctx.modules.length > 0, `both flew: hull ship 0 ${A.state.hull.toFixed(0)} (low ${hullMin.A.toFixed(0)}), ship1 ${B.state.hull.toFixed(0)} (low ${hullMin.B.toFixed(0)}), ${st.kills} kills`);
}

process.exit(ok ? 0 : 1);
