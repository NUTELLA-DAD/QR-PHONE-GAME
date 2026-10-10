// Guns, searchlights, the lightning coil and the crew cannon (WP2). A gun's barrel and a lamp's drum are animated (aim comes from the sim every frame), so each is a Group of its own (batched with its ink
// shell); the pedestals and carriages are static pieces of the part's batch. The searchlight keeps its real SpotLight, its two soft cones and its glowing lens exactly as WP1 left them.
import { THREE, look, glow, glowMat } from '../style.js';
import { accents } from './stations.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const GUN_LOOK = {
  long: { len: 118, r: 6.5 }, mortar: { len: 44, r: 15 }, scatter: { len: 70, r: 11 }, flak: { len: 78, r: 8 },
  harpoon: { len: 100, r: 5 }, flame: { len: 68, r: 10 }, mines: { len: 44, r: 12 },
};

// The beam of a searchlight: an open cone from the lens along +x, brightest at the lens and fading to black (invisible when added) at the far end.
function beamGeo(len, half, color, a0) {
  const r = Math.tan(half) * len;
  const g = new THREE.ConeGeometry(r, len, 24, 1, true);
  g.translate(0, -len / 2, 0);
  g.rotateZ(Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(color);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp(pos.getX(i) / len, 0, 1), k = a0 * (1 - t) * (1 - t * 0.3);
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
export const GLOW = { lens: glow('#fffbe0', 2.8), lensOff: new THREE.Color('#b9b09a') };

export function buildGun(name, m, ctx) {
  const { T, X, Y } = ctx, key = 'gun:' + name, b = ctx.part(key), g = GUN_LOOK[m.type] || { len: 84, r: 8 };
  b.cyl(T.hullDark, X(m.bx), Y(m.by + 14), 0, 24, 22, 3, 0, 0, 0, undefined, { tr: 'iron' });
  b.cyl(T.iron, X(m.bx), Y(m.by + 26), 0, 26, 5, 1.2, 0, 0, 0, undefined, { tr: 'iron' }); // the traverse ring
  b.box(T.hullDark, X(m.bx), Y(m.by + 4), 0, 16, 28, 16, 1.5, 0, 0, 0, { tr: 'iron' });
  for (const s of [-1, 1]) b.box(T.hullDark, X(m.bx), Y(m.by - 2), s * 15, 14, 18, 4, 1, 0, 0, 0, { tr: 'iron' }); // the cheeks the trunnions sit in
  const bar = ctx.dynBatch(key + ':barrel');
  bar.cyl(T.iron, g.len / 2 - 8, 0, 0, g.r, g.len, 2.5, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
  bar.sphere(T.hullDark, 0, 0, 0, g.r + 7, g.r + 7, g.r + 7, 2.5, true, { tr: 'iron' });
  for (const k of [0.3, 0.62]) bar.cyl('#7c7468', g.len * k - 8, 0, 0, g.r * 1.14, 6, 1, 0, 0, Math.PI / 2, undefined, { tr: 'iron' }); // reinforcing bands
  bar.cyl(accents().brass, g.len - 6, 0, 0, g.r * 1.28, 9, 1.4, 0, 0, Math.PI / 2, undefined, { tr: 'plain' }); // the muzzle ring (A5: a bright brass accent)
  bar.cyl(T.hullDark, 0, 0, 0, g.r * 0.7, g.r * 3.2 + 14, 1, Math.PI / 2, 0, 0, undefined, { tr: 'iron' }); // the trunnion pin
  if (m.type === 'flame') bar.cone('#ffb347', g.len + 6, 0, 0, g.r * 1.4, 20, 1.5, 0, 0, -Math.PI / 2, { tr: 'plain' });
  const pivot = new THREE.Group();
  pivot.position.set(X(m.bx), Y(m.by), 0);
  pivot.rotation.z = -m.aim;
  pivot.add(bar.buildGroup());
  ctx.content.add(pivot);
  return { key, batches: [b], dyn: [{ role: 'gun', key, name, node: pivot }], bounds: b.bounds };
}

export function buildSearchlight(name, s, ctx) {
  const { T, X, Y, content } = ctx, key = 'searchlight:' + name, b = ctx.part(key), ll = s.len || 44;
  b.cyl(T.hullDark, X(s.bx), Y(s.by + 22), 0, 7, 44, 1.5, 0, 0, 0, undefined, { tr: 'iron' });
  b.cyl(T.iron, X(s.bx), Y(s.by + 44), 0, 12, 6, 1, 0, 0, 0, undefined, { tr: 'iron' });
  const lamp = ctx.dynBatch(key + ':lamp');
  lamp.cyl(T.brass, ll / 2 - 10, 0, 0, 22, ll, 3, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
  lamp.cyl(T.iron, -6, 0, 0, 26, 16, 3, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
  lamp.cyl(T.hullDark, ll - 2, 0, 0, 24.5, 6, 1.2, 0, 0, Math.PI / 2, undefined, { tr: 'iron' }); // the rim ring round the lens
  const pivot = new THREE.Group();
  pivot.position.set(X(s.bx), Y(s.by), 0);
  pivot.rotation.z = -s.aim;
  const tiltG = new THREE.Group(); // the lamp is also turned a little into the scene (away from the viewer: WP10 cut this from 0.46 to 0.1 rad, less than the beam's own half angle, so what the sim calls lit, in the gameplay plane, is really INSIDE the 3D cone)
  tiltG.rotation.y = 0.1;
  pivot.add(tiltG);
  tiltG.add(lamp.buildGroup());
  const lens = new THREE.Mesh(new THREE.CircleGeometry(19, 16), glowMat('#fffbe0', 2.8));
  lens.rotation.y = Math.PI / 2;
  lens.position.set(ll + 0.5, 0, 0);
  tiltG.add(lens);
  const reach = 1000, half = 0.26;
  const spot = new THREE.SpotLight('#fff0c8', 0, reach * 1.5, half, 0.35, 0);
  spot.position.set(ll, 0, 0);
  const target = new THREE.Object3D();
  target.position.set(reach, 0, 0);
  tiltG.add(spot, target);
  spot.target = target;
  const outer = new THREE.Mesh(beamGeo(reach, half, '#fff0c8', 0.3), beamMat);
  const inner = new THREE.Mesh(beamGeo(reach * 0.8, half * 0.5, '#fffbe8', 0.42), beamMat);
  for (const m2 of [outer, inner]) { m2.position.x = ll; m2.renderOrder = 5; m2.frustumCulled = false; tiltG.add(m2); }
  content.add(pivot);
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 30;
  spot.shadow.bias = -0.0005;
  spot.shadow.normalBias = 6;
  return { key, batches: [b], dyn: [{ role: 'lamp', key, name, pivot, spot, target, outer, inner, lens, reach, ll, home: s.aim, arc: s.arc || 1.4, node: pivot }], bounds: b.bounds };
}

export function buildCoil(c, ctx) {
  const { T, X, Y, content } = ctx, key = 'coil', b = ctx.part(key);
  b.cyl(T.iron, X(c.x), Y(c.y + 32), 0, 18, 64, 2.5, 0, 0, 0, undefined, { tr: 'iron' });
  for (const dy of [10, 30, 50]) b.geo(T.brass, new THREE.TorusGeometry(24, 3.5, 6, 12), new THREE.Matrix4().compose(V(X(c.x), Y(c.y + dy), 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), V(1, 1, 1)), 1.5, { tr: 'brass', uv: 'fit' });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8), new THREE.MeshBasicMaterial({ color: '#9dd6e3' }));
  tip.position.set(X(c.x), Y(c.y - 10), 0);
  content.add(tip);
  return { key, batches: [b], dyn: [{ role: 'coilTip', key, node: tip }], bounds: b.bounds };
}

// The crew cannon: a wooden carriage with two wheels and a brass trunnion post (static), and the barrel (a group that follows state.cannons[name].aim and kicks back).
export function buildCannon(c, ctx) {
  const { T, X, Y, P, content } = ctx, key = 'cannon:' + c.n, b = ctx.part(key), q = P[c.d];
  if (!q) return { key, batches: [b], dyn: [], bounds: null };
  b.box(T.hullDark, X(c.x), Y(q.y - 22), 0, 88, 16, 40, 2.5, 0, 0, 0, { tr: 'woodC' });
  for (const dx of [-26, 26]) for (const s of [-1, 1]) {
    b.cyl(T.iron, X(c.x + dx), Y(q.y - 14), s * 24, 15, 6, 1.6, Math.PI / 2, 0, 0, undefined, { tr: 'iron' });
    b.cyl(T.rail, X(c.x + dx), Y(q.y - 14), s * 24, 6, 8, 1, Math.PI / 2, 0, 0, undefined, { tr: 'woodC' });
  }
  b.box(T.brass, X(c.x), Y(q.y - 46), 0, 18, 34, 22, 1.8, 0, 0, 0, { tr: 'brass' });
  const bar = ctx.dynBatch(key + ':barrel');
  bar.cyl(T.brass, 28, 0, 0, 16, 92, 2.4, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
  bar.cyl('#a8863a', 10, 0, 0, 18, 4, 1, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
  bar.cyl('#a8863a', 40, 0, 0, 16.5, 4, 1, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
  bar.cyl('#a8863a', 77, 0, 0, 18.5, 14, 1.4, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
  bar.sphere(T.brass, -20, 0, 0, 15, 15, 15, 2, false, { tr: 'brass' });
  bar.cyl('#2b2622', 84.4, 0, 0, 11, 1.2, 0, 0, 0, Math.PI / 2, undefined, { tr: 'plain' });
  const pivot = new THREE.Group(), inner = new THREE.Group();
  pivot.position.set(X(c.x), Y(q.y - 52), 0);
  pivot.add(inner);
  inner.add(bar.buildGroup());
  content.add(pivot);
  return { key, batches: [b], dyn: [{ role: 'cannon', key, name: c.n, node: pivot, inner, home: c.aim }], bounds: b.bounds };
}
void look;
