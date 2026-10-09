// THE CARGO DROP HATCH (config.HATCH; the dropHatch part of shipBuild.js: two trapdoor leaves in a deck, 1-3 columns wide, and a lever beside them).
//   state.hatches   one { n, name, i, d, x0, x1, lx, want (the lever), warn (seconds of klaxon left before the doors give way), door (0 shut .. 1 wide), gap (is the hole open), crewOn, handle } per hatch of the layout
//   state.hatchStats  { opened, fell, loads, tipped, dropped, dumped, bombs }: botsim and the gate report it
// The lever (Action beside it: "OPEN THE HATCH" / "CLOSE THE HATCH") starts WARN_TIME of klaxon and hazard lamps on the TV (and "CLEAR THE HATCH!" for whoever stands on it), then the leaves swing open. While the
// hole is open (door >= GAP_AT) it is a GAP in its deck, published to the ship's nav (nav.setGaps): nobody walks across it (routes go round by a ladder, a walker is held at its edge), no landing surface
// covers it (airborne.js, cargo.js stepThrown, simulation.js rivalDecks), and what is over it falls:
//   crew            into free flight (airborne.js startFlight), with a parachute option (Action) - a bot's opens at once - to land on a deck below, another ship's deck (a boarder!) or go overboard
//   loads           the sacks and crates lying on the deck become world objects (cargo.js `thrown`) that land on any ship below or fall away; what leaves the ship is no longer her weight (GOING DOWN!)
//   raiders         boarders standing on it are tipped out: they fall, a deck below catches them hurt, the sky takes the rest
//   a carried load  Action beside an open hatch lets the sandbag, crate or coal sack you hold fall through it
//   the coal bunker GOING DOWN! only: a bunker beside an opening hatch spills its stock down the chute, as holding Action at the bunker does
// A ship with no hatch part is untouched: nothing here runs for her and draws no random number.
import { config } from '../../config.js';
import { toWorldX, toWorldY } from './pose.js';
import { pop } from './popups.js';
import { shipOf } from './ships.js';
import { cargoItem } from './cargo.js';

const H = () => config.HATCH;

export function createHatches({ state, ship, air, cargo, goingDown, puff, phoneFx, stat }) {
  const L = ship.layout;
  const nav = ship.nav;
  const world = ship.world;
  const P = L.platforms;
  state.hatches = [];
  state.hatchStats = { opened: 0, fell: 0, loads: 0, tipped: 0, dropped: 0, dumped: 0, bombs: 0 };
  let version = -1;
  const shipPop = (x, y, text, color, size = 1) => pop(state, toWorldX(ship, x), toWorldY(ship, y), text, color, size);
  const shipPuff = (x, y, color, n) => puff(toWorldX(ship, x), toWorldY(ship, y), color, n);

  // Follow the layout (a part broke off, a new build was fitted): keep the state of a hatch that is still there.
  const sync = () => {
    const lay = L.hatches || [];
    if (version === L.version && state.hatches.length === lay.length) return;
    version = L.version;
    const old = new Map(state.hatches.map((h) => [h.n, h]));
    state.hatches = lay.map((s, i) => {
      const o = old.get(s.n);
      return { n: s.n, name: s.n, i, d: s.d, x0: s.x0, x1: s.x1, lx: s.lx, want: o ? o.want : false, warn: o ? o.warn : 0, door: o ? o.door : 0, gap: o ? o.gap : false, crewOn: false, handle: o ? o.handle : 0, warned: false, openSecs: o ? o.openSecs : 0 };
    });
  };
  sync();
  L.onChange(sync); // (a new build was fitted, a part broke off: the hatches follow at once)

  const mine =(p) => world.ships.length < 2 || shipOf(world, p) === ship; // (a crewman of this ship; another ship's crew have decks of their own)
  // Standing on a deck (not climbing, flying, falling, at the wheel of a stolen plane, swinging on a rope or in mid-hop) and so over whatever is under his feet.
  const standing = (p) => p.d != null && !p.fly && !p.fall && p.conn == null && !p.hj && !p.swing && !p.onGunship && !(p.jz > 6) && P[p.d];
  const over = (h, x, pad = 0) => x > h.x0 - pad && x < h.x1 + pad;
  const crewOver = (h) => Object.values(state.players).filter((p) => mine(p) && standing(p) && p.d === h.d && over(h, p.x));

  // ---- the lever ----
  // What Action does for a player beside a lever (or null). `here(o, r)`: is o on his deck within r px (shipSim.js).
  const leverAction = (player, here) => {
    const lay = L.hatches;
    if (!lay || !lay.length) return null;
    sync();
    const i = lay.findIndex((s) => here({ d: s.d, x: s.lx }, H().LEVER_REACH));
    const h = i < 0 ? null : state.hatches[i];
    return h ? { type: 'hatch', obj: h, label: h.want ? 'CLOSE THE HATCH' : 'OPEN THE HATCH' } : null;
  };
  // Pull the lever: the klaxon sounds first, then the doors give way; pulled again it shuts them (or cancels the opening).
  const toggle = (h, player) => {
    h.want = !h.want;
    if (h.want) {
      h.warn = H().WARN_TIME;
      h.warned = false;
      state.sfxQ.push(['alarm']);
      shipPop(h.lx, P[h.d].y - 120, 'HATCH OPENING!', '#f2b23a', 0.9);
    } else {
      h.warn = 0;
      shipPop(h.lx, P[h.d].y - 120, 'HATCH SHUT', '#c9c9c9', 0.8);
    }
    stat(player, 'hatch');
    phoneFx(player, h.want ? 'Klaxon! The hatch opens in a moment' : 'Hatch closing', [30]);
  };

  // ---- a carried load through an open hatch ----
  const dropAction = (p) => {
    const kind = p.carry;
    if (!kind || !cargoItem(kind) || p.d == null || !state.hatches.length) return null;
    const h = state.hatches.find((o) => o.gap && o.d === p.d && over(o, p.x, H().DROP_REACH));
    return h ? { type: 'hatchdrop', obj: h, label: `Drop the ${cargoItem(kind).label.toLowerCase()} down the hatch!` } : null;
  };
  const drop = (p, h) => {
    const kind = p.carry;
    if (!cargoItem(kind) || !h || !h.gap) return false;
    const o = cargo.worldAt((h.x0 + h.x1) / 2, P[h.d].y + 14);
    cargo.spawn(kind, o.x, o.y, ship.pose.vx, ship.pose.vy + H().LOAD_VY, { owner: p.id });
    p.carry = null;
    state.hatchStats.dropped++;
    stat(p, 'thrown');
    phoneFx(p, `The ${cargoItem(kind).label.toLowerCase()} falls away...`, [30]);
    return true;
  };

  // ---- what falls ----
  const dropCrew = (p, h) => {
    p.lock = null;
    p.fire = false;
    p.y = P[h.d].y + 3; // (just under the floor so he does not land straight back on it)
    air.startFlight(p, (p.vx || 0) * H().FALL_VX, H().FALL_VY);
    p.chuteOk = true; // (Action opens the parachute, shipSim.js useFor)
    if (p.bot) { p.chute = 0.001; p.chuteOpen = false; } // (a bot's canopy opens by itself)
    state.hatchStats.fell++;
    shipPuff(p.x, p.y, '#d9cbb0', 4);
    phoneFx(p, 'The floor gave way! Press ACTION for the parachute', [80, 40, 80]);
    return true;
  };
  const dropLoad = (ld, h) => {
    const list = state.loads, i = list.indexOf(ld);
    if (i >= 0) list.splice(i, 1);
    const o = cargo.worldAt(ld.x, P[h.d].y + 10);
    cargo.spawn(ld.kind, o.x, o.y, ship.pose.vx + (Math.random() - 0.5) * 30, ship.pose.vy + H().LOAD_VY, { owner: ld.owner, hatch: true });
    state.hatchStats.loads++;
    if (goingDown) goingDown.noteDumped(ld.w || 0);
  };
  const tipBoarder = (b, h) => {
    b.fall = true;
    b.windup = 0;
    b.y = P[h.d].y + 3;
    b.tipped = { vy: H().TIP_VY, y0: P[h.d].y }; // (y0: the height of the deck he left, by number it could go stale if the layout changes)
    state.hatchStats.tipped++;
    shipPuff(b.x, b.y, '#d9cbb0', 4);
    shipPop(b.x, b.y - 30, 'OUT YOU GO!', '#e8c25a', 0.8);
  };
  const stepTipped = (b, dt) => {
    const prev = b.y;
    b.tipped.vy += H().TIP_GRAV * dt;
    b.y += b.tipped.vy * dt;
    const d = nav.platformBelow(b.x, prev);
    if (d != null && b.y >= P[d].y) {
      b.y = P[d].y;
      b.d = d;
      b.fall = false;
      b.tipped = null;
      b.cd = 1;
      b.hp -= H().TIP_HURT;
      shipPuff(b.x, b.y - 4, '#d9cbb0', 5);
      if (b.hp <= 0) state.boarders.splice(state.boarders.indexOf(b), 1);
    } else if (b.y > b.tipped.y0 + H().BAD_FALL) state.boarders.splice(state.boarders.indexOf(b), 1); // (gone over the side)
  };

  const update = (dt) => {
    sync();
    const hs = state.hatches;
    if (!hs.length) { if (nav.gaps.length) nav.setGaps([]); return; }
    const O = H();
    for (const h of hs) {
      const was = h.gap;
      if (h.want) {
        if (h.warn > 0) h.warn = Math.max(0, h.warn - dt);
        else h.door = Math.min(1, h.door + dt / O.OPEN_TIME);
      } else {
        h.warn = 0;
        h.door = Math.max(0, h.door - dt / O.CLOSE_TIME);
      }
      h.gap = h.door >= O.GAP_AT;
      h.handle += ((h.want ? 1 : 0) - h.handle) * Math.min(1, dt * 10);
      h.openSecs = h.want && h.door >= 1 ? (h.openSecs || 0) + dt : 0; // (how long it has stood wide open: the bots shut it after a while)
      if (h.gap && !was) {
        state.hatchStats.opened++;
        state.sfxQ.push(['impact']);
        shipPuff((h.x0 + h.x1) / 2, P[h.d].y, '#d9cbb0', 8);
      }
    }
    nav.setGaps(hs.filter((h) => h.gap || h.want).map((h) => ({ d: h.d, x0: h.x0, x1: h.x1, soft: !h.gap }))); // (pulling the lever keeps walkers off at once; the floor is really gone when the doors are open)
    for (const h of hs) {
      const crew = h.warn > 0 || h.gap ? crewOver(h) : [];
      h.crewOn = h.warn > 0 && crew.length > 0;
      if (h.crewOn && !h.warned) { // the TV and the phones of whoever stands on it
        h.warned = true;
        state.ev.warn = 2.2;
        state.ev.warnText = 'CLEAR THE HATCH!';
        for (const p of crew) phoneFx(p, 'GET OFF THE HATCH!', [200, 80, 200]);
      }
      if (!h.gap) continue;
      for (const p of crew) dropCrew(p, h);
      for (const ld of (state.loads || []).slice()) if (ld.d === h.d && over(h, ld.x)) dropLoad(ld, h);
      for (const b of state.boarders) if (!b.fall && b.conn == null && b.d === h.d && over(h, b.x)) tipBoarder(b, h);
      // (an enemy crewman of Versus who stands on it is a player: crewOver caught him above)
      for (const bomb of (state.bombs || []).slice()) {
        if (bomb.d !== h.d || !over(h, bomb.x)) continue;
        state.bombs.splice(state.bombs.indexOf(bomb), 1); // (a sapper's bomb falls out of her: defused the hard way)
        const o = cargo.worldAt(bomb.x, P[h.d].y + 10);
        cargo.spawn('crate', o.x, o.y, ship.pose.vx, ship.pose.vy + H().LOAD_VY, { ghost: true });
        state.hatchStats.bombs++;
        shipPop(bomb.x, P[h.d].y - 80, 'BOMB AWAY!', '#ffd23f', 0.9);
      }
      const g = goingDown && state.goingDown;
      if (g && !g.coalGone && g.coalJob) { // GOING DOWN!: the bunker beside the hole spills down it
        if (L.all('coal').some((co) => co.d === h.d && over(h, co.x, O.COAL_REACH))) { goingDown.perform('dumpcoal', g.coalJob, null); state.hatchStats.dumped++; }
      }
    }
    for (const b of state.boarders.slice()) if (b.tipped) stepTipped(b, dt);
  };

  // The hatches whose hole is open over a point of the ship (ship coordinates): d, x.
  const gapAt = (d, x) => state.hatches.find((h) => h.gap && h.d === d && over(h, x)) || null;
  // Is there anything of THIS ship under the hatch (a deck below its span that a load would land on)?
  const shipBelow = (h) => P.some((q, d) => q.y > P[h.d].y + 2 && q.x1 > h.x0 + 4 && q.x0 < h.x1 - 4);

  // A fresh start (a rebuilt ship, a new mission): every hatch shut.
  const reset = () => {
    for (const h of state.hatches) Object.assign(h, { want: false, warn: 0, door: 0, gap: false, crewOn: false, handle: 0, openSecs: 0, warned: false });
    if (nav.gaps.length) nav.setGaps([]);
    for (const b of state.boarders) delete b.tipped;
  };

  return { update, sync, reset, leverAction, toggle, dropAction, drop, gapAt, shipBelow, crewOver, over };
}
