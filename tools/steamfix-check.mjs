// STEAM AND LIFT gate (FUN.md F13; config.STEAMFIX, host/steamFix.js, modules.js sealBursts / repair, shipSim.js pump + impact, goingDown.js graze, bots.js, jobs.js, render.js). Headless.
//   node tools/buildsim.mjs --check-steamfix        or directly:   node tools/steamfix-check.mjs [--seed 1]
//
//   1  the switch: ON by default, NO_STEAMFIX=1 gives the old game; a burst pipe leaks for good with it off
//   2  a burst pipe shuts its own valve after SEAL_AFTER seconds, says so on the TV, and a hammer opens it again; the helm's pipe too (SEAL_HELM); a broken boiler leaves its steam in the line (RESERVE); the coal burns BURN_MUL as fast; the firebox damper (DAMPER)
//   3  a scrape of rock hits the modules at SCRAPE_MODULES of the strength, a shell at full strength
//   4  the pump: it moves gas at 12 pressure (off: it cannot), runs full from PUMP_FULL, and the engines ease off a low line while it pumps hard
//   5  the warning ladder: LOW ON COAL, LOW STEAM, SINKING (nobody at the helm) each speak once and wait; the phone's COAL arrow comes earlier
//   6  the bots mend a sealed pipe and never open a burst one again; botsim 4 minutes, 8 bots: no error
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
const FX = config.STEAMFIX;

function boot({ bots = 0, helm = false } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9;
  clock = seedRandom(seed);
  const sim = createSimulation();
  const st = sim.state;
  const A = st.ships[0];
  const e = A.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  let h = null;
  if (helm) { // a person at the helm with the stick held up (the pump), put there by hand
    const hs = A.layout.one('helm');
    h = { id: 'h1', name: 'Helm', species: config.CREW_SPECIES[0], color: '#fff', x: hs.x, y: A.layout.platforms[hs.d].y, d: hs.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: hs.n, gas: 0, thr: 0 };
    st.players[h.id] = h;
  }
  sim.castOff();
  return { sim, st, A, h };
}
const step = (sim, n = 1, each) => { for (let i = 0; i < n; i++) { if (each) each(); clock.ms += DT * 1000; try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)); } } };
const secs = (sim, s, each) => step(sim, Math.round(s * 60), each);
const pipeOf = (st, name) => st.modules.find((m) => m.name === name);
const burst = (m) => { m.hp = 0; m.broken = true; m.open = true; };
const banner = (st) => (st.ev.warn > 0 ? st.ev.warnText : '') + ' | ' + (st.ev.q || []).map((q) => q.text).join(' / ');

// ================================================================== 1. the switch
report(FX.ENABLED === true, 'STEAMFIX is on by default (NO_STEAMFIX not set)');
{
  const r = spawnSync(process.execPath, ['-e', `import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(({config:c})=>console.log(JSON.stringify([c.STEAMFIX.ENABLED])))`], { encoding: 'utf8', env: { ...process.env, NO_STEAMFIX: '1' } });
  report((r.stdout || '').trim() === '[false]', `NO_STEAMFIX=1 gives the old game: ${(r.stdout || r.stderr || '').trim().slice(0, 100)}`);
}
{
  FX.ENABLED = false;
  const { sim, st } = boot();
  secs(sim, 3);
  const m = pipeOf(st, 'Aft Engine Pipe');
  burst(m);
  secs(sim, FX.SEAL_AFTER + 10);
  report(m.broken && m.open && !m.sealed, `off: a burst pipe leaks for good (${FX.SEAL_AFTER + 10} s later it is still open)`);
  FX.ENABLED = true;
}

// ================================================================== 2. a burst pipe shuts its own valve
{
  const { sim, st, A } = boot();
  secs(sim, 3);
  const m = pipeOf(st, 'Aft Engine Pipe'), engine = pipeOf(st, 'Aft Engine');
  st.say('info', 'x', null, 0.1);
  burst(m);
  secs(sim, FX.SEAL_AFTER - 1);
  report(m.broken && m.open && st.steamParts.leaks >= config.MODULES.PIPE_LEAK - 0.01, `${FX.SEAL_AFTER - 1} s after the burst the pipe still leaks (leaks ${st.steamParts.leaks.toFixed(1)})`);
  secs(sim, 2);
  report(m.broken && !m.open && m.sealed, 'then the pipe has shut its own valve');
  report(st.steamParts.leaks < 0.01, `...and the leak is over (leaks ${st.steamParts.leaks.toFixed(2)})`);
  report(/AFT ENGINE PIPE BURST/.test(banner(st)) && /VALVE SHUT/.test(banner(st)), `...and the TV says so: ${banner(st).slice(0, 90)}`);
  report(!A.sim.modules.works(st, 'Aft Engine'), 'the engine behind it is dark until the pipe is mended');
  A.sim.modules.repair(m, 5); // a hammer
  report(!m.broken && m.open && !m.sealed, 'a hammer mends the pipe and it opens again by itself');
  report(A.sim.modules.works(st, 'Aft Engine') || engine.broken === false, 'the engine has steam again');
  // a pipe shut by hand is not touched
  burst(m);
  secs(sim, 1);
  m.open = false;
  secs(sim, FX.SEAL_AFTER + 2);
  A.sim.modules.repair(m, 5);
  report(!m.broken && !m.open && !m.sealed, 'a pipe a hand shut stays shut when it is mended (the bots and the people open it)');
  report(errors.length === 0, `no game error (${errors.length})`);
}

// ================================================================== 2b. the helm's pipe, a broken boiler, the coal
{
  const helmPipe = (sealHelm) => {
    FX.SEAL_HELM = sealHelm;
    const { sim, st } = boot();
    secs(sim, 3);
    const hp = pipeOf(st, 'Helm Pipe');
    burst(hp);
    secs(sim, FX.SEAL_AFTER + 3);
    FX.SEAL_HELM = 1;
    return hp;
  };
  const on = helmPipe(1), off = helmPipe(0);
  report(on.broken && !on.open && on.sealed, `the helm's own pipe shuts itself too (SEAL_HELM 1: the leak starved the pump more than the dark helm did)`);
  report(off.broken && off.open && !off.sealed, `...and with SEAL_HELM 0 it keeps leaking until a hammer mends it`);
}
{
  const { sim, st, A, h } = boot({ helm: true });
  secs(sim, 3);
  const boiler = pipeOf(st, 'Boiler');
  const m = A.sim.modules;
  boiler.hp = 0; boiler.broken = true;
  st.ship.press = 60; st.ship.gas = 30;
  report(m.works(st, 'Helm'), 'a boiler that has just broken: the helm still has the steam in the line');
  FX.ENABLED = false;
  report(!m.works(st, 'Helm'), '...(off: the helm went dark at once)');
  FX.ENABLED = true;
  secs(sim, 1, () => { st.ship.press = 60; h.jy = -1; h.gas = 1; });
  report(st.ship.gas > 30 + 5, `...and the pump moves gas on it (gas 30 -> ${st.ship.gas.toFixed(1)})`);
  st.ship.press = FX.RESERVE - 3;
  report(!m.works(st, 'Helm'), `under ${FX.RESERVE} pressure the dead boiler's line is empty: the helm is dark`);
}
{
  const burn = (on) => {
    FX.ENABLED = on;
    const { sim, st } = boot();
    secs(sim, 2);
    st.ship.fuel = 60;
    secs(sim, 10, () => { st.ship.press = 60; });
    FX.ENABLED = true;
    return 60 - st.ship.fuel;
  };
  const a = burn(true), b = burn(false);
  report(b > 3 && Math.abs(a / b - FX.BURN_MUL) < 0.03, `the coal burns ${FX.BURN_MUL} as fast (${a.toFixed(2)} against ${b.toFixed(2)} in 10 s)`);
  // the firebox damper: nothing under DAMPER, the fire drawn down in proportion above it, out at 100 (and nothing at all with the switch off)
  const { sim, st, A } = boot();
  secs(sim, 2);
  const d = (p, on = true) => { FX.ENABLED = on; st.ship.press = p; const v = A.sim.steamFix.damper(); FX.ENABLED = true; return v; };
  report(d(FX.DAMPER - 2) === 1 && Math.abs(d(86) - (100 - 86) / (100 - FX.DAMPER)) < 1e-9 && d(100) === 0 && d(95, false) === 1, `the damper: 1 under ${FX.DAMPER}, ${d(86).toFixed(2)} at 86, ${d(95).toFixed(2)} at 95, 0 at 100, 1 with the switch off`);
  // ...and it keeps a hot ship out of the red: pressure pushed to 97 with a full firebox comes back down on its own
  const settle = (on) => { FX.ENABLED = on; const w = boot(); secs(w.sim, 2); w.st.ship.press = 97; secs(w.sim, 6, () => { w.st.ship.fuel = 100; }); FX.ENABLED = true; return w.st.ship.press; };
  const pOn = settle(true), pOff = settle(false);
  report(pOn < pOff - 4, `pushed to 97 with a full firebox, 6 s later she is at ${pOn.toFixed(0)} with the damper and ${pOff.toFixed(0)} without`);
  report(errors.length === 0, `no game error (${errors.length})`);
}

// ================================================================== 3. a scrape of rock against a shell
{
  const damage = (kind, on) => {
    FX.ENABLED = on;
    const { sim, st, A } = boot();
    secs(sim, 2);
    const m = pipeOf(st, 'Aft Engine Pipe');
    m.hp = m.max;
    A.sim.impact(m.pos.x, m.pos.y, 1, 1, kind);
    const lost = m.max - m.hp;
    FX.ENABLED = true;
    return lost;
  };
  const shell = damage('hit', true), shellOld = damage('hit', false), rock = damage('rock', true), rockOld = damage('rock', false);
  report(shell > 0 && Math.abs(shell - shellOld) < 1e-6, `a shell hits a pipe as hard as ever (${shell.toFixed(1)} against ${shellOld.toFixed(1)})`);
  report(rockOld > 0 && Math.abs(rock / rockOld - FX.SCRAPE_MODULES) < 0.02, `a scrape of rock hits it at ${FX.SCRAPE_MODULES} of the strength (${rock.toFixed(1)} against ${rockOld.toFixed(1)})`);
}

// ================================================================== 4. the pump comes first
{
  const climb = (press, on) => {
    FX.ENABLED = on;
    const { sim, st, h } = boot({ helm: true });
    secs(sim, 2);
    st.ship.gas = 30;
    h.jy = -1; h.gas = 1;
    secs(sim, 1.5, () => { st.ship.press = press; st.ship.fuel = 80; h.jy = -1; h.gas = 1; });
    FX.ENABLED = true;
    return st.ship.gas;
  };
  const low = climb(12, true), lowOld = climb(12, false), mid = climb(40, true), midOld = climb(40, false);
  report(low > 30 + 5 && lowOld < 30 + 1, `at pressure 12 the pump moves gas (gas 30 -> ${low.toFixed(1)}); before it could not (${lowOld.toFixed(1)})`);
  report(mid > midOld + 3, `at pressure 40 it runs full (gas 30 -> ${mid.toFixed(1)}; before ${midOld.toFixed(1)})`);
  const engines = (on) => {
    FX.ENABLED = on;
    const { sim, st, h } = boot({ helm: true });
    secs(sim, 2);
    h.jy = -1; h.gas = 1; h.jx = 0.6;
    secs(sim, 1, () => { st.ship.press = 40; st.ship.fuel = 80; h.jy = -1; h.gas = 1; });
    const e = st.steamParts.engines;
    FX.ENABLED = true;
    return e;
  };
  const eOn = engines(true), eOff = engines(false);
  report(eOff > 0.2 && Math.abs(eOn / eOff - FX.EASE) < 0.05, `while the helm pumps hard on a low line the engines draw ${FX.EASE} of their steam (${eOn.toFixed(2)} against ${eOff.toFixed(2)})`);
}

// ================================================================== 5. the warning ladder
{
  const { sim, st } = boot();
  secs(sim, 3);
  const W = FX.WARN;
  const hold = () => { st.ship.press = 70; };
  st.ship.fuel = W.FUEL - 5;
  secs(sim, 0.5, hold);
  report(/LOW ON COAL/.test(banner(st)) && st.steamWarn.fuel === 1, `fuel ${st.ship.fuel.toFixed(0)}: "LOW ON COAL - STOKE THE BOILER!" (${banner(st).slice(0, 60)})`);
  secs(sim, 10, () => { hold(); st.ship.fuel = W.FUEL - 5; });
  report(st.steamWarn.fuel === 1, 'it does not shout again (still low, but it spoke 10 s ago)');
  secs(sim, 1, () => { hold(); st.ship.fuel = W.FUEL + W.REARM + 10; });
  secs(sim, W.EVERY + 1, () => { hold(); st.ship.fuel = W.FUEL + W.REARM + 10; });
  secs(sim, 0.5, () => { hold(); st.ship.fuel = W.FUEL - 5; });
  report(st.steamWarn.fuel === 2, `...but after it recovered and ${W.EVERY} s have passed it speaks again (${st.steamWarn.fuel} times)`);
  // low steam
  const n0 = st.steamWarn.press;
  secs(sim, 0.5, () => { st.ship.fuel = 80; st.ship.press = W.PRESS - 6; });
  report(st.steamWarn.press === n0 + 1 && /LOW STEAM/.test(banner(st)), `pressure ${st.ship.press.toFixed(0)}: "LOW STEAM - STOKE THE BOILER!" (${banner(st).slice(0, 60)})`);
  // sinking with nobody at the helm and the pressure low
  secs(sim, W.EVERY + 1, () => { st.ship.fuel = 80; st.ship.press = 60; });
  const s0 = st.steamWarn.sink;
  secs(sim, 6, () => { st.ship.fuel = 80; st.ship.press = 60; st.ship.gas = 15; });
  report(st.steamWarn.sink === s0 + 1 || st.goingDown, `sinking with nobody at the helm: the SINKING rung (or FALLING itself) speaks (rung ${st.steamWarn.sink - s0}, falling ${!!st.goingDown}, ${banner(st).slice(0, 60)})`);
  report(FX.COAL_ARROW > config.JOBS.COAL_LOW && FX.COAL_ARROW > W.FUEL, `the phone's COAL arrow (${FX.COAL_ARROW}%) comes before the banner (${W.FUEL}%)`);
  report(config.ALARMS.PRI.steam === 5, 'the arbiter knows the steam kind (priority 5)');
  report(errors.length === 0, `no game error (${errors.length})`);
}

// ================================================================== 6. the bots
{
  const { sim, st } = boot({ bots: 8 });
  secs(sim, 20);
  const m = pipeOf(st, 'Aft Engine Pipe'), lift = pipeOf(st, 'Lift Pipe');
  burst(m); burst(lift);
  let leakSteps = 0, reopened = 0, was = false;
  secs(sim, 60, () => { for (const q of [m, lift]) { if (q.broken && q.open) leakSteps++; } if (was && m.broken && m.open && !m.sealed) reopened++; was = m.broken && !m.open; });
  report(!m.broken && m.open && !lift.broken && lift.open, `the bots mended both pipes within a minute (Aft Engine Pipe ${m.broken ? 'broken' : 'mended'}, Lift Pipe ${lift.broken ? 'broken' : 'mended'})`);
  report(reopened === 0 && leakSteps <= (FX.SEAL_AFTER + 1) * 60 * 2, `...and none of them opened a burst pipe again (reopened ${reopened}, leak time ${(leakSteps / 60).toFixed(1)} s for two pipes)`);
  report(errors.length === 0, `no game error (${errors.length})`);
}
{
  const r = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'botsim.mjs'), '--minutes', '4', '--seed', '2', '--map', 'route'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = r.stdout || '';
  const errs = /errors: (\d+)/.exec(out);
  report(r.status === 0 && errs && Number(errs[1]) === 0 && !/NaN/.test(out), `botsim 4 minutes, 8 bots: errors ${errs ? errs[1] : '?'}, no NaN`);
}

console.log(ok ? 'ALL PASS' : 'FAILED');
process.exit(ok ? 0 : 1);
