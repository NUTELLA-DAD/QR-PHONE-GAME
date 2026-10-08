// THROWABLE BALLAST AND CARGO (B.6, config.CROSS.CARGO). Sandbags and crates come off a rack (a build part; a finite stock that grows back), coal comes from the bunker as ever. They are carried
// (player.carry = 'sandbag' | 'crate' | 'coal') and weigh on the ship while they are in your hands (balance.js).
//   THROW      ATTACK on an open-air deck throws what you carry in an arc along the stick: a WORLD object (state.thrown: x, y, vx, vy in map coordinates, like a shell). Crossing the deck of ANY ship from
//              above it LANDS there and becomes a LIVE LOAD at that ship-space x (ship.state.loads: { kind, w, d, x }): balance.js counts it, so the ship tips toward it and answers more slowly.
//   SHOVEL     a load is cleared by holding Action beside it (SHOVEL_TIME): "SHOVEL IT OVERBOARD" is a job arrow on the phones and a bot job for the ship it lies on. It goes over the rail and falls.
//   DUMP       at the rail (the end of an open deck) Action drops a carried sandbag or crate over the side for a quick LIFT: a push upward at that end and a little extra gas in the bag.
//   DROP       over the open bomb bay doors, Action lets a carried sandbag or crate fall through the belly onto whatever is below (it falls as a thrown load does).
//   const cargo = createCargo({ state, ship, air, puff, phoneFx, stat })      per ship (state = her context)
//   stepThrown(world, dt, puff)                                               once per world step: flies the thrown loads and lands them on a deck
import { config } from '../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { applyForce } from './forces.js';
import { pop } from './popups.js';

const C = () => config.CROSS.CARGO;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const cargoItem = (kind) => (kind ? C().ITEMS[kind] || null : null); // { w, label } of a carried kind, or null
export const isStocked = (kind) => kind === 'sandbag' || kind === 'crate'; // the kinds a rack hands out (coal comes from the bunker)
let seq = 0;

export function createCargo({ state, ship, air, puff, phoneFx, stat }) {
  const L = ship.layout;
  const world = ship.world;
  const loads = () => (state.loads ||= []);
  const stockOf = () => (state.rackStock ||= {});
  const keyOf = (r) => `${r.p}@${r.x}`;
  const worldAt = (x, y) => ({ x: toWorldX(ship, x), y: toWorldY(ship, y) });
  const label = (kind) => (cargoItem(kind) || { label: kind }).label.toLowerCase();

  // A thrown / dropped / dumped load in the sky. ghost: it is only falling away (overboard), it lands on nothing.
  const spawn = (kind, x, y, vx, vy, extra = {}) => {
    const list = (world.thrown ||= []);
    list.push({ id: ++seq, kind, x, y, vx, vy, t: 0, from: ship.id, spin: (Math.random() - 0.5) * 8, rot: 0, ...extra });
    if (list.length > 40) list.shift();
  };

  // ---- racks: a finite stock that grows back ----
  const rackReady = (r) => { const s = stockOf(); s[keyOf(r)] ??= C().STOCK; return s[keyOf(r)]; };
  // Action at a sandbag / crate rack: take one (false: the rack is empty), or put back what you hold.
  const rack = (player, r) => {
    const put = player.carry === r.kind;
    if (put) { stockOf()[keyOf(r)] = Math.min(C().STOCK, rackReady(r) + 1); player.carry = null; return true; }
    if (rackReady(r) < 1) { phoneFx(player, `The ${label(r.kind)} rack is empty - it fills again in a while`, [40]); return false; }
    stockOf()[keyOf(r)] -= 1;
    player.carry = r.kind;
    return true;
  };

  // ---- throwing ----
  const outsideNow = (p) => (!C().OPEN_ONLY || (p.d != null && air.outsideAt(p.d, p.x)));
  // Does ATTACK throw what this player carries? (Bots only on their own say-so: p.throwNow.) `foeNear`: something to shove, which still comes first.
  const wantsThrow = (p, foeNear) => !!cargoItem(p.carry) && (!p.bot || p.throwNow) && !p.fly && p.conn == null && !p.lock && p.d != null && outsideNow(p) && !foeNear();
  const throwItem = (p) => {
    const k = C(), kind = p.carry, f = ship.pose.f;
    let dx = (p.jx || 0) * f, dy = p.jy || 0; // (the stick is along the ship; the load flies along the world)
    if (Math.hypot(dx, dy) < 0.3) { dx = (p.face || 1) * f; dy = 0; }
    const m = Math.hypot(dx, dy) || 1;
    dx /= m;
    dy = dy / m - k.THROW_UP;
    const n = Math.hypot(dx, dy) || 1;
    const o = worldAt(p.x, p.y - 70 - (p.jz || 0));
    spawn(kind, o.x, o.y, (dx / n) * k.THROW_SPEED + ship.pose.vx, (dy / n) * k.THROW_SPEED + ship.pose.vy, { owner: p.id });
    p.carry = null;
    p.face = dx < 0 ? -1 : 1; // (face is along the ship on a deck: dx is the world's)
    p.face *= f;
    p.atkCd = 0.5;
    p.swingT = performance.now();
    p.throwNow = false;
    stat(p, 'thrown');
    puff(o.x, o.y, '#d9cbb0', 3);
  };

  // ---- landing (called by stepThrown for the ship a load falls onto) ----
  const land = (item, d, x) => {
    const pl = L.platforms[d], w = cargoItem(item.kind) ? cargoItem(item.kind).w : 5;
    const list = loads();
    const ld = { id: item.id, kind: item.kind, w, d, x: clamp(x, pl.x0 + 12, pl.x1 - 12), t: 0, from: item.from, owner: item.owner, prog: 0 };
    list.push(ld);
    while (list.length > C().MAX_LOADS) shed(list.shift(), null);
    const o = worldAt(ld.x, pl.y - 10);
    puff(o.x, o.y, '#d9cbb0', 8);
    pop(state, o.x, o.y - 60, 'THUD!', '#e8c25a', 1);
    state.sfxQ.push(['hit']);
    state.ship.shake = Math.max(state.ship.shake || 0, 0.25);
    if (item.from !== ship.id) { state.ev.warn = 2.5; state.ev.warnText = `${label(item.kind).toUpperCase()} LANDED ON THE ${(pl.name || 'DECK').toUpperCase()}! SHOVEL IT OFF`; }
    return ld;
  };

  // A load leaves the deck: over the rail, falling away.
  const shed = (ld, by) => {
    const pl = L.platforms[ld.d], mid = L.refPoint ? L.refPoint.x : (pl.x0 + pl.x1) / 2, dir = ld.x < mid ? -1 : 1;
    const o = worldAt(ld.x, pl.y - 30);
    spawn(ld.kind, o.x, o.y, dir * ship.pose.f * 240 + ship.pose.vx, -260 + ship.pose.vy, { ghost: true });
    if (by) puff(o.x, o.y, '#d9cbb0', 6);
  };
  const shovel = (ld, by) => {
    const list = loads(), i = list.indexOf(ld);
    if (i < 0) return;
    list.splice(i, 1);
    shed(ld, by);
  };

  // ---- dump (at the rail) and drop (from the bomb bay) ----
  const railOf = (p) => {
    const pl = p.d != null ? L.platforms[p.d] : null;
    if (!pl || !air.outsideAt(p.d, p.x)) return null;
    const near = Math.min(p.x - pl.x0, pl.x1 - p.x);
    return near <= C().DUMP_REACH ? { pl, side: p.x - pl.x0 < pl.x1 - p.x ? -1 : 1 } : null;
  };
  const dumpAction = (p) => (p.carry === 'sandbag' || p.carry === 'crate') && railOf(p) ? { type: 'dump', label: `Dump the ${label(p.carry)} (lift!)` } : null;
  const dump = (p) => {
    const k = C(), rail = railOf(p);
    if (!rail || !cargoItem(p.carry)) return;
    const o = worldAt(p.x + rail.side * 30, p.y - 50);
    spawn(p.carry, o.x, o.y, rail.side * ship.pose.f * 200 + ship.pose.vx, -140 + ship.pose.vy, { ghost: true });
    p.carry = null;
    state.ship.gas = Math.min(100, state.ship.gas + k.DUMP_GAS);
    applyForce(state, { x: p.x, y: rail.pl.y - 40, fx: 0, fy: -(k.DUMP_KICK * config.FORCES.REF_MASS) / Math.max(60, (state.balance && state.balance.mass) || config.FORCES.REF_MASS), impulse: true, linear: true, source: 'dump' });
    puff(o.x, o.y, '#d9cbb0', 6);
    pop(state, o.x, o.y - 50, 'WHOOSH!', '#9fe8ff', 0.9);
    stat(p, 'dumped');
    phoneFx(p, 'Ballast away - she lifts!', [30]);
  };
  const dropAction = (p) => ((p.carry === 'sandbag' || p.carry === 'crate') && L.bombBay ? { type: 'dropcargo', label: `Drop the ${label(p.carry)}!` } : null);
  const drop = (p) => {
    const kind = p.carry;
    if (!cargoItem(kind) || !L.bombBay) return;
    const o = worldAt(L.bombBay.x, L.bombBay.y + 20);
    state.bombBay.open = Math.max(state.bombBay.open || 0, 1);
    spawn(kind, o.x, o.y, ship.pose.vx, ship.pose.vy + C().DROP_SPEED, { owner: p.id });
    p.carry = null;
    stat(p, 'thrown');
    phoneFx(p, `The ${label(kind)} falls away...`, [30]);
  };

  // ---- shovelling ----
  const shovelAction = (p, here) => {
    const ld = loads().find((o) => here(o, 70));
    return ld ? { type: 'shovel', obj: ld, hold: true, time: C().SHOVEL_TIME, label: `Shovel the ${label(ld.kind)} overboard` } : null;
  };

  const update = (dt) => {
    for (const ld of loads()) ld.t += dt;
    if (!state.rackStock) return;
    const k = C();
    for (const key of Object.keys(state.rackStock)) state.rackStock[key] = Math.min(k.STOCK, state.rackStock[key] + dt / k.REFILL);
  };

  return { rack, rackReady, wantsThrow, throwItem, land, shed, shovel, shovelAction, dumpAction, dump, dropAction, drop, update, loads, spawn };
}

// The stick (in world terms: dx toward the target's side, dy down is positive) that throws a load from world point `o` of `ship` onto a deck of `target`, or null. Pure: the same arc as throwItem.
export function solveThrow(ship, o, target, side) {
  const k = config.CROSS.CARGO, dt = 1 / 30;
  const decks = target.layout.platforms.map((pl) => { const a = toWorldX(target, pl.x0), b = toWorldX(target, pl.x1); return { lo: Math.min(a, b), hi: Math.max(a, b), y: toWorldY(target, pl.y) }; });
  let best = null;
  for (let deg = -80; deg <= 60; deg += 5) {
    const dx = side * Math.cos((deg * Math.PI) / 180), dy0 = Math.sin((deg * Math.PI) / 180) - k.THROW_UP, n = Math.hypot(dx, dy0);
    let x = o.x, y = o.y, vx = (dx / n) * k.THROW_SPEED + ship.pose.vx, vy = (dy0 / n) * k.THROW_SPEED + ship.pose.vy;
    for (let t = 0; t < k.FLIGHT; t += dt) {
      vy += k.GRAVITY * dt;
      const py = y;
      x += vx * dt;
      y += vy * dt;
      if (vy <= 0) continue;
      const mv = target.pose.vx * (t + dt), mvy = target.pose.vy * (t + dt);
      let hit = null;
      for (const D of decks) if (py < D.y + target.pose.vy * t && y >= D.y + mvy && x >= D.lo + mv && x <= D.hi + mv) hit = Math.min(x - D.lo - mv, D.hi + mv - x);
      if (hit != null) { if (hit > 30 && (!best || hit > best.margin)) best = { jx: dx, jy: Math.sin((deg * Math.PI) / 180), margin: hit, t }; break; }
    }
  }
  return best;
}

// ---- the sky: thrown loads fall under gravity and land on the first deck of any ship they cross from above ----
export function stepThrown(world, dt, puff) {
  const list = world.thrown;
  if (!list || !list.length) return;
  const k = config.CROSS.CARGO;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    it.t += dt;
    const x0 = it.x, y0 = it.y;
    it.vy += k.GRAVITY * dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    it.rot += it.spin * dt;
    let landed = false;
    if (!it.ghost && it.vy > 0) {
      for (const sh of world.ships) {
        if (sh.state.down > 0 || sh.ctx.wreck || !sh.sim.cargo) continue;
        const sx = toShipX(sh, it.x), psy = toShipY(sh, y0), sy = toShipY(sh, it.y);
        let best = -1;
        sh.layout.platforms.forEach((pl, d) => { if (sx >= pl.x0 - 8 && sx <= pl.x1 + 8 && psy < pl.y && sy >= pl.y && (best < 0 || pl.y < sh.layout.platforms[best].y)) best = d; });
        if (best >= 0) { sh.sim.cargo.land(it, best, sx); landed = true; break; }
      }
    }
    if (landed || it.t > k.FLIGHT) {
      if (!landed && !it.ghost) puff(it.x, it.y, '#ffffff', 5); // (lost in the sky: a splash of cloud)
      list.splice(i, 1);
    }
    void x0;
  }
}
