// THE CINDER DRAKE'S BREATH (BOSSES.md 2.2, C.6a): a cone of flame that sweeps a ship, by the same fire model as the flamethrower (flame.js), but turned on the crew's own ship.
//   coneAt(from, ang)                 the cone of config.CREATURES.DRAKE.BREATH: { x, y, ang, half, len }
//   breathBurn(state, cr, ship, cone, dt)   one TICK of it on `ship`: what the cone crosses is lit by flammability (fire.js: wood catches, armour plate never does, the coal blazes), a hydrogen bag in it is
//                                     scorched until it explodes (hydrogen.js), a gasbag gets holes, the hull is scorched (less on plate) and every crewman in it loses hearts. A hull stops the cone PENETRATE px in.
//   warnCrew(state, ship, test, text) the phone half of the telegraph: a buzz and a line for each person who passes test(player)
// The numbers are config.CREATURES.DRAKE.BREATH. Node-safe (no DOM).
import { config } from '../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { armourOn } from './fireModel.js';
import { hurt, knockOut } from './health.js';
import { shipOf } from './ships.js';
import { pop } from './popups.js';

const BR = () => config.CREATURES.DRAKE.BREATH;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// Is world point (x, y) in the cone (pad: the size of the thing at it)?
export function inCone(c, x, y, pad = 0) {
  const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
  if (d > c.len + pad) return false;
  if (d < 12) return true;
  return Math.abs(angleDiff(Math.atan2(dy, dx), c.ang)) <= c.half + Math.atan2(pad, Math.max(d, 40));
}
export const coneAt = (x, y, ang, scale = 1, pen = null) => ({ x, y, ang, half: BR().HALF, len: BR().LEN * scale, ...(pen !== null ? { pen } : {}) });

// The phone half of a telegraph: whoever passes test(player) feels it (hooks.phoneFx is the world's buzz and toast).
export function warnCrew(state, cr, ship, test, text, buzz = [120, 60, 120, 60, 200]) {
  const fx = cr.hooks && cr.hooks.phoneFx;
  if (!fx) return 0;
  let n = 0;
  for (const p of Object.values(state.players)) {
    if (p.bot || p.fly || p.fall || p.d == null || shipOf(state, p) !== ship || !ship.layout.platforms[p.d] || !test(p)) continue;
    fx(p, text, buzz);
    n++;
  }
  return n;
}

// One tick of the cone on a ship. Returns what it did: { decks (spots lit), bags, hearts, hull }.
export function breathBurn(state, cr, ship, cone, dt, budget = null) { // (budget: { fires } the most fires the whole breath may still start, shared by its ticks)
  const B = BR(), F = config.FLAME;
  const out = { decks: 0, bags: 0, hearts: 0, hull: false, plated: 0 };
  const dx = Math.cos(cone.ang), dy = Math.sin(cone.ang), rng = cr.hooks.rng;
  const ft = ship.ctx.fireStats, sim = ship.sim;
  if (!sim || ship.ctx.wreck) return out;
  state.flashes.push({ x: cone.x + dx * cone.len * 0.3, y: cone.y + dy * cone.len * 0.3, ang: cone.ang, t: dt * 1.6, color: '#ffb347', size: F.GLOW * 1.8, glow: true });
  let limit = Infinity; // how far along the cone the first hull stops it (plus PENETRATE)
  const decks = new Map(), bags = new Map();
  let hull = false, plated = false;
  const step = 36, n = Math.ceil(cone.len / step), spread = Math.tan(cone.half) * 0.8, px = -dy, py = dx;
  for (let k = 1; k <= n && k * step <= limit; k++) {
    const r = k * step;
    for (const lat of [-1, 0, 1]) {
      const x = cone.x + dx * r + px * lat * spread * r, y = cone.y + dy * r + py * lat * spread * r;
      const sx = toShipX(ship, x), sy = toShipY(ship, y);
      if (!sim.hitsShip(sx, sy)) continue;
      if (!hull) limit = r + (cone.pen ?? B.PENETRATE);
      hull = true;
      const bag = sim.onGasbag(sx, sy);
      if (bag >= 0) { if (!bags.has(bag)) bags.set(bag, { sx, sy }); continue; }
      const d = sim.roomPlatformAt(sx, sy);
      if (d !== null) {
        const key = d + ':' + Math.round(sx / 50);
        if (!decks.has(key)) decks.set(key, { d, x: sx });
        if (armourOn(ship.layout, d, sx)) plated = true;
      }
    }
  }
  limit = hull ? limit : Infinity;
  if (hull) { // the hull is scorched (less on plate)
    out.hull = true;
    sim.damageHull(B.HULL_RATE * dt * (plated && !decks.size ? config.ARMOUR.POWER_MUL : 1));
    cr.hooks.puff(cone.x + dx * Math.min(cone.len, limit - (cone.pen ?? B.PENETRATE)), cone.y + dy * Math.min(cone.len, limit - (cone.pen ?? B.PENETRATE)) - 10, '#8a7f73', 1);
  }
  for (const { d, x } of decks.values()) {
    if (rng() >= B.IGNITE_RATE * dt) continue; // (a spot that cannot burn - plate - never catches whatever the roll)
    if (budget && budget.fires <= 0) break;
    const ig = sim.fireSys.igniteChance(d, x);
    if (ig <= 0) { if (ft) ft.plated++; out.plated++; continue; }
    if (rng() < Math.min(1, ig) && sim.fireSys.ignite(d, x + (rng() - 0.5) * 60, 'flame')) { out.decks++; if (budget) budget.fires--; if (ft) ft.drake = (ft.drake || 0) + 1; }
  }
  for (const [bag, p] of bags) {
    if (sim.hydrogen) sim.hydrogen.scorch(bag, config.GASES.HYDROGEN.FLAME_RATE * B.HYDRO_MUL * dt); // (a hydrogen bag in the cone catches: hydrogen.js)
    if (rng() >= B.HOLE_RATE * dt || ship.ctx.gasHoles.length >= config.GAS.MAX_HOLES) continue;
    ship.ctx.gasHoles.push(sim.gasHoleAt(p.sx, p.sy, bag));
    out.bags++;
    cr.hooks.puff(toWorldX(ship, p.sx), toWorldY(ship, p.sy), '#6b6258', 4);
    pop(state, toWorldX(ship, p.sx), toWorldY(ship, p.sy - 80), 'bigHit', '#ff7b00', 1);
  }
  for (const q of Object.values(state.players)) { // the crew in the flame
    if (shipOf(state, q) !== ship || q.fall || q.fly || q.conn != null || q.d == null || q.ko > 0 || q.enemy || !ship.layout.platforms[q.d]) continue;
    if ((q.breathCd = (q.breathCd || 0) - dt) > 0) continue;
    const qx = toWorldX(ship, q.x), qy = toWorldY(ship, q.y - 40 - (q.jz || 0));
    if (!inCone(cone, qx, qy, B.CREW_REACH) || Math.hypot(qx - cone.x, qy - cone.y) > limit) { q.breathCd = 0; continue; }
    const res = hurt(q, B.CREW_HEARTS, { cause: 'fire' });
    if (!res) { q.breathCd = 0.1; continue; }
    q.breathCd = B.CREW_EVERY;
    if (res === 'ko') knockOut(q, config.RAIDERS.KO_TIME);
    out.hearts++;
    if (ft) ft.flameHearts = (ft.flameHearts || 0) + 1;
    cr.hooks.puff(qx, qy, '#ff7b00', 6);
    if (sim.fireSys && rng() < 0.5) sim.fireSys.ignite(q.d, q.x, 'flame'); // a burning man lights the deck under him (flammability decides)
  }
  state.ship.shake = Math.max(state.ship.shake || 0, B.SHAKE * (out.hull ? 1 : 0.4));
  return out;
}
