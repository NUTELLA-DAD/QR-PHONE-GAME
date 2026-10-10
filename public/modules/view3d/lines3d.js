// A pool of flat coloured segments for the lines the game draws in the world: warning lines (a turret's aim, the sniper's red line, a fighter's line of fire, the coil's charge), the sniper's and the coil's beams,
// towlines and harpoon cables, the wind streaks of the Versus wall. ONE instanced mesh (one draw call), unlit, drawn over everything (they are signals: they must read). Colours can be HDR (above 1) so a
// beam crosses the bloom threshold. Rigid: a segment is a thin box, nothing bends or waves; anything that "flickers" does it by the caller's stepped keys.
//   lines.begin();  lines.seg(x1, y1, x2, y2, width, color, alpha = 1, z = 60);  lines.dashed(x1, y1, x2, y2, width, color, dash, gap, alpha, z, phase);  lines.poly(points, width, color, alpha, z);  lines.end();
// Coordinates are the 3D world's (x, y up, z toward the viewer).
import { THREE } from './style.js';

const VERT = `
  attribute float aAlpha;
  varying vec3 vC; varying float vA;
  void main() {
    vC = instanceColor; vA = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
  }
`;
const FRAG = `
  varying vec3 vC; varying float vA;
  void main() {
    gl_FragColor = vec4( vC, vA );
    #include <colorspace_fragment>
  }
`;

export function createLines(parent, max = 900, opts = {}) { // opts.depth = depth-tested (a contrail: it hides behind a ship); order = renderOrder (default: over everything)
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
  alpha.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAlpha', alpha);
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: !!opts.depth });
  mat.toneMapped = false;
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color('#ffffff')); // (makes the colour buffer)
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.renderOrder = opts.order != null ? opts.order : 960;
  mesh.name = 'lines';
  parent.add(mesh);
  const _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _P = new THREE.Vector3(), _S = new THREE.Vector3(), _C = new THREE.Color(), _E = new THREE.Euler();
  let n = 0;
  const L = {
    mesh, get count() { return n; },
    begin() { n = 0; },
    seg(x1, y1, x2, y2, w, color, a = 1, z = 60) {
      if (n >= max || !(Number.isFinite(x1 + y1 + x2 + y2)) || a <= 0.003) return;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      _Q.setFromEuler(_E.set(0, 0, Math.atan2(dy, dx)));
      _M.compose(_P.set((x1 + x2) / 2, (y1 + y2) / 2, z), _Q, _S.set(len, Math.max(0.5, w), 1));
      mesh.setMatrixAt(n, _M);
      mesh.setColorAt(n, _C.set(color));
      alpha.setX(n, Math.min(1, a));
      n++;
    },
    // a dashed line: dash / gap in world units, phase shifts the pattern along the line (a constant speed: the caller steps it)
    dashed(x1, y1, x2, y2, w, color, dash, gap, a = 1, z = 60, phase = 0) {
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ux = dx / len, uy = dy / len, step = dash + gap;
      let s = -((phase % step) + step) % step;
      for (let i = 0; i < 200 && s < len; i++, s += step) {
        const a0 = Math.max(0, s), a1 = Math.min(len, s + dash);
        if (a1 > a0) L.seg(x1 + ux * a0, y1 + uy * a0, x1 + ux * a1, y1 + uy * a1, w, color, a, z);
      }
    },
    poly(pts, w, color, a = 1, z = 60) { for (let i = 1; i < pts.length; i++) L.seg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, color, a, z); },
    end() {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      alpha.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); mesh.removeFromParent(); },
  };
  return L;
}
