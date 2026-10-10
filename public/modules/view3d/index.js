// The 3D view of the real game. createView3D({ canvas, state }) returns an object with renderFrame(now, view, opts): the same contract as the 2D renderer (render.js), so the host's
// frame loop only picks which one to call. It reads the game state (never changes it) and maps it into a Three.js scene: ships from their parts lists, crew, shells, bombs, fires,
// planes, bats, mines, the Kraken, the rock, the sea and the painted sky. The 2D canvas stays on top and draws only the HUD and arrows (host/main.js).
//
// view = the 2D camera's { cx, cy, zoom } (camera.js): it stays the authority; camera3d.js derives the perspective camera from it so the gameplay plane lines up with the HUD.
// opts = { width, height } the pixel size that view was made for (the 2D canvas), { t } animation seconds (default: now / 1000).
// No wobble: nothing here moves on a sine except the ship's own slow bob (the same one the 2D game has); see 3D.md section 1.
import { THREE, look, applyLook, INK } from './style.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld, TOD } from './world.js';
import { createTerrain } from './terrain.js';
import { buildShipModel } from './shipMesh.js';
import { makeFigure } from './crew.js';
import { createKrakenView } from './kraken.js';
import { createFlyers } from './flyers.js';
import { createScenery } from './scenery.js';
import { placeCamera, FOV } from './camera3d.js';
import { envIdOf } from '../host/environments.js';
import { shipOf } from '../host/ships.js';
import { darkTarget } from '../host/searchlight.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// What the host shows in 2D that this view does not draw yet (logged once per session; gameplay never depends on drawing).
export const NOT_DRAWN = [
  'turret warning lines, beacon sweep light, waving flags and chimney smoke',
  'snipers, tugs and imps (specials)',
  'gas holes and patches, hooks and hook lines, the deflector shield, the lightning coil, towlines',
  'weather (rain, snow, lightning, storm), embers and spore clouds',
  'muzzle flashes, impact rings and popup words',
  'the Versus wind wall and the far-ship porthole',
  'wreck break-up when the ship goes down',
  'progress bars over fires, breaches and crew, HELP call-outs, job chevrons, close-call chevrons',
  'the darkness overlay (the lights do it in 3D)',
];

// day -> dusk -> night, blended by how dark the game says the sky is (searchlight.js darkTarget), so caves and dark skies light themselves
const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
function blendTod(a, b, k) {
  const n = (x, y) => x + (y - x) * k;
  return { bg: mixHex(a.bg, b.bg, k), sky: mixHex(a.sky, b.sky, k), hemi: [mixHex(a.hemi[0], b.hemi[0], k), mixHex(a.hemi[1], b.hemi[1], k), n(a.hemi[2], b.hemi[2])], sun: [mixHex(a.sun[0], b.sun[0], k), n(a.sun[1], b.sun[1]), a.sun[2].map((v, i) => n(v, b.sun[2][i]))], night: n(a.night, b.night), cave: n(a.cave, b.cave) };
}
const todFor = (d) => (d <= 0.5 ? blendTod(TOD.day, TOD.dusk, d / 0.5) : blendTod(TOD.dusk, TOD.night, (d - 0.5) / 0.5));

// settings (all optional, shared and live: the dev page changes them while it runs):
//   sweep (idle lamps sweep, a demo; default off), toon, shadows, detail ('high' | 'low'), tod ('day' | 'dusk' | 'night' | '' = from the game's darkness), zoom (camera distance divisor),
//   orbit + allowOrbit (dev page), follow ('mid': look between the ship and the creature), shot (keep the drawing buffer), pixelRatio (function -> number)
export function createView3D({ canvas, state, settings = {}, onModels = null }) {
  const S = settings;
  if (S.toon != null) look.toon = !!S.toon;
  if (S.shadows != null) look.shadows = !!S.shadows;
  { // (ask first with a throwaway canvas: Three.js logs a console error when it cannot make a context, and the 2D fallback should be quiet)
    let probe = null;
    try { const c = document.createElement('canvas'); probe = c.getContext('webgl2'); const x = probe && probe.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch { probe = null; }
    if (!probe) throw new Error('WebGL 2 is not available');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!S.shot });
  const gl = renderer.getContext();
  if (!gl || (gl.isContextLost && gl.isContextLost())) throw new Error('WebGL is not available');
  renderer.shadowMap.enabled = look.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 60, 70000);
  scene.add(camera);
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);
  const world = createWorld(scene, renderer);
  const terrain = createTerrain(worldRoot);
  const kraken = createKrakenView(worldRoot);
  const flyers = createFlyers(worldRoot, state);
  const scenery = createScenery(worldRoot, state);
  let controls = null;
  if (S.allowOrbit) {
    controls = new OrbitControls(camera, canvas);
    controls.enabled = !!S.orbit;
    controls.enableDamping = false;
    controls.maxDistance = 30000;
  }
  const V = { renderer, scene, camera, world, terrain, kraken, controls, models: null, look, lost: false, errors: 0, lastErr: '', frames: 0, lastLog: '' };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); V.lost = true; });

  // ---- size and detail -----------------------------------------------------------------------------------------------------------------------------------------------
  let sizeKey = '', detail = null;
  const applyDetail = () => {
    const hi = (S.detail || 'high') === 'high';
    look.low = !hi;
    renderer.shadowMap.type = hi ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    applyLook(scene);
    world.setShadowQuality(hi ? 4096 : 1024);
    detail = S.detail || 'high';
    sizeKey = ''; // (the pixel ratio follows the detail)
  };
  const fit = () => {
    const w = Math.max(2, canvas.clientWidth || window.innerWidth), h = Math.max(2, canvas.clientHeight || window.innerHeight);
    const pr = clamp(typeof S.pixelRatio === 'function' ? S.pixelRatio() : Math.min(window.devicePixelRatio || 1, (S.detail || 'high') === 'high' ? 2 : 1), 0.5, 2);
    const key = w + 'x' + h + '@' + pr;
    if (key === sizeKey) return;
    sizeKey = key;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  V.resize = () => { sizeKey = ''; };

  // ---- ship models and the crew aboard ---------------------------------------------------------------------------------------------------------------------------------
  const models = new Map(); // ship id -> { model, ver }
  const figures = new Map(); // player / raider -> { fig, shipId }
  V.models = models;
  const modelFor = (sh) => {
    const ver = sh.layout.version;
    let e = models.get(sh.id);
    if (!e || e.ver !== ver) {
      if (e) { worldRoot.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); for (const [k, f] of figures) if (f.shipId === sh.id) { f.fig.group.removeFromParent(); figures.delete(k); } }
      const model = buildShipModel(sh.layout, { enemy: !!sh.ai });
      worldRoot.add(model.root);
      e = { model, ver };
      models.set(sh.id, e);
      if (onModels) onModels(models);
    }
    return e.model;
  };
  V.fallbacks = () => { const all = []; for (const [id, e] of models) for (const f of e.model.fallbacks) all.push((models.size > 1 ? id + ': ' : '') + f); return all; };

  // ---- instanced extras: shells, bombs, puffs -------------------------------------------------------------------------------------------------------------------------------
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

  // ---- the per-frame mapping of the game state -> 3D ------------------------------------------------------------------------------------------------------------------------
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
      model.update({ t, ship: sh, world: state, night: world.night, lamps: !sh.ai, sweep: !!S.sweep, spotShadow: world.night > 0.5 && index === 0 });
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
    for (const [id, e] of models) if (!seen.has(id)) { worldRoot.remove(e.model.root); models.delete(id); if (onModels) onModels(models); }
  }

  function syncSky() {
    let n = 0;
    for (const s of state.shells) { // shells and enemy bullets
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
    for (const sh of state.ships) {
      const e = models.get(sh.id);
      if (!e) continue;
      const L = sh.layout;
      for (const b of (sh.ctx && sh.ctx.bombs) || []) { if (nb >= 80) break; const q = L.platforms[b.d]; if (!q) continue; _P.set(e.model.X(b.x), e.model.Y(q.y - 18), 0); e.model.content.localToWorld(_P); setInst(bombMesh, nb, _P.x, _P.y, _P.z, 18); setInst(bombInk, nb, _P.x, _P.y, _P.z, 23); nb++; }
    }
    endInst(bombMesh, nb); endInst(bombInk, nb);
    let np = 0; // puffs and smoke
    for (const p of state.puffs) { if (np >= 200 || !Number.isFinite(p.x)) continue; const k = clamp(p.life / (p.max || 0.5), 0, 1); setInst(puffMesh, np, p.x, -p.y, 40, 8 + 22 * (1 - k), p.c || '#9a9a9a'); np++; }
    endInst(puffMesh, np);
  }

  // ---- camera and lights ---------------------------------------------------------------------------------------------------------------------------------------------------
  const camTarget = new THREE.Vector3();
  let lastView = null, lastPivot = new THREE.Vector3();
  function syncCamera(view, w, h) {
    if (view && Number.isFinite(view.cx) && Number.isFinite(view.cy) && Number.isFinite(view.zoom) && view.zoom > 0) lastView = view;
    let v = lastView || { cx: 800, cy: 400, zoom: 0.5 };
    if (S.follow === 'mid' && state.creature && state.ships[0]) { // (screenshots: look at the middle between the ship and the creature)
      const sh = state.ships[0], c = state.creature;
      v = { ...v, cx: (sh.pose.x + sh.layout.refPoint.x + c.x) / 2, cy: (sh.pose.y + sh.layout.refPoint.y + c.y) / 2 };
    }
    const orbit = !!(controls && S.orbit);
    const info = placeCamera(camera, v, w, h, { zoom: Number(S.zoom) || 1, dy: S.lift || 0, skipPlace: orbit });
    camTarget.copy(info.target);
    if (orbit) {
      controls.enabled = true;
      const main = state.ships[0], e = main && models.get(main.id);
      if (e) {
        const piv = e.model.root.position;
        if (lastPivot.lengthSq() === 0) { // just switched on: start from a three-quarter view of the ship, then the viewer drags it
          controls.target.set(piv.x, piv.y + 300, 0);
          camera.position.set(piv.x + info.D * 0.46, piv.y + 300 + info.D * 0.3, info.D * 0.8);
        } else { const d = _P.copy(piv).sub(lastPivot); controls.target.add(d); camera.position.add(d); } // (then she carries the camera along)
        lastPivot.copy(piv);
      }
      controls.update();
      camera.updateMatrixWorld(true);
    } else { lastPivot.set(0, 0, 0); if (controls) controls.enabled = false; }
    return info;
  }

  function syncLights() {
    const snap = 200;
    const x = Math.round(camTarget.x / snap) * snap, y = Math.round(camTarget.y / snap) * snap;
    world.sun.target.position.set(x, y, 0);
    world.sun.position.copy(world.sunDir).multiplyScalar(3800).add(world.sun.target.position);
  }

  // ---- light: the dev page can pin day / dusk / night; the game lets the darkness decide -----------------------------------------------------------------------------
  let dark = null, darkApplied = -1, pinned = null;
  function syncTod(dt) {
    if (S.tod) {
      if (pinned !== S.tod) { pinned = S.tod; world.setTod(S.tod); darkApplied = -1; }
      return;
    }
    pinned = null;
    const target = clamp(darkTarget(state), 0, 1);
    dark = dark == null ? target : dark + (target - dark) * Math.min(1, dt * 1.6);
    if (Math.abs(dark - darkApplied) > 0.01 || world.tod !== 'auto') { TOD.auto = todFor(dark); world.setTod('auto'); darkApplied = dark; }
  }

  // ---- the frame -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  let lastNow = null, jsMs = 0, renderMs = 0;
  V.renderFrame = (now, view, opts = {}) => {
    if (V.lost) return;
    const dt = lastNow == null ? 0 : clamp((now - lastNow) / 1000, 0, 0.05);
    lastNow = now;
    const t = Number.isFinite(opts.t) ? opts.t : now / 1000;
    const j0 = performance.now();
    if (detail !== (S.detail || 'high')) applyDetail();
    fit();
    const w = opts.width || canvas.width, h = opts.height || canvas.height;
    const env = envIdOf(state);
    const map = state.course && state.course.map;
    if (world.envId !== env || world.cave !== !!(map && !map.open)) world.setEnv(env, !!(map && !map.open));
    syncTod(dt);
    const cam = syncCamera(view, w, h);
    syncShips(t, dt);
    syncSky();
    const main = state.ships[0];
    try { flyers.update(t, main ? main.pose.vx || 0 : 0); } catch (e) { logOnce('flyers', e); }
    try { scenery.update(camTarget.x, cam.visW / 2); } catch (e) { logOnce('scenery', e); }
    kraken.update(state.creature, world.night);
    terrain.update(map, camTarget.x, -camTarget.y);
    const seaY = env === 'sea' && state.env && Number.isFinite(state.env.seaY) ? state.env.seaY : NaN;
    world.update(camera, camTarget, { w: cam.visW, h: cam.visH }, t, seaY);
    syncLights();
    const j1 = performance.now();
    renderer.render(scene, camera);
    const j2 = performance.now();
    jsMs = j1 - j0; renderMs = j2 - j1;
    V.frames++;
  };
  const logOnce = (what, e) => { const m = what + ': ' + String(e && e.message ? e.message : e); if (m !== V.lastLog) { V.lastLog = m; console.warn('view3d', m); } };

  // numbers for the F meter and the perf gate
  V.stats = () => { const i = renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, jsMs, renderMs, w: canvas.width, h: canvas.height }; };
  V.setTod = (name) => { S.tod = name || ''; };
  V.dispose = () => { try { renderer.dispose(); } catch { /* (gone) */ } };

  applyDetail();
  console.info('view3d: not drawn yet - ' + NOT_DRAWN.join('; '));
  return V;
}
