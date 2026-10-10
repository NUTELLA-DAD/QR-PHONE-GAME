// A6 THE CONTACT SHADOW (3D.md section 25). In open sky the ship cast nothing readable on the rock or the sea below, so she floated like a sticker. This puts a soft dark ellipse
// under every ship, on the nearest rock top or water surface straight below her, sized by her length and fading with her height above it (the simulation's own altitude).
//
// HOW: once a frame (a few array reads each, no mesh raycast: the rock IS the 2D game's map, and the terrain chunks are built from it) a column march down the map's cells (maps.js floorBelow) finds the
// surface under each of COLS slices of the ellipse's width; a slice with nothing below it (or beyond FADE) is simply not drawn, so the shadow never spills off a cliff into empty sky. All the slices of
// all the ships are ONE InstancedMesh (1 draw call, depth tested, no shadow map): a flat quad per slice lying on its own surface height, the ellipse itself is made in the fragment shader from the
// slice's place in it. The slices touch but never overlap (a soft alpha would double up). The sea keeps its sun shadow from the shadow map; over water the ellipse is lighter so they do not double up.
// Fixed to the world and to the ship: nothing moves on its own, nothing here is a function of time.
import { THREE, look } from './style.js';
import { floorBelow } from '../host/maps.js';
import { Z_FRONT_OPEN } from './terrain.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = Number.isFinite;

const VERT = /* glsl */`
  attribute vec4 aPos; attribute vec4 aShape; attribute vec4 aRight; // aRight.x = the surface height at the slice's right edge (aPos.y is the left one); aPos = slice centre x, surface y, z, slice width;  aShape = ellipse half-length, half-depth, alpha, the ellipse's centre x
  varying vec2 vE; varying float vA;
  void main() {
    float wx = aPos.x + position.x * aPos.w;
    float wz = aPos.z + position.z * aShape.y * 2.0;
    vE = vec2( ( wx - aShape.w ) / max( aShape.x, 1.0 ), position.z * 2.0 );
    vA = aShape.z;
    float wy = mix( aPos.y, aRight.x, position.x + 0.5 );
    gl_Position = projectionMatrix * viewMatrix * vec4( wx, wy, wz, 1.0 );
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uColor; uniform vec2 uSoft; // uSoft = where the soft edge starts (share of the radius), and a step count (0 = smooth)
  varying vec2 vE; varying float vA;
  void main() {
    float r = length( vE );
    float k = 1.0 - smoothstep( uSoft.x, 1.0, r );
    float a = vA * k;
    if ( a < 0.01 ) discard;
    gl_FragColor = vec4( uColor, a );
    #include <colorspace_fragment>
  }
`;

export function createContactShadow(parent, state, models) {
  const C = () => (config.LOOK3D && config.LOOK3D.CONTACT) || {};
  const K0 = C();
  const COLS = clamp((K0.COLS | 0) || 16, 4, 40), MAXS = clamp((K0.SHIPS | 0) || 6, 1, 12);
  const N = COLS * MAXS, IN = 12;
  const edge = new Array(COLS + 1);
  const arr = new Float32Array(N * IN);
  const buf = new THREE.InstancedInterleavedBuffer(arr, IN, 1);
  buf.setUsage(THREE.DynamicDrawUsage);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  g.setAttribute('aPos', new THREE.InterleavedBufferAttribute(buf, 4, 0));
  g.setAttribute('aShape', new THREE.InterleavedBufferAttribute(buf, 4, 4));
  g.setAttribute('aRight', new THREE.InterleavedBufferAttribute(buf, 4, 8));
  g.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uColor: { value: new THREE.Color(K0.COLOR || '#1c1a2c') }, uSoft: { value: new THREE.Vector2(K0.SOFT != null ? K0.SOFT : 0.4, 0) } },
  });
  mat.fog = false; mat.toneMapped = false;
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.name = 'contactShadow'; mesh.visible = false;
  parent.add(mesh);
  const stats = { ships: 0, slices: 0 };

  function update() {
    const K = C();
    let n = 0, ships = 0;
    const map = state.course && state.course.map;
    if (look.contact !== false && map && map.solid && K.ALPHA !== 0) {
      const env = state.env || {}, seaGame = fin(env.seaY) ? env.seaY : null; // (the sea's surface, the game's y: down)
      const open = !!map.open, lift = K.LIFT != null ? K.LIFT : 5, fade = Math.max(100, K.FADE || 1400), maxDrop = Math.min(fade, (map.CELL || 60) * 58);
      const rz = (K.DEPTH || 300) * 0.5, zc = open ? Z_FRONT_OPEN - 30 - rz * 0.9 : 0; // (open sky: the rock's top face runs back from just behind the ships; in a cave the tunnel floor runs under her)
      for (const sh of state.ships) {
        if (ships >= MAXS) break;
        const e = models.get(sh.id), pose = sh.pose, L = sh.layout, b = L && L.bounds;
        if (!e || !pose || !b || !fin(pose.x) || !fin(pose.y)) continue;
        if ((sh.ctx && sh.ctx.wreck) || !e.model.root.visible) continue; // (a hull breaking up casts nothing)
        const f = pose.f === -1 ? -1 : 1, pv = fin(e.model.pv) ? e.model.pv : 0;
        const len = Math.max(200, b.x1 - b.x0), mid = (b.x0 + b.x1) * 0.5;
        const cx = pose.x + pv + f * (mid - pv), keel = pose.y + b.y1; // (the game's y, down: the keel is the lowest point of her bounds)
        const turn = pose.turn > 0 ? Math.max(0.35, Math.abs(Math.cos(Math.PI * pose.turn))) : 1; // (end-on in a come about: a narrower shadow)
        const rx0 = len * 0.5 * (K.LEN || 0.82) * turn;
        const surf = (x) => {
          let y = Infinity, sea = false;
          const fy = floorBelow(map, x, keel - 20);
          if (fin(fy) && fy < map.H * map.CELL - 1 && fy - keel < maxDrop) y = fy;
          if (seaGame != null && seaGame > keel - 40 && seaGame - keel < maxDrop && seaGame < y) { y = seaGame; sea = true; }
          return { y, sea };
        };
        const mid0 = surf(cx);
        const hMid = mid0.y === Infinity ? fade : Math.max(0, mid0.y - keel);
        const grow = 1 + (K.GROW != null ? K.GROW : 0.35) * clamp(hMid / fade, 0, 1);
        const rx = rx0 * grow, ww = (rx * 2) / COLS;
        for (let i = 0; i <= COLS; i++) edge[i] = surf(cx - rx + i * ww); // (the surface under each slice's two edges: a slice is a flat strip that follows the slope, never a step that would float off a ridge)
        let any = 0;
        for (let i = 0; i < COLS; i++) {
          const l = edge[i], r = edge[i + 1];
          if (l.y === Infinity || r.y === Infinity || l.sea !== r.sea || Math.abs(l.y - r.y) > ww * 1.1) continue; // (nothing below, or a cliff between: not drawn)
          const h = Math.max(0, (l.y + r.y) * 0.5 - keel), hk = 1 - clamp(h / fade, 0, 1);
          const a = (l.sea ? (K.SEA_ALPHA != null ? K.SEA_ALPHA : 0.26) : (K.ALPHA != null ? K.ALPHA : 0.4)) * hk;
          if (a < 0.015) continue;
          const o = n * IN;
          arr[o] = cx - rx + (i + 0.5) * ww; arr[o + 1] = -l.y + lift; arr[o + 2] = l.sea ? 0 : zc; arr[o + 3] = ww;
          arr[o + 4] = rx; arr[o + 5] = l.sea ? rz * 0.8 : rz; arr[o + 6] = a; arr[o + 7] = cx;
          arr[o + 8] = -r.y + lift; // (the strip's right edge height)
          n++; any++;
        }
        if (any) ships++;
      }
    }
    g.instanceCount = n;
    mesh.visible = n > 0;
    if (n > 0) {
      buf.clearUpdateRanges && buf.clearUpdateRanges();
      if (buf.addUpdateRange) buf.addUpdateRange(0, n * IN);
      buf.needsUpdate = true;
    }
    stats.ships = ships; stats.slices = n;
  }
  return { mesh, stats, update, dispose() { parent.remove(mesh); g.dispose(); mat.dispose(); } };
}
