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

// ---- the range-band ships (PVP.md "Space and range"; config.PVP.SHELF.RANGE): the classic ship with some of her guns turned into the weapons of one band ----
// Turn the named gun into one of the gun types (its mount re-aimed the way the type wants: a mortar lobs up, a long barrel swings less, a grapeshot gun wider).
function retype(parts, name, gtype) {
  return parts.map((p) => {
    if (p.part !== 'gun' || p.n !== name) return p;
    const fore = Math.cos(p.aim) >= 0, T = config.GUN_TYPES[gtype];
    const o = { ...p, gtype };
    if (gtype === 'mortar') { o.aim = fore ? -1.15 : -(Math.PI - 1.15); o.arc = 0.5; } else o.arc = Math.round(Math.min(1.5, p.arc * T.ARC) * 100) / 100;
    return o;
  });
}
const withPart = (parts, type, test) => { const s = slotsFor(type, parts).filter(test).sort((a, b) => a.x - b.x)[0]; return s ? s.apply(parts) : parts; };
// SNIPER: two long guns and a mortar (and a lookout to spot for it), and a mine layer in the belly. BRAWLER: grapeshot on the sponsons and flak on the nest. RAM: a ram prow, a harpoon and grapeshot.
const sniperParts = () => withPart(retype(retype(retype(BUILDS.classic, 'Nose Gun', 'long'), 'Tail Gun', 'long'), 'Dorsal Gun', 'mortar'), 'mineLayer', (s) => s.p === 'lower' && s.x > 700);
const brawlerParts = () => retype(retype(retype(BUILDS.classic, 'Fore Sponson', 'scatter'), 'Aft Sponson', 'scatter'), 'Dorsal Gun', 'flak');
const ramParts = () => withPart(retype(retype(retype(BUILDS.classic, 'Nose Gun', 'harpoon'), 'Fore Sponson', 'scatter'), 'Aft Sponson', 'scatter'), 'ramProw', (s) => s.p === 'main');

// FIREBRAND (flame.js): the classic ship with a flamethrower on the bow of her top deck and another in a port at the bow of the lower deck (she gives up the ventral and aft dorsal guns for the weight), riveted
// plate on the fore end of the main deck (armour does not burn) and a ram prow; a third in a port of the main deck when she can carry it. A short-range ship: she wants to close in, ram, burn and board.
const firebrandParts = () => {
  const lighter = (p) => p.filter((q) => !(q.part === 'gun' && ['Ventral Gun', 'Aft Dorsal Gun'].includes(q.n)));
  const port = (p, deck) => { const s = slotsFor('gun_flame', p).filter((q) => q.p === deck).sort((a, b) => b.x - a.x)[0]; return s ? s.apply(p) : p; }; // (the bow-most port of a deck)
  const bowPort = (p) => port(p, 'lower');
  const plated = (p) => { const s = slotsFor('armour', p).filter((q) => q.p === 'main').sort((a, b) => b.x - a.x)[0]; return s ? s.apply(p) : p; };
  const rammed = (p) => withPart(p, 'ramProw', (s) => s.p === 'main');
  const base = bowPort(lighter(retype(BUILDS.classic, 'Nose Gun', 'flame')));
  // (the best she can carry: the third burner, then all but that, then no ram, then no plate - the heavier the nose, the less the bags lift)
  const tries = [rammed(plated(port(base, 'main'))), rammed(plated(base)), plated(base), rammed(base), base];
  return tries.find((p) => { try { return validate(p).ok; } catch (e) { return false; } }) || base;
};

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
  const key = seed + '|' + config.PVP.TONNAGE + '|' + config.PVP.SHELF.RANDOM + '|' + !!config.PVP.SHELF.CROSS + '|' + !!config.PVP.SHELF.RANGE;
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
  if (config.PVP.SHELF.RANGE) { // (last but for the barge, so the seeded variants keep their places)
    add(entry('sniper', 'Sniper', 'Two long guns, a mortar and a mine layer', sniperParts()));
    add(entry('brawler', 'Brawler', 'Grapeshot sponsons and a flak gun', brawlerParts()));
    add(entry('ram', 'Ram', 'A ram prow, a harpoon and grapeshot', ramParts()));
    add(entry('firebrand', 'Firebrand', 'Flamethrowers, armour plate and a ram prow', firebrandParts()));
  }
  if (config.PVP.SHELF.CROSS) add(entry('barge', "Boarder's Barge", 'A crew cannon, sandbags and a towline', bargeParts())); // (B.6, dev: host.html?versus=1&cross=1 - last on the shelf, so the others keep their places)
  cache.set(key, shelf);
  return shelf;
}
