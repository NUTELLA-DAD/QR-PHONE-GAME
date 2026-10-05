// Ship modules: every gun, the boiler, helm, engines, lift and steam pipes has its own health.
// Broken modules stop working until repaired with a hammer. The boiler's steam reaches the helm,
// engines and lift through pipes; each pipe has a valve and can burst and leak.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { connScale } from './nav.js';

const M = config.MODULES;
const L = SHIP_LAYOUT;
const P = L.platforms;
const LIFT = L.connectors.findIndex((c) => c.type === 'lift');

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
  const list = [];
  const add = (m) => list.push({ hp: M.HP, max: M.HP, broken: false, ...m });

  for (const [name, mount] of Object.entries(L.gunMounts)) {
    const s = station(name);
    add({ name, kind: 'gun', d: s.d, x: s.x, pos: { x: mount.bx, y: mount.by } });
  }
  for (const name of ['Boiler', 'Helm']) {
    const s = station(name);
    add({ name, kind: name.toLowerCase(), d: s.d, x: s.x, pos: { x: s.x, y: P[s.d].y - 60 } });
  }
  for (const e of L.engines) add({ name: e.name, kind: 'engine', d: e.d, x: e.x, pos: { x: e.x, y: P[e.d].y + 38 } });
  const lr = L.liftRepair;
  const liftD = P.findIndex((p) => p.id === lr.p);
  add({ name: 'Lift', kind: 'lift', d: liftD, x: lr.x, pos: { x: L.connectors[LIFT].xTop, y: P[liftD].y - 80 } });
  for (const pipe of L.pipes) {
    add({ name: pipe.to + ' Pipe', kind: 'pipe', to: pipe.to, d: pipe.d, x: pipe.valve[0], pos: { x: pipe.valve[0], y: pipe.valve[1] }, points: pipe.points, open: true });
  }

  const byName = Object.fromEntries(list.map((m) => [m.name, m]));
  const pipeTo = (name) => list.find((m) => m.kind === 'pipe' && m.to === name);

  // Does the boiler's steam reach this module right now?
  const hasSteam = (state, name) => {
    const boiler = byName.Boiler;
    if (boiler.broken || state.ship.press < M.STEAM_MIN) return false;
    const pipe = pipeTo(name);
    return !pipe || (pipe.open && !pipe.broken);
  };

  // Is the module working (not broken, and powered if it needs steam)?
  const works = (state, name) => {
    const m = byName[name];
    if (!m || m.broken) return false;
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

  // An enemy hit at (x, y) in ship coordinates.
  const hitAt = (x, y, puff) => {
    for (const m of list) {
      const dist = m.kind === 'pipe' ? distToPath(x, y, m.points) : Math.hypot(x - m.pos.x, y - m.pos.y);
      if (dist < M.HIT_RADIUS) damage(m, M.HIT_DAMAGE * (1 - dist / M.HIT_RADIUS), puff);
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
      for (const m of list) if (m.d === f.d && Math.abs(m.x - f.x) < M.FIRE_RADIUS) damage(m, M.FIRE_DAMAGE * dt);
    }
    // Lift crawls without steam.
    connScale[LIFT] = works(state, 'Lift') ? 1 : M.UNPOWERED_LIFT;
  };

  // How much steam pressure is lost this frame (engines use it; burst pipes leak it).
  const pressureDrain = (state) => {
    let drain = 2;
    for (const e of L.engines) if (works(state, e.name)) drain += state.ship.speed * 3;
    for (const m of list) if (m.kind === 'pipe' && m.broken && m.open) drain += M.PIPE_LEAK;
    return drain;
  };

  // Top speed allowed by the engines (1 = both working).
  const engineFactor = (state) => {
    const working = L.engines.filter((e) => works(state, e.name)).length;
    return Math.max(M.NO_ENGINE_SPEED, working / L.engines.length);
  };

  const reset = () => {
    for (const m of list) {
      m.hp = m.max;
      m.broken = false;
      if (m.kind === 'pipe') m.open = true;
    }
  };

  // Short status text for a module, or '' if fine.
  const status = (state, name) => {
    const m = byName[name];
    if (!m) return '';
    if (m.broken) return `${name} is BROKEN - fix it with a hammer`;
    if ((m.kind === 'helm' || m.kind === 'engine' || m.kind === 'lift') && !hasSteam(state, name)) return `${name} has no steam!`;
    if (m.hp < m.max * 0.5) return `${name} is damaged (${Math.round(m.hp)}%)`;
    return '';
  };

  return { list, byName, hasSteam, works, damage, hitAt, repair, update, pressureDrain, engineFactor, reset, status };
}
