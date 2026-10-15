// MOMENTS (SHIPS_BOOK.md L0): the game remembers what happened, with names. A moment is one thing worth telling:
//   { n, t, stop, stopName, env, kind, who: [names], where, what, weight, data }
// kept in a ring buffer, state.moments (world level: ships.js WORLD_SHARED). It is DATA ONLY: recording a moment draws no random number, changes nothing in the sim and does not touch the order of anything, so a seeded run
// plays out exactly as it did (tools/buildsim.mjs --check-botsim). logWriter.js turns the moments of a stop into sentences; logArt.js draws them.
//
//   const moments = createMoments({ world, stopInfo, helm, onMoment }) world = the world state; onMoment(m) = told of each moment recorded (L7: replay.js starts filming the heavy ones; it never writes the sim); stopInfo() -> { no, name, env } of the stop being flown (or null); helm() = whoever holds the main ship's helm
//   world.moment(kind, { who, where, what, weight, data })   record one (also W.moment in the ships' code). who = players, ids or names; none given -> the busiest crewman of that job (never nobody)
//   world.momentNote(tag, player)                            count a small thing for a later moment (a tally, per stop)
//   moments.noteStat(player, key, n)                         simulation.js stat(): the first fire out, a revive under fire
//   moments.tick(dt)                                         once a flying step: the clock, a sandbag carried a long time, the helm held through a crisis
//   moments.stopEnd(players)                                 at the end of a stop (scorecard, limp, run end): the jobs done a lot become moments
//   moments.open() / moments.close() / moments.best(list)    the moments not yet written into the Log, mark them written, and the heaviest of a list (the play of the mission)
//   moments.restart()                                        a new run: forget everything
import { config } from '../../config.js';
import { shipOf } from './ships.js';
import { hullOrStructure } from './structure.js';

// What a moment of each kind says about who deserves it when the caller could not name him: the stats to look at, best first.
const BUSY = {
  'creature-win': ['kills', 'raiders', 'cannon'], 'flagship-down': ['kills', 'cannon', 'raiders'], 'ring-fall': ['kills', 'demolished'], 'ring-squad': ['kills', 'demolished'], 'ring-breach': ['kills', 'demolished'], 'ring-charge': ['sabotage', 'boarding'], 'away-winch': ['sabotage', 'boarding'], 'away-charge': ['sabotage', 'boarding'], 'away-ballista': ['sabotage', 'boarding'], 'away-beacon': ['sabotage', 'boarding'], 'away-prisoners': ['sabotage', 'boarding'], 'away-banner': ['sabotage', 'boarding'], 'away-ko': ['sabotage', 'boarding'], 'treasure-stowed': ['stowed', 'boarding', 'sabotage'], 'treasure-heist': ['stowed', 'boarding', 'sabotage'], 'boss-down': ['kills', 'cannon', 'raiders'], 'gunship-shot': ['kills'], 'gunship-fled': ['kills'], 'gunship-charge': ['sabotage', 'boarding', 'raiders'],
  'gunship-captured': ['captures', 'boarding', 'raiders'], 'nemesis-met': ['kills'], 'nemesis-escape': ['kills'], 'nemesis-down': ['sabotage', 'boarding', 'kills'], 'nemesis-scar': ['holes', 'repairs', 'fires'], 'nemesis-won': ['repairs', 'holes', 'fires'], 'going-down-saved': ['holes', 'dumped', 'cuts', 'coal'], 'ship-lost': ['repairs', 'holes', 'fires'], limp: ['repairs', 'holes', 'fires'], breakoff: ['repairs', 'fires', 'holes'],
  'breakoff-bay': ['repairs', 'fires', 'holes'], rebuild: ['repairs', 'holes'],
  'duel-disarmed': ['boarding', 'sabotage'], 'duel-parry': ['boarding', 'sabotage'], 'duel-flank': ['boarding', 'sabotage'], 'duel-rescue': ['revives', 'boarding'], // (CASTLE.md A4)
  'derelict-boarded': ['stowed', 'boarding'], 'derelict-stripped': ['stowed', 'boarding'], 'derelict-hauled': ['stowed', 'boarding'], 'derelict-rescue': ['stowed', 'boarding'], 'named-part': ['repairs', 'stowed'], 'salvage-won': ['stowed', 'boarding'], 'salvage-lost': ['stowed', 'boarding'], 'defend-won': ['kills', 'bats'], 'defend-lost': ['kills', 'bats'], 'defend-saved': ['kills', 'bats'], // (LOOP.md G5 / G6)
};
const ANY = ['kills', 'repairs', 'holes', 'fires', 'coal', 'ammo', 'raiders', 'revives', 'jumps']; // (when there is nothing else to go by)

export function createMoments({ world, stopInfo, helm, onMoment }) {
  const LG = () => config.LOG;
  const ring = (world.moments = []);
  let t = 0, n = 0; // the clock (seconds of flying) and the moment counter
  const totals = { all: 0, named: 0, kinds: {} }; // every moment ever recorded (the ring forgets, a new voyage starts a fresh page; the tools count these)
  let firstFire = false; // the first fire of this stop has been put out
  let tallies = {}; // tag -> { name -> { ref, n } } (this stop)
  let falls = {}; // name -> overboard falls this run
  let carry = {}; // name -> { kind, since } while he holds a sandbag / crate
  let carried = new Set(); // names that already earned the sandbag moment this stop
  let crisis = { t: 0, helm: {} }; // a stretch of trouble: seconds so far, and how long each person held the helm in it
  let held = {}; // player id -> the load in his hands last step (L7: a load that is gone because he was knocked out or fell is 'butterfingers', a tally)

  // ---- who ----
  const crew = () => Object.values(world.players).filter((p) => p && !p.mate && !p.enemy && p.connected !== false);
  const ref = (p) => ({ name: p.name || 'Somebody', color: p.color, species: p.species, bot: !!p.bot });
  const asPlayer = (w) => (w && typeof w === 'object' ? w : typeof w === 'string' ? world.players[w] || { name: w } : null);
  const score = (p, keys) => keys.reduce((s, k, i) => s + ((p.stats && p.stats[k]) || 0) * (keys.length - i), 0);
  // The crewman who did the most of these jobs this stop (ties: the first aboard; nobody did any: the first aboard), or null when there is no crew.
  const busiest = (keys) => {
    const list = crew();
    let best = null, bs = -1;
    for (const p of list) { const s = score(p, keys); if (s > bs) { best = p; bs = s; } }
    return best;
  };
  // The name of the room a crewman stands in ("Boiler Room"), else his deck ("Main Deck").
  const whereOf = (p) => {
    try {
      const L = shipOf(world, p).layout, pl = L.platforms[p.d];
      if (!pl) return null;
      const room = (L.rooms || []).find((r) => r.p === pl.id && p.x >= r.x0 && p.x <= r.x1 && !r.outside);
      return room ? room.name : pl.name || null;
    } catch { return null; }
  };

  // ---- recording ----
  function moment(kind, o = {}) {
    if (!LG().ENABLED || world.phase === 'lobby' || (world.match && world.match.on)) return null;
    let who = (Array.isArray(o.who) ? o.who : o.who != null ? [o.who] : []).map(asPlayer).filter((p) => p && p.name && !p.mate && !p.enemy);
    who = who.filter((p, i) => who.findIndex((q) => q.name === p.name) === i);
    if (!who.length) { const p = busiest(BUSY[kind] || ANY); if (p) who = [p]; }
    const st = stopInfo() || { no: 0, name: '', env: null };
    const first = who[0];
    const m = {
      n: ++n, t: Math.round(t * 10) / 10, stop: st.no, stopName: st.name, env: st.env, kind,
      who: who.map((p) => p.name), where: o.where !== undefined ? o.where : first && first.d != null ? whereOf(first) : null,
      what: o.what || '', weight: o.weight != null ? o.weight : LG().WEIGHT[kind] ?? 1,
      data: { ...(o.data || {}), crew: who.map(ref) },
    };
    ring.push(m);
    totals.all++;
    if (m.weight > 0 && m.who.length) totals.named++;
    totals.kinds[kind] = (totals.kinds[kind] || 0) + 1;
    while (ring.length > LG().RING) ring.shift();
    if (onMoment) { try { onMoment(m); } catch { /* (the film is never worth a crash) */ } }
    return m;
  }
  const note = (tag, p) => {
    if (!p || p.mate || p.enemy || !p.name) return;
    const row = ((tallies[tag] ||= {})[p.name] ||= { ref: ref(p), n: 0 });
    row.n++;
  };
  // The people who did a small thing this stop, most first: [{ ref, n }] (and forget the tally).
  const takeTally = (tag) => {
    const rows = Object.values(tallies[tag] || {}).sort((a, b) => b.n - a.n);
    delete tallies[tag];
    return rows;
  };

  // ---- the small hooks of the sim ----
  const noteStat = (p, key, count) => {
    if (!p || p.mate || !LG().ENABLED) return;
    if (key === 'fires' && !firstFire) {
      firstFire = true;
      moment('fire-first', { who: [p], data: { n: count } });
    } else if (key === 'revives') {
      const burning = (shipOf(world, p).ctx.fires || []).length;
      if (burning >= LG().FIRES_UNDER) moment('revive-fire', { who: [p], data: { fires: burning } });
    }
  };
  // A crewman went overboard and woke in the medical bay.
  const overboard = (p) => {
    if (!p || p.mate || p.enemy) return;
    const c = (falls[p.name] = (falls[p.name] || 0) + 1);
    const lunatic = c % 3 === 0;
    moment(lunatic ? 'overboard-lunatic' : 'overboard', { who: [p], weight: lunatic ? undefined : LG().WEIGHT.overboard + Math.min(LG().OVERBOARD_MAX, (c - 1) * LG().OVERBOARD_PLUS), data: { n: c } });
  };

  const flushCrisis = () => {
    const C = LG().HELM;
    if (crisis.t >= C.MIN_SECS && !world.ship.down) {
      const [name, secs] = Object.entries(crisis.helm).sort((a, b) => b[1] - a[1])[0] || [];
      if (name && secs >= crisis.t * C.STAY) moment('helm-held', { who: [name], where: 'Helm', data: { secs: Math.round(crisis.t) } });
    }
    crisis = { t: 0, helm: {} };
  };

  // Once per flying step (simulation.js, next to salvageWatch): the clock, and the two moments that take time.
  const tick = (dt) => {
    t += dt;
    if (!LG().ENABLED) return;
    const L = LG();
    const seen = {};
    for (const p of Object.values(world.players)) {
      if (!p || p.mate || p.enemy) continue;
      if (config.AWARDS.ENABLED) { // (L7 awards v2: a load that was in his hands and is gone because he was knocked out or fell: Butterfingers)
        const load = config.AWARDS.BUTTER.LOADS.includes(p.carry) ? p.carry : null;
        if (held[p.id] && !p.carry && (p.ko > 0 || p.fall)) note('drops', p);
        if (load) held[p.id] = load; else delete held[p.id];
      }
      if (p.carry === 'sandbag' || p.carry === 'crate') {
        const c = carry[p.name];
        if (!c || c.kind !== p.carry) carry[p.name] = { kind: p.carry, since: t };
        else if (t - c.since >= L.SANDBAG_SECS && !carried.has(p.name)) { carried.add(p.name); moment('sandbag', { who: [p], data: { item: p.carry, secs: Math.round(t - c.since) } }); }
        seen[p.name] = true;
      }
    }
    for (const k of Object.keys(carry)) if (!seen[k]) delete carry[k];
    const trouble = !world.ship.down && (hullOrStructure(world.ship) < L.HELM.HULL || !!world.goingDown);
    if (trouble) {
      crisis.t += dt;
      const h = helm();
      if (h) crisis.helm[h.name] = (crisis.helm[h.name] || 0) + dt;
    } else if (crisis.t > 0) flushCrisis();
  };

  // The end of a stop: whoever did a job a lot earns a moment (the stats are the stop's own: they are banked and reset right after).
  const stopEnd = (players) => {
    const L = LG();
    flushCrisis();
    if (L.ENABLED) {
      const list = (players || crew()).filter((p) => p && !p.mate && !p.enemy);
      for (const [key, at] of Object.entries(L.LEADER)) {
        let best = null;
        for (const p of list) if (((p.stats && p.stats[key]) || 0) > ((best && best.stats[key]) || 0)) best = p;
        const c = best ? Math.round(best.stats[key]) : 0;
        if (best && c >= at) moment('leader', { who: [best], where: null, weight: Math.min(L.LEADER_W.MAX, L.LEADER_W.BASE + (c / at - 1) * L.LEADER_W.PER), data: { stat: key, n: c } });
      }
    }
    firstFire = false;
    tallies = {};
    carried = new Set();
  };

  // The moments of one stop: forStop(no) = all that were recorded under that number; open() = those not yet written into the Log (a stop she limped home from is flown again under the same number).
  let closed = 0;
  const forStop = (no) => ring.filter((m) => m.stop === no);
  const open = () => ring.filter((m) => m.n > closed);
  const close = () => { closed = n; };
  // The heaviest of a list of moments (the first of equals), or null.
  const best = (list) => list.reduce((b, m) => (m.weight > (b ? b.weight : 0) ? m : b), null);

  const restart = () => {
    ring.length = 0;
    t = 0; n = 0; closed = 0; firstFire = false; tallies = {}; falls = {}; carry = {}; carried = new Set(); crisis = { t: 0, helm: {} }; held = {};
  };

  // `world.moment` is what the rest of the game calls (a ship's context finds it through the prototype: ships.js WORLD_SHARED). Not enumerable: they are no data.
  for (const [k, fn] of [['moment', moment], ['momentNote', note], ['momentTake', takeTally], ['momentOverboard', overboard]]) Object.defineProperty(world, k, { value: fn, enumerable: false, configurable: true, writable: true });
  return { moment, note, takeTally, noteStat, overboard, tick, stopEnd, forStop, open, close, best, restart, ring, busiest, whereOf, totals, clock: () => t };
}
