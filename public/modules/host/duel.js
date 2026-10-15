// THE SWORD FIGHT (CASTLE.md package A4, config.AWAY.DUEL): a crewman on the ground fights the soldiers that come for him. ground.js builds this next to the objectives, the treasure and the wrecks and calls it from its own step;
// it plays only while the away team exists (3 or more crew). With DUEL.ENABLED false (NO_DUEL=1 in a tool) nothing here runs and A1 / A2's shove-to-escape is the game; no random number is ever drawn (a hash picks a bot's skill).
//
//   THE MAN      ATTACK = a sword swing: SWING.WIND s of wind-up, then one hit on the nearest soldier in front. The second button (JUMP, relabelled BLOCK on the phone) raises a guard for BLOCK.GUARD s: a blow that lands on it does nothing,
//                and one that lands within BLOCK.PARRY s of the press is a PARRY - the soldier is thrown back and staggered. Both buttons turn him to the nearest soldier.
//   THE SOLDIER  a FOE: runs at his man, stands off, waits, raises his sword (the TELL: a "!", the phone buzzes and flashes), strikes whoever is in front of him within reach, is open for a moment, goes again. FOE.HP hits put him down;
//                he lies for FOE.DOWN s and runs off for good. A parried soldier is staggered and takes COUNTER more; a hit from behind (he faces another crewman) takes FLANK.BONUS more.
//   WHERE FROM   a hunting plaza squad (objectives.js: engage / reinforce / the squad's phase 'duel'), a vault guard whose man comes within GUARD.MELEE (treasure.js: his rifle is put down, the sword drawn).
//   FRIENDS      a crewman out cold on the ground is revived by a friend who holds Action beside him (as aboard); or he wakes by himself: the usual KO rules.
//   SHIPS        a shell bursting at a fighter takes SHELL.HP hits and staggers him (shell), a bomb kills him (blast): garrison.js asks.
//
// State: state.away.duel = { on, foes: [{ id, src squad | guard, q, g, x, y, face, hp, st run | ready | draw | tell | recover | stagger | down | flee | home | gone, t, tgt, ... }], fx, tally, stats }; a man's own timers are p.on.dl { wind, cd, guard, age, gcd }.
import { config } from '../../config.js';
import { pop } from './popups.js';
import { hurt, knockOut, revived } from './health.js';

const DU = () => config.AWAY.DUEL;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const sgn = (v) => (v < 0 ? -1 : 1);
const ALIVE = ['run', 'ready', 'draw', 'tell', 'recover', 'stagger']; // (the states of a soldier who can be hit and who fights)

export function createDuel({ state, S, host, tre }) {
  const stats = { engaged: 0, foes: 0, swings: 0, hits: 0, whiffs: 0, tells: 0, strikes: 0, blocks: 0, parries: 0, staggers: 0, kos: 0, flanks: 0, counters: 0, hurt: 0, glances: 0, mankos: 0, fled: 0, rejoined: 0, guards: 0, cues: 0, nows: 0, bombed: 0, shelled: 0, revives: 0, breaks: 0 }; // (the tools' tally: it runs on over every map of a run)
  const ring = () => state.course && state.course.ring;
  const sfx = (...a) => state.sfxQ && state.sfxQ.push(a);
  const say = (text, hold = 3) => state.say && state.say('objective', text, null, hold);
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who ? (Array.isArray(who) ? who : [who]) : [], where: null, data });
  const upper = (p) => String(p.name || 'CREW').toUpperCase();
  const placeName = () => (ring() ? ring().name : 'the outpost');
  const fresh = () => {
    const D = { on: false, clock: 0, foes: [], fx: [], nextId: 1, tally: {}, stats };
    D.shell = shell; // (garrison.js hooks: a shell / a bomb that meets a fighter)
    D.blast = blast;
    return D;
  };
  S.duel = fresh();
  const reset = () => { S.duel = fresh(); };

  // ---------- who and where ----------
  const men = () => host.onGround().filter((m) => m.on.mode === 'walk');
  const fighting = (m) => m.on && m.on.away && m.on.mode === 'walk' && !(m.ko > 0);
  const alive = (F) => ALIVE.includes(F.st);
  const rec = (m) => (m.on.dl ||= { wind: 0, cd: 0, guard: 0, age: 0, gcd: 0 });
  const tally = (m) => (S.duel.tally[m.id] ||= { kos: 0, parries: 0, told: false });
  // The nearest soldier who can be fought within `range` px of a man (sideways) and DY px of his height.
  function nearestFoe(m, range) {
    const K = DU();
    let best = null, bd = Infinity;
    for (const F of S.duel.foes) {
      if (!alive(F)) continue;
      const d = Math.abs(F.x - m.x);
      if (d <= range && Math.abs(F.y - m.y) <= K.DY && d < bd) { best = F; bd = d; }
    }
    return best;
  }
  // Is this man in a fight: a soldier near him, or one that has him as its man?
  const engaged = (m) => !!S.duel.on && fighting(m) && (!!nearestFoe(m, DU().AIM) || S.duel.foes.some((F) => alive(F) && F.tgt === m.id));

  // ---------- making soldiers ----------
  function newFoe(src, o) {
    const K = DU().FOE, F = { id: S.duel.nextId++, src, q: null, g: null, x: o.x, y: o.y, face: o.face || 1, hp: K.HP, max: K.HP, st: o.st || 'run', t: o.t || 0, tmax: 0, tgt: o.tgt, side: 0, off: 0, swings: 0, hitT: 0, by: [], nowSent: false, born: S.duel.clock, ...o.extra };
    S.duel.foes.push(F);
    stats.foes++;
    return F;
  }
  const foesOf = (q) => S.duel.foes.filter((F) => F.q === q && F.st !== 'gone');
  const liveOf = (q) => S.duel.foes.filter((F) => F.q === q && alive(F));
  // A hunting squad reaches its man (objectives.js hunt): the first soldiers leave the block.
  function engage(f, q, p) {
    const h = q.hunt;
    h.age = 0;
    h.cool = 0;
    h.downs = 0;
    stats.engaged++;
    reinforce(f, q, h, 0);
  }
  // The soldiers a squad has in the fight: SQUAD.FIRST, one more for each other crewman near its man, one more every REINFORCE s, at most MAX; sent from the block one at a time.
  function reinforce(f, q, h, dt) {
    const K = DU(), SQ = K.SQUAD;
    h.age += dt;
    h.cool = Math.max(0, h.cool - dt);
    const p = leadOf(q);
    if (!p) return;
    const team = men().filter((m) => m !== p && m.ko <= 0 && Math.abs(m.x - p.x) <= SQ.TEAM).length;
    const want = Math.min(SQ.MAX + team, SQ.FIRST + team + Math.floor(h.age / SQ.REINFORCE));
    if (liveOf(q).length >= want || q.n <= 0 || h.cool > 0) return;
    q.n -= 1;
    h.cool = SQ.SPAWN_GAP;
    const k = foesOf(q).length;
    newFoe('squad', { x: q.x + (k % 2 ? 1 : -1) * 20 * k, y: q.y, face: sgn(p.x - q.x), tgt: p.id, extra: { q } });
  }
  // The man a squad's soldiers are fighting: the nearest crewman within AGGRO of any of them (null: nobody).
  function leadOf(q) {
    const K = DU();
    let best = null, bd = Infinity;
    for (const m of men()) {
      if (m.ko > 0) continue;
      for (const F of S.duel.foes) {
        if (F.q !== q || !alive(F)) continue;
        const d = Math.abs(m.x - F.x);
        if (d <= K.FOE.AGGRO && Math.abs(m.y - F.y) <= K.DY && d < bd) { best = m; bd = d; }
      }
    }
    if (best) return best;
    const h = q.hunt;
    const p = h && state.players[h.id];
    return p && fighting(p) && Math.abs(p.x - q.x) <= K.FOE.AGGRO ? p : null; // (before the first soldier has left the block, or while the last one is on the way)
  }
  // Every soldier of the squad goes home (the hunt is over): they rejoin the block when they get there.
  function recall(q) { for (const F of foesOf(q)) if (alive(F)) { F.st = 'home'; F.tgt = null; } }

  // A vault guard whose man comes close draws his sword.
  function adoptGuards(list) {
    if (!tre || !S.tre || !S.tre.on) return;
    const K = DU();
    for (const g of S.tre.guards) {
      if (g.state === 'gone' || g.state === 'duel') continue;
      const m = list.find((q) => q.ko <= 0 && Math.abs(q.x - g.x) <= K.GUARD.MELEE && Math.abs(q.y - g.y) <= K.DY);
      if (!m) continue;
      g.state = 'duel';
      g.aim = null;
      g.tgt = m.id;
      stats.guards++;
      const F = newFoe('guard', { x: g.x, y: g.y, face: sgn(m.x - g.x), st: 'draw', t: K.FOE.DRAW, tgt: m.id, extra: { g } });
      pop(state, g.x, g.y - 230, '!', '#ff4d4d', 1.2);
      void F;
    }
  }

  // ---------- the soldier's step ----------
  function stepFoe(F, dt, list) {
    const K = DU(), FO = K.FOE;
    F.hitT = Math.max(0, F.hitT - dt);
    // the source is gone or has changed its mind
    if (F.src === 'squad') {
      const q = F.q;
      if (q.state === 'dead' || q.state === 'surrender') { F.st = 'gone'; return; }
      if ((!q.hunt || q.hunt.phase === 'back') && alive(F)) { F.st = 'home'; F.tgt = null; }
    } else {
      const g = F.g;
      if (g.state === 'gone') { F.st = 'gone'; return; }
      g.x = F.x;
      g.y = F.y;
      g.face = F.face;
    }
    const groundY = (x) => { const gy = host.groundAt(x, F.y - 60); return gy != null && Math.abs(gy - F.y) <= config.AWAY.STEP ? gy : null; };
    const walk = (to, speed) => {
      const nx = F.x + clamp(to - F.x, -speed * dt, speed * dt), gy = groundY(nx);
      if (gy != null) { F.x = nx; F.y = gy; }
    };
    if (F.st === 'down') {
      if ((F.t -= dt) <= 0) { F.st = 'flee'; F.t = FO.FLEE; F.fleeDir = F.face ? -F.face : 1; stats.fled++; }
      return;
    }
    if (F.st === 'flee') {
      walk(F.x + F.fleeDir * 400, FO.FLEE_SPEED);
      if ((F.t -= dt) <= 0) {
        F.st = 'gone';
        if (F.src === 'guard') F.g.state = 'gone';
      }
      return;
    }
    if (F.st === 'home') {
      if (F.src === 'guard') { F.st = 'gone'; F.g.state = 'rest'; F.g.t = 1; F.g.tgt = null; return; }
      const q = F.q, to = q.state === 'flee' ? q.fleeTo : q.home;
      F.face = sgn(to - F.x);
      walk(to, FO.SPEED);
      if (Math.abs(F.x - to) <= 24) { F.st = 'gone'; q.n += 1; stats.rejoined++; }
      return;
    }
    if (F.st === 'stagger') {
      if ((F.t -= dt) <= 0) { F.st = 'ready'; F.t = FO.READY; }
      return;
    }
    // his man: the one he has while he is still in reach and on his feet, else the nearest crewman who is
    let t = F.tgt != null ? state.players[F.tgt] : null;
    if (!t || !fighting(t) || Math.abs(t.x - F.x) > FO.AGGRO || Math.abs(t.y - F.y) > K.DY) {
      t = null;
      let bd = Infinity;
      for (const m of list) { const d = Math.abs(m.x - F.x); if (m.ko <= 0 && d <= FO.AGGRO && Math.abs(m.y - F.y) <= K.DY && d < bd) { t = m; bd = d; } }
      F.tgt = t ? t.id : null;
      F.side = 0;
      if (F.src === 'guard' && !t) { F.lone = (F.lone || 0) + dt; if (F.lone >= FO.LOSE) { F.st = 'gone'; F.g.state = 'rest'; F.g.t = 1; F.g.tgt = null; } return; }
    }
    if (!t) {
      if (F.src === 'squad') { F.st = 'home'; }
      return;
    }
    F.lone = 0;
    if (F.st !== 'tell') F.face = sgn(t.x - F.x);
    if (!F.side) assignSide(F, t);
    const dist = Math.abs(t.x - F.x);
    if (F.st === 'run') {
      walk(t.x + F.side * (FO.ENGAGE + F.off), FO.SPEED);
      if (Math.abs(t.x - F.x) <= FO.ENGAGE + F.off + 8) { F.st = 'ready'; F.t = FO.READY; }
    } else if (F.st === 'ready' || F.st === 'draw') {
      if (dist > FO.REACH + FO.SLACK) { F.st = 'run'; return; }
      if ((F.t -= dt) > 0) return;
      if (S.duel.foes.some((o) => o !== F && o.tgt === F.tgt && o.st === 'tell' && o.tmax - o.t < FO.GAP)) { F.t = 0.15; return; } // (two blows on one man never start together)
      startTell(F, t);
    } else if (F.st === 'recover') {
      if ((F.t -= dt) <= 0) { F.st = dist > FO.REACH + FO.SLACK ? 'run' : 'ready'; F.t = FO.READY; }
    } else if (F.st === 'tell') {
      F.t -= dt;
      if (!F.nowSent && F.t <= K.BLOCK.PARRY + K.CUE.LEAD) {
        F.nowSent = true;
        const m = state.players[F.tgt];
        if (m && !m.bot) { host.phoneFx(m, null, K.CUE.NOW, undefined, { now: 1 }); stats.nows++; }
      }
      if (F.t <= 0) strike(F, list);
    }
  }
  // The side of his man a soldier takes: the emptier one (the first from the way he came), a little farther out for each already there.
  function assignSide(F, t) {
    let l = 0, r = 0;
    for (const o of S.duel.foes) if (o !== F && o.tgt === F.tgt && alive(o) && o.side) { if (o.side < 0) l++; else r++; }
    F.side = l === r ? sgn(F.x - t.x) : l < r ? -1 : 1;
    F.off = (F.side < 0 ? l : r) * DU().FOE.OFFSET;
  }
  function startTell(F, t) {
    const FO = DU().FOE;
    F.st = 'tell';
    F.t = F.tmax = FO.TELL;
    F.nowSent = false;
    F.swings++;
    stats.tells++;
    pop(state, F.x, F.y - 240, '!', '#ff4d4d', 1.4);
    if (!t.bot) { host.phoneFx(t, null, DU().CUE.BUZZ, undefined, { cue: FO.TELL }); stats.cues++; }
  }
  // The blow comes down on whoever is in front of him within reach.
  function strike(F, list) {
    const K = DU(), FO = K.FOE;
    stats.strikes++;
    F.st = 'recover';
    F.t = FO.RECOVER;
    sfx('swing');
    const targets = list.filter((m) => m.ko <= 0 && Math.sign(m.x - F.x || F.face) === F.face && Math.abs(m.x - F.x) <= FO.REACH + FO.SLACK && Math.abs(m.y - F.y) <= K.DY);
    if (!targets.length) { stats.whiffs++; host.puff(F.x + F.face * 50, F.y - 60, '#ddd', 4); return; }
    for (const m of targets) {
      const dl = rec(m);
      if (m.koGrace > 0) { stats.glances++; host.puff(m.x, m.y - 60, '#ddd', 4); continue; }
      if (dl.guard > 0 && Math.sign(F.x - m.x || 1) === (m.face || 1)) {
        if (dl.age <= K.BLOCK.PARRY) parry(F, m, dl); else block(F, m, dl);
        continue;
      }
      woundMan(F, m);
    }
  }
  function block(F, m, dl) {
    dl.guard = 0;
    dl.gcd = DU().BLOCK.CD;
    stats.blocks++;
    pop(state, m.x + (m.face || 1) * 50, m.y - 150, 'BLOCK', '#9fdcff', 1);
    addFx('spark', m.x + (m.face || 1) * 46, m.y - 70, m.face || 1);
    sfx('clang', false);
    if (!m.bot) host.phoneFx(m, null, [25]);
  }
  function parry(F, m, dl) {
    const K = DU();
    dl.guard = 0;
    dl.gcd = 0;
    stats.parries++;
    stats.staggers++;
    F.st = 'stagger';
    F.t = K.FOE.STAGGER;
    F.x -= F.face * K.FOE.KNOCK;
    pop(state, m.x + (m.face || 1) * 50, m.y - 160, 'PARRY!', '#ffd23f', 1.5);
    addFx('spark', m.x + (m.face || 1) * 46, m.y - 70, m.face || 1, 'big');
    sfx('clang', true);
    if (!m.bot) host.phoneFx(m, null, [30, 30, 60]);
    const T = tally(m);
    if (++T.parries === K.MOMENTS.PARRY_AT) moment('duel-parry', m, { name: placeName(), n: T.parries });
  }
  function woundMan(F, m) {
    const K = DU(), FO = K.FOE;
    const r = hurt(m, FO.HEARTS, { cause: 'soldier', iframes: FO.IFRAMES });
    if (!r) { stats.glances++; host.puff(m.x, m.y - 60, '#ddd', 4); return; }
    stats.hurt++;
    addFx('slash', F.x + F.face * 40, F.y - 80, F.face);
    sfx('hit', false);
    if (r !== 'ko') return;
    knockOut(m, config.RAIDERS.KO_TIME, { keepCarry: false });
    stats.mankos++;
    if (S.obj && S.obj.stats) { S.obj.stats.kos++; S.obj.stats.strikes++; } // (A1's tally: a soldier who knocked a man out)
    pop(state, m.x, m.y - 150, 'raider', '#ffd23f', 1.3);
    host.phoneFx(m, 'A soldier knocked you out!', [120, 50, 120]);
    say(upper(m) + (F.src === 'guard' ? ' WAS CUT DOWN BY A VAULT GUARD!' : ' WAS KNOCKED OUT BY THE GARRISON!'), 3);
    moment('away-ko', m, { name: placeName() });
  }

  // ---------- the man's blows ----------
  function addFx(k, x, y, face, size) {
    const D = S.duel;
    if (D.fx.length > 24) D.fx.shift();
    D.fx.push({ k, x, y, face, size: size || '', t: 0, life: k === 'ko' ? 1.2 : 0.35 });
  }
  const turn = (m, F) => { if (F) m.face = sgn(F.x - m.x); };
  // ATTACK on the ground: a swing, when a soldier is near enough to fight (true: the press is the duel's). Carrying a chest, ATTACK still only puts it down (treasure.js).
  function attack(m) {
    const K = DU();
    if (!S.duel.on || !fighting(m) || m.carry === 'chest') return false;
    const F = nearestFoe(m, K.AIM);
    if (!F) return false;
    const dl = rec(m);
    if (dl.wind > 0 || dl.cd > 0) return true; // (too soon: the press is spent)
    turn(m, F);
    dl.wind = K.SWING.WIND;
    dl.cd = K.SWING.CD;
    dl.guard = 0;
    m.swingT = performance.now();
    stats.swings++;
    return true;
  }
  // BLOCK (the second button): the guard goes up for GUARD s, facing the soldier who is about to strike (else the nearest).
  function block_(m) {
    const K = DU();
    if (!S.duel.on || !fighting(m) || !engaged(m)) return false;
    const dl = rec(m);
    if (dl.wind > 0 || dl.guard > 0 || dl.gcd > 0) return true;
    let F = null;
    for (const o of S.duel.foes) if (o.st === 'tell' && o.tgt === m.id && (!F || o.t < F.t)) F = o;
    turn(m, F || nearestFoe(m, K.AIM));
    dl.guard = K.BLOCK.GUARD;
    dl.age = 0;
    return true;
  }
  // The swing lands: the nearest soldier in front within reach.
  function resolveSwing(m) {
    const K = DU(), SW = K.SWING;
    const face = m.face || 1;
    let best = null, bd = Infinity;
    for (const F of S.duel.foes) {
      if (!alive(F)) continue;
      const d = Math.abs(F.x - m.x);
      if (d <= SW.REACH && Math.abs(F.y - m.y) <= K.DY && Math.sign(F.x - m.x || face) === face && d < bd) { best = F; bd = d; }
    }
    addFx('arc', m.x + face * 50, m.y - 90, face);
    if (!best) { stats.whiffs++; return; }
    const F = best;
    let dmg = SW.DMG;
    const counter = F.st === 'stagger';
    const other = F.tgt != null && F.tgt !== m.id ? state.players[F.tgt] : null;
    const flank = !!other && fighting(other) && F.st !== 'down' && Math.sign(m.x - F.x || 1) !== F.face;
    if (counter) { dmg += K.COUNTER; stats.counters++; }
    if (flank) { dmg += K.FLANK.BONUS; stats.flanks++; }
    F.hp -= dmg;
    F.hitT = 0.3;
    if (!F.by.includes(m.id)) F.by.push(m.id);
    stats.hits++;
    addFx('hit', F.x, F.y - 80, face);
    sfx('hit', false);
    pop(state, F.x, F.y - 160, flank ? 'FLANK!' : counter ? 'COUNTER!' : 'whack', flank ? '#ffd23f' : counter ? '#ffb347' : '#ffffff', flank || counter ? 1.4 : 1);
    host.puff(F.x, F.y - 60, '#c9a875', 5);
    if (F.hp > 0) return;
    // down
    F.hp = 0;
    F.st = 'down';
    F.t = K.FOE.DOWN;
    stats.kos++;
    addFx('ko', F.x, F.y - 20, face);
    pop(state, F.x, F.y - 130, 'raider', '#ffd23f', 1.2);
    if (F.q && F.q.hunt) F.q.hunt.downs = (F.q.hunt.downs || 0) + 1;
    const T = tally(m);
    T.kos++;
    if (T.kos === K.MOMENTS.DISARM_AT || T.kos === K.MOMENTS.DISARM_AT * 2) moment('duel-disarmed', m, { name: placeName(), n: T.kos });
    const mates = F.by.map((id) => state.players[id]).filter((q) => q && q !== m);
    if (mates.length && !S.duel.tally.flankMoment) { S.duel.tally.flankMoment = true; moment('duel-flank', [m, ...mates], { name: placeName() }); }
  }

  // ---------- friends ----------
  // A friend out cold within `reach` px on the same ground as this man (null: none).
  function koFriend(m, reach) {
    let best = null, bd = reach;
    for (const q of host.onGround()) {
      if (q === m || !(q.ko > 0) || q.on.mode !== 'walk' || q.on.deck !== m.on.deck) continue;
      const d = Math.abs(q.x - m.x);
      if (d <= bd && Math.abs(q.y - m.y) <= DU().DY) { best = q; bd = d; }
    }
    return best;
  }
  // The Action button beside a friend who is out cold (ground.js step): hold it to bring him round, as aboard.
  function reviveAct(m, dt, ctl) {
    const K = DU();
    if (!K.ENABLED || !S.duel.on || !fighting(m)) return null;
    const q = koFriend(m, K.REVIVE.REACH);
    if (!q) return null;
    const time = config.TOOLS.REVIVE_TIME;
    const a = { type: 'revive', obj: q, hold: true, time, label: 'Revive ' + q.name };
    if (m.fire && ctl.holdOk(m)) {
      q.rworked = true;
      q.prog = (q.prog || 0) + dt / time;
      if (q.prog >= 1) {
        q.prog = 0;
        q.ko = 0;
        revived(q);
        stats.revives++;
        host.stat && host.stat(m, 'revives');
        host.puff(q.x, q.y - 50, '#8fe388', 10);
        pop(state, q.x, q.y - 160, 'heal', '#8fe388', 1.1);
        if (!m.bot) host.phoneFx(m, 'You brought ' + q.name + ' round!', [30, 40, 30]);
        if (!q.bot) host.phoneFx(q, m.name + ' got you up!', [30, 40, 30]);
        if (!S.duel.tally.rescue) { S.duel.tally.rescue = true; moment('duel-rescue', m, { name: placeName() }); }
      }
    }
    return a;
  }

  // ---------- ships (garrison.js asks) ----------
  // A shell bursting at a fighter: hits off him and a stagger. True when it was used up.
  function shell(s) {
    const K = DU();
    if (!S.duel.on) return false;
    for (const F of S.duel.foes) {
      if (!alive(F) || Math.abs(s.x - F.x) > K.SHELL.R || s.y < F.y - 140 || s.y > F.y + 40) continue;
      F.hp -= K.SHELL.HP;
      F.hitT = 0.3;
      stats.shelled++;
      host.puff(s.x, s.y, '#c9a875', 6);
      if (F.hp <= 0) { F.hp = 0; F.st = 'down'; F.t = K.FOE.DOWN; stats.kos++; if (F.q && F.q.hunt) F.q.hunt.downs = (F.q.hunt.downs || 0) + 1; addFx('ko', F.x, F.y - 20, F.face); pop(state, F.x, F.y - 130, 'raider', '#ffd23f', 1.2); } else { F.st = 'stagger'; F.t = K.FOE.STAGGER; stats.staggers++; }
      return true;
    }
    return false;
  }
  // A bomb going off at (b.x, b.y): every fighter within `radius` is killed. Returns how many.
  function blast(b, radius) {
    let n = 0;
    for (const F of S.duel.foes) {
      if (F.st === 'gone' || Math.hypot(b.x - F.x, b.y - (F.y - 40)) > radius) continue;
      F.st = 'gone';
      if (F.g) F.g.state = 'gone';
      n++;
      host.puff(F.x, F.y - 40, '#c9a875', 8);
      pop(state, F.x, F.y - 110, 'kill', '#ffd23f', 0.9);
    }
    stats.bombed += n;
    return n;
  }

  // ---------- each step (ground.js update) ----------
  function update(dt) {
    const D = S.duel, K = DU();
    D.on = !!(K.ENABLED && S.on);
    if (!D.on) { // (too few crew, the stop over: the soldiers stand down; a guard goes back to his rifle)
      for (const F of D.foes) { if (F.g && F.g.state === 'duel') F.g.state = 'rest'; if (F.q && F.st !== 'gone') F.q.n += F.st === 'down' || F.st === 'flee' ? 0 : 1; }
      D.foes.length = 0;
      D.fx.length = 0;
      return;
    }
    D.clock += dt;
    const list = men();
    for (const m of list) stepMan(m, dt);
    for (const q of host.onGround()) if (q.ko > 0 && q.prog > 0 && !q.rworked) q.prog = Math.max(0, q.prog - dt * 0.4); // (a revive nobody is holding runs back)
    for (const q of host.onGround()) q.rworked = false;
    adoptGuards(list);
    for (const F of D.foes) stepFoe(F, dt, list);
    for (const F of D.foes) if (F.st === 'gone' && F.src === 'squad' && F.q.n <= 0 && !D.foes.some((o) => o.q === F.q && o.st !== 'gone' && o !== F) && F.q.state !== 'dead' && F.q.state !== 'surrender') F.q.state = 'dead'; // (the last man of a squad has run off: it is no more)
    D.foes = D.foes.filter((F) => F.st !== 'gone');
    for (const fx of D.fx) fx.t += dt;
    D.fx = D.fx.filter((fx) => fx.t < fx.life);
  }
  function stepMan(m, dt) {
    const dl = rec(m);
    dl.cd = Math.max(0, dl.cd - dt);
    dl.gcd = Math.max(0, dl.gcd - dt);
    if (m.ko > 0) { dl.wind = 0; dl.guard = 0; return; }
    if (dl.wind > 0 && (dl.wind -= dt) <= 0) { dl.wind = 0; resolveSwing(m); }
    if (dl.guard > 0) {
      dl.age += dt;
      if ((dl.guard -= dt) <= 0) { dl.guard = 0; dl.gcd = DU().BLOCK.CD; }
    }
  }

  // ---------- the phone ----------
  function ui(m) {
    if (!S.duel.on || !m.on || m.on.mode !== 'walk') return null;
    if (engaged(m)) return { hint: 'SWORD FIGHT! ATTACK swings. BLOCK as the sword falls: a late BLOCK parries!', verb: 'FIGHT', duel: 1 };
    const q = koFriend(m, DU().REVIVE.REACH);
    if (q) return { hint: 'HOLD the big button to REVIVE ' + q.name + '.', verb: 'HELP' };
    return null;
  }
  // The arrow to a friend who is out cold on the ground (objectiveJob).
  function job(m, f) {
    if (!S.duel.on || !fighting(m)) return null;
    const q = koFriend(m, DU().AIM * 6);
    if (!q) return null;
    const dx = q.x - m.x, near = Math.abs(dx) < DU().REVIVE.REACH * 0.8;
    return { kind: 'revive', label: 'REVIVE ' + upper(q), dir: near ? null : dx * f > 0 ? 'right' : 'left', color: '#8fe388', verb: 'HELP', away: true };
  }

  // ---------- the bots (tools: a bot on a trip fights what comes) ----------
  // A bot with a soldier near: stands and fights - walks into reach, swings, and presses BLOCK for the soldier's blow (the roll for each blow is a hash: PARRY of them are timed to parry, BLOCK of them to at least block).
  // True = he is in a fight and the walk of his trip waits.
  function botFight(m) {
    const K = DU();
    if (!K.ENABLED || !S.duel.on || !fighting(m)) return false;
    const near = nearestFoe(m, K.AIM);
    const mine = S.duel.foes.filter((F) => alive(F) && F.tgt === m.id);
    if (!near && !mine.length) return false;
    const dl = rec(m);
    m.jx = 0;
    if (near) {
      const d = Math.abs(near.x - m.x);
      if (d > K.SWING.REACH - 15 && d < K.AIM) m.jx = sgn(near.x - m.x);
      m.face = sgn(near.x - m.x);
    }
    let guardDue = false;
    for (const F of mine) {
      if (F.st !== 'tell') continue;
      const roll = hash(m.id + '|' + F.id + '|' + F.swings + '|' + K.BOT.SALT);
      const press = roll < K.BOT.PARRY ? F.t <= 0.15 : roll < K.BOT.BLOCK ? F.t <= K.BLOCK.GUARD - 0.1 : false;
      if (roll < K.BOT.BLOCK && F.t < 0.75) guardDue = true;
      if (press && F.t > 0.02 && dl.guard <= 0 && dl.gcd <= 0 && dl.bp !== F.id + '|' + F.swings) { dl.bp = F.id + '|' + F.swings; m.jumpQ = true; }
    }
    if (K.BOT.SWING && near && !guardDue && Math.abs(near.x - m.x) <= K.SWING.REACH - 10 && dl.cd <= 0 && dl.guard <= 0) m.atkQ = true;
    return true;
  }

  return { update, reset, engage, reinforce, recall, leadOf, foesOf, liveOf, attack, block: block_, engaged, ui, job, reviveAct, botFight, koFriend, shell, blast, stats, nearestFoe, alive };
}
