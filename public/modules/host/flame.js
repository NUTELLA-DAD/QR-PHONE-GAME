// THE FLAMETHROWER (config.GUN_TYPES.flame and config.FLAME; PVP.md "Space and range": the short band). Node-safe: no DOM.
//
// A gun part with gtype 'flame' is a station like any gun - a person (or a bot) takes it, the stick aims, FIRE (held) burns - but nothing leaves the barrel: a CONE of fire stands in front of the nozzle
// while the button is held. Its numbers are config.FLAME. It eats steam from the boiler (STEAM_RATE) and fuel from its tank (the gun's ammo: a sack of coal from the bunker refills it), and heats up:
// at full heat it cuts out until it has cooled (OVERHEATED!). What the cone touches, ten times a second (TICK):
//   a hostile ship   her decks catch by flammability (fire.js ignite: wood catches, armour plate does not, the coal blazes), her hull is scorched, a gasbag in the cone gets holes,
//                    and a foe standing in it loses hearts (health.js hurt, cause 'fire')
//   the sky          bats and imps burn, planes take small shells (the ordinary shell code applies them and credits the kill)
//   your own ship    boarders on your decks burn (and set the deck under them alight), the ice crusts on your ship melt; with a hostile hull right at the nozzle the flame can LIGHT YOUR OWN DECK (BACKDRAFT)
//   const burning = stepFlame({ ship, state, gun, name, wx, wy, angle, dt, puff, W })   once a frame for every flame gun (manned or not): the button, the tank, the heat, the cone and its effects
//   flameTargets(state, ship, gun)                                                    the things a bot's flamethrower can burn, as aim.js targets (kinds 'boarder', 'rivalCrew', 'rivalBag', 'rivalDeck' ...)
//   selfRisk(ship, target)                                                            would burning this boarder light your own coal, powder or ammo?
// Everything is written against `ship.ctx` for the ship's own things and `ship.world` for the sky and the other ships (ships.js).
import { config } from '../../config.js';
import { toWorldX, toWorldY, toShipX, toShipY } from './pose.js';
import { areHostile, foeOf, hostileTo, shipOf } from './ships.js';
import { flamAt, armourOn } from './fireModel.js';
import { hurt, knockOut } from './health.js';
import { pop } from './popups.js';

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const isFlame = (gun) => !!gun && gun.type === 'flame';
// The kinds of the sky's targets (aim.js targets()) that a flamethrower burns.
export const AIR_KINDS = new Set(['bat', 'imp', 'strafer', 'fighter', 'bomber']);

// Is world point (x, y) in the cone (pad: the size of the thing at it)?
function inCone(c, x, y, pad = 0) {
  const dx = x - c.x, dy = y - c.y, d = Math.hypot(dx, dy);
  if (d > c.len + pad) return false;
  if (d < 12) return true;
  return Math.abs(angleDiff(Math.atan2(dy, dx), c.ang)) <= c.half + Math.atan2(pad, Math.max(d, 40));
}

// The cone of a flame gun in the world: from the nozzle, `len` px long (the full reach less the nozzle's own length, times how far the flame has grown).
export function coneOf(gun, wx, wy, angle) {
  const F = config.FLAME, T = config.GUN_TYPES.flame;
  return { x: wx + Math.cos(angle) * F.NOZZLE, y: wy + Math.sin(angle) * F.NOZZLE, ang: angle, half: F.HALF, len: Math.max(0, T.RANGE - F.NOZZLE) * (gun.flame || 0) };
}

const countFor = (world, who, key, n = 1) => { const M = world.match; if (M && M.on && who && who.team) M.count(who.team, key, n); };
const say = (gun, text) => { gun.empty = 0.8; gun.emptyText = text; };

export function stepFlame({ ship, state, gun, name, wx, wy, angle, dt, puff, W }) {
  const F = config.FLAME, world = ship.world;
  const who = gun.flameWho || null;
  const want = (gun.flameHold || 0) > 0 && !!who;
  gun.flameHold = Math.max(0, (gun.flameHold || 0) - dt);
  if (!want) gun.flameWho = null;
  let burning = false;
  if (want) {
    if (gun.overheat) say(gun, 'OVERHEATED!');
    else if (state.ship.press < F.MIN_PRESS) say(gun, 'NO STEAM!');
    else if (gun.ammo <= 0) say(gun, 'OUT OF FUEL - COAL!');
    else burning = true;
  }
  // the heat: it builds while burning, drains away when not; at full heat the burner cuts out until it has cooled
  gun.heat = Math.max(0, Math.min(1.1, (gun.heat || 0) + (burning ? F.HEAT_RATE : -F.COOL_RATE) * dt));
  if (gun.heat >= 1 && !gun.overheat) {
    gun.overheat = true;
    burning = false;
    puff(wx, wy - 30, '#ffffff', 10);
    pop(world, wx, wy - 90, 'burn', '#ff5a1f', 1);
    state.sfxQ.push(['clang']);
  } else if (gun.overheat && gun.heat <= F.RESUME_AT) gun.overheat = false;
  const was = gun.flame || 0;
  gun.flame = burning ? Math.min(1, was + dt / F.RAMP) : Math.max(0, was - dt / F.FADE);
  if (burning) {
    state.ship.press = Math.max(0, state.ship.press - F.STEAM_RATE * dt);
    gun.fuelAcc = (gun.fuelAcc || 0) + F.FUEL_RATE * dt;
    while (gun.fuelAcc >= 1) { gun.fuelAcc -= 1; gun.ammo = Math.max(0, gun.ammo - 1); }
    if (was <= 0) { state.sfxQ.push(['whoosh']); gun.whooshT = 0; }
    if ((gun.whooshT = (gun.whooshT || 0) - dt) <= 0) { gun.whooshT = 0.45; state.sfxQ.push(['whoosh']); }
  }
  if (!burning || gun.flame < 0.35) { gun.flameT = 0; return burning; }
  if ((gun.flameT = (gun.flameT || 0) - dt) > 0) return true;
  gun.flameT = F.TICK;
  burn({ ship, state, world, gun, name, who, cone: coneOf(gun, wx, wy, angle), dt: F.TICK, puff, W });
  return true;
}

// One tick of the cone's effects.
function burn({ ship, state, world, gun, name, who, cone, dt, puff, W }) {
  const F = config.FLAME, fs = state.fireStats;
  if (fs) fs.flameSecs = (fs.flameSecs || 0) + dt;
  countFor(world, who, 'flameSecs', dt);
  const dx = Math.cos(cone.ang), dy = Math.sin(cone.ang);
  // light in the dark and a plume of smoke at the tip
  for (const k of [0.15, 0.55, 1]) world.flashes.push({ x: cone.x + dx * cone.len * k, y: cone.y + dy * cone.len * k, ang: cone.ang, t: dt * 1.6, color: '#ffb347', size: F.GLOW * (0.55 + 0.45 * k), glow: true });
  if (Math.random() < 0.35) puff(cone.x + dx * cone.len * (0.7 + Math.random() * 0.4), cone.y + dy * cone.len * (0.7 + Math.random() * 0.4) - 20, '#6b6258', 1);

  // ---- the sky: bats, imps, planes ----
  const kill = (o, kind) => {
    world.kills += 1;
    W.credit({ owner: who && who.id });
    W.stat(who, kind === 'bat' ? 'bats' : 'kills');
    if (fs) fs.flameKills = (fs.flameKills || 0) + 1;
    puff(o.x, o.y, '#ff7b00', 8);
    pop(world, o.x, o.y - 20, kind, '#ff9a2e', 0.7);
  };
  for (const b of world.bats || []) {
    if (b.dead || b.hp <= 0 || b.delay > 0 || !inCone(cone, b.x, b.y, 26)) continue;
    if ((b.hp -= F.BAT_DPS * dt) <= 0) { b.hp = 0; kill(b, 'bat'); }
  }
  const SP = world.specials;
  if (SP) for (const b of SP.imps || []) {
    if (b.hp <= 0 || b.delay > 0 || !inCone(cone, b.x, b.y, 22)) continue;
    if ((b.hp -= F.IMP_DPS * dt) <= 0) { b.hp = 0; kill(b, 'imp'); }
  }
  gun.planeT = (gun.planeT || 0) - dt;
  if (gun.planeT <= 0) {
    gun.planeT = F.PLANE_EVERY;
    const e = world.enemy;
    const planes = [];
    if (e && e.dead <= 0 && e !== world.stuntPlane) planes.push([e, 46]);
    for (const p of world.strafers || []) if (p.hp > 0 && p !== world.stuntPlane) planes.push([p, 44]);
    for (const p of world.bombers || []) if (p.hp > 0) planes.push([p, 90]);
    for (const [o, r] of planes) {
      if (!inCone(cone, o.x, o.y, r)) continue;
      world.shells.push({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.08, mul: F.PLANE_MUL, owner: who && who.id, from: ship.id, frag: true, kind: 'flameFrag' });
      puff(o.x, o.y, '#ff7b00', 3);
    }
  }

  // ---- your own ship: boarders burn, ice melts ----
  const P = ship.layout.platforms;
  const light = (home, d, x, chance) => { // a burning creature sets the deck under him alight (flammability decides)
    if (Math.random() < chance) home.sim.fireSys.ignite(d, x + (Math.random() - 0.5) * 50, 'flame');
  };
  for (const b of [...state.boarders]) {
    if (b.fall || b.d == null || !P[b.d] || !inCone(cone, toWorldX(ship, b.x), toWorldY(ship, b.y - 40), 30)) continue;
    b.hp -= F.RAIDER_DPS * dt;
    b.hit = 0.25;
    b.windup = 0; // interrupted!
    puff(toWorldX(ship, b.x), toWorldY(ship, b.y - 50), '#ff7b00', 2);
    light(ship, b.d, b.x, F.RAIDER_IGNITE * dt);
    if (b.hp <= 0) {
      const i = state.boarders.indexOf(b);
      if (i >= 0) state.boarders.splice(i, 1);
      if (fs) fs.flameKills = (fs.flameKills || 0) + 1;
      W.stat(who, 'raiders');
      puff(toWorldX(ship, b.x), toWorldY(ship, b.y - 40), '#ff5a1f', 12);
      pop(world, toWorldX(ship, b.x), toWorldY(ship, b.y - 130), 'raider', '#ff9a2e', 1);
    }
  }
  for (const c of [...(state.icing || [])]) {
    if (!P[c.d] || !(c.gun === name || inCone(cone, toWorldX(ship, c.x), toWorldY(ship, P[c.d].y - 30), 60))) continue; // (a burner keeps its own mount clear of ice)
    c.lvl -= F.MELT_RATE * dt;
    c.prog = 0;
    puff(toWorldX(ship, c.x), toWorldY(ship, P[c.d].y - 30), '#ffffff', 1);
    if (c.lvl <= 0) { const i = state.icing.indexOf(c); if (i >= 0) state.icing.splice(i, 1); }
  }

  // ---- other ships: hostile ones (Versus rivals, the enemy gunship) and the foes aboard yours ----
  let near = false;
  const players = Object.values(world.players);
  for (const t of world.ships) {
    const own = t === ship;
    if (!own && (!areHostile(ship, t) || t.ctx.wreck)) continue;
    let limit = Infinity; // how far along the cone the first hull stops it (plus a little: through a port into the room behind)
    const decks = new Map(), bags = new Map();
    let hull = false, plated = false;
    if (!own) {
      const step = 36, n = Math.ceil(cone.len / step), spread = Math.tan(cone.half) * 0.8, px = -dy, py = dx;
      for (let k = 1; k <= n && k * step <= limit; k++) {
        const r = k * step;
        for (const lat of [-1, 0, 1]) {
          const x = cone.x + dx * r + px * lat * spread * r, y = cone.y + dy * r + py * lat * spread * r;
          const sx = toShipX(t, x), sy = toShipY(t, y);
          if (!t.sim.hitsShip(sx, sy)) continue;
          if (!hull) limit = r + F.PENETRATE;
          hull = true;
          if (r <= F.BACKDRAFT_RANGE) near = true;
          const bag = t.sim.onGasbag(sx, sy);
          if (bag >= 0) { if (!bags.has(bag)) bags.set(bag, { sx, sy }); continue; }
          const d = t.sim.roomPlatformAt(sx, sy);
          if (d !== null) {
            const key = d + ':' + Math.round(sx / 50);
            if (!decks.has(key)) decks.set(key, { d, x: sx });
            if (armourOn(t.layout, d, sx)) plated = true;
          }
        }
      }
      limit = hull ? limit : Infinity;
      if (hull) { // the hull is scorched (less on plate)
        t.sim.damageHull(F.HULL_RATE * dt * (plated && !decks.size ? config.ARMOUR.POWER_MUL : 1));
        puff(cone.x + dx * Math.min(cone.len, limit - F.PENETRATE), cone.y + dy * Math.min(cone.len, limit - F.PENETRATE) - 10, '#8a7f73', 1);
      }
      const ft = t.ctx.fireStats;
      for (const { d, x } of decks.values()) {
        if (Math.random() >= F.IGNITE_RATE * dt) continue; // (a spot that cannot burn - plate - never catches whatever the roll)
        const ig = t.sim.fireSys.igniteChance(d, x);
        if (ig <= 0) { if (ft) ft.plated++; continue; }
        if (Math.random() < Math.min(1, ig) && t.sim.fireSys.ignite(d, x + (Math.random() - 0.5) * 60, 'flame')) countFor(world, who, 'flameFires');
      }
      for (const [bag, p] of bags) {
        if (t.sim.hydrogen) t.sim.hydrogen.scorch(bag, config.GASES.HYDROGEN.FLAME_RATE * dt); // (a hydrogen bag in the cone catches: hydrogen.js)
        if (Math.random() >= F.HOLE_RATE * dt || t.ctx.gasHoles.length >= config.GAS.MAX_HOLES) continue;
        t.ctx.gasHoles.push(t.sim.gasHoleAt(p.sx, p.sy, bag));
        if (ft) ft.flameHoles = (ft.flameHoles || 0) + 1;
        countFor(world, who, 'flameHoles');
        puff(toWorldX(t, p.sx), toWorldY(t, p.sy), '#6b6258', 4);
        pop(world, toWorldX(t, p.sx), toWorldY(t, p.sy - 80), 'bigHit', '#ff7b00', 1);
      }
    }
    // the crew: foes standing in the cone lose hearts
    for (const q of players) {
      if (shipOf(world, q) !== t || !who || !foeOf(q, who) || q.fall || q.fly || q.conn != null || q.d == null || q.ko > 0 || q.enemy || !t.layout.platforms[q.d]) continue;
      if ((q.flameCd = (q.flameCd || 0) - dt) > 0) continue;
      const qx = toWorldX(t, q.x), qy = toWorldY(t, q.y - 40 - (q.jz || 0));
      if (!inCone(cone, qx, qy, F.CREW_REACH) || (!own && Math.hypot(qx - cone.x, qy - cone.y) > limit)) { q.flameCd = 0; continue; }
      const res = hurt(q, F.CREW_HEARTS, { cause: 'fire' });
      if (!res) { q.flameCd = 0.1; continue; }
      q.flameCd = F.CREW_EVERY;
      if (res === 'ko') knockOut(q, config.RAIDERS.KO_TIME);
      if (fs) fs.flameHearts = (fs.flameHearts || 0) + 1;
      countFor(world, who, 'flameHearts');
      puff(qx, qy, '#ff7b00', 6);
      light(t, q.d, q.x, F.RAIDER_IGNITE * 0.5);
    }
  }

  // ---- the risk: a hostile hull right at the nozzle blows the flame back onto your own deck ----
  if (near && Math.random() < F.BACKDRAFT_RATE * dt) {
    const st = ship.layout.stations.find((s) => s.n === name);
    if (st && ship.sim.fireSys.ignite(st.d, gun.bx + (Math.random() - 0.5) * 140, 'flame')) {
      if (fs) fs.backdraft = (fs.backdraft || 0) + 1;
      pop(world, toWorldX(ship, gun.bx), toWorldY(ship, gun.by - 90), 'BACKDRAFT!', '#ff5a1f', 1.2);
      puff(toWorldX(ship, gun.bx), toWorldY(ship, gun.by - 40), '#ff7b00', 8);
    }
  }
}

// ---- the bots ----

// Would burning this boarder (a target of flameTargets) light a bad fire on YOUR OWN ship: is he standing on coal, powder or ammo (flammability at his feet at least SELF_RISK)?
export function selfRisk(ship, target) {
  const o = target.obj;
  if (!o || target.kind !== 'boarder' || o.d == null) return false;
  return flamAt(ship.layout, o.d, o.x) >= config.FLAME.BOT.SELF_RISK;
}

// What a bot's flamethrower can burn, as aim.js targets ({ kind, obj, r, at(t) -> world point }), within a little more than its reach: boarders and foes on your own decks, bats latched on your ship,
// and, on a hostile ship, the foes standing in her decks, her gasbag, and the nearest bit of her deck.
export function flameTargets(state, ship, gun) {
  const world = ship.world, T = config.GUN_TYPES.flame, out = [];
  const gx = toWorldX(ship, gun.bx), gy = toWorldY(ship, gun.by), reach = T.RANGE + 160;
  const near = (x, y) => Math.hypot(x - gx, y - gy) < reach;
  const P = ship.layout.platforms;
  for (const b of state.boarders || []) {
    if (b.fall || b.d == null || !P[b.d]) continue;
    const x = toWorldX(ship, b.x), y = toWorldY(ship, b.y - 40);
    const tg = { kind: 'boarder', obj: b, r: 30, at: () => ({ x: toWorldX(ship, b.x), y: toWorldY(ship, b.y - 40) }) };
    if (near(x, y) && !selfRisk(ship, tg)) out.push(tg); // (a boarder standing on your own coal or powder is left to the swords)
  }
  for (const b of world.bats || []) if (b.latched && b.landed && b.hp > 0 && near(b.x, b.y)) out.push({ kind: 'bat', obj: b, r: 26, at: () => ({ x: b.x, y: b.y }) });
  for (const q of Object.values(world.players)) {
    if (q.fall || q.fly || q.conn != null || q.d == null || q.ko > 0 || q.enemy) continue;
    const home = shipOf(world, q);
    if (!home.layout.platforms[q.d] || !hostileTo(q, ship)) continue;
    const x = toWorldX(home, q.x), y = toWorldY(home, q.y - 40);
    const tg = { kind: home === ship ? 'boarder' : 'rivalCrew', obj: q, r: 30, at: () => ({ x: toWorldX(home, q.x), y: toWorldY(home, q.y - 40) }) };
    if (near(x, y) && !selfRisk(ship, tg)) out.push(tg);
  }
  for (const t of world.ships) {
    if (t === ship || !areHostile(ship, t) || t.ctx.wreck || t.ai) continue;
    const L = t.layout;
    let best = null;
    for (const pl of L.platforms) {
      if (pl.nest) continue;
      const sx = Math.max(pl.x0 + 30, Math.min(pl.x1 - 30, toShipX(t, gx))); // (the deck's nearest point to the muzzle)
      const x = toWorldX(t, sx), y = toWorldY(t, pl.y - 50), d = Math.hypot(x - gx, y - gy);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best && best.d < reach) out.push({ kind: 'rivalDeck', obj: t, r: 40, at: () => ({ x: best.x, y: best.y }) });
    const mx = toShipX(t, gx), my = toShipY(t, gy); // (the muzzle in her coordinates: the nearest bit of each gasbag is where the line from its middle to the muzzle leaves the envelope)
    for (const b of L.gasbags) {
      const vx = mx - b.cx, vy = my - b.cy, k = 1 / Math.sqrt((vx / b.rx) ** 2 + (vy / b.ry) ** 2 || 1e-9), f = Math.min(1, k) * 0.92;
      const x = toWorldX(t, b.cx + vx * f), y = toWorldY(t, b.cy + vy * f);
      if (Math.hypot(x - gx, y - gy) < reach) out.push({ kind: 'rivalBag', obj: t, r: 60, at: () => ({ x: toWorldX(t, b.cx + vx * f), y: toWorldY(t, b.cy + vy * f) }) });
    }
  }
  return out;
}
