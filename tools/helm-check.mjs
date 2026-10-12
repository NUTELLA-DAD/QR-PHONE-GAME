// A HELM FOR ONE THUMB gate (FUN.md F3; config.CONTROLS.HELM_V2 / EXPERT / HELM_HOLD, shipSim.js helmStickV2 + helmGauge, bots.js, controller/ui.js + input.js). Headless.
//   node tools/buildsim.mjs --check-helm        or directly:   node tools/helm-check.mjs [--seed 1]
//
//   1  a person's stick: up pumps (the valve opens, gas climbs, she rises), down vents (she sinks), and let go and the autopilot trim holds her height (she stops climbing)
//   2  the phone is told: ui.hv = [gas, hover mark] on the helm, no engine panel (ui.eng null) until CONTROLS.EXPERT, then the panel is there
//   3  a person's helm always has the engines linked to the lever without EXPERT (a bot's SPLIT is left alone); with EXPERT a split stays
//   4  a bot at the helm: the stick is the gas (jy = -gas) and she flies without errors
//   5  the Navigator station (no behaviour) is gone from the classic ship; NO_HELM_V2=1 gives the old helm (stick = trim, the PRESSURE lever = gas) and the Navigator back
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
const { applyPlayerInput } = await load('modules/host/network.js');
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];

function boot({ bots = 6, human = true } = {}) {
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
  let helm = null;
  if (human) {
    const hs = A.layout.one('helm');
    helm = { id: 'h1', name: 'Helm', species: config.CREW_SPECIES[0], color: '#fff', x: hs.x, y: A.layout.platforms[hs.d].y, d: hs.d, jx: 0, jy: 0, jxs: 0, t: 0, connected: true, fall: false, ko: 0, lock: hs.n, gas: 0, thr: 0 };
    st.players[helm.id] = helm;
  }
  sim.castOff();
  return { sim, st, A, helm };
}
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { for (const sh of sim.state.ships) sh.state.press = Math.min(sh.state.press, 72); clock.ms += DT * 1000; try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; } } };
const secs = (sim, s) => step(sim, Math.round(s * 60));
const V2 = config.CONTROLS.HELM_V2;
report(V2 === true, 'HELM_V2 is on by default (NO_HELM_V2 not set)');
report(config.CONTROLS.EXPERT === false, 'EXPERT is off by default');

// ================================================================== 1. the stick
{
  const { sim, st, helm } = boot();
  secs(sim, 4);
  const alt0 = st.ship.alt, gas0 = st.ship.gas;
  applyPlayerInput(st, helm, { jx: 0, jy: -1 });
  secs(sim, 3);
  report(st.gasValve.input > 0.9, `stick up opens the pump (valve input ${st.gasValve.input.toFixed(2)})`);
  report(st.ship.gas > gas0 + 25, `...and the gas climbs (${gas0.toFixed(0)} -> ${st.ship.gas.toFixed(0)})`);
  secs(sim, 2);
  report(st.ship.alt > alt0 + 60, `...and she rises (${(st.ship.alt - alt0).toFixed(0)} px in 5 s)`);
  const altUp = st.ship.alt;
  applyPlayerInput(st, helm, { jx: 0, jy: 0 });
  secs(sim, 10);
  const altA = st.ship.alt, vyA = st.ship.vy;
  secs(sim, 5);
  report(Math.abs(st.ship.alt - altA) < 80 && Math.abs(st.ship.vy) < 40, `let go and the trim holds her height (${(st.ship.alt - altA).toFixed(0)} px in the next 5 s, vy ${st.ship.vy.toFixed(0)}; she coasted ${(altA - altUp).toFixed(0)} px after the stick)`);
  report(Math.abs(st.gasValve.input) < 1, `...the pump is trimmed, not flat out (valve ${st.gasValve.input.toFixed(2)})`);
  const altTop = st.ship.alt;
  applyPlayerInput(st, helm, { jx: 0, jy: 1 });
  secs(sim, 4);
  report(st.gasValve.input < -0.9 && st.ship.alt < altTop - 30, `stick down vents and she sinks (valve ${st.gasValve.input.toFixed(2)}, ${(st.ship.alt - altTop).toFixed(0)} px)`);
  applyPlayerInput(st, helm, { jx: 0, jy: 0.1 });
  secs(sim, 1);
  report(st.gasValve.input > -0.5, `a touch inside the deadzone (0.1) is the hold (it arrests the dive), not a vent (valve ${st.gasValve.input.toFixed(2)})`);
  report(errors.length === 0, `no game error (${errors.length})`);
}

// ================================================================== 2. what the phone is told
{
  const { sim, st, helm } = boot();
  secs(sim, 3);
  const ui = helm.ui || {};
  report(Array.isArray(ui.hv) && ui.hv.length === 2 && Math.abs(ui.hv[0] - 50) <= 12 && Math.abs(ui.hv[1] - 50) <= 6, `the helm phone gets the gas gauge ui.hv = ${JSON.stringify(ui.hv)} (gas, hover mark about 50)`);
  report(ui.eng === null && ui.kind === 'helm', 'no engine panel (ui.eng null) without EXPERT');
  config.CONTROLS.EXPERT = true;
  helm.uk = null;
  secs(sim, 1);
  report(helm.ui && helm.ui.eng && helm.ui.eng.l.length >= 2, 'with EXPERT the panel is there (ui.eng with a lever per engine)');
  config.CONTROLS.EXPERT = false;
}

// ================================================================== 3. SPLIT
{
  const { sim, st, A, helm } = boot();
  secs(sim, 2);
  A.sim.engines.command({ split: true });
  report(st.thrust.split === true, 'the engines are split (set by hand)');
  secs(sim, 1);
  report(st.thrust.split === false, 'a person at the helm without EXPERT gets them linked again');
  config.CONTROLS.EXPERT = true;
  A.sim.engines.command({ split: true });
  secs(sim, 2);
  report(st.thrust.split === true, 'with EXPERT a split stays');
  config.CONTROLS.EXPERT = false;
}

// ================================================================== 4. a bot at the helm
{
  const { sim, st, A } = boot({ bots: 8, human: false });
  let pushed = 0, mapped = 0, n = 0;
  for (let i = 0; i < 60 * 40; i++) {
    step(sim, 1);
    for (const p of Object.values(st.players)) if (p.bot && p.lock && A.layout.kindOf(p.lock) === 'helm') { n++; if (Math.abs(p.jy) > 0.3) pushed++; if (Math.abs(p.jy + (p.gas || 0)) < 1e-9 || p.noiseY !== undefined) mapped++; }
  }
  report(n > 0 && mapped === n, `a bot at the helm: the stick is the gas (jy = -gas on ${mapped} of ${n} steps; pushed hard on ${pushed})`);
  report(errors.length === 0, `no game error (${errors.length})`);
}

// ================================================================== 5. the Navigator, and the old helm
{
  const { sim, st, A } = boot({ human: false, bots: 2 });
  report(!A.layout.stations.some((s) => s.n === 'Navigator' || s.kind === 'navigator'), 'the classic ship has no Navigator station');
  const r = spawnSync(process.execPath, ['-e', `
    import('${pathToFileURL(path.join(publicDir, 'config.js')).href}').then(async ({config:c})=>{
      const { BUILDS } = await import('${pathToFileURL(path.join(publicDir, 'modules/host/shipBuild.js')).href}');
      console.log(JSON.stringify([c.CONTROLS.HELM_V2, BUILDS.classic.some((p)=>p.n==='Navigator')]));
    })`], { encoding: 'utf8', env: { ...process.env, NO_HELM_V2: '1' } });
  report((r.stdout || '').trim() === '[false,true]', `NO_HELM_V2=1 gives the old helm and the Navigator: ${(r.stdout || r.stderr || '').trim().slice(0, 200)}`);
}

console.log(ok ? 'ALL PASS' : 'FAILED');
process.exit(ok ? 0 : 1);
