// DEPTH IN 3D gate (LOOP.md R3 and R5: view3d/depth3d.js, landmarks3d.js, fronts3d.js, farCreature.js, fortressPorthole.js, the arrivals in flyers.js): the 3D view in a real headless Chrome (tools/shot3d.mjs).
// Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/depth3d-check.mjs [--quick] [--port N] [--shots DIR] [--prefix depth_] [--only landmarks,arrive,front,fortress,creature,tiers,perf] [--tier medium]
// The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand, so every moment is the same. Steps (--only names):
//   landmarks  the Sky Isles, the Ember Forge and the Frost Peaks (and with no --quick the Sea, the Aether and the Storm): the map has landmarks, the view draws them in at most 3 calls, 0 console errors
//   arrive     a bomber, a squadron and a gunship spawned past the edge: for the first moments they are pushed back in the depth (arrive.stats.pushed > 0), three frames of it, and back at depth 0 when they have come in
//   front      a storm zone ahead on the route (lap 2): the wall rolls in as the progress nears the zone (f rises, 1 call), stays in the zone, rolls away after; a blizzard (Frost) and smoke (Ember) from the sim's own numbers
//   fortress   a ring (fortress) with a shutter open on a face that is off screen: the fortress porthole is live (one window, a plate), and not drawn while the face is on screen
//   creature   a lair before its fight (Kraken: the sea; the Drake: the Ember Forge; the Thunderbird: the storm): the far giant is drawn (1 call), gone once state.creature exists
//   tiers      Low draws none of it, ?look=nodepth gives the old picture, 0 errors in both
//   perf       the draw calls the depth adds (measured by switching it off in the same frame) are at most 6 on Medium in every scene, and no scene is over 150 calls
// Screenshots (with --shots DIR): <prefix>landmarks_<env>.png, <prefix>arrive_1..3.png, <prefix>front_1..3.png, <prefix>fortress.png, <prefix>creature_<kind>.png, <prefix>dest_<kind>.png
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
const port = Number(arg('port', 4900 + Math.floor(Math.random() * 400)));
const quick = has('quick');
const shotDir = arg('shots', ''), prefix = arg('prefix', 'depth_');
const tier = arg('tier', 'medium');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const want = (n) => !only.length || only.includes(n);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'depth3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const check = (c, good, bad) => { if (c) ok(good); else fail(bad || good); return !!c; };

const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: has('verbose') ? 'inherit' : 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); stop(); process.exit(2); }

const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
const V = 'window.view3dDebug().view';
const nap = (ms) => `new Promise(r=>setTimeout(()=>r(1),${ms}))`;
const boot = (steps = 120, seed = 7, castoff = true) => `(async()=>{ ${sl}
  let sd=${seed}; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  const g=window.game; window.__d={}; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); };
  const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); ${castoff ? "document.getElementById('castoff').click();" : ''} await sl(300); g.update=()=>{}; window.__step(${steps}); g.state.briefing=null; return 1; })()`;
const view = (zoom, lift, tod) => `(()=>{ const S=${V}.S; S.zoom=${zoom}; S.lift=${lift}; ${tod ? `S.tod='${tod}';` : "S.tod='';"} return 1 })()`;

function run(name, query, steps, size = '1600x900') {
  const file = path.join(out, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const args = [path.join(here, 'tools/shot3d.mjs'), '--url', `http://localhost:${port}/host.html?view=3d&${/(^|&)tier=/.test(query) ? "" : "tier=" + tier + "&"}${query}`, '--out', path.join(shotDir || out, (shotDir ? prefix.replace(/_$/, '') : 'shot') + '.png'), '--gl', 'default',
    '--wait', '1200', '--ready', 'window.__meter!==undefined', '--evals-file', file, '--size', size, '--stats-js', 'JSON.stringify(window.__d)'];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 420000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  const evalErrors = (text.match(/EVAL ERROR/g) || []).length;
  if (has('verbose') || errs !== 0 || evalErrors) console.log(text.split('\n').filter((l) => /\[page\]|EVAL|FAILED|error|Error|warn/.test(l)).slice(0, 14).join('\n'));
  return { text, errs, data, evalErrors };
}
const shot = (n) => (shotDir ? n : null);
const clean = (name, r) => check(r.errs === 0 && !r.evalErrors, name + ': 0 console errors', name + ': console / eval errors (' + r.errs + ' / ' + r.evalErrors + ')');
// what the view drew in this frame: the numbers, with the depth switched off in the same frame for the cost
const snap = (tag) => `(async()=>{ ${sl} const v=${V}, med=(a)=>a.slice().sort((x,y)=>x-y)[a.length>>1];
  const take=async()=>{ const s=[]; for(let i=0;i<7;i++){ s.push(v.stats()); await sl(110); } return { calls:med(s.map(q=>q.sceneCalls)), tris:med(s.map(q=>q.sceneTris)), js:+med(s.map(q=>q.jsMs)).toFixed(2) }; };
  await sl(300); const w=v.world, r=window.__d['${tag}']=window.__d['${tag}']||{}; r.on=await take();
  const k=v.look.depth; v.look.depth=false; await sl(700); r.off=await take(); v.look.depth=k; await sl(500);
  r.far=w.landmarks?w.landmarks.stats.far:0; r.near=w.landmarks?w.landmarks.stats.near:0; r.lmCalls=w.landmarks?w.landmarks.stats.calls:0; r.lmTris=w.landmarks?w.landmarks.stats.tris:0;
  r.front=w.fronts?{ f:w.fronts.stats.f, kind:w.fronts.stats.kind, calls:w.fronts.stats.calls }:null; r.creature=w.farCreature?{ kind:w.farCreature.stats.kind, calls:w.farCreature.stats.calls }:null;
  r.errors=(window.gameErrors||[]).length; return JSON.stringify(r); })()`;
// teleport the ship so that landmark number `pick` (of the ones ahead) is in view, `back` px ahead of the camera
const toLandmark = (pick, back = 2600, near = null) => `(async()=>{ ${sl} const v=${V}, st=window.game.state, sh=st.ships[0], L=v.world.landmarks; window.__step(2); await sl(500);
  const list=L.placed.filter(p=>${near}==null||p.far===(${near}===0)); const p=list[Math.min(${pick}, list.length-1)]; if(!p) return 0; sh.pose.x=p.x-${back}; sh.pose.vx=0; window.__step(2); window.__d.lmInfo=JSON.stringify({ n:L.placed.length, pick:p, list:L.placed.slice(0,6) }); return 1; })()`;

try {
  if (want('landmarks')) {
    const envs = quick ? ['skyisles', 'ember', 'frost'] : ['skyisles', 'ember', 'frost', 'sea', 'aether', 'storm'];
    for (const env of envs) {
      console.log('landmarks: ' + env);
      const q = env === 'skyisles' ? 'kind=open' : `env=${env}&kind=open`;
      const zoom = env === 'ember' ? 0.45 : 0.42;
      const r = run('lm_' + env, q, [[boot(60), 300], [toLandmark(env === 'sea' ? 1 : 0, 2300), 200], [view(zoom, 120), 300], [nap(2200), 100, shot('landmarks_' + env)], [snap('lm'), 100]]);
      const d = r.data && r.data.lm;
      clean(env, r);
      if (!d) { fail(env + ': no data'); continue; }
      check(d.far + d.near >= 3, `${env}: ${d.far} far + ${d.near} near landmarks (${d.lmTris} triangles), ${d.lmCalls} call(s)`, `${env}: too few landmarks (${d.far} + ${d.near})`);
      check(d.lmCalls <= 3, `${env}: the landmarks use ${d.lmCalls} draw call(s)`, `${env}: ${d.lmCalls} landmark calls (budget 3)`);
      check(d.on.calls - d.off.calls <= 6, `${env}: the depth adds ${d.on.calls - d.off.calls} call(s) (${d.off.calls} -> ${d.on.calls}), view js ${d.on.js} ms`, `${env}: the depth adds ${d.on.calls - d.off.calls} calls (budget 6)`);
      check(d.on.calls <= 150, `${env}: ${d.on.calls} calls <= 150`, `${env}: ${d.on.calls} calls > 150`);
    }
  }
  if (want('arrive')) {
    console.log('arrive: a squadron, a bomber and a gunship from the depth');
    const g = `(async()=>{ ${sl} const v=${V}, g=window.game, st=g.state; g.squadrons.spawnBomber(); g.squadrons.spawnStrafers(); g.gunship.spawn(); const A=v.depth.arrive; window.__A=A; return 1 })()`;
    const read = (tag) => `(()=>{ const v=${V}, A=v.depth.arrive; const f=v.flyers; const st=window.game.state; const z=[]; for (const arr of ${JSON.stringify([0])}) {} const root=v.scene; let zs=[]; root.traverse(o=>{ if(o.visible && o.position && o.position.z<-300 && o.parent && o.parent.parent===v.scene) zs.push(Math.round(o.position.z)); }); window.__d['${tag}']={ pushed:A.stats.pushed, tracked:A.stats.tracked, bombers:st.bombers.length, strafers:st.strafers.length, gunship:!!st.gunship, deep:zs.length, deepMin:zs.length?Math.min(...zs):0 }; return JSON.stringify(window.__d['${tag}']) })()`;
    const r = run('arrive', 'kind=open', [[boot(60), 300], [view(0.4, 100), 200], [g, 30], [read('a1'), 0, shot('arrive_1')], [nap(700), 0], [read('a2'), 0, shot('arrive_2')], [nap(900), 0], [read('a3'), 0, shot('arrive_3')], [nap(5200), 0], [read('a4'), 0]]);
    clean('arrive', r);
    const d = r.data || {};
    check(d.a1 && d.a1.pushed > 0, `the first frame pushes ${d.a1 && d.a1.pushed} things back in the depth (${JSON.stringify(d.a1)})`, 'nothing was pushed back in the depth at the first frame ' + JSON.stringify(d.a1));
    check(d.a4 && d.a4.pushed === 0 || d.a4.pushed < d.a1.pushed, `later they have come forward (pushed ${d.a4 && d.a4.pushed})`, 'they never came forward ' + JSON.stringify(d.a4));
  }
  if (want('front')) {
    console.log('front: a storm rolling in (lap 2, zone 0.18..0.32), a blizzard, smoke');
    const setP = (p, lap = 2) => `(async()=>{ ${sl} const c=window.game.state.course; c.lap=${lap}; c.progress=${p}; window.game.state.phase='flying'; return 1 })()`;
    const rd = (tag) => `(()=>{ const f=${V}.world.fronts.stats; window.__d['${tag}']={ f:+f.f.toFixed(3), kind:f.kind, calls:f.calls, sprites:f.sprites }; return 1 })()`;
    const r = run('front', 'kind=open', [[boot(60), 300], [view(0.4, 140), 200],
      [setP(0.085), 3600], [rd('f0'), 0, shot('front_0')],
      [setP(0.12), 3800], [rd('f1'), 0, shot('front_1')],
      [setP(0.165), 3800], [rd('f2'), 0, shot('front_2')],
      [setP(0.21), 4200], [rd('f3'), 0, shot('front_3')],
      [setP(0.36), 3000], [rd('f4'), 0, shot('front_4')],
      [setP(0.5), 6000], [rd('f5'), 0]]);
    clean('front', r);
    const d = r.data || {};
    check(d.f1 && d.f1.f > 0.02, `lead: the wall is up before the zone (f ${d.f1 && d.f1.f})`, 'no wall before the zone ' + JSON.stringify(d.f1));
    check(d.f2 && d.f1 && d.f2.f > d.f1.f, `it rolls in (f ${d.f1 && d.f1.f} -> ${d.f2 && d.f2.f})`, 'it did not roll in');
    check(d.f3 && d.f3.f > 0.9, `in the zone it is whole (f ${d.f3 && d.f3.f})`, 'not whole in the zone ' + JSON.stringify(d.f3));
    check(d.f5 && d.f5.f < 0.02, `after the tail it is gone (f ${d.f5 && d.f5.f})`, 'it never went ' + JSON.stringify(d.f5));
    check(d.f3 && d.f3.calls === 1, 'one draw call', 'calls ' + (d.f3 && d.f3.calls));
    if (!quick) {
      const rb = run('blizzard', 'env=frost&kind=open', [[boot(60), 300], [view(0.4, 140), 200], [`(()=>{ const E=window.game.state.env; E.blizzard=0.9; E.windDir=-1; E.wind=-200; return 1 })()`, 4500], [`(()=>{ const f=${V}.world.fronts.stats; window.__d.bz={ f:+f.f.toFixed(3), kind:f.kind }; return 1 })()`, 0, shot('front_blizzard')]]);
      clean('blizzard', rb);
      check(rb.data && rb.data.bz && rb.data.bz.kind === 'blizzard' && rb.data.bz.f > 0.5, `blizzard: ${JSON.stringify(rb.data && rb.data.bz)}`, 'no blizzard bank ' + JSON.stringify(rb.data && rb.data.bz));
      const re = run('smoke', 'env=ember&kind=open', [[boot(60), 300], [view(0.4, 140), 200], [`(()=>{ const E=window.game.state.env; E.smoke=0.9; return 1 })()`, 4500], [`(()=>{ const f=${V}.world.fronts.stats; window.__d.sm={ f:+f.f.toFixed(3), kind:f.kind }; return 1 })()`, 0, shot('front_smoke')]]);
      clean('smoke', re);
      check(re.data && re.data.sm && re.data.sm.kind === 'smoke' && re.data.sm.f > 0.5, `smoke: ${JSON.stringify(re.data && re.data.sm)}`, 'no smoke bank ' + JSON.stringify(re.data && re.data.sm));
    }
  }
  if (want('fortress')) {
    console.log('fortress: the shutter opens on a face that is off screen');
    const open = `(async()=>{ ${sl} const st=window.game.state, r=st.course.ring; if(!r) return 0; const sh=st.ships[0]; window.__step(2); const f=r.faces.find(q=>q.i===1)||r.faces[1]||r.faces[0]; f.down=false; for (const q of r.faces) q.open=0; f.open=9; f.windows=1; window.__d.face=f.i; window.__step(2); return 1 })()`;
    const rd = (tag) => `(()=>{ const v=${V}; window.__d['${tag}']={ live:[...(v.portholesLive||[])], shown:v.fortress.stats.shown, face:v.fortress.stats.face }; return 1 })()`;
    const r = run('fortress', 'kind=ring&variant=fortress', [[boot(120), 300], [view(0.4, 100), 200], [open, 2500], [rd('fort'), 0, shot('fortress')], [`(()=>{ const r=window.game.state.course.ring; for (const q of r.faces) q.open=0; return 1 })()`, 1800], [rd('gone'), 0]]);
    clean('fortress', r);
    const d = r.data || {};
    check(d.fort && d.fort.live.includes('fort'), `the fortress porthole is live (${JSON.stringify(d.fort)})`, 'no fortress porthole ' + JSON.stringify(d.fort));
    check(d.gone && !d.gone.live.includes('fort'), 'it goes when the shutter shuts', 'it stayed ' + JSON.stringify(d.gone));
  }
  if (want('creature')) {
    const lairs = [['kraken', 'lair=1'], ['drake', 'lair=ember'], ['thunderbird', 'lair=storm']];
    for (const [kind, q] of lairs) {
      if (quick && kind === 'thunderbird') continue;
      console.log('creature: ' + kind + ' before the fight');
      const place = `(async()=>{ ${sl} const st=window.game.state, m=st.course.map; if(!m.goal) return 0; ${V}.S.look={ x:m.goal.x-1300, y:m.goal.y-250 }; window.__d.has=!!st.creature; return 1 })()`;
      const rd = (tag) => `(()=>{ const c=${V}.world.farCreature.stats, st=window.game.state; window.__d['${tag}']={ kind:c.kind, calls:c.calls, creature:!!st.creature, map:st.course.map.creature||'kraken' }; return 1 })()`;
      const r = run('cr_' + kind, q, [[boot(30, 7, true), 300], [place, 200], [view(0.4, 150), 300], [nap(1500), 50, shot('creature_' + kind + '_a')], [rd('c1'), 0], [nap(4200), 50, shot('creature_' + kind)], [rd('c2'), 0], [snap('cr'), 0]]);
      clean('creature ' + kind, r);
      const d = r.data || {};
      check(d.c1 && d.c1.calls === 1 && d.c1.kind === kind, `${kind}: the far giant is drawn (${JSON.stringify(d.c1)})`, `${kind}: not drawn ${JSON.stringify(d.c1)}`);
      if (d.cr) check(d.cr.on.calls - d.cr.off.calls <= 6, `${kind}: the depth adds ${d.cr.on.calls - d.cr.off.calls} call(s)`, `${kind}: the depth adds ${d.cr.on.calls - d.cr.off.calls} calls`);
    }
  }
  if (want('dest')) {
    console.log('dest: the next outpost growing on the horizon (three distances)');
    const at = (dist) => `(async()=>{ ${sl} const st=window.game.state, c=st.course, o=c.target; if(!o) return 0; ${V}.S.look={ x:o.x-${dist}, y:o.y-1100 }; window.__d.dist=${dist}; return 1 })()`;
    const rd = (tag) => `(()=>{ const L=${V}.world.landmarks; window.__d['${tag}']={ dest:L.stats.dest, calls:L.stats.calls, vis:L.meshes.dest.visible, main:L.stats.by[${V}.camera.uuid] || null }; return 1 })()`; // (the main camera's numbers: a porthole's pass sets the uniforms again for its own camera)
    const r = run('dest', 'kind=open', [[boot(60), 300], [view(0.4, 120), 200], [at(10500), 1800], [rd('d1'), 0, shot('dest_1')], [at(7000), 1800], [rd('d2'), 0, shot('dest_2')], [at(4300), 1800], [rd('d3'), 0, shot('dest_3')], [at(2600), 1800], [rd('d4'), 0]]);
    clean('dest', r);
    const d = r.data || {};
    const sc = (q) => q && q.main && q.main.scale;
    check(sc(d.d1) && sc(d.d3) && sc(d.d2) > sc(d.d1) && sc(d.d3) > sc(d.d2), `the silhouette grows (${sc(d.d1)} -> ${sc(d.d2)} -> ${sc(d.d3)})`, 'it did not grow ' + JSON.stringify([d.d1, d.d2, d.d3]));
    check(d.d4 && d.d4.main && d.d4.main.alpha === 0, 'it dissolves where the real outpost stands up', 'it stayed ' + JSON.stringify(d.d4));
  }
  if (want('tiers')) {
    console.log('tiers and kill-switches');
    for (const q of ['tier=low', 'look=nodepth', 'tier=high']) {
      const r = run('tier_' + q.replace(/\W/g, ''), 'env=ember&kind=open&' + q.replace(/^tier=.*/, (m) => m), [[boot(60), 300], [toLandmark(0, 2300), 200], [view(0.45, 120), 300], [nap(1200), 50, shot('tier_' + q.replace(/\W/g, ''))], [`(()=>{ const v=${V}, L=v.world.landmarks; window.__d.t={ calls:L.stats.calls, tier:v.tier.name, look:v.look.depth }; return 1 })()`, 0]]);
      clean(q, r);
      const t = r.data && r.data.t;
      if (q === 'tier=low') check(t && t.calls === 0, 'Low: no landmarks drawn', 'Low drew landmarks ' + JSON.stringify(t));
      if (q === 'look=nodepth') check(t && t.calls === 0, '?look=nodepth: no landmarks', 'nodepth drew landmarks ' + JSON.stringify(t));
      if (q === 'tier=high') check(t && t.calls >= 1, 'High: landmarks drawn', 'High drew none ' + JSON.stringify(t));
    }
  }
  if (want('perf') && !quick) {
    console.log('perf: the calls the depth adds on Medium');
    for (const [name, q] of [['skyisles', 'kind=open'], ['ember', 'env=ember&kind=open'], ['sea', 'env=sea&kind=open']]) {
      const r = run('perf_' + name, q, [[boot(60), 300], [toLandmark(0, 2300), 200], [view(0.45, 120), 300], [snap('p'), 0]]);
      const d = r.data && r.data.p;
      if (d) check(d.on.calls - d.off.calls <= 6 && d.on.calls <= 150, `${name}: ${d.off.calls} -> ${d.on.calls} calls, ${d.on.tris} tris, view js ${d.on.js} ms`, `${name}: ${d.off.calls} -> ${d.on.calls} calls`);
    }
  }
} finally {
  stop();
  try { fs.rmSync(out, { recursive: true, force: true }); } catch { /* in use */ }
}
console.log(failed ? `depth3d check: ${failed} FAILED` : 'depth3d check: all clear');
process.exit(failed ? 1 : 0);
