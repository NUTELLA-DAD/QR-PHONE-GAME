// Clouds (WP3): billboard clusters of 3-7 discs from the trim sheet's cloud atlas (8 painted discs), ALL in ONE InstancedMesh (one draw call). Unlit painted style (the same tint and untone
// as the sky pictures, see style.js paintedPlane), fixed to the world: every cloud drifts at a CONSTANT speed (linear in time, computed in the vertex shader, never a sine) and wraps round the
// camera far outside the view, so the sky is endless. Depths: most clusters stand BEHIND the gameplay plane (z -1500 .. -3800: nearer than the painted far strips, so they pass in front of
// those), a few stand IN FRONT (z +350 .. +1100), thin and semi-transparent, and they fade away toward the middle of the screen, so they never hide the ship for long. Density, tint and opacity
// per environment: config.LOOK3D.<env>.clouds { n, front, alpha, tint }. No clouds in caves. Switch: ?look=noclouds.
import { THREE, fx, look } from './style.js';
import { getTrimSheet, uvRect, CLOUD_DISCS } from './textures.js';

const REF_W = 7000, REF_H = 4000, REF_D = 3500; // the biggest view the wrap window is sized for (world units at the ship plane, camera distance)
const MAX_INSTANCES = 260;

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const VERT = `
  attribute vec3 aBase; attribute vec2 aSize; attribute vec4 aRect; attribute vec4 aMisc; attribute vec2 aSpan;
  uniform float uTime; uniform vec3 uCam; uniform float uAspect;
  varying vec2 vUv; varying float vAlpha;
  void main() {
    // aMisc: x = drift speed (world units / s), y = alpha, z = 1 for the clouds in front (they fade toward the screen's middle), w = unused
    vec2 rel = aBase.xy + vec2( aMisc.x * uTime, 0.0 ) - uCam.xy;
    rel = mod( rel + 0.5 * aSpan, aSpan ) - 0.5 * aSpan; // the wrap: round the camera, far outside the view
    vec3 centre = vec3( uCam.xy + rel, aBase.z );
    vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] ), up = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
    vec3 wp = centre + right * ( position.x * aSize.x ) + up * ( position.y * aSize.y );
    vec4 cc = projectionMatrix * viewMatrix * vec4( centre, 1.0 );
    vec2 ndc = cc.xy / max( cc.w, 1.0 );
    float mid = smoothstep( 0.38, 0.9, length( ndc * vec2( 0.85 * uAspect / 1.78, 1.15 ) ) );
    vAlpha = aMisc.y * mix( 1.0, mid, aMisc.z );
    vUv = vec2( mix( aRect.x, aRect.z, position.x + 0.5 ), mix( aRect.y, aRect.w, position.y + 0.5 ) );
    gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
  }
`;
const FRAG = `
  uniform sampler2D uTex; uniform vec3 uTint; uniform float uUntone, uExposure;
  varying vec2 vUv; varying float vAlpha;
  vec3 untoneNeutral( vec3 c ) { float x = min( c.r, min( c.g, c.b ) ); float xp = x >= 0.04 ? x + 0.04 : ( 1.0 - sqrt( max( 0.0, 1.0 - 25.0 * x ) ) ) / 12.5; return ( c + ( xp - x ) ) / max( uExposure, 0.0001 ); }
  void main() {
    vec4 t = texture2D( uTex, vUv, 1.6 ); // (a mip bias: the discs come out soft-edged, like haze, not like cut-outs)
    float a = t.a * vAlpha;
    if ( a < 0.01 ) discard;
    vec3 c = t.rgb * uTint;
    c = mix( c, untoneNeutral( c ), uUntone );
    gl_FragColor = vec4( c, a );
    #include <colorspace_fragment>
  }
`;

export function createClouds(scene) {
  const sheet = getTrimSheet();
  const uniforms = {
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAspect: { value: 1.78 }, uTex: { value: sheet.texture }, uTint: { value: new THREE.Color('#ffffff') },
    uUntone: fx.uUntone, uExposure: fx.uExposure,
  };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.toneMapped = false;
  mat.fog = false;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  const attrs = {
    aBase: new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 3), 3), aSize: new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 2), 2),
    aRect: new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4), aMisc: new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 4), 4),
    aSpan: new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES * 2), 2),
  };
  for (const [k, a] of Object.entries(attrs)) geo.setAttribute(k, a);
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.visible = false;
  scene.add(mesh);

  const C = { mesh, count: 0, key: '', on: false };
  const rects = CLOUD_DISCS.map((n) => { const r = uvRect(n, 2); return [r.u0, r.v0, r.u1, r.v1]; });

  // Lay out the clusters of an environment: n clusters (front of them in front of the gameplay plane), each 3-7 discs.
  C.build = (cfg, envKey) => {
    const key = envKey + '|' + cfg.n + '|' + cfg.front + '|' + cfg.alpha;
    if (key === C.key) return;
    C.key = key;
    const rnd = mulberry(1234 + (envKey.charCodeAt(0) || 0) * 17 + cfg.n), R = (a, b) => a + (b - a) * rnd();
    const list = [];
    const clusters = Math.max(0, Math.min(40, Math.round(cfg.n)));
    for (let c = 0; c < clusters; c++) {
      const front = c < Math.min(clusters, Math.round(cfg.front));
      const z = front ? R(350, 1100) : R(-3800, -1500);
      const scale = (REF_D - z) / REF_D; // how much bigger the cluster's span is at this depth than at the ship plane
      const spanX = REF_W * scale * 2.3, spanY = REF_H * scale * 2.3;
      const bx = R(0, spanX), by = R(-spanY / 2, spanY / 2);
      const base = front ? R(520, 900) : R(1100, 2100);
      const speed = (front ? R(60, 120) : R(14, 46)) * (rnd() < 0.5 ? 1 : -1) * (front ? 1 : 0.8);
      const k = 3 + Math.floor(rnd() * 5);
      for (let d = 0; d < k; d++) {
        const sz = base * R(0.6, 1.15);
        list.push({ x: bx + R(-0.8, 0.8) * base * (k > 4 ? 1.15 : 0.9), y: by + R(-0.28, 0.2) * base, z: z + R(-30, 30), w: sz, h: sz * R(0.78, 0.9), rect: rects[Math.floor(rnd() * 8)], sp: speed,
          a: front ? Math.min(0.36, cfg.alpha * 0.4) * R(0.8, 1) : cfg.alpha * R(0.82, 1), front: front ? 1 : 0, spanX, spanY });
      }
    }
    list.sort((p, q) => p.z - q.z); // far first (they are blended in this order)
    const n = Math.min(MAX_INSTANCES, list.length);
    for (let i = 0; i < n; i++) {
      const q = list[i];
      attrs.aBase.setXYZ(i, q.x, q.y, q.z); attrs.aSize.setXY(i, q.w, q.h);
      attrs.aRect.setXYZW(i, q.rect[0], q.rect[1], q.rect[2], q.rect[3]);
      attrs.aMisc.setXYZW(i, q.sp, q.a, q.front, 0);
      attrs.aSpan.setXY(i, q.spanX, q.spanY);
    }
    for (const a of Object.values(attrs)) a.needsUpdate = true;
    C.count = n;
    geo.instanceCount = n;
  };
  // the environment's clouds (rig.clouds) and whether the map is a cave (no sky there)
  C.setRig = (rig, envId, cave) => {
    const cfg = rig.clouds || { n: 0, front: 0, alpha: 0.9, tint: '#ffffff' };
    C.build(cfg, envId || 'x');
    C.on = !cave && cfg.n > 0;
    C.tint = cfg.tint || '#ffffff';
    C.applyTint();
  };
  const _w = new THREE.Color('#ffffff');
  // skyColor = the world's picture tint (the darkness: day white, night dark blue), the same the sky pictures are multiplied by
  C.setSky = (skyColor) => { _w.set(skyColor); C.applyTint(); };
  C.applyTint = () => { uniforms.uTint.value.set(C.tint || '#ffffff').multiply(_w); };
  C.update = (cam, target, t, aspect) => {
    mesh.visible = !!(C.on && look.clouds && C.count > 0);
    if (!mesh.visible) return;
    uniforms.uTime.value = t;
    uniforms.uCam.value.set(target.x, target.y, 0);
    uniforms.uAspect.value = aspect || 1.78;
  };
  C.dispose = () => { geo.dispose(); mat.dispose(); };
  return C;
}
