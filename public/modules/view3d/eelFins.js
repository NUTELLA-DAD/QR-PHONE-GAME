// THE VOID EEL'S TRANSLUCENT FINS IN 3D (3D.md section 42): ONE mesh, ONE draw call, rewritten each frame from the body tubes' own rings (creatureTube.js records: centre, radius and frame of every ring).
//   - the DORSAL FIN along the back of every section: a sail of glowing ribs, taller at each joint (a spiky ridge), flaring into a big tail fin at the very end of the tail
//   - the VENTRAL FIN along the belly, a lower ridge
//   - the CROWN'S SAIL: the translucent membrane inside the bone rim of the crown (the capsule a boarder walks), its ribs fanning out from the base
// Quads of 6 vertices (no index), position + uv + colour with alpha + a zero glow id. The material is the creature toon one (creatureKit.js) with transparency, depth test but no depth write, both faces.
// Nothing here moves by itself: the shape is the body's, the ribs are painted (eelPaint.js paintEelFin), nothing is a sine of time.
import { THREE } from './style.js';
import { creatureToon, makeUniforms } from './creatureKit.js';
import { paintEelFin } from './eelPaint.js';
import { crownAt, CROWN } from './eelModel.js';

const MAXQ = 1600;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;

export function createEelFins(root, P, opts = {}) {
  const F = P.FIN, Q = opts.Q || 3;
  const pos = new Float32Array(MAXQ * 18), uv = new Float32Array(MAXQ * 12), col = new Float32Array(MAXQ * 24), glow = new Float32Array(MAXQ * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const skin = paintEelFin(P), U = makeUniforms(0.99);
  U.uSelf.value = 0.85;
  const mat = creatureToon(skin.map, U);
  mat.transparent = true; mat.depthWrite = false; mat.side = THREE.DoubleSide; mat.forceSinglePass = true; // (one draw call, not the back faces and then the front ones)
  mat.emissive.set('#ffffff'); mat.emissiveMap = skin.glow; mat.emissiveIntensity = 1.0;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.userData.toon = mat;
  mesh.userData.plain = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
  mesh.name = 'eelFins';
  mesh.visible = false;
  root.add(mesh);
  let n = 0;
  // one quad: corners a (base, ring k), b (tip, ring k), c (tip, ring k + 1), d (base, ring k + 1) with uv (u0, 0) (u0, 1) (u1, 1) (u1, 0) and the alpha of each end
  const quad = (a, b, c, d, u0, u1, v0, v1, rgb, a0, a1) => {
    if (n >= MAXQ) return;
    const P6 = [a, b, c, a, c, d], UV = [[u0, v0], [u0, v1], [u1, v1], [u0, v0], [u1, v1], [u1, v0]], AL = [a0, a0, a1, a0, a1, a1];
    for (let i = 0; i < 6; i++) {
      const o = n * 6 + i;
      pos[o * 3] = P6[i][0]; pos[o * 3 + 1] = P6[i][1]; pos[o * 3 + 2] = P6[i][2];
      uv[o * 2] = UV[i][0]; uv[o * 2 + 1] = UV[i][1];
      col[o * 4] = rgb[0]; col[o * 4 + 1] = rgb[1]; col[o * 4 + 2] = rgb[2]; col[o * 4 + 3] = AL[i];
    }
    n++;
  };
  return {
    mesh, material: mat, uniforms: U,
    begin() { n = 0; },
    // the fins of one tube (a record of creatureTube.js: P, rad, N1 per ring, nr rings). o: { tail (flare into a tail fin), rgb (the tint), alpha (0..1), scale (a number per ring, or null: how much of the fin stands: the dissolve), root (true: shorten the first rings) }
    strip(L, o = {}) {
      const nr = L.nr | 0;
      if (nr < 2) return;
      const rgb = o.rgb || [1, 1, 1], al = (o.alpha == null ? 1 : o.alpha) * F.ALPHA, SUB = 2;
      for (const side of [-1, 1]) { // -1: the back (away from the belly side N1), 1: the belly
        const base = side < 0 ? F.DORSAL : F.VENTRAL;
        const pts = [];
        for (let k = 0; k < nr; k++) {
          const rad = L.rad[k], sc = o.scale ? o.scale[k] : 1, spike = k % Q === 0 ? 1 + F.SPIKE : 1 - 0.08;
          let h = rad * base * spike * sc;
          if (o.tail) { const t = clamp((k - (nr - 13)) / 12, 0, 1), fl = t < 0.82 ? Math.pow(t / 0.82, 1.3) : lerp(1, 0.4, (t - 0.82) / 0.18); h *= 1 + F.TAIL * fl; } // (a lyre: the fin flares toward the tail and narrows again at its very tip)
          if (o.root) h *= lerp(0.55, 1, clamp(k / 3, 0, 1));
          const nx = L.N1[k * 3] * side, ny = L.N1[k * 3 + 1] * side, nz = L.N1[k * 3 + 2] * side, px = L.P[k * 3], py = L.P[k * 3 + 1], pz = L.P[k * 3 + 2];
          pts.push([[px + nx * rad * 0.88, py + ny * rad * 0.88, pz + nz * rad * 0.88], [px + nx * (rad + h), py + ny * (rad + h), pz + nz * (rad + h)], sc]);
        }
        // each gap between two rings is cut into SUB pieces on a Catmull-Rom curve through the ring points (a smooth edge, not a polyline of 100 px steps)
        const cr = (a, b, c, d, t) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
        const at = (k, which, t) => { const p0 = pts[Math.max(0, k - 1)][which], p1 = pts[k][which], p2 = pts[k + 1][which], p3 = pts[Math.min(nr - 1, k + 2)][which]; return [cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t), cr(p0[2], p1[2], p2[2], p3[2], t)]; };
        for (let k = 0; k < nr - 1; k++) {
          const s0 = pts[k][2], s1 = pts[k + 1][2];
          if (s0 < 0.04 && s1 < 0.04) continue;
          for (let j = 0; j < SUB; j++) {
            const ta = j / SUB, tb = (j + 1) / SUB, sa = lerp(s0, s1, ta), sb = lerp(s0, s1, tb);
            quad(at(k, 0, ta), at(k, 1, ta), at(k, 1, tb), at(k, 0, tb), (k + ta) / Q, (k + tb) / Q, 0, 1, rgb, al * Math.min(1, sa * 2), al * Math.min(1, sb * 2));
          }
        }
      }
    },
    // the crown's sail at (x, y, z) (the crown's base in the 3D world), k = how much of it stands (1), alpha
    crown(x, y, z, k = 1, alpha = 1, rgb = [1, 1, 1]) {
      if (!(k > 0.02)) return;
      const M = 40, rows = [0.1, 0.42, 0.74, 1.0], hub = [0, CROWN.FOOT + 40], al = alpha * F.ALPHA * 1.15;
      const at = (i, r) => { const [rx, ry] = crownAt(i / M); const f = rows[r]; return [x + (hub[0] + (rx - hub[0]) * f) * k, y + (hub[1] + (ry - hub[1]) * f) * k, z + 12 * Math.sin(Math.PI * Math.min(1, f))]; };
      for (let i = 0; i < M; i++) for (let r = 0; r < rows.length - 1; r++) quad(at(i, r), at(i, r + 1), at(i + 1, r + 1), at(i + 1, r), (i / M) * 6, ((i + 1) / M) * 6, rows[r], rows[r + 1], rgb, al * (1 - 0.4 * rows[r]), al * (1 - 0.4 * rows[r + 1]));
    },
    end() {
      geo.setDrawRange(0, n * 6);
      for (const nm of ['position', 'uv', 'color']) geo.getAttribute(nm).needsUpdate = true;
      mesh.visible = n > 0;
    },
    hide() { n = 0; geo.setDrawRange(0, 0); mesh.visible = false; },
    get quads() { return n; },
    tris() { return n * 2; },
    dispose() { geo.dispose(); mat.dispose(); skin.map.dispose(); skin.glow.dispose(); mesh.removeFromParent(); },
  };
}

// The fins of a section that has been cut off (it falls as a Rapier body, creature.js makeChunk): a small static geometry in the chunk's own frame (the sim's segments, relative to the first one), the same dorsal and belly sails.
export function chunkFinGeometry(P, segs, Q = 3) {
  const F = P.FIN, pts = [];
  segs.forEach((s) => { for (let j = 0; j < Q; j++) { const u = j / Q; pts.push({ x: s.x + Math.cos(s.ang) * s.len * u, y: -(s.y + Math.sin(s.ang) * s.len * u), rad: lerp(s.r, s.r1, u), a: s.ang }); } });
  const l = segs[segs.length - 1];
  pts.push({ x: l.x + Math.cos(l.ang) * l.len, y: -(l.y + Math.sin(l.ang) * l.len), rad: l.r1, a: l.ang });
  const pos = [], uv = [], col = [], glow = [];
  for (const side of [-1, 1]) {
    const base = side < 0 ? F.DORSAL : F.VENTRAL;
    for (let k = 0; k < pts.length - 1; k++) {
      const c = [pts[k], pts[k + 1]].map((p, i) => { const nx = Math.sin(p.a) * side, ny = Math.cos(p.a) * side, h = p.rad * base * ((k + i) % Q === 0 ? 1 + F.SPIKE : 0.92); return [[p.x + nx * p.rad * 0.88, p.y + ny * p.rad * 0.88, 0], [p.x + nx * (p.rad + h), p.y + ny * (p.rad + h), 0]]; });
      const P6 = [c[0][0], c[0][1], c[1][1], c[0][0], c[1][1], c[1][0]], UV = [[k / Q, 0], [k / Q, 1], [(k + 1) / Q, 1], [k / Q, 0], [(k + 1) / Q, 1], [(k + 1) / Q, 0]];
      for (let i = 0; i < 6; i++) { pos.push(...P6[i]); uv.push(...UV[i]); col.push(1, 1, 1, F.ALPHA); glow.push(0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 4));
  g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(glow), 1));
  g.computeBoundingSphere();
  return g;
}
