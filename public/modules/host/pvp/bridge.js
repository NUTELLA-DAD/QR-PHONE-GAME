// The PvP bridge (PVP.md section 2, V.2): two complete copies of the game - one per ship - put into ONE sky.
//
// Each copy (a "side", A or B) is a normal createSimulation() from its own module instance (the browser loads B from /b/..., the
// Node tools through tools/instances.mjs), so each has its own SHIP_LAYOUT, config and state. This file needs no DOM and imports
// nothing but the stateless pose.js converters: every side is handed in as { sim, config, layout }.
//
//   ONE SKY        both copies get the same map seed / kind / environment; B's course is shifted along the sky. Since M.1 the sky is stored in
//                  MAP coordinates, so a shell, a bomb or a rock is at the same (x, y) in both copies and a world point reaches the other ship's
//                  coordinates with one pose.js toShip. The offset between the ships' own frames (the rival mirror) is
//                    dx = pose_to.x - pose_from.x    (where the ships' origins are along the sky)
//                    dy = pose_to.y - pose_from.y    (pose.y = -alt and y points down, so the ship that is higher sees the other one lower)
//   RIVAL MIRROR   every step each sim gets state.rival = { layout, dx, dy, mid, vx, vy, hull, down, guns, bags, crew, team }:
//                  the other ship as seen from this one (mid = her middle in our ship coordinates). New code reads it behind `if (state.rival)`.
//   CROSS-FIRE     shells and bombs of one side are tested against the other ship (sim.external.hitsShip) and land with
//                  sim.external.impact, credited to the gunner; the shell is removed from the firing side.
//   ROUNDS         the bridge owns the round, the score and the win (Broadside: a wreck ends the round, GOING DOWN! is allowed as the last
//                  stand, no limp-home spares; on the round cap the higher hull % wins). Best of three, sides swap every round.
//
// Usage:  const br = createBridge({ A: { sim, config, layout }, B: { ... } });  br.startMatch();  then br.update(dt) INSTEAD of sim.update.
// Tunables: config.PVP (A's copy is the master; the bridge copies it to B).

import { toShipX, toShipY } from '../pose.js';

const SIDES = ['A', 'B'];
const other = (x) => (x === 'A' ? 'B' : 'A');

// Small seeded random generator (the arena sky must be the same in both copies and repeatable).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const freshStats = () => ({ shots: 0, hits: 0, dmg: 0, bombs: 0 });

export function createBridge(sides, opts = {}) {
  const S = { A: sides.A, B: sides.B };
  for (const x of SIDES) {
    const s = S[x];
    if (!s || !s.sim || !s.sim.external) throw new Error('bridge: side ' + x + ' needs { sim, config, layout } with sim.external (simulation.js return block)');
  }
  // One set of tunables for both copies; the numbers are read from A's config.PVP.
  for (const k of Object.keys(S.A.config.PVP)) S.B.config.PVP[k] = JSON.parse(JSON.stringify(S.A.config.PVP[k]));
  for (const x of SIDES) S[x].config.PVP.ENABLED = true;
  const P = S.A.config.PVP;

  const br = {
    phase: 'idle', // idle | count (moored, 3-2-1) | fight | finale (the wreck plays out) | between | match (over)
    round: 0,
    t: 0, // seconds in this phase
    fightT: 0, // seconds of the current fight
    left: 'A', // which side starts on the left this round
    score: { A: 0, B: 0 },
    matchWinner: null, // 'A' | 'B' | 'draw' once the match is decided
    results: [], // one entry per closed round: { round, winner, cause, time, hull, stats }
    stats: { A: freshStats(), B: freshStats() }, // this round
    errors: 0,
    lastError: null,
    auto: true, // start the next round by itself after BETWEEN seconds
    S,
    P,
  };

  const st = (x) => S[x].sim.state;

  // ---- one sky ----
  function startRound() {
    br.round++;
    br.t = 0;
    br.fightT = 0;
    br.phase = 'count';
    br.left = br.round % 2 === 1 ? 'A' : 'B'; // sides swap every round
    br.stats = { A: freshStats(), B: freshStats() };
    const seed = P.MAP_SEED + br.round;
    for (const x of SIDES) {
      const { sim, config } = S[x];
      config.PVP.ENABLED = true;
      sim.restart(); // everything back to the mast; the crew drops aboard again
      const s = sim.state;
      s.course.rand = rng(seed); // the same sky in both copies
      sim.course.startMission(1, { environment: P.ENVIRONMENT, kind: P.MAP_KIND, title: 'VERSUS - ROUND ' + br.round });
      const c = s.course;
      c.turrets.length = 0; // no flak, no outposts: only the other ship
      for (const o of c.map.outposts || []) o.done = true;
      c.done = true; // (no beacon, no mission end)
      if (x !== br.left) s.ships[0].pose.x += P.START_GAP; // the right-hand ship starts START_GAP further along
      s.team = { id: x === 'A' ? 'red' : 'blue', ...P.TEAMS[x === 'A' ? 'red' : 'blue'] };
      s.rival = null;
    }
    mirror(0);
  }

  function startMatch() {
    br.score = { A: 0, B: 0 };
    br.results = [];
    br.round = 0;
    br.matchWinner = null;
    startRound();
  }

  // ---- the rival mirror ----
  function mirror(dt) {
    for (const x of SIDES) {
      const me = S[x], rv = S[other(x)];
      const ms = me.sim.state, rs = rv.sim.state;
      const dx = rs.ships[0].pose.x - ms.ships[0].pose.x; // (the ships' poses: pose.js)
      const dy = rs.ships[0].pose.y - ms.ships[0].pose.y;
      const prev = ms.rival;
      const mid = { x: rv.layout.aimPoint.x + dx, y: rv.layout.aimPoint.y + dy };
      const k = prev && dt > 0 ? 1 / dt : 0;
      ms.rival = {
        layout: rv.layout,
        dx,
        dy,
        mid,
        vx: prev && dt > 0 ? (dx - prev.dx) * k : 0, // how her middle moves in our view (px/s): along the sky...
        vy: prev && dt > 0 ? -(rs.ship.alt - prev.alt) * k : 0, // ...and up/down (world y points down, so a climb is negative)
        alt: rs.ship.alt,
        hull: rs.ship.hull,
        down: rs.ship.down > 0 || !!rs.wreck,
        guns: Object.entries(rs.GUNS).map(([name, g]) => ({ name, x: g.bx + dx, y: g.by + dy, ammo: g.ammo })),
        bags: rv.layout.gasbags.map((b, i) => ({ x: b.cx + dx, y: b.cy + dy, rx: b.rx, ry: b.ry, gas: rs.bags && rs.bags[i] ? rs.bags[i].gas : rs.ship.gas })),
        crew: Object.values(rs.players).filter((p) => !p.fall && p.connected !== false).map((p) => ({ id: p.id, x: p.x + dx, y: (p.y || 0) + dy, bot: !!p.bot })),
        team: rs.team,
      };
    }
  }

  // ---- cross-fire ----
  function crossfire() {
    for (const from of SIDES) {
      const to = other(from);
      const fs = st(from), ts = st(to);
      if (ts.ship.down > 0 || ts.wreck) continue; // (a wreck is no target)
      const ext = S[to].sim.external;
      const tShip = ts.ships[0]; // (shells and bombs are in the world, which both copies share: toShip puts them in her ship's coordinates)
      const stat = br.stats[from];
      for (let i = fs.shells.length - 1; i >= 0; i--) {
        const sh = fs.shells[i];
        if (!sh.seen) {
          sh.seen = true;
          stat.shots++;
        }
        if (sh.life <= 0) continue;
        const tx = toShipX(tShip, sh.x), ty = toShipY(tShip, sh.y); // the shell in the other ship's coordinates
        if (!ext.hitsShip(tx, ty)) continue;
        const before = ts.ship.hull;
        ext.impact(tx, ty, P.SHELL_POWER * (sh.mul || 1));
        stat.hits++;
        stat.dmg += Math.max(0, before - ts.ship.hull);
        const gunner = fs.players[sh.owner];
        if (gunner && !gunner.mate) {
          gunner.stats = gunner.stats || {};
          gunner.stats.pvpHits = (gunner.stats.pvpHits || 0) + 1;
        }
        fs.rings.push({ x: sh.x, y: sh.y, t: 0.3, max: 0.3, color: '#ffd23f', size: 90 });
        fs.sfxQ.push(['impact']);
        fs.shells.splice(i, 1);
      }
      for (const b of fs.shipBombs || []) {
        const bx = toShipX(tShip, b.x), by = toShipY(tShip, b.y);
        if (b.done || !ext.hitsShip(bx, by)) continue;
        const before = ts.ship.hull;
        ext.impact(bx, by, P.BOMB_POWER);
        b.done = true; // (the bomb went off inside her)
        stat.bombs++;
        stat.dmg += Math.max(0, before - ts.ship.hull);
      }
    }
  }

  // ---- rounds ----
  const hullPct = (x) => Math.max(0, st(x).ship.hull);
  const wrecked = (x) => !!st(x).wreck;

  function close(winner, cause) {
    br.results.push({ round: br.round, winner, cause, time: br.fightT, hull: { A: hullPct('A'), B: hullPct('B') }, stats: { A: { ...br.stats.A }, B: { ...br.stats.B } } });
    if (winner) br.score[winner]++;
    br.phase = 'finale';
    br.t = 0;
    const need = P.WINS_NEEDED;
    const last = br.round >= need * 2 - 1;
    if (br.score.A >= need || br.score.B >= need) br.matchWinner = br.score.A > br.score.B ? 'A' : 'B';
    else if (last) br.matchWinner = br.score.A === br.score.B ? 'draw' : br.score.A > br.score.B ? 'A' : 'B';
  }

  function rules(dt) {
    br.t += dt;
    if (br.phase === 'count') {
      if (br.t >= P.COUNT_IN) {
        for (const x of SIDES) {
          S[x].sim.castOff();
          const run = st(x).run;
          if (run) run.spares = run.sparesMax = 0; // (no limp-home: a wreck is final)
        }
        br.phase = 'fight';
        br.t = 0;
      }
    } else if (br.phase === 'fight') {
      br.fightT += dt;
      const a = wrecked('A'), b = wrecked('B');
      if (a && b) close(null, 'both wrecked');
      else if (a || b) close(a ? 'B' : 'A', 'sunk');
      else if (br.fightT >= P.ROUND_TIME) {
        const d = hullPct('A') - hullPct('B');
        close(Math.abs(d) < 0.5 ? null : d > 0 ? 'A' : 'B', 'timeout');
      }
    } else if (br.phase === 'finale') {
      if (br.t >= P.FINALE) {
        br.phase = br.matchWinner ? 'match' : 'between';
        br.t = 0;
      }
    } else if (br.phase === 'between') {
      if (br.auto && br.t >= P.BETWEEN) startRound();
    }
  }

  // ---- the step ----
  function update(dt) {
    if (br.phase === 'idle') return;
    for (const x of SIDES) { // lockstep: A then B
      try {
        S[x].sim.update(dt);
      } catch (e) {
        br.errors++;
        br.lastError = x + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
      }
    }
    mirror(dt);
    if (br.phase === 'fight' || br.phase === 'finale') crossfire();
    rules(dt);
  }

  // Bot crew for one side (the recipe of the "Add 4 bot crew" button, network.js): dropped onto that ship's boarding points.
  function addBots(x, n) {
    const { sim, config, layout } = S[x];
    const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
    const e = layout.boarderEntryPoints;
    for (let i = 0; i < n; i++) {
      const id = 'bot' + x + Math.random();
      sim.state.players[id] = {
        id, bot: true, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0],
        color: colors[(Math.random() * colors.length) | 0], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true,
      };
    }
  }

  Object.assign(br, { startMatch, startRound, update, addBots });
  return br;
}
