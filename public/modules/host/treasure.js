// OUTPOST TREASURE (CASTLE.md package A2 + LOOP.md G3/T, config.AWAY.TREASURE): the reward of an outpost raid is on the ground. When an outpost on an open-sky map is destroyed its VAULT opens, with CHESTS in it
// (1 to 3 by the stop's danger) and maybe a sack of gold. ground.js builds this next to the objectives and calls it from its own step; it plays only while the away team exists (3 or more crew, an open-sky map) -
// otherwise nothing here runs, no random number is drawn and the game is exactly A1's. Every stop can still be won from the air: the treasure is a bonus.
//
//   VAULT    (an outpost's foot)  opens the moment the outpost falls; things lie in it SPACING px apart
//   GRAB     hold Action at a chest: it is lifted (player.carry 'chest', the existing carry system); heavy: SOLO x his walk and his climb. A second man who holds Action at it HELPS: PAIR x each
//   CARRY    to the rope ladder's foot and up it (aboard, the chest is still in his arms); ATTACK puts it down. Left behind (the walk home), knocked out, stepped off a ledge: it is put down where he was
//   STOW     Action at the hold bin (cargo.js stowAction, the same bin as the scrap): the chest weighs on the LIFT (scrap.js holdWeight -> balance, structure, going down) until the stop ends; bots stow at once
//   HOOK     the hookshot catches a chest near its line and hauls it up into the hold (hookshot.js)
//   PAY      the stop ending (simulation.js stopDone) or the dock (startDock) pays each stowed chest and any in a man's arms aboard; a chest lifted in the F6 ESCAPE calm is a HEIST (a bonus, a Book moment)
//   GUARDS   the first chest lifted calls a small squad; it walks up, aims (a tell and a line), and shoots at a man who CARRIES: run, shove it (ATTACK), put the chest down, or carry it in a pair
//
//   PARTS    (LOOP.md G5, derelicts.js) a part stripped off a wreck is a chest of kind 'part': give() puts it in a man's arms, it is carried, put down (on a wreck's deck it lies there and drifts with her: c.onDeck), roped up, stowed, hooked and paid like a chest -
//            but paid as a named part card at the next dock (host.partIn when it comes aboard, host.partPaid when it is paid)
// State: state.away.tre = { on, vaults, chests, guards, shots, stats }; a chest is { id, vault, kind chest | gold, x, y, state ground | carried | hauled | aboard | hold | gone, by: [player ids], w, pay, prog, heist }.
// Everything is deterministic (a hash of the stop and the outpost picks the gold; a private generator rolls the guards' shots).
import { config } from '../../config.js';
import { pop } from './popups.js';
import { hurt, knockOut } from './health.js';
import { holdSpot } from './scrap.js';

const T = () => config.AWAY.TREASURE;
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h / 4294967296; };

export const META = {
  chest: { label: 'CHEST', verb: 'GRAB', act: 'GRAB THE CHEST', color: '#ffd23f' },
  gold: { label: 'GOLD', verb: 'GRAB', act: 'GRAB THE GOLD', color: '#ffe27a' },
  part: { label: 'PART', verb: 'GRAB', act: 'LIFT THE PART', color: '#b8c4cc' }, // (LOOP.md G5, derelicts.js: a part stripped off a wreck is a heavy crate carried exactly like a chest: it lies on the wreck's deck, up the rope, into the hold; paid as a named part card at the dock)
};

// ---- the hold (cargo.js reads these; scrap.js holdWeight reads state.chestHold) ----
export const holdOf = (state) => (state.chestHold ||= { list: [], w: 0 });
// The Action button aboard with a chest in your arms: STOW it at the hold bin (null elsewhere).
export function chestStowAction(state, p, L, here) {
  const sp = holdSpot(L);
  if (!sp || p.carry !== 'chest' || !here(sp, config.TOOLS.REACH)) return null;
  const tre = state.away && state.away.tre;
  if (!tre || !tre.chests.some((c) => c.state === 'aboard' && c.by[0] === p.id)) return null;
  const cap = T().HOLD_CAP, n = holdOf(state).list.length;
  return n >= cap ? { type: 'need', label: `The hold is full (${n}/${cap}) - chests in your arms still count` } : { type: 'stow', obj: sp, label: `STOW THE CHEST (${n + 1}/${cap})` };
}

export function createTreasure({ state, S, host }) {
  const stats = { vaults: 0, opened: 0, chests: 0, gold: 0, lifted: 0, helped: 0, dropped: 0, lost: 0, aboard: 0, stowed: 0, hooked: 0, paid: 0, heists: 0, guards: 0, tells: 0, shots: 0, hits: 0, kos: 0, shoves: 0, left: 0, trips: 0 }; // (the tools' tally: it runs on over every map of a run)
  const fresh = () => ({ on: false, clock: 0, vaults: [], chests: [], guards: [], shots: [], nextId: 1, seed: 0x2f6e2b1d, note: false, stowMoment: false, keep: false, stats }); // (keep: G5, a map with wrecks on it: the chests (parts) are live even with no vault)
  S.tre = fresh();
  const mapNow = () => (state.course && state.course.map) || null;
  const humans = () => Object.values(state.players).some((p) => !p.bot && !p.enemy && !p.mate && p.connected !== false);
  const say = (text, hold = 3.5) => humans() && state.say && state.say('objective', text, null, hold); // (bot-only play says nothing: it changes nothing)
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who ? (Array.isArray(who) ? who : [who]) : [], where: null, data });
  const upper = (p) => String(p.name || 'CREW').toUpperCase();
  const rng = () => { const t = S.tre; t.seed = (t.seed + 0x6d2b79f5) | 0; let z = Math.imul(t.seed ^ (t.seed >>> 15), 1 | t.seed); z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z; return ((z ^ (z >>> 14)) >>> 0) / 4294967296; };
  const vaultOf = (c) => S.tre.vaults.find((v) => v.k === c.vault);
  const chestOf = (p, ...states) => S.tre.chests.find((c) => c.by.includes(p.id) && (states.length ? states.includes(c.state) : c.state === 'carried' || c.state === 'aboard'));
  const carrying = (p) => p.carry === 'chest' && !!chestOf(p);
  const open = () => S.tre.chests.filter((c) => c.state === 'ground' || c.state === 'carried'); // (what is still down there)

  // ---------- a new ground ----------
  // One vault for each outpost of an open-sky raid (a ring's faces, a lair, a cave and the arena have none).
  function begin(map) {
    const t = (S.tre = fresh());
    const K = T();
    if (!K.ENABLED || !config.AWAY.ENABLED || !map || !map.open || map.lair || map.ring || map.arena || !map.outposts) return;
    if (map.field) return; // (a field map has no outposts to open a vault: its parts come off the wrecks, derelicts.js)
    map.outposts.forEach((o, k) => t.vaults.push({ k, x: o.x, y: o.y, state: 'shut', ids: [], alarm: false, guardT: 0, guards: false, openAt: 0 }));
    stats.vaults += t.vaults.length;
  }
  function reset() { S.tre = fresh(); }

  // The outpost fell: its vault opens. Chests by the stop's danger, and a hash decides the gold.
  function openVault(v) {
    const t = S.tre, K = T(), map = mapNow(), crs = state.course;
    const danger = (crs && crs.danger) || 2;
    let n = K.CHESTS.BASE;
    for (const d of K.CHESTS.DANGER_AT) if (danger >= d) n++;
    n = Math.min(K.CHESTS.MAX, n);
    const stop = String((crs.stop && crs.stop.id) || crs.lap || 0);
    const gold = hash(stop + '|' + v.k + '|gold') < K.GOLD.CHANCE;
    const kinds = [];
    for (let i = 0; i < n; i++) kinds.push('chest');
    if (gold) kinds.splice(Math.floor(kinds.length / 2), 0, 'gold');
    const gy0 = host.groundAt(v.x, v.y - 80);
    v.y = gy0 != null ? gy0 : v.y;
    const placed = [];
    kinds.forEach((kind, i) => {
      const want = v.x + (i - (kinds.length - 1) / 2) * K.SPACING;
      let x = want, gy = null;
      for (let k = 0; k < 12 && gy == null; k++) { // (the ground may not be there: slide it toward the vault's middle, then to the other side, never onto another's spot)
        const cand = k < 6 ? want - Math.sign(want - v.x || 1) * k * (K.SPACING / 3) : v.x + (k - 6 + 1) * (K.SPACING / 3) * (i % 2 ? 1 : -1);
        const g = host.groundAt(cand, v.y - 140);
        const flat = [-80, 80].every((d) => { const e = host.groundAt(cand + d, g - 60); return e != null && Math.abs(e - g) <= config.AWAY.STEP; }); // (not on a ledge's lip: a man must be able to stand beside it)
        if (g != null && flat && Math.abs(g - v.y) <= config.AWAY.STEP * 2 && !placed.some((q) => Math.abs(q - cand) < K.SPACING * 0.5)) { x = cand; gy = g; }
      }
      if (gy == null) { x = v.x + (i + 1) * 20; gy = v.y; }
      placed.push(x);
      const c = { id: t.nextId++, vault: v.k, kind, x, y: gy, state: 'ground', by: [], lifters: [], w: kind === 'gold' ? K.GOLD.W : K.CHEST.W, pay: kind === 'gold' ? K.GOLD.PAY : K.CHEST.PAY, prog: 0, worked: false, heist: false, label: META[kind].label, color: META[kind].color };
      t.chests.push(c);
      v.ids.push(c.id);
      stats[kind === 'gold' ? 'gold' : 'chests']++;
    });
    v.state = 'open';
    v.openAt = t.clock;
    stats.opened++;
    const outpostNo = v.k + 1;
    say('THE VAULT OF OUTPOST ' + outpostNo + ' IS OPEN! ' + n + (n === 1 ? ' CHEST' : ' CHESTS') + (gold ? ' AND A SACK OF GOLD' : '') + ' - LOWER THE ROPE LADDER AND GRAB THEM', 4.5);
  }

  // ---------- working a chest (ground.js step: the Action button) ----------
  // The chest a man on the ground can take now: one lying within reach, else one that a single man carries (to help him).
  function chestFor(p) {
    const K = T();
    let best = null, bd = Infinity;
    for (const c of S.tre.chests) {
      let d;
      if (c.state === 'ground') { d = Math.abs(p.x - c.x); if (d > K.REACH || Math.abs(p.y - c.y) > K.HEIGHT) continue; }
      else if (c.state === 'carried' && c.kind === 'chest' && c.by.length === 1 && c.mode === 'walk') { d = Math.abs(p.x - c.x); if (d > K.HELP_REACH || Math.abs(p.y - c.y) > K.HEIGHT) continue; }
      else continue;
      if (d < bd) { best = c; bd = d; }
    }
    return best;
  }
  // The act for the man standing at a chest (or null: the flare). Holding Action fills the chest's bar; full, it is lifted (or he takes the other handle).
  function act(p, dt, ctl) {
    const t = S.tre, K = T();
    if (!t.on || carrying(p) || p.carry === 'chest' || !host.mine(p)) return null;
    const c = chestFor(p);
    if (!c) return null;
    const help = c.state === 'carried', time = help ? K.HELP_TIME : K.GRAB_TIME;
    const a = { type: 'grab', obj: c, hold: true, time, label: help ? 'HELP CARRY THE CHEST' : META[c.kind].act };
    if (p.fire && ctl.holdOk(p)) {
      c.worked = true;
      c.prog += dt / time;
      if (c.prog >= 1) { c.prog = 0; take(c, p); }
    }
    return a;
  }
  function take(c, p) {
    const t = S.tre;
    const helper = c.state === 'carried';
    if (helper && (c.by.length >= 2 || c.by.includes(p.id))) return;
    c.state = 'carried';
    c.by.push(p.id);
    c.mode = 'walk';
    if (!c.lifters.includes(p.id)) c.lifters.push(p.id);
    p.carry = 'chest';
    p.hook = null;
    if (helper) { stats.helped++; pop(state, c.x, c.y - 200, 'TWO CARRY!', c.color, 1.2); host.phoneFx(p, 'You and ' + (state.players[c.by[0]] || {}).name + ' carry it together - faster!', [30, 40, 30]); return; }
    firstLift(c);
    pop(state, c.x, c.y - 200, c.kind === 'gold' ? 'GOLD!' : 'GOT IT!', c.color, 1.3);
    host.phoneFx(p, c.kind === 'gold' ? 'A sack of gold! Carry it to the rope ladder and climb.' : c.kind === 'part' ? 'You have the part! Heavy - walk it to the rope ladder and climb. ATTACK puts it down.' : 'You have the chest! Heavy - walk it to the rope ladder and climb. ATTACK puts it down.', [30, 40, 30]);
  }
  // G5 (derelicts.js): a part comes unbolted in a man's hands: it is a chest (kind 'part') in his arms from this moment. info = { deck (the wreck's deck record), card (what the dock will offer), name (what the TV calls it) }. Returns the chest.
  function give(p, info) {
    const t = S.tre, K = T(), C = config.DERELICT.CRATE;
    const c = { id: t.nextId++, vault: -1, kind: 'part', x: p.x, y: p.y, state: 'carried', by: [p.id], lifters: [p.id], w: C.W, pay: C.PAY, prog: 0, worked: false, heist: false, lifted: true, mode: 'walk', label: info.name || META.part.label, color: META.part.color, deck: info.deck || null, card: info.card || null };
    t.chests.push(c);
    p.carry = 'chest';
    p.hook = null;
    stats.lifted++;
    stats.parts = (stats.parts || 0) + 1;
    void K;
    return c;
  }
  // The first time a chest leaves the ground: it counts, a lift in the ESCAPE calm is a HEIST if it gets home, and the vault's guards are called.
  function firstLift(c) {
    if (c.lifted) return;
    c.lifted = true;
    stats.lifted++;
    if (state.course && state.course.escape) c.heist = true;
    const v = vaultOf(c);
    if (v && !v.alarm) { v.alarm = true; v.guardT = T().GUARDS.ARRIVE; }
  }
  // A man lets go of what he carries (ATTACK, or the carry broke): the other hand, if any, keeps it; else it is set down where he stands.
  function release(c, p, why) {
    const i = c.by.indexOf(p.id);
    if (i >= 0) c.by.splice(i, 1);
    if (p.carry === 'chest') p.carry = null;
    if (!c.by.length && c.state === 'carried') { settle(c, p.x, p.y, p.on && p.on.deck); stats.dropped++; if (why) pop(state, c.x, c.y - 160, why, c.color, 1); }
  }
  // It lies on the ground again at x, y; over an edge it is gone. On a wreck's deck (G5) it lies on the deck and drifts with it.
  function settle(c, x, y, deck) {
    c.state = 'ground';
    c.by = [];
    c.prog = 0;
    c.onDeck = null;
    const dk = deck || c.deck;
    if (dk && dk.derelict && S.decks.includes(dk) && x >= dk.x0 - 30 && x <= dk.x1 + 30 && Math.abs(y - dk.y) < 260) {
      c.onDeck = dk;
      c.x = Math.max(dk.x0 + 20, Math.min(dk.x1 - 20, x));
      c.y = dk.y;
      c.lx = c.x - (dk.x0 + dk.x1) / 2;
      return true;
    }
    for (const up of [140, 40, 280]) {
      const g = host.groundAt(x, y - up);
      if (g != null) { c.x = x; c.y = g; return true; }
    }
    c.state = 'gone';
    stats.lost++;
    return false;
  }
  // ATTACK on the ground: shove a guard within reach, else put a chest down. True when it did something.
  function attack(p) {
    const K = T().GUARDS, o = p.on;
    if (!S.tre.on || !o || o.mode !== 'walk') return false;
    let g = null, bd = K.SHOVE;
    if (!config.AWAY.DUEL.ENABLED) for (const q of S.tre.guards) { const d = Math.abs(q.x - p.x); if (q.state !== 'gone' && d <= bd) { g = q; bd = d; } } // (A4: with the sword fights a guard is fought in duel.js, not shoved)
    if (g) {
      if ((o.shoveCd || 0) > 0) return true;
      o.shoveCd = K.SHOVE_CD;
      const dir = Math.sign(g.x - p.x) || 1;
      g.x += dir * K.PUSH;
      g.state = 'stun';
      g.t = K.STUN;
      g.shoved++;
      stats.shoves++;
      p.face = dir;
      p.swingT = performance.now();
      pop(state, g.x, g.y - 150, 'whack', '#ffffff', 1);
      host.puff(g.x, g.y - 60, '#c9a875', 6);
      if (g.shoved >= K.GIVE_UP) leaveGuard(g);
      return true;
    }
    const c = chestOf(p, 'carried');
    if (c) { release(c, p, 'DROPPED'); host.phoneFx(p, 'Chest put down.', [30]); return true; }
    return false;
  }
  const shoveReady = (p) => S.tre.on && !config.AWAY.DUEL.ENABLED && !((p.on && p.on.shoveCd) > 0) && S.tre.guards.some((q) => q.state !== 'gone' && Math.abs(q.x - p.x) <= T().GUARDS.SHOVE);
  // The man walks (and climbs) slower with a chest: alone, or in a pair.
  function speedMul(p) {
    const c = p.carry === 'chest' ? chestOf(p, 'carried') : null, K = T();
    return !c ? 1 : c.by.length >= 2 ? K.CARRY.PAIR : c.kind === 'gold' ? K.GOLD.SOLO : K.CARRY.SOLO;
  }
  function climbMul(p) {
    const c = p.carry === 'chest' ? chestOf(p, 'carried') : null, K = T();
    return !c ? 1 : c.by.length >= 2 ? K.CARRY.CLIMB_PAIR : c.kind === 'gold' ? K.GOLD.SOLO : K.CARRY.CLIMB_SOLO;
  }

  // ---------- getting aboard ----------
  // ground.js rejoin: a man comes back aboard. Up the rope with a chest in his arms, he still has it; any other way home (a recall, the walk home) leaves it behind.
  function onAboard(p, o, free) {
    const c = chestOf(p, 'carried');
    if (!c) { if (p.carry === 'chest') p.carry = null; return; }
    if (!free && o && o.mode === 'rope') {
      for (const id of c.by.slice()) { // (the other hand lets go: the chest is the climber's now)
        if (id === p.id) continue;
        const q = state.players[id];
        if (q && q.carry === 'chest') q.carry = null;
      }
      c.by = [p.id];
      c.state = 'aboard';
      stats.aboard++;
      if (c.kind === 'part' && host.partIn) host.partIn(c, p, 'rope'); // (G5: a stripped part is aboard: the wreck's score and the Book)
      if (p.bot || !holdSpot(host.layout())) { p.carry = 'chest'; stowIn(c, p, true); } // (a bot has no Action to press, and a ship with no hold has nowhere to go)
      else host.phoneFx(p, 'Chest aboard! Carry it to the hold and STOW it.', [30, 40, 30]);
    } else {
      release(c, p, null);
      if (p.carry === 'chest') p.carry = null;
    }
  }
  // Called by ground.js walkHome: gone from the ground; what he carried is put down where he was.
  function onGone(p) {
    const c = chestOf(p, 'carried');
    if (c) release(c, p, null);
  }
  // Into the hold. how: a man pressed STOW (cargo.js), or true = it went in by itself.
  function stowIn(c, p, auto) {
    const hold = holdOf(state);
    if (c.state === 'hold') return false;
    hold.list.push(c);
    hold.w += c.w;
    c.state = 'hold';
    c.by = [];
    if (p && p.carry === 'chest') p.carry = null;
    stats.stowed++;
    if (p && !p.bot) host.phoneFx(p, 'Chest stowed (' + hold.list.length + '/' + T().HOLD_CAP + ') - it weighs on the lift until the stop ends', [30]);
    if (!S.tre.stowMoment && p && c.kind !== 'part') { S.tre.stowMoment = true; moment('treasure-stowed', p, { name: 'the outpost', n: hold.list.length }); }
    void auto;
    return true;
  }
  // The STOW button (cargo.js): the chest in this man's arms goes in the hold.
  function stow(p) {
    const c = S.tre.chests.find((q) => q.state === 'aboard' && q.by[0] === p.id);
    if (!c || p.carry !== 'chest') return false;
    if (holdOf(state).list.length >= T().HOLD_CAP) return false;
    return stowIn(c, p, false);
  }
  // Chests in somebody's arms aboard: he still carries it, or somebody put it away for him (a tool swapped in, a knock-out), or he went over the rail.
  function aboardStep() {
    for (const c of S.tre.chests) {
      if (c.state !== 'aboard') continue;
      const p = state.players[c.by[0]];
      if (p && p.carry === 'chest' && p.connected !== false && !p.fall && !(p.ko > 0)) continue;
      if (p && p.fall) { c.state = 'gone'; stats.lost++; if (p.carry === 'chest') p.carry = null; pop(state, p.x, p.y - 100, 'OVERBOARD!', '#9fe8ff', 1); continue; }
      stowIn(c, p, true);
    }
  }

  // ---------- the hookshot ----------
  // A chest lying on the ground within R of (wx, wy) for the hook to catch (null: none, or the hold is full).
  function hookable(wx, wy) {
    const t = S.tre, K = T().HOOK;
    if (!t.on || holdOf(state).list.length >= T().HOLD_CAP) return null;
    let best = null, bd = Infinity;
    for (const c of t.chests) {
      if (c.state !== 'ground') continue;
      const d = Math.hypot(wx - c.x, wy - (c.y - 24));
      if (d < K.R && d < bd) { best = c; bd = d; }
    }
    return best;
  }
  const live = (c) => S.tre.chests.includes(c) && c.state === 'hauled';
  function hauling(c, p) { c.state = 'hauled'; c.haul = p.id; c.prog = 0; if (!c.lifters.includes(p.id)) c.lifters.push(p.id); firstLift(c); }
  // It has come up to the man's hand: into the hold.
  function hooked(c, p) {
    c.haul = null;
    stats.hooked++;
    if (!stowIn(c, p, true)) return;
    if (c.kind === 'part' && host.partIn) host.partIn(c, p, 'hook'); // (G5)
    pop(state, c.x, c.y - 60, 'HOOKED!', c.color, 1.1);
    host.phoneFx(p, 'Hooked a chest - it is in the hold!', [30, 30, 30]);
  }

  // ---------- the guards ----------
  function spawnGuards(v) {
    const K = T().GUARDS, t = S.tre, R = S.rope;
    const danger = (state.course && state.course.danger) || 2;
    const n = K.N + (danger >= K.N_DANGER ? 1 : 0);
    const side = Math.sign(v.x - R.x) || 1; // (they come from the far side: the carrier walks away from them, toward the ship)
    v.guards = true;
    for (let i = 0; i < n; i++) {
      let x = v.x + side * (K.SPAWN + i * 70), y = null;
      for (let k = 0; k < 6 && y == null; k++) { y = host.groundAt(x, v.y - 900); if (y == null || Math.abs(y - v.y) > 700) { y = null; x -= side * 90; } }
      if (y == null) { x = v.x + side * 200; y = v.y; }
      t.guards.push({ id: t.nextId++, vault: v.k, x, y, face: -side, state: 'come', t: 0, idle: 0, shoved: 0, tgt: null, aim: null });
      stats.guards++;
    }
    say('GUARDS! A SQUAD IS COMING TO THE VAULT OF OUTPOST ' + (v.k + 1) + ' - WATCH THE MAN WITH THE CHEST', 3.5);
  }
  function leaveGuard(g) { g.state = 'gone'; stats.left++; }
  function guardStep(g, men, dt) {
    const K = T().GUARDS;
    if (g.state === 'gone' || g.state === 'duel') return; // (A4: a guard whose man came close fights with his sword: duel.js has him)
    if (g.state === 'stun') { if ((g.t -= dt) <= 0) g.state = 'come'; return; }
    let tgt = null, bd = Infinity;
    for (const p of men) { const d = Math.abs(p.x - g.x); if (d < bd && Math.abs(p.y - g.y) < K.HEIGHT * 6) { tgt = p; bd = d; } }
    if (!tgt) { // nobody carries: wait, then go home
      g.tgt = null;
      g.idle += dt;
      if (g.idle >= K.LEAVE) leaveGuard(g);
      return;
    }
    g.idle = 0;
    g.tgt = tgt.id;
    g.face = Math.sign(tgt.x - g.x) || g.face;
    const walk = () => {
      const nx = g.x + g.face * K.SPEED * dt, gy = host.groundAt(nx, g.y - 60);
      if (gy != null && Math.abs(gy - g.y) <= config.AWAY.STEP) { g.x = nx; g.y = gy; }
    };
    if (g.state === 'come') {
      if (bd > K.RANGE * 0.8) walk(); else { g.state = 'aim'; g.t = K.AIM; S.tre.stats.tells++; pop(state, g.x, g.y - 230, '!', '#ff4d4d', 1.4); state.sfxQ && state.sfxQ.push(['horn']); }
    } else if (g.state === 'aim') {
      g.aim = { x: tgt.x, y: tgt.y - 70 };
      if (bd > K.RANGE * 1.25) { g.state = 'come'; g.aim = null; return; }
      if ((g.t -= dt) <= 0) fire(g, tgt, bd);
    } else if (g.state === 'rest') {
      if (bd > K.RANGE) walk();
      if ((g.t -= dt) <= 0) { g.state = 'aim'; g.t = K.AIM; }
    }
  }
  function fire(g, p, dist) {
    const K = T().GUARDS, t = S.tre;
    stats.shots++;
    const moving = !!p.moving || Math.abs(p.jx || 0) > 0.15;
    const hit = rng() < (moving ? K.HIT_MOVING : K.HIT_STILL);
    t.shots.push({ x0: g.x + g.face * 24, y0: g.y - 70, x1: p.x, y1: p.y - 70, t: 0.3, hit });
    state.sfxQ && state.sfxQ.push(['hit']);
    g.state = 'rest';
    g.t = Math.max(0.2, K.EVERY - K.AIM);
    g.aim = null;
    if (!hit) { host.puff(p.x + (rng() - 0.5) * 120, p.y - 20, '#c9a875', 4); return; }
    stats.hits++;
    const r = hurt(p, K.HEARTS, { cause: 'soldier' });
    if (!r) return;
    host.phoneFx(p, 'A guard hit you!', [120, 50, 120]);
    if (r === 'ko') {
      knockOut(p, config.RAIDERS.KO_TIME, { keepCarry: false });
      stats.kos++;
      pop(state, p.x, p.y - 150, 'raider', '#ffd23f', 1.3);
      say(upper(p) + ' WAS SHOT DOWN BY THE VAULT GUARDS - THE CHEST IS DROPPED', 3);
    } else pop(state, p.x, p.y - 150, 'hurt', '#e63946', 0.9);
  }

  // ---------- each step (ground.js update) ----------
  function update(dt) {
    const t = S.tre, K = T(), map = mapNow();
    aboardStep();
    t.on = !!(K.ENABLED && S.on && (t.vaults.length || t.keep) && map);
    if (!t.on) { // (too few crew, the stop over: the guards stand down)
      for (const g of t.guards) if (g.state !== 'gone') g.state = 'gone';
      t.shots.length = 0;
      return;
    }
    t.clock += dt;
    for (const v of t.vaults) if (v.state === 'shut' && map.outposts[v.k].done) openVault(v);
    // the chests
    for (const c of t.chests) {
      if (c.state === 'ground' || c.state === 'carried') { if (!c.worked && c.prog > 0) c.prog = Math.max(0, c.prog - dt * K.DECAY); c.worked = false; }
      if (c.state === 'ground' && c.onDeck) { // (G5: lying on a wreck's deck: it drifts with it; the wreck gone, it is gone)
        const dk = c.onDeck;
        if (!S.decks.includes(dk)) { c.state = 'gone'; stats.lost++; continue; }
        c.x = (dk.x0 + dk.x1) / 2 + c.lx;
        c.y = dk.y;
      }
      if (c.state === 'carried') {
        const men = c.by.map((id) => state.players[id]).filter((p) => p && p.on && p.on.away && (p.on.mode === 'walk' || p.on.mode === 'rope') && p.carry === 'chest' && !(p.ko > 0) && p.connected !== false);
        for (const id of c.by.slice()) { // (anybody who is not carrying any more: knocked out, gone airborne, a tool in his hands)
          const p = state.players[id];
          if (!men.includes(p)) { const i = c.by.indexOf(id); c.by.splice(i, 1); if (p && p.carry === 'chest') p.carry = null; }
        }
        if (!men.length) { settle(c, c.x, c.y); stats.dropped++; pop(state, c.x, c.y - 160, 'DROPPED', c.color, 1); continue; }
        if (men.length === 2 && Math.abs(men[0].x - men[1].x) > K.CARRY.TOGETHER) { const q = men[1]; c.by.splice(c.by.indexOf(q.id), 1); q.carry = null; host.phoneFx(q, 'Too far apart - you let go.', [30]); men.pop(); }
        c.x = men.reduce((s, p) => s + p.x, 0) / men.length;
        c.y = men.reduce((s, p) => s + p.y, 0) / men.length;
        c.mode = men.every((p) => p.on.mode === 'walk') ? 'walk' : 'rope';
      } else if (c.state === 'hauled') { // (on a hookshot's line; if the line is gone it falls back)
        const hp = state.players[c.haul];
        if (!(hp && hp.hook && hp.hook.item === c)) { c.haul = null; settle(c, c.x, c.y + 60); }
      }
    }
    // the guards
    for (const v of t.vaults) {
      if (v.alarm && !v.guards && (v.guardT -= dt) <= 0) spawnGuards(v);
    }
    const men = host.onGround().filter((p) => (p.on.mode === 'walk' || p.on.mode === 'rope') && p.carry === 'chest' && !(p.ko > 0) && host.mine(p));
    for (const g of t.guards) guardStep(g, men, dt);
    for (const s of t.shots) s.t -= dt;
    t.shots = t.shots.filter((s) => s.t > 0);
    for (const p of host.onGround()) if (p.on.shoveCd > 0) p.on.shoveCd = Math.max(0, p.on.shoveCd - dt);
    // the ESCAPE calm: the clock is on, and the chests still down there are the heist
    if (state.course && state.course.escape && !t.note && open().length) {
      t.note = true;
      say('HEIST! ' + open().length + (open().length === 1 ? ' CHEST IS' : ' CHESTS ARE') + ' STILL DOWN THERE - GET THEM ABOARD BEFORE THE SHIP LEAVES', 4);
    }
  }

  // ---------- paying (simulation.js stopDone and startDock, through ground.js payTreasure) ----------
  // Every chest in the hold, and any in a man's arms aboard, is paid and gone. Returns the salvage.
  function pay() {
    const t = S.tre, K = T();
    for (const c of t.chests) if (c.state === 'aboard') stowIn(c, state.players[c.by[0]], true);
    const hold = state.chestHold;
    if (!hold || !hold.list.length) return 0;
    const list = hold.list.splice(0);
    hold.w = 0;
    let total = 0, heist = 0, parts = 0;
    const who = [];
    for (const c of list) {
      total += c.pay;
      if (c.kind === 'part') { parts++; if (host.partPaid) host.partPaid(c); continue; } // (G5: a stripped part is a named card at the dock, derelicts.js)
      if (c.heist) { heist++; total += K.HEIST.BONUS; for (const id of c.lifters) if (state.players[id] && !who.includes(state.players[id])) who.push(state.players[id]); }
    }
    stats.paid += total;
    const deps = host.deps(), chests = list.length - parts;
    if (deps.treasure) deps.treasure(total, parts && !chests ? 'Stripped! ' + parts + (parts === 1 ? ' part' : ' parts') : heist ? 'HEIST! ' + chests + (chests === 1 ? ' chest' : ' chests') + ' got away!' : 'Treasure! ' + chests + (chests === 1 ? ' chest' : ' chests') + (parts ? ' and ' + parts + (parts === 1 ? ' part' : ' parts') : ''));
    if (heist) { stats.heists += heist; moment('treasure-heist', who, { name: 'the outpost', n: heist }); }
    return total;
  }

  // ---------- the phone ----------
  function ui(p) {
    const t = S.tre;
    if (!t.on || !p.on || p.on.mode !== 'walk') return null;
    if (t.guards.some((g) => g.state !== 'gone' && g.tgt === p.id)) return { hint: 'GUARDS! They shoot at a man with a chest. Keep moving, ATTACK shoves them back, or put it down.', verb: 'CARRY' };
    const mine = chestOf(p, 'carried');
    if (mine) return { hint: (mine.by.length > 1 ? 'You carry it together. ' : 'The ' + (mine.kind === 'part' ? 'part' : 'chest') + ' is HEAVY - a second hand makes it faster. ') + 'Walk it to the rope ladder and climb. ATTACK puts it down.', verb: 'CARRY' };
    const c = chestFor(p);
    if (c) return { hint: c.state === 'carried' ? 'HOLD the big button to take the other handle - two carry faster.' : 'HOLD the big button: grab the ' + (c.kind === 'gold' ? 'gold' : c.kind === 'part' ? 'part' : 'chest') + '.', verb: 'GRAB' };
    if (target(p)) return { hint: 'Treasure! A vault lies open (' + META.chest.label + ' on the TV). Grab a chest and carry it to the rope ladder.', verb: 'GRAB' };
    return null;
  }
  // The nearest chest on the ground for a man to go to.
  function target(p) {
    let best = null, bd = T().SEEK;
    for (const c of S.tre.chests) { if (c.state !== 'ground') continue; const d = Math.abs(c.x - p.x); if (d < bd) { best = c; bd = d; } }
    return best;
  }
  // The job on an away man's phone (jobs.js): the arrow to a chest, or to the rope with one in his arms.
  function job(p, f) {
    const t = S.tre;
    if (!t.on || !p.on || p.on.mode !== 'walk' || p.ko > 0) return null;
    let tx, label, kind;
    if (carrying(p)) { tx = S.rope.x; label = 'CARRY THE ' + (chestOf(p, 'carried') && chestOf(p, 'carried').kind === 'part' ? 'PART' : 'CHEST') + ' TO THE ROPE LADDER'; kind = 'carry'; }
    else {
      const c = target(p);
      if (!c) return null;
      tx = c.x;
      label = META[c.kind].act;
      kind = 'chest';
    }
    const dx = tx - p.x, near = Math.abs(dx) < T().REACH * 0.8;
    return { kind, label, dir: near ? null : dx * f > 0 ? 'right' : 'left', color: '#ffd23f', verb: kind === 'carry' ? 'CARRY' : 'GRAB', away: true };
  }

  // ---------- the bots (ground.js botDrive and tripWanted; tools only: AWAY.BOT_TRIPS) ----------
  // Can the walk from x0 to x1 be done on foot (a step up or down of at most one cell at a time)?
  function walkable(x0, x1) {
    const dir = Math.sign(x1 - x0) || 1;
    let x = x0, y = host.groundAt(x0, (S.rope.ground != null ? S.rope.ground : 0) - 80);
    if (y == null) return false;
    for (let n = 0; n < 400 && (x - x1) * dir < 0; n++) {
      x += dir * 30;
      const gy = host.groundAt(x, y - config.AWAY.STEP - 20);
      if (gy == null || gy - y > config.AWAY.DROP || y - gy > config.AWAY.STEP) return false;
      y = gy;
    }
    return true;
  }
  // The chest a bot would fetch: the nearest one on the ground within BOT.RANGE of the rope, with a way on foot.
  function tripChest() {
    const t = S.tre, B = T().BOT, R = S.rope;
    if (!t.on || R.ground == null) return null;
    let best = null, bd = Infinity;
    for (const c of t.chests) {
      if (c.state !== 'ground') continue;
      const d = Math.abs(c.x - R.x);
      if (d < B.RANGE && d < bd) { best = c; bd = d; }
    }
    return best && walkable(R.x, best.x) ? best : null;
  }
  // Where a tripping bot goes and whether it holds: { x, fire, done }. done = he has it (or there is nothing left): he goes home.
  function botGoal(p) {
    if (carrying(p)) return { x: p.x, fire: false, done: true };
    let best = null, bd = Infinity;
    for (const c of S.tre.chests) { if (c.state !== 'ground') continue; const d = Math.abs(c.x - p.x); if (d < bd) { best = c; bd = d; } }
    if (!best || bd > T().BOT.RANGE * 1.4) return { x: p.x, fire: false, done: true };
    return { x: best.x, fire: Math.abs(p.x - best.x) < T().REACH * 0.5, done: false };
  }
  // The bot helm hovers over an open vault (tools only, for BOT.VAULT_CALL s): { x, y (where the rope's top should be), name } or null.
  function vaultCall() {
    const t = S.tre, B = T().BOT;
    if (!config.AWAY.BOT_TRIPS || !t.on) return null;
    const v = t.vaults.find((q) => q.state === 'open' && t.clock - q.openAt < B.VAULT_CALL && t.chests.some((c) => c.vault === q.k && (c.state === 'ground' || c.state === 'carried')));
    if (!v) return null;
    const cs = t.chests.filter((c) => c.vault === v.k && (c.state === 'ground' || c.state === 'carried'));
    const x = cs.reduce((s, c) => s + c.x, 0) / cs.length;
    return { id: 'vault', name: 'TREASURE', x, y: v.y - config.AWAY.LADDER.HOVER, gx: x, gy: v.y, flare: false, bot: false };
  }

  return { trips: () => { stats.trips++; }, begin, reset, update, act, attack, shoveReady, speedMul, climbMul, onAboard, onGone, stow, pay, ui, job, target, hookable, hauling, hooked, live, tripChest, botGoal, vaultCall, carrying, chestOf, open, give, META };
}
