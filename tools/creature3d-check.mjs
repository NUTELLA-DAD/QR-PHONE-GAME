// CREATURE KIT (WP8) gate: the Kraken in 3D in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/creature3d-check.mjs [--port N (default: a random one in 4600-4999)] [--quick] [--long]      (--long adds a 3 minute real-time run with 8 bots)
// The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand, so every moment is exact. Checks (each must print 0 console errors):
//   1. the Sunken Sea lair (open sky): it rises, a tentacle wraps the ship (the limb takes its depth from the coil), the beak opens, a limb is severed (the chunk becomes a Rapier body), phase 3 (the heart),
//      a breach (shadow, burst, crash), the death; the creature view costs at most 12 draw calls and 60k triangles at rest, and its own JS stays small
//   2. the same in a dark cave (host.html?creature=kraken): parts dim unless lit, eyes glow
//   3. the Low tier (?tier=low)
//   4. THE CINDER DRAKE (host.html?creature=drake&lair=ember; skip with --no-drake): it arrives, breathes (the throat glow rises in steps, the jaw opens, the flame cone is drawn), swoops (the strike ring), perches
//      (talons on the bag, the timer ring), a lava spout erupts, a wing tears off (a Rapier body with its skin), it crashes and crawls, a harpoon line is drawn, it dies in the lava; at most 12 meshes / 60k triangles
//   4b. THE THUNDERBIRD (host.html?lair=storm; skip with --no-bird; 3D.md section 26): it arrives within the budget (at most 12 meshes, 60k triangles), soars (every feather placed, the crackle), calls (the beak opens, the
//       charge and the arcs rise), holds a bolt (the tether to the rod), swallows (the breast shield lifts in steps, the stone shows), a bolt it called starts at its beak, a blow scatters feathers, a wing is plucked (a Rapier
//       body with its own feathers), it dies (a flash, feathers) and the view hides; then the Low tier
//   5. (--long) host.html?creature=kraken for 3 minutes with 8 bot crew, in real time
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
  if (!argv.includes('--no-drake')) {
    // THE CINDER DRAKE (3D.md section 24): the Ember Forge's dragon, step by step: it arrives, breathes (the throat glows in steps, the cone is drawn and lights the ship), swoops (the strike ring), perches (the talons
    // grip the bag, the timer ring), a lava spout erupts, a wing is torn off (a Rapier body), it crashes and crawls, a harpoon line is drawn, it dies in the lava. Each moment is read from the live rig
    // (view.kraken.rig) after the frame had time to draw it; the creature costs at most 12 meshes and 60k triangles at rest.
    console.log('4. the Cinder Drake (host.html?creature=drake&lair=ember): arrive, breath, swoop, perch, spout, wing tear, crawl, harpoon, death');
    const cfgW = (w) => `(await __imp('/config.js')).config.CREATURES.DRAKE.ATTACK.WEIGHTS=${w};`;
    const meas = `window.__meas=()=>{ const k=${view}.kraken, r=k.rig; let meshes=0, tris=0; const walk=(o)=>{ let v=true, p=o; while(p){ if(!p.visible) v=false; p=p.parent; } if(o.isMesh && v){ meshes++; const g=o.geometry; let t=(g.index?g.index.count:g.attributes.position.count)/3; if(o.isInstancedMesh) t*=o.count; tris+=t; } o.children.forEach(walk); }; walk(k.root); if(r.ext&&r.ext.fx) walk(r.ext.fx.vol.mesh); for (const m of [r.foam.mesh, r.shadow.mesh, r.markers.mesh, r.ropes.group]) walk(m); return { meshes, tris:Math.round(tris) }; };`;
    const dsteps = [
      setup,
      [`(async()=>{ ${sl} ${meas} window.__step(500); ${view}.S.focus={dx:0,dy:0}; ${view}.S.zoom=0.5; await sl(700); const k=${view}.kraken, r=k.rig, cr=__cr(); const m=window.__meas(); window.__wp8.arrive={ ext:!!(r&&r.ext), mode:cr.drake.mode, visible:k.root.visible, meshes:m.meshes, tris:m.tris, js:${view}.stats().jsMs, glowEyes:r.glow[0] }; return JSON.stringify(window.__wp8.arrive) })()`, 400, 'arrive'],
      // the breath: only breath attacks; the wind-up (throat glow in steps, the jaw open), then the sweep (the cone, the light)
      [`(async()=>{ ${sl} ${cfgW('{breath:1,swoop:0,perch:0}')} const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; dk.nextT=0; cr.ai.breather=0; __until(()=>dk.act&&dk.act.kind==='breath'&&dk.act.sub==='glow',4000); window.__step(30); await sl(500);
        const mo=cr.parts.find(p=>p.kind==='mouth'), g1=r.glow[2]; window.__step(40); await sl(500); const g2=r.glow[2]; const P=r.P;
        window.__wp8.breath={ glow1:g1, glow2:g2, shut:P.THROAT_GLOW.shut, open:mo.openAmt, jawPlaced:!!(r.ext.set.pieces.jaw.key&&r.ext.set.pieces.jaw.key!=='hidden') };
        __until(()=>cr.flame,600); window.__step(20); await sl(600); const f=r.ext.fx; window.__wp8.sweep={ flame:!!cr.flame, vol:f.vol.mesh.visible, light:f.light.intensity, scorch:${view}.damage ? 1 : 0, meas:window.__meas() }; return JSON.stringify(window.__wp8.sweep) })()`, 400, 'breath'],
      [`(async()=>{ ${sl} ${cfgW('{breath:0,swoop:1,perch:0}')} const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; window.__step(120); dk.act=null; dk.nextT=0; cr.ai.breather=0; __until(()=>dk.act&&dk.act.kind==='swoop'&&dk.act.sub==='dive',4000); window.__step(6); await sl(500); window.__wp8.swoop={ act:dk.act&&dk.act.sub, ring:r.markers.mesh.visible, rot:cr.rot }; return JSON.stringify(window.__wp8.swoop) })()`, 300, 'swoop'],
      // the perch: the talons on the bag (feet placed), the bag sagging under it, the timer ring, the body at the bag's depth
      [`(async()=>{ ${sl} const D=(await __imp('/config.js')).config.CREATURES.DRAKE; D.ATTACK.WEIGHTS={breath:0,swoop:0,perch:1}; D.ATTACK.FIRST_PERCH=0; D.ATTACK.PERCH_EVERY=0; const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; window.__step(200); dk.act=null; dk.nextT=0; cr.ai.breather=0; dk.lastPerch=-999;
        __until(()=>dk.mode==='perch'&&dk.perch&&dk.perch.landed,5000); window.__step(40); await sl(600); const S=r.ext.set.pieces; const placed=(n)=>!!(S[n].key&&S[n].key!=='hidden');
        window.__wp8.perch={ landed:!!(dk.perch&&dk.perch.landed), feet:placed('footA')&&placed('footB'), sag:!![...${view}.models.values()].some(e=>e.model.dyn.bags.some(b=>b.node.userData.drakeSag)), ring:r.markers.mesh.visible, z:r.hg.position.z, rot:cr.rot, meas:window.__meas() }; return JSON.stringify(window.__wp8.perch) })()`, 300, 'perch'],
      // a lava spout: step until one erupts; its column is a fire volume
      [`(async()=>{ ${sl} const D=(await __imp('/config.js')).config.CREATURES.DRAKE; D.ATTACK.WEIGHTS={breath:0,swoop:0,perch:0}; const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; if(dk.perch){ dk.perch.left=0; } window.__step(300); const n=__until(()=>(dk.spouts||[]).some(s=>s.st==='erupt'),4000); window.__step(10); await sl(600);
        window.__wp8.spout={ n, spouts:(dk.spouts||[]).map(s=>s.st), vol:r.ext.fx.vol.mesh.visible }; return JSON.stringify(window.__wp8.spout) })()`, 300, 'spout'],
      // the wing tears off: a Rapier body with its skin; then it crashes and crawls
      [`(async()=>{ ${sl} const D=(await __imp('/config.js')).config.CREATURES.DRAKE; D.ATTACK.WEIGHTS={breath:0,swoop:0,perch:0}; const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; if(dk.act) dk.act=null; cr.hp=cr.maxHp*0.5; window.__step(8); await sl(1500); const Dd=${view}.destruction;
        window.__wp8.tear={ mode:dk.mode, simChunks:cr.chunks.length, bodies:Dd.chunks.length, viewChunks:r.chunks.size, extra:[...r.chunks.values()].some(e=>e.extra), stump:cr.parts.filter(p=>p.kind==='wing'&&p.severed).length, meas:window.__meas() }; return JSON.stringify(window.__wp8.tear) })()`, 300, 'tear'],
      [`(async()=>{ ${sl} const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; const n=__until(()=>dk.mode==='crawl',4000); window.__step(60); await sl(600);
        window.__wp8.crawl={ n, mode:dk.mode, phase:cr.phase, headPlaced:!!(r.ext.set.pieces.head.key&&r.ext.set.pieces.head.key!=='hidden'), z:r.hg.position.z }; return JSON.stringify(window.__wp8.crawl) })()`, 300, 'crawl'],
      // a harpoon line made fast to its body (the generic rope, ending at the Drake's own depth)
      [`(async()=>{ ${sl} const ct=await __imp('/modules/host/creatureTow.js'); const st=window.game.state, k=${view}.kraken, r=k.rig, cr=__cr(), ship=st.ships[0]; const tor=cr.parts.find(p=>p.kind==='mantle'), s=tor.segs[0]; const ref=ship.layout.refPoint; ct.creatureLatch(st, ship, { part:tor, seg:0, x:s.x+150, y:s.y, d:1800 }, { x:ref.x, y:ref.y }, null, null); window.__step(40); await sl(700); window.__wp8.rope={ visible:r.ropes.group.visible, lines:cr.harpoons.length }; cr.harpoons=[]; return JSON.stringify(window.__wp8.rope) })()`, 300, 'rope'],
      // the death: it falls into the lava; the view hides it when it is gone
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, k=${view}.kraken, cr=__cr(); cr.hp=1; const m=cr.parts.find(p=>p.kind==='mantle'); const rr=cs.hurtCreature(st,{part:m,seg:0},50,{who:null,src:'shell'}); window.__step(30); await sl(500);
        window.__wp8.death={ killed:!!(rr&&rr.killed), mode:cr.mode }; window.__step(700); await sl(900); window.__wp8.gone=!window.game.state.creature; window.__wp8.hiddenAfter=!k.root.visible; window.__wp8.errors=window.gameErrors||[]; return JSON.stringify(window.__wp8.death) })()`, 300, 'death'],
    ];
    const rd = run('drake', 'creature=drake&lair=ember', dsteps);
    const dd = rd.data || {};
    console.log('  errors ' + rd.errs + ' evalErrors ' + rd.evalErrors + '  ' + JSON.stringify(dd).slice(0, 900));
    if (rd.errs !== 0 || rd.evalErrors) fail('console / eval errors in the Drake run');
    if (!dd.arrive || !dd.arrive.ext || !dd.arrive.visible) fail('the Drake view (rig.ext) was not built');
    else {
      if (dd.arrive.meshes > 12) fail('the Drake draws ' + dd.arrive.meshes + ' meshes (budget 12)');
      if (dd.arrive.tris > 60000) fail('the Drake is ' + dd.arrive.tris + ' triangles with ink (budget 60000)');
      if (dd.arrive.js > 2.5) fail('the frame JS is ' + dd.arrive.js + ' ms');
    }
    if (!dd.breath || !(dd.breath.glow2 > dd.breath.glow1 && dd.breath.glow1 > dd.breath.shut) || !(dd.breath.open > 0.9) || !dd.breath.jawPlaced) fail('the breath: the throat glow did not rise in steps / the jaw did not open ' + JSON.stringify(dd.breath));
    if (!dd.sweep || !dd.sweep.flame || !dd.sweep.vol) fail('the breath cone was not drawn');
    if (dd.sweep && dd.sweep.meas && dd.sweep.meas.meshes > 12) fail('the Drake draws ' + dd.sweep.meas.meshes + ' meshes while it breathes');
    if (!dd.swoop || dd.swoop.act !== 'dive' || !dd.swoop.ring) fail('the swoop ring was not drawn');
    if (!dd.perch || !dd.perch.landed || !dd.perch.feet || !dd.perch.ring || !dd.perch.sag) fail('the perch: talons / bag sag / timer ring ' + JSON.stringify(dd.perch));
    if (!dd.spout || !dd.spout.vol) fail('a lava spout column was not drawn');
    if (!dd.tear || dd.tear.stump < 1 || dd.tear.bodies < 1 || dd.tear.viewChunks < 1 || !dd.tear.extra) fail('the torn wing did not become a Rapier body with its skin ' + JSON.stringify(dd.tear));
    if (!dd.crawl || dd.crawl.mode !== 'crawl' || dd.crawl.phase < 2 || !dd.crawl.headPlaced) fail('the crawl');
    if (!dd.rope || !dd.rope.visible) fail('the harpoon line was not drawn on the Drake');
    if (!dd.death || !dd.death.killed || !dd.gone || !dd.hiddenAfter) fail('the death: it dies, goes, and the view hides');
    if (dd.errors && dd.errors.length) fail('game errors in the Drake run: ' + JSON.stringify(dd.errors).slice(0, 200));
    // the Low tier (fewer sides, fewer particles, no warm light) breathes and perches with 0 errors and a smaller model
    const lowSteps = [
      setup,
      [`(async()=>{ ${sl} ${meas} window.__step(500); await sl(600); const k=${view}.kraken, r=k.rig; window.__wp8.low={ ext:!!(r&&r.ext), meas:window.__meas() }; return 1 })()`, 300],
      [`(async()=>{ ${sl} ${cfgW('{breath:1,swoop:0,perch:0}')} const k=${view}.kraken, r=k.rig, cr=__cr(), dk=cr.drake; dk.nextT=0; cr.ai.breather=0; __until(()=>cr.flame,4000); window.__step(20); await sl(700); window.__wp8.lowBreath={ flame:!!cr.flame, vol:r.ext.fx.vol.mesh.visible, light:r.ext.fx.light.intensity, meas:window.__meas() }; window.__wp8.errors=window.gameErrors||[]; return 1 })()`, 300, 'drakelow'],
    ];
    const rl = run('drakelow', 'creature=drake&lair=ember&tier=low', lowSteps);
    console.log('  low tier: errors ' + rl.errs + '  ' + JSON.stringify(rl.data).slice(0, 400));
    if (rl.errs !== 0 || rl.evalErrors) fail('console / eval errors on the Drake at the Low tier');
    if (!rl.data || !rl.data.low || !rl.data.low.ext || rl.data.low.meas.tris > 45000) fail('the Low tier Drake is missing or too big');
    if (!rl.data || !rl.data.lowBreath || !rl.data.lowBreath.flame || !rl.data.lowBreath.vol || rl.data.lowBreath.light !== 0) fail('the Low tier breath: the cone is drawn and the warm light stays off ' + JSON.stringify(rl.data && rl.data.lowBreath));
    if (rl.data && rl.data.errors && rl.data.errors.length) fail('game errors in the Drake Low tier run');
  }
  if (!argv.includes('--no-bird')) {
    // THE THUNDERBIRD (3D.md section 26): the storm-bird in the Storm Front's lair, step by step. The bird is put away from the ship and posed by hand (the sim is frozen: creature.js stepBody + the pose names of
    // creatures/thunderbird.js), so every moment is exact. Checked: it arrives (at most 12 meshes and 60k triangles with ink, a small frame JS), soars (the feathers placed, the crackle on its wings), calls (the beak
    // opens in steps, more charge, more arcs), holds a bolt (the tether to the rod), swallows (the breast shield lifts in steps and the gizzard's stone shows, arcs round it), a bolt it called starts at ITS BEAK
    // (lightning.js), a blow scatters feathers, a wing is plucked (a Rapier body with its own feathers), it dies (feathers, a flash) and the view hides; then the Low tier. Screenshots are in the temp folder.
    console.log('4b. the Thunderbird (host.html?lair=storm): arrive, soar, call, tether, swallow (the shield lifts), the bolt from its beak, a blow, a plucked wing, death; then Low');
    const bmeas = `window.__meas=()=>{ const k=${view}.kraken, r=k.rig, e=r.ext; let meshes=0, tris=0; const walk=(o)=>{ let v=true, p=o; while(p){ if(!p.visible) v=false; p=p.parent; } if(o.isMesh && v && !(o.isInstancedMesh && o.count===0)){ meshes++; const g=o.geometry; let t=(g.index?g.index.count:g.attributes.position.count)/3; if(o.isInstancedMesh) t*=o.count; tris+=t; } o.children.forEach(walk); }; walk(k.root); if(e&&e.fx){ walk(e.fx.mesh); walk(e.fx.cm); } for (const m of [r.foam.mesh, r.shadow.mesh, r.markers.mesh, r.ropes.group]) walk(m); return { meshes, tris:Math.round(tris) }; };`;
    const place = `const m=await __imp('/modules/host/creature.js'); window.__sb=m.stepBody; const cr=__cr(), st=window.game.state, sh=st.ships[0]; cr.x=sh.pose.x+3300; cr.y=sh.pose.y-900; cr.base.x=cr.x; cr.base.y=cr.y; cr.vx=cr.vy=0; cr.f=-1;
      window.__pose=(name,frames,extra)=>{ cr.bird.pose=name; if(extra) extra(cr); for(let i=0;i<frames;i++) window.__sb(cr,1/60); }; st.weather.bolt=null; st.weather.flash=0;`;
    const bsteps = [
      setup,
      [`(async()=>{ ${sl} ${bmeas} window.__step(500); ${view}.S.focus={dx:0,dy:-300}; ${view}.S.zoom=0.4; await sl(900); const k=${view}.kraken, r=k.rig, e=r.ext, m=window.__meas(); window.__wp8.arrive={ kind:r&&r.kind, ext:!!e, visible:k.root.visible, meshes:m.meshes, tris:m.tris, js:${view}.stats().jsMs, slots:e&&e.fm.slots, limbs:r.limbs.length }; return JSON.stringify(window.__wp8.arrive) })()`, 300, 'arrive'],
      // soar: the feathers are all placed (no slot collapsed), the head, the beak and the feet are set, and the wings crackle
      [`(async()=>{ ${sl} ${place} window.__pose('cruise',60); ${view}.S.focus={dx:0,dy:0}; ${view}.S.zoom=0.5; await sl(900); const r=${view}.kraken.rig, e=r.ext, a=e.fm.geometry.getAttribute('position').array; let nz=0; for(let i=0;i<a.length;i+=3) if(a[i]||a[i+1]||a[i+2]) nz++; const P=e.pieces.set.pieces; const placed=(n)=>!!(P[n].key&&P[n].key!=='hidden'); window.__wp8.soar={ shown:nz/(a.length/3), head:placed('head')&&placed('beak')&&placed('jaw'), feet:placed('footA')&&placed('footB'), arcs:e.fx.arcCount(), chg:e.S.chg, z:r.hg.position.z, meas:window.__meas() }; return JSON.stringify(window.__wp8.soar) })()`, 300, 'soar'],
      // call: the wings rear, the beak opens in steps, the charge rises and the crackle grows
      [`(async()=>{ ${sl} const r=${view}.kraken.rig, e=r.ext, cr=__cr(); const was=e.S.chg; window.__pose('rear',50,(c)=>{ c.bird.act={kind:'dive',sub:'call',t:1.2}; }); await sl(1100); window.__wp8.call={ was, chg:e.S.chg, open:e.S.open, arcs:e.fx.arcCount(), glow:r.glow[2], jaw:!!(e.pieces.set.pieces.jaw.key&&e.pieces.set.pieces.jaw.key!=='hidden'), meas:window.__meas() }; return JSON.stringify(window.__wp8.call) })()`, 300, 'call'],
      // a bolt it has called: the tether from the beak to the rod, growing as the bolt charges
      [`(async()=>{ ${sl} const r=${view}.kraken.rig, e=r.ext, st=window.game.state; st.stormJob.charge={ t:1.0, max:3, x:(st.stormJob.rods[0]||{x:600}).x, bird:true }; window.__pose('rear',20,(c)=>{ c.bird.act={kind:'dive',sub:'bolts',t:1.0}; }); await sl(700); window.__wp8.tether={ on:!!e.fx.S.tetherOn, arcs:e.fx.arcCount() }; st.stormJob.charge=null; return JSON.stringify(window.__wp8.tether) })()`, 300, 'tether'],
      // swallow: the gizzard glows: the breast shield lifts in steps (five), the stone shows and throbs, arcs round it
      [`(async()=>{ ${sl} const r=${view}.kraken.rig, e=r.ext, cr=__cr(); const g=cr.parts.find(p=>p.id==='gizzard'); const k0=e.S.openK; g.hidden=false; cr.bird.glow=9; cr.bird.glowMax=9; window.__pose('swallow',30,(c)=>{ c.bird.act={kind:'swallow',sub:'glow',t:1.0}; }); await sl(300); const k1=e.S.openK; await sl(1500); const h=r.head.dyn.heart, p=r.head.dyn.plates; window.__wp8.swallow={ k0, k1, k2:e.S.openK, stone:!!(h&&h.key&&h.key!=='0.000|0.000'), plates:p&&p.key, arcsOn:!!e.fx.S.wasOpen, open:e.S.open, meas:window.__meas() }; return JSON.stringify(window.__wp8.swallow) })()`, 300, 'swallow'],
      // a bolt it called is drawn from ITS BEAK (not from the top of the screen); the swallowed bolt (at its own beak) still falls from the sky
      [`(async()=>{ ${sl} const r=${view}.kraken.rig, e=r.ext, cr=__cr(), st=window.game.state, sh=st.ships[0]; const g=cr.parts.find(p=>p.id==='gizzard'); g.hidden=true; cr.bird.glow=0; cr.bird.act=null; window.__pose('rear',30,(c)=>{ c.bird.act={kind:'dive',sub:'call',t:1.0}; }); st.weather.bolt={ x:sh.pose.x+150, y:sh.pose.y-250, t:0.3 }; st.weather.flash=1; await sl(400); const L=${view}.lightning.stats; const bk=cr.parts.find(p=>p.kind==='beak').segs[0]; window.__wp8.bolt={ from:L.from, topY:L.topY, beakY:-bk.y, shown:L.shown }; return JSON.stringify(window.__wp8.bolt) })()`, 300, 'bolt'],
      // a blow: feathers fly (one instanced mesh of loose feathers), the part flashes
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=__cr(), e=${view}.kraken.rig.ext; st.weather.bolt=null; st.weather.flash=0; window.__pose('cruise',20); const w=cr.parts.find(p=>p.id==='wingF'); cs.hurtCreature(st,{part:w,seg:2},60,{who:null,src:'shell'}); await sl(350); window.__wp8.hit={ feathers:e.fx.cm.count, vis:e.fx.cm.visible }; return JSON.stringify(window.__wp8.hit) })()`, 300, 'hit'],
      measure('bird'),
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=st.creature; const w=cr.parts.find(p=>p.id==='wingN'); cs.hurtCreature(st,{part:w,seg:2},w.hp+1,{who:null,src:'shell'}); window.__pose('cruise',14); await sl(1300); const D=${view}.destruction; window.__wp8.pluck={ stump:w.segs.length, bodies:D.chunks.length, viewChunks:${view}.kraken.rig.chunks.size, extra:[...${view}.kraken.rig.chunks.values()].some(e=>e.extra), feathers:${view}.kraken.rig.ext.fx.cm.count }; return JSON.stringify(window.__wp8.pluck) })()`, 300, 'pluck'],
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=st.creature, e=${view}.kraken.rig.ext; cr.hp=1; const m=cr.parts.find(p=>p.kind==='mantle'); const rr=cs.hurtCreature(st,{part:m,seg:0},50,{who:null,src:'shell'}); window.__step(30); await sl(500); window.__wp8.death={ killed:!!(rr&&rr.killed), mode:cr.mode, flash:!!e.fx.S.deathDone, feathers:e.fx.cm.count, chg:e.S.chg }; window.__step(700); await sl(1200); const k=${view}.kraken; window.__wp8.gone=!window.game.state.creature; window.__wp8.hiddenAfter=!k.root.visible && !e.fx.mesh.visible && e.fx.cm.count===0; window.__wp8.errors=window.gameErrors||[]; return JSON.stringify(window.__wp8.death) })()`, 300, 'death'],
    ];
    const rb = run('bird', 'lair=storm', bsteps);
    const bd = rb.data || {};
    console.log('  errors ' + rb.errs + ' evalErrors ' + rb.evalErrors + '  ' + JSON.stringify(bd).slice(0, 1200));
    if (rb.errs !== 0 || rb.evalErrors) fail('console / eval errors in the Thunderbird run');
    if (!bd.arrive || !bd.arrive.ext || !bd.arrive.visible || bd.arrive.kind !== 'thunderbird') fail('the Thunderbird view (rig.ext) was not built ' + JSON.stringify(bd.arrive));
    else {
      if (bd.arrive.meshes > 12) fail('the Thunderbird draws ' + bd.arrive.meshes + ' meshes (budget 12)');
      if (bd.arrive.tris > 60000) fail('the Thunderbird is ' + bd.arrive.tris + ' triangles with ink (budget 60000)');
      if (bd.arrive.js > 2.5) fail('the frame JS is ' + bd.arrive.js + ' ms');
    }
    if (!bd.soar || !(bd.soar.shown > 0.95) || !bd.soar.head || !bd.soar.feet || !(bd.soar.arcs > 0) || bd.soar.meas.meshes > 12) fail('the soar: feathers placed, head / beak / feet set, the crackle on the wings ' + JSON.stringify(bd.soar));
    if (!bd.call || !(bd.call.chg > bd.call.was) || !(bd.call.open > 0.5) || !bd.call.jaw || !(bd.call.arcs >= 5) || !(bd.call.glow > 1.5)) fail('the call: the beak opens, the charge rises, the crackle grows ' + JSON.stringify(bd.call));
    if (!bd.tether || !bd.tether.on) fail('the tether to the rod was not drawn ' + JSON.stringify(bd.tether));
    if (!bd.swallow || !(bd.swallow.k1 > bd.swallow.k0 && bd.swallow.k1 < 1) || !(bd.swallow.k2 >= 0.99) || !bd.swallow.stone || !bd.swallow.arcsOn) fail('the swallow: the shield lifts in steps and the stone shows ' + JSON.stringify(bd.swallow));
    if (!bd.bolt || bd.bolt.from !== 'bird' || !(Math.abs(bd.bolt.topY - bd.bolt.beakY) < 50)) fail('a bolt it called must start at its beak ' + JSON.stringify(bd.bolt));
    if (!bd.hit || !(bd.hit.feathers > 0)) fail('a blow must scatter feathers ' + JSON.stringify(bd.hit));
    if (!bd.bird || bd.bird.meshes > 12 || bd.bird.tris > 60000) fail('the Thunderbird costs too much: ' + JSON.stringify(bd.bird));
    if (!bd.pluck || bd.pluck.stump < 1 || bd.pluck.bodies < 1 || bd.pluck.viewChunks < 1 || !bd.pluck.extra) fail('the plucked wing did not become a Rapier body with its feathers ' + JSON.stringify(bd.pluck));
    if (!bd.death || !bd.death.killed || !bd.death.flash || !(bd.death.feathers > 0) || !bd.gone || !bd.hiddenAfter) fail('the death: feathers and a flash, then it is gone and the view hides ' + JSON.stringify(bd.death));
    if (bd.errors && bd.errors.length) fail('game errors in the Thunderbird run: ' + JSON.stringify(bd.errors).slice(0, 200));
    // the Low tier: fewer feathers and fewer sides: it still crackles, in a smaller model
    const blow = [
      setup,
      [`(async()=>{ ${sl} ${bmeas} window.__step(500); ${place} window.__pose('rear',50,(c)=>{ c.bird.act={kind:'dive',sub:'call',t:1.2}; }); ${view}.S.focus={dx:0,dy:0}; ${view}.S.zoom=0.5; await sl(1100); const e=${view}.kraken.rig.ext; window.__wp8.low={ ext:!!e, arcs:e.fx.arcCount(), meas:window.__meas() }; window.__wp8.errors=window.gameErrors||[]; return JSON.stringify(window.__wp8.low) })()`, 300, 'birdlow'],
    ];
    const rbl = run('birdlow', 'lair=storm&tier=low', blow);
    console.log('  low tier: errors ' + rbl.errs + '  ' + JSON.stringify(rbl.data).slice(0, 400));
    if (rbl.errs !== 0 || rbl.evalErrors) fail('console / eval errors on the Thunderbird at the Low tier');
    if (!rbl.data || !rbl.data.low || !rbl.data.low.ext || !(rbl.data.low.arcs > 0) || rbl.data.low.meas.tris > 40000 || rbl.data.low.meas.meshes > 12) fail('the Low tier Thunderbird is missing or too big ' + JSON.stringify(rbl.data && rbl.data.low));
    if (rbl.data && rbl.data.errors && rbl.data.errors.length) fail('game errors in the Thunderbird Low tier run');
  }
  if (long) {
    console.log('5. host.html?creature=kraken, 8 bots, 3 minutes in real time');
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
