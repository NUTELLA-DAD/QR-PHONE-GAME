// Crew health (config.HEALTH): every crewman has hearts (player.hearts; undefined = full). Fires, shell bursts, raider blows, swords and hard landings take some; a BIG hit takes them all.
// At zero he is knocked out as ever (RAIDERS.KO_TIME; a crewmate revives him or he wakes) and comes round with WAKE_HP. The medical bay heals him; a crewmate can bandage him.
//   hurt(p, hearts, opts)    take hearts off p. Returns 'hit' (he lives), 'ko' (he is at zero: the caller knocks him out, usually with knockOut below) or null (nothing happened:
//                            he is knocked out, just woke up, still in his i-frames, or is a gunship crewman). opts: big, cause, old (this blow knocked a crewman out before hearts existed:
//                            with config.HEALTH.ENABLED off it still returns 'ko'), iframes.
//   knockOut(p, time, opts)  the shared knocked-out state: out for `time` s, lets go of the station, the tool and the Action button.
//   wake(p) / revived(p)     he comes round (by himself / a crewmate's hands): WAKE_HP hearts at least; a revive also gives a few seconds of grace.
//   hearts(p), full(p)       how many hearts p has now / is he whole.
//   createHealth({...})      the per-ship half: step(p, dt) every frame for each of her crew (burns, i-frames, the medical bay, the TV and phone flashes), blast(...) for a burst that
//                            hurts everyone near a point, bandage(target, by).
// The pure half (hurt / knockOut / wake) is imported by raiders.js, airborne.js and shipSim.js alike, so a blow hurts the same wherever it lands.
import { config } from '../../config.js';

const H = () => config.HEALTH;
export const hearts = (p) => (p.hearts == null ? H().MAX : p.hearts);
export const full = (p) => hearts(p) >= H().MAX;

export function hurt(p, amount, o = {}) {
  const C = H();
  if (!C.ENABLED) return o.old ? 'ko' : null;
  if (p.enemy || p.ko > 0 || (p.koGrace > 0 && !o.melee)) return null;
  const big = !!o.big || amount >= C.BIG;
  if (!big && p.hurtT > 0 && !o.melee) return null; // (a blow in a fight is never shielded by an earlier burn or blast: swords and shoves count one by one, as they always did)
  const before = hearts(p);
  const left = big ? 0 : Math.max(0, before - amount);
  p.hearts = left;
  p.hurtT = Math.max(p.hurtT || 0, o.iframes ?? C.IFRAMES);
  const e = (p.heartEvt ||= { lost: 0, cause: o.cause || 'hit', big: false });
  e.lost += before - left;
  e.big = e.big || big;
  e.ko = e.ko || left <= 0;
  e.cause = o.cause || e.cause;
  return left <= 0 ? 'ko' : 'hit';
}

export function knockOut(p, time, o = {}) {
  p.ko = Math.max(p.ko || 0, time);
  p.prog = 0;
  p.lock = null;
  p.fire = false;
  p.burnT = 0;
  if (!o.keepCarry) p.carry = null;
}

export function wake(p) {
  const C = H();
  if (C.ENABLED && hearts(p) < C.WAKE_HP) p.hearts = C.WAKE_HP;
  p.burnT = 0;
}
export function revived(p) {
  wake(p);
  p.koGrace = Math.max(p.koGrace || 0, config.RAIDERS.WAKE_GRACE); // (as when he wakes by himself: a few seconds before the next blow or burn counts)
}

export function createHealth({ state, ship, phoneFx, emitPlayerUi, shipPuff, shipPop }) {
  const C = () => config.HEALTH;
  const layout = ship.layout;
  // Counters read by tools/botsim.mjs and the --check-health gate: hearts lost by cause, hearts healed (medical bay / bandage / rest), seconds spent burning.
  state.healthStats = { lost: {}, kos: {}, healed: 0, bandaged: 0, rested: 0, burnSecs: 0, ticks: 0 };
  const S = state.healthStats;
  const lap = () => (state.course ? state.course.lap : 0);

  // The medical bay: its deck and cot, or null (a ship without one). Read each time: a refit or a break-off may change the layout.
  const medbay = () => {
    const mb = layout.medbay;
    if (!mb) return null;
    const d = layout.platforms.findIndex((q) => q.id === mb.p);
    return d < 0 ? null : { d, x: mb.x };
  };

  // The TV and phone side of a hit, once per frame (the hit itself may come from any system, so it leaves a note on the player: heartEvt).
  const announce = (p) => {
    const e = p.heartEvt;
    p.heartEvt = null;
    if (!e || e.lost <= 0) return;
    S.lost[e.cause] = (S.lost[e.cause] || 0) + e.lost;
    if (e.ko) S.kos[e.cause] = (S.kos[e.cause] || 0) + 1;
    shipPuff(p.x, p.y - 60, e.big ? '#ff5a1f' : '#e63946', e.big ? 10 : 5);
    if (!e.big) shipPop(p.x, p.y - 150, e.cause === 'fire' ? 'burn' : 'hurt', '#e63946', 0.8);
    if (!p.bot) emitPlayerUi(p.id, { fx: { toast: e.cause === 'fire' ? 'You are burning! Step away from the fire!' : null, buzz: e.big ? [200, 60, 200] : [90, 40, 90], hit: 1 } });
  };
  const gain = (p, n, how) => {
    const before = hearts(p);
    p.hearts = Math.min(C().MAX, before + n);
    const got = p.hearts - before;
    if (got <= 0) return;
    S[how] += got;
    shipPuff(p.x, p.y - 70, '#8fe388', 6);
    shipPop(p.x, p.y - 150, 'heal', '#8fe388', 0.8);
    if (!p.bot) phoneFx(p, null, [25, 40, 25]);
  };

  // Every frame, for each of this ship's crew (shipSim.js stepCrew).
  const step = (p, dt) => {
    const K = C();
    if (!K.ENABLED || p.enemy) return;
    if (state.phase !== 'flying' || p.heartLap !== lap()) { // moored, or a new mission: everyone is whole again
      p.hearts = K.MAX; p.hurtT = 0; p.burnT = 0; p.healT = 0; p.heartEvt = null; p.inFire = false;
      p.heartLap = lap();
      if (state.phase !== 'flying') return;
    }
    if (p.hearts == null) p.hearts = K.MAX;
    if (p.hurtT > 0) p.hurtT = Math.max(0, p.hurtT - dt);
    if (p.heartEvt) announce(p);
    p.inFire = false;
    if (p.ko > 0 || p.fall || p.fly || p.swing || p.onGunship || p.d == null) { p.burnT = 0; return; }

    // fire: stand in or next to one and you burn (hopping over it, climbing a ladder past it, and spraying it out are safe)
    const F = K.FIRE;
    let burn = 0;
    if (p.conn == null && !((p.jz || 0) > config.MOVE.JUMP_DODGE) && !(p.koGrace > 0)) {
      for (const f of state.fires) if (f.d === p.d && Math.abs(f.x - p.x) < F.REACH) burn = Math.max(burn, f.big ? F.BIG_MUL : 1);
    }
    if (burn) {
      p.inFire = true;
      p.burnGap = 0;
      const spraying = !!(p.act && p.act.type === 'fire' && p.act.hold && p.fire);
      const rate = burn * (spraying ? F.SPRAY_MUL : 1);
      p.burnT = (p.burnT || 0) + dt * rate;
      S.burnSecs += dt * (rate > 0 ? 1 : 0);
      const need = p.burned ? F.TICK : F.FIRST;
      if (p.burnT >= need) {
        const r = hurt(p, F.HEARTS, { cause: 'fire' });
        if (r) {
          p.burnT = 0;
          p.burned = true;
          S.ticks++;
          if (r === 'ko') knockOut(p, config.RAIDERS.KO_TIME);
        } else p.burnT = need; // (still shielded by an earlier blow: it burns the moment that wears off)
      }
    } else {
      p.burnGap = (p.burnGap || 0) + dt;
      if (p.burnT > 0) p.burnT = Math.max(0, p.burnT - dt * F.COOL);
      if (p.burnGap > F.RESET) p.burned = false;
    }

    // healing: the medical bay's cot (or, on a ship with none, a slow rest)
    if (hearts(p) < K.MAX) {
      const mb = medbay();
      const at = !!mb && p.d === mb.d && p.conn == null && Math.abs(p.x - mb.x) < K.HEAL.REACH;
      const every = mb ? (at ? K.HEAL.EVERY : 0) : K.HEAL.NO_MEDBAY_EVERY;
      if (every > 0 && !p.inFire) {
        if ((p.healT = (p.healT || 0) + dt) >= every) { p.healT = 0; gain(p, 1, mb ? 'healed' : 'rested'); }
      } else p.healT = Math.max(0, (p.healT || 0) - dt);
    } else p.healT = 0;

    // a bandage that is not being tied wears off (the same way a half-sprayed fire does)
    if (p.prog > 0) {
      if (!p.worked) p.prog = Math.max(0, p.prog - dt * 0.4);
      p.worked = false;
    }
  };

  // A burst at (x, y) in ship coordinates hurts everyone of this ship within `radius` px of it (measured to the chest): hearts, or a BIG hit (knocked out at once). Returns the crew it hurt.
  const blast = (x, y, radius, o = {}) => {
    const out = [];
    for (const p of Object.values(state.players)) {
      if (p.enemy || p.fall || p.fly || p.d == null || p.onGunship || p.conn != null || (o.skip && o.skip(p))) continue;
      if (Math.hypot(p.x - x, p.y - 40 - (p.jz || 0) - y) >= radius) continue;
      const r = hurt(p, o.big ? C().BIG : o.hearts ?? 1, { cause: o.cause || 'blast', big: !!o.big, old: !!o.old });
      if (!r) continue;
      if (r === 'ko') knockOut(p, o.koTime ?? config.RAIDERS.KO_TIME);
      out.push(p);
    }
    return out;
  };

  // A crewmate's bandage is tied: +BANDAGE.HEARTS for the hurt one.
  const bandage = (target) => gain(target, C().BANDAGE.HEARTS, 'bandaged');

  return { step, blast, bandage, medbay };
}
