// The 3D test page. The REAL 2D simulation runs headlessly in this page (liveSim.js); each frame its state is mapped into a Three.js scene:
// ships (from their parts lists), crew, shells, bombs, fires, enemy planes and gunships, the Kraken, the rock and the sea. Nothing here changes the game.
import { THREE, look, applyLook, PAL, INK, Batch, tagSmall } from './style.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { config } from '../../config.js';
import { startLive, buildChoices } from './liveSim.js';
import { createWorld, TOD } from './world.js';
import { createTerrain } from './terrain.js';
import { buildShipModel } from './shipMesh.js';
import { makeFigure } from './crew.js';
import { createKrakenView } from './kraken.js';
import { createCamera } from '../host/camera.js';
import { envIdOf } from '../host/environments.js';
import { shipOf } from '../host/ships.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const opt = (k, d) => (Q.has(k) ? Q.get(k) : d);

// ---- settings (the ones that need a new simulation come from the address; the rest are live) --------------------------------------------------------------------------
const S = {
  build: opt('build', 'classic'), env: opt('env', ''), map: opt('map', ''), creature: opt('creature', ''), bots: Number(opt('bots', 6)), tod: opt('tod', 'day'),
  sweep: opt('sweep', '1') !== '0', toon: opt('toon', '1') !== '0', shadows: opt('shadows', '1') !== '0', detail: opt('detail', 'high'), orbit: opt('orbit', '0') === '1', view2d: opt('v2d', 'off'),
  seed: Q.has('seed') ? Number(Q.get('seed')) : null, zoom: Number(opt('zoom', 1)) || 1, warm: Number(opt('warm', 0)), shot: opt('shot', '0') === '1', follow: opt('follow', ''),
};
if (!S.map) S.map = S.tod === 'night' ? 'network' : 'open';
if (S.creature && !S.env) S.env = 'sea';
look.toon = S.toon; look.shadows = S.shadows;
if (S.shot) document.body.classList.add('shot');
const reload = (changes) => { const q = new URLSearchParams(location.search); for (const [k, v] of Object.entries(changes)) { if (v === '' || v == null) q.delete(k); else q.set(k, v); } location.search = q.toString(); };

// ---- renderer, scene, camera -------------------------------------------------------------------------------------------------------------------------------------------
const canvas = $('c3d'), canvas2d = $('c2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: S.shot });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const FOV = 30;
const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 60, 70000);
scene.add(camera);
const worldRoot = new THREE.Group();
scene.add(worldRoot);
const world = createWorld(scene, renderer);
const terrain = createTerrain(worldRoot);
const kraken = createKrakenView(worldRoot);
const controls = new OrbitControls(camera, canvas);
controls.enabled = S.orbit;
controls.enableDamping = false;
controls.maxDistance = 30000;

const applyDetail = () => {
  const hi = S.detail === 'high';
  look.low = !hi;
  renderer.shadowMap.type = hi ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
  applyLook(scene);
  renderer.setPixelRatio(hi ? Math.min(window.devicePixelRatio || 1, 2) : 1);
  world.setShadowQuality(hi ? 4096 : 1024);
  resize();
};
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (r2d) { canvas2d.width = canvas2d.clientWidth; canvas2d.height = canvas2d.clientHeight; }
}
window.addEventListener('resize', resize);

// ---- the simulation -------------------------------------------------------------------------------------------------------------------------------------------------------------
const live = startLive({ build: S.build, env: S.env, map: S.map, creature: S.creature, bots: S.bots, seed: S.seed, warm: S.warm });
const state = live.state;
const cam2d = createCamera();
let r2d = null, cam2dB = null; // the 2D renderer (loaded when "Show 2D" is first used)
world.setTod(S.tod);

// ---- ship models ------------------------------------------------------------------------------------------------------------------------------------------------------------------
const models = new Map(); // ship id -> { model, ver }
const figures = new Map(); // player / raider -> { fig, shipId }
const modelFor = (sh) => {
  const ver = sh.layout.version;
  let e = models.get(sh.id);
  if (!e || e.ver !== ver) {
    if (e) { worldRoot.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); for (const [k, f] of figures) if (f.shipId === sh.id) { f.fig.group.removeFromParent(); figures.delete(k); } }
    const model = buildShipModel(sh.layout, { enemy: !!sh.ai });
    worldRoot.add(model.root);
    e = { model, ver };
    models.set(sh.id, e);
    updateFallbackList();
  }
  return e.model;
};
const updateFallbackList = () => {
  const el = $('fallbacks');
  const all = [];
  for (const [id, e] of models) for (const f of e.model.fallbacks) all.push((models.size > 1 ? id + ': ' : '') + f);
  el.style.display = all.length ? 'block' : 'none';
  el.innerHTML = '<b>Drawn as plain boxes / simplified</b><br>' + all.map((s) => '&bull; ' + s).join('<br>');
};

// ---- instanced extras: shells, bombs, puffs -----------------------------------------------------------------------------------------------------------------------------------
const mkInst = (geo, max, mat) => { const m = new THREE.InstancedMesh(geo, mat, max); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; worldRoot.add(m); return m; };
const SPH = new THREE.SphereGeometry(1, 14, 10), SPH_LO = new THREE.SphereGeometry(1, 8, 6);
const shellMesh = mkInst(SPH, 400, new THREE.MeshBasicMaterial()), shellInk = mkInst(SPH, 400, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
const bombMesh = mkInst(SPH, 80, new THREE.MeshBasicMaterial({ color: '#3a3032' })), bombInk = mkInst(SPH, 80, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
const puffMesh = mkInst(SPH_LO, 200, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }));
const _M = new THREE.Matrix4(), _C = new THREE.Color(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3();
const setInst = (im, i, x, y, z, r, color) => {
  _M.compose(_P.set(x, y, z), _Q.identity(), _S.set(r, r, r));
  im.setMatrixAt(i, _M);
  if (color) im.setColorAt(i, _C.set(color));
};
const endInst = (im, n) => { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };

// ---- enemy planes (one generic fighter, used for bombers and strafers) ---------------------------------------------------------------------------------------------------------------
const planeGroups = new Map();
const planePool = { build: null };
{
  const planeBuilderFn = (big) => {
    const b = new Batch();
    const s = big ? 1.6 : 1;
    b.sphere('#a8443f', 0, 0, 0, 62 * s, 17 * s, 16 * s, 3.5); // fuselage
    b.sphere('#4a4346', 52 * s, 0, 0, 14 * s, 14 * s, 14 * s, 3, true); // cowling
    b.box('#c9706a', -2 * s, 10 * s, 0, 36 * s, 5 * s, 150 * s, 3); // lower wing (the span runs toward the viewer: seen edge-on from the side)
    b.box('#c9706a', 4 * s, 34 * s, 0, 34 * s, 5 * s, 150 * s, 3);
    for (const z of [-48, 48]) { b.box('#4a4346', 2 * s, 22 * s, z * s, 4 * s, 28 * s, 4 * s, 1.5); }
    b.box('#4a4346', -58 * s, 12 * s, 0, 32 * s, 4 * s, 52 * s, 2.5); // tailplane
    b.box('#4a4346', -58 * s, 20 * s, 0, 5 * s, 30 * s, 5 * s, 2.5, 0, 0, 0.1); // fin
    b.sphere('#efe9dc', 8 * s, 14 * s, 0, 9 * s, 8 * s, 8 * s, 2, true); // pilot
    const grp = b.build();
    const prop = new Batch();
    prop.box('#2b2622', 0, 0, 0, 4 * s, 60 * s, 8 * s, 1.5);
    const pg = prop.build();
    pg.position.x = 66 * s;
    grp.add(pg);
    grp.userData.prop = pg;
    return grp;
  };
  planePool.build = planeBuilderFn;
}
// bats: a charcoal body, two flat wings that beat on rigid pivots
const batPool = [];
const makeBat = () => {
  const g = new THREE.Group();
  const body = new Batch();
  body.sphere('#4a4346', 0, 0, 0, 20, 14, 13, 3);
  body.sphere('#4a4346', 18, 6, 0, 10, 9, 9, 2.4, true);
  for (const z of [-5, 5]) body.cone('#4a4346', 20, 18, z, 3.5, 11, 1.6);
  body.sphere('#f2d36b', 25, 8, 0, 2.2, 2.2, 6, 0, true);
  g.add(body.build());
  const wings = [];
  for (const sgn of [1, -1]) {
    const piv = new THREE.Group();
    const w = new Batch();
    w.box('#2f2a2e', -4, 0, sgn * 36, 38, 3, 72, 2.6);
    piv.add(w.build());
    piv.position.y = 6;
    g.add(piv);
    wings.push([piv, sgn]);
  }
  g.userData.wings = wings;
  return g;
};
const syncBats = (list, t) => {
  while (batPool.length < Math.min(list.length, 40)) { const g = tagSmall(makeBat()); applyLook(g); worldRoot.add(g); batPool.push(g); }
  batPool.forEach((g, i) => {
    const b = list[i];
    g.visible = !!b && Number.isFinite(b.x);
    if (!g.visible) return;
    g.position.set(b.x, -b.y, 60);
    g.rotation.y = (b.vx ?? 0) - (state.ships[0] ? state.ships[0].pose.vx : 0) >= 0 ? 0 : Math.PI;
    const flap = 0.55 + 0.6 * Math.sin(t * 13 + (b.phase || 0));
    for (const [piv, sgn] of g.userData.wings) piv.rotation.x = -sgn * flap;
  });
};
const syncPlanes = (list, big, t) => {
  const planeBuilder = planePool.build;
  const key = big ? 'B' : 'S';
  const pool = planeGroups.get(key) || [];
  planeGroups.set(key, pool);
  while (pool.length < list.length) { const g = new THREE.Group(); const inner = new THREE.Group(); const mesh = tagSmall(planeBuilder(big)); applyLook(mesh); inner.add(mesh); g.add(inner); g.userData.inner = inner; g.userData.mesh = mesh; worldRoot.add(g); pool.push(g); }
  pool.forEach((g, i) => {
    const p = list[i];
    g.visible = !!p && !p.dead;
    if (!p || p.dead) return;
    const h = Number.isFinite(p.heading) ? p.heading : 0;
    g.position.set(p.x, -p.y, 0);
    g.rotation.z = -h;
    g.userData.inner.rotation.x = Math.cos(h) < 0 ? Math.PI : 0;
    const prop = g.userData.mesh.userData.prop;
    if (prop) prop.rotation.x = t * 40;
  });
};

// ---- the per-frame mapping of 2D state -> 3D ------------------------------------------------------------------------------------------------------------------------------------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };
let simTime = 0;
let lastPivot = new THREE.Vector3();
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
let lastErr = '';

function syncShips(t, dt) {
  const seen = new Set();
  state.ships.forEach((sh, index) => {
    const model = modelFor(sh);
    seen.add(sh.id);
    const pose = sh.pose, root = model.root;
    const bt = t + 2.7 * index;
    const bob = Math.sin(bt * 1.1) * 5 + Math.sin(bt * 0.37 + 1) * 3; // the 2D game's own slow bob
    root.position.set(pose.x + model.pv, -(pose.y + bob), 0);
    let yaw;
    if (pose.turn > 0) { const startF = pose.turn < 0.5 ? pose.f : -pose.f; yaw = Math.PI * pose.turn + (startF === -1 ? Math.PI : 0); } // COME ABOUT: a real half-turn about the vertical axis
    else yaw = pose.f === 1 ? 0 : Math.PI;
    root.rotation.y = yaw;
    model.pitchG.rotation.z = -(pose.pitch || 0);
    root.updateMatrixWorld(true);
    const side = (camera.position.x - root.position.x) * Math.sin(yaw) + (camera.position.z - root.position.z) * Math.cos(yaw);
    model.setView(side);
    model.update({ t, ship: sh, world: state, night: world.night, lamps: !sh.ai, sweep: S.sweep, spotShadow: world.night > 0.5 && index === 0 });
    // crew aboard
    const crew = Object.values(state.players).filter((p) => !p.enemy && p.connected !== false && !p.fly && shipOf(state, p) === sh);
    const raiders = sh.ctx && sh.ctx.boarders ? sh.ctx.boarders : state.boarders || [];
    const used = new Set();
    const place = (key, p, raider) => {
      let f = figures.get(key);
      if (!f || f.shipId !== sh.id) {
        if (f) f.fig.group.removeFromParent();
        const fig = makeFigure({ color: p.color || '#ece3c8', species: p.species || 'bulldog', raider });
        fig.z = 0;
        model.content.add(fig.group);
        f = { fig, shipId: sh.id, raider };
        figures.set(key, f);
        applyLook(fig.group);
      }
      used.add(key);
      const fig = f.fig;
      const lane = (0.07 + 0.34 * hash(String(p.id || key))) * model.W;
      const target = p.climb ? -model.W * 0.62 + 20 : lane;
      fig.z += (target - fig.z) * Math.min(1, dt * 7);
      fig.group.visible = true;
      fig.group.position.set(model.X(p.x), model.Y(p.y), fig.z);
      fig.pose(p, t, !!p.moving, !!p.climb, p.ko > 0, p.face >= 0 ? 1 : -1);
    };
    for (const p of crew) place(p.id, p, false);
    raiders.forEach((r, i) => place('r' + sh.id + (r.id || i), { ...r, id: 'r' + (r.id || i) }, true));
    for (const [key, f] of figures) if (f.shipId === sh.id && !used.has(key)) { f.fig.group.removeFromParent(); figures.delete(key); }
  });
  for (const [id, e] of models) if (!seen.has(id)) { worldRoot.remove(e.model.root); models.delete(id); updateFallbackList(); }
}

function syncSky(t) {
  // shells and enemy bullets
  let n = 0;
  for (const s of state.shells) {
    if (n >= 400) break;
    if (!Number.isFinite(s.x) || s.life <= 0 || s.frag) continue;
    const owner = state.players[s.owner];
    const r = s.primed ? 20 : s.kind === 'mortar' ? 12 : 9;
    setInst(shellMesh, n, s.x, -s.y, 0, r, s.primed ? '#ff9a2e' : (owner && owner.color) || '#f2d36b');
    setInst(shellInk, n, s.x, -s.y, 0, r * 1.28);
    n++;
  }
  for (const b of state.bullets) {
    if (n >= 400) break;
    if (!Number.isFinite(b.x)) continue;
    setInst(shellMesh, n, b.x, -b.y, 0, b.flak ? 14 : 11, b.flak ? '#e8884a' : '#ff2e55');
    setInst(shellInk, n, b.x, -b.y, 0, b.flak ? 18 : 14);
    n++;
  }
  endInst(shellMesh, n); endInst(shellInk, n);
  // bombs: ours falling (world), enemy bombs (world), planted bombs on decks (ship frame)
  let nb = 0;
  for (const list of [state.shipBombs, state.enemyBombs]) for (const b of list || []) { if (nb >= 80 || !Number.isFinite(b.x)) continue; setInst(bombMesh, nb, b.x, -b.y, 0, 17); setInst(bombInk, nb, b.x, -b.y, 0, 22); nb++; }
  for (const sh of state.ships) { const e = models.get(sh.id); if (!e) continue; const L = sh.layout; for (const b of (sh.ctx && sh.ctx.bombs) || []) { if (nb >= 80) break; const q = L.platforms[b.d]; if (!q) continue; _P.set(e.model.X(b.x), e.model.Y(q.y - 18), 0); e.model.content.localToWorld(_P); setInst(bombMesh, nb, _P.x, _P.y, _P.z, 18); setInst(bombInk, nb, _P.x, _P.y, _P.z, 23); nb++; } }
  endInst(bombMesh, nb); endInst(bombInk, nb);
  // puffs and smoke
  let np = 0;
  for (const p of state.puffs) { if (np >= 200 || !Number.isFinite(p.x)) continue; const k = clamp(p.life / (p.max || 0.5), 0, 1); setInst(puffMesh, np, p.x, -p.y, 40, 8 + 22 * (1 - k), p.c || '#9a9a9a'); np++; }
  endInst(puffMesh, np);
  syncPlanes(state.strafers || [], false, t);
  syncBats(state.bats || [], t);
  syncPlanes(state.bombers || [], true, t);
}

// ---- camera -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------
let lastView = null;
const ELEV = 0.2;
function syncCamera(dt) {
  const cssW = canvas.clientWidth || window.innerWidth, cssH = canvas.clientHeight || window.innerHeight;
  const view = cam2d.update(dt, state, cssW, cssH); // the 2D game's own follow camera: where it looks and how far it is zoomed
  if (view && Number.isFinite(view.cx) && Number.isFinite(view.zoom) && view.zoom > 0) lastView = view;
  let v = lastView || { cx: 800, cy: 400, zoom: 0.5 };
  if (S.follow === 'mid' && state.creature && state.ships[0]) { // (screenshots: look at the middle between the ship and the creature)
    const sh = state.ships[0], c = state.creature;
    v = { ...v, cx: (sh.pose.x + sh.layout.refPoint.x + c.x) / 2, cy: (sh.pose.y + sh.layout.refPoint.y + c.y) / 2 };
  }
  const visH = cssH / v.zoom, visW = cssW / v.zoom;
  const D = visH / 2 / Math.tan((FOV * Math.PI) / 360) / S.zoom;
  camTarget.set(v.cx, -v.cy + visH * 0.02, 0);
  if (S.orbit) {
    const main = state.ships[0], e = main && models.get(main.id);
    if (e) {
      const piv = e.model.root.position;
      if (lastPivot.lengthSq() === 0) { // just switched on: start from a three-quarter view of the ship, then the viewer drags it
        controls.target.set(piv.x, piv.y + 300, 0);
        camera.position.set(piv.x + D * 0.46, piv.y + 300 + D * 0.3, D * 0.8);
      } else { const d = _P.copy(piv).sub(lastPivot); controls.target.add(d); camera.position.add(d); } // (then she carries the camera along)
      lastPivot.copy(piv);
    }
    controls.update();
  } else {
    camera.position.set(camTarget.x, camTarget.y + D * Math.sin(ELEV), D * Math.cos(ELEV));
    camera.lookAt(camTarget);
  }
  camera.updateMatrixWorld(true);
  return { visW, visH, v };
}

// ---- lights follow the action ------------------------------------------------------------------------------------------------------------------------------------------------------
function syncLights() {
  const main = state.ships[0], e = main && models.get(main.id);
  const c = e ? e.model.root.position : camTarget;
  const snap = 200;
  const x = Math.round(c.x / snap) * snap, y = Math.round(c.y / snap) * snap;
  world.sun.target.position.set(x, y, 0);
  world.sun.position.copy(world.sunDir).multiplyScalar(3800).add(world.sun.target.position);
}

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
  <label>Light</label><select id="u-tod">${opts([['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night (cave)']], S.tod)}</select>
  <div class="row"><button id="b-toon"></button><button id="b-shadow"></button></div>
  <div class="row"><button id="b-detail"></button><button id="b-orbit"></button></div>
  <div class="row"><button id="b-sweep"></button></div>
  <div class="row"><button id="b-2d"></button><button id="b-skip">+30 s</button></div>
  <div class="row"><button id="b-turn">COME ABOUT (C)</button></div>
  <label>Call up (demo helpers)</label>
  <div class="row"><button data-spawn="gunship">Gunship</button><button data-spawn="fighters">Fighters</button><button data-spawn="bomber">Bomber</button><button data-spawn="bats">Bats</button><button data-spawn="fire">Fire</button></div>
  <div class="row"><button id="b-pause">Pause</button><button id="b-ui">Hide (H)</button></div>
  <small id="u-info"></small>`;
  $('u-build').onchange = (e) => reload({ build: e.target.value });
  $('u-env').onchange = (e) => reload({ env: e.target.value });
  $('u-map').onchange = (e) => reload({ map: e.target.value });
  $('u-cr').onchange = (e) => reload({ creature: e.target.value });
  $('u-tod').onchange = (e) => { S.tod = e.target.value; world.setTod(S.tod); history.replaceState(null, '', '?' + new URLSearchParams({ ...Object.fromEntries(Q), tod: S.tod })); };
  const sync = () => {
    $('b-toon').textContent = look.toon ? 'Look: Toon + ink' : 'Look: Plain lit'; $('b-toon').classList.toggle('on', look.toon);
    $('b-shadow').textContent = 'Shadows: ' + (look.shadows ? 'on' : 'off'); $('b-shadow').classList.toggle('on', look.shadows);
    $('b-detail').textContent = 'Detail: ' + S.detail;
    $('b-sweep').textContent = S.sweep ? 'Idle lamps sweep (demo)' : 'Lamps: as the game has them'; $('b-sweep').classList.toggle('on', S.sweep);
    $('b-orbit').textContent = 'Orbit: ' + (S.orbit ? 'on (drag)' : 'off'); $('b-orbit').classList.toggle('on', S.orbit);
    $('b-2d').textContent = 'Show 2D: ' + S.view2d; $('b-2d').classList.toggle('on', S.view2d !== 'off');
  };
  $('b-toon').onclick = () => { look.toon = !look.toon; applyLook(scene); world.setLook(); sync(); };
  $('b-shadow').onclick = () => { look.shadows = !look.shadows; renderer.shadowMap.enabled = look.shadows; applyLook(scene); world.setLook(); scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); sync(); };
  $('b-detail').onclick = () => { S.detail = S.detail === 'high' ? 'low' : 'high'; applyDetail(); sync(); };
  $('b-orbit').onclick = () => { S.orbit = !S.orbit; controls.enabled = S.orbit; lastPivot.set(0, 0, 0); sync(); };
  $('b-2d').onclick = async () => { S.view2d = S.view2d === 'off' ? 'split' : S.view2d === 'split' ? 'only' : 'off'; await apply2d(); sync(); };
  $('b-skip').onclick = () => live.warm(30);
  $('b-sweep').onclick = () => { S.sweep = !S.sweep; sync(); };
  p.querySelectorAll('[data-spawn]').forEach((b) => { b.onclick = () => { b.classList.toggle('on', live.spawn(b.dataset.spawn)); setTimeout(() => b.classList.remove('on'), 400); }; });
  $('b-turn').onclick = () => { const r = live.comeAbout(); $('u-info').textContent = r === 'ok' ? 'Coming about: the helm holds the command for a second, then she swings round.' : 'Refused by the game: ' + r; };
  let paused = false;
  $('b-pause').onclick = () => { paused = !paused; window.__paused = paused; $('b-pause').textContent = paused ? 'Resume' : 'Pause'; $('b-pause').classList.toggle('on', paused); };
  $('b-ui').onclick = () => { p.style.display = 'none'; };
  addEventListener('keydown', (e) => { if (e.key === 'h' || e.key === 'H') p.style.display = p.style.display === 'none' ? '' : 'none'; if (e.key === '2') $('b-2d').click(); if (e.key === 'c' || e.key === 'C') $('b-turn').click(); if (e.key === 'o' || e.key === 'O') $('b-orbit').click(); });
  sync();
  $('u-info').innerHTML = 'Keys: H hides, O orbit, 2 show 2D, C come about. The simulation is the real game with ' + S.bots + ' bot crew; this page only draws it.<br><b>Not drawn in 3D yet:</b> parachutes and hook lines, the deflector shield, escort fighters, wreck break-up, weather (rain, snow, lightning), gas holes and patches, the lift cage moving, HUD.';
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
let last = performance.now(), fpsN = 0, fpsT = 0, fpsShown = '', worst = 0, msAcc = 0, jsMs = 0, firstFrame = true;
function frame(now) {
  requestAnimationFrame(frame);
  const gap = now - last;
  const dt = Math.min(0.05, gap / 1000), real = Math.min(0.25, gap / 1000);
  last = now;
  const t0 = performance.now();
  try {
    if (!window.__paused) { live.advance(real); simTime += real; }
    const t = simTime;
    const env = envIdOf(state);
    const map = state.course && state.course.map;
    if (world.envId !== env || world.cave !== !!(map && !map.open)) { world.setEnv(env, !!(map && !map.open)); }
    syncShips(t, dt);
    syncSky(t);
    kraken.update(state.creature, world.night);
    const cam = syncCamera(window.__paused ? 0 : dt);
    const main = state.ships[0];
    terrain.update(map, main ? main.pose.x + 800 : camTarget.x, main ? main.pose.y : -camTarget.y);
    const seaY = env === 'sea' && state.env && Number.isFinite(state.env.seaY) ? state.env.seaY : NaN;
    world.update(camera, camTarget, { w: cam.visW, h: cam.visH }, t, seaY);
    syncLights();
    const t1 = performance.now();
    if (S.view2d !== 'only') renderer.render(scene, camera);
    const t2 = performance.now();
    jsMs += t1 - t0; msAcc += t2 - t1;
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
    const info = renderer.info;
    fpsShown = `${fps.toFixed(0)} fps  |  frame ${(1000 / Math.max(1, fps)).toFixed(1)} ms  (worst ${worst.toFixed(0)})\nupdate ${(jsMs / fpsN).toFixed(1)} ms  render-call ${(msAcc / fpsN).toFixed(1)} ms\n${info.render.calls} draw calls  ${(info.render.triangles / 1000).toFixed(0)}k tris  ${canvas.width}x${canvas.height}`;
    $('hud').textContent = fpsShown;
    window.__stats = { fps, worst, update: jsMs / fpsN, render: msAcc / fpsN, calls: info.render.calls, tris: info.render.triangles };
    fpsN = 0; fpsT = now; worst = 0; msAcc = 0; jsMs = 0;
  }
  if (firstFrame) { firstFrame = false; window.__ready3d = true; }
  void TOD; void PAL; void config;
}

buildUI();
applyDetail();
renderer.shadowMap.enabled = look.shadows;
if (S.view2d !== 'off') apply2d();
// handy for the screenshot script and the console
window.__t3d = {
  state, live, scene, camera, renderer, world, models, S, kraken, terrain,
  setTod: (n) => { S.tod = n; world.setTod(n); },
  warm: (s) => live.warm(s),
  comeAbout: () => live.comeAbout(), spawn: (k) => live.spawn(k),
  info: () => ({ phase: state.phase, ship: state.ships.map((sh) => ({ id: sh.id, x: sh.pose.x, y: sh.pose.y, f: sh.pose.f, turn: sh.pose.turn })), creature: !!state.creature && state.creature.mode, env: envIdOf(state), tris: [...models.values()].map((e) => e.model.tris) }),
  look, applyLook: () => applyLook(scene),
};
requestAnimationFrame(frame);
