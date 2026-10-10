// A5 STATION MATS: a flat painted disc on the deck under every station, in the colour of its role (weapons red, boiler and coal orange, helm / chart / lookout blue, ammo gold), at about a quarter opacity, so a ship's
// working places read from the sofa; the one a human's phone arrow points to is brighter. ONE instanced mesh a ship (one draw call, about 90 triangles): the geometry is a disc inside a more solid rim ring, every instance
// carries its own colour (instanceColor) and opacity (an instanced attribute, read by a small shader patch). Static: nothing here is a function of the time; the matrices are only rewritten when the camera's side,
// the lit set or the night step changes. View only: it reads the layout and the players' `job` (jobs.js), it writes nothing back. Numbers: LOOK3D.STATIONS.MAT.
import { THREE } from './style.js';
import { config } from '../../config.js';

const ROLE = { gun: 'weapon', bombBay: 'weapon', coil: 'weapon', escort: 'weapon', searchlight: 'weapon', cannon: 'weapon', cannonSeat: 'weapon', boiler: 'engine', coal: 'engine', swivel: 'engine', engine: 'engine', sail: 'engine', helm: 'nav', navigator: 'nav', lookout: 'nav', deflector: 'nav', ammo: 'supply' };
const MAXI = 48;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cfg = () => ({ ALPHA: 0.34, ALPHA_ON: 0.78, MIX_ON: 0.42, RX: 74, RZ: 56, RIM: 2.1, COLORS: { weapon: '#e0584a', engine: '#f08c30', nav: '#5aa6de', supply: '#e8bc3e', other: '#b58cd8' }, ...(((config.LOOK3D || {}).STATIONS || {}).MAT || {}) });

let _geo = null, _mat = null;
function geometry() { // a unit disc (radius 1) lying flat: the fill out to 0.84, then the rim ring to 1 (more solid and a little darker)
  if (_geo) return _geo;
  const N = 28, R0 = 0.84, pos = [], col = [], kk = [];
  const P = (r, a) => [r * Math.cos(a), 0, r * Math.sin(a)];
  const tri = (a, b, c, shade, k) => { for (const p of [a, b, c]) { pos.push(...p); col.push(shade, shade, shade); kk.push(k); } };
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    tri([0, 0, 0], P(R0, a1), P(R0, a0), 1, 1);
    tri(P(R0, a0), P(R0, a1), P(1, a1), 0.8, 2.1);
    tri(P(R0, a0), P(1, a1), P(1, a0), 0.8, 2.1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(kk, 1));
  return (_geo = g);
}
function material() {
  if (_mat) return _mat;
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.forceSinglePass = true; // (a transparent double-sided material would otherwise be drawn twice, back faces then front: +1 draw call; it is one flat sheet)
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aA; attribute float aK; varying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\n  vA = aA * aK;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <opaque_fragment>', '#include <opaque_fragment>\n  gl_FragColor.a = clamp( vA, 0.0, 0.95 );');
  };
  m.customProgramCacheKey = () => 'station-mat';
  return (_mat = m);
}

// ctx = the ship context (registry.js makeShipContext), content = the group the ship's parts live in. Returns { mesh, count, update(c, side) } or null (no stations).
export function createStationMats(ctx, content) {
  const L = ctx.L, P = ctx.P, list = [];
  for (const s of (L.stations || [])) {
    const q = P[s.d];
    if (!q || !Number.isFinite(s.x) || list.length >= MAXI) continue;
    list.push({ s, d: s.d, x: s.x, y: q.y, zh: ctx.zHalfAt(s.d, s.x), role: ROLE[s.kind] || 'other' });
  }
  if (!list.length) return null;
  const C = cfg(), geo = geometry().clone();
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
  aA.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aA', aA);
  const mesh = new THREE.InstancedMesh(geo, material(), MAXI);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1; // (after the opaque ship, before the crew's overlay)
  mesh.castShadow = mesh.receiveShadow = false;
  mesh.name = 'stationMats';
  mesh.count = list.length;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 3), 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  content.add(mesh);
  const base = Object.fromEntries(Object.entries(C.COLORS).map(([k, v]) => [k, new THREE.Color(v)]));
  const white = new THREE.Color('#ffffff'), tmpC = new THREE.Color(), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Vp = new THREE.Vector3(), Vs = new THREE.Vector3();
  let lastKey = '';
  const out = {
    mesh, count: list.length, lit: 0,
    // c: { side: +1 / -1 (which side of the ship the camera is on), jobs: [{ d, x }] (where a human's phone arrow points), night: 0..1 }
    update(c) {
      const side = c.side >= 0 ? 1 : -1, nightStep = Math.round(clamp(c.night || 0, 0, 1) * 4), jobs = c.jobs || [];
      const litIdx = new Set();
      for (const j of jobs) { // each job lights the nearest station on its deck (within 90)
        let best = -1, bd = 90;
        list.forEach((e, i) => { if (e.d !== j.d) return; const dx = Math.abs(e.x - j.x); if (dx < bd) { bd = dx; best = i; } });
        if (best >= 0) litIdx.add(best);
      }
      const key = side + '|' + nightStep + '|' + [...litIdx].sort().join(',');
      if (key === lastKey) return;
      lastKey = key;
      const dim = 1 - 0.3 * (nightStep / 4);
      list.forEach((e, i) => {
        const lit = litIdx.has(i), rz = Math.min(C.RZ, e.zh * 0.4), rx = C.RX;
        Vp.set(ctx.X(e.x), ctx.Y(e.y) + 1.8, side * e.zh * 0.45);
        Vs.set(rx, 1, rz);
        mesh.setMatrixAt(i, M.compose(Vp, Q, Vs));
        tmpC.copy(base[e.role] || base.other);
        if (lit) tmpC.lerp(white, C.MIX_ON);
        mesh.setColorAt(i, tmpC);
        aA.setX(i, (lit ? C.ALPHA_ON : C.ALPHA) * dim);
      });
      out.lit = litIdx.size;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      aA.needsUpdate = true;
    },
  };
  return out;
}
