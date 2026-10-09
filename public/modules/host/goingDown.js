// "GOING DOWN!" - the ship's last stand (once per mission): her LIFT has to beat her WEIGHT again.
//
// When the hull first reaches 0 in a mission she does not break up. She FALLS for GOING_DOWN.TIME seconds, nothing can hurt her meanwhile, and the TV shows a big LIFT vs WEIGHT balance bar
// made of the real numbers of the flight (measure()):
//   WEIGHT  the build's weight plus what moves (balance.js: crew, coal in the firebox, shells, bombs, loads on the decks, what is carried), the cargo still in the racks - less the coal
//           bunker's stock if the crew has dumped it. Falls the moment something goes overboard.
//   LIFT    the gasbags' lift (by size, and by how much gas they hold: the torn bags start nearly flat), the hot gas of a boiler at overdrive, engines pointing up (engines.js) - less the lift
//           a lopsided ship spills (dump evenly!).
// The ways to bring the two together, each a job for the crew (job arrows on the phones, jobsFor; bots, botJobs):
//   DUMP WEIGHT  cargo that shook loose on the decks is shovelled overboard (the SHOVEL job, cargo.js); hold Action at the bomb bay to let the bomb load go; hold Action at the coal
//                bunker to dump its stock (then there is nothing to stoke with, and the bunker stays empty a while after);
//   PATCH + PUMP the glowing gasbag leaks must be patched (they lose gas fast), and a hand at the helm pumps the bags full again;
//   FULL STEAM   coal into the boiler: more pressure = hotter gas = more lift - but past BOILER.WARN_AT the boiler can blow, so somebody VENTS the steam;
//   CUT AWAY     the last resort: hold Action at a marked joint to cut a heavy section away (breakOff.js, cause 'jettison'; lost until the sky-dock rebuilds it).
// Lift beating weight by MARGIN for HOLD seconds = "SHE HOLDS!" (hull SURVIVE_HULL, levelled out). Otherwise the normal wreck happens (so voyages may limp home on a spare gasbag).
//
// This file owns the rules; shipSim.js / simulation.js call the small hooks (tryStart, active/protect, onStoke, update, holdAction/perform, pumpMul, newMission).
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { altBounds } from './course.js';
import { pop } from './popups.js';
import { refillBags } from './gasBags.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';
import { planBreak, makeRng } from './breakOff.js';

const GD = config.GOING_DOWN;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Worked out per ship layout (rebuilt when a new ship build is applied to it).
const tables = layoutTables((L) => ({
  MAIN_D: L.deckIndex('main'),
  LOWER_D: L.deckIndex('lower'),
  BOILER: L.one('boiler'), // (GOING DOWN! is about the first boiler; a ship with several still has the one steam pool)
  COAL: L.one('coal'),
  HELM: L.one('helm'),
  BAY: L.one('bombBay'),
}));

// Is the coal bunker empty because the crew dumped it (bots do not walk to it then)?
export const bunkerEmpty = (state) => (state.gdCoalOut || 0) > 0 || !!(state.goingDown && state.goingDown.coalGone);

export function createGoingDown({ state, phoneFx, puff, shipPuff, wreck, gasHoleAt, getCargo, breakOff }) {
  const cargo = { place: (...a) => getCargo().place(...a), spawn: (...a) => getCargo().spawn(...a), worldAt: (...a) => getCargo().worldAt(...a) }; // (cargo.js is made after this, shipSim.js)
  const ship = mainShip(state); // (the ship that falls: one of these per ship)
  const L = ship.layout;
  const tb = () => tables(L);
  const shipPop = (x, y, kind, color, size) => pop(state, toWorldX(ship, x), toWorldY(ship, y), kind, color, size); // (a point on the ship)
  let used = false; // the last stand has been used in this mission
  state.goingDown = null; // { t, time, lift, weight, need, hold, m, holes, joints, ... } (see tryStart)
  state.gdBanner = null; // { text, sub, color, t, max } big words in the middle of the TV
  state.gdGrace = 0; // seconds she cannot be hurt after holding
  state.gdCoalOut = 0; // seconds the coal bunker stays empty (it was dumped)

  const crewCount = () => Math.max(1, Object.values(state.players).filter((p) => p.connected !== false && !p.mate).length);
  const say = (text, secs = 3) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const humans = () => Object.values(state.players).filter((p) => !p.bot && p.connected !== false);
  const openHoles = (g) => g.holes.filter((h) => state.gasHoles.includes(h));
  const helmManned = (except) => Object.values(state.players).some((q) => q !== except && q.connected !== false && L.kindOf(q.lock) === 'helm');

  // ---- the numbers ----
  // Her lift and her weight now, in gas points (the scale a gasbag's size is quoted in: she hovers at GAS.NEUTRAL + weight - lift). `coalShed`: the bunker's stock already dumped.
  const measure = (coalShed = 0) => {
    const G = config.GAS, E = config.ENGINES, B = config.BALANCE, W = B.LIVE_MASS, CG = config.CROSS.CARGO;
    const bal = state.balance || {}, env = state.env || {}, od = state.overdrive || 0;
    const pf = clamp(state.ship.press / 50, 0.05, 1);
    let engines = 0;
    for (const e of state.engines || []) if (e.works && e.up) engines += e.up * E.LIFT_GAS * pf * (env.engine || 1) * (1 + config.BOILER.OD_ENGINE * od); // (an engine pointing up lifts, one pointing down drags)
    const gasPts = state.ship.gas - (env.sink || 0) - (state.liftDeficit || 0) + (env.lift || 0) / G.LIFT - G.NEUTRAL; // (what the pump has put in, above the neutral fill)
    const bags = L.balance.bagLift + gasPts;
    const steam = GD.STEAM_LIFT * od;
    const trim = (GD.TRIM_LOSS * Math.max(0, Math.abs(bal.dx || 0) - B.LEVEL_PX)) / 100;
    // weight, and what it is made of
    const loads = (state.loads || []).reduce((n, ld) => n + ld.w, 0);
    const carried = Object.values(state.players).reduce((n, p) => n + (p.d == null || p.fall || p.air || p.fly || p.connected === false ? 0 : (CG.ITEMS[p.carry] || { w: 0 }).w), 0);
    let racks = 0;
    for (const r of L.racks) if (CG.ITEMS[r.kind] && (r.kind === 'sandbag' || r.kind === 'crate')) racks += CG.ITEMS[r.kind].w * (state.rackStock && state.rackStock[`${r.p}@${r.x}`] != null ? state.rackStock[`${r.p}@${r.x}`] : CG.STOCK);
    const bombs = (state.bombBay ? state.bombBay.bombs : 0) * W.bomb;
    const coalBin = coalShed ? 0 : tb().COAL ? GD.DUMP.COAL_WEIGHT : 0;
    const coal = state.ship.fuel * W.fuel + coalBin;
    const cargoW = loads + carried + racks;
    const weight = (bal.mass || L.balance.mass) + (bal.live || 0) + racks - coalShed;
    return { lift: bags + steam + engines - trim, weight, bags, gas: state.ship.gas, steam, engines, trim, cargo: cargoW, bombs, coal, hull: weight - cargoW - bombs - coal };
  };

  // ---- the emergency ----
  const protect = () => !!state.goingDown || state.gdGrace > 0; // nothing can hurt her
  const active = () => !!state.goingDown;
  const pumpMul = () => (state.goingDown ? GD.PUMP_MUL : 1); // (the torn bags take only part of what the pump sends)

  const spawnHoles = (g) => {
    const want = g.required;
    const pool = state.gasHoles.filter((h) => !h.gd).slice(0, want);
    g.holes = pool;
    let guard = 0;
    while (g.holes.length < want && guard++ < 40) {
      let x = 400 + Math.random() * 640;
      const nb = L.gasbags.length, bag = nb > 1 ? L.gasbags[g.holes.length % nb] : null; // (several bags: the leaks are spread over them, one bag after another)
      if (bag) x = clamp(x, bag.x0 + 30, bag.x1 - 30);
      if (g.holes.some((h) => Math.abs(h.x - x) < 140)) continue;
      const h = gasHoleAt(x, L.gasbag.cy + 120, bag ? g.holes.length % nb : undefined);
      h.prog = 0;
      state.gasHoles.push(h);
      g.holes.push(h);
    }
    for (const h of g.holes) h.gd = true;
  };

  // The cargo that shakes loose on her decks (spread along the main and lower decks, crates and sandbags in turn, so the loads are even): returns the weight added.
  const spawnCargo = (n) => {
    const C = GD.CARGO, decks = [tb().MAIN_D, tb().LOWER_D].filter((d, i, a) => d >= 0 && a.indexOf(d) === i);
    const count = clamp(Math.round(C.BASE + n * C.PER_CREW), C.MIN, C.MAX);
    let w = 0;
    if (!decks.length) return w;
    for (let k = 0; k < count; k++) {
      const d = decks[k % decks.length], pl = L.platforms[d];
      const x = pl.x0 + 80 + ((pl.x1 - pl.x0 - 160) * ((k * 0.618 + 0.17) % 1)); // (a golden-ratio spread: the loads fall on both ends and the middle)
      const ld = cargo.place(k % 2 ? 'sandbag' : 'crate', d, x);
      w += ld.w;
    }
    return w;
  };

  // The marked joints where a heavy section can be cut away: the ends of the decks, tried with the break-off planner; the heaviest ones that do not take the helm, a boiler, a coal
  // bunker or a gasbag with them. { d, x (a spot on the part that stays), label, mass, spec, prog }.
  const findJoints = () => {
    if (!L.parts) return [];
    const C = GD.CUT, BO = config.BREAKOFF, found = [];
    const keep = new Set(['helm', 'boiler', 'coal']);
    L.platforms.forEach((q, d) => {
      for (const side of [-1, 1]) {
        const spec = { kind: 'limb', x: side < 0 ? q.x0 : q.x1, y: q.y, reach: 40, len: BO.HIT.LIMB, cause: 'jettison' };
        let plan;
        try { plan = planBreak(L.parts, spec, makeRng(7)); } catch { continue; }
        if (!plan || !plan.ok || plan.mass < C.MIN_MASS || plan.bags.length) continue;
        if (plan.names.some((nm) => keep.has(L.kindOf(nm)))) continue;
        const cut = plan.cuts[0];
        if (!cut) continue;
        let jd = d, jx, edge;
        if (cut.whole) { // a small deck goes whole: stand where its ladder meets the deck above
          const c = L.connectors.find((o) => o.bottom === d || o.top === d);
          if (!c) continue;
          jd = c.top === d ? c.bottom : c.top;
          jx = edge = jd === c.top ? c.xTop : c.xBottom;
        } else {
          edge = cut.a <= cut.x0 + 0.5 ? cut.b : cut.a; // (where the deck is cut; he stands 60 px inside what stays)
          jx = cut.a <= cut.x0 + 0.5 ? cut.b + 60 : cut.a - 60;
        }
        if (jd == null || jd < 0 || !L.platforms[jd]) continue;
        const names = plan.names.length ? plan.names.slice(0, 2).join(' & ') + (plan.names.length > 2 ? ` +${plan.names.length - 2}` : '') : cut.name || 'a section'; // (what goes with it)
        found.push({ d: jd, x: jx, edge, label: names.toLowerCase(), mass: plan.mass, spec, prog: 0, worked: false, cutId: cut.id });
      }
    });
    found.sort((a, b) => b.mass - a.mass);
    const out = [];
    for (const j of found) if (out.length < C.MAX_JOINTS && out.every((o) => o.cutId !== j.cutId && !(o.d === j.d && Math.abs(o.x - j.x) < 250))) out.push(j);
    return out;
  };

  const tryStart = () => {
    if (!GD.ENABLED || used || state.goingDown || state.ship.down || state.phase !== 'flying') return false;
    used = true;
    const n = crewCount();
    const g = (state.goingDown = {
      t: 0,
      time: GD.TIME + GD.TIME_PER_MISSING * clamp(8 - n, 0, 6),
      crew: n,
      required: clamp(GD.LEAKS_MIN + Math.floor((n - 1) / 3), GD.LEAKS_MIN, GD.LEAKS_MAX),
      holes: [],
      joints: [],
      hold: 0, // seconds her lift has beaten her weight in a row
      need: 0, need0: 1, // how many points short she is (weight + margin - lift)
      coalShed: 0, // the coal bunker's stock dumped (weight points)
      coalGone: false,
      cuts: 0,
      dumped: 0,
      m: null,
      bombJob: null,
      coalJob: null,
      beep: 0,
    });
    if (tb().COAL) g.coalJob = { d: tb().COAL.d, x: tb().COAL.x, prog: 0, worked: false };
    if (tb().BAY) g.bombJob = { d: tb().BAY.d, x: tb().BAY.x, prog: 0, worked: false };
    spawnHoles(g);
    spawnCargo(n);
    // The torn bags have lost most of their gas.
    for (const b of state.bags) b.gas = Math.min(b.gas, GD.START_GAS);
    g.joints = findJoints();
    g.m = measure();
    g.need = g.m.weight + GD.MARGIN - g.m.lift;
    g.need0 = Math.max(10, g.need);
    state.ship.hull = GD.HOLD_HULL;
    state.ship.shake = 1.4;
    say('GOING DOWN! DUMP THE WEIGHT - PATCH AND PUMP - FULL STEAM!', 5);
    state.sfxQ.push(['alarm']);
    for (const p of humans()) phoneFx(p, 'GOING DOWN! Lift must beat weight: dump cargo overboard, patch the glowing leaks, pump, stoke the boiler (and vent it)!', [200, 80, 200, 80, 400]);
    return true;
  };

  const finish = () => {
    const g = state.goingDown;
    if (g) for (const h of g.holes) delete h.gd;
    state.goingDown = null;
  };

  const succeed = (why) => {
    const g = state.goingDown;
    if (g && g.coalGone) state.gdCoalOut = GD.DUMP.COAL_REFILL; // (the bunker was dumped: it stays empty a while)
    finish();
    state.ship.hull = GD.SURVIVE_HULL;
    state.ship.vy = 0;
    state.ship.shake = 1.2;
    for (const b of state.bags) b.gas = Math.min(b.gas, config.GAS.NEUTRAL + GD.LEVEL_GAS); // (pumped full to save her: she levels out gently instead of shooting up)
    refillBags(state, config.GAS.NEUTRAL + 6);
    state.gdGrace = GD.GRACE;
    state.gdBanner = { text: 'SHE HOLDS!', sub: why || 'Her lift beats her weight - levelling out with a sliver of hull...', color: '#7bdc8a', t: 3.5, max: 3.5 };
    say('SHE HOLDS! PATCH HER UP!', 4);
    state.sfxQ.push(['kill']);
    shipPuff(800, 600, '#ffffff', 22);
    for (const p of humans()) phoneFx(p, 'SHE HOLDS!', [60, 40, 60, 40, 200]);
  };

  const fail = (text) => {
    finish();
    wreck(text); // (the last stand is used up, so this is a real wreck)
  };

  // Called every frame while flying (after the flight maths, before the pitch is worked out).
  const update = (dt) => {
    if (state.gdBanner && (state.gdBanner.t -= dt) <= 0) state.gdBanner = null;
    if (state.gdCoalOut > 0) state.gdCoalOut = Math.max(0, state.gdCoalOut - dt);
    if (state.gdGrace > 0) {
      state.gdGrace -= dt;
      state.ship.hull = Math.max(state.ship.hull, GD.SURVIVE_HULL * 0.9);
    }
    const g = state.goingDown;
    if (!g || state.ship.down) return;
    g.t += dt;
    state.ship.hull = GD.HOLD_HULL;
    state.ship.shake = Math.max(state.ship.shake, 0.35);
    // The glowing leaks lose gas fast until they are patched.
    const extra = config.GAS.LEAK_PER_HOLE * (GD.LEAK_MUL - 1);
    for (const h of openHoles(g)) {
      const b = state.bags[h.bag < state.bags.length ? h.bag | 0 : 0];
      if (b) b.gas = Math.max(0, b.gas - extra * dt);
    }
    // Holding Action wears off like any other job.
    for (const o of [...g.joints, g.coalJob, g.bombJob]) {
      if (!o) continue;
      if (!o.worked) o.prog = Math.max(0, (o.prog || 0) - dt * 0.4);
      o.worked = false;
    }
    // The numbers, and how far short she is.
    const m = (g.m = measure(g.coalShed));
    g.need = m.weight + GD.MARGIN - m.lift;
    g.lift = m.lift;
    g.weight = m.weight;
    if (g.t <= dt * 1.5) g.need0 = Math.max(10, g.need); // (the first look with the cargo on the decks: how far short she starts)
    // The sinking: faster the longer it goes, slower the nearer her lift is to her weight. Never into the rock (the course pushes her out and she scrapes harmlessly), and never
    // below the lowest height a plain course allows.
    const u = clamp(g.t / g.time, 0, 1);
    const short = clamp(g.need / g.need0, 0, 1);
    let rate = GD.FALL_RATE * (GD.FALL_START + (1 - GD.FALL_START) * u) * (1 - GD.FALL_BRAKE * (1 - short));
    if (state.course && state.course.scraping) rate = 0;
    const lo = state.course ? altBounds(state).lo : -Infinity;
    let alt = state.ship.alt - rate * dt;
    if (isFinite(lo) && alt < lo) alt = Math.max(lo, state.ship.alt);
    mainShip(state).pose.y = -(alt);
    state.ship.vy = Math.min(state.ship.vy || 0, 0);
    state.goingDownRate = rate;
    // Alarm bleeps.
    if ((g.beep -= dt) <= 0) {
      g.beep = 1.1;
      state.sfxQ.push(['alarm']);
    }
    // Saved? Her lift must beat her weight by the margin, and stay there.
    if (g.need <= 0) g.hold += dt;
    else g.hold = Math.max(0, g.hold - dt * 1.5);
    if (g.hold >= GD.HOLD) return succeed();
    if (g.t >= g.time) return fail("SHE FELL FROM THE SKY!");
  };

  // A load of coal went into the boiler (shipSim.js 'stoke'): the steam jumps - full steam is more lift, but the boiler blows at the top.
  const onStoke = (player) => {
    const g = state.goingDown;
    if (!g) return false;
    state.ship.press = Math.min(100, state.ship.press + GD.STOKE_PRESS);
    const b = tb().BOILER;
    if (b) shipPop(b.x, L.platforms[b.d].y - 160, state.ship.press >= config.BOILER.WARN_AT ? 'TOO HOT! VENT!' : 'FULL STEAM!', state.ship.press >= config.BOILER.WARN_AT ? '#ff6b4a' : '#ffb347', 1);
    phoneFx(player, state.ship.press >= config.BOILER.WARN_AT ? 'Boiler too hot - VENT the steam!' : '+STEAM!', [40, 30, 40]);
    return true;
  };

  // ---- hold actions: cut a section away, dump the coal bunker, drop the bombs ----
  // What Action does for this player here (an "interaction" for shipSim.js useFor), or null. `here(o, reach)`: is o on his deck within reach. A bot only does one when its job says so
  // (otherwise the bunker's Action would never grab coal for it).
  const holdAction = (player, here) => {
    const g = state.goingDown;
    if (!g) return null;
    const job = player.botJob, ok = (kind, obj) => !player.bot || (job && job.kind === kind && (obj === undefined || job.obj === obj));
    if (player.bot && job && job.kind === 'vent') { // (a bot's one button would take the rack or the extinguisher beside the vent instead)
      const i = L.vents.indexOf(job.obj);
      if (i >= 0 && here(job.obj, 40)) return { type: 'vent', obj: job.obj, label: state.ventOpen[i] ? 'Close vent' : 'Open vent' };
    }
    for (const j of g.joints) if (here(j, GD.CUT.REACH) && ok('cut', j)) return { type: 'cut', obj: j, hold: true, time: GD.CUT.TIME, label: `LAST RESORT: CUT AWAY ${j.label.toUpperCase()}!` };
    const bay = tb().BAY;
    if (bay && g.bombJob && state.bombBay.bombs > 0 && player.carry !== 'ammo' && here(bay, 70) && ok('dumpbombs')) return { type: 'dumpbombs', obj: g.bombJob, hold: true, time: GD.DUMP.BOMB_TIME, label: 'DROP THE BOMBS!' };
    const co = tb().COAL;
    if (co && g.coalJob && !g.coalGone && player.carry !== 'coal' && here(co, 70) && ok('dumpcoal')) return { type: 'dumpcoal', obj: g.coalJob, hold: true, time: GD.DUMP.COAL_TIME, label: 'DUMP THE COAL OVERBOARD!' };
    return null;
  };

  // A hold action ran to the end.
  const perform = (type, obj, player) => {
    const g = state.goingDown;
    if (!g) return;
    if (type === 'cut') {
      const j = obj;
      const r = breakOff({ ...j.spec, cause: 'jettison' }, { force: true });
      if (r) {
        g.cuts++;
        g.joints = findJoints(); // (the deck numbers changed)
        say(`CUT AWAY! -${Math.round(r.plan.mass)} WEIGHT`, 3);
        phoneFx(player, 'Cut away! She is lighter...', [60, 40, 120]);
      } else {
        phoneFx(player, "It won't come away!", [40]);
        g.joints = g.joints.filter((q) => q !== j);
      }
      return;
    }
    if (type === 'dumpbombs') {
      const bay = state.bombBay, n = bay.bombs;
      if (n <= 0) return;
      bay.bombs = 0;
      bay.open = Math.max(bay.open || 0, 2);
      const o = tb().BAY ? cargo.worldAt(tb().BAY.x, L.bombBay ? L.bombBay.y + 20 : L.platforms[tb().BAY.d].y) : { x: 0, y: 0 };
      for (let k = 0; k < Math.min(n, 4); k++) cargo.spawn('crate', o.x + (k - 1.5) * 26, o.y, ship.pose.vx, ship.pose.vy + 160, { ghost: true });
      g.dumped += n * config.BALANCE.LIVE_MASS.bomb;
      shipPop(tb().BAY.x, L.platforms[tb().BAY.d].y - 140, 'BOMBS AWAY!', '#ffd23f', 1);
      phoneFx(player, 'Bombs away - she is lighter!', [40, 30, 40]);
      return;
    }
    if (type === 'dumpcoal') {
      if (g.coalGone) return;
      g.coalGone = true;
      g.coalShed = GD.DUMP.COAL_WEIGHT;
      g.dumped += GD.DUMP.COAL_WEIGHT;
      const co = tb().COAL, pl = L.platforms[co.d], mid = L.refPoint ? L.refPoint.x : (pl.x0 + pl.x1) / 2, dir = co.x < mid ? -1 : 1;
      const o = cargo.worldAt(co.x, pl.y - 30);
      for (let k = 0; k < 3; k++) cargo.spawn('coal', o.x + k * 18, o.y, dir * ship.pose.f * (200 + k * 40) + ship.pose.vx, -240 + ship.pose.vy, { ghost: true });
      shipPop(co.x, pl.y - 140, 'COAL OVERBOARD!', '#c9c9c9', 1);
      phoneFx(player, 'Coal bunker dumped - no coal to stoke with now!', [40, 30, 40]);
    }
  };

  // The mission ended (beacon / home) while she was falling: she limps in.
  const missionDone = () => {
    if (state.goingDown) succeed('Home at last!');
  };

  // A new mission: the last stand is back, the coal bunker is stocked.
  const newMission = () => {
    used = false;
    if (state.goingDown) finish();
    state.gdGrace = 0;
    state.gdCoalOut = 0;
  };
  const reset = () => {
    newMission();
    state.gdBanner = null;
  };

  // Extra nose-down tip while falling (added to the pitch in shipSim.js).
  const pitch = () => (state.goingDown ? GD.NOSE * (0.4 + 0.6 * clamp(state.goingDown.t / state.goingDown.time, 0, 1)) : 0);

  // Phone status line.
  const status = () => {
    const g = state.goingDown;
    if (!g || !g.m) return '';
    const left = Math.ceil(Math.max(0, g.time - g.t));
    return `GOING DOWN! ${left}s - lift ${Math.round(g.lift)} / weight ${Math.round(g.weight)}${g.need > 0 ? ` (short ${Math.ceil(g.need)})` : ' - HOLD IT!'}`;
  };

  // ---- jobs for idle phones (jobs.js adds these instead of the usual list while she falls) ----
  // [{ kind, obj, d, x, urgency, label, max, fetch? }]
  const jobsFor = (p) => {
    const g = state.goingDown;
    if (!g || !g.m) return null;
    const out = [];
    const U = 3, press = state.ship.press;
    const bunker = L.nearest('coal', p);
    for (const h of openHoles(g)) out.push({ kind: 'gas', obj: h, d: h.d, x: h.x, urgency: U * 1.1, max: 1, label: 'PATCH THE GLOWING LEAK!' });
    const helm = tb().HELM;
    if (helm && !helmManned(p) && state.ship.gas < 97) out.push({ kind: 'helm', obj: 'gdhelm', d: helm.d, x: helm.x, urgency: U * 1.2, max: 1, label: 'TAKE THE HELM - PUMP THE BAGS FULL!' });
    for (const ld of state.loads || []) out.push({ kind: 'shovel', obj: ld, d: ld.d, x: ld.x, urgency: U, max: 1, label: `DUMP IT OVERBOARD! (${((config.CROSS.CARGO.ITEMS[ld.kind] || {}).label || 'load').toLowerCase()})` });
    if (press >= GD.VENT_AT - 4) L.vents.forEach((v, i) => { if (!state.ventOpen[i]) out.push({ kind: 'vent', obj: v, d: v.d, x: v.x, urgency: U * 1.6, max: 1, label: 'VENT THE BOILER!' }); });
    if (!g.coalGone && tb().BOILER && L.hasKind('coal') && (press < GD.STOKE_BELOW || p.carry === 'coal')) {
      for (let k = 0; k < 2; k++) out.push({ kind: 'coal', obj: 'gdcoal' + k, d: tb().BOILER.d, x: tb().BOILER.x, urgency: U * 0.9, max: 1, label: 'STOKE THE BOILER - FULL STEAM!', ...(p.carry === 'coal' || !bunker ? {} : { fetch: bunker.n }) });
    }
    const late = g.t / g.time;
    if (g.bombJob && state.bombBay.bombs > 0 && g.need > 0) out.push({ kind: 'dump', obj: g.bombJob, d: g.bombJob.d, x: g.bombJob.x, urgency: U * 0.6, max: 1, label: 'DROP THE BOMBS! (hold)' });
    if (g.coalJob && !g.coalGone && g.need > 0 && late > 0.4) out.push({ kind: 'dump', obj: g.coalJob, d: g.coalJob.d, x: g.coalJob.x, urgency: U * 0.5, max: 1, label: 'DUMP THE COAL BUNKER! (hold)' });
    if (g.need > 0 && late > GD.CUT_AT) for (const j of g.joints) out.push({ kind: 'cut', obj: j, d: j.d, x: j.x, urgency: U * 0.5, max: 1, label: `LAST RESORT: CUT AWAY ${j.label.toUpperCase()} (hold)` });
    for (const q of Object.values(state.players)) if (q !== p && q.ko > 0 && !q.fall && q.conn == null && q.d != null) out.push({ kind: 'revive', obj: q, d: q.d, x: q.x, urgency: U * 0.7, max: 1, label: `REVIVE ${q.name}` });
    return out;
  };

  return { tryStart, update, protect, active, pumpMul, onStoke, holdAction, perform, missionDone, newMission, reset, pitch, status, jobsFor, measure };
}

// ---- bots: while she falls they split across the jobs (bots.js asks for this instead of its usual list) ----
// Returns jobs in the order bots should claim them (the first free one of the first kind wins), each `urgent`.
export function botJobs(state, bot) {
  const g = state.goingDown;
  if (!g || !g.m) return [];
  const L = mainShip(state).layout;
  const players = Object.values(state.players).filter((q) => q.connected !== false);
  const n = Math.max(1, players.length);
  const press = state.ship.press;
  const open = g.holes.filter((h) => state.gasHoles.includes(h));
  const jobs = [];
  const add = (j) => jobs.push({ max: 1, urgent: true, ...j });
  const t = tables(L);
  const late = g.t / g.time;
  const stokeOk = !g.coalGone && t.BOILER && L.hasKind('coal') && !bunkerEmpty(state);
  // Someone carrying coal finishes that delivery first.
  if (bot.carry === 'coal' && stokeOk) add({ kind: 'coal', obj: 'gdcoal0' });
  // The boiler is about to blow: vent it before anything else.
  const hot = press >= GD.VENT_AT;
  if (hot) L.vents.forEach((v, i) => { if (!state.ventOpen[i]) add({ kind: 'vent', obj: v }); });
  // A hand at the helm pumps the bags full (it stays there: updateBot keeps the helm bot on his post).
  const helmSt = t.HELM;
  const helmTaken = players.some((q) => q !== bot && (L.kindOf(q.lock) === 'helm' || (q.botJob && q.botJob.kind === 'station' && helmSt && q.botJob.obj === helmSt.n)));
  if (helmSt && !helmTaken && state.ship.gas < 97) add({ kind: 'station', obj: helmSt.n, tier: 0 });
  for (const h of open) add({ kind: 'patch', obj: h });
  const coalSlots = stokeOk && press < GD.STOKE_BELOW ? (n >= 5 ? 2 : 1) : 0;
  for (let k = 0; k < coalSlots; k++) add({ kind: 'coal', obj: 'gdcoal' + k });
  if (!hot && press < GD.VENT_CLOSE) L.vents.forEach((v, i) => { if (state.ventOpen[i]) add({ kind: 'vent', obj: v }); }); // (the steam is wanted now: shut the vents again)
  // Cargo overboard, from the heavy end first (the lopsided ship spills lift).
  const dx = (state.balance && state.balance.dx) || 0, com = (state.balance && state.balance.comX) || 0;
  const loads = state.loads || [];
  const heavySide = Math.abs(dx) > config.BALANCE.LEVEL_PX ? Math.sign(dx) : 0; // (she is lopsided: only the loads on the heavy side, until she is level again)
  const heavy = heavySide ? loads.filter((ld) => Math.sign(ld.x - com) === heavySide) : loads;
  for (const ld of heavy.length ? heavy : loads) add({ kind: 'shovel', obj: ld });
  // What cannot be reached by the easy ways: the last resorts.
  const reach = (100 - state.ship.gas) * 0.8 + (GD.STEAM_LIFT - g.m.steam) + g.m.cargo + g.m.bombs;
  const short = g.need > 0;
  if (short && state.bombBay.bombs > 0 && t.BAY && (loads.length === 0 || late > 0.3)) add({ kind: 'dumpbombs', obj: g.bombJob });
  if (short && !g.coalGone && g.coalJob && late > GD.CUT_AT * 0.7 && g.need > reach * 0.75) add({ kind: 'dumpcoal', obj: g.coalJob });
  if (short && late > GD.CUT_AT && (g.need > reach * 0.9 || late > 0.8)) for (const j of g.joints) add({ kind: 'cut', obj: j });
  // Nothing left to do - help the fallen up.
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall) jobs.push({ kind: 'revive', obj: q, max: 1 });
  return jobs;
}
