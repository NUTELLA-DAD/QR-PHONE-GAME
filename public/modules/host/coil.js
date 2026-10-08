// The Lightning Coil: a super-weapon on top of the crow's nest, worked from the Workshop.
// Aim with the stick and HOLD to charge (it drinks steam); let go to fire a huge lightning bolt
// that hits everything along its path. The longer the charge, the harder it hits.
import { config } from '../../config.js';
import { targets } from './aim.js';
import { pop } from './popups.js';
import { mainShip } from './ships.js';
import { toWorldX, toWorldY, aimToWorld } from './pose.js';

const C = config.COIL;
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function createCoil({ state, puff, credit }) {
  const ship = mainShip(state); // (B1: the ship this system belongs to; B2 makes it one per ship)
  const layout = ship.layout;
  const NONE = { x: 0, y: 0, aim: -Math.PI / 2, arc: 0 };
  let M = layout.coil || NONE; // (a ship with no coil emitter: nobody can man it, so these are never used; refit() looks again after a new build)
  const coil = (state.coil = { aim: M.aim, charge: 0, cd: 0, bolt: null, charging: false });

  // World position of the emitter.
  const emitter = () => ({ x: toWorldX(ship, M.x), y: toWorldY(ship, M.y - 60) }); // the glowing ball on top

  const fire = (owner) => {
    const power = coil.charge;
    const dmg = Math.max(1, Math.round(C.DAMAGE * power));
    const e = emitter();
    const wa = aimToWorld(ship, coil.aim); // (coil.aim is in ship space; the bolt flies along the world)
    const dx = Math.cos(wa);
    const dy = Math.sin(wa);
    // A jagged bolt for the picture.
    const pts = [[e.x, e.y]];
    for (let k = 1; k <= 12; k++) {
      const along = (C.RANGE * k) / 12;
      const off = k === 12 ? 0 : (Math.random() - 0.5) * 120 * power;
      pts.push([e.x + dx * along - dy * off, e.y + dy * along + dx * off]);
    }
    coil.bolt = { pts, t: 0.5, power };
    coil.charge = 0;
    coil.cd = C.COOLDOWN;
    state.ship.shake = Math.max(state.ship.shake, 0.4);
    pop(state, e.x, e.y - 120, 'KA-ZAAAP!', '#9fe8ff', 1 + power);
    const shell = { owner };
    for (const t of targets(state)) {
      const p = t.at(0);
      const rx = p.x - e.x;
      const ry = p.y - e.y;
      const along = rx * dx + ry * dy;
      if (along < 0 || along > C.RANGE || Math.abs(rx * dy - ry * dx) > C.WIDTH + t.r) continue;
      const o = t.obj;
      puff(p.x, p.y, '#9fe8ff', 10);
      if (t.kind === 'cable') {
        o.cable = 0;
        continue;
      }
      if (t.kind === 'turret') {
        if (!o.dead) (o.dead = true), (state.kills += 1), credit?.(shell);
        continue;
      }
      if (t.kind === 'mine' || t.kind === 'bomb') {
        o.dead = true;
        if (o.hp != null) o.hp = 0;
        continue;
      }
      if (o.hp == null) continue;
      const was = o.hp;
      // (A boss is left on its last legs: the guns finish it off.)
      o.hp = t.kind === 'boss' ? Math.max(1, o.hp - Math.ceil(dmg / 2)) : o.hp - dmg;
      o.hit = 0.2;
      if (was > 0 && o.hp <= 0) {
        if (t.kind === 'bossgun') o.dead = true;
        else if (t.kind === 'fighter') o.dead = 4;
        if (t.kind !== 'boss') {
          state.kills += 1;
          credit?.(shell);
          puff(p.x, p.y, '#ff5a1f', 20);
        }
      }
    }
  };

  // Called every frame with the player on the coil (or null).
  const update = (dt, player, working) => {
    coil.cd = Math.max(0, coil.cd - dt);
    if (coil.bolt && (coil.bolt.t -= dt) <= 0) coil.bolt = null;
    coil.charging = false;
    if (!player || !working || state.phase !== 'flying') {
      coil.charge = Math.max(0, coil.charge - dt);
      return;
    }
    // Aim (only upward and to the sides: it sits on top of the ship).
    if (Math.hypot(player.jx, player.jy) > 0.3) {
      const want = M.aim + Math.max(-M.arc, Math.min(M.arc, angDiff(Math.atan2(player.jy, player.jx), M.aim)));
      const d = angDiff(want, coil.aim);
      coil.aim += Math.max(-C.TURN * dt, Math.min(C.TURN * dt, d));
    }
    if (coil.cd > 0) return;
    if (player.fire || player.actQ) {
      // Charging is slower on low steam.
      coil.charging = true;
      coil.charge = Math.min(1, coil.charge + (dt / C.CHARGE_TIME) * Math.min(1, state.ship.press / 50) * (1 + config.BOILER.OD_COIL * (state.overdrive || 0) + config.LINKS.SURGE.COIL * (state.surgeCoil || 0)));
      if (Math.random() < dt * 20) puff(toWorldX(ship, M.x + (Math.random() - 0.5) * 60), toWorldY(ship, M.y - 40 - Math.random() * 40), '#9fe8ff', 2);
      if (coil.charge >= 1) fire(player.id);
    } else if (coil.charge >= C.MIN_CHARGE) fire(player.id);
    else coil.charge = Math.max(0, coil.charge - dt);
  };

  const reset = () => Object.assign(coil, { aim: M.aim, charge: 0, cd: 0, bolt: null, charging: false });
  const refit = () => { M = layout.coil || NONE; reset(); }; // (a new build was applied to the ship: Versus' shelf)

  return { update, reset, refit, emitter };
}
