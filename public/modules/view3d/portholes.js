// THE ROUND PORTHOLES in 3D (host/portholes.js plans them: a friendly plane off screen at the screen edge, and the lookout's spyglass at the top centre). Each is a small extra draw of the SAME scene from a
// camera of its own, into a square viewport of the canvas, through its own little composer (post.js, `circle`: its last pass cuts the picture to a circle, so the corners keep the main picture) at the
// porthole's size: a 170 px window costs a few percent of a full-screen frame. The 2D HUD draws only the brass rim, the pointer notch and the plate over it (host/portholeArt.js).
// Same approach as the Versus porthole (porthole.js): after the main picture, with the sky, clouds and sea moved to the porthole's place for the pass (the next frame's main pass moves them back).
// Kept cheap: the key light's shadow map is NOT redrawn (autoUpdate off for these passes: the planes in a porthole carry no shadow), no particles (the big view culls them to its own screen), no beams, the
// edge windows run without bloom. One composer per slot (3 edge + the spyglass at most), made on first use. Budget: config.PORTHOLES.BUDGET by tier; Low draws none in 3D (host/render.js draws the 2D ones).
// If anything throws, 3D portholes switch themselves off and the 2D renderer draws them. Never rolls or breathes the camera: it is the plain gameplay lens (camera3d.js placeCamera).
import { THREE, setInkFor } from './style.js';
import { createPost } from './post.js';
import { placeCamera, FOV } from './camera3d.js';

export function createPortholes3D({ renderer, scene, world }) {
  const P = { error: '', frames: 0, ms: 0, calls: 0, tris: 0, n: 0, live: new Set(), enabled: true };
  const slots = new Map(); // 'spy' | 'e0' 'e1' ... -> { camera, post, key }

  const slot = (name) => {
    let s = slots.get(name);
    if (!s) {
      const camera = new THREE.PerspectiveCamera(FOV, 1, 60, 70000);
      scene.add(camera);
      const post = createPost(renderer, scene, camera, { circle: true });
      if (!post.enabled) throw new Error('no post-processing: ' + post.error);
      slots.set(name, (s = { camera, post, key: '' }));
    }
    return s;
  };

  // items = portholes.plan().items (canvas pixels), f = css pixels per canvas pixel, cssW / cssH = the 3D canvas' css size, c = { dt, t, seaY, map, tier }.
  // Returns the Set of ids drawn (the 2D renderer draws the rim over those and the whole picture for the rest).
  P.render = (items, f, cssW, cssH, c) => {
    P.live = new Set();
    P.ms = 0; P.calls = 0; P.tris = 0; P.n = 0;
    if (P.error || !P.enabled || !c.tier || c.tier.name === 'low') return P.live;
    const list = (items || []).filter((it) => it.pic === '3d' && it.a > 0);
    if (!list.length) return P.live;
    const t0 = performance.now();
    const shadowAuto = renderer.shadowMap.autoUpdate, autoClear = renderer.autoClear;
    const sc = renderer.getScissorTest();
    try {
      renderer.shadowMap.autoUpdate = false;
      renderer.autoClear = false; // (the circle pass draws straight onto the main picture: a clear would blacken the corners of the square; every other pass overwrites its whole target)
      let e = 0;
      for (const it of list) {
        const s = slot(it.kind === 'spy' ? 'spy' : 'e' + e++);
        const side = Math.max(24, Math.round(2 * it.r * f)); // (css pixels)
        const x = Math.round((it.x - it.r) * f), y = Math.round(cssH - (it.y + it.r) * f);
        if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(it.cx) && Number.isFinite(it.cy) && it.zoom > 0)) continue;
        const pr = renderer.getPixelRatio();
        const k = side + '@' + pr;
        if (k !== s.key) { s.key = k; s.post.setSize(side, side, pr); s.camera.aspect = 1; s.camera.updateProjectionMatrix(); }
        const info = placeCamera(s.camera, { cx: it.cx, cy: it.cy, zoom: it.zoom }, 2 * it.r, 2 * it.r, {});
        s.camera.userData.cine = false;
        setInkFor(info.D, info.visH);
        const tg = info.target;
        world.lights.setFogDistance(s.camera.position.distanceTo(tg));
        world.update(s.camera, tg, { w: info.visW, h: info.visH }, c.t, c.seaY, c.map);
        const rig = world.lights.rig;
        const tier = it.kind === 'spy' ? c.tier : { ...c.tier, bloom: false, aa: c.tier.aa === 'smaa' ? 'fxaa' : c.tier.aa };
        s.post.configure(tier, rig, rig.id, world.lights.exposure);
        s.post.passes.circle.uniforms.uAlpha.value = Math.max(0, Math.min(1, it.a));
        renderer.setViewport(x, y, side, side);
        renderer.setScissor(x, y, side, side);
        renderer.setScissorTest(true);
        s.post.render(c.dt || 0.016);
        P.calls += s.post.sceneCalls; P.tris += s.post.sceneTris;
        P.live.add(it.id);
        P.n++;
      }
    } catch (err) {
      P.error = String(err && err.message ? err.message : err);
      P.live = new Set();
      console.warn('view3d portholes off', P.error);
    }
    try { renderer.setScissorTest(sc); renderer.setViewport(0, 0, cssW, cssH); renderer.setRenderTarget(null); renderer.shadowMap.autoUpdate = shadowAuto; renderer.autoClear = autoClear; } catch { /* (gone) */ }
    P.ms = performance.now() - t0;
    P.frames++;
    return P.live;
  };
  P.dispose = () => { for (const s of slots.values()) { try { s.post.dispose(); scene.remove(s.camera); } catch { /* (gone) */ } } slots.clear(); };
  return P;
}
