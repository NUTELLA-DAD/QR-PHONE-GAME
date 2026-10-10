// THE CINDER DRAKE'S WING MEMBRANES (3D.md section 22): flat-shaded sheets stretched between the wing's bones. The simulation's wing is a chain of five segments (the arm and the hand); the bones are drawn as
// tubes by the tube kit and THIS file draws the skin between them: one panel for each segment, from the leading bone (J: the joints of the chain) to a trailing edge (E: a point behind every joint, where a
// finger bone ends), each panel a small grid of cells so that
//   - the trailing edge scallops in between the fingers (the middle of every panel is pulled in),
//   - the colour runs from a dark ember at the bone to a pale orange at the edge, with a thin dark band as the edge's ink and a shade down both sides of every panel (the membrane folds at the fingers),
//   - every panel is tilted a little the other way from its neighbour, so neighbours catch the toon light in different steps (stretched facets: no smooth shading),
//   - DAMAGE shows: as the wing loses health, ragged HOLES open in the skin (cells are taken out, a charred rim round each) and the trailing edge goes ragged; a wing torn at the middle (`torn`) hangs from a
//     jagged cut edge in raw flesh.
// One mesh holds every wing (non-indexed: each cell has its own corners, so cells can be hidden and coloured one by one). Positions are rewritten each frame from the joints the caller gives; the colours only
// when the damage, the tint (dim / flash / lit) or the torn state changes. It is double sided (the sheet is lit from whichever face the camera sees); it casts no ink shell (a sheet has no inside): the dark edge
// band does the line work. Nothing here moves by itself: no wobble, no time.
import { THREE } from './style.js';
import { creatureToon, rngOf, SWATCH } from './creatureKit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NU = 4, VS = [0, 0.3, 0.58, 0.82, 0.93, 1], NV = VS.length - 1, SCALLOP = 0.2, MAXP = 5;
const CELLS = MAXP * NU * NV;
const hash = (a, b, c) => { let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

export function createWingMesh({ map, uniforms, P, nWings = 2, seed = 5 }) {
  const total = nWings * CELLS * 6;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2), glow = new Float32Array(total);
  for (let i = 0; i < total; i++) { uv[i * 2] = SWATCH[0]; uv[i * 2 + 1] = SWATCH[1]; nor[i * 3 + 2] = 1; }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  const material = creatureToon(map, uniforms);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.toon = material;
  mesh.userData.shadowReceiver = true;
  const C = (hex) => new THREE.Color(hex);
  const cDk = C(P.wingDk), cMid = C(P.wing), cLt = C(P.wingLt || P.wingEdge), cEdge = C(P.wingEdge), cInk = C(P.wingInk), cFlesh = C(P.flesh), cChar = C(P.char);
  // the colour of a row of cells at its top (a) and bottom (b) corner
  const ROWS = [[cDk, cMid], [cMid, cMid], [cMid, cLt], [cLt, cEdge], [cInk, cInk]];

  // the holes of a wing: a fixed list (by the wing's number), each opening at its own damage share and growing
  const ripsOf = (wi) => {
    const R = rngOf(seed + wi * 17 + 3), out = [];
    for (let j = 0; j < 9; j++) out.push({ k: (R() * MAXP) | 0, u: 0.15 + R() * 0.7, v: 0.3 + R() * 0.55, r: 0.2 + R() * 0.22, th: 0.06 + j * 0.095 });
    return out;
  };
  const wings = [];
  for (let wi = 0; wi < nWings; wi++) wings.push({ base: wi * CELLS * 6, rips: ripsOf(wi), sig: '', n: 0, hidden: new Uint8Array(CELLS), dead: true });

  const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), P3 = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpL = new THREE.Vector3(), tmpT = new THREE.Vector3(), nrm = new THREE.Vector3();
  const _c = new THREE.Color();
  const point = (A, B, C, D, u, v, out) => { // A, B: the leading bone's two joints; D, C: the trailing points behind them; u along, v from the bone (0) to the trailing edge (1)
    tmpL.copy(A).lerp(B, u); tmpT.copy(D).lerp(C, u);
    const f = v * (1 - SCALLOP * 4 * u * (1 - u) * v * v);
    return out.copy(tmpL).lerp(tmpT, f);
  };

  // shape = { J: [Vector3 x (n + 1)], E: [Vector3 x (n + 1)] (E[n] = the tip, or behind it when `torn`), n, torn, damage (0..1), tint: [r, g, b], trail: the unit vector (x, y) the membrane hangs toward (for the facet tilt) }
  function update(wi, shape) {
    const W = wings[wi], n = Math.min(MAXP, shape.n | 0);
    if (!n) { hide(wi); return; }
    W.dead = false;
    const dmg = clamp(shape.damage || 0, 0, 1), t = shape.tint || [1, 1, 1];
    const sig = n + '|' + (shape.torn ? 1 : 0) + '|' + Math.round(dmg * 40) + '|' + t[0].toFixed(3) + '|' + t[1].toFixed(3) + '|' + t[2].toFixed(3);
    const recolor = sig !== W.sig;
    if (recolor) { W.sig = sig; rebuildHoles(W, n, dmg, !!shape.torn); }
    for (let k = 0; k < MAXP; k++) {
      const live = k < n;
      let tilt = 0;
      if (live) {
        const A = shape.J[k], B = shape.J[k + 1], D = shape.E[k], Cc = shape.E[k + 1];
        tilt = (k % 2 ? 1 : -1) * 0.42;
        tmpA.copy(D).add(Cc).multiplyScalar(0.5).sub(P0.copy(A).add(B).multiplyScalar(0.5)); // from the bone to the edge: the way the panel hangs
        const tl = Math.hypot(tmpA.x, tmpA.y) || 1;
        nrm.set(tmpA.x / tl * tilt, tmpA.y / tl * tilt, 1).normalize();
        for (let iu = 0; iu < NU; iu++) {
          const u0 = iu / NU, u1 = (iu + 1) / NU;
          for (let iv = 0; iv < NV; iv++) {
            const cell = (k * NU + iu) * NV + iv, o = W.base + cell * 6;
            if (W.hidden[cell]) { for (let q = 0; q < 6; q++) { const p = (o + q) * 3; pos[p] = pos[p + 1] = pos[p + 2] = 0; } continue; }
            point(A, B, Cc, D, u0, VS[iv], P0); point(A, B, Cc, D, u1, VS[iv], P1); point(A, B, Cc, D, u1, VS[iv + 1], P2); point(A, B, Cc, D, u0, VS[iv + 1], P3);
            const c4 = [P0, P1, P2, P0, P2, P3];
            for (let q = 0; q < 6; q++) { const p = (o + q) * 3, a = c4[q]; pos[p] = a.x; pos[p + 1] = a.y; pos[p + 2] = a.z; nor[p] = nrm.x; nor[p + 1] = nrm.y; nor[p + 2] = nrm.z; }
          }
        }
      } else if (recolor || !W.cleared) { for (let c = k * NU * NV; c < (k + 1) * NU * NV; c++) { const o = W.base + c * 6; for (let q = 0; q < 6; q++) { const p = (o + q) * 3; pos[p] = pos[p + 1] = pos[p + 2] = 0; } } }
    }
    W.cleared = true; W.n = n;
    if (recolor) paint(W, n, t, !!shape.torn);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('normal').needsUpdate = true;
  }

  // which cells are gone: the holes (radius grows with the damage), a ragged trailing edge, and a torn wing's jagged cut
  function rebuildHoles(W, n, dmg, torn) {
    W.hidden.fill(0);
    for (const r of W.rips) {
      if (dmg < r.th || r.k >= n) continue;
      const rad = r.r * (0.45 + 0.55 * clamp((dmg - r.th) / 0.3, 0, 1));
      for (let iu = 0; iu < NU; iu++) for (let iv = 0; iv < NV - 1; iv++) {
        const cu = (iu + 0.5) / NU, cv = (VS[iv] + VS[iv + 1]) / 2;
        if (Math.hypot((cu - r.u) / 0.9, (cv - r.v) / 0.9) < rad) W.hidden[(r.k * NU + iu) * NV + iv] = 1;
      }
    }
    if (dmg > 0.18) for (let k = 0; k < n; k++) for (let iu = 0; iu < NU; iu++) for (const iv of [NV - 1, NV - 2]) if (hash(k, iu, iv + 7) < (dmg - 0.18) * 1.3) W.hidden[(k * NU + iu) * NV + iv] = 1; // (a ragged edge)
    if (torn) { // the cut: every other cell of the outer column and the outer rim of the last panel goes, the rest is flesh
      const k = n - 1;
      for (let iv = 0; iv < NV; iv++) { const iu = NU - 1; if (hash(k, iv, 99) < 0.55) W.hidden[(k * NU + iu) * NV + iv] = 1; }
      for (let iv = 2; iv < NV; iv++) if (hash(k, iv, 123) < 0.6) W.hidden[(k * NU + NU - 2) * NV + iv] = 1;
    }
  }

  function paint(W, n, t, torn) {
    for (let k = 0; k < n; k++) {
      const par = k % 2 ? 1.06 : 0.94;
      for (let iu = 0; iu < NU; iu++) {
        for (let iv = 0; iv < NV; iv++) {
          const cell = (k * NU + iu) * NV + iv, o = W.base + cell * 6;
          if (W.hidden[cell]) continue;
          // a cell next to a hole is charred
          let edgeHole = false;
          for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = iu + du, b = iv + dv; if (a >= 0 && a < NU && b >= 0 && b < NV && W.hidden[(k * NU + a) * NV + b]) edgeHole = true; }
          const [ca, cb] = ROWS[iv], shade = (iu === 0 || iu === NU - 1 ? 0.8 : 1) * par;
          const cut = torn && k === n - 1 && iu >= NU - 2;
          for (let q = 0; q < 6; q++) {
            const base = q === 0 || q === 1 || q === 3 ? ca : cb; // (the two triangles are P0 P1 P2 and P0 P2 P3: corners 0 and 1 lie on the bone side of the cell, 2 and 3 on the far side)
            _c.copy(base).multiplyScalar(shade);
            if (cut) _c.lerp(cFlesh, iu === NU - 1 ? 0.8 : 0.35);
            if (edgeHole) _c.lerp(cChar, 0.65);
            const p = (o + q) * 3;
            col[p] = _c.r * t[0]; col[p + 1] = _c.g * t[1]; col[p + 2] = _c.b * t[2];
          }
        }
      }
    }
    geometry.getAttribute('color').needsUpdate = true;
  }

  function hide(wi) {
    const W = wings[wi];
    if (W.dead) return;
    W.dead = true; W.sig = ''; W.cleared = false;
    pos.fill(0, W.base * 3, (W.base + CELLS * 6) * 3);
    geometry.getAttribute('position').needsUpdate = true;
  }
  return { mesh, geometry, material, update, hide, wings, tris: () => total / 3, dispose() { geometry.dispose(); material.dispose(); } };
}
