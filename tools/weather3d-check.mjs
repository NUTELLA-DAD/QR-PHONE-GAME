// WEATHER AND THE SEVEN ENVIRONMENTS (WP12) gate: the 3D view in a real headless Chrome (tools/shot3d.mjs). Starts its OWN server on a free port and stops it by its PID at the end (never kills node globally).
//   node tools/weather3d-check.mjs [--port N] [--quick] [--long] [--shots DIR] [--prefix wp12_] [--root DIR] [--no-checks] [--only storm,frost,...] [--tier medium]
//   --shots    saves one named screenshot per scene (DIR/<prefix><scene>.png); --root = another copy of the repo (a checkout of the commit before), whose checks are then skipped (--no-checks)
//   --long     adds a 60 second real-time run with 8 bots in each of the seven environments (0 console errors)
// The simulation is frozen between steps (window.game.update is a no-op) and advanced by hand with a seeded Math.random, so every moment is the same. Each scene sets the state the weather reads
// (storm strength, a gust, a charging bolt, ice crusts, heat, spore clouds, waterspouts ...) and looks at it. Every run must print 0 console errors. Checks (WP12 only):
//   storm: rain falls (view.weather.stats.mode 'rain'), the rods are drawn, a wet ship; frost: snow + crusts on the ship; ember: embers + lava; aether: stars + motes; fungal: spores; sea: spouts and rafts + pump
//   perf on Medium: the weather costs at most 2 draw calls (measured by switching it off in the same frame)
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
const shotDir = arg('shots', ''), prefix = arg('prefix', 'wp12_');
const tier = arg('tier', 'medium');
const only = (arg('only', '') || '').split(',').filter(Boolean);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'weather3d-'));
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
const boot = (steps = 300, seed = 7) => `(async()=>{ ${sl}
  let sd=${seed}; Math.random=()=>{ sd=(sd+0x6D2B79F5)|0; let t=Math.imul(sd^(sd>>>15),1|sd); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
  const g=window.game; window.__w12={}; window.__upd=g.update.bind(g); window.__step=(n)=>{ for(let i=0;i<n;i++) window.__upd(1/60); };
  const B=document.getElementById('bots'); B.click(); B.click(); await sl(300); document.getElementById('castoff').click(); g.update=()=>{}; window.__step(${steps}); return 1; })()`;
const view = (zoom, lift, tod) => `(()=>{ const S=window.view3dDebug().view.S; S.zoom=${zoom}; S.lift=${lift}; ${tod ? `S.tod='${tod}';` : ''} return 1 })()`;
// reads what the view drew, and the same frame with the weather switched off (the difference is what it costs)
const measure = (tag, off = true) => `(async()=>{ ${sl} const V=window.view3dDebug().view, w=V.weather;
  const med=(a)=>a.slice().sort((x,y)=>x-y)[a.length>>1];
  const snap=async()=>{ const s=[]; for(let i=0;i<7;i++){ s.push(V.stats()); await sl(110); } const v=V.stats(); return {calls:med(s.map(q=>q.calls)),sceneCalls:med(s.map(q=>q.sceneCalls)),tris:med(s.map(q=>q.tris)),jsMs:+med(s.map(q=>q.jsMs)).toFixed(2),gpu:v.gpu&&Object.fromEntries(Object.entries(v.gpu).map(([k,x])=>[k,+x.toFixed(2)]))}; };
  await sl(300);
  const r=window.__w12['${tag}']={ weather:w?JSON.parse(JSON.stringify(w.stats)):null, on:await snap(), errors:(window.gameErrors||[]).length };
  ${off ? `if(V.look&&w){ const k=V.look.weather; V.look.weather=false; await sl(900); r.off=await snap(); V.look.weather=k; await sl(500); }` : ''}
  return JSON.stringify(r); })()`;

// scene set-ups, run after the boot (the sim is frozen: what is set here stays)
const SCENES = {
  storm: {
    q: 'env=storm&kind=open', zoom: 0.62, lift: 40,
    setup: `(()=>{ const st=window.game.state, sh=st.ships[0], w=st.weather; w.storm=1; w.gust=110; w.gusting=true; w.gustIn=0; st.env.gale=1; st.env.windDir=1; st.env.wind=300; w.flash=0;
      const J=st.stormJob; J.charge={t:2.2,max:3.5,x:J.rods[0]?J.rods[0].x:700,held:false}; return 1 })()`,
  },
  frost: {
    q: 'env=frost&kind=open', zoom: 0.62, lift: 40,
    setup: `(()=>{ const st=window.game.state, sh=st.ships[0], L=sh.layout, open=L.outdoorDecks(); const d=open.length?open[0]:0;
      st.env.blizzard=0.7; st.env.wind=-200; st.env.windDir=-1; st.icing.length=0;
      st.icing.push({area:'gasbag',x:800,d:0,lvl:0.9,prog:0},{area:'gasbag',x:420,d:0,lvl:0.5,prog:0},{area:'topdeck',x:560,d,lvl:0.8,prog:0},{area:'topdeck',x:1100,d,lvl:0.4,prog:0});
      const g=Object.keys(st.GUNS||{})[0]; if(g) st.icing.push({area:'gun',gun:g,x:st.GUNS[g].bx||800,d,lvl:0.95,prog:0});
      st.ice.gasbag=0.8; st.ice.topdeck=0.6; st.ice.guns=0.95; return st.icing.length })()`,
  },
  ember: {
    q: 'env=ember&kind=open', zoom: 0.55, lift: -300,
    setup: `(()=>{ const st=window.game.state, sh=st.ships[0]; window.__step(2); const E=st.env; E.heat=0.8; E.smoke=0.5; if(Number.isFinite(E.lavaY)) { sh.pose.y=E.lavaY-640; sh.pose.vy=0; } return E.lavaY })()`,
  },
  aether: { q: 'env=aether&kind=open', zoom: 0.6, lift: 60, setup: `(()=>{ return 1 })()` },
  fungal: {
    q: 'env=fungal&kind=network', zoom: 0.5, lift: 0,
    setup: `(()=>{ const st=window.game.state; st.spores.push({x:700,y:300,rx:260,ry:150,vx:0,seed:1},{x:1250,y:560,rx:220,ry:130,vx:0,seed:2}); for(const c of st.clogs) c.lvl=0.9; return st.spores.length })()`,
  },
  sea: {
    q: 'env=sea&kind=open', zoom: 0.5, lift: -380,
    setup: `(()=>{ const st=window.game.state, sh=st.ships[0], s=st.sea; window.__step(2); const C=st.course; let sp=s.spouts[0]; const sv=s.survivors[0];
      const at=sp||sv; if(at){ const L=sh.layout; sh.pose.x=(sp?sp.x:sv.mx)-1900; sh.pose.y=s.y-1000; sh.pose.vy=0; }
      s.flood=0.5; s.pumped=0.3; s.spray=1; if(sv&&sp){ sv.mx=sp.x-700; } return JSON.stringify({sp:s.spouts.length,sv:s.survivors.length,y:s.y}) })()`,
  },
  strike: { // a bolt that a held rod takes: the flash, the bolt, sparks at the rod's tip (taken a moment after it arrives)
    q: 'env=storm&kind=open', zoom: 0.8, lift: 80, wait: 260, only: 'storm',
    setup: `(async()=>{ const st=window.game.state, sh=st.ships[0], w=st.weather, J=st.stormJob, pose=await import('/modules/host/pose.js'); w.storm=1; st.env.gale=0; st.env.wind=0; const r=J.rods[0]; r.held=1; J.charge=null;
      w.bolt={x:pose.toWorldX(sh,r.x+10),y:pose.toWorldY(sh,sh.layout.platforms[r.d].y-30),t:0.25}; w.flash=1; return 1 })()`,
  },
  rescue: { // a survivor on the rope: the winch, the rope, the haul bar
    q: 'env=sea&kind=open', zoom: 0.6, lift: -330, only: 'sea',
    setup: `(async()=>{ const st=window.game.state, sh=st.ships[0], s=st.sea, pose=await import('/modules/host/pose.js'); window.__step(2); const sv=s.survivors[0]; if(!sv) return 0;
      sh.layout.bombBay={x:420,y:sh.layout.platforms[sh.layout.deckIndex('lower')].y}; const bayWX=pose.toWorldX(sh,sh.layout.bombBay.x); sh.pose.x+=sv.mx-bayWX; sh.pose.y=s.y-1000; sh.pose.vy=0; window.__step(2); s.hook=sv; sv.prog=0.55; s.winch={x:420,d:sh.layout.deckIndex('lower'),obj:sv}; s.flood=0.25; return JSON.stringify({svx:sv.mx,bay:bayWX,px:sh.pose.x,py:sh.pose.y,sea:s.y,n:s.survivors.length,hook:!!s.hook}) })()`,
  },
  skyisles: { q: 'kind=open', zoom: 0.6, lift: 60, setup: `(()=>1)()` },
};

function run(name, query, steps, extra = []) {
  const file = path.join(out, name + '.json');
  fs.writeFileSync(file, JSON.stringify(steps));
  const args = [path.join(here, 'tools/shot3d.mjs'), '--url', `http://localhost:${port}/host.html?view=3d&tier=${tier}&${query}`, '--out', path.join(shotDir || out, (shotDir ? prefix.replace(/_$/, '') : 'shot') + '.png'), '--gl', 'default', '--wait', '1500', '--ready', 'window.__meter!==undefined', '--evals-file', file, '--size', '1600x900', '--stats-js', 'JSON.stringify(window.__w12||null)', ...extra];
  const r = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 420000 });
  const text = (r.stdout || '') + (r.stderr || '');
  const errs = Number((/console errors: (\d+)/.exec(text) || [])[1] ?? NaN);
  const m = /stats-js (".*")/.exec(text);
  let data = null;
  try { data = m ? JSON.parse(JSON.parse(m[1])) : null; } catch { data = null; }
  const evalErrors = (text.match(/EVAL ERROR/g) || []).length;
  if (has('verbose') || errs !== 0 || evalErrors) console.log(text.split('\n').filter((l) => /\[page\]|EVAL|FAILED/.test(l)).slice(0, 12).join('\n'));
  return { text, errs, data, evalErrors };
}
const shotName = (n) => (shotDir ? n : null);
const clean = (name, r) => { if (r.errs !== 0 || r.evalErrors) fail(name + ': console / eval errors (' + r.errs + ' / ' + r.evalErrors + ')'); };

try {
  for (const [name, S] of Object.entries(SCENES)) {
    if (!want(name) && !(S.only && want(S.only) && only.length && only.includes(name))) continue;
    console.log('scene ' + name);
    const r = run(name, S.q, [[boot(300), 300], [S.setup, 200], [view(arg('zoom', S.zoom), arg('lift', S.lift)), 300], [nap(S.wait || 1800), 100, shotName(name)], [measure(name), 100]]);
    const d = r.data && r.data[name];
    console.log(`  errors ${r.errs} evalErrors ${r.evalErrors}  ${JSON.stringify(d && d.weather)}  calls ${d && d.on.calls}/${d && d.off && d.off.calls} js ${d && d.on.jsMs}`);
    clean(name, r);
    if (noChecks) continue;
    const w = d && d.weather;
    if (!w) { fail(name + ': no weather module (view.weather)'); continue; }
    if (w.calls > 2) fail(name + ': the weather draws ' + w.calls + ' meshes (budget 2)');
    const need = { storm: ['rain', 'rods'], frost: ['snow', 'crusts'], ember: ['embers', 'lava'], aether: ['stars', 'motes'], fungal: ['spores'], sea: ['spouts', 'rafts', 'pump'] }[name] || [];
    for (const k of need) if (!(w[k] > 0)) fail(name + ': nothing drawn for ' + k + ' (' + JSON.stringify(w) + ')');
    if (name === 'skyisles' && w.calls > 0) fail('skyisles: the weather draws something (' + w.calls + ' calls)');
  }
  if (!quick && want('wetness')) {
    console.log('storm tiers and kill-switch');
    for (const q of ['tier=high', 'tier=low', 'look=noweather', 'look=nopost']) {
      const r = run('storm_' + q.replace(/\W/g, ''), 'env=storm&kind=open&' + q, [[boot(300), 300], [SCENES.storm.setup, 200], [view(0.62, 40), 300], [nap(900), 100]]);
      console.log(`  ${q}: errors ${r.errs} evalErrors ${r.evalErrors}`);
      clean(q, r);
    }
  }
  if (long) {
    for (const env of ['skyisles', 'frost', 'ember', 'fungal', 'aether', 'storm', 'sea']) {
      if (!want(env)) continue;
      console.log('long ' + env + ': 8 bots, 60 seconds in real time');
      const q = env === 'skyisles' ? 'kind=open' : `env=${env}`;
      const r = run('long_' + env, q, [[`(async()=>{ window.__w12={}; const b=document.getElementById('bots'); b.click(); b.click(); await new Promise(r=>setTimeout(r,500)); document.getElementById('castoff').click(); return 1; })()`, 30000], [`(()=>{ window.__w12.mid={ errs:window.gameErrors||[] }; return 1 })()`, 30000], [`(()=>{ const V=window.view3dDebug().view; window.__w12.end={ errs:window.gameErrors||[], calls:V.stats().sceneCalls, fps:window.__meter&&window.__meter.fps, w:V.weather&&V.weather.stats }; return 1 })()`, 100]]);
      console.log(`  errors ${r.errs} evalErrors ${r.evalErrors} ${JSON.stringify(r.data && r.data.end).slice(0, 300)}`);
      clean('long ' + env, r);
      if (r.data && ((r.data.end && r.data.end.errs.length) || (r.data.mid && r.data.mid.errs.length))) fail('long ' + env + ': game errors ' + JSON.stringify((r.data.end || r.data.mid).errs).slice(0, 200));
    }
  }
  console.log('  screenshots: ' + (shotDir || out));
} finally {
  try { server.kill(); } catch { /* (gone) */ }
  if (process.platform === 'win32') { try { spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* (gone) */ } }
}
console.log(failed ? 'FAILED: ' + failed : 'PASS weather3d-check');
process.exit(failed ? 1 : 0);
