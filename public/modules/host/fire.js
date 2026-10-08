// Fire that cares where things are (S.5f): the live half. fireModel.js holds the rules (flammability, where a fire can spread, the cap); this runs them.
//   ignite(d, x, why, opts)   light a fire at x on deck d (refused on armour plate, on ground that cannot burn, or past the cap); returns it or null.
//                             Ground as flammable as the coal flares into a BLAZE (several big fires at once, a TV call-out).
//   igniteChance(d, x)        how much more (or less) likely a hit is to start a fire there: the spot's flammability, capped (1 on a plain deck, 0 on plate)
//   update(dt)                spread along decks and through ladders towards the more flammable neighbour; big fires smoke; an overheating boiler throws sparks
//   lightBoiler(boiler, n)    a blowout: fires beside the boiler
//   load()                    the hull-eating weight of every fire (a big one counts more)
// A fire is { x, d, t (its spread clock), prog (how far it has been sprayed out), big? }. state.blaze = { d, x } while a blaze burns.
import { config } from '../../config.js';
import { all } from '../../shipLayout.js';
import { mainShip } from './ships.js';
import { toWorldY } from './pose.js';
import { crewMul } from './crewscale.js';
import { pop } from './popups.js';
import { flamAt, fireCap, spreadSpots, coalAt } from './fireModel.js';

export function createFire({ state, shipPuff }) {
  const F = config.FIRE, B = F.BLAZE;
  const ship = mainShip(state); // (the ship the fires burn on: its layout is read through the handle, never imported)
  const SL = ship.layout, P = SL.platforms;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  state.fireStats = { lit: 0, hit: 0, spread: 0, boiler: 0, env: 0, blazes: 0, plated: 0 }; // (what lit each fire, blazes, hits that struck armour plate: read by tools/botsim.mjs and the --check-fire gate)
  state.blaze = null;
  state.blazeCd = 0;

  let capV = -1, capN = 0;
  const cap = () => { // (cached per layout version: the sum runs over every deck)
    if (capV !== SL.version) { capV = SL.version; capN = fireCap(SL); }
    return capN;
  };

  const igniteChance = (d, x) => clamp(flamAt(SL, d, x) / F.FLAMMABILITY.deck, 0, F.HIT_IGNITE_MAX);

  // A blaze: the coal has caught. B.FIRES more big fires round the bunker at once, a call-out, a shake, black smoke.
  const flare = (fire) => {
    state.blaze = { d: fire.d, x: fire.x };
    state.blazeCd = B.REFLARE;
    state.fireStats.blazes++;
    const p = P[fire.d];
    for (let i = 0; i < B.FIRES && state.fires.length < cap() + B.EXTRA_CAP; i++) {
      const x = clamp(fire.x + (i % 2 ? 1 : -1) * (45 + 40 * Math.floor(i / 2) + Math.random() * 30), p.x0 + 20, p.x1 - 20);
      if (flamAt(SL, fire.d, x) <= 0) continue;
      state.fires.push({ x, d: fire.d, t: 0, prog: 0, big: true });
      state.fireStats.lit++;
    }
    state.ship.shake = Math.max(state.ship.shake, 0.5);
    state.ev.warn = 4;
    state.ev.warnText = B.CALL;
    state.sfxQ.push(['alarm']);
    pop(state, fire.x, toWorldY(ship, p.y - 150), 'WHOOOOSH!', '#ff5a1f', 1.5);
    shipPuff(fire.x, p.y - 60, '#3b3b3b', 14);
  };

  const ignite = (d, x, why = 'hit', opts = {}) => {
    const p = P[d];
    if (!p) return null;
    const cx = clamp(x, p.x0 + 20, p.x1 - 20);
    const fl = flamAt(SL, d, cx);
    if (fl <= 0) return null; // plate, or ground that cannot burn
    if (state.fires.length >= cap() + (opts.over ? B.EXTRA_CAP : 0)) return null;
    const fire = { x: cx, d, t: 0, prog: 0 };
    if (opts.big) fire.big = true;
    state.fires.push(fire);
    state.fireStats.lit++;
    if (why in state.fireStats) state.fireStats[why]++;
    if (fl >= B.FLAME_AT && coalAt(SL, d, cx)) { // it has reached the coal
      fire.big = true;
      if (!state.blaze && state.blazeCd <= 0) flare(fire);
    }
    return fire;
  };

  const lightBoiler = (boiler, n = 1) => {
    if (!boiler) return;
    for (let i = 0; i < n; i++) ignite(boiler.d, boiler.x + (Math.random() * 2 - 1) * F.BOILER_FIRE_SPREAD, 'boiler');
  };

  const load = () => state.fires.reduce((n, f) => n + (f.big ? B.HULL_MUL : 1), 0);

  const update = (dt) => {
    // A blaze ends when its big fires are all out; the ship cannot flare again for a while.
    if (state.blaze && !state.fires.some((f) => f.big)) { state.blaze = null; state.blazeCd = B.REFLARE; }
    if (state.blazeCd > 0 && !state.blaze) state.blazeCd -= dt;
    // Overheating: sparks fly round the boiler.
    const hot = clamp((state.ship.press - config.BOILER.WARN_AT) / (100 - config.BOILER.WARN_AT), 0, 1);
    if (hot > 0 && state.phase === 'flying' && !state.ship.down && Math.random() < F.HOT_RATE * hot * dt) {
      const boilers = all('boiler', SL);
      if (boilers.length) lightBoiler(boilers[(Math.random() * boilers.length) | 0]);
    }
    for (const f of state.fires) {
      if (f.big && Math.random() < dt * B.SMOKE_RATE) shipPuff(f.x + (Math.random() - 0.5) * 40, P[f.d].y - 60 - Math.random() * 50, '#3b3b3b', 2);
    }
    for (const fire of state.fires) {
      const here = clamp(flamAt(SL, fire.d, fire.x), F.SPREAD_MIN_MUL, F.SPREAD_MAX_MUL) * (fire.big ? B.SPREAD_MUL : 1);
      if ((fire.t += dt) > F.SPREAD_EVERY / crewMul(state, 'spread') / here && state.fires.length < cap() + (state.blaze ? B.EXTRA_CAP : 0)) {
        fire.t = 0;
        const spots = spreadSpots(SL, fire);
        const total = spots.reduce((n, s) => n + s.w, 0);
        if (total > 0) {
          let r = Math.random() * total;
          const s = spots.find((o) => (r -= o.w) <= 0) || spots[spots.length - 1];
          if (s.w > 0 && Math.random() < Math.min(1, s.f)) { // a spot that is only half-flammable catches half the time
            const kid = ignite(s.d, s.x, 'spread', { over: !!state.blaze });
            if (kid && fire.big && state.blaze && Math.random() < B.KIDS_BIG) kid.big = true;
          }
        }
        break;
      }
    }
  };

  return { ignite, igniteChance, lightBoiler, update, load, cap };
}
