// DESTRUCTION v1 gate (3D.md WP5; public/modules/view3d/physics.js, destruction.js, damageView.js, and the simulation's append-only data: shipBuild.js partRects, shipSim.js hitLog / breakEvents).
//   node tools/buildsim.mjs --check-physics        or directly:   node tools/physics-check.mjs [--no-browser] [--port 4177]
//
//   (a) THE SIM'S DATA: every build has partRects (unique ids, 'hull' among them, a part found for a point on her), a blow lands in hitLog with the part it struck (shell, rock, ram), the ring keeps 64,
//       a break-off leaves a note in breakEvents BEFORE the layout changes (the parts that are gone, still named as the old 3D model knows them), and the notes are capped when nobody reads them;
//   (b) THE ENGINE (Rapier, headless, the same physics.js the TV runs): one scripted scenario run twice gives the same hash after 600 steps, nothing is NaN, a body dropped on a real rock outline (terrain
//       trimesh from the marching-squares walls) comes to rest on it, a body dropped on a ship's kinematic hull stays on it, wood floats in the water and iron sinks, the body cap holds;
//   (c) THE TV (a headless Chrome on a server of its own): the real game in 3D flies with bots, an engine is broken off by hand and a bomb bay goes up: the part tears off into 3D pieces that fall below
//       where they started within 2 s of simulated time and are gone when the 2D debris expires, the chunks of a blast fly, the parts ids of every partRect exist in the 3D model, 0 console errors.
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { installShims, seedRandom, publicDir } from './shims.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url));
let ok = true;
const report = (good, what) => { console.log((good ? 'PASS ' : 'FAIL ') + what); if (!good) ok = false; };

installShims();
let clock = seedRandom(1);
const load = (p) => import(pathToFileURL(path.join(publicDir, p)).href);
const { config } = await load('config.js');
const { createSimulation } = await load('modules/host/simulation.js');
const { BUILDS, buildLayout, partAt } = await load('modules/host/shipBuild.js');
const { applyBuild } = await load('shipLayout.js');
const { loadRapier, createPhysics } = await load('modules/view3d/physics.js');
const { chunkWalls, CH } = await load('modules/view3d/terrainWalls.js');
const DT = 1 / 60;
const errors = [];

function boot() {
  config.MAPS.FORCE_KIND = 'open';
  config.ENVIRONMENTS.FORCE = 'skyisles';
  config.PACING.RATE_START = config.PACING.RATE_END = config.PACING.PEAK_RATE = 0; config.PACING.BUILD = 1e6; config.SPECIALS.FIRST_AFTER = 1e9; config.PACING.GUNSHIP_FIRST = 1e9;
  clock = seedRandom(1);
  applyBuild(BUILDS.classic);
  const sim = createSimulation();
  sim.castOff();
  return { sim, st: sim.state, ours: sim.state.ships[0] };
}
const step = (sim, n = 1) => { for (let i = 0; i < n; i++) { clock.ms += DT * 1000; try { sim.update(DT); } catch (e) { errors.push(String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); if (errors.length > 3) throw e; } } };

// ================================ (a) the simulation's data ================================
{
  const bad = [];
  for (const [name, parts] of Object.entries(BUILDS)) {
    let L;
    try { L = buildLayout(parts); } catch (e) { bad.push(name + ': does not build'); continue; }
    const ids = L.partRects.map((r) => r.id);
    if (new Set(ids).size !== ids.length) bad.push(name + ': duplicate ids');
    if (!ids.includes('hull')) bad.push(name + ': no hull');
    if (!L.partRects.every((r) => Number.isFinite(r.x0 + r.x1 + r.y0 + r.y1) && r.x1 >= r.x0 && r.y1 >= r.y0)) bad.push(name + ': a rect is not a box');
    const mid = L.hitRects[0], pr = partAt(L.partRects, (mid.x0 + mid.x1) / 2, (mid.y0 + mid.y1) / 2);
    if (!pr) bad.push(name + ': no part at her middle');
    if (L.platforms.some((q) => !ids.includes('deck:' + q.id))) bad.push(name + ': a deck has no rect');
    if (L.stations.some((s) => !ids.includes('station:' + s.n))) bad.push(name + ': a station has no rect');
    if (Object.keys(L.gunMounts).some((g) => !ids.includes('gun:' + g))) bad.push(name + ': a gun has no rect');
    if (L.engines.some((e) => !ids.includes('engine:' + e.name))) bad.push(name + ': an engine has no rect');
    if (L.gasbags.some((g) => !ids.includes('gasbag:' + g.id))) bad.push(name + ': a gasbag has no rect');
  }
  report(!bad.length, `partRects: every build (${Object.keys(BUILDS).join(', ')}) has unique ids, a hull, and a box for each deck, station, gun, engine and gasbag${bad.length ? ' - ' + bad.join('; ') : ''}`);

  const { sim, st, ours } = boot();
  step(sim, 60);
  const L = ours.layout;
  ours.sim.impact(900, 700, 1.2);
  const h1 = st.hitLog[st.hitLog.length - 1];
  report(!!h1 && h1.kind === 'hit' && typeof h1.partId === 'string' && h1.n >= 1 && Number.isFinite(h1.t) && L.partRects.some((r) => r.id === h1.partId), `a blow lands in hitLog with the part it struck (${h1 && h1.partId}), a number and a time`);
  ours.sim.crash(400, 700, 600, 'crash');
  const h2 = st.hitLog[st.hitLog.length - 1];
  report(h2.kind === 'rock' && h2.n > h1.n, 'a crash into rock is logged as "rock"');
  step(sim, 5);
  ours.sim.impact(1400, 650, 2, 1, 'ram');
  ours.sim.crash(1400, 650, 700, 'ram');
  const rams = st.hitLog.filter((h) => h.kind === 'ram');
  report(rams.length === 1, `a ram is ONE mark named "ram" (the impact and the crash of one contact are merged: ${rams.length})`);
  for (let i = 0; i < 100; i++) { step(sim, 1); ours.sim.impact(300 + i * 10, 700, 1); }
  report(st.hitLog.length === 64 && st.hitLog[63].n > st.hitLog[0].n, `the ring keeps the last 64 (${st.hitLog.length}, newest ${st.hitLog[63].n})`);

  const ev0 = st.breakEvents.length;
  const keysBefore = L.partRects.map((r) => r.id);
  const r = ours.sim.breakOff({ kind: 'part', name: 'Aft Engine' }, { force: true });
  const ev = st.breakEvents[st.breakEvents.length - 1];
  report(!!r && st.breakEvents.length === ev0 + 1 && ev.plan === r.plan && ev.lostKeys.includes('engine:Aft Engine') && ev.lostKeys.every((k) => keysBefore.includes(k)) && ev.ver === L.version - 1,
    `a break-off leaves a note BEFORE the layout changes: lost ${ev && ev.lostKeys.join(', ')} (all keys of the old layout, version ${ev && ev.ver} -> ${L.version})`);
  report(ev.lostRects.length === ev.lostKeys.length && !L.partRects.some((q) => q.id === 'engine:Aft Engine'), 'the notes carry the lost parts\' boxes and the new layout no longer has the engine');
  step(sim, 400);
  const b2 = ours.sim.explodeBay('hit');
  const ev2 = st.breakEvents[st.breakEvents.length - 1];
  report(!!b2 && ev2.blast && ev2.lostKeys.some((k) => /bomb ?bay/i.test(k)) && ev2.plan.pieces.length >= 1, `a bomb bay blast: lost ${ev2 && ev2.lostKeys.length} parts incl. ${ev2 && ev2.lostKeys.filter((k) => /bay|coal/i.test(k)).join(', ')}, ${ev2 && ev2.plan.pieces.length} piece(s) of debris`);
  for (let i = 0; i < 12; i++) { ours.sim.breakOff({ kind: 'blast', x: 800, y: 600, r: 400, cause: 'test' }, { force: true }); }
  report(st.breakEvents.length <= 8, `notes nobody reads are capped (${st.breakEvents.length} kept)`);
  report(errors.length === 0, 'no error thrown by any of it');
}

// ================================ (b) the engine ================================
const R = await loadRapier();
const KP = config.BREAKOFF.PHYS, DB = config.BREAKOFF.DEBRIS;
const box = (hx, hy, hz = 60, cx = 0, cy = 0) => ({ cx, cy, cz: 0, hx, hy, hz });
const floor = (y, x0 = -4000, x1 = 4000) => ({ vertices: new Float32Array([x0, y, -300, x1, y, -300, x1, y, 300, x0, y, 300]), indices: new Uint32Array([0, 2, 1, 0, 3, 2]) });
function scenario() { // a ship, rock and a handful of pieces, scripted
  const P = createPhysics(R);
  P.setTerrain('rock', floor(-1200));
  const pose0 = { x: 0, y: -200, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  P.setShip('player', 0, { version: 1, boxes: [{ cx: 0, cy: 0, cz: 0, hx: 500, hy: 60, hz: 100 }], caps: [{ cx: 0, cy: 120, cz: 0, r: 150, hl: 350 }] }, pose0);
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push(P.addDebris({ shipIndex: 0, pos: [-300 + i * 140, 100 + i * 20, 0], quat: [0, 0, 0, 1], vel: [60 - i * 25, 200 - i * 60], ang: [0, 0, 0.8 - i * 0.3], boxes: [box(50 + i * 6, 30 + i * 4)], rel: i % 2 ? 2.6 : 0.55, mat: i % 2 ? 'iron' : 'wood', delay: 0.5 }));
  let f = 0;
  for (let s = 0; s < 600; s++) {
    if (s % 10 === 0) { f++; P.setShip('player', 0, null, { ...pose0, x: Math.round(f * 3.5), y: pose0.y + (f % 8) }); } // (the ship flies on)
    P.step(1 / 60);
  }
  const out = { hash: P.hash(), finite: P.finite(), bodies: P.bodies, steps: P.stats.steps };
  P.dispose();
  return out;
}
{
  const a = scenario(), b = scenario();
  report(a.hash === b.hash && a.steps === 600 && a.bodies === 6, `determinism: the same scripted scenario twice gives the same hash after ${a.steps} steps (${a.hash} / ${b.hash})`);
  report(a.finite && b.finite, 'no NaN in any position or rotation');
}
{ // a real rock outline: a map whose ground is solid from row 12 down; the pieces fall on it and stop
  const W = 24, H = 24, solid = new Uint8Array(W * H);
  for (let j = 12; j < H; j++) for (let i = 0; i < W; i++) solid[j * W + i] = 1;
  for (let j = 8; j < 12; j++) for (let i = 14; i < 18; i++) solid[j * W + i] = 1; // a block of rock standing on it
  const map = { W, H, CELL: 200, open: true, solid };
  const P = createPhysics(R);
  let walls = 0;
  for (let cj = 0; cj < Math.ceil(H / CH); cj++) for (let ci = 0; ci < Math.ceil(W / CH); ci++) { const m = chunkWalls(map, ci, cj, KP.TERRAIN_Z); if (m && P.setTerrain(ci + ',' + cj, m)) walls++; }
  const ids = [P.addDebris({ shipIndex: -1, pos: [1000, -1500, 0], quat: [0, 0, 0, 1], vel: [30, 0], ang: [0, 0, 0.5], boxes: [box(80, 40)], rel: 0.55, mat: 'wood' }),
    P.addDebris({ shipIndex: -1, pos: [3100, -1500, 0], quat: [0, 0, 0, 1], vel: [-120, 0], ang: [0, 0, -1], boxes: [box(60, 60), box(60, 20, 60, 120, -30)], rel: 2.6, mat: 'iron' })];
  for (let s = 0; s < 60 * 9; s++) P.step(1 / 60);
  const o = ids.map((id) => P.read(id, {}));
  const groundY = -2400; // (map y 2400 = row 12)
  const onGround = o[0].y > groundY && o[0].y < groundY + 140 && o[0].rest;
  report(walls >= 1 && onGround, `a piece dropped on the rock outline (${walls} wall chunks) comes to rest on it: y ${o[0].y.toFixed(1)} (ground ${groundY}), asleep ${o[0].rest}`);
  const onBlock = o[1].y > groundY - 400 && o[1].y < groundY + 140 && Math.hypot(o[1].vx, o[1].vy) < 5;
  report(onBlock && o.every((q) => Number.isFinite(q.x + q.y)), `a second piece (iron, two boxes) falls against the standing block and settles above the ground, speed ${Math.hypot(o[1].vx, o[1].vy).toFixed(2)}`);
  report(P.finite(), 'no NaN on the rock');
  P.dispose();
}
{ // a ship's kinematic hull holds a piece that lands on it, and carries the contact as she moves
  const P = createPhysics(R);
  const pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  P.setShip('player', 0, { version: 1, boxes: [{ cx: 0, cy: 0, cz: 0, hx: 400, hy: 50, hz: 120 }], caps: [] }, pose);
  const id = P.addDebris({ shipIndex: 3, pos: [0, 400, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(40, 20)], rel: 0.55, mat: 'wood' });
  for (let s = 0; s < 240; s++) { pose.x += 0.5; P.setShip('player', 0, null, pose); P.step(1 / 60); }
  const o = P.read(id, {});
  report(o.y > 50 && o.y < 110, `a piece landing on a ship's kinematic hull stays on it (y ${o.y.toFixed(1)}, the roof is at 50)`);
  P.dispose();
}
{ // a piece that starts INSIDE the outline of the ship it came off drops out of her (she is not solid to it until it is clear), then she is solid again
  const P = createPhysics(R);
  P.setTerrain('rock', floor(-1000));
  const pose = { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
  P.setShip('player', 0, { version: 1, boxes: [{ cx: 0, cy: 0, cz: 0, hx: 400, hy: 90, hz: 120 }], caps: [] }, pose);
  const own = P.addDebris({ shipIndex: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(60, 30)], rel: 0.55, mat: 'wood', delay: KP.OWN_DELAY });
  const other = P.addDebris({ shipIndex: 5, pos: [250, 300, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(60, 30)], rel: 0.55, mat: 'wood', delay: KP.OWN_DELAY });
  let lowest = 0;
  for (let s = 0; s < 60 * 7; s++) { P.step(1 / 60); const o = P.read(own, {}); if (o.y < lowest) lowest = o.y; }
  const a = P.read(own, {}), b = P.read(other, {});
  report(a.y < -900 && a.y > -1000 && a.rest, `a piece that starts inside her own outline falls out of the ship and lands on the rock (y ${a.y.toFixed(1)}, rock at -1000)`);
  report(b.y > 90 && b.y < 150, `a piece of ANOTHER ship that lands on her is held by her (y ${b.y.toFixed(1)}, the roof is at 90)`);
  P.dispose();
}
{ // the water: wood floats, iron sinks
  const P = createPhysics(R);
  P.setSea(0);
  let splashes = 0;
  P.events.splash = () => { splashes++; };
  const wood = P.addDebris({ shipIndex: -1, pos: [0, 300, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(70, 30)], rel: KP.REL.wood, mat: 'wood' });
  const iron = P.addDebris({ shipIndex: -1, pos: [400, 300, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(70, 30)], rel: KP.REL.iron, mat: 'iron' });
  const canvas = P.addDebris({ shipIndex: -1, pos: [800, 300, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(70, 30)], rel: KP.REL.canvas, mat: 'canvas' });
  for (let s = 0; s < 60 * 6; s++) P.step(1 / 60);
  const w = P.read(wood, {}), i = P.read(iron, {}), c = P.read(canvas, {});
  const share = (30 - w.y) / 60; // the part of a wood slab under water: the sea is at 0, its half height 30
  report(w.y > -20 && w.y < 45 && Math.abs(w.vy) < 25 && w.wet, `wood floats: after 6 s the slab rides at y ${w.y.toFixed(1)} (water at 0, ${(share * 100).toFixed(0)}% submerged: wood is ${KP.REL.wood} of water), speed ${w.vy.toFixed(1)}`);
  report(i.y < -150 && i.vy < -10, `iron sinks: y ${i.y.toFixed(1)} and still going down (${i.vy.toFixed(1)} px/s)`);
  report(c.y > -20 && c.y < 50, `canvas floats high (y ${c.y.toFixed(1)})`);
  report(splashes >= 3, `each one that hit the water made a splash (${splashes})`);
  P.dispose();
}
{ // the cap
  const P = createPhysics(R);
  let made = 0, chunks = 0;
  for (let i = 0; i < DB.MAX + 6; i++) if (P.addDebris({ shipIndex: -1, pos: [i * 200, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(40, 20)], rel: 1 })) made++;
  for (let i = 0; i < KP.CHUNKS.CAP + 6; i++) if (P.addDebris({ kind: 'chunk', shipIndex: -1, pos: [i * 90, 500, 0], quat: [0, 0, 0, 1], vel: [0, 0], ang: [0, 0, 0], boxes: [box(10, 6, 6)], rel: 1 })) chunks++;
  report(made === DB.MAX && chunks === KP.CHUNKS.CAP, `bodies are capped: ${made} pieces (BREAKOFF.DEBRIS.MAX ${DB.MAX}) and ${chunks} chunks (PHYS.CHUNKS.CAP ${KP.CHUNKS.CAP})`);
  const t0 = process.hrtime.bigint(); // (performance.now is the simulated clock in this tool)
  for (let s = 0; s < 120; s++) P.step(1 / 60);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 120;
  report(ms < 2, `${P.bodies} bodies cost ${ms.toFixed(3)} ms a step (Node, no terrain)`);
  P.dispose();
}

// ================================ (c) the TV in a headless browser ================================
const noBrowser = argv.includes('--no-browser');
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (noBrowser || !chrome) console.log('SKIP the browser part (' + (noBrowser ? '--no-browser' : 'no Chrome or Edge found') + ')');
else {
  const port = Number(flag('port', 4170 + Math.floor(Math.random() * 20)));
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(here, '..'), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch { /* gone */ } };
  try {
    for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://localhost:${port}/host.html`); if (r.ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 250)); }
    const flyAndBreak = (what) => `(async()=>{
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      document.getElementById('shipBtn').click(); document.getElementById('bots').click(); document.getElementById('castoff').click(); // (the Classic ship: she has the bomb bay)
      await sleep(6000);
      const V = view3dDebug().view, D = V.destruction, s = game.state.ships[0], out = {};
      const ids = s.layout.partRects.map((r) => r.id), model = V.models.get(s.id).model;
      out.missing = ids.filter((id) => !model.parts.has(id) && !/^(boarderEntry|bombBay|scar|frame)/.test(id));
      out.partRects = ids.length;
      const sea = ${JSON.stringify(what)};
      const r = sea === 'engine' ? s.sim.breakOff({ kind: 'part', name: 'Aft Engine' }, { force: true }) : s.sim.explodeBay('hit');
      out.broke = !!r; out.pieces2d = game.state.debris.length;
      let waited = 0;
      while ((!D.pieces.length || !D.ready) && waited < 8000) { await sleep(50); waited += 50; }
      out.pieces = D.pieces.filter((p) => p.kind === 'piece').length; out.chunks = D.chunks.length; out.fallbacks = D.stats.fallback; out.physics = D.ready;
      const y0 = D.pieces.filter((p) => p.kind === 'piece').map((p) => p.holder.position.y);
      const steps0 = D.physics ? D.physics.stats.steps : 0;
      let dropped = null, minLeft = 1e9, seen = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 45000) {
        await sleep(100);
        const P = D.pieces.filter((p) => p.kind === 'piece');
        if (dropped == null && D.physics && D.physics.stats.steps - steps0 <= 240 && P.length && P.some((p, i) => y0[i] != null && p.holder.position.y < y0[i] - 30)) dropped = (D.physics.stats.steps - steps0) / 60;
        if (!P.length && !D.chunks.length) { seen = (Date.now() - t0) / 1000; break; }
      }
      out.fellWithinSimSeconds = dropped; out.goneAfterWall = seen; out.left = D.pieces.length; out.errors = window.gameErrors.slice(); out.bodiesMax = D.stats.bodies; out.stepMs = +D.stats.maxStepMs.toFixed(2);
      return out;
    })()`;
    const runShot = (name, evalJs, extra = []) => {
      const evFile = path.join(os.tmpdir(), `physics-check-${process.pid}-${name}.json`);
      fs.writeFileSync(evFile, JSON.stringify([[evalJs, 500]]));
      const r = spawnSync(process.execPath, [path.join(here, 'shot3d.mjs'), '--url', `http://localhost:${port}/host.html?view=3d${extra.join('')}`, '--ready', 'window.__meter!==undefined', '--wait', '2500', '--evals-file', evFile, '--out', path.join(os.tmpdir(), `physics-check-${process.pid}-${name}.png`)], { encoding: 'utf8', timeout: 170000 });
      fs.rmSync(evFile, { force: true });
      const text = (r.stdout || '') + (r.stderr || '');
      const m = text.match(/\[page\] eval -> (\{.*\})/);
      const errs = Number((text.match(/console errors: (\d+)/) || [])[1] ?? 99);
      return { data: m ? JSON.parse(m[1]) : null, errs, text };
    };
    const pick = (res, name) => {
      const d = res.data;
      if (!d) { report(false, `${name}: the page gave no answer\n${res.text.slice(-800)}`); return; }
      report(d.broke && d.pieces >= 1 && d.physics, `${name}: it broke (${d.pieces} piece(s) in 3D, ${d.chunks} chunks, Rapier loaded ${d.physics}, ${d.fallbacks} plain-slab fallbacks)`);
      report(d.fellWithinSimSeconds != null && d.fellWithinSimSeconds <= 3.5, `${name}: the pieces fall below where they started within 3.5 s of simulated time (${d.fellWithinSimSeconds}) and a step costs at most ${d.stepMs} ms with ${d.bodiesMax} bodies`);
      report(d.goneAfterWall > 0 && d.left === 0, `${name}: the pieces and chunks are gone when the 2D debris expires (${d.goneAfterWall}s of wall time, ${d.left} left)`);
      report(d.errors.length === 0 && res.errs === 0, `${name}: 0 console errors and 0 game errors (${res.errs} / ${d.errors.length})`);
      return d;
    };
    const eng = runShot('engine', flyAndBreak('engine'));
    const e1 = pick(eng, 'an engine breaks off');
    if (e1) report(e1.missing.length === 0, `every partRect id (${e1.partRects}) is a part of the 3D model${e1.missing.length ? ' - missing ' + e1.missing.slice(0, 8).join(', ') : ''}`);
    const bay = runShot('bay', flyAndBreak('bay'));
    const b1 = pick(bay, 'the bomb bay blows up');
    if (b1) report(b1.chunks >= config.BREAKOFF.PHYS.CHUNKS.MIN - 2, `the blast threw ${b1.chunks} chunks (${config.BREAKOFF.PHYS.CHUNKS.MIN}-${config.BREAKOFF.PHYS.CHUNKS.MAX} made, a few may have been lost or landed already)`);
  } finally { stop(); }
}

if (errors.length) { console.log('ERRORS'); for (const e of errors) console.log('  ' + e); ok = false; }
console.log(ok ? 'ALL PASS' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
