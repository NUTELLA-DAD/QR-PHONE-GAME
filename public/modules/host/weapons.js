// THE GUN TYPES OF THE RANGE BANDS (config.GUN_TYPES; PVP.md "Space and range"). Node-safe: no DOM.
//
// A gun part may carry a `gtype` (the layout's gunMounts[name].type, state.GUNS[name].type): the ordinary broadside gun has none and every number below falls back to config.GUNS, so a ship
// without these parts flies exactly as before. A typed gun is the same station - a person or a bot takes it, the stick aims, FIRE fires, the ammo hold feeds it - and only differs in what leaves the barrel:
//   long      one fast, heavy, nearly straight shell (range about 6900 px)
//   mortar    one slow shell lobbed on an arc (shell.g: gravity), which falls onto the deck and the gasbag and splashes down through the hull; it spreads less with a lookout up or the rival spotted
//   scatter   a fan of light pellets (grapeshot) over a short reach
//   flak      a shell with a proximity fuse that bursts near a plane, a bat or an enemy crewman in the air (stepFlak)
//   harpoon   no shell: a line to the nearest enemy deck in the way the barrel points, which latches and reels the two ships together (towing.js fireHarpoon)
//   mines     no shell: a floating mine dropped from under the hull (minefield.js lay)
//   const fired = fireTyped({ ship, state, gun, player, angle, wx, wy, primed, puff, W })      -> false when nothing was fired (the harpoon found no deck: the shot is given back)
//   (the numbers and the aim are gunTypes.js; aim.js solution() asks it for typed guns)
//   stepFlak(world, dt, puff)                                                                 once per world step
import { config } from '../../config.js';
import { typeOf } from './gunTypes.js';
import { lay } from './minefield.js';

// ---- firing ----
const rnd = () => Math.random() * 2 - 1;
const countFor = (state, player, key) => { const M = state.match; if (M && M.on && player && player.team) M.count(player.team, key); };
// Is the target well seen: a lookout is up in the nest, or the rival has been spotted from the radar (spotter.js)?
const spotted = (state) => !!state.lookout || !!(state.rival && ((state.rival.spotT || 0) > 0 || (state.rival.ship && state.rival.ship.state && (state.rival.ship.state.spotT || 0) > 0)));

export function fireTyped({ ship, state, gun, player, angle, wx, wy, primed, puff, W }) {
  const T = typeOf(gun), type = gun.type, pvx = ship.pose.vx;
  const base = { owner: player.id, from: ship.id };
  const mul = (m) => m * (primed ? config.PRIME.DAMAGE_MUL : 1);
  const push = (s) => state.shells.push({ ...base, ...s });
  const flash = (a, color, size, t = 0.1) => state.flashes.push({ x: wx + Math.cos(a) * 70, y: wy + Math.sin(a) * 70, ang: a, t, color, size });
  if (type === 'long') {
    const a = angle + rnd() * T.SPREAD;
    push({ x: wx + Math.cos(a) * 80, y: wy + Math.sin(a) * 80, vx: Math.cos(a) * T.SPEED + pvx, vy: Math.sin(a) * T.SPEED, life: T.LIFE * (gun.reach || 1), mul: mul(T.MUL), kind: 'long', ...(primed ? { primed: true } : {}) });
    puff(wx + Math.cos(a) * 90, wy + Math.sin(a) * 90, '#ffe9a8', 6);
    flash(a, '#fff2b0', 2.2, 0.14);
    state.sfxQ.push(['bigshot']);
    countFor(state, player, 'longShots');
  } else if (type === 'mortar') {
    const seen = spotted(state);
    const a = angle + rnd() * (seen ? T.SPREAD_SPOTTED : T.SPREAD);
    push({ x: wx + Math.cos(a) * 50, y: wy + Math.sin(a) * 50, vx: Math.cos(a) * T.SPEED + pvx, vy: Math.sin(a) * T.SPEED, g: T.GRAVITY, life: T.LIFE, mul: mul(T.MUL), kind: 'mortar', splash: { r: T.SPLASH, mul: T.SPLASH_MUL, dy: T.SPLASH_DY }, ...(primed ? { primed: true } : {}) });
    puff(wx + Math.cos(a) * 60, wy + Math.sin(a) * 60, '#cfc6b0', 10);
    flash(a, '#ffb347', 2.6, 0.16);
    state.sfxQ.push(['bigshot']);
    countFor(state, player, 'mortarShots');
  } else if (type === 'scatter') {
    for (let i = 0; i < T.PELLETS; i++) {
      const a = angle + ((i + 0.5) / T.PELLETS - 0.5) * T.CONE + rnd() * 0.03;
      const sp = T.SPEED * (0.9 + Math.random() * 0.2);
      push({ x: wx + Math.cos(a) * 50, y: wy + Math.sin(a) * 50, vx: Math.cos(a) * sp + pvx, vy: Math.sin(a) * sp, life: T.LIFE * (0.85 + Math.random() * 0.3), mul: mul(T.MUL), kind: 'scatter', ...(i ? { frag: true } : {}) });
    }
    puff(wx + Math.cos(angle) * 70, wy + Math.sin(angle) * 70, '#d8d0c0', 9);
    flash(angle, '#ffd9a0', 2.4, 0.12);
    state.sfxQ.push(['bigshot']);
    countFor(state, player, 'scatterShots');
  } else if (type === 'flak') {
    const a = angle + rnd() * 0.02;
    push({ x: wx + Math.cos(a) * 60, y: wy + Math.sin(a) * 60, vx: Math.cos(a) * T.SPEED + pvx, vy: Math.sin(a) * T.SPEED, life: T.LIFE * (gun.reach || 1), mul: mul(T.MUL), kind: 'flak', flak: true });
    puff(wx + Math.cos(a) * 64, wy + Math.sin(a) * 64, '#e9e4d6', 4);
    flash(a, '#fff2b0', 1.4, 0.09);
    countFor(state, player, 'flakShots');
  } else if (type === 'harpoon') {
    const tow = W.towing && W.towing.fireHarpoon(ship, angle, wx, wy, player);
    if (!tow) return false;
    puff(wx + Math.cos(angle) * 70, wy + Math.sin(angle) * 70, '#ffffff', 8);
    flash(angle, '#fff2b0', 2, 0.14);
    state.sfxQ.push(['bigshot']);
    countFor(state, player, 'harpoons');
  } else if (type === 'mines') {
    return lay(ship, state, gun, player, puff);
  }
  return true;
}

// ---- flak: shells that burst near what they are for ----
// Called once per world step. A flak shell (shell.flak) bursts when a plane, a bat or an enemy crewman in the air comes within FUSE px: the burst hurts every plane within BURST px (a fragment shell that the
// ordinary shell code of the plane applies, so kills are credited as ever) and knocks every enemy flier out of the sky (he falls to his own medical bay; Versus).
export function stepFlak(world, dt, puff) {
  const T = config.GUN_TYPES.flak;
  if (!T) return;
  for (const sh of world.shells) {
    if (!sh.flak || sh.life <= 0) continue;
    const team = (sh.owner && world.players[sh.owner] && world.players[sh.owner].team) || null;
    const planes = [];
    const e = world.enemy;
    if (e && e.dead <= 0 && e !== world.stuntPlane) planes.push(e);
    for (const p of world.strafers || []) if (p.hp > 0 && p !== world.stuntPlane) planes.push(p);
    for (const p of world.bombers || []) if (p.hp > 0) planes.push(p);
    for (const b of world.bats || []) if (!b.latched && b.hp > 0 && !(b.delay > 0)) planes.push(b);
    const near = (o, r) => Math.hypot(o.x - sh.x, o.y - sh.y) < r;
    const fliers = team ? Object.values(world.players).filter((q) => q.fly && q.team && q.team !== team && near(q, T.BURST)) : [];
    if (!planes.some((o) => near(o, T.FUSE)) && !Object.values(world.players).some((q) => team && q.fly && q.team && q.team !== team && near(q, T.FUSE))) continue;
    sh.life = 0;
    puff(sh.x, sh.y, '#f2d36b', 14);
    world.rings.push({ x: sh.x, y: sh.y, t: 0.35, max: 0.35, color: '#ffd23f', size: T.BURST });
    world.sfxQ.push(['impact']);
    for (const o of planes) if (near(o, T.BURST)) world.shells.push({ x: o.x, y: o.y, vx: 0, vy: 0, life: 0.08, mul: T.PLANE_MUL, owner: sh.owner, from: sh.from, frag: true, kind: 'flakFrag' });
    for (const q of fliers) {
      const home = world.ships.find((s) => s.id === (q.ship || 'player'));
      if (home && home.sim.air.shotDown(q) && world.match && world.match.on && team) world.match.count(team, 'flakBursts');
    }
  }
}
