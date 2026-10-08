// Ship modules: every gun, the boiler, helm, engines, lift and steam pipes has its own health.
// Broken modules stop working until repaired with a hammer. The boiler's steam reaches the helm,
// engines and lift through pipes; each pipe has a valve and can burst and leak.
import { config } from '../../config.js';
import { SHIP_LAYOUT, onLayoutChange, all, one } from '../../shipLayout.js';
import { connScale } from './nav.js';
import { engineUse } from './shipBuild.js';

const M = config.MODULES;
const L = SHIP_LAYOUT;
const P = L.platforms;

const station = (n) => L.stations.find((s) => s.n === n);

// Shortest distance from a point to a polyline.
function distToPath(x, y, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return best;
}

export function createModules() {
  // `list` and `byName` are filled IN PLACE by rebuild() (state.modules is the same array), which runs now
  // and again whenever a new ship build is applied; modules that survive keep their hp, by name.
  const list = [];
  const byName = {};
  let LIFT = -1; // the lift connector's index
  const add = (m) => list.push({ hp: M.HP, max: M.HP, baseMax: M.HP, broken: false, ...m });

  const rebuild = () => {
    const old = Object.fromEntries(list.map((m) => [m.name, m]));
    list.length = 0;
    LIFT = L.connectors.findIndex((c) => c.type === 'lift');
    for (const [name, mount] of Object.entries(L.gunMounts)) {
      const s = station(name);
      add({ name, kind: 'gun', d: s.d, x: s.x, pos: { x: mount.bx, y: mount.by } });
    }
    for (const s of all('coil')) add({ name: s.n, kind: 'coil', d: s.d, x: s.x, pos: { x: s.x, y: P[s.d].y - 60 } });
    for (const s of all('deflector')) add({ name: s.n, kind: 'shield', d: s.d, x: s.x, pos: { x: s.x, y: P[s.d].y - 60 } });
    const bay = one('bombBay'); // (one bomb bay compartment: L.bombBay; a ship may have none)
    if (bay && L.bombBay) add({ name: bay.n, kind: 'bombbay', d: bay.d, x: bay.x, pos: { x: L.bombBay.x, y: L.bombBay.y - 30 } });
    // Boilers (a build may have several) then the helm.
    for (const s of [...all('boiler'), ...all('helm').slice(0, 1)]) {
      add({ name: s.n, kind: s.kind, d: s.d, x: s.x, pos: { x: s.x, y: P[s.d].y - 60 } });
    }
    for (const e of L.engines) add({ name: e.name, kind: 'engine', d: e.d, x: e.x, pos: { x: e.x, y: P[e.d].y + 38 } });
    const lr = L.liftRepair;
    const liftD = lr ? P.findIndex((p) => p.id === lr.p) : -1;
    if (lr && liftD >= 0 && LIFT >= 0) add({ name: 'Lift', kind: 'lift', d: liftD, x: lr.x, pos: { x: L.connectors[LIFT].xTop, y: P[liftD].y - 80 } }); // (no lift, no module)
    for (const pipe of L.pipes) {
      add({ name: pipe.to + ' Pipe', kind: 'pipe', to: pipe.to, d: pipe.d, x: pipe.valve[0], pos: { x: pipe.valve[0], y: pipe.valve[1] }, points: pipe.points, open: true });
    }
    for (const s of L.sails || []) add({ name: s.n, kind: 'sail', d: s.d, x: s.x, pos: { x: s.x, y: P[s.d].y - s.h * 0.55 } }); // a sail is hit and torn like any module; a hammer mends it

    for (const m of list) {
      const o = old[m.name];
      if (o) Object.assign(m, { hp: o.hp, max: o.max, baseMax: o.baseMax, broken: o.broken });
      if (o && m.kind === 'pipe') m.open = o.open;
    }
    for (const k of Object.keys(byName)) delete byName[k];
    for (const m of list) byName[m.name] = m;
  };
  rebuild();
  onLayoutChange(rebuild);

  const pipeTo = (name) => list.find((m) => m.kind === 'pipe' && m.to === name);

  // Boilers: one steam pool serves the whole ship, so steam is up while ANY boiler is unbroken.
  const boilers = () => list.filter((m) => m.kind === 'boiler');
  const boilerUp = () => boilers().some((m) => !m.broken);

  // Does the boiler's steam reach this module right now?
  const hasSteam = (state, name) => {
    if (!boilerUp() || state.ship.press < M.STEAM_MIN) return false;
    const pipe = pipeTo(name);
    return !pipe || (pipe.open && !pipe.broken);
  };

  // Is the module working (not broken, and powered if it needs steam)?
  // A ship with no boiler at all (S.5e) has no steam to lack: her helm is a plain hand wheel (the pump and the engines still need steam).
  const handWheel = () => boilers().length === 0;
  const works = (state, name) => {
    const m = byName[name];
    if (!m || m.broken) return false;
    if (m.kind === 'helm' && handWheel()) return true;
    return m.kind === 'helm' || m.kind === 'engine' || m.kind === 'lift' ? hasSteam(state, name) : true;
  };

  const damage = (m, amount, puff) => {
    if (amount <= 0 || m.hp <= 0) return;
    m.hp = Math.max(0, m.hp - amount);
    if (m.hp <= 0 && !m.broken) {
      m.broken = true;
      puff?.(m.pos.x, m.pos.y, '#555', 14);
    }
  };

  // An enemy hit at (x, y) in ship coordinates. power scales damage and blast size.
  const hitAt = (x, y, puff, power = 1, mul = 1) => {
    const radius = M.HIT_RADIUS * Math.min(power, 1.6);
    for (const m of list) {
      const dist = m.kind === 'pipe' ? distToPath(x, y, m.points) : Math.hypot(x - m.pos.x, y - m.pos.y);
      if (dist < radius) damage(m, M.HIT_DAMAGE * power * mul * (1 - dist / radius), puff);
    }
  };

  // Hammering: returns true when fully repaired.
  const repair = (m, dt) => {
    m.hp = Math.min(m.max, m.hp + M.REPAIR_RATE * dt);
    if (m.hp >= m.max) {
      m.broken = false;
      return true;
    }
    return false;
  };

  const update = (state, dt) => {
    // Fires scorch nearby modules on the same deck.
    for (const f of state.fires) {
      for (const m of list) if (m.d === f.d && Math.abs(m.x - f.x) < M.FIRE_RADIUS) damage(m, M.FIRE_DAMAGE * dt * (f.big ? config.FIRE.BLAZE.SCORCH_MUL : 1));
    }
    // Lift crawls without steam.
    if (LIFT >= 0) connScale[LIFT] = works(state, 'Lift') ? 1 : M.UNPOWERED_LIFT;
  };

  // Damaged steam-powered modules leak steam in proportion to the damage (broken = full leak).
  // Closing their pipe valve stops the leak (and switches the module off); a module with no
  // pipe (Deflector, Coil) leaks until it is repaired.
  const LEAKY = ['engine', 'helm', 'lift', 'shield', 'coil'];
  const leakRate = (m) => {
    if (!LEAKY.includes(m.kind) || m.hp >= m.max * M.LEAK_BELOW) return 0;
    const pipe = pipeTo(m.name);
    if (pipe && (!pipe.open || pipe.broken)) return 0; // valve shut (or the pipe already counts as burst)
    return M.LEAK_FULL * (1 - m.hp / m.max);
  };
  // Every module leaking right now, worst first: [{ m, rate, pipe }].
  const leaks = () => list.map((m) => ({ m, rate: leakRate(m), pipe: pipeTo(m.name) || null })).filter((l) => l.rate > 0).sort((a, b) => b.rate - a.rate);

  // Steam used per second (at the reference pressure), split by where it goes: the boiler itself
  // and helm/lift ('other'), engines (by how fast they run), burst pipes and damaged modules
  // ('leaks'). Vents, shield, coil and the pump are added by the simulation.
  const drainParts = (state) => {
    const B = config.BOILER;
    const parts = { other: B.USE_BASE, engines: 0, leaks: 0 };
    for (const m of list) {
      if (m.kind !== 'pipe' || !m.open) continue;
      if (m.broken) parts.leaks += M.PIPE_LEAK;
      else if (!byName[m.to] || byName[m.to].broken) continue;
      else if (byName[m.to].kind === 'engine') {
        const live = (state.engines || []).find((q) => q.name === m.to), built = L.engines.find((q) => q.name === m.to);
        parts.engines += engineUse(live ? live.dir : built && built.dir, Math.abs(state.ship.speed)); // (a forward engine: USE_ENGINE x speed; a lift engine burns steam whatever the throttle)
      }
      else parts.other += B.USE_POWERED;
    }
    for (const l of leaks()) parts.leaks += l.rate;
    return parts;
  };
  const pressureDrain = (state) => {
    const p = drainParts(state);
    return p.other + p.engines + p.leaks;
  };

  const reset = () => {
    for (const m of list) {
      m.max = m.baseMax;
      m.hp = m.max;
      m.broken = false;
      if (m.kind === 'pipe') m.open = true;
    }
  };

  // Short status text for a module, or '' if fine.
  const status = (state, name) => {
    const m = byName[name];
    if (!m) return '';
    if (m.kind === 'pipe' && !m.broken && m.open) {
      const t = byName[m.to];
      if (t && leakRate(t) > 0) return `${m.to} is leaking steam - close this valve (or repair it)`;
    }
    if (m.broken) return `${name} is BROKEN - fix it with a hammer${leakRate(m) > 0 ? ' (leaking steam)' : ''}`;
    if (m.kind === 'sail' && m.hp < m.max) return `${name} is torn - mend it with a hammer`;
    if ((m.kind === 'helm' || m.kind === 'engine' || m.kind === 'lift' || m.kind === 'shield' || m.kind === 'coil') && !(m.kind === 'helm' && handWheel()) && !hasSteam(state, name)) return `${name} has no steam!`;
    if (leakRate(m) > 0) return `${name} is leaking steam - repair it${pipeTo(name) ? ' or close its valve' : ''}`;
    if (m.hp < m.max * 0.5) return `${name} is damaged (${Math.round(m.hp)}%)`;
    return '';
  };

  return { list, byName, boilers, boilerUp, handWheel, hasSteam, works, damage, hitAt, repair, update, pressureDrain, drainParts, leaks, leakRate, reset, status, rebuild };
}
