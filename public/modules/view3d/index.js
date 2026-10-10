// The 3D view of the real game. createView3D({ canvas, state }) returns an object with renderFrame(now, view, opts): the same contract as the 2D renderer (render.js), so the host's
// frame loop only picks which one to call. It reads the game state (never changes it) and maps it into a Three.js scene: ships from their parts lists, crew, shells, bombs, fires,
// planes, bats, mines, the Kraken, the rock, the sea and the painted sky. The 2D canvas stays on top and draws only the HUD and arrows (host/main.js).
//
// view = the 2D camera's { cx, cy, zoom } (camera.js): it stays the authority; camera3d.js derives the perspective camera from it so the gameplay plane lines up with the HUD.
// opts = { width, height } the pixel size that view was made for (the 2D canvas), { t } animation seconds (default: now / 1000).
// No wobble: nothing here moves on a sine except the ship's own slow bob (the same one the 2D game has); see 3D.md section 1.
import { THREE, look, applyLook, INK, fx, setInkFor } from './style.js';
import { createPost } from './post.js';
import { TIERS, readAddress, resolveTier } from './quality.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld, TOD } from './world.js';
import { createTerrain } from './terrain.js';
import { buildShipModel } from './shipMesh.js';
import { createCrewLayer } from './crew.js';
import { createCreatureView } from './creature.js';
import { createFlyers } from './flyers.js';
import { createWorldObjects } from './worldObjects.js';
import { createTeamFlags } from './teamFlag.js'; // (WP15: the Versus team pennants on the masts)
import { createThreatGlows } from './glows3d.js';
import { createWreck3D } from './wreck3d.js';
import { createScenery } from './scenery.js';
import { createVfx } from './vfx.js';
import { createDestruction } from './destruction.js';
import { createDamageView } from './damageView.js';
import { createPartDamage } from './damageStates.js';
import { createBeams } from './beams.js';
import { createLightning } from './lightning.js';
import { createFungal } from './fungal.js';
import { createWeather } from './weather.js';
import { placeCamera, worldToScreen, FOV, ELEV } from './camera3d.js';
import { createCinema } from './cinema.js'; // WP11: the camera's cinematic moments
import { config } from '../../config.js';
import { createPorthole } from './porthole.js'; // WP11: the Versus far-ship porthole
import { envIdOf } from '../host/environments.js';
import { shipOf, teamOf } from '../host/ships.js';
import { inRock } from '../host/course.js';
import { darkTarget } from '../host/searchlight.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

// What the host shows in 2D that this view does not draw yet (logged once per session; gameplay never depends on drawing). WP9 drew the rest: the enemies and world objects (flyers.js, enemyArt.js, scenery.js, worldObjects.js, glows3d.js, wreck3d.js, parts3d/enemyDecor.js)
// and the labels on the HUD canvas (render.js drawOver3D).
export const NOT_DRAWN = [
  'the Ember Forge heat shimmer (skipped on purpose: it would have to move; WP12 drew the rest of the weather)',
  'the sky-dock "NEW: part" call-out',
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
//   orbit + allowOrbit (dev page), follow ('mid': look between the ship and the creature), shot (keep the drawing buffer), pixelRatio (function -> number),
//   tier ('high' | 'medium' | 'low', or a function returning one; ?tier= in the address wins; see quality.js), gpuTimer (measure GPU milliseconds per pass; the F meter and tools read V.stats().gpu)
// The look kill-switches (style.js `look`: bloom, lut, grain, fog, rim, lanterns, shadows, post) come from the address too: host.html?view=3d&look=nobloom,nofog.
export function createView3D({ canvas, state, settings = {}, onModels = null }) {
  const S = settings;
  if (S.toon != null) look.toon = !!S.toon;
  if (S.shadows != null) look.shadows = !!S.shadows;
  const address = readAddress(typeof location !== 'undefined' ? location.search : '');
  { // (ask first with a throwaway canvas: Three.js logs a console error when it cannot make a context, and the 2D fallback should be quiet)
    let probe = null;
    try { const c = document.createElement('canvas'); probe = c.getContext('webgl2'); const x = probe && probe.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch { probe = null; }
    if (!probe) throw new Error('WebGL 2 is not available');
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!S.shot });
  const gl = renderer.getContext();
  if (!gl || (gl.isContextLost && gl.isContextLost())) throw new Error('WebGL is not available');
  renderer.shadowMap.enabled = look.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap; // (A1: crisp cel shadows, not the soft blur)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; // (the composer's OutputPass does it for the whole picture; the direct draw, ?look=nopost, lets the materials do it. The painted planes are exempt, see style.js paintedPlane)
  renderer.info.autoReset = false; // (post.js resets it once a frame, so the numbers cover the scene pass and are not wiped by the later passes)
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 60, 70000);
  scene.add(camera);
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);
  const world = createWorld(scene, renderer);
  const terrain = createTerrain(worldRoot);
  const kraken = createCreatureView(worldRoot);
  let vfx = null; // (WP4: the particles; made below, after the ship models exist)
  const flyers = createFlyers(worldRoot, state, { P: () => (vfx && vfx.P && look.vfx ? vfx.P : null), shipPoint: (sh, x, y, z) => (V && V.hud3d ? V.hud3d.shipPt(sh, x, y, z) : null), mainShip: () => state.ships[0] });
  const worldObjects = createWorldObjects(worldRoot, state, { shipPoint: (sh, x, y, z) => (V && V.hud3d ? V.hud3d.shipPt(sh, x, y, z) : null), modelOf: (sh) => { const e = V && V.models && V.models.get(sh.id); return e ? e.model : null; }, crew: (key) => (V && V.crew ? V.crew.anchor(key) : null), mainShip: () => state.ships[0] });
  const scenery = createScenery(worldRoot, state, { P: () => (vfx && vfx.P && look.vfx ? vfx.P : null) });
  const glows = createThreatGlows(worldRoot, state);
  const wreck3d = createWreck3D({ P: () => (vfx && vfx.P && look.vfx ? vfx.P : null) });
  let controls = null;
  if (S.allowOrbit) {
    controls = new OrbitControls(camera, canvas);
    controls.enabled = !!S.orbit;
    controls.enableDamping = false;
    controls.maxDistance = 30000;
  }
  const post = createPost(renderer, scene, camera);
  const V = { S, renderer, scene, camera, world, terrain, kraken, controls, post, tier: TIERS.high, models: null, look, lost: false, errors: 0, lastErr: '', frames: 0, lastLog: '' };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); V.lost = true; });
  // WP11: ?cine=0 turns the cinematic camera moves off (for people who get motion-sick); the pause menu's Cinema button changes S.cine live (host/main.js)
  { const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cine') : null; if (q === '0' || q === 'off') S.cine = false; }
  const cinema = createCinema({ state, settings: S });
  V.cinema = cinema;
  let porthole = null; // (made on the first Versus split, Medium tier and up)

  // ---- size, detail and quality tier -------------------------------------------------------------------------------------------------------------------------------------
  let sizeKey = '', detail = null, tierName = '', flagKey = '';
  let tier = TIERS.high;
  const applyDetail = () => {
    const hi = (S.detail || 'high') === 'high';
    look.low = !hi;
    renderer.shadowMap.type = THREE.PCFShadowMap; // (A1: crisp cel shadows at every detail level; the radius is 1)
    scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    applyLook(scene);
    detail = S.detail || 'high';
    sizeKey = ''; // (the pixel ratio follows the detail)
  };
  // The look kill-switches and the tier decide what is on. Run when either changes (not every frame).
  const applyFlags = () => {
    const wasShadows = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = look.shadows && tier.shadows;
    world.lights.setTier(tier);
    world.setTier(tier);
    world.applyLights();
    if (wasShadows !== renderer.shadowMap.enabled) { scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); applyLook(scene); }
    for (const e of models.values()) capLamps(e.model);
  };
  const flagsNow = () => tier.name + [look.shadows, look.rim, look.lanterns, look.toon, look.dark, look.clouds, look.water].map((b) => (b ? 1 : 0)).join('');
  // Real lantern lights: the boiler's glow light first, then the lanterns (3D.md: 6 a ship on High, 2 on Medium, none on Low, where the lamps stay as glowing colour only).
  // The COUNT of lights in the scene only changes with the tier, so no shader is rebuilt when it gets dark.
  const capLamps = (model) => {
    const cap = look.lanterns ? tier.lanterns : 0;
    if (model.lampCap === cap) return;
    model.lampCap = cap;
    [...model.lights.boiler, ...model.lights.points].forEach((pl, i) => { pl.visible = i < cap; });
    // WP3 (dark caves): with fewer real lights a tier lets each reach further (the boiler's and the lanterns' window, in world units), so the crew's decks stay readable when it is dark
    const wide = cap >= 6 ? 1 : cap >= 1 ? 2.4 : 1;
    model.lights.points.forEach((pl) => { pl.distance = 420 * wide; });
    model.lights.boiler.forEach((pl) => { pl.distance = 380 * wide; });
  };
  const fit = () => {
    const w = Math.max(2, canvas.clientWidth || window.innerWidth), h = Math.max(2, canvas.clientHeight || window.innerHeight);
    const pr = clamp(Math.min(typeof S.pixelRatio === 'function' ? S.pixelRatio() : Math.min(window.devicePixelRatio || 1, (S.detail || 'high') === 'high' ? 2 : 1), tier.pixelRatioMax), 0.5, 2);
    const key = w + 'x' + h + '@' + pr;
    if (key === sizeKey) return;
    sizeKey = key;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    post.setSize(w, h, pr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  V.resize = () => { sizeKey = ''; };

  // ---- ship models and the crew aboard ---------------------------------------------------------------------------------------------------------------------------------
  const models = new Map(); // ship id -> { model, ver }
  V.models = models;
  // WP10: the searchlight beams (a pass of their own that reads the scene's depth), the light pools where they land and the lit-target rim (beams.js). If it cannot be made the old cones stay.
  let beams = null;
  try { beams = createBeams({ scene, post, world, state, models }); } catch (e) { console.warn('view3d beams off', e); look.beam = false; }
  V.beams = beams;
  // WP10: the lightning (the stepped flash and the jagged bolt: lightning.js reads the weather the game keeps)
  let lightning = null;
  try { lightning = createLightning({ scene, post, world, state }); } catch (e) { console.warn('view3d lightning off', e); }
  V.lightning = lightning;
  // WP7 (crew v2): every crewman, raider, parachute, hookshot rope and heart in ONE mesh (crew.js); the layer is fed once a frame from syncShips
  const crew = createCrewLayer(worldRoot);
  V.crew = crew;
  const teamFlags = createTeamFlags({ state, models }); // (WP15: a pole and a stepped pennant on every teamed ship; updated after syncShips)
  V.teamFlags = teamFlags;
  V.lineup = null; // (the dev page's crew line-up sets { x, y }: world point, y up)
  V.flyers = flyers; V.worldObjects = worldObjects; V.glows = glows; V.wreck3d = wreck3d; // (WP9: handles for the dev page and the gate)
  V.enemyLineup = null; // (WP9: the dev page's enemy line-up sets { x, y, page }: the middle of the picture in the 3D world, y up)
  // WP9: the 2D HUD canvas draws the crew's name labels, call-outs, progress bars and popups over this picture (render.js drawOver3D). It asks where things are on the screen through these:
  // project(x, y(up), z) -> { x, y } as 0..1 of the screen (null behind the camera); shipPt(ship, sx, sy, z) -> the 3D world point of a spot in a ship's own layout coordinates; crew(key) -> where a figure stands.
  const _hp = new THREE.Vector3();
  V.hud3d = {
    project: (x, y, z = 0) => { _hp.set(x, y, z).project(camera); return _hp.z > -1 && _hp.z < 1 ? { x: _hp.x * 0.5 + 0.5, y: -_hp.y * 0.5 + 0.5 } : null; },
    shipPt: (sh, x, y, z = 0) => { const e = models.get(sh.id); if (!e) return null; _hp.set(e.model.X(x), e.model.Y(y), z); e.model.content.localToWorld(_hp); return [_hp.x, _hp.y, _hp.z]; },
    crew: (key) => crew.anchor(key),
  };
  const teamColorOf = (p, sh) => { try { const side = p.team ? teamOf(p.team) : sh ? sh.team : state.ships[0] && state.ships[0].team; return side && side.color ? side.color : null; } catch { return null; } };
  // WP4: the particles (fire, smoke, steam, sparks, splinters, muzzle flashes, rings; vfx.js reads the game's state, particles.js draws). If they cannot be made the old flame cones and puff balls stay.
  try { vfx = createVfx({ state, scene: worldRoot, world, models }); } catch (e) { console.warn('view3d vfx off', e); }
  V.vfx = vfx;
  // WP5: broken-off parts as rigid bodies (destruction.js, the Rapier wreckage world loads a moment after the view starts) and the marks of the blows a ship took (damageView.js)
  const destruction = createDestruction({ parent: worldRoot, state, models, terrain, world, inRock });
  const damage = createDamageView({ state, models });
  // WP6: the damage state of every part (soot, dents, poses, smoke, scorch memory, breaches, the flat bag), on top of the poses shipMesh sets each frame
  const partDamage = createPartDamage({ state, models, vfx });
  V.destruction = destruction; V.damage = damage; V.partDamage = partDamage;
  // WP10: the Fungal Depths' glowing mushrooms, vine bulbs, motes and spore clouds (fungal.js; it listens to the rock's chunks, so it is made after the wreckage world took that slot)
  let fungal = null;
  try { fungal = createFungal({ parent: worldRoot, state, world, terrain }); } catch (e) { console.warn('view3d fungal off', e); }
  V.fungal = fungal;
  // WP12: weather and the seven environments (weather.js: rain, snow, embers, lava, frost crusts, rods, waterspouts, rafts, the pump, stars, aurora ...). If it cannot be made the picture is simply without it.
  let weather = null;
  try { weather = createWeather({ parent: worldRoot, state, world, models, vfx, renderer }); } catch (e) { console.warn('view3d weather off', e); }
  V.weather = weather;
  // The wreckage's smoke and sparks go through WP4's particles when they are there (both use 3D world coordinates, y up); otherwise destruction.js keeps its own puffs.
  if (vfx && vfx.P) {
    const P = vfx.P;
    destruction.hooks.smoke = (x, y, z, o = {}) => P.burst('smoke', x, y, z, 1, { size: (o.r || 22) * 2, life: o.life || 1.4, color: o.color, up: o.rise == null ? 36 : o.rise });
    destruction.hooks.spark = (x, y, z, o = {}) => P.burst('spark', x, y, z, o.n || 3, {});
  }
  if (vfx && vfx.P) { // WP8: a chunk of a severed limb that hits the sea throws spray too (the splash ring is still the sea's own)
    const P = vfx.P;
    destruction.hooks.splash = (x, y, size) => { world.splashAt(x, -y, size, 40); P.burst('drop', x, y, 40, Math.round(4 + size * 0.05), { dir: Math.PI / 2, spread: 0.7, speed: [120, 380], size: [8, 16], up: [40, 140], area: size * 0.2 }); };
  }
  kraken.link({ world, vfx, destruction, models, camera }); // (WP8: the creature view draws its water effects with the particles and its severed limbs as wreckage bodies)
  crew.vfx = vfx; // (a crewman fired from the crew cannon trails smoke)
  const modelFor = (sh) => {
    const ver = sh.layout.version;
    let e = models.get(sh.id);
    if (!e || e.ver !== ver) {
      if (e) { worldRoot.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); if (e.model.dispose) e.model.dispose(); }
      const gs = sh.ai && state.gunship && state.gunship.ship === sh ? state.gunship : null; // (the enemy gunship's blueprint: her flag, her emblem, her mast; and what her captain intends)
      const model = buildShipModel(sh.layout, { enemy: !!sh.ai, bp: gs ? gs.bp : null, gunship: gs });
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
  const INKK = () => fx.uInkScale.value; // (A1: the little ball shells grow their ink with the screen-constant ink scale)
  const setInst = (im, i, x, y, z, r, color) => {
    _M.compose(_P.set(x, y, z), _Q.identity(), _S.set(r, r, r));
    im.setMatrixAt(i, _M);
    if (color) im.setColorAt(i, _C.set(color));
  };
  const endInst = (im, n) => { im.count = n; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; };

  // ---- the per-frame mapping of the game state -> 3D ------------------------------------------------------------------------------------------------------------------------
  function syncShips(t, dt) {
    const seen = new Set();
    crew.begin(t, dt, tier, performance.now());
    state.ships.forEach((sh, index) => {
      const model = modelFor(sh);
      seen.add(sh.id);
      const pose = sh.pose, root = model.root;
      const bt = t + 2.7 * index;
      const bob = Math.sin(bt * 1.1) * 5 + Math.sin(bt * 0.37 + 1) * 3; // wobble-ok: the ship's own slow bob (the 2D game's, +-3 px), the one idle sine 3D.md allows
      root.position.set(pose.x + model.pv, -(pose.y + bob), 0);
      let yaw;
      if (pose.turn > 0) { const startF = pose.turn < 0.5 ? pose.f : -pose.f; yaw = Math.PI * pose.turn + (startF === -1 ? Math.PI : 0); } // COME ABOUT: a real half-turn about the vertical axis
      else yaw = pose.f === 1 ? 0 : Math.PI;
      root.rotation.y = yaw;
      model.pitchG.rotation.z = -(pose.pitch || 0);
      try { wreck3d.apply(sh, model, dt); } catch (e) { logOnce('wreck', e); } // (WP9: a ship breaking up tips and falls away, her bags peel off: wreck3d.js)
      root.updateMatrixWorld(true);
      const side = (camera.position.x - root.position.x) * Math.sin(yaw) + (camera.position.z - root.position.z) * Math.cos(yaw);
      const CB = (config.CINE3D && config.CINE3D.COME_ABOUT && config.CINE3D.COME_ABOUT.BOTH) || [0.3, 0.7];
      model.setView(side, pose.turn > CB[0] && pose.turn < CB[1]); // (A1: in the middle of a COME ABOUT the ship is end-on: show both hull walls, so she is a closed box and no black hole opens)
      model.flameFallback = !(vfx && look.vfx); // (the particle fires do the flames; the old cones only when the particles are off)
      capLamps(model);
      model.update({ t, ship: sh, world: state, night: world.night, lamps: !sh.ai, sweep: !!S.sweep, spotShadow: tier.spotShadow && world.night > 0.5 && index === 0, tier: tier.name });
      // crew aboard, raiders aboard (WP7: crew.js draws all of them in ONE mesh; the layer is begun / ended once a frame, below)
      const crewList = Object.values(state.players).filter((p) => !p.enemy && !p.hj && p.connected !== false && !p.fly && shipOf(state, p) === sh && !(p.lock && (state.escorts || []).some((e) => e.name === p.lock && e.flying)));
      const raiders = sh.ctx && sh.ctx.boarders ? sh.ctx.boarders : state.boarders || [];
      for (const p of crewList) crew.placeAboard(p.id, p, model, { teamColor: teamColorOf(p, sh) });
      raiders.forEach((r, i) => crew.placeAboard('r' + sh.id + (r.id || i), { ...r, id: 'r' + (r.id || i) }, model));
      if (sh.crewReg) for (const c of Object.values(sh.crewReg)) crew.placeAboard('g' + sh.id + c.id, c, model); // (the enemy gunship's own crew: skeleton raiders who live on her, ships.js crewReg)
    });
    // crew in free flight (jumped, thrown, swinging, fired from a crew cannon, under a parachute) are world objects
    for (const p of Object.values(state.players)) if (p.fly && !p.hj && !p.enemy && p.connected !== false) crew.placeFly(p.id, p, { teamColor: teamColorOf(p, null) });
    if (V.lineup) crew.lineup(V.lineup.x, V.lineup.y, V.lineup.page); // (the dev page's crew line-up)
    crew.end();
    for (const [id, e] of models) if (!seen.has(id)) { worldRoot.remove(e.model.root); e.model.root.traverse((o) => o.geometry && o.geometry.dispose()); if (e.model.dispose) e.model.dispose(); models.delete(id); if (onModels) onModels(models); }
  }

  function syncSky() {
    let n = 0;
    for (const s of state.shells) { // shells and enemy bullets
      if (n >= 400) break;
      if (!Number.isFinite(s.x) || s.life <= 0 || s.frag) continue;
      const owner = state.players[s.owner];
      const r = s.primed ? 20 : s.kind === 'mortar' ? 12 : 9;
      setInst(shellMesh, n, s.x, -s.y, 0, r, s.primed ? '#ff9a2e' : (owner && owner.color) || '#f2d36b');
      setInst(shellInk, n, s.x, -s.y, 0, r * (1 + 0.28 * INKK()));
      n++;
    }
    for (const b of state.bullets) {
      if (n >= 400) break;
      if (!Number.isFinite(b.x)) continue;
      setInst(shellMesh, n, b.x, -b.y, 0, b.flak ? 14 : 11, b.flak ? '#e8884a' : '#ff2e55');
      setInst(shellInk, n, b.x, -b.y, 0, (b.flak ? 14 : 11) * (1 + 0.28 * INKK()));
      n++;
    }
    endInst(shellMesh, n); endInst(shellInk, n);
    // bombs: ours falling (world), enemy bombs (world), planted bombs on decks (ship frame)
    let nb = 0;
    for (const list of [state.shipBombs, state.enemyBombs]) for (const b of list || []) { if (nb >= 80 || !Number.isFinite(b.x)) continue; setInst(bombMesh, nb, b.x, -b.y, 0, 17); setInst(bombInk, nb, b.x, -b.y, 0, 17 * (1 + 0.3 * INKK())); nb++; }
    for (const sh of state.ships) {
      const e = models.get(sh.id);
      if (!e) continue;
      const L = sh.layout;
      for (const b of (sh.ctx && sh.ctx.bombs) || []) { if (nb >= 80) break; const q = L.platforms[b.d]; if (!q) continue; _P.set(e.model.X(b.x), e.model.Y(q.y - 18), 0); e.model.content.localToWorld(_P); setInst(bombMesh, nb, _P.x, _P.y, _P.z, 18); setInst(bombInk, nb, _P.x, _P.y, _P.z, 18 * (1 + 0.3 * INKK())); nb++; }
    }
    endInst(bombMesh, nb); endInst(bombInk, nb);
    let np = 0; // puffs and smoke (the particles do these now; the balls stay only when they are off)
    for (const p of (vfx && look.vfx ? [] : state.puffs)) { if (np >= 200 || !Number.isFinite(p.x)) continue; const k = clamp(p.life / (p.max || 0.5), 0, 1); setInst(puffMesh, np, p.x, -p.y, 40, 8 + 22 * (1 - k), p.c || '#9a9a9a'); np++; }
    endInst(puffMesh, np);
  }

  // ---- camera and lights ---------------------------------------------------------------------------------------------------------------------------------------------------
  const camTarget = new THREE.Vector3();
  let lastView = null, lastPivot = new THREE.Vector3();
  let cineOn = false; // a cinematic is offsetting the camera this frame (the HUD asks hudView for the matching 2D view)
  function syncCamera(view, w, h, dt = 0) {
    if (view && Number.isFinite(view.cx) && Number.isFinite(view.cy) && Number.isFinite(view.zoom) && view.zoom > 0) lastView = view;
    let v = lastView || { cx: 800, cy: 400, zoom: 0.5 };
    if (S.follow === 'mid' && state.creature && state.ships[0]) { // (screenshots: look at the middle between the ship and the creature)
      const sh = state.ships[0], c = state.creature;
      v = { ...v, cx: (sh.pose.x + sh.layout.refPoint.x + c.x) / 2, cy: (sh.pose.y + sh.layout.refPoint.y + c.y) / 2 };
    }
    if (S.focus && state.creature) { const c = state.creature; v = { ...v, cx: c.x + (S.focus.dx || 0), cy: c.y + (S.focus.dy || 0) }; } // (dev / screenshots: look at the creature; settings.focus = { dx, dy } in game pixels)
    const orbit = !!(controls && S.orbit);
    let cine = null;
    if (!orbit) { try { cine = cinema.update(dt, v, w, h); } catch (e) { logOnce('cinema', e); cine = null; } }
    const info = placeCamera(camera, v, w, h, { zoom: Number(S.zoom) || 1, dy: S.lift || 0, skipPlace: orbit, cine });
    cineOn = !!(cine && cine.active);
    camera.userData.cine = cineOn;
    camTarget.copy(info.target);
    if (orbit) {
      controls.enabled = true;
      const main = state.ships[0], e = main && models.get(main.id);
      if (e) {
        const piv = e.model.root.position;
        if (lastPivot.lengthSq() === 0) { // just switched on: start from a three-quarter view of the ship, then the viewer drags it
          if (S.orbitSide) { // WP13 (the build page): start from the plain side view the gameplay lens gives, so the first drag turns the ship from there; resetOrbit() comes back to it
            controls.target.copy(info.target);
            camera.position.set(info.target.x, info.target.y + info.D * Math.tan(ELEV), info.D);
          } else {
            controls.target.set(piv.x, piv.y + 300, 0);
            camera.position.set(piv.x + info.D * 0.46, piv.y + 300 + info.D * 0.3, info.D * 0.8);
          }
        } else { const d = _P.copy(piv).sub(lastPivot); controls.target.add(d); camera.position.add(d); } // (then she carries the camera along)
        lastPivot.copy(piv);
      }
      controls.update();
      camera.updateMatrixWorld(true);
    } else { lastPivot.set(0, 0, 0); if (controls) controls.enabled = false; }
    return info;
  }

  // The key light's shadow camera follows the framed ships (snapped to 200 units, lights.js fit) and the fog keeps its strength at the ship plane whatever the zoom.
  const shipPts = [];
  function syncLights() {
    shipPts.length = 0;
    for (const e of models.values()) { const p = e.model.root.position; shipPts.push({ x: p.x, y: p.y }); }
    const cr = state.creature;
    if (cr && Number.isFinite(cr.x) && Number.isFinite(cr.y)) shipPts.push({ x: cr.x, y: -cr.y }); // (the Kraken's shadow too)
    world.lights.fit(shipPts, camTarget);
    world.lights.setFogDistance(camera.position.distanceTo(camTarget));
    syncCloudAvoid();
  }
  // WP9: the ships' box on the screen (their bounds projected), so the few clouds in FRONT of the ships keep out of it (clouds.js setAvoid)
  const _av = new THREE.Vector3();
  function syncCloudAvoid() {
    let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
    for (const e of models.values()) {
      const m = e.model, b = m.layout && m.layout.bounds;
      if (!b) continue;
      const p = m.root.position, hx = Math.max(Math.abs(b.x0 - m.pv), Math.abs(b.x1 - m.pv));
      for (const [cx, cy] of [[-hx, b.y0], [hx, b.y0], [-hx, b.y1], [hx, b.y1]]) {
        _av.set(p.x + cx, p.y - cy, 0).project(camera);
        if (!Number.isFinite(_av.x) || !Number.isFinite(_av.y)) continue;
        x0 = Math.min(x0, _av.x); x1 = Math.max(x1, _av.x); y0 = Math.min(y0, _av.y); y1 = Math.max(y1, _av.y);
      }
    }
    if (x0 <= x1) world.clouds.setAvoid(x0, y0, x1, y1);
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
  let lastNow = null, jsMs = 0, renderMs = 0, vfxMs = 0;
  V.renderFrame = (now, view, opts = {}) => {
    if (V.lost) return;
    const dt = lastNow == null ? 0 : clamp((now - lastNow) / 1000, 0, 0.05);
    lastNow = now;
    const t = Number.isFinite(opts.t) ? opts.t : now / 1000;
    const j0 = performance.now();
    const wantTier = resolveTier(S, address.tier);
    if (wantTier.name !== tierName) { tier = wantTier; tierName = tier.name; V.tier = tier; flagKey = ''; sizeKey = ''; if (vfx) vfx.setTier(tier); }
    if (detail !== (S.detail || 'high')) applyDetail();
    if (flagsNow() !== flagKey) { flagKey = flagsNow(); applyFlags(); }
    fit();
    const w = opts.width || canvas.width, h = opts.height || canvas.height;
    const env = envIdOf(state);
    const map = state.course && state.course.map;
    if (world.envId !== env || world.cave !== !!(map && !map.open)) world.setEnv(env, !!(map && !map.open));
    terrain.setEnv(env);
    syncTod(dt);
    const cam = syncCamera(view, w, h, dt);
    setInkFor(cam.D, cam.visH); // (A1: ONE number a frame makes every outline screen-constant: style.js)
    if (beams) { try { beams.updateLit(camera, state, world.night); } catch (e) { logOnce('lit', e); } } // (which targets a manned beam holds: the toon shader gives them a warm rim)
    try { destruction.process(); } catch (e) { logOnce('destruction', e); } // (the break-off notes are read BEFORE syncShips rebuilds a ship from her new layout)
    syncShips(t, dt);
    try { teamFlags.update(t, lastView ? lastView.zoom : 1); } catch (e) { logOnce('teamFlags', e); }
    try { damage.update(world.night); } catch (e) { logOnce('damage', e); }
    try { partDamage.update(dt, t, world.night); } catch (e) { logOnce('partDamage', e); }
    syncSky();
    const main = state.ships[0];
    try { flyers.update(t, main ? main.pose.vx || 0 : 0, { dt, zoomEq: h / Math.max(1, cam.visH), lineup: V.enemyLineup }); } catch (e) { logOnce("flyers", e); }
    try { glows.update(t, look.glows && state.phase !== 'lobby'); } catch (e) { logOnce('glows', e); }
    try { worldObjects.update(t, dt, { x: camTarget.x, y: camTarget.y, D: cam.D, hw: cam.visW / 2, hh: cam.visH / 2 }); } catch (e) { logOnce('worldObjects', e); }
    try { scenery.update(camTarget.x, cam.visW / 2, { t, dt }); } catch (e) { logOnce('scenery', e); }
    const seaNow = env === 'sea' && state.env && Number.isFinite(state.env.seaY) ? state.env.seaY : null;
    try { kraken.update(state.creature, world.night, dt, t, { state, sea: seaNow, tier }); } catch (e) { logOnce('creature', e); }
    if (weather) { try { weather.update({ t, dt, env, cave: world.cave, night: world.night, tier, cam: { visW: cam.visW, visH: cam.visH }, target: camTarget, camera, sea: seaNow, map }); } catch (e) { logOnce('weather', e); } } // (WP12: before the particles: its sprites and bursts ride vfx.update's hook)
    if (vfx) { // the particles (after the ships and the Kraken are placed: the emitters read their world positions)
      const v0 = performance.now();
      try {
        if (look.vfx) vfx.update(dt, t, { cam: S.orbit ? null : { x: camTarget.x, y: camTarget.y, hw: cam.visW / 2, hh: cam.visH / 2 }, night: world.night, hemi: world.hemi });
        else vfx.clear();
      } catch (e) { logOnce('vfx', e); }
      vfxMs = performance.now() - v0;
    }
    terrain.update(map, camTarget.x, -camTarget.y);
    const seaY = env === 'sea' && state.env && Number.isFinite(state.env.seaY) ? state.env.seaY : NaN;
    world.update(camera, camTarget, { w: cam.visW, h: cam.visH }, t, seaY, map);
    if (fungal) { try { fungal.update({ t, camTarget, vis: { w: cam.visW, h: cam.visH } }); } catch (e) { logOnce('fungal', e); } }
    if (V.frames === 40) destruction.warm(); // (the wreckage engine loads in the background, long before anything breaks)
    destruction.setSea(seaY);
    try { destruction.update(dt); } catch (e) { logOnce('wreckage', e); }
    syncLights();
    if (beams) { try { beams.update({ t, dt, night: world.night, tier, env, cave: world.cave, sea: seaNow, camera }); } catch (e) { logOnce('beams', e); } } // (after the ships are placed: the lamps' world positions)
    if (lightning) { try { lightning.update({ cam, target: camTarget }); } catch (e) { logOnce('lightning', e); } }
    const j1 = performance.now();
    const rig = world.lights.rig, usePost = !!(look.post && post.enabled);
    renderer.toneMappingExposure = world.lights.exposure;
    fx.uUntone.value = usePost ? 1 : 0;
    if (usePost) {
      post.configure(tier, rig, rig.id, world.lights.exposure);
      if (post.timing) post.timing.on = !!S.gpuTimer;
      post.render(dt);
      if (S.gpuTimer && post.pollTiming) post.pollTiming();
    } else {
      renderer.info.reset();
      renderer.render(scene, camera);
    }
    mainInfo.calls = renderer.info.render.calls; mainInfo.tris = renderer.info.render.triangles; // (the porthole's own passes would overwrite these)
    // WP11: the Versus porthole on the far ship: a second, small draw of the same scene over the big picture (porthole.js). The HUD draws its frame (hudLayers below). Low keeps the 2D inset.
    V.portholeLive = false;
    if (view && view.inset && !S.orbit && tier.name !== 'low' && look.post && post.enabled && !(porthole && porthole.error)) {
      try {
        if (!porthole) { porthole = createPorthole({ renderer, scene, world }); V.porthole = porthole; }
        const cssW = Math.max(2, canvas.clientWidth || window.innerWidth), cssH = Math.max(2, canvas.clientHeight || window.innerHeight), u = Math.max(0.7, h / 900);
        V.portholeLive = porthole.render(view.inset, cssW / Math.max(1, w), cssW, cssH, { dt, t, seaY: seaNow == null ? NaN : seaNow, map, tier, margin: 4 * u });
      } catch (e) { logOnce('porthole', e); }
    }
    const j2 = performance.now();
    jsMs = j1 - j0; renderMs = j2 - j1;
    V.frames++;
  };
  const mainInfo = { calls: 0, tris: 0 };
  // WP11: the 2D view that matches the camera NOW (the HUD's arrows and marks are laid out from a 2D { cx, cy, zoom }): the same view while the camera is the plain gameplay lens, otherwise the
  // plane's mapping fitted at the look-at point (exact for a kick or a pull-back, close for a yaw). The labels over the crew do not need it: they project through hud3d.
  V.hudView = (view, w, h) => {
    if (!cineOn || !view) return view;
    const T = camTarget, s0 = worldToScreen(camera, T.x, -T.y, w, h), s1 = worldToScreen(camera, T.x + 400, -T.y, w, h);
    const z = (s1.x - s0.x) / 400;
    if (!(z > 0.01) || !Number.isFinite(s0.x) || !Number.isFinite(s0.y)) return view;
    return { ...view, cx: T.x - (s0.x - w / 2) / z, cy: -T.y - (s0.y - h / 2) / z, zoom: z };
  };
  // WP11 alignment check: how far (screen pixels, worst of a 7 x 5 grid of plane points) the 3D projection is from the 2D camera's own mapping of the same points. Zero-ish (< 1 px) whenever no cinematic is running.
  V.alignError = (view, w, h) => {
    if (!view || !(view.zoom > 0)) return NaN;
    let worst = 0;
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) {
      const mx = view.cx + (i / 3) * (w / 2 / view.zoom) * 0.9, my = view.cy + (j / 2) * (h / 2 / view.zoom) * 0.9;
      const p = worldToScreen(camera, mx, my, w, h), ex = w / 2 + (mx - view.cx) * view.zoom, ey = h / 2 + (my - view.cy) * view.zoom;
      worst = Math.max(worst, Math.hypot(p.x - ex, p.y - ey));
    }
    return worst;
  };
  const logOnce = (what, e) => { const m = what + ': ' + String(e && e.message ? e.message : e) + (e && e.stack ? ' @ ' + String(e.stack).split('\n').slice(1, 3).map((s) => s.trim().replace(/https?:\/\/[^/]+\//, '')).join(' | ') : ''); if (m !== V.lastLog) { V.lastLog = m; console.warn('view3d', m); } };

  // numbers for the F meter and the perf gate
  // calls / tris = the whole frame (scene + post passes); sceneCalls / sceneTris = the scene pass alone (the budget's numbers); gpu = GPU ms per pass when settings.gpuTimer is on
  V.stats = () => {
    const i = renderer.info, p = post.enabled && look.post;
    const ph = porthole && V.portholeLive ? { ms: porthole.ms, calls: porthole.calls, tris: porthole.tris, w: porthole.w, h: porthole.h } : null; // (WP11: the Versus porthole's own numbers; calls / tris / sceneCalls below are the MAIN picture's)
    return { porthole: ph, cine: cineOn, calls: mainInfo.calls || i.render.calls, tris: mainInfo.tris || i.render.triangles, sceneCalls: p ? post.sceneCalls : i.render.calls, sceneTris: p ? post.sceneTris : i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, jsMs, renderMs, w: canvas.width, h: canvas.height, tier: tier.name, post: p, gpu: post.timing && post.timing.ms, vfx: vfx ? vfx.stats() : null, vfxMs, crew: crew.stats() };
  };
  V.setTod = (name) => { S.tod = name || ''; };
  V.resetOrbit = () => { lastPivot.set(0, 0, 0); }; // WP13: the next orbit frame starts from the starting view again (the build page's double-click)
  V.dispose = () => { for (const part of [beams, lightning, fungal, porthole, weather, teamFlags]) { try { if (part && part.dispose) part.dispose(); } catch { /* (gone) */ } } try { destruction.dispose(); } catch { /* (gone) */ } try { renderer.dispose(); } catch { /* (gone) */ } };

  applyDetail();
  console.info('view3d: not drawn yet - ' + NOT_DRAWN.join('; '));
  return V;
}
