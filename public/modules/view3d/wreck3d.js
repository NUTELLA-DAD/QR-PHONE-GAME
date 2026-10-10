// A SHIP BREAKING UP (WP9). When the hull gives out, the sim keeps `ship.ctx.wreck = { t }` for config.WRECK.TIME seconds (the 2D game tears the picture into three pieces: the gasbag and the two halves
// of the gondola, each tumbling away on its own path). In 3D the gondola (everything but the gas envelopes) tips nose-down and falls away in a long arc, while every gasbag is peeled off its rigging and
// drifts a little behind it, slower, so she comes apart from the top: the same paths and rates as the 2D pieces (the bag falls on 40 t^2 and turns slowly, the hull on 130 t^2 and turns on 0.1 t^2).
// The crew aboard ride the falling hull (they are placed in its frame). A burst of fire, smoke and splinters (WP4's particles) opens it, then flames and a smoke trail follow the falling parts.
// Rigid motion only: the ship's own root is moved and turned, a bag's own node is offset: no vertex work, no wobble. The simulation is read only.
//   const w = createWreck3D({ P: () => particles | null }); w.apply(ship, model)  (once per ship per frame, after the ship's root is placed and before the matrices are updated)
import { THREE } from './style.js';
import { config } from '../../config.js';

const fin = (n, d = 0) => (Number.isFinite(n) ? n : d);

export function createWreck3D(api = {}) {
  const recs = new Map(); // ship id -> { base: [[node, x, y, z, rz]], boom, acc }
  const _p = new THREE.Vector3(), _w = new THREE.Vector3();
  const P = () => (api.P ? api.P() : null);
  const stats = { ships: 0 };
  return {
    stats,
    apply(sh, model, dt = 0.016) {
      const W = sh.ctx && sh.ctx.wreck;
      let r = recs.get(sh.id);
      const bags = (model.dyn && model.dyn.bags) || [];
      if (!r) { r = { base: bags.map((b) => [b.node, b.node.position.x, b.node.position.y, b.node.position.z, b.node.rotation.z]), boom: false, acc: 0, acc2: 0, moved: false, n: bags.length }; recs.set(sh.id, r); }
      if (r.n !== bags.length) { r.base = bags.map((b) => [b.node, b.node.position.x, b.node.position.y, b.node.position.z, b.node.rotation.z]); r.n = bags.length; }
      if (!W) { // she is whole: put the bags back where the model keeps them (and the root level)
        model.root.rotation.z = 0;
        if (r.moved) { for (const [node, x, y, z, rz] of r.base) { node.position.set(x, y, z); node.rotation.z = rz; } r.moved = false; r.boom = false; }
        return;
      }
      const t = Math.max(0, fin(W.t)), f = sh.pose && sh.pose.f === -1 ? -1 : 1, root = model.root;
      // base world positions of the bags (the root has just been placed, nothing of the wreck is applied yet)
      root.updateMatrixWorld(true);
      const baseWorld = r.base.map(([node, x, y, z]) => { node.position.set(x, y, z); node.updateMatrixWorld(true); return node.getWorldPosition(new THREE.Vector3()); });
      // the gondola: falls away and tips nose-down (the root's own z rotation is nose-down for both facings: the yaw about y mirrors it)
      root.position.x += -40 * t;
      root.position.y -= 130 * t * t;
      root.rotation.z = -0.1 * t * t;
      root.updateMatrixWorld(true);
      // the bags: slower and a little apart
      r.base.forEach(([node, x, y, z, rz], i) => {
        _w.set(baseWorld[i].x - 15 * t, baseWorld[i].y - 40 * t * t, baseWorld[i].z);
        node.parent.worldToLocal(_p.copy(_w));
        node.position.copy(_p);
        node.rotation.z = rz + (-0.05 * t + 0.1 * t * t); // (the bag's own world turn is -0.05 t: take away what the root already turned)
        node.updateMatrixWorld(true);
      });
      r.moved = true;
      stats.ships++;
      // fire, smoke and splinters (the particles' own seeded random numbers: the view never draws from Math.random)
      const p = P();
      if (p) {
        const cx = root.position.x, cy = root.position.y + 90;
        if (!r.boom) { r.boom = true; try { p.explosion(cx, cy, 120, 2.4, { wood: true, smoke: true }); for (const wp of baseWorld) p.explosion(wp.x - 15 * t, wp.y, 100, 1.4, { smoke: true }); } catch { /* (the particles are off) */ } }
        if (t < (Number(config.WRECK && config.WRECK.TIME) || 8) - 0.5) {
          r.acc += dt * 26; r.acc2 += dt * 10;
          for (let k = 0; k < 3 && r.acc >= 1; k++, r.acc -= 1) p.burst('fire', cx, cy - 30, 60, 1, { size: [60, 110], size1: 0.3, life: [0.35, 0.6], speed: [10, 60], up: [30, 120], area: 170, drag: 1.4 });
          for (let k = 0; k < 3 && r.acc2 >= 1; k++, r.acc2 -= 1) {
            p.burst('smoke', cx, cy, 50, 1, { size: [80, 140], size1: 2, life: [1.4, 2.4], color: '#3a3636', alpha: 0.8, speed: [10, 40], up: [30, 80], area: 180 });
            for (const wp of baseWorld) p.burst('smoke', wp.x - 15 * t, wp.y - 40 * t * t, 50, 1, { size: [70, 120], size1: 2, life: [1.2, 2], color: '#4a4440', alpha: 0.75, speed: [10, 40], up: [20, 70], area: 120 });
          }
          if (r.acc > 4) r.acc = 0;
          if (r.acc2 > 4) r.acc2 = 0;
        }
      }
      void f;
    },
  };
}
