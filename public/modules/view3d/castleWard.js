// THE CASTLE IN THE CAMERA FRAME (LOOP R2 / CASTLE.md): what is NOT on the strip. The castle's axis is the centre of the ring, a ring's radius behind the ship, so these stand in the camera frame
// (ringBend.js RB.axis(); materials with RING_SKIP: the bend leaves them alone):
//   * the ISLAND: a floating town of rock under the whole castle (a stepped cliff, a grass top with a ring road and a paved plaza, a few houses and trees, a river to each of two stepped WATERFALLS);
//     its rim lies INSET px inside the strip, so the curtain wall and the platforms stand on it;
//   * the WARD: 4 (fortress) or 3 (citadel) towers of different heights with slate or tile roofs, machicolated galleries, hanging banners and braziers, each joined to the gatehouse it faces by a rope bridge; in the
//     ring's own frame, so the group turns by -RB.thc about the axis and the towers slide past each other as the ship circles;
//   * the aether shards (citadel): floating glowing crystals;
//   * the KEEP: slim, set back behind the axis, and the CROWN on top of it (its own group: the lantern, the gold crown and the great banner), ready for D3's fall.
// All of it is rigid and built once per map. Nothing here moves on a sine; the waterfalls are three baked frames shown on 8 fps keys.
import { THREE, Batch, look, glow, G } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tcyl, cone, diamond, stripGeo, fanGeo, flagPoses, mergeFlags, disposeFlagPoses, skipify, buildBatch, SKIP, rng, V3, PI, TAU, clamp } from './castleKit.js';
import { drumTower, hanging } from './castleStrip.js';

const lumpAt = (ang, seed) => 0.5 + 0.3 * Math.sin(ang * 3 + seed) + 0.13 * Math.sin(ang * 7 + seed * 1.7) + 0.07 * Math.sin(ang * 13 + seed * 2.3); // (0..1, a fixed ragged outline round the ring: geometry, not motion)
const mixHex = (a, b, k) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), clamp(k, 0, 1)).getHexString();

// ---- the island's profile (shared with the waterfalls) ------------------------------------------------------------------------------------------------------------------------------
export function islandProfile(ring, K) {
  const I = K.ISLAND || {}, R = ring.R, n = Math.max(3, I.TIERS || 7), top = R - (I.INSET || 190), total = (I.DEPTH || 0.62) * R;
  const w = [0.16, 0.17, 0.17, 0.16, 0.14, 0.11, 0.09, 0.08, 0.07].slice(0, n), sum = w.reduce((a, b) => a + b, 0);
  const ys = [0]; // (depths below the platforms' top, positive down)
  for (let j = 0; j < n; j++) ys.push(ys[j] + (w[j] / sum) * total);
  const N = clamp(Math.round(R / 100), 32, 56);
  const hash = (j, i) => { let h = Math.imul(j + 1, 374761393) ^ Math.imul(i + 7, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const base = (j, ang) => { const f = j / n, shave = (30 + 170 * f) * lumpAt(ang, 1.3 + j * 0.7), taper = 0.62 * Math.pow(f, 1.2); return Math.max(R * 0.08, (top - shave) * (1 - taper)); };
  const vert = (j, i) => base(j, i * TAU / N) * (1 + (hash(j, i) - 0.5) * 0.16 * (j / n)); // (the rim's corners: a ragged outline, fixed by a hash; the top rim stays clean)
  const rim = (j, ang) => { const u = (((ang / TAU) % 1) + 1) % 1 * N, i0 = Math.floor(u), fr = u - i0; return vert(j, i0 % N) * (1 - fr) + vert(j, (i0 + 1) % N) * fr; };
  return { n, N, ys, rim, vert, R, top, total };
}

// ---- the ward batch: island + ward towers + bridges + houses + trees -------------------------------------------------------------------------------------------------------------------------
// -> { group, glows: [{ x, y, z, kind }], towers: [{ x, z, r, h, face }], tris }
export function buildWard(ring, A, K, base0) {
  const B = new Batch(), R = ring.R, I = K.ISLAND || {}, F = K.FACE || {}, Dp = F.DEPTH || 620;
  const prof = islandProfile(ring, K), N = prof.N, rnd = rng(Math.round(R) + (ring.faces || []).length);
  const glows = [], towers = [];
  const out = { glows, towers };
  // -- the cliff: tiers of a vertical band and a ledge, down to a point
  const rimPts = (j, y) => Array.from({ length: N }, (_, i) => { const ang = i * TAU / N, r = prof.vert(j, i); return [Math.sin(ang) * r, base0 - y, Math.cos(ang) * r]; });
  const radial = (x, y, z) => { const l = Math.hypot(x, z) || 1; return [x / l, 0.08, z / l]; };
  for (let j = 0; j < prof.n; j++) {
    const col = A.rock[j % A.rock.length], a = rimPts(j, prof.ys[j]), b = rimPts(j, prof.ys[j + 1]);
    B.geo(col, stripGeo(a, b, radial), null, 14); // the cliff face
    const c = rimPts(j + 1, prof.ys[j + 1]);
    B.geo(j < 2 ? mixHex(A.top, A.rock[0], 0.45) : mixHex(A.rock[0], '#ffffff', 0.12), stripGeo(b, c, () => [0, 1, 0]), null, 10); // the ledge (grassy near the top)
  }
  const last = rimPts(prof.n, prof.ys[prof.n]);
  B.geo(A.rock[A.rock.length - 1], fanGeo([0, base0 - prof.ys[prof.n] - R * 0.3, 0], last, -1), null, 12); // the point under the island
  B.geo(A.top, fanGeo([0, base0, 0], rimPts(0, 0), 1), null, 0); // the top
  // -- the top: ring road, lawn, plaza, roads to the gatehouses
  const roadR = prof.top - 280, y0 = base0;
  tcyl(B, A.road, 0, y0 + 3, 0, roadR, roadR, 5, 32, 0);
  tcyl(B, A.top, 0, y0 + 8, 0, roadR - 150, roadR - 150, 5, 32, 0);
  const plazaR = R * 0.64;
  tcyl(B, A.trim, 0, y0 + 14, 0, plazaR + 22, plazaR + 22, 8, 32, 0);
  tcyl(B, A.paving, 0, y0 + 19, 0, plazaR, plazaR, 8, 32, 0);
  // the plaza's rings and its medallion (the Ember Pact's flame in gold and oxblood)
  tcyl(B, A.road, 0, y0 + 24, 0, plazaR * 0.8, plazaR * 0.8, 6, 32, 0);
  tcyl(B, A.paving, 0, y0 + 28, 0, plazaR * 0.76, plazaR * 0.76, 6, 32, 0);
  tcyl(B, A.road, 0, y0 + 32, 0, plazaR * 0.34, plazaR * 0.34, 6, 32, 0);
  tcyl(B, A.paving, 0, y0 + 36, 0, plazaR * 0.3, plazaR * 0.3, 6, 32, 0);
  tcyl(B, A.gold, 0, y0 + 40, 0, plazaR * 0.17, plazaR * 0.17, 6, 28, 0);
  tcyl(B, A.banner, 0, y0 + 44, 0, plazaR * 0.14, plazaR * 0.14, 6, 28, 0);
  const faces = ring.faces || [];
  const faceAng = (f) => (f.x - ring.xRing) / R;
  for (const f of faces) { // a road from each gate to the plaza
    const a = faceAng(f), r0 = plazaR * 0.9, r1 = R - Dp + 40, len = r1 - r0, mid = (r0 + r1) / 2;
    B.box(A.road, Math.sin(a) * mid, y0 + 10, Math.cos(a) * mid, 150, 5, len, 0, 0, a, 0);
  }
  // -- the ward towers
  const specs = (K.WARD && K.WARD[ring.variant]) || [];
  const keepOff = 0; void keepOff;
  for (const sp of specs) {
    const f = sp.face != null ? faces[sp.face] : null;
    const a = f ? faceAng(f) : (sp.a || 0) * PI, rho = (sp.r || 0.45) * R, cx = Math.sin(a) * rho, cz = Math.cos(a) * rho, r = sp.rad || 230, h = Math.max(400, sp.h || 1600), fy = y0 + 22;
    tcyl(B, A.trim, cx, fy + 14, cz, r * 1.55, r * 1.65, 28, 14, 6);
    tcyl(B, A.shade, cx, fy + 50, cz, r * 1.38, r * 1.5, 44, 14, 5);
    const rh = sp.roof === 'spire' ? r * 3.6 : sp.roof === 'crown' ? 60 : r * 1.9, hw = Math.max(300, h - 82 - 182 - rh); // (h = the height of the apex above the platforms)
    const top = drumTower(B, A, cx, fy + 60, cz, r, hw, { roof: sp.roof || 'cone', seg: 12, ow: 9, all: 5 });
    B.box(A.glass, cx + Math.sin(a) * r * 0.98, fy + 150, cz + Math.cos(a) * r * 0.98, 70, 120, 12, 0, 0, a, 0); // the door, toward the gate it faces
    for (const s of [-1, 1]) { const ba = a + s * 1.6 + 0.3; hanging(B, A, cx + Math.sin(ba) * (r + 6), fy + 60 + hw - 6, cz + Math.cos(ba) * (r + 6), 74, 330, ba); }
    for (const s of [-1, 1]) { // braziers beside the door
      const ba = a + s * 0.62, bx = cx + Math.sin(ba) * r * 1.42, bz = cz + Math.cos(ba) * r * 1.42;
      tcyl(B, A.iron, bx, fy + 96, bz, 32, 20, 26, 8, 2.5);
      for (let q = 0; q < 3; q++) { const aa = q * TAU / 3 + 0.4; B.rod(A.iron, V3(bx + Math.sin(aa) * 16, fy + 86, bz + Math.cos(aa) * 16), V3(bx + Math.sin(aa) * 32, fy + 28, bz + Math.cos(aa) * 32), 3, 0); }
      glows.push({ x: bx, y: fy + 126, z: bz, kind: 'flame', s: 22, k: sp.face != null ? sp.face + s : 0 });
    }
    towers.push({ x: cx, z: cz, r, h, face: sp.face, top });
    // the bridge to the gatehouse it faces: a rope bridge (planks and two hand ropes, sagging a little), ending in the gate block's back door
    if (f) {
      const s0 = rho + r * 1.25, s1 = R - Dp - 20, NS = 8, ux = Math.sin(a), uz = Math.cos(a), px = Math.cos(a), pz = -Math.sin(a), deck = base0 + 316 - 8, sag = 38;
      const P = (k, off = 0, up = 0) => { const u = k / NS, s = s0 + (s1 - s0) * u, yy = deck - sag * 4 * u * (1 - u) + up; return V3(ux * s + px * off, yy, uz * s + pz * off); };
      for (let k = 0; k < NS; k++) {
        const m = P(k + 0.5), len = (s1 - s0) / NS;
        B.box(A.wood, m.x, m.y, m.z, 104, 12, len + 4, 2, 0, a, 0);
        if (k % 2 === 0) B.box(A.woodDark, m.x, m.y - 9, m.z, 116, 8, 14, 0, 0, a, 0);
      }
      for (const off of [-52, 52]) {
        for (let k = 0; k < NS; k += 2) B.rod(A.woodDark, P(k, off, 78), P(k + 2, off, 78), 3.2, 0);
        for (const k of [0, 4, 8]) B.rod(A.woodDark, P(k, off, 0), P(k, off, 110), 5, 1);
      }
      B.box(A.glass, cx + Math.sin(a) * r * 0.98, base0 + 316 + 10, cz + Math.cos(a) * r * 0.98, 84, 150, 12, 0, 0, a, 0); // (a door on the tower where the bridge starts)
    }
  }
  // -- houses and trees between the road and the plaza (a town)
  const nHouse = clamp(Math.round(R / 190), 10, 24);
  const clearOf = (x, z, d) => towers.every((tw) => Math.hypot(tw.x - x, tw.z - z) > tw.r * 1.9 + d) && faces.every((f) => { const a = faceAng(f), along = x * Math.sin(a) + z * Math.cos(a), across = Math.abs(x * Math.cos(a) - z * Math.sin(a)); return !(along > 0 && across < 150 + d); });
  for (let k = 0, placed = 0; k < nHouse * 4 && placed < nHouse; k++) {
    const ang = rnd() * TAU, rr = plazaR + 160 + rnd() * Math.max(80, roadR - 260 - plazaR - 160), x = Math.sin(ang) * rr, z = Math.cos(ang) * rr;
    if (!clearOf(x, z, 80)) continue;
    placed++;
    const w = 90 + rnd() * 70, d = 80 + rnd() * 60, hh = 60 + rnd() * 50, rot = ang + PI / 2 + (rnd() - 0.5) * 0.4, tone = rnd() < 0.5 ? A.stone : A.shade;
    B.box(tone, x, y0 + 10 + hh / 2, z, w, hh, d, 3, 0, rot, 0);
    cone(B, rnd() < 0.5 ? A.roof : A.roofDark, x, y0 + 10 + hh + w * 0.2, z, Math.max(w, d) * 0.72, w * 0.42, 4, 3, 0, rot + PI / 4, 0);
  }
  for (let k = 0, placed = 0; k < 90 && placed < nHouse * 1.6; k++) {
    const ang = rnd() * TAU, rr = roadR - 140 - rnd() * 260, x = Math.sin(ang) * rr, z = Math.cos(ang) * rr;
    if (!clearOf(x, z, 40)) continue;
    placed++;
    const s = 0.8 + rnd() * 0.7;
    cone(B, mixHex(A.top, '#2f5a3a', 0.45), x, y0 + 10 + 58 * s, z, 30 * s, 100 * s, 7, 2);
  }
  // -- aether shards (the citadel): glowing crystals floating over the island
  if (ring.variant === 'citadel') {
    for (let k = 0; k < 16; k++) {
      const ang = rnd() * TAU, rr = R * (0.12 + rnd() * 0.55), x = Math.sin(ang) * rr, z = Math.cos(ang) * rr, yy = base0 + 700 + rnd() * 1900, s = 0.7 + rnd() * 0.9;
      glows.push({ x, y: yy, z, kind: 'shard', s: 38 * s, h: 118 * s, spin: rnd() * TAU, k });
    }
  }
  const group = skipify(buildBatch(B, { cast: false, receive: false }), 'castleWard');
  out.group = group; out.tris = B.tris;
  return out;
}

// ---- the waterfalls: three baked frames in one mesh -----------------------------------------------------------------------------------------------------------------------------------
// Two stepped cascades down the island's cliff at the angles in config ISLAND.FALLS (x pi), a river on the top leading to each. The frames differ by a third of a stripe's period: shown on 8 fps keys the water runs down at a constant speed.
export function fallAngles(ring, K, spires) { // (x pi) the configured gap angles, nudged off any rock spire and away from the platforms: the cliff must show
  const I = K.ISLAND || {}, base = ((I.FALLS || {})[ring.variant]) || [0.5, 1.5], C = ring.C, R = ring.R;
  const clear = (ang) => {
    const x = ring.xRing + ang * R;
    const d = (a, b) => { const q = Math.abs(a - b) % C; return Math.min(q, C - q); };
    return (spires || []).every((sp) => d(sp.x, x) > 800) && (ring.faces || []).every((f) => d(f.x, x) > 2100);
  };
  return base.map((a0) => { for (const off of [0, 0.06, -0.06, 0.12, -0.12, 0.2, -0.2, 0.3, -0.3]) { const a = (a0 + off) * PI; if (clear(a)) return a0 + off; } return a0; });
}
export function buildFalls(ring, A, K, base0, parent, spires) {
  const prof = islandProfile(ring, K), list = fallAngles(ring, K, spires);
  const P = 130, Wd = 150;
  const parts = [], ranges = [];
  let start = 0;
  for (let k = 0; k < 3; k++) {
    const B = new Batch();
    for (const fa of list) {
      const beta = fa * PI, ux = Math.sin(beta), uz = Math.cos(beta);
      const put = (col, rad, y, w, h, d, dRad = 0) => B.box(col, ux * (rad + dRad), base0 + y, uz * (rad + dRad), w, h, d, 0, 0, beta, 0);
      const r0 = prof.rim(0, beta);
      B.box(A.water, ux * (r0 - 520), base0 + 14, uz * (r0 - 520), 120, 6, 1040 - 40, 0, 0, beta, 0); // the river across the lawn
      for (let j = 0; j < prof.n; j++) {
        const rho = prof.rim(j, beta), y0 = -prof.ys[j], y1 = -prof.ys[j + 1], hgt = y0 - y1;
        put(A.waterDark, rho + 4, (y0 + y1) / 2, Wd, hgt, 8); // the sheet
        for (let s = -P + (k * P) / 3; s < hgt; s += P) { // light stripes sliding down
          const sTop = Math.max(0, s), sBot = Math.min(hgt, s + P * 0.55);
          if (sBot - sTop > 6) put(A.water, rho + 8, y0 - (sTop + sBot) / 2, Wd * 0.78, sBot - sTop, 5);
        }
        if (j + 1 < prof.n) { // the ledge's pool and its foam
          const rho2 = prof.rim(j + 1, beta), mid = (rho + rho2) / 2;
          put(A.water, mid, y1 + 4, Wd * 0.9, 6, Math.abs(rho - rho2) + 30);
          for (let q = 0; q < 3; q++) put('#ffffff', rho2 - 6 + ((q + k) % 3) * 14, y1 + 12 + ((q + k) % 3) * 6, 34 + q * 10, 14, 18);
        }
      }
      // spray where the last drop leaves the island
      const rl = prof.rim(prof.n, beta);
      for (let q = 0; q < 3; q++) put('#ffffff', rl + 10, -prof.ys[prof.n] - 30 - ((q + k) % 3) * 70, 60 + q * 20, 50, 24);
    }
    for (const p of B.parts) { parts.push(p); }
    const count = B.parts.reduce((a, p) => a + p.attributes.position.count, 0);
    ranges.push([start, count]); start += count;
  }
  if (!parts.length) return null;
  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.defines = { RING_SKIP: '' };
  const mesh = new THREE.Mesh(geometry, m);
  mesh.frustumCulled = false; mesh.name = 'castleFalls';
  geometry.setDrawRange(ranges[0][0], ranges[0][1]);
  parent.add(mesh);
  return { mesh, ranges, material: m, angles: list };
}
export const poseFalls = (falls, key) => { if (!falls) return; const r = falls.ranges[(((Math.floor(key) % 3) + 3) % 3)]; if (r) falls.mesh.geometry.setDrawRange(r[0], r[1]); };

// ---- the keep and its crown --------------------------------------------------------------------------------------------------------------------------------------------------------------
export const keepRadius = (ring, K) => { const k = K.KEEP || {}; return Math.max(k.MIN_RADIUS || 280, (k.RADIUS || 0.09) * ring.R); };
export const keepHeight = (ring, K) => { const k = K.KEEP || {}; return (k.UP && k.UP[ring.variant]) || 2400; };
// -> { group, seatY, glowMesh... }. The group is built about the keep's own axis (x = z = 0); y is the game's world y (the platforms' top is base0). The crown seat: y = base0 + keepHeight.
export function buildKeep(ring, A, K, base0) {
  const rk = keepRadius(ring, K), H = keepHeight(ring, K), y0 = base0 + 24, B = new Batch(), ow = 11, seg = 16, v = ring.variant;
  const Y = (q) => y0 + 110 + (H - 110) * q;
  tcyl(B, A.trim, 0, y0 + 14, 0, rk * 1.7, rk * 1.8, 28, seg, ow);
  tcyl(B, A.shade, 0, y0 + 70, 0, rk * 1.3, rk * 1.5, 100, seg, ow);
  const slim = v === 'citadel' ? 0.9 : 1;
  tcyl(B, A.stone, 0, Y(0.25), 0, rk * 0.98 * slim, rk * 1.16 * slim, (H - 110) * 0.5, seg, ow); // the lower body
  tcyl(B, A.trim, 0, Y(0.5), 0, rk * 1.06 * slim, rk * 1.06 * slim, 38, seg, ow * 0.6);
  tcyl(B, A.stone, 0, Y(0.65), 0, rk * 0.84 * slim, rk * 0.97 * slim, (H - 110) * 0.3, seg, ow); // the upper body
  tcyl(B, A.trim, 0, Y(0.8), 0, rk * 0.92 * slim, rk * 0.92 * slim, 34, seg, ow * 0.6);
  tcyl(B, A.stone, 0, Y(0.865), 0, rk * 0.84 * slim, rk * 0.84 * slim, (H - 110) * 0.1, seg, ow);
  // slits: five columns, three rows, all round
  for (let k = 0; k < 5; k++) for (const [q, rad] of [[0.2, 1.1], [0.38, 1.03], [0.62, 0.93], [0.74, 0.88]]) {
    const ang = k * TAU / 5 + (q > 0.5 ? 0.31 : 0);
    B.box(A.glass, Math.sin(ang) * rk * rad * slim, Y(q), Math.cos(ang) * rk * rad * slim, 20, 96, 12, 0, 0, ang, 0);
  }
  hanging(B, A, 0, Y(0.77), rk * 0.9 * slim + 8, Math.min(120, rk * 0.34), 520); // the great hanging banner, toward the camera
  // the gallery and the top storey
  const gy = Y(0.865) + (H - 110) * 0.05;
  let seat = gy + 194, topR = rk * slim * 1.3 * 1.12;
  if (v === 'tower') { // THE TOWER: a timber hoarding round the top (the lone tower's wooden gallery)
    tcyl(B, A.wood, 0, gy + 40, 0, rk * 1.55, rk * 1.18, 110, 14, ow);
    for (let k = 0; k < 14; k++) { const ang = (k + 0.5) * TAU / 14; B.box(A.woodDark, Math.sin(ang) * rk * 1.5, gy + 44, Math.cos(ang) * rk * 1.5, 12, 112, 12, 1.5, 0, ang, 0); }
    for (let k = 0; k < 7; k++) { const ang = (k + 0.25) * TAU / 7; B.box(A.glass, Math.sin(ang) * rk * 1.45, gy + 44, Math.cos(ang) * rk * 1.45, 36, 30, 10, 0, 0, ang, 0); }
    tcyl(B, A.woodDark, 0, gy + 112, 0, rk * 1.62, rk * 1.62, 22, 14, ow * 0.6);
    tcyl(B, A.stone, 0, gy + 168, 0, rk * 0.98, rk * 1.1, 90, seg, ow);
    gy2(B, A, rk, gy + 213, ow, seg, 0.98); seat = gy + 225; topR = rk * 0.98 * 1.12;
  } else {
    tcyl(B, A.trim, 0, gy + 35, 0, rk * 1.3 * slim, rk * 0.9 * slim, 70, seg, ow); // the machicolated collar
    for (let k = 0; k < 10; k++) { const ang = (k + 0.5) * TAU / 10; B.box(A.glass, Math.sin(ang) * rk * 1.2 * slim, gy + 30, Math.cos(ang) * rk * 1.2 * slim, 24, 34, 8, 0, 0, ang, 0); }
    tcyl(B, A.stone, 0, gy + 70 + 50, 0, rk * 1.3 * slim, rk * 1.3 * slim, 100, seg, ow);
    for (let k = 0; k < 6; k++) { const ang = (k + 0.25) * TAU / 6; B.box(A.glass, Math.sin(ang) * rk * 1.31 * slim, gy + 125, Math.cos(ang) * rk * 1.31 * slim, 30, 52, 10, 0, 0, ang, 0); }
    gy2(B, A, rk * slim, gy + 170 + 12, ow, seg, 1.3);
  }
  const group = skipify(buildBatch(B, { cast: false, receive: false }), 'castleKeep');
  group.userData.seatY = seat; group.userData.radius = rk;
  return { group, seatY: seat, rk, topR, tris: B.tris };
}
// (the eaves ring the crown stands on)
function gy2(B, A, rk, y, ow, seg, k) { tcyl(B, A.roofDark, 0, y, 0, rk * k * 1.12, rk * k * 1.12, 24, seg, ow * 0.6); }

// The CROWN: its own group, origin at the seat (local y 0 = the top of the keep's eaves), so D3 can drop it. Gold band and prongs, the lantern with a glowing core, a spire and the great banner (three baked poses).
// -> { group, flag: { mesh, ranges, phase }, lantern: Mesh, tris }
const lanternMat = (() => { const m = new THREE.MeshBasicMaterial({ color: glow('#ffc65a', 2.1), toneMapped: false }); m.defines = { RING_SKIP: '' }; return m; })();
export function buildCrown(ring, A, K, rk, topR) {
  const B = new Batch(), ow = 7, tall = ring.variant === 'citadel';
  const band = Math.max(rk * 0.9, (topR || rk * 1.4) * 0.97);
  tcyl(B, A.gold, 0, 24, 0, band, band * 1.04, 48, 16, ow);
  tcyl(B, A.trim, 0, 4, 0, band * 1.05, band * 1.05, 8, 16, 0); // (a thin dark foot so the gold does not blend into the eaves)
  const np = 8, prongH = 240; // eight tall prongs, each with a pearl
  for (let k = 0; k < np; k++) {
    const ang = (k + 0.5) * TAU / np, px = Math.sin(ang) * band * 0.9, pz = Math.cos(ang) * band * 0.9;
    cone(B, A.gold, px, 48 + prongH / 2, pz, 34, prongH, 5, 3.5, Math.cos(ang) * 0.1, 0, -Math.sin(ang) * 0.1);
    diamond(B, '#f4efe0', px * 1.04, 48 + prongH + 14, pz * 1.04, 13, 16, 13, 1.4);
  }
  const sh = tall ? 230 : 150, sy = 48 + prongH - 20; // the spire that rises from the middle of the crown, and the pole of the great banner
  cone(B, A.gold, 0, sy + sh / 2, 0, tall ? 52 : 40, sh, 8, ow);
  const topY = sy + sh;
  B.rod(A.iron, V3(0, topY - 6, 0), V3(0, topY + 120, 0), 4, 1.4);
  diamond(B, A.gold, 0, topY + 132, 0, 11, 17, 11, 1.6);
  const group = skipify(buildBatch(B, { cast: false, receive: false }), 'castleCrown');
  // the lantern's glow
  const lantern = new THREE.Mesh(G.sphereLo, lanternMat);
  lantern.position.set(0, 140, 0); lantern.scale.set(band * 0.46, band * 0.34, band * 0.46);
  lantern.frustumCulled = false; lantern.renderOrder = 2; lantern.name = 'crownLantern';
  group.add(lantern);
  // the great banner (Ember Pact: oxblood, gold borders, a great flame)
  const poses = flagPoses(5, 44, 150, () => [A.gold, A.banner, A.banner, A.gold], 5, (i) => [1, 1, 0.94, 0.84, 0.7][i], (i, b, hh) => {
    if (i === 1 || i === 2) { cone(b, A.flame, 22, -hh * 0.5, 3.4, 24, 92, 5, 0); cone(b, '#ffe08a', 22, -hh * 0.56, 4.6, 11, 48, 5, 0); }
  });
  const merged = mergeFlags([{ poses, at: new THREE.Matrix4().makeTranslation(2, topY + 112, 0) }]);
  disposeFlagPoses(poses);
  let flag = null;
  if (merged) {
    const mesh = new THREE.Mesh(merged.geometry, look.toon ? SKIP.toon : SKIP.plain);
    mesh.userData.toon = SKIP.toon; mesh.userData.plain = SKIP.plain; mesh.frustumCulled = false; mesh.name = 'crownBanner';
    merged.geometry.setDrawRange(merged.ranges[0][0], merged.ranges[0][1]);
    group.add(mesh);
    flag = { mesh, ranges: merged.ranges, phase: 0 };
  }
  return { group, flag, lantern, tris: B.tris, height: topY + 150 };
}
