// STRUCTURE (STRUCTURE.md, WP0 + WP1): the hull bar is gone. A ship is a frame of SEGMENTS: a stretch of each deck (SEG_PX long) with the rooms on it and the hull skin under it. Each segment has a
// soundness (hp, 0..1); the gasbags have a canvas hp of their own (state.bags[i].hp). What hurts a segment: a shell that lands on it, a breach or a fire on it, rock under the keel. What mends it: a hammer
// (SHORE UP), a reward, a supply drop. A segment that reaches 0 holds on at HOLD_HP for a GRACE (a hammer saves it), then gives way: the end of the ship breaks off, or - when the stretch that is left on
// each side is long enough - she SPLITS in half (shipSim.js splitShip). The whole thing is switched by config.STRUCTURE.ENABLED (NO_STRUCTURE=1): off, nothing here runs and the old hull bar plays.
//
//   THE PURE HALF (Node-safe, no live ship)
//     segmentsOf(layout)         { segs, adj, total }  every segment { sig: deckId@col, id, d, row, name, x0, x1, x, y, y0, y1, w, gondola, critical, nest, hp:1, st / state }. The cells lie on a grid of SEG_PX
//                                over the ship's x, so a segment keeps its sig when a neighbour is cut away; a deck's short end cell joins its neighbour.
//                                The LOAD GRAPH: along each deck (adjacent cells), and FRAMES between decks whose rows are within FRAME_GAP and which overlap in x. A crow's nest hangs on the top-most deck under it.
//                                `gondola` = the decks that carry the ship (main, lower, keel ...); `critical` = a gondola segment whose centre is further than SMALL_SHARE of the gondola's length from both ends:
//                                its failure leaves a big stretch on each side (the cut-columns of the load path, which is a chain of columns), so it is the one that can split her.
//     componentsOf(S, alive)     the pieces the ship falls into with some segments gone: gondola segments join along decks and frames, everything else hangs on the nearest sound piece (a catwalk joining
//                                two halves does not hold her together). The crow's nests are left out: they hang on a bag and go with it. [{ segs, length, stretches: [{ id, a, b }] }], longest first.
//   THE LIVE HALF
//     createStructure(deps)      hit / drain / repair / restore / step / flush ... (see the return at the bottom). Writes state.frames (the segments), state.ship.structure (100 x the lowest critical
//                                soundness) and, so that every reader of the old hull bar goes on working, state.ship.hull (the same number).
import { config } from '../../config.js';
import { rowOf, isNestRow, partAt } from './shipBuild.js';
import { slabOf } from './breakOff.js';
import { holdWeight } from './scrap.js';

const C = () => config.STRUCTURE;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MODULE_KINDS = ['station', 'gun', 'engine', 'searchlight', 'crewCannon', 'sail', 'coil', 'escortDock'];

// ---- the pure half ----
export function segmentsOf(layout) {
  const K = C(), SEG = K.SEG_PX;
  const P = layout.platforms || [];
  const segs = [];
  P.forEach((q, d) => {
    const row = rowOf(q), slab = slabOf(q, P);
    const cells = [];
    for (let col = Math.floor(q.x0 / SEG); col * SEG < q.x1 - 0.5; col++) {
      const a = Math.max(q.x0, col * SEG), b = Math.min(q.x1, (col + 1) * SEG);
      if (b - a > 0.5) cells.push({ a, b, col });
    }
    const min = K.END_MIN * SEG;
    while (cells.length > 1 && cells[0].b - cells[0].a < min) { cells[1].a = cells[0].a; cells.shift(); } // (a short end cell joins its neighbour)
    while (cells.length > 1 && cells[cells.length - 1].b - cells[cells.length - 1].a < min) { const l = cells.pop(); cells[cells.length - 1].b = l.b; }
    for (const c of cells) segs.push({ sig: q.id + '@' + c.col, id: q.id, d, row, name: q.name || q.id, x0: c.a, x1: c.b, x: (c.a + c.b) / 2, y: q.y, y0: slab.y0, y1: slab.y1, w: c.b - c.a, gondola: K.GONDOLA.includes(row), nest: isNestRow(row), critical: false, hp: 1, st: 'ok', state: 'ok' });
  });
  if (!segs.some((s) => s.gondola)) for (const s of segs) s.gondola = !s.nest; // (a ship with none of the carrying rows: every hull deck carries)
  const g = segs.filter((s) => s.gondola);
  if (g.length) {
    const gx0 = Math.min(...g.map((s) => s.x0)), len = Math.max(1, Math.max(...g.map((s) => s.x1)) - gx0);
    for (const s of g) { const f = (s.x - gx0) / len; s.critical = f >= K.SMALL_SHARE && f <= 1 - K.SMALL_SHARE; }
    if (!g.some((s) => s.critical)) for (const s of g) s.critical = true; // (a very short ship: all of it carries)
  }
  const adj = segs.map(() => []);
  const link = (i, j, kind) => { adj[i].push({ j, kind }); adj[j].push({ j: i, kind }); };
  const over = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (a.d === b.d) { if (Math.abs(a.x1 - b.x0) < 1 || Math.abs(b.x1 - a.x0) < 1) link(i, j, 'h'); continue; }
      if (a.nest || b.nest) continue;
      if (Math.abs(a.y - b.y) <= K.FRAME_GAP && over(a, b) >= K.FRAME_OVERLAP) link(i, j, 'f');
    }
  }
  segs.forEach((n, i) => { // a crow's nest hangs on the top-most deck segments under it
    if (!n.nest) return;
    const under = segs.map((s, j) => ({ s, j })).filter((o) => !o.s.nest && over(n, o.s) >= K.FRAME_OVERLAP);
    if (!under.length) return;
    const top = Math.min(...under.map((o) => o.s.y));
    for (const o of under) if (o.s.y === top) link(i, o.j, 'n');
  });
  return { segs, adj, total: segs.reduce((n, s) => n + s.w, 0) };
}

// The pieces the ship falls into when the segments with alive[i] false are gone.
export function componentsOf(S, alive) {
  const { segs, adj } = S, n = segs.length, comp = new Array(n).fill(-1), comps = [];
  const flood = (seed, id, ok) => {
    const q = [seed];
    comp[seed] = id;
    for (let k = 0; k < q.length; k++) for (const e of adj[q[k]]) if (comp[e.j] < 0 && alive[e.j] && !segs[e.j].nest && ok(e.j)) { comp[e.j] = id; q.push(e.j); }
  };
  for (let i = 0; i < n; i++) if (alive[i] && !segs[i].nest && segs[i].gondola && comp[i] < 0) flood(i, comps.push(null) - 1, (j) => segs[j].gondola); // (1: the carrying decks join along decks and frames)
  const q = [];
  for (let i = 0; i < n; i++) if (comp[i] >= 0) q.push(i);
  for (let k = 0; k < q.length; k++) for (const e of adj[q[k]]) if (comp[e.j] < 0 && alive[e.j] && !segs[e.j].gondola && !segs[e.j].nest) { comp[e.j] = comp[q[k]]; q.push(e.j); } // (2: what hangs on a sound piece goes with it)
  for (let i = 0; i < n; i++) if (alive[i] && !segs[i].nest && comp[i] < 0) flood(i, comps.push(null) - 1, () => true); // (3: what hangs on nothing is a piece of its own)
  // (a crow's nest is not part of the frame: it hangs on a gasbag, and facts() in the live half gives it to the piece that has the bag)
  const out = comps.map(() => ({ segs: [], length: 0, stretches: [] }));
  segs.forEach((s, i) => { if (comp[i] >= 0) { out[comp[i]].segs.push(i); out[comp[i]].length += s.w; } });
  for (const c of out) c.stretches = stretchesOf(segs, c.segs);
  return out.filter((c) => c.segs.length).sort((a, b) => b.length - a.length);
}

// The deck stretches { id, a, b } a set of segments covers (touching ones merged).
export function stretchesOf(segs, idx) {
  const by = new Map();
  for (const i of idx) (by.get(segs[i].id) || by.set(segs[i].id, []).get(segs[i].id)).push(segs[i]);
  const out = [];
  for (const [id, list] of by) {
    list.sort((p, q) => p.x0 - q.x0);
    let cur = null;
    for (const s of list) {
      if (cur && s.x0 <= cur.b + 1) cur.b = Math.max(cur.b, s.x1);
      else out.push((cur = { id, a: s.x0, b: s.x1 }));
    }
  }
  return out;
}

// How much she has lost, 0..100 (the gates that used to read 100 - hull): with structure on the length-weighted soundness missing from her frame, else the hull bar's.
export const hullLost = (ship) => {
  const S = ship.sim && ship.sim.structure;
  if (S && S.on()) return 100 * (1 - S.meanHp());
  return 100 - ship.state.hull;
};
// The old hull reading of a ship's body (tools and readers that want one number): the structure meter when structure is on, else the hull bar.
export const hullOrStructure = (body) => (body.structure != null && config.STRUCTURE.ENABLED ? body.structure : body.hull);

// ---- the live half ----
// deps: { state (the ship's context), ship, hooks }. hooks: { scale() the damage scale of a blow (difficulty x crew x skulls x armour upgrades), drainScale() the same for a breach or a fire, protect() nothing can hurt her,
//   difficulty(), stopNo(), say(text, secs), buzz(pattern), breakCuts(cuts, cause) -> the break-off or null, doSplit(spec), pop(x, y, kind, color), puff(x, y, color, n) }
export function createStructure({ state, ship, hooks }) {
  const layout = ship.layout;
  let S = segmentsOf(layout), version = layout.version;
  let clockT = 0, lastFailT = -1e9, pending = null, cursor = 0, warnCd = 0, creakCd = 0, warned = new Set();
  const stats = (state.structStats = { meterSum: 0, meterN: 0, meterMin: 100, failures: 0, breakoffs: 0, splits: 0, folds: 0, saves: 0, shored: 0, holds: 0, crashes: 0, falls: 0, saved: 0 });
  state.frames = S.segs;
  state.structDeficit = 0;
  state.gdRelief = 0;
  state.grounded = false;
  const on = () => C().ENABLED && !ship.ai && !ship.piece && !config.PVP.ENABLED;
  const segs = () => S.segs;

  // ---- carrying soundness across a new layout (a break-off, a split, a build fitted at the dock): by deck row and where they overlap ----
  const sync = () => {
    if (layout.version === version) return false;
    version = layout.version;
    const old = S.segs, N = segmentsOf(layout);
    for (const n of N.segs) {
      const same = old.find((o) => o.sig === n.sig && Math.abs(o.y - n.y) < 1);
      const near = same ? [same] : old.filter((o) => Math.abs(o.y - n.y) < 1 && Math.min(o.x1, n.x1) - Math.max(o.x0, n.x0) >= 0.3 * Math.min(o.w, n.w));
      if (near.length) { const w = near.reduce((a, b) => (b.hp < a.hp ? b : a)); n.hp = w.hp; n.hold = w.hold || null; n.st = n.state = w.st; }
    }
    S = N;
    state.frames = S.segs;
    warned = new Set();
    return true;
  };

  // ---- what a segment is called ("MAIN DECK AFT") ----
  const nameOf = (g) => {
    const same = S.segs.filter((o) => o.id === g.id);
    const pos = same.length < 2 ? '' : g.x < same[0].x0 + (same[same.length - 1].x1 - same[0].x0) * 0.34 ? ' AFT' : g.x > same[0].x0 + (same[same.length - 1].x1 - same[0].x0) * 0.66 ? ' FORE' : ' MIDSHIPS';
    return String(g.name || g.id).toUpperCase() + pos;
  };

  // The segment at a ship point: the smallest box that holds it, else the nearest one (a miss that still struck the ship).
  const segAt = (x, y) => {
    let best = -1, bd = Infinity, ba = Infinity;
    S.segs.forEach((g, i) => {
      const dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0, dy = y < g.y0 ? g.y0 - y : y > g.y1 ? y - g.y1 : 0, d = Math.hypot(dx, dy), a = g.w * (g.y1 - g.y0);
      if (d < bd - 0.5 || (Math.abs(d - bd) <= 0.5 && a < ba)) { best = i; bd = d; ba = a; }
    });
    return best;
  };
  // The keel segment at x: the lowest deck's segment that holds x (else the nearest in x).
  const keelAt = (x) => {
    let best = -1;
    S.segs.forEach((g, i) => {
      if (g.nest) return;
      const dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0;
      if (best < 0) { best = i; return; }
      const b = S.segs[best], bx = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
      if (dx < bx - 1 || (Math.abs(dx - bx) <= 1 && g.y > b.y)) best = i;
    });
    return best;
  };
  // The segment on deck d at x.
  const segOnDeck = (d, x) => {
    let best = -1, bd = Infinity;
    S.segs.forEach((g, i) => { if (g.d !== d) return; const dx = x < g.x0 ? g.x0 - x : x > g.x1 ? x - g.x1 : 0; if (dx < bd) { bd = dx; best = i; } });
    return best;
  };

  // (F5: an end segment that carries the boiler or the helm holds longer: losing it takes the steam or the wheel with it)
  const carriesKey = (g) => ['boiler', 'helm'].some((k) => layout.all(k).some((s) => s.d === g.d && s.x >= g.x0 && s.x <= g.x1));
  const graceOf = (g) => (g.critical ? C().GRACE_SPLIT[hooks.difficulty()] ?? C().GRACE_SPLIT.normal : C().GRACE_END_KEY != null && carriesKey(g) ? C().GRACE_END_KEY : C().GRACE_END);

  // ---- damage ----
  const enterHold = (g, big) => {
    g.hp = C().HOLD_HP;
    g.hold = { t: 0, max: big ? 0 : graceOf(g) };
    stats.holds++;
  };
  const hurtSeg = (g, dmg, big) => {
    if (g.hold) { if (big) g.hold.max = 0; return; } // (held at 0: only a big blow does anything, it ends the grace)
    if (g.hp <= 0) { enterHold(g, big); return; }
    if (!(dmg > 0)) return;
    g.hp = Math.max(0, g.hp - dmg);
    if (g.hp <= 0) enterHold(g, big);
  };

  // A blow at ship point (x, y): `amount` is what the old hull bar would have lost before the damage scale (HIT_DAMAGE x power ...). bag >= 0: it struck that gasbag (canvas, not frame).
  const hit = (x, y, amount, o = {}) => {
    if (!on() || hooks.protect()) return -1;
    const K = C(), pts = amount * hooks.scale(), big = (o.power || 0) >= K.BIG_POWER;
    if (o.bag != null && o.bag >= 0) {
      const b = state.bags[o.bag];
      if (b) b.hp = Math.max(0, (b.hp ?? 1) - pts * K.CANVAS_PER_HULL);
      return -1;
    }
    const i = o.kind === 'rock' ? keelAt(x) : segAt(x, y);
    if (i < 0) return -1;
    const pr = o.kind === 'rock' ? null : partAt(layout.partRects, x, y);
    const share = pr && MODULE_KINDS.includes(pr.kind) ? K.MODULE_SHARE : 1;
    hurtSeg(S.segs[i], pts * K.HP_PER_HULL * share, big);
    return i;
  };
  // Hull damage with no place on the ship (the creatures, flame, a flood): spread over SHIM_SPREAD load-bearing segments, round the ship.
  const shim = (amount) => {
    if (!on() || hooks.protect()) return;
    const pts = amount * hooks.scale() * C().HP_PER_HULL;
    let pool = S.segs.map((g, i) => i).filter((i) => S.segs[i].critical);
    if (!pool.length) pool = S.segs.map((g, i) => i).filter((i) => S.segs[i].gondola);
    if (!pool.length) return;
    const n = Math.min(C().SHIM_SPREAD, pool.length);
    for (let k = 0; k < n; k++) hurtSeg(S.segs[pool[(cursor + k) % pool.length]], pts / n, false);
    cursor = (cursor + n) % pool.length;
  };
  // Breaches and fires wear their segment down until planked / put out (stepUpkeep).
  const drain = (dt) => {
    if (!on() || hooks.protect()) return;
    const K = C(), sc = hooks.drainScale(), BL = config.FIRE.BLAZE;
    for (const b of state.breaches) { const i = segOnDeck(b.d, b.x); if (i >= 0) hurtSeg(S.segs[i], K.BREACH_RATE * sc * dt, false); }
    for (const f of state.fires) { const i = segOnDeck(f.d, f.x); if (i >= 0) hurtSeg(S.segs[i], K.FIRE_RATE * (f.big ? BL.HULL_MUL : 1) * sc * dt, false); }
  };

  // ---- mending ----
  const save = (g) => { g.hold = null; stats.saves++; if (ship.main) hooks.pop(g.x, g.y - 150, 'HOLDS!', '#7bdc8a', 1); };
  const repair = (g, dt) => {
    if (!(g.hp < 1)) return false;
    const add = Math.min(1 - g.hp, C().REPAIR_RATE * dt);
    g.hp += add;
    g.worked = true;
    stats.shored += add;
    if (g.hold && g.hp >= C().SAVED_HP) save(g);
    return true;
  };
  const canvasRestore = (amt) => { for (const b of state.bags || []) if ((b.hp ?? 1) < 1) b.hp = Math.min(1, (b.hp ?? 1) + amt); };
  const patchBag = (i) => { const b = state.bags[i]; if (b && (b.hp ?? 1) < 1) b.hp = Math.min(1, (b.hp ?? 1) + C().PATCH_CANVAS); };
  // Old-style repairs (a reward, a supply drop, a checkpoint flag, a kill): `points` of hull, into the weakest load-bearing segments first.
  const restore = (points) => {
    if (!on()) return;
    let left = points * C().RESTORE_PER_POINT;
    canvasRestore(points * C().CANVAS_RESTORE);
    for (let guard = 0; left > 1e-6 && guard < 400; guard++) {
      let best = -1;
      S.segs.forEach((g, i) => { if (g.hp < 1 && (best < 0 || (g.critical ? 0 : g.gondola ? 1 : 2) < (S.segs[best].critical ? 0 : S.segs[best].gondola ? 1 : 2) || ((g.critical ? 0 : g.gondola ? 1 : 2) === (S.segs[best].critical ? 0 : S.segs[best].gondola ? 1 : 2) && g.hp < S.segs[best].hp))) best = i; });
      if (best < 0) break;
      const g = S.segs[best], give = Math.min(left, 0.02, 1 - g.hp);
      g.hp += give;
      left -= give;
      if (g.hold && g.hp >= C().SAVED_HP) save(g);
    }
  };
  const restoreAll = () => { for (const g of S.segs) { g.hp = 1; g.hold = null; } for (const b of state.bags || []) b.hp = 1; };
  const setAll = (hp) => { for (const g of S.segs) { g.hp = hp; g.hold = null; } for (const b of state.bags || []) b.hp = hp; lastFailT = -1e9; pending = null; }; // (a wreck that limps home on a spare: patched up to this)
  const reset = () => { sync(); restoreAll(); pending = null; lastFailT = -1e9; warned = new Set(); state.structDeficit = 0; state.gdRelief = 0; };

  // The segment a hammer can reach from deck d at x (the most hurt one in reach), or null.
  const frameNear = (d, x) => {
    let best = null;
    for (const g of S.segs) if (g.d === d && g.hp < 0.995 && Math.abs(x - g.x) <= g.w / 2 + C().SHORE_PAD && (!best || g.hp < best.hp)) best = g;
    return best;
  };
  // The segments worth a FRAME job: below JOB_AT (critical, held and damaged ones), the weakest first.
  const jobsOf = () => (on() ? S.segs.filter((g) => g.hp < C().JOB_AT && !g.nest).sort((a, b) => a.hp - b.hp) : []);

  // ---- the meter ----
  const meter = () => {
    let pool = S.segs.filter((g) => g.critical);
    if (!pool.length) pool = S.segs.filter((g) => g.gondola);
    if (!pool.length) pool = S.segs;
    return pool.length ? 100 * Math.min(...pool.map((g) => g.hp)) : 100;
  };
  const meanHp = () => { let s = 0, w = 0; for (const g of S.segs) { if (g.nest) continue; s += g.hp * g.w; w += g.w; } return w ? s / w : 1; };
  const canvasLoss = () => {
    const bags = state.bags || [];
    let sw = 0, loss = 0;
    for (const b of bags) sw += b.w || 1;
    for (const b of bags) loss += ((b.w || 1) / (sw || 1)) * (1 - (b.hp ?? 1));
    return loss * C().CANVAS_LOSS;
  };

  // ---- failure ----
  const canSplit = () => !(hooks.difficulty() === 'easy' && hooks.stopNo() < C().EASY_SPLIT_STOP);
  // What the pieces are made of: the gasbags that hang on each (by overlap), their lift, whether the helm is there.
  const facts = (comps) => {
    const helm = layout.one('helm'), hs = helm ? segOnDeck(helm.d, helm.x) : -1;
    const withBags = comps.map((c) => ({ ...c, bags: [], lift: 0, helm: hs >= 0 && c.segs.includes(hs) }));
    const bagOf = new Map();
    layout.gasbags.forEach((b, i) => {
      let best = 0, bo = -1;
      withBags.forEach((c, k) => { const o = c.segs.reduce((n, si) => n + Math.max(0, Math.min(b.x1, S.segs[si].x1) - Math.max(b.x0, S.segs[si].x0)), 0); if (o > bo) { bo = o; best = k; } });
      if (withBags.length) { withBags[best].bags.push(i); withBags[best].lift += b.lift || 0; bagOf.set(i, best); }
    });
    if (withBags.length) { // the crow's nests hang on a bag: they go with the piece that has the bag over them (else the piece they overlap most)
      S.segs.forEach((n, i) => {
        if (!n.nest) return;
        let k = -1, bo = 0;
        layout.gasbags.forEach((b, bi) => { const o = Math.min(b.x1, n.x1) - Math.max(b.x0, n.x0); if (o > bo && bagOf.has(bi)) { bo = o; k = bagOf.get(bi); } });
        if (k < 0) withBags.forEach((c, ci) => { const o = c.segs.reduce((m, si) => m + Math.max(0, Math.min(S.segs[si].x1, n.x1) - Math.max(S.segs[si].x0, n.x0)), 0); if (o > bo) { bo = o; k = ci; } });
        if (k >= 0) withBags[k].nests = (withBags[k].nests || []).concat(i);
      });
      for (const c of withBags) if (c.nests) c.stretches = stretchesOf(S.segs, [...c.segs, ...c.nests]);
    }
    return withBags;
  };
  const resolve = (list) => {
    const K = C(), idx = list.map((g) => S.segs.indexOf(g));
    const alive = S.segs.map((g, i) => !idx.includes(i));
    const comps = componentsOf(S, alive);
    const total = S.total;
    const big = comps.filter((c) => c.length >= K.SMALL_SHARE * total);
    if (!big.length && comps.length) big.push(comps[0]);
    const small = comps.filter((c) => !big.includes(c));
    const gone = stretchesOf(S.segs, idx);
    stats.failures++;
    lastFailT = clockT;
    if (big.length >= 2) {
      if (!canSplit()) { for (const g of list) { g.hp = K.HELD_HP; g.hold = null; } hooks.say('IT HOLDS - FOR NOW...', 3); return false; }
      const f = facts(big);
      pending = { spec: { comps: f, gone, small: small.flatMap((c) => c.stretches), at: gone.length ? (gone[0].a + gone[0].b) / 2 : 0, ids: list.map((g) => g.sig) } };
      return true;
    }
    if (K.KEY_NO_BREAK_BEFORE && hooks.stopNo() < K.KEY_NO_BREAK_BEFORE && [...list, ...small.flatMap((c) => c.segs.map((i) => S.segs[i]))].some(carriesKey)) { for (const g of list) { g.hp = K.HELD_HP; g.hold = null; } hooks.say('IT HOLDS - FOR NOW...', 3); return false; } // (F5: an end with the boiler or the helm cannot break off in the first stops)
    const cuts = [...gone, ...small.flatMap((c) => c.stretches)];
    const r = hooks.breakCuts(cuts, 'structure');
    stats.breakoffs += r ? 1 : 0;
    if (!r) for (const g of list) { g.hp = K.HELD_HP; g.hold = null; } // (nothing can come away there: she holds)
    return !!r;
  };
  // Folding: the frame is so worn that the weakest main-deck segment gives and the whole cross-section with it.
  const fold = () => {
    const pool = S.segs.filter((g) => g.critical && g.row === 'main');
    const gx = S.segs.filter((g) => g.gondola), mid = gx.length ? (Math.min(...gx.map((g) => g.x0)) + Math.max(...gx.map((g) => g.x1))) / 2 : 0;
    const cand = (pool.length ? pool : S.segs.filter((g) => g.critical)).sort((a, b) => a.hp - b.hp || Math.abs(a.x - mid) - Math.abs(b.x - mid))[0];
    if (!cand) return;
    stats.folds++;
    const col = S.segs.filter((g) => !g.nest && Math.min(g.x1, cand.x1) - Math.max(g.x0, cand.x0) > 1);
    if (ship.main) hooks.say('SHE IS FOLDING - THE FRAME IS WORN OUT!', 5);
    resolve(col);
  };

  // ---- one step (stepUpkeep) ----
  const step = (dt) => {
    sync();
    const K = C(), bodyHp = state.ship;
    if (!on()) { state.structDeficit = 0; return; }
    clockT += dt;
    const due = [];
    for (const g of S.segs) {
      if (g.hp <= 0 && !g.hold) enterHold(g, false);
      if (g.hold) {
        if (g.worked) { g.worked = false; continue; }
        if (g.hp >= K.SAVED_HP) { save(g); continue; }
        g.hold.t += dt;
        if (g.hold.t >= g.hold.max) due.push(g);
      }
      g.worked = false;
    }
    if (due.length && clockT - lastFailT >= K.FAIL_GAP && !pending) resolve(due);
    else if (!due.length && !pending && clockT - lastFailT >= K.FAIL_GAP && state.phase === 'flying' && meanHp() < K.MIN_SHARE) fold();
    // states, the meter, the words and the creak
    let worst = null;
    for (const g of S.segs) {
      g.st = g.state = g.hold ? 'critical' : g.hp >= K.STATES.SCUFFED ? 'ok' : g.hp >= K.STATES.DAMAGED ? 'scuffed' : g.hp >= K.STATES.CRITICAL ? 'damaged' : 'critical'; // (state: ok | scuffed | damaged | critical; st is the short name the jobs read)
      if (g.st === 'critical' && (g.critical || g.hold) && (!worst || g.hp < worst.hp)) worst = g;
    }
    const m = meter();
    bodyHp.structure = m;
    bodyHp.hull = m; // (the old hull bar's readers - the bots, the captains, the fleet panels, the sound - read the same number)
    stats.meterSum += m * dt;
    stats.meterN += dt;
    stats.meterMin = Math.min(stats.meterMin, m);
    state.structWorst = worst ? { sig: worst.sig, name: nameOf(worst), held: !!worst.hold, left: worst.hold ? Math.max(0, worst.hold.max - worst.hold.t) : null } : null;
    if (worst) {
      if (!warned.has(worst.sig)) { warned.add(worst.sig); hooks.buzz([90, 50, 90, 50, 150]); warnCd = 0; }
      if (ship.main && (warnCd -= dt) <= 0 && state.ev.warn <= 0.3) {
        warnCd = 6;
        hooks.say(worst.critical ? `STRUCTURE FAILING - ${nameOf(worst)} - SHORE IT UP!` : `${nameOf(worst)} IS BREAKING OFF - SHORE IT UP!`, 4);
      }
      if ((creakCd -= dt) <= 0) { creakCd = K.CREAK_EVERY; state.sfxQ.push(['creak']); }
    } else { creakCd = 0; warnCd = 0; }
    state.structDeficit = canvasLoss() + K.LOAD_WEIGHT * ((state.loads || []).reduce((n, ld) => n + (ld.w || 0), 0) + holdWeight(state)) - (state.gdRelief || 0); // (...and what is stowed in her hold: scrap.js)
  };

  // The split waits for the end of the frame (the world applies it with every ship at rest): see simulation.js stepWorld.
  const flush = () => { if (!pending || !on()) { pending = null; return null; } const p = pending; pending = null; return hooks.doSplit(p.spec); };

  return {
    on, sync, hit, shim, drain, repair, restore, restoreAll, setAll, reset, step, flush, frameNear, jobsOf, meter, meanHp, canvasLoss, patchBag, nameOf, segAt, keelAt, segOnDeck, resolve, fold, segs, stats, canSplit,
    get pending() { return pending; },
    get lastFail() { return lastFailT; },
    setLastFail: (t) => { lastFailT = t; },
    get clock() { return clockT; },
  };
}
