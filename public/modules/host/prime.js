// Primed shells: while someone is on a gun they can hold PRIME (the left button on their phone) to
// charge the loaded shell. A fully primed shell hits harder, bursts into splinters, and the barrel
// glows on the TV until it is fired. Never required: it is something to do between targets.
// Numbers live in config.PRIME. Gun state: gun.prime (0-1 charge), gun.primed (ready to fire).
// Linked stations (config.LINKS): a second crew member beside a manned gun can hold Action to LOAD it for the
// gunner (assist below), much faster. A gunner priming alone is slower. gun.loadT > 0 = a loader is working it.
import { config } from '../../config.js';
import { mainShip } from './ships.js';

const P = config.PRIME;
const LK = config.LINKS;

export function createPrime({ state, phoneFx }) {
  // A shell reaches full charge (whoever did the last of it).
  const finish = (gun, player, gunner) => {
    gun.primed = true;
    gun.prime = 1;
    gun.primedFlash = 0.5;
    state.sfxQ.push(['primed']);
    phoneFx?.(gunner, 'PRIMED! Next shell hits hard', 0);
    if (player !== gunner) phoneFx?.(player, 'Loaded for ' + gunner.name + '!', 0);
  };

  // Called every frame for the player on a gun (working = the gun is not broken).
  const charge = (player, gun, working, dt) => {
    const holding = !!player.prime && working && gun.ammo > 0 && !player.fire && !player.actQ;
    const linked = LK.ENABLED && (gun.loadT || 0) > 0 && working && gun.ammo > 0; // (a loader is on it: no solo penalty, no fading)
    gun.loadT = Math.max(0, (gun.loadT || 0) - dt);
    if (gun.primed) {
      gun.prime = 1;
      return;
    }
    if (holding) {
      gun.prime = Math.min(1, (gun.prime || 0) + dt / (linked || !LK.ENABLED ? P.TIME : P.TIME * LK.SOLO_MUL)); // (alone it takes longer)
      if (gun.prime >= 1) finish(gun, player, player);
    } else if (!linked) gun.prime = Math.max(0, (gun.prime || 0) - P.DECAY * dt);
  };

  // LINKED: a second crew member holds Action beside a manned gun to charge its shell for the gunner.
  const assist = (loader, gun, gunner, dt) => {
    if (gun.primed || gun.ammo <= 0) return;
    gun.loadT = LK.LOADER_HOLD;
    gun.loaderId = loader.id;
    gun.prime = Math.min(1, (gun.prime || 0) + dt / LK.LOADER_TIME);
    if (gun.prime >= 1) finish(gun, loader, gunner);
  };

  // A gun with nobody on it forgets a half-charge (a finished primed shell waits for the next gunner).
  const idle = (gun, dt) => {
    gun.primedFlash = Math.max(0, (gun.primedFlash || 0) - dt);
    gun.loadT = 0;
    if (!gun.primed) gun.prime = Math.max(0, (gun.prime || 0) - P.DECAY * dt);
  };

  // The gun fires: returns true if this shell is the primed one (and uses the charge up).
  const take = (gun) => {
    if (!gun.primed) return false;
    gun.primed = false;
    gun.prime = 0;
    return true;
  };

  // Where a primed shell burst (it hit something: life is exactly 0): throw splinters so
  // other targets nearby are hit too. Splinters are ordinary short-lived shells (credit goes to the shooter).
  const burst = (shell) => {
    state.rings.push({ x: shell.x, y: shell.y, t: 0.45, max: 0.45, color: '#ff9a2e', size: P.BLAST_SIZE, kind: 'prime' });
    state.flashes.push({ x: shell.x, y: shell.y, ang: 0, t: 0.18, color: '#fff2b0', size: 2.2 });
    const a0 = Math.random() * 6.28;
    for (let i = 0; i < P.FRAGS; i++) {
      const a = a0 + (i / P.FRAGS) * 6.283;
      state.shells.push({ x: shell.x, y: shell.y, vx: Math.cos(a) * P.FRAG_SPEED + mainShip(state).pose.vx, vy: Math.sin(a) * P.FRAG_SPEED, life: P.FRAG_LIFE, owner: shell.owner, frag: true, ...(shell.from ? { from: shell.from } : {}) });
    }
  };

  return { charge, assist, idle, take, burst };
}
