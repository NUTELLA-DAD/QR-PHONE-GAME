import { config } from '../../config.js';
import { initHostNetwork } from './network.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';
import { createSfx } from './sfx.js';
import { createMenu } from './menu.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

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
// Debugging: draw one frame now (useful when the page isn't animating, e.g. a hidden tab).
window.renderNow = (dt = 0.016) => renderer.renderFrame(performance.now(), camera.update(dt, simulation.state, canvas.width, canvas.height));

let lastTime = performance.now();
const STEP = config.LOOP.STEP;
let acc = 0; // real time not yet simulated
let paused = false;
const menu = createMenu({ simulation, network, onPause: (on) => (paused = on) });

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

function frame(now) {
  requestAnimationFrame(frame); // schedule the next frame first, whatever happens below
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
  if (view) guard('draw', () => renderer.renderFrame(now, view));
}

requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
