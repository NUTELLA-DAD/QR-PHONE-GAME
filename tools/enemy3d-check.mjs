// ENEMIES AND WORLD OBJECTS v2 (WP9) gate: the 3D enemies, scenery and world objects in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it at the end
// (never kills node globally).
//   node tools/enemy3d-check.mjs [--port N (default: a random one in 4200-4599)] [--quick] [--out DIR (screenshots; default a temp folder)]    (--quick skips the long host runs)
// Checks (each must print 0 console errors, and the numbers must make sense):
//   1. the dev page's enemy LINE-UP, pages 1 / 2 / 3 (planes, bats, mines, the supply balloon, wrecks, rockets, the specials, the four bosses)
//   2. host.html?view=3d with 8 bots in: a fight (the gunship, dogfighters, a bomber), a cave with bats, mines + turrets + outposts, the Flagship stop, a ship breaking up, Versus
//      each: 0 console errors, 0 game errors, at most 150 scene draw calls and 450k triangles (3D.md section 6)
//   3. the no-wobble lint (tools/lint3d.mjs): no `wobble-ok` mark left in flyers.js
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes('--' + k) ? argv[argv.indexOf('--' + k) + 1] : d);
const port = Number(arg('port', 4200 + Math.floor(Math.random() * 400)));
const quick = argv.includes('--quick');
const out = arg('out', fs.mkdtempSync(path.join(os.tmpdir(), 'enemy3d-')));
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };

const server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: argv.includes('--verbose') ? 'inherit' : 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i++) { try { up = (await fetch(`http://localhost:${port}/three3d.html`)).ok; } catch { await sleep(250); } }
if (!up) { console.log('the server did not start on port ' + port); server.kill(); process.exit(2); }

function shot(name, url, statsJs, extra = []) {
  const args = ['tools/shot3d.mjs', '--url', `http://localhost:${port}/${url}`, '--out', path.join(out, name + '.png'), '--gl', 'default', '--wait', '1500', ...extra];
  if (statsJs) args.push('--stats-js', statsJs);
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 300000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  return { text, errs, data };
}
const SLEEP = (ms) => `await new Promise(r=>setTimeout(r,${ms}));`;
// one host scenario: boot 8 bots, run `body` (page JS), return the numbers
const HOST = (body) => `(async()=>{ const b=document.getElementById('bots'); for(let i=0;i<2;i++) b.click(); ${SLEEP(500)} document.getElementById('castoff').click(); ${SLEEP(1500)} ${body} const st=window.view3dDebug().view.stats(); return JSON.stringify({calls:st.sceneCalls, tris:st.sceneTris, jsMs:st.jsMs, flyers:window.view3dDebug().view.flyers.stats(), glows:window.view3dDebug().view.glows.count, errors:window.gameErrors||[]}); })()`;
const budget = (label, r, extra) => {
  console.log('  errors ' + r.errs + '  ' + JSON.stringify(r.data));
  if (r.errs !== 0) fail('console errors: ' + label);
  if (!r.data) { fail('no numbers: ' + label); return; }
  if (r.data.errors.length) fail('game errors in ' + label + ': ' + r.data.errors.join(' | '));
  if (r.data.calls > 150) fail(label + ': more than 150 scene draw calls (' + r.data.calls + ')');
  if (r.data.tris > 450000) fail(label + ': more than 450k scene triangles (' + r.data.tris + ')');
  if (extra) extra(r.data);
};

try {
  for (const page of [1, 2, 3]) {
    console.log(`1.${page} enemy line-up, page ${page}`);
    const r = shot('lineup' + page, `three3d.html?shot=1&seed=5&warm=10&enemies=${page}&bots=2`, 'JSON.stringify({calls:window.__t3d.view.stats().sceneCalls, tris:window.__t3d.view.stats().sceneTris, flyers:window.__t3d.view.flyers.stats(), errors:window.gameErrors||[]})');
    budget('line-up ' + page, r, (d) => {
      const f = d.flyers;
      if (page === 1 && (f.planes < 6 || f.bats < 4 || f.mines < 3)) fail('page 1 is missing planes, bats or mines: ' + JSON.stringify(f));
      if (page === 2 && f.specials < 5) fail('page 2 is missing the specials: ' + JSON.stringify(f));
      if (page === 3 && f.boss < 4) fail('page 3 is missing bosses: ' + JSON.stringify(f));
    });
  }
  if (!quick) {
    console.log('2.1 host, 8 bots: a fight (the gunship, dogfighters, a bomber)');
    let r = shot('fight', 'host.html?view=3d', HOST(`W9m('open',2); ${SLEEP(2500)} game.gunship.spawn(); game.squadrons.spawnStrafers(); game.squadrons.spawnBomber(); ${SLEEP(14000)}`), ['--ready', 'window.__meter!==undefined', '--eval', 'window.W9m=(k,n)=>{game.course.startMission(n,{kind:k,environment:"skyisles",danger:2});game.state.ev.warn=0;};1']);
    budget('the fight', r);
    console.log('2.2 host, 8 bots: a cave with bats');
    r = shot('bats', 'host.html?view=3d', HOST(`game.course.startMission(2,{kind:'network',environment:'skyisles',danger:2}); ${SLEEP(3000)} game.squadrons.spawnBats(); ${SLEEP(9000)}`), ['--ready', 'window.__meter!==undefined']);
    budget('the bat cave', r, (d) => { if (d.flyers.bats < 1) fail('no bats were drawn'); });
    console.log('2.3 host, 8 bots: mines, a turret and an outpost near the ship');
    r = shot('mines', 'host.html?view=3d', HOST(`game.course.startMission(3,{kind:'open',environment:'skyisles',danger:2}); ${SLEEP(2500)} { const S=game.state, sh=S.ships[0], L=sh.layout, t=S.course.turrets.find(q=>q.x!=null); const mx=sh.pose.x+L.midPoint.x, my=sh.pose.y+L.midPoint.y; for (let i=0;i<4;i++) S.mines.push({x:mx+900+i*260,y:my-120+i*90,baseY:my-120+i*90,vx:0,bob:i}); for (let i=0;i<3;i++) S.laid.push({id:900+i,x:mx-700-i*220,y:my+250,vx:0,vy:0,age:i?6:0,drift:0,from:sh.id,bob:i}); } ${SLEEP(6000)} { const S=game.state, sh=S.ships[0], L=sh.layout, t=S.course.turrets.find(q=>q.x!=null); for (let i=0;i<20;i++){ sh.pose.x=t.x-760-L.midPoint.x; sh.pose.y=t.y-380-L.midPoint.y; t.dead=false; t.hp=6; t.cd=Math.min(t.cd,0.25); ${SLEEP(150)} } }`), ['--ready', 'window.__meter!==undefined']);
    budget('mines and turrets', r, (d) => { if (d.flyers.mines < 1) fail('no mines were drawn'); });
    console.log('2.4 host, 8 bots: the Flagship stop');
    r = shot('flagship', 'host.html?view=3d', HOST(`game.course.startMission(5,{kind:'open',environment:'skyisles',danger:2,stop:{id:'fl',col:7,name:'The Flagship',env:'skyisles',reward:100,flagship:true,lair:false}}); ${SLEEP(2500)} game.squadrons.spawnBoss(); ${SLEEP(6000)} { const S=game.state; for (let i=0;i<20;i++){ if (S.boss) { const sh=S.ships[0]; S.boss.x=sh.pose.x+sh.layout.midPoint.x+1200; S.boss.y=sh.pose.y+sh.layout.midPoint.y-300; } ${SLEEP(120)} } }`), ['--ready', 'window.__meter!==undefined']);
    budget('the Flagship', r, (d) => { if (d.flyers.boss < 1) fail('the Flagship was not drawn'); });
    console.log('2.5 host, 8 bots: the ship breaks up');
    r = shot('wreck', 'host.html?view=3d', HOST(`game.course.startMission(2,{kind:'open',environment:'skyisles',danger:2}); ${SLEEP(3000)} { const S=game.state; S.ship.hull=0; S.ship.down=8; S.wreck={t:0,lap:1,kills:0}; } ${SLEEP(4000)}`), ['--ready', 'window.__meter!==undefined']);
    budget('the wreck', r);
    console.log('2.6 host, Versus');
    const vs = `(async()=>{ ${SLEEP(20000)} const st=window.view3dDebug().view.stats(); return JSON.stringify({calls:st.sceneCalls, tris:st.sceneTris, jsMs:st.jsMs, flyers:window.view3dDebug().view.flyers.stats(), glows:window.view3dDebug().view.glows.count, errors:window.gameErrors||[]}); })()`;
    r = shot('versus', 'host.html?view=3d&versus=1&bots=4', vs, ['--ready', 'window.__meter!==undefined']);
    budget('Versus', r);
  }
  console.log('3. no-wobble lint');
  const l = spawnSync(process.execPath, ['tools/lint3d.mjs', '--list'], { cwd: root, encoding: 'utf8' });
  console.log('  ' + l.stdout.trim().split('\n').join('\n  '));
  if (l.status !== 0) fail('the no-wobble lint');
  if (/flyers\.js/.test(l.stdout)) fail('flyers.js still has a wobble-ok mark');
} finally {
  server.kill();
}
console.log(failed ? `\nENEMY 3D CHECK FAILED (${failed})  screenshots: ${out}` : `\nENEMY 3D CHECK PASSED  screenshots: ${out}`);
process.exit(failed ? 1 : 0);
