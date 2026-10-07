// Rules for the two deep environments (environments.js hands over to this file):
//
// FUNGAL DEPTHS - spore clouds drift through the ship (state.spores). Crew inside one walk slower and their
//   phone says SPORES! (cough). The air also clogs the engines (state.clogs, one per engine): a clogged
//   engine loses power until a crewmate holds Action at it to clear it.
// THE AETHER - thin air. The gasbag needs more gas to hover (state.env.sink), the engines are strong
//   (state.env.engine / .accel), crew are light (state.env.gravity), and the ship's OXYGEN drains
//   (state.env.o2, 0-1) until someone refills it at the oxygen tank (state.o2tank). With none left the crew
//   walk slowly and the helm and guns work at half speed (state.env.lack, 0-1).
//
// What the rest of the game reads (all on state.env, neutral values in the other environments):
//   gravity (crew gravity multiplier)  engine (forward speed multiplier)  accel (engine pickup multiplier)
//   sink (extra gas to hover - shared with frost's ice)  o2 / lack  walkMul(player)  helmMul()
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';

const P = SHIP_LAYOUT.platforms;
const MAIN = P.findIndex((p) => p.id === 'main');
const DECKS = ['catwalk', 'main', 'lower'].map((id) => P.findIndex((p) => p.id === id));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export function createDeepEnv({ state, puff, phoneFx }) {
  state.spores = []; // clouds: { x, y, rx, ry, vx, seed } in ship coordinates
  state.clogs = SHIP_LAYOUT.engines.map((e) => ({ name: e.name, d: e.d, x: e.x, lvl: 0, prog: 0 })); // spores on each engine (0-1)
  state.o2tank = { name: 'Oxygen Tank', d: MAIN, x: config.ENVIRONMENTS.aether.OXYGEN.TANK_X, prog: 0 };
  let sporeT = 0;
  let seed = 1;
  let warned = { spore: false, clog: false, o2low: false, o2out: false };

  // Put every value back to neutral (a new mission, or another environment).
  const clear = () => {
    state.spores.length = 0;
    for (const c of state.clogs) {
      c.lvl = 0;
      c.prog = 0;
    }
    state.o2tank.prog = 0;
    Object.assign(state.env, { gravity: 1, engine: 1, accel: 1, o2: 1, lack: 0 });
    for (const p of Object.values(state.players)) p.sporeT = 0;
    sporeT = 0;
    warned = { spore: false, clog: false, o2low: false, o2out: false };
  };

  const sporesUpdate = (dt, F, flying) => {
    const S = F.SPORES;
    const C = F.CLOG;
    const E = state.env;
    if (flying && !state.ship.down) {
      if (sporeT <= 0) sporeT = S.FIRST;
      else if ((sporeT -= dt) <= 0) {
        sporeT = rand(S.EVERY_MIN, S.EVERY_MAX);
        if (state.spores.length < S.MAX) {
          const dir = Math.random() < 0.5 ? -1 : 1;
          const d = DECKS[(Math.random() * DECKS.length) | 0];
          state.spores.push({ x: dir > 0 ? -S.RX - 80 : 1600 + S.RX + 80, y: P[d].y - 70, rx: S.RX * rand(0.85, 1.2), ry: S.RY * rand(0.85, 1.15), vx: dir * S.SPEED * rand(0.8, 1.2), seed: seed++ });
          if (!warned.spore) {
            warned.spore = true;
            state.ev.warn = 3;
            state.ev.warnText = 'SPORE CLOUD DRIFTING THROUGH THE SHIP!';
          }
        }
      }
      for (const c of state.spores) c.x += c.vx * dt;
    }
    for (let i = state.spores.length - 1; i >= 0; i--) {
      const c = state.spores[i];
      if (c.x < -c.rx - 120 || c.x > 1600 + c.rx + 120) state.spores.splice(i, 1);
    }
    // Is a point inside a cloud?
    const inCloud = (x, y, pad = 0) => state.spores.some((c) => ((x - c.x) / (c.rx + pad)) ** 2 + ((y - c.y) / (c.ry + pad)) ** 2 < 1);
    // Engines clog a little in the spore-laden air, a lot under a cloud.
    let power = 0;
    for (const c of state.clogs) {
      if (flying && !state.ship.down) c.lvl = Math.min(1, c.lvl + (C.BASE + (inCloud(c.x, P[c.d].y + 20, 30) ? C.CLOUD : 0)) * dt);
      power += 1 - C.POWER * c.lvl;
    }
    E.engine = power / state.clogs.length;
    const worst = Math.max(...state.clogs.map((c) => c.lvl));
    if (worst > 0.6 && !warned.clog) {
      warned.clog = true;
      state.ev.warn = 3;
      state.ev.warnText = 'ENGINES CLOGGING WITH SPORES - CLEAR THEM!';
    } else if (worst < 0.25) warned.clog = false;
    // Crew inside a cloud (on a deck of the ship) are slowed and cough.
    for (const p of Object.values(state.players)) {
      const was = (p.sporeT || 0) > 0;
      const inside = flying && p.d != null && !p.fly && !p.onGunship && !p.fall && inCloud(p.x, P[p.d].y - 50);
      p.sporeT = inside ? 0.6 : Math.max(0, (p.sporeT || 0) - dt);
      if (inside) {
        if (!was && !p.bot && (p.sporeFx || 0) <= 0) {
          p.sporeFx = 5;
          phoneFx(p, 'SPORES! (cough)', [40, 60, 40]);
        }
        if (Math.random() < dt * 2) puff(p.x, p.y - 70 - state.ship.alt, '#b6f06e', 2);
      }
      p.sporeFx = Math.max(0, (p.sporeFx || 0) - dt);
    }
  };

  const aetherUpdate = (dt, F, flying) => {
    const O = F.OXYGEN;
    const E = state.env;
    E.gravity = F.GRAVITY;
    E.sink = F.SINK;
    E.engine = F.ENGINE;
    E.accel = F.ENGINE_ACCEL;
    if (flying && !state.ship.down) E.o2 = Math.max(0, E.o2 - O.DRAIN * dt);
    E.lack = clamp(1 - E.o2 / O.LOW, 0, 1);
    if (E.o2 < 0.3 && !warned.o2low) {
      warned.o2low = true;
      state.ev.warn = 3;
      state.ev.warnText = 'OXYGEN LOW - REFILL THE TANK ON THE BRIDGE!';
    }
    if (E.o2 <= 0 && !warned.o2out) {
      warned.o2out = true;
      state.ev.warn = 3;
      state.ev.warnText = 'OUT OF OXYGEN - EVERYONE SLOWS DOWN!';
    }
    if (E.o2 > 0.55) warned.o2low = warned.o2out = false;
  };

  const update = (dt, id, flying) => {
    const F = config.ENVIRONMENTS[id];
    if (id === 'fungal') sporesUpdate(dt, F, flying);
    else if (id === 'aether') aetherUpdate(dt, F, flying);
    for (const p of Object.values(state.players)) if (id !== 'fungal') p.sporeT = 0;
  };

  // ---- as the rest of the game asks ----
  const near = (p, o, r) => o.d === p.d && Math.abs(o.x - p.x) < r;
  const clogNear = (p) => (state.env.id === 'fungal' ? state.clogs.find((c) => c.lvl >= 0.08 && near(p, c, 75)) || null : null);
  const tankNear = (p) => (state.env.id === 'aether' && state.env.o2 < 0.97 && near(p, state.o2tank, 75) ? state.o2tank : null);
  const unclog = (c) => {
    c.lvl = 0;
    c.prog = 0;
    puff(c.x, P[c.d].y - 40 - state.ship.alt, '#b6f06e', 12);
  };
  const refill = () => {
    state.env.o2 = Math.min(1, state.env.o2 + config.ENVIRONMENTS.aether.OXYGEN.REFILL);
    state.o2tank.prog = 0;
    puff(state.o2tank.x, P[MAIN].y - 60 - state.ship.alt, '#bfe9ff', 12);
  };
  // Crew walking speed multiplier: spores slow, no oxygen slows.
  const walkMul = (p) => {
    const E = state.env;
    let m = 1;
    if (E.id === 'fungal' && (p.sporeT || 0) > 0) m *= config.ENVIRONMENTS.fungal.SPORES.SLOW;
    if (E.id === 'aether') m *= 1 - (1 - config.ENVIRONMENTS.aether.OXYGEN.WALK) * E.lack;
    return m;
  };
  // The helm answers slower with no oxygen; the guns cool down slower.
  const helmMul = () => (state.env.id === 'aether' ? 1 - (1 - config.ENVIRONMENTS.aether.OXYGEN.HELM) * state.env.lack : 1);
  const gunMul = () => (state.env.id === 'aether' ? 1 + config.ENVIRONMENTS.aether.OXYGEN.GUN * state.env.lack : 1);
  // A line for the phone's status area (null = nothing to say).
  const status = (p) => {
    const E = state.env;
    if (E.id === 'fungal') {
      if ((p.sporeT || 0) > 0) return 'SPORES! (cough)';
      const c = clogNear(p);
      if (c) return `${c.name} is clogged with spores - HOLD Action to clear it`;
    } else if (E.id === 'aether') {
      if (E.lack > 0.25) return 'NO AIR! Refill the oxygen tank on the bridge';
      if (tankNear(p)) return `Oxygen ${Math.round(E.o2 * 100)}% - hold Action to refill`;
    }
    return null;
  };

  return { update, clear, clogNear, tankNear, unclog, refill, walkMul, helmMul, gunMul, status };
}
