// A LIMB AS ONE CONTINUOUS TUBE (WP8, the creature kit). The simulation's limbs are chains of rigid segments {x, y, ang, len, r, r1} (creature.js) and stay exactly that: this file never moves
// a segment. It only DRAWS them smoothly: one fixed set of rings per limb, whose centres follow the segment joints (plus one ring between every two joints, Catmull-Rom so the limb has no
// kinks), the radius tapering r -> r1 along the chain, a ridged back (a spike at each joint), a pointed tip (or a flat cut face when the limb was severed). Only the numbers of the rings
// change each frame (positions, normals, ink vectors): the triangles are fixed, so every limb of a creature is ONE mesh (and one ink shell) whatever it is doing.
// The tube's frame is carried along the chain without twisting (parallel transport), starting with the limb's own SUCKER side, so a sucker row stays on the inner side of the curl all the
// way; instanced suckers (one InstancedMesh for all limbs) sit on that side. A limb in a coil round a ship gets its depth (z) from the caller: that is what lets it pass behind and in front.
// Coordinates: the 3D world's (x = the game's x, y = UP = the game's y negated, z toward the viewer).
import { THREE, gradientMap, rimify, outlineMat } from './style.js';
import { creatureToon } from './creatureKit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

// The cross-section rings of one limb: how many, and what they hold.
export const Q = 3; // rings per segment (joints plus Q - 1 smooth ones between)
const bodyRings = (maxSegs) => Q * maxSegs + 1;

export function createTubeSet({ nLimbs, maxSegs, sides = 12, map, uniforms, palette, ow = 14, tipK = 2.6, maxSuckers = 360, rows = [-0.62, 0.62], suckerK = 0.3 }) {
  const RB = bodyRings(maxSegs), R = RB + 2, S1 = sides + 1; // (every limb: RB body rings, two end rings: the tip, or the cut face)
  const perLimb = R * S1, total = perLimb * nLimbs;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2), col = new Float32Array(total * 3), glow = new Float32Array(total), ono = new Float32Array(total * 3);
  const idx = [];
  for (let l = 0; l < nLimbs; l++) for (let r = 0; r < R - 1; r++) for (let s = 0; s < sides; s++) {
    const a = l * perLimb + r * S1 + s, b = a + 1, c = a + S1, d = c + 1;
    idx.push(a, b, c, b, d, c); // (outward: ring index runs along the limb, s round it)
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geometry.setAttribute('onormal', new THREE.BufferAttribute(ono, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(idx);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6); // (it is huge, and never culled: the rings move every frame)
  const material = creatureToon(map, uniforms);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.toon = material;
  mesh.userData.shadowReceiver = true;
  const inkMesh = new THREE.Mesh(geometry, outlineMat);
  inkMesh.userData.isOutline = true;
  inkMesh.frustumCulled = false;

  // ---- suckers: one instanced mesh for all the limbs ------------------------------------------------------------------------------------------------------------------------------------
  const cup = new THREE.CylinderGeometry(0.62, 1, 0.8, 10, 1); // axis +y = away from the skin
  const sMat = rimify(new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap }));
  const suckers = new THREE.InstancedMesh(cup, sMat, maxSuckers);
  suckers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  suckers.frustumCulled = false;
  suckers.count = 0;
  suckers.setColorAt(0, new THREE.Color('#ffffff'));
  suckers.userData.toon = sMat;
  const boneC = new THREE.Color(palette.bone), pinkC = new THREE.Color(palette.lips);

  // ---- per limb state -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  const limbs = [];
  for (let l = 0; l < nLimbs; l++) {
    const base = l * perLimb;
    // u runs round the tube from the sucker side (0) and back to it (1); v is set per limb layout (design lengths) the first time
    for (let r = 0; r < R; r++) for (let s = 0; s < S1; s++) uv[(base + r * S1 + s) * 2] = s / sides;
    limbs.push({
      base, layoutKey: '', n: 0, tintKey: '', sev: null, dead: true,
      P: new Float32Array(R * 3), rad: new Float32Array(R), T: new Float32Array(R * 3), N1: new Float32Array(R * 3), N2: new Float32Array(R * 3), nr: 0, // (the rings of the last frame: the water effects and the suckers read them)
      stations: [], tint: [1, 1, 1],
    });
  }
  const circle = []; // cos / sin of the sides
  for (let s = 0; s <= sides; s++) circle.push([Math.cos((s / sides) * TAU), Math.sin((s / sides) * TAU)]);

  // the fixed things of a layout: the v coordinate of every ring (by the limb's design lengths: the texture never slides) and where its suckers sit
  function layout(L, segs) {
    const n = segs.length, key = n + '|' + segs.map((s) => Math.round(s.len) + ',' + Math.round(s.r)).join(';');
    if (L.layoutKey === key) return;
    L.layoutKey = key;
    L.n = n;
    const vv = new Float32Array(R);
    let v = 0;
    const circ = (r) => TAU * Math.max(8, r);
    vv[0] = 0;
    for (let i = 0; i < n; i++) {
      const s = segs[i], rm = (s.r + s.r1) / 2, dv = s.len / circ(rm); // (the arc length over the circumference keeps the spots round)
      for (let j = 1; j <= Q; j++) vv[Q * i + j] = v + (dv * j) / Q;
      v += dv;
    }
    for (let k = Q * n + 1; k < RB; k++) vv[k] = v;
    vv[RB] = v + tipK * segs[n - 1].r1 / circ(segs[n - 1].r1) * 0.5; vv[RB + 1] = vv[RB] + 0.05;
    for (let r = 0; r < R; r++) for (let s = 0; s < S1; s++) uv[(L.base + r * S1 + s) * 2 + 1] = vv[r];
    geometry.getAttribute('uv').needsUpdate = true;
    L.stations = [];
    for (let i = 0; i < n; i++) {
      const s = segs[i], rm = (s.r + s.r1) / 2, rs = clamp(rm * suckerK, 6, 64), ns = Math.max(1, Math.floor(s.len / (rs * 3.6)));
      for (let k = 0; k < ns; k++) L.stations.push({ ring: Q * i + Q * ((k + 0.5) / ns), rs: rs * (1 - 0.35 * (k / ns)) * (s.r1 / s.r < 1 ? 1 : 1), alt: (i + k) % 2 });
    }
  }

  const paintColors = (L, severed, t) => {
    const key = (severed ? 1 : 0) + '|' + t[0].toFixed(3) + '|' + t[1].toFixed(3) + '|' + t[2].toFixed(3);
    if (L.tintKey === key) return;
    L.tintKey = key;
    const tip = new THREE.Color(palette.char), flesh = new THREE.Color(palette.flesh), c = new THREE.Color();
    for (let r = 0; r < R; r++) {
      c.setRGB(1, 1, 1);
      if (r === RB || r === RB + 1) c.copy(severed ? flesh : tip);
      for (let s = 0; s < S1; s++) { const o = (L.base + r * S1 + s) * 3; col[o] = c.r * t[0]; col[o + 1] = c.g * t[1]; col[o + 2] = c.b * t[2]; }
    }
    geometry.getAttribute('color').needsUpdate = true;
  };

  const hide = (L) => { // a limb that is gone: every ring collapsed to one point (degenerate triangles)
    if (L.dead) return;
    L.dead = true; L.nr = 0;
    const o = L.base * 3;
    pos.fill(0, o, o + perLimb * 3); ono.fill(0, o, o + perLimb * 3);
    geometry.getAttribute('position').needsUpdate = true; geometry.getAttribute('onormal').needsUpdate = true;
  };

  // ---- one limb, one frame --------------------------------------------------------------------------------------------------------------------------------------------------------------
  // segs: the limb's segments (read only), side: its sucker side (+1 / -1), severed: flat cut end, Z: Float32Array(n + 1) the depth at every joint (the caller's: front / back layer or a coil),
  // tint: [r, g, b]. Returns the limb's ring record (read it for the water line).
  const J = [], Pk = [], Rk = [], Tk = [], n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), tPrev = new THREE.Vector3(), tq = new THREE.Quaternion(), q = new THREE.Vector3();
  for (let k = 0; k < R + 2; k++) { J.push(new THREE.Vector3()); Pk.push(new THREE.Vector3()); Tk.push(new THREE.Vector3()); Rk.push(0); }
  const N1k = [], N2k = [];
  for (let k = 0; k < R + 2; k++) { N1k.push(new THREE.Vector3()); N2k.push(new THREE.Vector3()); }

  function update(l, segs, side, severed, Z, tint) {
    const L = limbs[l], n = segs ? segs.length : 0;
    if (!n || n > maxSegs) { hide(L); return L; }
    L.dead = false;
    layout(L, segs);
    paintColors(L, severed, tint);
    for (let i = 0; i < n; i++) J[i].set(segs[i].x, -segs[i].y, Z[i]);
    { const s = segs[n - 1]; J[n].set(s.x + Math.cos(s.ang) * s.len, -(s.y + Math.sin(s.ang) * s.len), Z[n]); }
    // ring centres and radii: a ring at every joint, and Q - 1 between every two, on a Catmull-Rom curve through the joints (no kinks); the radius tapers r -> r1 with a little swell
    for (let i = 0; i < n; i++) {
      const p0 = J[Math.max(0, i - 1)], p1 = J[i], p2 = J[i + 1], p3 = J[Math.min(n, i + 2)];
      for (let j = 0; j < Q; j++) {
        const t = j / Q, t2 = t * t, t3 = t2 * t, P = Pk[Q * i + j];
        P.set(0, 0, 0)
          .addScaledVector(p1, 2).addScaledVector(p0, -t).addScaledVector(p2, t)
          .addScaledVector(p0, 2 * t2).addScaledVector(p1, -5 * t2).addScaledVector(p2, 4 * t2).addScaledVector(p3, -t2)
          .addScaledVector(p0, -t3).addScaledVector(p1, 3 * t3).addScaledVector(p2, -3 * t3).addScaledVector(p3, t3)
          .multiplyScalar(0.5);
        if (j === 0) P.copy(p1);
        Rk[Q * i + j] = (segs[i].r + (segs[i].r1 - segs[i].r) * t) * (1 + 0.05 * 4 * t * (1 - t));
      }
    }
    Pk[Q * n].copy(J[n]);
    Rk[Q * n] = segs[n - 1].r1;
    const nb = Q * n + 1;
    for (let k = 0; k < nb; k++) { // tangents: central differences
      const a = Pk[Math.max(0, k - 1)], b = Pk[Math.min(nb - 1, k + 1)];
      Tk[k].copy(b).sub(a);
      if (Tk[k].lengthSq() < 1e-6) Tk[k].set(1, 0, 0);
      Tk[k].normalize();
    }
    // the frame: the puppet is flat, so the sucker side is the in-plane normal of the path (the 2D art's side), kept on the same side all the way (a limb keeps its belly side, whichever way it curls);
    // a coil that runs along z (a limb round a ship) keeps the last good in-plane direction and is only tilted off the tangent
    {
      const a = segs[0].ang, sx = -Math.sin(a) * side, sy = -Math.cos(a) * side; // (the 2D art: +y of the segment, turned by side; y up in 3D)
      let sgn = 1, have = false;
      for (let k = 0; k < nb; k++) {
        const T = Tk[k];
        let rx = -T.y, ry = T.x;
        const rl = Math.hypot(rx, ry);
        if (rl > 0.2) {
          rx /= rl; ry /= rl;
          if (k === 0) sgn = rx * sx + ry * sy >= 0 ? 1 : -1;
          else if (have && (rx * sgn) * n1.x + (ry * sgn) * n1.y < 0) sgn = -sgn; // (keep it continuous when the path turns back on itself)
          n1.set(rx * sgn, ry * sgn, 0);
          have = true;
        } else if (!have) n1.set(sx, sy, 0);
        n1.addScaledVector(T, -n1.dot(T));
        if (n1.lengthSq() < 1e-8) n1.set(0, 1, 0).addScaledVector(T, -T.y);
        n1.normalize();
        n2.copy(T).cross(n1).normalize();
        N1k[k].copy(n1); N2k[k].copy(n2);
      }
    }
    // write the rings
    const wr = (ringIdx, c, rad, T, nA, nB, ridge, flat) => { // one ring: centre c, radius rad, frame (nA, nB), a spike of `ridge` on the back, flat = the normal is T (a cap)
      const slope = flat ? 0 : (T.slope || 0);
      for (let s = 0; s < S1; s++) {
        const cs = circle[s][0], sn = circle[s][1], psi = (s / sides) * TAU;
        const d = psi - Math.PI, bump = ridge > 0 ? 1 + ridge * Math.exp(-(d * d) / 0.12) : 1;
        const o = (L.base + ringIdx * S1 + s) * 3;
        _a.set(nA.x * cs + nB.x * sn, nA.y * cs + nB.y * sn, nA.z * cs + nB.z * sn);
        const rr = rad * bump;
        pos[o] = c.x + _a.x * rr; pos[o + 1] = c.y + _a.y * rr; pos[o + 2] = c.z + _a.z * rr;
        if (flat) _b.copy(T); else _b.copy(_a).addScaledVector(T, -slope).normalize();
        nor[o] = _b.x; nor[o + 1] = _b.y; nor[o + 2] = _b.z;
        ono[o] = _b.x * ow; ono[o + 1] = _b.y * ow; ono[o + 2] = _b.z * ow;
      }
    };
    for (let k = 0; k < RB; k++) {
      const kk = Math.min(k, nb - 1);
      const a = Math.max(0, kk - 1), b = Math.min(nb - 1, kk + 1);
      const ds = Pk[a].distanceTo(Pk[b]) || 1;
      Tk[kk].slope = (Rk[b] - Rk[a]) / ds;
      const joint = kk % Q === 0, last = kk === nb - 1;
      wr(k, Pk[kk], Rk[kk], Tk[kk], N1k[kk], N2k[kk], joint && !last ? 0.2 : 0.07, false);
    }
    const e = nb - 1, rEnd = Rk[e], Te = Tk[e], nA = N1k[e], nB = N2k[e];
    if (severed) {
      wr(RB, Pk[e], rEnd * 0.985, Te, nA, nB, 0, true);
      wr(RB + 1, Pk[e], 0, Te, nA, nB, 0, true);
    } else {
      const tl = tipK * rEnd;
      q.copy(Pk[e]).addScaledVector(Te, tl * 0.55);
      Te.slope = -(rEnd * 0.5) / (tl * 0.55);
      wr(RB, q, rEnd * 0.5, Te, nA, nB, 0.15, false);
      q.copy(Pk[e]).addScaledVector(Te, tl);
      Te.slope = -1;
      wr(RB + 1, q, 0, Te, nA, nB, 0, false);
    }
    // keep a record for the water line and the suckers
    L.nr = nb;
    for (let k = 0; k < nb; k++) {
      L.P[k * 3] = Pk[k].x; L.P[k * 3 + 1] = Pk[k].y; L.P[k * 3 + 2] = Pk[k].z; L.rad[k] = Rk[k];
      L.T[k * 3] = Tk[k].x; L.T[k * 3 + 1] = Tk[k].y; L.T[k * 3 + 2] = Tk[k].z;
      L.N1[k * 3] = N1k[k].x; L.N1[k * 3 + 1] = N1k[k].y; L.N1[k * 3 + 2] = N1k[k].z;
      L.N2[k * 3] = N2k[k].x; L.N2[k * 3 + 1] = N2k[k].y; L.N2[k * 3 + 2] = N2k[k].z;
    }
    L.sev = severed;
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('normal').needsUpdate = true;
    geometry.getAttribute('onormal').needsUpdate = true;
    return L;
  }

  // ---- the suckers of every limb, after all the limbs were updated -------------------------------------------------------------------------------------------------------------------------
  const _M = new THREE.Matrix4(), _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), _X = new THREE.Matrix4(), _C = new THREE.Color();
  const dir = new THREE.Vector3(), tv = new THREE.Vector3(), zv = new THREE.Vector3();
  function placeSuckers(zFrontOf = null) {
    let c = 0;
    for (let l = 0; l < nLimbs && c < maxSuckers - rows.length; l++) {
      const L = limbs[l];
      if (L.dead || !L.nr) continue;
      const t = L.tint;
      for (const st of L.stations) {
        if (c >= maxSuckers - rows.length) break;
        const k0 = Math.min(L.nr - 1, Math.floor(st.ring)), k1 = Math.min(L.nr - 1, k0 + 1), f = clamp(st.ring - k0, 0, 1);
        const rad = L.rad[k0] + (L.rad[k1] - L.rad[k0]) * f;
        for (let ri = 0; ri < rows.length; ri++) {
          const a = rows[ri] * (ri ? 1 : 1);
          const cs = Math.cos(a), sn = Math.sin(a);
          dir.set(0, 0, 0);
          for (const [arr, w] of [[L.N1, cs], [L.N2, sn]]) dir.x += (arr[k0 * 3] * (1 - f) + arr[k1 * 3] * f) * w, dir.y += (arr[k0 * 3 + 1] * (1 - f) + arr[k1 * 3 + 1] * f) * w, dir.z += (arr[k0 * 3 + 2] * (1 - f) + arr[k1 * 3 + 2] * f) * w;
          dir.normalize();
          tv.set(L.T[k0 * 3] * (1 - f) + L.T[k1 * 3] * f, L.T[k0 * 3 + 1] * (1 - f) + L.T[k1 * 3 + 1] * f, L.T[k0 * 3 + 2] * (1 - f) + L.T[k1 * 3 + 2] * f);
          tv.addScaledVector(dir, -tv.dot(dir)).normalize();
          zv.copy(tv).cross(dir).normalize();
          _P.set(L.P[k0 * 3] * (1 - f) + L.P[k1 * 3] * f, L.P[k0 * 3 + 1] * (1 - f) + L.P[k1 * 3 + 1] * f, L.P[k0 * 3 + 2] * (1 - f) + L.P[k1 * 3 + 2] * f).addScaledVector(dir, rad * 0.94);
          _X.makeBasis(tv, dir, zv);
          _Q.setFromRotationMatrix(_X);
          const rs = st.rs;
          _M.compose(_P, _Q, _S.set(rs, rs, rs));
          suckers.setMatrixAt(c, _M);
          _C.copy((ri + st.alt) % 2 ? pinkC : boneC).multiply(_c3.set(t[0], t[1], t[2]));
          suckers.setColorAt(c, _C);
          c++;
        }
      }
    }
    suckers.count = c;
    suckers.instanceMatrix.needsUpdate = true;
    if (suckers.instanceColor) suckers.instanceColor.needsUpdate = true;
    void zFrontOf;
  }
  const _c3 = new THREE.Color();
  const setTint = (l, r, g, b) => { const t = limbs[l].tint; t[0] = r; t[1] = g; t[2] = b; };

  // A static copy of one limb (a severed chunk): the tube and its suckers in one geometry in the frame it was given, ready for a Mesh + an ink shell. The caller owns (and disposes) it.
  function bakeStatic(segs, side, severed, Z, tint) {
    update(0, segs, side, severed, Z, tint);
    const L = limbs[0];
    const sub = (arr, comps, from, to) => new Float32Array(arr.subarray(from * comps, to * comps));
    const nT = perLimb;
    const G = new THREE.BufferGeometry();
    const parts = { position: [sub(pos, 3, 0, nT), 3], normal: [sub(nor, 3, 0, nT), 3], uv: [sub(uv, 2, 0, nT), 2], color: [sub(col, 3, 0, nT), 3], aGlow: [sub(glow, 1, 0, nT), 1], onormal: [sub(ono, 3, 0, nT), 3] };
    // suckers: cups merged in as plain geometry (the belly colour of the skin: uv u = 0)
    const cupG = cup.toNonIndexed(), cp = cupG.attributes.position, cn = cupG.attributes.normal, cuv = cupG.attributes.uv;
    const add = { position: [], normal: [], uv: [], color: [], aGlow: [], onormal: [] };
    const nm = new THREE.Matrix3();
    for (const st of L.stations) {
      const k0 = Math.min(L.nr - 1, Math.floor(st.ring)), k1 = Math.min(L.nr - 1, k0 + 1), f = clamp(st.ring - k0, 0, 1), rad = L.rad[k0] + (L.rad[k1] - L.rad[k0]) * f;
      for (let ri = 0; ri < rows.length; ri++) {
        const a = rows[ri], cs = Math.cos(a), sn = Math.sin(a);
        dir.set(0, 0, 0);
        for (const [arr, w] of [[L.N1, cs], [L.N2, sn]]) dir.x += (arr[k0 * 3] * (1 - f) + arr[k1 * 3] * f) * w, dir.y += (arr[k0 * 3 + 1] * (1 - f) + arr[k1 * 3 + 1] * f) * w, dir.z += (arr[k0 * 3 + 2] * (1 - f) + arr[k1 * 3 + 2] * f) * w;
        dir.normalize();
        tv.set(L.T[k0 * 3] * (1 - f) + L.T[k1 * 3] * f, L.T[k0 * 3 + 1] * (1 - f) + L.T[k1 * 3 + 1] * f, L.T[k0 * 3 + 2] * (1 - f) + L.T[k1 * 3 + 2] * f);
        tv.addScaledVector(dir, -tv.dot(dir)).normalize();
        zv.copy(tv).cross(dir).normalize();
        _P.set(L.P[k0 * 3] * (1 - f) + L.P[k1 * 3] * f, L.P[k0 * 3 + 1] * (1 - f) + L.P[k1 * 3 + 1] * f, L.P[k0 * 3 + 2] * (1 - f) + L.P[k1 * 3 + 2] * f).addScaledVector(dir, rad * 0.94);
        _X.makeBasis(tv, dir, zv);
        _Q.setFromRotationMatrix(_X);
        _M.compose(_P, _Q, _S.set(st.rs, st.rs, st.rs));
        nm.getNormalMatrix(_M);
        const cc = (ri + st.alt) % 2 ? pinkC : boneC;
        for (let i = 0; i < cp.count; i++) {
          _v.fromBufferAttribute(cp, i).applyMatrix4(_M);
          add.position.push(_v.x, _v.y, _v.z);
          _v.fromBufferAttribute(cn, i).applyMatrix3(nm).normalize();
          add.normal.push(_v.x, _v.y, _v.z);
          add.onormal.push(0, 0, 0);
          add.uv.push(0.02, 0.5);
          add.color.push(cc.r * tint[0], cc.g * tint[1], cc.b * tint[2]);
          add.aGlow.push(0);
        }
      }
    }
    for (const name of Object.keys(parts)) {
      const [a, comps] = parts[name], extra = add[name];
      const merged = new Float32Array(a.length + extra.length);
      merged.set(a, 0); merged.set(extra, a.length);
      G.setAttribute(name, new THREE.BufferAttribute(merged, comps));
    }
    // the tube's own triangles come first (the index of limb 0), the cups are plain triangles after them
    const tubeIdx = idx.slice(0, (R - 1) * sides * 6), cupStart = nT, cupCount = add.position.length / 3, all = tubeIdx.slice();
    for (let i = 0; i < cupCount; i++) all.push(cupStart + i);
    G.setIndex(all);
    G.computeBoundingSphere();
    hide(L);
    L.layoutKey = ''; L.tintKey = '';
    return G;
  }

  return {
    geometry, mesh, inkMesh, suckers, limbs, update, placeSuckers, setTint, bakeStatic, material, hide, R, RB, sides, Q,
    stats: () => ({ verts: total, tris: idx.length / 3, suckers: suckers.count }),
    dispose() { geometry.dispose(); cup.dispose(); material.dispose(); sMat.dispose(); suckers.dispose(); },
  };
}
