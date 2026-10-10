// The stage: the painted sky and parallax strips (art/backgrounds/<env>/, the same pictures as the 2D game, placed on big planes at depth), the cave backdrop,
// the lights (Day / Dusk / Night), and the Sunken Sea's flat toon water with slow stepped foam lines. All fixed to the world (nothing shimmers with the camera);
// the strips are world-fixed pictures at different depths, so the perspective itself gives the parallax.
import { THREE, PAL, INK, gradientMap, look } from './style.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const ENV_FILES = {
  aether: ['sky', 'clouds', 'far', 'mist', 'cave'], ember: ['sky', 'clouds', 'far', 'mid', 'mist', 'cave'], frost: ['sky', 'clouds', 'far', 'mid', 'mist', 'cave'],
  fungal: ['sky', 'far', 'mid', 'mist', 'cave'], sea: ['sky', 'clouds', 'far', 'mid', 'mist', 'cave'], skyisles: ['sky', 'clouds', 'far', 'mid', 'mist', 'cave'],
  storm: ['sky', 'clouds', 'far', 'mid', 'mist', 'cave'],
};
// Strips: depth behind the ship plane, world height of the picture, anchored to the bottom (or the top for clouds), alpha, and own drift (world units/s).
const STRIPS = [
  { kind: 'clouds', z: -9500, h: 4200, top: true, alpha: 1, drift: 12 },
  { kind: 'far', z: -8000, h: 4000, alpha: 0.9, drift: 0, lift: 0.02 },
  { kind: 'mist', z: -6200, h: 2900, alpha: 0.8, drift: -20, lift: 0.04 },
  { kind: 'mid', z: -4400, h: 2100, alpha: 1, drift: 0, lift: 0 },
];

export const TOD = {
  day: { bg: '#cfe3ea', sky: '#ffffff', hemi: ['#eef5f7', '#b49a78', 1.7], sun: ['#fff3d6', 2.9, [-0.55, 0.85, 0.75]], night: 0, cave: 0.75 },
  dusk: { bg: '#c98f78', sky: '#f2b99a', hemi: ['#c4a6b8', '#6a525a', 1.2], sun: ['#ff9d62', 2.3, [-1.0, 0.32, 0.7]], night: 0.35, cave: 0.5 },
  night: { bg: '#0a0f1e', sky: '#2a3354', hemi: ['#34457a', '#141828', 0.62], sun: ['#8fa2dc', 0.55, [-0.4, 0.9, 0.6]], night: 1, cave: 0.3 },
};

export function createWorld(scene, renderer) {
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const texCache = new Map();
  const tex = (env, kind, repeat) => {
    const key = env + '/' + kind;
    if (texCache.has(key)) return texCache.get(key);
    const t = loader.load(`art/backgrounds/${env}/${kind}.png`, (tt) => { tt.needsUpdate = true; }, undefined, () => { texCache.set(key, null); });
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(4, maxAniso);
    if (repeat) { t.wrapS = THREE.RepeatWrapping; if (repeat === 'xy') t.wrapT = THREE.RepeatWrapping; }
    texCache.set(key, t);
    return t;
  };

  // ---- lights ----------------------------------------------------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.castShadow = true;
  sun.shadow.camera.left = -2600; sun.shadow.camera.right = 2600; sun.shadow.camera.top = 2200; sun.shadow.camera.bottom = -2200;
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 9000;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 14;
  sun.shadow.mapSize.set(2048, 2048);
  sun.target = new THREE.Object3D();
  scene.add(hemi, sun, sun.target);

  // ---- backdrop --------------------------------------------------------------------------------------------------------------------------
  const back = new THREE.Group(); // follows the camera's x (and a damped y), faces the viewer
  scene.add(back);
  const skyMat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
  skyPlane.renderOrder = -20;
  skyPlane.frustumCulled = false;
  const stripMeshes = STRIPS.map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: s.alpha, color: '#ffffff' }));
    m.renderOrder = -19 + STRIPS.indexOf(s);
    m.frustumCulled = false;
    m.visible = false;
    back.add(m);
    return m;
  });
  const caveMat = new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false, toneMapped: false });
  const cavePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), caveMat);
  cavePlane.position.z = -600;
  cavePlane.renderOrder = -10;
  cavePlane.visible = false;
  cavePlane.frustumCulled = false;
  scene.add(cavePlane);

  // ---- water (Sunken Sea) ----------------------------------------------------------------------------------------------------------------
  const water = new THREE.Group();
  const wMat = new THREE.MeshToonMaterial({ color: '#6f9fae', gradientMap });
  const wPlain = new THREE.MeshStandardMaterial({ color: '#6f9fae', roughness: 0.6, metalness: 0 });
  const slabW = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wMat);
  slabW.userData.toon = wMat; slabW.userData.plain = wPlain; slabW.userData.shadowReceiver = true;
  slabW.receiveShadow = look.shadows;
  water.add(slabW);
  const foamMat = new THREE.MeshBasicMaterial({ color: '#eaf4f2' });
  const foams = [];
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), foamMat);
    f.userData.row = i;
    water.add(f);
    foams.push(f);
  }
  water.visible = false;
  scene.add(water);
  const frontDark = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#4d7a89' }));
  water.add(frontDark);

  const W = { tod: 'day', todCfg: TOD.day, night: 0, cave: false, envId: null, bgDim: 1, hemi, sun, water, backOn: true };

  W.setTod = (name) => {
    const c = TOD[name] || TOD.day;
    W.tod = name; W.todCfg = c; W.night = c.night;
    scene.background = new THREE.Color(c.bg);
    skyMat.color.set(c.sky);
    stripMeshes.forEach((m) => m.material.color.set(c.sky).lerp(new THREE.Color('#ffffff'), name === 'night' ? 0.0 : 0.35));
    W.applyLights();
  };
  W.applyLights = () => {
    const c = W.todCfg, k = W.cave ? c.cave : 1;
    hemi.color.set(c.hemi[0]); hemi.groundColor.set(c.hemi[1]); hemi.intensity = c.hemi[2] * (look.toon ? 1 : 1.1) * (W.cave ? Math.max(c.cave, 0.35) + 0.2 * (1 - c.night) : 1);
    sun.color.set(c.sun[0]); sun.intensity = c.sun[1] * k;
    sun.position.set(c.sun[2][0], c.sun[2][1], c.sun[2][2]).multiplyScalar(3800);
    sun.castShadow = look.shadows;
    const dim = W.cave ? c.cave : 1;
    caveMat.color.set('#ffffff').multiplyScalar(0.55 * dim + 0.1);
  };
  W.setShadowQuality = (size) => { if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } };

  // The sky for this environment; cave = the map is a cave (no sky strips, the cave picture behind the rock instead).
  W.setEnv = (envId, cave) => {
    W.envId = envId; W.cave = cave;
    const files = ENV_FILES[envId] || [];
    const skyTex = files.includes('sky') ? tex(envId, 'sky') : null;
    skyMat.map = skyTex; skyMat.needsUpdate = true;
    STRIPS.forEach((s, i) => {
      const m = stripMeshes[i];
      if (!files.includes(s.kind) || cave) { m.visible = false; return; }
      const t = tex(envId, s.kind, 'x');
      m.material.map = t; m.material.needsUpdate = true;
      m.visible = true;
    });
    cavePlane.visible = cave;
    if (cave && files.includes('cave')) { const t = tex(envId, 'cave', 'xy'); caveMat.map = t; caveMat.needsUpdate = true; }
    W.applyLights();
  };

  // Every frame. cam = the THREE camera; target = where it looks (3D), vis = world units visible at the ship plane { w, h }, t = seconds.
  W.update = (cam, target, vis, t, seaY) => {
    // the sky plane is stuck in front of the camera, far away, big enough to cover the view
    if (skyPlane.parent !== cam) cam.add(skyPlane);
    const dist = cam.far * 0.9, hh = 2 * dist * Math.tan((cam.fov * Math.PI) / 360) * 1.25;
    skyPlane.position.set(0, 0, -dist);
    skyPlane.scale.set(hh * cam.aspect, hh, 1);
    skyPlane.visible = !W.cave || true;
    // strips
    back.position.set(target.x, target.y, 0);
    const fovHalf = (cam.fov * Math.PI) / 360;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const pitchDown = Math.asin(clamp(-fwd.y, -1, 1));
    STRIPS.forEach((s, i) => {
      const m = stripMeshes[i];
      if (!m.visible) return;
      const tx = m.material.map;
      if (!tx || !tx.image) return;
      const widthW = 52000, tileW = s.h * 4;
      m.scale.set(widthW, s.h, 1);
      tx.repeat.set(widthW / tileW, 1);
      tx.offset.x = (target.x - widthW / 2 + s.drift * t) / tileW;
      // where the bottom and top of the screen are at this strip's depth (the camera looks a little downward): the strip hangs from the top (clouds) or stands on the bottom,
      // the way the 2D strips do; the picture's own size never depends on the zoom
      const hd = cam.position.z - s.z, a = fovHalf, pitch = pitchDown;
      const yBottom = cam.position.y - hd * Math.tan(pitch + a), yTop = cam.position.y - hd * Math.tan(pitch - a);
      const yAbs = s.top ? yTop - s.h * 0.5 + (yTop - yBottom) * 0.02 : yBottom + s.h * 0.5 - (yTop - yBottom) * 0.03 + s.lift * (yTop - yBottom);
      m.position.set(0, yAbs - target.y, s.z);
    });
    // the cave picture, world-fixed behind the rock
    if (cavePlane.visible && caveMat.map) {
      const pw = vis.w * 2.4, ph = vis.h * 2.4, tile = 900;
      cavePlane.scale.set(pw, ph, 1);
      cavePlane.position.x = target.x; cavePlane.position.y = target.y;
      caveMat.map.repeat.set(pw / tile, ph / tile);
      caveMat.map.offset.set((target.x - pw / 2) / tile, (target.y - ph / 2) / tile);
    }
    // the sea
    if (Number.isFinite(seaY)) {
      water.visible = true;
      const y = -seaY, wx = 60000, depth = 9000;
      slabW.scale.set(wx, depth, 1700);
      slabW.position.set(target.x, y - depth / 2, 40);
      frontDark.scale.set(wx, 1, 1);
      frontDark.visible = false;
      const span = 15000;
      foams.forEach((f) => { // flat white strips lying on the surface, sliding slowly in the world (rigid), re-used as they leave the view
        const i = f.userData.row, lane = (i % 3) - 1;
        const wx = i * 1670 + t * (24 + (i % 3) * 9);
        const cx = target.x + ((((wx - target.x + span / 2) % span) + span) % span) - span / 2;
        f.scale.set(620 + (i % 4) * 190, 5, 16);
        f.position.set(cx, y + 3, 240 + lane * 270 + (i % 2) * 90);
      });
    } else water.visible = false;
  };
  W.setLook = () => { W.applyLights(); };
  W.setTod('day');
  return W;
}
