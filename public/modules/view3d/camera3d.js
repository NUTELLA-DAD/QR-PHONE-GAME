// The 3D camera. camera.js (the 2D follow camera) stays the authority: it decides where the picture is centred and how far it is zoomed ({ cx, cy, zoom } in map
// coordinates). This turns that view into a perspective camera that looks at the gameplay plane (z = 0) so that the plane maps onto the 2D view as closely as
// possible: the same point is at the same place on the screen, which keeps the 2D HUD's world anchors (arrows, markers) lined up with the 3D picture.
//
// World mapping: 3D x = map x, 3D y = -map y, z toward the viewer. The camera sits D away from the plane, D = visH / 2 / tan(FOV / 2), so the plane's visible height
// equals the 2D view's (canvas height / zoom). It is raised by D * tan(ELEV) and looks straight along -z with a SHEARED lens (the picture is shifted so the look-at
// point stays in the middle): the plane z = 0 is parallel to the image, so it maps onto the 2D view EXACTLY (no keystone), while the lines of sight still come from
// above, so the tops of decks and bags show. (A tilted camera instead put the HUD up to ~25 px off at the screen corners.) It never rolls or breathes.
import { THREE } from './style.js';

export const FOV = 30; // vertical field of view, degrees (narrow: nearly orthographic, so the plane maps 1:1)
export const ELEV = 0.12; // radians the camera looks down from
const TAN_HALF = Math.tan((FOV * Math.PI) / 360);
const TAN_ELEV = Math.tan(ELEV);
const _t = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

// view = the 2D camera's { cx, cy, zoom }; w, h = the pixel size that view was made for (the 2D canvas); returns { visW, visH, D, target } (target is a shared vector: copy it).
// opts.zoom multiplies the distance (dev pages), opts.dy lifts the look-at point (world units), opts.skipPlace leaves the camera alone (orbit mode).
// opts.cine (WP11, cinema.js; null = the plain gameplay lens, byte for byte the old path) = { active, az, elev, mul, dx, dy }: a cinematic offset. The camera swings round the look-at point by az (a YAW
// about the vertical axis: the horizon stays level, there is never any roll), looks down elev radians more, stands mul times as far away, and the look-at point slides by (dx, dy) map pixels. The lens
// stays sheared in height only (the look-at point stays in the middle of the picture), so with az = 0 the plane still maps 1:1 (just smaller by mul); with az != 0 the plane is seen at an angle: the 3D
// picture really turns. Everything that reads the camera (hud3d, the sky, the beams) follows; the returned D, visW and visH already include mul.
export function placeCamera(camera, view, w, h, opts = {}) {
  const zoom = Number.isFinite(view && view.zoom) && view.zoom > 0 ? view.zoom : 0.5;
  const cx = Number.isFinite(view && view.cx) ? view.cx : 800;
  const cy = Number.isFinite(view && view.cy) ? view.cy : 400;
  const px = Math.max(16, w || 1920), py = Math.max(16, h || 1080);
  let visH = py / zoom, visW = px / zoom;
  let D = Math.min(60000, visH / 2 / TAN_HALF / (opts.zoom || 1));
  const cine = opts.cine && opts.cine.active && !opts.skipPlace ? opts.cine : null;
  _t.set(cx + (cine ? cine.dx || 0 : 0), -(cy + (cine ? cine.dy || 0 : 0)) + (opts.dy || 0), 0);
  camera.updateProjectionMatrix(); // (resets any shear)
  camera.userData.lensShift = 0;
  if (!opts.skipPlace) {
    if (cine) {
      const mul = Math.max(0.5, Math.min(3, cine.mul || 1)), az = Math.max(-0.9, Math.min(0.9, cine.az || 0)), el = Math.max(0.02, Math.min(0.9, ELEV + (cine.elev || 0)));
      const D2 = Math.min(60000, D * mul), tanE = Math.tan(el);
      camera.position.set(_t.x + D2 * Math.sin(az), _t.y + D2 * tanE, D2 * Math.cos(az));
      camera.quaternion.setFromAxisAngle(_up, az); // (a yaw only)
      const e = camera.projectionMatrix.elements;
      e[9] = -e[5] * tanE; // (the look-at point is straight ahead in the camera's vertical plane, D2 * tan(el) below its axis: the gameplay lens' shear, with this elevation)
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.userData.lensShift = tanE;
      const spread = mul * (1 + 0.5 * Math.abs(Math.sin(az))); // (more of the plane is seen when it is seen at an angle: the culling asks for a little more)
      visH *= spread; visW *= spread; D = D2;
    } else {
      camera.position.set(_t.x, _t.y + D * TAN_ELEV, D);
      camera.quaternion.set(0, 0, 0, 1);
      const e = camera.projectionMatrix.elements;
      e[9] = -e[5] * TAN_ELEV; // shear: the look-at point (D below the camera's height * tan, D ahead) stays at the centre of the picture
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.userData.lensShift = TAN_ELEV; // (world.js places its sky pictures by it)
    }
  }
  camera.updateMatrixWorld(true);
  return { visW, visH, D, target: _t };
}

// Where a map point lands on the screen (CSS pixels of a w x h canvas) through this camera: a check for the HUD alignment, and a handy helper for 3D-anchored things.
const _p = new THREE.Vector3();
export function worldToScreen(camera, x, y, w, h, z = 0) {
  _p.set(x, -y, z).project(camera);
  return { x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h };
}
