import { config } from '../../config.js';
import { initHostNetwork } from './network.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const simulation = createSimulation();
const camera = createCamera();
const renderer = createRenderer({ ctx, state: simulation.state, canvas });
const network = initHostNetwork({ simulation });
window.game = simulation; // handy for debugging in the browser console

let lastTime = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  simulation.update(dt);
  const view = camera.update(dt, simulation.state, canvas.width, canvas.height);
  renderer.renderFrame(now, view);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});
