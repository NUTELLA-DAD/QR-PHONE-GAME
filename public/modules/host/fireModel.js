// Fire that cares where things are (S.5f): the PURE half. Node-safe, no live ship: it reads a layout (SHIP_LAYOUT, or any buildLayout() result) and config.FIRE, so the
// simulation (fire.js) and the build validator (buildCheck.js) judge a ship by the same rules.
//   flamAt(L, d, x)           how flammable the spot at x on deck d is (1 = a plain covered wooden deck; coal 4.5; iron housings and armour plate ~0)
//   fireCap(L)                most fires that may burn at once: scales with the ship's deck area
//   spreadSpots(L, f, rnd)    the places a fire f could spread to, with weights: along its deck (either side) and up / down through ladders, poles, ropes and stairs
//   fireDistance(L, a, b)     px of fire path between two places ({ d, x }): along decks, through connectors (each costs HOP)
//   fireRisk(L)               the validator's fire-risk read-out: { score 0..10, level, notes, coalBoiler (px of fire path), ... }
//   fireReachesBag(L, bag, d, x, big)   (gas types) does a fire at x on deck d reach this gasbag (config.GASES.HYDROGEN: under its underside, on its nest decks)? hydrogenBagsFor(L, d, x, big): the hydrogen bags it reaches
//   bagFireSpots(L, bag)      the stretches of each deck from which a fire reaches the bag; hydrogenExposure(L): the boiler, coal bunker and flamethrower stations within a hydrogen bag's reach [{ bag, kind, name, dist }]
import { config } from '../../config.js';
import { bagEdgeY } from './shipBuild.js';
import { isHydrogen } from './gases.js';

const F = () => config.FIRE;
const HOP = 150; // a ladder / hatch counts as this many px of fire path
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// The armour plate covering x on deck d, or undefined.
export const armourOn = (L, d, x) => (L.armour || []).find((a) => a.d === d && x >= a.x0 - 4 && x <= a.x1 + 4);

// Is this spot open air: an outdoor deck, or an outrigger room on a covered one?
export const outdoorAt = (L, d, x) => {
  const p = L.platforms[d];
  return !!p && (!!p.outside || (L.rooms || []).some((r) => r.outside && r.d === d && x >= r.x0 && x <= r.x1));
};

// What burns at a spot: armour plate 0; else, if something that burns better than the deck (coal, powder) is within its radius, the best of those; else the nearest iron housing
// (boiler, engine, gun) within its radius, which gives the flames little to eat; else the deck's own (covered wood, or the open air's a little less).
export function flamAt(L, d, x) {
  const p = L.platforms[d];
  if (!p) return 0;
  const T = F().FLAMMABILITY;
  if (armourOn(L, d, x)) return T.armour;
  const base = outdoorAt(L, d, x) ? T.outdoor : T.deck;
  let hot = null, iron = null, bd = Infinity;
  const look = (s, kind) => {
    const k = T.kind[kind];
    if (!k || s.d !== d) return;
    const dist = Math.abs(s.x - x);
    if (dist > k.r) return;
    if (k.f > base) { if (hot === null || k.f > hot) hot = k.f; } else if (dist < bd) { bd = dist; iron = k.f; }
  };
  for (const s of L.stations) look(s, s.kind);
  for (const e of L.engines) look(e, 'engine');
  return hot !== null ? hot : iron !== null ? iron : base;
}

// The coal bunker (a station of the layout) whose tinder a fire at x on deck d is in, or null.
export function coalAt(L, d, x) {
  const k = F().FLAMMABILITY.kind.coal;
  return L.stations.find((s) => s.kind === 'coal' && s.d === d && Math.abs(s.x - x) <= k.r) || null;
}

// Most fires at once: CAP_BASE for a ship with CAP_REF_PX of walkable deck, in proportion for bigger or smaller ones.
export function fireCap(L) {
  const total = L.platforms.reduce((n, q) => n + (q.x1 - q.x0), 0);
  return clamp(Math.round((F().CAP_BASE * total) / F().CAP_REF_PX), F().CAP_MIN, F().CAP_MAX);
}

// Where fire f ({ d, x }) could spread: a spot each side along its deck (100..160 px away, as it always did) and through any connector end within LADDER_REACH.
// Each is { d, x, f (the spot's flammability), w (its weight: f, less for a fall down a ladder or a climb up one), via }. Spots that cannot burn have f 0.
export function spreadSpots(L, f, rnd = Math.random) {
  const p = L.platforms[f.d];
  const out = [];
  if (!p) return out;
  const at = (d, x, mul, via) => {
    const q = L.platforms[d];
    if (!q) return;
    const cx = clamp(x, q.x0 + 20, q.x1 - 20), fl = flamAt(L, d, cx);
    out.push({ d, x: cx, f: fl, w: fl * mul, via });
  };
  for (const dir of [-1, 1]) at(f.d, f.x + dir * (100 + rnd() * 60), 1, 'deck');
  for (const c of L.connectors) {
    if (c.top === f.d && Math.abs(c.xTop - f.x) < F().LADDER_REACH) at(c.bottom, c.xBottom, F().LADDER_DOWN, c.type);
    else if (c.bottom === f.d && c.type !== 'pole' && Math.abs(c.xBottom - f.x) < F().LADDER_REACH) at(c.top, c.xTop, F().LADDER_UP, c.type);
  }
  return out;
}

// Px of fire path from a to b ({ d, x } each): along a deck it is the distance, through a connector it costs HOP. null when no path.
export function fireDistance(L, a, b) {
  const nodes = [{ d: a.d, x: a.x }, { d: b.d, x: b.x }];
  for (const c of L.connectors) nodes.push({ d: c.top, x: c.xTop }, { d: c.bottom, x: c.xBottom });
  const n = nodes.length, dist = Array(n).fill(Infinity), done = Array(n).fill(false);
  dist[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || !Number.isFinite(dist[u])) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      let w = Infinity;
      if (nodes[v].d === nodes[u].d) w = Math.abs(nodes[v].x - nodes[u].x);
      if (u >= 2 && v >= 2 && (u >> 1) === (v >> 1)) w = Math.min(w, HOP); // the two ends of one connector
      if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
    }
  }
  return Number.isFinite(dist[1]) ? Math.round(dist[1]) : null;
}

// The validator's read-out. Thresholds are in config.BUILD_CHECK (FIRE_NEAR) and config.FIRE.
// score: 0..10, higher is worse. Wooden ship 1.5; the coal bunker close (by fire path) to a boiler adds up to 4 (a blowout lights it), a bomb bay near the boiler up to 2, near the
// coal up to 1; extinguishers within reach of the coal and boiler take some off, and so does armour plate near them.
export function fireRisk(L) {
  const BC = config.BUILD_CHECK;
  const kinds = (k) => L.stations.filter((s) => s.kind === k);
  const boilers = kinds('boiler'), coals = kinds('coal'), bays = kinds('bombBay');
  const closest = (as, bs) => {
    let best = null;
    for (const a of as) for (const b of bs) { const d = fireDistance(L, a, b); if (d !== null && (best === null || d < best.dist)) best = { dist: d, a, b }; }
    return best;
  };
  const near = (dist) => (dist == null ? 0 : clamp(1 - dist / (BC.FIRE_NEAR * 2), 0, 1));
  const coalBoiler = closest(coals, boilers), bayBoiler = closest(bays, boilers), bayCoal = closest(bays, coals);
  const reach = BC.FIRE_EXT_REACH;
  const covering = (list, targets) => list.filter((e) => targets.some((t) => { const d = fireDistance(L, e, t); return d !== null && d <= reach; })).length;
  const extCoal = covering(L.extinguishers, coals), extBoiler = covering(L.extinguishers, boilers);
  const plated = [...coals, ...boilers].filter((s) => (L.armour || []).some((a) => a.d === s.d && s.x >= a.x0 - 200 && s.x <= a.x1 + 200)).length;
  let score = 1.5 + 4 * near(coalBoiler && coalBoiler.dist) + 2 * near(bayBoiler && bayBoiler.dist) + near(bayCoal && bayCoal.dist);
  score -= 0.7 * Math.min(3, extCoal) + 0.3 * Math.min(3, extBoiler) + 0.5 * Math.min(2, plated);
  score = Math.round(clamp(score, 0, 10) * 10) / 10;
  const level = score < 3 ? 'low' : score < 6 ? 'medium' : 'high';
  const notes = [];
  if (coalBoiler) notes.push(`the coal bunker is ${coalBoiler.dist} px of fire path from the ${coalBoiler.b.n}`);
  else if (coals.length && boilers.length) notes.push('no fire path between the coal and the boiler');
  if (bayBoiler) notes.push(`the bomb bay is ${bayBoiler.dist} px from the ${bayBoiler.b.n}`);
  if (coals.length) notes.push(`${extCoal} extinguisher${extCoal === 1 ? '' : 's'} within reach of the coal`);
  if (plated) notes.push(`${plated} of the boiler / coal stand by armour plate`);
  return { score, level, notes, coalBoiler: coalBoiler ? coalBoiler.dist : null, bayBoiler: bayBoiler ? bayBoiler.dist : null, bayCoal: bayCoal ? bayCoal.dist : null, extCoal, extBoiler, cap: L.platforms.length ? fireCap(L) : 0 };
}

// ---- hydrogen bags (gas types): where a fire can reach one -----------------------------------------------------------------------------------------------------
// A fire reaches a bag when it burns under its envelope (in x) on a deck at most REACH_BELOW px under the bag's underside there (BIG_REACH more for a blaze), or on a deck on top of it / up to REACH_ABOVE above it
// (the crow's nests). The classic ship's top deck (470) is 40 px under her bag; her main deck (640) is out of reach of an ordinary fire.
export function fireReachesBag(L, bag, d, x, big = false) {
  const p = L.platforms[d], H = config.GASES.HYDROGEN;
  if (!p || !bag || x < bag.x0 || x > bag.x1) return false;
  const under = bagEdgeY(bag, x, false);
  return p.y <= under + H.REACH_BELOW + (big ? H.BIG_REACH : 0) && p.y >= bag.cy - bag.ry - H.REACH_ABOVE;
}
// The indexes of the hydrogen bags a fire at x on deck d reaches.
export function hydrogenBagsFor(L, d, x, big = false) {
  const out = [];
  (L.gasbags || []).forEach((b, i) => { if (isHydrogen(b) && fireReachesBag(L, b, d, x, big)) out.push(i); });
  return out;
}
// The stretches of each deck from which a fire reaches this bag: [{ d, lo, hi }] (x from lo to hi).
export function bagFireSpots(L, bag) {
  const spots = [];
  L.platforms.forEach((q, d) => {
    const lo = Math.max(q.x0, bag.x0), hi = Math.min(q.x1, bag.x1);
    if (lo <= hi && fireReachesBag(L, bag, d, (lo + hi) / 2)) spots.push({ d, lo, hi });
  });
  return spots;
}
// What a hydrogen bag is exposed to: a boiler (it throws sparks and blows out), a coal bunker (tinder, it blazes) or a flamethrower (its own backdraft) standing in the bag's reach, or within WARN_NEAR px of fire path
// of it (a ladder counts HOP). dist 0 = right in the reach.
export function hydrogenExposure(L) {
  const H = config.GASES.HYDROGEN, out = [];
  const bags = L.gasbags || [];
  const hazards = L.stations.filter((s) => s.kind === 'boiler' || s.kind === 'coal' || (s.kind === 'gun' && L.gunMounts && L.gunMounts[s.n] && L.gunMounts[s.n].type === 'flame'));
  bags.forEach((bag, bi) => {
    if (!isHydrogen(bag)) return;
    const spots = bagFireSpots(L, bag); // (the places on each deck where a fire would reach this bag)
    for (const s of hazards) {
      let best = null;
      for (const sp of spots) {
        const dist = sp.d === s.d && s.x >= sp.lo && s.x <= sp.hi ? 0 : fireDistance(L, s, { d: sp.d, x: clamp(s.x, sp.lo, sp.hi) });
        if (dist !== null && (best === null || dist < best)) best = dist;
      }
      if (best !== null && best <= H.WARN_NEAR) out.push({ bag: bi, kind: s.kind === 'gun' ? 'flamethrower' : s.kind, name: s.n, dist: best });
    }
  });
  return out;
}
