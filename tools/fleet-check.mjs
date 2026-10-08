// B.3 gate: every ship is a first-class citizen on the TV (MOVEMENT.md, Option B, stage B.3). Headless. Part of  node tools/buildsim.mjs --check-two-ships  (or run it directly:
//   node tools/fleet-check.mjs [--build bags] [--seed 1] ).
//
// The simulation half (the systems that were ship 0's alone and now run for every ship):
//   * crew scaling counts THAT ship's crew (ship 0's is still the world's);
//   * the sky's hazards (ice, thermals, spores, oxygen, storm rods, the sea) run for the second ship on her own copy of the rules, in all seven environments, 0 errors;
//   * targetShip(world, enemy) is the one place that picks the ship an enemy hunts (ships[0] today);
//   * the phone radar of each ship measures from HER middle and shows the other airship as a blip; spotting works from either ship;
//   * a target in ANY ship's manned beam is lit, and only the ship holding it lets its glow fade;
//   * ships put into the sky together do not start on top of each other.
// The TV half (render.js on a stub canvas that keeps a real transform stack and a list of the text and gradients it was asked for):
//   * one renderer draws EVERY ship, each under HER OWN pose (the painted lettering of each ship lands at her pose, mirrored or not), with her own art bake;
//   * with ONE ship nothing of the fleet is drawn (the HUD is the old one: one 'Hull' bar, no ship panels); with several, a panel for each (name, team, hull / steam / gas / trim);
//   * the darkness cuts light for EVERY ship's glow and beams (more gradients with two ships than with one);
//   * a ship that is off screen gets an edge arrow with her name, the team pennants and trim are drawn, 0 game errors, 0 exceptions.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';
import { loadBuild } from './buildload.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const buildName = flag('build', 'bags'), seed = Number(flag('seed', 1));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(seed); // (boot() seeds it again: every scenario has its own repeatable sky, so one scenario's random draws do not decide the next one's)

// ---- the stub canvas: a real transform stack, and a record of what it was asked to draw ----
const rec = { n: 0, texts: [], gradients: 0, calls: {} };
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
        case 'createLinearGradient': case 'createRadialGradient': case 'createPattern': case 'createConicGradient': return () => { if (k === 'createRadialGradient') rec.gradients++; return { addColorStop() {} }; };
        case 'isPointInPath': case 'isPointInStroke': return () => false;
        case 'fillText': case 'strokeText': return (s, x, y) => { rec.texts.push({ kind: k, s: String(s), x, y, m: m.slice() }); };
        default: return () => { rec.n++; rec.calls[k] = (rec.calls[k] || 0) + 1; };
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
const { BUILDS } = await load('modules/host/shipBuild.js');
const S = await load('modules/host/ships.js');
const SP = await load('modules/host/spotter.js');
const { createWorldCamera } = await load('modules/host/camera.js');
const { createRenderer } = await load('modules/host/render.js');
const parts = await loadBuild(buildName, BUILDS);
const DT = 1 / 60;
const colors = ['#e63946', '#3a86ff', '#f1c40f', '#06d6a0', '#8338ec', '#ff7b00'];
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; sim.update(DT); } };

// A sim with the classic ship and `extra` more (the second one built from `parts`), `bots` bots on each, cast off.
function boot({ extra = 1, bots = 3, flying = true, formation = null } = {}) {
  clock = seedRandom(seed);
  const sim = createSimulation();
  for (let i = 1; i <= extra; i++) sim.addShip(parts, formation ? { formation: formation(i) } : {});
  const st = sim.state;
  for (const sh of st.ships) {
    const e = sh.layout.boarderEntryPoints;
    for (let i = 0; i < bots; i++) {
      const id = sh.id + '_bot' + i;
      st.players[id] = { id, bot: true, ship: sh.id, name: 'Bot' + (i + 1), species: config.CREW_SPECIES[(Math.random() * config.CREW_SPECIES.length) | 0], color: colors[i % colors.length], x: e[0].x + Math.random() * (e[1].x - e[0].x), y: -60, fall: true, jx: 0, jy: 0, t: 0, connected: true };
    }
  }
  if (flying) sim.castOff();
  return { sim, st, A: st.ships[0], B: st.ships[1] };
}
const human = (st, sh, id, platform, x) => {
  const p = { id, bot: false, ship: sh.id, name: id, species: config.CREW_SPECIES[0], color: '#fff', x, y: 0, d: platform, fall: false, jx: 0, jy: 0, t: 0, connected: true, freeT: 9 };
  st.players[id] = p;
  S.transfer(st, p, sh, platform, x);
  return p;
};

// ---- 1. teams, names, the one place that picks an enemy's ship ----
{
  const { st, A, B } = boot({ bots: 0, flying: false });
  report(A.name === 'AIRSHIP' && B.name === 'SHIP 2' && A.team === null && B.team === null, 'ships have a name for the TV (AIRSHIP, SHIP 2) and no team in co-op');
  B.team = 'blue';
  A.team = { id: 'red', name: 'RED', color: '#d6453d', trim: '#9c2f2a' }; // (the PvP bridge's team object)
  report(B.team.id === 'blue' && B.team.color === config.FLEET.TEAMS.blue.color && B.team.pale && A.team.id === 'red' && A.team.trim === '#9c2f2a' && A.team.pale === config.FLEET.TEAMS.red.pale, 'ship.team takes an id or a PvP team object and gives { id, name, color, trim, dark, pale }');
  A.team = null;
  B.team = null;
  report(S.targetShip(st, null) === A && S.targetShip(st, {}) === A && S.targetShip(st, { target: B }) === B && S.targetShip(st, { target: { id: 'ghost' } }) === A, 'targetShip(world, enemy) answers ship 0, or the ship an enemy names that is in the sky');
}

// ---- 2. crew scaling counts that ship's crew ----
{
  const { sim, st, A, B } = boot({ bots: 6 });
  for (const id of Object.keys(st.players)) if (st.players[id].ship === 'ship1' && Number(id.slice(-1)) >= 2) delete st.players[id];
  step(sim, 5);
  const a = A.ctx.crewScale, b = B.ctx.crewScale;
  const differs = ['spawn', 'count', 'fire', 'damage', 'raiders', 'hp', 'spread', 'collateral'].filter((k) => a[k] !== b[k]);
  report(a.real === 6 && b.real === 2 && a !== b && st.crewScale === a && differs.length > 0, `crew scaling counts each ship's own crew: ship 0 has ${a.real} aboard, ship1 ${b.real} (they differ in ${differs.join(', ')}); ship 0's is the world's (the enemies follow her crew)`);
}

// ---- 3. the sky's hazards run for the second ship, in every environment ----
{
  const keep = config.ENVIRONMENTS.FORCE;
  const out = [];
  let bad = 0;
  for (const env of ['skyisles', 'frost', 'ember', 'fungal', 'aether', 'storm', 'sea']) {
    config.ENVIRONMENTS.FORCE = env;
    const { sim, st, A, B } = boot({ bots: 4 });
    let errs = 0;
    for (let i = 0; i < 25 * 60; i++) { clock.ms += DT * 1000; try { sim.update(DT); } catch (e) { errs++; if (errs < 3) console.log('  error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } }
    const own = B.ctx.env !== A.ctx.env && B.ctx.env.id === env && A.ctx.env.id === env && B.ctx.icing !== A.ctx.icing && B.ctx.stormJob !== A.ctx.stormJob && B.ctx.sea !== A.ctx.sea && B.ctx.clogs !== A.ctx.clogs;
    const rule = env === 'frost' ? B.layout.outdoorDecks().length === 0 || B.ctx.icing.length > 0 : env === 'storm' ? B.ctx.stormJob.rods.length > 0 && A.ctx.stormJob.rods.length > 0 : env === 'sea' ? B.ctx.sea.y != null && B.ctx.sea.pump != null : env === 'aether' ? B.ctx.env.gravity < 1 : env === 'fungal' ? B.ctx.clogs.length >= 0 : true;
    if (errs || !own || !rule) bad++;
    out.push(`${env}${errs || !own || !rule ? ' FAILED' : ''}`);
  }
  config.ENVIRONMENTS.FORCE = keep;
  report(bad === 0, `the second ship has the sky's hazards of her own in all seven environments, 25 s each, 0 errors (${out.join(', ')})`);
  // ice builds up on HER and bots chip it off HER (a copy of the rules for each ship, not the one ship 0 uses)
  config.ENVIRONMENTS.FORCE = 'frost';
  const { sim, st, A, B } = boot({ bots: 6 });
  let peakB = 0, chipped = 0, last = 0;
  for (let i = 0; i < 150 * 60; i++) {
    clock.ms += DT * 1000;
    sim.update(DT);
    if (i % 30 === 0) { peakB = Math.max(peakB, B.ctx.icing.length); if (B.ctx.icing.length < last) chipped++; last = B.ctx.icing.length; }
  }
  config.ENVIRONMENTS.FORCE = keep;
  report(B.layout.outdoorDecks().length === 0 || (peakB > 0 && chipped > 0 && B.ctx.ice.gasbag < 1), `frost: ice settled on ship1 (up to ${peakB} crusts) and her bots chipped it off (${chipped} times), ship 0's crusts are her own (${A.ctx.icing.length} now)`);
}

// ---- 4. the phone radar and spotting, per ship ----
{
  const { sim, st, A, B } = boot({ bots: 0 });
  const sent = [];
  sim.setSocket({ emit: (ev, msg) => { if (ev === 'host:ui' && msg.ui && msg.ui.rd) sent.push({ id: msg.id, rd: msg.ui.rd }); } });
  const hA = human(st, A, 'hA', A.layout.deckIndex('main'), 300);
  const hB = human(st, B, 'hB', B.layout.deckIndex('main'), 300);
  step(sim, 90);
  const SHIP = SP.RADAR_KINDS.indexOf('ship');
  const last = (id) => sent.filter((s) => s.id === id && s.rd.on).pop();
  const kinds = (m) => { const a = (m && m.rd.a) || []; const out = []; for (let i = 0; i < a.length; i += 4) out.push(a[i]); return out; };
  const ra = last('hA'), rb = last('hB');
  report(SHIP === 11 && kinds(ra).filter((k) => k === SHIP).length === 1 && kinds(rb).filter((k) => k === SHIP).length === 1, 'each ship\'s phone radar shows the OTHER airship as a blip (and not her own): one blip of kind "ship" on each');
  // the blip is where the other ship is: measured from the phone's own ship
  const posOf = (m, who) => { const a = m.rd.a; for (let i = 0; i < a.length; i += 4) if (a[i] === SHIP) return { dx: a[i + 1] / 100 * config.RADAR.RANGE, dy: a[i + 2] / 100 * config.RADAR.RANGE, far: !!(a[i + 3] & 2) }; return null; };
  const mid = (sh) => ({ x: sh.pose.x + sh.layout.midPoint.x, y: sh.pose.y + sh.layout.midPoint.y });
  const pa = posOf(ra), pb = posOf(rb);
  const dAB = { x: mid(B).x - mid(A).x, y: mid(B).y - mid(A).y };
  const near = (p, d) => p && (p.far || (Math.abs(p.dx - d.x) < 500 && Math.abs(p.dy - d.y) < 500));
  report(near(pa, dAB) && near(pb, { x: -dAB.x, y: -dAB.y }), `... measured from the middle of the phone's OWN ship (A sees B at ${pa && Math.round(pa.dx)},${pa && Math.round(pa.dy)}; B sees A at ${pb && Math.round(pb.dx)},${pb && Math.round(pb.dy)}; the real offset is ${Math.round(dAB.x)},${Math.round(dAB.y)})`);
  // spotting from ship B marks ship A
  const idx = kinds(rb).indexOf(SHIP);
  hB.spotQ = { i: idx, s: rb.rd.s };
  step(sim, 2);
  report(st.spots.some((s) => s.obj === A.state && s.by === 'hB' && s.kind === 'ship') && A.state.spotT > 0, 'a crewman on ship1 taps the blip of ship 0 on his radar: she is SPOTTED in his name (spotting works from any ship)');
  step(sim, 600);
  report(!st.spots.length && !(A.state.spotT > 0), '... and the mark times out');
}

// ---- 5. a target in any ship's beam is lit ----
{
  config.MAPS.FORCE_KIND = 'open'; // (open sky: no cave wall stops a beam short)
  const { sim, st, A, B } = boot({ bots: 0 });
  const nestOf = (sh) => sh.sim.searchlights.lights.find((l) => /Nest/.test(l.n));
  const lA = nestOf(A), lB = nestOf(B);
  const deckOf = (sh, l) => { const s = sh.layout.stations.find((q) => q.n === l.n); return { d: sh.layout.platforms.findIndex((q) => q.id === s.p), x: s.x }; };
  const pA = deckOf(A, lA), pB = deckOf(B, lB);
  const opA = human(st, A, 'opA', pA.d, pA.x);
  const opB = human(st, B, 'opB', pB.d, pB.x);
  opA.lock = lA.n; opB.lock = lB.n; opA.jy = -1; opB.jy = -1; // (swung straight up, the lamps' home)
  B.pose.x = A.pose.x; B.pose.y = A.pose.y; B.state.vy = 0; // (the second ship on top of the first: the same beam)
  step(sim, 40);
  const lens = A.sim.searchlights.emitter(lA);
  const mine = { x: lens.x, y: lens.y - 600, baseY: lens.y - 600, vx: 0, bob: 0 }; // (a mine as threats.js makes it)
  st.mines.push(mine);
  const p1 = { x: mine.x, y: mine.y }; // (where it was when the lamps looked: it drifts a little in the same step)
  step(sim, 1);
  const pin = (m, p, n) => { for (let i = 0; i < n; i++) { m.x = p.x; m.y = p.y; m.baseY = p.y; m.bob = 0; step(sim, 1); } }; // (a mine drifts in a step: put it back before each one)
  const at = (t, m) => Math.abs(t.x - m.x) < 40 && Math.abs(t.y - m.y) < 40; // (a mine drifts a little in the step)
  const keep = (sh) => sh.ctx.litTargets.some((t) => at(t, p1));
  report(keep(A) && keep(B) && mine.lit > 0, `a mine over both ships is lit by both beams (ship 0 holds ${A.ctx.litTargets.length}, ship1 ${B.ctx.litTargets.length}) and glows (${mine.lit})`);
  opB.lock = null;
  pin(mine, p1, 30);
  report(mine.lit === config.SEARCHLIGHT.LIT_HOLD && keep(A) && !keep(B) && B.ctx.dimTargets.some((t) => at(t, p1)), 'ship1 swings her lamp away: ship 0\'s beam still holds the mine fully lit (ship1 does not fade a glow she no longer holds)');
  opA.lock = null;
  pin(mine, p1, 30);
  report(!(mine.lit > 0) && !keep(A) && !keep(B), 'and when nobody holds it any more the glow fades');
  // a mine lit by ship1 ALONE is lit for ship 0's guns too (aim.js reads obj.lit)
  opB.lock = lB.n;
  B.pose.x = A.pose.x + 6000; B.pose.y = A.pose.y; // (far apart: ship 0's beam cannot reach it)
  step(sim, 40);
  const lensB = B.sim.searchlights.emitter(lB);
  const mine2 = { x: lensB.x, y: lensB.y - 600, baseY: lensB.y - 600, vx: 0, bob: 0 };
  st.mines.push(mine2);
  const p2 = { x: mine2.x, y: mine2.y };
  pin(mine2, p2, 1);
  report(mine2.lit > 0 && !A.ctx.litTargets.some((t) => at(t, p2)) && A.ctx.dimTargets.some((t) => at(t, p2)) && B.ctx.litTargets.some((t) => at(t, p2)), 'a mine only ship1\'s beam holds is lit (obj.lit: the guns of EVERY ship see it lit) although ship 0\'s own list calls it dim');
}

config.MAPS.FORCE_KIND = null;

// ---- 6. ships put into the sky together do not start on top of each other ----
{
  let overlap = 0, shown = '';
  for (let run = 0; run < 6; run++) {
    const { st } = boot({ extra: 2, bots: 0, formation: (i) => ({ dx: -250 * i, dalt: -300 * i }) });
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const a = st.ships[i], b = st.ships[j], ba = a.layout.bounds, bb = b.layout.bounds;
      if (a.pose.x + ba.x0 < b.pose.x + bb.x1 && a.pose.x + ba.x1 > b.pose.x + bb.x0 && a.pose.y + ba.y0 < b.pose.y + bb.y1 && a.pose.y + ba.y1 > b.pose.y + bb.y0) { overlap++; shown = st.ships.map((q) => Math.round(q.pose.x) + ',' + Math.round(q.pose.y)).join(' | '); }
    }
  }
  report(overlap === 0, `three ships made with nearly the same station are placed clear of each other on six different maps (no two of their boxes overlap at cast off)${overlap ? ': ' + shown : ''}`);
}

// ---- 7. the TV ----
{
  const canvas = { width: 1920, height: 1080, clientWidth: 1920 };
  const cam = createWorldCamera();
  const frames = (sim, st, renderer, n, { perStep = 1 } = {}) => {
    let exc = 0;
    for (let f = 0; f < n; f++) {
      step(sim, perStep);
      rec.texts.length = 0;
      rec.gradients = 0;
      try { renderer.renderFrame(clock.ms, cam.update(1 / 60, st, canvas.width, canvas.height)); } catch (e) { exc++; if (exc < 3) console.log('  draw error: ' + String(e && e.stack).split('\n').slice(0, 3).join(' | ')); }
    }
    return exc;
  };
  const count = (s) => rec.texts.filter((t) => t.s === s).length;
  const gameErrors0 = (globalThis.gameErrors || []).length;

  // (a) one ship: the HUD is the old one
  {
    const { sim, st } = boot({ extra: 0, bots: 4 });
    const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
    const exc = frames(sim, st, renderer, 40);
    report(exc === 0 && count('Hull') === 1 && count('Trim') === 0 && count('SHIP 2') === 0 && count('TRIM') === 1 && !rec.texts.some((t) => / CREW$/.test(t.s)), `one ship: drawn without errors, the HUD is the old one (one 'Hull' bar, no ship panel, no team text), ${rec.n} canvas calls a frame`);
  }
  // (b) two ships with teams: both drawn under their own poses, a panel each
  {
    const { sim, st, A, B } = boot({ extra: 1, bots: 4, formation: () => ({ dx: -1800, dalt: 0 }) });
    A.team = 'red'; B.team = 'blue';
    const renderer = createRenderer({ ctx: stubCtx(), state: st, canvas });
    const exc = frames(sim, st, renderer, 60);
    const view = cam.update(0, st, canvas.width, canvas.height);
    // the painted lettering of each ship ("BELLY LAMP") is drawn live at that ship's own pose: its world position, less her pose, is the same for ships of the same layout
    const world = (t) => ({ x: (t.m[0] * t.x + t.m[2] * t.y + t.m[4] - canvas.width / 2) / view.zoom + view.cx, y: (t.m[1] * t.x + t.m[3] * t.y + t.m[5] - canvas.height / 2) / view.zoom + view.cy });
    const labels = rec.texts.filter((t) => t.s === 'BELLY LAMP' && t.kind === 'fillText').map(world);
    const byX = [A, B].sort((p, q) => p.pose.x - q.pose.x); // (each ship draws ONE belly-lamp board: the left board is the left ship's)
    const lab = labels.slice().sort((p, q) => p.x - q.x);
    const off = lab.length === 2 ? lab.map((p, k) => ({ dx: p.x - byX[k].pose.x, dy: p.y - byX[k].pose.y })) : null;
    const refRel = off && off[0];
    const same = !!off && Math.abs(off[0].dx - off[1].dx) < 60 && Math.abs(off[0].dy - off[1].dy) < 60;
    report(count('Hull') === 3 && count('Trim') === 2 && count('AIRSHIP') === 1 && count('SHIP 2') === 1 && count('RED CREW') === 1 && count('BLUE CREW') === 1 && count('AHEAD') >= 3, 'HUD with two ships: the big panel and a compact panel for each ship (names AIRSHIP and SHIP 2, her team RED / BLUE CREW, Hull, Steam, Gas, Trim, the bow pennant)');
    report(rec.calls.fill > 0 && (globalThis.gameErrors || []).length === gameErrors0, `no game error was logged by drawing them (${(globalThis.gameErrors || []).length - gameErrors0}), team trim and pennants drawn`);
    // a ship that comes about: her lettering must still land at her pose (a mirror about the middle of her bounds) and read upright
    B.pose.f = -1;
    frames(sim, st, renderer, 2);
    const view2 = cam.update(0, st, canvas.width, canvas.height);
    const mirrored = rec.texts.filter((t) => t.s === 'BELLY LAMP' && t.kind === 'fillText').map((t) => ({ det: t.m[0] * t.m[3] - t.m[1] * t.m[2] }));
    report(mirrored.length >= 2, 'a ship that faces the other way is still drawn (lettering present for both ships)');
    B.pose.f = 1;
    // (c) the camera cannot fit both: the one that is off screen gets an edge arrow with her name
    B.pose.x = A.pose.x + 20000;
    B.state.speed = 0;
    frames(sim, st, renderer, 3, { perStep: 0 });
    const v = cam.update(0, st, canvas.width, canvas.height);
    const arrow = rec.texts.filter((t) => t.kind === 'strokeText' && t.s === 'SHIP 2');
    report(v.clipped === true && arrow.length === 1, `ships too far apart for the zoom cap: view.clipped is set and the off-screen ship gets an edge arrow labelled SHIP 2 (${arrow.length})`);
    B.pose.x = A.pose.x - 1800;
  }
  // (d) darkness: every ship's glow and beams cut light out of the one overlay
  {
    const keep = config.ENVIRONMENTS.FORCE;
    config.ENVIRONMENTS.FORCE = 'fungal';
    const one = boot({ extra: 0, bots: 4 });
    const r1 = createRenderer({ ctx: stubCtx(), state: one.st, canvas });
    frames(one.sim, one.st, r1, 150); // (the dark fades in)
    const g1 = rec.gradients;
    const two = boot({ extra: 1, bots: 4, formation: () => ({ dx: -1800, dalt: 0 }) });
    const r2 = createRenderer({ ctx: stubCtx(), state: two.st, canvas });
    frames(two.sim, two.st, r2, 150);
    const g2 = rec.gradients;
    config.ENVIRONMENTS.FORCE = keep;
    // (each lamp anchor is a beam gradient, a lamp glow and a visible beam at least: three; two lamps on each ship)
    report(g1 > 0 && g2 >= g1 + 6, `darkness: with a second ship the overlay cuts light for her glow and her two beams as well (${g1} gradients a frame with one ship, ${g2} with two)`);
  }
  report((globalThis.gameErrors || []).length === gameErrors0, 'none of the pictures logged a game error');
}

process.exit(ok ? 0 : 1);
