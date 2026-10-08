import { config } from '../../config.js';
import { initHostNetwork, newBot } from './network.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';
import { createSfx } from './sfx.js';
import { createMenu } from './menu.js';
import { createPerfGovernor, perfState } from './perf.js';
import { applyBuild } from '../../shipLayout.js'; // (ship 0's compatibility forward: the dev build below is applied before the simulation reads the layout)
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
    // (?gap=1800&drop=300 spreads them out: how far behind each next ship keeps station, and how far below)
    const gap = Number(q.get('gap')) || 250;
    const drop = q.get('drop') != null ? Number(q.get('drop')) : 1150;
    simulation.addShip(parts, { formation: { dx: -gap * i, dalt: -drop * i } });
  }
  // Dev (B.3): host.html?teams=1 gives the ships a side each (red, blue, green): trim on hull and gasbag, a mast pennant, a scarf band on the crew, the colour on her HUD panel.
  if (q.get('teams') === '1') simulation.state.ships.forEach((sh, i) => { sh.team = config.FLEET.DEV_TEAMS[i % config.FLEET.DEV_TEAMS.length]; });
  if (asked > 1) {
    for (const sh of simulation.state.ships) {
      for (let k = 0; k < 4; k++) {
        const bot = newBot(simulation.state, sh, 'Bot' + (Object.keys(simulation.state.players).length + 1));
        simulation.state.players[bot.id] = bot;
      }
    }
  }
}
// Dev (B.4): host.html?versus=1 opens the lobby in VERSUS mode (two teams, two ships, one sky) and, with &bots=4, fills each side with bots and starts the match at once with
// the first ships on the shelf (&shelf=1 shows the vote); the Mode button on the TV does the same by hand. host.html?versus=1&mode=capture plays Capture (hold the helm).
{
  const q = new URLSearchParams(location.search);
  if (q.get('versus') === '1') {
    if (q.get('mode') === 'capture') config.PVP.MODE = 'capture';
    simulation.setSession('versus');
    const n = Number(q.get('bots')) || 0;
    if (n > 0) {
      simulation.match.addBots('red', n);
      simulation.match.addBots('blue', n);
      simulation.match.begin({ shelf: q.get('shelf') === '1' });
    }
  }
}
const camera = createCamera();
// ONE renderer draws the whole sky: the background once, then every ship (her own art, crew and effects), the darkness and the HUD (render.js).
const renderer = createRenderer({ ctx, state: simulation.state, canvas });
const drawFrame = (now, view) => renderer.renderFrame(now, view);
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
    acc += real * ((simulation.state.match && simulation.state.match.slow) || 1); // (Versus: the finale of a round runs in slow motion)
    let steps = 0;
    while (acc >= STEP && steps < config.LOOP.MAX_STEPS) {
      guard('update', () => simulation.update(STEP));
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
