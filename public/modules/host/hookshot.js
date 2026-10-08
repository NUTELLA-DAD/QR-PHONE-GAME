// Personal hookshot (H3). A tool from the rack (player.carry === 'hookshot'). ATTACK fires the grapple
// along the stick (or the way you face); it flies fast up to HOOKSHOT.RANGE and catches on our ship's
// decks and gasbag, rock, the enemy gunship, bombers, the boss and dogfighters. A miss reels back.
// Caught: you hang on the rope (a pendulum: gravity does the swinging, the stick pumps it), hold
// ACTION to reel in, ATTACK or JUMP lets go and you launch with your speed into free flight (the
// airborne module lands you, grabs ladders, or you go overboard to the medical bay as usual).
// Moving anchors (gunship, bombers, planes) carry the hook with them.
//
// player.hook = { phase: 'out'|'back'|'caught', dx, dy (aim), len, anchor, t, ... }
// An anchor = { kind, pos() -> {x, y} in the WORLD (or null when it is gone), plane? }   (M.1: the hook, the rope and the swinging player are all world objects)
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { inRock } from './course.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';

const H = config.HOOKSHOT;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createHookshot({ state, puff, phoneFx, air, hijack }) {
  const ship = mainShip(state);
  const layout = ship.layout; // (this ship's own layout)
  const bagF = (x, y) => { let f = Infinity; for (const b of layout.gasbags) f = Math.min(f, ((x - b.cx) / b.rx) ** 2 + ((y - b.cy) / b.ry) ** 2); return f; }; // < 1 inside any of the gasbags
  const val = (v) => (typeof v === 'function' ? v() : v);
  // The player's hand, in the world (a flying player already is; one on a deck is in ship coordinates).
  const origin = (p) => (p.fly ? { x: p.x, y: p.y - H.HAND } : { x: toWorldX(ship, p.x), y: toWorldY(ship, p.y - H.HAND - (p.jz || 0)) });

  // What does a point (world coordinates) catch on? Returns an anchor or null. prev = gasbag value one step back.
  const probe = (wx, wy, prev) => {
    const x = toShipX(ship, wx); // (our own decks, the gunship's and the gasbag are in ship coordinates)
    const y = toShipY(ship, wy);
    // The enemy gunship's decks and hull (and our own decks): horizontal edges.
    for (const s of air.surfaces()) {
      if (s.onLand === undefined && s.d === undefined) continue;
      const sy = val(s.y);
      if (sy == null) continue;
      const x0 = val(s.x0);
      const x1 = val(s.x1);
      const gun = typeof s.id === 'string' && s.id.startsWith('gunship');
      if (x < x0 - 6 || x > x1 + 6) continue;
      if (y >= sy - H.THICK && y <= sy + (gun ? H.GUNSHIP_DEPTH : H.THICK)) {
        const ox = x - x0;
        const oy = y - sy;
        const id = s.id;
        return {
          kind: gun ? 'gunship' : 'ship',
          pos: () => {
            const t = air.surfaces().find((q) => q.id === id);
            if (!t || val(t.y) == null) return null;
            return { x: toWorldX(ship, val(t.x0) + ox), y: toWorldY(ship, val(t.y) + oy) };
          },
          surf: true,
        };
      }
    }
    // The gasbag: crossing its outline either way.
    const f = bagF(x, y);
    if (prev != null && (prev - 1) * (f - 1) <= 0) {
      const ax = x;
      const ay = y;
      return { kind: 'ship', pos: () => ({ x: toWorldX(ship, ax), y: toWorldY(ship, ay) }) };
    }
    // Rock (it stays where it is in the world).
    if (inRock(state, wx, wy)) {
      return { kind: 'rock', pos: () => ({ x: wx, y: wy }) };
    }
    // Enemy bodies (world coordinates).
    const ent = (e, hw, hh, extra) => {
      if (Math.abs(wx - e.x) > hw || Math.abs(wy - e.y) > hh) return null;
      const ox = wx - e.x;
      const oy = wy - e.y;
      return { kind: 'enemy', ent: e, pos: () => ((e.hp != null && e.hp <= 0) ? null : { x: e.x + ox, y: e.y + oy }), ...extra };
    };
    for (const b of state.bombers || []) {
      const a = ent(b, H.BOMBER_HW, H.BOMBER_HH);
      if (a && b.hp > 0) return a;
    }
    if (state.boss && state.boss.hp > 0) {
      const a = ent(state.boss, H.BOSS_HW, H.BOSS_HH);
      if (a) return a;
    }
    for (const s of state.strafers || []) {
      if (s.hp > 0 && Math.hypot(wx - s.x, wy - s.y) < H.PLANE_R) {
        const a = ent(s, H.PLANE_R, H.PLANE_R, { plane: s });
        if (a) return a;
      }
    }
    // The big enemy fighter (she can be hijacked too).
    const big = state.enemy;
    if (big && big.dead <= 0 && big.heading != null && big.hp > 0 && Math.hypot(wx - big.x, wy - big.y) < H.PLANE_R * 1.3) {
      const a = ent(big, H.PLANE_R * 1.3, H.PLANE_R * 1.3, { plane: big });
      if (a) return a;
    }
    return null;
  };

  // Cast along (dx, dy) from o: the first thing it catches within range -> { dist, anchor } (anchor null = a miss).
  const cast = (o, dx, dy) => {
    let prev = null;
    for (let d = 0; d <= H.RANGE; d += 12) {
      const x = o.x + dx * d;
      const y = o.y + dy * d;
      const f = bagF(toShipX(ship, x), toShipY(ship, y));
      if (d >= H.SKIP) {
        const a = probe(x, y, prev);
        if (a) return { dist: d, anchor: a };
      }
      prev = f;
    }
    return { dist: H.RANGE, anchor: null };
  };

  const clear = (p) => {
    p.hook = null;
  };

  // The ATTACK button for someone carrying the hookshot: fire, or let go. True = handled (no shove).
  const onAttack = (p) => {
    if (p.carry !== 'hookshot' || (p.bot && !p.daring)) return false; // (a bot only fires it while on a daring stunt)
    const h = p.hook;
    if (h) {
      if (h.phase === 'caught' && h.t >= H.RELEASE_LOCK) release(p);
      return true;
    }
    if ((p.hookCd || 0) > 0 || p.lock || p.conn != null || p.onGunship || p.ko > 0 || p.hj) return true;
    const o = origin(p);
    let dx = (p.jx || 0) * ship.pose.f; // (the stick is along the ship; the hook flies along the world)
    let dy = p.jy || 0;
    if (Math.hypot(dx, dy) < 0.3) {
      dx = (p.face || 1) * (p.fly ? 1 : ship.pose.f); // (face: the ship's way on a deck, the world's in the air)
      dy = -0.25;
    }
    const m = Math.hypot(dx, dy);
    dx /= m;
    dy /= m;
    const c = cast(o, dx, dy);
    p.hook = { phase: 'out', dx, dy, len: 0, anchor: c.anchor, dist: c.dist, t: 0 };
    if (Math.abs(dx) > 0.2) p.face = (dx < 0 ? -1 : 1) * (p.fly ? 1 : ship.pose.f);
    p.swingT = performance.now();
    puff(o.x, o.y, '#ffffff', 2);
    return true;
  };

  // Let go: keep your speed and fly.
  function release(p) {
    const h = p.hook;
    p.hook = null;
    p.hookCd = H.MISS_COOLDOWN;
    if (!h || !p.fly) return false;
    p.fvx *= H.BOOST;
    p.fvy *= H.BOOST;
    capSpeed(p);
    p.apex = toShipY(ship, p.y); // (the fall height is measured on the ship)
    puff(p.x, p.y - 30, '#ffffff', 3);
    return true;
  }

  const capSpeed = (p) => {
    const sp = Math.hypot(p.fvx, p.fvy);
    if (sp > H.MAX_SPEED) {
      p.fvx *= H.MAX_SPEED / sp;
      p.fvy *= H.MAX_SPEED / sp;
    }
  };

  // JUMP on the rope lets go too.
  const onJump = (p) => {
    const h = p.hook;
    if (h && h.phase === 'caught') {
      if (h.t >= H.RELEASE_LOCK) release(p);
      return true;
    }
    return false;
  };

  // Hook caught: the player leaves the deck (if there) and swings.
  const attach = (p, h, a) => {
    const o = origin(p);
    const dx = a.x - o.x;
    const dy = a.y - o.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    if (!p.fly) {
      p.y -= (p.jz || 0) + 5; // lift clear of the deck so it does not land straight back
      air.startFlight(p, 0, 0);
      p.fvx = (dx / d) * H.POP + ship.pose.vx;
      p.fvy = Math.min((dy / d) * H.POP, -H.POP_UP) + ship.pose.vy; // always a little up, so you leave the deck instead of landing straight back
    }
    h.phase = 'caught';
    h.t = 0;
    h.len = Math.max(H.MIN_LEN, d);
    h.ax = a.x;
    h.ay = a.y;
    puff(a.x, a.y, '#ffe9a8', 5);
    if (state.sfxQ) state.sfxQ.push(['clang', true]);
  };

  // Every frame, for a player with a hook, BEFORE air.step (rope + reel).
  const pre = (p, dt) => {
    const h = p.hook;
    if (!h) return;
    h.t += dt;
    const a0 = h.anchor;
    if (a0 && a0.drift) a0.drift(dt);
    if (h.phase === 'caught') {
      const a = a0.pos();
      if (!a || !p.fly) return clear(p);
      h.vax = (a.x - h.ax) / Math.max(dt, 1e-3);
      h.vay = (a.y - h.ay) / Math.max(dt, 1e-3);
      h.ax = a.x;
      h.ay = a.y;
      h.len = Math.max(H.MIN_LEN, h.len - (p.fire ? H.REEL_SPEED : H.AUTO_REEL) * dt); // the rope always winds in slowly; hold ACTION to zip
      const dx = h.ax - p.x;
      const dy = h.ay - (p.y - H.HAND);
      const dist = Math.hypot(dx, dy) || 1;
      if (p.fire) {
        // Zip: keep the rope taut and drive toward the hook at REEL_SPEED (relative to a moving hook).
        h.len = Math.max(H.MIN_LEN, Math.min(h.len, dist));
        p.noLand = 0.12;
        const nx = dx / dist;
        const ny = dy / dist;
        // (a straight winch pull: it beats gravity, so a long zip does not sag onto the decks below)
        const k = Math.min(1, 12 * dt);
        p.fvx += ((h.vax || 0) + nx * H.REEL_SPEED - p.fvx) * k;
        p.fvy += ((h.vay || 0) + ny * H.REEL_SPEED - p.fvy) * k;
      }
      p.fvx += (p.jx || 0) * ship.pose.f * H.PUMP * dt;
    }
  };

  // After air.step while still flying: the rope constraint.
  const post = (p, dt) => {
    const h = p.hook;
    if (!h || h.phase !== 'caught') return;
    const hy = H.HAND;
    let dx = p.x - h.ax;
    let dy = p.y - hy - h.ay;
    const d = Math.hypot(dx, dy) || 1;
    if (d > h.len) {
      const nx = dx / d;
      const ny = dy / d;
      p.x = h.ax + nx * h.len;
      p.y = h.ay + ny * h.len + hy;
      // Remove the outward part of the velocity (relative to a moving anchor).
      const rvx = p.fvx - (h.vax || 0);
      const rvy = p.fvy - (h.vay || 0);
      const vr = rvx * nx + rvy * ny;
      if (vr > 0) {
        p.fvx -= vr * nx;
        p.fvy -= vr * ny;
      }
      dx = p.x - h.ax;
      dy = p.y - hy - h.ay;
    }
    capSpeed(p);
    p.rot = clamp(Math.atan2(h.ax - p.x, p.y - hy - h.ay) * -0.6, -0.8, 0.8) * 0.6; // lean toward the swing
    const dist = Math.hypot(dx, dy);
    // Reeled right in.
    const a = h.anchor;
    if (p.fire && a && a.plane && dist < H.BOARD_AT + 10) {
      p.hook = null;
      hijack.board(p, a.plane);
    } else if (p.fire && a && a.surf && dist < H.LEDGE_AT && h.len <= H.MIN_LEN + 1) {
      // Climb up onto a deck edge: hop up over it.
      p.hook = null;
      p.hookCd = H.MISS_COOLDOWN;
      p.fvy = -H.LEDGE_POP;
      p.fvx = 0;
      p.y = Math.min(p.y, h.ay - 12);
      puff(p.x, p.y, '#ffffff', 3);
    }
  };

  // Every frame for hook phases out / back (the flight of the hook itself); also the cooldown.
  const fly = (p, dt) => {
    if ((p.hookCd || 0) > 0) p.hookCd -= dt;
    const h = p.hook;
    if (!h || h.phase === 'caught') return;
    h.t += 0; // (time in 'caught' counts in pre)
    const o = origin(p);
    if (h.phase === 'out') {
      h.len += H.SPEED * dt;
      let dist = h.dist;
      if (h.anchor) {
        const a = h.anchor.pos();
        if (!a) return clear(p);
        dist = Math.hypot(a.x - o.x, a.y - o.y);
        h.dx = (a.x - o.x) / Math.max(1, dist);
        h.dy = (a.y - o.y) / Math.max(1, dist);
        if (h.len >= dist) return attach(p, h, a);
      } else if (h.len >= dist) {
        h.phase = 'back';
      }
    } else {
      h.len -= H.BACK_SPEED * dt;
      if (h.len <= 0) {
        p.hook = null;
        p.hookCd = H.MISS_COOLDOWN;
      }
    }
  };

  // Where the drawing finds the end of the rope: { from, to, caught } in the world, or null.
  const rope = (p) => {
    const h = p.hook;
    if (!h) return null;
    const o = origin(p);
    if (h.phase === 'caught') return { from: o, to: { x: h.ax, y: h.ay }, caught: true };
    return { from: o, to: { x: o.x + h.dx * h.len, y: o.y + h.dy * h.len }, caught: false };
  };

  return { onAttack, onJump, release, pre, post, fly, clear, rope, cast, origin };
}
