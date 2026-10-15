// THE GROUND (CASTLE.md package A0, config.AWAY): crew leave the ship and walk the ground. ENABLED false (NO_AWAY=1 in a tool) = the old game.
//
//   GROUND       what a man can stand on, from the map: the rock of any open sky (the grid: plazas, platforms, hills, islands, outposts) and, on a ring map, the CURTAIN-WALL WALKWAYS (face.walk) with a WALL LADDER at each end.
//                Landing: ground.js is an airborne.js provider (a parachute, a hookshot swing, the crew cannon, a vault): the walkways and the rock under a flyer are landing surfaces ('ground:...') for people.
//                Landed, he is a world object pinned to the ground like the ring's gallery boarders (player.fly, player.on = { away: true, mode }): modes walk / ladder (a wall ladder) / rope (the ship's rope ladder) / home.
//   ROPE LADDER  an action on the lowest deck (ropeSpot): with the deck at the foot of the ship within LADDER.REACH of the ground the ladder is lowered and hangs to near the ground; climb down it, climb it back while the helm hovers.
//   FLARE        the away man's Action: calls the ship (the TV and the helm's phone mark him, the bot helm comes and hovers, the ladder drops by itself).
//   LEASH        the ship further than STRAND.LEASH, or the stop ended with him on the ground: STRANDED, STRAND.TIME s, then he walks home (out of the game) and rejoins at the next dock for HOME.COST salvage. Bots never strand.
//   TRIPS        (tools, AWAY.BOT_TRIPS) a bot climbs down the rope, walks to a plaza, fires a flare and comes back: bots.js awayTrip drives the walk to the hatch, step() below drives him on the ground.
//   THE ISLAND   (BOSSES.md C.6c) the Island Titan's island on its back is a DECK that MOVES (S.island = { island: true, moves: true, x0, x1, y }, refreshed every step by syncIsland from the creature): it is a landing place like a wall walk, the rope
//                ladder reaches down to it (groundInfo), a hookshot reeled in to it lands you on it (landOn) and a man on it is carried by its movement (o.lx, the offset from its middle). The crystal on it is the Titan's heart (creatureIsland.js).
//
// state.away = { on, rope, flares, pickups, hold, stats, ... } is the world's record of it (the TV draws from it; the tools read it). Every number is config.AWAY. Nothing here wobbles.
import { config } from '../../config.js';
import { mainShip, shipOf, transfer } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { floorBelow, solidAt } from './maps.js';
import { pop } from './popups.js';
import { createObjectives } from './objectives.js'; // (CASTLE.md A1: the castle objectives on the ground, config.AWAY.OBJECTIVES)
import { createTreasure } from './treasure.js'; // (CASTLE.md A2: the outposts' vaults, chests and guards, config.AWAY.TREASURE)
import { createDerelicts } from './derelicts.js'; // (LOOP.md G5: wrecks to board and strip for named parts, config.DERELICT)
import { islandOf, islandAct, islandUi, islandJob, islandBotGoal, islandTrip } from './creatureIsland.js'; // (BOSSES.md C.6c: the Island Titan's island is a deck that moves with it, and the crystal on it)

const A = () => config.AWAY;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// The ground top under a point: the first rock below (x, fromY), or null where there is none (inside rock, off the map, open sky to the bottom).
export function groundAt(map, x, fromY) {
  if (!map || solidAt(map, x, fromY)) return null;
  const y = floorBelow(map, x, fromY);
  return y >= map.H * map.CELL - 1 ? null : y;
}
// The top of the rock face a point has caught on: climbing from (x, y) up through rock to open air, no more than maxUp px. Null if there is none (the hookshot's reel-in uses it to stand a man on the ledge).
export function rockTop(map, x, y, maxUp) {
  if (!map) return null;
  for (let d = 0; d <= maxUp; d += map.CELL / 4) if (!solidAt(map, x, y - d)) return (Math.floor((y - d) / map.CELL) + 1) * map.CELL;
  return null;
}

export function createGround({ state, puff, phoneFx }) {
  let deps = { release: () => {}, pay: () => {} };
  const mapNow = () => (state.course && state.course.map) || null;
  const S = (state.away = { on: false, map: null, decks: [], island: null, ladders: [], rope: { out: false, len: 0, gap: Infinity, x: 0, y: 0, users: 0, idle: 0, d: 0, sx: 0 }, flares: [], pickups: [], hold: null, clock: 0, tripCd: 0, stripCd: 0, stats: { landings: 0, wall: 0, ladders: 0, ropes: 0, ropeDown: 0, ropeUp: 0, flares: 0, strands: 0, homes: 0, returns: 0, pickups: 0, hooks: 0, trips: 0, stepOffs: 0 } });
  const sfx = (...a) => state.sfxQ && state.sfxQ.push(a);
  const say = (text, hold = 3.5, at) => state.say && state.say('away', text, 6, hold, at);
  const upper = (p) => String(p.name || 'CREW').toUpperCase();

  // ---------- who and where ----------
  const main = () => mainShip(state);
  const crew = () => Object.values(state.players).filter((p) => !p.enemy && !p.mate && p.connected !== false && shipOf(state, p) === main());
  const awayList = () => Object.values(state.players).filter((p) => p.on && p.on.away);
  const onGround = () => awayList().filter((p) => p.on.mode !== 'home');
  const eligible = (p) => !p.enemy && !p.mate && !p.hj && shipOf(state, p) === main() && (!p.bot || !!p.trip);
  // Is there an away team at all now? Open sky with ground in it, enough crew, no Versus (a lair's sea, a cave, the arena have no ground to walk).
  const worldOn = () => {
    const A_ = A(), map = mapNow();
    return A_.ENABLED && !config.PVP.ENABLED && !!map && !!map.open && (!map.lair || map.creature === 'titan') && !map.arena && state.phase === 'flying' && !state.ship.down && crew().length >= A_.MIN_CREW;
  };
  const enabled = () => S.on;
  const obj = createObjectives({ state, S, host: { phoneFx, puff, deps: () => deps, onGround: () => onGround(), groundAt: (x, y) => groundAt(mapNow(), x, y) } }); // (A1: S.obj; its steps are called below)
  const treHost = { phoneFx, puff, deps: () => deps, onGround: () => onGround(), groundAt: (x, y) => groundAt(mapNow(), x, y), layout: () => main().layout, mine: (p) => shipOf(state, p) === main() };
  const tre = createTreasure({ state, S, host: treHost }); // (A2: S.tre, the outposts' treasure)
  const der = createDerelicts({ state, S, tre, host: { phoneFx, puff, deps: () => deps, onGround: () => onGround(), mine: (p) => shipOf(state, p) === main(), bats: (from, n) => deps.bats && deps.bats(from, n), ropeSpot: () => ropeSpot() } }); // (G5: S.der, the wrecks you strip for named parts)
  treHost.partIn = (...a) => der.partIn(...a); // (...a part crate that comes aboard, or is paid at the stop's end, is the wreck's business)
  treHost.partPaid = (...a) => der.partPaid(...a);

  // ---------- the map ----------
  // A new map: the walkways and their ladders (ring maps); anybody still on the old ground is brought home (the stop ended).
  function begin(map) {
    reset();
    S.map = map;
    S.decks = [];
    S.island = null;
    S.islandSeen = false;
    S.ladders = [];
    S.flares.length = 0;
    S.pickups.length = 0;
    S.hold = null;
    S.rope.out = false;
    S.rope.users = 0;
    obj.begin(map); // (A1: the objectives this ring offers; none on any other map)
    tre.begin(map); // (A2: a vault for each outpost of an open-sky raid; none on any other map)
    der.begin(map); // (G5: the wrecks of this map, and their decks)
    if (!A().ENABLED || !map || !map.ring) return;
    for (const f of map.ring.faces) {
      if (!f.walk) continue;
      const deck = { id: 'wall' + f.i, face: f.i, x0: f.walk.x0, x1: f.walk.x1, y: f.walk.y };
      S.decks.push(deck);
      for (const x of [deck.x0 + 30, deck.x1 - 30]) S.ladders.push({ id: 'lad' + f.i + '_' + (x < f.x ? 'l' : 'r'), deck, x, y0: deck.y, y1: f.y, face: f.i });
    }
  }
  // Everybody on the ground goes back aboard where they started (a new map, a limp home, a new game): no cost, nothing said.
  function reset() {
    for (const p of awayList()) rejoin(p, true);
    S.flares.length = 0;
    S.pickups.length = 0;
    S.hold = null;
    S.rope.out = false;
    obj.reset(); // (A1)
    tre.reset(); // (A2)
    der.reset(); // (G5)
  }

  // ---------- the Titan's island (C.6c) ----------
  // The island as a deck that moves: made, refreshed and removed every step from the creature (creatureIsland.js islandOf); its middle is where a man on it is measured from.
  function syncIsland() {
    const isl = S.on ? islandOf(state) : null, old = S.island;
    if (isl) {
      if (!old) { S.island = isl; S.decks.push(isl); } else Object.assign(old, { x0: isl.x0, x1: isl.x1, y: isl.y, depth: isl.depth, cr: isl.cr });
    } else if (old) {
      S.decks = S.decks.filter((d) => d !== old);
      S.island = null;
    }
  }
  const midOf = (dk) => (dk.x0 + dk.x1) / 2;
  // The ground under a point, rock or the island: { y, deck } (deck = the island's record when that is what is below) or null.
  function groundInfo(x, fromY) {
    const g = groundAt(mapNow(), x, fromY), isl = S.island;
    let best = isl && x >= isl.x0 && x <= isl.x1 && fromY <= isl.y + 40 && (g == null || isl.y < g) ? { y: isl.y, deck: isl } : null;
    for (const dk of S.decks) if (dk.derelict && x >= dk.x0 && x <= dk.x1 && fromY <= dk.y + 40 && (g == null || dk.y < g) && (!best || dk.y < best.y)) best = { y: dk.y, deck: dk }; // (G5: a wreck's deck is a floor the rope ladder reaches too)
    return best || (g == null ? null : { y: g, deck: null });
  }

  // ---------- the rope ladder ----------
  // Where the hatch is on the lowest deck: the widest of the lowest platforms, away from the bomb bay's doors.
  function ropeSpot(L = main().layout) {
    let d = 0;
    L.platforms.forEach((q, i) => { const b = L.platforms[d]; if (q.y > b.y + 1 || (Math.abs(q.y - b.y) <= 1 && q.x1 - q.x0 > b.x1 - b.x0)) d = i; });
    const pl = L.platforms[d];
    const x = L.bombBay && Math.abs(L.bombBay.jumpX - (pl.x0 + pl.x1) / 2) < 160 ? pl.x0 + Math.min(70, (pl.x1 - pl.x0) / 3) : (pl.x0 + pl.x1) / 2;
    return { d, x, y: pl.y };
  }
  // The rope's top and the ground under it, each frame.
  function ropeStep(dt) {
    const sh = main(), R = S.rope, map = mapNow(), K = A().LADDER;
    const sp = ropeSpot(sh.layout);
    R.d = sp.d;
    R.sx = sp.x;
    R.x = toWorldX(sh, sp.x);
    R.y = toWorldY(sh, sp.y + 24);
    const gi = map ? groundInfo(R.x, R.y) : null, g = gi ? gi.y : null;
    R.ground = g;
    R.groundDeck = gi ? gi.deck : null; // (the Titan's island when that is what the rope reaches)
    R.gap = g == null ? Infinity : g - R.y;
    R.users = awayList().filter((p) => p.on.mode === 'rope').length + obj.climbers() + der.onDeckCount(); // (A1: freed prisoners climbing keep it down too) (G5: so do men on the wreck it reaches)
    if (R.out) {
      R.len = clamp(R.gap - K.NEAR, 0, K.LEN_MAX);
      R.idle = R.users ? 0 : R.idle + dt;
      if (!R.users && (!S.on || R.gap > K.REACH + 260 || R.idle > K.KEEP)) R.out = false;
    } else R.len = 0;
  }
  function lowerRope(p) {
    const R = S.rope, K = A().LADDER;
    if (R.out) return true;
    if (!S.on || R.gap > K.REACH) return false;
    R.out = true;
    R.idle = 0;
    R.len = clamp(R.gap - K.NEAR, 0, K.LEN_MAX);
    S.stats.ropes++;
    if (p && !p.bot) say('THE ROPE LADDER IS DOWN!', 2.5);
    sfx('clang', false);
    return true;
  }
  // The Action button on the lowest deck at the hatch (shipSim.js useFor): lower the ladder, or climb down it; null elsewhere. Bots get it only on a trip.
  function ladderAction(player, legacy) {
    if (!S.on || (legacy && !player.trip)) return null;
    const sp = ropeSpot(), R = S.rope, K = A().LADDER;
    if (player.d !== sp.d || Math.abs(player.x - sp.x) > K.REACH_X) return null;
    if (R.out) return { type: 'ladder', label: 'CLIMB DOWN THE ROPE LADDER' };
    if (R.gap <= K.REACH) return { type: 'ladder', label: 'LOWER THE ROPE LADDER' };
    return { type: 'need', label: R.gap === Infinity ? 'ROPE LADDER: no ground below' : 'ROPE LADDER: fly lower (' + Math.ceil((R.gap - K.REACH) / 50) * 50 + ' px)' };
  }
  // He takes hold of the rope at its hatch and starts down.
  function useLadder(sh, p) {
    if (!lowerRope(p) && !S.rope.out) return false;
    return mount(sh, p, 0);
  }
  function mount(sh, p, s) {
    const R = S.rope;
    if (!R.out) return false;
    const wasGround = p.on && p.on.away;
    p.on = { away: true, mode: 'rope', s: clamp(s, 0, R.len), edgeT: 0, flareCd: wasGround ? p.on.flareCd : 0, flareT: wasGround ? p.on.flareT : 0, since: S.clock };
    p.fly = true;
    p.air = false;
    p.jz = 0;
    p.vx = 0;
    p.fvx = p.fvy = 0;
    p.lock = null;
    p.conn = null;
    p.hook = null;
    p.climb = true;
    p.moving = false;
    p.x = R.x;
    p.y = R.y + p.on.s;
    S.stats.ropeDown += wasGround ? 0 : 1;
    return true;
  }

  // ---------- landing, leaving, going home ----------
  // The airborne provider (shipSim.js addShip): the walkways and the rock under whoever is flying are landing places for this ship's people.
  function surfaces(sh) {
    if (!S.on || !sh.main) return [];
    const out = [];
    for (const dk of S.decks) {
      const a = toShipX(sh, dk.x0), b = toShipX(sh, dk.x1);
      out.push({ id: 'ground:' + dk.id, y: toShipY(sh, dk.y), x0: Math.min(a, b), x1: Math.max(a, b), onLand: (p) => land(sh, p, dk) });
    }
    const map = mapNow();
    if (map) {
      for (const q of Object.values(state.players)) {
        if (!q.fly || q.on || !eligible(q) || q.hj) continue;
        const gy = groundAt(map, q.x, q.y - A().LOOKBACK - Math.max(0, q.fvy || 0) * 0.04); // (from a little above where he was a step ago, so a fast faller is not already inside the rock)
        if (gy == null) continue;
        out.push({ id: 'ground:rock', y: toShipY(sh, gy), x0: toShipX(sh, q.x) - 30, x1: toShipX(sh, q.x) + 30, only: eligible, onLand: (p) => land(sh, p, null) });
      }
    }
    return out;
  }
  // Landed (airborne.js put him on the surface in SHIP coordinates): he stands on the ground now, a world object.
  function land(sh, p, deck) {
    const wx = toWorldX(sh, p.x), wy = toWorldY(sh, p.y);
    if (!eligible(p)) { // (a bot that drifted here: the old fall back aboard)
      p.x = toShipX(sh, wx);
      p.y = toShipY(sh, wy);
      p.fall = true;
      p.tumble = true;
      p.tvy = 200;
      p.tvx = 0;
      p.carry = null;
      return;
    }
    landAt(p, wx, wy, deck);
  }
  // A man comes down on the ground at world (wx, wy): on a wall walk (deck), the rock (null) or the Titan's island.
  function landAt(p, wx, wy, deck) {
    p.on = { away: true, mode: 'walk', deck: deck || null, gy: wy, s: 0, edgeT: 0, flareCd: 0, flareT: 0, strand: 0, gone: false, since: S.clock };
    if (deck && deck.moves) p.on.lx = wx - midOf(deck); // (a moving deck carries him: his place is measured from its middle)
    p.fly = true;
    p.air = false;
    p.jz = 0;
    p.fvx = p.fvy = 0;
    p.x = wx;
    p.y = wy;
    p.rot = 0;
    p.chute = 0;
    p.chuteOpen = false;
    p.chuteOk = false;
    p.cannon = false;
    p.tossed = false;
    p.noLand = 0;
    p.hook = null;
    p.climb = false;
    S.stats.landings++;
    if (deck && deck.island) { // the Titan's back: the first man on it makes the Book (once a stop)
      S.stats.island = (S.stats.island || 0) + 1;
      if (!S.islandSeen && state.moment) { S.islandSeen = true; state.moment('titan-island', { who: [p], where: null, data: { creature: deck.cr ? deck.cr.name : 'the Titan' } }); }
      if (!p.bot) { pop(state, wx, wy - 170, "ON THE TITAN'S BACK!", '#7fe8ff', 1.4); phoneFx(p, "You are on the Titan's island! Walk to the glowing CRYSTAL and HACK it. JUMP leaps off.", [30, 40, 30]); }
      return;
    }
    if (deck) S.stats.wall++;
    if (deck && deck.derelict) return; // (G5: derelicts.js says "ON THE WRECK!" the first time somebody stands on one)
    if (!p.bot) { pop(state, wx, wy - 170, deck ? 'ON THE WALL!' : 'LANDED!', '#ffd23f', 1.1); phoneFx(p, 'On the ground! FIRE FLARE calls the ship.', [30, 40, 30]); }
  }
  // A hookshot reeled in to the island (creatureIsland.js / creatureBoard.js creatureAnchor): he hops up onto it. False if he cannot (no away team, a bot off a trip).
  function landOn(p) {
    const isl = S.island;
    if (!S.on || !isl || !eligible(p)) return false;
    landAt(p, clamp(p.x, isl.x0 + 60, isl.x1 - 60), isl.y, isl);
    return true;
  }
  // Off the ground into the air: a hop off a wall, an edge, a hook, a rope let go. dir = the world way he leaps.
  function leave(sh, p, dir, how) {
    const o = p.on;
    p.on = null;
    p.fly = true;
    p.air = false;
    p.climb = false;
    p.moving = false;
    p.hook = how === 'hook' ? p.hook : null;
    p.fvx = (dir || 0) * A().LEAP.VX;
    p.fvy = how === 'hook' ? 0 : how === 'jump' ? -A().LEAP.VY : A().LEAP.DROP_VY;
    p.y += how === 'edge' ? 3 : 0;
    p.apex = toShipY(sh, p.y);
    p.lsy = p.apex;
    p.stag = 0;
    p.chute = 0;
    p.noLand = how === 'jump' ? 0.25 : how === 'hook' ? 0.2 : 0.08;
    p.regrabCd = 0;
    S.stats.stepOffs++;
    void o;
  }
  // Back aboard: the rope ladder's hatch (a climb), or the medical-bay spot when he is brought home.
  function rejoin(p, quiet, free) {
    const sh = main(), sp = ropeSpot(sh.layout), rv = sh.layout.reviveSpot();
    const o = p.on;
    obj.onAboard(p, o, free || quiet); // (A1: a man who climbs aboard with the great banner has stolen it)
    tre.onAboard(p, o, free || quiet); // (A2: ...and one who climbs aboard with a chest still has it to stow)
    p.on = null;
    p.hook = null;
    p.trip = null;
    p.climb = false;
    p.air = false;
    p.cannon = false;
    p.chute = 0;
    p.chuteOpen = false;
    p.chuteOk = false;
    p.tumble = false;
    p.rot = 0;
    p.fvx = p.fvy = 0;
    const atHatch = !free && o && o.mode === 'rope';
    transfer(state, p, sh, atHatch ? sp.d : rv.d, atHatch ? sp.x : rv.x);
    p.moving = false;
    p.uk = null;
    S.stats.returns++;
    if (!quiet && !p.bot) { phoneFx(p, 'Back aboard!', [30, 40, 30]); pop(state, toWorldX(sh, p.x), toWorldY(sh, p.y) - 160, 'BACK ABOARD!', '#8fe388', 1); }
  }
  // Out of sight: he walks home; the dock brings him back (and takes a little salvage).
  function walkHome(p) {
    const sh = main(), map = mapNow();
    obj.onGone(p); // (A1: the banner he carried is dropped)
    tre.onGone(p); // (A2: ...and the chest, where he stood)
    const flare = S.flares.findIndex((f) => f.id === p.id);
    if (flare >= 0) S.flares.splice(flare, 1);
    p.on = { away: true, mode: 'home', t: 0, flareCd: 0, flareT: 0 };
    p.fly = true;
    p.hook = null;
    p.climb = false;
    p.moving = false;
    p.trip = null;
    p.x = toWorldX(sh, sh.layout.midPoint.x);
    p.y = (map ? map.H * map.CELL : 12000) + 6000; // (far below the map: nobody sees him; nothing touches him)
    S.stats.homes++;
    say(upper(p) + ' WALKED HOME - BACK AT THE NEXT DOCK', 4);
    phoneFx(p, 'You walk home. You rejoin at the next dock.', [60, 40, 60]);
    p.uk = null;
  }
  // The dock (simulation.js startDock): everybody who walked home is aboard again; the salvage is paid.
  function dockReturn(free) {
    let n = 0;
    for (const p of awayList()) if (p.on.mode === 'home') { rejoin(p, true, true); n++; }
    if (n && !free) deps.pay(n * A().HOME.COST);
    return n;
  }
  // The ship's stop ended (simulation.js onMarker): while somebody is on the ground the scorecard waits for them (STRANDED, STRAND.TIME s), then goes on.
  function holdStop(m) {
    if (!S.on && !onGround().length) return false;
    for (const p of onGround()) if (p.bot) rejoin(p, true, true); // (bots never strand)
    const left = onGround().filter((p) => !p.bot);
    if (!left.length) return false;
    S.hold = { m, t: 0 };
    return true;
  }

  // ---------- the walk ----------
  const wdir = (p) => (p.bot ? p.jx || 0 : p.jxs !== undefined ? p.jxs || 0 : (p.jx || 0) * main().pose.f); // (people: the stick on the screen; bots: set in the world's way by the trip)
  function stepOff(sh, p, dir, how) {
    leave(sh, p, dir, how);
    if (!p.bot) { p.chuteOk = true; phoneFx(p, 'You stepped off! Press ACTION for the parachute', [60, 40, 60]); }
  }
  function ladderNear(o, p, up) {
    return S.ladders.find((l) => Math.abs(p.x - l.x) < A().HAND && (up ? !o.deck && Math.abs(o.gy - l.y1) < 40 : o.deck === l.deck));
  }
  // One step for a man on the ground (shipSim.js, where a walker's step would be). ctl = { hookshot, holdOk }.
  function step(sh, p, dt, ctl) {
    const o = p.on, K = A(), map = mapNow();
    const tap = p.actQ;
    p.actQ = false;
    p.grabQ = false;
    p.lock = null;
    p.conn = null;
    p.fvx = p.fvy = 0;
    p.rot = 0;
    p.jz = 0;
    if (o.mode === 'home') { p.act = { type: 'wait', label: 'WALKING HOME' }; p.grabAct = null; p.atkQ = false; p.jumpQ = false; return; }
    if (!map) return;
    o.flareCd = Math.max(0, (o.flareCd || 0) - dt);
    if (p.bot) botDrive(sh, p, o, dt);
    const dir = wdir(p), jy = p.jy || 0;
    const jump = p.jumpQ;
    p.jumpQ = false;
    if (p.atkQ && obj.shove(p)) p.atkQ = false; // (A1: soldiers on him: ATTACK shoves them back before it fires anything)
    else if (p.atkQ && tre.attack(p)) p.atkQ = false; // (A2: ...a vault guard likewise; with nothing to shove, ATTACK puts a chest down)
    // the hookshot: ATTACK fires it; once it catches he is a swinger again (airborne.js and hookshot.js take him)
    if (ctl.hookshot) {
      if (p.atkQ && p.carry === 'hookshot' && !p.bot) ctl.hookshot.onAttack(p);
      ctl.hookshot.fly(p, dt);
      if (p.hook && p.hook.phase === 'caught') { S.stats.hooks++; return leave(sh, p, 0, 'hook'); }
    }
    p.atkQ = false;
    if (Math.abs(dir) > 0.15) p.face = dir < 0 ? -1 : 1;
    if (o.mode === 'walk') {
      let moved = false;
      const walk = K.WALK * obj.speedMul(p) * tre.speedMul(p); // (A1: the great banner is heavy; A2: so is a chest)
      if (o.deck) {
        if (o.deck.moves && o.lx !== undefined) p.x = midOf(o.deck) + o.lx; // (the Titan's island moves: it carries him along)
        const nx = clamp(p.x + dir * walk * dt, o.deck.x0, o.deck.x1);
        moved = Math.abs(dir) > 0.15 && nx !== p.x;
        if (Math.abs(dir) > 0.15) p.x = nx;
        o.gy = o.deck.y;
        p.y = o.gy;
        if (o.deck.moves) o.lx = p.x - midOf(o.deck);
      } else {
        if (Math.abs(dir) > 0.15) {
          const nx = p.x + dir * walk * dt, hy = o.gy - K.STEP;
          if (solidAt(map, nx, hy)) o.edgeT = 0; // (a rock face: stopped)
          else {
            const gy = groundAt(map, nx, hy);
            if (gy == null || gy - o.gy > K.DROP) { // (an edge)
              o.edgeT += dt;
              if (o.edgeT >= K.EDGE_HOLD) return stepOff(sh, p, dir, 'edge');
            } else { p.x = nx; o.gy = gy; o.edgeT = 0; moved = true; }
          }
        } else o.edgeT = 0;
        p.y += clamp(o.gy - p.y, -A().SLOPE * dt, A().SLOPE * dt);
      }
      p.moving = moved;
      p.climb = false;
      // the wall ladders, the rope's foot
      if (jy < -0.5 && !p.bot) {
        const lad = ladderNear(o, p, true);
        if (lad) { o.mode = 'ladder'; o.lad = lad; o.s = 1; p.x = lad.x; p.climb = true; S.stats.ladders++; }
        else if (S.rope.out && Math.abs(p.x - S.rope.x) < K.LADDER.GRAB && p.y - (S.rope.y + S.rope.len) < K.LADDER.GRAB_Y && p.y > S.rope.y) mount(sh, p, S.rope.len);
      }
      if (jy > 0.5 && o.deck && !p.bot) {
        const lad = ladderNear(o, p, false);
        if (lad) { o.mode = 'ladder'; o.lad = lad; o.s = 0; p.x = lad.x; p.climb = true; S.stats.ladders++; }
      }
      if (jump && o.deck) return stepOff(sh, p, dir || p.face || 1, 'jump');
    } else if (o.mode === 'ladder') {
      const lad = o.lad, h = lad.y1 - lad.y0;
      if (Math.abs(jy) > 0.4) o.s = clamp(o.s + (jy * K.CLIMB * dt) / h, 0, 1);
      p.x = lad.x;
      p.y = lad.y0 + o.s * h;
      p.climb = true;
      p.moving = false;
      if (o.s <= 0 && jy < -0.4) { o.mode = 'walk'; o.deck = lad.deck; o.gy = lad.deck.y; p.y = o.gy; p.x = lad.x + (lad.x < (lad.deck.x0 + lad.deck.x1) / 2 ? 24 : -24); p.climb = false; }
      else if (o.s >= 1 && jy > 0.4) { o.mode = 'walk'; o.deck = null; o.gy = lad.y1; p.y = o.gy; p.x = lad.x + (lad.x < (lad.deck.x0 + lad.deck.x1) / 2 ? -24 : 24); p.climb = false; }
      else if (jump) return stepOff(sh, p, dir || p.face || 1, 'jump');
    } else if (o.mode === 'rope') {
      const R = S.rope;
      if (!R.out) { o.s = 0; }
      if (Math.abs(jy) > 0.4) o.s = clamp(o.s + (jy * K.LADDER.CLIMB * tre.climbMul(p) * dt), 0, R.len);
      o.s = clamp(o.s, 0, R.len);
      p.x = R.x;
      p.y = R.y + o.s;
      p.climb = true;
      p.moving = false;
      if (o.s <= 0 && jy < -0.4) { S.stats.ropeUp++; rejoin(p, false); return; }
      if (o.s >= R.len - 0.5 && jy > 0.4 && R.ground != null && R.ground - p.y < K.LADDER.GRAB_Y + 60) { // (the foot of the rope: step off onto the ground)
        o.mode = 'walk';
        o.deck = R.groundDeck || null; // (the foot of the rope on the Titan's island: he walks that moving deck)
        o.gy = R.ground;
        if (o.deck && o.deck.moves) o.lx = p.x - midOf(o.deck);
        p.climb = false;
        p.y = Math.min(R.ground, p.y + 40);
        o.since = S.clock;
      } else if (jump) return stepOff(sh, p, dir || p.face || 1, 'jump');
    }
    // the Action button
    if (o.mode === 'walk' || o.mode === 'ladder') {
      const cd = o.flareCd;
      const ov = o.mode === 'walk' && o.deck && o.deck.island ? islandAct(state, p, dt, ctl) : o.mode === 'walk' && o.deck && o.deck.derelict ? der.act(p, dt, ctl) || tre.act(p, dt, ctl) : o.mode === 'walk' && !o.deck ? tre.act(p, dt, ctl) || obj.act(p, dt, ctl) : null; // (C.6c: on the Titan's island the button hacks the crystal) (G5: on a wreck it unbolts a part, or lifts one that lies there) (A1: at an objective the button works it - a hold; away from one it is the flare) (A2: at a chest it grabs or helps carry it)
      if (ov) p.act = ov;
      else {
        p.act = cd > 0 ? { type: 'wait', label: 'FLARE READY IN ' + Math.ceil(cd) + 's' } : { type: 'flare', label: 'FIRE FLARE' };
        if (tap && !cd) fireFlare(p, o);
      }
    } else p.act = { type: 'wait', label: 'CLIMB: stick up / down' };
    p.grabAct = null;
    if (!(p.act && p.act.hold)) p.fire = false; // (a hold keeps its button down until the phone lets go)
  }

  function fireFlare(p, o) {
    o.flareCd = A().FLARE.COOLDOWN;
    o.flareT = A().FLARE.LIFE;
    o.strand = 0;
    o.gone = o.gone && false;
    S.flares = S.flares.filter((f) => f.id !== p.id);
    S.flares.push({ id: p.id, name: p.name, x: p.x, y: p.y, t: A().FLARE.LIFE });
    S.stats.flares++;
    puff(p.x, p.y - 80, '#ff5a3c', 14);
    pop(state, p.x, p.y - 220, 'FLARE!', '#ff5a3c', 1.4);
    sfx('alarm');
    say('FLARE! PICK UP ' + upper(p) + ' - HOVER LOW OVER HIM', 4, { role: 'helm' });
    phoneFx(p, 'Flare up! Stay clear of the castle guns and wait for the ship.', [50, 40, 50]);
  }

  // ---------- bots (tools: AWAY.BOT_TRIPS) ----------
  // The bot on the ground: walk to the plaza's middle, look round STAY s, fire a flare, wait under where the ship comes, climb the rope. Bots never strand: after RETURN_MAX s with no way home he is taken home.
  function botDrive(sh, p, o, dt) {
    const t = (p.trip ||= { t: 0, goal: null, ready: false, flared: false });
    t.t += dt;
    p.jx = 0;
    p.jy = 0;
    p.fire = false;
    const R = S.rope, K = A();
    if (o.mode === 'rope') { p.jy = t.ready ? -1 : 1; return; } // (down the rope to the foot; or up it)
    if (o.mode === 'ladder') { p.jy = 0; return; }
    if (obj.shoveReady(p) || tre.shoveReady(p)) p.atkQ = true; // (A1: soldiers on him: he shoves; A2: so does a vault guard)
    if (!t.ready && t.strip) { // (G5: this trip is for a part on a wreck: walk to the nearest bolted one, hold the button there; with it in his arms (or none left, or out of time) he goes home)
      const g = der.botGoal(p);
      if (!g.done && o.deck && o.deck.derelict && t.t <= config.DERELICT.BOTS.TIME) {
        p.jx = Math.abs(g.x - p.x) > 30 ? Math.sign(g.x - p.x) : 0;
        p.fire = g.fire;
        return;
      }
      t.ready = true;
      t.t = 0;
      if (!tre.carrying(p)) { if (!o.flareCd) fireFlare(p, o); t.flared = true; }
    }
    if (!t.ready && t.chest) { // (A2: this trip is for a chest: walk to the nearest, hold the button there; with it in his arms (or none left, or out of time) he goes home)
      const g = tre.botGoal(p);
      if (!g.done && t.t <= K.TREASURE.BOT.TIME) {
        p.jx = Math.abs(g.x - p.x) > 30 ? Math.sign(g.x - p.x) : 0;
        p.fire = g.fire;
        return;
      }
      t.ready = true;
      t.t = 0;
      if (!tre.carrying(p)) { if (!o.flareCd) fireFlare(p, o); t.flared = true; }
    }
    if (!t.ready && t.crystal) { // (C.6c: this trip is the Titan's crystal: walk to it along the island, hold the button; broken, or out of time, or the Titan gone = go home)
      const g = islandBotGoal(state, p);
      if (!g.done && o.deck && o.deck.island && t.t <= config.CREATURES.TITAN.CRYSTAL.BOT_TIME) {
        p.jx = Math.abs(g.x - p.x) > 30 ? Math.sign(g.x - p.x) : 0;
        p.fire = g.fire;
        return;
      }
      t.ready = true;
      t.t = 0;
      if (!o.flareCd) fireFlare(p, o);
      t.flared = true;
    }
    if (!t.ready && t.ob) { // (A1: this trip is an objective: walk to its spot and hold the button there; done or out of time = go home)
      const g = obj.botGoal(p, t.ob);
      if (!g.done && t.t <= K.OBJECTIVES.BOT.TIME) {
        p.jx = Math.abs(g.x - p.x) > 30 ? Math.sign(g.x - p.x) : 0;
        p.fire = g.fire;
        return;
      }
      t.ready = true;
      t.t = 0;
      if (!o.flareCd) fireFlare(p, o);
      t.flared = true;
    }
    if (!t.ready) {
      if (t.goal == null) t.goal = plazaMid(p.x) ?? p.x;
      p.jx = Math.abs(t.goal - p.x) > 40 ? Math.sign(t.goal - p.x) : 0;
      if (Math.abs(t.goal - p.x) <= 40 || t.t > K.BOT.STAY * 2) {
        t.look = (t.look || 0) + dt;
        if (t.look >= K.BOT.STAY) { t.ready = true; t.t = 0; if (!o.flareCd) fireFlare(p, o); t.flared = true; }
      }
      return;
    }
    // heading home: under the foot of the rope when it hangs, else under where the ship is
    if (R.out && R.len > 0) {
      const dx = R.x - p.x;
      p.jx = Math.abs(dx) > 14 ? Math.sign(dx) : 0;
      if (Math.abs(dx) < K.LADDER.GRAB * 0.6 && p.y - (R.y + R.len) < K.LADDER.GRAB_Y && p.y > R.y) mount(sh, p, R.len);
    } else {
      const dx = R.x - p.x;
      p.jx = Math.abs(dx) > 120 && Math.abs(dx) < 2400 ? Math.sign(dx) : 0;
    }
    if (t.t > K.BOT.RETURN_MAX) rejoin(p, true, true);
  }
  // The middle of the plaza nearest to x on a ring map (null elsewhere).
  function plazaMid(x) {
    const r = state.course && state.course.ring;
    if (!r) return null;
    let best = null;
    for (const f of r.faces) for (const pz of (state.course.map.ring.faces[f.i].plazas || [])) { const m = (pz.x0 + pz.x1) / 2; if (best == null || Math.abs(m - x) < Math.abs(best - x)) best = m; }
    return best;
  }
  // A bot may start a trip: tools only, a ring map, the ladder can reach a plaza, nobody else away, the gap since the last trip.
  // G5: also a SALVAGE RUN's bots (config.DERELICT.BOTS.IN_RUN), a few at a time, to strip a wreck under the rope ladder.
  const tripsOn = () => A().BOT_TRIPS || der.botsGo();
  function tripWanted(p) {
    if (!tripsOn() || !S.on || S.hold || state.ship.down) return false;
    if (p.mate || p.ko > 0 || p.fall || p.fly || p.lock || p.dare || p.hj || p.conn != null || p.swing || p.onGunship) return false;
    if (der.tripWanted()) return S.stripCd <= 0 && awayList().length + crew().filter((q) => q.trip && !(q.on && q.on.away)).length < config.DERELICT.BOTS.MAX_AWAY;
    if (!A().BOT_TRIPS || S.tripCd > 0) return false;
    if (awayList().length || crew().some((q) => q.trip)) return false;
    const R = S.rope, K = A().LADDER, r = state.course && state.course.ring;
    if (S.island && R.groundDeck === S.island && R.gap <= K.REACH - 20 && islandTrip(state)) return true; // (C.6c: the rope reaches the Titan's island and its crystal is whole: a trip to hack it)
    if (!r && R.gap <= K.REACH - 20 && R.gap !== Infinity && tre.tripChest()) return true; // (A2: an open-sky raid: the rope reaches the ground and a vault is open within a walk)
    if (!r || R.gap > K.REACH - 20 || R.gap === Infinity) return false;
    const m = plazaMid(R.x);
    return m != null && Math.abs(m - R.x) < 1500 && Math.abs(R.ground - r.faces[0].y) < 40; // (the ground under the hatch is a platform: a plaza is near)
  }
  const tripStarted = (p) => { if (der.tripWanted()) { p.trip = { t: 0, goal: null, ready: false, flared: false, walk: true, ob: null, chest: false, crystal: false, strip: true }; S.stripCd = config.DERELICT.BOTS.EVERY; S.stats.trips++; der.stats.trips++; return; } const crystal = !!S.island && S.rope.groundDeck === S.island && islandTrip(state), chest = !crystal && !state.course.ring && !!tre.tripChest(); p.trip = { t: 0, goal: null, ready: false, flared: false, walk: true, ob: crystal ? null : obj.pickFor(p), chest, crystal }; S.tripCd = A().BOT.TRIP_EVERY; S.stats.trips++; if (chest) tre.trips(); }; // (ob: A1, the objective this trip does; chest: A2, this trip fetches a chest)

  // ---------- each step ----------
  function update(dt) {
    if (!A().ENABLED) return;
    S.clock += dt;
    S.on = worldOn();
    S.tripCd = Math.max(0, S.tripCd - dt);
    S.stripCd = Math.max(0, S.stripCd - dt);
    syncIsland(); // (C.6c: the Titan's island, before the rope looks for the ground)
    der.update(dt); // (G5: the wrecks drift, their decks move; before the rope looks for the ground)
    ropeStep(dt);
    obj.update(dt); // (A1: the objectives, the prisoners, the banner, the soldiers)
    tre.update(dt); // (A2: the vaults, the chests, the guards)
    const K = A(), map = mapNow();
    const list = awayList();
    // a flyer with ground below gets a parachute button
    if (S.on && map) for (const q of Object.values(state.players)) {
      if (!q.fly || q.on || !eligible(q) || q.hj || q.bot || q.chute > 0) continue;
      const gi = groundInfo(q.x, q.y), gy = gi ? gi.y : null, want = gy != null && gy - q.y < K.LAND_RANGE && gy - q.y > 120;
      if (want) { q.chuteOk = true; q.awayChute = true; } else if (q.awayChute) { q.chuteOk = false; q.awayChute = false; }
    }
    S.pickups.length = 0;
    for (const p of list) {
      const o = p.on;
      if (p.connected === false && o.mode !== 'home') { walkHome(p); continue; }
      if (o.mode === 'home') { o.t += dt; if (o.t > K.HOME.MAX && !S.hold) rejoin(p, true, true); continue; }
      if (o.deck && ((o.deck.island && S.island !== o.deck) || (o.deck.derelict && !S.decks.includes(o.deck)))) { // C.6c: the Titan is dead (or gone): its island falls from under him - bots are taken home, a man steps off into the air with a parachute button (G5: so does a wreck that goes down)
        const wreck = !!o.deck.derelict;
        if (p.bot) rejoin(p, true, true);
        else { stepOff(main(), p, 0, 'edge'); phoneFx(p, wreck ? 'THE WRECK IS GOING DOWN! Press ACTION for the parachute!' : "THE TITAN'S ISLAND IS FALLING! Press ACTION for the parachute!", [200, 60, 200]); }
        continue;
      }
      o.flareT = Math.max(0, (o.flareT || 0) - dt);
      if (o.mode === 'rope' && p.ko > 0) { o.s = clamp(o.s, 0, S.rope.len); p.x = S.rope.x; p.y = S.rope.y + o.s; } // (out cold on the rope: he hangs on and rides it)
      // the leash: the ship has gone, or the stop has ended
      if (!p.bot) {
        const far = Math.abs(p.x - S.rope.x) > K.STRAND.LEASH || state.ship.down > 0;
        if (far) o.gone = true;
        else if (Math.abs(p.x - S.rope.x) < K.STRAND.LEASH * K.STRAND.BACK) o.gone = false;
        const stranded = o.gone || !!S.hold || !S.on; // (the away team is gone - too few crew left, say - and so is the rope ladder: he cannot get back)
        if (stranded && o.mode !== 'rope') {
          if (!(o.strand > 0)) { S.stats.strands++; say('STRANDED! ' + upper(p) + ' - ' + K.STRAND.TIME + ' s', 4); phoneFx(p, 'STRANDED! Fire a flare, climb the rope or hook the ship.', [80, 40, 80]); }
          o.strand = (o.strand || 0) + dt;
          if (K.STRAND.TIME - o.strand < 10 && !o.warn10) { o.warn10 = true; say(upper(p) + ' WALKS HOME IN 10 s!', 3); }
          if (o.strand >= K.STRAND.TIME) { walkHome(p); continue; }
        } else if (!stranded) { o.strand = 0; o.warn10 = false; }
      } else if (S.hold || !S.on || Math.abs(p.x - S.rope.x) > K.STRAND.LEASH) { rejoin(p, true, true); continue; } // (bots never strand: the stop ended, the ship is far, the away team is gone)
      // the pickup call: a lit flare, or a man who is stranded; the rope drops by itself when the ship hovers there
      if (o.flareT > 0 || o.strand > 0 || (p.bot && p.trip && p.trip.ready)) {
        const g = o.mode === 'walk' && (!o.deck || o.deck.island || o.deck.derelict) ? o.gy : map ? groundAt(map, p.x, p.y) : null;
        S.pickups.push({ id: p.id, name: p.name, x: p.x, y: (g == null ? p.y : g) - K.LADDER.HOVER, gx: p.x, gy: g == null ? p.y : g, flare: o.flareT > 0, bot: !!p.bot });
        if (!S.rope.out && Math.abs(p.x - S.rope.x) < A().LADDER.CALL_NEAR && S.rope.gap <= K.LADDER.REACH) lowerRope(p);
      }
    }
    for (const pk of obj.pickups()) { // (A1: freed prisoners walking to the rope: the helm comes and hovers, the ladder drops by itself)
      S.pickups.push(pk);
      if (!S.rope.out && Math.abs(pk.x - S.rope.x) < K.LADDER.CALL_NEAR && S.rope.gap <= K.LADDER.REACH) lowerRope(null);
    }
    for (const f of S.flares) { f.t -= dt; const p = state.players[f.id]; if (p && p.on && p.on.away && p.on.mode !== 'home') { f.x = p.x; f.y = p.y; } else f.t = 0; }
    S.flares = S.flares.filter((f) => f.t > 0);
    S.stats.pickups = Math.max(S.stats.pickups, S.pickups.length);
    // the stop that ended with somebody on the ground goes on once nobody is left there
    if (S.hold) {
      S.hold.t += dt;
      if (!onGround().filter((p) => !p.bot).length || S.hold.t > K.STRAND.TIME + 2) { const m = S.hold.m; S.hold = null; for (const p of onGround()) rejoin(p, true, true); deps.release(m); }
    }
  }

  // ---------- the phone ----------
  // What the away man's phone shows: a hint line, the STRANDED countdown, and a key that changes when either does. null when he is not away.
  function ui(p) {
    const o = p.on;
    if (!o || !o.away) return null;
    const K = A();
    const ov = (o.mode === 'walk' && o.deck && o.deck.island ? islandUi(state, p) : null) || (o.mode === 'walk' && o.deck && o.deck.derelict ? der.ui(p) : null) || tre.ui(p) || obj.ui(p); // (C.6c: the Titan's crystal) (A1: an objective at his feet, soldiers on him, the banner in his arms) (A2: a chest at his feet or in his arms, guards)
    let hint;
    if (o.mode === 'home') hint = 'You walked home. You rejoin at the next dock.';
    else if (o.mode === 'rope') hint = 'CLIMB the rope: stick UP to the ship, DOWN to the ground. JUMP lets go.';
    else if (o.mode === 'ladder') hint = 'CLIMB the wall ladder: stick UP or DOWN.';
    else if (ov) hint = ov.hint;
    else if (S.rope.out && Math.abs(p.x - S.rope.x) < 400) hint = 'The ROPE LADDER: stand under it and push the stick UP to CLIMB.';
    else if (!o.deck && ladderNear(o, p, true)) hint = 'CLIMB: push the stick UP at the wall ladder. Or FIRE FLARE to call the ship.';
    else if (o.deck) hint = 'On the wall. Stick DOWN at a ladder to climb down. JUMP leaps off. FIRE FLARE calls the ship.';
    else hint = 'FIRE FLARE to call the ship. Walk to a wall ladder and push UP to CLIMB.';
    const left = o.strand > 0 ? Math.max(0, Math.ceil(K.STRAND.TIME - o.strand)) : 0;
    const status = o.mode === 'home' ? '' : left ? 'STRANDED! ' + left + ' s - FIRE A FLARE, climb the rope, or hook the ship' : o.flareT > 0 ? 'FLARE UP - wait for the ship' : '';
    return { u: { hint, left, mode: o.mode, ...(ov && o.mode === 'walk' ? { verb: ov.verb } : {}) }, status, k: o.mode + '|' + hint + '|' + left + '|' + (o.flareT > 0 ? 1 : 0) + '|' + Math.ceil(o.flareCd || 0) };
  }

  // ---------- the bot helm (bots.js operate) ----------
  // Where the ship should be to take the nearest pickup: { dx (world px the rope's hatch must move), alt (the altitude that puts the rope's top at the hover height) } or null.
  function helmCall() {
    if (!S.on) return null;
    const vault = !S.pickups.length ? tre.vaultCall() : null; // (A2, tools only: the bot helm hovers over an open vault so a trip can reach the chests)
    const wreck = !S.pickups.length && !vault ? der.call() : null; // (G5, tools only: the bot helm hovers over a wreck with a part left so a trip can strip it)
    const isl = !S.pickups.length && !vault && !wreck && A().BOT_TRIPS && S.island && islandTrip(state) ? { x: midOf(S.island), y: S.island.y - A().LADDER.HOVER, name: 'the crystal' } : null; // (C.6c, tools only: the bot helm hovers over the Titan's island so a trip can reach the crystal)
    if (!S.pickups.length && !vault && !wreck && !isl) return null;
    const sh = main(), R = S.rope;
    const pk = vault || wreck || isl || S.pickups.reduce((b, q) => (Math.abs(q.x - R.x) < Math.abs(b.x - R.x) ? q : b));
    return { dx: pk.x - R.x, alt: R.y - sh.pose.y - pk.y, name: pk.name };
  }
  // The job on the helm man's phone: PICK UP <name> (jobs.js).
  function pickupJob(p, f) {
    if (!S.on || !S.pickups.length) return null;
    const R = S.rope, pk = S.pickups.reduce((b, q) => (Math.abs(q.x - R.x) < Math.abs(b.x - R.x) ? q : b));
    const dx = pk.x - R.x, near = Math.abs(dx) < 160;
    return { kind: 'pickup', label: 'PICK UP ' + String(pk.name).toUpperCase() + (near ? ' - HOVER, THE LADDER IS DOWN' : pk.prisoners ? ' - FLY OVER THEM' : ' - FLY TO THE FLARE'), dir: near ? 'down' : (dx * f > 0 ? 'right' : 'left'), color: '#ff8c1a', seated: true };
  }

  return {
    bind: (d) => { deps = { ...deps, ...d }; },
    objectiveJob: (p, f) => islandJob(state, p, f) || der.job(p, f) || tre.job(p, f) || obj.job(p, f), obj, tre, der, landOn, island: () => S.island, payTreasure: () => tre.pay(), chestStow: (p) => tre.stow(p),
    begin, reset, update, surfaces, step, enabled, ui, helmCall, pickupJob, ropeSpot, ladderAction, useLadder, mount, lowerRope, dockReturn, holdStop, tripWanted, tripStarted,
    awayList, onGround, groundAt: (x, y) => groundAt(mapNow(), x, y), eligible, rejoin, walkHome, fireFlare,
  };
}
