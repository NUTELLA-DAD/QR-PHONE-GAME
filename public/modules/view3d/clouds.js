// Clouds (WP3, A3): billboards of PAINTED CUMULUS from the trim sheet's cloud atlas (A3: six flat-bottomed, hard-edged, two-tone gouache silhouettes with a thin warm ink edge, opaque; the old soft discs
// read as camera bokeh). A cluster = one big cumulus and up to two smaller ones on the same base line; ALL in ONE InstancedMesh (one draw call). Unlit painted style (the same tint and untone as the
// sky pictures, see style.js paintedPlane), fixed to the world in x: every cloud drifts at a CONSTANT speed (linear in time, computed in the vertex shader, never a sine) and wraps round the camera
// far outside the view, so the sky is endless. A3: about half the clusters, none in front of the gameplay band (LOOK3D.<env>.clouds.front = 0; the old front machinery stays for a config that asks for
// some), and they hang in the SKY: a cloud's height is a share of the screen's half height at its depth (the way the painted strips hang from the top), never a world height, so the ships and the
// terrain never meet a flat-bottomed cloud. Depths: BEHIND the gameplay plane (z -1700 .. -3600: nearer than the painted far strips, so they pass in front of those). Density, tint and opacity per
// environment: config.LOOK3D.<env>.clouds { n, front, alpha, tint }. No clouds in caves. Switch: ?look=noclouds.
import { THREE, fx, look } from './style.js';
import { getTrimSheet, uvRect, CLOUD_DISCS, CLOUD_BASE, TRIM } from './textures.js';
import { config } from '../../config.js';

const REF_W = 7000, REF_H = 4000, REF_D = 3500; // the biggest view the wrap window is sized for (world units at the ship plane, camera distance)
const MAX_INSTANCES = 260;
const BASE_TO_CENTRE = (CLOUD_BASE - 0.5).toFixed(3); // (a sprite's middle sits this share of its height ABOVE the base line: the base line is at 80% from the top)

function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const VERT = `
  attribute vec3 aBase; attribute vec2 aSize; attribute vec4 aRect; attribute vec4 aMisc; attribute vec2 aSpan;
  uniform float uTime; uniform vec3 uCam; uniform float uAspect; uniform vec4 uAvoid; uniform vec3 uLow; uniform vec2 uView;
  varying vec2 vUv; varying float vAlpha;
  void main() {
    // aBase: x = world x, y = the height of the cumulus' base line as a share of the screen's half height at its depth (0 = the middle of the screen, 1 = the top), z = depth.
    // aMisc: x = drift speed (world units / s), y = alpha, z = 1 for the clouds in front (they fade toward the screen's middle), w = the sprite's own lift above its cluster's base line (world units)
    float relx = aBase.x + aMisc.x * uTime - uCam.x;
    relx = mod( relx + 0.5 * aSpan.x, aSpan.x ) - 0.5 * aSpan.x; // the wrap: round the camera, far outside the view
    float halfH = uView.x * max( 0.2, ( uView.y - aBase.z ) / uView.y ); // the screen's half height at this depth (uView = the ship plane's half height, the camera's distance)
    vec3 centre = vec3( uCam.x + relx, uCam.y + aBase.y * halfH + aMisc.w + ${BASE_TO_CENTRE} * aSize.y, aBase.z );
    vec3 right = vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] ), up = vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] );
    vec3 wp = centre + right * ( position.x * aSize.x ) + up * ( position.y * aSize.y );
    vec4 cc = projectionMatrix * viewMatrix * vec4( centre, 1.0 );
    vec2 ndc = cc.xy / max( cc.w, 1.0 );
    // WP9: a cloud IN FRONT of the ship keeps out of the ships' screen area altogether (uAvoid = their box in screen coordinates) and fades away over the lower half of the screen (uLow = from, to)
    vec2 outside = max( max( vec2( uAvoid.x, uAvoid.y ) - ndc, ndc - vec2( uAvoid.z, uAvoid.w ) ), vec2( 0.0 ) );
    float clear = smoothstep( 0.0, uLow.z, length( outside * vec2( uAspect / 1.78, 1.0 ) ) );
    float high = smoothstep( uLow.x, uLow.y, ndc.y );
    vAlpha = aMisc.y * mix( 1.0, clear * high, aMisc.z );
    vUv = vec2( mix( aRect.x, aRect.z, position.x + 0.5 ), mix( aRect.y, aRect.w, position.y + 0.5 ) );
    gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
  }
`;
const FRAG = `
  uniform sampler2D uTex; uniform vec3 uTint; uniform float uUntone, uExposure;
  varying vec2 vUv; varying float vAlpha;
  vec3 untoneNeutral( vec3 c ) { float x = min( c.r, min( c.g, c.b ) ); float xp = x >= 0.04 ? x + 0.04 : ( 1.0 - sqrt( max( 0.0, 1.0 - 25.0 * x ) ) ) / 12.5; return ( c + ( xp - x ) ) / max( uExposure, 0.0001 ); }
  void main() {
    vec4 t = texture2D( uTex, vUv );
    float a = smoothstep( 0.32, 0.68, t.a ) * vAlpha; // (a hard painted edge, anti-aliased by the texture's own gradient; the dark fringe of the transparent texels goes with it)
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
    uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAspect: { value: 1.78 }, uAvoid: { value: new THREE.Vector4(-0.7, -0.7, 0.7, 0.7) }, uLow: { value: new THREE.Vector3(-0.1, 0.45, 0.3) }, uView: { value: new THREE.Vector2(1000, 3500) }, uTex: { value: sheet.texture }, uTint: { value: new THREE.Color('#ffffff') },
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
  const rects = CLOUD_DISCS.map((n) => { const r = uvRect(n, 1); const q = [r.u0, r.v0, r.u1, r.v1]; q.aspect = (TRIM[n].h - 2) / (TRIM[n].w - 2); return q; });

  // Lay out the clusters of an environment: n clusters (front of them in front of the gameplay plane), each one big cumulus and up to two smaller ones.
  C.build = (cfg, envKey) => {
    const key = envKey + '|' + cfg.n + '|' + cfg.front + '|' + cfg.alpha;
    if (key === C.key) return;
    C.key = key;
    const rnd = mulberry(1234 + (envKey.charCodeAt(0) || 0) * 17 + cfg.n), R = (a, b) => a + (b - a) * rnd();
    const list = [];
    const clusters = Math.max(0, Math.min(40, Math.round(cfg.n)));
    const FC = config.LOOK3D.FRONT_CLOUDS || {}, fSize = FC.SIZE || [200, 380], fAlpha = Number.isFinite(FC.ALPHA) ? FC.ALPHA : 0.2, fShare = Number.isFinite(FC.SHARE) ? FC.SHARE : 0.5;
    const nFront = Math.min(clusters, Math.ceil(Math.max(0, cfg.front) * fShare - 1e-6)); // (WP9: fewer of them)
    // A3: the sky is split into bands (the base line's share of the screen's half height: 0.25 .. 0.92) so the clusters spread out over the sky instead of piling up; one cumulus is a gouache
    // sprite (aspect from its cell), a cluster is one big one and up to two smaller ones standing on the same base line, all drifting at the same constant speed.
    const bands = Math.max(1, Math.min(4, clusters));
    for (let c = 0; c < clusters; c++) {
      const front = c < nFront;
      const z = front ? R(350, 1100) : R(-3600, -1700);
      const scale = (REF_D - z) / REF_D; // how much bigger the cluster's span is at this depth than at the ship plane
      const spanX = REF_W * scale * 2.3, spanY = REF_H * scale * 2.3;
      const bx = R(0, spanX);
      const band = (c + Math.floor(rnd() * 2)) % bands, fy = front ? R(0.1, 0.8) : 0.1 + (band + R(0.1, 0.9)) / bands * 0.55;
      const base = front ? R(fSize[0], fSize[1]) : R(700, 1250); // (the big sprite's width, world units)
      const speed = (front ? R(60, 120) : R(14, 40)) * (rnd() < 0.5 ? 1 : -1) * (front ? 1 : 0.8);
      const k = front ? 1 : 1 + (rnd() < 0.65 ? 1 : 0) + (rnd() < 0.3 ? 1 : 0);
      const first = Math.floor(rnd() * rects.length);
      for (let d = 0; d < k; d++) {
        const sz = d === 0 ? base : base * R(0.5, 0.75), side = d === 1 ? -1 : 1;
        const rc = rects[(first + d * 2 + (d ? Math.floor(rnd() * 2) : 0)) % rects.length];
        list.push({ x: bx + (d === 0 ? 0 : side * R(0.5, 0.72) * (base + sz) * 0.5), y: fy, lift: d === 0 ? 0 : R(-0.02, 0.03) * base, z: z + d * 8, w: sz, h: sz * rc.aspect, rect: rc, sp: speed,
          a: front ? Math.min(fAlpha, cfg.alpha * 0.4) : cfg.alpha, front: front ? 1 : 0, spanX, spanY });
      }
    }
    list.sort((p, q) => p.z - q.z); // far first (they are blended in this order)
    const n = Math.min(MAX_INSTANCES, list.length);
    for (let i = 0; i < n; i++) {
      const q = list[i];
      attrs.aBase.setXYZ(i, q.x, q.y, q.z); attrs.aSize.setXY(i, q.w, q.h);
      attrs.aRect.setXYZW(i, q.rect[0], q.rect[1], q.rect[2], q.rect[3]);
      attrs.aMisc.setXYZW(i, q.sp, q.a, q.front, q.lift);
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
  // WP9: the ships' box on the screen (minx, miny, maxx, maxy in -1..1): the front clouds fade out near it (index.js works it out from the ships' bounds)
  C.setAvoid = (minx, miny, maxx, maxy) => {
    const pad = Number((config.LOOK3D.FRONT_CLOUDS || {}).PAD) || 0.3;
    uniforms.uAvoid.value.set(minx - 0.04, miny - 0.04, maxx + 0.04, maxy + 0.04);

    const low = (config.LOOK3D.FRONT_CLOUDS || {}).LOW || [-0.1, 0.45];
    uniforms.uLow.value.set(low[0], low[1], pad);
  };
  C.update = (cam, target, t, aspect, vis) => {
    mesh.visible = !!(C.on && look.clouds && C.count > 0);
    if (!mesh.visible) return;
    uniforms.uTime.value = t;
    uniforms.uCam.value.set(target.x, target.y, 0);
    uniforms.uAspect.value = aspect || 1.78;
    const D = Math.max(200, cam.position.distanceTo(target)); // (A3: the screen's half height at the ship plane, and the camera's distance: a cloud's height is a share of the half height at its own depth)
    uniforms.uView.value.set(Math.max(50, vis && vis.h ? vis.h / 2 : D * 0.4), D);
  };
  C.dispose = () => { geo.dispose(); mat.dispose(); };
  return C;
}
