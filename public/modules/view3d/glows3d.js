// THREAT GLOWS (WP9): the 2D game puts a soft red glow behind everything dangerous or shootable (a plane, a mine, a bat, a turret, a rocket, the boss's guns ...) so threats pop out of the scenery at TV
// distance, and so a bat is not lost against a dark cave. This is the same idea in 3D: one instanced mesh of soft round sprites (a radial gradient painted once on a canvas), additive, drawn BEHIND the thing (a little back of its plane) over the
// picture but under the lines and the crew's markers (one draw call). The list is the game's own (aim.js targets: the things a gunner can aim at), so the glow is exactly where the game says a target is.
// The size breathes in four held steps (8 fps), never a sine.
import { THREE } from './style.js';
import { targets } from '../host/aim.js';

const MAX = 80;
const PULSE = [0, 0.1, 0.2, 0.1]; // (added to the 1.9 radius factor of the 2D glow, stepped)
const SKIP = new Set(['rival', 'cable']);

export function createThreatGlows(root, state) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 64 * 0.16, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,60,80,0.34)');
  grad.addColorStop(1, 'rgba(255,60,80,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true });
  mat.toneMapped = false;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = 3;
  mesh.name = 'threatGlows';
  root.add(mesh);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
  return {
    mesh,
    count: 0,
    update(t, on = true) {
      let n = 0;
      if (on) {
        const k = PULSE[Math.floor(t * 8) & 3];
        for (const tg of targets(state)) {
          if (n >= MAX) break;
          if (!tg || SKIP.has(tg.kind)) continue;
          const p = tg.at(0), r = Number(tg.r) * (1.9 + k);
          if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !(r > 0)) continue;
          M.compose(P.set(p.x, -p.y, -30), Q, S.set(r * 2, r * 2, 1)); // (a little behind the thing itself: the 2D game draws the glow under the threat, over the ships)
          mesh.setMatrixAt(n++, M);
        }
      }
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      this.count = n;
    },
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); mat.dispose(); tex.dispose(); },
  };
}
