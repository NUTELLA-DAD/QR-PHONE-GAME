// The painted backdrop (the "two worlds" rule: the world is lit 3D, the backgrounds stay PAINTED). The sky picture (art/backgrounds/<env>/sky.png, the same one the 2D game uses) is a
// big plane glued to the camera, and the parallax strips (clouds, far hills, mist, mid hills) are world-fixed pictures at different depths, so the perspective gives the parallax. All of
// them are UNLIT MeshBasicMaterial with toneMapped:false and fog:false (style.js paintedPlane: they also undo the composer's tone mapping so they come out exactly as painted). In a cave
// the cave picture stands behind the rock instead; that one is lit (the lamps' beams land on it). Everything is fixed to the world: nothing shimmers as the camera moves.
import { THREE, gradientMap, look, paintedPlane } from './style.js';
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

export function createSky(scene, renderer) {
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

  const back = new THREE.Group(); // follows the camera's x (and a damped y), faces the viewer
  scene.add(back);
  const skyMat = paintedPlane(new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false }));
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), skyMat);
  skyPlane.renderOrder = -20;
  skyPlane.frustumCulled = false;
  const stripMeshes = STRIPS.map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), paintedPlane(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: s.alpha, color: '#ffffff' })));
    m.renderOrder = -19 + STRIPS.indexOf(s);
    m.frustumCulled = false;
    m.visible = false;
    back.add(m);
    return m;
  });
  const caveMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap }); // (lit: the lamps' beams land on it)
  caveMat.color.multiplyScalar(0.85);
  const cavePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), caveMat);
  cavePlane.position.z = -420;
  cavePlane.userData.shadowReceiver = true;
  cavePlane.receiveShadow = look.shadows;
  cavePlane.renderOrder = -10;
  cavePlane.visible = false;
  cavePlane.frustumCulled = false;
  scene.add(cavePlane);
  const fwd = new THREE.Vector3();

  const S = { skyMat, skyPlane, caveMat, cavePlane };

  // The picture tint (the darkness): c = a light preset (world.js / lights.js TOD), name = day | dusk | night | auto.
  S.setColors = (c, name) => {
    scene.background = new THREE.Color(c.bg);
    skyMat.color.set(c.sky);
    stripMeshes.forEach((m) => m.material.color.set(c.sky).lerp(_white, name === 'night' ? 0.0 : 0.35));
  };
  const _white = new THREE.Color('#ffffff');

  // The sky for this environment; cave = the map is a cave (no sky strips, the cave picture behind the rock instead).
  S.setEnv = (envId, cave) => {
    const files = ENV_FILES[envId] || [];
    const skyTex = files.includes('sky') ? tex(envId, 'sky') : null;
    skyMat.map = skyTex; skyMat.needsUpdate = true;
    STRIPS.forEach((s, i) => {
      const m = stripMeshes[i];
      if (!files.includes(s.kind) || cave) { m.visible = false; m.userData.on = false; return; }
      const t = tex(envId, s.kind, 'x');
      m.material.map = t; m.material.needsUpdate = true;
      m.visible = true; m.userData.on = true;
    });
    cavePlane.visible = cave;
    if (cave && files.includes('cave')) { const t = tex(envId, 'cave', 'xy'); caveMat.map = t; caveMat.emissiveMap = t; caveMat.emissive.set('#ffffff'); caveMat.emissiveIntensity = 0.2; caveMat.needsUpdate = true; }
  };

  // Every frame. cam = the THREE camera; target = where it looks (3D), vis = world units visible at the ship plane { w, h }, t = seconds.
  S.update = (cam, target, vis, t) => {
    // the sky plane is stuck in front of the camera, far away, big enough to cover the view
    if (skyPlane.parent !== cam) cam.add(skyPlane);
    const dist = cam.far * 0.9, hh = 2 * dist * Math.tan((cam.fov * Math.PI) / 360) * 1.25;
    const lensShift = cam.userData.lensShift || 0; // (camera3d.js: a sheared lens, looking straight ahead from above: the picture's middle is lower than the camera's axis)
    skyPlane.position.set(0, -dist * lensShift, -dist);
    skyPlane.scale.set(hh * cam.aspect, hh, 1);
    // strips
    back.position.set(target.x, target.y, 0);
    const fovHalf = (cam.fov * Math.PI) / 360;
    cam.getWorldDirection(fwd);
    const pitchDown = Math.asin(clamp(-fwd.y, -1, 1));
    const az = Math.atan2(cam.position.x - target.x, cam.position.z - target.z), frontal = Math.abs(az) < 0.22; // (the strips are flat pictures: they only look right from the front, so an orbiting viewer sees the sky alone)
    STRIPS.forEach((s, i) => {
      const m = stripMeshes[i];
      m.visible = !!m.userData.on && frontal;
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
      const yBottom = cam.position.y - hd * (Math.tan(pitch + a) + lensShift), yTop = cam.position.y - hd * (Math.tan(pitch - a) + lensShift);
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
  };
  return S;
}
