// Job finder: for every idle human, pick the most useful nearby job and point the way.
// The result is player.job = { kind, label, dir, color } (dir = left | right | up | down), which goes
// to the phone (big arrow when idle) and to the TV (a small chevron above the player).
// Score = seconds of travel (via nav.js, so slide poles count) / how urgent the job is, plus a
// penalty for each crewmate already going there. A suggestion is kept for a few seconds so it
// doesn't flicker, and only swapped for a clearly better one.
import { config } from '../../config.js';
import { layoutTables } from '../../shipLayout.js';
import { mainShip } from './ships.js';
import { hearts } from './health.js';

const J = config.JOBS;
// Worked out per ship layout (rebuilt when a new ship build is applied to it).
const tables = layoutTables((L) => ({
  GUN_NAMES: Object.keys(L.gunMounts),
  PICKUPS: [...L.racks, ...L.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))],
}));
const TOOL = { fire: 'extinguisher', hole: 'hammer', gas: 'hammer', repair: 'hammer', ice: 'hammer' };
export const JOB_COLORS = { fight: '#ff4d4d', fire: '#ff8c1a', revive: '#ff7bd0', hole: '#4dc3ff', gas: '#4dc3ff', swat: '#c58bff', leak: '#7fe3b0', ice: '#9fdcff', unclog: '#b6f06e', oxygen: '#bfe9ff', rod: '#fff27a', pump: '#4dc3ff', winch: '#8fe388', repair: '#ffd23f', ammo: '#ffe27a', coal: '#b0b0b0', help: '#ff4d4d' };
const WORD = { fight: 'RAIDER', fire: 'FIRE', revive: 'REVIVE', hole: 'HULL HOLE', gas: 'GAS LEAK', swat: 'BAT', leak: 'LEAK', ice: 'ICE', unclog: 'SPORES', oxygen: 'OXYGEN', rod: 'LIGHTNING ROD', pump: 'FLOODING', winch: 'SURVIVOR', repair: 'REPAIR', ammo: 'AMMO', coal: 'COAL', help: 'HELP', trim: 'TRIM', sail: 'SAIL', reef: 'REEF', shovel: 'LOAD', heal: 'MEDBAY' };
TOOL.cool = 'ice'; // (GOING DOWN!: cooling the boiler wants a block of ice from the locker)
JOB_COLORS.cool = '#9fdcff';
JOB_COLORS.trim = '#e8c25a'; // (a lopsided ship: go to the light end, balance.js)
JOB_COLORS.sail = '#e9dcc0'; // (S.5e: raise a sail in a fair wind...)
JOB_COLORS.reef = '#ff8c1a'; // (...or reef it before a gust)
JOB_COLORS.shovel = '#c9a85a'; // (B.6: a sandbag or crate thrown onto the deck: shovel it overboard)
JOB_COLORS.heal = '#ff7b9c'; // (crew health: down to the last heart - go to the medbay)

export function createJobFinder(state) {
  const L = mainShip(state).layout; // (the ship these jobs are on: the finder is made per ship, on that ship's context)
  const { travelTime, direction } = mainShip(state).nav;
  const stationNamed = (n) => L.stations.find((s) => s.n === n);
  // Name of the room (or deck) at a spot, for the label.
  const roomName = (d, x) => {
    const r = L.rooms.find((q) => q.d === d && x >= q.x0 && x <= q.x1);
    return r ? r.name : L.platforms[d].name;
  };
  // Where a walker really is for routing (the nearer end if on a ladder).
  const spot = (o) => {
    if (o.conn == null) return { d: o.d, x: o.x };
    const c = L.connectors[o.conn];
    return o.s < 0.5 ? { d: c.top, x: c.xTop } : { d: c.bottom, x: c.xBottom };
  };

  // Everything worth doing right now: { id (the thing), kind, d, x, label, urgency, max }.
  const list = (p) => {
    const gdJobs = state.gdJobs && state.gdJobs(p); // GOING DOWN! (goingDown.js): while she falls, only the three emergency jobs matter
    if (gdJobs) return gdJobs;
    const out = [];
    const add = (kind, obj, d, x, extra, label) => out.push({ kind, obj, d, x, urgency: J.URGENCY[kind], label: label || `${WORD[kind]} - ${roomName(d, x)}`, max: kind === 'fight' ? 2 : 1, ...extra });
    for (const b of state.boarders) if (!b.fall && b.hp > 0) { const s = spot(b); add('fight', b, s.d, b.x); }
    for (const q of Object.values(state.players)) if (q !== p && q.ko > 0 && !q.fall && q.conn == null && q.d != null) add('revive', q, q.d, q.x, {}, `REVIVE ${q.name} - ${roomName(q.d, q.x)}`);
    // Crew health: down to your last heart (and the ship has a medical bay): the arrow points there, ahead of nearly everything (the cot heals a heart every few seconds).
    const HC = config.HEALTH, mb = L.medbay;
    if (HC.ENABLED && mb && hearts(p) <= HC.JOB_AT) {
      const d = L.platforms.findIndex((q) => q.id === mb.p);
      if (d >= 0) { const spot = (p.healSpot ||= {}); spot.d = d; spot.x = mb.x; add('heal', spot, d, mb.x, {}, 'GET TO THE MEDBAY! - ' + roomName(d, mb.x)); } // (one record per player, so the suggestion is kept and nobody counts as "taking" another's)
    }
    // HELP! calls (spotter.js): the crew sent to a caller get an arrow to them, in the caller's colour.
    for (const c of state.helpCalls || []) if (c.caller !== p && c.who.includes(p.id) && c.caller.d != null) { const s = spot(c.caller); add('help', c.caller, s.d, s.x, {}, `HELP ${c.caller.name}! - ${roomName(s.d, s.x)}`); }
    for (const ld of state.loads || []) add('shovel', ld, ld.d, ld.x, {}, `SHOVEL THE ${((config.CROSS.CARGO.ITEMS[ld.kind] || {}).label || 'LOAD').toUpperCase()} OVERBOARD - ${roomName(ld.d, ld.x)}`); // (B.6: cargo thrown onto her deck tips her)
    for (const f of state.fires) add('fire', f, f.d, f.x);
    for (const h of state.breaches) add('hole', h, h.d, h.x);
    for (const h of state.gasHoles || []) add('gas', h, h.d, h.x);
    for (const c of state.icing || []) if (c.lvl >= config.ENVIRONMENTS.frost.ICE.JOB_AT) add('ice', c, c.d, c.x, {}, c.gun ? `ICE on ${c.gun}` : c.area === 'gasbag' ? 'ICE on the gasbag' : 'ICE on the top deck');
    for (const c of state.clogs || []) if (c.lvl >= config.ENVIRONMENTS.fungal.CLOG.JOB_AT) add('unclog', c, c.d, c.x, {}, `SPORES on the ${c.name}`); // Fungal Depths
    if (state.env && state.env.id === 'aether' && state.env.o2 < config.ENVIRONMENTS.aether.OXYGEN.JOB_AT) add('oxygen', state.o2tank, state.o2tank.d, state.o2tank.x, {}, 'OXYGEN - refill the tank on the bridge'); // The Aether
    // Storm Front / Sunken Sea (envStormSea.js): a charging bolt wants a hand on a rod; flooding wants the bilge pump; a survivor on the rope wants the winch.
    if (state.stormJob && state.stormJob.charge) for (const r of state.stormJob.rods) add('rod', r, r.d, r.x, {}, 'HOLD A LIGHTNING ROD!');
    if (state.sea && state.sea.pump && state.sea.flood > config.ENVIRONMENTS.sea.FLOOD.JOB_AT) add('pump', state.sea.pump, state.sea.pump.d, state.sea.pump.x, {}, 'PUMP OUT THE BILGE!');
    if (state.sea && state.sea.winch) add('winch', state.sea.winch, state.sea.winch.d, state.sea.winch.x, {}, 'WINCH UP THE SURVIVOR!');
    for (const b of state.bats || []) if (b.latched && b.landed && b.hp > 0) add('swat', b, b.d, b.lx);
    const mods = state.modules || [];
    for (const m of mods) {
      if (m.kind === 'pipe') {
        if (m.broken || m.hp < m.max * 0.5) add(m.broken && m.open ? 'leak' : 'repair', m, m.d, m.x, {}, `${m.broken && m.open ? 'LEAK' : 'REPAIR'} ${m.name}`);
      } else if (m.broken || m.hp < m.max * config.MODULES.LEAK_BELOW) add('repair', m, m.d, m.x, {}, `REPAIR ${m.name} - ${roomName(m.d, m.x)}`);
    }
    // Hauling: shells to a low gun, coal to a hungry boiler.
    const carry = p.carry;
    const GUN_NAMES = tables(L).GUN_NAMES;
    const guns = GUN_NAMES.filter((n) => state.GUNS[n].ammo <= J.AMMO_LOW && !mods.some((m) => m.name === n && m.broken)).sort((a, b) => state.GUNS[a].ammo - state.GUNS[b].ammo);
    if (carry === 'ammo') {
      for (const n of GUN_NAMES) if (state.GUNS[n].ammo < state.GUNS[n].max) { const s = stationNamed(n); add('ammo', n, s.d, s.x, {}, `AMMO to ${n}`); }
    } else if (carry !== 'coal') {
      const hold = L.nearest('ammo', p); // (the ammo hold nearest to this player)
      if (hold) for (const n of guns.slice(0, 2)) { const s = stationNamed(n); add('ammo', n, s.d, s.x, { fetch: hold.n }, `AMMO for ${n}`); } // (no ammo hold on the ship: nothing to fetch)
    }
    const fuelLow = state.ship.fuel < config.BOILER.FUEL_MAX * (J.COAL_LOW / 100);
    if (carry === 'coal' || (fuelLow && carry !== 'ammo' && L.nearest('coal', p))) { // (no coal bunker: the fire just dies down, nothing to haul)
      // Coal goes to the boiler nearest to where it is picked up (or nearest to the carrier, if already carrying).
      const bunker = carry === 'coal' ? null : L.nearest('coal', p);
      const s = L.nearest('boiler', bunker || p);
      if (s) add('coal', s.n, s.d, s.x, carry === 'coal' || !bunker ? {} : { fetch: bunker.n }, `COAL for the ${s.n}`);
    }
    // Sails (S.5e): a gust is due and a sail is up: reef it now. Otherwise, in open sky, a sail that is down is worth raising (a quiet suggestion).
    if (state.phase === 'flying') {
      const open = !(state.course && state.course.map && !state.course.map.open);
      (state.sails || []).forEach((sl, i) => {
        const s = (L.sails || [])[i];
        if (!s || sl.torn || mods.some((m) => m.name === s.n && m.broken)) return;
        if (state.sailWarn && sl.hoist > 0.1 && !sl.lowering) add('reef', sl, s.d, s.x, {}, `REEF THE SAIL! - ${s.n}: gust coming`);
        else if (!state.sailWarn && open && sl.hoist < 0.5 && !sl.lowering) add('sail', sl, s.d, s.x, {}, `RAISE THE SAIL - ${s.n}, the wind is up`);
      });
    }
    // A lopsided ship (balance.js): idle crew walk to the light end of the main deck, their weight trims her.
    const bal = state.balance;
    if (bal && bal.warn && state.phase === 'flying') {
      const d = L.deckIndex('main');
      if (d >= 0) add('trim', 'trim', d, bal.deg > 0 ? L.platforms[d].x0 + 90 : L.platforms[d].x1 - 90, {}, `TRIM HER! ${bal.deg > 0 ? 'NOSE' : 'TAIL'}-HEAVY - go ${bal.deg > 0 ? 'aft' : 'fore'}`);
    }
    return out;
  };

  // Where to go first: the tool rack / supply on the way (if needed), else the job itself.
  const route = (p, job) => {
    const here = spot(p);
    const need = TOOL[job.kind];
    if (job.fetch) {
      const s = stationNamed(job.fetch);
      return { time: travelTime(p, s.d, s.x) + travelTime({ d: s.d, x: s.x, conn: null }, job.d, job.x), via: s };
    }
    if (need && p.carry !== need) {
      let best = null;
      for (const r of tables(L).PICKUPS) {
        if (r.kind !== need) continue;
        const t = travelTime(p, r.d, r.x) + travelTime({ d: r.d, x: r.x, conn: null }, job.d, job.x);
        if (!best || t < best.time) best = { time: t, via: r };
      }
      if (best) return best;
    }
    void here;
    return { time: travelTime(p, job.d, job.x), via: null };
  };

  const same = (a, b) => a && b && a.kind === b.kind && a.obj === b.obj;
  const taken = (job, p) => {
    let n = 0;
    for (const q of Object.values(state.players)) {
      if (q === p) continue;
      if (q.job && same(q.job.job, job)) n++;
      else if (q.bot && q.botJob && q.botJob.obj === job.obj) n++;
    }
    return n;
  };
  const score = (p, job) => {
    const r = route(p, job);
    return { r, score: (r.time + 0.5) / job.urgency + taken(job, p) * J.CLAIM_PENALTY };
  };

  // Called every frame for each human.
  const update = (p, dt) => {
    // Busy = on a station, working a hold job, fighting, hurt or in the air: no arrow, and the free timer restarts.
    const busy = p.lock || p.ko > 0 || p.fall || p.fly || p.air || p.onGunship || p.connected === false || (p.act && p.act.hold && p.fire) || (p.atkCd || 0) > 0 || p.swing;
    if (busy) {
      p.freeT = 0;
      p.job = null;
      return;
    }
    p.freeT = (p.freeT || 0) + dt;
    p.jobAge = (p.jobAge || 0) + dt;
    p.jobT = (p.jobT || 0) - dt;
    if (p.jobT > 0) return;
    p.jobT = J.EVERY;
    let jobs = list(p).filter((j) => j.d != null);
    // Hauling something? Delivering it comes first (if there is anywhere to deliver it).
    const delivery = jobs.filter((j) => j.kind === p.carry);
    if (delivery.length && (p.carry === 'ammo' || p.carry === 'coal')) jobs = delivery;
    const scored = jobs.map((j) => ({ j, ...score(p, j) })).filter((s) => isFinite(s.r.time)).sort((a, b) => a.score - b.score);
    const cur = p.job && jobs.find((j) => same(j, p.job.job));
    let pick = null;
    if (cur) {
      const c = scored.find((s) => s.j === cur);
      pick = c || null;
      const best = scored[0];
      if (best && best.j !== cur && p.jobAge >= J.HOLD && c && best.score < c.score * J.SWITCH_GAIN) pick = best;
    } else pick = scored[0] || null;
    if (!pick) {
      p.job = null;
      return;
    }
    if (!cur || pick.j !== cur) p.jobAge = 0;
    const j = pick.j;
    // Heading for the supply/rack first (until the right thing is in hand), else for the job.
    const tgt = pick.r.via || j;
    const near = pick.r.via ? 40 : J.ARRIVE;
    const dir = direction(p, tgt.d, tgt.x, near);
    p.job = { job: j, kind: j.kind, label: j.label + (pick.r.via ? ` (get ${pick.r.via.kind || pick.r.via.n})` : ''), dir: dir.arrived ? null : dir.dir, color: j.kind === 'help' && j.obj.color ? j.obj.color : JOB_COLORS[j.kind] };
    // Arrived at the job (no rack needed): the arrow goes away and the suggestion is done.
    if (!pick.r.via && dir.arrived) p.job.dir = null;
  };

  // What the phone gets: null until they have been free a moment.
  const ui = (p) => (p.job && p.job.dir && p.freeT >= J.IDLE_AFTER ? { label: p.job.label, dir: p.job.dir, kind: p.job.kind } : null);
  return { update, ui };
}
