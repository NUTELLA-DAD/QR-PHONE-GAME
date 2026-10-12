// Enemy SQUADRONS: the dogfighters of squadrons.js arrive as a squadron with a LEADER, flying in FORMATION (formations.js: V, echelon left / right, line abreast, finger-four, trail),
// and a bomber can bring a pair of fighters over its wings. The squadron's life, one state at a time (sq.mode):
//   form     the leader flies at the ship, the wingmen hold their slots (rigid offsets in his frame: they steer for the slot a moment ahead, match his speed and are eased onto it);
//            when he is within BREAK_RANGE the squadron BREAKS
//   break    pairs peel off for attack runs from different angles (each pair swings out to its own run-in point, then dives in: delay -> peel -> attack -> extend -> rally); a
//            wingman sticks to his pair leader all the way and fires with him
//   regroup  after the pass they form up on the leader out past the ship, then turn for the next pass ("form" again)
//   scatter  the leader went down: the wingmen fly off every which way for a moment, then the best of them takes over as the new leader and they regroup
//   withdraw most of the planes are gone: the rest fly off and are gone for good
// An escort pair (formation 'escort') hangs over its bomber's wings with the BOMBER as the frame (flying in the ship's frame, as she does); shot down she is avenged: the pair becomes a squadron of its own; sent home, they go with her.
// Planes carry squadronId, leader (true on the squadron leader), formation, slot, fx, fy and ace / paint (the radar, the TV's lookout arrows and the 3D view read them); state.squadrons
// lists the squadrons. Nothing here draws or reads the screen; the numbers are config.SQUADRONS. Everything is deterministic in the seeded random numbers (Math.random is the seeded one in the tests).
import { config } from '../../config.js';
import { aimedSide } from './gunsMatter.js';
import { keepClear, inRock, groundAt, ceilAt } from './course.js';
import { crewMul } from './crewscale.js';
import { envIdOf } from './environments.js';
import { angDiff } from './planes.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { FORMATION_SHORT, slotOffsets, slotWorld, formationChoices, pairsOf } from './formations.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const RAD = Math.PI / 180;

export function createSquads({ state, ship, shipMid, nearShip, phoneFx, warn }) {
  const D = config.DOGFIGHT;
  const layout = ship.layout;
  const squads = [];
  state.squadrons = squads; // (published for the radar, the lookout arrows and the view: { id, formation, mode, n0, size, leader, anchor, ace, cx, cy, spread })
  const stats = (state.squadStats = { spawned: 0, planes: 0, breaks: 0, runs: 0, regroups: 0, scatters: 0, newLeaders: 0, withdrawals: 0, escorts: 0, aces: 0, errSum: 0, errN: 0, shots: 0, looseShots: 0, rams: 0, looseRams: 0, rocks: 0, looseRocks: 0, formations: {} });
  let nextId = 1;
  let banner = '';

  const members = (sq) => state.strafers.filter((p) => p.squadronId === sq.id && p.hp > 0 && !p.gone).sort((a, b) => a.slot - b.slot);
  const danger = () => (state.course && state.course.danger) || 2;
  const lap = () => (state.course ? state.course.lap : 1);
  const frameOf = (sq) => (sq.anchor ? sq.frame : sq.leader);
  // The bomber's frame: level (heading 0 or pi by the way she is flying, not her bobbing nose), so the escort's slots hang over her wings and do not swing about when she climbs or dips.
  const anchorFrame = (b) => ({ x: b.x, y: b.y, heading: Math.cos(b.heading) >= 0 ? 0 : Math.PI, vx: b.vx, vy: b.vy });
  const bomberAlive = (b) => !!b && b.hp > 0 && state.bombers.includes(b);
  const bearing = (p) => ((p.x - shipMid().x) * ship.pose.f > 0 ? 'AHEAD' : 'ASTERN');

  // ---- Making a squadron ----
  // How many planes: the old count (the mission, the crew's size and the difficulty already scale it) plus EXTRA, one more on a hard stop; 3 to 6, or a pair for a small crew.
  const sizeNow = () => {
    const SQ = config.SQUADRONS;
    const base = Math.max(1, Math.round(Math.min(D.MAX, D.COUNT + (lap() - 1) * D.PER_LAP) * crewMul(state, 'count')));
    const small = crewMul(state, 'count') < SQ.SMALL_COUNT;
    return clamp(base + SQ.EXTRA + (danger() >= SQ.DANGER_EXTRA_AT ? 1 : 0), small ? SQ.MIN_SMALL : SQ.MIN, SQ.MAX);
  };
  const pickFormation = (n) => {
    const list = formationChoices(n, envIdOf(state), danger());
    let r = Math.random() * list.reduce((a, [, w]) => a + w, 0);
    for (const [f, w] of list) if ((r -= w) < 0) return f;
    return list.length ? list[0][0] : 'vee';
  };
  const hpFor = () => Math.max(1, Math.round(D.HP * crewMul(state, 'hp')));
  const newPlane = (sq, slot, x, y, heading, hp) => ({
    x, y, heading, vx: Math.cos(heading) * D.SPEED, vy: Math.sin(heading) * D.SPEED, air: D.SPEED * config.SQUADRONS.FORM_SPEED, hp, max: hp,
    mode: 'form', modeT: 0, orbit: 0, dir: 1, gunCd: 0, shots: 0, trail: [], bank: 0,
    squadronId: sq.id, slot, leader: slot === 0 && !sq.anchor, formation: sq.formation, fx: 0, fy: 0,
  });
  const reslot = (sq, mem) => {
    const offs = slotOffsets(sq.formation, sq.anchor ? mem.length + 1 : mem.length);
    mem.forEach((p, i) => {
      const k = sq.anchor ? i + 1 : i;
      p.slot = i;
      p.fx = offs[k].fx;
      p.fy = offs[k].fy;
      p.leader = i === 0;
      p.formation = sq.formation;
    });
    sq.leader = mem[0] || null;
  };
  const describe = (sq) => sq.lone ? `ENEMY FIGHTER - BEARING ${sq.leader ? bearing(sq.leader) : 'AHEAD'}` : `SQUADRON: ${sq.n0} FIGHTERS, ${FORMATION_SHORT[sq.formation] || sq.formation}${sq.formation === 'escort' ? '' : ' FORMATION'} - BEARING ${sq.leader ? bearing(sq.leader) : 'AHEAD'}${sq.ace ? ' - ACE LEADER' : ''}`;

  // A squadron that comes in from the side: the leader first, the others in their slots about him.
  // (opt.size 1 and opt.hp: F4 folds the lone big fighter in as a squadron of one - no ace, no formation to speak of, the old fighter's toughness)
  const spawn = (opt = {}) => {
    const SQ = config.SQUADRONS;
    const n = opt.size || sizeNow();
    const formation = pickFormation(n);
    const side0 = aimedSide(state, Math.random() < 0.5 ? -1 : 1, ship.pose.f); // (F4: out on the side of the ship where the guns are, as a world side)
    const mid = shipMid();
    const offs = slotOffsets(formation, n);
    // The side and height to come in from: the first place where the whole squadron (and the stretch just ahead of it) is clear of rock, else the leader is lifted out of the wall.
    const jitter = rand(-150, 150);
    const airOk = (x, y) => !state.course || (groundAt(state.course, x, true, y) > y + 450 && ceilAt(state.course, x, y) < y - 450 && !inRock(state, x, y)); // (room to fly: the planes' own avoidance would pull them up and stall them)
    const clear = (lx, ly, h) => offs.every((o) => { const w = slotWorld({ x: lx, y: ly, heading: h }, o); return [0, 500, 1000, 1500, 2000].every((d) => airOk(w.x + Math.cos(h) * d, w.y + Math.sin(h) * d)); });
    let side = side0;
    let lx = mid.x + side * SQ.SPAWN_DIST;
    let ly = mid.y - 250 + jitter;
    let found = false;
    for (const dy of [0, -450, 450, -900, 900]) {
      for (const sd of [side0, -side0]) {
        if (!found && clear(mid.x + sd * SQ.SPAWN_DIST, mid.y - 250 + jitter + dy, sd > 0 ? Math.PI : 0)) {
          found = true;
          side = sd;
          lx = mid.x + sd * SQ.SPAWN_DIST;
          ly = mid.y - 250 + jitter + dy;
        }
      }
    }
    if (!found) ly = keepClear(state, lx, ly, 200);
    const heading = side > 0 ? Math.PI : 0;
    const sq = { id: nextId++, formation, mode: 'form', t: 0, n0: n, size: n, leader: null, anchor: null, ace: false, paint: null, aim: { dx: rand(-300, 300), dy: rand(-300, -100) }, cx: lx, cy: ly, spread: 0, side, lone: !!opt.lone };
    const frame = { x: lx, y: ly, heading };
    const planes = offs.map((o, i) => {
      const w = slotWorld(frame, o);
      const p = newPlane(sq, i, w.x, i ? keepClear(state, w.x, w.y, 120) : ly, heading, opt.hp || hpFor());
      p.fx = o.fx;
      p.fy = o.fy;
      return p;
    });
    sq.leader = planes[0];
    if (danger() >= SQ.ACE_DANGER && !opt.lone) { // a flying circus ace at the head of the squadron
      const paint = SQ.ACE_PAINTS[(Math.random() * SQ.ACE_PAINTS.length) | 0];
      Object.assign(planes[0], { ace: true, paint: paint.id, body: paint.body, trim: paint.trim, hp: Math.round(planes[0].hp * SQ.ACE_HP), max: Math.round(planes[0].max * SQ.ACE_HP) });
      sq.ace = true;
      stats.aces++;
    }
    state.strafers.push(...planes);
    squads.push(sq);
    stats.spawned++;
    stats.planes += n;
    stats.formations[formation] = (stats.formations[formation] || 0) + 1;
    banner = describe(sq);
    warn(banner, 4.5);
    return sq;
  };

  // A pair of fighters over a bomber's wings.
  const escortBomber = (bomber) => {
    const sq = { id: nextId++, formation: 'escort', mode: 'form', t: 0, n0: 2, size: 2, leader: null, anchor: bomber, frame: anchorFrame(bomber), ace: false, paint: null, aim: { dx: 0, dy: -150 }, cx: bomber.x, cy: bomber.y, spread: 0, side: Math.cos(bomber.heading) >= 0 ? -1 : 1 };
    const offs = slotOffsets('escort', 3);
    const planes = [1, 2].map((k) => {
      const w = slotWorld(sq.frame, offs[k], true);
      const p = newPlane(sq, k - 1, w.x, w.y, bomber.heading, hpFor());
      p.fx = offs[k].fx;
      p.fy = offs[k].fy;
      p.leader = k === 1;
      p.air = Math.abs(bomber.vx - ship.pose.vx) || D.SPEED * 0.5;
      return p;
    });
    sq.leader = planes[0];
    state.strafers.push(...planes);
    squads.push(sq);
    stats.escorts++;
    stats.planes += 2;
    return sq;
  };

  // ---- The squadron's mind ----
  // How far the wingmen are from their slots now: sq.err (the average) and sq.errMax (the worst), px.
  const measure = (sq, mem) => {
    const A = frameOf(sq);
    let sum = 0;
    let max = 0;
    let n = 0;
    for (const p of mem) {
      if (p === A || !A) continue;
      const w = slotWorld(A, p, !!sq.anchor);
      const e = Math.hypot(w.x - p.x, w.y - p.y);
      sum += e;
      max = Math.max(max, e);
      n++;
    }
    sq.err = n ? sum / n : 0;
    sq.errMax = max;
  };

  const buzzGunners = (text) => {
    for (const q of Object.values(state.players)) if (q.lock && layout.gunMounts[q.lock] && q.connected !== false && !(q.ko > 0)) phoneFx?.(q, text, config.SQUADRONS.BUZZ);
  };

  const breakUp = (sq, mem) => {
    const SQ = config.SQUADRONS;
    const mid = shipMid();
    const A = frameOf(sq);
    const sideSign = sq.anchor ? (Math.cos(A.heading) >= 0 ? 1 : -1) : Math.sign(A.x - mid.x) || 1; // (a squadron swings out on the side it came from; an escort pair on the side its bomber is flying to)
    sq.mode = 'break';
    sq.t = 0;
    sq.rally = { dx: sideSign * SQ.REGROUP_DIST, dy: -300 }; // (where the planes gather after their passes: out on the side they came from, so nobody crosses the ship to get there)
    stats.breaks++;
    pairsOf(mem.map((p) => ({ fx: p.fx, fy: p.fy }))).forEach(([a, b], k) => {
      const lead = mem[a];
      const wing = b != null ? mem[b] : null;
      const ang = SQ.IP_ANGLES[k % SQ.IP_ANGLES.length] * RAD;
      lead.ipOff = { dx: sideSign * Math.cos(ang) * SQ.IP_DIST, dy: Math.sin(ang) * SQ.IP_DIST };
      lead.delay = k * SQ.PAIR_GAP;
      lead.mode = lead.delay > 0 ? 'delay' : 'peel';
      lead.modeT = SQ.PEEL_MAX;
      lead.pairWing = wing;
      lead.pairLead = null;
      if (wing) {
        wing.mode = 'wing';
        wing.pairLead = lead;
        wing.pairWing = null;
        wing.pfx = -SQ.PAIR_SLOT_BACK;
        wing.pfy = (k % 2 ? -1 : 1) * SQ.PAIR_SLOT_SIDE;
      }
    });
    buzzGunners('SQUADRON BREAKING - ATTACK RUN!');
  };

  const withdraw = (sq, mem) => {
    sq.mode = 'withdraw';
    sq.t = 0;
    stats.withdrawals++;
    for (const p of mem) {
      p.mode = 'leave';
      p.leader = false;
    }
    warn('SQUADRON WITHDRAWS!', 2.5);
  };

  const lostLeader = (sq, mem) => {
    sq.leader = null;
    if (sq.anchor) { // (an escort pair: the other plane simply takes over)
      reslot(sq, mem);
      return;
    }
    stats.scatters++;
    sq.mode = 'scatter';
    sq.t = 0;
    mem.forEach((p, i) => {
      p.leader = false;
      p.mode = 'scatter';
      p.scatterH = p.heading + (i % 2 ? 1 : -1) * rand(0.7, 1.3);
      p.pairLead = p.pairWing = null;
    });
    warn('LEADER DOWN - THE SQUADRON SCATTERS!', 2.5);
  };

  // Every frame, before the planes fly: each squadron decides what state it is in.
  const update = (dt) => {
    const SQ = config.SQUADRONS;
    for (let i = squads.length - 1; i >= 0; i--) {
      const sq = squads[i];
      const mem = members(sq);
      if (!mem.length) {
        squads.splice(i, 1);
        continue;
      }
      sq.size = mem.length;
      sq.t += dt;
      if (sq.anchor) sq.frame = anchorFrame(sq.anchor);
      if (sq.anchor && !bomberAlive(sq.anchor)) { // (the bomber is gone: shot down, the pair goes for the ship in revenge as a squadron of its own; sent home, it follows)
        const shotDown = !(sq.anchor.hp > 0);
        sq.anchor = null;
        sq.formation = 'abreast';
        reslot(sq, mem);
        if (shotDown && sq.mode !== 'withdraw') {
          sq.mode = 'regroup';
          sq.t = 0;
          sq.turning = false;
          for (const p of mem) p.mode = 'form';
          warn('THE ESCORT AVENGES THE BOMBER!', 2.5);
        } else if (sq.mode !== 'withdraw') withdraw(sq, mem);
      }
      if (sq.mode !== 'withdraw') {
        if (!sq.leader || !mem.includes(sq.leader)) {
          if (mem.length <= sq.n0 * SQ.WITHDRAW_FRAC + 1e-9 && !sq.anchor) withdraw(sq, mem);
          else if (sq.mode !== 'scatter') lostLeader(sq, mem);
          else sq.leader = null;
        } else if (!sq.anchor && mem.length <= sq.n0 * SQ.WITHDRAW_FRAC + 1e-9) withdraw(sq, mem);
      }
      let cx = 0;
      let cy = 0;
      for (const p of mem) { cx += p.x; cy += p.y; }
      sq.cx = cx / mem.length;
      sq.cy = cy / mem.length;
      sq.spread = Math.max(...mem.map((p) => Math.hypot(p.x - sq.cx, p.y - sq.cy)));
      const mid = shipMid();
      measure(sq, mem);
      if (sq.mode === 'form') {
        const A = frameOf(sq);
        stats.errSum += sq.err;
        stats.errN++;
        if (A && sq.t > 1 && !sq.anchor && Math.hypot(A.x - mid.x, A.y - mid.y) < SQ.BREAK_RANGE) breakUp(sq, mem); // (an escort pair stays with its bomber)
      } else if (sq.mode === 'break') {
        const busy = mem.some((p) => p.mode === 'delay' || p.mode === 'peel' || p.mode === 'attack' || p.mode === 'wing' || p.mode === 'extend');
        if (!busy || sq.t > SQ.BREAK_MAX) {
          sq.mode = 'regroup';
          sq.t = 0;
          sq.turning = false;
          sq.aim = { dx: rand(-300, 300), dy: rand(-300, -100) };
          stats.regroups++;
          for (const p of mem) { p.mode = 'form'; p.pairLead = p.pairWing = null; }
        }
      } else if (sq.mode === 'regroup') {
        const A = frameOf(sq);
        const far = A && Math.hypot(A.x - mid.x, A.y - mid.y) > SQ.REGROUP_DIST;
        if (!sq.anchor && far && sq.t > 1 && (sq.errMax < SQ.REGROUP_ERR || sq.t > SQ.REGROUP_MAX * 0.5 || Math.hypot(A.x - mid.x, A.y - mid.y) > SQ.REGROUP_DIST + SQ.TURN_MARGIN)) sq.turning = true; // (formed up out past the ship: the leader turns for the next pass, the squadron turning with him; also when a straggler holds them up too long, or the leader has come far out)
        const facing = A && Math.abs(angDiff(Math.atan2(mid.y - A.y, mid.x - A.x), A.heading)) < 0.4;
        if (sq.t > 1 && ((sq.anchor && sq.errMax < SQ.REGROUP_ERR) || (sq.turning && facing && sq.errMax < SQ.REGROUP_ERR * 1.2) || sq.t > SQ.REGROUP_MAX)) {
          sq.mode = 'form';
          sq.t = 0;
        }
      } else if (sq.mode === 'scatter') {
        if (sq.t > SQ.SCATTER) {
          const best = [...mem].sort((a, b) => b.hp - a.hp || a.slot - b.slot)[0]; // (the healthiest takes over)
          const rest = mem.filter((p) => p !== best).sort((a, b) => a.slot - b.slot);
          reslot(sq, [best, ...rest]);
          stats.newLeaders++;
          sq.mode = 'regroup';
          sq.t = 0;
          sq.turning = false;
          for (const p of mem) p.mode = 'form';
        }
      }
    }
  };

  // ---- A plane's orders ----
  // Fly for the slot a moment ahead of its place in the frame A (the leader, or the bomber), matching A's speed along its track, quicker or slower by the slot error.
  const follow = (A, slotLike, flip, p, speedMax, carry = 0) => {
    const w = slotWorld(A, slotLike, flip);
    const ux = Math.cos(A.heading);
    const uy = Math.sin(A.heading);
    const ea = (w.x - p.x) * ux + (w.y - p.y) * uy; // (the slot is this far ahead of the plane along the track)
    const va = ((A.vx || 0) - carry) * ux + (A.vy || 0) * uy; // (carry: a bomber holds station against the ship, so its escort flies in the ship's frame too: flyPlane noScroll)
    const gap = Math.hypot(w.x - p.x, w.y - p.y);
    const speed = clamp(va + config.SQUADRONS.CATCHUP * ea + config.SQUADRONS.PURSUE * Math.max(0, gap - 300), D.SPEED * 0.55, speedMax || D.MAX_SPEED * 0.95); // (far from the slot, to either side: flat out, whatever the error along the track says)
    return { tx: w.x + ux * 260, ty: w.y + uy * 260, speed, turn: D.TURN, snapTo: w, snapA: A };
  };

  const steerRaw = (p, dt) => {
    const sq = squads.find((s) => s.id === p.squadronId);
    if (!sq) { p.squadronId = null; return null; } // (a plane given back by a hijack, or left over: it flies the old way)
    const SQ = config.SQUADRONS;
    const mid = shipMid();
    const A = frameOf(sq);
    const away = (Math.sign(p.x - mid.x) || (Math.cos(p.heading) >= 0 ? 1 : -1));
    switch (p.mode) {
      case 'form': {
        if (p === sq.leader && !sq.anchor) {
          const wait = 1 - SQ.WAIT * Math.min(1, (sq.errMax || 0) / SQ.WAIT_ERR); // (the leader eases off while a wingman is far behind his slot)
          if (sq.mode === 'regroup' && !sq.turning) { // (on out past the ship, level, until the squadron has formed up)
            const ox = p.x - mid.x;
            const od = Math.abs(ox);
            const ux = od > 700 ? Math.sign(ox) : away;
            return { tx: mid.x + ux * (SQ.REGROUP_DIST + 1200), ty: clamp(mid.y - 300, p.y - 220, p.y + 220), speed: D.SPEED * SQ.FORM_SPEED * wait, turn: D.TURN * SQ.FORM_TURN };
          }
          return { tx: mid.x + sq.aim.dx, ty: mid.y + sq.aim.dy, speed: D.SPEED * SQ.FORM_SPEED * wait, turn: D.TURN * SQ.FORM_TURN };
        }
        if (!A || A === p) return { tx: p.x + Math.cos(p.heading) * 800, ty: p.y + Math.sin(p.heading) * 800, speed: D.SPEED, turn: D.TURN };
        const cmd = follow(A, p, !!sq.anchor, p, null, sq.anchor ? ship.pose.vx : 0);
        cmd.snap = sq.mode === 'form' || sq.mode === 'regroup';
        if (sq.anchor) cmd.noScroll = true;
        return cmd;
      }
      case 'delay': { // (waits its turn to peel off, flying on at the ship)
        p.delay -= dt;
        if (p.delay <= 0) p.mode = 'peel';
        return { tx: p.x + Math.cos(p.heading) * 800, ty: p.y + Math.sin(p.heading) * 800, speed: D.SPEED, turn: D.TURN };
      }
      case 'peel': { // (swings out to its own run-in point)
        const ix = mid.x + p.ipOff.dx;
        const iy = mid.y + p.ipOff.dy;
        const out = Math.hypot(p.x - mid.x, p.y - mid.y) > SQ.STANDOFF + SQ.PULL_OFF + 150; // (a run only starts from outside the standoff ring: a plane that is still inside it keeps swinging out)
        if (p.modeT <= -SQ.PEEL_MAX) { // (never got out to its run-in point: gives up the run)
          p.mode = 'extend';
          p.modeT = SQ.EXTEND;
        } else if (out && (Math.hypot(ix - p.x, iy - p.y) < 350 || p.modeT <= 0)) {
          p.mode = 'attack';
          p.modeT = 4;
          p.shots = SQ.BURST;
          p.ram = false;
          p.aim = { dx: rand(-450, 450), dy: rand(-150, 150) };
          stats.runs++;
          if (p.pairWing) {
            p.pairWing.shots = SQ.BURST;
            p.pairWing.aim = { dx: p.aim.dx + rand(-200, 200), dy: p.aim.dy + rand(-80, 80) };
            stats.runs++;
          }
        }
        return { tx: ix, ty: iy, speed: D.SPEED, turn: D.TURN };
      }
      case 'attack': { // (the run: close on the ship firing at her, but steer for a point STANDOFF px out from the target on the plane's own side, so the run curves away before the hull)
        const tx = mid.x + p.aim.dx;
        const ty = mid.y + p.aim.dy;
        const dist = Math.hypot(tx - p.x, ty - p.y) || 1;
        if (dist < SQ.STANDOFF + SQ.PULL_OFF || p.modeT <= 0) {
          p.mode = 'extend';
          p.modeT = SQ.EXTEND;
        }
        return { tx: tx + ((p.x - tx) / dist) * SQ.STANDOFF, ty: ty + ((p.y - ty) / dist) * SQ.STANDOFF, speed: D.SPEED, turn: D.TURN, fire: { tx, ty, dist } };
      }
      case 'wing': { // (sticks to his pair leader, fires with him)
        const lead = p.pairLead;
        if (!lead || !(lead.hp > 0) || lead.squadronId !== sq.id) { // (his leader is gone: he finishes the pass alone)
          p.pairLead = null;
          p.mode = 'extend';
          p.modeT = SQ.EXTEND;
          return { tx: p.x + Math.cos(p.heading) * 800, ty: p.y + Math.sin(p.heading) * 800 - 200, speed: D.SPEED, turn: D.TURN };
        }
        if (lead.mode === 'rally') p.mode = 'rally';
        const cmd = follow(lead, { fx: p.pfx, fy: p.pfy }, false, p);
        cmd.snap = true;
        if (lead.mode === 'attack' && p.shots > 0 && p.aim) {
          const tx = mid.x + p.aim.dx;
          const ty = mid.y + p.aim.dy;
          cmd.fire = { tx, ty, dist: Math.hypot(tx - p.x, ty - p.y) };
        }
        return cmd;
      }
      case 'extend': { // (on and away from the ship after its pass)
        if (p.modeT <= 0) p.mode = 'rally';
        const rd = Math.hypot(p.x - mid.x, p.y - mid.y) || 1;
        return { tx: p.x + Math.cos(p.heading) * 120 + ((p.x - mid.x) / rd) * 900, ty: p.y + Math.sin(p.heading) * 120 + ((p.y - mid.y) / rd) * 900 - 60, speed: D.SPEED, turn: D.TURN };
      }
      case 'rally': { // (done with the pass: on to the gathering point out past the ship, and on beyond it until the rest are done)
        const rx = mid.x + sq.rally.dx;
        const ry = mid.y + sq.rally.dy;
        const near = Math.hypot(rx - p.x, ry - p.y) < 500;
        return { tx: near ? p.x + Math.cos(p.heading) * 800 : rx, ty: near ? p.y + Math.sin(p.heading) * 800 : ry, speed: D.SPEED * 0.95, turn: D.TURN };
      }
      case 'scatter': {
        return { tx: p.x + Math.cos(p.scatterH) * 800, ty: p.y + Math.sin(p.scatterH) * 800, speed: D.SPEED * 1.08, turn: D.TURN };
      }
      case 'leave': {
        if (Math.abs(p.x - mid.x) > SQ.LEAVE_DIST) p.gone = true;
        return { tx: p.x + away * 1500, ty: p.y - 250, speed: D.SPEED * SQ.LEAVE_SPEED, turn: D.TURN };
      }
      default:
        p.squadronId = null; // (a mode this system does not know: the old AI takes the plane back)
        return null;
    }
  };

  // Rock ahead: the planes' own avoidance (flyPlane) only looks a second ahead and pulls up steeply, which stalls them against a wall. This looks further along the nose and, if the way is blocked,
  // aims the plane at the nearest clear heading to the one it wanted (shallow, so it keeps its speed). A plane following a slot is steered the same way: the leader's dodge carries the others.
  const clearAlong = (p, ang) => [350, 700, 1050, 1400].every((d) => !inRock(state, p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d));
  // A plane forming up or going to the gathering point must not cut across the ship: if the straight line to where it is going passes through her bounds (and some margin), it goes over her (or under, if
  // it is below her) by way of a point just outside the bounds. Ship coordinates, so it works whichever way she faces.
  const routeAround = (p, cmd) => {
    const B = layout.bounds;
    const pad = config.SQUADRONS.SHIP_PAD;
    const ax = toShipX(ship, p.x), ay = toShipY(ship, p.y), bx = toShipX(ship, cmd.tx), by = toShipY(ship, cmd.ty);
    const x0 = B.x0 - pad, x1 = B.x1 + pad, y0 = B.y0 - pad, y1 = B.y1 + pad;
    let t0 = 0, t1 = 1;
    for (const [d, lo, hi, a] of [[bx - ax, x0, x1, ax], [by - ay, y0, y1, ay]]) { // (Liang-Barsky: does the segment pass through the box)
      if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) return; continue; }
      let ta = (lo - a) / d, tb = (hi - a) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return;
    }
    const over = ay < (B.y0 + B.y1) / 2;
    cmd.tx = toWorldX(ship, (B.x0 + B.x1) / 2 + (ax < (B.x0 + B.x1) / 2 ? -pad : pad));
    cmd.ty = toWorldY(ship, over ? y0 - pad * 0.3 : y1 + pad * 0.3);
  };
  const steer = (p, dt) => {
    const cmd = steerRaw(p, dt);
    if (cmd && (p.mode === 'form' || p.mode === 'rally' || p.mode === 'peel')) routeAround(p, cmd);
    if (!cmd || !state.course) return cmd;
    if (clearAlong(p, p.heading)) return cmd;
    const want = Math.atan2(cmd.ty - p.y, cmd.tx - p.x);
    let best = null;
    for (const dev of [0.3, 0.6, 0.9, 1.2, 1.5]) {
      for (const sgn of [1, -1]) {
        const ang = p.heading + sgn * dev;
        if (clearAlong(p, ang) && (!best || Math.abs(angDiff(ang, want)) < Math.abs(angDiff(best, want)))) best = ang;
      }
      if (best != null) break;
    }
    if (best != null) {
      cmd.tx = p.x + Math.cos(best) * 900;
      cmd.ty = p.y + Math.sin(best) * 900;
    }
    return cmd;
  };

  // After a plane has flown its step: a wingman near his slot is eased onto it (and onto the leader's heading), so the formation looks rigid; never into rock.
  const snap = (p, cmd, dt) => {
    const SQ = config.SQUADRONS;
    const w = cmd.snapTo;
    const err = Math.hypot(w.x - p.x, w.y - p.y);
    if (err > SQ.SNAP_RANGE || inRock(state, w.x, w.y)) return;
    const k = Math.min(1, SQ.SNAP * dt * (1 + (SQ.SNAP_RANGE - err) / SQ.SNAP_RANGE));
    p.x += (w.x - p.x) * k;
    p.y += (w.y - p.y) * k;
    if (err < SQ.SNAP_RANGE * 0.6) p.heading += angDiff(cmd.snapA.heading, p.heading) * Math.min(1, 2.5 * dt);
  };

  // The slot error of every wingman (px) of a squadron now: for the tests and the botsim line.
  const slotErrors = (sq) => {
    if (!frameOf(sq)) return [];
    const A = frameOf(sq);
    return members(sq).filter((p) => p !== A).map((p) => { const w = slotWorld(A, p, !!sq.anchor); return Math.hypot(w.x - p.x, w.y - p.y); });
  };

  const reset = () => {
    squads.length = 0;
  };

  return { spawn, escortBomber, update, steer, snap, slotErrors, members, reset, banner: () => banner, squads };
}
