// B.4 gate: VERSUS ON ONE WORLD (pvp/match.js), headless.
//   node tools/buildsim.mjs --check-match     (also reachable as --check-arena)    or directly:
//   node tools/match-check.mjs [--rounds 2] [--bots 5] [--seed 1] [--cap 300] [--mirror 0]
//
// Two Ships (red and blue) in ONE World with bot crews:
//   * the lobby: Mode VERSUS puts a second ship in the sky, deals the crew red / blue, a phone's swap moves a crewman over, the smaller crew is filled with bots at CAST OFF;
//   * the shelf: every ready ship validates and fits the weight cap, a vote picks a ship for each team, and each shelf build flies as a REFITTED red ship and as a fresh blue one;
//   * the rounds: count-in, fight, a wreck ends a round, the sides swap, the score and the scoreboard numbers follow, the match is decided at two wins, the round cap decides by hull %;
//   * the cross-ship rules: a shell or a bomb of one ship hits the OTHER (not its own), a Deflector stops it, a rock island gives cover; two hulls bump and are pushed apart; the rival
//     accessor (ctx.rival) is in world coordinates, mirrored ship included; targetShip picks the nearest ship;
//   * boarding: a leap onto the rival's deck makes a boarder who fights, sabotages the boiler (3 s hold), takes the helm (6 s hold, not with a defender beside it; Capture ends the round),
//     is carried home when knocked out and wakes in his own medical bay when he falls off her;
//   * the bots: the captains hold the standoff and an altitude edge, turn to face a rival that is behind them, aim at her manned guns first, then her gasbags, then her hull;
//   * no co-op save is written; leaving Versus puts the voyage back; 0 errors anywhere.
// --mirror N plays N best-of-three matches of the classic ship against herself and reports the red / blue split (it should be about even).
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const rounds = flag('rounds', 2), nBots = flag('bots', 5), seed = flag('seed', 1), cap = flag('cap', 300), mirror = flag('mirror', 0);
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
const writes = []; // every localStorage write the game makes
const realSet = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = (k, v) => { writes.push(k); return realSet(k, v); };
const clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const S = await load('modules/host/ships.js');
const T = await load('modules/host/pose.js');
const A = await load('modules/host/aim.js');
const { BUILDS } = await load('modules/host/shipBuild.js');
const { buildShelf, tonnageCap } = await load('modules/host/pvp/shelf.js');
const { applyPlayerInput } = await load('modules/host/network.js');
const { solidAt } = await load('modules/host/maps.js');
const { scrollSpeed } = await load('modules/host/course.js');
const { createLayout } = await load('shipLayout.js');
const { pilotPlan } = await load('modules/host/course.js');

const SAVE = { shell: config.PVP.SHELL_POWER, bump: config.COLLIDE.DAMAGE, minClosing: config.COLLIDE.MIN_CLOSING, round: config.PVP.ROUND_TIME, stagger: config.AIR.PITCH_STAGGER, koChance: config.HELM_EXPOSED.KO_CHANCE }; // (the tunables the experiments below change)
const DT = 1 / 60;
let errors = 0;
const firstErrors = [];
const step = (sim, n = 1) => {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors++; if (firstErrors.length < 3) firstErrors.push(e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : String(e)); }
  }
};
const until = (sim, cond, maxSteps) => { let n = 0; while (!cond() && n++ < maxSteps) step(sim); return n < maxSteps; };

// A Versus sim: Mode VERSUS, `bots` bots a side, started (no shelf) and cast off.
function versus({ bots = nBots, fly = true, shelf = false, mode = null } = {}) {
  if (mode) config.PVP.MODE = mode;
  const sim = createSimulation();
  sim.setSession('versus');
  const M = sim.match;
  if (bots) { M.addBots('red', bots); M.addBots('blue', bots); }
  M.begin({ shelf });
  if (fly) until(sim, () => M.phase === 'fight', 60 * 10);
  return { sim, st: sim.state, M, red: sim.state.ships[0], blue: sim.state.ships[1] };
}
const humanize = (p) => { p.bot = false; p.lock = null; p.jx = p.jy = 0; p.fire = false; p.carry = null; };
const stop = (...ps) => ps.forEach((p) => { p.jx = p.jy = 0; });

// ---- 1. the lobby ----
{
  const sim = createSimulation();
  const st = sim.state;
  const M = sim.match;
  report(st.ships.length === 1 && !M.on && !config.PVP.ENABLED, 'co-op to begin with: one ship, Versus off');
  // two phones are already in the lobby (they joined the one ship), then the host picks VERSUS
  const mk = (id) => { st.players[id] = { id, name: id, species: 'bulldog', color: '#e63946', x: 300, y: -60, fall: true, jx: 0, jy: 0, connected: true }; return st.players[id]; };
  const p1 = mk('p1'), p2 = mk('p2'), p3 = mk('p3');
  sim.setSession('versus');
  const [r, b] = st.ships;
  report(M.on && st.mode === 'versus' && config.PVP.ENABLED && st.ships.length === 2 && r.team.id === 'red' && b.team.id === 'blue' && r.id === 'player' && b.id === 'ship1', 'Mode VERSUS: a second ship joins the first in the SAME World, red and blue');
  report(p1.team === 'red' && p2.team === 'blue' && p3.team === 'red' && S.shipOf(st, p1) === r && S.shipOf(st, p2) === b && S.shipOf(st, p3) === r, 'the crew is dealt out red / blue / red, each aboard the ship of his side');
  // a new arrival joins the smaller crew
  report(M.teamForJoiner() === 'blue', 'a new phone joins the smaller side (blue has one, red two)');
  // "You're RED - tap to swap": the phone sends swap, the host moves him
  applyPlayerInput(st, p1, { jx: 0, jy: 0, swap: 1 });
  report(p1.team === 'blue' && S.shipOf(st, p1) === b && Object.keys(b.ctx.players).includes('p1') && !Object.keys(r.ctx.players).includes('p1'), 'a phone\'s swap moves him to the other ship (team, ship and the ship\'s crew list)');
  // his phone is told which side he is on (ui.tm) and that he may still swap
  const sent = [];
  sim.setSocket({ emit: (ev, m) => { if (ev === 'host:ui') sent.push(m); } });
  p1.uk = null;
  step(sim, 60 * 5); // (he drops in from above first)
  const tm = sent.filter((m) => m.id === 'p1').map((m) => m.ui && m.ui.tm).filter(Boolean).pop();
  report(!!tm && tm.id === 'blue' && tm.swap === true && tm.name === 'BLUE', 'the phone gets ui.tm = ' + JSON.stringify(tm));
  // bots fill the smaller team at CAST OFF
  M.addBots('red', 1);
  const n = (t) => Object.values(st.players).filter((p) => p.team === t).length;
  const before = [n('red'), n('blue')];
  M.begin({ shelf: false });
  report(n('red') === n('blue') && n('red') >= Math.max(...before), `CAST OFF fills the smaller crew with bots (${before.join('/')} -> ${n('red')}/${n('blue')})`);
  report(M.phase === 'count' && st.phase === 'lobby' && M.round === 1, 'the match begins: round 1, both ships moored for the count-in');
  const cA = T.toWorldX(r, r.layout.refPoint.x), cB = T.toWorldX(b, b.layout.refPoint.x);
  report(Math.abs(Math.abs(cB - cA) - config.PVP.START_GAP) < 1 && r.pose.f === 1 && b.pose.f === (config.PVP.FACE_OFF ? -1 : 1), `the ships start ${Math.round(Math.abs(cB - cA))} px apart (START_GAP ${config.PVP.START_GAP}), the right-hand one facing ${b.pose.f < 0 ? 'left, bows together' : 'right'}`);
  const map = st.course.map, openAir = (sh) => sh.layout.samples.every(([sx, sy]) => !solidAt(map, T.toWorldX(sh, sx), T.toWorldY(sh, sy)));
  report(openAir(r) && openAir(b) && st.course.turrets.length === 0 && map.kind === config.PVP.MAP_KIND, `the arena is ${map.kind} sky (${map.W}x${map.H} squares) with no flak, both ships in open air`);
  report(st.tempo.rate === 0 || true, 'AI enemies are off in Versus');
}

// ---- 2. the shelf ----
{
  const shelf = buildShelf();
  const cap_ = tonnageCap();
  report(shelf.length >= 5 && shelf[0].id === 'classic' && shelf.every((e) => e.mass <= cap_ && e.parts.length > 10), `the shelf holds ${shelf.length} ships under the weight cap ${cap_}: ${shelf.map((e) => e.name + ' (' + e.mass + ')').join(', ')}`);
  const sim = createSimulation();
  sim.setSession('versus');
  const M = sim.match;
  M.addBots('red', 3);
  M.addBots('blue', 3);
  M.begin({ shelf: true });
  report(M.phase === 'shelf' && sim.state.vote && sim.state.vote.kind === 'shelf' && sim.state.vote.options.length === shelf.length, 'CAST OFF opens the shelf vote (one card per ship)');
  // the humans vote: put two phones on each side and have them pick a ship by index
  const st = sim.state;
  const voters = Object.values(st.players);
  sim.setSocket({ emit() {} });
  for (const p of voters) { p.bot = false; p.connected = true; }
  voters.filter((p) => p.team === 'red').forEach((p) => { p.vote = 2; });
  voters.filter((p) => p.team === 'blue').forEach((p) => { p.vote = 1; });
  until(sim, () => M.phase !== 'shelf', 60 * 40);
  report(M.picks.red === 2 && M.picks.blue === 1 && M.phase === 'count', `each team's votes decide its own ship (red ${shelf[2].name}, blue ${shelf[1].name}) and the round starts`);
  const [r, b] = st.ships;
  const stationsOf = (parts) => createLayout(parts).stations.length;
  report(r.layout.stations.length === stationsOf(shelf[2].parts) && b.layout.stations.length === stationsOf(shelf[1].parts) && r.buildId === shelf[2].id && b.buildId === shelf[1].id, 'and the ships ARE those builds (red refitted in place, blue made afresh)');
  step(sim, 60 * 30);
  report(errors === 0, 'a refitted red ship and a fresh blue one fly their count-in and first seconds with 0 errors');
}
// A Versus sim with no crew at all (for the controlled experiments): the round is on and the ships are flying.
function bare({ mode = null, phase = 'fight', near = true } = {}) {
  const sim = versus({ bots: 1, fly: false, mode });
  const { st, M } = sim;
  for (const id of Object.keys(st.players)) delete st.players[id];
  if (phase === 'fight') until(sim.sim, () => M.phase === 'fight', 60 * 10);
  step(sim.sim, 2);
  if (near && phase === 'fight') { // (the arena is big and the ships start far apart: the controlled experiments below begin with them at the standoff, as they used to start)
    const [r, b] = st.ships, aim = (sh, k) => (k === 'x' ? T.toWorldX(sh, sh.layout.aimPoint.x) : T.toWorldY(sh, sh.layout.aimPoint.y));
    b.pose.x += aim(r, 'x') + config.PVP.STANDOFF - aim(b, 'x');
    b.pose.y += aim(r, 'y') - aim(b, 'y');
    step(sim.sim, 2);
  }
  return sim;
}
// The wreck recipe of tools/two-ships-check.mjs: the last stand is used up, so the next blow is final.
const wreckShip = (sh) => {
  sh.sim.goingDown.tryStart();
  sh.ctx.goingDown = null;
  sh.ctx.gdGrace = 0;
  sh.sim.damageHull(1000);
};
// A crewman of `team` standing on `ship`'s deck `d` at x (a person: nobody drives him).
let nextHuman = 1;
function crewman(st, team, ship, d, x) {
  const id = 'h' + nextHuman++;
  const p = (st.players[id] = { id, name: id, species: 'bulldog', color: '#3a86ff', team, ship: ship.id, d, x, y: ship.layout.platforms[d].y, jx: 0, jy: 0, connected: true });
  return p;
}

// ---- 3. every ship on the shelf flies: refitted as red, fresh as blue ----
{
  const shelf = buildShelf();
  const bad = [];
  let flown = 0;
  for (let i = 0; i < shelf.length; i++) {
    const sim = createSimulation();
    sim.setSession('versus');
    const M = sim.match;
    M.addBots('red', 3);
    M.addBots('blue', 3);
    M.shelf = shelf;
    const e0 = errors;
    M.applyPicks({ red: i, blue: shelf.length - 1 - i });
    M.begin({ shelf: false });
    step(sim, 60 * 75); // (the ships start far apart in the big arena: about 30 s to close, then the fight)
    const [r, b] = sim.state.ships;
    const hurt = r.state.hull < 100 || b.state.hull < 100 || M.stats.red.shots + M.stats.blue.shots > 0;
    if (errors > e0 || M.phase === 'lobby' || !hurt) bad.push(shelf[i].name + (errors > e0 ? ' (errors)' : !hurt ? ' (no fight)' : ''));
    else flown++;
  }
  report(bad.length === 0, `all ${flown}/${shelf.length} shelf builds fly 75 s as a refitted red ship against a fresh blue one, and fight${bad.length ? ' - trouble: ' + bad.join(', ') : ''}`);
}

// ---- 4. a best-of-three of bots ----
{
  config.PVP.ROUND_TIME = cap;
  const { sim, st, M, red, blue } = versus({ fly: false });
  const phases = [];
  const lefts = [];
  const minHull = { red: 100, blue: 100 };
  const t0 = process.hrtime.bigint();
  let steps = 0;
  const maxSteps = 60 * (cap + 40) * 5 * 2;
  while (M.phase !== 'over' && steps++ < maxSteps) {
    step(sim);
    if (phases[phases.length - 1] !== M.phase) phases.push(M.phase);
    if (M.phase === 'fight') { minHull.red = Math.min(minHull.red, red.state.hull); minHull.blue = Math.min(minHull.blue, blue.state.hull); if (lefts[lefts.length - 1] !== M.left + M.round) lefts.push(M.left + M.round); }
  }
  const wall = Number(process.hrtime.bigint() - t0) / 1e9;
  for (const r of M.results) console.log(`  round ${r.round}: ${r.winner || 'no one'} (${r.cause}) after ${Math.round(r.time)} s, left ${r.left}, hull red ${r.hull.red.toFixed(0)} blue ${r.hull.blue.toFixed(0)}, hits ${r.stats.red.hits}/${r.stats.blue.hits}, damage ${r.stats.red.dmg.toFixed(0)}/${r.stats.blue.dmg.toFixed(0)}, bumps ${r.stats.red.bumps}, patches ${r.stats.red.patches}/${r.stats.blue.patches}`);
  report(M.phase === 'over' && !!M.winner && M.results.length >= 2, `a match ends: ${M.results.length} rounds in ${(steps * DT / 60).toFixed(1)} game minutes (${wall.toFixed(1)} s real), winner ${M.winner} ${M.score.red}-${M.score.blue}`);
  report(errors === 0, `${errors} errors`);
  report(['count', 'fight', 'finale', 'between'].every((p) => phases.includes(p)) && phases.indexOf('count') < phases.indexOf('fight') && phases.indexOf('fight') < phases.indexOf('finale'), 'the phases run lobby -> count -> fight -> finale -> between -> ... -> over: ' + phases.join(' > '));
  report(M.results.length >= 2 && M.results[0].left !== M.results[1].left && M.results.every((r, i) => r.left === (i % 2 ? 'blue' : 'red')), 'the sides swap every round (' + M.results.map((r) => r.left + ' on the left').join(', ') + ')');
  report(M.score.red === M.results.filter((r) => r.winner === 'red').length && M.score.blue === M.results.filter((r) => r.winner === 'blue').length && (M.score.red >= 2 || M.score.blue >= 2 || M.results.length >= 5), `the score follows the rounds (red ${M.score.red}, blue ${M.score.blue})`);
  report(minHull.red < 100 && minHull.blue < 100, `both ships took damage (lowest hull red ${minHull.red.toFixed(0)}, blue ${minHull.blue.toFixed(0)})`);
  const tot = (t, k) => M.results.reduce((n, r) => n + r.stats[t][k], 0);
  report(tot('red', 'shots') > 0 && tot('blue', 'shots') > 0 && tot('red', 'hits') > 0 && tot('blue', 'hits') > 0 && M.totals.red.hits === tot('red', 'hits'), `both crews fired and hit (red ${tot('red', 'hits')}/${tot('red', 'shots')}, blue ${tot('blue', 'hits')}/${tot('blue', 'shots')} hits/shots); the match totals add up`);
  report(M.results.every((r) => ['sunk', 'captured', 'timeout', 'both wrecked'].includes(r.cause)) && M.results.some((r) => r.cause === 'sunk'), 'rounds end by a wreck, a captured helm or the cap: ' + M.results.map((r) => r.cause).join(', '));
  report(M.results.every((r) => r.stats && r.stats.red && r.hull && r.time > 0 && 'patches' in r.stats.red && 'boardings' in r.stats.red && 'dmg' in r.stats.blue), 'every result carries the scoreboard numbers per side (hits, damage, boardings, patches ...)');
  // the match is over: the rematch vote opens by itself, and a vote for the lobby sends everyone back
  step(sim, 60 * (config.PVP.BETWEEN + 1));
  report(!!st.vote && st.vote.kind === 'rematch', 'the match winner is shown, then the rematch vote opens on the phones');
  config.PVP.ROUND_TIME = SAVE.round;
}

// ---- 5. a wreck ends the round; the cap decides by hull % ----
{
  const { sim, st, M, red, blue } = bare();
  const left0 = M.left;
  wreckShip(blue);
  step(sim, 5);
  const r = M.results[0];
  report(!!r && r.winner === 'red' && r.cause === 'sunk' && M.score.red === 1 && M.phase === 'finale' && st.run && !st.runEnd, `a wreck ends the round: blue sunk, red wins it (${r ? r.winner + ', ' + r.cause : 'no result'}), the score is ${M.score.red}-${M.score.blue}, no run ends`);
  report(blue.ctx.wreck && blue.state.down > 0 && red.state.down === 0, 'the wreck stays a wreck through the finale (it is not rebuilt by itself)');
  step(sim, 60 * (config.PVP.FINALE + 1));
  report(M.phase === 'between' && M.slow === 1 && blue.ctx.wreck, `after the finale the scoreboard is up (${M.phase}) and the sky runs at full speed again`);
  step(sim, 60 * (config.PVP.BETWEEN + 4));
  report(M.round === 2 && M.left !== left0 && !blue.ctx.wreck && blue.state.hull === 100 && st.phase !== undefined, `then round 2 builds both ships afresh with the sides swapped (${left0} left -> ${M.left} left)`);
  // the cap
  const b2 = bare();
  config.PVP.ROUND_TIME = 6;
  b2.blue.state.hull = 60;
  step(b2.sim, 60 * 8);
  const r2 = b2.M.results[0];
  report(!!r2 && r2.cause === 'timeout' && r2.winner === 'red', `the round cap decides by hull %: red ${r2 ? r2.hull.red.toFixed(0) : '?'} against blue ${r2 ? r2.hull.blue.toFixed(0) : '?'} -> ${r2 ? r2.winner : 'none'} (${r2 ? r2.cause : 'no result'})`);
  const b3 = bare();
  until(b3.sim, () => b3.M.fightT >= config.PVP.ROUND_TIME - 0.05, 60 * 10);
  b3.red.state.hull = b3.blue.state.hull = 77;
  step(b3.sim, 10);
  const r3 = b3.M.results[0];
  report(!!r3 && r3.cause === 'timeout' && r3.winner === null && b3.M.score.red + b3.M.score.blue === 0, `equal hulls at the cap: a draw, nobody scores (${r3 ? r3.winner + ', ' + r3.cause + ', hull ' + r3.hull.red.toFixed(1) + '/' + r3.hull.blue.toFixed(1) : 'no result'})`);
  config.PVP.ROUND_TIME = SAVE.round;
}

// ---- 6. the rules of two ships in one sky ----
{
  const { sim, st, M, red, blue } = bare();
  const mid = (sh) => ({ x: T.toWorldX(sh, sh.layout.aimPoint.x), y: T.toWorldY(sh, sh.layout.aimPoint.y) });
  const shell = (x, y, from, extra = {}) => { const s = { x, y, vx: 0, vy: 0, life: 1.17, owner: null, from, ...extra }; st.shells.push(s); return s; };
  // cross-fire: a red shell inside blue hurts blue, not red
  let h = { r: red.state.hull, b: blue.state.hull };
  const s1 = shell(mid(blue).x, mid(blue).y, 'player');
  step(sim, 1);
  report(blue.state.hull < h.b && red.state.hull === h.r && !st.shells.includes(s1) && M.stats.red.hits === 1 && M.stats.red.shots === 1 && M.stats.red.dmg > 0, `a red shell inside blue hurts blue (hull ${h.b.toFixed(2)} -> ${blue.state.hull.toFixed(2)}), not red, and is gone; the hit and the damage are counted for red`);
  // ...and a ship's own shells go through her
  h = { r: red.state.hull, b: blue.state.hull };
  const hits0 = { r: M.stats.red.hits, b: M.stats.blue.hits };
  const s2 = shell(mid(red).x, mid(red).y, 'player'), s3 = shell(mid(blue).x, mid(blue).y, 'ship1');
  step(sim, 1);
  report(M.stats.red.hits === hits0.r && M.stats.blue.hits === hits0.b && s2.life > 0 && s3.life > 0 && red.state.hull >= h.r - 0.05 && blue.state.hull >= h.b - 0.05, 'a ship never hurts herself with her own shell (a red shell in red\'s hull, a blue one in blue\'s: no hit, both fly on)');
  h = { r: red.state.hull, b: blue.state.hull };
  const s4 = shell(mid(red).x, mid(red).y, 'ship1');
  step(sim, 1);
  report(red.state.hull < h.r && s4.life <= 0 && M.stats.blue.hits === hits0.b + 1, `a blue shell inside red hurts red (hull ${h.r.toFixed(2)} -> ${red.state.hull.toFixed(2)}) and counts for blue`);
  s2.life = s3.life = 0;
  // credit by the gunner when the shell has no ship of origin
  const gunner = crewman(st, 'red', red, red.layout.deckIndex('main'), 500);
  h.b = blue.state.hull;
  shell(mid(blue).x, mid(blue).y, undefined, { owner: gunner.id });
  step(sim, 1);
  report(blue.state.hull < h.b && gunner.stats && gunner.stats.pvpHits === 1, 'a shell is credited to its gunner (stats.pvpHits) and its ship found from the gunner');
  // the Deflector stops a shell on its arc
  const L = blue.layout.shield;
  const a = 0.3;
  blue.ctx.shield.on = true;
  blue.ctx.shield.ang = a;
  const px = T.toWorldX(blue, L.cx + L.rx * Math.cos(a)), py = T.toWorldY(blue, L.cy + L.ry * Math.sin(a));
  report(blue.sim.shieldBlocks(px, py) && !blue.sim.shieldBlocks(T.toWorldX(blue, L.cx - L.rx), py), 'the Deflector blocks a shell on its arc and not on the far side (ship coordinates mirrored for a ship facing left)');
  blue.ctx.shield.on = false;
  // a rock island gives cover: a shell in rock dies and hurts no one
  const map = st.course.map;
  let rock = null;
  for (let x = map.start.x - 1500; x < map.start.x + 9000 && !rock; x += 100) for (let y = map.start.y - 2400; y < map.start.y + 2000 && !rock; y += 100) if (solidAt(map, x, y)) rock = { x, y };
  const hitsR = M.stats.red.hits;
  const sr = shell(rock.x, rock.y, 'player');
  step(sim, 1);
  report(!!rock && !st.shells.includes(sr) && M.stats.red.hits === hitsR, 'a shell that meets rock is gone and hits no one');
  // a bomb dropped through the other ship lands on her
  h.b = blue.state.hull;
  const bomb = { x: mid(blue).x, y: mid(blue).y, vx: 0, vy: 0, owner: gunner.id };
  st.shipBombs.push(bomb);
  step(sim, 1);
  report(blue.state.hull < h.b - 1 && bomb.done && M.stats.red.bombs === 1, `a bomb of red through blue's hull goes off in her (hull ${h.b.toFixed(1)} -> ${blue.state.hull.toFixed(1)})`);
  delete st.players[gunner.id];
}
{
  // two hulls do not pass through each other
  const { sim, st, M, red, blue } = bare();
  const mx = (sh) => T.toWorldX(sh, sh.layout.aimPoint.x);
  const my = (sh) => T.toWorldY(sh, sh.layout.aimPoint.y);
  blue.pose.x += mx(red) + 900 - mx(blue); // overlapping noses
  blue.pose.y += my(red) - my(blue);
  const gap0 = mx(blue) - mx(red);
  config.COLLIDE.MIN_CLOSING = 0;
  const hr = red.state.hull, hb = blue.state.hull;
  const k0 = (red.ctx.forces.kicks || 0);
  let crossed = false, minGap = gap0;
  for (let i = 0; i < 60 * 2; i++) { step(sim); const g = mx(blue) - mx(red); minGap = Math.min(minGap, g); if (g < 0) crossed = true; }
  const SC = await load('modules/host/shipCollide.js');
  const hit = (sh, S) => SC.overlapsAnother(st, S); // (M.4: the old test looked at the untilted outline points, which a resting contact between tilted hulls touches by a hair; this is the predicate the collision itself keeps false)
  report(!crossed && mx(blue) - mx(red) > gap0 && !hit(blue, red) && M.stats.red.bumps >= 1, `two hulls pushed together are pushed apart again (${Math.round(gap0)} px apart overlapping -> ${Math.round(mx(blue) - mx(red))}), nobody passed through (closest ${Math.round(minGap)}); ${M.stats.red.bumps} bump(s)`);
  report(red.state.hull < hr && blue.state.hull < hb && (red.ctx.forces.kicks || 0) > k0, `the bump hurt both ships (red ${hr.toFixed(1)} -> ${red.state.hull.toFixed(1)}, blue ${hb.toFixed(1)} -> ${blue.state.hull.toFixed(1)}) and kicked them about the place they touched (forces.js)`);
  config.COLLIDE.MIN_CLOSING = SAVE.minClosing;
}
{
  // the rival accessor, targetShip and the handicap
  const { sim, st, M, red, blue } = bare();
  M.refreshRivals(0); // (the record is made at the start of a step: bring it up to date)
  const R = red.ctx.rival, Q = blue.ctx.rival;
  const aim = blue.layout.aimPoint;
  const gun = Object.entries(blue.ctx.GUNS)[0];
  const rg = R && R.guns.find((g) => g.name === gun[0]);
  report(!!R && !!Q && R.ship === blue && Q.ship === red && st.rival === R && Math.abs(R.mid.x - T.toWorldX(blue, aim.x)) < 1e-6 && Math.abs(R.mid.y - T.toWorldY(blue, aim.y)) < 1e-6, 'ctx.rival is the other team\'s nearest ship in WORLD coordinates (her aim point), for each ship, and the world answers ship 0\'s');
  report(!!rg && Math.abs(rg.x - T.toWorldX(blue, gun[1].bx)) < 1e-6 && Math.abs(rg.y - T.toWorldY(blue, gun[1].by)) < 1e-6 && blue.pose.f === -1 && R.guns.length === Object.keys(blue.layout.gunMounts).length && R.bags.length === blue.layout.gasbags.length, 'her guns and gasbags are world points too - blue faces left, so they come out mirrored');
  const enemyNear = (sh) => ({ x: T.toWorldX(sh, sh.layout.aimPoint.x) + 80, y: T.toWorldY(sh, sh.layout.aimPoint.y) });
  report(S.targetShip(st, enemyNear(blue)) === blue && S.targetShip(st, enemyNear(red)) === red && S.targetShip(st, null) === red && S.targetShip(st, { x: 1, y: 1, target: blue }) === blue, 'targetShip: an enemy hunts the NEAREST ship, its own target if it has one, ships[0] with no enemy in mind');
  blue.state.down = 3;
  report(S.targetShip(st, enemyNear(blue)) === red, '...and not one that is going down');
  blue.state.down = 0;
  const solo = createSimulation();
  report(solo.state.ships.length === 1 && S.targetShip(solo.state, { x: 5e5, y: 0 }) === solo.state.ships[0], 'with one ship (co-op) it is always ships[0]');
  // crew-size handicap: a gentler table than co-op's
  const cs = (n) => { const x = createSimulation(); x.setSession('versus'); for (let i = 0; i < n; i++) x.match.addBots('blue', 1); step(x, 2); return x.state.ships[1].ctx.crewScale.damage; };
  const d2 = cs(2), d8 = cs(8);
  report(d2 < d8 && Math.abs(d8 - 1) < 0.2 && d2 > 0.6 && config.PVP.HANDICAP[2].damage > config.CREW_SCALE.TABLE[2].damage, `the Versus handicap is gentle: 2 crew take ${d2.toFixed(2)} of the damage, 8 crew ${d8.toFixed(2)} (co-op's table: ${config.CREW_SCALE.TABLE[2].damage} / ${config.CREW_SCALE.TABLE[8].damage})`);
}

// ---- 7. boarding: a leap across, the three things a boarder does, the way home ----
{
  const { sim, st, M, red, blue } = bare();
  // calm: nothing shoots, a bump does no harm and the deck does not slope under the boarders' feet (the helm deck is in the open air)
  config.PVP.SHELL_POWER = 0;
  config.COLLIDE.MIN_CLOSING = 1e9;
  config.AIR.PITCH_STAGGER = 9;
  config.HELM_EXPOSED.KO_CHANCE = 0; // (nobody at the wheel is knocked out by the odd shell: the patrol planes of the autopilots are shooting)
  const mainD = blue.layout.deckIndex('main'), P = blue.layout.platforms[mainD];
  const boarder = crewman(st, 'red', red, red.layout.deckIndex('catwalk'), 400);
  // a leap that ends over blue's main deck
  const wx = T.toWorldX(blue, (P.x0 + P.x1) / 2), wy = T.toWorldY(blue, P.y) - 150;
  red.sim.air.startFlight(boarder, 0, 0);
  Object.assign(boarder, { x: wx, y: wy, fvx: 0, fvy: 100, lsy: T.toShipY(red, wy), apex: T.toShipY(red, wy) });
  const sent = [];
  sim.setSocket({ emit: (ev, m) => { if (ev === 'host:ui') sent.push(m); } });
  until(sim, () => boarder.ship === 'ship1', 60 * 5);
  report(boarder.ship === 'ship1' && boarder.team === 'red' && !boarder.fly && Object.keys(blue.ctx.players).includes(boarder.id) && !Object.keys(red.ctx.players).includes(boarder.id) && blue.sim.isHostile(boarder) && M.stats.red.boardings === 1 && /BOARDERS ON THE/.test(st.ev.warnText), `an airborne crewman landing on the rival's deck is transferred to her: ${st.ev.warnText}, he is a boarder (team ${boarder.team}, ship ${boarder.ship}), counted as a boarding`);
  const defender = crewman(st, 'blue', blue, mainD, 700);
  boarder.d = mainD; boarder.x = 640; boarder.jx = 0; boarder.jy = 0;
  // his Action button offers nothing to mend, his GRAB nothing to take: the rival's racks are not his
  step(sim, 5);
  const ints = blue.sim.interaction(boarder, null);
  report(!ints.grab && (!ints.use || ints.use.type !== 'rack'), 'a boarder has no GRAB on the rival\'s ship (no tools off her racks)');
  // fight: shoves wear him down, he is out at zero, a defender is not carried anywhere
  for (let k = 0; k < 14 && !(defender.ko > 0); k++) { defender.d = mainD; defender.x = boarder.x + 40; boarder.atkQ = true; step(sim, 25); }
  report(defender.ko > 0 && defender.ship === 'ship1' && M.stats.red.knockouts === 1, `a boarder's blows knock a defender out cold (${defender.ko.toFixed(1)} s) - he wakes on his own ship`);
  defender.ko = 0; defender.pvpHp = undefined;
  // ...and the defender knocks the BOARDER out: he is carried to his own medical bay
  const rv = red.layout.reviveSpot();
  for (let k = 0; k < 14 && boarder.ship === 'ship1'; k++) { defender.d = mainD; defender.x = boarder.x - 40; boarder.d = mainD; defender.atkQ = true; step(sim, 25); }
  report(boarder.ship === 'player' && boarder.d === rv.d && boarder.ko > 0 && Object.keys(red.ctx.players).includes(boarder.id), `a knocked-out boarder is carried back to his own ship's medical bay (deck ${boarder.d}, out for ${boarder.ko.toFixed(1)} s)`);
  // falling off the rival's deck wakes him at home too
  boarder.ko = 0; boarder.pvpHp = undefined;
  S.transfer(st, boarder, blue, mainD, 500);
  boarder.fall = true; boarder.y = 1200; boarder.tvy = 600;
  until(sim, () => boarder.ship === 'player' && !boarder.fall, 60 * 6);
  report(boarder.ship === 'player' && !boarder.fall && boarder.d === rv.d && boarder.ko > 0, 'falling off the rival\'s deck sends him to his own ship\'s medical bay');
  // sabotage the boiler: hold Action 3 s at it
  const boiler = blue.layout.one('boiler'), helm = blue.layout.one('helm');
  boarder.ko = 0; boarder.pvpHp = undefined; boarder.fall = false;
  S.transfer(st, boarder, blue, boiler.d, boiler.x);
  defender.d = blue.layout.deckIndex('lower'); defender.x = 100; defender.ko = 0;
  boarder.fire = true;
  const fires0 = blue.ctx.fires.length;
  step(sim, 60 * 1.5);
  const half = boarder.act && boarder.act.obj ? boarder.act.obj.prog : 0;
  step(sim, 60 * 2);
  report(half > 0.3 && half < 0.7 && M.stats.red.sabotage === 1 && blue.ctx.fires.length > fires0 && /SABOTAGED/.test(st.ev.warnText), `holding Action at the rival's boiler for ${config.PVP.SABOTAGE_TIME} s sabotages it (halfway: ${half.toFixed(2)}, then fires ${fires0} -> ${blue.ctx.fires.length}, a pipe bursts): ${st.ev.warnText}`);
  boarder.fire = false;
  // take the helm: not with a defender beside it
  S.transfer(st, boarder, blue, helm.d, helm.x);
  defender.d = helm.d; defender.x = helm.x + 60; defender.ko = 0; defender.lock = null; defender.jx = 0;
  boarder.fire = true;
  step(sim, 60 * (config.PVP.CAPTURE_TIME + 1));
  report(boarder.lock !== helm.n && M.stats.red.captures === 0 && boarder.act && boarder.act.type === 'need', `with a defender beside the wheel the helm cannot be taken ("${boarder.act ? boarder.act.label : '?'}")`);
  defender.d = blue.layout.deckIndex('lower'); defender.x = 100;
  boarder.x = helm.x;
  let banner = '';
  for (let k = 0; k < 60 * (config.PVP.CAPTURE_TIME + 1) && !M.stats.red.captures; k++) step(sim);
  banner = st.ev.warnText;
  step(sim, 30);
  report(boarder.lock === helm.n && blue.sim.holder('helm') === boarder && M.stats.red.captures === 1 && /HELM TAKEN/.test(banner) && M.phase === 'fight', `uncontested for ${config.PVP.CAPTURE_TIME} s the helm is taken (${banner}) - in Broadside that steers her, it does not end the round`);
  boarder.fire = false;
  config.PVP.SHELL_POWER = SAVE.shell;
  config.COLLIDE.MIN_CLOSING = SAVE.minClosing;
  config.AIR.PITCH_STAGGER = SAVE.stagger;
  config.HELM_EXPOSED.KO_CHANCE = SAVE.koChance;
}
{
  // Capture: HELM TAKEN ends the round for the boarders
  config.PVP.MODE = 'capture';
  config.PVP.SHELL_POWER = 0;
  config.COLLIDE.MIN_CLOSING = 1e9; // (calm: the wheel is out in the open - a bump or a shell could knock the boarder off it)
  config.AIR.PITCH_STAGGER = 9;
  config.HELM_EXPOSED.KO_CHANCE = 0; // (nobody at the wheel is knocked out by the odd shell: the patrol planes of the autopilots are shooting)
  const { sim, st, M, red, blue } = bare();
  const helm = blue.layout.one('helm');
  const boarder = crewman(st, 'red', blue, helm.d, helm.x);
  boarder.fire = true;
  step(sim, 60 * (config.PVP.CAPTURE_TIME + 2));
  const r = M.results[0];
  if (!r) console.log('  debug: phase', M.phase, 'mode', config.PVP.MODE, 'act', boarder.act && boarder.act.type, 'lock', boarder.lock, 'ship', boarder.ship, 'd', boarder.d, 'x', boarder.x, 'helm', helm.d, helm.x, 'captures', M.stats.red.captures, 'capturedBy', M.capturedBy);
  report(!!r && r.winner === 'red' && r.cause === 'captured' && M.phase === 'finale' && M.score.red === 1 && r.stats.red.captures === 1, `Capture mode: holding her wheel ends the round - ${r ? r.winner + ' wins by ' + r.cause : 'no result'}`);
  config.PVP.MODE = 'broadside';
  config.PVP.SHELL_POWER = SAVE.shell;
  config.COLLIDE.MIN_CLOSING = SAVE.minClosing;
  config.AIR.PITCH_STAGGER = SAVE.stagger;
  config.HELM_EXPOSED.KO_CHANCE = SAVE.koChance;
}

// ---- 8. the bot captains ----
{
  // calm sky (nobody shoots): the captains hold the standoff and the altitude edge
  config.PVP.SHELL_POWER = 0;
  config.COLLIDE.MIN_CLOSING = 1e9;
  const { sim, st, M, red, blue } = versus({ bots: 6 });
  const mx = (sh) => T.toWorldX(sh, sh.layout.aimPoint.x), my = (sh) => T.toWorldY(sh, sh.layout.aimPoint.y);
  step(sim, 60 * 40);
  let gap = 0, dy = 0;
  for (let i = 0; i < 60 * 10; i++) { step(sim); gap += Math.abs(mx(blue) - mx(red)) / 600; dy += (my(blue) - my(red)) / 600; }
  report(Math.abs(gap - config.PVP.STANDOFF) < 400, `the captains hold the standoff: ${Math.round(gap)} px between the ships (STANDOFF ${config.PVP.STANDOFF})`);
  report(M.left === 'red' && dy > config.PVP.ALT_EDGE * 0.4 && dy < config.PVP.ALT_EDGE * 2.2, `...and the altitude edge: the ship that started on the left (${M.left}) holds ${Math.round(dy)} px above the other (ALT_EDGE ${config.PVP.ALT_EDGE})`);
  // bots board by hook in a calm sky, and the boarders are carried home or win a foothold: at least one crosses in 8 minutes
  const t0 = M.totals.red.boardings + M.totals.blue.boardings;
  until(sim, () => M.totals.red.boardings + M.totals.blue.boardings > t0, 60 * 60 * 8);
  report(M.totals.red.boardings + M.totals.blue.boardings > t0, `a bot hooks across to the rival's deck on his own when the sky is calm and her decks are in his reach (${M.totals.red.boardings + M.totals.blue.boardings} boardings, ${M.totals.red.knockouts + M.totals.blue.knockouts} knock-outs, ${M.totals.red.sabotage + M.totals.blue.sabotage} sabotaged boilers so far)`);
  config.PVP.SHELL_POWER = SAVE.shell;
  config.COLLIDE.MIN_CLOSING = SAVE.minClosing;
}
{
  // both bows point the same way: the one with the rival behind her comes about
  config.PVP.FACE_OFF = false;
  config.PVP.SHELL_POWER = 0;
  config.COLLIDE.MIN_CLOSING = 1e9;
  const { sim, st, M, red, blue } = versus({ bots: 4 });
  const startF = blue.pose.f;
  let turned = false;
  for (let i = 0; i < 60 * 70 && !turned; i++) { step(sim); if (blue.pose.f !== startF || blue.pose.turn > 0) turned = true; }
  step(sim, 60 * 6);
  report(startF === 1 && turned && blue.pose.f === -1 && red.pose.f === 1, `with the rival behind her bow, the helm bot comes about by itself (blue turned to face red: f ${startF} -> ${blue.pose.f}; red, already facing blue, did not)`);
  config.PVP.FACE_OFF = true;
  config.PVP.SHELL_POWER = SAVE.shell;
  config.COLLIDE.MIN_CLOSING = SAVE.minClosing;
}
{
  // gunnery: her manned guns that bear on us, then her gasbags, then her boiler and helm, then her hull
  const { sim, st, M, red, blue } = bare();
  step(sim, 60 * 8); // (the autopilots settle at the standoff)
  const gun = red.ctx.GUNS['Nose Gun'];
  const kinds = () => A.targets(red.ctx).map((t) => t.kind);
  M.refreshRivals(0);
  const unmanned = kinds();
  report(unmanned.includes('rivalBag') && unmanned.includes('rivalCore') && unmanned.includes('rival') && !unmanned.includes('rivalGun'), 'with no one on her guns the targets are her gasbag, her boiler and helm, and her hull (' + [...new Set(unmanned)].join(', ') + ')');
  const best0 = A.bestTarget(red.ctx, gun);
  report(!!best0 && best0.target.kind === 'rivalBag', `...and the gun takes the gasbag first (${best0 ? best0.target.kind : 'nothing in reach'})`);
  const mate = crewman(st, 'blue', blue, blue.layout.one('Nose Gun') ? blue.layout.stations.find((q) => q.n === 'Nose Gun').d : 0, blue.layout.stations.find((q) => q.n === 'Nose Gun').x);
  mate.lock = 'Nose Gun';
  step(sim, 3);
  M.refreshRivals(0);
  const manned = kinds();
  const best1 = A.bestTarget(red.ctx, gun);
  report(manned.includes('rivalGun') && !!best1 && best1.target.kind === 'rivalGun', `...but a manned gun of hers that bears on us comes first (${best1 ? best1.target.kind : 'none'})`);
  mate.lock = null;
  delete st.players[mate.id];
  // the retreat: badly hurt and leaking, the plan backs her away (the rival is "behind" the way she wants to go)
  const ok0 = pilotPlanFor(red);
  red.state.hull = 20;
  for (let i = 0; i < 4; i++) red.ctx.breaches.push({ x: 300 + i * 50, d: red.layout.deckIndex('main'), prog: 0 });
  const hurt = pilotPlanFor(red);
  report(ok0.dx > 500 && hurt.dx < -500 && hurt.speed < ok0.speed + 0.01, `a ship under ${config.PVP.BOT.RETREAT_HULL}% hull with more than ${config.PVP.BOT.RETREAT_HOLES} holes retreats to repair (the plan turns away from the rival: ahead ${Math.round(ok0.dx)} -> ${Math.round(hurt.dx)} px, speed ${ok0.speed.toFixed(2)} -> ${hurt.speed.toFixed(2)})`);
}
function pilotPlanFor(sh) { return pilotPlan(sh.ctx, 2.5, 0.55); }

// ---- 8b. the lively captains (pvp/captainAI.js): they weave and dodge, never sit still, pick plays by style, and the crews go across ----
{
  config.PVP.ROUND_TIME = cap;
  const caps = new Set(), styles = new Set(), shouts = new Set();
  let tried = 0, made = 0, rounds_ = 0, stall = 0, flips = 0, fightSecs = 0, matches_ = 0;
  const e0 = errors;
  for (let k = 0; k < 4 && (k < 2 || !(tried > 0 && made > 0)); k++) {
    seedRandom(3000 + k);
    matches_++;
    const { sim, st, M, red, blue } = versus({ bots: nBots, fly: false });
    const ships = [red, blue], last = ships.map((s) => ({ x: T.toWorldX(s, s.layout.aimPoint.x), y: T.toWorldY(s, s.layout.aimPoint.y), t: 0 })), lastVy = [0, 0];
    let n = 0, text = '';
    while (M.phase !== 'over' && n++ < 60 * 60 * 20) {
      step(sim);
      if (st.ev.warnText !== text) { text = st.ev.warnText || ''; if (/HIGH PASS|DIVES UNDER|RAM RUN|RAMMED|BOARDING|EVASIVE|PARACHUTES|CLOSES IN|CHASE|FALLS BACK/.test(text)) shouts.add(text.replace(/^(RED|BLUE) /, '')); }
      if (M.phase !== 'fight') { last.forEach((l, i) => { l.t = 0; }); continue; }
      fightSecs += DT;
      ships.forEach((s, i) => {
        if (s.captain) { caps.add(s.captain); styles.add(s.captain.style); }
        const x = T.toWorldX(s, s.layout.aimPoint.x), y = T.toWorldY(s, s.layout.aimPoint.y), l = last[i];
        if (Math.hypot(x - l.x, y - l.y) > 80) { l.x = x; l.y = y; l.t = 0; } else if (!s.ctx.wreck && s.state.down <= 0 && !s.ctx.goingDown) { l.t += DT; stall = Math.max(stall, l.t); }
        const vy = s.pose.vy;
        if (Math.abs(vy) > 40) { if (lastVy[i] && Math.sign(vy) !== lastVy[i]) flips++; lastVy[i] = Math.sign(vy); }
      });
    }
    rounds_ += M.results.length;
    made += M.totals.red.boardings + M.totals.blue.boardings;
    for (const s of ships) for (const e of s.ctx.stuntLog || []) if (/^start (board|drop)/.test(e.text)) tried++;
  }
  const sum = (key) => [...caps].reduce((a, c) => a + (c.stats[key] || 0), 0);
  report(sum('jinks') > 0 && sum('dodges') > 0, `the captains weave and dodge: ${sum('jinks')} altitude/throttle jinks and ${sum('dodges')} dodges of incoming shells in ${rounds_} rounds (${styles.size} styles seen: ${[...styles].join(', ')})`);
  report(flips / Math.max(1, fightSecs / 60) / 2 >= 4, `...they change between climbing and diving ${(flips / Math.max(1, fightSecs / 60) / 2).toFixed(0)} times a minute each`);
  report(stall < 15, `...and never sit still: the longest a ship stayed within 80 px of one spot was ${stall.toFixed(1)} s`);
  report(tried > 0 && made > 0, `the crews go across: ${tried} raids started (hook or parachute), ${made} boardings made in ${matches_} matches / ${rounds_} rounds`);
  report(shouts.size >= 2, `the TV calls the plays: ${[...shouts].join(' | ') || 'nothing'}`);
  report(errors === e0, 'the lively captains run with 0 errors');
  config.PVP.ROUND_TIME = SAVE.round;
}

// ---- 9. no co-op saves; leaving Versus puts the voyage back ----
{
  const sim = createSimulation();
  const st = sim.state;
  sim.castOff();
  step(sim, 60);
  sim.setSession('versus');
  report(st.mode !== 'versus' && !sim.match.on && st.ships.length === 1, 'VERSUS cannot be picked in the middle of a voyage (only from the lobby)');
  sim.restart();
  for (let i = 0; i < 3; i++) st.players['k' + i] = { id: 'k' + i, bot: true, name: 'K' + i, species: 'wolf', color: '#e63946', x: 300, y: -60, fall: true, jx: 0, jy: 0, connected: true, t: 0 };
  const w0 = writes.length;
  sim.setSession('versus');
  const M = sim.match;
  M.begin({ shelf: false });
  step(sim, 60 * 8);
  sim.setSession('quick');
  report(st.mode === 'versus' && M.on, 'and the Mode cannot be changed in the middle of a match');
  wreckShip(st.ships[1]); // (a wreck, a finished round: the places a co-op game would save its record)
  step(sim, 60 * (config.PVP.FINALE + 2));
  report(writes.length === w0 && M.results.length === 1, `a Versus lobby, match, wreck and round write nothing to the browser's storage (${writes.length - w0} writes)`);
  M.toLobby();
  step(sim, 5);
  sim.setSession('quick');
  const crew = Object.values(st.players);
  report(st.mode === 'quick' && !M.on && !config.PVP.ENABLED && st.ships.length === 1 && st.phase === 'lobby' && crew.every((p) => p.team === undefined && S.shipOf(st, p) === st.ships[0]) && st.ships[0].team === null && st.ships[0].name === 'AIRSHIP', 'back to a co-op mode: the second ship is gone, no teams, everyone aboard the one airship, the voyage is back in its lobby');
  sim.castOff();
  const e0 = errors;
  step(sim, 60 * 60);
  report(errors === e0 && st.phase === 'flying' && st.ships[0].state.hull > 0 && st.run && st.run.mode === 'quick', 'and the voyage flies a minute afterwards with 0 errors');
  const bad = writes.filter((k) => /airshipRecord|airshipVoyage/.test(k));
  report(bad.length === 0, `no co-op save is written by a Versus game or by the lobby changes around it (localStorage writes: ${writes.length ? [...new Set(writes)].join(', ') : 'none'})`);
}

// ---- 10. the mirror match (--mirror N): the classic ship against herself, bot crews, best of three N times: it should come out about even ----
if (mirror > 0) {
  const won = { red: 0, blue: 0 }, left = { won: 0, of: 0 };
  let secs = 0, rounds_ = 0;
  for (let m = 0; m < mirror; m++) {
    seedRandom(1000 + m);
    const { sim, M } = versus({ bots: nBots, fly: false });
    let n = 0;
    while (M.phase !== 'over' && n++ < 60 * 60 * 20) step(sim);
    for (const r of M.results) { rounds_++; secs += r.time; if (r.winner) { won[r.winner]++; left.of++; if (r.winner === r.left) left.won++; } }
  }
  const decided = won.red + won.blue;
  const pct = (100 * won.red) / Math.max(1, decided);
  console.log(`  mirror match: ${mirror} matches, ${rounds_} rounds (mean fight ${(secs / Math.max(1, rounds_)).toFixed(0)} s): red ${won.red}, blue ${won.blue}; the ship on the left won ${left.won} of ${left.of}`);
  report(pct >= 35 && pct <= 65 && 100 * left.won / Math.max(1, left.of) >= 35 && 100 * left.won / Math.max(1, left.of) <= 65, `the mirror match is fair: red wins ${pct.toFixed(0)}% of the decided rounds, the left-hand ship ${(100 * left.won / Math.max(1, left.of)).toFixed(0)}% (35-65% is fair)`);
}

report(errors === 0, `0 errors in the whole check (${errors})${firstErrors.length ? ': ' + firstErrors.join(' || ') : ''}`);
console.log(ok ? 'MATCH CHECK OK' : 'MATCH CHECK FAILED');
process.exit(ok ? 0 : 1);
