// The stage: the sky and backdrop (sky.js: painted, unlit), the clouds (clouds.js: instanced billboards), the lights and fog (lights.js: one rig per environment), and the Sunken Sea's flat toon
// water (water.js: two colour steps, a fake mirror, stamped foam, a two-tone crest, glitter and a horizon haze, a shore ring, splash rings). All fixed to the world (nothing shimmers with the camera). This file ties them
// together behind one small API for index.js.
import { THREE } from './style.js';
import { createLights, TOD } from './lights.js';
import { createSky } from './sky.js';
import { createClouds } from './clouds.js';
import { createWater } from './water.js';
export { TOD };

export function createWorld(scene, renderer) {
  const lights = createLights(scene);
  const sky = createSky(scene, renderer);
  const clouds = createClouds(scene);
  const water = createWater(scene);
  const { hemi, sun } = lights;

  const W = { sunDir: lights.sunDir, tod: 'day', todCfg: TOD.day, night: 0, gloom: 0, cave: false, envId: null, bgDim: 1, hemi, sun, water: water.group, waterView: water, clouds, backOn: true, lights, sky };

  // splashAt(x, y, size [, z]): a ring decal on the Sunken Sea's surface (for the VFX pass; see water.js). Does nothing when there is no sea.
  W.splashAt = (x, y, size, z) => water.splashAt(x, y, size, z);

  W.setTod = (name) => {
    const c = TOD[name] || TOD.day;
    W.tod = name; W.todCfg = c; W.night = c.night;
    sky.setColors(c, name);
    clouds.setSky(c.sky);
    water.setSkyTint(c.sky);
    W.applyLights();
  };
  // The effective darkness (the game's darkness, or a cave's own floor; lights.js) drives the lamps (night) and the picture glows (gloom).
  W.applyLights = () => {
    lights.apply(W.todCfg, W.envId || 'skyisles', W.cave);
    W.night = lights.night; W.gloom = lights.gloom;
    sky.setGloom(lights.gloom);
    water.setLevel(lights.night);
  };

  // The sky for this environment; cave = the map is a cave (no sky strips, the cave picture behind the rock instead).
  W.setEnv = (envId, cave) => {
    W.envId = envId; W.cave = cave;
    sky.setEnv(envId, cave);
    W.applyLights();
    clouds.setRig(lights.rig, envId, cave);
    water.setRig(lights.rig, envId);
  };

  // Every frame. cam = the THREE camera; target = where it looks (3D), vis = world units visible at the ship plane { w, h }, t = seconds, seaY = the sea level (game y; NaN = no sea), map = the course's map.
  W.update = (cam, target, vis, t, seaY, map) => {
    sky.update(cam, target, vis, t);
    clouds.update(cam, target, t, cam.aspect);
    water.update(cam, target, t, seaY, map);
  };
  W.setTier = (tier) => { water.setTier(tier); };
  W.setLook = () => { W.applyLights(); };
  W.setTod('day');
  void THREE;
  return W;
}
