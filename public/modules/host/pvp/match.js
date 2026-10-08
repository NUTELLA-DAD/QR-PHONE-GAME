// VERSUS ON ONE WORLD (PVP.md, MOVEMENT.md B.4): two crews, each on a Ship of their own, in ONE simulation. Node-safe: no DOM.
//
// This file is the MATCH: the lobby's two teams, the shelf of ships they pick from, the rounds (best of three), the sides that swap, the count-in, the fight, the finale, the
// scoreboard, the rematch - and the three things that only exist when two crews share a sky:
//   * CROSS-FIRE   every shell and bomb is tested against every OTHER ship (hitsShip / shieldBlocks / impact of that ship, in her coordinates through pose.js): one shell list;
//   * BUMPS        two hulls do not pass through each other: shipCollide.js (the whole world's ship-ship collision) pushes them apart; Versus only counts the bumps (count('bumps'));
//   * RIVALS       every ship has `ship.rival` (ctx.rival): the nearest ship of the other team, in WORLD coordinates (her aim point, her guns, bags, crew, helm and boiler), which the
//                  bot captains (course.js rivalPlan, aim.js targets) and the TV read.
// The rules a boarder lives by (fight, sabotage, take the helm, carried home when knocked out) are the ship's own (shipSim.js: isHostile, hostileUse, hitCrew, sendHome).
//
// The match lives in `world.match` while Versus is on (config.PVP.ENABLED; the lobby's Mode button VERSUS or host.html?versus=1). Phases:
//   lobby    two moored ships, crew dealt red / blue (a phone can swap its side), bots can be added to either         -> begin()   (CAST OFF)
//   shelf    each team votes on its phones for a ship from the shelf (shelf.js), same weight cap                      -> the vote ends
//   count    both ships moored at opposite ends of a fresh arena sky (open sky and rock islands), 3-2-1
//   fight    a wreck ends the round (Broadside; also: an enemy crewman holding the helm CAPTURE_TIME s in Capture); the cap decides by hull %
//   finale   the sky keeps running while the wreck plays out (slow motion), the winner is named
//   between  the scoreboard, then the next round with the sides swapped     over  the match is decided: winner, then the rematch vote
// Tunables: config.PVP. No co-op save is written while it is on (simulation.js, voyage.js, crewscale.js read config.PVP.ENABLED).
import { config } from '../../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY, pivotOf } from '../pose.js';
import { transfer } from '../ships.js';
import { inRock } from '../course.js';
import { BUILDS } from '../shipBuild.js';
import { buildShelf, tonnageCap } from './shelf.js';

const TEAMS = ['red', 'blue'];
const other = (t) => (t === 'red' ? 'blue' : 'red');
const fresh = () => ({ shots: 0, hits: 0, dmg: 0, bombs: 0, bumps: 0, boardings: 0, sabotage: 0, captures: 0, knockouts: 0, patches: 0 });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Small seeded random generator (the arena sky is repeatable).
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

// D = what the match asks of the simulation: { world, addShip(parts, opts), removeShip(ship), course() (the world's course), launch() (CAST OFF without the voyage rules), restart(),
//   openVote(v), newBot(world, ship, name), phoneFx(player, toast, buzz) }
export function createMatch(D) {
  const world = D.world;
  const V = () => config.PVP;
  const seen = new WeakSet(); // shells already counted as a shot

  const M = {
    on: false,
    phase: 'lobby', // lobby | shelf | count | fight | finale | between | over
    round: 0,
    t: 0, // seconds in this phase
    fightT: 0, // seconds of the current fight
    left: 'red', // which team starts this round on the left
    score: { red: 0, blue: 0 },
    winner: null, // 'red' | 'blue' | 'draw' once the match is decided
    roundWinner: null, // who took the round that just ended (null = a draw)
    cause: '', // how the last round ended: sunk | captured | timeout | both wrecked
    capturedBy: null,
    results: [], // one entry per closed round: { round, winner, cause, time, hull, stats, mvp }
    stats: { red: fresh(), blue: fresh() }, // this round
    totals: { red: fresh(), blue: fresh() }, // the match so far
    shelf: null,
    picks: { red: 0, blue: 0 }, // the index of each team's ship on the shelf
    slow: 1, // the speed of time (the finale slows it: main.js reads this)
    stepNo: 0,
    errors: 0,
    // (called by the ships' rules, shipSim.js)
    count(team, key, n = 1) {
      if (!M.stats[team] || M.phase !== 'fight') return; // (what happens after the deciding blow is not in the round's numbers)
      M.stats[team][key] = (M.stats[team][key] || 0) + n;
      M.totals[team][key] = (M.totals[team][key] || 0) + n;
    },
    captured(ship, player) { // a boarder took the helm of `ship`
      if (V().MODE === 'capture' && M.phase === 'fight' && player.team) M.capturedBy = player.team;
    },
  };

  const players = () => Object.values(world.players);
  const crewOfTeam = (t) => players().filter((p) => p.team === t && !p.mate);
  const shipOfTeam = (t) => world.ships.find((s) => s.team && s.team.id === t);
  const sideShips = () => TEAMS.map(shipOfTeam).filter(Boolean);
  const wrecked = (sh) => !!sh.ctx.wreck;
  const hullPct = (sh) => Math.max(0, sh.state.hull);
  const dropX = (ship) => { const [e0, e1] = ship.layout.boarderEntryPoints; return e0.x + Math.random() * (e1.x - e0.x); };

  // ---- the crew: who is on which side ----
  // Put a crewman aboard a ship: dropped in from above, as when joining.
  function dropAboard(p, ship) {
    transfer(world, p, ship);
    Object.assign(p, { ko: 0, lock: null, carry: null, conn: null, climb: false, fly: false, air: false, fall: true, tumble: false, y: -60, x: dropX(ship), pvpHp: undefined, hook: null, jz: 0 });
    p.uk = null;
  }
  function assign(p, team) {
    p.team = team;
    dropAboard(p, shipOfTeam(team));
  }
  // The side a new arrival joins (the smaller crew; red first on a tie).
  const teamForJoiner = () => (crewOfTeam('red').length <= crewOfTeam('blue').length ? 'red' : 'blue');
  // A phone's "tap to swap" in the lobby.
  function swapTeam(p) {
    if (!M.on || M.phase !== 'lobby' || !p.team) return false;
    assign(p, other(p.team));
    D.phoneFx(p, "You're " + p.team.toUpperCase() + ' now', [40, 40]);
    D.emitUi(p.id, { tm: { id: p.team, name: p.team.toUpperCase(), color: shipOfTeam(p.team).team.color, swap: true } }); // (the bar on his phone says so at once, not when he has landed)
    return true;
  }
  // Bots on a side (the lobby's Add bots adds to both; at CAST OFF the smaller crew is filled up to the bigger).
  function addBots(team, n) {
    for (let i = 0; i < n && players().filter((p) => !p.mate).length < config.MAX_PLAYERS; i++) {
      const ship = shipOfTeam(team);
      const bot = D.newBot(world, ship, 'Bot' + (players().length + 1));
      bot.team = team;
      world.players[bot.id] = bot;
    }
  }
  function fillBots() {
    const n = { red: crewOfTeam('red').length, blue: crewOfTeam('blue').length };
    const want = Math.max(n.red, n.blue, n.red + n.blue === 0 ? 3 : 1);
    for (const t of TEAMS) addBots(t, want - n[t]);
  }

  // ---- entering and leaving Versus (the lobby's Mode button) ----
  function enter() {
    if (M.on) return;
    config.PVP.ENABLED = true;
    M.on = true;
    world.match = M;
    const red = world.ships[0];
    if (world.ships.length < 2) D.addShip(BUILDS.classic, { id: 'ship1', team: 'blue', name: 'BLUE SHIP', formation: { dx: V().LOBBY_GAP, dalt: 0 } });
    red.team = 'red';
    red.name = 'RED SHIP';
    shipOfTeam('blue').team = 'blue';
    const crew = players().filter((p) => !p.mate);
    crew.forEach((p, i) => assign(p, i % 2 ? 'blue' : 'red'));
    Object.assign(M, { phase: 'lobby', round: 0, t: 0, score: { red: 0, blue: 0 }, winner: null, results: [], stats: { red: fresh(), blue: fresh() }, totals: { red: fresh(), blue: fresh() }, picks: { red: 0, blue: 0 }, slow: 1, capturedBy: null });
    world.ev.warn = 0; // (the voyage's "STOP 1" banner is not for this lobby)
    for (const sh of world.ships) sh.buildId = 'classic';
  }
  function leave() {
    if (!M.on) return;
    M.on = false;
    config.PVP.ENABLED = false;
    world.match = null;
    for (const p of players()) {
      delete p.team;
      delete p.pvpHp;
    }
    const red = world.ships[0];
    for (const sh of world.ships.slice(1)) D.removeShip(sh);
    for (const p of players()) dropAboard(p, red);
    red.team = null;
    red.name = 'AIRSHIP';
    red.rival = null;
    delete red.moorAlt;
    if (red.buildId && red.buildId !== 'classic') red.layout.applyBuild(BUILDS.classic);
    delete red.buildId;
    D.restart(); // (a fresh voyage from the mast: the arena sky was not the voyage's)
  }

  // ---- the shelf ----
  function begin(opts = {}) {
    if (!M.on || M.phase !== 'lobby') return false;
    fillBots();
    M.score = { red: 0, blue: 0 };
    M.results = [];
    M.round = 0;
    M.winner = null;
    M.totals = { red: fresh(), blue: fresh() };
    if (opts.shelf === false) return startRound();
    M.shelf = buildShelf();
    M.cap = tonnageCap();
    M.phase = 'shelf';
    M.t = 0;
    D.openVote({
      kind: 'shelf',
      title: 'PICK YOUR SHIP',
      t: V().SHELF_TIME,
      options: M.shelf.map((e) => ({ name: e.name, icon: '⚓', desc: `${e.blurb} - weight ${e.mass}, lift ${e.lift}, ${e.hands} hands`, cost: null })),
      onDone: (picks) => { applyPicks(picks); startRound(); },
    });
    return true;
  }
  // Each team's pick (an index into the shelf) is put under that team's flag. Red is the main ship (her layout is refitted in place); blue is made afresh.
  function applyPicks(picks) {
    for (const t of TEAMS) {
      const i = picks && picks[t] != null && M.shelf[picks[t]] ? picks[t] : 0;
      M.picks[t] = i;
      const e = M.shelf[i];
      const sh = shipOfTeam(t);
      if (sh.buildId === e.id) continue;
      if (sh.main) {
        sh.layout.applyBuild(e.parts);
        sh.sim.refit();
        sh.buildId = e.id;
        sh.name = t.toUpperCase() + ' ' + e.name.toUpperCase();
      } else {
        D.removeShip(sh);
        const made = D.addShip(e.parts, { id: 'ship1', team: t, name: t.toUpperCase() + ' ' + e.name.toUpperCase(), formation: { dx: V().LOBBY_GAP, dalt: 0 } });
        made.buildId = e.id;
      }
    }
    for (const p of crewOfTeam('red').concat(crewOfTeam('blue'))) dropAboard(p, shipOfTeam(p.team));
  }

  // ---- a round ----
  // Put a ship so that her reference point is at world x, facing f, at the map's start height.
  function stand(sh, start, wantX, f) {
    const R = sh.layout.refPoint, pv = pivotOf(sh);
    D.course().place(sh, { x: wantX - (pv + f * (R.x - pv)), y: start.y - R.y, f });
  }
  function startRound() {
    const P = V();
    M.round++;
    M.t = 0;
    M.fightT = 0;
    M.capturedBy = null;
    M.roundWinner = null;
    M.slow = 1;
    M.left = M.round % 2 === 1 ? 'red' : 'blue'; // sides swap every round
    M.stats = { red: fresh(), blue: fresh() };
    for (const k of ['shells', 'bullets', 'shipBombs', 'rockets', 'puffs', 'flashes', 'rings', 'popups', 'bats', 'bombers', 'strafers', 'enemyBombs', 'paras', 'mines', 'chutes', 'wrecks', 'hijacks']) if (Array.isArray(world[k])) world[k].length = 0;
    world.supply = null;
    world.enemy.dead = Math.max(world.enemy.dead, 60);
    for (const sh of world.ships) {
      sh.sim.respawn({ crew: false });
      sh.rival = null;
    }
    // the arena: a fresh open sky with rock islands (the course generator), the same for both ships, no flak and no outposts
    const course = D.course();
    course.rand = rng(P.MAP_SEED + M.round * 101);
    course.startMission(1, { environment: P.ENVIRONMENT, kind: P.MAP_KIND, title: 'VERSUS - ROUND ' + M.round });
    const c = world.course;
    c.turrets.length = 0;
    for (const o of c.map.outposts || []) o.done = true;
    c.done = true;
    c.target = null;
    const start = { x: c.map.start.x, y: c.map.start.y - P.ARENA.LIFT };
    const left = shipOfTeam(M.left), right = shipOfTeam(other(M.left));
    stand(left, start, start.x, 1);
    stand(right, start, start.x + P.START_GAP, P.FACE_OFF ? -1 : 1);
    for (const p of players()) {
      if (p.mate) continue;
      p.stats = {};
      if (p.team) dropAboard(p, shipOfTeam(p.team));
    }
    world.phase = 'lobby'; // (moored: the count-in; D.launch() casts both ships off)
    world.ev.warn = 3;
    world.ev.warnText = 'ROUND ' + M.round + ' - GET READY!';
    M.phase = 'count';
    refreshRivals(0);
    return true;
  }
  function close(winner, cause) {
    const sides = { red: shipOfTeam('red'), blue: shipOfTeam('blue') };
    for (const t of TEAMS) { // patches: holes and fires put out and parts mended, by the crew of that side
      M.stats[t].patches = crewOfTeam(t).reduce((n, p) => n + (p.stats ? (p.stats.holes || 0) + (p.stats.fires || 0) + (p.stats.repairs || 0) : 0), 0);
      M.totals[t].patches += M.stats[t].patches;
    }
    const mvp = crewOfTeam(winner || 'red').map((p) => ({ name: p.name, color: p.color, species: p.species, score: ((p.stats && p.stats.pvpHits) || 0) + 2 * ((p.stats && p.stats.ko) || 0) + ((p.stats && p.stats.holes) || 0) + 3 * ((p.stats && p.stats.captures) || 0) })).sort((a, b) => b.score - a.score)[0] || null;
    M.results.push({ round: M.round, winner, cause, time: M.fightT, left: M.left, hull: { red: hullPct(sides.red), blue: hullPct(sides.blue) }, stats: { red: { ...M.stats.red }, blue: { ...M.stats.blue } }, mvp });
    if (winner) M.score[winner]++;
    M.roundWinner = winner;
    M.cause = cause;
    M.phase = 'finale';
    M.t = 0;
    const need = V().WINS_NEEDED;
    if (M.score.red >= need || M.score.blue >= need) M.winner = M.score.red > M.score.blue ? 'red' : 'blue';
    else if (M.round >= need * 2 + 1) M.winner = M.score.red === M.score.blue ? 'draw' : M.score.red > M.score.blue ? 'red' : 'blue'; // (draws can drag it out: five rounds at most)
    world.ev.warn = V().FINALE + V().BETWEEN;
    world.ev.warnText = winner ? winner.toUpperCase() + ' WINS THE ROUND' + (cause === 'captured' ? ' - HELM TAKEN!' : cause === 'timeout' ? ' ON HULL' : '!') : 'A DRAW - BOTH SHIPS DOWN';
  }
  // The deciding blow (a wreck) plays out in slow motion for the first part of the finale.
  const finaleSlow = () => (M.t < V().FINALE * 0.55 ? 0.4 : 1);

  // ---- the rematch ----
  function openRematch() {
    D.openVote({
      kind: 'rematch',
      title: (M.winner === 'draw' ? 'A DRAW' : M.winner.toUpperCase() + ' WINS THE MATCH') + ' - AGAIN?',
      t: V().REMATCH_TIME,
      options: [
        { name: 'Rematch', icon: '🔁', desc: 'The same ships, best of three again', cost: null },
        { name: 'New ships', icon: '⚓', desc: 'Back to the shelf: pick again', cost: null },
        { name: 'Lobby', icon: '🚪', desc: 'Back to the lobby', cost: null },
      ],
      onDone: (counts) => {
        const pick = counts.all;
        if (pick === 0) { M.score = { red: 0, blue: 0 }; M.results = []; M.round = 0; M.winner = null; M.totals = { red: fresh(), blue: fresh() }; startRound(); }
        else if (pick === 1) { M.phase = 'lobby'; begin(); }
        else toLobby();
      },
    });
  }
  // Back to the Versus lobby (two moored ships, the crew where they are; the picked builds stay).
  function toLobby() {
    Object.assign(M, { phase: 'lobby', round: 0, t: 0, score: { red: 0, blue: 0 }, winner: null, roundWinner: null, capturedBy: null, slow: 1 });
    for (const sh of world.ships) {
      sh.sim.respawn({ crew: false });
      sh.rival = null;
      delete sh.moorAlt;
    }
    world.phase = 'lobby';
    D.course().startMission(1, { environment: V().ENVIRONMENT, kind: V().MAP_KIND, title: 'VERSUS' }); // (the lobby's sky is an arena sky too)
    for (const p of players()) if (!p.mate && p.team) dropAboard(p, shipOfTeam(p.team));
  }

  // ---- rivals: every ship's view of the other team's nearest ship, in WORLD coordinates ----
  function fillRival(R, rv, dt) {
    R = R || {};
    const aim = rv.layout.aimPoint;
    const mx = toWorldX(rv, aim.x), my = toWorldY(rv, aim.y);
    if (R.mid && dt > 0) { R.vx = (mx - R.mid.x) / dt; R.vy = (my - R.mid.y) / dt; } else { R.vx = 0; R.vy = 0; }
    R.mid = { x: mx, y: my };
    R.ship = rv; R.id = rv.id; R.team = rv.team; R.layout = rv.layout; R.pose = rv.pose;
    R.hull = rv.state.hull;
    R.down = rv.state.down > 0 || !!rv.ctx.wreck;
    R.stamp = M.stepNo;
    const crew = Object.values(rv.ctx.players);
    R.guns = Object.entries(rv.ctx.GUNS).map(([name, g]) => ({ name, x: toWorldX(rv, g.bx), y: toWorldY(rv, g.by), ammo: g.ammo, aim: g.aim, manned: crew.some((q) => q.lock === name && !(q.ko > 0)) }));
    R.bags = rv.layout.gasbags.map((b, i) => ({ x: toWorldX(rv, b.cx), y: toWorldY(rv, b.cy), rx: b.rx, ry: b.ry, gas: rv.ctx.bags && rv.ctx.bags[i] ? rv.ctx.bags[i].gas : rv.state.gas }));
    R.crew = crew.filter((q) => !q.fall && !q.fly && q.connected !== false).map((q) => ({ id: q.id, x: toWorldX(rv, q.x), y: toWorldY(rv, q.y || 0), bot: !!q.bot, team: q.team }));
    const st = (kind) => { const s = rv.layout.one(kind); return s ? { x: toWorldX(rv, s.x), y: toWorldY(rv, rv.layout.platforms[s.d].y - 60) } : null; };
    R.helm = st('helm');
    R.boiler = st('boiler');
    return R;
  }
  function refreshRivals(dt) {
    M.stepNo++;
    for (const me of world.ships) {
      let best = null, bd = Infinity;
      if (me.team) {
        for (const rv of world.ships) {
          if (rv === me || !rv.team || rv.team.id === me.team.id) continue;
          const d = Math.abs(rv.pose.x - me.pose.x) + Math.abs(rv.pose.y - me.pose.y);
          if (d < bd) { bd = d; best = rv; }
        }
      }
      me.rival = best ? fillRival(me.rival && me.rival.ship === best ? me.rival : null, best, dt) : null;
    }
  }

  // ---- cross-fire: a shell or a bomb of one ship against every other ship ----
  const shellShip = (sh) => world.ships.find((s) => s.id === sh.from) || (sh.owner && world.players[sh.owner] ? world.ships.find((s) => s.id === (world.players[sh.owner].ship || 'player')) : null) || null;
  function crossFire() {
    if (M.phase !== 'fight' && M.phase !== 'finale') return;
    const P = V();
    const targets = sideShips();
    for (const sh of world.shells) {
      if (sh.life <= 0) continue;
      const from = shellShip(sh);
      const gunner = sh.owner ? world.players[sh.owner] : null;
      const team = (gunner && gunner.team) || (from && from.team && from.team.id) || null;
      if (!seen.has(sh)) { seen.add(sh); if (team && !sh.frag) M.count(team, 'shots'); }
      if (inRock(world, sh.x, sh.y)) { // a rock island gives cover
        sh.life = 0;
        D.puff(sh.x, sh.y, '#8b6b4a', 4);
        continue;
      }
      for (const t of targets) {
        if (t === from || wrecked(t) || t.state.down > 0) continue;
        if (t.sim.shieldBlocks(sh.x, sh.y)) { sh.life = 0; break; }
        const tx = toShipX(t, sh.x), ty = toShipY(t, sh.y);
        if (!t.sim.hitsShip(tx, ty)) continue;
        const before = t.state.hull;
        t.sim.impact(tx, ty, P.SHELL_POWER * (sh.mul || 1));
        sh.life = 0;
        if (team) { M.count(team, 'hits'); M.count(team, 'dmg', Math.max(0, before - t.state.hull)); }
        if (gunner && !gunner.mate) { gunner.stats = gunner.stats || {}; gunner.stats.pvpHits = (gunner.stats.pvpHits || 0) + 1; }
        break;
      }
    }
    for (const b of world.shipBombs || []) {
      if (b.done) continue;
      const owner = b.owner && world.players[b.owner];
      const team = owner && owner.team;
      for (const t of targets) {
        if (wrecked(t) || t.state.down > 0 || (team && t.team && t.team.id === team)) continue;
        const bx = toShipX(t, b.x), by = toShipY(t, b.y);
        if (!t.sim.hitsShip(bx, by)) continue;
        const before = t.state.hull;
        t.sim.impact(bx, by, P.BOMB_POWER);
        b.done = true; // (the bomb went off inside her)
        D.puff(b.x, b.y, '#ff8c42', 20);
        if (team) { M.count(team, 'bombs'); M.count(team, 'dmg', Math.max(0, before - t.state.hull)); }
        break;
      }
    }
  }

  // ---- the arena's soft wall: a wind pushes a ship back that goes too far behind the start, too far along, or too high ----
  function arena(dt) {
    const A = V().ARENA, map = world.course && world.course.map, st = map && map.start;
    if (!st) return;
    for (const sh of sideShips()) {
      if (sh.state.down > 0) continue;
      const mx = toWorldX(sh, sh.layout.refPoint.x), my = toWorldY(sh, sh.layout.refPoint.y);
      const x0 = st.x - A.BACK, x1 = st.x + A.FRONT, top = st.y - A.TOP;
      if (mx < x0) sh.pose.x += Math.min(A.PUSH_MAX, (x0 - mx) * A.PUSH) * dt;
      else if (mx > x1) sh.pose.x -= Math.min(A.PUSH_MAX, (mx - x1) * A.PUSH) * dt;
      if (my < top) {
        sh.pose.y += Math.min(A.PUSH_MAX, (top - my) * A.PUSH) * dt;
        sh.ctx.ship.vy = Math.min(0, sh.ctx.ship.vy || 0); // (up is positive: she stops rising)
      }
    }
  }

  // ---- the step ----
  // Before the ships' stage: the rivals.
  function pre(dt) {
    if (!M.on) return;
    refreshRivals(dt);
  }
  // After the ships' stage: the rules of the phase. (Runs every step, a vote open or not.)
  function post(dt) {
    if (!M.on) return;
    M.t += dt;
    const P = V();
    if (M.phase === 'count') {
      if (M.t >= P.COUNT_IN) {
        D.launch();
        M.phase = 'fight';
        M.t = 0;
        world.ev.warn = 2;
        world.ev.warnText = 'FIGHT!';
        world.sfxQ.push(['bell']);
      }
    } else if (M.phase === 'fight') {
      M.fightT += dt;
      arena(dt);
      const [r, b] = [shipOfTeam('red'), shipOfTeam('blue')];
      if (M.capturedBy) close(M.capturedBy, 'captured');
      else if (wrecked(r) && wrecked(b)) close(null, 'both wrecked');
      else if (wrecked(r) || wrecked(b)) close(wrecked(r) ? 'blue' : 'red', 'sunk');
      else if (M.fightT >= P.ROUND_TIME) {
        const d = hullPct(r) - hullPct(b);
        close(Math.abs(d) < 0.5 ? null : d > 0 ? 'red' : 'blue', 'timeout');
      }
    } else if (M.phase === 'finale') {
      M.slow = finaleSlow();
      arena(dt);
      if (M.t >= P.FINALE) {
        M.slow = 1;
        M.phase = M.winner ? 'over' : 'between';
        M.t = 0;
      }
    } else if (M.phase === 'between') {
      if (M.t >= P.BETWEEN) startRound();
    } else if (M.phase === 'over') {
      if (M.t >= P.BETWEEN && !world.vote) openRematch();
    }
  }

  Object.assign(M, { enter, leave, begin, startRound, swapTeam, addBots, teamForJoiner, toLobby, applyPicks, pre, post, crossFire, shipOfTeam, crewOfTeam, assign, refreshRivals });
  return M;
}
