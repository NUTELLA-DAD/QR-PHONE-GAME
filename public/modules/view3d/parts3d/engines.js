// Engine pods and sails (WP2). An engine is a nacelle (riveted iron, a brass cowling, a stack) and a three-bladed wooden propeller with brass tips and a spinner. Each prop spins by ITS OWN throttle:
// the sim keeps state.engines[i].pow (what that engine runs at, chasing its lever; negative = astern) and the view only reads it (shipMesh update: angle += dt * pow * speed, so a stopped engine stands still).
// ENGINE SIZES (config.ENGINES.SIZES): a HEAVY engine is the same nacelle bigger (brass bands, twin stacks) with a four-bladed propeller; a GREAT LIFT engine is a dark turbine drum with a brass duct ring and a twin
// rotor (two six-bladed fans one behind the other); the dyn record carries where its exhaust leaves (`ex`) and how big its puffs are (`puff`). A standard pod is built exactly as before.
// Sails hang as a pair of canvases on either side of the bag held off the deck by struts (a mast on the centre line would sit inside the gasbag); they rise and furl with the hoist.
import { THREE } from '../style.js';
import { artOf, steamPuff } from '../../host/engineArt.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildEngine(e, ctx, i) {
  const { T, X, Y, P, content, pv } = ctx, key = 'engine:' + e.name, b = ctx.part(key);
  const lowQ = P.find((q) => q.id === 'lower') || P[0];
  const mid = lowQ ? (lowQ.x0 + lowQ.x1) / 2 : pv;
  const size = e.size, great = size === 'great', { k, kh } = artOf(size); // (k, kh: the nacelle's length and height factors; 1 and 1 for a standard pod)
  const y = ctx.platY(e.d) + 38 + (kh - 1) * 24, out = e.x < mid ? -1 : 1; // (a taller nacelle hangs lower, the strut reaches up to the deck)
  const eg = new THREE.Group();
  eg.position.set(X(e.x), Y(y), 0);
  const nac = ctx.dynBatch(key + ':nacelle');
  if (great) {
    nac.sphere('#4b5258', 0, 0, 0, 62 * k, 24 * kh, 26 * kh, 3, false, { tr: 'iron' }); // the turbine drum
    for (const f of [-0.55, -0.1, 0.35]) nac.cyl(T.iron, out * f * 62 * k, 0, 0, 24.6 * kh, 5, 1.4, 0, 0, Math.PI / 2, 26.6 * kh, { tr: 'iron' }); // riveted bands
    nac.cyl(T.brass, -out * 50 * k, 0, 0, 14 * kh, 9, 1.4, 0, 0, Math.PI / 2, 16 * kh, { tr: 'brass' }); // the exhaust collar aft
    const ring = new THREE.Matrix4().makeTranslation(out * 52 * k, 0, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    nac.geo(T.brass, new THREE.TorusGeometry(24 * kh * 1.3, 4.6, 6, 22), ring, 1.6, { tr: 'brass' }); // the duct ring round the fans
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) nac.rod(T.iron, V(out * 40 * k, 0, 0), V(out * 52 * k, Math.cos(a) * 24 * kh * 1.3, Math.sin(a) * 24 * kh * 1.3), 1.6, 1, { tr: 'iron' }); // stays from the drum to the ring
    for (const dx of [-0.45, 0.05]) nac.cyl(T.iron, dx * 62 * k, 24 * kh + 6, 0, 6, 16, 1, 0, 0, 0, undefined, { tr: 'iron' }); // stacks
  } else {
    nac.sphere('#6d7378', 0, 0, 0, 62 * k, 24 * kh, 26 * kh, 3, false, { tr: 'iron' });
    nac.cyl(T.iron, out * 62 * k, 0, 0, 12 * k, 14 * k, 2.5, 0, 0, Math.PI / 2, undefined, { tr: 'iron' });
    nac.cyl(T.brass, out * 46 * k, 0, 0, 25.5 * kh, 7, 1.4, 0, 0, Math.PI / 2, undefined, { tr: 'brass' }); // the cowling ring
    nac.cyl(T.brass, -out * 40 * k, 0, 0, 22 * kh, 5, 1.2, 0, 0, Math.PI / 2, undefined, { tr: 'brass' });
    if (size) for (const f of [0.1, 0.78]) nac.cyl(T.brass, out * f * 62 * k, 0, 0, 24.6 * kh, 5, 1.2, 0, 0, Math.PI / 2, 26.4 * kh, { tr: 'brass' }); // heavy: two more brass bands
  }
  nac.box(T.hullDark, 0, 36 + (kh - 1) * 24 + (great ? 6 : 0), 0, 10 * k, 30, 16 * k, 1.5, 0, 0, 0, { tr: 'woodC' }); // the strut up to the deck
  if (!great) for (const dx of [-14, 10]) nac.cyl(T.iron, dx * k, 22 * kh, 0, 4.6, 12, 1, 0, 0, 0, undefined, { tr: 'iron' }); // exhaust stubs
  if (size === 'heavy') for (const dx of [-30, -4]) nac.cyl(T.iron, dx * k, 22 * kh, 0, 4.6, 12, 1, 0, 0, 0, undefined, { tr: 'iron' }); // heavy: twin stacks, four stubs
  eg.add(nac.buildGroup());
  const prop = ctx.dynBatch(key + ':prop');
  if (great) { // the twin rotor: two six-bladed fans inside the duct ring, one behind the other and a twelfth of a turn apart
    prop.sphere(T.brass, 0, 0, 0, 7, 7, 7, 1.5, true, { tr: 'brass' });
    const R = 24 * kh * 1.3 - 4;
    for (const [fx, off] of [[0, 0], [-24, Math.PI / 6]]) for (let n = 0; n < 6; n++) {
      const rot = new THREE.Matrix4().makeRotationX(off + (n * 2 * Math.PI) / 6);
      prop.geo(T.rail, new THREE.BoxGeometry(3.4, R, 12), new THREE.Matrix4().makeTranslation(fx * k * 0.6, 0, 0).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(0, R / 2 + 4, 0)), 1.6, { tr: 'woodC', uv: 'fit' });
    }
    prop.cyl(T.brass, -14 * k, 0, 0, 5, 30 * k * 0.6, 1, 0, 0, Math.PI / 2, undefined, { tr: 'brass' }); // the shaft between the two fans
  } else {
    prop.sphere(T.brass, 0, 0, 0, 8, 8, 8, 1.5, true, { tr: 'brass' });
    prop.cone(T.brass, out * 8, 0, 0, 7, 12, 1.2, 0, 0, -out * Math.PI / 2, { tr: 'brass' }); // the spinner
    const blades = size ? 4 : 3, bl = 40 * k; // (heavy: four longer blades)
    for (let n = 0; n < blades; n++) {
      const a = (n * 2 * Math.PI) / blades, rot = new THREE.Matrix4().makeRotationX(a);
      prop.geo(T.rail, new THREE.BoxGeometry(4.2, bl, 11 * k), rot.clone().multiply(new THREE.Matrix4().makeTranslation(0, 25 * k, 0)), 1.8, { tr: 'woodC', uv: 'fit' });
      prop.geo(T.brass, new THREE.BoxGeometry(4.8, 8, 11.6 * k), rot.clone().multiply(new THREE.Matrix4().makeTranslation(0, 44 * k, 0)), 1.2, { tr: 'brass', uv: 'fit' }); // brass tip
    }
  }
  const pg = prop.buildGroup();
  pg.position.set(out * (great ? 60 * k + 6 : 72 * k), 0, 0);
  eg.add(pg);
  if (e.dir) eg.rotation.z = -e.dir;
  content.add(eg);
  return { key, batches: [b], dyn: [{ role: 'engine', key, name: e.name, group: eg, prop: pg, out, node: eg, angle: i * 1.3, ex: [-out * 24 * k, 24 * kh], puff: steamPuff(size) }], bounds: b.bounds };
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
