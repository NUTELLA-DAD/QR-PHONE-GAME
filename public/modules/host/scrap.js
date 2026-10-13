// SCRAP, FLOTSAM AND THE HOLD (LOOP.md G1, config.SCRAP). Scrap is a thing you carry: a bundle (cargo kind 'scrap', cargo.js) that falls out of the sky when something is shot down, is caught and is stowed in the HOLD.
//   scrapOn()                                  the switch: config.SCRAP.ENABLED (NO_SCRAP=1 in a tool turns it off) and never in Versus
//   holdSpot(layout) -> { d, p, x, room }      where a ship's hold bin stands: derived from her Hold room (no new part, the layout is untouched), or null
//   holdCount / holdWeight / holdX             what is in a ship's hold (state.scrapHold.count, a ship key), what it weighs (balance.js, structure.js, goingDown.js read it) and where
//   const flotsam = createFlotsam({ world, puff, phoneFx })      the sky's side: made once by simulation.js
//   flotsam.step(dt)                           once a world step: the deaths in the sky become bundles (a plane shot down, the zeppelin, a creature, a gunship's hulk), hulks float, the stats tick
//   flotsam.drop(x, y, vx, n, src)             n bundles (a fraction is the chance of one) fall from a point on little parachutes: world.thrown items with chute: true, which cargo.js stepThrown lands on any deck
//   flotsam.hulkRay(o, ang, reach)             the hulk a harpoon line from o along ang would hook, or null (towing.js);  flotsam.latch(hulk, ship, from) hooks it and hauls it alongside
//   flotsam.reset()                            a new stop / voyage: the flotsam in the air and the hulks are gone
//   helmPlan(world) -> { speed, alt } | null   where the helm should steer to get under the nearest bundle in a calm (the bots' helm; people just look)
// A death is noticed, not announced: the step remembers the enemies it saw last time and a plane that is gone with hp <= 0 has been shot down, so no enemy module needed an edit. The bundles' chance is a private
// seeded generator (no Math.random).
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { windSpeed } from './sails.js';
import { inRock } from './course.js';
import { pop } from './popups.js';

const S = () => config.SCRAP;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const scrapOn = () => S().ENABLED && !config.PVP.ENABLED;

// ---- the hold bin ----
// The bin stands in the room called Hold (the ammo hold's room, or the bunker's, when a build has no such room), at the spot with the most clear floor round it.
function findSpot(L) {
  const things = (d) => {
    const xs = [];
    const take = (list) => { for (const o of list || []) if (o.d === d && Number.isFinite(o.x)) xs.push(o.x); };
    take(L.stations); take(L.racks); take(L.extinguishers); take(L.vents); take(L.gasValves); take(L.engines); take(L.boarderEntryPoints);
    for (const c of L.connectors || []) { if (c.top === d) xs.push(c.xTop); if (c.bottom === d) xs.push(c.xBottom); }
    for (const h of L.hatches || []) if (h.d === d) xs.push(h.x0, h.x1);
    if (L.medbay) { const md = L.platforms.findIndex((q) => q.id === L.medbay.p); if (md === d) xs.push(L.medbay.x); }
    return xs;
  };
  let room = (L.rooms || []).find((r) => /hold/i.test(r.name) && !/bomb/i.test(r.name) && !r.outside && r.d != null);
  if (!room) {
    const st = L.one('ammo') || L.one('coal');
    if (st) room = (L.rooms || []).find((r) => r.d === st.d && st.x >= r.x0 && st.x <= r.x1 && !r.outside) || { d: st.d, x0: st.x - 150, x1: st.x + 150 };
  }
  if (!room) return null;
  const pl = L.platforms[room.d];
  if (!pl) return null;
  const xs = things(room.d), lo = Math.max(room.x0, pl.x0) + 45, hi = Math.min(room.x1, pl.x1) - 45, mid = (lo + hi) / 2;
  if (hi < lo) return { d: room.d, p: pl.id, x: (room.x0 + room.x1) / 2, room: room.name || pl.name };
  let best = null;
  for (let x = lo; x <= hi; x += 5) {
    const clear = xs.reduce((m, o) => Math.min(m, Math.abs(o - x)), 400);
    if (!best || clear > best.clear + 0.5 || (Math.abs(clear - best.clear) <= 0.5 && Math.abs(x - mid) < Math.abs(best.x - mid))) best = { x, clear };
  }
  return { d: room.d, p: pl.id, x: best.x, room: room.name || pl.name };
}
const tables = layoutTables((L) => ({ SPOT: findSpot(L) }));
export const holdSpot = (layout) => tables(layout).SPOT;
export const holdCount = (state) => (scrapOn() && state.scrapHold ? state.scrapHold.count | 0 : 0);
// TREASURE (CASTLE.md A2, treasure.js): the chests stowed in the hold weigh on the lift too - real cargo, no free ballast. They count while AWAY is on (NO_AWAY=1 leaves them out).
export const chestWeight = (state) => (config.AWAY.ENABLED && state.chestHold ? state.chestHold.w || 0 : 0);
export const chestCount = (state) => (config.AWAY.ENABLED && state.chestHold ? state.chestHold.list.length : 0);
export const holdWeight = (state) => Math.max(0, holdCount(state) - (S().HOLD_FREE || 0)) * S().BUNDLE_W + chestWeight(state); // (the first HOLD_FREE bundles are ballast: the hold is built for them, they weigh nothing on the lift)
export const holdX = (state, layout) => { const sp = holdSpot(layout); return sp ? sp.x : layout.refPoint ? layout.refPoint.x : 0; };
export const holdFull = (state) => holdCount(state) >= S().HOLD_CAP;
export const heavyHold = (state) => holdCount(state) >= S().BOTS.HOLD_SOFT; // (the bots stop going after flotsam once the hold is this full: it weighs on the lift - balance pass)
// The hold as a purse (G2 prices parts in scrap, G4's frames eat it, derelicts pay into it): holdSpend takes n bundles out if there are that many (true), holdAdd puts up to n in and answers how many fitted.
export const holdSpend = (state, n) => { if (!(n > 0) || holdCount(state) < n) return false; state.scrapHold.count -= n; return true; };
export const holdAdd = (state, n) => { if (!scrapOn() || !(n > 0)) return 0; const rec = (state.scrapHold ||= { count: 0 }), fit = Math.min(n, S().HOLD_CAP - rec.count); if (fit > 0) rec.count += fit; return Math.max(0, fit); };

// G2: a dock card's price in words: "Salvage 55 + 3 scrap" when the hold covers its bundles, "Salvage 100 + 1 scrap" when it covers some, plain "Salvage 130" when it covers none (and says what scrap would take off).
// The card is o { cost (salvage now), scrap (bundles it asks), scrapPay (bundles the hold covers now), cashFull (salvage with every bundle covered) } as simulation.js priceInScrap left it.
export const priceWords = (o) => (o.cost === 0 && !o.scrap ? 'FREE' : !o.scrap ? `Salvage ${o.cost}` : o.scrapPay > 0 ? `Salvage ${o.cost} + ${o.scrapPay} scrap` : `Salvage ${o.cost}  (or ${o.cashFull} + ${o.scrap} scrap)`);

// ---- the sky's flotsam ----
export function createFlotsam({ world, puff, phoneFx = () => {} }) {
  const hulks = (world.hulks = []);
  const stats = (world.scrapStats = { spawned: 0, landed: 0, hooked: 0, stowed: 0, lost: 0, hulks: 0, hulkTaken: 0, dumped: 0, taken: 0, holdSum: 0, holdN: 0, carrySecs: 0, crewSecs: 0, by: {} });
  let seed = 0x9e3779b1; // a private generator: the chance of a bundle never touches Math.random (a seeded run keeps its draws)
  const rng = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let uid = 1000000; // (ids of bundles in the sky: clear of cargo.js's own)
  const wind = () => windSpeed(world) * config.SHIP.TOP_SPEED;
  let knownS = new Set(), knownB = new Set(); // the dogfighters and the bombers seen last step
  let enemyAlive = false, lastBoss = null;
  const done = new WeakSet(); // gunships and creatures already turned into flotsam
  const severed = new WeakMap(); // creature -> limbs already counted

  // n bundles (a fraction is the chance of one) fall from (x, y) on little chutes. vx: the world speed of what dropped them (a dying plane keeps a share of it).
  const drop = (x, y, vx, n, src, o = {}) => {
    if (!scrapOn() || !(n > 0)) return 0;
    const F = S().FLOTSAM;
    const count = Math.floor(n) + (rng() < n - Math.floor(n) ? 1 : 0);
    const w = wind();
    let made = 0;
    for (let i = 0; i < count; i++) {
      const k = count > 1 ? i / (count - 1) - 0.5 : 0; // -0.5 .. 0.5 across the group
      const px = x + (o.wide ? (rng() - 0.5) * o.wide : k * F.SPREAD * 1.2), py = y + (o.high ? -rng() * o.high : -Math.abs(k) * F.SPREAD * 0.6);
      if (inRock(world, px, py)) continue;
      world.thrown.push({ id: ++uid, kind: 'scrap', x: px, y: py, vx: w + (vx - w) * F.KEEP + k * F.SPREAD * 2, vy: -40 - 30 * (0.5 - Math.abs(k)), t: 0, from: null, spin: (rng() - 0.5) * 3, rot: 0, chute: true, src });
      made++;
    }
    while (world.thrown.filter((q) => q.chute).length > F.MAX) { const i = world.thrown.findIndex((q) => q.chute); world.thrown.splice(i, 1); stats.lost++; }
    stats.spawned += made;
    stats.by[src] = (stats.by[src] || 0) + made;
    if (made && o.banner !== false && !(world.ev.warn > 0)) { world.say('info', 'SCRAP! GET UNDER IT', null, 2.5); } // (the helm's cue)
    return made;
  };
  const note = (src, n) => { stats.spawned += n; stats.by[src] = (stats.by[src] || 0) + n; }; // (bundles that never fell: the supply crate's land on her deck)

  // ---- hulks: one big floating piece worth bundles ----
  const makeHulk = (x, y, vx, vy, n, name) => {
    if (inRock(world, x, y)) return null;
    const h = { id: ++uid, x, y, vx, vy: Math.min(vy, 0) - 20, t: 0, left: n, max: n, rot: 0, spin: (rng() - 0.5) * 0.5, tow: null, name: name || '', took: [], lastTake: 0 };
    hulks.push(h);
    stats.hulks++;
    if (hulks.length > 3) hulks.shift();
    return h;
  };
  // The nearest hulk a line from o along ang (world) would hook, within reach: { hulk, d } or null.
  const hulkRay = (o, ang, reach) => {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = null;
    for (const h of hulks) {
      const rx = h.x - o.x, ry = h.y - o.y, along = rx * dx + ry * dy;
      if (along < 0 || along > reach || Math.abs(rx * dy - ry * dx) > S().HULK.HIT_R) continue;
      if (!best || along < best.d) best = { hulk: h, d: along };
    }
    return best;
  };
  // A harpoon line hooks a hulk: it is hauled to float beside the gun (from = the muzzle, ship coordinates).
  const latch = (h, ship, from) => {
    h.tow = { ship, from: { x: from.x, y: from.y } };
    h.hooked = true;
    pop(world, h.x, h.y - 120, 'HOOKED!', '#ffd23f', 1);
    world.sfxQ.push(['clang', true]);
  };

  // ---- the deaths in the sky ----
  const gunWorld = (g) => {
    if (g.ship && g.ship.layout) return { x: toWorldX(g.ship, g.ship.layout.midPoint ? g.ship.layout.midPoint.x : 0), y: toWorldY(g.ship, g.ship.layout.midPoint ? g.ship.layout.midPoint.y : 0), vx: g.ship.pose.vx || 0, vy: g.ship.pose.vy || 0 };
    const sh = mainShip(world);
    return { x: toWorldX(sh, g.bp.cx + g.dx), y: toWorldY(sh, (g.bp.hullTop + g.bp.hullBot) / 2 + g.dy), vx: sh.pose.vx, vy: 0 };
  };
  const died = (o, src, n) => drop(o.x, o.y - 10, o.vx || 0, n, src);
  const scan = () => {
    const F = S().FLOTSAM;
    // planes: gone from the list with no hit points left = shot down (a plane that withdrew has hit points)
    const liveS = new Set(world.strafers || []), liveB = new Set(world.bombers || []), wiped = new Set();
    for (const o of knownB) if (!liveB.has(o) && o.hp <= 0) died(o, 'bomber', F.BOMBER);
    for (const o of knownS) {
      if (liveS.has(o) || !(o.hp <= 0)) continue;
      died(o, 'fighter', F.FIGHTER);
      if (o.squadronId != null) wiped.add(o.squadronId);
    }
    for (const id of wiped) if (!(world.strafers || []).some((q) => q.squadronId === id && q.hp > 0 && !q.gone)) {
      const last = [...knownS].filter((q) => q.squadronId === id).pop();
      if (last) died(last, 'squadron', F.SQUADRON);
    }
    knownS = liveS;
    knownB = liveB;
    const e = world.enemy;
    if (e) {
      if (enemyAlive && e.dead > 0 && e.hp <= 0) died(e, 'fighter', F.FIGHTER);
      enemyAlive = e.dead <= 0 && e.hp > 0 && e.heading != null;
    }
    if (lastBoss && !world.boss && lastBoss.hp <= 0) drop(lastBoss.x, lastBoss.y, lastBoss.vx || 0, F.BOSS, 'boss', { wide: 700 });
    lastBoss = world.boss || null;
    const g = world.gunship;
    if (g && g.phase === 'sinking' && !done.has(g)) {
      done.add(g);
      const at = gunWorld(g);
      drop(at.x, at.y - 60, at.vx, F.GUNSHIP, 'gunship', { wide: 500 });
      makeHulk(at.x, at.y, at.vx * 0.5, at.vy * 0.3, F.HULK, g.bp ? g.bp.name : '');
    }
    const cr = world.creature;
    if (cr) {
      const was = severed.get(cr) || 0, now = (cr.stats && cr.stats.severed) | 0;
      if (now > was) { severed.set(cr, now); const c = cr.chunks && cr.chunks[cr.chunks.length - 1]; if (c) drop(c.cx, c.cy - 40, 0, F.SEVER * (now - was), 'creature'); }
      if (cr.dying && !done.has(cr)) { done.add(cr); drop(cr.x, cr.y - 500, 0, F.CREATURE, 'creature', { wide: 1600, high: 700 }); }
    }
  };

  // ---- hulks float, are hauled in, sink ----
  const stepHulks = (dt) => {
    const H = S().HULK, w = wind();
    for (let i = hulks.length - 1; i >= 0; i--) {
      const h = hulks[i];
      h.t += dt;
      h.rot += h.spin * dt;
      const tow = h.tow;
      if (tow && (!world.ships.includes(tow.ship) || tow.ship.state.down > 0)) h.tow = null;
      if (h.tow) {
        const sh = h.tow.ship, mx = toWorldX(sh, h.tow.from.x), my = toWorldY(sh, h.tow.from.y), dx = h.x - mx, dy = h.y - my, d = Math.hypot(dx, dy) || 1;
        if (d > 1800) h.tow = null;
        else {
          const v = clamp((d - H.HOLD_DIST) * 2, -H.REEL, H.REEL);
          h.vx += (sh.pose.vx - (dx / d) * v - h.vx) * Math.min(1, dt * 4);
          h.vy += (sh.pose.vy - (dy / d) * v - h.vy) * Math.min(1, dt * 4);
        }
      }
      if (!h.tow) {
        h.vx += (w - h.vx) * Math.min(1, dt * 0.6);
        h.vy += (H.SINK - h.vy) * Math.min(1, dt * 0.8);
      }
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      if (h.left <= 0 || h.t > H.LIFE || inRock(world, h.x, h.y)) {
        if (h.left > 0) { stats.lost += h.left; pop(world, h.x, h.y - 100, h.t > H.LIFE ? 'SUNK' : 'LOST', '#c9c9c9', 1); puff(h.x, h.y, '#555', 10); }
        hulks.splice(i, 1);
      }
    }
  };

  // ---- the numbers the read-outs want ----
  const tally = (dt) => {
    for (const p of Object.values(world.players)) {
      if (!p || p.mate || p.enemy || p.connected === false) continue;
      stats.crewSecs += dt;
      if (p.carry === 'scrap') stats.carrySecs += dt;
    }
    let n = 0;
    for (const sh of world.ships) if (!sh.ai && !sh.piece) n += holdCount(sh.ctx);
    stats.holdSum += n * dt;
    stats.holdN += dt;
  };

  const step = (dt) => {
    if (!scrapOn()) { if (knownS.size || knownB.size) { knownS = new Set(); knownB = new Set(); } return; }
    if (world.phase === 'lobby') return;
    scan();
    if (hulks.length) stepHulks(dt);
    tally(dt);
  };
  const reset = () => {
    for (let i = world.thrown.length - 1; i >= 0; i--) if (world.thrown[i].chute) world.thrown.splice(i, 1);
    hulks.length = 0;
    knownS = new Set();
    knownB = new Set();
    enemyAlive = false;
    lastBoss = null;
  };
  return { step, drop, note, hulks, hulkRay, latch, makeHulk, reset, stats, rng };
}

// ---- the helm: where to steer to get under the nearest bundle ----
// A calm: nothing hunting her. Returns { speed (the lever: a share of top speed), alt (the altitude to fly at, or null = leave it), item } or null. The bundle drifts with the wind and settles to a steady fall, so
// the helm can tell where it will come down: it slows or speeds her to be there, and keeps her top deck a little below it (climbs when it is far above, dives when it has fallen to her deck).
export const topDeck = (L) => {
  const widest = Math.max(...L.platforms.map((q) => q.x1 - q.x0));
  return L.platforms.filter((q) => q.x1 - q.x0 >= widest * 0.5).reduce((b, q) => (!b || q.y < b.y ? q : b), null);
};
export function helmPlan(world) {
  const hulks = (world.hulks || []).filter((h) => h.left > 0);
  if (!scrapOn() || heavyHold(world) || !((world.thrown && world.thrown.length) || hulks.length) || world.phase !== 'flying' || world.ship.down > 0 || world.goingDown || (world.creature && !world.creature.dying)) return null; // (a creature that is dying is no threat: its field of bundles is worth the detour)
  const B = S().BOTS, F = S().FLOTSAM, ship = mainShip(world), L = ship.layout;
  const g = world.gunship;
  if (g && g.phase !== 'sinking' && g.phase !== 'leaving') return null; // (a gunship is about: her fight comes first)
  const cx = toWorldX(ship, L.refPoint.x), cy = toWorldY(ship, L.refPoint.y), dist = (o) => Math.hypot(o.x - cx, o.y - cy);
  if ((world.boarders || []).length) return null;
  for (const o of world.bombers || []) if (o.hp > 0 && dist(o) < B.CALM_RANGE) return null; // (a bomb run)
  for (const o of world.bullets || []) if (dist(o) < B.CALM_FIRE) return null; // (shots in the air)
  for (const o of world.bats || []) if (o.hp > 0 && (o.latched || dist(o) < B.CALM_CLOSE)) return null;
  for (const o of world.strafers || []) if (o.hp > 0 && dist(o) < B.CALM_CLOSE) return null; // (a dogfighter on her: the guns are busy, the helm dodges)
  const e = world.enemy;
  if (e && e.dead <= 0 && e.hp > 0 && dist(e) < B.CALM_CLOSE) return null;
  const deck = topDeck(L);
  if (!deck) return null;
  const a = toWorldX(ship, deck.x0), b = toWorldX(ship, deck.x1), mid = (a + b) / 2, deckY = toWorldY(ship, deck.y), w = windSpeed(world) * config.SHIP.TOP_SPEED;
  // the nearest of what is worth a detour: a bundle on a chute, or a hulk (worth more: it counts for a few bundles)
  let best = null;
  for (const it of world.thrown || []) {
    if (!it.chute || it.haul || it.kind !== 'scrap') continue;
    const dx = it.x - mid, dy = deckY - it.y;
    if (Math.abs(dx) > B.STEER_RANGE || dy > B.STEER_DOWN || dy < -B.STEER_DOWN) continue;
    const score = Math.abs(dx) + Math.abs(dy) * 0.6;
    if (!best || score < best.score) best = { it, score, dy };
  }
  for (const h of hulks) {
    const dx = h.x - mid, dy = deckY - h.y;
    if (Math.abs(dx) > B.STEER_RANGE * 1.4 || Math.abs(dy) > B.STEER_DOWN * 1.5) continue;
    const score = Math.abs(dx) + Math.abs(dy) * 0.6 - 500 * h.left;
    if (!best || score < best.score) best = { hulk: h, score, dy };
  }
  if (!best) return null;
  if (best.hulk) { // alongside it: her top deck a little under its middle, her middle under it (the crew take its bundles from the rail)
    const h = best.hulk, speed = clamp(((h.vx + (h.x - mid) * 0.6) * ship.pose.f) / config.SHIP.TOP_SPEED, -0.4, 1);
    return { speed, alt: Math.abs(deckY - (h.y + B.HULK_GAP)) > 60 ? deck.y - h.y - B.HULK_GAP : null, item: h };
  }
  const it = best.it, dy = best.dy;
  const T = clamp(dy > 0 ? dy / F.FALL : B.DECK_GAP * 3 / F.FALL, B.LEAD_MIN, 20); // (seconds until it is at her deck)
  const landX = it.x + w * T + (it.vx - w) * (1 - Math.exp(-F.DRIFT * T)) / F.DRIFT;
  const speed = clamp(((w + (landX - w * T - mid) / T) * ship.pose.f) / config.SHIP.TOP_SPEED, -0.4, 1);
  let alt = null;
  if (dy > B.DECK_GAP * 5) alt = deck.y - it.y - B.DECK_GAP * 4; // (far above her: rise until it is a few seconds above the deck)
  else if (dy < B.DECK_GAP * 0.8) alt = deck.y - it.y - B.DECK_GAP * 3; // (level with her or below: dive under it)
  return { speed, alt, item: it };
}

// ---- the ledger: every scrap event passes through here (cargo.js, hookshot.js, goingDown.js) ----
// what: landed (a bundle on a deck), hooked (a bundle reeled in on a hookshot's line, landed at his feet), stowed (into the hold), taken (one off a hulk), hulk (a hulk stripped), lost (given up, shovelled, dumped by
// hand), dumped (the hold emptied while she falls). The world's counters (world.scrapStats), the run's (run.scrap, run.scrapStowed) and the Ship's Book's moments.
export function scrapNote(world, what, p, data = {}) {
  const st = world.scrapStats;
  if (!st) return;
  const run = world.run, rs = run ? (run.scrap ||= { landed: 0, hooked: 0, stowed: 0, taken: 0, lost: 0, hulks: 0, dumped: 0, patched: 0, spent: 0, built: 0 }) : null;
  const bump = (k, n = 1) => { st[k] = (st[k] || 0) + n; if (rs) rs[k] = (rs[k] || 0) + n; };
  const who = p && !p.mate && !p.enemy && p.name ? [p] : [];
  const moment = (kind, o) => { if (world.moment) world.moment(kind, o); };
  if (what === 'landed') bump('landed');
  else if (what === 'hooked') { bump('landed'); bump('hooked'); moment('scrap-hook', { who }); }
  else if (what === 'stowed') { const first = !run || !run.scrapStowed; bump('stowed'); if (run) run.scrapStowed = (run.scrapStowed || 0) + 1; if (first) moment('scrap-first', { who }); }
  else if (what === 'taken') bump('taken');
  else if (what === 'patched') { bump('patched'); if (data.saved) moment('scrap-patch', { who, data: { names: [data.name] } }); } // (G2: the scrap patch; a segment that was about to give way and held is the moment)
  else if (what === 'spent') { bump('spent', data.n || 0); if (data.part) { bump('built'); moment('scrap-built', { who: data.who || [], data: { names: [data.name] } }); } } // (G2: bundles paid at the dock; a part or fitting built with some of them is the moment)
  else if (what === 'hulk') {
    bump('stripped');
    const h = data.hulk;
    if (h && h.hooked) moment('hulk-hauled', { who: h.took.map((id) => world.players[id]).filter(Boolean), data: { name: h.name } });
  } else if (what === 'lost') { bump('lost'); if (data.dumped) bump('dumped'); }
  else if (what === 'dumped') { bump('dumped', data.n || 0); bump('lost', data.n || 0); moment('scrap-dumped', { who, data: { n: data.n } }); }
}
