// Storm fronts (from lap 2): dark sky and rain, wind gusts that shove the ship up or down (the helm
// has to fight them), and lightning that sometimes strikes the ship.
import { config } from '../../config.js';
import { altBounds } from './course.js';
import { envIdOf } from './environments.js';

let S = config.STORM; // (a Storm Front mission overrides some numbers: config.ENVIRONMENTS.storm.WEATHER)
const rand = (a, b) => a + Math.random() * (b - a);

export function createWeather({ state, impact, puff }) {
  state.weather = { storm: 0, gust: 0, flash: 0, bolt: null };
  let gustT = 3;
  let gustLeft = 0;
  let nextGust = null; // the next gust is rolled ahead of time so the lookout can warn about it (state.weather.gustIn / gustNext)
  let boltT = 5;
  let announced = false;

  // Is this point of the lap inside a storm front?
  const stormWanted = () => {
    const c = state.course;
    if (!c || state.phase !== 'flying') return 0;
    if (envIdOf(state) === 'storm') return 1; // Storm Front: the whole mission is a storm
    for (const z of S.ZONES) {
      if (c.lap >= z.fromLap && c.progress > z.from && c.progress < z.to) return Math.min(1, 0.6 + 0.2 * (c.lap - z.fromLap));
    }
    return 0;
  };

  const update = (dt) => {
    S = envIdOf(state) === 'storm' ? { ...config.STORM, ...config.ENVIRONMENTS.storm.WEATHER } : config.STORM;
    const w = state.weather;
    const want = stormWanted();
    w.storm += (want - w.storm) * Math.min(1, dt * 0.5);
    w.flash = Math.max(0, w.flash - dt * 3);
    if (w.bolt && (w.bolt.t -= dt) <= 0) w.bolt = null;
    if (want > 0 && !announced) {
      announced = true;
      state.ev.warn = 3.5;
      state.ev.warnText = 'STORM FRONT - HOLD ON TO YOUR HATS!';
    }
    if (want === 0) announced = false;
    if (w.storm < 0.15 || state.ship.down) {
      w.gust = 0;
      w.gusting = false;
      w.gustIn = 99;
      return;
    }
    // Wind gusts push the ship's altitude.
    w.gusting = gustLeft > 0; // (envStormSea.js shoves her along as well)
    if (nextGust == null) nextGust = (Math.random() < 0.5 ? -1 : 1) * rand(S.GUST_MIN, S.GUST_MAX);
    w.gustIn = gustLeft > 0 ? 0 : gustT; // seconds until the next gust (0 = blowing now)
    w.gustNext = nextGust;
    if (gustLeft > 0) {
      gustLeft -= dt;
      state.ship.alt += w.gust * w.storm * dt;
      const bounds = altBounds(state);
      state.ship.alt = Math.max(Math.min(bounds.lo - 60, state.ship.alt), Math.min(bounds.hi + 60, state.ship.alt));
      if (gustLeft <= 0) w.gust = 0;
    } else if ((gustT -= dt) <= 0) {
      gustT = rand(S.GUST_EVERY_MIN, S.GUST_EVERY_MAX);
      gustLeft = S.GUST_TIME;
      w.gust = nextGust;
      nextGust = (Math.random() < 0.5 ? -1 : 1) * rand(S.GUST_MIN, S.GUST_MAX);
    }
    // Lightning.
    if ((boltT -= dt) <= 0) {
      boltT = rand(S.BOLT_EVERY_MIN, S.BOLT_EVERY_MAX) / w.storm;
      w.flash = 1;
      if (Math.random() < S.STRIKE_CHANCE) {
        // Strike the gasbag or the catwalk (ship coordinates).
        const x = rand(300, 1300);
        const y = Math.random() < 0.6 ? rand(120, 380) : 455;
        w.bolt = { x, y: y - state.ship.alt, t: 0.25 };
        puff(x, y - state.ship.alt, '#fff7a8', 10);
        impact(x, y, S.STRIKE_POWER);
        state.ev.warn = 1.5;
        state.ev.warnText = 'LIGHTNING STRIKE!';
      } else {
        w.bolt = { x: rand(-800, 2400), y: null, t: 0.2 }; // a bolt in the distance
      }
    }
  };

  return { update };
}
