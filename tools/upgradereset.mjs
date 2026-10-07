// Headless check: upgrades bought on one voyage must not carry into the next one.
// Buys every upgrade (to its max), ends the run, starts a new voyage, and checks the settings are back to normal.
// Usage: node tools/upgradereset.mjs   (prints PASS or FAIL lines; exit code 1 on any failure)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

globalThis.window ??= globalThis;
const store = new Map();
globalThis.localStorage ??= { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.requestAnimationFrame ??= (f) => setTimeout(f, 16);

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public');
const load = (p) => import(pathToFileURL(path.join(root, p)).href);
const { config } = await load('config.js');
const { UPGRADES } = await load('modules/host/upgrades.js');
const { createSimulation } = await load('modules/host/simulation.js');

const sim = createSimulation();
const { state, modules } = sim;
const before = JSON.stringify(config);
const gunMax = Object.fromEntries(Object.entries(state.GUNS).map(([k, g]) => [k, g.max]));
const modMax = modules.list.map((m) => m.max);
let fails = 0;
const check = (ok, what) => { console.log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails++; };

// Voyage 1: cast off and buy every upgrade as many times as it allows.
sim.castOff();
for (const u of UPGRADES) {
  if (u.id === 'spare-parts') continue;
  for (let i = 0; i < u.max; i++) {
    u.apply({ state, modules });
    state.upgrades[u.id] = (state.upgrades[u.id] || 0) + 1;
    state.run.bought.push(u.id);
  }
}
check(JSON.stringify(config) !== before, 'upgrades changed the settings during voyage 1');
// Mid-voyage, someone flips "Sharp picture" in the TV menu (a setting, not an upgrade: it must stay).
config.DISPLAY.MAX_PIXEL_RATIO = config.DISPLAY.SHARP_RATIO;

// The voyage ends (victory screen runs out), back to the lobby, then CAST OFF again.
sim.restart();
sim.castOff();
for (let i = 0; i < 60; i++) sim.update(1 / 60);

const now = JSON.parse(JSON.stringify(config));
const base = JSON.parse(before);
const changed = [];
for (const block of Object.keys(base)) {
  if (block === 'DISPLAY') continue;
  for (const k of Object.keys(base[block] || {})) if (JSON.stringify(base[block][k]) !== JSON.stringify(now[block][k])) changed.push(block + '.' + k);
}
check(changed.length === 0, 'every setting back to normal on voyage 2' + (changed.length ? ' (still changed: ' + changed.join(', ') + ')' : ''));
check(config.GUNS.COOLDOWN === base.GUNS.COOLDOWN && config.GAS.LIFT === base.GAS.LIFT && config.SHIP.HULL_DAMAGE === base.SHIP.HULL_DAMAGE, 'gun cooldown, gasbag lift and armour are the defaults');
check(config.BOILER.BLOWOUT_AT === base.BOILER.BLOWOUT_AT, 'safety valve gone (boiler can blow up again)');
check(Object.keys(state.upgrades).length === 0 && state.run.bought.length === 0, 'no upgrades owned on voyage 2');
check(!state.periscope, 'periscope gone');
check(Object.entries(state.GUNS).every(([k, g]) => g.max === gunMax[k]), 'gun magazines back to normal size');
check(modules.list.every((m, i) => m.max === modMax[i]), 'modules back to normal toughness');
check(config.DISPLAY.MAX_PIXEL_RATIO === config.DISPLAY.SHARP_RATIO, '"Sharp picture" menu choice kept after the restart');
console.log(fails ? fails + ' check(s) FAILED' : 'All checks passed');
process.exit(fails ? 1 : 0);
