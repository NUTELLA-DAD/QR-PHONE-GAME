// HARPOONING A GIANT CREATURE (BOSSES.md 3.1, C.2). The harpoon gun (weapons.js -> towing.js fireHarpoon) can hook a creature PART: the same spring as a tow (towing.js step) between the ship's gun and
// the part's own point, with the pull shared out by weight, since a creature is heavy: the ship takes config.CREATURES.TOW.SHIP_SHARE of it and is hauled in fast, the creature the rest and is hauled slowly
// (cr.tvx px/s along the sky, at most TOW.CREATURE_MAX). While a line holds it the creature stops swimming along beside the ship (creatureSystem.js: cr.hooked). C.3 uses this for "tow it onto the rocks".
//   creatureRay(state, o, ang, range) -> { part, seg, d, x, y } | null       the first part along a ray from world point o (the harpoon's aim)
//   creatureLatch(state, ship, hit, from, gun, player) -> tow                 the line flies, then holds (cr.harpoons)
//   stepHarpoons(state, cr, dt)                                                once a step, from creatureSystem.update
//   cutNear(state, ship, player) -> bool                                       a sword cuts the line where it is made fast to this ship
//   tow = { ship, part, seg, lu, lv (where on the segment), from {x, y} (ship coordinates), fly, t, len, minLen, a {x, y}, b {x, y} (world ends, for the TV), tension, d, stat: { ship, creature } }
import { config } from '../../config.js';
import { hitInfo } from './creature.js';
import { toWorldX, toWorldY, driveGain } from './pose.js';
import { applyForce } from './forces.js';
import { pop } from './popups.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function creatureRay(state, o, ang, range) {
  const cr = state.creature;
  if (!cr || cr.mode !== 'idle') return null;
  const T = config.CREATURES.TOW, c = Math.cos(ang), s = Math.sin(ang);
  for (let d = 40; d <= range; d += 30) {
    const x = o.x + c * d, y = o.y + s * d, hit = hitInfo(cr, x, y, T.HIT_R);
    if (hit) return { part: hit.part, seg: hit.seg, d, x, y };
  }
  return null;
}

export function creatureLatch(state, ship, hit, from, gun, player) {
  const cr = state.creature, T = config.CREATURES.TOW, H = config.GUN_TYPES.harpoon;
  const sg = hit.part.segs[hit.seg], c = Math.cos(sg.ang), sn = Math.sin(sg.ang), rx = hit.x - sg.x, ry = hit.y - sg.y;
  const tow = {
    ship, part: hit.part, seg: hit.seg, lu: rx * c + ry * sn, lv: -rx * sn + ry * c,
    from: { x: from.x, y: from.y }, fly: hit.d / H.SPEED + 0.05, t: 0, len: Math.max(T.MIN_LEN, hit.d), minLen: T.MIN_LEN,
    by: player ? player.id : null, tension: 0, d: hit.d, a: { x: hit.x, y: hit.y }, b: { x: hit.x, y: hit.y }, stat: { ship: 0, creature: 0 },
  };
  cr.harpoons.push(tow);
  state.ev.warn = 2.2;
  state.ev.warnText = 'HARPOONED ' + String(cr.name || 'THE CREATURE') + '!';
  void gun;
  return tow;
}

function cut(state, cr, tow, text = 'THE HARPOON LINE IS CUT!') {
  const i = cr.harpoons.indexOf(tow);
  if (i < 0) return;
  cr.harpoons.splice(i, 1);
  cr.hooks.puff((tow.a.x + tow.b.x) / 2, (tow.a.y + tow.b.y) / 2, '#d8c79a', 10);
  state.sfxQ.push(['hit']);
  if (text) { state.ev.warn = 2.5; state.ev.warnText = text; }
}

function shove(sh, dx, dy) {
  const per = driveGain(sh);
  if (per) sh.ctx.ship.speed += dx / per;
  sh.pose.vy += dy;
}

export function stepHarpoons(state, cr, dt) {
  const T = config.CREATURES.TOW, H = config.GUN_TYPES.harpoon, TW = config.CROSS.TOW;
  cr.hooked = false;
  for (let i = cr.harpoons.length - 1; i >= 0; i--) {
    const t = cr.harpoons[i], ship = t.ship, part = t.part;
    const s = part.segs[Math.min(t.seg, part.segs.length - 1)];
    if (!state.ships.includes(ship) || ship.state.down > 0 || ship.ctx.wreck || cr.mode !== 'idle' || part.dead || !s || t.seg >= part.segs.length) { cut(state, cr, t, ''); continue; }
    const c = Math.cos(s.ang), sn = Math.sin(s.ang);
    t.b = { x: s.x + c * t.lu - sn * t.lv, y: s.y + sn * t.lu + c * t.lv };
    t.a = { x: toWorldX(ship, t.from.x), y: toWorldY(ship, t.from.y) };
    if (t.fly > 0) { // the harpoon is still in the air
      t.t += dt;
      if (t.t >= t.fly) { t.fly = 0; cr.hooks.puff(t.b.x, t.b.y, '#ffe9a8', 5); state.sfxQ.push(['clang', true]); }
      continue;
    }
    cr.hooked = true;
    const dx = t.b.x - t.a.x, dy = t.b.y - t.a.y, d = Math.hypot(dx, dy) || 1;
    t.len = Math.max(t.minLen, t.len - H.REEL * dt);
    t.d = d;
    t.tension = 0;
    if (d > H.SNAP) { cut(state, cr, t, 'THE HARPOON LINE SNAPS!'); continue; }
    if (d <= t.len) continue;
    const nx = dx / d, ny = dy / d, stretch = d - t.len;
    const va = { x: ship.pose.vx, y: ship.pose.vy }, vb = { x: cr.tvx || 0, y: 0 };
    const sep = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
    const acc = clamp(H.K * stretch + TW.DAMP * Math.max(0, sep), 0, H.MAX_ACC);
    t.tension = clamp(stretch / (H.SNAP - t.len), 0, 1);
    const sa = T.SHIP_SHARE, sb = 1 - sa;
    shove(ship, nx * acc * sa * dt, ny * acc * sa * dt);
    t.stat.ship += acc * sa * dt;
    t.stat.creature += acc * sb * dt;
    cr.tvx = clamp((cr.tvx || 0) - nx * acc * sb * dt, -T.CREATURE_MAX, T.CREATURE_MAX); // (it is hauled toward her, slowly)
    const F = config.FORCES.TETHER_ACC * TW.TORQUE * (Math.min(stretch, 400) / 100);
    applyForce(ship.ctx, { x: t.from.x, y: t.from.y, fx: nx * ship.pose.f * F * sa * 2, fy: ny * F * sa * 2, source: 'tether' });
  }
  if (cr.hooked) cr.stats.hauled = (cr.stats.hauled || 0) + Math.abs(cr.tvx || 0) * dt; // (px it has been hauled in all)
  cr.tvx = (cr.tvx || 0) * Math.exp(-T.CREATURE_DRAG * dt);
}

export function cutNear(state, ship, p) {
  const cr = state.creature;
  if (!cr || !cr.harpoons || !cr.harpoons.length) return false;
  const pl = ship.layout.platforms[p.d];
  if (!pl) return false;
  for (const t of cr.harpoons) {
    if (t.ship !== ship || t.fly > 0 || Math.abs(t.from.y - pl.y) > 140 || Math.abs(t.from.x - p.x) > config.CREATURES.TOW.CUT_REACH) continue;
    cut(state, cr, t);
    pop(state, t.a.x, t.a.y - 80, 'cut', '#ffffff', 0.8);
    return true;
  }
  return false;
}
