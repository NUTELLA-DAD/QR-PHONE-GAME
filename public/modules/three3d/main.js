// The 3D test page (a dev harness). The REAL 2D simulation runs headlessly in this page (liveSim.js); the 3D drawing is the same view the real host uses (../view3d/index.js,
// createView3D); this page adds the panel, orbit, time of day and a split with the 2D renderer. Nothing here changes the game.
import { look, applyLook } from '../view3d/style.js';
import { config } from '../../config.js';
import { startLive, buildChoices } from './liveSim.js';
import { createView3D } from '../view3d/index.js';
import { createCamera } from '../host/camera.js';
import { envIdOf } from '../host/environments.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const opt = (k, d) => (Q.has(k) ? Q.get(k) : d);

// ---- settings (the ones that need a new simulation come from the address; the rest are live) --------------------------------------------------------------------------
const S = {
  build: opt('build', 'classic'), env: opt('env', ''), map: opt('map', ''), creature: opt('creature', ''), bots: Number(opt('bots', 6)), tod: opt('tod', 'day'),
  sweep: opt('sweep', '1') !== '0', toon: opt('toon', '1') !== '0', shadows: opt('shadows', '1') !== '0', detail: opt('detail', 'high'), orbit: opt('orbit', '0') === '1', view2d: opt('v2d', 'off'),
  seed: Q.has('seed') ? Number(Q.get('seed')) : null, zoom: Number(opt('zoom', 1)) || 1, warm: Number(opt('warm', 0)), shot: opt('shot', '0') === '1', follow: opt('follow', ''),
  allowOrbit: true, lift: 0, tier: opt('tier', ''), gpuTimer: opt('gputimer', '0') === '1', // (tier '' = from Detail; ?look=nobloom,nofog is read by the view itself)
};
if (!S.map) S.map = S.tod === 'night' ? 'network' : 'open';
if (S.creature && !S.env) S.env = 'sea';
if (S.shot) document.body.classList.add('shot');
const reload = (changes) => { const q = new URLSearchParams(location.search); for (const [k, v] of Object.entries(changes)) { if (v === '' || v == null) q.delete(k); else q.set(k, v); } location.search = q.toString(); };

// ---- the simulation and the view -------------------------------------------------------------------------------------------------------------------------------------------------
const canvas = $('c3d'), canvas2d = $('c2d');
const live = startLive({ build: S.build, env: S.env, map: S.map, creature: S.creature, bots: S.bots, seed: S.seed, warm: S.warm });
const state = live.state;
const cam2d = createCamera();
let r2d = null, cam2dB = null; // the 2D renderer (loaded when "Show 2D" is first used)
const updateFallbackList = () => {
  const el = $('fallbacks');
  const all = view.fallbacks();
  el.style.display = all.length ? 'block' : 'none';
  el.innerHTML = '<b>Drawn as plain boxes / simplified</b><br>' + all.map((s) => '&bull; ' + s).join('<br>');
};
const view = createView3D({ canvas, state, settings: S, onModels: () => updateFallbackList() });
const { renderer, scene, camera, world, models, kraken, terrain } = view;
look.toon = S.toon; look.shadows = S.shadows && look.shadows; // (?look=noshadows in the address already turned it off)
renderer.shadowMap.enabled = look.shadows;
let simTime = 0;
let lineupPage = Number(opt('lineup', '0')) || 0; // 0 = off, 1 = the line-up, 2 = the key strip
let lineupOn = lineupPage > 0; void lineupOn; // (WP7: ?lineup=1 opens the crew line-up straight away; ?luz= zooms it, ?lux= / ?luy= pan it, for close shots)
const LU = { zoom: Number(opt('luz', 1)) || 1, dx: Number(opt('lux', 0)) || 0, dy: Number(opt('luy', 0)) || 0 };

function resize() {
  view.resize();
  if (r2d) { canvas2d.width = canvas2d.clientWidth; canvas2d.height = canvas2d.clientHeight; }
}
window.addEventListener('resize', resize);

// ---- UI --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function buildUI() {
  const p = $('panel');
  const opts = (list, cur) => list.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${l}</option>`).join('');
  p.innerHTML = `
  <h1>3D TEST PAGE</h1>
  <label>Ship (restarts)</label><select id="u-build">${opts(buildChoices().map((b) => [b.value, b.label]), S.build)}</select>
  <label>Sky (restarts)</label><select id="u-env">${opts([['', 'random'], ['skyisles', 'Sky Isles'], ['sea', 'Sunken Sea'], ['storm', 'Storm'], ['frost', 'Frost'], ['ember', 'Ember Forge'], ['fungal', 'Fungal'], ['aether', 'Aether']], S.env)}</select>
  <label>Map (restarts)</label><select id="u-map">${opts([['open', 'open sky'], ['network', 'caves'], ['route', 'winding cave']], S.map)}</select>
  <label>Creature (restarts)</label><select id="u-cr">${opts([['', 'none'], ['kraken', 'Kraken']], S.creature)}</select>
  <label>Light</label><select id="u-tod">${opts([['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night (cave)'], ['', 'Auto (from the game)']], S.tod)}</select>
  <div class="row"><button id="b-toon"></button><button id="b-shadow"></button></div>
  <label>Quality tier (look pass)</label><select id="u-tier">${opts([['', 'from Detail'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], S.tier)}</select>
  <div class="row" id="look-row">${['bloom', 'lut', 'grain', 'fog', 'rim', 'lanterns', 'dark', 'clouds', 'water', 'vfx', 'post'].map((k) => `<button data-look="${k}"></button>`).join('')}</div>
  <div class="row"><button id="b-detail"></button><button id="b-orbit"></button></div>
  <div class="row"><button id="b-sweep"></button></div>
  <div class="row"><button id="b-2d"></button><button id="b-skip">+30 s</button></div>
  <div class="row"><button id="b-turn">COME ABOUT (C)</button></div>
  <label>Call up (demo helpers)</label>
  <div class="row"><button data-spawn="gunship">Gunship</button><button data-spawn="fighters">Fighters</button><button data-spawn="bomber">Bomber</button><button data-spawn="bats">Bats</button><button data-spawn="fire">Fire</button></div>
  <div class="row"><button id="b-vfx">VFX test (V): fire + volley + explosion</button></div>
  <div class="row"><button id="b-crew">Crew line-up (K): every species, the raiders, the poses</button></div>
  <div class="row"><button id="b-pause">Pause</button><button id="b-ui">Hide (H)</button></div>
  <small id="u-info"></small>`;
  $('u-build').onchange = (e) => reload({ build: e.target.value });
  $('u-env').onchange = (e) => reload({ env: e.target.value });
  $('u-map').onchange = (e) => reload({ map: e.target.value });
  $('u-cr').onchange = (e) => reload({ creature: e.target.value });
  $('u-tod').onchange = (e) => { S.tod = e.target.value; history.replaceState(null, '', '?' + new URLSearchParams({ ...Object.fromEntries(Q), tod: S.tod })); };
  const sync = () => {
    $('b-toon').textContent = look.toon ? 'Look: Toon + ink' : 'Look: Plain lit'; $('b-toon').classList.toggle('on', look.toon);
    $('b-shadow').textContent = 'Shadows: ' + (look.shadows ? 'on' : 'off'); $('b-shadow').classList.toggle('on', look.shadows);
    const NAMES = { bloom: 'Bloom', lut: 'Grade', grain: 'Grain+vignette', fog: 'Fog', rim: 'Rim light', lanterns: 'Lantern lights', dark: 'Dark caves', clouds: 'Clouds', water: 'Toon water', vfx: 'Particles (WP4)', post: 'Post (all)' };
    p.querySelectorAll('[data-look]').forEach((b) => { const k = b.dataset.look; b.textContent = NAMES[k] + ': ' + (look[k] ? 'on' : 'off'); b.classList.toggle('on', !!look[k]); });
    $('b-detail').textContent = 'Detail: ' + S.detail;
    $('b-sweep').textContent = S.sweep ? 'Idle lamps sweep (demo)' : 'Lamps: as the game has them'; $('b-sweep').classList.toggle('on', S.sweep);
    $('b-orbit').textContent = 'Orbit: ' + (S.orbit ? 'on (drag)' : 'off'); $('b-orbit').classList.toggle('on', S.orbit);
    $('b-2d').textContent = 'Show 2D: ' + S.view2d; $('b-2d').classList.toggle('on', S.view2d !== 'off');
  };
  $('b-toon').onclick = () => { look.toon = !look.toon; applyLook(scene); world.setLook(); sync(); };
  $('b-shadow').onclick = () => { look.shadows = !look.shadows; renderer.shadowMap.enabled = look.shadows; applyLook(scene); world.setLook(); scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); sync(); };
  $('u-tier').onchange = (e) => { S.tier = e.target.value; sync(); };
  p.querySelectorAll('[data-look]').forEach((b) => { b.onclick = () => { look[b.dataset.look] = !look[b.dataset.look]; sync(); }; });
  $('b-detail').onclick = () => { S.detail = S.detail === 'high' ? 'low' : 'high'; sync(); };
  $('b-orbit').onclick = () => { S.orbit = !S.orbit; sync(); };
  $('b-2d').onclick = async () => { S.view2d = S.view2d === 'off' ? 'split' : S.view2d === 'split' ? 'only' : 'off'; await apply2d(); sync(); };
  $('b-skip').onclick = () => live.warm(30);
  $('b-sweep').onclick = () => { S.sweep = !S.sweep; sync(); };
  p.querySelectorAll('[data-spawn]').forEach((b) => { b.onclick = () => { b.classList.toggle('on', live.spawn(b.dataset.spawn)); setTimeout(() => b.classList.remove('on'), 400); }; });
  $('b-turn').onclick = () => { const r = live.comeAbout(); $('u-info').textContent = r === 'ok' ? 'Coming about: the helm holds the command for a second, then she swings round.' : 'Refused by the game: ' + r; };
  $('b-vfx').onclick = () => { // WP4: a test fire on the main deck, a six-shell volley and an explosion at the ship (view only; the game is not touched)
    const ok = view.vfx && view.vfx.test('all');
    $('u-info').textContent = ok ? 'VFX test: three deck fires, a volley and an explosion at the ship.' : 'The particles are off (?look=novfx, or they could not start).';
  };
  $('b-crew').onclick = () => { // WP7: a line-up of the crew in the sky above the ship (the camera goes there; the game keeps running). Click again to go back.
    lineupPage = (lineupPage + 1) % 3;
    $('b-crew').classList.toggle('on', lineupPage > 0);
    $('b-crew').textContent = lineupPage === 0 ? 'Crew line-up (K): every species, the raiders, the poses' : lineupPage === 1 ? 'Crew line-up page 1 (K: the key strip, then back)' : 'Crew line-up page 2: the animation keys (K: back to the ship)';
    $('u-info').textContent = lineupPage === 2 ? 'The animation KEYS, each frozen on one key: top row = the 4-key walk (fox) and the 4-key ladder climb (wolf, seen from behind); middle = jump crouch / stretch / air, the landing squash, a swing raised and struck, the two keys of working a station; third row = idle (faces the camera a little, both ways), walking with a tool, hauling a crate, knocked out, just hit (the flash), a hurt crewman; bottom row = the Action hop (two crouch keys, up, top, down) and an overhead chop by a raider (raised, struck).' : lineupPage === 1 ? 'Crew line-up. Row 1: the eight species with their items (two are hurt: hearts). Row 2: walking with a sword, climbing (from behind), working a gun, knocked out, hauling coal, mid-jump, swinging a hammer, a rabbit facing left. Row 3: in the air: a parachute, swinging on the hookshot (the rope), thrown, fired from the crew cannon (smoke), the overboard tumble, aiming the hookshot, a towline, a crate. Row 4: the four raiders (grunt, brute, sapper, cutter) and hurt crew (1, 1.5, 2 hearts, one knocked out). K again: the key strip.' : 'Back to the ship.';
  };
  let paused = false;
  $('b-pause').onclick = () => { paused = !paused; window.__paused = paused; $('b-pause').textContent = paused ? 'Resume' : 'Pause'; $('b-pause').classList.toggle('on', paused); };
  $('b-ui').onclick = () => { p.style.display = 'none'; };
  addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') p.style.display = p.style.display === 'none' ? '' : 'none'; if (e.key === '2') $('b-2d').click(); if (e.key === 'c' || e.key === 'C') $('b-turn').click(); if (e.key === 'o' || e.key === 'O') $('b-orbit').click(); if (e.key === 'v' || e.key === 'V') $('b-vfx').click(); if (e.key === 'k' || e.key === 'K') $('b-crew').click(); });
  sync();
  $('u-info').innerHTML = 'Keys: H hides, O orbit, 2 show 2D, C come about. The simulation is the real game with ' + S.bots + ' bot crew; this page only draws it (the same 3D view as host.html?view=3d).<br><b>Not drawn in 3D yet:</b> see the console line "view3d: not drawn yet".';
}

async function apply2d() {
  document.body.classList.toggle('split', S.view2d === 'split');
  document.body.classList.toggle('only2d', S.view2d === 'only');
  if (S.view2d !== 'off' && !r2d) {
    try {
      const { createRenderer } = await import('../host/render.js');
      canvas2d.width = canvas2d.clientWidth || 800; canvas2d.height = canvas2d.clientHeight || 600;
      r2d = createRenderer({ ctx: canvas2d.getContext('2d'), state, canvas: canvas2d });
      cam2dB = createCamera();
    } catch (e) { console.error('2D renderer failed', e); S.view2d = 'off'; document.body.classList.remove('split', 'only2d'); }
  }
  resize();
}

// ---- the loop ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let last = performance.now(), fpsN = 0, fpsT = 0, worst = 0, firstFrame = true, lastErr = '';
function frame(now) {
  requestAnimationFrame(frame);
  const gap = now - last;
  const dt = Math.min(0.05, gap / 1000), real = Math.min(0.25, gap / 1000);
  last = now;
  try {
    if (!window.__paused) { live.advance(real); simTime += real; }
    const cssW = canvas.clientWidth || window.innerWidth, cssH = canvas.clientHeight || window.innerHeight;
    let v = cam2d.update(window.__paused ? 0 : dt, state, cssW, cssH);
    if (lineupPage) { // the camera goes to the crew line-up in the sky above the ship (view.lineup tells the view where to stand the figures)
      const e0 = models.values().next().value, p0 = e0 && e0.model.root.position;
      if (p0) { view.lineup = { x: p0.x, y: p0.y + 800, page: lineupPage }; v = { cx: p0.x + LU.dx, cy: -(p0.y + 800 + 95 + LU.dy), zoom: (cssH / 800) * LU.zoom }; }
    } else view.lineup = null; // the 2D game's own follow camera: where it looks and how far it is zoomed
    if (S.view2d !== 'only') view.renderFrame(now, v, { t: simTime, width: cssW, height: cssH });
    if (r2d && S.view2d !== 'off') {
      const view2 = cam2dB.update(dt, state, canvas2d.width, canvas2d.height);
      if (view2) r2d.renderFrame(now, view2);
    }
  } catch (e) {
    const msg = String(e && e.stack ? e.stack : e);
    if (msg !== lastErr) { console.error(e); lastErr = msg; (window.gameErrors = window.gameErrors || []).push(msg.slice(0, 300)); }
  }
  fpsN++; worst = Math.max(worst, gap);
  if (now - fpsT > 1000) {
    const fps = (fpsN * 1000) / (now - fpsT);
    const st = view.stats();
    const gpuTxt = st.gpu && Object.keys(st.gpu).length ? '\ngpu ms ' + Object.entries(st.gpu).map(([k, v]) => k + ' ' + v.toFixed(2)).join('  ') : '';
    $('hud').textContent = `${fps.toFixed(0)} fps  |  frame ${(1000 / Math.max(1, fps)).toFixed(1)} ms  (worst ${worst.toFixed(0)})\nupdate ${st.jsMs.toFixed(1)} ms  render-call ${st.renderMs.toFixed(1)} ms\n${st.sceneCalls}+${st.calls - st.sceneCalls} draw calls (scene + post)  ${(st.sceneTris / 1000).toFixed(0)}k tris  ${st.w}x${st.h}  ${st.tier}${gpuTxt}${st.vfx ? `\nparticles ${st.vfx.pool}/${st.vfx.cap} + ${st.vfx.splinters} splinters  ${st.vfx.calls} draw calls  js ${st.vfxMs.toFixed(2)} ms` : ''}`;
    window.__stats = { fps, worst, update: st.jsMs, render: st.renderMs, calls: st.calls, tris: st.tris, sceneCalls: st.sceneCalls, sceneTris: st.sceneTris, gpu: st.gpu, tier: st.tier, vfx: st.vfx, vfxMs: st.vfxMs };
    fpsN = 0; fpsT = now; worst = 0;
  }
  if (firstFrame) { firstFrame = false; window.__ready3d = true; }
}

buildUI();
if (S.view2d !== 'off') apply2d();
// handy for the screenshot script and the console
window.__t3d = {
  state, live, scene, camera, renderer, world, models, S, kraken, terrain, view, vfx: view.vfx,
  setTod: (n) => { S.tod = n; },
  warm: (s) => live.warm(s),
  comeAbout: () => live.comeAbout(), spawn: (k) => live.spawn(k),
  info: () => ({ phase: state.phase, ship: state.ships.map((sh) => ({ id: sh.id, x: sh.pose.x, y: sh.pose.y, f: sh.pose.f, turn: sh.pose.turn })), creature: !!state.creature && state.creature.mode, env: envIdOf(state), tris: [...models.values()].map((e) => e.model.tris) }),
  look, applyLook: () => applyLook(scene),
};
void config;
requestAnimationFrame(frame);
