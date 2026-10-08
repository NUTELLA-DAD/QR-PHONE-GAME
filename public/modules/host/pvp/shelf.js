// The build shelf (Versus, PVP.md "Build phase v1"): the ready-made ships a team may choose from after CAST OFF in the Versus lobby. Node-safe: no DOM.
//
// Every entry is a parts list (shipBuild.js) with its numbers on show - mass / lift / hands (the gauges of the build page) - and the validator has PASSED it (no FAIL) and it fits
// under the TONNAGE cap, the classic ship's weight times config.PVP.TONNAGE, the same for both teams:
//   * Classic       the all-round airship every game starts with;
//   * Twin Boiler   the classic ship with a second boiler and a second lookout (tools/fixtures/multi-build.mjs, S.3);
//   * Four Bags     her one long gasbag rubbed out and four drawn in a row, each with its own gas valve (tools/fixtures/bags-build.mjs, S.5d);
//   * Variant A..   random valid builds: one to three legal mutations of the classic ship (buildSlots.js randomMutation, seeded: both teams see the same shelf).
// The shelf is made once per match (it takes a moment: every build is validated) and kept; a team's pick is an index into it.
import { config } from '../../../config.js';
import { BUILDS, budgets } from '../shipBuild.js';
import { validate, liftGauge } from '../buildCheck.js';
import { randomMutation, slotsFor } from '../buildSlots.js';
import { erase, drawBag, drawDeck } from '../buildEdit.js';

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What a random mutation was, in a few words for the card (buildSlots.js randomMutation's tag).
const TAGS = { extend: 'a longer deck', keel: 'a keel deck', gun: 'an extra gun', searchlight: 'a searchlight', lookout: 'a lookout', boiler: 'a second boiler', coal: 'a coal bunker', ammo: 'an ammo store', engine: 'an extra engine', engineSwivel: 'a swivel engine', ladder: 'a ladder', pole: 'a slide pole', rack_hammer: 'a hammer rack', extinguisher: 'an extinguisher', vent: 'a steam vent', ballast: 'ballast', sail: 'a sail', armour: 'armour plate', flip: 'a deck turned over', remove: 'a part taken off' };

const twinBoiler = () => [...BUILDS.classic, { part: 'station', n: 'Fore Boiler', kind: 'boiler', p: 'main', x: 1090 }, { part: 'station', n: 'Aft Lookout', kind: 'lookout', p: 'nest', x: 700 }];

function fourBags() {
  let p = erase(BUILDS.classic, 'gasbag', 0, 0).parts;
  for (const [a, b] of [[-400, 200], [200, 800], [800, 1400], [1400, 2000]]) p = drawBag(p, a, b).parts;
  for (const bag of [0, 3, 1, 2]) { // one gas valve per bag, the end bags first (they have the fewest spots)
    const slot = slotsFor('gasValve', p).find((s) => s.feeds === bag);
    if (slot) p = slot.apply(p);
  }
  return p;
}

// The Boarder's Barge (B.6, config.PVP.SHELF.CROSS): the classic ship with her top deck two columns longer for a crew cannon on the new end, a sandbag rack, a crate stack and a towline reel.
const bargeParts = () => [...drawDeck(BUILDS.classic, 'catwalk', 1360, 1600).parts, { part: 'crewCannon', n: 'Crew Cannon', p: 'catwalk', x: 1500, aim: config.CROSS.CANNON.AIM, arc: config.CROSS.CANNON.ARC }, { part: 'rack', kind: 'sandbag', p: 'catwalk', x: 400 }, { part: 'rack', kind: 'crate', p: 'catwalk', x: 760 }, { part: 'rack', kind: 'towline', p: 'catwalk', x: 1210 }];

// One shelf entry from a parts list (or null when the validator FAILs it).
function entry(id, name, blurb, parts) {
  let v;
  try { v = validate(parts); } catch (e) { return null; }
  if (!v.ok) return null;
  const b = budgets(parts), lift = liftGauge(parts);
  return { id, name, blurb, parts, mass: Math.round(b.mass), lift: Math.round(lift.lift), hover: lift.hover, hands: Math.round(b.hands), warns: v.warns.length };
}

// The weight cap for this shelf: the classic ship's mass times config.PVP.TONNAGE.
export const tonnageCap = () => Math.round(budgets(BUILDS.classic).mass * config.PVP.TONNAGE);

const cache = new Map();
// The shelf for a seed (cached). Always starts with the classic ship, so index 0 is a safe default.
export function buildShelf(seed = config.PVP.SHELF.SEED) {
  const key = seed + '|' + config.PVP.TONNAGE + '|' + config.PVP.SHELF.RANDOM + '|' + !!config.PVP.SHELF.CROSS;
  if (cache.has(key)) return cache.get(key);
  const cap = tonnageCap();
  const shelf = [];
  const add = (e) => { if (e && e.mass <= cap) shelf.push(e); };
  add(entry('classic', 'Classic', 'The all-round airship', BUILDS.classic));
  add(entry('twin', 'Twin Boiler', 'A second boiler and lookout', twinBoiler()));
  try { add(entry('bags', 'Four Bags', 'Four gasbags in a row', fourBags())); } catch (e) { /* (a build that does not come out is simply not on the shelf) */ }
  const rng = mulberry(seed);
  const seen = new Set(shelf.map((e) => JSON.stringify(e.parts)));
  const letters = 'ABCDEFGH';
  for (let tries = 0; shelf.filter((e) => e.id.startsWith('var')).length < config.PVP.SHELF.RANDOM && tries < 60; tries++) {
    let parts = BUILDS.classic;
    const labels = [];
    const tags = [];
    let tag = null;
    for (let k = 1 + Math.floor(rng() * 3); k > 0; k--) {
      const m = randomMutation(parts, rng, tag === 'boiler' ? 'engine' : null);
      if (!m) break;
      parts = m.parts;
      labels.push(m.label);
      tags.push(TAGS[m.tag] || m.tag);
      tag = m.tag;
    }
    const key2 = JSON.stringify(parts);
    if (!labels.length || seen.has(key2)) continue;
    const n = shelf.filter((e) => e.id.startsWith('var')).length;
    const e = entry('var' + n, 'Variant ' + letters[n % letters.length], 'The classic ship with ' + tags.join(' and '), parts);
    if (e && e.mass <= cap) { seen.add(key2); shelf.push(e); }
  }
  if (config.PVP.SHELF.CROSS) add(entry('barge', "Boarder's Barge", 'A crew cannon, sandbags and a towline', bargeParts())); // (B.6, dev: host.html?versus=1&cross=1 - last on the shelf, so the others keep their places)
  cache.set(key, shelf);
  return shelf;
}
