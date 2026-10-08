import { config } from '../../config.js';
import { initHostNetwork, newBot } from './network.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';
import { createSfx } from './sfx.js';
import { createMenu } from './menu.js';
import { createPerfGovernor, perfState } from './perf.js';
import { applyBuild } from '../../shipLayout.js'; // (ship 0's compatibility forward: the dev build below is applied before the simulation reads the layout)
import { mainShip, eachShip } from './ships.js';
import { BUILDS } from './shipBuild.js';

// Dev: host.html?build=[parts JSON] flies another ship than the classic one (copy a build from the build page, buildtest.html, "Copy build JSON").
try {
  const asked = new URLSearchParams(location.search).get('build');
  if (asked && asked !== 'classic') applyBuild(JSON.parse(asked));
} catch (e) { console.warn('bad ?build=', e); }

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
// Draw at the screen's real pixel density (sharp on scaled laptop screens and 4K TVs), capped in config.
// "Sharp screen" (pause menu) is remembered on this computer; it costs speed on big screens.
try {
  if (localStorage.getItem('airshipSharp') === '1') config.DISPLAY.MAX_PIXEL_RATIO = config.DISPLAY.SHARP_RATIO;
} catch { /* (no storage: use the default) */ }
const fitCanvas = () => {
  // (the perf governor drops to ratio 1 below detail level 3)
  const cap = perfState.level >= 3 ? Number(config.DISPLAY && config.DISPLAY.MAX_PIXEL_RATIO) || 1 : 1;
  const pr = Math.max(1, Math.min(cap, window.devicePixelRatio || 1));
  canvas.width = Math.round(window.innerWidth * pr);
  canvas.height = Math.round(window.innerHeight * pr);
  ctx.imageSmoothingQuality = 'high';
};
// Automatic detail: lowers quality when frames get slow and brings it back later (see perf.js, config.PERF).
const perf = createPerfGovernor({
  onChange: () => fitCanvas(),
  sharpOn: () => (Number(config.DISPLAY && config.DISPLAY.MAX_PIXEL_RATIO) || 1) > 1 && (window.devicePixelRatio || 1) > 1,
});
window.perfGov = perf; // handy for debugging in the browser console
fitCanvas();

const simulation = createSimulation();
// Dev (B.2): host.html?ships=2 puts a SECOND airship in the sky (a copy of the classic one, or host.html?ships=2&build2=[parts JSON]), kept a little behind ours and
// below her, each with four bot crew. They are one simulation: each ship has her own hull, gas, guns, fires, crew and art. (?ships=3 adds a third.)
{
  const q = new URLSearchParams(location.search);
  const asked = Math.max(1, Math.min(3, Number(q.get('ships')) || 1));
  for (let i = 1; i < asked; i++) {
    let parts = BUILDS.classic;
    try { if (q.get('build2')) parts = JSON.parse(q.get('build2')); } catch (e) { console.warn('bad ?build2=', e); }
    simulation.addShip({ parts, formation: { dx: -250 * i, dalt: -1150 * i } });
  }
  if (asked > 1) {
    for (const sh of simulation.state.ships) {
      for (let k = 0; k < 4; k++) {
        const bot = newBot(simulation.state, sh, 'Bot' + (Object.keys(simulation.state.players).length + 1));
        simulation.state.players[bot.id] = bot;
      }
    }
  }
}
// PvP (PVP.md V.0): host.html?pvp=1 (or config.PVP.ENABLED) loads a SECOND, fully independent copy of the game for ship B. The same
// files are served under /b (server.js), and ES modules are one instance per URL, so /b/modules/host/simulation.js has its own
// config, layout and state. Co-op never takes this branch. (Drawing ship B is the arena camera's job, V.1a.)
// The bridge (pvp/bridge.js) puts both copies into one sky and runs the rounds; from then on it steps both ships instead of simulation.update.
// (Dev state of V.2: ?pvp=1 starts a bot-crewed match at once; teams, the lobby button and drawing ship B come with V.1a / V.5.)
let pvp = null; // the bridge, once ship B is loaded
const pvpAsked = new URLSearchParams(location.search).get('pvp') === '1' || config.PVP.ENABLED;
if (pvpAsked) {
  Promise.all([import('/b/config.js'), import('/b/modules/host/simulation.js'), import('./pvp/bridge.js')]).then(([cfg, sim, bridge]) => {
    config.PVP.ENABLED = cfg.config.PVP.ENABLED = true;
    const simB = sim.createSimulation();
    window.gameB = simB; // handy for debugging in the browser console
    pvp = bridge.createBridge({ A: { sim: simulation, config, layout: mainShip(simulation.state).layout }, B: { sim: simB, config: cfg.config, layout: mainShip(simB.state).layout } });
    window.bridge = pvp;
    pvp.addBots('A', 4);
    pvp.addBots('B', 4);
    pvp.startMatch();
  }).catch((e) => console.error('PvP: ship B could not be loaded', e));
}
const camera = createCamera();
// One renderer per ship (the context view is the ship's own state: ships.js): the first draws the sky, the effects and the HUD as well; the others only their ship.
const renderers = new Map();
const rendererOf = (sh) => renderers.get(sh) || (renderers.set(sh, createRenderer({ ctx, state: sh.ctx, canvas })), renderers.get(sh));
const renderer = rendererOf(mainShip(simulation.state));
// One frame: with one ship the renderer draws everything as it always did; with more, the sky and the first ship, then each other ship, then the effects, the darkness and the HUD on top.
const drawFrame = (now, view) => {
  const st = simulation.state;
  if (st.ships.length < 2) return renderer.renderFrame(now, view);
  renderer.renderFrame(now, view, { layers: ['background', 'ship'] });
  eachShip(st, (sh, i) => { if (i > 0) rendererOf(sh).renderFrame(now, view, { layers: ['ship', 'shipfx'], noClear: true, bobPhase: 2.7 * i }); });
  renderer.renderFrame(now, view, { layers: ['effects', 'dark', 'hud', 'arrows', 'film'], noClear: true });
};
const network = initHostNetwork({ simulation });
window.game = simulation; // handy for debugging in the browser console
const sfx = createSfx(simulation.state);
const soundButton = document.getElementById('sound');
const showSound = () => (soundButton.textContent = sfx.isMuted() ? 'Sound: off (M)' : 'Sound: on (M)');
soundButton.onclick = () => {
  sfx.toggle();
  showSound();
};
addEventListener('keydown', (e) => (e.key === 'm' || e.key === 'M') && setTimeout(showSound));
showSound();
window.music = sfx.music; // handy for debugging in the browser console (music.debug())
// Debugging: draw one frame now (useful when the page isn't animating, e.g. a hidden tab).
window.renderNow = (dt = 0.016) => drawFrame(performance.now(), camera.update(dt, simulation.state, canvas.width, canvas.height));

let lastTime = performance.now();
const STEP = config.LOOP.STEP;
let acc = 0; // real time not yet simulated
let paused = false;
const menu = createMenu({ simulation, network, perf, music: sfx.music, onPause: (on) => {
  paused = on;
  simulation.state.paused = on; // (network.js ignores button presses while the game is paused)
  simulation.flushPresses();
} });

// If anything ever goes wrong in a frame, note it and keep going (the game must never just
// freeze). The pause menu shows the last problem.
window.gameErrors = [];
const guard = (what, fn) => {
  try {
    return fn();
  } catch (err) {
    const msg = what + ': ' + (err && err.message ? err.message : err) + (err && err.stack ? ' @ ' + String(err.stack).split('\n')[1]?.trim() : '');
    if (window.gameErrors[window.gameErrors.length - 1] !== msg) {
      window.gameErrors.push(msg);
      if (window.gameErrors.length > 10) window.gameErrors.shift();
      console.error(err);
    }
    return undefined;
  }
};

// Speed check: press F to show frames per second, the slowest frame, and how long drawing takes.
const meter = document.createElement('div');
meter.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:bold 16px monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;display:none;pointer-events:none';
document.body.appendChild(meter);
addEventListener('keydown', (e) => (e.key === 'f' || e.key === 'F') && (meter.style.display = meter.style.display === 'none' ? 'block' : 'none'));
let meterT = 0;
let meterN = 0;
let meterWorst = 0;
let meterDraw = 0;
const meterTick = (now, gap, drawMs) => {
  meterN++;
  meterWorst = Math.max(meterWorst, gap);
  meterDraw += drawMs;
  if (now - meterT < 1000) return;
  if (meter.style.display !== 'none') meter.textContent = `${Math.round((meterN * 1000) / (now - meterT))} fps | slowest ${Math.round(meterWorst)} ms | draw ${(meterDraw / meterN).toFixed(1)} ms | ${canvas.width}x${canvas.height} | ${perf.label()}`;
  meterT = now;
  meterN = 0;
  meterWorst = 0;
  meterDraw = 0;
};

function frame(now) {
  requestAnimationFrame(frame); // schedule the next frame first, whatever happens below
  const gap = now - lastTime;
  const dt = Math.min(0.05, (now - lastTime) / 1000); // frame time for the camera
  const real = Math.min(config.LOOP.MAX_FRAME, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (!paused) {
    // Fixed timestep: run the simulation in exact STEP slices, however fast or slow frames arrive.
    acc += real;
    let steps = 0;
    while (acc >= STEP && steps < config.LOOP.MAX_STEPS) {
      if (pvp) guard('update', () => pvp.update(STEP)); // (ship A, then ship B, then the cross-fire and the rounds)
      else guard('update', () => simulation.update(STEP));
      acc -= STEP;
      steps++;
    }
    if (acc >= STEP) acc = 0; // hit the cap: drop the leftover rather than spiral
  }
  guard('sound', () => sfx.update());
  const view = guard('camera', () => camera.update(paused ? 0 : dt, simulation.state, canvas.width, canvas.height));
  const d0 = performance.now();
  if (view) guard('draw', () => drawFrame(now, view));
  const drawMs = performance.now() - d0;
  meterTick(now, gap, drawMs);
  if (!paused) perf.update(now, gap, drawMs);
}

// Canvas text needs the bundled fonts to be loaded first: start drawing once they are (or after 2 s at worst).
{
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    lastTime = performance.now();
    requestAnimationFrame(frame);
  };
  try {
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('20px Limelight'),
        document.fonts.load('400 16px "Libre Baskerville"'),
        document.fonts.load('700 16px "Libre Baskerville"'),
      ]).then(start, start);
      setTimeout(start, 2000);
    } else start();
  } catch { start(); }
}
window.addEventListener('resize', fitCanvas);
window.fitCanvas = fitCanvas; // (the pause menu's Screen button)
