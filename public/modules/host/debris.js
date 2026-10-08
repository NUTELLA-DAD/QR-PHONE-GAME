// DEBRIS (Phase S.5i): the parts that broke off a ship tumble away as pieces of the world. Each piece is a chunk of the ship's own picture (shipArt.js snapshot, clipped to the hole the part left) that
// falls, spins, smokes and is gone after a few seconds; the ship herself carries on without it (shipSim.js breakOff). Node-safe: no DOM here, the drawing is debrisArt.js.
//   world.debris    [{ ship, pic, bag, clips, box, cx, cy, w, h, x, y, vx, vy, rot, spin, f, t, life, burn }]   x, y = where the piece's middle is in the WORLD
//   spawn(ship, plan, pics, opts)   one piece for each of plan.pieces (breakOff.js planBreak); pics[i] is the picture of piece i (or nothing); opts.origin = the blast centre in ship coordinates
//   update(dt)                      gravity, spin, air drag, smoke; pieces expire after their life
import { config } from '../../config.js';
import { toWorldX, toWorldY } from './pose.js';

export function createDebris({ world, puff }) {
  const list = (world.debris = []);
  const C = () => config.BREAKOFF.DEBRIS;

  const spawn = (ship, plan, pics = [], opts = {}) => {
    const D = C(), p = ship.pose;
    const o = opts.origin || { x: ship.layout.midPoint.x, y: ship.layout.midPoint.y };
    plan.pieces.forEach((pc, i) => {
      const cx = (pc.box.x0 + pc.box.x1) / 2, cy = (pc.box.y0 + pc.box.y1) / 2;
      let dx = cx - o.x, dy = cy - o.y;
      const len = Math.hypot(dx, dy);
      if (len < 30) { dx = (Math.random() - 0.5) * 2; dy = 0.4; } else { dx /= len; dy /= len; }
      const toward = (opts.blast ? 1 : 0.55) * D.SPREAD * (0.5 + Math.random() * 0.7); // (a blast throws the pieces apart, a clipped limb mostly just drops)
      list.push({
        ship, pic: pics[i] || null, bag: !!pc.ellipse, clips: pc.clips, box: pc.box, cx, cy, w: pc.box.x1 - pc.box.x0, h: pc.box.y1 - pc.box.y0,
        x: toWorldX(ship, cx), y: toWorldY(ship, cy),
        vx: p.vx + dx * p.f * toward, vy: p.vy + dy * toward - (opts.blast ? 120 : 0),
        rot: p.pitch || 0, spin: (Math.random() < 0.5 ? -1 : 1) * D.SPIN * (0.4 + Math.random() * 0.6) * (opts.blast ? 1 : 0.6), f: p.f,
        t: 0, life: D.LIFE * (0.8 + Math.random() * 0.4), burn: !!opts.blast && Math.random() < D.FIRE, team: ship.team ? ship.team.id : null,
      });
    });
    while (list.length > D.MAX) list.shift();
  };

  const update = (dt) => {
    const D = C();
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      d.t += dt;
      if (d.t >= d.life) { list.splice(i, 1); continue; }
      d.vy += D.GRAVITY * dt;
      d.vx -= d.vx * Math.min(1, 0.35 * dt); // (the air slows a piece sideways)
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.spin * dt;
      const size = Math.max(60, d.w) / 100; // smoke: more from a bigger piece, black; a burning piece also drops embers
      if (Math.random() < D.SMOKE * size * dt * 6) puff(d.x + (Math.random() - 0.5) * d.w * 0.6, d.y + (Math.random() - 0.5) * d.h * 0.6, d.burn ? '#3b3b3b' : '#8a7f72', 1);
      if (d.burn && Math.random() < dt * 8) puff(d.x + (Math.random() - 0.5) * d.w * 0.5, d.y + (Math.random() - 0.5) * d.h * 0.5, Math.random() < 0.5 ? '#ff8c42' : '#ffd23f', 1);
    }
  };

  return { list, spawn, update, clear: () => { list.length = 0; } };
}
