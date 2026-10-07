// Art test page: shows every environment's background (painted images where they exist), and a live
// bot-crewed mission so the ship, gunships, enemies and crew can be judged in a new style without playing.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { createSimulation } from './simulation.js';
import { createRenderer } from './render.js';
import { createCamera } from './camera.js';

const $ = (id) => document.getElementById(id);
const sheet = $('sheet');
const scene = $('scene');
const fit = () => {
  for (const c of [sheet, scene]) {
    c.width = Math.round(c.clientWidth * Math.min(2, devicePixelRatio || 1));
    c.height = Math.round(c.clientHeight * Math.min(2, devicePixelRatio || 1));
  }
};
fit();
addEventListener('resize', fit);

const sim = createSimulation();
const camera = createCamera();
const sceneR = createRenderer({ ctx: scene.getContext('2d'), state: sim.state, canvas: scene });
const sheetR = createRenderer({ ctx: sheet.getContext('2d'), state: sim.state, canvas: sheet });
const ids = Object.keys(config.ENVIRONMENTS).filter((k) => config.ENVIRONMENTS[k] && config.ENVIRONMENTS[k].name);
const asked = new URLSearchParams(location.search).get('env');
let envId = ids.includes(asked) ? asked : ids[0];

// Four bot crew (same as the "Add 4 bot crew" button).
const addBots = () => {
  const names = config.CREW_SPECIES;
  const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0'];
  const [a, b] = SHIP_LAYOUT.boarderEntryPoints;
  for (let i = 0; i < 4; i++) {
    const id = 'bot' + i;
    sim.state.players[id] = { id, bot: true, name: 'Bot' + (i + 1), species: names[i % names.length], color: colors[i], x: a.x + Math.random() * (b.x - a.x), y: -60, fall: true, jx: 0, jy: 0, t: 0 };
  }
};
const status = () => {
  const bg = sceneR.bgArt;
  const kinds = bg.KINDS.filter((k) => bg.get(envId, k));
  const problem = (window.gameErrors || []).slice(-1)[0] || 'none';
  $('status').textContent = `${config.ENVIRONMENTS[envId].name} (art/backgrounds/${envId}/): ` + (kinds.length ? 'painted ' + kinds.join(', ') : 'no images - the drawn background is used') + `.   Last problem: ${problem}`;
};
const start = (id) => {
  envId = id;
  sim.course.startMission(1, { environment: id });
  document.querySelectorAll('#envs button').forEach((b) => b.classList.toggle('on', b.dataset.env === id));
  status();
};

for (const id of ids) {
  const b = document.createElement('button');
  b.textContent = config.ENVIRONMENTS[id].name;
  b.dataset.env = id;
  b.onclick = () => start(id);
  $('envs').appendChild(b);
}
$('gun').onclick = () => {
  try { sim.gunship.spawn(); } catch (e) { console.warn(e); }
};
$('ff').onclick = () => {
  try { for (let i = 0; i < 20 / config.LOOP.STEP; i++) sim.update(config.LOOP.STEP); } catch (e) { console.warn(e); }
};
$('reload').onclick = () => location.reload();

window.styleTest = { sim, sceneR }; // (for debugging in the console)
addBots();
sim.castOff();
start(envId);

let t = 0;
// One tile per environment: temporarily point the course at that environment and draw its background.
const drawSheet = () => {
  const g = sheet.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, sheet.width, sheet.height);
  const course = sim.state.course;
  if (!course) return;
  const keep = course.environment;
  const gap = 6;
  const w = Math.floor((sheet.width - gap * (ids.length + 1)) / ids.length);
  const h = sheet.height - gap * 2;
  ids.forEach((id, i) => {
    g.save();
    g.beginPath();
    g.rect(gap + i * (w + gap), gap, w, h);
    g.clip();
    g.translate(gap + i * (w + gap), gap);
    course.environment = id;
    try {
      sheetR.drawBackground(w, h, { scroll: t * 60, cx: 800, cy: 450, zoom: 1 });
    } catch (e) { /* keep going */ }
    g.restore();
    g.fillStyle = '#fff';
    g.font = `700 ${Math.round(h / 9)}px Georgia`;
    g.fillText(config.ENVIRONMENTS[id].name + (sheetR.bgArt.has(id) ? ' *' : ''), gap + i * (w + gap) + 8, gap + h - 10);
  });
  course.environment = keep;
};

let last = performance.now();
let acc = 0;
const frame = (now) => {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  try {
    acc += dt;
    let n = 0;
    while (acc >= config.LOOP.STEP && n++ < config.LOOP.MAX_STEPS) {
      sim.update(config.LOOP.STEP);
      acc -= config.LOOP.STEP;
    }
    if (acc >= config.LOOP.STEP) acc = 0;
    const view = camera.update(dt, sim.state, scene.width, scene.height);
    if (view) sceneR.renderFrame(now, view);
    drawSheet();
  } catch (e) {
    (window.gameErrors = window.gameErrors || []).push('styletest: ' + e.message);
  }
};
requestAnimationFrame(frame);
setInterval(status, 2000);
