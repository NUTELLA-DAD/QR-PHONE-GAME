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
import { loadStartBuild } from './voyage.js';
import { buildShelf } from './pvp/shelf.js';
import { readPlaytestJob, armVersus } from './playtest.js';

// Dev: host.html?build=[parts JSON] flies another ship than the classic one (copy a build from the build page, buildtest.html, "Copy build JSON"). The build page's PLAYTEST buttons open
// host.html?playtest=coop (or =versus&foe=<shelf id>), &bots=N, with the ship in storage instead (playtest.js): co-op flies it as the voyage's start build, Versus puts it on the shelf for red.
const playtest = readPlaytestJob(location.search);
window.playtestJob = playtest; // (the pause menu's "Back to the builder" shows when this is set)
try {
  if (playtest) applyBuild(playtest.parts);
} catch (e) { console.warn('bad ?build=', e); }

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const canvas3d = document.getElementById('c3d');
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

// Dev (B.5): host.html?gunship=ship makes the enemy gunship a real Ship (gunshipShip.js); ?gunship=old keeps the old offset-from-our-ship one (config.GUNSHIP.AS_SHIP is the default).
{
  const g = new URLSearchParams(location.search).get('gunship');
  if (g === 'ship' || g === 'old') config.GUNSHIP.AS_SHIP = g === 'ship';
}
// Dev (C.1): host.html?creature=kraken puts a giant Kraken in every mission (it rises ahead of the ship; creatureSystem.js). Nothing changes without the flag.
{
  const c = new URLSearchParams(location.search).get('creature');
  if (c === 'kraken') { config.CREATURES.DEV_SPAWN = c; config.ENVIRONMENTS.FORCE = 'sea'; } // (the Kraken lives at the water line: the mission is flown in the Sunken Sea)
  if (new URLSearchParams(location.search).get('heart') === '1') config.CREATURES.BOARD.HEART_EXPOSED = true; // (C.2: host.html?creature=kraken&heart=1 exposes the heart so STRIKE THE HEART can be tried; C.3 decides when it is really exposed: phase 3)
  if (new URLSearchParams(location.search).get('lair') === '1') { config.CREATURES.DEV_LAIR = true; config.ENVIRONMENTS.FORCE = 'sea'; } // (C.3: host.html?lair=1 makes every stop a Kraken's lair, flown in the Sunken Sea)
}
// Dev (WP10): host.html?env=storm&kind=open flies the first missions in that environment / map kind (the same switches the bot sim uses: config.ENVIRONMENTS.FORCE, config.MAPS.FORCE_KIND). Nothing changes without the flags.
{
  const q = new URLSearchParams(location.search), e = q.get('env'), k = q.get('kind');
  if (e && config.ENVIRONMENTS[e] && config.ENVIRONMENTS[e].name && !config.ENVIRONMENTS.FORCE) config.ENVIRONMENTS.FORCE = e;
  if ((k === 'network' || k === 'route' || k === 'open') && !config.MAPS.FORCE_KIND) config.MAPS.FORCE_KIND = k;
}
const simulation = createSimulation();
if (playtest && playtest.mode === 'coop') BUILDS.playtest = playtest.parts; // (the build page's ship: the voyage starts with it, and so does every new voyage)
simulation.setStartBuild(playtest && playtest.mode === 'coop' ? 'playtest' : loadStartBuild()); // (the browser host starts a Voyage with the Sparrow, or the classic ship: the pause menu's Ship button; headless tools keep whatever ship they apply)
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
      // (B.6, &cross=1: both sides fly the Boarder's Barge - a crew cannon, a sandbag rack, a crate stack and a towline reel - picked for them at once)
      if (q.get('cross') === '1') config.PVP.SHELF.CROSS = true;
      // (&pick=sniper,ram: the shelf ships each side flies, red then blue - classic, twin, bags, var0.., sniper, brawler, ram, firebrand, barge)
      if (q.get('pick')) { const M = simulation.match, ids = q.get('pick').split(','); M.shelf = buildShelf(); const ix = (id) => Math.max(0, M.shelf.findIndex((e) => e.id === id)); M.applyPicks({ red: ix(ids[0]), blue: ix(ids[1] || ids[0]) }); }
      simulation.match.begin({ shelf: q.get('shelf') === '1' || q.get('cross') === '1' });
      const vote = simulation.state.vote;
      if (q.get('cross') === '1' && vote && vote.onDone) {
        const i = simulation.match.shelf.findIndex((e) => e.id === 'barge');
        simulation.state.vote = null;
        vote.onDone({ red: i, blue: i });
      }
    }
  }
}
// Playtest in Versus (playtest.js): the build page's ship on red against the shelf ship ?foe=, bots on both sides at once (&bots=N) or the lobby for phones.
if (playtest && playtest.mode === 'versus') armVersus(simulation, playtest, buildShelf);
const camera = createCamera();
// ONE renderer draws the whole sky: the background once, then every ship (her own art, crew and effects), the darkness and the HUD (render.js).
const renderer = createRenderer({ ctx, state: simulation.state, canvas });
// THE 3D VIEW (view3d/, 3D.md WP0): host.html?view=3d (or the pause menu's View button, remembered in localStorage.airshipView; the default is still 2D). The 3D canvas (#c3d) draws the
// world with Three.js from the same game state; the 2D canvas turns transparent and draws only the HUD, the screen-edge arrows and the full-screen cards (render.js layers). Any WebGL failure, or the view throwing twice, drops back to the 2D renderer for the rest of the session (a note shows in the pause menu).
const viewChoice = (() => {
  const q = new URLSearchParams(location.search).get('view');
  if (q === '2d' || q === '3d') return q;
  try { const s = localStorage.getItem('airshipView'); if (s === '2d' || s === '3d') return s; } catch { /* (no storage) */ }
  return '2d'; // (WP14 flips this default)
})();
const HUD_LAYERS = ['hud', 'arrows', 'marks']; // (no 'background', 'ship', 'effects', 'dark' or 'film': the 3D scene and its lights draw those; 'marks' = the lit-target brackets and the glowing eyes of the unlit, WP10)
const v3 = { view: null, active: false, loading: false, fails: 0, broken: false, mode: viewChoice };
window.view3dNote = '';
const v3settings = {
  sweep: false,
  get detail() { return perfState.level >= 2 ? 'high' : 'low'; }, // (the perf governor steps the 3D detail down too)
  get tier() { return perfState.level >= 3 ? 'high' : perfState.level >= 1 ? 'medium' : 'low'; }, // (the 3D quality tier: view3d/quality.js; ?tier=low in the address wins)
  gpuTimer: new URLSearchParams(location.search).get('gputimer') === '1', // (dev: GPU milliseconds per pass in view.stats().gpu)
  pixelRatio: () => Math.min(window.devicePixelRatio || 1, perfState.level >= 3 ? 1.5 : 1),
};
const drop3D = (reason) => { // back to the 2D renderer (reason = why, for the pause menu; null = the player chose 2D)
  v3.active = false;
  document.body.classList.remove('view3d');
  if (reason) {
    v3.broken = true;
    window.view3dNote = '3D view stopped (' + reason + '): playing in 2D for this session.';
    if (v3.view) v3.view.dispose();
    v3.view = null;
    console.warn('view3d off:', reason);
  }
  fitCanvas();
};
const use3D = async () => {
  if (v3.active || v3.loading || v3.broken) return;
  v3.loading = true;
  try {
    document.body.classList.add('view3d'); // (before the canvas is measured)
    if (!v3.view) {
      const mod = await import('../view3d/index.js');
      v3.view = mod.createView3D({ canvas: canvas3d, state: simulation.state, settings: v3settings });
    }
    v3.active = true;
    v3.fails = 0;
    window.view3dNote = '';
  } catch (e) {
    drop3D(String(e && e.message ? e.message : e).slice(0, 120));
  }
  v3.loading = false;
  fitCanvas();
};
// (the pause menu's View button)
window.setView = async (mode) => {
  mode = mode === '3d' ? '3d' : '2d';
  v3.mode = mode;
  try { localStorage.setItem('airshipView', mode); } catch { /* (not remembered) */ }
  try { const u = new URL(location.href); u.searchParams.set('view', mode); history.replaceState(null, '', u); } catch { /* (no history) */ }
  if (mode === '3d') { v3.broken = false; await use3D(); } else drop3D(null);
  return v3.active ? '3d' : '2d';
};
window.viewIs3D = () => v3.active;
window.view3dDebug = () => ({ view: v3.view, lastView: window.__lastView }); // (dev: the HUD alignment check reads these)
const drawFrame = (now, view) => {
  window.__lastView = view;
  if (v3.active && v3.view) {
    let ok = false;
    try {
      if (v3.view.lost) throw new Error('the graphics context was lost');
      v3.view.renderFrame(now, view, { width: canvas.width, height: canvas.height });
      ok = true;
    } catch (e) {
      v3.fails++;
      if (window.gameErrors) window.gameErrors.push('3D view: ' + (e && e.message ? e.message : e));
      console.warn('3D view problem', e);
      if (v3.fails >= 2 || v3.view.lost) drop3D(v3.view.lost ? 'graphics context lost' : 'it failed twice');
    }
    if (ok) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height); // (transparent: the 3D picture shows through)
      renderer.renderFrame(now, view, { layers: HUD_LAYERS, dark3d: v3.view.world ? v3.view.world.night : 0 });
      return;
    }
  }
  renderer.renderFrame(now, view);
};
const network = initHostNetwork({ simulation });
// Playtest in co-op with bots (&bots=N): they climb aboard and the ship casts off at once (without &bots the lobby opens with its QR code for phones).
if (playtest && playtest.mode === 'coop' && playtest.bots > 0) {
  for (let i = 0; i < playtest.bots; i++) {
    const bot = newBot(simulation.state, simulation.state.ships[0], 'Bot' + (i + 1));
    simulation.state.players[bot.id] = bot;
  }
  network.count();
  simulation.castOff();
}
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
meter.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:bold 16px monospace;color:#fff;background:rgba(0,0,0,.6);padding:4px 8px;border-radius:6px;display:none;pointer-events:none;white-space:pre';
document.body.appendChild(meter);
addEventListener('keydown', (e) => (e.key === 'f' || e.key === 'F') && (meter.style.display = meter.style.display === 'none' ? 'block' : 'none'));
let view3dKicked = false; // (the 3D view loads after the first frame, so the 2D picture is there while it does)
let meterT = 0;
let meterN = 0;
let meterWorst = 0;
let meterDraw = 0;
const meterTick = (now, gap, drawMs) => {
  meterN++;
  meterWorst = Math.max(meterWorst, gap);
  meterDraw += drawMs;
  if (now - meterT < 1000) return;
  if (meter.style.display !== 'none') {
    meter.textContent = `${Math.round((meterN * 1000) / (now - meterT))} fps | slowest ${Math.round(meterWorst)} ms | draw ${(meterDraw / meterN).toFixed(1)} ms | ${canvas.width}x${canvas.height} | ${perf.label()}`;
    if (v3.active && v3.view) { // (3D: what the graphics card is asked to draw)
      const s = v3.view.stats();
      meter.textContent += `\n3D: ${s.calls} draw calls | ${Math.round(s.tris / 1000)}k tris | js ${s.jsMs.toFixed(1)} ms | render ${s.renderMs.toFixed(1)} ms | ${s.w}x${s.h}`;
    }
  }
  window.__meter = { fps: Math.round((meterN * 1000) / (now - meterT)), slowest: meterWorst, draw: meterDraw / meterN, v3: v3.active && v3.view ? v3.view.stats() : null };
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
    acc += real * ((simulation.state.match && simulation.state.match.slow) || simulation.state.slow || 1); // (Versus: the finale of a round runs in slow motion; co-op: so does the last blow on a giant creature, creatureSystem.js)
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
  if (!view3dKicked && viewChoice === '3d') { view3dKicked = true; use3D(); }
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
