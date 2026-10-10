// Crew as small toon figures in their own colour: a capsule body, a round head with ears and a snout, goggles, arms and legs that swing on rigid pivots while
// they walk or climb. Raiders (skeletons) share the model with bone and charcoal colours. A coloured marker cone floats over each crewman (readable from the sofa).
import { THREE, Batch, mat, G, INK } from './style.js';

const FUR = { bulldog: '#c9a27a', wolf: '#8d8d93', tiger: '#e0963e', shiba: '#d8a15b', fox: '#d9772f', bear: '#7a5638', cat: '#a8a8ac', rabbit: '#ece4d8', skeleton: '#e8dcc0' };
const EARS = { bulldog: 'drop', wolf: 'point', tiger: 'round', shiba: 'point', fox: 'point', bear: 'round', cat: 'point', rabbit: 'long', skeleton: 'none' };
const capCache = new Map();
const capsule = (r, totalH) => { // a capsule of radius r and total height totalH
  const k = r + '|' + totalH;
  if (!capCache.has(k)) capCache.set(k, new THREE.CapsuleGeometry(r, Math.max(0.1, totalH - 2 * r), 4, 10));
  return capCache.get(k);
};

function part(color, build) {
  const b = new Batch();
  build(b);
  return b.build();
}

export function makeFigure({ color = '#ece3c8', species = 'bulldog', raider = false } = {}) {
  const fur = FUR[raider ? 'skeleton' : species] || FUR.bulldog;
  const cloth = raider ? '#4a4346' : color;
  const g = new THREE.Group();
  const OW = 3.2;

  // body + head (+ marker) in one mesh
  const body = new Batch();
  body.geo(cloth, capsule(16, 40), mat(0, 48, 0, 1, 1, 0.9), OW); // torso
  body.box('#3a2c20', 0, 42, 0, 33, 6, 29, 0); // belt
  body.sphere(fur, 3, 82, 0, 19, 19, 18, OW); // head
  body.sphere(fur, 19, 77, 0, 8, 7, 7, 2.2, true); // snout
  body.sphere('#2b2622', 25, 78, 0, 3, 3, 3, 0, true); // nose
  for (const z of [-7.5, 7.5]) body.sphere('#f3ead6', 16, 87, z, 4, 4, 3, 0, true); // eyes
  body.box('#3a2c20', 12, 88, 0, 7, 8, 32, 0); // goggle band
  const ears = EARS[raider ? 'skeleton' : species] || 'round';
  if (ears !== 'none') for (const z of [-11, 11]) {
    if (ears === 'long') body.cone(fur, -2, 112, z, 5.5, 26, 1.8);
    else if (ears === 'point') body.cone(fur, -1, 105, z, 7, 15, 1.8);
    else if (ears === 'drop') body.sphere(fur, -3, 86, z * 1.65, 7, 12, 4, 1.8, true);
    else body.sphere(fur, -2, 100, z * 1.1, 7, 7, 5, 1.8, true);
  }
  if (raider) { body.box('#2b2622', 12, 77, 0, 3, 7, 22, 0); body.cone('#a8443f', -1, 104, 0, 9, 13, 1.8); } // grinning jaw line and a red crest
  else body.cone(color, 0, 128, 0, 11, 17, 2.4, Math.PI); // the colour marker (a downward cone)
  const bodyG = body.build();
  g.add(bodyG);

  // limbs on pivots
  const limb = (x, y, z, len, r, col) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    pivot.add(part(col, (b) => b.geo(col, capsule(r, len), mat(0, -len / 2 + 2, 0), 2.6)));
    g.add(pivot);
    return pivot;
  };
  const armL = limb(0, 64, 17, 34, 5.5, cloth), armR = limb(0, 64, -17, 34, 5.5, cloth);
  const legL = limb(0, 31, 7.5, 31, 6.5, '#4a3a2c'), legR = limb(0, 31, -7.5, 31, 6.5, '#4a3a2c');

  const fig = {
    group: g, body: bodyG, armL, armR, legL, legR, z: 0, zTarget: 0, shown: true,
    // p = the player record; t = seconds; walk = moving; climb = on a ladder; ko = knocked out; face = +1 / -1
    pose(p, t, walk, climb, ko, face) {
      const ph = t * 9 + (p.phase || 0);
      if (ko) {
        g.rotation.z = -Math.PI / 2 * (face >= 0 ? 1 : -1);
        g.position.y += 14;
        armL.rotation.z = armR.rotation.z = legL.rotation.z = legR.rotation.z = 0;
        return;
      }
      g.rotation.z = 0;
      if (climb) {
        g.rotation.y = -Math.PI / 2; // face the wall
        const s = Math.sin(ph);
        armL.rotation.z = -2.6 + 0.4 * s; armR.rotation.z = -2.6 - 0.4 * s;
        legL.rotation.z = 0.35 * s; legR.rotation.z = -0.35 * s;
        return;
      }
      g.rotation.y = face >= 0 ? 0 : Math.PI;
      if (walk) {
        const s = Math.sin(ph);
        armL.rotation.z = 0.8 * s; armR.rotation.z = -0.8 * s;
        legL.rotation.z = -0.7 * s; legR.rotation.z = 0.7 * s;
      } else {
        armL.rotation.z = armR.rotation.z = 0.05;
        legL.rotation.z = legR.rotation.z = 0;
      }
    },
  };
  void G; void INK;
  return fig;
}
