// What the headless gates need to load the game's modules in Node: browser stand-ins (the sim barely touches any) and one seeded random source with a simulated clock.
// (B.4 retired the two-module-copies harness that used to live next to this in tools/instances.mjs: Versus is two Ships in ONE World now.)
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const publicDir = path.resolve(here, '..', 'public');

// Browser stand-ins.
export function installShims() {
  globalThis.window ??= globalThis;
  const store = new Map();
  globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);
}

// One seeded random source (and the clocks the game reads), as tools/botsim.mjs does.
export function seedRandom(seed) {
  let s = seed >>> 0; // mulberry32
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Date.now = () => 1700000000000 + seed;
  const clock = { ms: 0 };
  performance.now = () => clock.ms; // (bot timing and swing animations follow the simulated clock)
  return clock;
}
