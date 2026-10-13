// THE SET-PIECE KIT (CASTLE.md D3; config.RING3D.SET): the two rough shapes the castle's big moments are made of, built once and drawn instanced.
//   roughBlock()  a masonry block, a box whose eight corners are knocked about by a hash of where they are (the same corner moves the same way in every face), each face a shade of its own: the stone chunks of a
//                 collapsing gatehouse and the gold pieces of the broken crown (the instance colour tints it)
//   roughStone()  a catapult stone, a faceted ball (80 triangles) knocked about the same way
// Both are 100 units across with their ink outline in the same mesh (style.js inkDouble: ONE draw call however many), to be scaled per instance. Nothing here moves. No random numbers: a hash of the position.
import { THREE, piece, inkDouble } from './style.js';

export const SET_LIVE = { stone: false }; // (setpiece3d.js sets it while it draws the catapult stones; vfx.js and index.js then skip the generic ball and tracer for them)

const hash3 = (x, y, z) => { let h = Math.imul(Math.round(x * 4) + 101, 374761393) ^ Math.imul(Math.round(y * 4) + 211, 668265263) ^ Math.imul(Math.round(z * 4) + 307, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// move every vertex by a hash of where it is (so a corner shared by several faces stays shared), then give each triangle a shade of its own
function rough(geo, amount, shades, ow) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + (hash3(x, y, z) - 0.5) * 2 * amount, y + (hash3(y, z, x) - 0.5) * 2 * amount, z + (hash3(z, x, y) - 0.5) * 2 * amount);
  }
  g.computeVertexNormals(); // (non-indexed: one flat normal a triangle)
  const out = piece(g, '#ffffff', null, ow);
  g.dispose();
  const c = out.attributes.color;
  for (let i = 0; i + 2 < c.count; i += 3) {
    const k = shades[0] + (shades[1] - shades[0]) * hash3(i * 0.37, i * 0.11, i * 0.73);
    for (let j = 0; j < 3; j++) c.setXYZ(i + j, k, k, k);
  }
  return out;
}
export const roughBlock = () => inkDouble(rough(new THREE.BoxGeometry(100, 100, 100, 1, 1, 1), 13, [0.8, 1], 2.2));
export const roughStone = () => inkDouble(rough(new THREE.IcosahedronGeometry(50, 1), 7, [0.78, 1], 2.4));
