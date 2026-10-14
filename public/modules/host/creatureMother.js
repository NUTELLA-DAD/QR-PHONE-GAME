// THE MYCELIAL MOTHER'S FIGHT (BOSSES.md 2.5, C.6e): a giant spore-moth clinging to the roof of the Fungal Depths' dark cavern. creatures/mother.js is her body, creatureSystem.js the world around her (damage, targets,
// death), creatureGrip.js the tendril grabs (the Kraken's grab with config.CREATURES.MOTHER.GRAB merged over it, pulling UP), creatureBoard.js the boarding of her cap. The numbers are config.CREATURES.MOTHER.
//   THE DARK            the cave is pitch dark: her cap, eyes and heart cannot be aimed at or hit until a searchlight beam holds them (motherSeen). A tendril is seen while it grows, holds, burns, or is inside the ship's own glow.
//   MODES (cr.mother.mode)  'asleep' (cr.mode 'surfacing': untouchable until the ship comes within WAKE_DX) -> 'stirring' (ARRIVE s) -> 'awake' (cr.mode 'idle': the attacks) | 'dying'
//   ACTS (cr.mother.act)    GRAB (tendrils grow toward the ship: creatureGrip.js startGrip), SPORES (the cap puffs up, a cloud falls on the ship and blocks the beams), BEAT (the wings spread, then shove the ship sideways)
//   BURNING             flame does MUL x to a tendril and sets it alight (part.burn[segment] seconds): the fire runs along it, jumps to the next tendril, hurts it, and a burning tendril lets go and glows
//   stepMother(state, cr, ship, dt)       once a step (creatureSystem.js update)
//   motherSeen / motherArmour / motherHit / motherWays / motherDied     the dark, what a blow does against her, what it triggers, the ways she ends, her death
//   motherFlame(state, cr, inCone, dt, who) flame meeting a spore cloud;  sporeBlocks(state, x0, y0, x1, y1)     does a spore cloud stand between a lamp and what it lights? (searchlight.js)
import { config } from '../../config.js';
import { MOTHER_PHASES } from './creatures/mother.js';
import { warnCrew } from './creatureBreath.js';
import { tickGrips, startGrip, gripCap, releaseGrip } from './creatureGrip.js';
import { toWorldX, toWorldY, toShipX, toShipY, driveGain } from './pose.js';
import { applyForce } from './forces.js';
import { mainShip } from './ships.js';
import { pop } from './popups.js';

const MD = () => config.CREATURES.MOTHER;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
const diffOf = (state) => state.difficulty || 'normal';
const pauseOf = (state) => (config.CREATURES.GRIP.EVERY_BY_DIFF[diffOf(state)] ?? 1);
const rand = (cr, a, b) => a + cr.hooks.rng() * (b - a);
const banner = (state, text, secs = 2.6) => { state.say('setpiece', text, null, secs); };
const canAttack = (state) => state.phase === 'flying' && !state.ship.down && !state.goingDown;
const shipMid = (ship) => ({ x: toWorldX(ship, ship.layout.refPoint.x), y: toWorldY(ship, ship.layout.refPoint.y) });
const partOf = (cr, id) => cr.parts.find((p) => p.id === id);
const segMid = (s, u = 0.5) => ({ x: s.x + Math.cos(s.ang) * s.len * u, y: s.y + Math.sin(s.ang) * s.len * u });
const tendrils = (cr) => cr.parts.filter((p) => p.kind === 'tentacle');
const tendrilsLost = (cr) => tendrils(cr).filter((p) => p.severed || p.dead).length;
export const tendrilsGone = (cr) => tendrilsLost(cr) >= tendrils(cr).length;
const liveGrips = (cr) => cr.grips.filter((g) => g.mode !== 'recoil').length;
const everyone = () => true;
export const burning = (p) => !!p.burn && p.burn.some((v) => v > 0);

// ---- the dark ----
export const isDark = (state) => (state.darkNow || 0) > config.CREATURES.DARK_AT;
// Is the world point inside the ship's own glow (the ellipse round her that the dark never covers: config.SEARCHLIGHT.DARK.SHIP_GLOW_*)?
function inGlow(state, x, y) {
  const S = config.SEARCHLIGHT.DARK, ship = mainShip(state), k = MD().GRAB.SEEN_R, sx = toShipX(ship, x), sy = toShipY(ship, y);
  return ((sx - S.SHIP_GLOW_CX) / S.SHIP_GLOW_RX) ** 2 + ((sy - S.SHIP_GLOW_CY) / S.SHIP_GLOW_RY) ** 2 < k * k;
}
// Can a shell, a flame or a bomb find this bit of her? Her cap, eyes and heart only while a beam holds them; a tendril also while it reaches, holds, burns or stands in the ship's glow.
export function motherSeen(state, cr, p, seg = 0) {
  if (!cr || cr.kind !== 'mother' || !isDark(state)) return true;
  if (p.tgt && p.tgt.lit > 0) return true;
  if (p.kind !== 'tentacle') return false;
  if (p.ctl && (p.ctl.mode !== 'idle' || p.ctl.cmd)) return true;
  if (burning(p)) return true;
  const s = p.segs[clamp(seg | 0, 0, p.segs.length - 1)];
  return !!s && inGlow(state, segMid(s).x, segMid(s).y);
}

// ---- setting it up (creatureSystem.js spawnMother) ----
export function setupMother(state, cr, ship) {
  Object.assign(cr.mother, {
    mode: 'asleep', t: 0, age: 0, nextT: 0, act: null, clouds: [], gust: null, ring: null, puff: 0, lamp: false, side: ship.pose.f || 1,
    tDmg: 0, tFire: 0, mortared: 0, burnSeen: false, cloudId: 0, dive: 0,
  });
  Object.assign(cr.stats, { lit: 0, spores: 0, clouds: 0, cloudsBurnt: 0, beats: 0, beatPush: 0, beatHits: 0, ignited: 0, jumps: 0, burnt: 0, mortar: 0, eyesOut: 0, grabs: 0, blocked: 0 });
  cr.fed = 0;
  cr.mouthWin = null;
  cr.mode = 'surfacing';
}

// ---- the crew's lamp finds her ----
function lampWatch(state, cr) {
  const mt = cr.mother;
  if (mt.lamp || cr.mode !== 'idle') return;
  const hit = cr.parts.find((p) => p.tgt && p.tgt.lit > 0 && p.kind !== 'tentacle');
  if (!hit) return;
  mt.lamp = true;
  cr.stats.lit += 1;
  banner(state, 'THE LAMP HAS HER! HER EYES - SHELL THEM WHILE THE BEAM HOLDS!', 3);
  state.sfxQ.push(['roar']);
  const who = Object.values(state.players).find((q) => q.lock && state.searchlights && state.searchlights.some((l) => l.n === q.lock && l.op === q.id));
  if (state.moment) state.moment('creature-light', { who: who ? [who] : [], where: null, data: { creature: cr.name } });
}

// ---- burning ----
// Set a tendril alight at segment `seg`: the fire runs along it and burns TIME s a segment. A burning tendril lets go of the ship and flinches back.
export function igniteTendril(state, cr, p, seg, who) {
  const B = MD().BURN;
  if (p.dead || !p.segs.length) return false;
  if (!p.burn || p.burn.length !== p.segs.length) p.burn = Array.from({ length: p.segs.length }, (_, i) => (p.burn && p.burn[i]) || 0);
  seg = clamp(seg | 0, 0, p.segs.length - 1);
  const was = burning(p);
  p.burn[seg] = B.TIME;
  if (who) p.burnWho = who;
  if (was) return true;
  cr.stats.ignited += 1;
  p.burnBy = cr.age;
  p.gripCd = Math.max(p.gripCd || 0, B.FLINCH);
  for (const g of cr.grips) if (g.limb === p) releaseGrip(cr, g, 'flame');
  const m = segMid(p.segs[seg]);
  cr.hooks.puff(m.x, m.y, '#ff9a2e', 10);
  pop(state, m.x, m.y - 160, 'ABLAZE!', '#ff9a2e', 1.4);
  state.sfxQ.push(['whoosh']);
  return true;
}
function stepBurn(state, cr, dt) {
  const B = MD().BURN;
  for (const p of tendrils(cr)) {
    if (!p.burn) continue;
    if (p.dead) { p.burn = null; continue; }
    if (p.burn.length !== p.segs.length) p.burn.length = p.segs.length;
    if (!burning(p)) continue;
    const n = p.segs.length;
    p.bt = (p.bt || 0) + dt;
    const stepT = 1 / B.SPREAD;
    while (p.bt >= stepT) { // the fire walks to the next segments: a segment that has never burned catches from a neighbour (one that burned out stays out)
      p.bt -= stepT;
      const on = p.burn.map((v) => v > 0);
      for (let i = 0; i < n; i++) if (on[i]) for (const j of [i - 1, i + 1]) if (j >= 0 && j < n && p.burn[j] === 0) p.burn[j] = B.TIME * 0.9;
    }
    let b = 0, root = -1;
    for (let i = 0; i < n; i++) {
      if (p.burn[i] > 0) { b++; if (root < 0) root = i; p.burn[i] -= dt; if (p.burn[i] <= 0) p.burn[i] = -1; }
    }
    p.burnT = (p.burnT || 0) + dt;
    if (Math.floor(p.burnT * 4) !== Math.floor((p.burnT - dt) * 4)) { // a glow in the dark, and a spark, a few times a second
      const m = segMid(p.segs[root < 0 ? 0 : root]);
      state.flashes.push({ x: m.x, y: m.y, ang: 0, t: 0.3, color: '#ff9a2e', size: 2.4, glow: true });
      cr.hooks.puff(m.x + (cr.hooks.rng() - 0.5) * 120, m.y, '#ff7a14', 2);
    }
    if (root >= 0) {
      const wasHp = p.hp;
      cr.hooks.hurt({ part: p, seg: Math.max(1, root) }, B.DPS * (0.4 + (0.6 * b) / n) * dt, { who: p.burnWho, src: 'burn' });
      if (p.hp <= 0 && wasHp > 0) {
        cr.stats.burnt += 1;
        if (state.moment && !cr.mother.burnSeen) { cr.mother.burnSeen = true; state.moment('creature-burn', { who: p.burnWho ? [p.burnWho] : [], where: null, data: { creature: cr.name } }); }
        continue;
      }
    }
    if (p.burn[0] > 0 || p.burn[1] > 0) { // from the root the fire JUMPS to a neighbour
      p.jt = (p.jt ?? B.JUMP_EVERY) - dt;
      if (p.jt <= 0) {
        p.jt = B.JUMP_EVERY;
        const r0 = { x: cr.x + p.at[0] * cr.f, y: cr.y + p.at[1] };
        for (const q of tendrils(cr)) {
          if (q === p || q.dead || burning(q) || !q.segs.length) continue;
          const r1 = { x: cr.x + q.at[0] * cr.f, y: cr.y + q.at[1] };
          if (Math.hypot(r1.x - r0.x, r1.y - r0.y) > B.JUMP_R || cr.hooks.rng() > B.JUMP_P) continue;
          if (igniteTendril(state, cr, q, 0, p.burnWho)) { cr.stats.jumps += 1; pop(state, r1.x, r1.y + 300, 'IT SPREADS!', '#ff9a2e', 1.2); }
        }
      }
    }
  }
}

// ---- damage in ----
// A blow of `dmg` on segment `seg` of part p; returns the damage that counts. Flame does MUL x to a tendril; the cap is spongy to a plain shell; a lit eye takes a little more.
export function motherArmour(state, cr, p, seg, dmg, src) {
  const M = MD();
  if (p.kind === 'tentacle' && src === 'flame') return dmg * M.BURN.MUL;
  if (p.kind === 'mantle' && src === 'shell') return dmg * M.CAP.SHELL_MUL;
  if (p.kind === 'eye' && p.tgt && p.tgt.lit > 0) return dmg * M.EYES.LIT_MUL;
  return dmg;
}
// What a blow sets off, after it landed: a tendril in flames, a dead eye, a mortar shell on the cap, a tendril cut off.
export function motherHit(state, cr, p, dmg, src, opts = {}, seg = 0) {
  const M = MD(), mt = cr.mother;
  if (p.kind === 'tentacle') {
    mt.tDmg += dmg;
    if (src === 'flame' || src === 'burn') mt.tFire += dmg;
    if (src === 'flame' && !p.dead) igniteTendril(state, cr, p, seg, opts.who);
    if (p.severed) p.gripCd = 1e9; // (a stump cannot reach her)
  } else if (p.kind === 'eye' && p.hp <= 0 && !p.dead) {
    p.dead = true;
    p.blindT = 1e9;
    cr.stats.eyesOut += 1;
    const m = segMid(p.segs[0]);
    cr.hooks.puff(m.x, m.y, '#e8f8c8', 14);
    pop(state, m.x, m.y - 200, 'EYE OUT!', '#ffd23f', 1.8);
    state.sfxQ.push(['roar']);
    if (cr.stats.eyesOut < 2) banner(state, 'ONE EYE OUT! SHE GRABS SLOWER NOW!', 2.4);
  } else if (p.kind === 'mantle' && src === 'mortar' && !cr.dying) {
    mt.mortared += 1;
    cr.stats.mortar = mt.mortared;
    const m = segMid(p.segs[0]);
    cr.hooks.puff(m.x, m.y + 700, '#b0f06e', 14);
    pop(state, m.x, m.y + 900, 'MORTAR HIT! ' + Math.min(M.MORTAR.HITS, mt.mortared) + '/' + M.MORTAR.HITS, '#ff9a2e', 1.8);
    if (mt.mortared < M.MORTAR.HITS) banner(state, 'MORTAR HIT ON HER CAP! ' + mt.mortared + '/' + M.MORTAR.HITS, 2);
    if (state.moment && mt.mortared === 1) state.moment('creature-cap', { who: opts.who ? [opts.who] : [], where: null, data: { creature: cr.name } });
  }
}
// The ways it ends (creatureSystem.js hurtCreature): every tendril gone ('burn' when fire did half of the work on them, else 'cut'), both eyes out, enough mortar hits on the cap, the spore heart struck from her cap, the pool.
export function motherWays(cr, p, src) {
  const ways = [], mt = cr.mother, M = MD(), f = config.CREATURES.FORCE_WIN;
  if (tendrilsGone(cr)) ways.push(f === 'burn' || f === 'cut' ? f : mt.tDmg > 0 && mt.tFire / mt.tDmg >= 0.5 ? 'burn' : 'cut');
  if (cr.parts.filter((q) => q.kind === 'eye').every((q) => q.hp <= 0 || q.dead)) ways.push('eyes');
  if (mt.mortared >= M.MORTAR.HITS) ways.push('mortar');
  if (p.kind === 'heart' && src === 'sword' && (p.hp <= 0 || cr.hp <= 0)) ways.push('board');
  if (cr.hp <= 0) ways.push('hp');
  return ways;
}
export function motherDied(state, cr) {
  const mt = cr.mother;
  mt.mode = 'dying';
  mt.act = null;
  mt.gust = null;
  mt.ring = null;
  for (const c of mt.clouds) if (c.mode !== 'fade') { c.mode = 'fade'; c.left = MD().SPORES.FADE; }
}

// ---- the spore clouds ----
const inCloud = (c, x, y, k = 1) => ((x - c.x) / (c.rx * c.grow * k)) ** 2 + ((y - c.y) / (c.ry * c.grow * k)) ** 2 < 1;
// Does a cloud stand between (x0, y0) and (x1, y1)? (searchlight.js: a lamp's beam into a cloud lights nothing past it, and nothing inside it)
export function sporeBlocks(state, x0, y0, x1, y1) {
  const cr = state.creature;
  if (!cr || cr.kind !== 'mother' || !cr.mother.clouds.length) return false;
  for (const c of cr.mother.clouds) {
    if (c.mode === 'fade' && c.left < 0.4) continue;
    const k = c.rx / c.ry, sx = (x1 - x0), sy = (y1 - y0) * k, len2 = sx * sx + sy * sy, px = c.x - x0, py = (c.y - y0) * k;
    const t = len2 > 1e-6 ? clamp((px * sx + py * sy) / len2, 0, 1) : 0;
    if (Math.hypot(px - sx * t, py - sy * t) < c.rx * c.grow * 0.8) return true;
  }
  return false;
}
// Flame in a cloud burns it off at once (a flash) and lights the decks under it: the price of seeing again. (flame.js -> creatureSystem.js creatureBurn)
export function motherFlame(state, cr, inCone, dt, who) {
  const mt = cr.mother, S = MD().SPORES;
  for (const c of mt.clouds) {
    if (c.mode === 'fade' || !inCone(c.x, c.y, c.rx * c.grow * 0.6)) continue;
    c.mode = 'fade';
    c.left = 0.5;
    c.flash = true;
    cr.stats.cloudsBurnt += 1;
    state.sfxQ.push(['whoosh']);
    state.flashes.push({ x: c.x, y: c.y, ang: 0, t: 0.5, color: '#ffd23f', size: 6, glow: true });
    cr.hooks.puff(c.x, c.y, '#ffb347', 18);
    pop(state, c.x, c.y - c.ry * 0.5, 'SPORES BURN OFF!', '#ffb347', 1.6);
    const ship = mainShip(state), sim = ship.sim;
    if (sim && sim.fireSys) {
      const P = ship.layout.platforms;
      const decks = [];
      P.forEach((pl, d) => { const wy = toWorldY(ship, pl.y - 40); if (Math.abs(wy - c.y) < c.ry) decks.push(d); });
      for (let k = 0; k < S.IGNITE && decks.length; k++) {
        const d = decks[Math.floor(cr.hooks.rng() * decks.length)], pl = P[d];
        const wx = c.x + (cr.hooks.rng() - 0.5) * c.rx, sx = clamp(toShipX(ship, wx), pl.x0 + 30, pl.x1 - 30);
        sim.fireSys.ignite(d, sx, 'flame'); // (fire.js: the crew-size cap and "nothing new while she is falling" apply)
      }
    }
    void who;
  }
  void dt;
}
function stepClouds(state, cr, ship, dt) {
  const mt = cr.mother, S = MD().SPORES, P = ship.layout.platforms;
  for (const c of mt.clouds) {
    c.t += dt;
    if (c.mode === 'fall') {
      const u = smooth(c.t / S.FALL);
      c.x = c.x0 + (c.tx - c.x0) * u;
      c.y = c.y0 + (c.ty - c.y0) * u;
      c.grow = 0.35 + 0.65 * u;
      if (c.t >= S.FALL) { c.mode = 'linger'; c.t = 0; c.grow = 1; }
    } else if (c.mode === 'linger') {
      c.left -= dt;
      if (c.left <= 0) { c.mode = 'fade'; c.left = S.FADE; }
    } else c.left -= dt;
    if (c.mode === 'fade') c.grow = Math.max(0.2, c.grow);
    if (c.mode !== 'fade' || c.left > 0.4) {
      state.flashes.push({ x: c.x, y: c.y, ang: 0, t: dt * 1.6, color: '#c8ff8a', size: 3.2 * c.grow, glow: true }); // (the cloud glows faintly: it can be seen in the dark)
      if (c.mode !== 'fall' || c.grow > 0.6) { // the crew inside are slowed (the Fungal Depths' own SPORES.SLOW: p.sporeT) and the engines clog
        for (const p of Object.values(state.players)) {
          if (p.d == null || p.fly || p.fall || P[p.d] == null || (p.ship != null && p.ship !== ship.id)) continue;
          if (!inCloud(c, toWorldX(ship, p.x), toWorldY(ship, P[p.d].y - 50))) continue;
          if (!(p.sporeT > 0) && !p.bot && cr.hooks.phoneFx && (p.sporeFx || 0) <= 0) { p.sporeFx = 5; cr.hooks.phoneFx(p, 'SPORES! (cough) - the lamps are blind in here!', [40, 60, 40]); }
          p.sporeT = 0.6;
        }
        for (const e of state.clogs || []) if (P[e.d] && inCloud(c, toWorldX(ship, e.x), toWorldY(ship, P[e.d].y + 20), 1.1)) e.lvl = Math.min(1, e.lvl + S.CLOG * dt);
      }
    }
  }
  mt.clouds = mt.clouds.filter((c) => c.mode !== 'fade' || c.left > 0);
}

// ---- the phases ----
function enterPhase(state, cr, ph) {
  const M = MD(), A = M.ATTACK, d = MOTHER_PHASES[ph], h = cr.hooks;
  cr.phase = ph;
  cr.ai.breather = A.BREATHER;
  cr.stats.phaseAt = cr.stats.phaseAt || {};
  cr.stats.phaseAt[ph] = cr.age;
  if (ph === 3) { const heart = partOf(cr, 'heart'); if (heart) heart.hidden = false; }
  if (d.banner) {
    banner(state, d.banner, A.BANNER);
    for (const p of Object.values(state.players)) if (!p.bot && h.phoneFx) h.phoneFx(p, d.banner, [150, 60, 150, 60, 250]);
  }
  state.sfxQ.push(['roar']);
  state.ship.shake = Math.max(state.ship.shake || 0, config.CREATURES.PHASE.SHAKE);
  pop(state, cr.x, cr.y + 1500, d.name, '#b0f06e', 2.2);
  h.puff(cr.x, cr.y + 1200, '#b0f06e', 16);
}
function checkPhase(state, cr) {
  const P = MD().PHASE, frac = cr.hp / cr.maxHp, lost = tendrilsLost(cr);
  let want = 1;
  if (frac < P.TWO_HP || lost >= P.TWO_LOST) want = 2;
  if (frac < P.THREE_HP || lost >= P.THREE_LOST) want = 3;
  if (want > cr.phase) enterPhase(state, cr, want);
}

// ---- the main step ----
export function stepMother(state, cr, ship, dt) {
  const M = MD(), mt = cr.mother, mid = shipMid(ship);
  mt.age += dt;
  mt.t += dt;
  if (cr.ai.breather > 0) cr.ai.breather -= dt;
  if (cr.dying) {
    tickGrips(state, cr, dt);
    stepClouds(state, cr, ship, dt);
    return;
  }
  if (mt.mode === 'asleep') {
    cr.mode = 'surfacing';
    if (state.phase !== 'flying' || state.ship.down || Math.abs(mid.x - cr.x) > M.WAKE_DX) return;
    mt.mode = 'stirring';
    mt.t = 0;
    banner(state, 'SOMETHING HUGE STIRS IN THE DARK ABOVE! MAN THE NEST LAMP - LIGHT THE ROOF!', 4.5);
    state.sfxQ.push(['roar']);
    state.ship.shake = Math.max(state.ship.shake || 0, 0.8);
    for (const p of Object.values(state.players)) if (!p.bot && cr.hooks.phoneFx) cr.hooks.phoneFx(p, 'SOMETHING HUGE WAKES ABOVE US! Searchlight crew: light up the roof!', [150, 60, 150, 60, 250]);
    return;
  }
  if (mt.mode === 'stirring') {
    cr.mode = 'surfacing';
    if (mt.t >= M.ARRIVE) { mt.mode = 'awake'; mt.t = 0; cr.mode = 'idle'; mt.nextT = M.FIRST; state.sfxQ.push(['roar']); }
    return;
  }
  checkPhase(state, cr);
  tickGrips(state, cr, dt);
  stepBurn(state, cr, dt);
  stepClouds(state, cr, ship, dt);
  if (mt.ring && mt.ring.fall) { mt.ring.t += dt; if (!mt.clouds.some((c) => c.mode === 'fall')) mt.ring = null; }
  lampWatch(state, cr);
  // the wings: a stepped picture key (0 folded .. 3 down-stroke), set from the act
  const a = mt.act;
  mt.beat = a && a.kind === 'beat' ? (a.sub === 'wind' ? (a.t < M.BEAT.WIND * 0.45 ? 1 : 2) : a.sub === 'beat' ? (Math.floor(a.t * 8) % 2 ? 3 : 2) : 1) : 0;
  mt.puff = a && a.kind === 'spores' && a.sub === 'wind' ? 1 + Math.min(2, Math.floor((a.t / M.SPORES.WIND) * 3)) : 0;
  if (a) return stepAct(state, cr, ship, dt, mid, a);
  if (!canAttack(state) || cr.ai.breather > 0) return;
  if ((mt.nextT -= dt) > 0) return;
  pickAct(state, cr, ship, mid);
}

// ---- the attack director ----
const grabCap = (state, cr) => Math.max(1, Math.min(gripCap(state, cr), MD().GRAB.MAX[Math.min(3, cr.phase)] || 1));
function endAct(state, cr) {
  const A = MD().ATTACK, mt = cr.mother;
  mt.act = null;
  mt.gust = null;
  mt.ring = null;
  const eyes = cr.parts.filter((q) => q.kind === 'eye' && q.dead).length;
  mt.nextT = rand(cr, A.EVERY[0], A.EVERY[1]) * (A.PHASE_MUL[Math.min(3, cr.phase)] || 1) * pauseOf(state) * A.EYE_SLOW ** eyes;
}
function pickAct(state, cr, ship, mid) {
  const M = MD(), mt = cr.mother, W = M.ATTACK.WEIGHTS[Math.min(3, cr.phase)];
  const free = tendrils(cr).some((p) => !p.dead && !p.severed && p.segs.length > 3 && !(p.gripCd > 0) && !burning(p));
  const opts = [];
  if (free && liveGrips(cr) < grabCap(state, cr)) opts.push(['grab', W.grab]);
  if (mt.clouds.filter((c) => c.mode !== 'fade').length < (M.SPORES.MAX[Math.min(3, cr.phase)] || 1)) opts.push(['spores', W.spores]);
  if (W.beat > 0 && liveGrips(cr) === 0) opts.push(['beat', W.beat]);
  const total = opts.reduce((n, o) => n + o[1], 0);
  if (!(total > 0)) { mt.nextT = 1.5; return; }
  let r = cr.hooks.rng() * total, kind = opts[0][0];
  for (const [k, w] of opts) { r -= w; if (r <= 0) { kind = k; break; } }
  if (kind === 'grab') mt.act = { kind: 'grab', sub: 'seq', t: 0, wait: 0, left: grabCap(state, cr) - liveGrips(cr) };
  else if (kind === 'spores') startSpores(state, cr, ship, mid);
  else startBeat(state, cr, ship, mid);
}
function stepAct(state, cr, ship, dt, mid, a) {
  a.t += dt;
  if (a.kind === 'grab') { // one tendril, or a burst of them GRAB.SPREAD s apart
    if ((a.wait -= dt) <= 0 && a.left > 0) {
      const g = canAttack(state) ? startGrip(state, cr, ship) : null;
      if (g) { a.left -= 1; cr.stats.grabs += 1; a.wait = MD().GRAB.SPREAD; } else a.left = 0;
    }
    if (a.left <= 0) endAct(state, cr);
    return;
  }
  if (a.kind === 'spores') return stepSpores(state, cr, ship, dt, mid, a);
  if (a.kind === 'beat') return stepBeat(state, cr, ship, dt, mid, a);
  endAct(state, cr);
}

// ---- SPORES ----
function startSpores(state, cr, ship, mid) {
  const S = MD().SPORES, mt = cr.mother;
  mt.act = { kind: 'spores', sub: 'wind', t: 0, tx: mid.x, ty: mid.y };
  mt.ring = { x: mid.x, y: mid.y, rx: S.RX, ry: S.RY, T: S.WIND + S.FALL, t: 0 };
  cr.stats.spores += 1;
  banner(state, 'THE MOTHER PUFFS UP! SPORES ARE COMING - THEY BLIND THE LAMPS! (FLAME BURNS THEM OFF)', S.WIND + 1.2);
  state.sfxQ.push(['roar']);
  for (const p of Object.values(state.players)) if (!p.bot && cr.hooks.phoneFx && !p.fly) cr.hooks.phoneFx(p, 'SPORE BURST COMING! Step out from under the red ring, or burn them off with flame.', [120, 60, 120, 60, 200]);
}
function stepSpores(state, cr, ship, dt, mid, a) {
  const S = MD().SPORES, mt = cr.mother;
  if (mt.ring) mt.ring.t = a.t;
  if (a.t < S.WIND) return;
  const c = { id: ++mt.cloudId, x: cr.x + (cr.hooks.rng() - 0.5) * 500, y: cr.y + 1150, x0: 0, y0: 0, tx: a.tx, ty: a.ty, t: 0, rx: S.RX, ry: S.RY, grow: 0.35, mode: 'fall', left: S.LINGER };
  c.x0 = c.x;
  c.y0 = c.y;
  mt.clouds.push(c);
  cr.stats.clouds += 1;
  state.sfxQ.push(['whoosh']);
  cr.hooks.puff(c.x, c.y, '#b0f06e', 14);
  endAct(state, cr);
  mt.ring = { x: a.tx, y: a.ty, rx: S.RX, ry: S.RY, T: S.FALL, t: 0, fall: true }; // (the ring stays on the spot while the cloud falls to it: stepMother clears it when the cloud has landed)
}

// ---- the WING BEAT ----
function startBeat(state, cr, ship, mid) {
  const B = MD().BEAT, mt = cr.mother;
  const off = mid.x - cr.x, dir = Math.abs(off) < 400 ? (cr.hooks.rng() < 0.5 ? -1 : 1) : off < 0 ? -1 : 1; // (toward the side the ship already leans to)
  mt.act = { kind: 'beat', sub: 'wind', t: 0, dir };
  mt.gust = { dir, t: 0, beat: false, x: cr.x, y: cr.y + 1100 };
  cr.stats.beats += 1;
  banner(state, 'THE MOTHER SPREADS HER WINGS! THE WIND BLOWS ' + (dir < 0 ? 'LEFT' : 'RIGHT') + ' - BRACE, BRAKE OR CLIMB OVER THE PILLARS!', B.WIND + 1.2);
  state.sfxQ.push(['roar']);
  warnCrew(state, cr, ship, everyone, 'WING BEAT COMING! The wind blows ' + (dir < 0 ? 'LEFT' : 'RIGHT') + ' - hold on, get off the open decks!', [200, 60, 200, 60, 200]);
}
const bagOf = (ship) => ship.layout.gasbag || ship.layout.gasbags[0] || null;
function stepBeat(state, cr, ship, dt, mid, a) {
  const B = MD().BEAT, mt = cr.mother, dir = a.dir;
  if (mt.gust) { mt.gust.t = a.t; mt.gust.x = cr.x; }
  if (a.sub === 'wind') {
    if (liveGrips(cr) > 0 || !canAttack(state)) { endAct(state, cr); return; } // (a tendril has her tethered: no beat)
    if (a.t >= B.WIND) {
      a.sub = 'beat';
      a.t = 0;
      if (mt.gust) mt.gust.beat = true;
      state.sfxQ.push(['whoosh']);
      state.sfxQ.push(['whoosh']);
      state.ship.shake = Math.max(state.ship.shake || 0, B.SHAKE);
      if (ship.sim && ship.sim.air) ship.sim.air.shove(B.SHOVE, ship.layout.refPoint.x);
      const per = driveGain(ship);
      if (per) ship.ctx.ship.speed += (dir * B.KICK) / per; // (a shove on her speed too: the helm has to brake)
      ship.pose.vy = (ship.pose.vy || 0) + B.VY;
      for (const c of mt.clouds) if (c.mode !== 'fade') { c.mode = 'fade'; c.left = 1; } // (the wind blows the spores away)
    }
    return;
  }
  if (a.sub === 'beat') {
    if (liveGrips(cr) === 0) {
      ship.pose.x += dir * B.PUSH * dt; // (the rock collision shoves her back out, as the storm's own wind does)
      cr.stats.beatPush += B.PUSH * dt;
      const bag = bagOf(ship);
      if (bag) applyForce(ship.ctx, { x: bag.cx, y: bag.cy - bag.ry * 0.3, fx: dir * ship.pose.f * B.FX, fy: B.FX * 0.4, source: 'gust' });
    }
    for (const c of mt.clouds) c.x += dir * B.PUSH * dt;
    if (a.t >= B.BEAT) { a.sub = 'recover'; a.t = 0; mt.gust = null; }
    return;
  }
  if (a.t >= B.RECOVER) endAct(state, cr);
}
