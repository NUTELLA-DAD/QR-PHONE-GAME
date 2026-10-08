// Crew awareness: (1) a radar on idle phones, (2) SPOTTING (tap a ping and the target is marked on the
// TV, takes extra damage and the guns' aim assist prefers it), (3) the HELP! button.
// Numbers live in config.RADAR / SPOT / HELP. The radar only goes to phones that are showing it, a few
// times a second, as one flat array of numbers. Phones send back { spot: n } (the n-th ping of the list
// that phone last got) and { help: 1 }.
import { config } from '../../config.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY } from './pose.js';
import { travelTime } from './nav.js';
import { bestTarget } from './aim.js';
import { botFree } from './bots.js';

const R = config.RADAR;
const SP = config.SPOT;
const HP = config.HELP;

// Radar symbols, in the order the phone knows them (controller/ui.js has the same list).
export const RADAR_KINDS = ['mine', 'fighter', 'bomber', 'plane', 'boss', 'gunship', 'bat', 'sniper', 'tug', 'saw', 'imp'];
const NAMES = { mine: 'MINE', fighter: 'FIGHTER', bomber: 'BOMBER', plane: 'PLANE', boss: 'BOSS', gunship: 'GUNSHIP', bat: 'BAT', sniper: 'SNIPER', tug: 'HARPOON', saw: 'SAW', imp: 'IMP' };
// Rough size (px) of each thing, for the bracket drawn round a spotted one on the TV.
export const SPOT_SIZE = { mine: 44, fighter: 54, bomber: 100, plane: 50, boss: 230, gunship: 230, bat: 34, sniper: 80, tug: 60, saw: 56, imp: 30 };

// Everything out there worth a ping (the same lists the TV's lookout arrows use, but every one of them).
// Each: { k (kind index), kind, obj (the thing itself), pos() -> {x, y} live world position }.
export function radarItems(state) {
  const ship = mainShip(state);
  const L = ship.layout;
  const out = [];
  const add = (kind, obj, pos) => out.push({ k: RADAR_KINDS.indexOf(kind), kind, obj, pos });
  const at = (o) => () => ({ x: o.x, y: o.y });
  for (const m of state.mines || []) if (!m.dead) add('mine', m, at(m));
  const e = state.enemy;
  if (e && e.dead <= 0 && e !== state.stuntPlane) add('fighter', e, at(e));
  for (const p of state.bombers || []) if (p.hp > 0) add('bomber', p, at(p));
  for (const p of state.strafers || []) if (p.hp > 0 && p !== state.stuntPlane) add('plane', p, at(p));
  if (state.boss) add('boss', state.boss, at(state.boss));
  const gs = state.gunship;
  if (gs && gs.phase !== 'sinking') add('gunship', gs, () => (gs.bp ? { x: toWorldX(ship, gs.bp.cx + gs.dx), y: toWorldY(ship, (gs.bp.hullTop + gs.bp.hullBot) / 2 + gs.dy) } : { x: toWorldX(ship, L.bounds.x1 + 790 + gs.dx), y: toWorldY(ship, L.refPoint.y + gs.dy) }));
  for (const b of state.bats || []) if (b.delay <= 0 && !b.latched && b.hp > 0) add('bat', b, at(b));
  const S = state.specials;
  if (S) {
    for (const z of S.snipers) add('sniper', z, at(z));
    for (const g of S.tugs) add('tug', g, at(g));
    for (const s of S.saws) add('saw', s, at(s));
    for (const b of S.imps) if (b.delay <= 0) add('imp', b, at(b));
  }
  return out;
}

// Where a walker really is for routing (the nearer end if on a ladder).
const spotOf = (o, L) => {
  if (o.conn == null) return { d: o.d, x: o.x };
  const c = L.connectors[o.conn];
  return o.s < 0.5 ? { d: c.top, x: c.xTop } : { d: c.bottom, x: c.xBottom };
};

export function createSpotter({ state, emit, phoneFx }) {
  const L = mainShip(state).layout; // (this ship's own layout)
  const kindOf = L.kindOf;
  state.spots = []; // { obj, item, by (player id), kind }
  state.helpCalls = []; // { caller, t, who: [human ids still on their way], bots: [bots sent] }
  let radarT = 0;
  let last = []; // the whole item list at the last radar tick

  const player = (id) => state.players[id];

  // ---------- Radar ----------
  // Should this phone be showing the radar now? (idle crew, a lookout, a gunner with nothing to shoot)
  const wantsRadar = (p, dt) => {
    if (p.bot || p.connected === false || p.ko > 0 || p.fall || p.hj || p.fly || p.air || p.swing || p.onGunship || p.conn != null) return false;
    if (state.phase !== 'flying' || state.vote || state.scorecard) return false;
    if (!p.lock) {
      p.rdBusy = 0;
      return (p.freeT || 0) >= R.IDLE_AFTER;
    }
    if (kindOf(p.lock) === 'lookout') return true;
    const gun = state.GUNS[p.lock];
    if (!gun) return false;
    // A gunner: free = nothing in reach (or the gun can't fire anyway).
    const mod = (state.modules || []).find((m) => m.name === p.lock);
    const shooting = !(mod && mod.broken) && gun.ammo > 0 && !!bestTarget(state, gun);
    if (shooting) {
      p.rdBusy = (p.rdBusy || 0) + dt;
      p.rdFree = 0;
    } else {
      p.rdFree = (p.rdFree || 0) + dt;
      p.rdBusy = 0;
    }
    if (!p.rdOn) return p.rdFree >= R.GUN_IDLE_AFTER;
    return p.rdBusy < R.GUN_BUSY_AFTER;
  };

  const radarTick = (dt) => {
    last = radarItems(state);
    // Spots on things that are gone are dropped.
    for (let i = state.spots.length - 1; i >= 0; i--) {
      const s = state.spots[i];
      const it = last.find((q) => q.obj === s.obj);
      if (!it) unspot(i);
      else s.item = it;
    }
    const ship = mainShip(state);
    const cx = toWorldX(ship, L.midPoint.x);
    const cy = toWorldY(ship, L.midPoint.y);
    const near = last
      .map((it) => {
        const p = it.pos();
        return { it, dx: p.x - cx, dy: p.y - cy, d: Math.hypot(p.x - cx, p.y - cy) };
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, R.MAX_ITEMS);
    for (const p of Object.values(state.players)) {
      if (p.bot) continue;
      const want = wantsRadar(p, 1 / R.HZ);
      if (!want) {
        if (p.rdOn) {
          p.rdOn = false;
          p.rdLists = null;
          emit(p.id, { rd: { on: 0 } });
        }
        continue;
      }
      p.rdOn = true;
      p.rdSeq = ((p.rdSeq || 0) + 1) % 1000;
      p.rdLists = p.rdLists || {};
      p.rdLists[p.rdSeq] = near.map((n) => n.it);
      delete p.rdLists[(p.rdSeq + 995) % 1000]; // (keeps the last few lists: taps arrive a moment late)
      const a = [];
      for (const n of near) {
        const far = n.d > R.RANGE;
        const k = far ? R.RANGE / n.d : 1;
        a.push(n.it.k, Math.round(((n.dx * k) / R.RANGE) * 100), Math.round(((n.dy * k) / R.RANGE) * 100), (n.it.obj.spotT > 0 ? 1 : 0) | (far ? 2 : 0));
      }
      emit(p.id, { rd: { on: 1, s: p.rdSeq, a } });
    }
  };

  // ---------- Spotting ----------
  const unspot = (i) => {
    const s = state.spots[i];
    if (s.obj) s.obj.spotT = 0;
    state.spots.splice(i, 1);
  };

  const spot = (p, idx, seq) => {
    const list = p.rdLists && p.rdLists[seq]; // (the list that phone was looking at when it tapped)
    const it = list && list[idx];
    if (!it || !p.rdOn || (p.spotCd || 0) > 0) return;
    p.spotCd = SP.COOLDOWN;
    const obj = it.obj;
    const old = state.spots.findIndex((s) => s.obj === obj);
    if (old >= 0) unspot(old); // (spotting it again just refreshes it, now in this player's name)
    const mine = state.spots.filter((s) => s.by === p.id);
    if (mine.length >= SP.MAX_PER_PLAYER) unspot(state.spots.indexOf(mine[0]));
    obj.spotT = SP.TIME;
    p.spotRecent = config.LINKS.SPOT_RECENT; // (a lookout who spots something sharpens the helm: links.js)
    state.spots.push({ obj, item: it, by: p.id, kind: it.kind });
    p.stats = p.stats || {};
    p.stats.spots = (p.stats.spots || 0) + 1;
    state.sfxQ.push(['ping']);
    phoneFx?.(p, 'SPOTTED ' + NAMES[it.kind] + '!', 0);
  };

  // ---------- HELP! ----------
  const free = (q) => !q.lock && !(q.ko > 0) && !q.fall && !q.hj && !q.fly && !q.air && !q.swing && !q.onGunship && q.connected !== false && !q.dare;

  const callHelp = (p) => {
    if (p.bot || p.connected === false) return;
    if ((p.helpCd || 0) > 0) {
      phoneFx?.(p, 'Help ready in ' + Math.ceil(p.helpCd) + 's', 0);
      return;
    }
    p.helpCd = HP.COOLDOWN;
    state.helpCalls = state.helpCalls.filter((c) => c.caller !== p);
    const call = { caller: p, t: HP.SHOW, who: [], bots: [], tries: 0 };
    state.helpCalls.push(call);
    assign(call);
    state.sfxQ.push(['alarm']);
    phoneFx?.(p, call.who.length + call.bots.length ? 'HELP! Crew on the way' : 'HELP! Called', 0);
  };

  // Send the nearest idle crew (humans: a job arrow; bots: walk over and help with whatever is near).
  const assign = (call) => {
    const c = call.caller;
    if (c.d == null) return;
    const here = spotOf(c, L);
    const sent = call.who.length + call.bots.length;
    const pool = Object.values(state.players).filter((q) => q !== c && free(q) && !call.bots.includes(q) && !call.who.includes(q.id));
    const idle = pool.filter((q) => (q.bot ? botFree(q) : (q.freeT || 0) >= HP.IDLE_FOR));
    const rank = (q) => travelTime(q, here.d, here.x);
    let list = idle.map((q) => ({ q, t: rank(q) })).filter((r) => isFinite(r.t)).sort((a, b) => a.t - b.t);
    if (list.length < HP.RESPONDERS - sent) {
      // Not enough truly idle hands: bots on an errand that is not an emergency will do.
      const more = pool.filter((q) => q.bot && !idle.includes(q) && botFree(q, true)).map((q) => ({ q, t: rank(q) })).filter((r) => isFinite(r.t)).sort((a, b) => a.t - b.t);
      list = list.concat(more);
    }
    for (const { q } of list.slice(0, Math.max(0, HP.RESPONDERS - sent))) {
      if (q.bot) {
        q.helpFor = { caller: c, t: HP.BOT_HOLD };
        q.botJob = null;
        q.think = 0;
        call.bots.push(q);
      } else {
        call.who.push(q.id);
        q.job = null;
        q.jobT = 0; // (job finder looks again right now)
        phoneFx?.(q, c.name + ' needs help!', 0);
      }
    }
  };

  // ---------- Every frame ----------
  const update = (dt) => {
    for (const p of Object.values(state.players)) {
      if (p.helpCd > 0) p.helpCd -= dt;
      if (p.spotCd > 0) p.spotCd -= dt;
      if (p.spotRecent > 0) p.spotRecent -= dt;
      if (p.helpQ) {
        p.helpQ = false;
        callHelp(p);
      }
      if (p.spotQ != null) {
        const q = p.spotQ;
        p.spotQ = null;
        spot(p, q.i, q.s);
      }
      if (p.helpFor && (p.helpFor.t -= dt) <= 0) p.helpFor = null;
    }
    for (let i = state.spots.length - 1; i >= 0; i--) {
      const s = state.spots[i];
      if ((s.obj.spotT -= dt) <= 0) unspot(i);
    }
    for (let i = state.helpCalls.length - 1; i >= 0; i--) {
      const call = state.helpCalls[i];
      call.t -= dt;
      if (call.t <= 0 || !state.players[call.caller.id]) {
        state.helpCalls.splice(i, 1);
        continue;
      }
      // Humans who have arrived go back to their normal job arrow.
      const c = call.caller;
      call.who = call.who.filter((id) => {
        const q = player(id);
        return q && !(q.d === c.d && c.conn == null && q.conn == null && Math.abs(q.x - c.x) < HP.ARRIVE);
      });
      // Anyone still free to help (nobody was, a moment ago)? Look again twice a second for the first few seconds.
      if (call.who.length + call.bots.length < HP.RESPONDERS && (call.tries += dt) > 0.5 && call.t > HP.SHOW - 3) {
        call.tries = 0;
        assign(call);
      }
    }
    radarT += dt;
    if (radarT >= 1 / R.HZ) {
      radarTick(radarT);
      radarT = 0;
    }
  };

  const reset = () => {
    for (const s of state.spots) if (s.obj) s.obj.spotT = 0;
    state.spots.length = 0;
    state.helpCalls.length = 0;
  };

  return { update, reset, callHelp, spot };
}
