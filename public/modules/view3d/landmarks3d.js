// LOOP.md R3: PARALLAX LANDMARKS. Far things at REAL 3D depth behind the play plane: floating islands, spires, lighthouses, wrecks, a volcano, crystals ... (landmarkArt.js), a different set for each environment,
// laid along the map from the course's start to its end. They are fixed to the WORLD (an x on the map), so the ship's own flight drifts them past at a fraction of her speed (the parallax of their depth: a thing
// at depth 5000 behind a camera 4000 away moves at 0.44 of the ship's speed); their height is a share of the screen's half height at their depth (the way the clouds and strips hang), so a flat-bottomed island
// never meets a ship or the rock whatever the zoom. TWO draw calls (a far band and a near band), drawn in the painted strips' order (far band after the far strip and before the mist, near band after the mist and before
// the mid hills): the strips' hills and haze stand in front of them exactly as their depth says. And the DESTINATION (the next stop: the turning beacon, the next outpost, a lair's volcano / storm crown / sea stacks):
// one more call, a silhouette that shows from far away along the map, GROWS as the ship comes near and dissolves where the real thing stands up (scenery.js builds it within 3200 px).
// Nothing moves except through the world: a lamp blinks in two stepped keys (8 fps), the destination's size follows the ship's distance to it (a function of position, not of time). No sine of the time.
// Low tier: none. Caves, ring maps and the lobby: none. Never throws (the caller wraps it).
import { THREE, look } from './style.js';
import { config } from '../../config.js';
import { Far, farMaterial, syncFar } from './farKit.js';
import { ART, LIST, DEST, PALETTE } from './landmarkArt.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fin = Number.isFinite;
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const D3 = () => config.DEPTH3D || {};

export function createLandmarks(scene) {
  const L = { stats: { far: 0, near: 0, dest: '', calls: 0, tris: 0, by: {} }, on: false, tierOn: true };
  const mats = { far: farMaterial(), near: farMaterial(), dest: farMaterial() };
  mats.far.transparent = false; mats.near.transparent = false; // (opaque, depth-written: the strips' own depth decides what covers them)
  const mkMesh = (m, order, name) => { const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m); mesh.renderOrder = order; mesh.frustumCulled = false; mesh.visible = false; mesh.name = name; scene.add(mesh); return mesh; };
  const far = mkMesh(mats.far, -16.5, 'landmarksFar'), near = mkMesh(mats.near, -15.5, 'landmarksNear'), dest = mkMesh(mats.dest, -15.5, 'landmarkDest');
  let envId = '', cave = false, mapKey = '', destKey = '', destDirty = true;
  const placed = []; // (what plan() laid out: the gate's screenshots read it)
  L.placed = placed;

  const setGeo = (mesh, geo) => { const old = mesh.geometry; mesh.geometry = geo || new THREE.BufferGeometry(); if (old) old.dispose(); mesh.userData.has = !!geo; };

  // lay out the landmarks of a map (deterministic: the same map always gets the same sky)
  function plan(env, map) {
    const C = D3().LANDMARKS || {}, list = LIST[env] || LIST.skyisles, P = PALETTE[env] || PALETTE.skyisles;
    const cell = Number(map.CELL) || 100, x0 = (fin(map.start && map.start.x) ? map.start.x : 0) - 2400, x1 = Math.min(x0 + 70000, (Number(map.W) || 300) * cell + 2000);
    const rnd = mulberry(((map.W | 0) * 131 + (map.H | 0) * 17 + (map.start && fin(map.start.x) ? map.start.x | 0 : 0) * 7 + env.charCodeAt(0) * 977) >>> 0);
    const R = (a, b) => a + (b - a) * rnd();
    const FZ = C.FAR_Z || [-7800, -6500], NZ = C.NEAR_Z || [-5900, -4700], SP = C.SPACING || [2800, 4600], MAX = C.MAX || 22;
    const Ff = new Far(), Fn = new Far();
    placed.length = 0;
    let mf = 0, mn = 0, x = x0 + R(0, SP[0]), i = 0, last = -1, nf = 0, nn = 0;
    while (x < x1 && i < MAX) {
      let k = Math.floor(rnd() * list.length);
      if (k === last) k = (k + 1) % list.length;
      last = k;
      const [type, sLo, sHi, zLo, zHi] = list[k];
      const isFar = (i + (rnd() < 0.3 ? 1 : 0)) % 2 === 0, F = isFar ? Ff : Fn;
      const z = isFar ? R(FZ[0], FZ[1]) : R(NZ[0], NZ[1]), share = R(sLo, sHi), size = R(zLo, zHi) * (isFar ? 1.15 : 1);
      const before = isFar ? mf : mn;
      placed.push({ type, x: Math.round(x), z: Math.round(z), share: +share.toFixed(2), size: +size.toFixed(2), far: isFar });
      ART[type](F, P, size, rnd);
      const mark = F.mark(before, [x, z, share, 0]);
      if (isFar) { mf = mark; nf++; } else { mn = mark; nn++; }
      x += R(SP[0], SP[1]);
      i++;
    }
    setGeo(far, Ff.build()); setGeo(near, Fn.build());
    L.stats.far = nf; L.stats.near = nn; L.stats.tris = (Ff.tris || 0) + (Fn.tris || 0);
  }

  function planDest(env, kind) {
    const P = PALETTE[env] || PALETTE.skyisles, F = new Far();
    if (kind && DEST[kind]) { DEST[kind](F, P); F.mark(0, [0, (D3().DEST || {}).Z || -5600, (D3().DEST || {}).SHARE || -0.12, 0]); }
    setGeo(dest, F.build());
    L.stats.dest = kind || '';
  }

  L.setTier = (tier) => { const T = (D3().TIERS || {})[tier && tier.name] || {}; L.tierOn = !!T.landmarks; };
  L.setEnv = (e, c) => { if (e !== envId || c !== cave) { envId = e; cave = !!c; mapKey = ''; destKey = ''; } };

  // Every frame (world.update; portholes call it with their own camera). cam = the three camera, target = its look-at point, ctx = world.depthCtx ({ dest: { kind, x } | null }), W = the world (tint, rig).
  L.update = (cam, target, vis, t, map, ctx, W) => {
    const ok = D3().ENABLED !== false && look.depth && L.tierOn && !cave && map && !map.ring && W && W.lights;
    L.on = !!ok;
    if (!ok) { far.visible = near.visible = dest.visible = false; L.stats.calls = 0; return; }
    const key = envId + '|' + (map.W | 0) + 'x' + (map.H | 0) + '|' + (map.start ? map.start.x | 0 : 0) + '|' + (map.kind || '');
    if (key !== mapKey) { mapKey = key; try { plan(envId, map); } catch (e) { setGeo(far, null); setGeo(near, null); console.warn('view3d landmarks off', e && e.message); } destDirty = true; }
    const LC = D3().LANDMARKS || {}, blink = (Math.floor(t * 8) % (LC.BLINK || 12)) < 8 ? 1 : LC.LAMP_LOW || 0.3;
    for (const m of [mats.far, mats.near, mats.dest]) syncFar(m, cam, W, LC, blink);
    const tanH = Math.tan((cam.fov * Math.PI) / 360);
    far.visible = !!far.userData.has; near.visible = !!near.userData.has;
    // the destination: a silhouette that grows as the ship comes near (a function of the distance along the map, so it needs no clock)
    const d = ctx && ctx.dest, DC = D3().DEST || {};
    let showDest = false;
    if (d && fin(d.x) && DEST[d.kind]) {
      if (d.kind + '|' + envId !== destKey) { destKey = d.kind + '|' + envId; planDest(envId, d.kind); }
      const dist = d.x - target.x, ad = Math.abs(dist), FAR = DC.FAR || 14000, NEAR = DC.NEAR || 5000, fade = DC.FADE || 900;
      if (ad < FAR && dest.userData.has) {
        const g = clamp((FAR - ad) / Math.max(1, FAR - NEAR), 0, 1), sg = dist >= 0 ? 1 : -1;
        const sz = DC.SCALE || [0.34, 0.85], sx = DC.SCREEN || [0.92, 0.64], Z = DC.Z || -5600;
        const scale = sz[0] + (sz[1] - sz[0]) * g, screen = sx[0] + (sx[1] - sx[0]) * g;
        const hd = cam.position.z - Z, halfW = hd * tanH * (cam.aspect || 1.78); // (half the picture's width at its depth)
        const u = mats.dest.uniforms;
        u.uMove.value.set(target.x + sg * screen * halfW, 0, scale, 0);
        const keepEnd = d.kind === 'volcano' || d.kind === 'stormcrown' || d.kind === 'tidehenge'; // (a lair's backdrop stays; a beacon or an outpost dissolves where the real one stands up)
        const a = keepEnd ? 1 : clamp((ad - NEAR) / fade, 0, 1);
        u.uAlpha.value = Math.round(a * 4) / 4; // (four held steps)
        mats.dest.transparent = u.uAlpha.value < 1;
        showDest = u.uAlpha.value > 0;
        L.stats.by[cam.uuid] = { ad: Math.round(ad), scale: +scale.toFixed(3), alpha: u.uAlpha.value }; // (per camera: the portholes' passes set the uniforms again for their own; the gate reads the main camera's)
      }
    }
    dest.visible = showDest;
    L.stats.calls = (far.visible ? 1 : 0) + (near.visible ? 1 : 0) + (dest.visible ? 1 : 0);
  };
  L.dispose = () => { for (const m of [far, near, dest]) { scene.remove(m); m.geometry.dispose(); } for (const m of Object.values(mats)) m.dispose(); };
  L.meshes = { far, near, dest };
  return L;
}
