// "GOING DOWN!" - the ship's last stand (once per mission), and the ice locker.
//
// When the hull first reaches 0 in a mission she does not break up. She FALLS for GOING_DOWN.TIME seconds and the
// crew has three jobs at once, each a meter on the TV (and a job arrow for idle phones, see jobsFor):
//   LIFT   - emergency overdrive: carry coal to the boiler (each load fills the lift meter);
//   HEAT   - every coal load heats the boiler; ice blocks from the ICE LOCKER thrown on it cool it (burst = lost);
//   LEAKS  - 1-3 glowing gasbag holes must be patched (the normal hammer job).
// Lift full + leaks patched before the time runs out = "SHE HOLDS!" (hull SURVIVE_HULL, levelled out). Otherwise the
// normal wreck happens (so voyages may limp home on a spare gasbag, see simulation.js).
// The ice locker also works outside the emergency: a block thrown on the boiler takes a little pressure off.
//
// This file owns the rules; simulation.js calls the small hooks (tryStart, active/protect, onStoke, takeIce,
// throwIce, update, newMission). Bots use botJobs(), idle phones jobsFor().
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { altBounds } from './course.js';
import { pop } from './popups.js';
import { refillBags } from './gasBags.js';
import { mainShip } from './ships.js';

const GD = config.GOING_DOWN;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Worked out per ship layout (rebuilt when a new ship build is applied to it).
const tables = layoutTables((L) => ({
  MAIN_D: L.deckIndex('main'),
  CAT_D: L.deckIndex('catwalk'),
  BOILER: L.one('boiler'), // (GOING DOWN! is about the first boiler; a ship with several still only has the one heat meter)
  LOCKER: L.racks.find((r) => r.kind === 'ice'),
}));

export function createGoingDown({ state, phoneFx, puff, shipPuff, wreck, gasHoleAt }) {
  const L = mainShip(state).layout; // (B1: the ship that falls; B2 makes this one per ship)
  const tb = () => tables(L);
  let used = false; // the last stand has been used in this mission
  state.goingDown = null; // { t, time, lift, heat, loads, loadsDone, heatPer, required, holes, crew }
  state.iceLocker = { n: GD.LOCKER.MAX, max: GD.LOCKER.MAX, every: GD.LOCKER.EVERY, t: 0, env: null };
  state.iceFlights = []; // blocks in the air towards the boiler
  state.gdBanner = null; // { text, sub, color, t, max } big words in the middle of the TV
  state.gdGrace = 0; // seconds she cannot be hurt after holding

  const crewCount = () => Math.max(1, Object.values(state.players).filter((p) => p.connected !== false && !p.mate).length);
  const say = (text, secs = 3) => {
    state.ev.warn = secs;
    state.ev.warnText = text;
  };
  const humans = () => Object.values(state.players).filter((p) => !p.bot && p.connected !== false);

  // ---- the ice locker ----
  const lockerCfg = () => ({ ...GD.LOCKER, ...((state.env && GD.LOCKER.ENV[state.env.id]) || {}) });
  const refillLocker = (dt) => {
    const lk = state.iceLocker;
    const c = lockerCfg();
    const envId = state.env ? state.env.id : null;
    if (lk.env !== envId) {
      // A new environment (a new mission): the locker is stocked up for it.
      lk.env = envId;
      lk.n = c.MAX;
    }
    lk.max = c.MAX;
    lk.every = c.EVERY;
    if (lk.n < lk.max) {
      if ((lk.t += dt) >= lk.every) {
        lk.t = 0;
        lk.n = Math.min(lk.max, lk.n + 1);
      }
    } else lk.t = 0;
    lk.n = Math.min(lk.n, lk.max);
  };

  // What Action does at the locker for this player (an "interaction" for simulation.js), never null.
  const lockerAction = (player) => {
    const lk = state.iceLocker;
    if (player.carry === 'ice') return { type: 'icegive', label: 'Put the ice back' };
    if (lk.n >= 1) return { type: 'icetake', label: `Take ice (${Math.floor(lk.n)} left)` };
    return { type: 'need', label: 'Ice locker is empty - it refills' };
  };
  const takeIce = (player) => {
    const lk = state.iceLocker;
    if (lk.n < 1) return false;
    lk.n -= 1;
    player.carry = 'ice';
    puff(player.x, player.y - 60 - state.ship.alt, '#dff4fa', 6);
    return true;
  };
  const giveIce = (player) => {
    const lk = state.iceLocker;
    lk.n = Math.min(lk.max, lk.n + 1);
    player.carry = null;
  };
  // What Action does at the boiler while holding ice.
  const coolAction = (station) => ({ type: 'cool', station, label: state.goingDown ? 'THROW ICE ON THE BOILER!' : 'Cool the boiler' });
  // Throw the block: it flies to the boiler and cools it when it lands.
  const throwIce = (player) => {
    player.carry = null;
    const by = L.platforms[tb().BOILER.d].y;
    state.iceFlights.push({ x0: player.x, y0: L.platforms[player.d == null ? tb().MAIN_D : player.d].y - 80, x1: tb().BOILER.x - 25, y1: by - 60, t: 0, max: GD.THROW_TIME });
  };
  const land = () => {
    const by = L.platforms[tb().BOILER.d].y;
    shipPuff(tb().BOILER.x - 25, by - 60, '#eaf8fb', 12);
    shipPuff(tb().BOILER.x - 25, by - 90, '#ffffff', 8);
    state.sfxQ.push(['fire']);
    const g = state.goingDown;
    if (g) {
      g.heat = Math.max(0, g.heat - GD.ICE_COOL);
      pop(state, tb().BOILER.x - 25, by - 150 - state.ship.alt, 'PSSSHHH!', '#9fdcff', 1);
    } else {
      state.ship.press = Math.max(0, state.ship.press - GD.ICE_PRESS_COOL);
      pop(state, tb().BOILER.x - 25, by - 150 - state.ship.alt, 'PSSSHHH!', '#9fdcff', 0.8);
    }
  };

  // ---- the emergency ----
  const protect = () => !!state.goingDown || state.gdGrace > 0; // nothing can hurt her
  const active = () => !!state.goingDown;

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

  const tryStart = () => {
    if (!GD.ENABLED || used || state.goingDown || state.ship.down || state.phase !== 'flying') return false;
    used = true;
    const n = crewCount();
    const loads = clamp(Math.round(GD.LOADS_BASE + n * GD.LOADS_PER_CREW), GD.LOADS_MIN, GD.LOADS_MAX);
    const heatTotal = GD.HEAT_SMALL + (GD.HEAT_BIG - GD.HEAT_SMALL) * clamp((n - GD.HEAT_SMALL_CREW) / (GD.HEAT_BIG_CREW - GD.HEAT_SMALL_CREW), 0, 1);
    const g = (state.goingDown = {
      t: 0,
      time: GD.TIME + GD.TIME_PER_MISSING * clamp(8 - n, 0, 6),
      lift: 0,
      loads,
      loadsDone: 0,
      heat: 0,
      heatPer: heatTotal / loads,
      required: clamp(GD.LEAKS_MIN + Math.floor((n - 1) / 3), GD.LEAKS_MIN, GD.LEAKS_MAX),
      holes: [],
      crew: n,
      beep: 0,
    });
    // A ship with no boiler (or no coal bunker to feed one) cannot be lifted by shovelling: only the leaks decide it (S.5e). The lift meter starts full.
    if (!tb().BOILER || !L.hasKind('coal')) Object.assign(g, { lift: 1, loads: 0, heatPer: 0 });
    spawnHoles(g);
    state.ship.hull = GD.HOLD_HULL;
    state.ship.shake = 1.4;
    state.iceLocker.n = state.iceLocker.max; // a full locker for the emergency
    say('GOING DOWN! COAL - ICE - PATCH THE LEAKS!', 5);
    state.sfxQ.push(['alarm']);
    for (const p of humans()) phoneFx(p, 'GOING DOWN! Coal to the boiler, ice on the boiler, patch the glowing leaks!', [200, 80, 200, 80, 400]);
    return true;
  };

  const finish = () => {
    const g = state.goingDown;
    if (g) for (const h of g.holes) delete h.gd;
    state.goingDown = null;
  };

  const succeed = (why) => {
    finish();
    state.ship.hull = GD.SURVIVE_HULL;
    state.ship.vy = 0;
    state.ship.shake = 1.2;
    refillBags(state, config.GAS.NEUTRAL + 6);
    state.gdGrace = GD.GRACE;
    state.gdBanner = { text: 'SHE HOLDS!', sub: why || 'Levelling out with a sliver of hull...', color: '#7bdc8a', t: 3.5, max: 3.5 };
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
    refillLocker(dt);
    for (let i = state.iceFlights.length - 1; i >= 0; i--) {
      const f = state.iceFlights[i];
      if ((f.t += dt) >= f.max) {
        state.iceFlights.splice(i, 1);
        land();
      }
    }
    if (state.gdBanner && (state.gdBanner.t -= dt) <= 0) state.gdBanner = null;
    if (state.gdGrace > 0) {
      state.gdGrace -= dt;
      state.ship.hull = Math.max(state.ship.hull, GD.SURVIVE_HULL * 0.9);
    }
    const g = state.goingDown;
    if (!g || state.ship.down) return;
    g.t += dt;
    g.heat = Math.max(0, g.heat - GD.HEAT_COOL * dt);
    state.ship.hull = GD.HOLD_HULL;
    state.ship.shake = Math.max(state.ship.shake, 0.35);
    // The boiler gauge follows the heat (kept just under the point where it would rattle and blow on its own).
    if (tb().BOILER) state.ship.press += (66 + 22 * clamp(g.heat, 0, 1) - state.ship.press) * Math.min(1, dt * 3);
    // The sinking: faster the longer it goes, slower the more lift there is. Never into the rock (the course pushes her
    // out and she scrapes harmlessly), and never below the lowest height a plain course allows.
    const u = clamp(g.t / g.time, 0, 1);
    let rate = GD.FALL_RATE * (GD.FALL_START + (1 - GD.FALL_START) * u) * (1 - GD.FALL_BRAKE * g.lift);
    if (state.course && state.course.scraping) rate = 0;
    const lo = state.course ? altBounds(state).lo : -Infinity;
    let alt = state.ship.alt - rate * dt;
    if (isFinite(lo) && alt < lo) alt = Math.max(lo, state.ship.alt);
    state.ship.alt = alt;
    state.ship.vy = Math.min(state.ship.vy || 0, 0);
    state.goingDownRate = rate;
    // Alarm bleeps.
    if ((g.beep -= dt) <= 0) {
      g.beep = 1.1;
      state.sfxQ.push(['alarm']);
    }
    // Jobs done?
    const open = g.holes.filter((h) => state.gasHoles.includes(h)).length;
    if (g.lift >= 1 && open === 0) return succeed();
    if (g.heat >= 1) {
      shipPuff(tb().BOILER.x - 25, L.platforms[tb().BOILER.d].y - 60, '#ff8c42', 24);
      return fail('THE BOILER BURST! SHE FELL!');
    }
    if (g.t >= g.time) return fail("SHE FELL FROM THE SKY!");
  };

  // A load of coal went into the boiler (simulation.js 'stoke').
  const onStoke = (player) => {
    const g = state.goingDown;
    if (!g) return false;
    if (g.lift < 1) {
      g.loadsDone += 1;
      g.lift = Math.min(1, g.loadsDone / g.loads);
      g.heat += g.heatPer;
      pop(state, tb().BOILER.x, L.platforms[tb().BOILER.d].y - 160 - state.ship.alt, g.lift >= 1 ? 'FULL LIFT!' : 'LIFT!', '#ffb347', 1);
      phoneFx(player, g.lift >= 1 ? 'Full lift! Keep the boiler cool!' : '+LIFT!', [40, 30, 40]);
    }
    state.ship.fuel = Math.min(config.BOILER.FUEL_MAX, state.ship.fuel);
    return true;
  };

  // The mission ended (beacon / home) while she was falling: she limps in.
  const missionDone = () => {
    if (state.goingDown) succeed('Home at last!');
  };

  // A new mission: the last stand is back, the locker is stocked.
  const newMission = () => {
    used = false;
    if (state.goingDown) finish();
    state.gdGrace = 0;
    state.iceFlights.length = 0;
    state.iceLocker.n = lockerCfg().MAX;
    state.iceLocker.t = 0;
  };
  const reset = () => {
    newMission();
    state.gdBanner = null;
  };

  // Extra nose-down tip while falling (added to the pitch in simulation.js).
  const pitch = () => (state.goingDown ? GD.NOSE * (0.4 + 0.6 * clamp(state.goingDown.t / state.goingDown.time, 0, 1)) : 0);

  // Phone status line.
  const status = () => {
    const g = state.goingDown;
    if (!g) return '';
    const open = g.holes.filter((h) => state.gasHoles.includes(h)).length;
    if (!g.loads) return `GOING DOWN! ${Math.ceil(Math.max(0, g.time - g.t))}s - ${open} leak${open === 1 ? '' : 's'} to patch`;
    return `GOING DOWN! ${Math.ceil(Math.max(0, g.time - g.t))}s - lift ${g.loadsDone}/${g.loads}, heat ${Math.round(g.heat * 100)}%, ${open} leak${open === 1 ? '' : 's'} to patch`;
  };

  // ---- jobs for idle phones (jobs.js adds these instead of the usual list while she falls) ----
  // [{ kind, obj, d, x, urgency, label, max, fetch? }]
  const taskOrder = () => {
    const g = state.goingDown;
    const open = g.holes.filter((h) => state.gasHoles.includes(h));
    const coalLeft = g.loads - g.loadsDone;
    return { g, open, coalLeft };
  };
  const jobsFor = (p) => {
    if (!state.goingDown) return null;
    const { g, open, coalLeft } = taskOrder();
    const out = [];
    const U = 3;
    const bunker = L.nearest('coal', p);
    if (g.loads && (coalLeft > 0 || p.carry === 'coal')) {
      for (let k = 0; k < Math.min(3, Math.max(1, coalLeft)); k++) out.push({ kind: 'coal', obj: 'gdcoal' + k, d: tb().BOILER.d, x: tb().BOILER.x, urgency: U, max: 1, label: 'EMERGENCY COAL for the boiler!', ...(p.carry === 'coal' || !bunker ? {} : { fetch: bunker.n }) });
    }
    if (g.loads) out.push({ kind: 'cool', obj: 'gdcool0', d: tb().BOILER.d, x: tb().BOILER.x, urgency: g.heat > 0.55 ? U * 1.4 : U * 0.8, max: 1, label: 'ICE for the boiler!' });
    if (g.loads && (g.heat > 0.4 || crewCount() >= 6)) out.push({ kind: 'cool', obj: 'gdcool1', d: tb().BOILER.d, x: tb().BOILER.x, urgency: U * 0.7, max: 1, label: 'ICE for the boiler!' });
    for (const h of open) out.push({ kind: 'gas', obj: h, d: h.d, x: h.x, urgency: U, max: 1, label: 'PATCH THE GLOWING LEAK!' });
    return out;
  };

  return { tryStart, update, protect, active, onStoke, missionDone, newMission, reset, pitch, status, jobsFor, lockerAction, coolAction, takeIce, giveIce, throwIce };
}

// ---- bots: while she falls they split across the three tasks (bots.js asks for this instead of its usual list) ----
// Returns jobs in the order bots should claim them (the first free one of the first kind wins), each `urgent`.
export function botJobs(state, bot) {
  const g = state.goingDown;
  if (!g) return [];
  const players = Object.values(state.players).filter((q) => q.connected !== false);
  const n = Math.max(1, players.length);
  const open = g.holes.filter((h) => state.gasHoles.includes(h));
  const coalLeft = g.loads - g.loadsDone;
  const coalSlots = coalLeft > 0 ? Math.min(coalLeft, clamp(Math.round(n * 0.4), 1, 3)) : 0;
  const iceSlots = !g.loads ? 0 : n >= 6 ? 2 : 1; // (no boiler to cool when the last stand is only about the leaks)
  const coal = [];
  for (let k = 0; k < coalSlots; k++) coal.push({ kind: 'coal', obj: 'gdcoal' + k, max: 1, urgent: true });
  const ice = [];
  for (let k = 0; k < iceSlots; k++) ice.push({ kind: 'cool', obj: 'gdcool' + k, max: 1, urgent: true });
  const leaks = open.map((h) => ({ kind: 'patch', obj: h, max: 1, urgent: true }));
  // Someone carrying coal/ice finishes that delivery first.
  const jobs = [];
  if (g.loads && bot.carry === 'coal' && coalLeft > 0) jobs.push({ kind: 'coal', obj: 'gdcoal0', max: 1, urgent: true });
  if (g.loads && bot.carry === 'ice') jobs.push({ kind: 'cool', obj: 'gdcool0', max: 1, urgent: true });
  // The boiler is close to bursting: ice before anything else. Otherwise coal, a leak, ice - one of each in turn.
  const hot = g.heat > 0.6;
  const order = hot ? [ice, coal, leaks] : [coal, leaks, ice];
  for (let i = 0; i < 3; i++) for (const list of order) if (list[i]) jobs.push(list[i]);
  for (const list of order) for (let i = 3; i < list.length; i++) jobs.push(list[i]);
  // Nothing left to do (all three done is the end of it) - help the fallen up.
  for (const q of players) if (q !== bot && q.ko > 0 && !q.fall) jobs.push({ kind: 'revive', obj: q, max: 1 });
  return jobs;
}
