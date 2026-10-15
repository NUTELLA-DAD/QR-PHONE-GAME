// THE CASTLE OBJECTIVES (CASTLE.md package A1, config.AWAY.OBJECTIVES): jobs for the away team on the ground of a ring face. ground.js builds this with the ground and calls it from its own step; it plays only while the away team
// exists (3 or more crew, a ring map, the crown not fallen) - otherwise nothing here runs, no random number is drawn, and the game is exactly A0's.
//
//   WINCH     (gatehouse)        hold CRANK: the face's shutter stays open twice as long from then on (f.winch, ring.js) and its archer posts are silent for a while (garrison.hush)
//   CHARGE    (tower base)       carry a powder crate (a crate or ammo from the ship, or grab one at the KEG on the plaza), hold PLANT: a fuse, then ring.blast on the core (open) or the keep's pool (shut)
//   BALLISTA  (its tower base)   hold SABOTAGE: the ballista is silent for the stop (sp.silent, garrison.js)
//   BEACON    (plaza end)        hold LIGHT: the revolving guns pause (t.hush, course.js) and a supply balloon comes (deps.supply)
//   CAGE      (plaza)            hold FREE: PRISONERS walk to the rope ladder and climb it; each who is aboard is salvage and a Book moment
//   BANNER    (plaza)            hold STEAL, carry the great banner up the rope ladder: that face's soldiers flee (garrison.rout), salvage, a trophy part card (deps.trophy)
//   SOLDIERS                     a plaza squad notices a man on the ground, shouts and points ("!"), runs at him, winds up and strikes him out cold; a shove, a shell, a bomb or just running away saves him
//
// State: state.away.obj = { on, list: [{ id, kind, face, x, y, state: ready | fuse | taken | done, prog, ... }], prisoners, banner, stats }. Everything is deterministic (a hash of the stop, the face and the kind picks what is offered).
import { config } from '../../config.js';
import { pop } from './popups.js';
import { hurt, knockOut } from './health.js';

const OB = () => config.AWAY.OBJECTIVES;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h / 4294967296; };

// What each kind says: the TV marker's short label, the phone's verb (roleCards.js), the button's words.
export const META = {
  winch: { label: 'WINCH', verb: 'CRANK', act: 'CRANK THE GATE WINCH!', color: '#8fe388' },
  charge: { label: 'CHARGE', verb: 'PLANT', act: 'PLANT THE CHARGE!', color: '#ff7b3a' },
  keg: { label: 'KEG', verb: 'PLANT', act: 'GRAB THE POWDER KEG', color: '#c9a05f' },
  ballista: { label: 'BALLISTA', verb: 'SABOTAGE', act: 'SABOTAGE THE BALLISTA!', color: '#ffb347' },
  beacon: { label: 'BEACON', verb: 'LIGHT', act: 'LIGHT THE BEACON!', color: '#ffd23f' },
  cage: { label: 'PRISONERS', verb: 'FREE', act: 'FREE THE PRISONERS!', color: '#9fdcff' },
  banner: { label: 'BANNER', verb: 'STEAL', act: 'STEAL THE GREAT BANNER!', color: '#ff5a3c' },
};
const POWDER = (c) => c === 'crate' || c === 'ammo';

export function createObjectives({ state, S, host }) {
  const ring = () => state.course && state.course.ring;
  const gar = () => state.ringSys && state.ringSys.garrison;
  const say = (text, hold = 3.5) => state.say && state.say('objective', text, null, hold);
  const moment = (kind, who, data) => state.moment && state.moment(kind, { who: who ? [who] : [], where: null, data });
  const upper = (p) => String(p.name || 'CREW').toUpperCase();
  const stats = { offered: 0, winch: 0, charge: 0, boom: 0, ballista: 0, beacon: 0, cage: 0, freed: 0, aboard: 0, banner: 0, delivered: 0, noticed: 0, strikes: 0, misses: 0, kos: 0, shoves: 0, saves: 0, dropped: 0 }; // (the tools' tally: it runs on over every castle of a run; offered = this castle's)
  const fresh = () => ({ on: false, list: [], prisoners: [], banner: null, nextId: 1, stats });
  S.obj = fresh();

  // ---------- a new ground ----------
  // Which objectives a face offers: every kind that fits it, ranked by a hash of (stop, face, kind) plus a penalty for kinds the castle already offers, the best PER_FACE of them.
  function begin(map) {
    const o = (S.obj = fresh());
    const r = ring(), K = OB();
    if (!K.ENABLED || !config.AWAY.ENABLED || !map || !map.ring || !r) return; // (NO_AWAY=1: no ground, no objectives)
    const stop = String((state.course.stop && state.course.stop.id) || state.course.lap || 0) + '|' + r.variant;
    const used = {};
    for (const f of r.faces) {
      const mf = map.ring.faces[f.i];
      const fits = [];
      if (mf.walk) fits.push('winch');
      if ((mf.posts || []).length && (mf.plazas || []).length) fits.push('charge');
      if (f.special.kind === 'ballista') fits.push('ballista');
      if ((mf.plazas || []).length) fits.push('beacon', 'cage', 'banner');
      const kinds = K.FORCE ? K.FORCE.filter((k) => fits.includes(k)) : fits.map((k) => ({ k, s: hash(stop + '|' + f.i + '|' + k) + (used[k] || 0) * K.SPREAD })).sort((a, b) => a.s - b.s).slice(0, K.PER_FACE).map((e) => e.k);
      const placed = [];
      let plazaSide = f.i % 2 ? 1 : -1; // (the first plaza job takes this side of the face, the second the other if the face has it)
      const hasSide = (s) => (mf.plazas || []).some((pz) => ((pz.x0 + pz.x1) / 2 < f.x ? -1 : 1) === s);
      const fit = (x, side) => { // a spot at least GAP from the others on this face: pushed outward, else inward
        for (const dir of [side, -side]) {
          let v = x;
          for (let n = 0; n < 8; n++) { if (!placed.some((q) => Math.abs(q - v) < K.GAP) && Math.abs(v - f.x) <= K.EDGE) return v; v += dir * K.GAP; }
        }
        return x;
      };
      const add = (kind, x, extra = {}) => {
        const ob = { id: kind + f.i, name: kind + f.i, kind, face: f.i, x, y: f.y, x0: x, state: 'ready', prog: 0, worked: false, label: META[kind].label, color: META[kind].color, ...extra };
        o.list.push(ob);
        placed.push(x);
        return ob;
      };
      for (const kind of kinds) {
        used[kind] = (used[kind] || 0) + 1;
        if (kind === 'winch') { add('winch', fit(f.x + K.AT.winch, 1)); continue; }
        if (kind === 'ballista') { add('ballista', f.special.x); continue; }
        if (!hasSide(plazaSide)) plazaSide = -plazaSide;
        const s = plazaSide;
        if (kind === 'charge') {
          const post = (mf.posts || []).slice().sort((a, b) => Math.abs(a.x - (f.x + s * K.AT.charge)) - Math.abs(b.x - (f.x + s * K.AT.charge)))[0];
          const ob = add('charge', fit(post.x, s));
          const keg = add('keg', fit(f.x + s * K.AT.keg, s), { of: ob.id, sub: true });
          ob.keg = keg.id;
        } else add(kind, fit(f.x + s * K.AT[kind], s));
        plazaSide = -plazaSide;
      }
    }
    o.stats.offered = o.list.filter((q) => !q.sub).length;
  }
  function reset() { S.obj = fresh(); }

  // ---------- who and where ----------
  const byId = (id) => S.obj.list.find((q) => q.id === id);
  const faceOf = (ob) => ring() && ring().faces[ob.face];
  // Offered while the castle stands; the winch, the charge and the ballista are about a gate, so they go with it - the beacon, the cage and the banner are worth doing after the gate has fallen too.
  const STAYS = ['beacon', 'cage', 'banner'];
  const live = (ob) => { const f = faceOf(ob); return !!f && (!f.down || STAYS.includes(ob.kind)) && !(ring() && ring().crown); };
  // The objective a man on the plaza can work now: close enough, offered, and (for the charge) not already burning.
  const nearOf = (p) => {
    const o = S.obj, K = OB();
    let best = null, bd = Infinity;
    for (const ob of o.list) {
      if (ob.state !== 'ready' || !live(ob)) continue;
      const d = Math.abs(p.x - ob.x);
      if (d > K.REACH || Math.abs(p.y - ob.y) > K.HEIGHT || d >= bd) continue;
      if (ob.kind === 'ballista' && (faceOf(ob).special.dead || faceOf(ob).special.silent)) continue;
      best = ob;
      bd = d;
    }
    return best;
  };
  const hunted = (p) => ring() && ring().faces.some((f) => (f.squads || []).some((q) => q.hunt && q.hunt.id === p.id));
  const carrying = (p) => !!(S.obj.banner && S.obj.banner.carrier === p.id);

  // ---------- working an objective (ground.js step: the Action button) ----------
  // The act for the man standing at an objective (or null: the flare). Holding Action (p.fire, an ok hold) fills the objective's bar; when it is full the objective is done.
  function act(p, dt, ctl) {
    const o = S.obj, K = OB();
    if (!o.on) return null;
    const ob = nearOf(p);
    if (!ob) return null;
    const M = META[ob.kind];
    let time = K[ob.kind.toUpperCase()] && K[ob.kind.toUpperCase()].TIME;
    if (ob.kind === 'keg') {
      if (POWDER(p.carry)) return null; // (he has a crate already; whatever else is in his hands is dropped for the keg)
      time = K.CHARGE.KEG_TIME;
    } else if (ob.kind === 'charge' && !POWDER(p.carry)) return { type: 'need', label: 'PLANT: bring a powder crate (the KEG)' };
    const a = { type: ob.kind === 'keg' ? 'grab' : ob.kind, obj: ob, hold: true, time, label: M.act };
    if (p.fire && ctl.holdOk(p)) {
      ob.worked = true;
      ob.by = p.id;
      ob.prog += dt / time;
      if (ob.prog >= 1) { ob.prog = 0; done(ob, p); }
    }
    return a;
  }

  // The objective is done.
  function done(ob, p) {
    const o = S.obj, r = ring(), f = faceOf(ob), K = OB(), who = p;
    if (ob.kind === 'keg') {
      p.carry = 'crate';
      pop(state, ob.x, ob.y - 140, 'POWDER!', '#c9a05f', 1);
      host.phoneFx(p, 'You have a powder crate. Carry it to the tower and hold PLANT.', [30, 40, 30]);
      return;
    }
    if (ob.kind === 'winch') {
      ob.state = 'done';
      f.winch = true;
      if (f.open > 0) f.open += config.RING.CORE.OPEN_FOR * (K.WINCH.MUL - 1);
      if (gar()) gar().hush(f, K.WINCH.SILENCE);
      o.stats.winch++;
      say('GATE ' + (f.i + 1) + ' WINCH CRANKED! ITS GATE STAYS OPEN TWICE AS LONG - ARCHERS SILENCED');
      pop(state, ob.x, ob.y - 220, 'CRANK!', META.winch.color, 1.3);
      moment('away-winch', who, { name: r.name });
    } else if (ob.kind === 'charge') {
      ob.state = 'fuse';
      ob.t = K.CHARGE.FUSE;
      ob.planter = p.id;
      p.carry = null;
      o.stats.charge++;
      say('CHARGE SET AT TOWER ' + (f.i + 1) + '! ' + K.CHARGE.FUSE + ' s - GET CLEAR!', 3.5);
      pop(state, ob.x, ob.y - 160, 'CHARGE SET!', '#ff5a1f', 1.4);
      state.sfxQ && state.sfxQ.push(['charge']);
    } else if (ob.kind === 'ballista') {
      ob.state = 'done';
      f.special.silent = true;
      if (gar()) gar().silence(f);
      o.stats.ballista++;
      say('THE BALLISTA OF GATE ' + (f.i + 1) + ' IS JAMMED FOR THE STOP!');
      pop(state, ob.x, ob.y - 260, 'JAMMED!', META.ballista.color, 1.3);
      moment('away-ballista', who, { name: r.name });
    } else if (ob.kind === 'beacon') {
      ob.state = 'done';
      let guns = 0;
      for (const t of state.course.turrets) if (t.rev && !t.dead) { t.hush = K.BEACON.PAUSE; guns++; }
      r.beacon = K.BEACON.PAUSE;
      const sup = host.deps().supply ? host.deps().supply() : false;
      o.stats.beacon++;
      say('BEACON LIT! ' + (guns ? 'THE REVOLVING GUNS PAUSE' : '') + (guns && sup ? ' AND ' : '') + (sup ? 'A SUPPLY BALLOON IS COMING' : ''), 4);
      pop(state, ob.x, ob.y - 200, 'LIT!', META.beacon.color, 1.3);
      moment('away-beacon', who, { name: r.name });
    } else if (ob.kind === 'cage') {
      ob.state = 'done';
      for (let k = 0; k < K.CAGE.MEN; k++) o.prisoners.push({ id: o.nextId++, face: ob.face, x: ob.x + (k - (K.CAGE.MEN - 1) / 2) * 34, y: ob.y, state: 'walk', s: 0, by: p.id });
      o.stats.cage++;
      o.stats.freed += K.CAGE.MEN;
      say('THE CAGE IS OPEN! ' + K.CAGE.MEN + ' PRISONERS HEAD FOR THE ROPE LADDER', 4);
      pop(state, ob.x, ob.y - 180, 'FREE!', META.cage.color, 1.3);
    } else if (ob.kind === 'banner') {
      ob.state = 'taken';
      o.banner = { carrier: p.id, ob: ob.id, face: ob.face };
      o.stats.banner++;
      say(upper(p) + ' HAS THE GREAT BANNER OF GATE ' + (f.i + 1) + '! GET IT BACK ABOARD', 4);
      pop(state, ob.x, ob.y - 220, 'STOLEN!', META.banner.color, 1.3);
      host.phoneFx(p, 'You have the great banner! Carry it to the rope ladder and climb.', [30, 40, 30]);
    }
  }

  // ---------- the charge ----------
  function boom(ob) {
    const o = S.obj, K = OB().CHARGE, f = faceOf(ob), r = ring();
    ob.state = 'done';
    o.stats.boom++;
    const planter = state.players[ob.planter] || null;
    for (let k = 0; k < 6; k++) host.puff(ob.x + (k - 2.5) * 40, ob.y - 40 - (k % 3) * 60, k % 2 ? '#ff5a1f' : '#555', 22);
    pop(state, ob.x, ob.y - 220, 'bigHit', '#ffd23f', 1.8);
    state.sfxQ && state.sfxQ.push(['impact']);
    state.ship.shake = Math.max(state.ship.shake, 0.4);
    for (const p of host.onGround()) { // (a man too near the tower is knocked out cold)
      if (p.on.mode !== 'walk' || p.ko > 0 || Math.abs(p.x - ob.x) > K.BLAST_R || Math.abs(p.y - ob.y) > OB().HEIGHT * 2.5) continue;
      if (hurt(p, config.HEALTH.BIG, { big: true, cause: 'bomb', old: true }) === 'ko') knockOut(p, config.RAIDERS.KO_TIME, { keepCarry: false });
      host.phoneFx(p, 'You were too close to the charge!', [120, 50, 120]);
    }
    if (f && !f.down && state.ringSys) {
      const was = f.hp, wasOpen = f.open > 0;
      for (let k = 0; k < K.BOMBS; k++) state.ringSys.blast({ x: f.core.x, y: f.core.y, owner: ob.planter });
      say('THE CHARGE AT TOWER ' + (f.i + 1) + ' WENT OFF! ' + (f.down ? 'THE GATE IS BREACHED!' : wasOpen ? 'THE CORE TOOK ' + Math.round(was - f.hp) + ' POINTS' : 'THE KEEP IS CRACKING'), 3.5);
      moment('away-charge', planter, { name: r.name });
    } else say('THE CHARGE WENT OFF - TOO LATE, THE GATE IS DOWN', 3);
  }

  // ---------- prisoners ----------
  const climbers = () => S.obj.prisoners.filter((q) => q.state === 'climb').length;
  function prisoners(dt) {
    const o = S.obj, K = OB().CAGE, R = S.rope;
    for (const pr of o.prisoners) {
      if (pr.state === 'aboard') continue;
      if (pr.state === 'climb') {
        if (!R.out) { pr.state = 'wait'; pr.y = R.ground != null ? R.ground : pr.y; continue; }
        pr.s = clamp(pr.s - K.CLIMB * dt, 0, R.len);
        pr.x = R.x;
        pr.y = R.y + pr.s;
        if (pr.s <= 0) {
          pr.state = 'aboard';
          o.stats.aboard++;
          host.deps().salvage && host.deps().salvage(K.SALVAGE, 'Prisoner freed!');
          pop(state, R.x, R.y - 60, 'FREED!', META.cage.color, 1.1);
          const who = state.players[pr.by];
          if (!o.prisonMoment) { o.prisonMoment = true; moment('away-prisoners', who, { name: ring().name, n: K.MEN }); }
        }
        continue;
      }
      const dx = R.x - pr.x;
      if (Math.abs(dx) > 14) {
        const nx = pr.x + Math.sign(dx) * K.WALK * dt, gy = host.groundAt(nx, pr.y - 60);
        if (gy != null && Math.abs(gy - pr.y) <= config.AWAY.STEP) { pr.x = nx; pr.y = gy; pr.state = 'walk'; } else pr.state = 'wait';
      } else {
        pr.state = 'wait';
        if (R.out && R.len > 0 && R.ground != null && R.ground - (R.y + R.len) < config.AWAY.LADDER.GRAB_Y + 60) { pr.state = 'climb'; pr.s = R.len; pr.x = R.x; }
      }
    }
  }
  // Where the helm should come: the prisoners still on the ground (the pickup markers, ground.js).
  function pickups() {
    const o = S.obj, out = [];
    const left = o.prisoners.filter((q) => q.state !== 'aboard');
    if (!o.on || !left.length) return out;
    const R = S.rope, pr = left.reduce((b, q) => (Math.abs(q.x - R.x) < Math.abs(b.x - R.x) ? q : b));
    out.push({ id: 'prisoners', name: 'PRISONERS', x: pr.x, y: pr.y - config.AWAY.LADDER.HOVER, gx: pr.x, gy: pr.y, flare: false, bot: false, prisoners: left.length });
    return out;
  }

  // ---------- the banner ----------
  function drop(b, x, why) {
    const o = S.obj, ob = byId(b.ob);
    o.banner = null;
    o.stats.dropped++;
    if (!ob) return;
    ob.state = 'ready';
    ob.prog = 0;
    if (x != null) { ob.x = x; const gy = host.groundAt(x, ob.y - 80); if (gy != null) ob.y = gy; } else { ob.x = ob.x0; }
    say('THE GREAT BANNER IS DROPPED' + (why ? ' (' + why + ')' : '') + ' - PICK IT UP AGAIN', 3);
  }
  // Called by ground.js rejoin: a man comes back aboard. The banner he carries is the castle's loss.
  function onAboard(p, o, free) {
    const b = S.obj.banner;
    if (!b || b.carrier !== p.id) return;
    if (!free && o && o.mode === 'rope') deliver(p);
    else drop(b, null, 'he went home');
  }
  // Called by ground.js walkHome: gone from the ground.
  function onGone(p) {
    const b = S.obj.banner;
    if (b && b.carrier === p.id) drop(b, null, upper(p) + ' WENT HOME');
  }
  function deliver(p) {
    const o = S.obj, b = o.banner, K = OB().BANNER, r = ring();
    const ob = byId(b.ob), f = r && r.faces[b.face];
    o.banner = null;
    if (ob) ob.state = 'done';
    o.stats.delivered++;
    if (f && !f.down) {
      f.routed = true;
      if (gar()) gar().rout(f);
    }
    const got = host.deps().trophy ? host.deps().trophy({ part: K.TROPHY, name: K.NAME, desc: K.DESC, from: 'from the great banner of ' + r.name }) : false;
    host.deps().salvage && host.deps().salvage(got ? K.SALVAGE : K.SALVAGE + K.EXTRA, 'Great banner stolen!');
    say(upper(p) + ' BROUGHT THE GREAT BANNER ABOARD! GATE ' + (b.face + 1) + "'S SOLDIERS FLEE" + (got ? ' - A TROPHY AT THE NEXT DOCK' : ''), 4.5);
    pop(state, p.x, p.y - 200, 'BANNER!', META.banner.color, 1.5);
    moment('away-banner', p, { name: r.name });
  }
  function bannerStep() {
    const o = S.obj, b = o.banner;
    if (!b) return;
    const c = state.players[b.carrier];
    if (!c || c.connected === false) return drop(b, null, 'he left');
    if (c.on && c.on.away) {
      if (c.on.mode === 'home') return drop(b, null, 'he went home');
      if (c.ko > 0) return drop(b, c.x, upper(c) + ' IS DOWN');
      const ob = byId(b.ob);
      if (ob) { ob.x = c.x; ob.y = c.y; }
    } else if (!c.on && !c.fly && !c.fall) drop(b, null, 'lost'); // (aboard some other way than the rope: it does not count)
  }
  // The man who carries the banner walks a little slower.
  const speedMul = (p) => (carrying(p) ? OB().BANNER.SLOW : 1);

  // ---------- soldiers against a crewman ----------
  const walking = (p) => p.on && p.on.away && p.on.mode === 'walk' && !p.on.deck && !(p.ko > 0);
  function soldiers(dt) {
    const r = ring(), SO = OB().SOLDIERS, o = S.obj;
    const men = host.onGround().filter(walking);
    for (const f of r.faces) {
      for (const q of f.squads || []) {
        if (q.kind !== 'plaza') continue;
        if (q.hunt) { hunt(f, q, dt); continue; }
        q.huntCd = Math.max(0, (q.huntCd || 0) - dt);
        if (q.huntCd > 0 || f.down || f.routed || r.crown || (q.state !== 'muster' && q.state !== 'cheer') || q.n <= 0) continue;
        let best = null, bd = Infinity;
        for (const p of men) {
          if (p.koGrace > 0) continue;
          const d = Math.abs(p.x - q.x);
          if (d < SO.NOTICE && Math.abs(p.y - q.y) < SO.DY && d < bd) { best = p; bd = d; }
        }
        if (!best) continue;
        q.hunt = { id: best.id, phase: 'tell', t: SO.TELL, v: SO.SPEED, shoved: 0, misses: 0 };
        q.state = 'cheer';
        q.cheer = 0.6;
        o.stats.noticed++;
        pop(state, q.x, q.y - 230, '!', '#ff4d4d', 1.6);
        state.sfxQ && state.sfxQ.push(['horn']);
        const sword = config.AWAY.DUEL.ENABLED; // (A4: the sword fights)
        say('SOLDIERS SPOT ' + upper(best) + (sword ? '! HE CAN FIGHT, RUN OR CALL A BOMBING' : '! BOMB THE PLAZA OR HE MUST RUN'), 3);
        host.phoneFx(best, sword ? 'SOLDIERS! ATTACK swings your sword. BLOCK as theirs falls. Or run!' : 'SOLDIERS! ATTACK shoves them back - or run!', [80, 40, 80]);
      }
    }
  }
  const toBack = (q) => { q.hunt.phase = 'back'; q.state = 'flee'; q.fleeTo = q.home; };
  function hunt(f, q, dt) {
    const SO = OB().SOLDIERS, h = q.hunt, o = S.obj;
    if (q.state === 'dead') { o.stats.saves++; q.hunt = null; return; }
    if (q.state === 'surrender') { q.hunt = null; return; }
    const p = state.players[h.id];
    if (h.phase === 'back') {
      q.state = 'flee';
      q.fleeTo = q.home;
      if (Math.abs(q.x - q.home) <= 6) { q.hunt = null; q.state = 'muster'; q.x = q.home; q.huntCd = SO.COOLDOWN; }
      return;
    }
    if (h.phase === 'duel') return duelPhase(f, q, h, dt);
    if (!p || !walking(p) || f.down || f.routed || (ring() && ring().crown) || Math.abs(q.x - q.home) > SO.LEASH) return toBack(q);
    const dist = Math.abs(p.x - q.x), dir = Math.sign(p.x - q.x) || 1;
    if (h.phase === 'tell') {
      q.state = 'cheer';
      q.cheer = 0.6;
      if ((h.t -= dt) <= 0) { h.phase = 'run'; q.state = 'flee'; }
    } else if (h.phase === 'run') {
      q.state = 'flee';
      q.fleeTo = p.x - dir * SO.REACH * 0.5;
      if (dist <= SO.REACH && !(p.koGrace > 0)) {
        if (config.AWAY.DUEL.ENABLED && host.duel()) { h.phase = 'duel'; q.state = 'flee'; q.fleeTo = q.home; host.duel().engage(f, q, p); return; } // (A4: the first soldiers leave the block and fight him; the block goes home)
        h.phase = 'wind'; h.t = SO.WIND; q.state = 'cheer'; q.cheer = 0.6; pop(state, q.x, q.y - 230, '!', '#ff4d4d', 1.4);
      }
    } else if (h.phase === 'wind') {
      q.state = 'cheer';
      q.cheer = 0.6;
      if ((h.t -= dt) <= 0) {
        if (dist <= SO.REACH + SO.SLACK && !(p.koGrace > 0) && !(p.ko > 0)) {
          o.stats.strikes++;
          if (hurt(p, config.HEALTH.BIG, { big: true, cause: 'soldier', old: true }) === 'ko') {
            knockOut(p, config.RAIDERS.KO_TIME, { keepCarry: false });
            o.stats.kos++;
            pop(state, p.x, p.y - 150, 'raider', '#ffd23f', 1.3);
            host.phoneFx(p, 'A soldier knocked you out!', [120, 50, 120]);
            say(upper(p) + ' WAS KNOCKED OUT BY THE GARRISON!', 3);
            moment('away-ko', p, { name: ring().name });
          }
          toBack(q);
        } else { // (he moved out of reach: a miss; another run at him, or they give up)
          o.stats.misses++;
          host.puff(q.x + dir * 40, q.y - 50, '#ddd', 4);
          if (++h.misses >= SO.MISSES) toBack(q);
          else { h.phase = 'run'; q.state = 'flee'; }
        }
      }
    } else if (h.phase === 'stun') {
      q.state = 'muster';
      if ((h.t -= dt) <= 0) { h.phase = 'run'; q.state = 'flee'; }
    }
  }
  // A4: the squad's soldiers are fighting (duel.js); the block goes home and sends one more now and then. It gives up the hunt when his man is gone or too far, or SQUAD.BREAK of its soldiers are down.
  function duelPhase(f, q, h, dt) {
    const SO = OB().SOLDIERS, DD = config.AWAY.DUEL, duel = host.duel(), o = S.obj;
    const lead = duel.leadOf(q);
    if (lead) h.id = lead.id;
    q.fleeTo = q.home;
    q.state = Math.abs(q.x - q.home) <= 6 ? 'muster' : 'flee';
    if (q.state === 'muster') q.x = q.home;
    const broke = (h.downs || 0) >= DD.SQUAD.BREAK;
    if (!lead || f.down || f.routed || (ring() && ring().crown) || broke || Math.abs(lead.x - q.home) > SO.LEASH + 300) {
      if (broke && lead) { o.stats.saves++; config.AWAY.DUEL.ENABLED && pop(state, q.x, q.y - 230, 'THE SQUAD BREAKS!', '#ffd23f', 1.4); }
      return toBack(q);
    }
    duel.reinforce(f, q, h, dt);
  }
  // The squad nearest to a man that is hunting (or about to), within SHOVE px: the ATTACK button throws it back.
  function shoveTarget(p) {
    const r = ring(), SO = OB().SOLDIERS;
    if (!S.obj.on || !r) return null;
    let best = null, bd = SO.SHOVE;
    for (const f of r.faces) for (const q of f.squads || []) if (q.hunt && q.hunt.id === p.id && q.hunt.phase !== 'back') { const d = Math.abs(q.x - p.x); if (d <= bd) { best = q; bd = d; } }
    return best;
  }
  // ATTACK: shove the soldiers off. True when it was a shove (the hookshot or anything else keeps its button otherwise).
  function shove(p) {
    const SO = OB().SOLDIERS, o = p.on, q = shoveTarget(p);
    if (config.AWAY.DUEL.ENABLED || !q || !o || (o.shoveCd || 0) > 0) return false; // (A4: with the sword fights ATTACK is a swing, duel.js)
    o.shoveCd = SO.SHOVE_CD;
    const dir = Math.sign(q.x - p.x) || 1, h = q.hunt;
    q.x = clamp(q.x + dir * SO.PUSH, q.home - SO.LEASH, q.home + SO.LEASH);
    h.shoved++;
    S.obj.stats.shoves++;
    p.face = dir;
    p.swingT = performance.now();
    pop(state, q.x, q.y - 150, 'whack', '#ffffff', 1);
    host.puff(q.x, q.y - 60, '#c9a875', 6);
    if (h.shoved >= SO.GIVE_UP) toBack(q);
    else { h.phase = 'stun'; h.t = SO.STUN; q.state = 'muster'; }
    return true;
  }

  // ---------- each step (ground.js update) ----------
  function update(dt) {
    const o = S.obj, r = ring(), K = OB();
    o.on = !!(K.ENABLED && S.on && r && !r.crown && o.list.length);
    if (r && r.beacon > 0) r.beacon = Math.max(0, r.beacon - dt);
    if (!o.on) { // (too few crew, no castle: the soldiers stand down)
      if (r) for (const f of r.faces) for (const q of f.squads || []) if (q.hunt) { q.hunt = null; if (q.state === 'flee' || q.state === 'cheer') q.state = 'muster'; q.x = q.home; }
      return;
    }
    for (const ob of o.list) {
      ob.live = live(ob) || ob.state === 'done'; // (the TV draws it: a done one stays up with its tick)
      if (!ob.worked && ob.prog > 0) ob.prog = Math.max(0, ob.prog - dt * K.DECAY);
      ob.worked = false;
      if (ob.state === 'fuse' && (ob.t -= dt) <= 0) boom(ob);
    }
    for (const p of host.onGround()) if (p.on.shoveCd > 0) p.on.shoveCd = Math.max(0, p.on.shoveCd - dt);
    prisoners(dt);
    bannerStep();
    soldiers(dt);
  }

  // ---------- the phone ----------
  // The words for a man on the ground: { hint, verb } (null: nothing to say; ground.js uses its own hints).
  function ui(p) {
    const o = S.obj;
    if (!o.on || !p.on || p.on.mode !== 'walk') return null;
    if (hunted(p)) return { hint: config.AWAY.DUEL.ENABLED ? 'SOLDIERS! ATTACK swings, BLOCK parries. Or run - you are faster. A bomb saves you.' : 'SOLDIERS! ATTACK shoves them back. Run - you are faster. A bomb on the plaza saves you.', verb: 'RUN' };
    if (carrying(p)) return { hint: 'You carry the GREAT BANNER! Walk to the rope ladder and climb it.', verb: 'STEAL' };
    const ob = nearOf(p);
    if (ob) {
      const M = META[ob.kind];
      const need = ob.kind === 'charge' && !POWDER(p.carry);
      return { hint: need ? 'The charge needs a powder crate: grab the KEG on the plaza, or bring a crate from the ship.' : 'HOLD the big button: ' + M.act.replace(/!$/, '').toLowerCase() + '.', verb: M.verb };
    }
    const j = target(p);
    if (j) return { hint: 'Objective: ' + META[j.kind].act.replace(/!$/, '').toLowerCase() + ' (' + META[j.kind].label + ' on the TV).', verb: META[j.kind].verb };
    return null;
  }
  // The nearest objective for a man to go to (a charge without a crate: the keg first).
  function target(p) {
    const o = S.obj;
    if (!o.on) return null;
    let best = null, bd = OB().SEEK; // (an objective on the far side of the castle, out of the ship's leash, is not worth an arrow)
    for (const ob of o.list) {
      if (ob.state !== 'ready' || !live(ob) || ob.sub) continue;
      if (ob.kind === 'ballista' && (faceOf(ob).special.dead || faceOf(ob).special.silent)) continue;
      const d = Math.abs(ob.x - p.x);
      if (d < bd) { best = ob; bd = d; }
    }
    if (best && best.kind === 'charge' && !POWDER(p.carry)) best = byId(best.keg) || best;
    return best;
  }
  // The job on an away man's phone (jobs.js): the arrow to the nearest objective, or to the rope with the banner.
  function job(p, f) {
    const o = S.obj;
    if (!o.on || !p.on || p.on.mode !== 'walk' || p.ko > 0) return null;
    let tx, label, kind, verb;
    if (carrying(p)) { tx = S.rope.x; label = 'CARRY THE BANNER TO THE ROPE LADDER'; kind = 'steal'; verb = 'STEAL'; }
    else {
      const ob = target(p);
      if (!ob) return null;
      tx = ob.x;
      verb = META[ob.kind].verb;
      kind = verb.toLowerCase();
      label = META[ob.kind].act.replace(/!$/, '');
    }
    const dx = tx - p.x, near = Math.abs(dx) < OB().REACH * 0.6;
    return { kind, label, dir: near ? null : dx * f > 0 ? 'right' : 'left', color: '#ffd23f', verb, away: true };
  }

  // ---------- the bots (ground.js botDrive, tools only: AWAY.BOT_TRIPS) ----------
  // The objective a tripping bot does: the nearest one within BOT.RANGE of the rope's foot (or BOT.KIND), else null (the old trip).
  function pickFor(p) {
    const o = S.obj, K = OB();
    if (!o.on || !K.BOT.DO) return null;
    let best = null, bd = Infinity;
    for (const ob of o.list) {
      if (ob.sub || ob.state !== 'ready' || !live(ob) || (K.BOT.KIND && ob.kind !== K.BOT.KIND)) continue;
      if (ob.kind === 'ballista' && (faceOf(ob).special.dead || faceOf(ob).special.silent)) continue;
      const d = Math.abs(ob.x - S.rope.x);
      if (d < K.BOT.RANGE && d < bd) { best = ob; bd = d; }
    }
    return best ? best.id : null;
  }
  // Where a tripping bot goes and whether it holds: { x, fire, done }. done = the objective is finished (or cannot be done): he goes home.
  function botGoal(p, id) {
    const ob = byId(id), K = OB();
    if (!ob || !live(ob)) return { x: p.x, fire: false, done: true };
    if (ob.kind === 'banner') { if (carrying(p)) return { x: p.x, fire: false, done: true }; if (ob.state !== 'ready') return { x: p.x, fire: false, done: true }; }
    else if (ob.kind === 'charge') {
      if (ob.state !== 'ready') return { x: p.x, fire: false, done: true };
      if (!POWDER(p.carry)) { const keg = byId(ob.keg); return keg ? { x: keg.x, fire: Math.abs(p.x - keg.x) < K.REACH * 0.5, done: false } : { x: p.x, fire: false, done: true }; }
    } else if (ob.state !== 'ready') return { x: p.x, fire: false, done: true };
    return { x: ob.x, fire: Math.abs(p.x - ob.x) < K.REACH * 0.5, done: false };
  }
  // A hunter within shoving reach of this man (the bot shoves it).
  const shoveReady = (p) => !config.AWAY.DUEL.ENABLED && !!shoveTarget(p) && !((p.on && p.on.shoveCd) > 0);

  return { begin, reset, update, act, ui, job, speedMul, shove, shoveReady, onAboard, onGone, pickups, climbers, pickFor, botGoal, target, carrying, hunted, byId, nearOf, META };
}
