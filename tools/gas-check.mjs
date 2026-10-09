// GAS TYPES gate (catalogue v2 Tier 1; public/modules/host/gases.js, hydrogen.js, gasBags.js, fireModel.js, config.GASES). Headless.
//   node tools/buildsim.mjs --check-gas        or directly:   node tools/gas-check.mjs [--seed 1] [--quick 1]
//
//   (a) THE NUMBERS (pure): a bag's gas scales its lift (hydrogen x1.3, hot air x0.6, helium exactly as before: no field in the layout, the classic ship unchanged); a heavy build that FAILS the LIFT gauge on
//       helium flies on hydrogen; the validator says what each bag holds (INFO) and WARNs for hydrogen beside a boiler / coal / flamethrower and for hot air with no boiler; the edit (setGas) round-trips
//   (b) HOT AIR: the burner follows the boiler (a cold boiler: its heat falls, the lift made of the gas falls, she sinks; stoked again it recovers); helium and hydrogen ignore the heat
//   (c) HYDROGEN IN FLIGHT: a fire under the bag scorches it (about 5 s), it lights, burns its fuse and explodes: the bag tears away (a many-bag ship) or is ripped open (her only bag), fires start under it, the crew
//       near it lose hearts, the hull is hurt, a touching hydrogen bag catches too; a fire put out in time cools off; a flamethrower's cone and a lucky hit can light it; an empty bag cannot burn; a nearly flat one
//       fizzles; a HELIUM bag under the same fire never lights
//   (d) THE DOCK: top-up price by gas (helium dearest, hot air free), the convert card (heavy ship -> hydrogen, hydrogen ship -> helium) bought through a real dock vote
//   (e) THE BOTS: they put out a fire under a hydrogen bag, stoke a cooling hot-air bag; 2-minute botsim of each gas (and a mix) with a forced boiler blowout: 0 errors
//   (f) THE TV: the blueprint (tints, the red H2 stencil, the hot-air patches and burner) and the ship (scorched, alight, the burner) draw on a stub canvas with 0 errors
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const seed = Number(flag('seed', 1));
const quick = Number(flag('quick', 0)) > 0;
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed);
// a tiny stub canvas for the TV checks
const rec = { texts: [], calls: 0 };
const stubCtx = () => {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const t = { imageSmoothingQuality: 'low', font: '10px x', textAlign: 'left', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      switch (k) {
        case 'getTransform': return () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });
        case 'setTransform': return (a, b, c, d, e, f) => { m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; };
        case 'resetTransform': return () => { m = [1, 0, 0, 1, 0, 0]; };
        case 'save': return () => { stack.push(m.slice()); };
        case 'restore': return () => { if (stack.length) m = stack.pop(); };
        case 'translate': return (x, y) => { m = mul(m, [1, 0, 0, 1, x, y]); };
        case 'scale': return (x, y) => { m = mul(m, [x, 0, 0, y, 0, 0]); };
        case 'rotate': return (a) => { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); };
        case 'transform': return (a, b, c, d, e, f) => { m = mul(m, [a, b, c, d, e, f]); };
        case 'measureText': return (s) => ({ width: String(s).length * 9 });
        case 'getImageData': return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)) });
        case 'createImageData': return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
        case 'createLinearGradient': case 'createRadialGradient': case 'createPattern': case 'createConicGradient': return () => ({ addColorStop() {} });
        case 'isPointInPath': case 'isPointInStroke': return () => false;
        case 'fillText': case 'strokeText': return (s) => { rec.texts.push(String(s)); };
        default: return () => { rec.calls++; };
      }
    },
    set(o, k, v) { o[k] = v; return true; },
  });
};
globalThis.document = {
  fonts: { check: () => true, load: () => Promise.resolve() },
  createElement: () => { const c = { width: 0, height: 0, style: {}, getContext: () => (c.c ||= stubCtx()) }; return c; },
};
globalThis.Path2D = class { constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); } };
globalThis.fetch = async () => ({ json: async () => [] });

const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS, buildLayout, bagLift } = await load('modules/host/shipBuild.js');
const { validate, liftGauge } = await load('modules/host/buildCheck.js');
const { applyBuild } = await load('shipLayout.js');
const BE = await load('modules/host/buildEdit.js');
const GA = await load('modules/host/gases.js');
const GB = await load('modules/host/gasBags.js');
const FM = await load('modules/host/fireModel.js');
const HE = await load('modules/host/health.js');
const PS = await load('modules/host/partsShop.js');
const { blueprintView, drawBlueprint } = await load('modules/host/blueprintArt.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');
const { loadBuild } = await import(pathToFileURL(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'buildload.mjs')).href);

const G = config.GASES, H = G.HYDROGEN;
const SAVED = JSON.stringify(config.GASES.HYDROGEN);
const restore = () => { Object.assign(config.GASES.HYDROGEN, JSON.parse(SAVED)); }; // (in place: the sims read config.GASES.HYDROGEN)
const noFrame = (parts) => JSON.stringify(parts.filter((p) => p.part !== 'frame')); // (an edit re-derives the frame's outline samples)
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const errors = [];
const errs = () => (globalThis.gameErrors || []).length;
const secs = (s) => Math.round(s * 60);

function boot({ bots = 0, parts = null, startBuild = null } = {}) {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(seed);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  const st = sim.state;
  if (startBuild) sim.setStartBuild(startBuild);
  if (parts) sim.fitShip(parts, 'yard');
  const ours = st.ships[0];
  const e = ours.layout.boarderEntryPoints;
  for (let i = 0; i < bots; i++) {
    const id = 'bot' + i;
    st.players[id] = { id, bot: true, human: false, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[i % config.CREW_SPECIES.length], color: colors[i % colors.length], x: e[0].x + 25 * i, y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
  }
  sim.castOff();
  return { sim, st, ours, L: ours.layout };
}
function step(sim, n = 1, each = null) {
  for (let i = 0; i < n; i++) {
    clock.ms += DT * 1000;
    try { sim.update(DT); } catch (e) { errors.push(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e)); if (errors.length > 4) throw e; }
    if (each && each(i) === 'stop') break;
  }
}
const until = (sim, cond, maxSteps) => { let n = 0; while (!cond() && n++ < maxSteps) step(sim); return n; };
const deckIndex = (L, id) => L.platforms.findIndex((q) => q.id === id);
const finite = (st) => [st.ship.gas, st.ship.alt, st.ship.vy, st.ship.hull].every(Number.isFinite);

const classic = BUILDS.classic;
const hydrogenParts = BE.setGas(classic, { gas: 'hydrogen' }).parts;
const heavy = [...classic.map((p) => ({ ...p })), ...[60, 300, 560, 1040, 1300, 1540].map((x) => ({ part: 'ballast', p: 'lower', x, hang: true }))];
const bagsParts = await loadBuild('bags', BUILDS);
const mixParts = BE.setGas(BE.setGas(bagsParts, { bag: 1, gas: 'hydrogen' }).parts, { bag: 2, gas: 'hydrogen' }).parts; // (bags 2 and 3, touching, under the crow's nest and the top deck)

// ---------------------------------------------------------------- (a) the numbers
{
  const Lc = buildLayout(classic), Lh = buildLayout(hydrogenParts), Lo = buildLayout(BE.setGas(classic, { gas: 'hot' }).parts);
  report(!('gasType' in Lc.gasbags[0]) && !('gasType' in Lc.gasbag) && Lc.gasbags[0].lift === 149 && GA.gasKey(Lc.gasbags[0]) === 'helium', 'the classic ship has no gas field (helium is the default) and her bag lifts 149 as ever');
  report(Math.abs(Lh.gasbags[0].lift - 149 * G.hydrogen.lift) <= 1 && Math.abs(Lo.gasbags[0].lift - 149 * G.hot.lift) <= 1, `hydrogen lifts ${Lh.gasbags[0].lift} (x${G.hydrogen.lift}), hot air ${Lo.gasbags[0].lift} (x${G.hot.lift}) against helium's 149`);
  const lg = liftGauge(classic), lh = liftGauge(hydrogenParts), lo = liftGauge(BE.setGas(classic, { gas: 'hot' }).parts);
  report(lh.lift > lg.lift && lh.hover < lg.hover && lo.lift < lg.lift && lo.hover > lg.hover, `the LIFT gauge follows the gas: hover ${lg.hover} on helium, ${lh.hover} on hydrogen, ${lo.hover} on hot air`);
  const vHe = validate(heavy), vH2 = validate(BE.setGas(heavy, { gas: 'hydrogen' }).parts);
  report(!vHe.ok && vHe.fails.some((t) => /too heavy/.test(t)) && vH2.ok && liftGauge(BE.setGas(heavy, { gas: 'hydrogen' }).parts).level !== 'FAIL', `a heavy build (6 sandbags) cannot fly on helium (hover ${liftGauge(heavy).hover}: FAIL) but flies on hydrogen (hover ${liftGauge(BE.setGas(heavy, { gas: 'hydrogen' }).parts).hover})`);
  const vh = validate(hydrogenParts);
  report(vh.ok && vh.checks.some((c) => c.group === 'Gas' && c.level === 'INFO' && /hydrogen/.test(c.text)) && !validate(classic).checks.some((c) => c.group === 'Gas'), 'the validator says what the hydrogen bag holds (INFO) and says nothing about gas on the classic (helium) ship');
  const vmix = validate(mixParts);
  report(vmix.checks.filter((c) => c.group === 'Gas' && c.level === 'INFO').length === 2, 'each non-helium bag gets its own INFO line (two hydrogen bags: two lines)');
  // hydrogen beside a boiler: move the boiler up to the top deck under the bag
  const hot = hydrogenParts.map((p) => (p.part === 'station' && p.kind === 'boiler' ? { ...p, p: 'catwalk', x: 800 } : { ...p }));
  const vb = validate(hot), vbHe = validate(BE.setGas(hot, { gas: 'helium' }).parts);
  report(vb.warns.some((t) => /explosion risk/.test(t) && /Boiler/.test(t)) && !vbHe.warns.some((t) => /explosion risk/.test(t)), 'hydrogen over a boiler on the top deck WARNs "explosion risk"; the same ship on helium does not');
  const flame = hydrogenParts.map((p) => (p.part === 'gun' && p.n === 'Nose Gun' ? { ...p, gtype: 'flame' } : { ...p }));
  const ex = FM.hydrogenExposure(buildLayout(flame));
  report(ex.some((e) => e.kind === 'flamethrower') && !FM.hydrogenExposure(buildLayout(hydrogenParts)).length, `a flamethrower on the top deck under a hydrogen bag is an exposure (${ex.map((e) => e.kind + ' ' + e.name).join(', ') || 'none'}); the plain hydrogen classic has none (her coal and boiler are two decks down)`);
  const noBoiler = BE.setGas(classic.filter((p) => !(p.part === 'station' && p.kind === 'boiler')), { gas: 'hot' }).parts;
  report(validate(noBoiler).warns.some((t) => /hot-air bag but no boiler/.test(t)), 'a hot-air bag with no boiler WARNs');
  const back = BE.setGas(hydrogenParts, { gas: 'helium' });
  report(back.ok && noFrame(back.parts) === noFrame(classic) && !BE.setGas(classic, { gas: 'helium' }).ok && !BE.setGas(classic, { gas: 'neon' }).ok, 'setGas round-trips (helium again = the classic parts exactly), refuses a no-op and an unknown gas');
  const four = BE.setGas(bagsParts, { gas: 'hydrogen', all: true }).parts, one = BE.setGas(bagsParts, { bag: 2, gas: 'hot' }).parts;
  report(four.filter((p) => p.part === 'gasbag').every((p) => p.gasType === 'hydrogen') && one.filter((p) => p.part === 'gasbag').map((p) => p.gasType || 'helium').join() === 'helium,helium,hot,helium', 'setGas acts on every bag ("every bag") or on one bag by number');
  const hotMass = validate(BE.setGas(classic, { gas: 'hot' }).parts).budgets.lift.mass - validate(classic).budgets.lift.mass;
  report(Math.abs(hotMass - G.hot.mass) < 0.01, `the hot-air burner weighs ${G.hot.mass} (hydrogen and helium nothing)`);
}
// the dock prices
{
  const base = config.SHOP.REPAIR_GAS;
  const lay = (parts) => buildLayout(parts).gasbags;
  report(PS.gasTopUpCost(lay(classic), base) === base && PS.gasTopUpCost(lay(hydrogenParts), base) < base && PS.gasTopUpCost(lay(BE.setGas(classic, { gas: 'hot' }).parts), base) === 0, `the dock top-up: helium ${PS.gasTopUpCost(lay(classic), base)} (as ever), hydrogen ${PS.gasTopUpCost(lay(hydrogenParts), base)}, hot air ${PS.gasTopUpCost(lay(BE.setGas(classic, { gas: 'hot' }).parts), base)}`);
  report(PS.gasTopUpCost(lay(mixParts), base) > 0 && PS.gasTopUpCost(lay(mixParts), base) < base, 'a mixed ship pays in between');
  const o1 = PS.gasOffer(heavy), o2 = PS.gasOffer(hydrogenParts), o3 = PS.gasOffer(classic);
  report(o1 && o1.to === 'hydrogen' && o2 && o2.to === 'helium' && !o3, `the convert card: a heavy ship is offered hydrogen ("${o1 && o1.name}"), a hydrogen ship helium ("${o2 && o2.name}"), the light classic ship nothing`);
}

// ---------------------------------------------------------------- (b) hot air
{
  const parts = await loadBuild('hotair', BUILDS);
  const run = (cold, bots = 0) => {
    const { sim, st } = boot({ parts, bots });
    step(sim, secs(4));
    const warm = st.hotAir.heat;
    step(sim, secs(24), () => { st.ship.gas = 60; if (cold) { st.ship.fuel = 0; st.ship.press = 0; } }); // (the same gas in both: only the burner differs)
    return { sim, st, warm, heat: st.hotAir.heat, lg: GB.liftGas(st), gas: st.ship.gas, vy: st.ship.vy, buoy: st.buoyancy, alt: st.ship.alt };
  };
  const hotRun = run(false), coldRun = run(true);
  report(hotRun.st.hotAir.n === 1 && hotRun.st.bags[0].type === 'hot' && hotRun.warm > 0.95 && hotRun.heat > 0.95, `hot air with a working boiler stays hot (heat ${hotRun.heat.toFixed(2)})`);
  report(coldRun.heat < 0.55 && coldRun.lg < coldRun.gas - 5 && coldRun.buoy === -1 && hotRun.buoy === 1 && coldRun.vy < hotRun.vy - 20, `a cold boiler: the burner cools to ${coldRun.heat.toFixed(2)}, the gas her lift is made of falls (${coldRun.lg.toFixed(1)} of ${coldRun.gas.toFixed(1)}) and she sinks (climb ${coldRun.vy.toFixed(0)} px/s against ${hotRun.vy.toFixed(0)} when hot)`);
  report(coldRun.st.gasStats.hotCold >= 1 && coldRun.st.ev.warnText !== undefined, 'the TV is told once: HOT AIR COOLING');
  const { sim, st } = boot({ parts });
  step(sim, secs(2));
  step(sim, secs(20), () => { st.ship.fuel = 0; st.ship.press = 0; });
  const low = st.hotAir.heat;
  step(sim, secs(12), () => { st.ship.fuel = 80; st.ship.press = 70; });
  report(low < 0.6 && st.hotAir.heat > low + 0.4, `stoked again the heat recovers (${low.toFixed(2)} -> ${st.hotAir.heat.toFixed(2)})`);
  const he = boot({ parts: classic }), h2 = boot({ parts: hydrogenParts });
  step(he.sim, secs(2)); step(h2.sim, secs(2));
  const hh = (b) => { step(b.sim, secs(10), () => { b.st.ship.fuel = 0; b.st.ship.press = 0; }); return b.st.hotAir.n === 0 && GB.liftGas(b.st) === b.st.ship.gas; };
  report(hh(he) && hh(h2), 'helium and hydrogen ships ignore the burner: no hot-air bag, the lift gas is exactly state.ship.gas even with a cold boiler');
}

// ---------------------------------------------------------------- (c) hydrogen in flight
{
  const light = (b, x = 800, id = 'catwalk') => b.ours.sim.fireSys.ignite(deckIndex(b.L, id), x, 'hit');
  // --- the classic ship's single hydrogen bag, with a hand aboard on the top deck
  const b = boot({ parts: hydrogenParts });
  const { sim, st, L } = b;
  const cat = deckIndex(L, 'catwalk');
  step(sim, secs(2)); // (no crew aboard: nobody puts the fire out, and her autopilot pumps by itself)
  const hull0 = st.ship.hull;
  const f = light(b);
  step(sim, 5);
  report(f && f.h2 === true && st.bags[0].scorch > 0 && st.bags[0].burn === 0, `a fire under the hydrogen bag is marked for the bots (h2) and starts scorching it (scorch ${st.bags[0].scorch.toFixed(2)})`);
  const tLit = until(sim, () => st.bags[0].burn > 0, secs(14)) / 60 + 5 / 60;
  report(st.bags[0].burn > 0 && tLit > 2.5 && tLit < 9, `it is ALIGHT after ${tLit.toFixed(1)} s with the one fire`);
  const gas0 = st.bags[0].gas;
  const tBoom = until(sim, () => st.gasStats.exploded > 0, secs(H.FUSE + 2)) / 60;
  report(st.gasStats.exploded === 1 && Math.abs(tBoom - H.FUSE) < 1.2 && st.bags[0].gas < gas0 - 5, `it burns for its ${H.FUSE} s fuse (${tBoom.toFixed(1)} s, venting gas ${gas0.toFixed(0)} -> ${st.bags[0].gas.toFixed(0)}) and EXPLODES`);
  step(sim, 2);
  report(st.gasHoles.length >= config.GAS.MAX_HOLES - 1 && (st.bags[0].gas < 3 || st.ballastCd > 0) && st.fires.some((q) => q.big) && L.gasbags.length === 1, 'her only bag cannot tear away: she is ripped open (holes, no gas: the emergency ballast drops) and big fires burn under it');
  report(st.ship.hull < hull0 - 1, `the blast cost hull (${(hull0 - st.ship.hull).toFixed(0)})`);
  step(sim, secs(2));
  report(st.gasStats.exploded === 1 && st.gasStats.lit === 1 && finite(st) && st.bags[0].burn === 0, 'a burnt-out bag does not light again at once; nothing went NaN');

  // --- the crew near the bag when it goes: two bots held on the top deck under it lose hearts (the bag is lit directly: bots would put a fire out)
  const w = boot({ parts: hydrogenParts, bots: 2 });
  const wcat = deckIndex(w.L, 'catwalk');
  const hold = () => { for (const p of Object.values(w.st.players)) { p.x = 800; p.d = wcat; p.y = w.L.platforms[wcat].y; p.fall = false; p.conn = null; p.fly = false; p.air = false; p.jx = 0; p.jy = 0; } };
  step(w.sim, secs(2), hold);
  const crew = Object.values(w.st.players), heartsBefore = crew.reduce((n, p) => n + HE.hearts(p), 0);
  w.ours.sim.hydrogen.light(0);
  step(w.sim, secs(H.FUSE + 0.5), hold);
  report(w.st.gasStats.exploded === 1 && crew.reduce((n, p) => n + HE.hearts(p), 0) < heartsBefore, `two crew on the top deck under the bag lost hearts in the blast (${heartsBefore} -> ${crew.reduce((n, p) => n + HE.hearts(p), 0)})`);

  // --- the same fire under a HELIUM bag
  const c = boot({ parts: classic });
  step(c.sim, secs(2)); light(c);
  step(c.sim, secs(20));
  report(c.st.fires.length > 0 && c.st.bags[0].scorch === 0 && c.st.bags[0].burn === 0 && !c.st.fires.some((q) => q.h2) && c.st.gasStats.exploded === 0, 'the same fire for 20 s under a HELIUM bag: no scorch, no mark, nothing');

  // --- a fire put out in time cools off
  const d = boot({ parts: hydrogenParts });
  step(d.sim, secs(2)); light(d);
  step(d.sim, secs(3));
  const peak = d.st.bags[0].scorch;
  d.st.fires.length = 0;
  step(d.sim, secs(12));
  report(peak > 0.3 && peak < 1 && d.st.bags[0].scorch < 0.05 && d.st.gasStats.lit === 0, `a fire put out after 3 s (scorch ${peak.toFixed(2)}) lets the bag cool again (${d.st.bags[0].scorch.toFixed(2)}) and it never lights`);

  // --- a flamethrower's cone, a lucky hit, an empty bag, a nearly flat bag
  const e = boot({ parts: hydrogenParts });
  step(e.sim, secs(2));
  e.ours.sim.hydrogen.scorch(0, 0.5);
  const half = e.st.bags[0].scorch;
  e.ours.sim.hydrogen.scorch(0, 0.6);
  report(half === 0.5 && e.st.bags[0].burn > 0, 'a flamethrower\'s cone adds scorch and lights the bag at 1');
  const g2 = boot({ parts: hydrogenParts });
  step(g2.sim, secs(2));
  H.HIT_IGNITE = 1;
  g2.ours.sim.impact && g2.ours.sim.hydrogen.hit(0, 1);
  const hitLit = g2.st.bags[0].burn > 0;
  restore();
  report(hitLit, 'a shell into the bag can light it (chance GASES.HYDROGEN.HIT_IGNITE per point of power)');
  const g3 = boot({ parts: hydrogenParts });
  step(g3.sim, secs(2));
  g3.st.bags[0].gas = 5; light(g3);
  step(g3.sim, secs(10), () => { g3.st.bags[0].gas = 5; }); // (a crewless ship pumps by itself: hold it empty)
  report(g3.st.bags[0].scorch === 0 && g3.st.gasStats.scorched === 0, 'a bag with almost no gas has nothing left to burn');

  // --- many bags: the burning one tears away, the touching one catches (chain), the helium one is untouched
  H.CHAIN = 1;
  const m = boot({ parts: mixParts });
  const { sim: ms, st: mst, L: mL } = m;
  const mcat = deckIndex(mL, 'catwalk');
  const hand = { id: 'h2', bot: false, human: true, name: 'Hand', species: config.CREW_SPECIES[0], color: '#fff', x: 520, d: mcat, y: mL.platforms[mcat].y, fall: false, jx: 0, jy: 0, t: 0, connected: true };
  mst.players.h2 = hand;
  step(ms, secs(2));
  const hA = HE.hearts(hand), nBags = mL.gasbags.length, types = mst.bags.map((q) => q.type).join('/');
  m.ours.sim.fireSys.ignite(mcat, 500, 'hit');
  step(ms, 5);
  report(mst.fires.some((q) => q.h2) && mst.bags[1].scorch > 0 && mst.bags[0].scorch === 0 && mst.bags[3].scorch === 0, `with bags ${types}, a fire under bag 2 scorches that bag only (the tail bag and the helium bag stay cold)`);
  until(ms, () => mst.gasStats.exploded >= 1, secs(14));
  step(ms, 2);
  report(mst.gasStats.exploded >= 1 && mL.gasbags.length === nBags - 1 && mst.breakStats.bag >= 1, `bag 2 EXPLODES and tears away through the break-off (${nBags} bags -> ${mL.gasbags.length}); the ledger counts it`);
  report(mst.fires.some((q) => q.big) && HE.hearts(hand) < hA, `big fires start under the blast and the hand on the deck lost hearts (${hA} -> ${HE.hearts(hand)})`);
  until(ms, () => mst.gasStats.exploded >= 2, secs(5));
  step(ms, 2);
  report(mst.gasStats.chained === 1 && mst.gasStats.exploded === 2 && mL.gasbags.length === nBags - 2, `the touching hydrogen bag caught (chain) and went too (${mL.gasbags.length} bags left: ${mst.bags.map((q) => q.type).join('/')})`);
  step(ms, secs(15));
  report(finite(mst) && mst.bags.every((q) => q.burn === 0) && errors.length === 0, 'she flies on with what is left: nothing NaN, no errors');
  restore();

  // --- a nearly flat bag fizzles (it still tears away)
  const z = boot({ parts: mixParts });
  step(z.sim, secs(2));
  z.st.bags[1].gas = 6; z.ours.sim.hydrogen.light(1, 1);
  const n0 = z.L.gasbags.length;
  step(z.sim, secs(H.FUSE + 2));
  report(z.st.gasStats.fizzled === 1 && z.st.gasStats.exploded === 0 && z.L.gasbags.length === n0 - 1, 'a bag that has burnt down to nothing by the end of the fuse only FIZZLES (no blast) and still tears away');
}

// ---------------------------------------------------------------- (d) the dock
{
  const b = boot({ startBuild: 'sparrow', bots: 3 });
  const { sim, st } = b;
  step(sim, 90);
  const run = st.run;
  const heavySparrow = [...BUILDS.sparrow.map((p) => ({ ...p })), ...[40, 200, 400, 600, 760, 900].map((x) => ({ part: 'ballast', p: 'lower', x, hang: true }))];
  run.build = heavySparrow;
  sim.fitShip(heavySparrow, 'yard');
  const h0 = liftGauge(heavySparrow);
  run.salvage = 900;
  st.yardOnly = null;
  config.PARTS_SHOP.CARD_CHANCE = 0;
  sim.startDock();
  const opts = st.vote && st.vote.options || [];
  const card = opts.find((o) => o.id === 'gas-hydrogen');
  report(!!card && card.gas === 'hydrogen' && card.cost === G.CONVERT.hydrogen && h0.hover > G.OFFER_HOVER, `the dock of a heavy ship (hover ${h0.hover}) offers "${card && card.name}" for ${card && card.cost}`);
  const before = run.salvage;
  for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = opts.indexOf(card); }
  step(sim, 60 * 3);
  const L = st.ships[0].layout;
  report(L.gasbags[0].gasType === 'hydrogen' && run.salvage === before - card.cost && liftGauge(run.build).lift > h0.lift && st.bags[0].type === 'hydrogen', `bought: the bag holds hydrogen (lift ${h0.lift} -> ${liftGauge(run.build).lift}, hover ${h0.hover} -> ${liftGauge(run.build).hover}), ${card.cost} salvage paid, the live bag changed type`);
  report(!st.vote || !st.vote.options || st.vote.options.every((o) => o.id !== 'gas-hydrogen' || o.sold), 'the card shows SOLD');
  st.vote = null; for (const p of Object.values(st.players)) { p.vote = null; p.uk = null; }
  st.ship.gas = 20; // (low enough that the dock offers New Gas)
  run.salvage = 900;
  sim.startDock();
  const o2 = st.vote.options, gasCard = o2.find((o) => o.id === 'repair-gas'), he = o2.find((o) => o.id === 'gas-helium');
  report(gasCard && gasCard.cost < config.SHOP.REPAIR_GAS && /hydrogen cheap/.test(gasCard.desc) && he && he.gas === 'helium', `the next dock: New Gas costs ${gasCard && gasCard.cost} (helium would be ${config.SHOP.REPAIR_GAS}), and a "${he && he.name}" card is offered`);
  for (const p of Object.values(st.players)) { p.voteAt = 1e9; p.vote = o2.indexOf(he); }
  step(sim, 60 * 3);
  report(st.ships[0].layout.gasbags[0].gasType === undefined && st.bags[0].type === 'helium', 'bought: the bag is helium again (no gas field)');
  // the classic ship (no start build) and a light Yard ship get no gas card
  const c = boot({ bots: 2 });
  c.st.run.salvage = 900; c.st.ship.gas = 20;
  c.sim.startDock();
  const o3 = c.st.vote.options;
  report(!o3.some((o) => o.gas) && o3.find((o) => o.id === 'repair-gas').cost === config.SHOP.REPAIR_GAS, 'the classic ship\'s dock has no gas card and New Gas costs exactly what it always did');
  restore(); config.PARTS_SHOP.CARD_CHANCE = 0.55;
}

// ---------------------------------------------------------------- (e) the bots
{
  // bots put out a fire under the hydrogen bag
  let saved = 0;
  const tries = quick ? 2 : 3;
  for (let s = 0; s < tries; s++) {
    seedRandomFor(seed + s);
    const b = boot({ parts: hydrogenParts, bots: 5 });
    step(b.sim, secs(8));
    b.ours.sim.fireSys.ignite(deckIndex(b.L, 'catwalk'), 800, 'hit');
    step(b.sim, secs(22));
    if (b.st.gasStats.lit === 0 && !b.st.fires.some((q) => q.h2)) saved++;
  }
  report(saved >= tries - 1, `bots put out a fire under the hydrogen bag in time (${saved} of ${tries} runs: no ignition, the fire out)`);
  // bots stoke a cooling hot-air burner
  const parts = await loadBuild('hotair', BUILDS);
  const b = boot({ parts, bots: 5 });
  step(b.sim, secs(8));
  b.st.ship.fuel = 5; b.st.ship.press = 20;
  step(b.sim, secs(40));
  report(b.st.ship.fuel > 15 && b.st.hotAir.heat > 0.6, `bots stoke a cooling hot-air ship (coal ${b.st.ship.fuel.toFixed(0)}, heat back to ${b.st.hotAir.heat.toFixed(2)})`);
  report(errors.length === 0 && errs() === 0, 'no errors in the gate\'s own runs' + (errors[0] ? ': ' + errors[0] : ''));
  // 2 minutes of botsim of each gas
  for (const [build, extra] of [['hydrogen', ['--blowout', '25']], ['hotair', ['--blowout', '25']], ['gasmix', ['--blowout', '25']]]) {
    const out = spawnSync(process.execPath, [path.join(publicDir, '..', 'tools', 'botsim.mjs'), '--build', build, '--minutes', quick ? '1' : '2', '--seed', String(seed + 3), '--map', 'open', ...extra], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const line = (out.stdout || '').split('\n').find((l) => l.startsWith('gas:')) || '';
    report(out.status === 0 && /errors: 0/.test(out.stdout || ''), `botsim --build ${build} ${quick ? 1 : 2} min with a forced blowout: 0 errors (${line.replace(/^gas: /, '')})`);
  }
}
function seedRandomFor(n) { clock = seedRandom(n); }

// ---------------------------------------------------------------- (f) the TV
{
  const stub = stubCtx();
  const view = (parts) => { const L = buildLayout(parts); return { L, v: blueprintView(L, 1400, 800, 1) }; };
  let e0 = errs(), drew = true;
  try {
    for (const parts of [classic, hydrogenParts, BE.setGas(classic, { gas: 'hot' }).parts, mixParts]) { const { L, v } = view(parts); drawBlueprint(stub, v, L, { selBag: 0, bagHandles: true }); }
  } catch (err) { drew = false; console.log(err.stack); }
  report(drew && errs() === e0, 'the blueprint draws a helium, a hydrogen (H2 - NO FLAMES), a hot-air and a mixed ship (tints, stencil, patches, burner, a picked bag) with 0 errors');
  rec.texts.length = 0;
  { const { L, v } = view(hydrogenParts); drawBlueprint(stub, v, L, {}); }
  report(rec.texts.some((t) => /H2 - NO FLAMES/.test(t)) && rec.texts.some((t) => /GASBAG.*H2/.test(t)), 'the red stencil and the bag\'s label say hydrogen');
  const canvas = { width: 1600, height: 900, clientWidth: 1600, clientHeight: 900, style: {} };
  const b = boot({ parts: mixParts, bots: 2 });
  const renderer = createRenderer({ ctx: stubCtx(), state: b.st, canvas });
  const cam = createWorldCamera();
  const frame = () => { clock.ms += DT * 1000; renderer.renderFrame(clock.ms, cam.update(DT, b.st, canvas.width, canvas.height)); };
  step(b.sim, secs(2));
  const e1 = errs();
  for (let i = 0; i < 4; i++) frame();
  b.st.bags[1].scorch = 0.6; // scorched
  for (let i = 0; i < 3; i++) frame();
  b.st.bags[1].burn = 2; // alight
  for (let i = 0; i < 3; i++) frame();
  b.st.hotAir.heat = 0.3; // a cooling burner
  for (let i = 0; i < 3; i++) frame();
  report(errs() === e1, 'the ship draws with a scorched bag, an alight bag and a cooling burner (0 errors)');
}

// ---------------------------------------------------------------- (g) the ship generator uses the gases
{
  const { generateShip } = await load('modules/host/shipGen.js');
  const n = { hydrogen: 0, hot: 0, helium: 0, none: 0 }, bad = [];
  for (let s = 1; s <= (quick ? 60 : 150); s++) {
    const r = generateShip(s);
    if (!r) { n.none++; continue; }
    n[r.parts.find((p) => p.part === 'gasbag').gasType || 'helium']++;
    if (validate(r.parts).fails.length) bad.push(s);
  }
  report(n.hydrogen >= 1 && n.hot >= 1 && n.none === 0 && !bad.length, `random ships take the new gases (${n.hydrogen} hydrogen, ${n.hot} hot air, ${n.helium} helium) and every one validates with no FAIL${bad.length ? ' (bad seeds ' + bad.join(',') + ')' : ''}`);
}

console.log(ok && errors.length === 0 ? '\nGAS GATE PASSED' : '\nGAS GATE FAILED' + (errors[0] ? '\n' + errors[0] : ''));
process.exit(ok && errors.length === 0 ? 0 : 1);
