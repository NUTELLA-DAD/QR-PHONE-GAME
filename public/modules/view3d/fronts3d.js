// LOOP.md R5: WEATHER FRONTS FROM DEPTH. A storm front, a blizzard or a bank of Ember smoke is seen coming before it arrives: a wall of painted cloud on the horizon that rolls toward the camera (nearer, taller,
// darker) and, once it has passed, rolls away again. ONE draw call: a row of cloud sprites (one painted picture per kind, drawn in code, nothing downloaded) in an instanced mesh, billboards to the plain gameplay
// lens. The sprites are fixed to the WORLD like the clouds (a constant parallax scroll of the ship's own flight, a constant drift, wrapped round the camera far outside the picture), so nothing shimmers when the camera pans;
// what changes is the front's strength f (0..1), which depth3d.js works out: a storm's from the ROUTE (the sim's own storm zones, config.STORM.ZONES, with a lead before and a tail after, so the wall is a function of
// where the ship is), a blizzard's and the smoke's from the sim's own number (they have no earlier hint) - eased, so a jump in the route becomes a roll of a few seconds. f sets the wall's depth (far to near, config.DEPTH3D.FRONT.Z), its
// height, how low its base hangs and how opaque it is (four held steps). Stepped, no sine of the time. Tier Low: none. If the picture cannot be painted the wall is simply not drawn.
import { THREE, paintedPlane, look } from './style.js';
import { config } from '../../config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const D3 = () => (config.DEPTH3D && config.DEPTH3D.FRONT) || {};
const _white = new THREE.Color('#ffffff'), _tint = new THREE.Color(), _col = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

// the painted bank: lobes of cumulus-nimbus cut flat along a base line, a lit top, a thin rim; the storm's has a curtain of rain streaks hanging under it
const BASE = { storm: 0.74, blizzard: 0.93, smoke: 0.93 }; // (where the base line is, from the top of the picture)
function paint(kind, cols) {
  const W = 1024, H = 640, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  if (!g) return null;
  const rnd = mulberry(kind.charCodeAt(0) * 131 + kind.length), baseY = H * (BASE[kind] || 0.9);
  const n = 11, lobes = [];
  for (let i = 0; i < n; i++) { // a row of billows along the base, big in the middle
    const u = i / (n - 1), mid = 1 - Math.abs(u - 0.5) * 1.1, r = (46 + rnd() * 40) * (0.7 + 0.6 * mid) * (kind === 'storm' ? 1.15 : 1);
    lobes.push({ x: 50 + (W - 100) * u + (rnd() - 0.5) * 30, r, y: baseY - r * 0.55 - (kind === 'storm' ? mid * 40 : 0) });
  }
  for (let row = 1; row <= 2; row++) for (let i = 0; i < 6 - row; i++) { // towers on top of them
    const l = lobes[1 + Math.floor(rnd() * (n - 2))], r = l.r * (0.75 - 0.15 * row + 0.2 * rnd());
    lobes.push({ x: l.x + (rnd() - 0.5) * l.r * 1.1, r, y: l.y - l.r * (0.55 + 0.5 * (row - 1)) - r * 0.2 });
  }
  g.fillStyle = cols[0];
  for (const l of lobes) { g.beginPath(); g.arc(l.x, l.y, l.r, 0, Math.PI * 2); g.fill(); }
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = cols[1]; // the lit side: the same billows shifted up and left, kept inside the shape
  for (const l of lobes) { g.beginPath(); g.arc(l.x - l.r * 0.2, l.y - l.r * 0.24, l.r * 0.8, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = cols[2]; g.lineWidth = 3; g.globalAlpha = 0.4; // a thin light rim along the top edge of each billow
  for (const l of lobes) { g.beginPath(); g.arc(l.x - l.r * 0.05, l.y - l.r * 0.06, l.r * 0.95, Math.PI * 1.1, Math.PI * 1.62); g.stroke(); }
  g.globalAlpha = 1;
  if (kind === 'smoke') { g.fillStyle = cols[2]; g.globalAlpha = 0.45; g.fillRect(0, baseY - 20, W, 20); g.globalAlpha = 1; } // (the lava's glow under the bank)
  g.globalCompositeOperation = 'destination-over'; // the ink edge round the whole mass (behind what is there)
  g.strokeStyle = 'rgba(32,34,52,0.85)'; g.lineWidth = 5;
  for (const l of lobes) { g.beginPath(); g.arc(l.x, l.y, l.r + 1, 0, Math.PI * 2); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, baseY, W, H - baseY); // the flat underside (the ink and the billows are cut off together)
  if (kind === 'storm') { // the rain curtain: slanted streaks that thin out downward
    for (let k = 0; k < 130; k++) {
      const x = 20 + rnd() * (W - 40), len = 50 + rnd() * (H - baseY - 20), a = 0.55 * (0.4 + 0.6 * rnd());
      const gr = g.createLinearGradient(x, baseY - 8, x - len * 0.12, baseY + len);
      gr.addColorStop(0, `rgba(52,60,86,${a})`); gr.addColorStop(1, 'rgba(52,60,86,0)');
      g.strokeStyle = gr; g.lineWidth = 2 + rnd() * 3;
      g.beginPath(); g.moveTo(x, baseY - 8); g.lineTo(x - len * 0.12, baseY + len); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2; t.needsUpdate = true;
  return t;
}

export function createFronts(scene) {
  const F = { stats: { kind: '', f: 0, calls: 0, sprites: 0 }, tierOn: true };
  const N = Math.max(4, Math.min(24, Number(D3().WALL) || 15));
  const mat = paintedPlane(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: '#ffffff', side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = -15.5; mesh.name = 'weatherFront';
  scene.add(mesh);
  const rnd = mulberry(4242);
  const ROWS = 3, units = [];
  for (let row = ROWS - 1; row >= 0; row--) { // the back row first (they are blended in this order), the front row last
    const per = Math.ceil(N / ROWS);
    for (let j = 0; j < per && units.length < N; j++) units.push({ row, u: -0.9 + (1.8 * (j + (row % 2) * 0.5)) / per + (rnd() - 0.5) * 0.1, k: 0.8 + rnd() * 0.45, flip: rnd() < 0.5 ? -1 : 1, tone: 0.78 + 0.1 * row + 0.12 * rnd(), far: rnd() }); // (k = a size, tone = the back rows darker)
  }
  while (units.length < N) units.push({ ...units[units.length - 1] });
  for (let i = 0; i < N; i++) mesh.setColorAt(i, _col.setScalar(units[i].tone));
  mesh.instanceColor.needsUpdate = true;
  const tex = {};
  let kindNow = '', env = '', cave = false;
  F.setTier = (tier) => { const T = ((config.DEPTH3D || {}).TIERS || {})[tier && tier.name] || {}; F.tierOn = !!T.front; };
  F.setEnv = (e, c) => { env = e; cave = !!c; };

  // front = { kind: 'storm' | 'blizzard' | 'smoke', f: 0..1 (how near and how thick), side: +1 coming (from ahead), -1 going (toward behind) }
  F.update = (cam, target, vis, t, ctx, W) => {
    const fr = ctx && ctx.front;
    const on = (config.DEPTH3D || {}).ENABLED !== false && look.depth && F.tierOn && !cave && fr && fr.f > 0.012 && W && W.lights;
    if (!on) { mesh.visible = false; F.stats.calls = 0; F.stats.f = 0; return; }
    const C = D3(), cols = (C.COLORS || {})[fr.kind];
    if (!cols) { mesh.visible = false; return; }
    if (kindNow !== fr.kind) {
      kindNow = fr.kind;
      if (!tex[kindNow]) { try { tex[kindNow] = paint(kindNow, cols); } catch { tex[kindNow] = null; } }
      mat.map = tex[kindNow]; mat.needsUpdate = true;
    }
    if (!mat.map) { mesh.visible = false; return; }
    const f = clamp(fr.f, 0, 1), side = fr.side >= 0 ? 1 : -1, Z = C.Z || [-9000, -2400], span = Number(C.SPAN) || 1.7;
    const e = 1 - (1 - f) * (1 - f); // (it picks up speed far away and slows as it arrives)
    const z = Z[0] + (Z[1] - Z[0]) * e;
    const tanH = Math.tan((cam.fov * Math.PI) / 360), shear = cam.userData.lensShift || 0, hd = cam.position.z - z;
    const halfH = hd * tanH, halfW = halfH * (cam.aspect || 1.78);
    const kind = fr.kind, tall = kind === 'storm' ? 1.0 : kind === 'smoke' ? 0.62 : 0.8;
    const hs = (0.1 + 1.15 * f) * tall; // the wall's height as a share of the picture's height
    const bshare = kind === 'storm' ? 0.46 - 0.78 * f : kind === 'smoke' ? 0.2 - 0.9 * f : 0.1 - 1.0 * f; // where its base hangs (a share of the half height; the horizon is at 0.45)
    const baseY = cam.position.y + hd * (bshare * tanH - shear);
    const hW = hs * 2 * halfH, vb = BASE[kind] || 0.9;
    const scroll = target.x / ((cam.position.z + 5000) * tanH * (cam.aspect || 1.78)); // (the ship's flight scrolls the wall like a thing 5000 behind the plane)
    const dr = 0.012 * (Math.floor(t * 8) / 8); // (a constant slow drift, in 8 fps steps)
    for (let i = 0; i < N; i++) {
      const U = units[i];
      let u = U.u * span * 0.5 - scroll * 0.9 + dr + side * (1 - f) * 0.5 + U.row * 0.07;
      u = u - span * Math.floor((u + span / 2) / span); // wrap into [-span/2, span/2)
      const h = hW * (0.62 + 0.3 * U.k), w = h * 1.6, lift = U.row * hW * 0.035; // (every row stands on the same cloud base, like a shelf cloud; the back rows a touch higher, so the skyline is ragged)
      const yc = baseY - h / 2 + vb * h + lift;
      _m.compose(_p.set(target.x + u * halfW, yc, z - U.row * 160 - U.far * 40), _q.identity(), _s.set(w * U.flip, h, 1));
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // the picture tint of the hour (like the strips) and four held opacity steps
    _tint.set(W.todCfg ? W.todCfg.sky : '#ffffff'); if (W.tod !== 'night') _tint.lerp(_white, 0.35);
    mat.color.copy(_tint);
    mat.opacity = Math.round(clamp(0.3 + 0.7 * f, 0, 1) * 4) / 4 || 0.25;
    mesh.renderOrder = f < 0.45 ? -15.5 : -14.5;
    mesh.visible = true;
    F.stats.kind = kind; F.stats.f = f; F.stats.calls = 1; F.stats.sprites = N;
  };
  F.dispose = () => { scene.remove(mesh); mesh.geometry.dispose(); mat.dispose(); for (const k of Object.keys(tex)) if (tex[k]) tex[k].dispose(); };
  F.mesh = mesh;
  return F;
}
