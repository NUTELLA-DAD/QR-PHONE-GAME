// RULES for two environments (environments.js calls these; envArtStormSea.js draws them):
//
//  STORM FRONT - dark slate sky and rain, strong wind gusts (weather.js shoves the ship up/down; here
//    the same gust also shoves her along), and LIGHTNING: every so often a bolt starts CHARGING for a
//    few seconds (warning). Someone holding Action at a LIGHTNING ROD on the top deck grounds it. If
//    nobody does, the bolt hits the ship (module damage, hull dents and a fire). If the Lightning Coil
//    is manned, a grounded bolt charges it instantly to full ("the coil drinks the bolt").
//
//  SUNKEN SEA - an ocean at the bottom of the map. Flying with the keel in the water scrapes the hull
//    and floods the lower deck (crew wade slowly, she sinks and slows) until someone works the BILGE
//    PUMP (hold Action at the pump on the lower deck). WATERSPOUTS (moving columns) pull her toward
//    them. RESCUE: survivors bob on wreckage; fly low over one, the rope catches them and someone
//    holds Action at the winch in the bomb bay to haul them up for salvage.
//
// What the rest of the game reads:
//   state.stormJob  { rods:[{d,x,held}], charge, caught, struck, drank }
//   state.sea       { y, flood, spouts, survivors, hook, winch, pump, rescued, scrapes }
//   state.env       wind (px/s along the course), sink (gas points), drag (0-1 speed lost to flooding)
import { config } from '../../config.js';
import { floorBelow } from './maps.js';
import { pop } from './popups.js';
import { applyForce } from './forces.js';
import { mainShip } from './ships.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const hash = (i, salt = 0) => {
  const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// The y (map pixels) of the sea surface on a map. It is set from the route the ship flies (start to
// beacon): the surface sits PATH_PCT of the way down the route's own heights, plus the ship's keel and a
// margin - so the lowest stretches of the route skim the waves and the rest flies clear. (If a map has no
// route, fall back to where OPEN_SHARE of the columns are open.) Cached on the map.
export function seaLevel(map, L = config.ENVIRONMENTS.sea.SEA) {
  if (!map) return null;
  if (map.seaY != null) return map.seaY;
  const C = map.CELL;
  const ys = [];
  if (map.start && map.dist) {
    let i = Math.floor(map.start.x / C);
    let j = Math.floor(map.start.y / C);
    for (let k = 0; k < 4000 && i >= 0 && j >= 0 && i < map.W && j < map.H; k++) {
      ys.push((j + 0.5) * C);
      const here = map.dist[j * map.W + i];
      if (here <= 0 || here >= 1e9) break;
      let best = null;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= map.W || nj >= map.H) continue;
        const d = map.dist[nj * map.W + ni];
        if (d < here && (!best || d < best.d)) best = { i: ni, j: nj, d };
      }
      if (!best) break;
      i = best.i;
      j = best.j;
    }
  }
  const lo = (map.H - L.ROWS_MAX) * C;
  const hi = (map.H - L.ROWS_MIN) * C;
  if (ys.length > 8) {
    ys.sort((a, b) => a - b);
    map.seaY = clamp(ys[Math.floor(ys.length * L.PATH_PCT)] + L.KEEL + L.MARGIN, lo, hi);
  } else {
    let open = 0;
    let rows = L.ROWS_MAX;
    for (let k = 1; k <= L.ROWS_MAX; k++) {
      const j = map.H - k;
      for (let i = 0; i < map.W; i++) if (!map.solid[j * map.W + i]) open++;
      if (open >= map.W * L.OPEN_SHARE) {
        rows = k;
        break;
      }
    }
    map.seaY = (map.H - clamp(rows, L.ROWS_MIN, L.ROWS_MAX)) * C;
  }
  return map.seaY;
}

// Where the waterspouts and survivors of a map are (fixed per map, from a grid: the same every flight).
function layoutSea(map, F) {
  const y = seaLevel(map, F.SEA);
  const out = { spouts: [], survivors: [] };
  const open = (mx) => floorBelow(map, mx, y - 1) > y + 1; // water (no rock) under this x
  const W = map.W * map.CELL;
  const S = F.SPOUT;
  for (let k = 1; k * S.EVERY < W - 1500; k++) {
    if (hash(k, 401) > S.CHANCE) continue;
    const base = k * S.EVERY + (hash(k, 402) - 0.5) * S.EVERY * 0.5;
    if (!open(base)) continue;
    out.spouts.push({ base, x: base, y, sway: S.SWAY * (0.5 + hash(k, 403)), rate: 0.12 + hash(k, 404) * 0.1, ph: hash(k, 405) * 6.28, r: S.CORE * (0.8 + hash(k, 406) * 0.5), id: k });
  }
  const R = F.RESCUE;
  for (let k = 1; k * R.EVERY < W - 1500; k++) {
    if (hash(k, 411) > R.CHANCE) continue;
    const x = k * R.EVERY + (hash(k, 412) - 0.5) * R.EVERY * 0.6;
    if (!open(x) || !open(x - 100) || !open(x + 100)) continue;
    out.survivors.push({ mx: x, y, saved: false, id: k, ph: hash(k, 413) * 6.28, n: 1 + ((hash(k, 414) * 2) | 0) });
  }
  return out;
}

export function createStormSea({ state, puff, impact, damageHull }) {
  const layout = mainShip(state).layout; // (B1: the ship this system belongs to; B2 makes it one per ship)
  const P = layout.platforms;
  const IDX = (id) => layout.deckIndex(id);
  const E = state.env;
  const LOWER = IDX('lower');
  const CAT = IDX('catwalk');
  const BAY = IDX('bay');

  state.stormJob = { rods: [], charge: null, caught: 0, struck: 0, drank: 0, nextT: 0 };
  state.sea = { y: null, flood: 0, spouts: [], survivors: [], hook: null, winch: null, pump: null, rescued: 0, scrapes: 0, t: 0, spray: 0, scrapeT: 0, floodMax: 0, hitT: 0 };
  const pumpSpot = { d: LOWER, x: config.ENVIRONMENTS.sea.FLOOD.PUMP_X }; // (persistent objects: the bots and job arrows compare them by identity)
  const winchSpot = { d: BAY, x: config.ENVIRONMENTS.sea.RESCUE.WINCH_X, obj: null };
  let sMap = null;
  let warned = {};
  let gustAmt = 0;

  const clear = () => {
    const j = state.stormJob;
    j.rods = [];
    j.charge = null;
    j.nextT = 0;
    const s = state.sea;
    Object.assign(s, { y: null, flood: 0, spouts: [], survivors: [], hook: null, winch: null, pump: null, spray: 0, scrapeT: 0, hitT: 0 });
    E.windDir = E.windDir || 1;
    gustAmt = 0;
    warned = {};
    sMap = null;
  };

  const warn = (secs, text) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };

  // ============================== STORM FRONT ==============================
  const mannedCoil = () => {
    const m = (state.modules || []).find((q) => q.kind === 'coil');
    return !!m && !m.broken && Object.values(state.players).some((q) => q.lock === m.name);
  };

  const strike = (F, grounded) => {
    const J = state.stormJob;
    const c = J.charge;
    const w = state.weather;
    const y = P[CAT].y - 30;
    if (w) {
      w.bolt = { x: c.x, y: y - state.ship.alt, t: 0.3 };
      w.flash = 1;
    }
    puff(c.x, y - state.ship.alt, '#fff7a8', 12);
    if (grounded) {
      J.caught++;
      pop(state, c.x, y - 90 - state.ship.alt, 'GROUNDED!', '#9fe8ff', 1.3);
      if (mannedCoil() && state.coil) {
        state.coil.charge = 1; // the coil drinks the bolt: fully charged at once
        state.coil.cd = 0;
        J.drank++;
        pop(state, 875, -150 - state.ship.alt, 'THE COIL DRINKS THE BOLT!', '#ffe97a', 1.4);
        warn(2.5, 'GROUNDED - THE COIL DRINKS THE BOLT!');
      } else warn(2, 'GROUNDED!');
    } else {
      J.struck++;
      impact(c.x, P[CAT].y, F.ROD.POWER); // module damage, dents (and maybe a fire) where it lands
      if (state.fires.length < F.ROD.MAX_FIRES) state.fires.push({ x: clamp(c.x + rand(-60, 60), P[CAT].x0 + 20, P[CAT].x1 - 20), d: CAT, t: 0, prog: 0 });
      warn(2.5, 'LIGHTNING STRIKE! NOBODY HELD A ROD!');
    }
    J.charge = null;
    J.nextT = rand(F.ROD.EVERY_MIN, F.ROD.EVERY_MAX);
  };

  const storm = (dt, F, flying) => {
    const J = state.stormJob;
    const w = state.weather;
    const R = F.ROD;
    if (!J.rods.length) J.rods = R.SPOTS.map((s) => { const d = IDX(s.p), q = P[d]; return { d, x: q ? clamp(s.x, q.x0 + 30, q.x1 - 30) : s.x, held: 0 }; }); // (kept on the deck: a small ship's top deck is shorter)
    for (const r of J.rods) r.held = Math.max(0, r.held - dt);
    // ---- wind gusts: weather.js starts them (shoves her up/down); here they shove her along as well ----
    const gusting = !!(w && w.gusting && flying);
    if (gusting && w.gust) E.windDir = Math.sign(w.gust) || E.windDir || 1;
    gustAmt += ((gusting ? 1 : 0) - gustAmt) * Math.min(1, dt * 2.5);
    if (gustAmt < 0.01) gustAmt = 0;
    E.gale = gustAmt;
    E.wind = (E.windDir || 1) * F.WIND * gustAmt;
    if (E.wind && flying && !state.ship.down && state.course) state.course.dist += E.wind * dt; // (the rock collision shoves her back out)
    if (E.wind && flying && layout.gasbag) applyForce(state, { x: layout.gasbag.cx, y: layout.gasbag.cy, fx: (E.wind / F.WIND) * config.FORCES.GUST_WIND, fy: 0, source: 'gust' }); // (the gust leans on the tall gasbag: it tips her, forces.js)
    if (gusting && !warned.gust) {
      warned.gust = true;
      warn(1.8, 'WIND GUST - HOLD ON!');
    }
    if (!gusting) warned.gust = false;
    // ---- lightning ----
    if (!flying || state.ship.down) {
      J.charge = null;
      return;
    }
    if (!J.charge) {
      if (J.nextT <= 0) J.nextT = R.FIRST;
      if ((J.nextT -= dt) <= 0) {
        const r = J.rods[(Math.random() * J.rods.length) | 0];
        J.charge = { t: R.WARN, max: R.WARN, x: r.x + rand(-40, 40) };
        warn(R.WARN, 'LIGHTNING CHARGING - HOLD A ROD!');
        if (w) w.flash = Math.max(w.flash, 0.4);
      }
      return;
    }
    const c = J.charge;
    c.t -= dt;
    c.held = J.rods.some((r) => r.held > 0);
    if (Math.random() < dt * 14) puff(c.x + rand(-50, 50), P[CAT].y - rand(40, 160) - state.ship.alt, '#cfe9ff', 2);
    if (c.t <= 0) strike(F, c.held);
  };

  // ============================== SUNKEN SEA ==============================
  const sea = (dt, F, flying) => {
    const s = state.sea;
    const c = state.course;
    s.t += dt;
    { const q = P[LOWER]; if (q) { pumpSpot.d = LOWER; pumpSpot.x = clamp(config.ENVIRONMENTS.sea.FLOOD.PUMP_X, q.x0 + 30, q.x1 - 30); } } // (the bilge pump stands on the lower deck, kept on a short one)
    s.pump = flying && c && c.map ? pumpSpot : null;
    if (!c || !c.map) {
      s.hook = s.winch = null;
      E.sink = E.drag = 0;
      return;
    }
    if (c.map !== sMap) {
      sMap = c.map;
      const lay = layoutSea(c.map, F);
      s.spouts = lay.spouts;
      s.survivors = lay.survivors;
      s.y = seaLevel(c.map, F.SEA);
      s.flood = 0;
      s.hook = null;
    }
    E.seaY = s.y;
    const FL = F.FLOOD;
    const keel = (c.refY != null ? c.refY : layout.refPoint.y - state.ship.alt) + F.SEA.KEEL;
    const cx = c.dist + layout.refPoint.x; // map x of the ship's middle
    let touching = 0;
    if (flying && !state.ship.down) {
      let over = false;
      for (const dx of [-420, -140, 140, 420]) if (floorBelow(c.map, cx + dx, Math.min(keel, s.y - 1)) > s.y + 1) over = true;
      if (over && keel > s.y - F.SEA.SKIM) touching = clamp((keel - (s.y - F.SEA.SKIM)) / 80, 0.25, 1);
    }
    s.pumped = Math.max(0, (s.pumped || 0) - dt);
    s.spray += ((touching > 0 ? 1 : 0) - s.spray) * Math.min(1, dt * 4);
    if (touching > 0) {
      s.flood = Math.min(1, s.flood + FL.RATE * touching * dt);
      if ((s.scrapeT -= dt) <= 0) {
        s.scrapeT = FL.SCRAPE_EVERY;
        s.scrapes++;
        state.ship.shake = Math.max(state.ship.shake, 0.25);
        puff(rand(500, 1100), 930 - state.ship.alt, '#cfe8f4', 8);
        damageHull(FL.SCRAPE_HULL);
        s.dmgScrape = (s.dmgScrape || 0) + FL.SCRAPE_HULL;
      }
      if (!warned.scrape) {
        warned.scrape = true;
        warn(2.5, s.flood > 0.2 ? 'SCRAPING THE WAVES - SHE IS TAKING ON WATER! PUMP THE BILGE!' : 'KEEL IN THE WATER - CLIMB!');
      }
    } else if (s.spray < 0.05) warned.scrape = false;
    // The hull slowly drains/leaks back out, and a flooded ship starts to break.
    if (flying && !state.ship.down) {
      s.flood = Math.max(0, s.flood - FL.DRAIN * dt);
      if (s.flood >= FL.CRITICAL) { damageHull(FL.CRITICAL_HULL * dt); s.dmgCrit = (s.dmgCrit || 0) + FL.CRITICAL_HULL * dt; }
      if (s.flood > 0.3 && !warned.flood) {
        warned.flood = true;
        warn(3, 'FLOODING - SOMEONE TO THE BILGE PUMP (LOWER DECK)!');
      }
      if (s.flood < 0.1) warned.flood = false;
    }
    s.floodMax = Math.max(s.floodMax, s.flood);
    E.sink = s.flood * FL.SINK; // water in the hull: she needs more gas to hover
    E.drag = s.flood * FL.SLOW_SHIP;
    // ---- waterspouts pull her toward them ----
    let near = null;
    for (const sp of s.spouts) {
      sp.x = sp.base + Math.sin(s.t * sp.rate + sp.ph) * sp.sway;
      sp.cool = Math.max(0, (sp.cool || 0) - dt);
      const dx = sp.x - cx;
      if (Math.abs(dx) > F.SPOUT.RANGE) continue;
      if (!near || Math.abs(dx) < Math.abs(near.x - cx)) near = sp;
    }
    if (near && flying && !state.ship.down) {
      const dx = near.x - cx;
      const k = 1 - Math.abs(dx) / F.SPOUT.RANGE;
      const tall = keel > s.y - F.SPOUT.HEIGHT; // only reaches ships that are low enough
      if (tall) {
        c.dist += Math.sign(dx) * F.SPOUT.PULL * k * Math.min(1, Math.abs(dx) / 300) * dt; // (weaker near the core, so she is not pinned there)
        if (!warned.spout) {
          warned.spout = true;
          warn(2.5, 'WATERSPOUT! IT IS PULLING THE SHIP IN - CLIMB!');
        }
        if (Math.abs(dx) < near.r + 150 && (near.cool || 0) <= 0) {
          near.cool = F.SPOUT.HIT_EVERY; // spent for a while: it spits the ship back out
          impact(rand(500, 1100), 700, F.SPOUT.POWER);
          s.spoutHits = (s.spoutHits || 0) + 1;
          c.dist -= Math.sign(dx) * 240;
        }
      }
    } else if (!near) warned.spout = false;
    // ---- rescue: a survivor under the ship catches the rope; hold Action at the winch to haul them up ----
    if (!layout.bombBay) { s.hook = s.winch = null; return; } // (no bomb bay, no rope to rescue anyone with)
    const bayX = layout.bombBay.x;
    const ropeY = (c.refY != null ? c.refY : layout.refPoint.y - state.ship.alt) + layout.bombBay.y - layout.refPoint.y;
    const R = F.RESCUE;
    if (s.hook) {
      const h = s.hook;
      const dx = h.mx - (c.dist + bayX);
      const dy = h.y - ropeY;
      if (!flying || state.ship.down || Math.abs(dx) > R.SLACK || dy > R.ROPE + 120 || dy < -40) {
        if (!h.saved) {
          if (flying) warn(2, 'THE ROPE SLIPPED - SURVIVOR LOST!');
          h.lost = true;
        }
        s.hook = null;
      }
    }
    if (!s.hook && flying && !state.ship.down) {
      for (const sv of s.survivors) {
        if (sv.saved || sv.lost) continue;
        const dx = sv.mx - (c.dist + bayX);
        const dy = sv.y - ropeY;
        if (Math.abs(dx) < R.CATCH && dy > -20 && dy < R.ROPE) {
          s.hook = sv;
          sv.prog = sv.prog || 0;
          warn(3, 'SURVIVOR ON THE ROPE - HOLD ACTION AT THE WINCH (BOMB BAY)!');
          break;
        }
      }
    } else if (!s.hook) {
      // (not flying)
    }
    // A survivor within sight ahead: tell the crew once.
    if (!s.hook && flying) {
      for (const sv of s.survivors) {
        if (sv.saved || sv.lost || sv.told) continue;
        const dx = sv.mx - (c.dist + bayX);
        if (dx > 0 && dx < R.SPOT) {
          sv.told = true;
          warn(3, 'SURVIVORS IN THE WATER - FLY LOW AND WINCH THEM UP!');
        }
      }
    }
    // The winch is manned in advance: the first survivor close ahead (or the one on the rope) puts the winch on the job lists.
    let cand = s.hook;
    if (!cand && flying && !state.ship.down) {
      cand = s.survivors.find((sv) => !sv.saved && !sv.lost && sv.mx - (c.dist + bayX) > -R.CATCH && sv.mx - (c.dist + bayX) < R.SPOT && sv.y - ropeY > -20 && sv.y - ropeY < R.ROPE + 250) || null;
    }
    winchSpot.x = R.WINCH_X;
    winchSpot.obj = cand;
    s.winch = cand ? winchSpot : null;
    if (s.hook) {
      const h = s.hook;
      h.prog = Math.max(0, (h.prog || 0) - dt * R.PROG_DECAY * (h.worked ? 0 : 1));
      if (h.worked) h.worked = false;
      if (h.prog >= 1) {
        h.saved = true;
        s.rescued++;
        s.hook = null;
        pop(state, bayX, ropeY - 120, 'RESCUED!', '#8fe388', 1.4);
        puff(bayX, 930 - state.ship.alt, '#8fe388', 12);
        state.rescueAward = (state.rescueAward || 0) + h.n; // simulation.js turns this into salvage
        warn(2.5, h.n > 1 ? 'SURVIVORS RESCUED! +SALVAGE' : 'SURVIVOR RESCUED! +SALVAGE');
      }
    }
  };

  // The pump: hold Action there (simulation.js calls this while someone is working it).
  const pumpWork = (dt) => {
    const s = state.sea;
    s.flood = Math.max(0, s.flood - config.ENVIRONMENTS.sea.FLOOD.PUMP_RATE * dt);
    s.pumped = 0.3;
    s.pumpTime = (s.pumpTime || 0) + dt;
  };
  const rodHold = (rod) => {
    rod.held = config.ENVIRONMENTS.storm.ROD.HOLD_GRACE;
  };
  const winchWork = (sv, dt) => {
    if (state.sea.hook !== sv) return; // (nothing to haul until the rope has caught them)
    sv.prog = (sv.prog || 0) + dt / config.ENVIRONMENTS.sea.RESCUE.TIME;
    sv.worked = true;
  };

  return { clear, storm, sea, pumpWork, rodHold, winchWork };
}
