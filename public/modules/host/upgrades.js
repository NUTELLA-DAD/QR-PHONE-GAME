// Ship upgrades. At the turning beacon and back home, the crew votes on one of three.
// Each upgrade changes the ship's modules (via config / state) and can be taken up to `max` times.
import { config } from '../../config.js';
import { refillBags } from './gasBags.js';

export const UPGRADES = [
  {
    id: 'twin-barrels', name: 'Twin Barrels', icon: '🔫', max: 3,
    desc: 'All guns fire 30% faster.',
    apply: () => (config.GUNS.COOLDOWN *= 0.7),
  },
  {
    id: 'big-shells', name: 'Big Shells', icon: '💣', max: 2,
    desc: 'Shells hit harder (+1 old-style damage).',
    apply: () => (config.GUNS.DAMAGE += 0.5),
  },
  {
    id: 'deep-magazines', name: 'Deep Magazines', icon: '📦', max: 2,
    desc: 'Guns hold 10 more shells and each crate loads 5 more.',
    apply: ({ state }) => {
      config.GUNS.LOAD += 5;
      for (const g of Object.values(state.GUNS)) g.max += 10;
    },
  },
  {
    id: 'auto-loader', name: 'Auto-Loader', icon: '⚙️', max: 2,
    desc: 'Guns reload themselves twice as fast.',
    apply: () => (config.GUNS.AUTOLOAD_EVERY = config.GUNS.AUTOLOAD_EVERY ? config.GUNS.AUTOLOAD_EVERY * 0.5 : 4),
  },
  {
    id: 'armour', name: 'Armour Plating', icon: '🛡️', max: 3,
    desc: 'The hull takes 20% less damage.',
    apply: () => (config.SHIP.HULL_DAMAGE *= 0.8),
  },
  {
    id: 'reinforced', name: 'Reinforced Modules', icon: '🔩', max: 2,
    desc: 'Guns, boiler, helm, engines and pipes are 50% tougher.',
    apply: ({ modules }) => {
      for (const m of modules.list) {
        m.max = Math.round(m.max * 1.5);
        m.hp = m.broken ? m.hp : Math.min(m.max, m.hp * 1.5);
      }
    },
  },
  {
    id: 'firebox', name: 'Big Firebox', icon: '🔥', max: 2,
    desc: 'The boiler holds more coal and each load burns longer.',
    apply: () => {
      config.BOILER.FUEL_MAX += 50;
      config.BOILER.COAL_FUEL += 10;
    },
  },
  {
    id: 'safety-valve', name: 'Safety Valve', icon: '🧯', max: 1,
    desc: 'The boiler can never blow up (but still vent to keep steam useful).',
    apply: () => (config.BOILER.BLOWOUT_AT = Infinity),
  },
  {
    id: 'twin-gasbag', name: 'Twin Gasbag', icon: '🎈', max: 1,
    desc: 'A second gasbag: stronger lift, faster pumping, and holes leak less.',
    apply: () => {
      config.GAS.LIFT *= 1.3;
      config.GAS.PUMP_RATE *= 1.4;
      config.GAS.LEAK_PER_HOLE *= 0.8;
    },
  },
  {
    id: 'rubber-gasbag', name: 'Rubberised Gasbag', icon: '🎈', max: 2,
    desc: 'Gasbag holes leak 40% slower and hits tear it less often.',
    apply: () => {
      config.GAS.LEAK_PER_HOLE *= 0.6;
      config.GAS.HOLE_CHANCE *= 0.7;
    },
  },
  {
    id: 'rudders', name: 'Better Rudders', icon: '🧭', max: 2,
    desc: 'Engines and the trim engine are 35% stronger.',
    apply: () => ((config.SHIP.TRIM_ACCEL *= 1.35), (config.SHIP.MOTION.THRUST *= 1.35), (config.SHIP.MOTION.BRAKE *= 1.35), (config.SHIP.MOTION.GOVERN *= 1.35)),
  },
  {
    id: 'cutlasses', name: 'Steel Cutlasses', icon: '🗡️', max: 2,
    desc: 'Swords hit twice as hard and reach further.',
    apply: () => {
      config.TOOLS.SWORD_DAMAGE += 1;
      config.TOOLS.SWORD_RANGE += 20;
    },
  },
  {
    id: 'sprinklers', name: 'Fire Sprinklers', icon: '💦', max: 2,
    desc: 'Fires spread half as fast and go out quicker.',
    apply: () => {
      config.FIRE.SPREAD_EVERY *= 2;
      config.TOOLS.EXTINGUISH_TIME *= 0.6;
    },
  },
  {
    id: 'hammer-drills', name: 'Hammer Drills', icon: '🔨', max: 2,
    desc: 'Patching and repairs are 60% faster.',
    apply: () => {
      config.TOOLS.PATCH_TIME *= 0.6;
      config.MODULES.REPAIR_RATE *= 1.6;
    },
  },
  {
    id: 'periscope', name: 'Periscope', icon: '🔭', max: 1,
    desc: 'Always see what is coming, even with nobody on Lookout.',
    apply: ({ state }) => (state.periscope = true),
  },
  {
    id: 'spare-parts', name: 'Spare Parts', icon: '🧰', max: 99,
    desc: 'Patch everything up right now: hull, gasbag and every module.',
    apply: ({ state, modules }) => {
      state.ship.hull = 100;
      refillBags(state, config.GAS.START);
      state.breaches.length = 0;
      state.gasHoles.length = 0;
      state.fires.length = 0;
      for (const m of modules.list) {
        m.hp = m.max;
        m.broken = false;
      }
    },
  },
];

// The config blocks the upgrades above change. These (and only these) are put back to normal when a
// new voyage starts (simulation.js restartGame); other settings, like the menu's Sharp picture, stay.
// A new upgrade that changes another block must add it here (tools/upgradereset.mjs checks this).
export const UPGRADE_BLOCKS = ['GUNS', 'SHIP', 'BOILER', 'GAS', 'TOOLS', 'FIRE', 'MODULES'];

// Three different upgrades that can still be taken.
export function pickOffer(taken) {
  const open = UPGRADES.filter((u) => (taken[u.id] || 0) < u.max);
  const out = [];
  while (out.length < 3 && open.length) out.push(open.splice((Math.random() * open.length) | 0, 1)[0]);
  return out;
}
