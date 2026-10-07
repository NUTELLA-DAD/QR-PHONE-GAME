// Job finder: for every idle human, pick the most useful nearby job and point the way.
// The result is player.job = { kind, label, dir, color } (dir = left | right | up | down), which goes
// to the phone (big arrow when idle) and to the TV (a small chevron above the player).
// Score = seconds of travel (via nav.js, so slide poles count) / how urgent the job is, plus a
// penalty for each crewmate already going there. A suggestion is kept for a few seconds so it
// doesn't flicker, and only swapped for a clearly better one.
import { config } from '../../config.js';
import { SHIP_LAYOUT } from '../../shipLayout.js';
import { travelTime, direction } from './nav.js';

const L = SHIP_LAYOUT;
const J = config.JOBS;
const GUN_NAMES = Object.keys(L.gunMounts);
const PICKUPS = [...L.racks, ...L.extinguishers.map((e) => ({ ...e, kind: 'extinguisher' }))];
const stationNamed = (n) => L.stations.find((s) => s.n === n);
const TOOL = { fire: 'extinguisher', hole: 'hammer', gas: 'hammer', repair: 'hammer', ice: 'hammer' };
export const JOB_COLORS = { fight: '#ff4d4d', fire: '#ff8c1a', revive: '#ff7bd0', hole: '#4dc3ff', gas: '#4dc3ff', swat: '#c58bff', leak: '#7fe3b0', ice: '#9fdcff', unclog: '#b6f06e', oxygen: '#bfe9ff', rod: '#fff27a', pump: '#4dc3ff', winch: '#8fe388', repair: '#ffd23f', ammo: '#ffe27a', coal: '#b0b0b0', help: '#ff4d4d' };
const WORD = { fight: 'RAIDER', fire: 'FIRE', revive: 'REVIVE', hole: 'HULL HOLE', gas: 'GAS LEAK', swat: 'BAT', leak: 'LEAK', ice: 'ICE', unclog: 'SPORES', oxygen: 'OXYGEN', rod: 'LIGHTNING ROD', pump: 'FLOODING', winch: 'SURVIVOR', repair: 'REPAIR', ammo: 'AMMO', coal: 'COAL', help: 'HELP' };

// Name of the room (or deck) at a spot, for the label.
const roomName = (d, x) => {
  const r = L.rooms.find((q) => q.d === d && x >= q.x0 && x <= q.x1);
  return r ? r.name : L.platforms[d].name;
};

export function createJobFinder(state) {
  // Where a walker really is for routing (the nearer end if on a ladder).
  const spot = (o) => {
    if (o.conn == null) return { d: o.d, x: o.x };
    const c = L.connectors[o.conn];
    return o.s < 0.5 ? { d: c.top, x: c.xTop } : { d: c.bottom, x: c.xBottom };
  };

  // Everything worth doing right now: { id (the thing), kind, d, x, label, urgency, max }.
  const list = (p) => {
    const out = [];
    const add = (kind, obj, d, x, extra, label) => out.push({ kind, obj, d, x, urgency: J.URGENCY[kind], label: label || `${WORD[kind]} - ${roomName(d, x)}`, max: kind === 'fight' ? 2 : 1, ...extra });
    for (const b of state.boarders) if (!b.fall && b.hp > 0) { const s = spot(b); add('fight', b, s.d, b.x); }
    for (const q of Object.values(state.players)) if (q !== p && q.ko > 0 && !q.fall && q.conn == null && q.d != null) add('revive', q, q.d, q.x, {}, `REVIVE ${q.name} - ${roomName(q.d, q.x)}`);
    // HELP! calls (spotter.js): the crew sent to a caller get an arrow to them, in the caller's colour.
    for (const c of state.helpCalls || []) if (c.caller !== p && c.who.includes(p.id) && c.caller.d != null) { const s = spot(c.caller); add('help', c.caller, s.d, s.x, {}, `HELP ${c.caller.name}! - ${roomName(s.d, s.x)}`); }
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
    const guns = GUN_NAMES.filter((n) => state.GUNS[n].ammo <= J.AMMO_LOW && !mods.some((m) => m.name === n && m.broken)).sort((a, b) => state.GUNS[a].ammo - state.GUNS[b].ammo);
    if (carry === 'ammo') {
      for (const n of GUN_NAMES) if (state.GUNS[n].ammo < state.GUNS[n].max) { const s = stationNamed(n); add('ammo', n, s.d, s.x, {}, `AMMO to ${n}`); }
    } else if (carry !== 'coal') {
      for (const n of guns.slice(0, 2)) { const s = stationNamed(n); add('ammo', n, s.d, s.x, { fetch: 'Ammo Hold' }, `AMMO for ${n}`); }
    }
    const fuelLow = state.ship.fuel < config.BOILER.FUEL_MAX * (J.COAL_LOW / 100);
    if (carry === 'coal' || (fuelLow && carry !== 'ammo')) { const s = stationNamed('Boiler'); add('coal', 'Boiler', s.d, s.x, carry === 'coal' ? {} : { fetch: 'Coal Bunker' }, 'COAL for the Boiler'); }
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
      for (const r of PICKUPS) {
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
