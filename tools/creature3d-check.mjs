// CREATURE KIT (WP8) gate: the Kraken in 3D in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/creature3d-check.mjs [--port N (default: a random one in 4600-4999)] [--quick] [--long]      (--long adds a 3 minute real-time run with 8 bots)
// The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand, so every moment is exact. Checks (each must print 0 console errors):
//   1. the Sunken Sea lair (open sky): it rises, a tentacle wraps the ship (the limb takes its depth from the coil), the beak opens, a limb is severed (the chunk becomes a Rapier body), phase 3 (the heart),
//      a breach (shadow, burst, crash), the death; the creature view costs at most 12 draw calls and 60k triangles at rest, and its own JS stays small
//   2. the same in a dark cave (host.html?creature=kraken): parts dim unless lit, eyes glow
//   3. the Low tier (?tier=low)
//   4. (--long) host.html?creature=kraken for 3 minutes with 8 bot crew, in real time
// Screenshots go to a temp folder (printed), not into the repo.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const port = Number(argv.includes('--port') ? argv[argv.indexOf('--port') + 1] : 4600 + Math.floor(Math.random() * 400));
const quick = argv.includes('--quick'), long = argv.includes('--long');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'creature3d-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };

const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: argv.includes('--verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/host.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }

const view = 'window.view3dDebug().view';
const sl = 'const sl=(ms)=>new Promise(r=>setTimeout(r,ms));';
// one run of the page: steps = [[js, waitMs, shotName?]]; the page keeps its findings in window.__wp8
function run(name, query, steps, extra = []) {
  const file = path.join(out, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const args = ['tools/shot3d.mjs', '--url', `http://localhost:${port}/host.html?view=3d&${query}`, '--out', path.join(out, name + '.png'), '--gl', 'default', '--wait', '1500', '--ready', 'window.__meter!==undefined', '--evals-file', file, '--size', '1280x720', '--stats-js', 'JSON.stringify(window.__wp8||null)', ...extra];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 420000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  const evalErrors = (text.match(/EVAL ERROR/g) || []).length;
  return { text, errs, data, evalErrors };
}
// the common setup: freeze the sim, step it by hand until the creature exists, knock the crew out so the bots do not interfere
const setup = [`(async()=>{ ${sl} const g=window.game; window.__wp8={}; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); };
  window.__cr=()=>g.state.creature; window.__imp=(p)=>import(p); window.__until=(f,max=6000)=>{ let n=0; while(!f() && n<max){ window.__step(5); n+=5; } return n; };
  const B=document.getElementById('bots'); B.click(); B.click(); await sl(500); document.getElementById('castoff').click(); await sl(800);
  let n=0; while(!g.state.creature && n<30000){ window.__step(200); n+=200; } g.update=()=>{}; for(const p of Object.values(g.state.players)) p.ko=1e6; window.__wp8.spawnSteps=n; return n; })()`, 600];
const measure = (tag) => [`(async()=>{ ${sl} const v=${view}, k=v.kraken, r=k.rig; await sl(500); const a=v.stats(); const up=k.update; k.update=()=>{ k.root.visible=false; r.foam.mesh.visible=false; r.shadow.hide(); r.markers.mesh.visible=false; r.ropes.group.visible=false; }; await sl(500); const b=v.stats(); k.update=up; await sl(300);
  let meshes=0; const walk=(o)=>{ if((o.isMesh) && o.visible){ let p=o, vis=true; while(p){ if(!p.visible) vis=false; p=p.parent; } if(vis) meshes++; } o.children.forEach(walk); }; walk(k.root); for (const m of [r.foam.mesh, r.shadow.mesh, r.markers.mesh, r.ropes.group]) walk(m);
  window.__wp8['${tag}']={ calls:a.sceneCalls-b.sceneCalls, tris:a.sceneTris-b.sceneTris, meshes, js:a.jsMs, headTris:r.head.tris+r.head.dynTris, limbTris:r.tubes.stats().tris }; return JSON.stringify(window.__wp8['${tag}']); })()`, 200];

try {
  console.log('1. lair (open sky): rise, wrap, beak, chunk, phase 3, breach, death');
  const steps = [
    setup,
    [`(()=>{ window.__step(500); ${view}.S.focus={dx:0,dy:-300}; ${view}.S.zoom=0.9; return 1 })()`, 600, 'idle'],
    measure('rest'),
    [`(()=>{ const cr=__cr(); const n=__until(()=>(cr.grips||[]).some(x=>x.mode==='hold')); window.__step(55); window.__wp8.wrap={ hold:(cr.grips||[]).some(x=>x.mode==='hold') }; return 1 })()`, 600, 'wrap'],
    [`(()=>{ const cr=__cr(); const l=(cr.grips||[]).find(x=>x.mode==='hold'); const R=${view}.kraken.rig; let behind=0, front=0; if(l&&l.limb.wrap){ const i=R.limbs.indexOf(l.limb), L=R.tubes.limbs[i]; for(let k=0;k<L.nr;k++){ const z=L.P[k*3+2]; if(z<-100) behind++; if(z>100) front++; } } window.__wp8.wrap={ hold:!!l, wrapped:!!(l&&l.limb.wrap), behind, front }; return JSON.stringify(window.__wp8.wrap) })()`, 100],
    [`(()=>{ const cr=__cr(); cr.ai.breather=0; cr.ai.mouthT=0.01; const n=__until(()=>cr.mouthWin,2000); window.__step(40); const m=cr.parts.find(p=>p.kind==='mouth'); window.__wp8.beak={ win:!!cr.mouthWin, open:m.openAmt }; return JSON.stringify(window.__wp8.beak) })()`, 500, 'beak'],
    [`(async()=>{ const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=st.creature; cr.mouthWin=null; const alive=cr.parts.filter(p=>p.kind==='tentacle'&&!p.severed&&!p.dead); const t=alive.filter(p=>p.segs.length>=6).pop(); const r=cs.hurtCreature(st,{part:t,seg:3},t.hp+1,{who:null,src:'shell'}); window.__step(14); const D=${view}.destruction; window.__wp8.chunk={ severed:!!(r&&r.sever), simChunks:cr.chunks.length }; return JSON.stringify(window.__wp8.chunk) })()`, 700, 'chunk'],
    [`(async()=>{ ${sl} await sl(1500); const D=${view}.destruction; window.__wp8.chunkLater={ bodies:D.chunks.length, viewChunks:${view}.kraken.rig.chunks.size, physics:!!D.physics, wet:D.chunks.some(c=>c.wet) }; return JSON.stringify(window.__wp8.chunkLater) })()`, 100],
    [`(()=>{ const cr=__cr(); cr.hp=cr.maxHp*0.2; window.__step(280); const h=cr.parts.find(p=>p.kind==='heart'); window.__wp8.phase3={ phase:cr.phase, heart:!h.hidden }; return JSON.stringify(window.__wp8.phase3) })()`, 600, 'phase3'],
    [`(async()=>{ const br=await __imp('/modules/host/creatureBreach.js'); const st=window.game.state, cr=st.creature; cr.mouthWin=null; cr.mode='idle'; br.startBreach(st,cr,st.ships[0]); window.__step(78+40); window.__wp8.breach={ warn:cr.breach&&cr.breach.phase }; return 1 })()`, 500, 'breach'],
    [`(async()=>{ const cr=window.game.state.creature; window.__wp8.breach.shadowShown=${view}.kraken.rig.shadow.mesh.visible; window.__step(110); window.__wp8.breach.up=cr.breach&&cr.breach.splashUp; return JSON.stringify(window.__wp8.breach) })()`, 500, 'burst'],
    [`(async()=>{ const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=st.creature; cr.breachDy=0; cr.mode='idle'; cr.breach=null; cr.hp=0; const m=cr.parts.find(p=>p.kind==='mantle'); const r=cs.hurtCreature(st,{part:m,seg:0},1,{who:null,src:'shell'}); window.__step(60); window.__wp8.death={ killed:!!(r&&r.killed), mode:cr.mode }; window.__step(500); window.__wp8.gone=!window.game.state.creature; return JSON.stringify(window.__wp8.death) })()`, 800, 'death'],
    [`(async()=>{ ${sl} await sl(500); const k=${view}.kraken; window.__wp8.hiddenAfter=!k.root.visible; window.__wp8.errors=window.gameErrors||[]; return 1 })()`, 100],
  ];
  const r1 = run('lair', 'lair=1', steps);
  const d = r1.data || {};
  console.log('  errors ' + r1.errs + ' evalErrors ' + r1.evalErrors + '  ' + JSON.stringify(d).slice(0, 700));
  if (r1.errs !== 0 || r1.evalErrors) fail('console / eval errors in the lair run');
  if (!d.rest) fail('no measurement');
  else {
    if (d.rest.meshes > 12) fail('the creature draws ' + d.rest.meshes + ' meshes (budget 12)');
    if (d.rest.tris > 60000) fail('the creature is ' + d.rest.tris + ' triangles with ink (budget 60000)');
    if (d.rest.js > 2) fail('the frame JS is ' + d.rest.js + ' ms');
  }
  if (!d.wrap || !d.wrap.hold) fail('no tentacle held the ship');
  else if (!d.wrap.wrapped || d.wrap.behind + d.wrap.front < 2) fail('the coil did not get its own depth (behind ' + d.wrap.behind + ', front ' + d.wrap.front + ')');
  if (!d.beak || !d.beak.win || !(d.beak.open > 0.9)) fail('the beak did not open');
  if (!d.chunk || !d.chunk.severed || !d.chunkLater || d.chunkLater.bodies < 1 || d.chunkLater.viewChunks < 1) fail('the severed limb did not become a wreckage body');
  if (!d.phase3 || d.phase3.phase !== 3 || !d.phase3.heart) fail('phase 3 / the heart');
  if (!d.breach || d.breach.warn !== 'warn' || !d.breach.up || !d.breach.shadowShown) fail('the breach did not show its shadow and burst');
  if (!d.death || !d.death.killed || !d.gone || !d.hiddenAfter) fail('the death: it sinks, goes, and the view hides');
  if (d.errors && d.errors.length) fail('game errors: ' + JSON.stringify(d.errors).slice(0, 200));

  if (!quick) {
    console.log('2. dark cave (host.html?creature=kraken): dim unless lit, eyes glow');
    const cave = [setup, [`(()=>{ const cr=__cr(); window.__step(500); cr.parts.forEach(p=>{ p.lit=false; }); const m=cr.parts.find(p=>p.kind==='mantle'); const e=cr.parts.filter(p=>p.kind==='eye'); m.lit=true; e[0].lit=true; ${view}.S.focus={dx:0,dy:-200}; ${view}.S.zoom=0.9; return 1 })()`, 600, 'cave'], measure('cave'), [`(()=>{ window.__wp8.errors=window.gameErrors||[]; return 1 })()`, 100]];
    const r2 = run('cave', 'creature=kraken', cave);
    console.log('  errors ' + r2.errs + '  ' + JSON.stringify(r2.data).slice(0, 300));
    if (r2.errs !== 0 || r2.evalErrors) fail('console / eval errors in the cave run');
    if (!r2.data || !r2.data.cave || r2.data.cave.meshes > 12) fail('the cave creature draws too much');

    console.log('3. Low tier (?tier=low)');
    const low = [setup, [`(()=>{ window.__step(600); ${view}.S.focus={dx:0,dy:-300}; ${view}.S.zoom=0.9; return 1 })()`, 600, 'low'], measure('low'), [`(()=>{ window.__wp8.errors=window.gameErrors||[]; return 1 })()`, 100]];
    const r3 = run('low', 'lair=1&tier=low', low);
    console.log('  errors ' + r3.errs + '  ' + JSON.stringify(r3.data).slice(0, 300));
    if (r3.errs !== 0 || r3.evalErrors) fail('console / eval errors on the Low tier');
    if (!r3.data || !r3.data.low || r3.data.low.tris > 60000) fail('the Low tier creature is too big');
  }
  if (long) {
    console.log('4. host.html?creature=kraken, 8 bots, 3 minutes in real time');
    const lg = [[`(async()=>{ window.__wp8={}; const b=document.getElementById('bots'); b.click(); b.click(); await new Promise(r=>setTimeout(r,500)); document.getElementById('castoff').click(); return 1; })()`, 90000], [`(()=>{ window.__wp8.mid={ has:!!window.game.state.creature, errs:window.gameErrors||[] }; return 1 })()`, 90000], [`(()=>{ window.__wp8.end={ has:!!window.game.state.creature, errs:window.gameErrors||[], calls:${view}.stats().sceneCalls, fps:window.__meter&&window.__meter.fps }; return 1 })()`, 100]];
    const r4 = run('long', 'creature=kraken', lg);
    console.log('  errors ' + r4.errs + '  ' + JSON.stringify(r4.data).slice(0, 300));
    if (r4.errs !== 0 || r4.evalErrors) fail('console / eval errors in the long run');
    if (r4.data && ((r4.data.end && r4.data.end.errs.length) || (r4.data.mid && r4.data.mid.errs.length))) fail('game errors in the long run');
  }
  console.log('  screenshots: ' + out);
} finally {
  try { server.kill(); } catch { /* (gone) */ }
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* (gone) */ } }
}
console.log(failed ? 'FAILED: ' + failed : 'PASS creature3d-check');
process.exit(failed ? 1 : 0);
