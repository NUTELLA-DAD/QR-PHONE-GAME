// WP10: LIGHTNING. The sim's weather (host/weather.js, envStormSea.js) sets `state.weather.flash` (1 at a flash, falling to 0 in a third of a second) and `state.weather.bolt` ({ x, y | null, t }: a strike on the
// ship's deck, or a bolt in the distance when y is null). The 2D game whitens the screen and draws one zigzag line. In 3D:
//   - THE FLASH is STEPPED: the sim's smooth fall is quantised to a few equal steps (config.LOOK3D.LIGHTNING.STEPS, 3: 1, 2/3, 1/3, then dark), so the picture snaps bright and falls in jumps, never a smooth fade. Each step
//     adds ambient light (the hemisphere light, so the ships and rock are lit cool-white from every side) and adds light to the whole picture in the grade pass (post.js uFlash: the sky and the clouds whiten).
//   - THE BOLT is a jagged ribbon from above the top of the screen to the strike, a fixed shape per strike (a seeded generator keyed by the strike's own numbers, so the same strike always has the same bolt), with
//     two short forks. Two frames at the sim's bolt time: a wide glow with a white core, then a thinner one, then nothing. Unlit HDR colours, so the bloom pass makes it burn. A distant bolt (no y) hangs far behind.
// No Math.random, no sine, no smooth fade. Reads the game's state only. Never throws (the view calls it inside a try/catch).
import { THREE, look } from './style.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);

// a small seeded generator (mulberry32)
function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A jagged path from (x0, y0) down to (x1, y1): n segments, each point pushed sideways by up to `jit` (world units). Returns [[x, y], ...].
function zigzag(r, x0, y0, x1, y1, n, jit) {
  const pts = [[x0, y0]];
  for (let k = 1; k < n; k++) {
    const f = k / n, side = k % 2 ? 1 : -1; // (alternating sides, so it reads as a bolt and not a wobbly line)
    pts.push([x0 + (x1 - x0) * f + side * jit * (0.35 + 0.65 * r()), y0 + (y1 - y0) * f + (r() - 0.5) * jit * 0.5]);
  }
  pts.push([x1, y1]);
  return pts;
}

// A ribbon along a path (width tapering from w0 at the start to w1 at the end), pushed into `pos` as triangles at depth z.
function ribbon(pos, pts, w0, w1, z) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    const wa = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2, wb = (w0 + (w1 - w0) * ((i + 1) / (pts.length - 1))) / 2;
    const p0 = [a[0] + nx * wa, a[1] + ny * wa], p1 = [a[0] - nx * wa, a[1] - ny * wa], p2 = [b[0] + nx * wb, b[1] + ny * wb], p3 = [b[0] - nx * wb, b[1] - ny * wb];
    pos.push(p0[0], p0[1], z, p1[0], p1[1], z, p2[0], p2[1], z, p1[0], p1[1], z, p3[0], p3[1], z, p2[0], p2[1], z);
  }
}

export function createLightning({ scene, post, world, state }) {
  const cfg = () => (config.LOOK3D && config.LOOK3D.LIGHTNING) || {};
  const bolt = () => cfg().BOLT || {};
  const mk = (hex) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false });
  const glowMat = mk('#7fb4ff'), coreMat = mk('#ffffff'), haloMat = mk('#7fb4ff'); // (WP15: a wide faint HALO under the glow, so the bolt has body next to the flash: halo, glow, white core)
  const glowMesh = new THREE.Mesh(new THREE.BufferGeometry(), glowMat), coreMesh = new THREE.Mesh(new THREE.BufferGeometry(), coreMat), haloMesh = new THREE.Mesh(new THREE.BufferGeometry(), haloMat);
  for (const m of [haloMesh, glowMesh, coreMesh]) { m.frustumCulled = false; m.renderOrder = 20; m.visible = false; scene.add(m); }
  const S = { flash: 0, key: 0, strikes: 0, shown: '' };
  let cur = null; // the bolt being shown: { ref, start (its t when first seen), seed, built }
  let lastRef = null;
  const grade = post && post.passes && post.passes.grade;

  // c = { cam: { visW, visH }, target (the camera's look-at, 3D) }
  const update = (c) => {
    const w = state.weather, L = cfg(), B = bolt();
    const on = look.lightning && !!w;
    // ---- the stepped flash
    const steps = Math.max(1, Math.round(fin(L.STEPS, 3)));
    const f = on ? clamp(fin(w.flash), 0, 1) : 0;
    const key = f > 0.02 ? Math.ceil(f * steps - 1e-6) / steps : 0;
    S.flash = f; S.key = key;
    world.lights.setFlash(key * fin(L.HEMI, 2.4));
    if (grade) { grade.uniforms.uFlash.value = key * fin(L.FLASH, 0.34); grade.uniforms.uFlashColor.value.set(L.COLOR || '#cfe0ff'); }
    // ---- the bolt
    const b = on ? w.bolt : null;
    if (!b || !Number.isFinite(b.x) || !(b.t > 0)) { glowMesh.visible = coreMesh.visible = haloMesh.visible = false; lastRef = null; cur = null; S.shown = ''; return; }
    if (b !== lastRef) { // a new strike: its shape comes from its own numbers, so it never changes while it lives
      lastRef = b; S.strikes++;
      cur = { start: Math.max(0.05, fin(b.t, 0.25)), seed: (Math.round(b.x) * 73856093) ^ (Math.round(fin(b.y, 77)) * 19349663) ^ (S.strikes * 83492791), far: !Number.isFinite(b.y), built: false };
    }
    if (!cur) return;
    const age = cur.start - b.t, k0 = fin((B.KEYS || [0.12, 0.1])[0], 0.12), k1 = fin((B.KEYS || [0.12, 0.1])[1], 0.1);
    const frame = age < k0 ? 0 : age < k0 + k1 ? 1 : 2; // (stepped: a full bolt, a thinner one, gone)
    if (frame === 2) { glowMesh.visible = coreMesh.visible = haloMesh.visible = false; S.shown = ''; return; }
    if (!cur.built) {
      cur.built = true;
      const vh = Math.max(600, fin(c.cam && c.cam.visH, 1500)), top = c.target.y + vh / 2 + 400;
      const x1 = b.x, y1 = cur.far ? c.target.y - vh * 0.35 : -b.y, x0 = b.x + 120, r = rng(cur.seed);
      const n = Math.max(4, Math.round(fin(B.SEGMENTS, 9))), jit = fin(B.JITTER, 0.1) * (top - y1) * 0.55;
      const main = zigzag(r, x0, top, x1, y1, n, jit);
      const z = cur.far ? -1400 : 50, widen = cur.far ? 1.7 : 1, wg = fin(B.WIDTH, 16) * widen, wc = fin(B.CORE_WIDTH, 5) * widen;
      const gpos = [], cpos = [], hpos = [];
      ribbon(hpos, main, wg * 2.6, wg * 1.1, z - 1); ribbon(gpos, main, wg * 1.4, wg * 0.5, z); ribbon(cpos, main, wc * 1.3, wc * 0.5, z + 1);
      const forks = Math.round(fin(B.FORKS, 2));
      for (let q = 0; q < forks; q++) { // short forks off the upper-middle of the bolt, leaning away from it
        const i = 2 + Math.floor(r() * Math.max(1, n - 5)), p = main[i], dir = r() < 0.5 ? -1 : 1, len = (top - y1) * (0.12 + 0.12 * r());
        const fk = zigzag(r, p[0], p[1], p[0] + dir * len * 0.7, p[1] - len, 3, len * 0.18);
        ribbon(gpos, fk, wg * 0.6, wg * 0.15, z); ribbon(cpos, fk, wc * 0.6, wc * 0.15, z + 1);
      }
      glowMesh.geometry.dispose(); coreMesh.geometry.dispose(); haloMesh.geometry.dispose();
      haloMesh.geometry = new THREE.BufferGeometry(); haloMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(hpos, 3));
      glowMesh.geometry = new THREE.BufferGeometry(); glowMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
      coreMesh.geometry = new THREE.BufferGeometry(); coreMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
      const hdr = fin(B.HDR, 2.6) * (cur.far ? 0.6 : 1);
      glowMat.color.set(B.GLOW || '#7fb4ff').multiplyScalar(hdr * 0.6); coreMat.color.set(B.CORE || '#ffffff').multiplyScalar(hdr); haloMat.color.set(B.GLOW || '#7fb4ff').multiplyScalar(hdr * fin(B.HALO, 0.2));
    }
    // frame 1 is a thinner, dimmer bolt (the same shape): a scale of the whole ribbon about its own top would shift it, so it fades its strength instead
    glowMat.opacity = frame === 0 ? 1 : 0.55; coreMat.opacity = frame === 0 ? 1 : 0.7; haloMat.opacity = frame === 0 ? 1 : 0.5;
    glowMesh.visible = coreMesh.visible = haloMesh.visible = true;
    S.shown = frame === 0 ? 'A' : 'B';
  };
  const dispose = () => { for (const m of [haloMesh, glowMesh, coreMesh]) { m.geometry.dispose(); m.material.dispose(); scene.remove(m); } };
  return { update, stats: S, dispose };
}
