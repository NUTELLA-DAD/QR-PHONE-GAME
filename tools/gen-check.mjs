// THE SHIP GENERATOR gate (public/modules/host/shipGen.js, tools/shipforge.mjs). Headless.
//   node tools/buildsim.mjs --check-gen        or directly:   node tools/gen-check.mjs [--ships 200] [--flights 10] [--seed 1]
//
//   (a) 200 generated ships (every theme, and "any"): every one validates with no FAIL, is under the Versus weight cap, has a name and a one-line summary, and the whole set is varied
//   (b) it is seeded: the same seed makes the same ship, another seed another; a genome builds back into exactly the parts it was made with
//   (c) the evolution operators: crossover and mutation children repair into valid ships under the cap, nearly always
//   (d) 10 of them fly a one-minute botsim (child processes, five at a time) with 0 errors
//   (e) two of them fight a Versus round, in two environments, with 0 errors
//   (f) the Versus shelf: the Hall of Fame ships (pvp/champions.js) validate under the cap, the Surprise me! card gives each team its own fresh random ship
//   (g) the part statistics machinery of the forge: tags of a ship, the role / summary text
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : Number(argv[i + 1]); };
const nShips = flag('ships', 200), nFlights = flag('flights', 10), seed0 = flag('seed', 1);
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
seedRandom(seed0);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const Gen = await load('modules/host/shipGen.js');
const { validate } = await load('modules/host/buildCheck.js');
const { budgets, BUILDS } = await load('modules/host/shipBuild.js');
const { buildShelf, tonnageCap, surpriseShip } = await load('modules/host/pvp/shelf.js');
const { CHAMPIONS } = await load('modules/host/pvp/champions.js');
const { playGame } = await import(pathToFileURL(path.join(here, 'forge-game.mjs')).href);
const cap = tonnageCap();

// ---- (a) 200 ships ----
const t0 = Date.now();
const ships = [];
let nulls = 0;
for (let i = 0; i < nShips; i++) {
  const theme = i % (Gen.THEMES.length + 1) === Gen.THEMES.length ? undefined : Gen.THEMES[i % Gen.THEMES.length];
  const s = Gen.generateShip(seed0 * 1000 + i, { theme, cap });
  if (!s) { nulls++; continue; }
  ships.push(s);
}
const secs = (Date.now() - t0) / 1000;
const bad = [];
for (const s of ships) {
  const v = validate(s.parts);
  const m = Math.round(budgets(s.parts).mass);
  if (!v.ok) bad.push(`${s.name} (${s.theme}): FAIL ${v.fails[0]}`);
  else if (m > cap) bad.push(`${s.name}: weighs ${m}, cap ${cap}`);
  else if (!s.name || !s.summary || s.name.length > config.SHIPGEN.NAME_MAX) bad.push(`${s.name}: name or summary`);
}
report(nulls === 0 && ships.length === nShips, `${ships.length} of ${nShips} seeds made a ship (${nulls} gave up) in ${secs.toFixed(1)} s`);
report(bad.length === 0, `every generated ship validates with no FAIL and weighs ${cap} or less${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
const themes = new Set(ships.map((s) => s.theme));
const warnAvg = ships.reduce((n, s) => n + s.warns, 0) / Math.max(1, ships.length), massAvg = ships.reduce((n, s) => n + s.mass, 0) / Math.max(1, ships.length);
const retried = ships.filter((s) => s.attempts > 1).length;
report(Gen.THEMES.every((t) => themes.has(t)), `all ${Gen.THEMES.length} themes appear (${[...themes].join(', ')}); mean weight ${massAvg.toFixed(0)}, mean warnings ${warnAvg.toFixed(1)}, ${retried} needed a second genome`);
const distinct = new Set(ships.map((s) => JSON.stringify(s.parts))).size, names = new Set(ships.map((s) => s.name)).size;
const roles = new Set(ships.map((s) => s.summary.split(' with ')[0]));
report(distinct === ships.length && names >= ships.length * 0.45 && roles.size >= 8, `the set is varied: ${distinct} different ships, ${names} different names, ${roles.size} different roles (${[...roles].slice(0, 5).join(', ')} ...)`);
const tagCount = {};
for (const s of ships) for (const t of s.tags) tagCount[t] = (tagCount[t] || 0) + 1;
const rare = Gen.TAG_LIST.filter((t) => !(tagCount[t] >= 3));
report(rare.length <= 3, `every notable part turns up on 3+ ships${rare.length ? ' (rare: ' + rare.join(', ') + ')' : ''}: ${Gen.TAG_LIST.filter((t) => tagCount[t]).length} of ${Gen.TAG_LIST.length} tags seen`);
{
  const { hijacks } = await load('modules/host/partsShop.js');
  const { buildLayout } = await load('modules/host/shipBuild.js');
  const hij = ships.map((s) => hijacks(buildLayout(s.parts)));
  const some = hij.filter((h) => h > 0).length;
  report(some <= ships.length * 0.1, `stations stay workable: ${some} of ${ships.length} ships have a rack, vent, extinguisher or steam valve within 80 px of a station (the classic ship has ${hijacks(buildLayout(BUILDS.classic))}; a random ship without this rule has about 8)`);
}
console.log('  e.g. ' + ships.slice(0, 5).map((s) => `${s.name} (${s.mass}): ${s.summary}`).join(' | '));

// ---- (b) seeded ----
{
  const a = Gen.generateShip(77, { theme: 'kiter', cap }), b = Gen.generateShip(77, { theme: 'kiter', cap }), c = Gen.generateShip(78, { theme: 'kiter', cap });
  report(a && b && JSON.stringify(a.parts) === JSON.stringify(b.parts) && a.name === b.name && a.summary === b.summary, 'the same seed and theme make the same ship (parts, name, summary)');
  report(a && c && JSON.stringify(a.parts) !== JSON.stringify(c.parts), 'another seed makes another ship');
  const g = ships[3];
  const again = Gen.buildGenome(g.genome);
  report(again && JSON.stringify(again) === JSON.stringify(g.parts), 'a genome builds back into exactly the parts it was made with');
  const run1 = ships.slice(0, 5).map((s) => s.name).join(), run2 = Array.from({ length: 5 }, (_, i) => Gen.generateShip(seed0 * 1000 + i, { theme: Gen.THEMES[i % Gen.THEMES.length], cap }).name).join();
  report(run1 === run2, 'a second pass over the same seeds gives the same names');
}

// ---- (c) evolution operators ----
{
  const rng = Gen.makeRng(99);
  let made = 0, tried = 0, invalid = 0, over = 0;
  for (let i = 0; i < 80; i++) {
    const a = ships[rng.int(0, ships.length - 1)], b = ships[rng.int(0, ships.length - 1)];
    const g = i % 2 ? Gen.crossGenome(a.genome, b.genome, rng) : Gen.mutateGenome(a.genome, rng);
    tried++;
    const r = Gen.repairedChild(g, rng, cap);
    if (!r) continue;
    made++;
    if (!validate(r.parts).ok) invalid++;
    if (Math.round(budgets(r.parts).mass) > cap) over++;
  }
  report(made >= tried * 0.85 && invalid === 0 && over === 0, `crossover and mutation: ${made} of ${tried} children came out valid after repair (85% needed), ${invalid} invalid, ${over} over the cap`);
}

// ---- (d) botsim flights ----
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gen-check-'));
  const picks = Array.from({ length: nFlights }, (_, i) => ships[Math.floor((i * ships.length) / nFlights)]);
  const results = [];
  const fly = (s, i) => new Promise((resolve) => {
    const f = path.join(dir, `ship${i}.json`);
    fs.writeFileSync(f, JSON.stringify(s.parts));
    const c = spawn(process.execPath, [path.join(here, 'botsim.mjs'), '--build', f, '--minutes', '1', '--seed', String(seed0 + i)]);
    let out = '';
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
    c.on('close', () => { const m = /errors: (\d+)/.exec(out); resolve({ name: s.name, errors: m ? Number(m[1]) : -1, tail: out.slice(-200) }); });
  });
  let next = 0;
  await Promise.all(Array.from({ length: 5 }, async () => { while (next < picks.length) { const i = next++; results[i] = await fly(picks[i], i); } }));
  fs.rmSync(dir, { recursive: true, force: true });
  const badFlights = results.filter((r) => r.errors !== 0);
  report(badFlights.length === 0, `${picks.length} generated ships fly a 1-minute botsim with 0 errors (${picks.map((s) => s.theme).join(', ')})${badFlights.length ? ' - trouble: ' + badFlights.map((r) => r.name + ' ' + r.errors + ' ' + r.tail).join(' || ') : ''}`);
}

// ---- (e) a Versus round ----
{
  let errs = 0, first = '';
  const pairs = [[ships[1], ships[2], 'skyisles'], [ships[5], BUILDS.classic, 'storm']];
  for (const [a, b, env] of pairs) {
    const r = playGame({ red: a.parts, blue: b.parts || b, env, seed: seed0 + 5, cap: 120, bots: 4 });
    errs += r.errors; if (r.firstError && !first) first = r.firstError;
  }
  report(errs === 0, `two generated ships fight Versus rounds (skyisles, storm) with 0 errors${errs ? ': ' + first : ''}`);
}

// ---- (f) the shelf ----
{
  const shelf = buildShelf();
  const sur = shelf.find((e) => e.random);
  report(!!sur && shelf[shelf.length - 1] === sur && sur.id === 'surprise', 'the Versus shelf ends with the Surprise me! card');
  const a = surpriseShip(1234), b = surpriseShip(1235);
  report(a && b && a.mass <= cap && b.mass <= cap && a.name !== b.name && JSON.stringify(a.parts) !== JSON.stringify(b.parts), `Surprise me! makes a different valid ship for each seed (${a && a.name}, ${b && b.name}), under the cap ${cap}`);
  const champs = shelf.filter((e) => e.id.startsWith('hof-'));
  report(champs.length === Math.min(config.PVP.SHELF.CHAMPIONS, CHAMPIONS.length) && champs.every((e) => e.mass <= cap), `${champs.length} Hall of Fame ships are on the shelf, under the cap (${CHAMPIONS.length} in pvp/champions.js)${champs.length ? ': ' + champs.map((e) => e.name).join(', ') : ''}`);
  const bad2 = CHAMPIONS.filter((c) => !validate(c.parts).ok || Math.round(budgets(c.parts).mass) > cap).map((c) => c.name);
  report(bad2.length === 0, `every champion in pvp/champions.js validates and fits the cap${bad2.length ? ': ' + bad2.join(', ') : ''}`);
  // the vote option of the surprise card hides its numbers, and picking it makes a team's ship
  const sim = (await load('modules/host/simulation.js')).createSimulation();
  sim.setSession('versus');
  const M = sim.match;
  M.addBots('red', 2); M.addBots('blue', 2);
  M.begin({ shelf: true });
  const idx = M.shelf.findIndex((e) => e.random);
  report(idx >= 0 && /surprise/.test(sim.state.vote.options[idx].desc), 'the shelf vote shows the Surprise card without numbers');
  M.applyPicks({ red: idx, blue: idx });
  const [r, b2] = sim.state.ships;
  report(r.buildId.startsWith('surprise-') && b2.buildId.startsWith('surprise-') && r.buildId !== b2.buildId && r.name !== b2.name, `both teams picked Surprise me! and got their own ships (${r.name} / ${b2.name})`);
}

// ---- (g) the forge's helpers ----
{
  const t = Gen.tagsOf(BUILDS.classic);
  report(Array.isArray(t) && t.includes('bomb bay') !== undefined && Gen.roleOf(BUILDS.classic).length > 3 && Gen.describeShip(BUILDS.classic).length > 10, `tags, role and summary work on any ship (the classic ship: "${Gen.describeShip(BUILDS.classic)}")`);
}

console.log(ok ? 'GEN GATE: PASS' : 'GEN GATE: FAIL');
process.exit(ok ? 0 : 1);
