// "GOING DOWN!" - FALLING: her LIFT has to beat her WEIGHT again. (STRUCTURE.md WP6: the old once-a-mission last stand, which the hull bar triggered, is gone; this is the one rule.)
//
// The TV shows a big LIFT vs WEIGHT balance bar made of the real numbers of the flight (physical()):
//   WEIGHT  the gas she needs to hover: the neutral fill, the water in her, the torn bags, ragged canvas, the loads on her decks (and the hold), heavy engines, the coal and bombs aboard. Falls the
//           moment something goes overboard.
//   LIFT    the gasbags' lift (by how much gas they hold), thermals, engines pointing up (engines.js).
// The ways to bring the two together, each a job for the crew (job arrows on the phones, jobsFor; bots, botJobs):
//   DUMP WEIGHT  cargo that shook loose on the decks is shovelled overboard (the SHOVEL job, cargo.js); hold Action at the bomb bay to let the bomb load go; hold Action at the coal
//                bunker to dump its stock (then there is nothing to stoke with, and the bunker stays empty a while after);
//   PATCH + PUMP the glowing gasbag leaks must be patched (they lose gas fast), and a hand at the helm pumps the bags full again;
//   FULL STEAM   coal into the boiler: more pressure = hotter gas = more lift - but past BOILER.WARN_AT the boiler can blow, so somebody VENTS the steam;
//   DUMP THE SCRAP  (LOOP.md G1) hold Action at the hold bin to throw the whole hold overboard: scrap is weight too, and the first thing the crew gives up before cutting a section away;
//   CUT AWAY     the last resort: hold Action at a marked joint to cut a heavy section away (breakOff.js, cause 'jettison'; lost until the sky-dock rebuilds it).
//
// FALLING (config.STRUCTURE) is the CONTINUOUS rule for lift: it starts whenever her lift is short of her weight by MARGIN for LIFT.START seconds while she sinks (and the helm is not venting on
// purpose), and ends after her lift beats her weight for LIFT.END seconds (SHE HOLDS! and LIFT.GRACE seconds of calm). It can happen any number of times, with LIFT.COOLDOWN seconds between alarms.
// Lift and weight are the PHYSICAL ones (the ones the flight really uses); no leaks are spawned and no cargo shaken loose - real holes and real weight are the emergency. She falls by the flight
// physics, not a fixed rate. The loss is the CRASH: sitting on the ground (or the sea) with lift short of weight for CRASH.TIME seconds. A ship with no frame (the enemy gunship, a Versus ship)
// has no fall: structure.on() is false and update() does nothing.
//
// This file owns the rules; shipSim.js / simulation.js call the small hooks (startFall, active/protect, onStoke, update, holdAction/perform, newMission).
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { pop } from './popups.js';
import { liftGas } from './gasBags.js';
import { mainShip, shipOf } from './ships.js';
import { thrustOf } from './shipBuild.js';
import { toWorldX, toWorldY } from './pose.js';
import { planBreak, makeRng } from './breakOff.js';
import { holdWeight, holdSpot, holdCount, scrapOn } from './scrap.js';

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

// The cargo drop hatches (hatch.js) that are worth opening now: shut, with a load lying on the span or the coal bunker beside it (the chute spills the bunker too). Fast weight off her.
export function hatchesWorth(state) {
  const g = state.goingDown, L = mainShip(state).layout;
  if (!g || !(state.hatches || []).length) return [];
  const coals = !g.coalGone && g.coalJob ? L.all('coal') : [], R = config.HATCH.COAL_REACH;
  return state.hatches.filter((h) => !h.want && ((state.loads || []).some((ld) => ld.d === h.d && ld.x > h.x0 && ld.x < h.x1) || coals.some((co) => co.d === h.d && co.x > h.x0 - R && co.x < h.x1 + R)));
}

export function createGoingDown({ state, phoneFx, wreck, getCargo, breakOff, getStructure }) {
  const cargo = { spawn: (...a) => getCargo().spawn(...a), worldAt: (...a) => getCargo().worldAt(...a) }; // (cargo.js is made after this, shipSim.js)
  const ship = mainShip(state); // (the ship that falls: one of these per ship)
  const L = ship.layout;
  const tb = () => tables(L);
  const shipPop = (x, y, kind, color, size) => pop(state, toWorldX(ship, x), toWorldY(ship, y), kind, color, size); // (a point on the ship)
  let lowT = 0, cdT = 0, lastGas = 50, rise = 0, groundT = 0, stallT = 0; // (seconds she has been short of lift while sinking; seconds before the next alarm may sound)
  const live = () => { const s = getStructure && getStructure(); return !!(s && s.on()); }; // (STRUCTURE.md: a ship with a frame; the enemy gunship, a Versus ship and a half that split off have no fall)
  state.goingDown = null; // { t, time, lift, weight, need, hold, m, holes, joints, ... } (see beginLive)
  state.gdBanner = null; // { text, sub, color, t, max } big words in the middle of the TV
  state.gdGrace = 0; // seconds she cannot be hurt after holding
  state.gdSince = 99; // seconds since she last held (SHE HOLDS!): raiders.js lets no boarders come for RAIDERS.HOLD_CALM seconds after it
  state.gdCoalOut = 0; // seconds the coal bunker stays empty (it was dumped)

  const crewCount = () => Math.max(1, Object.values(state.players).filter((p) => p.connected !== false && !p.mate).length);
  const say = (text, secs = 3, kind = 'falling') => {
    state.say(kind, text, null, secs);
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
    for (const e of state.engines || []) if (e.works && e.up) engines += thrustOf(e, e.dir).up * E.LIFT_GAS * pf * (env.engine || 1) * (1 + config.BOILER.OD_ENGINE * od); // (an engine pointing up lifts, one pointing down drags)
    const gasPts = state.ship.gas - (env.sink || 0) - (state.liftDeficit || 0) + (env.lift || 0) / G.LIFT - G.NEUTRAL; // (what the pump has put in, above the neutral fill)
    const bags = L.balance.bagLift + gasPts;
    const steam = GD.STEAM_LIFT * od;
    const trim = (GD.TRIM_LOSS * Math.max(0, Math.abs(bal.dx || 0) - B.LEVEL_PX)) / 100;
    // weight, and what it is made of
    const loads = (state.loads || []).reduce((n, ld) => n + ld.w, 0) + holdWeight(state);
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
  const protect = () => state.gdGrace > 0; // nothing can hurt her (for a moment after SHE HOLDS)
  const active = () => !!state.goingDown;

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

  // ---- structure on: the physical lift and weight (gas points) ----
  const crewHeads = () => Object.values(state.players).filter((p) => p.connected !== false && !p.mate).length;
  const crashTime = () => { const K = config.STRUCTURE.CRASH; return (K.TIME[state.difficulty] ?? K.TIME.normal) + K.PER_CREW * clamp(8 - crewHeads(), 0, 8); };
  // The gas she is lifted by (the bags, thermals, engines pointing up) against the gas the flight needs to hover (the neutral fill, the water in her, the torn bags, the canvas and the loads, heavy engines).
  const physical = () => {
    const G = config.GAS, W = config.BALANCE.LIVE_MASS, CG = config.CROSS.CARGO, env = state.env || {};
    const held = state.engineWeight && state.forces ? state.forces.vyAcc / G.LIFT : 0;
    const lift = liftGas(state) + (env.lift || 0) / G.LIFT + held;
    const base = G.NEUTRAL + (env.sink || 0) + (state.liftDeficit || 0) + (state.engineWeight || 0);
    const weight = base + (state.structDeficit || 0); // (= the neutral fill plus state.weightDeficit, shipSim.js)
    const loads = ((state.loads || []).reduce((n, ld) => n + ld.w, 0) + holdWeight(state)) * config.STRUCTURE.LOAD_WEIGHT;
    const bombs = (state.bombBay ? state.bombBay.bombs : 0) * W.bomb, coal = state.ship.fuel * W.fuel + (state.gdCoalOut > 0 || (state.goingDown && state.goingDown.coalGone) || !tb().COAL ? 0 : GD.DUMP.COAL_WEIGHT);
    return { lift, weight, bags: lift, gas: state.ship.gas, steam: 0, engines: held, trim: 0, cargo: loads, bombs, coal, hull: base };
  };
  const beginLive = (m) => {
    const n = crewCount(), short = m.weight - m.lift;
    const g = (state.goingDown = { t: 0, time: crashTime(), crew: n, required: Math.max(1, state.gasHoles.length), holes: state.gasHoles, joints: [], hold: 0, need: short, need0: Math.max(10, short), coalShed: 0, coalGone: false, cuts: 0, dumped: 0, m, bombJob: null, coalJob: null, beep: 0, live: true });
    if (tb().COAL) g.coalJob = { d: tb().COAL.d, x: tb().COAL.x, prog: 0, worked: false };
    if (tb().BAY) g.bombJob = { d: tb().BAY.d, x: tb().BAY.x, prog: 0, worked: false };
    g.joints = findJoints();
    g.ver = L.version;
    state.ship.shake = Math.max(state.ship.shake, 0.8);
    say('FALLING! PATCH THE LEAKS - PUMP - DUMP THE WEIGHT!', 4);
    state.sfxQ.push(['alarm']);
    for (const p of humans()) phoneFx(p, 'FALLING! Her lift is short of her weight: patch the gas leaks, pump the bags full, stoke the boiler, dump weight!', [200, 80, 200, 80, 400]);
    const S = getStructure(); if (S) S.stats.falls++;
  };
  const updateLive = (dt) => {
    if (state.gdBanner && (state.gdBanner.t -= dt) <= 0) state.gdBanner = null;
    if (state.gdCoalOut > 0) state.gdCoalOut = Math.max(0, state.gdCoalOut - dt);
    if (state.gdGrace > 0) state.gdGrace -= dt;
    state.gdSince += dt;
    if (state.gdRelief > 0) state.gdRelief = Math.max(0, state.gdRelief - dt * config.STRUCTURE.LIFT.RELIEF_DECAY); // (weight dumped overboard buys a while of height; the bunker and the bomb racks fill up again)
    cdT = Math.max(0, cdT - dt);
    if (ship.piece) return;
    const m = physical(), g = state.goingDown, short = m.weight - m.lift;
    state.liftWeight = { lift: m.lift, weight: m.weight };
    if (state.ship.down || state.phase !== 'flying') { state.crashT = 0; lowT = 0; if (g) finish(); return; }
    // Is it TROUBLE or a descent she asked for? A helm that vents and holds the bag low is diving on purpose, and one that pumps back up after a dive is fixing it; it is trouble when the helm pumps hard and the
    // gas will not come (no steam, a bag torn open), when the bag is nearly empty, or when nobody is flying her at all.
    const LF = config.STRUCTURE.LIFT, pumpIn = state.gasValve ? state.gasValve.input : 0, gasNow = state.ship.gas;
    rise += (((gasNow - lastGas) / Math.max(dt, 1e-4)) - rise) * Math.min(1, dt * 3);
    lastGas = gasNow;
    groundT = state.grounded ? groundT + dt : Math.max(0, groundT - dt * 2); // (how long she has been touching the ground: a graze is a touch that lets go again)
    const trouble = (pumpIn >= LF.PUMP_AT && rise < LF.RISE_MIN) || gasNow <= LF.EMPTY_GAS || (!helmManned() && !state.autopilot && short > LF.NOHELM_SHORT) || (state.grounded && (short > LF.GRAZE || groundT > LF.GRAZE_T)); // (balance pass: an empty helm alone is not trouble - only with a real lift deficit; a ship down on the ground is, unless it is a graze: lift short by no more than GRAZE and down for less than GRAZE_T seconds)
    stallT = !g && LF.GROUND_STALL && state.grounded && Math.abs(state.ship.speed) < LF.STALL_SPEED ? stallT + dt : Math.max(0, stallT - dt * 2); // (F5: on the ground and not moving: the ground soft lock's clock; a ship that sits there bounces, so a lift-off for a moment only slows it)
    if (!g) {
      lowT = short > GD.MARGIN && ((state.ship.vy || 0) < -config.STRUCTURE.LIFT.SINK_VY || state.grounded) && trouble ? lowT + dt : Math.max(0, lowT - dt);
      if (lowT >= config.STRUCTURE.LIFT.START && cdT <= 0 && state.gdGrace <= 0) { lowT = 0; { const S = getStructure(); if (S) { const w = (S.stats.why ||= {}), k = state.grounded ? 'grounded' : gasNow <= LF.EMPTY_GAS ? 'bagEmpty' : (pumpIn >= LF.PUMP_AT && rise < LF.RISE_MIN) ? 'pumpNoRise' : 'noHelm'; w[k] = (w[k] || 0) + 1; } } beginLive(m); }
      else if (stallT >= LF.GROUND_STALL && cdT <= 0 && state.gdGrace <= 0) { // (F5: sat on the ground GROUND_STALL seconds with no alarm: raise FALLING anyway, so the crash clock, the alarms and the limp happen and the voyage cannot sit there for ever)
        stallT = 0;
        { const S = getStructure(); if (S) { const w = (S.stats.why ||= {}); w.stalled = (w.stalled || 0) + 1; } }
        beginLive(m);
        state.goingDown.stall = true;
      }
    } else {
      g.t = state.crashT || 0;
      g.time = crashTime();
      g.m = m;
      g.lift = m.lift;
      g.weight = m.weight;
      g.need = short;
      g.required = Math.max(g.required, state.gasHoles.length);
      g.holes = state.gasHoles;
      if (g.ver !== L.version) { // (a part broke off, or she split, while she falls: the marked joints, the bunker and the bomb bay are on other decks now)
        g.ver = L.version;
        g.joints = findJoints();
        g.coalJob = tb().COAL ? { d: tb().COAL.d, x: tb().COAL.x, prog: 0, worked: false } : null;
        g.bombJob = tb().BAY ? { d: tb().BAY.d, x: tb().BAY.x, prog: 0, worked: false } : null;
      }
      for (const o of [...g.joints, g.coalJob, g.bombJob, g.scrapJob]) { if (!o) continue; if (!o.worked) o.prog = Math.max(0, (o.prog || 0) - dt * 0.4); o.worked = false; }
      g.age = (g.age || 0) + dt;
      state.ship.shake = Math.max(state.ship.shake, 0.2);
      if ((g.beep -= dt) <= 0) { g.beep = 1.1; state.sfxQ.push(['alarm']); }
      if (short <= 0 && !(g.stall && state.grounded)) g.hold += dt; else g.hold = Math.max(0, g.hold - dt * 1.5);
      if (g.hold >= config.STRUCTURE.LIFT.END) {
        const S = getStructure(); if (S) S.stats.saved++;
        if (state.moment && state.momentTake) state.moment('going-down-saved', { who: state.momentTake('gd').slice(0, 3).map((r) => r.ref), where: null, data: { cuts: g.cuts || 0 } }); // (the Ship's Book: whoever patched, pumped and dumped while she fell)
        finish();
        cdT = config.STRUCTURE.LIFT.COOLDOWN;
        state.gdGrace = config.STRUCTURE.LIFT.GRACE;
        state.gdSince = 0;
        state.gdBanner = { text: 'SHE HOLDS!', sub: 'Her lift beats her weight again', color: '#7bdc8a', t: 3, max: 3 };
        say('SHE HOLDS!', 3, 'objective');
        state.sfxQ.push(['kill']);
        for (const p of humans()) phoneFx(p, 'SHE HOLDS!', [60, 40, 60, 40, 200]);
      }
    }
    // the loss: down on the ground (or the sea) with her lift still short of her weight
    const need = crashTime(), CR = config.STRUCTURE.CRASH; // (balance pass: the crash clock only runs inside a FALLING alarm - the crew was told - and only while she is really short, CRASH.SHORT)
    if (g && state.grounded && (short > CR.SHORT || g.stall)) state.crashT = (state.crashT || 0) + dt * (rise >= CR.RISE_OK ? CR.RECOVER_MUL : 1); else state.crashT = Math.max(0, (state.crashT || 0) - dt * 2);
    if (state.crashT >= need) {
      const sea = !!(state.sea && state.sea.spray > 0.5 && state.sea.flood > 0);
      const S = getStructure(); if (S) S.stats.crashes++;
      state.crashT = 0;
      finish();
      wreck('SHE CRASHED INTO THE ' + (sea ? 'SEA' : state.course && state.course.map ? 'ROCKS' : 'GROUND') + '!');
    }
  };

  const finish = () => { state.goingDown = null; };
  // Start the fall now (the gates use it; in the game updateLive starts it whenever her lift is short).
  const startFall = () => {
    if (state.goingDown || state.ship.down || !live()) return false;
    beginLive(physical());
    return true;
  };

  // Called every frame while flying (after the flight maths, before the pitch is worked out). A ship with no frame (the enemy gunship, a Versus ship) has no fall.
  const update = (dt) => {
    if (live()) updateLive(dt);
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

  // The hold's dump job (made when it is first wanted: the bin is wherever holdSpot says).
  const scrapJobOf = (g) => syncScrapJob(g, holdSpot(L));
  // ---- hold actions: cut a section away, dump the coal bunker, drop the bombs, dump the scrap ----
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
    const sp = scrapOn() && holdCount(state) > 0 ? holdSpot(L) : null; // (SCRAP: the hold bin)
    if (sp && here(sp, 70) && player.carry !== 'scrap' && ok('dumpscrap')) return { type: 'dumpscrap', obj: scrapJobOf(g), hold: true, time: GD.DUMP.COAL_TIME, label: 'DUMP THE SCRAP OVERBOARD!' };
    const co = tb().COAL;
    if (co && g.coalJob && !g.coalGone && player.carry !== 'coal' && here(co, 70) && ok('dumpcoal')) return { type: 'dumpcoal', obj: g.coalJob, hold: true, time: GD.DUMP.COAL_TIME, label: 'DUMP THE COAL OVERBOARD!' };
    return null;
  };

  // A hold action ran to the end.
  const perform = (type, obj, player) => {
    const g = state.goingDown;
    if (!g) return;
    if (state.momentNote) state.momentNote('gd', player); // (the Ship's Book)
    if (type === 'cut') {
      const j = obj;
      const r = breakOff({ ...j.spec, cause: 'jettison' }, { force: true });
      if (r) {
        g.cuts++;
        g.joints = findJoints(); // (the deck numbers changed)
        say(`CUT AWAY! -${Math.round(r.plan.mass)} WEIGHT`, 3, 'info');
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
      if (live()) state.gdRelief = (state.gdRelief || 0) + n * config.BALANCE.LIVE_MASS.bomb;
      shipPop(tb().BAY.x, L.platforms[tb().BAY.d].y - 140, 'BOMBS AWAY!', '#ffd23f', 1);
      phoneFx(player, 'Bombs away - she is lighter!', [40, 30, 40]);
      return;
    }
    if (type === 'dumpscrap') {
      const n = getCargo().dumpHold(player);
      if (!n) return;
      g.dumped += n * config.SCRAP.BUNDLE_W;
      const sp = holdSpot(L);
      if (sp) shipPop(sp.x, L.platforms[sp.d].y - 140, 'SCRAP OVERBOARD!', '#ffd23f', 1);
      phoneFx(player, 'Scrap overboard - she is lighter!', [40, 30, 40]);
      return;
    }
    if (type === 'dumpcoal') {
      if (g.coalGone) return;
      g.coalGone = true;
      g.coalShed = GD.DUMP.COAL_WEIGHT;
      g.dumped += GD.DUMP.COAL_WEIGHT;
      if (live()) state.gdRelief = (state.gdRelief || 0) + GD.DUMP.COAL_WEIGHT;
      const co = tb().COAL, pl = L.platforms[co.d], mid = L.refPoint ? L.refPoint.x : (pl.x0 + pl.x1) / 2, dir = co.x < mid ? -1 : 1;
      const o = cargo.worldAt(co.x, pl.y - 30);
      for (let k = 0; k < 3; k++) cargo.spawn('coal', o.x + k * 18, o.y, dir * ship.pose.f * (200 + k * 40) + ship.pose.vx, -240 + ship.pose.vy, { ghost: true });
      shipPop(co.x, pl.y - 140, 'COAL OVERBOARD!', '#c9c9c9', 1);
      phoneFx(player, 'Coal bunker dumped - no coal to stoke with now!', [40, 30, 40]);
    }
  };

  // The mission ended (beacon / home) while she was falling: the fall ends, she limps in.
  const missionDone = () => {
    if (state.goingDown) finish();
  };

  // A new mission: the coal bunker is stocked.
  const newMission = () => {
    lowT = 0; cdT = 0; groundT = 0; state.crashT = 0;
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
    for (const h of hatchesWorth(state)) out.push({ kind: 'hatch', obj: h, d: h.d, x: h.lx, urgency: U * 1.15, max: 1, label: 'PULL THE HATCH LEVER - THE CARGO DROPS!' }); // (a cargo drop hatch with weight over it: one pull and it is gone)
    for (const ld of state.loads || []) out.push({ kind: 'shovel', obj: ld, d: ld.d, x: ld.x, urgency: U, max: 1, label: `DUMP IT OVERBOARD! (${((config.CROSS.CARGO.ITEMS[ld.kind] || {}).label || 'load').toLowerCase()})` });
    if (press >= GD.VENT_AT - 4) L.vents.forEach((v, i) => { if (!state.ventOpen[i]) out.push({ kind: 'vent', obj: v, d: v.d, x: v.x, urgency: U * 1.6, max: 1, label: 'VENT THE BOILER!' }); });
    if (!g.coalGone && tb().BOILER && L.hasKind('coal') && (press < GD.STOKE_BELOW || p.carry === 'coal')) {
      for (let k = 0; k < 2; k++) out.push({ kind: 'coal', obj: 'gdcoal' + k, d: tb().BOILER.d, x: tb().BOILER.x, urgency: U * 0.9, max: 1, label: 'STOKE THE BOILER - FULL STEAM!', ...(p.carry === 'coal' || !bunker ? {} : { fetch: bunker.n }) });
    }
    const late = g.t / g.time;
    if (g.bombJob && state.bombBay.bombs > 0 && g.need > 0) out.push({ kind: 'dump', obj: g.bombJob, d: g.bombJob.d, x: g.bombJob.x, urgency: U * 0.6, max: 1, label: 'DROP THE BOMBS! (hold)' });
    { const sp = scrapOn() && holdCount(state) > 0 ? holdSpot(L) : null; if (sp && g.need > 0) out.push({ kind: 'dump', obj: scrapJobOf(g), d: sp.d, x: sp.x, urgency: U * 0.75, max: 1, label: 'DUMP THE SCRAP! (hold)' }); }
    if (g.coalJob && !g.coalGone && g.need > 0 && late > 0.4) out.push({ kind: 'dump', obj: g.coalJob, d: g.coalJob.d, x: g.coalJob.x, urgency: U * 0.5, max: 1, label: 'DUMP THE COAL BUNKER! (hold)' });
    if (g.need > 0 && late > GD.CUT_AT) for (const j of g.joints) out.push({ kind: 'cut', obj: j, d: j.d, x: j.x, urgency: U * 0.5, max: 1, label: `LAST RESORT: CUT AWAY ${j.label.toUpperCase()} (hold)` });
    for (const q of Object.values(state.players)) if (q !== p && q.ko > 0 && !q.fall && q.conn == null && q.d != null) out.push({ kind: 'revive', obj: q, d: q.d, x: q.x, urgency: U * 0.7, max: 1, label: `REVIVE ${q.name}` });
    return out;
  };

  // Weight that left through a cargo drop hatch (hatch.js): the loads are already off the decks, so the numbers fall by themselves; this counts them and says so.
  const noteDumped = (w) => {
    const g = state.goingDown;
    if (!g || !(w > 0)) return;
    g.dumped += w;
    say('CARGO THROUGH THE HATCH! -' + Math.round(w) + ' WEIGHT', 2.5, 'info');
  };

  return { live, physical, crashTime, startFall, update, protect, active, onStoke, holdAction, perform, missionDone, newMission, reset, pitch, status, jobsFor, measure, noteDumped };
}

// The hold's dump job always stands where the bin is NOW (a part that broke off or a split changes the decks under it): the progress of a hold in hand is kept.
const syncScrapJob = (g, sp) => { const j = (g.scrapJob ||= { d: 0, x: 0, prog: 0, worked: false }); if (sp) { j.d = sp.d; j.x = sp.x; } return j; };
const botScrapJob = (state, g) => syncScrapJob(g, holdSpot(mainShip(state).layout));
// The one hand who takes an EMPTY helm (balance pass, STRUCTURE.md): the nearest free crewman - not knocked out, not falling or flying, not at a station, not hauling coal or scrap - by the walk. Only he is offered the
// job (urgent, ahead of every station), so the walk is as short as it can be and nobody else leaves his work; a hand at a station answers the helm call by himself (bots.js). Structure on only.
export function helmDeputy(state, bot) {
  const ship = mainShip(state), st = tables(ship.layout).HELM, { travelTime } = ship.nav;
  if (!st || !ship.sim.structure.on()) return null;
  let best = null, bt = Infinity;
  for (const q of Object.values(state.players)) {
    if (!q.bot || q.mate || q.enemy || q.lock || q.ko > 0 || q.fall || q.fly || q.hj || q.dare || q.onGunship || (q.d == null && q.conn == null) || q.carry === 'coal' || q.carry === 'scrap' || shipOf(state, q) !== ship) continue;
    let t = travelTime(q, st.d, st.x);
    if (!Number.isFinite(t)) t = 1e5 + Math.abs((q.x || 0) - st.x); // (no way to the helm just now - an open hatch cuts the deck - he is still the one to go: the way opens when it shuts)
    if (t < bt) { bt = t; best = q; }
  }
  return best === bot ? bot : null;
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
  const strOn = mainShip(state).sim.structure.on(); // (balance pass: with structure on the helm is manned whatever the bags hold, by the nearest hand, and the steam gets as much care as the leaks)
  if (helmSt && !helmTaken && (strOn ? helmDeputy(state, bot) === bot : state.ship.gas < 97)) add({ kind: 'station', obj: helmSt.n, tier: 0 });
  const fix = []; // the steam: a burst pipe leaks it away, a broken boiler / lift / helm gives none (structure on only)
  if (strOn) {
    const mods = state.modules || [], crit = (m) => config.BOTS.CRITICAL.includes(m.kind) || (m.kind === 'pipe' && ((t) => !!t && config.BOTS.CRITICAL.includes(t.kind))(mods.find((q) => q.name === m.to)));
    for (const m of mods) if (m.kind === 'pipe' && m.broken && m.open && crit(m)) fix.push({ kind: 'valve', obj: m });
    if (config.BOTS.FIRE_AT_REPAIR) for (const m of mods) if (m.broken && crit(m)) for (const f of state.fires) if (f.d === m.d && Math.abs(f.x - m.x) < config.MODULES.FIRE_RADIUS) fix.push({ kind: 'fire', obj: f }); // (F3: a fire at the part being mended burns the hand at the hammer out of it again and again: spray it first)
    for (const m of mods) if (m.broken && crit(m)) fix.push({ kind: 'repair', obj: m });
    for (const m of mods) if (m.kind === 'pipe' && !m.broken && !m.open && crit(m)) fix.push({ kind: 'valve', obj: m }); // (a shut valve on the helm's, the lift's or the boiler's pipe starves it: open it)
  }
  if (strOn) (L.gasValves || []).forEach((v, i) => { // a ruptured bag bleeds the pump's gas out of the shared feed: shut its valve (the normal list does the same), and open it again once it is patched
    const holes = state.gasHoles.filter((h) => (h.bag | 0) === v.bag).length, bag = (state.bags || [])[v.bag], isOpen = state.gasValveOpen[i] !== false;
    if (isOpen && bag && state.bags.length > 1 && (holes >= 2 || (bag.down && holes))) add({ kind: 'gasvalve', obj: v });
    else if (!isOpen && holes === 0) add({ kind: 'gasvalve', obj: v });
  });
  for (const h of open) add({ kind: 'patch', obj: h });
  const lowSteam = strOn && press < GD.STOKE_LOW;
  const coalSlots = stokeOk && press < GD.STOKE_BELOW ? (n >= 5 ? (lowSteam ? 3 : 2) : lowSteam && n >= 3 ? 2 : 1) : 0;
  for (const j of fix) add(j);
  for (let k = 0; k < coalSlots; k++) add({ kind: 'coal', obj: 'gdcoal' + k });
  if (!hot && press < GD.VENT_CLOSE) L.vents.forEach((v, i) => { if (state.ventOpen[i]) add({ kind: 'vent', obj: v }); }); // (the steam is wanted now: shut the vents again)
  // A cargo drop hatch with weight over it (or the coal bunker beside it): one pull of its lever and it is gone.
  for (const h of hatchesWorth(state)) add({ kind: 'hatch', obj: h, mode: 'dump' });
  // Cargo overboard, from the heavy end first (the lopsided ship spills lift).
  const dx = (state.balance && state.balance.dx) || 0, com = (state.balance && state.balance.comX) || 0;
  const loads = state.loads || [];
  const heavySide = Math.abs(dx) > config.BALANCE.LEVEL_PX ? Math.sign(dx) : 0; // (she is lopsided: only the loads on the heavy side, until she is level again)
  const heavy = heavySide ? loads.filter((ld) => Math.sign(ld.x - com) === heavySide) : loads;
  for (const ld of heavy.length ? heavy : loads) if (![...hatchesWorth(state), ...(state.hatches || []).filter((h) => h.want)].some((h) => ld.d === h.d && ld.x > h.x0 && ld.x < h.x1)) add({ kind: 'shovel', obj: ld }); // (a load over a trapdoor that is being opened, or is worth opening, falls through it: nobody stands there to shovel it)
  // What cannot be reached by the easy ways: the last resorts.
  const reach = (100 - state.ship.gas) * 0.8 + (GD.STEAM_LIFT - g.m.steam) + g.m.cargo + g.m.bombs;
  const short = g.need > 0;
  if (short && scrapOn() && holdCount(state) > 0 && holdSpot(L) && (late > config.SCRAP.BOTS.DUMP_LATE || (g.age || 0) > (strOn ? GD.EARLY.SCRAP : config.SCRAP.BOTS.DUMP_AFTER))) add({ kind: 'dumpscrap', obj: botScrapJob(state, g) }); // (SCRAP: the hold goes over the side before the bombs, the coal or a section)
  if (short && state.bombBay.bombs > 0 && t.BAY && (loads.length === 0 || late > 0.3 || (strOn && (g.age || 0) > GD.EARLY.BOMBS))) add({ kind: 'dumpbombs', obj: g.bombJob });
  if (short && !g.coalGone && g.coalJob && (strOn ? state.ship.fuel >= GD.EARLY.COAL_FUEL && late > GD.EARLY.COAL : late > GD.CUT_AT * 0.7) && g.need > reach * 0.75) add({ kind: 'dumpcoal', obj: g.coalJob });
  if (short && late > (strOn ? GD.EARLY.CUT : GD.CUT_AT) && (g.need > reach * 0.9 || late > 0.8)) for (const j of g.joints) add({ kind: 'cut', obj: j });
  for (const h of state.hatches || []) if (h.want && h.openSecs > config.HATCH.BOT.OPEN_FOR) add({ kind: 'hatch', obj: h, mode: 'close', urgent: false }); // (it has done its work: shut it again so nobody walks into the hole)
  // Nothing left to do - help the fallen up.
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall && shipOf(state, q) === shipOf(state, bot)) jobs.push({ kind: 'revive', obj: q, max: 1 });
  return jobs;
}
