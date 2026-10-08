// Live balance (Phase S.5c): the seesaw. The ship's centre of mass (her parts' weights, shipLayout.js SHIP_BALANCE) is tipped by what moves and burns while
// she flies: the crew running about, loads they carry, coal in the firebox, rounds in the guns, bombs in the bay (config.BALANCE.LIVE_MASS). Against the
// centre of lift (the bag's middle) that gives a trim angle, and the angle does four small things (all strengths in config.BALANCE):
//   restPitch  she rests tipped by it (state.ship.pitch, so the guns' arcs and the rock outline follow)       push   nose-heavy dives faster and climbs slower
//   slow       tail-heavy drags her tail: less top speed                                                       scrape nose-heavy digs her bow in when she grinds the ground
// The helm's trim engine (state.ship.trim) pushes against `push` by itself. A bad angle shouts "NOSE-HEAVY! TRIM HER!" and sends idle crew to the light end (jobs.js).
// A classic ship is level (its angle is exactly 0 until the live loads add up to more than BALANCE.LEVEL_PX), so with LIVE off nothing changes at all.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { trimOf } from './shipBuild.js';
import { liveLiftX } from './gasBags.js';

export function createBalance(state) {
  const layout = mainShip(state).layout; // (this ship's own layout and its static balance)
  const SB = layout.balance;
  const bal = { dx: 0, deg: 0, side: 'level', comX: 0, comY: 0, mass: 0, k2: 0, restPitch: 0, push: 0, slow: 0, scrape: 0, warn: false, cd: 0, live: 0 };
  state.balance = bal;
  let primed = false;

  // The weight (m) and its moment (mx) of everything that moves, summed once per tick.
  function loads() {
    const W = config.BALANCE.LIVE_MASS, L = layout;
    let m = 0, mx = 0, ix = 0, cm = 0;
    const add = (w, x) => { m += w; mx += w * x; ix += w * (x - SB.comX) ** 2; };
    for (const p of Object.values(state.players)) {
      if (p.d == null || p.fall || p.air || p.fly || p.onGunship || p.connected === false) continue;
      const w = W.crew + (p.carry === 'coal' || p.carry === 'ammo' ? W.carry : (config.CROSS.CARGO.ITEMS[p.carry] || { w: 0 }).w); // (B.6: a sandbag or crate in your hands weighs what it weighs on a deck)
      add(w, p.x);
      cm += w * (p.x - SB.comX);
    }
    if (config.FORCES.LIVE) for (const b of state.boarders || []) if (b.d != null && !b.fall && b.conn == null && b.hp > 0) { add(config.FORCES.BOARDER_MASS, b.x); cm += config.FORCES.BOARDER_MASS * (b.x - SB.comX); } // raiders on deck weigh too
    for (const ld of state.loads || []) { add(ld.w, ld.x); cm += ld.w * (ld.x - SB.comX); } // (B.6: sandbags, crates and sacks lying on her decks - thrown there by anyone - tip her like a crowd)
    const boilers = L.stations.filter((s) => s.kind === 'boiler');
    if (boilers.length) for (const s of boilers) add((state.ship.fuel * W.fuel) / boilers.length, s.x);
    for (const [name, g] of Object.entries(state.GUNS || {})) add(g.ammo * W.ammo, g.bx != null ? g.bx : (L.gunMounts[name] || {}).bx || 0);
    if (L.bombBay && state.bombBay) add(state.bombBay.bombs * W.bomb, L.bombBay.x);
    return { m, mx, ix, cm };
  }

  function update(dt) {
    const B = config.BALANCE, S = SB;
    let target = S.dx;
    bal.live = 0;
    // Several gasbags: the centre of lift moves to the bags that still hold gas, so losing one end bag tips her toward it (gasBags.js). One bag: the build's own.
    const liftX = liveLiftX(state);
    const colX = liftX == null ? S.colX : liftX;
    if (liftX != null) target = S.comX - colX;
    bal.k2 = S.k2;
    bal.comY = S.comY; // (what forces.js turns her about, and what she weighs: per ship, read from her own balance)
    bal.mass = S.mass;
    let crowd = 0; // how far the crew and raiders alone pull the centre of mass toward the bow (px; negative = the stern)
    if (B.LIVE && S.mass > 0) {
      const l = loads();
      crowd = l.cm / (S.mass + l.m);
      bal.live = l.m;
      target = (S.mass * S.comX + l.mx) / (S.mass + l.m) - colX;
      bal.k2 = (S.mass * S.k2 + l.ix) / (S.mass + l.m); // the crowd and the coal spread her weight out: she turns a little slower (and changes how hits, sails and engines twist her, forces.js)
    }
    if (!B.LIVE || !primed) bal.dx = target;
    else bal.dx += (target - bal.dx) * Math.min(1, dt * B.LIVE_SMOOTH);
    primed = true;
    bal.comX = colX + bal.dx;
    const t = trimOf(bal.dx);
    bal.deg = t.deg;
    bal.side = t.side;
    // A crowd running to the bow tips her nose down, to the stern nose up, even on a level ship (no dead band): FORCES.CREW_DEG_PER_PX, smoothed like the rest of the live balance.
    bal.crowd = (bal.crowd || 0) + (crowd - (bal.crowd || 0)) * Math.min(1, dt * B.LIVE_SMOOTH);
    const crowdPitch = config.FORCES.LIVE ? (Math.max(-config.FORCES.CREW_MAX_DEG, Math.min(config.FORCES.CREW_MAX_DEG, bal.crowd * config.FORCES.CREW_DEG_PER_PX)) * Math.PI) / 180 : 0;
    bal.restPitch = t.restPitch + crowdPitch;
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
