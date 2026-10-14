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
//   4c. THE ISLAND TITAN (host.html?creature=titan; skip with --no-titan; 3D.md section 38): it stands within the budget (at most 12 meshes, 60k triangles), every piece is placed, the island's grass top is exactly the sim's island deck, a boulder in a fist with its red
//       ring and then flying, the fist on the gasbag, the jaw and the funnel for the roar, an arm that cracks in two stages, a shelled-off arm (a stump and Rapier slabs), the crystal in four stages, the death (the island crumbles, it kneels); then the Low tier
//   4d. THE RIME WYRM (host.html?creature=wyrm; skip with --no-wyrm; 3D.md section 40): the cliff cracks, it erupts and coils within the budget (at most 10 meshes, 60k triangles), every piece is placed, the ice follows the sim in
//       four steps and sheds Rapier shards, the maw opens in steps with the throat glowing, the frost breath draws its cone and rings on frozen guns, phase 3 shows the underbelly and the sun, the death shatters the ice; then the Low tier
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
  if (!argv.includes('--no-titan')) {
    // THE ISLAND TITAN (3D.md section 38; BOSSES.md C.6c): the stone colossus on the Sky Isles lair's plain (host.html?creature=titan), step by step with the sim frozen. Checked: it stands within the budget (at most 12
    // meshes, 60k triangles with ink), every piece is placed (head, jaw, legs, three slabs and a hand on each arm, the island with its trees and ruin, the crystal), the island's walking top is EXACTLY the sim's island deck
    // (ISLAND.TOP, X0..X1, the crew's depth), a boulder is held in a fist with its red ring and then flies, a hand closes on the gasbag, the jaw drops and the funnel shows for the roar, an arm cracks in two stages and
    // sheds stone, an arm shelled off leaves a stump and its slabs become Rapier bodies, the crystal cracks in four stages, the Titan dies (the island and its trees crumble into bodies, it kneels and sinks) and the view
    // hides; then the Low tier.
    console.log('4c. the Island Titan (host.html?creature=titan): stand, island alignment, boulder, grab, roar, cracks, shelled arm, crystal, death; then Low');
    const tmeas = `window.__meas=()=>{ const k=${view}.kraken, r=k.rig, e=r.ext; let meshes=0, tris=0; const walk=(o)=>{ let v=true, p=o; while(p){ if(!p.visible) v=false; p=p.parent; } if(o.isMesh && v && !(o.isInstancedMesh && o.count===0)){ const g=o.geometry; if(g.drawRange && g.drawRange.count===0) return; meshes++; let t=(g.index?g.index.count:g.attributes.position.count)/3; if(o.isInstancedMesh) t*=o.count; tris+=t; } o.children.forEach(walk); }; walk(k.root); if(e&&e.overlay) walk(e.overlay.mesh); for (const m of [r.foam.mesh, r.shadow.mesh, r.markers.mesh, r.ropes.group]) walk(m); return { meshes, tris:Math.round(tris) }; };
      window.__pl=(n)=>{ const p=${view}.kraken.rig.ext.set.pieces[n]; return !!(p&&p.key&&p.key!=='hidden'); };`;
    const tsteps = [
      setup,
      // stand: the lair's plain, the Titan has walked in and woken
      [`(async()=>{ ${sl} ${tmeas} window.__step(780); window.__cr().ai.breather=99; window.__cr().titan.nextT=999; window.__cr().ai.mouthT=999; await sl(1200); const k=${view}.kraken, r=k.rig, e=r.ext, cr=__cr(), m=window.__meas(); const P=(n)=>window.__pl(n);
        const hand=['hNo','hNf','hNb'].some(P)&&['hFo','hFf','hFb'].some(P), slabs=[0,1,2].every(j=>(P('aN'+j+'a')||P('aN'+j+'b'))&&(P('aF'+j+'a')||P('aF'+j+'b')));
        window.__wp8.stand={ kind:r&&r.kind, ext:!!e, visible:k.root.visible, mode:cr.mode, meshes:m.meshes, tris:m.tris, js:${view}.stats().jsMs, head:P('head')&&P('jaw'), legs:P('legN')&&P('legF'), island:P('isle')&&P('treeA')&&P('treeB')&&P('ruin'), crystal:P('crys0'), slabs, hand, tubesHidden:!r.tubes.mesh.visible, z:r.hg.position.z }; return JSON.stringify(window.__wp8.stand) })()`, 300, 'stand'],
      // the island: the GRASS TOP (the faces that point straight up) is exactly the sim's island deck (creatureIsland.js islandOf): its world height, and it covers x0..x1 along the depth line the crew walk at (z 16)
      [`(async()=>{ ${sl} const I=await __imp('/modules/host/creatureIsland.js'), cfg=(await __imp('/config.js')).config, T=cfg.CREATURES.TITAN, cr=__cr(), st=window.game.state, r=${view}.kraken.rig, e=r.ext, g=r.hg;
        const rg=e.pieces.ranges.isle, geo=e.pieces.geometry, pos=geo.getAttribute('position'), nor=geo.getAttribute('normal'), n0=rg.start, n1=rg.start+rg.count;
        let ymax=-1e9; for(let i=n0;i<n1;i++) if(nor.getY(i)>0.999 && pos.getY(i)>ymax) ymax=pos.getY(i);
        const deck=I.islandOf(st), zW=16, zB=(zW-g.position.z)/g.scale.z; let xa=1e9, xb=-1e9, tris=0;
        for(let i=n0;i+2<n1;i+=3){ if(!(nor.getY(i)>0.999&&nor.getY(i+1)>0.999&&nor.getY(i+2)>0.999&&Math.abs(pos.getY(i)-ymax)<0.01)) continue; tris++; for(let k=0;k<3;k++){ const p=i+k, q=i+(k+1)%3, z0=pos.getZ(p), z1=pos.getZ(q); if((z0-zB)*(z1-zB)<=0 && z0!==z1){ const u=(zB-z0)/(z1-z0), x=pos.getX(p)+(pos.getX(q)-pos.getX(p))*u; xa=Math.min(xa,x); xb=Math.max(xb,x); } } }
        const worldTop=g.position.y+g.scale.y*ymax, simTop=-deck.y, wA=g.position.x+g.scale.x*xa, wB=g.position.x+g.scale.x*xb, wx0=Math.min(wA,wB), wx1=Math.max(wA,wB), cx=I.crystalOf(st);
        window.__wp8.island={ deck:!!deck, tris, topErr:Math.abs(worldTop-simTop), x0:wx0, x1:wx1, deckX0:deck.x0, deckX1:deck.x1, covers:wx0<=deck.x0+1&&wx1>=deck.x1-1, zB, crystalX:cx.x, topY:-T.ISLAND.TOP };
        return JSON.stringify(window.__wp8.island) })()`, 200],
      // a boulder: picked up (the fist round it, the hand overhead), its red ring on the TV, then the throw (the rock flies)
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext; cr.titan.nextT=0; cr.ai.breather=0; const n=__until(()=>cr.titan.ring&&cr.titan.ring.locked, 3000); window.__step(10); await sl(700); const b=cr.titan.boulders[0];
        window.__wp8.heft={ n, held:!!b&&b.mode==='held', rock:window.__pl('boulder0'), fist:window.__pl('hNf')||window.__pl('hFf'), ring:e.overlay.count>=1, locked:!!cr.titan.ring&&cr.titan.ring.locked }; return JSON.stringify(window.__wp8.heft) })()`, 400, 'heft'],
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext; const n=__until(()=>cr.titan.boulders.some(b=>b.mode==='fly'), 3000); window.__step(40); await sl(500); const b=cr.titan.boulders.find(q=>q.mode==='fly'); const k=e.set.pieces.boulder0.key;
        window.__wp8.fly={ n, flying:!!b, rock:window.__pl('boulder0'), ring:e.overlay.count>=1, at:k&&k!=='hidden'?[k[12],k[13],k[14]]:null, want:b?[(b.x-cr.x)*(cr.f<0?-1:1),-(b.y-cr.y)]:null }; return JSON.stringify(window.__wp8.fly) })()`, 300, 'fly'],
      // the hand closes on the gasbag (phase 2): a fist on the gripping arm, its tip pulled to the ship's depth
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext; const n0=__until(()=>cr.titan.boulders.length===0, 3000); cr.hp=cr.maxHp*0.6; cr.ai.breather=0; cr.titan.grabT=0; cr.titan.nextT=99; const n=__until(()=>cr.grips.some(g=>g.mode==='hold'), 3000); window.__step(20); await sl(700);
        const g=cr.grips.find(q=>q.mode==='hold'), tag=g&&g.limb.id==='armF'?'F':'N'; window.__wp8.grab={ n, hold:!!g, arm:g&&g.limb.id, fist:window.__pl('h'+tag+'f') }; return JSON.stringify(window.__wp8.grab) })()`, 400, 'grab'],
      // the roar: the jaw drops (in steps), the throat glows, the gold funnel is drawn over the mouth
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext, R=${view}.kraken.rig; for(const g of cr.grips) g.left=0.01; window.__step(120); cr.ai.mouthT=0; cr.titan.nextT=99; cr.ai.breather=0; const was=e.S.open, n=__until(()=>!!cr.mouthWin, 3000); window.__step(30); await sl(1500);
        window.__wp8.roar={ n, win:!!cr.mouthWin, was, open:e.S.open, jaw:window.__pl('jaw'), funnel:e.overlay.count>=1, throat:R.uniforms.uGlow.value.y, tilt:e.S.tilt }; return JSON.stringify(window.__wp8.roar) })()`, 300, 'roar'],
      // an arm cracks in two stages: slabs with a bite and cyan light, stone chips fall as Rapier bodies
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext, D=${view}.destruction; cr.mouthWin=null; cr.ai.mouthT=999; for(const g of cr.grips) g.left=0.01; window.__step(60); const a=cr.parts.find(p=>p.id==='armN'); const c0=D.chunks.length; a.hp=a.maxHp*0.6; await sl(500); const s1={ stage:e.S.armStage.N, cracked:window.__pl('aN2b') };
        a.hp=a.maxHp*0.3; await sl(500); window.__wp8.cracks={ s1, stage:e.S.armStage.N, cracked:window.__pl('aN1b')&&window.__pl('aN2b'), chips:e.S.loose.size, bodies:D.chunks.length-c0 }; return JSON.stringify(window.__wp8.cracks) })()`, 300, 'cracks'],
      // the crystal in stages: whole, a crack, the tip broken, nearly gone
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext, cp=cr.parts.find(p=>p.id==='crystal'); const seen=[]; for(const f of [1,0.66,0.33,0.1]){ cp.hp=cp.maxHp*f; await sl(450); seen.push([0,1,2,3].filter(s=>window.__pl('crys'+s))); } window.__wp8.crystal={ seen, spark:e.S.cStage }; cp.hp=cp.maxHp; await sl(300); return JSON.stringify(window.__wp8.crystal) })()`, 300, 'crystal'],
      // an arm shelled off: a stump with a jagged face and the slabs that fell are Rapier bodies
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=__cr(), e=${view}.kraken.rig.ext, D=${view}.destruction, R=${view}.kraken.rig; const a=cr.parts.find(p=>p.id==='armF'); const r=cs.hurtCreature(st,{part:a,seg:1},a.hp+5,{who:null,src:'shell'}); window.__step(14); await sl(500);
        window.__wp8.sever={ severed:!!(r&&r.sever), stump:a.segs.length, cut:window.__pl('cF'), hand:window.__pl('hFo')||window.__pl('hFf')||window.__pl('hFb'), slab2:window.__pl('aF2a')||window.__pl('aF2b'), simChunks:cr.chunks.length, viewChunks:R.chunks.size, bodies:D.chunks.length, extra:[...R.chunks.values()].some(q=>q.extra) }; return JSON.stringify(window.__wp8.sever) })()`, 300, 'sever'],
      measure('titan'),
      // death: it falls apart; the island and its trees crumble into bodies, the island picture goes, it kneels
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=__cr(), e=${view}.kraken.rig.ext, D=${view}.destruction; cr.hp=1; const m=cr.parts.find(p=>p.kind==='mantle'); const r=cs.hurtCreature(st,{part:m,seg:0},50,{who:null,src:'shell'}); window.__step(20); await sl(500); const d0={ killed:!!(r&&r.killed), mode:cr.mode, isle:window.__pl('isle') };
        window.__step(70); await sl(900); const d1={ isle:window.__pl('isle'), trees:window.__pl('treeA')||window.__pl('treeB'), loose:e.S.loose.size, kneel:e.S.kneel, bodies:D.chunks.length };
        window.__step(120); await sl(500); window.__wp8.death={ d0, d1, kneel:e.S.kneel, tilt:e.S.tilt, sink:cr.sinkT }; return JSON.stringify(window.__wp8.death) })()`, 300, 'death'],
      [`(async()=>{ ${sl} window.__step(900); await sl(1200); const k=${view}.kraken; window.__wp8.gone=!window.game.state.creature; window.__wp8.hiddenAfter=!k.root.visible && !k.rig.ext.overlay.mesh.visible; window.__wp8.errors=window.gameErrors||[]; return 1 })()`, 300],
    ];
    const rt = run('titan', 'creature=titan', tsteps);
    const td = rt.data || {};
    console.log('  errors ' + rt.errs + ' evalErrors ' + rt.evalErrors + '  ' + JSON.stringify(td).slice(0, 1500));
    if (rt.errs !== 0 || rt.evalErrors) fail('console / eval errors in the Titan run');
    const st0 = td.stand;
    if (!st0 || st0.kind !== 'titan' || !st0.ext || !st0.visible || st0.mode !== 'idle') fail('the Titan view (rig.ext) was not built or it is not standing ' + JSON.stringify(st0));
    else {
      if (st0.meshes > 12) fail('the Titan draws ' + st0.meshes + ' meshes (budget 12)');
      if (st0.tris > 60000) fail('the Titan is ' + st0.tris + ' triangles with ink (budget 60000)');
      if (st0.js > 2.5) fail('the frame JS is ' + st0.js + ' ms');
      if (!st0.head || !st0.legs || !st0.island || !st0.crystal || !st0.slabs || !st0.hand || !st0.tubesHidden) fail('a piece of the Titan is not placed ' + JSON.stringify(st0));
      if (!(st0.z < -80)) fail('the Titan must stand behind the lair plain\'s face (z ' + st0.z + '): a sinking body is hidden by the plain');
    }
    const is0 = td.island;
    if (!is0 || !is0.deck || !(is0.tris > 4) || !(is0.topErr < 0.6) || !is0.covers) fail('the island picture does not line up with the sim\'s island deck (top y, x0..x1, the crew\'s depth) ' + JSON.stringify(is0));
    const hf = td.heft;
    if (!hf || !hf.held || !hf.rock || !hf.fist || !hf.ring || !hf.locked) fail('a held boulder: the rock in a fist and its red ring ' + JSON.stringify(hf));
    const fl = td.fly;
    if (!fl || !fl.flying || !fl.rock || !fl.at || !fl.want || Math.abs(fl.at[0] - fl.want[0]) > 6 || Math.abs(fl.at[1] - fl.want[1]) > 6) fail('the flying boulder is not where the sim has it ' + JSON.stringify(fl));
    if (!td.grab || !td.grab.hold || !td.grab.fist) fail('the hand on the gasbag must be a fist ' + JSON.stringify(td.grab));
    const ro = td.roar;
    if (!ro || !ro.win || !(ro.open > 0.5) || !(ro.was < 0.2) || !ro.jaw || !ro.funnel || !(ro.throat > 1.2)) fail('the roar: the jaw drops in steps, the throat glows and the funnel is drawn ' + JSON.stringify(ro));
    const ck = td.cracks;
    if (!ck || !ck.s1 || ck.s1.stage !== 1 || !ck.s1.cracked || ck.stage !== 2 || !ck.cracked || !(ck.chips >= 2)) fail('an arm must crack in two stages and shed stone ' + JSON.stringify(ck));
    const cy = td.crystal;
    if (!cy || cy.seen.map((a) => a.join('')).join('|') !== '0|1|2|3') fail('the crystal must show stages 0, 1, 2, 3 as its health falls ' + JSON.stringify(cy));
    const sv = td.sever;
    if (!sv || !sv.severed || !sv.cut || sv.hand || sv.slab2 || sv.viewChunks < 1 || sv.bodies < 1 || !sv.extra) fail('the shelled-off arm: a stump with a jagged face, and its slabs are Rapier bodies ' + JSON.stringify(sv));
    if (!td.titan || td.titan.meshes > 12 || td.titan.tris > 60000) fail('the Titan costs too much: ' + JSON.stringify(td.titan));
    const dh = td.death;
    if (!dh || !dh.d0 || !dh.d0.killed || dh.d0.mode !== 'dying' || !dh.d0.isle || !dh.d1 || dh.d1.isle || dh.d1.trees || !(dh.d1.loose >= 6) || !(dh.d1.kneel > 0) || !(dh.kneel >= 0.99)) fail('the death: the island and its trees crumble into bodies, the Titan kneels ' + JSON.stringify(dh));
    if (!td.gone || !td.hiddenAfter) fail('after the death the view must hide ' + JSON.stringify([td.gone, td.hiddenAfter]));
    if (td.errors && td.errors.length) fail('game errors in the Titan run: ' + JSON.stringify(td.errors).slice(0, 200));
    // the Low tier: a lighter build of the same Titan
    const tlow = [
      setup,
      [`(async()=>{ ${sl} ${tmeas} window.__step(780); window.__cr().ai.breather=99; window.__cr().titan.nextT=999; await sl(1500); const r=${view}.kraken.rig; const m=window.__meas(); window.__wp8.low={ kind:r.kind, low:r.low, ext:!!r.ext, meshes:m.meshes, tris:m.tris, head:window.__pl('head'), isle:window.__pl('isle') }; window.__wp8.errors=window.gameErrors||[]; return JSON.stringify(window.__wp8.low) })()`, 300, 'titanlow'],
    ];
    const rtl = run('titanlow', 'creature=titan&tier=low', tlow);
    console.log('  low tier: errors ' + rtl.errs + '  ' + JSON.stringify(rtl.data).slice(0, 400));
    if (rtl.errs !== 0 || rtl.evalErrors) fail('console / eval errors on the Titan at the Low tier');
    if (!rtl.data || !rtl.data.low || rtl.data.low.kind !== 'titan' || !rtl.data.low.low || !rtl.data.low.head || !rtl.data.low.isle || rtl.data.low.tris > 60000 || rtl.data.low.meshes > 12) fail('the Low tier Titan is missing or too big ' + JSON.stringify(rtl.data && rtl.data.low));
    if (rtl.data && rtl.data.errors && rtl.data.errors.length) fail('game errors in the Titan Low tier run');
  }
  if (!argv.includes('--no-wyrm')) {
    // THE RIME WYRM (3D.md section 40; BOSSES.md C.6d): the frost serpent on the Frost Peaks lair (host.html?creature=wyrm), step by step with the sim frozen. Checked: the cliff cracks (the cracks mesh and the red ring), it erupts
    // and coils the hull within the budget (at most 10 meshes, 60k triangles with ink), every piece is placed (12 segments, the collar, the skull, both jaws), the body lies behind the cliff's face while it is buried, the ice
    // follows the sim's numbers (a full shell, a cracked one, frost patches, bare with cold seams) and sheds shards as Rapier bodies when it steps down, a ping flashes, the maw opens in steps and the throat glows, the
    // frost breath draws its cone and the frozen guns their rings, phase 3 shows the underbelly and the sun, the death shatters the ice and the view hides; then the Low tier.
    console.log('4d. the Rime Wyrm (host.html?creature=wyrm): crack, eruption, coil, ice steps, maw, breath, sun, belly, death; then Low');
    const wmeas = `window.__meas=()=>{ const k=${view}.kraken, r=k.rig, e=r.ext; let meshes=0, tris=0; const walk=(o)=>{ let v=true, p=o; while(p){ if(!p.visible) v=false; p=p.parent; } if(o.isMesh && v && !(o.isInstancedMesh && o.count===0)){ const g=o.geometry; if(g.drawRange && g.drawRange.count===0) return; meshes++; let t=(g.index?g.index.count:g.attributes.position.count)/3; if(o.isInstancedMesh) t*=o.count; tris+=t; } o.children.forEach(walk); }; walk(k.root); if(e){ walk(e.marks.mesh); walk(e.cracks.mesh); } for (const m of [r.foam.mesh, r.shadow.mesh, r.markers.mesh, r.ropes.group]) walk(m); return { meshes, tris:Math.round(tris) }; };
      window.__pl=(n)=>{ const e=${view}.kraken.rig.ext, p=e.bset.pieces[n]||e.iset.pieces[n]; return !!(p&&p.key&&p.key!=='hidden'); };
      window.__plI=(n)=>{ const p=${view}.kraken.rig.ext.iset.pieces[n]; return !!(p&&p.key&&p.key!=='hidden'); };`;
    const wsteps = [
      setup,
      // the telegraph: the cliff cracks (the cracks mesh, the ring) and the Wyrm is buried (nothing of its body placed)
      [`(async()=>{ ${sl} ${wmeas} const cr=__cr(); window.__until(()=>cr.wyrm.mode==='crack'&&cr.wyrm.crack.t>1.2, 20000); await sl(900); const e=${view}.kraken.rig.ext; window.__wp8.crack={ mode:cr.wyrm.mode, cracks:e.cracks.visible, marks:e.marks.count, buried:!window.__pl('b0')&&!window.__pl('collar'), kind:${view}.kraken.rig.kind }; return JSON.stringify(window.__wp8.crack) })()`, 300, 'crack'],
      // the eruption and the coil: within the budget, every piece placed, the body in front of the cliff's face only where it is above the cliff
      [`(async()=>{ ${sl} const cr=__cr(); window.__until(()=>cr.grips.some(g=>g.mode==='hold'), 12000); window.__step(60); cr.ai.breather=99; await sl(1500); const k=${view}.kraken, r=k.rig, e=r.ext, m=window.__meas(), P=(n)=>window.__pl(n);
        let segs=0; for(let i=0;i<12;i++) if(P('b'+i)) segs++;
        const zs=[]; for(let i=0;i<12;i++){ const kk=e.bset.pieces['b'+i].key; if(kk&&kk!=='hidden') zs.push(kk[14]); }
        window.__wp8.stand={ kind:r.kind, ext:!!e, visible:k.root.visible, mode:cr.mode, meshes:m.meshes, tris:m.tris, js:${view}.stats().jsMs, segs, collar:P('collar'), skull:P('skull'), jaws:P('jawU')&&P('jawL'), tubesHidden:!r.tubes.mesh.visible, hold:cr.grips.some(g=>g.mode==='hold'), zmin:Math.min(...zs), zmax:Math.max(...zs), cracksGone:!e.cracks.visible, lip:P('lip') }; return JSON.stringify(window.__wp8.stand) })()`, 300, 'stand'],
      // the ice follows the sim: bare, frost patches, a cracked shell, a full shell; shards fall when it steps down
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext, D=${view}.destruction, l=cr.parts.find(p=>p.id==='wyrm'); const set=[0,0.2,0.55,1,1,1,1,1,1,1,1,1]; const c0=D.chunks.length; l.ice=l.iceMax.map((m,i)=>m*set[i]); window.__step(3); await sl(500);
        window.__wp8.ice={ bare:!window.__plI('i0F')&&!window.__plI('i0C')&&!window.__plI('i0P')&&window.__pl('g0'), patches:window.__plI('i1P')&&!window.__pl('g1'), cracked:window.__plI('i2C'), full:window.__plI('i3F'), loose:e.S.loose.size, bodies:D.chunks.length-c0 };
        l.ice[3]=0; l.ice[4]=l.iceMax[4]*0.3; window.__step(3); await sl(500); window.__wp8.ice.after={ bare3:window.__pl('g3'), patches4:window.__plI('i4P'), loose:e.S.loose.size };
        l.iceFlash=0.15; l.iceAge[5]=0; window.__step(1); await sl(300); window.__wp8.ice.ping=e.S.flash.get(l)>0||l.iceFlash>=0; return JSON.stringify(window.__wp8.ice) })()`, 300, 'ice'],
      // the maw opens in steps; the throat glows; the funnel is drawn
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext, R=${view}.kraken.rig; for(const g of cr.grips) g.left=0.01; window.__step(120); cr.ai.breather=0; const was=e.S.open, n=__until(()=>!!cr.mouthWin, 3000); window.__step(30); await sl(1500);
        window.__wp8.maw={ n, win:!!cr.mouthWin, was, open:e.S.open, jaws:window.__pl('jawU')&&window.__pl('jawL'), throat:window.__pl('throat'), funnel:e.marks.count>=1, glow:R.uniforms.uGlow.value.y }; return JSON.stringify(window.__wp8.maw) })()`, 300, 'maw'],
      // the frost breath: the throat's ring, then the cone; a frozen gun gets its ring
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext, st=window.game.state; cr.mouthWin=null; window.__step(300); cr.wyrm.breathT=0; cr.ai.breather=0; const n=__until(()=>cr.wyrm.breath&&cr.wyrm.breath.sub==='wind', 3000); window.__step(20); await sl(400); const wind=e.marks.count>=1; const n2=__until(()=>cr.wyrm.breath&&cr.wyrm.breath.sub==='blow', 3000); window.__step(4); await sl(500);
        window.__wp8.breath={ n, wind, blow:!!(cr.wyrm.breath&&cr.wyrm.breath.sub==='blow'), marks:e.marks.count, iced:(st.icing||[]).filter(c=>c.wyrm).length }; window.__step(60); await sl(500); window.__wp8.breath.guns=(st.icing||[]).filter(c=>c.wyrm&&c.lvl>=0.8).length; window.__wp8.breath.ring=e.marks.count>=1; return JSON.stringify(window.__wp8.breath) })()`, 300, 'breath'],
      // phase 3: the underbelly and the sun
      [`(async()=>{ ${sl} const cr=__cr(), e=${view}.kraken.rig.ext; cr.hp=cr.maxHp*0.3; cr.ai.breather=0; const n=__until(()=>cr.phase===3&&!!cr.wyrm.sun, 3000); window.__step(30); await sl(1200);
        window.__wp8.p3={ n, phase:cr.phase, sun:!!cr.wyrm.sun, belly:window.__pl('belly'), marks:e.marks.count }; return JSON.stringify(window.__wp8.p3) })()`, 300, 'p3'],
      measure('wyrm'),
      // death: a flash, the ice shatters (shards), it sinks into the cliff; the view hides afterwards
      [`(async()=>{ ${sl} const cs=await __imp('/modules/host/creatureSystem.js'); const st=window.game.state, cr=__cr(), e=${view}.kraken.rig.ext; cr.hp=1; cr.hooks.hurtPool(5,'sun'); void cs; window.__step(20); await sl(500); const d0={ killed:cr.mode==='dying', mode:cr.mode, died:e.S.died, loose:e.S.loose.size };
        window.__step(90); await sl(700); window.__wp8.death={ d0, iceGone:!['F','C','P'].some(v=>window.__plI('i3'+v)||window.__plI('c'+v)), loose:e.S.loose.size, sink:cr.sinkT }; return JSON.stringify(window.__wp8.death) })()`, 300, 'death'],
      [`(async()=>{ ${sl} window.__step(900); await sl(1200); const k=${view}.kraken; window.__wp8.gone=!window.game.state.creature; window.__wp8.hiddenAfter=!k.root.visible && !k.rig.ext.marks.mesh.visible && !k.rig.ext.cracks.visible; window.__wp8.errors=window.gameErrors||[]; return 1 })()`, 300],
    ];
    const rw = run('wyrm', 'creature=wyrm', wsteps);
    const wd = rw.data || {};
    console.log('  errors ' + rw.errs + ' evalErrors ' + rw.evalErrors + '  ' + JSON.stringify(wd).slice(0, 1600));
    if (rw.errs !== 0 || rw.evalErrors) fail('console / eval errors in the Wyrm run');
    const wc = wd.crack;
    if (!wc || wc.mode !== 'crack' || !wc.cracks || !(wc.marks >= 1) || !wc.buried || wc.kind !== 'wyrm') fail('the cliff must crack (the cracks mesh and the red ring) while the Wyrm is buried ' + JSON.stringify(wc));
    const w0 = wd.stand;
    if (!w0 || w0.kind !== 'wyrm' || !w0.ext || !w0.visible || !w0.hold) fail('the Wyrm view (rig.ext) was not built or it has not coiled the hull ' + JSON.stringify(w0));
    else {
      if (w0.meshes > 10) fail('the Wyrm draws ' + w0.meshes + ' meshes (budget 10)');
      if (w0.tris > 60000) fail('the Wyrm is ' + w0.tris + ' triangles with ink (budget 60000)');
      if (w0.js > 2.5) fail('the frame JS is ' + w0.js + ' ms');
      if (w0.segs !== 12 || !w0.collar || !w0.skull || !w0.jaws || !w0.tubesHidden || !w0.cracksGone) fail('a piece of the Wyrm is not placed ' + JSON.stringify(w0));
      if (!(w0.zmax > 30)) fail('a coiled segment must pass in front of the hull (z ' + w0.zmax + ')');
    }
    const wi = wd.ice;
    if (!wi || !wi.bare || !wi.patches || !wi.cracked || !wi.full || !(wi.loose >= 0) || !wi.after || !wi.after.bare3 || !wi.after.patches4 || !(wi.after.loose >= 1)) fail('the ice must follow the sim (bare with seams, frost patches, a cracked shell, a full shell) and shed shards when it steps down ' + JSON.stringify(wi));
    const wm = wd.maw;
    if (!wm || !wm.win || !(wm.open > 0.5) || !(wm.was < 0.2) || !wm.jaws || !wm.throat || !wm.funnel || !(wm.glow > 1.2)) fail('the maw: the jaws part in steps, the throat glows and the funnel is drawn ' + JSON.stringify(wm));
    const wb = wd.breath;
    if (!wb || !wb.wind || !wb.blow || !(wb.marks >= 1) || !(wb.guns >= 1) || !wb.ring) fail('the frost breath: the throat ring, the cone, and a ring on a frozen gun ' + JSON.stringify(wb));
    const w3 = wd.p3;
    if (!w3 || w3.phase !== 3 || !w3.sun || !w3.belly || !(w3.marks >= 2)) fail('phase 3: the underbelly and the shaft of sun ' + JSON.stringify(w3));
    if (!wd.wyrm || wd.wyrm.meshes > 10 || wd.wyrm.tris > 60000) fail('the Wyrm costs too much: ' + JSON.stringify(wd.wyrm));
    const wh = wd.death;
    if (!wh || !wh.d0 || !wh.d0.killed || wh.d0.mode !== 'dying' || !wh.d0.died || !wh.iceGone || !(wh.loose >= 3)) fail('the death: the ice shatters into shards ' + JSON.stringify(wh));
    if (!wd.gone || !wd.hiddenAfter) fail('after the death the view must hide ' + JSON.stringify([wd.gone, wd.hiddenAfter]));
    if (wd.errors && wd.errors.length) fail('game errors in the Wyrm run: ' + JSON.stringify(wd.errors).slice(0, 200));
    const wlow = [
      setup,
      [`(async()=>{ ${sl} ${wmeas} const cr=__cr(); window.__until(()=>cr.grips.some(g=>g.mode==='hold'), 12000); window.__step(60); cr.ai.breather=99; await sl(1500); const r=${view}.kraken.rig; const m=window.__meas(); window.__wp8.low={ kind:r.kind, low:r.low, ext:!!r.ext, meshes:m.meshes, tris:m.tris, segs:[0,1,2,3,4,5,6,7,8,9,10,11].filter(i=>window.__pl('b'+i)).length, skull:window.__pl('skull') }; window.__wp8.errors=window.gameErrors||[]; return JSON.stringify(window.__wp8.low) })()`, 300, 'wyrmlow'],
    ];
    const rwl = run('wyrmlow', 'creature=wyrm&tier=low', wlow);
    console.log('  low tier: errors ' + rwl.errs + '  ' + JSON.stringify(rwl.data).slice(0, 400));
    if (rwl.errs !== 0 || rwl.evalErrors) fail('console / eval errors on the Wyrm at the Low tier');
    if (!rwl.data || !rwl.data.low || rwl.data.low.kind !== 'wyrm' || !rwl.data.low.low || rwl.data.low.segs !== 12 || !rwl.data.low.skull || rwl.data.low.tris > 60000 || rwl.data.low.meshes > 10) fail('the Low tier Wyrm is missing or too big ' + JSON.stringify(rwl.data && rwl.data.low));
    if (rwl.data && rwl.data.errors && rwl.data.errors.length) fail('game errors in the Wyrm Low tier run');
  }
  if (long) {
    console.log('5. host.html?creature=kraken, 8 bots, 3 minutes in real time');
    const lg = [[`(async()=>{ window.__wp8={}; const b=document.getElementById('bots'); b.click(); b.click(); await new Promise(r=>setTimeout(r,500)); document.getElementById('castoff').click(); return 1; })()`, 90000], [`(()=>{ window.__wp8.mid={ has:!!window.game.state.creature, errs:window.gameErrors||[] }; return 1 })()`, 90000], [`(()=>{ window.__wp8.end={ has:!!window.game.state.creature, errs:window.gameErrors||[], calls:${view}.stats().sceneCalls, fps:window.__meter&&window.__meter.fps }; return 1 })()`, 100]];
    const r4 = run('long', 'creature=kraken', lg);
    console.log('  errors ' + r4.errs + '  ' + JSON.stringify(r4.data).slice(0, 300));
    if (r4.errs !== 0 || r4.evalErrors) fail('console / eval errors in the long run');
    if (r4.data && ((r4.data.end && r4.data.end.errs.length) || (r4.data.mid && r4.data.mid.errs.length))) fail('game errors in the long run');
    if (!argv.includes('--no-titan')) { // (the Island Titan fights the same 8 bots in real time: its boulders, grabs, roars, arms falling off and, with luck, its death)
      console.log('5b. host.html?creature=titan, 8 bots, 3 minutes in real time');
      const lt = [[`(async()=>{ window.__wp8={}; const b=document.getElementById('bots'); b.click(); b.click(); await new Promise(r=>setTimeout(r,500)); document.getElementById('castoff').click(); return 1; })()`, 90000], [`(()=>{ const c=window.game.state.creature; window.__wp8.mid={ has:!!c, kind:c&&c.kind, phase:c&&c.phase, errs:window.gameErrors||[] }; return 1 })()`, 90000], [`(()=>{ const c=window.game.state.creature; window.__wp8.end={ has:!!c, kind:c&&c.kind, errs:window.gameErrors||[], calls:${view}.stats().sceneCalls, fps:window.__meter&&window.__meter.fps, win:c&&c.stats&&c.stats.win }; return 1 })()`, 100]];
      const r5 = run('longtitan', 'creature=titan', lt);
      console.log('  errors ' + r5.errs + '  ' + JSON.stringify(r5.data).slice(0, 400));
      if (r5.errs !== 0 || r5.evalErrors) fail('console / eval errors in the Titan long run');
      if (r5.data && ((r5.data.end && r5.data.end.errs.length) || (r5.data.mid && r5.data.mid.errs.length))) fail('game errors in the Titan long run');
      if (r5.data && r5.data.mid && r5.data.mid.has && r5.data.mid.kind !== 'titan') fail('the long run did not meet the Titan');
    }
  }
  console.log('  screenshots: ' + out);
} finally {
  try { server.kill(); } catch { /* (gone) */ }
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* (gone) */ } }
}
console.log(failed ? 'FAILED: ' + failed : 'PASS creature3d-check');
process.exit(failed ? 1 : 0);
