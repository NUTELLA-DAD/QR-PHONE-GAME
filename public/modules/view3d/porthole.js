// The VERSUS PORTHOLE in 3D (WP11). When the two ships are too far apart for even the widest view, camera.js splits the picture: the main view follows one ship and view.inset
// = { cx, cy, zoom, x, y, w, h, ship } (canvas pixels) is the "spyglass" on the other. In 2D render.js draws that porthole from the 2D art. Here the SAME 3D scene is drawn a second time, from a camera
// of its own that looks at the far ship, into the porthole's rectangle of the canvas (a viewport + scissor): its own small composer (the same grade, bloom and anti-aliasing as the big picture, at the
// porthole's size, so a 650 x 400 picture costs about an eighth of a full-screen frame). The 2D HUD then draws only the frame (the rim in her team colour, the rivets, the name plate: render.js
// drawInset with frameOnly), so the picture inside is the 3D one. Medium tier and up; Low keeps the 2D inset (and the 2D renderer draws it, picture and all).
//
// Drawn AFTER the main picture (so it lies over it) and with the sky, clouds, sea and the key light's shadow box moved to the far ship for this one pass; the next frame's main pass moves them back
// (index.js calls world.update first thing). Not in the porthole: the searchlight beams, the particles (the big view culls them to its own screen), the rock (the Versus sky is open) and the
// HUD labels. The camera is the plain gameplay lens (camera3d.js placeCamera, no cinema): nothing rolls, nothing moves but the ship.
import { THREE } from './style.js';
import { createPost } from './post.js';
import { placeCamera, FOV } from './camera3d.js';

export function createPorthole({ renderer, scene, world }) {
  const P = { live: false, error: '', frames: 0, ms: 0, calls: 0, tris: 0, w: 0, h: 0 };
  let camera = null, post = null, key = '';
  const build = () => {
    camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 60, 70000);
    scene.add(camera);
    post = createPost(renderer, scene, camera);
    if (!post.enabled) throw new Error('no post-processing: ' + post.error);
  };

  // inset = view.inset (canvas pixels), f = css pixels per canvas pixel, cssW / cssH = the 3D canvas' css size, c = { dt, t, seaY, map, tier, margin (canvas px kept clear for the 2D frame's rim) }
  // Returns true when the porthole was drawn (the HUD then draws the frame only).
  P.render = (inset, f, cssW, cssH, c) => {
    P.live = false;
    if (!inset || !(c.tier && c.tier.name !== 'low') || P.error) return false;
    try {
      if (!post) build();
      const m = Math.max(0, c.margin || 0);
      const cw = Math.max(32, Math.round((inset.w - 2 * m) * f)), ch = Math.max(32, Math.round((inset.h - 2 * m) * f));
      const x = Math.round((inset.x + m) * f), y = Math.round(cssH - (inset.y + inset.h - m) * f);
      if (!(cw > 0 && ch > 0 && Number.isFinite(x) && Number.isFinite(y))) return false;
      const pr = renderer.getPixelRatio();
      const k = cw + 'x' + ch + '@' + pr;
      if (k !== key) { key = k; post.setSize(cw, ch, pr); camera.aspect = cw / ch; camera.updateProjectionMatrix(); }
      P.w = cw; P.h = ch;
      const t0 = performance.now();
      const info = placeCamera(camera, { cx: inset.cx, cy: inset.cy, zoom: inset.zoom }, Math.max(16, inset.w - 2 * m), Math.max(16, inset.h - 2 * m), {});
      camera.userData.cine = false;
      const tg = info.target;
      world.lights.fit([{ x: tg.x, y: tg.y }], tg);
      world.lights.setFogDistance(camera.position.distanceTo(tg));
      world.update(camera, tg, { w: info.visW, h: info.visH }, c.t, c.seaY, c.map);
      const rig = world.lights.rig;
      post.configure(c.tier, rig, rig.id, world.lights.exposure);
      const sc = renderer.getScissorTest();
      renderer.setViewport(x, y, cw, ch);
      renderer.setScissor(x, y, cw, ch);
      renderer.setScissorTest(true);
      post.render(c.dt || 0.016);
      renderer.setScissorTest(sc);
      renderer.setViewport(0, 0, cssW, cssH);
      renderer.setRenderTarget(null);
      P.calls = post.sceneCalls; P.tris = post.sceneTris;
      P.ms = performance.now() - t0;
      P.frames++;
      P.live = true;
      return true;
    } catch (e) {
      P.error = String(e && e.message ? e.message : e);
      console.warn('view3d porthole off', P.error);
      try { renderer.setScissorTest(false); renderer.setViewport(0, 0, cssW, cssH); renderer.setRenderTarget(null); } catch { /* (gone) */ }
      return false;
    }
  };
  P.dispose = () => { try { if (post) post.dispose(); if (camera) scene.remove(camera); } catch { /* (gone) */ } };
  return P;
}
