// THE KRAKEN'S BODY IN 3D (WP8): the data side of the creature kit. creature.js is the generic view; this file says what a Kraken is made of:
//   a bulbous sculpted MANTLE (a lathe around the sim's mantle axis, a front crest ridge, mottled skin from the head atlas, side spikes, two big FINS, a frill of petals round its base),
//   two big EYES on the sides of the head (a socket, the glowing ball and iris, a slit pupil, a heavy brow), the BEAK in the middle of the lips (two hinged halves, a glowing throat, teeth),
//   the HEART (a window on the mantle, only shown when the sim exposes it).
// Everything is built once, in the BODY's frame for a creature facing +x (the view mirrors it for the other side), from the simulation's own part data (mantle capsule, eye / mouth / heart
// positions and radii: cr.parts), so the picture and the hit zones agree. Coordinates: x right, y UP (the sim's y negated), z toward the viewer.
//   build(cr, P) -> { geometry (the still body), dynGeometry (jaws, lids, heart), ranges, dyn, sil (the mantle's outline for the water line), eyes, mouth, mantle }
import { THREE } from './style.js';
import { Mesher, DynPiece, mantleUV, finUV, SWATCH } from './creatureKit.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// A Catmull-Rom curve through [a, r] points (uniform): s in 0..N-1 -> { a, r }.
function curve(pts) {
  const N = pts.length;
  return (s, out) => {
    s = clamp(s, 0, N - 1 - 1e-9);
    const i = Math.floor(s), t = s - i, p = (k) => pts[clamp(k, 0, N - 1)];
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2), t2 = t * t, t3 = t2 * t;
    for (let c = 0; c < 2; c++) out[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3);
    return out;
  };
}

export function buildKraken(cr, P, opts = {}) {
  const sides = opts.low ? 20 : 32, alongN = opts.low ? 26 : 40, OW = P.INK || 14;
  const part = (kind, id) => cr.parts.find((p) => (id ? p.id === id : p.kind === kind));
  const man = part('mantle'), mouthP = part('mouth'), heartP = part('heart'), eyeParts = cr.parts.filter((p) => p.kind === 'eye');
  const R = man.shape.r, L = man.shape.len, ang0 = man.shape.ang, Lr = L / R, sz = 0.82;
  const S = V(man.at[0], -man.at[1], 0), X = V(Math.cos(ang0), -Math.sin(ang0), 0), Y = V(-X.y, X.x, 0), Zv = V(0, 0, 1);
  const M = new THREE.Matrix4().makeBasis(X, Y, Zv).setPosition(S), Mi = M.clone().invert();
  const mesh = new Mesher(), dm = new Mesher();

  // ---- the mantle's outline: radius against the distance along the axis (units of R) -------------------------------------------------------------------------------------------------------------
  const prof = curve([[-1.3, 0], [-1.2, 0.2], [-1.0, 0.46], [-0.7, 0.74], [-0.35, 0.94], [0, 1.04], [0.45 * Lr, 1.08], [0.8 * Lr, 1.02], [Lr, 0.96], [Lr + 0.45, 0.86], [Lr + 0.95, 0.5]]);
  const aTip = -1.3 * R, aBase = (Lr + 0.95) * R, NP = 11;
  const tmp = [0, 0];
  const profAt = (a) => { // r at a distance a along the axis (px): by search on the spline
    let lo = 0, hi = NP - 1;
    for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; prof(mid, tmp); if (tmp[0] * R < a) lo = mid; else hi = mid; }
    prof((lo + hi) / 2, tmp);
    return tmp[1] * R;
  };
  const crest = (a, th) => { const win = clamp((a + 1.1 * R) / (0.5 * R), 0, 1) * clamp((0.95 * L - a) / (0.6 * R), 0, 1); return 1 + 0.11 * win * Math.exp(-(th * th) / 0.08); };
  const surfZ = (a, lat) => { const r = profAt(a), q = Math.max(0, r * r - lat * lat); return sz * Math.sqrt(q) * crest(a, 0); };
  const posMantle = (u, v, out) => { // u: tip -> base, v: round (0.5 = the front)
    prof(u * (NP - 1), tmp);
    const a = tmp[0] * R, th = (v - 0.5) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), r = tmp[1] * R * crest(a, th);
    return out.set(a, r * s, r * c * (c > 0 ? sz : 0.62));
  };
  mesh.grid(alongN, sides, posMantle, M, { ow: OW, color: '#ffffff', name: 'mantle' }, (u, v) => mantleUV(v, u));

  // the mantle's outline in the body's frame (left and right edges), for the foam where it crosses the sea
  const sil = { L: new Float32Array(NP * 6), R: new Float32Array(NP * 6), n: NP * 3 };
  for (let k = 0; k < sil.n; k++) {
    prof((k / (sil.n - 1)) * (NP - 1), tmp);
    const a = tmp[0] * R, r = tmp[1] * R, pl = V(a, -r, 0).applyMatrix4(M), pr = V(a, r, 0).applyMatrix4(M);
    sil.L[k * 2] = pl.x; sil.L[k * 2 + 1] = pl.y; sil.R[k * 2] = pr.x; sil.R[k * 2 + 1] = pr.y;
  }

  // ---- fins, spikes and a frill: the rest of the mantle group --------------------------------------------------------------------------------------------------------------------------------------
  const fin = (side) => {
    const sh = new THREE.Shape(), pts = [[-0.45, 0.85], [-0.1, 1.35], [0.4, 1.68], [0.95, 1.72], [1.0, 1.42], [1.32, 1.55], [1.36, 1.22], [1.72, 1.3], [1.6, 0.98]];
    pts.forEach(([a, l], i) => (i ? sh.lineTo(a * R, side * l * R) : sh.moveTo(a * R, side * l * R)));
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1 * R, bevelEnabled: true, bevelThickness: 0.035 * R, bevelSize: 0.03 * R, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -0.18 * R);
    return g;
  };
  for (const side of [-1, 1]) mesh.add(fin(side), M.clone().multiply(new THREE.Matrix4().makeRotationX(-side * 0.5)), { ow: OW * 0.8, color: '#ffffff', name: 'mantle', uv: (x, y) => finUV(clamp((x / R + 0.5) / 2.3, 0, 1), clamp((Math.abs(y) / R - 0.78) / 1.15, 0, 1)) });
  const cone = new THREE.ConeGeometry(1, 1, 7, 1);
  const spikeAt = (a, lat, z, dirLocal, h, w, color) => { // a cone standing on the surface point (a, lat, z) of the mantle, pointing along dirLocal (local frame)
    const d = dirLocal.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
    const m = new THREE.Matrix4().compose(V(a, lat, z).addScaledVector(d, h * 0.42), q, V(w, h, w));
    mesh.add(cone, M.clone().multiply(m), { ow: OW * 0.6, color, name: 'mantle' });
  };
  for (const side of [-1, 1]) for (let k = 0; k < 8; k++) { // the side spikes: down both silhouettes, swept up toward the tip
    const a = -0.85 * R + (k / 7) * (L * 0.88 + 0.85 * R), r = profAt(a), h = R * (0.28 + 0.26 * Math.sin((k / 7) * Math.PI) ** 0.7);
    spikeAt(a, side * r * 0.97, 0, V(-0.5, side, 0.1), h, R * 0.085, P.bone);
  }
  for (let k = 0; k < 6; k++) { // the crest: along the front ridge, pointing up and forward
    const a = -0.95 * R + (k / 5) * (L * 0.5 + 0.9 * R), h = R * (0.3 - k * 0.03);
    spikeAt(a, 0, surfZ(a, 0) * 0.97, V(-0.62, 0, 0.8), h, R * 0.075, P.bone);
  }
  { // the frill: petals round the base of the mantle, flaring out and down
    const a = L + 0.2 * R, r = profAt(a), N = opts.low ? 12 : 18;
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), nz = c > 0 ? sz : 0.62, dir = V(0.55, s, c * 0.75).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir), h = R * 0.38, w = R * 0.1;
      const m = new THREE.Matrix4().compose(V(a, r * s * 0.98, r * c * nz * 0.98).addScaledVector(dir, h * 0.4), q, V(w, h, w * 0.35));
      mesh.add(cone, M.clone().multiply(m), { ow: OW * 0.5, color: P.skinDark, name: 'mantle' });
    }
  }

  // ---- the eyes: on the sides of the head, bulging out of their sockets ---------------------------------------------------------------------------------------------------------------------------
  const eyes = [];
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  eyeParts.forEach((ep, ei) => {
    const e3 = V(ep.at[0], -ep.at[1], 0), loc = e3.clone().applyMatrix4(Mi), a = loc.x, lat = loc.y, r = profAt(a), zs = surfZ(a, lat), Re = ep.shape.r * 1.3;
    // the way it looks: out of the surface, turned a third of the way to the front (so the pair does not squint at each other)
    const nrm = V(0, lat / (r * r), zs / (sz * r * sz * r)).normalize(), gaze = nrm.clone().lerp(V(0, 0, 1), 0.5).normalize();
    const up = V(-1, 0, 0), xe = up.clone().cross(gaze).normalize(), ye = gaze.clone().cross(xe).normalize();
    const Ml = new THREE.Matrix4().makeBasis(xe, ye, gaze).setPosition(V(a, lat, zs - 0.35 * Re)); // (sunk a little into the surface)
    const Mb = M.clone().multiply(Ml);
    const nm = ei === 0 ? 'eyeA' : 'eyeB', gid = ei === 0 ? 1 : 2;
    const noseDir = V(S.x - e3.x, 0, 0).transformDirection(new THREE.Matrix4().copy(Mb).invert()); // (the body's inward direction seen from the eye)
    const slant = Math.sign(noseDir.x) * -0.42; // the inner end of the brow is the low one
    mesh.add(sphere, Mb.clone().multiply(new THREE.Matrix4().compose(V(0, 0, -0.1 * Re), new THREE.Quaternion(), V(1.28 * Re, 1.28 * Re, 0.62 * Re))), { ow: OW * 0.7, color: P.skinDark, name: nm }); // the socket
    mesh.add(sphere, Mb.clone().multiply(new THREE.Matrix4().compose(V(0, 0, 0.14 * Re), new THREE.Quaternion(), V(Re, Re, 0.92 * Re))), { ow: OW * 0.5, color: P.eye, glow: gid, name: nm }); // the ball
    mesh.add(sphere, Mb.clone().multiply(new THREE.Matrix4().compose(V(0, 0, 0.93 * Re), new THREE.Quaternion(), V(0.78 * Re, 0.78 * Re, 0.24 * Re))), { ow: 0, color: P.iris, glow: gid, name: nm }); // the iris: the brighter step
    mesh.add(sphere, Mb.clone().multiply(new THREE.Matrix4().compose(V(0, 0, 1.1 * Re), new THREE.Quaternion(), V(0.15 * Re, 0.66 * Re, 0.18 * Re))), { ow: 0, color: P.pupil, name: nm }); // the slit
    const brow = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), slant);
    mesh.add(sphere, Mb.clone().multiply(new THREE.Matrix4().compose(V(0, 0.64 * Re, 0.22 * Re).applyQuaternion(brow), brow, V(1.22 * Re, 0.5 * Re, 1.02 * Re))), { ow: OW * 0.6, color: P.skinDark, name: nm }); // the heavy brow
    eyes.push({ part: ep, id: ep.id, Mb, pivot: V(0, 0, 0.14 * Re).applyMatrix4(Mb), axis: V(1, 0, 0).transformDirection(Mb), Re, slant, glow: gid });
  });

  // ---- the mouth: lips, the glowing throat, teeth; the two jaws are dynamic ----------------------------------------------------------------------------------------------------------------------
  const mouth = (() => {
    if (!mouthP) return null;
    const m3 = V(mouthP.at[0], -mouthP.at[1], 0), loc = m3.clone().applyMatrix4(Mi), zs = surfZ(loc.x, loc.y), Rm = mouthP.shape.r;
    const ze = V(0.22, 0, 0.976).normalize(), xe = V(0, 1, 0), ye = ze.clone().cross(xe).normalize(); // (in the mantle's own frame: x runs down the body, y to the right, z out of the face; the mouth looks out and a little down)
    const Ml = new THREE.Matrix4().makeBasis(xe, ye, ze).setPosition(V(loc.x, loc.y, zs - 0.06 * Rm));
    const Mm = M.clone().multiply(Ml); // the mouth's frame: +z out of the face (a little down), +y up
    const torus = new THREE.TorusGeometry(0.8 * Rm, 0.26 * Rm, 10, 24);
    mesh.add(torus, Mm.clone().multiply(new THREE.Matrix4().makeScale(1.08, 0.96, 0.8)), { ow: OW * 0.7, color: P.lips, name: 'mouth' });
    mesh.add(sphere, Mm.clone().multiply(new THREE.Matrix4().compose(V(0, 0, -0.08 * Rm), new THREE.Quaternion(), V(0.78 * Rm, 0.72 * Rm, 0.22 * Rm))), { ow: 0, color: P.mouthIn, glow: 3, name: 'mouth' });
    const tooth = new THREE.ConeGeometry(1, 1, 6, 1);
    for (let k = 0; k < 12; k++) { // the teeth: a ring of little cones pointing in
      const th = (k / 12) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th), d = V(-c, -s, 0.5).normalize(), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d);
      mesh.add(tooth, Mm.clone().multiply(new THREE.Matrix4().compose(V(c * 0.66 * Rm, s * 0.6 * Rm, 0.08 * Rm), q, V(0.07 * Rm, 0.34 * Rm, 0.07 * Rm))), { ow: 0, color: P.bone, name: 'mouth' });
    }
    // the jaws (their own mesh): a hooked UPPER mandible pointing down and forward, a scoop-shaped LOWER one under it. Open: the upper one swings up toward the viewer, the lower drops.
    const hook = new THREE.ConeGeometry(1, 1, 14, 1), bowl = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const tilt = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.38).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.PI));
    dm.add(hook, Mm.clone().multiply(new THREE.Matrix4().compose(V(0, 0.08 * Rm, 0.42 * Rm), tilt, V(0.56 * Rm, 1.5 * Rm, 0.46 * Rm))), { ow: OW * 0.7, color: P.bone, name: 'upper' });
    dm.add(hook, Mm.clone().multiply(new THREE.Matrix4().compose(V(0, -0.58 * Rm, 0.66 * Rm), tilt, V(0.15 * Rm, 0.5 * Rm, 0.13 * Rm))), { ow: 0, color: P.char, name: 'upper' });
    dm.add(bowl, Mm.clone().multiply(new THREE.Matrix4().compose(V(0, -0.2 * Rm, 0.3 * Rm), new THREE.Quaternion(), V(0.62 * Rm, 0.44 * Rm, 0.5 * Rm))), { ow: OW * 0.6, color: P.bone, name: 'lower' });
    return { part: mouthP, Mm, pivot: V(0, 0.5 * Rm, 0.1 * Rm).applyMatrix4(Mm), pivotLow: V(0, -0.35 * Rm, 0.1 * Rm).applyMatrix4(Mm), axis: V(1, 0, 0).transformDirection(Mm), Rm };
  })();

  // ---- the lids (heavy, for the exhausted creature) and the heart: dynamic too -------------------------------------------------------------------------------------------------------------------
  eyes.forEach((e, i) => {
    const nm = 'lid' + i, cap = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), e.slant * 0.6);
    dm.add(cap, e.Mb.clone().multiply(new THREE.Matrix4().compose(V(0, 0.02 * e.Re, 0.16 * e.Re), q, V(1.14 * e.Re, 1.14 * e.Re, 1.04 * e.Re))), { ow: OW * 0.6, color: P.skinDark, name: nm });
  });
  let heart = null;
  if (heartP) {
    const h3 = V(heartP.at[0], -heartP.at[1], 0), loc = h3.clone().applyMatrix4(Mi), zs = surfZ(loc.x, loc.y), Rh = heartP.shape.r;
    // the heart faces out of the mantle and its tip points down the body (toward the base)
    const Ml = new THREE.Matrix4().makeBasis(V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)).setPosition(V(loc.x, loc.y, zs * 0.96));
    const Mh = M.clone().multiply(Ml);
    dm.add(new THREE.TorusGeometry(1.25 * Rh, 0.34 * Rh, 8, 22), Mh.clone().multiply(new THREE.Matrix4().makeScale(1, 1, 0.8)), { ow: OW * 0.6, color: P.flesh, name: 'heart' });
    dm.add(sphere, Mh.clone().multiply(new THREE.Matrix4().compose(V(-0.1 * Rh, 0.5 * Rh, 0.1 * Rh), new THREE.Quaternion(), V(0.62 * Rh, 0.62 * Rh, 0.6 * Rh))), { ow: OW * 0.4, color: P.heart, glow: 4, name: 'heart' });
    dm.add(sphere, Mh.clone().multiply(new THREE.Matrix4().compose(V(-0.1 * Rh, -0.5 * Rh, 0.1 * Rh), new THREE.Quaternion(), V(0.62 * Rh, 0.62 * Rh, 0.6 * Rh))), { ow: OW * 0.4, color: P.heart, glow: 4, name: 'heart' });
    dm.add(cone, Mh.clone().multiply(new THREE.Matrix4().compose(V(0.78 * Rh, 0, 0.1 * Rh), new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -Math.PI / 2), V(1.02 * Rh, 1.2 * Rh, 0.6 * Rh))), { ow: OW * 0.4, color: P.heart, glow: 4, name: 'heart' });
    heart = { part: heartP, pivot: V(0, 0, 0).applyMatrix4(Mh) };
  }

  const geometry = mesh.build(), dynGeometry = dm.build();
  const dyn = {};
  if (mouth) { dyn.upper = new DynPiece(dynGeometry, dm.ranges.upper, mouth.pivot, mouth.axis); dyn.lower = new DynPiece(dynGeometry, dm.ranges.lower, mouth.pivotLow, mouth.axis); }
  eyes.forEach((e, i) => { dyn['lid' + i] = new DynPiece(dynGeometry, dm.ranges['lid' + i], e.pivot, e.axis); dyn['lid' + i].pose(0, 0); });
  if (heart) { dyn.heart = new DynPiece(dynGeometry, dm.ranges.heart, heart.pivot, V(0, 0, 1)); dyn.heart.pose(0, 0); }
  void SWATCH;
  return { geometry, dynGeometry, ranges: mesh.ranges, dynRanges: dm.ranges, dyn, sil, eyes, mouth, heart, mantle: { S, X, Y, M, R, L, sz }, tris: mesh.verts / 3, dynTris: dm.verts / 3 };
}
