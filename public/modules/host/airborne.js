// Airborne crew: jumping off the ship, falling onto lower decks, going overboard, and being
// thrown about by hard hits. Walking and hopping on a deck stay in simulation.js / nav.js; this
// module takes over once a player is in FREE FLIGHT (player.fly = true, ship coordinates).
//
// Player fields while flying: fvx, fvy (px/s, y grows downward), apex (highest y reached, for
// the fall height), rot (lean/tumble for drawing). After landing: squash (0..1, decays).
//
// LANDING SURFACES (so other bodies can be added later by other code)
//   A surface is { id, y, x0, x1, onLand?, d? } where y / x0 / x1 are numbers OR functions
//   returning numbers, all in SHIP coordinates (a moving body returns where its deck is now).
//   A falling player (fvy >= 0) lands on the highest surface whose y they pass from above
//   while inside x0..x1. Our ship's platforms are the default surfaces (they carry `d`, the
//   platform index). For any other surface give `onLand(player, info)`, which must put the
//   player somewhere sensible (e.g. set their deck on that body); a surface without onLand
//   is ignored. info = { surface, speed, height, y }.
//     const remove = sim.air.addSurface({ id: 'gunship-deck', y: () => g.y - 40, x0: () => g.x - 200, x1: () => g.x + 200, onLand: (p) => {...} });
//     sim.air.removeSurface('gunship-deck');   // or call remove()
//   Alternatively pass `providers` (functions returning an array of surfaces each frame).
import { config } from '../../config.js';
import { mainShip } from './ships.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const val = (v) => (typeof v === 'function' ? v() : v);

export function createAirborne({ state, puff, phoneFx, providers = [] }) {
  const A = config.AIR;
  const L = mainShip(state).layout; // (this ship's own layout)
  const P = L.platforms;
  const extra = []; // surfaces added by other code
  const extraProviders = [...providers];

  // Is this spot open air (an outside deck, or an outrigger room)?
  const outsideAt = (d, x) => !!P[d] && (!!P[d].outside || L.rooms.some((r) => r.outside && r.d === d && x >= r.x0 && x <= r.x1));

  const shipSurfaces = P.map((p, d) => ({ id: 'ship:' + p.id, d, y: p.y, x0: p.x0, x1: p.x1 }));

  const surfaces = () => {
    const list = [...shipSurfaces, ...extra];
    for (const f of extraProviders) {
      try {
        const got = f(state);
        if (got) list.push(...got);
      } catch (e) {
        /* a broken provider must not break the game */
      }
    }
    return list;
  };

  const addSurface = (s) => {
    extra.push(s);
    return () => removeSurface(s.id);
  };
  const removeSurface = (id) => {
    for (let i = extra.length - 1; i >= 0; i--) if (extra[i].id === id) extra.splice(i, 1);
  };
  const addProvider = (f) => extraProviders.push(f);

  // Leave the deck into free flight from (x, y) with velocity (vx, vy) (vy down is positive).
  const startFlight = (p, vx, vy) => {
    p.fly = true;
    p.air = true;
    p.jz = 0;
    p.vy = 0;
    p.vx = 0;
    p.conn = null;
    p.climb = false;
    p.fvx = vx;
    p.fvy = vy;
    p.apex = p.y;
    p.stag = 0;
    p.chute = 0; // no parachute (set by jumpChute)
  };

  // JUMP out of the bomb bay doors: free fall, then a PARACHUTE opens after CHUTE_DELAY seconds. Under it
  // the fall is slow and the stick steers hard, so you can drift onto a gunship (or our own deck) below.
  // p.chute: 0 = none, otherwise the seconds since the jump; p.chuteOpen = canopy out.
  const jumpChute = (p) => {
    const bay = L.bombBay;
    p.y = P[p.d].y + 3; // just below the bay floor so we do not land straight back on it
    startFlight(p, 0, 60);
    p.chute = 0.001;
    p.chuteOpen = false;
    p.carry = null;
    puff(p.x, p.y, '#ffffff', 5);
    return !!bay;
  };

  // Cut the parachute away (landing, or any other change of state).
  const cutChute = (p) => {
    p.chute = 0;
    p.chuteOpen = false;
  };

  // GRAB A LADDER/ROPE mid-air (flying or mid-hop). Auto-grab when within reach sideways and between
  // the connector's ends, unless the stick is held DOWN (that means "drop past it"). Humans only.
  const grab = (p) => {
    if (p.bot || p.conn != null || p.onGunship || p.lock || p.ko > 0) return false;
    if (!(p.fly || p.air)) return false;
    if ((p.jy || 0) > 0.6) return false;
    const y = p.fly ? p.y : p.y - (p.jz || 0);
    for (let i = 0; i < L.connectors.length; i++) {
      const c = L.connectors[i];
      if (c.type !== 'ladder' && c.type !== 'rope') continue;
      if (p.regrabCd > 0 && p.regrabConn === i) continue;
      const yt = P[c.top].y;
      const yb = P[c.bottom].y;
      if (y < yt + 6 || y > yb - 4) continue;
      const s = (y - yt) / (yb - yt);
      if (Math.abs(p.x - (c.xTop + (c.xBottom - c.xTop) * s)) > A.GRAB_REACH) continue;
      p.fly = false;
      p.air = false;
      cutChute(p);
      p.jz = 0;
      p.vy = 0;
      p.vx = 0;
      p.fvx = 0;
      p.fvy = 0;
      p.rot = 0;
      p.conn = i;
      p.s = s;
      p.climb = true;
      puff(p.x, y, '#ffffff', 3);
      return true;
    }
    return false;
  };

  // JUMP while climbing: leap off sideways with an upward kick into free flight.
  const jumpOff = (p) => {
    if (p.conn == null || p.bot) return false;
    const stick = p.jx || 0;
    const dir = Math.abs(stick) > 0.3 ? Math.sign(stick) : p.x < L.midPoint.x ? 1 : -1; // neutral: toward the middle of the ship
    const i = p.conn;
    startFlight(p, dir * A.LADDER_JUMP_VX, -A.LADDER_JUMP_VY);
    p.regrabConn = i;
    p.regrabCd = A.REGRAB_CD;
    p.face = dir;
    puff(p.x, p.y, '#ffffff', 3);
    return true;
  };

  // Hop or walk reached a deck end: step/jump off it. Humans only (bots never go overboard by accident).
  // Called every frame while on a deck. hopping = mid-hop (jz is the height above the deck).
  const edgeCheck = (p, dt, hopping) => {
    if (p.bot || p.fly || p.conn != null) return false;
    const pl = P[p.d];
    if (!pl) return false;
    const push = p.jx || 0;
    const atRight = p.x >= pl.x1 - 0.5 && push > (hopping ? A.EDGE_HOP : 0.6);
    const atLeft = p.x <= pl.x0 + 0.5 && push < -(hopping ? A.EDGE_HOP : 0.6);
    if (!(atRight || atLeft)) {
      p.edgeT = 0;
      return false;
    }
    if (!hopping) {
      if (!outsideAt(p.d, p.x)) return false; // you do not walk off an inside deck, only jump off
      p.edgeT = (p.edgeT || 0) + dt;
      if (p.edgeT < A.EDGE_HOLD) return false;
    }
    p.edgeT = 0;
    const dir = atRight ? 1 : -1;
    p.y = pl.y - (p.jz || 0);
    startFlight(p, dir * 120, hopping ? -(p.vy || 0) : 60);
    return true;
  };

  // Jump over the rail of an outside deck with the stick held down: drop to whatever is below.
  const vault = (p) => {
    const pl = P[p.d];
    if (p.bot || !pl || !outsideAt(p.d, p.x) || (p.jy || 0) < 0.6 || p.conn != null) return false;
    p.y = pl.y + 3; // just below the deck so we do not land straight back on it
    startFlight(p, (p.jx || 0) * 120, A.VAULT_DROP);
    return true;
  };

  // A big hit or hard pitch: standing crew on outside decks stagger; a huge hit can throw them.
  const shove = (power, hx) => {
    if (power < A.STAGGER_POWER) return;
    for (const p of Object.values(state.players)) {
      if (p.bot || p.hj || p.fly || p.air || p.fall || p.conn != null || p.lock || p.ko > 0 || p.swing || p.onGunship || p.d == null) continue; // bots keep their footing (balance)
      const pl = P[p.d];
      if (!outsideAt(p.d, p.x)) continue;
      const dir = Math.abs(p.x - hx) < 8 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(p.x - hx);
      p.vx = (p.vx || 0) + dir * A.STAGGER_KICK * Math.min(3, power);
      p.stag = A.STAGGER_TIME;
      if (power >= A.KNOCK_POWER && Math.random() < A.KNOCK_CHANCE) {
        startFlight(p, dir * A.KNOCK_VX, -A.KNOCK_VY);
        p.face = -dir;
        phoneFx(p, 'WHOA! Blown off your feet!', null);
      }
    }
  };

  // Per frame for a player standing on a deck (not flying): stagger timer, pitch slide, squash decay.
  const standing = (p, dt) => {
    p.squash = Math.max(0, (p.squash || 0) - dt / A.SQUASH_TIME);
    if (p.regrabCd > 0) p.regrabCd -= dt;
    if (p.stag > 0) p.stag = Math.max(0, p.stag - dt);
    const pl = P[p.d];
    const pitch = state.ship.pitch || 0;
    if (!p.bot && outsideAt(p.d, p.x) && !p.air && p.conn == null && !p.lock && Math.abs(pitch) > A.PITCH_STAGGER) {
      const k = (Math.abs(pitch) - A.PITCH_STAGGER) / Math.max(0.001, 0.06 - A.PITCH_STAGGER);
      p.x = clamp(p.x + Math.sign(pitch) * A.PITCH_SLIDE * Math.min(1, k) * dt, pl.x0, pl.x1);
      p.stag = Math.max(p.stag || 0, 0.2);
    }
    p.rot = p.stag > 0 ? Math.sin((p.stag / A.STAGGER_TIME) * 9) * 0.18 : 0;
  };

  // Free flight for one frame. Returns true while still flying.
  const step = (p, dt, controlled = true) => {
    if (!p.fly) return false;
    if (p.regrabCd > 0) p.regrabCd -= dt;
    const ctrl = controlled && (!p.bot || p.daring) ? clamp(p.jx || 0, -1, 1) : 0; // (bots only steer in the air on a daring stunt)
    const drift = -Math.max(0, state.ship.speed || 0) * A.SHIP_DRIFT;
    const gm = (state.env && state.env.gravity) || 1; // low gravity in The Aether (config.ENVIRONMENTS.aether.GRAVITY)
    if (p.chute > 0) {
      p.chute += dt;
      if (!p.chuteOpen && p.chute >= A.CHUTE_DELAY && p.fvy >= 0) p.chuteOpen = true;
    }
    if (p.chuteOpen) {
      // Under the canopy: slow fall, strong steering (humans steer with the stick; others just drift).
      p.fvx += ctrl * A.CHUTE_STEER * dt;
      p.fvx -= (p.fvx - drift) * Math.min(1, A.CHUTE_DRAG * dt);
      p.fvy = p.fvy > A.CHUTE_FALL ? Math.max(A.CHUTE_FALL, p.fvy - 3000 * dt) : Math.min(A.CHUTE_FALL, p.fvy + A.CHUTE_GRAVITY * gm * dt);
    } else {
      p.fvx += ctrl * A.STEER_ACCEL * dt;
      p.fvx -= (p.fvx - drift) * Math.min(1, A.DRAG * dt);
      p.fvy = Math.min(A.MAX_FALL, p.fvy + A.GRAVITY * gm * dt);
    }
    const py = p.y;
    p.x += p.fvx * dt;
    p.y += p.fvy * dt;
    p.apex = Math.min(p.apex, p.y);
    p.rot = p.chuteOpen ? clamp(p.fvx * 0.0003, -0.2, 0.2) : clamp(p.fvx * 0.0008, -0.3, 0.3);
    if (Math.abs(ctrl) > 0.15) p.face = ctrl < 0 ? -1 : 1;
    p.moving = false;

    // Landing: the highest surface we pass through from above.
    if (p.noLand > 0) p.noLand -= dt; // (zipping on a hookshot rope: you pass through decks until the winch stops)
    if (p.fvy >= 0 && !(p.noLand > 0)) {
      let best = null;
      for (const s of surfaces()) {
        const sy = val(s.y);
        if (sy == null) continue; // (a surface that isn't there right now, e.g. no gunship)
        if (s.onLand === undefined && s.d === undefined) continue;
        if (p.x < val(s.x0) || p.x > val(s.x1)) continue;
        if (py < sy && p.y >= sy && (!best || sy < best.y)) best = { s, y: sy };
      }
      if (best) {
        land(p, best.s, best.y);
        return false;
      }
    }
    // Overboard: well below the ship or far past either end.
    // (Past the bow counts only beyond any other deck out there, e.g. a gunship alongside.)
    const farX = Math.max(1600, ...extra.map((s) => (val(s.y) == null ? 0 : val(s.x1)))) + A.OVERBOARD_X;
    if (p.y > (p.chute > 0 ? A.CHUTE_OVERBOARD_Y : A.OVERBOARD_Y) || p.x < -A.OVERBOARD_X || p.x > farX) {
      p.fly = false;
      p.air = false;
      cutChute(p);
      p.fall = true; // the existing fall -> medical bay respawn takes it from here
      p.tumble = true;
      p.tvy = Math.max(p.fvy, 300);
      p.tvx = p.fvx;
      p.carry = null;
      p.moving = false;
      puff(p.x, Math.min(p.y, A.OVERBOARD_Y) - 20, '#ffffff', 5);
      return false;
    }
    return true;
  };

  const land = (p, s, y) => {
    const speed = p.fvy;
    const height = p.chuteOpen ? 0 : y - p.apex; // a parachute landing is a soft one
    cutChute(p);
    p.fly = false;
    p.air = false;
    p.jz = 0;
    p.y = y;
    p.vx = p.fvx * 0.25;
    p.jumpCd = config.MOVE.JUMP_COOLDOWN;
    p.squash = clamp(0.35 + speed / 1400, 0.35, 1);
    p.rot = 0;
    puff(p.x, y - 4, '#d9cbb0', 4 + Math.min(6, Math.round(speed / 200)));
    if (s.d !== undefined) {
      p.d = s.d;
      p.x = clamp(p.x, P[s.d].x0, P[s.d].x1);
    }
    if (s.onLand) s.onLand(p, { surface: s, speed, height, y });
    if (height > A.STUN_HEIGHT) {
      p.ko = Math.max(p.ko || 0, A.STUN_TIME);
      p.prog = 0;
      puff(p.x, y - 30, '#ffe9a8', 5);
      phoneFx(p, 'Hard landing!', null);
    }
  };

  // Overboard tumble (called from the fall branch): speeds up, spins, drifts sideways.
  const tumble = (p, dt) => {
    p.tvy = Math.min(1500, (p.tvy || 300) + A.TUMBLE_ACCEL * dt);
    p.x += (p.tvx || 0) * dt * 0.5;
    p.rot = (p.rot || 0) + A.TUMBLE_SPIN * dt * (p.face || 1);
    return p.tvy;
  };

  const clear = (p) => {
    p.fly = false;
    cutChute(p);
    p.tumble = false;
    p.rot = 0;
    p.squash = 0;
    p.stag = 0;
  };

  return { addSurface, removeSurface, addProvider, surfaces, startFlight, jumpChute, grab, jumpOff, edgeCheck, vault, shove, standing, step, tumble, clear };
}
