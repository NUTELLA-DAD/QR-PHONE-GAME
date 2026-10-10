// The stage: the sky and backdrop (sky.js: painted, unlit), the lights and fog (lights.js: one rig per environment), and the Sunken Sea's flat toon water with slow stepped foam
// lines. All fixed to the world (nothing shimmers with the camera). This file ties them together behind one small API for index.js.
import { THREE, gradientMap, look } from './style.js';
import { createLights, TOD } from './lights.js';
import { createSky } from './sky.js';
export { TOD };

export function createWorld(scene, renderer) {
  const lights = createLights(scene);
  const sky = createSky(scene, renderer);
  const { hemi, sun } = lights;

  // ---- water (Sunken Sea) ----------------------------------------------------------------------------------------------------------------
  const water = new THREE.Group();
  const wMat = new THREE.MeshToonMaterial({ color: '#6f9fae', gradientMap });
  const wPlain = new THREE.MeshLambertMaterial({ color: '#6f9fae' });
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

  const W = { sunDir: lights.sunDir, tod: 'day', todCfg: TOD.day, night: 0, cave: false, envId: null, bgDim: 1, hemi, sun, water, backOn: true, lights, sky };

  W.setTod = (name) => {
    const c = TOD[name] || TOD.day;
    W.tod = name; W.todCfg = c; W.night = c.night;
    sky.setColors(c, name);
    W.applyLights();
  };
  W.applyLights = () => { lights.apply(W.todCfg, W.envId || 'skyisles', W.cave); };

  // The sky for this environment; cave = the map is a cave (no sky strips, the cave picture behind the rock instead).
  W.setEnv = (envId, cave) => {
    W.envId = envId; W.cave = cave;
    sky.setEnv(envId, cave);
    W.applyLights();
  };

  // Every frame. cam = the THREE camera; target = where it looks (3D), vis = world units visible at the ship plane { w, h }, t = seconds.
  W.update = (cam, target, vis, t, seaY) => {
    sky.update(cam, target, vis, t);
    // the sea
    if (Number.isFinite(seaY)) {
      water.visible = true;
      const y = -seaY, wx = 60000, depth = 9000;
      slabW.scale.set(wx, depth, 9000);
      slabW.position.set(target.x, y - depth / 2, 3000);
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
