// Primed shells: while someone is on a gun they can hold PRIME (the left button on their phone) to
// charge the loaded shell. A fully primed shell hits harder, bursts into splinters, and the barrel
// glows on the TV until it is fired. Never required: it is something to do between targets.
// Numbers live in config.PRIME. Gun state: gun.prime (0-1 charge), gun.primed (ready to fire).
import { config } from '../../config.js';

const P = config.PRIME;

export function createPrime({ state, phoneFx }) {
  // Called every frame for the player on a gun (working = the gun is not broken).
  const charge = (player, gun, working, dt) => {
    const holding = !!player.prime && working && gun.ammo > 0 && !player.fire && !player.actQ;
    if (gun.primed) {
      gun.prime = 1;
      return;
    }
    if (holding) {
      gun.prime = Math.min(1, (gun.prime || 0) + dt / P.TIME);
      if (gun.prime >= 1) {
        gun.primed = true;
        gun.primedFlash = 0.5;
        state.sfxQ.push(['primed']);
        phoneFx?.(player, 'PRIMED! Next shell hits hard', 0);
      }
    } else gun.prime = Math.max(0, (gun.prime || 0) - P.DECAY * dt);
  };

  // A gun with nobody on it forgets a half-charge (a finished primed shell waits for the next gunner).
  const idle = (gun, dt) => {
    gun.primedFlash = Math.max(0, (gun.primedFlash || 0) - dt);
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
    state.rings.push({ x: shell.x, y: shell.y, t: 0.45, max: 0.45, color: '#ff9a2e', size: P.BLAST_SIZE });
    state.flashes.push({ x: shell.x, y: shell.y, ang: 0, t: 0.18, color: '#fff2b0', size: 2.2 });
    const a0 = Math.random() * 6.28;
    for (let i = 0; i < P.FRAGS; i++) {
      const a = a0 + (i / P.FRAGS) * 6.283;
      state.shells.push({ x: shell.x, y: shell.y, vx: Math.cos(a) * P.FRAG_SPEED, vy: Math.sin(a) * P.FRAG_SPEED, life: P.FRAG_LIFE, owner: shell.owner, frag: true });
    }
  };

  return { charge, idle, take, burst };
}
