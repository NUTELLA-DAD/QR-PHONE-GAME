// The gasbags in flight (Phase S.5d): any number of bags side by side, each with its own gas and its own holes.
//   state.bags = [{ gas (0..100), w (its lift share), down (deflated) }], in the same order as the layout's gasbags (tail to nose)
//   state.ship.gas stays the one number the rest of the game reads (the HUD, the helm, the bots, the shop): the lift-weighted MEAN of the bags' gas.
//   Writing it sets every bag, so "refill to 50" and the like keep working; refillBags() tops each bag up without lowering a fuller one.
// The helm's pump and vent act on all the bags at once; seepage is per bag and each hole leaks from its own bag (hole.bag). A bag at BAG_DOWN or less is
// DEFLATED: it lifts nothing (its gas counts as nothing in the mean), the art crumples it and the TV calls it out. Patch its holes and pump to bring it back.
// With ONE bag every number here reduces to the old single gas value exactly (the classic ship flies as it always did).
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { bagName, bagLiftPoints } from './shipBuild.js';

const layoutOf = (state) => mainShip(state).layout; // (this ship's own layout; nothing here is captured at import)
const bagsOf = (state) => layoutOf(state).gasbags; // (updated in place when a build is applied)
const valves = (state) => layoutOf(state).gasValves || []; // (only a build that has some carries the list)
const clamp100 =(v) => Math.max(0, Math.min(100, v));

const makeBags = (state, level) => { const BAGS = bagsOf(state); return Array.from({ length: Math.max(1, BAGS.length) }, (_, i) => ({ gas: level, w: BAGS[i] ? Math.max(1, BAGS[i].lift) : 1, down: false, closed: false })); };

// The lift-weighted mean of the bags' gas (one bag: that bag's gas, exactly).
export function bagMean(bags) {
  if (bags.length === 1) return bags[0].gas;
  let s = 0, w = 0;
  for (const b of bags) { s += b.gas * b.w; w += b.w; }
  return w > 0 ? s / w : 0;
}

// Give a new simulation's state its bags, and make state.ship.gas the mean of them.
export function installBags(state) {
  state.bags = makeBags(state, state.ship.gas);
  state.bagsVersion = layoutOf(state).version;
  state.gasValveOpen = valves(state).map(() => true); // one flag per gas valve of the layout (a bag with no valve is always open)
  Object.defineProperty(state.ship, 'gas', {
    enumerable: true,
    configurable: true,
    get: () => bagMean(state.bags),
    set: (v) => { for (const b of state.bags) b.gas = v; },
  });
}

/// A new ship build was applied (the dock): fit the bags, the gas valves and the vents to it, keeping the mean gas. Every call also works out which bags are CUT OFF
// (a gas valve of theirs is shut: state.gasValveOpen[i] false for any valve with bag i).
export function syncBags(state) {
  if (state.bagsVersion !== layoutOf(state).version || state.bags.length !== Math.max(1, bagsOf(state).length)) {
    const level = state.ship.gas;
    state.bags = makeBags(state, level);
    state.bagsVersion = layoutOf(state).version;
    for (const h of state.gasHoles || []) if (!(h.bag < state.bags.length)) h.bag = 0;
    state.gasValveOpen = valves(state).map(() => true); // (a new ship: every valve open)
    if (state.ventOpen && state.ventOpen.length !== layoutOf(state).vents.length) state.ventOpen = layoutOf(state).vents.map(() => false);
  }
  const vs = valves(state);
  if (!vs.length) { for (const b of state.bags) b.closed = false; return; }
  for (const b of state.bags) b.closed = false;
  vs.forEach((v, i) => { if (!state.gasValveOpen[i] && state.bags[v.bag]) state.bags[v.bag].closed = true; });
}

// Top every bag up to at least `level` (a repair, a shop refill): a fuller bag keeps its gas.
export function refillBags(state, level) {
  for (const b of state.bags) b.gas = Math.max(b.gas, level);
}

// How many holes leak from each bag.
export function holesPerBag(state) {
  const n = state.bags.length, out = new Array(n).fill(0);
  for (const h of state.gasHoles) out[h.bag < n ? h.bag | 0 : 0]++;
  return out;
}

/// One step of gas: `moved` = what the pump and the vent move per second (+ in, - out), the same for every OPEN bag; a bag whose valve is shut gets none of it. Seep is per bag
// and holes leak from their own bag. While the pump runs, each hole in an open bag also bleeds HOLE_BLEED out of the shared feed (shared by the open bags): a ruptured
// bag starves the rest until its valve is shut or it is patched. One bag with no valve shut: the old single gas value, exactly.
export function stepBags(state, moved, dt) {
  const G = config.GAS, bags = state.bags;
  const seep = state.noPump ? G.SEEP_NO_PUMP : G.SEEP; // (a ship that can never pump seeps only very slowly, S.5e)
  if (bags.length === 1 && !bags[0].closed) { bags[0].gas = clamp100(bags[0].gas + (moved - seep - G.LEAK_PER_HOLE * state.gasHoles.length) * dt); return; }
  const holes = holesPerBag(state);
  let feed = moved;
  if (moved > 0) {
    let open = 0, bleed = 0;
    bags.forEach((b, i) => { if (!b.closed) { open++; bleed += holes[i] * G.HOLE_BLEED; } });
    feed = open ? Math.max(0, moved - bleed / open) : 0;
  }
  bags.forEach((b, i) => { b.gas = clamp100(b.gas + ((b.closed ? 0 : feed) - seep - G.LEAK_PER_HOLE * holes[i]) * dt); });
}

// A bag going flat (or coming back) while several are fitted: mark it and shout on the TV.
export function watchBags(state) {
  const G = config.GAS, bags = state.bags;
  if (bags.length < 2) return;
  const holes = holesPerBag(state);
  bags.forEach((b, i) => {
    let rs = 0, rw = 0; // the other bags' gas (weighted): a bag is "down" when it is flat and the rest are not
    bags.forEach((o, j) => { if (j !== i) { rs += o.gas * o.w; rw += o.w; } });
    if (!b.down && b.gas <= G.BAG_DOWN && rs / rw >= b.gas + G.BAG_REST) {
      b.down = true;
      const name = bagName(i, bags.length);
      state.ev.warn = 3.2;
      state.ev.warnText = `${name} DOWN! ${holes[i] ? 'PATCH IT AND PUMP!' : 'PUMP IT UP!'}`;
      state.bagAlert = { i, name, text: state.ev.warnText, at: state.scroll };
      state.sfxQ.push(['alarm']);
    } else if (b.down && b.gas > G.BAG_UP) b.down = false;
  });
}

// The live centre of lift (ship x) when several bags are fitted: each bag lifts by its size AND how full it is, so a flat bag stops pulling its end of the ship
// up (balance.js turns the shift into a tip). null = use the build's static one (a single bag, or BAG_COL off).
export function liveLiftX(state) {
  const BAGS = bagsOf(state);
  if (!config.BALANCE.BAG_COL || state.bags.length < 2 || BAGS.length !== state.bags.length) return null;
  let m = 0, mx = 0;
  BAGS.forEach((g, i) => {
    for (const q of bagLiftPoints(g)) { // (a bag's lift in gas points, scaled by how full it is)
      const w = q.v * (state.bags[i].gas / 100);
      m += w;
      mx += w * q.x;
    }
  });
  return m > 0.01 ? mx / m : null;
}
