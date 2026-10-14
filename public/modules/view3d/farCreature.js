// LOOP.md R5: CREATURE DEPTH. Before a lair fight the lair's giant is seen circling far away in the background - the Cinder Drake over the Ember Forge, the Thunderbird in the storm, the Kraken's
// arching tentacles and glowing eyes at the sea's edge - as a flat silhouette at real depth, wheeling round the lair on a big ellipse in the depth plane (so it swings from behind to nearer and back). It is only
// a promise of what is coming: when the real creature spawns (state.creature) this one is gone; it is never drawn once the lair is beaten. ONE draw call (poses of one mesh, the flap or the sway picked by a draw range).
// Stepped: the circuit is a TABLE of 8 fps positions (a position for each key, worked out once), the wings flap on held poses, nothing is a sine of the time. Tier Low: none.
// The silhouette uses farKit.js (flat tones, hazed by its depth, the tint of the hour); the eyes and the lightning on the Thunderbird's wings are lamps, so they glow in the dark.
import { THREE, look } from './style.js';
import { config } from '../../config.js';
import { Far, farMaterial, syncFar } from './farKit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI, TAU = Math.PI * 2;
const D3 = () => (config.DEPTH3D && config.DEPTH3D.CREATURE) || {};

// ---- the three silhouettes (local units, +x forward, +y up, +z toward the camera when she flies left to right) ---------------------------------------------------------------------------------------------
const WING = [[-70, 0], [60, 0], [150, 70], [200, 200], [250, 330], [320, 470], [236, 392], [208, 330], [150, 322], [130, 244], [60, 236], [60, 150], [-30, 110], [-90, 28]]; // a bat's wing: spanwise +y, scalloped back edge
const BIRDWING = [[-80, 0], [90, 0], [200, 80], [330, 170], [430, 270], [490, 330], [470, 300], [520, 300], [430, 230], [470, 200], [370, 160], [400, 120], [300, 90], [250, 40], [-30, 60]]; // a bird's: feather fingers at the tip
const FLAP = [1.0, 0.42, -0.5]; // dihedral of the wings in the three poses: up, level-ish, down

function wings(F, col, poly, delta, thick) {
  const a = PI / 2 - delta;
  F.poly(col, poly, thick, 0, 6, 0, a, 0, 0); // toward the camera
  F.poly(col, poly, thick, 0, 6, 0, -a, 0, 0); // away
}

function drakePose(F, p) {
  const body = '#a05c4c', dark = '#6e3a38', belly = '#d0a070';
  F.sph(body, 0, 0, 0, 170, 62, 66, 10);
  F.sph(belly, 10, -22, 0, 150, 40, 54, 8);
  F.rod(body, [130, 20, 0], [250, 90, 0], 52, 34, 7); // neck
  F.cone(body, 318, 112, 0, 40, 120, 6, 0, 0, -PI / 2 + 0.2); // head
  F.cone(dark, 268, 156, 26, 12, 70, 5, 0, 0, 0.5); F.cone(dark, 268, 156, -26, 12, 70, 5, 0, 0, 0.5);
  F.sph('#ffb24a', 330, 128, 30, 9, 9, 9, 5, 0, 0, 0, 3.0); F.sph('#ffb24a', 330, 128, -30, 9, 9, 9, 5, 0, 0, 0, 3.0);
  let px = -150, py = -6, r = 48; // the tail: a drooping chain
  for (let i = 0; i < 6; i++) { const nx = px - 100, ny = py - 8 - i * 4, nr = Math.max(8, r * 0.78); F.rod(dark, [px, py, 0], [nx, ny, 0], r, nr, 6); px = nx; py = ny; r = nr; }
  F.cone(dark, px - 40, py - 6, 0, 22, 90, 4, 0, 0, PI / 2);
  wings(F, dark, WING, FLAP[p], 10);
  F.rod(dark, [20, 40, 0], [180, 40 + 230 * Math.sin(FLAP[p]), 230 * Math.cos(FLAP[p])], 12, 8, 5); F.rod(dark, [20, 40, 0], [180, 40 + 230 * Math.sin(FLAP[p]), -230 * Math.cos(FLAP[p])], 12, 8, 5); // the wing arms
}
function birdPose(F, p) {
  const body = '#6a84bc', lite = '#a6bcec', gold = '#f0c860';
  F.sph(body, 0, 0, 0, 200, 76, 76, 10);
  F.sph(lite, 30, -26, 0, 150, 44, 62, 8);
  F.sph(body, 220, 50, 0, 62, 56, 56, 9); // the head
  F.cone('#e8b04a', 292, 44, 0, 20, 78, 5, 0, 0, -PI / 2 - 0.2); // the beak
  F.cone(gold, 200, 110, 0, 20, 100, 4, 0, 0, 0.5); F.cone(gold, 176, 110, 0, 16, 84, 4, 0, 0, 0.7); // the crest
  F.sph('#bfe2ff', 244, 66, 46, 11, 11, 11, 5, 0, 0, 0, 3.0); F.sph('#bfe2ff', 244, 66, -46, 11, 11, 11, 5, 0, 0, 0, 3.0);
  F.poly(body, [[-170, 20], [-200, 0], [-480, 100], [-520, 20], [-500, -50], [-190, -20]], 14, 0, 0, 0, 0, 0, 0); // the tail fan
  F.poly(gold, [[-470, 70], [-520, 20], [-500, -50], [-470, -10]], 16, 0, 0, 0, 0, 0, 0);
  wings(F, lite, BIRDWING, FLAP[p], 14);
  for (const s of [1, -1]) F.sph('#bfe2ff', 330, 6 + 500 * Math.sin(FLAP[p]), s * 500 * Math.cos(FLAP[p]), 24, 24, 24, 5, 0, 0, 0, 2.6); // the lightning at the wing tips
}
function krakenPose(F, p) {
  const skin = '#6b4a82', dark = '#4c3462', belly = '#a384ba';
  F.sph(skin, 0, 150, 0, 300, 400, 270, 12); // the mantle
  F.sph(dark, -70, 240, 0, 250, 330, 230, 10);
  F.cone(dark, -150, 520, 0, 150, 340, 6, 0, 0, 0.35); // the fin on top
  F.sph('#d8ff7a', 170, 160, 200, 52, 52, 34, 6, 0, 0, 0, 3.0); F.sph('#d8ff7a', 170, 160, -200, 52, 52, 34, 6, 0, 0, 0, 3.0); // the eyes
  for (let k = 0; k < 7; k++) { // arms arching up out of the water round the mantle, tips curling (two held poses sway them a little)
    const phi = (k / 7) * TAU + 0.3, sway = p ? 1 : -1;
    let prev = [Math.cos(phi) * 280, -40, Math.sin(phi) * 280], r = 82;
    for (let j = 1; j <= 5; j++) {
      const rr = 280 + 100 * j + 40 * sway * (j > 3 ? 1 : 0), h = 190 * j - 20 * j * j;
      const next = [Math.cos(phi + 0.14 * j * sway) * rr, h - 40, Math.sin(phi + 0.14 * j * sway) * rr], nr = Math.max(14, r * 0.74);
      F.rod(k % 2 ? skin : dark, prev, next, r, nr, 7); prev = next; r = nr;
    }
    F.sph(belly, prev[0], prev[1], prev[2], 18, 18, 18, 5);
  }
}
const MODELS = { drake: { poses: 3, build: drakePose, y: 300 }, thunderbird: { poses: 3, build: birdPose, y: 460 }, kraken: { poses: 2, build: krakenPose, y: 0 } };

export function createFarCreature(scene) {
  const C = { stats: { kind: '', calls: 0, at: 0 }, tierOn: true };
  const mat = farMaterial({ anchored: false });
  mat.transparent = false;
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = -15.5; mesh.name = 'farCreature';
  scene.add(mesh);
  const built = {}; // kind -> { geo, ranges }
  let env = '', cave = false;
  const buildKind = (kind) => {
    const M = MODELS[kind], parts = [], ranges = [];
    let at = 0;
    for (let p = 0; p < M.poses; p++) { const F = new Far(); M.build(F, p); const g = F.build(); parts.push(g); const n = g.attributes.position.count; ranges.push([at, n]); at += n; }
    return (built[kind] = { geo: mergeGeometries(parts, false), ranges });
  };
  // the circuit: a position and a heading for each of the orbit's keys (a table, worked out once)
  let table = null, tableKey = '';
  const orbit = (R) => {
    const n = Math.max(24, Math.round((D3().SECS || 26) * (D3().STEP || 8))), k = R.join('|') + '|' + n;
    if (k === tableKey) return table;
    tableKey = k;
    table = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * TAU, ca = Math.cos(a), sa = Math.sin(a), vx = -R[0] * sa, vz = R[1] * ca;
      return { x: R[0] * ca, z: R[1] * sa, yaw: Math.atan2(-vz, vx) };
    });
    return table;
  };
  C.setTier = (tier) => { const T = ((config.DEPTH3D || {}).TIERS || {})[tier && tier.name] || {}; C.tierOn = !!T.creature; };
  C.setEnv = (e, c) => { env = e; cave = !!c; };

  // ctx.creature = { kind: 'drake' | 'thunderbird' | 'kraken', x (the lair's map x), y (the 3D height the giant wheels at; 0 = the director's default) }
  C.update = (cam, target, vis, t, ctx, W) => {
    const c = ctx && ctx.creature, M = c && MODELS[c.kind];
    if (!(M && (config.DEPTH3D || {}).ENABLED !== false && look.depth && C.tierOn && !cave && W && W.lights && Number.isFinite(c.x))) { mesh.visible = false; C.stats.calls = 0; return; }
    let b = built[c.kind];
    if (!b) { try { b = buildKind(c.kind); } catch (e) { mesh.visible = false; MODELS[c.kind] = null; console.warn('view3d far creature off', e && e.message); return; } }
    if (mesh.userData.kind !== c.kind) { mesh.userData.kind = c.kind; mesh.geometry = b.geo; }
    const K = (D3().BY_KIND || {})[c.kind] || {}, tab = orbit([K.RX || 2300, K.RZ || 1500]), key = Math.floor(t * (D3().STEP || 8)), at = key % tab.length, o = tab[at];
    const z0 = K.Z || -4300, S = K.SCALE || 1.8;
    const y = Number.isFinite(c.y) ? c.y : M.y;
    mesh.position.set(c.x + o.x, y, z0 + o.z);
    mesh.rotation.set(0, c.kind === 'kraken' ? 0 : o.yaw, 0);
    mesh.scale.setScalar(S);
    const pose = c.kind === 'kraken' ? (key >> 3) & 1 : [0, 1, 2, 1][Math.floor(key / 3) % 4]; // (the wings: up, level, down, level, each held for three keys; the tentacles sway every second)
    const r = b.ranges[Math.min(pose, b.ranges.length - 1)];
    b.geo.setDrawRange(r[0], r[1]);
    syncFar(mat, cam, W, (config.DEPTH3D && config.DEPTH3D.LANDMARKS) || {}, 1);
    mesh.visible = true;
    C.stats.kind = c.kind; C.stats.calls = 1; C.stats.at = at;
  };
  C.dispose = () => { scene.remove(mesh); mat.dispose(); for (const k of Object.keys(built)) built[k].geo.dispose(); mesh.geometry.dispose(); };
  C.mesh = mesh;
  return C;
}
