// Hydrogen bags on fire (gas types, config.GASES.HYDROGEN): the live half. fireModel.js knows where a fire reaches a bag; gasBags.js holds the bags; shipSim.js blows one up (explodeBag).
//   a bag has `scorch` (0..1: how hot the fire under it has made it) and `burn` (seconds of fuse left once ALIGHT)
//   update(dt)         every step: each fire that reaches a hydrogen bag scorches it (a big one faster, the bag's own flammability FIRE.FLAMMABILITY.gasbag); with nothing under it a bag cools; at scorch 1 it is ALIGHT.
//                      An alight bag burns for FUSE seconds (venting its gas, dropping big fires on the decks under it), then goes up (explode) - or fizzles if it has burnt down below FIZZLE gas.
//   scorch(i, amount)  a flamethrower's cone, say: add scorch (lights it at 1)
//   hit(i, power)      a shell on the bag: a small chance to light it at once
//   light(i, fuseMul)  set bag i alight (the chain from a neighbouring bag that exploded burns for a shorter fuse)
// Fires that reach a hydrogen bag are marked `h2` for the bots (they put these out first, bots.js). A ship with no hydrogen bag does nothing here and draws no random numbers.
import { config } from '../../config.js';
import { bagFireSpots, fireReachesBag } from './fireModel.js';

export function createHydrogen({ state, ship, fireSys, explode, shipPuff, rng }) {
  const H = config.GASES.HYDROGEN;
  let flagged = false; // (some fire carries the h2 mark)

  const warn = (text) => {
    if (!ship.main) return;
    state.ev.warn = 3;
    state.ev.warnText = text;
  };

  const light = (i, fuseMul = 1, why = 'fire') => {
    const b = state.bags[i];
    if (!b || b.type !== 'hydrogen' || b.burn > 0 || b.cool > 0 || b.gas < H.EMPTY) return false;
    b.burn = H.FUSE * fuseMul;
    b.scorch = 1;
    b.fireT = 0;
    state.gasStats.lit++;
    warn(why === 'chain' ? 'THE NEXT HYDROGEN BAG CAUGHT!' : 'HYDROGEN BAG ALIGHT! GET CLEAR!');
    state.sfxQ.push(['alarm']);
    return true;
  };

  const scorch = (i, amount) => {
    const b = state.bags[i];
    if (!b || b.type !== 'hydrogen' || b.burn > 0 || b.cool > 0 || b.gas < H.EMPTY) return;
    if (b.scorch <= 0) state.gasStats.scorched++;
    b.scorch += amount;
    if (b.scorch >= 1) light(i);
  };

  const hit = (i, power = 1) => {
    const b = state.bags[i];
    if (!b || b.type !== 'hydrogen' || b.burn > 0 || b.cool > 0 || b.gas < H.EMPTY) return;
    if (rng() < H.HIT_IGNITE * Math.min(3, power)) light(i, 1, 'hit');
  };

  // A big fire on a deck under alight bag i.
  const dropFire = (i) => {
    const L = ship.layout, bag = L.gasbags[i];
    if (!bag) return;
    const spots = bagFireSpots(L, bag);
    if (!spots.length) return;
    const sp = spots[(rng() * spots.length) | 0];
    fireSys.ignite(sp.d, sp.lo + rng() * (sp.hi - sp.lo), 'hit', { over: true, big: true });
  };

  const update = (dt) => {
    const bags = state.bags;
    if (!bags.some((b) => b.type === 'hydrogen')) {
      if (flagged) { for (const f of state.fires) f.h2 = false; flagged = false; }
      return;
    }
    const L = ship.layout, FL = config.FIRE.FLAMMABILITY.gasbag;
    const reach = bags.map(() => 0);
    flagged = false;
    for (const f of state.fires) {
      f.h2 = false;
      bags.forEach((b, i) => {
        if (b.type === 'hydrogen' && L.gasbags[i] && fireReachesBag(L, L.gasbags[i], f.d, f.x, !!f.big)) { reach[i] += f.big ? H.BIG_MUL : 1; f.h2 = true; flagged = true; }
      });
    }
    for (let i = 0; i < bags.length; i++) {
      const b = bags[i];
      if (b.type !== 'hydrogen') { b.scorch = 0; b.burn = 0; continue; }
      if (b.cool > 0) { b.cool -= dt; b.scorch = 0; continue; } // (burnt out: nothing left to catch)
      if (b.burn > 0) { // ALIGHT: the gas burns off, big fires drop on the decks under it, then it goes
        b.burn -= dt;
        b.gas = Math.max(0, b.gas - H.BURN_LEAK * dt);
        if ((b.fireT -= dt) <= 0) { b.fireT = H.FIRE_EVERY; dropFire(i); }
        const bag = L.gasbags[i];
        if (bag && rng() < dt * 12) shipPuff(bag.cx + (rng() - 0.5) * bag.rx * 1.6, bag.cy - bag.ry * 0.3 + rng() * bag.ry * 0.8, rng() < 0.5 ? '#ff7b00' : '#3b3b3b', 3);
        if (b.burn <= 0) {
          b.burn = 0;
          explode(i, b.gas >= H.FIZZLE);
          return; // (the bags were made again: this step is over)
        }
      } else if (reach[i] > 0 && b.gas >= H.EMPTY) {
        if (b.scorch <= 0) { state.gasStats.scorched++; warn('FIRE UNDER THE HYDROGEN BAG! PUT IT OUT!'); }
        b.scorch += H.SCORCH_RATE * FL * reach[i] * dt;
        if (b.scorch >= 1) light(i);
      } else if (b.scorch > 0) b.scorch = Math.max(0, b.scorch - H.SCORCH_COOL * dt);
    }
  };

  return { update, light, scorch, hit };
}
