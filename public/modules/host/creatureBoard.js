// BOARDING A GIANT CREATURE (BOSSES.md 3.1 "Boarding", C.2). The surfaced mantle is a LANDING PLACE (air.addProvider, the way rivalDecks lets crew land on another ship) and every part is a HOOKSHOT ANCHOR.
//   creatureSurfaces(state, ship)        the airborne.js surfaces for `ship`'s crew (a strip across the top of the mantle); landing on it boards
//   creatureAnchor(state, wx, wy)        the hookshot's probe: the part under a world point as an anchor { kind, pos(), board? } (it rides the part), or null
//   boardAt(state, ship, p, wx, wy)      put a flying crewman on the mantle: p.on = { cr, id, s }. He keeps player.ship (his own ship) and is carried by the part's transform every step
//   boardCheck(state, p) / dismount      if the creature dives or dies (or he is knocked out) a boarder falls back into the airborne / fall system and can be rescued as usual
//   boarderStep(state, ship, p, dt, holdOk)   one step of a boarder: walk the mantle's outline (the stick), JUMP leaves, Action holds BLIND IT at an eye / STRIKE THE HEART (sword)
// A boarder is a flying player (p.fly, world coordinates) with p.on set: every system that skips flyers skips him, and the airborne step is not run for him (shipSim.js).
// The mantle is the body's rigid capsule (creature.js): the OUTLINE a boarder walks is the round top of that capsule and then down its sides, parameterised by arc length s (negative = the -x side).
import { config } from '../../config.js';
import { hitInfo } from './creature.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { shipOf } from './ships.js';
import { pop } from './popups.js';

const BR = () => config.CREATURES.BOARD;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const segMid = (s) => ({ x: s.x + Math.cos(s.ang) * s.len * 0.5, y: s.y + Math.sin(s.ang) * s.len * 0.5 });

export const mantleOf = (cr) => {
  const m = cr && cr.parts.find((p) => p.kind === 'mantle' && !p.dead);
  return m && m.segs[0] ? m : null;
};
// The mantle's frame: top = the centre of its rounded top, d = the unit vector down its axis, l = the unit vector across it toward +x, R its radius, len the straight part.
function frame(m) {
  const s = m.segs[0];
  let top = { x: s.x, y: s.y }, d = { x: Math.cos(s.ang), y: Math.sin(s.ang) };
  if (d.y < 0) { top = { x: s.x + d.x * s.len, y: s.y + d.y * s.len }; d = { x: -d.x, y: -d.y }; }
  return { top, d, l: { x: d.y, y: -d.x }, R: s.r, len: s.len };
}
const smax = (F) => F.R * Math.PI / 2 + F.len * 0.98;
// The point at arc length s along the outline: over the round top, then down the straight side.
function pathPos(F, s) {
  const sg = s >= 0 ? 1 : -1, a = Math.abs(s), arc = F.R * Math.PI / 2;
  if (a <= arc) {
    const phi = a / F.R, c = Math.cos(phi), sn = Math.sin(phi);
    return { x: F.top.x + F.R * (-F.d.x * c + sg * F.l.x * sn), y: F.top.y + F.R * (-F.d.y * c + sg * F.l.y * sn) };
  }
  const t = Math.min(a - arc, F.len);
  return { x: F.top.x + F.d.x * t + sg * F.l.x * F.R, y: F.top.y + F.d.y * t + sg * F.l.y * F.R };
}
// The s whose point is nearest the world point (a coarse scan, then a finer one).
function nearestS(F, wx, wy) {
  const M = smax(F);
  let best = 0, bd = Infinity;
  for (let pass = 0, lo = -M, hi = M, step = 40; pass < 2; pass++, step = 4) {
    for (let s = lo; s <= hi; s += step) {
      const q = pathPos(F, s), d = Math.hypot(q.x - wx, q.y - wy);
      if (d < bd) { bd = d; best = s; }
    }
    lo = Math.max(-M, best - 40);
    hi = Math.min(M, best + 40);
  }
  return best;
}

// ---- the landing strip ---- (people only: a bot would stand on it for ever, so it falls past as it always did and is carried back to the medical bay; C.5 teaches bots to board)
export function creatureSurfaces(state, ship) {
  const cr = state.creature;
  if (!cr || cr.mode !== 'idle' || !state.ships.includes(ship) || ship.ctx.wreck) return [];
  const m = mantleOf(cr);
  if (!m) return [];
  const F = frame(m), B = BR();
  const a = toShipX(ship, F.top.x - B.LAND_HALF), b = toShipX(ship, F.top.x + B.LAND_HALF);
  const y = toShipY(ship, F.top.y - F.R);
  // where this strip was on the ship one step ago (the first call of a step shifts it): the sea and the ship's own climb carry it up through a man who is falling onto it (airborne.js prevY)
  const rec = ((cr.surfRec ||= {})[ship.id] ||= { age: cr.age, cur: y, prev: y });
  if (rec.age !== cr.age) { rec.prev = rec.cur; rec.age = cr.age; }
  rec.cur = y;
  return [{ id: 'creature:mantle', y, prevY: rec.prev, x0: Math.min(a, b), x1: Math.max(a, b), only: (p) => !p.bot, onLand: (p) => boardAt(state, ship, p, toWorldX(ship, p.x), toWorldY(ship, p.y)) }];
}

// ---- the hook ----
export function creatureAnchor(state, wx, wy) {
  const cr = state.creature;
  if (!cr || cr.mode !== 'idle') return null;
  const hit = hitInfo(cr, wx, wy, BR().HOOK_R);
  if (!hit) return null;
  const p = hit.part, i = hit.seg, s0 = p.segs[i];
  const c = Math.cos(s0.ang), sn = Math.sin(s0.ang), rx = wx - s0.x, ry = wy - s0.y;
  const lu = rx * c + ry * sn, lv = -rx * sn + ry * c; // (where on the segment it caught, in the segment's own frame: it rides the part as it moves)
  const pos = () => {
    if (state.creature !== cr || cr.mode !== 'idle' || p.dead) return null;
    const s = p.segs[Math.min(i, p.segs.length - 1)];
    if (!s || i >= p.segs.length) return null;
    const cc = Math.cos(s.ang), ss = Math.sin(s.ang);
    return { x: s.x + cc * lu - ss * lv, y: s.y + ss * lu + cc * lv };
  };
  const body = p.kind !== 'tentacle'; // (reel right in to the body and you climb aboard)
  return { kind: 'enemy', creature: cr, part: p, pos, surf: body, board: body ? (pl) => { const q = pos() || { x: wx, y: wy }; return boardAt(state, shipOf(state, pl), pl, q.x, q.y); } : null };
}

// ---- aboard ----
export function boardAt(state, ship, p, wx, wy) {
  const cr = state.creature, m = mantleOf(cr);
  if (!m) return false;
  const F = frame(m), s = nearestS(F, wx, wy), q = pathPos(F, s);
  p.on = { cr, id: 'mantle', s };
  p.fly = true; // (a boarder is a world object, drawn and skipped like a flyer; the airborne step is not run for him)
  p.air = false;
  p.jz = 0;
  p.fvx = p.fvy = 0;
  p.x = q.x;
  p.y = q.y;
  p.rot = 0;
  p.chute = 0;
  p.chuteOpen = false;
  p.cannon = false;
  p.tossed = false;
  p.hook = null;
  p.noLand = 0;
  if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'YOU ARE ON THE KRAKEN! BLIND IT at an eye, STRIKE THE HEART with a sword. JUMP to leap off.', [60, 40, 60]);
  pop(state, q.x, q.y - 160, 'BOARDED!', '#ffd23f', 1.2);
  return true;
}

// Off the creature: JUMP leaps toward the ship, anything else (it dives, it dies, a blow knocks him out) just drops him. Either way he is a flyer again, with a parachute button.
export function dismount(state, p, how) {
  const o = p.on;
  if (!o) return;
  const ship = shipOf(state, p), B = BR();
  p.on = null;
  p.act = p.grabAct = null;
  p.fire = false;
  p.prog = 0;
  p.fly = true;
  p.air = false;
  p.tossed = true; // (Action opens his parachute)
  p.chute = 0;
  p.rot = 0;
  if (how === 'jump') {
    const toward = Math.sign(toWorldX(ship, ship.layout.refPoint.x) - p.x) || 1;
    p.fvx = toward * B.JUMP_VX;
    p.fvy = -B.JUMP_VY;
    p.noLand = 0.3;
  } else {
    p.fvx = o.cr && o.cr.vx ? o.cr.vx : 0;
    p.fvy = 120;
    p.noLand = 0;
    if (o.cr && o.cr.hooks.phoneFx) o.cr.hooks.phoneFx(p, 'You fall! Open the parachute (Action) or hook something!', [120, 60, 120]);
  }
  p.apex = toShipY(ship, p.y);
  p.lsy = p.apex;
  p.stag = 0;
}
// Called first thing for a boarder each step: still a creature to stand on?
export function boardCheck(state, p) {
  const o = p.on;
  if (!o) return;
  const cr = state.creature;
  if (!cr || cr !== o.cr || cr.mode !== 'idle' || !mantleOf(cr)) return dismount(state, p, 'gone');
  if (p.ko > 0 || p.fall) return dismount(state, p, 'ko');
}

// What a boarder's Action button does where he stands: STRIKE THE HEART (sword, the heart exposed, within HEART_REACH) first, else BLIND IT at the nearest eye within EYE_REACH.
function actFor(state, p) {
  const cr = state.creature, B = BR();
  const job = (part, name) => part.job || (part.job = { name, prog: 0, worked: false });
  const heart = cr.parts.find((q) => q.kind === 'heart' && !q.dead && !q.hidden);
  const near = (part) => { const m = segMid(part.segs[0]); return Math.hypot(m.x - p.x, m.y - p.y) <= (part.kind === 'heart' ? B.HEART_REACH : B.EYE_REACH) + part.segs[0].r; };
  if (heart && near(heart)) {
    if (p.carry === 'sword') return { type: 'strike', obj: job(heart, 'strike'), hold: true, time: B.HEART_TIME, label: 'STRIKE THE HEART!', part: heart };
    return { type: 'need', label: 'Need a sword to strike the heart!' };
  }
  const eyes = cr.parts.filter((q) => q.kind === 'eye' && !q.dead && !(q.blindT > 0) && near(q));
  if (eyes.length) {
    eyes.sort((a, b) => { const ma = segMid(a.segs[0]), mb = segMid(b.segs[0]); return Math.hypot(ma.x - p.x, ma.y - p.y) - Math.hypot(mb.x - p.x, mb.y - p.y); });
    return { type: 'blind', obj: job(eyes[0], 'blind'), hold: true, time: B.BLIND_TIME, label: 'BLIND IT!', part: eyes[0] };
  }
  return null;
}
// One step of a boarder (shipSim.js, where a walker's step would be).
export function boarderStep(state, ship, p, dt, holdOk) {
  const cr = state.creature, o = p.on, m = mantleOf(cr), B = BR();
  if (!m) return;
  const F = frame(m);
  p.actQ = false;
  p.grabQ = false;
  p.hook = null;
  p.lock = null;
  p.conn = null;
  if (p.jumpQ) {
    p.jumpQ = false;
    return dismount(state, p, 'jump');
  }
  const dir = clamp(p.jx || 0, -1, 1) * ship.pose.f; // (the stick is along the ship; he walks along the world)
  if (Math.abs(dir) > 0.15) {
    o.s += dir * B.WALK * dt;
    p.face = dir < 0 ? -1 : 1;
  }
  const M = smax(F);
  o.s = clamp(o.s, -M, M);
  const q = pathPos(F, o.s);
  p.x = q.x;
  p.y = q.y;
  p.fvx = p.fvy = 0;
  p.moving = Math.abs(dir) > 0.15;
  p.climb = false;
  p.rot = 0;
  p.jz = 0;
  const act = actFor(state, p);
  p.act = act;
  p.grabAct = null;
  if (act && act.hold && p.fire && holdOk(p)) {
    act.obj.worked = true;
    act.obj.prog += dt / act.time;
    if (act.obj.prog >= 1) {
      act.obj.prog = 0;
      const part = act.part, at = segMid(part.segs[0]);
      if (act.type === 'blind') {
        part.blindT = B.BLIND_FOR;
        pop(state, at.x, at.y - 140, 'BLINDED!', '#ffd23f', 1.6);
        state.sfxQ.push(['roar']);
        cr.stats.blinded = (cr.stats.blinded || 0) + 1;
        if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'You blinded it! Its grabs slow down.', [30, 40, 30]);
      } else {
        cr.hooks.hurt({ part, seg: 0 }, B.HEART_DMG, { who: p.id, src: 'sword' });
        cr.stats.struck = (cr.stats.struck || 0) + 1;
        pop(state, at.x, at.y - 140, 'STRIKE!', '#ff5a1f', 1.8);
        state.sfxQ.push(['sever']);
        if (cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'You stabbed its heart!', [200, 60, 200]);
      }
    }
  }
}
// The jobs a boarder works wear off when nobody holds them (once a step, creatureSystem update).
export function decayJobs(cr, dt) {
  for (const p of cr.parts) {
    const j = p.job;
    if (!j) continue;
    if (!j.worked) j.prog = Math.max(0, j.prog - dt * 0.4);
    j.worked = false;
  }
}
