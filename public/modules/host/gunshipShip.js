// The enemy gunship as a SHIP (MOVEMENT.md, Option B, stage B.5; used when config.GUNSHIP.AS_SHIP is on, otherwise gunship.js is the gunship).
//
// She is a Ship like any other: gunshipBuild.js turns her blueprint (gunshipBlueprint.js) into a parts list and simulation.js addShip(parts, { team: 'enemy', ai }) makes her. From then on
// the ship rules are hers: her pose and flight (forces, mass, COME ABOUT), rock, solid collisions with our ship, fires and holes and gas leaks, steam, modules that break, guns that
// fire, a crew who walk her decks. Her crew are BOTS of the enemy side (skeleton raiders; they live in `ship.crewReg`, in no player registry, so the phones, votes and scorecards never
// see them) with the four roles of the old gunship - helmsman, gunners, stoker, guards - run by the ordinary bot brain (bots.js enemyRoleJobs). Our crew who board her are ordinary
// players with `player.ship = her id`: they are hostile aboard her (shipSim.js isHostile / hostileUse) and can fight her crew, plant the charge at her boiler or take her helm.
//
// This file is the DIRECTOR: what is not a ship rule. It keeps the old `state.gunship` RECORD (g) so everything that reads her (the radar, the camera, the gunners' targets, the pacing
// director, the salvage, the bots' boarding jobs) keeps working: g.dx / g.dy / g.m are her offset from OUR ship and her facing in OUR ship's coordinates, worked out from the two poses every
// step; g.bp, g.ports, g.phase, g.rope, g.charge, g.gap, g.crew ... are as they were.
//   * HER CAPTAIN  (a port of gunship.js plan / pick / startStrafe / startRetreat): which ring spot to fly to, strafing runs, retreats, fleeing; the result is a speed order and an altitude
//                  for her helmsman bot (ship.ai.plan, called from course.js pilotPlan), and whether to turn her stern to us (ship.ai.wantsTurn). On top of that the helm bot runs the
//                  PvP captain's WEAVE and DODGE (pvp/captainAI.js) in the style of her blueprint's personality.
//   * HER GUNS     the gunners fire at the main ship through shipSim.js (ship.ai.shoot): slow cannonballs in state.bullets, a broadside from a firing spot with a glow first (mayFire).
//   * OUR SHELLS   hit her ports (a gun port has hit points; at zero its gun is broken), then her hull (impact, with holes, fires and gas leaks), until she is wrecked.
//   * THE ROPE     her grapple (or ours) is a spring between two poses: it pulls her hard and us gently (speed, climb and a twist at the bow); it snaps when she is too far.
//   * LATCHING     with her guns down she closes in, fires her grapple and sends her guards across the rope (raiders.dropOne); paratroopers jump from a high spot; harpoon, hangar and ramp
//                  specials work as they did.
//   * BOARDING HER the rope's swing (our bow <-> her stern), or a hookshot / a jump onto her decks (simulation.js rivalDecks): our crew are aboard HER ship. Fight her crew; hold Action at
//                  her boiler to plant the charge (swing back before it blows); hold it at her helm, with her helmsman out of the way, and she surrenders.
// Numbers: config.GUNSHIP (the old ones, reused), config.GUNSHIP_PARTS (her parts), config.GUNSHIP_SHIP (the new ones).
import { crewMul, crewHeads } from './crewscale.js';
import { config } from '../../config.js';
import { inRock, altWindow, tilt } from './course.js';
import { shipOf, transfer, hostileTo } from './ships.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { pop } from './popups.js';
import { applyForce } from './forces.js';
import { shellDmg } from './aim.js';
import { shipGeom } from './gunship.js';
import { generateBlueprint, mx, decksOf, segAt, deckYAt, landX, landY, anchorPt } from './gunshipBlueprint.js';
import { gunshipParts, ENEMY_TEAM } from './gunshipBuild.js';

const G = config.GUNSHIP;
const GP = config.GUNSHIP_PARTS;
const GS = () => config.GUNSHIP_SHIP;
const ROLES = ['gunner', 'helm', 'stoker', 'guard', 'gunner', 'guard', 'guard', 'guard'];
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NODE_NAMES = Object.keys(G.NODES);
// Hunting or latched on (the phases in which she can be boarded, and her crew fights back).
const engaged = (g) => g.phase === 'hunt' || g.phase === 'latch';

export function createGunshipShip({ state, puff, credit, dropOne, pickType, spawnBats, addShip, removeShip }) {
  const ours = state.ships[0]; // (she hunts the main ship)
  const layout = ours.layout;
  const P = layout.platforms;
  const AIM = layout.aimPoint; // where her fire is aimed on our ship (centre of our hull)
  const geom = () => shipGeom(layout);
  const ourU = () => ours.state.speed * config.SHIP.TOP_SPEED; // how fast our engines carry us along our own bow, px/s (her offset from us moves by it, as it always did)
  const sPuff = (x, y, c, n) => puff(toWorldX(ours, x), toWorldY(ours, y), c, n); // (a point in OUR ship's coordinates)
  const sPop = (x, y, kind, color, size) => pop(state, toWorldX(ours, x), toWorldY(ours, y), kind, color, size);
  state.gunship = null;
  state.paras = []; // paratroopers in the air (world coordinates, like shells; vx is a world velocity)
  const S = (state.gsStats = { spawned: 0, dropped: 0, shot: 0, landed: 0, latches: 0, cut: 0, sent: 0, portsDown: 0, contacts: 0, collisions: 0, reverts: 0, maxDepth: 0, breakoffs: 0, shots: 0, turns: 0, strafes: 0, retreats: 0, aborts: 0, flees: 0, climbs: 0, mortars: 0, flaks: 0, turretShots: 0, bats: 0, harpoons: 0, ladders: 0, boarded: 0, kills: 0, captured: 0, charges: 0 });
  const warn = (text, secs = 3.5) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const lap = () => (state.course ? state.course.lap : 1);
  let stamp = 0;

  // Is any of this outline (at offset dx, dy from our ship, in OUR ship's coordinates) inside rock?
  const hits = (dx, dy, pts) => {
    for (const [x, y] of pts) if (inRock(state, toWorldX(ours, x + dx), toWorldY(ours, y + dy))) return true;
    return false;
  };
  const freeAt = (g, dx, dy) => !hits(dx, dy, g.bp.pts.spot);

  // Her yardarm (where the rope hooks on), in OUR ship's coordinates.
  const anchorAt = (g) => {
    const a = anchorPt(g);
    return { x: a.x + g.dx, y: a.y + g.dy };
  };
  // Distance from our bow to her yardarm, and whether she's within reach of hook / swing.
  const gap = (g) => {
    const a = anchorAt(g);
    return Math.hypot(a.x - geom().BOW.x, a.y - geom().BOW.y);
  };

  // ---- her crew: the old gunship's roles, as enemy bots on her ship ----
  const crewOf = (g) => Object.values(g.ship.crewReg);
  const hasRole = (g, role) => crewOf(g).some((c) => c.role === role && !(c.ko > 0));
  // The proxies the bots' boarding jobs aim at ('fight' this one): x in her current (mirrored) home frame, d our main deck, as the old crew records were.
  const proxyOf = (c) => (c.proxy ||= { bot: c, d: 0, x: 0, y: 0, hp: 0 });
  const refreshCrew = (g) => {
    const list = crewOf(g);
    g.crew = list.map((c) => {
      const q = proxyOf(c);
      q.x = mx(g, c.x);
      q.y = c.y;
      q.d = geom().MAIN;
      q.hp = c.eHp;
      q.role = c.role;
      return q;
    });
  };
  // Aboard her now: our players on her ship (boarders).
  const aboard = (g) => Object.values(state.players).filter((p) => shipOf(state, p) === g.ship);
  const aboardAny = () => { const g = state.gunship; return !!g && (aboard(g).length > 0 || Object.values(state.players).some((p) => p.swing)); };
  const hostiles = (g) => aboard(g).filter((p) => !p.fall && !p.swing && !(p.ko > 0));

  let nextId = 0;
  const addCrewman = (g, role) => {
    const bp = g.bp, h = g.ship;
    const list = bp.posts[role] || bp.posts.guard;
    const used = crewOf(g).filter((c) => c.role === role).map((c) => c.post);
    const post = list.find((x) => !used.includes(x)) ?? list[0];
    const dk = segAt({ m: 1, bp }, post);
    const id = 'e' + nextId++;
    const c = {
      id, bot: true, enemy: true, team: ENEMY_TEAM, ship: h.id, name: role === 'helm' ? 'Helmsman' : role === 'gunner' ? 'Gunner' : role === 'stoker' ? 'Stoker' : 'Raider', role,
      species: 'skeleton', type: 'grunt', color: '#8c2f2f', scale: 1, post, eHp: G.CREW_HP,
      x: post, y: bp.decks[dk].y, d: dk, jx: 0, jy: 0, t: 0, connected: true, fall: false, face: -1,
    };
    h.crewReg[id] = c;
    return c;
  };

  // ---- her record, kept in step with the two ships' poses ----
  const portHp = (kind) => (kind === 'turret' ? GP.TURRET_GUN.HP : kind === 'mortar' ? GP.MORTAR_GUN.HP : kind === 'flak' ? GP.FLAK_GUN.HP : G.PORT_HP);
  const syncPose = (g) => {
    const h = g.ship, st = h.ctx.ship;
    g.m = h.pose.f * ours.pose.f; // (+1: her bow points the way ours does)
    g.side = -g.m;
    g.dx = toShipX(ours, toWorldX(h, g.bp.cx)) - g.bp.cx;
    g.dy = h.pose.y - ours.pose.y;
    g.turn = h.pose.turn > 0 ? { t: h.pose.turn * G.TURN_TIME } : null;
    g.wvx = ours.pose.f * h.pose.vx; // her speed along our ship's x, and her climb (up is positive)
    g.wvy = st.vy || 0;
    g.gas = clamp((st.gas || 0) / 100, 0, 1);
    g.steam = clamp((st.press || 0) / 100, 0, 1);
    g.thr = st.speed; // (the propellers spin with her throttle along her own bow)
    g.pitch = st.pitch || 0;
    g.hp = Math.max(0, (st.hull / 100) * g.max);
    const mods = h.ctx.modules || [];
    g.eng.forEach((e, i) => { const m = mods.find((q) => q.name === g.info.engines[i]); if (m) e.hp = clamp(m.hp / m.max, 0, 1); });
    g.engF = g.eng.reduce((a, e) => a + e.hp, 0) / Math.max(1, g.eng.length);
    g.ports.forEach((pt, k) => {
      const m = mods.find((q) => q.name === g.info.guns[k]);
      if (m && m.broken && !pt.dead) pt.dead = true;
      if (pt.dead) pt.hp = Math.min(pt.hp, 0);
    });
    g.helmOk = hasRole(g, 'helm');
  };

  // ---- the rope: a spring between two poses ----
  const setRope = (on) => {
    const g = state.gunship;
    if (!g) return;
    g.rope = on;
    if (!on) g.herRope = false;
    g.ropeLen = on ? Math.max(G.BOARD_LEN, gap(g)) : 0;
    g.ropeT = 0;
    g.tension = 0;
  };
  const snap = (text = 'THE ROPE SNAPS!') => {
    const g = state.gunship;
    if (!g || !g.rope) return;
    const a = anchorAt(g);
    setRope(false);
    if (g.phase === 'latch') g.latchCd = G.LATCH_RETRY; // she'll try again
    sPuff((a.x + geom().BOW.x) / 2, (a.y + geom().BOW.y) / 2, '#d8c79a', 10);
    state.sfxQ && state.sfxQ.push(['hit']);
    warn(text, 2.5);
  };
  // Taut, the rope pulls HER back hard and us gently (speed, climb and a twist where it is tied: forces.js 'tether'); it snaps when the ships are too far apart.
  const ropeStep = (g, dt) => {
    g.tension = 0;
    if (!g.rope) return;
    const h = g.ship, TOP = config.SHIP.TOP_SPEED;
    const a = anchorAt(g);
    const rx = a.x - geom().BOW.x;
    const ry = a.y - geom().BOW.y;
    const dist = Math.hypot(rx, ry) || 1;
    const nx = rx / dist;
    const ny = ry / dist;
    g.ropeLen = Math.max(G.BOARD_LEN, g.ropeLen - G.REEL_SPEED * dt); // reeling her in
    if (dist > G.SNAP_LEN) return snap();
    if (dist <= g.ropeLen) return;
    const stretch = dist - g.ropeLen;
    g.tension = stretch / (G.SNAP_LEN - g.ropeLen);
    const ourVx = ourU(), ourVy = ours.state.vy || 0;
    const sep = (g.wvx - ourVx) * nx + (ourVy - g.wvy) * ny; // how fast the ships are moving apart along the rope
    const acc = clamp(G.ROPE_K * stretch + G.ROPE_DAMP * Math.max(0, sep), 0, G.ROPE_MAX_ACC);
    h.ctx.ship.speed += (g.m * -nx * acc * dt) / TOP; // (her speed along her bow: our ship's x is her bow's x times m)
    h.ctx.ship.vy = (h.ctx.ship.vy || 0) + ny * acc * dt; // (her climb is up, ny is down)
    const pull = Math.min(stretch, G.TUG_CAP);
    ours.state.vy = (ours.state.vy || 0) - ny * G.TUG_VY * pull * dt;
    ours.state.speed = clamp(ours.state.speed + nx * G.TUG_SPEED * pull * dt, -0.4, 1);
    const F = config.FORCES.TETHER_ACC * (pull / 100);
    applyForce(ours.ctx, { x: geom().BOW.x, y: geom().BOW.y, fx: nx * F, fy: ny * F, source: 'tether' }); // (the rope pulls our bow toward her: it drags the nose around, forces.js)
    applyForce(h.ctx, { x: g.bp.anchor.x, y: g.bp.anchor.y, fx: g.m * -nx * F, fy: -ny * F, source: 'tether' }); // (...and her stern toward us)
  };

  // ---- placing her: far off our bow, clear of rock, with a clear flight path in to our station (tries the full distance first, then nearer) ----
  const spawnPos = (bp) => {
    for (const dx of [G.START_DX, 3400, 2600]) {
      for (let k = 0; k < 6; k++) {
        const dy = rand(-G.START_DY, G.START_DY);
        if (hits(dx, dy, bp.pts.col)) continue;
        let clear = true;
        for (let x = dx - 500; x > 0 && clear; x -= 500) if (hits(x, dy, bp.pts.look)) clear = false;
        if (clear) return { dx, dy };
      }
    }
    return null;
  };

  // The ship.ai object every hook in the ship rules asks (shipSim.js, course.js, bots.js, aim.js, captainAI.js, ships.js).
  const makeAi = () => ({
    kind: 'gunship',
    g: null,
    style: 'brawler',
    plan: (st) => plan(st),
    wantsTurn: () => !!(state.gunship && state.gunship.wantTurn),
    mayFire: (name) => mayFire(name),
    shoot: (player, gun, name) => shoot(player, gun, name),
    // What a blow costs her hull: the old gunship lost 0.5 hit points of her max for a shell (shellDmg), as a share of her hull; a deck hit costs SHIP.HIT_DAMAGE x its power, so this scales it to that.
    damageMul: () => { const g = state.gunship; return (GS().DAMAGE_MUL * ((100 * config.GUNS.DAMAGE) / (g ? g.max : 30))) / (config.SHIP.HIT_DAMAGE * GS().HIT_POWER); },
    drainMul: () => GS().DRAIN_MUL, // what an open hole or a fire costs her hull every second (x ours at 1)
    hurt: (c, dmg, by) => hurt(c, dmg, by),
    onBoard: (p) => onBoard(p),
    plantTime: () => G.PLANT_TIME * (state.gunship && state.gunship.bp.special === 'armoured' ? GP.ARMOURED.PLANT_MUL : 1),
    plantLabel: () => (state.gunship && state.gunship.bp.special === 'armoured' ? 'Plant charge (armoured boiler)!' : 'Plant charge!'),
  });

  // opt: a seed number, or { seed, hull, layout, special, personality, mission } to force parts (tests).
  const spawn = (opt) => {
    if (state.gunship) return false;
    const o = opt && typeof opt === 'object' ? opt : {};
    if (ours.pose.turn > 0 || ours.state.down > 0) return false;
    const seed = typeof opt === 'number' ? opt : o.seed != null ? o.seed : (Math.random() * 0x7fffffff) | 0;
    const bp = generateBlueprint(seed, { mission: lap(), difficulty: state.difficulty, shipLayout: layout, ...o });
    const at = spawnPos(bp);
    if (!at) return false;
    S.spawned++;
    const hp = Math.round((G.HP + (lap() - 1) * 6) * bp.hpMul * (config.DIFFICULTY[state.difficulty] || config.DIFFICULTY.normal).gunHp * crewMul(state, 'hp'));
    const { parts, info } = gunshipParts(bp);
    const ai = makeAi();
    const h = addShip(parts, { id: 'gunship', team: ENEMY_TEAM, name: bp.title, formation: { dx: 0, dalt: 0 }, ai, place: false });
    h.formation = null; // (she is placed by this file, never by course.js place())
    h.crewReg = {};
    const styleMap = GS().STYLE_MAP;
    ai.style = styleMap[bp.personality] || 'brawler';
    // Where she appears: her middle `at.dx, at.dy` from our ship, nose toward us (flying in), the speed the old gunship came in at.
    h.pose.f = -ours.pose.f;
    h.pose.x = toWorldX(ours, bp.cx + at.dx) - bp.cx;
    h.pose.y = ours.pose.y + at.dy;
    h.pose.turn = 0;
    const m = h.pose.f * ours.pose.f;
    h.ctx.ship.speed = h.ctx.ship.order = clamp((m * G.START_VX) / config.SHIP.TOP_SPEED, -1, 1);
    h.ctx.ship.vy = ours.state.vy || 0;
    const parasMul = bp.special === 'paras' ? GP.PARAS.EVERY_MUL : 1;
    const g = (state.gunship = {
      asShip: true,
      ship: h,
      info,
      bp,
      cap: bp.cap, // her captain's personality settings
      phase: 'approach',
      mode: 'station', // what her captain is doing: 'station' (ring spots), 'strafe' or 'retreat' (waypoint runs)
      intent: 'approach', // shown on her mast pennant
      wp: [], // waypoints of a run (offsets from our ship)
      m,
      side: -m,
      turn: null,
      wantTurn: false,
      dx: at.dx, // her offset from our ship (our ship's coordinates; dy is down), kept in step with the two poses
      dy: at.dy,
      ports: bp.weapons.map((w) => ({ kind: w.kind, hp: portHp(w.kind), dead: false, cd: rand(2, 5) })),
      free: {}, // which ring spots are clear of rock right now
      node: null, // the ring spot she is heading for
      route: [], // ring spots still to pass on the way
      temp: null, // a free spot found by searching when the ring is blocked
      planT: 0,
      stayT: 0,
      noRoom: false,
      herRope: false,
      latchCd: 0,
      sendT: 0,
      extra: Math.round(G.LATCH_EXTRA * (bp.hull === 'cutter' ? 0.6 : bp.hull === 'dreadnought' ? 1.4 : 1)),
      paraT: G.PARA_FIRST * parasMul,
      paraDue: false,
      cutObj: { x: geom().BOW.x - 110, d: geom().MAIN, prog: 0 }, // what the crew hold Action on to cut her line
      huntT: 0, // seconds spent hunting (a boarder captain latches on after a while)
      harpT: GP.HARPOON.FIRST, // harpoon gun: seconds until she may fire it
      harpFlash: 0,
      hangarT: GP.HANGAR.FIRST, // bat hangar: seconds until the next launch
      hangarOpen: 0, // hangar door open (drawing)
      ramp: 0, // boarding ramp extension 0..1 (drawing)
      gas: 0.55, steam: 0.8, thr: 0.7,
      eng: bp.engines.map(() => ({ hp: 1 })), // engine health, one per pod (from her engine modules)
      props: bp.engines.map(() => rand(0, 6)), // propeller angles (drawing)
      sput: 0,
      pitch: 0,
      wheel: 0,
      wvx: G.START_VX,
      wvy: 0,
      seenVx: ourU(), // what her helmsman has noticed of OUR speeds (he reacts slowly)
      seenVy: ours.state.vy || 0,
      t: rand(0, 6),
      lastStrafe: 0,
      retreats: 0,
      repT: 0,
      hammerT: 0,
      hp,
      max: hp,
      rope: false,
      ropeLen: 0,
      tension: 0,
      fireCd: G.FIRE_EVERY,
      docked: 0,
      charge: null,
      captured: false,
      hit: 0,
      adrift: 0,
      refill: 0,
      crew: [],
      cmd: null, // what her helmsman is told (ship.ai.plan)
      canFire: false,
      heavyOk: false,
    });
    ai.g = g;
    h.rival = fillRival(null, ours, 0);
    for (const role of ROLES.slice(0, bp.crew)) addCrewman(g, role);
    syncPose(g);
    refreshCrew(g);
    warn(bp.title + ' APPROACHES - SHOOT OUT HER GUNS OR BOARD HER!', 4);
    return true;
  };

  // Our ship as her captain sees it: the rival record the PvP captain code and the gunners' targets read (aim.js, captainAI.js), in world coordinates.
  const fillRival = (R, o, dt) => {
    R = R || {};
    const aim = o.layout.aimPoint;
    const x = toWorldX(o, aim.x), y = toWorldY(o, aim.y);
    if (R.mid && dt > 0) { R.vx = (x - R.mid.x) / dt; R.vy = (y - R.mid.y) / dt; } else { R.vx = o.pose.vx; R.vy = o.pose.vy; }
    R.mid = { x, y };
    R.ship = o; R.id = o.id; R.team = o.team; R.layout = o.layout; R.pose = o.pose;
    R.hull = o.state.hull;
    R.down = o.state.down > 0 || !!o.ctx.wreck;
    R.stamp = ++stamp;
    R.guns = []; R.bags = []; R.crew = []; R.helm = null; R.boiler = null;
    return R;
  };

  // ---- Her captain: which spot on the ring round our ship to fly to (a port of the old gunship's plan, in our ship's coordinates) ----
  const nodeDist = (g, n) => Math.hypot(g.dx - n.dx, g.dy - n.dy);
  const refreshFree = (g) => {
    for (const name of NODE_NAMES) g.free[name] = freeAt(g, G.NODES[name].dx, G.NODES[name].dy);
  };
  const nearestFree = (g) => {
    let best = null;
    for (const name of NODE_NAMES) if (g.free[name] && (!best || nodeDist(g, G.NODES[name]) < nodeDist(g, G.NODES[best]))) best = name;
    return best;
  };
  // Shortest way along the ring (through free spots only) from one spot to another.
  const bfs = (g, from, to) => {
    if (from === to) return [];
    const prev = { [from]: null };
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === to) break;
      for (const nb of NODE_NAMES.filter((n) => G.NODES[n].links.includes(cur) || G.NODES[cur].links.includes(n))) {
        if (!g.free[nb] || nb in prev) continue;
        prev[nb] = cur;
        queue.push(nb);
      }
    }
    if (!(to in prev)) return null;
    const path = [];
    for (let n = to; n !== from; n = prev[n]) path.unshift(n);
    return path;
  };
  // The nearest rock-free spot to our bow (searching a grid round the ship), for when the ring is blocked.
  const findSpot = (g) => {
    let best = null;
    for (let dx = 1200; dx >= -4200; dx -= 300) {
      for (let dy = -1200; dy <= 1200; dy += 300) {
        if (!freeAt(g, dx, dy)) continue;
        const cost = Math.hypot(dx, dy * 1.5) + Math.hypot(dx - g.dx, dy - g.dy) * 0.3;
        if (!best || cost < best.cost) best = { dx, dy, cost };
      }
    }
    return best;
  };
  // Choose where to go next. `need` = 'bow' when she must be alongside (approach, latching, roped).
  const pick = (g, need) => {
    g.temp = null;
    g.route = [];
    g.arrived = false;
    const start = nearestFree(g);
    let want = null;
    if (start && need) want = g.free.bow ? 'bow' : null;
    else if (start) {
      const options = NODE_NAMES.filter((n) => g.free[n] && n !== g.node && (g.paraDue ? G.NODES[n].drop : G.NODES[n].fire) && bfs(g, start, n));
      const wOf = (n) => G.NODES[n].w * (g.cap.nodeW[n] ?? 1);
      let r = Math.random() * options.reduce((s, n) => s + wOf(n), 0);
      for (const n of options) if ((r -= wOf(n)) <= 0) { want = n; break; }
      if (!want && options.length) want = options[0];
      if (!want && g.node && g.free[g.node] && !g.paraDue) want = g.node; // nowhere better: stay put
    }
    if (want) {
      g.node = want;
      g.route = bfs(g, start, want) || [];
      g.noRoom = false;
      g.stayT = rand(G.STAY_MIN, G.STAY_MAX);
      return;
    }
    g.node = null;
    const s = findSpot(g);
    g.noRoom = !s;
    if (s) {
      g.temp = { dx: s.dx, dy: s.dy };
      g.tempT = g.t;
    }
  };
  // Strafing runs and retreats are waypoint runs (offsets from our ship). A straight run is only flown if rock is clear along the whole way.
  const runFree = (g, x0, y0, x1, y1) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 450));
    for (let k = 0; k <= n; k++) if (hits(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, g.bp.pts.look)) return false;
    return true;
  };
  const endMode = (g) => {
    g.mode = 'station';
    g.wp = [];
    g.node = null;
    g.temp = null;
    g.arrived = false;
    g.planT = 0;
    g.stayT = 0;
    g.wpT = 0;
    g.atRetreat = false;
  };
  const gunsReady = (g) => hasRole(g, 'gunner') && g.ports.some((pt) => !pt.dead && pt.kind === 'cannon');
  // A pass along our ship: climb (or dive) to one side, turn, then run across firing from the stern as she goes by.
  const startStrafe = (g) => {
    if (!gunsReady(g) || g.paraDue || g.t - g.lastStrafe < G.STRAFE_CD * g.cap.strafeCd || Math.random() > g.cap.strafeChance) return false;
    const heights = Math.random() < 0.5 ? [G.STRAFE_Y_HI, G.STRAFE_Y_LO] : [G.STRAFE_Y_LO, G.STRAFE_Y_HI];
    const leftward = g.dx > -600; // she is ahead of us: run back along our side toward the stern (else the other way)
    for (const dy of heights) {
      const entry = { dx: leftward ? Math.max(g.dx, 1400) : Math.min(g.dx, -3000), dy, close: G.STRAFE_CLOSE };
      const exit = { dx: leftward ? -3300 : 2600, dy, close: G.STRAFE_CLOSE, pass: 300 };
      if (hits(entry.dx, entry.dy, g.bp.pts.spot) || hits(exit.dx, exit.dy, g.bp.pts.spot)) continue;
      if (!runFree(g, g.dx, g.dy, entry.dx, entry.dy) || !runFree(g, entry.dx, entry.dy, exit.dx, exit.dy)) continue;
      g.mode = 'strafe';
      g.wp = [entry, exit];
      g.wpT = 0;
      g.lastStrafe = g.t;
      g.node = null;
      g.temp = null;
      S.strafes++;
      return true;
    }
    return false;
  };
  // Badly hurt: pull out of range and patch the hull (and engines), then come back.
  const startRetreat = (g) => {
    const sd = g.dx < -600 ? -1 : 1; // (away from us, out the nearer end: never across our ship)
    const spots = [[sd * G.RETREAT_DX, -300], [sd * G.RETREAT_DX, 300], [sd * G.RETREAT_DX, -800], [sd * 3000, -1000], [sd * 3000, 900], [sd * G.RETREAT_DX, 800]];
    for (const [dx, dy] of spots) {
      if (hits(dx, dy, g.bp.pts.spot) || !runFree(g, g.dx, g.dy, dx, dy)) continue;
      g.mode = 'retreat';
      g.wp = [{ dx, dy, close: G.CLOSE_PASS, pass: 250, stay: true }];
      g.wpT = 0;
      g.repT = 0;
      g.retreats++;
      g.node = null;
      g.temp = null;
      g.atRetreat = false;
      S.retreats++;
      warn('THE GUNSHIP PULLS OUT TO PATCH HER HULL!', 2.5);
      return true;
    }
    return false;
  };
  const wpTarget = (g, dt) => {
    g.wpT += dt;
    let w = g.wp[0];
    while (w && !w.stay && Math.hypot(g.dx - w.dx, g.dy - w.dy) < (w.pass || G.WP_PASS)) {
      g.wp.shift();
      w = g.wp[0];
    }
    if (!w || (g.mode === 'strafe' && g.wpT > G.WP_TIMEOUT)) {
      if (g.mode === 'strafe' && w) S.aborts++;
      endMode(g);
      return { dx: g.dx, dy: g.dy, hold: true, dist: 0, station: true };
    }
    const dist = Math.hypot(g.dx - w.dx, g.dy - w.dy);
    g.atRetreat = g.mode === 'retreat' && dist < 400;
    return { dx: w.dx, dy: w.dy, hold: false, dist, close: w.close, station: false };
  };
  const hullF = (g) => clamp(g.ship.state.hull / 100, 0, 1);
  // Each step: re-check the ring now and then, decide what to do next, and return the point she should fly to now.
  const planStep = (g, dt) => {
    const need = g.phase === 'approach' || g.phase === 'latch' || g.rope ? 'bow' : null;
    const contact = g.rope || g.charge || aboardAny(); // roped, charge set, or crew aboard: she stays where she is
    if (g.mode !== 'station' && (contact || g.phase !== 'hunt')) endMode(g);
    if ((g.planT -= dt) <= 0) {
      g.planT = G.PLAN_EVERY;
      refreshFree(g);
      if (g.mode === 'station') {
        const stale = g.temp ? !freeAt(g, g.temp.dx, g.temp.dy) || g.t - g.tempT > 2 : g.node ? !g.free[g.node] || g.route.some((n) => !g.free[n]) : true;
        const wrongSpot = need && g.node !== 'bow' && !(g.temp && g.free.bow === false);
        const moveOn = g.arrived && g.stayT <= 0;
        const dropNow = g.paraDue && g.node && !G.NODES[g.node].drop && g.arrived && g.t - g.arrT > 2;
        if (g.phase === 'hunt' && !contact && hullF(g) < g.cap.retreatAt && g.retreats < g.cap.retreats && startRetreat(g)) {
          // (pulling out to repair)
        } else if (moveOn && g.phase === 'hunt' && !contact && !need && startStrafe(g)) {
          // (strafing run)
        } else if (stale || wrongSpot || moveOn || dropNow) pick(g, need);
      }
    }
    if (g.mode !== 'station') return wpTarget(g, dt);
    if (g.noRoom) return { dx: g.dx, dy: g.dy, hold: true, dist: 0, station: true };
    let n = g.temp;
    if (!n && g.node) {
      while (g.route.length > 1 && nodeDist(g, G.NODES[g.route[0]]) < G.NODE_PASS) g.route.shift();
      n = G.NODES[g.route.length ? g.route[0] : g.node];
    }
    if (!n) return { dx: g.dx, dy: g.dy, hold: true, dist: 0, station: true };
    const dist = Math.hypot(g.dx - n.dx, g.dy - n.dy);
    const last = g.temp || g.route.length <= 1; // heading for the final spot
    if (last && dist < G.NODE_ARRIVE * 1.5 && !g.arrived) {
      g.arrived = true;
      g.arrT = g.t;
      g.route = [];
    }
    if (g.arrived) g.stayT -= dt;
    return { dx: n.dx, dy: n.dy, hold: false, dist, station: true, fire: !!(g.temp || (g.node && G.NODES[g.node].fire)) };
  };

  // Does her stern (where her guns are) face our ship?
  const bearsOn = (g) => (AIM.x - (g.bp.cx + g.dx)) * -g.m > -120;

  // What her helmsman is told this step (the old fly(), as orders for a helm bot): a speed along her bow (a share of full speed), an altitude, and whether to turn her round.
  // mode: 'hold' (fly the captain's course), 'leave' (run for it), 'dead' (nobody flies)
  const command = (g, dt, mode, tgt = { dx: G.HOLD_DX, dy: G.HOLD_DY }) => {
    g.t += dt;
    const h = g.ship, TOP = config.SHIP.TOP_SPEED;
    const ourVx = ourU(); // (her offset from us moves by the speed the engines ask of us, as it always did)
    const ourVy = ours.state.vy || 0;
    const react = Math.min(1, dt / G.REACT);
    g.seenVx += (ourVx - g.seenVx) * react;
    g.seenVy += (ourVy - g.seenVy) * react;
    const helm = mode !== 'dead' && g.helmOk;
    g.bears = bearsOn(g);
    // Her helmsman looks ahead along her own motion for rock, and brakes.
    const L = G.LOOKAHEAD;
    const blockedX = helm && hits(g.dx + g.wvx * L, g.dy, g.bp.pts.look);
    const blockedY = helm && hits(g.dx, g.dy - g.wvy * L, g.bp.pts.look);
    let wantVx = 0;
    let wantM = g.m;
    let altTarget = ours.state.alt - g.dy;
    let speed = 0;
    if (helm) {
      // Horizontal: ask for a speed that closes the gap to her station.
      let tx = tgt.dx + Math.sin(g.t * 0.5) * G.WOBBLE_X;
      if (mode === 'leave') tx = g.dx < -600 ? -6000 : 6000;
      const closeMax = mode === 'leave' ? G.CLOSE_PASS : tgt.close || G.MAX_CLOSE;
      // (still pointing the wrong way for her station? ease off so she has room to swing round)
      const kx = tgt.station && g.seenVx > G.TURN_MIN_SPEED && g.m !== 1 ? G.KX * 0.5 : G.KX;
      const close = clamp(kx * (tx - g.dx), -closeMax, closeMax);
      wantVx = clamp(g.seenVx + close, -G.MAX_SPEED, G.MAX_SPEED);
      if (tgt.hold || blockedX) wantVx = 0; // nowhere to go: sit still in the world
      // Which way should her nose point? Along her wanted travel; near a station, the way we are flying.
      if (tgt.station && Math.abs(tgt.dx - g.dx) < G.TURN_AHEAD && g.seenVx > G.TURN_MIN_SPEED) wantM = 1;
      else if (Math.abs(wantVx) > G.TURN_MIN_SPEED) wantM = wantVx > 0 ? 1 : -1;
      // On a firing spot with her stern facing away from us? Swing round so the guns bear.
      if (tgt.fire && tgt.dist < 450 && !g.bears) wantM = g.bp.cx + g.dx > AIM.x ? 1 : -1;
      // Vertical: the altitude of her station (and away from rock).
      let ty = tgt.dy + Math.sin(g.t * 0.7 + 1) * G.WOBBLE_Y;
      if (mode === 'leave') ty -= 300;
      if (blockedY) ty = g.dy + (g.wvy > 0 ? 400 : -400); // rock above: dive a little; rock below: climb
      altTarget = ours.state.alt - ty;
      // her bow's speed: a share of full speed along her own nose (a ship goes where her engines push her; behind her, the lever is the other way)
      speed = clamp((g.m * wantVx) / TOP, -config.SHIP.REVERSE, 1);
    }
    g.wantM = wantM;
    // Turning round: only when nobody is aboard and no rope is on (she is a ship: comeAbout.js decides when she may; here she asks, and slows down to be allowed).
    g.turnCd = Math.max(0, (g.turnCd || 0) - dt);
    const turning = h.pose.turn > 0;
    const canTurn = !turning && !g.rope && !g.charge && g.helmOk && g.phase !== 'sinking' && !aboardAny();
    g.wantTurn = helm && wantM !== g.m && canTurn;
    if (g.wantTurn || turning) speed = clamp(speed, -0.25, 0.25); // (she brakes to the speed a turn is allowed at)
    if (turning && !g.wasTurning) S.turns++;
    g.wasTurning = turning;
    g.cmd = { target: altTarget, speed, dx: 1000, dy: 0, wedged: false };
    // The propellers spin with the throttle; the wheel turns with the steering.
    const st = h.ctx.ship;
    for (let i = 0; i < g.eng.length; i++) g.props[i] += dt * (5 + 38 * Math.abs(st.speed) * (0.3 + 0.7 * g.eng[i].hp)) * (st.speed < 0 ? -1 : 1);
    g.wheel += turning ? dt * 5 * g.m : (clamp((speed - st.speed) * 2 + (ours.state.alt - g.dy - st.alt) * 0.003, -1, 1) * 1.2 - g.wheel) * Math.min(1, dt * 3);
    if (!helm) g.cmd = { target: st.alt, speed: st.speed, dx: 1000, dy: 0, wedged: false };
  };

  // The helm bot's plan: course.js pilotPlan asks here for ship.ai.
  const plan = (st) => {
    const g = state.gunship;
    const body = st.ship;
    if (!g || !g.cmd) return { target: body.alt, speed: 0.2, dx: 1000, dy: 0 };
    const c = g.cmd;
    const win = altWindow(st, 2);
    const target = win.min <= win.max ? clamp(c.target, win.min + 20, win.max - 20) : (win.min + win.max) / 2; // (never a height the rock forbids)
    return { target, speed: c.speed, dx: c.dx, dy: c.dy, wedged: false };
  };

  // ---- her guns: a broadside from a firing spot (with a glow first), the turret, the mortar and the flak gun on their own timers ----
  const portOf = (g, name) => g.info.guns.indexOf(name);
  const lineClear = (g, k) => {
    const w = g.bp.weapons[k];
    const px = toShipX(ours, toWorldX(g.ship, w.x)), py = toShipY(ours, toWorldY(g.ship, w.y));
    for (let s = 1; s <= 8; s++) if (inRock(state, toWorldX(ours, px + ((AIM.x - px) * s) / 9), toWorldY(ours, py + ((AIM.y - py) * s) / 9))) return false;
    return true;
  };
  const missFor = (dist) => clamp(G.MISS_BASE + Math.max(0, dist - 1500) / G.MISS_DX, 0, G.MISS_MAX);
  const mayFire = (name) => {
    const g = state.gunship;
    if (!g) return false;
    const k = portOf(g, name);
    if (k < 0 || g.ports[k].dead) return false;
    if (g.ports[k].kind === 'cannon') return !!g.fireOk; // (a broadside is due: the first manned cannon that bears fires it for all)
    return !!g.heavyReady && !!g.heavyReady[k];
  };
  // One cannonball from gun `k` (a stern port, or the turret, mortar or flak gun) at a point on our hull.
  const fireBall = (g, k) => {
    const h = g.ship, kind = g.ports[k].kind;
    const gun = h.ctx.GUNS[g.info.guns[k]];
    const C = kind === 'turret' ? GP.TURRET_GUN : kind === 'mortar' ? GP.MORTAR_GUN : kind === 'flak' ? GP.FLAK_GUN : null;
    const [gx, gy] = tilt(h.ctx, gun.bx, gun.by);
    const fx = toWorldX(h, gx), fy = toWorldY(h, gy);
    const vs = ours.pose.vx; // (her shots fly at their own speed as seen from our ship: our speed is added)
    const tx = toWorldX(ours, rand(700, 1500));
    const ty = toWorldY(ours, rand(480, 820));
    const dist = Math.hypot(tx - fx, ty - fy) || 1;
    const missChance = kind === 'cannon' ? missFor(g.dist || dist) : clamp(missFor(g.dist || dist) + (C.MISS - G.MISS_BASE), 0, G.MISS_MAX);
    if (kind === 'mortar') {
      const T = rand(C.TIME[0], C.TIME[1]);
      state.bullets.push({ x: fx, y: fy, vx: (tx - fx) / T + vs, vy: (ty - fy) / T - 0.5 * C.GRAVITY * T, ay: C.GRAVITY, life: T + 0.05, miss: Math.random() < missChance, dmg: C.DAMAGE, mortar: true, from: h.id });
      S.mortars++;
      state.flashes && state.flashes.push({ x: fx, y: fy - 20, ang: -Math.PI / 2, t: 0.15, color: '#ffcf80', size: 1.8 });
    } else if (kind === 'cannon') {
      state.bullets.push({ x: fx, y: fy, vx: ((tx - fx) / dist) * GS().BULLET_SPEED + vs, vy: ((ty - fy) / dist) * GS().BULLET_SPEED, life: 3, miss: Math.random() < missChance, from: h.id });
      state.flashes && state.flashes.push({ x: fx, y: fy, ang: Math.atan2(ty - fy, tx - fx), t: 0.12, color: '#ffcf80', size: 1.6 });
      S.shots++;
    } else {
      const base = Math.atan2(ty - fy, tx - fx);
      const nShots = kind === 'flak' ? 3 : 1;
      for (let i = 0; i < nShots; i++) {
        const a = base + (nShots > 1 ? (i - 1) * C.SPREAD : 0);
        state.bullets.push({ x: fx, y: fy, vx: Math.cos(a) * C.SPEED + vs, vy: Math.sin(a) * C.SPEED, life: 3.2, miss: Math.random() < missChance, flak: kind === 'flak', from: h.id });
      }
      if (kind === 'flak') S.flaks++;
      else S.turretShots++;
      state.flashes && state.flashes.push({ x: fx, y: fy, ang: base, t: 0.12, color: '#ffcf80', size: 1.6 });
    }
    state.sfxQ && state.sfxQ.push(['cannon']);
  };
  // A gunner fired (shipSim.js: his gun's cooldown and ammunition are spent). A cannon fires the whole broadside - as many balls as gunners + 1, at most G.SHOTS, from her first live ports - and
  // starts the next broadside's timer; the other guns fire on their own timers.
  const shoot = (player, gun, name) => {
    const g = state.gunship;
    if (!g) return;
    const k = portOf(g, name);
    if (k < 0) return;
    const kind = g.ports[k].kind;
    const steamF = 0.5 + 0.5 * clamp(g.steam / 0.4, 0, 1); // (a cold boiler slows her reloads)
    if (kind === 'cannon') {
      const alive = g.ports.map((pt, i) => i).filter((i) => !g.ports[i].dead && g.ports[i].kind === 'cannon');
      const gunners = crewOf(g).filter((c) => c.role === 'gunner' && c.lock && g.ship.layout.kindOf(c.lock) === 'gun').length;
      for (let i = 0; i < Math.min(G.SHOTS, gunners + 1, alive.length); i++) fireBall(g, alive[i]);
      g.fireCd = ((g.mode === 'strafe' ? G.STRAFE_FIRE : G.FIRE_EVERY) * g.cap.fireMul * GS().FIRE_MUL * rand(0.85, 1.2)) / crewMul(state, 'fire');
      g.fireOk = false;
      gun.cd = 0.5;
      return;
    }
    const C = kind === 'turret' ? GP.TURRET_GUN : kind === 'mortar' ? GP.MORTAR_GUN : GP.FLAK_GUN;
    gun.cd = (C.EVERY * g.cap.fireMul * GS().FIRE_MUL * rand(0.85, 1.2)) / (crewMul(state, 'fire') * steamF);
    fireBall(g, k);
  };

  // ---- Paratroopers ----
  const dropParas = (g) => {
    const crew = crewHeads(state);
    const n = clamp(Math.round((1 + Math.floor(crew / 6) + (lap() >= 3 ? 1 : 0) + (g.bp.special === 'paras' ? GP.PARAS.EXTRA : 0)) * crewMul(state, 'raiders')), 1, 5);
    const sx = mx(g, g.bp.x0 + 80) + g.dx;
    const sy = deckYAt(g, mx(g, g.bp.x0 + 80)) + g.dy - 110;
    const CAT = geom().CAT;
    const fall = (P[CAT].y - sy) / G.PARA_FALL; // seconds to come down to our catwalk
    const aim = clamp(sx, P[CAT].x0 + 80, P[CAT].x1 - 80);
    if (fall < 1.5 || Math.abs(sx - aim) > G.PARA_STEER * fall * 0.7) return false; // can't reach us from here
    for (let i = 0; i < n; i++) {
      state.paras.push({ x: toWorldX(ours, sx + i * 50), y: toWorldY(ours, sy), vx: (sx > aim ? -120 : 120) + ours.pose.vx, vy: 0, hp: G.PARA_HP, t: -i * 0.35, tx: clamp(aim + rand(-200, 200), P[CAT].x0 + 40, P[CAT].x1 - 40), type: pickType ? pickType() : 'grunt' });
      S.dropped++;
    }
    sPuff(sx, sy, '#eee6d2', 8);
    warn('PARATROOPERS! SHOOT THEM DOWN!', 2.5);
    return true;
  };
  const updateParas = (dt) => {
    const vs = ours.pose.vx;
    const platformBelow = ours.nav.platformBelow;
    for (const p of state.paras) {
      p.t += dt;
      if (p.t < 0) { // (still stepping out the door: it goes along with her)
        p.x += vs * dt;
        continue;
      }
      const open = p.t > 0.5;
      p.vy += ((open ? G.PARA_FALL : 320) - p.vy) * Math.min(1, dt * 2);
      if (open) p.vx += (clamp((toWorldX(ours, p.tx) - p.x) * 1.2, -G.PARA_STEER, G.PARA_STEER) + vs - p.vx) * Math.min(1, dt * 1.5);
      const prevY = toShipY(ours, p.y);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      for (const sh of state.shells) {
        if (sh.life <= 0 || Math.hypot(sh.x - p.x, sh.y - p.y) > 42) continue;
        sh.life = 0;
        p.hp -= shellDmg(sh, p);
        puff(sh.x, sh.y, '#ffcf40', 6);
        if (p.hp <= 0) {
          p.dead = true;
          S.shot++;
          state.kills += 1;
          credit?.(sh);
          pop(state, p.x, p.y - 40, 'kill', '#ffd23f', 0.8);
          puff(p.x, p.y, '#ff5a1f', 10);
        }
        break;
      }
      if (p.dead) continue;
      const shipY = toShipY(ours, p.y);
      const shipX = toShipX(ours, p.x);
      const d = platformBelow(shipX, prevY);
      if (d !== null && shipY >= P[d].y) {
        p.dead = true;
        S.landed++;
        dropOne && dropOne(shipX, P[d].y - 4, p.type);
        sPuff(shipX, P[d].y - 10, '#eee6d2', 8);
      } else if (shipY > 1700 || p.t > 60 || inRock(state, p.x, p.y)) p.dead = true; // missed us and fell away
    }
    state.paras = state.paras.filter((p) => !p.dead);
  };

  // ---- Boarding her: the rope's swing across (and back) ----
  const inSwingRange = (g) => g.rope && gap(g) <= G.SWING_RANGE;
  const swingEnd = (g, out) => (out ? { wx: toWorldX(g.ship, g.bp.landX), wy: toWorldY(g.ship, g.bp.decks[0].y) } : { wx: toWorldX(ours, geom().MAIN_X1 - 30), wy: toWorldY(ours, P[geom().MAIN].y) });
  const swing = (player) => {
    const g = state.gunship;
    if (!g || !g.rope || player.swing || !inSwingRange(g)) return;
    const cur = shipOf(state, player);
    const out = cur !== g.ship; // (from our ship to hers, or back)
    const e = swingEnd(g, out);
    const sx = toWorldX(cur, player.x), sy = toWorldY(cur, player.y);
    // The swing path (a dip between the decks) must be clear of rock.
    for (let k = 1; k < 10; k++) {
      const u = k / 10;
      if (inRock(state, sx + (e.wx - sx) * u, sy + (e.wy - sy) * u + G.SWING_DIP * Math.sin(Math.PI * u))) {
        warn('Rock in the way!', 1.5);
        return;
      }
    }
    player.swing = { t: 0, out, from: { x: player.x, y: player.y } };
    player.lock = null;
    player.vx = 0;
    state.sfxQ && state.sfxQ.push(['swing']);
  };
  const swingStep = (p, dt) => {
    const s = p.swing;
    const g = state.gunship;
    const cur = shipOf(state, p);
    if (!g || !g.rope || g.phase === 'sinking') {
      // The line was cut or snapped (or she broke off) mid-swing.
      p.swing = null;
      fallOff(p);
      return;
    }
    s.t += dt / G.SWING_TIME;
    const k = Math.min(1, s.t);
    const e = k * k * (3 - 2 * k);
    // The far end follows her as she moves.
    const w = swingEnd(g, s.out);
    const end = { x: toShipX(cur, w.wx), y: toShipY(cur, w.wy) };
    p.x = s.from.x + (end.x - s.from.x) * e;
    p.y = s.from.y + (end.y - s.from.y) * e + G.SWING_DIP * Math.sin(Math.PI * k) - 40 * Math.sin(Math.PI * Math.min(1, k * 4)); // a hop off, then the dip
    p.face = end.x > s.from.x ? 1 : -1;
    p.moving = false;
    if (k >= 1) {
      p.swing = null;
      if (s.out) {
        transfer(state, p, g.ship, 0, g.bp.landX);
        p.vx = 0;
        onBoard(p);
      } else {
        transfer(state, p, ours, geom().MAIN, geom().MAIN_X1 - 30);
        p.vx = 0;
      }
    }
  };
  // Someone leaves her deck without a rope to stand on: they fall from where they are now (back in OUR ship's coordinates), and come round in our medical bay.
  const fallOff = (p) => {
    const cur = shipOf(state, p);
    const wx = toWorldX(cur, p.x), wy = toWorldY(cur, p.y);
    if (cur !== ours) transfer(state, p, ours);
    p.x = toShipX(ours, wx);
    p.y = toShipY(ours, wy);
    p.fall = true;
    p.lock = null;
    p.conn = null;
    p.air = false;
    p.fly = false;
    p.swing = null;
    p.jz = 0;
    p.tumble = false;
  };
  const dropAll = (g) => { for (const p of aboard(g)) fallOff(p); };
  // The crew, safe home (the gunship surrendered): carried to our medical bay.
  const sendAllHome = (g) => { for (const p of aboard(g)) { if (p.swing) p.swing = null; g.ship.sim.sendHome(p); } };

  // Landing on her deck knocks the nearby crew flying.
  const stomp = (p) => {
    const g = state.gunship;
    if (!g) return;
    const h = g.ship;
    h.sim.shipPuff(p.x, p.y - 10, '#ffffff', 12);
    state.rings && state.rings.push({ x: toWorldX(h, p.x), y: toWorldY(h, p.y - 20), t: 0.3, max: 0.3, r: G.STOMP_RANGE, color: '#ffffff' });
    state.sfxQ && state.sfxQ.push(['hit', true]);
    for (const c of crewOf(g)) {
      if (Math.abs(c.x - p.x) > G.STOMP_RANGE || Math.abs(c.y - p.y) > 60) continue;
      const pl = h.layout.platforms[c.d];
      c.ko = 1.2;
      c.x = clamp(c.x + 150, pl.x0 + 10, pl.x1 - 10); // (shoved away from the stern end, where you land)
      hurt(c, 1, p);
    }
  };
  const onBoard = (p) => {
    const g = state.gunship;
    if (!g) return;
    S.boarded++;
    if (!p.bot) { state.ev.warn = 3; state.ev.warnText = "YOU'RE ABOARD THE GUNSHIP!"; }
    state.sfxQ && state.sfxQ.push(['alarm']);
    stomp(p);
  };
  // A crew member of hers is hurt (a sword, a shove, a stomp); at zero he is dead.
  const hurt = (c, dmg) => {
    const g = state.gunship;
    if (!g || !g.ship.crewReg[c.id]) return;
    const h = g.ship;
    c.eHp -= dmg;
    h.sim.shipPuff(c.x, c.y - 50, '#ffffff', 6);
    if (c.eHp > 0) return;
    delete h.crewReg[c.id];
    c.lock = null;
    c.fall = true;
    state.kills += 1;
    S.kills++;
    h.sim.shipPop(c.x, c.y - 140, 'raider', '#ffd23f', 1);
    h.sim.shipPuff(c.x, c.y + 60, '#c0392b', 10);
    const lastGunner = c.role === 'gunner' && !hasRole(g, 'gunner');
    const what = { gunner: lastGunner ? 'GUNNERS DOWN - HER GUNS ARE SILENT!' : '', stoker: 'STOKER DOWN - HER GUNS RELOAD SLOWLY', helm: "HELMSMAN DOWN - SHE CAN'T STEER OR HOLD STATION" }[c.role];
    if (what) warn(what, 2.5);
  };

  // The charge is set: run!
  const plant = (player) => {
    const g = state.gunship;
    if (!g || g.charge) return;
    g.charge = { t: G.FUSE, by: player && player.id };
    S.charges++;
    warn('CHARGE SET! GET BACK TO THE SHIP!', 3);
  };
  // Her helm is taken: her crew strike their colours and she goes down quietly; our boarders are carried home. Supplies and salvage as for a charge.
  const captured = (player) => {
    const g = state.gunship;
    if (!g || g.captured || g.phase === 'sinking' || g.phase === 'leaving') return;
    g.captured = true;
    S.captured++;
    warn('THE GUNSHIP SURRENDERS! HER HELM IS YOURS - SUPPLIES ABOARD', 4);
    sink(true, true);
  };

  // She is done: shot down (byCrew false), blown up by the charge (byCrew), or taken (quiet). She sinks for a few seconds, then she is gone.
  const sink = (byCrew, quiet = false) => {
    const g = state.gunship;
    if (!g || g.phase === 'sinking') return;
    const h = g.ship;
    g.phase = 'sinking';
    g.sink = 0;
    g.intent = 'sinking';
    setRope(false);
    if (quiet) sendAllHome(g); else dropAll(g);
    if (!quiet) {
      for (let k = 0; k < 8; k++) sPuff(rand(g.bp.x0, g.bp.x1) + g.dx, rand(g.bp.bagTop + 80, g.bp.hullBot) + g.dy, k % 2 ? '#ff5a1f' : '#555', 24);
      sPop(g.bp.cx + g.dx, g.bp.bagTop + 80 + g.dy, 'boss', '#ff5a1f', 1.6);
      ours.state.shake = Math.max(ours.state.shake, 0.5);
    }
    state.kills += 1 + crewOf(g).length;
    if (byCrew) {
      // Spoils: patch the hull, fill the firebox, top up guns and bombs.
      ours.state.hull = Math.min(100, ours.state.hull + G.REWARD_HULL);
      ours.state.fuel = Math.min(config.BOILER.FUEL_MAX, ours.state.fuel + G.REWARD_COAL);
      for (const gun of Object.values(ours.ctx.GUNS)) gun.ammo = Math.min(gun.max, gun.ammo + 8);
      ours.ctx.bombBay.bombs = Math.min(config.BOMBS.MAX, ours.ctx.bombBay.bombs + 2);
      if (!quiet) warn('GUNSHIP DESTROYED! SUPPLIES ABOARD: HULL, COAL AND AMMO', 4);
    } else warn('GUNSHIP SHOT DOWN!', 3);
    for (const c of crewOf(g)) { c.lock = null; delete h.crewReg[c.id]; }
    // her ship breaks up: wrecked, the gasbag empties, she falls
    if (!(h.state.down > 0)) {
      h.state.hull = 0;
      h.state.down = config.WRECK.TIME;
      h.ctx.wreck = { t: 0, lap: lap(), kills: state.kills };
      h.state.shake = 1.5;
    }
    h.state.gas = Math.min(h.state.gas, 5);
  };

  // She breaks off: the rope goes, anyone still on her falls.
  const leave = (text, secs) => {
    const g = state.gunship;
    if (g.rope) setRope(false);
    dropAll(g);
    g.phase = 'leaving';
    g.intent = 'flee';
    g.mode = 'station';
    warn(text, secs);
  };

  // She turns to latching on (a boarder captain, a harpoon, or her guns being down).
  const startLatch = (g, text) => {
    g.phase = 'latch';
    g.latchCd = g.bp.special === 'ramp' ? GP.RAMP.LATCH_CD : 1;
    g.paraDue = false;
    g.node = null; // (planStep will now send her alongside)
    warn(text, 3.5);
  };

  // Remove her from the sky (gone, sunk, or the mission ended).
  const remove = () => {
    const g = state.gunship;
    if (!g) return;
    setRope(false);
    dropAll(g);
    for (const c of crewOf(g)) delete g.ship.crewReg[c.id];
    removeShip(g.ship);
    state.gunship = null;
  };

  // ---- our shells hit her: a gun port first (it has hit points; at zero its gun is broken), then her hull and gasbag ----
  const hitByShells = (g) => {
    const h = g.ship, mods = h.ctx.modules || [];
    for (const sh of state.shells) {
      if (sh.life <= 0 || sh.from === h.id) continue;
      const sx = toShipX(h, sh.x), sy = toShipY(h, sh.y);
      const k = g.ports.findIndex((pt, i) => !pt.dead && Math.hypot(sx - g.bp.weapons[i].x, sy - g.bp.weapons[i].y) < G.PORT_RADIUS);
      if (k >= 0) {
        const w = g.bp.weapons[k], pt = g.ports[k];
        sh.life = 0;
        g.hit = 0.1;
        pt.hp -= shellDmg(sh, g);
        puff(sh.x, sh.y, '#ffcf40', 8);
        if (pt.hp <= 0) {
          pt.dead = true;
          S.portsDown++;
          const m = mods.find((q) => q.name === g.info.guns[k]);
          if (m) h.sim.modules.damage(m, 999);
          h.sim.shipPuff(w.x, w.y, '#ff5a1f', 16);
          h.sim.shipPop(w.x, w.y - 50, 'kill', '#ffd23f', 1);
          if (g.ports.some((q) => !q.dead)) warn('GUN PORT DOWN!', 2);
        }
        continue;
      }
      if (!h.sim.hitsShip(sx, sy)) continue;
      sh.life = 0;
      g.hit = 0.15;
      const before = h.state.hull;
      h.sim.impact(sx, sy, (GS().HIT_POWER * shellDmg(sh, g)) / config.GUNS.DAMAGE);
      if (before > 0 && h.state.hull <= 0 && !g.credited) { g.credited = true; credit?.(sh); }
    }
  };

  // ---- the director's step (the world calls it after the ships have moved) ----
  const update = (dt) => {
    updateParas(dt);
    const g = state.gunship;
    if (!g) return;
    const h = g.ship;
    // Her ship was taken out of the sky (a new mission, a restart)? She is gone.
    if (!state.ships.includes(h)) { state.gunship = null; return; }
    syncPose(g);
    refreshCrew(g);
    h.rival = fillRival(h.rival, ours, dt);
    g.hit = Math.max(0, g.hit - dt);
    if (g.phase === 'sinking') {
      g.sink += dt;
      command(g, dt, 'dead');
      if (g.sink > 4) remove();
      return;
    }
    // Wrecked (her hull gave out)?
    if (h.state.down > 0 || h.ctx.wreck) {
      sink(false);
      return;
    }
    if (g.phase === 'leaving') {
      command(g, dt, 'leave');
      if (Math.abs(g.dx) > G.GONE_DIST || Math.abs(g.dy) > G.GONE_DIST) remove();
      return;
    }
    // Her captain picks where to go (ring spots / free space), her helmsman flies there, rock pushes her out (course.js, her own contact).
    const tgt = planStep(g, dt);
    command(g, dt, 'hold', tgt);
    ropeStep(g, dt);
    g.gap = gap(g);
    const cc = h.ctx.course;
    const touched = !!(cc && cc.scraping);
    // No room to manoeuvre for a long while (or grinding along rock)? She breaks off.
    g.rockT = g.noRoom ? (g.rockT || 0) + dt : touched ? (g.rockT || 0) + dt * 0.5 : Math.max(0, (g.rockT || 0) - dt * 0.5);
    if (touched) S.contacts++;
    if (g.rockT > G.ROCK_BREAKOFF) {
      S.breakoffs++;
      leave('THE GUNSHIP BREAKS OFF!', 2);
      return;
    }
    // Lost her (or left her far behind)?
    if (Math.abs(g.dx) > G.GONE_DIST || Math.abs(g.dy) > G.GONE_DIST) {
      remove();
      return;
    }
    const contact = g.rope || g.charge || aboardAny();
    // What her captain is up to (shown on her mast pennant).
    g.intent = g.phase === 'latch' ? 'latch' : g.phase === 'approach' ? 'approach' : g.mode === 'retreat' ? 'retreat' : g.mode === 'strafe' ? 'strafe' : g.paraDue || (g.node && G.NODES[g.node].drop && g.arrived) ? 'climb' : 'attack';
    // Badly hurt with her one retreat used up: she runs for it.
    if (g.phase === 'hunt' && !contact && hullF(g) < g.cap.fleeAt && g.retreats >= g.cap.retreats) {
      S.flees++;
      leave('THE GUNSHIP IS BADLY HIT AND FLEES!', 2.5);
      return;
    }
    // Her stern guns (which swing round to face us when she turns) track our hull.
    const bp = g.bp;
    const cp = (() => { const k = g.bp.weapons.findIndex((w) => w.kind === 'cannon'); return { x: mx(g, g.bp.weapons[k].x), y: g.bp.weapons[k].y }; })();
    const gpx = cp.x + g.dx;
    const midY = bp.decks[0].y + 20; // the stern deck level (her ports are stacked at the stern end)
    g.aim = Math.atan2(AIM.y - (midY + g.dy), AIM.x - gpx);
    g.dist = Math.hypot(gpx - AIM.x, midY + g.dy - AIM.y); // from her guns to our hull
    g.hangarOpen = Math.max(0, g.hangarOpen - dt);
    g.harpFlash = Math.max(0, g.harpFlash - dt);
    if (bp.special === 'ramp') g.ramp += ((g.phase === 'latch' ? (g.rope ? 1 : 0.35) : 0) - g.ramp) * Math.min(1, dt * 2.5);
    if (g.phase === 'approach') {
      // Engaged once she is close to where she is heading.
      if (!tgt.hold && Math.abs(g.dx - tgt.dx) < G.DOCK_DX && Math.abs(g.dy - tgt.dy) < G.DOCK_DY) g.phase = 'hunt';
      // Can't get in (rock, or she's stuck behind us)? She gives up rather than hanging there forever.
      else if ((g.approachT = (g.approachT || 0) + dt) > G.APPROACH_GIVEUP) leave('THE GUNSHIP GIVES UP THE CHASE', 2);
      return; // (our shells fly through her until she is on station, as they always did)
    }
    // She can fire from a firing spot, or on the run leg of a strafing pass - and only with her stern facing us.
    const inPos = g.bears && !g.turn && !tgt.hold && (g.mode === 'strafe' ? g.wp.length <= 1 : tgt.dist < 450 && tgt.fire);
    g.inPos = inPos;
    if (g.mode !== 'retreat') g.docked += dt;
    if (g.docked > G.STAY && !g.charge) {
      leave('THE GUNSHIP PULLS AWAY', 2);
      return;
    }
    // Her systems: who's at their post?
    const gunners = crewOf(g).filter((c) => c.role === 'gunner' && c.lock && h.layout.kindOf(c.lock) === 'gun').length;
    const helm = hasRole(g, 'helm');
    g.posts = { guns: gunners, steam: hasRole(g, 'stoker'), helm };
    // No helmsman: once nobody's aboard her, she drifts off.
    g.adrift = helm ? 0 : aboardAny() ? g.adrift : g.adrift + dt;
    if (g.adrift > G.DRIFT_TIME && !g.charge) {
      leave('NOBODY AT HER HELM - THE GUNSHIP DRIFTS AWAY', 2.5);
      return;
    }
    // Broadsides at our hull (with a glow first) - only while her gunners are at the guns, on a firing spot, in range, with a clear line.
    const alive = g.ports.map((pt, k) => k).filter((k) => !g.ports[k].dead && g.ports[k].kind === 'cannon');
    let canFire = g.phase === 'hunt' && gunners > 0 && alive.length > 0 && !g.charge && !ours.state.down && inPos && g.dist < G.FIRE_RANGE;
    if (canFire) canFire = lineClear(g, alive[0]);
    g.canFire = canFire;
    const steamF = 0.5 + 0.5 * clamp(g.steam / 0.4, 0, 1); // (a cold boiler slows her reloads)
    g.fireOk = canFire && (g.fireCd -= dt * steamF) <= 0; // a broadside is due: the first manned cannon that bears fires it (shoot())
    if (!canFire) g.fireCd = Math.max(g.fireCd, g.mode === 'strafe' ? 0.8 : 1.5); // a fresh gunner / a new spot needs a moment
    const heavyOk = g.phase === 'hunt' && gunners > 0 && !g.charge && !ours.state.down;
    g.heavyReady = {};
    const gunsOf = h.ctx.GUNS;
    g.ports.forEach((pt, k) => {
      if (pt.dead) return;
      const gn = gunsOf[g.info.guns[k]];
      if (pt.kind === 'cannon') {
        pt.glow = canFire && g.fireCd < 1; // (the muzzles glow just before a broadside)
        return;
      }
      const w = g.bp.weapons[k];
      const px = toShipX(ours, toWorldX(h, w.x)), py = toShipY(ours, toWorldY(h, w.y));
      const d = Math.hypot(px - AIM.x, py - AIM.y);
      const C = pt.kind === 'turret' ? GP.TURRET_GUN : pt.kind === 'mortar' ? GP.MORTAR_GUN : GP.FLAK_GUN;
      const ready = heavyOk && d < C.RANGE && (pt.kind === 'mortar' || lineClear(g, k));
      g.heavyReady[k] = ready;
      pt.glow = ready && !!gn && gn.cd < 0.8;
    });
    g.warnFire = canFire && g.fireCd < 1;
    // Dead weapons smoke.
    g.ports.forEach((pt, k) => {
      if (!pt.dead || Math.random() >= dt * 5) return;
      const w = g.bp.weapons[k];
      h.sim.shipPuff(w.x + (Math.random() - 0.5) * 30, w.y, '#555', 1);
    });
    // Captain's moves: a BOARDER latches on after a while, a HARPOON gun fires her grapple from range.
    if (g.phase === 'hunt' && g.mode !== 'retreat') g.huntT += dt;
    if (g.phase === 'hunt' && g.cap.latchAfter && g.huntT > g.cap.latchAfter && !g.charge && !g.rope) startLatch(g, 'HER BOARDERS ARE COMING IN TO LATCH ON!');
    if (g.phase === 'hunt' && bp.special === 'harpoon' && !g.rope && !g.charge && g.mode === 'station' && !h.pose.turn && !aboardAny() && (g.harpT -= dt) <= 0) {
      if (g.gap <= GP.HARPOON.RANGE) {
        g.harpT = GP.HARPOON.EVERY;
        g.harpFlash = 0.5;
        S.harpoons++;
        startLatch(g, 'HARPOON! SHE FIRES HER GRAPPLE - CUT THE LINE AT THE BOW OR BOARD HER!');
        setRope(true);
        g.herRope = true;
        S.latches++;
        state.sfxQ && state.sfxQ.push(['swing']);
      } else g.harpT = 2;
    }
    // A bat hangar launches a small swarm now and then.
    if (g.phase === 'hunt' && bp.special === 'hangar' && !g.charge && !ours.state.down && spawnBats && (g.hangarT -= dt) <= 0) {
      if (state.bats.filter((b) => !b.dead && b.hp > 0).length >= GP.HANGAR.MAX_BATS) g.hangarT = 4;
      else {
        spawnBats({ x: toWorldX(h, bp.hangar.x), y: toWorldY(h, bp.hangar.y) }, GP.HANGAR.BATS + Math.floor(lap() / 3));
        S.bats++;
        g.hangarOpen = 1.6;
        g.hangarT = GP.HANGAR.EVERY * rand(0.85, 1.2);
      }
    }
    // Guns all down, or no gunners left: she gives up the broadside duel and latches on.
    if (g.phase === 'hunt' && (!g.ports.some((q) => !q.dead) || !hasRole(g, 'gunner'))) startLatch(g, "HER GUNS ARE DOWN! SHE'S COMING IN TO LATCH ON!");
    // Paratroopers: now and then, from a high spot, raiders jump from her deck and parachute down onto us.
    if (g.phase === 'hunt' && !g.rope && (g.paraT -= dt) <= 0) {
      g.paraDue = true;
      const high = g.arrived && g.node && G.NODES[g.node].drop;
      if (high) {
        if (state.paras.length >= G.PARA_MAX_AIR || ours.ctx.boarders.length >= G.PARA_MAX_BOARDERS || ours.state.down) g.paraT = 3;
        else if (dropParas(g)) {
          S.climbs++;
          g.paraDue = false;
          g.paraT = rand(G.PARA_EVERY_MIN, G.PARA_EVERY_MAX) * (g.bp.special === 'paras' ? GP.PARAS.EVERY_MUL : 1);
          g.stayT = Math.min(g.stayT, 3);
        } else g.paraT = 2;
      }
    }
    // Latching on: close in alongside and fire her own grapple at our bow...
    if (g.phase === 'latch') {
      g.latchCd = Math.max(0, g.latchCd - dt);
      const latchRange = G.LATCH_RANGE * (g.bp.special === 'ramp' ? GP.RAMP.LATCH_RANGE : g.bp.special === 'harpoon' ? GP.HARPOON.LATCH_RANGE : 1);
      if (!g.rope && g.latchCd <= 0 && g.gap <= latchRange) {
        setRope(true);
        g.herRope = true;
        S.latches++;
        state.sfxQ && state.sfxQ.push(['swing']);
        warn('SHE FIRES HER GRAPPLE! CUT THE LINE AT THE BOW - OR BOARD HER!', 3.5);
      }
      // ...then her guards (and deckhands) cross the rope to board us.
      if (g.rope && (g.sendT += dt) >= G.LATCH_SEND_EVERY * (g.bp.special === 'ramp' ? GP.RAMP.SEND_MUL : 1)) {
        g.sendT = 0;
        const guard = crewOf(g).find((c) => c.role === 'guard');
        if (guard || g.extra > 0) {
          if (guard) { delete h.crewReg[guard.id]; guard.lock = null; }
          else g.extra--;
          S.sent++;
          dropOne && dropOne(geom().BOW.x - 70 + rand(-40, 40), P[geom().MAIN].y - 70, pickType ? pickType() : 'grunt');
          sPuff(geom().BOW.x - 40, geom().BOW.y - 40, '#d8c79a', 8);
          warn('RAIDERS CROSSING HER ROPE!', 2);
        }
      }
    }
    // The fuse.
    if (g.charge && (g.charge.t -= dt) <= 0) {
      sink(true);
      return;
    }
    // Crew: cut the rope if nobody's coming; a guard takes over an empty post; the guards patch her hull while nobody's aboard.
    g.ropeT = g.rope ? (g.ropeT || 0) + dt : 0;
    const foes = hostiles(g);
    const guards = crewOf(g).filter((c) => c.role === 'guard');
    const empty = ['helm', 'gunner', 'stoker'].find((r) => !hasRole(g, r));
    g.refill = empty && guards.length && !foes.length ? g.refill + dt : 0;
    if (g.refill > G.REFILL_TIME) {
      g.refill = 0;
      guards[0].role = empty;
      guards[0].botJob = null;
    }
    const perHp = 100 / g.max; // (the old gunship counted hull in hit points: the same repairs, as a share of her hull)
    if (!foes.length && guards.length && h.state.hull < 100) h.state.hull = Math.min(100, h.state.hull + G.REPAIR_RATE * guards.length * perHp * dt);
    // Retreat: once she is clear of the fight her crew patch the hull and the engines (hammering along the hull), then she comes back.
    if (g.mode === 'retreat') {
      g.repT += dt;
      if (g.atRetreat) {
        h.state.hull = Math.min(100, h.state.hull + (G.REPAIR_SEA + 0.2 * guards.length) * perHp * dt);
        if ((g.hammerT -= dt) <= 0) {
          g.hammerT = rand(0.25, 0.5);
          sPuff(rand(g.bp.x0 + 100, g.bp.x1 - 100) + g.dx, g.bp.hullBot - 50 + g.dy, '#d8c79a', 3);
        }
      }
      if (hullF(g) >= G.RETURN_AT || g.repT > G.RETREAT_MAX) {
        endMode(g);
        warn('THE GUNSHIP IS BACK, PATCHED UP!', 2.5);
      }
    }
    // Her guard hacks through the rope when nobody is coming (the old behaviour: the first guard, after 3 s of rope, with nobody aboard, CUT_TIME seconds of hacking)
    if (g.rope && g.phase === 'hunt' && !foes.length && g.ropeT > 3 && guards.length) {
      g.cutT = (g.cutT || 0) + dt;
      if (g.cutT > G.CUT_TIME) {
        g.cutT = 0;
        snap('THEY CUT THE ROPE!');
      }
    } else g.cutT = 0;
    hitByShells(g);
  };

  // A crew member's sword (or shove) against the gunship's crew: aboard her, shipSim.js handles it (foeInReach / hitCrew).
  const hitCrew = () => false;

  // The crew hacked through her grapple line.
  const cutLine = () => {
    const g = state.gunship;
    if (!g || !g.rope) return;
    S.cut++;
    snap('YOU CUT HER GRAPPLE LINE!');
  };

  // What a player standing here could do with the gunship.
  const interaction = (player) => {
    const g = state.gunship;
    if (!g || !engaged(g)) return null;
    if (shipOf(state, player) === g.ship) { // aboard her (our boarders only: her own crew have nothing to do with the rope)
      if (!hostileTo(player, g.ship)) return null;
      if (g.rope && inSwingRange(g) && player.d === 0 && Math.abs(player.x - g.bp.landX) < 110) return { type: 'swing', label: 'Swing back!' };
      return null;
    }
    if (player.d !== geom().MAIN) return null;
    if (player.x > geom().MAIN_X1 - 45) {
      if (!g.rope) return { type: 'hook', label: g.turn ? 'She is turning round!' : gap(g) <= G.HOOK_RANGE ? 'Fire hookshot!' : 'Too far to hook!' };
      if (inSwingRange(g)) return { type: 'swing', label: 'Swing across!' };
    }
    // Her grapple is on our bow: hack through the line (just behind the swing spot).
    if (g.phase === 'latch' && g.rope && player.x > geom().MAIN_X1 - 175) return { type: 'cutline', obj: g.cutObj, hold: true, time: G.CUT_HOLD, label: 'Cut her grapple line!' };
    return null;
  };

  // Fire the grapple: it only catches while she's within range. Returns whether it caught.
  const fireHook = () => {
    const g = state.gunship;
    if (!g || g.rope || g.turn || gap(g) > G.HOOK_RANGE) return false;
    setRope(true);
    state.sfxQ && state.sfxQ.push(['swing']);
    return true;
  };

  const reset = () => {
    if (state.gunship) remove();
    state.paras.length = 0;
  };

  // Called again after the course has moved this step: a new map has begun (our altitude jumped): she is gone.
  const settle = () => {
    if (state.gunship && state.course && state.course.justStarted) reset();
  };

  // Calm: she breaks off unless crew are fighting aboard or hooked to her. True once she is gone or going.
  const retire = () => {
    const g = state.gunship;
    if (!g || g.phase === 'leaving' || g.phase === 'sinking') return true;
    if (g.rope || g.charge || aboardAny()) return false;
    leave('THE GUNSHIP BREAKS OFF!', 2);
    return true;
  };

  // Her landing surfaces are her ship's own decks (simulation.js rivalDecks): nothing extra here.
  const surface = () => null;
  const land = () => {};
  const walk = () => {};

  return {
    asShip: true,
    update, settle, reset, retire, cutLine, interaction, fireHook, plant, captured, hitCrew, swing, swingStep, walk, land, surface,
    deckAt: (p) => (state.gunship ? { x: p.x + state.gunship.dx, y: p.y + state.gunship.dy } : null),
    inSwingRange: () => !!state.gunship && inSwingRange(state.gunship),
    inHookRange: () => !!state.gunship && gap(state.gunship) <= G.HOOK_RANGE,
    spawn: (opt) => !state.gunship && spawn(opt),
  };
}
