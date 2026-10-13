// THROWABLE BALLAST AND CARGO (B.6, config.CROSS.CARGO). Sandbags and crates come off a rack (a build part; a finite stock that grows back), coal comes from the bunker as ever. They are carried
// (player.carry = 'sandbag' | 'crate' | 'coal') and weigh on the ship while they are in your hands (balance.js).
//   THROW      ATTACK on an open-air deck throws what you carry in an arc along the stick: a WORLD object (state.thrown: x, y, vx, vy in map coordinates, like a shell). Crossing the deck of ANY ship from
//              above it LANDS there and becomes a LIVE LOAD at that ship-space x (ship.state.loads: { kind, w, d, x }): balance.js counts it, so the ship tips toward it and answers more slowly.
//   SHOVEL     a load is cleared by holding Action beside it (SHOVEL_TIME): "SHOVEL IT OVERBOARD" is a job arrow on the phones and a bot job for the ship it lies on. It goes over the rail and falls.
//   DUMP       at the rail (the end of an open deck) Action drops a carried sandbag or crate over the side for a quick LIFT: a push upward at that end and a little extra gas in the bag.
//   DROP       over the open bomb bay doors, Action lets a carried sandbag or crate fall through the belly onto whatever is below (it falls as a thrown load does).
//   const cargo = createCargo({ state, ship, air, puff, phoneFx, stat })      per ship (state = her context)
//   stepThrown(world, dt, puff)                                               once per world step: flies the thrown loads and lands them on a deck
// SCRAP (LOOP.md G1, scrap.js): a bundle is one more cargo kind. It falls from the sky on a chute (item.chute: low gravity, drifts with the wind, a 25 s life, lands on any ship's deck as a LOAD), is picked up from the deck
// with Action, stowed in the hold bin with Action (stowAction), taken off a gunship's hulk (hulkAction) and dumped at the rail like a sandbag. A bundle on a hookshot's line is item.haul (hookshot.js moves it).
import { config } from '../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { applyForce } from './forces.js';
import { pop } from './popups.js';
import { inGap } from './shipBuild.js';
import { creatureCargo } from './creatureSystem.js';
import { scrapOn, scrapNote, holdSpot, holdCount, holdWeight } from './scrap.js';
import { chestStowAction } from './treasure.js';
import { windSpeed } from './sails.js';
import { inRock } from './course.js';

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
    if (item.kind === 'scrap') { // (SCRAP: a bundle lands softly, and it is welcome)
      puff(o.x, o.y, '#e8c25a', 6);
      pop(state, o.x, o.y - 70, item.hooked ? 'HOOKED!' : 'SCRAP!', '#ffd23f', 1);
      state.sfxQ.push(['bell']);
      ld.scrap = true;
      scrapNote(world, item.hooked ? 'hooked' : 'landed', item.owner != null ? world.players[item.owner] : null, { ship });
      return ld;
    }
    puff(o.x, o.y, '#d9cbb0', 8);
    pop(state, o.x, o.y - 60, 'THUD!', '#e8c25a', 1);
    state.sfxQ.push(['hit']);
    state.ship.shake = Math.max(state.ship.shake || 0, 0.25);
    if (item.from !== ship.id) { state.say('info', `${label(item.kind).toUpperCase()} LANDED ON THE ${(pl.name || 'DECK').toUpperCase()}! SHOVEL IT OFF`, null, 2.5, { deck: d }); }
    return ld;
  };

  // A load simply lying on a deck (GOING DOWN!: the cargo that shakes loose as she falls, goingDown.js): no landing, no thud.
  const place = (kind, d, x) => {
    const pl = L.platforms[d], list = loads();
    const ld = { id: ++seq, kind, w: cargoItem(kind) ? cargoItem(kind).w : 5, d, x: clamp(x, pl.x0 + 12, pl.x1 - 12), t: 0, from: ship.id, owner: null, prog: 0 };
    list.push(ld);
    while (list.length > C().MAX_LOADS) shed(list.shift(), null);
    return ld;
  };

  // A load leaves the deck: over the rail, falling away.
  const shed = (ld, by) => {
    const pl = L.platforms[ld.d], mid = L.refPoint ? L.refPoint.x : (pl.x0 + pl.x1) / 2, dir = ld.x < mid ? -1 : 1;
    const o = worldAt(ld.x, pl.y - 30);
    spawn(ld.kind, o.x, o.y, dir * ship.pose.f * 240 + ship.pose.vx, -260 + ship.pose.vy, { ghost: true });
    if (by) puff(o.x, o.y, '#d9cbb0', 6);
    if (ld.kind === 'scrap') scrapNote(world, 'lost', by, { ship });
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
  const ballastOf = (p) => p.carry === 'sandbag' || p.carry === 'crate' || (p.carry === 'scrap' && !p.bot); // (what Action dumps at the rail or lets fall through the bay)
  const dumpAction = (p) => ballastOf(p) && railOf(p) ? { type: 'dump', label: `Dump the ${label(p.carry)} (lift!)` } : null;
  const dump = (p) => {
    const k = C(), rail = railOf(p);
    if (!rail || !cargoItem(p.carry)) return;
    const o = worldAt(p.x + rail.side * 30, p.y - 50);
    spawn(p.carry, o.x, o.y, rail.side * ship.pose.f * 200 + ship.pose.vx, -140 + ship.pose.vy, { ghost: true });
    if (p.carry === 'scrap') scrapNote(world, 'lost', p, { ship, dumped: true });
    p.carry = null;
    if (!state.goingDown) state.ship.gas = Math.min(100, state.ship.gas + k.DUMP_GAS); // (GOING DOWN!: the weight itself is the lift, goingDown.js)
    applyForce(state, { x: p.x, y: rail.pl.y - 40, fx: 0, fy: -(k.DUMP_KICK * config.FORCES.REF_MASS) / Math.max(60, (state.balance && state.balance.mass) || config.FORCES.REF_MASS), impulse: true, linear: true, source: 'dump' });
    puff(o.x, o.y, '#d9cbb0', 6);
    pop(state, o.x, o.y - 50, 'WHOOSH!', '#9fe8ff', 0.9);
    stat(p, 'dumped');
    phoneFx(p, 'Ballast away - she lifts!', [30]);
  };
  const dropAction = (p) => (ballastOf(p) && L.bombBay ? { type: 'dropcargo', label: `Drop the ${label(p.carry)}!` } : null);
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
    const ld = loads().find((o) => here(o, 70) && (o.kind !== 'scrap' || (state.goingDown && (!p.bot || (p.botJob && p.botJob.kind === 'shovel')))));
    return ld ? { type: 'shovel', obj: ld, hold: true, time: C().SHOVEL_TIME, label: `Shovel the ${label(ld.kind)} overboard` } : null;
  };

  // ---- scrap: the hold, picking a bundle up, taking one off a hulk (LOOP.md G1) ----
  // A bot only does these when its job says so (its one button would otherwise pick up and stow things it is merely walking past).
  const botOk = (p, kind) => !p.bot || (p.botJob && p.botJob.kind === kind);
  const stowAction = (p, here) => {
    if (p.carry === 'chest') return chestStowAction(state, p, L, here); // (TREASURE, CASTLE.md A2: a chest from an outpost's vault goes in the same bin)
    const sp = scrapOn() ? holdSpot(L) : null;
    if (!sp || p.carry !== 'scrap' || !here(sp, config.TOOLS.REACH) || !botOk(p, 'stow')) return null;
    const cap = config.SCRAP.HOLD_CAP, n = holdCount(state);
    return n >= cap ? { type: 'need', label: `The hold is full (${n}/${cap}) - dump it or build bigger` } : { type: 'stow', obj: sp, label: `STOW THE SCRAP (${n + 1}/${cap})` };
  };
  const stow = (p) => {
    if (p.carry === 'chest') return !!(state.groundSys && state.groundSys.chestStow(p));
    if (p.carry !== 'scrap' || holdCount(state) >= config.SCRAP.HOLD_CAP) return false;
    (state.scrapHold ||= { count: 0 }).count++;
    p.carry = null;
    stat(p, 'stowed');
    scrapNote(world, 'stowed', p, { ship });
    const sp = holdSpot(L), o = sp ? worldAt(sp.x, L.platforms[sp.d].y - 60) : null;
    if (o) { puff(o.x, o.y, '#e8c25a', 5); pop(state, o.x, o.y - 40, 'STOWED', '#ffd23f', 0.8); }
    phoneFx(p, `Scrap stowed (${holdCount(state)}/${config.SCRAP.HOLD_CAP})`, [30]);
    return true;
  };
  // GRAB at the bin with empty hands: take one bundle out of the hold again (to feed a frame, throw it, or put it on a hulk's tow).
  const unstowAction = (p, here) => {
    const sp = scrapOn() ? holdSpot(L) : null;
    return sp && !p.carry && !p.bot && holdCount(state) > 0 && here(sp, config.TOOLS.REACH) ? { type: 'unstow', obj: sp, label: `Take scrap out (${holdCount(state)} in the hold)` } : null;
  };
  const unstow = (p) => {
    if (p.carry || holdCount(state) <= 0) return false;
    state.scrapHold.count--;
    p.carry = 'scrap';
    return true;
  };
  // A bundle lying on the deck by your feet, hands empty: pick it up.
  const pickAction = (p, here) => {
    if (!scrapOn() || p.carry || state.goingDown || !botOk(p, 'stow')) return null;
    const ld = loads().find((o) => o.kind === 'scrap' && here(o, config.TOOLS.REACH) && (!p.bot || p.botJob.obj === o));
    return ld ? { type: 'pickup', obj: ld, label: 'Pick up the scrap' } : null;
  };
  const pickup = (p, ld) => {
    const list = loads(), i = list.indexOf(ld);
    if (i < 0 || p.carry) return false;
    list.splice(i, 1);
    p.carry = 'scrap';
    return true;
  };
  // A hulk (a sunk gunship's wreck) floating within reach of your hand: Action takes one bundle off it into your hands.
  const hulkNear = (p) => {
    const hulks = world.hulks;
    if (!scrapOn() || !hulks || !hulks.length || p.carry || p.d == null || p.fly || p.lock || !outsideNow(p)) return null;
    const o = worldAt(p.x, p.y - 70), R = config.SCRAP.HULK.REACH;
    let best = null;
    for (const h of hulks) { const d = Math.hypot(h.x - o.x, h.y - o.y); if (h.left > 0 && d < R && (!best || d < best.d)) best = { h, d }; }
    return best && best.h;
  };
  const hulkAction = (p) => {
    const h = hulkNear(p);
    return h && botOk(p, 'hulk') ? { type: 'takehulk', obj: h, label: `Take scrap off the hulk (${h.left} left)` } : null;
  };
  const takeHulk = (p, h) => {
    if (p.carry || h.left <= 0 || world.hulks.indexOf(h) < 0) return false;
    h.left--;
    p.carry = 'scrap';
    if (!h.took.includes(p.id)) h.took.push(p.id);
    puff(h.x, h.y, '#e8c25a', 8);
    pop(state, h.x, h.y - 100, h.left > 0 ? `${h.left} LEFT` : 'STRIPPED!', '#ffd23f', 1);
    state.sfxQ.push(['clang', true]);
    scrapNote(world, 'taken', p, { ship, hulk: h });
    if (h.left <= 0) scrapNote(world, 'hulk', p, { ship, hulk: h });
    return true;
  };
  // GOING DOWN!: the whole hold goes over the side (goingDown.js dumpscrap). The count is the weight that leaves her.
  const dumpHold = (p) => {
    const n = holdCount(state), sp = holdSpot(L);
    if (n <= 0) return 0;
    state.scrapHold.count = 0;
    const pl = sp ? L.platforms[sp.d] : null, mid = L.refPoint ? L.refPoint.x : 0, x = sp ? sp.x : mid, dir = x < mid ? -1 : 1;
    const o = worldAt(x, (pl ? pl.y : 600) - 40);
    for (let k = 0; k < Math.min(n, 6); k++) spawn('scrap', o.x + k * 14, o.y, dir * ship.pose.f * (190 + k * 30) + ship.pose.vx, -230 + ship.pose.vy, { ghost: true });
    scrapNote(world, 'dumped', p, { ship, n });
    return n;
  };

  const update = (dt) => {
    for (const ld of loads()) ld.t += dt;
    if (!state.rackStock) return;
    const k = C();
    for (const key of Object.keys(state.rackStock)) state.rackStock[key] = Math.min(k.STOCK, state.rackStock[key] + dt / k.REFILL);
  };

  return { rack, rackReady, wantsThrow, throwItem, land, place, shed, shovel, shovelAction, dumpAction, dump, dropAction, drop, update, loads, spawn, worldAt, stowAction, stow, unstowAction, unstow, pickAction, pickup, hulkAction, hulkNear, takeHulk, dumpHold, holdWeight: () => holdWeight(state) };
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
      if (ship.layout.platforms.some((pl) => { const a = toWorldX(ship, pl.x0), b = toWorldX(ship, pl.x1), Y = toWorldY(ship, pl.y); return py < Y && y >= Y && x >= Math.min(a, b) - 30 && x <= Math.max(a, b) + 30; })) break; // (it comes down on the thrower's own deck: no throw)
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
  const k = config.CROSS.CARGO, F = config.SCRAP.FLOTSAM;
  const wind = list.some((q) => q.chute) ? windSpeed(world) * config.SHIP.TOP_SPEED : 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    if (it.haul) { // (on a hookshot's line: hookshot.js moves it; if the line is gone it falls on)
      const hp = world.players[it.haul];
      if (hp && hp.hook && hp.hook.item === it) { it.t += dt; continue; }
      it.haul = null;
    }
    it.t += dt;
    const x0 = it.x, y0 = it.y;
    if (it.chute) { // (SCRAP: a bundle on its little parachute settles to a steady fall and drifts with the wind)
      it.vy += (F.FALL - it.vy) * Math.min(1, (dt * F.GRAVITY) / F.FALL);
      it.vx += (wind - it.vx) * Math.min(1, dt * F.DRIFT);
      it.rot = Math.sin(it.t * 2.1 + it.id) * 0.22;
    } else {
      it.vy += k.GRAVITY * dt;
      it.rot += it.spin * dt;
    }
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    if (it.chute && inRock(world, it.x, it.y)) { puff(it.x, it.y, '#8b6b4a', 4); scrapNote(world, 'lost', null, {}); list.splice(i, 1); continue; }
    if (world.creature && !it.ghost && !it.chute && creatureCargo(world, it)) { list.splice(i, 1); continue; } // (a giant creature: it hits a part, or falls into the open beak for half a bomb)
    let landed = false;
    if (!it.ghost && it.vy > 0) {
      const mg = it.chute ? F.MARGIN : 8;
      for (const sh of world.ships) {
        if (sh.state.down > 0 || sh.ctx.wreck || !sh.sim.cargo || (it.chute && (sh.ai || sh.piece))) continue;
        const sx = toShipX(sh, it.x), psy = toShipY(sh, y0), sy = toShipY(sh, it.y);
        let best = -1;
        const holes = sh.nav ? sh.nav.holes : []; // (an open cargo drop hatch is no floor: it falls on through, hatch.js)
        sh.layout.platforms.forEach((pl, d) => { if (sx >= pl.x0 - mg && sx <= pl.x1 + mg && psy < pl.y && sy >= pl.y && !(holes.length && inGap(holes, d, sx)) && (best < 0 || pl.y < sh.layout.platforms[best].y)) best = d; });
        if (best >= 0) { sh.sim.cargo.land(it, best, sx); landed = true; break; }
      }
    }
    if (landed || it.t > (it.chute ? F.LIFE : k.FLIGHT)) {
      if (!landed && !it.ghost) puff(it.x, it.y, '#ffffff', 5); // (lost in the sky: a splash of cloud)
      if (!landed && it.kind === 'scrap' && !it.ghost) scrapNote(world, 'lost', null, {});
      list.splice(i, 1);
    }
    void x0;
  }
}
