// Live balance (Phase S.5c): the seesaw. The ship's centre of mass (her parts' weights, shipLayout.js SHIP_BALANCE) is tipped by what moves and burns while
// she flies: the crew running about, loads they carry, coal in the firebox, rounds in the guns, bombs in the bay (config.BALANCE.LIVE_MASS). Against the
// centre of lift (the bag's middle) that gives a trim angle, and the angle does four small things (all strengths in config.BALANCE):
//   restPitch  she rests tipped by it (state.ship.pitch, so the guns' arcs and the rock outline follow)       push   nose-heavy dives faster and climbs slower
//   slow       tail-heavy drags her tail: less top speed                                                       scrape nose-heavy digs her bow in when she grinds the ground
// The helm's trim engine (state.ship.trim) pushes against `push` by itself. A bad angle shouts "NOSE-HEAVY! TRIM HER!" and sends idle crew to the light end (jobs.js).
// A classic ship is level (its angle is exactly 0 until the live loads add up to more than BALANCE.LEVEL_PX), so with LIVE off nothing changes at all.
import { config } from '../../config.js';
import { SHIP_LAYOUT, SHIP_BALANCE } from '../../shipLayout.js';
import { trimOf } from './shipBuild.js';
import { liveLiftX } from './gasBags.js';

export function createBalance(state) {
  const bal = { dx: 0, deg: 0, side: 'level', comX: 0, restPitch: 0, push: 0, slow: 0, scrape: 0, warn: false, cd: 0, live: 0 };
  state.balance = bal;
  let primed = false;

  // The weight (m) and its moment (mx) of everything that moves, summed once per tick.
  function loads() {
    const W = config.BALANCE.LIVE_MASS, L = SHIP_LAYOUT;
    let m = 0, mx = 0;
    const add = (w, x) => { m += w; mx += w * x; };
    for (const p of Object.values(state.players)) {
      if (p.d == null || p.fall || p.air || p.fly || p.onGunship || p.connected === false) continue;
      add(W.crew + (p.carry === 'coal' || p.carry === 'ammo' ? W.carry : 0), p.x);
    }
    const boilers = L.stations.filter((s) => s.kind === 'boiler');
    if (boilers.length) for (const s of boilers) add((state.ship.fuel * W.fuel) / boilers.length, s.x);
    for (const [name, g] of Object.entries(state.GUNS || {})) add(g.ammo * W.ammo, g.bx != null ? g.bx : (L.gunMounts[name] || {}).bx || 0);
    if (L.bombBay && state.bombBay) add(state.bombBay.bombs * W.bomb, L.bombBay.x);
    return { m, mx };
  }

  function update(dt) {
    const B = config.BALANCE, S = SHIP_BALANCE;
    let target = S.dx;
    bal.live = 0;
    // Several gasbags: the centre of lift moves to the bags that still hold gas, so losing one end bag tips her toward it (gasBags.js). One bag: the build's own.
    const liftX = liveLiftX(state);
    const colX = liftX == null ? S.colX : liftX;
    if (liftX != null) target = S.comX - colX;
    if (B.LIVE && S.mass > 0) {
      const l = loads();
      bal.live = l.m;
      target = (S.mass * S.comX + l.mx) / (S.mass + l.m) - colX;
    }
    if (!B.LIVE || !primed) bal.dx = target;
    else bal.dx += (target - bal.dx) * Math.min(1, dt * B.LIVE_SMOOTH);
    primed = true;
    bal.comX = colX + bal.dx;
    const t = trimOf(bal.dx);
    bal.deg = t.deg;
    bal.side = t.side;
    bal.restPitch = t.restPitch;
    bal.push = (-B.DIVE_ACCEL * t.deg) / B.CAP_DEG; // (nose-heavy = positive angle = pushed down)
    bal.slow = t.deg < 0 ? (B.SLOW_TAIL * -t.deg) / B.CAP_DEG : 0;
    bal.scrape = t.deg > 0 ? B.SCRAPE_PER_DEG * t.deg : 0;
    bal.warn = Math.abs(t.deg) >= B.WARN_DEG;
    bal.cd = Math.max(0, bal.cd - dt);
    if (bal.warn && bal.cd <= 0 && state.phase === 'flying' && !state.ship.down && !(state.ev.warn > 0)) {
      state.ev.warn = 2.5;
      state.ev.warnText = (t.deg > 0 ? 'NOSE-HEAVY' : 'TAIL-HEAVY') + '! TRIM HER! MOVE CREW OR BALLAST ' + (t.deg > 0 ? 'AFT' : 'FORE');
      bal.cd = B.WARN_EVERY;
    }
  }
  return { update, state: bal };
}
