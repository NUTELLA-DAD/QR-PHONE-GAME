import { config } from '../../config.js';
import { initHostNetwork } from './network.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';
import { createSfx } from './sfx.js';
import { createMenu } from './menu.js';
import { createPerfGovernor, perfState } from './perf.js';

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
const camera = createCamera();
const renderer = createRenderer({ ctx, state: simulation.state, canvas });
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
window.renderNow = (dt = 0.016) => renderer.renderFrame(performance.now(), camera.update(dt, simulation.state, canvas.width, canvas.height));

let lastTime = performance.now();
const STEP = config.LOOP.STEP;
let acc = 0; // real time not yet simulated
let paused = false;
const menu = createMenu({ simulation, network, perf, music: sfx.music, onPause: (on) => (paused = on) });

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
      guard('update', () => simulation.update(STEP));
      acc -= STEP;
      steps++;
    }
    if (acc >= STEP) acc = 0; // hit the cap: drop the leftover rather than spiral
  }
  guard('sound', () => sfx.update());
  const view = guard('camera', () => camera.update(paused ? 0 : dt, simulation.state, canvas.width, canvas.height));
  const d0 = performance.now();
  if (view) guard('draw', () => renderer.renderFrame(now, view));
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
