// Special enemies (each needs a different answer from the crew):
// - Gyro-Saws: spinning blade drones that circle the ship, then dash in to cut the hull, again
//   and again until shot down.
// - Imp Swarm: a big cloud of tiny winged imps diving at the ship (one shot each).
// - Sniper Zeppelin: hangs back far away and charges a beam. A thin red line tracks the ship,
//   then flashes as it locks: move out of the line or block it with the Deflector.
// - Harpoon Tug: harpoons the hull and drags the ship down and backward until someone shoots
//   the cable (or hacks it with a sword at the hook) or shoots the tug down.
import { spawnPace, crewMul } from './crewscale.js';
import { config } from '../../config.js';
import { keepClear, inRock } from './course.js';
import { pop } from './popups.js';
import { shellDmg } from './aim.js';
import { targetShip } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';

const SP = config.SPECIALS;
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createSpecials({ state, puff, impact, hitsShip, credit, shieldBlocks }) {
  const ship = targetShip(state, null); // (B.3: the ship this system hunts and flies round: ships.js targetShip, ships[0] today; B.4 chooses per enemy)
  const layout = ship.layout;
  const B = layout.bounds;
  const SH = layout.shield;
  const S = (state.specials = { saws: [], imps: [], snipers: [], tugs: [], beams: [] });
  let timer = SP.FIRST_AFTER;
  const lap = () => (state.course ? state.course.lap : 1);
  const progress = () => (state.course ? state.course.progress || 0 : 0);
  const warn = (text, secs = 3) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const touches = (x, y, r) => { // (a round thing at world (x, y): hitsShip wants ship coordinates)
    const sx = toShipX(ship, x);
    const sy = toShipY(ship, y);
    return [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => hitsShip(sx + dx, sy + dy));
  };
  const mid = () => ({ x: toWorldX(ship, layout.aimPoint.x), y: toWorldY(ship, layout.aimPoint.y) });
  const refX = () => toWorldX(ship, layout.refPoint.x); // (the middle of the ship along the sky)
  // (The specials keep station on the ship: their steering is by speed relative to her, so her own world speed is added to what they want and
  // carried in their moves. At rest against her, vx = her speed.)
  const side = () => (Math.random() < 0.5 ? -1 : 1);
  const kill = (shell, x, y, size = 1) => {
    state.kills += 1;
    credit?.(shell);
    puff(x, y, '#ff5a1f', 18 * size);
    pop(state, x, y - 50, 'kill', '#ffd23f', size);
  };

  // ---------- Spawning ----------
  const spawnSaws = () => {
    const s = side();
    const n = SP.SAW_COUNT + (lap() > 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      S.saws.push({ x: toWorldX(ship, layout.refPoint.x + s * (2200 + i * 200)), y: mid().y + rand(-500, 400), vx: ship.pose.vx, vy: 0, hp: SP.SAW_HP, mode: 'orbit', t: rand(1, 2.5), ang: rand(0, 6.28), spin: 0, hit: 0 });
    }
    warn('GYRO-SAWS! SHOOT THEM BEFORE THEY CUT IN!');
  };
  const spawnImps = () => {
    const n = Math.max(2, Math.round((SP.IMP_COUNT + (lap() - 1) * 4) * crewMul(state, 'count')));
    for (let i = 0; i < n; i++) {
      const s = i % 2 ? -1 : 1;
      // (Aim a little inside the outline so they really reach the hull.)
      const [ox, oy] = layout.samples[(Math.random() * layout.samples.length) | 0];
      const tx = ox + (SH.cx - ox) * 0.15;
      const ty = oy + (SH.cy - oy) * 0.15;
      S.imps.push({ x: toWorldX(ship, layout.refPoint.x + s * rand(1800, 2600)), y: mid().y + rand(-900, 700), vx: ship.pose.vx, vy: 0, tx, ty, hp: 1, flap: rand(0, 6), delay: i * 0.12 });
    }
    warn('IMP SWARM! ALL GUNS - AND SWING THAT SHIELD!');
  };
  const spawnSniper = () => {
    if (S.snipers.length) return spawnSaws();
    const s = side();
    S.snipers.push({ x: toWorldX(ship, layout.refPoint.x + s * 2600), y: mid().y - rand(300, 700), side: s, hp: SP.SNIPER_HP, mode: 'move', t: 2, aim: s * ship.pose.f > 0 ? Math.PI : 0, shots: SP.SNIPER_SHOTS, hit: 0 });
    warn('SNIPER ZEPPELIN! WATCH FOR THE RED LINE!');
  };
  const spawnTug = () => {
    if (S.tugs.length) return spawnImps();
    const s = side();
    const tx = toWorldX(ship, layout.refPoint.x + s * 2400);
    S.tugs.push({ x: tx, y: keepClear(state, tx, mid().y + rand(200, 500), 160, 0, 300), side: s, hp: SP.TUG_HP, mode: 'approach', t: 0, hook: null, harpoon: null, cable: SP.CABLE_HP, hit: 0 });
    warn('HARPOON TUG! SHOOT THE CABLE IF IT HOOKS US!');
  };

  const director = (dt) => {
    if (state.ship.down || state.phase !== 'flying' || state.boss || !Object.keys(state.players).length) return;
    if (lap() === 1 && progress() < 0.1) return;
    if ((timer -= dt * (state.tempo ? state.tempo.rate : 1)) > 0) return;
    const pace = spawnPace(state);
    const open = state.course && state.course.map && state.course.map.open;
    timer = (rand(SP.EVERY_MIN, SP.EVERY_MAX) / pace / (1 + (lap() - 1) * 0.15)) * (open ? 2 : 1);
    const pool = [spawnSaws, spawnImps, spawnSniper];
    if (lap() > 1 || progress() > 0.3) pool.push(spawnTug, spawnTug);
    pool[(Math.random() * pool.length) | 0]();
  };

  // ---------- Behaviour ----------
  const updateSaws = (dt) => {
    const vs = ship.pose.vx;
    for (const s of S.saws) {
      s.spin += dt * 14;
      s.hit = Math.max(0, s.hit - dt);
      const m = mid();
      if (s.mode === 'orbit') {
        // Circle the ship at a distance (following round from wherever it is now), then pick a
        // spot and dash at it.
        const here = Math.atan2((toShipY(ship, s.y) - SH.cy) / SH.ry, (toShipX(ship, s.x) - SH.cx) / SH.rx);
        s.ang = here + 0.4;
        const tx = toWorldX(ship, SH.cx + SH.rx * 1.4 * Math.cos(s.ang));
        const ty = toWorldY(ship, SH.cy + SH.ry * 1.4 * Math.sin(s.ang));
        s.vx += ((tx - s.x) * 2 + vs - s.vx) * Math.min(1, dt * 3);
        s.vy += ((ty - s.y) * 2 - s.vy) * Math.min(1, dt * 3);
        const v = Math.hypot(s.vx - vs, s.vy);
        if (v > SP.SAW_SPEED) (s.vx = vs + (s.vx - vs) * (SP.SAW_SPEED / v)), (s.vy *= SP.SAW_SPEED / v);
        if ((s.t -= dt) <= 0 && Math.hypot(s.x - m.x, s.y - m.y) < 2200) {
          const [sx0, sy0] = layout.samples[(Math.random() * layout.samples.length) | 0];
          const px = toWorldX(ship, sx0);
          const py = toWorldY(ship, sy0);
          const d = Math.hypot(px - s.x, py - s.y) || 1;
          s.vx = ((px - s.x) / d) * SP.SAW_SPEED * 2.2 + vs;
          s.vy = ((py - s.y) / d) * SP.SAW_SPEED * 2.2;
          s.mode = 'dash';
          s.t = 1.6;
        }
      } else if ((s.t -= dt) <= 0) {
        s.mode = 'orbit';
        s.t = rand(3.5, 6);
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.y = keepClear(state, s.x, s.y, 40);
      // Cut the hull, then bounce off and come round again.
      if (!state.ship.down && s.mode === 'dash' && touches(s.x, s.y, 26)) {
        impact(toShipX(ship, s.x), toShipY(ship, s.y), SP.SAW_IMPACT);
        puff(s.x, s.y, '#ffe9a8', 10);
        s.vx = vs - (s.vx - vs) * 0.6;
        s.vy *= -0.6;
        s.mode = 'orbit';
        s.t = rand(4, 7);
      }
      // The Deflector knocks them back (and dents them).
      if (shieldBlocks(s.x, s.y)) {
        s.hp -= 1;
        s.vx = (s.x - m.x) * 1.2 + vs;
        s.vy = (s.y - m.y) * 1.2;
        s.mode = 'orbit';
        s.t = rand(2, 3);
        if (s.hp <= 0) kill(null, s.x, s.y, 0.8);
      }
    }
    S.saws = S.saws.filter((s) => s.hp > 0);
  };

  const updateImps = (dt) => {
    const vs = ship.pose.vx;
    for (const b of S.imps) {
      if ((b.delay -= dt) > 0) { // (still waiting to set off: it hangs in the air beside the ship, so it goes along with her)
        b.x += vs * dt;
        continue;
      }
      b.flap += dt * 18;
      const tx = toWorldX(ship, b.tx);
      const ty = toWorldY(ship, b.ty);
      const dx = tx - b.x;
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.vx += ((dx / d) * SP.IMP_SPEED + vs - b.vx) * Math.min(1, dt * 1.8);
      b.vy += ((dy / d) * SP.IMP_SPEED - b.vy) * Math.min(1, dt * 1.8);
      b.x += b.vx * dt + Math.sin(b.flap * 0.4) * 60 * dt;
      b.y += b.vy * dt + Math.cos(b.flap * 0.3) * 60 * dt;
      b.y = keepClear(state, b.x, b.y, 20);
      if (!state.ship.down && touches(b.x, b.y, 10)) {
        b.hp = 0;
        puff(b.x, b.y, '#c0392b', 6);
        impact(toShipX(ship, b.x), toShipY(ship, b.y), SP.IMP_IMPACT);
      } else if (shieldBlocks(b.x, b.y)) {
        b.hp = 0;
        state.kills += 1;
      }
    }
    S.imps = S.imps.filter((b) => b.hp > 0 && Math.abs(b.x - refX()) < 6000);
  };

  // Walk along the beam; it stops at the Deflector or the first part of the ship it meets.
  const fireBeam = (z) => {
    const step = 40;
    let hitShip = null;
    let blocked = false;
    let len = 0;
    for (; len < 4200; len += step) {
      const x = z.x + Math.cos(z.aim) * len;
      const y = z.y + Math.sin(z.aim) * len;
      if (len > 200 && inRock(state, x, y)) break;
      if (shieldBlocks(x, y)) {
        blocked = true;
        break;
      }
      if (hitsShip(toShipX(ship, x), toShipY(ship, y))) {
        hitShip = { x, y };
        break;
      }
    }
    S.beams.push({ x: z.x, y: z.y, ang: z.aim, len, t: 0.35 });
    if (hitShip && !state.ship.down) {
      impact(toShipX(ship, hitShip.x), toShipY(ship, hitShip.y), SP.SNIPER_IMPACT);
      puff(hitShip.x, hitShip.y, '#ffffff', 16);
      pop(state, hitShip.x, hitShip.y - 60, 'bigHit', '#ff5a5a', 1.3);
    } else if (blocked) {
      pop(state, z.x + Math.cos(z.aim) * len, z.y + Math.sin(z.aim) * len - 60, 'DEFLECTED!', '#9fe8ff', 1.1);
    }
  };

  const updateSnipers = (dt) => {
    for (const z of S.snipers) {
      z.hit = Math.max(0, z.hit - dt);
      const m = mid();
      // Keep station far out to one side, above the ship.
      const home = z.shots > 0 ? { x: toWorldX(ship, layout.refPoint.x + z.side * 1650), y: m.y - 450 } : { x: toWorldX(ship, layout.refPoint.x + z.side * 4200), y: m.y - 900 };
      z.x += Math.max(-200 * dt, Math.min(200 * dt, home.x - z.x)) + ship.pose.vx * dt; // (200 px/s against the ship, carried along with her)
      const wantY = keepClear(state, z.x, home.y, 160, 0, 300);
      z.y += Math.max(-120 * dt, Math.min(120 * dt, wantY - z.y));
      const want = Math.atan2(m.y - z.y, m.x - z.x);
      if (z.mode === 'move') {
        if ((z.t -= dt) <= 0 && z.shots > 0 && Math.abs(z.x - home.x) < 300) (z.mode = 'charge'), (z.t = SP.SNIPER_CHARGE);
        z.aim += angDiff(want, z.aim) * Math.min(1, dt * 2);
      } else if (z.mode === 'charge') {
        // Track the ship (a little slowly), then lock.
        z.aim += Math.max(-0.5 * dt, Math.min(0.5 * dt, angDiff(want, z.aim)));
        if ((z.t -= dt) <= 0) (z.mode = 'lock'), (z.t = SP.SNIPER_LOCK);
      } else if (z.mode === 'lock' && (z.t -= dt) <= 0) {
        fireBeam(z);
        z.shots -= 1;
        z.mode = 'move';
        z.t = rand(2.5, 4);
      }
    }
    S.snipers = S.snipers.filter((z) => z.hp > 0 && !(z.shots <= 0 && Math.abs(z.x - refX()) > 4000));
    for (const b of S.beams) b.t -= dt;
    S.beams = S.beams.filter((b) => b.t > 0);
  };

  const updateTugs = (dt) => {
    const vs = ship.pose.vx;
    for (const g of S.tugs) {
      if (g.hp <= 0) continue; // shot down (removed below)
      g.hit = Math.max(0, g.hit - dt);
      if (g.mode === 'pull' && !g.hook) g.mode = 'flee'; // cable gone
      const m = mid();
      if (g.mode === 'approach') {
        // Close in below and to one side, then fire the harpoon.
        const tx = toWorldX(ship, layout.refPoint.x + g.side * 1300);
        const ty = m.y + 650;
        g.x += Math.max(-320 * dt, Math.min(320 * dt, tx - g.x)) + vs * dt;
        g.y += Math.max(-200 * dt, Math.min(200 * dt, keepClear(state, g.x, ty, 120, 0, 300) - g.y));
        if (Math.abs(g.x - tx) < 80 && !g.harpoon && (g.t -= dt) <= 0) {
          const [sx0, sy0] = layout.samples[(Math.random() * 10) | 0]; // somewhere on the underside
          const hx = toWorldX(ship, sx0);
          const hy = toWorldY(ship, sy0);
          const d = Math.hypot(hx - g.x, hy - g.y) || 1;
          g.harpoon = { x: g.x, y: g.y, vx: ((hx - g.x) / d) * 900 + vs, vy: ((hy - g.y) / d) * 900, life: 2 };
          g.t = 3;
        }
        const h = g.harpoon;
        if (h) {
          h.x += h.vx * dt;
          h.y += h.vy * dt;
          h.life -= dt;
          if (shieldBlocks(h.x, h.y) || h.life <= 0) g.harpoon = null;
          else if (hitsShip(toShipX(ship, h.x), toShipY(ship, h.y))) {
            g.hook = { x: toShipX(ship, h.x), y: toShipY(ship, h.y) }; // ship coordinates
            g.harpoon = null;
            g.mode = 'pull';
            g.cable = SP.CABLE_HP;
            puff(h.x, h.y, '#ffe9a8', 10);
            warn('HARPOONED! SHOOT THE CABLE OR HACK IT WITH A SWORD!', 4);
          }
        }
      } else if (g.mode === 'pull') {
        // Haul away down and backward, dragging the ship.
        const tx = toWorldX(ship, layout.refPoint.x + g.side * 1500);
        const ty = m.y + 900;
        g.x += Math.max(-150 * dt, Math.min(150 * dt, tx - g.x)) + vs * dt;
        g.y += Math.max(-150 * dt, Math.min(150 * dt, keepClear(state, g.x, ty, 120, 0, 300) - g.y));
        if (!state.ship.down) {
          ship.pose.y += SP.TUG_PULL * dt; // (down: her y grows as she sinks)
          state.ship.speed += (-0.15 - state.ship.speed) * Math.min(1, dt * SP.TUG_SLOW);
        }
        // A crew member swinging a sword at the hook cuts the line.
        const now = performance.now();
        for (const p of Object.values(state.players)) {
          if (p.carry === 'sword' && now - (p.swingT || -1e9) < 150 && Math.hypot(p.x - g.hook.x, p.y - 50 - g.hook.y) < 110) g.cable = 0;
        }
        if (g.cable <= 0) {
          g.mode = 'flee';
          g.hook = null;
          puff(g.x, g.y, '#ffe9a8', 8);
          pop(state, m.x, m.y - 300, 'SNAP!', '#ffd23f', 1.2);
          warn('CABLE CUT!', 2);
        }
      } else {
        g.x += (g.side * ship.pose.f * 400 + vs) * dt; // (flees away from her: side is a ship side, f turns it into the world's)
        g.y -= 60 * dt;
      }
      if ((g.age = (g.age || 0) + dt) > 1.5 && inRock(state, g.x, g.y)) (g.hp = 0), kill(null, g.x, g.y);
    }
    S.tugs = S.tugs.filter((g) => g.hp > 0 && Math.abs(g.x - refX()) < 5000);
  };

  // ---------- Crew shells ----------
  const distToSeg = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const shellHits = () => {
    for (const sh of state.shells) {
      if (sh.life <= 0) continue;
      const hitOne = (list, r, onKill) => {
        for (const e of list) {
          if (e.hp > 0 && Math.hypot(sh.x - e.x, (sh.y - e.y) * (r.squash || 1)) < r.r) {
            sh.life = 0;
            e.hp -= shellDmg(sh, e);
            e.hit = 0.15;
            puff(sh.x, sh.y, '#ffcf40', 6);
            if (e.hp <= 0) onKill(e);
            return true;
          }
        }
        return false;
      };
      if (hitOne(S.imps, { r: 22 }, (e) => ((state.kills += 1), credit?.(sh), puff(e.x, e.y, '#c0392b', 6)))) continue;
      if (hitOne(S.saws, { r: 52 }, (e) => kill(sh, e.x, e.y, 0.9))) continue;
      if (hitOne(S.snipers, { r: 130, squash: 2.6 }, (e) => (kill(sh, e.x, e.y, 1.4), state.wrecks.push({ x: e.x, y: e.y, vx: ship.pose.vx, vy: -40, spin: 0, kind: 'cargo' })))) continue;
      if (hitOne(S.tugs, { r: 60 }, (e) => (kill(sh, e.x, e.y), (e.hook = null)))) continue;
      // The harpoon cable.
      for (const g of S.tugs) {
        if (g.mode !== 'pull' || !g.hook) continue;
        if (distToSeg(sh.x, sh.y, g.x, g.y, toWorldX(ship, g.hook.x), toWorldY(ship, g.hook.y)) < 22) {
          sh.life = 0;
          g.cable -= 1;
          puff(sh.x, sh.y, '#ffe9a8', 6);
          break;
        }
      }
    }
  };

  const update = (dt) => {
    director(dt);
    updateSaws(dt);
    updateImps(dt);
    updateSnipers(dt);
    updateTugs(dt);
    shellHits();
  };

  const reset = () => {
    S.saws.length = 0;
    S.imps.length = 0;
    S.snipers.length = 0;
    S.tugs.length = 0;
    S.beams.length = 0;
    timer = Math.max(timer, 15);
  };

  // Calm: stragglers further than `far` from the ship (or all when `force`) are gone; a hooked tug stays.
  // Returns how many remain.
  const withdraw = (far, force) => {
    const m = mid();
    const stays = (p) => !force && (Math.hypot(p.x - m.x, p.y - m.y) < far || p.hook);
    S.saws = S.saws.filter(stays);
    S.imps = S.imps.filter(stays);
    S.snipers = S.snipers.filter(stays);
    S.tugs = S.tugs.filter(stays);
    return S.saws.length + S.imps.length + S.snipers.length + S.tugs.length;
  };
  return { update, reset, withdraw, spawn: { saws: spawnSaws, imps: spawnImps, sniper: spawnSniper, tug: spawnTug } };
}
