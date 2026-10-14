// THE THUNDERBIRD'S FEATHERS (3D.md section 26): every long feather of the wings, the tail fan and the neck's hackle, in ONE mesh. A feather is a flat leaf (a base, a direction, a length and a width): a shaft
// down its middle (the two halves are tilted a little the other way, so the toon light picks them out in two steps), a pale or dark body that runs from its root to its end, a coloured band near the tip (gold on
// the long flight feathers) and a glowing point (the storm's charge, glow channel 3) on the very end. Behind every feather lies a slightly bigger dark leaf: its ink line, drawn in the same mesh, so a feather
// that lies over another one draws its own outline across it, and rows of feathers layer the way real plumage does (later slots are nearer the viewer by a few world units).
// Positions are rewritten each frame from what the caller gives (the simulation's joints, never a clock); colours only when a slot's look changes. Nothing here moves by itself: no wobble, no time.
// Slots are fixed: the caller gives each feather a slot number once and calls put(slot, ...) every frame (or hide(slot)).
import { THREE } from './style.js';
import { creatureToon, SWATCH } from './creatureKit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const T = [0, 0.24, 0.55, 0.76, 0.9, 0.97]; // where along the feather the rungs lie
const WD = [0.4, 0.9, 1.0, 0.96, 0.8, 0.46]; // the half width at each rung (a share of the feather's width): a rounded end
const NR = T.length, NB = NR - 1; // rungs, and the bands between them
const MAIN = NB * 8 + 6, INKV = NR * 2 + 1, PER = MAIN + INKV; // vertices of the leaf: NB bands x 2 halves x 4, the 2 tips x 3; the ink leaf's 2 per rung and the tip
const RIDGE = 5; // how far the shaft stands out of the leaf's plane (so the two halves catch the light differently)
const INK_Z = 1.5; // how far behind its feather the ink leaf lies (less than the step between two feathers: it draws over the one below)

export const FEATHER_VERTS = PER;

export function createFeatherMesh({ map, uniforms, P, slots, ow = 9 }) {
  const total = slots * PER;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2), glow = new Float32Array(total);
  for (let i = 0; i < total; i++) { uv[i * 2] = SWATCH[0]; uv[i * 2 + 1] = SWATCH[1]; nor[i * 3 + 2] = 1; }
  const idx = [];
  for (let f = 0; f < slots; f++) {
    const b = f * PER;
    for (let band = 0; band < NB; band++) {
      const L = b + (band * 2) * 4, R = L + 4; // [edge a, centre a, edge b, centre b]
      idx.push(L, L + 1, L + 3, L, L + 3, L + 2); // the left half: e_a c_a c_b / e_a c_b e_b
      idx.push(R + 1, R, R + 2, R + 1, R + 2, R + 3); // the right half: c_a e_a e_b / c_a e_b c_b
    }
    const tl = b + NB * 8, tr = tl + 3;
    idx.push(tl, tl + 1, tl + 2); // the left tip: e c tip
    idx.push(tr + 1, tr, tr + 2); // the right tip: c e tip
    const k = b + MAIN;
    for (let r = 0; r < NR - 1; r++) { const a = k + r * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); } // the ink leaf: L R R' / L R' L'
    idx.push(k + (NR - 1) * 2, k + (NR - 1) * 2 + 1, k + NR * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(idx);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const material = creatureToon(map, uniforms);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.toon = material;
  mesh.userData.shadowReceiver = false; // (the bird flies behind the ship's plane: it would wear a black cut-out of her bag's shadow)
  const C = (hex) => new THREE.Color(hex);
  const sets = {};
  for (const [k, v] of Object.entries(P.FEATHER)) sets[k] = { a: C(v.a), b: C(v.b), c: C(v.c), band: C(v.band), edge: C(v.edge), gl: v.gl || 0 };
  const ink = C(P.inkLeaf || '#10142a'), mid = new THREE.Color();
  const lookKey = new Array(slots).fill('');
  let dirty = false, colDirty = false;

  // colours of a slot: kind = a key of P.FEATHER, tint = [r, g, b] (the dim / flash / lit multiplier), tip = whether the very end glows
  function look(slot, kind, tint, tip = true) {
    const key = kind + '|' + tint[0].toFixed(3) + '|' + tint[1].toFixed(3) + '|' + tint[2].toFixed(3) + '|' + (tip ? 1 : 0);
    if (lookKey[slot] === key) return;
    lookKey[slot] = key;
    const S = sets[kind] || sets.flight, b = slot * PER;
    const set = (v, c, k, g) => { const o = (b + v) * 3; col[o] = c.r * k * tint[0]; col[o + 1] = c.g * k * tint[1]; col[o + 2] = c.b * k * tint[2]; glow[b + v] = g; };
    mid.copy(S.a).lerp(S.b, 0.6);
    const c1 = mid.clone(), c2 = S.b.clone().lerp(S.c, 0.7), gold2 = S.band.clone().multiplyScalar(0.88);
    // the colour at the start and the end of each band: root to middle, middle, middle to end, then the gold band (two shades)
    const bandCols = [[S.a, c1], [c1, S.b], [S.b, c2], [S.band, S.band], [gold2, gold2]];
    for (let band = 0; band < NB; band++) {
      const g = band >= 3 ? S.gl : 0; // (the gold band is lit by itself, glow channel 2: it stays gold in a dark sky)
      for (let h = 0; h < 2; h++) {
        const v0 = (band * 2 + h) * 4, cc = bandCols[band];
        set(v0, cc[0], 0.95, g); set(v0 + 1, cc[0], 1.1, g); set(v0 + 2, cc[1], 0.95, g); set(v0 + 3, cc[1], 1.1, g);
      }
    }
    for (let h = 0; h < 2; h++) { const v0 = NB * 8 + h * 3; set(v0, gold2, 0.95, S.gl); set(v0 + 1, gold2, 1.1, S.gl); set(v0 + 2, tip ? S.edge : gold2, 1, tip ? 3 : S.gl); }
    for (let v = 0; v < INKV; v++) set(MAIN + v, ink, 1, 0);
    colDirty = true;
  }

  const off = new Uint8Array(slots);
  const hide = (slot) => {
    if (off[slot]) return;
    pos.fill(0, slot * PER * 3, (slot + 1) * PER * 3);
    off[slot] = 1;
    dirty = true;
  };

  // o: { x, y, z (the base, 3D: y up), dx, dy (the unit direction along the feather), len, wid, cx, cy (the unit direction it bows toward), curve (its bow, a share of the length), ft (a small tilt, -1..1) }
  const px = new Float32Array(NR), py = new Float32Array(NR), qx = new Float32Array(NR), qy = new Float32Array(NR);
  function put(slot, o) {
    const len = o.len, wid = o.wid, curve = o.curve || 0, cx = o.cx || 0, cy = o.cy || 0, ft = o.ft || 0;
    if (!(len > 1) || !Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.dx) || !Number.isFinite(o.dy)) { hide(slot); return; }
    off[slot] = 0;
    const b = slot * PER, z = o.z, dx = o.dx, dy = o.dy;
    // the rung centres and their frames
    for (let r = 0; r < NR; r++) {
      const t = T[r], ax = dx * len + cx * (2 * curve * len * t), ay = dy * len + cy * (2 * curve * len * t), al = Math.hypot(ax, ay) || 1;
      px[r] = o.x + dx * len * t + cx * curve * len * t * t; py[r] = o.y + dy * len * t + cy * curve * len * t * t;
      qx[r] = -ay / al; qy[r] = ax / al; // the left-hand normal
    }
    const ex = o.x + dx * len + cx * curve * len, ey = o.y + dy * len + cy * curve * len, L = NR - 1;
    const tipx = ex - px[L], tipy = ey - py[L];
    const w = (v, x, y, zz) => { const k = (b + v) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = zz; };
    const nrm = (v, nx, ny, nz) => { const k = (b + v) * 3, l = Math.hypot(nx, ny, nz) || 1; nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l; };
    const tl = 0.5, fx = dx * ft * 0.32, fy = dy * ft * 0.32; // (the halves' tilt, and the whole feather's pitch along itself)
    const nL = [qx[2] * tl + fx, qy[2] * tl + fy, 1], nR = [-qx[2] * tl + fx, -qy[2] * tl + fy, 1];
    for (let band = 0; band < NB; band++) {
      const r0 = band, r1 = band + 1;
      for (let h = 0; h < 2; h++) {
        const s = h === 0 ? 1 : -1, v0 = (band * 2 + h) * 4, n = h === 0 ? nL : nR;
        const hw0 = wid * 0.5 * WD[r0], hw1 = wid * 0.5 * WD[r1];
        w(v0, px[r0] + qx[r0] * hw0 * s, py[r0] + qy[r0] * hw0 * s, z);
        w(v0 + 1, px[r0], py[r0], z + RIDGE);
        w(v0 + 2, px[r1] + qx[r1] * hw1 * s, py[r1] + qy[r1] * hw1 * s, z);
        w(v0 + 3, px[r1], py[r1], z + RIDGE);
        for (let i = 0; i < 4; i++) nrm(v0 + i, n[0], n[1], n[2]);
      }
    }
    for (let h = 0; h < 2; h++) {
      const s = h === 0 ? 1 : -1, v0 = NB * 8 + h * 3, n = h === 0 ? nL : nR, hw = wid * 0.5 * WD[L];
      w(v0, px[L] + qx[L] * hw * s, py[L] + qy[L] * hw * s, z);
      w(v0 + 1, px[L], py[L], z + RIDGE);
      w(v0 + 2, ex, ey, z + RIDGE * 0.6);
      for (let i = 0; i < 3; i++) nrm(v0 + i, n[0], n[1], n[2]);
    }
    // the ink leaf: a little bigger all round, behind
    for (let r = 0; r < NR; r++) {
      const hw = wid * 0.5 * WD[r] + ow, back = r === 0 ? -ow : 0, x = px[r] + dx * back, y = py[r] + dy * back;
      w(MAIN + r * 2, x + qx[r] * hw, y + qy[r] * hw, z - INK_Z);
      w(MAIN + r * 2 + 1, x - qx[r] * hw, y - qy[r] * hw, z - INK_Z);
      nrm(MAIN + r * 2, 0, 0, 1); nrm(MAIN + r * 2 + 1, 0, 0, 1);
    }
    const tl2 = Math.hypot(tipx, tipy) || 1;
    w(MAIN + NR * 2, ex + (tipx / tl2) * ow * 1.7, ey + (tipy / tl2) * ow * 1.7, z - INK_Z);
    nrm(MAIN + NR * 2, 0, 0, 1);
    dirty = true;
  }

  function flush() {
    if (dirty) { geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('normal').needsUpdate = true; dirty = false; }
    if (colDirty) { geometry.getAttribute('color').needsUpdate = true; geometry.getAttribute('aGlow').needsUpdate = true; colDirty = false; }
  }
  return { mesh, geometry, material, put, look, hide, flush, slots, tris: () => (slots * (NB * 4 + 2 + (NR - 1) * 2 + 1)), dispose() { geometry.dispose(); material.dispose(); } };
}

// ---- a feather as a standalone geometry (the loose feathers that scatter: one instanced mesh) ----------------------------------------------------------------------------------------------------
// A leaf from the origin up the +y axis, `len` long and `wid` wide, in the same colours as the wings, with the ink leaf behind it. The glow channel is dropped: it is drawn with a plain toon material.
export function featherGeometry(P, kind, len, wid, ow = 7) {
  const fm = createFeatherMesh({ map: null, uniforms: { uGlow: { value: new THREE.Vector4(1, 1, 1, 1) }, uSheen: { value: 0 }, uSheenCut: { value: 1 }, uSheenDir: { value: new THREE.Vector3(0, 1, 0) } }, P, slots: 1, ow });
  fm.look(0, kind, [1, 1, 1], false);
  fm.put(0, { x: 0, y: 0, z: 0, dx: 0, dy: 1, len, wid, cx: 1, cy: 0, curve: 0.07 });
  fm.flush();
  const g = fm.geometry.clone();
  g.deleteAttribute('aGlow'); g.deleteAttribute('uv');
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, len / 2, 0), len);
  fm.material.dispose(); fm.geometry.dispose();
  return g;
}
export { clamp };
