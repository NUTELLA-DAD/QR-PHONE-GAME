// GUNSHIP PARITY (MOVEMENT.md B.5): the enemy gunship as a Ship against the old offset-from-our-ship gunship, over the same blueprints, with the same bot crew.
//   node tools/gunship-parity.mjs [--runs 12] [--minutes 4] [--seed 1] [--mission 2] [--bots 8] [--difficulty normal] [--map open] [--mode ship|old|both]
//
// Each run: a co-op ship with bot crew flies a mission; 20 s in, a gunship made from blueprint seed (100 + run) is spawned (config.GUNSHIP.AS_SHIP off = the old gunship, on = the Ship), and the run
// carries on until she is gone or the time is up. Per run it prints how she ended (shot down, blown up or captured by boarders, fled, left, still there), how long she was alive, what she did
// to us (hull lost, cannonballs, raiders sent, paratroopers), what we did to her (gun ports shot out) and how many of our crew boarded her. `both` prints the two side by side and checks
// the means of the Ship against the old gunship's within the bands in BANDS (the parity gate; tools/buildsim.mjs --check-gunship-ship runs it).
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const args = { runs: 12, minutes: 4, seed: 1, mission: 2, bots: 8, difficulty: 'normal', map: 'open', mode: 'both', child: 0, quiet: 0, ship: 0 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--') && a.slice(2) in args) { const v = argv[++i]; args[a.slice(2)] = typeof args[a.slice(2)] === 'number' ? Number(v) : v; }
  else { console.error('Unknown option ' + a); process.exit(2); }
}

// The bands the Ship's means must stay in against the old gunship's (ratio new / old, or an absolute spread), tuned from 24 runs each; see MOVEMENT.md B.5.
export const BANDS = {
  alive: [0.6, 1.6], // seconds she lives, ratio
  sunk: 0.35, // share of runs that end with her shot down or blown up, absolute difference
  hullLoss: [0.4, 2.0], // our hull lost, ratio
  shots: [0.35, 2.5], // her cannonballs, ratio
  boardings: [0.0, 3.0], // our crew boarding her, ratio (both can be small)
};

async function runOne(mode, run) {
  installShims();
  const clock = seedRandom(args.seed + run);
  const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
  const { config } = await load('config.js');
  config.GUNSHIP.AS_SHIP = mode === 'ship';
  config.MAPS.FORCE_KIND = args.map;
  config.PACING.GUNSHIP_FIRST = 1e9; // (the director would send one of its own: this run sends exactly one)
  const { createSimulation } = await load('modules/host/simulation.js');
  const sim = createSimulation();
  const state = sim.state;
  state.difficulty = args.difficulty;
  const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
  for (let i = 0; i < args.bots; i++) {
    const e = state.ships[0].layout.boarderEntryPoints;
    const id = 'bot' + Math.random();
    state.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % 6], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  const dt = 1 / 60;
  const out = { mode, run, spawned: false, endedBy: 'none', alive: 0, hullLoss: 0, shots: 0, sent: 0, dropped: 0, portsDown: 0, boardings: 0, latches: 0, kills: 0, errors: 0, strafes: 0, retreats: 0, minHull: 100, hunt: 0, canFire: 0, rope: 0 };
  let spawnAt = null, lastHull = 100, aboard = new Set(), tries = 0, last = null, errs = new Map();
  for (let step = 1; step <= Math.round(args.minutes * 3600); step++) {
    clock.ms += dt * 1000;
    try {
      if (spawnAt === null && step >= 1200 && step % 30 === 0 && state.phase === 'flying') {
        tries++;
        if (sim.gunship.spawn({ seed: 100 + run, mission: args.mission })) { spawnAt = step; out.spawned = true; lastHull = state.ship.hull; out.kills = -state.kills; }
      }
      sim.update(dt);
    } catch (e) {
      out.errors++;
      const m = String(e && e.stack).split('\n').slice(0, process.env.STACK ? 9 : 3).map((s) => s.trim().replace(/file:\/\/\/[^)]*\//g, '')).join(' | ');
      if (errs.size < 3) errs.set(m, 1);
    }
    if (spawnAt === null) continue;
    const g = state.gunship;
    if (process.env.DBG_DMG && g && g.ship && !g.ship.dbgWrapped) { // (--debug: where her hull went: our shells, the rest)
      const h = g.ship; h.dbgWrapped = true; out.dmg = { shell: 0, n: 0, other: 0, collide: 0, rock: 0 };
      const orig = h.sim.impact;
      h.sim.impact = (x, y, p) => { const b = h.state.hull; orig(x, y, p); const d = Math.max(0, b - h.state.hull); const who = new Error().stack.split('\n')[2]; if (/hitByShells/.test(who)) { out.dmg.shell += d; out.dmg.n++; } else if (/shipCollide/.test(who)) out.dmg.collide += d; else out.dmg.rock += d; };
      out.hull0 = h.state.hull;
    }
    if (out.dmg && g) { out.dmg.total = (out.dmg.total || 0); out.dmg.last = g.ship.state.hull; }
    if (process.env.DBG_REG && g && g.ship) { const odd = Object.values(g.ship.crewReg).filter((c) => !c.enemy); if (odd.length) console.log('ODD in crewReg at', step, odd.map((c) => c.id + ' ship ' + c.ship)); const lost = Object.values(g.ship.ctx.players).filter((c) => !c.enemy && c.ship !== 'gunship'); if (lost.length) console.log('FOREIGN in her ctx at', step, lost.map((c) => c.id + ' ship ' + c.ship + ' d ' + c.d)); }
    if (g) {
      last = g;
      if (g.phase === 'leaving' && !out.why) out.why = String(state.ev.warnText || '').replace(/^THE GUNSHIP /, '').slice(0, 24);
      out.hunt += g.phase === 'hunt' || g.phase === 'latch' ? dt : 0;
      out.canFire += g.canFire ? dt : 0;
      out.rope += g.rope ? dt : 0;
      for (const p of Object.values(state.players)) {
        const on = !!p.onGunship || p.ship === 'gunship';
        if (on && !aboard.has(p.id)) { aboard.add(p.id); out.boardings++; }
        if (!on) aboard.delete(p.id);
      }
    }
    if (state.ship.hull < lastHull) out.hullLoss += lastHull - state.ship.hull;
    lastHull = state.ship.hull;
    out.minHull = Math.min(out.minHull, state.ship.hull);
    if (!g && last) {
      out.endedBy = last.phase === 'sinking' ? (last.charge || last.captured ? 'boarded' : 'shot') : last.phase === 'leaving' ? 'fled' : 'left';
      break;
    }
    if (g) out.alive = (step - spawnAt) / 60;
  }
  if (last) {
    const S = state.gsStats;
    Object.assign(out, { shots: S.shots, sent: S.sent, dropped: S.dropped, portsDown: S.portsDown, latches: S.latches, strafes: S.strafes, retreats: S.retreats });
    if (out.endedBy === 'none') out.endedBy = 'timeout';
  }
  out.kills += state.kills;
  out.errMsgs = [...errs.keys()];
  return out;
}

if (args.child) {
  const r = await runOne(args.mode, args.ship);
  console.log('RESULT ' + JSON.stringify(r));
  process.exit(0);
}

const here = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const child = (mode, run) => new Promise((res) => {
  const a = [here, '--child', '1', '--mode', mode, '--ship', String(run), '--runs', String(args.runs), '--minutes', String(args.minutes), '--seed', String(args.seed), '--mission', String(args.mission), '--bots', String(args.bots), '--difficulty', args.difficulty, '--map', args.map];
  const c = spawn(process.execPath, a);
  let o = '';
  c.stdout.on('data', (d) => (o += d));
  c.stderr.on('data', (d) => (o += d));
  c.on('close', () => { const l = o.split('\n').find((x) => x.startsWith('RESULT ')); res(l ? JSON.parse(l.slice(7)) : { mode, run, error: o.slice(-400) }); });
});
async function many(mode) {
  const rows = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (next < args.runs) { const r = next++; rows[r] = await child(mode, r); } }));
  return rows;
}
const mean = (rows, k) => rows.reduce((a, r) => a + (r[k] || 0), 0) / Math.max(1, rows.length);
const share = (rows, f) => rows.filter(f).length / Math.max(1, rows.length);
const summary = (rows) => {
  const ok = rows.filter((r) => r.spawned && !r.error);
  const ends = {};
  for (const r of ok) ends[r.endedBy] = (ends[r.endedBy] || 0) + 1;
  return { n: ok.length, alive: mean(ok, 'alive'), hullLoss: mean(ok, 'hullLoss'), shots: mean(ok, 'shots'), sent: mean(ok, 'sent'), dropped: mean(ok, 'dropped'), portsDown: mean(ok, 'portsDown'), boardings: mean(ok, 'boardings'), latches: mean(ok, 'latches'), kills: mean(ok, 'kills'), strafes: mean(ok, 'strafes'), retreats: mean(ok, 'retreats'), canFire: mean(ok, 'canFire'), errors: ok.reduce((a, r) => a + r.errors, 0) + rows.filter((r) => r.error).length, sunk: share(ok, (r) => r.endedBy === 'shot' || r.endedBy === 'boarded'), ends };
};
const line = (name, s) => `${name.padEnd(5)} n ${s.n}  alive ${s.alive.toFixed(0)}s  ended ${JSON.stringify(s.ends)}  hull lost ${s.hullLoss.toFixed(1)}  balls ${s.shots.toFixed(1)}  firing ${s.canFire.toFixed(0)}s  ports down ${s.portsDown.toFixed(1)}  strafes ${s.strafes.toFixed(1)}  retreats ${s.retreats.toFixed(1)}  latches ${s.latches.toFixed(1)}  raiders sent ${s.sent.toFixed(1)}  paras ${s.dropped.toFixed(1)}  boardings ${s.boardings.toFixed(1)}  kills ${s.kills.toFixed(1)}  errors ${s.errors}`;

const modes = args.mode === 'both' ? ['old', 'ship'] : [args.mode];
const sums = {};
for (const m of modes) {
  const rows = await many(m);
  sums[m] = summary(rows);
  if (!args.quiet) for (const r of rows) console.log(`${m} run ${String(r.run).padStart(2)}: ${r.error ? 'ERROR ' + r.error : `${r.spawned ? r.endedBy + (r.why ? ' (' + r.why + ')' : '') : 'NO SPAWN'} alive ${r.alive.toFixed(0)}s hull lost ${r.hullLoss.toFixed(0)} balls ${r.shots} ports ${r.portsDown} sent ${r.sent} paras ${r.dropped} boardings ${r.boardings} errors ${r.errors}${r.errMsgs && r.errMsgs.length ? ' ' + r.errMsgs[0] : ''}`}`);
  console.log(line(m, sums[m]));
}
let ok = true;
if (args.mode === 'both') {
  const o = sums.old, s = sums.ship;
  const ratio = (a, b) => (b > 0 ? a / b : a > 0 ? Infinity : 1);
  const check = (name, good, text) => { console.log((good ? 'PASS ' : 'FAIL ') + name + ': ' + text); if (!good) ok = false; };
  const inBand = (r, b) => r >= b[0] && r <= b[1];
  check('time alive', inBand(ratio(s.alive, o.alive), BANDS.alive), `${s.alive.toFixed(0)}s vs ${o.alive.toFixed(0)}s (x${ratio(s.alive, o.alive).toFixed(2)}, band ${BANDS.alive.join('-')})`);
  check('sunk share', Math.abs(s.sunk - o.sunk) <= BANDS.sunk, `${(100 * s.sunk).toFixed(0)}% vs ${(100 * o.sunk).toFixed(0)}% (band +-${100 * BANDS.sunk}%)`);
  check('our hull lost', inBand(ratio(s.hullLoss, o.hullLoss), BANDS.hullLoss), `${s.hullLoss.toFixed(1)} vs ${o.hullLoss.toFixed(1)} (x${ratio(s.hullLoss, o.hullLoss).toFixed(2)}, band ${BANDS.hullLoss.join('-')})`);
  check('her cannonballs', inBand(ratio(s.shots, o.shots), BANDS.shots), `${s.shots.toFixed(1)} vs ${o.shots.toFixed(1)} (x${ratio(s.shots, o.shots).toFixed(2)}, band ${BANDS.shots.join('-')})`);
  check('crew boarding her', s.boardings >= 0 && (o.boardings === 0 || s.boardings > 0), `${s.boardings.toFixed(1)} vs ${o.boardings.toFixed(1)} per run`);
  check('no errors', s.errors === 0 && o.errors === 0, `${s.errors} (ship), ${o.errors} (old)`);
}
process.exit(ok ? 0 : 1);
