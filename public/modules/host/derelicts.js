// DERELICTS, STRIPPING AND NAMED PARTS (LOOP.md G5, config.DERELICT): wrecked airships drift in the open sky of some stops (every SALVAGE RUN has three). ground.js builds this next to the objectives and the treasure and calls it from its
// own step; it plays only while the away team exists (3 or more crew, an open-sky map) - otherwise the wrecks are scenery and no random number is drawn. Every stop can still be won from the ship: the wrecks are a bonus (and, in a
// SALVAGE RUN, the one big thing - stopGoals.js - which a crew that cannot go ashore never sees: it flies the old beacon run).
//
//   WRECK    a hull drifting at DRIFT px/s, DECK a platform of the away team (S.decks, d.deck: moves like the Titan's island): hook it, drop onto it with a parachute, or let the rope ladder down while the helm hovers over it
//   PARTS    2 or 3 on each (a gun, a lamp, an engine ...): hold Action at one for STRIP.TIME s and it is unbolted - a CRATE in your arms (treasure.js give: a chest of kind 'part'), heavy, carried to the rope ladder, up it, STOWed in the hold
//   NAMED    each crate paid at the stop's end is a named part card at the next dock (simulation.js namedCard): "the Kestrel's long gun", stripped by Ann and Bo - the Yard part itself, cheap, with its story
//   EXTRAS   a light surprise on some wrecks: a locker with coins, a stranded sailor to free (salvage), a bat nest that bursts out when the first part comes loose
//
// State: state.away.der = { list, clock, closing, got, stats }; a wreck is { id, name, x (the deck's middle), y (the deck), w, vx, home, range, parts: [ { id, label, dx, state bolted | taken, prog, by } ], surprise, deck, boarded, told, fate }.
// Everything is deterministic: a hash of the stop picks the wrecks, their names, their parts and the extras (no random numbers).
import { config } from '../../config.js';
import { pop } from './popups.js';
import { holdAdd } from './scrap.js';
import { findHover } from './maps.js';

const D = () => config.DERELICT;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

export function createDerelicts({ state, S, host, tre }) {
  const stats = { spawned: 0, boarded: 0, stripped: 0, aboard: 0, paid: 0, rescued: 0, coins: 0, nests: 0, sunk: 0, trips: 0, told: 0, carried: 0 }; // (the tools' tally: it runs on over every map of a run)
  const fresh = () => ({ list: [], nextId: 1, clock: 0, closing: 0, got: 0, stripped: 0, stats });
  S.der = fresh();
  const mapNow = () => (state.course && state.course.map) || null;
  const humans = () => Object.values(state.players).some((p) => !p.bot && !p.enemy && !p.mate && p.connected !== false);
  const say = (text, hold = 3.5) => humans() && state.say && state.say('objective', text, null, hold); // (bot-only play says nothing: it changes nothing)
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who ? (Array.isArray(who) ? who : [who]) : [], where: null, data });
  const upper = (s) => String(s || '').toUpperCase();
  const runInfo = () => (state.run ? (state.run.derelict ||= { pending: [], names: [], boarded: 0, stripped: 0, hauled: 0, named: 0, won: 0, lost: 0, defendWon: 0, defendLost: 0 }) : null);

  // ---------- making wrecks ----------
  const pickKind = (key, taken) => {
    const pool = D().KINDS.filter((k) => !taken.includes(k.id)), list = pool.length ? pool : D().KINDS;
    let r = hash(key) * list.reduce((a, k) => a + k.w, 0);
    for (const k of list) if ((r -= k.w) <= 0) return k;
    return list[list.length - 1];
  };
  function make(site, k, key) {
    const K = D(), h = (tag) => hash(key + '|' + k + '|' + tag);
    const w = Math.round(K.W[0] + (K.W[1] - K.W[0]) * h('w'));
    const n = clamp(K.PARTS.MIN + Math.floor(h('n') * (K.PARTS.MAX - K.PARTS.MIN + 1)), K.PARTS.MIN, K.PARTS.MAX);
    const used = [], parts = [];
    for (let i = 0; i < n; i++) {
      const kind = pickKind(key + '|' + k + '|p' + i, used);
      used.push(kind.id);
      parts.push({ k: i, id: kind.id, label: kind.label, dx: Math.round((i - (n - 1) / 2) * (n === 2 ? 0.34 : 0.27) * w), state: 'bolted', prog: 0, worked: false, by: null });
    }
    const info = runInfo(), taken = info ? info.names : [];
    let avail = K.NAMES.filter((x) => !taken.includes(x));
    if (!avail.length) { avail = K.NAMES.slice(); if (info) info.names.length = 0; }
    const nm = avail[Math.floor(h('name') * avail.length)];
    if (info) info.names.push(nm);
    let surprise = null;
    if (h('sup') < K.SURPRISE.CHANCE) {
      const kind = K.SURPRISE.KINDS[Math.floor(h('supk') * K.SURPRISE.KINDS.length)];
      surprise = { kind, dx: Math.round((h('supx') < 0.5 ? -1 : 1) * w * 0.42), state: 'ready', prog: 0, worked: false };
    }
    const dir = h('dir') < 0.5 ? -1 : 1;
    const d = { id: S.der.nextId++, name: 'the ' + nm, short: nm, x: site.x, y: site.y, w, x0: site.x - w / 2, x1: site.x + w / 2, vx: dir * K.DRIFT * (0.6 + 0.8 * h('v')), home: site.x, range: K.DRIFT_RANGE, hx: site.hx, hy: site.hy, parts, surprise, deck: null, boarded: false, told: false, fate: 'drift', seed: Math.floor(h('seed') * 1e6), taken: 0 };
    S.der.list.push(d);
    stats.spawned++;
    return d;
  }

  // A new map: the wrecks it holds. A SALVAGE RUN field has its sites made for them (maps.js buildFieldMap); an ordinary open-sky stop of the voyage has one now and then (a hash of the stop).
  function begin(map) {
    S.der = fresh();
    const K = D();
    if (!K.ENABLED || !config.AWAY.ENABLED || !map || !map.open || map.lair || map.ring || map.arena || !state.course) return;
    const stop = state.course.stop;
    if (!stop) return;
    const key = String(stop.id || 0) + '|' + (state.run && state.run.voyage ? state.run.voyage.seed : 0);
    let sites = [];
    if (map.field === 'salvage') sites = map.sites || [];
    else if (map.field) return; // (a DEFEND field has a balloon, no wreck)
    else if (!stop.flagship && (stop.col || 0) >= K.SPAWN.FROM_COLUMN && hash(key + '|der') < K.SPAWN.CHANCE) {
      const C = map.CELL, kx = Math.round(map.W * (0.3 + 0.5 * hash(key + '|x'))), site = findHover(map, kx, Math.round(map.H * 0.3) + Math.floor(hash(key + '|y') * 6));
      if (site) sites = [{ x: (site.i + 0.5) * C, y: (site.jr + 0.5) * C + K.HOVER_REF, hx: (site.i + 0.5) * C, hy: (site.jr + 0.5) * C }];
    }
    sites.slice(0, map.field === 'salvage' ? K.RUN.DERELICTS : K.SPAWN.MAX).forEach((s, k) => make(s, k, key));
    if (S.der.list.length && S.tre) S.tre.keep = true; // (the crates of parts are live on this map)
    syncDecks();
  }
  function reset() { S.der = fresh(); }

  // ---------- the decks ----------
  function syncDecks() {
    for (const d of S.der.list) {
      d.x0 = d.x - d.w / 2;
      d.x1 = d.x + d.w / 2;
      if (!d.deck) { d.deck = { id: 'der' + d.id, derelict: d, moves: true, x0: d.x0, x1: d.x1, y: d.y }; S.decks.push(d.deck); } else Object.assign(d.deck, { x0: d.x0, x1: d.x1, y: d.y });
    }
  }
  const partX = (d, part) => d.x + part.dx;

  // ---------- each step (ground.js update) ----------
  function update(dt) {
    const t = S.der, K = D();
    if (!t.list.length) return;
    t.clock += dt;
    for (const d of t.list) {
      if (d.fate === 'drift') {
        d.x += d.vx * dt;
        if (Math.abs(d.x - d.home) > d.range) { d.vx = -d.vx; d.x = d.home + Math.sign(d.x - d.home) * d.range; } // (turns round at DRIFT_RANGE)
      }
      for (const part of d.parts) { if (part.state === 'bolted' && !part.worked && part.prog > 0) part.prog = Math.max(0, part.prog - dt * K.STRIP.DECAY); part.worked = false; }
      if (d.surprise) { const s = d.surprise; if (s.state === 'ready' && !s.worked && s.prog > 0) s.prog = Math.max(0, s.prog - dt * K.STRIP.DECAY); s.worked = false; }
      if (!d.told && S.on && Math.abs(d.x - S.rope.x) < K.SPAWN.SHOW && !(state.course && state.course.goal)) {
        d.told = true;
        stats.told++;
        say('A WRECK DRIFTS NEAR: ' + upper(d.name) + ' - ' + d.parts.length + ' PARTS TO STRIP. HOVER OVER HER AND LOWER THE ROPE LADDER', 5);
      }
    }
    syncDecks();
    for (const p of host.onGround()) { // the first man on a wreck makes the Book
      const dk = p.on.deck, d = dk && dk.derelict;
      if (!d || d.boarded) continue;
      d.boarded = true;
      stats.boarded++;
      const ri = runInfo();
      if (ri) ri.boarded++;
      moment('derelict-boarded', p, { name: d.name });
      if (!p.bot) { pop(state, p.x, p.y - 170, 'ON THE WRECK!', '#b8c4cc', 1.3); host.phoneFx(p, 'You are on ' + d.name + '! Walk to a glowing part and HOLD the big button to unbolt it.', [30, 40, 30]); }
    }
    if (t.closing > 0 && (t.closing -= dt) <= 0) sinkAll();
  }
  // The objective is over (or the stop is): the wrecks go down in s seconds.
  function close(secs = D().SINK_AFTER) { if (S.der.list.length && !(S.der.closing > 0)) S.der.closing = Math.max(0.01, secs); }
  function sinkAll() {
    const t = S.der;
    for (const d of t.list) {
      d.fate = 'sunk';
      stats.sunk++;
      if (d.deck) S.decks = S.decks.filter((q) => q !== d.deck);
      pop(state, d.x, d.y - 120, 'SUNK', '#c9c9c9', 1);
      host.puff(d.x, d.y, '#555', 12);
    }
    t.list = [];
    t.closing = 0;
  }

  // ---------- working a part (ground.js step: the Action button) ----------
  // The part or extra a man on a wreck's deck can work now: { kind: 'part' | 'cache' | 'survivor', rec, d, time, label } or null.
  function spotFor(p) {
    const o = p.on, dk = o && o.deck, d = dk && dk.derelict;
    if (!d || o.mode !== 'walk') return null;
    const ST = D().STRIP;
    let best = null, bd = Infinity;
    for (const part of d.parts) {
      if (part.state !== 'bolted') continue;
      const dx = Math.abs(p.x - partX(d, part));
      if (dx <= ST.REACH && Math.abs(p.y - d.y) <= ST.HEIGHT && dx < bd) { best = { kind: 'part', rec: part, d, time: ST.TIME, label: 'UNBOLT THE ' + upper(part.label) }; bd = dx; }
    }
    const s = d.surprise;
    if (s && s.state === 'ready' && s.kind !== 'nest') {
      const dx = Math.abs(p.x - (d.x + s.dx));
      if (dx <= ST.REACH && Math.abs(p.y - d.y) <= ST.HEIGHT && dx < bd) best = { kind: s.kind, rec: s, d, time: D().SURPRISE[upper(s.kind)].TIME, label: s.kind === 'survivor' ? 'FREE THE SAILOR' : 'OPEN THE LOCKER' };
    }
    return best;
  }
  function act(p, dt, ctl) {
    if (!S.on || p.carry === 'chest' || !host.mine(p)) return null;
    const hit = spotFor(p);
    if (!hit) return null;
    const a = { type: 'strip', obj: hit.rec, hold: true, time: hit.time, label: hit.label };
    if (p.fire && ctl.holdOk(p)) {
      hit.rec.worked = true;
      hit.rec.prog += dt / hit.time;
      if (hit.rec.prog >= 1) { hit.rec.prog = 0; complete(hit, p); }
    }
    return a;
  }
  function complete(hit, p) {
    const d = hit.d, rec = hit.rec, ri = runInfo();
    if (hit.kind === 'part') {
      rec.state = 'taken';
      rec.by = p.name;
      d.taken++;
      S.der.stripped++;
      stats.stripped++;
      if (ri) ri.stripped++;
      const c = tre.give(p, { deck: d.deck, name: upper(rec.label), card: { entry: rec.id, label: rec.label, from: d.name, derelict: d.short } });
      c.part = rec;
      moment('derelict-stripped', p, { name: d.name, names: [rec.label] });
      pop(state, p.x, p.y - 190, 'GOT IT!', '#b8c4cc', 1.3);
      host.puff(p.x, p.y - 60, '#c9c2b0', 8);
      host.phoneFx(p, 'The ' + rec.label + ' comes away! Heavy - walk it to the rope ladder and climb. ATTACK puts it down.', [30, 40, 30]);
      if (d.surprise && d.surprise.kind === 'nest' && d.surprise.state === 'ready') fireNest(d);
    } else if (hit.kind === 'survivor') {
      rec.state = 'done';
      stats.rescued++;
      const K = D().SURPRISE.SURVIVOR;
      host.deps().salvage && host.deps().salvage(K.PAY, 'Sailor freed!');
      moment('derelict-rescue', p, { name: d.name });
      pop(state, p.x, p.y - 190, 'FREED!', '#8fe388', 1.3);
      host.phoneFx(p, 'You free a stranded sailor! He presses the ship\'s purse into your hands.', [30, 40, 30]);
      say('A SAILOR WAS TRAPPED ON ' + upper(d.name) + ' - SALVAGE +' + K.PAY, 3);
    } else {
      rec.state = 'done';
      stats.coins++;
      const K = D().SURPRISE.CACHE;
      host.deps().salvage && host.deps().salvage(K.PAY, 'Locker opened!');
      pop(state, p.x, p.y - 190, 'COINS!', '#ffd23f', 1.3);
      host.phoneFx(p, 'The locker is full of coins!', [30, 40, 30]);
    }
  }
  function fireNest(d) {
    d.surprise.state = 'done';
    stats.nests++;
    host.bats && host.bats({ x: d.x + d.surprise.dx, y: d.y - 80 }, D().SURPRISE.NEST.BATS);
    say('A BAT NEST! THEY BURST OUT OF ' + upper(d.name) + '!', 3.5);
  }

  // ---------- the crates come aboard (treasure.js calls these) ----------
  // A stripped part is aboard (up the rope, or hooked into the hold): it counts for the wreck's score and for the Book, once.
  function partIn(c, p, how) {
    if (c.counted) return;
    c.counted = true;
    S.der.got++;
    stats.aboard++;
    const ri = runInfo();
    if (ri) ri.hauled++;
    const card = c.card || {}, names = [...new Set((c.lifters || []).map((id) => state.players[id]).filter(Boolean))];
    moment('derelict-hauled', names.length ? names : p, { name: card.from || 'the wreck', names: [card.label || 'a part'] });
    const got = D().CRATE.BUNDLES > 0 ? holdAdd(state, D().CRATE.BUNDLES) : 0;
    if (p && !p.bot) host.phoneFx(p, (card.label ? 'The ' + card.label + ' is aboard' : 'A part is aboard') + (got ? ' (+' + got + ' scrap)' : '') + '! It becomes a named card at the dock.', [30, 40, 30]);
    say(upper(card.from || 'THE WRECK') + "'S " + upper(card.label || 'PART') + ' IS ABOARD!', 3);
    void how;
  }
  // The stop's end (treasure.js pay): the card for the next dock. c.lifters are who carried it (the stripper first).
  function partPaid(c) {
    const ri = runInfo();
    stats.paid++;
    if (!ri || !c.card) return;
    const by = [...new Set((c.lifters || []).map((id) => state.players[id]).filter(Boolean).map((q) => q.name))];
    ri.pending.push({ entry: c.card.entry, label: c.card.label, from: c.card.from, by, stop: state.course && state.course.stop ? state.course.stop.name : '' });
    while (ri.pending.length > D().NAMED.MAX_PENDING) ri.pending.shift();
  }

  // ---------- the phone ----------
  function ui(p) {
    const o = p.on;
    const dk = o && o.deck, d = dk && dk.derelict;
    if (!d || o.mode !== 'walk') return null;
    const hit = spotFor(p);
    if (hit) return { hint: hit.kind === 'part' ? 'HOLD the big button: unbolt the ' + hit.rec.label + '.' : hit.kind === 'survivor' ? 'A sailor is trapped here! HOLD the big button to free him.' : 'HOLD the big button to open the locker.', verb: 'STRIP' };
    if (p.carry === 'chest') return null;
    const left = d.parts.filter((q) => q.state === 'bolted').length;
    return { hint: left ? 'On ' + d.name + '. Walk to a part and HOLD the big button to unbolt it. FIRE FLARE calls the ship; JUMP leaps off.' : d.name + ' is stripped bare. Climb the rope ladder home, or FIRE FLARE.', verb: 'STRIP' };
  }
  // The job on an away man's phone: the arrow to the nearest bolted part (or the survivor / the locker), when his hands are empty.
  function job(p, f) {
    const o = p.on, dk = o && o.deck, d = dk && dk.derelict;
    if (!d || o.mode !== 'walk' || p.ko > 0 || p.carry === 'chest') return null;
    let best = null, bd = Infinity;
    for (const part of d.parts) if (part.state === 'bolted') { const dx = Math.abs(partX(d, part) - p.x); if (dx < bd) { best = { x: partX(d, part), label: 'UNBOLT THE ' + upper(part.label) }; bd = dx; } }
    const s = d.surprise;
    if (!best && s && s.state === 'ready' && s.kind !== 'nest') best = { x: d.x + s.dx, label: s.kind === 'survivor' ? 'FREE THE SAILOR' : 'OPEN THE LOCKER' };
    if (!best) return null;
    const dx = best.x - p.x, near = Math.abs(dx) < D().STRIP.REACH * 0.7;
    return { kind: 'strip', label: best.label, dir: near ? null : dx * f > 0 ? 'right' : 'left', color: '#7fb2d9', verb: 'STRIP', away: true };
  }
  // The job on the phone of a man still aboard: a wreck hangs under the rope ladder with parts left - go down. { d, x, label } (the lowest deck's hatch) or null.
  function shipJob(p) {
    const t = S.der, R = S.rope;
    if (!S.on || !t.list.length || p.carry || p.bot || !R.groundDeck || !R.groundDeck.derelict || R.gap > config.AWAY.LADDER.REACH) return null;
    const d = R.groundDeck.derelict;
    if (!d.parts.some((q) => q.state === 'bolted')) return null;
    const sp = host.ropeSpot();
    return { d: sp.d, x: sp.x, label: 'STRIP ' + upper(d.name) + ' - CLIMB DOWN THE ROPE LADDER' };
  }

  // ---------- the bots ----------
  // Bots go on foot to strip in a SALVAGE RUN (also without AWAY.BOT_TRIPS, config.DERELICT.BOTS.IN_RUN); in other stops only on a tools trip.
  const botsGo = () => { const g = state.course && state.course.goal; return !!D().BOTS.IN_RUN && !!g && g.kind === 'salvage' && !g.done && !g.over; };
  // Can a bot start a strip trip now (the rope reaches a wreck with a bolted part, within RANGE of the hatch)? Who goes is ground.js's decision (one at a time up to BOTS.MAX_AWAY).
  function tripWanted() {
    const R = S.rope, K = D().BOTS;
    if (!(config.AWAY.BOT_TRIPS || botsGo()) || !S.on) return false;
    const dk = R.groundDeck;
    if (!dk || !dk.derelict || R.gap > config.AWAY.LADDER.REACH - 20 || R.gap === Infinity) return false;
    const d = dk.derelict;
    return d.fate === 'drift' && Math.abs(d.x - R.x) < K.RANGE && d.parts.some((q) => q.state === 'bolted');
  }
  // Where a tripping bot goes and whether it holds: { x, fire, done }. done = he has it (or nothing is left): he goes home.
  function botGoal(p) {
    if (tre.carrying(p)) return { x: p.x, fire: false, done: true };
    const dk = p.on && p.on.deck, d = dk && dk.derelict;
    if (!d) return { x: p.x, fire: false, done: true };
    const others = host.onGround().filter((q) => q !== p && q.on.deck === dk);
    let best = null, bd = Infinity;
    for (const part of d.parts) {
      if (part.state !== 'bolted') continue;
      const x = partX(d, part), dist = Math.abs(x - p.x);
      if (others.some((q) => Math.abs(q.x - x) < dist - 30)) continue; // (a mate is nearer to that one: take another)
      if (dist < bd) { best = x; bd = dist; }
    }
    if (best == null) return { x: p.x, fire: false, done: true };
    return { x: best, fire: bd < D().STRIP.REACH * 0.5, done: false };
  }
  // Tools only (AWAY.BOT_TRIPS): the bot helm hovers over a wreck with a part left, for at most BOTS.CALL s, so a trip can reach it: { x, y (where the rope's top should be), name, gx, gy } or null.
  function call() {
    const K = D().BOTS, R = S.rope;
    if (!config.AWAY.BOT_TRIPS || !S.on) return null;
    const d = target(R.x);
    if (!d || Math.abs(d.x - R.x) > K.CALL_RANGE) return null;
    if (d.callUntil == null) d.callUntil = S.clock + K.CALL;
    if (S.clock > d.callUntil) return null;
    return { id: 'wreck', name: upper(d.name), x: d.x, y: d.y - config.AWAY.LADDER.HOVER, gx: d.x, gy: d.y, flare: false, bot: false };
  }
  // How many men are on a wreck's deck the rope reaches (they keep the ladder down: ground.js ropeStep).
  function onDeckCount() { const dk = S.rope.groundDeck; return dk && dk.derelict ? host.onGround().filter((p) => p.on.deck === dk).length : 0; }
  // The wreck the ship should work now (the bot helm's goal in a SALVAGE RUN, stopGoals.js): the nearest one with a part still bolted or a crate still lying on it; null = none.
  function target(fromX) {
    let best = null, bd = Infinity;
    for (const d of S.der.list) {
      if (d.fate !== 'drift') continue;
      const open = d.parts.some((q) => q.state === 'bolted') || S.tre.chests.some((c) => c.kind === 'part' && c.state === 'ground' && c.onDeck === d.deck) || host.onGround().some((p) => p.on.deck === d.deck && p.carry === 'chest');
      if (!open) continue;
      const dist = Math.abs(d.x - fromX);
      if (dist < bd) { best = d; bd = dist; }
    }
    return best;
  }

  return { begin, reset, update, close, act, ui, job, shipJob, partIn, partPaid, tripWanted, botGoal, botsGo, call, onDeckCount, target, spotFor, make, syncDecks, stats };
}
