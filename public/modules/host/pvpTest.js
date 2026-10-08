// PvP two-ship dev page (Phase V.1a): public/pvptest.html.
// Ship A is the normal game module graph. Ship B is the SAME code loaded a second time from /b/... (server.js serves public/ twice),
// so it has its own config, ship layout, simulation, bots and renderer. Both fly with bots in ONE sky:
//   renderer A draws sky + rock + A's ship + effects; renderer B composites B's ship + effects at its offset (opts.worldOffset, noClear);
//   the arena camera frames both; pvpArt draws the pennants, edge arrows and the two-sided HUD. No cross-fire yet (that is the V.2 bridge).
// Query: ?a=classic|multi|[parts JSON]  ?b=...  ?gap=3800 (world px between the ships)  ?dy=0  ?bots=4  ?nohud=1  ?free=1 (do not level B with A)
import { config } from '../../config.js';
import { applyBuild } from '../../shipLayout.js'; // (ship 0's compatibility forward: the build is applied before the simulation reads the layout)
import { mainShip } from './ships.js';
import { BUILDS } from './shipBuild.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createPerfGovernor, perfState } from './perf.js';
import { createArenaCamera } from './pvp/arenaCamera.js';
import { createPvpArt } from './pvp/pvpArt.js';

const q = new URLSearchParams(location.search);
const GAP = Number(q.get('gap')) || 3800;
const DY = Number(q.get('dy')) || 0;
const NBOTS = q.has('bots') ? Math.max(0, Math.min(8, Number(q.get('bots')))) : 4;

const pick = (name, BUILDS_) => {
  const v = q.get(name);
  try {
    if (v && v.trim().startsWith('[')) return JSON.parse(v);
    if (v === 'multi') return [...BUILDS_.classic, { part: 'station', n: 'Fore Boiler', kind: 'boiler', p: 'main', x: 1090 }, { part: 'station', n: 'Aft Lookout', kind: 'lookout', p: 'nest', x: 700 }];
  } catch (e) { console.warn('bad ?' + name + '=', e); }
  return BUILDS_.classic;
};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const meter = document.getElementById('meter');
const fitCanvas = () => {
  canvas.width = Math.round(window.innerWidth);
  canvas.height = Math.round(window.innerHeight);
  ctx.imageSmoothingQuality = 'high';
};
fitCanvas();
addEventListener('resize', fitCanvas);

// ---- ship A: this module graph -------------------------------------------------------------------------------------
applyBuild(pick('a', BUILDS));
// ---- ship B: the same code again, under /b/ (a separate copy of every module) ----------------------------------------
const B = {
  layoutMod: await import('/b/shipLayout.js'),
  buildMod: await import('/b/modules/host/shipBuild.js'),
};
B.layoutMod.applyBuild(pick('b', B.buildMod.BUILDS));
const [simModB, renderModB, perfModB, cfgModB] = await Promise.all([
  import('/b/modules/host/simulation.js'),
  import('/b/modules/host/render.js'),
  import('/b/modules/host/perf.js'),
  import('/b/config.js'),
]);
const twoCopies = simModB.createSimulation !== createSimulation; // (sanity: really two copies)

const COLORS = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const addBots = (sim, cfg, n, tag) => {
  const [a, b] = mainShip(sim.state).layout.boarderEntryPoints;
  for (let i = 0; i < n; i++) {
    const id = tag + 'bot' + i;
    sim.state.players[id] = { id, bot: true, name: tag + (i + 1), species: cfg.CREW_SPECIES[i % cfg.CREW_SPECIES.length], color: COLORS[i % COLORS.length], x: a.x + Math.random() * (b.x - a.x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
};

const simA = createSimulation();
const simB = simModB.createSimulation();
addBots(simA, config, NBOTS, 'R');
addBots(simB, cfgModB.config, NBOTS, 'B');
simA.castOff();
simB.castOff();
const rendA = createRenderer({ ctx, state: simA.state, canvas });
const rendB = renderModB.createRenderer({ ctx, state: simB.state, canvas });
const cam = createArenaCamera();
const art = createPvpArt({ ctx });
const perf = createPerfGovernor({ onChange: () => {} });
window.perfGov = perf;
window.pvp = { simA, simB, cam, GAP, DY, twoCopies, rendA, rendB, ctx, canvas, art };

// Ship B sits GAP world pixels to the right of A (the sim keeps each ship at its own fixed x; the V.2 bridge will derive this from the real positions).
const offsetB = { dx: GAP, dy: DY }; // (kept level with ship A unless ?free=1: each sim flies at its own altitude)
const LAYERS_A = ['background', 'ship', 'effects', 'dark', 'arrows'];
const LAYERS_B = ['ship', 'effects'];
const shipsFor = () => [
  { bounds: mainShip(simA.state).layout.bounds, alt: simA.state.ship.alt, offset: { dx: 0, dy: 0 }, team: 'red', hull: simA.state.ship.hull },
  { bounds: mainShip(simB.state).layout.bounds, alt: simB.state.ship.alt, offset: offsetB, team: 'blue', hull: simB.state.ship.hull },
];

const STEP = config.LOOP.STEP;
let acc = 0, last = performance.now(), drawSum = 0, drawN = 0, meterT = 0, startT = last;
const errors = [];
const guard = (what, fn) => { try { return fn(); } catch (e) { const m = what + ': ' + (e && e.message); if (errors[errors.length - 1] !== m) { errors.push(m); console.error(e); } return undefined; } };
let paused = false;
window.pvpPause = (on) => { paused = !!on; };

const drawFrame = (now, dt) => {
  if (!q.has('free')) offsetB.dy = DY + simB.state.ship.alt - simA.state.ship.alt;
  const ships = shipsFor();
  const view = cam.update(dt, ships, canvas.width, canvas.height, { scroll: simA.state.course ? simA.state.course.dist : undefined, pixelRatio: 1 });
  perfModB.perfState.level = perfState.level; // one perf level for both copies
  rendA.renderFrame(now, view, { layers: LAYERS_A });
  rendB.renderFrame(now, view, { layers: LAYERS_B, worldOffset: offsetB, noClear: true, bobPhase: 1.7 });
  if (!q.has('nohud')) {
    art.drawWorld(ships, view, canvas.width, canvas.height, now);
    art.drawEdgeArrows(ships, view, canvas.width, canvas.height);
    const left = Math.max(0, 360 - (now - startT) / 1000);
    art.drawHud({
      left: { team: 'red', label: 'RED CREW', hull: simA.state.ship.hull, wins: 0 },
      right: { team: 'blue', label: 'BLUE CREW', hull: simB.state.ship.hull, wins: 0 },
      timer: left, round: 1, rounds: 3,
    }, canvas.width, canvas.height);
  }
  return view;
};

const frame = (now) => {
  requestAnimationFrame(frame);
  const gap = now - last;
  const dt = Math.min(0.05, gap / 1000);
  last = now;
  if (!paused) {
    acc += Math.min(config.LOOP.MAX_FRAME, Math.max(0, gap / 1000));
    let steps = 0;
    while (acc >= STEP && steps < config.LOOP.MAX_STEPS) {
      guard('updateA', () => simA.update(STEP));
      guard('updateB', () => simB.update(STEP));
      acc -= STEP;
      steps++;
    }
    if (acc >= STEP) acc = 0;
  }
  const d0 = performance.now();
  const view = guard('draw', () => drawFrame(now, paused ? 0 : dt));
  const ms = performance.now() - d0;
  drawSum += ms; drawN++;
  perf.update(now, gap, ms);
  if (now - meterT > 1000) {
    meter.textContent = `draw ${(drawSum / Math.max(1, drawN)).toFixed(1)} ms | ${canvas.width}x${canvas.height} | zoom ${view ? view.zoom.toFixed(3) : '?'}${view && view.clipped ? ' (CAPPED)' : ''} | ${perf.label()} | 2 module copies: ${twoCopies}${errors.length ? ' | ERR ' + errors[errors.length - 1] : ''}`;
    window.pvp.drawMs = drawSum / Math.max(1, drawN);
    meterT = now; drawSum = 0; drawN = 0;
  }
};
window.pvp.errors = errors;
window.pvp.drawFrame = drawFrame;

try {
  await Promise.all([document.fonts.load('20px Limelight'), document.fonts.load('700 16px "Libre Baskerville"')]);
} catch { /* (drawing starts anyway) */ }
// settle the sims a few seconds so the crew is on deck before the first frame
for (let i = 0; i < 240; i++) { guard('updateA', () => simA.update(STEP)); guard('updateB', () => simB.update(STEP)); }
last = performance.now();
requestAnimationFrame(frame);
