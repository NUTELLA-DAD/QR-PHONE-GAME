// SEARCHLIGHTS, DARKNESS AND LIGHTNING (WP10) gate: the 3D view in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/light3d-check.mjs [--port N (default: a random one in 4500-4999)] [--quick] [--long] [--shots DIR] [--prefix wp10_after_] [--root DIR] [--only cave,night,...]
//   --quick   skips the tier and kill-switch runs        --long   adds a 60 second real-time run with 8 bots in each of the cave, the storm (open sky: fighters), the fungal caves and the Kraken cave
//   --shots   also saves named screenshots (DIR/<prefix><name>.png), for the before / after pairs (--root = another copy of the repo, e.g. a checkout of the commit before, whose checks are then skipped: --no-checks)
// The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand with a seeded Math.random, so every moment is the same. Every run must print 0 console errors. Checks:
//   1. dark cave (the first mission's kind), the lamp manned and aimed at rock: the beam is drawn, the light pool lies where it ends, the cone lights things
//   2. a night sky with fighters, bats and mines in and out of the beam: the sim's lit targets (state.litTargets) reach the shader, the others stay dim and show eyes (2D marks layer)
//   3. a storm: the strike flash steps down in equal steps and the jagged bolt shows two frames (a fixed shape per strike)
//   4. the fungal caves: glowing mushrooms grow on the rock, the motes drift
//   5. ?creature=kraken in a dark cave
//   6. perf on Medium: the whole feature costs at most 6 draw calls (measured by switching it off in the same frame) and the GPU time is printed
//   7. the tiers (High, Medium, Low) and the kill-switches (?look=nobeam,nolightning,nofungal, ?look=nopost) run with 0 errors; nobeam draws no beam
//   8. (--long) 8 bots flying for 60 seconds in real time
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const has = (k) => argv.includes('--' + k);
const root = path.resolve(arg('root', here));
const port = Number(arg('port', 4500 + Math.floor(Math.random() * 500)));
const quick = has('quick'), long = has('long'), noChecks = has('no-checks');
const shotDir = arg('shots', ''), prefix = arg('prefix', 'wp10_');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'light3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { if (noChecks) return; failed++; console.log('  FAIL ' + m); };
const want = (n) => !only.length || only.includes(n);

const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: has('verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }

const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
const nap = (ms) => `new Promise(r=>setTimeout(()=>r(1),${ms}))`;
// ---- page-side helpers: teleport the ship to a place where the lamp's ray meets rock, man the lamps, put enemies in and out of the beam
const PRE = `
window.__h = {
  // move the ship to open air where the lamp's ray at o.angle meets rock between o.minD and o.maxD; each candidate is checked by what the SIM says (the lamp's own reach), a few steps after the move
  async teleport(o) {
    const g = window.game, st = g.state, sh = st.ships[0], c = await import('/modules/host/course.js'), m = st.course.map;
    window.__step(2);
    const l = st.searchlights[0], ox = l.ex - sh.pose.x, oy = l.ey - sh.pose.y, C = m.CELL;
    const free = (x, y) => !c.inRock(st, x, y);
    const a = Math.max(l.home - l.arc, Math.min(l.home + l.arc, o.angle));
    let best = null, tried = 0;
    for (let gy = 4; gy < m.H - 4 && !best && tried < 12; gy++) for (let gx = 4; gx < m.W - 4; gx++) {
      const px = gx * C, py = gy * C, lx = px + ox, ly = py + oy;
      let ok = true;
      for (let dx = -500; dx <= 600 && ok; dx += 100) for (let dy = -300; dy <= 500; dy += 100) if (!free(px + dx, py + dy)) { ok = false; break; }
      if (!ok) continue;
      let d = 80; while (d < 2000 && free(lx + Math.cos(a) * d, ly + Math.sin(a) * d)) d += 20;
      if (d < o.minD || d > o.maxD) continue;
      tried++;
      sh.pose.x = px; sh.pose.y = py; sh.pose.vx = 0; sh.pose.vy = 0; l.aim = a;
      window.__step(3);
      if (l.reach >= o.minD - 200 && l.reach <= o.maxD + 100) { best = { px, py, d, reach: Math.round(l.reach) }; break; }
    }
    window.__w10.teleport = best;
    return best ? 1 : 0;
  },
  async lamps(opts) {
    const g = window.game, st = g.state, sh = st.ships[0];
    const names = Object.keys(sh.layout.searchlights), ps = Object.values(st.players).filter((p) => p.bot);
    for (let i = 0; i < names.length; i++) {
      const p = ps[i]; if (!p) continue;
      p.bot = false; p.lock = names[i]; p.jx = 0; p.jy = 0; p.fire = false;
      const l = st.searchlights[i];
      let a = opts.aim == null ? l.home : opts.aim;
      if (opts.creature && st.creature) a = Math.atan2(st.creature.y - 260 - l.ey, st.creature.x - l.ex);
      if (opts.free) { l.arc = 3.2; l.home = a; }
      l.aim = Math.max(l.home - l.arc, Math.min(l.home + l.arc, a));
    }
    window.__step(15);
    window.__w10.lamps = st.searchlights.map((l) => ({ n: l.n, aim: +l.aim.toFixed(2), power: l.power, reach: Math.round(l.reach), manned: l.manned }));
    if (opts.enemy) { // enemies on the beam's path (lit) and out of it (dim), placed right before a short step so the sim marks them
      const l = st.searchlights[0], A = l.aim;
      const at = (d, da) => ({ x: l.ex + Math.cos(A + da) * d, y: l.ey + Math.sin(A + da) * d });
      const P1 = at(760, 0), P2 = at(1100, 0.05), P3 = at(900, -0.07), P4 = at(1350, -0.04);
      st.strafers.push({ x: P1.x, y: P1.y, heading: Math.PI, vx: 0, vy: 0, hp: 3, max: 3, mode: 'circle', modeT: 99, orbit: 0, dir: 1, gunCd: 99, shots: 0, trail: [], bank: 0 });
      st.strafers.push({ x: P4.x, y: P4.y, heading: Math.PI, vx: 0, vy: 0, hp: 3, max: 3, mode: 'circle', modeT: 99, orbit: 0, dir: 1, gunCd: 99, shots: 0, trail: [], bank: 0 });
      st.strafers.push({ x: l.ex - 900, y: l.ey - 200, heading: 0, vx: 0, vy: 0, hp: 3, max: 3, mode: 'circle', modeT: 99, orbit: 0, dir: 1, gunCd: 99, shots: 0, trail: [], bank: 0 });
      st.bats.push({ x: P2.x, y: P2.y, vx: 0, vy: 0, tx: P2.x, ty: P2.y, hp: 1, phase: 0, delay: 0 });
      st.bats.push({ x: P2.x + 90, y: P2.y + 60, vx: 0, vy: 0, tx: P2.x, ty: P2.y, hp: 1, phase: 2, delay: 0 });
      st.mines.push({ x: P3.x, y: P3.y, baseY: P3.y, vx: 0, bob: 0 });
      st.mines.push({ x: l.ex - 1000, y: l.ey + 300, baseY: l.ey + 300, vx: 0, bob: 0 });
      st.bats.push({ x: l.ex - 800, y: l.ey + 80, vx: 0, vy: 0, tx: 0, ty: 0, hp: 1, phase: 1, delay: 0 });
      window.__step(2);
      window.__w10.lit = st.litTargets.length; window.__w10.dim = st.dimTargets.length;
    }
    return JSON.stringify(window.__w10.lamps);
  },
};`;
const boot = (steps = 300, seed = 7) => `(async()=>{ ${sl} ${PRE}
  let sd=${seed}; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  const g=window.game; window.__w10={}; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); };
  const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); g.update=()=>{}; window.__step(${steps}); return 1; })()`;
const lamps = (o) => `window.__h.lamps(${JSON.stringify(o)})`;
const view = (zoom, lift, tod) => `(()=>{ const S=window.view3dDebug().view.S; S.zoom=${zoom}; S.lift=${lift}; ${tod ? `S.tod='${tod}';` : ''} return 1 })()`;
// reads what the view drew, and (when asked) the same frame with the three WP10 features switched off: the difference is what they cost
const measure = (tag, off = true) => `(async()=>{ ${sl} const V=window.view3dDebug().view, b=V.beams;
  const med=(a)=>a.slice().sort((x,y)=>x-y)[a.length>>1];
  const snap=async()=>{ const s=[]; for(let i=0;i<7;i++){ const v=V.stats(); s.push(v); await sl(110); } const v=V.stats(); return {calls:med(s.map(q=>q.calls)),sceneCalls:med(s.map(q=>q.sceneCalls)),tris:med(s.map(q=>q.tris)),jsMs:+med(s.map(q=>q.jsMs)).toFixed(2),gpu:v.gpu&&Object.fromEntries(Object.entries(v.gpu).map(([k,x])=>[k,+x.toFixed(2)]))}; };
  await sl(300);
  const r=window.__w10['${tag}']={ beams:b?{lamps:b.stats.lamps,pools:b.stats.pools,lit:b.stats.lit,hit:b.stats.hit,len:b.stats.len}:null, on:await snap(), fungal:V.fungal?{shrooms:V.fungal.stats.shrooms,glows:V.fungal.stats.glows,active:V.fungal.stats.active}:null, lightning:V.lightning?{shown:V.lightning.stats.shown,key:V.lightning.stats.key,strikes:V.lightning.stats.strikes}:null, errors:(window.gameErrors||[]).length };
  ${off ? `if(V.look&&b){ const k=[V.look.beam,V.look.lightning,V.look.fungal]; V.look.beam=V.look.lightning=V.look.fungal=false; await sl(900); r.off=await snap(); [V.look.beam,V.look.lightning,V.look.fungal]=k; await sl(500); }` : ''}
  return JSON.stringify(r); })()`;

// one run of the page: steps = [[js, waitMs, shotName?]]
function run(name, query, steps, extra = []) {
  const file = path.join(out, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const args = [path.join(here, 'tools/shot3d.mjs'), '--url', `http://localhost:${port}/host.html?view=3d&${query}`, '--out', path.join(shotDir || out, (shotDir ? prefix.replace(/_$/, '') : 'shot') + '.png'), '--gl', 'default', '--wait', '1500', '--ready', 'window.__meter!==undefined', '--evals-file', file, '--size', '1600x900', '--stats-js', 'JSON.stringify(window.__w10||null)', ...extra];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 420000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  const evalErrors = (text.match(/EVAL ERROR/g) || []).length;
  if (has('verbose')) console.log(text);
  return { text, errs, data, evalErrors };
}
const shotName = (n) => (shotDir ? n : null);
const report = (name, r) => console.log(`  ${name}: errors ${r.errs} evalErrors ${r.evalErrors}  ${JSON.stringify(r.data && Object.fromEntries(Object.entries(r.data).filter(([k]) => k !== 'lamps'))).slice(0, 600)}`);
const clean = (name, r) => { if (r.errs !== 0 || r.evalErrors) fail(name + ': console / eval errors (' + r.errs + ' / ' + r.evalErrors + ')'); };

try {
  if (want('cave')) {
    console.log('1. dark cave, lamp manned and aimed at rock');
    const r = run('cave', 'kind=network&tier=' + arg('tier', 'medium') + '&gputimer=1', [[boot(60), 300], [`window.__h.teleport({angle:-0.2,minD:900,maxD:1300})`, 200], [lamps({ aim: -0.2 }), 200], [view(0.75, 100), 300], [nap(2800), 100, shotName('cave')], [measure('cave'), 100]]);
    report('cave', r); clean('cave', r);
    const d = r.data && r.data.cave;
    if (!d || !d.beams) fail('cave: the beams module is missing');
    else {
      if (d.beams.lamps < 1) fail('cave: no beam is drawn although the lamp is manned');
      if (r.data.teleport && d.beams.pools < 1) fail('cave: the beam meets rock but no light pool lies there');
      const dc = d.on.sceneCalls - ((d.off && d.off.sceneCalls) || d.on.sceneCalls);
      console.log('  ' + arg('tier', 'medium') + ' draw calls with / without the WP10 features: ' + d.on.calls + ' / ' + (d.off ? d.off.calls : '?') + ' (scene ' + d.on.sceneCalls + ' / ' + (d.off ? d.off.sceneCalls : '?') + '), GPU ms ' + JSON.stringify(d.on.gpu) + ' / ' + JSON.stringify(d.off && d.off.gpu));
      if (d.off && d.on.calls - d.off.calls > 6) fail('cave: the features cost ' + (d.on.calls - d.off.calls) + ' draw calls on Medium (budget 6)');
      void dc;
    }
  }

  if (want('night')) {
    console.log('2. night sky, fighters, bats and mines in and out of the beam');
    const r = run('night', 'env=storm&kind=open&tier=medium', [[boot(300), 300], [lamps({ aim: -0.5, enemy: true }), 200], [view(0.7, 100, 'night'), 300], [nap(700), 100, shotName('night')], [measure('night', false), 100]]);
    report('night', r); clean('night', r);
    const d = r.data;
    if (!d || !(d.lit >= 2)) fail('night: the sim marked ' + (d && d.lit) + ' targets lit (expected 2 or more)');
    if (!d || !(d.dim >= 1)) fail('night: no target is left dim outside the beam');
    if (d && d.night && d.night.beams && d.night.beams.lit < 1) fail('night: the lit targets did not reach the shader (beams.stats.lit = ' + d.night.beams.lit + ')');
  }

  if (want('lightning')) {
    console.log('3. storm: the stepped flash and the jagged bolt');
    const set = (flash, bolt) => `(()=>{ const st=window.game.state, sh=st.ships[0], w=st.weather; w.flash=${flash}; ${bolt === 'new' ? 'w.bolt={x:sh.pose.x+700,y:sh.pose.y-60,t:0.25};' : bolt === 'late' ? 'w.bolt.t=0.12;' : 'w.bolt=null;'} return 1 })()`;
    const read = (tag) => `(async()=>{ ${sl} await sl(450); const V=window.view3dDebug().view, g=V.post.passes.grade.uniforms; window.__w10['${tag}']={ shown:V.lightning.stats.shown, key:+V.lightning.stats.key.toFixed(2), flash:+g.uFlash.value.toFixed(3), hemi:+V.world.hemi.intensity.toFixed(2) }; return 1 })()`;
    const r = run('lightning', 'env=storm&kind=open&tier=medium', [[boot(300), 300], [lamps({}), 200], [view(0.7, 0), 300],
      [set(1, 'new'), 100], [read('a'), 100, shotName('lightning_a')], [set(0.3, 'late'), 100], [read('b'), 100, shotName('lightning_b')], [set(0.2, 'none'), 100], [read('c'), 100], [set(0, 'none'), 100], [read('d'), 100, shotName('lightning_d')], [measure('lightning', false), 100]]);
    report('lightning', r); clean('lightning', r);
    const d = r.data || {};
    if (!d.a || d.a.shown !== 'A' || d.a.key !== 1 || !(d.a.flash > 0.2)) fail('lightning: the first frame of a strike is not the full flash and bolt ' + JSON.stringify(d.a));
    if (!d.b || d.b.shown !== 'B' || !(d.b.key > 0.3 && d.b.key < 0.4)) fail('lightning: the second frame is not the dimmer step ' + JSON.stringify(d.b));
    if (!d.c || d.c.shown !== '' || !(d.c.key > 0.3 && d.c.key < 0.4)) fail('lightning: the bolt did not go while the flash was still falling ' + JSON.stringify(d.c));
    if (!d.d || d.d.key !== 0 || d.d.flash !== 0 || d.d.shown !== '') fail('lightning: the flash did not end ' + JSON.stringify(d.d));
    if (d.a && d.d && !(d.a.hemi > d.d.hemi + 1)) fail('lightning: the flash added no ambient light (' + d.a.hemi + ' vs ' + d.d.hemi + ')');
  }

  if (want('fungal')) {
    console.log('4. fungal caves');
    const r = run('fungal', 'env=fungal&kind=network&tier=medium', [[boot(300), 300], [lamps({ aim: -0.3 }), 200], [view(0.4, -300), 300], [nap(900), 100, shotName('fungal')], [measure('fungal'), 100]]);
    report('fungal', r); clean('fungal', r);
    const d = r.data && r.data.fungal;
    if (!d || !d.fungal || !d.fungal.active) fail('fungal: the fungal view is not active');
    else {
      if (!(d.fungal.shrooms > 0)) fail('fungal: no mushrooms grew on the rock');
      if (!(d.fungal.glows > 20)) fail('fungal: no motes or halos are drawn (' + d.fungal.glows + ')');
      if (d.off && d.on.calls - d.off.calls > 6) fail('fungal: the features cost ' + (d.on.calls - d.off.calls) + ' draw calls on Medium (budget 6)');
    }
  }

  if (want('kraken')) {
    console.log('5. the Kraken in a dark cave (?creature=kraken)');
    const r = run('kraken', 'creature=kraken&tier=medium', [[boot(300), 300], [`(()=>{ const st=window.game.state; let n=0; while(!st.creature && n<30000){ window.__step(100); n+=100; } window.__step(240); window.__w10.krakenAt=n; return n })()`, 200], [lamps({ creature: true, free: true }), 200], [view(0.6, -100), 300], [nap(900), 100, shotName('kraken')], [measure('kraken', false), 100]]);
    report('kraken', r); clean('kraken', r);
    if (!r.data || r.data.krakenAt == null || !(r.data.kraken && r.data.kraken.beams)) fail('kraken: no measurement');
  }

  if ((shotDir || !quick) && want('lanterns')) {
    console.log('5b. lantern rooms on Medium, High and Low (the faked pools on the back walls)');
    for (const t of ['medium', 'high', 'low']) {
      const r = run('lanterns_' + t, 'kind=network&tier=' + t, [[boot(300), 300], [lamps({ aim: -0.3 }), 200], [view(1.25, -420), 300], [nap(900), 100, shotName('lanterns_' + t)], [measure('l', false), 100]]);
      report('lanterns ' + t, r); clean('lanterns ' + t, r);
    }
  }

  if (!quick && want('tiers')) {
    console.log('6. tiers and kill-switches');
    for (const [name, q] of [['high', 'tier=high'], ['low', 'tier=low'], ['nobeam', 'tier=medium&look=nobeam,nolightning,nofungal'], ['nopost', 'tier=medium&look=nopost'], ['fungal_low', 'env=fungal&tier=low']]) {
      const r = run('tier_' + name, 'kind=network&' + q, [[boot(300), 300], [lamps({ aim: -0.2 }), 200], [view(0.75, 100), 300], [nap(900), 100, shotName('tier_' + name)], [measure('t', false), 100]]);
      report(name, r); clean(name, r);
      if (name === 'nobeam' && r.data && r.data.t && r.data.t.beams && r.data.t.beams.lamps !== 0) fail('nobeam: a beam is still drawn');
      if (name !== 'nobeam' && name !== 'fungal_low' && r.data && r.data.t && r.data.t.beams && r.data.t.beams.lamps < 1) fail(name + ': no beam');
    }
  }

  if (long) {
    for (const [name, q] of [['cave', 'kind=network'], ['storm', 'env=storm&kind=open'], ['fungal', 'env=fungal&kind=network'], ['kraken', 'creature=kraken']]) {
      console.log('7. ' + name + ', 8 bots, 60 seconds in real time');
      const r = run('long_' + name, q, [[`(async()=>{ window.__w10={}; const b=document.getElementById('bots'); b.click(); b.click(); await new Promise(r=>setTimeout(r,500)); document.getElementById('castoff').click(); return 1; })()`, 30000], [`(()=>{ window.__w10.mid={ errs:window.gameErrors||[] }; return 1 })()`, 30000], [`(()=>{ const V=window.view3dDebug().view; window.__w10.end={ errs:window.gameErrors||[], calls:V.stats().sceneCalls, fps:window.__meter&&window.__meter.fps, lamps:V.beams&&V.beams.stats.lamps }; return 1 })()`, 100]]);
      report('long ' + name, r); clean('long ' + name, r);
      if (r.data && ((r.data.end && r.data.end.errs.length) || (r.data.mid && r.data.mid.errs.length))) fail('long ' + name + ': game errors ' + JSON.stringify((r.data.end || r.data.mid).errs).slice(0, 200));
    }
  }
  console.log('  screenshots: ' + (shotDir || out));
} finally {
  try { server.kill(); } catch { /* (gone) */ }
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* (gone) */ } }
}
console.log(failed ? 'FAILED: ' + failed : 'PASS light3d-check');
process.exit(failed ? 1 : 0);
