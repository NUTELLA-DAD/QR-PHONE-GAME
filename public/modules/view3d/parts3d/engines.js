// Engine pods and sails (WP2). An engine is a nacelle (riveted iron, a brass cowling, a stack) and a three-bladed wooden propeller with brass tips and a spinner. Each prop spins by ITS OWN throttle:
// the sim keeps state.engines[i].pow (what that engine runs at, chasing its lever; negative = astern) and the view only reads it (shipMesh update: angle += dt * pow * speed, so a stopped engine stands still).
// Sails hang as a pair of canvases on either side of the bag held off the deck by struts (a mast on the centre line would sit inside the gasbag); they rise and furl with the hoist.
import { THREE } from '../style.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildEngine(e, ctx, i) {
  const { T, X, Y, P, content, pv } = ctx, key = 'engine:' + e.name, b = ctx.part(key);
  const lowQ = P.find((q) => q.id === 'lower') || P[0];
  const mid = lowQ ? (lowQ.x0 + lowQ.x1) / 2 : pv;
  const y = ctx.platY(e.d) + 38, out = e.x < mid ? -1 : 1;
  const eg = new THREE.Group();
  eg.position.set(X(e.x), Y(y), 0);
  const nac = ctx.dynBatch(key + ':nacelle');
  nac.sphere('#6d7378', 0, 0, 0, 62, 24, 26, 3, false, { tr: 'iron' });
  nac.cyl(T.iron, out * 62, 0, 0, 12, 14, 2.5, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
  nac.cyl(T.brass, out * 46, 0, 0, 25.5, 7, 1.4, 0, 0, Math.PI / 2, undefined, { tr: 'brass' }); // the cowling ring
  nac.cyl(T.brass, -out * 40, 0, 0, 22, 5, 1.2, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
  nac.box(T.hullDark, 0, 36, 0, 10, 30, 16, 1.5, 0, 0, 0, { tr: 'woodC' }); // the strut up to the deck
  for (const dx of [-14, 10]) nac.cyl(T.iron, dx, 22, 0, 4.6, 12, 1, 0, 0, 0, undefined, { tr: 'iron' }); // exhaust stubs
  eg.add(nac.buildGroup());
  const prop = ctx.dynBatch(key + ':prop');
  prop.sphere(T.brass, 0, 0, 0, 8, 8, 8, 1.5, true, { tr: 'brass' });
  prop.cone(T.brass, out * 8, 0, 0, 7, 12, 1.2, 0, 0, -out * Math.PI / 2, { tr: 'brass' }); // the spinner
  for (let k = 0; k < 3; k++) {
    const a = (k * 2 * Math.PI) / 3, rot = new THREE.Matrix4().makeRotationX(a);
    prop.geo(T.rail, new THREE.BoxGeometry(4.2, 40, 11), rot.clone().multiply(new THREE.Matrix4().makeTranslation(0, 25, 0)), 1.8, { tr: 'woodC', uv: 'fit' });
    prop.geo(T.brass, new THREE.BoxGeometry(4.8, 8, 11.6), rot.clone().multiply(new THREE.Matrix4().makeTranslation(0, 44, 0)), 1.2, { tr: 'brass', uv: 'fit' }); // brass tip
  }
  const pg = prop.buildGroup();
  pg.position.set(out * 72, 0, 0);
  eg.add(pg);
  if (e.dir) eg.rotation.z = -e.dir;
  content.add(eg);
  return { key, batches: [b], dyn: [{ role: 'engine', key, name: e.name, group: eg, prop: pg, out, node: eg, angle: i * 1.3 }], bounds: b.bounds };
}

export function buildSail(s, ctx, i) {
  const { T, W, X, Y, bags, content } = ctx, key = 'sail:' + (s.n || i), b = ctx.part(key);
  const ryMax = Math.max(100, ...bags.map((q) => q.ry)), zS = ryMax * 0.96 + 16;
  const y = ctx.platY(s.d), ph = s.h * 0.78;
  for (const sgn of [-1, 1]) for (const dx of [-0.42, 0.42]) {
    b.rod(T.rail, V(X(s.x + dx * s.w), Y(y), sgn * W * 0.94), V(X(s.x + dx * s.w), Y(y - s.h), sgn * zS), 3.5, 1.2, { tr: 'woodC' });
  }
  const sail = ctx.dynBatch(key + ':canvas');
  for (const sgn of [-1, 1]) {
    sail.box('#ebdfc0', 0, -ph / 2, sgn * zS, s.w, ph, 5, 2.5, 0, 0, 0, { tr: 'canvas3' });
    sail.box(T.rail, 0, 0, sgn * zS, s.w + 14, 6, 8, 1.5, 0, 0, 0, { tr: 'woodC' }); // the boom
    for (const k of [0.3, 0.6]) sail.box('#c9b88f', 0, -ph * k, sgn * (zS + (sgn > 0 ? 2.8 : -2.8)), s.w + 1, 3, 1, 0, 0, 0, 0, { tr: 'strap' }); // reef bands
  }
  const sg = sail.buildGroup();
  sg.position.set(X(s.x), Y(y - s.h), 0);
  content.add(sg);
  return { key, batches: [b], dyn: [{ role: 'sail', key, node: sg, s }], bounds: b.bounds };
}
