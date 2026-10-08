// THE LIVELY BOT CAPTAIN of a Versus ship (PVP.md "Bot PvP AI", config.PVP.BOT). Node-safe: no DOM.
//
// course.js rivalPlan is the steady part: hold the standoff, keep an altitude edge, take cover, back out of rock, retreat to repair. bots.js operate() asks it for the plan and then
// hands the plan to captainFly(), which makes it LIVE. Everything here is behind `state.rival` (Versus only): co-op never reaches it.
//   * WEAVE    the wanted altitude and the throttle jump about at random (never a sine), the standoff wanders, so a ship is never still.
//   * DODGE    every shell that would hit the hull if she held her course is followed; when one is on its way she jumps away from where it would land (up or down) and surges.
//   * PLAYS    picked by the captain's STYLE (brawler / sniper / boarder / daredevil, rolled for each ship each round; the gunship captains' personalities plus a daredevil):
//                pass    fly over (a high pass; the bombardier drops on her gasbags) or under her, cross to her other side, then COME ABOUT to face her again;
//                ram     full speed at a weakened rival when we are the stronger ship, back off after the touch;
//                grapple close in and match speed for a while so the decks are within a hook's throw (bots.js sends the boarders across);
//                chase   a rival that is nearly done is pressed.
//   * CALL-OUTS sparingly on the TV banner ("RED RAM RUN!").
// The captain lives on the ship: ship.captain = { style, rangeAdj (read by course.js rivalPlan), bombRun (read by bots.js: the bombardier drops), stats }.
import { config } from '../../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY } from '../pose.js';
import { mainShip } from '../ships.js';
import { altWindow } from '../course.js';
import { solidAt } from '../maps.js';
import { holdFor } from './range.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (r) => r[0] + Math.random() * (r[1] - r[0]);
const smooth = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// What a ship has to fight with, gun by gun (the layout's gun mounts and her ram prow).
export function profileOf(L) {
  const p = { long: 0, mortar: 0, scatter: 0, flak: 0, harpoon: 0, mines: 0, plain: 0, ram: L.ram ? 1 : 0 };
  for (const m of Object.values(L.gunMounts)) { if (m.type) p[m.type] = (p[m.type] || 0) + 1; else p.plain++; }
  return p;
}
// The band a captain plays in: the one her style likes, moved by what her ship can fight with (config.PVP.BOT.RANGE). A band the ship has nothing to fight in is not chosen (a sniper with no long gun and no
// mortar plays the longest band she CAN fight in); with no guns at all it is the short band, the ram and the boarders.
export function chooseBand(S, prof) {
  const R = config.PVP.BOT.RANGE;
  const sc = { short: 0, mid: 0, long: 0 };
  sc[S.band || 'mid'] += R.STYLE;
  sc.long += R.LONG_GUN * prof.long + R.MORTAR * prof.mortar;
  sc.mid += R.PLAIN * prof.plain + R.FLAK * prof.flak;
  sc.short += R.SCATTER * prof.scatter + R.HARPOON * prof.harpoon + R.RAM * prof.ram;
  const can = { short: true, mid: prof.plain + prof.flak > 0, long: prof.long + prof.mortar > 0 };
  let best = 'short';
  for (const b of ['short', 'mid', 'long']) if (can[b] && sc[b] > sc[best]) best = b;
  return best;
}

// The captain of this ship for this round (made when the round changes: a fresh style, fresh counters).
export function captainOf(state) {
  const ship = mainShip(state);
  const round = state.match ? state.match.round : 0;
  let c = ship.captain;
  if (c && c.round === round) return c;
  const S = config.PVP.BOT.STYLES;
  const names = Object.keys(S);
  let style = config.PVP.BOT.STYLE && S[config.PVP.BOT.STYLE] ? config.PVP.BOT.STYLE : null;
  if (!style && ship.ai && S[ship.ai.style]) style = ship.ai.style; // (B.5: the enemy gunship's captain flies in the style of her blueprint's personality, gunshipShip.js)
  if (!style) {
    let pick = Math.random() * names.reduce((a, n) => a + S[n].WEIGHT, 0);
    style = names[names.length - 1];
    for (const n of names) { pick -= S[n].WEIGHT; if (pick <= 0) { style = n; break; } }
  }
  c = ship.captain = {
    round, style, S: S[style], t: 0, think: 0, play: 'duel', leg: '', legT: 0, rangeAdj: 0, bombRun: false, side: null, ca: false, behindT: 0, lastTurn: 0,
    blockT: 0, blockL: false, blockR: false, jAlt: 0, jAltT: 0, jThr: 0, jThrT: 0, rWob: 0, rWobT: 0, lastSign: 1,
    dodge: null, dodgeCd: 0, scanT: 0, threat: null, grappleUntil: 0, passCd: rnd([6, 14]), ramCd: 8, grappleCd: rnd([10, 24]), backoffUntil: 0, calloutAt: -99,
    stats: { jinks: 0, dodges: 0, passes: 0, bombRuns: 0, rams: 0, grapples: 0, noRoom: 0, chases: 0, retreats: 0, turns: 0, kites: 0, mineRuns: 0, harpoons: 0 },
    losT: 0, openT: 0, losShift: 0, losPickT: 0,
    mines: false, mineGap: 0, mineUntil: 0, kiteCd: ship.ai ? 0 : rnd([4, 12]), kiteUntil: 0, harpoonCd: ship.ai ? 0 : rnd([6, 14]), harpoonT: 0, mineSaid: false,
  };
  c.prof = profileOf(ship.layout);
  c.band = chooseBand(S[style], c.prof);
  c.hold = holdFor(c.band) + S[style].stand * config.PVP.STANDOFF * 0.4; // (px between the aim points of two classic hulls that she likes: the band's hold, nudged by her style)
  return c;
}

// A TV call-out for a play (the banner along the bottom). Sparse: one every CALLOUT_GAP s; a boarding or a ram (prio 2) may cut in after 2 s. Never over a banner that is still fresh.
export function callout(state, text, prio = 1) {
  const ship = mainShip(state), c = ship.captain, B = config.PVP.BOT;
  const m = state.match;
  if (!m || !c || m.phase !== 'fight') return false;
  const now = m.fightT, gap = prio >= 2 ? 2 : B.CALLOUT_GAP;
  if (m.calloutAt === undefined || now < m.calloutAt) m.calloutAt = -99; // (a new round starts the clock again)
  if (now - m.calloutAt < gap) return false;
  if (state.ev.warn > 0.4 && prio < 2) return false;
  m.calloutAt = now;
  state.ev.warn = 2.2;
  state.ev.warnText = (ship.team ? ship.team.id.toUpperCase() + ' ' : '') + text;
  return true;
}
const count = (state, key) => { const m = state.match, s = mainShip(state); if (m && m.count && s.team) m.count(s.team.id, key); };

// Shells flying at our hull: for each shell of the other ship, follow its straight flight against where our hull will be, and keep the soonest hit
// { t (seconds), sy (where on the hull, ship coordinates), n (how many shells are on their way) }.
function scanShells(state, ship, D) {
  let best = null, n = 0;
  const pose = ship.pose;
  for (const sh of state.shells) {
    if (sh.life <= 0 || sh.from === ship.id) continue;
    if (Math.abs(sh.x - pose.x) > 4200 || Math.abs(sh.y - pose.y) > 2600) continue;
    const span = Math.min(sh.life, D.LOOK);
    for (let t = 0.04; t <= span; t += 0.05) {
      const wx = sh.x + (sh.vx - pose.vx) * t, wy = sh.y + (sh.vy - pose.vy) * t;
      const sx = toShipX(ship, wx), sy = toShipY(ship, wy);
      if (ship.sim.hitsShip(sx, sy)) {
        n++;
        if (!best || t < best.t) best = { t, sy, sx };
        break;
      }
    }
  }
  return best && { ...best, n };
}

// Would a bomb let go now (from the bay doors) pass through the rival's hull? (the bombardier's trigger, bots.js)
export function bombFalls(state) {
  const R = state.rival, ship = mainShip(state), B = config.PVP.BOT.BOMB;
  const bay = ship.layout.bombBay;
  if (!R || R.down || !bay) return false;
  const rv = R.ship, g = state.bombBay.from || { x: toWorldX(ship, bay.x), y: toWorldY(ship, bay.y) + 20 };
  const vx0 = state.ships[0].pose.vx; // (course.js dropBomb: a bomb starts with the main ship's speed)
  let x = g.x, y = g.y, vx = vx0, vy = 60;
  const BM = config.BOMBS;
  for (let t = 0; t < B.LOOK; t += B.STEP) {
    vx += (0 - vx) * Math.min(1, B.STEP * BM.DRAG);
    vy += BM.GRAVITY * B.STEP;
    x += vx * B.STEP; y += vy * B.STEP;
    if (rv.sim.hitsShip(toShipX(rv, x - rv.pose.vx * t), toShipY(rv, y - rv.pose.vy * t))) return true;
  }
  return false;
}

// Is one of the rival's decks within a parachute drop of the bomb-bay doors? (bots.js: a crewman jumps and drifts onto her)
export function dropPossible(state) {
  const R = state.rival, ship = mainShip(state), V = config.PVP.BOT.RAID;
  const bay = ship.layout.bombBay;
  if (!R || R.down || !bay) return false;
  const jx = toWorldX(ship, bay.jumpX), by = toWorldY(ship, bay.y);
  const rv = R.ship;
  return rv.layout.platforms.some((pl) => {
    if (pl.nest) return false;
    const a = toWorldX(rv, pl.x0), b = toWorldX(rv, pl.x1), wy = toWorldY(rv, pl.y);
    return wy >= by + V.DROP_BELOW && wy <= by + 1500 && Math.abs(jx - clamp(jx, Math.min(a, b), Math.max(a, b))) <= V.DROP_REACH;
  });
}

// The lively captain. `plan` = what course.js rivalPlan said ({ target (altitude), speed (along the bow), dx (how far ahead of the bow the rival is) }); it is changed in place.
// Returns { ca (hold COME ABOUT), play } or null when the captain is off (config.PVP.BOT.WEAVE) or there is nothing to fight.
export function captainFly(state, p, plan, dt) {
  const P = config.PVP, B = P.BOT;
  const R = state.rival;
  const ship = mainShip(state);
  const gun = !!ship.ai; // (the enemy gunship, B.5: her director (gunshipShip.js) picks the ring spots, the strafing runs and the retreats; this is her WEAVE and her DODGE on top - no passes, rams, grapples or chases of the Versus captain)
  if (!B.WEAVE || !R || R.down || (!gun && (!state.match || state.match.phase !== 'fight'))) return null;
  const c = captainOf(state);
  const S = c.S;
  const f = ship.pose.f, L = ship.layout, AIM = L.aimPoint;
  const mx = toWorldX(ship, AIM.x), my = toWorldY(ship, AIM.y);
  const gap = R.mid.x - mx, dyw = R.mid.y - my; // + = she is to the right of / below us
  const dir = gap < 0 ? -1 : 1;
  const dist = Math.hypot(gap, dyw);
  const TOP = config.SHIP.TOP_SPEED;
  c.t += dt;
  c.legT += dt;
  c.harpoonCd -= dt;
  c.kiteCd -= dt;
  const hullS = L.bounds, rS = R.layout.bounds;
  const half = (hullS.x1 - hullS.x0) / 2 + (rS.x1 - rS.x0) / 2; // how far apart the aim points are when the hulls just touch end to end
  const stand = P.STANDOFF + (hullS.x1 - hullS.x0) / 2 + (rS.x1 - rS.x0) / 2 - 2 * P.REF_HALF;
  const holes = state.breaches.length + state.gasHoles.length;
  const hurt = state.ship.hull < B.RETREAT_HULL && holes > B.RETREAT_HOLES;
  const wedged = !!plan.wedged;
  const fire = c.threat && c.threat.t < B.DODGE.LOOK; // shells are on their way
  const heat = fire ? B.JINK.HOT : 1;
  const TN = config.SHIP.TURN;
  const turning = ship.pose.turn > 0;
  if (turning && !c.lastTurn) { c.stats.turns++; count(state, 'turns'); }
  c.lastTurn = turning ? 1 : 0;

  // ---- shells on their way, scanned a few times a second ----
  c.scanT -= dt;
  if (c.scanT <= 0) {
    c.scanT = B.DODGE.EVERY;
    c.threat = scanShells(state, ship, B.DODGE);
  }
  c.dodgeCd -= dt;
  if (c.dodge && c.t > c.dodge.until) { c.dodge = null; c.dodgeCd = B.DODGE.COOLDOWN; }
  if (!c.dodge && c.dodgeCd <= 0 && c.threat && c.threat.t >= B.DODGE.MIN_T && !wedged && c.play !== 'ram' && Math.random() < Math.min(1, 0.55 * S.dodge + 0.25)) {
    const mid = (hullS.y0 + hullS.y1) / 2;
    let up = c.threat.sy > mid; // hit low on the hull: climb away from it; high: dive
    if (Math.random() < 0.12) up = !up;
    c.dodge = { up, alt: (up ? 1 : -1) * B.DODGE.ALT * S.dodge * (0.8 + Math.random() * 0.4), thr: (Math.random() < 0.5 ? -1 : 1) * B.DODGE.THR, until: c.t + rnd(B.DODGE.HOLD) };
    c.stats.dodges++;
    if (c.stats.dodges % 6 === 1) callout(state, 'EVASIVE!');
  }

  // ---- the weave: altitude jumps, throttle surges, a wandering standoff ----
  const gentle = c.play === 'grapple' ? 0.4 : 1; // (a boarding party needs the decks to hold still)
  if (c.t >= c.jAltT) {
    const sign = Math.random() < 0.75 ? -c.lastSign : c.lastSign;
    c.lastSign = sign;
    c.jAlt = sign * rnd(B.JINK.ALT) * S.jink * gentle;
    c.jAltT = c.t + rnd(B.JINK.EVERY) * heat;
    c.stats.jinks++;
  }
  if (c.t >= c.jThrT) {
    c.jThr = (Math.random() < 0.5 ? -1 : 1) * rnd(B.JINK.THR) * S.jink * gentle;
    c.jThrT = c.t + rnd(B.JINK.THR_EVERY) * heat;
  }
  if (c.t >= c.rWobT) {
    c.rWob = (Math.random() * 2 - 1) * B.JINK.RANGE;
    if (Math.random() < B.JINK.EXCURSION) c.rWob = (Math.random() < 0.5 ? -1 : 1) * B.JINK.EXCURSION_RANGE;
    c.rWobT = c.t + rnd(B.JINK.RANGE_EVERY);
  }

  // ---- deciding on a play (a few times a second) ----
  c.think -= dt;
  const facing = f * dir > 0; // her bow points at the rival
  const my_h = state.ship.hull, their_h = R.hull;
  const enough = state.ship.hull >= B.PASS.MIN_HULL && !hurt && !wedged;
  if (c.think <= 0) {
    c.think = 0.4;
    c.passCd -= 0.4; c.ramCd -= 0.4; c.grappleCd -= 0.4;
    if (!gun && c.play === 'duel' && !turning && state.turning && state.turning.t === 0) {
      const dtk = 0.4;
      const R_ = B.RAM, RP = c.prof.ram ? B.RAMPROW : null; // (a ram prow: the ram run is flown against any rival, much more keenly)
      const keen = Math.max(S.ram, RP ? 1 : 0);
      if (keen > 0 && facing && c.ramCd <= 0 && my_h >= (RP ? RP.MY_HULL : R_.MY_HULL) && their_h < (RP ? RP.THEIR_HULL : R_.THEIR_HULL) && my_h > their_h + (RP ? RP.EDGE : R_.EDGE) && dist < (RP ? RP.REACH : 3200) && !wedged && Math.random() < R_.RATE * keen * (RP ? RP.RATE_MUL : 1) * dtk * (their_h < 30 ? 3 : 1)) {
        c.play = 'ram'; c.legT = 0; c.rammed = false;
        callout(state, 'RAM RUN!', 2);
      } else if (c.band === 'long' && c.kiteCd <= 0 && !wedged && dist < (stand + (c.rangeAdj || 0)) * B.RANGE.KITE_AT && their_h > 8) {
        c.play = 'kite'; c.legT = 0; c.kiteUntil = c.t + rnd(B.RANGE.KITE_TIME); // (closed on at long range: turn tail and run, laying mines behind, until there is room to shoot again)
        c.stats.kites++;
        callout(state, 'KEEPS HER DISTANCE!');
      } else if (facing && c.passCd <= 0 && enough && dist < B.PASS.MAX_DIST && dist > stand * 0.5 && Math.random() < B.PASS.RATE * S.pass * dtk) {
        startPass(state, c, ship, R, L, B);
      } else if (c.grappleCd <= 0 && enough && S.raid >= 1 && dist < stand * 1.8 && Math.random() < config.PVP.BOT.RAID.GRAPPLE * S.raid * dtk) {
        c.play = 'grapple'; c.legT = 0; c.grappleUntil = c.t + rnd(config.PVP.BOT.RAID.GRAPPLE_TIME);
        c.stats.grapples++;
        callout(state, 'CLOSES IN TO BOARD!');
      }
    }
  }

  // ---- a rock island between the two ships: nobody can shoot (a shell dies in rock), so a captain who is not hiding climbs or dives to a height where the line is open ----
  const map = state.course && state.course.map;
  if (!gun && map) {
    const LOS = B.LOS;
    if (lineOpen(map, mx, my, R.mid.x, R.mid.y)) { c.losT = 0; c.openT += dt; if (c.openT > LOS.RESET) c.losShift = 0; }
    else if (!hurt && my_h + 10 >= their_h) {
      c.openT = 0;
      c.losT += dt;
      if (c.losT > LOS.AFTER && c.t >= c.losPickT) {
        c.losPickT = c.t + LOS.HOLD;
        c.losShift = 0;
        for (const d of LOS.TRY) if (lineOpen(map, mx, my + d, R.mid.x, R.mid.y) && !solidAt(map, mx, my + d)) { c.losShift = d; break; }
      }
    }
  }

  // ---- the plan, composed ----
  const AIMY = AIM.y;
  const win = altWindow(state, 2);
  const wall = state.match && state.match.wall; // (the arena's wind wall: do not climb into it)
  const altMax = wall ? AIMY - (wall.y0 + 260) : Infinity;
  const lo = win.min + 20, hi = Math.min(win.max - 20, altMax);
  const fits = win.min <= win.max;
  const clampAlt = (v) => (fits ? clamp(v, lo, Math.max(lo, hi)) : plan.target);
  let target = plan.target; // altitude
  let speed = plan.speed; // along the bow
  let ca = false;
  c.bombRun = false;
  let rangeAdj = gun ? S.stand * P.STANDOFF + c.rWob : c.hold - P.STANDOFF + c.rWob; // (the band she plays in: where she holds the rival, wandering a little)
  const holdNow = stand + (c.rangeAdj || 0);

  if (c.play === 'ram') {
    // full ahead at her; touch or lose heart
    target = clampAlt(AIMY - (R.mid.y + R.vy * Math.min(1, dist / 1500) + c.jAlt * 0.15));
    speed = Math.min(1, dir * f * 1.0);
    if (dist < B.RAM.REACH && !c.rammed) { c.rammed = true; c.stats.rams++; count(state, 'ramRuns'); callout(state, c.prof.ram ? 'RAMS WITH HER PROW!' : 'RAMMED!', 2); }
    if (c.rammed || c.legT > B.RAM.TIME || my_h < B.RAM.MY_HULL - 15 || their_h > B.RAM.THEIR_HULL + 25 || !facing || wedged) {
      c.play = 'duel'; c.ramCd = B.RAM.CD; c.backoffUntil = c.t + 4;
    }
  } else if (c.play === 'pass') {
    const r = passStep(state, c, ship, R, L, B, { dt, plan, f, dir, gap, dyw, mx, my, stand, half, clampAlt, AIMY, facing, wedged, hurt, turning });
    if (r) ({ target, speed, ca } = { target: r.target, speed: r.speed, ca: r.ca });
  } else {
    // duel (and grapple / chase, which are the duel with another standoff)
    let alt = plan.target + (c.jAlt + (c.dodge ? c.dodge.alt : 0)) * (hurt ? 0.6 : 1) - c.losShift;
    target = clampAlt(alt);
    if (state.ship.gas < B.JINK.LOW_GAS || state.ship.alt < win.min + B.JINK.FLOOR) target = Math.max(target, Math.min(plan.target, state.ship.alt) - 30); // (low on gas or close to the ground: no dives; every dive vents lift she cannot spare)
    let thr = c.jThr * (hurt ? 0.5 : 1) + (c.dodge ? c.dodge.thr : 0);
    if (c.play === 'grapple') {
      rangeAdj = -B.RAID.GRAPPLE_CLOSE;
      thr = c.jThr * 0.4;
      // match her way over the ground, so the decks stay a hook's throw apart
      thr += clamp((R.vx - ship.pose.vx) / TOP, -0.5, 0.5) * 0.8;
      if (c.t > c.grappleUntil || hurt || state.ship.hull < B.RAID.MIN_HULL) { c.play = 'duel'; c.grappleCd = rnd([22, 40]); }
    }
    if (c.play === 'kite') { // running from a chaser at long range (rivalPlan flies the retreat): until there is room, or the time is up
      thr = 0;
      if (c.t > c.kiteUntil || dist > holdNow * 1.3 || wedged || hurt) { c.play = 'duel'; c.kiteCd = B.RANGE.KITE_CD; }
    }
    const lineOn = !gun && (state.tows || []).find((t) => t.harpoon && t.a === ship); // our harpoon has latched: press in and board
    if (lineOn && c.play !== 'grapple' && c.play !== 'kite') {
      c.play = 'grapple'; c.legT = 0; c.grappleUntil = c.t + B.HARPOON.GRAPPLE_TIME; c.harpoonCd = B.HARPOON.CD; c.stats.harpoons++;
      callout(state, 'HARPOONS HER - REELING IN!', 2);
    }
    if (!gun && !hurt && their_h < B.CHASE.HULL && my_h >= B.CHASE.MY_HULL && c.band !== 'long') {
      rangeAdj -= B.CHASE.CLOSE;
      if (c.play !== 'chase') { c.play = 'chase'; c.stats.chases++; callout(state, 'GIVES CHASE!'); }
    } else if (c.play === 'chase') c.play = 'duel';
    if (hurt && !c.retreating) { c.retreating = true; c.stats.retreats++; callout(state, 'FALLS BACK TO REPAIR!'); }
    else if (!hurt) c.retreating = false;
    if (c.t < c.backoffUntil) rangeAdj += B.RAM.BACKOFF;
    const room = Math.max(0, Math.abs(gap) - (B.MIN_GAP + 150)) / 700; // (no surge at her once the hulls are nearly touching)
    if (thr * dir > room * 0.5) thr = dir * room * 0.5;
    speed = plan.speed + thr * f * 1; // the surge is along the world's x; with the bow pointing along it
    c.blockT -= dt; // rock close ahead on either side? (looked at a few times a second): no surge, no drive into it
    if (c.blockT <= 0) {
      c.blockT = 0.3;
      const reachX = 500 + Math.abs(ship.pose.vx);
      c.blockL = !aheadFree(state, ship, my, mx, -1, reachX);
      c.blockR = !aheadFree(state, ship, my, mx, 1, reachX);
    }
    if ((c.blockL && speed * f < 0) || (c.blockR && speed * f > 0)) speed = 0; // (speed * f = her way along the world)
    if (wedged) { speed = plan.speed; target = plan.target; }
    // come about when she stays behind the bow
    if (plan.dx < -TN.BOT_FAR && !wedged) c.behindT += dt; else c.behindT = 0;
    ca = c.behindT >= B.TURN_BEHIND;
    if (ca || turning) speed = clamp(speed, -0.25, 0.25);
  }
  c.rangeAdj = c.play === 'duel' || c.play === 'grapple' || c.play === 'chase' ? Math.max(rangeAdj, B.MIN_GAP - P.STANDOFF) : 0; // (never press the hulls together unless she means to: the noses touch about MIN_GAP apart)
  speed = clamp(speed, -config.SHIP.REVERSE, 1);
  if (!gun) {
    // ---- mines: a field across the chaser's path, and a wide berth round the ones already laid ----
    const MN = B.MINES;
    const awayV = -(ship.pose.vx - R.vx) * dir; // how fast she is drawing away from the rival (px/s)
    const wish = c.prof.mines > 0 && dist < MN.MAX_DIST && awayV > MN.AWAY && ((MN.RETREAT && (hurt || c.play === 'kite')) || (c.band === 'long' && dist < holdNow * MN.CLOSING_BAND));
    c.mineGap -= dt;
    if (wish && c.mineGap <= 0) { c.mineGap = MN.EVERY; c.mineUntil = c.t + MN.WINDOW; }
    c.mines = wish && c.t < c.mineUntil;
    if (c.mines && !c.mineSaid) { c.mineSaid = true; c.stats.mineRuns++; callout(state, 'LAYS A MINEFIELD!', 2); } else if (!c.mines) c.mineSaid = false;
    if (c.play !== 'ram' && c.play !== 'pass' && state.laid && state.laid.length) {
      const av = mineAvoid(state, ship, L, clamp(win.min, -1e9, 1e9), clampAlt, target);
      if (av) { target = av.target; if (av.stop && Math.abs(speed) > 0.1) speed *= 0.3; }
    }
  }
  plan.target = target;
  plan.speed = speed;
  c.ca = ca;
  return { ca, play: c.play };
}

// Is the sky between two world points free of rock? (twelve samples along the line, a couple of hits are a shut line: the same test aim.js uses to find the rival)
function lineOpen(map, x0, y0, x1, y1) {
  let shut = 0;
  for (let k = 1; k <= 12; k++) if (solidAt(map, x0 + ((x1 - x0) * k) / 13, y0 + ((y1 - y0) * k) / 13)) shut++;
  return shut < 2;
}

// Mines in the way (config.PVP.BOT.MINES.AVOID): any laid mine, ours too, in the box ahead of her nose (the way she is moving) that her hull would touch at her height; she climbs over it or dives
// under it, whichever is the shorter way the sky and the wall allow. Returns { target (the altitude to fly at), stop (no way round: slow down; the gunners are shooting) } or null.
function mineAvoid(state, ship, L, _unused, clampAlt, target) {
  const AV = config.PVP.BOT.MINES.AVOID, K = config.MINEFIELD, b = L.bounds, f = ship.pose.f;
  const xa = toWorldX(ship, b.x0), xb = toWorldX(ship, b.x1), x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
  const vx = ship.pose.vx, way = Math.abs(vx) > 40 ? Math.sign(vx) : f;
  const look = AV.LOOK + Math.abs(vx) * AV.SPEED_LOOK;
  const lo = way > 0 ? x1 - 150 : x0 - look, hi = way > 0 ? x1 + look : x0 + 150;
  const top = ship.pose.y + b.y0, bottom = ship.pose.y + b.y1;
  let up = 0, down = 0, n = 0;
  for (const m of state.laid) {
    if (m.dead || m.x < lo || m.x > hi) continue;
    const r = K.RADIUS * 1.5 + AV.MARGIN;
    if (m.y < top - r || m.y > bottom + r) continue;
    n++;
    up = Math.max(up, bottom - (m.y - r)); // climb this far and her belly is above the mine
    down = Math.max(down, m.y + r - top); // ...or dive this far and her top is below it
  }
  if (!n) return null;
  const here = state.ship.alt, goUp = clampAlt(here + up), goDown = clampAlt(here - down);
  const upOk = goUp >= here + up - 40, downOk = goDown <= here - down + 40;
  if (upOk && (!downOk || up <= down)) return { target: Math.max(target, goUp), stop: false };
  if (downOk) return { target: Math.min(target, goDown), stop: false };
  return { target, stop: true };
}

// ---- the pass: over or under the rival, to her other side, then come about ----
// Is the whole strip of sky the hull would sweep, flying level with her aim point at aimY from world x0 to x1, free of rock? (a pass is only flown where it is)
// Is the sky just beyond the hull's nose (dirW = +1: the right-hand end, -1: the left) for `reach` px free of rock? Only the new ground counts, so a ship already touching rock can still back away from it.
function aheadFree(state, ship, aimY, mx, dirW, reach) {
  const map = state.course && state.course.map;
  if (!map) return true;
  const b = ship.layout.bounds, A = ship.layout.aimPoint, f = ship.pose.f;
  const left = f > 0 ? A.x - b.x0 : b.x1 - A.x, right = f > 0 ? b.x1 - A.x : A.x - b.x0;
  const x0 = dirW > 0 ? mx + right : mx - left - reach, x1 = dirW > 0 ? mx + right + reach : mx - left;
  for (let x = x0; x <= x1; x += map.CELL) for (let y = aimY + (b.y0 - A.y) + 40; y <= aimY + (b.y1 - A.y) - 40; y += 200) if (solidAt(map, x, y)) return false;
  return true;
}
function corridorFree(state, ship, aimY, x0, x1, margin = 130) {
  const map = state.course && state.course.map;
  if (!map) return true;
  const b = ship.layout.bounds, A = ship.layout.aimPoint, f = ship.pose.f;
  const left = f > 0 ? A.x - b.x0 : b.x1 - A.x, right = f > 0 ? b.x1 - A.x : A.x - b.x0; // (how far the hull reaches to the left and right of the aim point in the world)
  const lo = Math.min(x0, x1) - left - margin, hi = Math.max(x0, x1) + right + margin;
  for (let x = lo; x <= hi; x += map.CELL) for (let y = aimY + (b.y0 - A.y) - margin; y <= aimY + (b.y1 - A.y) + margin; y += 200) if (solidAt(map, x, y)) return false;
  return true;
}
function startPass(state, c, ship, R, L, B) {
  const AIMY = L.aimPoint.y;
  const wall = state.match && state.match.wall;
  const P = config.PVP;
  const win = altWindow(state, 2);
  const mx = toWorldX(ship, L.aimPoint.x), dir0 = R.mid.x - mx < 0 ? -1 : 1;
  const endX = R.mid.x + dir0 * (P.STANDOFF + 400);
  const feasible = (over) => {
    const wantY = R.mid.y + (over ? -1 : 1) * passOffset(L, R, B, over);
    const altMax = wall ? AIMY - (wall.y0 + 260) : Infinity;
    return win.min <= win.max && AIMY - wantY <= altMax && corridorFree(state, ship, wantY, mx, endX, 80);
  };
  const canOver = feasible(true), canUnder = feasible(false);
  if (!canOver && !canUnder) { c.passCd = 6; c.stats.noRoom++; return; }
  const bombs = !!L.bombBay && state.bombBay.bombs > 0;
  let over = canOver;
  if (canOver && canUnder) over = Math.random() < (bombs ? B.PASS.OVER_BOMB * (0.4 + c.S.bomb) : 0.3);
  c.play = 'pass'; c.leg = 'align'; c.legT = 0; c.over = over; c.dir0 = R.mid.x - toWorldX(ship, L.aimPoint.x) < 0 ? -1 : 1;
  c.stats.passes++;
  if (over && bombs) { c.stats.bombRuns++; callout(state, 'HIGH PASS - BOMBS AWAY!', 2); }
  else callout(state, over ? 'HIGH PASS!' : 'DIVES UNDER!', 2);
}
// The aim-point-to-aim-point height that keeps the hulls apart (positive; px): our bottom clear of her top for a high pass, our top below her bottom for a dive-under.
function passOffset(L, R, B, over) {
  const b = L.bounds, a = L.aimPoint, rb = R.layout.bounds, ra = R.layout.aimPoint;
  return (over ? (b.y1 - a.y) + (ra.y - rb.y0) : (rb.y1 - ra.y) + (a.y - b.y0)) + B.PASS.MARGIN;
}
function passStep(state, c, ship, R, L, B, g) {
  const { plan, f, dir, gap, dyw, stand, half, clampAlt, AIMY, wedged, hurt, turning } = g;
  const off = (c.over ? -1 : 1) * passOffset(L, R, B, c.over); // our aim point's height relative to hers
  const wantY = R.mid.y + off + (c.dodge ? c.dodge.alt * 0.25 * (c.dodge.up ? -1 : 1) : 0);
  const alt = clampAlt(AIMY - wantY);
  const P = B.PASS;
  const abort = () => { c.play = 'duel'; c.passCd = P.CD; c.leg = ''; c.bombRun = false; return null; };
  if (wedged || hurt || state.ship.hull < P.MIN_HULL - 15 || (state.course && state.course.scraping)) return abort();
  c.corrT = (c.corrT || 0) - g.dt;
  if (c.corrT <= 0 && c.leg !== 'turn') { // (the strip ahead must stay clear of rock, looked at again a few times a second)
    c.corrT = 0.4;
    if (!corridorFree(state, ship, wantY, g.mx, g.mx + c.dir0 * 2600, 60)) return abort();
  }
  const need = Math.abs(off);
  const apart = Math.abs(dyw); // current vertical distance between the aim points
  const clear = apart >= need * 0.8; // the hulls are far enough apart in height to slide past each other
  if (c.leg === 'align') {
    // hold the standoff in x (the plan's own speed) while climbing or diving to the pass height
    c.bombRun = !!c.over && !!L.bombBay && state.bombBay.bombs > 0; // (the bombardier takes his seat while she climbs)
    if (c.legT > P.ALIGN_TIME) return abort();
    if (Math.abs(AIMY - wantY - (state.ship.alt)) < 160 || clear) { c.leg = 'cross'; c.legT = 0; }
    return { target: alt, speed: plan.speed, ca: false };
  }
  if (c.leg === 'cross') {
    c.bombRun = !!c.over && !!L.bombBay && state.bombBay.bombs > 0;
    const sign = gap < 0 ? -1 : 1;
    const crossed = sign !== c.dir0 && Math.abs(gap) > stand * P.END;
    if (crossed || c.legT > P.CROSS_TIME) { c.leg = 'turn'; c.legT = 0; c.bombRun = false; return { target: alt, speed: 0, ca: true }; }
    // in the overlap zone the hulls must already be apart in height: otherwise hold in x until they are
    const zone = Math.abs(gap) < half + 500 && sign === c.dir0;
    const w = zone && !clear ? 0 : c.dir0;
    return { target: alt, speed: clamp(w * f, -config.SHIP.REVERSE, 1), ca: false };
  }
  // 'turn': slow, come about to face her, settle
  const faces = f * (gap < 0 ? -1 : 1) > 0;
  if ((faces && !turning) || c.legT > P.TURN_TIME) { c.play = 'duel'; c.leg = ''; c.passCd = P.CD; return null; }
  const duel = plan.target; // (back to the edge, as the plan says)
  return { target: clampAlt(duel), speed: clamp(plan.speed, -0.25, 0.25), ca: !faces };
}
