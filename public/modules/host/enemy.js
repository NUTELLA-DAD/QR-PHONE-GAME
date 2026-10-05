// The enemy plane's flight path: a wide loop around the ship (so it never flies through it).
import { config } from '../../config.js';

const E = config.ENEMY;

// Position on the loop for a given angle.
export function enemyPath(ang) {
  return {
    x: E.PATH_CX + Math.cos(ang) * E.PATH_RX,
    y: E.PATH_CY + Math.sin(ang) * E.PATH_RY + Math.sin(ang * 3) * E.PATH_WOBBLE,
  };
}

// Where the plane will be in t seconds.
export const enemyAt = (enemy, t) => enemyPath(enemy.ang + E.TURN_SPEED * t);
